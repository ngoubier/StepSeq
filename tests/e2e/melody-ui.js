/*
 * Test de bout en bout : Band → onglet Mélodie (js/melodypanel.js, js/melody.js).
 *   node tests/e2e/melody-ui.js
 * Grille + paroles → proposition (scansion, tableau, contrôles) → écriture sur une nouvelle piste ; Ctrl+Z.
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
  const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
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
  const before = await P();

  await page.click('#bandBtn');
  await page.click('#bandModes [data-mode="melody"]');
  ok(await page.isVisible('#bandMelody'), 'onglet Mélodie affiché');
  ok(!(await page.isVisible('#bandSongBtn')) && (await page.isVisible('#melGo')), 'boutons de la mélodie à la place de ceux du groupe');
  ok(!/mélodie/i.test(await page.textContent('#bandSub')), 'le sous-titre du bouton Band de l’en-tête n’est pas modifié');

  await page.fill('#melGrid', 'Am | F | C | G');
  ok((await page.locator('#melGridChips .mel-chip').count()) === 4, 'grille lue : 4 accords');
  await page.fill('#melText', "Je pense à toi quand vient la nuit\nLes rues s'allument une à une\nEt dans le vent de la lune\nJe reviens chanter près de toi");
  await page.selectOption('#melKey', 'auto');
  await page.selectOption('#melTrack', 'new');
  await page.click('#melGo');
  await page.waitForTimeout(200);
  const rows = await page.locator('.mel-table tbody tr').count();
  ok(rows > 30, `tableau des notes (${rows} lignes)`);
  ok((await page.locator('.mel-line').count()) === 4, 'scansion : 4 vers');
  ok((await page.locator('.mel-checks li.bad').count()) === 0, 'aucun contrôle en échec');
  ok(!(await page.isDisabled('#melWrite')), 'écriture possible');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'melodie-proposition.png') });
  const first = await page.locator('.mel-table tbody').innerText();
  await page.click('#melAgain');
  await page.waitForTimeout(200);
  ok((await page.locator('.mel-table tbody').innerText()) !== first, 'autre proposition : une mélodie différente');
  ok(JSON.stringify(await P()) === JSON.stringify(before), 'rien n’est écrit avant « Écrire sur la piste »');

  // structure métrique avec répartition imposée
  await page.click('.mel-form .segmented [data-v="meter"]');
  await page.fill('#melMeter', '3+5 3+5');
  await page.click('#melGo');
  await page.waitForTimeout(200);
  const att = await page.locator('.mel-checks li').allInnerTexts();
  ok(att.some((t) => /Vers 1 : 8 syllabes, 8 attaques \(3\+5/.test(t)), 'répartition 3+5 respectée');
  await page.click('.mel-form .segmented [data-v="text"]');
  ok((await page.inputValue('#melText')).startsWith('Je pense'), 'le texte est conservé en changeant de source');
  await page.click('#melGo');
  await page.waitForTimeout(200);

  await page.click('#melWrite');
  await page.waitForTimeout(800);
  ok(!(await page.isVisible('#bandDialog')), 'la fenêtre se ferme après écriture');
  const after = await P();
  const mel = after.tracks.find((t) => t.melody);
  ok(!!mel && mel.category === 'mono', 'nouvelle piste « Mélodie » (Mono)');
  const evs = mel ? (after.scenes.find((s) => s.id === after.current) || {}).data?.[mel.id]?.events || mel.events || [] : [];
  ok(evs.length >= 30 && evs.every((e) => e.notes.length === 1 && e.lyric), `notes écrites avec leurs syllabes (${evs.length})`);
  ok(after.bars >= 8, `scène allongée à ${after.bars} mesures`);
  ok(!after.tracks.find((t) => t.melody).band, 'la piste Mélodie n’est pas marquée Band');
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'melodie-piste.png') });
  }
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  ok(!(await P()).tracks.some((t) => t.melody), 'Ctrl+Z retire la mélodie');

  // téléphone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#bandBtn');
  await page.click('#bandModes [data-mode="melody"]');
  await page.click('#melGo');
  await page.waitForTimeout(200);
  const overlap = await page.evaluate(() => {
    const f = document.querySelector('.mel-form').getBoundingClientRect();
    const o = document.querySelector('.mel-out').getBoundingClientRect();
    const form = document.querySelector('.mel-form');
    return o.top < f.bottom - 1 || form.scrollHeight > form.clientHeight + 1;
  });
  ok(!overlap, 'téléphone : le résultat vient sous le formulaire, sans chevauchement');
  const overflow = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  ok(overflow <= 1, 'téléphone : pas de défilement horizontal de la fenêtre');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'melodie-mobile.png') });
  await page.click('#bandModes [data-mode="band"]');
  ok(await page.isVisible('#bandStage'), 'retour à l’onglet Groupe');

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
