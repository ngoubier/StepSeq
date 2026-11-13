/*
 * Test de bout en bout du mode General MIDI : fenêtre « Nouvelle piste » et Band partagent le réglage du projet.
 *   node tests/e2e/gm-mode-ui.js [dossier-captures]
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
const [SHOTS] = process.argv.slice(2);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const before = (await saved(page)) || { tracks: [] };

  // ---- fenêtre de piste : passer en General MIDI ----
  await page.click('#emptyAdd, #empty button');
  await page.waitForSelector('#trackDialog[open]');
  ok(await page.$eval('#dlgGm button[data-v="all"]', (e) => e.classList.contains('active')), 'nouveau projet : sons « Tous »');
  await page.click('#dlgGm button[data-v="gm"]');
  await page.waitForTimeout(800);
  const drumLibs = await page.$$eval('#dlgDrumLib button', (bs) => bs.filter((x) => !x.hidden).map((x) => x.dataset.v));
  ok(drumLibs.join() === 'gm', `drums : seule la bibliothèque General MIDI (${drumLibs.join()})`);
  ok(/^36 · Kick/.test(await page.textContent('#dlgDrumList .pl-item.sel')), 'drum : Kick GM (36) choisi');
  ok(await page.$eval('#dlgType button[data-v="synth"]', (e) => e.disabled), 'type Synthé désactivé');
  await page.click('#dlgType button[data-v="instrument"]');
  await page.waitForTimeout(300);
  ok(await page.$eval('#dlgFamilies', (e) => e.hidden) && !(await page.$eval('#dlgGmGroups', (e) => e.hidden)), '16 familles General MIDI à la place des familles StepSeq');
  await page.click('#dlgGmGroups button[data-v="4"]');
  await page.waitForTimeout(200);
  const progs = await page.$$eval('#dlgInstList .pl-item .pl-label', (xs) => xs.map((x) => x.textContent));
  ok(progs.length === 8 && progs[0] === '33 · Acoustic Bass' && progs[6] === '39 · Synth Bass 1', `famille Basses : ${progs[0]} … ${progs[7]}`);
  await page.click('#dlgInstList .pl-item[data-v="p38"]');
  await page.fill('#dlgInstFilter', 'piano');
  await page.waitForTimeout(200);
  const found = await page.$$eval('#dlgInstList .pl-item .pl-label', (xs) => xs.map((x) => x.textContent));
  ok(found.includes('2 · Bright Acoustic Piano') && found.includes('4 · Honky-tonk Piano'), `recherche « piano » : ${found.length} programmes, dont 2 et 4`);
  await page.fill('#dlgInstFilter', '');
  await page.waitForTimeout(100);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gm-track-dialog.png') });
  await page.click('#dlgOk');
  await page.waitForTimeout(600);
  let p = await saved(page);
  const last = p.tracks[p.tracks.length - 1];
  ok(p.gm === true, 'le mode General MIDI est enregistré dans le projet');
  ok(last.instrument === 'gm_synth_bass_1' && last.name === 'Synth Bass 1', `piste créée : ${last.name} (${last.instrument})`);

  // ---- Band suit le même réglage ----
  await page.click('#bandBtn');
  await page.waitForSelector('#bandDialog[open]');
  await page.waitForTimeout(300);
  ok(await page.$eval('#bandGm', (e) => e.classList.contains('active')), 'Band : General MIDI activé (réglage du projet)');
  const stage = await page.$$eval('#bandStage .bm-inst', (xs) => xs.map((x) => x.textContent));
  ok(stage.some((x) => /Batterie General MIDI/.test(x)), `scène : ${stage.join(' | ')}`);
  await page.click('#bandStage .band-mus');
  await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gm-band.png') });
  const n0 = p.tracks.length;
  await page.click('#bandCreate');
  await page.waitForTimeout(400);
  if (await page.$('#bandConfirm:not([hidden]) #bcfAdd')) await page.click('#bcfAdd');
  await page.waitForTimeout(800);
  p = await saved(page);
  const created = p.tracks.slice(n0);
  const gmOk = await page.evaluate((ts) => ts.map((t) => !!SS.trackMidi(t)), created);
  ok(created.length > 3 && gmOk.every(Boolean), `Band : ${created.length} pistes créées, toutes General MIDI (${created.map((t) => t.name).join(', ')})`);

  // ---- couper le mode depuis Band : la fenêtre de piste revient à tous les sons ----
  await page.click('#bandBtn');
  await page.waitForSelector('#bandDialog[open]');
  await page.click('#bandGm');
  await page.waitForTimeout(200);
  const kit = await page.$$eval('#bandStage .bm-inst', (xs) => xs.map((x) => x.textContent).join(' | '));
  ok(!/General MIDI/.test(kit), 'Band sans General MIDI : kits habituels');
  await page.click('#bandCancel');
  await page.click('#emptyAdd, #empty button');
  await page.waitForSelector('#trackDialog[open]');
  ok(await page.$eval('#dlgGm button[data-v="all"]', (e) => e.classList.contains('active')), 'fenêtre de piste : retour à « Tous »');
  await page.click('#dlgCancel');
  ok(!(await saved(page)).gm, 'réglage retiré du projet');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  void before;
  await b.close();
  server.close();
})();
