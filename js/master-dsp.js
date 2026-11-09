/*
 * Mastering de la sortie générale (AudioWorklet), dernier maillon après la tranche Master et son fader :
 *
 *   entrée -> graves en mono (filtre de Linkwitz-Riley 24 dB/oct : sous la fréquence choisie, gauche = droite)
 *          -> largeur stéréo des médiums / aigus (matrice Mid / Side)
 *          -> gain d'entrée (« drive », pour atteindre le volume perçu visé)
 *          -> écrêtage doux des transitoires (« clip ») : arrondit les pointes (kick, caisse claire) avant le limiteur,
 *             qui travaille alors moins et pompe moins
 *          -> limiteur à anticipation (look-ahead 5 ms, détection des crêtes entre échantillons,
 *             relâchement adaptatif) avec plafond en dBTP
 *          -> mesure EBU R128 / ITU-R BS.1770 : LUFS momentané (400 ms), court terme (3 s), intégré (avec
 *             portes absolue −70 LUFS et relative −10 LU), true peak (sur-échantillonnage x4), réduction de gain.
 *
 * Les mesures sont envoyées environ 10 fois par seconde par le port du nœud ; « reset » remet l'intégré à zéro.
 */
window.SS = window.SS || {};

function ssMasterModule(scope) {
  const sr = scope.sampleRate;
  const dbToLin = (db) => Math.pow(10, db / 20);
  const linToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

  /** Biquad (forme directe transposée II) ; coefficients normalisés [b0, b1, b2, a1, a2]. */
  class Biquad {
    constructor(c) {
      this.c = c;
      this.z1 = 0;
      this.z2 = 0;
    }
    run(x) {
      const [b0, b1, b2, a1, a2] = this.c;
      const y = b0 * x + this.z1;
      this.z1 = b1 * x - a1 * y + this.z2;
      this.z2 = b2 * x - a2 * y;
      return y;
    }
  }
  /** Passe-bas / passe-haut de Butterworth 2e ordre (Q = 1/√2) ; deux en série = Linkwitz-Riley 4e ordre. */
  function butter(type, f) {
    const w = (2 * Math.PI * f) / sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.SQRT1_2);
    const a0 = 1 + al;
    const b = type === 'lp' ? [(1 - cs) / 2, 1 - cs, (1 - cs) / 2] : [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
    return [b[0] / a0, b[1] / a0, b[2] / a0, (-2 * cs) / a0, (1 - al) / a0];
  }
  /** Filtre de pondération K (BS.1770) à la fréquence d'échantillonnage du contexte. */
  function kWeighting() {
    // étage 1 : plateau aigu (+4 dB vers 1,7 kHz)
    let f0 = 1681.974450955533;
    let G = 3.999843853973347;
    let Q = 0.7071752369554196;
    let K = Math.tan((Math.PI * f0) / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const shelf = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
    // étage 2 : passe-haut (RLB) vers 38 Hz
    f0 = 38.13547087602444;
    Q = 0.5003270373238773;
    K = Math.tan((Math.PI * f0) / sr);
    a0 = 1 + K / Q + K * K;
    const hp = [1 / a0, -2 / a0, 1 / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
    return [shelf, hp];
  }
  // sur-échantillonnage x4 pour le true peak : interpolation cubique (Catmull-Rom) aux 3 points intermédiaires
  const cubic = (x0, x1, x2, x3, t) =>
    x1 + 0.5 * t * (x2 - x0 + t * (2 * x0 - 5 * x1 + 4 * x2 - x3 + t * (3 * (x1 - x2) + x3 - x0)));

  class Master extends scope.AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: 'drive', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' }, // dB
        { name: 'ceiling', defaultValue: -1, minValue: -12, maxValue: 0, automationRate: 'k-rate' }, // dBTP
        { name: 'width', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
        { name: 'mono', defaultValue: 100, minValue: 0, maxValue: 300, automationRate: 'k-rate' }, // Hz, 0 = coupé
        { name: 'release', defaultValue: 0.12, minValue: 0.01, maxValue: 1, automationRate: 'k-rate' }, // s
        { name: 'active', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'clip', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }, // 0 = coupé
      ];
    }
    constructor() {
      super();
      this.monoF = -1;
      this.xo = null;
      // limiteur : ligne à retard (look-ahead), minimum glissant et moyenne glissante du gain requis
      this.L = Math.max(16, Math.round(sr * 0.005));
      this.dl = [new Float32Array(this.L), new Float32Array(this.L)];
      this.req = new Float32Array(this.L); // gains requis (fenêtre du minimum glissant)
      this.box = new Float32Array(this.L); // fenêtre de la moyenne glissante
      this.boxSum = this.L;
      this.box.fill(1);
      this.req.fill(1);
      this.pos = 0;
      this.g = 1;
      this.hist = [new Float32Array(4), new Float32Array(4)]; // 4 derniers échantillons (crêtes inter-échantillons)
      // mesure
      this.kw = [kWeighting(), kWeighting()].map(([a, b]) => [new Biquad(a), new Biquad(b)]);
      this.block = Math.round(sr * 0.1);
      this.acc = 0;
      this.n = 0;
      this.sub = []; // énergies des blocs de 100 ms
      this.gated = []; // énergies des fenêtres de 400 ms (intégré)
      this.tp = 0;
      this.tpOut = [new Float32Array(4), new Float32Array(4)];
      this.grMax = 0;
      this.port.onmessage = (e) => {
        if (e.data === 'reset') {
          this.gated = [];
          this.sub = [];
          this.tp = 0;
        }
      };
    }
    crossover(f) {
      this.monoF = f;
      if (!f) return (this.xo = null);
      const lp = butter('lp', f);
      const hp = butter('hp', f);
      this.xo = [0, 1].map(() => ({ l1: new Biquad(lp), l2: new Biquad(lp), h1: new Biquad(hp), h2: new Biquad(hp) }));
    }
    process(inputs, outputs, params) {
      const inp = inputs[0];
      const out = outputs[0];
      if (!out || !out.length) return true;
      const N = out[0].length;
      const inL = inp && inp[0] ? inp[0] : new Float32Array(N);
      const inR = inp && inp[1] ? inp[1] : inL;
      const outL = out[0];
      const outR = out[1] || out[0];
      const active = params.active[0] > 0.5;
      const drive = dbToLin(params.drive[0]);
      const ceil = dbToLin(params.ceiling[0]);
      const ceilIn = ceil * 0.95;
      // écrêteur doux : linéaire jusqu'au genou, puis courbe tanh qui plafonne à `top` (au-dessus du plafond du
      // limiteur : l'écrêteur rabote les pointes, le limiteur finit le travail)
      const clipAmt = params.clip[0];
      const top = ceil * Math.pow(10, (3 - 2 * clipAmt) / 20);
      const knee = top * (0.9 - 0.35 * clipAmt);
      const soft = (x) => {
        const a = x < 0 ? -x : x;
        if (a <= knee) return x;
        const y = knee + (top - knee) * Math.tanh((a - knee) / (top - knee));
        return x < 0 ? -y : y;
      };
      const width = params.width[0];
      const rel = Math.exp(-1 / (sr * Math.max(0.01, params.release[0])));
      const relSlow = Math.exp(-1 / (sr * Math.max(0.05, params.release[0] * 4)));
      const mono = Math.round(params.mono[0]);
      if (active && mono !== this.monoF) this.crossover(mono);
      const L = this.L;
      let grBlock = 0;
      for (let i = 0; i < N; i++) {
        let l = inL[i];
        let r = inR[i];
        if (active) {
          // graves en mono, largeur des aigus
          if (this.xo) {
            const [a, b] = this.xo;
            const lowL = a.l2.run(a.l1.run(l));
            const lowR = b.l2.run(b.l1.run(r));
            let hL = a.h2.run(a.h1.run(l));
            let hR = b.h2.run(b.h1.run(r));
            const m = (hL + hR) / 2;
            const s = ((hL - hR) / 2) * width;
            hL = m + s;
            hR = m - s;
            // Linkwitz-Riley 4e ordre : graves + aigus = passe-tout (réponse plate)
            const low = (lowL + lowR) / 2;
            l = hL + low;
            r = hR + low;
          } else if (width !== 1) {
            const m = (l + r) / 2;
            const s = ((l - r) / 2) * width;
            l = m + s;
            r = m - s;
          }
          l *= drive;
          r *= drive;
          if (clipAmt > 0) {
            l = soft(l);
            r = soft(r);
          }
          // détection : crête des échantillons et des points intermédiaires (≈ true peak)
          const hl = this.hist[0];
          const hr = this.hist[1];
          hl[0] = hl[1]; hl[1] = hl[2]; hl[2] = hl[3]; hl[3] = l;
          hr[0] = hr[1]; hr[1] = hr[2]; hr[2] = hr[3]; hr[3] = r;
          let pk = Math.max(Math.abs(l), Math.abs(r));
          for (let q = 1; q < 4; q++) pk = Math.max(pk, Math.abs(cubic(hl[0], hl[1], hl[2], hl[3], q / 4)), Math.abs(cubic(hr[0], hr[1], hr[2], hr[3], q / 4)));
          // seuil interne 0,45 dB sous le plafond : marge pour les crêtes entre échantillons
          const need = pk > ceilIn ? ceilIn / pk : 1;
          // gain requis le plus faible de la fenêtre à venir, lissé sur la même durée : le gain atteint sa valeur
          // pile quand la crête sort de la ligne à retard
          const p = this.pos;
          this.req[p] = need;
          let mn = 1;
          for (let k = 0; k < L; k++) if (this.req[k] < mn) mn = this.req[k];
          this.boxSum += mn - this.box[p];
          this.box[p] = mn;
          const target = this.boxSum / L;
          // relâchement adaptatif : rapide après un coup isolé, lent quand la réduction dure
          if (target < this.g) this.g = target;
          else {
            const c = this.g < 0.7 ? relSlow : rel;
            this.g = target + (this.g - target) * c;
          }
          const dL = this.dl[0][p];
          const dR = this.dl[1][p];
          this.dl[0][p] = l;
          this.dl[1][p] = r;
          this.pos = (p + 1) % L;
          l = dL * this.g;
          r = dR * this.g;
          // sécurité : jamais au-dessus du plafond
          if (l > ceil) l = ceil; else if (l < -ceil) l = -ceil;
          if (r > ceil) r = ceil; else if (r < -ceil) r = -ceil;
          const gr = -linToDb(this.g);
          if (gr > grBlock) grBlock = gr;
        }
        outL[i] = l;
        if (outR !== outL) outR[i] = r;
        // mesure (après le limiteur) : pondération K, énergie, true peak x4
        const kl = this.kw[0][1].run(this.kw[0][0].run(l));
        const kr = this.kw[1][1].run(this.kw[1][0].run(r));
        this.acc += kl * kl + kr * kr;
        const tl = this.tpOut[0];
        const tr = this.tpOut[1];
        tl[0] = tl[1]; tl[1] = tl[2]; tl[2] = tl[3]; tl[3] = l;
        tr[0] = tr[1]; tr[1] = tr[2]; tr[2] = tr[3]; tr[3] = r;
        let t = Math.max(Math.abs(tl[2]), Math.abs(tr[2]));
        for (let q = 1; q < 4; q++) t = Math.max(t, Math.abs(cubic(tl[0], tl[1], tl[2], tl[3], q / 4)), Math.abs(cubic(tr[0], tr[1], tr[2], tr[3], q / 4)));
        if (t > this.tp) this.tp = t;
        if (++this.n >= this.block) this.flush();
      }
      if (grBlock > this.grMax) this.grMax = grBlock;
      return true;
    }
    flush() {
      const LUFS = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
      this.sub.push(this.acc / this.n);
      this.acc = 0;
      this.n = 0;
      if (this.sub.length > 30) this.sub.shift();
      const mean = (k) => {
        const a = this.sub.slice(-k);
        return a.reduce((x, y) => x + y, 0) / a.length;
      };
      const m = mean(4);
      if (this.sub.length >= 4 && LUFS(m) > -70) this.gated.push(m);
      // intégré : porte relative à −10 LU sous la moyenne des fenêtres au-dessus de −70 LUFS
      let I = -Infinity;
      if (this.gated.length) {
        const avg = this.gated.reduce((x, y) => x + y, 0) / this.gated.length;
        const rel = avg * Math.pow(10, -1); // −10 LU
        const kept = this.gated.filter((e) => e > rel);
        if (kept.length) I = LUFS(kept.reduce((x, y) => x + y, 0) / kept.length);
      }
      this.port.postMessage({ m: LUFS(m), s: LUFS(mean(30)), i: I, tp: linToDb(this.tp), gr: this.grMax, secs: this.gated.length / 10 });
      this.grMax = 0;
    }
  }
  scope.registerProcessor('ss-master', Master);
}

SS.mastering = (() => {
  let state = null;
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
    const url = URL.createObjectURL(new Blob([`(${ssMasterModule.toString()})(globalThis);`], { type: 'application/javascript' }));
    st.promise = ctx.audioWorklet
      .addModule(url)
      .then(() => (st.ready = true))
      .finally(() => URL.revokeObjectURL(url));
    st.promise.catch((e) => console.warn('Mastering : module audio non chargé', e));
    return st.promise;
  }
  function create(ctx) {
    return new AudioWorkletNode(ctx, 'ss-master', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
  }
  return { load, create, _module: ssMasterModule };
})();
