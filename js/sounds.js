/*
 * Catalogue des sons.
 * Les échantillons proviennent des bibliothèques utilisées par strudel.cc :
 *  - tidal-drum-machines (via felixroos/dough-samples)
 *  - VCSL (Versilian Community Sample Library)
 *  - piano (dough-samples)
 *  - Soundfonts General MIDI FluidR3 (felixroos/webaudiofontdata)
 * + quelques synthés Web Audio intégrés (comme les oscillateurs de strudel).
 */
window.SS = window.SS || {};

SS.SOURCES = {
  tdm: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json',
  vcsl: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
  piano: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
  soundfont: 'https://raw.githubusercontent.com/felixroos/webaudiofontdata/master/sound/',
};

/* ---------- Batterie ---------- */
SS.DRUM_TYPES = [
  { id: 'bd', label: 'Kick' },
  { id: 'sd', label: 'Snare' },
  { id: 'cp', label: 'Clap' },
  { id: 'rim', label: 'Rimshot' },
  { id: 'hh', label: 'Hi-Hat fermé' },
  { id: 'oh', label: 'Hi-Hat ouvert' },
  { id: 'lt', label: 'Tom grave' },
  { id: 'mt', label: 'Tom médium' },
  { id: 'ht', label: 'Tom aigu' },
  { id: 'cr', label: 'Crash' },
  { id: 'rd', label: 'Ride' },
  { id: 'cb', label: 'Cowbell' },
  { id: 'sh', label: 'Shaker' },
  { id: 'tb', label: 'Tambourin' },
  { id: 'perc', label: 'Percussion' },
  { id: 'misc', label: 'Divers' },
  { id: 'fx', label: 'FX' },
];
SS.DEFAULT_MACHINE = 'RolandTR808';

/* ---------- Instruments ---------- */
SS.CATEGORIES = [
  { id: 'mono', label: 'Mono' },
  { id: 'arp', label: 'Arpège' },
  { id: 'chord', label: 'Accord' },
];

const sf = (prog, label, opts = {}) => ({
  id: 'gm' + prog,
  label,
  kind: 'sf',
  file: String(prog * 10).padStart(4, '0') + '_FluidR3_GM_sf2_file',
  ...opts,
});
const vcsl = (key, label, opts = {}) => ({ id: 'vcsl_' + key, label, kind: 'multi', bank: 'vcsl', key, ...opts });
const synth = (id, label, params) => ({ id: 'syn_' + id, label, kind: 'synth', params });

