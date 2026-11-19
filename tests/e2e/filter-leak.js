/*
 * Fuite des filtres ladder / SEM (AudioWorklet) : chaque note créait un filtre qui renvoyait toujours true,
 * donc restait vivant et calculé à chaque bloc après la fin de la voix. En boucle, des milliers de filtres
 * fantômes s'accumulaient jusqu'aux coupures de son. On vérifie que le son passe, que les filtres sont libérés
 * (compteur à 0) et que le temps de rendu ne gonfle pas quand on joue beaucoup de notes.
 *   node tests/e2e/filter-leak.js
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage();
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  // n notes courtes (16 par seconde) à travers un filtre ladder / SEM, rendu hors temps réel. Comme le séquenceur,
  // on crée les notes juste avant de les jouer (suspend toutes les 0,25 s). `dispose` : fin de voix comme le moteur.
  const render = (n, ftype, dispose) =>
    page.evaluate(
      async ({ n, ftype, dispose }) => {
        const sec = n / 16 + 0.5;
        const ctx = new OfflineAudioContext(1, Math.ceil(48000 * sec), 48000);
        await SS.filters.load(ctx);
        const count = () => (SS.filters.aliveCount ? SS.filters.aliveCount() : 0);
        const alive0 = count();
        const ended = [];
        const add = (i) => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          const f = SS.filters.create(ctx, { filter: 'lowpass', ftype, q: 8, cutoff: 800 });
          f.freqs[0].value = 800;
          o.connect(f.input);
          f.output.connect(ctx.destination);
          o.start(0.1 + i / 16);
          o.stop(0.15 + i / 16);
          ended.push({ end: 0.16 + i / 16, f });
        };
        let next = 0;
        const plan = (t) => {
          // fin des voix passées (le moteur le fait sur onended, asynchrone en hors temps réel)
          if (dispose) while (ended.length && ended[0].end < t) ended.shift().f.dispose();
          while (next < n && 0.1 + next / 16 < t + 0.3) add(next++);
        };
        for (let t = 0.25; t < sec; t += 0.25) ctx.suspend(t).then(() => (plan(t), ctx.resume()));
        plan(0);
        const t0 = performance.now();
        const buf = await ctx.startRendering();
        const ms = performance.now() - t0;
        if (dispose) ended.splice(0).forEach((e) => e.f.dispose());
        const d = buf.getChannelData(0);
        let peak = 0;
        for (let i = 4800; i < 4800 + 2400; i++) peak = Math.max(peak, Math.abs(d[i]));
        return { ms, peak, alive: count() - alive0 };
      },
      { n, ftype, dispose }
    );
  for (const ftype of ['ladder', 'sem']) {
    for (const dispose of process.env.ONLY_RAW ? [false] : [true, false]) {
      const how = dispose ? 'voix libérées' : 'sans libération';
      const few = await render(32, ftype, dispose);
      const many = await render(320, ftype, dispose);
      console.log(`${ftype} (${how}) : 32 notes ${few.ms.toFixed(0)} ms, 320 notes ${many.ms.toFixed(0)} ms`);
      ok(few.peak > 0.01, `${ftype} (${how}) : la première note sonne (crête ${few.peak.toFixed(3)})`);
      if (dispose) ok(many.alive === 0, `${ftype} : compteur des filtres à 0 après la fin des voix (restants ${many.alive})`);
      // 10× plus de notes sur 10× plus de temps : sans fuite le rendu grandit à peu près linéairement ;
      // avec des filtres fantômes calculés jusqu'à la fin, il grandit comme le carré (≈ 100×).
      ok(many.ms < few.ms * 10 * 3 + 300, `${ftype} (${how}) : pas de filtres fantômes calculés après la fin des notes`);
    }
  }
  await b.close();
  server.close();
})();
