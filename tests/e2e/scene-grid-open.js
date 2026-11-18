/*
 * Grille des scènes (étape Scènes de l'assistant « Nouvelle chanson », js/band.js) :
 *   node tests/e2e/scene-grid-open.js
 * Double-clic sur une case (scène × piste) : ouvre l'étape de cet instrument, sur cette scène.
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
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(500);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  for (let i = 0; i < 3; i++) await page.dispatchEvent('#bwNext', 'click'); // Instruments, Tempo et tonalité, Scènes
  await page.waitForTimeout(200);
  const st = () => page.evaluate(() => ({ step: SS.band._state.wiz.step, scene: SS.band._state.wiz.hscene }));
  const before = await st();

  // deux cases : 3e scène × 1re colonne, dernière scène × dernière colonne d'instrument
  const n = await page.$$eval('.bw-grid tbody tr', (r) => r.length);
  for (const [ri, ci] of [[Math.min(2, n - 1), 0], [n - 1, -2]]) {
    const target = await page.evaluate(([ri, ci]) => {
      const tr = document.querySelectorAll('.bw-grid tbody tr')[ri];
      const cells = [...tr.querySelectorAll('td.bw-open')];
      const td = cells.at(ci);
      td.setAttribute('data-t', '1');
      return { scene: tr.dataset.scene, title: (td.firstChild.getAttribute('title') || '') };
    }, [ri, ci]);
    await page.dblclick('td[data-t="1"]');
    await page.waitForTimeout(200);
    const s = await st();
    ok(s.step > 5 && s.scene === target.scene, `double-clic (${target.title}) : étape ${s.step}, scène ${s.scene}`);
    const sel = await page.$eval('.bh-scene.on', (x) => x.dataset.scene).catch(() => null);
    ok(sel === target.scene, `colonne des scènes : « ${sel} » choisie`);
    await page.click('li[data-step="4"] button'); // retour à l'étape Scènes
    await page.waitForTimeout(200);
  }
  ok(before.step === 4, 'départ : étape Scènes');
  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
