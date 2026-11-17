/*
 * Batterie de l'assistant : grille d'édition (edits : toutes les pièces, 1 / 2 / 4 mesures, ratchets, conditions)
 * et progression de la montée (parts.drums.build).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;

const TR = [
  ...['bd', 'sd', 'cp', 'hh', 'oh', 'cr', 'rim', 'rd'].map((s) => ({ id: 'drums:' + s, type: 'drum', sound: s, band: { key: 'drums:' + s } })),
  ...['bass', 'pad'].map((r) => ({ id: r, type: 'instrument', category: 'chord', band: { key: r } })),
];
const SPEC = { key: 'C minor', groove: 'synthpop', form: 'a b', sections: {
  a: { bars: 8, chords: 'i | VI | III | VII', drums: 'main', bass: '8', pad: 'sustain' },
  b: { bars: 8, chords: 'i | VI | III | VII', drums: 'build', bass: '8', pad: 'sustain' },
} };
const build = (parts) => SS.bandSong.build(SPEC, 'test', TR, { parts });
const steps = (res, sc, id) => res.scenes[sc].data['drums:' + id];
const hits = (d) => d.steps.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);

test('grille : une piste par pièce, 2 mesures, ratchet et condition', () => {
  const edits = { bars: 2, K: 'x---x---x---x---' + 'x-------x-------', S: '-'.repeat(16) + '----x-------x---', rim: '-o--------------' + '-'.repeat(16), rat: { rim: { 1: 3 } }, cond: { rim: { 1: 'p50' } } };
  ['H', 'O', 'C', 'cr', 'rd'].forEach((k) => (edits[k] = '-'.repeat(32)));
  const res = build({ a: { drums: { edits } } });
  const bd = steps(res, 0, 'bd');
  assert.deepEqual(hits(bd).slice(0, 7), [0, 4, 8, 12, 16, 24, 32]); // 2 mesures qui se répètent sur les 8 mesures
  assert.deepEqual(hits(steps(res, 0, 'sd')).slice(0, 3), [20, 28, 52]);
  const rim = steps(res, 0, 'rim');
  assert.equal(rim.rat[1], 3);
  assert.equal(rim.cond[1], 'p50');
  assert.equal(rim.rat[33], 3);
  assert.equal(hits(steps(res, 0, 'hh')).length, 0);
});

test('ancien format edits (K S C H O) : inchangé', () => {
  const edits = { K: 'x---x---x---x---', S: '----x-------x---', C: '-'.repeat(16), H: 'x-x-x-x-x-x-x-x-', O: '-'.repeat(16) };
  const res = build({ a: { drums: { edits } } });
  assert.deepEqual(hits(steps(res, 0, 'bd')).slice(0, 4), [0, 4, 8, 12]);
  assert.deepEqual(hits(steps(res, 0, 'sd')).slice(0, 2), [4, 12]);
});

test('montée : préréglages de progression', () => {
  const L = SS.bandSong.buildLevels;
  assert.deepEqual(L('lin', 8), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(L('fast', 8), [1, 2, 3, 4, 4, 4, 4, 4]);
  assert.deepEqual(L('late', 8), [1, 1, 1, 1, 1, 1, 3, 4]);
  const roll = (preset) => steps(build({ b: { drums: { build: { preset } } } }), 1, 'sd');
  const lin = roll('lin');
  assert.equal(hits(lin).filter((i) => i < 16).length, 4); // noires
  assert.equal(hits(lin).filter((i) => i >= 64 && i < 80).length, 16); // doubles-croches (mesure 5)
  assert.equal(lin.rat[7 * 16 + 2], 3); // triples : croche en ratchet x3
  assert.equal(hits(roll('late')).filter((i) => i >= 16 * 5 && i < 16 * 6).length, 4);
});

test('montée : mesure verrouillée, et sans réglage la chanson est celle d\'avant', () => {
  const lock = { 0: { lanes: { sd: 'xxxx------------' } } };
  const res = build({ b: { drums: { build: { preset: 'fast', lock } } } });
  assert.deepEqual(hits(steps(res, 1, 'sd')).filter((i) => i < 16), [0, 1, 2, 3]);
  const plain = SS.bandSong.build(SPEC, 'test', TR, {});
  const none = build({ b: { drums: { fill: undefined } } });
  assert.deepEqual(plain.scenes[1].data['drums:sd'], none.scenes[1].data['drums:sd']);
});
