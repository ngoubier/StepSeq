/*
 * Recherche de fuites de nœuds audio pendant la lecture en boucle.
 *   node tests/e2e/node-leak.js            (LEAK_SECONDS=40 par défaut)
 *
 * Chaque nœud Web Audio créé par la page est suivi (FinalizationRegistry). Un nœud que le navigateur garde en vie
 * (source qui joue, AudioWorklet qui renvoie true, nœud encore branché à un nœud vivant…) n'est jamais ramassé.
 * On joue en boucle une chanson qui touche tout le moteur (filtres 12/24 dB, ladder, SEM, pulse/PWM, LFO, bruit,
 * glide legato, batterie, Juno, piano, VCSL, VSCO, General MIDI, Dirt-Samples, chorus, delay, reverb, envois plate / hall /
 * écho / cosmos, inserts EQ / compresseur / limiteur, automation de tranche, sidechain ; Master avec VCF, effets et mastering),
 * puis on compare les nœuds vivants (après ramasse-miettes) à mi-parcours et à la fin. Sans fuite, le nombre
 * reste stable ; avec une fuite, il grandit avec le nombre de notes jouées.
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
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};
const SECONDS = +process.env.LEAK_SECONDS || 40;

// suivi des nœuds, injecté avant le chargement de la page
function tracker() {
  const live = new Map(); // type -> nombre de nœuds pas encore ramassés
  let made = 0;
  const reg = new FinalizationRegistry((type) => live.set(type, live.get(type) - 1));
  const track = (node, type) => {
    made++;
    live.set(type, (live.get(type) || 0) + 1);
    reg.register(node, type);
    return node;
  };
  const proto = BaseAudioContext.prototype;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (!/^create(?!Buffer$|PeriodicWave$)/.test(name) || typeof proto[name] !== 'function') continue;
    const orig = proto[name];
    proto[name] = function (...a) {
      return track(orig.apply(this, a), name.slice(6));
    };
  }
  const W = window.AudioWorkletNode;
  window.AudioWorkletNode = class extends W {
    constructor(ctx, name, opts) {
      super(ctx, name, opts);
      track(this, 'Worklet:' + name);
    }
  };
  window.__nodes = { live, made: () => made };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  // échantillons General MIDI et Dirt-Samples : servis par GitHub, à travers le proxy de l'environnement s'il y en a un
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'],
    ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}),
  });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: !!proxy });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const ev = (steps, notes, len = 1) => steps.map((step) => ({ step, len, notes, vel: 0.8 }));
    const all16 = [...Array(16).keys()];
    const fx = (o) => ({ chorus: 0, delay: 0, room: 0, ...o });
    const song = {
      format: 'stepseq', version: 1, title: 'Fuites', tempo: 160, bars: 1,
      tracks: [
        { id: 'kick', type: 'drum', name: 'Kick', source: 'tdm', machine: 'RolandTR808', sound: 'bd', volume: 0.7, steps: all16.map((i) => (i % 4 ? 0 : 1)) },
        { id: 'arp', type: 'instrument', name: 'Arp ladder', family: 'synth', instrument: 'syn_stranger', category: 'synth', volume: 0.4, events: ev(all16, [60]), fx: fx({ chorus: 0.3, delay: 0.3, sendHall: 0.4, sendSpace: 0.3 }), auto: { filter: { 0: -0.5, 15: 0.5 }, volume: { 0: 1, 8: 0.6 } } },
        { id: 'sem', type: 'instrument', name: 'SEM', family: 'bass', instrument: 'syn_funkbass', category: 'bass', volume: 0.4, events: ev([0, 2, 4, 6, 8, 10, 12, 14], [36]), fx: fx({ room: 0.3, scSource: 'kick', scDepth: 0.6, scRelease: 0.2 }) },
        { id: 'glide', type: 'instrument', name: 'Glide', family: 'bass', instrument: 'syn_moogbass', category: 'bass', volume: 0.3, events: ev([0, 3, 6, 9, 12], [40, 43], 4), fx: fx({ sendEcho: 0.3, sendPlate: 0.3 }) },
        { id: 'pwm', type: 'instrument', name: 'PWM', family: 'bass', instrument: 'syn_pwmbass', category: 'bass', volume: 0.3, events: ev([1, 5, 9, 13], [48]) },
        { id: 'kal', type: 'instrument', name: 'Kalimba', family: 'synth', instrument: 'syn_synkalimba', category: 'synth', volume: 0.3, events: ev([2, 7, 11], [72, 76]) },
        { id: 'juno', type: 'instrument', name: 'Juno', family: 'analog', instrument: 'juno106', category: 'mono', volume: 0.3, events: ev([0, 8], [55, 59], 6), mix: { eq: { on: true, hp: { on: true, f: 80 } }, comp: { on: true }, lim: { on: true } } },
        // instruments à échantillons : piano, VCSL, VSCO (hébergés avec l'app), General MIDI et Dirt-Samples (réseau)
        { id: 'piano', type: 'instrument', name: 'Piano', family: 'keys', instrument: 'piano', category: 'keys', volume: 0.3, events: ev([0, 4, 8, 12], [60, 64, 67]), fx: fx({ room: 0.4 }) },
        { id: 'organ', type: 'instrument', name: 'Orgue VCSL', family: 'organ', instrument: 'vcsl_organ_full', category: 'keys', volume: 0.2, events: ev([2, 10], [55, 62], 2) },
        { id: 'vln', type: 'instrument', name: 'Violons VSCO', family: 'strings', instrument: 'vsco_violins', category: 'strings', volume: 0.2, events: ev([0, 6, 12], [67, 72], 3), fx: fx({ sendPlate: 0.3 }) },
        { id: 'gm', type: 'instrument', name: 'Piano GM', family: 'keys', instrument: 'gm_piano', category: 'keys', volume: 0.2, events: ev([3, 7, 11, 15], [72]), fx: fx({ delay: 0.2 }) },
        { id: 'dirt', type: 'instrument', name: 'Basse Dirt', family: 'bass', instrument: 'dirt_jvbass', category: 'bass', volume: 0.2, events: ev([1, 9], [36]) },
      ],
      // Master : VCF, effets (saturation, chorus, reverb) et mastering allumés
      master: { mix: { vcf: { on: true, slope: 24, hp: { f: 30, res: 3 }, lp: { f: 16000, res: 3 } } }, mastering: { on: true }, effects: { on: true } },
      scenes: [], song: [],
    };
    await page.addInitScript(tracker);
    await page.addInitScript((p) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('stepseq.autosave', JSON.stringify(p));
        sessionStorage.setItem('seeded', '1');
      }
    }, song);
    await page.goto(`http://localhost:${server.address().port}/index.html`);
    await page.click('#play');
    await page.waitForFunction(() => SS.audio.isPlaying());

    const snapshot = () =>
      page.evaluate(async () => {
        for (let i = 0; i < 4; i++) {
          gc();
          await new Promise((r) => setTimeout(r, 50));
        }
        const a = SS.audio.health ? SS.audio.health() : {};
        return { live: Object.fromEntries(window.__nodes.live), made: window.__nodes.made(), filters: SS.filters.aliveCount ? SS.filters.aliveCount() : 0, voices: a.scheduledVoices };
      });
    await page.waitForTimeout(5000); // tout est construit (tranches, retours, Juno)
    const a = await snapshot();
    // mode allégé et allègements ciblés du mode Diagnostic, allumés puis rétablis 3 fois (débranchent et rebranchent)
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 3; i++) {
        SS.audio.setLight(true);
        await wait(600);
        SS.audio.setLight(false);
        SS.audio.setRelief({ track: 'arp' }, { cut: 'delay' });
        SS.audio.setRelief({ track: 'arp' }, { cut: 'chorus' });
        SS.audio.setRelief({ track: 'sem' }, { roomSize: 0.5 });
        SS.audio.setRelief({ ret: 'hall' }, { cut: true });
        SS.audio.setRelief({ ret: 'space' }, { cut: true });
        SS.audio.setRelief({ juno: true }, { eco: true });
        await wait(600);
        SS.audio.clearRelief();
        await wait(300);
      }
    });
    await page.waitForTimeout(Math.max(0, SECONDS - 10) * 1000);
    const b = await snapshot();
    // chaque piste a-t-elle vraiment sonné ? (un échantillon pas chargé ne crée aucun nœud : il ne serait pas testé)
    const silent = await page.evaluate(async () => {
      const ids = ['kick', 'arp', 'sem', 'glide', 'pwm', 'kal', 'juno', 'piano', 'organ', 'vln', 'gm', 'dirt'];
      const peak = Object.fromEntries(ids.map((id) => [id, 0]));
      for (let i = 0; i < 60; i++) {
        ids.forEach((id) => {
          const l = SS.audio.levels(id);
          if (l && l.peak > peak[id]) peak[id] = l.peak;
        });
        await new Promise((r) => setTimeout(r, 50));
      }
      return ids.filter((id) => !(peak[id] > 0.001));
    });
    ok(!silent.length, 'toutes les pistes sonnent' + (silent.length ? ' (muettes : ' + silent.join(', ') + ')' : ''));
    const total = (s) => Object.values(s.live).reduce((x, y) => x + y, 0);
    console.log(`nœuds créés : ${a.made} → ${b.made} ; vivants : ${total(a)} → ${total(b)} ; filtres ladder/SEM ${a.filters} → ${b.filters}`);
    const grew = Object.keys(b.live)
      .map((k) => [k, (a.live[k] || 0), b.live[k]])
      .filter(([, x, y]) => y > x + 20)
      .map(([k, x, y]) => `${k} ${x}→${y}`);
    if (grew.length) console.log('en hausse : ' + grew.join(', '));
    ok(b.made - a.made > 1000, `beaucoup de nœuds créés pendant la lecture (${b.made - a.made})`);
    // marge : les voix programmées à l'avance et le ramasse-miettes qui n'a pas encore tout pris
    ok(total(b) < total(a) + 150, `pas de fuite : nœuds vivants ${total(a)} → ${total(b)}`);
    ok(b.filters < 60, `filtres ladder/SEM libérés (${b.filters} vivants)`);
    // modules remplacés après un plantage (Reverb Cosmos, Mastering) : l'ancien s'arrête sur « dispose »
    const replaced = await page.evaluate(async () => {
      const ac = new AudioContext();
      await Promise.all([SS.space.load(ac), SS.mastering.load(ac)]);
      const count = () => ['Worklet:ss-space', 'Worklet:ss-master'].map((k) => window.__nodes.live.get(k) || 0);
      const settle = async () => {
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 150));
          gc();
        }
      };
      const run = async (dispose) => {
        await settle();
        const before = count();
        (() => {
          for (const make of [SS.space.create, SS.mastering.create])
            for (let i = 0; i < 3; i++) {
              const n = make(ac);
              n.connect(ac.destination);
              n.disconnect();
              if (dispose) n.port.postMessage('dispose');
            }
        })();
        await settle();
        return count().map((v, i) => v - before[i]);
      };
      const res = { kept: await run(false), freed: await run(true) };
      ac.close();
      return res;
    });
    ok(replaced.kept.every((n) => n === 3), `contrôle : sans « dispose », les modules restent vivants (${replaced.kept})`);
    ok(replaced.freed.every((n) => n === 0), `Reverb Cosmos et Mastering remplacés : libérés après « dispose » (${replaced.freed})`);
    // 2e méthode, indépendante des nœuds : rendu hors temps réel de la même boucle pendant RENDER_SECONDS.
    // Tout coût qui grandit avec le temps (nœuds, réglages programmés qui s'empilent sur les bus, la Hall, le
    // Master…) ralentit la fin du rendu par rapport au début.
    const RENDER = +process.env.RENDER_SECONDS || 180;
    await page.evaluate(() => SS.audio.stop());
    const speed = await page.evaluate(async (seconds) => {
      const p = SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave')));
      const scene = p.current || p.scenes[0].id;
      p.song = [{ scene, repeat: Math.ceil(seconds / 1.5) }];
      const marks = [];
      const t0 = performance.now();
      await SS.render.renderOnce(JSON.stringify(p), { seconds, sampleRate: 48000, seed: 1 }, { onProgress: (f) => marks.push([f * seconds, performance.now() - t0]) });
      // millisecondes de calcul par seconde de son, sur une tranche [a, b] de la chanson
      const rate = (a, b) => {
        const x = marks.find((m) => m[0] >= a);
        const y = marks.find((m) => m[0] >= b) || marks[marks.length - 1];
        return (y[1] - x[1]) / (y[0] - x[0]);
      };
      return { start: rate(seconds * 0.1, seconds * 0.3), end: rate(seconds * 0.75, seconds * 0.95), total: performance.now() - t0 };
    }, RENDER);
    console.log(`rendu de ${RENDER} s : ${Math.round(speed.total)} ms ; calcul par seconde de son : début ${speed.start.toFixed(1)} ms, fin ${speed.end.toFixed(1)} ms`);
    ok(speed.end < speed.start * 1.5 + 2, `la fin du rendu n'est pas plus lente que le début (×${(speed.end / speed.start).toFixed(2)})`);
    ok(!errors.length, 'aucune erreur de page' + (errors.length ? ' : ' + errors[0] : ''));
  } finally {
    await browser.close();
    server.close();
  }
})();
