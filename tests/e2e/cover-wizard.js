/*
 * Test de bout en bout de la porte « Reprendre » de l'assistant (js/band.js) :
 *   node tests/e2e/cover-wizard.js
 * On tape une reprise (titre, tempo, parties et accords, ordre), on la fait jouer à la façon d'une inspiration,
 * et la chanson créée a les scènes, les accords, la tonalité, le tempo et l'arrangement tapés.
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
const SHOTS = process.env.SHOTS;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#bandMode'), 'les deux portes : Créer / Reprendre');
  ok(!(await page.isVisible('#bandCover')), 'Créer par défaut : pas de formulaire de reprise');
  await page.click('#bandMode [data-mode="cover"]');
  ok(await page.isVisible('#bandCover'), 'Reprendre : le formulaire de la reprise');
  ok(/façon/.test(await page.textContent('#bandPresetsLabel')), 'les inspirations deviennent « le groupe joue à la façon de… »');
  ok((await page.locator('.bcv-row').count()) === 4, 'un exemple de quatre parties');
  ok(/La mineur \(déduite\)/.test(await page.textContent('#bcvSum')), `tonalité déduite du premier accord : ${await page.textContent('#bcvSum')}`);

  // la reprise : deux parties, en Sol majeur, avec un accord emprunté et un accord à basse imposée
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await page.fill('#bcvTitle', 'Ma reprise');
  await page.fill('#bcvTempo', '96');
  await page.press('#bcvTempo', 'Enter');
  await page.click('.bcv-del >> nth=3');
  await page.click('.bcv-del >> nth=2');
  ok((await page.locator('.bcv-row').count()) === 2, 'enlever des parties');
  await page.fill('.bcv-name >> nth=0', 'Couplet');
  await page.fill('.bcv-chords >> nth=0', 'G | D/F# | Em | C');
  await page.fill('.bcv-name >> nth=1', 'Refrain');
  await page.fill('.bcv-chords >> nth=1', 'C D | G | Bb | D');
  await page.fill('#bcvOrder', 'Couplet Refrain Couplet Refrain ×2');
  const sum = await page.textContent('#bcvSum');
  ok(/5 blocs · 20 mesures/.test(sum) && /Sol majeur/.test(sum) && /96 BPM/.test(sum), `résumé : ${sum}`);
  const chips = await page.$$eval('[data-part="1"] .bcv-chip', (cs) => cs.map((c) => c.textContent));
  ok(chips.join(' ') === 'CIV DV GI B♭♭III DV' || (chips.length === 5 && chips[3].startsWith('B')), `accords lus avec leur degré : ${chips.join(' · ')}`);
  ok(/jeu : refrain de/.test(await page.textContent('[data-part="1"]')), 'le refrain reprend le jeu du refrain de l’inspiration');

  // erreurs : accord inconnu, ordre inconnu → Suivant bloqué
  await page.fill('.bcv-chords >> nth=0', 'G | Hm7');
  ok(await page.isDisabled('#bwNext'), 'accord inconnu : Suivant bloqué');
  ok(/⚠/.test(await page.textContent('[data-part="0"]')), 'l’erreur s’affiche sous la partie');
  await page.fill('.bcv-chords >> nth=0', 'G | D/F# | Em | C');
  await page.fill('#bcvOrder', 'Couplet Pont');
  ok(await page.isDisabled('#bwNext') && /pont/i.test(await page.textContent("#bcvSum")), 'partie inconnue dans l’ordre : Suivant bloqué');
  await page.fill('#bcvOrder', 'Couplet Refrain Couplet Refrain ×2');
  ok(!(await page.isDisabled('#bwNext')), 'reprise correcte : Suivant possible');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cover-form.png') });

  // 2. Chanson : les scènes tapées
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  const scenes = await page.$$eval('.bw-sname', (xs) => xs.map((x) => x.textContent));
  ok(scenes.join() === 'Couplet,Refrain', `une ligne par partie : ${scenes.join(', ')}`);
  ok((await page.inputValue('#bwTempo')) === '96', 'bandeau : le tempo de la reprise');
  ok(/Sol majeur/.test(await page.textContent('#bwKey')), 'bandeau : Sol majeur');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cover-song.png') });

  // 3. Accords : la grille de la partie
  await page.click('#bwNext');
  await page.waitForTimeout(200);
  const gnames = await page.$$eval('#bwLane .gr-blk', (bs) => bs.map((x) => x.querySelector('b').textContent));
  ok(gnames.join(' ') === 'G D/F♯ Em C', `grille du couplet : ${gnames.join(' ')}`);

  // créer
  await page.click('#bandWizSteps li >> nth=4 >> button');
  await page.waitForTimeout(150);
  await page.click('#bwCreate');
  await page.waitForTimeout(500);
  const p = await P();
  ok(p.title === 'Ma reprise' && p.tempo === 96, `projet : « ${p.title} », ${p.tempo} BPM`);
  ok(p.scenes.map((s) => s.name).join() === 'Couplet,Refrain' && p.scenes.every((s) => s.key.tonic === 'G' && s.key.mode === 'major'), 'scènes Couplet et Refrain en Sol majeur');
  ok(p.song.map((x) => x.repeat).join() === '1,1,1,2' && p.scenes[0].bars === 4, 'arrangement : Couplet Refrain Couplet Refrain ×2');
  ok(p.tracks.length > 4 && p.scenes.every((s) => Object.keys(s.data).length > 0), `le groupe joue : ${p.tracks.length} pistes`);
  // la basse joue les fondamentales tapées (G, puis F♯ sous D/F#) au début des mesures du couplet
  const bass = p.tracks.find((t) => t.band && t.band.key.startsWith('bass'));
  if (bass) {
    const ev = p.scenes[0].data[bass.id].events || [];
    const at = (bar) => ev.filter((e) => e.step >= bar * 16 && e.step < bar * 16 + 4).flatMap((e) => e.notes.map((n) => n % 12));
    ok(at(0).includes(7) && at(1).includes(6), `basse : Sol puis Fa♯ (${at(0)} / ${at(1)})`);
  }
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
