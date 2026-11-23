/*
 * Grille d'accords commune (js/harmony.js : gridFill, gridPut, gridSetLen) et grille reçue par les scènes
 * créées par l'assistant (js/bandsong.js, sceneGrid).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'melody.js', 'bandsong.js', 'chords.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const H = SS.harmony;

const C = (step, len, degree, type = 'min') => ({ step, len, degree, type, acc: 0 });
const shape = (g) => g.map((c) => [c.step, c.len, c.degree]);

test('gridFill : triée, sans trou, du début à la fin de la scène', () => {
  const g = H.gridFill([C(20, 4, 3), C(4, 8, 5), C(40, 99, 6)], 32);
  assert.deepEqual(shape(g), [[0, 20, 5], [20, 12, 3]]);
});

test('gridPut : l’accord posé remplace ce qu’il recouvre, un accord coupé garde ses deux bouts', () => {
  const g = [C(0, 16, 0), C(16, 16, 5)];
  H.gridPut(g, C(8, 4, 3));
  assert.deepEqual(shape(g), [[0, 8, 0], [8, 4, 3], [12, 4, 0], [16, 16, 5]]);
  // un accord déjà dans la liste (déplacé) n'est pas compté deux fois
  const moved = g[1];
  moved.step = 20;
  H.gridPut(g, moved);
  assert.equal(g.filter((c) => c === moved).length, 1);
});

test('gridSetLen : allonger mange les suivants, raccourcir avance le suivant', () => {
  const g = [C(0, 16, 0), C(16, 16, 5), C(32, 16, 3)];
  H.gridSetLen(g, 0, 24, 48);
  assert.deepEqual(shape(g), [[0, 24, 0], [24, 8, 5], [32, 16, 3]]);
  H.gridSetLen(g, 0, 8, 48);
  assert.deepEqual(shape(g), [[0, 8, 0], [8, 24, 5], [32, 16, 3]]);
});

test('SS.gridPut (piste Accords) passe par la même opération', () => {
  const g = { chords: [C(0, 32, 0)] };
  SS.gridPut(g, C(16, 16, 5));
  assert.deepEqual(shape(g.chords), [[0, 16, 0], [16, 16, 5]]);
});

const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets);
const tracksOf = (p) =>
  p.musicians.filter((m) => !m.injected).flatMap((m) =>
    m.kits ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } })) : [{ id: m.role, type: 'instrument', band: { key: m.role } }]
  );

test('chaque scène créée reçoit la grille de ses accords (piste Accords, Harmonie)', () => {
  for (const p of PRESETS) {
    const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tracksOf(p));
    const spb = SS.bandSong.meter().spb; // pas par mesure : 16 en 4/4, 12 en 3/4 (valse), 24 en 12/8
    for (const sc of s.scenes) {
      assert.ok(sc.grid && sc.grid.chords.length, `${p.id}/${sc.sec} : grille`);
      const g = SS.normalizeGrid(sc.grid);
      assert.equal(g.chords.length, sc.grid.chords.length, `${p.id}/${sc.sec} : accords valides`);
      assert.equal(g.chords[0].step, 0);
      const end = g.chords[g.chords.length - 1];
      assert.equal(end.step + end.len, sc.bars * spb, `${p.id}/${sc.sec} : couvre la scène`);
      // mêmes fondamentales que les accords joués
      for (const sp of sc.spans) {
        const c = g.chords.find((x) => sp.step >= x.step && sp.step < x.step + x.len);
        assert.equal(H.gridChord(sc.key, c.degree, c.type, c.acc).rootPc, sp.chord.rootPc, `${p.id}/${sc.sec} : pas ${sp.step}`);
      }
    }
  }
});

test('la grille de l’étape Accords et ses pédales passent telles quelles à la scène', () => {
  const p = PRESETS[0];
  const spec = SS.BandSongs[p.id];
  const sec = spec.form.split(/\s+/)[0].split('*')[0];
  const bars = spec.sections[sec].bars;
  const mine = [C(0, 8, 0), C(8, bars * 16 - 8, 5, 'maj')];
  const pedals = [{ step: 0, len: 16, semi: 0 }];
  const s = SS.bandSong.build(spec, p.id, tracksOf(p), { harmony: { keys: {}, chords: { [sec]: mine }, emotions: {}, pedals: { [sec]: pedals } } });
  const sc = s.scenes.find((x) => x.sec === sec);
  assert.deepEqual(shape(sc.grid.chords), shape(mine));
  assert.deepEqual(sc.grid.pedals, pedals);
});
