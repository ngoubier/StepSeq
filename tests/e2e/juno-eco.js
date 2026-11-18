/*
 * Test de bout en bout : mode éco des synthés Juno (js/juno-dsp.js, js/juno.js, mode allégé et mode Diagnostic).
 *   node tests/e2e/juno-eco.js
 * 1. Le mode allégé met les Juno en mode éco : ils continuent de sonner. 2. À l'arrêt, son complet rétabli.
 * 3. Mode Diagnostic : la première marche d'allègement d'une chanson à synthés Juno est leur mode éco.
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
    const origin = `http://localhost:${server.address().port}`;
    const chord = [0, 8].map((step) => ({ step, len: 8, notes: [57, 60, 64, 67, 71, 74], vel: 0.8 }));
    const song = {
      format: 'stepseq', version: 1, title: 'Juno éco', tempo: 120, bars: 1,
      tracks: [{ id: 'pad', type: 'instrument', name: 'Pad', family: 'analog', instrument: 'juno106', category: 'pad', volume: 0.7, juno: { chorus: 2 }, events: chord }],
      scenes: [], song: [],
    };
    await page.addInitScript((p) => {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      localStorage.setItem('ss.diagMode', '0');
    }, song);
    await page.goto(origin + '/index.html');
    const outPeak = async () => {
      let m = 0;
      for (let i = 0; i < 6; i++) {
        m = Math.max(m, await page.evaluate(() => SS.audio.probe().out.peak));
        await page.waitForTimeout(120);
      }
      return m;
    };
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());
    await page.waitForTimeout(1500);
    const full = await outPeak();
    ok(full > 0.01 && !(await page.evaluate(() => SS.juno.isEco())), `son complet : Juno audible (${full.toFixed(3)}), pas en éco`);

    await page.evaluate(() => SS.audioWatch.lighten('test', true));
    await page.waitForTimeout(800);
    const eco = await outPeak();
    ok(await page.evaluate(() => SS.juno.isEco()), 'mode allégé : Juno en mode éco');
    ok(eco > 0.01, `mode éco : le Juno sonne toujours (${eco.toFixed(3)})`);
    ok(eco > full * 0.3, `niveau proche du son complet (${(20 * Math.log10(eco / full)).toFixed(1)} dB)`);
    const log = await page.evaluate(() => SS.audioWatch.debugLog());
    ok(/JUNO ÉCO/.test(log) || /mode éco/.test(log), 'journal : mode éco mentionné');

    await page.click('#stop');
    await page.waitForFunction(() => !SS.audio.isPlaying());
    await page.waitForFunction(() => !SS.audio.isLight(), null, { timeout: 5000 }).catch(() => {});
    ok(!(await page.evaluate(() => SS.juno.isEco())), 'arrêt de la lecture : son complet rétabli');

    // mode Diagnostic : première marche = Juno en éco, puis « Rétablir »
    const step = await page.evaluate(() => {
      const steps = SS.audioWatch.reliefSteps(SS.audio.playingProject() || JSON.parse(localStorage.getItem('stepseq.autosave')), SS.audio.reliefState());
      return steps[0] && { key: steps[0].key, target: steps[0].target, patch: steps[0].patch };
    });
    ok(step && step.key === 'juno', `mode Diagnostic : première marche « ${step && step.key} »`);
    await page.evaluate((s) => SS.audio.setRelief(s.target, s.patch), step);
    ok(await page.evaluate(() => SS.juno.isEco() && SS.audio.reliefState().juno), 'allègement ciblé : Juno en éco');
    await page.evaluate(() => SS.audioWatch.clearRelief(true));
    ok(!(await page.evaluate(() => SS.juno.isEco())), '« Rétablir » : son complet');
    ok(!errors.length, 'aucune erreur JS ' + errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
})();
