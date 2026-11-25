/*
 * Console Live (js/liveconsole.js, js/liveconsolepanel.js) : bouton Live, une tranche par piste, gestes pendant la
 * lecture (le moteur suit), enregistrement en automation par temps, une prise = un Ctrl+Z.
 *   node tests/e2e/live-console.js            (CAPTURE=chemin.png : capture de la console pendant une prise)
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: process.env.CAPTURE ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  // tempo 120, deux mesures : une basse en croches, un drone tenu, une batterie ; la scène est jouée 4 fois
  await page.evaluate(() => {
    const p = SS.newProject();
    p.bars = 2;
    const bass = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_pwmbass', name: 'Basse séquence', color: '#2b8cff' }, p);
    bass.events = Array.from({ length: 16 }, (_, i) => ({ step: i * 2, len: 1, notes: [38], vel: 0.8 }));
    const drone = SS.newTrack({ type: 'instrument', category: 'poly', family: 'pad', instrument: 'syn_softpad', name: 'Drone', color: '#a479ff' }, p);
    drone.events = [{ step: 0, len: 32, notes: [57, 69], vel: 0.6 }];
    p.tracks.push(bass, drone, SS.newTrack({ type: 'drum', name: 'Kick', color: '#3fcf8e' }, p));
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(600);
  ok(await page.locator('#liveDock').isHidden(), 'console fermée au départ');
  await page.click('#liveBtn');
  ok(await page.locator('#liveDock').isVisible(), 'bouton Live : la console s’ouvre');
  ok((await page.locator('.lv-strip').count()) === 3, 'une tranche par piste');
  const knobs = (i) => page.locator('.lv-strip').nth(i).locator('.lv-knob');
  ok((await knobs(0).count()) === 7, 'basse : cutoff, résonance, enveloppe, decay, écho, reverb, volume');
  ok((await knobs(2).count()) === 4, 'batterie : filtre DJ, écho, reverb, volume');

  // lecture de la chanson (4 passages), prise au toucher sur le cutoff de la basse
  const scName = await page.evaluate(() => window.StepSeq.etat().scenes[0].nom || window.StepSeq.etat().scenes[0].name);
  await page.evaluate((n) => window.StepSeq.structure({ blocs: [{ scene: n, fois: 4 }] }), scName);
  await page.mouse.click(5, 300); // le son ne part qu'après un clic dans la page
  await page.evaluate(() => window.StepSeq.jouer({ chanson: true }));
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => SS.audio.isPlaying() && SS.audio.isSongPlaying()), 'lecture de la chanson');

  await page.click('.lv-rec');
  ok(await page.evaluate(() => SS.liveConsole.isRec()), 'Enregistrer les gestes : prise en cours');
  const cut = knobs(0).nth(0);
  const bb = await cut.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 20);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(bb.x + bb.width / 2, bb.y + 20 - i * 4);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(900);
  const held = await page.evaluate(() => SS.beatAuto.live.size);
  ok(held === 1, 'geste tenu : la valeur remplace la courbe');
  ok(await cut.evaluate((el) => el.classList.contains('writing')), 'le bouton signale l’écriture (point rouge)');
  if (process.env.CAPTURE) await page.locator('#liveDock').screenshot({ path: process.env.CAPTURE });
  await page.mouse.up();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => SS.beatAuto.live.size === 0), 'au toucher : relâché, la courbe reprend');

  // volume de la batterie : tranche (nœuds d'automation) pendant le geste
  const vol = knobs(2).nth(3);
  const vb = await vol.boundingBox();
  await page.mouse.move(vb.x + vb.width / 2, vb.y + 20);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(vb.x + vb.width / 2, vb.y + 20 + i * 8);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const t = SS.audio.playingProject().tracks[2];
    return SS.audio._autoState(t);
  });
  ok(st && st.vol < 0.7, `la tranche suit le volume tenu (${st && st.vol.toFixed(2)})`);
  await page.mouse.up();

  // drone : la note tenue suit le geste, pas seulement les notes suivantes
  const dk = knobs(1).nth(0);
  const db = await dk.boundingBox();
  await page.mouse.move(db.x + db.width / 2, db.y + 20);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(db.x + db.width / 2, db.y + 20 + i * 8);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  const offs = await page.evaluate(() => SS.audio._liveOffsets(SS.audio.playingProject().tracks[1].id));
  ok(offs.some((v) => v < -300), `le drone tenu se referme pendant le geste (${offs.map((v) => Math.round(v)).join(', ')} cents)`);
  await page.mouse.up();
  await page.evaluate(() => window.StepSeq.stop());
  await page.waitForTimeout(600);
  ok(!(await page.evaluate(() => SS.liveConsole.isRec())), 'arrêt : la prise se termine');
  const after = await page.evaluate(() => window.StepSeq.automationsChanson({ piste: 'Basse séquence' }));
  const written = after.passages.reduce((n, ps) => n + Object.keys(ps.courbes.cut || {}).length, 0);
  ok(written >= 2, `les gestes sont écrits en courbe de cutoff (${written} temps)`);
  ok(await page.locator('.lv-take').isVisible(), 'prise affichée');

  await page.waitForTimeout(500);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const undone = await page.evaluate(() => window.StepSeq.automationsChanson({ piste: 'Basse séquence' }).passages.length);
  ok(undone === 0, 'Ctrl+Z : la prise entière est annulée');

  ok(errs.length === 0, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
