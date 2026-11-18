/*
 * Test de bout en bout de « Exporter l'audio… » (js/audioexport.js, js/render.js, render.html) :
 *   node tests/e2e/audio-export.js            (SHOTS=dossier : captures de la fenêtre)
 * Projet de démonstration, scène en cours jouée une fois : master seul (.wav), puis master + stems par piste (.zip).
 * Vérifie le fichier téléchargé (en-tête WAV, durée, niveau), l'archive (un fichier par piste entendue, tous de la même
 * longueur), le bilan affiché, l'arrêt en cours de rendu, et que le rendu n'écrit rien dans le stockage du navigateur.
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

/** Fichiers d'une archive ZIP « stockée » : [{ name, data }]. */
function unzip(buf) {
  const out = [];
  let o = 0;
  while (buf.readUInt32LE(o) === 0x04034b50) {
    const size = buf.readUInt32LE(o + 18);
    const nl = buf.readUInt16LE(o + 26);
    const xl = buf.readUInt16LE(o + 28);
    const name = buf.toString('utf8', o + 30, o + 30 + nl);
    out.push({ name, data: buf.subarray(o + 30 + nl + xl, o + 30 + nl + xl + size) });
    o += 30 + nl + xl + size;
  }
  return out;
}
/** En-tête WAV : { format, channels, rate, bits, frames, peak } (peak : PCM 24 bits). */
function wav(b) {
  const bits = b.readUInt16LE(34);
  const frames = b.readUInt32LE(40) / (2 * (bits / 8));
  let peak = 0;
  if (bits === 24) for (let i = 44; i + 2 < b.length; i += 3 * 7) peak = Math.max(peak, Math.abs(b.readIntLE(i, 3)) / 8388607);
  return { riff: b.toString('ascii', 0, 4), format: b.readUInt16LE(20), channels: b.readUInt16LE(22), rate: b.readUInt32LE(24), bits, frames, peak };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
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
  await page.waitForTimeout(1500);

  const openDlg = async () => {
    await page.click('#appMenuBtn');
    await page.click('#exportAudio');
    await page.waitForSelector('#audioExportDialog[open]');
  };
  await openDlg();
  ok(await page.isVisible('#axRange [data-v="song"].active'), 'la chanson (arrangement) est proposée par défaut');
  await page.click('#axRange [data-v="scene"]');
  ok(await page.isVisible('#axLoopsRow'), 'scène en cours : le nombre de répétitions apparaît');
  await page.fill('#axLoops', '1');
  await page.dispatchEvent('#axLoops', 'change');
  await page.click('#axStems [data-v="none"]');
  await page.click('#axBits [data-v="24"]');
  await page.click('#axRate [data-v="44100"]');
  const sum = await page.textContent('#axReport');
  ok(/1 fichier WAV/.test(sum), `résumé avant export : ${sum.trim()}`);
  ok((await page.textContent('#axGo')).includes('.wav'), 'bouton « Exporter (.wav) »');
  if (SHOTS) await page.locator('#audioExportDialog').screenshot({ path: path.join(SHOTS, 'audio-export-options.png') });

  // arrêt en cours de rendu
  await page.click('#axGo');
  await page.waitForSelector('#axProgress:not([hidden])');
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => !!document.querySelector('iframe[title="Rendu audio"]')), 'le rendu tourne dans un cadre invisible');
  await page.click('#axCancel');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#axOptions'), 'Arrêter : retour aux options');
  ok(await page.evaluate(() => !document.querySelector('iframe[title="Rendu audio"]')), 'Arrêter : le cadre de rendu est retiré');

  // master seul
  const before = await page.evaluate(() => Object.keys(localStorage).sort().join(','));
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#axGo')]);
  const file = await dl.path();
  const w = wav(fs.readFileSync(file));
  const secs = await page.evaluate(() => SS.render.songPlan(SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave'))), { range: 'scene', loops: 1 }).seconds);
  console.log(`     master rendu en ${Math.round((Date.now() - t0) / 1000)} s : ${dl.suggestedFilename()}`);
  ok(dl.suggestedFilename().endsWith(' - master.wav'), 'nom du fichier : « … - master.wav »');
  ok(w.riff === 'RIFF' && w.format === 1 && w.channels === 2 && w.rate === 44100 && w.bits === 24, 'WAV PCM 24 bits stéréo 44,1 kHz');
  ok(w.frames / 44100 >= secs && w.frames / 44100 <= secs + 8.1, `durée : ${(w.frames / 44100).toFixed(2)} s pour une scène de ${secs} s (+ queue)`);
  ok(w.peak > 0.3 && w.peak < 0.95, `niveau du master : crête ${w.peak.toFixed(2)}`);
  await page.waitForSelector('.ax-meas li');
  const rep = await page.textContent('#axReport');
  ok(/Volume intégré/.test(rep) && /LUFS/.test(rep) && /dBTP/.test(rep), 'bilan : volume intégré, crête vraie');
  ok((await page.textContent('#axCancel')).trim() === 'Fermer', 'après l’export : « Fermer »');
  if (SHOTS) await page.locator('#audioExportDialog').screenshot({ path: path.join(SHOTS, 'audio-export-report.png') });
  const after = await page.evaluate(() => Object.keys(localStorage).sort().join(','));
  ok(before === after, 'le rendu n’ajoute rien au stockage du navigateur');
  await page.click('#axCancel');

  // master + stems par piste
  await openDlg();
  await page.click('#axRange [data-v="scene"]');
  await page.fill('#axLoops', '1');
  await page.dispatchEvent('#axLoops', 'change');
  await page.click('#axStems [data-v="track"]');
  const n = await page.evaluate(() => SS.render.stemGroups(SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave'))), 'track').length);
  ok((await page.textContent('#axGo')).includes('.zip'), 'avec stems : « Exporter (.zip) »');
  const t1 = Date.now();
  const [dz] = await Promise.all([page.waitForEvent('download', { timeout: 900000 }), page.click('#axGo')]);
  const files = unzip(fs.readFileSync(await dz.path()));
  console.log(`     ${files.length} fichiers rendus en ${Math.round((Date.now() - t1) / 1000)} s : ${dz.suggestedFilename()}`);
  ok(files.length === n + 1, `archive : master + ${n} stems (${files.length} fichiers)`);
  ok(files[0].name.endsWith(' - master.wav') && files.slice(1).every((f) => /stems\/\d\d .+\.wav$/.test(f.name)), 'noms : master, puis stems/01 …');
  const lens = files.map((f) => wav(f.data).frames);
  const stemLens = new Set(lens.slice(1));
  ok(stemLens.size === 1, 'tous les stems ont la même longueur');
  ok(Math.abs(lens[0] - lens[1]) < 44100 * 0.05, 'le master a la longueur des stems (recalage de quelques ms au plus)');
  await page.waitForSelector('.ax-meas li');
  ok(/Stems \(crête\)/.test(await page.textContent('#axReport')), 'bilan : crête de chaque stem');

  ok(!errs.length, `aucune erreur de page${errs.length ? ' : ' + errs.join(' | ') : ''}`);
  await browser.close();
  server.close();
})();
