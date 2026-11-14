/*
 * Fenêtre de sound design en onglets verticaux (js/sounddesign.js) :
 *   node tests/e2e/sound-tabs.js        (SHOTS=dossier pour des captures)
 * VCO, Filtre, Enveloppes, LFOs (sous-onglets LFO 1 | LFO 2), Glide, Sortie ; une section à la fois,
 * résumé des réglages sur chaque onglet, dernier onglet retenu, clavier, taille fixe, téléphone.
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
const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));

async function openPage(b, viewport) {
  const p = await b.newPage({ viewport, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript((d) => {
    if (!sessionStorage.seed) {
      localStorage.setItem('stepseq.autosave', JSON.stringify(d));
      localStorage.removeItem('stepseq.sdTab');
      sessionStorage.seed = '1';
    }
  }, demo);
  await p.goto(`http://localhost:${server.address().port}/index.html`);
  await p.waitForTimeout(1200);
  return { p, errs };
}
// ouvre la fenêtre sur la première piste instrument non analogique (bouton de l'en-tête de piste)
const openSd = (p) =>
  p.evaluate(() => {
    const t = SS.__track || JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((x) => x.type === 'instrument' && !SS.isAnalog(x));
    SS.__track = t;
    SS.soundDesign.open(t);
    return t.name;
  });
const visible = (p) => p.$$eval('#soundDialog .fx-pane', (ps) => ps.filter((x) => !x.hidden).map((x) => x.dataset.pane));
const state = (p, id) => p.textContent(`#sdState_${id}`);

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const { p, errs } = await openPage(b, { width: 1440, height: 900 });
  const name = await openSd(p);
  ok(!!name, `fenêtre ouverte sur « ${name} »`);
  const tabs = await p.$$eval('#sdTabs .fx-tab', (bs) => bs.map((x) => x.querySelector('.sd-tab-txt > span').textContent));
  ok(tabs.join() === 'VCO,Filtre,Enveloppes,LFOs,Glide,Sortie', `onglets : ${tabs.join(', ')}`);
  ok((await visible(p)).join() === 'vco', 'à la première ouverture : VCO seul visible');
  const size = await p.$eval('#soundDialog', (d) => [d.offsetWidth, d.offsetHeight]);
  ok(size[0] === 880 && size[1] === 640, `taille fixe ${size.join(' × ')}`);
  for (const t of ['vco', 'vcf', 'env', 'lfo', 'glide', 'out']) {
    await p.click(`#sdTabs [data-tab="${t}"]`);
    const over = await p.$eval('#soundDialog .fx-panes', (e) => e.scrollHeight - e.clientHeight);
    ok((await visible(p)).join() === t && over <= 1, `onglet ${t} : seul visible, sans défilement (${over})`);
    if (SHOTS) await p.locator('#soundDialog').screenshot({ path: path.join(SHOTS, `sd-${t}.png`) });
  }

  // résumés : suivent les réglages
  await p.click('#sdTabs [data-tab="vco"]');
  await p.click('#sdWaves [data-v="supersaw"]');
  ok((await state(p, 'vco')).startsWith('Supersaw'), `résumé VCO : ${await state(p, 'vco')}`);
  ok(/Hz/.test(await state(p, 'vcf')) || (await state(p, 'vcf')) === 'ouvert', `résumé Filtre : ${await state(p, 'vcf')}`);
  ok(/^A .* · R /.test(await state(p, 'env')), `résumé Enveloppes : ${await state(p, 'env')}`);
  ok((await state(p, 'lfo')) === 'off', 'résumé LFOs : off');

  // LFOs : sous-onglets, un panneau à la fois, point allumé quand actif
  await p.click('#sdTabs [data-tab="lfo"]');
  const lfoVis = () => p.$$eval('#sdLfoPanes .sd-lfo', (ss) => ss.filter((s) => !s.hidden).map((s) => s.id));
  ok((await lfoVis()).join() === 'sdLfo1', 'LFO 1 affiché par défaut');
  await p.click('#sdLfoTab2');
  ok((await lfoVis()).join() === 'sdLfo2' && (await p.getAttribute('#sdLfoTab2', 'aria-selected')) === 'true', 'clic LFO 2 : seul visible');
  await p.click('#sdLfo2Dest [data-v="cutoff"]');
  const dots = await p.$$eval('#sdLfoTabs .dot', (ds) => ds.map((d) => d.classList.contains('on')));
  ok(!dots[0] && dots[1], 'point allumé sur LFO 2 seulement');
  ok((await state(p, 'lfo')) === '1 actif' && (await p.$eval('#sdState_lfo', (e) => e.classList.contains('on'))), 'résumé LFOs : 1 actif');
  if (SHOTS) await p.locator('#soundDialog').screenshot({ path: path.join(SHOTS, 'sd-lfo2.png') });

  // clavier
  await p.focus('#sdTabs [data-tab="lfo"]');
  await p.keyboard.press('ArrowDown');
  ok((await visible(p)).join() === 'glide', 'flèche bas : Glide');
  await p.keyboard.press('Home');
  ok((await visible(p)).join() === 'vco', 'Début : VCO');
  await p.keyboard.press('End');
  ok((await visible(p)).join() === 'out', 'Fin : Sortie');

  // dernier onglet (et dernier LFO) retenus
  await p.click('#sdTabs [data-tab="lfo"]');
  await p.click('#sdCancel');
  await openSd(p);
  ok((await visible(p)).join() === 'lfo' && (await lfoVis()).join() === 'sdLfo2', 'réouverture : onglet LFOs, LFO 2');
  ok(errs.length === 0, `aucune erreur JS (${errs.join(' | ')})`);
  await p.close();

  // téléphone : pastilles en rangée, une colonne
  const ph = await openPage(b, { width: 390, height: 844 });
  await openSd(ph.p);
  const nav = await ph.p.$eval('#sdTabs', (n) => getComputedStyle(n).flexDirection);
  ok(nav === 'row', 'téléphone : onglets en rangée');
  await ph.p.click('#sdTabs [data-tab="env"]');
  const cols = await ph.p.$eval('.sd-env2', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  ok(cols === 1, 'téléphone : enveloppes l’une sous l’autre');
  const wide = await ph.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  ok(wide, 'téléphone : pas de défilement horizontal');
  if (SHOTS) await ph.p.screenshot({ path: path.join(SHOTS, 'sd-phone-env.png') });
  await b.close();
  server.close();
})();
