/*
 * Nouvelle chanson : fiche Scène (tiroir à droite) ouverte par double-clic ou ☰ sur une carte de scène, et à l'étape Arrangement.
 * Émotion → brouillon (S.wiz.emos), Joue / Muet → même réglage que « Joue dans cette scène », ‹ › change la scène affichée.
 *   node tests/e2e/wiz-scene-sheet.js
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
const SHOT = process.env.SHOT;
(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.click('#viewWiz'); await page.waitForTimeout(400); await page.click('#brgSkip').catch(() => {}); await page.waitForTimeout(300);
  await page.click('#bandStyles [data-v="synthwave"]'); await page.click('#bandPresets .band-preset >> nth=0');
  for (let i = 0; i < 5; i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); } // étape Batterie
  const W = () => page.evaluate(() => { const w = SS.band._state.wiz; return { hscene: w.hscene, emos: { ...w.emos }, parts: JSON.parse(JSON.stringify(w.parts)) }; });
  // double-clic sur la 2e scène
  await page.dblclick('#bandWiz .bh-scene >> nth=1'); await page.waitForTimeout(400);
  ok(await page.isVisible('#wizSceneSheet'), 'double-clic : la fiche s’ouvre');
  const s2 = await page.evaluate(() => document.querySelector('#bandWiz .bh-scene:nth-of-type(2)') && document.querySelectorAll('#bandWiz .bh-scene')[1].dataset.scene);
  ok(await page.getAttribute('#wizSceneSheet', 'data-scene') === s2, 'fiche de la scène double-cliquée');
  const box = await page.evaluate(() => [document.querySelector('#bandDialog').getBoundingClientRect().right, innerWidth]);
  ok(box[1] - box[0] >= 370, 'le tiroir pousse l’assistant');
  // émotion
  await page.click('#wshEmo'); await page.click('#wizSceneSheet [data-emo="nostalgie"]'); await page.waitForTimeout(500);
  const sec = await page.getAttribute('#wizSceneSheet', 'data-sec');
  ok((await W()).emos[sec] === 'nostalgie', 'émotion écrite dans le brouillon');
  // muet dans la scène
  const row = page.locator('#wizSceneSheet .ssh-tr >> nth=0');
  await row.locator('.ssh-st3 button >> nth=1').click(); await page.waitForTimeout(600);
  ok(await page.locator('#wizSceneSheet .ssh-tr >> nth=0').evaluate((e) => e.classList.contains('mute')), 'instrument muet dans la scène');
  ok(/"off"/.test(JSON.stringify((await W()).parts[sec] || {})), 'muet écrit dans les réglages de la scène (parts)');
  await page.locator('#wizSceneSheet .ssh-tr >> nth=0').locator('.ssh-st3 button >> nth=0').click(); await page.waitForTimeout(600);
  // ‹ › : la scène affichée suit
  await page.click('#wshNext'); await page.waitForTimeout(400);
  const w = await W();
  ok(await page.getAttribute('#wizSceneSheet', 'data-scene') === w.hscene, '› change la scène affichée');
  if (SHOT) await page.screenshot({ path: SHOT });
  // Échap ferme ; ☰ rouvre
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.isVisible('#wizSceneSheet')), 'Échap ferme la fiche');
  await page.hover('#bandWiz .bh-scene >> nth=0'); await page.click('#bandWiz .bh-scene >> nth=0 >> .bh-sheet'); await page.waitForTimeout(300);
  ok(await page.isVisible('#wizSceneSheet'), '☰ ouvre la fiche');
  // étape Arrangement : double-clic sur un bloc
  await page.keyboard.press('Escape');
  for (let i = 0; i < 6; i++) { if (await page.isVisible('#bwArrChart')) break; await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(300); }
  await page.dblclick('.bwar-blk >> nth=1'); await page.waitForTimeout(400);
  ok(await page.isVisible('#wizSceneSheet'), 'arrangement : double-clic ouvre la fiche');
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close(); server.close();
})();
