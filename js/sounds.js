/*
 * Catalogue des sons.
 * Les échantillons proviennent des bibliothèques utilisées par strudel.cc :
 *  - tidal-drum-machines (via felixroos/dough-samples)
 *  - VCSL (Versilian Community Sample Library)
 *  - piano (dough-samples)
 *  - Dirt-Samples (tidalcycles), Mridangam (yaxu/mrid)
 *  - les 125 soundfonts General MIDI de strudel (felixroos/webaudiofontdata), avec leurs variantes
 * + quelques synthés Web Audio intégrés (comme les oscillateurs de strudel).
 */
window.SS = window.SS || {};

SS.SOURCES = {
  tdm: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json',
  vcsl: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
  piano: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
  soundfont: 'https://raw.githubusercontent.com/felixroos/webaudiofontdata/master/sound/',
  dirt: 'https://raw.githubusercontent.com/tidalcycles/dirt-samples/main/strudel.json',
  mrid: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/mridangam.json',
};

/* Bibliothèques de batterie (comme sur strudel.cc) */
SS.DRUM_LIBS = [
  { id: 'tdm', label: 'Boîtes à rythmes', hint: 'tidal-drum-machines : 70 machines (TR-808, TR-909, LinnDrum…)' },
  { id: 'dirt', label: 'Dirt-Samples', hint: '218 banques de TidalCycles : kits, breaks, voix, bruitages…' },
  { id: 'vcsl', label: 'Percussions acoustiques', hint: 'VCSL : congas, bongos, cajón, gongs, cymbales…' },
  { id: 'mrid', label: 'Mridangam', hint: 'percussion d’Inde du Sud (syllabes ta, ki, dhin, thom…)' },
];

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

const vcsl = (key, label, opts = {}) => ({ id: 'vcsl_' + key, label, kind: 'multi', bank: 'vcsl', key, ...opts });
const synth = (id, label, params) => ({ id: 'syn_' + id, label, kind: 'synth', params });

/*
 * Familles d'instruments. Chaque famille contient, dans l'ordre :
 *  1. les synthés intégrés (VCO réglable dans le sound design),
 *  2. les instruments échantillonnés VCSL / piano de strudel,
 *  3. les 125 soundfonts General MIDI de strudel (gm_*), chacun avec plusieurs variantes.
 * Les listes 2 et 3 viennent de js/library.js (SS.LIB).
 */
