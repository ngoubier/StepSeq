/*
 * Banque de presets du synthé intégré dans la fenêtre « Nouvelle piste » : sous-groupes Leads / Arpèges / Plucks,
 * filtre « Sons célèbres », fiche du preset, et création d'une piste qui joue le preset.
 *   node tests/e2e/synth-presets.js [capture.png]
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let ok = 0, ko = 0;
  const check = (c, msg) => (c ? (ok++, console.log('OK  ', msg)) : (ko++, console.log('FAIL', msg)));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('stepseq.autosave', JSON.stringify({ format: 'stepseq', version: 1, title: 'Presets', tempo: 110, bars: 1, tracks: [], scenes: [], song: [] }));
      localStorage.setItem('ss.diagMode', '0');
    });
    page.setDefaultTimeout(15000);
    await page.goto(`http://localhost:${server.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SS && SS.ui && SS.catalog);
    await page.click('#emptyAdd');
    await page.click('#dlgRoles button[data-v="synth"]');
    const subs = await page.$$eval('#dlgSub .chip', (b) => b.map((x) => x.textContent));
    check(!(await page.$eval('#dlgSubRow', (e) => e.hidden)) && subs.some((s) => s.startsWith('Arpèges')) && subs.some((s) => s.startsWith('★')), 'sous-groupes et « Sons célèbres » : ' + subs.join(' | '));
    await page.click('#dlgSub .chip[data-v="arp"]');
    const nArp = await page.$$eval('#dlgSndList .pl-item', (l) => l.length);
    check(nArp >= 5 && nArp < 20, `Arpèges : ${nArp} presets`);
    await page.click('#dlgSub .chip[data-v="all"]');
    await page.click('#dlgSub .nt-famous');
    const fam = await page.$$eval('#dlgSndList .pl-item', (l) => l.map((x) => x.textContent));
    check(fam.length === 16 && fam.every((t) => t.includes('★')), `Sons célèbres du rôle : ${fam.length}`);
    await page.click('#dlgSndList .pl-item:nth-child(1)');
    const fiche = await page.$eval('#dlgFiche', (e) => e.textContent);
    check(/Dans l’esprit de/.test(fiche), 'fiche : ' + fiche.slice(0, 90));
    if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
    // création : la piste reçoit les effets suggérés du preset
    await page.click('#dlgOk');
    await page.waitForFunction(() => document.querySelector('.track'));
    await page.waitForTimeout(1500); // sauvegarde automatique
    const fx = await page.evaluate(() => (JSON.parse(localStorage.getItem('stepseq.autosave') || '{}').tracks || []).slice(-1)[0]?.fx || null);
    const fxLive = await page.evaluate(() => [...document.querySelectorAll('.track')].length);
    check(fxLive === 1 && fx && fx.delay === 0.2 && fx.sendHall === 0.2, 'piste créée avec les effets suggérés : ' + JSON.stringify(fx));
    // sound design : onglet Simple (6 gestes) qui écrit dans track.sd
    await page.click('.track .th-sd');
    const rows = await page.$$eval('#sdEasySliders .sd-row label', (l) => l.map((x) => x.textContent));
    check(rows.join() === 'Luminosité,Mordant,Attaque,Relâchement,Mouvement,Glide', 'onglet Simple : ' + rows.join(', '));
    await page.$eval('#sdEasy_bright', (i) => { i.value = 900; i.dispatchEvent(new Event('input')); });
    const sd = await page.evaluate(() => document.querySelector('#sdState_easy').textContent);
    check(/retouché/.test(sd), 'Luminosité retouchée : ' + sd);
    if (process.argv[3]) await page.screenshot({ path: process.argv[3] });

    check(!errs.length, 'aucune erreur JS ' + errs.join(' / '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
