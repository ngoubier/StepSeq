/*
 * Test de bout en bout de l'onglet Grille de Harmo One (glisser-déposer, écoute, génération des couches).
 *   node tests/e2e/grid-ui.js [dossier-captures]
 * Lance son propre petit serveur web sur le dossier du projet. Nécessite le paquet « playwright ».
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shot = async (page, name) => SHOTS && page.locator('#harmonyDialog').screenshot({ path: path.join(SHOTS, name + '.png') });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const URL = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::/.test(m.text()) && errs.push(m.text()));

  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'autoroute-de-minuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => { if (!sessionStorage.done) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.done = 1; } }, demo);
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.click('#keyBtn');
  await page.click('[data-tab="gri"]');
  await page.waitForTimeout(150);

  ok((await page.locator('.gr-blk').count()) > 0, 'accords existants repris à l’ouverture');
  await page.click('#grClear');
  await page.waitForTimeout(600);
  await page.reload();
  await page.click('#keyBtn');
  await page.click('[data-tab="gri"]');
  ok((await page.locator('.gr-blk').count()) === 0, 'une grille effacée reste vide après rechargement');

  const lane = async () => page.locator('#grLane').boundingBox();
  const bars = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).bars);
  /** Glisse `loc` jusqu'à la mesure `bar` (1 = première), au premier quart de la mesure. */
  const dragTo = async (loc, bar, beatFrac = 0.2) => {
    const a = await loc.boundingBox();
    const l = await lane();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(l.x + (l.width * (bar - 1 + beatFrac)) / bars, l.y + l.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  const grid = () => page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return p.scenes.find((s) => s.id === p.current).grid;
  });
  const sum = () => page.locator('.gr-sum').textContent();

  ok((await page.locator('.gr-tok').count()) === 9, 'palette simple : 7 accords de Ré mineur + 2 emprunts (A, C♯°)');
  ok((await page.locator('.gr-fam').count()) === 3, 'trois familles : Repos, Préparation, Tension');
  // clic = écoute, ne pose rien
  await page.locator('.gr-tok', { hasText: 'Gm' }).click();
  ok((await page.locator('.gr-blk').count()) === 0, 'un clic sur un accord ne le pose pas');
  // glisser-déposer
  await dragTo(page.locator('.gr-tok', { hasText: 'Dm' }), 1);
  await dragTo(page.locator('.gr-tok', { hasText: 'B♭' }), 2);
  await dragTo(page.locator('.gr-tok', { hasText: 'F' }).first(), 3);
  await dragTo(page.locator('.gr-tok', { hasText: /^VIIC$/ }), 4);
  ok((await page.locator('.gr-blk').count()) === 4, '4 accords posés par glisser-déposer');
  ok((await sum()) === 'Dm – B♭ – F – C', `résumé : ${await sum()}`);
  await shot(page, 'g1-simple');

  // mode avancé : Fmaj7 remplace F
  await page.click('[data-grmode="adv"]');
  ok((await page.locator('.gr-chip', { hasText: /^C9$/ }).count()) === 1, 'mode avancé : C9 proposé (toutes ses notes sont dans Ré mineur)');
  ok((await page.locator('.gr-chip', { hasText: /^Dm6$/ }).count()) === 0, 'mode avancé : Dm6 absent (Si bécarre)');
  ok((await page.locator('.gr-chip', { hasText: /^A7♭9$/ }).count()) === 1, 'mode avancé : A7♭9 dans les emprunts');
  await dragTo(page.locator('.gr-chip', { hasText: /^Fmaj7$/ }), 3);
  ok((await sum()) === 'Dm – B♭ – Fmaj7 – C', `Fmaj7 remplace F : ${await sum()}`);
  await shot(page, 'g2-avance');

  // déplacer un accord hors de la grille = l'enlever ; Suppr aussi
  const blk = page.locator('.gr-blk').nth(3);
  const bb = await blk.boundingBox();
  await page.mouse.move(bb.x + 20, bb.y + 20);
  await page.mouse.down();
  await page.mouse.move(bb.x + 20, bb.y + 400, { steps: 6 });
  await page.mouse.up();
  ok((await page.locator('.gr-blk').count()) === 3, 'accord sorti de la grille : enlevé');
  // allonger B♭ d'une mesure par son bord droit : il recouvre le début de Fmaj7
  await page.selectOption('#grSnap', 'half');
  const rz = await page.locator('.gr-blk').nth(1).locator('.gr-rz').boundingBox();
  const l = await lane();
  await page.mouse.move(rz.x + 3, rz.y + 10);
  await page.mouse.down();
  await page.mouse.move(l.x + (l.width * 2.5) / bars - 2, rz.y + 10, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  let g = await grid();
  ok(g && g.chords.length === 3 && g.chords[1].len === 24 && g.chords[2].step === 40, `B♭ allongé à 1,5 mesure, Fmaj7 raccourci (${JSON.stringify(g && g.chords.map((c) => [c.step, c.len]))})`);

  // générer : basse, accords, arpège
  dialogs.length = 0;
  await page.click('#grGen');
  await page.waitForTimeout(600);
  const res = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const sc = p.scenes.find((s) => s.id === p.current);
    const L = sc.grid.layers;
    const tr = (id) => p.tracks.find((t) => t.id === id);
    return { bass: tr(L.bass.dst), comp: tr(L.comp.dst), arp: tr(L.arp.dst), n: p.tracks.length };
  });
  ok(res.bass && res.bass.category === 'mono' && res.bass.events.length > 0, `basse écrite dans « ${res.bass && res.bass.name} » (${res.bass && res.bass.events.length} notes)`);
  ok(res.comp && res.comp.category === 'chord' && res.comp.events.length === 3, `accords tenus écrits dans « ${res.comp && res.comp.name} »`);
  ok(res.arp && res.arp.category === 'arp' && res.arp.events.length === 3, `accords tenus pour Arp One dans « ${res.arp && res.arp.name} »`);
  ok(res.comp.events[2].chord === 'maj7' && res.comp.events[2].notes.length === 4, 'Fmaj7 écrit avec ses 4 notes');
  const bassRoots = [...new Set(res.bass.events.map((e) => e.notes[0] % 12))];
  ok(JSON.stringify(bassRoots) === JSON.stringify([2, 10, 5]), `la basse joue les fondamentales D, B♭, F (${bassRoots})`);
  await shot(page, 'g3-genere');

  // mode Auto : un nouvel accord réécrit les couches sans question (pistes non retouchées)
  await page.check('#grAuto');
  dialogs.length = 0;
  await page.click('[data-grmode="simple"]');
  await dragTo(page.locator('.gr-tok', { hasText: /^vAm$/ }), 4);
  await page.waitForTimeout(600);
  const comp2 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const sc = p.scenes.find((s) => s.id === p.current);
    return p.tracks.find((t) => t.id === sc.grid.layers.comp.dst).events.length;
  });
  ok(comp2 === 4 && !dialogs.length, `Auto : couches réécrites sans question (${comp2} accords)`);

  // grille connue
  await page.selectOption('#grFrom', { index: 1 });
  await page.waitForTimeout(300);
  ok(/^Dm – B♭ – F – C/.test(await sum()), `« Partir de » une grille connue : ${await sum()}`);

  // la grille est enregistrée avec la scène et revient après rechargement
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(800);
  await page.click('#keyBtn');
  await page.click('[data-tab="gri"]');
  ok((await page.locator('.gr-blk').count()) === bars, `après rechargement : la grille revient (${await page.locator('.gr-blk').count()} accords)`);
  const box = await page.locator('#harmonyDialog').boundingBox();
  ok(box.height <= 860 - 30, `la fenêtre tient dans l'écran (${Math.round(box.height)} px)`);

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
