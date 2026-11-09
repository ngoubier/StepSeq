/*
 * Test de bout en bout de la fenêtre Song : tuiles de scènes (sélection, renommage, copie, longueur, résumé),
 * rangement des scènes et dépôt dans l'arrangement par glisser-déposer.
 *   node tests/e2e/song-ui.js [dossier-captures]
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
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const SHOTS = process.argv[2];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const S = () => page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return { scenes: p.scenes.map((s) => s.name), song: p.song.map((x) => p.scenes.find((s) => s.id === x.scene).name), current: p.scenes.find((s) => s.id === p.current).name, bars: p.scenes.map((s) => s.bars) };
  });
  const settle = () => page.waitForTimeout(600); // sauvegarde automatique (400 ms)
  const drag = async (from, to, pos) => {
    const a = await page.locator(from).boundingBox();
    const t = await page.locator(to).boundingBox();
    await page.mouse.move(a.x + 40, a.y + 12);
    await page.mouse.down();
    await page.mouse.move(a.x + 60, a.y + 30, { steps: 4 });
    const x = pos === 'before' ? t.x + 8 : pos === 'top' ? t.x + t.width / 2 : t.x + t.width - 8;
    const y = pos === 'top' ? t.y + 4 : t.y + t.height / 2;
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    await settle();
  };

  await page.click('#songBtn');
  await page.waitForTimeout(300);
  ok(!(await page.locator('#songDialog #songMode').count()), 'pas de Boucle / Chanson dans la fenêtre');
  ok((await page.locator('#sgSceneList .sg-tile').count()) === 1, 'une tuile par scène');
  const chords = await page.textContent('#sgSceneList .sg-tile .sg-chords');
  ok(/Am7/.test(chords) && /Fmaj7/.test(chords), `résumé : accords de la scène (${chords})`);
  ok(/pistes/.test(await page.textContent('#sgSceneList .sg-tile .sg-tracks')), 'résumé : pistes qui jouent');

  // nouvelle scène, puis duplication de la première
  await page.click('#sgNewScene'); await settle();
  let st = await S();
  ok(st.scenes.length === 2 && st.current === st.scenes[1], `« Nouvelle scène » crée et sélectionne « ${st.scenes[1]} »`);
  await page.click('#sgSceneList .sg-tile:nth-child(1) [aria-label="Dupliquer"]'); await settle();
  st = await S();
  ok(st.scenes.join() === 'Couplet,Couplet (copie),' + st.scenes[2] && st.current === 'Couplet (copie)', `dupliquer : ${st.scenes.join(', ')}`);

  // sélection par clic
  await page.click('#sgSceneList .sg-tile:nth-child(1) .sg-chords'); await settle();
  ok((await S()).current === 'Couplet', 'clic sur une tuile : la scène est sélectionnée');

  // renommer
  await page.click('#sgSceneList .sg-tile:nth-child(2) [aria-label="Renommer"]');
  await page.fill('#sgSceneList .scene-rename', 'Pont');
  await page.keyboard.press('Enter'); await settle();
  st = await S();
  ok(st.scenes[1] === 'Pont' && (await page.locator('#songDialog').getAttribute('open')) !== null, 'renommer (la fenêtre reste ouverte)');

  // longueur
  await page.selectOption('#sgSceneList .sg-tile:nth-child(2) .sg-bars', '4'); await settle();
  st = await S();
  ok(st.bars[1] === 4 && (await page.inputValue('#bars')) === '4', `longueur de « Pont » : 4 mesures (${st.bars.join(',')})`);

  // ranger : la 3ᵉ scène en tête
  await drag('#sgSceneList .sg-tile:nth-child(3)', '#sgSceneList .sg-tile:nth-child(1)', 'top');
  st = await S();
  ok(st.scenes.join() === 'Refrain,Couplet,Pont', `ranger les scènes : ${st.scenes.join(', ')}`);

  // déposer Refrain à la fin de l'arrangement, puis Couplet avant le premier bloc
  const before = (await S()).song;
  await drag('#sgSceneList .sg-tile:nth-child(3)', '#sgBlocks .sg-drop-hint', 'after');
  st = await S();
  ok(st.song.join() === [...before, 'Pont'].join(), `déposer « Pont » à la fin : ${st.song.join(' → ')}`);
  await drag('#sgSceneList .sg-tile:nth-child(1)', '#sgBlocks .sg-block:nth-child(1)', 'before');
  st = await S();
  ok(st.song.join() === ['Refrain', ...before, 'Pont'].join(), `déposer avant le 1er bloc : ${st.song.join(' → ')}`);

  // déplacer un bloc : le dernier en 2ᵉ position
  await drag('#sgBlocks .sg-block:nth-child(3)', '#sgBlocks .sg-block:nth-child(2)', 'before');
  st = await S();
  ok(st.song.join() === ['Refrain', 'Pont', ...before].join(), `déplacer un bloc : ${st.song.join(' → ')}`);
  SHOTS && (await page.screenshot({ path: path.join(SHOTS, 'song-window.png') }));

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
