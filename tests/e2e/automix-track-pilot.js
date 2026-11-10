/*
 * Pilote piste par piste : attente d’équilibre contrôlée puis équilibrage et traitements réels, réécoute complète entre deux pistes et Master global.
 *   node tests/e2e/automix-track-pilot.js
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
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  demo.tracks = demo.tracks.slice(0, 2);
  demo.tracks.forEach((t) => {
    t.volume = 0.25;
    t.mix = { pan: 0.2, eq: { on: false }, comp: { on: false }, lim: { on: false } };
  });
  demo.tracks.push({ ...structuredClone(demo.tracks[1]), id: 'silent-track', name: 'Piste silencieuse', steps: demo.tracks[1].steps.map(() => 0) });
  demo.master = { volume: 0.8, mix: { eq: { on: false }, comp: { on: false }, lim: { on: false } }, mastering: { on: false } };
  await page.addInitScript((p) => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const initial = await P();
  const [first, second] = initial.tracks.map((t) => t.id);
  await page.click('#mixerBtn');
  await page.click('#amBtn');
  // Contrôle du signal « équilibre atteint » : les mesures audio et traitements restent réels.
  await page.evaluate(() => {
    const plan = SS.automixPilot.plan;
    SS.automixPilot.plan = (...args) => window.__balanced ? plan(...args) : ({ state: { balanced: false, waiting: [] } });
  });
  ok(await page.locator('#amPilot input[type=checkbox]').count() === 0, 'aucune case de sélection : cycle complet par défaut');
  await page.click('#amPilotBtn');
  await page.waitForTimeout(11000);
  ok((await P()).tracks.every((t) => !t.mix.eq.on && !t.mix.comp.on), 'aucun traitement de piste avant l’équilibre du mix');
  await page.evaluate(() => { window.__balanced = true; });
  await page.waitForFunction(() => !!SS.automixPanel._state().pilot.ramp?.master?.track, {}, { timeout: 60000 });
  ok(await page.locator(`.strip[data-id="${first}"].selected.pilot-working`).count() === 1, 'première piste sélectionnée pendant son traitement');
  ok(await page.locator(`.strip[data-id="${first}"] .strip-pan.pilot-value`).count() === 1, 'panoramique : commande précise illuminée pendant le recentrage');
  await page.waitForFunction((id) => SS.automixPanel._state().pilot.trackDone.has(id), first, { timeout: 30000 });
  await page.waitForTimeout(700);
  const one = await P();
  ok(one.tracks[0].mix.pan === 0, 'kick recentré automatiquement');
  ok(one.tracks[0].mix.eq.on && one.tracks[0].mix.comp.on, 'première piste : EQ et compression activées à partir de l’écoute réelle');
  ok(!one.tracks[1].mix.eq.on && !one.tracks[1].mix.comp.on, 'deuxième piste encore intacte');
  ok(/Réécoute du mix/.test(await page.textContent('#amPilotStatus')), 'phase de réécoute clairement indiquée');
  await page.waitForTimeout(5000);
  ok(!(await page.evaluate((id) => SS.automixPanel._state().pilot.trackDone.has(id), second)), 'pas de piste suivante pendant la réécoute');
  ok(!(await page.evaluate(() => !!SS.automixPanel._state().pilot.ramp)), 'aucun traitement simultané pendant la réécoute');
  await page.waitForFunction((id) => SS.automixPanel._state().pilot.currentTrack === id, second, { timeout: 60000 });
  const heard = await page.evaluate(() => SS.automixPanel._state().pilot.masterAcc.secs);
  ok(heard >= 10, 'la piste suivante démarre après au moins 10 s de nouvelles mesures');
  await page.waitForFunction((id) => SS.automixPanel._state().pilot.trackDone.has(id), second, { timeout: 30000 });
  await page.waitForTimeout(800);
  const two = await P();
  ok(two.tracks.slice(0, 2).every((t) => t.mix.eq.on && t.mix.comp.on), 'les deux pistes sont traitées successivement');
  await page.waitForFunction(() => Object.keys(SS.automixPanel._state().pilot.masterSpent).length > 0, {}, { timeout: 25000 });
  ok(await page.evaluate(() => SS.automixPanel._state().pilot.trackDone.size === 2), 'traitement global du Master après les pistes');
  ok((await P()).tracks.every((t) => Number.isFinite(t.volume)), 'équilibrage des faders et traitements combinés terminés');
  ok(!(await page.evaluate(() => SS.automixPanel._state().pilot.trackDone.has('silent-track'))), 'piste silencieuse différée sans bloquer le Master global');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(2000);
  await page.locator(`.strip[data-id="${first}"] .strip-name`).click();
  await page.locator('.mod-comp input[type=range]').nth(1).fill('300');
  await page.waitForTimeout(1000);
  ok(await page.evaluate((id) => SS.automixPanel._state().pilot.trackLocked.get(id)?.has('comp'), first), 'compresseur de piste retouché : module rendu à l’utilisateur');
  await page.screenshot({ path: '/tmp/stepseq-track-pilot.png' });
  await page.click('#amPilotBtn');
  ok(await page.locator('.pilot-control, .pilot-working').count() === 0, 'arrêt : tous les témoins de traitement sont retirés');
  ok(!errs.length, 'aucune erreur JavaScript : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