const SYNTHS = {
  bass: [
    synth('sawbass', 'Saw Bass (synthé)', { wave: 'sawtooth', cutoff: 500, env: 2.6, q: 4, decay: 0.25, sustain: 0.6, release: 0.08 }),
    synth('acid', 'Acid Bass (synthé)', { wave: 'sawtooth', cutoff: 300, env: 3.8, q: 16, decay: 0.18, sustain: 0.5, release: 0.05 }),
    synth('sub', 'Sub Bass (synthé)', { wave: 'sine', cutoff: 2000, env: 0, q: 0, decay: 0.3, sustain: 0.9, release: 0.08 }),
    synth('sqbass', 'Square Bass (synthé)', { wave: 'square', cutoff: 700, env: 1.8, q: 3, decay: 0.2, sustain: 0.5, release: 0.06 }),
    synth('moogbass', 'Moog Bass (synthé, ladder + glide)', { wave: 'sawtooth', voices: 2, detune: 7, ftype: 'ladder', fdrive: 0.6, cutoff: 160, q: 12, env: 4, fattack: 0.003, fdecay: 0.28, fsustain: 0.15, frelease: 0.12, decay: 0.3, sustain: 0.8, release: 0.06, glide: 0.07, glideMode: 'legato' }),
    synth('acidladder', 'Acid Ladder (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.8, cutoff: 260, q: 22, env: 3.6, decay: 0.18, sustain: 0.5, release: 0.05, glide: 0.05, glideMode: 'legato' }),
    synth('reese', 'Reese Bass (synthé)', { wave: 'sawtooth', voices: 2, detune: 22, cutoff: 600, env: 1.2, q: 2, decay: 0.4, sustain: 0.8, release: 0.12 }),
  ],
  synth: [
    synth('saw', 'Sawtooth (synthé)', { wave: 'sawtooth', cutoff: 1800, env: 1.4, q: 2, decay: 0.3, sustain: 0.6, release: 0.12 }),
    synth('square', 'Square (synthé)', { wave: 'square', cutoff: 2000, env: 1, q: 2, decay: 0.3, sustain: 0.6, release: 0.12 }),
    synth('triangle', 'Triangle (synthé)', { wave: 'triangle', cutoff: 5000, env: 0, q: 0, decay: 0.3, sustain: 0.7, release: 0.15 }),
    synth('supersaw', 'Supersaw (synthé)', { wave: 'supersaw', voices: 5, detune: 18, cutoff: 2500, env: 1, q: 1, decay: 0.4, sustain: 0.7, release: 0.2 }),
    synth('pluck', 'Pluck (synthé)', { wave: 'sawtooth', voices: 2, detune: 6, cutoff: 400, env: 3.7, q: 6, decay: 0.12, sustain: 0.1, release: 0.15 }),
    synth('chip', 'Chiptune (synthé)', { wave: 'square', cutoff: 12000, env: 0, q: 0, attack: 0.002, decay: 0.08, sustain: 0.6, release: 0.03 }),
    synth('sine', 'Sine (synthé)', { wave: 'sine', cutoff: 20000, env: 0, q: 0, decay: 0.2, sustain: 0.8, release: 0.1 }),
  ],
  pads: [
    synth('softpad', 'Soft Pad (synthé)', { wave: 'sawtooth', voices: 2, detune: 10, cutoff: 900, env: 0.5, q: 1, attack: 0.25, decay: 0.6, sustain: 0.8, release: 0.8 }),
    synth('glasspad', 'Glass Pad (synthé)', { wave: 'triangle', voices: 2, detune: 7, cutoff: 4000, env: 0, q: 0, attack: 0.3, decay: 0.5, sustain: 0.9, release: 1.0 }),
    synth('superpad', 'Supersaw Pad (synthé)', { wave: 'supersaw', voices: 7, detune: 25, cutoff: 1400, env: 0.8, q: 1, attack: 0.5, decay: 1, sustain: 0.8, release: 1.4, fattack: 1.2, fdecay: 1.5, fsustain: 0.5, frelease: 1.4 }),
  ],
  fx: [
    synth('noiseriser', 'Noise Riser (synthé, bruit blanc)', { wave: 'white', cutoff: 250, env: 5.5, q: 6, attack: 1.2, decay: 0.3, sustain: 1, release: 0.4, fattack: 2, fdecay: 0.5, fsustain: 1, frelease: 0.4 }),
    synth('wind', 'Wind (synthé, bruit rose)', { wave: 'pink', cutoff: 700, env: 1.5, q: 8, attack: 0.8, decay: 1, sustain: 0.7, release: 1.2 }),
    synth('rumble', 'Rumble (synthé, bruit brun)', { wave: 'brown', cutoff: 300, env: 0, q: 2, attack: 0.3, decay: 0.5, sustain: 0.9, release: 0.8 }),
  ],
  keys: [],
};

const FAMILY_DEFS = [
  { id: 'keys', label: 'Pianos & Keys', octave: 4, extra: [{ id: 'piano', label: 'Piano (strudel)', kind: 'multi', bank: 'piano', key: 'piano', release: 0.3 }] },
  { id: 'organ', label: 'Orgues & Accordéons', octave: 4 },
  { id: 'bass', label: 'Bass', octave: 2 },
  { id: 'synth', label: 'Synth Lead', octave: 4 },
  { id: 'pads', label: 'Pads', octave: 4 },
  { id: 'strings', label: 'Cordes', octave: 4 },
  { id: 'voices', label: 'Chœurs & Voix', octave: 4 },
  { id: 'brass', label: 'Cuivres', octave: 4 },
  { id: 'winds', label: 'Bois & Vents', octave: 4 },
  { id: 'guitar', label: 'Guitares', octave: 3 },
  { id: 'mallets', label: 'Mallets & Cloches', octave: 4 },
  { id: 'world', label: 'Instruments du monde', octave: 4 },
  { id: 'perc', label: 'Percussions mélodiques', octave: 3 },
  { id: 'fx', label: 'Effets sonores', octave: 4 },
];

const LIB = SS.LIB || { gm: [], vcsl: [] };

/*
 * Banques mélodiques de Dirt-Samples (js/dirt.js) :
 *  - multi-échantillonnées (la note est dans le nom du fichier, ex. « Mighty Moog C2 ») -> kind 'multi' ;
 *  - les autres : un échantillon par variante, joué à la hauteur voulue en supposant,
 *    à partir de sa hauteur réelle mesurée (js/dirt-tuning.js) ; à défaut, comme strudel.cc, on suppose qu'il sonne à midi 36.
 */
SS.DIRT_ROOT = 36;
/** Hauteur réelle (midi) d'un fichier Dirt-Samples : table js/dirt-tuning.js, sinon l'hypothèse de strudel. */
SS.dirtRoot = (file) => (SS.DIRT_TUNING && SS.DIRT_TUNING[file]) ?? SS.DIRT_ROOT;
const dirtInst = (d) =>
  d.multi
    ? { id: 'dirt_' + d.bank, label: d.label + ' (Dirt-Samples)', kind: 'multi', bank: 'dirt', key: d.bank, strudel: d.bank }
    : { id: 'dirt_' + d.bank, label: d.label + ' (Dirt-Samples)', kind: 'dirt', files: d.files, strudel: d.bank };
const DIRT = SS.DIRT_INSTRUMENTS || [];

SS.FAMILIES = FAMILY_DEFS.map((f) => ({
  id: f.id,
  label: f.label,
  octave: f.octave,
  instruments: [
    ...(SYNTHS[f.id] || []),
    ...(f.extra || []),
    ...DIRT.filter((d) => d.family === f.id).map(dirtInst),
    ...LIB.vcsl.filter((v) => v.family === f.id).map((v) => vcsl(v.key, v.label + ' (VCSL)', { release: v.release })),
    ...LIB.gm
      .filter((g) => g.family === f.id)
      .map((g) => ({ id: g.id, label: g.label, kind: 'sf', files: g.files, release: g.release, strudel: g.id })),
  ],
}));

/** Nom lisible d'une variante de soundfont : « 0000_JCLive_sf2_file » -> « JCLive ». */
SS.sfVariantLabel = (file) => file.replace(/^\d+_/, '').replace(/_sf2_file$/, '').replace(/_/g, ' ');
/** Nom lisible d'une variante, soundfont ou échantillon Dirt (« jvbass/003_04.wav » -> « 04 »). */
SS.variantLabel = (inst, file) =>
  inst.kind === 'dirt'
    ? file.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '').replace(/^\d+_/, '').replace(/_/g, ' ')
    : SS.sfVariantLabel(file);

