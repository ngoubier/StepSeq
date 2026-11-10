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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos/train-de-nuit.stepseq.json'), 'utf8'));
    demo.tracks = demo.tracks.slice(0, 2);
    demo.tracks.forEach(t => { t.mix = { eq: { on: false }, comp: { on: false }, lim: { on: false } }; });
    await page.addInitScript(p => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), demo);
    await page.goto(`http://localhost:${server.address().port}/index.html`);
    await page.click('#mixerBtn');
    const reuse = await page.evaluate(() => {
      const track = JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0];
      let scheduled = 0, curves = 0;
      const schedule = AudioParam.prototype.setTargetAtTime;
      const descriptor = Object.getOwnPropertyDescriptor(WaveShaperNode.prototype, 'curve');
      AudioParam.prototype.setTargetAtTime = function(...args) { scheduled++; return schedule.apply(this, args); };
      Object.defineProperty(WaveShaperNode.prototype, 'curve', { ...descriptor, set(v) { curves++; descriptor.set.call(this, v); } });
      try { for (let i = 0; i < 100; i++) SS.audio.applyMix(track); }
      finally {
        AudioParam.prototype.setTargetAtTime = schedule;
        Object.defineProperty(WaveShaperNode.prototype, 'curve', descriptor);
      }
      SS.mixer.refreshMasterAction({ track: track.id, module: 'comp', changes: [{ path: 'mix.comp.ratio', to: 3 }] });
      const canvas = document.querySelector('#mixerDetail .comp-graph');
      const row = document.querySelector('#mixerDetail [data-control="mix.comp.ratio"]');
      for (let i = 0; i < 20; i++) SS.mixer.refreshMasterAction({ track: track.id, module: 'comp', changes: [{ path: 'mix.comp.ratio', to: 3 }] });
      const stable = canvas === document.querySelector('#mixerDetail .comp-graph') && row === document.querySelector('#mixerDetail [data-control="mix.comp.ratio"]');
      SS.mixer.showPilotAction();
      return { scheduled, curves, stable };
    });
    ok(reuse.curves === 0, 'aucune recopie de courbe de limiteur pour un réglage inchangé');
    ok(reuse.scheduled <= 100, '100 applications identiques : pas de nouvelle automatisation des inserts (' + reuse.scheduled + ')');
    ok(reuse.stable, 'les gestes du pilote réutilisent les contrôles et canvas');
    for (const button of ['#amAssistantBtn', '#amPilotBtn']) {
      await page.click(button);
      await page.waitForFunction(() => SS.audio.isPlaying());
      await page.evaluate(() => { window.__frames = 0; window.__off = SS.automixListen.subscribe(() => window.__frames++); });
      await page.waitForTimeout(2200);
      const state = await page.evaluate(() => { window.__off(); return { frames: window.__frames, secs: SS.automixListen.secs(), playing: SS.audio.isPlaying() }; });
      ok(state.frames >= 8 && state.frames <= 26, button + ' : cadence mobile limitée à 10 Hz (' + state.frames + ' relevés)');
      ok(state.playing && state.secs > 1, button + ' : lecture et mesures actives');
    }
    // Isoler ici les traitements : l’équilibrage des faders possède son propre scénario.
    await page.evaluate(() => { SS.automixPilot.plan = () => ({ state: { balanced: true, waiting: [] } }); });
    await page.waitForFunction(() => SS.automixPanel._state().pilot.ramp?.master?.module === 'comp', {}, { timeout: 35000 });
    await page.evaluate(() => { window.__comp = document.querySelector('#mixerDetail .comp-graph'); });
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => window.__comp === document.querySelector('#mixerDetail .comp-graph')), 'compression en cours : canvas conservé pendant le geste réel');
    await page.waitForFunction(() => SS.automixPanel._state().pilot.trackDone.size > 0, {}, { timeout: 15000 });
    await page.waitForTimeout(800); // sauvegarde différée après la fin du geste
    ok(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('stepseq.autosave')); return p.tracks[0].mix.eq.on && p.tracks[0].mix.comp.on; }), 'piste traitée : EQ et compression appliqués après écoute sur mobile');
    await page.click('#mxClose');
    ok(await page.evaluate(() => !SS.automixListen.listening()), 'fermeture : analyse arrêtée');
    ok(!errors.length, 'aucune erreur JavaScript : ' + errors.join(' | '));
  } finally { await browser.close(); server.close(); }
})();
