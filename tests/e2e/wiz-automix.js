/*
 * Test de bout en bout du panneau Mix auto de l'assistant (js/wizautomix.js, js/wizmix.js) :
 *   node tests/e2e/wiz-automix.js
 * Bouton « Mix auto » (étapes 3 à 12), écoute en direct, conseils, Accepter (le fader de l'assistant bouge),
 * Ctrl+Z, mode Auto (le pilote applique seul), onglet Fait, « Annuler toute la session de mix », frise de lecture.
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
const SHOTS = process.env.SHOTS;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  ok(await page.locator('#wamBtn').isHidden().catch(() => true), 'étape 1 : pas de bouton Mix auto');
  await page.evaluate(() => window.StepSeq.assistantEtape({ etape: 'mix' }));
  await page.waitForTimeout(400);
  ok(await page.isVisible('#wamBtn'), 'étape Mix : bouton Mix auto');
  ok(await page.isVisible('#bwPlayBar'), 'frise de lecture visible');

  await page.click('#wamBtn');
  ok(await page.isVisible('#wizAutoMix'), 'panneau ouvert à droite');
  const mr = await page.evaluate(() => getComputedStyle(document.querySelector('#bandDialog')).marginRight);
  ok(mr === '360px', 'le panneau pousse l’assistant (' + mr + ')');
  ok((await page.locator('#wizAutoMix .wam-hint').first().textContent()).includes('Lance la lecture'), 'à l’arrêt : lancer la lecture');

  await page.click('#play');
  await page.waitForFunction(() => SS.wizAutoMix._state().diag && SS.wizAutoMix._state().diag.ready, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const n = await page.locator('#wizAutoMix .wam-card').count();
  const total = await page.evaluate(() => SS.wizAutoMix._state().diag.suggestions.length);
  ok(total > 0, `diagnostic : ${total} conseil(s)`);
  ok(n > 0 || (await page.locator('#wizAutoMix .wam-tabs button[data-tab="master"] .wam-n').textContent()) !== '0', 'cartes de conseils affichées');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'mix-auto-conseils.png') });

  // accepter un conseil (onglet qui en a), puis Ctrl+Z
  if (!n) await page.click('#wizAutoMix .wam-tabs button[data-tab="master"]');
  const before = await page.evaluate(() => JSON.stringify(SS.band._state.wiz.mix));
  await page.click('#wizAutoMix .wam-ok >> nth=0');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => JSON.stringify(SS.band._state.wiz.mix));
  ok(after !== before && (await page.evaluate(() => SS.wizAutoMix._state().log.length)) === 1, 'Accepter : le mix de l’assistant change, un réglage dans Fait');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => JSON.stringify(SS.band._state.wiz.mix));
  ok(back === before && (await page.evaluate(() => SS.wizAutoMix._state().log.length)) === 0, 'Ctrl+Z : le réglage est défait');

  // mode Auto : le pilote applique seul
  await page.click('#wizAutoMix .wam-sw button[data-auto="true"]');
  await page.waitForFunction(() => SS.wizAutoMix._state().log.some((x) => x.by === 'auto'), null, { timeout: 60000 }).catch(() => {});
  const auto = await page.evaluate(() => SS.wizAutoMix._state().log.filter((x) => x.by === 'auto').length);
  ok(auto > 0, `mode Auto : ${auto} réglage(s) appliqué(s) par le pilote`);
  await page.click('#wizAutoMix .wam-sw button[data-auto="false"]');
  await page.click('#wizAutoMix .wam-tabs button[data-tab="log"]');
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'mix-auto-fait.png') });
  ok((await page.locator('#wizAutoMix .wam-undo').count()) === (await page.evaluate(() => SS.wizAutoMix._state().log.length)), 'Fait : un « Annuler ce réglage » par réglage');
  await page.click('#wizAutoMix .wam-undo-all');
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => JSON.stringify(SS.band._state.wiz.mix))) === before, 'Annuler toute la session : le mix d’avant revient');

  // Claude : l'outil répond
  const tool = await page.evaluate(() => window.StepSeq.assistantMixAuto());
  ok(tool.ouvert === true && Array.isArray(tool.conseils), 'outil Claude assistantMixAuto');

  await page.click('#wizAutoMix .wam-x');
  ok(!(await page.isVisible('#wizAutoMix')), 'fermer le panneau');
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close();
  server.close();
})();
