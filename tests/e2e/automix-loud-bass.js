/*
 * Test de bout en bout : pilote auto des faders (Auto Mix) sur une chanson Band jouée en temps réel.
 *   node tests/e2e/automix-loud-bass.js
 * La basse est remontée de 12 dB après un mixage Band ; le pilote doit la baisser, sans entraîner
 * une remontée générale des autres faders.
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
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  await page.click('#bandBtn');
  await page.waitForTimeout(400);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=1');
  for (let i = 0; i < 3; i++) await page.click('#bwNext'); await page.click('#bwCreate');
  await page.waitForTimeout(200);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  const vols = () => page.evaluate(() => Object.fromEntries(window.__p().tracks.map((t) => [t.band ? t.band.key : t.id, 20 * Math.log10(t.volume)])));
  await page.evaluate(() => {
    window.__p = () => JSON.parse(localStorage.getItem('stepseq.autosave'));
  });

  await page.click('#mixerBtn');
  await page.waitForTimeout(400);
  await page.waitForTimeout(300);

  const bassId=await page.evaluate(()=>window.__p().tracks.find((t)=>t.band?.key==='bass').id);
  const bass=page.locator(`.strip[data-id="${bassId}"] .fader`);
  const original=await vols();
  await bass.evaluate((el)=>{for(let i=0;i<24;i++)el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));});
  await page.waitForTimeout(1000);
  const raised=await vols();
  ok(raised.bass>original.bass+11,'basse volontairement remontée de 12 dB après le mixage Band');
  await page.click('#amPilotBtn');
  let bassSelected=false;
  for(let i=0;i<300;i++){
    bassSelected ||= await page.locator(`.strip[data-id="${bassId}"].selected.pilot-working .fader.pilot-control`).count()>0;
    await page.waitForTimeout(100);
  }
  const corrected=await vols();
  ok(corrected.bass<raised.bass-4,`basse baissée : ${raised.bass.toFixed(1)} → ${corrected.bass.toFixed(1)} dB`);
  ok(bassSelected,'la basse est sélectionnée et son fader illuminé pendant la correction');
  const others=Object.keys(original).filter((k)=>k!=='bass');
  const gains=others.map((k)=>corrected[k]-original[k]);
  ok(gains.filter((v)=>v>1).length<others.length/2,`pas de remontée générale (${gains.map((v)=>v.toFixed(1)).join(', ')} dB)`);
  ok(Math.max(...gains)<3.5,'les autres pistes ne sont pas poussées pour suivre la basse');
  const levels=await page.evaluate(()=>SS.audio.levels('__master').loudness);
  ok(Number.isFinite(levels.i) && levels.tp<=-0.8,`sortie mesurée sans dépassement du plafond (${levels.i.toFixed(1)} LUFS, ${levels.tp.toFixed(1)} dBTP)`);
  await page.click('#amPilotStop');
  ok(!errs.length,'aucune erreur JavaScript : '+errs.join(' | '));
  await b.close();server.close();
})();
