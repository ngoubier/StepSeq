/*
 * Modèle de projet + enregistrement / ouverture de fichiers.
 *
 * Format de fichier (.stepseq.json) :
 * {
 *   format: "stepseq", version: 1,
 *   title, tempo, timeSig: [num, den], bars,
 *   groove: { res: 0|16|8, swing: 0.5..0.75, human: 0..1 },
 *   key: { tonic: "D", mode: "major"|"minor"|"harmonic"|"dorian"|"phrygian"|"lydian"|"mixolydian" },   // tonalité ou mode (facultatif, js/harmony.js)
 *   emotion: "nostalgie",   // intention émotionnelle choisie dans la fenêtre Harmonie (facultatif, js/emotions.js)
 *   master: { volume, mix },   // console : tranche Master (voir SS.MASTER_DEFAULTS)
 *   tracks: [   // chaque piste peut avoir mix: { pan, eq, comp, lim } (console de mixage), length (longueur de sa boucle, en pas ; absente = celle du projet)
 *               // et fx: { chorus, chorusRate, chorusDepth, delay, delayTime,
 *               //   delayFeedback, room, roomSize, roomLp } (effets, voir SS.FX_DEFAULTS)
 *     { id, type: "drum", name, color, volume, mute, solo,
 *       source: "tdm"|"dirt"|"vcsl"|"mrid",                // bibliothèque
 *       sound: "bd", machine: "RolandTR808",              // si source = tdm
 *       bank: "jazz",                                     // sinon : banque de la bibliothèque
 *       variant: 0,
 *       steps: [0..1, ...] }                         // vélocité, 0 = éteint
 *     { id, type: "instrument", name, color, volume, mute, solo,
 *       category: "mono"|"arp"|"chord", family, instrument, sfv (variante soundfont ou échantillon Dirt-Samples),
 *       chord: "min", arp: { mode, rate, octaves }, octave,
 *       sd: { wave, voices, detune, filter, ftype, fdrive, cutoff, q, env,  // sound design (optionnel,
 *             attack, decay, sustain, release, glide, glideMode,       //  sinon preset de l'instrument)
 *             pan, drive, gain }
 *       events: [{ step, len, notes: [midi...], vel }] }
 *     piste « Synthé » : comme une piste instrument, avec family: "analog", instrument: "juno106",
 *       junoPatch: "A11" (patch chargé), juno: { lfoRate, dcoLfo, pwm, …, chorus } (réglages du panneau)
 *   ]
 * }
 */
window.SS = window.SS || {};

SS.FILE_EXT = '.stepseq.json';

SS.stepsPerBar = (p) => Math.round(p.timeSig[0] * (16 / p.timeSig[1]));
SS.stepsPerBeat = (p) => Math.max(1, Math.round(16 / p.timeSig[1]));
SS.totalSteps = (p) => SS.stepsPerBar(p) * p.bars;

SS.uid = () => Math.random().toString(36).slice(2, 10);

SS.newProject = () => SS.withScenes({
  format: 'stepseq',
  version: 1,
  title: 'Nouveau projet',
  tempo: 120,
  timeSig: [4, 4],
  bars: 1,
  groove: { res: 0, swing: 0.5, human: 0 }, // res : 0 = droit, 16 = swing des doubles-croches, 8 = des croches
  tracks: [],
});
SS.withScenes = (p) => {
  SS.normalizeScenes(p);
  return p;
};

