/*
 * Test de bout en bout : panneau Auto Mix de la console (écoute, diagnostic, conseils, A/B, préférences).
 *   node tests/e2e/automix-modes.js
 * Joue une chanson Band synthwave en temps réel pendant une quinzaine de secondes.
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
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const origin = `http://localhost:${server.address().port}`;
    const song = { format: 'stepseq', version: 1, title: 'Diagnostic', tempo: 120, bars: 1, tracks: [{ id: 'synth-test', type: 'instrument', name: 'Basse', family: 'bass', instrument: 'syn_sub', category: 'bass', volume: 0.5, events: [{ step: 0, len: 4, notes: [48], vel: 0.7 }] }], scenes: [], song: [] };
    await page.addInitScript(p => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), song);
    await page.goto(origin + '/index.html');
    ok(await page.locator('#systemBtn').evaluate(e => e.previousElementSibling.textContent === 'Aide'), 'Système est placé juste après Aide');
    await page.click('#systemBtn');
    ok(await page.isVisible('#systemDialog[open]'), 'fenêtre Système accessible');
    ok(!await page.evaluate(() => SS.audio.isPlaying()), 'ouvrir le diagnostic ne lance pas la chanson');
    ok(await page.locator('[data-metric="ramFree"]').textContent() === 'Non accessible dans le navigateur', 'RAM système consommée et libre : aucune estimation trompeuse');
    ok((await page.locator('[data-metric="cpu"]').textContent()).includes('Non accessible'), 'charge CPU globale indiquée comme non accessible');
    await page.keyboard.press('Escape');
    ok(!await page.isVisible('#systemDialog'), 'Échap ferme la fenêtre');
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());
    const wav = Buffer.alloc(44 + 4000);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(4000, 40);
    await page.route('**/diagnostic.wav', route => route.fulfill({ body: wav, contentType: 'audio/wav' }));
    await page.route('**/diagnostic-index.json', route => route.fulfill({ json: { _base: origin + '/', diagnostic: ['diagnostic.wav'] } }));
    const memory = await page.evaluate(async () => {
      const source = SS.SOURCES.dirt;
      const track = { id: 'diagnostic-test', type: 'drum', source: 'dirt', bank: 'diagnostic', variant: 0 };
      const before = SS.audio.diagnostics();
      SS.SOURCES.dirt = '/diagnostic-index.json';
      try {
        await SS.audio.prepareTrack(track);
        const first = SS.audio.diagnostics();
        await SS.audio.prepareTrack(track);
        const second = SS.audio.diagnostics();
        return { before: before.bufferBytes, first: first.bufferBytes, second: second.bufferBytes, buffers: first.buffers - before.buffers };
      } finally { SS.SOURCES.dirt = source; }
    });
    ok(memory.first > memory.before && memory.buffers === 1, 'un son réellement décodé apparaît dans la mémoire audio');
    ok(memory.first === memory.second, 'un son partagé en cache est compté une seule fois');
    await page.click('#systemBtn');
    const before = await page.evaluate(() => SS.audio.diagnostics().scheduling.lateSteps);
    await page.evaluate(() => { const until = performance.now() + 350; while (performance.now() < until) {} });
    await page.waitForTimeout(1300);
    const after = await page.evaluate(() => SS.audio.diagnostics().scheduling.lateSteps);
    ok(after > before, 'un vrai blocage de 350 ms est repéré par la programmation audio');
    ok((await page.locator('#systemDiagnosis').textContent()).includes('pas programmés en retard'), 'les retards observés sont expliqués dans la fenêtre');
    ok(/(?:Mio|Kio)/.test(await page.locator('[data-metric="buffers"]').textContent()), 'mémoire audio décodée affichée');
    ok(await page.evaluate(() => SS.audio.isPlaying()), 'la chanson continue pendant le diagnostic');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#systemCopy');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    ok(copied.includes('StepSeq — Diagnostic Système') && copied.includes('RAM consommée / restante') && copied.includes('pas programmés en retard'), 'le rapport copié contient les mesures et leurs limites');
    await page.screenshot({ path: '/tmp/stepseq-system-desktop.png' });
    await page.evaluate(() => {
      const read = SS.audio.diagnostics;
      window.__reads = 0;
      SS.audio.diagnostics = () => { window.__reads++; return read(); };
    });
    await page.click('#systemClose');
    await page.waitForTimeout(1200);
    ok(await page.evaluate(() => window.__reads === 0), 'fermer arrête les relevés du panneau');
    await page.click('#stop');
    await page.click('#play');
    ok(await page.evaluate(() => SS.audio.diagnostics().scheduling.lateSteps === 0), 'nouvelle lecture : les anciens retards sont réinitialisés');
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => undefined });
      Object.defineProperty(performance, 'memory', { get: () => undefined });
      window.PerformanceObserver = undefined;
    });
    await mobile.goto(origin + '/index.html');
    await mobile.click('#systemBtn');
    ok((await mobile.locator('[data-metric="ram"]').textContent()).includes('Non accessible'), 'navigateur sans API RAM : message clair');
    ok((await mobile.locator('[data-metric="heapUsed"]').textContent()).includes('Non accessible'), 'navigateur sans API mémoire JavaScript : fonctionnement conservé');
    ok((await mobile.locator('[data-metric="blocks"]').textContent()).includes('indisponible'), 'navigateur sans observateur de blocages : fonctionnement conservé');
    const layout = await mobile.evaluate(() => {
      const d = document.querySelector('#systemDialog'), r = d.getBoundingClientRect();
      return { fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, overflow: d.scrollWidth > d.clientWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    ok(layout.fits && !layout.overflow && !layout.pageOverflow, 'mobile 375 px : fenêtre et page sans débordement');
    await mobile.screenshot({ path: '/tmp/stepseq-system-mobile.png' });
    await mobile.click('#systemClose');
    ok(!await mobile.isVisible('#systemDialog'), 'bouton de fermeture accessible sur mobile');
    ok(!errors.length, 'aucune erreur JavaScript : ' + errors.join(' | '));
  } finally { await browser.close(); server.close(); }
})();
