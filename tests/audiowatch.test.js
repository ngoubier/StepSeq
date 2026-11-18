/* Surveillance audio : détection et localisation des problèmes (js/audiowatch.js, fonctions pures). */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function load(files) {
  const c = vm.createContext({ window: null, console });
  c.window = c;
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), c);
  return c.SS;
}
const SS = load(['js/project.js', 'js/sounds.js', 'js/audiowatch.js']);
const W = SS.audioWatch;
const m = (peak, bad = 0) => ({ peak, rms: peak / 2, bad });
const names = new Map([['a', 'Basse'], ['b', 'Lead']]);

/** Relevé d'une lecture saine, modifiable. */
function snap(over = {}) {
  return {
    state: 'running', time: 0, playing: true, voices: 4, juno: 0, mastering: true, clipped: 0,
    tracks: [{ id: 'a', bus: m(0.4), delay: null, reverb: null }, { id: 'b', bus: m(0.3), delay: { ...m(0.1), feedback: 0.4 }, reverb: null }],
    returns: { plate: m(0), hall: m(0.05), echo: m(0), space: m(0) },
    masterIn: m(0.6), out: m(0.5), events: [], scheduling: { lateSteps: 0, maxLateMs: 0 }, stats: null, render: null, ts: null,
    ...over,
  };
}
function run(st, snaps, env = {}) {
  let t = 0;
  const out = [];
  for (const s of snaps) {
    t += 250;
    out.push(W.assess(st, { ...s, time: t / 1000 }, { now: t, names, ...env }));
  }
  return out;
}

test('lecture saine : aucun incident, verdict ok', () => {
  const st = W.newState();
  run(st, Array.from({ length: 20 }, () => snap()));
  assert.equal(st.incidents.length, 0);
  assert.equal(W.verdict(st, 5000), 'ok');
});

test('signal invalide : l\'origine est le delay de la piste, pas le Master, et on répare', () => {
  const st = W.newState();
  const bad = snap({
    tracks: [{ id: 'a', bus: m(0.4), delay: null, reverb: null }, { id: 'b', bus: m(0.3), delay: { ...m(0, 1024), feedback: 0.92 }, reverb: null }],
    masterIn: m(0, 1024), out: m(0),
  });
  const [r] = run(st, [bad]);
  assert.deepEqual([...r.actions], ['repair']);
  const inc = st.incidents[0];
  assert.equal(inc.kind, 'nan');
  assert.equal(inc.trackId, 'b');
  assert.match(inc.detail, /Delay de « Lead »/);
  assert.match(inc.advice, /feedback 92 %/);
  assert.equal(W.verdict(st, 300), 'bad');
});

test('emballement d\'un delay : détecté tôt quand la crête grimpe, avec le conseil de baisser le feedback', () => {
  const st = W.newState();
  const rising = [0.6, 0.9, 1.3, 1.9].map((p) => snap({ tracks: [{ id: 'b', bus: m(0.3), delay: { ...m(p), feedback: 0.9 }, reverb: null }] }));
  run(st, rising);
  const inc = st.incidents.find((x) => x.kind === 'runaway');
  assert.ok(inc, 'emballement signalé');
  assert.match(inc.title, /Delay de « Lead »/);
  assert.match(inc.advice, /feedback 90 %/);
  assert.match(inc.detail, /continue de monter/);
});

test('un même problème qui dure est cumulé au lieu d\'inonder la liste', () => {
  const st = W.newState();
  const loud = snap({ tracks: [{ id: 'a', bus: m(6), delay: null, reverb: null }] });
  run(st, Array.from({ length: 12 }, () => loud));
  const list = st.incidents.filter((x) => x.kind === 'runaway');
  assert.equal(list.length, 1);
  assert.equal(list[0].count, 12);
  assert.match(list[0].title, /Piste « Basse »/);
});

test('Master saturé : signale la piste la plus forte', () => {
  const st = W.newState();
  const hot = snap({ masterIn: m(3), tracks: [{ id: 'a', bus: m(2.5), delay: null, reverb: null }, { id: 'b', bus: m(0.8), delay: null, reverb: null }] });
  run(st, [hot, hot, hot]);
  const inc = st.incidents.find((x) => x.kind === 'hot');
  assert.ok(inc);
  assert.match(inc.advice, /« Basse »/);
});

