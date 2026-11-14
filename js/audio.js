/*
 * Moteur audio : chargement des échantillons, voix (samples, soundfonts, synthés)
 * et séquenceur à anticipation (lookahead scheduler).
 */
window.SS = window.SS || {};

SS.audio = (() => {
  let ctx = null;
  let master = null;
  let masterStrip = null;
  let masterFader = null;
  let masterMeter = null;
  let masterProc = null; // nœud de mastering (AudioWorklet)
  let masterEffects = null;
  let loudness = null; // dernières mesures du mastering : { m, s, i, tp, gr, secs }
  let lastMasterProject = null;
  let returns = null; // bus d'effets partagés : { plate, hall, echo }
  let pendingMaster = null;
  const buses = new Map(); // trackId -> GainNode
  const jsonCache = new Map();
  const bufferCache = new Map();
  const sfCache = new Map();
  let onError = (msg) => console.error(msg);
  let masterReady = null; // chargement du module de mastering (attendu avant la première lecture)
  let onLoading = () => {}; // signale l'attente des sons avant la lecture (bouton Lecture)

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Master : somme -> tranche de console (EQ, comp, limiteur) -> fader -> vumètre -> sortie
      master = ctx.createGain();
      masterStrip = makeStrip();
      masterFader = ctx.createGain();
      masterFader.gain.value = 0.8;
      masterMeter = makeMeter();
      master.connect(masterStrip.entry);
      masterStrip.out.connect(masterFader);
      masterFader.connect(ctx.destination);
      masterFader.connect(masterMeter.node);
      // mastering (js/master-dsp.js) : inséré après le fader dès que le module audio est chargé
      if (SS.mastering)
        masterReady = SS.mastering.load(ctx).then(() => {
          masterProc = SS.mastering.create(ctx);
          masterProc.port.onmessage = (e) => (loudness = e.data);
          // seules la sortie et le vumètre passent après le mastering (les points d'écoute de l'Auto Mix restent branchés)
          masterFader.disconnect(ctx.destination);
          masterFader.disconnect(masterMeter.node);
          masterFader.connect(masterProc);
          masterProc.connect(ctx.destination);
          masterProc.connect(masterMeter.node);
          if (lastMasterProject) applyMastering(lastMasterProject);
        }).catch(() => {});
      if (pendingMaster) applyMaster(pendingMaster);
      if (SS.juno) SS.juno.load(ctx); // module audio du Juno-106 (pistes Synthé)
      if (SS.filters) SS.filters.load(ctx); // filtres ladder / SEM (sound design)
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
      const entry = { buffer: null, promise: null, failed: false, detune: 0 };
      const gmDrum = gmDrumFileOf(url);
      if (gmDrum) {
        // son de batterie General MIDI : un soundfont d'une seule zone, joué à la hauteur de sa note
        entry.promise = loadSoundfont(gmDrum.file).promise.then((zones) => {
          const z = zones && (zones.find((x) => x.low <= gmDrum.note && gmDrum.note <= x.high) || zones[0]);
          if (!z) {
            entry.failed = true;
            setTimeout(() => bufferCache.delete(url), 30000);
            return null;
          }
          entry.detune = gmDrum.note * 100 - z.baseDetune;
          return (entry.buffer = z.buffer);
        });
        bufferCache.set(url, entry);
        return entry;
      }
      entry.promise = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(r.status + ' ' + url);
          return r.arrayBuffer();
        })
        .then((ab) => decode(ab))
        .then((buf) => (entry.buffer = buf))
        .catch((e) => {
          entry.failed = true;
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

  /** URL d'un son de batterie General MIDI (bibliothèque « gm ») -> nom du fichier soundfont, avec sa note. */
  function gmDrumFileOf(url) {
    const base = SS.SOURCES.soundfont;
    if (!url.startsWith(base) || !url.endsWith('.js')) return null;
    const file = url.slice(base.length, -3);
    const m = /^128(\d\d)_/.exec(file);
    if (!m) return null;
    return { file, note: +m[1] };
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
      // certains fichiers écrivent une somme (« originalPitch:4200-140 ») : on l'évalue, sinon la note est fausse
      const kvRe = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(-?[\d.]+(?:\s*[-+]\s*[\d.]+)*)|(true|false))/g;
      let kv;
      while ((kv = kvRe.exec(m[1]))) {
        const key = kv[1];
        if (kv[2] !== undefined) z[key] = kv[2];
        else if (kv[3] !== undefined) z[key] = kv[3];
        else if (kv[4] !== undefined) z[key] = kv[4].replace(/\s/g, '').match(/[-+]?[\d.]+/g).reduce((a, t) => a + parseFloat(t), 0);
        else z[key] = kv[5] === 'true';
      }
      if (z.file || z.sample) zones.push(z);
    }
    return zones;
  }

  function loadSoundfont(file) {
    ensureCtx();
    if (!sfCache.has(file)) {
      const entry = { zones: null, promise: null, failed: false };
      entry.promise = fetch(SS.SOURCES.soundfont + file + '.js')
        .then((r) => {
          if (!r.ok) throw new Error(r.status + ' ' + file);
          return r.text();
        })
        .then(async (text) => {
          const raw = parseSoundfontJs(text);
          const tuning = (SS.SF_TUNING && SS.SF_TUNING[file]) || [];
          const zones = await Promise.all(
            raw.map(async (z, zi) => {
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
                // + écart mesuré de l'échantillon (js/sample-tuning.js) : toutes les zones sonnent juste
                baseDetune: (z.originalPitch ?? 6000) - 100 * (z.coarseTune || 0) - (z.fineTune || 0) + (tuning[zi] || 0),
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
          entry.failed = true;
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

  /* Autres bibliothèques de batterie : Dirt-Samples, percussions VCSL, Mridangam */
  const LIB_SOURCE = { dirt: () => SS.SOURCES.dirt, vcsl: () => SS.SOURCES.vcsl, mrid: () => SS.SOURCES.mrid };
  const noComma = (p) => !p.includes(',') && !p.includes('%2C'); // Chrome refuse ces fichiers (en-tête invalide)

  /** Banques disponibles d'une bibliothèque : [{ id, count }] */
  async function drumBanks(lib) {
    if (lib === 'gm') return SS.GM_DRUMS.map((d) => ({ id: String(d.midi), label: `${d.midi} · ${d.label}`, count: SS.gmDrumFiles(d.midi).length }));
    const json = await loadJSON(LIB_SOURCE[lib]());
    const keys = lib === 'vcsl' ? (SS.LIB && SS.LIB.vcslPerc) || [] : Object.keys(json).filter((k) => k !== '_base');
    return keys
      .filter((k) => Array.isArray(json[k]) && json[k].some(noComma))
      .map((k) => ({ id: k, count: json[k].filter(noComma).length }));
  }

  async function bankVariants(lib, bank) {
    if (lib === 'gm') return SS.gmDrumFiles(bank).map((f) => SS.SOURCES.soundfont + f + '.js');
    const json = await loadJSON(LIB_SOURCE[lib]());
    const list = Array.isArray(json[bank]) ? json[bank].filter(noComma) : [];
    return list.map((p) => json._base + encodePath(p));
  }

  /** Liste des échantillons possibles d'une piste Drum, selon sa bibliothèque. */
  async function trackDrumVariants(track) {
    if (track.source && track.source !== 'tdm') return bankVariants(track.source, track.bank);
    return drumVariants(track.machine, track.sound);
  }

  async function drumUrl(track) {
    const list = await trackDrumVariants(track);
    if (!list.length) return null;
    return list[Math.min(track.variant || 0, list.length - 1)];
  }

  /** Liste triée [{midi, url}] d'un instrument multi-échantillonné. */
  const multiMaps = new Map();
  async function multiMap(inst) {
    const k = inst.bank + ':' + inst.key;
    if (!multiMaps.has(k)) {
      const p = loadJSON(SS.SOURCES[inst.bank]).then((json) => {
        let map = json[inst.key] || {};
        const oct = SS.multiOctave(inst);
        if (Array.isArray(map)) {
          // banque Dirt-Samples : la note est dans le nom du fichier (« Mighty Moog C2.wav », « BS A#2 PI.wav »)
          const named = {};
          map.forEach((f) => {
            const m = /(?:^|[^A-Za-z])([A-G][#sb]?-?\d)(?=[^0-9]|$)/.exec(f.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, ''));
            if (m && !(m[1] in named)) named[m[1]] = f;
          });
          map = named;
        }
        return Object.entries(map)
          .map(([note, path]) => {
            const file = Array.isArray(path) ? path[0] : path;
            // hauteur réelle = note du nom + octave de la banque + écart fin mesuré (js/sample-tuning.js) ;
            // midi est la hauteur réelle à l'octave près : l'échantillon choisi est le plus proche de la note jouée
            const cents = (SS.MULTI_TUNING && SS.MULTI_TUNING[inst.bank + ':' + file]) || 0;
            const n = SS.parseNote(note);
            return { midi: n === null ? null : n + oct, tune: cents / 100, url: json._base + encodePath(file) };
          })
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
      if (inst.kind === 'analog') await SS.juno.load(ctx);
      else if (inst.kind === 'sf') await loadSoundfont(SS.sfFile(inst, track)).promise;
      else if (inst.kind === 'dirt') await loadBuffer(await dirtUrl(SS.sfFile(inst, track))).promise;
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

  /*
   * Chaque piste a sa chaîne :
   *   entrée (volume) -> chorus (dry/wet) -> pre ─┬─> master (son direct)
   *                                              ├─> envoi delay  -> delay ⟲ feedback (filtré) -> master
   *                                              └─> envoi reverb -> convolution (IR générée)   -> master
   * Les étages sont créés à la première utilisation d'un effet.
   */
  let currentTempo = 120;

  /* ---------------- Console : tranche (EQ 5 bandes, compresseur, limiteur) ---------------- */

  /** entry -> passe-haut -> shelf grave -> cloche -> cloche -> shelf aigu -> compresseur -> gain de compensation -> limiteur -> out */
  function makeStrip() {
    const st = {};
    st.entry = ctx.createGain();
    const bq = (type) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      return f;
    };
    st.hp = bq('highpass');
    st.low = bq('lowshelf');
    st.lm = bq('peaking');
    st.hm = bq('peaking');
    st.high = bq('highshelf');
    // filtre VCF (utilisé par le Master) : 2 étages par filtre pour la pente 24 dB/oct
    st.vcf = [bq('highpass'), bq('highpass'), bq('lowpass'), bq('lowpass')];
    st.comp = ctx.createDynamicsCompressor();
    st.makeup = ctx.createGain();
    st.lim = ctx.createDynamicsCompressor();
    // écrêteur doux après le limiteur : garantit le plafond (le compresseur Web Audio n'est pas un vrai « brickwall »)
    st.clip = ctx.createWaveShaper();
    st.clip.oversample = '4x';
    st.limOut = ctx.createGain();
    st.out = ctx.createGain();
    st.entry.connect(st.hp).connect(st.low).connect(st.lm).connect(st.hm).connect(st.high);
    st.high.connect(st.vcf[0]).connect(st.vcf[1]).connect(st.vcf[2]).connect(st.vcf[3]);
    st.vcf[3].connect(st.comp).connect(st.makeup).connect(st.lim).connect(st.clip).connect(st.limOut).connect(st.out);
    applyStrip(st, SS.MIX_DEFAULTS);
    return st;
  }

  /** Règle une tranche ; un module coupé devient transparent (gain 0 dB, ratio 1:1). */
  function applyStrip(st, m) {
    const now = ctx.currentTime;
    if (!st.targets) st.targets = new WeakMap();
    const set = (param, v) => {
      if (st.targets.get(param) === v) return;
      st.targets.set(param, v);
      param.setTargetAtTime(v, now, 0.015);
    };
    const e = m.eq;
    set(st.hp.frequency, e.on && e.hp.on ? e.hp.f : 10);
    st.hp.Q.value = 0.707;
    set(st.low.frequency, e.low.f);
    set(st.low.gain, e.on ? e.low.g : 0);
    set(st.lm.frequency, e.lm.f);
    set(st.lm.gain, e.on ? e.lm.g : 0);
    set(st.lm.Q, e.lm.q);
    set(st.hm.frequency, e.hm.f);
    set(st.hm.gain, e.on ? e.hm.g : 0);
    set(st.hm.Q, e.hm.q);
    set(st.high.frequency, e.high.f);
    set(st.high.gain, e.on ? e.high.g : 0);
    // VCF : coupé = filtres grands ouverts ; en 12 dB/oct le 1er étage de chaque filtre reste ouvert.
    // Pour les passe-haut / passe-bas, Web Audio lit Q en dB : c'est directement le pic de résonance.
    const v = m.vcf;
    const nyq = Math.min(22000, ctx.sampleRate / 2);
    const vOn = !!(v && v.on);
    const two = vOn && v.slope === 24;
    set(st.vcf[0].frequency, two ? v.hp.f : 10);
    st.vcf[0].Q.value = -5.35; // 1er étage Butterworth 4e ordre (Q 0,54)
    set(st.vcf[1].frequency, vOn ? v.hp.f : 10);
    set(st.vcf[1].Q, vOn ? v.hp.res : 0);
    set(st.vcf[2].frequency, two ? v.lp.f : nyq);
    st.vcf[2].Q.value = -5.35;
    set(st.vcf[3].frequency, vOn ? v.lp.f : nyq);
    set(st.vcf[3].Q, vOn ? v.lp.res : 0);
    const c = m.comp;
    set(st.comp.threshold, c.on ? c.th : 0);
    set(st.comp.ratio, c.on ? c.ratio : 1);
    set(st.comp.knee, c.knee);
    st.comp.attack.value = c.att;
    st.comp.release.value = c.rel;
    set(st.makeup.gain, c.on ? SS.dbToGain(c.makeup) : 1);
    // limiteur : compresseur à genou dur, ratio 20:1, attaque très courte, seuil = plafond
    const l = m.lim;
    set(st.lim.threshold, l.on ? l.ceil : 0);
    set(st.lim.ratio, l.on ? 20 : 1);
    st.lim.knee.value = 0;
    st.lim.attack.value = 0.001;
    st.lim.release.value = l.rel;
    const clipKey = l.on ? l.ceil.toFixed(2) : null;
    if (st.clipKey !== clipKey) {
      st.clip.curve = l.on ? clipCurve(l.ceil) : null;
      st.clipKey = clipKey;
    }
  }

  /** Courbe d'écrêtage doux : linéaire jusqu'à 85 % du plafond, puis arrondie jusqu'au plafond exact. */
  const clipCurves = new Map();
  function clipCurve(ceilDb) {
    const key = ceilDb.toFixed(2);
    if (clipCurves.has(key)) return clipCurves.get(key);
    const c = SS.dbToGain(ceilDb);
    const knee = 0.85 * c;
    const n = 4096;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1; // le WaveShaper lit la courbe pour une entrée de -1 à +1 (au-delà : valeur extrême)
      const a = Math.abs(x);
      const y = a <= knee ? a : knee + (c - knee) * Math.tanh((a - knee) / (c - knee));
      curve[i] = Math.sign(x) * y;
    }
    if (clipCurves.size >= 32) clipCurves.delete(clipCurves.keys().next().value);
    clipCurves.set(key, curve);
    return curve;
  }

  /** Vumètre : un analyseur lu par la console (crête + RMS). */
  function makeMeter() {
    const a = ctx.createAnalyser();
    a.fftSize = 1024;
    return { node: a, buf: new Float32Array(a.fftSize) };
  }
  function readMeter(m) {
    if (!m) return { peak: 0, rms: 0 };
    m.node.getFloatTimeDomainData(m.buf);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < m.buf.length; i++) {
      const v = Math.abs(m.buf[i]);
      if (v > peak) peak = v;
      sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / m.buf.length) };
  }

  function bus(track) {
    ensureCtx();
    if (!track || !track.id) return master;
    let b = buses.get(track.id);
    if (!b) {
      // tranche de console -> panoramique -> fader (volume) -> chorus -> pre -> duck (sidechain) -> master + envois
      b = { strip: makeStrip(), pan: ctx.createStereoPanner(), input: ctx.createGain(), pre: ctx.createGain(), duck: ctx.createGain(), meter: makeMeter(), chorus: null, delay: null, reverb: null };
      b.input.gain.value = typeof track.volume === 'number' ? track.volume : 0.8;
      b.strip.out.connect(b.pan).connect(b.input);
      b.input.connect(b.pre);
      b.pre.connect(b.duck);
      b.duck.connect(master);
      b.duck.connect(b.meter.node);
      buses.set(track.id, b);
      applyFx(track);
      applyMix(track);
    }
    return b.strip.entry;
  }

  /* ---------------- Automation (track.auto, js/project.js) ---------------- */

  /*
   * Nœuds de l'automation, créés la première fois qu'une piste en a besoin : après le fader et le Mute,
   * pre -> passe-bas -> passe-haut -> gain (volume) -> duck ; envois supplémentaires (reverb « hall », écho) pris après
   * le sidechain, comme les envois de la fenêtre Effets. Au neutre, tout est transparent.
   */
  function autoNodes(b) {
    if (b.auto) return b.auto;
    const rs = ensureReturns();
    const a = { lp: ctx.createBiquadFilter(), hp: ctx.createBiquadFilter(), vol: ctx.createGain(), reverb: ctx.createGain(), echo: ctx.createGain(), space: ctx.createGain(), active: false };
    a.lp.type = 'lowpass';
    a.hp.type = 'highpass';
    a.reverb.gain.value = 0;
    a.echo.gain.value = 0;
    a.space.gain.value = 0;
    b.pre.disconnect(b.duck);
    b.pre.connect(a.lp).connect(a.hp).connect(a.vol).connect(b.duck);
    b.duck.connect(a.reverb).connect(rs.hall.in);
    b.duck.connect(a.echo).connect(rs.echo.in);
    b.duck.connect(a.space).connect(rs.space.in);
    if (lastMasterProject) applyReturns(lastMasterProject);
    b.auto = a;
    autoNeutral(a, ctx.currentTime);
    return a;
  }
  const AUTO_Q = (res) => 0.7 + res * 11;
  /** Valeurs des nœuds pour un jeu de valeurs d'automation. */
  function autoTargets(v) {
    const f = SS.autoFilterHz(v.filter);
    const nyq = ctx.sampleRate / 2 - 100;
    return { lp: Math.min(nyq, f.lp), hp: f.hp, q: AUTO_Q(v.res), vol: v.volume, reverb: v.reverb, echo: v.echo, space: v.space };
  }
  function autoNeutral(a, at) {
    const d = Object.fromEntries(SS.AUTO_PARAMS.map((P) => [P.id, P.def]));
    const x = autoTargets(d);
    for (const [node, val] of [[a.lp.frequency, x.lp], [a.hp.frequency, x.hp], [a.lp.Q, x.q], [a.hp.Q, x.q], [a.vol.gain, x.vol], [a.reverb.gain, x.reverb], [a.echo.gain, x.echo], [a.space.gain, x.space]]) {
      node.cancelScheduledValues(at);
      node.setValueAtTime(val, at);
    }
    a.active = false;
  }
  /**
   * Programme l'automation d'une piste pour un pas : valeur au début du pas, puis rampe jusqu'à la valeur
   * du pas suivant (fréquences : rampe exponentielle, à l'oreille). `time` = instant nominal du pas (sans swing).
   */
  function scheduleAuto(project, track, tick, time, sd) {
    const lanes = track.auto;
    let b = buses.get(track.id);
    if (!lanes) {
      if (b && b.auto && b.auto.active) autoNeutral(b.auto, time);
      return;
    }
    if (!b) {
      bus(track);
      b = buses.get(track.id);
    }
    const a = autoNodes(b);
    const len = SS.autoLen(project, track); // l'automation boucle sur sa propre longueur
    const step = tick % len;
    const at = (s) => Object.fromEntries(SS.AUTO_PARAMS.map((P) => [P.id, SS.autoValue(lanes[P.id], s, len) ?? P.def]));
    const x0 = autoTargets(at(step));
    const x1 = step + 1 < len ? autoTargets(at(step + 1)) : x0; // fin de boucle : la valeur repart du début au tour suivant
    const t1 = time + sd;
    const lin = (param, v0, v1) => {
      param.setValueAtTime(v0, time);
      if (v1 !== v0) param.linearRampToValueAtTime(v1, t1);
    };
    const exp = (param, v0, v1) => {
      param.setValueAtTime(v0, time);
      if (v1 !== v0) param.exponentialRampToValueAtTime(v1, t1);
    };
    exp(a.lp.frequency, x0.lp, x1.lp);
    exp(a.hp.frequency, x0.hp, x1.hp);
    lin(a.lp.Q, x0.q, x1.q);
    lin(a.hp.Q, x0.q, x1.q);
    lin(a.vol.gain, x0.vol, x1.vol);
    lin(a.reverb.gain, x0.reverb, x1.reverb);
    lin(a.echo.gain, x0.echo, x1.echo);
    lin(a.space.gain, x0.space, x1.space);
    a.active = true;
  }
  /** Arrêt : toutes les automations reviennent au neutre (écoute d'une piste, essais de son). */
  function resetAutos() {
    if (!ctx) return;
    for (const b of buses.values()) if (b.auto) autoNeutral(b.auto, ctx.currentTime);
  }
  /** Lecture seule, pour les tests : valeurs actuelles des nœuds d'automation d'une piste. */
  function autoState(track) {
    const b = buses.get(track.id);
    if (!b || !b.auto) return null;
    const a = b.auto;
    return { lp: a.lp.frequency.value, hp: a.hp.frequency.value, q: a.lp.Q.value, vol: a.vol.gain.value, reverb: a.reverb.gain.value, echo: a.echo.gain.value, space: a.space.gain.value };
  }

  /* ---------------- Bus d'effets partagés (retours) ---------------- */

  /** Une reverb partagée : envoi -> pré-délai -> passe-haut -> convolution -> passe-bas -> retour -> master. */
  function buildReturnReverb() {
    const r = { in: ctx.createGain(), pre: ctx.createDelay(0.25), hp: ctx.createBiquadFilter(), conv: ctx.createConvolver(), lp: ctx.createBiquadFilter(), out: ctx.createGain(), key: '' };
    r.hp.type = 'highpass';
    r.lp.type = 'lowpass';
    r.in.connect(r.pre).connect(r.hp).connect(r.conv).connect(r.lp).connect(r.out).connect(master);
    return r;
  }
  /**
   * L'écho partagé, façon délai à bande : ping-pong stéréo (gauche puis droite), répétitions de plus en plus
   * sombres, saturées dans la boucle (la réinjection peut aller jusqu'à 100 % sans s'emballer) et vitesse de
   * la bande qui fluctue (wow lent + flutter rapide, qui module les retards).
   */
  function buildReturnEcho() {
    const e = { in: ctx.createGain(), hp: ctx.createBiquadFilter(), dL: ctx.createDelay(3), dR: ctx.createDelay(3), fb: ctx.createGain(), tone: ctx.createBiquadFilter(), sat: ctx.createWaveShaper(), merge: ctx.createChannelMerger(2), out: ctx.createGain(), key: '' };
    e.hp.type = 'highpass';
    e.tone.type = 'lowpass';
    // entrée (mono) -> gauche -> droite -> filtre -> saturation -> feedback -> gauche…
    e.in.connect(e.hp).connect(e.dL);
    e.dL.connect(e.dR);
    e.dR.connect(e.tone).connect(e.sat).connect(e.fb).connect(e.dL);
    // wow (0,55 Hz) et flutter (6,3 Hz) : légères variations du retard, donc de la hauteur des répétitions
    e.wow = ctx.createOscillator();
    e.flutter = ctx.createOscillator();
    e.wow.frequency.value = 0.55;
    e.flutter.frequency.value = 6.3;
    e.wowGain = ctx.createGain();
    e.flutterGain = ctx.createGain();
    e.wowGain.gain.value = 0;
    e.flutterGain.gain.value = 0;
    e.wow.connect(e.wowGain);
    e.flutter.connect(e.flutterGain);
    [e.wowGain, e.flutterGain].forEach((g) => {
      g.connect(e.dL.delayTime);
      g.connect(e.dR.delayTime);
    });
    e.wow.start();
    e.flutter.start();
    e.dL.connect(e.merge, 0, 0);
    e.dR.connect(e.merge, 0, 1);
    e.merge.connect(e.out).connect(master);
    return e;
  }
  /** Courbe de saturation de la bande : linéaire au centre, plafonnée (gain 1 à bas niveau). */
  function tapeCurve(drive) {
    const g = 1 + 5 * drive;
    const c = new Float32Array(1025);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1; // entrée du WaveShaper : −1 … 1
      c[i] = Math.tanh(g * x) / g;
    }
    return c;
  }
  /**
   * « Cosmos » : reverb algorithmique longue (js/space-dsp.js), avec gel et shimmer.
   * envoi -> pré-délai -> reverb (AudioWorklet, branchée dès que le module est chargé) -> passe-haut -> passe-bas -> retour.
   */
  function buildReturnSpace() {
    const r = { in: ctx.createGain(), pre: ctx.createDelay(0.5), node: null, hp: ctx.createBiquadFilter(), lp: ctx.createBiquadFilter(), out: ctx.createGain() };
    r.hp.type = 'highpass';
    r.lp.type = 'lowpass';
    r.in.connect(r.pre);
    r.hp.connect(r.lp).connect(r.out).connect(master);
    if (SS.space) {
      const own = ctx;
      SS.space
        .load(own)
        .then(() => {
          if (ctx !== own || r.node) return;
          r.node = SS.space.create(own);
          r.pre.connect(r.node).connect(r.hp);
          if (lastMasterProject) applyReturns(lastMasterProject);
        })
        .catch(() => {});
    }
    return r;
  }
  function ensureReturns() {
    if (!returns) returns = { plate: buildReturnReverb(), hall: buildReturnReverb(), echo: buildReturnEcho(), space: buildReturnSpace() };
    return returns;
  }
  /** Règle les bus partagés du projet (durées, filtres, temps de l'écho selon le tempo). */
  function applyReturns(project) {
    if (!ctx || !returns) return;
    const rp = SS.returnParams(project);
    const now = ctx.currentTime;
    const ramp = (param, v) => param.setTargetAtTime(v, now, 0.03);
    for (const k of ['plate', 'hall']) {
      const r = returns[k];
      const p = rp[k];
      ramp(r.pre.delayTime, p.predelay);
      ramp(r.hp.frequency, p.hp);
      ramp(r.lp.frequency, p.lp);
      ramp(r.out.gain, 2.2 * p.level); // compense le niveau de l'IR filtrée
      const key = p.size.toFixed(2);
      if (r.key !== key) {
        r.conv.buffer = impulse(p.size, 20000);
        r.key = key;
      }
    }
    const e = returns.echo;
    const p = rp.echo;
    const t = SS.delaySeconds({ delayTime: p.time }, project.tempo);
    ramp(e.dL.delayTime, t);
    ramp(e.dR.delayTime, t);
    ramp(e.fb.gain, Math.min(0.9, p.feedback));
    ramp(e.hp.frequency, p.hp);
    ramp(e.tone.frequency, p.lp);
    ramp(e.out.gain, p.level);
    ramp(e.wowGain.gain, p.wow * Math.min(0.006, t * 0.02)); // jusqu'à ±6 ms
    ramp(e.flutterGain.gain, p.wow * 0.0004);
    const key = p.drive.toFixed(2);
    if (e.key !== key) {
      e.sat.curve = tapeCurve(p.drive);
      e.key = key;
    }
    // Cosmos
    const sp = returns.space;
    const q = rp.space;
    ramp(sp.pre.delayTime, q.predelay);
    ramp(sp.hp.frequency, q.hp);
    ramp(sp.lp.frequency, q.lp);
    ramp(sp.out.gain, 1.6 * q.level);
    if (sp.node) {
      const P = (n) => sp.node.parameters.get(n);
      P('decay').setValueAtTime(q.decay, now);
      P('size').setValueAtTime(q.size, now);
      P('damp').setValueAtTime(q.damp, now);
      P('mod').setValueAtTime(q.mod, now);
      P('shimmer').setValueAtTime(q.shimmer, now);
      P('freeze').setValueAtTime(q.freeze ? 1 : 0, now);
    }
  }

  /** Applique les réglages de console d'une piste (EQ, comp, limiteur, panoramique). */
  function applyMix(track) {
    if (!ctx || !track || !track.id) return;
    const b = buses.get(track.id);
    if (!b) return;
    const m = SS.mixParams(track);
    applyStrip(b.strip, m);
    b.pan.pan.setTargetAtTime(m.pan, ctx.currentTime, 0.015);
  }

  /** Tranche Master : fader + EQ / comp / limiteur, puis mastering. */
  function applyMaster(project) {
    if (!ctx) {
      pendingMaster = project;
      return;
    }
    const mp = SS.masterParams(project);
    applyMasterEffects(mp.effects);
    applyStrip(masterStrip, mp.mix);
    masterFader.gain.setTargetAtTime(mp.volume, ctx.currentTime, 0.015);
    applyMastering(project);
    applyReturns(project);
  }
  function applyMastering(project) {
    lastMasterProject = project;
    if (!masterProc) return;
    const m = SS.masterParams(project).mastering;
    const P = (n) => masterProc.parameters.get(n);
    const now = ctx.currentTime;
    P('active').setValueAtTime(m.on ? 1 : 0, now);
    P('drive').setTargetAtTime(m.drive, now, 0.02);
    P('ceiling').setValueAtTime(m.ceiling, now);
    P('width').setTargetAtTime(m.width, now, 0.02);
    P('mono').setValueAtTime(m.mono, now);
    P('release').setValueAtTime(m.release, now);
    P('clip').setValueAtTime(m.clip, now);
  }

  /** Effets créatifs avant l'EQ, la compression et les limiteurs du Master. */
  function applyMasterEffects(value) {
    const e = SS.cleanMasterEffects(value);
    if (!masterEffects && !e.on) return; // anciens projets : trajet audio inchangé
    if (!masterEffects) {
      const stage = (input, effect) => {
        const dry = ctx.createGain(), wet = ctx.createGain(), out = ctx.createGain();
        dry.gain.value = 1; wet.gain.value = 0;
        input.connect(dry).connect(out);
        input.connect(effect.input || effect);
        (effect.output || effect).connect(wet).connect(out);
        return { dry, wet, out };
      };
      const sat = ctx.createWaveShaper();
      sat.oversample = '4x';
      const curve = new Float32Array(8193);
      for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(2 * x) / 2; }
      sat.curve = curve;
      const saturation = stage(master, sat);
      const chorusBus = { input: ctx.createGain(), pre: ctx.createGain() };
      buildChorus(chorusBus);
      chorusBus.chorus.dry.gain.value = 0;
      chorusBus.chorus.wet.gain.value = 1;
      chorusBus.chorus.lfo.frequency.value = 0.35;
      chorusBus.chorus.modL.gain.value = 0.0015;
      chorusBus.chorus.modR.gain.value = -0.0015;
      const chorus = stage(saturation.out, { input: chorusBus.input, output: chorusBus.pre });
      const highpass = ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 180;
      const conv = ctx.createConvolver(); conv.buffer = impulse(0.7, 5500);
      highpass.connect(conv);
      const reverb = stage(chorus.out, { input: highpass, output: conv });
      reverb.impulse = conv;
      master.disconnect(masterStrip.entry);
      reverb.out.connect(masterStrip.entry);
      masterEffects = { saturation, chorus, reverb };
    }
    for (const [name, stage] of Object.entries(masterEffects)) {
      const amount = e.on && e[name].on ? (name === 'saturation' ? e[name].amount : e[name].mix) : 0;
      stage.wet.gain.setTargetAtTime(amount, ctx.currentTime, 0.02);
      stage.dry.gain.setTargetAtTime(1 - amount, ctx.currentTime, 0.02);
    }
  }
  /** Remet à zéro la mesure du volume intégré (au lancement de la lecture). */
  function resetLoudness() {
    if (masterProc) masterProc.port.postMessage('reset');
    loudness = null;
  }

  /** Niveaux pour la console : { peak, rms, gr: {comp, lim} } en linéaire / dB. */
  function levels(id) {
    if (!ctx) return null;
    if (id === '__master') {
      const l = readMeter(masterMeter);
      return { ...l, gr: { comp: masterStrip.comp.reduction, lim: masterStrip.lim.reduction }, loudness };
    }
    const b = buses.get(id);
    if (!b) return null;
    const l = readMeter(b.meter);
    return { ...l, gr: { comp: b.strip.comp.reduction, lim: b.strip.lim.reduction } };
  }
  /**
   * Points d'écoute de l'Auto Mix (js/automix-listen.js) : la sortie de chaque piste (après le sidechain, avant
   * les envois), le Master avant le mastering (après la tranche et le fader) et la sortie finale.
   */
  function taps() {
    if (!ctx) return null;
    const tracks = new Map();
    const inputs = new Map(); // entrée de la tranche (avant égaliseur, compresseur et fader) : crête et dynamique du son
    buses.forEach((b, id) => {
      tracks.set(id, b.duck);
      inputs.set(id, b.strip.entry);
    });
    return { ctx, tracks, inputs, pre: masterFader, post: masterProc || masterFader };
  }
  function setTrackGain(track, value) {
    if (!ctx) return;
    bus(track);
    buses.get(track.id).input.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
  }
  function removeTrack(id) {
    const b = buses.get(id);
    if (b) {
      b.strip.out.disconnect();
      b.input.disconnect();
      b.pre.disconnect();
      if (b.chorus) b.chorus.lfo.stop();
      if (b.delay) b.delay.tone.disconnect(); // coupe la boucle de feedback
      if (b.reverb) b.reverb.out.disconnect();
      if (b.sends) Object.values(b.sends).forEach((g) => g.disconnect());
      if (b.auto) [b.auto.vol, b.auto.reverb, b.auto.echo, b.auto.space].forEach((g) => g.disconnect());
    }
    buses.delete(id);
    glides.delete(id);
    if (SS.juno) SS.juno.remove(id);
  }

  /* ---- Chorus : deux lignes à retard modulées en opposition (gauche / droite) ---- */
  function buildChorus(b) {
    const c = {};
    c.dry = ctx.createGain();
    c.wet = ctx.createGain();
    c.dL = ctx.createDelay(0.05);
    c.dR = ctx.createDelay(0.05);
    c.dL.delayTime.value = c.dR.delayTime.value = 0.02;
    c.merge = ctx.createChannelMerger(2);
    c.lfo = ctx.createOscillator();
    c.lfo.type = 'sine';
    c.modL = ctx.createGain();
    c.modR = ctx.createGain();
    c.lfo.connect(c.modL).connect(c.dL.delayTime);
    c.lfo.connect(c.modR).connect(c.dR.delayTime);
    c.lfo.start();
    b.input.disconnect();
    b.input.connect(c.dry).connect(b.pre);
    b.input.connect(c.dL).connect(c.merge, 0, 0);
    b.input.connect(c.dR).connect(c.merge, 0, 1);
    c.merge.connect(c.wet).connect(b.pre);
    b.chorus = c;
  }

  /* ---- Delay : écho synchronisé au tempo, feedback adouci par un filtre ---- */
  function buildDelay(b) {
    const d = {};
    d.send = ctx.createGain();
    d.node = ctx.createDelay(3);
    d.fb = ctx.createGain();
    d.tone = ctx.createBiquadFilter();
    d.tone.type = 'lowpass';
    d.tone.frequency.value = 5000;
    b.duck.connect(d.send).connect(d.node);
    d.node.connect(d.tone).connect(d.fb).connect(d.node);
    d.tone.connect(master);
    b.delay = d;
  }

  /* ---- Reverb : réponse impulsionnelle générée (bruit à décroissance exponentielle, filtré) ---- */
  const irCache = new Map();
  function impulse(size, lp) {
    const key = size.toFixed(2) + ':' + Math.round(lp);
    if (irCache.has(key)) return irCache.get(key);
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * size));
    const buf = ctx.createBuffer(2, len, rate);
    const a = Math.exp((-2 * Math.PI * lp) / rate); // filtre passe-bas à un pôle (amortissement)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 2.2) * Math.exp((-3 * i) / len);
        y = (1 - a) * (Math.random() * 2 - 1) + a * y;
        data[i] = y * env;
      }
    }
    if (irCache.size > 24) irCache.clear();
    irCache.set(key, buf);
    return buf;
  }
  function buildReverb(b) {
    const r = {};
    r.send = ctx.createGain();
    r.conv = ctx.createConvolver();
    r.out = ctx.createGain();
    r.out.gain.value = 2.2; // compense le niveau de l'IR filtrée
    b.duck.connect(r.send).connect(r.conv).connect(r.out).connect(master);
    b.reverb = r;
  }

  /** Applique (en douceur) les réglages d'effets d'une piste. */
  function applyFx(track) {
    if (!ctx || !track || !track.id) return;
    const b = buses.get(track.id);
    if (!b) return;
    const f = SS.fxParams(track);
    const now = ctx.currentTime;
    const ramp = (param, v) => param.setTargetAtTime(v, now, 0.03);

    if (f.chorus > 0 || b.chorus) {
      if (!b.chorus) buildChorus(b);
      const c = b.chorus;
      ramp(c.wet.gain, f.chorus);
      ramp(c.dry.gain, 1 - f.chorus * 0.45);
      ramp(c.lfo.frequency, f.chorusRate);
      const depth = 0.0005 + f.chorusDepth * 0.0075; // jusqu'à ±8 ms
      ramp(c.modL.gain, depth);
      ramp(c.modR.gain, -depth);
    }
    if (f.delay > 0 || b.delay) {
      if (!b.delay) buildDelay(b);
      ramp(b.delay.send.gain, f.delay);
      ramp(b.delay.fb.gain, Math.min(0.92, f.delayFeedback));
      ramp(b.delay.node.delayTime, SS.delaySeconds(f, currentTempo));
    }
    // envois vers les bus partagés (post-fader, après le sidechain)
    for (const [key, name] of [['sendPlate', 'plate'], ['sendHall', 'hall'], ['sendEcho', 'echo'], ['sendSpace', 'space']]) {
      if (!(f[key] > 0) && !(b.sends && b.sends[name])) continue;
      const rs = ensureReturns();
      if (!b.sends) b.sends = {};
      if (!b.sends[name]) {
        b.sends[name] = ctx.createGain();
        b.duck.connect(b.sends[name]).connect(rs[name].in);
        if (lastMasterProject) applyReturns(lastMasterProject);
      }
      ramp(b.sends[name].gain, f[key] || 0);
    }
    if (f.room > 0 || b.reverb) {
      if (!b.reverb) buildReverb(b);
      const r = b.reverb;
      ramp(r.send.gain, f.room);
      const key = f.roomSize.toFixed(2) + ':' + Math.round(f.roomLp);
      if (f.room > 0 && r.key !== key) {
        r.conv.buffer = impulse(f.roomSize, f.roomLp);
        r.key = key;
      }
    }
  }

  /** Recalcule les effets de toutes les pistes (ex. temps du delay après un changement de tempo). */
  function applyAllFx(project) {
    currentTempo = project.tempo;
    applyMaster(project);
    if (!ctx) return;
    project.tracks.forEach((t) => {
      if (buses.has(t.id)) {
        applyFx(t);
        applyMix(t);
      }
    });
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
    if (SS.juno) SS.juno.allOff();
    const now = ctx.currentTime;
    // les pistes « sidechainées » reviennent à plein volume
    buses.forEach((b) => {
      b.duck.gain.cancelScheduledValues(now);
      b.duck.gain.setValueAtTime(1, now);
    });
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
    glides.clear();
  }

  const velGain = (v) => Math.pow(Math.max(0, Math.min(1, v)), 1.4);

  async function playDrum(track, time, vel, dest) {
    const url = await drumUrl(track);
    if (!url) return;
    const entry = loadBuffer(url);
    if (!entry.buffer) return; // pas encore chargé : on saute ce coup
    const src = ctx.createBufferSource();
    src.buffer = entry.buffer;
    if (entry.detune) src.detune.value = entry.detune;
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

    // VCF : biquad 12 dB, 24 dB, ladder ou SEM (js/filters.js)
    const flt = SS.filters.create(ctx, p);
    const base = Math.max(20, Math.min(20000, p.cutoff));
    const fr = Math.max(0.01, p.frelease ?? p.release);
    const fa = Math.max(0.003, p.fattack ?? p.attack);
    const fRelease = (param, at) => param.setTargetAtTime(base, at, fr / 4);
    flt.freqs.forEach((param) => {
      if (p.env > 0) {
        // enveloppe propre au filtre (lpattack / lpdecay / lpsustain / lprelease)
        const fd = Math.max(0.005, p.fdecay ?? p.decay);
        const fs = Math.max(0, Math.min(1, p.fsustain ?? p.sustain));
        const top = Math.min(20000, base * Math.pow(2, p.env * (0.4 + 0.6 * vel)));
        param.setValueAtTime(base, t);
        param.exponentialRampToValueAtTime(top, t + fa);
        param.setTargetAtTime(base * Math.pow(top / base, fs), t + fa, fd / 3);
        fRelease(param, Math.max(tOff, t + fa));
      } else {
        param.setValueAtTime(base, t);
      }
    });

    // saturation
    let last = flt.output;
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

    // LFO vers le volume (trémolo) : gain après le VCA ; LFO vers le pan : panoramique toujours présent
    const lfos = SS.activeLfos ? SS.activeLfos(p) : [];
    let tail = amp;
    let trem = null;
    if (lfos.some((l) => l.dest === 'amp')) {
      trem = ctx.createGain();
      amp.connect(trem);
      tail = trem;
    }

    // panoramique
    let panParam = null;
    if ((p.pan || lfos.some((l) => l.dest === 'pan')) && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, p.pan || 0));
      panParam = pan.pan;
      tail.connect(pan).connect(dest);
    } else tail.connect(dest);

    const chain = {
      input: flt.input,
      amp,
      flt,
      trem,
      panParam,
      lfos,
      t,
      hooks: [], // fonctions (newEnd, oldEnd) appelées quand une note legato prolonge la voix
      tOff,
      end: tOff + release * 1.5 + 0.05,
      /**
       * Legato : la note continue jusqu'à `newOff` sans redéclencher les enveloppes.
       * On retire le relâchement prévu (amplitude et filtre) et on le reprogramme plus loin.
       */
      extend(newOff) {
        const oldOff = chain.tOff;
        const oldFOff = Math.max(oldOff, t + fa);
        amp.gain.cancelScheduledValues(oldOff);
        amp.gain.setTargetAtTime(0, newOff, release / 4);
        if (p.env > 0)
          flt.freqs.forEach((param) => {
            param.cancelScheduledValues(oldFOff);
            fRelease(param, Math.max(newOff, t + fa));
          });
        chain.tOff = newOff;
        const oldEnd = chain.end;
        chain.end = newOff + release * 1.5 + 0.05;
        chain.hooks.forEach((h) => h(chain.end, oldEnd));
        return chain.end;
      },
    };
    return chain;
  }

  /*
   * Glide / portamento. Le glissement passe par le paramètre `detune` (en cents) des oscillateurs
   * et des lecteurs d'échantillons : la courbe est exponentielle en hauteur, comme le circuit RC
   * du glide d'un Moog (≈ 98 % du chemin parcouru au bout du temps réglé).
   *  - Portamento : chaque nouvelle note part de la hauteur de la précédente.
   *  - Glide legato : seulement si la note précédente est encore tenue (notes liées) ; la voix
   *    existante change de hauteur, sans nouvelle attaque.
   * Mémoire par piste : notes et voix du dernier événement (une par note d'accord).
   */
  const glides = new Map();
  const LEGATO_GAP = 0.035; // écart toléré entre deux notes « liées » (s)

  /** Fait glisser la voix vers `midi` à partir de `t` ; `from` : hauteur de départ d'une nouvelle voix. */
  function glideTo(voice, midi, t, time, from = null) {
    const tc = Math.max(0.001, time / 4);
    voice.detunes.forEach(({ param, offset }) => {
      param.cancelScheduledValues(t);
      if (from != null) param.setValueAtTime(offset + (from - voice.baseMidi) * 100, t);
      param.setTargetAtTime(offset + (midi - voice.baseMidi) * 100, t, tc);
    });
    // retards du PWM : proportionnels à la période, ils suivent la hauteur
    (voice.follow || []).forEach(({ param, base }) => {
      param.cancelScheduledValues(t);
      if (from != null) param.setValueAtTime(base * Math.pow(2, -(from - voice.baseMidi) / 12), t);
      param.setTargetAtTime(base * Math.pow(2, -(midi - voice.baseMidi) / 12), t, tc);
    });
  }

  /** Prépare une note : renvoie { from } (hauteur de départ) ou { legato: voix } si la voix précédente continue. */
  function glidePlan(track, p, midi, t, idx, count) {
    if (!(p.glide > 0)) return null;
    const key = track.id || '__preview';
    let g = glides.get(key);
    if (!g) glides.set(key, (g = { prev: { notes: [], voices: [] }, cur: { notes: [], voices: [] } }));
    if (idx === 0) {
      g.prev = g.cur;
      g.cur = { notes: [], voices: [] };
    }
    const prev = g.prev;
    const j = Math.min(idx, prev.notes.length - 1);
    if (j < 0) return { g, from: null };
    const pv = prev.voices[j];
    const held = pv && pv.chain.tOff >= t - LEGATO_GAP && pv.chain.tOff > ctx.currentTime + 0.005 && pv.alive;
    if (p.glideMode === 'legato') {
      // un seul glissement par voix tenue ; une note isolée repart sans glide
      if (held && count === 1) return { g, legato: pv };
      return { g, from: held ? prev.notes[j] : null };
    }
    return { g, from: prev.notes[j] };
  }

  function glideRemember(plan, idx, midi, voice) {
    if (!plan) return;
    plan.g.cur.notes[idx] = midi;
    plan.g.cur.voices[idx] = voice;
  }

  /** Applique le plan : true si la note a été jouée en legato par la voix précédente. */
  function glideLegato(plan, p, idx, midi, t, dur) {
    if (!plan || !plan.legato) return false;
    const v = plan.legato;
    glideTo(v, midi, t, p.glide);
    const end = v.chain.extend(t + dur);
    v.sources.forEach((src) => src.stop(end));
    glideRemember(plan, idx, midi, v);
    return true;
  }

  /** Démarre le glissement d'une nouvelle voix depuis plan.from. */
  function glideStart(plan, p, voice, idx, midi, t) {
    if (!plan) return;
    if (plan.from != null && plan.from !== midi) glideTo(voice, midi, t, p.glide, plan.from);
    glideRemember(plan, idx, midi, voice);
  }

  function trackVoice(sources, chain, baseMidi, detunes) {
    const v = { sources, chain, baseMidi, detunes, alive: true };
    sources[0].addEventListener('ended', () => (v.alive = false));
    return v;
  }

  /** Voix échantillonnée ; `baseMidi` = note jouée (référence du glide). */
  function sampleVoice(p, buffer, rate, time, dur, vel, dest, loop, baseMidi) {
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
    const mods = applyLfos(p, chain, { pitch: src.detune ? [src.detune] : [], pw: [] });
    register([src, ...mods], chain.amp);
    return trackVoice([src], chain, baseMidi, src.detune ? [{ param: src.detune, offset: 0 }] : []);
  }

  const noiseBuffers = {};
  function noiseBuffer(kind) {
    if (noiseBuffers[kind]) return noiseBuffers[kind];
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        // filtre de Paul Kellet (approximation économique)
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w * 0.5;
    }
    noiseBuffers[kind] = buf;
    return buf;
  }

  /*
   * Horloge musicale des LFO calés sur le tempo (js/modulation.js) : nombre de noires écoulées depuis Lecture,
   * mis à jour à chaque pas programmé (suit les changements de tempo). Hors lecture (écoute d'un son), l'horloge
   * part de 0 au tempo du projet.
   */
  let lfoClock = null;
  function clockReset(project, time, quarter) {
    lfoClock = SS.lfoClock ? SS.lfoClock(project.tempo, SS.stepsPerBar(project) / 4, time, quarter) : null;
  }
  function clockAdvance(project, time) {
    if (!lfoClock) return clockReset(project, time, 0);
    lfoClock.quarter += ((time - lfoClock.time) * lfoClock.tempo) / 60;
    lfoClock.time = time;
    lfoClock.tempo = project.tempo;
    lfoClock.quarterBar = SS.stepsPerBar(project) / 4;
  }
  function currentClock() {
    if (seq.playing && lfoClock) return lfoClock;
    const project = seq.getProject ? seq.getProject() : null;
    return SS.lfoClock(project ? project.tempo : 120, project ? SS.stepsPerBar(project) / 4 : 4, 0, 0);
  }

  /**
   * Branche les LFO actifs d'une voix (p.lfo1…, p.lfo2…) : une source constante par LFO, dont la valeur suit
   * une courbe calculée d'avance (phase calée sur la lecture en mode Libre, sur la note en mode Retrig), puis
   * un gain par destination. `targets` : { pitch: [AudioParam en cents], pw: [{ param, period }] }.
   * Renvoie les sources créées (à arrêter avec la voix).
   */
  function applyLfos(p, chain, targets) {
    const lfos = chain.lfos || [];
    if (!lfos.length) return [];
    const clock = currentClock();
    const tOn = chain.t;
    const sources = [];
    lfos.forEach((lfo) => {
      const dests = [];
      const amt = lfo.amt;
      if (lfo.dest === 'pitch') targets.pitch.forEach((param) => dests.push([param, amt * 1200]));
      else if (lfo.dest === 'cutoff') (chain.flt.detunes || []).forEach((param) => dests.push([param, amt * 4800]));
      else if (lfo.dest === 'pw') targets.pw.forEach(({ param, period }) => dests.push([param, amt * 0.45 * period]));
      else if (lfo.dest === 'amp' && chain.trem) {
        // trémolo entre 1 − |quantité| et 1
        chain.trem.gain.value = 1 - Math.abs(amt) / 2;
        dests.push([chain.trem.gain, amt / 2]);
      } else if (lfo.dest === 'pan' && chain.panParam) dests.push([chain.panParam, amt]);
      if (!dests.length) return;
      const seed = SS.lfoSeed(p._track, lfo.index);
      const src = ctx.createConstantSource();
      src.offset.value = 0;
      const curve = (a, b) => SS.lfoCurve(lfo, a, b, tOn, clock, seed);
      try {
        src.offset.setValueCurveAtTime(curve(tOn, chain.end), tOn, chain.end - tOn);
      } catch (e) {
        return;
      }
      dests.forEach(([param, depth]) => {
        const g = ctx.createGain();
        g.gain.value = depth;
        src.connect(g).connect(param);
      });
      src.start(tOn);
      src.stop(chain.end);
      // note legato : la voix dure plus longtemps, la courbe continue sans saut (même horloge)
      chain.hooks.push((end, oldEnd) => {
        if (end <= oldEnd) return;
        const from = oldEnd + 0.002;
        try {
          src.offset.setValueCurveAtTime(curve(from, end), from, end - from);
        } catch (e) {
          /* courbe déjà dépassée : la valeur reste au dernier point */
        }
        src.stop(end);
      });
      sources.push(src);
    });
    return sources;
  }

  function synthVoice(p, midi, time, dur, vel, dest) {
    const t = Math.max(time, ctx.currentTime);
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const chain = voiceChain(p, t, dur, vel, dest, 0.35);
    // mixeur : générateur de bruit (blanc, rose ou brun), ajouté à l'oscillateur ; il n'a pas de hauteur
    const sources = [];
    if (p.noise > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(SS.NOISES.includes(p.noiseColor) ? p.noiseColor : 'white');
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = Math.min(1, p.noise) * 1.4;
      src.connect(g).connect(chain.input);
      src.start(t, Math.random() * 1.5);
      src.stop(chain.end);
      sources.push(src);
    }
    const oscLevel = Math.max(0, Math.min(1, p.osc ?? 1));
    const type = p.wave === 'supersaw' ? 'sawtooth' : p.wave || 'sawtooth';
    const n = Math.max(1, Math.round(p.wave === 'supersaw' ? Math.max(3, p.voices || 5) : p.voices || 1));
    const detune = p.wave === 'supersaw' ? Math.max(8, p.detune || 0) : p.detune || 0;
    const oscs = [];
    const detunes = [];
    const pws = []; // retards du PWM : { param, base, period }
    const pulse = p.wave === 'pulse';
    const width = Math.max(0.02, Math.min(0.98, p.pw ?? 0.5));
    // oscillateur coupé dans le mixeur : pas d'oscillateurs (sauf s'il ne reste aucune source, pour garder une voix valide)
    const nOsc = oscLevel > 0 || (!sources.length && !(p.sub > 0)) ? n : 0;
    for (let i = 0; i < nOsc; i++) {
      const o = ctx.createOscillator();
      o.type = pulse ? 'sawtooth' : type;
      o.frequency.value = freq;
      const offset = n > 1 ? ((i / (n - 1)) * 2 - 1) * detune : 0;
      o.detune.value = offset;
      detunes.push({ param: o.detune, offset });
      const og = ctx.createGain();
      og.gain.value = oscLevel / Math.sqrt(n);
      o.connect(og);
      if (pulse) {
        /*
         * Onde Pulse : différence de deux dents de scie décalées de `width` période (saw(t) − saw(t − w·T)).
         * Les dents de scie natives sont à bande limitée : l'impulsion l'est aussi (pas de repliement), sa
         * moyenne est nulle quelle que soit la largeur, et moduler le retard module la largeur (PWM).
         */
        const period = 1 / (freq * Math.pow(2, offset / 1200));
        const dl = ctx.createDelay(0.25);
        const base = width * period;
        dl.delayTime.value = base;
        const inv = ctx.createGain();
        inv.gain.value = -1;
        o.connect(dl).connect(inv).connect(og);
        pws.push({ param: dl.delayTime, base, period });
      }
      og.connect(chain.input);
      o.start(t);
      o.stop(chain.end);
      oscs.push(o);
    }
    // sous-oscillateur : carré une ou deux octaves plus bas (suit le glide et le LFO de hauteur)
    if (p.sub > 0) {
      const so = ctx.createOscillator();
      so.type = 'square';
      so.frequency.value = freq / ((p.subOct || 1) >= 2 ? 4 : 2);
      const sg = ctx.createGain();
      sg.gain.value = Math.min(1, p.sub) * 0.75;
      so.connect(sg).connect(chain.input);
      so.start(t);
      so.stop(chain.end);
      oscs.push(so);
      detunes.push({ param: so.detune, offset: 0 });
    }
    const mods = applyLfos(p, chain, { pitch: oscs.map((o) => o.detune), pw: pws });
    register([...oscs, ...sources, ...mods], chain.amp);
    const v = trackVoice([...oscs, ...sources], chain, midi, detunes);
    v.follow = pws.map(({ param, base }) => ({ param, base }));
    return v;
  }

  /** Base d'URL de Dirt-Samples (lue dans strudel.json). */
  async function dirtUrl(file) {
    const json = await loadJSON(SS.SOURCES.dirt);
    return json._base + encodePath(file);
  }

  /**
   * Joue une note. `idx` / `count` : rang de la note dans son événement et nombre de notes
   * (accords) — sert au glide, qui relie chaque note d'un accord à celle de même rang.
   */
  /** mod (facultatif) : { cutoff } — multiplicateur de la fréquence de coupure (MOTION de l'arpégiateur). */
  async function playNote(track, midi, time, dur, vel, dest, idx = 0, count = 1, mod = null) {
    ensureCtx();
    const out = dest || bus(track);
    const inst = instOf(track);
    if (inst.kind === 'analog') {
      if (mod && mod.acc) vel = SS.accentVel(vel); // Juno-106 : l'accent passe par la vélocité
      SS.juno.play({ ctx, noise: noiseBuffer, register }, track, midi, Math.max(time, ctx.currentTime), dur, vel, out);
      return;
    }
    let p = SS.soundParams(track);
    p._track = track.id || 'preview';
    // accent (ev.acc) : réglages de la note poussés ; mémoire des accents rapprochés, par piste
    if (mod && mod.acc) {
      const a = accentCharge(track, Math.max(time, ctx.currentTime), idx === 0);
      const r = SS.accentParams(p, vel, p.accent, a);
      p = r.p;
      vel = r.vel;
    }
    if (mod && mod.locks) p = SS.applyVoiceLocks(p, mod.locks); // automation du son (verrous par pas)
    if (mod && mod.cutoff && mod.cutoff !== 1) p = { ...p, cutoff: Math.max(30, Math.min(20000, p.cutoff * mod.cutoff)) };
    // ce qui suit doit rester synchrone jusqu'au glide (ordre des notes) : on résout d'abord la source
    let src = null; // { buffer, rate, loop }
    if (inst.kind === 'sf') {
      const entry = loadSoundfont(SS.sfFile(inst, track));
      if (!entry.zones || !entry.zones.length) return;
      const zone =
        entry.zones.find((z) => midi >= z.low && midi <= z.high) ||
        entry.zones.reduce((b, z) => (Math.abs((z.low + z.high) / 2 - midi) < Math.abs((b.low + b.high) / 2 - midi) ? z : b));
      src = {
        buffer: zone.buffer,
        rate: Math.pow(2, (100 * midi - zone.baseDetune) / 1200),
        loop: zone.loop ? { start: zone.loopStart, end: zone.loopEnd } : null,
      };
    } else if (inst.kind === 'multi') {
      const list = await multiMap(inst);
      if (!list.length) return;
      const e = nearest(list, midi);
      const entry = loadBuffer(e.url);
      if (!entry.buffer) return;
      src = { buffer: entry.buffer, rate: Math.pow(2, (midi - e.midi - (e.tune || 0)) / 12), loop: null };
    } else if (inst.kind === 'dirt') {
      const file = SS.sfFile(inst, track);
      const entry = loadBuffer(await dirtUrl(file));
      if (!entry.buffer) return;
      src = { buffer: entry.buffer, rate: Math.pow(2, (midi - SS.dirtRoot(file)) / 12), loop: null };
    } else if (inst.kind !== 'synth') return;

    if (mod?.signal?.aborted) return;
    const t = Math.max(time, ctx.currentTime);
    const plan = glidePlan(track, p, midi, t, idx, count);
    if (glideLegato(plan, p, idx, midi, t, Math.max(dur, 0.01))) return;
    const voice = src
      ? sampleVoice(p, src.buffer, src.rate, time, dur, vel, out, src.loop, midi)
      : synthVoice(p, midi, time, dur, vel, out);
    glideStart(plan, p, voice, idx, midi, t);
  }

  /*
   * Mémoire des accents (comme le condensateur d'une boîte à basse acid) : chaque accent la charge, elle se vide
   * en ~0,35 s ; plus elle est chargée, plus l'accent suivant ouvre le filtre et fait claquer la résonance.
   */
  const accentMem = new Map();
  function accentCharge(track, t, update) {
    const key = track.id || '__preview';
    const m = accentMem.get(key) || { level: 0, t };
    const level = m.level * Math.exp(-Math.max(0, t - m.t) / 0.35);
    if (update) accentMem.set(key, { level: level + (1 - level) * 0.6, t });
    return level;
  }

  /** Courte phrase de notes (démo du glide, écoute de l'arpégiateur) : [{ midi, at (s), dur (s), vel?, cutoff? }]. */
  async function playPhrase(track, notes) {
    ensureCtx();
    await prepareTrack(track);
    if (instOf(track).kind === 'multi') {
      const list = await multiMap(instOf(track)).catch(() => []);
      if (list.length) await Promise.all(notes.map((n) => loadBuffer(nearest(list, n.midi).url).promise));
    }
    const t0 = ctx.currentTime + 0.05;
    const out = track.id ? bus(track) : master;
    notes.forEach((n) => playNote(track, n.midi, t0 + n.at, n.dur, n.vel ?? 0.8, out, 0, 1, n.cutoff ? { cutoff: n.cutoff } : null));
  }

  /** Précharge les hauteurs utiles avant un aperçu synchronisé. */
  async function preparePreview(track, midi) {
    ensureCtx();
    await prepareTrack(track);
    if (midi == null && track.type !== 'drum') midi = (SS.findFamily(track.family).octave + 1) * 12;
    if (track.type !== 'drum' && instOf(track).kind === 'multi') {
      const list = await multiMap(instOf(track)).catch(() => []);
      const wanted = Array.isArray(midi) ? midi : [midi];
      if (list.length) await Promise.all(wanted.map((n) => loadBuffer(nearest(list, n).url).promise));
    }
    return midi;
  }

  /** Aperçu d'un son (dialogue, clic sur une note...). */
  async function preview(track, midi, dur = 0.45, options = {}) {
    if (options.signal?.aborted) return;
    midi = await preparePreview(track, midi);
    if (options.signal?.aborted) return;
    const t = ctx.currentTime + 0.02;
    const out = track.id ? bus(track) : master; // le bus de la piste fait entendre ses effets
    if (track.type === 'drum') playDrum(track, t, 0.9, out);
    else {
      const notes = Array.isArray(midi) ? midi : [midi];
      await Promise.all(notes.map((n, i) => playNote(track, n, t, dur, options.velocity ?? (notes.length > 1 ? 0.65 : 0.8), out, i, notes.length, { signal: options.signal, acc: !!options.acc })));
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
    // plus petit multiple commun des longueurs de piste (limité) : période après laquelle tout se réaligne
    cycle(project, total) {
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      let l = total;
      for (const t of project.tracks) {
        const n = SS.trackLen(project, t);
        l = (l * n) / gcd(l, n);
        if (l > 1e6) return 1e6;
      }
      return l;
    },
  };

  const stepDur = (project) => 60 / project.tempo / 4; // une case = une double-croche

  function audibleTracks(project) {
    const soloed = project.tracks.some((t) => t.solo);
    return project.tracks.filter((t) => !t.mute && (!soloed || t.solo));
  }

  /**
   * Muet / Solo coupent aussi le son déjà en cours (notes tenues, nappes, synthés) : la sortie de la tranche
   * (son direct et envois d'effets) passe à zéro en 10 ms, comme le bouton Mute d'une vraie console.
   * Les reverbs et échos déjà partis s'éteignent naturellement. À l'arrêt, tout est rouvert (le bouton Écouter
   * d'une piste muette reste audible).
   */
  function applyMutes(project, audible = new Set(audibleTracks(project))) {
    if (!ctx || !project) return;
    project.tracks.forEach((t) => {
      const b = buses.get(t.id);
      if (!b) return;
      const off = seq.playing && !audible.has(t);
      if (b.muted === off) return;
      b.muted = off;
      b.pre.gain.setTargetAtTime(off ? 0 : 1, ctx.currentTime, 0.01);
    });
  }

  /*
   * Sidechain : quand une piste « source » joue, les pistes qui l'écoutent baissent de volume
   * (attaque ~5 ms) puis remontent selon leur relâchement. Le déclenchement vient des notes programmées,
   * pas d'une analyse du son : c'est précis, même si la source est muette (« ghost kick »).
   */
  function duckFrom(project, source, time) {
    project.tracks.forEach((t) => {
      if (t === source || !t.fx || t.fx.scSource !== source.id) return;
      const f = SS.fxParams(t);
      if (!(f.scDepth > 0)) return;
      bus(t);
      const g = buses.get(t.id).duck.gain;
      const at = Math.max(time, ctx.currentTime);
      g.setTargetAtTime(Math.max(0.0001, 1 - f.scDepth), at, 0.005);
      g.setTargetAtTime(1, at + 0.03, Math.max(0.01, f.scRelease) / 3);
    });
  }

  /** `tick` = compteur global de pas depuis Lecture ; chaque piste boucle sur sa propre longueur. */
  const scheduling = { ticks: 0, lateSteps: 0, maxLateMs: 0, lastLateAt: null, maxTickMs: 0 };

  /**
   * Passage de la boucle d'une piste, pour les conditions de déclenchement (SS.trigOk).
   * Boucle : seq.loops compte les cycles complets depuis Lecture ; chanson : répétition du bloc en cours.
   */
  function trigAt(project, track, tick) {
    const len = SS.trackLen(project, track);
    if (seq.song) return { id: track.id, block: seq.song.index, pass: SS.trigPass(tick, len, seq.song.rep, SS.totalSteps(project)) };
    return { id: track.id, block: 0, pass: Math.floor(((seq.loops || 0) * seq.cycle(project, SS.totalSteps(project)) + tick) / len) };
  }

  function scheduleStep(project, tick, time) {
    const lateMs = (ctx.currentTime - time) * 1000;
    if (lateMs > 1) {
      scheduling.lateSteps++;
      scheduling.maxLateMs = Math.max(scheduling.maxLateMs, lateMs);
      scheduling.lastLateAt = performance.now();
    }
    const sd = stepDur(project);
    // une piste muette peut quand même déclencher un sidechain
    const audible = new Set(audibleTracks(project));
    applyMutes(project, audible);
    project.tracks.forEach((track) => {
      if (!audible.has(track)) {
        const isSource = project.tracks.some((t) => t.fx && t.fx.scSource === track.id);
        if (!isSource) return;
        const st = tick % SS.trackLen(project, track);
        const at = trigAt(project, track, tick);
        const fires =
          track.type === 'drum'
            ? track.steps[st] > 0 && SS.trigOk(SS.drumCond(track, st), { ...at, step: st })
            : (track.events || []).some((ev) => ev.step === st && SS.trigOk(ev.cond, { ...at, step: ev.step }));
        if (fires) duckFrom(project, track, time);
        return;
      }
      const step = tick % SS.trackLen(project, track);
      // humanisation : petites variations aléatoires de placement (±15 ms) et de vélocité (±25 %)
      const human = (project.groove && project.groove.human) || 0;
      // placement de la piste (track.nudge, en ms : positif = en retard, pour une caisse claire « posée »)
      const nudge = (track.nudge || 0) / 1000;
      const jt = () => nudge + (human ? (Math.random() * 2 - 1) * human * 0.015 : 0);
      const jv = (v) => (human ? Math.max(0.05, Math.min(1, v * (1 + (Math.random() * 2 - 1) * human * 0.25))) : v);
      const at = trigAt(project, track, tick);
      if (track.type === 'drum') {
        const v = track.steps[step];
        if (v > 0 && SS.trigOk(SS.drumCond(track, step), { ...at, step })) {
          const tt = time + jt();
          // ratchet : le coup est rejoué à intervalles égaux dans la durée du pas, un peu moins fort
          const r = SS.drumRatchet(track, step);
          for (let j = 0; j < r; j++) playDrum(track, tt + (j * sd) / r, jv(v) * (j ? 0.85 : 1));
          duckFrom(project, track, tt);
        }
        return;
      }
      (track.events || []).forEach((ev) => {
        // condition de déclenchement : jugée sur le passage en cours, pour toute la durée de la note ou de l'accord
        if (ev.cond && !SS.trigOk(ev.cond, { ...at, step: ev.step })) return;
        if (track.category === 'arp') {
          // ARP ONE (js/arp.js) : l'arpège joue tant que l'événement couvre ce pas
          const len = SS.trackLen(project, track);
          const notes = SS.Arp.renderStep(track.arp, ev, step, {
            loop: Math.floor(tick / len), // passage de la boucle : sert à EVOLVE (variations A / A' / B / A'')
            trackLen: len,
            stepSec: sd,
            stepsPerBeat: SS.stepsPerBeat(project),
          });
          notes.forEach((n) => {
            const t = time + n.at;
            const alen = SS.autoLen(project, track);
            const locks = SS.voiceLocks(track, (tick % alen) + n.at / sd, alen);
            // notes simultanées (mode Accord rythmique) : jouées comme un accord (glide, niveau)
            const group = notes.filter((x) => x.at === n.at);
            const gi = group.indexOf(n);
            playNote(track, n.midi, t + jt(), n.dur, jv(n.vel * (group.length > 1 ? 0.8 : 1)), undefined, gi, group.length, { cutoff: n.cutoff, locks, acc: !!ev.acc });
            if (n.first) duckFrom(project, track, t); // un arpège déclenche le sidechain au début de chaque accord
          });
        } else if (ev.step === step) {
          // une note ne dépasse pas la fin de la boucle de sa piste
          const dur = Math.min(ev.len, SS.trackLen(project, track) - ev.step) * sd * 0.98;
          // micro-décalage de la note (ev.shift, fraction de pas) : en avance ou en retard sur la grille
          const tt = time + jt() + (ev.shift || 0) * sd;
          const vv = jv(ev.vel);
          // ratchet : la note est rejouée dans son premier pas ; la dernière répétition tient le reste de la note
          const r = ev.rat || 1;
          const sub = sd / r;
          // automation du son (track.auto, réglages « voice ») : valeur au pas de la note
          const alen = SS.autoLen(project, track); // l'automation boucle sur sa propre longueur
          const locks = SS.voiceLocks(track, tick % alen, alen);
          const nmod = locks || ev.acc ? { locks, acc: !!ev.acc } : null;
          for (let j = 0; j < r; j++) {
            const d = j < r - 1 ? sub * 0.9 : Math.max(sub * 0.9, dur - j * sub);
            const v = vv * (ev.notes.length > 1 ? 0.8 : 1) * (j ? 0.85 : 1);
            ev.notes.forEach((n, i) => playNote(track, n, tt + j * sub, d, v, undefined, i, ev.notes.length, nmod));
          }
          duckFrom(project, track, tt);
        }
      });
    });
  }

  /**
   * Avance de programmation (s). Une note décalée en avance (ev.shift < 0) est programmée avec son pas,
   * avant l'heure du pas : on programme donc plus tôt, d'autant que la note la plus en avance.
   */
  function lookahead(project) {
    let early = 0;
    project.tracks.forEach((t) => {
      if (t.type === 'instrument' && t.category !== 'arp')
        (t.events || []).forEach((ev) => ev.shift < early && (early = ev.shift));
    });
    return 0.12 - early * stepDur(project);
  }

  function tick() {
    const began = performance.now();
    try { tickSequence(); } finally {
      scheduling.ticks++;
      scheduling.maxTickMs = Math.max(scheduling.maxTickMs, performance.now() - began);
    }
  }

  function tickSequence() {
    const project = seq.getProject();
    if (seq.song) return tickSong(project);
    const total = SS.totalSteps(project);
    const ahead = lookahead(project);
    while (seq.nextTime < ctx.currentTime + ahead) {
      // le compteur ne revient pas à 0 : des pistes de longueurs différentes restent décalées (polymétrie).
      // Il repart à 0 quand toutes les boucles se retrouvent alignées.
      if (seq.step >= seq.cycle(project, total)) {
        seq.step = 0;
        seq.loops = (seq.loops || 0) + 1; // cycles complets : sert au passage des conditions de déclenchement
      }
      const t = seq.nextTime + SS.grooveOffset(project, seq.step, stepDur(project));
      clockAdvance(project, seq.nextTime);
      project.tracks.forEach((tr) => scheduleAuto(project, tr, seq.step, seq.nextTime, stepDur(project)));
      scheduleStep(project, seq.step, t);
      seq.queue.push({ step: seq.step, time: t, song: seq.song ? { index: seq.song.index, rep: seq.song.rep } : null });
      seq.nextTime += stepDur(project);
      seq.step++;
    }
  }

  /*
   * Mode chanson : on joue les blocs de l'arrangement l'un après l'autre.
   * Au passage d'un bloc à l'autre, seq.song.onBlock(index) charge la scène suivante
   * dans les pistes (avant de programmer son premier pas) ; l'affichage la suit.
   */
  /*
   * Au changement de bloc, l'affichage de la nouvelle scène est mis à jour juste après ce passage (main.js) ;
   * il peut occuper le navigateur un moment (piano roll ouvert, machine lente). On programme donc d'avance
   * BLOCK_AHEAD secondes de plus à ce moment-là : les notes du début du bloc sont déjà programmées et partent à l'heure.
   */
  const BLOCK_AHEAD = 1;
  function tickSong(project) {
    const sg = seq.song;
    const ahead = lookahead(project);
    while (seq.nextTime < ctx.currentTime + ahead + seq.ahead && !sg.ended) {
      const total = SS.totalSteps(project);
      if (seq.step >= total) {
        seq.step = 0;
        sg.rep++;
        const block = project.song[sg.index];
        if (!block || sg.rep >= block.repeat) {
          sg.rep = 0;
          sg.index++;
          if (sg.index >= project.song.length) {
            if (!project.songLoop) {
              sg.ended = true; // fin de la chanson : on laisse finir les dernières notes
              seq.queue.push({ step: -1, time: seq.nextTime, end: true });
              break;
            }
            sg.index = 0;
          }
          sg.onBlock(sg.index);
          seq.ahead = BLOCK_AHEAD;
        }
        seq.queue.push({ step: -1, time: seq.nextTime, block: sg.index, rep: sg.rep });
      }
      const t = seq.nextTime + SS.grooveOffset(project, seq.step, stepDur(project));
      clockAdvance(project, seq.nextTime);
      project.tracks.forEach((tr) => scheduleAuto(project, tr, seq.step, seq.nextTime, stepDur(project)));
      scheduleStep(project, seq.step, t);
      seq.queue.push({ step: seq.step, time: t, song: seq.song ? { index: seq.song.index, rep: seq.song.rep } : null });
      seq.nextTime += stepDur(project);
      seq.step++;
    }
    seq.ahead = 0; // avance supplémentaire : une seule fois, au passage du bloc
  }

  function draw() {
    if (!seq.playing) return;
    while (seq.queue.length && seq.queue[0].time <= ctx.currentTime) {
      const e = seq.queue.shift();
      if (e.end) {
        seq.song.onEnd && seq.song.onEnd();
        return;
      }
      if (e.block !== undefined) seq.song.onBlockVisible && seq.song.onBlockVisible(e.block, e.rep);
      else {
        seq.shown = { step: e.step, song: e.song }; // dernière position entendue (pour la pause)
        seq.onStep && seq.onStep(e.step);
      }
    }
    seq.raf = requestAnimationFrame(draw);
  }

  /**
   * opts.song (facultatif) : { index, onBlock(i), onBlockVisible(i, rep), onEnd() } pour jouer l'arrangement
   * à partir du bloc `index` ; sans lui, la scène en cours boucle.
   * opts.from (facultatif) : pas de départ dans la scène (curseur de lecture placé sur la règle).
   */
  /**
   * Lecture : on attend d'abord que les sons de la scène (échantillons, soundfonts, modules audio)
   * soient chargés et que le contexte audio tourne. Sinon les premières notes partent dans le vide
   * pendant que le curseur avance. Sons déjà en cache : la lecture démarre aussitôt.
   * Au-delà de READY_TIMEOUT_MS, on démarre quand même (réseau lent) ; ce qui manque arrivera en route.
   */
  const READY_TIMEOUT_MS = 6000;
  const LOADING_SHOW_MS = 150; // en dessous, pas d'indicateur (évite un clignotement)

  function whenReady(project, song) {
    const jobs = project.tracks.map(prepareTrack);
    // en mode chanson, les scènes suivantes peuvent utiliser d'autres notes (VCSL)
    if (song) jobs.push(preloadSong(project));
    if (ctx.state !== 'running') jobs.push(ctx.resume().catch(() => {}));
    if (masterReady) jobs.push(masterReady);
    if (SS.filters) jobs.push(Promise.resolve(SS.filters.load(ctx)).catch(() => {}));
    if (SS.space) jobs.push(Promise.resolve(SS.space.load(ctx)).catch(() => {}));
    return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, READY_TIMEOUT_MS))]);
  }

  function start(getProject, onStep, opts = {}) {
    ensureCtx(); // dans le geste de l'utilisateur (politique autoplay)
    if (seq.playing || seq.pending) return;
    const pending = { getProject, onStep, opts };
    seq.pending = pending;
    const slow = setTimeout(() => {
      if (seq.pending !== pending) return;
      pending.shown = true;
      onLoading(true);
    }, LOADING_SHOW_MS);
    whenReady(getProject(), !!opts.song).then(() => {
      clearTimeout(slow);
      if (seq.pending !== pending) return; // arrêté ou mis en pause pendant le chargement
      seq.pending = null;
      begin(pending.getProject, pending.onStep, pending.opts);
      if (pending.shown) onLoading(false);
    });
  }

  /** Annule une lecture qui attendait ses sons. */
  function cancelPending() {
    if (!seq.pending) return null;
    const p = seq.pending;
    seq.pending = null;
    if (p.shown) onLoading(false);
    return p;
  }

  function begin(getProject, onStep, opts) {
    if (seq.playing) return;
    Object.assign(scheduling, { ticks: 0, lateSteps: 0, maxLateMs: 0, lastLateAt: null, maxTickMs: 0 });
    seq.getProject = getProject;
    seq.onStep = onStep;
    seq.song = opts.song ? { ...opts.song, rep: 0, ended: false } : null;
    if (seq.song) seq.song.onBlock(seq.song.index);
    seq.ahead = seq.song ? BLOCK_AHEAD : 0; // l'affichage du premier bloc se met à jour juste après
    // tranche de chaque piste (effets, réverbération) construite dès maintenant : sinon elle l'était à la
    // première note de la piste, pendant la programmation, et retardait les notes (entrée d'un instrument au drop)
    getProject().tracks.forEach((t) => bus(t));
    applyAllFx(getProject());
    resetLoudness();
    seq.playing = true;
    seq.step = Math.max(0, Math.floor(opts.from || 0));
    seq.loops = 0;
    seq.queue = [];
    seq.nextTime = ctx.currentTime + 0.08;
    clockReset(getProject(), seq.nextTime, seq.step / 4); // LFO calés sur le tempo : phase alignée sur la grille
    if (seq.song) seq.queue.push({ step: -1, time: seq.nextTime, block: seq.song.index, rep: 0 });
    getProject().tracks.forEach(prepareTrack); // scène du premier bloc (mode chanson) : déjà en cache le plus souvent
    tick();
    seq.timer = setInterval(tick, 25);
    draw();
  }

  /** Précharge les échantillons de toutes les scènes (les notes d'un VCSL dépendent de la scène). */
  function preloadSong(project) {
    const jobs = [];
    project.scenes.forEach((sc) => {
      project.tracks.forEach((t) => {
        const d = sc.data && sc.data[t.id];
        if (t.type === 'instrument' && d && d.events) jobs.push(prepareTrack({ ...t, events: d.events }));
      });
    });
    return Promise.all(jobs);
  }

  function halt() {
    seq.playing = false;
    clearInterval(seq.timer);
    cancelAnimationFrame(seq.raf);
    seq.queue = [];
    silenceAll(); // coupe les voix en cours et celles déjà programmées
    resetAutos();
    if (seq.getProject) applyMutes(seq.getProject()); // à l'arrêt, les tranches muettes se rouvrent
  }

  function stop() {
    cancelPending();
    halt();
    seq.paused = null;
    seq.shown = null;
    seq.onStep && seq.onStep(-1);
  }

  /** Pause : on coupe le son mais on garde la position (pas, bloc et répétition de la chanson). */
  function pause() {
    const p = cancelPending();
    if (p) {
      // pause pendant le chargement : la reprise partira du point de départ prévu
      seq.getProject = p.getProject;
      seq.onStep = p.onStep;
      seq.song = p.opts.song ? { ...p.opts.song, rep: 0, ended: false } : null;
      seq.paused = { step: Math.max(0, Math.floor(p.opts.from || 0)), song: seq.song ? { index: seq.song.index, rep: 0 } : null };
      return;
    }
    if (!seq.playing) return;
    halt();
    const shown = seq.shown || { step: -1, song: seq.song ? { index: seq.song.index, rep: 0 } : null };
    seq.paused = { step: shown.step + 1, song: shown.song };
  }

  /** Reprend après une pause, au pas suivant le dernier entendu. */
  function resume() {
    if (!seq.paused || seq.playing) return;
    ensureCtx();
    const at = seq.paused;
    seq.paused = null;
    seq.playing = true;
    seq.queue = [];
    seq.step = Math.max(0, at.step);
    seq.nextTime = ctx.currentTime + 0.06;
    if (seq.song && at.song) {
      seq.song.index = at.song.index;
      seq.song.rep = at.song.rep;
      seq.song.ended = false;
      seq.song.onBlock(seq.song.index); // recharge la scène du bloc si on en avait changé entre-temps
      seq.queue.push({ step: -1, time: seq.nextTime, block: seq.song.index, rep: seq.song.rep });
    }
    applyAllFx(seq.getProject());
    tick();
    seq.timer = setInterval(tick, 25);
    draw();
  }

  /**
   * Déplace le curseur de lecture au pas `step` de la scène affichée.
   * En pause : la reprise partira de là. En lecture : la lecture saute immédiatement à ce pas
   * (en mode chanson, on reste dans le bloc et la répétition qu'on entend).
   */
  function seek(step) {
    step = Math.max(0, Math.floor(step));
    if (seq.pending) {
      seq.pending.opts = { ...seq.pending.opts, from: step };
      return;
    }
    if (seq.paused) {
      seq.paused.step = step;
      seq.shown = { step, song: seq.paused.song };
      return;
    }
    if (!seq.playing) return;
    silenceAll(); // coupe les notes déjà programmées après la position actuelle
    seq.queue = [];
    if (seq.song && seq.shown && seq.shown.song) {
      // l'anticipation a pu déjà passer au bloc suivant : on revient au bloc entendu
      const heard = seq.shown.song;
      const changedBlock = heard.index !== seq.song.index;
      seq.song.index = heard.index;
      seq.song.rep = heard.rep;
      seq.song.ended = false;
      if (changedBlock) seq.song.onBlock(seq.song.index);
    }
    seq.step = step;
    seq.nextTime = ctx.currentTime + 0.04;
    tick();
  }

  /** Lecture seule : aucune création de contexte ni copie des données PCM. */
  function diagnostics() {
    const seen = new Set();
    let bufferBytes = 0;
    const assets = [];
    const add = (buffer) => {
      if (!buffer || seen.has(buffer)) return 0;
      seen.add(buffer);
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      bufferBytes += bytes;
      return bytes;
    };
    let loading = 0, failedAssets = 0;
    bufferCache.forEach((e, url) => {
      if (e.failed) failedAssets++;
      else if (!e.buffer) loading++;
      const bytes = add(e.buffer);
      if (bytes) assets.push({ name: decodeURIComponent(url.split('/').pop()), bytes });
    });
    sfCache.forEach((e, name) => {
      if (e.failed) failedAssets++;
      else if (!e.zones) loading++;
      const bytes = (e.zones || []).reduce((n, z) => n + add(z.buffer), 0);
      if (bytes) assets.push({ name: name.replace(/_/g, ' '), bytes });
    });
    Object.values(noiseBuffers).forEach(add);
    irCache.forEach(add);
    voices.forEach(v => v.sources.forEach(src => add(src.buffer)));
    add(masterEffects?.reverb.impulse?.buffer);
    // Impulsions des réverbérations déjà instanciées, y compris celles des pistes.
    if (returns) for (const k of ['plate', 'hall']) add(returns[k].conv.buffer);
    buses.forEach(b => { if (b.reverb) add(b.reverb.conv.buffer); });
    assets.sort((a, b) => b.bytes - a.bytes);
    return {
      context: ctx ? { state: ctx.state, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency } : null,
      bufferBytes, buffers: seen.size, loadingAssets: loading, failedAssets, largestAssets: assets.slice(0, 5),
      // Ces voix Web Audio peuvent être en cours ou anticipées ; les voix DSP Juno sont internes au worklet.
      scheduledVoices: voices.size, junoEngines: SS.juno?.engineCount?.() || 0, buses: buses.size, masteringReady: !!masterProc,
      scheduling: { ...scheduling },
      output: ctx ? levels('__master') : null,
      playing: seq.playing, paused: !!seq.paused,
    };
  }

  return {
    diagnostics,
    ensureCtx,
    loadJSON,
    drumMachines,
    drumVariants,
    drumBanks,
    bankVariants,
    prepareTrack,
    preparePreview,
    preview,
    playPhrase,
    playNote,
    playDrum,
    setTrackGain,
    removeTrack,
    applyFx,
    applyAllFx,
    resetLoudness,
    applyMix,
    applyMaster,
    levels,
    taps,
    applyMutes,
    ensureBus: (t) => bus(t),
    /** Clavier de la façade du Juno : note tenue (renvoie un identifiant, ou null si le module se charge). */
    liveNoteOn: (track, midi, vel) => {
      ensureCtx();
      return SS.juno.noteOn(ctx, track, midi, vel, bus(track));
    },
    liveNoteOff: (track, id) => ctx && SS.juno.noteOff(ctx, track, id),
    applySynth: (t) => SS.juno && SS.juno.applyChorus(ctx, t),
    _bus: bus, // accès internes pour les tests
    _master: () => master,
    _out: () => masterFader, // sortie finale (après la tranche Master), pour enregistrer
    _duckValue: (id) => (buses.get(id) ? buses.get(id).duck.gain.value : null),
    _autoState: autoState,
    start,
    stop,
    isPlaying: () => seq.playing || !!seq.pending, // en attente des sons : compte comme en lecture
    isLoading: () => !!seq.pending,
    setOnLoading: (fn) => (onLoading = fn || (() => {})),
    isPaused: () => !!seq.paused,
    pause,
    resume,
    seek,
    setErrorHandler: (fn) => (onError = fn),
  };
})();
