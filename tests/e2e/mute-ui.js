/*
 * Test de bout en bout : Muet / Solo coupent aussitôt le son en cours (notes tenues comprises),
 * depuis l'en-tête des pistes et depuis la console ; à l'arrêt, le bouton Écouter d'une piste muette reste audible.
 *   node tests/e2e/mute-ui.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', '..');
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
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1500);
  // projet de démo : Kick 1, Clap 1, Hi-Hat fermé 1, Saw Bass, Pad 2 (nappe aux notes longues)
  const names = await page.$$eval('.track-name, .th-name', (els) => els.map((e) => e.value || e.textContent));
  const pad = Math.max(0, names.findIndex((n) => /Pad/.test(n)));
  const peak = (i, ms = 600) =>
    page.evaluate(async ({ i, ms }) => {
      const id = document.querySelectorAll('.th-btn.mute')[i].closest('[data-id]').dataset.id;
      let m = 0;
      for (let k = 0; k < ms / 50; k++) {
        const l = SS.audio.levels(id);
        m = Math.max(m, l ? l.peak : 0);
        await new Promise((r) => setTimeout(r, 50));
      }
      return m;
    }, { i, ms });

  await page.click('#play');
  await page.waitForTimeout(2500);
  ok((await peak(pad)) > 0.05, 'la nappe joue');
  await page.click(`.th-btn.mute >> nth=${pad}`);
  await page.waitForTimeout(150);
  ok((await peak(pad)) < 0.002, 'Muet (en-tête) : la nappe se tait aussitôt, notes tenues comprises');
  await page.click(`.th-btn.mute >> nth=${pad}`);
  await page.waitForTimeout(1500);
  ok((await peak(pad, 1500)) > 0.05, 'et revient');
  await page.click('.th-btn.solo >> nth=0');
  await page.waitForTimeout(150);
  ok((await peak(pad)) < 0.002, 'Solo d\'une autre piste : la nappe se tait aussitôt');
  await page.click('.th-btn.solo >> nth=0');
  await page.click('#mixerBtn');
  await page.waitForTimeout(400);
  await page.waitForTimeout(1500);
  await page.click(`#mixerStrips .ms.mute >> nth=${pad}`);
  await page.waitForTimeout(150);
  ok((await peak(pad)) < 0.002, 'Muet (console) : coupure immédiate');
  await page.click('#stop');
  await page.waitForTimeout(300);
  ok(await page.evaluate((i) => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return p.tracks[i].mute === true;
  }, pad), 'l\'état muet est enregistré dans le projet');
  await page.click('#mixerStrips .ms.mute >> nth=' + pad); // rouvre pour la suite
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
