/*
 * Test de bout en bout de l'étape Mélodie de l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-melody.js
 * L'étape monte l'onglet Mélodie d'Harmonie (js/melodypanel.js) pour la scène choisie : Générer écrit
 * S.wiz.parts[section].lead (la mélodie de la scène dans l'aperçu et dans la chanson créée), un état du panneau par scène,
 * Variante B, retour à la mélodie de l'inspiration, accompagnement dessous.
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
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  /** Mélodie générée d'une scène : parts[section].inst[id].lead (réglage de l'instrument). */
  const LD = (pp) => Object.values((pp && pp.inst) || {}).map((x) => x.lead).find(Boolean);
  const parts = () => page.evaluate(() => JSON.parse(JSON.stringify(SS.band._state.wiz.parts)));
  const next = async (n = 1) => {
    for (let i = 0; i < n; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  };
  const cur = async () => (await page.locator('#bandWizSteps li.cur').textContent()).trim();
  const scene = async (name) => {
    await page.click(`.bh-scene:has(.bh-sname b:text-is("${name}"))`);
    await page.waitForTimeout(250);
  };
  /** Notes de la mélodie d'une scène dans l'aperçu de l'assistant. */
  const lead = (name) =>
    page.evaluate((n) => {
      const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === n);
      const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
      return sc.data[id].events.map((e) => [e.step, e.len, e.notes]);
    }, name);
  const sig = async (n) => JSON.stringify(await lead(n));
  const generated = () => page.evaluate(() => !!document.querySelector('#melOut .mel-roll'));

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(9);

  // l'étape : le panneau Mélodie d'Harmonie, sans les contrôles de la piste ni sa propre lecture
  ok(((await page.textContent('#bwKindTag').catch(() => '')) || '').includes('Mélodie'), 'étape 10 : Mélodie (pastille du type de l’étape)');
  ok(!!(await page.$('#bwMelPanel .mel-body')) && !!(await page.$('#melIntent')) && !!(await page.$('#melMotifRow')), 'panneau : intention, motif de départ et note pivot');
  ok(!(await page.$('#melTrack')) && !(await page.$('#melListen')) && !(await page.$('#melGrid')) && !(await page.$('#melKey')), 'pas de champ Piste, de lecture, de grille ni de tonalité');
  ok(!!(await page.$('#melMeter')) && !!(await page.$('#melComplexity')) && !!(await page.$('#melMore')), 'structure, complexité et options');
  ok(!!(await page.$('#bwMelGo')) && !!(await page.$('#bwMelVarB')) && (await page.isDisabled('#bwMelVarB')), 'Générer et Variante B (désactivée avant de générer)');
  ok(/Mélodie de l’inspiration/.test(await page.textContent('#bwMelSrc')) && !(await page.$('#bwMelBack')), '« Mélodie de l’inspiration », pas de ↺');
  ok((await page.$$eval('.bh-ssub', (xs) => xs.map((x) => x.textContent))).every((t) => t === 'inspiration'), 'colonne des scènes : « inspiration »');
  ok(!(await page.$('#bwChars')) && !(await page.$('#bwNotes')) && !(await page.$('.bh-phrases')) && !(await page.$('#bwMelFine')), 'plus de caractère, de notes par phrase ni de cartes de phrases');
  ok((await page.locator('.bh-board .bh-chord').count()) > 0 && (await page.locator('.bh-board .bh-lane.mel').count()) === 1, 'grille de la scène en lecture seule : accords et mélodie');
  ok(!(await page.$('#bandWiz #hmFoot')) && (await page.locator('#bwAcc').count()) === 1, 'ligne d’accompagnement sous le panneau');
  const accBelow = await page.evaluate(() => document.querySelector('#bwMelPanel').getBoundingClientRect().bottom <= document.querySelector('#bwAcc').getBoundingClientRect().top + 1);
  ok(accBelow, 'l’accompagnement est sous le panneau');

  await scene('Couplet');
  const name = 'Couplet';
  const sec = await page.evaluate(() => SS.band._state.wiz.hsec);
  const insp = await sig(name);
  ok(insp.length > 4, `la mélodie de l’inspiration joue dans « ${name} »`);
  ok(Object.keys(await parts()).length === 0, 'rien n’est réglé avant de générer');

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-melodie.png') });
  // Générer : la mélodie de la scène change, parts[section].lead est écrit, la scène se joue
  await page.click('#bwMelGo');
  await page.waitForTimeout(500);
  const p1 = await parts();
  ok(!!p1[sec] && !!LD(p1[sec]) && LD(p1[sec]).events.length > 0, 'parts[section].inst[id].lead écrit');
  const g1 = await sig(name);
  ok(g1 !== insp, 'la mélodie de la scène dans l’aperçu a changé');
  ok(JSON.stringify(LD(p1[sec]).events.map((e) => [e.step, e.len, e.notes])) === g1, 'l’aperçu joue exactement les notes de la proposition');
  ok(await generated(), 'la proposition est affichée (piano roll)');
  ok(/Mélodie générée/.test(await page.textContent('#bwMelSrc')) && !!(await page.$('#bwMelBack')) && (await page.textContent('#bwMelGo')).includes('Une autre'), '« Mélodie générée », ↺ Inspiration offert, bouton « Une autre »');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  ok(await page.evaluate(() => SS.audio.isPlaying() && !!SS.band._listen().scenes.length), 'la boucle de la scène joue la nouvelle mélodie');
  const heard = await page.evaluate((n) => {
    const sc = SS.band._listen().scenes.find((x) => x.name === n);
    const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
    return JSON.stringify(sc.data[id].events.map((e) => [e.step, e.len, e.notes]));
  }, name);
  ok(heard === g1, 'le projet d’écoute joue la mélodie générée');
  ok(!/inspiration/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'la colonne des scènes affiche le profil');

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-melodie-panneau.png') });
  // Une autre : une autre proposition
  await page.click('#bwMelGo');
  await page.waitForTimeout(400);
  ok((await sig(name)) !== g1, 'Une autre : une autre mélodie');

  // un état par scène : réglages gardés, restaurés au retour
  await page.selectOption('#melComplexity', 'simple');
  await page.fill('#melMeter', '6 6');
  const emoVal = await page.inputValue('#melEmo');
  const other = 'Refrain';
  const g2 = await sig(name);
  await scene(other);
  ok((await page.inputValue('#melComplexity')) === 'balanced' && (await page.inputValue('#melMeter')) === '' && !(await generated()), `autre scène (${other}) : réglages neufs, pas de proposition`);
  ok((await sig(name)) === g2 && (await page.$$eval('.bh-scene', (xs, n) => xs.find((x) => x.querySelector('b').textContent === n).querySelector('.bh-ssub').textContent !== 'inspiration', name)), 'la mélodie de la première scène est gardée');
  await page.selectOption('#melComplexity', 'adventurous');
  await scene(name);
  ok((await page.inputValue('#melComplexity')) === 'simple' && (await page.inputValue('#melMeter')) === '6 6' && (await page.inputValue('#melEmo')) === emoVal, 'retour : réglages restaurés (complexité, structure, émotion)');
  ok(await generated(), 'retour : la proposition est restaurée');
  ok((await sig(name)) === g2 && !!LD((await parts())[sec]), 'retour : la mélodie de la scène est inchangée');
  await scene(other);
  ok((await page.inputValue('#melComplexity')) === 'adventurous', 'l’autre scène a gardé son propre réglage');
  await scene(name);

  // Variante B : il faut une émotion (profil)
  if (!(await page.evaluate(() => !!document.querySelector('#melIntent .mel-pname')))) await page.selectOption('#melEmo', { index: 2 });
  await page.click('#bwMelGo');
  await page.waitForTimeout(400);
  ok(!(await page.isDisabled('#bwMelVarB')), 'Variante B disponible avec un profil');
  const beforeB = await sig(name);
  await page.click('#bwMelVarB');
  await page.waitForTimeout(400);
  ok(!!(await page.$('.mel-variant')) && (await sig(name)) !== beforeB, 'Variante B : la mélodie de la scène change');
  ok(JSON.stringify(LD((await parts())[sec]).events.map((e) => [e.step, e.len, e.notes])) === (await sig(name)), 'Variante B : parts[section].lead suit');
  await page.click('#melVarA');
  await page.waitForTimeout(300);
  ok((await sig(name)) === beforeB && !(await page.$('.mel-variant')), 'Revenir à A : la mélodie d’avant');

  // ↺ Inspiration : la mélodie de l'inspiration revient
  await page.click('#bwMelBack');
  await page.waitForTimeout(400);
  ok(!(await parts())[sec] && (await sig(name)) === insp, '↺ Inspiration : la mélodie de l’inspiration revient, parts[section].lead effacé');
  ok(/Mélodie de l’inspiration/.test(await page.textContent('#bwMelSrc')) && !(await generated()) && !(await page.$('#bwMelBack')), 'la source et le panneau le disent');
  ok((await page.inputValue('#melComplexity')) === 'simple', 'les réglages du panneau sont gardés');

  // accompagnement : M / S / volume sans toucher au panneau
  await page.click('#bwMelGo');
  await page.waitForTimeout(400);
  const g3 = await sig(name);
  await page.selectOption('#melComplexity', 'balanced');
  await page.click('#bwAcc');
  ok((await page.locator('.bw-melacc .bh-lane').count()) >= 3 && (await page.inputValue('#melComplexity')) === 'balanced' && (await generated()), 'accompagnement déplié sous le panneau, le panneau reste tel quel');
  const bassIns = await page.evaluate(() => SS.band.insSteps().find((t) => t.kind === 'bass').id);
  await page.locator(`#bwTrackbar .tb-chip[data-ins="${bassIns}"]`).click();
  ok((await page.evaluate(() => SS.band._listen().tracks.filter((t) => t.mute).length)) === 1 && (await generated()), 'pastille Basse : un instrument coupé, la proposition reste affichée');
  await page.locator(`#bwTrackbar .tb-chip[data-ins="${bassIns}"]`).click();
  await page.click('#bwTracks summary');
  ok((await page.locator('#bwTracksPop input').count()) >= 4, 'menu Pistes');
  await page.click('#bwTracks summary');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-melodie-accomp.png') });

  // aller-retour entre étapes
  await page.click('#bandWizSteps li:nth-child(5) button');
  await page.waitForTimeout(300);
  ok((await cur()).includes('Accords'), 'retour à l’étape Accords');
  await page.click('#bandWizSteps li:nth-child(10) button');
  await page.waitForTimeout(300);
  ok((await sig(name)) === g3 && !!LD((await parts())[sec]) && (await generated()), 'aller-retour entre étapes : la proposition est gardée');

  // une scène où l'inspiration ne chante pas : Générer la fait chanter
  await scene('Intro');
  ok((await lead('Intro')).length === 0, 'Intro : pas de mélodie dans l’inspiration');
  await page.click('#bwMelGo');
  await page.waitForTimeout(400);
  ok((await lead('Intro')).length > 0 && !!LD((await parts()).intro), 'Intro : la mélodie générée joue');
  await page.click('#bwMelBack');
  await page.waitForTimeout(300);
  ok((await lead('Intro')).length === 0 && !(await parts()).intro, 'Intro : ↺ Inspiration la rend muette comme avant');
  await scene(name);

  // une autre tonalité pour la scène (étape Accords) : la proposition ne colle plus, la scène revient à l'inspiration
  await scene('Pont');
  await page.click('#bwMelGo');
  await page.waitForTimeout(400);
  ok(!!LD((await parts()).bridge), 'Pont : mélodie générée');
  await page.evaluate(() => (SS.band._state.wiz.keys.bridge = { tonic: 'D', mode: 'minor' }));
  await page.click('#bandWizSteps li:nth-child(6) button');
  await page.click('#bandWizSteps li:nth-child(10) button');
  await page.waitForTimeout(400);
  ok(!(await parts()).bridge && !(await generated()), 'accords changés : la proposition est effacée, la scène rejoue l’inspiration');
  await page.evaluate(() => delete SS.band._state.wiz.keys.bridge);
  await scene(name);

  // Créer : la mélodie créée est celle de l'aperçu, scène par scène
  await scene(other);
  await page.click('#bwMelGo');
  await page.waitForTimeout(400);
  const gOther = await sig(other);
  const previews = await page.evaluate(() => Object.fromEntries(SS.band._state.wiz.res.scenes.map((sc) => {
    const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
    return [sc.name, sc.data[id].events.map((e) => [e.step, e.len, e.notes])];
  })));
  await next(1);
  ok((await cur()).includes('Effets et transitions'), 'étape Effets et transitions');
  await next(1);
  ok((await cur()).includes('Mix'), 'étape Mix');
  await next(1);
  ok((await cur()).includes('Intégration'), 'étape Intégration');
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  ok(!(await page.isVisible('#bandDialog')), 'la fenêtre se ferme');
  const proj = await P();
  const leadT = proj.tracks.find((t) => t.band && t.band.key === 'lead');
  const made = (n) => JSON.stringify(((proj.scenes.find((s) => s.name === n).data[leadT.id] || {}).events || []).map((e) => [e.step, e.len, e.notes]));
  ok(made(name) === g3 && made(other) === gOther, 'la chanson créée porte exactement les mélodies générées des deux scènes');
  const untouched = proj.scenes.filter((s) => s.name !== name && s.name !== other);
  ok(untouched.length > 0 && untouched.every((s) => made(s.name) === JSON.stringify(previews[s.name])), 'les autres scènes gardent la mélodie de l’inspiration (celle de l’aperçu)');

  // Harmonie n'hérite pas de l'état de l'assistant
  ok(await page.evaluate(() => SS.melodyPanel._state.emo === 'scene' && SS.melodyPanel._state.res === null && SS.melodyPanel._state.complexity === 'balanced'), 'le panneau d’Harmonie repart d’un état neuf');

  // téléphone : rien ne déborde, les boutons restent atteignables
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(9);
  const over = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  const wide = await page.evaluate(() => document.querySelector('#bwMelPanel').scrollWidth - document.querySelector('#bwMelPanel').clientWidth);
  ok(over <= 1 && wide <= 1 && (await page.isVisible('#bandClose')), 'téléphone : la fenêtre et le panneau ne débordent pas');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-melodie-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
