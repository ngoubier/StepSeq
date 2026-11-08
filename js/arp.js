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
    { id: 'rotate', label: 'Rotation (chaque cycle décale)', group: 'Formes' },
    { id: 'random', label: 'Aléatoire (avec répétitions)', group: 'Aléatoires (graine)' },
    { id: 'shuffle', label: 'Aléatoire sans répétition par cycle', group: 'Aléatoires (graine)' },
    { id: 'walk', label: 'Marche aléatoire', group: 'Aléatoires (graine)' },
    { id: 'drunk', label: 'Marche ivre', group: 'Aléatoires (graine)' },
    { id: 'chord', label: 'Accord rythmique (toutes les notes)', group: 'Accords et motifs' },
    { id: 'pattern', label: 'Motif relatif personnalisé', group: 'Accords et motifs' },
  ];

  const RATES = [
    { id: 0.25, label: '1/4' },
    { id: 1 / 3, label: '1/8 pointée' },
    { id: 0.5, label: '1/8' },
    { id: 0.75, label: '1/8 triolet' },
    { id: 2 / 3, label: '1/16 pointée' },
    { id: 1, label: '1/16' },
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
    prob: { label: 'Probabilité', min: 0, max: 1, def: 1 },
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
    retrig: 'chord',
    pattern: '',
    range: [24, 108],
    freeze: false,
    freezeLoop: 0,
    preset: '',
    rhythm: { type: 'all', hits: 5, steps: 16, rot: 0 },
    lanes: { rhythm: [], vel: [], gate: [], oct: [], ratchet: [], prob: [] },
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
    o.retrig = RETRIG.some((x) => x.id === o.retrig) ? o.retrig : 'chord';
    o.pattern = typeof o.pattern === 'string' ? o.pattern.slice(0, 400) : '';
    const r = Array.isArray(o.range) ? o.range.map(Number) : DEFAULTS.range;
    const lo = clamp(Math.round(num(r[0], 24)), 0, 120);
    o.range = [lo, clamp(Math.round(num(r[1], 108)), lo + 12, 127)];
    o.freeze = !!o.freeze;
    o.freezeLoop = Math.max(0, Math.round(num(+o.freezeLoop, 0)));
    o.preset = typeof o.preset === 'string' ? o.preset.slice(0, 40) : '';
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
      case 'rotate':
        return mod(p + Math.floor(j / n), n);
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
    thirds: ['up', 'updown'], rotate: ['up', 'thirds'], random: ['shuffle'], shuffle: ['walk'], walk: ['drunk'], drunk: ['walk'],
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
    return { notes: [pool[orderIndex(mode, pool.length, j, o.seed, evKey)]] };
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
    const notes = (ev.notes || []).filter(Number.isFinite);
    if (!notes.length) return null;
    const c = chordOf(notes);
    const pool = buildPool(notes, o);
    const evKey = (ev.step | 0) * 131 + notes.length * 7 + mod(notes[0], 12);
    const t = o.retrig === 'free' ? k + Math.ceil((ev.step || 0) * o.rate - 1e-9) : k; // index des lignes
    const lane = (name) => {
      const a = o.lanes[name];
      return a && a.length ? a[mod(t, a.length)] : LANES[name].def;
    };

    const rl = rhythmLane(o);
    if (rl && !rl[mod(t, rl.length)]) return null;
    const j = rl ? hitsBefore(rl, t) - (o.retrig === 'free' ? hitsBefore(rl, t - k) : 0) : k;

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
    let gate = o.gate * lane('gate');
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

    out = out.map((n) => fold(n + 12 * octShift, o.range));
    const swing = mod(t, 2) === 1 ? (o.swing - 0.5) * 2 : 0;
    if (base.tie) gate = base.tie + Math.max(gate, 1);
    return {
      notes: [...new Set(out)],
      vel: clamp(vel, 0.03, 1),
      gate: clamp(gate, 0.02, 8),
      ratchet: clamp(Math.round(ratchet), 1, 4),
      swing,
      cutoff,
      anchor,
      phrase: e > 0 ? phrase : 'A',
      j,
    };
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
    for (let k = k0; k < k1; k++) {
      if (k / rate >= ev.len - eps) break;
      const tk = tick(o, ev, k, { loop: info.loop, stepsPerBeat: info.stepsPerBeat, absStep: (info.loop | 0) * (info.trackLen || 0) + ev.step });
      if (!tk) continue;
      const at = (k / rate - (step - ev.step)) * sd + tk.swing * sub;
      const r = tk.ratchet;
      for (let i = 0; i < r; i++) {
        const dur = r > 1 ? (sub / r) * Math.min(tk.gate, 0.9) : sub * tk.gate;
        tk.notes.forEach((n) =>
          out.push({ midi: n, at: at + (i * sub) / r, dur: Math.max(0.01, dur), vel: tk.vel * (i ? 0.85 : 1), cutoff: tk.cutoff, first: k === 0 && i === 0 })
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

  SS.Arp = {
    MODES, RATES, HARMONY, RETRIG, LANES, DEFAULTS, PRESETS, CHORD_TYPES,
    normalize, fromPreset, analyzeChord, parsePattern, euclid, tick, renderStep, preview, parseChordSymbol,
    degreeNote: (notes, d) => degreeNote(chordOf(notes), d),
    rateLabel: (r) => {
      const x = RATES.find((y) => Math.abs(y.id - r) < 1e-6);
      return x ? x.label : `×${(+r).toFixed(2)}`;
    },
    noteName: (n) => NOTE[mod(n, 12)] + (Math.floor(n / 12) - 1),
    _rnd: rnd,
  };
})(typeof window !== 'undefined' ? window : globalThis);
