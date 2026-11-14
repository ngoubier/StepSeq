/*
 * « Cosmos » : reverb algorithmique longue pour l'ambient et la techno (AudioWorklet), bus partagé du morceau.
 * Implémentation propre à StepSeq.
 *
 *  - Diffusion d'entrée : 4 passe-tout en série par canal (le son s'étale avant d'entrer dans la reverb).
 *  - Réseau de 8 lignes à retard bouclées (FDN) mélangées par une matrice de Hadamard (énergie conservée),
 *    amortissement des aigus par ligne (passe-bas à un pôle), longueurs modulées lentement (queue sans
 *    résonances métalliques).
 *  - decay  : durée de la queue (RT60, s) ; size : taille de la pièce (longueur des lignes).
 *  - freeze : la queue tient indéfiniment (boucle sans perte, entrée coupée) — fondu sur ~50 ms.
 *  - shimmer : la sortie, transposée d'une octave (deux têtes de lecture glissantes, fondu en sinus), est
 *    réinjectée dans le réseau : chaque passage monte d'une octave, la queue « s'élève ».
 * Entrée et sortie stéréo. Le pré-délai et les filtres du retour sont des nœuds Web Audio (js/audio.js).
 */
window.SS = window.SS || {};

function ssSpaceModule(scope) {
  const N = 8;
  const SIZE = 32768; // longueur des tampons (puissance de 2)
  const MASK = SIZE - 1;
  const BASE = [1777, 1931, 2087, 2269, 2459, 2647, 2843, 3061]; // échantillons à 48 kHz, premiers entre eux
  const DIFF = [142, 107, 379, 277];
  const softClip = (x) => (x > 1.5 || x < -1.5 ? Math.tanh(x) * 1.5 : x);

  class Space extends scope.AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: 'decay', defaultValue: 8, minValue: 0.3, maxValue: 120, automationRate: 'k-rate' },
        { name: 'size', defaultValue: 0.8, minValue: 0.1, maxValue: 1, automationRate: 'k-rate' },
        { name: 'damp', defaultValue: 6000, minValue: 500, maxValue: 20000, automationRate: 'k-rate' },
        { name: 'mod', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'shimmer', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'freeze', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      ];
    }
    constructor() {
      super();
      const k = sampleRate / 48000;
      this.lines = BASE.map(() => new Float32Array(SIZE));
      this.base = BASE.map((n) => n * k);
      this.lp = new Float64Array(N);
      this.phase = BASE.map((_, i) => i / N);
      this.rate = BASE.map((_, i) => (0.07 + 0.045 * i) / sampleRate);
      this.w = 0;
      // diffusion : 2 canaux × 4 passe-tout
      this.diff = [0, 1].map((c) => DIFF.map((n) => ({ buf: new Float32Array(2048), len: Math.round(n * k * (c ? 1.13 : 1)), i: 0 })));
      // shimmer : transposition d'une octave
      this.ps = new Float32Array(SIZE);
      this.psW = 0;
      this.psPh = 0;
      this.psWin = Math.round(0.09 * sampleRate);
      this.shHp = 0;
      this.shOut = 0;
      this.fz = 0;
      this.y = new Float64Array(N);
    }
    allpass(ap, x) {
      const g = 0.62;
      const d = ap.buf[ap.i];
      const y = -g * x + d;
      ap.buf[ap.i] = x + g * y;
      ap.i = ap.i + 1 >= ap.len ? 0 : ap.i + 1;
      return y;
    }
    process(inputs, outputs, parameters) {
      const input = inputs[0] || [];
      const out = outputs[0];
      const inL = input[0];
      const inR = input[1] || input[0];
      const oL = out[0];
      const oR = out[1] || out[0];
      const n = oL.length;
      const decay = parameters.decay[0];
      const size = 0.35 + 1.15 * parameters.size[0];
      const dampC = 1 - Math.exp((-2 * Math.PI * parameters.damp[0]) / sampleRate);
      const modDepth = parameters.mod[0] * 9 * (sampleRate / 48000);
      const shimmer = parameters.shimmer[0] * 0.42;
      const fzTarget = parameters.freeze[0] > 0.5 ? 1 : 0;
      const fzStep = 1 / (0.05 * sampleRate);
      const lens = this.base.map((b) => b * size);
      const gains = lens.map((l) => Math.pow(10, (-3 * l) / (Math.max(0.1, decay) * sampleRate)));
      const lines = this.lines;
      const lp = this.lp;
      const y = this.y;
      const shHpC = 1 - Math.exp((-2 * Math.PI * 250) / sampleRate);
      for (let s = 0; s < n; s++) {
        // fondu du gel
        if (this.fz < fzTarget) this.fz = Math.min(1, this.fz + fzStep);
        else if (this.fz > fzTarget) this.fz = Math.max(0, this.fz - fzStep);
        const fz = this.fz;
        const keep = 1 - fz;
        let a = inL ? inL[s] : 0;
        let b = inR ? inR[s] : 0;
        for (const ap of this.diff[0]) a = this.allpass(ap, a);
        for (const ap of this.diff[1]) b = this.allpass(ap, b);
        // shimmer : sortie précédente transposée, sans graves, réinjectée
        const sh = this.shOut * shimmer;
        a = (a + sh) * keep;
        b = (b - sh) * keep;
        // lecture des lignes (retard modulé, interpolation linéaire) et amortissement
        const w = this.w;
        for (let i = 0; i < N; i++) {
          this.phase[i] += this.rate[i];
          if (this.phase[i] >= 1) this.phase[i] -= 1;
          const d = lens[i] + modDepth * Math.sin(2 * Math.PI * this.phase[i]);
          const pos = w - d;
          const i0 = Math.floor(pos);
          const fr = pos - i0;
          const buf = lines[i];
          const r = buf[i0 & MASK] * (1 - fr) + buf[(i0 + 1) & MASK] * fr;
          const c = dampC * keep + fz; // gelé : plus d'amortissement
          lp[i] += c * (r - lp[i]);
          y[i] = lp[i];
        }
        // matrice de Hadamard 8×8 (transformée rapide), normalisée
        for (let h = 1; h < N; h <<= 1) {
          for (let i = 0; i < N; i += h << 1) {
            for (let j = i; j < i + h; j++) {
              const u = y[j];
              const v = y[j + h];
              y[j] = u + v;
              y[j + h] = u - v;
            }
          }
        }
        const norm = 1 / Math.sqrt(N);
        for (let i = 0; i < N; i++) {
          const g = gains[i] * keep + fz;
          const inj = i < N / 2 ? (i & 1 ? -a : a) : i & 1 ? -b : b;
          lines[i][w] = softClip(y[i] * norm * g + inj * 0.5);
        }
        this.w = (w + 1) & MASK;
        // sortie : deux combinaisons différentes des lignes (stéréo décorrélée)
        const L = (lp[0] - lp[2] + lp[4] - lp[6] + 0.5 * (lp[1] + lp[5])) * 0.45;
        const R = (lp[1] - lp[3] + lp[5] - lp[7] + 0.5 * (lp[2] + lp[6])) * 0.45;
        oL[s] = L;
        if (oR !== oL) oR[s] = R;
        // transposition d'une octave (lecture deux fois plus rapide, deux têtes en fondu)
        if (shimmer > 0) {
          const mono = 0.5 * (L + R);
          this.ps[this.psW] = mono;
          const W = this.psWin;
          this.psPh += 1 / W;
          if (this.psPh >= 1) this.psPh -= 1;
          let acc = 0;
          for (let t = 0; t < 2; t++) {
            let p = this.psPh + t * 0.5;
            if (p >= 1) p -= 1;
            const pos = this.psW - (1 - p) * W;
            const i0 = Math.floor(pos);
            const fr = pos - i0;
            const v = this.ps[i0 & MASK] * (1 - fr) + this.ps[(i0 + 1) & MASK] * fr;
            acc += v * Math.sin(Math.PI * p);
          }
          this.psW = (this.psW + 1) & MASK;
          this.shHp += shHpC * (acc - this.shHp);
          this.shOut = softClip(acc - this.shHp);
        } else this.shOut = 0;
      }
      // évite les nombres dénormalisés
      for (let i = 0; i < N; i++) if (Math.abs(lp[i]) < 1e-20) lp[i] = 0;
      return true;
    }
  }
  scope.registerProcessor('ss-space', Space);
}

SS.space = (() => {
  const states = new WeakMap(); // ctx -> { ready, promise }

  /** Charge le module (URL Blob : fonctionne aussi en ouvrant index.html directement). */
  function load(ctx) {
    const known = states.get(ctx);
    if (known) return known.promise;
    const st = { ready: false, promise: null };
    states.set(ctx, st);
    if (!ctx.audioWorklet) {
      st.promise = Promise.reject(new Error('AudioWorklet indisponible'));
      st.promise.catch(() => {});
      return st.promise;
    }
    const url = URL.createObjectURL(new Blob([`(${ssSpaceModule.toString()})(globalThis);`], { type: 'application/javascript' }));
    st.promise = ctx.audioWorklet
      .addModule(url)
      .then(() => {
        st.ready = true;
      })
      .finally(() => URL.revokeObjectURL(url));
    st.promise.catch((e) => console.warn('Reverb Cosmos : module audio non chargé', e));
    return st.promise;
  }
  const ready = (ctx) => !!(states.get(ctx) && states.get(ctx).ready);
  function create(ctx) {
    return new AudioWorkletNode(ctx, 'ss-space', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit',
      outputChannelCount: [2],
    });
  }
  return { load, ready, create };
})();