test('écrêtage en sortie compté par le mastering (chaque échantillon)', () => {
  const st = W.newState();
  run(st, [snap({ clipped: 0 }), snap({ clipped: 500 })]);
  assert.equal(st.counters.clipped, 500);
  assert.ok(st.incidents.some((x) => x.kind === 'clip'));
});

test('décrochages : statistiques du navigateur, charge mesurée, puis horloge audio en retard', () => {
  const load = [{ label: 'Reverb Cosmos partagée', cost: 4 }, { label: '« Lead » (synthé Juno)', cost: 5 }];
  let st = W.newState();
  run(st, [snap({ stats: { underrunEvents: 2 } }), snap({ stats: { underrunEvents: 5 } })], { load });
  assert.equal(st.counters.underruns, 3);
  const inc = st.incidents.find((x) => x.kind === 'underrun');
  assert.match(inc.advice, /Reverb Cosmos partagée/);

  st = W.newState();
  run(st, [snap({ render: { average: 0.7, peak: 1, underrun: 0.02 } })]);
  assert.equal(st.incidents[0].kind, 'underrun');
  assert.equal(st.counters.load.average, 0.7);

  // sans API : horloge audio qui n'avance qu'à 90 % du temps réel pendant 2 s
  st = W.newState();
  const snaps = [];
  for (let i = 0; i <= 16; i++) snaps.push(snap({ ts: { context: i * 0.25 * 0.9, perf: i * 250 } }));
  run(st, snaps);
  assert.ok(st.incidents.some((x) => x.kind === 'underrun' && /90 %/.test(x.detail)));
  assert.ok(st.counters.clockRatio < 0.95);

  // horloge normale : rien
  st = W.newState();
  run(st, Array.from({ length: 17 }, (_, i) => snap({ ts: { context: i * 0.25, perf: i * 250 } })));
  assert.equal(st.incidents.length, 0);
});

test('son coupé en sortie alors que le Master reçoit du signal : réparation', () => {
  const st = W.newState();
  const mute = snap({ masterIn: m(0.5), out: m(0) });
  const res = run(st, Array.from({ length: 10 }, () => mute), { masterVolume: 0.8 });
  assert.ok(res.some((r) => r.actions.includes('repair')));
  assert.ok(st.incidents.some((x) => x.kind === 'silent'));
  // fader du Master à zéro : silence voulu
  const st2 = W.newState();
  run(st2, Array.from({ length: 10 }, () => mute), { masterVolume: 0 });
  assert.equal(st2.incidents.length, 0);
});

test('modules audio : plantage (réparation), signal neutralisé, sortie interrompue (relance)', () => {
  const st = W.newState();
  const [r] = run(st, [snap({ events: [{ kind: 'crash', label: 'Synthé Juno', trackId: 'a', engine: 'juno' }, { kind: 'bad', label: 'Mastering', area: 'master' }, { kind: 'state', label: 'interrupted' }] })]);
  assert.deepEqual([...r.actions].sort(), ['repair', 'resume']);
  assert.ok(st.incidents.some((x) => x.kind === 'crash' && /« Basse »/.test(x.title)));
  assert.ok(st.incidents.some((x) => x.kind === 'bad'));
  assert.ok(st.incidents.some((x) => x.kind === 'state'));
});

test('retards de programmation : seuls les nouveaux retards comptent', () => {
  const st = W.newState();
  run(st, [snap({ scheduling: { lateSteps: 0, maxLateMs: 0 } }), snap({ scheduling: { lateSteps: 3, maxLateMs: 140 } }), snap({ scheduling: { lateSteps: 3, maxLateMs: 140 } })]);
  const inc = st.incidents.filter((x) => x.kind === 'late');
  assert.equal(inc.length, 1);
  assert.equal(inc[0].count, 1);
  assert.match(inc[0].detail, /3 pas en retard/);
});

