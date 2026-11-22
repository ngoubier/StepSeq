/*
 * Ranger « Mes chansons » (js/mysongs.js, js/songname.js) :
 *   node tests/e2e/songs-tidy.js
 * Nom inventé pour une nouvelle chanson ; chanson seulement dans l'assistant : badge, « Reprendre » rouvre l'assistant ;
 * une chanson quittée vide disparaît ; filtre Vides et « Supprimer les N vides… » avec confirmation dans la fenêtre.
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
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const title = () => page.evaluate(() => document.querySelector('#title').value);

  // 1. nouvelle chanson : un nom inventé, puis du travail dans l'assistant seulement
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(700);
  const t1 = await title();
  ok(t1 !== 'Nouveau projet' && /^\S+ \S+$/.test(t1), `nom inventé : « ${t1} »`);
  await page.locator('#bandStyles .bsty').nth(1).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#bwNext').click());
  await page.waitForTimeout(2000); // le brouillon s'enregistre
  await page.click('#bandClose');
  await page.waitForTimeout(300);

  // 2. une autre nouvelle chanson, laissée vide, puis des vides déjà dans la bibliothèque
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(700);
  const t2 = await title();
  ok(t2 !== t1, `deuxième nom différent : « ${t2} »`);
  await page.click('#bandClose');
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) {
      const p = SS.newProject();
      await SS.store.put(p, SS.serialize(p));
    }
  });

  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await page.waitForTimeout(400);
  const cnt = (k) => page.locator(`.songs-cnt[data-c="${k}"]`).textContent();
  ok((await cnt('wiz')) === '1', `filtre Assistant : ${await cnt('wiz')}`);
  ok((await cnt('empty')) === '4', `filtre Vides : ${await cnt('empty')} (3 + la chanson en cours)`);
  const wizRow = page.locator('.song-row', { hasText: t1 });
  ok(/✦ Assistant · /.test(await wizRow.locator('.song-tag.wiz').textContent()), `badge : « ${await wizRow.locator('.song-tag.wiz').textContent()} »`);
  ok((await wizRow.locator('.btn-resume').textContent()) === 'Reprendre', 'bouton Reprendre');
  ok((await page.locator('#songsDelEmpty').textContent()) === 'Supprimer les 3 vides…', 'la chanson en cours n’est pas comptée dans le bouton');

  // 3. Reprendre : l'assistant s'ouvre ; la chanson vide quittée disparaît
  await wizRow.locator('.btn-resume').click();
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => document.body.classList.contains('wizard-mode')), 'la chanson s’ouvre dans l’assistant');
  const titles = await page.evaluate(async () => (await SS.store.list()).map((s) => s.title));
  ok(!titles.includes(t2), 'la chanson quittée vide n’est plus dans la liste');
  await page.click('#bandClose');

  // 4. supprimer les vides, avec confirmation
  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await page.waitForTimeout(400);
  await page.mouse.move(5, 5);
  if (process.env.SHOT_DIR) await page.locator('#songsDialog').screenshot({ path: process.env.SHOT_DIR + '/mes-chansons-liste.png' });
  await page.click('#songsDelEmpty');
  ok(!(await page.locator('#songsConfirm').isHidden()), 'confirmation affichée');
  if (process.env.SHOT_DIR) await page.locator('#songsDialog').screenshot({ path: process.env.SHOT_DIR + '/mes-chansons-confirmation.png' });
  ok((await page.locator('#songsConfirmList').textContent()) === 'Nouveau projet (×3)', 'titres regroupés');
  ok(/Supprimer 3 chansons vides/.test(await page.locator('#songsConfirmTitle').textContent()), await page.locator('#songsConfirmTitle').textContent());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok((await page.locator('#songsConfirm').isHidden()) && (await page.locator('#songsDialog').evaluate((d) => d.open)), 'Échap ferme la confirmation, pas la fenêtre');
  await page.click('#songsDelEmpty');
  await page.click('#songsConfirmYes');
  await page.waitForTimeout(400);
  ok((await cnt('empty')) === '0', `plus de vides : ${await cnt('empty')}`);
  ok(await page.locator('.song-row', { hasText: t1 }).count() === 1, 'la chanson de l’assistant est gardée');

  // 5. sélection : cocher puis supprimer
  const before = Number(await cnt('all'));
  await page.evaluate(async () => {
    const p = SS.newProject();
    p.title = 'À jeter';
    await SS.store.put(p, SS.serialize(p));
  });
  await page.click('#songsClose');
  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await page.waitForTimeout(300);
  await page.locator('.song-row', { hasText: 'À jeter' }).locator('.song-check').click();
  ok(!(await page.locator('#songsSelbar').isHidden()), 'bandeau de sélection');
  await page.click('#songsSelDel');
  await page.click('#songsConfirmYes');
  await page.waitForTimeout(300);
  ok(Number(await cnt('all')) === before, 'sélection supprimée');
  await page.click('#songsClose');

  // 6. au démarrage, la dernière chanson (seulement dans l'assistant) se rouvre dans l'assistant
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.body.classList.contains('wizard-mode')), 'au démarrage : l’assistant s’ouvre');

  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