SS.newTrack = (opts, project) => {
  const n = SS.totalSteps(project);
  const base = {
    id: SS.uid(),
    name: opts.name,
    color: opts.color,
    volume: 0.8,
    mute: false,
    solo: false,
    type: opts.type,
  };
  if (opts.length > 0) base.length = opts.length; // longueur propre de la piste (en pas), sinon celle du projet
  if (opts.type === 'drum') {
    return {
      ...base,
      source: opts.source || 'tdm',
      sound: opts.sound,
      machine: opts.machine,
      bank: opts.bank,
      variant: opts.variant || 0,
      steps: new Array(n).fill(0),
    };
  }
  if (opts.type === 'synth') {
    // piste Synthé : une piste instrument jouée par un synthé analogique émulé (js/juno.js)
    base.type = 'instrument';
    opts = { ...opts, family: 'analog', instrument: opts.analog || 'juno106' };
  }
  const fam = SS.findFamily(opts.family);
  const extra = opts.family === 'analog' ? { junoPatch: opts.patch || SS.JUNO_PATCHES[0].id } : {};
  return {
    ...base,
    ...extra,
    category: opts.category,
    family: opts.family,
    instrument: opts.instrument,
    sfv: opts.sfv || 0, // variante de soundfont (gm_*)
    chord: 'min',
    arp: { mode: 'up', rate: 2, octaves: 1 },
    octave: opts.category === 'mono' ? fam.octave : Math.max(3, fam.octave),
    events: [],
  };
};

/** Ajuste la longueur des pistes après un changement de mesure / nombre de mesures. */
SS.resizeProject = (p) => {
  const n = SS.totalSteps(p);
  p.tracks.forEach((t) => {
    if (t.type === 'drum') {
      if (t.steps.length < n) t.steps = t.steps.concat(new Array(n - t.steps.length).fill(0));
      else t.steps.length = n;
    } else {
      t.events = t.events.filter((e) => e.step < n);
      t.events.forEach((e) => (e.len = Math.min(e.len, n - e.step)));
    }
  });
};

/** Valide / normalise un projet chargé depuis un fichier. */
SS.normalizeProject = (data) => {
  if (!data || typeof data !== 'object' || !Array.isArray(data.tracks)) throw new Error('Fichier de projet invalide');
  const p = SS.newProject();
  p.title = String(data.title || p.title);
  p.tempo = Math.min(300, Math.max(20, Number(data.tempo) || 120));
  if (Array.isArray(data.timeSig) && data.timeSig.length === 2) p.timeSig = data.timeSig.map(Number);
  p.bars = Math.min(64, Math.max(1, Math.round(Number(data.bars)) || 1));
  if (data.groove && typeof data.groove === 'object') {
    const g = data.groove;
    p.groove = {
      res: [0, 8, 16].includes(Number(g.res)) ? Number(g.res) : 0,
      swing: Math.min(0.75, Math.max(0.5, Number(g.swing) || 0.5)),
      human: Math.min(1, Math.max(0, Number(g.human) || 0)),
    };
  }
  if (data.key && SS.harmony && SS.harmony.valid(data.key)) p.key = { tonic: data.key.tonic, mode: data.key.mode };
  if (typeof data.emotion === 'string' && SS.findEmotion && SS.findEmotion(data.emotion)) p.emotion = data.emotion;
  p.tracks = data.tracks.map((t) => {
    const track = { ...t, id: t.id || SS.uid() };
    // effets : on ne garde que les clés connues, de type attendu
    if (t.fx && typeof t.fx === 'object') {
      track.fx = {};
      for (const [k, def] of Object.entries(SS.FX_DEFAULTS)) {
        const v = t.fx[k];
        if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v)) track.fx[k] = v;
        if (k === 'delayTime' && SS.DELAY_TIMES.some((d) => d.id === v)) track.fx[k] = v;
        if (k === 'scSource' && typeof v === 'string' && v.length < 40) track.fx[k] = v;
      }
    } else delete track.fx;
    track.volume = typeof t.volume === 'number' ? t.volume : 0.8;
    if (Number.isInteger(t.length) && t.length > 0) track.length = Math.min(t.length, 64 * 32);
    else delete track.length;
    if (t.mix && typeof t.mix === 'object') track.mix = SS.cleanMix(t.mix);
    else delete track.mix;
    if (!(t.mixProfile && typeof t.mixProfile === 'object' && typeof t.mixProfile.name === 'string')) delete track.mixProfile;
    track.mute = !!t.mute;
    track.solo = !!t.solo;
    if (t.type === 'drum') {
      track.steps = Array.isArray(t.steps) ? t.steps.map(Number) : [];
      if (!SS.DRUM_LIBS.some((l) => l.id === t.source)) track.source = 'tdm';
    } else {
      SS.migrateInstrument(track);
      track.family = SS.locateInstrument(track.family, track.instrument).family.id;
      track.sfv = Number.isInteger(t.sfv) && t.sfv >= 0 ? t.sfv : track.sfv || 0;
      track.type = 'instrument';
      track.events = Array.isArray(t.events) ? t.events : [];
      track.arp = { mode: 'up', rate: 2, octaves: 1, ...(t.arp || {}) };
      track.chord = t.chord || 'min';
      if (t.sd && typeof t.sd === 'object') {
        track.sd = {};
        for (const [k, v] of Object.entries(t.sd)) {
          if (typeof v === 'number' && Number.isFinite(v)) track.sd[k] = v;
          else if (typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v)) track.sd[k] = v;
        }
      } else delete track.sd;
      track.octave = Number.isFinite(t.octave) ? t.octave : 4;
      if (track.family === 'analog') {
        if (!SS.findJunoPatch(t.junoPatch)) track.junoPatch = SS.JUNO_PATCHES[0].id;
        const j = SS.cleanJuno(t.juno);
        if (Object.keys(j).length) track.juno = j;
        else delete track.juno;
      } else {
        delete track.juno;
        delete track.junoPatch;
      }
    }
    return track;
  });
  SS.resizeProject(p);
  SS.normalizeScenes(p, data);
  // profil appliqué au Master (affiché dans la console)
  if (data.masterProfile && typeof data.masterProfile === 'object' && typeof data.masterProfile.name === 'string') p.masterProfile = data.masterProfile;
  if (data.master && typeof data.master === 'object') {
    p.master = {
      volume: Number.isFinite(data.master.volume) ? Math.min(2, Math.max(0, data.master.volume)) : SS.MASTER_DEFAULTS.volume,
      mix: SS.cleanMix(data.master.mix, SS.MASTER_DEFAULTS.mix),
    };
  }
  return p;
};

