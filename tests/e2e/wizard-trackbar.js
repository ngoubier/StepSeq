/*
 * Test de bout en bout de la barre de piste et de l'aperçu en rouleau de l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-trackbar.js
 * Étapes Batterie à Mélodie : pas de menu « Piste » (le son et le kit se choisissent à l'étape Instruments), « On entend » coupe un
 * musicien dans la boucle d'écoute, « Seule » le met en solo ; Basse, Nappes et Arpèges dessinent les notes de la scène.
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
  /** Type de l'instrument de l'onglet en cours (Accords : « accords-grille »). */
  const kindNow = async () => (await page.locator('#bwParts').count()) ? page.getAttribute('#bwParts', 'data-kind') : (await page.locator('#bwMelBoard').count()) ? 'melody' : 'grille';
  const tracks = () => page.evaluate(() => SS.band._listen().tracks.map((t) => [t.col, t.mute, t.solo, t.name, t.instrument || t.sound]));

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');

  // étape 2 : le choix de la basse (index de la carte active)
  await next(1);
  await page.locator('#bandStage .band-mus', { hasText: 'Bassiste' }).first().click();
  const activeName = () => page.locator('#bandPanel .band-choice.active .bc-name').textContent();
  const first = await activeName();
  const nCards = await page.locator('#bandPanel .band-choice:not(.custom)').count();
  const names = await page.$$eval('#bandPanel .band-choice:not(.custom) .bc-name', (xs) => xs.map((x) => x.textContent));
  ok(nCards >= 2, `étape 2 : la basse propose ${nCards} instruments`);

  // étape 7 : Basse
  await next(5);
  ok((await kindNow()) === 'bass', 'onglet de la basse');
  ok((await page.locator('#bwTrackbar').count()) === 1, 'barre de piste présente');
  const noPiste = async (m) => ok((await page.locator('#bwTbPiste, #bwTbKit, .tb-piece').count()) === 0 && !/Piste/.test(await page.textContent('#bwTrackbar')) && /On entend/.test(await page.textContent('#bwTrackbar')), m + ' : pas de menu Piste (ni #bwTbPiste, #bwTbKit, libellé « Piste »), « On entend » présent');
  await noPiste('Basse');
  ok((await page.locator('#bwTbSolo').count()) === 1, 'Basse : « Seule » présent');
  const chosen = await page.evaluate(() => SS.band.plannedTracks().find((t) => t.band.key === 'bass'));

  // le rouleau : autant de rectangles que de notes de la basse dans la scène
  const rolls = async () => ({
    rects: await page.locator('#bwRoll .bw-rn').count(),
    notes: await page.evaluate(() => {
      const st = SS.band._state.wiz;
      const sc = st.res.scenes.find((x) => x.id === document.querySelector('#bwRoll').dataset.scene);
      return Object.keys(sc.data).filter((k) => /:bass(#\d+)?$/.test(k)).reduce((a, k) => a + ((sc.data[k].events || []).reduce((n, e) => n + e.notes.length, 0)), 0);
    }),
  });
  await page.click('.bh-scene:has(.bh-sname b:text-is("Couplet"))');
  await page.waitForTimeout(300);
  let r = await rolls();
  ok(r.notes > 0 && r.rects === r.notes, `rouleau de la basse : ${r.rects} rectangles pour ${r.notes} notes`);
  ok((await page.locator('#bwRoll .bw-rc').count()) > 0 && (await page.locator('#bwRoll .bw-rbar').count()) > 0, 'bande des accords et barres de mesure');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'trackbar-bass.png') });

  // l'écoute : la boucle de la scène, puis On entend / Seule
  const chipsN = await page.locator('.tb-chip').count();
  ok(chipsN >= 4 && (await page.locator('.tb-chip.on').count()) === chipsN, `On entend : ${chipsN} pastilles, toutes allumées`);
  // lance la boucle de la scène
  await page.click('#play');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.locator('.tb-chip[data-ins="drums"]').click();
  const t1 = await tracks();
  const dr = t1.filter((t) => t[0].startsWith('drums:'));
  ok(dr.length >= 3 && dr.every((t) => t[1]) && t1.filter((t) => t[1]).length === dr.length, `pastille Batterie : ses ${dr.length} pistes sont coupées à l’écoute`);
  ok((await page.locator('.tb-chip[data-ins="drums"]').getAttribute('aria-pressed')) === 'false', 'la pastille est éteinte');
  await page.locator('.tb-chip[data-ins="drums"]').click();
  ok((await tracks()).every((t) => !t[1]), 'second clic : la batterie revient');
  // Seule
  await page.click('#bwTbSolo');
  const t2 = await tracks();
  ok(t2.filter((t) => t[2]).length === 1 && t2.find((t) => t[2])[0].startsWith('bass:'), 'Seule : la basse seule en solo');
  ok((await page.locator('.tb-chip.on').count()) === 1 && (await page.getAttribute('#bwTbSolo', 'aria-pressed')) === 'true', 'une seule pastille allumée');
  // l'état se retrouve aux autres étapes
  await next(1);
  ok((await kindNow()) === 'chords' && (await tracks()).filter((t) => t[2]).length === 1 && (await page.locator('.tb-chip.on').count()) === 1, 'le solo est partagé avec l’étape suivante');
  await page.dispatchEvent('#bwBack', 'click');
  await page.waitForTimeout(250);
  await page.click('#bwTbSolo');
  ok((await tracks()).every((t) => !t[2]), 'Seule, re-clic : plus de solo');

  ok(await page.evaluate((c) => SS.band._listen().tracks.some((t) => t.col.startsWith('bass:') && (t.instrument === c.instrument || t.sound === c.sound)), chosen), 'la piste d’écoute de la basse joue l’instrument choisi');

  // Nappes et Arpèges : rouleau aussi
  await next(1);
  ok((await kindNow()) === 'chords' && (await page.locator('#bwRoll .bw-rn').count()) > 0, 'Nappe : rouleau avec des notes');
  await noPiste('Nappe');
  await next(1);
  await page.click('.bh-scene:has(.bh-sname b:text-is("Refrain"))'); // pas d'arpège dans le couplet
  await page.waitForTimeout(300);
  ok((await kindNow()) === 'arp' && (await page.locator('#bwRoll .bw-rn').count()) > 0 , 'Arpèges : rouleau');
  await noPiste('Arpèges');
  ok((await page.locator('#bwTbSolo').count()) === 1, 'Arpèges : « Seule » présent');

  // Accords et Mélodie
  for (let i = 0; i < 4; i++) await page.dispatchEvent('#bwBack', 'click');
  await page.waitForTimeout(250);
  ok((await cur()).includes('Accords') && (await page.locator('#bwTbSolo').count()) === 0, 'Accords : pas de Seule');
  await noPiste('Accords');
  await next(5);
  ok((await kindNow()) === 'melody' && (await page.locator('.bh-lane .bw-m, .bh-lane .bw-s').count()) === 0, 'Mélodie : plus de M / S par ligne');
  await noPiste('Mélodie');
  ok((await page.locator('#bwTbSolo').count()) === 1, 'Mélodie : « Seule » présent');

  // Batterie : le kit
  for (let i = 0; i < 4; i++) await page.dispatchEvent('#bwBack', 'click');
  await page.waitForTimeout(250);
  ok((await kindNow()) === 'drums', 'étape Batterie');
  await noPiste('Batterie');
  ok((await page.locator('#bwTbSolo').count()) === 1 && (await page.locator('.tb-chip').count()) >= 4, 'Batterie : « Seule » et « On entend » présents');

  // téléphone : rien ne déborde
  await page.setViewportSize({ width: 390, height: 800 });
  for (const n of [5, 7, 8, 9, 10]) {
    await page.click(`#bandWizSteps li:nth-child(${n}) button`);
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth, tb: document.querySelector('#bwTrackbar').getBoundingClientRect().right }));
    ok(w.s <= w.c && w.tb <= w.c + 1, `390 px, étape ${n} : pas de débordement horizontal (${w.s}/${w.c})`);
  }
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'trackbar-phone.png') });

  // création : la piste de basse porte l'instrument choisi à l'étape Basse
  await page.setViewportSize({ width: 1500, height: 920 });
  await page.click('#bandWizSteps li:nth-child(13) button');
  await page.click('#bwCreate');
  await page.waitForTimeout(1500);
  const made = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('stepseq.autosave')).tracks.find((x) => x.band && x.band.key === 'bass');
    return t && { instrument: t.instrument, analog: t.analog, sound: t.sound, family: t.family };
  });
  ok(made && (made.instrument === chosen.instrument || made.instrument === chosen.analog || made.analog === chosen.analog) && made.instrument !== undefined, `la basse créée joue l’instrument choisi (${made && made.instrument})`);

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
