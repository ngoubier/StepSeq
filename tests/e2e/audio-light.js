/*
 * Test de bout en bout : mode allégé (SS.audio.setLight, js/audiowatch.js, fenêtre Système).
 *   node tests/e2e/audio-light.js
 * 1. Une surcharge détectée pendant la lecture coupe temporairement effets, reverbs, bus partagés, tranches,
 *    effets du Master et mastering : le son continue, les étages d'effet se taisent, le projet est inchangé.
 * 2. À l'arrêt de la lecture, tout est rétabli. 3. Bouton « Alléger maintenant » / « Rétablir les effets ».
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
      format: 'stepseq', version: 1, title: 'Allégé', tempo: 120, bars: 1,
      tracks: [
        { id: 'lead', type: 'instrument', name: 'Lead', family: 'lead', instrument: 'syn_sub', category: 'lead', volume: 0.6, events, fx: { delay: 0.5, delayTime: '1/8', delayFeedback: 0.5, room: 0.6, roomSize: 2.5, chorus: 0.5, sendHall: 0.5, sendEcho: 0.4 }, mix: { comp: { on: true, th: -24, ratio: 4 }, lim: { on: true, ceil: -3 } } },
        { id: 'bass', type: 'instrument', name: 'Basse', family: 'bass', instrument: 'syn_sub', category: 'bass', volume: 0.5, events: [{ step: 0, len: 16, notes: [36], vel: 0.7 }] },
      ],
      scenes: [], song: [],
    };
    await page.addInitScript((p) => {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      localStorage.setItem('ss.diagMode', '0'); // ce test vise le mode allégé direct (sans le mode Diagnostic)
    }, song);
    await page.goto(origin + '/index.html');
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());
    await page.waitForTimeout(1500);
    const fxLevels = () => page.evaluate(() => {
      const s = SS.audio.probe();
      const lead = s.tracks.find((t) => t.id === 'lead');
      return { out: s.out.peak, delay: lead.delay ? lead.delay.peak : 0, reverb: lead.reverb ? lead.reverb.peak : 0, hall: s.returns.hall.peak, echo: s.returns.echo.peak, light: s.light };
    });
    const before = await fxLevels();
    ok(before.reverb > 0.001 && before.delay > 0.001 && before.hall > 0.0005, `effets audibles avant (reverb ${before.reverb.toFixed(3)}, delay ${before.delay.toFixed(3)}, hall ${before.hall.toFixed(4)})`);

    // 1. surcharge simulée : le navigateur signale des décrochages
    await page.evaluate(() => {
      const probe = SS.audio.probe;
      window.__overload = true;
      SS.audio.probe = () => {
        const s = probe();
        if (s && window.__overload) s.render = { average: 0.97, peak: 1, underrun: 0.05, at: performance.now() };
        return s;
      };
    });
    await page.waitForFunction(() => SS.audio.isLight(), null, { timeout: 3000 });
    await page.evaluate(() => (window.__overload = false));
    ok(true, 'surcharge détectée : mode allégé activé automatiquement');
    const toast = await page.textContent('#toast');
    ok(/effets, reverbs, compression et mastering coupés/.test(toast), 'notification : ' + toast.trim());
    await page.waitForTimeout(3500); // fin des queues de reverb / delay
    const during = await fxLevels();
    ok(during.out > 0.01, `le son continue (sortie ${during.out.toFixed(3)})`);
    ok(during.reverb < 1e-4 && during.delay < 1e-4 && during.hall < 1e-4 && during.echo < 1e-4, `effets coupés (reverb ${during.reverb}, delay ${during.delay}, hall ${during.hall}, écho ${during.echo})`);
    ok(during.light === true, 'relevé : mode allégé signalé');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].fx.room);
    ok(kept === 0.6, 'les réglages du projet ne sont pas modifiés');

    await page.click('#systemBtn');
    await page.waitForSelector('#systemDialog[open]');
    ok((await page.getAttribute('#systemLight', 'data-on')) === '1', 'fenêtre Système : mode allégé actif');
    ok((await page.textContent('#systemLightBtn')).trim() === 'Rétablir les effets', 'bouton Rétablir les effets');
    ok(/Mode allégé/.test(await page.textContent('#systemIncidents')), 'incident « Mode allégé » listé');
    await page.screenshot({ path: path.join(OUT, 'audio-light-panel.png') });

    // 3. Rétablir à la main pendant la lecture : pas de nouvel allègement automatique dans cette lecture
    await page.click('#systemLightBtn');
    ok(!(await page.evaluate(() => SS.audio.isLight())), 'Rétablir : effets revenus');
    await page.waitForTimeout(1500);
    const after = await fxLevels();
    ok(after.reverb > 0.001 && after.delay > 0.001, `effets à nouveau audibles (reverb ${after.reverb.toFixed(3)}, delay ${after.delay.toFixed(3)})`);
    await page.evaluate(() => (window.__overload = true));
    await page.waitForTimeout(1200);
    ok(!(await page.evaluate(() => SS.audio.isLight())), 'après Rétablir, pas de nouvel allègement pendant cette lecture');
    await page.evaluate(() => (window.__overload = false));

    // Alléger maintenant (manuel) puis 2. l'arrêt ne rétablit que l'allègement automatique
    await page.click('#systemLightBtn');
    ok(await page.evaluate(() => SS.audio.isLight()), 'Alléger maintenant : actif');
    await page.click('#systemLightBtn');
    await page.click('#systemClose');
    await page.evaluate(() => (window.__overload = true));
    await page.click('#stop');
    await page.waitForFunction(() => !SS.audio.isPlaying());
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isLight(), null, { timeout: 3000 });
    ok(true, 'nouvelle lecture : l\'allègement automatique est de nouveau possible');
    await page.evaluate(() => (window.__overload = false));
    await page.click('#play'); // pause : l'allègement reste
    await page.waitForTimeout(1200);
    ok(await page.evaluate(() => SS.audio.isLight()), 'pause : mode allégé conservé');
    await page.click('#stop');
    await page.waitForFunction(() => !SS.audio.isLight(), null, { timeout: 3000 });
    ok(true, 'arrêt de la lecture : effets rétablis automatiquement');
    ok(await page.evaluate(() => SS.audio.probe().mastering), 'mastering rebranché');
    ok(!errors.length, 'aucune erreur JS' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  } finally {
    await browser.close();
    server.close();
  }
})();
