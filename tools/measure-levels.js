/*
 * Calibrage des niveaux : mesure le volume perçu (LUFS, pondération K de BS.1770) de chaque instrument et de chaque
 * élément de batterie proposés par Band, joué par StepSeq dans un contexte audio hors temps réel, sans aucun
 * traitement (tranche à plat, volume 1). Écrit js/band-levels.js, que Band utilise pour régler le volume des pistes
 * (js/bandmix.js) : chaque instrument part du même niveau, quel que soit le son choisi.
 *
 *   node tools/measure-levels.js          (Playwright + Chromium ; connexion internet pour charger les sons)
 *
 * Matériau joué (vélocités proches de celles des chansons Band) :
 *   basse : 8 croches (Do2, Sol2…) ; accords : triade Do4–Mi4–Sol4 tenue ; mélodie : 4 noires autour de Sol4 ;
 *   arpège : doubles-croches Do4–Mi4–Sol4–Do5 ; batterie : un coup à vélocité 0,9 (fenêtre de 400 ms).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };
const SLOT = 2.5; // s par instrument
const HIT = 0.7; // s par coup de batterie
const CHUNK = 60;

globalThis.window = globalThis;
['dirt.js', 'sounds.js', 'band-presets.js'].forEach((f) => require(path.join(ROOT, 'js', f)));
const B = SS.Band;
const inst = new Map();
const drums = new Map();
B.STYLES.forEach((st) =>
  st.presets.forEach((p) =>
    p.musicians.forEach((mu) => {
      const role = B.ROLES[mu.role];
      if (mu.kits) {
        const pieces = [...mu.pieces, ...B.EXTRA_PIECES[mu.role]];
        mu.kits.forEach((k) => pieces.forEach((pc) => drums.set(`${k}|${pc}`, { kit: k, piece: pc })));
      } else {
        const cat = mu.cat || role.cat;
        mu.pick.forEach((tok) => inst.set(`${mu.role}|${tok}|${cat}`, { role: mu.role, tok, cat }));
      }
    })
  )
);
const jobs = [...[...inst.entries()].map(([k, v]) => ({ key: k, ...v, kind: 'inst' })), ...[...drums.entries()].map(([k, v]) => ({ key: k, ...v, kind: 'drum' }))];

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function measure(browser, port, list) {
  const secs = list.reduce((a, j) => a + (j.kind === 'drum' ? HIT : SLOT), 0) + 1;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.warn('page :', e.message));
  await page.addInitScript((secs) => {
    class Off extends OfflineAudioContext {
      constructor() {
        super(2, Math.ceil(secs * 44100), 44100);
      }
      resume() {
        return Promise.resolve();
      }
    }
    window.AudioContext = Off;
    window.webkitAudioContext = Off;
  }, secs);
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(800);
  const res = await page.evaluate(
    async ({ list, SLOT, HIT }) => {
      const A = SS.audio;
      const ctx = A.ensureCtx();
      const proj = SS.newProject();
      proj.tempo = 120;
      const flat = JSON.parse(JSON.stringify(SS.MASTER_DEFAULTS));
      flat.volume = 1;
      flat.mix.comp.on = false;
      flat.mix.lim.on = false;
      proj.master = flat;
      A.applyMaster(proj);
      const BASS = [36, 36, 43, 36, 38, 36, 43, 41];
      const MEL = [67, 69, 72, 74, 72, 69, 67, 64];
      const material = (j) => {
        if (j.role === 'bass') return BASS.map((m, i) => ({ midi: m, at: i * 0.25, dur: 0.22, vel: 0.85 }));
        if (j.role === 'arp') return Array.from({ length: 16 }, (_, i) => ({ midi: [60, 64, 67, 72][i % 4], at: i * 0.125, dur: 0.11, vel: 0.7 }));
        if (j.cat === 'chord') return [60, 64, 67].map((m) => ({ midi: m, at: 0, dur: 1.8, vel: 0.65 * 0.8 }));
        // mélodie en noires : les sons à attaque lente (flûtes, voix, cordes) atteignent leur niveau
        return MEL.slice(0, 4).map((m, i) => ({ midi: m, at: i * 0.5, dur: 0.47, vel: 0.75 }));
      };
      let t = 0.5;
      const plan = list.map((j) => {
        const opts = j.kind === 'drum' ? SS.Band.pieceOpts(j.kit, j.piece).opts : SS.Band.choiceOpts(j.tok, j.cat);
        const track = SS.newTrack(opts, proj);
        track.volume = 1;
        if (j.kind !== 'drum') track.events = material(j).map((n) => ({ step: 0, len: 1, notes: [n.midi], vel: n.vel }));
        const slot = { j, track, start: t, len: j.kind === 'drum' ? 0.4 : 2.0 };
        t += j.kind === 'drum' ? HIT : SLOT;
        return slot;
      });
      await Promise.all(plan.map((s) => A.prepareTrack(s.track).catch(() => {})));
      await new Promise((r) => setTimeout(r, 500));
      const calls = [];
      plan.forEach((s) => {
        A.ensureBus(s.track);
        if (s.j.kind === 'drum') calls.push(A.playDrum(s.track, s.start, 0.9));
        else material(s.j).forEach((n) => calls.push(A.playNote(s.track, n.midi, s.start + n.at, n.dur, n.vel)));
      });
      await Promise.all(calls.map((c) => Promise.resolve(c).catch(() => {})));
      const buf = await ctx.startRendering();
      // pondération K (BS.1770) à 44,1 kHz
      const sr = 44100;
      const coef = () => {
        let K = Math.tan((Math.PI * 1681.974450955533) / sr);
        let Q = 0.7071752369554196;
        const Vh = Math.pow(10, 3.999843853973347 / 20);
        const Vb = Math.pow(Vh, 0.4996667741545416);
        let a0 = 1 + K / Q + K * K;
        const s1 = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
        K = Math.tan((Math.PI * 38.13547087602444) / sr);
        Q = 0.5003270373238773;
        a0 = 1 + K / Q + K * K;
        const s2 = [1 / a0, -2 / a0, 1 / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
        return [s1, s2];
      };
      const filt = (x) => {
        const y = new Float32Array(x.length);
        y.set(x);
        for (const [b0, b1, b2, a1, a2] of coef()) {
          let z1 = 0;
          let z2 = 0;
          for (let i = 0; i < y.length; i++) {
            const v = y[i];
            const o = b0 * v + z1;
            z1 = b1 * v - a1 * o + z2;
            z2 = b2 * v - a2 * o;
            y[i] = o;
          }
        }
        return y;
      };
      const L = filt(buf.getChannelData(0));
      const R = filt(buf.getChannelData(1));
      const rawL = buf.getChannelData(0);
      const rawR = buf.getChannelData(1);
      return plan.map((s) => {
        const a = Math.floor(s.start * sr);
        const b = Math.floor((s.start + s.len) * sr);
        let e = 0;
        let pk = 0;
        for (let i = a; i < b; i++) {
          e += L[i] * L[i] + R[i] * R[i];
          pk = Math.max(pk, Math.abs(rawL[i]), Math.abs(rawR[i]));
        }
        e /= b - a;
        return { key: s.j.key, kind: s.j.kind, lufs: e > 0 ? +(-0.691 + 10 * Math.log10(e)).toFixed(1) : null, peak: pk > 0 ? +(20 * Math.log10(pk)).toFixed(1) : null };
      });
    },
    { list, SLOT, HIT }
  );
  await page.close();
  return res;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const out = { inst: {}, drum: {} };
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const part = await measure(browser, server.address().port, jobs.slice(i, i + CHUNK));
    part.forEach((r) => {
      if (r.lufs == null || r.lufs < -60) return console.warn('muet :', r.key);
      out[r.kind][r.key] = [r.lufs, r.peak];
    });
    console.log(`${Math.min(i + CHUNK, jobs.length)} / ${jobs.length}`);
  }
  await browser.close();
  server.close();
  const fmt = (o) => Object.keys(o).sort().map((k) => `    ${JSON.stringify(k)}: [${o[k].join(', ')}],`).join('\n');
  fs.writeFileSync(
    path.join(ROOT, 'js', 'band-levels.js'),
    `/*
 * Niveaux mesurés des instruments et des éléments de batterie proposés par Band (généré par tools/measure-levels.js).
 * [volume perçu en LUFS, crête en dBFS], joués sans traitement (volume 1) ; instruments : « rôle|choix|catégorie »,
 * batterie : « kit|élément ». js/bandmix.js s'en sert pour que chaque piste parte du même niveau.
 */
window.SS = window.SS || {};
SS.BAND_LEVELS = {
  inst: {
${fmt(out.inst)}
  },
  drum: {
${fmt(out.drum)}
  },
};
`
  );
  console.log('js/band-levels.js :', Object.keys(out.inst).length, 'instruments,', Object.keys(out.drum).length, 'éléments de batterie');
})();
