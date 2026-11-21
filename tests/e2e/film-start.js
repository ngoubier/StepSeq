/*
 * « Nouvelle chanson » : la tuile 🎬 « Musique de film » (js/film.js).
 *   node tests/e2e/film-start.js [dossier-captures]
 * Tuile après « Créer de zéro » ; modèle « La lumière revient » : 80 BPM, 5 passages, synchro m. 13 ; l'aperçu joue
 * le thème écrit ; « Modifier les repères » ouvre la scène libre (ajout d'un repère, tempo calé) ; « Créer la chanson ».
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

const SHOTS = process.argv[2] || null;
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name) });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + (process.env.STACK ? '\n' + e.stack : '')));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);

  const tile = page.locator('#bandStyles .bsty').nth(1);
  ok((await tile.getAttribute('data-v')) === 'film' && /Musique de film/.test(await tile.textContent()), 'la tuile 🎬 suit « Créer de zéro »');
  await shot(page, 'film-tuile.png');
  await tile.click();
  await page.waitForTimeout(400);
  ok((await page.locator('#bandPresets .band-preset').count()) === 2, 'deux départs : le modèle et « Ma scène »');
  ok((await page.inputValue('#tempo')) === '80', 'modèle : 80 BPM');
  ok((await page.locator('.bfm-cues tbody tr').count()) === 5, '5 repères');
  ok(/m\. 13/.test(await page.textContent('.bfm-cues tr.sync')), 'synchro forte sur la mesure 13');
  ok(/80 BPM/.test(await page.textContent('#bandSong')), 'calcul du tempo affiché');
  await page.locator('#bandSong').scrollIntoViewIfNeeded();
  await shot(page, 'film-modele.png');

  await page.click('#bwGo');
  await page.waitForTimeout(1500);
  await page.click('#stop').catch(() => {});
  const lis = await page.evaluate(() => {
    const r = SS.band._listen();
    const lead = r.tracks.find((t) => t.band && t.band.key === 'lead');
    return { scenes: r.scenes.length, top: lead ? r.scenes[3].data[lead.id].events.map((e) => e.notes[0]) : [] };
  });
  ok(lis.scenes === 5, `aperçu : 5 scènes (${lis.scenes})`);
  ok(lis.top.join() === '77,79,81,79,76', `le thème du modèle, tel qu’écrit (m. 13–14 : ${lis.top.join(' ')})`);

  // retour à l'étape 1 : la scène libre
  for (let i = 0; i < 6 && !(await page.isVisible('#bfmUnlock')); i++) {
    await page.dispatchEvent('#bwBack', 'click').catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.click('#bfmUnlock');
  await page.waitForTimeout(300);
  ok(/Ma scène/.test(await page.textContent('#bandPresets .band-preset.active')), '« Modifier les repères » ouvre « Ma scène »');
  await page.click('#bfmAdd');
  await page.waitForTimeout(300);
  ok((await page.locator('.bfm-cues tbody tr').count()) === 6, 'un repère ajouté');
  await page.locator('.bfm-cues tbody tr').nth(5).locator('.bfm-emo').selectOption('🦸');
  await page.waitForTimeout(300);
  const chips = page.locator('.bfm-opts .chip');
  ok((await chips.count()) >= 2, 'tempos calés proposés');
  const bpm = await chips.first().getAttribute('data-bpm');
  await chips.first().click();
  await page.waitForTimeout(300);
  ok((await page.inputValue('#tempo')) === bpm, `tempo choisi : ${bpm} BPM`);
  await page.locator('#bandSong').scrollIntoViewIfNeeded();
  await shot(page, 'film-scene.png');

  await page.click('#bwGo').catch(() => {});
  await page.waitForTimeout(1200);
  await page.click('#stop').catch(() => {});
  for (let i = 0; i < 25 && !(await page.isVisible('#bwCreate')); i++) {
    await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  }
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  if (process.env.STACK) console.log(p.scenes.map((s) => s.name + ':' + s.bars).join(' | '), JSON.stringify(p.song));
  ok(p.tempo === +bpm && p.scenes.length === 6 && p.tracks.some((t) => t.band && t.band.key === 'lead'), `chanson créée : ${p.scenes.length} scènes, ${p.tracks.length} pistes, ${p.tempo} BPM`);
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
