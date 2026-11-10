/*
 * Mastering des chansons Band : calcule pour chaque inspiration le gain d'entrée du limiteur (« drive ») et écrit
 * js/band-drive.js. Comme un ingénieur de mastering, on règle le volume sur la partie la plus forte du morceau :
 * le volume court terme (fenêtres de 3 s, EBU R128) de la section la plus forte est amené à la valeur visée par le
 * style (js/bandmix.js, STYLE.loud : −9,5 LUFS synthwave, −8,5 LUFS EDM). Le volume intégré suit alors la dynamique
 * du morceau (un long break calme le fait baisser) au lieu d'écraser les refrains pour compenser.
 * Rendu complet sans gain (tools/render-band-song.js), mesures par ffmpeg ; VERIFY=1 refait un rendu avec le gain.
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
  // volume court terme de chaque fenêtre : on retient le 98e centile (la partie la plus forte, sans un éclat isolé)
  const S = [...out.matchAll(/ S:\s*(-?[\d.]+)/g)].map((m) => +m[1]).filter((v) => v > -70).sort((a, b) => a - b);
  const loud = S.length ? S[Math.floor(S.length * 0.98)] : -70;
  return { I: +sum.match(/I:\s+(-?[\d.]+)/)[1], LRA: +sum.match(/LRA:\s+(-?[\d.]+)/)[1], TP: +sum.match(/Peak:\s+(-?[\d.]+|-inf)/)[1], loud };
}
async function measure(p, drive) {
  const wav = path.join(tmp, `${p.id}.wav`);
  await run('node', [path.join(__dirname, 'render-band-song.js'), p.id, 'auto', wav], { MASTER: JSON.stringify({ mastering: { drive } }) });
  const m = await loudness(wav);
  fs.unlinkSync(wav);
  return m;
}
async function one(p) {
  const loud = SS.bandMix.STYLE[p.style].loud;
  const a = await measure(p, 0);
  let drive = +(loud - a.loud).toFixed(1);
  // seconde passe : le limiteur retire une partie du gain ; on corrige (au plus +2 dB, pour ne pas sur-limiter)
  if (!process.env.ONEPASS) {
    const b = await measure(p, drive);
    drive = +(drive + Math.min(2, Math.max(-2, loud - b.loud))).toFixed(1);
  }
  table[p.id] = drive;
  let msg = `${p.id.padEnd(13)} sans gain : intégré ${a.I} LUFS, partie forte ${a.loud} LUFS → drive ${drive} dB`;
  if (process.env.VERIFY) {
    const b = await measure(p, drive);
    msg += ` (vérification : intégré ${b.I} LUFS, partie forte ${b.loud}, LRA ${b.LRA}, crête ${b.TP} dBTP)`;
  }
  console.log(msg);
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
