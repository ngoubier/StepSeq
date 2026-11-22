/*
 * Test de bout en bout de la mesure de la chanson dans l'assistant « Nouvelle chanson » (js/band.js, carte « Mesure ») :
 *   node tests/e2e/wizard-meter.js   (SHOTS=dossier pour les captures)
 * Étape Tempo : 4/4, 3/4, 6/8, 12/8 ; les scènes passent à 12 ou 24 pas par mesure ; batterie (motifs de la mesure),
 * basse et nappe ne proposent que les motifs qui vont dans la mesure ; la chanson créée porte la mesure (timeSig).
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
const SHOTS = process.env.SHOTS;
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
  const next = async (n = 1) => {
    for (let i = 0; i < n; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  };
  const cur = async () => (await page.locator('#bandWizSteps li.cur').textContent()).trim();
  const shot = (n) => SHOTS && page.screenshot({ path: path.join(SHOTS, n) });
  const lens = () => page.evaluate(() => SS.band._state.wiz.res.scenes.map((s) => Object.values(s.data).every((d) => !d.steps || d.steps.length === s.bars * SS.bandSong.meter().spb)));

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(2);
  ok((await cur()).includes('Tempo') && (await page.locator('.bwt-meter').count()) === 4, 'étape Tempo : quatre mesures proposées');
  ok((await page.getAttribute('.bwt-meter.active', 'data-sig')) === '4/4', '4/4 par défaut');

  for (const [sig, spb] of [['3/4', 12], ['12/8', 24], ['6/8', 12]]) {
    await page.click(`.bwt-meter[data-sig="${sig}"]`);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => [SS.band._state.wiz.meter, SS.bandSong.meter().spb]);
    ok(m[0] === sig && m[1] === spb && (await lens()).every(Boolean), `${sig} : ${spb} pas par mesure dans toutes les scènes`);
  }
  await shot('1-tempo-mesure.png');

  // batterie : la grille en 6/8, sans la bibliothèque 4/4
  await page.click('#bandWizSteps li[data-kind="drums"] button');
  await page.waitForTimeout(400);
  const pats = await page.$$eval('.bwp-lib .bwp-pat', (els) => els.map((e) => e.dataset.st + ':' + e.dataset.id).filter((x) => x !== ':'));
  ok(pats.length === 6 && pats.every((x) => x.startsWith('6/8:')) && (await page.textContent('#bwpLib')).includes('6/8'), `batterie en 6/8 : les ${pats.length} motifs de la mesure, pas ceux de 4/4`);
  await page.click('.bwp-pat[data-id="rock-68"]');
  await page.waitForTimeout(400);
  const kick = await page.evaluate(() => {
    const r = SS.band._state.wiz.res;
    const sc = r.scenes[0];
    const id = Object.keys(sc.data).find((k) => /:bd$/.test(k));
    return sc.data[id].steps.slice(0, 12).map((v) => (v > 0 ? 'x' : '-')).join('');
  });
  ok(kick === 'x---x-------', `Rock 6/8 choisi : la grosse caisse le joue (${kick})`);
  await page.click('#bwpMatch');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => Object.values(SS.band._state.wiz.parts).filter((p) => Object.values(p.inst || {}).some((x) => x && x.style === '6/8')).length >= 3), 'Assortir toutes les scènes : des motifs 6/8');
  await shot('2-batterie-68.png');

  // basse : seulement des motifs qui vont en 6/8
  await page.click('#bandWizSteps li[data-kind="bass"] button');
  await page.waitForTimeout(400);
  const bass = await page.$$eval('#bwMotif .mot-card', (els) => els.map((e) => e.dataset.id));
  const bassOK = await page.evaluate((ids) => ids.every((id) => id === 'none' || SS.bandSong.meterOK('bass', id)), bass);
  ok(bass.length > 2 && bass.includes('ballade68') && !bass.includes('valse') && !bass.includes('slow128') && bassOK, `basse en 6/8 : ${bass.length - 1} motifs, tous en 6/8 ou sans mesure`);
  await shot('3-basse-68.png');

  // nappe
  const pad = await page.$('#bandWizSteps li[data-kind="chords"] button');
  if (pad) {
    await pad.click();
    await page.waitForTimeout(400);
    await page.click('#bwPadMotif .mot-chip[data-g="ternary"]').catch(() => {});
    await page.waitForTimeout(300);
    const ids = await page.$$eval('#bwPadMotif .mot-card', (els) => els.map((e) => e.dataset.id));
    ok(ids.includes('berce68') && !ids.includes('valse3') && !ids.includes('house'), `nappe en 6/8 : motifs de la mesure (${ids.filter((x) => x !== 'none').join(', ')})`);
    await shot('4-nappe-68.png');
  }

  // la chanson créée porte la mesure
  await page.evaluate(() => SS.band.create());
  await page.waitForTimeout(1500);
  const ts = await page.evaluate(() => SS.project && SS.project.current ? SS.project.current().timeSig : JSON.parse(localStorage.getItem('stepseq.autosave') || '{}').timeSig);
  ok(Array.isArray(ts) && ts.join('/') === '6/8', `chanson créée en ${ts && ts.join('/')}`);
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  server.close();
})();
