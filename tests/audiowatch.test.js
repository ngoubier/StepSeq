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
