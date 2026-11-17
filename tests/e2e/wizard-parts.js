/*
 * Test de bout en bout des étapes Batterie, Basse, Nappes, Arpèges de l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-parts.js
 * Réglages par scène (S.wiz.parts → option parts de SS.bandSong.build) : un motif de batterie (le kick de la scène suit
 * le motif, la grille se retouche case par case), une pédale de basse, un arpège coupé ou allumé, la copie vers les
 * autres scènes ; la chanson créée porte ces réglages. Un groupe sans arpégiateur : un message à la place des réglages.
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
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const parts = () => page.evaluate(() => JSON.parse(JSON.stringify(SS.band._state.wiz.parts)));
  const next = async (n = 1) => {
    for (let i = 0; i < n; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  };
  const cur = async () => (await page.locator('#bandWizSteps li.cur').textContent()).trim();
  const scene = (name) => page.click(`.bh-scene:has(.bh-sname b:text-is("${name}"))`);
  /** Pas de la piste (suffixe de l'identifiant) dans la scène de l'aperçu, ou événements pour une piste d'instruments. */
  const preview = (name, suffix) =>
    page.evaluate(([n, sfx]) => {
      const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === n);
      const id = Object.keys(sc.data).find((k) => k.endsWith(sfx));
      return sc.data[id];
    }, [name, suffix]);
  const kick = async (name) => (await preview(name, ':bd')).steps;
  const lane = (s) => Array.from(s).map((c) => (c === '-' ? 0 : 1)).join('');
  const rowsOf = (steps, bars) => Array.from({ length: bars }, (_, i) => steps.slice(i * 16, i * 16 + 16).map((v) => (v > 0 ? 1 : 0)).join(''));

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0'); // Smalltown Boy : arpège dans l'intro, le refrain, le pont et l'outro, pas dans le couplet
  await next(4);

  // Batterie : l'inspiration d'abord, rien n'est réglé
  ok((await cur()).includes('Batterie') && (await page.locator('.bh-scene').count()) === 5, 'étape Batterie : les cinq scènes à gauche');
  ok((await page.locator('.bwp-pat').count()) === 21 && (await page.locator('.bwp-pat.on').getAttribute('data-id')) === '', 'vingt motifs, et « Motif de l’inspiration » choisi par défaut');
  ok(Object.keys(await parts()).length === 0 && !(await page.evaluate(() => SS.audio.isPlaying())), 'première visite : rien n’est réglé, rien ne joue');

  // filtre par énergie et motifs suggérés (Couplet : moyen)
  await scene('Couplet');
  await page.click('#bwpFilter [data-v="1"]');
  const calm = await page.evaluate(() => SS.DRUM_PATTERNS.synthwave.filter((p) => p.energy === 1).length);
  ok((await page.locator('.bwp-pat:not([data-id=""])').count()) === calm && (await page.locator('.bwp-sug').count()) === 0, `filtre Calme : ${calm} motifs, aucun suggéré pour un couplet`);
  await page.click('#bwpFilter [data-v="2"]');
  ok((await page.locator('.bwp-sug').count()) === (await page.locator('.bwp-pat:not([data-id=""])').count()), 'filtre Moyen : tous « Suggéré » pour un couplet');
  await page.click('#bwpFilter [data-v="0"]');

  // Assortir toutes les scènes : un motif par scène, de la nuance de la scène
  await page.click('#bwpMatch');
  const all = await parts();
  const en = await page.evaluate(() => Object.fromEntries(SS.DRUM_PATTERNS.synthwave.map((p) => [p.id, p.energy])));
  ok(['intro', 'verse', 'chorus', 'bridge', 'outro'].every((k) => all[k] && all[k].drums.pattern), 'Assortir : un motif dans chaque scène');
  ok(en[all.intro.drums.pattern] === 1 && en[all.verse.drums.pattern] === 2 && en[all.chorus.drums.pattern] === 3 && en[all.outro.drums.pattern] === 1, 'Assortir : nuance de chaque scène (intro 1, couplet 2, refrain 3, outro 1)');

  // un motif : le kick de la scène le suit, et on l'entend (la scène joue en boucle)
  await page.click('.bwp-pat[data-id="darksynth"]');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const pat = await page.evaluate(() => SS.drumPattern('synthwave', 'darksynth'));
  const bars = await page.evaluate(() => SS.band._state.wiz.res.scenes.find((x) => x.name === 'Couplet').bars);
  ok((await parts()).verse.drums.pattern === 'darksynth' && (await page.locator('.bwp-pat.on').getAttribute('data-id')) === 'darksynth', 'Darksynth choisi pour le couplet');
  ok(rowsOf(await kick('Couplet'), bars).every((r) => r === lane(pat.lanes.K)), 'le kick de l’aperçu suit le motif, sur toutes les mesures');
  const heard = await page.evaluate(() => {
    const sc = SS.band._listen().scenes.find((x) => x.name === 'Couplet');
    const t = SS.band._listen().tracks.find((x) => x.id.endsWith(':bd'));
    return sc.data[t.id].steps.slice(0, 16).map((v) => (v > 0 ? 1 : 0)).join('');
  });
  ok(heard === lane(pat.lanes.K), 'le projet d’écoute joue le même kick');
  ok(/Darksynth/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'la colonne des scènes rappelle le motif');

  // la grille : un clic sur une case la change (cinq pistes de 16 pas), « Revenir au motif » la rend
  ok((await page.locator('.bwp-cell').count()) === 80, 'grille : 5 pistes × 16 pas');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  let d = (await parts()).verse.drums;
  ok(d.edits && d.edits.K[1] === 'x' && d.pattern === 'darksynth' && (await kick('Couplet'))[1] > 0, 'une case de kick ajoutée : edits, et le kick joue le pas 2');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  ok((await parts()).verse.drums.edits.K[1] === '-', 'x, o, léger, puis éteint');
  await page.click('#bwpUnedit');
  ok(!(await parts()).verse.drums.edits && rowsOf(await kick('Couplet'), bars).every((r) => r === lane(pat.lanes.K)), '« Revenir au motif » efface les retouches');

  // fills et crash
  await page.click('#bwpFill [data-v="4"]');
  ok((await parts()).verse.drums.fill === '4' && (await page.locator('.bwp-bars span.fill').count()) === bars / 4, 'fill toutes les 4 mesures : mesures roses');
  await page.selectOption('#bwpFillType', 'toms');
  await page.check('#bwpCrash');
  d = (await parts()).verse.drums;
  ok(d.fillType === 'toms' && d.crash === true && (await preview('Couplet', ':cr')).steps[0] > 0, 'type de fill et crash');

  // copie vers les scènes du même type : il n'y en a pas d'autre ici
  await page.click('#bwpSame');
  ok(/Aucune autre scène/.test(await page.textContent('.bwp-msg')), 'copie : un seul couplet, message');

  // retour à l'inspiration pour une scène
  await scene('Pont');
  await page.click('#bwpBack');
  ok(!(await parts()).bridge, '↺ Inspiration : la scène revient au jeu du plan');

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-batterie.png') });

  // Accords, puis Basse : pédale
  await next();
  ok((await cur()).includes('Accords'), 'étape Accords entre Batterie et Basse');
  await next();
  ok((await cur()).includes('Basse') && (await page.locator('.bwp-mode').count()) === 21, 'étape Basse : 21 modes de jeu (13 + 8 nouveaux)');
  ok((await page.locator('.bwp-mode.on em').textContent()) === 'Inspiration', 'basse : le mode de l’inspiration est choisi et repéré');
  await scene('Couplet');
  await page.click('#bwpPedal [data-v="tonic"]');
  await page.click('#bwpRegister [data-v="mid"]');
  ok((await parts()).verse.bass.pedal === 'tonic' && (await parts()).verse.bass.register === 'mid', 'pédale de tonique et registre médium réglés');
  const pcs = await page.evaluate(() => {
    const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === 'Couplet');
    const id = Object.keys(sc.data).find((k) => /:bass/.test(k));
    return [...new Set(sc.data[id].events.flatMap((e) => e.notes.map((n) => n % 12)))];
  });
  ok(pcs.length === 1 && pcs[0] === 0, `la basse reste sur la tonique, Do (${pcs})`);
  await page.click('.bwp-mode[data-v="gallop"]');
  ok((await parts()).verse.bass.mode === 'gallop' && /Galop/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'mode Galop choisi, rappelé dans la colonne des scènes');

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-basse.png') });

  // Nappes : mode et voicing
  await next();
  ok((await cur()).includes('Nappes') && (await page.locator('.bwp-mode').count()) === 9, 'étape Nappes : 9 modes');
  await page.click('.bwp-mode[data-v="stabs"]');
  await page.click('#bwpVoicing [data-v="open"]');
  ok((await parts()).verse.pad.mode === 'stabs' && (await parts()).verse.pad.voicing === 'open', 'nappe : stabs, voicing ouvert');

  // Arpèges : Arp One (mode Intuitif). L'inspiration joue tant qu'on n'a rien touché ; allumé dans le couplet (le plan n'en avait pas)
  await next();
  ok((await cur()).includes('Arpèges'), 'étape Arpèges');
  ok((await page.locator('.bwp-chips').count()) === 0 && (await page.locator('#bwaMotif').count()) === 1 && (await page.locator('.bwa-knob').count()) === 4, 'panneau Arp One : motif, 4 boutons Densité / Ampleur / Mouvement / Écho');
  ok((await page.locator('#bwaMotif optgroup').count()) === (await page.evaluate(() => SS.MOTIF_CATS.length)) && (await page.locator('#bwaMotif option').count()) >= (await page.evaluate(() => SS.MOTIFS.length)), 'le sélecteur range les motifs par catégorie');
  ok(!(await page.isChecked('#bwp-on-arp')) && (await preview('Couplet', ':arp')).events.length === 0 && !(await parts()).verse.arp, 'couplet : pas d’arpège dans l’inspiration, rien de réglé');
  await scene('Intro');
  ok((await page.textContent('#bwaName b')) === 'Pédale aiguë' && !((await parts()).intro || {}).arp, 'intro : le motif de départ suit l’inspiration (bells → Pédale aiguë), sans réglage écrit');
  await scene('Couplet');
  await page.check('#bwp-on-arp');
  ok((await parts()).verse.arp.mode === 'up16' && (await preview('Couplet', ':arp')).events.length > 0, 'arpège allumé dans le couplet');
  const notesOf = async (n) => JSON.stringify(((await preview(n, ':arp')).events || []).map((e) => [e.step, e.len, e.notes]));
  const countOf = async (n) => ((await preview(n, ':arp')).events || []).length;
  const before = await notesOf('Couplet');
  // un motif choisi : parts.verse.arp.one, et les notes changent
  await page.selectOption('#bwaMotif', 'midnight');
  let one = (await parts()).verse.arp.one;
  ok(one && one.mode === 'pattern' && !(await parts()).verse.arp.mode && (await page.textContent('#bwaName b')) === 'Midnight Drive', 'motif choisi : arp.one posé, nom affiché');
  const midnight = await notesOf('Couplet');
  ok(midnight !== before && (await countOf('Couplet')) > 0, 'les notes de l’arpège de l’aperçu changent');
  ok(/Midnight Drive/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'la colonne des scènes donne le nom du motif');
  // ‹ ›
  await page.click('#bwaNext');
  const nextName = await page.textContent('#bwaName b');
  ok(nextName !== 'Midnight Drive' && (await notesOf('Couplet')) !== midnight, `› : motif suivant (${nextName})`);
  await page.click('#bwaPrev');
  ok((await page.textContent('#bwaName b')) === 'Midnight Drive' && (await notesOf('Couplet')) === midnight, '‹ : retour au motif précédent, mêmes notes');
  // vitesse
  await page.click('#bwaRate [data-v="0.5"]');
  ok((await parts()).verse.arp.one.rate === 0.5, 'vitesse 1/8');
  await page.click('#bwaRate [data-v="1"]');
  // Densité : moins de notes
  const full = await countOf('Couplet');
  await page.fill('#bwaK-density', '15');
  const sparse = await countOf('Couplet');
  ok(sparse > 0 && sparse < full && (await parts()).verse.arp.one.macros.density === 15, `Densité basse : moins de notes (${sparse} < ${full})`);
  // Ampleur
  await page.fill('#bwaK-width', '93');
  ok((await parts()).verse.arp.one.octaves === 4, 'Ampleur : 4 octaves');
  // Surprends-moi
  const pre = JSON.stringify((await parts()).verse.arp.one);
  await page.click('#bwaSurprise');
  ok(JSON.stringify((await parts()).verse.arp.one) !== pre && (await countOf('Couplet')) > 0, 'Surprends-moi : un nouvel arpège, qui joue');
  const verseNotes = await notesOf('Couplet');
  await page.click('#bwpAll');
  ok((await parts()).intro.arp.one && (await parts()).outro.arp.one && !!(await parts()).chorus.arp.one, 'copié vers toutes les scènes (réglages Arp One compris)');
  await scene('Refrain');
  ok(await page.isChecked('#bwp-on-arp'), 'refrain : l’arpège joue');
  await page.uncheck('#bwp-on-arp');
  ok((await parts()).chorus.off.includes('arp') && (await preview('Refrain', ':arp')).events.length === 0, 'arpège coupé dans le refrain');
  ok(/muet/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'la colonne des scènes : muet');
  await page.click('#bwpBack');
  ok(!((await parts()).chorus || {}).arp && !((await parts()).chorus || {}).off && (await preview('Refrain', ':arp')).events.length > 0, '↺ Inspiration : le refrain rejoue l’arpège du plan');

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-arpeges.png') });

  // Intégration, puis création : la chanson porte les réglages
  await next(3);
  ok((await cur()).includes('Intégration'), 'étape Intégration');
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const p = await P();
  const by = (key) => p.tracks.find((t) => t.band && t.band.key === key);
  const sceneOf = (n) => p.scenes.find((s) => s.name === n);
  const bd = p.tracks.find((t) => t.band && t.band.key === 'drums:bd');
  ok(rowsOf(sceneOf('Couplet').data[bd.id].steps, bars).every((r, i) => (i % 4 === 3 ? true : r === lane(pat.lanes.K))), 'projet : le kick du couplet suit le motif');
  ok(sceneOf('Couplet').data[bd.id].steps.length === bars * 16 && sceneOf('Couplet').data[by('drums:cr').id].steps[0] > 0, 'projet : crash au début du couplet');
  const bassEv = sceneOf('Couplet').data[by('bass').id].events;
  ok(bassEv.length > 0 && bassEv.every((e) => e.notes.every((n) => n % 12 === 0)), 'projet : la basse du couplet est en pédale de tonique');
  ok(JSON.stringify(sceneOf('Couplet').data[by('arp').id].events.map((e) => [e.step, e.len, e.notes])) === verseNotes, 'projet : l’arpège Arp One du couplet porte les notes de l’aperçu');
  ok((sceneOf('Refrain').data[by('arp').id].events || []).length > 0, 'projet : refrain revenu à l’inspiration, il joue');
  ok(sceneOf('Intro').data[by('arp').id].events.length > 0, 'projet : arpège de l’intro gardé');

  // un groupe sans arpégiateur : un message à la place des réglages
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=3'); // Sweet Dreams : pas d'arpège
  await next(8);
  ok((await cur()).includes('Arpèges') && !!(await page.$('#bwpNone')) && (await page.locator('.bwa').count()) === 0, 'groupe sans arpège : un message, pas de réglage');
  await page.dispatchEvent('#bwBack', 'click');
  ok((await cur()).includes('Nappes') && (await page.locator('.bwp-mode').count()) === 9, 'groupe avec nappe : les réglages');

  // autre inspiration du même style : les réglages des sections communes restent, la mélodie générée est oubliée
  await page.evaluate(() => (SS.band._state.wiz.parts = { verse: { bass: { pedal: 'tonic' }, drums: { style: 'synthwave', pattern: 'motorik' }, lead: { events: [] } }, nulle: { bass: { mode: '8' } } }));
  for (let i = 0; i < 10 && !(await cur()).includes('Style'); i++) await page.dispatchEvent('#bwBack', 'click');
  await page.click('#bandPresets .band-preset >> nth=0');
  const kept = await parts();
  ok(kept.verse && kept.verse.bass.pedal === 'tonic' && kept.verse.drums.pattern === 'motorik' && !kept.verse.lead && !kept.nulle, 'autre inspiration : pédale et motif du couplet gardés, mélodie générée et section absente oubliées');
  await page.click('#bandStyles [data-v="edm"]');
  ok(Object.values(await parts()).every((x) => !x.drums && !x.lead), 'autre style : les motifs de batterie sont oubliés');
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=3');
  await next(7); // retour à l'étape Nappes

  // téléphone : rien ne déborde
  await page.setViewportSize({ width: 390, height: 844 });
  await page.dispatchEvent('#bwBack', 'click');
  await page.dispatchEvent('#bwBack', 'click');
  await page.dispatchEvent('#bwBack', 'click');
  await page.waitForTimeout(250);
  ok((await cur()).includes('Batterie'), 'téléphone : étape Batterie');
  const over = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  const cell = await page.evaluate(() => document.querySelector('.bwp-cell').getBoundingClientRect().width);
  ok(over <= 1 && cell >= 10, `téléphone : la fenêtre ne défile pas, les cases restent cliquables (${Math.round(cell)} px)`);

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
