/*
 * « Détecter » de la fenêtre Key (js/harmony.js : detect, sceneChords) : tonalité estimée et accords reconnus.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/sounds.js');
require('../js/harmony.js');
const H = globalThis.SS.harmony;

// projet sans scènes : une piste par liste d'accords (un accord par mesure de 16 pas)
const proj = (...tracks) => ({
  bars: 8,
  tracks: tracks.map((chords, i) => ({ id: 't' + i, type: 'instrument', category: 'chord', events: chords.map((notes, j) => ({ step: j * 16, len: 16, notes, vel: 0.8 })) })),
});
const C = [60, 64, 67], Am = [57, 60, 64], F = [53, 57, 60], G = [55, 59, 62], Dm = [50, 53, 57], E = [52, 56, 59];
const names = (d) => d.chords.map((c) => H.chordName(d.key, c.id));

test('C – Am – F – G : Do majeur, accords reconnus avec leurs degrés', () => {
  const d = H.detect(proj([C, Am, F, G]));
  assert.deepEqual(d.key, { tonic: 'C', mode: 'major' });
  assert.deepEqual(names(d), ['C', 'Am', 'F', 'G']);
  assert.deepEqual(d.chords.map((c) => H.analyzeChord(d.key, c.id).numeral), ['I', 'vi', 'IV', 'V']);
  assert.deepEqual(d.second.key, { tonic: 'A', mode: 'minor' });
});

test('Am – F – C – G : les mêmes notes, mais la grille part de La mineur', () => {
  const d = H.detect(proj([Am, F, C, G]));
  assert.deepEqual(d.key, { tonic: 'A', mode: 'minor' });
});

test('Am – Dm – E – Am : La mineur (V majeur emprunté au mineur harmonique)', () => {
  const d = H.detect(proj([Am, Dm, E, Am]));
  assert.deepEqual(d.key, { tonic: 'A', mode: 'minor' });
  assert.deepEqual(names(d), ['Am', 'Dm', 'E', 'Am']);
});

test('le même accord répété ne compte qu\'une fois d\'affilée', () => {
  const d = H.detect(proj([C, C, F, F, C]));
  assert.deepEqual(d.chords.map((c) => c.step), [0, 32, 64]);
  assert.deepEqual(names(d), ['C', 'F', 'C']);
});

test('aucune note : null ; notes seules : tonalité sans accords', () => {
  assert.equal(H.detect(proj([])), null);
  const mel = { bars: 1, tracks: [{ id: 'm', type: 'instrument', category: 'mono', events: [62, 64, 65, 67, 69, 70, 72, 74].map((n, i) => ({ step: i * 2, len: 2, notes: [n], vel: 1 })) }] };
  const d = H.detect(mel);
  assert.ok(d && d.key);
  assert.equal(d.chords.length, 0);
});
