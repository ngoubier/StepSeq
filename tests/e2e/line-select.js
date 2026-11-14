/*
 * Ligne et piano roll d’une piste instrument : un clic sur une note la sélectionne (poignées) au lieu de l’effacer ;
 * glisser la déplace, Suppr l’efface, un clic sur une case vide pose toujours une note.
 *   node tests/e2e/line-select.js
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
  const page = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.evaluate(() => {
    const p = SS.newProject();
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_sub', name: 'Basse', color: '#3fbf4a' }, p);
    t.events = [{ step: 0, len: 2, notes: [40], vel: 0.8 }, { step: 8, len: 2, notes: [43], vel: 0.8 }];
    p.tracks.push(t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(600);
  const evs = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events.map((e) => [e.step, e.len, e.notes[0]]));
  const cell = (s) => page.locator(`.track .track-grid .cell[data-step="${s}"]`);
  const center = async (s) => {
    const r = await cell(s).boundingBox();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };

  // simple clic sur une note : sélectionnée, pas effacée
  let [x, y] = await center(0);
  await page.mouse.click(x, y);
  await page.waitForTimeout(500);
  ok(JSON.stringify(await evs()) === '[[0,2,40],[8,2,43]]', 'clic sur une note : elle n’est pas effacée');
  ok(await cell(0).evaluate((c) => c.classList.contains('sel')), 'la note est sélectionnée');
  ok(!(await cell(8).evaluate((c) => c.classList.contains('sel'))), 'seule cette note est sélectionnée');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/line-select.png' });

  // glisser une note non sélectionnée : elle se déplace
  [x, y] = await center(8);
  const [x2] = await center(12);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x2, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  ok(JSON.stringify(await evs()) === '[[0,2,40],[12,2,43]]', `glisser : la note passe du pas 9 au pas 13 (${JSON.stringify(await evs())})`);
  ok(await cell(12).evaluate((c) => c.classList.contains('sel')), 'la note déplacée reste sélectionnée');

  // Suppr efface la note sélectionnée
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await evs()) === '[[0,2,40]]', 'Suppr : la note sélectionnée est effacée');

  // une case vide pose toujours une note
  [x, y] = await center(5);
  await page.mouse.click(x, y);
  await page.waitForTimeout(500);
  ok((await evs()).some((e) => e[0] === 4 || e[0] === 5), 'clic sur une case vide : une note est posée');

  // piano roll : même comportement (sélection, déplacement en temps et en hauteur, Suppr)
  await page.click('.track .th-roll');
  await page.waitForTimeout(300);
  const rc = (m, st) => page.locator(`.rcell[data-midi="${m}"][data-step="${st}"]`);
  const cur = (el) => el.evaluate((c) => getComputedStyle(c).cursor);
  ok(/^url\("data:image\/svg\+xml/.test(await cur(rc(50, 6))), 'piano roll : un crayon sur les cases vides');
  ok((await cur(rc(40, 0))) === 'grab', 'piano roll : une main sur les notes');
  await rc(40, 0).click({ position: { x: 5, y: 6 } });
  await page.waitForTimeout(500);
  ok((await evs()).some((e) => e[0] === 0 && e[2] === 40), 'piano roll : un clic sur une note ne l’efface plus');
  ok(await rc(40, 0).evaluate((c) => c.classList.contains('sel')), 'piano roll : la note est sélectionnée');
  const a0 = await rc(40, 0).boundingBox();
  const a1 = await rc(42, 2).boundingBox();
  await page.mouse.move(a0.x + 5, a0.y + a0.height / 2);
  await page.mouse.down();
  await page.mouse.move(a1.x + 5, a1.y + a1.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  ok((await evs()).some((e) => e[0] === 2 && e[2] === 42) && !(await evs()).some((e) => e[0] === 0), `piano roll : glisser déplace la note (pas 3, +2 demi-tons) ${JSON.stringify(await evs())}`);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  ok(!(await evs()).some((e) => e[2] === 42), 'piano roll : Suppr efface la note');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
