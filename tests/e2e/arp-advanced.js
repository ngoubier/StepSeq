/*
 * Nouvelle chanson : bouton « Avancé… » de l’étape Arpège (la fenêtre Arp One de la Grille, réglée pour la scène).
 *   node tests/e2e/arp-advanced.js   (capture : ARPADV_SHOT=chemin)
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
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.click('#viewWiz'); await page.waitForTimeout(400); await page.click('#brgSkip').catch(() => {}); await page.waitForTimeout(300);
  await page.click('#bandStyles [data-v="synthwave"]'); await page.click('#bandPresets .band-preset >> nth=0');
  const added = await page.evaluate(() => window.StepSeq.assistantMusicien({ ajouter: 'arpege' }));
  ok(added && added.ok, 'musicien Arpège ajouté');
  for (let i = 0; i < 14 && !(await page.locator('#bandWizSteps li.cur[data-kind="arp"]').count()); i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); }
  ok(await page.locator('#bwaAdv').count() === 1 && (await page.locator('#bwaAdvChip').count()) === 0, 'étape Arpège : bouton Avancé…, pas encore de pastille');
  await page.click('#bwaAdv'); await page.waitForTimeout(500);
  ok(await page.locator('#arpDialog[open]').count() === 1 && /— Intro/.test(await page.textContent('#arpDialog .arp-title')), 'fenêtre Arp One ouverte sur la scène');
  const chips = await page.locator('#arpHostChords .arp-hchord').allTextContents();
  ok(chips.length >= 2 && !chips.some((c) => /undefined/.test(c)), 'accords de la scène : ' + chips.join(' '));
  ok(await page.locator('#arpDialog .arp-level button.active, #arpDialog .arp-level [aria-checked="true"]').first().textContent().then((t) => /Avancé/.test(t)), 'niveau Avancé');
  ok(!(await page.isVisible('#arpDialog .arp-off')) && !(await page.isVisible('#arpDialog .arp-fill')) && (await page.isVisible('#arpHostOk')), 'ni « Éteindre », ni « Poser l’accord » ; Scènes et OK');
  await page.click('#arpDialog .arp-loop'); await page.waitForTimeout(900);
  ok(await page.locator('#arpHostChords .arp-hchord.on').count() === 1, 'lecture : l’accord en cours s’allume');
  await page.click('#arpDialog .arp-loop');
  await page.click('#arpDialog .arp-led[aria-label="Allumer : Écho"]'); await page.waitForTimeout(200);
  await page.click('#arpHostScope [data-v="all"]');
  if (process.env.ARPADV_SHOT) await page.screenshot({ path: process.env.ARPADV_SHOT });
  await page.click('#arpHostOk'); await page.waitForTimeout(400);
  const parts = await page.evaluate(() => Object.values(SS.band._state.wiz.parts).map((p) => JSON.stringify(p)));
  const adv = parts.filter((p) => /"adv":true/.test(p) && /"echo":\{[^}]*"n":[1-9]/.test(p));
  ok(adv.length >= 2, `réglages (écho) enregistrés dans ${adv.length} scènes`);
  ok(await page.locator('#bwaAdvChip').count() === 1 && (await page.locator('#arpDialog[open]').count()) === 0, 'fenêtre fermée, pastille « Réglages avancés »');
  if (process.env.ARPADV_SHOT) await page.screenshot({ path: process.env.ARPADV_SHOT.replace('.png', '-etape.png') });
  // Annuler ne garde rien
  const before = JSON.stringify(await page.evaluate(() => SS.band._state.wiz.parts));
  await page.click('#bwaAdv'); await page.waitForTimeout(400);
  await page.click('#arpDialog .arp-led[aria-label^="Allumer : Geste"]').catch(() => {}); await page.waitForTimeout(200);
  await page.click('#arpDialog .dlg-footer button:text-is("Annuler")'); await page.waitForTimeout(300);
  ok(JSON.stringify(await page.evaluate(() => SS.band._state.wiz.parts)) === before, 'Annuler : rien ne change');
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close(); server.close();
})();
