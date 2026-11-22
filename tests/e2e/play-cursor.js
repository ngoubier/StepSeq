/*
 * Nouvelle chanson : choix Chanson | Scène sous les scènes, têtes de lecture (batterie, rouleaux, Arrangement), la vue suit la chanson.
 *   node tests/e2e/play-cursor.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.click('#viewWiz'); await page.waitForTimeout(400); await page.click('#brgSkip').catch(()=>{}); await page.waitForTimeout(300);
  await page.click('#bandStyles [data-v="synthwave"]'); await page.click('#bandPresets .band-preset >> nth=0');
  for (let i = 0; i < 5; i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); }
  ok(await page.isVisible('#bwPlayMode'), 'sélecteur Chanson | Scène sous les scènes');
  await page.click('#bandWiz .bh-scene >> nth=1'); await page.waitForTimeout(300);
  await page.click('#play'); await page.waitForTimeout(1800);
  ok(await page.locator('.bwd-c.now').count() >= 3, 'batterie : colonne du pas allumée');
  ok(await page.locator('.bwp-bars span.now').count() === 1, 'batterie : mesure en cours');
  ok(await page.locator('.bh-scene.playing.looping').count() === 1, 'carte de scène en boucle');
  // passe en Chanson pendant la lecture
  await page.click('#bwPlayMode [data-v="song"]'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => SS.band._state.wiz.playMode) === 'song', 'mode Chanson retenu');
  ok(await page.isVisible('#bwFollow'), 'bouton Suit la lecture visible');
  await page.click('#stop'); await page.waitForTimeout(200);
  // basse : Play en mode chanson depuis le début ; la vue suit
  await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(300);
  await page.click('#bandWiz .bh-scene >> nth=2'); await page.waitForTimeout(300);
  await page.click('#play'); await page.waitForTimeout(1500);
  const sc = await page.evaluate(() => [SS.band._state.wiz.hscene, document.querySelector('.bh-scene.on').dataset.scene, document.querySelector('.bh-scene.playing') && document.querySelector('.bh-scene.playing').dataset.scene]);
  ok(sc[0] === sc[2], `la vue suit la scène entendue (${sc.join(',')})`);
  // accélère : tempo max pour atteindre le couplet
  await page.evaluate(() => SS.band.setTempo(240)); await page.waitForTimeout(9000);
  const sc2 = await page.evaluate(() => [SS.band._state.wiz.hscene, document.querySelector('.bh-scene.playing') && document.querySelector('.bh-scene.playing').dataset.scene, document.querySelectorAll('.bw-rn.now, .bw-rnb.now').length]);
  ok(sc2[0] === sc2[1], 'toujours sur la scène entendue');
  // arrangement
  for (let i = 0; i < 3; i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); if (await page.isVisible('#bwArrChart')) break; }
  await page.waitForTimeout(800);
  ok(await page.isVisible('#bwArrChart .bwar-ph'), 'arrangement : tête de lecture');
  ok(await page.locator('.bwar-blk.playing').count() === 1, 'arrangement : bloc en cours');
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close(); server.close();
})();
