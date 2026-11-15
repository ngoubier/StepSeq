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
  for (let i = 0; i < 3; i++) await page.click('#bwNext'); await page.click('#bwCreate');
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
  await page.click('#mixerBtn');
  await page.waitForTimeout(500);
  ok(await page.locator('#mxResetFaders, .profile-bar, .profile-select, .strip-prof, #mixerTop').count() === 0, 'profils et bouton Faders par défaut retirés');
  ok(await page.locator('.strip-role').first().textContent() === 'Kick', 'rôle de la piste conservé sans les profils');
  await page.click('#mixerStrips .strip[data-id="__master"] .strip-name');
  await page.waitForTimeout(300);
  ok(await page.isVisible('.mod-mast'), 'console : module Mastering sur le Master');
  ok((await page.locator('.mod-mast .mast-tile').count()) === 5, 'mesures LUFS, true peak et réduction affichées');
  await page.click('.mod-mast .mod-power');
  await page.waitForTimeout(1200);
  ok((await P()).master.mastering.on === false, 'le bouton coupe le mastering');
  await page.click('.mod-mast .mod-power');
  await page.waitForTimeout(1200);
  ok((await P()).master.mastering.on === true, 'et le rallume');
  // lecture : les mesures LUFS arrivent
  await page.keyboard.press('Escape');
  await page.click('#play');
  await page.waitForTimeout(2500);
  await page.click('#mixerBtn');
  await page.waitForTimeout(300);
  await page.click('#mixerStrips .strip[data-id="__master"] .strip-name');
  await page.waitForTimeout(1500);
  const txt = await page.textContent('.mod-mast .mast-tiles');
  ok(/LUFS/.test(txt) && /dBTP/.test(txt), 'mesures en direct pendant la lecture : ' + txt.replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');
  await page.click('#stop').catch(() => {});

  // effets d'une piste : bus partagés
  await page.click(`.track[data-id="${by('lead').id}"] .fx-btn`);
  await page.waitForTimeout(300);
  ok(await page.isVisible('#fxSendSliders input'), 'fenêtre Effets : envois vers les bus partagés');
  await page.click('#fxTabs [data-tab="rev"]');
  const before = (await P()).returns.hall.size;
  await page.locator('#fxRet_rev input').nth(1).evaluate((el) => {
    el.value = 900;
    el.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1200);
  ok((await P()).returns.hall.size !== before, 'réglage commun du hall modifié');

  // « Tout réinitialiser » : faders par défaut, tranches à plat, Master d'origine, mastering coupé ; effets gardés
  await page.keyboard.press('Escape');
  await page.click('#mixerBtn');
  await page.waitForTimeout(300);
  const mixed = await P();
  await page.click('#mxResetAll');
  await page.waitForTimeout(1200);
  const zero = await P();
  ok(zero.tracks.every((t) => Math.abs(t.volume - 0.501) < 0.002 && !t.mix) && zero.master.volume === 0.8,
    'tout réinitialiser : faders par défaut, égaliseurs, compresseurs, limiteurs et panoramiques à plat');
  ok(!zero.master.mastering.on && zero.master.mix.comp.th === -10 && zero.master.mix.lim.on && !zero.master.mix.eq.on,
    'tout réinitialiser : Master d\'origine (glue et limiteur de sécurité), mastering coupé');
  ok(JSON.stringify(zero.tracks.map((t) => t.fx)) === JSON.stringify(mixed.tracks.map((t) => t.fx)),
    'les effets des pistes (reverb, écho, sidechain) sont conservés');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1200);
  const back = await P();
  ok(back.master.mastering.on && back.tracks.every((t, i) => t.volume === mixed.tracks[i].volume),
    'Ctrl+Z rend tout le mix d\'avant en une fois');
  ok(!errs.length, "pas d'erreur JS " + errs.join(' | '));
  await b.close();
  server.close();
})();
