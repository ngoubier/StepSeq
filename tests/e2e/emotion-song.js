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

  // « Par scène » : de l'ombre à la lumière en synthwave
  await page.evaluate(() => SS.emotionSongPanel.open());
  await page.waitForTimeout(200);
  await page.click('#esMode button[data-mode="arc"]');
  await page.selectOption('#esStyle', 'synthwave');
  await page.waitForTimeout(200);
  ok((await page.locator('.ea-arc').count()) === 5, 'cinq trajectoires toutes faites');
  ok((await page.locator('.ea-cb').count()) >= 5, 'la trajectoire montre chaque passage');
  ok((await page.locator('.ea-card').count()) >= 4, 'une carte par scène');
  ok((await page.locator('.ea-pivots b').count()) >= 1, 'des charnières');
  await page.locator('.ea-chords').first().click();
  ok((await page.locator('.ea-card .es-alt').count()) >= 2, 'un clic sur les accords montre les autres grilles');
  await page.click('#eaPlay');
  await page.waitForTimeout(700);
  ok((await page.locator('.ea-playing').count()) >= 1, 'l’écoute suit les passages');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'emotions-par-scene.png') });
  await page.click('#eaPlay');
  const arc = await page.evaluate(() => {
    const d = SS.emotionSong.deduceArc({ style: 'synthwave', moments: SS.emotionSong.ARCS[0].e });
    return { names: d.sections.map((s) => s.name), keys: Object.fromEntries(d.sections.map((s) => [s.name, s.key])), emos: Object.fromEntries(d.sections.map((s) => [s.name, s.emotion])), lift: d.lift };
  });
  await page.click('#esCreate');
  await page.waitForTimeout(800);
  const e2 = await page.evaluate(() => SS.band.claude.etat());
  ok(JSON.stringify(e2.scenes.map((s) => s.nom).sort()) === JSON.stringify([...arc.names].sort()), `par scène : scènes ${e2.scenes.map((s) => s.nom).join(', ')}`);
  ok(e2.scenes.every((s) => arc.keys[s.nom] && s.tonalite.tonic === arc.keys[s.nom].tonic && s.tonalite.mode === arc.keys[s.nom].mode), 'chaque scène a sa tonalité');
  const ids = Object.fromEntries(e2.scenes.map((s) => [s.nom, s.id]));
  const emos2 = await page.evaluate(() => SS.band._state.wiz.emos);
  ok(Object.entries(arc.emos).every(([n, id]) => emos2[ids[n]] === id), 'chaque scène a l’émotion de son moment');
  ok(arc.lift && e2.scenes.some((s) => /^Dernier/.test(s.nom)), 'le dernier refrain monte d’un ton dans une scène à part');
  const intro = e2.scenes.find((s) => s.nom === 'Intro');
  ok(intro && /non|false|muet|ne joue/i.test(JSON.stringify(intro.jeu)), 'la batterie se tait dans l’intro calme : ' + JSON.stringify(intro && intro.jeu).slice(0, 160));

  // Musique de film : une émotion par passage (histoire « Les adieux »), puis « Créer cette scène »
  await page.evaluate(() => SS.emotionSongPanel.open());
  await page.waitForTimeout(200);
  await page.click('#esMode button[data-mode="mix"]');
  await page.selectOption('#esStyle', 'film');
  await page.waitForTimeout(200);
  ok((await page.locator('#esMode button.on').textContent()) === 'Par passage', 'le film s’ouvre sur « Par passage »');
  ok((await page.locator('#esCreate').textContent()) === 'Créer cette scène', 'bouton « Créer cette scène »');
  ok((await page.locator('.ea-arc[data-story]').count()) === 5, 'cinq histoires toutes faites');
  await page.click('.ea-arc[data-story="adieux"]');
  await page.waitForTimeout(150);
  ok((await page.locator('.fe-prow').count()) === 4 && (await page.locator('.fe-blk').count()) === 4 && (await page.locator('.fe-card').count()) === 4, 'quatre passages : lignes, frise et cartes');
  ok((await page.locator('.fe-sync').count()) === 1 && (await page.locator('.fe-bar.fe-dlg').count()) === 1, 'la synchro forte et le dialogue sur la frise');
  await page.click('.fe-ens[data-ens="romantique"]');
  await page.waitForTimeout(100);
  await page.click('#fePlay');
  await page.waitForTimeout(700);
  ok((await page.locator('.fe-playing').count()) >= 1, 'l’écoute de la scène suit les passages');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'film-emotion.png') });
  await page.click('#fePlay');
  await page.click('#esMode button[data-mode="mix"]');
  await page.waitForTimeout(150);
  ok((await page.locator('#feTotal').count()) === 1 && (await page.locator('.fe-card').count()) >= 2, '« Toute la scène » : mélange et durée, passages déduits');
  await page.click('#esMode button[data-mode="arc"]');
  await page.waitForTimeout(150);
  const wantF = await page.evaluate(() => {
    const d = SS.filmEmotionPanel.deduce(SS.emotionSongPanel._state);
    return { key: d.film.key, cues: d.film.cues.map((c) => [c.emo, c.name, !!c.sync, !!c.dlg]), ens: d.ens };
  });
  await page.click('#esCreate');
  await page.waitForTimeout(900);
  const f = await page.evaluate(() => ({ film: SS.band.claude.film(), orch: SS.band.claude.etat().musiciens.find((m) => m.type === 'orch') }));
  ok(wantF.ens === 'romantique', 'l’effectif choisi est gardé');
  ok(f.film.reperes.length === 4 && f.film.reperes.every((r, i) => r.emotion === wantF.cues[i][0] && r.nom === wantF.cues[i][1] && r.synchro === wantF.cues[i][2] && r.dialogue === wantF.cues[i][3]), 'les repères de « Ma scène » : ' + f.film.reperes.map((r) => `${r.nom}/${r.emotion}`).join(', '));
  ok(f.orch && /romantique/i.test(JSON.stringify(f.orch)), 'orchestre romantique : ' + JSON.stringify(f.orch).slice(0, 120));
  const fk = await page.evaluate(() => SS.band._state.film && SS.band._state.film.key);
  ok(fk === wantF.key, `tonalité ${fk}`);
  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
