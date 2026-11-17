/*
 * Test de bout en bout de l'étape Mix de l'assistant « Nouvelle chanson » (js/band.js, js/wizmix.js) :
 *   node tests/e2e/wizard-mix.js
 * Étape 11 : la console (une tranche par instrument, la batterie sous un cadre, le Master), un réglage pour toute la chanson,
 * un réglage propre à une scène (point doré, « ↺ chanson », compte dans la colonne des scènes), « chanson seulement » pour
 * ce qu'une scène ne peut pas automatiser, le tiroir des effets, l'écoute qui suit un fader, puis « Créer la chanson ».
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
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
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
  const next = async (n = 1) => {
    for (let i = 0; i < n; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  };
  const cur = async () => (await page.locator('#bandWizSteps li.cur').textContent()).trim();
  const R = (v) => Math.round(v * 10) / 10;
  const mix = () => page.evaluate(() => JSON.parse(JSON.stringify(SS.band._state.wiz.mix)));
  const fader = (id) => page.locator(`#bwMix [data-mx="vol"][data-id="${id}"]`);
  const scene = (name) => page.click(`.bh-scene:has(.bh-sname b:text-is("${name}"))`);
  const ownText = (name) => page.locator(`.bh-scene:has(.bh-sname b:text-is("${name}")) .mx-ownct`).textContent();

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(4); // Batterie
  ok((await page.locator('#bandWizSteps li').count()) === 12, 'douze étapes');
  ok((await page.evaluate(() => SS.band._state.wiz.mix)) === null, 'avant l’étape Mix : pas de mix');
  await next(6);
  ok((await cur()).includes('Mix') && (await page.locator('#bwStepHead h1').textContent()).startsWith('11'), 'étape 11 : Mix');
  ok((await page.locator('#bandWizSteps li:nth-child(11)').getAttribute('data-group')) === null && (await page.locator('#bandWizSteps li:nth-child(12)').getAttribute('data-group')) === 'Créer', 'Mix dans « Pistes, scène par scène », Intégration dans « Créer »');
  ok((await page.locator('#bandWizSteps li:nth-child(11) .bw-ss').textContent()) === 'Mixage automatique', 'résumé de l’étape : Mixage automatique');

  // la console : batterie sous un cadre, autres rôles, Master
  const m0 = await mix();
  const ids = Object.keys(m0.tracks);
  ok(ids.includes('kick') && ids.includes('bass') && (await page.locator('#bwMix .mx-strip').count()) === ids.length + 1, `console : ${ids.length} tranches et le Master`);
  ok((await page.locator('#bwMix .mx-group .mx-ghead').textContent()).startsWith('Batterie ·') && (await page.locator('#bwMix .mx-group .mx-strip').count()) >= 3, 'éléments de batterie sous le cadre « Batterie · kit »');
  ok((await page.locator('#bwMix .mx-strip.master').count()) === 1 && (await page.locator('.bh-scene').count()) === 6, 'Master, et six portées : la chanson et cinq scènes');
  ok((await page.locator('#bwMix .mx-scope').textContent()).includes('Toute la chanson') && (await page.locator('#mxSong[aria-pressed="true"]').count()) === 1, 'portée : toute la chanson');

  // un réglage pour toute la chanson
  await page.click('#play');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const kickVol = () => page.evaluate(() => SS.band._listen().tracks.find((t) => t.id.endsWith(':bd')).volume);
  const v0 = await kickVol();
  await fader('kick').fill(String(R(m0.tracks.kick.vol + 3)));
  await page.waitForTimeout(250);
  const m1 = await mix();
  ok(Math.abs(m1.tracks.kick.vol - R(m0.tracks.kick.vol + 3)) < 1e-9 && Object.keys(m1.own).length === 0, 'fader du kick : le réglage de la chanson change, aucune surcharge');
  const v1 = await kickVol();
  ok(Math.abs(v1 / v0 - Math.pow(10, (R(m0.tracks.kick.vol + 3) - m0.tracks.kick.vol) / 20)) < 0.01 && (await page.evaluate(() => SS.audio.isPlaying())), `la lecture en cours prend le fader sans repartir (volume ×${(v1 / v0).toFixed(2)})`);
  ok((await page.locator('.mx-strip.own').count()) === 0 && (await page.locator('.mx-back').count()) === 0, 'rien de doré en portée chanson');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'mix-song.png') });

  // une scène : surcharge, compte, « ↺ chanson », repère gris
  await scene('Refrain');
  await page.waitForFunction(() => SS.band._state.wiz.mixScope && SS.band._state.wiz.mixScope !== 'song');
  const chorusId = await page.evaluate(() => SS.band._state.wiz.mixScope);
  ok((await page.locator('.mx-who').textContent()) === 'Refrain seulement' && (await ownText('Refrain')) === 'comme la chanson', 'portée Refrain, sans réglage propre');
  await page.waitForFunction(() => SS.band._listen() && SS.audio.isPlaying());
  ok((await page.evaluate(() => SS.band._state.wiz.res.scenes.find((x) => x.sec === SS.band._state.wiz.mixScope).id === SS.band._listen().current)), 'la lecture suit : le refrain en boucle');
  await fader('bass').fill(String(R(m0.tracks.bass.vol - 8)));
  await page.waitForTimeout(200);
  const m2 = await mix();
  ok(m2.own[chorusId] && m2.own[chorusId].bass.vol === R(m0.tracks.bass.vol - 8) && m2.tracks.bass.vol === m0.tracks.bass.vol, 'fader de la basse en portée scène : surcharge propre, la chanson ne bouge pas');
  ok((await ownText('Refrain')) === '1 réglage propre' && (await page.locator('.mx-strip.own[data-id="bass"]').count()) === 1 && (await page.locator('.mx-back[data-back="bass"]').count()) === 1, 'colonne des scènes : « 1 réglage propre », point doré et « ↺ chanson »');
  ok((await page.locator('.mx-strip[data-id="bass"] .mx-ghost').count()) === 1 && (await page.locator('.mx-strip[data-id="bass"] .mx-db.own').count()) === 1, 'repère gris de la valeur de la chanson, valeur dorée');
  ok((await page.evaluate(() => SS.audio.isPlaying())), 'la lecture continue après le réglage de scène');
  const lane = await page.evaluate(() => { const W = SS.band._state.wiz; const sid = W.res.scenes.find((x) => x.sec === W.mixScope).id; const sc = SS.band._listen().scenes.find((x) => x.id === sid); const d = sc.data[Object.keys(sc.data).find((k) => /:bass$/.test(k))]; return d.auto && d.auto.volume; });
  ok(lane && lane[0] > 0 && lane[0] < 0.5, 'l’écoute reçoit la courbe de volume de la scène');

  // « chanson seulement » : pan, EQ, Master… grisés dans une scène
  ok((await page.locator('#bwMix [data-mx="pan"][data-id="kick"]').isDisabled()) && (await page.locator('.mx-strip[data-id="kick"] .mx-only').textContent()) === 'chanson seulement', 'pan : grisé, « chanson seulement »');
  ok((await page.locator('#bwMix [data-mx="vol"][data-id="master"]').isDisabled()) && (await page.locator('.mx-strip.master .mx-fxb').isDisabled()), 'Master : fader et FX grisés dans une scène');
  await page.click('.mx-strip[data-id="bass"] .mx-fxb');
  ok((await page.locator('#mxFx').isVisible()) && (await page.locator('#mxFx .mx-tabs button').count()) === 8, 'bouton FX : tiroir à 8 onglets (EQ, Compresseur, Filtre, Chorus, Delay, Reverb, Envois, Sidechain)');
  ok((await page.locator('#mxFx [data-mx="fx.eq.low"]').isDisabled()) && (await page.locator('#mxFx .hint').first().textContent()).includes('chanson seulement'), 'EQ en portée scène : grisé, mention « chanson seulement »');
  await page.click('#mxFx [data-tab="sends"]');
  ok((await page.locator('#mxFx [data-mx="fx.sends.plate"]').isDisabled()) && !(await page.locator('#mxFx [data-mx="fx.sends.hall"]').isDisabled()), 'Envois : plate grisé, hall réglable');
  await page.click('#mxFx [data-tab="filter"]');
  await page.locator('#mxFx input[type=checkbox][data-mx="fx.filter.on"]').check();
  await page.locator('#mxFx [data-mx="fx.filter.cut"]').fill('40');
  const m3 = await mix();
  ok(m3.own[chorusId].bass.fx.filter.on === true && m3.own[chorusId].bass.fx.filter.cut === 40 && (await ownText('Refrain')) === '3 réglages propres', 'filtre de scène : écrit en propre, 3 réglages propres');
  ok((await page.locator('#mxFx .mx-tag').first().textContent()).includes('Refrain'), 'tiroir : étiqueté « Refrain seulement »');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'mix-scene-fx.png') });

  // copier vers les scènes du même type : le refrain n'en a pas ici ; ↺ de la tranche, puis de la scène
  await page.click('.mx-back[data-back="bass"]');
  ok(!(await mix()).own[chorusId] && (await ownText('Refrain')) === 'comme la chanson' && (await page.locator('#mxResetScene').isDisabled()), '↺ chanson : la surcharge disparaît');
  await page.click('#mxSong');
  await page.click('.mx-strip[data-id="kick"] .mx-fxb');
  await page.click('#mxFx [data-tab="eq"]');
  ok(!(await page.locator('#mxFx [data-mx="fx.eq.low"]').isDisabled()), 'EQ réglable en portée chanson');
  await page.locator('#mxFx input[type=checkbox][data-mx="fx.eq.on"]').check();
  await page.locator('#mxFx [data-mx="fx.eq.low"]').fill('4');
  ok((await mix()).tracks.kick.fx.eq.low === 4 && (await mix()).tracks.kick.fx.eq.on === true, 'EQ du kick pour toute la chanson');

  // créer : le projet reflète le mix
  await scene('Couplet');
  const verseId = await page.evaluate(() => SS.band._state.wiz.mixScope);
  await fader('pad').fill(String(R(m0.tracks.pad.vol - 6)));
  await page.click('.mx-strip[data-id="pad"] .mx-ms .m');
  await page.waitForTimeout(150);
  const m4 = await mix();
  ok(m4.own[verseId].pad.mute === true && (await page.locator('#bandWizSteps li:nth-child(11) .bw-ss').textContent()) === '1 scène retouchée', 'Muet de scène, résumé « 1 scène retouchée »');
  const heardKick = await page.evaluate(() => SS.band._listen().tracks.find((t) => t.id.endsWith(':bd')).volume);
  await page.click('#bandWizSteps li:nth-child(12) button');
  await page.waitForTimeout(300);
  ok((await cur()).includes('Intégration') && (await page.isVisible('#bwCreate')), 'étape 12 : Intégration');
  await page.click('#bwCreate');
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  const P = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const kickT = P.tracks.find((t) => t.band && t.band.key === 'drums:bd');
  ok(Math.abs(kickT.volume - heardKick) < 0.002, `kick : le volume créé suit celui de l’écoute (${kickT.volume})`);
  ok(kickT.mix && kickT.mix.eq && kickT.mix.eq.on === true, 'kick : EQ allumé dans le projet');
  const padT = P.tracks.find((t) => t.band && t.band.key === 'pad');
  const sc = P.scenes.find((x) => x.name === 'Couplet');
  const pa = sc.data[padT.id].auto;
  ok(pa && pa.volume && pa.volume[0] === 0, 'Couplet : la nappe est coupée par une courbe de volume (Muet de scène)');
  const other = P.scenes.find((x) => x.name === 'Refrain');
  ok(!other.data[padT.id].auto || !other.data[padT.id].auto.volume, 'Refrain : la nappe n’est pas touchée');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
