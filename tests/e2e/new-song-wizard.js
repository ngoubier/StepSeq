/*
 * Test de bout en bout de l'assistant « Nouvelle chanson » (menu de l'application, js/band.js) :
 *   node tests/e2e/new-song-wizard.js
 * 1. Modèle (Band) → 2. la chanson en vue session (une ligne par scène, une colonne par piste)
 * → 3. Générer la mélodie → 4. pistes à importer → la chanson créée suit exactement l'aperçu.
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
  ok((await page.isVisible('#bandWizSteps')) && /^Band/.test(await page.textContent('#bandTitle')) && !(await page.isVisible('#bwEmpty')), 'Band : l’assistant en cinq étapes');
  await page.keyboard.press('Escape');

  // 1. Modèle
  await page.click('#appMenuBtn');
  ok(/Nouvelle chanson/.test(await page.textContent('#newProject')), 'menu : « Nouvelle chanson… »');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#bandDialog'), 'l’assistant s’ouvre');
  ok(/Nouvelle chanson/.test(await page.textContent('#bandTitle')), 'titre « Nouvelle chanson »');
  ok((await page.locator('#bandWizSteps li').count()) === 5 && (await page.locator('#bandWizSteps li.cur').textContent()).includes('Modèle'), 'cinq étapes, la première : Modèle');
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

  // 3. Harmonie : la scène choisie, ses accords (comme dans Key) et les instruments dessous
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  ok((await page.locator('#bandWizSteps li.cur').textContent()).includes('Harmonie'), 'étape 3 : Harmonie');
  ok((await page.locator('.bh-scene').count()) === 5 && (await page.locator('.bh-scene.on .bh-sname b').textContent()) === 'Intro', 'scènes à gauche, la première choisie');
  const hc = await page.evaluate(() => [...document.querySelectorAll('.bh-chord')].map((c) => [c.querySelector('small').textContent, c.querySelector('b').textContent, c.className]));
  ok(hc.length === 8 && hc[0][0] === 'i' && hc[0][1] === 'Cm' && /role-repos/.test(hc[0][2]) && hc[1][1] === 'B♭', `piste d’accords : ${hc.map((c) => c[1]).join(' ')}`);
  ok((await page.locator('.bh-row.bh-drums').count()) === 0 && (await page.getAttribute('#bwHarmDrums', 'aria-checked')) === 'false', 'batterie masquée par défaut');
  const lanes = await page.$$eval('.bh-lane', (ls) => ls.map((l) => l.querySelector('.bh-name b').textContent));
  ok(lanes.length >= 4 && !lanes.some((n) => /Kick|Snare|Hi-Hat/.test(n)), `instruments sous les accords (${lanes.join(', ')})`);
  const pad = page.locator('.bh-lane', { hasText: 'Nappe' }).first();
  ok((await pad.locator('.bh-note').count()) > 0 && /100 % dans l’accord/.test(await pad.textContent()), 'la nappe : toutes ses notes dans l’accord');
  await page.click('#bwHarmDrums');
  ok((await page.locator('.bh-row.bh-drums .bh-hit').count()) > 0, 'Batterie : affichée sur demande');
  await page.click('.bh-scene >> nth=2');
  ok((await page.locator('.bh-scene.on .bh-sname b').textContent()) === 'Refrain' && (await page.locator('.bh-top h3').textContent()) === 'Refrain', 'clic sur une scène : ses accords');
  ok((await page.locator('.bh-lane', { hasText: 'Lead' }).locator('.bh-note.out').count()) > 0, 'notes de passage du lead dessinées en creux');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-harmonie.png') });

  // 4. Mélodie
  await page.click('#bwNext');
  const leadSig = () => page.evaluate(() => {
    const w = SS.band._state.wiz;
    return JSON.stringify(w.res.scenes.map((sc) => Object.entries(sc.data).filter(([id]) => id.includes(':lead')).map(([, d]) => d.events.map((e) => e.notes[0]))));
  });
  const bassSig = () => page.evaluate(() => JSON.stringify(SS.band._state.wiz.res.scenes.map((sc) => Object.entries(sc.data).filter(([id]) => id.includes(':bass')).map(([, d]) => d.events))));
  const lead0 = await leadSig();
  const bass0 = await bassSig();
  ok((await page.locator('.bw-cell.mel .bw-clip').count()) >= 3, 'la colonne de la mélodie est mise en avant');
  await page.click('#bwMelody');
  const lead1 = await leadSig();
  ok(lead1 !== lead0, 'Générer la mélodie : une autre mélodie');
  ok((await bassSig()) === bass0, 'les autres musiciens ne changent pas');
  ok(/n° 2/.test(await page.textContent('#bwSeed')), 'numéro de la mélodie affiché');
  await page.click('#bwMelody');
  ok((await leadSig()) !== lead1, 'encore une autre');
  await page.click('#bwMelodyBack');
  ok((await leadSig()) === lead0, '« Mélodie d’origine » revient à la première');
  // réglages de l'atelier Mélodie : mélodie composée, 8 pieds par vers, 2 mesures par vers
  ok((await page.isVisible('#bwMelForm')) && (await page.isDisabled('#bwFeet')), 'réglages de la mélodie : désactivés pour la mélodie de l’inspiration');
  await page.click('#bwMelForm [data-v="compose"]');
  ok(!(await page.isDisabled('#bwFeet')), '« Composée » : réglages actifs');
  await page.selectOption('#bwFeet', '8');
  await page.selectOption('#bwComplexity', 'simple');
  await page.selectOption('#bwRange', 'voix');
  const comp = await page.evaluate(() => {
    const w = SS.band._state.wiz;
    return w.res.scenes.map((sc) => {
      const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
      const ev = sc.data[id].events;
      return { bars: sc.bars, n: ev.length, lo: Math.min(...ev.map((e) => e.notes[0])), hi: Math.max(...ev.map((e) => e.notes[0])) };
    }).filter((x) => x.n);
  });
  ok(comp.length && comp.every((x) => x.n === Math.max(1, x.bars / 2) * 8), `8 pieds par vers (${comp.map((x) => x.n).join(', ')} notes)`);
  ok(comp.every((x) => x.lo >= 60 && x.hi <= 72), 'tessiture voix moyenne');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'wizard-melodie.png') });
  await page.click('#bwMelody');
  const chosen = await page.evaluate(() => {
    const w = SS.band._state.wiz;
    const sc = w.res.scenes.find((s) => s.sec === 'chorus');
    const id = Object.keys(sc.data).find((k) => k.includes(':lead'));
    return JSON.stringify(sc.data[id].events.map((e) => [e.step, e.len, e.notes]));
  });

  // 5. Pistes
  await page.click('#bwNext');
  ok((await page.locator('.bw-grid input[type=checkbox]').count()) > 5, 'étape 5 : des cases à cocher par musicien et par élément');
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
