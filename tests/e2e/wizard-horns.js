/*
 * Test de bout en bout du musicien Cuivres (section, js/horns.js) et de son étape (assistant « Nouvelle chanson », js/band.js) :
 *   node tests/e2e/wizard-horns.js        (SHOTS=dossier : captures)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf', '.mp3': 'audio/mpeg' };
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
  await page.click('#bandStyles [data-v="funk"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next();

  // étape Instruments : ajouter une section de cuivres, sa formation (★ celle du style)
  await page.click('#bgAdd');
  await page.click('.bg-tyc[data-type="horns"]');
  await page.waitForTimeout(200);
  ok((await page.locator('.bg-ensc[data-form]').count()) === 10 && /Funk ★/.test(await page.textContent('#bandPanel')), 'Cuivres : dix formations, celle du style marquée ★');
  await page.click('#bgValidate');
  await page.waitForTimeout(400);
  const keys = () => page.evaluate(() => SS.band.insSteps().find((T) => T.kind === 'horns').cols.map((c) => c.o.band.key));
  ok(JSON.stringify(await keys()) === JSON.stringify(['horns:funk-tp', 'horns:funk-ts', 'horns:funk-tb', 'horns:funk-bs']), 'un seul instrument, quatre musiciens (une piste chacun)');
  await page.click('.bg-ensc[data-form="salsa"]');
  await page.waitForTimeout(300);
  ok((await keys()).length === 4 && (await keys())[0] === 'horns:salsa-t1', 'formation Salsa : deux trompettes, deux trombones');

  // étape Cuivres
  const n = await page.evaluate(() => SS.band.stepNum({ inst: SS.band.insSteps().find((T) => T.kind === 'horns').id }));
  while ((await W()).step < n) await next();
  ok((await page.getAttribute('#bwStepHead', 'data-kind')) === 'horns', `étape ${n} : Cuivres`);
  await page.click('.bh-scene[data-sec="chorus"]');
  await page.waitForTimeout(300);
  ok((await page.locator('#bwHornsTable .bwhn-row[data-player]').count()) === 4 && (await page.locator('#bwHornsJeu .bwhn-jeu').count()) === 4, 'une ligne par musicien, quatre jeux');
  ok((await page.locator('#bwHornsJeu .bwhn-jeu.active').getAttribute('data-v')) === 'sig' && (await page.locator('#bwHornsTable [data-player="t1"] .bwhn-nt').count()) > 4, 'refrain : le jeu du style (Mambo 2-3), des notes sur la ligne');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cuivres-app-etape.png') });
  await page.click('#bwHornsJeu [data-v="coups"]');
  await page.waitForTimeout(250);
  await page.click('#bwHornsTable [data-player="t2"] .bwor-sw');
  await page.waitForTimeout(250);
  await page.click('#bwHornsNu [data-v="f"]');
  await page.waitForTimeout(250);
  const w = await W();
  const hs = w.parts.chorus.inst[Object.keys(w.parts.chorus.inst).find((k) => w.parts.chorus.inst[k].horns)].horns;
  ok(JSON.stringify(hs) === '{"jeu":"coups","off":["t2"],"nu":"f"}', 'jeu, musicien coupé et nuance : réglages de la scène');
  ok((await page.textContent('#bwHornsTable [data-player="t2"] .bwhn-role')) === 'Coupé' && /Coups sur la clave/.test(await page.textContent('.bh-scene[data-sec="chorus"]')), 'la ligne coupée le dit, la colonne des scènes aussi');
  // Muet / Solo : écoute seulement
  const before = JSON.stringify((await W()).parts);
  await page.click('#bwHornsTable [data-player="b1"] .bwor-ms.s');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => [...SS.band._state.wiz.solo].some((id) => /salsa-b1/.test(id))) && JSON.stringify((await W()).parts) === before, 'S : le trombone 1 seul à l’écoute, rien n’est réécrit');
  await page.click('#bwHornsTable [data-player="b1"] .bwor-ms.s');
  // + Musicien : une doublure, une piste de plus
  await page.selectOption('#bwHornsAdd', 'sb');
  await page.waitForTimeout(400);
  ok((await keys()).includes('horns:salsa-a1_sb') && (await page.locator('#bwHornsTable .bwhn-row[data-player="a1"]').count()) === 1, '+ Musicien : un sax baryton en doublure, sur sa piste');

  // la chanson créée : une piste par musicien, des notes dans la tessiture
  while (!(await page.isVisible('#bwCreate'))) await next();
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const proj = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const hn = proj.tracks.filter((t) => t.band && /^horns:/.test(t.band.key));
  ok(hn.length === 5, `cinq pistes de cuivres créées (${hn.length})`);
  const R = await page.evaluate(() => Object.fromEntries(SS.horns.players('salsa', ['sb']).map((p) => [p.key, [p.lo, p.hi]])));
  ok(hn.every((t) => {
    const [lo, hi] = R[t.band.key.split(':')[1]];
    return proj.scenes.every((s) => ((s.data[t.id] || {}).events || []).every((e) => e.notes.every((m) => m >= lo && m <= hi)));
  }) && hn.filter((t) => proj.scenes.some((s) => ((s.data[t.id] || {}).events || []).length)).length === 5, 'notes jouées, toutes dans la tessiture de leur instrument');
  // retour dans l'assistant depuis la grille : la section revient avec sa formation et sa doublure
  const back = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return SS.bandGroup.fromGrid({ id: 'x', musicians: [] }, [{ type: 'horns', name: 'Cuivres', form: 'salsa', add: ['sb'] }, { type: 'bass', name: 'B', opts: {} }], 'latin').group.list[0].ms;
  });
  ok(JSON.stringify(back) === '{"on":true,"form":"salsa","add":["sb"]}', 'Grille → Assistant : formation et doublure reprises');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
