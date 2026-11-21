/*
 * « Nouvelle chanson » : la tuile 🎬 « Musique de film » (js/film.js).
 *   node tests/e2e/film-start.js [dossier-captures]
 * Tuile après « Créer de zéro » ; modèle « La lumière revient » : 80 BPM, 5 passages, synchro m. 13 ; l'aperçu joue
 * le thème écrit ; « Modifier les repères » ouvre la scène libre (ajout d'un repère, tempo calé) ; « Créer la chanson ».
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

const SHOTS = process.argv[2] || null;
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name) });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + (process.env.STACK ? '\n' + e.stack : '')));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);

  const tile = page.locator('#bandStyles .bsty').nth(1);
  ok((await tile.getAttribute('data-v')) === 'film' && /Musique de film/.test(await tile.textContent()), 'la tuile 🎬 suit « Créer de zéro »');
  await shot(page, 'film-tuile.png');
  await tile.click();
  await page.waitForTimeout(400);
  ok((await page.locator('#bandPresets .band-preset').count()) === 4, 'quatre départs : trois modèles et « Ma scène »');
  ok((await page.inputValue('#tempo')) === '80', 'modèle : 80 BPM');
  ok((await page.locator('.bfm-cues tbody tr').count()) === 5, '5 repères');
  ok(/m\. 13/.test(await page.textContent('.bfm-cues tr.sync')), 'synchro forte sur la mesure 13');
  ok(/80 BPM/.test(await page.textContent('#bandSong')), 'calcul du tempo affiché');
  await page.locator('#bandSong').scrollIntoViewIfNeeded();
  await shot(page, 'film-modele.png');

  // 05 Orchestre : une couleur, les percussions sur les repères
  ok((await page.locator('#bfmEns .chip').count()) === 5, 'cinq couleurs d’orchestre');
  await page.click('#bfmEns [data-ens="epique"]');
  await page.waitForTimeout(400);
  ok((await page.getAttribute('#bfmEns [data-ens="epique"]', 'aria-checked')) === 'true', 'effectif épique choisi');
  const row4 = await page.textContent('.bfm-orch tr[data-sec="p4"]');
  ok(/impact : timbale, grosse caisse, cymbale/.test(row4), 'impact de percussions sur la synchro : ' + row4);
  ok(/Trompettes/.test(row4), 'les trompettes portent le thème au sommet');
  await page.locator('.bfm-orch').scrollIntoViewIfNeeded();
  await shot(page, 'film-orchestre.png');

  await page.click('#bwGo');
  await page.waitForTimeout(1500);
  await page.click('#stop').catch(() => {});
  const lis = await page.evaluate(() => {
    const r = SS.band._listen();
    const lead = r.tracks.find((t) => t.band && t.band.key === 'lead');
    const bd = r.tracks.find((t) => t.band && t.band.key === 'perc:bd');
    const tp = r.tracks.filter((t) => t.band && t.band.key === 'orch:tp');
    return { scenes: r.scenes.length, top: lead ? r.scenes[3].data[lead.id].events.map((e) => e.notes[0]) : [], bd: bd ? r.scenes.map((sc) => sc.data[bd.id].steps.filter((v) => v > 0).length) : [], tp: tp.length ? r.scenes.map((sc) => sc.data[tp[0].id].events.length) : [] };
  });
  ok(lis.bd.join() === '0,0,0,1,0', `grosse caisse seulement à la synchro (${lis.bd.join(' ')})`);
  ok(lis.tp.length === 5 && lis.tp[3] > 0 && lis.tp[0] === 0, `trompettes seulement au sommet (${lis.tp.join(' ')})`);
  ok(lis.scenes === 5, `aperçu : 5 scènes (${lis.scenes})`);
  ok(lis.top.join() === '77,79,81,79,76', `le thème du modèle, tel qu’écrit (m. 13–14 : ${lis.top.join(' ')})`);

  // le modèle « La poursuite » : 144 BPM, 7 passages, saut m. 27 ; ostinato à la basse, accents des trombones
  const back = async () => {
    for (let i = 0; i < 6 && !(await page.isVisible('#bfmUnlock')); i++) {
      await page.dispatchEvent('#bwBack', 'click').catch(() => {});
      await page.waitForTimeout(250);
    }
  };
  await back();
  await page.locator('#bandPresets .band-preset', { hasText: 'La poursuite' }).click();
  await page.waitForTimeout(400);
  ok((await page.inputValue('#tempo')) === '144', 'poursuite : 144 BPM');
  ok((await page.locator('.bfm-cues tbody tr').count()) === 7, 'poursuite : 7 repères');
  ok(/m\. 27/.test(await page.textContent('.bfm-cues tr.sync')), 'saut sur la mesure 27');
  await page.locator('#bandSong').scrollIntoViewIfNeeded();
  await shot(page, 'film-poursuite.png');
  await page.locator('.bfm-orch').scrollIntoViewIfNeeded();
  await shot(page, 'film-poursuite-orchestre.png');
  await page.click('#bwGo');
  await page.waitForTimeout(1500);
  await page.click('#stop').catch(() => {});
  const ch = await page.evaluate(() => {
    const r = SS.band._listen();
    const ev = (k) => {
      const t = r.tracks.find((x) => x.band && x.band.key === k);
      return t ? r.scenes.map((sc) => ((sc.data[t.id] || {}).events || []).length) : [];
    };
    const sd = r.tracks.find((t) => t.band && t.band.key === 'perc:sd');
    return { scenes: r.scenes.length, cb: ev('orch:cb'), tb: ev('orch:tb'), sd: sd ? r.scenes.map((sc) => sc.data[sd.id].steps.filter((v) => v > 0).length) : [] };
  });
  ok(ch.scenes === 7, `poursuite : 7 scènes (${ch.scenes})`);
  ok(ch.cb[1] >= 60 && ch.cb[0] < 10, `ostinato de croches à la basse dans le départ (${ch.cb.join(' ')})`);
  ok(ch.tb[2] > 0 && ch.tb[0] === 0, `accents des trombones dans le marché (${ch.tb.join(' ')})`);
  ok(ch.sd[4] > 20, `caisse claire qui monte vers le saut (${ch.sd.join(' ')})`);
  await back();
  // le modèle « Les grands espaces » : 80 BPM, 55 mesures, 8 passages
  await page.locator('#bandPresets .band-preset', { hasText: 'Les grands espaces' }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('.bfm-cues tbody tr').count()) === 8, 'grands espaces : 8 repères');
  ok(/55 mesures/.test(await page.textContent('#bandSong')), 'grands espaces : 55 mesures');
  await page.locator('#bandSong').scrollIntoViewIfNeeded();
  await shot(page, 'film-espaces.png');
  await page.locator('#bandPresets .band-preset', { hasText: 'La lumière revient' }).click();
  await page.waitForTimeout(400);

  // retour à l'étape 1 : la scène libre
  for (let i = 0; i < 6 && !(await page.isVisible('#bfmUnlock')); i++) {
    await page.dispatchEvent('#bwBack', 'click').catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.click('#bfmUnlock');
  await page.waitForTimeout(300);
  ok(/Ma scène/.test(await page.textContent('#bandPresets .band-preset.active')), '« Modifier les repères » ouvre « Ma scène »');
  await page.click('#bfmAdd');
  await page.waitForTimeout(300);
  ok((await page.locator('.bfm-cues tbody tr').count()) === 6, 'un repère ajouté');
  await page.locator('.bfm-cues tbody tr').nth(5).locator('.bfm-emo').selectOption('heroisme');
  await page.waitForTimeout(300);
  const chips = page.locator('.bfm-opts .chip');
  ok((await chips.count()) >= 2, 'tempos calés proposés');
  const bpm = await chips.first().getAttribute('data-bpm');
  await chips.first().click();
  await page.waitForTimeout(300);
  ok((await page.inputValue('#tempo')) === bpm, `tempo choisi : ${bpm} BPM`);
  await page.locator('#bandSong').scrollIntoViewIfNeeded();
  await shot(page, 'film-scene.png');

  // harmonie de film : une technique par passage, choisie automatiquement, que l'on change
  ok((await page.locator('.bfm-harmt tr').count()) === 6, 'une ligne d’harmonie par passage');
  ok(/Accords du modèle ✓/.test(await page.textContent('.bfm-harmt tr[data-sec="p1"]')), 'passage repris du modèle : ses accords écrits');
  ok(/♭VI – ♭VII – I ✓/.test(await page.textContent('.bfm-harmt tr[data-sec="p6"]')), 'nouveau passage héroïque : ♭VI–♭VII–I automatique');
  await page.click('.bfm-harmt tr[data-sec="p2"] [data-harm="mediant"]');
  await page.waitForTimeout(300);
  const after = await page.textContent('.bfm-harmt tr[data-sec="p2"] .bfm-chords');
  ok(/^Dm · Fm · Dm · B♭m/.test(after), `médiantes choisies pour la réplique : ${after.split('accords')[0]}`);
  ok((await page.getAttribute('.bfm-harmt tr[data-sec="p2"] [data-harm="mediant"]', 'aria-checked')) === 'true', 'technique choisie retenue');
  await page.locator('.bfm-harmt').scrollIntoViewIfNeeded();
  await shot(page, 'film-harmonie.png');

  // 04 Thème et mélodie : un motif, ses trois propositions, le leitmotiv
  await page.click('#bfmThemeNew');
  await page.waitForTimeout(300);
  ok((await page.locator('.bfm-prop').count()) === 3, 'trois propositions de motif');
  await page.locator('#bfmCont [data-v="asc"]').click();
  await page.waitForTimeout(250);
  await page.locator('.bfm-prop').nth(1).locator('button', { hasText: 'Choisir' }).click();
  await page.waitForTimeout(250);
  ok((await page.locator('.bfm-prop.on').getAttribute('data-pick')) === '1', 'deuxième proposition choisie');
  ok((await page.locator('.bfm-leit tr').count()) === 6, 'le thème dans chacun des 6 passages');
  await page.locator('.bfm-leit tr').first().locator('.bfm-treat').selectOption('tacet');
  await page.waitForTimeout(300);
  await page.locator('#bfmTr .chip', { hasText: 'Renversement' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bfm-theme').first().scrollIntoViewIfNeeded();
  await shot(page, 'film-theme.png');
  await page.locator('.bfm-leit').scrollIntoViewIfNeeded();
  await shot(page, 'film-leit.png');

  await page.click('#bwGo').catch(() => {});
  await page.waitForTimeout(1200);
  await page.click('#stop').catch(() => {});
  const th = await page.evaluate(() => {
    const r = SS.band._listen();
    const lead = r.tracks.find((t) => t.band && t.band.key === 'lead');
    return r.scenes.map((sc) => sc.data[lead.id].events.length);
  });
  ok(th[0] === 0 && th.slice(1).every((n) => n > 0), `le thème se tait dans le 1er passage, joue dans les autres (${th.join(' ')})`);
  // mix à l'image : écoute de contrôle en mono, un passage sous les mots
  await page.click('.bfm-mon [data-mon="mono"]');
  ok(await page.evaluate(() => SS.audio.monitorState().mono), 'écoute de contrôle en mono');
  await page.click('.bfm-mon [data-mon="mono"]');
  ok(!(await page.evaluate(() => SS.audio.monitorState().mono)), 'retour en stéréo');
  await page.locator('.bfm-cues tbody tr').nth(1).locator('.bfm-dlg').check();
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => SS.band._spec().sections.p2.dialog === true), 'le 2e passage passe sous les mots');
  await page.locator('.bfm-mon').scrollIntoViewIfNeeded();
  await shot(page, 'film-mix-image.png');
  for (let i = 0; i < 25 && !(await page.isVisible('#bwCreate')); i++) {
    await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  }
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  if (process.env.STACK) console.log(p.scenes.map((s) => s.name + ':' + s.bars).join(' | '), JSON.stringify(p.song));
  ok(p.tempo === +bpm && p.scenes.length === 6 && p.tracks.some((t) => t.band && t.band.key === 'lead'), `chanson créée : ${p.scenes.length} scènes, ${p.tracks.length} pistes, ${p.tempo} BPM`);
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
