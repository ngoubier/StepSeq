/*
 * Figer une piste en audio (bouton ❄ de la piste).
 *
 * Tout le son d'une page web est calculé sur UN seul fil audio : avec plusieurs synthés Juno, il ne suit plus et le
 * son décroche, quel que soit le nombre de cœurs du processeur. Une piste figée ne fait plus calculer son instrument :
 * elle est enregistrée une fois (rendu hors temps réel, js/render.js, comme Exporter l'audio), puis jouée depuis cet
 * enregistrement, pour un coût presque nul.
 *
 * Ce qui est enregistré : le son de l'instrument (notes, son, arpège, accords suivis, automation du son par pas et par
 * temps, humanisation), AVANT la tranche de console. Restent en direct : égaliseur et compresseur de la tranche,
 * panoramique, volume, Muet / Solo, effets de la piste (chorus, delay, reverb), envois, sidechain, Master.
 *
 * Un enregistrement par « segment » : un bloc de l'arrangement (scène × répétitions, avec son automation par temps)
 * et, pour le mode Scène, la boucle de chaque scène. Chaque enregistrement est rangé sous une clé de contenu
 * (empreinte de la piste et de la scène) : réordonner l'arrangement ne demande rien ; changer les accords d'une scène
 * ne fait réenregistrer que ses segments, en arrière-plan ; en attendant, ce segment joue en direct. Les
 * enregistrements sont gardés dans le navigateur (IndexedDB) : à la réouverture du projet, rien n'est recalculé.
 *
 * Piste figée : notes et réglages du son sont verrouillés (Dégeler pour les modifier ; rien n'est perdu).
 * project.tracks[i].freeze = { on: true } (figée) | { re: true } (dégelée pour une retouche, se refige seule).
 */
window.SS = window.SS || {};

