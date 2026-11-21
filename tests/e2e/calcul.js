/*
 * Test de bout en bout : jauge CALCUL et « Calcul par piste » (js/calcul.js), « Figer les plus lourdes ».
 *   node tests/e2e/calcul.js            (SHOTS=dossier : captures)
 * Chanson synthwave de l'assistant (4 synthés Juno) : mesure en arrière-plan, jauge, fenêtre par piste, figer les
 * plus lourdes (le total baisse), proposition quand le son décroche.
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
const SHOTS = process.env.SHOTS;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(120000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('ld.init')) return;
    sessionStorage.setItem('ld.init', '1');
    localStorage.clear();
    localStorage.setItem('stepseq.autosave', JSON.stringify({ format: 'stepseq', version: 1, title: 'Calcul', tempo: 110, bars: 1, tracks: [], scenes: [], song: [] }));
  });
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1500);
  ok(await page.isVisible('#loadBtn'), 'jauge CALCUL dans la barre du haut');
  await page.evaluate(() => {
    StepSeq.assistantOuvrir();
    StepSeq.assistantStyle({ style: 'synthwave' });
    StepSeq.assistantCreer();
  });

  // mesure en arrière-plan (quelques secondes après la dernière modification)
  const t0 = Date.now();
  await page.waitForFunction(() => SS.load.report().total != null, null, { timeout: 180000 });
  const r1 = await page.evaluate(() => {
    const r = SS.load.report();
    return { total: r.total, base: r.base, rows: r.rows.map((x) => [x.track.name, Math.round(x.ms)]) };
  });
  console.log(`   mesuré en ${((Date.now() - t0) / 1000).toFixed(1)} s : total ${Math.round(r1.total)} ms/s, Master ${Math.round(r1.base)} ;`, r1.rows.map((x) => x.join(' ')).join(', '));
  ok(r1.total > 0, `jauge : ${await page.textContent('#loadBtn .ld-val')}`);
  const juno = r1.rows.filter(([n]) => /Nappe|Arp|Lead|Basse/.test(n)).reduce((a, [, ms]) => a + ms, 0);
  const drums = r1.rows.filter(([n]) => /Kick|Snare|Clap|Hat|Crash/.test(n)).reduce((a, [, ms]) => a + ms, 0);
  ok(juno > drums, `les synthés coûtent plus que la batterie (${Math.round(juno)} contre ${Math.round(drums)} ms/s)`);

  // fenêtre « Calcul par piste »
  await page.click('#loadBtn');
  await page.waitForSelector('.ld-pop');
  ok((await page.$$('.ld-pop .ld-row')).length === r1.rows.length + 1, 'une ligne par piste, plus le Master');
  if (SHOTS) {
    const bb = await page.locator('.ld-pop').boundingBox();
    await page.screenshot({ path: path.join(SHOTS, 'calcul-pistes.png'), clip: { x: Math.max(0, bb.x - 300), y: 0, width: Math.min(1600, bb.width + 500), height: bb.y + bb.height + 20 } });
  }
  const goTxt = await page.textContent('.ld-pop .ld-go');
  ok(/Figer les plus lourdes/.test(goTxt), goTxt.trim());
  await page.click('.ld-pop .ld-go');
  await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => ({ total: SS.load.report().total, frozen: SS.load.report().rows.filter((x) => x.frozen).map((x) => x.track.name) }));
  ok(r2.frozen.length >= 1 && r2.total < r1.total, `figées : ${r2.frozen.join(', ')} → ${Math.round(r1.total / 10)} % → ${Math.round(r2.total / 10)} %`);

  // le son décroche : proposition (une fois par lecture)
  await page.evaluate(() => SS.load.report().rows.filter((x) => x.frozen).forEach((x) => SS.freeze.set(x.track, false)));
  await page.click('#loadBtn'); // referme la fenêtre
  const t = await page.evaluate(() => SS.load.overloaded(SS.load._project(), 42) && document.querySelector('#toast').textContent);
  ok(/Le son décroche/.test(t || ''), `proposition : « ${(t || '').trim()} »`);
  ok(await page.evaluate(() => document.getElementById('loadBtn').classList.contains('over')), 'jauge en rouge');
  ok(!(await page.evaluate(() => SS.load.overloaded(SS.load._project(), 42))), 'une seule proposition par lecture');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'calcul-decroche.png') });

  ok(!errs.length, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
