/*
 * Conditions de déclenchement : menu d'une note et d'un pas de batterie (clic droit), étiquettes sur la grille,
 * et notes réellement jouées passage après passage.
 *   node tests/e2e/trigcond.js
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
  // tempo 240, une mesure : un pas = 62,5 ms, un passage = 1 s. Sine : une note au pas 0, une au pas 8.
  await page.evaluate(() => {
    const p = SS.newProject();
    p.tempo = 240;
    const d = SS.newTrack({ type: 'drum', name: 'Crash', source: 'tdm', sound: 'cr', machine: 'RolandTR909' }, p);
    d.steps[0] = 0.9;
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'synth', instrument: 'syn_sine' }, p);
    t.events = [
      { step: 0, len: 2, notes: [60], vel: 0.8 },
      { step: 8, len: 2, notes: [67], vel: 0.8 },
    ];
    p.tracks.push(d, t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const cell = (ti, s) => page.locator('.track').nth(ti).locator(`.cell[data-step="${s}"]`);
  const saved = () =>
    page.evaluate(() => {
      const [d, t] = JSON.parse(localStorage.getItem('stepseq.autosave')).tracks;
      return [d.cond, t.events.map((e) => e.cond || null)];
    });

  // batterie : clic droit sur le pas, condition 1:4
  await cell(0, 0).click({ button: 'right' });
  await page.waitForSelector('.ctx-drum .ctx-cond');
  ok((await page.locator('.ctx-drum .ctx-cond option').count()) === 14 + 1, 'menu du pas : « Toujours » + toutes les conditions');
  await page.selectOption('.ctx-drum .ctx-cond', '1:4');
  await page.keyboard.press('Escape');
  // note du pas 0 : 1:2 dans la fenêtre de la note
  await cell(1, 0).click({ button: 'right' });
  await page.waitForSelector('.ctx-picker .ctx-cond');
  await page.selectOption('.ctx-picker .ctx-cond', '1:2');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const s1 = await saved();
  ok(JSON.stringify(s1) === JSON.stringify([{ 0: '1:4' }, ['1:2', null]]), `enregistré : ${JSON.stringify(s1)}`);
  ok((await cell(0, 0).locator('.cond-mark').textContent()) === '1:4' && (await cell(1, 0).locator('.cond-mark.corner').count()) === 1, 'étiquette 1:4 sur le pas, coin sur la note');
  ok(/condition 1:4/.test(await cell(0, 0).getAttribute('title')), 'infobulle du pas : condition 1:4');

  // copier / coller le pas de batterie : la condition suit
  await cell(0, 0).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+c');
  await cell(0, 4).hover();
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(700);
  ok(JSON.stringify((await saved())[0]) === JSON.stringify({ 0: '1:4', 4: '1:4' }), `collé avec sa condition : ${JSON.stringify((await saved())[0])}`);
  await page.keyboard.press('Escape');

  // éteindre puis rallumer : le pas repart sans condition
  await cell(0, 4).click();
  await cell(0, 4).click();
  await page.waitForTimeout(700);
  ok(JSON.stringify((await saved())[0]) === JSON.stringify({ 0: '1:4' }), 'un pas rallumé repart sans condition');

  // lecture : 4 passages ; la note 1:2 joue aux passages 1 et 3, l'autre à chaque passage
  await page.evaluate(() => {
    window.__osc = [];
    const os = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) {
      window.__osc.push({ t, f: this.frequency.value });
      return os.apply(this, arguments);
    };
  });
  await page.click('#play');
  await page.waitForFunction(() => window.__osc.length > 0, null, { timeout: 8000 });
  await page.waitForTimeout(4300);
  await page.click('#play');
  const r = await page.evaluate(() => {
    const t0 = Math.min(...window.__osc.map((o) => o.t));
    const at = (lo, hi) => [...new Set(window.__osc.filter((o) => o.f > lo && o.f < hi).map((o) => Math.round((o.t - t0) * 8) / 8))].filter((x) => x < 4);
    return { c: at(250, 280), g: at(380, 410) };
  });
  ok(JSON.stringify(r.c) === JSON.stringify([0, 2]), `do (1:2) : passages à ${r.c.join(', ')} s (attendu 0, 2)`);
  ok(JSON.stringify(r.g) === JSON.stringify([0.5, 1.5, 2.5, 3.5]), `sol (toujours) : ${r.g.join(', ')} s (attendu 0,5 1,5 2,5 3,5)`);

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
