/*
 * Test de bout en bout de l'assistant « Nouvelle chanson » (menu de l'application, js/band.js) :
 *   node tests/e2e/new-song-wizard.js
 * 1. Modèle (Band) → 2. la chanson en vue session (une ligne par scène, une colonne par piste)
 * → 3. Batterie (motif de la scène, parts) → 4. Accords (grille de la scène, tonalité, durées, fenêtre « Trouver l'inspiration »)
 * → 7. Basse → 8. Nappes → 9. Arpèges (réglages par scène, voir tests/e2e/wizard-parts.js)
 * → 8. Mélodie (caractère et notes par phrase par scène, phrases, M / S / volume) → 9. Intégration (pistes à importer)
 * → la chanson créée suit exactement l'aperçu.
 * La fenêtre Band n'a plus d'onglet Mélodie.
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
const SHOTS = process.env.SHOTS;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => {
    if (!sessionStorage.seed) {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      sessionStorage.seed = '1';
    }
  }, demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));

  // bouton Nouvelle (en-tête, ancien Band) : le même assistant, sur le projet en cours ; l'ancien écran n'existe plus
  await page.click('#bandBtn');
  ok((await page.locator('#bandModes, #bandMelody, #melGo, #bandSongBtn, #bandCreate, #bandTempo').count()) === 0, 'Band : plus d’ancien écran (Créer les pistes, Créer toute la chanson)');
  ok((await page.isVisible('#bandWizSteps')) && /^Nouvelle chanson/.test(await page.textContent('#bandTitle')) && /Nouvelle/.test(await page.textContent('#bandBtn')) && !/Band/.test(await page.textContent('#bandBtn')) && !(await page.isVisible('#bwEmpty')), 'bouton Nouvelle (plus de Band) : l’assistant en cinq étapes');
  await page.keyboard.press('Escape');

  // 1. Modèle
  await page.click('#appMenuBtn');
  ok(/Nouvelle chanson/.test(await page.textContent('#newProject')), 'menu : « Nouvelle chanson… »');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#bandDialog'), 'l’assistant s’ouvre');
  ok(/Nouvelle chanson/.test(await page.textContent('#bandTitle')), 'titre « Nouvelle chanson »');
  ok((await page.locator('#bandWizSteps li').count()) === 11 && (await page.locator('#bandWizSteps li.cur').textContent()).includes('Style'), 'onze étapes, la première : Style');
  ok(!(await page.isVisible('#bwTransport')), 'étape 1 : pas de bandeau de commande');
  ok((await P()).tracks.length === 0, 'une chanson vide est déjà en place');
  ok(!(await page.isVisible('#bandStage')) && (await page.isVisible('#bandStyles')) && (await page.isVisible('#bwEmpty')) && (await page.isVisible('#bwNext')), 'étape 1 : styles et inspirations (pas de musiciens) avec « Suivant »');
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0'); // Smalltown Boy

  // 2. Instruments : les musiciens, General MIDI ; 3. Tempo et tonalité
  await page.click('#bwNext');
  ok((await page.locator('#bandWizSteps li.cur').textContent()).includes('Instruments') && (await page.isVisible('#bandStage')) && (await page.isVisible('#bandGm')) && !(await page.isVisible('#bandStyles')), 'étape 2 : Instruments, la scène des musiciens et General MIDI');
  await page.click('#bwNext');
  ok((await page.locator('#bandWizSteps li.cur').textContent()).includes('Tempo') && (await page.isVisible('#bwTransport')) && !(await page.isVisible('#bandStage')), 'étape 3 : Tempo et tonalité, avec le bandeau de commande');

  // 4. Scènes : une ligne par scène, une colonne par piste
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  const g = await page.evaluate(() => ({
    rows: document.querySelectorAll('.bw-grid tbody tr').length,
    cols: document.querySelectorAll('.bw-grid .bw-tracks th').length,
    scenes: [...document.querySelectorAll('.bw-sname')].map((x) => x.textContent),
    clips: document.querySelectorAll('.bw-clip').length,
    planned: SS.band.plannedTracks().length,
  }));
  ok(g.rows === 5 && g.scenes.join() === 'Intro,Couplet,Refrain,Pont,Outro', `une ligne par scène (${g.scenes.join(', ')})`);
  ok(g.cols === g.planned && g.cols >= 8, `une colonne par piste (${g.cols})`);
  ok(g.clips > g.rows * 3, `des clips dans les cases (${g.clips})`);
  ok(/Do mineur/.test(await page.textContent('.bw-info')), 'tonalité, tempo et durée de la chanson');
  ok(await page.isVisible('#bwTransport'), 'bandeau de commande dans l’en-tête');
  ok((await page.inputValue('#bwTempo')) === '132' && /Do mineur/.test(await page.textContent('#bwKey')) && /3 ♭ · i = Cm/.test(await page.textContent('#bwKey')), 'bandeau : tempo 132 et tonalité Do mineur (3 ♭)');
  ok(!(await page.isVisible('#bwTempoBack')), 'tempo d’origine : pas de rappel');
  await page.click('#bwSlower');
  await page.fill('#bwTempo', '126');
  await page.press('#bwTempo', 'Enter');
  ok((await page.inputValue('#bwTempo')) === '126' && /126 BPM/.test(await page.textContent('.bw-info')), 'tempo réglé à 126 (durée recalculée)');
  ok((await page.isVisible('#bwTempoBack')) && /origine 132/.test(await page.textContent('#bwTempoBack')), 'rappel du tempo d’origine');
  await page.fill('#bwTempo', '999');
  await page.press('#bwTempo', 'Enter');
  ok((await page.inputValue('#bwTempo')) === '240', 'tempo borné à 240');
  await page.click('#bwTempoBack');
  ok((await page.inputValue('#bwTempo')) === '132', '« origine 132 » revient au tempo de l’inspiration');
  await page.fill('#bwTempo', '128');
  await page.press('#bwTempo', 'Enter');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-chanson.png') });

  // 3. Batterie : la bibliothèque de motifs, celui de l'inspiration choisi tant qu'on n'a rien réglé
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  ok((await page.locator('#bandWizSteps li.cur').textContent()).includes('Batterie'), 'étape 5 : Batterie');
  ok((await page.locator('.bwp-pat').count()) === 21 && (await page.locator('.bwp-pat.on').getAttribute('data-id')) === '', 'batterie : 20 motifs et celui de l’inspiration, choisi');
  ok((await page.locator('.bh-scene .bh-ssub').first().textContent()) === 'Inspiration' && (await page.evaluate(() => Object.keys(SS.band._state.wiz.parts).length)) === 0, 'batterie : une première visite ne change rien');

  // 4. Accords : la grille de la scène choisie (comme dans Harmonie), la tonalité, les durées, l'inspiration
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  ok((await page.locator('#bandWizSteps li.cur').textContent()).includes('Accords'), 'étape 6 : Accords');
  ok((await page.locator('#bandWizSteps li').allTextContents()).join(' ').includes('Intégration'), 'étape 11 : Intégration');
  const layout = await page.evaluate(() => {
    const nav = document.querySelector('#bandWiz .bh-scenes').getBoundingClientRect();
    const tr = document.querySelector('#bwTransport').getBoundingClientRect();
    const head = document.querySelector('.band-head').getBoundingClientRect();
    const sh = document.querySelector('#bwStepHead').getBoundingClientRect();
    return { navTop: nav.top - sh.bottom, inHead: !!document.querySelector('.band-head > #bwTransport'), trIn: tr.top >= head.top - 1 && tr.bottom <= head.bottom + 1, below: nav.top >= head.bottom };
  });
  ok(layout.inHead && layout.trIn && layout.below && layout.navTop >= 0 && layout.navTop <= 24, 'lecture dans l’en-tête, colonne des scènes sous la tête d’étape');
  ok((await page.locator('.bh-scene').count()) === 5 && (await page.locator('.bh-scene.on .bh-sname b').textContent()) === 'Intro', 'scènes à gauche, la première choisie');
  const gnames = () => page.$$eval('#bwLane .gr-blk', (bs) => bs.map((b) => b.querySelector('b').textContent));
  ok((await gnames()).join(' ') === 'Cm B♭ A♭ B♭ Cm B♭ A♭ B♭', `grille de l’intro : ${(await gnames()).join(' ')}`);
  ok((await page.inputValue('#bwTonic')) === 'C' && (await page.inputValue('#bwMode')) === 'minor' && (await page.inputValue('#bwSnap')) === 'beat', 'tonalité Do mineur, aimant au temps');
  ok((await page.locator('.gr-fams .gr-tok').count()) >= 7, 'palette Simple : les accords de la tonalité par rôle');
  await page.click('#bwPalAdv');
  ok((await page.locator('.gr-adv .gr-chip').count()) > 20, 'palette Avancé : 7, 9, sus…');
  await page.click('#bwPalSimple');
  // un accord : durée en temps
  const introChords = () => page.evaluate(() => SS.band._state.wiz.res.scenes.find((s) => s.sec === 'intro').spans.map((x) => [x.step, x.len, x.chord.rootPc]));
  await page.click('#bwLane .gr-blk >> nth=0');
  ok(await page.isVisible('#bwChordSel'), 'clic sur un accord : sa barre de réglage');
  await page.click('#bwChordSel [data-len="8"]');
  let ic = await introChords();
  ok(ic[0][1] === 8 && ic[1][0] === 8 && ic[1][1] === 24, `Cm sur 2 temps : B♭ commence plus tôt (${JSON.stringify(ic.slice(0, 2))})`);
  await page.click('#bwChordSel [data-len="20"]').catch(() => {});
  await page.click('#bwChordSel [data-len="32"]');
  ic = await introChords();
  ok(ic[0][1] === 32 && ic[1][0] === 32 && ic[1][2] === 8, 'Cm sur 2 mesures : il prend sur les suivants');
  ok(/accords modifiés/.test(await page.textContent('.bh-scene.on')), 'la scène est marquée « accords modifiés »');
  // glisser un accord de la palette sur la mesure 4
  const tokIv = page.locator('.gr-fams .gr-tok', { hasText: 'Fm' }).first();
  const lane = await page.locator('#bwLane').boundingBox();
  const tb = await tokIv.boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lane.x + lane.width * (3.1 / 8), lane.y + 20, { steps: 6 });
  await page.mouse.up();
  ic = await introChords();
  ok(ic.some((x) => x[0] === 48 && x[1] === 4 && x[2] === 5), 'Fm posé au temps 1 de la mesure 4 (un temps)');
  // tonalité : Ré mineur, les degrés restent
  await page.selectOption('#bwTonic', 'D');
  ok((await gnames())[0] === 'Dm' && /Ré mineur/.test(await page.textContent('#bwKey')), 'Ré mineur : la grille est transposée (degrés gardés)');
  await page.click('#bwGridBack');
  ok((await gnames()).join(' ') === 'Cm B♭ A♭ B♭ Cm B♭ A♭ B♭' && !(await page.isVisible('#bwGridBack')), '↺ Inspiration : accords et tonalité d’origine');
  // fenêtre « Trouver l'inspiration » sur le refrain : écouter, Annuler, puis Choisir
  await page.click('.bh-scene >> nth=2');
  const chorusKey = () => page.evaluate(() => SS.band._state.wiz.res.scenes.find((s) => s.sec === 'chorus').key);
  const chorus0 = JSON.stringify(await page.evaluate(() => SS.band._state.wiz.res.scenes.find((s) => s.sec === 'chorus').spans));
  await page.click('#bwInspBtn');
  ok(await page.isVisible('#bwInsp'), 'Trouver l’inspiration : la fenêtre s’ouvre');
  ok((await page.locator('#bwInsp [data-mode]').count()) === 7 && (await page.locator('#bwInsp [data-emo]').count()) >= 1 && (await page.locator('#bwInsp [data-pick]').count()) === 3, 'modes, émotions et trois propositions');
  ok(await page.isDisabled('#bwiChoose'), 'rien de choisi : « Choisir » grisé');
  await page.click('#bwInsp [data-mode="minor"]');
  await page.click('#bwInsp [data-emo="tristesse"]');
  await page.click('#bwInsp [data-pick="0"]');
  await page.waitForTimeout(300);
  const pv = await page.evaluate(() => SS.band._state.wiz.res.scenes.find((s) => s.sec === 'chorus').spans.map((x) => x.chord.tok));
  ok(JSON.stringify(await page.evaluate(() => SS.band._state.wiz.res.scenes.find((s) => s.sec === 'chorus').spans)) !== chorus0, `proposition choisie : la scène joue ses accords (${pv.join(' ')})`);
  ok(await page.evaluate(() => SS.band._listen() && SS.band._state.wiz.res.scenes.some((s) => s.sec === 'chorus')), 'la scène tourne en boucle avec la proposition');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-inspiration.png') });
  await page.click('#bwiCancel');
  ok(!(await page.isVisible('#bwInsp')) && JSON.stringify(await page.evaluate(() => SS.band._state.wiz.res.scenes.find((s) => s.sec === 'chorus').spans)) === chorus0, 'Annuler : la scène garde ses accords');
  await page.click('#bwInspBtn');
  await page.keyboard.press('Escape');
  ok(!(await page.isVisible('#bwInsp')) && (await page.isVisible('#bandDialog')), 'Échap : ferme la fenêtre d’inspiration, pas l’assistant');
  await page.click('#bwInspBtn');
  await page.click('#bwInsp [data-mode="dorian"]');
  await page.click('#bwInsp [data-pick="0"]');
  const want = (await page.textContent('#bwiChoose')).replace('Choisir : ', '');
  const wantKey = (await page.textContent('#bwInsp [data-pick="0"] .hm-ex-meta')).split(' · ')[0];
  await page.click('#bwiChoose');
  ok(!(await page.isVisible('#bwInsp')), 'Choisir : la fenêtre se ferme');
  const ck = await chorusKey();
  ok(ck.tonic === 'C' && (await page.evaluate((k) => SS.harmony.label(k), ck)) === wantKey && (await page.inputValue('#bwMode')) === ck.mode, `les accords et la tonalité de la proposition (${want}, ${wantKey})`);
  ok(/Espoir/.test(await page.textContent('.bh-scene.on')), 'la colonne rappelle l’émotion choisie');
  ok([...new Set(await gnames())].join(' – ') === [...new Set(want.split(' – '))].join(' – '), 'la grille du refrain : les accords choisis');
  await page.click('#bwStop');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-accords.png') });
  await page.click('#bwGridBack'); // le refrain revient à l'inspiration pour la suite
  await page.click('.bh-scene >> nth=0');

  // 7. Basse, 8. Nappes, 9. Arpèges : une scène à gauche, les réglages de la scène choisie
  for (const [n, label, sel] of [[7, 'Basse', '.bwp-mode'], [8, 'Nappes', '.bwp-mode'], [9, 'Arpèges', '.bwa-knob']]) {
    await page.click('#bwNext');
    await page.waitForTimeout(200);
    ok((await page.locator('#bandWizSteps li.cur').textContent()).includes(label), `étape ${n} : ${label}`);
    ok((await page.locator('.bh-scene').count()) === 5 && (await page.locator(sel).count()) >= (n === 9 ? 4 : 8) && !!(await page.$('.band-head > #bwTransport')), `${label} : scènes à gauche, réglages à droite, lecture dans l’en-tête`);
  }

  // 8. Mélodie : la scène choisie, les phrases de la mélodie, ses accords (comme dans Harmonie) et les instruments dessous
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  ok((await page.locator('#bandWizSteps li.cur').textContent()).includes('Mélodie'), 'étape 10 : Mélodie');
  ok((await page.locator('.bh-scene').count()) === 5 && (await page.locator('.bh-scene.on .bh-sname b').textContent()) === 'Intro', 'scènes à gauche, la première choisie');
  ok(!!(await page.$('.band-head > #bwTransport')), 'lecture dans l’en-tête');
  const hc = await page.evaluate(() => [...document.querySelectorAll('.bh-chord')].map((c) => [c.querySelector('small').textContent, c.querySelector('b').textContent, c.className]));
  ok(hc.length === 8 && hc[0][0] === 'i' && hc[0][1] === 'Cm' && /role-repos/.test(hc[0][2]) && hc[1][1] === 'B♭', `piste d’accords : ${hc.map((c) => c[1]).join(' ')}`);
  ok(!(await page.isVisible('.bw-hint')) && !(await page.isVisible('.bw-info')), 'en-tête sans petits textes');
  ok((await page.locator('.bh-lane').count()) === 1 && (await page.locator('.bh-lane.mel').count()) === 1 && (await page.locator('.bh-drums').count()) === 0, 'accompagnement replié : seule la mélodie sous les accords');
  await page.click('#bwAcc');
  ok((await page.locator('.bh-row.bh-drums .bh-hit').count()) > 0 && /Pistes · (\d+) \/ \1/.test(await page.textContent('#bwTracks summary')), 'toutes les pistes affichées par défaut (batterie comprise)');
  const lanes = await page.$$eval('.bh-lane', (ls) => ls.map((l) => l.querySelector('.bh-name b').textContent));
  ok(lanes.length >= 4 && !lanes.some((n) => /Kick|Snare|Hi-Hat/.test(n)), `instruments sous les accords (${lanes.join(', ')})`);
  const pad = page.locator('.bh-lane', { hasText: 'Nappe' }).first();
  ok((await pad.locator('.bh-note').count()) > 0 && /100 % dans l’accord/.test(await pad.textContent()), 'la nappe : toutes ses notes dans l’accord');
  const rowsN = await page.locator('.bh-lane, .bh-drums').count();
  ok((await page.locator('.bh-row .bh-vol').count()) === rowsN && (await page.locator('.bh-row .bw-m, .bh-row .bw-s').count()) === 0 && (await page.locator('#bwTrackbar .tb-chip').count()) >= 4 && (await page.locator('#bwTbSolo').count()) === 1, `volume sur chaque instrument (${rowsN}), Muet / Seule dans la barre de piste`);
  ok((await page.locator('.bh-lane.mel').count()) === 1, 'la ligne de la mélodie est marquée');
  // menu « Pistes » : une case par piste (batterie en une), la mélodie ne se masque pas
  await page.click('#bwTracks summary');
  const tn = await page.locator('#bwTracksPop input').count();
  ok(tn === lanes.length + 1 && (await page.locator('#bwTracksPop label.mel input:disabled').count()) === 1, `menu Pistes : ${tn} cases, la mélodie verrouillée`);
  await page.locator('#bwTracksPop label', { hasText: 'Batterie' }).locator('input').uncheck();
  ok((await page.locator('.bh-drums').count()) === 0 && (await page.locator('.bh-lane').count()) === lanes.length && (await page.isVisible('#bwTracksPop')), 'Batterie décochée : masquée, le menu reste ouvert');
  await page.click('#bwTracksMel');
  ok((await page.locator('.bh-lane').count()) === 1 && (await page.locator('.bh-lane.mel').count()) === 1 && /Pistes · 1 \//.test(await page.textContent('#bwTracks summary')), 'Aucune : seule la mélodie');
  await page.click('#bwTracksAll');
  ok((await page.locator('.bh-lane').count()) === lanes.length && (await page.locator('.bh-drums').count()) === 1, 'Tout : tout revient');
  await page.click('#bwTracks summary');
  await page.click('.bh-scene >> nth=2');
  ok((await page.locator('.bh-scene.on .bh-sname b').textContent()) === 'Refrain', 'clic sur une scène : ses accords');
  ok((await page.locator('.bh-lane', { hasText: 'Lead' }).locator('.bh-note.out').count()) > 0, 'notes de passage du lead dessinées en creux');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-harmonie.png') });

  // mélodie : Générer (panneau Mélodie d'Harmonie) ne change que la scène choisie
  const leadSig = () => page.evaluate(() => {
    const w = SS.band._state.wiz;
    return JSON.stringify(w.res.scenes.map((sc) => Object.entries(sc.data).filter(([id]) => id.includes(':lead')).map(([, d]) => d.events.map((e) => e.notes[0]))));
  });
  const bassSig = () => page.evaluate(() => JSON.stringify(SS.band._state.wiz.res.scenes.map((sc) => Object.entries(sc.data).filter(([id]) => id.includes(':bass')).map(([, d]) => d.events))));
  const otherLeads = () => page.evaluate(() => JSON.stringify(SS.band._state.wiz.res.scenes.filter((s) => s.sec !== 'chorus').map((sc) => Object.entries(sc.data).filter(([id]) => id.includes(':lead')).map(([, d]) => d.events))));
  ok(!!(await page.$('#bwMelPanel #melIntent')) && !(await page.$('#bwChars')) && !(await page.$('.bh-phrases')), 'l’onglet Mélodie d’Harmonie remplace caractère et phrases');
  const lead0 = await leadSig();
  const bass0 = await bassSig();
  const others0 = await otherLeads();
  await page.click('#bwMelGo');
  await page.waitForTimeout(300);
  ok((await leadSig()) !== lead0 && (await otherLeads()) === others0 && (await bassSig()) === bass0, 'Générer : une autre mélodie pour le refrain seulement, les autres musiciens ne changent pas');
  ok(/Mélodie générée/.test(await page.textContent('#bwMelSrc')) && /inspiration/.test(await page.textContent('.bh-scene >> nth=0')), 'la colonne rappelle la source de chaque scène');
  await page.click('#bwMelBack');
  await page.waitForTimeout(300);
  ok((await leadSig()) === lead0, '↺ Inspiration revient à la première mélodie');
  await page.selectOption('#melComplexity', 'simple');
  await page.click('#melMore summary');
  await page.selectOption('#melRange', 'voix');
  await page.click('#bwMelGo');
  await page.waitForTimeout(300);
  const comp = await page.evaluate(() => {
    const ev = SS.band._state.wiz.parts.chorus.lead.events;
    return { n: ev.length, lo: Math.min(...ev.map((e) => e.notes[0])), hi: Math.max(...ev.map((e) => e.notes[0])) };
  });
  ok(comp.n > 0 && (await otherLeads()) === others0, `refrain : ${comp.n} notes générées, les autres scènes gardent la mélodie de l’inspiration`);
  ok(comp.lo >= 60 && comp.hi <= 72, 'tessiture voix moyenne');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-melodie.png') });
  const chosen = await page.evaluate(() => {
    const w = SS.band._state.wiz;
    const sc = w.res.scenes.find((s) => s.sec === 'chorus');
    const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
    return JSON.stringify(sc.data[id].events.map((e) => [e.step, e.len, e.notes]));
  });

  // volume de la nappe : −6 dB à l'écoute, gardé dans la chanson créée
  if (!(await page.evaluate(() => SS.audio.isPlaying()))) await page.click('.bh-loop'); // Générer a déjà lancé la boucle de la scène
  await page.waitForTimeout(300);
  const padCol = await page.locator('.bh-lane', { hasText: 'Nappe' }).first().getAttribute('data-col');
  const padBase = await page.evaluate((c) => SS.band._listen().tracks.find((t) => t.col === c).volume, padCol);
  await page.locator('.bh-lane', { hasText: 'Nappe' }).first().locator('.bh-vol').evaluate((e) => {
    e.value = -6;
    e.dispatchEvent(new Event('input'));
  });
  const padNow = await page.evaluate((c) => SS.band._listen().tracks.find((t) => t.col === c).volume, padCol);
  ok(Math.abs(padNow / padBase - 0.501) < 0.01, `volume de la nappe : −6 dB à l’écoute (${padBase} → ${padNow.toFixed(3)})`);
  await page.click('#bwTrackbar .tb-chip >> nth=0');
  ok(await page.evaluate(() => SS.band._listen().tracks.filter((t) => t.mute).length >= 1), 'pastille « On entend » : coupe l’instrument à l’écoute');
  await page.click('#bwTrackbar .tb-chip >> nth=0');
  await page.click('#bwStop');

  // 9. Intégration
  await page.click('#bwNext');
  ok((await page.locator('.bw-grid input[type=checkbox]').count()) > 5, 'étape 11 : des cases à cocher par musicien et par élément');
  ok(!(await page.$('#bandWiz #bwTransport')) && !!(await page.$('.band-head > #bwTransport')), 'étape 11 : la lecture reste dans l’en-tête');
  const bassBox = page.locator('.bw-group', { hasText: 'Bassiste' }).locator('input');
  await bassBox.uncheck();
  const hhBox = page.locator('.bw-track', { hasText: 'Hi-Hat ouvert' }).locator('input');
  await hhBox.uncheck();
  ok(await page.evaluate(() => document.querySelector('.bw-group input').indeterminate), 'batterie à moitié cochée');
  ok((await page.locator('.bw-cell.off').count()) === 10, 'les colonnes décochées sont grisées');
  ok(/pistes à importer/.test(await page.textContent('#bwCount')), 'compte des pistes à importer');
  await page.click('.bw-actions button:text-is("Rien")');
  ok(await page.isDisabled('#bwCreate'), 'aucune piste : création impossible');
  await page.click('.bw-actions button:text-is("Tout")');
  await bassBox.uncheck();
  await hhBox.uncheck();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-pistes.png') });
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  ok(!(await page.isVisible('#bandDialog')), 'la fenêtre se ferme');
  const p = await P();
  ok(!p.tracks.some((t) => t.band && t.band.key.startsWith('bass')) && !p.tracks.some((t) => t.name === 'Hi-Hat ouvert'), 'basse et charleston ouvert non importés');
  ok(p.tracks.length === g.cols - 2, `${p.tracks.length} pistes importées`);
  ok(p.scenes.length === 5 && p.playMode === 'song' && p.tempo === 128, `scènes, mode Chanson et tempo choisi dans le bandeau (${p.tempo})`);
  const lead = p.tracks.find((t) => t.band && t.band.key === 'lead');
  const chorus = p.scenes.find((s) => s.name === 'Refrain');
  const got = JSON.stringify(((chorus.data[lead.id] || {}).events || []).map((e) => [e.step, e.len, e.notes]));
  ok(got === chosen, 'la mélodie créée est celle de l’aperçu');
  const padT = p.tracks.find((t) => t.band && `${t.band.musician}:${t.band.key}` === padCol);
  ok(padT && Math.abs(padT.volume - padBase * 0.501) < 0.005, `volume de la nappe gardé dans la chanson (${padT && padT.volume})`);

  // Échap : la chanson reste vide
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(!(await page.isVisible('#bandDialog')) && (await P()).tracks.length === 0, 'Échap : chanson vide');

  // téléphone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) await page.click('#bwNext');
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  ok(overflow <= 1, 'téléphone : la grille défile dans son cadre, pas la fenêtre');
  ok(await page.isVisible('#bwNext'), 'téléphone : boutons visibles');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
