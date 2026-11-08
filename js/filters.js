/*
 * Filtres « analogiques » des pistes instrument (AudioWorklet), en complément des biquads Web Audio.
 * Inspiré de ftype() de strudel.cc (superdough : '12db', 'ladder', '24db') — implémentation propre à StepSeq.
 *
 *  - 'ss-ladder' : échelle à transistors 4 pôles façon Moog. Saturation tanh à l'entrée du réseau de
 *    contre-réaction (drive), résonance jusqu'à l'auto-oscillation, suréchantillonnage x2.
 *    Sorties passe-bas 24 dB, passe-haut, passe-bande et coupe-bande obtenues en mélangeant les étages.
 *  - 'ss-svf'    : filtre à variable d'état 2 pôles (topologie trapézoïdale) façon Oberheim SEM,
 *    résonance ronde, entrée saturée.
 *
 * Paramètres : frequency (a-rate, automatisable par l'enveloppe), q (0..30, même échelle que le curseur),
 * drive (0..1). Le mode (0 passe-bas, 1 passe-haut, 2 passe-bande, 3 coupe-bande) est fixé à la création.
 */
window.SS = window.SS || {};

function ssFiltersModule(scope) {
  const PI = Math.PI;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  // tanh rapide (approximation de Padé, bornée)
  const tanh = (x) => {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const x2 = x * x;
    return (x * (27 + x2)) / (27 + 9 * x2);
  };
  const PARAMS = [
    { name: 'frequency', defaultValue: 1000, minValue: 10, maxValue: 22000, automationRate: 'a-rate' },
    { name: 'q', defaultValue: 1, minValue: 0, maxValue: 40, automationRate: 'k-rate' },
    { name: 'drive', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  ];
  const modeOf = (options) => (options && options.processorOptions && options.processorOptions.mode) || 0;

  class Ladder extends scope.AudioWorkletProcessor {
    static get parameterDescriptors() {
      return PARAMS;
    }
    constructor(options) {
      super();
      this.mode = modeOf(options);
      this.s = [];
    }
    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const output = outputs[0];
      if (!input || !input.length) return true; // la voix est terminée : le nœud sera ramassé
      const fr = parameters.frequency;
      // résonance : 0..30 -> k 0..~3.9 (4 = auto-oscillation)
      const k = 3.95 * (1 - Math.exp(-parameters.q[0] / 8));
      const dr = parameters.drive[0];
      const dg = 1 + 6 * dr * dr; // gain d'entrée
      const makeup = (1 + 0.6 * k) / Math.sqrt(dg);
      const mode = this.mode;
      const os = 2 * sampleRate;
      for (let c = 0; c < output.length; c++) {
        const x = input[Math.min(c, input.length - 1)];
        const y = output[c];
        const st = this.s[c] || (this.s[c] = [0, 0, 0, 0]);
        let [y1, y2, y3, y4] = st;
        let u = 0;
        for (let n = 0; n < y.length; n++) {
          const f = clamp(fr.length > 1 ? fr[n] : fr[0], 10, 20000);
          const g = 1 - Math.exp((-2 * PI * f) / os);
          const xin = x[n] * dg;
          for (let o = 0; o < 2; o++) {
            u = tanh(xin - k * y4);
            y1 += g * (u - y1);
            y2 += g * (y1 - y2);
            y3 += g * (y2 - y3);
            y4 += g * (y3 - y4);
          }
          let out;
          if (mode === 1) out = u - 4 * y1 + 6 * y2 - 4 * y3 + y4;
          else if (mode === 2) out = 2 * (y2 - 2 * y3 + y4);
          else if (mode === 3) out = u - 2 * y1 + 2 * y2;
          else out = y4;
          y[n] = out * makeup;
        }
        // évite les nombres dénormalisés une fois la voix silencieuse
        st[0] = Math.abs(y1) < 1e-15 ? 0 : y1;
        st[1] = Math.abs(y2) < 1e-15 ? 0 : y2;
        st[2] = Math.abs(y3) < 1e-15 ? 0 : y3;
        st[3] = Math.abs(y4) < 1e-15 ? 0 : y4;
      }
      return true;
    }
  }

  class Svf extends scope.AudioWorkletProcessor {
    static get parameterDescriptors() {
      return PARAMS;
    }
    constructor(options) {
      super();
      this.mode = modeOf(options);
      this.s = [];
    }
    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const output = outputs[0];
      if (!input || !input.length) return true;
      const fr = parameters.frequency;
      // amortissement : 0..30 -> R 1..0.02 (Q 0.5..25)
      const R = Math.max(0.02, Math.exp(-parameters.q[0] / 7));
      const dr = parameters.drive[0];
      const dg = 1 + 3 * dr * dr;
      const mode = this.mode;
      for (let c = 0; c < output.length; c++) {
        const x = input[Math.min(c, input.length - 1)];
        const y = output[c];
        const st = this.s[c] || (this.s[c] = [0, 0]);
        let s1 = st[0];
        let s2 = st[1];
        let lastF = -1;
        let g = 0;
        let h = 0;
        for (let n = 0; n < y.length; n++) {
          const f = clamp(fr.length > 1 ? fr[n] : fr[0], 10, sampleRate * 0.45);
          if (f !== lastF) {
            g = Math.tan((PI * f) / sampleRate);
            h = 1 / (1 + 2 * R * g + g * g);
            lastF = f;
          }
          const xin = tanh(x[n] * dg) / Math.sqrt(dg) * 1.2;
          const hp = (xin - (2 * R + g) * s1 - s2) * h;
          const bp = g * hp + s1;
          s1 = tanh(g * hp + bp); // légère saturation de l'intégrateur : caractère « SEM »
          const lp = g * bp + s2;
          s2 = g * bp + lp;
          y[n] = mode === 1 ? hp : mode === 2 ? bp * 2 * R : mode === 3 ? xin - 2 * R * bp : lp;
        }
        st[0] = Math.abs(s1) < 1e-15 ? 0 : s1;
        st[1] = Math.abs(s2) < 1e-15 ? 0 : s2;
      }
      return true;
    }
  }

  scope.registerProcessor('ss-ladder', Ladder);
  scope.registerProcessor('ss-svf', Svf);
}