test('poids estimé : Juno, longues reverbs et Cosmos passent devant une piste de batterie sèche', () => {
  const project = {
    tempo: 120,
    tracks: [
      { id: 'd', type: 'drum', name: 'Kick', fx: {} },
      { id: 'j', type: 'instrument', family: 'analog', instrument: 'juno106', name: 'Nappe', fx: { sendSpace: 0.5 } },
      { id: 'r', type: 'instrument', name: 'Piano', fx: { room: 0.4, roomSize: 7 } },
      { id: 'm', type: 'instrument', name: 'Muette', mute: true, fx: { room: 1, roomSize: 10 } },
    ],
    master: { mastering: { on: true } },
  };
  const load = W.estimateLoad(project);
  assert.equal(load[0].trackId, 'j');
  assert.match(load[0].label, /synthé Juno/);
  assert.ok(load.findIndex((x) => /Cosmos/.test(x.label)) < load.findIndex((x) => x.trackId === 'd'));
  assert.ok(load.some((x) => /reverb 7,0 s/.test(x.label)));
  assert.ok(!load.some((x) => x.trackId === 'm'), 'piste muette ignorée');
  assert.ok(Math.abs(load.reduce((n, x) => n + x.share, 0) - 1) < 1e-9);
});

test('surcharge : les décrochages et les retards répétés déclenchent le mode allégé', () => {
  const st = W.newState();
  run(st, Array.from({ length: 4 }, () => snap()));
  assert.equal(W.overload(st, 1000), null, 'lecture saine : rien à alléger');
  const r = run(W.newState(), [snap({ render: { average: 0.9, peak: 1, underrun: 0.02 } })]);
  assert.ok(r[0].added.some((x) => x.kind === 'underrun'));
  const st2 = W.newState();
  run(st2, [snap({ render: { average: 0.9, peak: 1, underrun: 0.02 } })]);
  assert.equal(W.overload(st2, 250).kind, 'underrun');
  const st5 = W.newState();
  run(st5, [snap({ render: { average: 0.7, peak: 0.99, underrun: 0 } })]);
  assert.equal(W.overload(st5, 250), null, 'pointe de charge sans décrochage : on ne coupe rien');
  run(st5, [snap({ render: { average: 0.9, peak: 1, underrun: 0.03 } })]);
  assert.equal(W.overload(st5, 250).level, 'bad', 'la pointe devenue décrochage aggrave l\'incident');
  // notes en retard : un retard isolé (ouverture d'une fenêtre) ne suffit pas, trois de suite oui
  const st3 = W.newState();
  const late = (n) => snap({ scheduling: { lateSteps: n, maxLateMs: 60 } });
  run(st3, [late(0), late(1)]);
  assert.equal(W.overload(st3, 500), null);
  const st4 = W.newState();
  run(st4, [late(0), late(1), late(2), late(3)]);
  assert.equal(W.overload(st4, 1000).kind, 'late');
});

/* ---------------- Mode Diagnostic : allègement pas à pas ---------------- */

function diagProject() {
  return {
    tempo: 120,
    tracks: [
      { id: 'a', type: 'instrument', name: 'Pad', fx: { room: 0.5, roomSize: 4, delay: 0.3 } },
      { id: 'b', type: 'drum', name: 'Batterie', fx: { chorus: 0.4 } },
      { id: 'c', type: 'instrument', name: 'Lead', fx: { sendSpace: 0.4 } },
    ],
    returns: { space: { shimmer: 0.5 } },
  };
}

test('reliefSteps : l\'élément le plus lourd d\'abord, une marche à la fois', () => {
  const p = diagProject();
  const steps = W.reliefSteps(p, {});
  assert.equal(steps[0].key, 'ret:space'); // Cosmos avec shimmer : le plus lourd
  assert.deepEqual({ ...steps[0].patch }, { shimmer: 0 });
  const room = steps.find((x) => x.key === 'room:a');
  assert.deepEqual({ ...room.patch }, { roomSize: 2 }); // 4 s -> 2 s
  assert.ok(/raccourcie/.test(room.label));
  // shimmer déjà coupé : la Cosmos est coupée à l'étape suivante
  const s2 = W.reliefSteps(p, { returns: { space: { shimmer: 0 } } });
  assert.deepEqual({ ...s2[0].patch }, { cut: true });
  assert.equal(s2[0].cut, true);
});

