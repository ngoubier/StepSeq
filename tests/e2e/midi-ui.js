/*
 * Test de bout en bout de l'import / export MIDI (menu de l'application, js/midipanel.js).
 * Le fichier importé est fabriqué par le test (2 pistes + batterie, 16 mesures : A A B A), sauf si on en donne un.
 *   node tests/e2e/midi-ui.js [fichier.mid] [dossier-captures]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
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
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const [INPUT, SHOTS] = process.argv.slice(2);

/** Fichier de test : basse + accords + batterie, forme A A B A (4 mesures chacune). */
function fixture() {
  globalThis.window = globalThis;
  require(path.join(ROOT, 'js/midi-file.js'));
  const M = globalThis.SS.midiFile;
  const T = 120; // ticks par double-croche (ppq 480)
  const bass = [M.meta.name(0, 'Basse'), { tick: 0, bytes: [0xc0, 38] }];
  const keys = [M.meta.name(0, 'Accords'), { tick: 0, bytes: [0xc1, 4] }];
  const drums = [M.meta.name(0, 'Batterie')];
  const note = (trk, ch, at, len, n, v = 100) => trk.push({ tick: at, bytes: [0x90 | ch, n, v] }, { tick: at + len, bytes: [0x80 | ch, n, 0] });
  ['A', 'A', 'B', 'A'].forEach((part, k) => {
    for (let bar = 0; bar < 4; bar++) {
      const at = (k * 4 + bar) * 16 * T;
      const root = part === 'A' ? [36, 36, 41, 43][bar] : [45, 41, 43, 43][bar];
      for (let s = 0; s < 16; s += 4) note(bass, 0, at + s * T, 3 * T, root);
      [0, 4, 7].forEach((i) => note(keys, 1, at, 16 * T, root + 24 + i, 80));
      for (let s = 0; s < 16; s += 2) note(drums, 9, at + s * T, T, 42, 70);
      note(drums, 9, at, T, 36); note(drums, 9, at + 8 * T, T, 36);
      if (part === 'A') { note(drums, 9, at + 4 * T, T, 38); note(drums, 9, at + 12 * T, T, 38); }
    }
  });
  const conductor = [M.meta.tempo(0, 118), M.meta.timeSig(0, 4, 4)];
  const file = path.join(os.tmpdir(), 'stepseq-test.mid');
  fs.writeFileSync(file, M.write({ ppq: 480, tracks: [conductor, bass, keys, drums] }));
  return file;
}

(async () => {
  const input = INPUT || fixture();
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);

  // ---- import ----
  await page.click('#appMenuBtn');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#importMidi')]);
  await chooser.setFiles(input);
  await page.waitForSelector('#midiImportDialog[open] .midi-summary', { timeout: 20000 });
  const summary = await page.textContent('#miReport');
  ok(/mesures/.test(summary) && /BPM/.test(summary), 'bilan d\'import affiché');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'midi-import.png') });
  await page.click('#miSplit button[data-v="0.7"]');
  await page.waitForTimeout(300);
  ok(await page.$eval('#miSplit button[data-v="0.7"]', (e) => e.classList.contains('active')), 'option de découpage « Compact »');
  await page.click('#miOk');
  await page.waitForTimeout(800);
  const proj = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    return { title: p.title, tempo: p.tempo, tracks: p.tracks.map((t) => t.name), scenes: p.scenes.map((s) => s.name + ':' + s.bars), song: p.song.map((x) => [p.scenes.find((s) => s.id === x.scene).name, x.repeat]), mode: p.playMode };
  });
  console.log(JSON.stringify(proj));
  ok(!(await page.$('#midiImportDialog[open]')), 'fenêtre d\'import fermée');
  ok(proj.tracks.length >= 3 && proj.mode === 'song', 'projet créé en mode Chanson');
  if (!INPUT) {
    ok(proj.tempo === 118, 'tempo repris (118)');
    ok(proj.tracks.includes('Basse') && proj.tracks.includes('Accords') && proj.tracks.includes('Kick') && proj.tracks.includes('Snare'), 'pistes : Basse, Accords, Kick, Snare…');
    ok(proj.scenes.length === 2 && proj.song.length === 3, `forme A A B A retrouvée : ${proj.song.map((x) => x.join('×')).join(' → ')}`);
  }

  // ---- export ----
  await page.click('#appMenuBtn');
  await page.click('#exportMidi');
  await page.waitForSelector('#midiExportDialog[open] .midi-summary');
  ok(/notes/.test(await page.textContent('#meReport')), 'bilan d\'export affiché');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'midi-export.png') });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#meForm button[type=submit]')]);
  const out = await dl.path();
  const bytes = fs.readFileSync(out);
  ok(dl.suggestedFilename().endsWith('.mid') && bytes.slice(0, 4).toString() === 'MThd', `fichier exporté : ${dl.suggestedFilename()} (${bytes.length} octets)`);
  globalThis.window = globalThis;
  require(path.join(ROOT, 'js/midi-file.js'));
  const back = globalThis.SS.midiFile.parse(bytes);
  ok(back.tracks.length === proj.tracks.length + 1, 'une piste MIDI par piste (+ piste de tempo)');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
