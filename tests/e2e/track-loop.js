/*
 * Fenêtres Sound design et Effets : bouton « Boucle » (js/trackloop.js) et « Supprimer tous les effets » :
 *   node tests/e2e/track-loop.js
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
const SHOTS = process.env.SHOTS;
const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((d) => {
    if (!sessionStorage.seed) {
      localStorage.setItem('stepseq.autosave', JSON.stringify(d));
      sessionStorage.seed = '1';
    }
  }, demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const playing = () => page.evaluate(() => SS.audio.isPlaying());

  // Sound design de la piste « Lead » (des notes dans la scène) : la piste tourne seule en boucle
  const idx = (await P()).tracks.findIndex((t) => t.id === 'ti_lead');
  await page.locator('.th-sd').nth(idx).click();
  await page.waitForSelector('#soundDialog[open]');
  ok(await page.isVisible('#sdLoop'), 'Sound design : bouton Boucle');
  await page.click('#sdLoop');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  ok((await page.getAttribute('#sdLoop', 'aria-pressed')) === 'true' && /Arrêter/.test(await page.textContent('#sdLoop')), 'Boucle : la piste joue, bouton enfoncé');
  ok(await page.evaluate(() => SS.trackLoop.mode() === 'pattern'), 'la piste a des notes : son motif tourne en boucle');
  await page.waitForTimeout(1500);
  ok(await playing(), 'la boucle continue');
  await page.click('#sdLoop');
  await page.waitForTimeout(200);
  ok(!(await playing()) && (await page.getAttribute('#sdLoop', 'aria-pressed')) === 'false', 're-clic : arrêt');
  await page.click('#sdLoop');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(!(await playing()) && !(await page.evaluate(() => SS.trackLoop.active())), 'fermer la fenêtre arrête la boucle');
  const t1 = (await P()).tracks[idx];
  ok(!t1.mute && !t1.solo, 'muet / solo de la piste inchangés');

  // Effets : Boucle et « Supprimer tous les effets »
  await page.locator('.fx-btn').nth(idx).click();
  await page.waitForSelector('#fxDialog[open]');
  ok(await page.isVisible('#fxLoop'), 'Effets : bouton Boucle');
  const clear = page.locator('#fxReset');
  ok((await clear.isVisible()) && /Supprimer tous les effets/.test(await clear.textContent()), 'Effets : bouton « Supprimer tous les effets »');
  const hadFx = !!(await P()).tracks[idx].fx;
  ok(hadFx && !(await clear.isDisabled()), 'la piste a des effets : bouton actif');
  await page.click('#fxLoop');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  ok(await playing(), 'Effets : la boucle joue');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fx-loop.png') });
  await clear.click();
  await page.waitForTimeout(600);
  ok(!(await P()).tracks[idx].fx && (await clear.isDisabled()), 'tous les effets supprimés, bouton grisé');
  ok(await playing(), 'la boucle continue pendant les réglages');
  await page.click('#fxCancel');
  await page.waitForTimeout(600);
  ok(!!(await P()).tracks[idx].fx && !(await playing()), 'Annuler : effets rétablis, boucle arrêtée');

  // piste vide : la note d'essai est rejouée en boucle
  await page.locator('.th-sd').nth(idx).click();
  await page.waitForSelector('#soundDialog[open]');
  await page.evaluate(() => {
    SS.trackLoop.start({ type: 'instrument', events: [] }, { tracks: [] }, () => ((window.__n = (window.__n || 0) + 1), 0.2), () => {});
  });
  await page.waitForTimeout(1300);
  ok(await page.evaluate(() => SS.trackLoop.mode() === 'note' && window.__n >= 2), 'piste vide : la note d’essai est rejouée en boucle');
  await page.evaluate(() => SS.trackLoop.stop());
  await page.keyboard.press('Escape');

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
