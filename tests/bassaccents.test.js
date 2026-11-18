/*
 * Accents de basse (parts[section].inst[id].accents, js/bandsong.js) : rétrocompatibilité, vélocité sur les bons pas,
 * répétition 1 / 2 / scène, motifs prêts, ouverture du filtre (ev.acc + ev.accAmt), nettoyage.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'melody.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BS = SS.bandSong;

const TR = [
  ...['bd', 'sd', 'hh'].map((s) => ({ id: 'drums:' + s, type: 'drum', sound: s, band: { key: 'drums:' + s } })),
  ...['bass', 'pad'].map((r) => ({ id: r, type: 'instrument', category: 'chord', band: { key: r } })),
];
const SPEC = { key: 'C minor', groove: 'synthpop', form: 'a', sections: { a: { bars: 4, chords: 'i | VI | III | VII', drums: 'main', bass: '8', pad: 'sustain' } } };
const build = (acc, mode = '8') => BS.build(SPEC, 'test', TR, { parts: { a: { inst: { bass: { mode, ...(acc ? { accents: acc } : {}) } } } } });
const bass = (s) => s.scenes[0].data.bass.events;
const strip = (s) => JSON.stringify(s.scenes.map((sc) => ({ ...sc, id: 0 })));

test('sans accents (ou liste vide), la chanson est identique', () => {
  const a = build(null);
  assert.equal(strip(build({ steps: [], repeat: 1, force: 100, filter: true, bright: 100 })), strip(a));
  assert.equal(strip(build({ steps: [0], force: 50 }, '8')) === strip(a), false);
  assert.ok(bass(a).every((e) => e.acc === undefined && e.accAmt === undefined));
});

test('vélocité : plus forte de ACC_VEL × force / 100, sur les pas accentués seulement', () => {
  const base = bass(build(null));
  const out = bass(build({ steps: [0, 8], repeat: 1, force: 100 }));
  assert.equal(out.length, base.length);
  out.forEach((e, i) => {
    const hit = [0, 8].includes(e.step % 16);
    if (hit) assert.ok(Math.abs(e.vel - Math.min(1, base[i].vel + BS.ACC_VEL)) < 0.011, `pas ${e.step}`);
    else assert.equal(e.vel, base[i].vel, `pas ${e.step}`);
    assert.equal(e.acc, undefined); // sans filtre, pas d'accent du séquenceur
  });
  // force 0 : rien ne change ; force 50 : la moitié
  assert.equal(strip(build({ steps: [0], force: 0 })), strip(build(null)));
  const half = bass(build({ steps: [0], force: 50 }))[0];
  assert.ok(Math.abs(half.vel - Math.min(1, base[0].vel + BS.ACC_VEL / 2)) < 0.011);
  assert.ok(out.every((e) => e.vel <= 1));
});

test('répétition : 1 mesure, 2 mesures, toute la scène', () => {
  const stepsOf = (acc) => bass(build(acc)).filter((e, i) => e.vel > bass(build(null))[i].vel).map((e) => e.step);
  assert.deepEqual(stepsOf({ steps: [4], repeat: 1 }), [4, 20, 36, 52]);
  assert.deepEqual(stepsOf({ steps: [4, 20], repeat: 2 }), [4, 20, 36, 52]);
  assert.deepEqual(stepsOf({ steps: [4], repeat: 2 }), [4, 36]);
  assert.deepEqual(stepsOf({ steps: [4, 40], repeat: 'scene' }), [4, 40]);
  assert.deepEqual(stepsOf({ steps: [999], repeat: 'scene' }), []); // hors période : ignoré
});

test('filtre : ev.acc et ev.accAmt (brillance) sur les notes accentuées seulement', () => {
  const evs = bass(build({ steps: [0], force: 60, filter: true, bright: 80 }));
  evs.forEach((e) => {
    if (e.step % 16 === 0) assert.deepEqual([e.acc, e.accAmt], [true, 0.8]);
    else assert.deepEqual([e.acc, e.accAmt], [undefined, undefined]);
  });
  // le projet garde accAmt tant que la note est accentuée
  assert.deepEqual(SS.cleanAccent({ acc: true, accAmt: 0.8 }), { acc: true, accAmt: 0.8 });
  assert.deepEqual(SS.cleanAccent({ accAmt: 0.8 }), {});
  assert.equal(SS.cleanAccent({ acc: true, accAmt: 7 }).accAmt, 1);
});

test('accents : seule la basse est touchée, un autre instrument ignore les accents', () => {
  const a = build(null);
  const b = build({ steps: [0, 8], force: 100, filter: true });
  assert.equal(JSON.stringify(b.scenes[0].data.pad), JSON.stringify(a.scenes[0].data.pad));
  assert.equal(JSON.stringify(b.scenes[0].data['drums:bd']), JSON.stringify(a.scenes[0].data['drums:bd']));
  // le mode « Tenue » : une seule note par accord, accentuée si elle tombe sur le pas
  const w = build({ steps: [0], repeat: 'scene' }, 'whole');
  assert.ok(bass(w)[0].vel > bass(build(null, 'whole'))[0].vel);
});

test('normalizeAccents : bornes, doublons, valeurs par défaut', () => {
  assert.equal(BS.normalizeAccents(null), null);
  assert.deepEqual(BS.normalizeAccents({ steps: [8, 0, 8, -1, 2.5, 'x'], repeat: 'zz', force: 300, bright: -4 }), { steps: [0, 8], repeat: 1, force: 100, filter: false, bright: 0 });
  assert.deepEqual(BS.normalizeAccents({}), BS.ACC_DEFAULT);
  assert.equal(BS.accentPeriod(1, 4), 16);
  assert.equal(BS.accentPeriod(2, 4), 32);
  assert.equal(BS.accentPeriod('scene', 6), 96);
});

test('motifs prêts : pas accentués, toujours sur une note', () => {
  const all16 = Array.from({ length: 16 }, (_, i) => i);
  const eighths = all16.filter((s) => s % 2 === 0);
  const P = BS.accentPreset;
  assert.deepEqual(P('none', all16, 16), []);
  assert.deepEqual(P('strong', all16, 16), [0, 8]);
  assert.deepEqual(P('beat', all16, 16), [0, 4, 8, 12]);
  assert.deepEqual(P('off', all16, 16), [2, 6, 10, 14]);
  assert.deepEqual(P('sync', all16, 16), [0, 6, 12]);
  assert.deepEqual(P('gallop', Array.from({ length: 32 }, (_, i) => i), 32), [0, 6, 12, 18, 24, 30]);
  // n'accentue que des pas où il y a une note
  assert.deepEqual(P('beat', eighths, 16), [0, 4, 8, 12]);
  assert.deepEqual(P('sync', eighths, 16), [0, 6, 12]);
  assert.deepEqual(P('sync', [0, 8], 16), [0]);
  assert.deepEqual(P('off', [0, 4], 16), []);
  // aléatoire : reproductible, sous-ensemble des notes, la graine change le tirage
  const r1 = P('rand', all16, 32, 1), r1b = P('rand', all16, 32, 1);
  assert.deepEqual(r1, r1b);
  assert.ok(r1.every((s) => s < 32));
  assert.ok(P('rand', [], 16, 1).length === 0);
  assert.notDeepEqual(P('rand', all16, 32, 1), P('rand', all16, 32, 2));
  assert.equal(BS.ACC_PRESETS.length, 7);
});
