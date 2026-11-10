/*
 * Test de bout en bout : panneau Auto Mix de la console (écoute, diagnostic, conseils, A/B, préférences).
 *   node tests/e2e/band-close.js
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
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));


  const demo=JSON.parse(fs.readFileSync(path.join(ROOT,'demos','train-de-nuit.stepseq.json'),'utf8'));
  demo.tracks=demo.tracks.slice(0,2);
  await page.addInitScript((p)=>{if(!sessionStorage.seed){localStorage.setItem('stepseq.autosave',JSON.stringify(p));sessionStorage.seed='1';}},demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const P=()=>page.evaluate(()=>localStorage.getItem('stepseq.autosave'));
  const original=await P();
  for(let i=0;i<3;i++){
    await page.click('#bandBtn');
    if(i){await page.click('#bandStyles [data-v="edm"]');await page.locator('#bandPresets .band-preset').nth(i).click();}
    await page.click('#bandClose');
    await page.waitForTimeout(600);
    ok(!(await page.isVisible('#bandDialog')) && await P()===original, `fermeture ${i+1} par la croix : projet intact`);
  }
  await page.click('#bandBtn');await page.keyboard.press('Escape');
  ok(!(await page.isVisible('#bandDialog')) && await P()===original,'Échap ferme sans créer de piste');
  await page.click('#bandBtn');await page.click('#bandCancel');
  ok(!(await page.isVisible('#bandDialog')) && await P()===original,'Annuler conserve le projet');
  await page.click('#bandBtn');await page.click('#bandCreate');
  await page.waitForTimeout(1200);
  const created=await P();
  const p=JSON.parse(created);
  ok(p.tracks.length>demo.tracks.length && p.tracks.some((t)=>t.band),'Créer les pistes reste une action explicite fonctionnelle');
  ok(demo.tracks.every((t)=>p.tracks.some((x)=>x.id===t.id)),'création explicite : pistes existantes conservées');
  await page.click('#bandBtn');await page.click('#bandClose');
  await page.waitForTimeout(600);
  ok(await P()===created,'rouvrir et fermer après création ne duplique pas le groupe');
  await page.click('#bandBtn');await page.click('#bandCreate');
  ok(await page.isVisible('#bandConfirm'),'nouvelle création explicite : confirmation du groupe existant');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  ok(!(await page.isVisible('#bandDialog')) && await P()===created,'annuler la confirmation puis fermer ne crée rien');
  await page.click('#bandBtn');await page.click('#bandSongBtn');
  ok(await page.isVisible('#bandConfirm'),'création de chanson : confirmation explicite conservée');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  ok(await P()===created,'annuler la création de chanson conserve le projet');
  ok(!errs.length,'aucune erreur JavaScript : '+errs.join(' | '));
  await b.close();server.close();
})();
