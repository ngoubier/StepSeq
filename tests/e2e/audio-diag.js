/*
 * Test de bout en bout : mode Diagnostic (allègements ciblés, js/audiowatch.js, SS.audio.setRelief).
 *   node tests/e2e/audio-diag.js
 * Surcharge simulée : la reverb la plus lourde est d'abord raccourcie, puis coupée si les décrochages continuent ;
 * le son continue, le projet n'est pas modifié, la fenêtre Système liste les allègements, « Rétablir » remet tout,
 * et le journal de débogage contient le contexte et les actions.
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const origin = `http://localhost:${server.address().port}`;
    const events = [0, 4, 8, 12].map((step) => ({ step, len: 2, notes: [60], vel: 0.8 }));
    const song = {
      format: 'stepseq', version: 1, title: 'Diagnostic', tempo: 120, bars: 1,
      tracks: [
        { id: 'lead', type: 'instrument', name: 'Lead', family: 'lead', instrument: 'syn_sub', category: 'lead', volume: 0.6, events, fx: { room: 0.6, roomSize: 4, delay: 0.4, delayTime: '1/8', delayFeedback: 0.4 } },
        { id: 'bass', type: 'instrument', name: 'Basse', family: 'bass', instrument: 'syn_sub', category: 'bass', volume: 0.5, events: [{ step: 0, len: 16, notes: [36], vel: 0.7 }] },
      ],
      scenes: [], song: [],
    };
    await page.addInitScript((p) => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), song);
    await page.goto(origin + '/index.html');
    await page.evaluate(() => (SS.audioWatch.CFG.settle = 1500)); // attente raccourcie pour le test
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());
    await page.waitForTimeout(1500);
    const lv = () => page.evaluate(() => {
      const s = SS.audio.probe();
      const lead = s.tracks.find((t) => t.id === 'lead');
      return { out: s.out.peak, reverb: lead.reverb ? lead.reverb.peak : 0, delay: lead.delay ? lead.delay.peak : 0, light: s.light };
    });
    const before = await lv();
    ok(before.reverb > 0.001, `reverb audible avant (${before.reverb.toFixed(3)})`);

    // surcharge simulée : le navigateur signale des décrochages
    await page.evaluate(() => {
      const probe = SS.audio.probe;
      window.__overload = true;
      SS.audio.probe = () => {
        const s = probe();
        if (s && window.__overload) s.render = { average: 0.97, peak: 1, underrun: 0.05, at: performance.now() };
        return s;
      };
    });
    await page.waitForFunction(() => SS.audioWatch.relief().length >= 1, null, { timeout: 3000 });
    const r1 = await page.evaluate(() => SS.audioWatch.relief()[0].label);
    ok(/Reverb de « Lead » raccourcie : 4,0 s → 2,0 s/.test(r1), '1re étape : ' + r1);
    const toast = (await page.textContent('#toast')).trim();
    ok(/raccourcie/.test(toast), 'notification : ' + toast);
    ok(!(await page.evaluate(() => SS.audio.isLight())), 'pas de mode allégé complet');
    await page.waitForTimeout(700);
    ok((await page.evaluate(() => SS.audioWatch.relief().length)) === 1, 'attente après l\'allègement : une seule étape');
    // les décrochages continuent : reverb 2 s -> 1 s -> coupée
    await page.waitForFunction(() => SS.audioWatch.relief().some((d) => /coupée/.test(d.label)), null, { timeout: 12000 });
    const labels = await page.evaluate(() => SS.audioWatch.relief().map((d) => d.label));
    const verdicts = await page.evaluate(() => SS.audioWatch.relief().map((d) => d.ok));
    ok(verdicts[0] === false && verdicts[1] === false, 'étapes précédentes jugées insuffisantes');
    ok(labels.length === 3 && /2,0 s → 1,0 s/.test(labels[1]) && /Reverb de « Lead » coupée/.test(labels[2]), 'escalade : ' + labels.join(' | '));
    await page.evaluate(() => (window.__overload = false));
    await page.waitForTimeout(2500);
    const during = await lv();
    ok(during.out > 0.01, `le son continue (sortie ${during.out.toFixed(3)})`);
    ok(during.reverb < 1e-4, `reverb coupée (${during.reverb})`);
    ok(during.delay > 0.0005, `le delay, plus léger, reste actif (${during.delay.toFixed(4)})`);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].fx);
    ok(kept.room === 0.6 && kept.roomSize === 4, 'réglages du projet inchangés');
    await page.waitForFunction(() => SS.audioWatch.relief().slice(-1)[0].ok === true, null, { timeout: 6000 });
    ok(true, 'bilan : dernière étape jugée efficace');

    await page.click('#systemBtn');
    await page.waitForSelector('#systemDialog[open]');
    ok((await page.getAttribute('#systemDiag', 'data-on')) === '1', 'fenêtre Système : allègements en cours');
    ok((await page.$$('#systemDiagList li')).length === 3, 'trois allègements listés');
    await page.screenshot({ path: path.join(OUT, 'audio-diag-panel.png') });
    const log = await page.evaluate(() => SS.audioWatch.debugLog());
    ok(log.startsWith('### STEPSEQ-DEBUG v1 ###') && log.includes('### FIN STEPSEQ-DEBUG ###'), 'journal : balises début / fin');
    ok(/ACTION\s+#1 Reverb de « Lead » raccourcie/.test(log) && /BILAN\s+#1 .* insuffisant/.test(log) && /BILAN\s+#3 .* efficace/.test(log) && !/Infinity/.test(log) && /MESURE/.test(log) && /\[lead\] « Lead »/.test(log), 'journal : actions, bilans, mesures et pistes');
    fs.writeFileSync(path.join(OUT, 'audio-diag-log.txt'), log);

    await page.click('#systemDiagRestore');
    await page.waitForTimeout(1500);
    const after = await lv();
    ok((await page.evaluate(() => SS.audioWatch.relief().length)) === 0, 'Rétablir : plus d\'allègement');
    ok(after.reverb > 0.001, `reverb revenue (${after.reverb.toFixed(3)})`);
    ok(await page.isHidden('#systemDiagRestore'), 'bouton Rétablir masqué');
    ok(!errors.length, 'aucune erreur JS' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  } finally {
    await browser.close();
    server.close();
  }
})();
