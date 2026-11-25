/*
 * Nouvelle chanson : l'assistant ne garde pas les sons de la chanson précédente.
 *   node tests/e2e/wizard-fresh-sounds.js
 * L'assistant ouvert sur la démo reprend ses instruments (Saw Bass…). Ensuite, menu « Nouvelle chanson » puis
 * Calle de la Luna : la basse doit être la contrebasse de l'inspiration, pas la Saw Bass de la démo.
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
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    const S = window.StepSeq;
    const bass = (s) => (s.musiciens || []).find((m) => m.type === 'bass');
    await S.assistantOuvrir(); // sur la démo : ses instruments sont repris
    const before = bass(await S.assistantStyle({ style: 'latin', inspiration: 'calle' }));
    await S.assistantFermer();
    document.querySelector('#newProject').click();
    await new Promise((res) => setTimeout(res, 1200));
    const after = bass(await S.assistantStyle({ style: 'latin', inspiration: 'calle' }));
    return { before: before && before.son, after: after && after.son };
  });
  ok(/Saw Bass/.test(r.before || ''), `sur la démo, la basse reprend la grille (${r.before})`);
  ok(/Contrebasse/.test(r.after || ''), `nouvelle chanson : la basse de Calle de la Luna est la contrebasse (${r.after})`);
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
