/*
 * Pistes Ambient (js/ambient.js) : réglages par module, courbes sur la chanson, notes de l'accord, position dans
 * la chanson, harmonie de la scène.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

globalThis.window = globalThis;
const load = (f) => (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
load('sounds.js');
load('project.js');
load('harmony.js');
load('chords.js');
load('ambient.js');
const A = SS.ambient;

test('réglages : défauts du module, réglages propres gardés par module', () => {
  const t = { type: 'instrument', family: 'ambient', instrument: 'jardin', ambient: { rand: 0.2, jardin: { gDens: 30 }, paysage: { wVol: 0.9 } } };
  const s = A.settings(t);
  assert.equal(s.mod, 'jardin');
  assert.equal(s.follow, true);
  assert.equal(s.rand, 0.2);
  assert.equal(s.p.gDens, 30);
  assert.equal(s.p.gVol, 0.55);
  t.instrument = 'paysage';
  assert.equal(A.settings(t).p.wVol, 0.9);
  assert.equal(A.settings(t).p.seeds.length, 5);
  t.instrument = 'fresque';
  const f = A.settings({ ...t, ambient: { fresque: { curves: { tape: new Array(A.PN).fill(0) } } } });
  assert.equal(f.p.curves.tape[10], 0);
  assert.equal(f.p.curves.spec.length, A.PN); // les autres couches gardent leur courbe par défaut
  assert.equal(SS.isAmbient(t), true);
  assert.equal(SS.isAmbient({ type: 'instrument', family: 'pads' }), false);
});

test('courbes : interpolation, pas de courbe = 1', () => {
  assert.equal(A.curveAt(null, 0.3), 1);
  assert.equal(A.curveAt([0, 1], 0.25), 0.25);
  assert.equal(A.curveAt([0, 1, 0], 0.5), 1);
  assert.equal(A.curveAt([0.2, 0.4], 2), 0.4);
});

test('notes : les classes de l’accord dans l’intervalle', () => {
  assert.deepEqual(A.pool([2, 6, 9], 60, 72), [62, 66, 69]);
  assert.deepEqual(A.pool([], 60, 61), [60]);
});

test('position dans la chanson : bloc, répétition, pas', () => {
  const p = { timeSig: [4, 4], bars: 4, current: 'a', scenes: [{ id: 'a', bars: 4 }, { id: 'b', bars: 2 }], song: [{ scene: 'a', repeat: 2 }, { scene: 'b', repeat: 1 }] };
  // chanson : a 64 pas × 2 + b 32 pas = 160 pas
  assert.equal(A.songFrac(p, { index: 0, rep: 0 }, 0), 0);
  assert.equal(A.songFrac(p, { index: 0, rep: 1 }, 32), (64 + 32) / 160);
  p.current = 'b';
  p.bars = 2;
  assert.equal(A.songFrac(p, { index: 1, rep: 0 }, 16), (128 + 16) / 160);
  // en boucle (pas de chanson qui joue) : la place de la scène dans l'arrangement
  assert.equal(A.songFrac(p, null, 0), 128 / 160);
  assert.equal(A.songFrac({ ...p, song: [] }, null, 16), 0.5);
});

test('part de la chanson occupée par la scène en cours (première apparition, un tour)', () => {
  const p = { timeSig: [4, 4], bars: 4, current: 'a', scenes: [{ id: 'a', bars: 4 }, { id: 'b', bars: 2 }], song: [{ scene: 'a', repeat: 2 }, { scene: 'b', repeat: 1 }] };
  assert.deepEqual(A.sceneSpan(p), [0, 64 / 160]);
  p.current = 'b';
  p.bars = 2;
  assert.deepEqual(A.sceneSpan(p), [128 / 160, 1]);
  assert.deepEqual(A.sceneSpan({ ...p, song: [] }), [0, 1]);
  assert.deepEqual(A.sceneSpan({ ...p, current: 'x' }), [0, 1]);
});

test('harmonie : accord de la grille au pas, sinon la gamme de la scène', () => {
  const key = { tonic: 'D', mode: 'major' };
  const p = { timeSig: [4, 4], bars: 4, current: 's', scenes: [{ id: 's', bars: 4, key, grid: { chords: [{ step: 0, len: 32, degree: 0, type: 'maj' }, { step: 32, len: 32, degree: 5, type: 'min' }] } }] };
  const h0 = A.harmonyAt(p, 0);
  assert.deepEqual(h0.pcs, [2, 6, 9]); // Ré
  assert.equal(h0.root, 2);
  const h1 = A.harmonyAt(p, 40);
  assert.deepEqual(h1.pcs, [11, 2, 6]); // Si mineur
  assert.notEqual(h0.key, h1.key);
  assert.equal(h1.scale.length, 7);
  p.scenes[0].grid = null;
  const h2 = A.harmonyAt(p, 0);
  assert.equal(h2.root, 2); // pas d'accord : la tonique de la gamme
  assert.ok(h2.pcs.includes(6) && h2.pcs.includes(9));
});