SS.FAMILIES = [
  {
    id: 'bass', label: 'Bass', octave: 2, instruments: [
      synth('sawbass', 'Saw Bass (synthé)', { wave: 'sawtooth', cutoff: 500, env: 2.6, q: 4, decay: 0.25, sustain: 0.6, release: 0.08 }),
      synth('acid', 'Acid Bass (synthé)', { wave: 'sawtooth', cutoff: 300, env: 3.8, q: 16, decay: 0.18, sustain: 0.5, release: 0.05 }),
      synth('sub', 'Sub Bass (synthé)', { wave: 'sine', cutoff: 2000, env: 0, q: 0, decay: 0.3, sustain: 0.9, release: 0.08 }),
      synth('sqbass', 'Square Bass (synthé)', { wave: 'square', cutoff: 700, env: 1.8, q: 3, decay: 0.2, sustain: 0.5, release: 0.06 }),
      sf(38, 'Synth Bass 1'),
      sf(39, 'Synth Bass 2'),
      sf(33, 'Electric Bass (finger)'),
      sf(34, 'Electric Bass (pick)'),
      sf(35, 'Fretless Bass'),
      sf(36, 'Slap Bass'),
      sf(32, 'Acoustic Bass'),
    ],
  },
  {
    id: 'synth', label: 'Synth Lead', octave: 4, instruments: [
      synth('saw', 'Sawtooth (synthé)', { wave: 'sawtooth', cutoff: 1800, env: 1.4, q: 2, decay: 0.3, sustain: 0.6, release: 0.12 }),
      synth('square', 'Square (synthé)', { wave: 'square', cutoff: 2000, env: 1, q: 2, decay: 0.3, sustain: 0.6, release: 0.12 }),
      synth('triangle', 'Triangle (synthé)', { wave: 'triangle', cutoff: 5000, env: 0, q: 0, decay: 0.3, sustain: 0.7, release: 0.15 }),
      synth('supersaw', 'Supersaw (synthé)', { wave: 'supersaw', voices: 5, detune: 18, cutoff: 2500, env: 1, q: 1, decay: 0.4, sustain: 0.7, release: 0.2 }),
      synth('pluck', 'Pluck (synthé)', { wave: 'sawtooth', voices: 2, detune: 6, cutoff: 400, env: 3.7, q: 6, decay: 0.12, sustain: 0.1, release: 0.15 }),
      sf(80, 'Lead 1 (square)'),
      sf(81, 'Lead 2 (sawtooth)'),
      sf(82, 'Lead 3 (calliope)'),
      sf(83, 'Lead 4 (chiff)'),
      sf(84, 'Lead 5 (charang)'),
      sf(85, 'Lead 6 (voice)'),
      sf(86, 'Lead 7 (fifths)'),
      sf(87, 'Lead 8 (bass + lead)'),
    ],
  },
  {
    id: 'pads', label: 'Pads', octave: 4, instruments: [
      synth('softpad', 'Soft Pad (synthé)', { wave: 'sawtooth', voices: 2, detune: 10, cutoff: 900, env: 0.5, q: 1, attack: 0.25, decay: 0.6, sustain: 0.8, release: 0.8 }),
      synth('glasspad', 'Glass Pad (synthé)', { wave: 'triangle', voices: 2, detune: 7, cutoff: 4000, env: 0, q: 0, attack: 0.3, decay: 0.5, sustain: 0.9, release: 1.0 }),
      sf(88, 'Pad 1 (new age)', { release: 0.8 }),
      sf(89, 'Pad 2 (warm)', { release: 0.8 }),
      sf(90, 'Pad 3 (polysynth)', { release: 0.6 }),
      sf(91, 'Pad 4 (choir)', { release: 0.8 }),
      sf(92, 'Pad 5 (bowed)', { release: 0.8 }),
      sf(93, 'Pad 6 (metallic)', { release: 0.8 }),
      sf(94, 'Pad 7 (halo)', { release: 0.8 }),
      sf(95, 'Pad 8 (sweep)', { release: 0.8 }),
    ],
  },
  {
    id: 'keys', label: 'Keys', octave: 4, instruments: [
      { id: 'piano', label: 'Piano (strudel)', kind: 'multi', bank: 'piano', key: 'piano', release: 0.3 },
      vcsl('piano1', 'TX81Z Piano', { release: 0.3 }),
      vcsl('clavisynth', 'Clavisynth', { release: 0.2 }),
      vcsl('fmpiano', 'FM Piano', { release: 0.3 }),
      sf(4, 'Electric Piano 1'),
      sf(5, 'Electric Piano 2'),
      sf(6, 'Harpsichord'),
      sf(7, 'Clavinet'),
      sf(16, 'Drawbar Organ'),
      sf(17, 'Percussive Organ'),
      sf(18, 'Rock Organ'),
      vcsl('organ_full', 'Renaissance Organ', { release: 0.3 }),
    ],
  },
  {
    id: 'mallets', label: 'Mallets', octave: 4, instruments: [
      vcsl('vibraphone', 'Vibraphone', { release: 0.5 }),
      vcsl('marimba', 'Marimba', { release: 0.4 }),
      vcsl('xylophone_medium_ff', 'Xylophone', { release: 0.3 }),
      vcsl('glockenspiel', 'Glockenspiel', { release: 0.5 }),
      vcsl('balafon', 'Balafon', { release: 0.4 }),
      vcsl('handchimes', 'Hand Chimes', { release: 0.8 }),
      vcsl('tubularbells', 'Tubular Bells', { release: 0.8 }),
      sf(11, 'Vibraphone (GM)'),
      sf(13, 'Xylophone (GM)'),
    ],
  },
  {
    id: 'strings', label: 'Strings', octave: 4, instruments: [
      sf(48, 'String Ensemble 1', { release: 0.5 }),
      sf(49, 'String Ensemble 2', { release: 0.5 }),
      sf(50, 'Synth Strings 1', { release: 0.5 }),
      sf(51, 'Synth Strings 2', { release: 0.5 }),
      sf(40, 'Violin', { release: 0.3 }),
      sf(42, 'Cello', { release: 0.3 }),
      sf(45, 'Pizzicato Strings'),
      vcsl('harp', 'Concert Harp', { release: 0.6 }),
    ],
  },
  {
    id: 'brass', label: 'Brass & Winds', octave: 4, instruments: [
      sf(56, 'Trumpet'),
      sf(57, 'Trombone'),
      sf(61, 'Brass Section'),
      sf(62, 'Synth Brass 1'),
      sf(63, 'Synth Brass 2'),
      sf(71, 'Clarinet'),
      sf(73, 'Flute'),
      vcsl('sax', 'Tenor Sax'),
      vcsl('harmonica', 'Harmonica'),
    ],
  },
  {
    id: 'guitar', label: 'Guitar', octave: 3, instruments: [
      sf(24, 'Nylon Guitar'),
      sf(25, 'Steel Guitar'),
      sf(26, 'Jazz Guitar'),
      sf(27, 'Clean Guitar'),
      sf(28, 'Muted Guitar'),
      sf(29, 'Overdrive Guitar'),
      sf(30, 'Distortion Guitar'),
    ],
  },
];

