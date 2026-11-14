/*
 * Test de bout en bout : surveillance audio automatique (js/audiowatch.js) et fenêtre Système.
 *   node tests/e2e/audio-watch.js
 * 1. Delay de piste au feedback maximal : les répétitions s'éteignent (plus d'emballement).
 * 2. Un infini injecté dans une piste bloquait les filtres et coupait le son pour de bon : la surveillance le
 *    détecte, nomme la piste, répare seule, et le son revient ; notification, pastille et fenêtre l'expliquent.
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
      format: 'stepseq', version: 1, title: 'Surveillance', tempo: 120, bars: 1,
      tracks: [
        { id: 'lead', type: 'instrument', name: 'Lead écho', family: 'lead', instrument: 'syn_sub', category: 'lead', volume: 0.6, events, fx: { delay: 0.6, delayTime: '1/8', delayFeedback: 0.9 } },
        { id: 'bass', type: 'instrument', name: 'Basse', family: 'bass', instrument: 'syn_sub', category: 'bass', volume: 0.5, events: [{ step: 0, len: 16, notes: [36], vel: 0.7 }] },
      ],
      scenes: [], song: [],
    };
    await page.addInitScript((p) => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), song);
    await page.goto(origin + '/index.html');
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());

    // 1. feedback 90 % : avec l'ancien filtre résonant, la boucle dépassait un gain de 1 et s'emballait
    const peaks = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(750);
      peaks.push(await page.evaluate(() => SS.audio.probe().tracks.find((t) => t.id === 'lead').delay.peak));
    }
    ok(Math.max(...peaks) < 1.2, 'delay à 90 % de feedback : les répétitions restent sous contrôle (crête max ' + Math.max(...peaks).toFixed(2) + ')');
    const filterQ = await page.evaluate(() => { const b = SS.audio._bus({ id: 'lead' }); return b && true; });
    ok(filterQ, 'tranche de la piste disponible');
    ok(!(await page.evaluate(() => SS.audioWatch.state().incidents.some((x) => x.kind === 'runaway' || x.kind === 'nan'))), 'lecture normale : aucun emballement ni signal invalide signalé');

    // 2. un infini dans la piste « Basse » : les filtres biquad gardent le NaN pour toujours
    await page.evaluate(() => {
      const ctx = SS.audio.ensureCtx();
      const buf = ctx.createBuffer(1, 256, ctx.sampleRate);
      buf.getChannelData(0)[10] = Infinity;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(SS.audio._bus({ id: 'bass' }));
      src.start();
    });
    await page.waitForFunction(() => SS.audioWatch.state().incidents.some((x) => x.kind === 'nan'), null, { timeout: 4000 });
    const inc = await page.evaluate(() => SS.audioWatch.state().incidents.find((x) => x.kind === 'nan'));
    ok(/Piste « Basse »/.test(inc.detail), 'origine du signal invalide nommée : ' + inc.detail.slice(0, 90));
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => {
      const p = SS.audio.probe();
      return { bad: p.masterIn.bad + p.tracks.reduce((n, t) => n + t.bus.bad, 0), out: p.out.peak };
    });
    ok(after.bad === 0, 'réparation automatique : plus aucun signal invalide dans les pistes et le Master');
    ok(after.out > 0.001, 'le son est revenu en sortie (crête ' + after.out.toFixed(3) + ')');
    ok(await page.evaluate(() => /Réparé automatiquement/.test(SS.audioWatch.state().incidents.find((x) => x.kind === 'nan').fixed || '')), 'incident marqué « réparé automatiquement »');
    ok(/Signal invalide/.test(await page.locator('#toast').textContent()), 'notification affichée pendant la lecture');
    ok(await page.locator('#toast .toast-action').count() === 1, 'la notification propose d’ouvrir le diagnostic');
    ok(await page.locator('#systemBtn.has-alert').count() === 1, 'pastille d’alerte sur le bouton Système');

    // 3. fenêtre Système : verdict, incident expliqué, poids, réparation à la demande
    await page.click('#toast .toast-action');
    ok(await page.isVisible('#systemDialog[open]'), 'la notification ouvre la fenêtre Système');
    ok(await page.locator('#systemVerdict').getAttribute('data-level') === 'bad', 'verdict : problème détecté');
    ok(await page.locator('#systemBtn.has-alert').count() === 0, 'pastille effacée une fois les incidents vus');
    const first = page.locator('#systemIncidents .sys-inc[data-kind="nan"]');
    ok(await first.count() === 1, 'incident listé');
    ok(/Réparé automatiquement/.test(await first.textContent()), 'l’incident indique la réparation');
    ok((await page.locator('#systemLoad li').count()) >= 2, 'poids estimé des éléments de la chanson affiché');
    ok(/Lead écho/.test(await page.locator('#systemLoad').textContent()), 'les pistes sont nommées dans le poids estimé');
    ok((await page.locator('[data-metric="ramFree"]').count()) === 1, 'détails techniques conservés');
    await page.screenshot({ path: path.join(OUT, 'stepseq-audiowatch-desktop.png') });
    await page.click('#systemRepair');
    ok(/Son réparé/.test(await page.locator('#toast').textContent()), 'bouton Réparer le son');
    ok(await page.evaluate(() => SS.audio.isPlaying()), 'la lecture continue après réparation');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#systemCopy');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    ok(/Incidents détectés/.test(copied) && /Signal invalide/.test(copied) && /Poids estimé/.test(copied), 'le rapport copié contient incidents et poids');
    await page.click('#systemClearIncidents');
    ok(/Aucun incident/.test(await page.locator('#systemIncidents').textContent()), 'Effacer vide la liste');
    await page.click('#systemClose');

    // 4. mobile : la nouvelle fenêtre tient dans l'écran
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', (e) => errors.push(e.message));
    await mobile.addInitScript((p) => localStorage.setItem('stepseq.autosave', JSON.stringify(p)), song);
    await mobile.goto(origin + '/index.html');
    await mobile.click('#systemBtn');
    const layout = await mobile.evaluate(() => {
      const d = document.querySelector('#systemDialog'), r = d.getBoundingClientRect();
      const body = document.querySelector('.system-body');
      return { fits: r.left >= 0 && r.right <= innerWidth, overflow: body.scrollWidth > body.clientWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    ok(layout.fits && !layout.overflow && !layout.pageOverflow, 'mobile 375 px : fenêtre sans débordement');
    ok(await mobile.locator('#systemVerdict').getAttribute('data-level') === 'idle', 'avant la lecture : verdict « Prêt »');
    await mobile.screenshot({ path: path.join(OUT, 'stepseq-audiowatch-mobile.png') });
    ok(!errors.length, 'aucune erreur JavaScript : ' + errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
})();
