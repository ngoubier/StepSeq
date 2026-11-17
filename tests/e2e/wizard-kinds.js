/*
 * Test de bout en bout du type d'instrument dans l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-kinds.js
 * Stepper : Accords en 5, un onglet par instrument (le kit de batterie en un), Mix et Intégration à la fin ; pas de carte de type dans les onglets (étiquette en lecture seule)
 * ; liste « Type » du panneau de l'étape 2 (kit : désactivée sur Drums) ; la nappe passée en Arpèges (éditeur Arp One, résumé, pastille, note, réglage par instrument et par scène) ;
 * l'étiquette de type de l'étape Instruments ; la chanson créée porte les notes arpégées.
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
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const tab = async (kind) => {
    await page.click(`#bandWizSteps li[data-kind="${kind}"] button`);
    await page.waitForTimeout(300);
  };

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0'); // Smalltown Boy : batterie, basse, nappe, arpège, lead
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);

  // stepper : fondations, un onglet par instrument, Finaliser
  const lis = await page.$$eval('#bandWizSteps li', (l) => l.map((x) => ({ t: x.textContent, kind: x.dataset.kind || null, group: x.dataset.group || null })));
  const ins = await page.evaluate(() => SS.band.insSteps().map((t) => [t.kind, t.kit]));
  ok(lis[4].t.includes('Accords') && lis[4].kind === null, 'Accords est l’étape 5');
  ok(ins.length === 5 && lis.filter((x) => x.kind).length === 5 && lis.slice(5, 10).every((x) => x.kind), 'un onglet par instrument, de 6 à 10');
  ok(ins.filter((x) => x[1]).length === 1 && ins[0][0] === 'drums', 'le kit de batterie (toutes ses pièces) est un seul onglet');
  ok(lis[10].t.includes('Mix') && lis[10].group === 'Finaliser' && lis[11].t.includes('Intégration') && lis.length === 12, 'Mix puis Intégration à la fin, groupe « Finaliser »');
  ok(lis[5].group === 'Instruments, scène par scène' && lis[0].group === 'Fondations', 'trois groupes');
  ok(await page.evaluate(() => SS.band.stepNum('mix') === 11 && SS.band.stepNum('pick') === 12 && SS.band.stepNum({ inst: SS.band.insSteps()[1].id }) === 7 && SS.band.stepRef(7).inst === SS.band.insSteps()[1].id), 'stepNum / stepRef : adresses stables');

  // onglets : plus de cartes de type, étiquette en lecture seule dans la tête
  await tab('drums');
  ok((await page.locator('.bw-kind, .bw-kinds, #bwKinds').count()) === 0 && (await page.locator('#bwKindTag').textContent()) === 'Drums' && (await page.locator('#bwKindTag').evaluate((e) => e.tagName)) === 'SPAN', 'kit : plus de cartes de type, étiquette « Drums » en lecture seule');
  ok((await page.locator('#bwKindNote').count()) === 0 && (await page.locator('.bwp-pat').count()) === 21, 'kit : pas de note, l’éditeur de motifs');
  await tab('bass');
  ok((await page.locator('#bwKindTag').textContent()) === 'Basse' && (await page.locator('.bwp-mode').count()) === 21 && (await page.locator('#bwKindNote').count()) === 0, 'basse : étiquette « Basse », éditeur de basse, pas de note');

  // étape 2 : le type est une liste dans le panneau de droite
  const toStep2 = async () => {
    await page.click('#bandWizSteps li:nth-child(2) button');
    await page.waitForTimeout(300);
  };
  const selectMu = async (i) => {
    if ((await page.getAttribute(`#bandStage .band-mus >> nth=${i}`, 'aria-pressed')) !== 'true') await page.click(`#bandStage .band-mus >> nth=${i}`);
    await page.waitForTimeout(250);
  };
  await toStep2();
  ok((await page.locator('#bandKinds').count()) === 0, 'la liste d’étiquettes #bandKinds n’existe plus');
  const mus = await page.$$eval('#bandStage .band-mus', (l) => l.map((x) => x.textContent));
  const kindOfMu = async (i) => {
    await selectMu(i);
    return page.$$eval('#bandPanel .bpn-ksel', (l) => l.map((x) => ({ v: x.value, dis: x.disabled, n: x.options.length, ok: [...x.options].map((o) => o.textContent).join(',') })));
  };
  let ks = [];
  for (let i = 0; i < mus.length; i++) ks.push(await kindOfMu(i));
  const kitIdx = ks.findIndex((k) => k[0] && k[0].dis);
  await selectMu(kitIdx);
  ok(kitIdx >= 0 && (await page.locator('#bandPanel .bpn-ksel:disabled').count()) === 1 && (await page.inputValue('#bandPanel .bpn-ksel')) === 'drums' && /kit de batterie/i.test(await page.textContent('#bandPanel .bpn-kind')), 'kit : liste Type désactivée sur Drums, avec explication');
  ok(await page.evaluate(() => document.querySelector('#bandPanel .bpn-head').nextElementSibling.id === 'bpnKind'), 'la liste Type est juste sous le titre du panneau');
  const bassIdx = ks.findIndex((k) => k[0] && k[0].v === 'bass');
  await selectMu(bassIdx);
  ok((await page.locator('#bandPanel .bpn-ksel option').allTextContents()).join(',') === 'Drums,Basse,Accords,Arpèges,Mélodie', 'basse : les cinq types dans la liste');
  await page.selectOption('#bandPanel .bpn-ksel', 'melody');
  await page.waitForTimeout(250);
  ok((await page.inputValue('#bandPanel .bpn-ksel')) === 'melody' && (await page.locator('#bandWizSteps li[data-kind="melody"]').count()) === 2, 'basse en Mélodie : la liste et le stepper suivent');
  await page.selectOption('#bandPanel .bpn-ksel', 'bass');
  await page.waitForTimeout(250);
  ok((await page.inputValue('#bandPanel .bpn-ksel')) === 'bass' && (await page.locator('#bandWizSteps li[data-kind="melody"]').count()) === 1, 'retour à Basse');

  // nappe → Arpèges, depuis le panneau de l'étape 2
  const padIdx = ks.findIndex((k) => k[0] && k[0].v === 'chords');
  await selectMu(padIdx);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/kinds2-step2.png' });
  const padLi = page.locator('#bandWizSteps li[data-kind="chords"]');
  const padSum0 = await padLi.locator('.bw-ss').textContent();
  ok(padSum0.startsWith('Accords') && (await padLi.getAttribute('style')).includes('#4f6bff'), `nappe : résumé « ${padSum0} », pastille bleue`);
  await page.selectOption('#bandPanel .bpn-ksel', 'arp');
  await page.waitForTimeout(400);
  ok((await page.locator('#bandPanel .bpn-kdesc').allTextContents()).every((x) => !/était/.test(x)), 'étape 2 : plus de ligne « était une nappe » sous la liste Type');
  const padId = await page.evaluate(() => SS.band.insSteps().find((t) => t.def === 'chords').id);
  ok((await page.evaluate((id) => SS.band.insSteps().find((t) => t.id === id).kind, padId)) === 'arp' && (await page.locator('#bandWizSteps li[data-kind="chords"]').count()) === 0, 'la nappe est de type Arpèges');
  const padLi2 = page.locator('#bandWizSteps li[data-kind="arp"]').nth(0);
  ok((await padLi2.locator('.bw-ss').textContent()).startsWith('Arpège') && ((await padLi2.getAttribute('style')) || '').includes('#13c2a3'), 'résumé « Arpège · … » et pastille turquoise');
  ok(await page.evaluate(() => Object.keys(SS.band._state.wiz.kinds).length === 1), 'S.wiz.kinds garde le choix');
  await tab('arp');
  ok(!!(await page.$('#bwaMotif')) && (await page.locator('.bwa-knob').count()) === 4 && (await page.locator('.bw-kind').count()) === 0, 'l’éditeur Arp One s’affiche, sans cartes de type');
  ok((await page.locator('#bwKindTag').textContent()) === 'Arpèges', 'étiquette « Arpèges » en lecture seule');
  ok((await page.locator('#bwKindNote, .bw-kindnote').count()) === 0 && !/était/.test(await page.textContent('#bandWiz')), 'plus de note « était une nappe »');
  // « On entend » : une pastille par instrument, nom de l'onglet et couleur de son type
  const chipInfo = await page.$$eval('#bwTrackbar .tb-chip', (l) => l.map((x) => [x.dataset.ins, x.textContent.trim(), x.style.getPropertyValue('--c')]));
  const expChips = await page.evaluate(() => SS.band.insSteps().map((t) => [t.id, t.name, t.kind]));
  const COL = { drums: '#e3179c', bass: '#3fcf3f', chords: '#4f6bff', arp: '#13c2a3', melody: '#9b5cff' };
  ok(chipInfo.length === expChips.length && chipInfo.every((c, i) => c[0] === expChips[i][0] && c[1] === expChips[i][1] && c[2] === COL[expChips[i][2]]), `pastilles « On entend » : une par instrument (${chipInfo.map((c) => c[1]).join(', ')}), nom de l’onglet et couleur du type`);
  ok(chipInfo.find((c) => c[0] === padId)[2] === '#13c2a3', 'la nappe passée en arpèges : pastille turquoise');
  await page.click('#play');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.locator(`#bwTrackbar .tb-chip[data-ins="${padId}"]`).click();
  const mutedNow = await page.evaluate(() => SS.band._listen().tracks.filter((t) => t.mute).map((t) => t.col));
  ok(mutedNow.length === 1 && mutedNow[0] === padId, 'couper un instrument ne coupe que lui à l’écoute');
  await page.locator(`#bwTrackbar .tb-chip[data-ins="${padId}"]`).click();
  await page.click('#stop');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/kinds2-pad-arp.png' });
  // un réglage d'arpège sur une scène : parts[section].inst[id]
  await page.locator('.bh-scene:has(.bh-sname b:text-is("Couplet"))').click();
  await page.selectOption('#bwaMotif', 'midnight');
  const part = await page.evaluate((id) => SS.band._state.wiz.parts.verse && SS.band._state.wiz.parts.verse.inst && SS.band._state.wiz.parts.verse.inst[id], padId);
  ok(part && part.one && part.one.mode === 'pattern' && !(await page.evaluate(() => SS.band._state.wiz.parts.verse.arp)), 'réglage de la scène : parts[couplet].inst[id].one (pas par rôle)');
  const verseEv = await page.evaluate((id) => SS.band._state.wiz.res.scenes.find((x) => x.name === 'Couplet').data[id].events, padId);
  ok(verseEv.length > 16 && verseEv.every((e) => e.notes.length === 1), `l’aperçu joue des notes arpégées (${verseEv.length})`);
  // retour au type du rôle depuis l'étape 2 : la note disparaît, S.wiz.kinds est vidé
  await toStep2();
  await selectMu(padIdx);
  await page.selectOption('#bandPanel .bpn-ksel', 'chords');
  await page.waitForTimeout(300);
  await tab('chords');
  ok((await page.locator('#bwKindNote').count()) === 0 && (await page.evaluate(() => Object.keys(SS.band._state.wiz.kinds).length)) === 0 && (await page.locator('.bwp-mode').count()) === 9, 'retour à Accords : plus de note, éditeur d’accords');
  await toStep2();
  await selectMu(padIdx);
  await page.selectOption('#bandPanel .bpn-ksel', 'arp');
  await page.waitForTimeout(300);

  // le Mix suit le nombre de pistes
  const n = await page.evaluate(() => SS.band.stepNum('mix'));
  await page.click(`#bandWizSteps li:nth-child(${n}) button`);
  await page.waitForTimeout(400);
  ok((await page.locator('.mx-strip, .mx-tr').count()) > 0 || (await page.textContent('#bwStepHead')).includes('Mix'), 'étape Mix affichée');

  // 390 px : pas de défilement horizontal
  await page.setViewportSize({ width: 390, height: 844 });
  for (const k of ['drums', 'arp', 'melody']) {
    await tab(k);
    const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    ok(w.s <= w.c, `390 px, onglet ${k} : pas de défilement horizontal (${w.s}/${w.c})`);
  }
  await page.setViewportSize({ width: 1400, height: 900 });

  // Créer la chanson : la piste de la nappe contient des notes arpégées
  await page.click(`#bandWizSteps li:nth-child(12) button`);
  await page.click('#bwCreate');
  await page.waitForTimeout(500);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(900);
  const p = await P();
  const pad = p.tracks.find((t) => t.band && t.band.key === 'pad');
  const evs = p.scenes.flatMap((s) => ((s.data[pad.id] || {}).events || []));
  ok(evs.length > 40 && evs.every((e) => e.notes.length === 1 && e.len <= 4), `la piste de la nappe contient des notes arpégées (${evs.length} notes)`);
  const bass = p.tracks.find((t) => t.band && t.band.key === 'bass');
  ok(!!bass && p.scenes.some((s) => ((s.data[bass.id] || {}).events || []).length > 0), 'la basse est créée, avec des notes');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
