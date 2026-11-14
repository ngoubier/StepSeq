/*
 * Automation du son (phase 2) : réglages « voice » de la ligne d'automation (cutoff, PWM, decay du filtre,
 * quantité des LFO), proposés seulement aux pistes qui peuvent s'en servir, et lus au début de chaque note
 * pendant la lecture ; effet audible mesuré sur un rendu hors temps réel.
 *   node tests/e2e/voice-auto.js
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
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url);
  // tempo 120, une mesure : une basse PWM sur les pas 0, 4, 8, 12 et une batterie
  await page.evaluate(() => {
    const p = SS.newProject();
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_pwmbass', name: 'Basse', color: '#13c2a3' }, p);
    t.events = [0, 4, 8, 12].map((step) => ({ step, len: 2, notes: [36], vel: 0.8 }));
    p.tracks.push(t);
    p.tracks.push(SS.newTrack({ type: 'drum', name: 'Kick', color: '#ff4d6d' }, p));
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].auto || null);

  // menus : deux groupes pour la basse, réglages de tranche seulement pour la batterie
  await page.locator('.track').nth(0).locator('.th-auto').click();
  await page.locator('.track').nth(1).locator('.th-auto').click();
  const lanes = page.locator('.auto-lane');
  const groups = await lanes.nth(0).locator('.auto-param optgroup').evaluateAll((gs) => gs.map((g) => g.label + ':' + [...g.children].map((o) => o.value).join(',')));
  ok(groups.join(' | ') === 'Tranche de la piste:filter,res,volume,reverb,echo,space | Son, à chaque note:vcf,pw,fdecay,lfoamt', `basse : ${groups.join(' | ')}`);
  const drumOpts = await lanes.nth(1).locator('.auto-param option').evaluateAll((os) => os.map((o) => o.value).join(','));
  ok(drumOpts === 'filter,res,volume,reverb,echo,space', `batterie : ${drumOpts}`);

  // forme « accents » sur le cutoff du son, puis PWM dessinée à la souris (bas des cases 9 à 12)
  const lane = lanes.nth(0);
  await lane.locator('.auto-param').selectOption('vcf');
  await lane.locator('.auto-shape').selectOption('acid');
  await page.waitForTimeout(600);
  let a = await saved();
  ok(a && a.vcf && a.vcf[0] === 0.35 && a.vcf[1] === -0.25 && Object.keys(a.vcf).length === 16, 'Cutoff du son : forme « accents » posée sur les 16 pas');
  ok((await lane.locator('.auto-val').textContent()).includes('+1,4 oct'), `valeur lisible : ${await lane.locator('.auto-val').textContent()}`);
  await lane.locator('.auto-param').selectOption('pw');
  const box = async (s) => lane.locator(`.acell[data-step="${s}"]`).boundingBox();
  const c8 = await box(8), c11 = await box(11);
  await page.mouse.move(c8.x + c8.width / 2, c8.y + c8.height * 0.95);
  await page.mouse.down();
  await page.mouse.move(c11.x + c11.width / 2, c11.y + c11.height * 0.95, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  a = await saved();
  ok(a.pw && Object.keys(a.pw).join() === '8,9,10,11' && Object.values(a.pw).every((v) => v < 0.12), `PWM dessinée : ${JSON.stringify(a.pw)}`);

  // lecture : chaque note reçoit les valeurs de son pas (espion sur SS.applyVoiceLocks)
  const seen = await page.evaluate(async () => {
    const log = [];
    const orig = SS.applyVoiceLocks;
    SS.applyVoiceLocks = (p, locks) => {
      log.push({ ...locks, cutoff: Math.round(orig(p, locks).cutoff) });
      return orig(p, locks);
    };
    document.querySelector('#play').click();
    await new Promise((r) => setTimeout(r, 1600));
    document.querySelector('#stop').click();
    SS.applyVoiceLocks = orig;
    return log;
  });
  ok(seen.length >= 3, `lecture : ${seen.length} notes avec verrous`);
  const first = seen.slice(0, 4);
  // comme l'automation de la tranche : avant le premier point, la valeur reste celle de ce point
  ok(first[0] && first[0].vcf === 0.35 && first[0].pw === first[2].pw, `pas 1 : cutoff +1,4 oct, PWM du premier point (${JSON.stringify(first[0])})`);
  ok(first[1] && first[1].vcf === 0.35, `pas 5 : accent (${JSON.stringify(first[1])})`);
  ok(first[2] && first[2].vcf === 0.35 && first[2].pw < 0.12, `pas 9 : PWM étroite verrouillée (${JSON.stringify(first[2])})`);
  ok(first[0] && first[0].cutoff === Math.round(650 * Math.pow(2, 1.4)), `cutoff appliqué : ${first[0] && first[0].cutoff} Hz (650 Hz × 2^1,4)`);

  // effet audible : rendu hors temps réel d'une note avec et sans verrou de cutoff
  const render = async (locks) => {
    const p = await b.newPage();
    p.on('pageerror', (e) => /resume/.test(e.message) || errs.push(e.message));
    await p.goto(url);
    const r = await p.evaluate(async (locks) => {
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
      const track = { id: 'v', type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_sawbass', sd: { env: 0, q: 0, cutoff: 300 } };
      await SS.audio.playNote(track, 45, 0, 0.8, 0.9, rec, 0, 1, locks ? { locks } : null);
      const x = (await ctx.startRendering()).getChannelData(0);
      // énergie des aigus : différence d'un échantillon à l'autre (passe-haut grossier)
      let hi = 0;
      for (let i = 4410; i < 30000; i++) hi += (x[i] - x[i - 1]) ** 2;
      return hi;
    }, locks);
    await p.close();
    return r;
  };
  const dark = await render(null);
  const bright = await render({ vcf: 0.5 });
  ok(bright > dark * 4, `verrou de cutoff +2 oct : aigus ×${(bright / dark).toFixed(1)}`);

  ok(!errs.length, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
