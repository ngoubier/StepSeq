/*
 * Changements de tonalité et de mode d'une scène à l'autre (fenêtre « Changement » de l'étape Accords, js/band.js).
 * Partie pure, sans DOM : les gestes du document de Nicolas « Changements de tonalité et de mode dans une chanson »
 * (refrain final un demi-ton plus haut, montée d'un ton préparée, accord pivot, relatif, parallèle, modes, bascule
 * lointaine), la tonalité d'arrivée, la grille d'accords de chaque geste, l'accord qui prépare l'arrivée (dominante
 * au dernier temps de la scène d'avant) et la pastille qui résume un changement (« ↗ ½ ton », « relatif »…).
 *
 * Une grille est celle de l'assistant : [{ step, len, degree, type, acc, bass? }] (degrés dans la tonalité de la scène,
 * voir js/harmony.js). Les grilles des gestes sont génériques (pas de mélodie ni de titre de chanson).
 */
window.SS = window.SS || {};

SS.keyChange = (() => {
  const H = () => SS.harmony;
  const pc = (n) => ((n % 12) + 12) % 12;
  const famOf = (mode) => ((H().MODES.find((m) => m.id === mode) || {}).fam === 'minor' ? 'minor' : 'major');
  const tonicPc = (t) => pc(SS.LETTER_PC[t[0]] + [...t.slice(1)].reduce((a, c) => a + (c === '♯' || c === '#' ? 1 : c === '♭' || c === 'b' ? -1 : 0), 0));
  /** Nom de tonique usuel (D♭ majeur, C♯ mineur) pour une classe de hauteur et un mode. */
  const tonicName = (p, mode) => SS.TONIC_NAMES[famOf(mode)][pc(p)];
  const same = (a, b) => !!a && !!b && tonicPc(a.tonic) === tonicPc(b.tonic) && a.mode === b.mode;

  /** Familles de gestes (puces de la fenêtre). */
  const FAMS = [
    { id: 'up', label: 'Monter' },
    { id: 'glide', label: 'Glisser' },
    { id: 'color', label: 'Changer de couleur' },
    { id: 'far', label: 'Surprendre' },
  ];
  /** Ce que le geste fait entendre (étiquettes des cartes, couleurs de la palette --c-*). */
  const TAGS = {
    lift: { label: 'Élan', color: 'orange' },
    surprise: { label: 'Surprise', color: 'pink' },
    arrive: { label: 'Aboutissement', color: 'amber' },
    smooth: { label: 'Continuité', color: 'teal' },
    intimate: { label: 'Intimité', color: 'blue-soft' },
    dark: { label: 'Assombrir', color: 'violet' },
    open: { label: 'Ouverture', color: 'teal' },
    wonder: { label: 'Émerveillement', color: 'yellow' },
    rock: { label: 'Terrien, rock', color: 'orange' },
    away: { label: 'Dépaysement', color: 'pink' },
    light: { label: 'Lumière', color: 'yellow' },
    tense: { label: 'Tension', color: 'red' },
  };

  /*
   * Les gestes, selon la couleur (majeure ou mineure) de la scène d'avant.
   *   iv    : demi-tons entre la tonique d'avant et la nouvelle ; mode : mode d'arrivée (null = celui d'avant)
   *   grid  : accords du geste, une mesure par élément, en degrés de la tonalité d'arrivée [degré, type, acc, basse]
   *           (un élément qui est une liste d'accords partage la mesure) ; null = la scène garde ses accords
   *   from  : la même idée côté scène d'avant (pour l'écoute de la carte), en degrés de la tonalité d'avant
   *   prep  : passage préparé par défaut (dominante de la nouvelle tonalité au dernier temps de la scène d'avant)
   */
  const MAJOR = [
    { id: 'demi', fam: 'up', label: 'Monter d’un demi-ton', iv: 1, mode: null, grid: null, prep: false, tags: ['lift', 'surprise'],
      tip: 'Toute la scène monte d’un demi-ton, mélodie comprise. La nouvelle tonique arrive à la basse sur le premier temps. Garde une doublure à l’octave pour plus tard si tu veux distinguer l’effet harmonique du renfort de texture.' },
    { id: 'ton', fam: 'up', label: 'Montée d’un ton préparée', iv: 2, mode: null, grid: null, prep: true, tags: ['arrive', 'lift'],
      tip: 'Toute la scène monte d’un ton. Préparé : le dernier temps de la scène d’avant devient la dominante de la nouvelle tonalité (La7 avant Ré) ; sa sensible monte vers la nouvelle tonique. Pour un refrain qui sonne comme un aboutissement.' },
    { id: 'pivot', fam: 'glide', label: 'Accord pivot vers la dominante', iv: 7, mode: 'major', prep: false, tags: ['smooth'],
      grid: [[[1, 'min']], [[4, '7']], [[0, 'maj']], [[3, 'maj'], [4, '7']]],
      tip: 'La scène part dans la tonalité de la dominante (Do → Sol) par un accord commun aux deux : Am est vi en Do puis ii en Sol. Le Fa♯ de D7 puis Sol font entendre le nouveau centre. Pour un pont qui s’éloigne en douceur.' },
    { id: 'rel', fam: 'glide', label: 'Pont au relatif mineur', iv: 9, mode: 'minor', prep: false, tags: ['intimate', 'smooth'],
      grid: [[[3, 'min']], [[4, '7']], [[0, 'min']], [[5, 'maj'], [4, '7']]],
      tip: 'Mêmes notes, autre point de repos : Do majeur → La mineur. La cadence E7 → Am et la basse sur La font entendre le déplacement. Une basse plus espacée accentue l’intimité.' },
    { id: 'par', fam: 'color', label: 'Mineur parallèle', iv: 0, mode: 'minor', prep: false, tags: ['dark'],
      grid: [[[0, 'min']], [[3, 'min']], [[4, '7']], [[0, 'min']]],
      tip: 'Même tonique, tierce abaissée : Do majeur → Do mineur. Le Mi♭ transforme l’accord de tonique ; fais-le revenir au repos final.' },
    { id: 'mixo', fam: 'color', label: 'Mixolydien', iv: 0, mode: 'mixolydian', prep: false, tags: ['rock'],
      grid: [[[0, 'maj']], [[6, 'maj', 0, 2]], [[3, 'maj', 0, 7]], [[0, 'maj']]],
      tip: 'Même tonique, septième abaissée (Si → Si♭ en Do), portée par l’accord ♭VII sur la tonique tenue à la basse. Pour un refrain rock.' },
    { id: 'lyd', fam: 'color', label: 'Lydien', iv: 0, mode: 'lydian', prep: false, tags: ['open', 'wonder'],
      grid: [[[0, 'maj']], [[1, 'maj', 0, 10]], [[1, 'maj', 0, 10]], [[0, 'maj']]],
      tip: 'Même tonique, quarte haussée (Fa♯ en Do), portée par D/C sur la tonique tenue. Un son tenu fait entendre l’ouverture de la quarte augmentée.' },
    { id: 'loin', fam: 'far', label: 'Bascule lointaine, note commune', iv: 8, mode: 'major', prep: false, tags: ['away', 'surprise'],
      grid: [[[0, 'maj']], [[3, 'maj']], [[4, '7']], [[0, 'maj']]],
      tip: 'Do majeur → La♭ majeur : peu de notes communes, mais Do reste (fondamentale de C, tierce de A♭). La cadence E♭7 → A♭ confirme la nouvelle tonique.' },
  ];
  const MINOR = [
    { id: 'demi', fam: 'up', label: 'Monter d’un demi-ton', iv: 1, mode: null, grid: null, prep: false, tags: ['lift', 'surprise'], tip: MAJOR[0].tip },
    { id: 'ton', fam: 'up', label: 'Montée d’un ton préparée', iv: 2, mode: null, grid: null, prep: true, tags: ['arrive', 'lift'],
      tip: 'Toute la scène monte d’un ton. Préparé : le dernier temps de la scène d’avant devient la dominante de la nouvelle tonalité (F♯7 avant Si mineur).' },
    { id: 'relM', fam: 'glide', label: 'Relatif majeur', iv: 3, mode: 'major', prep: false, tags: ['light', 'smooth'],
      grid: [[[3, 'maj']], [[4, '7']], [[0, 'maj']], [[4, '7'], [0, 'maj']]],
      tip: 'Mêmes notes, autre point de repos : La mineur → Do majeur. La basse et les fins de phrase se posent sur Do.' },
    { id: 'parM', fam: 'color', label: 'Majeur parallèle', iv: 0, mode: 'major', prep: false, tags: ['light'],
      grid: [[[0, 'maj']], [[3, 'maj']], [[4, '7']], [[0, 'maj']]],
      tip: 'Même tonique, tierce haussée : La mineur → La majeur. Une lumière nouvelle sur le même point d’appui.' },
    { id: 'dor', fam: 'color', label: 'Dorien', iv: 0, mode: 'dorian', prep: false, tags: ['open'],
      grid: [[[0, 'min']], [[3, 'maj', 0, 7]], [[3, 'maj', 0, 7]], [[0, 'min']]],
      tip: 'Même tonique, sixte haussée (Fa → Fa♯ en La), portée par l’accord IV majeur sur la tonique tenue. Pour un pont funk ou une boucle de techno mélodique.' },
    { id: 'phr', fam: 'color', label: 'Phrygien', iv: 0, mode: 'phrygian', prep: false, tags: ['tense', 'dark'],
      grid: [[[0, 'min']], [[1, 'maj', 0, 11]], [[0, 'min']], [[1, 'maj', 0, 11], [0, 'min']]],
      tip: 'Même tonique, seconde abaissée (Si → Si♭ en La), portée par ♭II sur la tonique tenue : plus sombre et plus tendu.' },
    { id: 'loin', fam: 'far', label: 'Bascule lointaine, note commune', iv: 8, mode: 'minor', prep: false, tags: ['away', 'surprise'],
      grid: [[[0, 'min']], [[3, 'min']], [[4, '7']], [[0, 'min']]],
      tip: 'La mineur → Fa mineur : Do reste (tierce de Am, quinte de Fm). La cadence C7 → Fm confirme la nouvelle tonique.' },
  ];

  /** Tonalité d'arrivée d'un geste depuis `from` ({ tonic, mode }). */
  function target(from, g) {
    const mode = g.mode || from.mode;
    return { tonic: tonicName(tonicPc(from.tonic) + g.iv, mode), mode };
  }
  /** Gestes possibles depuis la tonalité `from` (ceux qui ne changeraient rien sont écartés), avec leur arrivée. */
  function gestures(from) {
    const list = famOf(from.mode) === 'minor' ? MINOR : MAJOR;
    return list.map((g) => ({ ...g, to: target(from, g) })).filter((g) => !same(g.to, from));
  }
  const find = (from, id) => gestures(from).find((g) => g.id === id) || null;

  /** Grille d'un geste ([[degré, type, acc, basse]] par mesure) répétée sur `bars` mesures de `spb` pas. */
  function fitGrid(rows, bars, spb) {
    const out = [];
    for (let b = 0; b < bars; b++) {
      const row = rows[b % rows.length];
      const len = Math.floor(spb / row.length);
      row.forEach(([degree, type, acc = 0, bass = 0], i) => {
        const step = b * spb + i * len;
        out.push({ step, len: i === row.length - 1 ? spb - i * len : len, degree, type, acc, ...(bass ? { bass } : {}) });
      });
    }
    return out;
  }

  // types d'accord à trois sons et à quatre sons qu'on peut remplacer par ceux du nouveau mode
  const TRIADS = new Set(['maj', 'min', 'dim', 'aug']);
  const SEVENTHS = new Set(['maj7', 'm7', '7', 'm7b5']);
  /** Qualité diatonique d'un degré : triade (maj, min, dim, aug) et accord de septième. */
  function diatonic(key, degree) {
    const sc = H().scale(key).map((d) => d.pc);
    const iv = (k) => pc(sc[(degree + k) % 7] - sc[degree]);
    const t3 = iv(2);
    const t5 = iv(4);
    const t7 = iv(6);
    const triad = t3 === 4 ? (t5 === 8 ? 'aug' : 'maj') : t5 === 6 ? 'dim' : 'min';
    const seventh = triad === 'maj' ? (t7 === 11 ? 'maj7' : '7') : triad === 'min' ? 'm7' : triad === 'dim' ? 'm7b5' : 'maj7';
    return { triad, seventh };
  }
  /**
   * La grille d'une scène dans sa nouvelle tonalité. Même mode : rien ne change (les degrés suivent).
   * Autre mode : chaque accord diatonique prend la couleur du nouveau mode sur le même degré (C – G – Am – F en Do
   * majeur → Cm – Gm – A♭ – Fm en Do mineur) ; les emprunts, les accords altérés et la dominante V7 restent.
   */
  function adaptGrid(grid, from, to) {
    if (from.mode === to.mode) return grid.map((c) => ({ ...c }));
    return grid.map((c) => {
      if (c.acc) return { ...c };
      if (c.type === '7' && c.degree === 4) return { ...c };
      const d = diatonic(from, c.degree);
      const n = diatonic(to, c.degree);
      if (TRIADS.has(c.type) && c.type === d.triad) return { ...c, type: n.triad };
      if (SEVENTHS.has(c.type) && c.type === d.seventh) return { ...c, type: n.seventh };
      return { ...c };
    });
  }

  /** Dominante de `to` (V7) écrite dans la tonalité `from`, au format de la grille ; null si trop loin de la gamme. */
  function prepChord(from, to) {
    const root = pc(tonicPc(to.tonic) + 7);
    const g = H().toGridChord(from, { rootPc: root, type: '7' }, 4);
    return g ? { ...g, type: '7' } : null;
  }
  /** La grille de la scène d'avant avec la dominante de `to` sur son dernier temps (inchangée si impossible). */
  function withPrep(grid, from, to, total, beat) {
    const v = prepChord(from, to);
    if (!v || !grid.length) return grid.map((c) => ({ ...c }));
    const out = grid.map((c) => ({ ...c }));
    H().gridPut(out, { step: total - beat, len: beat, degree: v.degree, type: '7', acc: v.acc || 0 });
    return H().gridFill(out, total);
  }

  /** Nom court d'un mode (« dorien », « mineur »). */
  const modeWord = (m) => H().label({ tonic: 'C', mode: m }).replace(/^Do /, '');
  /**
   * Pastille d'un changement entre deux scènes qui se suivent (null si même tonalité) : « ↗ ½ ton », « ↘ 1 ton »,
   * « relatif », « dorien », « → Mi♭ majeur ».
   */
  function describe(from, to) {
    if (!from || !to || same(from, to)) return null;
    const d = pc(tonicPc(to.tonic) - tonicPc(from.tonic));
    if (to.mode === from.mode) {
      if (d === 1) return '↗ ½ ton';
      if (d === 2) return '↗ 1 ton';
      if (d === 11) return '↘ ½ ton';
      if (d === 10) return '↘ 1 ton';
    }
    if (!d) return modeWord(to.mode);
    const rel = (famOf(from.mode) === 'major' && famOf(to.mode) === 'minor' && d === 9) || (famOf(from.mode) === 'minor' && famOf(to.mode) === 'major' && d === 3);
    if (rel) return 'relatif';
    return '→ ' + H().label(to);
  }

  return { FAMS, TAGS, gestures, find, target, fitGrid, adaptGrid, diatonic, prepChord, withPrep, describe, same, tonicPc };
})();
