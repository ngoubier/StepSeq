/*
 * Modulation du synthé intégré : deux LFO par piste instrument, et l'oscillateur Pulse (PWM).
 * Partie « pure » (sans Web Audio) : formes, vitesses, phase calée sur le tempo, courbes échantillonnées.
 * Le branchement sur les voix est dans js/audio.js (synthVoice / sampleVoice).
 *
 * Réglages dans track.sd (clés plates, pour rester compatibles avec le format de projet) :
 *   lfo1Dest  : 'off' | 'pitch' | 'pw' | 'cutoff' | 'amp' | 'pan'
 *   lfo1Shape : 'sine' | 'triangle' | 'rampup' | 'rampdown' | 'square' | 'sh' | 'smooth'
 *   lfo1Rate  : valeur de note ('n16' … 'b64', calée sur le tempo) ou 'hz' (vitesse libre lfo1Hz)
 *   lfo1Hz    : 0,01 … 20 Hz (si lfo1Rate = 'hz')
 *   lfo1Mode  : 'free' (phase commune, calée sur la lecture : toutes les notes bougent ensemble)
 *               | 'retrig' (la phase repart à chaque note)
 *   lfo1Amt   : −1 … 1 (le signe inverse la forme)
 *   lfo1Fade  : fondu d'entrée après le début de la note (s)
 *   (idem lfo2…)
 *   pw        : largeur d'impulsion de l'onde Pulse, 0,05 … 0,95
 */
window.SS = window.SS || {};

SS.LFO_COUNT = 2;

SS.LFO_DESTS = [
  { id: 'off', label: 'Off', hint: 'LFO inactif' },
  { id: 'pitch', label: 'Hauteur', hint: 'Vibrato : ± 1 octave au maximum' },
  { id: 'pw', label: 'PWM', hint: 'Largeur d’impulsion (onde Pulse) : ± 45 %' },
  { id: 'cutoff', label: 'Cutoff', hint: 'Fréquence de coupure du filtre : ± 4 octaves' },
  { id: 'amp', label: 'Volume', hint: 'Trémolo : jusqu’au silence' },
  { id: 'pan', label: 'Pan', hint: 'Panoramique automatique' },
];

SS.LFO_SHAPES = [
  { id: 'sine', label: 'Sinus', icon: 'M2 10 C5 1 8 1 10 10 S15 19 18 10 S21 4 22 7' },
  { id: 'triangle', label: 'Triangle', icon: 'M2 14 L7 5 L12 14 L17 5 L22 14' },
  { id: 'rampup', label: 'Rampe ↑', icon: 'M2 16 L10 4 L10 16 L18 4 L18 16 L22 10' },
  { id: 'rampdown', label: 'Rampe ↓', icon: 'M2 4 L10 16 L10 4 L18 16 L18 4 L22 10' },
  { id: 'square', label: 'Carré', icon: 'M2 16 V5 H8 V16 H14 V5 H20 V16 H22' },
  { id: 'sh', label: 'S&H', icon: 'M2 12 H6 V5 H10 V15 H14 V8 H18 V13 H22' },
  { id: 'smooth', label: 'Aléatoire', icon: 'M2 12 C4 4 6 4 8 9 S12 16 14 11 S18 3 22 8' },
];

/* Vitesses calées sur le tempo, en noires (une double-croche = 1/4 de noire) ; 'b…' = mesures. */
SS.LFO_RATES = [
  { id: 'n16', label: '1/16', q: 0.25 },
  { id: 'n8t', label: '1/8 triolet', q: 1 / 3 },
  { id: 'n8', label: '1/8', q: 0.5 },
  { id: 'n4t', label: '1/4 triolet', q: 2 / 3 },
  { id: 'n8d', label: '1/8 pointée', q: 0.75 },
  { id: 'n4', label: '1/4', q: 1 },
  { id: 'n4d', label: '1/4 pointée', q: 1.5 },
  { id: 'n2', label: '1/2', q: 2 },
  { id: 'b1', label: '1 mesure', bars: 1 },
  { id: 'b2', label: '2 mesures', bars: 2 },
  { id: 'b4', label: '4 mesures', bars: 4 },
  { id: 'b8', label: '8 mesures', bars: 8 },
  { id: 'b16', label: '16 mesures', bars: 16 },
  { id: 'b32', label: '32 mesures', bars: 32 },
  { id: 'b64', label: '64 mesures', bars: 64 },
  { id: 'hz', label: 'Libre (Hz)' },
];

SS.LFO_MODES = [
  { id: 'free', label: 'Libre', hint: 'Phase commune, calée sur la lecture : les notes et les accords bougent ensemble' },
  { id: 'retrig', label: 'Retrig', hint: 'La phase repart du début à chaque note' },
];

SS.LFO_DEFAULTS = { Dest: 'off', Shape: 'sine', Rate: 'b1', Hz: 0.5, Mode: 'free', Amt: 0.5, Fade: 0 };

/** Réglages par défaut des LFO et du PWM, à fusionner dans SS.soundDefaults ; `p` : paramètres du preset. */
SS.modDefaults = (p = {}) => {
  const d = { pw: p.pw ?? 0.5 };
  for (let i = 1; i <= SS.LFO_COUNT; i++) {
    for (const [k, v] of Object.entries(SS.LFO_DEFAULTS)) d[`lfo${i}${k}`] = p[`lfo${i}${k}`] ?? v;
  }
  return d;
};

