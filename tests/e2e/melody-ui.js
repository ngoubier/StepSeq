/*
 * Test de bout en bout de l'atelier Mélodie (js/melodypanel.js, js/melody.js), monté dans une fenêtre de test
 * (il n'est plus dans Band ; Key → Chanson → Mélodie a son propre test, harmony-ui.js).
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
  // monte le panneau dans une fenêtre de test, avec ses boutons « Générer » et « Écrire sur la piste »
  const mount = () =>
    page.evaluate(() => {
      let d = document.querySelector('#melTestDlg');
      if (!d) {
        d = document.createElement('dialog');
        d.id = 'melTestDlg';
        d.className = 'band-dialog';
        d.innerHTML = '<div class="band-shell"><div id="melBox" style="flex:1;min-height:0;display:flex"></div><footer class="band-foot"><button type="button" class="btn" id="melGo">Générer une mélodie</button><button type="button" class="btn" id="melWrite" disabled>Écrire sur la piste</button></footer></div>';
        document.body.append(d);
        d.querySelector('#melGo').addEventListener('click', () => SS.melodyPanel.compose(true));
        d.querySelector('#melWrite').addEventListener('click', () => SS.melodyPanel.write());
        d.addEventListener('close', () => SS.melodyPanel.stop());
      }
      d.showModal();
      SS.melodyPanel.show({ box: d.querySelector('#melBox'), leadOpts: () => SS.band.melodyTrackOpts(), close: () => d.close(), buttons: { write: d.querySelector('#melWrite') } });
    });
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const before = await P();

  await mount();
  ok(await page.isVisible('#melBox .mel-form'), 'atelier Mélodie affiché');

  ok(!(await page.isVisible('#melText')) && !(await page.isVisible('#melKey')), 'vue simple : options et paroles repliées');
  await page.fill('#melGrid', 'Am | F | C | G');
  ok((await page.locator('#melGridChips .mel-chip').count()) === 4, 'grille lue : 4 accords');
  ok(/mélodie sur 4 mesures/.test(await page.textContent('#melGridChips')), 'longueur annoncée : 4 mesures');
  await page.fill('#melMeter', '');
  await page.selectOption('#melTrack', 'new');
  await page.click('#melGo');
  await page.waitForTimeout(200);
  ok(/sur 4 mesures/.test(await page.textContent('.mel-lead')), '4 accords → mélodie sur 4 mesures');
  ok(!(await page.isVisible('.mel-table')), 'tableau des notes replié dans « Détails »');
  const grid = await page.evaluate(() => {
    const svg = document.querySelector('.mel-roll');
    const chords = [...svg.querySelectorAll('.mr-chord')].map((t) => ({ text: t.textContent, y: t.getBBox().y }));
    const notes = [...svg.querySelectorAll('rect.mr-note')];
    const names = [...svg.querySelectorAll('.mr-name')].map((t) => t.textContent);
    const top = Math.min(...notes.map((r) => +r.getAttribute('y')));
    const fills = new Set(notes.map((r) => r.getAttribute('fill')));
    return { chords, names, nNotes: notes.length, top, fills: fills.size, legend: document.querySelector('.mel-legend').innerText };
  });
  ok(grid.chords.map((c) => c.text).join() === 'Am,F,C,G' && grid.chords.every((c) => c.y < grid.top), 'grille : les 4 accords en haut, au-dessus des notes');
  ok(grid.names.length === grid.nNotes && grid.names.every((n) => /^[A-G][♯♭]?\d$/.test(n)), `chaque note porte son nom (${grid.names.slice(0, 4).join(', ')}…)`);
  ok(/Repos/.test(grid.legend) && /Préparation/.test(grid.legend) && /Note de l’accord/.test(grid.legend), 'légende : fonction des accords et type des notes');
  ok(grid.fills >= 2, 'les notes sont colorées selon leur type');
  ok(!(await page.isDisabled('#melWrite')), 'écriture possible');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'melodie-proposition.png') });
  const first = await page.locator('.mel-roll').innerHTML();
  await page.click('#melGo');
  await page.waitForTimeout(200);
  ok((await page.locator('.mel-roll').innerHTML()) !== first, 'autre proposition : une mélodie différente');
  ok(JSON.stringify(await P()) === JSON.stringify(before), 'rien n’est écrit avant « Écrire sur la piste »');

  await page.fill('#melMeter', '8 8 8');
  await page.click('#melGo');
  await page.waitForTimeout(200);
  ok(/parts égales/.test(await page.textContent('#melOut')), '3 phrases sur 4 mesures : explication');
  await page.fill('#melMeter', '3+5 3+5');
  await page.click('#melGo');
  await page.waitForTimeout(200);
  await page.click('.mel-details summary');
  const att = await page.locator('.mel-checks li').allInnerTexts();
  ok(att.some((t) => /Vers 1 : 8 syllabes, 8 attaques \(3\+5/.test(t)), 'répartition 3+5 respectée');

  // paroles dans les options
  await page.click('#melMore summary');
  await page.fill('#melText', "Je pense à toi quand vient la nuit\nLes rues s'allument une à une");
  await page.click('#melGo');
  await page.waitForTimeout(200);
  ok((await page.locator('.mel-line').count()) === 2, 'paroles : 2 vers sur la grille de 4 mesures');
  await page.click('#melWrite');
  await page.waitForTimeout(800);
  ok(!(await page.isVisible('#melTestDlg')), 'la fenêtre se ferme après écriture');
  const after = await P();
  const mel = after.tracks.find((t) => t.melody);
  ok(!!mel && mel.category === 'mono', 'nouvelle piste « Mélodie » (Mono)');
  const evs = mel ? (after.scenes.find((s) => s.id === after.current) || {}).data?.[mel.id]?.events || mel.events || [] : [];
  ok(evs.length >= 14 && evs.every((e) => e.notes.length === 1 && e.lyric) && evs.every((e) => e.step < 4 * 16), `notes écrites avec leurs syllabes, dans les 4 mesures (${evs.length})`);
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
  await mount();
  await page.click('#melGo');
  await page.waitForTimeout(200);
  const overlap = await page.evaluate(() => {
    const f = document.querySelector('.mel-form').getBoundingClientRect();
    const o = document.querySelector('.mel-out').getBoundingClientRect();
    const form = document.querySelector('.mel-form');
    return o.top < f.bottom - 1 || form.scrollHeight > form.clientHeight + 1;
  });
  ok(!overlap, 'téléphone : le résultat vient sous le formulaire, sans chevauchement');
  const overflow = await page.evaluate(() => document.querySelector('#melTestDlg').scrollWidth - document.querySelector('#melTestDlg').clientWidth);
  ok(overflow <= 1, 'téléphone : pas de défilement horizontal de la fenêtre');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'melodie-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
