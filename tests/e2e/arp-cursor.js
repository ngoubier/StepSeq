/*
 * Curseur de la lecture en boucle de l'arpégiateur, dans un vrai navigateur (Playwright + Chromium).
 *   node tests/e2e/arp-cursor.js
 * Pour chaque vitesse, la grille montre toute la boucle (sans pages) et le curseur passe par toutes les colonnes,
 * dans l'ordre, jusqu'à la dernière. Les colonnes ne descendent jamais sous 18 px : au-delà, la grille défile pour
 * suivre le curseur (vérifié à la taille d'un téléphone). Dure environ 40 s (une boucle complète par cas).
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
  ['1/4 · Montant', { mode: 'up', rate: 0.25 }, { bars: 4, ticks: 16 }],
  ['1/8 · Montant', { mode: 'up', rate: 0.5 }, { bars: 2, ticks: 16 }],
  ['1/16 · Montant', { mode: 'up', rate: 1 }, { bars: 1, ticks: 16 }],
  ['1/16 triolet · Montant', { mode: 'up', rate: 1.5 }, { bars: 1, ticks: 24 }],
  ['1/32 · Montant', { mode: 'up', rate: 2 }, { bars: 1, ticks: 32 }],
  ['1/16 · Montant/descendant 4 octaves (cycle de 22 notes)', { mode: 'updown', rate: 1, octaves: 4 }, { bars: 2, ticks: 32 }],
  ['1/32 triolet · Double montée (48 pas)', { mode: 'up2', rate: 3 }, { bars: 1, ticks: 48 }],
  ['Téléphone · 1/32 · Montant', { mode: 'up', rate: 2 }, { bars: 1, ticks: 32, phone: true }],
];
(async () => {
  await new Promise((r) => server.listen(0, r));
  const URL = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [label, arp, want] of CASES) {
    const page = await b.newPage(want.phone ? { viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 900 } });
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
    ok(info.bars === want.bars && info.ticks === want.ticks, `${label} : boucle de ${info.bars} mesure(s), ${info.ticks} pas`);
    const g0 = await page.evaluate(() => {
      const svg = document.querySelector('.arp-grid'); const sc = document.querySelector('.arp-scroll');
      const vel = document.querySelector('.arp-vels');
      return { w: svg.getBoundingClientRect().width, vis: sc.clientWidth, scroll: sc.scrollWidth > sc.clientWidth + 1, vel: vel.getBoundingClientRect().width };
    });
    const colPx = g0.w / info.ticks;
    ok(colPx >= 17.5, `${label} : colonnes de ${colPx.toFixed(1)} px (jamais moins de 18 px)`);
    ok(Math.abs(g0.vel - g0.w) < 2, `${label} : les vélocités ont la même largeur que la grille`);
    ok(g0.scroll === g0.w > g0.vis + 1, `${label} : ${g0.scroll ? 'la grille défile (plus large que la fenêtre)' : 'toute la boucle tient dans la fenêtre'}`);
    await page.click('#arpDialog .arp-player .arp-loop');
    const seen = [];
    let maxScroll = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < (info.steps * 0.125 + 0.5) * 1000) {
      const g = await page.evaluate(() => {
        const h = document.querySelector('.arp-head');
        if (!h || +h.getAttribute('x') < 0) return -1;
        return Math.round(+h.getAttribute('x') / +h.getAttribute('width'));
      });
      maxScroll = Math.max(maxScroll, await page.evaluate(() => document.querySelector('.arp-scroll').scrollLeft));
      if (g >= 0 && seen[seen.length - 1] !== g) seen.push(g);
      await page.waitForTimeout(8);
    }
    const first = seen.slice(0, info.ticks);
    ok(first.length === info.ticks && first.every((v, i) => v === i), `${label} : le curseur passe par les colonnes 1 à ${info.ticks}, dans l'ordre${first.every((v, i) => v === i) ? '' : ' — vu : ' + first.join(' ')}`);
    if (g0.scroll) ok(maxScroll > 20, `${label} : la grille a défilé pendant la lecture (${Math.round(maxScroll)} px)`);
    ok(errs.length === 0, `${label} : aucune erreur JavaScript` + (errs.length ? ' : ' + errs.join(' | ') : ''));
    await page.close();
  }
  await b.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