SS.findFamily = (id) => (id === 'analog' && SS.ANALOG_FAMILY) || SS.FAMILIES.find((f) => f.id === id) || SS.FAMILIES[0];
/** Cherche un instrument par son id, d'abord dans sa famille puis partout (projets anciens). */
SS.locateInstrument = (familyId, instId) => {
  if (familyId === 'analog' && SS.ANALOG_FAMILY) {
    // piste Synthé (js/juno.js) : synthés analogiques émulés
    const af = SS.ANALOG_FAMILY;
    return { family: af, inst: af.instruments.find((i) => i.id === instId) || af.instruments[0] };
  }
  const fam = SS.FAMILIES.find((f) => f.id === familyId);
  const inFam = fam && fam.instruments.find((i) => i.id === instId);
  if (inFam) return { family: fam, inst: inFam };
  for (const f of SS.FAMILIES) {
    const i = f.instruments.find((x) => x.id === instId);
    if (i) return { family: f, inst: i };
  }
  const f = fam || SS.FAMILIES[0];
  return { family: f, inst: f.instruments[0] };
};
SS.findInstrument = (familyId, instId) => SS.locateInstrument(familyId, instId).inst;

/**
 * Projets créés avant le catalogue strudel complet : les soundfonts étaient nommés « gm38 »
 * (programme GM, banque FluidR3). On les convertit en « gm_synth_bass_1 » + la variante FluidR3.
 */