SS.serialize = (p) => {
  SS.commitScene(p); // les notes en cours d'édition sont rangées dans leur scène avant l'enregistrement
  return JSON.stringify(p, null, 1);
};

SS.fileName = (p) => (p.title || 'projet').replace(/[\\/:*?"<>|]+/g, '_').trim() + SS.FILE_EXT;

/* ---------- Fichiers ---------- */
SS.files = (() => {
  let handle = null; // FileSystemFileHandle (Chrome / Edge) pour "Enregistrer" sans redemander
  const types = [{ description: 'Projet StepSeq', accept: { 'application/json': ['.json'] } }];

  async function save(project, saveAs) {
    const text = SS.serialize(project);
    if (window.showSaveFilePicker) {
      try {
        if (!handle || saveAs) handle = await window.showSaveFilePicker({ suggestedName: SS.fileName(project), types });
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        return handle.name;
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn('File System Access indisponible, téléchargement classique', e);
      }
    }
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = SS.fileName(project);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return a.download;
  }

  async function open() {
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types });
        const file = await h.getFile();
        const project = SS.normalizeProject(JSON.parse(await file.text()));
        handle = h;
        return project;
      } catch (e) {
        if (e.name === 'AbortError') return null;
        if (e instanceof SyntaxError || e.message.includes('invalide')) throw e;
      }
    }
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        try {
          handle = null;
          resolve(SS.normalizeProject(JSON.parse(await file.text())));
        } catch (e) {
          reject(e);
        }
      };
      input.click();
    });
  }

  return { save, open, reset: () => (handle = null) };
})();

/**
 * Groove : décalage (en secondes) d'un pas.
 * Le swing retarde la 2e double-croche (res 16) ou la 2e croche (res 8) de chaque paire.
 * swing = 0.5 : droit ; 0.667 : ternaire (shuffle) ; 0.75 : maximum.
 */
