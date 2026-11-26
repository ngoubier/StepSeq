/*
 * Assistant : effets et mouvements de son du modèle vus depuis l'étape d'un instrument (js/wizfx.js, js/bandsong.js).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'melody.js', 'horns-motifs.js', 'horns.js', 'bandsong.js', 'library.js', 'arp.js', 'band-levels.js', 'mixref.js', 'bandmix.js', 'wizfx.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BS = SS.bandSong;
const plan = SS.BandSongs.neons;
const preset = SS.Band.STYLES.flatMap((s) => s.presets).find((p) => p.id === 'neons');
const tracks = () =>
  preset.musicians.flatMap((m) =>
    m.kits ? m.pieces.map((pc) => ({ id: 'drums:' + pc, type: 'drum', sound: pc, band: { key: 'drums:' + pc } })) : [{ id: m.role, type: 'instrument', category: 'chord', band: { key: m.role } }]
  );

test('courbes du modèle : les points du plan deviennent une courbe dessinée de l’assistant', () => {
  const sec = plan.sections.intro;
  const c = BS.planCurves(sec, 'pad', sec.bars);
  assert.deepEqual(Object.keys(c), ['volume']);
  assert.equal(c.volume.shape, 'drawn');
  const n = sec.bars * 16;
  assert.deepEqual(c.volume.points, [[0, 0], [Math.round(0.5 * (n - 1)), 0.75], [n - 1, 1]]);
  // le filtre de la basse (−1..1) est ramené à 0..1
  const b = BS.planCurves(sec, 'bass', sec.bars);
  assert.equal(b.filter.points[0][1], BS.autoNorm('filter', -0.75));
  assert.deepEqual(BS.planCurves(sec, 'lead', sec.bars), {});
  assert.deepEqual(BS.planCurves(null, 'pad', 8), {});
});

test('la courbe du modèle jouée = celle montrée ; retirée (autoModel off) ou retouchée, elle change', () => {
  const sec = plan.sections.intro;
  const scene = (parts) => BS.build(plan, 'neons', tracks(), parts ? { parts } : {}).scenes.find((s) => s.sec === 'intro');
  const base = scene().data.pad.auto.volume;
  const shown = BS.autoLane('volume', BS.planCurves(sec, 'pad', sec.bars).volume, sec.bars * 16);
  assert.deepEqual(base, shown);
  // retirée : plus de courbe de volume sur la nappe, la basse garde la sienne
  const off = scene({ intro: { inst: { pad: { autoModel: { volume: 'off' } } } } });
  assert.equal(off.data.pad.auto && off.data.pad.auto.volume, undefined);
  assert.ok(off.data.bass.auto.filter);
  // retouchée : la courbe de l'assistant remplace celle du modèle
  const mine = scene({ intro: { inst: { pad: { auto: { volume: { shape: 'flat', a: 0.5, b: 0.5 } } } } } });
  assert.deepEqual(Object.values(mine.data.pad.auto.volume), [0.5, 0.5]);
});

test('pastilles d’effet : modèle, retouche, effet coupé', () => {
  const base = plan.fx.pad;
  assert.deepEqual(SS.wizFx.chips(base, base, {}), [{ id: 'phaser', label: 'Phaser · 4 mes. · 6 étages', model: true, mine: false }]);
  assert.deepEqual(SS.wizFx.chips(plan.fx.bass, plan.fx.bass, {}), [{ id: 'echo', label: 'Écho 14 %', model: true, mine: false }]);
  const own = { phaserSync: 2 };
  assert.deepEqual(SS.wizFx.chips({ ...base, ...own }, base, own)[0], { id: 'phaser', label: 'Phaser · 2 mes. · 6 étages', model: false, mine: true });
  // coupé à la main : la pastille reste (pour revenir au modèle)
  assert.equal(SS.wizFx.chips({ ...base, phaser: 0 }, base, { phaser: 0 })[0].label, 'Phaser · coupé');
  assert.deepEqual(SS.wizFx.chips({}, {}, {}), []);
  assert.equal(SS.wizFx.chips({ phaser: 0.4, phaserRate: 0.12 }, {}, { phaser: 0.4, phaserRate: 0.12 })[0].label, 'Phaser · 0,12 Hz · 6 étages');
});

test('effets retouchés dans l’assistant : appliqués par-dessus ceux du modèle au mixage', () => {
  const t = { id: 'p', type: 'instrument', instrument: 'juno', band: { key: 'pad', preset: 'neons', fxo: { phaserSync: 2, sendEcho: 0.3 } } };
  SS.bandMix.mixTracks([t], new Map(), 'synthwave');
  assert.equal(t.fx.phaserSync, 2);
  assert.equal(t.fx.phaser, 0.5);
  assert.equal(t.fx.sendEcho, 0.3);
});

test('aperçu de la chanson : une case par scène, une courbe par réglage', () => {
  const m = SS.wizFx.overviewModel(
    [{ sec: 'a', name: 'A', bars: 8 }, { sec: 'b', name: 'B', bars: 8 }],
    [{ id: 'pad', name: 'Drone', color: '#fff', fx: 'phaser', curves: { b: [{ param: 'volume', color: '#b4b4c2', points: [[0, 0], [127, 1]], mine: true }] } }],
    { W: 1000, H: 26 }
  );
  assert.deepEqual(m.scenes.map((s) => [s.x, s.w]), [[0, 500], [500, 500]]);
  assert.equal(m.rows[0].paths.length, 1);
  assert.ok(m.rows[0].paths[0].d.startsWith('M500.0 23.0'));
  assert.ok(m.rows[0].paths[0].d.endsWith('L1000.0 3.0'));
  assert.equal(m.rows[0].paths[0].mine, true);
});
