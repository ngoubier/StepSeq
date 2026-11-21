/*
 * Test de bout en bout du mode Guitare d'Arp One (js/guitar-arp.js), dans Chromium (Playwright).
 *   node tests/e2e/guitar-arp-ui.js
 * Ouvre Arp One sur la piste arpège de la démo « Train de nuit », passe en mode Guitare, choisit des motifs,
 * écoute en boucle et vérifie l'export des notes ; capture : /tmp/guitar-arp.png (ou GUITAR_SHOT=chemin).
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
  const page = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::/.test(m.text()) && errs.push(m.text()));
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => { if (!sessionStorage.done) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.done = 1; } }, demo);
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.mouse.click(600, 5);

  const btns = page.locator('.th-btn[title="Afficher / masquer le piano roll"]');
  const n = await btns.count();
  for (let i = 0; i < n; i++) { await btns.nth(i).click(); if (await page.locator('.roll-arp').count()) break; await btns.nth(i).click(); }
  await page.locator('.roll-arp').first().click();
  ok(await page.locator('#arpDialog[open]').count() === 1, 'Arp One ouvert');
  const mode = page.locator('#arpDialog .arp-mode button');
  ok((await mode.count()) === 2, 'bascule Clavier / Guitare dans l’en-tête');
  await mode.nth(1).click();
  ok(await page.locator('#arpDialog .gt-view').count() === 1 && (await page.locator('#arpDialog .arp-level').isHidden()), 'mode Guitare : vue guitare, niveaux cachés');
  ok(await page.locator('#arpDialog .gt-diagram').count() === 1 && (await page.locator('#arpDialog .gt-tab .gt-note').count()) >= 8, 'schéma de l’accord et tablature');

  // motif Travis, puis écoute en boucle
  await page.locator('#arpDialog .gt-chip', { hasText: 'Travis' }).click();
  ok((await page.locator('#arpDialog .gt-chip.on').textContent()) === 'Travis', 'motif Travis choisi');
  await page.evaluate(() => { window.__g = []; const f = SS.GuitarArp.renderStep; SS.GuitarArp.renderStep = (...a) => { const r = f(...a); window.__g.push(...r); return r; }; });
  await page.click('#arpDialog .arp-loop');
  await page.waitForTimeout(1500);
  const g = await page.evaluate(() => window.__g);
  const head = await page.locator('#arpDialog .gt-tab .arp-head').getAttribute('x');
  ok(g.length > 4 && g.every((x) => x.str >= 0 && x.dur > 0), `lecture en boucle : ${g.length} notes jouées corde par corde`);
  ok(+head >= 0, 'curseur sur la tablature');
  await page.locator('#arpDialog .gt-chip', { hasText: 'Aller-retour' }).click();
  await page.locator('#arpDialog .gt-mods .arp-seg button', { hasText: 'Barré (5e)' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: process.env.GUITAR_SHOT || '/tmp/guitar-arp.png' });
  await page.click('#arpDialog .arp-loop');

  // réglage enregistré dans le projet, rejoué par le séquenceur
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((t) => t.arp && t.arp.guitar).arp.guitar);
  ok(saved && saved.on && saved.motif === 'aller' && saved.pos === 'barreA', 'réglages guitare enregistrés (motif, position)');
  await page.locator('#arpDialog .arp-mode button', { hasText: 'Clavier' }).click();
  ok(await page.locator('#arpDialog .gt-view').count() === 0 && (await page.locator('#arpDialog .arp-player').count()) === 1, 'retour au mode Clavier');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  server.close();
})();
