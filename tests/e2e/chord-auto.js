/*
 * « ✦ Proposer » de la piste Accords (js/ui.js, autoBar) : d'après une basse et une mélodie, la tonalité puis des accords.
 *   node tests/e2e/chord-auto.js [dossier-captures]
 * Bandeau tonalité (La mineur d'abord) → accords posés en proposition → Annuler remet la piste vide → Garder les pose
 * pour de bon (tonalité de la scène réglée) → Ctrl+Z revient à avant.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2];
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
  const URL = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(800);
  // une scène de 4 mesures, 84 BPM : basse La | Fa | Do | Sol et une mélodie en La mineur
  await page.evaluate(() => {
    const p = SS.newProject();
    p.bars = 4;
    p.tempo = 84;
    p.title = 'Accords auto';
    const bass = SS.newTrack({ name: 'Basse', type: 'instrument', family: 'bass', instrument: 'syn_sawbass' }, p);
    bass.events = [45, 41, 48, 43].flatMap((m, i) => [0, 8].map((o) => ({ step: i * 16 + o, len: 8, notes: [m], vel: 0.8 })));
    const mel = SS.newTrack({ name: 'Mélodie', type: 'instrument', family: 'synth', instrument: 'syn_square' }, p);
    mel.events = [[0, 4, 69], [4, 4, 72], [8, 8, 76], [16, 4, 74], [20, 4, 72], [24, 8, 71], [32, 8, 72], [40, 4, 71], [44, 4, 69], [48, 8, 67], [56, 8, 69]].map(([step, len, m]) => ({ step, len, notes: [m], vel: 0.8 }));
    p.tracks = [bass, mel];
    localStorage.setItem('stepseq.autosave', SS.serialize(p));
  });
  await page.reload();
  await page.waitForTimeout(1000);
  const saved = async () => (await page.waitForTimeout(500), page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave'))));
  const blocks = () => page.$$eval('#chordLane .cl-blk b', (l) => l.map((x) => x.textContent));

  ok(await page.isVisible('#chordLane .cl-auto'), 'bouton ✦ PROPOSER dans la piste Accords');
  await page.click('#chordLane .cl-auto');
  await page.waitForSelector('.cl-auto-bar');
  const first = await page.textContent('.cl-auto-key.on');
  ok(/La mineur/.test(first), `tonalité proposée d’abord : ${first}`);
  ok((await page.$$('.cl-auto-key')).length === 3, 'trois tonalités au choix');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'accords-auto-app-1-tonalite.png'), clip: { x: 0, y: 0, width: 1400, height: 460 } });

  await page.click('.cl-auto-btn.main'); // Proposer les accords
  await page.waitForSelector('#chordLane .cl-blk.prop');
  const names = await blocks();
  ok(names.length >= 2 && names[0] === 'Am', `accords proposés : ${names.join(' ')}`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'accords-auto-app-2-accords.png'), clip: { x: 0, y: 0, width: 1400, height: 460 } });
  await page.click('.cl-auto-btn >> text=Autre grille');
  const other = await blocks();
  ok(other.join() !== names.join(), `↻ Autre grille : ${other.join(' ')}`);

  await page.click('.cl-auto-btn >> text=Annuler');
  ok((await blocks()).length === 0 && !(await page.$('.cl-auto-bar')), 'Annuler : piste Accords vide, bandeau fermé');
  let p = await saved();
  ok(!p.scenes[0].key, 'Annuler : la scène reste sans tonalité');

  await page.click('#chordLane .cl-auto');
  await page.click('.cl-auto-btn.main');
  await page.click('.cl-auto-btn.main'); // Garder
  ok(!(await page.$('.cl-auto-bar')) && (await page.$$('#chordLane .cl-blk.prop')).length === 0, 'Garder : accords normaux, bandeau fermé');
  p = await saved();
  const sc = p.scenes.find((x) => x.id === p.current);
  ok(sc.key && sc.key.tonic === 'A' && sc.key.mode === 'minor' && sc.grid.chords.length >= 2, 'Garder : tonalité La mineur et grille enregistrées');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'accords-auto-app-3-gardes.png'), clip: { x: 0, y: 0, width: 1400, height: 460 } });

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  ok((await blocks()).length === 0, 'Ctrl+Z : retour à la piste vide');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
