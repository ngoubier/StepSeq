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
  await page.evaluate(() => document.querySelector('#emptyAdd').click()); // le bouton de l'écran vide (la démo est chargée)
  await page.waitForSelector('#trackDialog[open]');
  ok(await page.$eval('#dlgGm button[data-v="all"]', (e) => e.classList.contains('active')), 'nouveau projet : sons « Tous »');
  await page.click('#dlgGm button[data-v="gm"]');
  await page.waitForTimeout(800);
  const drumLibs = await page.$$eval('#dlgDrumLib button', (bs) => bs.filter((x) => !x.hidden).map((x) => x.dataset.v));
  ok(drumLibs.join() === 'gm', `drums : seule la bibliothèque General MIDI (${drumLibs.join()})`);
  ok(/^36 · Kick/.test(await page.textContent('#dlgDrumList .pl-item.sel')), 'drum : Kick GM (36) choisi');
  await page.click('#dlgRoles button[data-v="bass"]');
  await page.waitForTimeout(300);
  const progs = await page.$$eval('#dlgSndList .pl-item', (xs) => xs.map((x) => x.dataset.v + '=' + x.querySelector('.pl-label').textContent));
  ok(progs.length === 8 && progs[0] === 'p32=Acoustic Bass' && progs[6] === 'p38=Synth Bass 1', `rôle Basse : les 8 programmes GM des basses (${progs[0]} … ${progs[7]})`);
  ok((await page.locator('#dlgSndList .pl-item[data-v^="j:"], #dlgSndList .pl-item[data-v^="i:"]').count()) === 0, 'ni patch Juno ni instrument hors General MIDI');
  await page.click('#dlgSndList .pl-item[data-v="p38"]');
  await page.fill('#dlgSearch', 'piano');
  await page.waitForTimeout(200);
  const found = await page.$$eval('#dlgSndList .pl-item .pl-label', (xs) => xs.map((x) => x.textContent));
  ok(found.includes('Bright Acoustic Piano') && found.includes('Honky-tonk Piano'), `recherche « piano » : ${found.length} programmes, dont 2 et 4`);
  await page.fill('#dlgSearch', '');
  await page.waitForTimeout(100);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gm-track-dialog.png') });
  await page.click('#dlgOk');
  await page.waitForTimeout(600);
  let p = await saved(page);
  const last = p.tracks[p.tracks.length - 1];
  ok(p.gm === true, 'le mode General MIDI est enregistré dans le projet');
  ok(last.instrument === 'gm_synth_bass_1' && last.name === 'Synth Bass 1', `piste créée : ${last.name} (${last.instrument})`);

  // ---- badges GM dans la liste des pistes ----
  const badges = () => page.$$eval('.track', (ts) => ts.map((t) => [t.querySelector('.th-name b').textContent, (t.querySelector('.th-gm') || {}).textContent || '', !!t.querySelector('button.th-gm.no')]));
  let bs = await badges();
  console.log(JSON.stringify(bs));
  ok(bs.some(([n, g]) => n === 'Synth Bass 1' && g === 'GM 39'), 'badge « GM 39 » sur la basse GM');
  const other = bs.findIndex(([, , no]) => no);
  ok(other >= 0, `badge orange « ≈ GM » sur une piste non GM (${other >= 0 ? bs[other][0] + ' : ' + bs[other][1] : 'aucune'})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gm-badges.png'), clip: { x: 0, y: 270, width: 700, height: 260 } });
  if (other >= 0) {
    const els = await page.$$('.track');
    await (await els[other].$('button.th-gm.no')).click();
    await page.waitForTimeout(500);
    const after = (await badges())[other];
    ok(!after[2] && /^GM [0-9]+$/.test(after[1]), `clic : « ${after[0]} » converti en General MIDI (${after[1]})`);
    p = await saved(page);
    ok(await page.evaluate((t) => !!SS.trackMidi(t), p.tracks[other]), 'la piste convertie est General MIDI dans le projet');
  }

  // ---- Band suit le même réglage ----
  await page.click('#appMenuBtn'); await page.click('#bandBtn');
  await page.waitForSelector('#bandDialog[open]');
  await page.waitForTimeout(300);
  await page.dispatchEvent('#bwNext', 'click'); // étape 2 : Instruments (musiciens et General MIDI)
  ok(await page.$eval('#bandGm', (e) => e.classList.contains('active')), 'Band : General MIDI activé (réglage du projet)');
  const stage = await page.$$eval('#bandStage .bm-inst', (xs) => xs.map((x) => x.textContent));
  ok(stage.some((x) => /Batterie General MIDI/.test(x)), `scène : ${stage.join(' | ')}`);
  await page.click('#bandStage .band-mus');
  await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gm-band.png') });
  await page.click('#bandStage .band-mus');
  for (let i = 0; i < 11; i++) await page.dispatchEvent('#bwNext', 'click'); await page.click('#bwCreate');
  await page.waitForTimeout(400);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(800);
  p = await saved(page);
  const created = p.tracks.filter((t) => t.band);
  const gmOk = await page.evaluate((ts) => ts.map((t) => !!SS.trackMidi(t)), created);
  ok(created.length > 3 && gmOk.every(Boolean), `Band : ${created.length} pistes créées, toutes General MIDI (${created.map((t) => t.name).join(', ')})`);

  // ---- couper le mode depuis Band : la fenêtre de piste revient à tous les sons ----
  page.once('dialog', (d) => d.accept()); // « Remplacer le brouillon de l’assistant ? » (la chanson créée garde son brouillon)
  await page.click('#appMenuBtn'); await page.click('#bandBtn');
  await page.waitForSelector('#bandDialog[open]');
  await page.dispatchEvent('#bwNext', 'click');
  await page.click('#bandGm');
  await page.waitForTimeout(200);
  const kit = await page.$$eval('#bandStage .bm-inst', (xs) => xs.map((x) => x.textContent).join(' | '));
  ok(!/General MIDI/.test(kit), 'Band sans General MIDI : kits habituels');
  await page.click('#bandClose');
  await page.evaluate(() => document.querySelector('#emptyAdd').click()); // le bouton de l'écran vide (la démo est chargée)
  await page.waitForSelector('#trackDialog[open]');
  ok(await page.$eval('#dlgGm button[data-v="all"]', (e) => e.classList.contains('active')), 'fenêtre de piste : retour à « Tous »');
  await page.click('#dlgCancel');
  await page.waitForTimeout(800); // enregistrement automatique différé
  ok(!(await saved(page)).gm, 'réglage retiré du projet');
  bs = await badges();
  ok(!bs.some(([, , no]) => no) && bs.some(([, g]) => /^GM/.test(g)), 'mode coupé : plus de badge orange, les badges GM restent');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  void before;
  await b.close();
  server.close();
})();
