/*
 * Système : simule les anciens scripts de démarrage et audio encore en cache.
 * Les fichiers versionnés doivent charger le panneau et son API de mesures ensemble.
 *   node tests/e2e/system-panel-cache.js
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
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let staleMain = 0;
    // Simule la réponse déjà gardée en cache avant l'ajout du panneau.
    const oldMain = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').replace(/^.*SS\.systemPanel\.init.*\n/m, '');
    const oldAudio = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8').replace('    diagnostics,', '');
    let staleAudio = 0;
    await page.route('**/js/audio.js', route => { staleAudio++; return route.fulfill({ body: oldAudio, contentType: 'text/javascript' }); });
    await page.route('**/js/main.js', route => { staleMain++; return route.fulfill({ body: oldMain, contentType: 'text/javascript' }); });
    await page.goto(`http://localhost:${server.address().port}/index.html`);
    await page.click('#systemBtn');
    ok(staleMain === 0 && staleAudio === 0, 'les URL versionnées évitent les anciens scripts conservés en cache');
    ok(await page.evaluate(() => typeof SS.audio.diagnostics === 'function'), 'le moteur audio fournit les diagnostics attendus');
    ok(await page.locator('#systemDialog[open]').count() === 1, 'Système s’ouvre malgré les anciennes URL de scripts en cache');
    ok((await page.locator('[data-metric="ramFree"]').count()) === 1, 'les informations du panneau sont initialisées');
  } finally { await browser.close(); server.close(); }
})();
