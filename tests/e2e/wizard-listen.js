/*
 * Écoute dans l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-listen.js
 * Bandeau de l'ordre des scènes, écoute de la chanson ou d'une scène (projet temporaire, la chanson reste vide),
 * étapes Batterie à Mélodie : la lecture joue la scène choisie, en boucle ; Muet / Solo / volume par instrument
 * à l'étape Mélodie, nouvelle mélodie pendant l'écoute, arrêt à la fermeture.
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
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const playing = () => page.evaluate(() => SS.audio.isPlaying());
  const L = () =>
    page.evaluate(() => ({
      song: document.querySelector('#play').getAttribute('aria-pressed') === 'true' && SS.band._state.wiz && !!document.querySelector('.bw-block.playing'),
      block: [...document.querySelectorAll('.bw-block')].findIndex((x) => x.classList.contains('playing')),
      rows: [...document.querySelectorAll('.bw-grid tbody tr.playing')].map((tr) => tr.querySelector('.bw-sname').textContent),
    }));

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(500);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  for (let i = 0; i < 3; i++) await page.dispatchEvent('#bwNext', 'click'); // Instruments, Tempo et tonalité, Scènes
  await page.waitForTimeout(200);

  // bandeau : l'ordre des scènes de la chanson
  const blocks = await page.$$eval('.bw-block', (bs) => bs.map((x) => x.textContent));
  const song = await page.evaluate(() => SS.band._state.wiz.res.song.map((bl) => SS.band._state.wiz.res.scenes.find((s) => s.id === bl.scene).name));
  ok(blocks.length === song.length && blocks.every((t, i) => t.startsWith(song[i])), `bandeau : ${blocks.join(' → ')}`);
  ok(await page.isVisible('#play') && await page.isDisabled('#stop'), 'bandeau : Lecture (Stop grisé à l’arrêt)');

  // écouter la chanson
  await page.click('#play');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.waitForFunction(() => (document.querySelector('.bw-grid tr.playing') || { style: { getPropertyValue: () => '' } }).style.getPropertyValue('--ph') !== '', null, { timeout: 8000 }).catch(() => {});
  let s = await L();
  ok(s.song && s.block === 0 && s.rows.length === 1 && s.rows[0] === song[0], `la chanson joue depuis le début (${s.rows})`);
  ok(await page.evaluate(() => document.querySelector('.bw-grid tr.playing').style.getPropertyValue('--ph') !== ''), 'tête de lecture sur la scène qui joue');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave') || '{"tracks":[]}').tracks.length === 0), 'la chanson reste vide pendant l’écoute');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'listen-song.png') });

  // un bloc du bandeau : la chanson à partir de ce bloc
  const k = Math.min(2, blocks.length - 1);
  await page.click(`.bw-block >> nth=${k}`);
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.waitForTimeout(500);
  s = await L();
  ok(s.song && s.block === k && s.rows[0] === song[k], `clic sur « ${song[k]} » : écoute à partir de ce bloc`);
  // pause puis reprise au même endroit
  await page.click('#play');
  await page.waitForTimeout(200);
  ok(!(await playing()) && (await page.evaluate(() => SS.audio.isPaused())) && /en pause/.test(await page.textContent('#lcdTitle')), 'Pause : le son s’arrête, la position est gardée');
  await page.click('#play');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  ok((await L()).block === k, 'Lecture : reprise dans le même bloc');
  await page.click('#stop');
  await page.waitForTimeout(200);
  ok(!(await playing()) && !(await page.evaluate(() => SS.audio.isPaused())) && (await page.textContent('#position')) === '1 . 1 . 1', 'Stop : arrêt et retour au début');

  // une scène en boucle
  await page.click('.bw-splay >> nth=1');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.waitForTimeout(300);
  s = await L();
  const name1 = await page.textContent('.bw-grid tbody tr:nth-child(2) .bw-sname');
  ok(!s.song && s.rows.join() === name1, `clic sur la scène « ${name1} » : elle joue`);
  ok(await page.evaluate(() => document.querySelectorAll('.bw-grid tbody tr')[1].querySelector('.bw-splay').getAttribute('aria-pressed') === 'true'), 'bouton de la scène enfoncé');
  await page.click('.bw-splay >> nth=1');
  await page.waitForTimeout(200);
  ok(!(await playing()), 're-clic : arrêt');

  // étape Accords : la vue suit la scène qu'on entend ; Lecture joue la scène choisie, pas la chanson
  await page.click('.bw-splay >> nth=2');
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);
  ok((await playing()) && (await page.textContent('.bh-scene.on .bh-sname b')) === 'Refrain', 'étape Batterie : l’écoute continue, sur la scène qu’on entend');
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);
  ok((await playing()) && (await page.textContent('.bh-scene.on .bh-sname b')) === 'Refrain', 'étape Accords : l’écoute continue, sur la scène qu’on entend');
  await page.click('#stop');
  await page.click('.bh-scene >> nth=1');
  await page.click('#play');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const heard = () => page.$$eval('.bh-scene.playing .bh-sname b', (bs) => bs.map((b) => b.textContent).join());
  ok((await heard()) === 'Couplet' && /Couplet · en boucle/.test(await page.textContent('#lcdTitle')), 'Accords : Lecture joue la scène choisie en boucle');
  await page.click('.bh-scene >> nth=2');
  await page.waitForTimeout(300);
  ok((await heard()) === 'Refrain' && /Refrain · en boucle/.test(await page.textContent('#lcdTitle')), 'une autre scène choisie : la lecture la suit');
  await page.waitForFunction(() => !document.querySelector('#bwGridPh').hidden, null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => !document.querySelector('#bwGridPh').hidden), 'tête de lecture sur la grille d’accords');

  // étape Mélodie (après Basse, Nappes, Arpèges) : tempo changé en cours d'écoute
  for (let i = 0; i < 4; i++) {
    await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(300);
  }
  ok((await playing()), 'étape Mélodie : l’écoute continue');
  await page.fill('#tempo', '133'); await page.press('#tempo', 'Enter');
  ok(await page.evaluate(() => SS.band._listen().tempo === 133), 'tempo : la lecture en cours prend le nouveau tempo');
  await page.click('.bh-loop');
  await page.waitForTimeout(200);
  ok(!(await playing()), 'Écouter la scène en boucle : re-clic sur la scène qui joue, arrêt');
  await page.click('.bh-scene >> nth=2');
  await page.click('.bh-loop');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.bh-board.playing'), null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => !!document.querySelector('.bh-board.playing') && document.querySelector('.bh-loop').getAttribute('aria-pressed') === 'true'), 'Mélodie : tête de lecture sur la scène écoutée');

  // étape Mélodie : Muet / Solo / volume sur chaque instrument, pendant l'écoute
  ok(await playing(), 'étape Mélodie : la scène joue');
  ok((await page.locator('.bh-lane').count()) === 1 && (await page.getAttribute('#bwAcc', 'aria-expanded')) === 'false', 'accompagnement replié : seule la mélodie');
  await page.click('#bwAcc');
  const lanesN = await page.locator('.bh-lane').count();
  ok((await page.locator('.bh-lane .bh-vol').count()) === lanesN && (await page.locator('.bh-lane .bw-m, .bh-lane .bw-s').count()) === 0, `volume sur chaque instrument (${lanesN}) ; Muet et Solo sont dans la barre de piste`);
  ok((await page.locator('#bwTrackbar .tb-chip').count()) === lanesN + 1 && (await page.locator('#bwTbSolo').count()) === 1, 'une pastille par musicien (la batterie en une) et Seule');
  const tracks = () => page.evaluate(() => SS.band._listen().tracks.map((t) => [t.col, t.mute, t.solo]));
  const bass = page.locator('.bh-lane', { hasText: 'Basse' }).first();
  const bassId = await bass.getAttribute('data-col');
  await page.locator('#bwTrackbar .tb-chip[data-mu="bass"]').click();
  let t = await tracks();
  ok(t.find((x) => x[0] === bassId)[1] && t.filter((x) => x[1]).length === 1, 'pastille : la basse est coupée');
  const bass2 = page.locator('.bh-lane', { hasText: 'Basse' }).first();
  ok((await page.locator('#bwTrackbar .tb-chip[data-mu="bass"]').getAttribute('aria-pressed')) === 'false' && /muted/.test(await bass2.getAttribute('class')), 'ligne muette grisée, pastille éteinte');
  await page.locator('#bwTrackbar .tb-chip[data-mu="bass"]').click();
  await page.click('#bwTbSolo');
  t = await tracks();
  ok(t.filter((x) => x[2]).length === 1 && !t.some((x) => x[1]), 'Seule : la mélodie seule');
  ok((await page.locator('.bh-row.muted').count()) === lanesN, 'les autres lignes sont grisées (batterie comprise)');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'listen-melody.png') });

  // nouvelle mélodie pendant l'écoute : on reprend avec les nouvelles notes, le solo est gardé
  const before = await page.evaluate(() => SS.band._listen().scenes.map((s) => JSON.stringify(s.data)).join());
  await page.click('#bwMelGo');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const after = await page.evaluate(() => SS.band._listen().scenes.map((s) => JSON.stringify(s.data)).join());
  ok(before !== after, 'Générer la mélodie : l’écoute reprend avec la nouvelle mélodie');
  t = await tracks();
  ok(t.filter((x) => x[2]).length === 1, 'le solo est gardé');

  // la batterie entière : M de la ligne Batterie
  await page.click('#bwTbSolo'); // plus de solo
  await page.locator('#bwTrackbar .tb-chip[data-mu="drums"]').click();
  t = await tracks();
  ok(t.filter((x) => x[1]).length >= 3, 'pastille de la batterie : tous ses éléments coupés');
  // étape Chanson : les colonnes coupées sont grisées
  for (let i = 0; i < 6; i++) await page.dispatchEvent('#bwBack', 'click'); // Arpèges, Nappes, Basse, Accords, Batterie, Chanson
  ok((await page.locator('.bw-track.muted').count()) === t.filter((x) => x[1]).length && (await page.locator('.bw-track:not(.muted)').count()) > 0, 'étape Chanson : les colonnes coupées sont grisées, les autres restent claires');

  // fermeture : arrêt, rien n'est créé
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(!(await playing()), 'fermer l’assistant arrête l’écoute');
  ok(await page.evaluate(() => SS.band._listen() === null), 'pistes d’écoute libérées');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave') || '{"tracks":[]}').tracks.length === 0), 'la chanson reste vide');

  // téléphone : le bandeau tient dans la fenêtre
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(500);
  for (let i = 0; i < 3; i++) await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  ok(over <= 1, 'téléphone : pas de défilement horizontal de la fenêtre');
  await page.dispatchEvent('#bwNext', 'click');
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(200);
  const over3 = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  ok(over3 <= 1, 'téléphone, étape Accords : rien ne déborde');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'listen-mobile-accords.png') });
  for (let i = 0; i < 4; i++) await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(200);
  const over2 = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  const foot = await page.evaluate(() => document.querySelector('.bh-scroll').getBoundingClientRect().bottom <= document.querySelector('.band-foot').getBoundingClientRect().top + 1);
  ok(over2 <= 1 && foot, 'téléphone, étape Mélodie : rien ne déborde, le pied ne couvre pas les pistes');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'listen-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
