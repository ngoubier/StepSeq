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
  const card = '#bandStyles [data-v="cinematic"]';
  ok(await page.isVisible(card), 'carte « Cinematic music » parmi les styles');
  ok(/Cinematic music/.test(await page.textContent(card)) && /Morceaux complets/.test(await page.textContent(card)), 'la carte dit ce qu’elle contient');
  await page.click(card);
  ok((await page.getAttribute(card, 'aria-checked')) === 'true' && (await page.locator('#bandStyles .bsty.active').count()) === 1, 'style choisi (un seul actif)');
  ok((await page.locator('#bandPresets .band-preset').count()) === 1 && /Reconstitution cinématique/.test(await page.textContent('#bandPresets')), 'une chanson : « Reconstitution cinématique »');
  ok(/Modèle/.test(await page.textContent('#bandSong .bs-kind')) && /72 mesures/.test(await page.textContent('#bandSong')) && (await page.locator('#bandSong .bs-mus li').count()) === 13, 'détail : 72 mesures, 13 pistes');
  ok(!(await page.isVisible('#bwQuick')) && (await page.isDisabled('#bwNext')), 'pas de « Générer et écouter » ni d’étapes : le modèle s’ouvre tel quel');
  ok(await page.evaluate(() => { const c = document.querySelector('[data-v="cinematic"] canvas'); return c.width > 0 && c.getContext('2d').getImageData(c.width * 0.72 | 0, c.height * 0.42 | 0, 1, 1).data[0] > 120; }), 'image du style dessinée');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'template-style.png') });
  ok(await page.evaluate(() => { const r = document.querySelector('#bsTplOpen').getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 0; }) || (await page.locator('#bsTplOpen').scrollIntoViewIfNeeded(), true), '« Ouvrir cette chanson » atteignable');
  if (SHOTS) await page.locator('#bandSong').screenshot({ path: path.join(SHOTS, 'template-song.png') });

  // revenir à un style ordinaire, puis au modèle
  await page.click('#bandStyles [data-v="synthwave"]');
  ok((await page.locator('#bandPresets .band-preset').count()) === 10 && (await page.isVisible('#bwQuick')), 'Synthwave : ses 10 inspirations et « Générer et écouter » reviennent');
  await page.click('#bandMode [data-mode="cover"]');
  ok(!(await page.isVisible(card)), 'Reprendre : pas de modèles');
  await page.click('#bandMode [data-mode="create"]');
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
  await page.click('#appMenuBtn');
  await page.click('#bandBtn');
  await page.waitForTimeout(500);
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
