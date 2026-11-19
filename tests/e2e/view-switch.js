/*
 * Test de bout en bout de la bascule Assistant | Grille (barre du haut, js/main.js syncView) :
 *   node tests/e2e/view-switch.js [dossier-captures]
 * Grille puis Assistant : même étape, rien de créé ; bandeau « pas encore dans la grille » ; il disparaît après la création
 * et revient quand on change la chanson dans l’assistant (changer d’étape ne compte pas).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2];
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
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const shot = (n) => SHOTS && page.screenshot({ path: path.join(SHOTS, n) });
  const step = () => page.evaluate(() => SS.band._state.wiz && SS.band._state.wiz.step);
  const tracks = () => page.evaluate(() => document.querySelectorAll('#tracks .track').length);

  ok(await page.isVisible('#viewSeg') && !(await page.isVisible('#wizBanner')), 'sélecteur visible, pas de bandeau sans assistant');
  const before = await tracks();
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => SS.band.active()), 'Assistant : l’assistant s’ouvre');
  ok((await page.getAttribute('#viewWiz', 'aria-checked')) === 'true', 'le sélecteur montre Assistant');
  for (let i = 0; i < 3; i++) await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(400);
  const s = await step();
  await shot('bascule-assistant.png');
  await page.click('#viewGrid');
  await page.waitForTimeout(600);
  ok(!(await page.evaluate(() => SS.band.active())) && (await tracks()) === before, 'Grille : retour aux pistes, rien de créé');
  ok(await page.isVisible('#wizBanner') && (await page.isVisible('#viewDot')), 'bandeau et point doré : la chanson n’est pas dans la grille');
  await shot('bascule-grille-bandeau.png');
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  ok((await step()) === s, `Assistant : même étape (${s})`);
  await page.click('#viewGrid');
  await page.waitForTimeout(300);
  await page.click('#wizBannerPut');
  await page.waitForTimeout(400);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  ok(!(await page.evaluate(() => SS.band.active())) && (await tracks()) > 2, 'Mettre la chanson dans la grille : pistes créées, on est dans la grille');
  ok(!(await page.isVisible('#wizBanner')) && !(await page.isVisible('#viewDot')), 'grille à jour : plus de bandeau ni de point');
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);
  await page.click('#viewGrid');
  await page.waitForTimeout(2200);
  ok(!(await page.isVisible('#wizBanner')), 'changer d’étape seulement : la grille reste à jour');
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  await page.evaluate(() => SS.band.setTempo(SS.band._state.wiz.tempo ? SS.band._state.wiz.tempo + 7 : 133));
  await page.waitForTimeout(300);
  await page.click('#viewGrid');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#wizBanner') && /changements/.test(await page.textContent('#wizBannerText')), 'tempo changé dans l’assistant : le bandeau le dit');
  await shot('bascule-grille-retard.png');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
