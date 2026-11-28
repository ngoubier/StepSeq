/*
 * Lecteur léger du téléphone (telephone.html) : il joue l'écoute pré-calculée (js/prelisten.js) dans son propre contexte
 * audio, qui ne contient rien d'autre que le son déjà mixé. Le moteur complet (js/audio.js : tranches de console,
 * réverbérations, mastering, vumètres) n'est pas construit pour écouter : sur un téléphone, il calculait du silence
 * pendant toute l'écoute, en même temps que le rendu, et faisait saccader le son. Il ne sert plus qu'aux pads (Pas, Jouer).
 *
 *   const pl = SS.phonePlayer.create()          // dans le geste de l'utilisateur
 *   pl.play(backing, { blocks, onBlock, onEnd }) // backing : SS.preListen.render ; blocks : nombre de blocs (chanson)
 *   pl.fed()                                     // un nouveau morceau du rendu est arrivé
 *   pl.pos()                                     // { sec, block, step } entendus, ou null ; pl.stop()
 *
 * Un morceau qui arrive en retard ne fait pas sauter la musique : la lecture l'attend (petit silence) puis reprend là où
 * elle en était.
 */
window.SS = window.SS || {};
SS.phonePlayer = (() => {
  const LEAD = 0.06; // départ (s) et rattrapage d'un morceau en retard

  function create() {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx;
    try {
      ctx = new AC({ latencyHint: 'playback' }); // rien d'interactif ici : un grand tampon, moins de risques
    } catch (e) {
      ctx = new AC();
    }
    let cur = null; // { b, gain, srcs, next, when, offset, looped, blocks, onBlock, onEnd, block, ended, timer }

    const at = (p, sec) => p.when + (sec - p.offset); // heure de sortie d'une seconde de l'enregistrement
    function feed(p) {
      const b = p.b;
      const now = ctx.currentTime;
      for (; p.next < b.chunks.length; p.next++) {
        const c = b.chunks[p.next];
        if (b.loop && c.start >= b.loop.end) continue; // au-delà de la boucle : jamais entendu
        if (c.start + c.buf.duration <= p.offset) continue;
        const late = now + 0.02 - at(p, Math.max(c.start, p.offset));
        if (late > 0) p.when += late + LEAD; // en retard : la lecture attend ce morceau au lieu de le sauter
        const skip = Math.max(0, p.offset - c.start);
        const src = ctx.createBufferSource();
        src.buffer = c.buf;
        src.connect(p.gain);
        src.start(at(p, c.start + skip), skip, b.loop ? Math.max(0, Math.min(c.buf.duration, b.loop.end - c.start) - skip) : undefined);
        p.srcs.push(src);
      }
      // scène en boucle : une fois le son entier rendu, la boucle prend le relais à la fin du second passage
      if (b.loop && b.buffer && !p.looped) {
        p.looped = true;
        const src = ctx.createBufferSource();
        src.buffer = b.buffer;
        src.loop = true;
        src.loopStart = b.loop.start;
        src.loopEnd = b.loop.end;
        src.connect(p.gain);
        src.start(Math.max(ctx.currentTime, at(p, b.loop.end)), b.loop.start);
        p.srcs.push(src);
      }
    }

    function stop() {
      const p = cur;
      cur = null;
      if (!p) return;
      clearInterval(p.timer);
      const now = ctx.currentTime;
      p.gain.gain.setTargetAtTime(0, now, 0.01);
      p.srcs.forEach((s) => {
        try {
          s.stop(now + 0.06);
        } catch (e) {
          /* déjà arrêté */
        }
      });
      setTimeout(() => p.gain.disconnect(), 200);
    }

    /** Seconde de l'enregistrement que l'on entend (boucle ramenée dans le second passage), ou null. */
    function heard(p) {
      const lat = ctx.outputLatency || ctx.baseLatency || 0;
      let sec = p.offset + (ctx.currentTime - lat - p.when);
      if (sec < p.offset) return null;
      const L = p.b.loop;
      if (L && sec >= L.end) sec = L.start + ((sec - L.start) % (L.end - L.start));
      return sec;
    }
    function pos() {
      const p = cur;
      if (!p) return null;
      const sec = heard(p);
      if (sec == null) return null;
      const t0 = p.b.timeOf(p.block, 0, 0);
      const sd = p.b.timeOf(p.block, 0, 1) - t0; // durée d'un pas
      return { sec, block: p.block, step: sd > 0 ? (sec - t0) / sd : 0 };
    }

    /** Joue un backing (js/prelisten.js) depuis son début. blocks : nombre de blocs de la chanson (0 : scène en boucle). */
    function play(b, { blocks = 0, onBlock = null, onEnd = null } = {}) {
      stop();
      if (ctx.state === 'suspended') ctx.resume();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const offset = b.timeOf(0, 0, 0);
      const p = (cur = { b, gain, srcs: [], next: 0, when: ctx.currentTime + LEAD, offset, looped: false, blocks, onBlock, onEnd, block: 0 });
      if (b.buffer && !b.chunks) b.chunks = [{ start: 0, buf: b.buffer }]; // déjà calculé (cache) : un seul morceau
      feed(p);
      // bloc entendu (frise) et fin de la chanson
      p.timer = setInterval(() => {
        if (cur !== p || !blocks) return;
        const sec = heard(p);
        if (sec == null) return;
        let i = p.block;
        while (i + 1 < blocks && sec >= b.timeOf(i + 1, 0, 0)) i++;
        if (i !== p.block) {
          p.block = i;
          if (onBlock) onBlock(i);
        }
        if (sec >= b.timeOf(blocks, 0, 0) + 0.5 && onEnd) {
          stop();
          onEnd();
        }
      }, 100);
    }

    return {
      ctx,
      play,
      stop,
      pos,
      fed: () => cur && feed(cur),
      playing: () => !!cur,
      resume: () => ctx.state === 'suspended' && ctx.resume(),
    };
  }

  return { create };
})();
