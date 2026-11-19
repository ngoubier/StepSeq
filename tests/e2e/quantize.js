/*
 * Quantize : bouton activé par défaut, notes jouées au clavier alignées (ou décalage gardé si coupé),
 * action « Quantifier » sur la sélection.
 *   node tests/e2e/quantize.js
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
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.evaluate(() => {
    const p = SS.newProject();
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_acidsub', name: 'Basse' }, p);
    t.events = [{ step: 0, len: 2, notes: [36], vel: 0.7, shift: 0.3 }, { step: 4, len: 2, notes: [38], vel: 0.7, shift: -0.2 }, { step: 8, len: 2, notes: [40], vel: 0.7 }];
    p.tracks.push(t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const shifts = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events.map((e) => e.shift || 0));

  ok((await page.getAttribute('#quantizeBtn', 'aria-pressed')) === 'true', 'Quantize activé par défaut');
  ok((await page.locator('.track .shift-home').count()) === 2, 'deux notes décalées affichées');
  ok(await page.locator('#selQuant').isDisabled(), 'Quantifier grisé sans sélection');
  // Options › Affichage : contour de la case d'origine, affiché par défaut, masquable
  const homeShown = () => page.locator('.track .shift-home').first().evaluate((e) => getComputedStyle(e).display !== 'none');
  ok((await page.isChecked('#optShiftHome')) && (await homeShown()), 'case d’origine en pointillé affichée par défaut');
  await page.evaluate(() => document.getElementById('optionsDialog').showModal());
  await page.click('#optShiftHome');
  await page.click('#optionsDialog .dlg-footer .btn-accent');
  ok(!(await homeShown()) && (await page.evaluate(() => localStorage.getItem('stepseq.shiftHome'))) === '0', 'option décochée : pointillé masqué et retenu');
  await page.click('.track .cell[data-step="8"]');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);
  ok(!(await page.locator('#selQuant').isDisabled()), 'Quantifier disponible avec des notes sélectionnées');
  await page.click('#selQuant');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await shifts()) === '[0,0,0]', `Quantifier : notes alignées ${JSON.stringify(await shifts())}`);
  ok((await page.locator('.track .shift-home').count()) === 0, 'plus de note décalée');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await shifts()) === '[0.3,-0.2,0]', `Ctrl+Z rend les décalages ${JSON.stringify(await shifts())}`);

  // notes jouées : Quantize actif -> alignées ; coupé -> décalage gardé
  const played = (q) =>
    page.evaluate((q) => {
      const t = { type: 'instrument', events: [] };
      const pl = SS.live.place(4.3, 5.3, q, 16);
      SS.live.writeNote(t, { ...pl, midi: 60, vel: 0.8 });
      return t.events[0].shift || 0;
    }, q);
  ok((await played(1)) === 0 && (await played(0)) === 0.3, 'placement : aligné avec grille, décalage gardé sans');
  await page.click('#quantizeBtn');
  ok((await page.getAttribute('#quantizeBtn', 'aria-pressed')) === 'false' && (await page.evaluate(() => localStorage.getItem('stepseq.quantize'))) === '0', 'Quantize coupé et retenu');
  await page.reload();
  await page.waitForTimeout(400);
  ok((await page.getAttribute('#quantizeBtn', 'aria-pressed')) === 'false', 'réglage gardé après rechargement');
  ok(!errs.length, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
