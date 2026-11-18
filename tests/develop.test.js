/*
 * Développer le motif / section qui contraste (js/develop.js), onglet Mélodie de l'assistant.
 *   node --test tests/develop.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/develop.js');
const D = globalThis.SS.develop;

const C_MAJ = [0, 2, 4, 5, 7, 9, 11];
const A_MIN = [9, 11, 0, 2, 4, 5, 7];
// motif de 2 mesures en Do : Mi Sol La Sol | Mi (tenue)
const MOT = [
  { step: 0, len: 4, midi: 64, vel: 0.8 },
  { step: 4, len: 4, midi: 67, vel: 0.7 },
  { step: 8, len: 4, midi: 69, vel: 0.7 },
  { step: 12, len: 4, midi: 67, vel: 0.7 },
  { step: 16, len: 12, midi: 64, vel: 0.8 },
];
const inScale = (m, pcs) => pcs.includes(((m % 12) + 12) % 12);
const noOverlap = (ev) => ev.every((e, i) => i === 0 || ev[i - 1].step + ev[i - 1].len <= e.step);

test('motif : les notes de 2 mesures, ramenées au début ; motifBars', () => {
  const later = MOT.map((n) => ({ ...n, step: n.step + 32 }));
  assert.deepEqual(D.motif(later, 2).map((n) => n.step), [0, 4, 8, 12, 16]);
  assert.deepEqual(D.motifBars([...MOT, ...later], 8), [0, 2]);
});

test('continuations : quatre suites, 8 mesures, le motif en tête, notes dans la gamme', () => {
  const props = D.continuations(MOT, { pcs: C_MAJ, bars: 8, form: 'aaba' });
  assert.deepEqual(props.map((p) => p.id), ['sequence', 'answer', 'rhythm', 'augment']);
  for (const p of props) {
    assert.ok(p.events.every((e) => e.step >= 0 && e.step + e.len <= 128), p.id + ' : dans la scène');
    assert.deepEqual(p.events.slice(0, 5).map((e) => e.notes[0]), [64, 67, 69, 67, 64], p.id + ' : le motif ouvre la phrase');
    assert.ok(p.events.every((e) => inScale(e.notes[0], C_MAJ)), p.id + ' : notes de la gamme');
    assert.ok(noOverlap(p.events), p.id + ' : monophonique');
    assert.equal(p.events[p.events.length - 1].notes[0] % 12, 0, p.id + ' : la phrase finit sur la tonique');
  }
  const seq = props[0].events.filter((e) => e.step >= 32 && e.step < 64).map((e) => e.notes[0]);
  assert.deepEqual(seq, [62, 65, 67, 65, 62], 'séquence : un degré plus bas');
  const aug = props[3].events.filter((e) => e.step >= 32 && e.step < 64);
  assert.deepEqual(aug.map((e) => [e.step - 32, e.len]), [[0, 8], [8, 8], [16, 8], [24, 8]], 'augmentation : durées doublées');
});

test('variation rythmique : syncope sur les temps 2 et 4, mêmes notes', () => {
  const s = D._t.syncopate(MOT);
  assert.deepEqual(s.map((n) => n.midi), MOT.map((n) => n.midi));
  assert.deepEqual(s.map((n) => n.step), [0, 2, 8, 10, 16]);
  assert.ok(noOverlap(s.map((n) => ({ step: n.step, len: n.len }))));
});

test('formes : question / réponse, la première réponse est suspendue sur la dominante ; 16 mesures = la phrase deux fois', () => {
  const qa = D.continuations(MOT, { pcs: C_MAJ, bars: 8, form: 'qa' })[0];
  const q = qa.events.filter((e) => e.step < 64).pop();
  assert.equal(q.notes[0] % 12, 7, 'demi-cadence sur Sol');
  const long = D.continuations(MOT, { pcs: C_MAJ, bars: 16 })[0];
  assert.deepEqual(long.events.filter((e) => e.step >= 128).map((e) => e.notes[0]), long.events.filter((e) => e.step < 128).map((e) => e.notes[0]));
  assert.equal(D.continuations(MOT, { pcs: C_MAJ, bars: 4 })[0].parts.length, 2, '4 mesures : motif + suite');
  assert.deepEqual(D.continuations(MOT.slice(0, 1), { pcs: C_MAJ, bars: 8 }), [], 'une note ne fait pas un motif');
});

test('accords : une note longue sur un temps va sur la note de l’accord la plus proche (sauf le motif)', () => {
  const chordAt = (st) => (st >= 32 ? [2, 5, 9] : [0, 4, 7]); // Do puis Rém
  const p = D.continuations(MOT, { pcs: C_MAJ, bars: 4, chordAt })[1];
  assert.deepEqual(p.events.slice(0, 5).map((e) => e.notes[0]), [64, 67, 69, 67, 64], 'le motif reste tel quel');
  assert.ok(p.events.filter((e) => e.step >= 32 && e.step % 4 === 0 && e.len >= 4 && e.step < 60).every((e) => [2, 5, 9].includes(e.notes[0] % 12)), 'temps forts sur Rém');
});

test('contraste : trois mélodies pour une autre scène, dans sa tonalité, la première plus haute et plus longue', () => {
  const props = D.contrast(MOT, { pcs: C_MAJ, toPcs: A_MIN, bars: 8 });
  assert.deepEqual(props.map((p) => p.id), ['high', 'invert', 'dense']);
  for (const p of props) {
    assert.ok(p.events.length >= 4 && p.events.every((e) => e.step + e.len <= 128), p.id);
    assert.ok(p.events.every((e) => inScale(e.notes[0], A_MIN)), p.id + ' : gamme de la scène visée');
    assert.ok(noOverlap(p.events), p.id + ' : monophonique');
  }
  const hi = props[0].events;
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(avg(hi.map((e) => e.len)) > avg(MOT.map((n) => n.len)), 'notes plus longues');
  assert.ok(Math.max(...props[2].events.map((e) => e.step)) > 100, 'rythme serré : remplit la scène');
});
