/*
 * Menu « Transformer… » de la barre de sélection (inversion, rétrograde, durées, autre mode, Ctrl+Z) et
 * contrôleurs MIDI de la ligne d'automation (pédale de sustain : forme, lecture sans erreur).
 *   node tests/e2e/transform-sustain.js
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
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.evaluate(() => {
    const p = SS.newProject();
    p.scenes[0].key = { tonic: 'C', mode: 'major' };
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'keys', instrument: 'piano', name: 'Piano', color: '#6cc0ff' }, p);
    t.events = [60, 62, 64, 65].map((m, i) => ({ step: i * 2, len: 2, notes: [m], vel: 0.8 }));
    p.tracks.push(t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const notes = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events.map((e) => [e.step, e.notes[0], e.len]));
  const box = page.locator('#selXform');

  ok(await box.isDisabled(), 'menu Transformer désactivé sans sélection');
  await page.locator('.track .track-grid .cell').first().click();
  await page.keyboard.press('Control+a');
  ok(!(await box.isDisabled()), 'menu Transformer actif avec une sélection');
  const labels = await box.locator('option').allTextContents();
  ok(labels.some((l) => /Do mineur/i.test(l)) && labels.some((l) => /Rétrograde/.test(l)), `options : ${labels.join(' | ')}`);

  await box.selectOption('invert');
  await page.waitForTimeout(400);
  ok(JSON.stringify(await notes()) === JSON.stringify([[0, 60, 2], [2, 59, 2], [4, 57, 2], [6, 55, 2]]), `inversion dans la gamme : ${JSON.stringify(await notes())}`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ok(JSON.stringify(await notes()) === JSON.stringify([[0, 60, 2], [2, 62, 2], [4, 64, 2], [6, 65, 2]]), 'Ctrl+Z revient aux notes d’origine');

  await page.locator('.track .track-grid .cell').first().click();
  await page.keyboard.press('Control+a');
  await box.selectOption('x2');
  await page.waitForTimeout(400);
  ok(JSON.stringify(await notes()) === JSON.stringify([[0, 60, 4], [4, 62, 4], [8, 64, 4], [12, 65, 4]]), `durées ×2 : ${JSON.stringify(await notes())}`);
  await box.selectOption('mode:minor');
  await page.waitForTimeout(400);
  ok(JSON.stringify((await notes()).map((n) => n[1])) === JSON.stringify([60, 62, 63, 65]), 'Do mineur : Mi → Mi♭, la sélection reste active');
  await box.selectOption('retrograde');
  await page.waitForTimeout(400);
  ok(JSON.stringify((await notes()).map((n) => n[1])) === JSON.stringify([65, 63, 62, 60]), 'rétrograde');

  // ligne d'automation : groupe « Contrôleurs MIDI », pédale relevée à chaque mesure
  await page.keyboard.press('Escape');
  await page.click('.track .th-auto');
  const lane = page.locator('.auto-lane');
  const groups = await lane.locator('.auto-param optgroup').evaluateAll((gs) => gs.map((g) => g.label));
  ok(groups.includes('Contrôleurs MIDI'), `groupes : ${groups.join(' | ')}`);
  await lane.locator('.auto-param').selectOption('sustain');
  await lane.locator('.auto-shape').selectOption('hold');
  await page.waitForTimeout(600);
  const auto = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].auto);
  ok(JSON.stringify(auto) === JSON.stringify({ sustain: { 0: 1 } }), `pédale enfoncée : ${JSON.stringify(auto)}`);
  ok((await lane.locator('.auto-val').textContent()).includes('Enfoncée'), 'valeur lisible : Enfoncée');

  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  ok(errs.length === 0, 'aucune erreur : ' + errs.join(' / '));
  await b.close();
  server.close();
})();
