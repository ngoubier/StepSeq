/*
 * Rendu hors temps réel d'une chanson Band (« Créer toute la chanson »), tel que StepSeq la joue.
 *
 *   node tools/render-band-song.js <inspiration> <secondes|auto> <sortie.wav> [racine du site]
 *
 * Variables d'environnement facultatives :
 *   MASTER='{"mastering":{"drive":4}}'  remplace une partie des réglages du Master avant la lecture ;
 *   SOLO=bass                           n'écoute qu'une piste (clé Band : « bass », « drums:bd »…).
 *
 * Principe : le contexte audio de la page est remplacé par un OfflineAudioContext ; le séquenceur (qui tourne
 * normalement toutes les 25 ms) est appelé à la main à chaque arrêt programmé du rendu (toutes les 40 ms).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const [PRESET, SECS_ARG, OUT, ROOT_ARG] = process.argv.slice(2);
const ROOT = path.resolve(ROOT_ARG || path.join(__dirname, '..'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };

globalThis.window = globalThis;
['dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'band-presets.js', 'band-songs.js'].forEach((f) => require(path.join(ROOT, 'js', f)));
const style = SS.Band.STYLES.find((s) => s.presets.some((p) => p.id === PRESET));
if (!style) throw new Error('inspiration inconnue : ' + PRESET);
const preset = style.presets.find((p) => p.id === PRESET);
/** Durée de la chanson : somme des sections de la forme. */
function songSeconds() {
  const spec = SS.BandSongs[PRESET];
  const bars = spec.form.split(/\s+/).filter(Boolean).reduce((a, t) => {
    const [id, n] = t.split('*');
    return a + spec.sections[id].bars * (+n || 1);
  }, 0);
  return (bars * 4 * 60) / preset.tempo + 3; // + la queue des reverbs
}
const SECS = SECS_ARG === 'auto' ? songSeconds() : +SECS_ARG;

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.warn('page :', e.message));
  await page.addInitScript((secs) => {
    class Off extends OfflineAudioContext {
      constructor() {
        super(2, Math.ceil(secs * 44100), 44100);
        window.__ctx = this;
      }
      resume() {
        return this.__allow ? super.resume() : Promise.resolve();
      }
    }
    window.AudioContext = Off;
    window.webkitAudioContext = Off;
    const si = window.setInterval;
    window.setInterval = (fn, ms, ...a) => {
      if (ms === 25) {
        window.__tick = fn;
        return 999999;
      }
      return si(fn, ms, ...a);
    };
    const ci = window.clearInterval;
    window.clearInterval = (id) => (id === 999999 ? (window.__tick = null) : ci(id));
  }, SECS);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1500);
  await page.click('#bandBtn');
  await page.waitForTimeout(400);
  await page.click(`#bandStyles [data-v="${style.id}"]`);
  await page.click(`#bandPresets .band-preset >> nth=${style.presets.indexOf(preset)}`);
  await page.click('#bandSongBtn');
  await page.waitForTimeout(300);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  const project = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  // préchargement de toutes les notes de toutes les scènes
  await page.evaluate(async () => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const jobs = [];
    for (const t of p.tracks) for (const sc of p.scenes) jobs.push(SS.audio.prepareTrack({ ...t, ...(sc.data[t.id] || {}) }));
    await Promise.all(jobs);
  });
  await page.waitForTimeout(3000);
  await page.click('#play');
  await page.evaluate(
    ({ patch, solo }) => {
      const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
      if (patch) {
        const m = JSON.parse(patch);
        p.master = { ...p.master, ...m, mastering: { ...(p.master || {}).mastering, ...(m.mastering || {}) } };
        SS.audio.applyMaster(p);
      }
      if (solo) {
        const keep = new Set(p.tracks.filter((t) => t.band && t.band.key === solo).map((t) => t.id));
        const orig = SS.audio.setTrackGain;
        SS.audio.setTrackGain = (t, v) => orig(t, keep.has(t.id) ? v : 0);
        p.tracks.forEach((t) => {
          SS.audio.ensureBus(t);
          SS.audio.setTrackGain(t, t.volume);
        });
      }
    },
    { patch: process.env.MASTER || '', solo: process.env.SOLO || '' }
  );
  const t0 = Date.now();
  const b64 = await page.evaluate(async (secs) => {
    const ctx = window.__ctx;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let t = 0.04; t < secs; t += 0.04)
      ctx.suspend(t).then(async () => {
        if (window.__tick) window.__tick();
        await sleep(2);
        await sleep(2);
        ctx.__allow = true;
        await ctx.resume();
        ctx.__allow = false;
      });
    if (window.__tick) window.__tick();
    await sleep(20);
    const buf = await ctx.startRendering();
    const n = buf.length;
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    // WAV 32 bits flottants : rien n'est écrêté, les crêtes au-dessus de 0 dBFS restent mesurables
    const pcm = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pcm[2 * i] = L[i];
      pcm[2 * i + 1] = R[i];
    }
    const bytes = new Uint8Array(pcm.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, SECS);
  const raw = Buffer.from(b64, 'base64');
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + raw.length, 4);
  hdr.write('WAVE', 8);
  hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(3, 20); // IEEE float
  hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(44100, 24);
  hdr.writeUInt32LE(44100 * 8, 28);
  hdr.writeUInt16LE(8, 32);
  hdr.writeUInt16LE(32, 34);
  hdr.write('data', 36);
  hdr.writeUInt32LE(raw.length, 40);
  fs.writeFileSync(OUT, Buffer.concat([hdr, raw]));
  console.log(`${PRESET} : ${Math.round(SECS)} s rendues en ${Math.round((Date.now() - t0) / 1000)} s`);
  await browser.close();
  server.close();
})();
