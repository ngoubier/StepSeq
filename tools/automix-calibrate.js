/*
 * Calibrage de l'Auto Mix sur les chansons du Band (mixées et masterisées par js/bandmix.js).
 *
 *   node tools/automix-calibrate.js [inspiration…|all] [> mesures.json]
 *
 * Chaque chanson est rendue hors temps réel comme dans tools/render-band-song.js ; l'écoute de l'Auto Mix
 * (js/automix-listen.js) prend un relevé à chaque arrêt du rendu (toutes les 40 ms). Le script affiche, par
 * chanson, le niveau de chaque rôle par rapport au mix, la courbe du spectre, les mesures du Master et le
 * diagnostic obtenu avec l'objectif du style ; puis la moyenne par style (courbes) et la médiane par rôle,
 * qui servent de valeurs de référence (SS.automix.CURVES, SS.automix.ROLE_LEVEL).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };
globalThis.window = globalThis;
['dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'band-presets.js', 'band-songs.js'].forEach((f) => require(path.join(ROOT, 'js', f)));

const args = process.argv.slice(2);
const all = SS.Band.STYLES.flatMap((s) => s.presets.map((p) => ({ style: s, preset: p })));
const jobs = !args.length || args[0] === 'all' ? all : all.filter((j) => args.includes(j.preset.id));
if (!jobs.length) throw new Error('inspiration inconnue : ' + args.join(' '));

function songSeconds(id, tempo) {
  const spec = SS.BandSongs[id];
  const bars = spec.form.split(/\s+/).filter(Boolean).reduce((a, t) => {
    const [s, n] = t.split('*');
    return a + spec.sections[s].bars * (+n || 1);
  }, 0);
  return (bars * 4 * 60) / tempo + 3;
}

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function measure(browser, { style, preset }) {
  const secs = songSeconds(preset.id, preset.tempo);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => console.error('page :', e.message));
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
  }, secs);
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
  await page.evaluate(async () => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const jobs = [];
    for (const t of p.tracks) for (const sc of p.scenes) jobs.push(SS.audio.prepareTrack({ ...t, ...(sc.data[t.id] || {}) }));
    await Promise.all(jobs);
  });
  await page.waitForTimeout(3000);
  await page.click('#play');
  const out = await page.evaluate(async ({ secs, target }) => {
    const ctx = window.__ctx;
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    p.tracks.forEach((t) => SS.audio.ensureBus(t));
    SS.automixListen.reset();
    SS.automixListen.start(() => p, null, { manual: true });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let t = 0.04; t < secs; t += 0.04)
      ctx.suspend(t).then(async () => {
        if (window.__tick) window.__tick();
        SS.automixListen.sample(0.04);
        await sleep(2);
        await sleep(2);
        ctx.__allow = true;
        await ctx.resume();
        ctx.__allow = false;
      });
    if (window.__tick) window.__tick();
    await sleep(20);
    await ctx.startRendering();
    await sleep(200);
    const sum = SS.automixListen.summary();
    const live = JSON.parse(localStorage.getItem('stepseq.autosave'));
    const mp = SS.masterParams(live);
    const tracks = live.tracks.map((t) => ({ id: t.id, name: t.name, band: t.band, role: SS.automix.roleOf(t), mix: SS.mixParams(t), fx: SS.fxParams(t), volumeDb: SS.gainToDb(t.volume ?? 0.8) }));
    const d = SS.automix.diagnose(sum, { tracks, master: { ...mp, volumeDb: SS.gainToDb(mp.volume) }, target, prefs: {} });
    const top = Math.max(...sum.mix.bands);
    const kick = tracks.find((t) => t.role === 'kick');
    const bass = tracks.find((t) => t.role === 'bass');
    const kb = kick && bass ? sum.overlap.find((o) => o.band === 1 && [o.a, o.b].includes(kick.id) && [o.a, o.b].includes(bass.id)) : null;
    return {
      roles: tracks.filter((t) => sum.tracks[t.id] && sum.tracks[t.id].active > 0.05).map((t) => ({ role: t.role, name: t.name, rel: +sum.tracks[t.id].rel.toFixed(1), limGr: +(sum.tracks[t.id].limGr || 0).toFixed(1), grMean: +(sum.tracks[t.id].grMean || 0).toFixed(1), crest: sum.tracks[t.id].crest == null ? null : +sum.tracks[t.id].crest.toFixed(1), active: +sum.tracks[t.id].active.toFixed(2) })),
      curve: sum.mix.bands.map((v) => +(v - top).toFixed(1)),
      master: Object.fromEntries(Object.entries(sum.master).map(([k, v]) => [k, v == null ? v : +v.toFixed(2)])),
      prePeak: +sum.mix.prePeak.toFixed(1),
      kickBass: kb ? +kb.ratio.toFixed(2) : null,
      total: d.total,
      scores: d.scores,
      suggestions: d.suggestions.map((s) => `${s.sev} ${s.id} ${s.title}`),
    };
  }, { secs, target: style.id === 'edm' ? 'edm' : 'synthwave' });
  await page.close();
  return { style: style.id, preset: preset.id, secs: Math.round(secs), ...out };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const results = [];
  for (const j of jobs) {
    const t0 = Date.now();
    const r = await measure(browser, j);
    results.push(r);
    console.error(`${r.preset} (${r.style}) : score ${r.total}, ${r.master.i} LUFS, ${r.suggestions.length} conseils — ${Math.round((Date.now() - t0) / 1000)} s`);
    r.suggestions.forEach((s) => console.error('   ' + s));
  }
  // moyennes par style, médiane par rôle
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const curves = {};
  for (const st of new Set(results.map((r) => r.style))) {
    const rs = results.filter((r) => r.style === st);
    curves[st] = rs[0].curve.map((_, b) => +(rs.reduce((a, r) => a + r.curve[b], 0) / rs.length).toFixed(1));
  }
  const roles = {};
  results.forEach((r) => r.roles.forEach((x) => (roles[x.role] = roles[x.role] || []).push(x.rel)));
  const roleLevel = Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, { median: med(v), n: v.length, min: Math.min(...v), max: Math.max(...v) }]));
  console.log(JSON.stringify({ curves, roleLevel, results }, null, 1));
  await browser.close();
  server.close();
})();
