/*
 * Test de bout en bout de l'enregistrement automatique (js/store.js) et de « Mes chansons » (js/mysongs.js).
 *   node tests/e2e/autosave.js [dossier-captures]
 * Lance son propre petit serveur web sur le dossier du projet. Nécessite le paquet « playwright ».
 * Le sélecteur de fichier de Chrome n'existe pas sans écran : il est remplacé par un faux fichier en mémoire.
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
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const URL = `http://localhost:${server.address().port}/index.html`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.type() + ':' + d.message());
    d.accept();
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::/.test(m.text()) && errs.push(m.text()));
  // faux fichier (File System Access) : on garde ce qui y est écrit
  await page.addInitScript(() => {
    window.__written = [];
    const fake = (name) => ({
      kind: 'file',
      name,
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => {
        let buf = '';
        return { write: async (t) => (buf += t), close: async () => window.__written.push({ name, text: buf }) };
      },
      getFile: async () => new File([window.__fileContent || '{}'], name),
    });
    window.showSaveFilePicker = async (o) => fake(o.suggestedName);
    window.showOpenFilePicker = async () => [fake('ouvert.stepseq.json')];
  });

  const setTitle = async (t) => {
    await page.fill('#title', t);
    await page.dispatchEvent('#title', 'input');
  };
  const setTempo = async (v) => {
    await page.fill('#tempo', String(v));
    await page.dispatchEvent('#tempo', 'change');
  };
  const songTitles = () => page.$$eval('#songsList .song-title', (els) => els.map((e) => e.childNodes[0].textContent));

  await page.goto(URL);
  await wait(1800);
  ok((await page.textContent('#saveStatus')).includes('Enregistré'), 'indicateur : « Enregistré »');

  // 1. deux chansons, sans confirmation pour « Nouveau »
  await setTitle('Chanson A');
  await setTempo(101);
  await wait(1500);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await wait(600);
  await setTitle('Chanson B');
  await wait(1500);
  ok(dialogs.length === 0, '« Nouveau » sans message de confirmation');
  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await wait(300);
  const titles = await songTitles();
  ok(titles.length === 2 && titles[0] === 'Chanson B' && titles[1] === 'Chanson A', `Mes chansons : B puis A (${titles.join(', ')})`);
  ok(await page.locator('.song-row.current .song-title', { hasText: 'Chanson B' }).count() === 1, 'la chanson en cours est marquée');
  if (SHOTS) await page.locator('#songsDialog').screenshot({ path: path.join(SHOTS, 'songs.png') });

  // 2. rouvrir A
  await page.locator('.song-row', { hasText: 'Chanson A' }).getByRole('button', { name: 'Ouvrir' }).click();
  await wait(500);
  ok((await page.inputValue('#title')) === 'Chanson A' && (await page.inputValue('#tempo')) === '101', 'Chanson A rouverte avec son tempo');

  // 3. après rechargement : A en cours, toujours 2 chansons
  await page.reload();
  await wait(1500);
  ok((await page.inputValue('#title')) === 'Chanson A', 'rechargement : Chanson A en cours');
  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await wait(300);
  ok((await songTitles()).length === 2, 'rechargement : 2 chansons dans la bibliothèque');

  // 4. versions : on modifie A puis on restaure sa première version
  await page.click('#songsClose');
  await setTempo(140);
  await wait(1500);
  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await wait(300);
  await page.locator('.song-row', { hasText: 'Chanson A' }).getByRole('button', { name: 'Versions' }).click();
  await wait(300);
  const nv = await page.locator('.song-version').count();
  ok(nv >= 1, `versions de A : ${nv}`);
  if (SHOTS) await page.locator('#songsDialog').screenshot({ path: path.join(SHOTS, 'versions.png') });
  await page.locator('.song-version').last().getByRole('button', { name: 'Restaurer' }).click();
  await wait(600);
  const restored = await page.inputValue('#tempo');
  ok(restored !== '140', `version restaurée (tempo ${restored})`);
  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await wait(300);
  // la première version est l'état d'origine (« Démo ») : on suit la chanson en cours
  await page.locator('.song-row.current').getByRole('button', { name: 'Versions' }).click();
  await wait(300);
  ok((await page.locator('.song-version').count()) > nv, 'l’état d’avant la restauration est gardé dans les versions');
  await page.click('#songsClose');

  // 5. fichier lié : après « Enregistrer », chaque modification réécrit le fichier
  await page.click('#appMenuBtn');
  await page.click('#saveProject');
  await wait(400);
  ok((await page.textContent('#saveStatus')).includes('.stepseq.json'), `indicateur avec le fichier : « ${(await page.textContent('#saveStatus')).trim()} »`);
  const before = await page.evaluate(() => window.__written.length);
  await setTempo(123);
  await wait(2800);
  const last = await page.evaluate(() => window.__written[window.__written.length - 1]);
  ok((await page.evaluate(() => window.__written.length)) > before && JSON.parse(last.text).tempo === 123, 'le fichier est réécrit automatiquement (tempo 123)');
  ok(dialogs.length === 0, 'aucun message pendant l’enregistrement automatique');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'topbar.png'), clip: { x: 0, y: 0, width: 1440, height: 110 } });

  // 6. dupliquer puis supprimer la copie
  await page.click('#appMenuBtn');
  await page.click('#songsBtn');
  await wait(300);
  await page.locator('.song-row', { hasText: 'Chanson B' }).getByRole('button', { name: 'Dupliquer' }).click();
  await wait(400);
  ok((await songTitles()).includes('Chanson B (copie)'), 'Dupliquer : « Chanson B (copie) »');
  await page.locator('.song-row', { hasText: 'Chanson B (copie)' }).getByRole('button', { name: 'Supprimer' }).click();
  await wait(400);
  ok(!(await songTitles()).includes('Chanson B (copie)'), 'Supprimer (après confirmation)');
  ok(await page.locator('.song-row.current').getByRole('button', { name: 'Supprimer' }).isDisabled(), 'la chanson en cours ne peut pas être supprimée');

  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
