/*
 * Pilote du Master : limiteur et compresseur pendant une lecture réelle, puis
 * diagnostic EQ contrôlé pour vérifier la rampe, le repérage, Ctrl+Z et la reprise manuelle.
 *   node tests/e2e/automix-master-pilot.js
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
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  await page.click('#bandBtn');
  await page.waitForTimeout(400);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=1');
  for (let i = 0; i < 3; i++) await page.click('#bwNext'); await page.click('#bwCreate');
  await page.waitForTimeout(200);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);

  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  await page.click('#mixerBtn');
  await page.click('#mixerStrips .strip.master .strip-name');
  await page.click('.mod-comp .mod-power');
  await page.click('.mod-mast .mod-power');
  if ((await P()).master.mix.lim.on) await page.click('.mod-lim .mod-power');
  await page.waitForTimeout(1200);
  const before = await P();
  ok(!before.master.mix.comp.on && !before.master.mastering.on, 'Master initial : compresseur et mastering désactivés');
  await page.click('#amPilotBtn');
  // Ce scénario isole le Master après la phase de pistes ; le cycle complet a son propre test.
  await page.evaluate(() => {
    SS.automixPilot.plan = () => ({ state: { balanced: true, waiting: [] } });
    SS.automixPanel._state().pilot.trackDone = new Set(JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.map((t) => t.id));
  });
  await page.waitForFunction(() => SS.automixPanel._state().pilot.masterSpent.lim >= 1, { }, { timeout: 25000 });
  await page.waitForTimeout(1000);
  ok((await P()).master.mix.lim.on && (await P()).master.mix.lim.ceil <= -1, 'écoute réelle : limiteur Master activé, plafond protégé');
  await page.waitForFunction(() => SS.automixPanel._state().pilot.masterSpent.comp >= 1, {}, { timeout: 25000 });
  await page.waitForTimeout(1000);
  let p = await P();
  ok(p.master.mix.comp.on && p.master.mix.comp.ratio === 1.5, 'écoute réelle : compression légère appliquée');
  ok(p.tracks.every((t, i) => t.volume === before.tracks[i].volume), 'phase Master : aucun fader de piste modifié');

  // Un diagnostic tonal contrôlé exerce la rampe et le retour visuel de l’EQ.
  await page.evaluate(() => {
    const original = SS.automixPilot.planMaster;
    const pilot = SS.automixPanel._state().pilot;
    pilot.lastMove = -Infinity;
    SS.automixPilot.planMaster = () => {
      SS.automixPilot.planMaster = original;
      const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
      return { module: 'eq', title: 'Égaliseur · équilibre des aigus', changes: [
        { path: 'mix.eq.high.g', from: p.master.mix.eq.high.g, to: p.master.mix.eq.high.g - 0.5 },
        { path: 'mix.eq.on', from: p.master.mix.eq.on, to: true },
      ] };
    };
  });
  await page.waitForSelector('.mod-eq.pilot-control');
  ok(await page.locator('[data-control="mix.eq.high.g"].pilot-value').count() === 1, 'EQ Master : valeur exacte du shelf illuminée');
  ok(await page.locator('.strip.master.selected.pilot-working').count() === 1, 'EQ en cours : Master sélectionné et module illuminé');
  ok(/Égaliseur/.test(await page.textContent('.am-pilot-task')), 'action Master décrite dans le panneau');
  await page.waitForFunction(() => !SS.automixPanel._state().pilot.ramp);
  await page.waitForTimeout(1000);
  const eq = (await P()).master.mix.eq.high.g;
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1000);
  ok(Math.abs((await P()).master.mix.eq.high.g - eq - 0.5) < 0.01, 'Ctrl+Z annule le geste EQ');
  ok(await page.evaluate(() => SS.automixPanel._state().pilot.masterLocked.has('eq')), 'EQ annulé : module repris par l’utilisateur');
  await page.locator('.mod-comp input[type=range]').nth(1).fill('300');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => SS.automixPanel._state().pilot.masterLocked.has('comp')), 'ratio retouché : compresseur repris à la main');
  await page.click('#amPilotStop');
  ok(await page.locator('.pilot-control').count() === 0, 'arrêt : mise en évidence effacée');
  ok(!errs.length, 'aucune erreur JavaScript : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