/** Réglages d'un LFO (1 ou 2) lus dans les paramètres de son. null s'il est inactif. */
SS.lfoOf = (p, i) => {
  const get = (k) => p[`lfo${i}${k}`] ?? SS.LFO_DEFAULTS[k];
  const dest = get('Dest');
  const amt = Number(get('Amt')) || 0;
  if (!dest || dest === 'off' || !SS.LFO_DESTS.some((d) => d.id === dest) || amt === 0) return null;
  return {
    index: i,
    dest,
    shape: SS.LFO_SHAPES.some((s) => s.id === get('Shape')) ? get('Shape') : 'sine',
    rate: SS.LFO_RATES.some((r) => r.id === get('Rate')) ? get('Rate') : 'b1',
    hz: Math.max(0.005, Math.min(40, Number(get('Hz')) || 0.5)),
    mode: get('Mode') === 'retrig' ? 'retrig' : 'free',
    amt: Math.max(-1, Math.min(1, amt)),
    fade: Math.max(0, Number(get('Fade')) || 0),
  };
};

/** LFO actifs d'un jeu de paramètres. */
SS.activeLfos = (p) => {
  const out = [];
  for (let i = 1; i <= SS.LFO_COUNT; i++) {
    const l = SS.lfoOf(p, i);
    if (l) out.push(l);
  }
  return out;
};

/**
 * Horloge musicale : { tempo, quarterBar, time, quarter } — à `time` (s), la lecture en est à `quarter` noires.
 * quarterBar : noires par mesure (4 en 4/4, 3 en 6/8).
 */
SS.lfoClock = (tempo = 120, quarterBar = 4, time = 0, quarter = 0) => ({ tempo, quarterBar, time, quarter });

/** Durée d'un cycle d'un LFO calé sur le tempo, en noires (null en mode Hz). */
SS.lfoCycleQuarters = (lfo, clock) => {
  const r = SS.LFO_RATES.find((x) => x.id === lfo.rate);
  if (!r || r.id === 'hz') return null;
  return r.bars ? r.bars * (clock.quarterBar || 4) : r.q;
};

/** Fréquence d'un LFO (Hz). */
SS.lfoHz = (lfo, clock) => {
  const q = SS.lfoCycleQuarters(lfo, clock);
  return q == null ? lfo.hz : (clock.tempo || 120) / 60 / q;
};

/** Nombre de cycles (réel) parcourus à l'instant t ; tOn = début de la note (mode Retrig). */
SS.lfoCycles = (lfo, t, tOn, clock) => {
  if (lfo.mode === 'retrig') return Math.max(0, t - tOn) * SS.lfoHz(lfo, clock);
  const q = SS.lfoCycleQuarters(lfo, clock);
  if (q == null) return t * lfo.hz;
  const quarters = clock.quarter + ((t - clock.time) * (clock.tempo || 120)) / 60;
  return quarters / q;
};

/** Nombre pseudo-aléatoire déterministe dans [−1, 1] (mêmes cycles -> mêmes valeurs pour toutes les voix). */
SS.lfoRandom = (seed, k) => {
  let h = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(k) | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 4294967295) * 2 - 1;
};

/** Valeur d'une forme (−1 … 1) après `cycles` cycles. */
SS.lfoShapeValue = (shape, cycles, seed = 0) => {
  const k = Math.floor(cycles);
  const ph = cycles - k;
  switch (shape) {
    case 'triangle':
      return ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4;
    case 'rampup':
      return 2 * ph - 1;
    case 'rampdown':
      return 1 - 2 * ph;
    case 'square':
      return ph < 0.5 ? 1 : -1;
    case 'sh':
      return SS.lfoRandom(seed, k);
    case 'smooth': {
      const a = SS.lfoRandom(seed, k);
      const b = SS.lfoRandom(seed, k + 1);
      return a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * ph));
    }
    default:
      return Math.sin(2 * Math.PI * ph);
  }
};

/** Graine d'un LFO pour une piste (les formes aléatoires diffèrent d'une piste et d'un LFO à l'autre). */
SS.lfoSeed = (trackId, index) => {
  let h = 2166136261;
  const s = String(trackId || 'preview') + '#' + index;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
};

/**
 * Courbe d'un LFO entre t0 et t1, pour AudioParam.setValueCurveAtTime : Float32Array dans [−1, 1]
 * (quantité non appliquée, fondu d'entrée appliqué). Assez de points pour suivre la forme sans en mettre trop.
 */
SS.lfoCurve = (lfo, t0, t1, tOn, clock, seed = 0) => {
  const dur = Math.max(0.001, t1 - t0);
  const hz = SS.lfoHz(lfo, clock);
  const perSec = Math.max(30, Math.min(2000, hz * 48));
  const n = Math.max(2, Math.min(16384, Math.ceil(dur * perSec) + 1));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = t0 + (dur * i) / (n - 1);
    let v = SS.lfoShapeValue(lfo.shape, SS.lfoCycles(lfo, t, tOn, clock), seed);
    if (lfo.fade > 0) v *= Math.max(0, Math.min(1, (t - tOn) / lfo.fade));
    out[i] = v;
  }
  return out;
};

/** Texte court d'une vitesse : « 1/8 », « 4 mesures », « 0,25 Hz ». */
SS.lfoRateLabel = (lfo) => {
  if (lfo.rate === 'hz') return `${lfo.hz < 1 ? lfo.hz.toFixed(2) : lfo.hz.toFixed(1)} Hz`.replace('.', ',');
  return (SS.LFO_RATES.find((r) => r.id === lfo.rate) || {}).label || lfo.rate;
};
