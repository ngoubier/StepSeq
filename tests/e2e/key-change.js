/*
 * Nouvelle chanson, étape Accords : fenêtre « ⇅ Changement… » (changement de tonalité ou de mode, js/keychange.js).
 * Geste « Montée d'un ton préparée » sur le Refrain : écoute, Appliquer, tonalité + dominante au dernier temps de la
 * scène d'avant, pastille ; puis l'outil Claude assistantChangement.
 *   node tests/e2e/key-change.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SHOT = process.env.SHOT;
(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    await StepSeq.assistantOuvrir();
    const skip = document.querySelector('#brgSkip'); if (skip) skip.click();
    await new Promise((r) => setTimeout(r, 300));
    StepSeq.assistantStyle({ style: 'pop' }); StepSeq.assistantEtape({ etape: 'accords' });
  });
  await page.waitForTimeout(500);
  const sc = (nom) => page.evaluate((n) => StepSeq.assistantEtat().scenes.find((s) => s.nom === n), nom);
  const pre0 = await sc('Pré-refrain');
  await page.click('#bandWiz .bh-scene[data-sec="chorus"]'); await page.waitForTimeout(300);
  await page.click('#bwKcBtn'); await page.waitForTimeout(300);
  ok(await page.isVisible('#bwKc'), 'la fenêtre Changement s’ouvre');
  ok((await page.locator('#bwKc .bwk-card').count()) >= 7, 'gestes proposés');
  await page.click('#bwKc [data-g="ton"]'); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !!SS.band._state.wiz.kc.preview), 'le geste s’écoute (aperçu)');
  ok((await page.textContent('#bwkPass .active')) === 'Préparé', 'montée d’un ton : passage préparé par défaut');
  if (SHOT) await page.screenshot({ path: SHOT + '-fenetre.png' });
  await page.click('#bwkApply'); await page.waitForTimeout(600);
  ok(!(await page.isVisible('#bwKc')), 'Appliquer ferme la fenêtre');
  const ref = await sc('Refrain'), pre = await sc('Pré-refrain');
  ok(ref.tonalite.tonic === 'E♭' && ref.tonalite.mode === 'major', 'Refrain en Mi♭ majeur (Ré♭ + 1 ton)');
  ok(pre.grille[pre.grille.length - 1].accord === 'B♭7' && pre.grille[pre.grille.length - 1].duree === 4, 'B♭7 au dernier temps du Pré-refrain');
  ok(pre.grille.length === pre0.grille.length + 1, 'le reste du Pré-refrain est intact');
  ok(/1 ton/.test(await page.textContent('#bandWiz .bh-scene[data-sec="chorus"] .bh-kchg')), 'pastille « ↗ 1 ton » sur le Refrain');
  ok(await page.locator('#bwPlayBar .wpb-key').count() > 0, 'pastilles dans la frise de lecture');
  if (SHOT) await page.screenshot({ path: SHOT + '-accords.png' });
  // Claude : les gestes, puis le pont au relatif mineur avec les accords du geste
  const list = await page.evaluate(() => StepSeq.assistantChangement({ scene: 'bridge' }));
  ok(list.gestes.some((g) => g.geste === 'rel'), 'assistantChangement sans geste : la liste');
  const r = await page.evaluate(() => StepSeq.assistantChangement({ scene: 'bridge', geste: 'rel', accords: 'geste' }));
  ok(/mineur/.test(r.vers), `pont au relatif : ${r.depuis} → ${r.vers}`);
  const br = await sc('Pont');
  ok(br.grille.some((c) => /7$/.test(c.accord)), 'grille du geste posée (dominante V7)');
  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close(); server.close();
})();
