/*
 * Phaser et flanger (js/audio.js, fenêtre Effets js/fx.js) : onglets, préréglages, vitesse au tempo, étages,
 * étage débranché à l'extinction, bouton Mouvement de la console Live et sa courbe par temps.
 *   node tests/e2e/phaser-flanger.js            (CAPTURE=dossier : captures de la fenêtre)
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
  const page = await b.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: process.env.CAPTURE ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.evaluate(() => {
    const p = SS.newProject();
    p.bars = 2;
    const drone = SS.newTrack({ type: 'instrument', category: 'poly', family: 'pad', instrument: 'syn_softpad', name: 'Drone', color: '#a479ff' }, p);
    drone.events = [{ step: 0, len: 32, notes: [57, 69], vel: 0.6 }];
    p.tracks.push(drone);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(600);
  const tid = await page.evaluate(() => window.StepSeq.etat().pistes[0].id);
  const mod = () => page.evaluate((id) => SS.audio._modState(id), tid);
  const fx = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].fx || {});

  // fenêtre Effets : onglets Phaser et Flanger
  await page.locator('.fx-btn').first().click();
  ok(await page.locator('#fxDialog').isVisible(), 'fenêtre Effets ouverte');
  await page.click('#fxTabs .fx-tab[data-tab="phaser"]');
  ok(await page.locator('.fx-pane[data-pane="phaser"]').isVisible(), 'onglet Phaser');
  await page.locator('[data-presets="phaser"] .chip', { hasText: 'Disco 70' }).click();
  await page.waitForTimeout(500);
  let f = await fx();
  ok(f.phaser === 0.55 && f.phaserSync === 4 && f.phaserStages === 8, 'préréglage Disco 70 : au tempo, 4 mesures, 8 étages');
  let m = await mod();
  ok(m && m.phaser === 8, 'phaser branché dans la tranche (8 étages)');
  ok(await page.locator('#fxPhaserSync button.active').innerText() === '4 mes.', 'vitesse : 4 mesures');
  await page.locator('#fxPhaserStages button', { hasText: '12' }).click();
  await page.waitForTimeout(300);
  ok((await mod()).phaser === 12, 'étages : 12, l’étage est reconstruit');
  if (process.env.CAPTURE) await page.locator('#fxDialog').screenshot({ path: path.join(process.env.CAPTURE, 'phaser-app.png') });

  await page.click('#fxTabs .fx-tab[data-tab="flanger"]');
  await page.locator('[data-presets="flanger"] .chip', { hasText: 'Creux' }).click();
  await page.waitForTimeout(900);
  f = await fx();
  ok(f.flanger === 0.5 && Math.abs(f.flangerFb + 0.7) < 0.01, 'préréglage Creux : résonance négative');
  ok((await mod()).flanger, 'flanger branché');
  if (process.env.CAPTURE) await page.locator('#fxDialog').screenshot({ path: path.join(process.env.CAPTURE, 'flanger-app.png') });
  await page.locator('[data-presets="flanger"] .chip', { hasText: 'Off' }).click();
  await page.waitForTimeout(300);
  ok(!(await mod()).flanger, 'Off : le flanger est débranché');
  await page.click('#fxForm button[type="submit"]');

  // console Live : le bouton Mouvement apparaît avec le phaser
  await page.click('#liveBtn');
  const labels = await page.locator('.lv-strip').first().locator('.lv-lab').allInnerTexts();
  ok(labels.includes('Mouvement'), 'console Live : bouton Mouvement (' + labels.join(', ') + ')');

  // courbe par temps « Mouvement » ×2 : la profondeur double pendant la lecture
  await page.evaluate(() => window.StepSeq.automationChanson({ piste: 'Drone', parametre: 'mouvement', valeur: 2 }));
  await page.mouse.click(5, 300);
  await page.evaluate(() => window.StepSeq.jouer({ chanson: true }));
  await page.waitForTimeout(1500);
  m = await mod();
  ok(m.mov === 2 && Math.abs(m.phaserAmt - Math.min(m.phaserDepth * 2, 0.95 * 550)) < 30, `Mouvement ×2 : profondeur ${Math.round(m.phaserAmt)} (base ${Math.round(m.phaserDepth)})`);
  await page.evaluate(() => window.StepSeq.stop());
  await page.waitForTimeout(300);

  ok(errs.length === 0, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
