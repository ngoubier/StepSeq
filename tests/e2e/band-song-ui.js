/*
 * Test de bout en bout de Band → « Créer toute la chanson » : scènes, arrangement, mode Chanson, sidechain, Ctrl+Z.
 *   node tests/e2e/band-song-ui.js
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos/train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => !localStorage.getItem('stepseq.autosave') && localStorage.setItem('stepseq.autosave', JSON.stringify(p)), demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const S = () => page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return { mode: p.playMode, tempo: p.tempo, tracks: p.tracks.length, scenes: p.scenes.map((s) => s.name), song: p.song.length, sc: p.tracks.filter((t) => t.fx && t.fx.scSource).length };
  });
  const before = await S();
  await page.click('#bandBtn'); await page.waitForTimeout(400);
  await page.click('#bandStyles [data-v="edm"]');
  await page.click('#bandPresets .band-preset >> nth=1'); // Don't You Worry Child
  ok(await page.isVisible('#bandWizSteps') && await page.isVisible('#bwNext') && !(await page.isVisible('#bwEmpty')), 'Band : l’assistant (sans « Chanson vide »)');
  for (let i = 0; i < 3; i++) await page.click('#bwNext'); await page.click('#bwCreate'); await page.waitForTimeout(200);
  ok(await page.isVisible('#bcfSong'), 'projet non vide : confirmation avant de remplacer');
  await page.click('#bcfSong'); await page.waitForTimeout(800);
  const st = await S();
  ok(st.mode === 'song' && st.tempo === 129, `mode Chanson, tempo de l'inspiration (${st.tempo})`);
  ok(st.scenes.join() === 'Intro,Couplet,Montée,Drop,Break,Outro' && st.song === 8, `scènes : ${st.scenes.join(', ')} ; ${st.song} blocs`);
  ok(st.sc >= 2, `sidechain sur la basse et les nappes (${st.sc} pistes)`);
  ok(await page.locator('#songBlocks .song-block').count() === 8, "l'arrangement s'affiche");
  ok(/Montée|Intro/.test(await page.textContent('#songSub')), 'le bouton Song montre la scène en cours');
  // Ctrl+Z : retour au projet d'avant
  await page.keyboard.press('Control+z'); await page.waitForTimeout(700);
  const back = await S();
  ok(back.tracks === before.tracks && back.scenes.length === before.scenes.length, 'Ctrl+Z revient au projet d’avant');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
