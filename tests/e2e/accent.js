/*
 * Accent et sous-oscillateur, dans Chromium : rendu hors temps réel (brillance, niveau, accents qui s'accumulent,
 * fréquence du sous-oscillateur), puis édition (fenêtre de la note, raccourci A, marques, enregistrement).
 *   node tests/e2e/accent.js
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

/** Notes [{ at, acc }] d'une basse (réglages sd) ; par note : énergie totale et énergie des aigus ; + amplitudes. */
async function render(browser, port, { sd, notes, midi = 45, freqs = [], probe = [0.1, 0.5] }) {
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', (e) => /resume/.test(e.message) || errs.push(e.message));
  await p.goto(`http://localhost:${port}/index.html`);
  const r = await p.evaluate(
    async ({ sd, notes, midi, freqs, probe }) => {
      const SR = 44100;
      const LEN = Math.max(...notes.map((n) => n.at + (n.dur || 0.1))) + 0.5;
      window.AudioContext = class extends OfflineAudioContext {
        constructor() {
          super(1, Math.ceil(SR * LEN), SR);
        }
      };
      SS.audio.ensureCtx();
      const ctx = SS.audio._master().context;
      const rec = ctx.createGain();
      rec.connect(ctx.destination);
      const track = { id: 'acc-' + Math.random(), type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_sawbass', sd };
      for (const n of notes) await SS.audio.playNote(track, midi, n.at, n.dur || 0.1, 0.6, rec, 0, 1, n.acc ? { acc: true } : null);
      const x = (await ctx.startRendering()).getChannelData(0);
      const per = notes.map((n) => {
        const a = Math.round(n.at * SR), b = Math.round((n.at + 0.1) * SR);
        let e = 0, hi = 0;
        for (let i = a + 1; i < b; i++) {
          e += x[i] * x[i];
          hi += (x[i] - x[i - 1]) ** 2;
        }
        return { e, hi };
      });
      const s0 = Math.round(probe[0] * SR), n = Math.round((probe[1] - probe[0]) * SR);
      const amp = freqs.map((f) => {
        const w = (2 * Math.PI * f) / SR;
        let re = 0, im = 0;
        for (let i = 0; i < n; i++) {
          re += x[s0 + i] * Math.cos(w * i);
          im += x[s0 + i] * Math.sin(w * i);
        }
        return (2 * Math.hypot(re, im)) / n;
      });
      return { per, amp, nan: x.some((v) => !Number.isFinite(v)) };
    },
    { sd, notes, midi, freqs, probe }
  );
  await p.close();
  r.errs = errs;
  return r;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const acid = { cutoff: 300, env: 1.5, q: 4, fdecay: 0.25, fsustain: 0.3, attack: 0.003, decay: 0.2, sustain: 0.7, release: 0.03, accent: 0.8 };

  // 1. Une note accentuée contre une note normale : plus forte et plus brillante
  const plain = await render(b, port, { sd: acid, notes: [{ at: 0.05 }] });
  const accent = await render(b, port, { sd: acid, notes: [{ at: 0.05, acc: true }] });
  const brightness = (x) => x.hi / x.e;
  ok(!accent.nan && !accent.errs.length, 'rendu sans erreur' + (accent.errs.length ? ' ' + accent.errs.join() : ''));
  ok(accent.per[0].e > plain.per[0].e * 1.5, `accent plus fort : énergie ×${(accent.per[0].e / plain.per[0].e).toFixed(2)}`);
  ok(brightness(accent.per[0]) > brightness(plain.per[0]) * 1.5, `accent plus brillant : aigus ×${(brightness(accent.per[0]) / brightness(plain.per[0])).toFixed(2)}`);
  const off = await render(b, port, { sd: { ...acid, accent: 0 }, notes: [{ at: 0.05, acc: true }] });
  ok(Math.abs(off.per[0].e / plain.per[0].e - 1) < 0.05, `force de l'accent à 0 : aucun effet (×${(off.per[0].e / plain.per[0].e).toFixed(3)})`);

  // 2. Accents rapprochés : le filtre monte d'un accent à l'autre ; après une pause, il repart d'en bas
  const run = await render(b, port, { sd: acid, notes: [0.05, 0.2, 0.35, 0.5, 2.0].map((at) => ({ at, acc: true })) });
  const br = run.per.map(brightness);
  ok(br[3] > br[0] * 1.3, `accents qui s'accumulent : brillance ${br.slice(0, 4).map((v) => v.toFixed(3)).join(' → ')}`);
  ok(br[4] < br[3] * 0.85, `après une pause, la mémoire s'est vidée (${br[4].toFixed(3)} contre ${br[3].toFixed(3)})`);

  // 3. Sous-oscillateur : une octave (ou deux) sous la note
  const open = { cutoff: 20000, env: 0, q: 0, attack: 0.003, decay: 0.1, sustain: 1, release: 0.05, wave: 'sawtooth' };
  const f = 440 * Math.pow(2, (48 - 69) / 12);
  const s0 = await render(b, port, { sd: open, notes: [{ at: 0, dur: 0.7 }], midi: 48, freqs: [f / 2, f / 4, f], probe: [0.05, 0.65] });
  const s1 = await render(b, port, { sd: { ...open, sub: 0.8 }, notes: [{ at: 0, dur: 0.7 }], midi: 48, freqs: [f / 2, f / 4, f], probe: [0.05, 0.65] });
  const s2 = await render(b, port, { sd: { ...open, sub: 0.8, subOct: 2 }, notes: [{ at: 0, dur: 0.7 }], midi: 48, freqs: [f / 2, f / 4, f], probe: [0.05, 0.65] });
  // amplitudes rapportées à la fondamentale de la note
  const rel = (x, k) => x.amp[k] / x.amp[2];
  ok(rel(s0, 0) < 0.05 && rel(s1, 0) > 0.8, `sous-oscillateur −1 oct : ${rel(s1, 0).toFixed(2)} × la fondamentale à ${(f / 2).toFixed(1)} Hz (sans : ${rel(s0, 0).toFixed(3)})`);
  ok(rel(s2, 1) > 0.8 && rel(s2, 0) < 0.1, `sous-oscillateur −2 oct : ${rel(s2, 1).toFixed(2)} × la fondamentale à ${(f / 4).toFixed(1)} Hz, ${rel(s2, 0).toFixed(3)} à ${(f / 2).toFixed(1)} Hz`);

  // 4. Édition : fenêtre de la note, raccourci A, marques dorées, enregistrement
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.evaluate(() => {
    const p = SS.newProject();
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_acidsub', name: 'Acid' }, p);
    t.events = [0, 4, 8, 12].map((step) => ({ step, len: 2, notes: [36], vel: 0.7 }));
    p.tracks.push(t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events.map((e) => !!e.acc));
  await page.click('.track .cell[data-step="4"]', { button: 'right' });
  await page.waitForTimeout(200);
  const btn = page.locator('.ctx-picker .ctx-acc');
  ok((await btn.count()) === 1 && (await btn.textContent()) === 'Non', 'fenêtre de la note : bouton Accent');
  await btn.click();
  await page.waitForTimeout(500);
  ok((await btn.getAttribute('aria-pressed')) === 'true', 'bouton Accent enfoncé');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await saved()) === '[false,true,false,false]', `note du pas 5 accentuée : ${JSON.stringify(await saved())}`);
  ok((await page.locator('.track .cell[data-step="4"] .acc-mark').count()) === 1, 'liseré doré sur la note');
  ok(/accent/.test(await page.getAttribute('.track .cell[data-step="4"]', 'title')), 'infobulle : « accent »');
  // sélection de toutes les notes puis A : toutes accentuées, puis A à nouveau : plus aucune
  await page.keyboard.press('Control+a');
  await page.keyboard.press('a');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await saved()) === '[true,true,true,true]', `A : toutes accentuées ${JSON.stringify(await saved())}`);
  await page.keyboard.press('a');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await saved()) === '[false,false,false,false]', `A à nouveau : accents retirés ${JSON.stringify(await saved())}`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await saved()) === '[true,true,true,true]', 'Ctrl+Z : les accents reviennent');

  // 5. Sound design : sous-oscillateur et force de l'accent
  const sd = await page.evaluate(() => {
    const t = { id: 'x', type: 'instrument', name: 'B', category: 'mono', family: 'bass', instrument: 'syn_sawbass', octave: 2, events: [] };
    SS.soundDesign.open(t);
    const row = (id) => document.querySelector('#' + id).closest('.sd-row');
    return { sub: !row('sd_sub').hidden, subDim: row('sd_subOct').classList.contains('dim'), accent: document.querySelector('output[for="sd_accent"]').textContent };
  });
  ok(sd.sub && sd.subDim && sd.accent === '60 %', `sound design : sous-oscillateur, octave grisée tant qu'il est coupé, accent ${sd.accent}`);
  ok(!errs.length, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
