/*
 * Test de bout en bout de la fenêtre de l'arpégiateur, dans un vrai navigateur (Playwright + Chromium).
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

  // 2. ouvrir ARP ONE sur la piste arpège de la démo, parcourir les 10 presets
  const idx = await page.evaluate(() => [...document.querySelectorAll('.th-btn[title="Afficher / masquer le piano roll"]')].length);
  const btns = page.locator('.th-btn[title="Afficher / masquer le piano roll"]');
  for (let i = 0; i < idx; i++) { await btns.nth(i).click(); if (await page.locator('.roll-arp').count()) break; await btns.nth(i).click(); }
  ok(await page.locator('.roll-arp').count() > 0, 'bouton Arpégiateur présent dans le piano roll');
  await page.locator('.roll-arp').first().click();
  ok(await page.locator('#arpDialog[open]').count() === 1, 'fenêtre de l’arpégiateur ouverte');
  // écran Simple : vignettes de style, vitesse, lecture en boucle
  ok((await page.locator('.arp-style svg polyline, .arp-style svg rect').count()) > 0, 'Simple : vignettes de style dessinées');
  await page.locator('.arp-style', { hasText: 'Descendant' }).first().click();
  ok((await page.locator('.arp-style.active', { hasText: 'Descendant' }).count()) === 1, 'Simple : choix du style Descendant');
  await page.locator('.arp-simple .arp-seg button', { hasText: 'Triolet' }).click();
  ok((await page.locator('.arp-sub').textContent()).includes('1/16 triolet'), 'Simple : 1/16 + Triolet = 1/16 triolet');
  await page.locator('.arp-simple .arp-seg button', { hasText: 'Normale' }).click();
  await page.evaluate(() => (window.__n = 0));
  await page.click('.arp-loop');
  await page.waitForTimeout(1500);
  const looped = await page.evaluate(() => window.__n);
  const head = await page.locator('.arp-head').getAttribute('x');
  ok(looped > 4 && +head >= 0, `lecture en boucle : ${looped} notes en 1,5 s, curseur sur la grille`);
  await page.click('.arp-loop');
  await page.evaluate(() => (window.__n = 0));
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => window.__n)) === 0, 'Stop : la boucle s’arrête');
  await page.click('.arp-tabs button[data-tab=advanced]');
  const before = await page.evaluate(() => JSON.stringify(SS.Arp.normalize(JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find(t => t.category === 'arp').arp)));
  const presets = await page.$$eval('#arpPreset option[value]:not([value=""])', (o) => o.map((x) => x.value));
  ok(presets.length === 10, `10 presets (${presets.join(', ')})`);
  for (const p of presets) {
    await page.selectOption('#arpPreset', p);
    await page.waitForTimeout(80);
    const notes = await page.locator('.arp-grid .note').count();
    ok(notes > 0, `preset ${p} : ${notes} notes dans la grille`);
  }
  // macros
  await page.locator('.arp-macro input').nth(1).fill('80');
  await page.locator('.arp-macro input').nth(1).dispatchEvent('change');
  ok((await page.locator('.arp-phrases .chip').count()) === 4, 'EVOLVE > 0 : sélecteur A / A′ / B / A″');
  await page.click('#arpDialog .arp-undo');
  // CREATE : tous les modes
  const modes = await page.locator('.arp-create select').first().locator('option').evaluateAll((o) => o.map((x) => x.value));
  for (const m of modes) {
    await page.locator('.arp-create select').first().selectOption(m);
    await page.waitForTimeout(30);
  }
  ok(modes.length === 19, `${modes.length} modes sélectionnables sans erreur`);
  await page.locator('.arp-rhythm button', { hasText: 'Euclidien' }).click();
  ok(await page.locator('.arp-euclid').count() === 1, 'rythme euclidien affiché');
  // Annuler la fenêtre : réglages d'origine restaurés
  await page.locator('#arpDialog .dlg-footer button', { hasText: 'Annuler' }).click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find(t => t.category === 'arp').arp));
  ok(after === before, 'Annuler la fenêtre restaure les réglages d’ouverture');

  // 3. preset + lecture : la sortie suit le preset
  await page.locator('.roll-arp').first().click();
  await page.click('.arp-tabs button[data-tab=advanced]');
  await page.selectOption('#arpPreset', 'techno');
  await page.locator('#arpDialog .dlg-footer button', { hasText: 'OK' }).click();
  await page.evaluate(() => (window.__n = 0));
  await page.click('#play');
  await page.waitForTimeout(2000);
  ok((await page.evaluate(() => window.__n)) > 0, 'lecture avec le preset Melodic Techno Rise');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
