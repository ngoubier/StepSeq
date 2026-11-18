/*
 * Automation par temps (js/beatauto.js, js/beatautoui.js) : menu du bouton Automation, panneau sous les notes
 * affiché seulement s'il est actif, histogramme d'une barre par temps, liaison des voisines, passages, paliers,
 * frise de la fenêtre Song, et courbe de cutoff appliquée au filtre pendant la note.
 *   node tests/e2e/beat-auto.js
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
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  // tempo 120, deux mesures, une basse synthé et une batterie ; la scène est jouée deux fois dans la chanson
  await page.evaluate(() => {
    const p = SS.newProject();
    p.bars = 2;
    const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_pwmbass', name: 'Basse', color: '#13c2a3' }, p);
    t.events = [{ step: 0, len: 32, notes: [36], vel: 0.8 }];
    p.tracks.push(t);
    p.tracks.push(SS.newTrack({ type: 'drum', name: 'Kick', color: '#ff4d6d' }, p));
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(500);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).song);
  const bass = page.locator('.track').nth(0);
  const kick = page.locator('.track').nth(1);

  ok((await page.locator('.ba-panel').count()) === 0, 'aucun panneau par temps au départ');
  await bass.locator('.th-auto').click();
  const items = page.locator('.ba-menu button');
  ok((await items.count()) === 4, `menu de la basse : cutoff, résonance, vélocité + ligne par pas (${await items.count()})`);
  await items.nth(0).click();
  ok((await bass.locator('.ba-panel').count()) === 1, 'Cutoff coché : le panneau s’ouvre sous les notes');
  ok((await bass.locator('.ba-cell').count()) === 8, 'une barre par temps : 8 pour 2 mesures');
  const c0 = await bass.locator('.ba-cell').first().boundingBox();
  const s4 = await bass.locator('.track-row .cell').nth(4).boundingBox();
  ok(Math.abs(c0.x + c0.width - s4.x) < 6, 'le 1er temps couvre les 4 premiers pas');
  ok((await kick.locator('.ba-panel').count()) === 0, 'pas de panneau sur la batterie');

  // dessin : temps 4 tout en haut, liaison douce (par défaut) : les voisins suivent
  const c3 = await bass.locator('.ba-cell').nth(3).boundingBox();
  await page.mouse.move(c3.x + c3.width / 2, c3.y + 3);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(600);
  let song = await saved();
  const tid = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].id);
  const cut = song[0].bauto && song[0].bauto[tid] && song[0].bauto[tid].cut;
  ok(cut && cut[0] && cut[0][3] > 3.5, `temps 4 tout en haut : ${cut && JSON.stringify(cut[0])}`);
  ok(cut && cut[0][2] > 1 && cut[0][2] < cut[0][3] && cut[0][4] > 1 && cut[0][1] < cut[0][2], 'les voisins suivent, de moins en moins');
  ok((await bass.locator('.ba-cell.linked').count()) > 0 && (await bass.locator('.ba-line[d^="M"]').count()) > 0, 'barres liées par la courbe');

  // la scène deux fois dans la chanson : passages, et « Tous » modifie les deux
  await page.click('#songBtn');
  await page.waitForTimeout(300);
  await page.locator('#sgBlocks .sg-block').first().locator('.sb-tools button').nth(1).click(); // ×2
  await page.waitForTimeout(300);
  ok((await page.locator('#sgAuto .ba-row').count()) === 1, 'frise, cutoff : une ligne pour la basse');
  // vélocité : la batterie aussi
  await page.locator('#sgAutoTools .ba-seg button', { hasText: 'Vélocité' }).click();
  ok((await page.locator('#sgAuto .ba-row').count()) === 2, 'frise, vélocité : basse et batterie');
  ok((await page.locator('#sgAuto .ba-row').first().locator('.ba-cell').count()) === 16, 'frise : 16 temps pour 2 passages de 2 mesures');
  await page.locator('#sgAutoTools .ba-seg button', { hasText: 'Cutoff' }).click();
  ok((await page.locator('#sgAuto .ba-row').count()) === 1, 'cutoff : la batterie n’a pas de ligne');
  // dessin dans la frise, 2e passage, temps 2 tout en bas, sans liaison
  await page.locator('#sgAutoTools .ba-link button', { hasText: 'Aucune' }).click();
  const f9 = await page.locator('#sgAuto .ba-row').first().locator('.ba-cell').nth(9).boundingBox();
  await page.mouse.move(f9.x + f9.width / 2, f9.y + f9.height - 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(600);
  song = await saved();
  const c2 = song[0].bauto[tid].cut;
  ok(c2[1] && c2[1][1] < -3.5 && Object.keys(c2[1]).length === 1, `frise : seul le temps 2 du passage 2 change (${JSON.stringify(c2[1])})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // panneau : passages
  const seg = bass.locator('.ba-head .ba-seg').first();
  ok((await seg.locator('button').count()) === 3, 'passages : Tous, 1, 2');
  await seg.locator('button').nth(2).click();
  await page.waitForTimeout(200);
  const h1 = await bass.locator('.ba-cell').nth(1).locator('.ba-bar').evaluate((e) => parseFloat(e.style.height));
  ok(h1 < 10, `passage 2 affiché : temps 2 en bas (${h1} %)`);
  await bass.locator('.ba-head .ba-seg').first().locator('button').nth(0).click();
  await page.waitForTimeout(200);
  ok((await bass.locator('.ba-read').first().textContent()).includes('varie selon le passage'), 'Tous : signale que les passages diffèrent');

  // paliers
  await bass.locator('.ba-head .ba-seg button', { hasText: 'Paliers' }).click();
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].bautoStep === true), 'Paliers enregistré sur la piste');
  ok((await bass.locator('.ba-cell.linked').count()) === 0, 'paliers : barres pleines, sans courbe');
  await bass.locator('.ba-head .ba-seg button', { hasText: 'Fluide' }).click();

  // masquer : le panneau disparaît, la courbe reste
  await bass.locator('.ba-x').click();
  ok((await bass.locator('.ba-panel').count()) === 0, '× : panneau masqué');
  ok((await saved())[0].bauto[tid].cut, 'la courbe est gardée');
  ok(await bass.locator('.th-auto.on').count() === 1, 'le bouton signale encore une automation');

  // lecture : la courbe de cutoff pilote le filtre pendant la note (passage 1 en boucle)
  await page.evaluate(() => {
    window.__curves = [];
    const orig = AudioParam.prototype.setValueCurveAtTime;
    AudioParam.prototype.setValueCurveAtTime = function (c, t, d) {
      window.__curves.push(Math.max(...Array.from(c)));
      return orig.call(this, c, t, d);
    };
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  const top = await page.evaluate(() => Math.max(0, ...window.__curves));
  ok(top > 3500 && top <= 4800, `courbe de cutoff envoyée au filtre (max ${Math.round(top)} cents)`);

  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
