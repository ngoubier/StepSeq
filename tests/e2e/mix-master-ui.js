/*
 * Test de bout en bout : chanson Band mixée et masterisée, module Mastering de la console, bus partagés, Placement.
 *   node tests/e2e/mix-master-ui.js
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
  await page.waitForTimeout(1200);
  await page.click('#bandBtn');
  await page.waitForTimeout(400);
  await page.click('#bandStyles [data-v="edm"]');
  await page.click('#bandPresets .band-preset >> nth=0'); // Levels
  await page.click('#bandSongBtn');
  await page.waitForTimeout(200);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1200);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const p = await P();
  const by = (k) => p.tracks.find((t) => t.band && t.band.key === k);
  ok(p.master && p.master.mastering && p.master.mastering.on && p.master.mastering.drive > 0, 'Master : mastering actif avec un gain d\'entrée');
  ok(p.returns && p.returns.hall.size > 1, 'bus partagés réglés pour le style');
  ok(by('drums:bd').mix.comp.on && by('drums:bd').mix.pan === 0, 'kick : compresseur, au centre');
  ok(by('lead').fx.sendHall > 0 && by('lead').fx.sendEcho > 0, 'lead : hall et écho');
  ok(by('bass').fx.scSource === by('drums:bd').id, 'basse : sidechain sur le kick');
  ok(new Set(p.tracks.map((t) => t.volume)).size > p.tracks.length / 2, 'volumes calibrés (différents d\'une piste à l\'autre)');

  // console : module Mastering
  await page.click('#mixBtn');
  await page.waitForTimeout(500);
  await page.click('#mixerStrips .strip[data-id="__master"]');
  await page.waitForTimeout(300);
  ok(await page.isVisible('.mod-mast'), 'console : module Mastering sur le Master');
  ok((await page.locator('.mod-mast .mast-tile').count()) === 5, 'mesures LUFS, true peak et réduction affichées');
  await page.click('.mod-mast .mod-power');
  await page.waitForTimeout(300);
  ok((await P()).master.mastering.on === false, 'le bouton coupe le mastering');
  await page.click('.mod-mast .mod-power');
  await page.waitForTimeout(300);
  ok((await P()).master.mastering.on === true, 'et le rallume');
  // lecture : les mesures LUFS arrivent
  await page.keyboard.press('Escape');
  await page.click('#play');
  await page.waitForTimeout(2500);
  await page.click('#mixBtn');
  await page.waitForTimeout(300);
  await page.click('#mixerStrips .strip[data-id="__master"]');
  await page.waitForTimeout(1500);
  const txt = await page.textContent('.mod-mast .mast-tiles');
  ok(/LUFS/.test(txt) && /dBTP/.test(txt), 'mesures en direct pendant la lecture : ' + txt.replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');
  await page.click('#stop').catch(() => {});

  // effets d'une piste : bus partagés
  await page.click(`.track[data-id="${by('lead').id}"] .fx-btn`);
  await page.waitForTimeout(300);
  ok(await page.isVisible('#fxSendSliders input'), 'fenêtre Effets : envois vers les bus partagés');
  await page.click('.fx-returns summary');
  const before = (await P()).returns.hall.size;
  await page.locator('#fxReturnSliders input').nth(1).evaluate((el) => {
    el.value = 900;
    el.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1200);
  ok((await P()).returns.hall.size !== before, 'réglage commun du hall modifié');
  ok(!errs.length, "pas d'erreur JS " + errs.join(' | '));
  await b.close();
  server.close();
})();
