/*
 * Ratchet : réglage dans la fenêtre d'une note et dans le menu d'un pas de batterie (clic droit),
 * repères sur la grille, et instants de départ réels à la lecture.
 *   node tests/e2e/ratchet.js   (son de batterie téléchargé depuis GitHub : réseau nécessaire)
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
  // tempo 60 : un pas = 0,25 s. Batterie : un coup au pas 4 ; Sine : une note au pas 8.
  await page.evaluate(() => {
    const p = SS.newProject();
    p.tempo = 60;
    const d = SS.newTrack({ type: 'drum', name: 'Snare', source: 'tdm', sound: 'sd', machine: 'RolandTR808' }, p);
    d.steps[4] = 0.9;
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'synth', instrument: 'syn_sine' }, p);
    t.events = [{ step: 8, len: 4, notes: [60], vel: 0.8 }];
    p.tracks.push(d, t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const cell = (ti, s) => page.locator('.track').nth(ti).locator(`.cell[data-step="${s}"]`);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.map((t) => (t.type === 'drum' ? t.rat : t.events[0].rat)));

  // batterie : clic droit sur le pas, ×3
  await cell(0, 4).click({ button: 'right' });
  await page.waitForSelector('.ctx-drum');
  ok((await page.locator('.ctx-drum .ctx-rat button').count()) === 4, 'menu du pas : boutons ×1 à ×4');
  await page.click('.ctx-drum .ctx-rat button:has-text("×3")');
  ok((await page.locator('.ctx-drum .ctx-rat button[aria-checked="true"]').textContent()) === '×3', '×3 coché');
  await page.keyboard.press('Escape');
  // clic droit sur un pas éteint : pas de menu StepSeq
  await cell(0, 5).click({ button: 'right' });
  ok((await page.locator('.ctx-drum').count()) === 0, 'pas éteint : pas de menu');
  await page.keyboard.press('Escape');
  // note : ×2 dans la fenêtre de la note
  await cell(1, 8).click({ button: 'right' });
  await page.waitForSelector('.ctx-picker .ctx-rat');
  await page.click('.ctx-picker .ctx-rat button:has-text("×2")');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  ok(JSON.stringify(await saved()) === JSON.stringify([{ 4: 3 }, 2]), `enregistré : ${JSON.stringify(await saved())}`);
  ok((await cell(0, 4).locator('.rat-mark').count()) === 1 && (await cell(1, 8).locator('.rat-mark').count()) === 1, 'repères de ratchet sur la grille');
  ok(/ratchet ×3/.test(await cell(0, 4).getAttribute('title')), 'infobulle du pas : ratchet ×3');

  // éteindre puis rallumer le pas : il repart sans ratchet
  await cell(0, 4).click();
  await cell(0, 4).click();
  await page.waitForTimeout(600);
  ok((await saved())[0] === undefined, 'un pas rallumé repart sans ratchet');
  await cell(0, 4).click({ button: 'right' });
  await page.click('.ctx-drum .ctx-rat button:has-text("×3")');
  await page.keyboard.press('Escape');

  // lecture : instants de départ
  await page.evaluate(() => {
    window.__drum = [];
    window.__osc = [];
    const bs = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (t) {
      if (this.buffer && this.buffer.duration > 0.05) window.__drum.push(t);
      return bs.apply(this, arguments);
    };
    const os = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) {
      window.__osc.push(t);
      return os.apply(this, arguments);
    };
  });
  await page.click('#play');
  await page.waitForTimeout(3600);
  await page.click('#play');
  const r = await page.evaluate(() => ({ drum: window.__drum.slice(0, 3), osc: [...new Set(window.__osc.map((t) => Math.round(t * 1000) / 1000))].slice(0, 2) }));
  const gaps = (a) => a.slice(1).map((t, i) => +(t - a[i]).toFixed(4));
  ok(r.drum.length === 3 && gaps(r.drum).every((g) => Math.abs(g - 0.25 / 3) < 0.002), `batterie ×3 : écarts ${gaps(r.drum).join(' / ')} s (attendu 0,0833)`);
  ok(r.osc.length === 2 && Math.abs(gaps(r.osc)[0] - 0.125) < 0.002, `note ×2 : écart ${gaps(r.osc).join(' / ')} s (attendu 0,125)`);
  ok(r.osc.length === 2 && Math.abs(r.osc[0] - r.drum[0] - 1) < 0.003, 'la note part 4 pas après le coup de batterie');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
