/*
 * Test de bout en bout de la piste Accords et des interrupteurs ARP / ACCORDS (Playwright + Chromium).
 *   node tests/e2e/chord-lane.js
 * Lance son propre petit serveur web sur le dossier du projet. Nécessite le paquet « playwright ».
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
(async () => {
  await new Promise((r) => server.listen(0, r));
  const URL = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::/.test(m.text()) && errs.push(m.text()));

  // démo « Train de nuit » : ancienne piste Arpège (category: 'arp') et piste Accord
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => { if (!sessionStorage.done) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.done = 1; } }, demo);
  await page.goto(URL);
  await page.waitForTimeout(1000);
  const saved = async () => (await page.waitForTimeout(400), page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave'))));
  const trackEl = (name) => page.locator('.track', { has: page.locator('.th-name b', { hasText: name }) }).first();

  // 1. migration : l'ancienne piste Arpège a ARP allumé (vérifié dans le fichier après la première modification)
  let p;
  ok(await trackEl('Arpège').locator('.th-arp.on').count() === 1, 'bouton ARP allumé dans l’en-tête de la piste Arpège');
  ok(await trackEl('Kick').locator('.th-mode').count() === 0, 'pas de ARP / ACCORDS sur une piste Drum');

  // 2. piste Accords : un clic pose un accord d'une mesure (tonique), le panneau s'ouvre
  const cell = (s) => page.locator(`#chordLane .clcell[data-step="${s}"]`);
  await cell(0).click();
  await page.waitForSelector('.cl-menu');
  p = await saved();
  ok(p.tracks.every((t) => !('category' in t)), 'plus de catégorie Mono / Arpège / Accord dans les pistes');
  ok(p.tracks.find((t) => t.name === 'Arpège').arpOn === true, 'ancienne piste Arpège : ARP allumé');
  let sc = p.scenes.find((x) => x.id === p.current);
  ok(sc.grid && sc.grid.chords.length === 1 && sc.grid.chords[0].len === 16 && sc.grid.chords[0].degree === 0, 'clic : accord de tonique sur 1 mesure');
  // degré VI, puis un 2e accord de 2 temps
  await page.locator('.cl-menu .cl-deg', { hasText: 'VI' }).first().click();
  await page.keyboard.press('Escape');
  await cell(16).click();
  await page.waitForSelector('.cl-menu');
  await page.locator('.cl-menu .cl-durs .chip', { hasText: '2 temps' }).click();
  await page.keyboard.press('Escape');
  p = await saved();
  sc = p.scenes.find((x) => x.id === p.current);
  ok(sc.grid.chords[0].degree === 5, 'panneau : degré VI choisi');
  ok(sc.grid.chords[1].step === 16 && sc.grid.chords[1].len === 8, 'durée « 2 temps » (8 pas)');
  ok(await page.locator('#chordLane .cl-blk').count() === 2, 'deux accords affichés dans la piste Accords');

  // 3. bord droit glissé : l'accord s'allonge, au temps près
  const blk = page.locator('#chordLane .cl-blk').nth(1);
  const rz = await blk.locator('.cl-rz').boundingBox();
  const c28 = await cell(27).boundingBox();
  await page.mouse.move(rz.x + 4, rz.y + rz.height / 2);
  await page.mouse.down();
  await page.mouse.move(c28.x + 5, rz.y + rz.height / 2, { steps: 6 });
  await page.mouse.up();
  p = await saved();
  sc = p.scenes.find((x) => x.id === p.current);
  ok(sc.grid.chords[1].len === 12, `bord droit glissé jusqu'au 3e temps : 12 pas (${sc.grid.chords[1].len})`);

  // 3b. basse et pédale (éditeur d'accord, bande de pédale)
  await page.locator('#chordLane .cl-blk').first().click();
  await page.waitForSelector('.cl-menu');
  ok(await page.locator('.cl-menu .cl-type select').nth(0).locator('option', { hasText: '7(no3)' }).count() === 1, 'type 7(no3) dans la liste');
  await page.locator('.cl-menu label', { hasText: 'Basse' }).locator('select').selectOption({ index: 7 });
  p = await saved();
  sc = p.scenes.find((x) => x.id === p.current);
  ok(sc.grid.chords[0].bass === 7, 'basse choisie : la quinte (accord renversé)');
  ok((await page.locator('#chordLane .cl-blk b').first().textContent()).includes('/'), `nom de l'accord avec sa basse : ${await page.locator('#chordLane .cl-blk b').first().textContent()}`);
  await page.locator('.cl-menu .cl-pedrow .chip', { hasText: '2 mesures' }).click();
  p = await saved();
  sc = p.scenes.find((x) => x.id === p.current);
  ok(sc.grid.pedals && sc.grid.pedals.length === 1 && sc.grid.pedals[0].step === 0 && sc.grid.pedals[0].len === 32, 'pédale posée sur 2 mesures');
  ok(await page.locator('#chordLane .cl-ped').count() === 1, 'bande de pédale sous les accords');
  ok(await page.locator('.cl-menu label', { hasText: 'Basse' }).locator('select').isDisabled(), 'sous la pédale, la basse est imposée');
  const names = await page.locator('#chordLane .cl-blk b').allTextContents();
  ok(names[1].includes('/'), `le 2e accord prend la pédale à la basse : ${names.join(', ')}`);
  await page.keyboard.press('Escape');
  await page.locator('#chordLane .cl-ped').click();
  await page.waitForSelector('.cl-menu');
  ok((await page.locator('.cl-menu .ctx-current').textContent()).startsWith('Pédale de'), 'clic sur la bande : réglages de la pédale');
  await page.locator('.cl-menu button', { hasText: 'Retirer la pédale' }).click();
  p = await saved();
  sc = p.scenes.find((x) => x.id === p.current);
  ok(!sc.grid.pedals && await page.locator('#chordLane .cl-ped').count() === 0, 'pédale retirée');
  await page.locator('#chordLane .cl-blk').first().click();
  await page.waitForSelector('.cl-menu');
  await page.locator('.cl-menu label', { hasText: 'Basse' }).locator('select').selectOption({ index: 0 });
  await page.keyboard.press('Escape');

  // 4. ACCORDS sur la nappe : accords tenus, piste en lecture seule
  await trackEl('Nappe').locator('.th-chd').click();
  p = await saved();
  const nappe = p.tracks.find((t) => /Nappe/.test(t.name));
  ok(nappe.follow && nappe.follow.play === 'hold', 'ACCORDS allumé sur la nappe : jeu tenu');
  ok(await trackEl('Nappe').evaluate((el) => el.classList.contains('follow-ghost')), 'la nappe montre les accords en pointillés');
  // 5. ACCORDS sur l'arpège : arpège des accords de la scène
  await trackEl('Arpège').locator('.th-chd').click();
  p = await saved();
  ok(p.tracks.find((t) => t.name === 'Arpège').follow, 'ARP + ACCORDS sur la piste Arpège');

  // 6. lecture : l'arpège joue les notes des accords de la scène
  await page.evaluate(() => {
    window.__arp = [];
    const f = SS.Arp.renderStep;
    SS.Arp.renderStep = (...a) => { const r = f(...a); window.__arp.push(...r.map((n) => n.midi % 12)); return r; };
  });
  await page.locator('#songMode button[data-mode="loop"]').click(); // boucle sur la scène en cours
  await page.mouse.click(600, 5);
  await page.click('#play');
  await page.waitForTimeout(2500);
  await page.click('#stop');
  const pcs = await page.evaluate(() => [...new Set(window.__arp)].sort((a, b) => a - b));
  // VI de Fa mineur = Ré♭ majeur (Ré♭, Fa, La♭), puis i = Fa mineur (Fa, La♭, Do)
  ok(pcs.includes(1) && pcs.every((x) => [0, 1, 5, 8].includes(x)), `l'arpège joue Ré♭ puis Fa mineur (${pcs.join(',')})`);

  // 7. réglages d'ACCORDS (clic droit) et « Convertir en notes »
  await trackEl('Nappe').locator('.th-chd').click({ button: 'right' });
  await page.waitForSelector('.fol-menu');
  await page.locator('.fol-menu .fol-seg button', { hasText: 'Fondamentale' }).click();
  p = await saved();
  ok(p.tracks.find((t) => /Nappe/.test(t.name)).follow.notes === 'root', 'réglage : fondamentale seule');
  await page.locator('.fol-menu button', { hasText: 'Convertir en notes' }).click();
  p = await saved();
  const conv = p.tracks.find((t) => /Nappe/.test(t.name));
  ok(!conv.follow && conv.events.length === 2 && conv.events.every((e) => e.notes.length === 1), 'convertie : une note par accord, la piste ne suit plus');

  // 8. fenêtre Nouvelle piste : plus de catégorie, deux interrupteurs
  await page.click('#emptyAdd');
  await page.waitForTimeout(300);
  ok(await page.locator('#dlgCategory').count() === 0, 'Nouvelle piste : plus de catégorie');
  await page.locator('#dlgType button[data-v="instrument"]').click();
  ok(await page.locator('#dlgArp').isVisible() && await page.locator('#dlgFollow').isVisible(), 'Nouvelle piste : cases Arpégiateur et Jouer la piste Accords');
  await page.locator('#dlgFollow').check();
  await page.click('#dlgOk');
  p = await saved();
  const added = p.tracks[p.tracks.length - 1];
  ok(added.type === 'instrument' && added.follow && !added.arpOn, 'piste créée qui joue la piste Accords');

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
