/*
 * Assistant « Nouvelle chanson » : style de modèles « Cinematic music » (js/band-templates.js, js/band.js) :
 *   node tests/e2e/band-template.js            (SHOTS=dossier : captures)
 * La carte du style, la chanson du modèle, « Ouvrir cette chanson » : le morceau complet s'ouvre (scènes, arrangement,
 * mix), rangé dans « Mes chansons » ; sur un projet commencé, on demande d'abord ; revenir à un style ordinaire.
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
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => {
    if (!sessionStorage.seed) {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      sessionStorage.seed = '1';
    }
  }, demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));

  // assistant sur une chanson vide
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  const film = '#bandStyles [data-v="film"]';
  const card = '#bandPresets [data-tpl="reconstitution-cinematique"]';
  ok(!(await page.isVisible('#bandStyles [data-v="cinematic"]')), 'plus de tuile « Cinematic music » à part');
  await page.click(film);
  ok(await page.isVisible(card) && /Reconstitution cinématique/.test(await page.textContent(card)) && /Morceau complet/.test(await page.textContent(card)), 'le morceau complet est un départ de « Musique de film »');
  ok((await page.locator('#bandPresets .band-preset').count()) === 5, 'quatre départs de film + le morceau complet');
  await page.click(card);
  ok((await page.getAttribute(card, 'aria-checked')) === 'true' && (await page.getAttribute(film, 'aria-checked')) === 'true' && (await page.locator('#bandStyles .bsty.active').count()) === 1, 'morceau choisi, la tuile Musique de film reste active');
  ok(/Modèle/.test(await page.textContent('#bandSong .bs-kind')) && /72 mesures/.test(await page.textContent('#bandSong')) && (await page.locator('#bandSong .bs-mus li').count()) === 13, 'détail : 72 mesures, 13 pistes');
  ok(!(await page.isVisible('#bwQuick')) && (await page.isDisabled('#bwNext')), 'pas de « Générer et écouter » ni d’étapes : le modèle s’ouvre tel quel');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'template-style.png') });
  ok(await page.evaluate(() => { const r = document.querySelector('#bsTplOpen').getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 0; }) || (await page.locator('#bsTplOpen').scrollIntoViewIfNeeded(), true), '« Ouvrir cette chanson » atteignable');
  // retour à un départ de film
  await page.click('#bandPresets .band-preset >> nth=0');
  ok((await page.getAttribute(card, 'aria-checked')) === 'false' && (await page.isVisible('#bwQuick')) && (await page.locator('.bfm-cues').count()) === 1, 'retour à « La lumière revient » : la scène et « Générer et écouter » reviennent');
  await page.click(card);

  // revenir à un style ordinaire, puis au modèle
  await page.click('#bandStyles [data-v="synthwave"]');
  ok((await page.locator('#bandPresets .band-preset').count()) === 10 && (await page.isVisible('#bwQuick')), 'Synthwave : ses 10 inspirations et « Générer et écouter » reviennent');
  await page.click('#bandMode [data-mode="cover"]');
  ok(!(await page.isVisible(film)) && !(await page.isVisible(card)), 'Reprendre : pas de musique de film ni de modèles');
  await page.click('#bandMode [data-mode="create"]');
  await page.click(film);
  await page.click(card);

  // ouvrir
  await page.click('#bsTplOpen');
  await page.waitForTimeout(800);
  ok(!(await page.isVisible('#bandDialog')), 'l’assistant se ferme');
  const p = await P();
  ok(p.title === 'Reconstitution cinématique' && p.tracks.length === 13 && p.scenes.length === 10 && p.playMode === 'song' && p.tempo === 63.2, `projet ouvert : ${p.title}, ${p.tracks.length} pistes, ${p.scenes.length} scènes`);
  ok(p.master && p.master.mastering && p.master.mastering.on, 'avec son master');
  const lib = await page.evaluate(async () => (await SS.store.list()).map((s) => s.title));
  ok(lib.includes('Reconstitution cinématique'), 'rangée dans « Mes chansons »');
  const id1 = p.id;

  // sur un projet commencé : on demande d'abord
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  if (await page.isVisible('#brgSkip')) await page.click('#brgSkip'); // « Reprendre la grille » : on part de zéro
  await page.click(film);
  await page.click(card);
  await page.click('#bsTplOpen');
  ok(await page.isVisible('#bandConfirm') && /Ouvrir le modèle/.test(await page.textContent('#bandConfirm')), 'projet commencé : confirmation');
  await page.click('#bcfBack');
  ok(await page.isVisible('#bandDialog') && (await P()).id === id1, 'Retour : rien ne change');
  await page.click('#bsTplOpen');
  await page.click('#bcfSong');
  await page.waitForTimeout(800);
  const p2 = await P();
  ok(p2.id !== id1 && p2.title === 'Reconstitution cinématique', 'confirmé : une nouvelle copie');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
