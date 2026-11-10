/*
 * Test de bout en bout : chaînes de traitement de l'Auto Mix (pistes à plat et Master à plat).
 *   node tests/e2e/automix-chains.js
 * Joue le projet de démo (tranches à plat, mastering coupé) en temps réel une douzaine de secondes.
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
  const page = await b.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.evaluate(() => localStorage.setItem('stepseq.automix', JSON.stringify({ minSecs: 10 })));
  await page.reload();
  await page.waitForTimeout(1500);
  // projet en mémoire (la démo n'est enregistrée qu'à la première modification)
  const kickMix = () => page.evaluate(() => {
    const id = document.querySelector('#mixerStrips .strip[data-id]').dataset.id;
    const p = JSON.parse(localStorage.getItem('stepseq.autosave') || 'null');
    const t = p && p.tracks.find((x) => x.id === id);
    return t ? SS.mixParams(t) : SS.mixParams({});
  });
  const master = () => page.evaluate(() => SS.masterParams(JSON.parse(localStorage.getItem('stepseq.autosave') || '{}')));

  await page.click('#mixerBtn');
  await page.waitForTimeout(300);
  await page.click('#amBtn');
  await page.click('#amStatus .am-play');
  await page.waitForTimeout(14000);
  const kickId = await page.evaluate(() => document.querySelector('#mixerStrips .strip[data-id]').dataset.id);
  const card = `#amCards .am-card[data-id="chain:${kickId}"]`;
  ok(await page.isVisible('#amCards .am-group >> text=Chaînes de départ'), 'onglet Mixage : groupe « Chaînes de départ »');
  ok(await page.isVisible(card), 'chaîne de départ proposée pour le kick à plat');
  const mods = await page.$$eval(`${card} .am-mod b`, (els) => els.map((e) => e.textContent));
  ok(mods.join() === 'Égaliseur,Compresseur,Limiteur', `modules : ${mods.join(', ')}`);
  ok(await page.isChecked(`${card} .am-mod input >> nth=0`) && !(await page.isChecked(`${card} .am-mod input >> nth=2`)), 'égaliseur coché, limiteur facultatif décoché');
  ok((await page.locator(`${card} .am-mod canvas`).count()) === 1, 'miniature de la courbe d\'égaliseur');

  // décocher le compresseur
  await page.click(`${card} .am-mod input >> nth=1`);
  ok((await page.textContent(`${card} .am-accept`)).includes('1 module'), 'le bouton devient « Accepter 1 module »');

  // essayer : le son change, le projet non
  await page.click(`${card} .am-try`);
  await page.waitForTimeout(300);
  ok((await page.getAttribute(`${card} .am-try`, 'aria-pressed')) === 'true', 'Essayer : bouton allumé');
  ok((await kickMix()).eq.on === false, 'Essayer n\'enregistre rien dans le projet');
  await page.click(`${card} .am-try`);
  ok((await page.getAttribute(`${card} .am-try`, 'aria-pressed')) === 'false', 'second clic : fin de l\'essai');

  // accepter l'égaliseur seul
  await page.click(`${card} .am-accept`);
  await page.waitForTimeout(800);
  let m = await kickMix();
  ok(m.eq.on && m.eq.hp.on && m.eq.lm.g < 0, `égaliseur appliqué (passe-haut ${m.eq.hp.f} Hz, ${m.eq.lm.f} Hz ${m.eq.lm.g} dB)`);
  ok(!m.comp.on, 'compresseur décoché : non appliqué');
  ok(!(await page.isVisible(`${card} .am-accept`)) && /Appliqué/.test(await page.textContent(card)), 'la carte passe à « Appliqué »');

  // chaîne de mastering
  await page.click('#amCards .am-tab >> nth=1');
  ok(await page.isVisible('#amCards .am-card[data-id="mchain"]'), 'onglet Mastering : chaîne de mastering (Master à plat)');
  ok(!(await page.isVisible('#amCards .am-card[data-id="loud"]')), 'le conseil de volume est inclus dans la chaîne');
  await page.click('#amCards .am-card[data-id="mchain"] .am-accept');
  await page.waitForTimeout(800);
  const mp = await master();
  ok(mp.mastering.on && mp.mastering.ceiling === -1 && mp.mastering.clip > 0 && mp.mix.comp.ratio === 2, `mastering activé (plafond ${mp.mastering.ceiling} dBTP, glue ${mp.mix.comp.ratio}:1, seuil ${mp.mix.comp.th} dB)`);

  // Ctrl+Z : la chaîne de mastering redevient à décider
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1300);
  ok(!(await master()).mastering.on, 'Ctrl+Z annule la chaîne de mastering');
  ok(await page.isVisible('#amCards .am-card[data-id="mchain"] .am-accept'), 'la carte est de nouveau proposée');

  // préférences : sans compresseurs ni limiteurs, la chaîne de mastering perd la glue
  await page.click('#amPrefsBtn');
  await page.click('#amScope_comp');
  await page.click('#automixPrefs .mx-close');
  await page.waitForTimeout(300);
  const mm = await page.$$eval('#amCards .am-card[data-id="mchain"] .am-mod b', (els) => els.map((e) => e.textContent));
  ok(mm.join() === 'Égaliseur,Mastering', `préférences respectées : ${mm.join(', ')}`);

  await page.click('#play');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
