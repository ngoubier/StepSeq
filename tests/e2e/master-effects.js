/*
 * Pilote piste par piste : effets du Master : contrôles, persistance et rendu audio hors temps réel.
 *   node tests/e2e/master-effects.js
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
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));


  const render = async (mode) => {
    const p = await b.newPage();
    await p.goto(`http://localhost:${server.address().port}/index.html`);
    const result = await p.evaluate(async (mode) => {
      let ctx;
      window.AudioContext = class extends OfflineAudioContext { constructor() { super(2, 48000, 48000); ctx = this; } };
      SS.mastering = SS.juno = SS.filters = null;
      const project = SS.newProject();
      project.master = { ...SS.masterParams(project), volume: 1, mix: SS.cleanMix({ eq: { on: false }, comp: { on: false }, lim: { on: false } }, SS.MASTER_DEFAULTS.mix) };
      SS.audio.ensureCtx();
      const fx = SS.cleanMasterEffects({ on: true, saturation: { on: mode === 'saturation', amount: 1 }, chorus: { on: mode === 'chorus', mix: 0.5 }, reverb: { on: mode === 'reverb', mix: 0.3 } });
      if (mode !== 'baseline') { project.master.effects = fx; SS.audio.applyMaster(project); }
      if (mode === 'bypass') project.master.effects = { ...fx, on: false };
      SS.audio.applyMaster(project);
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = 1000; gain.gain.value = 0.8;
      osc.connect(gain).connect(SS.audio._master()); osc.start(0.1); osc.stop(0.3);
      const buf = await ctx.startRendering();
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      let energy = 0, tail = 0, stereo = 0;
      for (let i=0;i<l.length;i++) { energy += l[i]*l[i]; if(i>20000)tail+=l[i]*l[i]; stereo+=(l[i]-r[i])**2; }
      return { energy, tail, stereo, samples: Array.from(l.slice(10000,10100)) };
    }, mode);
    await p.close();
    return result;
  };
  const baseline = await render('baseline');
  const bypass = await render('bypass');
  const sat = await render('saturation');
  const chorus = await render('chorus');
  const reverb = await render('reverb');
  ok(Math.abs(baseline.energy-bypass.energy)<0.001, 'bypass général : signal identique au trajet initial');
  ok(sat.samples.some((v,i)=>Math.abs(v-baseline.samples[i])>0.01), 'saturation : transformation audio mesurée');
  ok(chorus.stereo>0.001, 'chorus : modulation stéréo mesurée');
  ok(reverb.tail>baseline.tail+0.0001, 'réverbération courte : queue audio mesurée');
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.click('#mixerBtn');
  await page.click('.strip.master .strip-name');
  ok(await page.locator('.mod-master-effects').count()===1,'module Effets présent sur le Master');
  await page.click('.mod-master-effects .mod-power');
  await page.locator('[data-effect="chorus"] input[type=range]').fill('500');
  await page.locator('[data-effect="reverb"] input[type=checkbox]').uncheck();
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('stepseq.autosave')).master.effects);
  ok(saved.on && saved.chorus.mix===0.25 && !saved.reverb.on,'activation, dosage et bypass individuel sauvegardés');
  await page.click('.mod-master-effects .mod-power');
  await page.waitForTimeout(1200);
  ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('stepseq.autosave')).master.effects.chorus.mix===0.25),'bypass général conserve les dosages');
  await page.reload(); await page.click('#mixerBtn'); await page.click('.strip.master .strip-name');
  ok(await page.locator('[data-effect="chorus"] output').textContent()==='25 %','dosage restauré après rechargement');
  await page.locator('.mod-master-effects').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/stepseq-master-effects.png' });
  ok(!errs.length,'aucune erreur JavaScript : '+errs.join(' | '));
  await b.close(); server.close();
})();
