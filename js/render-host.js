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

  async function run(json, { onProgress } = {}) {
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
    SS.audio.stop();
    return { left: buf.getChannelData(0), right: buf.getChannelData(1), sampleRate: buf.sampleRate };
  }

  return { run };
})();
