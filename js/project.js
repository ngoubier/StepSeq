/*
 * Modèle de projet + enregistrement / ouverture de fichiers.
 *
 * Format de fichier (.stepseq.json) :
 * {
 *   format: "stepseq", version: 1,
 *   title, tempo, timeSig: [num, den], bars,
 *   groove: { res: 0|16|8, swing: 0.5..0.75, human: 0..1 },
 *   tracks: [   // chaque piste peut avoir fx: { chorus, chorusRate, chorusDepth, delay, delayTime,
 *               //   delayFeedback, room, roomSize, roomLp } (effets, voir SS.FX_DEFAULTS)
 *     { id, type: "drum", name, color, volume, mute, solo,
 *       sound: "bd", machine: "RolandTR808", variant: 0,
 *       steps: [0..1, ...] }                         // vélocité, 0 = éteint
 *     { id, type: "instrument", name, color, volume, mute, solo,
 *       category: "mono"|"arp"|"chord", family, instrument,
 *       chord: "min", arp: { mode, rate, octaves }, octave,
 *       sd: { wave, voices, detune, filter, cutoff, q, env,      // sound design (optionnel,
 *             attack, decay, sustain, release, pan, drive, gain } // sinon preset de l'instrument)
 *       events: [{ step, len, notes: [midi...], vel }] }
 *   ]
 * }
 */
window.SS = window.SS || {};

SS.FILE_EXT = '.stepseq.json';

SS.stepsPerBar = (p) => Math.round(p.timeSig[0] * (16 / p.timeSig[1]));
SS.stepsPerBeat = (p) => Math.max(1, Math.round(16 / p.timeSig[1]));
SS.totalSteps = (p) => SS.stepsPerBar(p) * p.bars;

SS.uid = () => Math.random().toString(36).slice(2, 10);

SS.newProject = () => ({
  format: 'stepseq',
  version: 1,
  title: 'Nouveau projet',
  tempo: 120,
  timeSig: [4, 4],
  bars: 1,
  groove: { res: 0, swing: 0.5, human: 0 }, // res : 0 = droit, 16 = swing des doubles-croches, 8 = des croches
  tracks: [],
});

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
  if (opts.type === 'drum') {
    return { ...base, sound: opts.sound, machine: opts.machine, variant: opts.variant || 0, steps: new Array(n).fill(0) };
  }
  const fam = SS.findFamily(opts.family);
  return {
    ...base,
    category: opts.category,
    family: opts.family,
    instrument: opts.instrument,
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
  p.bars = Math.min(8, Math.max(1, Number(data.bars) || 1));
  if (data.groove && typeof data.groove === 'object') {
    const g = data.groove;
    p.groove = {
      res: [0, 8, 16].includes(Number(g.res)) ? Number(g.res) : 0,
      swing: Math.min(0.75, Math.max(0.5, Number(g.swing) || 0.5)),
      human: Math.min(1, Math.max(0, Number(g.human) || 0)),
    };
  }
  p.tracks = data.tracks.map((t) => {
    const track = { ...t, id: t.id || SS.uid() };
    // effets : on ne garde que les clés connues, de type attendu
    if (t.fx && typeof t.fx === 'object') {
      track.fx = {};
      for (const [k, def] of Object.entries(SS.FX_DEFAULTS)) {
        const v = t.fx[k];
        if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v)) track.fx[k] = v;
        if (typeof def === 'string' && SS.DELAY_TIMES.some((d) => d.id === v)) track.fx[k] = v;
      }
    } else delete track.fx;
    track.volume = typeof t.volume === 'number' ? t.volume : 0.8;
    track.mute = !!t.mute;
    track.solo = !!t.solo;
    if (t.type === 'drum') track.steps = Array.isArray(t.steps) ? t.steps.map(Number) : [];
    else {
      track.type = 'instrument';
      track.events = Array.isArray(t.events) ? t.events : [];
      track.arp = { mode: 'up', rate: 2, octaves: 1, ...(t.arp || {}) };
      track.chord = t.chord || 'min';
      if (t.sd && typeof t.sd === 'object') {
        track.sd = {};
        for (const [k, v] of Object.entries(t.sd)) {
          if (typeof v === 'number' && Number.isFinite(v)) track.sd[k] = v;
          else if (typeof v === 'string' && /^[a-z]{1,16}$/.test(v)) track.sd[k] = v;
        }
      } else delete track.sd;
      track.octave = Number.isFinite(t.octave) ? t.octave : 4;
    }
    return track;
  });
  SS.resizeProject(p);
  return p;
};

SS.serialize = (p) => JSON.stringify(p, null, 1);

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
