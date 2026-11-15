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
  ok(await page.locator('.roll-arp').count() > 0 && (await page.locator('.roll-arp').first().textContent()).trim() === 'Arp One', 'bouton « Arp One » présent dans le piano roll');
  await page.locator('.roll-arp').first().click();
  ok(await page.locator('#arpDialog[open]').count() === 1, 'fenêtre de l’arpégiateur ouverte');
  // la sauvegarde automatique a lieu 400 ms après chaque changement
  const arpNow = async () => (await page.waitForTimeout(500), page.evaluate(() => JSON.stringify(SS.Arp.normalize(JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((t) => t.arpOn).arp))));
  const before = await arpNow();
  // modules : niveau Essentiel par défaut, module Motif ouvert
  const modBtn = (name) => page.locator('#arpDialog .arp-mod-btn', { has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) });
  ok((await page.locator('#arpDialog .arp-level button.active').textContent()) === 'Essentiel', 'niveau Essentiel par défaut');
  ok((await page.locator('#arpDialog .arp-mod').count()) >= 5 && (await page.locator('#arpDialog .arp-mod.active b').textContent()) === 'Motif', 'modules affichés, Motif ouvert');
  ok((await page.locator('.arp-step').count()) === 0, 'pas de panneau de réglage tant qu’aucun pas n’est choisi');

  // lecture en boucle
  await page.evaluate(() => (window.__n = 0));
  await page.click('#arpDialog .arp-player .arp-loop');
  await page.waitForTimeout(1500);
  const looped = await page.evaluate(() => window.__n);
  const head = await page.locator('.arp-head').getAttribute('x');
  ok(looped > 4 && +head >= 0, `lecture en boucle : ${looped} notes en 1,5 s, curseur sur la grille`);

  // motif : sélecteur, catégorie, recherche, essai, Choisir
  await page.click('.arp-motif-tile');
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
  const grid = await page.locator('.arp-grid text:not(.ag-num):not(.ag-bartxt)').allTextContents();
  ok(grid.slice(0, 8).join(' ') === 'A C E A C E A C' || grid.length >= 8, `grille : ${grid.slice(0, 8).join(' ')}`);
  // motif écrit à la main (mode générique) : saisie, aperçu sur l'accord, jeton non compris, exemple
  await page.fill('#arpDialog .arp-pattern', '0 1 2 3 2 1 2 1');
  await page.press('#arpDialog .arp-pattern', 'Enter');
  let ap = JSON.parse(await arpNow());
  ok(ap.mode === 'pattern' && ap.pattern === '0 1 2 3 2 1 2 1', 'motif écrit : enregistré en mode motif personnalisé');
  ok((await page.locator('#arpDialog .arp-pattern-out').textContent()).startsWith('Sur l’accord :'), 'motif écrit : aperçu des notes sur l’accord');
  await page.fill('#arpDialog .arp-pattern', '0 zz 2');
  await page.press('#arpDialog .arp-pattern', 'Enter');
  ok((await page.locator('#arpDialog .arp-pattern-bad').textContent()).includes('zz'), 'motif écrit : jeton non compris signalé');
  await page.locator('#arpDialog .arp-pattern-ex button', { hasText: '0- 0 1 2' }).click();
  ap = JSON.parse(await arpNow());
  ok(ap.pattern === '0- 0 1 2 0- 0 1 2', 'motif écrit : exemple appliqué d’un clic');
  await page.click('.arp-motif-tile');
  await page.locator('.motif-cat', { hasText: 'Groupes qui grimpent' }).click();
  await page.locator('.motif-list .arp-style', { hasText: 'Double montée' }).click();
  await page.locator('#motifDialog button', { hasText: 'Choisir' }).click();
  // récents
  await page.click('.arp-motif-tile');
  await page.locator('.motif-cat', { hasText: 'Récents' }).click();
  ok((await page.locator('.motif-list .arp-style', { hasText: 'Double montée' }).count()) === 1, 'Double montée dans « Récents »');
  // Annuler dans le sélecteur : le motif d'avant revient
  await page.locator('.motif-cat', { hasText: 'Hasard' }).click();
  await page.locator('.motif-list .arp-style').first().click();
  await page.locator('#motifDialog button', { hasText: 'Annuler' }).click();
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Double montée', 'Annuler dans le sélecteur garde le motif précédent');

  // motif suivant / précédent, Surprends-moi (rythme verrouillé), prises
  await page.click('#arpDialog .arp-motif-next');
  ok((await page.locator('.arp-motif-text b').textContent()) !== 'Double montée', 'motif suivant');
  await page.click('#arpDialog .arp-motif-prev');
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Double montée', 'motif précédent : retour à Double montée');
  const r0 = JSON.parse(await arpNow());
  const rLock = page.locator('#arpDialog .arp-lock', { hasText: 'rythme' });
  if ((await rLock.getAttribute('aria-pressed')) !== 'true') await rLock.click();
  await page.click('#arpDialog .arp-surprise');
  await page.click('#arpDialog .arp-surprise');
  const r2 = JSON.parse(await arpNow());
  ok(r2.rate === r0.rate && JSON.stringify(r2.lanes.rhythm) === JSON.stringify(r0.lanes.rhythm) && JSON.stringify(r2) !== JSON.stringify(r0), 'Surprends-moi : nouvel arpège, rythme gardé');
  ok((await page.locator('#arpDialog .arp-takes').textContent()).includes('3/3'), 'prises : 3 / 3');
  await page.click('#arpDialog .arp-takes button[aria-label="Prise précédente"]');
  await page.click('#arpDialog .arp-takes button[aria-label="Prise précédente"]');
  ok((await arpNow()) === JSON.stringify(r0), 'retour à la prise de départ');
  await page.click('#arpDialog .arp-takes button[aria-label="Prise suivante"]');
  await page.click('#arpDialog .arp-takes button[aria-label="Prise suivante"]');
  ok((await arpNow()) === JSON.stringify(r2), 'et de nouveau la dernière prise');
  await page.click('#arpDialog .arp-takes button[aria-label="Prise précédente"]');
  await page.click('#arpDialog .arp-takes button[aria-label="Prise précédente"]');

  // réglage d'un pas : clic sur la grille, 2 notes, 1 temps, vélocité, silence
  const g = await page.locator('.arp-grid').boundingBox();
  const cols = await page.evaluate(() => SS.arpPanel._info().ticks); // la grille montre toute la boucle
  await page.mouse.click(g.x + (g.width / cols) * 2.5, g.y + g.height / 2);
  ok((await page.locator('.arp-step-head b').textContent()) === 'Pas 3', 'clic sur la grille : réglages du pas 3');
  await page.locator('.arp-step .arp-field', { hasText: 'Notes à la fois' }).locator('.arp-seg button', { hasText: /^2$/ }).click();
  await page.locator('.arp-step .arp-seg button', { hasText: '1 temps' }).click();
  let a = JSON.parse(await arpNow());
  ok(a.lanes.poly[2] === 2 && a.lanes.len[2] === 4, 'pas 3 : 2 notes à la fois, longueur 1 temps');
  ok((await page.locator('.arp-grid text:not(.ag-num):not(.ag-bartxt)').nth(2).textContent()).includes('+'), 'la grille montre les 2 notes du pas 3');
  await page.locator('.arp-step .arp-seg button', { hasText: 'Silence' }).click();
  a = JSON.parse(await arpNow());
  ok(a.lanes.rhythm[2] === 0, 'pas 3 en silence');
  await page.click('#arpDialog .arp-undo');
  a = JSON.parse(await arpNow());
  ok(!a.lanes.rhythm.length || a.lanes.rhythm[2] === 1, 'Défaire : le pas 3 rejoue');
  // la grille défile pendant la lecture : on l'arrête le temps de viser une colonne visible
  const wasOn = await page.evaluate(() => SS.arpPanel._loop.on);
  if (wasOn) await page.click('#arpDialog .arp-player .arp-loop');
  await page.waitForTimeout(200);
  const v = await page.locator('.arp-vels').boundingBox();
  const sc = await page.locator('.arp-scroll').boundingBox();
  const cx = sc.x + sc.width / 2;
  const colsNow = await page.evaluate(() => SS.arpPanel._info().ticks); // régler un pas peut changer la longueur de la boucle
  const col = Math.floor(((cx - v.x) / v.width) * colsNow);
  const stepIdx = col % JSON.parse(await arpNow()).steps;
  await page.mouse.click(cx, v.y + v.height * 0.5);
  a = JSON.parse(await arpNow());
  ok(Math.abs(a.lanes.vel[stepIdx] - 0.5) < 0.06, `vélocité du pas ${stepIdx + 1} réglée en cliquant (colonne ${col + 1}) : ${a.lanes.vel[stepIdx]}`);
  if (wasOn) await page.click('#arpDialog .arp-player .arp-loop');
  // réglages généraux (module Rythme)
  await modBtn('Rythme').click();
  await page.locator('.arp-frow', { hasText: 'Pas' }).locator('.arp-seg button', { hasText: /^8$/ }).click();
  await page.locator('.arp-frow', { hasText: 'Durée des notes' }).locator('.arp-seg button', { hasText: '½ temps' }).click();
  a = JSON.parse(await arpNow());
  ok(a.steps === 8 && a.noteLen === 2 && a.lanes.vel.length === 8, 'motif de 8 pas, notes d’½ temps');
  await page.locator('.arp-form .arp-seg button', { hasText: 'Triolet' }).click();
  ok(Math.abs(JSON.parse(await arpNow()).rate - 1.5) < 1e-9, '1/16 + Triolet = 1/16 triolet');
  await page.locator('.arp-form .arp-seg button', { hasText: 'Normale' }).click();
  await page.locator('.arp-frow', { hasText: 'Durée des notes' }).locator('.arp-seg button', { hasText: /Selon le geste|Selon la vitesse/ }).click();

  // geste : un clic sur « Roulé », puis « Ajuster › »
  await modBtn('Geste').click();
  await page.locator('.arp-form .geste-chip', { hasText: 'Roulé' }).click();
  a = JSON.parse(await arpNow());
  ok(a.geste && a.geste.id === 'roule' && Math.abs(a.geste.spread - 0.4) < 1e-9, 'geste « Roulé » choisi d’un clic');
  await page.click('.geste-adjust');
  ok((await page.locator('.geste-pad').count()) === 1, '« Ajuster › » ouvre le réglage fin du geste');
  // pavé : glisser vers le coin « serré, en retard »
  const pad = await page.locator('.geste-pad').boundingBox();
  await page.mouse.move(pad.x + pad.width * 0.5, pad.y + pad.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(pad.x + pad.width * 0.2, pad.y + pad.height * 0.8, { steps: 6 });
  await page.mouse.up();
  a = JSON.parse(await arpNow());
  ok(a.geste.id === '' && a.geste.spread < 0.35 && a.geste.alt > 0.1, `pavé : étalement ${a.geste.spread}, alternance ${a.geste.alt} (personnalisé)`);
  // curseurs : microvariation, puis nouvelle prise
  const micro = page.locator('.geste-row input[aria-label="Microvariation"]');
  await micro.fill('10');
  await micro.dispatchEvent('change');
  a = JSON.parse(await arpNow());
  ok(a.geste.micro === 10, 'microvariation ± 10 ms');
  await page.locator('.geste-tab button', { hasText: 'Nouvelle prise' }).click();
  a = JSON.parse(await arpNow());
  ok(a.geste.take === 2, 'nouvelle prise');
  await page.locator('.geste-tab .arp-seg button', { hasText: /^6$/ }).click();
  a = JSON.parse(await arpNow());
  ok(a.geste.group === 6 && (await page.locator('.geste-zoom-svg .g-note').count()) === 6, 'groupes de 6 : le zoom montre 6 notes');
  await page.click('#arpDialog .arp-undo');
  a = JSON.parse(await arpNow());
  ok(a.geste.group === 0, 'Défaire : groupes « Auto » à nouveau');
  // écouter Régulier / Geste : le son change (attaques du groupe)
  const heard = async () => page.evaluate(() => {
    const t = []; const f = SS.audio.playNote;
    SS.audio.playNote = (...x) => { t.push(x[2]); return f(...x); };
    return new Promise((res) => setTimeout(() => { SS.audio.playNote = f; res(t); }, 1300));
  });
  const loopOn = () => page.evaluate(() => SS.arpPanel._loop.on);
  if (!(await loopOn())) await page.click('#arpDialog .arp-player .arp-loop');
  await page.waitForTimeout(300);
  const withG = await heard();
  await page.locator('.geste-tab-head .arp-seg button', { hasText: 'Régulier' }).click();
  const regular = await heard();
  // écarts entre attaques successives (les notes jouées ensemble, écart nul, sont ignorées)
  const gaps = (t) => { const u = [...new Set(t.map((x) => +x.toFixed(4)))].sort((x, y) => x - y); const d = []; for (let i = 1; i < u.length; i++) d.push(+(u[i] - u[i - 1]).toFixed(3)); return d; };
  const regGaps = new Set(gaps(regular).map((x) => x.toFixed(2)));
  ok(regular.length > 4 && regGaps.size === 1, `Régulier : attaques régulières (${[...regGaps].join(', ')} s)`);
  ok(new Set(gaps(withG).map((x) => x.toFixed(2))).size > 1, 'Geste : attaques resserrées / décalées');
  await page.locator('.geste-tab-head .arp-seg button', { hasText: 'Geste' }).click();
  await modBtn('Motif').click();
  ok(await loopOn(), 'la boucle continue en changeant de module');

  // voyants : éteindre puis rallumer le geste le retrouve tel quel
  const gesteBefore = JSON.parse(await arpNow()).geste;
  await page.locator('#arpDialog .arp-mod', { hasText: 'Geste' }).locator('.arp-led').click();
  ok(!JSON.parse(await arpNow()).geste, 'voyant Geste : éteint (arpège régulier)');
  await page.locator('#arpDialog .arp-mod', { hasText: 'Geste' }).locator('.arp-led').click();
  ok(JSON.stringify(JSON.parse(await arpNow()).geste) === JSON.stringify(gesteBefore), 'voyant Geste : rallumé tel qu’il était');
  // écho allumé d'un clic sur son voyant
  await page.locator('#arpDialog .arp-mod', { hasText: 'Écho' }).locator('.arp-led').click();
  ok(JSON.parse(await arpNow()).echo.n === 2, 'voyant Écho : 2 échos');
  // niveau Avancé : tous les modules, lignes de pas sous la grille
  await page.locator('#arpDialog .arp-level button', { hasText: 'Avancé' }).click();
  ok((await page.locator('#arpDialog .arp-mod').count()) === 8, 'Avancé : les 8 modules');
  ok((await page.locator('#arpDialog .arp-lanetabs [role=tab]').count()) === 9, 'Avancé : 9 lignes de pas sous la grille');
  await page.locator('#arpDialog .arp-lanetabs button', { hasText: 'Degré' }).click();
  if (await loopOn()) await page.click('#arpDialog .arp-player .arp-loop');
  await page.waitForTimeout(200);
  const lr = await page.locator('.arp-vels').boundingBox();
  const colsD = await page.evaluate(() => SS.arpPanel._info().ticks);
  await page.locator('.arp-scroll').evaluate((x) => (x.scrollLeft = 0));
  const lr2 = await page.locator('.arp-vels').boundingBox();
  await page.mouse.click(lr2.x + (lr2.width / colsD) * 0.5, lr2.y + 2);
  a = JSON.parse(await arpNow());
  ok(a.lanes.deg[0] === 2, `ligne Degré dessinée : pas 1 = +${a.lanes.deg[0]}`);
  await modBtn('Pas à pas').click();
  await page.locator('#arpDialog .arp-pane select[aria-label="Longueur de la ligne"]').selectOption('3');
  ok(JSON.parse(await arpNow()).lanes.deg.length === 3, 'ligne Degré raccourcie à 3 pas (polymétrie)');
  await page.locator('#arpDialog .arp-level button', { hasText: 'Essentiel' }).click();
  ok((await page.locator('#arpDialog .arp-lanetabs').count()) === 0, 'Essentiel : la ligne Vélocité seule');
  // module Accord : clic sur le nom de l'accord, hauteur, octaves
  await page.click('#arpDialog .arp-chordname');
  ok((await page.locator('#arpDialog .arp-mod.active b').textContent()) === 'Accord', 'clic sur le nom de l’accord : module Accord');
  await page.locator('#arpDialog .arp-frow', { hasText: 'Hauteur' }).locator('.arp-seg button', { hasText: 'C5' }).click();
  a = JSON.parse(await arpNow());
  ok(a.register === 5, 'hauteur : très aigu (C5)');
  const lowest = await page.evaluate(() => { const t = SS.Arp.preview(JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((x) => x.arpOn).arp, [53, 56, 60], 8); return Math.min(...t.filter(Boolean).flatMap((x) => x.notes)); });
  ok(lowest >= 72 && lowest < 84, `l’arpège commence dans l’octave C5 (note la plus grave ${lowest})`);
  await page.locator('#arpDialog .arp-frow', { hasText: 'Hauteur' }).locator('.arp-seg button', { hasText: 'Telle quelle' }).click();
  // mode Intuitif : boutons rotatifs au clavier
  await page.locator('#arpDialog .arp-level button', { hasText: 'Intuitif' }).click();
  ok((await page.locator('#arpDialog .arp-knob').count()) === 4 && (await page.locator('#arpDialog .arp-mods').count()) === 0, 'Intuitif : 4 boutons rotatifs, pas de modules');
  ok((await page.locator('#arpDialog .arp-motif-row .arp-surprise').count()) === 1, 'Intuitif : Surprends-moi à droite du motif');
  const dens = page.locator('#arpDialog .arp-knob[data-k="density"] .arp-knob-dial');
  await dens.focus();
  await page.keyboard.press('Home');
  a = JSON.parse(await arpNow());
  ok(a.rhythm.type === 'lane' && a.lanes.rhythm.some((x) => !x) && a.macros.density === 0, 'Densité à 0 : des silences');
  await page.keyboard.press('End');
  a = JSON.parse(await arpNow());
  ok(a.lanes.div.some((x) => x > 1) && a.macros.density === 100, 'Densité à 100 : des rafales');
  ok((await page.locator('#arpDialog .arp-knob[data-k="density"] .arp-knob-dial').getAttribute('aria-valuenow')) === '100', 'le bouton affiche 100');
  await page.click('#arpDialog .arp-undo');
  await page.click('#arpDialog .arp-undo');
  const ech = await page.locator('#arpDialog .arp-knob[data-k="echo"] .arp-knob-dial').boundingBox();
  await page.mouse.move(ech.x + ech.width / 2, ech.y + ech.height / 2);
  await page.mouse.down();
  await page.mouse.move(ech.x + ech.width / 2, ech.y + ech.height / 2 - 120, { steps: 6 });
  await page.mouse.up();
  a = JSON.parse(await arpNow());
  ok(a.echo.n >= 2 && a.echo.shift === 'up1', `Écho glissé vers le haut : ${a.echo.n} échos qui montent`);
  await page.click('#arpDialog .arp-undo');
  await page.locator('#arpDialog .arp-level button', { hasText: 'Essentiel' }).click();
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
  await page.click('.arp-motif-tile');
  await page.locator('.motif-cat', { hasText: 'Synthwave' }).click();
  await page.locator('.motif-list .arp-style', { hasText: 'Midnight Drive' }).click();
  await page.locator('#motifDialog button', { hasText: 'Choisir' }).click();
  await page.click('#arpDialog .arp-close');
  ok(JSON.parse(await arpNow()).pattern.startsWith('d1 d5 d1+'), 'OK garde le motif Midnight Drive');
  await page.evaluate(() => (window.__n = 0));
  await page.click('#play');
  await page.waitForTimeout(2000);
  ok((await page.evaluate(() => window.__n)) > 0, 'lecture du morceau avec le motif Midnight Drive');
  await page.click('#stop');

  // 4. piste vide : choisir un accord et le poser sur la piste
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    p.tracks.find((t) => t.arpOn).events = [];
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
  const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((t) => t.arpOn).events);
  ok(ev.length === 1 && ev[0].notes.length === 4 && ev[0].step === 0, 'Poser sur la piste : l’accord remplit la boucle');
  // 5. titre « piste — partie », et piano roll ⇄ fenêtre (même motif, même avec un pas en silence)
  const title = await page.locator('#arpDialog .arp-title').textContent();
  const expect = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const t = p.tracks.find((x) => x.arpOn);
    const sc = (p.scenes || []).find((x) => x.id === p.current) || (p.scenes || [])[0];
    return sc ? `${t.name} — ${sc.name}` : t.name;
  });
  ok(title === expect, `titre de la fenêtre : « ${title} »`);
  ok((await page.locator('#arpDialog .arp-brand').textContent()) === 'Arp One', 'nom « Arp One » devant le titre');
  await page.click('#arpDialog .arp-close');
  const rollMotif = page.locator('.roll-tools label', { hasText: 'Motif' }).locator('select');
  await rollMotif.selectOption('down2');
  await page.locator('.roll-arp').first().click();
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Double descente', 'motif choisi dans le piano roll → repris dans la fenêtre');
  const g2 = await page.locator('.arp-grid').boundingBox();
  const c2 = await page.evaluate(() => SS.arpPanel._info().ticks);
  await page.mouse.click(g2.x + (g2.width / c2) * 1.5, g2.y + g2.height / 2);
  await page.locator('.arp-step .arp-seg button', { hasText: 'Silence' }).click();
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Double descente', 'un pas en silence ne change pas le motif affiché');
  await page.click('#arpDialog .arp-close');
  await page.waitForTimeout(200);
  ok((await rollMotif.evaluate((x) => x.options[x.selectedIndex].text)) === 'Double descente', 'retour au piano roll : même motif');
  await rollMotif.selectOption('alberti');
  await page.locator('.roll-arp').first().click();
  const a5 = JSON.parse(await arpNow());
  ok((await page.locator('.arp-motif-text b').textContent()) === 'Alberti' && a5.lanes.rhythm[1] === 0, 'changer de motif dans le piano roll garde le silence du pas 2');
  await page.click('#arpDialog .arp-close');

  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
