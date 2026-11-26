/*
 * « Mes motifs » de basse : les motifs écrits dans la fenêtre « Mon motif de basse » (js/bassedit.js, bouton Avancé… de
 * l'étape Basse de l'assistant). Un motif = { id: 'my_…', name, meter, notes } ; notes au format des motifs du moteur
 * (js/bandsong.js BASS_RHYTHMS) : [pas, durée, note, vélocité, 'g' glissé?] ; note = demi-tons au-dessus de la fondamentale
 * de l'accord, ou 't' tierce, 's' septième, 'a' approche, 'n' accord suivant, 'c' chromatique.
 * Un motif voyage avec la chanson (S.wiz.myBass dans le brouillon, project.bassMotifs pour la Grille) et, si on le garde,
 * dans la bibliothèque du navigateur (localStorage) pour toutes les chansons. Fonctions pures en tête, testables sous Node.
 */
window.SS = window.SS || {};

SS.myBass = (() => {
  /** Lignes de l'éditeur, de l'aigu au grave, puis celles qui regardent l'accord suivant : [valeur, nom]. */
  const ROWS = [
    [19, 'Quinte haute'],
    [12, 'Octave'],
    ['s', 'Septième'],
    [9, 'Sixte'],
    [7, 'Quinte'],
    [5, 'Quarte'],
    ['t', 'Tierce'],
    [2, 'Seconde'],
    [0, 'Fondamentale'],
    [-5, 'Quinte grave'],
    ['a', '→ Approche'],
    ['n', '→ Accord suivant'],
    ['c', '→ Chromatique'],
  ];
  const SPECIAL = ['a', 'n', 'c'];
  const ROW_VALUES = ROWS.map((r) => r[0]);
  /** Nuances : fantôme, normale, appuyée. */
  const VELS = [0.4, 0.72, 0.92];
  const velOf = (v) => (v < 0.55 ? VELS[0] : v < 0.82 ? VELS[1] : VELS[2]);
  const METERS = { '4/4': [16, 4], '3/4': [12, 4], '6/8': [12, 6], '12/8': [24, 6] };
  const MAX_BARS = 2;
  const KEY = 'ss.mesMotifsBasse';

  /** Ligne la plus proche d'une note d'un motif du moteur (10, 11 → septième ; 3, 4 → tierce ; u1–u3 → approche…). */
  function toRow(n) {
    if (ROW_VALUES.includes(n)) return n;
    if (/^u\d$/.test(n)) return 'a';
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
    const m = ((n % 12) + 12) % 12;
    if (m === 10 || m === 11) return 's';
    if (m === 3 || m === 4) return 't';
    if (n >= 24) return 19;
    let best = 0;
    ROW_VALUES.filter((v) => typeof v === 'number').forEach((v) => Math.abs(v - n) < Math.abs(best - n) && (best = v));
    return best;
  }

  /** Notes propres : sur la grille des doubles, dans `bars` mesures de `spb` pas, une note par pas, triées. */
  function cleanNotes(list, spb = 16, bars = MAX_BARS) {
    const total = spb * bars;
    const out = [];
    (Array.isArray(list) ? list : []).forEach((x) => {
      if (!Array.isArray(x)) return;
      const s = Math.round(Number(x[0]));
      if (!Number.isFinite(s) || s < 0 || s >= total || out.some((y) => y[0] === s)) return;
      const l = Math.max(1, Math.min(total - s, Math.round(Number(x[1]) || 1)));
      const v = Math.max(0.1, Math.min(1, Number(x[3]) || 0.8));
      const e = [s, l, toRow(x[2]), Math.round(v * 100) / 100];
      if (x[4] === 'g') e.push('g');
      out.push(e);
    });
    return out.sort((a, b) => a[0] - b[0]);
  }

  /** Motif propre, ou null : { id, name, meter, notes }. */
  function clean(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !/^my_[\w-]{1,21}$/.test(m.id)) return null;
    const meter = METERS[m.meter] ? m.meter : '4/4';
    const name = String(m.name || '').trim().slice(0, 40) || 'Mon motif';
    return { id: m.id, name, meter, notes: cleanNotes(m.notes, METERS[meter][0]) };
  }
  /** Dictionnaire { id: motif } propre (project.bassMotifs, S.wiz.myBass). */
  function cleanMap(o) {
    const out = {};
    if (o && typeof o === 'object') Object.values(o).forEach((m) => (m = clean(m)) && (out[m.id] = m));
    return out;
  }
  /** Nombre de mesures d'un motif (1 ou 2). */
  const barsOf = (m) => (m && m.notes.some((x) => x[0] >= METERS[m.meter || '4/4'][0]) ? 2 : 1);
  const newId = () => 'my_' + Math.random().toString(36).slice(2, 10);
  /** Mesure d'un nombre de pas par mesure et de pas par temps (12 pas : 3/4 ou 6/8 selon le temps). */
  const meterOf = (spb, beat) => Object.keys(METERS).find((k) => METERS[k][0] === spb && METERS[k][1] === beat) || '4/4';

  /**
   * Notes de départ d'après un motif de l'appli : celles du moteur quand il est écrit en notes (BASS_RHYTHMS : lettres
   * gardées), sinon ce qu'il joue sur un accord tenu (Do mineur sur deux mesures), ramené aux lignes de l'éditeur.
   */
  function fromMotif(id, spb = 16, beat = 4) {
    const BS = SS.bandSong;
    if (!id || !BS) return [];
    const mine = BS.myBass && BS.myBass(id);
    if (mine) return cleanNotes(mine.notes, spb);
    const bar = BS.motifBar ? BS.motifBar(id) : 16;
    let ev = [];
    try {
      const sp = [0, 1].map((b) => ({ step: b * spb, len: spb, bar: b, chord: { rootPc: 0, type: 'min', tok: 'Cm' } }));
      ev = BS.bassEvents(sp, id, () => 0.5, [0, 2, 3, 5, 7, 8, 10], { spb, beat }).filter((e) => e.step < 2 * spb);
    } catch (e) {
      ev = [];
    }
    if (!ev.length) return [];
    const root = Math.min(...ev.map((e) => e.notes[0]).filter((n) => n % 12 === 0));
    const base = Number.isFinite(root) ? root : ev[0].notes[0];
    let notes = ev.map((e) => [e.step, e.len, toRow(e.notes[0] - base), e.vel, e.slide ? 'g' : undefined]);
    // un motif d'une mesure : la seconde mesure (identique) n'est pas gardée
    const one = notes.filter((x) => x[0] < spb);
    const two = notes.filter((x) => x[0] >= spb).map((x) => [x[0] - spb, ...x.slice(1)]);
    if (bar === spb && JSON.stringify(one) === JSON.stringify(two)) notes = one;
    return cleanNotes(notes, spb);
  }

  /* ---------- registre (le moteur joue les motifs connus) ---------- */
  let ver = 0;
  const seen = {};
  /** Fait connaître des motifs au moteur ; le compteur `ver` change si l'un d'eux est nouveau ou modifié. */
  function register(list) {
    const BS = SS.bandSong;
    if (!BS || !BS.addMyBass) return;
    (Array.isArray(list) ? list : Object.values(list || {})).forEach((m) => {
      const c = clean(m);
      if (!c) return;
      const sig = JSON.stringify(c);
      if (seen[c.id] === sig) return;
      seen[c.id] = sig;
      BS.addMyBass(c);
      ver++;
    });
  }
  /** Le moteur oublie un motif (écriture annulée d'un nouveau motif). */
  function unregister(id) {
    if (!seen[id]) return;
    delete seen[id];
    if (SS.bandSong && SS.bandSong.removeMyBass) SS.bandSong.removeMyBass(id);
    ver++;
  }
  const version = () => ver;
  const get = (id) => (SS.bandSong && SS.bandSong.myBass ? SS.bandSong.myBass(id) : null);
  const isMine = (id) => /^my_/.test(id || '');

  /* ---------- bibliothèque du navigateur ---------- */
  function library() {
    try {
      return Object.values(cleanMap(Object.fromEntries((JSON.parse(localStorage.getItem(KEY) || '[]') || []).map((m) => [m && m.id, m]))));
    } catch (e) {
      return [];
    }
  }
  function writeLib(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      /* stockage indisponible : le motif reste dans la chanson */
    }
  }
  /** Garde (ou remplace) un motif dans la bibliothèque. */
  function keep(m) {
    const c = clean(m);
    if (!c) return;
    const list = library().filter((x) => x.id !== c.id);
    list.push(c);
    writeLib(list);
    register([c]);
  }
  const forget = (id) => writeLib(library().filter((x) => x.id !== id));
  const inLibrary = (id) => library().some((x) => x.id === id);
  /** Les motifs de la bibliothèque, connus du moteur dès le chargement de la page. */
  function boot() {
    if (typeof localStorage !== 'undefined') register(library());
  }

  /** Copie un motif écrit dans le projet (project.bassMotifs), pour qu'il voyage avec le fichier. */
  function toProject(p, id) {
    const m = clean(get(id));
    if (!p || !m) return;
    p.bassMotifs = { ...(p.bassMotifs || {}), [id]: m };
  }

  return { ROWS, SPECIAL, VELS, velOf, METERS, MAX_BARS, toRow, cleanNotes, clean, cleanMap, barsOf, newId, meterOf, fromMotif, register, unregister, version, get, isMine, library, keep, forget, inLibrary, boot, toProject };
})();
SS.myBass.boot();
