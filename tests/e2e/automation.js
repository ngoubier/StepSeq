/*
 * Automation : ligne sous la piste (forme toute prête, dessin, effacement), enregistrement dans la scène,
 * et nœuds audio de la tranche qui suivent la courbe pendant la lecture, puis reviennent au neutre à l'arrêt.
 *   node tests/e2e/automation.js
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
  // tempo 60, une mesure : un pas = 0,25 s, la boucle = 4 s. Une nappe tenue toute la mesure.
  await page.evaluate(() => {
    const p = SS.newProject();
    p.tempo = 60;
    const t = SS.newTrack({ type: 'instrument', category: 'chord', family: 'pads', instrument: 'syn_pad', name: 'Nappe', color: '#c06cff' }, p);
    t.events = [{ step: 0, len: 16, notes: [57, 60, 64], vel: 0.8, chord: 'min' }];
    p.tracks.push(t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].auto || null);
  const lane = page.locator('.auto-lane');

  ok((await lane.count()) === 0, 'ligne d’automation fermée au départ');
  await page.click('.track .th-auto');
  ok((await lane.count()) === 1, 'bouton ∿ : la ligne s’ouvre sous la piste');
  ok((await lane.locator('.acell').count()) === 16, '16 cases alignées sur la grille');
  const x0 = await lane.locator('.acell').first().boundingBox();
  const g0 = await page.locator('.track .track-grid .cell').first().boundingBox();
  ok(Math.abs(x0.x + x0.width / 2 - (g0.x + g0.width / 2)) < g0.width, 'la case 1 est sous le pas 1');

  // forme toute prête : ouvrir le passe-bas
  await lane.locator('.auto-shape').selectOption('lp-open');
  await page.waitForTimeout(600);
  ok(JSON.stringify(await saved()) === JSON.stringify({ filter: { 0: -0.85, 15: 0 } }), `forme posée : ${JSON.stringify(await saved())}`);
  ok((await lane.locator('.auto-param option:checked').textContent()).includes('●'), 'le menu marque le réglage automatisé');
  ok(await page.locator('.track .th-auto.on').count() === 1, 'le bouton de la piste signale une automation');

  // dessin : volume, glisser en bas des cases 9 à 12
  await lane.locator('.auto-param').selectOption('volume');
  const box = async (s) => lane.locator(`.acell[data-step="${s}"]`).boundingBox();
  const a = await box(8), c = await box(11);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height * 0.9, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const vol = (await saved()).volume || {};
  ok(Object.keys(vol).join() === '8,9,10,11' && Object.values(vol).every((v) => v > 0.05 && v < 0.15), `volume dessiné sur 4 pas : ${JSON.stringify(vol)}`);
  // effacer : clic droit sur une case
  await lane.locator('.acell[data-step="11"]').click({ button: 'right' });
  await page.waitForTimeout(600);
  ok(Object.keys((await saved()).volume).join() === '8,9,10', 'clic droit : point effacé');
  await lane.locator('.auto-clear').click();
  await page.waitForTimeout(600);
  ok(JSON.stringify(await saved()) === JSON.stringify({ filter: { 0: -0.85, 15: 0 } }), 'Effacer : la courbe du volume disparaît, celle du filtre reste');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(600);
  ok(!!(await saved()).volume, 'Ctrl+Z : la courbe revient');
  await lane.locator('.auto-clear').click();

  // lecture : la fréquence du passe-bas monte au fil de la mesure
  await page.click('#play');
  const id = await page.evaluate(() => document.querySelector('.track').dataset.id);
  // la courbe démarre avec le premier pas programmé (les sons se chargent d'abord)
  await page.waitForFunction((id) => { const st = SS.audio._autoState({ id }); return st && st.lp < 19000; }, id, { timeout: 8000 });
  const samples = [];
  for (let i = 0; i < 6; i++) {
    samples.push(await page.evaluate((id) => SS.audio._autoState({ id }).lp, id));
    await page.waitForTimeout(500);
  }
  const rising = samples.slice(1).filter((v, i) => v > samples[i]).length;
  ok(samples[0] < 400 && rising >= 4, `passe-bas qui s'ouvre : ${samples.map((v) => Math.round(v)).join(' → ')} Hz`);
  await page.click('#stop');
  await page.waitForTimeout(300);
  const st = await page.evaluate((id) => SS.audio._autoState({ id }), id);
  ok(st.lp > 15000 && st.vol === 1, `arrêt : retour au neutre (passe-bas ${Math.round(st.lp)} Hz, volume ${st.vol})`);

  // longueur de l'automation : 2 mesures, notes en boucle d'une mesure, courbe sur 2 mesures
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    p.bars = 2;
    p.tracks[0].length = 16;
    p.scenes = undefined;
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  await page.click('.track .th-auto');
  await page.waitForTimeout(300);
  const lenSel = lane.locator('.auto-len');
  ok((await lenSel.inputValue()) === '', 'longueur par défaut : comme la piste');
  ok((await lane.locator('.acell.beyond').count()) === 16, 'par défaut : cases au-delà de la boucle de la piste grisées');
  const opts = await lenSel.locator('option').allTextContents();
  ok(opts.some((o) => o.includes('2 mesures (32 pas)')) && opts.some((o) => o.includes('1 temps (4 pas)')), `choix proposés : ${opts.join(' / ')}`);
  await lenSel.selectOption('32');
  await page.waitForTimeout(600);
  ok((await lane.locator('.acell.beyond').count()) === 0, '2 mesures : toute la ligne est dessinable');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].autoLen === 32), 'longueur enregistrée (32 pas)');
  ok((await page.locator('.track .track-grid .cell.beyond').count()) === 16, 'les notes gardent leur boucle d’une mesure');
  await lenSel.selectOption('4');
  await page.waitForTimeout(300);
  ok((await lane.locator('.acell.beyond').count()) === 28, '1 temps : 4 cases actives');
  await lane.locator('.auto-param').selectOption('filter');
  await lane.locator('.auto-shape').selectOption('lp-open');
  await page.waitForTimeout(300);
  await page.waitForTimeout(400);
  const pts = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].auto[document.querySelector('.auto-param').value]);
  ok(pts && Math.max(...Object.keys(pts).map(Number)) === 3, `forme posée sur la longueur de l'automation : ${JSON.stringify(pts)}`);
  await lenSel.selectOption('');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => !('autoLen' in JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0])), 'retour à « comme la piste »');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
