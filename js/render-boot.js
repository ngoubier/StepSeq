/*
 * Amorce de la page de rendu (render.html), chargée AVANT le moteur audio.
 *
 * La page principale (js/render.js) crée le cadre avec un nom JSON : { ssRender: 1, seconds, sampleRate }.
 * Ici :
 *   - window.AudioContext devient un OfflineAudioContext stéréo de la durée demandée : le moteur (js/audio.js) le crée
 *     comme d'habitude, sans le savoir ; resume() ne fait rien tant que le rendu ne l'autorise pas ;
 *   - la minuterie du séquenceur (setInterval de 25 ms) n'est pas lancée : js/render-host.js l'appelle à la main à
 *     chaque arrêt programmé du rendu, ce qui donne exactement la même programmation des notes qu'en direct ;
 *   - le stockage du navigateur est en lecture seule : le rendu ne peut rien écrire (réglages, chansons) ;
 *   - Math.random suit une suite fixe (graine `seed`) : deux rendus du même projet donnent le même son.
 */
(() => {
  let cfg = {};
  try {
    cfg = JSON.parse(window.name || '{}') || {};
  } catch (e) {
    cfg = {};
  }
  if (!cfg.ssRender) return;
  const seconds = Math.max(1, +cfg.seconds || 1);
  const sampleRate = [44100, 48000].includes(+cfg.sampleRate) ? +cfg.sampleRate : 44100;
  const length = Math.ceil(seconds * sampleRate);

  class RenderContext extends OfflineAudioContext {
    constructor() {
      super(2, length, sampleRate);
      this.__allow = false;
      window.__ssRenderCtx = this;
      // écoute pré-calculée en continu (stream) : tout ce qui va à la sortie passe par un point de branchement
      // (js/render-host.js y écoute le son rendu pour l'envoyer par morceaux à la page principale)
      if (cfg.stream) {
        this.__sink = super.createGain();
        this.__sink.connect(super.destination);
      }
    }
    get destination() {
      return this.__sink || super.destination;
    }
    resume() {
      return this.__allow ? super.resume() : Promise.resolve();
    }
  }
  window.AudioContext = RenderContext;
  window.webkitAudioContext = RenderContext;

  const si = window.setInterval;
  const ci = window.clearInterval;
  const SEQ_TIMER = -25;
  window.setInterval = (fn, ms, ...a) => {
    if (ms === 25) {
      window.__ssRenderTick = fn;
      return SEQ_TIMER;
    }
    return si(fn, ms, ...a);
  };
  window.clearInterval = (id) => {
    if (id === SEQ_TIMER) window.__ssRenderTick = null;
    else ci(id);
  };
  try {
    Storage.prototype.setItem = function () {};
    Storage.prototype.removeItem = function () {};
    Storage.prototype.clear = function () {};
  } catch (e) {
    /* stockage indisponible : rien à protéger */
  }
  // tirages aléatoires reproductibles (humanisation, bruit, réponses de reverb) : le master et chaque stem sont rendus
  // séparément, avec la même graine et les mêmes notes programmées dans le même ordre : ils tombent exactement ensemble
  let seed = (+cfg.seed >>> 0) || 0x5eed;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // tap : rendu « Figer » d'une piste (js/freeze.js) : seul le son de son instrument, avant sa tranche de console
  window.__ssRenderCfg = { seconds, sampleRate, length, tap: typeof cfg.tap === 'string' ? cfg.tap : null, stream: !!cfg.stream };
})();
