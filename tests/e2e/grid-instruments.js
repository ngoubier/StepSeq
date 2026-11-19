/*
 * Test de bout en bout : l'assistant « Nouvelle chanson » ouvert depuis la grille reprend ses instruments
 * (js/band.js gridInstruments, js/bandgroup.js fromGrid) :
 *   node tests/e2e/grid-instruments.js [dossier-captures]
 * Une grille faite à la main (kick + caisse claire, basse, nappe aux accords, lead) : le groupe de l'assistant = ces
 * instruments, avec leur son et leur sound design ; changer d'inspiration les garde ; « ↺ inspiration » revient au groupe
 * de l'inspiration ; la chanson créée a les sons de la grille.
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
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  const shot = (n) => SHOTS && page.screenshot({ path: path.join(SHOTS, n) });
  const url = `http://localhost:${server.address().port}/index.html`;
  await page.goto(url);
  await page.waitForTimeout(800);
  // la grille faite à la main
  await page.evaluate(() => {
    const p = SS.newProject();
    p.title = 'Grille à la main';
    const add = (o) => {
      const t = SS.newTrack(o, p);
      p.tracks.push(t);
      return t;
    };
    add({ type: 'drum', name: 'Kick', source: 'tdm', sound: 'bd', machine: 'RolandTR909' }).steps[0] = 1;
    add({ type: 'drum', name: 'Snare', source: 'tdm', sound: 'sd', machine: 'RolandTR909' }).steps[4] = 1;
    add({ type: 'instrument', name: 'Ma basse', family: 'bass', instrument: SS.findFamily('bass').instruments[1].id }).events.push({ step: 0, len: 4, notes: [36], vel: 1 });
    const pad = add({ type: 'instrument', name: 'Nappe', family: 'pads', instrument: SS.findFamily('pads').instruments[2].id });
    pad.events.push({ step: 0, len: 16, notes: [57, 60, 64], vel: 0.8 });
    pad.sd = { cutoff: 777, q: 3 };
    add({ type: 'instrument', name: 'Lead', family: 'synth', instrument: SS.findFamily('synth').instruments[0].id }).events.push({ step: 0, len: 2, notes: [76], vel: 1 });
    SS.commitScene(p);
    localStorage.setItem('stepseq.autosave', SS.serialize(p));
  });
  await page.goto(url);
  await page.waitForTimeout(1200);
  const grid = await page.evaluate(() => [...document.querySelectorAll('#tracks .track')].length);
  ok(grid === 5, `grille à la main : 5 pistes (${grid})`);
  await page.click('#viewWiz');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#brgSkip'), 'la fenêtre « Reprendre la grille » s’ouvre (testée dans grid-read.js) : on l’ouvre sans reprendre');
  await page.click('#brgSkip');
  const info = () =>
    page.evaluate(() => {
      const S = SS.band._state;
      return { names: S.group.list.map((r) => r.name), planned: SS.band.plannedTracks().map((o) => ({ name: o.name, type: o.type, instrument: o.instrument, sound: o.sound, machine: o.machine, sd: o.keep && o.keep.sd })), grid: !!S.gridInst };
    });
  let g = await info();
  ok(JSON.stringify(g.names) === JSON.stringify(['Batterie', 'Ma basse', 'Nappe', 'Lead']), 'le groupe = les instruments de la grille : ' + g.names.join(', '));
  const want = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.map((t) => t.instrument || t.sound));
  ok(g.planned.filter((o) => o.type === 'drum').map((o) => o.sound + '@' + o.machine).join(',') === 'bd@RolandTR909,sd@RolandTR909', 'batterie : les éléments et le kit de la grille');
  ok(['Ma basse', 'Nappe', 'Lead'].every((n, i) => g.planned.some((o) => o.instrument === want[i + 2])), 'basse, nappe, lead : le son de la grille');
  ok(g.planned.some((o) => o.sd && o.sd.cutoff === 777), 'le sound design de la nappe est gardé');
  // changer d'inspiration : les instruments de la grille restent
  const p0 = await page.evaluate(() => SS.band._state.presetId);
  await page.click('#bandPresets .band-preset:not(.active)');
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => SS.band._state.presetId)) !== p0, 'autre inspiration choisie');
  // l'étape Instruments
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#bgFromGrid'), 'étape Instruments : « Repris de la grille »');
  await shot('grille-instruments-assistant.png');
  g = await info();
  ok(g.names.length === 4 && g.names[1] === 'Ma basse', 'toujours les instruments de la grille');
  // création : la chanson a les sons de la grille
  await page.evaluate(() => SS.band.create());
  await page.waitForTimeout(400);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  const pr = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  ok(pr.tracks.some((t) => t.sd && t.sd.cutoff === 777) && pr.tracks.some((t) => t.instrument === want[2]), 'chanson créée : sons et sound design de la grille');
  ok(pr.tracks.some((t) => t.events && t.events.length > 3), 'chanson créée : l’assistant a écrit les notes');
  // ↺ inspiration : le groupe de l'inspiration
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  if (!(await page.isVisible('#bgFromGrid'))) await page.click('#bwSteps [data-step="2"], .bw-step:nth-child(2)').catch(() => {});
  await page.waitForTimeout(300);
  if (await page.isVisible('#bgFromGrid')) {
    await page.click('#bgFromGrid');
    await page.waitForTimeout(300);
    const d = await page.evaluate(() => {
      const S = SS.band._state;
      const p = SS.Band.STYLES.flatMap((s) => s.presets).find((x) => x.id === S.presetId);
      return { now: S.group.list.map((r) => r.id).join(','), def: SS.bandGroup.defaultGroup(p).list.map((r) => r.id).join(','), btn: !!document.querySelector('#bgFromGrid') };
    });
    ok(d.now === d.def && !d.btn, '↺ inspiration : le groupe de l’inspiration');
  } else ok(false, 'étape Instruments retrouvée après la création');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
