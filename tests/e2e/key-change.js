/*
 * Nouvelle chanson, étape Accords : fenêtre « ⇅ Changement… » (changement de tonalité ou de mode, js/keychange.js).
 * Geste « Montée d'un ton préparée » sur le Refrain : écoute, Appliquer, tonalité + dominante au dernier temps de la
 * scène d'avant, pastille ; « Seulement la dernière fois » (aperçu puis Annuler), raccourci « Dernier refrain » de l'étape
 * Arrangement ; l'outil Claude assistantChangement (même mélodie, transposée, pour un refrain final).
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
  // « Seulement la dernière fois » : la dernière reprise devient « Refrain final » le temps de l'écoute ; Annuler la retire
  const form0 = JSON.stringify((await page.evaluate(() => StepSeq.assistantEtat())).structure);
  await page.click('#bandWiz .bh-scene[data-sec="chorus"]'); await page.waitForTimeout(300);
  await page.click('#bwKcBtn'); await page.waitForTimeout(300);
  ok(await page.isVisible('#bwkWhere'), 'Refrain joue plusieurs fois : réglage « Où »');
  await page.click('#bwkWhere [data-v="last"]'); await page.click('#bwKc [data-g="demi"]'); await page.waitForTimeout(1200);
  ok(/final/.test(await page.textContent('#bwKc .bwk-fromto')), 'aperçu : « Refrain final »');
  if (SHOT) await page.screenshot({ path: SHOT + '-dernier.png' });
  await page.click('#bwkCancel'); await page.waitForTimeout(400);
  ok(JSON.stringify((await page.evaluate(() => StepSeq.assistantEtat())).structure) === form0, 'Annuler : l’arrangement est remis');
  // raccourci de l'étape Arrangement
  await page.evaluate(() => StepSeq.assistantEtape({ etape: 'arrangement' })); await page.waitForTimeout(500);
  ok(await page.isVisible('#bwArrLast'), 'étape Arrangement : « Dernier refrain »');
  await page.click('#bwArrLast [data-v="demi"]'); await page.waitForTimeout(600);
  let e = await page.evaluate(() => StepSeq.assistantEtat());
  const fin = e.scenes.find((x) => /final/.test(x.nom));
  ok(fin && fin.tonalite.tonic === 'E' && e.structure[e.structure.length - 2].scene === fin.id, `dernier refrain +½ ton : ${fin && fin.nom} en ${fin && fin.tonalite.tonic}`);
  ok((await page.getAttribute('#bwArrLast .active', 'data-v')) === 'demi', 'le raccourci montre +½ ton');
  if (SHOT) await page.screenshot({ path: SHOT + '-arrangement.png' });
  await page.click('#bwArrLast [data-v="0"]'); await page.waitForTimeout(600);
  e = await page.evaluate(() => StepSeq.assistantEtat());
  ok(!e.scenes.some((x) => /final/.test(x.nom)), 'Même tonalité : la copie finale est retirée');
  // Claude : refrain final un ton plus haut, avec la même mélodie (un musicien Mélodie)
  await page.evaluate(() => StepSeq.assistantMusicien({ ajouter: 'melody' })); await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => StepSeq.assistantChangement({ scene: 'chorus', geste: 'ton', ou: 'dernier' }));
  ok(r2.passage === 'préparé' && /final/.test(r2.scene), `assistantChangement ou: "dernier" : ${r2.message}`);
  const mel = await page.evaluate(() => {
    const res = SS.band._state.wiz.res;
    const notes = (sec) => { const s = res.scenes.find((x) => x.sec === sec); const d = Object.entries(s.data).find(([k, v]) => /lead/.test(k) && v && v.events && v.events.length); return d ? d[1].events.map((x) => x.notes[0]) : []; };
    const fin = Object.keys(SS.band._state.wiz.secs).find((id) => SS.band._state.wiz.secs[id].kc);
    return { a: notes('chorus'), b: notes(fin) };
  });
  ok(mel.a.length > 4 && mel.a.length === mel.b.length && mel.b.every((n, i) => n - mel.a[i] === 2), 'refrain final : même mélodie, un ton plus haut');
  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close(); server.close();
})();
