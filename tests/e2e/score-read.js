/*
 * Test de bout en bout de « Lire une partition » (js/score-read.js, js/scorepanel.js) :
 *   node tests/e2e/score-read.js [dossier-captures]
 * MusicXML et .mxl → résultat (mesure à vérifier, mains droite/gauche, accords) → .mid enregistré → Importer MIDI ;
 * image → lecture par Claude (StepSeq.partitionPage / lirePartition) ; PDF → pages (pdf.js : dossier local
 * PDFJS_DIR=…/pdfjs-dist/build si le CDN n'est pas joignable, sinon test sauté).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
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

/* Piano 2 portées, Fa majeur, Andante, 4 mesures : liaison, accord chiffré, mesure 3 fausse (3 temps). */
const n = (step, oct, dur, extra = '') => `<note><pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration>${extra}</note>`;
const rh = (s) => s.replace(/<\/duration>/g, '</duration><voice>1</voice><staff>1</staff>');
const lh = (s) => s.replace(/<\/duration>/g, '</duration><voice>5</voice><staff>2</staff>');
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><work><work-title>Petite valse d'essai</work-title></work>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>-1</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
<direction><direction-type><words>Andante</words></direction-type></direction>
<direction><direction-type><dynamics><p/></dynamics></direction-type></direction>
<harmony><root><root-step>F</root-step></root><kind>major</kind></harmony>
${rh(n('C', 5, 2) + n('D', 5, 2) + n('E', 5, 2) + n('F', 5, 2, '<tie type="start"/>'))}<backup><duration>8</duration></backup>${lh(n('F', 3, 8) + n('A', 3, 8, '<chord/>'))}</measure>
<measure number="2"><harmony><root><root-step>D</root-step></root><kind>minor-seventh</kind></harmony>
${rh(n('F', 5, 2, '<tie type="stop"/>') + n('G', 5, 2) + n('A', 5, 4))}<backup><duration>8</duration></backup>${lh(n('D', 3, 4) + n('A', 2, 4))}</measure>
<measure number="3"><harmony><root><root-step>C</root-step></root><kind>dominant</kind></harmony>
${rh(n('G', 5, 2) + n('F', 5, 2) + n('E', 5, 2))}<backup><duration>6</duration></backup>${lh(n('C', 3, 8))}</measure>
<measure number="4"><harmony><root><root-step>F</root-step></root><kind>major</kind></harmony>
${rh(n('F', 5, 8))}<backup><duration>8</duration></backup>${lh(n('F', 2, 8))}</measure>
</part></score-partwise>`;

/** Un .mxl : zip avec META-INF/container.xml et la partition compressée. */
function mxl(xml) {
  const files = [
    ['META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'],
    ['score.xml', xml],
  ];
  const locals = [];
  const central = [];
  let off = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text);
    const data = zlib.deflateRawSync(raw);
    const nm = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: SHOTS ? 2 : 1, acceptDownloads: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  if (process.env.PDFJS_DIR) {
    await page.route('**/ajax/libs/pdf.js/**', (route) => route.fulfill({ path: path.join(process.env.PDFJS_DIR, path.basename(new URL(route.request().url()).pathname)), contentType: 'text/javascript' }));
  }
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const choose = async (click, name, buffer, mimeType) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), click()]);
    await fc.setFiles({ name, mimeType, buffer });
  };

  // 1. menu ▸ Lire une partition… ▸ MusicXML
  await page.click('#appMenuBtn');
  await page.click('#scoreBtn');
  ok(await ev(() => document.getElementById('scoreDialog').open), 'menu ▸ Lire une partition… ouvre la fenêtre');
  if (SHOTS) await page.locator('#scoreDialog').screenshot({ path: path.join(SHOTS, 'partition-1-deposer.png') });
  await choose(() => page.click('#scBody .sc-drop .btn'), 'valse.musicxml', Buffer.from(XML), 'application/xml');
  await page.waitForSelector('.sc-split');
  const r = await ev(() => SS.scorePanel.claude.etat().resultat);
  ok(r && r.lecteur === 'MusicXML' && r.mesures === 4, `MusicXML lu : ${r && r.mesures} mesures`);
  ok(r && JSON.stringify(r.aVerifier) === '["3"]', `mesure 3 (3 temps) à vérifier : ${r && JSON.stringify(r.aVerifier)}`);
  ok(r && r.portees.join('|') === 'Main droite|Main gauche', `piano → ${r && r.portees.join(', ')}`);
  ok(r && r.notes === 16, `notes (la liaison fait une seule note) : ${r && r.notes}`);
  ok(await ev(() => document.querySelector('.sc-f input').value === '80'), 'tempo « Andante » → 80');
  ok(await ev(() => document.querySelector('.sc-f select').selectedOptions[0].textContent === 'Fa majeur'), 'armure 1 ♭ → Fa majeur');
  ok(await ev(() => document.querySelectorAll('.sc-tr').length === 3 && document.querySelectorAll('.sc-bar.bad').length === 1), '3 lignes (2 mains + accords), 1 mesure orange');
  if (SHOTS) await page.locator('#scoreDialog').screenshot({ path: path.join(SHOTS, 'partition-3-musicxml.png') });

  // 2. Enregistrer le .mid
  await page.click('.sc-tr:nth-child(3) input[type=checkbox]'); // + piste Accords
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#scSave')]);
  const mid = fs.readFileSync(await dl.path());
  const parsed = await ev((bytes) => {
    const f = SS.midiFile.parse(new Uint8Array(bytes));
    return { tracks: f.tracks.length, notes: f.tracks.length };
  }, [...mid]);
  ok(dl.suggestedFilename() === 'Petite valse d\'essai.mid' && mid.slice(0, 4).toString() === 'MThd', `.mid enregistré : ${dl.suggestedFilename()}`);
  ok(parsed.tracks === 4, `.mid : chef + 2 mains + accords = ${parsed.tracks} pistes`);

  // 3. Importer dans StepSeq → fenêtre Importer MIDI → nouvelle chanson
  await page.click('#scNext');
  ok(await ev(() => document.getElementById('midiImportDialog').open && !document.getElementById('scoreDialog').open), 'Importer → fenêtre « Importer MIDI »');
  await page.waitForFunction(() => !document.getElementById('miOk').disabled && document.querySelector('.midi-summary'));
  await page.click('#miOk');
  await page.waitForTimeout(800);
  const st = await ev(() => StepSeq.etat());
  ok(st.titre === 'Petite valse d\'essai' && st.pistes.length >= 3 && st.tempo === 80, `importé : « ${st.titre} », ${st.pistes.length} pistes, ${st.tempo} BPM`);

  // 4. .mxl (zip) par Ouvrir un fichier…
  await ev(() => SS.scorePanel.open());
  await page.click('#scBack');
  await choose(() => page.click('.sc-card:nth-child(3)'), 'valse.mxl', mxl(XML), 'application/vnd.recordare.musicxml');
  await page.waitForSelector('.sc-split');
  ok((await ev(() => SS.scorePanel.claude.etat().resultat.notes)) === 16, '.mxl décompressé et lu (16 notes)');

  // 5. Image → lecture par Claude
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } });
  await page.click('#scBack');
  await choose(() => page.click('#scBody .sc-drop .btn'), 'photo.png', png, 'image/png');
  await page.waitForSelector('.sc-th img');
  ok(await ev(() => !document.getElementById('scNext').disabled && document.querySelector('.sc-card.on b').textContent.includes('Claude')), 'image : 1 page, lecteur Claude');
  await page.click('#scNext');
  ok(await ev(() => !!document.querySelector('.sc-wait') && !!document.getElementById('scPageImg').src), 'Lire → « En attente de Claude… » et la page en grand');
  const pg = await ev(() => StepSeq.partitionPage({ page: 1 }));
  ok(pg.ok && pg.page === 1 && pg.pages === 1, 'StepSeq.partitionPage({ page: 1 })');
  const lu = await ev(() => StepSeq.lirePartition({ titre: 'Air', tempo: 96, mesure: '3/4', tonalite: 'Ré mineur', portees: [{ nom: 'Mélodie', instrument: 'flûte', mesures: ['A4:1', 'D5:1 E5:0.5 F5:0.5 G5:1', 'A5:2~ !f', 'A5:1 G5:1 F5:1', 'D5:2'] }], accords: ['', 'Dm', 'A7', 'Dm Gm', 'Dm'] }));
  ok(lu.ok && lu.mesures === 5 && JSON.stringify(lu.aVerifier) === '["3 (Mélodie)"]', `lirePartition : anacrouse, mesure 3 à vérifier → ${JSON.stringify(lu.aVerifier)}`);
  ok(lu.notes === 10 && (await ev(() => document.querySelector('.sc-tr select').selectedOptions[0].textContent)) === 'Flûte', `${lu.notes} notes, son Flûte`);
  if (SHOTS) await page.locator('#scoreDialog').screenshot({ path: path.join(SHOTS, 'partition-3-claude.png') });
  const bad = await ev(() => StepSeq.lirePartition({ portees: [{ nom: 'X', mesures: ['C4:1 H9:1 C4:2'] }] }));
  ok(bad.ok && bad.erreurs && bad.erreurs[0].includes('H9'), 'note illisible : signalée, rien ne casse');

  // 6. PDF (pdf.js)
  const pdfPage = await b.newPage();
  await pdfPage.setContent('<h1 style="font:40px serif">Page 1</h1><div style="page-break-before:always;font:40px serif">Page 2</div>');
  const pdf = await pdfPage.pdf({ format: 'A4' });
  await pdfPage.close();
  await ev(() => SS.scorePanel.open());
  while (!(await page.$('#scBody .sc-drop .btn'))) await page.click('#scBack');
  await choose(() => page.click('#scBody .sc-drop .btn'), 'deux-pages.pdf', pdf, 'application/pdf');
  const got = await page.waitForSelector('.sc-th img', { timeout: 15000 }).then(() => true).catch(() => false);
  if (got) ok((await ev(() => document.querySelectorAll('.sc-th').length)) === 2, 'PDF : 2 pages affichées');
  else console.log('SKIP PDF : pdf.js injoignable (donner PDFJS_DIR)');
  if (SHOTS && got) await page.locator('#scoreDialog').screenshot({ path: path.join(SHOTS, 'partition-1-pdf.png') });

  ok(!errs.length, `aucune erreur de page${errs.length ? ' : ' + errs.join(' | ') : ''}`);
  await b.close();
  server.close();
})();
