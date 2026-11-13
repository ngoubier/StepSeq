/*
 * Conditions de déclenchement des notes (ev.cond) et des pas de batterie (track.cond) :
 * règles, modèle, scènes, export MIDI.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const T = 120; // ticks par double-croche à l'export

const at = (pass, extra = {}) => ({ id: 'x', step: 0, block: 0, pass, ...extra });
const passes = (c, n = 8) => Array.from({ length: n }, (_, i) => SS.trigOk(c, at(i)));

test('A:B : joué au passage A de chaque groupe de B', () => {
  assert.deepEqual(passes('1:4'), [true, false, false, false, true, false, false, false]);
  assert.deepEqual(passes('4:4'), [false, false, false, true, false, false, false, true]);
  assert.deepEqual(passes('2:2'), [false, true, false, true, false, true, false, true]);
  assert.deepEqual(passes('8:8'), [false, false, false, false, false, false, false, true]);
});

test('1er / Pas 1er, et absence de condition', () => {
  assert.deepEqual(passes('first', 3), [true, false, false]);
  assert.deepEqual(passes('!first', 3), [false, true, true]);
  assert.deepEqual(passes(null, 3), [true, true, true]);
  assert.deepEqual(passes(undefined, 3), [true, true, true]);
});

test('probabilité : reproductible, proche du pourcentage, varie selon le pas et le passage', () => {
  for (const pc of [75, 50, 25, 10]) {
    let hits = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (SS.trigOk('p' + pc, at(i, { step: i % 16 }))) hits++;
    assert.ok(Math.abs(hits / N - pc / 100) < 0.04, `${pc} % : ${hits / N}`);
  }
  assert.deepEqual(passes('p50', 32), passes('p50', 32), 'même tirage à chaque lecture');
  const a = passes('p50', 32).join();
  const b = Array.from({ length: 32 }, (_, i) => SS.trigOk('p50', at(i, { step: 3 }))).join();
  assert.notEqual(a, b, 'un autre pas tire autrement');
});

test('passage : boucle et mode chanson', () => {
  assert.equal(SS.trigPass(0, 16), 0);
  assert.equal(SS.trigPass(35, 16), 2);
  // mode chanson : le compteur repart à 0 à chaque répétition du bloc ; une piste de 12 pas dans une scène de
  // 16 fait 2 tours par répétition (le 2e est coupé)
  assert.equal(SS.trigPass(0, 16, 1, 16), 1);
  assert.equal(SS.trigPass(13, 12, 1, 16), 3);
});

test('nettoyage : conditions inconnues retirées, seulement sur des pas allumés', () => {
  assert.equal(SS.cleanCond({ cond: '1:4' }).cond, '1:4');
  assert.ok(!('cond' in SS.cleanCond({ cond: '9:9' })));
  assert.ok(!('cond' in SS.cleanCond({ cond: 42 })));
  const t = { steps: [1, 0, 1] };
  SS.setDrumCond(t, 0, 'p50');
  SS.setDrumCond(t, 1, '1:2'); // pas éteint
  SS.setDrumCond(t, 2, 'nimporte');
  SS.cleanDrumConds(t);
  assert.deepEqual(t.cond, { 0: 'p50' });
  assert.equal(SS.drumCond(t, 1), null);
  SS.setDrumCond(t, 0, null);
  assert.ok(!('cond' in t));
});

function project() {
  const p = SS.newProject();
  const drum = SS.newTrack({ type: 'drum', name: 'Crash', color: '#fff', source: 'tdm', sound: 'cr', machine: 'RolandTR909' }, p);
  const bass = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_sub', name: 'Bass', color: '#fff' }, p);
  p.tracks = [drum, bass];
  drum.steps[0] = 1;
  SS.setDrumCond(drum, 0, '1:4');
  bass.events = [
    { step: 0, len: 2, notes: [36], vel: 1 },
    { step: 8, len: 2, notes: [43], vel: 1, cond: '!first' },
  ];
  SS.commitScene(p);
  return p;
}

test('scènes, recopie de mesures et fichier : les conditions suivent les pas', () => {
  const p = project();
  const id = p.current;
  assert.deepEqual(p.scenes[0].data[p.tracks[0].id].cond, { 0: '1:4' });
  const other = SS.addScene(p, { copy: false });
  SS.loadScene(p, other);
  assert.ok(!('cond' in p.tracks[0]), 'scène vide : pas de condition');
  SS.loadScene(p, id);
  assert.equal(SS.drumCond(p.tracks[0], 0), '1:4');
  p.bars = 2;
  SS.resizeProject(p);
  SS.repeatBars(p, 1);
  assert.equal(SS.drumCond(p.tracks[0], 16), '1:4', 'recopiée dans la 2e mesure');
  const back = SS.normalizeProject(JSON.parse(SS.serialize(p)));
  assert.equal(SS.drumCond(back.tracks[0], 16), '1:4');
  assert.equal(back.tracks[1].events.find((e) => e.step === 8).cond, '!first');
});

test('export MIDI : scène répétée 8 fois, conditions jugées passage par passage', () => {
  const m = SS.midiFile.parse(SS.midi.exportProject(project(), { range: 'scene', loops: 8, swing: false }).bytes);
  const on = (trk) => trk.filter((e) => e.type === 'note' && !e.off).map((e) => e.tick / T);
  assert.deepEqual(on(m.tracks[1]), [0, 64], 'crash 1:4 : passages 1 et 5');
  const bass = on(m.tracks[2]);
  assert.equal(bass.filter((s) => s % 16 === 0).length, 8, 'note sans condition : à chaque passage');
  assert.deepEqual(bass.filter((s) => s % 16 === 8), [24, 40, 56, 72, 88, 104, 120], 'Pas 1er : tous sauf le premier');
});

test('export MIDI en mode chanson : passage compté par répétition du bloc', () => {
  const p = project();
  p.song = [{ scene: p.current, repeat: 4 }, { scene: p.current, repeat: 4 }];
  const m = SS.midiFile.parse(SS.midi.exportProject(p, { range: 'song', swing: false }).bytes);
  const crash = m.tracks[1];
  assert.deepEqual(crash.filter((e) => e.type === 'note' && !e.off).map((e) => e.tick / T), [0, 64], 'au début de chaque bloc');
});
