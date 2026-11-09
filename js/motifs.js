/*
 * Catalogue des motifs d'arpège prédéfinis, classés par catégorie.
 * Chaque motif est un petit réglage de l'arpégiateur : un mode du moteur (js/arp.js) ou un motif relatif
 * en degrés (d1 fondamentale, d3 tierce, d5 quinte, d7 septième ; + / − octave ; . silence),
 * éventuellement avec un rythme. Ils suivent donc l'accord joué.
 */
(function (root) {
  root.SS = root.SS || {};
})(typeof window !== 'undefined' ? window : globalThis);
var SS = (typeof window !== 'undefined' ? window : globalThis).SS;

SS.MOTIF_CATS = [
  { id: 'updown', label: 'Montées et descentes' },
  { id: 'groups', label: 'Groupes qui grimpent' },
  { id: 'leaps', label: 'Sauts et intervalles' },
  { id: 'bass', label: 'Basse et pédale' },
  { id: 'octaves', label: 'Octaves et répétitions' },
  { id: 'synth', label: 'Synthwave et années 80' },
  { id: 'chords', label: 'Accords et rythmes' },
  { id: 'random', label: 'Hasard' },
];

(() => {
  const m = (id, cat, name, arp, tags = '') => ({ id, cat, name, arp, tags });
  const pat = (pattern, extra = {}) => ({ mode: 'pattern', pattern, ...extra });
  const chordRhythm = (r) => ({ mode: 'chord', rhythm: { type: 'lane' }, lanes: { rhythm: r } });
  SS.MOTIFS = [
    m('up', 'updown', 'Montant', { mode: 'up' }, 'monte classique'),
    m('down', 'updown', 'Descendant', { mode: 'down' }, 'descend classique'),
    m('updown', 'updown', 'Montant / descendant', { mode: 'updown' }, 'aller retour pendule'),
    m('updown_rep', 'updown', 'Montant / descendant, extrêmes doublés', { mode: 'updown_rep' }, 'aller retour'),
    m('downup', 'updown', 'Descendant / montant', { mode: 'downup' }, 'retour aller'),
    m('played', 'updown', 'Ordre joué', { mode: 'played' }, 'clavier'),
    m('played_rev', 'updown', 'Ordre joué inversé', { mode: 'played_rev' }, 'clavier'),

    m('up2', 'groups', 'Double montée', { mode: 'up2' }, 'groupes de 4 grimpe'),
    m('down2', 'groups', 'Double descente', { mode: 'down2' }, 'groupes de 4'),
    m('up3', 'groups', 'Montée par 3', { mode: 'up3' }, 'groupes de 3 triolet'),
    m('down3', 'groups', 'Descente par 3', { mode: 'down3' }, 'groupes de 3'),
    m('climb2', 'groups', 'Montée par 2', { mode: 'climb2' }, 'paires'),
    m('fall2', 'groups', 'Descente par 2', { mode: 'fall2' }, 'paires'),
    m('rotate', 'groups', 'Rotation', { mode: 'rotate' }, 'décale chaque cycle'),

    m('thirds', 'leaps', 'Par sauts (1-3-2-4)', { mode: 'thirds' }, 'zigzag'),
    m('alberti', 'leaps', 'Alberti', { mode: 'alberti' }, 'classique piano mozart'),
    m('converge', 'leaps', 'Converge', { mode: 'converge' }, 'extérieur intérieur'),
    m('diverge', 'leaps', 'Diverge', { mode: 'diverge' }, 'intérieur extérieur'),
    m('pendule', 'leaps', 'Pendule', pat('d1 d3 d5 d3'), 'balancier'),
    m('quinte', 'leaps', 'Quinte et octave', pat('d1 d5 d1+ d5'), 'quinte octave'),
    m('ouvert', 'leaps', 'Accord ouvert', pat('d1 d5 d3+ d5'), 'large'),
    m('retour', 'leaps', 'Retour à la fondamentale', pat('d1 d3 d1 d5 d1 d1+'), 'fondamentale'),
    m('grandsauts', 'leaps', 'Grands sauts', pat('d1 d5+ d3 d1+'), 'large octave'),

    m('pedal', 'bass', 'Basse pivot', { mode: 'pedal' }, 'pédale fondamentale'),
    m('pedal_top', 'bass', 'Note haute pivot', { mode: 'pedal_top' }, 'pédale aiguë'),
    m('basseaccord', 'bass', 'Basse puis accord', pat('d1- d1 d3 d5'), 'grave'),
    m('basseoctave', 'bass', 'Basse et quinte', pat('d1- d5 d1 d5'), 'grave quinte'),
    m('pompe', 'bass', 'Basse qui pompe', pat('d1- d1- d5 d1- d1 d1- d5 d1-'), 'grave rythme'),
    m('pedalehaute', 'bass', 'Pédale aiguë', pat('d1+ d5 d1+ d3'), 'aigu'),

    m('octaves', 'octaves', 'Octaves', { mode: 'octaves' }, 'octave'),
    m('repeat', 'octaves', 'Notes doublées', { mode: 'repeat' }, 'répétition'),
    m('octpompe', 'octaves', 'Pompe d’octave', pat('d1 d1+ d1 d1+'), 'octave disco'),
    m('octmonte', 'octaves', 'Octaves qui montent', pat('d1 d1+ d3 d3+ d5 d5+'), 'octave'),
    m('rep422', 'octaves', 'Répétitions 4-2-2', pat('d1 d1 d1 d1 d3 d3 d5 d5'), 'répétition'),
    m('echo', 'octaves', 'Écho', pat('d1 . d1 d3 . d3 d5 .'), 'silence répétition'),

    m('midnight', 'synth', 'Midnight Drive', pat('d1 d5 d1+ d5 d3+ d5 d1+ d5'), 'synthwave'),
    m('italo', 'synth', 'Italo disco', pat('d1- d1 d1- d1'), 'octave basse disco'),
    m('pulse', 'synth', 'Pulse 1984', pat('d1 d1 d1+ d1 d5 d1 d1+ d1'), 'synthwave'),
    m('berlin', 'synth', 'Berlin School', { mode: 'pedal', octaves: 2 }, 'séquenceur tangerine'),
    m('progression', 'synth', 'Suiveur de progression', pat('d1 d3 d5 d3 d7 d5 d3 d5'), 'septième'),
    m('ostinato', 'synth', 'Ostinato de film', pat('d1 d5 d3+ d5 d1 d5 d1+ d5'), 'cinéma'),
    m('techno', 'synth', 'Techno euclidienne', { mode: 'updown', octaves: 2, rhythm: { type: 'euclid', hits: 5, steps: 16, rot: 0 } }, 'euclidien'),

    m('chord', 'chords', 'Accord à chaque pas', { mode: 'chord' }, 'accord plaqué'),
    m('croches', 'chords', 'Accord en croches', chordRhythm([1, 0]), 'accord'),
    m('stabs', 'chords', 'Stabs syncopés', chordRhythm([1, 0, 0, 1, 0, 0, 1, 0]), 'accord syncope'),
    m('charleston', 'chords', 'Charleston', chordRhythm([1, 0, 0, 1, 0, 0, 0, 0]), 'accord'),
    m('contretemps', 'chords', 'Contretemps', chordRhythm([0, 0, 1, 0]), 'accord reggae'),

    m('shuffle', 'random', 'Aléatoire sans répétition', { mode: 'shuffle' }, 'hasard'),
    m('random', 'random', 'Aléatoire', { mode: 'random' }, 'hasard'),
    m('walk', 'random', 'Promenade', { mode: 'walk' }, 'marche hasard'),
    m('drunk', 'random', 'Marche ivre', { mode: 'drunk' }, 'marche hasard'),
  ];
})();

