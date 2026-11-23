/*
 * Diagnostic du son des pistes Ambient (Jardin, Paysage, Fresque) : grésillements, saturation, coupures, fuites.
 *   node tests/e2e/ambient-diag.js            (DIAG_SECONDS=30 de lecture en direct)
 *
 * 1. Chaque piste est figée (rendu hors ligne, le même que l'export) puis son enregistrement est analysé :
 *    crête, échantillons saturés, clics (sauts brusques de la dérivée seconde, comparés au niveau local),
 *    coupures (trous de silence au milieu du son), valeurs NaN.
 * 2. Lecture en direct : nœuds audio vivants à mi-parcours et à la fin (fuite = le nombre grandit),
 *    sous-alimentations du navigateur (underruns), événements de santé du moteur.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const SECONDS = +process.env.DIAG_SECONDS || 30;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

const scene = (id, name, chords) => ({ id, name, bars: 4, data: {}, key: { tonic: 'D', mode: 'major' }, grid: { chords: chords.map(([degree, type], i) => ({ step: i * 32, len: 32, degree, type })) } });
const amb = (id, mod, sendSpace) => ({ id, type: 'instrument', name: mod, family: 'ambient', instrument: mod, category: 'ambient', volume: 0.8, events: [], fx: { chorus: 0, delay: 0, room: 0, sendSpace } });
const PROJECT = {
  format: 'stepseq', version: 1, title: 'Diag Ambient', tempo: 70, bars: 4,
  tracks: [amb('j', 'jardin', 0.5), amb('p', 'paysage', 0.5), amb('f', 'fresque', 0.45)],
  scenes: [scene('s1', 'Aube', [[0, 'maj'], [3, 'maj']]), scene('s2', 'Brume', [[5, 'min'], [4, 'maj']])],
  current: 's1', song: [{ scene: 's1', repeat: 4 }, { scene: 's2', repeat: 4 }], playMode: 'song',
};

function tracker() {
  const live = new Map();
  const reg = new FinalizationRegistry((type) => live.set(type, live.get(type) - 1));
  const proto = BaseAudioContext.prototype;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (!/^create(?!Buffer$|PeriodicWave$)/.test(name) || typeof proto[name] !== 'function') continue;
    const orig = proto[name];
    proto[name] = function (...a) {
      const n = orig.apply(this, a);
      if (!(this instanceof OfflineAudioContext)) {
        const type = name.slice(6);
        live.set(type, (live.get(type) || 0) + 1);
        reg.register(n, type);
      }
      return n;
    };
  }
  window.__nodes = live;
}

// analyse d'un enregistrement (dans la page)
function analyse(buf) {
  const sr = buf.sampleRate;
  const out = { sec: +(buf.length / sr).toFixed(1), peak: 0, clipped: 0, nan: 0, clicks: [], gaps: [] };
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    const W = Math.round(sr * 0.01); // fenêtres de 10 ms
    const nw = Math.floor(x.length / W);
    const rms = new Float32Array(nw), d2rms = new Float32Array(nw);
    for (let w = 0; w < nw; w++) {
      let s = 0, s2 = 0;
      for (let i = w * W; i < (w + 1) * W; i++) {
        const v = x[i];
        if (!Number.isFinite(v)) { out.nan++; continue; }
        const a = Math.abs(v);
        if (a > out.peak) out.peak = a;
        if (a >= 0.999) out.clipped++;
        s += v * v;
        if (i > 1) { const d = v - 2 * x[i - 1] + x[i - 2]; s2 += d * d; }
      }
      rms[w] = Math.sqrt(s / W);
      d2rms[w] = Math.sqrt(s2 / W);
    }
    // clics : un échantillon dont la dérivée seconde dépasse de loin celle des 100 ms autour
    for (let w = 5; w < nw - 5; w++) {
      let ref = 0;
      for (let k = w - 5; k <= w + 5; k++) if (k !== w) ref += d2rms[k];
      ref /= 10;
      if (d2rms[w] > 6 * ref + 1e-4) {
        let m = 0;
        for (let i = w * W; i < (w + 1) * W; i++) m = Math.max(m, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]));
        if (m > 0.01) out.clicks.push({ c, t: +((w * W) / sr).toFixed(2), jump: +m.toFixed(3), lvl: +rms[w].toFixed(3) });
      }
    }
    // coupures : 30 ms quasi muettes alors que ça sonnait juste avant et juste après
    const sorted = [...rms].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    for (let w = 10; w < nw - 10; w++) {
      if (rms[w] > med * 0.02 || rms[w + 1] > med * 0.02 || rms[w + 2] > med * 0.02) continue;
      const before = Math.max(...rms.slice(w - 10, w - 1)), after = Math.max(...rms.slice(w + 4, w + 12));
      if (before > med * 0.3 && after > med * 0.3) out.gaps.push({ c, t: +((w * W) / sr).toFixed(2) });
    }
    out.median = +med.toFixed(4);
  }
  out.peak = +out.peak.toFixed(3);
  out.clicks = out.clicks.slice(0, 12).concat(out.clicks.length > 12 ? [{ more: out.clicks.length - 12 }] : []);
  out.nClicks = out.clicks.length;
  return out;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(tracker);
    await page.addInitScript((p) => {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      localStorage.setItem('ss.diagMode', '0');
    }, PROJECT);
    page.setDefaultTimeout(30000);
    await page.goto(`http://localhost:${server.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SS && SS.ui && SS.freeze && SS.ambient && document.querySelectorAll('.track').length === 3);

    // 1. rendu hors ligne (figer) et analyse
    const res = [];
    for (const [k, mod] of ['jardin', 'paysage', 'fresque'].entries()) {
      await page.evaluate((k) => document.querySelectorAll('.track')[k].querySelector('.th-frz').click(), k);
      const done = await page.evaluate(() => SS.freeze.ready(240000));
      ok(done, `figer ${mod}`);
      res.push({ mod, segs: await page.evaluate((src) => {
        const analyse = eval('(' + src + ')');
        return [...SS.freeze._mem.values()].map(analyse);
      }, analyse.toString()) });
      await page.evaluate((k) => {
        document.querySelectorAll('.track')[k].querySelector('.th-frz').click();
        SS.freeze._mem.clear();
      }, k);
    }
    for (const r of res) {
      for (const [i, s] of r.segs.entries()) {
        if (!s) { ok(false, `${r.mod} segment ${i} : pas d'enregistrement`); continue; }
        console.log(`     ${r.mod} #${i} : ${s.sec} s, crête ${s.peak}, médiane ${s.median}, clics ${s.nClicks}, trous ${s.gaps.length}`);
        if (s.nClicks) console.log('       clics', JSON.stringify(s.clicks));
        if (s.gaps.length) console.log('       trous', JSON.stringify(s.gaps.slice(0, 10)));
        ok(s.nan === 0 && s.clipped === 0, `${r.mod} #${i} : pas de NaN ni de saturation (${s.clipped} saturés)`);
        ok(s.median > 0.001, `${r.mod} #${i} : le module sonne`);
        ok(s.nClicks === 0, `${r.mod} #${i} : pas de clic`);
        ok(s.gaps.length === 0, `${r.mod} #${i} : pas de coupure`);
      }
    }

    // 2. lecture en direct (référence : sous-alimentations à l'arrêt, sur la même durée)
    const idle0 = await page.evaluate(() => (SS.audio.probe().stats || {}).underrunEvents);
    await page.waitForTimeout(SECONDS * 1000);
    const idle1 = await page.evaluate(() => (SS.audio.probe().stats || {}).underrunEvents);
    await page.click('#play');
    const play0 = await page.evaluate(() => (SS.audio.probe().stats || {}).underrunEvents);
    const snap = () => page.evaluate(async () => {
      for (let i = 0; i < 4; i++) { gc(); await new Promise((r) => setTimeout(r, 50)); }
      const live = Object.fromEntries(window.__nodes);
      const h = SS.audio.probe ? SS.audio.probe() : {};
      return { total: Object.values(live).reduce((a, b) => a + b, 0), live, stats: h.stats, events: (h.events || []).map((e) => e.kind + ':' + e.label), clipped: h.clipped, peak: h.out && h.out.peak };
    });
    await page.waitForTimeout((SECONDS / 2) * 1000);
    const a = await snap();
    await page.waitForTimeout((SECONDS / 2) * 1000);
    const b = await snap();
    console.log('     nœuds vivants', a.total, '→', b.total, JSON.stringify(b.live));
    console.log('     sortie', JSON.stringify({ stats: b.stats, clipped: b.clipped, peak: b.peak }));
    ok(b.total < a.total * 1.25 + 40, `pas de fuite de nœuds (${a.total} → ${b.total})`);
    ok(![...a.events, ...b.events].some((e) => /crash|bad/.test(e)), 'aucun événement de santé ' + [...a.events, ...b.events].join(' '));
    if (b.stats && b.stats.underrunEvents != null) { const idle = idle1 - idle0, play = b.stats.underrunEvents - play0; console.log(`     sous-alimentations : ${idle} à l'arrêt, ${play} en lecture (${SECONDS} s chacun)`); ok(play <= idle + 3, 'pas plus de sous-alimentations en lecture qu’à l’arrêt'); }
    await page.click('#play');
    ok(!errs.length, 'aucune erreur JS ' + errs.join(' / '));
  } finally {
    await browser.close();
    server.close();
  }
})();
