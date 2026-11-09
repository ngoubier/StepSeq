/*
 * Test de bout en bout du curseur de lecture : un clic sur la règle des mesures place le curseur,
 * et Lecture part de là (arrêté, en pause ou pendant la lecture).
 *   node tests/e2e/playhead-ui.js [dossier-captures]
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
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SHOTS = process.argv[2];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1400, height: 700 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // 2 mesures en 4/4 = 32 pas ; tempo lent pour laisser le temps de vérifier
  const proj = { format: 'stepseq', version: 1, title: 'Curseur', tempo: 60, timeSig: [4, 4], bars: 2, tracks: [{ id: 'd1', type: 'drum', name: 'Kick', color: '#e91e8c', sound: 'bd', bank: 'RolandTR909', steps: Array(32).fill(0).map((_, i) => (i % 4 ? 0 : 1)) }] };
  await page.addInitScript((p) => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), proj);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(600);
  // journal des pas affichés
  await page.evaluate(() => {
    window._steps = [];
    const orig = SS.ui.setPlayhead;
    SS.ui.setPlayhead = (s) => { window._steps.push(s); orig(s); };
  });
  const pos = () => page.textContent('#position');
  const firstPlayed = async () => page.evaluate(() => window._steps.find((s) => s >= 0));
  const clear = () => page.evaluate(() => (window._steps = []));

  // 1. arrêté : clic sur le 3ᵉ temps de la mesure 2 (pas 24)
  await page.click('#ruler [data-step="24"]');
  ok((await pos()).replace(/\s/g, '') === '2.3.1', `arrêté : le curseur va en 2 . 3 . 1 (${await pos()})`);
  ok(await page.locator('#ruler [data-step="24"].now').count() === 1, 'la case de la règle est marquée');
  SHOTS && (await page.locator('#workspace').screenshot({ path: path.join(SHOTS, 'playhead-cue.png') }));
  await clear();
  await page.click('#play');
  await page.waitForTimeout(700);
  ok((await firstPlayed()) === 24, `Lecture part du curseur (premier pas joué : ${await firstPlayed()})`);

  // 2. pendant la lecture : saut immédiat
  await clear();
  await page.click('#ruler [data-step="4"]');
  await page.waitForTimeout(600);
  const seen = await page.evaluate(() => window._steps.filter((s) => s >= 0));
  ok(seen[0] === 4 && seen.every((s, i) => i === 0 || s === seen[i - 1] || s === seen[i - 1] + 1), `en lecture : saut au pas 4 puis lecture continue (${seen.join(',')})`);

  // 3. en pause : la reprise part du curseur
  await page.click('#play'); // pause
  await page.click('#ruler [data-step="16"]');
  ok((await pos()).replace(/\s/g, '') === '2.1.1', `en pause : le curseur va en 2 . 1 . 1 (${await pos()})`);
  await clear();
  await page.click('#play'); // reprise
  await page.waitForTimeout(600);
  ok((await firstPlayed()) === 16, `la reprise part du curseur (premier pas : ${await firstPlayed()})`);

  // 4. Stop ramène au début
  await page.click('#stop');
  await clear();
  await page.click('#play');
  await page.waitForTimeout(600);
  ok((await firstPlayed()) === 0, `après Stop, Lecture repart du début (premier pas : ${await firstPlayed()})`);
  await page.click('#stop');

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
