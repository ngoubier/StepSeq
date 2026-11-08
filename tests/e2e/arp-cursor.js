/*
 * Curseur de la lecture en boucle de l'arpégiateur, dans un vrai navigateur (Playwright + Chromium).
 *   node tests/e2e/arp-cursor.js
 * Pour chaque vitesse, le curseur doit passer par toutes les colonnes de la boucle, dans l'ordre, jusqu'à la
 * dernière (pages de 16 pas qui suivent la lecture). Dure environ 30 s (une boucle complète par cas).
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
const CASES = [
  ['1/4 · Montant', { mode: 'up', rate: 0.25 }, { bars: 4, ticks: 16, pages: 1 }],
  ['1/8 · Montant', { mode: 'up', rate: 0.5 }, { bars: 2, ticks: 16, pages: 1 }],
  ['1/16 · Montant', { mode: 'up', rate: 1 }, { bars: 1, ticks: 16, pages: 1 }],
  ['1/16 triolet · Montant', { mode: 'up', rate: 1.5 }, { bars: 1, ticks: 24, pages: 2 }],
  ['1/32 · Montant', { mode: 'up', rate: 2 }, { bars: 1, ticks: 32, pages: 2 }],
  ['1/16 · Montant/descendant 4 octaves (cycle de 22 notes)', { mode: 'updown', rate: 1, octaves: 4 }, { bars: 2, ticks: 32, pages: 2 }],
];
(async () => {
  await new Promise((r) => server.listen(0, r));
  const URL = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [label, arp, want] of CASES) {
    const page = await b.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const proj = { format: 'stepseq', version: 1, title: 'Curseur', tempo: 120, timeSig: [4, 4], bars: 4, tracks: [{ id: 'a1', type: 'instrument', name: 'Arp', color: '#a479ff', category: 'arp', family: 'synth', instrument: 'syn_sawbass', octave: 3, arp, events: [{ step: 0, len: 64, notes: [57, 60, 64], vel: 0.8 }] }] };
    await page.addInitScript((p) => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), proj);
    await page.goto(URL);
    await page.waitForTimeout(500);
    await page.click('.th-btn[title="Afficher / masquer le piano roll"]');
    await page.click('.roll-arp');
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => SS.arpPanel._info());
    ok(info.bars === want.bars && info.ticks === want.ticks && info.pages === want.pages, `${label} : boucle de ${info.bars} mesure(s), ${info.ticks} pas, ${info.pages} page(s)`);
    await page.click('#arpDialog .arp-player .arp-loop');
    const seen = [];
    const t0 = Date.now();
    while (Date.now() - t0 < (info.steps * 0.125 + 0.5) * 1000) {
      const g = await page.evaluate(() => {
        const h = document.querySelector('.arp-head');
        if (!h || +h.getAttribute('x') < 0) return -1;
        return SS.arpPanel._view.page * 16 + Math.round(+h.getAttribute('x') / +h.getAttribute('width'));
      });
      if (g >= 0 && seen[seen.length - 1] !== g) seen.push(g);
      await page.waitForTimeout(8);
    }
    const first = seen.slice(0, info.ticks);
    ok(first.length === info.ticks && first.every((v, i) => v === i), `${label} : le curseur passe par les colonnes 1 à ${info.ticks}, dans l'ordre${first.every((v, i) => v === i) ? '' : ' — vu : ' + first.join(' ')}`);
    ok(errs.length === 0, `${label} : aucune erreur JavaScript` + (errs.length ? ' : ' + errs.join(' | ') : ''));
    await page.close();
  }
  await b.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
