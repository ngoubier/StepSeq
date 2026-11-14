/*
 * Bloc Bruit du VCO, dans Chromium : rendu hors temps réel (bruit ajouté à l'oscillateur, bruit seul,
 * ancienne onde de bruit, silence), puis la fenêtre de sound design (couleurs, niveaux, résumé, code strudel).
 *   node tests/e2e/noise.js
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


/** Une note ; énergie, énergie des aigus (différence d'échantillons), amplitude à la fréquence de la note. */
async function render(browser, port, { sd, instrument = 'syn_sawbass', family = 'bass', midi = 48 }) {
  const p = await browser.newPage();
  await p.goto(`http://localhost:${port}/index.html`);
  const r = await p.evaluate(
    async ({ sd, instrument, family, midi }) => {
      const SR = 44100;
      window.AudioContext = class extends OfflineAudioContext {
        constructor() {
          super(1, SR, SR);
        }
      };
      SS.audio.ensureCtx();
      const ctx = SS.audio._master().context;
      const rec = ctx.createGain();
      rec.connect(ctx.destination);
      const track = { id: 'n-' + Math.random(), type: 'instrument', category: 'mono', family, instrument, sd };
      await SS.audio.playNote(track, midi, 0, 0.6, 0.6, rec);
      const x = (await ctx.startRendering()).getChannelData(0);
      const a = Math.round(0.1 * SR), b = Math.round(0.5 * SR);
      let e = 0, hi = 0;
      for (let i = a + 1; i < b; i++) {
        e += x[i] * x[i];
        hi += (x[i] - x[i - 1]) ** 2;
      }
      const f = 440 * Math.pow(2, (midi - 69) / 12), w = (2 * Math.PI * f) / SR;
      let re = 0, im = 0;
      for (let i = a; i < b; i++) {
        re += x[i] * Math.cos(w * (i - a));
        im += x[i] * Math.sin(w * (i - a));
      }
      return { e, bright: hi / Math.max(e, 1e-12), tone: (2 * Math.hypot(re, im)) / (b - a), nan: x.some((v) => !Number.isFinite(v)) };
    },
    { sd, instrument, family, midi }
  );
  await p.close();
  return r;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const open = { cutoff: 20000, env: 0, q: 0, attack: 0.003, decay: 0.1, sustain: 1, release: 0.05, wave: 'sawtooth' };

  const saw = await render(b, port, { sd: open });
  const mix = await render(b, port, { sd: { ...open, noise: 0.6 } });
  ok(mix.e > saw.e * 1.2 && mix.bright > saw.bright * 2, `saw + bruit blanc : plus d’énergie (×${(mix.e / saw.e).toFixed(2)}) et plus d’aigus (×${(mix.bright / saw.bright).toFixed(1)})`);
  ok(Math.abs(mix.tone / saw.tone - 1) < 0.15, `la note de l’oscillateur est toujours là (${(mix.tone / saw.tone).toFixed(2)} × sa fondamentale)`);
  const only = await render(b, port, { sd: { ...open, osc: 0, noise: 1 } });
  ok(only.tone < saw.tone * 0.15 && only.e > 0, `oscillateur coupé : bruit seul, plus de note (${(only.tone / saw.tone).toFixed(3)})`);
  const legacy = await render(b, port, { sd: { ...open, wave: 'white' } });
  ok(Math.abs(legacy.e / only.e - 1) < 0.25, `ancienne onde « white » = oscillateur coupé + bruit à fond (${(legacy.e / only.e).toFixed(2)})`);
  const pink = await render(b, port, { sd: { ...open, osc: 0, noise: 1, noiseColor: 'pink' } });
  const brown = await render(b, port, { sd: { ...open, osc: 0, noise: 1, noiseColor: 'brown' } });
  ok(only.bright > pink.bright && pink.bright > brown.bright, `couleurs : blanc > rose > brun en aigus (${only.bright.toFixed(2)}, ${pink.bright.toFixed(2)}, ${brown.bright.toFixed(3)})`);
  const wind = await render(b, port, { sd: { cutoff: 20000, env: 0, attack: 0.003, sustain: 1 }, instrument: 'syn_wind', family: 'fx' });
  ok(wind.e > 0 && wind.tone < saw.tone * 0.15, 'preset Wind : bruit sans note');
  const silent = await render(b, port, { sd: { ...open, osc: 0, noise: 0 } });
  ok(silent.e < 1e-6 && !silent.nan && ![saw, mix, only, legacy, pink, brown, wind].some((x) => x.nan), 'tout coupé : silence, aucune valeur invalide');

  // Fenêtre de sound design
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__t = { id: 'sd1', type: 'instrument', name: 'Basse', category: 'mono', family: 'bass', instrument: 'syn_sawbass', octave: 2, events: [] };
    SS.soundDesign.open(window.__t);
  });
  await page.click('#sdTabs [data-tab="vco"]');
  const state = () => page.textContent('#sdState_vco');
  ok((await page.$$eval('#sdWaves button', (bs) => bs.map((x) => x.dataset.v))).join() === 'sawtooth,square,pulse,triangle,sine,supersaw', 'formes d’onde sans bruit');
  ok((await state()) === 'Saw', `résumé : ${await state()}`);
  await page.click('#sdNoiseColor [data-v="pink"]');
  let sd = await page.evaluate(() => window.__t.sd);
  ok(sd.noiseColor === 'pink' && sd.noise === 0.3, 'Rose : couleur choisie et niveau de départ 30 %');
  ok((await state()) === 'Saw · bruit rose 30 %', `résumé : ${await state()}`);
  await page.$eval('#sd_osc', (i) => {
    i.value = 0;
    i.dispatchEvent(new Event('input'));
  });
  ok((await state()) === 'Bruit rose', `oscillateur coupé, résumé : ${await state()}`);
  ok(await page.$eval('#sdWaves', (e) => e.classList.contains('dim')), 'formes d’onde grisées');
  ok((await page.textContent('#sdCode')).startsWith('s("pink")'), `code strudel : ${(await page.textContent('#sdCode')).slice(0, 30)}`);
  await page.click('#sdWaves [data-v="square"]');
  sd = await page.evaluate(() => window.__t.sd);
  ok(sd.osc === undefined && sd.wave === 'square', 'choisir une onde remet l’oscillateur');
  await page.click('#sdNoiseColor [data-v="white"]');
  ok(/noise\(0\.3\)/.test(await page.textContent('#sdCode')), 'bruit blanc mélangé : noise(0.3) dans le code strudel');
  const over = await page.$eval('#soundDialog .fx-panes', (e) => e.scrollHeight - e.clientHeight);
  ok(over <= 1, `onglet VCO sans défilement (${over})`);
  ok(errs.length === 0, `aucune erreur JS (${errs.join(' | ')})`);
  await b.close();
  server.close();
})();
