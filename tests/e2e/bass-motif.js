/*
 * Motif de basse dans la Grille (bouton MOTIF, js/ui.js openMotifMenu ; fenêtre Nouvelle piste, ligne Motif).
 *   node tests/e2e/bass-motif.js [dossier-captures]
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
  const page = await b.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(800);
  // une scène de 4 mesures en La mineur : Am | F | C | G, une nappe et une basse
  await page.evaluate(() => {
    const p = SS.newProject();
    p.bars = 4;
    p.tempo = 120;
    const sc = SS.currentScene(p);
    sc.key = { tonic: 'A', mode: 'minor' };
    sc.grid = SS.normalizeGrid({ chords: [0, 5, 2, 6].map((degree, i) => ({ step: i * 16, len: 16, degree, type: degree === 0 ? 'min' : 'maj' })), initialized: true });
    const bass = SS.newTrack({ name: 'Basse', type: 'instrument', family: 'bass', instrument: 'syn_sawbass' }, p);
    const pad = SS.newTrack({ name: 'Nappe', type: 'instrument', family: 'synth', instrument: 'syn_square', follow: true }, p);
    p.tracks = [pad, bass];
    localStorage.setItem('stepseq.autosave', SS.serialize(p));
  });
  await page.reload();
  await page.waitForTimeout(1000);
  const saved = async () => (await page.waitForTimeout(500), page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave'))));
  const bassSel = '.track:has(.th-mot)';

  ok((await page.$$('.th-mot')).length === 1, 'bouton MOTIF sur la seule piste de basse');
  await page.click('.th-mot');
  await page.waitForSelector('.mot-menu');
  const nCards = (await page.$$('.mot-menu .mot-card')).length;
  ok(nCards >= 40, `panneau : ${nCards} motifs`);
  await page.click('.mot-menu .mot-chip >> text=Funk & Disco');
  await page.click('.mot-menu .mot-card[data-id="disco16"]');
  let p = await saved();
  let bass = p.tracks.find((t) => t.name === 'Basse');
  ok(bass.follow && bass.follow.play === 'motif' && bass.follow.motif === 'disco16', 'clic sur Disco syncopée : la basse joue ce motif');
  ok((await page.textContent(bassSel)).includes('Disco syncopée'), 'sous-titre : Motif Disco syncopée');
  ok((await page.$$(`${bassSel} .on.start`)).length > 10, 'notes du motif dessinées dans la piste');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'motif-basse-app.png'), clip: { x: 0, y: 0, width: 1400, height: 700 } });

  await page.click('.mot-menu .fol-seg button >> text=Cette scène');
  await page.click('.mot-menu .mot-chip >> text=Soul & Jazz');
  await page.click('.mot-menu .mot-card[data-id="motown"]');
  p = await saved();
  bass = p.tracks.find((t) => t.name === 'Basse');
  ok(bass.follow.motif === 'disco16' && bass.follow.motifs && bass.follow.motifs[p.current] === 'motown', 'Cette scène : Motown pour la scène, Disco pour les autres');
  // fenêtre centrée et large, comme Arp One
  const box = await page.locator('.mot-menu').boundingBox();
  ok(box.width > 800 && Math.abs(box.x + box.width / 2 - 700) < 4, `panneau des motifs centré (${Math.round(box.x)} px, ${Math.round(box.width)} px de large)`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'motif-basse-popup.png') });
  await page.click('.mot-menu .ctx-close');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'motif-basse-grille.png'), clip: { x: 0, y: 0, width: 1400, height: 500 } });

  // MOTIF et ARP s'excluent : ARP ouvre Arp One et éteint le motif ; un motif éteint l'arpège
  await page.click(`${bassSel} .th-arp`);
  await page.waitForSelector('#arpDialog[open]');
  p = await saved();
  bass = p.tracks.find((t) => t.name === 'Basse');
  ok(bass.arpOn && !(bass.follow && bass.follow.play === 'motif'), 'ARP : Arp One s’ouvre, l’arpège s’allume, le motif s’éteint');
  await page.locator('#arpDialog .dlg-footer button', { hasText: 'Annuler' }).click();
  p = await saved();
  ok(!p.tracks.find((t) => t.name === 'Basse').arpOn, 'Annuler dans Arp One : l’arpège se rééteint');
  await page.click(`${bassSel} .th-arp`);
  await page.click('#arpDialog .arp-close');
  await page.click(`${bassSel} .th-mot`);
  await page.click('.mot-menu .mot-chip >> text=Tous');
  await page.click('.mot-menu .mot-card[data-id="disco16"]');
  await page.click('.mot-menu .ctx-close');
  p = await saved();
  bass = p.tracks.find((t) => t.name === 'Basse');
  ok(!bass.arpOn && bass.follow.play === 'motif', 'un motif choisi éteint l’arpège');

  // fenêtre Nouvelle piste : rôle Basse → ligne Motif
  await page.click('#emptyAdd');
  await page.waitForSelector('#trackDialog[open]');
  await page.click('#dlgRoles button[data-v="bass"]');
  ok(await page.isVisible('#dlgMotifRow'), 'Nouvelle piste, rôle Basse : ligne Motif');
  await page.click('#dlgMotifs .nt-motif-card[data-id="rock8"]');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'motif-basse-nouvelle-piste.png') });
  await page.click('#dlgRoles button[data-v="pads"]');
  ok(!(await page.isVisible('#dlgMotifRow')), 'rôle Nappe : pas de ligne Motif');
  await page.click('#dlgRoles button[data-v="bass"]');
  await page.click('#dlgOk');
  await page.waitForTimeout(800);
  p = await saved();
  const added = p.tracks[p.tracks.length - 1];
  ok(added.follow && added.follow.motif === 'rock8', `nouvelle basse créée avec le motif Croches rock (${JSON.stringify(added.follow)})`);

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
