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
  /** Réglage d'un instrument dans une scène : parts[section].inst[id] (le kit : id du musicien), repéré par son rôle. */
  const part = (sec, role) =>
    page.evaluate(([s, r]) => {
      const T = SS.band.insSteps().find((t) => t.role === r);
      const pp = SS.band._state.wiz.parts[s];
      return (T && pp && pp.inst && pp.inst[T.key]) || undefined;
    }, [sec, role]);
  /** Ouvre l'onglet du premier instrument d'un type. */
  const tab = async (kind) => {
    await page.click(`#bandWizSteps li[data-kind="${kind}"] button`);
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
  await next(5);

  // Batterie : l'inspiration d'abord, rien n'est réglé
  ok((await page.getAttribute('#bwParts', 'data-kind')) === 'drums' && (await page.locator('.bh-scene').count()) === 5 && (await page.locator('.bw-kind').count()) === 0 && (await page.getAttribute('#bwStepHead', 'data-kind')) === 'drums', 'onglet de la batterie : les cinq scènes à gauche');
  ok((await page.locator('.bwp-pat').count()) === 29 && (await page.locator('.bwp-pat.on').getAttribute('data-id')) === '', '28 motifs synthwave, et « Motif de l’inspiration » choisi par défaut');
  ok(Object.keys(await parts()).length === 0 && !(await page.evaluate(() => SS.audio.isPlaying())), 'première visite : rien n’est réglé, rien ne joue');

  // filtre par énergie et motifs suggérés (Couplet : moyen)
  await scene('Couplet');
  await page.click('#bwpFilter [data-v="1"]');
  const calm = await page.evaluate(() => SS.DRUM_PATTERNS.synthwave.filter((p) => p.energy === 1).length);
  ok((await page.locator('.bwp-pat:not([data-id=""])').count()) === calm && (await page.locator('.bwp-sug').count()) === 0, `filtre Calme : ${calm} motifs, aucun suggéré pour un couplet`);
  await page.click('#bwpFilter [data-v="2"]');
  ok((await page.locator('.bwp-sug').count()) === (await page.locator('.bwp-pat:not([data-id=""])').count()), 'filtre Moyen : tous « Suggéré » pour un couplet');
  await page.click('#bwpFilter [data-v="0"]');

  // bibliothèque d'un autre style : un dembow dans une chanson synthwave, puis « Tous les styles »
  await page.selectOption('#bwpLib', 'latin');
  await page.waitForTimeout(250);
  ok((await page.locator('.bwp-pat').count()) === 27, 'bibliothèque Latin, Afro & Reggae : 26 motifs');
  await page.click('.bwp-pat[data-id="dembow"]');
  await page.waitForTimeout(500);
  const dv = await part('verse', 'drums');
  const dembow = await page.evaluate(() => SS.drumPattern('latin', 'dembow'));
  ok(dv.pattern === 'dembow' && dv.style === 'latin' && (await page.locator('.bwp-pat.on').getAttribute('data-st')) === 'latin', 'Dembow (Latin) choisi pour le couplet');
  ok(rowsOf(await kick('Couplet'), 1)[0] === lane(dembow.lanes.K), 'le kick suit le dembow');
  await page.selectOption('#bwpLib', 'all');
  await page.waitForTimeout(250);
  const total = await page.evaluate(() => Object.values(SS.DRUM_PATTERNS).reduce((a, l) => a + l.length, 0));
  ok((await page.locator('.bwp-pat').count()) === total + 1 && (await page.locator('.bwp-from').count()) === total, `Tous les styles : ${total} motifs, chacun avec son style`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'bibliotheque-tous-styles.png') });
  await page.selectOption('#bwpLib', 'synthwave');
  await page.waitForTimeout(250);

  // Assortir toutes les scènes : un motif par scène, de la nuance de la scène
  await page.click('#bwpMatch');
  const all = await parts();
  const drumsOf = (sec) => part(sec, 'drums');
  const en = await page.evaluate(() => Object.fromEntries(SS.DRUM_PATTERNS.synthwave.map((p) => [p.id, p.energy])));
  ok(['intro', 'verse', 'chorus', 'bridge', 'outro'].every((k) => all[k] && all[k].inst && Object.values(all[k].inst).some((x) => x.pattern)), 'Assortir : un motif dans chaque scène');
  ok([['intro', 1], ['verse', 2], ['chorus', 3], ['outro', 1]].every(([k, e]) => en[Object.values(all[k].inst).find((x) => x.pattern).pattern] === e), 'Assortir : nuance de chaque scène (intro 1, couplet 2, refrain 3, outro 1)');

  // un motif : le kick de la scène le suit, et on l'entend (la scène joue en boucle)
  await page.click('.bwp-pat[data-id="darksynth"]');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const pat = await page.evaluate(() => SS.drumPattern('synthwave', 'darksynth'));
  const bars = await page.evaluate(() => SS.band._state.wiz.res.scenes.find((x) => x.name === 'Couplet').bars);
  ok((await part('verse', 'drums')).pattern === 'darksynth' && (await page.locator('.bwp-pat.on').getAttribute('data-id')) === 'darksynth', 'Darksynth choisi pour le couplet');
  ok(rowsOf(await kick('Couplet'), bars).every((r) => r === lane(pat.lanes.K)), 'le kick de l’aperçu suit le motif, sur toutes les mesures');
  const heard = await page.evaluate(() => {
    const sc = SS.band._listen().scenes.find((x) => x.name === 'Couplet');
    const t = SS.band._listen().tracks.find((x) => x.id.endsWith(':bd'));
    return sc.data[t.id].steps.slice(0, 16).map((v) => (v > 0 ? 1 : 0)).join('');
  });
  ok(heard === lane(pat.lanes.K), 'le projet d’écoute joue le même kick');
  ok(/Darksynth/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'la colonne des scènes rappelle le motif');

  // la grille : un clic sur une case la change (cinq pistes de 16 pas), « Revenir au motif » la rend
  ok((await page.locator('.bwp-cell').count()) === 16 * (await page.locator('.bwd-ln:not(:empty)').count()) && (await page.locator('.bwp-cell[data-l="K"]').count()) === 16, 'grille : une ligne de 16 pas par élément coché du kit');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  let d = (await part('verse', 'drums'));
  ok(d.edits && d.edits.K[1] === 'x' && d.pattern === 'darksynth' && (await kick('Couplet'))[1] > 0, 'une case de kick ajoutée : edits, et le kick joue le pas 2');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  await page.click('.bwp-cell[data-l="K"][data-s="1"]');
  ok((await part('verse', 'drums')).edits.K[1] === '-', 'x, o, léger, puis éteint');
  await page.click('#bwpUnedit');
  ok(!(await part('verse', 'drums')).edits && rowsOf(await kick('Couplet'), bars).every((r) => r === lane(pat.lanes.K)), '« Revenir au motif » efface les retouches');

  // fills et crash
  await page.click('#bwpFill [data-v="4"]');
  ok((await part('verse', 'drums')).fill === '4' && (await page.locator('.bwp-bars span.fill').count()) === bars / 4, 'fill toutes les 4 mesures : mesures roses');
  await page.selectOption('#bwpFillType', 'toms');
  await page.check('#bwpCrash');
  d = (await part('verse', 'drums'));
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
  await tab('bass');
  ok((await page.getAttribute('#bwParts', 'data-kind')) === 'bass' && (await page.locator('#bwMotif .mot-chip').count()) === 10 && (await page.locator('#bwMotif .mot-card').count()) > 10, 'étape Basse : l’écran MOTIF (Tous, 8 styles, ★ Célèbres) et ses cartes');
  ok((await page.locator('#bwMotif .mot-card.on .mot-insp').textContent()) === 'Inspiration', 'basse : le mode de l’inspiration est choisi et repéré');
  await scene('Couplet');
  await page.click('#bwpPedal [data-v="tonic"]');
  await page.click('#bwpRegister [data-v="mid"]');
  ok((await part('verse', 'bass')).pedal === 'tonic' && (await part('verse', 'bass')).register === 'mid', 'pédale de tonique et hauteur C2 réglées');
  const pcs = await page.evaluate(() => {
    const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === 'Couplet');
    const id = Object.keys(sc.data).find((k) => /:bass/.test(k));
    return [...new Set(sc.data[id].events.flatMap((e) => e.notes.map((n) => n % 12)))];
  });
  ok(pcs.length === 1 && pcs[0] === 0, `la basse reste sur la tonique, Do (${pcs})`);
  await page.click('#bwMotif .mot-chip[data-g="all"]');
  await page.click('#bwMotif .mot-card[data-id="gallop"]');
  ok((await part('verse', 'bass')).mode === 'gallop' && /Galop/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'mode Galop choisi, rappelé dans la colonne des scènes');

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-basse.png') });

  // Nappes : mode et voicing
  await tab('chords');
  ok((await page.getAttribute('#bwParts', 'data-kind')) === 'chords' && (await page.locator('#bwPadMotif .mot-chip.on.mark[data-g="synth"]').count()) === 1 && (await page.locator('#bwPadMotif .mot-card').count()) === 1 + (await page.evaluate(() => SS.padMotifs.inGroup('synth').length)), 'onglet de la nappe : puce Synthwave (style de la chanson), ses motifs et Aucune');
  await page.click('#bwPadMotif .mot-chip[data-g="all"]');
  ok((await page.locator('#bwPadMotif .mot-card').count()) === 1 + (await page.evaluate(() => SS.padMotifs.MODES.length)), 'nappe : tous les motifs');
  await page.click('#bwpPadKind [data-v="mouv"]');
  ok((await page.evaluate(() => [...document.querySelectorAll('#bwPadMotif .mot-card:not(.mot-none)')].every((c) => SS.padMotifs.kindOf(c.dataset.id) === 'mouv'))) && (await page.locator('#bwPadMotif .mot-card[data-id="cliche"]').count()) === 1, 'nappe : filtre En mouvement');
  await page.click('#bwPadMotif .mot-card[data-id="cliche"]');
  ok((await part('verse', 'pad')).mode === 'cliche' && /Ligne descendante/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'nappe : Ligne descendante choisie, rappelée dans la colonne des scènes');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-nappe.png') });
  await page.click('#bwpPadKind [data-v="all"]');
  await page.click('#bwPadMotif .mot-card[data-id="stabs"]');
  await page.click('#bwpVoicing [data-v="open"]');
  ok((await part('verse', 'pad')).mode === 'stabs' && (await part('verse', 'pad')).voicing === 'open', 'nappe : stabs, voicing ouvert');

  // Arpèges : Arp One (mode Intuitif). L'inspiration joue tant qu'on n'a rien touché ; allumé dans le couplet (le plan n'en avait pas)
  await tab('arp');
  ok((await page.getAttribute('#bwParts', 'data-kind')) === 'arp', 'onglet de l’arpège');
  ok((await page.locator('.bwp-chips').count()) === 0 && (await page.locator('#bwaName').count()) === 1 && (await page.locator('#bwaMotif').count()) === 0 && (await page.locator('.bwa-knob .arp-knob-dial').count()) === 4, 'panneau Arp One : bouton de motif (plus de select), 4 potentiomètres Densité / Ampleur / Mouvement / Écho');
  const geo = await page.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect();
    const n = r('#bwaName'), p = r('#bwaPrev'), x = r('#bwaNext'), s = r('#bwaSurprise'), v = r('#bwaRate');
    const d = r('#bwaK-density');
    return { order: n.right <= p.left + 1 && p.right <= x.left + 1 && x.right <= s.left + 1 && s.right <= v.left + 1, line: Math.max(n.top, p.top, x.top, s.top, v.top) < Math.min(n.bottom, p.bottom, x.bottom, s.bottom, v.bottom), round: Math.abs(d.width - d.height) < 2 && d.width > 60, rad: getComputedStyle(document.querySelector('#bwaK-density')).borderRadius, sur: document.querySelector('#bwaSurprise').textContent, bg: getComputedStyle(document.querySelector('#bwaSurprise')).backgroundColor, scroll: document.querySelector('#bwParts').scrollWidth <= document.querySelector('#bwParts').clientWidth + 1 };
  });
  ok(geo.order && geo.line, 'une ligne : motif, ‹, ›, Surprends-moi, Vitesse (dans cet ordre)');
  ok(geo.sur === 'Surprends-moi' && /^rgb\(\d+, 1[3-9]\d, \d+\)$/.test(geo.bg) && geo.round && geo.rad.includes('50%'), `Surprends-moi vert sans icône (${geo.bg}) ; potentiomètres ronds`);
  ok(!(await page.isChecked('#bwp-on-arp')) && (await preview('Couplet', ':arp')).events.length === 0 && !(await part('verse', 'arp')), 'couplet : pas d’arpège dans l’inspiration, rien de réglé');
  await scene('Intro');
  ok((await page.textContent('#bwaName b')) === 'Pédale aiguë' && !(await part('intro', 'arp')), 'intro : le motif de départ suit l’inspiration (bells → Pédale aiguë), sans réglage écrit');
  await scene('Couplet');
  await page.check('#bwp-on-arp');
  ok((await part('verse', 'arp')).mode === 'up16' && (await preview('Couplet', ':arp')).events.length > 0, 'arpège allumé dans le couplet');
  const notesOf = async (n) => JSON.stringify(((await preview(n, ':arp')).events || []).map((e) => [e.step, e.len, e.notes]));
  const countOf = async (n) => ((await preview(n, ':arp')).events || []).length;
  const before = await notesOf('Couplet');
  // un motif choisi : parts.verse.arp.one, et les notes changent
  await page.click('#bwaName');
  ok((await page.locator('#bwaMotifDialog[open]').count()) === 1 && (await page.locator('#bwaMotifDialog .arp-style').count()) > 0 && (await page.locator('#bwaMotifDialog .motif-cat').count()) === (await page.evaluate(() => SS.MOTIF_CATS.length)) + 2, 'clic sur le bouton de motif : fenêtre de sélection (catégories et motifs)');
  await page.click('#bwaMotifCancel');
  ok((await page.locator('#bwaMotifDialog').count()) === 0 && !(await part('verse', 'arp')).one, 'Annuler : rien ne change');
  await page.click('#bwaName');
  await page.click('#bwaMotifDialog .motif-cat:has-text("Tous les motifs")');
  await page.click('#bwaMotifDialog .arp-style[data-id="midnight"]');
  await page.click('#bwaMotifOk');
  let one = (await part('verse', 'arp')).one;
  ok(one && one.mode === 'pattern' && !(await part('verse', 'arp')).mode && (await page.textContent('#bwaName b')) === 'Midnight Drive', 'motif choisi : arp.one posé, nom affiché');
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
  ok((await part('verse', 'arp')).one.rate === 0.5, 'vitesse 1/8');
  await page.click('#bwaRate [data-v="1"]');
  // Densité : moins de notes
  const full = await countOf('Couplet');
  await page.focus('#bwaK-density');
  for (const k of ['Home', 'ArrowUp', 'ArrowUp', 'ArrowUp']) await page.keyboard.press(k);
  const sparse = await countOf('Couplet');
  ok(sparse > 0 && sparse < full && (await part('verse', 'arp')).one.macros.density === 15, `Densité basse : moins de notes (${sparse} < ${full})`);
  // Ampleur
  await page.focus('#bwaK-width');
  for (const k of ['End', 'ArrowDown']) await page.keyboard.press(k);
  ok((await part('verse', 'arp')).one.octaves === 4, 'Ampleur : 4 octaves');
  // Surprends-moi
  const pre = JSON.stringify((await part('verse', 'arp')).one);
  await page.click('#bwaSurprise');
  ok(JSON.stringify((await part('verse', 'arp')).one) !== pre && (await countOf('Couplet')) > 0, 'Surprends-moi : un nouvel arpège, qui joue');
  const verseNotes = await notesOf('Couplet');
  await page.click('#bwpAll');
  ok((await part('intro', 'arp')).one && (await part('outro', 'arp')).one && !!(await part('chorus', 'arp')).one, 'copié vers toutes les scènes (réglages Arp One compris)');
  await scene('Refrain');
  ok(await page.isChecked('#bwp-on-arp'), 'refrain : l’arpège joue');
  await page.uncheck('#bwp-on-arp');
  ok((await part('chorus', 'arp')).off === true && (await preview('Refrain', ':arp')).events.length === 0, 'arpège coupé dans le refrain');
  ok(/muet/.test(await page.textContent('.bh-scene.on .bh-ssub')), 'la colonne des scènes : muet');
  await page.click('#bwpBack');
  ok(!(await part('chorus', 'arp')) && (await preview('Refrain', ':arp')).events.length > 0, '↺ Inspiration : le refrain rejoue l’arpège du plan');

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-arpeges.png') });

  // Intégration, puis création : la chanson porte les réglages
  await next(4);
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
  await next(5);
  ok((await page.locator('#bandWizSteps li[data-kind="arp"]').count()) === 0 && (await page.evaluate(() => SS.band.insSteps().every((t) => t.kind !== 'arp'))), 'groupe sans arpège : pas d’onglet d’arpège');
  await tab('chords');
  ok((await page.locator('#bwPadMotif .mot-card').count()) > 8, 'groupe avec nappe : les réglages');

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
  await next(5);

  // téléphone : rien ne déborde
  await page.setViewportSize({ width: 390, height: 844 });
  await tab('drums');
  ok((await page.getAttribute('#bwParts', 'data-kind')) === 'drums', 'téléphone : onglet de la batterie');
  const over = await page.evaluate(() => document.querySelector('#bandDialog').scrollWidth - document.querySelector('#bandDialog').clientWidth);
  const cell = await page.evaluate(() => document.querySelector('.bwp-cell').getBoundingClientRect().width);
  ok(over <= 1 && cell >= 10, `téléphone : la fenêtre ne défile pas, les cases restent cliquables (${Math.round(cell)} px)`);

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'parts-mobile.png') });

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
