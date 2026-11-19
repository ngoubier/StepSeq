/*
 * « Nouvelle chanson » : la tuile « Créer de zéro » (style blank, js/band-presets.js) démarre sans inspiration.
 *   node tests/e2e/blank-start.js
 * Tuile en premier, départ neutre (batterie, basse, piano ; 100 BPM, Do majeur), pas de liste d'inspirations,
 * l'aperçu se joue et « Créer la chanson » écrit les pistes.
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
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);

  const first = page.locator('#bandStyles .bsty').first();
  ok((await first.getAttribute('data-v')) === 'zero' && /Créer de zéro/.test(await first.textContent()), 'la tuile « Créer de zéro » est la première');
  ok((await first.getAttribute('aria-checked')) === 'false', 'elle n’est pas choisie par défaut');
  await first.click();
  await page.waitForTimeout(400);
  ok((await first.getAttribute('aria-checked')) === 'true', 'choisie');
  ok(!(await page.isVisible('#bandPresets')) && /Créer de zéro/.test(await page.textContent('#bandSong')), 'pas de liste d’inspirations, le départ est expliqué');
  ok((await page.inputValue('#tempo')) === '100', 'tempo de départ : 100 BPM');
  ok(/3 musiciens/.test(await page.textContent('#bandWizSteps')), 'groupe de départ : 3 musiciens');

  // l'aperçu se calcule, puis « Créer la chanson »
  await page.click('#bwGo');
  await page.waitForTimeout(1500);
  await page.click('#stop').catch(() => {});
  ok(await page.evaluate(() => SS.band._listen().tracks.length >= 5), 'l’aperçu a ses pistes');
  for (let i = 0; i < 20 && !(await page.isVisible('#bwCreate')); i++) {
    await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  }
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  ok(p.tempo === 100 && p.tracks.length >= 5 && p.tracks.some((t) => t.band && t.band.key === 'bass') && p.tracks.some((t) => t.band && t.band.key === 'keys'), `chanson créée : ${p.tracks.length} pistes (batterie, basse, piano)`);
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
