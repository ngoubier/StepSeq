/*
 * Écoute dans l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-listen.js
 * Bandeau de l'ordre des scènes, écoute de la chanson ou d'une scène (projet temporaire, la chanson reste vide),
 * Muet / Solo par instrument à l'étape Mélodie, nouvelle mélodie pendant l'écoute, arrêt à la fermeture.
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
      song: document.querySelector('#bwPlaySong').classList.contains('on'),
      block: [...document.querySelectorAll('.bw-block')].findIndex((x) => x.classList.contains('playing')),
      rows: [...document.querySelectorAll('.bw-grid tbody tr.playing')].map((tr) => tr.querySelector('.bw-sname').textContent),
    }));

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(500);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await page.click('#bwNext');
  await page.waitForTimeout(200);

  // bandeau : l'ordre des scènes de la chanson
  const blocks = await page.$$eval('.bw-block', (bs) => bs.map((x) => x.textContent));
  const song = await page.evaluate(() => SS.band._state.wiz.res.song.map((bl) => SS.band._state.wiz.res.scenes.find((s) => s.id === bl.scene).name));
  ok(blocks.length === song.length && blocks.every((t, i) => t.startsWith(song[i])), `bandeau : ${blocks.join(' → ')}`);
  ok(await page.isVisible('#bwPlaySong'), 'bouton « Écouter la chanson »');

  // écouter la chanson
  await page.click('#bwPlaySong');
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
  await page.click('#bwPlaySong');
  await page.waitForTimeout(200);
  ok(!(await playing()) && !(await L()).song, '« Arrêter »');

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

  // étape Mélodie : écoute d'une scène, Muet / Solo
  await page.click('.bw-splay >> nth=2');
  await page.click('#bwNext');
  await page.waitForTimeout(300);
  ok((await playing()) && (await L()).rows.length === 1, 'étape Mélodie : l’écoute continue');
  const n = await page.locator('.bw-track .bw-m').count();
  const cols = await page.locator('.bw-track').count();
  ok(n === cols, `M et S sur chaque instrument (${n})`);
  ok((await page.locator('.bw-group .bw-ms').count()) >= 1, 'M et S sur le groupe de la batterie');
  const tracks = () => page.evaluate(() => SS.band._listen().tracks.map((t) => [t.col, t.mute, t.solo]));
  const bass = page.locator('.bw-track', { hasText: 'Basse' }).first();
  const bassId = await page.evaluate(() => SS.band._state.wiz.res && Object.keys(SS.band._state.wiz.res.scenes[0].data).find((k) => k.startsWith('bass')));
  await bass.locator('.bw-m').click();
  let t = await tracks();
  ok(t.find((x) => x[0] === bassId)[1] && t.filter((x) => x[1]).length === 1, 'M : la basse est coupée');
  const mc = await page.locator('.bw-cell.muted').count();
  const pressed = await bass.locator('.bw-m').getAttribute('aria-pressed');
  ok(mc === 5 && pressed === 'true', `colonne muette grisée (${mc} cases, ${pressed})`);
  await bass.locator('.bw-m').click();
  const lead = page.locator('.bw-track.mel').first();
  await lead.locator('.bw-s').click();
  t = await tracks();
  ok(t.filter((x) => x[2]).length === 1 && !t.some((x) => x[1]), 'S : la mélodie seule');
  ok((await page.locator('.bw-track.muted').count()) === cols - 1, 'les autres colonnes sont grisées');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'listen-melody.png') });

  // nouvelle mélodie pendant l'écoute : on reprend avec les nouvelles notes, le solo est gardé
  const before = await page.evaluate(() => SS.band._listen().scenes.map((s) => JSON.stringify(s.data)).join());
  await page.click('#bwMelody');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const after = await page.evaluate(() => SS.band._listen().scenes.map((s) => JSON.stringify(s.data)).join());
  ok(before !== after, 'Générer la mélodie : l’écoute reprend avec la nouvelle mélodie');
  t = await tracks();
  ok(t.filter((x) => x[2]).length === 1, 'le solo est gardé');

  // la batterie entière : M du groupe
  await page.locator('.bw-group .bw-m').first().click();
  t = await tracks();
  ok(t.filter((x) => x[1]).length >= 3, 'M du groupe : toute la batterie');

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
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  ok(over <= 1, 'téléphone : pas de défilement horizontal de la fenêtre');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'listen-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