SS.filters = (() => {
  let state = null; // { ctx, ready, promise }
  const MODES = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3 };

  /** Charge le module (URL Blob : fonctionne aussi en ouvrant index.html directement). */
  function load(ctx) {
    if (state && state.ctx === ctx) return state.promise;
    const st = { ctx, ready: false, promise: null };
    state = st;
    if (!ctx.audioWorklet) {
      st.promise = Promise.reject(new Error('AudioWorklet indisponible'));
      st.promise.catch(() => {});
      return st.promise;
    }
    const url = URL.createObjectURL(new Blob([`(${ssFiltersModule.toString()})(globalThis);`], { type: 'application/javascript' }));
    st.promise = ctx.audioWorklet
      .addModule(url)
      .then(() => {
        st.ready = true;
      })
      .finally(() => URL.revokeObjectURL(url));
    st.promise.catch((e) => console.warn('Filtres ladder / SEM : module audio non chargé', e));
    return st.promise;
  }

  const ready = (ctx) => !!(state && state.ctx === ctx && state.ready);

  /**
   * Filtre d'une voix. Renvoie { input, output, freqs } où `freqs` liste les AudioParam de fréquence
   * à automatiser (l'enveloppe de filtre les pilote tous de la même façon).
   * Si le module n'est pas encore prêt, ladder / SEM retombent sur le 24 dB.
   */
  function create(ctx, p) {
    const type = p.filter || 'lowpass';
    let model = p.ftype || '12db';
    if ((model === 'ladder' || model === 'sem') && !ready(ctx)) {
      load(ctx);
      model = '24db';
    }
    if (model === 'ladder' || model === 'sem') {
      const node = new AudioWorkletNode(ctx, model === 'ladder' ? 'ss-ladder' : 'ss-svf', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        outputChannelCount: [1],
        processorOptions: { mode: MODES[type] ?? 0 },
      });
      node.parameters.get('q').value = Math.max(0, p.q);
      node.parameters.get('drive').value = Math.max(0, Math.min(1, p.fdrive ?? 0.5));
      return { input: node, output: node, freqs: [node.parameters.get('frequency')] };
    }
    const bq = (q) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      return f;
    };
    const q = Math.max(0.0001, p.q);
    const f1 = bq(q);
    if (model !== '24db') return { input: f1, output: f1, freqs: [f1.frequency] };
    // 24 dB : deuxième étage sans pic (Q en dB pour passe-bas / passe-haut : -3 dB ≈ Butterworth)
    const f2 = bq(type === 'lowpass' || type === 'highpass' ? -3 : q);
    f1.connect(f2);
    return { input: f1, output: f2, freqs: [f1.frequency, f2.frequency] };
  }

  return { load, ready, create };
})();
