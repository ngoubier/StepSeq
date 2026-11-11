/*
 * Grille d'accords de Harmo One (js/harmony.js : gridChord, gridPalette, gridFromEvents) et nouveaux types d'accords.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/sounds.js');
require('../js/harmony.js');
const H = globalThis.SS.harmony;

const Dm = { tonic: 'D', mode: 'minor' };
const C = { tonic: 'C', mode: 'major' };
const names = (row) => row.cells.map((c) => (c ? c.name : '·'));

test('palette simple de Ré mineur : 7 triades, puis V et vii° empruntés au mineur harmonique', () => {
  const P = H.gridPalette(Dm);
  assert.deepEqual(P.simple.map((c) => c.name), ['Dm', 'E°', 'F', 'Gm', 'Am', 'B♭', 'C', 'A', 'C♯°']);
  assert.deepEqual(P.simple.map((c) => c.numeral), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII', 'V', 'vii°']);
  assert.deepEqual(P.simple.map((c) => c.borrowed), [false, false, false, false, false, false, false, true, true]);
  assert.equal(P.simple[7].role.id, 'tension');
});

test('mode avancé : seuls les accords dont toutes les notes sont dans la tonalité', () => {
  const P = H.gridPalette(Dm);
  assert.deepEqual(P.cols.map((c) => c.label), ['7', '7 (dom.)', '9', 'add9', 'sus2', 'sus4', '7sus4', '6']);
  const row = (n) => names(P.rows.find((r) => r.chord.name === n));
  assert.deepEqual(row('Dm'), ['Dm7', '·', 'Dm9', 'Dm(add9)', 'Dsus2', 'Dsus4', 'D7sus4', '·']); // Dm6 : Si bécarre
  assert.deepEqual(row('E°'), ['Em7♭5', '·', '·', '·', '·', '·', '·', '·']);
  assert.deepEqual(row('C'), ['·', 'C7', 'C9', 'Cadd9', 'Csus2', 'Csus4', 'C7sus4', 'C6']);
  assert.deepEqual(row('A'), ['·', 'A7', 'A7♭9', '·', '·', '·', '·', '·']); // Asus4 est déjà dans la ligne de Am
  assert.deepEqual(row('C♯°'), ['C♯°7', '·', '·', '·', '·', '·', '·', '·']);
});

test('Do majeur : pas d’emprunts, V7 et V9 diatoniques, viiø7', () => {
  const P = H.gridPalette(C);
  assert.equal(P.rows.length, 7);
  assert.equal(P.simple.length, 7);
  const G = P.rows[4];
  assert.deepEqual(names(G).slice(0, 3), ['·', 'G7', 'G9']);
  assert.equal(G.cells[1].numeral, 'V7');
  assert.equal(P.rows[6].cells[0].name, 'Bm7♭5');
  assert.equal(P.rows[6].cells[0].numeral, 'viiø7');
});

test('un mode (Ré dorien) : familles repos / couleur / mouvement', () => {
  const P = H.gridPalette({ tonic: 'D', mode: 'dorian' });
  assert.deepEqual([...new Set(P.simple.map((c) => c.role.id))].sort(), ['color', 'prep', 'repos']);
});

test('accords de la grille : notes épelées, la grille suit la tonalité', () => {
  assert.deepEqual(H.gridChord(Dm, 4, '7b9').notes, ['A', 'C♯', 'E', 'G', 'B♭']);
  assert.deepEqual(H.gridChord(Dm, 6, 'dim7', 1).notes, ['C♯', 'E', 'G', 'B♭']);
  assert.equal(H.gridChord({ tonic: 'E', mode: 'minor' }, 2, 'maj7').name, 'Gmaj7');
  assert.equal(H.gridChord(C, 6, 'dim', 1).name, 'B°'); // l'emprunt ne s'applique qu'en mineur naturel
});

test('reprendre les accords d’une piste : degrés retrouvés, accords hors tonalité comptés', () => {
  const ev = (step, len, root, type) => ({ step, len, notes: SS.chordNotes(root, type), chord: type });
  const r = H.gridFromEvents(Dm, [ev(0, 16, 50, 'min'), ev(16, 16, 46, 'maj7'), ev(32, 8, 57, '7'), ev(40, 8, 61, 'dim'), ev(48, 16, 51, 'maj')]);
  assert.deepEqual(r.chords.map((c) => [c.step, c.len, c.degree, c.type, c.acc]), [
    [0, 16, 0, 'min', 0],
    [16, 16, 5, 'maj7', 0],
    [32, 8, 4, '7', 0],
    [40, 8, 6, 'dim', 1],
  ]);
  assert.equal(r.skipped, 1); // E♭ majeur
});

test('identify garde les noms connus : Do–Mi–Sol–La reste Am7/C, et les couleurs avancées sont reconnues', () => {
  assert.deepEqual(H.identify([48, 52, 55, 57]), { rootPc: 9, type: 'm7', bassPc: 0 });
  assert.equal(H.identify([45, 49, 52, 55, 58]).type, '7b9');
  assert.equal(H.identify([50, 53, 57, 60, 64]).type, 'm9');
});

test('générateur : une basse sur une grille de C6 joue Do (le type posé fait foi)', () => {
  const evs = [{ step: 0, len: 16, notes: SS.chordNotes(60, '6'), chord: '6' }];
  const bass = H.generate(evs, { kind: 'bass-whole', octave: 2, spb: 16, beat: 4, key: C, length: 16 });
  assert.equal(bass[0].notes[0] % 12, 0);
});

test('propositions d’émotion → grille : emprunts ♭VI, ♭VII, sensible', () => {
  const C = { tonic: 'C', mode: 'major' };
  const Am = { tonic: 'A', mode: 'minor' };
  const g = H.toGridChord(C, H.makeChord(C, 5, 'maj', -1), 5);
  assert.deepEqual(g, { degree: 5, type: 'maj', acc: -1 });
  assert.equal(H.gridChord(C, g.degree, g.type, g.acc).name, 'A♭');
  assert.equal(H.gridChord(C, g.degree, g.type, g.acc).numeral, '♭VI');
  assert.deepEqual(H.toGridChord(Am, H.makeChord(Am, 6, 'dim', 1), 6), { degree: 6, type: 'dim', acc: 1 });
  assert.equal(H.gridChord(Am, 1, 'maj', -1).name, 'B♭'); // ♭II napolitain
  assert.equal(H.gridChord(C, 6, 'dim', 1).name, 'B°'); // +1 seulement en mineur
});