SS.grooveOffset = (p, step, stepDur) => {
  const g = p.groove;
  if (!g || !g.res || g.swing <= 0.5) return 0;
  const group = g.res === 8 ? 4 : 2; // pas par paire swinguée
  const pos = step % group;
  const u = pos / group;
  const swung = u < 0.5 ? u * 2 * g.swing : g.swing + (u - 0.5) * 2 * (1 - g.swing);
  return (swung - u) * group * stepDur;
};

/**
 * Après une augmentation du nombre de mesures : recopie le motif existant
 * (les `oldBars` premières mesures) en boucle dans les nouvelles mesures.
 */
SS.repeatBars = (p, oldBars) => {
  const spb = SS.stepsPerBar(p);
  const oldLen = spb * oldBars;
  const total = SS.totalSteps(p);
  if (oldLen <= 0 || total <= oldLen) return;
  p.tracks.forEach((t) => {
    if (t.type === 'drum') {
      for (let s = oldLen; s < total; s++) t.steps[s] = t.steps[s % oldLen] || 0;
    } else {
      const src = t.events.filter((e) => e.step < oldLen);
      const copies = [];
      for (let off = oldLen; off < total; off += oldLen) {
        src.forEach((e) => {
          if (e.step + off >= total) return;
          copies.push({ ...e, notes: [...e.notes], step: e.step + off, len: Math.min(e.len, total - (e.step + off)) });
        });
      }
      t.events = src.concat(copies).sort((a, b) => a.step - b.step);
    }
  });
};

/** Vide tout ce qui se trouve après les `keepBars` premières mesures. */
SS.clearAfterBars = (p, keepBars) => {
  const from = SS.stepsPerBar(p) * keepBars;
  p.tracks.forEach((t) => {
    if (t.type === 'drum') for (let s = from; s < t.steps.length; s++) t.steps[s] = 0;
    else t.events = t.events.filter((e) => e.step < from);
  });
};

/** Longueur (en pas) de la boucle d'une piste : la sienne si elle est définie, sinon celle du projet. */
SS.trackLen = (p, t) => {
  const total = SS.totalSteps(p);
  return t && t.length > 0 ? Math.min(t.length, total) : total;
};

/* ================================================================== */
/* Mode chanson : scènes + arrangement                                 */
/* ================================================================== *
 *
 * project.scenes  : [{ id, name, bars, data: { trackId: { steps } | { events } } }]
 * project.current : id de la scène en cours d'édition (son contenu vit dans les pistes)
 * project.song    : [{ scene: id, repeat: n }]  -- l'arrangement, joué dans l'ordre
 * project.playMode: 'loop' (boucle la scène en cours) | 'song' (joue l'arrangement)
 * project.songLoop: true pour reboucler la chanson à la fin
 *
 * Les réglages des pistes (son, volume, effets, sound design, longueur) sont communs
 * à toutes les scènes ; seules les notes / pas et le nombre de mesures changent.
 */

const SCENE_NAMES = ['Couplet', 'Refrain', 'Intro', 'Pont', 'Outro'];

/** Copie profonde du contenu musical des pistes (pas + notes). */
SS.snapshotTracks = (p) => {
  const data = {};
  p.tracks.forEach((t) => {
    data[t.id] = t.type === 'drum' ? { steps: [...t.steps] } : { events: t.events.map((e) => ({ ...e, notes: [...e.notes] })) };
  });
  return data;
};

SS.currentScene = (p) => p.scenes.find((sc) => sc.id === p.current) || p.scenes[0];

/** Range le contenu actuel des pistes dans la scène en cours. */
SS.commitScene = (p) => {
  if (!p.scenes || !p.scenes.length) return;
  const sc = SS.currentScene(p);
  sc.bars = p.bars;
  sc.data = SS.snapshotTracks(p);
};

/** Passe à une autre scène : son contenu remplace celui des pistes. */
SS.loadScene = (p, id, { commit = true } = {}) => {
  const target = p.scenes.find((sc) => sc.id === id);
  if (!target) return;
  if (commit) SS.commitScene(p);
  p.current = target.id;
  p.bars = target.bars || p.bars;
  const n = SS.stepsPerBar(p) * p.bars;
  p.tracks.forEach((t) => {
    const d = (target.data || {})[t.id];
    if (t.type === 'drum') t.steps = d && d.steps ? [...d.steps] : new Array(n).fill(0);
    else t.events = d && d.events ? d.events.map((e) => ({ ...e, notes: [...e.notes] })) : [];
  });
  SS.resizeProject(p);
};

