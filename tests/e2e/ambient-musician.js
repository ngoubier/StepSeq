/*
 * Test de bout en bout : le musicien Ambient de l'assistant « Nouvelle chanson » (js/band.js, ambBody) :
 *   node tests/e2e/ambient-musician.js [dossier-captures]
 * On ajoute un musicien Ambient (type, puis module Paysage), on règle sa présence et son mouvement dans une scène, puis on
 * crée la chanson : une piste générative Paysage, sans notes, avec sa courbe de présence et son envoi Cosmos. Dans la grille,
 * on redessine sa courbe et on ajoute une piste générative Jardin à la main : de retour dans l'assistant, chacune a son
 * musicien Ambient, la courbe redessinée est gardée (« retouchée »). Outils Claude : assistantJeu({ presence, mouvement }).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2];
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
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  page.setDefaultTimeout(8000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.setItem('stepseq.autosave', SS.serialize(SS.newProject())));
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('#viewWiz');
  await page.waitForTimeout(400);
  if (await page.isVisible('#brgSkip')) await page.click('#brgSkip');
  await page.evaluate(() => StepSeq.assistantStyle({ style: 'ambient' }));
  await page.evaluate(() => StepSeq.assistantEtape({ etape: 'instruments' }));
  await page.waitForTimeout(300);

  // Ajouter un musicien : type Ambient, puis module Paysage (il en prend le nom)
  await page.click('text=Ajouter un musicien');
  ok(await page.isVisible('.bg-tyc[data-type="ambient"]'), 'type « Ambient » dans Nouveau musicien');
  await page.click('.bg-tyc[data-type="ambient"]');
  await page.click('.bg-modc[data-mod="paysage"]');
  ok((await page.inputValue('#bgAddName')) === 'Paysage', 'il porte le nom de son module');
  await page.click('#bgValidate');
  await page.waitForTimeout(300);
  const mu = await page.evaluate(() => SS.band._state.group.list.find((r) => r.type === 'ambient'));
  ok(mu && mu.ms.mod === 'paysage', 'musicien Ambient ajouté au groupe (module Paysage)');

  // son étape : présence et mouvement de l'Intro
  await page.click(`.bw-sn:visible:has-text("Paysage")`);
  await page.waitForTimeout(500);
  ok(await page.isVisible('#bwAmbFrise'), 'étape du musicien : frise de présence sur toute la chanson');
  await page.click('#bwAmbPres [data-v="far"]');
  await page.click('#bwAmbMove [data-v="up"]');
  await page.waitForTimeout(300);
  const part = await page.evaluate(() => {
    const S = SS.band._state;
    const sec = Object.keys(S.wiz.parts).find((k) => S.wiz.parts[k].inst && S.wiz.parts[k].inst['x1:ambient']);
    return sec && S.wiz.parts[sec].inst['x1:ambient'].amb;
  });
  ok(part && part.p === 'far' && part.mv === 'up', 'réglage de la scène : Lointain, Monte');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'musicien-ambient-etape.png') });
  // outil Claude : présence d'une autre scène
  const j = await page.evaluate(() => StepSeq.assistantJeu({ musicien: 'Paysage', scenes: 'toutes', presence: 'premier plan', mouvement: 'respire' }));
  ok(j.ok && j.scenes.every((x) => /Premier plan · respire/.test(x.joue)), 'assistantJeu : présence et mouvement par scène');
  await page.evaluate(() => StepSeq.assistantJeu({ musicien: 'Paysage', scene: 'intro', presence: 'lointain', mouvement: 'monte', hasard: 0.2 }));

  // créer la chanson (grille vide : directement)
  await page.evaluate(() => StepSeq.assistantCreer({}));
  await page.waitForTimeout(1500);
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const amb = g.tracks.find((x) => x.family === 'ambient' && x.instrument === 'paysage');
  ok(g.tracks.some((x) => x.family === 'ambient' && x.instrument === 'jardin'), 'le Jardin du modèle (musicien Ambient d’office) est aussi dans la chanson');
  ok(!!amb && amb.instrument === 'paysage', 'chanson créée : une piste générative Paysage');
  ok(amb && Array.isArray(amb.ambient.presence) && amb.ambient.presence.length === 48 && amb.ambient.presence[0] < 0.25, 'sa courbe de présence vient des scènes (Intro lointaine qui monte)');
  ok(amb && Array.isArray(amb.ambient.rands) && amb.ambient.rands[0] === 0.2, 'hasard de l’Intro');
  ok(amb && amb.fx && amb.fx.sendSpace === 0.5, 'envoi Cosmos');
  ok(amb && g.scenes.every((sc) => !sc.data || !sc.data[amb.id] || !(sc.data[amb.id].events || []).length), 'aucune note écrite');

  // dans la grille : courbe redessinée, et une piste générative Jardin ajoutée à la main
  await page.click('#viewGrid');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const a = p.tracks.find((x) => x.family === 'ambient' && x.instrument === 'paysage');
    a.ambient.presence = a.ambient.presence.map((v, i) => (i < 24 ? 0.3 : 0.9));
    const j = SS.newTrack({ type: 'instrument', name: 'Mon jardin', family: 'ambient', instrument: 'jardin' }, p);
    j.ambient = { rand: 0.7 };
    p.tracks.push(j);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('#viewWiz');
  await page.waitForTimeout(600);
  if (await page.isVisible('#brgGo')) await page.click('#brgGo');
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => {
    const S = SS.band._state;
    return S.group.list.filter((r) => r.type === 'ambient' || (r.ms && r.ms.mod)).map((r) => ({ name: r.name, mod: r.ms && r.ms.mod, drawn: !!(r.ms && r.ms.drawn), rand: r.ms && r.ms.amb && r.ms.amb.rand }));
  });
  const pay = back.find((x) => x.mod === 'paysage');
  const jar = back.find((x) => x.mod === 'jardin' && x.name === 'Mon jardin');
  ok(!!pay && pay.drawn, 'Grille → Assistant : le Paysage revient, sa courbe redessinée gardée (retouchée)');
  ok(!!jar && jar.rand === 0.7, 'la piste Jardin faite à la main devient un musicien Ambient : ' + JSON.stringify(back));
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
