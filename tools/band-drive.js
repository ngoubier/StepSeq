/*
 * Mastering des chansons Band : calcule pour chaque inspiration le gain d'entrée du limiteur (« drive ») qui amène
 * la chanson complète au volume visé par son style (js/bandmix.js : −11 LUFS synthwave, −10 LUFS EDM), et écrit
 * js/band-drive.js. Deux passes de rendu complet (tools/render-band-song.js) : la première mesure le volume sans
 * gain, la seconde corrige ce que le limiteur retire. Mesures EBU R128 par ffmpeg.
 *
 *   node tools/band-drive.js [inspiration…]      (sans argument : les 20 ; nécessite ffmpeg)
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
['dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'band-presets.js', 'band-levels.js', 'bandmix.js'].forEach((f) => require(path.join(ROOT, 'js', f)));
const OUT = path.join(ROOT, 'js', 'band-drive.js');
const table = fs.existsSync(OUT) ? (require(OUT), { ...SS.BAND_DRIVE }) : {};
const presets = SS.Band.STYLES.flatMap((s) => s.presets.map((p) => ({ id: p.id, style: s.id })));
const wanted = process.argv.slice(2);
const list = wanted.length ? presets.filter((p) => wanted.includes(p.id)) : presets;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'band-drive-'));

const run = (cmd, args, env = {}) =>
  new Promise((ok, ko) => execFile(cmd, args, { env: { ...process.env, ...env }, maxBuffer: 1 << 26 }, (e, out, err) => (e ? ko(e) : ok(out + err))));
async function loudness(wav) {
  const out = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = out.slice(out.lastIndexOf('Summary'));
  return { I: +sum.match(/I:\s+(-?[\d.]+)/)[1], LRA: +sum.match(/LRA:\s+(-?[\d.]+)/)[1], TP: +sum.match(/Peak:\s+(-?[\d.]+|-inf)/)[1] };
}
async function measure(p, drive) {
  const wav = path.join(tmp, `${p.id}.wav`);
  await run('node', [path.join(__dirname, 'render-band-song.js'), p.id, 'auto', wav], { MASTER: JSON.stringify({ mastering: { drive } }) });
  const m = await loudness(wav);
  fs.unlinkSync(wav);
  return m;
}
async function one(p) {
  const target = SS.bandMix.STYLE[p.style].target;
  const a = await measure(p, 0);
  let drive = +(target - a.I).toFixed(1);
  const b = await measure(p, drive);
  drive = +(drive + (target - b.I)).toFixed(1);
  table[p.id] = drive;
  console.log(`${p.id.padEnd(13)} sans gain ${a.I} LUFS → drive ${drive} dB (passe 2 : ${b.I} LUFS, LRA ${b.LRA}, crête ${b.TP} dBTP)`);
}
(async () => {
  const queue = [...list];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) await one(queue.shift());
  });
  await Promise.all(workers);
  const lines = presets.filter((p) => table[p.id] != null).map((p) => `  ${p.id}: ${table[p.id]},`).join('\n');
  fs.writeFileSync(
    OUT,
    `/*
 * Gain d'entrée du mastering (dB) de chaque chanson Band, pour atteindre le volume visé par son style
 * (js/bandmix.js). Généré par tools/band-drive.js (rendu complet de chaque chanson, mesure EBU R128).
 */
window.SS = window.SS || {};
SS.BAND_DRIVE = {
${lines}
};
`
  );
  fs.rmSync(tmp, { recursive: true, force: true });
})();
