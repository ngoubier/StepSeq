/*
 * Étape Batterie de « Nouvelle chanson » (js/band.js, kitChips) : un motif qui joue un élément absent du kit du batteur
 * (tambourin, shaker, clap…) allume sa pastille en pointillé ; un clic l'ajoute au kit (une ligne de plus dans la grille).
 *   node tests/e2e/drum-missing-pieces.js   (SHOTS=dossier : captures)
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
const SHOTS = process.env.SHOTS;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 920 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const next = async (n = 1) => {
    for (let i = 0; i < n; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  };
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(5);
  ok((await page.getAttribute('#bwParts', 'data-kind')) === 'drums', 'étape Batterie');
  ok((await page.locator('.bwd-chip.miss').count()) === 0, 'motif de l’inspiration : aucune pastille allumée');

  await page.click('#bwpStyle [data-g="all"]');
  await page.click('#bwpFam [data-f="all"]');
  await page.waitForTimeout(250);
  await page.click('#bwDrumMot .mot-card[data-id="tambourin-pop"]');
  await page.waitForTimeout(300);
  const miss = await page.$$eval('.bwd-chip.miss', (els) => els.map((e) => e.dataset.snd));
  ok(miss.includes('tb'), `Tambourin pop : pastille Tambourin en pointillé (${miss.join(', ')})`);
  if (SHOTS) await page.locator('.bwd-wrap').first().screenshot({ path: path.join(SHOTS, 'batterie-instrument-manquant.png') });

  const lanes0 = await page.locator('.bwd-sc-main .bwd-ln').count();
  await page.click('.bwd-chip.miss[data-snd="tb"]');
  await page.waitForTimeout(400);
  ok((await page.locator('.bwd-chip.miss[data-snd="tb"]').count()) === 0, 'clic : le tambourin entre dans le kit, plus de pointillé');
  ok((await page.locator('.bwd-sc-main .bwd-ln').count()) === lanes0 + 1, 'une ligne de plus dans la grille');
  if (SHOTS) await page.locator('.bwd-wrap').first().screenshot({ path: path.join(SHOTS, 'batterie-instrument-ajoute.png') });
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
