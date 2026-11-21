/*
 * Test de bout en bout du musicien Orchestre et de son étape Orchestration (assistant « Nouvelle chanson », js/band.js) :
 *   node tests/e2e/wizard-orch.js
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
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
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

  // étape Instruments : ajouter un Orchestre, choisir son effectif
  await page.click('#bgAdd');
  await page.click('.bg-tyc[data-type="orch"]');
  await page.waitForTimeout(200);
  ok((await page.locator('.bg-ensc').count()) >= 4 && (await page.textContent('#bandPanel')).includes('Contrebasses'), 'Orchestre : les effectifs, leurs pupitres');
  await page.click('.bg-ensc[data-ens="strings"]');
  await page.click('#bgValidate');
  await page.waitForTimeout(400);
  const ins = await page.evaluate(() => SS.band.insSteps().map((T) => [T.kind, T.cols.length]));
  ok(JSON.stringify(ins.find((x) => x[0] === 'orch')) === '["orch",5]', 'un seul instrument, cinq pupitres (une piste chacun)');
  await page.click('.bg-ensc[data-ens="chamber"]');
  await page.waitForTimeout(300);
  ok(JSON.stringify(await page.evaluate(() => SS.band.insSteps().find((T) => T.kind === 'orch').cols.map((c) => c.o.band.key))) === JSON.stringify(['orch:fl', 'orch:vl1', 'orch:vl2', 'orch:va', 'orch:hn', 'orch:vc', 'orch:cb']), 'effectif « Cordes, cor et flûte » : sept pupitres');

  // étape Orchestration
  const n = await page.evaluate(() => SS.band.stepNum({ inst: SS.band.insSteps().find((T) => T.kind === 'orch').id }));
  while ((await W()).step < n) await next();
  ok((await page.getAttribute('#bwStepHead', 'data-kind')) === 'orch', `étape ${n} : Orchestration (étape de l’instrument Orchestre)`);
  await page.click('.bh-scene[data-sec="chorus"]');
  await page.waitForTimeout(250);
  ok((await page.locator('#bwOrchTable .bwor-row[data-part]').count()) === 7 && (await page.locator('#bwOrchParts').count()) === 0, 'une seule ligne par pupitre (registre et « qui joue quoi » fusionnés), plus de rangée Pupitres');
  ok((await page.locator('#bwOrchTable .bwor-row[data-part="vl1"] .bwor-lane').count()) === 1 && (await page.textContent('#bwOrchTable .bwor-row[data-part="cb"] .bwor-why')).length > 5, 'la ligne porte le registre et le pourquoi');
  const roleOf = (id) => page.textContent(`#bwOrchTable [data-part="${id}"] .bwor-role`);
  ok((await roleOf('cb')) === 'Basse' && (await roleOf('vl1')) === 'Mélodie' && (await roleOf('hn')) === 'Harmonie', 'refrain (auto : tout l’effectif) : contrebasses à la basse, violons I à la mélodie, cor en harmonie');
  ok(/tessiture/.test(await page.getAttribute('#bwOrchItems', 'title')), 'À voir : tessitures vérifiées (badge)');
  // Muet / Solo : écoute seulement (S.wiz.mute / solo), aucun réglage de scène
  const before = JSON.stringify((await W()).parts);
  await page.click('#bwOrchTable [data-part="vl1"] .bwor-ms.s');
  await page.waitForTimeout(200);
  const solo = await page.evaluate(() => [...SS.band._state.wiz.solo]);
  ok(solo.length === 1 && /vl1/.test(solo[0]) && JSON.stringify((await W()).parts) === before && (await page.getAttribute('#bwOrchTable [data-part="vl1"] .bwor-ms.s', 'aria-pressed')) === 'true', 'S : violons I seuls à l’écoute, rien n’est réécrit');
  await page.click('#bwOrchTable [data-part="vl1"] .bwor-ms.s');
  await page.click('#bwOrchTable [data-part="hn"] .bwor-ms.m');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => SS.band._state.wiz.solo.size === 0 && [...SS.band._state.wiz.mute].some((id) => /hn/.test(id))), 'M : le cor se tait à l’écoute, plus de solo');
  await page.click('#bwOrchTable [data-part="hn"] .bwor-ms.m');
  await page.click('.bh-scene[data-sec="intro"]');
  await page.waitForTimeout(250);
  ok((await roleOf('fl')) === 'Se tait' && (await roleOf('hn')) === 'Se tait', 'intro (auto : léger) : bois et cor se taisent');
  await page.click('#bwOrchLevel [data-v="full"]');
  await page.waitForTimeout(250);
  await page.click('#bwOrchTable [data-part="va"] .bwor-sw');
  await page.waitForTimeout(250);
  const w = await W();
  ok(JSON.stringify(w.parts.intro.inst[Object.keys(w.parts.intro.inst)[0]].orch) === '{"level":"full","off":["va"]}', 'densité et pupitre coupé : réglages de la scène');
  ok((await roleOf('va')) === 'Coupé' && (await roleOf('hn')) === 'Harmonie' && /Tout l’effectif/.test(await page.textContent('.bh-scene[data-sec="intro"]')), 'l’intro joue tout l’effectif sans les altos, la colonne des scènes le dit');

  // la chanson créée : une piste par pupitre, des notes dans la tessiture
  while (!(await page.isVisible('#bwCreate'))) await next();
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const proj = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const orch = proj.tracks.filter((t) => t.band && /^orch:/.test(t.band.key));
  ok(orch.length === 7, `sept pistes d’orchestre créées (${orch.length})`);
  const R = await page.evaluate(() => Object.fromEntries(SS.orchestra.PARTS.map((p) => [p.id, [p.lo, p.hi]])));
  const chorus = proj.scenes.find((s) => s.name === 'Refrain');
  ok(orch.every((t) => {
    const [lo, hi] = R[t.band.key.split(':')[1]];
    return proj.scenes.every((s) => ((s.data[t.id] || {}).events || []).every((e) => e.notes.every((m) => m >= lo && m <= hi)));
  }) && orch.filter((t) => ((chorus.data[t.id] || {}).events || []).length).length >= 6, 'notes jouées, toutes dans la tessiture de leur pupitre');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
