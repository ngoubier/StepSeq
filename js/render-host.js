/*
 * Hôte du rendu hors temps réel, dans le cadre invisible render.html (voir js/render-boot.js et js/render.js).
 *
 * SS.renderHost.run(json, { onProgress }) :
 *   1. lit le projet préparé par la page principale (arrangement à jouer, pistes muettes pour un stem, Master) ;
 *   2. charge tous les sons de toutes les scènes (aucune note ne doit partir dans le vide) ;
 *   3. lance la lecture en mode chanson, exactement comme le bouton Lecture ;
 *   4. rend le son : le rendu s'arrête tous les STEP secondes, le séquenceur programme les notes suivantes,
 *      puis le rendu reprend. Avance de programmation du moteur : 0,12 s au moins ; STEP = 0,05 s.
 *   Retourne { left, right, sampleRate } (Float32Array).
 *   onChunk (écoute pré-calculée de l'assistant) : le son rendu arrive aussi par morceaux d'une demi-seconde,
 *   onChunk({ frame, left, right }), pour que la page principale puisse commencer à jouer avant la fin du rendu.
 */
window.SS = window.SS || {};
SS.renderHost = (() => {
  const STEP = 0.05;
  // une tâche (et non une micro-tâche) : les chargements « await » du moteur ont le temps de finir.
  // MessageChannel plutôt que setTimeout : pas ralenti quand l'onglet passe en arrière-plan.
  const channel = new MessageChannel();
  const waiting = [];
  channel.port1.onmessage = () => {
    const r = waiting.shift();
    if (r) r();
  };
  const nextTask = () =>
    new Promise((r) => {
      waiting.push(r);
      channel.port2.postMessage(0);
    });

  async function preload(p) {
    const jobs = [];
    for (const t of p.tracks) {
      jobs.push(SS.audio.prepareTrack(t));
      for (const sc of p.scenes) if (sc.data && sc.data[t.id]) jobs.push(SS.audio.prepareTrack({ ...t, ...sc.data[t.id] }));
    }
    await Promise.all(jobs.map((j) => Promise.resolve(j).catch(() => {})));
  }

  /** Point d'écoute en continu : le processeur renvoie le son qui va à la sortie, par morceaux de CHUNK images. */
  function tapModule(scope) {
    const CHUNK = 24000;
    class Tap extends scope.AudioWorkletProcessor {
      constructor() {
        super();
        this.l = new Float32Array(CHUNK);
        this.r = new Float32Array(CHUNK);
        this.n = 0;
        this.frame = 0;
      }
      flush() {
        if (!this.n) return;
        const left = this.l.slice(0, this.n);
        const right = this.r.slice(0, this.n);
        this.port.postMessage({ frame: this.frame, left, right }, [left.buffer, right.buffer]);
        this.frame += this.n;
        this.n = 0;
      }
      process(inputs) {
        const inp = inputs[0] || [];
        const a = inp[0];
        const b = inp[1] || a;
        const len = (a && a.length) || 128;
        for (let i = 0; i < len; i++) {
          this.l[this.n] = a ? a[i] : 0;
          this.r[this.n] = b ? b[i] : 0;
          if (++this.n === CHUNK) this.flush();
        }
        return true;
      }
    }
    scope.registerProcessor('ss-render-tap', Tap);
  }
  async function streamTap(ctx, onChunk) {
    const url = URL.createObjectURL(new Blob([`(${tapModule.toString()})(globalThis);`], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, 'ss-render-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit' });
    node.port.onmessage = (e) => onChunk(e.data);
    ctx.__sink.connect(node);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(realDest(ctx));
    return node;
  }
  // la vraie sortie du rendu (ctx.destination renvoie le point de branchement)
  const realDest = (ctx) => Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination').get.call(ctx);

  async function run(json, { onProgress, onChunk } = {}) {
    const cfg = window.__ssRenderCfg;
    if (!cfg) throw new Error('page de rendu ouverte sans configuration');
    const p = SS.normalizeProject(JSON.parse(json));
    if (!p.song.length) throw new Error('arrangement vide');
    p.playMode = 'song';
    p.songLoop = false;
    SS.loadScene(p, p.song[0].scene, { commit: false });
    const ctx = SS.audio.ensureCtx();
    if (ctx !== window.__ssRenderCtx) throw new Error('contexte de rendu introuvable');
    // modules audio (Juno, filtres, espace, mastering) : chargés avant la première note
    const mods = [SS.juno && SS.juno.load(ctx), SS.filters && SS.filters.load(ctx), SS.space && SS.space.load(ctx), SS.mastering && SS.mastering.load(ctx), SS.audio.stripReady && SS.audio.stripReady()];
    await Promise.all(mods.map((m) => Promise.resolve(m).catch(() => {})));
    await preload(p);
    if (cfg.tap) SS.audio.freezeTap(cfg.tap); // « Figer » : le son de l'instrument seul
    const tap = cfg.stream && onChunk && ctx.__sink ? await streamTap(ctx, onChunk) : null;
    SS.audio.applyMaster(p);
    p.tracks.forEach((t) => SS.audio.applyMix(t));
    SS.audio.start(() => p, () => {}, {
      song: { index: 0, onBlock: (i) => p.song[i] && SS.loadScene(p, p.song[i].scene, { commit: false }), onEnd: () => {} },
    });
    // start() attend que les sons soient prêts (promesses) : quelques tâches suffisent, tout est déjà chargé
    for (let i = 0; i < 400 && !SS.audio.isPlaying(); i++) await nextTask();
    if (!SS.audio.isPlaying()) throw new Error('la lecture n’a pas démarré');
    await nextTask();

    const total = cfg.length / cfg.sampleRate;
    let done = 0;
    for (let t = STEP; t < total; t += STEP) {
      const at = t;
      ctx.suspend(at).then(async () => {
        if (window.__ssRenderTick) window.__ssRenderTick();
        await nextTask();
        await nextTask();
        if (onProgress && at - done >= 0.5) {
          done = at;
          onProgress(Math.min(1, at / total));
        }
        ctx.__allow = true;
        await ctx.resume();
        ctx.__allow = false;
      });
    }
    const buf = await ctx.startRendering();
    if (onProgress) onProgress(1);
    if (tap) tap.port.onmessage = null; // la page principale complète la fin avec le son entier
    SS.audio.stop();
    return { left: buf.getChannelData(0), right: buf.getChannelData(1), sampleRate: buf.sampleRate };
  }

  return { run };
})();