/** Nouvelle scène, vide ou copie de la scène en cours ; retourne son id. */
SS.addScene = (p, { copy = true } = {}) => {
  SS.commitScene(p);
  const used = new Set(p.scenes.map((sc) => sc.name));
  let name = SCENE_NAMES.find((n) => !used.has(n));
  for (let i = p.scenes.length + 1; !name; i++) if (!used.has('Scène ' + i)) name = 'Scène ' + i;
  const sc = {
    id: SS.uid(),
    name,
    bars: p.bars,
    data: copy ? SS.snapshotTracks(p) : {},
  };
  const idx = p.scenes.findIndex((x) => x.id === p.current);
  p.scenes.splice(idx + 1, 0, sc);
  return sc.id;
};

SS.deleteScene = (p, id) => {
  if (p.scenes.length < 2) return false;
  const idx = p.scenes.findIndex((sc) => sc.id === id);
  if (idx < 0) return false;
  const wasCurrent = p.current === id;
  if (!wasCurrent) SS.commitScene(p);
  p.scenes.splice(idx, 1);
  p.song = p.song.filter((b) => b.scene !== id);
  if (!p.song.length) p.song = [{ scene: p.scenes[0].id, repeat: 1 }];
  if (wasCurrent) SS.loadScene(p, p.scenes[Math.max(0, idx - 1)].id, { commit: false });
  return true;
};

/** Durée de l'arrangement : { bars, seconds } */
SS.songLength = (p) => {
  const spb = SS.stepsPerBar(p);
  let bars = 0;
  p.song.forEach((b) => {
    const sc = p.scenes.find((x) => x.id === b.scene);
    if (sc) bars += (sc.id === p.current ? p.bars : sc.bars) * b.repeat;
  });
  return { bars, seconds: (bars * spb * 60) / p.tempo / 4 };
};

/** Crée / valide scènes et arrangement (projets anciens : une seule scène « A »). */
SS.normalizeScenes = (p, data = {}) => {
  const valid = Array.isArray(data.scenes) && data.scenes.length;
  if (valid) {
    p.scenes = data.scenes
      .filter((sc) => sc && typeof sc === 'object')
      .map((sc) => ({
        id: String(sc.id || SS.uid()),
        name: String(sc.name || 'Scène').slice(0, 40),
        bars: Math.min(64, Math.max(1, Math.round(Number(sc.bars)) || p.bars)),
        data: sc.data && typeof sc.data === 'object' ? sc.data : {},
      }));
  }
  if (!valid) {
    p.scenes = [{ id: SS.uid(), name: 'Couplet', bars: p.bars, data: SS.snapshotTracks(p) }];
    p.current = p.scenes[0].id;
  } else {
    p.current = p.scenes.some((sc) => sc.id === data.current) ? data.current : p.scenes[0].id;
    // les pistes contiennent déjà la scène en cours (enregistrée telle quelle)
    const cur = SS.currentScene(p);
    cur.bars = p.bars;
    cur.data = SS.snapshotTracks(p);
  }
  const ids = new Set(p.scenes.map((sc) => sc.id));
  p.song = Array.isArray(data.song)
    ? data.song
        .filter((b) => b && ids.has(b.scene))
        .map((b) => ({ scene: b.scene, repeat: Math.min(64, Math.max(1, Math.round(Number(b.repeat) || 1))) }))
    : [];
  if (!p.song.length) p.song = [{ scene: p.current, repeat: 1 }];
  p.playMode = data.playMode === 'song' ? 'song' : 'loop';
  p.songLoop = !!data.songLoop;
};

/* ================================================================== */
/* Console de mixage : EQ, compresseur, limiteur, panoramique          */
/* ================================================================== */

