/*
 * Test de bout en bout : origine des projets dans le journal de débogage (js/audiowatch.js).
 *   node tests/e2e/debug-origin.js
 * Démarrage, « Nouvelle chanson… », écoute de l'assistant : le journal dit quelle chanson joue et d'où elle vient.
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
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/index.html`);
    const journal = () => page.evaluate(() => SS.audioWatch.debugLog());
    let log = await journal();
    ok(/PROJET\s+« Démo » .*origine : démarrage : projet de démonstration/.test(log), 'démarrage : projet de démonstration noté');

    await page.click('#appMenuBtn');
    await page.click('#newProject');
    await page.click('#bandStyles [data-v="synthwave"]');
    await page.click('#bandPresets .band-preset >> nth=0');
    for (let i = 0; i < 3; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForFunction(() => SS.band._state.wiz && SS.band._state.wiz.res);
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    log = await journal();
    ok(/origine : nouvelle chanson vide/.test(log), 'nouvelle chanson vide notée');
    ok(/ASSIST\s+ouvert sur une chanson vide/.test(log), 'ouverture de l’assistant notée');
    ok(/PROJET\s+joué : .*pistes d'écoute de l'assistant.*origine : écoute de l'assistant/.test(log), 'ligne « PROJET joué » : écoute de l’assistant');
    ok(/lecture chanson à partir du bloc 1/.test(log) && /style synthwave/.test(log) && /inspiration \S+/.test(log), 'mode d’écoute, style et inspiration');
    ok(/## Origine des projets\n- chanson jouée : .*écoute de l'assistant[^\n]*\n- chanson de l'éditeur : « Nouveau projet » .*origine : nouvelle chanson vide/.test(log), 'section « Origine des projets » : jouée et éditeur');
    ok(/## Chanson \(jouée en dernier : écoute de l'assistant/.test(log), 'section Chanson : l’écoute de l’assistant');
    console.log(log.split('\n').filter((l) => /PROJET|ASSIST|^- chanson/.test(l)).join('\n'));
    await page.click('#stop');
    ok(!errors.length, 'aucune erreur JS ' + errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
})();
