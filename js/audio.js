/*
 * Moteur audio : chargement des échantillons, voix (samples, soundfonts, synthés)
 * et séquenceur à anticipation (lookahead scheduler).
 */
window.SS = window.SS || {};

SS.audio = (() => {
  let ctx = null;
  let master = null;
  const buses = new Map(); // trackId -> GainNode
  const jsonCache = new Map();
  const bufferCache = new Map();
  const sfCache = new Map();
  let onError = (msg) => console.error(msg);

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ---------------- Chargement ---------------- */

  function loadJSON(url) {
    if (!jsonCache.has(url)) {
      const p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(r.status + ' ' + url);
          return r.json();
        })
        .catch((e) => {
          jsonCache.delete(url);
          throw e;
        });
      jsonCache.set(url, p);
    }
    return jsonCache.get(url);
  }

  const encodePath = (p) => (p.includes('%') ? p : encodeURI(p));

  function loadBuffer(url) {
    ensureCtx();
    if (!bufferCache.has(url)) {
      const entry = { buffer: null, promise: null };
      entry.promise = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(r.status + ' ' + url);
          return r.arrayBuffer();
        })
        .then((ab) => decode(ab))
        .then((buf) => (entry.buffer = buf))
        .catch((e) => {
          console.warn(e);
          onError('Impossible de charger le son : ' + decodeURIComponent(url.split('/').pop()));
          // on garde l'échec en cache un moment pour ne pas réessayer à chaque pas
          setTimeout(() => bufferCache.delete(url), 30000);
          return null;
        });
      bufferCache.set(url, entry);
    }
    return bufferCache.get(url);
  }

  function decode(arrayBuffer) {
    return new Promise((res, rej) => ctx.decodeAudioData(arrayBuffer, res, rej));
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /** Les fichiers webaudiofont sont du JS : on extrait les zones par regex (pas d'eval). */
  function parseSoundfontJs(text) {
    const start = text.indexOf('zones');
    const body = start >= 0 ? text.slice(start) : text;
    const zones = [];
    const zoneRe = /\{([^{}]*)\}/g;
    let m;
    while ((m = zoneRe.exec(body))) {
      const z = {};
      const kvRe = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(-?[\d.]+)|(true|false))/g;
      let kv;
      while ((kv = kvRe.exec(m[1]))) {
        const key = kv[1];
        if (kv[2] !== undefined) z[key] = kv[2];
        else if (kv[3] !== undefined) z[key] = kv[3];
        else if (kv[4] !== undefined) z[key] = parseFloat(kv[4]);
        else z[key] = kv[5] === 'true';
      }
      if (z.file || z.sample) zones.push(z);
    }
    return zones;
  }

  function loadSoundfont(file) {
    ensureCtx();
    if (!sfCache.has(file)) {
      const entry = { zones: null, promise: null };
      entry.promise = fetch(SS.SOURCES.soundfont + file + '.js')
        .then((r) => {
          if (!r.ok) throw new Error(r.status + ' ' + file);
          return r.text();
        })
        .then(async (text) => {
          const raw = parseSoundfontJs(text);
          const zones = await Promise.all(
            raw.map(async (z) => {
              let buffer;
              if (z.file) {
                buffer = await decode(base64ToArrayBuffer(z.file));
              } else {
                const bin = atob(z.sample);
                const n = bin.length / 2;
                buffer = ctx.createBuffer(1, n, z.sampleRate || 44100);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < n; i++) {
                  let v = bin.charCodeAt(i * 2) + bin.charCodeAt(i * 2 + 1) * 256;
                  if (v >= 32768) v -= 65536;
                  data[i] = v / 32768;
                }
              }
              const loop = z.loopStart >= 1 && z.loopStart < z.loopEnd;
              return {
                low: z.keyRangeLow ?? 0,
                high: z.keyRangeHigh ?? 127,
                baseDetune: (z.originalPitch ?? 6000) - 100 * (z.coarseTune || 0) - (z.fineTune || 0),
                loop,
                loopStart: loop ? z.loopStart / (z.sampleRate || 44100) : 0,
                loopEnd: loop ? z.loopEnd / (z.sampleRate || 44100) : 0,
                buffer,
              };
            })
          );
          entry.zones = zones;
          return zones;
        })
        .catch((e) => {
          console.warn(e);
          onError('Impossible de charger le soundfont : ' + file);
          setTimeout(() => sfCache.delete(file), 30000);
          return null;
        });
      sfCache.set(file, entry);
    }
    return sfCache.get(file);
  }

  /* ---------------- Résolution des sons ---------------- */

  async function drumVariants(machine, sound) {
    const json = await loadJSON(SS.SOURCES.tdm);
    const list = json[machine + '_' + sound];
    return Array.isArray(list) ? list.map((p) => json._base + encodePath(p)) : [];
  }

  async function drumMachines(sound) {
    const json = await loadJSON(SS.SOURCES.tdm);
    return Object.keys(json)
      .filter((k) => k.endsWith('_' + sound) && Array.isArray(json[k]))
      .map((k) => k.slice(0, -(sound.length + 1)))
      .sort((a, b) => a.localeCompare(b));
  }

  async function drumUrl(track) {
    const list = await drumVariants(track.machine, track.sound);
    if (!list.length) return null;
    return list[Math.min(track.variant || 0, list.length - 1)];
  }

  /** Liste triée [{midi, url}] d'un instrument multi-échantillonné. */
  const multiMaps = new Map();
  async function multiMap(inst) {
    const k = inst.bank + ':' + inst.key;
    if (!multiMaps.has(k)) {
      const p = loadJSON(SS.SOURCES[inst.bank]).then((json) => {
        const map = json[inst.key] || {};
        return Object.entries(map)
          .map(([note, path]) => ({
            midi: SS.parseNote(note),
            url: json._base + encodePath(Array.isArray(path) ? path[0] : path),
          }))
          .filter((e) => e.midi !== null)
          .sort((a, b) => a.midi - b.midi);
      });
      multiMaps.set(k, p);
    }
    return multiMaps.get(k);
  }
  const nearest = (list, midi) =>
    list.reduce((best, e) => (Math.abs(e.midi - midi) < Math.abs(best.midi - midi) ? e : best), list[0]);

  /* ---------------- Préchargement ---------------- */

  const instOf = (track) => SS.findInstrument(track.family, track.instrument);

  async function prepareTrack(track) {
    if (!ctx) return; // sera fait au premier geste de l'utilisateur (politique autoplay)
    try {
      if (track.type === 'drum') {
        const url = await drumUrl(track);
        if (url) await loadBuffer(url).promise;
        return;
      }
      const inst = instOf(track);
      if (inst.kind === 'sf') await loadSoundfont(inst.file).promise;
      else if (inst.kind === 'multi') {
        const list = await multiMap(inst);
        const midis = new Set();
        (track.events || []).forEach((ev) => ev.notes.forEach((n) => midis.add(n)));
        if (!midis.size) midis.add(60);
        await Promise.all([...midis].map((n) => list.length && loadBuffer(nearest(list, n).url).promise));
      }
    } catch (e) {
      console.warn(e);
    }
  }

  /* ---------------- Bus par piste ---------------- */

  function bus(track) {
    ensureCtx();
    if (!track || !track.id) return master;
    let g = buses.get(track.id);
    if (!g) {
      g = ctx.createGain();
      g.gain.value = typeof track.volume === 'number' ? track.volume : 0.8;
      g.connect(master);
      buses.set(track.id, g);
    }
    return g;
  }
  function setTrackGain(track, value) {
    if (!ctx) return;
    const g = bus(track);
    g.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
  }
  function removeTrack(id) {
    const g = buses.get(id);
    if (g) g.disconnect();
    buses.delete(id);
  }

  /* ---------------- Voix ---------------- */

  const voices = new Set();
  function register(sources, gain) {
    const v = { sources, gain };
    voices.add(v);
    sources[0].onended = () => voices.delete(v);
  }
  function silenceAll() {
    if (!ctx) return;
    const now = ctx.currentTime;
    voices.forEach((v) => {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.01);
        v.sources.forEach((s) => s.stop(now + 0.06));
      } catch (e) {
        /* déjà arrêtée */
      }
    });
    voices.clear();
  }

  const velGain = (v) => Math.pow(Math.max(0, Math.min(1, v)), 1.4);

  async function playDrum(track, time, vel, dest) {
    const url = await drumUrl(track);
    if (!url) return;
    const entry = loadBuffer(url);
    if (!entry.buffer) return; // pas encore chargé : on saute ce coup
    const src = ctx.createBufferSource();
    src.buffer = entry.buffer;
    const g = ctx.createGain();
    g.gain.value = velGain(vel);
    src.connect(g).connect(dest || bus(track));
    src.start(Math.max(time, ctx.currentTime));
    register([src], g);
  }

  /* Chaîne commune : sources -> filtre (VCF) -> saturation -> ampli (VCA, ADSR) -> panoramique -> sortie */
  const driveCurves = new Map();
  function driveCurve(amount) {
    const k = Math.round(amount * 100);
    if (!driveCurves.has(k)) {
      const n = 1024;
      const c = new Float32Array(n);
      const kk = k * 0.6;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = ((1 + kk) * x) / (1 + kk * Math.abs(x));
      }
      driveCurves.set(k, c);
    }
    return driveCurves.get(k);
  }

  function voiceChain(p, t, dur, vel, dest, level) {
    const attack = Math.max(0.003, p.attack);
    const decay = Math.max(0.005, p.decay);
    const sustain = Math.max(0, Math.min(1, p.sustain));
    const release = Math.max(0.01, p.release);
    const tOff = t + Math.max(dur, attack);
    const end = tOff + release * 1.5 + 0.05;

    // VCF
    const filter = ctx.createBiquadFilter();
    filter.type = p.filter || 'lowpass';
    filter.Q.value = Math.max(0.0001, p.q);
    const base = Math.max(20, Math.min(20000, p.cutoff));
    if (p.env > 0) {
      // enveloppe propre au filtre (lpattack / lpdecay / lpsustain / lprelease)
      const fa = Math.max(0.003, p.fattack ?? p.attack);
      const fd = Math.max(0.005, p.fdecay ?? p.decay);
      const fs = Math.max(0, Math.min(1, p.fsustain ?? p.sustain));
      const fr = Math.max(0.01, p.frelease ?? p.release);
      const fOff = Math.max(tOff, t + fa);
      const top = Math.min(20000, base * Math.pow(2, p.env * (0.4 + 0.6 * vel)));
      filter.frequency.setValueAtTime(base, t);
      filter.frequency.exponentialRampToValueAtTime(top, t + fa);
      filter.frequency.setTargetAtTime(base * Math.pow(top / base, fs), t + fa, fd / 3);
      filter.frequency.setTargetAtTime(base, fOff, fr / 4);
    } else {
      filter.frequency.setValueAtTime(base, t);
    }

    // saturation
    let last = filter;
    if (p.drive > 0) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(p.drive);
      ws.oversample = '2x';
      last.connect(ws);
      last = ws;
    }

    // VCA (ADSR)
    const amp = ctx.createGain();
    const peak = velGain(vel) * level * (p.gain ?? 1) * (p.drive > 0 ? 1 - p.drive * 0.4 : 1);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + attack);
    amp.gain.setTargetAtTime(peak * sustain, t + attack, decay / 3);
    amp.gain.setTargetAtTime(0, tOff, release / 4);
    last.connect(amp);

    // panoramique
    if (p.pan && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, p.pan));
      amp.connect(pan).connect(dest);
    } else amp.connect(dest);

    return { input: filter, amp, end };
  }

  function sampleVoice(p, buffer, rate, time, dur, vel, dest, loop) {
    const t = Math.max(time, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    if (loop) {
      src.loop = true;
      src.loopStart = loop.start;
      src.loopEnd = loop.end;
    }
    const chain = voiceChain(p, t, dur, vel, dest, 1);
    src.connect(chain.input);
    src.start(t);
    src.stop(chain.end);
    register([src], chain.amp);
  }

  function synthVoice(p, midi, time, dur, vel, dest) {
    const t = Math.max(time, ctx.currentTime);
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const chain = voiceChain(p, t, dur, vel, dest, 0.35);
    const type = p.wave === 'supersaw' ? 'sawtooth' : p.wave || 'sawtooth';
    const n = Math.max(1, Math.round(p.wave === 'supersaw' ? Math.max(3, p.voices || 5) : p.voices || 1));
    const detune = p.wave === 'supersaw' ? Math.max(8, p.detune || 0) : p.detune || 0;
    const oscs = [];
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (n > 1) o.detune.value = ((i / (n - 1)) * 2 - 1) * detune;
      const og = ctx.createGain();
      og.gain.value = 1 / Math.sqrt(n);
      o.connect(og).connect(chain.input);
      o.start(t);
      o.stop(chain.end);
      oscs.push(o);
    }
    register(oscs, chain.amp);
  }

  async function playNote(track, midi, time, dur, vel, dest) {
    ensureCtx();
    const out = dest || bus(track);
    const inst = instOf(track);
    const p = SS.soundParams(track);
    if (inst.kind === 'synth') {
      synthVoice(p, midi, time, dur, vel, out);
    } else if (inst.kind === 'sf') {
      const entry = loadSoundfont(inst.file);
      if (!entry.zones || !entry.zones.length) return;
      const zone =
        entry.zones.find((z) => midi >= z.low && midi <= z.high) ||
        entry.zones.reduce((b, z) => (Math.abs((z.low + z.high) / 2 - midi) < Math.abs((b.low + b.high) / 2 - midi) ? z : b));
      const rate = Math.pow(2, (100 * midi - zone.baseDetune) / 1200);
      sampleVoice(p, zone.buffer, rate, time, dur, vel, out, zone.loop ? { start: zone.loopStart, end: zone.loopEnd } : null);
    } else if (inst.kind === 'multi') {
      const list = await multiMap(inst);
      if (!list.length) return;
      const e = nearest(list, midi);
      const entry = loadBuffer(e.url);
      if (!entry.buffer) return;
      sampleVoice(p, entry.buffer, Math.pow(2, (midi - e.midi) / 12), time, dur, vel, out, null);
    }
  }

  /** Aperçu d'un son (dialogue, clic sur une note...). */
  async function preview(track, midi, dur = 0.45) {
    ensureCtx();
    await prepareTrack(track);
    if (midi == null && track.type !== 'drum') midi = (SS.findFamily(track.family).octave + 1) * 12;
    if (track.type !== 'drum' && instOf(track).kind === 'multi') {
      const list = await multiMap(instOf(track)).catch(() => []);
      const wanted = Array.isArray(midi) ? midi : [midi];
      if (list.length) await Promise.all(wanted.map((n) => loadBuffer(nearest(list, n).url).promise));
    }
    const t = ctx.currentTime + 0.02;
    if (track.type === 'drum') playDrum(track, t, 0.9, master);
    else {
      const notes = Array.isArray(midi) ? midi : [midi];
      notes.forEach((n) => playNote(track, n, t, dur, notes.length > 1 ? 0.65 : 0.8, master));
    }
  }

  /* ---------------- Séquenceur ---------------- */

  const seq = {
    playing: false,
    timer: null,
    step: 0,
    nextTime: 0,
    queue: [],
    raf: null,
    getProject: null,
    onStep: null,
  };

  const stepDur = (project) => 60 / project.tempo / 4; // une case = une double-croche

  function audibleTracks(project) {
    const soloed = project.tracks.some((t) => t.solo);
    return project.tracks.filter((t) => !t.mute && (!soloed || t.solo));
  }

  function arpSequence(ev, track) {
    const arp = track.arp || {};
    let notes = [...ev.notes].sort((a, b) => a - b);
    const oct = arp.octaves || 1;
    let all = [];
    for (let o = 0; o < oct; o++) all = all.concat(notes.map((n) => n + 12 * o));
    if (arp.mode === 'down') all.reverse();
    else if (arp.mode === 'updown' && all.length > 2) all = all.concat(all.slice(1, -1).reverse());
    return all;
  }

  function scheduleStep(project, step, time) {
    const sd = stepDur(project);
    audibleTracks(project).forEach((track) => {
      if (track.type === 'drum') {
        const v = track.steps[step];
        if (v > 0) playDrum(track, time, v);
        return;
      }
      (track.events || []).forEach((ev) => {
        if (track.category === 'arp') {
          // l'arpège joue tant que l'événement couvre ce pas
          if (step < ev.step || step >= ev.step + ev.len) return;
          const rate = (track.arp && track.arp.rate) || 1;
          const seqNotes = arpSequence(ev, track);
          const sub = sd / rate;
          const startIdx = Math.round((step - ev.step) * rate);
          const count = Math.round(rate * (step + 1 - ev.step)) - startIdx;
          for (let i = 0; i < count; i++) {
            const idx = startIdx + i;
            const n =
              track.arp && track.arp.mode === 'random'
                ? seqNotes[Math.floor(Math.random() * seqNotes.length)]
                : seqNotes[idx % seqNotes.length];
            const t = time + (idx - (step - ev.step) * rate) * sub;
            playNote(track, n, t, sub * 0.9, ev.vel);
          }
        } else if (ev.step === step) {
          const dur = ev.len * sd * 0.98;
          ev.notes.forEach((n) => playNote(track, n, time, dur, ev.vel * (ev.notes.length > 1 ? 0.8 : 1)));
        }
      });
    });
  }

  function tick() {
    const project = seq.getProject();
    const total = SS.totalSteps(project);
    while (seq.nextTime < ctx.currentTime + 0.12) {
      if (seq.step >= total) seq.step = 0;
      scheduleStep(project, seq.step, seq.nextTime);
      seq.queue.push({ step: seq.step, time: seq.nextTime });
      seq.nextTime += stepDur(project);
      seq.step++;
    }
  }

  function draw() {
    if (!seq.playing) return;
    while (seq.queue.length && seq.queue[0].time <= ctx.currentTime) {
      const e = seq.queue.shift();
      seq.onStep && seq.onStep(e.step);
    }
    seq.raf = requestAnimationFrame(draw);
  }

  function start(getProject, onStep) {
    ensureCtx();
    if (seq.playing) return;
    seq.getProject = getProject;
    seq.onStep = onStep;
    seq.playing = true;
    seq.step = 0;
    seq.queue = [];
    seq.nextTime = ctx.currentTime + 0.08;
    getProject().tracks.forEach(prepareTrack);
    tick();
    seq.timer = setInterval(tick, 25);
    draw();
  }

  function stop() {
    seq.playing = false;
    clearInterval(seq.timer);
    cancelAnimationFrame(seq.raf);
    seq.queue = [];
    silenceAll(); // coupe les voix en cours et celles déjà programmées
    seq.onStep && seq.onStep(-1);
  }

  return {
    ensureCtx,
    loadJSON,
    drumMachines,
    drumVariants,
    prepareTrack,
    preview,
    playNote,
    setTrackGain,
    removeTrack,
    start,
    stop,
    isPlaying: () => seq.playing,
    setErrorHandler: (fn) => (onError = fn),
  };
})();
