/*
 * Test de bout en bout : écoute pré-calculée de l'assistant « Nouvelle chanson » (appareil trop lent).
 *   node tests/e2e/prerender.js
 * 1. Réglage actif : « Calcul de l'écoute… » puis lecture de l'enregistrement dès les premières secondes calculées
 *    (aucune note calculée en direct), le curseur avance, pause / reprise / arrêt.
 * 2. Automatique : le son décroche pendant une écoute → le réglage s'active et l'écoute repart pré-calculée.
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
const OUT = process.env.SHOTS || '/tmp';

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('pre.init')) {
        sessionStorage.setItem('pre.init', '1');
        localStorage.clear();
        localStorage.setItem('stepseq.autosave', JSON.stringify({ format: 'stepseq', version: 1, title: 'Test', tempo: 110, bars: 1, tracks: [], scenes: [], song: [] }));
        localStorage.setItem('ss.diagMode', '0');
        localStorage.setItem('ss.prerender', '1');
      }
    });
    await page.goto(`http://localhost:${server.address().port}/index.html`);
    await page.waitForFunction(() => window.StepSeq && window.SS && SS.ui);
    const tStart = await page.evaluate(() => {
      StepSeq.assistantOuvrir();
      StepSeq.assistantStyle({ style: 'synthwave', inspiration: 'smalltown' });
      StepSeq.assistantEcouter();
      return Date.now();
    });
    // 1. calcul, puis lecture
    await page.waitForFunction(() => /Calcul de l’écoute/.test(document.querySelector('#lcdTitle').textContent), null, { timeout: 10000 });
    ok(true, 'afficheur : « ' + (await page.textContent('#lcdTitle')) + ' »');
    await page.screenshot({ path: path.join(OUT, 'prerender-calcul.png') });
    await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 180000 });
    // le son arrive par morceaux : l'écoute part sans attendre la fin du calcul (45 s pour toute la chanson)
    const wait = Date.now() - tStart;
    ok(wait < 8000, `l'écoute part avant la fin du calcul (${wait} ms)`);
    await page.waitForTimeout(2500);
    const a = await page.evaluate(() => {
      const p = SS.audio.probe();
      return { voices: p.voices, juno: p.juno, out: p.out.peak, step: SS.band._state && document.querySelector('#position').textContent, title: document.querySelector('#lcdTitle').textContent };
    });
    ok(a.voices === 0, `aucune voix calculée en direct (${a.voices})`);
    ok(a.out > 0.01, `l'enregistrement s'entend (crête ${a.out.toFixed(3)})`);
    ok(!/Calcul/.test(a.title), `afficheur : « ${a.title} »`);
    const pos1 = await page.textContent('#position');
    await page.waitForTimeout(1200);
    const pos2 = await page.textContent('#position');
    ok(pos1 !== pos2, `le curseur avance (${pos1} → ${pos2})`);
    await page.screenshot({ path: path.join(OUT, 'prerender-lecture.png') });
    // pause / reprise
    await page.evaluate(() => SS.band.togglePlay());
    await page.waitForTimeout(600);
    const paused = await page.evaluate(() => SS.audio.probe().out.peak);
    ok(paused < 0.01, `pause : silence (${paused.toFixed(4)})`);
    await page.evaluate(() => SS.band.togglePlay());
    await page.waitForTimeout(800);
    const resumed = await page.evaluate(() => SS.audio.probe().out.peak);
    ok(resumed > 0.01, `reprise : le son revient (${resumed.toFixed(3)})`);
    await page.evaluate(() => SS.band.stopListen());
    await page.waitForTimeout(400);
    ok(!(await page.evaluate(() => SS.audio.isPlaying())), 'arrêt');
    // 2e écoute (la 1re arrêtée en cours de calcul : recalculée), part tout de suite
    const t0 = Date.now();
    await page.evaluate(() => StepSeq.assistantEcouter());
    await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 60000 });
    ok(Date.now() - t0 < 3000, `2e écoute rapide (${Date.now() - t0} ms)`);
    await page.evaluate(() => SS.band.stopListen());

    // 2. automatique : réglage absent, le son décroche
    await page.evaluate(() => localStorage.removeItem('ss.prerender'));
    await page.evaluate(() => StepSeq.assistantEcouter());
    await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const live = await page.evaluate(() => SS.audio.probe().voices + SS.audio.probe().juno);
    ok(live > 0, `écoute en direct d'abord (${live} voix ou Juno)`);
    const switched = await page.evaluate(() => SS.band.slowListen());
    ok(switched, 'décrochage : passage à l’écoute pré-calculée');
    ok((await page.evaluate(() => localStorage.getItem('ss.prerender'))) === '1', 'réglage activé (Options › Son)');
    await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 180000 });
    ok(await page.evaluate(() => document.getElementById('optPrerender').checked), 'case cochée dans Options › Son');
    await page.evaluate(() => SS.band.stopListen());
    // réglage refusé : plus d'automatique
    await page.evaluate(() => localStorage.setItem('ss.prerender', '0'));
    ok(!(await page.evaluate(() => SS.band.slowListen())), 'réglage décoché : pas de bascule automatique');
    ok(!errors.length, 'aucune erreur JS' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  } finally {
    await browser.close();
    server.close();
  }
})();