SS.freeze = (() => {
  const PREROLL = 0.08; // js/audio.js begin() : le premier pas part à currentTime + 0,08 s
  const TAIL = 5; // queue enregistrée après la fin d'un segment (s), coupée au silence
  const MAX_REPS = 8; // mode Scène : boucle de plus de 8 fois la scène (pistes de longueurs différentes) : en direct
  const SILENCE = Math.pow(10, -80 / 20);
  const RETOUCH_MS = 8000; // « Dégeler et refiger après » : refigée après 8 s sans modification
  const AUTO_MS = 1200; // attente avant de réenregistrer les segments qui manquent

  const mem = new Map(); // clé de contenu -> AudioBuffer
  const index = new Map(); // trackId -> Map(lookup -> clé de contenu)
  const work = new Map(); // trackId -> { progress } pendant un enregistrement
  let app = null;
  let timer = null;
  let running = false;
  let retouchTimer = null;

  const isOn = (t) => !!(t && t.type === 'instrument' && t.freeze && t.freeze.on);
  const lookup = (sceneId, reps, bauto) => `${sceneId}|${reps}|${bauto || ''}`;

  /** Empreinte de contenu : deux hachages cyrb53 (graines différentes), environ 106 bits, en base 36. */
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const hash = (str) => cyrb53(str, 1) + '-' + cyrb53(str, 7);

  /* ================= Empreintes et segments ================= */

  // réglages qui agissent après l'instrument (en direct), ou rangés par scène (empreinte de la scène)
  const NOT_SOUND = new Set(['id', 'name', 'color', 'volume', 'pan', 'mute', 'solo', 'fx', 'mix', 'freeze', 'band', 'events', 'steps', 'rat', 'cond', 'auto', 'autoLen', 'lastFollow']);
  /** Ce qui fait le son de la piste, commun à toutes les scènes. */
  function trackSig(p, t) {
    const o = {};
    Object.keys(t)
      .sort()
      .forEach((k) => !NOT_SOUND.has(k) && (o[k] = t[k]));
    if (t.band && t.band.part) o.bandPart = true;
    return JSON.stringify([o, p.timeSig, p.groove || null, !!p.gm]);
  }
  /** Ce que la piste joue dans la scène `sc` (scène en cours : ses notes sont dans la piste). */
  function sceneSig(p, t, sc) {
    const cur = sc.id === p.current;
    const d = cur ? { events: t.events, auto: t.auto, autoLen: t.autoLen } : (sc.data && sc.data[t.id]) || {};
    return JSON.stringify([cur ? p.bars : sc.bars, SS.tempoOf(p, sc), !!SS.sceneMuted(p, t, sc), sc.key || null, t.follow ? sc.grid || null : null, d.events || [], d.auto || null, d.autoLen || null]);
  }
  const barsOf = (p, sc) => (sc.id === p.current ? p.bars : sc.bars);
  /** Mode Scène : nombre de passages de la scène avant que toutes les pistes se réalignent (js/audio.js seq.cycle). */
  function loopReps(p, sc) {
    const total = SS.stepsPerBar(p) * barsOf(p, sc);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let l = total;
    for (const t of p.tracks) {
      const n = t.length > 0 ? Math.min(t.length, total) : total;
      l = (l * n) / gcd(l, n);
      if (l > total * MAX_REPS) return 0;
    }
    return l / total;
  }
  /** Segments à enregistrer pour une piste : [{ lookup, key, scene, repeat, bauto }]. */
  function segments(p, t) {
    const base = trackSig(p, t);
    const sigs = new Map();
    const sigOf = (sc) => {
      if (!sigs.has(sc.id)) sigs.set(sc.id, sceneSig(p, t, sc));
      return sigs.get(sc.id);
    };
    const out = new Map();
    const add = (sc, repeat, bauto) => {
      const bj = bauto ? JSON.stringify(bauto) : '';
      const lk = lookup(sc.id, repeat, bj);
      if (out.has(lk)) return;
      out.set(lk, { lookup: lk, key: hash(base + '|' + sigOf(sc) + '|' + repeat + '|' + bj), scene: sc.id, repeat, bauto: bauto || null });
    };
    for (const b of p.song || []) {
      const sc = p.scenes.find((x) => x.id === b.scene);
      if (sc) add(sc, b.repeat, b.bauto && b.bauto[t.id]);
    }
    for (const sc of p.scenes) {
      const r = loopReps(p, sc);
      if (r) add(sc, r, null);
    }
    return [...out.values()];
  }

  /* ================= Mémoire du navigateur (IndexedDB) ================= */

  const DB = 'stepseq-freeze';
  const writes = new Set(); // écritures en cours
  let dbp = null;
  function db() {
    if (!dbp)
      dbp = new Promise((res) => {
        try {
          const r = indexedDB.open(DB, 1);
          r.onupgradeneeded = () => r.result.createObjectStore('seg');
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
        } catch (e) {
          res(null);
        }
      });
    return dbp;
  }
  async function idbGet(key) {
    const d = await db();
    if (!d) return null;
    return new Promise((res) => {
      try {
        const r = d.transaction('seg').objectStore('seg').get(key);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => res(null);
      } catch (e) {
        res(null);
      }
    });
  }
  async function idbPut(key, val) {
    const d = await db();
    if (!d) return;
    try {
      const tx = d.transaction('seg', 'readwrite');
      tx.objectStore('seg').put(val, key);
      const w = new Promise((res) => {
        tx.oncomplete = tx.onabort = tx.onerror = res;
      });
      writes.add(w);
      w.then(() => writes.delete(w));
    } catch (e) {
      /* stockage plein ou indisponible : l'enregistrement reste en mémoire */
    }
  }
  /** Ménage : les enregistrements qui ne servent plus depuis 30 jours. */
  async function idbPrune() {
    const d = await db();
    if (!d) return;
    try {
      const old = Date.now() - 30 * 864e5;
      const r = d.transaction('seg', 'readwrite').objectStore('seg').openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return;
        if (!c.value || !(c.value.at > old)) c.delete();
        c.continue();
      };
    } catch (e) {
      /* rien */
    }
  }

  function toBuffer(key, l, r, sr) {
    const b = new AudioBuffer({ numberOfChannels: 2, length: l.length, sampleRate: sr });
    b.copyToChannel(l, 0);
    b.copyToChannel(r, 1);
    b.__key = key;
    return b;
  }

  /* ================= Enregistrement ================= */

  const pickRate = () => {
    const c = SS.audio && SS.audio.ensureCtx ? SS.audio.ensureCtx() : null;
    return c && c.sampleRate === 44100 ? 44100 : 48000;
  };

  /**
   * Projet envoyé au cadre de rendu pour enregistrer les segments `segs` de la piste `t` : la piste seule, les blocs
   * l'un après l'autre, séparés par une scène vide assez longue pour que la queue de chacun s'éteigne.
   * Retourne { json, seconds, offs: [[début du segment (s), durée (s)]] }.
   */
  function prepare(p, t, segs) {
    const data = JSON.parse(SS.serialize(p, { wizard: false }));
    const tr = data.tracks.find((x) => x.id === t.id);
    delete tr.freeze;
    tr.mute = false;
    tr.solo = false;
    data.tracks = [tr];
    const spb = SS.stepsPerBar(data);
    const GAP_TEMPO = 120;
    const gapBars = Math.ceil((TAIL + PREROLL + 0.3) / ((spb * 60) / GAP_TEMPO / 4));
    const gap = { id: 'frzgap', name: 'gap', bars: gapBars, tempo: GAP_TEMPO, data: {} };
    const gapSec = (gapBars * spb * 60) / GAP_TEMPO / 4;
    data.scenes = data.scenes
      .filter((sc) => segs.some((s) => s.scene === sc.id))
      .map((sc) => ({ ...sc, data: sc.data && sc.data[t.id] ? { [t.id]: sc.data[t.id] } : {} }));
    data.scenes.push(gap);
    data.song = [];
    const offs = [];
    let at = PREROLL;
    for (const s of segs) {
      const sc = data.scenes.find((x) => x.id === s.scene);
      const secs = (s.repeat * spb * sc.bars * 60) / SS.tempoOf(data, sc) / 4;
      data.song.push({ scene: s.scene, repeat: s.repeat, ...(s.bauto ? { bauto: { [t.id]: s.bauto } } : {}) });
      offs.push([at, secs]);
      at += secs;
      data.song.push({ scene: gap.id, repeat: 1 });
      at += gapSec;
    }
    data.current = data.song[0].scene;
    data.bars = data.scenes.find((x) => x.id === data.current).bars;
    data.playMode = 'song';
    data.songLoop = false;
    delete data.wizard;
    return { json: JSON.stringify(data), seconds: at + 0.1, offs };
  }

  /** Découpe un segment dans le rendu : pré-roll, segment, puis sa queue jusqu'au silence. */
  function slice(L, R, sr, start, secs) {
    const from = Math.max(0, Math.round((start - PREROLL) * sr));
    const body = from + Math.round((PREROLL + secs) * sr);
    const max = Math.min(L.length, Math.round((start + secs + TAIL) * sr));
    let end = body;
    for (let i = max - 1; i >= body; i--)
      if (Math.abs(L[i]) > SILENCE || Math.abs(R[i]) > SILENCE) {
        end = i + 1;
        break;
      }
    end = Math.min(max, Math.max(end, body));
    const l = L.slice(from, end);
    const r = R.slice(from, end);
    // la queue coupée net au bout du rendu : petit fondu (20 ms)
    if (end === max) {
      const n = Math.min(l.length, Math.round(0.02 * sr));
      for (let i = 0; i < n; i++) {
        const g = i / n;
        l[l.length - 1 - i] *= g;
        r[r.length - 1 - i] *= g;
      }
    }
    return { l, r };
  }

  async function record(p, t, segs) {
    const sr = pickRate();
    const prep = prepare(p, t, segs);
    const w = work.get(t.id);
    const out = await SS.render.renderOnce(prep.json, { seconds: prep.seconds, sampleRate: sr, seed: 0x5eed, tap: t.id }, { onProgress: (f) => w && ((w.progress = f), notify(t.id)) });
    segs.forEach((s, i) => {
      const { l, r } = slice(out.left, out.right, out.sampleRate, prep.offs[i][0], prep.offs[i][1]);
      mem.set(s.key, toBuffer(s.key, l, r, out.sampleRate));
      idbPut(s.key, { l, r, sr: out.sampleRate, at: Date.now() });
    });
  }

  /** Segments qui manquent : d'abord la mémoire du navigateur, puis un enregistrement. */
  async function fill(p, t) {
    const seen = new Set();
    // deux segments de même contenu (boucle de la scène et bloc joué une fois) : un seul enregistrement
    const missing = segments(p, t).filter((s) => !mem.has(s.key) && !seen.has(s.key) && seen.add(s.key));
    if (!missing.length) return true;
    let ok = true;
    work.set(t.id, { progress: 0 });
    notify(t.id);
    try {
      const rest = [];
      for (const s of missing) {
        const v = await idbGet(s.key);
        if (v && v.l && v.r) {
          mem.set(s.key, toBuffer(s.key, v.l, v.r, v.sr));
          idbPut(s.key, { ...v, at: Date.now() });
        } else rest.push(s);
      }
      if (rest.length) await record(p, t, rest);
    } catch (e) {
      ok = false;
      console.warn('Figer : enregistrement impossible', e);
      if (app && app.toast) app.toast(`« ${t.name} » n’a pas pu être figée : elle joue en direct.`, 4000);
    } finally {
      work.delete(t.id);
      refresh(p, { quiet: true });
      if (app && app.renderTrack && app.project().tracks.includes(t)) app.renderTrack(t);
    }
    return ok;
  }

  /** Une piste à la fois, en arrière-plan. */
  const failed = new Set(); // pistes dont l'enregistrement a échoué : on ne réessaie qu'après une modification
  async function pump() {
    if (running || !app) return;
    running = true;
    try {
      for (let n = 0; n < 64; n++) {
        const p = app.project();
        const t = p.tracks.find((x) => isOn(x) && !failed.has(x.id) && segments(p, x).some((s) => !mem.has(s.key)));
        if (!t) break;
        if (!(await fill(p, t))) failed.add(t.id);
      }
    } finally {
      running = false;
    }
  }
  function schedule(ms = AUTO_MS) {
    clearTimeout(timer);
    timer = setTimeout(pump, ms);
  }

  /* ================= État ================= */

  /**
   * Recalcule les clés des pistes figées (après chaque modification) ; les segments qui manquent seront enregistrés
   * en arrière-plan. Les pistes « dégelées pour une retouche » se refigent après RETOUCH_MS sans modification.
   */
  function refresh(p, { quiet = false } = {}) {
    if (!p) return;
    let missing = false;
    const ids = new Set();
    for (const t of p.tracks) {
      if (!isOn(t)) continue;
      ids.add(t.id);
      const m = new Map();
      for (const s of segments(p, t)) {
        m.set(s.lookup, s.key);
        if (!mem.has(s.key)) missing = true;
      }
      index.set(t.id, m);
    }
    [...index.keys()].forEach((id) => !ids.has(id) && index.delete(id));
    if (!quiet) failed.clear();
    if (missing && !quiet) schedule();
    if (!quiet) {
      clearTimeout(retouchTimer);
      if (p.tracks.some((t) => t.freeze && t.freeze.re))
        retouchTimer = setTimeout(() => {
          const q = app && app.project();
          if (!q) return;
          const back = q.tracks.filter((t) => t.freeze && t.freeze.re);
          if (!back.length) return;
          back.forEach((t) => (t.freeze = { on: true }));
          app.changed();
          back.forEach((t) => app.renderTrack(t));
        }, RETOUCH_MS);
    }
    p.tracks.forEach((t) => notify(t.id));
  }

  /** Enregistrement à jouer pour ce segment (null : la piste joue en direct). */
  function bufferFor(trackId, lk) {
    const m = index.get(trackId);
    const key = m && m.get(lk);
    return key ? mem.get(key) || null : null;
  }

  /** 'off' | 'busy' (enregistrement en cours) | 'partial' (des segments manquent) | 'on' | 'retouch'. */
  function state(t) {
    if (!t || t.type !== 'instrument') return 'off';
    if (t.freeze && t.freeze.re) return 'retouch';
    if (!isOn(t)) return 'off';
    if (work.has(t.id)) return 'busy';
    const m = index.get(t.id);
    if (!m || [...m.values()].some((k) => !mem.has(k))) return 'partial';
    return 'on';
  }

  /* ================= Interface ================= */

  const LABEL = {
    off: 'Figer la piste en audio : son et notes enregistrés, presque plus de calcul',
    busy: 'Enregistrement de la piste en cours…',
    partial: 'Piste figée : des passages ont changé, ils sont réenregistrés (en attendant, ils jouent en direct)',
    on: 'Piste figée : clic pour la dégeler',
    retouch: 'Dégelée pour une retouche : elle se refige seule. Clic pour la refiger tout de suite',
  };
  function notify(id) {
    const p = app && app.project();
    const t = p && p.tracks.find((x) => x.id === id);
    if (!t) return;
    document.querySelectorAll(`.track[data-id="${CSS.escape(id)}"]`).forEach((el) => decorate(el, t));
  }
  function decorate(el, t) {
    const s = state(t);
    el.classList.toggle('frozen', s !== 'off' && s !== 'retouch');
    const b = el.querySelector('.th-frz');
    if (!b) return;
    b.className = 'th-btn th-frz' + (s === 'off' ? '' : ' ' + s);
    b.title = LABEL[s];
    b.setAttribute('aria-pressed', String(s !== 'off' && s !== 'retouch'));
    const w = work.get(t.id);
    b.style.setProperty('--frz', w ? Math.round(w.progress * 100) + '%' : '0%');
  }

  function setOn(t, on) {
    if (on) t.freeze = { on: true };
    else delete t.freeze;
    if (!on && SS.audio.stopFrozen) SS.audio.stopFrozen(t.id);
    app.changed();
    app.renderTrack(t);
    if (on) schedule(50);
  }

  function toggle(t) {
    const s = state(t);
    if (s === 'off' || s === 'retouch') return setOn(t, true);
    setOn(t, false);
  }

  /** Bouton ❄ de l'en-tête de piste (pistes instrument). */
  function button(t) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'th-btn th-frz';
    b.textContent = '❄';
    b.setAttribute('aria-label', `Figer la piste ${t.name}`);
    b.addEventListener('click', () => toggle(t));
    return b;
  }

  let dlg = null;
  /** Une modification de notes ou de son sur une piste figée : proposer de la dégeler. */
  function locked(t) {
    if (dlg) dlg.remove();
    dlg = document.createElement('dialog');
    dlg.className = 'frz-dialog';
    dlg.innerHTML = `<h3><span class="frz-ico">❄</span> <span class="frz-name"></span> est figée</h3>
      <p class="frz-sub">Notes et réglages conservés</p>
      <div class="frz-foot"><button type="button" class="frz-cancel">Annuler</button><button type="button" class="frz-thaw">Dégeler</button><button type="button" class="frz-retouch primary">Dégeler et refiger après</button></div>`;
    dlg.querySelector('.frz-name').textContent = `« ${t.name} »`;
    const help = SS.helpTip ? SS.helpTip('Une piste figée est jouée depuis son enregistrement : ses notes et son son ne se modifient pas. Dégeler la remet en direct. « Dégeler et refiger après » : elle se refige seule 8 secondes après ta dernière retouche.', 'Piste figée') : null;
    if (help) dlg.querySelector('h3').append(' ', help);
    const close = () => {
      dlg.close();
      dlg.remove();
      dlg = null;
    };
    dlg.querySelector('.frz-cancel').onclick = close;
    dlg.querySelector('.frz-thaw').onclick = () => {
      close();
      setOn(t, false);
    };
    dlg.querySelector('.frz-retouch').onclick = () => {
      close();
      t.freeze = { re: true };
      if (SS.audio.stopFrozen) SS.audio.stopFrozen(t.id);
      app.changed();
      app.renderTrack(t);
    };
    dlg.addEventListener('cancel', () => {
      dlg = null;
    });
    document.body.append(dlg);
    dlg.showModal();
    return true;
  }
  /** Pour les gestes d'édition : true si la piste est figée (la fenêtre Dégeler est ouverte). */
  const guard = (t) => (isOn(t) ? locked(t) : false);

  /** Forme d'onde de la scène en cours sur la grille d'une piste figée. */
  function wave(t, grid) {
    const p = app && app.project();
    if (!p || !isOn(t)) return;
    const sc = p.scenes.find((x) => x.id === p.current);
    if (!sc) return;
    const reps = loopReps(p, sc) || 1;
    let buf = bufferFor(t.id, lookup(sc.id, reps, ''));
    if (!buf) {
      const b = (p.song || []).find((x) => x.scene === sc.id);
      if (b) buf = bufferFor(t.id, lookup(sc.id, b.repeat, b.bauto && b.bauto[t.id] ? JSON.stringify(b.bauto[t.id]) : ''));
    }
    if (!buf) return;
    const c = document.createElement('canvas');
    c.className = 'frz-wave';
    grid.append(c);
    requestAnimationFrame(() => {
      const w = Math.max(1, grid.scrollWidth);
      const hgt = Math.max(1, grid.clientHeight);
      c.width = Math.min(4096, w);
      c.height = hgt;
      c.style.width = w + 'px';
      const g = c.getContext('2d');
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const sr = buf.sampleRate;
      const from = Math.round(PREROLL * sr);
      const len = Math.round(((SS.totalSteps(p) * 60) / SS.tempoOf(p) / 4) * sr);
      const per = len / c.width;
      let peak = 1e-6;
      const col = [];
      for (let x = 0; x < c.width; x++) {
        let m = 0;
        const a = from + Math.floor(x * per);
        const e = Math.min(L.length, from + Math.floor((x + 1) * per));
        for (let i = a; i < e; i += 4) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
        col.push(m);
        peak = Math.max(peak, m);
      }
      g.fillStyle = 'rgba(127, 212, 255, 0.55)';
      const mid = hgt / 2;
      col.forEach((m, x) => {
        const y = (m / peak) * (hgt / 2 - 3);
        g.fillRect(x, mid - y, 1, Math.max(1, y * 2));
      });
    });
  }

  function init(a) {
    app = a;
    idbPrune();
    refresh(app.project());
  }

  /** Figer / dégeler (outils pour Claude, tests). */
  function set(t, on) {
    if (!t || t.type !== 'instrument') return false;
    setOn(t, !!on);
    return true;
  }
  /** Attend que toutes les pistes figées aient leurs enregistrements (tests, outils). */
  async function ready(timeoutMs = 120000) {
    const t0 = Date.now();
    for (;;) {
      const p = app.project();
      const pending = p.tracks.some((t) => isOn(t) && segments(p, t).some((s) => !mem.has(s.key)));
      if (!pending && !running) {
        await Promise.all([...writes]); // enregistrements bien rangés dans le navigateur
        return true;
      }
      if (Date.now() - t0 > timeoutMs) return false;
      if (!running) schedule(0);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return { PREROLL, TAIL, MAX_REPS, isOn, lookup, bufferFor, refresh, state, button, decorate, guard, locked, wave, init, set, ready, segments, prepare, slice, hash, trackSig, sceneSig, loopReps, _mem: mem };
})();