/*
 * Motif reconnu dans des réglages d'arpège (fenêtre de l'arpégiateur et menu du piano roll),
 * et réglages à appliquer pour un motif. Les silences réglés pas à pas ne changent pas le motif reconnu,
 * sauf pour les motifs qui ont leur propre rythme (cherchés en premier).
 */
SS.motifOf = (arp) => {
  const A = SS.Arp;
  const a = A.normalize(arp);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const cands = SS.MOTIFS.filter((m) => {
    const x = A.normalize({ ...m.arp });
    if (x.mode !== a.mode || (a.mode === 'pattern' && x.pattern !== a.pattern)) return false;
    return !m.arp.octaves || m.arp.octaves === a.octaves;
  });
  const withRhythm = cands.find((m) => {
    if (!m.arp.rhythm) return false;
    const x = A.normalize({ ...m.arp });
    return x.rhythm.type === a.rhythm.type && (x.rhythm.type !== 'lane' || same(x.lanes.rhythm, a.lanes.rhythm.slice(0, x.lanes.rhythm.length)));
  });
  return withRhythm || cands.find((m) => !m.arp.rhythm && a.rhythm.type !== 'euclid') || null;
};

/** Réglages qui appliquent le motif m ; les silences réglés pas à pas sont gardés si l'ancien motif n'imposait pas de rythme. */
SS.motifPatch = (arp, m) => {
  const a = SS.Arp.normalize(arp);
  const prev = SS.motifOf(a);
  const keepSteps = !m.arp.rhythm && (!prev || !prev.arp.rhythm) && a.rhythm.type === 'lane';
  const patch = { mode: m.arp.mode, pattern: m.arp.pattern || '', preset: '' };
  if (m.arp.octaves) patch.octaves = m.arp.octaves;
  if (keepSteps) return patch;
  patch.rhythm = m.arp.rhythm || { ...a.rhythm, type: 'all' };
  patch.lanes = { ...a.lanes, rhythm: (m.arp.lanes && m.arp.lanes.rhythm) || [] };
  return patch;
};
