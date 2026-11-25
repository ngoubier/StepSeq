// Frise de lecture de l'assistant (js/wizplaybar.js) : blocs, position, temps.
const test = require('node:test');
const assert = require('node:assert');
globalThis.window = globalThis;
require('../js/wizplaybar.js');
const P = SS.wizPlayBar;

const res = {
  scenes: [
    { id: 'a', sec: 'intro', name: 'Intro', bars: 4 },
    { id: 'b', sec: 'verse', name: 'Couplet', bars: 8 },
    { id: 'c', sec: 'chorus', name: 'Refrain', bars: 8, tempo: 60 },
  ],
  song: [{ scene: 'a', repeat: 1 }, { scene: 'b', repeat: 2 }, { scene: 'c', repeat: 1 }],
};

test('un bloc par répétition, durées au tempo de chaque scène', () => {
  const m = P.model(res, { spb: 16, tempo: 120 });
  assert.deepStrictEqual(m.blocks.map((b) => [b.name, b.song, b.rep, b.start]), [['Intro', 0, 0, 0], ['Couplet', 1, 0, 4], ['Couplet', 1, 1, 12], ['Refrain', 2, 0, 20]]);
  assert.strictEqual(m.bars, 28);
  // 4/4 à 120 : 2 s par mesure ; Refrain à 60 : 4 s par mesure
  assert.strictEqual(m.blocks[1].dur, 16);
  assert.strictEqual(m.secs, 8 + 16 + 16 + 32);
});

test('position en mode Chanson et en mode Scène', () => {
  const m = P.model(res, { spb: 16 });
  assert.strictEqual(P.at(m, { mode: 'song', block: 1, scene: 'b', step: 16 * 10, spb: 16 }), 14); // 2e passage du couplet
  assert.strictEqual(P.at(m, { mode: 'scene', block: 2, scene: 'c', step: 16 * 9, spb: 16 }), 21); // boucle : 9 mesures → 2e mesure
  assert.strictEqual(P.at(m, { mode: null, scene: 'c', step: 3 }), -1);
  assert.strictEqual(P.at(m, { mode: 'song', block: 0, scene: 'a', step: -1 }), -1);
  assert.strictEqual(P.blockAt(m, 14).rep, 1);
});

test('temps écoulé et format', () => {
  const m = P.model(res, { spb: 16, tempo: 120 });
  assert.strictEqual(P.timeAt(m, 22), 8 + 32 + 8);
  assert.strictEqual(P.fmt(48), '0:48');
  assert.strictEqual(P.fmt(125.4), '2:05');
});

test('couleur d’une partie : id de l’assistant ou nom de scène', () => {
  assert.strictEqual(P.colorOf('chorus'), P.colorOf('Refrain'));
  assert.strictEqual(P.colorOf('verse'), P.colorOf('couplet'));
  assert.strictEqual(P.colorOf('bridge'), P.colorOf('Pont'));
  assert.strictEqual(P.colorOf('Pré-refrain'), P.colorOf('pre'));
  assert.strictEqual(P.colorOf('Scène 4'), P.colorOf(''));
});

test('accord en cours et suivant', () => {
  const ch = [{ bar: 0, name: 'Am' }, { bar: 2, name: 'F' }, { bar: 4, name: 'F' }, { bar: 6, name: 'G' }];
  assert.deepStrictEqual(P.chordAt(ch, 0.5), { now: 'Am', next: 'F' });
  assert.deepStrictEqual(P.chordAt(ch, 4), { now: 'F', next: 'G' });
  assert.deepStrictEqual(P.chordAt(ch, 7), { now: 'G', next: 'Am' }); // la grille boucle
  assert.deepStrictEqual(P.chordAt([{ bar: 0, name: 'C' }], 3), { now: 'C', next: null });
  assert.strictEqual(P.chordAt([], 1), null);
});

test('grille compacte : un tour et le nombre de tours', () => {
  assert.deepStrictEqual(P.cycle(['Am', 'F', 'Am', 'F', 'Am', 'F']), { chords: ['Am', 'F'], turns: 3 });
  assert.deepStrictEqual(P.cycle(['C', 'C', 'G', 'Am']), { chords: ['C', 'G', 'Am'], turns: 1 });
  assert.deepStrictEqual(P.cycle([]), { chords: [], turns: 0 });
});
