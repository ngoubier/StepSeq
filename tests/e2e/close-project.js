/*
 * Menu ▸ Fermer (js/main.js closeProject) :
 *   node tests/e2e/close-project.js
 * Fermer depuis la Grille et depuis l'assistant : chanson vide, l'ancienne reste dans « Mes chansons » ;
 * sans bibliothèque : Annuler garde la chanson, Ne pas enregistrer ferme ; outil StepSeq.fermer.
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
  const page = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  if (await page.evaluate(() => SS.band.active())) await page.evaluate(() => SS.band.close());
  const st = () => page.evaluate(async () => ({ title: document.querySelector('#title').value, tracks: StepSeq.etat().pistes.length, wiz: SS.band.active(), titles: (await SS.store.list()).map((s) => s.title) }));

  // 1. depuis la Grille
  const before = await st();
  ok(before.tracks > 0, `chanson de départ : ${before.tracks} pistes`);
  await page.click('#appMenuBtn');
  await page.click('#closeProject');
  await page.waitForTimeout(800);
  const a = await st();
  ok(a.tracks === 0 && a.title !== before.title, `fermée depuis la Grille : chanson vide « ${a.title} »`);
  ok(a.titles.includes(before.title), `« ${before.title} » reste dans « Mes chansons »`);
  ok(await page.isVisible('#emptySong'), 'bouton « Nouvelle chanson » visible');
  ok(!(await page.isVisible('#closeDialog')), 'pas de question (bibliothèque disponible)');

  // 2. depuis l'assistant
  await page.click('#emptySong');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => SS.band.active()), 'assistant ouvert');
  await page.click('#appMenuBtn');
  await page.click('#closeProject');
  await page.waitForTimeout(800);
  ok(!(await page.evaluate(() => SS.band.active())), 'fermé depuis l’assistant : assistant refermé');

  // 3. outil Claude
  const r = await page.evaluate(() => StepSeq.fermer());
  ok(r.ok, `StepSeq.fermer : ${r.message || r.erreur}`);

  // 4. sans bibliothèque, avec des pistes modifiées : la question
  await page.evaluate(() => {
    SS.autosave.libraryAvailable = () => false;
    StepSeq.ajouterPiste({ role: 'basse' });
  });
  const n = (await st()).tracks;
  await page.click('#appMenuBtn');
  await page.click('#closeProject');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#closeDialog'), 'question Enregistrer / Ne pas enregistrer / Annuler');
  await page.click('#closeDialog button[value=cancel]');
  await page.waitForTimeout(300);
  ok((await st()).tracks === n && n > 0, 'Annuler : la chanson reste ouverte');
  await page.click('#appMenuBtn');
  await page.click('#closeProject');
  await page.waitForTimeout(300);
  await page.click('#closeDialog button[value=discard]');
  await page.waitForTimeout(800);
  ok((await st()).tracks === 0, 'Ne pas enregistrer : chanson fermée');

  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
