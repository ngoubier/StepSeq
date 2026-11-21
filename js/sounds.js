/*
 * Catalogue des sons.
 * Les échantillons proviennent des bibliothèques utilisées par strudel.cc :
 *  - tidal-drum-machines (via felixroos/dough-samples)
 *  - VCSL (Versilian Community Sample Library)
 *  - batteries enregistrées (AVL Drumkits, Forzee, Pacific : kits Hydrogen libres ; percussions de Noël VCSL), hébergées avec l'app (samples/live)
 *  - l'orchestre VSCO 2 Community Edition (Versilian Studios), hébergé avec l'app (samples/vsco, js/vsco.js)
 *  - des instruments libres CC0 (célesta, FreePats, Big Rusty Drums), hébergés avec l'app (samples/libre, js/libre.js)
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
  vsco: 'samples/vsco/vsco.json', // orchestre VSCO 2 (CC0), hébergé avec l'app : tools/vsco-local.py
  libre: 'samples/libre/libre.json', // instruments libres (CC0) : célesta, basse, guitare jazz, chœur, crash inversée : tools/libre-local.py
  live: 'samples/live/live.json', // batteries enregistrées (licences libres, samples/live/LICENSE.txt), hébergées avec l'app : tools/live-drums.py
};

/**
 * Fichiers VCSL dont le dossier contient une virgule (« Grand Piano, Steinway B », « Kalimba, Kenya »…) :
 * GitHub les sert avec un en-tête Content-Disposition que Chrome refuse. Ils sont copiés (raccourcis, en MP3)
 * dans samples/vcsl/ par tools/vcsl-local.py. Renvoie l'URL locale, ou null pour un fichier servi normalement.
 */
SS.vcslLocal = (base, file) => {
  if (!/sgossner\/VCSL/.test(base) || !(file.includes(',') || file.includes('%2C'))) return null;
  const p = decodeURIComponent(file).replace(/[^A-Za-z0-9._/-]+/g, '_').replace(/\.wav$/i, '.mp3');
  return 'samples/vcsl/' + p;
};

/* Bibliothèques de batterie (comme sur strudel.cc) */
SS.DRUM_LIBS = [
  { id: 'tdm', label: 'Boîtes à rythmes', hint: 'tidal-drum-machines : 70 machines (TR-808, TR-909, LinnDrum…)' },
  { id: 'dirt', label: 'Dirt-Samples', hint: '218 banques de TidalCycles : kits, breaks, voix, bruitages…' },
  { id: 'live', label: 'Batteries enregistrées', hint: '9 vraies batteries (pop, rock, ballade, fagots, reggae, cajón, Noël…), le niveau de frappe suit la vélocité' },
  { id: 'vcsl', label: 'Percussions acoustiques', hint: 'VCSL : congas, bongos, cajón, gongs, cymbales…' },
  { id: 'mrid', label: 'Mridangam', hint: 'percussion d’Inde du Sud (syllabes ta, ki, dhin, thom…)' },
  { id: 'gm', label: 'General MIDI', hint: 'les 47 sons de la batterie General MIDI (notes 35 à 81), kits FluidR3, JCLive, Chaos et SBLive' },
];

/* ---------- Batterie ---------- */
/* `midi` : note de la batterie General MIDI (canal 10) qui correspond à ce type de son. */
SS.DRUM_TYPES = [
  { id: 'bd', label: 'Kick', midi: 36 },
  { id: 'sd', label: 'Snare', midi: 38 },
  { id: 'cp', label: 'Clap', midi: 39 },
  { id: 'rim', label: 'Rimshot', midi: 37 },
  { id: 'hh', label: 'Hi-Hat fermé', midi: 42 },
  { id: 'oh', label: 'Hi-Hat ouvert', midi: 46 },
  { id: 'lt', label: 'Tom grave', midi: 41 },
  { id: 'mt', label: 'Tom médium', midi: 45 },
  { id: 'ht', label: 'Tom aigu', midi: 48 },
  { id: 'cr', label: 'Crash', midi: 49 },
  { id: 'rd', label: 'Ride', midi: 51 },
  { id: 'cb', label: 'Cowbell', midi: 56 },
  { id: 'sh', label: 'Shaker', midi: 70 },
  { id: 'tb', label: 'Tambourin', midi: 54 },
  { id: 'perc', label: 'Percussion', midi: 63 },
  { id: 'misc', label: 'Divers', midi: 76 },
  { id: 'fx', label: 'FX', midi: 52 },
];
SS.DEFAULT_MACHINE = 'RolandTR808';
/* Bibliothèques dont chaque banque range ses échantillons par niveau de frappe, du plus doux au plus fort :
   le coup joue le niveau de sa vélocité (au lieu de la variante choisie). */
SS.LAYERED_DRUM_LIBS = new Set(['live']);

/*
 * Batterie General MIDI : les 47 sons standard (notes 35 à 81 du canal 10).
 * `midi` : la note GM ; `type` : le type de son StepSeq le plus proche (SS.DRUM_TYPES).
 * Les échantillons viennent des soundfonts de webaudiofontdata, la bibliothèque que strudel.cc utilise
 * pour ses instruments gm_* : fichiers « 128<note>_<kit>_<soundfont>_sf2_file.js ».
 */
SS.GM_DRUMS = [
  [35, 'Kick acoustique', 'bd'], [36, 'Kick', 'bd'], [37, 'Side stick', 'rim'], [38, 'Snare', 'sd'], [39, 'Clap', 'cp'],
  [40, 'Snare électrique', 'sd'], [41, 'Tom basse grave', 'lt'], [42, 'Hi-Hat fermé', 'hh'], [43, 'Tom basse aigu', 'lt'],
  [44, 'Hi-Hat pédale', 'hh'], [45, 'Tom grave', 'mt'], [46, 'Hi-Hat ouvert', 'oh'], [47, 'Tom médium grave', 'mt'],
  [48, 'Tom médium aigu', 'ht'], [49, 'Crash 1', 'cr'], [50, 'Tom aigu', 'ht'], [51, 'Ride 1', 'rd'], [52, 'Cymbale chinoise', 'cr'],
  [53, 'Cloche de ride', 'rd'], [54, 'Tambourin', 'tb'], [55, 'Splash', 'cr'], [56, 'Cowbell', 'cb'], [57, 'Crash 2', 'cr'],
  [58, 'Vibraslap', 'perc'], [59, 'Ride 2', 'rd'], [60, 'Bongo aigu', 'perc'], [61, 'Bongo grave', 'perc'],
  [62, 'Conga aiguë étouffée', 'perc'], [63, 'Conga aiguë ouverte', 'perc'], [64, 'Conga grave', 'perc'],
  [65, 'Timbale aiguë', 'perc'], [66, 'Timbale grave', 'perc'], [67, 'Agogo aigu', 'perc'], [68, 'Agogo grave', 'perc'],
  [69, 'Cabasa', 'sh'], [70, 'Maracas', 'sh'], [71, 'Sifflet court', 'fx'], [72, 'Sifflet long', 'fx'], [73, 'Guiro court', 'perc'],
  [74, 'Guiro long', 'perc'], [75, 'Claves', 'perc'], [76, 'Wood-block aigu', 'perc'], [77, 'Wood-block grave', 'perc'],
  [78, 'Cuica étouffée', 'perc'], [79, 'Cuica ouverte', 'perc'], [80, 'Triangle étouffé', 'perc'], [81, 'Triangle ouvert', 'perc'],
].map(([midi, label, type]) => ({ midi, label, type }));
SS.findGmDrum = (note) => SS.GM_DRUMS.find((d) => d.midi === +note) || null;

/* Kits disponibles pour chaque note (inventaire du dépôt webaudiofontdata) : soundfont -> numéros de kit. */
const GM_KIT_SF = [
  { id: 'F', name: 'FluidR3_GM', label: 'FluidR3', suffix: '_sf2_file' },
  { id: 'J', name: 'JCLive', label: 'JCLive', suffix: '_sf2_file' },
  { id: 'C', name: 'Chaos', label: 'Chaos', suffix: '_sf2_file' },
  { id: 'S', name: 'SBLive', label: 'SBLive', suffix: '_sf2' },
];
const GM_KITS_DEFAULT = 'F0-30 J0-29 C0-11 S0-8';
const GM_KITS_EXCEPT = {
  35: 'F0-30 J0-8,10-18,20-28 C0-9,11 S0-7', 36: 'F0-30 J0-8,10-18,20-28 C0-9,11 S0-7',
  37: 'F0-30 J0-8,10-18,20-28 C0-9,11 S0-7', 38: 'F0-30 J0-8,10-18,20-28 C0-9,11 S0-7',
  58: 'F0-20,22-30 J0-29 C0-11 S0-8', 65: 'F0-20,22-30 J0-29 C0-11 S0-8', 66: 'F0-20,22-30 J0-29 C0-11 S0-8',
};
const gmDrumFilesCache = new Map();
/** Fichiers soundfont d'un son de batterie GM, kit standard FluidR3 en premier. */
SS.gmDrumFiles = (note) => {
  note = +note;
  if (!SS.findGmDrum(note)) return [];
  if (!gmDrumFilesCache.has(note)) {
    const files = [];
    for (const part of (GM_KITS_EXCEPT[note] || GM_KITS_DEFAULT).split(' ')) {
      const sf = GM_KIT_SF.find((k) => k.id === part[0]);
      for (const r of part.slice(1).split(',')) {
        const [a, b = a] = r.split('-').map(Number);
        for (let k = a; k <= b; k++) files.push(`128${note}_${k}_${sf.name}${sf.suffix}`);
      }
    }
    gmDrumFilesCache.set(note, files);
  }
  return gmDrumFilesCache.get(note);
};
/** « 12836_4_FluidR3_GM_sf2_file » -> « FluidR3 · kit 5 » */
SS.gmDrumKitLabel = (file) => {
  const m = /^128\d\d_(\d+)_(.*?)_sf2/.exec(file);
  const sf = m && GM_KIT_SF.find((k) => k.name === m[2]);
  return m ? `${sf ? sf.label : m[2]} · kit ${+m[1] + 1}` : file;
};

/* ---------- Instruments ---------- */
SS.CATEGORIES = [
  { id: 'mono', label: 'Mono' },
  { id: 'arp', label: 'Arpège' },
  { id: 'chord', label: 'Accord' },
];

