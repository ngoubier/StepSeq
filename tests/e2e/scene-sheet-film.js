/*
 * Test de bout en bout : fiche Scène d'une chanson créée par l'assistant Musique de film (« La lumière revient »).
 * La scène garde l'émotion du film, l'énergie et la tension du passage ; la rubrique « Film » montre le repère ;
 * une émotion changée dans la fiche est renvoyée au passage de l'assistant (le modèle devient une scène libre, même tempo).
 *   node tests/e2e/scene-sheet-film.js [dossier] [capture.png]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', '..');
const SHOT = process.argv[3] || null;
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
  const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.locator('#bandStyles .bsty[data-v="film"]').click();
  await page.waitForTimeout(400);
  await page.locator('#bandPresets .band-preset', { hasText: 'La lumière revient' }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => SS.band.create());
  await page.waitForTimeout(2500);
  await page.click('#stop').catch(() => {});

  const scenes = await page.evaluate(() => SS.claudeTools._project().scenes.map((s) => ({ name: s.name, emotion: s.emotion, energy: s.energy, tension: s.tension, film: s.film })));
  ok(scenes.length === 5 && scenes.every((s) => s.film && s.energy && s.tension), `5 scènes avec leur passage de film (${scenes.map((s) => s.name).join(', ')})`);
  ok(scenes[3].film.sync && scenes[3].film.at === 42 && scenes[3].energy === 5, 'la lumière : synchro forte à 00:42, énergie 5');

  // fiche de la 4e scène (la synchro)
  await page.locator('#gridPlayBar .wpb-sc', { hasText: scenes[3].name }).first().dblclick();
  await page.waitForTimeout(300);
  ok(await page.isVisible('#sceneSheet .ssh-sec[data-sec="film"]'), 'rubrique « Film » dans la fiche');
  ok(/00:42/.test(await page.textContent('#sceneSheet .ssh-sec[data-sec="film"]')) && /synchro/.test(await page.textContent('#sceneSheet .ssh-sec[data-sec="film"]')), 'repère 00:42 et synchro forte');
  ok(/Émerveillement/.test(await page.textContent('#sceneSheet .ssh-combo-btn')), 'émotion du film affichée');
  if (SHOT) await page.screenshot({ path: SHOT });
  await page.click('#sceneSheet .ssh-combo-btn');
  ok((await page.locator('#sceneSheet .ssh-emo-panel .ssh-emo').count()) === 10, 'panneau : les 10 émotions de l’assistant film');
  await page.click('#sceneSheet .ssh-emo-panel [data-emo="colere"]');
  await page.click('#sceneSheet .ssh-sec[data-sec="feel"] .ssh-lvl >> nth=1 >> button >> nth=4');
  const st = await page.evaluate(() => {
    const p = SS.claudeTools._project();
    const sc = SS.currentScene(p);
    const d = p.wizard.state;
    const cue = d.film.cues[3];
    return { emo: sc.film.emo, emotion: sc.emotion, ten: sc.tension, cue: { emo: cue.emo, ten: cue.ten }, preset: d.presetId, bpm: d.film.bpm, color: getComputedStyle(document.querySelector('#sceneSheet .ssh-combo-btn i')).backgroundColor };
  });
  ok(st.emo === 'colere' && st.emotion === 'angoisse' && /229, 56, 47/.test(st.color), `colère : rouge dans la fiche (${st.color})`);
  ok(st.cue.emo === 'colere' && st.cue.ten === 5, 'émotion et tension renvoyées au passage de l’assistant');
  ok(st.preset === 'scene' && st.bpm === 80, 'le modèle devient une scène libre, toujours à 80 BPM');
  // l'assistant rouvert retrouve le passage changé
  const back = await page.evaluate(() => {
    SS.sceneSheet.close();
    SS.band.resume();
    const f = SS.band._state.film;
    return f && f.cues[3] && f.cues[3].emo;
  });
  ok(back === 'colere', 'l’assistant rouvert montre la colère sur le passage');
  // tempo propre à un passage (assistant) : la scène de la grille le reçoit
  await page.evaluate(() => SS.band.close && SS.band.close());
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.locator('#bandStyles .bsty[data-v="film"]').click();
  await page.waitForTimeout(300);
  await page.locator('#bandPresets .band-preset', { hasText: 'La lumière revient' }).click();
  await page.waitForTimeout(300);
  await page.click('#bfmUnlock');
  await page.waitForTimeout(300);
  await page.fill('#bandSong .bfm-bpm >> nth=2', '120');
  await page.press('#bandSong .bfm-bpm >> nth=2', 'Enter');
  await page.waitForTimeout(400);
  const bars = await page.$$eval('#bandSong .bfm-cues tbody tr', (rs) => rs.map((r) => r.querySelector('.bfm-bar').textContent));
  ok(/m\. 9/.test(bars[2]) && /m\. 15/.test(bars[3]), `passage à 120 BPM : la lumière passe de la m. 13 à la m. 15 (${bars.join(' | ')})`);
  if (process.argv[4]) {
    await page.locator('#bandSong .bfm-cues').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.argv[4] });
  }
  await page.evaluate(() => SS.band.create());
  await page.waitForTimeout(2500);
  await page.click('#stop').catch(() => {});
  const tempos = await page.evaluate(() => SS.claudeTools._project().scenes.map((s) => s.tempo || null));
  ok(tempos[2] === 120 && tempos.filter(Boolean).length === 1, `la scène « Espoir » joue à 120 BPM, les autres au tempo de la chanson (${tempos.join(', ')})`);
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
