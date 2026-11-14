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
    // les scènes sont en ligne : « left » = avant la carte (moitié gauche)
    const x = pos === 'before' || pos === 'left' ? t.x + 8 : t.x + t.width - 8;
    const y = t.y + t.height / 2;
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
  await drag('#sgSceneList .sg-tile:nth-child(3)', '#sgSceneList .sg-tile:nth-child(1)', 'left');
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

  // frise horizontale : une seule ligne, largeur selon la durée, règle en mesures
  const fr = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const bars = p.song.map((x) => {
      const sc = p.scenes.find((s) => s.id === x.scene);
      return (sc.id === p.current ? p.bars : sc.bars) * x.repeat;
    });
    const els = [...document.querySelectorAll('#sgBlocks .sg-block')];
    const r = els.map((e) => e.getBoundingClientRect());
    return { bars, w: r.map((x) => x.width), tops: [...new Set(r.map((x) => Math.round(x.top)))], marks: document.querySelectorAll('#sgRuler span').length, dlg: document.querySelector('#songDialog').getBoundingClientRect().height };
  });
  ok(fr.tops.length === 1, 'les blocs de l’arrangement sont sur une seule ligne');
  ok(fr.w.every((w, i) => Math.abs(w / fr.bars[i] - fr.w[0] / fr.bars[0]) < 0.5), `largeur proportionnelle à la durée (${fr.bars.join(', ')} mesures)`);
  ok(fr.marks >= 2, `règle en mesures (${fr.marks} graduations)`);
  ok(fr.dlg < 700, `fenêtre compacte (${Math.round(fr.dlg)} px)`);
  // Écouter : mode Chanson, tête de lecture sur la frise
  await page.click('#sgPlay');
  await page.waitForFunction(() => !document.querySelector('#sgHead').hidden, null, { timeout: 8000 }).catch(() => {});
  ok(!(await page.locator('#sgHead').isHidden()) && /Arrêter/.test(await page.textContent('#sgPlay')), 'Écouter : la chanson joue, tête de lecture visible');
  const x1 = await page.evaluate(() => parseFloat(document.querySelector('#sgHead').style.left));
  await page.waitForTimeout(700);
  const x2 = await page.evaluate(() => parseFloat(document.querySelector('#sgHead').style.left));
  ok(x2 > x1, `la tête de lecture avance (${Math.round(x1)} → ${Math.round(x2)} px)`);
  await page.click('#sgPlay');
  await page.waitForTimeout(200);
  ok((await page.locator('#sgHead').isHidden()) && /Écouter/.test(await page.textContent('#sgPlay')), 'Arrêter');

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
