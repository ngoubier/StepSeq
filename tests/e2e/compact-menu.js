/*
 * Hauteur des pistes « Compact » : menu ⋯ des commandes de la piste (titre, volume, groupes, rien qui déborde),
 * et mode Normal inchangé (mêmes commandes en grille).
 *   node tests/e2e/compact-menu.js
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
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(600);
  ok((await page.locator('.track .th-more:visible').count()) === 0, 'mode Normal : pas de bouton ⋯');
  ok((await page.locator('.track').first().locator('.th-ctrls .th-play:visible').count()) === 1, 'mode Normal : commandes dans l’en-tête');
  await page.selectOption('#trackHeight', 'compact');
  await page.waitForTimeout(200);
  const track = page.locator('.track').last();
  await track.locator('.th-more').click();
  const menu = page.locator('.th-options:popover-open');
  ok((await menu.count()) === 1, 'le bouton ⋯ ouvre le menu');
  ok((await track.locator('.th-more').getAttribute('aria-expanded')) === 'true', 'aria-expanded = true');
  const mb = await menu.boundingBox();
  ok(mb.x >= 0 && mb.y >= 0 && mb.x + mb.width <= 1400 && mb.y + mb.height <= 800, 'menu entièrement visible');
  const vb = await menu.locator('.th-vol').boundingBox();
  ok(vb.x >= mb.x && vb.x + vb.width <= mb.x + mb.width, 'le curseur de volume reste dans le menu');
  const tops = await menu.evaluate((m) => ['.th-option-title', '.th-option-volume', '.th-play', '.th-del'].map((s) => m.querySelector(s).getBoundingClientRect().top));
  ok(tops.every((t, i) => !i || t > tops[i - 1]), 'ordre : titre, volume, Écouter… Supprimer en dernier');
  ok((await menu.locator('.th-option-title').textContent()).trim() === (await track.locator('.th-name b').textContent()).trim(), 'titre = nom de la piste');
  await menu.locator('.th-vol').fill('0.3');
  ok((await menu.locator('.th-option-pct').textContent()) === '30 %', 'le pourcentage suit le volume');
  await menu.locator('.th-auto').click();
  await page.waitForTimeout(200);
  ok((await page.locator('.th-options:popover-open').count()) === 0, 'un choix ferme le menu');
  ok((await page.locator('.auto-lane').count()) === 1, 'Automation : la ligne s’ouvre');
  await page.keyboard.press('Escape');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
