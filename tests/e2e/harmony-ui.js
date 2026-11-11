/*
 * Test de bout en bout de la fenêtre Harmo One (assistant + onglets), dans un vrai navigateur.
 *   node tests/e2e/harmony-ui.js [dossier-captures]
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
  const page = await b.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('dialog', (d) => d.accept()); // confirm() « Remplacer… ? »
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::/.test(m.text()) && errs.push(m.text()));

  // ancien fichier : tonalité et émotion au niveau du projet → copiées dans chaque scène
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'autoroute-de-minuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => { if (!sessionStorage.done) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.done = 1; } }, demo);
  await page.goto(URL);
  await page.waitForTimeout(800);
  // 1. scène avec tonalité : la fenêtre s'ouvre sur les onglets, sans dépasser l'écran
  await page.click('#keyBtn');
  await page.waitForTimeout(200);
  ok(await page.locator('#hmTabs').isVisible(), 'scène avec tonalité : onglets affichés');
  ok((await page.locator('#hmKeyBar select#hmTonic').inputValue()) === 'D', 'tonalité Ré mineur reprise de l’ancien fichier');
  const box = await page.locator('#harmonyDialog').boundingBox();
  ok(box.height <= 760 - 30, `la fenêtre tient dans l'écran (${Math.round(box.height)} px)`);
  await page.locator('.emo-chip[data-emo="nostalgie"]').click();
  ok((await page.locator('.hm-ex:not(.ref)').count()) === 3, 'Ambiance : 3 pistes pour Nostalgie');
  const nRef = await page.locator('.hm-ex.ref').count();
  ok(nRef === 7, `Ambiance : grilles de référence de Nostalgie (${nRef})`);
  ok((await page.locator('.hm-ex.ref a[href^="https://"]').count()) >= 5, 'chaque grille de référence cite sa source');
  ok(/Mineur naturel/.test(await page.locator('.hm-modes-line').textContent()), 'les modes des grilles de l’émotion');
  // toute la bibliothèque, rangée par mode
  await page.click('.hm-all');
  ok((await page.locator('.hm-ex.ref').count()) === 39, 'Toutes les grilles : 39 grilles de référence');
  ok((await page.locator('.hm-lib-g').count()) >= 5, 'rangées par mode');
  const tender = page.locator('.hm-ex.ref', { hasText: 'Nostalgie tendre' });
  ok(/C\/B/.test(await tender.locator('.hm-progchords').textContent()) || /\//.test(await tender.locator('.hm-progchords').textContent()), 'accords sur basse imposée affichés (C/B…)');
  await tender.locator('[data-emo-apply]').click();
  await page.waitForTimeout(200);
  const slash = await page.locator('.gr-blk b').allTextContents();
  ok(slash.some((x) => x.includes('/')), `grille de référence posée avec ses basses (${slash.slice(0, 5).join(' ')})`);
  await page.click('[data-tab="amb"]');
  await page.locator('.emo-chip[data-emo="nostalgie"]').click();
  ok((await page.locator('.hm-mode.on .hm-mode-h b').textContent()).includes('Majeur'), 'Nostalgie rangée sous Majeur (6 grilles sur 10)');
  await shot(page, '1-ambiance');
  ok((await page.locator('#hmTabs [role=tab]').count()) === 4, '4 onglets : Ambiance, Grille, Mélodie, Vérifier');
  ok(!(await page.locator('[data-tab="acc"], [data-tab="cou"]').count()), 'plus d’onglets Accords ni Couches');
  // « Poser sur la grille » : la proposition arrive sur la grille (onglet 2), un accord par mesure
  await page.click('[data-emo-apply="0"]');
  await page.waitForTimeout(200);
  ok((await page.locator('#hmTabs [aria-selected=true]').getAttribute('data-tab')) === 'gri', 'Poser sur la grille → onglet Grille');
  const gr = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave') || '{}');
    return document.querySelectorAll('.gr-blk').length;
  });
  ok(gr >= 4, `accords posés sur la grille (${gr} blocs)`);
  ok((await page.locator('.gr-layer').count()) === 3, 'Grille : les couches en bas (basse, accords, arpège)');
  await shot(page, '2-grille');
  // Mélodie : le panneau de Band, sur la grille de la scène
  await page.click('[data-tab="mel"]');
  await page.waitForTimeout(150);
  const g = await page.locator('#melGrid').inputValue();
  ok(g.split('|').length >= 4, `Mélodie : grille reprise de l’onglet Grille (« ${g.slice(0, 40)}… »)`);
  ok(/scène/.test(await page.locator('#melKey option[value=auto]').textContent()), 'tonalité : celle de la scène');
  await page.fill('#melGrid', 'Dm | B♭ | F | C');
  await page.click('#hmMelGo');
  await page.waitForTimeout(150);
  ok((await page.locator('#hmMel .mel-roll .mr-chord').count()) === 4, 'proposition : 4 accords');
  ok(!(await page.locator('#hmMelWrite').isDisabled()), 'Écrire sur la piste actif');
  await page.click('#melListen');
  await page.waitForTimeout(400);
  ok((await page.locator('#melListen').textContent()).includes('Stop') && (await page.locator('.mel-ph').count()) === 1, 'Écouter avec la nappe : lecture et tête de lecture');
  await shot(page, '3-melodie');
  await page.click('#melListen');
  ok((await page.locator('.mel-ph').count()) === 0, 'Stop');
  await page.click('#hmMelWrite');
  await page.waitForTimeout(200);
  const mel = await page.evaluate(() => SS && document.querySelectorAll('.track').length);
  ok(mel > 0, 'mélodie écrite');
  await page.click('[data-tab="ver"]');
  ok((await page.locator('.hm-scene').count()) === 6, 'Vérifier : une ligne par scène');
  ok(/Mélodie · Mélodie/.test(await page.locator('.hm-scene.current').textContent()), 'Vérifier : la mélodie écrite est contrôlée');
  ok((await page.locator('.hm-scene.current .hm-checks2 li').count()) >= 4, 'Vérifier : contrôles de la grille et de la mélodie');
  await shot(page, '4-verifier');
  await page.click('.hm-foot button[type=submit]');

  // 2. nouvelle scène vide : l'assistant s'ouvre, et ne touche qu'à cette scène
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return p.scenes.map((s) => JSON.stringify(s.data));
  });
  await page.click('#sceneEmpty');
  await page.waitForTimeout(200);
  await page.click('#keyBtn');
  await page.waitForTimeout(200);
  ok(await page.locator('#hmSteps').isVisible(), 'scène vide : l’assistant s’ouvre');
  ok(await page.locator('#hmWizNext').isDisabled(), 'Suivant inactif tant qu’aucune émotion n’est choisie');
  await shot(page, '5-assistant-1');
  await page.click('[data-wemo="melancolie"]');
  await page.click('#hmWizNext');
  ok((await page.locator('.hm-ex.pick:not(.ref)').count()) === 3 && (await page.locator('.hm-ex.pick.ref').count()) >= 1, 'étape 2 : trois pistes et les grilles de référence');
  await page.click('.hm-ex.pick >> nth=1');
  await shot(page, '6-assistant-2');
  ok((await page.locator('#hmWizNext').textContent()) === 'Créer', 'deux étapes : Créer à l’étape 2');
  await page.click('#hmWizNext'); // Créer
  await page.waitForTimeout(300);
  ok(await page.locator('#hmTabs').isVisible(), 'après « Créer » : retour aux onglets');
  ok((await page.locator('#hmTabs [aria-selected=true]').getAttribute('data-tab')) === 'gri', 'après « Créer » : onglet Grille');
  await page.click('.hm-foot button[type=submit]');
  await page.waitForTimeout(600); // sauvegarde automatique (après 400 ms)
  const res = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const sc = p.scenes.find((s) => s.id === p.current);
    const grid = sc.grid;
    const ev = (id) => (sc.data[id] ? sc.data[id].events.length : 0);
    return {
      hasProjectKey: 'key' in p || 'emotion' in p,
      key: sc.key, emotion: sc.emotion,
      grid: grid ? grid.chords.length : 0,
      chords: grid ? ev(grid.layers.comp.dst) : 0, bass: grid ? ev(grid.layers.bass.dst) : 0,
      others: p.scenes.filter((s) => s.id !== p.current).map((s) => JSON.stringify(s.data)),
      otherKeys: p.scenes.filter((s) => s.id !== p.current).every((s) => s.key && s.key.tonic === 'D' && s.key.mode === 'minor'),
    };
  });
  ok(!res.hasProjectKey, 'plus de tonalité au niveau du projet');
  ok(res.key && res.key.tonic === 'D' && res.key.mode === 'dorian', `la scène reçoit Ré dorien (${JSON.stringify(res.key)})`);
  ok(res.emotion === 'melancolie', 'et l’émotion Mélancolie lumineuse');
  ok(res.grid > 0 && res.chords > 0 && res.bass > 0, `grille posée, accords et basse écrits (${res.grid} accords, ${res.chords} événements, ${res.bass} notes de basse)`);
  ok(JSON.stringify(res.others) === JSON.stringify(before), 'les notes des autres scènes ne changent pas');
  ok(res.otherKeys, 'les autres scènes gardent Ré mineur');
  const label = await page.locator('#keyLabel').textContent();
  ok(/dorien/.test(label), `bouton de la barre : « ${label} »`);

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
