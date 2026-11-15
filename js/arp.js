/*
 * ARP ONE — moteur d'arpégiateur de StepSeq.
 *
 * Moteur pur et déterministe : aucune dépendance au DOM ni à Web Audio, aucun Math.random.
 * Avec le même accord, le même réglage (track.arp), la même graine et la même position de transport,
 * il produit exactement les mêmes notes (voir tests/arp.test.js).
 *
 * Dimensions indépendantes et combinables (spécification ARP ONE, §5) :
 *   - ordre des notes (mode)            : up, down, updown, converge, pedal, shuffle, walk, motif relatif…
 *   - rythme (rhythm)                   : tous les pas, euclidien (hits / steps / rotation) ou ligne de pas
 *   - lignes par pas (lanes)            : vélocité, gate, octave, ratchet, probabilité — chacune sa longueur
 *   - harmonie (harmony)                : notes de l'accord (défaut), notes de passage, approche chromatique
 *   - renversement (inversion)          : tel que joué (défaut), état fondamental, 1er / 2e / 3e renversement,
 *                                         renversement qui change à chaque boucle, ou le plus proche de l'accord
 *                                         précédent (enchaînement : info.events = les accords de la piste)
 *   - voicing                           : serré, ouvert, drop 2, drop 3, basse grave
 *   - lecture des lignes (laneDir)      : avant, arrière, ping-pong, hasard (par ligne)
 *   - écho (echo) et ratchet roulé (roll) : répétitions transposées, ratchets qui parcourent l'accord
 *   - macros PLAY                       : RATE, GATE, MOTION (LFO de timbre / dynamique), EVOLVE (variations)
 *
 * Vocabulaire :
 *   - « tick » k   : k-ième pas de l'arpège depuis le début de l'accord (à la vitesse RATE) ;
 *   - « trigger » j : k-ième pas qui joue effectivement (le mode d'ordre n'avance que sur les pas joués :
 *                    un silence rythmique ne fait pas sauter de note) ;
 *   - « loop » L   : nombre de passages complets de la boucle de la piste depuis Lecture (sert à EVOLVE).
 *
 * RATE est exprimé en pas d'arpège par double-croche (1 = 1/16, 0.5 = 1/8, 2 = 1/32, 1.5 = 1/16 triolet…),
 * ce qui reste compatible avec les projets enregistrés avant ARP ONE.
 */