const vcsl = (key, label, opts = {}) => ({ id: 'vcsl_' + key, label, kind: 'multi', bank: 'vcsl', key, ...opts });
/*
 * Preset du synthé intégré. meta (facultatif) : sub (sous-groupe du rôle « Synthés lead & plucks » : lead, arp, pluck),
 * desc (une phrase sur le son), styles, song / artist (son célèbre : « dans l'esprit de… »), fx (effets suggérés).
 */
const synth = (id, label, params, meta = {}) => ({ id: 'syn_' + id, label, kind: 'synth', params, ...meta });

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
    synth('acidsub', 'Acid Sub (synthé, accent + sous-oscillateur)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.7, cutoff: 220, q: 14, env: 2.4, fdecay: 0.2, fsustain: 0.2, decay: 0.25, sustain: 0.7, release: 0.05, sub: 0.55, accent: 0.8, glide: 0.06, glideMode: 'legato' }),
    synth('techsub', 'Techno Sub Bass (synthé, sous-oscillateur −2 oct)', { wave: 'pulse', pw: 0.3, cutoff: 900, env: 1.2, q: 2, decay: 0.2, sustain: 0.8, release: 0.06, sub: 0.7, subOct: 2 }),
    synth('pwmbass', 'PWM Bass (synthé, LFO 1 mesure)', { wave: 'pulse', pw: 0.35, ftype: '24db', cutoff: 650, env: 2.2, q: 3, decay: 0.3, sustain: 0.7, release: 0.08, lfo1Dest: 'pw', lfo1Shape: 'triangle', lfo1Rate: 'b1', lfo1Amt: 0.6 }),
    synth('evolbass', 'Evolving Bass (synthé, cutoff sur 4 mesures)', { wave: 'sawtooth', voices: 2, detune: 9, ftype: 'ladder', fdrive: 0.6, cutoff: 260, q: 10, env: 2, fdecay: 0.3, fsustain: 0.3, decay: 0.4, sustain: 0.8, release: 0.1, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b4', lfo1Amt: 0.4 }),
    synth('wobble', 'Wobble Bass (synthé, LFO 1/8)', { wave: 'sawtooth', voices: 2, detune: 12, ftype: 'ladder', fdrive: 0.7, cutoff: 300, q: 14, env: 0, decay: 0.3, sustain: 1, release: 0.08, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'n8', lfo1Mode: 'retrig', lfo1Amt: 0.6 }),
    synth('pwmreese', 'PWM Reese (synthé, PWM lent)', { wave: 'pulse', voices: 2, detune: 18, pw: 0.5, cutoff: 700, env: 1, q: 2, decay: 0.4, sustain: 0.85, release: 0.15, lfo1Dest: 'pw', lfo1Shape: 'sine', lfo1Rate: 'b2', lfo1Amt: 0.7, lfo2Dest: 'cutoff', lfo2Shape: 'smooth', lfo2Rate: 'b8', lfo2Amt: 0.25 }),
    // banque 2026-11 (maquettes/maquette-presets-synthe.html)
    synth('rubber', 'Basse caoutchouc (synthé)', { wave: 'pulse', pw: 0.4, ftype: 'ladder', fdrive: 0.5, cutoff: 220, q: 8, env: 3, fdecay: 0.22, fsustain: 0.2, decay: 0.3, sustain: 0.7, release: 0.06, sub: 0.4, glide: 0.04, glideMode: 'legato' }, { sub: 'bass', desc: 'Impulsion ronde, filtre ladder qui claque puis se referme : la basse élastique des années 80.', styles: 'synthwave, pop', fx: { cho: 0.3 } }),
    synth('octbass', 'Basse octaves synthwave (synthé)', { wave: 'sawtooth', voices: 2, detune: 8, cutoff: 350, q: 6, env: 2.8, fdecay: 0.15, fsustain: 0.1, decay: 0.2, sustain: 0.5, release: 0.05 }, { sub: 'bass', desc: 'Deux dents de scie désaccordées, enveloppe courte : faite pour les octaves en croches.', styles: 'synthwave', fx: { cho: 0.2, dly: 0.1 } }),
    synth('junobass', 'Basse carrée + sub (synthé)', { gain: 0.75, wave: 'pulse', pw: 0.5, ftype: '24db', cutoff: 420, q: 4, env: 2.2, fdecay: 0.18, fsustain: 0.25, decay: 0.3, sustain: 0.7, release: 0.06, sub: 0.6 }, { sub: 'bass', desc: 'Carré épais, sous-oscillateur une octave plus bas, filtre 24 dB : solide dans le mix.', styles: 'house, pop' }),
    synth('organbass', 'Basse orgue house (synthé)', { gain: 0.85, wave: 'square', cutoff: 900, q: 1, env: 1, decay: 0.15, sustain: 0.4, release: 0.05, sub: 0.5 }, { sub: 'bass', desc: 'Courte et ronde, presque sans filtre : la basse des débuts de la house.', styles: 'house' }),
    synth('sub808', 'Sub 808 glissé (synthé)', { wave: 'sine', cutoff: 20000, q: 0, env: 0, decay: 1.2, sustain: 0.8, release: 0.3, drive: 0.35, glide: 0.12, glideMode: 'always' }, { sub: 'bass', desc: 'Sinus long et saturé qui glisse d’une note à l’autre.', styles: 'hip-hop, trap' }),
    synth('growl', 'Basse grondante (synthé)', { wave: 'sawtooth', voices: 3, detune: 15, ftype: 'ladder', fdrive: 1, cutoff: 200, q: 18, env: 1.2, decay: 0.3, sustain: 0.9, release: 0.08, drive: 0.4, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'n16', lfo1Mode: 'retrig', lfo1Amt: 0.5 }, { sub: 'bass', desc: 'Trois scies, ladder poussé, LFO en doubles croches sur le filtre : ça gronde.', styles: 'techno, dubstep' }),
    synth('blbass', 'Basse rebondissante années 80 (synthé)', { wave: 'sawtooth', sub: 0.45, ftype: '24db', cutoff: 380, q: 4, env: 2.4, fdecay: 0.14, fsustain: 0.2, attack: 0.002, decay: 0.18, sustain: 0.55, release: 0.05, gain: 0.85 }, { sub: 'bass', song: 'Blinding Lights', artist: 'The Weeknd, 2019', styles: 'synthwave, synthpop', desc: 'Scie + sous-oscillateur dans un filtre 24 dB qui claque puis se referme : la basse en croches qui fait courir le morceau. Sans filtre émulé, donc légère.', fx: { cho: 0.15 } }),
    synth('funkbass', 'Basse funk pincée (synthé)', { wave: 'sawtooth', ftype: 'sem', fdrive: 0.4, cutoff: 180, q: 10, env: 4.5, fdecay: 0.09, fsustain: 0, decay: 0.25, sustain: 0.3, release: 0.05 }, { sub: 'bass', desc: 'Filtre SEM très résonant qui se ferme vite : un « pop » à chaque note.', styles: 'funk, pop' }),
    synth('dubbass', 'Basse dub (synthé)', { wave: 'triangle', cutoff: 600, q: 1, env: 0, decay: 0.5, sustain: 0.9, release: 0.12, sub: 0.5 }, { sub: 'bass', desc: 'Triangle grave et tenu, sous-oscillateur : rond, profond, sans aigu.', styles: 'reggae, dub' }),
    synth('bluemonday', 'Basse séquencée froide (synthé)', { wave: 'pulse', pw: 0.35, ftype: '24db', cutoff: 700, q: 3, env: 1.5, fdecay: 0.1, fsustain: 0.3, decay: 0.12, sustain: 0.6, release: 0.03, gain: 0.9 }, { sub: 'bass', song: 'Blue Monday', artist: 'New Order, 1983', desc: 'Impulsion sèche et un peu nasale, notes très courtes en doubles croches.', styles: 'new wave, synthpop' }),
    synth('ifeellove', 'Basse disco Moog (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.6, cutoff: 500, q: 6, env: 2, fdecay: 0.1, fsustain: 0.2, decay: 0.1, sustain: 0.5, release: 0.05 }, { sub: 'bass', song: 'I Feel Love', artist: 'Donna Summer, 1977', desc: 'Ladder qui claque à chaque double croche, avec un écho calé sur le tempo.', styles: 'disco, électro', fx: { dly: 0.35 } }),
    synth('sweetdreams', 'Basse SH rebondissante (synthé)', { wave: 'sawtooth', sub: 0.5, cutoff: 450, q: 5, env: 2.5, fdecay: 0.15, fsustain: 0.2, decay: 0.2, sustain: 0.5, release: 0.05 }, { sub: 'bass', song: 'Sweet Dreams', artist: 'Eurythmics, 1983', desc: 'Scie et sous-oscillateur, petite enveloppe de filtre : ronde et élastique.', styles: 'synthpop', fx: { cho: 0.2 } }),
    synth('acidtracks', 'Basse 303 qui couine (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.8, cutoff: 300, q: 26, env: 3.8, fdecay: 0.2, fsustain: 0.1, decay: 0.2, sustain: 0.6, release: 0.05, accent: 1, glide: 0.06, glideMode: 'legato' }, { sub: 'bass', song: 'Acid Tracks', artist: 'Phuture, 1987', desc: 'Ladder au maximum de résonance, accents et glissés entre notes liées.', styles: 'acid', fx: { dly: 0.15 } }),
    synth('dafunk', 'Basse acide saturée (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 1, cutoff: 350, q: 14, env: 2.5, fdecay: 0.3, fsustain: 0.3, decay: 0.3, sustain: 0.7, release: 0.06, drive: 0.7, glide: 0.04, glideMode: 'legato', gain: 0.8 }, { sub: 'bass', song: 'Da Funk', artist: 'Daft Punk, 1995', desc: 'La même famille, mais écrasée par la saturation : grasse et sale.', styles: 'french touch' }),
    synth('boogie', 'Basse Moog funk (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.5, cutoff: 400, q: 4, env: 2, fdecay: 0.3, fsustain: 0.5, decay: 0.4, sustain: 0.8, release: 0.08, sub: 0.3, glide: 0.09, glideMode: 'legato' }, { sub: 'bass', song: 'Boogie On Reggae Woman', artist: 'Stevie Wonder, 1974', desc: 'Ladder chaud, sous-oscillateur, glissés lents d’une note à l’autre.', styles: 'funk, soul' }),
  ],
  synth: [
    synth('saw', 'Sawtooth (synthé)', { wave: 'sawtooth', cutoff: 1800, env: 1.4, q: 2, decay: 0.3, sustain: 0.6, release: 0.12 }),
    synth('square', 'Square (synthé)', { wave: 'square', cutoff: 2000, env: 1, q: 2, decay: 0.3, sustain: 0.6, release: 0.12 }),
    synth('triangle', 'Triangle (synthé)', { wave: 'triangle', cutoff: 5000, env: 0, q: 0, decay: 0.3, sustain: 0.7, release: 0.15 }),
    synth('supersaw', 'Supersaw (synthé)', { wave: 'supersaw', voices: 5, detune: 18, cutoff: 2500, env: 1, q: 1, decay: 0.4, sustain: 0.7, release: 0.2 }),
    synth('pluck', 'Pluck (synthé)', { wave: 'sawtooth', voices: 2, detune: 6, cutoff: 400, env: 3.7, q: 6, decay: 0.12, sustain: 0.1, release: 0.15 }, { sub: 'pluck' }),
    synth('chip', 'Chiptune (synthé)', { wave: 'square', cutoff: 12000, env: 0, q: 0, attack: 0.002, decay: 0.08, sustain: 0.6, release: 0.03 }, { sub: 'arp' }),
    synth('sine', 'Sine (synthé)', { wave: 'sine', cutoff: 20000, env: 0, q: 0, decay: 0.2, sustain: 0.8, release: 0.1 }),
    // banque 2026-11 (maquettes/maquette-presets-synthe.html)
    synth('swlead', 'Lead synthwave (synthé)', { wave: 'sawtooth', voices: 2, detune: 10, cutoff: 2200, q: 3, env: 1.2, decay: 0.4, sustain: 0.75, release: 0.2, glide: 0.05, glideMode: 'legato', lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5.5, lfo1Amt: 0.015, lfo1Fade: 0.4 }, { sub: 'lead', desc: 'Deux scies, glide legato et vibrato qui arrive après l’attaque.', styles: 'synthwave', fx: { cho: 0.3, dly: 0.35, rev: 0.3 } }),
    synth('sqlead', 'Lead carré creux (synthé)', { gain: 0.8, wave: 'pulse', pw: 0.25, ftype: '24db', cutoff: 3000, q: 2, env: 0.6, decay: 0.3, sustain: 0.8, release: 0.15, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5, lfo1Amt: 0.01, lfo1Fade: 0.3 }, { sub: 'lead', desc: 'Impulsion étroite au son nasal, filtre 24 dB, petit vibrato.', styles: 'pop, chiptune', fx: { dly: 0.25, rev: 0.2 } }),
    synth('monolead', 'Lead mono ladder (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.7, cutoff: 900, q: 10, env: 2.5, fdecay: 0.4, fsustain: 0.5, decay: 0.4, sustain: 0.8, release: 0.12, sub: 0.3, glide: 0.08, glideMode: 'legato' }, { sub: 'lead', desc: 'Le solo façon Minimoog : ladder chaud, sous-oscillateur, glide entre notes liées.', styles: 'prog, funk', fx: { dly: 0.2, rev: 0.15 } }),
    synth('trancelead', 'Lead supersaw (synthé)', { wave: 'supersaw', voices: 7, detune: 22, cutoff: 4000, q: 1, env: 0.8, decay: 0.4, sustain: 0.8, release: 0.25 }, { sub: 'lead', desc: 'Sept scies désaccordées, très large, pour les mélodies qui doivent briller.', styles: 'trance, edm', fx: { dly: 0.3, rev: 0.4 } }),
    synth('whistle', 'Sifflet (synthé)', { wave: 'sine', cutoff: 20000, q: 0, env: 0, attack: 0.03, decay: 0.3, sustain: 0.9, release: 0.2, glide: 0.1, glideMode: 'always', lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5, lfo1Amt: 0.012, lfo1Fade: 0.6 }, { sub: 'lead', desc: 'Sinus pur qui glisse, vibrato lent : une mélodie sifflée.', styles: 'pop, film', fx: { dly: 0.25, rev: 0.4 } }),
    synth('acidlead', 'Lead acide (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.8, cutoff: 500, q: 24, env: 3.5, fdecay: 0.25, fsustain: 0.2, decay: 0.3, sustain: 0.6, release: 0.08, accent: 0.9, glide: 0.05, glideMode: 'legato' }, { sub: 'lead', desc: 'Ladder au bord de l’auto-oscillation : chaque note crie.', styles: 'acid, techno', fx: { dly: 0.25 } }),
    synth('screamer', 'Lead saturé (synthé)', { wave: 'square', ftype: 'sem', fdrive: 0.9, cutoff: 1500, q: 14, env: 1.5, fdecay: 0.3, fsustain: 0.5, decay: 0.3, sustain: 0.8, release: 0.12, drive: 0.6 }, { sub: 'lead', desc: 'Carré saturé dans un filtre SEM résonant : rugueux, façon guitare synthé.', styles: 'rock, edm', fx: { dly: 0.2, rev: 0.2 } }),
    synth('arp80', 'Arpège années 80 (synthé)', { gain: 0.7, wave: 'pulse', pw: 0.3, cutoff: 1200, q: 6, env: 2.5, fdecay: 0.1, fsustain: 0.1, decay: 0.15, sustain: 0.2, release: 0.1 }, { sub: 'arp', desc: 'Impulsion courte et brillante, filtre qui claque : l’arpège de toutes les BO 80s.', styles: 'synthwave, pop', fx: { cho: 0.3, dly: 0.3, rev: 0.2 } }),
    synth('arpcrystal', 'Arpège cristal (synthé)', { wave: 'triangle', cutoff: 6000, q: 0, env: 0, attack: 0.002, decay: 0.2, sustain: 0, release: 0.3 }, { sub: 'arp', desc: 'Triangle sans filtre, notes qui tintent et se fondent dans l’écho.', styles: 'ambient, pop', fx: { dly: 0.4, rev: 0.4 } }),
    synth('arpacid', 'Arpège acide qui s’ouvre (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.7, cutoff: 400, q: 18, env: 3, fdecay: 0.12, fsustain: 0.1, decay: 0.15, sustain: 0.4, release: 0.05, lfo1Dest: 'cutoff', lfo1Shape: 'triangle', lfo1Rate: 'b2', lfo1Amt: 0.35 }, { sub: 'arp', desc: 'Ladder résonant, LFO lent sur 2 mesures : le filtre s’ouvre et se ferme tout seul.', styles: 'acid, techno', fx: { dly: 0.2 } }),
    synth('arpberlin', 'Séquence berlinoise (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.6, cutoff: 300, q: 12, env: 3.5, fdecay: 0.12, fsustain: 0.1, decay: 0.15, sustain: 0.3, release: 0.08, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b8', lfo1Amt: 0.4 }, { sub: 'arp', desc: 'Scie ladder sombre, balayage sur 8 mesures : les séquences hypnotiques des années 70.', styles: 'électro, film', fx: { dly: 0.35, rev: 0.3 } }),
    synth('arpchip', 'Arpège 8 bits (synthé)', { wave: 'pulse', pw: 0.125, cutoff: 12000, q: 0, env: 0, attack: 0.002, decay: 0.06, sustain: 0.3, release: 0.02 }, { sub: 'arp', desc: 'Carré nu, très court : la console de jeu.', styles: 'chiptune' }),
    synth('arptrance', 'Arpège trance (synthé)', { wave: 'supersaw', voices: 5, detune: 16, cutoff: 2500, q: 2, env: 1.5, fdecay: 0.1, fsustain: 0.2, decay: 0.1, sustain: 0.2, release: 0.05 }, { sub: 'arp', desc: 'Supersaw coupé net, comme passé dans un gate.', styles: 'trance, edm', fx: { dly: 0.3, rev: 0.3 } }),
    synth('swpluck', 'Pluck synthwave (synthé)', { gain: 1.4, wave: 'sawtooth', voices: 2, detune: 8, cutoff: 300, q: 4, env: 4, fdecay: 0.15, fsustain: 0, decay: 0.4, sustain: 0, release: 0.3 }, { sub: 'pluck', desc: 'Deux scies, filtre qui se ferme en un éclair, longue queue dans l’écho.', styles: 'synthwave, pop', fx: { cho: 0.3, dly: 0.35, rev: 0.3 } }),
    synth('housestab', 'Stab house (synthé)', { gain: 1.8, wave: 'supersaw', voices: 5, detune: 14, cutoff: 600, q: 3, env: 3.5, fdecay: 0.12, fsustain: 0, decay: 0.25, sustain: 0, release: 0.12 }, { sub: 'pluck', desc: 'Accord supersaw court et mordant, pour les contretemps.', styles: 'house', fx: { rev: 0.25 } }),
    synth('synkalimba', 'Kalimba synthé (synthé)', { wave: 'sine', cutoff: 3000, q: 1, env: 1.5, fdecay: 0.03, fsustain: 0, attack: 0.002, decay: 0.35, sustain: 0, release: 0.3, noise: 0.12, noiseColor: 'pink' }, { sub: 'pluck', desc: 'Sinus et une pointe de bruit à l’attaque : bois et lamelle.', styles: 'afro, pop', fx: { rev: 0.3 } }),
    synth('synmarimba', 'Marimba synthé (synthé)', { wave: 'triangle', cutoff: 2500, q: 1, env: 1, fdecay: 0.05, fsustain: 0, attack: 0.002, decay: 0.25, sustain: 0, release: 0.2, sub: 0.3 }, { sub: 'pluck', desc: 'Triangle et sous-oscillateur, attaque sèche et très courte.', styles: 'pop, tropical', fx: { rev: 0.25 } }),
    synth('synharp', 'Harpe synthé (synthé)', { wave: 'sawtooth', cutoff: 500, q: 3, env: 3, fdecay: 0.5, fsustain: 0, attack: 0.002, decay: 1.2, sustain: 0, release: 0.8 }, { sub: 'pluck', desc: 'Note pincée qui résonne longtemps, filtre qui se referme doucement.', styles: 'film, ambient', fx: { cho: 0.2, rev: 0.5 } }),
    synth('synpizz', 'Pizzicato synthé (synthé)', { gain: 2, wave: 'sawtooth', ftype: '24db', cutoff: 700, q: 2, env: 2, fdecay: 0.08, fsustain: 0, decay: 0.15, sustain: 0, release: 0.1 }, { sub: 'pluck', desc: 'Très court, filtre 24 dB : des cordes pincées en plastique, à la façon des années 80.', styles: 'film, pop', fx: { rev: 0.35 } }),
    synth('bllead', 'Lead du riff, brillant (synthé)', { wave: 'sawtooth', voices: 2, detune: 9, cutoff: 2600, q: 1.5, env: 1.2, fdecay: 0.25, fsustain: 0.55, attack: 0.004, decay: 0.3, sustain: 0.75, release: 0.18, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5.5, lfo1Amt: 0.006, lfo1Fade: 0.4, gain: 0.75 }, { sub: 'lead', song: 'Blinding Lights', artist: 'The Weeknd, 2019', styles: 'synthwave, synthpop', desc: 'Deux scies légèrement désaccordées, filtre ouvert, petit vibrato tardif, chorus et écho : le riff qui brille au-dessus du mix.', fx: { cho: 0.35, dly: 0.2, rev: 0.3 } }),
    synth('blarp', 'Arpège nocturne en doubles croches (synthé)', { wave: 'pulse', pw: 0.4, cutoff: 1800, q: 3, env: 1.8, fdecay: 0.12, fsustain: 0.1, attack: 0.002, decay: 0.18, sustain: 0.15, release: 0.12, gain: 0.9 }, { sub: 'arp', song: 'Blinding Lights', artist: 'The Weeknd, 2019', styles: 'synthwave, synthpop', desc: 'Impulsion courte et piquée, faite pour tourner en doubles croches à 171 BPM sous les accords.', fx: { dly: 0.25, rev: 0.3 } }),
    synth('axelf', 'Lead carré staccato (synthé)', { wave: 'pulse', pw: 0.45, cutoff: 2500, q: 2, env: 1, fdecay: 0.15, fsustain: 0.6, decay: 0.15, sustain: 0.7, release: 0.05, gain: 0.8 }, { sub: 'lead', song: 'Axel F', artist: 'Harold Faltermeyer, 1984', desc: 'Impulsion presque carrée, notes coupées net : sec et sautillant.', styles: '80s, film', fx: { dly: 0.2, rev: 0.2 } }),
    synth('luckyman', 'Solo Minimoog (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.6, cutoff: 1200, q: 6, env: 1.5, fdecay: 0.4, fsustain: 0.6, decay: 0.4, sustain: 0.85, release: 0.15, sub: 0.3, glide: 0.15, glideMode: 'always', lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5.5, lfo1Amt: 0.01, lfo1Fade: 0.6 }, { sub: 'lead', song: 'Lucky Man', artist: 'Emerson, Lake & Palmer, 1970', desc: 'Ladder rond, sous-oscillateur, long portamento entre toutes les notes.', styles: 'prog, 70s', fx: { dly: 0.2, rev: 0.3 } }),
    synth('popcorn', 'Lead rebondi (synthé)', { wave: 'square', cutoff: 1800, q: 4, env: 2, fdecay: 0.08, fsustain: 0.2, decay: 0.1, sustain: 0.3, release: 0.05 }, { sub: 'lead', song: 'Popcorn', artist: 'Hot Butter, 1972', desc: 'Carré filtré, attaque qui « poppe », note très courte.', styles: '70s, pop', fx: { rev: 0.2 } }),
    synth('oxygene4', 'Lead doux et chantant (synthé)', { wave: 'pulse', pw: 0.5, ftype: 'sem', fdrive: 0.3, cutoff: 1400, q: 3, env: 0.5, attack: 0.02, decay: 0.4, sustain: 0.85, release: 0.3, glide: 0.04, glideMode: 'legato', lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5.5, lfo1Amt: 0.015, lfo1Fade: 0.3 }, { sub: 'lead', song: 'Oxygène (Part IV)', artist: 'Jean-Michel Jarre, 1976', desc: 'Impulsion ronde dans un SEM, vibrato et léger glide : une voix qui chante.', styles: 'électro, 70s', fx: { cho: 0.4, dly: 0.3, rev: 0.4 } }),
    synth('sandstorm', 'Supersaw martelée (synthé)', { wave: 'supersaw', voices: 7, detune: 20, cutoff: 3500, q: 1, env: 1, fdecay: 0.1, fsustain: 0.4, decay: 0.12, sustain: 0.4, release: 0.05, gain: 0.9 }, { sub: 'lead', song: 'Sandstorm', artist: 'Darude, 1999', desc: 'Supersaw coupée court, répétée en doubles croches.', styles: 'trance', fx: { dly: 0.2, rev: 0.3 } }),
    synth('chariotslead', 'Lead cuivré lent (synthé)', { wave: 'sawtooth', voices: 3, detune: 8, cutoff: 900, q: 2, env: 2, fattack: 0.2, fdecay: 0.8, fsustain: 0.6, attack: 0.08, decay: 0.6, sustain: 0.9, release: 0.8, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5, lfo1Amt: 0.012, lfo1Fade: 0.5, gain: 0.85 }, { sub: 'lead', song: 'Chariots of Fire', artist: 'Vangelis, 1981', desc: 'Trois scies, filtre qui s’ouvre doucement, vibrato tardif : majestueux.', styles: 'film', fx: { cho: 0.2, rev: 0.6 } }),
    synth('chase', 'Séquence disco pulsée (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.6, cutoff: 600, q: 8, env: 2, fdecay: 0.08, fsustain: 0.2, decay: 0.1, sustain: 0.3, release: 0.05 }, { sub: 'arp', song: 'Chase', artist: 'Giorgio Moroder, 1978', desc: 'Ladder qui claque en doubles croches, un peu d’écho.', styles: 'disco, film', fx: { dly: 0.25 } }),
    synth('ontherun', 'Boucle rapide qui tourne (synthé)', { wave: 'pulse', pw: 0.3, ftype: 'sem', fdrive: 0.5, cutoff: 800, q: 12, env: 2, fdecay: 0.06, fsustain: 0.2, decay: 0.08, sustain: 0.3, release: 0.04, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b2', lfo1Amt: 0.5 }, { sub: 'arp', song: 'On the Run', artist: 'Pink Floyd, 1973', desc: 'Huit notes en boucle très rapide, filtre SEM balayé par un LFO lent.', styles: 'prog, 70s', fx: { dly: 0.3, rev: 0.2 } }),
    synth('realtrain', 'Séquence hypnotique (synthé)', { wave: 'sawtooth', ftype: 'ladder', fdrive: 0.6, cutoff: 350, q: 10, env: 3, fdecay: 0.12, fsustain: 0.1, decay: 0.15, sustain: 0.3, release: 0.08, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b4', lfo1Amt: 0.35 }, { sub: 'arp', song: 'Love on a Real Train', artist: 'Tangerine Dream, 1983', desc: 'Ladder sombre et résonant qui s’ouvre et se ferme sur 4 mesures.', styles: 'électro, film', fx: { dly: 0.35, rev: 0.3 } }),
    synth('stranger', 'Arpège sombre qui s’ouvre (synthé)', { gain: 1.4, wave: 'sawtooth', voices: 2, detune: 6, ftype: 'ladder', fdrive: 0.5, cutoff: 250, q: 8, env: 2, fdecay: 0.15, fsustain: 0.2, decay: 0.2, sustain: 0.4, release: 0.1, lfo1Dest: 'cutoff', lfo1Shape: 'rampup', lfo1Rate: 'b4', lfo1Amt: 0.4 }, { sub: 'arp', song: 'Stranger Things (générique)', artist: 'Kyle Dixon & Michael Stein, 2016', desc: 'Deux scies, ladder fermé qui s’ouvre lentement sur 8 mesures.', styles: 'synthwave, film', fx: { cho: 0.3, dly: 0.3, rev: 0.4 } }),
    synth('sunglasses', 'Basse-arpège en croches (synthé)', { wave: 'pulse', pw: 0.4, cutoff: 500, q: 6, env: 2.5, fdecay: 0.1, fsustain: 0.2, decay: 0.15, sustain: 0.3, release: 0.05, sub: 0.4 }, { sub: 'arp', song: 'Sunglasses at Night', artist: 'Corey Hart, 1983', desc: 'Impulsion et sous-oscillateur, croches régulières dans le grave.', styles: '80s, synthpop', fx: { cho: 0.2, dly: 0.2 } }),
    synth('blpluck', 'Pluck en contre-chant (synthé)', { wave: 'square', voices: 2, detune: 6, cutoff: 900, q: 2, env: 3, fdecay: 0.16, fsustain: 0, attack: 0.002, decay: 0.35, sustain: 0, release: 0.3, gain: 1.1 }, { sub: 'pluck', song: 'Blinding Lights', artist: 'The Weeknd, 2019', styles: 'synthwave, synthpop', desc: 'Deux carrés pincés, chute rapide, longue traîne d’écho : les petites réponses entre les phrases.', fx: { cho: 0.3, dly: 0.35, rev: 0.3 } }),
    synth('takeonme', 'Riff pincé brillant (synthé)', { wave: 'sawtooth', voices: 2, detune: 6, cutoff: 1500, q: 2, env: 2.5, fdecay: 0.2, fsustain: 0.2, decay: 0.3, sustain: 0.2, release: 0.2, gain: 0.9 }, { sub: 'pluck', song: 'Take On Me', artist: 'a-ha, 1984', desc: 'Deux scies brillantes, chute rapide. Approximation : l’original mélange aussi un son FM.', styles: '80s, synthpop', fx: { cho: 0.4, rev: 0.3 } }),
    synth('faded', 'Pluck doux pop (synthé)', { wave: 'sawtooth', voices: 2, detune: 10, cutoff: 600, q: 2, env: 2.5, fdecay: 0.25, fsustain: 0, decay: 0.5, sustain: 0, release: 0.4, gain: 1.3 }, { sub: 'pluck', song: 'Faded', artist: 'Alan Walker, 2015', desc: 'Deux scies désaccordées, filtre qui se referme doucement, longue réverbe.', styles: 'edm, pop', fx: { dly: 0.3, rev: 0.5 } }),
    synth('firestone', 'Pluck tropical (synthé)', { gain: 1.3, wave: 'triangle', cutoff: 3000, q: 1, env: 1, fdecay: 0.04, fsustain: 0, attack: 0.002, decay: 0.3, sustain: 0, release: 0.25, sub: 0.2, noise: 0.05, noiseColor: 'pink' }, { sub: 'pluck', song: 'Firestone', artist: 'Kygo, 2014', desc: 'Façon marimba : triangle, sous-octave et un souffle d’attaque.', styles: 'tropical', fx: { dly: 0.25, rev: 0.3 } }),
    synth('strobe', 'Pluck qui s’ouvre (synthé)', { wave: 'sawtooth', voices: 2, detune: 8, cutoff: 250, q: 6, env: 3.5, fdecay: 0.2, fsustain: 0, decay: 0.3, sustain: 0, release: 0.3, lfo1Dest: 'cutoff', lfo1Shape: 'rampup', lfo1Rate: 'b4', lfo1Amt: 0.4, gain: 1 }, { sub: 'pluck', song: 'Strobe', artist: 'deadmau5, 2009', desc: 'Filtre fermé au départ qui s’ouvre petit à petit sur 8 mesures.', styles: 'progressive, edm', fx: { dly: 0.4, rev: 0.4 } }),
    synth('africa', 'Motif façon kalimba (synthé)', { wave: 'sine', cutoff: 2500, q: 1, env: 1, fdecay: 0.03, fsustain: 0, attack: 0.002, decay: 0.25, sustain: 0, release: 0.25, noise: 0.1, noiseColor: 'pink' }, { sub: 'pluck', song: 'Africa', artist: 'Toto, 1982', desc: 'Sinus et bruit rose à l’attaque. Approximation : l’original est un son FM.', styles: '80s, pop', fx: { rev: 0.4 } }),
  ],
  pads: [
    synth('softpad', 'Soft Pad (synthé)', { wave: 'sawtooth', voices: 2, detune: 10, cutoff: 900, env: 0.5, q: 1, attack: 0.25, decay: 0.6, sustain: 0.8, release: 0.8 }),
    synth('glasspad', 'Glass Pad (synthé)', { wave: 'triangle', voices: 2, detune: 7, cutoff: 4000, env: 0, q: 0, attack: 0.3, decay: 0.5, sustain: 0.9, release: 1.0 }),
    synth('pwmpad', 'PWM Strings (synthé, PWM lent)', { wave: 'pulse', voices: 3, detune: 9, pw: 0.5, cutoff: 2600, env: 0.4, q: 1, attack: 0.6, decay: 1, sustain: 0.85, release: 1.6, lfo1Dest: 'pw', lfo1Shape: 'triangle', lfo1Rate: 'hz', lfo1Hz: 0.35, lfo1Amt: 0.75 }),
    synth('breathpad', 'Breathing Pad (synthé, ambient, 8 mesures)', { wave: 'pulse', voices: 2, detune: 6, pw: 0.3, cutoff: 700, env: 0, q: 3, attack: 3, decay: 2, sustain: 0.9, release: 6, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b8', lfo1Amt: 0.5, lfo2Dest: 'pw', lfo2Shape: 'smooth', lfo2Rate: 'b2', lfo2Amt: 0.6, lfo2Fade: 2 }),
    synth('drone', 'Drone (synthé, ambient, dérive aléatoire)', { wave: 'sawtooth', voices: 3, detune: 5, ftype: 'sem', cutoff: 500, env: 0, q: 6, attack: 6, decay: 3, sustain: 1, release: 10, lfo1Dest: 'cutoff', lfo1Shape: 'smooth', lfo1Rate: 'b4', lfo1Amt: 0.45, lfo2Dest: 'pan', lfo2Shape: 'sine', lfo2Rate: 'b16', lfo2Amt: 0.5 }),
    synth('superpad', 'Supersaw Pad (synthé)', { wave: 'supersaw', voices: 7, detune: 25, cutoff: 1400, env: 0.8, q: 1, attack: 0.5, decay: 1, sustain: 0.8, release: 1.4, fattack: 1.2, fdecay: 1.5, fsustain: 0.5, frelease: 1.4 }),
    // banque 2026-11 (maquettes/maquette-presets-synthe.html)
    synth('strings80', 'Cordes synthé 80s (synthé)', { wave: 'sawtooth', voices: 3, detune: 12, cutoff: 1800, q: 1, env: 0.3, attack: 0.4, decay: 1, sustain: 0.85, release: 1.5, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b4', lfo1Amt: 0.2 }, { sub: 'pad', desc: 'Trois scies, attaque douce, filtre qui respire sur 4 mesures.', styles: 'synthwave, pop', fx: { cho: 0.5, rev: 0.4 } }),
    synth('warmpad', 'Nappe chaude (synthé)', { wave: 'pulse', pw: 0.4, voices: 2, detune: 8, ftype: 'sem', fdrive: 0.3, cutoff: 900, q: 2, env: 0.2, attack: 0.8, decay: 1, sustain: 0.9, release: 2, lfo1Dest: 'pw', lfo1Shape: 'triangle', lfo1Rate: 'b2', lfo1Amt: 0.6 }, { sub: 'pad', desc: 'Impulsion qui ondule (PWM), filtre SEM rond : enveloppant, sans agressivité.', styles: 'pop, soul', fx: { cho: 0.4, rev: 0.4 } }),
    synth('darkpad', 'Nappe sombre (synthé)', { wave: 'sawtooth', voices: 3, detune: 9, ftype: 'ladder', fdrive: 0.5, cutoff: 350, q: 6, env: 0, attack: 1.5, decay: 1, sustain: 1, release: 3, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b8', lfo1Amt: 0.4 }, { sub: 'pad', desc: 'Ladder fermé qui s’entrouvre sur 8 mesures : tension, menace.', styles: 'film, ambient', fx: { rev: 0.5 } }),
    synth('synchoir', 'Chœur synthé (synthé)', { gain: 2.2, wave: 'sawtooth', voices: 3, detune: 10, filter: 'bandpass', cutoff: 1100, q: 3, env: 0, attack: 0.5, decay: 1, sustain: 0.9, release: 1.5, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 4.5, lfo1Amt: 0.008, lfo1Fade: 0.8 }, { sub: 'pad', desc: 'Filtre passe-bande sur trois scies, léger vibrato : des voix « aah » artificielles.', styles: 'film, synthwave', fx: { cho: 0.4, rev: 0.55 } }),
    synth('sweeppad', 'Nappe qui s’ouvre (synthé)', { wave: 'sawtooth', voices: 4, detune: 15, cutoff: 400, q: 4, env: 3, fattack: 3, fdecay: 4, fsustain: 0.3, frelease: 2, attack: 0.6, decay: 1, sustain: 0.9, release: 2.5 }, { sub: 'pad', desc: 'À chaque accord, le filtre s’ouvre lentement sur trois secondes.', styles: 'synthwave, trance', fx: { cho: 0.3, rev: 0.45 } }),
    synth('airpad', 'Nappe aérienne (synthé)', { wave: 'supersaw', voices: 5, detune: 20, filter: 'highpass', cutoff: 700, q: 1, env: 0, attack: 1.2, decay: 1, sustain: 0.9, release: 3, noise: 0.15, noiseColor: 'pink' }, { sub: 'pad', desc: 'Passe-haut et souffle rose : ne garde que l’air au-dessus du mix.', styles: 'ambient, pop', fx: { cho: 0.3, rev: 0.6 } }),
    synth('blpad', 'Nappe nocturne large (synthé)', { wave: 'sawtooth', voices: 2, detune: 14, cutoff: 1300, q: 1, env: 0.4, fattack: 0.3, fdecay: 1, fsustain: 0.7, attack: 0.25, decay: 1, sustain: 0.9, release: 1.2, gain: 0.8 }, { sub: 'pad', song: 'Blinding Lights', artist: 'The Weeknd, 2019', styles: 'synthwave, synthpop', desc: 'Deux scies bien désaccordées, filtre qui s’ouvre doucement, beaucoup de chorus : le lit d’accords des couplets. Réglée pour rester légère.', fx: { cho: 0.5, rev: 0.5 } }),
    synth('bladerunner', 'Nappe CS large (synthé)', { wave: 'sawtooth', voices: 3, detune: 10, cutoff: 1200, q: 2, env: 1, fattack: 0.6, fdecay: 1.5, fsustain: 0.6, attack: 0.4, decay: 1, sustain: 0.9, release: 2.5, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5, lfo1Amt: 0.01, lfo1Fade: 1 }, { sub: 'pad', song: 'Blade Runner (Main Titles)', artist: 'Vangelis, 1982', desc: 'Trois scies, filtre qui gonfle à chaque accord, vibrato qui arrive tard, grande réverbe.', styles: 'film, ambient', fx: { cho: 0.3, rev: 0.7 } }),
    synth('oxygene', 'Cordes synthé phasées (synthé)', { gain: 0.75, wave: 'pulse', pw: 0.5, voices: 3, detune: 12, cutoff: 2000, q: 2, env: 0, attack: 0.8, decay: 1, sustain: 0.9, release: 2, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 0.2, lfo1Amt: 0.35 }, { sub: 'pad', song: 'Oxygène (Part II)', artist: 'Jean-Michel Jarre, 1976', desc: 'Impulsions désaccordées, cutoff qui ondule lentement comme un phaser.', styles: 'électro, ambient', fx: { cho: 0.5, rev: 0.5 } }),
    synth('realhero', 'Nappe synthwave chaude (synthé)', { wave: 'sawtooth', voices: 3, detune: 12, ftype: 'sem', fdrive: 0.3, cutoff: 1100, q: 2, env: 0.3, attack: 0.3, decay: 1, sustain: 0.9, release: 1.5, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'b2', lfo1Amt: 0.15 }, { sub: 'pad', song: 'A Real Hero', artist: 'College & Electric Youth, 2010', desc: 'SEM rond, trois scies, beaucoup de chorus : la chaleur d’une VHS.', styles: 'synthwave', fx: { cho: 0.5, rev: 0.4 } }),
    synth('weightless', 'Nappe qui respire (synthé)', { wave: 'triangle', voices: 3, detune: 8, cutoff: 1200, q: 1, env: 0, attack: 3, decay: 2, sustain: 1, release: 6, lfo1Dest: 'amp', lfo1Shape: 'sine', lfo1Rate: 'b2', lfo1Amt: 0.3, lfo2Dest: 'cutoff', lfo2Shape: 'sine', lfo2Rate: 'b8', lfo2Amt: 0.4 }, { sub: 'pad', song: 'Weightless', artist: 'Marconi Union, 2011', desc: 'Triangles, attaque de 3 s, volume et filtre qui respirent lentement.', styles: 'ambient', fx: { dly: 0.3, rev: 0.7 } }),
    synth('halcyon', 'Nappe aérienne lumineuse (synthé)', { wave: 'supersaw', voices: 5, detune: 15, filter: 'highpass', cutoff: 400, q: 1, env: 0, attack: 1, decay: 1, sustain: 0.9, release: 3, lfo1Dest: 'pan', lfo1Shape: 'sine', lfo1Rate: 'b4', lfo1Amt: 0.6 }, { sub: 'pad', song: 'Halcyon + On + On', artist: 'Orbital, 1993', desc: 'Supersaw passée dans un passe-haut, qui tourne lentement dans l’espace.', styles: 'électro, ambient', fx: { cho: 0.3, dly: 0.2, rev: 0.6 } }),
  ],
  fx: [
    synth('noiseriser', 'Noise Riser (synthé, bruit blanc)', { osc: 0, noise: 1, noiseColor: 'white', cutoff: 250, env: 5.5, q: 6, attack: 1.2, decay: 0.3, sustain: 1, release: 0.4, fattack: 2, fdecay: 0.5, fsustain: 1, frelease: 0.4 }),
    synth('wind', 'Wind (synthé, bruit rose)', { osc: 0, noise: 1, noiseColor: 'pink', cutoff: 700, env: 1.5, q: 8, attack: 0.8, decay: 1, sustain: 0.7, release: 1.2 }),
    synth('rumble', 'Rumble (synthé, bruit brun)', { osc: 0, noise: 1, noiseColor: 'brown', cutoff: 300, env: 0, q: 2, attack: 0.3, decay: 0.5, sustain: 0.9, release: 0.8 }),
    // banque 2026-11 (maquettes/maquette-presets-synthe.html)
    synth('laser', 'Laser (synthé)', { gain: 1.3, wave: 'sine', cutoff: 20000, q: 0, env: 0, decay: 0.2, sustain: 0.6, release: 0.1, lfo1Dest: 'pitch', lfo1Shape: 'rampdown', lfo1Rate: 'n8', lfo1Mode: 'retrig', lfo1Amt: 0.5 }, { sub: 'fx', desc: 'Sinus qui plonge en un huitième de temps, à chaque note.', styles: 'électro, jeu', fx: { dly: 0.3 } }),
    synth('siren', 'Sirène (synthé)', { wave: 'square', cutoff: 3000, q: 2, env: 0, decay: 0.3, sustain: 1, release: 0.3, lfo1Dest: 'pitch', lfo1Shape: 'triangle', lfo1Rate: 'n2', lfo1Mode: 'retrig', lfo1Amt: 0.3 }, { sub: 'fx', desc: 'Carré qui monte et descend sur une mesure, la sirène des sound systems.', styles: 'dub, électro', fx: { dly: 0.45, rev: 0.3 } }),
    synth('bubbles', 'Bulles (synthé)', { gain: 1.3, wave: 'sine', cutoff: 20000, q: 0, env: 0, attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.3, lfo1Dest: 'pitch', lfo1Shape: 'sh', lfo1Rate: 'n16', lfo1Amt: 0.25, lfo2Dest: 'pan', lfo2Shape: 'sh', lfo2Rate: 'n8', lfo2Amt: 0.7 }, { sub: 'fx', desc: 'Hauteur tirée au hasard en doubles croches : des bulles qui remontent.', styles: 'ambient, jeu', fx: { dly: 0.4, rev: 0.5 } }),
  ],
  keys: [
    synth('synep', 'Piano électrique synthé (synthé)', { gain: 0.6, wave: 'triangle', cutoff: 2500, q: 1, env: 1, fdecay: 0.4, fsustain: 0.2, attack: 0.003, decay: 0.9, sustain: 0.25, release: 0.5, sub: 0.15, lfo1Dest: 'amp', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 4, lfo1Amt: 0.15 }, { sub: 'keys', desc: 'Triangle doux, trémolo léger : un Rhodes imaginaire.', styles: 'soul, lo-fi', fx: { cho: 0.4, rev: 0.3 } }),
    synth('synharpsi', 'Clavecin synthé (synthé)', { gain: 0.5, wave: 'pulse', pw: 0.12, cutoff: 4000, q: 1, env: 1, fdecay: 0.3, fsustain: 0.2, attack: 0.002, decay: 0.6, sustain: 0, release: 0.2 }, { sub: 'keys', desc: 'Impulsion très étroite, note qui s’éteint seule : la pince d’un clavecin.', styles: 'baroque, film', fx: { rev: 0.3 } }),
    synth('synorgan', 'Orgue synthé (synthé)', { gain: 0.45, wave: 'square', cutoff: 3000, q: 0, env: 0, attack: 0.005, decay: 0.1, sustain: 1, release: 0.08, sub: 0.5, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 6, lfo1Amt: 0.006 }, { sub: 'keys', desc: 'Carré et sous-octave tenus, petit vibrato : l’orgue de combo.', styles: 'pop, rock', fx: { cho: 0.3, rev: 0.25 } }),
    synth('synclav', 'Clavinet synthé (synthé)', { gain: 0.8, wave: 'pulse', pw: 0.2, ftype: 'sem', fdrive: 0.6, cutoff: 900, q: 6, env: 2.5, fdecay: 0.12, fsustain: 0.2, attack: 0.002, decay: 0.3, sustain: 0.3, release: 0.06 }, { sub: 'keys', desc: 'Impulsion étroite, filtre SEM nerveux : funky et percussif.', styles: 'funk' }),
    synth('superstition', 'Clavinet funky (synthé)', { wave: 'pulse', pw: 0.15, ftype: 'sem', fdrive: 0.6, cutoff: 1200, q: 5, env: 2, fdecay: 0.08, fsustain: 0.1, attack: 0.002, decay: 0.2, sustain: 0.2, release: 0.03, gain: 1.2 }, { sub: 'keys', song: 'Superstition', artist: 'Stevie Wonder, 1972', desc: 'Impulsion étroite, SEM nerveux, notes coupées : percussif.', styles: 'funk, soul' }),
    synth('riders', 'Piano électrique doux (synthé)', { wave: 'triangle', cutoff: 1800, q: 1, env: 1.2, fdecay: 0.5, fsustain: 0.2, attack: 0.003, decay: 1.2, sustain: 0.2, release: 0.6, lfo1Dest: 'amp', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 3.5, lfo1Amt: 0.25, gain: 0.45 }, { sub: 'keys', song: 'Riders on the Storm', artist: 'The Doors, 1971', desc: 'Triangle tendre, trémolo lent, la pluie en moins.', styles: 'rock, 70s', fx: { cho: 0.3, rev: 0.4 } }),
    synth('lightmyfire', 'Orgue de combo (synthé)', { wave: 'square', sub: 0.3, cutoff: 4000, q: 0, env: 0, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 6.5, lfo1Amt: 0.008, gain: 0.35 }, { sub: 'keys', song: 'Light My Fire', artist: 'The Doors, 1967', desc: 'Carré et sous-octave tenus, vibrato rapide.', styles: 'rock, 60s', fx: { rev: 0.3 } }),
    synth('goldenbrown', 'Clavecin synthé (synthé)', { wave: 'pulse', pw: 0.1, cutoff: 5000, q: 1, env: 0.5, fdecay: 0.3, fsustain: 0.2, attack: 0.002, decay: 0.7, sustain: 0, release: 0.2, gain: 0.45 }, { sub: 'keys', song: 'Golden Brown', artist: 'The Stranglers, 1981', desc: 'Impulsion très étroite, note qui s’éteint seule.', styles: 'new wave, baroque', fx: { rev: 0.3 } }),
    synth('baba', 'Orgue haché en boucle (synthé)', { wave: 'square', cutoff: 2500, q: 1, env: 0, decay: 0.1, sustain: 1, release: 0.05, lfo1Dest: 'amp', lfo1Shape: 'square', lfo1Rate: 'n16', lfo1Amt: 1, gain: 0.55 }, { sub: 'keys', song: 'Baba O’Riley', artist: 'The Who, 1971', desc: 'Accords tenus découpés en doubles croches par un LFO de volume carré.', styles: 'rock, 70s', fx: { rev: 0.25 } }),
  ],
  brass: [
    synth('brass80', 'Cuivres synthé 80s (synthé)', { gain: 0.65, wave: 'sawtooth', voices: 2, detune: 7, cutoff: 500, q: 2, env: 2.5, fattack: 0.08, fdecay: 0.5, fsustain: 0.55, frelease: 0.25, attack: 0.02, decay: 0.4, sustain: 0.85, release: 0.25 }, { sub: 'brass', desc: 'Le filtre monte puis redescend à chaque accord : le « bwaa » des hits 80s.', styles: 'synthwave, pop', fx: { cho: 0.3, rev: 0.3 } }),
    synth('brassstab', 'Stab cuivré (synthé)', { wave: 'supersaw', voices: 5, detune: 12, cutoff: 700, q: 2, env: 3, fattack: 0.03, fdecay: 0.2, fsustain: 0.2, decay: 0.3, sustain: 0.3, release: 0.15 }, { sub: 'brass', desc: 'Court et percutant, pour ponctuer.', styles: 'funk, house', fx: { rev: 0.25 } }),
    synth('softbrass', 'Cuivres doux SEM (synthé)', { gain: 0.75, wave: 'sawtooth', voices: 3, detune: 6, ftype: 'sem', fdrive: 0.4, cutoff: 600, q: 3, env: 2, fattack: 0.25, fdecay: 1, fsustain: 0.6, frelease: 0.6, attack: 0.15, decay: 0.6, sustain: 0.9, release: 0.6 }, { sub: 'brass', desc: 'Filtre SEM, attaque lente : des cors feutrés plutôt que des trompettes.', styles: 'film, soul', fx: { cho: 0.2, rev: 0.45 } }),
    synth('swellbrass', 'Cuivres qui enflent (synthé)', { gain: 0.65, wave: 'sawtooth', voices: 2, detune: 9, ftype: '24db', cutoff: 400, q: 2, env: 2.6, fattack: 1.2, fdecay: 1, fsustain: 0.8, frelease: 0.5, attack: 0.6, decay: 0.6, sustain: 1, release: 0.5 }, { sub: 'brass', desc: 'Crescendo d’une seconde à chaque note : pour les montées.', styles: 'film, synthwave', fx: { cho: 0.3, rev: 0.4 } }),
    synth('syntrumpet', 'Trompette synthé (synthé)', { gain: 0.5, wave: 'pulse', pw: 0.45, cutoff: 900, q: 2, env: 2, fattack: 0.06, fdecay: 0.3, fsustain: 0.6, attack: 0.03, decay: 0.3, sustain: 0.85, release: 0.15, glide: 0.03, glideMode: 'legato', lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5.5, lfo1Amt: 0.012, lfo1Fade: 0.5 }, { sub: 'brass', desc: 'Impulsion presque carrée, attaque cuivrée, vibrato tardif : pour les mélodies.', styles: 'pop, funk', fx: { rev: 0.3 } }),
    synth('blstab', 'Accords cuivrés du refrain (synthé)', { wave: 'sawtooth', voices: 2, detune: 7, cutoff: 1000, q: 1, env: 2, fattack: 0.02, fdecay: 0.35, fsustain: 0.5, attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.25, gain: 0.55 }, { sub: 'brass', song: 'Blinding Lights', artist: 'The Weeknd, 2019', styles: 'synthwave, synthpop', desc: 'Deux scies, attaque franche qui s’adoucit : des accords qui poussent le refrain sans prendre la place du lead.', fx: { cho: 0.3, rev: 0.3 } }),
    synth('jump', 'Accord cuivré OB (synthé)', { wave: 'sawtooth', voices: 3, detune: 9, cutoff: 900, q: 1, env: 2.2, fattack: 0.02, fdecay: 0.4, fsustain: 0.6, attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.3, gain: 0.6 }, { sub: 'brass', song: 'Jump', artist: 'Van Halen, 1984', desc: 'Trois scies désaccordées, attaque franche, chorus : l’accord cuivré le plus célèbre des années 80.', styles: '80s, rock', fx: { cho: 0.4, rev: 0.3 } }),
    synth('countdown', 'Riff de cuivres épique (synthé)', { wave: 'sawtooth', voices: 3, detune: 10, cutoff: 700, q: 1, env: 2.5, fattack: 0.05, fdecay: 0.6, fsustain: 0.7, attack: 0.03, decay: 0.5, sustain: 0.9, release: 0.4, gain: 0.5 }, { sub: 'brass', song: 'The Final Countdown', artist: 'Europe, 1986', desc: 'Filtre qui s’ouvre un peu plus lentement : large et triomphant.', styles: '80s, rock', fx: { cho: 0.3, rev: 0.4 } }),
    synth('1999', 'Stabs cuivrés funky (synthé)', { wave: 'supersaw', voices: 5, detune: 12, cutoff: 800, q: 2, env: 2.5, fattack: 0.02, fdecay: 0.25, fsustain: 0.3, decay: 0.3, sustain: 0.4, release: 0.1, gain: 1 }, { sub: 'brass', song: '1999', artist: 'Prince, 1982', desc: 'Supersaw courte et mordante, pour ponctuer à contretemps.', styles: 'funk, 80s', fx: { rev: 0.2 } }),
    synth('chariotsbrass', 'Cuivres qui enflent (synthé)', { wave: 'sawtooth', voices: 3, detune: 8, cutoff: 500, q: 2, env: 2.6, fattack: 0.8, fdecay: 1, fsustain: 0.7, attack: 0.3, decay: 0.8, sustain: 1, release: 1.5, lfo1Dest: 'pitch', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 5, lfo1Amt: 0.01, lfo1Fade: 1, gain: 0.6 }, { sub: 'brass', song: 'Chariots of Fire', artist: 'Vangelis, 1981', desc: 'Accords lents qui gonflent, vibrato qui arrive après une seconde.', styles: 'film', fx: { cho: 0.2, rev: 0.6 } }),
    synth('dontyouwant', 'Cuivres new wave (synthé)', { wave: 'pulse', pw: 0.3, voices: 2, detune: 5, cutoff: 1200, q: 2, env: 1.5, fattack: 0.03, fdecay: 0.3, fsustain: 0.5, attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.2, gain: 0.45 }, { sub: 'brass', song: 'Don’t You Want Me', artist: 'The Human League, 1981', desc: 'Impulsions étroites, son plus froid et plus fin que les cuivres rock.', styles: 'new wave, synthpop', fx: { cho: 0.2, rev: 0.3 } }),
  ],
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
const VSCO = LIB.vsco || [];
const LIBRE = LIB.libre || [];

/*
 * Programme General MIDI (0–127) d'un fichier soundfont gm_* : le nom commence par programme × 10 + variante
 * (« 0390_FluidR3_GM_sf2_file » -> 39). Les instruments gm_* ont une propriété `midi` = ce programme ;
 * les autres sons (synthés intégrés, VCSL, Dirt-Samples, Juno) n'en ont pas.
 */
const gmProgramOfFile = (file) => {
  const prog = parseInt(String(file || '').slice(0, 3), 10);
  return Number.isFinite(prog) && prog >= 0 && prog < 128 ? prog : null;
};
SS.gmProgramOfFile = gmProgramOfFile;

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
    // orchestre VSCO 2 avant VCSL : de vraies sections d'orchestre (gmProgram : programme GM le plus proche, pour l'export)
    ...VSCO.filter((v) => v.family === f.id).map((v) => ({ id: v.id, label: v.label, kind: 'multi', bank: 'vsco', key: v.key, release: v.release, gmProgram: v.gm })),
    ...LIBRE.filter((v) => v.family === f.id).map((v) => ({ id: v.id, label: v.label, kind: 'multi', bank: 'libre', key: v.key, release: v.release, gmProgram: v.gm })),
    ...LIB.vcsl.filter((v) => v.family === f.id).map((v) => vcsl(v.key, v.label + ' (VCSL)', { release: v.release })),
    ...LIB.gm
      .filter((g) => g.family === f.id)
      .map((g) => ({ id: g.id, label: g.label, kind: 'sf', files: g.files, release: g.release, strudel: g.id, midi: gmProgramOfFile(g.files[0]) })),
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

/**
 * Décalage d'octave d'un instrument multi-échantillonné (js/sample-tuning.js), en demi-tons : positif = ses
 * fichiers sonnent plus haut que la note de leur nom (convention Do3 = midi 60 de la plupart des VCSL). Corrigé à la
 * lecture (js/audio.js) : une note jouée sonne à sa hauteur, comme avec les soundfonts et les synthés.
 */
SS.multiOctave = (inst) => (inst && inst.kind === 'multi' && SS.MULTI_OCTAVE && SS.MULTI_OCTAVE[inst.bank + ':' + inst.key]) || 0;

/**
 * Projets enregistrés avant cette correction (version < 2) : les notes des pistes concernées sont transposées
 * du même décalage, dans toutes les scènes, pour que le morceau sonne exactement comme avant.
 * `data` est le projet brut lu dans le fichier (modifié sur place).
 */
SS.migrateOctaves = (data) => {
  if (!data || !Array.isArray(data.tracks) || Number(data.version) >= 2) return;
  const shift = (events, d) =>
    Array.isArray(events) &&
    events.forEach((e) => e && Array.isArray(e.notes) && (e.notes = e.notes.map((n) => Math.max(0, Math.min(127, n + d)))));
  data.tracks.forEach((t) => {
    if (!t || t.type === 'drum') return;
    const copy = { ...t };
    SS.migrateInstrument(copy);
    const d = SS.multiOctave(SS.findInstrument(copy.family, copy.instrument));
    if (!d) return;
    shift(t.events, d);
    (Array.isArray(data.scenes) ? data.scenes : []).forEach((sc) => sc && sc.data && sc.data[t.id] && shift(sc.data[t.id].events, d));
    if (Number.isFinite(t.octave)) t.octave = Math.max(0, Math.min(7, t.octave + d / 12));
    if (Number.isFinite(t.rollTop)) t.rollTop += d;
    if (Number.isFinite(t.lastRoot)) t.lastRoot += d;
  });
};

/** Fichier soundfont joué par une piste (variante choisie). */
SS.sfFile = (inst, track) => (inst.files ? inst.files[Math.min(track.sfv || 0, inst.files.length - 1)] : inst.file);

/*
 * Les 128 programmes General MIDI (noms de la norme) et leurs 16 groupes de 8.
 * Mode General MIDI d'un projet (project.gm) : la fenêtre de piste et Band ne proposent que ces sons.
 */
SS.GM_PROGRAMS = (
  'Acoustic Grand Piano|Bright Acoustic Piano|Electric Grand Piano|Honky-tonk Piano|Electric Piano 1|Electric Piano 2|Harpsichord|Clavinet|' +
  'Celesta|Glockenspiel|Music Box|Vibraphone|Marimba|Xylophone|Tubular Bells|Dulcimer|' +
  'Drawbar Organ|Percussive Organ|Rock Organ|Church Organ|Reed Organ|Accordion|Harmonica|Tango Accordion|' +
  'Acoustic Guitar (nylon)|Acoustic Guitar (steel)|Electric Guitar (jazz)|Electric Guitar (clean)|Electric Guitar (muted)|Overdriven Guitar|Distortion Guitar|Guitar Harmonics|' +
  'Acoustic Bass|Electric Bass (finger)|Electric Bass (pick)|Fretless Bass|Slap Bass 1|Slap Bass 2|Synth Bass 1|Synth Bass 2|' +
  'Violin|Viola|Cello|Contrabass|Tremolo Strings|Pizzicato Strings|Orchestral Harp|Timpani|' +
  'String Ensemble 1|String Ensemble 2|Synth Strings 1|Synth Strings 2|Choir Aahs|Voice Oohs|Synth Voice|Orchestra Hit|' +
  'Trumpet|Trombone|Tuba|Muted Trumpet|French Horn|Brass Section|Synth Brass 1|Synth Brass 2|' +
  'Soprano Sax|Alto Sax|Tenor Sax|Baritone Sax|Oboe|English Horn|Bassoon|Clarinet|' +
  'Piccolo|Flute|Recorder|Pan Flute|Blown Bottle|Shakuhachi|Whistle|Ocarina|' +
  'Lead 1 (square)|Lead 2 (sawtooth)|Lead 3 (calliope)|Lead 4 (chiff)|Lead 5 (charang)|Lead 6 (voice)|Lead 7 (fifths)|Lead 8 (bass + lead)|' +
  'Pad 1 (new age)|Pad 2 (warm)|Pad 3 (polysynth)|Pad 4 (choir)|Pad 5 (bowed)|Pad 6 (metallic)|Pad 7 (halo)|Pad 8 (sweep)|' +
  'FX 1 (rain)|FX 2 (soundtrack)|FX 3 (crystal)|FX 4 (atmosphere)|FX 5 (brightness)|FX 6 (goblins)|FX 7 (echoes)|FX 8 (sci-fi)|' +
  'Sitar|Banjo|Shamisen|Koto|Kalimba|Bagpipe|Fiddle|Shanai|' +
  'Tinkle Bell|Agogo|Steel Drums|Woodblock|Taiko Drum|Melodic Tom|Synth Drum|Reverse Cymbal|' +
  'Guitar Fret Noise|Breath Noise|Seashore|Bird Tweet|Telephone Ring|Helicopter|Applause|Gunshot'
).split('|');
SS.GM_GROUPS = [
  'Pianos', 'Percussions chromatiques', 'Orgues', 'Guitares', 'Basses', 'Cordes', 'Ensembles', 'Cuivres',
  'Anches', 'Flûtes', 'Synth Lead', 'Synth Pad', 'Synth FX', 'Ethniques', 'Percussifs', 'Effets sonores',
].map((label, i) => ({ id: i, label, from: i * 8 }));

/**
 * Son StepSeq qui joue un programme GM : { family, instrument, sfv }.
 * Le soundfont gm_* du programme ; pour 1 à 3 (Bright, Electric Grand, Honky-tonk), la variante de gm_piano
 * qui le joue (FluidR3 de préférence).
 */
SS.gmInstrumentFor = (prog) => {
  prog = Math.max(0, Math.min(127, prog | 0));
  let best = null;
  for (const f of SS.FAMILIES) {
    for (const i of f.instruments) {
      if (i.midi == null || !i.files) continue;
      const idx = i.files.map((file, k) => ({ file, k })).filter((x) => gmProgramOfFile(x.file) === prog);
      if (!idx.length) continue;
      const sfv = i.midi === prog ? 0 : (idx.find((x) => /FluidR3/.test(x.file)) || idx[0]).k;
      if (!best || (i.midi === prog && best.inst.midi !== prog)) best = { family: f.id, instrument: i.id, sfv, inst: i };
    }
  }
  return best ? { family: best.family, instrument: best.instrument, sfv: best.sfv } : null;
};

/**
 * Identité General MIDI d'une piste, ou null si son son n'est pas General MIDI :
 *  - Instrument gm_* : { program } (0–127), d'après la variante jouée (gm_piano regroupe les programmes 0 à 3) ;
 *  - Drum de la bibliothèque General MIDI : { note } (35–81).
 */
SS.trackMidi = (track) => {
  if (!track) return null;
  if (track.type === 'drum') return track.source === 'gm' && SS.findGmDrum(track.bank) ? { note: +track.bank } : null;
  if (track.family === 'analog') return null;
  const inst = SS.findInstrument(track.family, track.instrument);
  if (!inst || inst.midi == null) return null;
  const prog = gmProgramOfFile(SS.sfFile(inst, track));
  return { program: prog ?? inst.midi };
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
  // accords sans tierce ou à quarte ajoutée (pédales, synthwave, musique de film)
  { id: '7no3', label: '7(no3)', iv: [0, 7, 10], ext: true },
  { id: '5add9', label: '5(add9)', iv: [0, 7, 14], ext: true },
  { id: 'add4', label: 'add4', iv: [0, 4, 5, 7], ext: true },
  { id: 'madd4', label: 'm(add4)', iv: [0, 3, 5, 7], ext: true },
  // couleurs relevées dans les grilles de référence (docs/reference : Piano Diary, guide MusicEmotion)
  { id: 'mmaj7', label: 'm(maj7)', iv: [0, 3, 7, 11], ext: true },
  { id: 'madd11', label: 'm(add11)', iv: [0, 3, 7, 17], ext: true },
  { id: 'maj7s11', label: 'maj7(♯11)', iv: [0, 4, 7, 11, 18], ext: true },
  { id: '6sus2', label: '6sus2', iv: [0, 2, 7, 9], ext: true },
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
  { id: 'pulse', label: 'Pulse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'supersaw', label: 'Supersaw' },
];
/* Générateur de bruit : une source à part, mélangée à l'oscillateur (comme le mixeur d'un Minimoog ou d'un Juno) */
SS.NOISE_COLORS = [
  { id: 'white', label: 'Blanc', hint: 'Toutes les fréquences à égalité : souffle brillant, charleston, caisse claire' },
  { id: 'pink', label: 'Rose', hint: 'Moins d’aigus : vent, vagues, souffle doux' },
  { id: 'brown', label: 'Brun', hint: 'Surtout des graves : grondement, tonnerre' },
];
SS.NOISES = SS.NOISE_COLORS.map((c) => c.id);
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
  const base = { filter: 'lowpass', ftype: '12db', fdrive: 0.5, glide: 0, glideMode: 'always', pan: 0, drive: 0, gain: 1, voices: 1, detune: 0, accent: 0.6, sub: 0, subOct: 1, osc: 1, noise: 0, noiseColor: 'white' };
  if (inst.kind === 'synth') {
    const p = inst.params;
    return {
      ...base,
      filter: p.filter || base.filter,
      drive: p.drive ?? base.drive,
      gain: p.gain ?? base.gain,
      pan: p.pan ?? base.pan,
      ftype: p.ftype || base.ftype,
      fdrive: p.fdrive ?? base.fdrive,
      glide: p.glide ?? 0,
      glideMode: p.glideMode || base.glideMode,
      wave: p.wave || 'sawtooth',
      voices: p.voices || (p.wave === 'supersaw' ? 5 : 1),
      detune: p.detune || 0,
      sub: p.sub ?? 0, // sous-oscillateur : carré une ou deux octaves plus bas
      subOct: p.subOct ?? 1,
      osc: p.osc ?? 1, // mixeur : niveau de l'oscillateur
      noise: p.noise ?? 0, // et du générateur de bruit
      noiseColor: p.noiseColor || 'white',
      accent: p.accent ?? base.accent,
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
      ...(SS.modDefaults ? SS.modDefaults(p) : {}),
    };
  }
  const rel = inst.release ?? 0.15;
  return {
    ...base, wave: null, cutoff: 20000, q: 0, env: 0, attack: 0.005, decay: 0.3, sustain: 1, release: rel,
    fattack: 0.005, fdecay: 0.3, fsustain: 0.3, frelease: rel,
    ...(SS.modDefaults ? SS.modDefaults() : {}),
  };
};

/** Réglages effectifs : preset + modifications de l'utilisateur (track.sd). */
SS.soundParams = (track) => {
  const d = SS.soundDefaults(track);
  const p = { ...d, ...SS.noiseSd(track.sd) };
  if (d.wave === null) p.wave = null; // un échantillon n'a pas de VCO
  return p;
};

/** Ancienne onde « bruit » (white / pink / brown) : oscillateur coupé, bruit à fond de cette couleur. */
SS.noiseSd = (sd) => {
  if (!sd || !SS.NOISES.includes(sd.wave)) return sd || {};
  const { wave, ...rest } = sd;
  return { ...rest, osc: sd.osc ?? 0, noise: sd.noise ?? 1, noiseColor: wave };
};

/**
 * Version 3 : le bruit n'est plus une forme d'onde mais une source mélangée à l'oscillateur (bloc Bruit du VCO).
 * Une onde de bruit choisie devient « oscillateur 0, bruit 100 % » ; une onde normale choisie sur un preset
 * de bruit (Wind, Rumble, Noise Riser) redevient l'oscillateur seul, comme avant.
 */
SS.migrateNoise = (data) => {
  if (!data || !Array.isArray(data.tracks) || Number(data.version) >= 3) return;
  data.tracks.forEach((t) => {
    if (!t || t.type === 'drum' || !t.sd || typeof t.sd !== 'object') return;
    if (SS.NOISES.includes(t.sd.wave)) {
      t.sd = SS.noiseSd(t.sd);
      return;
    }
    if (!t.sd.wave) return;
    const copy = { ...t };
    if (SS.migrateInstrument) SS.migrateInstrument(copy);
    const inst = SS.findInstrument(copy.family, copy.instrument);
    if (inst && inst.kind === 'synth' && inst.params.osc === 0) t.sd = { ...t.sd, osc: 1, noise: 0 };
  });
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
  sendPlate: 0, sendHall: 0, sendEcho: 0, sendSpace: 0, // envois vers les bus partagés (SS.RETURN_DEFAULTS), 0..1
  gated: 0, // pistes Drum : reverb « gated » des années 80, calculée une fois dans l'échantillon (js/audio.js), 0..1
};
/**
 * Effets suggérés par un preset du synthé intégré (meta fx : cho / dly / rev), en réglages de piste (track.fx) :
 * chorus, écho à la croche pointée, envoi vers la reverb Hall partagée. null si le preset n'en suggère pas.
 */
SS.presetFx = (family, instrument) => {
  const f = (SS.findInstrument(family, instrument) || {}).fx;
  if (!f) return null;
  const o = {};
  if (f.cho) Object.assign(o, { chorus: f.cho, chorusRate: 0.6, chorusDepth: 0.5 });
  if (f.dly) Object.assign(o, { delay: f.dly, delayTime: '3/16', delayFeedback: 0.38 });
  if (f.rev) o.sendHall = f.rev;
  return Object.keys(o).length ? o : null;
};
SS.fxParams = (track) => ({ ...SS.FX_DEFAULTS, ...(track.fx || {}) });
SS.fxActive = (track) => {
  const f = SS.fxParams(track);
  return f.chorus > 0 || f.delay > 0 || f.room > 0 || f.sendPlate > 0 || f.sendHall > 0 || f.sendEcho > 0 || f.sendSpace > 0 || f.gated > 0 || (!!f.scSource && f.scDepth > 0);
};
SS.delaySeconds = (fx, tempo) => {
  const d = SS.DELAY_TIMES.find((x) => x.id === fx.delayTime) || SS.DELAY_TIMES[3];
  return Math.min(2.9, (60 / tempo) * d.beats);
};
