/*
 * Pilote piste par piste : effets du Master : contrôles, persistance et rendu audio hors temps réel.
 *   node tests/e2e/master-layout.js
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
  await page.click('#mixerBtn');
  await page.click('.strip.master .strip-name');
  ok(await page.locator('.master-mods > .mod').count()===6,'six blocs Master dans une grille dédiée');
  ok(await page.locator('.mast-group').count()===3,'Mastering : niveau/crêtes, dynamique et espace regroupés');
  const cases = [
    { w:1600,h:1100,am:400,label:'large' },
    { w:1440,h:1000,am:720,label:'Auto Mix élargi' },
    { w:1100,h:1000,am:400,label:'compact' },
    { w:800,h:1100,am:400,label:'tablette' },
    { w:390,h:844,am:400,label:'téléphone' },
  ];
  for (const c of cases) {
    await page.setViewportSize({width:c.w,height:c.h});
    if(c.w>1000) {
      await page.locator('#amResize').focus();
      await page.keyboard.press('Home');
      for(let i=320;i<c.am;i+=20)await page.keyboard.press('ArrowLeft');
    }
    await page.waitForTimeout(300);
    await page.locator('.mod-mast').scrollIntoViewIfNeeded();
    const geometry=await page.locator('#mixerDetail').evaluate((el)=>{
      const outer=el.getBoundingClientRect();
      const bad=[...el.querySelectorAll('.mod, input, output, canvas, .comp-top')].filter((node)=>{
        const r=node.getBoundingClientRect();
        return r.width>0 && (r.right>outer.right+2 || r.left<outer.left-2 || node.classList.contains('comp-top') && node.scrollWidth>node.clientWidth+2);
      }).map((n)=>n.className || n.tagName);
      return {bad, overflow:el.scrollWidth-el.clientWidth, width:outer.width};
    });
    ok(!geometry.bad.length && geometry.overflow<=2,`${c.label} : aucun débordement (${JSON.stringify(geometry)})`);
    await page.screenshot({path:`/tmp/stepseq-master-${c.label.replaceAll(' ','-')}.png`});
  }
  await page.setViewportSize({width:1600,height:1100});
  await page.locator('[data-control="mastering.ceiling"] input').fill('700');
  await page.waitForTimeout(1100);
  ok(await page.evaluate(()=>Math.abs(JSON.parse(localStorage.getItem('stepseq.autosave')).master.mastering.ceiling+1.8)<0.01),'plafond toujours réglable et sauvegardé');
  await page.locator('[data-effect="chorus"] input[type=checkbox]').uncheck();
  await page.waitForTimeout(1100);
  ok(await page.evaluate(()=>!JSON.parse(localStorage.getItem('stepseq.autosave')).master.effects.chorus.on),'effets toujours modifiables');
  await page.locator('.mast-aim button').first().click();
  ok(await page.locator('.mast-hint').textContent().then((s)=>s.length>0),'aide de mesure conservée pour les objectifs LUFS');
  ok(!errs.length,'aucune erreur JavaScript : '+errs.join(' | '));
  await b.close();server.close();
})();
