/*
 * Test de bout en bout des jeux de cordes de l'étape Orchestre (assistant « Nouvelle chanson », js/orchjeux.js, js/band.js) :
 *   node tests/e2e/wizard-orch-jeux.js        (SHOTS=dossier : captures de l'étape)
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
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const W = () => page.evaluate(() => JSON.parse(JSON.stringify({ step: SS.band._state.wiz.step, parts: SS.band._state.wiz.parts })));
  const next = async () => {
    await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(150);
  };
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next();

  // Instruments : un Orchestre, effectif « Cordes pop » (sept pistes : quatre pupitres et leurs pizzicati, trémolo)
  await page.click('#bgAdd');
  await page.click('.bg-tyc[data-type="orch"]');
  await page.waitForTimeout(200);
  ok((await page.locator('.bg-ensc[data-ens="cpop"]').count()) === 1 && (await page.locator('.bg-ensc[data-ens="cepique"]').count()) === 1, 'les effectifs de cordes sont proposés');
  await page.click('.bg-ensc[data-ens="cpop"]');
  await page.click('#bgValidate');
  await page.waitForTimeout(400);
  ok(JSON.stringify(await page.evaluate(() => SS.band.insSteps().find((T) => T.kind === 'orch').cols.map((c) => c.o.band.key))) === JSON.stringify(['orch:vl1', 'orch:vl2', 'orch:va', 'orch:vc', 'orch:vlp', 'orch:vlt', 'orch:vcp']), 'Cordes pop : quatre pupitres, puis leurs pistes pizzicato et trémolo');

  const n = await page.evaluate(() => SS.band.stepNum({ inst: SS.band.insSteps().find((T) => T.kind === 'orch').id }));
  while ((await W()).step < n) await next();
  await page.click('.bh-scene[data-sec="chorus"]');
  await page.waitForTimeout(300);
  const stars = await page.$$eval('#bwOrchJeu .mot-card', (els) => els.map((e) => e.dataset.id));
  ok(stars.join() === 'aigues,contre', `refrain : ★ Tenues hautes, Contrechant (${stars})`);
  ok(/Orchestre de « /.test(await page.textContent('#bwOrchMot .bwp-ch')) && /Effectif : /.test(await page.textContent('#bwOrchMot .mot-fixed')) && (await page.locator('#bwOrchJeu .mot-card .bwhn-hits i.x').count()) > 4, 'carte Motif commune : titre, effectif fixe, vignettes des attaques');
  ok(/auto/.test(await page.textContent('#bwOrchJeu .mot-card.on')) && (await page.getAttribute('#bwOrchJeu .mot-card.on', 'data-id')) === 'aigues', 'le premier ★ est joué d’office');
  ok((await page.locator('#bwOrchJeuTable .bwhn-row[data-part]').count()) === 4, 'une ligne par pupitre (les pistes d’articulation sont rangées sous le leur)');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'jeux-refrain.png') });

  // couplet : Pizzicato (auto) → notes pincées sur les pistes vlp / vcp
  await page.click('.bh-scene[data-sec="verse"]');
  await page.waitForTimeout(300);
  ok((await page.getAttribute('#bwOrchJeu .mot-card.on', 'data-id')) === 'pizz' && /pizz/.test(await page.textContent('#bwOrchJeuTable [data-part="vl1"] .bwor-jrole')), 'couplet : Pizzicato, les violons I jouent pincé');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'jeux-couplet-pizz.png') });

  // choisir un jeu (famille Rythmes → Trémolo) : réglage de la scène
  await page.click('#bwOrchFam [data-f="rythmes"]');
  await page.click('#bwOrchJeu [data-id="trem"]');
  await page.waitForTimeout(300);
  let w = await W();
  const mid = Object.keys(w.parts.verse.inst).find((k) => w.parts.verse.inst[k].orch);
  ok(mid && w.parts.verse.inst[mid].orch.jeu === 'trem', 'Trémolo choisi : enregistré dans la scène');
  ok((await page.textContent('#bwOrchJeuTable [data-part="vl1"] .bwhn-role')) === 'Trémolo', 'les violons passent en trémolo');
  await page.click('#bwOrchJeu [data-id="pizz"]');
  await page.waitForTimeout(300);
  w = await W();
  ok(!((((w.parts.verse || {}).inst || {})[mid] || {}).orch || {}).jeu, 'reprendre le jeu conseillé : plus de réglage, retour au jeu d’office');
  // Muet / Solo : tout le pupitre (avec ses pistes d'articulation)
  await page.click('#bwOrchJeuTable [data-part="vl1"] .bwor-ms.s');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => SS.band._state.wiz.solo.size)) === 3, 'S : violons I avec leurs pistes pizzicato et trémolo');
  await page.click('#bwOrchJeuTable [data-part="vl1"] .bwor-ms.s');

  // Claude : les jeux de l'orchestre (assistantMotifs) et un jeu posé sur une scène (assistantJeu)
  const tool = await page.evaluate(() => {
    const T = SS.band.insSteps().find((x) => x.kind === 'orch');
    const m = window.StepSeq.assistantMotifs({ musicien: T.title });
    window.StepSeq.assistantJeu({ musicien: T.title, scene: 'Pont', motif: 'unisson' });
    const p = SS.band._state.wiz.parts.bridge;
    return { n: m.motifs.length, jeu: p && p.inst[T.musician].orch.jeu };
  });
  ok(tool.n === 14 && tool.jeu === 'unisson', `outils Claude : ${tool.n} jeux, Unisson posé sur le pont`);

  // la chanson créée : pistes pincées remplies au couplet, notes dans la tessiture
  while (!(await page.isVisible('#bwCreate'))) await next();
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const proj = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const orch = proj.tracks.filter((t) => t.band && /^orch:/.test(t.band.key));
  const verse = proj.scenes.find((s) => s.name === 'Couplet');
  const evs = (key, sc) => (((sc || verse).data[(orch.find((t) => t.band.key === key) || {}).id] || {}).events || []);
  ok(orch.length === 7 && evs('orch:vlp').length > 8 && evs('orch:vcp').length > 2, 'couplet : les pistes pizzicato jouent');
  const R = await page.evaluate(() => Object.fromEntries(SS.orchestra.PARTS.map((p) => [p.id, [p.lo, p.hi]])));
  ok(orch.every((t) => {
    const [lo, hi] = R[t.band.key.split(':')[1]];
    return proj.scenes.every((s) => ((s.data[t.id] || {}).events || []).every((e) => e.notes.every((m) => m >= lo && m <= hi)));
  }), 'toutes les notes dans la tessiture de leur piste');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