test('reliefSteps : reverb raccourcie jusqu\'à 0,8 s, puis coupée ; rien pour une piste muette', () => {
  const p = diagProject();
  const r1 = W.reliefSteps(p, { tracks: { a: { roomSize: 2, cut: {} } }, returns: { space: { cut: true } } }).find((x) => x.key === 'room:a');
  assert.deepEqual({ ...r1.patch }, { roomSize: 1 });
  const r2 = W.reliefSteps(p, { tracks: { a: { roomSize: 1, cut: {} } } }).find((x) => x.key === 'room:a');
  assert.deepEqual({ ...r2.patch }, { cut: 'room' });
  const r3 = W.reliefSteps(p, { tracks: { a: { roomSize: 1, cut: { room: true, delay: true } } } });
  assert.ok(!r3.some((x) => x.target.track === 'a'));
  p.tracks[0].mute = true;
  assert.ok(!W.reliefSteps(p, {}).some((x) => x.target.track === 'a'));
});

test('diagDecide : attente après un allègement, étape suivante, puis mode allégé en dernier recours', () => {
  const step = { key: 'x' };
  assert.equal(W.diagDecide({ done: [], lastAt: null }, 1000, [step]).what, 'step');
  assert.equal(W.diagDecide({ done: [{}], lastAt: 1000 }, 1000 + W.CFG.settle - 1, [step]).what, 'wait');
  assert.equal(W.diagDecide({ done: [{}], lastAt: 1000 }, 1000 + W.CFG.settle, [step]).what, 'step');
  assert.equal(W.diagDecide({ done: [{}], lastAt: 1000 }, 1000 + W.CFG.settle, []).what, 'light');
  assert.equal(W.diagDecide({ done: new Array(W.CFG.maxSteps).fill({}), lastAt: 0 }, 99999, [step]).what, 'light');
});

test('mode allégé : jugé inefficace quand les décrochages continuent effets coupés', () => {
  const L = { at: 1000, underruns: 5 };
  assert.equal(W.lightVerdict(null, 99999, 50), 'wait');
  assert.equal(W.lightVerdict(L, 1000 + W.CFG.lightCheck - 1, 50), 'wait');
  assert.equal(W.lightVerdict(L, 1000 + W.CFG.lightCheck, 5 + W.CFG.lightUseless), 'useless');
  assert.equal(W.lightVerdict(L, 1000 + W.CFG.lightCheck, 5 + W.CFG.lightUseless - 1), 'ok');
  assert.equal(W.lightVerdict(L, 1000 + W.CFG.lightCheck, 5 + W.CFG.lightUseless, 3), 'synths');
  assert.equal(W.lightVerdict(L, 1000 + W.CFG.lightCheck, 5 + W.CFG.lightUseless - 1, 3), 'ok');
});

test('décrochages hors moteur : le conseil ne parle plus du processeur', () => {
  const st = W.newState();
  const s = (n, t) => snap({ stats: { underrunEvents: n }, time: t });
  W.assess(st, s(0, 0), { now: 0 });
  W.assess(st, s(3, 0.25), { now: 250, external: true });
  const inc = st.incidents.find((x) => x.kind === 'underrun');
  assert.ok(inc && /sortie audio de l'appareil/.test(inc.advice) && /Bluetooth/.test(inc.advice));
});

test('mode Diagnostic : les synthés Juno passent en mode éco en premier', () => {
  const p = SS.newProject();
  p.tracks = [
    { id: 'j1', name: 'Pad', type: 'instrument', family: 'analog' },
    { id: 'j2', name: 'Basse', type: 'instrument', family: 'analog' },
    { id: 'm', name: 'Muet', type: 'instrument', family: 'analog', mute: true },
  ];
  const steps = W.reliefSteps(p, {});
  assert.equal(steps[0].key, 'juno');
  assert.deepEqual({ ...steps[0].target }, { juno: true });
  assert.match(steps[0].label, /2 pistes/);
  assert.ok(!W.reliefSteps(p, { juno: true }).some((x) => x.key === 'juno'));
});