SS.findFamily = (id) => SS.FAMILIES.find((f) => f.id === id) || SS.FAMILIES[0];
SS.findInstrument = (familyId, instId) => {
  const fam = SS.findFamily(familyId);
  return fam.instruments.find((i) => i.id === instId) || fam.instruments[0];
};

/* ---------- Accords / arpèges ---------- */
SS.CHORDS = [
  { id: 'maj', label: 'Majeur', iv: [0, 4, 7] },
  { id: 'min', label: 'Mineur', iv: [0, 3, 7] },
  { id: '7', label: '7', iv: [0, 4, 7, 10] },
  { id: 'maj7', label: 'Maj7', iv: [0, 4, 7, 11] },
  { id: 'm7', label: 'm7', iv: [0, 3, 7, 10] },
  { id: 'sus2', label: 'Sus2', iv: [0, 2, 7] },
  { id: 'sus4', label: 'Sus4', iv: [0, 5, 7] },
  { id: 'dim', label: 'Dim', iv: [0, 3, 6] },
  { id: 'aug', label: 'Aug', iv: [0, 4, 8] },
  { id: 'add9', label: 'Add9', iv: [0, 4, 7, 14] },
  { id: 'm9', label: 'm9', iv: [0, 3, 7, 10, 14] },
  { id: '5', label: 'Power (5)', iv: [0, 7, 12] },
];
SS.chordNotes = (root, chordId) => {
  const c = SS.CHORDS.find((x) => x.id === chordId) || SS.CHORDS[0];
  return c.iv.map((i) => root + i);
};

SS.ARP_MODES = [
  { id: 'up', label: 'Montant' },
  { id: 'down', label: 'Descendant' },
  { id: 'updown', label: 'Montant / Descendant' },
  { id: 'random', label: 'Aléatoire' },
];
SS.ARP_RATES = [
  { id: 0.5, label: '1/8' },
  { id: 1, label: '1/16' },
  { id: 2, label: '1/32' },
  { id: 1.5, label: '1/16 triolet' },
];

/* ---------- Notes ---------- */
SS.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
SS.noteName = (midi) => SS.NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
SS.isBlackKey = (midi) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
/** "C4", "Ds1", "A#3", "Bb2" -> midi */
SS.parseNote = (str) => {
  const m = /^([A-Ga-g])(#|s|b)?(-?\d+)$/.exec(String(str).trim());
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = m[2] === '#' || m[2] === 's' ? 1 : m[2] === 'b' ? -1 : 0;
  return base + acc + (parseInt(m[3], 10) + 1) * 12;
};

/* ---------- Couleurs ---------- */
SS.COLORS = ['#e3179c', '#ff4d6d', '#f08a00', '#f5c400', '#3fcf3f', '#13c2a3', '#1ea7ff', '#4f6bff', '#9b5cff', '#c0c0c0'];

/* ---------- Sound design (paramètres inspirés de strudel.cc) ---------- */
SS.WAVES = [
  { id: 'sawtooth', label: 'Saw' },
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'supersaw', label: 'Supersaw' },
];
SS.FILTER_TYPES = [
  { id: 'lowpass', label: 'Passe-bas', strudel: 'lpf' },
  { id: 'highpass', label: 'Passe-haut', strudel: 'hpf' },
  { id: 'bandpass', label: 'Passe-bande', strudel: 'bpf' },
];

/** Réglages par défaut du son d'une piste instrument (ceux du preset choisi). */
SS.soundDefaults = (track) => {
  const inst = SS.findInstrument(track.family, track.instrument);
  const base = { filter: 'lowpass', pan: 0, drive: 0, gain: 1, voices: 1, detune: 0 };
  if (inst.kind === 'synth') {
    const p = inst.params;
    return {
      ...base,
      wave: p.wave || 'sawtooth',
      voices: p.voices || (p.wave === 'supersaw' ? 5 : 1),
      detune: p.detune || 0,
      cutoff: p.cutoff ?? 2000,
      q: p.q ?? 1,
      env: p.env ?? 0,
      attack: p.attack ?? 0.005,
      decay: p.decay ?? 0.2,
      sustain: p.sustain ?? 0.7,
      release: p.release ?? 0.1,
    };
  }
  return { ...base, wave: null, cutoff: 20000, q: 0, env: 0, attack: 0.005, decay: 0.3, sustain: 1, release: inst.release ?? 0.15 };
};

/** Réglages effectifs : preset + modifications de l'utilisateur (track.sd). */
SS.soundParams = (track) => {
  const d = SS.soundDefaults(track);
  const p = { ...d, ...(track.sd || {}) };
  if (d.wave === null) p.wave = null; // un échantillon n'a pas de VCO
  return p;
};
