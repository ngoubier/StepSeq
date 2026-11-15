/*
 * Test de bout en bout de l'assistant « Nouvelle chanson » (menu de l'application, js/band.js) :
 *   node tests/e2e/new-song-wizard.js
 * 1. Modèle (Band) → 2. la chanson en vue session (une ligne par scène, une colonne par piste)
 * → 3. Mélodie (caractère, phrases, M / S / volume) → 4. Intégration (pistes à importer) → la chanson créée suit exactement l'aperçu.
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

  // Band (en-tête) : le même assistant, sur le projet en cours ; l'ancien écran n'existe plus
  await page.click('#bandBtn');
  ok((await page.locator('#bandModes, #bandMelody, #melGo, #bandSongBtn, #bandCreate, #bandTempo').count()) === 0, 'Band : plus d’ancien écran (Créer les pistes, Créer toute la chanson)');
  ok((await page.isVisible('#bandWizSteps')) && /^Band/.test(await page.textContent('#bandTitle')) && !(await page.isVisible('#bwEmpty')), 'Band : l’assistant en quatre étapes');
  await page.keyboard.press('Escape');

  // 1. Modèle
  await page.click('#appMenuBtn');
  ok(/Nouvelle chanson/.test(await page.textContent('#newProject')), 'menu : « Nouvelle chanson… »');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#bandDialog'), 'l’assistant s’ouvre');
  ok(/Nouvelle chanson/.test(await page.textContent('#bandTitle')), 'titre « Nouvelle chanson »');
  ok((await page.locator('#bandWizSteps li').count()) === 4 && (await page.locator('#bandWizSteps li.cur').textContent()).includes('Modèle'), 'quatre étapes, la première : Modèle');
  ok(!(await page.isVisible('#bwTransport')), 'étape 1 : pas de bandeau de commande');
  ok((await P()).tracks.length === 0, 'une chanson vide est déjà en place');
  ok((await page.isVisible('#bandStage')) && (await page.isVisible('#bwEmpty')) && (await page.isVisible('#bwNext')), 'étape 1 : l’écran Band avec « Suivant »');
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0'); // Smalltown Boy

  // 2. Chanson : une ligne par scène, une colonne par piste
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
  ok(await page.isVisible('#bwTransport'), 'bandeau de commande sous le titre');
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

  // 3. Mélodie : la scène choisie, les phrases de la mélodie, ses accords (comme dans Key) et les instruments dessous
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  ok((await page.locator('#bandWizSteps li.cur').textContent()).includes('Mélodie'), 'étape 3 : Mélodie');
  ok((await page.locator('#bandWizSteps li').allTextContents()).join(' ').includes('Intégration'), 'étape 4 : Intégration');
  ok((await page.locator('.bh-scene').count()) === 5 && (await page.locator('.bh-scene.on .bh-sname b').textContent()) === 'Intro', 'scènes à gauche, la première choisie');
  const hc = await page.evaluate(() => [...document.querySelectorAll('.bh-chord')].map((c) => [c.querySelector('small').textContent, c.querySelector('b').textContent, c.className]));
  ok(hc.length === 8 && hc[0][0] === 'i' && hc[0][1] === 'Cm' && /role-repos/.test(hc[0][2]) && hc[1][1] === 'B♭', `piste d’accords : ${hc.map((c) => c[1]).join(' ')}`);
  ok(!(await page.isVisible('.bw-hint')) && !(await page.isVisible('.bw-info')) && !(await page.isVisible('.bh-info')), 'en-tête sans petits textes');
  ok((await page.locator('.bh-lane').count()) === 1 && (await page.locator('.bh-lane.mel').count()) === 1 && (await page.locator('.bh-drums').count()) === 0, 'accompagnement replié : seule la mélodie sous les accords');
  await page.click('#bwAcc');
  ok((await page.locator('.bh-row.bh-drums .bh-hit').count()) > 0 && /Pistes · (\d+) \/ \1/.test(await page.textContent('#bwTracks summary')), 'toutes les pistes affichées par défaut (batterie comprise)');
  const lanes = await page.$$eval('.bh-lane', (ls) => ls.map((l) => l.querySelector('.bh-name b').textContent));
  ok(lanes.length >= 4 && !lanes.some((n) => /Kick|Snare|Hi-Hat/.test(n)), `instruments sous les accords (${lanes.join(', ')})`);
  const pad = page.locator('.bh-lane', { hasText: 'Nappe' }).first();
  ok((await pad.locator('.bh-note').count()) > 0 && /100 % dans l’accord/.test(await pad.textContent()), 'la nappe : toutes ses notes dans l’accord');
  const rowsN = await page.locator('.bh-lane, .bh-drums').count();
  ok((await page.locator('.bh-row .bw-m').count()) === rowsN && (await page.locator('.bh-row .bw-s').count()) === rowsN && (await page.locator('.bh-row .bh-vol').count()) === rowsN, `M, S et volume sur chaque instrument (${rowsN})`);
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

  // mélodie : caractère, autre mélodie, phrases (lettre, jeu, longueur), réglages fins
  const leadSig = () => page.evaluate(() => {
    const w = SS.band._state.wiz;
    return JSON.stringify(w.res.scenes.map((sc) => Object.entries(sc.data).filter(([id]) => id.includes(':lead')).map(([, d]) => d.events.map((e) => e.notes[0]))));
  });
  const bassSig = () => page.evaluate(() => JSON.stringify(SS.band._state.wiz.res.scenes.map((sc) => Object.entries(sc.data).filter(([id]) => id.includes(':bass')).map(([, d]) => d.events))));
  const chorusLead = () => page.evaluate(() => {
    const sc = SS.band._state.wiz.res.scenes.find((s) => s.sec === 'chorus');
    return sc.data[Object.keys(sc.data).find((k) => k.includes(':lead'))].events;
  });
  ok((await page.locator('#bwChars .bh-char').count()) === 6 && (await page.getAttribute('#bwChars [data-v="inspiration"]', 'aria-checked')) === 'true', 'six caractères, « Inspiration » par défaut');
  const lead0 = await leadSig();
  const bass0 = await bassSig();
  await page.click('#bwMelody');
  const lead1 = await leadSig();
  ok(lead1 !== lead0, 'Autre mélodie : une autre mélodie');
  ok((await bassSig()) === bass0, 'les autres musiciens ne changent pas');
  ok(/n° 2/.test(await page.textContent('#bwSeed')), 'numéro de la mélodie affiché');
  await page.click('#bwMelodyBack');
  ok((await leadSig()) === lead0, '« Première mélodie » revient à la première');
  await page.click('#bwChars [data-v="chant"]');
  ok((await leadSig()) !== lead0 && (await bassSig()) === bass0 && (await page.getAttribute('#bwChars [data-v="chant"]', 'aria-checked')) === 'true', 'caractère « Chantante » : une autre mélodie, le reste ne change pas');
  // phrases du refrain (8 mesures) : A A′ B A′ de 2 mesures, réglées sur leurs cartes
  const ph = page.locator('.bh-phrases .bh-phr');
  const PH = (i, sel) => `.bh-phr[data-i="${i}"] ${sel}`;
  ok((await ph.count()) === 4 && (await page.locator('.bh-phrases .bh-pl').allTextContents()).join(' ') === 'A A′ B A′', 'refrain : 4 phrases A A′ B A′');
  ok(/Question/.test(await page.textContent('.bh-phr[data-i="0"]')) && /Réponse/.test(await page.textContent('.bh-phr[data-i="1"]')) && /Contraste/.test(await page.textContent('.bh-phr[data-i="2"]')), 'rôles : question, réponse, contraste');
  // 1re phrase : 4 mesures tenues ; la suite en silence → la mélodie ne dure que 4 mesures
  await page.click(PH(0, '.bh-pplus'));
  await page.click(PH(0, '.bh-pplus'));
  ok((await ph.count()) === 3 && /4 mes\./.test(await page.textContent(PH(0, '.bh-plen'))), 'phrase allongée à 4 mesures : elle prend sur la suivante');
  await page.click(PH(0, '[data-v="hold"]'));
  await page.click(PH(1, '[data-v="off"]'));
  await page.click(PH(2, '[data-v="off"]'));
  ok((await ph.count()) === 2 && (await page.locator('.bh-phr.off').count()) === 1 && /4 \/ 8 mes/.test(await page.textContent('.bh-phead')), 'phrases 2 et 3 en silence, réunies : 4 / 8 mesures jouées');
  let ev = await chorusLead();
  const lastEv = ev[ev.length - 1];
  ok(ev.length > 0 && lastEv.step + lastEv.len === 64 && lastEv.len >= 48, `phrase tenue : la dernière note dure ${lastEv.len / 16} mesures, la mélodie s’arrête à la mesure 4`);
  for (let k = 0; k < 3; k++) await page.click(PH(0, '.bh-pminus'));
  ev = await chorusLead();
  ok(ev.length === 1 && ev[0].len >= 14 && (await page.isDisabled(PH(0, '.bh-pminus'))) && (await page.locator('.bh-phr.mini').count()) >= 1, 'phrase d’une mesure tenue : une seule note, carte repliée');
  await page.click(PH(0, '[data-v="on"]'));
  const before = JSON.stringify(await chorusLead());
  await page.click(PH(0, '.bh-proll'));
  ok(JSON.stringify(await chorusLead()) !== before, '🎲 de la phrase : un autre motif');
  await page.click(PH(0, '.bh-pl'));
  ok((await page.textContent(PH(0, '.bh-pl'))) === 'A′', 'clic sur la lettre : le motif suivant');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-phrases.png') });
  await page.click('#bwPhrReset');
  ok((await ph.count()) === 4 && !(await page.isVisible('#bwPhrReset')), '↺ Par défaut : plan de phrases d’origine');
  // réglages fins : 6 notes par phrase, mouvement simple, voix moyenne
  ok(!(await page.isVisible('#bwMelForm')), 'réglages fins repliés');
  await page.click('#bwMelFine');
  await page.selectOption('#bwNotes', '6');
  await page.selectOption('#bwComplexity', 'simple');
  await page.selectOption('#bwRange', 'voix');
  const comp = await page.evaluate(() => {
    const w = SS.band._state.wiz;
    return w.res.scenes.map((sc) => {
      const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
      const ev = sc.data[id].events;
      return { bars: sc.bars, n: ev.length, phr: SS.bandSong.defaultPlan(sc.bars, 'chant').length, lo: Math.min(...ev.map((e) => e.notes[0])), hi: Math.max(...ev.map((e) => e.notes[0])) };
    }).filter((x) => x.n);
  });
  ok(comp.length && comp.every((x) => x.n === x.phr * 6), `6 notes par phrase (${comp.map((x) => x.n).join(', ')} notes)`);
  ok(comp.every((x) => x.lo >= 60 && x.hi <= 72), 'tessiture voix moyenne');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-melodie.png') });
  await page.click('#bwMelFine');
  ok(!(await page.isVisible('#bwMelForm')), 'réglages fins refermés');
  await page.click('#bwMelody');
  const chosen = await page.evaluate(() => {
    const w = SS.band._state.wiz;
    const sc = w.res.scenes.find((s) => s.sec === 'chorus');
    const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
    return JSON.stringify(sc.data[id].events.map((e) => [e.step, e.len, e.notes]));
  });

  // volume de la nappe : −6 dB à l'écoute, gardé dans la chanson créée
  await page.click('.bh-loop');
  await page.waitForTimeout(300);
  const padCol = await page.locator('.bh-lane', { hasText: 'Nappe' }).first().getAttribute('data-col');
  const padBase = await page.evaluate((c) => SS.band._listen().tracks.find((t) => t.col === c).volume, padCol);
  await page.locator('.bh-lane', { hasText: 'Nappe' }).first().locator('.bh-vol').evaluate((e) => {
    e.value = -6;
    e.dispatchEvent(new Event('input'));
  });
  const padNow = await page.evaluate((c) => SS.band._listen().tracks.find((t) => t.col === c).volume, padCol);
  ok(Math.abs(padNow / padBase - 0.501) < 0.01, `volume de la nappe : −6 dB à l’écoute (${padBase} → ${padNow.toFixed(3)})`);
  await page.click('.bh-row .bw-m >> nth=0');
  ok(await page.evaluate(() => SS.band._listen().tracks.filter((t) => t.mute).length >= 1), 'M : coupe l’instrument à l’écoute');
  await page.click('.bh-row .bw-m >> nth=0');
  await page.click('#bwStop');

  // 4. Pistes
  await page.click('#bwNext');
  ok((await page.locator('.bw-grid input[type=checkbox]').count()) > 5, 'étape 4 : des cases à cocher par musicien et par élément');
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
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  ok(overflow <= 1, 'téléphone : la grille défile dans son cadre, pas la fenêtre');
  ok(await page.isVisible('#bwNext'), 'téléphone : boutons visibles');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
