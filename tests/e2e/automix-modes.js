/*
 * Test de bout en bout : panneau Auto Mix de la console (écoute, diagnostic, conseils, A/B, préférences).
 *   node tests/e2e/automix-modes.js
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

  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  demo.tracks = demo.tracks.slice(0,2);
  await page.addInitScript((p)=>localStorage.setItem('stepseq.autosave',JSON.stringify(p)),demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.click('#mixerBtn');
  ok(await page.isVisible('#automix'), 'ouvrir Mix ouvre Auto Mix automatiquement');
  ok(await page.locator('.am-modes button').count()===2, 'deux boutons de mode en haut');
  ok(await page.locator('#amPilotBtn').evaluate((el)=>el.getBoundingClientRect().height)>=50, 'grands boutons de lancement');
  ok(await page.evaluate(()=>!SS.audio.isPlaying() && !SS.automixListen.listening()), 'ouverture : aucun traitement ni lecture avant le choix du mode');
  ok(!(await page.isVisible('#amTargets')) && !(await page.locator('#automix .am-play').count()), 'objectif et bouton Lecture absents');
  ok(await page.locator('#automix .am-hint').evaluateAll((els)=>els.every((el)=>getComputedStyle(el).display==='none')), 'textes d’aide masqués');
  await page.click('#amPilotBtn');
  await page.waitForFunction(()=>SS.audio.isPlaying());
  ok(await page.evaluate(()=>SS.automixPanel._state().mode==='pilot' && !!SS.automixPanel._state().pilot && SS.automixListen.listening()), 'Pilote Auto lance le pilote et l’analyse');
  ok(await page.isVisible('#amPilot') && !(await page.isVisible('#amCards')) && !(await page.isVisible('#amFoot')), 'mode pilote : Assistant et commandes manuelles masqués');
  await page.click('#amAssistantBtn');
  await page.waitForFunction(()=>SS.audio.isPlaying());
  ok(await page.evaluate(()=>SS.automixPanel._state().mode==='assistant' && !SS.automixPanel._state().pilot), 'Assistant arrête le pilote et lance la lecture');
  ok(!(await page.isVisible('#amPilot')) && await page.isVisible('#amCards'), 'mode Assistant : pilote masqué, conseils affichés');
  ok(await page.locator('#amCards [role=tab]').count()===2, 'onglets Mixage et Mastering présents');
  ok(await page.isVisible('#amFoot .am-ab') && await page.isVisible('#amFoot button:has-text("Réécouter")') && await page.isVisible('#amFoot button:has-text("Tout accepter")'), 'commandes avant/après, Réécouter et Tout accepter conservées');
  await page.screenshot({path:'/tmp/stepseq-assistant-modes.png'});
  await page.click('#amPilotBtn');
  ok(await page.isVisible('#amPilot') && !(await page.isVisible('#amCards')), 'retour au pilote : modes toujours exclusifs');
  await page.click('#amPilotStop');
  ok(await page.evaluate(()=>!SS.automixPanel._state().pilot), 'arrêt explicite du pilote disponible');
  await page.click('#amPilotBtn');
  await page.click('#mxClose');
  ok(await page.evaluate(()=>!SS.automixPanel.isOpen() && !SS.automixListen.listening() && !SS.audio.isPlaying()), 'fermer Mix arrête analyse et lecture');
  await page.click('#mixerBtn');
  ok(await page.isVisible('#automix') && await page.evaluate(()=>SS.automixPanel._state().mode===null), 'réouverture : Auto Mix visible et prêt pour le choix du mode');
  await page.setViewportSize({width:800,height:900});
  ok(await page.isVisible('#amPilotBtn') && await page.isVisible('#amAssistantBtn'), 'deux modes accessibles sur petit écran');
  ok(!errs.length,'aucune erreur JavaScript : '+errs.join(' | '));
  await b.close(); server.close();
})();
