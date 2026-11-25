/*
 * Changements de tonalité et de mode entre scènes (js/keychange.js), fenêtre « Changement » de l'étape Accords.
 *   node --test tests/keychange.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'keychange.js'].forEach((f) => require('../js/' + f));
const H = globalThis.SS.harmony;
const K = globalThis.SS.keyChange;
const C = { tonic: 'C', mode: 'major' };
const AM = { tonic: 'A', mode: 'minor' };
const names = (key, grid) => grid.map((c) => H.gridChord(key, c.degree, c.type, c.acc || 0, c.bass || 0).name);

test('arrivées des gestes depuis Do majeur et La mineur', () => {
  const to = (from, id) => H.label(K.find(from, id).to);
  assert.equal(to(C, 'demi'), 'Ré♭ majeur');
  assert.equal(to(C, 'ton'), 'Ré majeur');
  assert.equal(to(C, 'pivot'), 'Sol majeur');
  assert.equal(to(C, 'rel'), 'La mineur');
  assert.equal(to(C, 'par'), 'Do mineur');
  assert.equal(to(C, 'lyd'), 'Do lydien');
  assert.equal(to(C, 'loin'), 'La♭ majeur');
  assert.equal(to(AM, 'relM'), 'Do majeur');
  assert.equal(to(AM, 'dor'), 'La dorien');
  assert.equal(to(AM, 'loin'), 'Fa mineur');
  assert.equal(to({ tonic: 'B', mode: 'minor' }, 'demi'), 'Do mineur');
});

test('grilles des gestes : celles du document, dans la tonalité d’arrivée', () => {
  const g = (from, id) => { const x = K.find(from, id); return names(x.to, K.fitGrid(x.grid, 4, 16)).join(' '); };
  assert.equal(g(C, 'pivot'), 'Am D7 G C D7');
  assert.equal(g(C, 'rel'), 'Dm E7 Am F E7');
  assert.equal(g(C, 'mixo'), 'C B♭/C F/C C');
  assert.equal(g(C, 'lyd'), 'C D/C D/C C');
  assert.equal(g(C, 'loin'), 'A♭ D♭ E♭7 A♭');
  assert.equal(g(AM, 'dor'), 'Am D/A D/A Am');
  assert.equal(g(AM, 'phr'), 'Am B♭/A Am B♭/A Am');
  // une mesure partagée : deux accords de 8 pas
  const x = K.fitGrid(K.find(C, 'pivot').grid, 4, 16);
  assert.deepEqual(x.slice(-2).map((c) => [c.step, c.len]), [[48, 8], [56, 8]]);
});

test('un geste qui ne change rien est écarté (dorien depuis dorien)', () => {
  const ids = K.gestures({ tonic: 'D', mode: 'dorian' }).map((g) => g.id);
  assert.ok(!ids.includes('dor'));
  assert.ok(ids.includes('demi'));
});

test('adapter ses accords au nouveau mode : même degré, couleur du mode', () => {
  const grid = K.fitGrid([[[0, 'maj']], [[4, 'maj']], [[5, 'min']], [[3, 'maj']]], 4, 16);
  const cm = { tonic: 'C', mode: 'minor' };
  assert.equal(names(cm, K.adaptGrid(grid, C, cm)).join(' '), 'Cm Gm A♭ Fm');
  // même mode : rien ne bouge (la transposition se fait par les degrés)
  assert.deepEqual(K.adaptGrid(grid, C, { tonic: 'D', mode: 'major' }), grid);
  // la dominante V7 reste dominante
  const v7 = [{ step: 0, len: 16, degree: 4, type: '7', acc: 0 }];
  assert.equal(names(cm, K.adaptGrid(v7, C, cm))[0], 'G7');
});

test('passage préparé : la dominante de la nouvelle tonalité au dernier temps', () => {
  const grid = K.fitGrid([[[0, 'maj']], [[5, 'min']], [[3, 'maj']], [[4, 'maj']]], 4, 16);
  const D = { tonic: 'D', mode: 'major' };
  const out = K.withPrep(grid, C, D, 64, 4);
  assert.deepEqual(names(C, out), ['C', 'Am', 'F', 'G', 'A7']);
  assert.deepEqual(out.slice(-2).map((c) => [c.step, c.len]), [[48, 12], [60, 4]]);
  // vers Ré♭ : A♭7 (♭VI de Do)
  assert.equal(names(C, K.withPrep(grid, C, { tonic: 'D♭', mode: 'major' }, 64, 4)).pop(), 'A♭7');
});

test('pastilles des changements', () => {
  assert.equal(K.describe(C, { tonic: 'D♭', mode: 'major' }), '↗ ½ ton');
  assert.equal(K.describe(C, { tonic: 'D', mode: 'major' }), '↗ 1 ton');
  assert.equal(K.describe(C, { tonic: 'B', mode: 'major' }), '↘ ½ ton');
  assert.equal(K.describe(C, AM), 'relatif');
  assert.equal(K.describe(AM, C), 'relatif');
  assert.equal(K.describe(C, { tonic: 'C', mode: 'lydian' }), 'lydien');
  assert.equal(K.describe(C, { tonic: 'A♭', mode: 'major' }), '→ La♭ majeur');
  assert.equal(K.describe(C, { tonic: 'C', mode: 'major' }), null);
});

test('essai A/B : fin de phrase IV → iv → I (emprunt modal)', () => {
  const grid = K.fitGrid([[[0, 'maj']], [[5, 'min']], [[3, 'maj']], [[4, '7']]], 4, 16);
  const r = H.transformGrid('borrow', grid, C, 64);
  assert.equal(names(C, r.grid).join(' '), 'C F Fm C');
  assert.ok(r.changed > 0);
  // en mineur : rien (l'emprunt vient du mineur)
  assert.equal(H.transformGrid('borrow', grid, AM, 64).changed, 0);
});

test('essai A/B : II7 avant le V (tonicisation)', () => {
  const grid = K.fitGrid([[[0, 'maj']], [[3, 'maj']], [[4, 'maj']], [[0, 'maj']]], 4, 16);
  const r = H.transformGrid('secdom', grid, C, 64);
  assert.equal(names(C, r.grid).join(' '), 'C F D7 G C');
  assert.deepEqual(r.grid.slice(1, 3).map((c) => [c.step, c.len]), [[16, 8], [24, 8]]);
  // accord court (2 temps) : remplacé en entier
  const short = [{ step: 0, len: 8, degree: 0, type: 'maj', acc: 0 }, { step: 8, len: 4, degree: 3, type: 'maj', acc: 0 }, { step: 12, len: 4, degree: 4, type: '7', acc: 0 }];
  assert.equal(names(C, H.transformGrid('secdom', short, C, 16).grid).join(' '), 'C D7 G7');
});

test('Vérifier : la nouvelle tonalité est-elle confirmée ?', () => {
  const D = { tonic: 'D', mode: 'major' };
  const prev = K.withPrep(K.fitGrid([[[0, 'maj']], [[5, 'min']], [[3, 'maj']], [[4, 'maj']]], 4, 16), C, D, 64, 4);
  const grid = K.fitGrid([[[0, 'maj']], [[4, 'maj']], [[5, 'min']], [[3, 'maj']]], 4, 16);
  const ok = K.confirmChecks({ prevKey: C, key: D, grid, prevGrid: prev });
  assert.equal(ok[0].kind, 'info');
  assert.ok(ok.slice(1).every((x) => x.kind === 'ok'), JSON.stringify(ok));
  // sans préparation ni cadence, et pas sur la tonique : deux conseils
  const bad = K.confirmChecks({ prevKey: C, key: D, grid: K.fitGrid([[[5, 'min']], [[3, 'maj']]], 2, 16), prevGrid: [] });
  assert.equal(bad.filter((x) => x.kind === 'tip').length, 2);
  // mode : la note caractéristique (Fa♯ en Do lydien, portée par D/C)
  const LYD = { tonic: 'C', mode: 'lydian' };
  const lyd = K.confirmChecks({ prevKey: C, key: LYD, grid: K.fitGrid(K.find(C, 'lyd').grid, 4, 16) });
  assert.ok(lyd.some((x) => x.kind === 'ok' && /Fa♯/.test(x.text)), JSON.stringify(lyd));
  assert.deepEqual(K.confirmChecks({ prevKey: C, key: C, grid }), []);
});