SS.MIX_DEFAULTS = {
  pan: 0,
  eq: {
    on: false,
    hp: { on: false, f: 40 }, // passe-haut 12 dB/oct
    low: { f: 100, g: 0 }, // shelf grave
    lm: { f: 400, g: 0, q: 1 }, // cloche bas-médium
    hm: { f: 2500, g: 0, q: 1 }, // cloche haut-médium
    high: { f: 8000, g: 0 }, // shelf aigu
  },
  comp: { on: false, th: -18, ratio: 3, att: 0.01, rel: 0.15, knee: 6, makeup: 0 },
  lim: { on: false, ceil: -1, rel: 0.1 },
};
// le Master démarre avec le compresseur « glue » qu'utilisait déjà l'application, plus un limiteur de sécurité
SS.MASTER_DEFAULTS = {
  volume: 0.8,
  mix: {
    ...SS.MIX_DEFAULTS,
    comp: { on: true, th: -10, ratio: 4, att: 0.003, rel: 0.25, knee: 30, makeup: 0 },
    lim: { on: true, ceil: -0.3, rel: 0.08 },
    // filtre VCF du Master (entre l'EQ et le compresseur) : passe-haut + passe-bas résonants, ouverts par défaut
    vcf: { on: false, slope: 12, hp: { f: 20, res: 0 }, lp: { f: 20000, res: 0 } }, // res : pic de résonance en dB,
  },
};

const deepMerge = (base, over) => {
  if (!over || typeof over !== 'object') return JSON.parse(JSON.stringify(base));
  const out = Array.isArray(base) ? [] : {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const o = over[k];
    if (b && typeof b === 'object') out[k] = deepMerge(b, o);
    else out[k] = typeof o === typeof b ? o : b;
  }
  return out;
};

/** Réglages de mixage effectifs d'une piste (valeurs par défaut + ce qui a été changé). */
SS.mixParams = (track) => deepMerge(SS.MIX_DEFAULTS, track && track.mix);
SS.masterParams = (p) => deepMerge(SS.MASTER_DEFAULTS, p && p.master);

/** Nettoie un bloc de mixage lu dans un fichier (nombres finis, bornes raisonnables). */
SS.cleanMix = (mix, defaults = SS.MIX_DEFAULTS) => {
  const m = deepMerge(defaults, mix);
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  m.pan = num(m.pan, -1, 1, 0);
  const e = m.eq;
  e.on = !!e.on;
  e.hp.on = !!e.hp.on;
  e.hp.f = num(e.hp.f, 20, 2000, 40);
  for (const b of ['low', 'lm', 'hm', 'high']) {
    e[b].f = num(e[b].f, 20, 20000, defaults.eq[b].f);
    e[b].g = num(e[b].g, -18, 18, 0);
    if ('q' in e[b]) e[b].q = num(e[b].q, 0.2, 12, 1);
  }
  if (m.vcf) {
    const v = m.vcf;
    v.on = !!v.on;
    v.slope = v.slope === 24 ? 24 : 12;
    v.hp.f = num(v.hp.f, 20, 20000, 20);
    v.lp.f = num(v.lp.f, 20, 20000, 20000);
    v.hp.res = num(v.hp.res, 0, 18, 0);
    v.lp.res = num(v.lp.res, 0, 18, 0);
  }
  const c = m.comp;
  c.on = !!c.on;
  c.th = num(c.th, -60, 0, -18);
  c.ratio = num(c.ratio, 1, 20, 3);
  c.att = num(c.att, 0.0005, 1, 0.01);
  c.rel = num(c.rel, 0.01, 1, 0.15);
  c.knee = num(c.knee, 0, 40, 6);
  c.makeup = num(c.makeup, -12, 24, 0);
  const l = m.lim;
  l.on = !!l.on;
  l.ceil = num(l.ceil, -24, 0, -1);
  l.rel = num(l.rel, 0.01, 1, 0.1);
  return m;
};

SS.dbToGain = (db) => Math.pow(10, db / 20);
SS.gainToDb = (g) => (g <= 0.00001 ? -Infinity : 20 * Math.log10(g));
