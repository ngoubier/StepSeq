/*
 * Régularité de la lecture sous charge : mode chanson, piano roll ouvert, processeur ralenti 4 fois.
 * Avant correction, la reconstruction de l'affichage au changement de bloc et la tête de lecture du piano roll
 * (une colonne de cases allumée à chaque pas) retardaient des notes de plusieurs centaines de ms.
 *   node tests/e2e/timing-load.js   (environ 30 s)
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
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // « Train de nuit » : scènes de 4 et 8 mesures (la grille est reconstruite au changement de bloc)
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => { if (!sessionStorage.done) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.done = 1; } }, demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1500);
  await page.locator('.track:has(.th-roll)').first().locator('.th-roll').first().click();
  await page.waitForTimeout(300);
  ok((await page.locator('.roll').count()) === 1, 'piano roll ouvert');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.click('#play');
  await page.waitForTimeout(3000);
  // la tête de lecture du piano roll est une barre, pas une colonne de cases allumées
  ok((await page.locator('.roll-playhead:visible').count()) === 1, 'barre de lecture du piano roll visible');
  ok((await page.locator('.rcell.now').count()) === 0, 'aucune case du piano roll allumée une à une');
  await page.waitForTimeout(23000); // deux changements de bloc (Intro 4 mes. -> Couplet 8 mes. -> Refrain)
  const s = await page.evaluate(() => SS.audio.diagnostics().scheduling);
  await page.click('#play');
  ok(s.lateSteps <= 2 && s.maxLateMs < 40, `pas programmés en retard : ${s.lateSteps}, retard max ${Math.round(s.maxLateMs)} ms (avant : ~110 pas, jusqu'à 830 ms)`);
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
