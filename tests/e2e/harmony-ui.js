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
  await page.locator('[data-emo="nostalgie"]').click();
  ok((await page.locator('.hm-ex').count()) === 3, 'Ambiance : 3 propositions pour Nostalgie');
  ok((await page.locator('.hm-mode.on .hm-mode-h b').textContent()).includes('Mineur naturel'), 'Nostalgie rangée sous Mineur naturel');
  await shot(page, '1-ambiance');
  await page.click('[data-tab="acc"]');
  ok((await page.locator('.hm-chord').count()) >= 7, 'Accords : palette affichée');
  await shot(page, '2-accords');
  await page.click('[data-tab="cou"]');
  ok((await page.locator('.hm-layer').count()) === 3, 'Couches : 3 cartes');
  await shot(page, '3-couches');
  await page.click('[data-tab="ver"]');
  ok((await page.locator('.hm-scene').count()) === 6, 'Vérifier : une ligne par scène');
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
  ok((await page.locator('.hm-ex.pick').count()) === 3, 'étape 2 : trois grilles');
  await page.click('.hm-ex.pick >> nth=1');
  await shot(page, '6-assistant-2');
  await page.click('#hmWizNext');
  await shot(page, '7-assistant-3');
  await page.click('#hmWizNext'); // Créer
  await page.waitForTimeout(300);
  ok(await page.locator('#hmTabs').isVisible(), 'après « Créer » : retour aux onglets');
  await page.click('.hm-foot button[type=submit]');
  await page.waitForTimeout(600); // sauvegarde automatique (après 400 ms)
  const res = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const sc = p.scenes.find((s) => s.id === p.current);
    const nappe = p.tracks.find((t) => t.name === 'Nappe Juno');
    const lead = p.tracks.find((t) => t.name === 'Lead Juno');
    return {
      hasProjectKey: 'key' in p || 'emotion' in p,
      key: sc.key, emotion: sc.emotion,
      chords: nappe.events.length, lead: lead.events.length,
      others: p.scenes.filter((s) => s.id !== p.current).map((s) => JSON.stringify(s.data)),
      otherKeys: p.scenes.filter((s) => s.id !== p.current).every((s) => s.key && s.key.tonic === 'D' && s.key.mode === 'minor'),
    };
  });
  ok(!res.hasProjectKey, 'plus de tonalité au niveau du projet');
  ok(res.key && res.key.tonic === 'D' && res.key.mode === 'dorian', `la scène reçoit Ré dorien (${JSON.stringify(res.key)})`);
  ok(res.emotion === 'melancolie', 'et l’émotion Mélancolie lumineuse');
  ok(res.chords > 0 && res.lead > 0, `accords et mélodie écrits (${res.chords} accords, ${res.lead} notes)`);
  ok(JSON.stringify(res.others) === JSON.stringify(before), 'les notes des autres scènes ne changent pas');
  ok(res.otherKeys, 'les autres scènes gardent Ré mineur');
  const label = await page.locator('#keyLabel').textContent();
  ok(/dorien/.test(label), `bouton de la barre : « ${label} »`);

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
