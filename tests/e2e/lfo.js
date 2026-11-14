/*
 * Onde Pulse (PWM) et LFO du synthé intégré, dans Chromium : rendu hors temps réel puis mesures
 * (harmoniques par Goertzel, niveau RMS par fenêtre, équilibre gauche / droite), et fenêtre de sound design.
 *   node tests/e2e/lfo.js
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

/** Rend une note du synthé intégré (réglages `sd`) dans un OfflineAudioContext ; renvoie des mesures. */
async function render(browser, port, sd, opts = {}) {
  const p = await browser.newPage();
  // (un OfflineAudioContext ne se « reprend » pas : erreur attendue de l'application, sans conséquence ici)
  p.on('pageerror', (e) => /resume/.test(e.message) || ok(false, 'erreur de page : ' + e.message));
  await p.goto(`http://localhost:${port}/index.html`);
  const res = await p.evaluate(
    async ({ sd, opts }) => {
      const SR = 44100;
      const LEN = opts.len || 2;
      window.AudioContext = class extends OfflineAudioContext {
        constructor() {
          super(2, SR * LEN, SR);
        }
      };
      SS.audio.ensureCtx();
      const ctx = SS.audio._master().context;
      if (sd.ftype === 'ladder' || sd.ftype === 'sem') await SS.filters.load(ctx);
      const track = { id: 'lfo-test', type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_sawbass', sd };
      const rec = ctx.createGain();
      rec.connect(ctx.destination);
      const midi = opts.midi || 45; // 110 Hz
      const errs = [];
      if (opts.legato) {
        // deux notes liées : la seconde prolonge la voix de la première (les LFO doivent suivre)
        await SS.audio.playNote(track, midi, 0, 0.6, 0.9, rec);
        try {
          await SS.audio.playNote(track, midi + 7, 0.55, LEN - 0.9, 0.9, rec);
        } catch (e) {
          errs.push(e.message);
        }
      } else await SS.audio.playNote(track, midi, 0, LEN - 0.3, 0.9, rec);
      const buf = await ctx.startRendering();
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const f0 = 440 * Math.pow(2, (midi - 69) / 12);
      // amplitude d'une harmonique sur une fenêtre (Goertzel, nombre entier de périodes)
      const harm = (k, s0, n) => {
        const w = (2 * Math.PI * k * f0) / SR;
        let re = 0, im = 0;
        for (let i = 0; i < n; i++) {
          re += L[s0 + i] * Math.cos(w * i);
          im += L[s0 + i] * Math.sin(w * i);
        }
        return (2 * Math.hypot(re, im)) / n;
      };
      const per = Math.round((SR / f0) * 10); // 10 périodes
      const win = Math.round(SR * 0.05);
      const rms = [];
      const h2 = [];
      const bal = [];
      for (let s0 = Math.round(0.2 * SR); s0 + win < (LEN - 0.4) * SR; s0 += win) {
        let a = 0, l = 0, r = 0;
        for (let i = 0; i < win; i++) {
          a += L[s0 + i] * L[s0 + i];
          l += Math.abs(L[s0 + i]);
          r += Math.abs(R[s0 + i]);
        }
        rms.push(Math.sqrt(a / win));
        h2.push(harm(2, s0, per) / (harm(1, s0, per) || 1e-9));
        bal.push((r - l) / (r + l || 1e-9));
      }
      const s0 = Math.round(0.5 * SR);
      return {
        h: [1, 2, 3, 4].map((k) => harm(k, s0, per)),
        rms,
        h2,
        bal,
        peak: L.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
        nan: L.some((v) => !Number.isFinite(v)),
        errs,
        tail: Math.sqrt(L.slice(Math.round(1.3 * SR), Math.round(1.5 * SR)).reduce((a, v) => a + v * v, 0) / (0.2 * SR)),
      };
    },
    { sd, opts }
  );
  await p.close();
  return res;
}
const spread = (a) => Math.max(...a) / Math.max(1e-9, Math.min(...a));
const OPEN = { cutoff: 20000, env: 0, q: 0, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05 };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const b = await chromium.launch();

  // 1. Pulse 50 % = carré : pas d'harmoniques paires
  let r = await render(b, port, { ...OPEN, wave: 'pulse', pw: 0.5 });
  ok(!r.nan && r.peak > 0.05, `Pulse 50 % : son produit (crête ${r.peak.toFixed(2)})`);
  ok(r.h[1] / r.h[0] < 0.05 && r.h[2] / r.h[0] > 0.25, `Pulse 50 % : H2/H1 ${(r.h[1] / r.h[0]).toFixed(3)}, H3/H1 ${(r.h[2] / r.h[0]).toFixed(2)}`);

  // 2. Pulse 25 % : la 4e harmonique disparaît, la 2e est forte
  r = await render(b, port, { ...OPEN, wave: 'pulse', pw: 0.25 });
  ok(r.h[3] / r.h[0] < 0.05 && r.h[1] / r.h[0] > 0.5, `Pulse 25 % : H2/H1 ${(r.h[1] / r.h[0]).toFixed(2)}, H4/H1 ${(r.h[3] / r.h[0]).toFixed(3)}`);

  // 3. PWM par le LFO : le contenu en harmonique 2 varie dans le temps
  r = await render(b, port, { ...OPEN, wave: 'pulse', pw: 0.5, lfo1Dest: 'pw', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 1.5, lfo1Amt: 0.8 });
  ok(Math.max(...r.h2) > 0.4 && Math.min(...r.h2) < 0.15, `PWM : H2/H1 varie de ${Math.min(...r.h2).toFixed(2)} à ${Math.max(...r.h2).toFixed(2)}`);
  const still = await render(b, port, { ...OPEN, wave: 'pulse', pw: 0.5 });
  ok(Math.max(...still.h2) < 0.08, `sans LFO : H2/H1 reste bas (${Math.max(...still.h2).toFixed(3)})`);

  // 4. LFO -> cutoff : le niveau varie (biquad 12 dB, puis ladder AudioWorklet)
  for (const ftype of ['12db', 'ladder']) {
    const base = { ...OPEN, wave: 'sawtooth', ftype, cutoff: 300, q: 1 };
    const flat = await render(b, port, base);
    const mod = await render(b, port, { ...base, lfo1Dest: 'cutoff', lfo1Shape: 'sine', lfo1Rate: 'hz', lfo1Hz: 2, lfo1Amt: 0.75 });
    ok(spread(flat.rms) < 1.2 && spread(mod.rms) > 2, `LFO -> cutoff (${ftype}) : écart de niveau ×${spread(mod.rms).toFixed(1)} (sans LFO ×${spread(flat.rms).toFixed(2)})`);
  }

  // 5. Calé sur le tempo : 1/8 à 120 (4 Hz) en carré -> palier toutes les 125 ms
  r = await render(b, port, { ...OPEN, wave: 'sawtooth', lfo1Dest: 'amp', lfo1Shape: 'square', lfo1Rate: 'n8', lfo1Mode: 'retrig', lfo1Amt: 1 });
  const lo = r.rms.filter((v) => v < Math.max(...r.rms) * 0.2).length;
  ok(spread(r.rms) > 5 && lo > r.rms.length * 0.3, `trémolo carré 1/8 : ${lo}/${r.rms.length} fenêtres quasi muettes`);

  // 6. LFO -> pan : le son passe de gauche à droite
  r = await render(b, port, { ...OPEN, wave: 'sawtooth', lfo2Dest: 'pan', lfo2Shape: 'triangle', lfo2Rate: 'hz', lfo2Hz: 1, lfo2Amt: 1 });
  ok(Math.min(...r.bal) < -0.5 && Math.max(...r.bal) > 0.5, `LFO -> pan : équilibre de ${Math.min(...r.bal).toFixed(2)} à ${Math.max(...r.bal).toFixed(2)}`);

  // 7. Fondu d'entrée : vibrato absent au début
  r = await render(b, port, { ...OPEN, wave: 'pulse', pw: 0.5, lfo1Dest: 'pw', lfo1Rate: 'hz', lfo1Hz: 3, lfo1Amt: 0.9, lfo1Fade: 1.2 });
  ok(r.h2[0] < 0.3 && Math.max(...r.h2) > 0.6, `fondu d'entrée : PWM d'abord faible puis ample (${r.h2[0].toFixed(2)} … ${Math.max(...r.h2).toFixed(2)})`);

  // 8. Glide sur une onde Pulse : pas d'erreur, la largeur suit la hauteur
  r = await render(b, port, { ...OPEN, wave: 'pulse', pw: 0.25, glide: 0.3 }, { midi: 57 });
  ok(!r.nan && r.peak > 0.05, 'Pulse + glide : rendu sans erreur');

  // 8 bis. Glide legato : la voix prolongée garde ses LFO (pas d'erreur, le son continue après la 1re note)
  r = await render(b, port, { ...OPEN, wave: 'pulse', pw: 0.4, glide: 0.1, glideMode: 'legato', lfo1Dest: 'cutoff', lfo1Rate: 'n4', lfo1Amt: 0.3, lfo2Dest: 'pw', lfo2Rate: 'hz', lfo2Hz: 2, lfo2Amt: 0.5 }, { legato: true });
  ok(!r.nan && !r.errs.length && r.tail > 0.02, `legato + LFO : voix prolongée (niveau à 1,4 s : ${r.tail.toFixed(3)})${r.errs.length ? ' ' + r.errs.join() : ''}`);

  // 9. Fenêtre de sound design : panneaux LFO, destination, vitesse, largeur d'impulsion
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${port}/index.html`);
  const ui = await p.evaluate(async () => {
    const track = { id: 'sdx', type: 'instrument', name: 'Basse', category: 'mono', family: 'bass', instrument: 'syn_sawbass', octave: 2, events: [] };
    SS.soundDesign.open(track);
    const q = (s) => document.querySelector(s);
    const before = { panels: document.querySelectorAll('.sd-lfo').length, pwHidden: q('#sd_pw').closest('.sd-row').hidden, dim: q('#sdLfo1Body').classList.contains('dim') };
    q('#sdLfo1Dest [data-v="pw"]').click(); // PWM : passe l'oscillateur en Pulse
    const sel = q('#sdLfo1Rate');
    sel.value = 'b4';
    sel.dispatchEvent(new Event('change'));
    q('#sdLfo1Shapes [data-v="smooth"]').click();
    q('#sdLfo1Mode [data-v="retrig"]').click();
    return {
      before,
      sd: { ...track.sd },
      pwHidden: q('#sd_pw').closest('.sd-row').hidden,
      dim: q('#sdLfo1Body').classList.contains('dim'),
      code: q('#sdCode').textContent,
      amt: q('output[for="sd_lfo1Amt"]').textContent,
      hzHidden: q('#sd_lfo1Hz').closest('.sd-row').hidden,
    };
  });
  ok(ui.before.panels === 2 && ui.before.pwHidden && ui.before.dim, 'sound design : 2 panneaux LFO, inactifs ; largeur d’impulsion masquée hors Pulse');
  ok(ui.sd.lfo1Dest === 'pw' && ui.sd.wave === 'pulse' && ui.sd.lfo1Rate === 'b4' && ui.sd.lfo1Shape === 'smooth' && ui.sd.lfo1Mode === 'retrig', `réglages enregistrés : ${JSON.stringify(ui.sd)}`);
  ok(!ui.pwHidden && !ui.dim && ui.hzHidden, 'Pulse : largeur visible ; LFO actif ; vitesse libre masquée (calé sur le tempo)');
  ok(/LFO 1 pwm aléatoire 4 mesures ±23 %/.test(ui.code) && ui.amt === '±23 %', `résumé : « ${ui.code} », quantité « ${ui.amt} »`);
  ok(!errors.length, 'aucune erreur de page' + (errors.length ? ' : ' + errors.join(' | ') : ''));

  await b.close();
  server.close();
})();
