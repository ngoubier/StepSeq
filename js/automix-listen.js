/*
 * Auto Mix : écoute du morceau pendant la lecture.
 *
 * Des analyseurs (AnalyserNode, FFT 4096 points ≈ 85 ms, résolution ≈ 11 Hz) se branchent sur les points
 * d'écoute de js/audio.js (SS.audio.taps) : la sortie de chaque piste et le Master avant mastering. La sortie
 * finale passe par un séparateur gauche / droite (et un passe-bas 120 Hz pour la corrélation des graves).
 * Toutes les 50 ms de lecture, un relevé est ajouté à l'accumulateur de js/automix.js.
 * sample() peut aussi être appelé à la main (rendu hors temps réel : tools/automix-calibrate.js).
 */
window.SS = window.SS || {};

SS.automixListen = (() => {
  const A = () => SS.automix;
  const FFT = 4096;
  const STEP_MS = 50;
  let n = null; // nœuds d'analyse
  let acc = null;
  let timer = null;
  let lastT = null;
  let lastLoud = null;
  let project = () => null;
  let onFrame = null;
  const listeners = new Set(); // reçoivent chaque relevé brut (pilote auto : js/automix-pilot.js)

  function analyser(ctx, size = FFT) {
    const an = ctx.createAnalyser();
    an.fftSize = size;
    an.smoothingTimeConstant = 0;
    return { an, spec: new Float32Array(size / 2), buf: new Float32Array(size) };
  }

  /** Branche (ou complète) les analyseurs sur les points d'écoute actuels. */
  function connect() {
    const t = SS.audio.taps();
    if (!t) return false;
    if (n && n.ctx !== t.ctx) disconnect();
    if (!n) {
      const ctx = t.ctx;
      n = { ctx, tracks: new Map(), pre: analyser(ctx), preSrc: t.pre, postSrc: null };
      t.pre.connect(n.pre.an);
      n.split = ctx.createChannelSplitter(2);
      n.L = analyser(ctx, 2048);
      n.R = analyser(ctx, 2048);
      n.split.connect(n.L.an, 0);
      n.split.connect(n.R.an, 1);
      const lp = () => {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 120;
        return f;
      };
      n.lpL = lp();
      n.lpR = lp();
      n.Ll = analyser(ctx, 2048);
      n.Rl = analyser(ctx, 2048);
      n.split.connect(n.lpL, 0).connect(n.Ll.an);
      n.split.connect(n.lpR, 1).connect(n.Rl.an);
    }
    // la sortie change quand le module de mastering finit de charger
    if (n.postSrc !== t.post) {
      if (n.postSrc) n.postSrc.disconnect(n.split);
      t.post.connect(n.split);
      n.postSrc = t.post;
    }
    if (n.preSrc !== t.pre) {
      n.preSrc.disconnect(n.pre.an);
      t.pre.connect(n.pre.an);
      n.preSrc = t.pre;
    }
    t.tracks.forEach((node, id) => {
      const cur = n.tracks.get(id);
      if (cur && cur.src === node) return;
      if (cur) cur.src.disconnect(cur.an);
      const a = analyser(n.ctx);
      a.src = node;
      node.connect(a.an);
      n.tracks.set(id, a);
    });
    if (!n.inputs) n.inputs = new Map();
    (t.inputs || new Map()).forEach((node, id) => {
      const cur = n.inputs.get(id);
      if (cur && cur.src === node) return;
      if (cur) cur.src.disconnect(cur.an);
      const a = analyser(n.ctx, 2048);
      a.src = node;
      node.connect(a.an);
      n.inputs.set(id, a);
    });
    return true;
  }
  function disconnect() {
    if (!n) return;
    const off = (src, dst) => {
      try {
        src.disconnect(dst);
      } catch (e) {
        /* déjà débranché */
      }
    };
    off(n.preSrc, n.pre.an);
    if (n.postSrc) off(n.postSrc, n.split);
    n.tracks.forEach((a) => off(a.src, a.an));
    if (n.inputs) n.inputs.forEach((a) => off(a.src, a.an));
    n = null;
  }

  function peakOf(buf) {
    let p = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > p) p = v;
    }
    return p;
  }
  function bandsOf(a) {
    a.an.getFloatFrequencyData(a.spec);
    return A().bandPowers(a.spec, n.ctx.sampleRate, FFT);
  }
  function stereo(l, r) {
    l.an.getFloatTimeDomainData(l.buf);
    r.an.getFloatTimeDomainData(r.buf);
    return A().stereoSums(l.buf, r.buf);
  }

  /** Un relevé (dt : durée représentée, en secondes). */
  function sample(dt = STEP_MS / 1000) {
    if (!acc || !connect()) return;
    const p = project();
    const live = new Set(p ? p.tracks.map((t) => t.id) : []);
    const tracks = {};
    n.tracks.forEach((a, id) => {
      if (!live.has(id)) return;
      a.an.getFloatTimeDomainData(a.buf);
      const lv = SS.audio.levels(id);
      const fr = { bands: bandsOf(a), peak: peakOf(a.buf), gr: lv ? lv.gr.comp : 0, limGr: lv ? lv.gr.lim : 0 };
      const inp = n.inputs && n.inputs.get(id);
      if (inp) {
        inp.an.getFloatTimeDomainData(inp.buf);
        fr.inPeak = peakOf(inp.buf);
        let s = 0;
        for (let i = 0; i < inp.buf.length; i++) s += inp.buf[i] * inp.buf[i];
        fr.inMs = s / inp.buf.length;
      }
      tracks[id] = fr;
    });
    n.pre.an.getFloatTimeDomainData(n.pre.buf);
    const ml = SS.audio.levels('__master');
    const L = ml && ml.loudness;
    const loud = L ? { m: L.m, s: L.s, tp: L.tp, fresh: L !== lastLoud } : null;
    lastLoud = L;
    const mp = p ? SS.masterParams(p) : null;
    const frame = {
      dt,
      scene: p ? p.current : null,
      tracks,
      pre: { bands: bandsOf(n.pre), peak: peakOf(n.pre.buf) },
      preGain: mp ? mp.volume : 1, // fader du Master (l'écoute du mix se fait après lui)
      masterGr: ml ? ml.gr.comp : 0,
      masterLimGr: ml ? ml.gr.lim : 0,
      stereo: stereo(n.L, n.R),
      stereoLow: stereo(n.Ll, n.Rl),
      loud,
    };
    A().accumulate(acc, frame);
    listeners.forEach((fn) => fn(frame));
    if (onFrame) onFrame(acc);
  }

  function tick() {
    if (!SS.audio.isPlaying() || SS.audio.isPaused()) {
      lastT = null;
      return;
    }
    const now = n ? n.ctx.currentTime : null;
    const dt = lastT != null && now != null ? Math.min(0.2, Math.max(0, now - lastT)) : STEP_MS / 1000;
    lastT = now;
    sample(dt);
  }

  /** Commence (ou reprend) l'écoute ; les relevés ne sont pris que pendant la lecture. */
  function start(projectFn, cb, { manual = false } = {}) {
    project = projectFn || project;
    onFrame = cb || onFrame;
    if (!acc) acc = A().newAccumulator();
    SS.audio.ensureCtx();
    connect();
    if (!timer && !manual) timer = setInterval(tick, STEP_MS); // manual : relevés appelés à la main (rendu hors temps réel)
  }
  /** Arrête l'écoute et débranche les analyseurs (les mesures sont gardées). */
  function stop() {
    clearInterval(timer);
    timer = null;
    lastT = null;
    disconnect();
  }
  /** Oublie tout ce qui a été entendu (nouvelle écoute). */
  function reset() {
    acc = A().newAccumulator();
    lastLoud = null;
  }

  return {
    start,
    stop,
    reset,
    sample,
    connect,
    summary: () => (acc ? A().summarize(acc) : null),
    secs: () => (acc ? acc.secs : 0),
    scenes: () => (acc ? acc.scenes.size : 0),
    listening: () => !!timer,
    /** Abonnement aux relevés bruts ; rend la fonction de désabonnement. */
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
})();
