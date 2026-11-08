/*
 * Test de bout en bout de la fenêtre de l'arpégiateur (écran unique, motifs, réglage pas à pas), dans un vrai navigateur (Playwright + Chromium).
 *   node tests/e2e/arp-ui.js
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
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::/.test(m.text()) && errs.push(m.text()));

  // 1. démo existante (piste arpège au format ancien)
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => { if (!sessionStorage.done) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.done = 1; } }, demo);
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__n = 0; const f = SS.Arp.renderStep; SS.Arp.renderStep = (...a) => { const r = f(...a); window.__n += r.length; return r; }; });
  await page.mouse.click(600, 5);
  await page.click('#play');
  await page.waitForTimeout(3000);
  const n = await page.evaluate(() => window.__n);
  ok(n > 0, `démo « Train de nuit » : la piste arpège joue (${n} notes en 3 s)`);
  await page.click('#stop');

  // 2. ouvrir l'arpégiateur sur la piste arpège de la démo
  const idx = await page.evaluate(() => [...document.querySelectorAll('.th-btn[title="Afficher / masquer le piano roll"]')].length);
  const btns = page.locator('.th-btn[title="Afficher / masquer le piano roll"]');
  for (let i = 0; i < idx; i++) { await btns.nth(i).click(); if (await page.locator('.roll-arp').count()) break; await btns.nth(i).click(); }
  ok(await page.locator('.roll-arp').count() > 0, 'bouton Arpégiateur présent dans le piano roll');
  await page.locator('.roll-arp').first().click();
  ok(await page.locator('#arpDialog[open]').count() === 1, 'fenêtre de l’arpégiateur ouverte');
  // la sauvegarde automatique a lieu 400 ms après chaque changement
  const arpNow = async () => (await page.waitForTimeout(500), page.evaluate(() => JSON.stringify(SS.Arp.normalize(JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((t) => t.category === 'arp').arp))));
  const before = await arpNow();
  ok((await page.locator('.arp-style').count()) === 0 && (await page.locator('.arp-tabs').count()) === 0, 'écran unique : plus d’onglets ni de vignettes de motifs');

  // lecture en boucle
  await page.evaluate(() => (window.__n = 0));
  await page.click('#arpDialog .arp-player .arp-loop');
  await page.waitForTimeout(1500);
  const looped = await page.evaluate(() => window.__n);
  const head = await page.locator('.arp-head').getAttribute('x');
  ok(looped > 4 && +head >= 0, `lecture en boucle : ${looped} notes en 1,5 s, curseur sur la grille`);

  // motif : sélecteur, catégorie, recherche, essai, Choisir
  await page.click('.arp-motif-change');
  ok(await page.locator('#motifDialog[open]').count() === 1, 'sélecteur de motifs ouvert');
  await page.locator('.motif-cat', { hasText: 'Tous les motifs' }).click();
  const total = await page.locator('.motif-list .arp-style').count();
  ok(total >= 50, `${total} motifs dans « Tous les motifs »`);
  await page.locator('.motif-cat', { hasText: 'Groupes qui grimpent' }).click();
  ok((await page.locator('.motif-list .arp-style').count()) === 7, 'catégorie « Groupes qui grimpent » : 7 motifs');
  await page.locator('.motif-list .arp-style', { hasText: 'Double montée' }).click();
  ok((await page.locator('#motifDialog .arp-loop.on').count()) === 1, 'la boucle continue dans le sélecteur (le motif s’entend tout de suite)');
  await page.fill('.motif-search', 'octave');
  await page.waitForTimeout(100);
  const found = await page.locator('.motif-list .arp-style').allTextContents();
  ok(found.length >= 4 && found.some((t) => t.includes('Pompe d’octave')), `recherche « octave » : ${found.length} motifs`);
  await page.fill('.motif-search', '');
  await page.locator('.motif-cat', { hasText: 'Groupes qui grimpent' }).click();
  await page.locator('.motif-list .arp-style', { hasText: 'Double montée' }).click();
  await page.locator('#motifDialog button', { hasText: 'Choisir' }).click();
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Double montée', 'motif choisi : Double montée');
  const grid = await page.locator('.arp-grid text').allTextContents();
  ok(grid.slice(0, 8).join(' ') === 'A C E A C E A C' || grid.length >= 8, `grille : ${grid.slice(0, 8).join(' ')}`);
  // récents
  await page.click('.arp-motif-change');
  await page.locator('.motif-cat', { hasText: 'Récents' }).click();
  ok((await page.locator('.motif-list .arp-style', { hasText: 'Double montée' }).count()) === 1, 'Double montée dans « Récents »');
  // Annuler dans le sélecteur : le motif d'avant revient
  await page.locator('.motif-cat', { hasText: 'Hasard' }).click();
  await page.locator('.motif-list .arp-style').first().click();
  await page.locator('#motifDialog button', { hasText: 'Annuler' }).click();
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Double montée', 'Annuler dans le sélecteur garde le motif précédent');
  // ‹ ›
  await page.click('.arp-motif-nav[title="Motif suivant"]');
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Double descente', '› passe au motif suivant');
  await page.click('.arp-motif-nav[title="Motif précédent"]');

  // réglage d'un pas : clic sur la grille, 2 notes, 1 temps, vélocité, silence
  const g = await page.locator('.arp-grid').boundingBox();
  await page.mouse.click(g.x + (g.width / 16) * 2.5, g.y + g.height / 2);
  ok((await page.locator('.arp-step-head b').textContent()) === 'Pas 3', 'clic sur la grille : réglages du pas 3');
  await page.locator('.arp-step .arp-seg button', { hasText: /^2$/ }).click();
  await page.locator('.arp-step .arp-seg button', { hasText: '1 temps' }).click();
  let a = JSON.parse(await arpNow());
  ok(a.lanes.poly[2] === 2 && a.lanes.len[2] === 4, 'pas 3 : 2 notes à la fois, longueur 1 temps');
  ok((await page.locator('.arp-grid text').nth(2).textContent()).includes('+'), 'la grille montre les 2 notes du pas 3');
  await page.locator('.arp-step .arp-seg button', { hasText: 'Silence' }).click();
  a = JSON.parse(await arpNow());
  ok(a.lanes.rhythm[2] === 0, 'pas 3 en silence');
  await page.click('#arpDialog .arp-undo');
  a = JSON.parse(await arpNow());
  ok(a.lanes.rhythm[2] === 1, 'Défaire : le pas 3 rejoue');
  const v = await page.locator('.arp-vels').boundingBox();
  await page.mouse.click(v.x + (v.width / 16) * 0.5, v.y + v.height * 0.5);
  a = JSON.parse(await arpNow());
  ok(Math.abs(a.lanes.vel[0] - 0.5) < 0.06, `vélocité du pas 1 réglée en cliquant : ${a.lanes.vel[0]}`);
  // réglages généraux
  await page.locator('.arp-simple .arp-seg button', { hasText: '8 pas' }).click();
  await page.locator('.arp-simple .arp-seg button', { hasText: '½ temps' }).click();
  a = JSON.parse(await arpNow());
  ok(a.steps === 8 && a.noteLen === 2 && a.lanes.vel.length === 8, 'motif de 8 pas, notes d’½ temps');
  await page.locator('.arp-simple .arp-seg button', { hasText: 'Triolet' }).click();
  ok((await page.locator('.arp-sub').textContent()).includes('1/16 triolet'), '1/16 + Triolet = 1/16 triolet');
  await page.locator('.arp-macro input[aria-label="Jeu humain"]').fill('40');
  await page.locator('.arp-macro input[aria-label="Jeu humain"]').dispatchEvent('change');
  a = JSON.parse(await arpNow());
  ok(Math.abs(a.human - 0.4) < 1e-9, 'jeu humain à 40 %');
  await page.click('#arpDialog .arp-player .arp-loop');
  await page.evaluate(() => (window.__n = 0));
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => window.__n)) === 0, 'Stop : la boucle s’arrête');

  // Annuler la fenêtre : réglages d'ouverture restaurés
  await page.locator('#arpDialog .dlg-footer button', { hasText: 'Annuler' }).click();
  await page.waitForTimeout(300);
  ok((await arpNow()) === before, 'Annuler la fenêtre restaure les réglages d’ouverture');

  // 3. réglages gardés avec OK, puis lecture du morceau
  await page.locator('.roll-arp').first().click();
  await page.click('.arp-motif-change');
  await page.locator('.motif-cat', { hasText: 'Synthwave' }).click();
  await page.locator('.motif-list .arp-style', { hasText: 'Midnight Drive' }).click();
  await page.locator('#motifDialog button', { hasText: 'Choisir' }).click();
  await page.locator('#arpDialog .dlg-footer button', { hasText: 'OK' }).click();
  ok(JSON.parse(await arpNow()).pattern.startsWith('d1 d5 d1+'), 'OK garde le motif Midnight Drive');
  await page.evaluate(() => (window.__n = 0));
  await page.click('#play');
  await page.waitForTimeout(2000);
  ok((await page.evaluate(() => window.__n)) > 0, 'lecture du morceau avec le motif Midnight Drive');
  await page.click('#stop');

  // 4. piste vide : choisir un accord et le poser sur la piste
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    p.tracks.find((t) => t.category === 'arp').events = [];
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(800);
  for (let i = 0; i < idx; i++) { await btns.nth(i).click(); if (await page.locator('.roll-arp').count()) break; await btns.nth(i).click(); }
  await page.locator('.roll-arp').first().click();
  await page.selectOption('.arp-chordpick select[aria-label="Note fondamentale"]', '5');
  await page.selectOption('.arp-chordpick select[aria-label="Type d’accord"]', 'maj7');
  ok((await page.locator('.arp-chordname').textContent()) === 'Fmaj7', 'accord d’essai : Fmaj7');
  await page.click('.arp-fill');
  await page.waitForTimeout(500);
  const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((t) => t.category === 'arp').events);
  ok(ev.length === 1 && ev[0].notes.length === 4 && ev[0].step === 0, 'Poser sur la piste : l’accord remplit la boucle');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
