/*
 * Mesure de la vitesse de l'appli, étape par étape, avec les fonctions qui coûtent le plus.
 *   node tests/e2e/perf-profile.js            (environ 3 min ; CPU_SLOWDOWN=4 pour simuler un PC plus lent)
 * Étapes : chargement, fenêtre Nouvelle piste, assistant Nouvelle chanson (ouverture, style, chaque étape),
 * création dans la grille, lecture de la chanson (fluidité de l'écran), rendu audio hors temps réel, puis coût
 * du moteur audio piste par piste (ms de calcul par seconde de son : au-delà de 1000, le son coupe).
 * Pour chaque étape : durée réelle (jusqu'à l'affichage), temps JS / mise en page / styles, et les 6 fonctions
 * les plus coûteuses (profileur Chrome, temps propre).
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
const SLOW = +process.env.CPU_SLOWDOWN || 1;
const TOP = +process.env.TOP || 6;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
    ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}),
  });
  const rows = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: !!proxy });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    if (SLOW > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('perf.init')) {
        sessionStorage.setItem('perf.init', '1');
        localStorage.clear();
        localStorage.setItem('stepseq.autosave', JSON.stringify({ format: 'stepseq', version: 1, title: 'Perf', tempo: 110, bars: 1, tracks: [], scenes: [], song: [] }));
        localStorage.setItem('ss.diagMode', '0');
      }
    });
    page.setDefaultTimeout(60000);

    const metrics = async () => {
      const m = {};
      for (const x of (await cdp.send('Performance.getMetrics')).metrics) m[x.name] = x.value;
      return m;
    };
    // temps propre par fonction (ms), à partir d'un profil CPU
    const topFns = (profile) => {
      const self = new Map();
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const dt = profile.timeDeltas;
      for (let i = 0; i < profile.samples.length; i++) {
        const n = byId.get(profile.samples[i]);
        const f = n.callFrame;
        const file = f.url ? f.url.split('/').pop().split('?')[0] : '';
        const key = f.functionName === '(program)' || f.functionName === '(idle)' || f.functionName === '(garbage collector)' ? f.functionName : `${f.functionName || '(anonyme)'} ${file}${file ? ':' + (f.lineNumber + 1) : ''}`;
        self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
      }
      return [...self].filter(([k]) => k !== '(idle)' && k !== '(program)').sort((a, b) => b[1] - a[1]).slice(0, TOP);
    };
    const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

    async function step(name, fn) {
      const m0 = await metrics();
      await cdp.send('Profiler.start');
      const t0 = Date.now();
      const extra = await fn();
      await frame();
      const wall = Date.now() - t0;
      const { profile } = await cdp.send('Profiler.stop');
      const m1 = await metrics();
      const d = (k) => Math.round((m1[k] - m0[k]) * 1000);
      const row = { name, wall, js: d('ScriptDuration'), layout: d('LayoutDuration'), style: d('RecalcStyleDuration'), top: topFns(profile), extra };
      rows.push(row);
      console.log(`\n== ${name} : ${wall} ms (JS ${row.js}, mise en page ${row.layout}, styles ${row.style})${extra ? ' ' + JSON.stringify(extra) : ''}`);
      for (const [k, v] of row.top) console.log(`   ${v.toFixed(0).padStart(5)} ms  ${k}`);
      return row;
    }

    // ---- 1. chargement
    await step('Chargement de la page', async () => {
      await page.goto(`http://localhost:${server.address().port}/index.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.StepSeq && window.SS && SS.ui);
      return await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return { DOMContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), scripts: document.scripts.length };
      });
    });

    // ---- 2. fenêtre Nouvelle piste (bibliothèque d'instruments)
    await step('Fenêtre Nouvelle piste', async () => {
      page.evaluate(() => { window.__dlg = SS.ui.openTrackDialog(); });
      await page.waitForSelector('#dlgRoles button[data-v="synth"]', { state: 'visible' });
    });
    await step('  rôle Synthé (liste de sons)', async () => {
      await page.click('#dlgRoles button[data-v="synth"]');
      await page.waitForSelector('#dlgSndList .pl-item');
      return { sons: await page.locator('#dlgSndList .pl-item').count() };
    });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const b = document.getElementById('dlgCancel'); if (b && b.offsetParent) b.click(); });
    await page.waitForTimeout(300);

    // ---- 3. assistant Nouvelle chanson
    const call = (expr) => page.evaluate(expr);
    await step('Assistant : ouverture', () => call(() => { StepSeq.assistantOuvrir(); }));
    await step('Assistant : style synthwave', () => call(() => { StepSeq.assistantStyle({ style: 'synthwave' }); }));
    for (const e of ['instruments', 'tempo', 'scenes', 'accords', 'arrangement', 'effets', 'mix', 'integration'])
      await step(`Assistant : étape ${e}`, () => call((x) => { StepSeq.assistantEtape({ etape: x }); }, e));
    await step('Assistant : nouvelle mélodie', () => call(() => { StepSeq.assistantMelodie(); }));
    await step('Créer la chanson dans la grille', () =>
      call(() => {
        StepSeq.assistantCreer();
        return { pistes: document.querySelectorAll('#tracks .track').length };
      })
    );
    await page.waitForTimeout(1500);

    // ---- 4. lecture de la chanson : fluidité de l'écran pendant 12 s
    await step('Lecture 12 s (grille)', async () => {
      await call(() => {
        window.__frames = [];
        window.__long = [];
        new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask' });
        let last = performance.now();
        const loop = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 100000 && !window.__stopFrames) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
        StepSeq.jouer({ chanson: true });
      });
      await page.waitForTimeout(12000);
      return await call(() => {
        window.__stopFrames = true;
        StepSeq.stop();
        const f = window.__frames.slice(5).sort((a, b) => a - b);
        const q = (p) => Math.round(f[Math.floor(f.length * p)] || 0);
        return { images: f.length, medianeMs: q(0.5), p95ms: q(0.95), pireMs: Math.round(f[f.length - 1] || 0), saccades50ms: f.filter((x) => x > 50).length, tachesLongues: window.__long.length, tachesLonguesMs: Math.round(window.__long.reduce((a, b) => a + b, 0)) };
      });
    });

    // ---- 5. moteur audio : rendu hors temps réel de 20 s de la chanson (ms de calcul par seconde de son)
    await step('Rendu audio 20 s', () =>
      call(async () => {
        const p = SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave')));
        const t0 = performance.now();
        await SS.render.renderOnce(JSON.stringify(p), { seconds: 20, sampleRate: 48000, seed: 1 }, {});
        const ms = performance.now() - t0;
        return { msParSecondeDeSon: Math.round(ms / 20), chargeTempsReel: Math.round(ms / 200) + ' %' };
      })
    );

    // ---- 6. qui coûte dans le moteur audio : chaque piste seule, puis sans le mastering et sans les effets communs
    const parts = await call(async () => {
      const base = SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave')));
      const SEC = 8;
      const time = async (p) => {
        const marks = [];
        const t0 = performance.now();
        await SS.render.renderOnce(JSON.stringify(p), { seconds: SEC, sampleRate: 48000, seed: 1 }, { onProgress: (f) => marks.push([f * SEC, performance.now() - t0]) });
        const end = performance.now() - t0;
        const a = marks[0] || [0, 0];
        return { dsp: Math.round((end - a[1]) / (SEC - a[0])), prep: Math.round(a[1]) };
      };
      const clone = () => JSON.parse(JSON.stringify(base));
      const out = [];
      out.push(['chanson entière', await time(clone())]);
      const nofx = clone();
      nofx.tracks.forEach((t) => { t.fx = null; });
      out.push(['sans effets de piste (chorus, delay, reverb, envois)', await time(nofx)]);
      const nomst = clone();
      if (nomst.master) { delete nomst.master.mastering; delete nomst.master.effects; }
      out.push(['sans effets/mastering du Master', await time(nomst)]);
      out.push(['aucune piste (Master et bus seuls)', await time({ ...clone(), tracks: [] })]);
      for (const t of base.tracks) {
        const p = clone();
        p.tracks = p.tracks.filter((x) => x.id === t.id);
        out.push([`piste seule : ${t.name} (${t.type === 'drum' ? 'batterie' : t.family + ' / ' + (t.instrument || '')})`, await time(p)]);
      }
      return out;
    });
    console.log('\n== Moteur audio, ms de calcul par seconde de son (dsp) et préparation avant la 1re note (prep) :');
    for (const [k, v] of parts) console.log(`   ${String(v.dsp).padStart(5)} ms/s  prep ${String(v.prep).padStart(5)} ms  ${k}`);
    rows.push({ name: 'audio par piste', parts });

    console.log(`\nCPU ralenti ×${SLOW} · erreurs de page : ${errors.length ? errors.join(' | ') : 'aucune'}`);
    if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(rows, null, 1));
  } finally {
    await browser.close();
    server.close();
  }
})();
