/*
 * Longue scène (import MIDI : 64 mesures, 24 pistes de batterie = 24 000 cases) : la lecture ne bloque plus la page.
 * Avant : à chaque pas, la page entière était remise en page et redessinée (la règle, le filtre de la note jouée,
 * des milliers de cases), les notes partaient en retard. Les cases sont maintenant regroupées par paquets de
 * 4 mesures, et ceux hors de l'écran sont sautés (content-visibility).
 *   node tests/e2e/long-scene.js   (environ 20 s)
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
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const BARS = 64;
  const n = BARS * 16;
  const tracks = Array.from({ length: 24 }, (_, i) => ({
    id: 'd' + i, name: 'Batterie ' + (i + 1), type: 'drum', source: 'gm', machine: 'RolandTR808', bank: String(35 + i), volume: 0.3,
    steps: Array.from({ length: n }, (_, s) => (s % 16 === (i * 3) % 16 ? 0.8 : 0)),
  }));
  const proj = { format: 'stepseq', version: 1, title: 'Longue scène', tempo: 150, bars: BARS, tracks, scenes: [], song: [] };
  await page.addInitScript((p) => { if (!sessionStorage.done) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.done = 1; } }, proj);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(2000);

  const s = await page.evaluate(() => {
    const g = document.querySelector('.track-grid');
    const chunks = g.querySelectorAll(':scope > .cell-chunk');
    const cells = [...g.querySelectorAll('.cell')];
    const cv = getComputedStyle(chunks[0]).contentVisibility;
    // les cases restent alignées sur la règle (cases ordinaires, hors début de temps ou de mesure)
    document.querySelector('#workspace').scrollLeft = 0;
    const at = (st) => [document.querySelector(`#ruler [data-step="${st}"]`), cells[st]].map((e) => e.getBoundingClientRect().left);
    return { chunks: chunks.length, cells: cells.length, perChunk: chunks[1].children.length, cv, d1: at(1), d17: at(17), d513: at(513) };
  });
  ok(s.cells === n && s.chunks === BARS / 4 && s.perChunk === 64, `cases par paquets de 4 mesures (${s.chunks} paquets, ${s.cells} cases)`);
  ok(s.cv === 'auto', 'scène longue : paquets hors écran sautés (content-visibility auto)');
  const off = ['d1', 'd17', 'd513'].map((k) => Math.abs(s[k][1] - s[k][0]));
  ok(off.every((d) => Math.abs(d - off[0]) < 1), `cases alignées sur la règle (écarts ${off.map((d) => d.toFixed(1)).join(' / ')} px)`);

  // lecture : on mesure le temps de travail de la page (mise en page, dessin, scripts) par seconde
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  await page.mouse.move(900, 500); // pointeur au-dessus de la grille, comme pendant l'écoute
  await page.click('#play');
  await page.waitForTimeout(1500);
  const t0 = await task();
  await page.waitForTimeout(6000);
  const busy = ((await task()) - t0) / 6;
  const sched = await page.evaluate(() => SS.audio.diagnostics().scheduling);
  await page.click('#play');
  ok(sched.lateSteps <= 2, `pas programmés en retard : ${sched.lateSteps} (max ${Math.round(sched.maxLateMs)} ms)`);
  console.log(`     page occupée ${Math.round(busy * 1000)} ms par seconde de lecture (avant la correction : ~650 ms sur la même machine de test)`);
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