(function (root) {
  const SS = (root.SS = root.SS || {});

  /* ------------------------------------------------------------------ */
  /* Catalogues                                                          */
  /* ------------------------------------------------------------------ */

  const MODES = [
    { id: 'up', label: 'Montant', group: 'Classiques' },
    { id: 'down', label: 'Descendant', group: 'Classiques' },
    { id: 'updown', label: 'Montant / Descendant', group: 'Classiques', hint: 'sans répéter les extrêmes' },
    { id: 'updown_rep', label: 'Montant / Descendant (extrêmes doublés)', group: 'Classiques' },
    { id: 'downup', label: 'Descendant / Montant', group: 'Classiques' },
    { id: 'played', label: 'Ordre joué', group: 'Classiques' },
    { id: 'played_rev', label: 'Ordre joué inversé', group: 'Classiques' },
    { id: 'converge', label: 'Converge (extérieur → intérieur)', group: 'Formes' },
    { id: 'diverge', label: 'Diverge (intérieur → extérieur)', group: 'Formes' },
    { id: 'pedal', label: 'Basse pivot (pédale)', group: 'Formes' },
    { id: 'pedal_top', label: 'Note haute pivot', group: 'Formes' },
    { id: 'thirds', label: 'Par sauts (1-3-2-4…)', group: 'Formes' },
    { id: 'up2', label: 'Double montée (montées de 4 qui grimpent)', group: 'Formes' },
    { id: 'down2', label: 'Double descente (descentes de 4 qui descendent)', group: 'Formes' },
    { id: 'up3', label: 'Montée par 3 (montées de 3 qui grimpent)', group: 'Formes' },
    { id: 'down3', label: 'Descente par 3', group: 'Formes' },
    { id: 'climb2', label: 'Montée par 2 (paires qui grimpent)', group: 'Formes' },
    { id: 'fall2', label: 'Descente par 2', group: 'Formes' },
    { id: 'alberti', label: 'Alberti (grave, aigu, milieu, aigu)', group: 'Formes' },
    { id: 'octaves', label: 'Octaves (chaque note puis son octave)', group: 'Formes' },
    { id: 'repeat', label: 'Notes doublées', group: 'Formes' },
    { id: 'rotate', label: 'Rotation (chaque cycle décale)', group: 'Formes' },
    { id: 'cascade', label: 'Cascade (petites descentes qui montent)', group: 'Génératifs' },
    { id: 'wave', label: 'Vague qui monte (arcs de 4 qui grimpent)', group: 'Génératifs' },
    { id: 'balance', label: 'Balancier qui s’élargit', group: 'Génératifs' },
    { id: 'fibo', label: 'Fibonacci (1, 1, 2, 3, 5…)', group: 'Génératifs' },
    { id: 'norgard', label: 'Série infinie (Nørgård)', group: 'Génératifs' },
    { id: 'random', label: 'Aléatoire (avec répétitions)', group: 'Aléatoires (graine)' },
    { id: 'shuffle', label: 'Aléatoire sans répétition par cycle', group: 'Aléatoires (graine)' },
    { id: 'walk', label: 'Marche aléatoire', group: 'Aléatoires (graine)' },
    { id: 'drunk', label: 'Marche ivre', group: 'Aléatoires (graine)' },
    { id: 'chord', label: 'Accord rythmique (toutes les notes)', group: 'Accords et motifs' },
    { id: 'pattern', label: 'Motif relatif personnalisé', group: 'Accords et motifs' },
  ];

  const RATES = [
    { id: 1 / 6, label: '1/4 pointée' },
    { id: 0.25, label: '1/4' },
    { id: 1 / 3, label: '1/8 pointée' },
    { id: 0.375, label: '1/4 triolet' },
    { id: 0.5, label: '1/8' },
    { id: 2 / 3, label: '1/16 pointée' },
    { id: 0.75, label: '1/8 triolet' },
    { id: 1, label: '1/16' },
    { id: 4 / 3, label: '1/32 pointée' },
    { id: 1.5, label: '1/16 triolet' },
    { id: 2, label: '1/32' },
    { id: 3, label: '1/32 triolet' },
    { id: 4, label: '1/64' },
  ];

  const HARMONY = [
    { id: 'chord', label: "Notes de l'accord", hint: 'aucune note hors accord' },
    { id: 'passing', label: 'Notes de passage', hint: 'sur les pas faibles, une note de la gamme entre deux notes de l’accord' },
    { id: 'chromatic', label: 'Approche chromatique', hint: 'sur les pas faibles, le demi-ton sous la note suivante' },
  ];

  /*
   * Renversements : la note à la basse change, les notes de l'accord restent les mêmes.
   *   C3 E3 G3 → état fondamental (C) ; E3 G3 C4 → 1er renversement (C/E) ; G3 C4 E4 → 2e renversement (C/G).
   * 'asis' garde les notes telles qu'elles sont posées sur la piste (comportement historique).
   */
  const INVERSIONS = [
    { id: 'asis', label: 'Tel que joué', short: 'Tel quel', hint: 'les notes de la piste, sans changement' },
    { id: 0, label: 'État fondamental', short: 'Fond.', hint: 'la fondamentale à la basse (C : Do Mi Sol)' },
    { id: 1, label: '1er renversement', short: '1er', hint: 'la tierce à la basse (C/E : Mi Sol Do)' },
    { id: 2, label: '2e renversement', short: '2e', hint: 'la quinte à la basse (C/G : Sol Do Mi)' },
    { id: 3, label: '3e renversement', short: '3e', hint: 'la septième à la basse (C7/B♭) ; sur un accord de 3 sons, revient à l’état fondamental' },
    { id: 'cycle', label: 'Tourne à chaque boucle', short: 'Tourne', hint: 'fondamental, puis 1er, puis 2e renversement… à chaque passage de la boucle' },
    { id: 'smooth', label: 'Le plus proche', short: 'Proche', hint: 'chaque accord prend le renversement qui bouge le moins depuis l’accord précédent (notes communes gardées)' },
  ];

  const VOICINGS = [
    { id: 'close', label: 'Serré', hint: 'les notes au plus près les unes des autres' },
    { id: 'open', label: 'Ouvert', hint: 'une note sur deux montée d’une octave (Do Sol Mi′) : plus large, plus « orchestre »' },
    { id: 'drop2', label: 'Drop 2', hint: 'la 2e note en partant du haut descend d’une octave (son jazz, Rhodes)' },
    { id: 'drop3', label: 'Drop 3', hint: 'la 3e note en partant du haut descend d’une octave (accords de 4 sons)' },
    { id: 'bass', label: 'Basse grave', hint: 'la note de basse descend d’une octave' },
  ];

  // hauteur : octave où commence l'accord (sa note la plus grave) ; 'asis' = telle que jouée
  const REGISTERS = [
    { id: 'asis', label: 'Telle quelle', hint: 'l’accord à la hauteur où il est posé sur la piste' },
    { id: 2, label: 'Grave · C2' },
    { id: 3, label: 'Médium · C3' },
    { id: 4, label: 'Aigu · C4' },
    { id: 5, label: 'Très aigu · C5' },
  ];

  const ECHO_SHIFTS = [
    { id: 'none', label: 'Même note' },
    { id: 'up1', label: '+1 degré', hint: 'chaque écho monte d’une note de l’accord' },
    { id: 'down1', label: '−1 degré', hint: 'chaque écho descend d’une note de l’accord' },
    { id: 'oct', label: '+octave' },
    { id: 'octdown', label: '−octave' },
    { id: 'fifth', label: '+quinte', hint: 'spirale de quintes (sort de l’accord)' },
  ];
  const ECHO_GAPS = [0.5, 1, 1.5, 2, 3, 4]; // en pas d'arpège

  const ROLLS = [
    { id: 'none', label: 'Non', hint: 'les répétitions d’un ratchet rejouent la même note' },
    { id: 'up', label: 'Monte', hint: 'chaque répétition monte d’une note de l’accord' },
    { id: 'down', label: 'Descend', hint: 'chaque répétition descend d’une note de l’accord' },
    { id: 'updown', label: 'Aller-retour', hint: 'monte puis redescend' },
  ];

  const LANE_DIRS = [
    { id: 'fwd', label: 'Avant' },
    { id: 'rev', label: 'Arrière' },
    { id: 'pingpong', label: 'Ping-pong' },
    { id: 'random', label: 'Hasard', hint: 'un pas au hasard à chaque fois (même graine, même résultat)' },
  ];

  const RETRIG = [
    { id: 'chord', label: 'À chaque accord' },
    { id: 'free', label: 'Libre (les lignes continuent)' },
  ];

  const LANES = {
    rhythm: { label: 'Rythme', min: 0, max: 1, def: 1, int: true },
    vel: { label: 'Vélocité', min: 0, max: 1, def: 1 },
    gate: { label: 'Gate', min: 0.1, max: 2, def: 1 },
    oct: { label: 'Octave', min: -2, max: 2, def: 0, int: true },
    ratchet: { label: 'Ratchet', min: 1, max: 4, def: 1, int: true },
    len: { label: 'Longueur', min: 0, max: 64, def: 0 }, // en doubles-croches ; 0 = longueur générale
    poly: { label: 'Notes à la fois', min: 1, max: 3, def: 1, int: true },
    prob: { label: 'Probabilité', min: 0, max: 1, def: 1 },
    deg: { label: 'Degré', min: -3, max: 3, def: 0, int: true }, // décalage en notes de l'accord
    div: { label: 'Vitesse du pas', min: 1, max: 4, def: 1, int: true }, // 2 = deux notes successives de l'arpège dans le pas
  };

  const DEFAULTS = {
    mode: 'up',
    rate: 2,
    octaves: 1,
    gate: 0.9, // fraction de la durée d'un pas d'arpège (> 1 : notes liées / superposées)
    motion: 0, // 0..1
    evolve: 0, // 0..1
    seed: 1,
    swing: 0.5, // 0.5 = droit, jusqu'à 0.75
    harmony: 'chord',
    inversion: 'asis',
    voicing: 'close',
    register: 'asis',
    macros: {}, // dernières positions des boutons rotatifs (mode Intuitif), 0..100
    echo: { n: 0, gap: 2, decay: 0.6, shift: 'none' },
    roll: 'none',
    laneDir: {},
    retrig: 'chord',
    pattern: '',
    range: [24, 108],
    freeze: false,
    freezeLoop: 0,
    preset: '',
    human: 0, // 0..1 : jeu humain (placement, vélocité, accents, longueurs)
    noteLen: 0, // longueur des notes en doubles-croches (4 = 1 temps) ; 0 = d'après GATE
    steps: 16, // longueur du motif édité pas à pas (interface)
    rhythm: { type: 'all', hits: 5, steps: 16, rot: 0 },
    lanes: { rhythm: [], vel: [], gate: [], oct: [], ratchet: [], prob: [], len: [], poly: [], deg: [], div: [] },
  };

  /* ------------------------------------------------------------------ */
  /* Presets de référence (§11) — données reproductibles                 */
  /* ------------------------------------------------------------------ */

  const PRESETS = [
    {
      id: 'classic', label: 'Classic Synth Up',
      desc: 'Montée sur 2 octaves en croches, gate 65 %, sans mutation.', chord: 'C', bpm: 110,
      arp: { mode: 'up', rate: 0.5, octaves: 2, gate: 0.65 },
    },
    {
      id: 'pulse84', label: '1984 Pulse',
      desc: 'Doubles-croches courtes et accentuées, filtre qui respire lentement.', chord: 'Am', bpm: 118,
      arp: { mode: 'up', rate: 1, octaves: 1, gate: 0.35, motion: 0.35, lanes: { vel: [1, 0.55, 0.75, 0.55] } },
    },
    {
      id: 'berlin', label: 'Berlin Endless',
      desc: 'Séquenceur analogique : basse pivot, accents sur 15 pas contre une ligne d’octaves de 7 — la boucle ne se répète jamais à l’identique.', chord: 'Am7', bpm: 124,
      arp: {
        mode: 'pedal', rate: 1, octaves: 2, gate: 0.5, motion: 0.5, evolve: 0.3,
        lanes: { vel: [1, 0.6, 0.7, 0.85, 0.6, 0.7, 1, 0.6, 0.75, 0.6, 0.9, 0.6, 0.7, 0.8, 0.6], oct: [0, 0, 1, 0, 0, 0, 1] },
      },
    },
    {
      id: 'midnight', label: 'Midnight Drive',
      desc: 'Motif synthwave ancré sur la fondamentale ; variations discrètes de densité.', chord: 'Am', bpm: 100,
      arp: { mode: 'pattern', pattern: 'd1 d5 d1+ d5 d3+ d5 d1+ d5', rate: 1, octaves: 1, gate: 0.55, evolve: 0.2, lanes: { vel: [1, 0.6, 0.8, 0.6] } },
    },
    {
      id: 'techno', label: 'Melodic Techno Rise',
      desc: 'Rythme euclidien 5/16 sur 2 octaves, gate et densité qui évoluent, break A/B.', chord: 'Fm', bpm: 124,
      arp: { mode: 'updown', rate: 1, octaves: 2, gate: 0.4, motion: 0.4, evolve: 0.6, rhythm: { type: 'euclid', hits: 5, steps: 16, rot: 0 } },
    },
    {
      id: 'ostinato', label: 'Cinematic Ostinato',
      desc: 'Notes fortes de l’accord sur les temps, voix mobile en contrepoint entre elles.', chord: 'Dm', bpm: 90,
      arp: { mode: 'pattern', pattern: 'd1 d5 d3+ d5 d1 d5 d1+ d5 d1 d5 d3+ d5 d1 d5 d7+ d5', rate: 1, octaves: 1, gate: 0.5, lanes: { vel: [1, 0.55, 0.7, 0.55] } },
    },
    {
      id: 'ambient', label: 'Ambient Bloom',
      desc: 'Noires lentes et longues qui se chevauchent, ordre aléatoire sans répétition, LFO de timbre.', chord: 'Cmaj7', bpm: 76,
      arp: { mode: 'shuffle', rate: 0.25, octaves: 2, gate: 1.8, motion: 0.7, evolve: 0.35 },
    },
    {
      id: 'chordrhythm', label: 'Chord Rhythm',
      desc: 'L’accord entier en stabs syncopés : une touche = un accord rythmique.', chord: 'Gm7', bpm: 112,
      arp: { mode: 'chord', rate: 1, octaves: 1, gate: 0.3, lanes: { rhythm: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0], vel: [1, 0.8, 0.8, 0.9] } },
    },
    {
      id: 'follower', label: 'Progression Follower',
      desc: 'Motif relatif aux degrés (fondamentale, tierce, quinte, septième) : il garde son identité sur Am – F – C – G.', chord: 'Am', bpm: 108,
      arp: { mode: 'pattern', pattern: 'd1 d3 d5 d3 d7 d5 d3 d5', rate: 1, octaves: 1, gate: 0.6, lanes: { vel: [1, 0.65, 0.8, 0.65] } },
    },
    {
      id: 'orbit', label: 'Poly Orbit',
      desc: 'Rythme de 15 pas contre des accents de 16 et des ratchets sur 6 : polymétrie sur le même accord.', chord: 'Em', bpm: 120,
      arp: {
        mode: 'up', rate: 1, octaves: 2, gate: 0.5, evolve: 0.15,
        lanes: { rhythm: [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1], vel: [1, 0.6, 0.6, 0.8, 0.6, 0.6, 0.9, 0.6, 1, 0.6, 0.6, 0.8, 0.6, 0.6, 0.9, 0.6], ratchet: [1, 1, 1, 1, 1, 2] },
      },
    },
  ];

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const mod = (a, n) => ((a % n) + n) % n;

  /**
   * Hachage entier → [0, 1). Les décisions aléatoires dépendent d'un index stable
   * (graine, accord, loop, pas…) et non de l'ordre d'évaluation : on peut recalculer n'importe quel pas.
   */
  function rnd(...xs) {
    let h = 0x811c9dc5;
    for (const x of xs) {
      h = Math.imul(h ^ (x | 0), 0x01000193);
      h ^= h >>> 15;
      h = Math.imul(h, 0x2c1b3c6d);
      h ^= h >>> 12;
      h = Math.imul(h, 0x297a2d39);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  }

  /** Réglages complets et bornés, à partir d'un objet partiel (anciens projets compris). */
  function normalize(a) {
    a = a && typeof a === 'object' ? a : {};
    const o = { ...DEFAULTS, ...a };
    o.mode = MODES.some((m) => m.id === o.mode) ? o.mode : 'up';
    o.rate = clamp(num(+o.rate, DEFAULTS.rate), 0.125, 8);
    o.octaves = clamp(Math.round(num(+o.octaves, 1)), 1, 4);
    o.gate = clamp(num(+o.gate, DEFAULTS.gate), 0.05, 2);
    o.motion = clamp(num(+o.motion, 0), 0, 1);
    o.evolve = clamp(num(+o.evolve, 0), 0, 1);
    o.seed = Math.round(clamp(num(+o.seed, 1), 0, 0x7fffffff));
    o.swing = clamp(num(+o.swing, 0.5), 0.5, 0.75);
    o.harmony = HARMONY.some((x) => x.id === o.harmony) ? o.harmony : 'chord';
    const inv = typeof o.inversion === 'string' && /^\d$/.test(o.inversion) ? +o.inversion : o.inversion;
    o.inversion = INVERSIONS.some((x) => x.id === inv) ? inv : 'asis';
    o.voicing = VOICINGS.some((x) => x.id === o.voicing) ? o.voicing : 'close';
    const reg = typeof o.register === 'string' && /^\d$/.test(o.register) ? +o.register : o.register;
    o.register = REGISTERS.some((x) => x.id === reg) ? reg : 'asis';
    const mc = a.macros && typeof a.macros === 'object' ? a.macros : {};
    o.macros = {};
    for (const k of ['density', 'width', 'motion', 'echo']) if (Number.isFinite(+mc[k]) && mc[k] !== null && mc[k] !== '') o.macros[k] = clamp(Math.round(+mc[k]), 0, 100);
    o.roll = ROLLS.some((x) => x.id === o.roll) ? o.roll : 'none';
    const ec = { ...DEFAULTS.echo, ...(a.echo && typeof a.echo === 'object' ? a.echo : {}) };
    o.echo = {
      n: clamp(Math.round(num(+ec.n, 0)), 0, 6),
      gap: ECHO_GAPS.reduce((b, g) => (Math.abs(g - num(+ec.gap, 2)) < Math.abs(b - num(+ec.gap, 2)) ? g : b), 2),
      decay: clamp(num(+ec.decay, 0.6), 0.1, 0.95),
      shift: ECHO_SHIFTS.some((x) => x.id === ec.shift) ? ec.shift : 'none',
    };
    const ld = a.laneDir && typeof a.laneDir === 'object' ? a.laneDir : {};
    o.laneDir = {};
    for (const k of ['rhythm', ...Object.keys(LANES)]) if (LANE_DIRS.some((x) => x.id === ld[k] && x.id !== 'fwd')) o.laneDir[k] = ld[k];
    o.retrig = RETRIG.some((x) => x.id === o.retrig) ? o.retrig : 'chord';
    o.pattern = typeof o.pattern === 'string' ? o.pattern.slice(0, 400) : '';
    const r = Array.isArray(o.range) ? o.range.map(Number) : DEFAULTS.range;
    const lo = clamp(Math.round(num(r[0], 24)), 0, 120);
    o.range = [lo, clamp(Math.round(num(r[1], 108)), lo + 12, 127)];
    o.freeze = !!o.freeze;
    o.freezeLoop = Math.max(0, Math.round(num(+o.freezeLoop, 0)));
    o.preset = typeof o.preset === 'string' ? o.preset.slice(0, 40) : '';
    o.human = clamp(num(+o.human, 0), 0, 1);
    o.noteLen = clamp(num(+o.noteLen, 0), 0, 64);
    o.steps = clamp(Math.round(num(+o.steps, 16)), 1, 64);
    if (a.geste && typeof a.geste === 'object') o.geste = normGeste(a.geste);
    else {
      delete o.geste;
      // ancien curseur « jeu humain » : converti en geste (décalages bornés, accent de départ)
      if (o.human > 0) {
        o.geste = normGeste({ id: '', spread: 1, alt: 0, micro: Math.round(12 * o.human), accent: Math.round(o.human * 50) / 100, art: Math.min(1, o.gate), legato: o.gate > 1 });
        o.human = 0;
      }
    }
    const rh = { ...DEFAULTS.rhythm, ...(a.rhythm && typeof a.rhythm === 'object' ? a.rhythm : {}) };
    rh.type = ['all', 'euclid', 'lane'].includes(rh.type) ? rh.type : 'all';
    rh.steps = clamp(Math.round(num(+rh.steps, 16)), 1, 64);
    rh.hits = clamp(Math.round(num(+rh.hits, 5)), 0, rh.steps);
    rh.rot = mod(Math.round(num(+rh.rot, 0)), rh.steps);
    o.rhythm = rh;
    const lanes = a.lanes && typeof a.lanes === 'object' ? a.lanes : {};
    o.lanes = {};
    for (const [k, spec] of Object.entries(LANES)) {
      const arr = Array.isArray(lanes[k]) ? lanes[k].slice(0, 64) : [];
      o.lanes[k] = arr.map((v) => {
        const x = clamp(num(+v, spec.def), spec.min, spec.max);
        return spec.int ? Math.round(x) : x;
      });
    }
    // une ligne de rythme remplie devient le rythme actif si rien d'autre n'est demandé
    if (o.lanes.rhythm.length && !(a.rhythm && a.rhythm.type)) o.rhythm.type = 'lane';
    return o;
  }

  /** Applique un preset : on repart des valeurs par défaut (aucun réglage caché ne survit). */
  function fromPreset(id, keep = {}) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return null;
    return normalize({ ...JSON.parse(JSON.stringify(p.arp)), seed: keep.seed != null ? keep.seed : 1, preset: p.id });
  }

  /* ------------------------------------------------------------------ */
  /* Reconnaissance d'accords (§5.5 « Recognize »)                       */
  /* ------------------------------------------------------------------ */

  const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const CHORD_TYPES = [
    { id: 'maj', sym: '', iv: [0, 4, 7] },
    { id: 'min', sym: 'm', iv: [0, 3, 7] },
    { id: '7', sym: '7', iv: [0, 4, 7, 10] },
    { id: 'maj7', sym: 'maj7', iv: [0, 4, 7, 11] },
    { id: 'm7', sym: 'm7', iv: [0, 3, 7, 10] },
    { id: 'm7b5', sym: 'm7b5', iv: [0, 3, 6, 10] },
    { id: 'dim', sym: 'dim', iv: [0, 3, 6] },
    { id: 'dim7', sym: 'dim7', iv: [0, 3, 6, 9] },
    { id: 'aug', sym: 'aug', iv: [0, 4, 8] },
    { id: 'sus2', sym: 'sus2', iv: [0, 2, 7] },
    { id: 'sus4', sym: 'sus4', iv: [0, 5, 7] },
    { id: '6', sym: '6', iv: [0, 4, 7, 9] },
    { id: 'm6', sym: 'm6', iv: [0, 3, 7, 9] },
    { id: 'add9', sym: 'add9', iv: [0, 2, 4, 7] },
    { id: 'madd9', sym: 'madd9', iv: [0, 2, 3, 7] },
    { id: '9', sym: '9', iv: [0, 2, 4, 7, 10] },
    { id: 'maj9', sym: 'maj9', iv: [0, 2, 4, 7, 11] },
    { id: 'm9', sym: 'm9', iv: [0, 2, 3, 7, 10] },
    { id: '5', sym: '5', iv: [0, 7] },
  ];
  // gamme « sûre » déduite de la qualité de l'accord (pour les notes de passage)
  const SCALE_OF = {
    maj: [0, 2, 4, 5, 7, 9, 11], maj7: [0, 2, 4, 5, 7, 9, 11], '6': [0, 2, 4, 5, 7, 9, 11], add9: [0, 2, 4, 5, 7, 9, 11], maj9: [0, 2, 4, 5, 7, 9, 11],
    sus2: [0, 2, 4, 5, 7, 9, 11], sus4: [0, 2, 4, 5, 7, 9, 10], '5': [0, 2, 4, 5, 7, 9, 11],
    '7': [0, 2, 4, 5, 7, 9, 10], '9': [0, 2, 4, 5, 7, 9, 10],
    min: [0, 2, 3, 5, 7, 8, 10], m7: [0, 2, 3, 5, 7, 8, 10], madd9: [0, 2, 3, 5, 7, 8, 10], m9: [0, 2, 3, 5, 7, 8, 10], m6: [0, 2, 3, 5, 7, 9, 10],
    dim: [0, 1, 3, 5, 6, 8, 10], m7b5: [0, 1, 3, 5, 6, 8, 10], dim7: [0, 2, 3, 5, 6, 8, 9, 11], aug: [0, 2, 4, 6, 8, 10],
  };

  /**
   * Hypothèses d'accord classées. Plusieurs analyses restent possibles (C6 = Am7/C) :
   * on renvoie un score et une confiance, sans jamais modifier les notes jouées.
   */
  function analyzeChord(notes) {
    const ns = [...new Set((notes || []).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!ns.length) return [];
    const pcs = [...new Set(ns.map((n) => mod(n, 12)))];
    const bass = mod(ns[0], 12);
    if (pcs.length === 1) return [{ root: pcs[0], type: 'note', name: NOTE[pcs[0]], score: 1, confidence: 1, bass }];
    const out = [];
    for (const r of pcs) {
      const set = new Set(pcs.map((p) => mod(p - r, 12)));
      for (const t of CHORD_TYPES) {
        const hit = t.iv.filter((i) => set.has(i)).length;
        const missing = t.iv.length - hit;
        const extra = set.size - hit;
        if (hit < 2 || !set.has(0)) continue;
        // la quinte peut manquer sans changer l'identité de l'accord ; la tierce, non
        const missPenalty = t.iv.reduce((s, i) => s + (set.has(i) ? 0 : i === 7 ? 0.35 : 1), 0);
        let score = hit - missPenalty * 1.1 - extra * 1.25 + (r === bass ? 0.6 : 0) - t.iv.length * 0.05;
        if (missing === 0 && extra === 0) score += 0.8;
        out.push({ root: r, type: t.id, score, bass });
      }
    }
    out.sort((a, b) => b.score - a.score || a.type.length - b.type.length);
    const best = out.slice(0, 4);
    if (!best.length) return [{ root: bass, type: 'cluster', name: NOTE[bass] + '(?)', score: 0, confidence: 0, bass }];
    const ex = best.map((h) => Math.exp(h.score * 1.6));
    const sum = ex.reduce((a, b) => a + b, 0);
    return best.map((h, i) => {
      const t = CHORD_TYPES.find((x) => x.id === h.type);
      const name = NOTE[h.root] + t.sym + (h.bass !== h.root ? '/' + NOTE[h.bass] : '');
      return { ...h, name, confidence: ex[i] / sum };
    });
  }

  /** Accord d'un événement, mis en cache (les notes d'un événement ne changent pas pendant un pas). */
  const chordCache = new Map();
  function chordOf(notes) {
    const key = notes.join(',');
    let c = chordCache.get(key);
    if (!c) {
      const best = analyzeChord(notes)[0] || { root: mod(notes[0] || 0, 12), type: 'note' };
      const sorted = [...notes].sort((a, b) => a - b);
      c = { ...best, sorted, scale: SCALE_OF[best.type] || SCALE_OF.maj };
      if (chordCache.size > 500) chordCache.clear();
      chordCache.set(key, c);
    }
    return c;
  }

  /** Tons de l'accord dans l'ordre des tierces (fondamentale, tierce, quinte, septième) puis tensions (9e…). */
  function chordTones(c) {
    const ivs = [...new Set(c.sorted.map((n) => mod(n - c.root, 12)))];
    const hasThird = ivs.includes(3) || ivs.includes(4);
    const key = (iv) => (hasThird && (iv === 1 || iv === 2) ? iv + 12 : iv); // 9e : tension, sauf dans un sus2
    ivs.sort((a, b) => key(a) - key(b));
    const core = ivs.filter((iv) => key(iv) < 12);
    const tens = ivs.filter((iv) => key(iv) >= 12);
    return { core, tens };
  }

  /**
   * Renversement n° inv de l'accord (0 = état fondamental). Voicing serré, construit en montant depuis la
   * basse : la basse est le ton n° inv, placé comme dans l'état fondamental bâti sur la fondamentale la plus
   * proche sous la note la plus grave jouée ; les doublures d'octave sont conservées (même nombre de notes),
   * les tensions (9e) restent au-dessus. Accord non reconnu (note seule, agrégat) : notes inchangées.
   */
  const invCache = new Map();
  function invertChord(notes, inv) {
    const ns = [...notes].filter(Number.isFinite).sort((a, b) => a - b);
    if (ns.length < 2) return ns;
    const key = ns.join(',') + '|' + inv;
    const hit = invCache.get(key);
    if (hit) return hit;
    const c = chordOf(ns);
    let out = ns;
    if (c.type !== 'note' && c.type !== 'cluster') {
      const { core, tens } = chordTones(c);
      if (core.length >= 2) {
        const i = mod(inv, core.length);
        const rootN = ns[0] - mod(ns[0] - c.root, 12); // fondamentale à la basse ou juste en dessous
        const nCore = Math.max(core.length, ns.length - tens.length);
        out = [rootN + core[i]];
        for (let k = 1; k < nCore; k++) {
          const pc = core[mod(i + k, core.length)];
          let n = out[k - 1] + 1;
          n += mod(c.root + pc - n, 12);
          out.push(n);
        }
        for (const iv of tens) {
          let n = out[out.length - 1] + 1;
          n += mod(c.root + iv - n, 12);
          out.push(n);
        }
      }
    }
    if (invCache.size > 500) invCache.clear();
    invCache.set(key, out);
    return out;
  }

  /** Voicing appliqué à des notes (triées en sortie). */
  function applyVoicing(ns, v) {
    const a = [...ns].sort((x, y) => x - y);
    const n = a.length;
    if (v === 'open' && n >= 3) for (let i = 1; i < n; i += 2) a[i] += 12;
    else if (v === 'drop2' && n >= 3) a[n - 2] -= 12;
    else if (v === 'drop3' && n >= 4) a[n - 3] -= 12;
    else if (v === 'bass' && n >= 2) a[0] -= 12;
    return a.sort((x, y) => x - y);
  }

  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  /** Mouvement des voix entre deux accords : chaque note va vers la note la plus proche de l'autre accord. */
  function motion(a, b) {
    const near = (x, arr) => arr.reduce((m, y) => Math.min(m, Math.abs(x - y)), Infinity);
    return b.reduce((s, x) => s + near(x, a), 0) + a.reduce((s, x) => s + near(x, b), 0);
  }
  const evSig = (e) => (e.step | 0) + ':' + e.notes.join(',');

  /**
   * Enchaînement : les accords de la piste dans l'ordre ; le premier reste tel que joué, chaque suivant prend le
   * renversement (± une octave) qui bouge le moins depuis le précédent, sans trop s'éloigner du registre joué.
   */
  const smoothCache = new Map();
  function smoothChain(events) {
    const evs = events.filter((e) => e && Array.isArray(e.notes) && e.notes.some(Number.isFinite)).slice().sort((a, b) => (a.step || 0) - (b.step || 0));
    const sig = evs.map(evSig).join(';');
    let m = smoothCache.get(sig);
    if (m) return m;
    m = new Map();
    let prev = null;
    for (const e of evs) {
      const ns = e.notes.filter(Number.isFinite).sort((a, b) => a - b);
      let best = ns;
      if (prev && ns.length >= 2) {
        const n = Math.max(1, chordTones(chordOf(ns)).core.length);
        const mean = avg(ns);
        let bc = Infinity;
        for (let i = 0; i < n; i++) {
          const v = invertChord(ns, i);
          for (const sh of [-12, 0, 12]) {
            const cand = v.map((x) => x + sh);
            const cost = motion(prev, cand) + 0.35 * Math.abs(avg(cand) - mean);
            if (cost < bc - 1e-9) {
              bc = cost;
              best = cand;
            }
          }
        }
      }
      m.set(evSig(e), best);
      prev = best;
    }
    if (smoothCache.size > 100) smoothCache.clear();
    smoothCache.set(sig, m);
    return m;
  }

  /**
   * Notes de l'accord après renversement et voicing (L = passage de la boucle, pour « Tourne à chaque boucle » ;
   * events / ev : accords de la piste et accord en cours, pour « Le plus proche »).
   */
  function voiced(notes, o, L, events, ev) {
    let ns = notes;
    if (notes.length >= 2) {
      if (o.inversion === 'smooth') {
        const hit = Array.isArray(events) && ev && Array.isArray(ev.notes) ? smoothChain(events).get(evSig(ev)) : null;
        ns = hit || [...notes].sort((a, b) => a - b);
      } else if (o.inversion !== 'asis') ns = invertChord(notes, o.inversion === 'cycle' ? L | 0 : o.inversion);
      if (o.voicing !== 'close') ns = applyVoicing(ns, o.voicing);
    }
    if (o.register !== 'asis' && ns.length) {
      // l'accord est déplacé par octaves entières pour commencer dans l'octave demandée (« Proche » : d'après
      // l'accord joué, pour que l'enchaînement reste lié d'un accord à l'autre)
      const low = Math.min(...(o.inversion === 'smooth' ? notes : ns));
      const base = 12 * (o.register + 1);
      const sh = base + mod(low - base, 12) - low;
      if (sh) ns = ns.map((n) => n + sh);
    }
    return ns;
  }

  /** Note obtenue en avançant de k notes de l'accord (k < 0 : en descendant) depuis n. */
  function chordStep(tones, n, k) {
    if (!k) return n;
    const pcs = new Set(tones.map((x) => mod(x, 12)));
    if (!pcs.size) return n;
    const sg = Math.sign(k);
    let left = Math.abs(k);
    let m = n;
    while (left > 0) {
      m += sg;
      if (pcs.has(mod(m, 12))) left--;
    }
    return m;
  }

  /** Note la plus grave de l'accord dont l'intervalle à la fondamentale est l'un de ceux demandés. */
  function findTone(c, ivs) {
    for (const iv of ivs) {
      const n = c.sorted.find((x) => mod(x - c.root, 12) === iv);
      if (n != null) return n;
    }
    return null;
  }

  /**
   * Degré harmonique → note (§5.5 « pattern relatif à l'accord »), avec repli défini si l'extension manque :
   * d1 fondamentale ; d3 tierce (sinon sus2/sus4, sinon quinte) ; d5 quinte (sinon b5/#5, sinon fondamentale + 12) ;
   * d7 septième (sinon sixte, sinon fondamentale + 12) ; d9 neuvième (sinon tierce + 12).
   */
  function degreeNote(c, d) {
    const rootN = findTone(c, [0]) != null ? findTone(c, [0]) : c.sorted[0];
    const up = (n) => (n != null && n < rootN ? n + 12 * Math.ceil((rootN - n) / 12) : n);
    let n = null;
    if (d === 1) n = rootN;
    else if (d === 3) n = up(findTone(c, [3, 4])) ?? up(findTone(c, [2, 5])) ?? up(findTone(c, [7])) ?? rootN;
    else if (d === 5) n = up(findTone(c, [7])) ?? up(findTone(c, [6, 8])) ?? rootN + 12;
    else if (d === 7) n = up(findTone(c, [10, 11])) ?? up(findTone(c, [9])) ?? rootN + 12;
    else if (d === 9) {
      const nine = findTone(c, [2]);
      n = nine != null ? (nine < rootN + 12 ? nine + 12 * Math.ceil((rootN + 12 - nine) / 12) : nine) : (degreeNote(c, 3) + 12);
    } else n = rootN;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Motif relatif personnalisé                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Syntaxe (séparée par des espaces) :
   *   0 1 2 …   index dans les notes de l'accord (du grave à l'aigu, octaves comprises)
   *   d1 d3 d5 d7 d9   degré harmonique (fondamentale, tierce, quinte, septième, neuvième)
   *   suffixe + / - (répétable) : une octave plus haut / plus bas (« d1+ », « 2-- »)
   *   .         silence        _   prolonge la note précédente (liaison)
   */
  const patternCache = new Map();
  function parsePattern(str) {
    const key = String(str || '');
    if (patternCache.has(key)) return patternCache.get(key);
    const toks = key.trim().split(/[\s,]+/).filter(Boolean).slice(0, 64);
    const out = toks.map((t) => {
      if (t === '.' || t === '-' || t === 'x') return { rest: true };
      if (t === '_') return { tie: true };
      const m = /^(d?)(\d{1,2})([+-]*)$/i.exec(t);
      if (!m) return { rest: true, bad: t };
      const shift = [...m[3]].reduce((s, c) => s + (c === '+' ? 12 : -12), 0);
      return m[1] ? { degree: +m[2], shift } : { index: +m[2], shift };
    });
    if (patternCache.size > 200) patternCache.clear();
    patternCache.set(key, out);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Rythme                                                              */
  /* ------------------------------------------------------------------ */

  /** Euclidien E(hits, steps) avec rotation : hits répartis le plus régulièrement possible. */
  function euclid(hits, steps, rot = 0) {
    const out = [];
    for (let i = 0; i < steps; i++) {
      const j = mod(i + rot, steps);
      out.push(hits > 0 && (j * hits) % steps < hits ? 1 : 0); // rotation 0 : premier coup sur le premier pas
    }
    return out;
  }

  function rhythmLane(o) {
    if (o.rhythm.type === 'euclid') return euclid(o.rhythm.hits, o.rhythm.steps, o.rhythm.rot);
    if (o.rhythm.type === 'lane' && o.lanes.rhythm.length) return o.lanes.rhythm;
    return null; // tous les pas jouent
  }

  /** Nombre de pas joués dans [0, x) pour une ligne périodique. */
  function hitsBefore(lane, x) {
    if (!lane) return x;
    const L = lane.length;
    const per = lane.reduce((s, v) => s + (v ? 1 : 0), 0);
    let c = Math.floor(x / L) * per;
    for (let i = 0; i < mod(x, L); i++) if (lane[i]) c++;
    return c;
  }

  /** Index de lecture d'une ligne de longueur L au pas t, selon son sens (avant, arrière, ping-pong, hasard). */
  function laneIdx(o, name, t, L) {
    if (L <= 1) return 0;
    const d = o.laneDir[name];
    if (d === 'rev') return L - 1 - mod(t, L);
    if (d === 'pingpong') {
      const q = mod(t, 2 * L - 2);
      return q < L ? q : 2 * L - 2 - q;
    }
    if (d === 'random') return Math.floor(rnd(o.seed, t, L, 13) * L);
    return mod(t, L);
  }

  /** Nombre de notes de l'arpège jouées dans les pas [0, x) : chaque pas joué compte pour sa « vitesse » (1 à 4). */
  function playedBefore(o, rl, x) {
    const divs = o.lanes.div;
    if (!divs.length && !o.laneDir.rhythm) return rl ? hitsBefore(rl, x) : x;
    let c = 0;
    for (let i = 0; i < x; i++) if (!rl || rl[laneIdx(o, 'rhythm', i, rl.length)]) c += divs.length ? divs[laneIdx(o, 'div', i, divs.length)] : 1;
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Ordre des notes                                                     */
  /* ------------------------------------------------------------------ */

  const walkCache = new Map();
  function walkIndex(kind, n, j, seed, evKey) {
    const key = kind + '|' + n + '|' + seed + '|' + evKey;
    let arr = walkCache.get(key);
    if (!arr) {
      if (walkCache.size > 200) walkCache.clear();
      arr = [0];
      walkCache.set(key, arr);
    }
    while (arr.length <= j) {
      const i = arr.length;
      const r = rnd(seed, evKey, i, 7);
      let step;
      if (kind === 'walk') step = r < 0.5 ? -1 : 1;
      else step = r < 0.1 ? 0 : r < 0.45 ? -1 : r < 0.8 ? 1 : r < 0.9 ? -2 : 2;
      let p = arr[i - 1] + step;
      // réflexion sur les bords
      if (n === 1) p = 0;
      else {
        while (p < 0 || p > n - 1) p = p < 0 ? -p : 2 * (n - 1) - p;
      }
      arr.push(p);
    }
    return arr[j];
  }

  function shufflePerm(n, cycle, seed, evKey) {
    const p = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const r = Math.floor(rnd(seed, evKey, cycle, i, 11) * (i + 1));
      [p[i], p[r]] = [p[r], p[i]];
    }
    return p;
  }

  /** Suite de Fibonacci modulo n (0, 1, 1, 2, 3, 5…), périodique (période de Pisano). */
  const fibCache = new Map();
  function fibMod(j, n) {
    let seq = fibCache.get(n);
    if (!seq) {
      seq = [0, 1];
      while (seq.length < 6 * n + 3 && !(seq.length > 2 && seq[seq.length - 2] === 0 && seq[seq.length - 1] === 1)) seq.push((seq[seq.length - 1] + seq[seq.length - 2]) % n);
      if (seq.length > 2 && seq[seq.length - 2] === 0 && seq[seq.length - 1] === 1) seq.length -= 2;
      fibCache.set(n, seq);
    }
    return seq[mod(j, seq.length)];
  }

  /** Série infinie de Per Nørgård : a(0) = 0, a(2k) = −a(k), a(2k+1) = a(k) + 1 (autosimilaire). */
  function norgard(j) {
    j = Math.max(0, j | 0);
    if (j === 0) return 0;
    return j % 2 ? norgard((j - 1) / 2) + 1 : -norgard(j / 2);
  }

  /** Index dans la réserve de notes (pool) pour le j-ième pas joué. */
  function orderIndex(mode, n, j, seed, evKey) {
    if (n <= 1) return 0;
    const p = mod(j, n);
    switch (mode) {
      case 'down':
        return n - 1 - p;
      case 'updown': {
        const q = mod(j, 2 * n - 2);
        return q < n ? q : 2 * n - 2 - q;
      }
      case 'updown_rep': {
        const q = mod(j, 2 * n);
        return q < n ? q : 2 * n - 1 - q;
      }
      case 'downup': {
        const q = mod(j, 2 * n - 2);
        return n - 1 - (q < n ? q : 2 * n - 2 - q);
      }
      case 'converge':
        return p % 2 === 0 ? p / 2 : n - 1 - (p - 1) / 2;
      case 'diverge': {
        const q = n - 1 - p;
        return q % 2 === 0 ? q / 2 : n - 1 - (q - 1) / 2;
      }
      case 'pedal': {
        const q = mod(j, 2 * (n - 1));
        return q % 2 === 0 ? 0 : 1 + (q - 1) / 2;
      }
      case 'pedal_top': {
        const q = mod(j, 2 * (n - 1));
        return q % 2 === 0 ? n - 1 : (q - 1) / 2;
      }
      case 'thirds':
        return mod(Math.floor(j / 2) + (j % 2) * 2, n);
      // index hors de la réserve : la note est prise une ou plusieurs octaves plus haut / plus bas (voir baseNotes)
      case 'up2':
        return mod(Math.floor(j / 4), n) + mod(j, 4);
      case 'down2':
        return n - 1 - (mod(Math.floor(j / 4), n) + mod(j, 4));
      case 'up3':
        return mod(Math.floor(j / 3), n) + mod(j, 3);
      case 'down3':
        return n - 1 - (mod(Math.floor(j / 3), n) + mod(j, 3));
      case 'climb2':
        return mod(Math.floor(j / 2), n) + mod(j, 2);
      case 'fall2':
        return n - 1 - (mod(Math.floor(j / 2), n) + mod(j, 2));
      case 'alberti':
        return [0, Math.min(2, n - 1), Math.min(1, n - 1), Math.min(2, n - 1)][mod(j, 4)];
      case 'repeat':
        return mod(Math.floor(j / 2), n);
      case 'octaves':
        return mod(Math.floor(j / 2), n) + (j % 2 ? n : 0);
      case 'rotate':
        return mod(p + Math.floor(j / n), n);
      // index hors de la réserve (< 0 ou ≥ n) : la note est prise une octave plus bas / plus haut
      case 'cascade':
        return mod(Math.floor(j / 3), n) + 2 - mod(j, 3);
      case 'wave':
        return mod(Math.floor(j / 4), n) + [0, 1, 2, 1][mod(j, 4)];
      case 'balance': {
        const q = mod(j, 2 * n + 1); // 0, +1, −1, +2, −2… autour du milieu, puis on recommence
        return Math.floor((n - 1) / 2) + (q === 0 ? 0 : q % 2 ? (q + 1) / 2 : -q / 2);
      }
      case 'fibo':
        return fibMod(j, n);
      case 'norgard':
        return norgard(j);
      case 'random':
        return Math.floor(rnd(seed, evKey, j, 3) * n);
      case 'shuffle': {
        const c = Math.floor(j / n);
        const perm = shufflePerm(n, c, seed, evKey);
        // pas de répétition à la frontière de deux cycles : si la 1re note du cycle = la dernière du précédent,
        // on échange les deux premières (n ≥ 3 : la dernière note du cycle précédent n'en est pas affectée)
        if (c > 0 && n >= 3) {
          const prev = shufflePerm(n, c - 1, seed, evKey);
          if (perm[0] === prev[n - 1]) [perm[0], perm[1]] = [perm[1], perm[0]];
        } else if (n === 2) return mod(j, 2);
        return perm[p];
      }
      case 'walk':
      case 'drunk':
        return walkIndex(mode, n, j, seed, evKey);
      default:
        return p; // up, played, played_rev (la réserve est déjà ordonnée)
    }
  }

  /** Réserve de notes de l'arpège : notes de l'accord empilées sur N octaves. */
  function buildPool(notes, o) {
    let base;
    if (o.mode === 'played') base = [...notes];
    else if (o.mode === 'played_rev') base = [...notes].reverse();
    else base = [...new Set(notes)].sort((a, b) => a - b);
    const pool = [];
    for (let k = 0; k < o.octaves; k++) base.forEach((n) => pool.push(n + 12 * k));
    return pool;
  }

  /** Ramène une note dans la tessiture autorisée par octaves entières. */
  function fold(n, range) {
    while (n > range[1]) n -= 12;
    while (n < range[0]) n += 12;
    return clamp(n, 0, 127);
  }

  // modes proches pour la phrase « B » à EVOLVE élevé : même matériau, autre contour
  const RELATED = {
    up: ['updown', 'converge', 'thirds'], down: ['downup', 'diverge', 'thirds'], updown: ['up', 'converge', 'pedal'],
    updown_rep: ['up', 'converge'], downup: ['down', 'diverge'], played: ['updown', 'converge'], played_rev: ['downup', 'diverge'],
    converge: ['diverge', 'updown'], diverge: ['converge', 'downup'], pedal: ['updown', 'pedal_top'], pedal_top: ['pedal', 'downup'],
    thirds: ['up', 'updown'], cascade: ['down3', 'up3'], wave: ['up3', 'updown'], balance: ['converge', 'diverge'], fibo: ['shuffle', 'random'], norgard: ['walk', 'drunk'], up2: ['up3', 'up'], down2: ['down', 'up2'], up3: ['up2', 'up'], alberti: ['pedal', 'updown'], octaves: ['up', 'repeat'], repeat: ['up', 'octaves'], rotate: ['up', 'thirds'], random: ['shuffle'], shuffle: ['walk'], walk: ['drunk'], drunk: ['walk'],
  };
  const PHRASE = ['A', "A'", 'B', "A''"];

  /* ------------------------------------------------------------------ */
  /* Calcul d'un pas d'arpège                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Note(s) du j-ième pas joué, sans les lignes ni EVOLVE (sert aussi aux notes de passage).
   * Renvoie { notes: [midi], tie } ou null (silence du motif).
   */
  function baseNotes(o, c, pool, j, mode, evKey) {
    if (mode === 'chord') return { notes: pool.slice() };
    if (mode === 'pattern') {
      const pat = parsePattern(o.pattern);
      if (!pat.length) return { notes: [pool[orderIndex('up', pool.length, j, o.seed, evKey)]] };
      const t = pat[mod(j, pat.length)];
      if (t.rest || t.tie) return null;
      let ties = 0;
      while (ties < pat.length - 1 && pat[mod(j + 1 + ties, pat.length)].tie) ties++;
      let n;
      if (t.degree != null) n = degreeNote(c, t.degree);
      else n = pool[mod(t.index, pool.length)] + 12 * Math.floor(t.index / pool.length);
      return { notes: [n + t.shift], tie: ties };
    }
    const i = orderIndex(mode, pool.length, j, o.seed, evKey);
    // la réserve couvre o.octaves octaves : un index au-delà repart une « réserve » plus haut (ou plus bas)
    const span = mode === 'octaves' ? 12 : 12 * o.octaves;
    return { notes: [pool[mod(i, pool.length)] + span * Math.floor(i / pool.length)] };
  }

  /** Note de passage entre deux notes de l'accord, prise dans la gamme déduite de l'accord. */
  function passingTone(c, a, b) {
    if (Math.abs(b - a) < 3) return null;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const mid = (a + b) / 2;
    let best = null;
    for (let n = lo + 1; n < hi; n++) {
      if (!c.scale.includes(mod(n - c.root, 12))) continue;
      if (best == null || Math.abs(n - mid) < Math.abs(best - mid)) best = n;
    }
    return best;
  }

  /**
   * Un pas d'arpège.
   *   ev   : { step, len, notes, vel }
   *   k    : index du pas d'arpège depuis le début de l'accord
   *   info : { loop, stepsPerBeat, absStep (pas absolu du début de l'accord, pour MOTION) }
   * Renvoie null (silence) ou { notes, vel, gate (en durées de pas d'arpège), ratchet, swing (fraction de pas),
   *   cutoff (multiplicateur de fréquence de coupure), anchor, phrase }.
   */
  function tick(o, ev, k, info = {}) {
    const raw = (ev.notes || []).filter(Number.isFinite);
    if (!raw.length) return null;
    const notes = voiced(raw, o, o.freeze ? o.freezeLoop : info.loop, info.events, ev);
    const c = chordOf(notes);
    const pool = buildPool(notes, o);
    const evKey = (ev.step | 0) * 131 + notes.length * 7 + mod(notes[0], 12);
    const t = o.retrig === 'free' ? k + Math.ceil((ev.step || 0) * o.rate - 1e-9) : k; // index des lignes
    const lane = (name) => {
      const a = o.lanes[name];
      return a && a.length ? a[laneIdx(o, name, t, a.length)] : LANES[name].def;
    };

    const rl = rhythmLane(o);
    if (rl && !rl[laneIdx(o, 'rhythm', t, rl.length)]) return null;
    const j = playedBefore(o, rl, t) - (o.retrig === 'free' ? playedBefore(o, rl, t - k) : 0);

    // EVOLVE : variations aux frontières de boucle, structure A / A' / B / A''
    const e = o.evolve;
    const L = o.freeze ? o.freezeLoop : info.loop | 0;
    const phrase = PHRASE[mod(L, 4)];
    const posSteps = (ev.step || 0) + k / o.rate;
    const spb = info.stepsPerBeat || 4;
    const onBeat = Math.abs(posSteps / spb - Math.round(posSteps / spb)) < 1e-6;
    const anchor = j === 0 || onBeat; // notes structurelles : jamais retirées ni déplacées
    const r = (salt) => rnd(o.seed, evKey, L, k, salt);

    let mode = o.mode;
    if (e > 0.75 && phrase === 'B' && RELATED[mode]) {
      const alts = RELATED[mode];
      mode = alts[Math.floor(rnd(o.seed, L, 5) * alts.length)];
    }
    let jj = j;
    if (e > 0.25 && phrase !== 'A' && !anchor && mode !== 'chord' && r(1) < clamp((e - 0.25) / 0.25, 0, 1) * 0.3) jj = j + (r(2) < 0.5 ? 1 : -1);
    if (anchor) jj = j;

    const base = baseNotes(o, c, pool, jj, mode, evKey);
    if (!base) return null;
    let out = base.notes.slice();

    // harmonie : notes de passage / approches, seulement sur les pas faibles et seulement si demandé
    if (o.harmony !== 'chord' && mode !== 'chord' && j % 2 === 1 && !anchor) {
      const prev = baseNotes(o, c, pool, jj - 1, mode, evKey);
      const next = baseNotes(o, c, pool, jj + 1, mode, evKey);
      if (prev && next) {
        if (o.harmony === 'passing') {
          const p = passingTone(c, prev.notes[0], next.notes[0]);
          if (p != null) out = [p];
        } else if (o.harmony === 'chromatic' && next.notes[0] !== out[0]) out = [next.notes[0] - 1];
      }
    }

    let prob = lane('prob');
    let vel = (ev.vel == null ? 0.8 : ev.vel) * lane('vel');
    // longueur : celle du pas si elle est fixée, sinon la longueur générale (en doubles-croches), sinon GATE
    const stepLen = lane('len');
    let gate = stepLen > 0 ? stepLen * o.rate : o.noteLen > 0 ? o.noteLen * o.rate : o.gate * lane('gate');
    const poly = lane('poly');
    let ratchet = lane('ratchet');
    let octShift = lane('oct');

    if (e > 0) {
      const a = Math.min(e / 0.25, 1) * 0.22; // nuances
      vel *= 1 + (r(3) * 2 - 1) * a;
      gate *= 1 + (r(4) * 2 - 1) * a * 0.8;
      if (e > 0.25 && phrase !== 'A' && !anchor && r(5) < clamp((e - 0.25) / 0.5, 0, 1) * 0.15) octShift += r(6) < 0.6 ? 1 : -1;
      if (e > 0.5 && (phrase === 'B' || phrase === "A''") && !anchor) {
        const d = clamp((e - 0.5) / 0.25, 0, 1);
        if (r(7) < d * 0.28) return null; // respiration : pas faible retiré
        if (r(8) < d * 0.15) ratchet = Math.max(ratchet, 2);
      }
    }
    if (prob < 1 && !(prob > 0 && rnd(o.seed, evKey, L, k, 9) < prob)) return null;

    // MOTION : LFO sur le timbre (cutoff), la vélocité et le gate — jamais sur les hauteurs
    let cutoff = 1;
    const m = o.motion;
    if (m > 0) {
      const abs = (info.absStep != null ? info.absStep : ev.step || 0) + k / o.rate; // en doubles-croches
      const tri = (x) => 1 - 4 * Math.abs(mod(x, 1) - 0.5); // triangle -1..1
      cutoff = Math.pow(2, tri(abs / 64 + 0.25) * m * 1.6); // ±1,6 octave sur 4 mesures
      vel *= 1 + Math.sin((2 * Math.PI * abs) / 32) * m * 0.18; // 2 mesures
      gate *= 1 + tri(abs / 48) * m * 0.3; // 3 mesures
    }

    // jeu humain : nuances, accents sur les temps, petits décalages — reproductibles (graine + passage)
    let jitter = 0;
    const hu = o.human;
    if (hu > 0) {
      const hr = (salt) => rnd(o.seed, evKey, L, k, salt);
      const weak = Math.abs(posSteps / 2 - Math.round(posSteps / 2)) > 1e-6; // hors croche
      vel *= (onBeat ? 1 + 0.12 * hu : weak ? 1 - 0.1 * hu : 1) * (1 + (hr(21) * 2 - 1) * 0.16 * hu);
      gate *= 1 + (hr(22) * 2 - 1) * 0.15 * hu;
      jitter = (hr(20) * 2 - 1) * 0.012 * hu + (weak ? 0.004 * hu : 0); // secondes (±12 ms, un peu en arrière hors temps)
      if (onBeat) jitter = Math.max(-0.003, jitter * 0.4); // les temps restent posés
    }

    const tones = c.sorted; // notes de l'accord (après renversement et voicing)
    const deg = lane('deg');
    const div = mode === 'chord' ? 1 : lane('div');
    const finish = (arr) => {
      let a = arr.slice();
      // plusieurs notes à la fois : la note du pas + les notes de l'accord juste au-dessus
      if (poly > 1 && mode !== 'chord' && a.length === 1) {
        const pcs = new Set(tones.map((n) => mod(n, 12)));
        for (let m = a[0] + 1; m <= a[0] + 24 && a.length < poly; m++) if (pcs.has(mod(m, 12))) a.push(m);
      }
      if (deg) a = a.map((n) => chordStep(tones, n, deg)); // ligne Degré : décalage dans l'accord
      return [...new Set(a.map((n) => fold(n + 12 * octShift, o.range)))];
    };
    out = finish(out);
    // répétitions dans le pas : rafale (notes suivantes de l'arpège) ou ratchet roulé (parcourt l'accord)
    let reps = null;
    if (div > 1) {
      reps = [out];
      for (let i = 1; i < div; i++) {
        const b = baseNotes(o, c, pool, jj + i, mode, evKey);
        reps.push(b ? finish(b.notes) : []);
      }
    } else if (ratchet > 1 && o.roll !== 'none') {
      const R = clamp(Math.round(ratchet), 1, 4);
      reps = [];
      for (let i = 0; i < R; i++) {
        const off = o.roll === 'up' ? i : o.roll === 'down' ? -i : i <= R / 2 ? i : R - i;
        reps.push([...new Set(out.map((n) => fold(chordStep(tones, n, off), o.range)))]);
      }
    }
    const swing = mod(t, 2) === 1 ? (o.swing - 0.5) * 2 : 0;
    if (base.tie) gate = base.tie + Math.max(gate, 1);
    return {
      notes: out,
      reps,
      tones,
      vel: clamp(vel, 0.03, 1),
      gate: clamp(gate, 0.02, 64),
      fixed: stepLen > 0 || o.noteLen > 0 || !!base.tie, // la durée ne vient pas de l'articulation du geste
      jitter,
      ratchet: reps ? reps.length : clamp(Math.round(ratchet), 1, 4),
      swing,
      cutoff,
      anchor,
      phrase: e > 0 ? phrase : 'A',
      j,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Geste : étalement, alternance, microvariation, accent, articulation  */
  /* ------------------------------------------------------------------ */

  /*
   * Un arpège est une suite de groupes de notes ; chaque groupe forme un geste. Les hauteurs, leur ordre et
   * le début de chaque groupe ne bougent pas : seuls le placement des attaques DANS le groupe, leur force
   * et leur durée changent. Ordre d'application : étalement → alternance → microvariation → corrections
   * (ordre des notes, frontières du groupe) → accents → articulation. Chaque attaque est calculée depuis sa
   * position prévue : aucune erreur ne s'accumule d'un groupe à l'autre.
   *
   * Unités (relatives au tempo, sauf la microvariation) :
   *   spread  part de l'étendue du groupe sur la grille (1 = grille, 0.6 = 60 %)
   *   alt     décalage des notes paires du groupe (2, 4…) en part d'un pas d'arpège (+ = en retard)
   *   micro   décalages bornés en millisecondes (± micro), la note 1 reste sur la pulsation
   *   take    « prise » : graine des décalages ; un réglage modifié ne relance pas le tirage
   *   accent  0..1 : la note 1 est renforcée (+25 % au maximum), les autres atténuées (−22 %)
   *   art     part de l'espace avant l'attaque suivante ; legato = chevauchement voulu
   */
  const GESTES = [
    { id: 'mecanique', label: 'Mécanique', desc: 'grille régulière', g: { spread: 1, alt: 0, micro: 0, accent: 0, art: 0.9, legato: false } },
    { id: 'balayage', label: 'Balayage', desc: 'serré puis respiration', g: { spread: 0.27, alt: 0, micro: 0, accent: 0.5, art: 0.6, legato: false } },
    { id: 'roule', label: 'Roulé', desc: 'serré, notes paires en avance', g: { spread: 0.4, alt: -0.05, micro: 6, accent: 0.6, art: 0.6, legato: false } },
    { id: 'boiteux', label: 'Boiteux', desc: 'notes paires en retard', g: { spread: 0.8, alt: 0.14, micro: 0, accent: 0.4, art: 0.7, legato: false } },
    { id: 'detendu', label: 'Détendu', desc: 'étalé, petites variations', g: { spread: 0.93, alt: 0.04, micro: 8, accent: 0.3, art: 0.85, legato: false } },
    { id: 'harpe', label: 'Harpe', desc: 'très serré, lié', g: { spread: 0.16, alt: 0, micro: 3, accent: 0.4, art: 1, legato: true } },
  ];
  // taille des groupes d'après le motif (sinon 4)
  const GROUP_OF = { cascade: 3, wave: 4, up2: 4, down2: 4, up3: 3, down3: 3, climb2: 2, fall2: 2, alberti: 4, octaves: 2, repeat: 2 };
  const GROUP_SIZES = [2, 3, 4, 6, 8];

  function normGeste(g) {
    g = g && typeof g === 'object' ? g : {};
    const base = GESTES[0].g;
    return {
      id: typeof g.id === 'string' && GESTES.some((x) => x.id === g.id) ? g.id : '',
      group: GROUP_SIZES.includes(+g.group) ? +g.group : 0, // 0 = d'après le motif
      spread: clamp(num(+g.spread, base.spread), 0.1, 1),
      alt: clamp(num(+g.alt, base.alt), -0.25, 0.25),
      micro: clamp(Math.round(num(+g.micro, base.micro)), 0, 20),
      take: Math.max(1, Math.round(num(+g.take, 1))),
      accent: clamp(num(+g.accent, base.accent), 0, 1),
      art: clamp(num(+g.art, base.art), 0.2, 1),
      legato: !!g.legato,
    };
  }
  const gesteGroup = (o) => (o.geste && o.geste.group) || GROUP_OF[o.mode] || 4;

  const gesteCache = new Map();
  /**
   * Attaques, durées et forces relatives d'un groupe de n notes, en millisecondes depuis le début du groupe.
   * subMs = durée d'un pas d'arpège ; gi = index du groupe (pour la microvariation).
   */
  function gesteTimes(geste, n, subMs, gi = 0) {
    const g = normGeste(geste);
    const key = [g.spread, g.alt, g.micro, g.take, g.accent, g.art, g.legato ? 1 : 0, n, subMs.toFixed(4), g.micro ? gi : 0].join('|');
    const hit = gesteCache.get(key);
    if (hit) return hit;
    const groupMs = n * subMs;
    const gap = Math.min(6, subMs * 0.08); // écart minimal entre deux attaques
    let p = [];
    for (let i = 0; i < n; i++) {
      let x = i * g.spread * subMs; // étalement
      if (i % 2 === 1) x += g.alt * subMs; // alternance : notes 2, 4…
      if (i > 0 && g.micro) x += (rnd(g.take, gi, i, 31) * 2 - 1) * g.micro; // microvariation (note 1 fixe)
      p.push(x);
    }
    // corrections : ordre conservé, aucune attaque avant la note 1 ni au-delà du groupe
    p[0] = 0;
    for (let i = 1; i < n; i++) p[i] = Math.max(p[i], p[i - 1] + gap);
    for (let i = n - 1; i >= 1; i--) p[i] = Math.min(p[i], i === n - 1 ? groupMs - gap : p[i + 1] - gap);
    if (p.some((x, i) => i > 0 && x < p[i - 1] + gap * 0.5)) p = p.map((_, i) => i * subMs); // groupe trop court : la grille
    const vel = p.map((_, i) => (i === 0 ? 1 + 0.25 * g.accent : 1 - 0.22 * g.accent)); // accents
    const space = p.map((x, i) => (i < n - 1 ? p[i + 1] : groupMs) - x);
    const dur = space.map((sp) => (g.legato ? sp * 1.15 : Math.max(Math.min(sp - gap / 2, sp * g.art), Math.min(8, sp * 0.5)))); // articulation
    const out = { at: p, dur, vel, space, groupMs };
    if (gesteCache.size > 800) gesteCache.clear();
    gesteCache.set(key, out);
    return out;
  }

  /** Hauteur du e-ième écho d'une note. */
  function echoNote(o, tk, n, e) {
    const s = o.echo.shift;
    const m = s === 'up1' ? chordStep(tk.tones || [n], n, e) : s === 'down1' ? chordStep(tk.tones || [n], n, -e) : s === 'oct' ? n + 12 * e : s === 'octdown' ? n - 12 * e : s === 'fifth' ? n + 7 * e : n;
    return fold(m, o.range);
  }

  /**
   * Notes à jouer pendant le pas de séquenceur `step` (double-croche) pour l'événement `ev`.
   * info : { loop, stepSec, stepsPerBeat, trackLen }
   * Renvoie [{ midi, at (s, depuis le début du pas), dur (s), vel, cutoff, first }].
   */
  function renderStep(arp, ev, step, info) {
    const o = arp && arp.__norm ? arp : normalize(arp);
    if (step < ev.step || step >= ev.step + ev.len) return [];
    const rate = o.rate;
    const sd = info.stepSec;
    const sub = sd / rate;
    const eps = 1e-9;
    const k0 = Math.ceil((step - ev.step) * rate - eps);
    const k1 = Math.ceil((step + 1 - ev.step) * rate - eps);
    const out = [];
    const tinfo = (k) => ({ loop: info.loop, stepsPerBeat: info.stepsPerBeat, absStep: (info.loop | 0) * (info.trackLen || 0) + ev.step, events: info.events });
    // une note, suivie de ses échos (plus faibles, éventuellement transposés)
    const emit = (tk, x) => {
      out.push(x);
      for (let e = 1; e <= o.echo.n; e++) {
        out.push({ ...x, midi: echoNote(o, tk, x.midi, e), at: x.at + e * o.echo.gap * sub, vel: clamp(x.vel * Math.pow(o.echo.decay, e), 0.03, 1), first: false, echo: e });
      }
    };
    if (o.geste) {
      // avec un geste, tout le groupe est programmé dès son premier pas : resserrer un groupe avance
      // certaines attaques, qui ne doivent pas arriver après leur heure
      const n = gesteGroup(o);
      for (let k = k0; k < k1; k++) {
        if (k % n !== 0) continue;
        const gt = gesteTimes(o.geste, n, sub * 1000, k / n);
        const start = (k / rate - (step - ev.step)) * sd;
        for (let i = 0; i < n; i++) {
          const kk = k + i;
          if (kk / rate >= ev.len - eps) break;
          const tk = tick(o, ev, kk, tinfo(kk));
          if (!tk) continue;
          const at = start + gt.at[i] / 1000;
          const total = tk.fixed ? sub * tk.gate : gt.dur[i] / 1000;
          const r = tk.ratchet;
          for (let j = 0; j < r; j++) {
            const dur = r > 1 ? Math.min(total, gt.space[i] / 1000) / r * 0.9 : total;
            (tk.reps ? tk.reps[j] : tk.notes).forEach((nn) =>
              emit(tk, { midi: nn, at: at + (j * gt.space[i]) / 1000 / r, dur: Math.max(0.01, dur), vel: clamp(tk.vel * gt.vel[i] * (j && !tk.reps ? 0.85 : 1), 0.03, 1), cutoff: tk.cutoff, first: kk === 0 && j === 0 })
            );
          }
        }
      }
      return out;
    }
    for (let k = k0; k < k1; k++) {
      if (k / rate >= ev.len - eps) break;
      const tk = tick(o, ev, k, tinfo(k));
      if (!tk) continue;
      const at = (k / rate - (step - ev.step)) * sd + tk.swing * sub + (tk.jitter || 0);
      const r = tk.ratchet;
      for (let i = 0; i < r; i++) {
        const dur = r > 1 ? (sub / r) * Math.min(tk.gate, 0.9) : sub * tk.gate;
        (tk.reps ? tk.reps[i] : tk.notes).forEach((n) =>
          emit(tk, { midi: n, at: at + (i * sub) / r, dur: Math.max(0.01, dur), vel: tk.vel * (i && !tk.reps ? 0.85 : 1), cutoff: tk.cutoff, first: k === 0 && i === 0 })
        );
      }
    }
    return out;
  }

  /** Aperçu : les `count` premiers pas d'arpège d'un accord (pour l'affichage « notes qui vont jouer »). */
  function preview(arp, notes, count = 16, info = {}) {
    const o = normalize(arp);
    const ev = { step: 0, len: Math.ceil(count / o.rate) + 1, notes, vel: 0.8 };
    const out = [];
    for (let k = 0; k < count; k++) out.push(tick(o, ev, k, { loop: info.loop | 0, stepsPerBeat: info.stepsPerBeat || 4 }));
    if (o.geste) {
      // durées et forces du geste, sur une grille de référence (le décalage des attaques est dans « shift », en pas)
      const n = gesteGroup(o);
      const ref = 125;
      out.forEach((t, k) => {
        if (!t) return;
        const gt = gesteTimes(o.geste, n, ref, Math.floor(k / n));
        const i = k % n;
        if (!t.fixed) t.gate = gt.dur[i] / ref;
        t.vel = clamp(t.vel * gt.vel[i], 0.03, 1);
        t.shift = gt.at[i] / ref - i;
      });
    }
    return out;
  }

  /** Accord symbolique « Am7 », « F#maj7 », « Bb » → notes MIDI (octave 4 par défaut). */
  function parseChordSymbol(sym, octave = 4) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(String(sym).trim());
    if (!m) return null;
    let pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const rest = m[3];
    const t = CHORD_TYPES.find((x) => x.sym === rest) || (rest === 'M7' ? CHORD_TYPES.find((x) => x.id === 'maj7') : null);
    if (!t) return null;
    const rootN = 12 * (octave + 1) + mod(pc, 12);
    return t.iv.map((i) => rootN + i);
  }

  /* ------------------------------------------------------------------ */
  /* Boutons rotatifs (mode Intuitif) : un geste, plusieurs réglages      */
  /* ------------------------------------------------------------------ */

  /*
   * Chaque bouton (0..100) écrit un groupe de réglages fins, et remplace ceux qu'il pilote :
   *   density  silences (rythme euclidien clairsemé) → tous les pas (50) → rafales ×2 puis ratchets
   *   width    1 octave serré → 2 octaves → 2 octaves ouvert → 3 octaves ouvert → 4 octaves ouvert
   *   motion   figé → variations d'une boucle à l'autre → variations fortes + timbre qui ondule
   *   echo     aucun → 1-2 échos sur la même note → 3-4 échos qui montent dans l'accord (spirale)
   * macroValue relit la position du bouton : la dernière position enregistrée si elle donne toujours les
   * réglages actuels, sinon une position déduite des réglages (changés ailleurs).
   */
  const MACROS = [
    { id: 'density', label: 'Densité', what: 'peu → beaucoup de notes : silences, puis rafales et ratchets' },
    { id: 'width', label: 'Ampleur', what: 'étendue en octaves, accord ouvert' },
    { id: 'motion', label: 'Mouvement', what: 'l’arpège évolue d’une boucle à l’autre, le timbre ondule' },
    { id: 'echo', label: 'Écho', what: 'nombre d’échos ; au-delà de la moitié, spirale dans l’accord' },
  ];
  const WIDTHS = [
    { at: 12, octaves: 1, voicing: 'close' },
    { at: 37, octaves: 2, voicing: 'close' },
    { at: 60, octaves: 2, voicing: 'open' },
    { at: 77, octaves: 3, voicing: 'open' },
    { at: 93, octaves: 4, voicing: 'open' },
  ];
  const widthOf = (v) => WIDTHS[v < 25 ? 0 : v < 50 ? 1 : v < 70 ? 2 : v < 85 ? 3 : 4];

  /** Réglages écrits par un bouton à la position v (patch à fusionner dans le réglage). */
  function macroPatch(arp, id, v) {
    const o = arp && arp.__norm ? arp : normalize(arp);
    v = clamp(Math.round(+v || 0), 0, 100);
    const P = o.steps;
    if (id === 'density') {
      const lanes = { ...o.lanes, div: [], ratchet: [] };
      if (v < 48) {
        const hits = Math.max(1, Math.round(P * (0.25 + (0.75 * v) / 50)));
        return { rhythm: { ...o.rhythm, type: 'lane' }, lanes: { ...lanes, rhythm: euclid(hits, P, 0) } };
      }
      const out = { rhythm: { ...o.rhythm, type: 'all' }, lanes: { ...lanes, rhythm: [] } };
      if (v > 52) {
        const t = (v - 50) / 50;
        const n = Math.max(1, Math.round((t * P) / 2));
        out.lanes.div = euclid(n, P, 1).map((x) => (x ? 2 : 1));
        if (t > 0.6) out.lanes.ratchet = euclid(Math.max(1, Math.round(((t - 0.6) / 0.4) * (P / 4))), P, 3).map((x) => (x ? 2 : 1));
      }
      return out;
    }
    if (id === 'width') {
      const w = widthOf(v);
      return { octaves: w.octaves, voicing: w.voicing };
    }
    if (id === 'motion') {
      const t = v / 100;
      return { evolve: Math.round(0.8 * t * 100) / 100, motion: t > 0.3 ? Math.round(((t - 0.3) / 0.7) * 0.8 * 100) / 100 : 0 };
    }
    if (id === 'echo') {
      if (v < 5) return { echo: { ...o.echo, n: 0 } };
      const n = Math.min(4, 1 + Math.floor(((v - 5) / 95) * 4));
      return { echo: { n, gap: o.echo.n ? o.echo.gap : 2, decay: Math.round((0.4 + 0.3 * (v / 100)) * 100) / 100, shift: v >= 50 ? 'up1' : 'none' } };
    }
    return {};
  }
  const MACRO_KEYS = { density: ['rhythm', 'lanes'], width: ['octaves', 'voicing'], motion: ['evolve', 'motion'], echo: ['echo'] };
  function macroFits(o, id, v) {
    const p = normalize({ ...o, ...macroPatch(o, id, v) });
    return MACRO_KEYS[id].every((k) => {
      if (k === 'lanes') return ['rhythm', 'div', 'ratchet'].every((l) => JSON.stringify(p.lanes[l]) === JSON.stringify(o.lanes[l]));
      if (k === 'rhythm') return p.rhythm.type === o.rhythm.type;
      return JSON.stringify(p[k]) === JSON.stringify(o[k]);
    });
  }
  /** Position actuelle d'un bouton (0..100). */
  function macroValue(arp, id) {
    const o = normalize(arp);
    const v = o.macros[id];
    if (v != null && macroFits(o, id, v)) return v;
    if (id === 'density') {
      const rl = rhythmLane(o);
      if (rl && rl.some((x) => !x)) {
        const f = rl.reduce((s, x) => s + (x ? 1 : 0), 0) / rl.length;
        return clamp(Math.round(((f - 0.25) / 0.75) * 50), 0, 47);
      }
      const d = o.lanes.div;
      const n = d.filter((x) => x > 1).length;
      return n ? clamp(Math.round(50 + ((n / Math.max(1, d.length / 2)) * 50)), 53, 100) : 50;
    }
    if (id === 'width') {
      let best = WIDTHS[0];
      for (const w of WIDTHS) if (Math.abs(w.octaves - o.octaves) * 2 + (w.voicing === o.voicing ? 0 : 1) < Math.abs(best.octaves - o.octaves) * 2 + (best.voicing === o.voicing ? 0 : 1)) best = w;
      return best.at;
    }
    if (id === 'motion') return clamp(Math.round((Math.max(o.evolve / 0.8, o.motion > 0 ? 0.3 + (o.motion / 0.8) * 0.7 : 0)) * 100), 0, 100);
    if (id === 'echo') {
      if (!o.echo.n) return 0;
      const v = Math.round(5 + ((o.echo.n - 1) / 4) * 95 + 12);
      return o.echo.shift === 'up1' ? Math.max(50, v) : Math.min(49, v);
    }
    return 0;
  }
  /** Ce que fait le bouton en ce moment, en quelques mots. */
  function macroText(arp, id) {
    const o = normalize(arp);
    if (id === 'density') {
      const rl = rhythmLane(o);
      const hits = rl ? rl.reduce((s, x) => s + (x ? 1 : 0), 0) : 0;
      if (rl && hits < rl.length) return `${hits} notes sur ${rl.length} pas`;
      const r = o.lanes.div.filter((x) => x > 1).length;
      const c = o.lanes.ratchet.filter((x) => x > 1).length;
      return r || c ? [r ? `${r} rafale${r > 1 ? 's' : ''}` : '', c ? `${c} ratchet${c > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : 'tous les pas';
    }
    if (id === 'width') return `${o.octaves} octave${o.octaves > 1 ? 's' : ''} · ${(VOICINGS.find((x) => x.id === o.voicing) || VOICINGS[0]).label.toLowerCase()}`;
    if (id === 'motion') return o.evolve || o.motion ? (o.motion ? 'variations + timbre qui ondule' : 'variations d’une boucle à l’autre') : 'figé';
    if (id === 'echo') return o.echo.n ? `${o.echo.n} écho${o.echo.n > 1 ? 's' : ''}${o.echo.shift === 'up1' ? ' qui montent' : o.echo.shift === 'none' ? '' : ' transposés'}` : 'aucun';
    return '';
  }

  SS.Arp = {
    MODES, RATES, HARMONY, INVERSIONS, VOICINGS, REGISTERS, MACROS, macroPatch, macroValue, macroText, ECHO_SHIFTS, ECHO_GAPS, ROLLS, LANE_DIRS, RETRIG, LANES, DEFAULTS, PRESETS, CHORD_TYPES,
    normalize, fromPreset, analyzeChord, parsePattern, euclid, tick, renderStep, preview, parseChordSymbol,
    GESTES, GROUP_OF, GROUP_SIZES, normGeste, gesteTimes, gesteGroup: (arp) => gesteGroup(normalize(arp)),
    degreeNote: (notes, d) => degreeNote(chordOf(notes), d),
    invertChord,
    voiced: (notes, arp, loop = 0, events, ev) => voiced((notes || []).filter(Number.isFinite), normalize(arp), loop, events, ev),
    applyVoicing, chordStep, norgard, fibMod,
    rateLabel: (r) => {
      const x = RATES.find((y) => Math.abs(y.id - r) < 1e-6);
      return x ? x.label : `×${(+r).toFixed(2)}`;
    },
    noteName: (n) => NOTE[mod(n, 12)] + (Math.floor(n / 12) - 1),
    _rnd: rnd,
  };
})(typeof window !== 'undefined' ? window : globalThis);
