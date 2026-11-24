/*
 * Assistant « Nouvelle chanson » : panneau Mix auto, à droite (mélange des modes Conseils et Pilote auto d'Auto Mix).
 *
 * Il écoute l'écoute de l'assistant pendant la lecture (js/automix-listen.js), note le mix et propose des conseils
 * chiffrés (js/automix.js, même diagnostic que dans la Grille, objectif = référence commune js/mixref.js).
 *   - « À la main » : chaque conseil s'accepte (avec son dosage) ou se refuse.
 *   - « Auto » : le panneau applique lui-même, un petit geste à la fois, les conseils des familles qu'on l'autorise à
 *     toucher, puis réécoute avant le geste suivant ; les autres restent à accepter à la main.
 * Les réglages vont dans le mix de l'assistant (js/wizmix.js : fader de la tranche, ou réglages fins `mix.auto`) : ils
 * restent quand on change d'étape et passent dans la Grille à l'intégration.
 * Annuler : Ctrl+Z (ou ↶) défait le dernier réglage ; l'onglet Fait défait un réglage précis ou toute la session de mix
 * (retour au mix d'avant le premier réglage). A / B : écouter le mix d'avant la session et le mix actuel.
 */
window.SS = window.SS || {};

SS.wizAutoMix = (() => {
  const A = () => SS.automix;
  const LS = () => SS.automixListen;
  const W = () => SS.wizMix;
  const host = () => SS.band && SS.band.mixAuto;
  const PREFS_KEY = 'stepseq.wizautomix';
  const AUTO_GAP = 6; // secondes d'écoute entre deux gestes du mode Auto
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fr = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ',').replace('-', '−');
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
  const help = (txt, label) => (SS.helpTip ? SS.helpTip(txt, label) : null);

  /** Familles que le mode Auto peut toucher (SCOPES d'Auto Mix), avec un nom court. */
  const FAMILIES = [
    ['fader', 'Volumes'], ['eq', 'Égaliseur'], ['comp', 'Compresseur · limiteur'], ['pan', 'Pan'],
    ['sidechain', 'Sidechain'], ['sends', 'Envois'], ['mastereq', 'EQ Master'], ['mastering', 'Mastering'],
  ];
  /** Noms courts des critères d'Auto Mix (cases de 4 par ligne). */
  const CRIT_SHORT = { loud: 'Volume', dyn: 'Dynamique', tone: 'Tonalité', bal: 'Équilibre', low: 'Graves', stereo: 'Stéréo', head: 'Marge' };
  const AUTO_DEFAULT = { fader: true, eq: true, comp: true, pan: false, sidechain: false, sends: false, mastereq: true, mastering: true };

  let prefs = null;
  let isOpen = false;
  let root = null;
  let btn = null;
  let timer = null;
  let proj = null; // projet d'écoute entendu (une nouvelle écoute repart de zéro)
  let diag = null;
  let lastDiag = 0;
  let tab = 'mix';
  let ab = 'B';
  let start = null; // mix d'avant le premier réglage de la session
  let bMix = null; // mix actuel mis de côté pendant l'écoute A
  const decisions = new Map(); // id du conseil -> 'accepted' | 'refused'
  const doses = new Map(); // id -> dosage choisi (0,25..1,5)
  let log = []; // réglages appliqués, du plus récent au plus ancien : { sid, title, track, by, entries }
  let lastAuto = 0; // secondes d'écoute au dernier geste du mode Auto
  let status = '';

  /* ------------------------------------------------------------------ préférences */
  function loadPrefs() {
    let p = null;
    try {
      p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    } catch (e) {
      p = null;
    }
    const o = { auto: false, target: 'auto', scopes: { ...AUTO_DEFAULT } };
    if (p && typeof p === 'object') {
      o.auto = !!p.auto;
      if (p.target && (p.target === 'auto' || A().TARGETS[p.target])) o.target = p.target;
      if (p.scopes) for (const [k] of FAMILIES) if (typeof p.scopes[k] === 'boolean') o.scopes[k] = p.scopes[k];
    }
    return o;
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* stockage indisponible */
    }
  }

  /* ------------------------------------------------------------------ contexte */
  const names = () => (host() ? host().names() : {});
  const listenProj = () => (host() ? host().project() : null);
  const targetId = (p) => (prefs.target !== 'auto' ? prefs.target : A().proposeTarget((p || listenProj() || { tracks: [] }).tracks));
  /** Nom d'une piste d'écoute : celui de sa tranche (Kick, Basse…). */
  function nameOfTrack(p, t) {
    const id = W().idOf(t);
    return (id && names()[id]) || t.name;
  }
  function context(p) {
    const mp = SS.masterParams(p);
    return {
      tracks: p.tracks.map((t) => ({
        id: t.id,
        mute: !!t.mute,
        name: nameOfTrack(p, t),
        band: t.band,
        role: A().roleOf(t),
        mix: SS.mixParams(t),
        fx: SS.fxParams(t),
        volumeDb: SS.gainToDb(typeof t.volume === 'number' ? t.volume : 0.8),
      })),
      master: { ...mp, volumeDb: SS.gainToDb(mp.volume) },
      target: targetId(p),
      prefs: A().cleanPrefs({ detail: 'all', minSecs: 15 }),
    };
  }
  /** Changements effectifs d'un conseil (une chaîne : tous ses modules). */
  const changesOf = (s) => (s.kind === 'chain' ? s.modules.flatMap((m) => m.changes) : s.changes);
  /** Famille d'un conseil (pour le mode Auto). */
  const familyOf = (s) => s.scope;
  const pending = () => (diag && diag.ready ? diag.suggestions.filter((s) => !decisions.has(s.id)) : []);

  /* ------------------------------------------------------------------ appliquer / annuler */
  function accept(s, by = 'main') {
    const hp = host();
    const p = listenProj();
    if (!hp || !p || ab === 'A') return false;
    const mix = hp.mix();
    if (!start) start = clone(mix);
    const k = doses.get(s.id) || 1;
    const entries = W().fromSuggestion(mix, p, s.track, changesOf(s), k);
    if (!entries.length) return false;
    decisions.set(s.id, 'accepted');
    log.unshift({ sid: s.id, title: s.title, track: s.track, by, entries });
    hp.changed();
    return true;
  }
  /** Défait le réglage n° i du journal (0 = le plus récent). */
  function undoAt(i) {
    const hp = host();
    const it = log[i];
    if (!hp || !it) return false;
    W().revert(hp.mix(), it.entries);
    log.splice(i, 1);
    decisions.delete(it.sid);
    if (!log.length) start = null;
    hp.changed();
    status = `Annulé : ${it.title}`;
    render();
    return true;
  }
  /** Ctrl+Z dans l'assistant : défait le dernier réglage du Mix auto (false : rien à défaire ici). */
  function undo() {
    if (!isOpen || !log.length || !(host() && host().ready())) return false;
    if (ab === 'A') setAB('B');
    return undoAt(0);
  }
  /** Revient au mix d'avant la session. */
  function undoSession() {
    const hp = host();
    if (!hp || !start) return;
    if (ab === 'A') setAB('B');
    hp.setMix(clone(start));
    start = null;
    log = [];
    decisions.clear();
    status = 'Session de mix annulée';
    render();
  }
  function setAB(v) {
    const hp = host();
    if (!hp || v === ab || !start) return;
    if (v === 'A') {
      bMix = clone(hp.mix());
      hp.setMix(clone(start));
    } else if (bMix) {
      hp.setMix(bMix);
      bMix = null;
    }
    ab = v;
    render();
  }

  /* ------------------------------------------------------------------ écoute */
  function poll() {
    const hp = host();
    if (!isOpen || !hp) return;
    const p = listenProj();
    if (p !== proj) {
      // nouvelle écoute (chanson changée) : on réécoute tout
      proj = p;
      LS().reset();
      diag = null;
      lastAuto = 0;
      if (p) LS().start(() => listenProj());
    }
    const sum = LS().summary();
    const now = performance.now();
    if (p && sum && sum.mix.n && ab === 'B' && now - lastDiag > 1500) {
      diag = A().diagnose(sum, context(p));
      lastDiag = now;
      if (prefs.auto && hp.playing() && diag.ready) autoStep(sum.secs);
    }
    render();
  }
  /** Mode Auto : un geste (le conseil le plus important d'une famille permise), puis on réécoute. */
  function autoStep(secs) {
    if (secs - lastAuto < AUTO_GAP && lastAuto) return;
    const s = pending().find((x) => prefs.scopes[familyOf(x)]);
    if (!s) {
      status = pending().length ? 'Le reste attend ton accord' : 'Le mix est en place';
      return;
    }
    if (accept(s, 'auto')) {
      status = `Pilote : ${s.title}`;
      LS().reset(); // la suite se juge sur le mix réglé
      lastAuto = 0.001;
      diag = null;
    }
  }

  /* ------------------------------------------------------------------ dessin */
  function scoreClass(v) {
    return v >= 75 ? 'ok' : v >= 55 ? 'mid' : 'bad';
  }
  function head() {
    const tgt = h('select', { class: 'wam-target', 'aria-label': 'Objectif', onchange: (e) => ((prefs.target = e.target.value), savePrefs(), (diag = null), render()) },
      h('option', { value: 'auto', selected: prefs.target === 'auto' }, `Style : ${A().TARGETS[targetId()] ? A().TARGETS[targetId()].name : '—'}`),
      ...Object.entries(A().TARGETS).map(([id, t]) => h('option', { value: id, selected: prefs.target === id }, `${t.name} · ${fr(t.lufs)} LUFS`)));
    const sw = h('div', { class: 'wam-sw', role: 'radiogroup', 'aria-label': 'Accepter les conseils' },
      ...[[false, 'À la main'], [true, 'Auto']].map(([v, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(prefs.auto === v), class: prefs.auto === v ? 'on' + (v ? ' auto' : '') : '', 'data-auto': String(v), onclick: () => ((prefs.auto = v), savePrefs(), (status = ''), render()) }, t)));
    const fams = h('div', { class: 'wam-fams' }, ...FAMILIES.map(([id, n]) => h('button', { type: 'button', class: 'wam-fam' + (prefs.scopes[id] ? ' on' : ''), 'data-fam': id, 'aria-pressed': String(!!prefs.scopes[id]), onclick: () => ((prefs.scopes[id] = !prefs.scopes[id]), savePrefs(), render()) }, n)));
    return [
      h('div', { class: 'wam-row' }, h('span', { class: 'wam-lbl' }, 'Objectif'), tgt),
      h('div', { class: 'wam-row' }, h('span', { class: 'wam-lbl' }, 'Accepter'), sw),
      h('div', { class: 'wam-row wam-top' }, h('span', { class: 'wam-lbl' }, 'Peut toucher', help('Ce que le mode Auto a le droit de régler tout seul. Les autres conseils restent à accepter à la main.', 'Peut toucher')), fams),
      prefs.auto ? h('div', { class: 'wam-autoline' }, h('i'), h('span', {}, status || (host() && host().playing() ? 'Pilote : écoute…' : 'Pilote : en attente de la lecture'))) : null,
    ];
  }
  function meter() {
    const sum = LS().summary();
    const t = A().TARGETS[targetId()];
    const i = sum && Number.isFinite(sum.master.i) ? sum.master.i : null;
    const tp = sum && Number.isFinite(sum.master.tp) ? sum.master.tp : null;
    const pos = (v) => Math.max(0, Math.min(100, ((v + 24) / 20) * 100));
    const minSecs = 15;
    const secs = LS().secs();
    const crits = diag && diag.ready ? A().CRITERIA.map((c) => h('div', { class: 'wam-crit ' + scoreClass(diag.scores[c.id]) }, h('b', {}, String(diag.scores[c.id])), CRIT_SHORT[c.id] || c.name)) : [];
    return h('div', { class: 'wam-listen' },
      h('div', { class: 'wam-lufs' }, h('b', {}, i == null ? '—' : fr(i)), h('small', {}, 'LUFS intégré'), h('span', { class: 'spacer' }), h('small', {}, 'crête '), h('b', { class: 'wam-tp' }, tp == null ? '—' : fr(tp)), h('small', {}, ' dBTP')),
      h('div', { class: 'wam-bar' }, t ? h('i', { class: 'wam-tgt', style: `left:${pos(t.lufs - 1)}%;width:${pos(t.lufs + 1) - pos(t.lufs - 1)}%` }) : null, i == null ? null : h('i', { class: 'wam-cur', style: `left:${pos(i)}%` })),
      h('div', { class: 'wam-scale' }, h('span', {}, '−24'), h('span', {}, '−18'), h('span', {}, '−12'), h('span', {}, '−6')),
      crits.length ? h('div', { class: 'wam-crits' }, ...crits, h('div', { class: 'wam-crit ' + scoreClass(diag.total) }, h('b', {}, String(diag.total)), 'Note')) : null,
      h('div', { class: 'wam-prog' }, h('i', { style: `width:${Math.min(100, (secs / minSecs) * 100)}%` })));
  }
  function card(s) {
    const p = listenProj();
    const tname = (tid) => (tid === '__master' ? 'Master' : p ? nameOfTrack(p, p.tracks.find((t) => t.id === tid) || { name: '?' }) : '?');
    const k = doses.get(s.id) || 1;
    const chg = changesOf(s).slice(0, 6).map((c) => {
      const v = A().valueAt(c, k);
      const val = (x) => (c.path === 'fx.scSource' ? (x ? tname(x) : 'aucune') : A().formatValue(c.path, x));
      return h('span', { class: 'wam-chg' }, h('span', {}, `${tname(c.track || s.track)} · ${A().pathName(c.path)}`), h('span', {}, `${val(c.from)} → `, h('em', {}, val(v))));
    });
    const sev = { crit: 'var(--c-red)', warn: 'var(--c-amber)', info: 'var(--c-blue)' }[s.sev] || 'var(--c-blue)';
    return h('div', { class: 'wam-card', 'data-id': s.id, style: `--sev:${sev}` },
      h('div', { class: 'wam-ct' }, h('span', {}, s.title), s.why ? help(s.why, s.title) : null),
      s.meas && s.meas.length ? h('div', { class: 'wam-meas' }, ...s.meas.map(([a, b], i) => h('span', {}, (i ? ' · ' : '') + a + ' ', h('b', {}, b)))) : null,
      h('div', { class: 'wam-chgs' }, ...chg),
      h('div', { class: 'wam-acts' },
        h('button', { type: 'button', class: 'btn btn-small btn-accent wam-ok', disabled: ab === 'A', onclick: () => (accept(s), render()) }, 'Accepter'),
        h('button', { type: 'button', class: 'btn btn-small wam-no', title: 'Refuser', onclick: () => (decisions.set(s.id, 'refused'), render()) }, '✕'),
        h('label', { class: 'wam-dose', title: 'Dosage' }, 'Dosage', h('input', { type: 'range', min: 25, max: 150, step: 25, value: Math.round(k * 100), oninput: (e) => doses.set(s.id, Number(e.target.value) / 100), onchange: () => render() }))));
  }
  function list() {
    const L = pending();
    const n = (t) => L.filter((s) => s.tab === t).length;
    const tabs = h('div', { class: 'wam-tabs', role: 'tablist' }, ...[['mix', 'Instruments', n('mix')], ['master', 'Master', n('master')], ['log', 'Fait', log.length]].map(([id, t, c]) =>
      h('button', { type: 'button', role: 'tab', 'data-tab': id, 'aria-selected': String(tab === id), class: tab === id ? 'on' : '', onclick: () => ((tab = id), render()) }, t, h('span', { class: 'wam-n' }, String(c)))));
    let body;
    if (tab === 'log') {
      body = log.length
        ? [h('button', { type: 'button', class: 'btn btn-small wam-undo-all', onclick: undoSession }, '↶ Annuler toute la session de mix'),
          ...log.map((it, i) => h('div', { class: 'wam-card done' },
            h('div', { class: 'wam-ct' }, h('span', {}, it.title)),
            h('div', { class: 'wam-meas' }, it.by === 'auto' ? 'appliqué par le pilote' : 'accepté à la main'),
            h('div', { class: 'wam-acts' }, h('button', { type: 'button', class: 'btn btn-small wam-undo', onclick: () => undoAt(i) }, '↶ Annuler ce réglage'))))]
        : [h('p', { class: 'wam-hint' }, 'Rien d’appliqué pour l’instant.')];
    } else if (!diag || !diag.ready) {
      body = [h('p', { class: 'wam-hint' }, host() && host().playing() ? 'Écoute… les conseils arrivent après une quinzaine de secondes.' : 'Lance la lecture : le Mix auto écoute avant de proposer.')];
    } else {
      const items = L.filter((s) => s.tab === tab);
      body = items.length ? items.map(card) : [h('p', { class: 'wam-hint' }, '✓ Rien à corriger ici.')];
    }
    return [tabs, h('div', { class: 'wam-list' }, ...body)];
  }
  function foot() {
    const cur = pending().filter((s) => s.tab === tab);
    return h('div', { class: 'wam-foot' },
      h('div', { class: 'wam-ab', role: 'radiogroup', 'aria-label': 'Écoute avant / après', title: 'A : le mix d’avant la session · B : le mix actuel' },
        ...['A', 'B'].map((v) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(ab === v), class: ab === v ? 'on' : '', disabled: !start, onclick: () => setAB(v) }, v))),
      h('span', { class: 'wam-status' }, status),
      h('button', { type: 'button', class: 'btn btn-small wam-undo-last', title: 'Annuler le dernier réglage (Ctrl+Z)', disabled: !log.length, onclick: () => undoAt(0) }, '↶'),
      h('button', { type: 'button', class: 'btn btn-small wam-all', disabled: !cur.length || ab === 'A' || tab === 'log', onclick: () => (cur.forEach((s) => accept(s)), render()) }, 'Tout accepter'));
  }
  function render() {
    if (btn) {
      const n = pending().length;
      btn.classList.toggle('on', isOpen);
      btn.setAttribute('aria-pressed', String(isOpen));
      btn.querySelector('.wam-count').textContent = diag && diag.ready ? (n ? String(n) : '✓') : '';
    }
    if (!isOpen || !root) return;
    // ne pas redessiner sous la souris pendant un réglage de dosage
    if (root.contains(document.activeElement) && document.activeElement.type === 'range') return;
    root.replaceChildren(
      h('div', { class: 'wam-head' }, h('h2', {}, 'Mix auto'), help('Lance la lecture : le Mix auto écoute, note le mix et propose des réglages chiffrés. « À la main » : tu acceptes chaque conseil. « Auto » : il les applique lui-même, un petit geste à la fois, sur ce que tu l’autorises à toucher. Ctrl+Z annule le dernier réglage ; l’onglet Fait annule un réglage précis ou toute la session.', 'Mix auto'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'wam-x', 'aria-label': 'Fermer', onclick: close }, '×')),
      ...head().filter(Boolean),
      meter(),
      ...list(),
      foot()
    );
  }

  /* ------------------------------------------------------------------ ouverture */
  function open() {
    if (isOpen || !(host() && host().ready())) return;
    prefs = prefs || loadPrefs();
    isOpen = true;
    if (!root) {
      root = h('aside', { id: 'wizAutoMix', class: 'wam', 'aria-label': 'Mix auto' });
      document.body.append(root);
    }
    root.hidden = false;
    document.body.classList.add('wiz-am-open');
    proj = null;
    timer = setInterval(poll, 500);
    poll();
    render();
  }
  function close() {
    if (!isOpen) return;
    if (ab === 'A') setAB('B');
    isOpen = false;
    clearInterval(timer);
    timer = null;
    LS().stop();
    LS().reset();
    proj = null;
    diag = null;
    if (root) root.hidden = true;
    document.body.classList.remove('wiz-am-open');
    // la session se termine : ses réglages restent dans le mix (Ctrl+Z ne les défait plus)
    log = [];
    start = null;
    decisions.clear();
    status = '';
    render();
  }
  /** Bouton « Mix auto » dans la tête de l'assistant (étapes 3 à 12). */
  function place(show) {
    const bar = document.querySelector('#bandDialog .bw-headact');
    if (!bar) return;
    if (!btn) {
      btn = h('button', { type: 'button', id: 'wamBtn', class: 'btn wam-btn', 'aria-pressed': 'false', 'aria-controls': 'wizAutoMix', title: 'Mix auto : écoute la chanson et règle volumes, égaliseurs, compresseurs, limiteurs et mastering', onclick: () => (isOpen ? close() : open()) }, h('i', { class: 'wam-dot' }), 'Mix auto', h('span', { class: 'wam-count' }));
    }
    if (btn.parentNode !== bar) bar.prepend(btn);
    btn.hidden = !show;
    if (!show && isOpen) close();
    if (show) render();
  }

  /** Pour la boîte à outils Claude : mode Auto ou À la main, familles permises, refus d'un conseil. */
  function setMode(auto) {
    prefs = prefs || loadPrefs();
    prefs.auto = !!auto;
    savePrefs();
    render();
  }
  function setScopes(o) {
    prefs = prefs || loadPrefs();
    for (const [k] of FAMILIES) if (typeof o[k] === 'boolean') prefs.scopes[k] = o[k];
    savePrefs();
    render();
  }
  function refuse(id) {
    decisions.set(id, 'refused');
    render();
  }

  return {
    open, close, place, undo, undoAt, undoSession, setAB, accept, setMode, setScopes, refuse,
    isOpen: () => isOpen,
    _state: () => ({ prefs, diag, log, start, ab, decisions, tab }),
  };
})();
