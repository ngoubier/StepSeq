/*
 * Écoute pré-calculée : la chanson (ou la scène) est rendue hors temps réel (js/render.js), puis jouée telle quelle par
 * js/audio.js (« backing ») : plus aucune coupure sur un appareil lent, au prix d'une attente. Le son arrive par morceaux
 * et la lecture part dès qu'il y a assez d'avance. Utilisée par l'assistant (js/band.js) et la page téléphone (js/phone.js).
 *
 *   SS.preListen.render(proj, range, from, { signal, ready, onProgress }) → Promise<backing>
 *     range : 'song' (à partir du bloc `from`) | 'scene' (la scène en cours, deux passages, bouclée sur le second)
 *     ready(backing) : appelé dès que la lecture peut partir ; onProgress(pourcent) : avancement du calcul
 */
window.SS = window.SS || {};
SS.preListen = (() => {
  const preCache = new Map(); // portée + projet -> AudioBuffer (les 3 derniers)
  /**
   * Seuil de départ de l'écoute pré-calculée en continu : `have` secondes déjà rendues sur `total`, rendues à `rate`
   * secondes de son par seconde. Sans attendre la fin, il faut que le rendu garde de l'avance jusqu'au bout.
   */
  function streamReady(have, total, rate) {
    if (have >= total) return true;
    if (!(rate > 0)) return false;
    const need = Math.max(STREAM_MIN, (total - have) * (1 - rate) + STREAM_MARGIN);
    return have >= need;
  }
  const STREAM_MIN = 2; // secondes d'avance au moins
  const STREAM_MARGIN = 1; // marge si le rendu est plus lent que la lecture
  /**
   * Rend l'écoute hors temps réel et renvoie le « backing » complet (js/audio.js). Pendant le rendu, le son arrive par
   * morceaux : `ready(backing)` est appelé dès qu'il y a assez d'avance pour jouer sans attendre la fin (le reste
   * se calcule pendant l'écoute ; il était attendu en entier avant : 45 s pour une chanson de 2 min 40).
   */
  async function render(proj, range, from, { signal, ready, onProgress } = {}) {
    const ctx = SS.audio.ensureCtx();
    const PRE = 0.08; // la première note part 0,08 s après le début du rendu (js/render.js, PREROLL)
    const sub = range === 'song' ? { ...proj, song: proj.song.slice(from) } : proj;
    const plan = SS.render.prepare(sub, { range, loops: 2 });
    // chanson : 4 s de queue (reverbs) ; scène : deux passages, on boucle sur le second (il contient les queues du premier)
    const half = plan.songSeconds / 2;
    const seconds = range === 'song' ? PRE + plan.songSeconds + 4 : PRE + plan.songSeconds + 0.05;
    const key = range + '|' + plan.json;
    const backing = preTiming(proj, range, from, PRE, half);
    const cached = preCache.get(key);
    if (cached) return Object.assign(backing, { buffer: cached });
    backing.chunks = [];
    let have = 0;
    let first = null; // [secondes rendues, heure] au premier morceau : la vitesse se mesure ensuite (sans le chargement des sons)
    const r = await SS.render.renderOnce(plan.json, { seconds, sampleRate: ctx.sampleRate, seed: 1 }, {
      signal,
      onProgress: (f) => onProgress && onProgress(Math.min(99, Math.round(f * 100))),
      onChunk: ({ frame, left, right }) => {
        if (signal.aborted) return;
        const buf = ctx.createBuffer(2, left.length, ctx.sampleRate);
        buf.copyToChannel(left, 0);
        buf.copyToChannel(right, 1);
        backing.chunks.push({ start: frame / ctx.sampleRate, buf });
        have = (frame + left.length) / ctx.sampleRate;
        SS.audio.backingFed(backing);
        const now = performance.now();
        if (!first) first = [have, now];
        const rate = now > first[1] ? (have - first[0]) / ((now - first[1]) / 1000) : 0;
        if (ready && backing.chunks.length >= 2 && streamReady(have, seconds, rate)) ready(backing);
      },
    });
    const buffer = ctx.createBuffer(2, r.left.length, r.sampleRate);
    buffer.copyToChannel(r.left, 0);
    buffer.copyToChannel(r.right, 1);
    preCache.set(key, buffer);
    while (preCache.size > 3) preCache.delete(preCache.keys().next().value);
    // la fin (dernier morceau incomplet) vient du son entier ; les reprises et sauts suivants le prennent directement
    const done = Math.round(have * r.sampleRate);
    if (done < r.left.length) {
      const tail = ctx.createBuffer(2, r.left.length - done, r.sampleRate);
      tail.copyToChannel(r.left.subarray(done), 0);
      tail.copyToChannel(r.right.subarray(done), 1);
      backing.chunks.push({ start: have, buf: tail });
    }
    backing.buffer = buffer;
    SS.audio.backingFed(backing);
    return backing;
  }
  /** Où tombe chaque pas dans l'enregistrement : { timeOf(bloc, répétition, pas), loop } (sans le son). */
  function preTiming(proj, range, from, PRE, half) {
    const spb = SS.stepsPerBar(proj);
    const sceneOf = (id) => proj.scenes.find((x) => x.id === id);
    const stepSec = (sc) => 60 / SS.tempoOf(proj, sc) / 4;
    if (range === 'scene') {
      const sc = sceneOf(proj.current);
      const total = Math.max(1, (sc ? sc.bars : proj.bars) * spb);
      return { buffer: null, loop: { start: PRE + half, end: PRE + 2 * half }, timeOf: (b, rep, step) => PRE + (step % total) * stepSec(sc) };
    }
    const blockSec = (b) => {
      const sc = sceneOf(b.scene);
      return sc ? sc.bars * spb * stepSec(sc) : 0;
    };
    return {
      buffer: null,
      timeOf: (block, rep, step) => {
        let t = PRE;
        for (let i = from; i < block && i < proj.song.length; i++) t += blockSec(proj.song[i]) * proj.song[i].repeat;
        const b = proj.song[block];
        if (b) t += rep * blockSec(b) + step * stepSec(sceneOf(b.scene));
        return t;
      },
    };
  }

  return { render, streamReady };
})();
