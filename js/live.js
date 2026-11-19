/*
 * Jeu en direct et enregistrement : clavier de l'ordinateur (et, à l'étape suivante, clavier MIDI).
 *
 * Toute source de notes passe par la même porte :
 *   SS.live.noteOn(src, midi, vel)   // src : identifiant de la touche (« key:KeyQ », plus tard « midi:… »), vel 0..1
 *   SS.live.noteOff(src)
 * La note est jouée sur la piste armée (bouton ● de la piste, visible en mode Jouer), tenue jusqu'au relâchement
 * (SS.audio.liveNoteOn / liveNoteOff). Pendant l'enregistrement, elle est inscrite dans la piste à la position jouée
 * (SS.audio.stepAt), avec sa vélocité et sa durée : « Jeu gardé » la place sur la double-croche la plus proche et
 * garde son décalage (ev.shift, comme l'import MIDI) ; sinon elle est calée sur 1/16, 1/8 ou 1/4.
 * La scène tourne en boucle : Fusionner ajoute chaque tour, Remplacer efface la piste au premier coup d'un tour.
 * Un enregistrement entier forme une seule étape d'annulation (app.changed() à la fin seulement).
 *
 * Parties pures (testées) : SS.live.place(start, end, quant, n) et SS.live.writeNote(track, note, n).
 */
