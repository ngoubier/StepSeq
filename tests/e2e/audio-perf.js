/*
 * Test de bout en bout : économies de calcul du moteur audio.
 *   node tests/e2e/audio-perf.js
 * 1. Synthé Juno en veille quand il ne joue rien : rendu bien plus rapide, et il rejoue normalement ensuite.
 * 2. Mute : la tranche de la piste sort réellement du mix (plus tirée par le Master), et y revient.
 * 3. Latence « Lecture sûre » : choisie dans la fenêtre Système, appliquée après rechargement, chanson conservée.
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
    const song = {
      format: 'stepseq', version: 1, title: 'Économies', tempo: 120, bars: 2,
      tracks: [
        { id: 'juno', type: 'instrument', name: 'Juno', family: 'analog', instrument: 'juno106', category: 'mono', volume: 0.6, juno: { chorus: 1 }, events: [{ step: 0, len: 2, notes: [48], vel: 0.9 }] },
        { id: 'bass', type: 'instrument', name: 'Basse', family: 'bass', instrument: 'syn_sub', category: 'bass', volume: 0.5, events: [{ step: 0, len: 32, notes: [36], vel: 0.7 }], mix: { comp: { on: true, th: -20, ratio: 4 } } },
      ],
      scenes: [], song: [],
    };
    await page.addInitScript((p) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('stepseq.autosave', JSON.stringify(p)); sessionStorage.setItem('seeded', '1'); } }, song);
    await page.goto(origin + '/index.html');

    // 1. Juno en veille : 8 moteurs pendant 20 s, sans note puis avec une note tenue chacun (rendu hors ligne)
    const cost = await page.evaluate(async () => {
      const run = async (withNotes) => {
        const off = new OfflineAudioContext(2, 48000 * 20, 48000);
        await SS.juno.load(off);
        for (let i = 0; i < 8; i++) {
          const events = withNotes ? [{ type: 'on', id: i + 1, midi: 48 + i, vel: 0.8, time: 0 }] : [];
          new AudioWorkletNode(off, 'juno106', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { params: { chorus: 1 }, events } }).connect(off.destination);
        }
        const t0 = performance.now();
        const buf = await off.startRendering();
        return { ms: performance.now() - t0, peak: buf.getChannelData(0).reduce((m, v) => Math.max(m, Math.abs(v)), 0) };
      };
      return { idle: await run(false), busy: await run(true) };
    });
    ok(cost.busy.peak > 0.01 && cost.idle.peak === 0, `Juno : son quand il joue (crête ${cost.busy.peak.toFixed(2)}), silence exact au repos`);
    ok(cost.idle.ms < cost.busy.ms * 0.25, `Juno au repos ${Math.round(cost.idle.ms)} ms contre ${Math.round(cost.busy.ms)} ms en jeu (20 s, 8 synthés)`);

    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());
    // la note du Juno revient à chaque boucle (4 s), après sa mise en veille
    const bursts = await page.evaluate(async () => {
      let n = 0, on = false;
      const t0 = performance.now();
      while (performance.now() - t0 < 9000) {
        const l = SS.audio.levels('juno');
        const loud = !!l && l.peak > 0.01;
        if (loud && !on) n++;
        on = loud;
        await new Promise((r) => setTimeout(r, 40));
      }
      return n;
    });
    ok(bursts >= 2, `Juno : la note rejoue après la veille (${bursts} attaques en 9 s)`);

    // 2. Mute : sortie réelle du mix
    const bassMute = page.locator('.track').filter({ hasText: 'Basse' }).locator('.mute').first();
    await bassMute.click();
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => SS.audio._isCut('bass')), 'piste muette : tranche débranchée du mix');
    ok(await page.evaluate(() => SS.audio.levels('bass').peak) < 1e-4, 'piste muette : silence');
    await bassMute.click();
    await page.waitForTimeout(400);
    ok(!(await page.evaluate(() => SS.audio._isCut('bass'))), 'Mute retiré : tranche rebranchée');
    ok(await page.evaluate(() => SS.audio.levels('bass').peak) > 0.01, 'Mute retiré : la basse s’entend de nouveau');
    await bassMute.click();
    await page.waitForTimeout(300);
    await page.click('#stop');
    await page.waitForTimeout(100);
    ok(!(await page.evaluate(() => SS.audio._isCut('bass'))), 'à l’arrêt : tranche rouverte (bouton Écouter)');
    await bassMute.click();

    // 3. Latence
    ok(await page.evaluate(() => SS.audio.latency().active === 'interactive'), 'latence par défaut : réactive');
    await page.click('#systemBtn');
    await page.selectOption('#systemLatencySel', 'playback');
    await page.waitForTimeout(1200);
    ok(await page.isVisible('#systemLatencyReload'), 'changement de latence : bouton Recharger maintenant');
    await page.screenshot({ path: path.join(OUT, 'audio-perf-latency.png') });
    await Promise.all([page.waitForNavigation(), page.click('#systemLatencyReload')]);
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());
    const after = await page.evaluate(() => ({ lat: SS.audio.latency(), title: document.title, tracks: JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.length }));
    ok(after.lat.active === 'playback', 'après rechargement : moteur en « Lecture sûre »');
    ok(after.tracks === 2, 'chanson conservée après rechargement');
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => SS.audio.levels('bass').peak) > 0.01, 'lecture normale en « Lecture sûre »');
    ok(!errors.length, 'aucune erreur JS' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  } finally {
    await browser.close();
    server.close();
  }
})();
