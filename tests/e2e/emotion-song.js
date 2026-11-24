/*
 * « Nouvelle chanson » › « ✦ D'après une émotion » : la tuile ouvre la fenêtre, la chanson déduite s'affiche, et
 * « Créer cette chanson » règle l'assistant (inspiration, tempo, tonalité, scènes, accords, émotions des scènes).
 *   node tests/e2e/emotion-song.js            (CAPTURES=dossier pour enregistrer des captures)
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
const SHOTS = process.env.CAPTURES;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 920 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);

  const tile = page.locator('#bandStyles .bsty-emo');
  ok((await tile.count()) === 1, 'la tuile « D’après une émotion » est dans l’étape Style');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'emotion-tuile.png') });
  await tile.click();
  await page.waitForTimeout(300);
  ok(await page.locator('#emotionSongDialog[open]').count() === 1, 'la fenêtre s’ouvre');
  ok(/BPM/.test(await page.locator('.es-grid').textContent()), 'le tempo déduit est affiché');
  ok((await page.locator('.es-sc').count()) >= 4, 'les scènes et leurs accords sont affichés');
  ok((await page.locator('.es-ref').count()) === 8, 'huit chansons modèles');

  // style Techno, Mystère 60 + Suspense 40
  await page.selectOption('#esStyle', 'techno');
  await page.locator('.es-row select').first().selectOption('mystere');
  await page.locator('.es-row select').nth(1).selectOption('suspense');
  await page.waitForTimeout(150);
  await page.locator('.es-sc').nth(1).click();
  await page.waitForTimeout(150);
  ok((await page.locator('.es-alt').count()) >= 2, 'un clic sur une scène montre les autres grilles');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'emotion-fenetre.png') });

  const want = await page.evaluate(() => {
    const d = SS.emotionSong.deduce({ style: 'techno', emotions: [{ id: 'mystere', w: 60 }, { id: 'suspense', w: 40 }] });
    return { bpm: d.tempo.bpm, key: d.key, preset: d.model.preset, names: d.sections.map((s) => s.name), n: d.form.length };
  });
  await page.click('#esCreate');
  await page.waitForTimeout(800);
  ok(await page.locator('#emotionSongDialog[open]').count() === 0, 'la fenêtre se ferme');
  const e = await page.evaluate(() => SS.band.claude.etat());
  ok(e.inspiration && e.inspiration.id === want.preset, `inspiration ${want.preset}`);
  ok(e.tempo === want.bpm, `tempo ${e.tempo} = ${want.bpm}`);
  ok(e.tonalite.tonic === want.key.tonic && e.tonalite.mode === want.key.mode, `tonalité ${e.tonalite.tonic} ${e.tonalite.mode}`);
  ok(JSON.stringify(e.scenes.map((s) => s.nom).sort()) === JSON.stringify([...want.names].sort()), `scènes ${e.scenes.map((s) => s.nom).join(', ')}`);
  ok(e.structure.reduce((a, x) => a + x.fois, 0) === want.n, 'arrangement : la forme du modèle');
  ok(e.etape === 'scenes', `étape ouverte : ${e.etape}`);
  const emos = await page.evaluate(() => Object.values(SS.band._state.wiz.emos));
  ok(emos.length === e.scenes.length, 'chaque scène a son émotion');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'emotion-scenes.png') });
  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
