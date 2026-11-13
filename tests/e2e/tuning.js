/*
 * Accordage : chaque instrument échantillonné doit jouer la note demandée (à quelques centièmes près),
 * comme le synthé intégré. Rendu hors temps réel puis mesure de la fréquence fondamentale (YIN).
 *   node tests/e2e/tuning.js   (sons téléchargés depuis GitHub : réseau nécessaire)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

const CASES = [
  // [famille, instrument, variante, note midi, tolérance en centièmes]
  ['synth', 'syn_sine', 0, 60, 3],
  ['keys', 'gm_piano', 1, 60, 8], // FluidR3 : échantillons ~12 c trop hauts
  ['guitar', 'gm_acoustic_guitar_steel', 8, 50, 8], // 0254 : échantillons 1,4 demi-ton trop bas
  ['guitar', 'gm_acoustic_guitar_steel', 0, 50, 8], // 0253 (variante par défaut) : originalPitch écrit « 4200-140 »
  ['mallets', 'vcsl_xylophone_soft_ff', 0, 72, 8],
  ['bass', 'dirt_pluck', 0, 40, 10],
];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  for (const [family, instrument, sfv, midi, tol] of CASES) {
    const p = await b.newPage();
    await p.goto(`http://localhost:${server.address().port}/index.html`);
    const cents = await p.evaluate(
      async ({ family, instrument, sfv, midi }) => {
        const SR = 44100;
        window.AudioContext = class extends OfflineAudioContext {
          constructor() {
            super(1, SR * 1.5, SR);
          }
        };
        SS.audio.ensureCtx();
        const track = { id: 't', type: 'instrument', family, instrument, sfv };
        await SS.audio.preparePreview(track, midi);
        const out = SS.audio._master();
        const ctx = out.context;
        const rec = ctx.createGain();
        rec.connect(ctx.destination);
        await SS.audio.playNote(track, midi, 0, 1.2, 0.9, rec);
        const x = (await ctx.startRendering()).getChannelData(0);
        // YIN sur la partie stable (0,3 à 1 s) : médiane des fenêtres
        const yin = (s0) => {
          const n = 4096, W = n / 2, d = new Float64Array(W);
          for (let t = 1; t < W; t++) {
            let acc = 0;
            for (let i = 0; i < W; i++) { const v = x[s0 + i] - x[s0 + i + t]; acc += v * v; }
            d[t] = acc;
          }
          let sum = 0;
          for (let t = 1; t < W; t++) {
            sum += d[t];
            d[t] = (d[t] * t) / (sum || 1);
          }
          for (let t = 20; t < W - 1; t++) {
            if (d[t] < 0.15 && d[t] <= d[t + 1]) {
              const den = d[t - 1] - 2 * d[t] + d[t + 1];
              return SR / (t + (den ? (0.5 * (d[t - 1] - d[t + 1])) / den : 0));
            }
          }
          return null;
        };
        const cs = [];
        for (let s0 = 0.3 * SR; s0 < 1.0 * SR; s0 += 2048) {
          const f = yin(Math.round(s0));
          if (!f) continue;
          const c = 1200 * Math.log2(f / (440 * Math.pow(2, (midi - 69) / 12)));
          cs.push(c - 1200 * Math.round(c / 1200)); // l'octave des échantillons n'est pas en cause ici
        }
        if (!cs.length) return null;
        cs.sort((a, b) => a - b);
        return cs[cs.length >> 1];
      },
      { family, instrument, sfv, midi }
    );
    ok(cents !== null && Math.abs(cents) <= tol, `${instrument} (variante ${sfv}) : écart ${cents === null ? '?' : cents.toFixed(1)} c (tolérance ${tol})`);
    await p.close();
  }
  await b.close();
  server.close();
})();
