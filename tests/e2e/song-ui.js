/*
 * Test de bout en bout de la fenêtre Arrangement : scènes en colonne (sélection, renommage, copie, longueur, ▶, ⋯),
 * rangement des scènes et dépôt dans la chanson par glisser-déposer, blocs (déplacer, Alt = copier, bord droit =
 * répétitions, clic droit), lignes de pistes (couper une piste dans une scène), automation repliée.
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
    await page.mouse.move(a.x + 30, a.y + 12);
    await page.mouse.down();
    await page.mouse.move(a.x + 60, a.y + 30, { steps: 4 });
    // scènes en colonne : « top » = au-dessus de la ligne ; blocs : « before » = moitié gauche
    const x = pos === 'top' ? t.x + t.width / 2 : pos === 'before' ? t.x + 3 : t.x + t.width - 3;
    const y = pos === 'top' ? t.y + 4 : t.y + t.height / 2;
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    await settle();
  };

  const P = () => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('stepseq.autosave')); return { song: p.song.map((x) => [p.scenes.find((s) => s.id === x.scene).name, x.repeat]), mute: p.scenes.map((s) => s.mute || null), mode: p.playMode }; });
  await page.click('#songBtn');
  await page.waitForTimeout(300);
  ok(await page.locator('#songDialog #sgMode').count() === 1, 'Chanson | Scène dans la fenêtre');
  ok(!(await page.locator('#songPin').count()), 'plus de case « Garder le panneau affiché »');
  ok((await page.locator('#sgSceneList .sg-srow').count()) === 1, 'une ligne par scène');
  ok((await page.locator('#sgSceneList .sg-srow .sg-dots i.on').count()) >= 1, 'pistes qui jouent : petites barres');
  ok(!(await page.evaluate(() => document.querySelector('#sgAutoBox').open)), 'automation repliée');

  // nouvelle scène, puis duplication de la première (⋯)
  await page.click('#sgNewScene'); await settle();
  let st = await S();
  ok(st.scenes.length === 2 && st.current === st.scenes[1], `« + Vide » crée et sélectionne « ${st.scenes[1]} »`);
  await page.click('#sgSceneList .sg-srow:nth-child(1) .sg-more');
  await page.locator('#songDialog .pbm-menu button', { hasText: 'Dupliquer' }).click(); await settle();
  st = await S();
  ok(st.scenes.join() === 'Couplet,Couplet (copie),' + st.scenes[2] && st.current === 'Couplet (copie)', `⋯ Dupliquer : ${st.scenes.join(', ')}`);

  // sélection par clic
  await page.click('#sgSceneList .sg-srow:nth-child(1) .sg-name'); await settle();
  ok((await S()).current === 'Couplet', 'clic sur une ligne : la scène est sélectionnée');

  // renommer (double-clic sur le nom)
  await page.dblclick('#sgSceneList .sg-srow:nth-child(2) .sg-name');
  await page.fill('#sgSceneList .scene-rename', 'Pont');
  await page.keyboard.press('Enter'); await settle();
  st = await S();
  ok(st.scenes[1] === 'Pont' && (await page.locator('#songDialog').getAttribute('open')) !== null, 'renommer (la fenêtre reste ouverte)');

  // longueur
  await page.selectOption('#sgSceneList .sg-srow:nth-child(2) .sg-bars', '4'); await settle();
  st = await S();
  ok(st.bars[1] === 4 && (await page.inputValue('#bars')) === '4', `longueur de « Pont » : 4 mesures (${st.bars.join(',')})`);

  // ranger : la 3ᵉ scène en tête (glisser vers le haut)
  await drag('#sgSceneList .sg-srow:nth-child(3)', '#sgSceneList .sg-srow:nth-child(1)', 'top');
  st = await S();
  ok(st.scenes.join() === 'Refrain,Couplet,Pont', `ranger les scènes : ${st.scenes.join(', ')}`);

  // déposer Pont à la fin de la chanson, puis Refrain avant le premier bloc
  const before = (await S()).song;
  await drag('#sgSceneList .sg-srow:nth-child(3)', '#sgBlocks .sg-block:last-of-type', 'after');
  st = await S();
  ok(st.song.join() === [...before, 'Pont'].join(), `déposer « Pont » à la fin : ${st.song.join(' → ')}`);
  await drag('#sgSceneList .sg-srow:nth-child(1)', '#sgBlocks .sg-block:nth-child(1)', 'before');
  st = await S();
  ok(st.song.join() === ['Refrain', ...before, 'Pont'].join(), `déposer avant le 1er bloc : ${st.song.join(' → ')}`);

  // déplacer un bloc : le 3ᵉ en 2ᵉ position ; Alt : copier
  const s0 = (await S()).song;
  await drag('#sgBlocks .sg-block:nth-child(3)', '#sgBlocks .sg-block:nth-child(2)', 'before');
  st = await S();
  ok(st.song.join() === [s0[0], s0[2], s0[1], ...s0.slice(3)].join(), `déplacer un bloc : ${st.song.join(' → ')}`);
  await page.keyboard.down('Alt');
  await drag('#sgBlocks .sg-block:nth-child(1)', '#sgBlocks .sg-block:last-of-type', 'after');
  await page.keyboard.up('Alt');
  st = await S();
  ok(st.song.length === s0.length + 1 && st.song[st.song.length - 1] === st.song[0], `Alt + glisser : copie du bloc à la fin (${st.song.join(' → ')})`);

  // bord droit : répétitions
  const g = await page.locator('#sgBlocks .sg-block:nth-child(1)').boundingBox();
  await page.mouse.move(g.x + g.width - 3, g.y + 20);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width * 2 - 3, g.y + 20, { steps: 6 });
  await page.mouse.up(); await settle();
  ok((await P()).song[0][1] === 2, `tirer le bord droit : 2 répétitions (${JSON.stringify((await P()).song[0])})`);
  // clic droit : une répétition de moins
  await page.locator('#sgBlocks .sg-block:nth-child(1)').click({ button: 'right' });
  ok(await page.locator('#songDialog .pbm-menu').isVisible(), 'clic droit : menu du bloc dans la fenêtre');
  await page.locator('#songDialog .pbm-menu button', { hasText: 'Une répétition de moins' }).click(); await settle();
  ok((await P()).song[0][1] === 1, 'menu : une répétition de moins');

  // ligne de piste : couper la piste dans une scène, puis Ctrl+Z
  const on = page.locator('#sgLanes .sg-cell.on').first();
  await on.click(); await settle();
  ok((await P()).mute.some(Boolean) && (await page.locator('#sgLanes .sg-cell.mute').count()) >= 1, 'clic sur une case : piste coupée dans la scène');
  await page.keyboard.press('Control+z'); await settle();
  ok(!(await P()).mute.some(Boolean), 'Ctrl+Z : la piste rejoue');
  SHOTS && (await page.screenshot({ path: path.join(SHOTS, 'song-window.png') }));

  // chanson : une seule ligne, largeur selon la durée, tient dans la fenêtre, règle en mesures
  const fr = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const bars = p.song.map((x) => {
      const sc = p.scenes.find((s) => s.id === x.scene);
      return (sc.id === p.current ? p.bars : sc.bars) * x.repeat;
    });
    const els = [...document.querySelectorAll('#sgBlocks .sg-block')];
    const r = els.map((e) => e.getBoundingClientRect());
    const tl = document.querySelector('#sgTimeline').getBoundingClientRect();
    return { bars, w: r.map((x) => x.width), tops: [...new Set(r.map((x) => Math.round(x.top)))], right: Math.max(...r.map((x) => x.right)), tlRight: tl.right, marks: document.querySelectorAll('#sgRuler span').length, dlg: document.querySelector('#songDialog').getBoundingClientRect().height };
  });
  ok(fr.tops.length === 1, 'les blocs sont sur une seule ligne');
  ok(fr.w.every((w, i) => Math.abs(w / fr.bars[i] - fr.w[0] / fr.bars[0]) < 0.5), `largeur proportionnelle à la durée (${fr.bars.join(', ')} mesures)`);
  ok(fr.right <= fr.tlRight + 1, 'la chanson tient dans la largeur');
  ok(fr.marks >= 2, `règle en mesures (${fr.marks} graduations)`);
  ok(fr.dlg < 700, `fenêtre compacte (${Math.round(fr.dlg)} px)`);
  // Écouter (mode Chanson) : tête de lecture sur la chanson
  await page.click('#sgMode [data-mode="song"]'); await settle();
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
  // ▶ d'une scène : lecture Scène en boucle
  await page.click('#sgSceneList .sg-srow:nth-child(2) .sg-loop'); await page.waitForTimeout(400);
  ok((await P()).mode === 'loop' && (await S()).current === (await S()).scenes[1], '▶ d’une scène : elle tourne en boucle (Scène)');
  await page.click('#sgSceneList .sg-srow:nth-child(2) .sg-loop'); await page.waitForTimeout(200);
  ok(/Écouter/.test(await page.textContent('#sgPlay')), 'second clic : arrêt');
  // automation : dépliée à la demande
  await page.click('#sgAutoBox summary'); await page.waitForTimeout(300);
  ok(await page.locator('#sgAutoTools .ba-seg').first().isVisible(), 'automation par temps dépliée');

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
