/*
 * Micro-décalage d'une note (ev.shift) : réglage « Décalage » de la fenêtre de la note, repère sur la grille,
 * enregistrement, et heure réelle de départ à la lecture (en avance comme en retard).
 *   node tests/e2e/note-shift.js
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
  const URL = `http://localhost:${server.address().port}/index.html`;
  await page.goto(URL);
  // projet : une piste Sine (synthé intégré, pas de chargement) avec 4 noires, tempo lent (pas = 0,25 s)
  await page.evaluate(() => {
    const p = SS.newProject();
    p.tempo = 60;
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'synth', instrument: 'syn_sine' }, p);
    t.events = [0, 4, 8, 12].map((step) => ({ step, len: 2, notes: [60], vel: 0.8 }));
    p.tracks.push(t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);

  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events.map((e) => e.shift ?? 0));
  const openNote = async (step) => {
    await page.locator(`.track .cell[data-step="${step}"]`).first().click({ button: 'right' });
    await page.waitForSelector('.ctx-picker');
  };
  const shiftRange = () => page.locator('.ctx-picker input[aria-label="Décalage"]');

  // retard de 25 % sur la 2e note : 25 clics sur « + »
  await openNote(4);
  ok((await shiftRange().count()) === 1, 'fenêtre de la note : réglage Décalage présent');
  for (let i = 0; i < 25; i++) await page.click('.ctx-picker button[aria-label="Décalage plus"]');
  ok(/retard 25 %/.test(await page.locator('.ctx-picker .ctx-param', { hasText: 'Décalage' }).textContent()), 'affichage : retard 25 %');
  await page.keyboard.press('Escape');
  // avance de 40 % sur la 3e note (curseur)
  await openNote(8);
  await shiftRange().fill('-40');
  await shiftRange().dispatchEvent('input');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  ok(JSON.stringify(await saved()) === JSON.stringify([0, 0.25, -0.4, 0]), `enregistré : ${JSON.stringify(await saved())}`);
  ok((await page.locator('.track .cell[data-step="4"] .shift-mark').count()) === 1, 'repère de décalage sur la note en retard');
  ok((await page.locator('.track .cell[data-step="8"] .shift-mark.early').count()) === 1, 'repère « en avance » sur la note en avance');
  ok((await page.locator('.track .cell[data-step="0"] .shift-mark').count()) === 0, 'pas de repère sur une note non décalée');
  ok(/en avance de 40 %/.test(await page.locator('.track .cell[data-step="8"]').first().getAttribute('title')), 'infobulle de la note décalée');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, clip: { x: 0, y: 0, width: 900, height: 260 } });

  // rechargement : le décalage est gardé
  await page.reload();
  await page.waitForTimeout(500);
  ok((await page.locator('.track .cell[data-step="8"] .shift-mark.early').count()) === 1, 'décalage conservé après rechargement');

  // lecture : heure de départ de chaque note (oscillateurs du synthé)
  await page.evaluate(() => {
    window.__starts = [];
    const orig = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (t) {
      window.__starts.push(t);
      return orig.apply(this, arguments);
    };
  });
  await page.click('#play');
  await page.waitForTimeout(4300);
  await page.click('#play');
  const starts = await page.evaluate(() => [...new Set(window.__starts.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b));
  // écart entre les départs : pas de 0,25 s → 4 pas = 1 s ; +25 % = +0,0625 s ; −40 % = −0,1 s
  const d = starts.slice(1, 4).map((t, i) => +(t - starts[i]).toFixed(3));
  ok(starts.length >= 4, `${starts.length} départs de note`);
  ok(Math.abs(d[0] - 1.0625) < 0.003 && Math.abs(d[1] - (1 - 0.0625 - 0.1)) < 0.003 && Math.abs(d[2] - 1.1) < 0.003, `écarts entre départs : ${d.join(' / ')} s (attendu 1,0625 / 0,8375 / 1,1)`);

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
