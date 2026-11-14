/*
 * Effets d'espace : reverb « Cosmos » (queue longue, Freeze, Shimmer) et écho à bande (saturation, wow),
 * rendus hors temps réel dans Chromium puis mesurés ; fenêtre Effets (envoi, préréglages, gel).
 *   node tests/e2e/space.js
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
const db = (x) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

/**
 * Une note courte envoyée dans un bus partagé, rendue sur `len` s. `returns` : réglages des bus ;
 * `at` : { temps: réglages } appliqués en cours de rendu (ex. Freeze). Renvoie RMS par fenêtre de 0,5 s, crête,
 * et amplitude de quelques fréquences sur une fenêtre de la queue.
 */
async function render(browser, port, { fx, returns, at = {}, len = 6, sd, midi = 57, probe = [2, 3], freqs = [] }) {
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', (e) => /resume/.test(e.message) || errs.push(e.message));
  await p.goto(`http://localhost:${port}/index.html`);
  const r = await p.evaluate(
    async ({ fx, returns, at, len, sd, midi, probe, freqs }) => {
      const SR = 44100;
      window.AudioContext = class extends OfflineAudioContext {
        constructor() {
          super(2, SR * len, SR);
        }
      };
      SS.audio.ensureCtx();
      const ctx = SS.audio._master().context;
      await SS.space.load(ctx);
      const project = SS.newProject();
      project.returns = SS.cleanReturns(returns);
      const track = SS.newTrack({ type: 'instrument', category: 'mono', family: 'synth', instrument: 'syn_saw', name: 'Test' }, project);
      track.sd = sd || { env: 0, q: 0, cutoff: 20000, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05 };
      track.fx = fx;
      project.tracks.push(track);
      SS.audio.applyMaster(project);
      SS.audio.applyFx(track);
      await new Promise((r) => setTimeout(r, 50)); // branchement du Cosmos (module chargé)
      SS.audio.applyMaster(project);
      for (const [t, patch] of Object.entries(at)) {
        ctx.suspend(+t).then(() => {
          project.returns = SS.cleanReturns({ ...SS.returnParams(project), space: { ...SS.returnParams(project).space, ...patch } });
          SS.audio.applyMaster(project);
          ctx.resume();
        });
      }
      await SS.audio.playNote(track, midi, 0.02, 0.3, 0.9);
      const buf = await ctx.startRendering();
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const rms = [];
      const W = SR / 2;
      for (let s0 = 0; s0 + W <= L.length; s0 += W) {
        let a = 0;
        for (let i = s0; i < s0 + W; i++) a += L[i] * L[i] + R[i] * R[i];
        rms.push(Math.sqrt(a / (2 * W)));
      }
      const s0 = Math.round(probe[0] * SR);
      const n = Math.round((probe[1] - probe[0]) * SR);
      const amp = freqs.map((f) => {
        const w = (2 * Math.PI * f) / SR;
        let re = 0, im = 0;
        for (let i = 0; i < n; i++) {
          const v = L[s0 + i] + R[s0 + i];
          re += v * Math.cos(w * i);
          im += v * Math.sin(w * i);
        }
        return Math.hypot(re, im) / n;
      });
      let peak = 0, nan = false;
      for (let i = 0; i < L.length; i++) {
        if (!Number.isFinite(L[i])) nan = true;
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      }
      let corr = 0, eL = 0, eR = 0;
      for (let i = SR; i < 2 * SR; i++) {
        corr += L[i] * R[i];
        eL += L[i] * L[i];
        eR += R[i] * R[i];
      }
      return { rms, amp, peak, nan, corr: corr / Math.sqrt(eL * eR || 1) };
    },
    { fx, returns, at, len, sd, midi, probe, freqs }
  );
  await p.close();
  r.errs = errs;
  return r;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const b = await chromium.launch();

  // 1. Queue longue : 12 s contre 1,5 s
  const long = await render(b, port, { fx: { sendSpace: 1 }, returns: { space: { decay: 12 } }, len: 6 });
  const short = await render(b, port, { fx: { sendSpace: 1 }, returns: { space: { decay: 1.5 } }, len: 6 });
  ok(!long.nan && !long.errs.length, 'Cosmos : rendu sans erreur' + (long.errs.length ? ' ' + long.errs.join() : ''));
  const drop = (x) => 20 * Math.log10(x.rms[8] / Math.max(...x.rms.slice(0, 2)));
  ok(drop(long) > -25 && drop(short) < -50, `queue à 4 s : ${drop(long).toFixed(1)} dB (12 s) contre ${drop(short).toFixed(1)} dB (1,5 s)`);
  ok(Math.abs(long.corr) < 0.6, `sortie stéréo décorrélée (corrélation G/D ${long.corr.toFixed(2)})`);
  const dry = await render(b, port, { fx: {}, returns: {}, len: 6 });
  ok(dry.rms[8] < 1e-4, `sans envoi : silence à 4 s (${db(dry.rms[8])} dB)`);

  // 2. Freeze à 1 s : la queue tient (ni chute ni emballement) ; sans freeze, elle retombe
  const frozen = await render(b, port, { fx: { sendSpace: 1 }, returns: { space: { decay: 4 } }, at: { 1: { freeze: true } }, len: 9 });
  const free = await render(b, port, { fx: { sendSpace: 1 }, returns: { space: { decay: 4 } }, len: 9 });
  const hold = frozen.rms[16] / frozen.rms[3];
  ok(hold > 0.7 && hold < 1.3, `Freeze : niveau à 8 s / 1,5 s = ${hold.toFixed(2)}`);
  ok(free.rms[16] / free.rms[3] < 0.05, `sans Freeze : la queue retombe (${db(free.rms[16] / free.rms[3])} dB)`);
  // une note jouée après le gel n'entre pas dans la queue
  ok(!frozen.nan && frozen.peak < 2, `Freeze : stable (crête ${frozen.peak.toFixed(2)})`);

  // 3. Shimmer : une octave au-dessus apparaît dans la queue (sinus à 220 Hz)
  const sine = { wave: 'sine', env: 0, q: 0, cutoff: 20000, attack: 0.005, decay: 0.1, sustain: 1, release: 0.05 };
  const sh = await render(b, port, { fx: { sendSpace: 1 }, returns: { space: { decay: 10, shimmer: 0.7, damp: 12000 } }, sd: sine, len: 5, probe: [2, 4], freqs: [220, 440, 880] });
  const plain = await render(b, port, { fx: { sendSpace: 1 }, returns: { space: { decay: 10, shimmer: 0, damp: 12000 } }, sd: sine, len: 5, probe: [2, 4], freqs: [220, 440, 880] });
  const oct = (x) => (x.amp[1] + x.amp[2]) / x.amp[0];
  ok(oct(sh) > 10 * oct(plain) && oct(sh) > 0.3, `Shimmer : octaves / fondamentale ${oct(sh).toFixed(2)} contre ${oct(plain).toFixed(3)} sans`);
  ok(!sh.nan && sh.peak < 2, `Shimmer : stable (crête ${sh.peak.toFixed(2)})`);
  const shFz = await render(b, port, { fx: { sendSpace: 1 }, returns: { space: { decay: 10, shimmer: 1 } }, at: { 1: { freeze: true } }, len: 8 });
  ok(!shFz.nan && shFz.peak < 2 && shFz.rms[14] < 3 * shFz.rms[3], `Shimmer + Freeze : pas d'emballement (${shFz.rms[3].toFixed(3)} → ${shFz.rms[14].toFixed(3)})`);

  // 4. Écho à bande : réinjection 100 % saturée, bornée et toujours là ; wow sans erreur
  const tape = await render(b, port, { fx: { sendEcho: 1 }, returns: { echo: { feedback: 1, drive: 0.6, wow: 0.8, time: '1/8', lp: 6000 } }, len: 8 });
  ok(!tape.nan && tape.peak < 1.5, `écho à 100 % : borné (crête ${tape.peak.toFixed(2)})`);
  ok(tape.rms[14] > 0.003, `écho à 100 % : les répétitions durent (${db(tape.rms[14])} dB à 7 s)`);
  const fade = await render(b, port, { fx: { sendEcho: 1 }, returns: { echo: { feedback: 0.4, time: '1/8' } }, len: 8 });
  ok(fade.rms[14] < 1e-4, `écho à 40 % : s'éteint (${db(fade.rms[14])} dB à 7 s)`);

  // 5. Fenêtre Effets : envoi Cosmos, préréglage, Freeze, enregistrement
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${port}/index.html`);
  await p.evaluate(() => {
    const pr = SS.newProject();
    pr.tracks.push(SS.newTrack({ type: 'instrument', category: 'chord', family: 'pads', instrument: 'syn_drone', name: 'Drone' }, pr));
    localStorage.setItem('stepseq.autosave', JSON.stringify(pr));
  });
  await p.reload();
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const t = document.querySelector('.track');
    const btn = t.querySelector('.fx-btn');
    btn.click();
  });
  await p.waitForTimeout(200);
  const ui = await p.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    const presets = [...document.querySelectorAll('#fxDialog [data-presets="send"] button')];
    presets.find((x) => x.textContent === 'Ambient').click();
    [...document.querySelectorAll('.fx-space-tools button')].find((x) => x.textContent === 'Shimmer').click();
    q('#fxFreeze').click();
    await new Promise((r) => setTimeout(r, 600));
    const saved = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return {
      groups: [...document.querySelectorAll('#fxTabs .fx-tabs-group.bus ~ .fx-tab span')].map((h) => h.textContent),
      echoInGroup: !!q('#fxPane_echo #fxEchoTime') && !!q('#fxPane_echo #fxRet_echo input'),
      fx: saved.tracks[0].fx,
      space: saved.returns && saved.returns.space,
      freezeLabel: q('#fxFreeze').textContent,
      pressed: q('#fxFreeze').getAttribute('aria-pressed'),
      code: q('#fxCode').textContent,
    };
  });
  ok(ui.groups.join(' / ') === 'Plate et hall / Écho à bande / Cosmos' && ui.echoInGroup, `bus du morceau : 3 onglets (${ui.groups.join(' / ')})`);
  ok(ui.fx && ui.fx.sendSpace === 0.55, `préréglage Ambient : envoi Cosmos ${ui.fx && ui.fx.sendSpace}`);
  ok(ui.space && ui.space.shimmer === 0.55 && ui.space.freeze === true, `Cosmos enregistré : ${JSON.stringify(ui.space)}`);
  ok(ui.pressed === 'true' && /gelé/.test(ui.freezeLabel), `bouton Freeze : ${ui.freezeLabel}`);
  ok(/cosmos 55 %/.test(ui.code), `résumé : ${ui.code}`);
  ok(/gelé/.test(await p.textContent('#fxSpaceState')), `onglet Cosmos : « ${await p.textContent('#fxSpaceState')} »`);

  // 6. Onglets verticaux : une section visible à la fois, taille fixe, clavier, dernier onglet retenu
  const visible = () => p.evaluate(() => [...document.querySelectorAll('#fxDialog .fx-pane')].filter((x) => !x.hidden).map((x) => x.dataset.pane));
  ok((await visible()).join() === 'sends', `ouverture sur « Envois » : ${await visible()}`);
  await p.click('#fxTabs [data-tab="space"]');
  ok((await visible()).join() === 'space' && (await p.getAttribute('#fxTabs [data-tab="space"]', 'aria-current')) === 'page', 'clic : onglet Cosmos seul visible');
  const box = await p.locator('#fxDialog').boundingBox();
  ok(box.height <= 640 && box.width <= 880, `fenêtre de taille fixe : ${Math.round(box.width)} × ${Math.round(box.height)}`);
  await p.keyboard.press('ArrowUp');
  ok((await visible()).join() === 'echo', 'flèche haut : onglet précédent (Écho à bande)');
  await p.keyboard.press('Home');
  ok((await visible()).join() === 'chorus', 'Début : premier onglet');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  await p.click('.track .fx-btn');
  await p.waitForTimeout(200);
  ok((await visible()).join() === 'chorus', 'réouverture : dernier onglet utilisé');
  await p.keyboard.press('Escape');
  // téléphone : onglets en rangée horizontale, une colonne de curseurs
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('.track .fx-btn').catch(() => p.evaluate(() => SS.fx.open && 0));
  await p.evaluate(() => {
    if (!document.querySelector('#fxDialog').open) document.querySelector('.track .fx-btn')?.click();
  });
  await p.waitForTimeout(200);
  const phone = await p.evaluate(() => {
    const d = document.querySelector('#fxDialog');
    if (!d.open) return null;
    const nav = getComputedStyle(document.querySelector('#fxTabs'));
    const r = d.getBoundingClientRect();
    return { dir: nav.flexDirection, w: r.width, h: r.height, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  ok(phone && phone.dir === 'row' && phone.w <= 390 && phone.h <= 844 && !phone.overflow, `téléphone : ${JSON.stringify(phone)}`);

  ok(!errs.length, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));

  await b.close();
  server.close();
})();
