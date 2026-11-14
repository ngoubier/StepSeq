/*
 * Écran principal sur téléphone : pas de débordement horizontal, la grille garde de la hauteur,
 * l'écran normal (≥ 761 px) ne change pas.
 *   node tests/e2e/mobile-ui.js [dossier-captures]
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
const SHOTS = process.argv[2];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const { devices } = require('playwright');
  const b = await chromium.launch();
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos/autoroute-de-minuit.stepseq.json'), 'utf8'));
  const cases = [
    ['iPhone 13', devices['iPhone 13'], 300],
    ['iPhone SE', devices['iPhone SE'], 220],
    ['iPhone 13 à l’horizontale', devices['iPhone 13 landscape'], 150],
    ['écran 1600 × 1000', { viewport: { width: 1600, height: 1000 } }, 500],
  ];
  for (const [name, opt, minGrid] of cases) {
    const ctx = await b.newContext(opt);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((p) => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), demo);
    await page.goto(`http://localhost:${server.address().port}/index.html`);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      const studio = [...document.querySelectorAll('.studio-btn')].map((x) => x.getBoundingClientRect());
      return {
        w: innerWidth, sw: document.documentElement.scrollWidth, grid: r('#workspace').height,
        play: r('#play').right <= innerWidth, studio: studio.every((x) => x.right <= innerWidth + 0.5) && new Set(studio.map((x) => Math.round(x.width))).size === 1,
        headVisible: getComputedStyle(document.querySelector('.th-vol')).display !== 'none',
      };
    });
    ok(m.sw <= m.w, `${name} : pas de débordement horizontal (${m.sw} / ${m.w} px)`);
    ok(m.grid >= minGrid, `${name} : la grille garde ${Math.round(m.grid)} px de hauteur`);
    ok(m.play && m.studio, `${name} : Lecture et les 4 boutons Band / Key / Song / Mix (même largeur) sont à l’écran`);
    if (m.w > 1000) ok(m.headVisible, `${name} : en-têtes de piste complets (volume visible)`);
    // la lecture et la fenêtre Song marchent au doigt / à la souris
    await page.click('#songBtn');
    ok(await page.locator('#songDialog[open]').count() === 1, `${name} : la fenêtre Song s’ouvre`);
    await page.click('#songClose');
    // fenêtre Band : tout tient à l'écran, les trois boutons du pied sont visibles, le panneau du musicien aussi
    await page.click('#bandBtn');
    await page.waitForTimeout(400);
    const band = await page.evaluate(() => {
      const d = document.querySelector('#bandDialog');
      const inView = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.width > 0; };
      return { fits: d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().right <= innerWidth + 0.5, buttons: ['#bandCancel', '#bwNext'].every(inView) };
    });
    ok(band.fits && band.buttons, `${name} : fenêtre Band à l’écran, Annuler / Suivant visibles`);
    await page.click('#bandStage .band-mus >> nth=2');
    await page.waitForTimeout(300);
    const pan = await page.evaluate(() => {
      const p = document.querySelector('#bandPanel');
      const r = p.getBoundingClientRect();
      const names = [...p.querySelectorAll('.bc-name')].map((n) => n.getBoundingClientRect().height);
      return { visible: !p.hidden && r.top < innerHeight && r.bottom <= innerHeight + 1, names: names.length > 0 && names.every((h) => h > 8), nul: /null/.test(p.textContent) };
    });
    ok(pan.visible && pan.names && !pan.nul, `${name} : panneau du musicien lisible (noms d’instrument visibles, pas de « null »)`);
    await page.click('#bandCancel');
    SHOTS && (await page.screenshot({ path: path.join(SHOTS, `mobile-${name.replace(/\W+/g, '-')}.png`) }));
    ok(!errs.length, `${name} : aucune erreur JavaScript` + (errs.length ? ' : ' + errs.join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  server.close();
})();