SS.migrateInstrument = (track) => {
  const m = /^gm(\d+)$/.exec(track.instrument || '');
  if (!m) return;
  const prog = String(+m[1] * 10).padStart(4, '0');
  for (const f of SS.FAMILIES) {
    for (const i of f.instruments) {
      if (i.kind === 'sf' && i.files && i.files[0].slice(0, 3) === prog.slice(0, 3)) {
        track.instrument = i.id;
        track.family = f.id;
        const fluid = i.files.indexOf(prog + '_FluidR3_GM_sf2_file');
        track.sfv = fluid >= 0 ? fluid : 0;
        return;
      }
    }
  }
};

/** Fichier soundfont joué par une piste (variante choisie). */
SS.sfFile = (inst, track) => (inst.files ? inst.files[Math.min(track.sfv || 0, inst.files.length - 1)] : inst.file);

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
  // couleurs d'accord du mode avancé de la grille (Harmo One) ; `ext` : ignorées en premier par
  // SS.harmony.identify, pour qu'un accord déjà posé garde le nom qu'il avait (Am7/C plutôt que C6)
  { id: 'm7b5', label: 'm7♭5', iv: [0, 3, 6, 10], ext: true },
  { id: 'dim7', label: 'Dim7', iv: [0, 3, 6, 9], ext: true },
  { id: 'maj9', label: 'Maj9', iv: [0, 4, 7, 11, 14], ext: true },
  { id: '9', label: '9', iv: [0, 4, 7, 10, 14], ext: true },
  { id: '7b9', label: '7♭9', iv: [0, 4, 7, 10, 13], ext: true },
  { id: 'madd9', label: 'm(add9)', iv: [0, 3, 7, 14], ext: true },
  { id: '6', label: '6', iv: [0, 4, 7, 9], ext: true },
  { id: 'm6', label: 'm6', iv: [0, 3, 7, 9], ext: true },
  { id: '7sus4', label: '7sus4', iv: [0, 5, 7, 10], ext: true },
];
SS.chordNotes = (root, chordId) => {
  const c = SS.CHORDS.find((x) => x.id === chordId) || SS.CHORDS[0];
  return c.iv.map((i) => root + i);
};

// modes et vitesses de l'arpégiateur : voir js/arp.js (SS.Arp.MODES, SS.Arp.RATES)

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
  { id: 'white', label: 'Bruit blanc' },
  { id: 'pink', label: 'Bruit rose' },
  { id: 'brown', label: 'Bruit brun' },
];
SS.NOISES = ['white', 'pink', 'brown'];
SS.FILTER_TYPES = [
  { id: 'lowpass', label: 'Passe-bas', strudel: 'lpf' },
  { id: 'highpass', label: 'Passe-haut', strudel: 'hpf' },
  { id: 'bandpass', label: 'Passe-bande', strudel: 'bpf' },
  { id: 'notch', label: 'Coupe-bande', strudel: null },
];
/* Modèles de filtre, comme ftype() de strudel.cc (superdough : '12db', 'ladder', '24db') */
SS.FILTER_MODELS = [
  { id: '12db', label: '12 dB', hint: 'Biquad 2 pôles : doux, le filtre par défaut de strudel' },
  { id: '24db', label: '24 dB', hint: 'Deux biquads en série : pente raide, plus « synthé »' },
  { id: 'ladder', label: 'Ladder', hint: 'Échelle à transistors 4 pôles façon Moog : saturée, résonance chaude, drive' },
  { id: 'sem', label: 'SEM', hint: 'Variable d’état 2 pôles façon Oberheim SEM : résonance douce et ronde' },
];
/* Glide : pas d'équivalent dans strudel (portamento y est encore en commentaire) */
SS.GLIDE_MODES = [
  { id: 'always', label: 'Portamento', hint: 'Chaque note glisse depuis la précédente' },
  { id: 'legato', label: 'Glide legato', hint: 'Façon Moog : glisse seulement entre notes liées, sans redéclencher les enveloppes' },
];

