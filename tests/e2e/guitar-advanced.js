/*
 * Nouvelle chanson : bouton « Avancé » du Guitariste (l'arpégiateur Guitare d'Arp One dans l'étape).
 *   node tests/e2e/guitar-advanced.js   (capture : GTADV_SHOT=chemin)
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
  await page.click('#appMenuBtn'); await page.click('#bandBtn'); await page.waitForTimeout(400); await page.click('#brgSkip').catch(() => {}); await page.waitForTimeout(300);
  await page.click('#bandStyles [data-v="pop"]'); await page.click('#bandPresets .band-preset >> nth=0');
  for (let i = 0; i < 12 && !(await page.locator('#bandWiz .bwp-guitar').count()); i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); }
  ok(await page.locator('#bandWiz .bwp-guitar').count() === 1, 'étape du Guitariste : motifs guitare');
  await page.click('#bandWiz .bh-scene >> nth=1'); await page.waitForTimeout(300);
  await page.click('#bandWiz .bwp-guitar .bwp-mode[data-v="g:classA"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGtAdv:not([disabled])').count() === 1, 'bouton Avancé');
  await page.click('#bwGtAdv'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGtAdvanced .gt-diagram').count() === 1 && (await page.locator('#bwGtAdvanced .gt-tab .gt-note').count()) >= 6, 'Avancé : schéma d’accord et tablature d’Arp One');
  await page.selectOption('#bwGtCapo', '5'); await page.waitForTimeout(300);
  const st = await page.evaluate(() => { const S = SS.band._state; const sc = S.wiz.hscene; return JSON.stringify(S.wiz.parts); });
  ok(/"gtr":\{"capo":5\}/.test(st), 'capodastre enregistré pour la scène');
  ok(await page.locator('#bwGtAdvanced').count() === 1, 'Avancé reste ouvert');
  if (process.env.GTADV_SHOT) { await page.locator('#bwGtAdvanced').scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.GTADV_SHOT }); }
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close(); server.close();
})();
