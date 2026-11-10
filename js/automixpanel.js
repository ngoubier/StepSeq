/*
 * Auto Mix : panneau à droite de la console Mix.
 *
 * Il écoute le morceau pendant la lecture (js/automix-listen.js), note chaque critère et propose des conseils
 * chiffrés (js/automix.js) que l'utilisateur accepte, ajuste (intensité 25 à 150 %) ou refuse. Chaque conseil
 * accepté passe par les réglages de la console : il s'annule avec Ctrl+Z comme toute retouche.
 * A/B : compare le mix d'origine (avant le premier conseil accepté) et le mix actuel, à volume égal.
 * Préférences (enregistrées dans le navigateur) : ce que l'assistant a le droit de modifier, l'objectif par défaut,
 * le niveau de détail et la durée d'écoute avant le diagnostic.
 * Pilote auto (js/automix-pilot.js) : l'assistant règle lui-même les faders pendant la lecture, un petit geste à la
 * fois, en réécoutant entre deux gestes. Chaque geste est une étape d'annulation (Ctrl+Z) ; toucher un fader à la
 * main pendant le pilote le lui reprend.
 */
window.SS = window.SS || {};

SS.automixPanel = (() => {
  const $ = (s) => document.querySelector(s);
  const PREFS_KEY = 'stepseq.automix';
  const A = () => SS.automix;
  const L = () => SS.automixListen;
  let app;
  let isOpen = false;
  let prefs = null;
  let targetPick = null; // objectif choisi dans le panneau (sinon : préférence ou proposition)
  let diag = null;
  let frozen = false; // la liste ne bouge plus dès que l'utilisateur agit sur un conseil
  let tab = 'mix';
  let ab = 'B';
  let baseline = null; // réglages d'origine, pour l'écoute A
  const decisions = new Map(); // id -> { st: 'accepted' | 'refused', k, s (conseil), applied: [{ tid, path, value, before }] }
  const adjusting = new Map(); // id -> intensité en cours de réglage (avant d'accepter)
  const picks = new Map(); // chaînes : id -> modules cochés [bool…]
  let trying = null; // chaîne en cours d'essai : { id, k } (le son change, le projet non)
  let timer = null;
  let lastDiagAt = 0;
  let pilot = null; // pilote auto en marche : { tk, unsub, timer, ramp, lastMove, log, locked, moved, expect, status }
  const PL = () => SS.automixPilot;

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fr = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ',').replace('-', '−');

  /* ------------------------------------------------------------------ préférences */
  function loadPrefs() {
    try {
      return A().cleanPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'));
    } catch (e) {
      return A().cleanPrefs(null);
    }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* stockage indisponible */
    }
  }
  const proposed = () => A().proposeTarget(app.project().tracks);
  const targetId = () => targetPick || (prefs.target !== 'auto' ? prefs.target : proposed());

  /* ------------------------------------------------------------------ lecture / écriture des réglages */
  const project = () => app.project();
  const trackOf = (id) => project().tracks.find((t) => t.id === id);
  const nameOf = (id) => (id === '__master' ? 'Master' : (trackOf(id) || {}).name || '?');
  const colorOf = (id) => (id === '__master' ? '#e8e8ee' : (trackOf(id) || {}).color || '#888');
  const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const setPath = (o, path, v) => {
    const ks = path.split('.');
    const last = ks.pop();
    const obj = ks.reduce((x, k) => x[k], o);
    obj[last] = v;
  };

  /** Valeur actuelle d'un réglage (piste ou Master). */
  function getValue(tid, path) {
    const p = project();
    if (tid === '__master') {
      const mp = SS.masterParams(p);
      if (path === 'volumeDb') return SS.gainToDb(mp.volume);
      return getPath(mp, path);
    }
    const t = trackOf(tid);
    if (!t) return undefined;
    if (path === 'volumeDb') return SS.gainToDb(typeof t.volume === 'number' ? t.volume : 0.8);
    if (path.startsWith('mix.')) return getPath(SS.mixParams(t), path.slice(4));
    if (path.startsWith('fx.')) return SS.fxParams(t)[path.slice(3)];
    return undefined;
  }
  /** Change un réglage et l'applique au son. */
  function setValue(tid, path, v) {
    const p = project();
    if (tid === '__master') {
      const mp = SS.masterParams(p);
      if (path.startsWith('mastering.')) p.master = { ...mp, mastering: SS.cleanMastering({ ...mp.mastering, [path.slice(10)]: v }) };
      else if (path === 'volumeDb') p.master = { ...mp, volume: clamp(SS.dbToGain(v), 0, 2) };
      else if (path.startsWith('mix.')) {
        const m = mp.mix;
        setPath(m, path.slice(4), v);
        p.master = { ...mp, mix: SS.cleanMix(m, SS.MASTER_DEFAULTS.mix) };
        if (p.masterProfile) p.masterProfile.modified = true;
      }
      SS.audio.applyMaster(p);
      return;
    }
    const t = trackOf(tid);
    if (!t) return;
    if (path === 'volumeDb') {
      t.volume = clamp(SS.dbToGain(v), 0, 2);
      SS.audio.setTrackGain(t, t.volume);
    } else if (path.startsWith('mix.')) {
      const m = SS.mixParams(t);
      setPath(m, path.slice(4), v);
      t.mix = SS.cleanMix(m);
      if (t.mixProfile) t.mixProfile.modified = true;
      SS.audio.applyMix(t);
    } else if (path.startsWith('fx.')) {
      t.fx = { ...(t.fx || {}), [path.slice(3)]: v };
      SS.audio.applyFx(t);
    }
  }
  const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.02 : a === b);

  /* ------------------------------------------------------------------ A/B */
  function captureBaseline() {
    if (baseline) return;
    const p = project();
    const clone = (o) => JSON.parse(JSON.stringify(o));
    baseline = { tracks: {}, master: clone(SS.masterParams(p)) };
    p.tracks.forEach((t) => (baseline.tracks[t.id] = { mix: clone(SS.mixParams(t)), fx: clone(SS.fxParams(t)), volume: typeof t.volume === 'number' ? t.volume : 0.8 }));
  }
  /** Écoute A : réglages d'origine, gain d'entrée du limiteur égal à celui de B (comparaison à volume égal). */
  function hearA() {
    if (!baseline) return;
    const p = project();
    p.tracks.forEach((t) => {
      const b = baseline.tracks[t.id];
      if (!b) return;
      const fake = { ...t, mix: b.mix, fx: b.fx };
      SS.audio.applyMix(fake);
      SS.audio.applyFx(fake);
      SS.audio.setTrackGain(t, b.volume);
    });
    const now = SS.masterParams(p);
    const bm = baseline.master;
    const gainIn = (m) => SS.gainToDb(m.volume) + (m.mastering.on ? m.mastering.drive : 0);
    const drive = bm.mastering.drive + gainIn(now) - gainIn(bm);
    SS.audio.applyMaster({ ...p, master: { ...bm, mastering: { ...bm.mastering, on: bm.mastering.on || now.mastering.on, drive } } });
  }
  function hearB() {
    const p = project();
    p.tracks.forEach((t) => {
      SS.audio.applyMix(t);
      SS.audio.applyFx(t);
      SS.audio.setTrackGain(t, typeof t.volume === 'number' ? t.volume : 0.8);
    });
    SS.audio.applyMaster(p);
  }
  function setAB(v) {
    endTry();
    if (v === ab) return;
    ab = v;
    if (ab === 'A') hearA();
    else hearB();
    renderFoot();
  }

  /* ------------------------------------------------------------------ chaînes : modules cochés, essai */
  const picked = (s) => picks.get(s.id) || s.modules.map((m) => m.on);
  /** Le conseil réduit aux modules cochés (chaîne) ; un conseil simple est rendu tel quel. */
  const effective = (s) => (s.kind === 'chain' ? { ...s, changes: s.modules.filter((m, i) => picked(s)[i]).flatMap((m) => m.changes) } : s);

  /** Essayer : fait entendre la chaîne (modules cochés, intensité k) sans rien enregistrer. */
  function startTry(s, k) {
    if (ab === 'A') setAB('B');
    hearB();
    const p = project();
    const clones = new Map();
    for (const c of effective(s).changes) {
      const tid = c.track || s.track;
      if (!clones.has(tid)) {
        if (tid === '__master') clones.set(tid, JSON.parse(JSON.stringify(SS.masterParams(p))));
        else {
          const t = trackOf(tid);
          if (!t) continue;
          clones.set(tid, { ...t, mix: JSON.parse(JSON.stringify(SS.mixParams(t))), fx: { ...SS.fxParams(t) } });
        }
      }
      const o = clones.get(tid);
      const v = A().valueAt(c, k);
      if (tid === '__master') {
        if (c.path === 'volumeDb') o.volume = clamp(SS.dbToGain(v), 0, 2);
        else setPath(o, c.path, v);
      } else if (c.path === 'volumeDb') SS.audio.setTrackGain(o, clamp(SS.dbToGain(v), 0, 2));
      else setPath(o, c.path, v);
    }
    clones.forEach((o, tid) => {
      if (tid === '__master') SS.audio.applyMaster({ ...p, master: o });
      else {
        SS.audio.applyMix(o);
        SS.audio.applyFx(o);
      }
    });
    trying = { id: s.id, k };
  }
  function endTry() {
    if (!trying) return;
    trying = null;
    hearB();
  }

  /* ------------------------------------------------------------------ décisions */
  function accept(s, k) {
    endTry();
    if (ab === 'A') setAB('B');
    captureBaseline();
    const prev = decisions.get(s.id);
    const applied = effective(s).changes.map((c) => {
      const tid = c.track || s.track;
      const before = prev && prev.applied ? (prev.applied.find((a) => a.tid === tid && a.path === c.path) || {}).before : getValue(tid, c.path);
      const value = A().valueAt(c, k);
      setValue(tid, c.path, value);
      return { tid, path: c.path, value, before };
    });
    decisions.set(s.id, { st: 'accepted', k, s, applied });
    adjusting.delete(s.id);
    frozen = true;
    app.changed();
    SS.mixer.render();
  }
  function undoDecision(id) {
    endTry();
    const d = decisions.get(id);
    if (d && d.st === 'accepted') {
      [...d.applied].reverse().forEach((a) => a.before !== undefined && setValue(a.tid, a.path, a.before));
      app.changed();
      SS.mixer.render();
    }
    decisions.delete(id);
  }
  /** Une annulation (Ctrl+Z) ou une retouche à la main peut défaire un conseil : il redevient « à décider ». */
  function syncDecisions() {
    for (const [id, d] of decisions) {
      if (d.st !== 'accepted') continue;
      if (!d.applied.every((a) => same(getValue(a.tid, a.path), a.value))) decisions.delete(id);
    }
  }

  /* ------------------------------------------------------------------ diagnostic */
  function context() {
    const p = project();
    const mp = SS.masterParams(p);
    return {
      tracks: p.tracks.map((t) => ({
        id: t.id,
        mute: !!t.mute,
        name: t.name,
        band: t.band,
        role: SS.automix.roleOf(t),
        mix: SS.mixParams(t),
        fx: SS.fxParams(t),
        volumeDb: SS.gainToDb(typeof t.volume === 'number' ? t.volume : 0.8),
      })),
      master: { ...mp, volumeDb: SS.gainToDb(mp.volume) },
      target: targetId(),
      prefs,
    };
  }
  function rediagnose() {
    const sum = L().summary();
    if (!sum || !sum.mix.n) return;
    const next = A().diagnose(sum, context());
    if (!frozen || !diag) diag = next;
    else {
      // liste figée : les conseils déjà décidés gardent leurs valeurs, les autres sont mis à jour
      diag = { ...next, suggestions: next.suggestions };
    }
    lastDiagAt = performance.now();
  }
  /** Conseils affichés : ceux du diagnostic + ceux décidés (avec leurs valeurs d'alors). */
  function shown() {
    const list = (diag ? diag.suggestions : [])
      .filter((s) => !(pilot && s.scope === 'fader' && s.track !== '__master')) // le pilote règle lui-même les faders
      .map((s) => (decisions.has(s.id) ? decisions.get(s.id).s : s));
    for (const [id, d] of decisions) if (!list.some((s) => s.id === id)) list.push(d.s);
    return list;
  }

  /* ------------------------------------------------------------------ rendu */
  const SEV = { crit: 'Prioritaire', warn: 'Conseillé', info: 'Finition' };
  function pathLabel(c, s) {
    const p = c.path;
    const bell = (k) => {
      const fc = s.changes.find((x) => x.path === `mix.eq.${k}.f` && (x.track || s.track) === (c.track || s.track));
      const f = fc ? fc.to : getValue(c.track || s.track, `mix.eq.${k}.f`);
      return `EQ cloche ${A().formatValue('x.f', f)}`;
    };
    const L = {
      volumeDb: 'Fader', 'mix.eq.on': 'Égaliseur', 'mix.eq.hp.on': 'Passe-haut', 'mix.eq.hp.f': 'Passe-haut',
      'mix.eq.low.g': 'EQ shelf grave', 'mix.eq.low.f': 'EQ shelf grave · fréquence', 'mix.eq.high.g': 'EQ shelf aigu',
      'mix.eq.high.f': 'EQ shelf aigu · fréquence', 'mix.comp.ratio': 'Compresseur · ratio', 'mix.comp.th': 'Compresseur · seuil',
      'mix.pan': 'Panoramique', 'fx.scSource': 'Sidechain déclenché par', 'fx.scDepth': 'Sidechain · profondeur',
      'fx.scRelease': 'Sidechain · relâchement', 'fx.sendHall': 'Envoi reverb hall', 'fx.sendPlate': 'Envoi reverb plate',
      'fx.room': 'Reverb de la piste', 'mastering.on': 'Mastering', 'mastering.drive': 'Mastering · gain d\'entrée',
      'mastering.ceiling': 'Mastering · plafond', 'mastering.mono': 'Mastering · graves en mono sous',
      'mastering.width': 'Mastering · largeur stéréo', 'mastering.clip': 'Mastering · écrêtage doux',
    };
    let txt = L[p];
    const m = /^mix\.eq\.(lm|hm)\.(f|q|g)$/.exec(p);
    if (m) txt = m[2] === 'g' ? bell(m[1]) : m[2] === 'f' ? 'EQ cloche · fréquence' : 'EQ cloche · largeur (Q)';
    const who = c.track && c.track !== s.track ? nameOf(c.track) + ' · ' : '';
    return who + (txt || p);
  }
  function fmt(c, v) {
    if (c.path === 'fx.scSource') return v ? nameOf(v) : 'aucune';
    if (c.path === 'mastering.ceiling') return fr(v) + ' dBTP';
    return A().formatValue(c.path, v);
  }

  function card(s) {
    const d = decisions.get(s.id);
    const st = d ? d.st : 'open';
    const k = d && d.st === 'accepted' ? d.k : adjusting.has(s.id) ? adjusting.get(s.id) : 1;
    const showAdj = adjusting.has(s.id);
    // les interrupteurs « on » implicites ne sont montrés que s'ils sont seuls
    const visible = s.changes.filter((c) => !(c.fixed && typeof c.to === 'boolean') || s.changes.length === 1);
    let lines = s.kind === 'chain' ? chainModules(s, st, k) : h('ul', { class: 'am-changes' }, visible.map((c) => {
      const v = A().valueAt(c, k);
      return h('li', {}, h('span', {}, pathLabel(c, s)), same(c.from, v) ? null : h('s', {}, fmt(c, c.from)), h('span', { class: 'am-arrow' }, '→'), h('b', {}, fmt(c, v)));
    }));
    const el = h(
      'article',
      { class: `am-card sev-${s.sev} ${st}`, 'data-id': s.id },
      h('div', { class: 'am-card-top' }, h('h4', {}, s.title), h('span', { class: 'am-pill' }, st === 'accepted' ? 'Appliqué' : st === 'refused' ? 'Refusé' : SEV[s.sev])),
      h('span', { class: 'am-trk', style: `--c:${colorOf(s.track)}` }, nameOf(s.track)),
      st === 'refused' ? null : h('p', { class: 'am-why' }, s.why),
      st === 'refused' ? null : h('div', { class: 'am-meas' }, s.meas.map(([a, b]) => h('span', {}, a + ' ', h('b', {}, b)))),
      st === 'refused' ? null : lines
    );
    if (showAdj) {
      const out = h('output', {}, Math.round(k * 100) + ' %');
      const range = h('input', { type: 'range', min: 0.25, max: 1.5, step: 0.05, value: k, id: 'amk_' + s.id, 'aria-label': 'Intensité du conseil' });
      range.addEventListener('input', () => {
        const nk = +range.value;
        out.textContent = Math.round(nk * 100) + ' %';
        if (d && d.st === 'accepted') accept(s, nk);
        else adjusting.set(s.id, nk);
        frozen = true;
        if (trying && trying.id === s.id) startTry(s, nk);
        // mise à jour des valeurs affichées sans reconstruire le curseur
        if (s.kind === 'chain') lines.replaceWith((lines = chainModules(s, st, nk)));
        else lines.querySelectorAll('li').forEach((li, i) => (li.querySelector('b').textContent = fmt(visible[i], A().valueAt(visible[i], nk))));
        const lab = el.querySelector('.am-state');
        if (lab) lab.textContent = `✓ Appliqué à ${Math.round(nk * 100)} %`;
      });
      el.append(h('label', { class: 'am-adjust', for: 'amk_' + s.id }, 'Intensité', range, out));
    }
    const btn = (label, cls, fn, title) => h('button', { type: 'button', class: 'btn btn-small ' + cls, title, onclick: fn }, label);
    const toggleAdj = () => {
      frozen = true;
      if (adjusting.has(s.id)) adjusting.delete(s.id);
      else adjusting.set(s.id, k);
      renderCards();
    };
    el.append(
      h(
        'div',
        { class: 'am-actions' },
        st === 'open'
          ? [
              btn(acceptLabel(s), 'am-accept', () => (accept(s, k), renderAll()), 'Appliquer dans la console (Ctrl+Z pour annuler)'),
              s.kind === 'chain'
                ? h('button', {
                    type: 'button',
                    class: 'btn btn-small am-try' + (trying && trying.id === s.id ? ' on' : ''),
                    'aria-pressed': String(!!(trying && trying.id === s.id)),
                    title: 'Faire entendre la chaîne sans rien enregistrer',
                    onclick: () => {
                      frozen = true;
                      if (trying && trying.id === s.id) endTry();
                      else startTry(s, k);
                      renderCards();
                    },
                  }, trying && trying.id === s.id ? '◼ J\'écoute' : '▶ Essayer')
                : null,
              btn(showAdj ? 'Masquer' : 'Ajuster', '', toggleAdj, 'Doser l\'intensité du conseil'),
              btn('Refuser', 'am-ghost', () => (endTry(), decisions.set(s.id, { st: 'refused', s }), (frozen = true), renderAll()), 'Écarter ce conseil'),
            ]
          : [
              h('span', { class: 'am-state' }, st === 'accepted' ? `✓ Appliqué à ${Math.round(k * 100)} %` : 'Écarté'),
              h('span', { class: 'spacer' }),
              st === 'accepted' ? btn(showAdj ? 'Masquer' : 'Ajuster', '', toggleAdj) : null,
              btn('Annuler', 'am-ghost', () => (undoDecision(s.id), adjusting.delete(s.id), renderAll()), st === 'accepted' ? 'Remettre les réglages d\'avant' : 'Revoir ce conseil'),
            ]
      )
    );
    return el;
  }

  const acceptLabel = (s) => {
    if (s.kind !== 'chain') return 'Accepter';
    const n = picked(s).filter(Boolean).length;
    return `Accepter ${n} module${n > 1 ? 's' : ''}`;
  };
  const MOD_NAME = { EQ: 'Égaliseur', COMP: 'Compresseur', LIM: 'Limiteur', MAST: 'Mastering' };
  const svg = (inner) => `<svg viewBox="0 0 64 34" aria-hidden="true">${inner}</svg>`;
  /** Miniature d'un module : courbe d'égaliseur (celle de la console), transfert du compresseur, plafond du limiteur. */
  function moduleArt(s, m, k) {
    const box = h('span', { class: 'am-art' });
    const v = (path) => {
      const c = m.changes.find((x) => x.path === path);
      return c ? A().valueAt(c, k) : undefined;
    };
    if (m.k === 'EQ' && SS.mixer.drawEq) {
      const base = JSON.parse(JSON.stringify(s.track === '__master' ? SS.masterParams(project()).mix.eq : SS.mixParams(trackOf(s.track) || {}).eq));
      m.changes.forEach((c) => setPath(base, c.path.replace(/^mix\.eq\./, ''), A().valueAt(c, k)));
      base.on = true;
      const cv = h('canvas');
      box.append(cv);
      requestAnimationFrame(() => SS.mixer.drawEq(cv, base, 64, 34));
    } else if (m.k === 'COMP') {
      const th = v('mix.comp.th');
      const r = v('mix.comp.ratio') || 1;
      const x = 34 * (1 + th / 40); // seuil sur une échelle de −40 à 0 dB
      const y = 34 - x;
      box.innerHTML = svg(`<path d="M0,34 L64,0" stroke="#2c2c33"/><path d="M0,34 L${x.toFixed(1)},${y.toFixed(1)} L64,${(y - (64 - x) / r).toFixed(1)}" fill="none" stroke="var(--am-warn)" stroke-width="1.6"/>`);
    } else if (m.k === 'LIM') {
      box.innerHTML = svg('<path d="M0,34 L64,0" stroke="#2c2c33"/><path d="M0,34 L44,10 L64,10" fill="none" stroke="#ef7a50" stroke-width="1.6"/>');
    } else {
      const bars = Array.from({ length: 16 }, (_, i) => {
        const hgt = 34 * Math.min(0.78, 0.35 + 0.5 * Math.abs(Math.sin(i * 1.7)));
        return `<rect x="${i * 4 + 0.5}" y="${(34 - hgt).toFixed(1)}" width="3" height="${hgt.toFixed(1)}" fill="var(--am-ok)" opacity=".8"/>`;
      }).join('');
      box.innerHTML = svg(bars + '<line x1="0" x2="64" y1="7.5" y2="7.5" stroke="#ef7a50" stroke-dasharray="3 2"/>');
    }
    return box;
  }
  /** Texte d'un module : les valeurs réglées (entre ⟨ ⟩ dans js/automix.js) en doré. */
  const descNodes = (txt) => txt.split(/[⟨⟩]/).map((part, i) => (i % 2 ? h('em', {}, part) : part));
  function chainModules(s, st, k) {
    const sel = picked(s);
    return h('div', { class: 'am-mods' }, s.modules.map((m, i) => {
      const cb = h('input', { type: 'checkbox', id: `amm_${s.id}_${i}`, checked: sel[i], disabled: st !== 'open', 'aria-label': MOD_NAME[m.k] });
      cb.addEventListener('change', () => {
        const next = [...picked(s)];
        next[i] = cb.checked;
        picks.set(s.id, next);
        frozen = true;
        if (trying && trying.id === s.id) startTry(s, k);
        renderCards();
      });
      return h('label', { class: 'am-mod' + (sel[i] ? '' : ' off'), for: `amm_${s.id}_${i}` }, cb, moduleArt(s, m, k),
        h('span', { class: 'am-mod-txt' }, h('b', {}, MOD_NAME[m.k]), h('span', {}, descNodes(A().moduleDesc(m, k)))));
    }));
  }

  function scoreColor(x) {
    return x >= 80 ? 'var(--am-ok)' : x >= 60 ? 'var(--am-warn)' : 'var(--am-crit)';
  }

  function renderStatus() {
    const box = $('#amStatus');
    if (!box) return;
    const secs = L().secs();
    const playing = SS.audio.isPlaying() && !SS.audio.isPaused();
    const p = project();
    const mm = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    const need = prefs.minSecs;
    const scenesTotal = p.playMode === 'song' ? new Set(p.song.map((b) => b.scene)).size : 1;
    const heard = Math.min(L().scenes(), scenesTotal);
    let msg;
    if (pilot) msg = playing ? 'Pilote auto : écoute et réglages en direct dans la console.' : 'Pilote auto : en attente de la lecture.';
    else if (!playing && !secs) msg = 'Lance la lecture : j\'écoute le morceau pour le diagnostiquer.';
    else if (secs < need) msg = `${playing ? 'Écoute en cours' : 'Écoute en pause'} · encore ${Math.ceil(need - secs)} s avant le premier diagnostic`;
    else msg = `${playing ? 'Écoute en cours' : 'Écoute en pause'} · ${mm(secs)} entendues${scenesTotal > 1 ? ` · ${heard} scène${heard > 1 ? 's' : ''} sur ${scenesTotal}` : ''}`;
    box.replaceChildren(
      h('div', { class: 'am-status-row' }, h('span', { class: 'am-dot' + (playing ? ' on' : '') }), h('span', {}, msg),
        playing ? null : h('button', { type: 'button', class: 'btn btn-small am-play', onclick: () => app.play() }, '▶ Lecture')),
      h('div', { class: 'am-bar' }, h('i', { style: `width:${clamp((secs / Math.max(need * 3, 1)) * 100, 0, 100)}%` }))
    );
    if (p.playMode !== 'song' && p.song && p.song.length > 1 && !secs)
      box.append(h('p', { class: 'am-hint' }, 'Astuce : passe en mode Song (fenêtre Song) pour que j\'écoute toute la chanson, pas seulement la scène en cours.'));
  }

  function renderTargets() {
    const box = $('#amTargets');
    if (!box) return;
    const cur = targetId();
    const prop = proposed();
    box.replaceChildren(
      h('span', { class: 'am-label' }, 'Objectif'),
      h('div', { class: 'am-chips' }, Object.entries(A().TARGETS).map(([id, T]) =>
        h('button', {
          type: 'button',
          class: 'am-chip' + (id === cur ? ' sel' : ''),
          'aria-pressed': String(id === cur),
          title: T.desc + (id === prop ? ' · proposé d\'après le style du morceau' : ''),
          onclick: () => {
            targetPick = id;
            rediagnose();
            renderAll();
          },
        }, T.name, h('small', {}, ' ' + fr(T.lufs, 0)), id === prop ? h('em', {}, ' ✦') : null)
      )),
      h('p', { class: 'am-hint' }, prefs.target === 'auto' && !targetPick ? `Proposé d'après le style du morceau (✦). Clique un autre objectif pour le changer.` : `✦ : proposé d'après le style du morceau.`)
    );
  }

  function renderScore() {
    const box = $('#amScore');
    if (!box) return;
    if (!diag || !diag.ready) {
      box.replaceChildren(h('p', { class: 'am-hint' }, 'Le score apparaît après ' + prefs.minSecs + ' s d\'écoute. Pour un diagnostic définitif, écoute tout le morceau.'));
      return;
    }
    const total = diag.total;
    const C = 2 * Math.PI * 40;
    const ring = h('div', { class: 'am-ring', title: 'Score pro : moyenne pondérée des critères' });
    ring.innerHTML = `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="40" fill="none" stroke="var(--am-track)" stroke-width="8"/><circle cx="48" cy="48" r="40" fill="none" stroke="${scoreColor(total)}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - total / 100)).toFixed(1)}" transform="rotate(-90 48 48)"/></svg>`;
    ring.append(h('b', {}, String(total), h('small', {}, diag.final ? 'score pro' : 'provisoire')));
    box.replaceChildren(
      ring,
      h('div', { class: 'am-crits' }, A().CRITERIA.map((c) => {
        const v = diag.scores[c.id];
        return h('div', { class: 'am-crit' }, h('span', {}, c.name), h('span', { class: 'am-bar' }, h('i', { style: `width:${v}%;background:${scoreColor(v)}` })), h('em', { style: `color:${scoreColor(v)}` }, String(v)));
      }))
    );
  }

  function renderCards() {
    const box = $('#amCards');
    if (!box) return;
    syncDecisions();
    const list = shown();
    const open = (t) => list.filter((s) => s.tab === t && !decisions.has(s.id)).length;
    const tabs = h('div', { class: 'am-tabs', role: 'tablist' }, [['mix', 'Mixage'], ['master', 'Mastering']].map(([id, n]) =>
      h('button', { type: 'button', role: 'tab', class: 'am-tab' + (tab === id ? ' sel' : ''), 'aria-selected': String(tab === id), onclick: () => ((tab = id), renderCards()) }, n, h('span', { class: 'am-n' }, String(open(id))))
    ));
    const items = list.filter((s) => s.tab === tab);
    const out = [tabs];
    if (!diag || !diag.ready) out.push(h('p', { class: 'am-hint' }, 'Les conseils arrivent dès le premier diagnostic.'));
    if ((diag && diag.ready) || items.length) {
      if (tab === 'master' && list.some((s) => s.tab === 'mix' && s.sev !== 'info' && !decisions.has(s.id)))
        out.push(h('p', { class: 'am-hint' }, 'Règle d\'abord le mixage : le mastering se juge sur un mix équilibré. Réécoute ensuite pour recalculer ces conseils.'));
      if (!items.length) out.push(h('p', { class: 'am-empty' }, tab === 'mix' ? '✓ Rien à signaler sur le mixage pour cet objectif.' : '✓ Rien à signaler sur le mastering pour cet objectif.'));
      const chains = items.filter((s) => s.kind === 'chain');
      const fixes = items.filter((s) => s.kind !== 'chain');
      const group = (title, sub) => h('div', { class: 'am-group' }, h('span', {}, title), h('small', {}, sub));
      if (chains.length) out.push(group(tab === 'mix' ? 'Chaînes de départ' : 'Chaîne de mastering', tab === 'mix' ? 'pistes à plat' : 'Master à plat'), ...chains.map(card));
      if (chains.length && fixes.length) out.push(group('Corrections', 'd\'après les mesures'));
      out.push(...fixes.map(card));
      if (diag && diag.hidden) out.push(h('p', { class: 'am-hint' }, `${diag.hidden} conseil${diag.hidden > 1 ? 's' : ''} masqué${diag.hidden > 1 ? 's' : ''} par tes préférences.`));
      if (frozen) out.push(h('p', { class: 'am-hint' }, 'Liste figée pendant tes décisions. « Réécouter » mesure l\'effet de tes changements et recalcule les conseils.'));
    }
    box.replaceChildren(...out);
  }

  function renderFoot() {
    const box = $('#amFoot');
    if (!box) return;
    const openNow = shown().filter((s) => s.tab === tab && !decisions.has(s.id));
    const abBtn = (v, label) => h('button', { type: 'button', class: ab === v ? 'sel' : '', 'aria-pressed': String(ab === v), disabled: !baseline, onclick: () => setAB(v), title: baseline ? (v === 'A' ? 'Écouter le mix d\'origine (à volume égal)' : 'Écouter le mix actuel') : 'Accepte un conseil pour comparer avant / après' }, label);
    box.replaceChildren(
      h('div', { class: 'am-ab', role: 'group', 'aria-label': 'Comparer avant / après' }, abBtn('A', 'A · avant'), abBtn('B', 'B · après')),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-small', onclick: relisten, title: 'Oublier les mesures et réécouter depuis le début' }, '↻ Réécouter'),
      h('button', {
        type: 'button', class: 'btn btn-small am-accept', disabled: !openNow.length,
        onclick: () => {
          openNow.forEach((s) => accept(s, adjusting.get(s.id) || 1));
          renderAll();
        },
      }, 'Tout accepter')
    );
  }

  function renderAll() {
    if (!isOpen) return;
    renderStatus();
    renderTargets();
    renderScore();
    renderPilot();
    renderCards();
    renderFoot();
    decorate();
  }

  /** Pastilles sur les tranches de la console : conseils en attente (orange) ou appliqués (doré). */
  function decorate() {
    document.querySelectorAll('#mixerStrips .am-badge').forEach((b) => b.remove());
    if (!isOpen || pilot || !diag || !diag.ready) return;
    const list = shown();
    document.querySelectorAll('#mixerStrips .strip[data-id]').forEach((el) => {
      const id = el.dataset.id;
      const mine = list.filter((s) => s.track === id || s.changes.some((c) => c.track === id));
      const pending = mine.filter((s) => !decisions.has(s.id)).length;
      const done = mine.some((s) => (decisions.get(s.id) || {}).st === 'accepted');
      if (!pending && !done) return;
      el.append(h('button', {
        type: 'button',
        class: 'am-badge' + (pending ? '' : ' done'),
        title: pending ? `${pending} conseil${pending > 1 ? 's' : ''} Auto Mix` : 'Réglé par Auto Mix',
        onclick: (e) => {
          e.stopPropagation();
          const s = mine.find((x) => !decisions.has(x.id)) || mine[0];
          tab = s.tab;
          renderCards();
          const c = document.querySelector(`#amCards .am-card[data-id="${CSS.escape(s.id)}"]`);
          if (c) {
            c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            c.classList.add('flash');
            setTimeout(() => c.classList.remove('flash'), 900);
          }
        },
      }, pending ? String(pending) : '✦'));
    });
  }

  /* ------------------------------------------------------------------ pilote auto des faders */
  const fmtDb = (v) => (v > 0 ? '+' : '') + fr(v) + ' dB';
  const masterSnapshot = (module) => {
    const m = SS.masterParams(project());
    return JSON.stringify(module === 'lim' ? [m.mix.lim, m.mastering] : m.mix[module]);
  };
  const trackSnapshot = (id, module) => JSON.stringify(SS.mixParams(trackOf(id))[module]);
  function resetTrackSession() {
    pilot.trackDone = new Set();
    pilot.trackActions = [];
    pilot.currentTrack = null;
    pilot.phase = 'balance';
    pilot.trackLocked = new Map();
    pilot.trackSnapshots = new Map(project().tracks.map((t) => [t.id, Object.fromEntries(['eq', 'comp', 'lim', 'pan'].map((m) => [m, trackSnapshot(t.id, m)]))]));
  }
  function finishTrack(id) {
    pilot.trackDone.add(id);
    pilot.currentTrack = null;
    pilot.trackActions = [];
    pilot.phase = 'relisten';
    pilot.masterAcc = A().newAccumulator();
    pilot.tk = PL().newTracker();
    pilot.lastMove = -Infinity;
    pilotLog(nameOf(id) + ' : piste vérifiée · réécoute du mix avant la suivante');
    setPilotStatus('Réécoute du mix · 10 s avant la piste suivante');
  }
  function startTreatment(action) {
    const tid = action.track || '__master';
    pilotLog(action.title);
    setPilotStatus(action.title + '…');
    if (tid === '__master') action.changes.forEach((c) => pilot.masterExpect.set(c.path, getValue(tid, c.path)));
    pilot.ramp = { moves: [], master: action, t0: performance.now() };
    SS.mixer.refreshMasterAction(action);
    renderPilot();
  }
  function pilotLog(txt) {
    if (!pilot) return;
    pilot.log.unshift({ txt, at: Date.now() });
    pilot.log.length = Math.min(pilot.log.length, 8);
  }
  function pilotTracks() {
    return project().tracks.map((t) => ({
      id: t.id,
      name: t.name,
      role: A().roleOf(t),
      volumeDb: getValue(t.id, 'volumeDb'),
      locked: pilot.locked.has(t.id) || t.mute,
      moved: pilot.moved.get(t.id) || 0,
    }));
  }
  /** Fait glisser un ou plusieurs faders (et le gain d'entrée du mastering) jusqu'à leur nouvelle valeur. */
  function pilotRamp(moves, drive, done) {
    pilot.ramp = { moves, drive, t0: performance.now(), secs: PL().rampSecs(Math.max(...moves.map((m) => Math.abs(m.to - m.from)))), done };
    SS.mixer.showPilotAction(moves, drive);
  }
  function pilotStepRamp() {
    const r = pilot.ramp;
    if (r.master) {
      const tid = r.master.track || '__master';
      const isTrack = tid !== '__master';
      if (isTrack && (!trackOf(tid) || trackOf(tid).mute)) {
        pilot.ramp = null;
        SS.mixer.showPilotAction();
        finishTrack(tid);
        renderPilot();
        return;
      }
      const snapshots = isTrack ? pilot.trackSnapshots.get(tid) : pilot.masterSnapshots;
      const snapshot = () => isTrack ? trackSnapshot(tid, r.master.module) : masterSnapshot(r.master.module);
      if (snapshots[r.master.module] !== snapshot()) {
        if (isTrack) {
          if (!pilot.trackLocked.has(tid)) pilot.trackLocked.set(tid, new Set());
          pilot.trackLocked.get(tid).add(r.master.module);
        } else pilot.masterLocked.add(r.master.module);
        pilotLog(nameOf(tid) + ' : module repris à la main');
        pilot.ramp = null;
        SS.mixer.showPilotAction();
        pilot.masterAcc = A().newAccumulator();
        app.changed();
        if (isTrack && !pilot.trackActions.length) finishTrack(tid);
        renderPilot();
        return;
      }
      const x = PL().ease((performance.now() - r.t0) / 1500);
      if (!r.changedAt) r.changedAt = new Map();
      for (const c of r.master.changes) {
        const now = getValue(tid, c.path);
        const expected = isTrack ? now : pilot.masterExpect.get(c.path);
        if (expected !== undefined && !same(now, expected)) {
          pilot.masterLocked.add(r.master.module);
          pilotLog('Master : réglé à la main, module repris par l’utilisateur');
          pilot.ramp = null;
          SS.mixer.showPilotAction();
          pilot.masterAcc = A().newAccumulator();
          app.changed();
          renderPilot();
          return;
        }
        const value = typeof c.to === 'boolean' ? c.to : c.from + (c.to - c.from) * x;
        setValue(tid, c.path, value);
        if (now !== getValue(tid, c.path)) r.changedAt.set(c.path, performance.now());
        if (!isTrack) pilot.masterExpect.set(c.path, getValue(tid, c.path));
      }
      snapshots[r.master.module] = snapshot();
      if (!r.drawAt || performance.now() - r.drawAt > 150 || x === 1) {
        SS.mixer.refreshMasterAction({ ...r.master, activePaths: [...r.changedAt].filter(([, at]) => performance.now() - at < 250).map(([path]) => path) });
        r.drawAt = performance.now();
      }
      if (x < 1) return;
      if (!isTrack) pilot.masterSpent[r.master.module] = (pilot.masterSpent[r.master.module] || 0) + 1;
      pilot.ramp = null;
      pilot.masterAcc = A().newAccumulator();
      pilot.lastMove = pilot.tk.t;
      SS.mixer.showPilotAction();
      app.changed();
      if (isTrack) {
        if (!pilot.trackActions.length) finishTrack(tid);
        else setPilotStatus(nameOf(tid) + ' · module suivant…');
      } else setPilotStatus('Master réglé · nouvelle écoute…');
      renderPilot();
      return;
    }
    const x = PL().ease((performance.now() - r.t0) / (r.secs * 1000));
    for (const m of r.moves) {
      const v = m.from + (m.to - m.from) * x;
      setValue(m.id, 'volumeDb', v);
      pilot.expect.set(m.id, v);
      SS.mixer.refreshFader(m.id);
    }
    if (r.drive) {
      const value = Math.round((r.drive.from + (r.drive.to - r.drive.from) * x) * 10) / 10;
      setValue('__master', 'mastering.drive', value);
      SS.mixer.refreshPilotDrive(value);
      pilot.masterSnapshots.lim = masterSnapshot('lim');
    }
    if (x < 1) return;
    pilot.ramp = null;
    pilot.masterAcc = A().newAccumulator();
    SS.mixer.showPilotAction();
    pilot.lastMove = pilot.tk.t;
    for (const m of r.moves) pilot.moved.set(m.id, (pilot.moved.get(m.id) || 0) + Math.abs(m.to - m.from));
    app.changed(); // une étape d'annulation par geste
    r.done();
    setPilotStatus('Écoute après réglage…');
    renderPilot();
  }
  function pilotTick() {
    if (!pilot) return;
    if (pilot.ramp) {
      if (!SS.audio.isPlaying() || SS.audio.isPaused() || project().tracks.some((t) => t.solo) || ab === 'A' || trying) {
        if (!pilot.ramp.pausedAt) pilot.ramp.pausedAt = performance.now();
        return setPilotStatus('Geste en pause · en attente de la lecture du mix complet');
      }
      if (pilot.ramp.pausedAt) {
        pilot.ramp.t0 += performance.now() - pilot.ramp.pausedAt;
        pilot.ramp.pausedAt = null;
      }
      return pilotStepRamp();
    }
    const p = project();
    // un fader touché à la main (ou une annulation) : le pilote n'y touche plus
    for (const [id, v] of pilot.expect) {
      const now = getValue(id, 'volumeDb');
      if (now === undefined) pilot.expect.delete(id);
      else if (Math.abs(now - v) > 0.3) {
        pilot.expect.delete(id);
        pilot.locked.add(id);
        pilotLog(`${nameOf(id)} : réglé à la main, je n'y touche plus`);
        renderPilot();
      }
    }
    const playing = SS.audio.isPlaying() && !SS.audio.isPaused();
    let status;
    if (!playing) status = 'En attente de la lecture';
    else if (p.tracks.some((t) => t.solo)) status = 'En pause : une piste est en solo (l\'équilibre se juge sur tout le mix)';
    else if (ab === 'A' || trying) status = 'En pause pendant l\'écoute comparée';
    if (status) return setPilotStatus(status);
    if (pilot.tk.t - pilot.lastMove < PL().P.settle) return setPilotStatus('Écoute…');
    for (const module of ['eq', 'comp', 'lim']) {
      if (pilot.masterSnapshots[module] !== masterSnapshot(module)) {
        if (!pilot.masterLocked.has(module)) pilotLog('Master : module repris à la main, je n’y touche plus');
        pilot.masterLocked.add(module);
      }
    }
    for (const t of p.tracks) {
      if (!pilot.trackSnapshots.has(t.id)) pilot.trackSnapshots.set(t.id, Object.fromEntries(['eq', 'comp', 'lim', 'pan'].map((m) => [m, trackSnapshot(t.id, m)])));
      for (const module of ['eq', 'comp', 'lim', 'pan']) {
        if (pilot.trackSnapshots.get(t.id)[module] === trackSnapshot(t.id, module)) continue;
        if (!pilot.trackLocked.has(t.id)) pilot.trackLocked.set(t.id, new Set());
        if (!pilot.trackLocked.get(t.id).has(module)) pilotLog(t.name + ' : ' + module + ' repris à la main');
        pilot.trackLocked.get(t.id).add(module);
      }
    }
    if (pilot.currentTrack) {
      if (!trackOf(pilot.currentTrack) || trackOf(pilot.currentTrack).mute) pilot.trackActions = [];
      const locked = pilot.trackLocked.get(pilot.currentTrack) || new Set();
      pilot.trackActions = pilot.trackActions.filter((a) => !locked.has(a.module));
      if (pilot.trackActions.length) return startTreatment(pilot.trackActions.shift());
      finishTrack(pilot.currentTrack);
      renderPilot();
      return;
    }
    if (pilot.phase === 'relisten' && pilot.masterAcc.secs < 10)
      return setPilotStatus(`Réécoute du mix · encore ${Math.ceil(10 - pilot.masterAcc.secs)} s avant la piste suivante`);

    const d = PL().plan(pilot.tk, pilotTracks());
    if (d.kind === 'fader') {
      pilot.phase = 'balance';
      pilotLog(`${d.name} ${fmtDb(d.to - d.from)} → ${fmtDb(d.to)} (${d.dev > 0 ? 'trop en avant' : 'en retrait'} de ${fr(Math.abs(d.dev))} dB)`);
      setPilotStatus(`Je règle ${d.name}…`);
      pilotRamp([{ id: d.id, from: d.from, to: d.to }], null, () => PL().forget(pilot.tk, [d.id], [d.to - d.from]));
      renderPilot();
      return;
    }
    if (d.kind === 'stage') {
      pilot.phase = 'balance';
      // toutes les pistes ensemble ; le gain d'entrée du mastering compense pour garder le même volume final
      const ms = SS.masterParams(p).mastering;
      const drive = ms.on ? { from: ms.drive, to: clamp(ms.drive - d.delta, -12, A().DRIVE_MAX) } : null;
      pilotLog(`Toutes les pistes ${fmtDb(d.delta)} : ${d.why}${drive ? ` · mastering ${fmtDb(drive.to)}` : ''}`);
      setPilotStatus('Je règle le niveau d\'ensemble…');
      pilotRamp(d.moves, drive, () => PL().forget(pilot.tk, d.room ? [d.room] : []));
      renderPilot();
      return;
    }
    if (!d.state.balanced) return setPilotStatus('Équilibrage des faders avant les traitements des pistes…');
    if (pilot.masterAcc.secs < 10) return setPilotStatus(`Équilibre atteint · réécoute du mix (${Math.ceil(10 - pilot.masterAcc.secs)} s restantes)`);
    const sum = A().summarize(pilot.masterAcc);
    const next = p.tracks.find((t) => !t.mute && !pilot.trackDone.has(t.id) && A().heard(sum.tracks[t.id]));
    if (next) {
      const ctx = context();
      const diagnostics = A().diagnose(sum, { ...ctx, prefs: { ...prefs, detail: 'all' } });
      const track = { ...ctx.tracks.find((t) => t.id === next.id), mute: next.mute };
      pilot.trackActions = PL().planTrack(sum, track, prefs.scopes, pilot.trackLocked.get(next.id), diagnostics.suggestions) || [];
      const pan = PL().panTargets(ctx.tracks).get(next.id);
      if (prefs.scopes.pan !== false && !pilot.trackLocked.get(next.id)?.has('pan') && Number.isFinite(pan) && Math.abs(track.mix.pan - pan) >= 0.03)
        pilot.trackActions.unshift({ track: next.id, module: 'pan', title: next.name + ' · Panoramique', changes: [{ path: 'mix.pan', from: track.mix.pan, to: pan }] });
      pilot.currentTrack = next.id;
      pilot.phase = 'track';
      if (pilot.trackActions.length) startTreatment(pilot.trackActions.shift());
      else {
        pilotLog(next.name + ' : EQ, compression et limiteur vérifiés, aucune correction nécessaire');
        finishTrack(next.id);
        renderPilot();
      }
      return;
    }
    if (pilot.phase !== 'master') {
      pilot.phase = 'master';
      renderPilot();
    }

    const master = { ...SS.masterParams(p), volumeDb: SS.gainToDb(SS.masterParams(p).volume) };
    sum.master.limGr = (pilot.masterAcc.pilotLimSum || 0) / (pilot.masterAcc.pilotLimN || 1);
    const action = PL().planMaster(sum, master, targetId(), pilot.masterLocked, prefs.scopes, pilot.masterSpent);
    if (action) {
      return startTreatment(action);
    }

    const st = d.state;
    setPilotStatus(
      st.balanced
        ? `Équilibre atteint · écoute du Master en cours${st.waiting.length ? ` (j'attends ${st.waiting.join(', ')})` : ''}`
        : st.waiting.length
          ? `J'écoute ${st.waiting.join(', ')}…`
          : 'Écoute…'
    );
  }
  function setPilotStatus(txt) {
    if (!pilot || pilot.status === txt) return;
    pilot.status = txt;
    const el = $('#amPilotStatus');
    if (el) el.textContent = txt;
  }
  function pilotStart() {
    if (pilot) return;
    endTry();
    if (ab === 'A') setAB('B');
    captureBaseline();
    pilot = { tk: PL().newTracker(), timer: null, ramp: null, lastMove: -Infinity, log: [], locked: new Set(), moved: new Map(), expect: new Map(), status: '' };
    pilot.masterAcc = A().newAccumulator();
    pilot.masterExpect = new Map();
    pilot.masterLocked = new Set();
    pilot.masterSpent = {};
    resetTrackSession();
    pilot.masterSnapshots = Object.fromEntries(['eq', 'comp', 'lim'].map((m) => [m, masterSnapshot(m)]));
    pilot.unsub = L().subscribe((f) => {
      if (!pilot) return;
      PL().feed(pilot.tk, f, pilot.ramp ? new Set(pilot.ramp.moves.map((m) => m.id)) : null);
      if (!pilot.ramp) {
        A().accumulate(pilot.masterAcc, f);
        pilot.masterAcc.pilotLimSum = (pilot.masterAcc.pilotLimSum || 0) + Math.abs(f.masterLimGr || 0);
        pilot.masterAcc.pilotLimN = (pilot.masterAcc.pilotLimN || 0) + 1;
      }
    });
    pilot.timer = setInterval(pilotTick, 40);
    pilotLog('Pilote auto en marche : équilibre des faders, traitements piste par piste, puis Master global');
    if (!SS.audio.isPlaying() || SS.audio.isPaused()) app.play();
    renderAll();
  }
  function pilotStop() {
    if (!pilot) return;
    if (pilot.ramp) {
      // le geste en cours s'arrête là où il est
      pilot.ramp = null;
      app.changed();
    }
    clearInterval(pilot.timer);
    pilot.unsub();
    const n = [...pilot.moved.values()].filter((v) => v > 0).length;
    pilot = null;
    SS.mixer.showPilotAction();
    // les mesures d'avant ne valent plus pour les nouveaux faders : le diagnostic repart de zéro
    L().reset();
    diag = null;
    frozen = false;
    lastDiagAt = 0;
    if (n) SS.ui.toast(`Pilote auto arrêté : ${n} fader${n > 1 ? 's' : ''} réglé${n > 1 ? 's' : ''} — Ctrl+Z pour revenir en arrière`, 3500);
    SS.mixer.render();
    renderAll();
  }
  function renderPilot() {
    const box = $('#amPilot');
    if (!box) return;
    const on = !!pilot;
    ['amCards', 'amFoot', 'amScore', 'amTargets'].forEach((id) => { $('#' + id).hidden = on; });
    box.classList.toggle('running', on);
    const ramp = pilot && pilot.ramp;
    box.replaceChildren(...[
      h('h4', { class: 'am-pilot-title' }, on ? 'Pilote auto · en cours' : 'Pilote auto · mix et mastering'),
      on ? h('p', { class: 'am-pilot-progress' },
        `${project().tracks.filter((t) => !t.mute && pilot.trackDone.has(t.id)).length}/${project().tracks.filter((t) => !t.mute).length} pistes vérifiées · ` +
        ({ balance: 'Équilibrage du mix', track: 'Traitement de ' + nameOf(pilot.currentTrack), relisten: 'Réécoute du mix', master: project().tracks.some((t) => !t.mute && !pilot.trackDone.has(t.id)) ? 'Master global · pistes non entendues en attente' : 'Master global' })[pilot.phase]) : null,
      h('div', { class: 'am-pilot-row' },
        h('button', {
          type: 'button',
          id: 'amPilotBtn',
          class: 'btn btn-small am-pilot-btn' + (on ? ' on' : ''),
          'aria-pressed': String(on),
          title: on ? 'Arrêter le pilote auto' : 'Équilibrer les faders, traiter les pistes une par une et régler le Master',
          onclick: () => (on ? pilotStop() : pilotStart()),
        }, on ? '◼ Arrêter le pilote' : '✈ Démarrer le pilote auto'),
        h('span', { id: 'amPilotStatus', class: 'am-pilot-status', role: 'status' }, on ? pilot.status || 'Écoute…' : '')),
      ramp && ramp.master ? h('div', { class: 'am-pilot-task' }, h('b', {}, ramp.master.title),
        ...ramp.master.changes.map((c) => h('div', {}, h('span', {}, pathLabel(c, { changes: ramp.master.changes, track: ramp.master.track || '__master' })), h('strong', {}, `${A().formatValue(c.path, c.from)} → ${A().formatValue(c.path, c.to)}`)))) : ramp ? h('div', { class: 'am-pilot-task' },
        h('b', {}, ramp.moves.length > 1 ? 'Niveau d’ensemble' : nameOf(ramp.moves[0].id)),
        h('span', {}, 'Réglage des faders'),
        ...ramp.moves.map((m) => h('div', {}, h('span', {}, nameOf(m.id)), h('strong', {}, `${fmtDb(m.from)} → ${fmtDb(m.to)}`))),
        ramp.drive ? h('div', {}, h('span', {}, 'Master · gain d’entrée'), h('strong', {}, `${fmtDb(ramp.drive.from)} → ${fmtDb(ramp.drive.to)}`)) : null
      ) : null,
      on
        ? h('section', { class: 'am-pilot-history' }, h('h4', {}, 'Dernières actions'),
          h('ol', { class: 'am-pilot-log', 'aria-live': 'polite' }, pilot.log.map((x) => h('li', {},
            h('time', { datetime: new Date(x.at).toISOString() }, new Date(x.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), h('span', {}, x.txt)))))
        : h('p', { class: 'am-hint' }, 'Équilibre du mix, traitements piste par piste, puis Master global. Après chaque piste : 10 s de réécoute du mix avant la suivante. Les pistes non entendues restent en attente. Retouche un module pour le reprendre en main ; Ctrl+Z annule chaque geste.')
    ].filter((child) => child != null));
  }

  /** Le mix vient d'être remis à zéro depuis la console : mesures, conseils et pilote repartent de zéro. */
  function mixReset() {
    endTry();
    if (ab === 'A') setAB('B');
    baseline = null;
    decisions.clear();
    adjusting.clear();
    picks.clear();
    L().reset();
    SS.audio.resetLoudness();
    diag = null;
    frozen = false;
    lastDiagAt = 0;
    if (pilot) {
      pilot.ramp = null;
      SS.mixer.showPilotAction();
      pilot.tk = PL().newTracker();
      pilot.masterAcc = A().newAccumulator();
      pilot.masterExpect.clear();
      pilot.masterLocked.clear();
      pilot.masterSpent = {};
      resetTrackSession();
      pilot.masterSnapshots = Object.fromEntries(['eq', 'comp', 'lim'].map((m) => [m, masterSnapshot(m)]));
      pilot.locked.clear();
      pilot.moved.clear();
      pilot.expect.clear();
      pilot.lastMove = -Infinity;
      pilotLog('Mix réinitialisé : je réécoute tout');
    }
    renderAll();
  }

  /* ------------------------------------------------------------------ actions */
  function relisten() {
    endTry();
    if (ab === 'A') setAB('B');
    L().reset();
    SS.audio.resetLoudness();
    for (const [id, d] of decisions) if (d.st !== 'refused') decisions.delete(id);
    adjusting.clear();
    frozen = false;
    diag = null;
    if (pilot) { pilot.tk = PL().newTracker(); pilot.masterAcc = A().newAccumulator(); }
    app.stop();
    app.play();
    renderAll();
  }

  function poll() {
    if (!isOpen) return;
    renderStatus();
    if (pilot) {
      const ol = document.querySelector('#amPilot .am-pilot-log');
      if (ol && ol.childElementCount !== pilot.log.length) renderPilot();
      return; // le pilote et les conseils sont deux modes exclusifs
    }
    // un Ctrl+Z (ou une retouche à la main) a défait un conseil appliqué : les cartes se remettent à jour
    const n = decisions.size;
    syncDecisions();
    if (decisions.size !== n) renderAll();
    const secs = L().secs();
    if (secs >= prefs.minSecs && (!frozen || !diag) && performance.now() - lastDiagAt > 2000) {
      const had = diag && diag.ready;
      rediagnose();
      if (diag) {
        renderScore();
        renderCards();
        renderFoot();
        decorate();
        if (!had && diag.ready) SS.ui.toast('Auto Mix : premier diagnostic prêt', 2200);
      }
    }
  }

  /* ------------------------------------------------------------------ préférences (fenêtre) */
  function openPrefs() {
    let dlg = $('#automixPrefs');
    if (!dlg) {
      dlg = h('dialog', { id: 'automixPrefs', class: 'am-prefs', 'aria-labelledby': 'amPrefsTitle' });
      document.body.append(dlg);
    }
    const save = () => {
      savePrefs();
      if (L().summary()) rediagnose();
      renderAll();
    };
    const scopes = A().SCOPES.map((sc) => {
      const cb = h('input', { type: 'checkbox', id: 'amScope_' + sc.id, checked: prefs.scopes[sc.id] });
      cb.addEventListener('change', () => ((prefs.scopes[sc.id] = cb.checked), save()));
      return h('label', { class: 'am-pref-row', for: 'amScope_' + sc.id }, cb, h('span', {}, h('b', {}, sc.name), h('small', {}, sc.desc)));
    });
    const radio = (name, value, label, desc, checked, on) => {
      const r = h('input', { type: 'radio', name, id: `am_${name}_${value}`, value, checked });
      r.addEventListener('change', () => r.checked && (on(value), save()));
      return h('label', { class: 'am-pref-row', for: `am_${name}_${value}` }, r, h('span', {}, h('b', {}, label), desc ? h('small', {}, desc) : null));
    };
    const targets = [
      radio('amTarget', 'auto', 'Automatique', `Proposé d'après le style du morceau (ici : ${A().TARGETS[proposed()].name})`, prefs.target === 'auto', (v) => ((prefs.target = v), (targetPick = null))),
      ...Object.entries(A().TARGETS).map(([id, T]) => radio('amTarget', id, T.name, T.desc, prefs.target === id, (v) => ((prefs.target = v), (targetPick = null)))),
    ];
    const detail = [
      radio('amDetail', 'all', 'Tous les conseils', 'Y compris les finitions', prefs.detail === 'all', (v) => (prefs.detail = v)),
      radio('amDetail', 'important', 'Seulement l\'essentiel', 'Conseils prioritaires et conseillés', prefs.detail === 'important', (v) => (prefs.detail = v)),
    ];
    const secs = h('select', { id: 'amMinSecs' }, [10, 20, 30, 60].map((v) => h('option', { value: v, selected: prefs.minSecs === v }, v + ' s')));
    secs.addEventListener('change', () => ((prefs.minSecs = +secs.value), save()));
    dlg.replaceChildren(
      h('div', { class: 'am-prefs-head' }, h('h3', { id: 'amPrefsTitle' }, 'Préférences Auto Mix'), h('button', { type: 'button', class: 'mx-close', onclick: () => dlg.close() }, 'Fermer')),
      h('div', { class: 'am-prefs-body' },
        h('section', {}, h('h4', {}, 'Ce que l\'assistant peut modifier'), h('p', { class: 'am-hint' }, 'Les conseils qui touchent un réglage décoché ne sont pas proposés.'), ...scopes),
        h('section', {}, h('h4', {}, 'Objectif par défaut'), ...targets),
        h('section', {}, h('h4', {}, 'Conseils affichés'), ...detail,
          h('label', { class: 'am-pref-row', for: 'amMinSecs' }, h('span', {}, h('b', {}, 'Écoute avant le premier diagnostic'), h('small', {}, 'Plus long = plus fiable')), secs))
      ),
      h('div', { class: 'am-prefs-foot' }, h('button', {
        type: 'button', class: 'btn btn-small',
        onclick: () => {
          prefs = A().cleanPrefs(null);
          targetPick = null;
          save();
          openPrefs();
        },
      }, 'Rétablir les réglages d\'origine'))
    );
    if (!dlg.open) dlg.showModal();
  }

  /* ------------------------------------------------------------------ ouverture / fermeture */
  function open() {
    if (!SS.mixer.isOpen()) SS.mixer.open();
    isOpen = true;
    $('#automix').hidden = false;
    document.body.classList.add('automix-open');
    $('#amBtn').classList.add('active');
    $('#amBtn').setAttribute('aria-pressed', 'true');
    L().start(project, null);
    clearInterval(timer);
    timer = setInterval(poll, 500);
    if (L().summary() && L().secs() >= prefs.minSecs) rediagnose();
    renderAll();
    // écran étroit : le panneau passe sous la console
    if (window.matchMedia('(max-width: 1000px)').matches) $('#automix').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function close() {
    if (!isOpen) return;
    pilotStop();
    endTry();
    if (ab === 'A') setAB('B');
    isOpen = false;
    clearInterval(timer);
    timer = null;
    L().stop();
    L().reset();
    SS.audio.resetLoudness();
    app.stop();
    syncDecisions();
    for (const [id, d] of decisions) if (d.st !== 'accepted') decisions.delete(id);
    adjusting.clear();
    picks.clear();
    diag = null;
    frozen = false;
    lastDiagAt = 0;
    $('#automix').hidden = true;
    document.body.classList.remove('automix-open');
    $('#amBtn').classList.remove('active');
    $('#amBtn').setAttribute('aria-pressed', 'false');
    decorate();
  }

  /** Un autre morceau est chargé : on repart de zéro. */
  function songChanged() {
    pilotStop();
    if (ab === 'A') setAB('B');
    L().reset();
    decisions.clear();
    adjusting.clear();
    picks.clear();
    trying = null;
    baseline = null;
    diag = null;
    frozen = false;
    targetPick = null;
    renderAll();
  }

  function init(appApi) {
    app = appApi;
    prefs = loadPrefs();
    $('#amBtn').addEventListener('click', () => (isOpen ? close() : open()));
    $('#amClose').addEventListener('click', close);
    $('#amPrefsBtn').addEventListener('click', openPrefs);
    const handle = $('#amResize');
    const panel = $('#automix');
    const resize = (width) => {
      const max = Math.min(720, Math.max(320, window.innerWidth - 360));
      const value = Math.round(clamp(width, 320, max));
      panel.style.setProperty('--am-width', value + 'px');
      handle.setAttribute('aria-valuenow', value);
      handle.setAttribute('aria-valuemax', max);
      try { localStorage.setItem('stepseq.automix.width', value); } catch (e) { /* stockage indisponible */ }
    };
    try { const saved = Number(localStorage.getItem('stepseq.automix.width')); if (saved) resize(saved); } catch (e) { /* stockage indisponible */ }
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag = { x: e.clientX, width: panel.getBoundingClientRect().width };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => { if (drag) resize(drag.width + drag.x - e.clientX); });
    handle.addEventListener('lostpointercapture', () => { drag = null; });
    handle.addEventListener('pointerup', (e) => { drag = null; handle.releasePointerCapture(e.pointerId); });
    handle.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      resize(e.key === 'Home' ? 320 : e.key === 'End' ? 720 : panel.getBoundingClientRect().width + (e.key === 'ArrowLeft' ? 20 : -20));
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 1000) resize(Number(handle.getAttribute('aria-valuenow'))); });
  }

  return {
    init, open, close, decorate, songChanged, mixReset, pilotStart, pilotStop,
    isOpen: () => isOpen,
    _state: () => ({ diag, decisions, baseline, prefs, ab, targetId: targetId(), pilot }),
  };
})();
