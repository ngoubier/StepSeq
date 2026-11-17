/*
 * Test de bout en bout du groupe éditable de l'étape 2 « Instruments » (js/band.js, js/bandgroup.js) :
 *   node tests/e2e/wizard-band.js
 * Compteur « N musiciens · 2 à 10 » ; ajout en deux temps (type puis son : les vrais conseillés du type) avec tuile fantôme ; onglet avant Mix
 * et renumérotation ; renommer, dupliquer, ordre ‹ ›, retirer avec confirmation (réglages et tranche de mix effacés) ; limites 2 / 10 ;
 * un deuxième kit Drums ; brouillon sauvegardé et restauré ; « Créer la chanson » : pistes du groupe édité ; pas de défilement
 * horizontal à 390 px.
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
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR', e.message); });
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const count = () => page.textContent('#bgCount').then((t) => t.trim());
  const tiles = () => page.$$eval('#bandStage .band-mus[data-mu]', (xs) => xs.map((x) => ({ id: x.dataset.mu, name: x.querySelector('.bm-role').textContent })));
  const tabs = () => page.evaluate(() => SS.band.insSteps().map((t) => ({ id: t.id, name: t.name, kind: t.kind, kit: t.kit })));
  const lis = () => page.$$eval('#bandWizSteps li', (l) => l.map((x) => x.textContent));
  const pick = async (id) => {
    if (!(await page.locator(`#bandStage .band-mus.sel[data-mu="${id}"]`).count())) await page.click(`#bandStage .band-mus[data-mu="${id}"]`);
    await page.waitForTimeout(150);
  };
  const add = async (type, { sound = 0, name = null } = {}) => {
    await page.click('#bgAdd');
    await page.click(`.bg-tyc[data-type="${type}"]`);
    if (name) await page.fill('#bgAddName', name);
    if (sound) await page.locator('#bandPanel .band-choice .bc-main').nth(sound).click();
    await page.click('#bgValidate');
    await page.waitForTimeout(200);
  };
  const remove = async (id) => {
    await pick(id);
    await page.click('#bgRemove');
    await page.click('#bgRmYes');
    await page.waitForTimeout(200);
  };

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0'); // Smalltown Boy : batterie, basse, nappe, arpège, lead (+ percussionniste facultatif)
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);

  // ---- le groupe par défaut : celui de l'inspiration, compteur, plus de « Dans le groupe » ni de percussionniste optionnel
  ok((await count()) === '5 musiciens · 2 à 10', `compteur : ${await count()}`);
  let t = await tiles();
  ok(t.length === 5 && !t.some((x) => /Percu/i.test(x.name)) && (await page.locator('#bgAdd').count()) === 1, 'cinq tuiles (pas de percussionniste facultatif) et la tuile « Ajouter un musicien »');
  await pick('pad');
  ok((await page.locator('.bpn-on').count()) === 0 && !(await page.textContent('#bandPanel')).includes('Dans le groupe'), 'plus de case « Dans le groupe »');
  ok((await page.inputValue('#bpnName')) === 'Clavier nappe' && (await page.locator('.bpn-ksel').count()) === 1, 'panneau : nom éditable au titre, liste Type');
  ok((await lis()).length === 13 && (await tabs()).length === 5, 'stepper : 13 étapes, 5 onglets d\'instrument');
  const a0 = await page.evaluate(() => JSON.stringify(SS.band.plannedTracks().map((x) => [x.name, x.band.key, x.band.musician])));

  // ---- ajouter un Arpèges : type, son, valider
  await page.click('#bgAdd');
  ok((await page.locator('.bg-tyc').count()) === 5 && (await page.textContent('#bandPanel')).includes('1 / 2'), 'ajout, 1 / 2 : cinq cartes de type');
  ok((await page.textContent('.bg-tyc[data-type="arp"] .bg-has')).trim() === '1 dans le groupe' && (await page.textContent('.bg-tyc[data-type="drums"] .bg-has')).trim() === '1 dans le groupe', 'cartes : « 1 dans le groupe »');
  ok((await page.locator('#bgGhost').count()) === 1 && (await page.locator('#bgAdd').count()) === 0, 'tuile fantôme pendant l\'ajout');
  await page.click('#bgCancel');
  ok((await count()) === '5 musiciens · 2 à 10' && (await page.locator('#bgGhost').count()) === 0 && (await page.locator('#bgAdd').count()) === 1, 'Annuler : rien n\'est ajouté');
  await page.click('#bgAdd');
  await page.click('.bg-tyc[data-type="arp"]');
  ok((await page.textContent('#bandPanel')).includes('2 / 2') && (await page.inputValue('#bgAddName')) === 'Clavier arpège' && (await page.locator('#bgGhost .bm-role').textContent()) === 'Clavier arpège', 'ajout, 2 / 2 : nom par défaut, tuile fantôme au bon nom');
  // les vrais conseillés : ceux de l'arpégiste de l'inspiration
  const names = await page.$$eval('#bandPanel .band-choice .bc-name', (xs) => xs.map((x) => x.textContent));
  const want = await page.evaluate(() => {
    const p = SS.Band.STYLES[0].presets[0];
    // un seul par libellé affiché (deux réglages peuvent s'afficher pareil)
    const seen = new Set();
    return p.musicians
      .find((m) => m.role === 'arp')
      .pick.map((tok) => SS.Band.describe(SS.Band.choiceOpts(tok, 'arp')))
      .filter((d) => {
        const k = [d.kind, d.name, d.detail].join('|');
        return !seen.has(k) && seen.add(k);
      })
      .map((d) => d.name);
  });
  ok(names.length === want.length && names.join('|') === want.join('|'), `Conseillés réels du type (${names.slice(0, 3).join(', ')}…)`);
  const shown = await page.$$eval('#bandPanel .band-choice .bc-main', (xs) => xs.map((x) => x.textContent));
  ok(new Set(shown).size === shown.length, 'Conseillés : aucun son affiché deux fois');
  ok((await page.locator('#bgAllSounds').count()) === 1, '« Tous les instruments… » présent');
  await page.locator('#bandPanel .band-choice .bc-main').nth(2).click(); // un autre son que le phare
  ok((await page.locator('#bandPanel .band-choice.active .bc-name').textContent()) === want[2], 'le son choisi est marqué');
  await page.click('#bgValidate');
  await page.waitForTimeout(200);
  ok((await count()) === '6 musiciens · 2 à 10', `compteur après ajout : ${await count()}`);
  t = await tiles();
  const x1 = t.find((x) => x.id === 'x1');
  ok(x1 && x1.name === 'Clavier arpège' && t.length === 6, 'la tuile est là (sélectionnée)');
  const tb = await tabs();
  const li = await lis();
  ok(tb.length === 6 && tb[5].id === 'x1:arp' && tb[5].kind === 'arp' && li.length === 14 && li[11].includes('Effets et transitions') && li[12].includes('Mix') && li[13].includes('Intégration') && li[12].startsWith('13') && li[10].includes('Clavier arpège'), `onglet avant Effets, Effets 12, Mix 13, Intégration 14 (${li[10].slice(0, 40)})`);
  ok((await page.evaluate(() => SS.band.stepNum('fx') === 12 && SS.band.stepNum('mix') === 13 && SS.band.stepNum('pick') === 14 && SS.band.stepNum({ inst: 'x1:arp' }) === 11)), 'stepNum suit');
  const a1 = await page.evaluate(() => JSON.stringify(SS.band.plannedTracks().filter((x) => x.band.musician !== 'x1').map((x) => [x.name, x.band.key, x.band.musician])));
  ok(a1 === a0, 'les pistes des autres musiciens sont inchangées');
  ok((await page.evaluate(() => SS.band.plannedTracks().find((x) => x.band.musician === 'x1').band.key)) === 'arp', 'piste Arpèges du musicien ajouté');

  // ---- renommer : la tuile et l'onglet suivent
  await page.fill('#bpnName', 'Cloches');
  await page.waitForTimeout(150);
  ok((await tiles()).find((x) => x.id === 'x1').name === 'Cloches' && (await lis())[10].includes('Cloches') && (await tabs())[5].name === 'Cloches', 'renommer : tuile et onglet renommés');
  await page.fill('#bpnName', '');
  await page.dispatchEvent('#bpnName', 'blur');
  ok((await tiles()).find((x) => x.id === 'x1').name === 'Clavier arpège', 'nom vidé : le nom par défaut revient');
  await page.fill('#bpnName', 'Cloches');
  await page.press('#bpnName', 'Enter');
  await page.waitForTimeout(100);

  // ---- réglages et mix de ce musicien, pour vérifier le nettoyage au retrait
  await page.evaluate(() => {
    SS.band.putInstPart('verse', 'x1:arp', { mode: 'up8' });
    SS.band._state.wiz.kinds['x1:arp'] = 'arp';
  });
  await page.click('#bandWizSteps li[data-group="Finaliser"] + li button'); // Mix, qui suit Effets et transitions
  await page.waitForTimeout(500);
  ok((await page.evaluate(() => Object.keys(SS.band._state.wiz.mix.tracks).includes('arp@x1'))), 'Mix : une tranche pour le musicien ajouté');
  ok((await page.locator('#bwMix .mx-strip[data-id="arp@x1"]').count()) === 1, 'la console montre sa tranche');
  await page.click('#bandWizSteps li >> nth=1 >> button');
  await page.waitForTimeout(300);

  // ---- dupliquer
  await pick('x1');
  await page.click('#bgDup');
  await page.waitForTimeout(200);
  t = await tiles();
  ok((await count()) === '7 musiciens · 2 à 10' && t.some((x) => x.name === 'Cloches 2'), 'dupliquer : « Cloches 2 »');
  const g = await page.evaluate(() => SS.band._state.group.list.map((r) => r.id + ':' + r.name));
  ok(g.join() === 'drums:Batteur,bass:Bassiste,pad:Clavier nappe,arp:Clavier ostinato,lead:Clavier lead,x1:Cloches,x2:Cloches 2', `copie juste après l'original : ${g.slice(4).join()}`);
  const same = await page.evaluate(() => { const o = SS.band.plannedTracks().filter((x) => x.band.key === 'arp' && x.band.musician.startsWith('x')); return o.length === 2 && JSON.stringify([o[0].instrument, o[0].family]) === JSON.stringify([o[1].instrument, o[1].family]); });
  ok(same, 'même son que l\'original');

  // ---- ordre : ‹ › (les onglets suivent)
  ok((await page.textContent('#bgOrder')).trim() === 'Ordre 7 / 7' && (await page.locator('#bgRight').isDisabled()), 'Ordre 7 / 7, › désactivé en fin');
  await page.click('#bgLeft');
  ok((await page.textContent('#bgOrder')).trim() === 'Ordre 6 / 7' && (await tabs()).map((x) => x.id).slice(5).join() === 'x2:arp,x1:arp', 'ordre : ‹ remonte la copie, les onglets suivent');
  await page.click('#bgRight');
  ok((await tabs()).map((x) => x.id).slice(5).join() === 'x1:arp,x2:arp', '› la redescend');
  // glisser-déposer : une tuile prend la place d'une autre
  await page.evaluate(() => {
    const a = document.querySelector('#bandStage .band-mus[data-mu="x2"]');
    const c = document.querySelector('#bandStage .band-mus[data-mu="drums"]');
    const dt = new DataTransfer();
    a.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    c.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  });
  await page.waitForTimeout(200);
  ok((await tabs())[0].id === 'x2:arp', 'glisser-déposer : la tuile prend la première place');
  for (let i = 0; i < 6; i++) await page.click('#bgRight'); // x2 revient en dernière place
  ok((await tabs()).map((x) => x.id).join() === 'drums:drums,bass:bass,pad:pad,arp:arp,lead:lead,x1:arp,x2:arp'.replace('drums:drums', 'drums'), 'ordre rétabli');

  // ---- retirer avec confirmation ; réglages, type, tranche de mix disparaissent
  await pick('x2');
  await page.click('#bgRemove');
  ok((await page.locator('#bgConfirm').isVisible()) && (await count()) === '7 musiciens · 2 à 10', 'confirmation en ligne, rien retiré encore');
  await page.click('#bgRmNo');
  ok((await page.locator('#bgConfirm').count()) === 0 && (await count()) === '7 musiciens · 2 à 10', 'Annuler la confirmation : le musicien reste');
  await remove('x2');
  ok((await count()) === '6 musiciens · 2 à 10' && !(await tiles()).some((x) => x.id === 'x2'), 'retiré : compteur et tuiles');
  await remove('x1');
  const clean = await page.evaluate(() => {
    const w = SS.band._state.wiz;
    return { parts: JSON.stringify(w.parts), kinds: JSON.stringify(w.kinds), mix: Object.keys(w.mix.tracks).filter((k) => k.includes('@')), mute: [...w.mute, ...w.solo, ...w.off].filter((k) => k.startsWith('x')), cols: SS.band.insSteps().length };
  });
  ok(!clean.parts.includes('x1') && !clean.kinds.includes('x1') && clean.mix.length === 0 && clean.mute.length === 0 && clean.cols === 5, `réglages, type et tranche de mix effacés (${clean.parts} ${clean.mix})`);
  ok((await lis()).length === 13 && (await lis())[10].includes('Effets et transitions') && (await lis())[11].includes('Mix'), 'stepper renuméroté');

  // ---- limites : 2 minimum, 10 maximum
  for (const id of ['arp', 'pad', 'lead']) await remove(id);
  ok((await count()) === '2 musiciens · 2 à 10', 'deux musiciens');
  await pick('bass');
  ok((await page.locator('#bgRemove').isDisabled()) && (await page.textContent('#bandPanel')).includes('2 musiciens au minimum'), '2 musiciens au minimum : « Retirer » désactivé');
  for (let i = 0; i < 8; i++) await add(['bass', 'chords', 'arp', 'melody'][i % 4]);
  ok((await count()) === '10 musiciens · 2 à 10' && (await page.locator('#bgCount.max').count()) === 1, 'dix musiciens, compteur en alerte');
  ok((await page.locator('#bgAdd').isDisabled()) && (await page.textContent('#bgAdd')).includes('10 musiciens au maximum'), 'tuile « Ajouter » désactivée avec la mention');
  ok((await page.locator('#bgDup').isDisabled()), 'Dupliquer désactivé à 10');
  ok((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), 'pas de défilement horizontal à 1400 px avec 10 musiciens');
  const ids10 = await page.evaluate(() => SS.band.plannedTracks().map((x) => x.band.musician + ':' + x.band.key));
  ok(new Set(ids10).size === ids10.length, 'identifiants de piste uniques');

  // ---- un deuxième kit Drums
  await remove('x3');
  await add('drums', { sound: 0 });
  await page.waitForTimeout(100);
  const kits = await tabs();
  ok(kits.filter((x) => x.kit).length === 2, 'deux onglets de kit');
    await page.click(`#bandWizSteps li[data-kind="drums"] >> nth=1 >> button`);
  await page.waitForTimeout(500);
  ok((await page.locator('.bwp-pat').count()) > 0 && (await page.locator('#bwParts[data-kind="drums"]').count()) === 1, 'l\'éditeur de motifs du 2e kit s\'ouvre');
  const k2 = await page.evaluate(() => { const r = SS.band._state.wiz.res; const sc = r.scenes[1]; const ids = Object.keys(sc.data).filter((k) => k.startsWith('x') && k.includes(':perc:')); return ids.map((k) => (sc.data[k].steps || []).some((v) => v > 0)); });
  ok(k2.length >= 1 && k2.every(Boolean), 'le 2e kit joue (ses pièces ont des coups)');

  // ---- brouillon : le groupe est sauvegardé, puis restauré
  await page.waitForTimeout(1800);
  const before = await page.evaluate(() => SS.band._state.group.list.map((r) => r.id + ':' + r.name).join());
  const pr = await P();
  ok(pr.wizard && pr.wizard.v === 3 && pr.wizard.state.group && pr.wizard.state.group.list.length === 10, 'project.wizard v3 contient le groupe');
  await page.click('#bandClose');
  await page.waitForTimeout(300);
  await page.evaluate(() => SS.band.resume());
  await page.waitForTimeout(500);
  await page.click('#bandWizSteps li >> nth=1 >> button');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => SS.band._state.group.list.map((r) => r.id + ':' + r.name).join());
  ok(after === before && (await count()) === '10 musiciens · 2 à 10', 'brouillon restauré : même groupe, même ordre');
  ok((await tabs()).length === 10 - 0 && (await tabs()).filter((x) => x.kit).length === 2, 'onglets restaurés');
  // un brouillon v1 (sans groupe) est migré
  const mig = await page.evaluate(() => {
    const snap = SS.band.wizSnapshot();
    snap.v = 1;
    delete snap.state.group;
    snap.state.cache = { smalltown: { perc: { on: true }, bass: { on: false } } };
    snap.state.styleId = 'synthwave';
    snap.state.presetId = 'smalltown';
    SS.band.wizRestore(snap);
    return SS.band._state.group.list.map((r) => r.id).join();
  });
  ok(mig === 'drums,perc,pad,arp,lead', `brouillon v1 migré : ${mig}`);
  await page.waitForTimeout(300);
  ok((await count()) === '5 musiciens · 2 à 10', 'migration : compteur');

  // ---- Créer la chanson : les pistes du groupe édité
  await page.evaluate(() => SS.band.openWizard());
  await page.waitForTimeout(500);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);
  ok((await count()) === '5 musiciens · 2 à 10', 'nouvelle ouverture : groupe par défaut');
  await remove('lead');
  await add('arp', { sound: 1, name: 'Cloches' });
  await add('drums');
  await page.evaluate(() => SS.band.stepNum('pick') && (SS.band._state.wiz.step = 1));
  for (let i = 0; i < 14; i++) {
    const dis = await page.evaluate(() => document.querySelector('#bwNext').disabled);
    if (dis || (await page.evaluate(() => SS.band._state.wiz.step === SS.band.stepNum('pick')))) break;
    await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => { const w = SS.band._state.wiz; while (w.step < SS.band.stepNum('pick')) document.querySelector('#bwNext').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.waitForTimeout(400);
  ok((await page.textContent('#bwCount')).includes('pistes') && (await page.isVisible('#bwCreate')), 'étape Intégration');
  await page.click('#bwCreate');
  await page.waitForTimeout(1200);
  const pj = await P();
  const bt = pj.tracks.filter((x) => x.band);
  const mus = [...new Set(bt.map((x) => x.band.musician))];
  ok(!mus.includes('lead') && !bt.some((x) => x.band.key === 'lead'), 'le musicien retiré n\'a pas de piste');
  ok(mus.includes('x1') && mus.includes('x2') && mus.length === 6, `les musiciens ajoutés ont leurs pistes (${mus.join()})`);
  const notes = (id) => pj.scenes.reduce((n, sc) => n + (((sc.data || {})[id] || {}).events || []).length, 0);
  const arpT = bt.find((x) => x.band.musician === 'x1');
  const kitT = bt.filter((x) => x.band.musician === 'x2');
  ok(arpT && notes(arpT.id) > 20, `l'arpège ajouté a des notes (${arpT && notes(arpT.id)})`);
  ok(kitT.length >= 1 && kitT.every((x) => pj.scenes.some((sc) => ((sc.data || {})[x.id] || {}).steps && sc.data[x.id].steps.some((v) => v > 0))), 'le 2e kit a des coups dans les scènes');
  ok(pj.tracks.some((x) => x.name === 'Cloches'), 'la piste porte le nom du musicien');

  // ---- mobile : pas de défilement horizontal à 390 px
  await page.evaluate(() => SS.band.openWizard());
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth)), 'étape 2 à 390 px : pas de défilement horizontal');
  await page.click('#bgAdd');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#bandPanel').scrollWidth <= document.querySelector('#bandPanel').clientWidth + 1)), 'ajout (type) à 390 px : pas de défilement horizontal');
  await page.click('.bg-tyc[data-type="melody"]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#bandPanel').scrollWidth <= document.querySelector('#bandPanel').clientWidth + 1)), 'ajout (son) à 390 px : pas de défilement horizontal');

  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  server.close();
})();