/** Réglages par défaut du son d'une piste instrument (ceux du preset choisi). */
SS.soundDefaults = (track) => {
  const inst = SS.findInstrument(track.family, track.instrument);
  const base = { filter: 'lowpass', ftype: '12db', fdrive: 0.5, glide: 0, glideMode: 'always', pan: 0, drive: 0, gain: 1, voices: 1, detune: 0 };
  if (inst.kind === 'synth') {
    const p = inst.params;
    return {
      ...base,
      ftype: p.ftype || base.ftype,
      fdrive: p.fdrive ?? base.fdrive,
      glide: p.glide ?? 0,
      glideMode: p.glideMode || base.glideMode,
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
      // par défaut, l'enveloppe du filtre reprend l'ADSR du preset
      fattack: p.fattack ?? p.attack ?? 0.005,
      fdecay: p.fdecay ?? p.decay ?? 0.2,
      fsustain: p.fsustain ?? p.sustain ?? 0.7,
      frelease: p.frelease ?? p.release ?? 0.1,
    };
  }
  const rel = inst.release ?? 0.15;
  return {
    ...base, wave: null, cutoff: 20000, q: 0, env: 0, attack: 0.005, decay: 0.3, sustain: 1, release: rel,
    fattack: 0.005, fdecay: 0.3, fsustain: 0.3, frelease: rel,
  };
};

/** Réglages effectifs : preset + modifications de l'utilisateur (track.sd). */
SS.soundParams = (track) => {
  const d = SS.soundDefaults(track);
  const p = { ...d, ...(track.sd || {}) };
  if (d.wave === null) p.wave = null; // un échantillon n'a pas de VCO
  return p;
};

/* ---------- Effets par piste (inspirés de strudel.cc : room, delay ; + chorus) ---------- */
SS.DELAY_TIMES = [
  { id: '1/16', label: '1/16', beats: 0.25 },
  { id: '1/8T', label: '1/8 triolet', beats: 1 / 3 },
  { id: '1/8', label: '1/8', beats: 0.5 },
  { id: '3/16', label: '1/8 pointée', beats: 0.75 },
  { id: '1/4', label: '1/4', beats: 1 },
  { id: '3/8', label: '1/4 pointée', beats: 1.5 },
  { id: '1/2', label: '1/2', beats: 2 },
];
SS.FX_DEFAULTS = {
  chorus: 0, chorusRate: 0.8, chorusDepth: 0.5, // mix 0..1, vitesse Hz, profondeur 0..1
  delay: 0, delayTime: '3/16', delayFeedback: 0.4, // strudel : delay, delaytime, delayfeedback
  room: 0, roomSize: 2.5, roomLp: 8000, // strudel : room, roomsize (s), roomlp (Hz)
  scSource: '', scDepth: 0.6, scRelease: 0.22, // sidechain : piste qui déclenche, profondeur 0..1, relâchement (s)
};
SS.fxParams = (track) => ({ ...SS.FX_DEFAULTS, ...(track.fx || {}) });
SS.fxActive = (track) => {
  const f = SS.fxParams(track);
  return f.chorus > 0 || f.delay > 0 || f.room > 0 || (!!f.scSource && f.scDepth > 0);
};
SS.delaySeconds = (fx, tempo) => {
  const d = SS.DELAY_TIMES.find((x) => x.id === fx.delayTime) || SS.DELAY_TIMES[3];
  return Math.min(2.9, (60 / tempo) * d.beats);
};