window.SS = window.SS || {};
SS.live = (() => {
  // touches physiques (event.code) : valables en AZERTY comme en QWERTY ; décalage en demi-tons (même clavier que le Juno)
  const KEYMAP = [
    ['KeyZ', 0], ['KeyS', 1], ['KeyX', 2], ['KeyD', 3], ['KeyC', 4], ['KeyV', 5], ['KeyG', 6], ['KeyB', 7], ['KeyH', 8], ['KeyN', 9], ['KeyJ', 10], ['KeyM', 11],
    ['KeyQ', 12], ['Digit2', 13], ['KeyW', 14], ['Digit3', 15], ['KeyE', 16], ['KeyR', 17], ['Digit5', 18], ['KeyT', 19], ['Digit6', 20], ['KeyY', 21], ['Digit7', 22], ['KeyU', 23],
    ['KeyI', 24],
  ];
  // lettres affichées par défaut (AZERTY) ; remplacées par la disposition réelle quand le navigateur la donne
  const AZERTY = {
    KeyZ: 'W', KeyS: 'S', KeyX: 'X', KeyD: 'D', KeyC: 'C', KeyV: 'V', KeyG: 'G', KeyB: 'B', KeyH: 'H', KeyN: 'N', KeyJ: 'J', KeyM: ',',
    KeyQ: 'A', Digit2: 'É', KeyW: 'Z', Digit3: '"', KeyE: 'E', KeyR: 'R', Digit5: '(', KeyT: 'T', Digit6: '-', KeyY: 'Y', Digit7: 'È', KeyU: 'U', KeyI: 'I',
  };
  const NOTE_OF = new Map(KEYMAP);
  const CODE_OF = new Map(KEYMAP.map(([c, n]) => [n, c]));
  const QUANTS = [
    { v: 0, label: 'Jeu gardé', title: 'Sur la double-croche la plus proche, avec le petit décalage du jeu (comme l’import MIDI)' },
    { v: 1, label: '1/16', title: 'Calé sur la double-croche' },
    { v: 2, label: '1/8', title: 'Calé sur la croche' },
    { v: 4, label: '1/4', title: 'Calé sur la noire' },
  ];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------------- Placement (pur) ---------------- */

  /**
   * Note jouée de `start` à `end` (positions en pas, continues) -> { step, len, shift? } dans une piste de `n` pas.
   * quant 0 : double-croche la plus proche + décalage gardé ; 1, 2, 4 : calée sur 1/16, 1/8, 1/4.
   * La note ne déborde pas de la fin de la boucle de la piste.
   */
  function place(start, end, quant, n) {
    let s;
    let len;
    let shift = 0;
    if (quant > 0) {
      s = Math.round(start / quant) * quant;
      len = Math.max(quant, Math.round((end - start) / quant) * quant);
    } else {
      s = Math.round(start);
      shift = r2(clamp(start - s, -SS.SHIFT_MAX, SS.SHIFT_MAX));
      len = Math.max(1, Math.round(end - start));
    }
    const step = ((s % n) + n) % n;
    const out = { step, len: Math.min(len, n - step) };
    if (shift) out.shift = shift;
    return out;
  }

  /**
   * Inscrit une note { step, len, shift?, midi, vel } dans la piste (instrument : événements ; batterie : pas).
   * La même hauteur déjà présente au même pas est remplacée ; les notes de même pas, durée, vélocité et décalage
   * forment un accord (un seul événement), comme à l'import MIDI.
   */
  function writeNote(track, note) {
    if (track.type === 'drum') {
      track.steps[note.step] = Math.max(0.05, r2(note.vel));
      return;
    }
    const vel = Math.max(0.05, r2(note.vel));
    const shift = note.shift || 0;
    track.events.forEach((e) => {
      if (e.step === note.step && e.notes.includes(note.midi)) e.notes = e.notes.filter((m) => m !== note.midi);
    });
    track.events = track.events.filter((e) => e.notes.length);
    const same = track.events.find((e) => e.step === note.step && e.len === note.len && e.vel === vel && (e.shift || 0) === shift && !e.chord);
    if (same) same.notes = [...same.notes, note.midi].sort((a, b) => a - b);
    else track.events.push(SS.cleanShift({ step: note.step, len: note.len, notes: [note.midi], vel, shift }));
    track.events.sort((a, b) => a.step - b.step);
  }

  /** Efface la piste (mode Remplacer). */
  function wipe(track) {
    if (track.type === 'drum') track.steps = track.steps.map(() => 0);
    else track.events = [];
  }

  /* ---------------- État ---------------- */

  const PREFS_KEY = 'stepseq.live';
  const st = {
    on: false,
    armed: null, // id de la piste armée
    oct: 3, // do le plus grave = C3
    vel: 96, // 1..127
    mode: 'merge', // 'merge' | 'replace'
    quant: 0,
    countIn: true,
    metro: true,
    rec: false,
    take: null, // { trackId, wiped (tour déjà effacé), wrote }
  };
  (() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      ['oct', 'vel', 'mode', 'quant', 'countIn', 'metro'].forEach((k) => p[k] !== undefined && (st[k] = p[k]));
    } catch (e) {
      /* stockage indisponible */
    }
  })();
  function savePrefs() {
    try {
      const { oct, vel, mode, quant, countIn, metro } = st;
      localStorage.setItem(PREFS_KEY, JSON.stringify({ oct, vel, mode, quant, countIn, metro }));
    } catch (e) {
      /* ignore */
    }
  }

  let app = null; // { project, changed, play }
  const held = new Map(); // src -> { midi, n, track, handle, start, vel }
  const $ = (q) => document.querySelector(q);

  const project = () => app && app.project();
  const armedTrack = () => {
    const p = project();
    return (p && st.armed && p.tracks.find((t) => t.id === st.armed)) || null;
  };
  const wizard = () => !!(SS.band && SS.band.active && SS.band.active());

  /** Position jouée maintenant (en pas, continue), ou null hors lecture. */
  const posNow = () => (SS.audio.isPlaying() ? SS.audio.stepAt(SS.audio.heardTime()) : null);

  /* ---------------- Notes ---------------- */

  function noteOn(src, midi, vel) {
    if (held.has(src)) return;
    const track = armedTrack();
    if (!track) return;
    const handle = SS.audio.liveNoteOn(track, midi, vel);
    let start = st.rec ? posNow() : null;
    if (start != null && start < -0.5) start = null; // pendant le décompte : on joue sans enregistrer
    const h = { midi, track, handle, start, vel };
    held.set(src, h);
    keyLight(midi, true);
    if (start == null) return;
    const n = SS.trackLen(project(), track);
    if (st.mode === 'replace' && st.take) {
      const pass = Math.floor(Math.round(start) / n);
      if (st.take.wiped !== pass) {
        st.take.wiped = pass;
        wipe(track);
        st.take.wrote = true;
      }
    }
    // batterie : un coup, inscrit tout de suite
    if (track.type === 'drum') {
      record(h, start + 0.5);
      h.start = null;
    }
  }

  function noteOff(src) {
    const h = held.get(src);
    if (!h) return;
    held.delete(src);
    SS.audio.liveNoteOff(h.track, h.handle);
    if (![...held.values()].some((x) => x.midi === h.midi)) keyLight(h.midi, false);
    if (h.start == null || !st.rec) return;
    const end = posNow();
    record(h, end == null ? h.start + 1 : Math.max(end, h.start + 0.05));
  }

  function record(h, end) {
    const p = project();
    if (!p.tracks.includes(h.track)) return;
    const n = SS.trackLen(p, h.track);
    const q = h.track.type === 'drum' ? Math.max(1, st.quant) : st.quant;
    writeNote(h.track, { ...place(h.start, end, q, n), midi: h.midi, vel: h.vel });
    if (st.take) st.take.wrote = true;
    SS.ui.renderTrack(h.track);
  }

  function releaseAll() {
    [...held.keys()].forEach(noteOff);
  }

  /* ---------------- Enregistrement ---------------- */

  let watch = null;
  function startRec() {
    if (!st.on) setOn(true);
    if (!st.on) return;
    if (SS.audio.isSongPlaying()) {
      SS.ui.toast('L’enregistrement se fait sur la scène en boucle : arrête la lecture du morceau (mode Song) et relance.', 5000);
      return;
    }
    const track = armedTrack();
    if (!track) {
      SS.ui.toast('Arme d’abord une piste (bouton ● dans l’en-tête de la piste).', 4000);
      return;
    }
    releaseAll();
    st.rec = true;
    st.take = { trackId: track.id, wiped: null, wrote: false };
    SS.audio.setMetronome(st.metro);
    if (!SS.audio.isPlaying()) {
      if (SS.audio.isPaused()) SS.audio.stop();
      app.play({ loop: true, preroll: st.countIn ? SS.stepsPerBar(project()) : 0 });
    }
    clearInterval(watch);
    watch = setInterval(watchRec, 100);
    syncUi();
  }

  function stopRec() {
    if (!st.rec) return;
    releaseAll(); // les notes tenues sont inscrites jusqu'ici
    st.rec = false;
    SS.audio.setMetronome(false);
    clearInterval(watch);
    watch = null;
    const take = st.take;
    st.take = null;
    if (take && take.wrote) app.changed(); // une seule étape d'annulation pour tout l'enregistrement
    syncUi();
  }

  const toggleRec = () => (st.rec ? stopRec() : startRec());

  /** Pendant l'enregistrement : décompte affiché, arrêt avec la lecture. */
  function watchRec() {
    if (!SS.audio.isPlaying() && !SS.audio.isLoading()) return stopRec();
    const pos = posNow();
    const status = $('#kbStatus');
    if (!status) return;
    if (pos == null || pos < 0) {
      const beats = pos == null ? 0 : Math.ceil(-pos / 4);
      status.textContent = beats ? `Décompte… ${beats}` : 'Chargement des sons…';
    } else {
      const n = armedTrack() ? SS.trackLen(project(), armedTrack()) : SS.totalSteps(project());
      status.textContent = `● Enregistrement · tour ${Math.floor(pos / n) + 1} · ${st.mode === 'merge' ? 'Fusionner' : 'Remplacer'}`;
    }
  }

  /* ---------------- Piste armée, mode Jouer ---------------- */

  function arm(id) {
    if (st.rec && id !== st.armed) stopRec();
    releaseAll();
    st.armed = id;
    document.querySelectorAll('#tracks .track').forEach((el) => {
      const on = el.dataset.id === id;
      el.classList.toggle('armed', on);
      const b = el.querySelector('.th-btn.arm');
      if (b) {
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
      }
    });
    preload();
    syncUi();
  }

  /** Charge à l'avance les sons des deux octaves jouables (échantillons multiples). */
  function preload() {
    const t = armedTrack();
    if (!t) return;
    const lo = (st.oct + 1) * 12;
    SS.audio.preparePreview(t, t.type === 'drum' ? null : Array.from({ length: 25 }, (_, i) => lo + i)).catch(() => {});
  }

  function setOn(on) {
    if (on && wizard()) return;
    if (!on) {
      stopRec();
      releaseAll();
    }
    st.on = on;
    document.body.classList.toggle('kb-on', on);
    if (on && !armedTrack()) {
      // piste armée par défaut : la piste active, sinon la première piste mélodique
      const p = project();
      const a = SS.ui.activeTrack && SS.ui.activeTrack();
      const t = a || p.tracks.find((x) => x.type !== 'drum') || p.tracks[0];
      if (t) arm(t.id);
    }
    syncUi();
  }

  function setOct(o) {
    releaseAll();
    st.oct = clamp(o, 0, 6);
    savePrefs();
    preload();
    syncUi();
  }
  function setVel(v) {
    st.vel = clamp(Math.round(v), 1, 127);
    savePrefs();
    syncUi();
  }

  /* ---------------- Clavier de l'ordinateur ---------------- */

  const textField = (el) =>
    el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)));
  const blocked = (e) => textField(e.target) || !!document.querySelector('dialog[open]') || document.body.classList.contains('mixer-open') || wizard();

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || blocked(e)) return;
    if (e.code === 'Backquote') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) setOn(!st.on);
      return;
    }
    if (!st.on) return;
    const act = {
      Enter: () => !e.repeat && toggleRec(),
      ArrowLeft: () => setOct(st.oct - 1),
      ArrowRight: () => setOct(st.oct + 1),
      ArrowUp: () => setVel(st.vel + 8),
      ArrowDown: () => setVel(st.vel - 8),
    }[e.code];
    const n = NOTE_OF.get(e.code);
    if (!act && n == null) return;
    e.preventDefault();
    e.stopPropagation(); // les lettres ne déclenchent pas les raccourcis de la grille
    if (act) return act();
    if (e.repeat) return;
    noteOn('key:' + e.code, (st.oct + 1) * 12 + n, e.shiftKey ? 1 : st.vel / 127);
  }
  function onKeyUp(e) {
    if (!held.has('key:' + e.code)) return;
    e.preventDefault();
    noteOff('key:' + e.code);
  }

  /* ---------------- Bandeau du bas ---------------- */

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(String(c))));
    return el;
  }
  const keyEls = new Map(); // demi-ton (0..24) -> touche
  function keyLight(midi, on) {
    const k = keyEls.get(midi - (st.oct + 1) * 12);
    if (k) k.classList.toggle('down', on);
  }

  function seg(id, items, value, set) {
    return h('div', { class: 'kb-seg', id, role: 'group' },
      items.map((it) => h('button', { type: 'button', 'data-v': it.v, title: it.title || null, class: String(it.v) === String(value) ? 'on' : null, onclick: () => set(it.v) }, it.label)));
  }

  function buildDock() {
    const dock = $('#kbDock');
    if (!dock) return;
    dock.textContent = '';
    const WHITE = [0, 2, 4, 5, 7, 9, 11];
    const keys = h('div', { class: 'kb-keys', role: 'group', 'aria-label': 'Clavier (2 octaves)' });
    let w = 0;
    keyEls.clear();
    for (let n = 0; n <= 24; n++) {
      const black = !WHITE.includes(n % 12);
      const code = CODE_OF.get(n);
      const k = h('div', { class: 'kb-key ' + (black ? 'black' : 'white'), 'data-n': n, 'data-code': code },
        n % 12 === 0 ? h('span', { class: 'kb-c' }) : null,
        h('span', { class: 'kb-letter', text: AZERTY[code] || '' }));
      if (black) k.style.left = `calc(${w} * (100% / 15) - (100% / 15) * .31)`;
      else w++;
      keyEls.set(n, k);
      keys.append(k);
    }
    // souris / tactile
    keys.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('.kb-key');
      if (!k || e.button !== 0) return;
      e.preventDefault();
      noteOn('ptr', (st.oct + 1) * 12 + +k.dataset.n, e.shiftKey ? 1 : st.vel / 127);
    });
    const up = () => noteOff('ptr');
    keys.addEventListener('pointerup', up);
    keys.addEventListener('pointerleave', up);
    keys.addEventListener('pointercancel', up);
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then((map) => {
        keyEls.forEach((k) => {
          const ch = map.get(k.dataset.code);
          if (ch) k.querySelector('.kb-letter').textContent = ch.toUpperCase();
        });
      }).catch(() => {});
    }

    const kbd = (t) => h('kbd', { text: t });
    dock.append(
      h('div', { class: 'kb-col kb-side' },
        h('h3', { text: 'Source' }),
        h('label', { class: 'kb-src' }, h('input', { type: 'radio', name: 'kbSrc', checked: true }), 'Clavier de l’ordinateur'),
        h('label', { class: 'kb-src soon', title: 'Clavier MIDI : à l’étape suivante' }, h('input', { type: 'radio', name: 'kbSrc', disabled: true }), 'Clavier MIDI ', h('em', { text: 'bientôt' })),
        h('h3', {}, 'Octave ', kbd('←'), ' ', kbd('→')),
        h('div', { class: 'kb-oct' },
          h('button', { type: 'button', class: 'btn btn-small btn-icon-small', 'aria-label': 'Octave plus grave', onclick: () => setOct(st.oct - 1) }, '−'),
          h('output', { id: 'kbOct' }),
          h('button', { type: 'button', class: 'btn btn-small btn-icon-small', 'aria-label': 'Octave plus aiguë', onclick: () => setOct(st.oct + 1) }, '+')),
        h('h3', {}, 'Vélocité ', kbd('↑'), ' ', kbd('↓'), ' · ', kbd('Maj'), ' accent'),
        h('div', { class: 'kb-vel' },
          h('input', { type: 'range', id: 'kbVel', min: 1, max: 127, 'aria-label': 'Vélocité', oninput: (e) => setVel(+e.target.value) }),
          h('output', { id: 'kbVelOut' }))),
      h('div', { class: 'kb-col kb-main' },
        h('div', { class: 'kb-head' },
          h('h3', { id: 'kbTarget' }),
          h('span', { id: 'kbStatus', class: 'kb-status', 'aria-live': 'polite' }),
          h('button', { type: 'button', class: 'btn btn-small kb-close', title: 'Quitter le mode Jouer (²)', onclick: () => setOn(false) }, 'Fermer')),
        keys,
        h('p', { class: 'kb-hint' }, 'Touches physiques : mêmes lettres en AZERTY et en QWERTY. ', kbd('Entrée'), ' enregistre, ', kbd('Espace'), ' lance la lecture, ', kbd('Ctrl'), ' + lettre garde ses raccourcis.')),
      h('div', { class: 'kb-col kb-rec' },
        h('h3', { text: 'Enregistrement' }),
        seg('kbMode', [{ v: 'replace', label: 'Remplacer', title: 'Chaque tour où l’on joue efface la piste' }, { v: 'merge', label: 'Fusionner', title: 'Chaque tour s’ajoute aux notes déjà là' }], st.mode, (v) => {
          st.mode = v;
          savePrefs();
          syncUi();
        }),
        h('h3', { text: 'Quantification' }),
        seg('kbQuant', QUANTS, st.quant, (v) => {
          st.quant = +v;
          savePrefs();
          syncUi();
        }),
        h('label', { class: 'kb-check' }, h('input', { type: 'checkbox', id: 'kbCount', onchange: (e) => { st.countIn = e.target.checked; savePrefs(); } }), 'Décompte d’une mesure'),
        h('label', { class: 'kb-check' }, h('input', { type: 'checkbox', id: 'kbMetro', onchange: (e) => { st.metro = e.target.checked; savePrefs(); if (st.rec) SS.audio.setMetronome(st.metro); } }), 'Métronome pendant l’enregistrement'))
    );
    syncUi();
  }

  function syncUi() {
    const btn = $('#kbBtn');
    if (btn) {
      btn.classList.toggle('on', st.on);
      btn.setAttribute('aria-pressed', st.on);
    }
    const rec = $('#recBtn');
    if (rec) {
      rec.classList.toggle('on', st.rec);
      rec.setAttribute('aria-pressed', st.rec);
    }
    const dock = $('#kbDock');
    if (!dock || !dock.firstChild) return;
    dock.hidden = !st.on;
    $('#kbOct').textContent = `C${st.oct}`;
    dock.querySelectorAll('.kb-c').forEach((c) => (c.textContent = `C${st.oct + +c.parentNode.dataset.n / 12}`));
    $('#kbVel').value = st.vel;
    $('#kbVelOut').textContent = st.vel;
    $('#kbCount').checked = st.countIn;
    $('#kbMetro').checked = st.metro;
    [['#kbMode', st.mode], ['#kbQuant', st.quant]].forEach(([id, v]) =>
      dock.querySelectorAll(`${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))));
    const t = armedTrack();
    $('#kbTarget').textContent = t ? `Joue sur « ${t.name} »${t.type === 'drum' ? ' (un coup par touche)' : ''}` : 'Aucune piste armée';
    if (!st.rec) $('#kbStatus').textContent = '';
    dock.classList.toggle('recording', st.rec);
  }

  /* ---------------- Démarrage ---------------- */

  function init(a) {
    app = a;
    buildDock();
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', releaseAll);
    const btn = $('#kbBtn');
    if (btn) btn.addEventListener('click', () => setOn(!st.on));
    const rec = $('#recBtn');
    if (rec) rec.addEventListener('click', toggleRec);
  }

  /** Après un changement de projet ou de scène : la piste armée disparue est oubliée. */
  function refresh() {
    if (st.armed && !armedTrack()) {
      stopRec();
      st.armed = null;
    }
    if (st.on && wizard()) setOn(false);
    syncUi();
  }

  return {
    KEYMAP,
    AZERTY,
    init,
    refresh,
    noteOn,
    noteOff,
    arm: (id) => arm(st.armed === id ? null : id),
    armedId: () => st.armed,
    isOn: () => st.on,
    isRecording: () => st.rec,
    setOn,
    toggleRec,
    place,
    writeNote,
  };
})();
