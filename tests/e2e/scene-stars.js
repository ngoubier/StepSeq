/*
 * ★ par scène et motif joué d'office des musiciens ajoutés (Basse, Nappe, Guitariste, Arpège ; js/scenestars.js) :
 *   node tests/e2e/scene-stars.js        (SHOTS=dossier : captures)
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
const SHOTS = process.env.SHOTS;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const add = async (type) => {
    await page.click('#bgAdd');
    await page.click(`.bg-tyc[data-type="${type}"]`);
    await page.click('#bgValidate');
    await page.waitForTimeout(250);
  };
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);
  for (const t of ['bass', 'chords', 'guitar', 'arp']) await add(t);
  const extra = await page.evaluate(() => SS.band.insSteps().filter((T) => SS.bandGroup.isExtraId(T.musician)).map((T) => ({ id: T.id, kind: T.kind })));
  ok(['bass', 'chords', 'guitar', 'arp'].every((k) => extra.some((x) => x.kind === k)), `quatre musiciens ajoutés (${extra.map((x) => x.kind)})`);
  const open = async (kind, sec) => {
    const n = await page.evaluate((k) => SS.band.stepNum({ inst: SS.band.insSteps().filter((T) => T.kind === k && SS.bandGroup.isExtraId(T.musician))[0].id }), kind);
    while ((await page.evaluate(() => SS.band._state.wiz.step)) < n) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
    await page.click(`.bh-scene[data-sec="${sec}"]`);
    await page.waitForTimeout(300);
  };
  // Basse ajoutée : refrain → ★ syncopées, la première jouée d'office (auto)
  await open('bass', 'chorus');
  let st = await page.$$eval('#bwMotif .mot-card .mot-star', (els) => els.length);
  let on = await page.$eval('#bwMotif .mot-card.on', (e) => ({ id: e.dataset.id, auto: !!e.querySelector('.mot-badge.auto'), star: !!e.querySelector('.mot-star') }));
  ok(st >= 2 && on.auto && on.star && (await page.locator('#bwMotif .mot-chip.star').count()) === 1, `Basse ajoutée au refrain : ★ (${st}), ${on.id} joué d’office (auto)`);
  ok(await page.evaluate((id) => SS.bassMotifs.familyOf(id) === 'synco', on.id), 'refrain : une basse syncopée');
  if (SHOTS) await (await page.$('#bwMotif')).screenshot({ path: path.join(SHOTS, 'etoiles-basse.png') });
  await page.click('.bh-scene[data-sec="intro"]');
  await page.waitForTimeout(300);
  on = await page.$eval('#bwMotif .mot-card.on', (e) => e.dataset.id);
  ok(await page.evaluate((id) => SS.bassMotifs.familyOf(id) === 'tenue', on), `intro : une basse tenue (${on})`);
  // Nappe ajoutée : intro → tenue
  await open('chords', 'intro');
  on = await page.$eval('#bwPadMotif .mot-card.on', (e) => ({ id: e.dataset.id, auto: !!e.querySelector('.mot-badge.auto') }));
  ok(on.auto && (await page.evaluate((id) => SS.padMotifs.familyOf(id) === 'tenue', on.id)), `Nappe ajoutée à l’intro : ${on.id}, tenue, auto`);
  // Guitariste ajouté : ★ dans la carte
  await open('guitar', 'chorus');
  ok((await page.locator('#bwGuitarist .mot-star').count()) >= 1, 'Guitariste : ★ pour le refrain');
  // Arpège ajouté : rangée ★, la première allumée (auto), un clic en pose une autre
  await open('arp', 'chorus');
  const chips = await page.$$eval('#bwaStars .mot-chip', (els) => els.map((e) => ({ id: e.dataset.id, on: e.classList.contains('on'), auto: /auto/.test(e.textContent) })));
  ok(chips.length >= 2 && chips[0].on && chips[0].auto && chips[0].id === 'up16', `Arpège ajouté au refrain : ★ ${chips.map((c) => c.id)}, Montée jouée d’office`);
  if (SHOTS) await (await page.$('.bwa')).screenshot({ path: path.join(SHOTS, 'etoiles-arpege.png') });
  await page.click(`#bwaStars [data-id="${chips[1].id}"]`);
  await page.waitForTimeout(300);
  ok(await page.evaluate((id) => Object.values(SS.band._state.wiz.parts.chorus.inst || {}).some((x) => x.mode === id), chips[1].id), `clic : ${chips[1].id} posé sur le refrain`);
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
