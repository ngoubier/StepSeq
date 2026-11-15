/*
 * Transformations mélodiques d'une sélection (js/transform.js) : inversion, rétrograde, durées ×2 / ×½, autre mode.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'project.js', 'harmony.js', 'transform.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const X = SS.transform;

const C_MAJ = { tonic: 'C', mode: 'major' };
const mono = (notes) => ({ category: 'mono', events: notes.map(([step, m, len = 1]) => ({ step, len, notes: [m], vel: 0.8 })) });
const pitches = (evs) => evs.slice().sort((a, b) => a.step - b.step).map((e) => e.notes[0]);

test('degrés : aller-retour exact, notes hors de la gamme comprises', () => {
  const pcs = SS.harmony.scale({ tonic: 'E♭', mode: 'minor' }).map((d) => d.pc);
  for (let m = 24; m < 100; m++) {
    const d = X.toDeg(m, pcs);
    assert.equal(X.fromDeg(d.idx, d.off, pcs), m);
  }
});

test('inversion dans la gamme : Do Ré Mi Fa → Do Si La Sol (Do majeur)', () => {
  const t = mono([[0, 60], [1, 62], [2, 64], [3, 65]]);
  const r = X.run(t, t.events, { kind: 'invert' }, { key: C_MAJ, n: 16 });
  assert.deepEqual(pitches(r.events), [60, 59, 57, 55]);
  assert.equal(r.dropped, 0);
});

test('inversion chromatique sans tonalité : miroir exact en demi-tons', () => {
  const t = mono([[0, 60], [1, 63], [2, 67]]);
  const r = X.run(t, t.events, { kind: 'invert' }, { key: null, n: 16 });
  assert.deepEqual(pitches(r.events), [60, 57, 53]);
});

test('rétrograde : la phrase à l’envers, durées gardées, micro-décalage inversé', () => {
  const t = mono([[0, 60, 2], [2, 62, 1], [3, 64, 3]]);
  t.events[2].shift = 0.2;
  const r = X.run(t, t.events, { kind: 'retrograde' }, { n: 16 });
  const evs = r.events.slice().sort((a, b) => a.step - b.step);
  assert.deepEqual(evs.map((e) => [e.step, e.notes[0], e.len]), [[0, 64, 3], [3, 62, 1], [4, 60, 2]]);
  assert.equal(evs[0].shift, -0.2);
});

test('durées ×2 puis ×½ : retour à l’identique', () => {
  const t = mono([[4, 60, 1], [5, 62, 2], [7, 64, 1]]);
  const r2 = X.run(t, t.events, { kind: 'stretch', factor: 2 }, { n: 32 });
  assert.deepEqual(r2.events.map((e) => [e.step, e.len]), [[4, 2], [6, 4], [10, 2]]);
  const t2 = { category: 'mono', events: r2.events };
  const r1 = X.run(t2, t2.events, { kind: 'stretch', factor: 0.5 }, { n: 32 });
  assert.deepEqual(r1.events.map((e) => [e.step, e.len]), [[4, 1], [5, 2], [7, 1]]);
});

test('durées ×2 : les notes au-delà de la boucle sont retirées et comptées', () => {
  const t = mono([[0, 60], [6, 62], [12, 64]]);
  const r = X.run(t, t.events, { kind: 'stretch', factor: 2 }, { n: 16 });
  assert.deepEqual(r.events.map((e) => e.step), [0, 12]);
  assert.equal(r.dropped, 1);
});

test('durées ×½ : deux notes qui tombent sur le même pas et la même hauteur, la première reste', () => {
  const t = mono([[0, 60], [1, 60]]);
  const r = X.run(t, t.events, { kind: 'stretch', factor: 0.5 }, { n: 16 });
  assert.equal(r.events.length, 1);
  assert.equal(r.dropped, 1);
});

test('notes non sélectionnées recouvertes : retirées ou raccourcies', () => {
  const t = mono([[0, 60, 2], [2, 62, 1], [3, 60, 4], [6, 60, 1]]);
  const sel = t.events.slice(0, 2);
  const r = X.run(t, sel, { kind: 'stretch', factor: 2 }, { n: 16 });
  // le Do (3, 4 pas) commence sous le nouveau Do (0, 4 pas) : retiré ; le Do du pas 6 reste
  const dos = r.events.filter((e) => e.notes[0] === 60).map((e) => [e.step, e.len]);
  assert.deepEqual(dos, [[0, 4], [6, 1]]);
});

test('autre mode : Do majeur → Do mineur (Mi → Mi♭, La → La♭, Si → Si♭), notes hors gamme gardées', () => {
  const t = mono([[0, 60], [1, 64], [2, 66], [3, 69], [4, 71]]);
  const r = X.run(t, t.events, { kind: 'mode', mode: 'minor' }, { key: C_MAJ, n: 16 });
  assert.deepEqual(pitches(r.events), [60, 63, 66, 68, 70]);
  assert.equal(X.run(t, t.events, { kind: 'mode', mode: 'minor' }, { key: null, n: 16 }), null);
});

test('accords : le mode change le type (Do majeur → Do mineur), l’inversion déplace l’accord dans la gamme', () => {
  const t = { category: 'chord', events: [{ step: 0, len: 4, notes: [60, 64, 67], vel: 0.7, chord: 'maj' }, { step: 4, len: 4, notes: [65, 69, 72], vel: 0.7, chord: 'maj' }] };
  const m = X.run(t, t.events, { kind: 'mode', mode: 'minor' }, { key: C_MAJ, n: 16 });
  assert.deepEqual(m.events.map((e) => [e.notes, e.chord]), [[[60, 63, 67], 'min'], [[65, 68, 72], 'min']]);
  // Do puis Fa (montée d'une quarte) -> Do puis Sol en dessous (descente d'une quarte) : Sol majeur dans Do majeur
  const inv = X.run(t, t.events, { kind: 'invert' }, { key: C_MAJ, n: 16 });
  assert.deepEqual(inv.events.map((e) => [e.notes, e.chord]), [[[60, 64, 67], 'maj'], [[55, 59, 62], 'maj']]);
});

test('la piste d’origine n’est pas modifiée (copies)', () => {
  const t = mono([[0, 60], [1, 62]]);
  const before = JSON.stringify(t);
  X.run(t, t.events, { kind: 'invert' }, { key: C_MAJ, n: 16 });
  X.run(t, t.events, { kind: 'retrograde' }, { n: 16 });
  assert.equal(JSON.stringify(t), before);
});
