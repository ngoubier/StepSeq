/*
 * Automation par scène (parts[section].inst[id].auto, js/bandsong.js) : formes, rétrocompatibilité, écriture dans track.auto de
 * chaque scène (aux bons pas), remplacement de la courbe du plan, vélocité (avec les accents de la basse), kit de batterie.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'melody.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BS = SS.bandSong;

const TR = [
  ...['bd', 'sd', 'hh'].map((s) => ({ id: 'drums:' + s, type: 'drum', sound: s, band: { key: 'drums:' + s, musician: 'drummer' } })),
  ...['bass', 'pad'].map((r) => ({ id: r, type: 'instrument', category: 'chord', band: { key: r } })),
];
const SPEC = { key: 'C minor', groove: 'synthpop', form: 'a b', sections: { a: { bars: 4, chords: 'i | VI | III | VII', drums: 'main', bass: '8', pad: 'sustain' }, b: { bars: 2, chords: 'i | VII', drums: 'main', bass: '8', pad: 'sustain' } } };
const build = (parts, spec = SPEC) => BS.build(spec, 'test', TR, { parts });
const strip = (s) => JSON.stringify(s.scenes.map((sc) => ({ ...sc, id: 0 })));
const bass = (s, i = 0) => s.scenes[i].data.bass.events;

test('formes : points de rupture de chaque forme', () => {
  const pts = (shape, o = {}, len = 64) => BS.autoPoints({ shape, ...BS.AUTO_DEF[shape], ...o }, len);
  assert.deepEqual(pts('flat', { a: 0.4 }), [[0, 0.4], [63, 0.4]]);
  assert.deepEqual(pts('rise', { a: 0.2, b: 0.9 }), [[0, 0.2], [63, 0.9]]);
  assert.deepEqual(pts('fall', { a: 0.9, b: 0.1 }), [[0, 0.9], [63, 0.1]]);
  assert.deepEqual(pts('open', { a: 0.1, b: 0.9 }), [[0, 0.1], [32, 0.9], [63, 0.1]]);
  assert.deepEqual(pts('close', { a: 0.9, b: 0.1 }), [[0, 0.9], [32, 0.1], [63, 0.9]]);
  assert.deepEqual(pts('final', { a: 0.3, b: 1 }), [[0, 0.3], [32, 0.3], [63, 1]]); // 4 mesures : monte sur les 2 dernières
  assert.deepEqual(pts('steps', { a: 0, b: 1 }), [[0, 0], [15, 0], [16, 0.333], [31, 0.333], [32, 0.667], [47, 0.667], [48, 1], [63, 1]]);
  const lfo = pts('lfo', { a: 0.4, b: 0.5, period: 1 });
  assert.equal(lfo[0][1], 0.5);
  assert.equal(lfo.find(([x]) => x === 4)[1], 0.7); // quart de période : centre + profondeur / 2
  assert.equal(lfo.find(([x]) => x === 12)[1], 0.3);
  assert.equal(lfo[lfo.length - 1][0], 63);
  const br = pts('breath', { a: 0.3, b: 0.8 });
  assert.equal(br[0][1], 0.3);
  assert.equal(br.find(([x]) => x === 16)[1], 0.8); // milieu de la période de 2 mesures
  assert.equal(br.find(([x]) => x === 32)[1], 0.3);
  assert.deepEqual(BS.autoPoints({ shape: 'drawn', points: [[0, 0.1], [20, 0.9], [99, 0.5]] }, 64), [[0, 0.1], [20, 0.9]]); // hors scène : ignoré
  // toutes les valeurs dans 0..1, pas entiers croissants, quelle que soit la forme et la longueur
  [16, 32, 100, 256].forEach((len) =>
    BS.AUTO_SHAPES.filter((s) => s !== 'drawn').forEach((shape) => {
      const p = BS.autoPoints({ shape, a: 1.4, b: -2, period: 4 }, len);
      assert.ok(p.every(([x, y], i) => Number.isInteger(x) && x >= 0 && x < len && y >= 0 && y <= 1 && (!i || x > p[i - 1][0])), `${shape} ${len}`);
    })
  );
  assert.deepEqual(BS.autoCurve({ shape: 'rise', a: 0, b: 1 }, 16), { 0: 0, 15: 1 });
});

test('valeurs réelles : étendue de chaque réglage ; vélocité 30..127', () => {
  assert.deepEqual(BS.autoLane('filter', { shape: 'rise', a: 0, b: 1 }, 16), { 0: -1, 15: 1 });
  assert.deepEqual(BS.autoLane('lfoamt', { shape: 'flat', a: 0.5, b: 0.5 }, 16), { 0: 1, 15: 1 });
  assert.equal(BS.autoReal('vel', 0), 30);
  assert.equal(BS.autoReal('vel', 1), 127);
  assert.equal(BS.autoNorm('vel', 100), 0.722);
  assert.equal(BS.newAutoSpec('volume').a, 1); // neutre : volume plein
  assert.equal(Math.round(BS.autoReal('vel', BS.newAutoSpec('vel').a)), 100); // neutre : vélocité 100 = inchangé
  SS.AUTO_PARAMS.filter((P) => !P.midi && P.id !== 'pw').forEach((P) => assert.ok(BS.SCENE_AUTO.some((x) => x.id === P.id), P.id)); // aucun réglage de piste oublié
  BS.SCENE_AUTO.filter((x) => x.id !== 'vel').forEach((x) => assert.deepEqual([x.min, x.max], [SS.autoParam(x.id).min, SS.autoParam(x.id).max], x.id));
});

test('nettoyage : réglages inconnus, valeurs hors bornes, points désordonnés', () => {
  assert.equal(BS.normalizeAuto(null), null);
  assert.equal(BS.normalizeAuto({ nimporte: { shape: 'rise' }, filter: 5 }), null);
  const A = BS.normalizeAuto({ filter: { shape: 'zigzag', a: 9, b: -1, hidden: 1 }, vel: { shape: 'lfo', a: 0.4, period: 3 }, res: { shape: 'drawn', points: [[8, 0.5], [0, 2], [8, 0.2], ['x', 1]], from: 'rise' } });
  assert.deepEqual(A.filter, { shape: 'flat', a: 1, b: 0, hidden: true });
  assert.equal(A.vel.period, 2);
  assert.deepEqual(A.res.points, [[0, 1], [8, 0.2]]);
  assert.equal(A.res.from, 'rise');
  assert.equal(BS.normalizeAutoSpec({ shape: 'drawn', points: [] }).shape, 'flat');
});

test('rétrocompatibilité : sans auto (ou vide), la chanson est identique', () => {
  const base = build(null);
  assert.equal(strip(build({ a: { inst: { bass: { mode: '8' } } } })), strip(build({ a: { inst: { bass: { mode: '8' } } } })));
  assert.equal(strip(build({ a: { inst: { bass: {} } } })), strip(base));
  assert.equal(strip(build({ a: { inst: { bass: { auto: {} } } } })), strip(base));
  assert.equal(strip(build({ a: { inst: { bass: { auto: { nimporte: { shape: 'rise' } } } } } })), strip(base));
});

test('écriture : courbe de la scène dans track.auto, pas relatifs à la scène, autres scènes intactes', () => {
  const base = build(null);
  const s = build({ a: { inst: { bass: { auto: { filter: { shape: 'rise', a: 0, b: 1 } } } } } });
  assert.deepEqual(s.scenes[0].data.bass.auto, { filter: { 0: -1, 63: 1 } }); // scène a : 4 mesures = 64 pas
  assert.equal(s.scenes[1].data.bass.auto, undefined); // scène b : rien
  assert.equal(JSON.stringify(s.scenes[1].data), JSON.stringify(base.scenes[1].data));
  assert.equal(s.scenes[0].data.pad.auto, undefined); // un autre instrument : rien
  assert.equal(JSON.stringify(bass(s)), JSON.stringify(bass(base))); // les notes ne changent pas
  // plusieurs scènes, plusieurs réglages, longueur de chaque scène
  const m = build({ a: { inst: { bass: { auto: { filter: { shape: 'open', a: 0.5, b: 1 }, reverb: { shape: 'fall', a: 1, b: 0, hidden: true } } } } }, b: { inst: { bass: { auto: { filter: { shape: 'fall', a: 1, b: 0 } } } } } });
  assert.deepEqual(m.scenes[0].data.bass.auto, { filter: { 0: 0, 32: 1, 63: 0 }, reverb: { 0: 1, 63: 0 } }); // masquée : joue quand même
  assert.deepEqual(m.scenes[1].data.bass.auto, { filter: { 0: 1, 31: -1 } }); // scène b : 2 mesures = 32 pas
  // un instrument de type changé reçoit aussi ses courbes
  const k = BS.build(SPEC, 'test', TR, { kinds: { pad: 'arp' }, parts: { a: { inst: { pad: { auto: { echo: { shape: 'flat', a: 0.5, b: 0.5 } } } } } } });
  assert.deepEqual(k.scenes[0].data.pad.auto, { echo: { 0: 0.5, 63: 0.5 } });
});

test('remplacement du plan : la courbe de l\'utilisateur remplace celle du plan pour ce réglage et cette scène', () => {
  const TECH = { ...SPEC, tech: true, sections: { a: { ...SPEC.sections.a, float: true }, b: { ...SPEC.sections.b, bars: 4 } } };
  const plan = BS.build(TECH, 'test', TR);
  assert.ok(plan.scenes[0].data.bass.auto && plan.scenes[0].data.bass.auto.filter, 'le plan automatise le filtre de la basse (intro planante)');
  const own = BS.build(TECH, 'test', TR, { parts: { a: { inst: { bass: { auto: { filter: { shape: 'flat', a: 1, b: 1 }, echo: { shape: 'flat', a: 0.2, b: 0.2 } } } } } } });
  assert.deepEqual(own.scenes[0].data.bass.auto.filter, { 0: 1, 63: 1 });
  assert.deepEqual(own.scenes[0].data.bass.auto.echo, { 0: 0.2, 63: 0.2 });
  // un réglage non touché garde la courbe du plan ; une autre scène aussi
  const keep = BS.build(TECH, 'test', TR, { parts: { a: { inst: { bass: { auto: { echo: { shape: 'flat', a: 0.2, b: 0.2 } } } } } } });
  assert.deepEqual(keep.scenes[0].data.bass.auto.filter, plan.scenes[0].data.bass.auto.filter);
  assert.deepEqual(own.scenes[1].data.bass.auto, plan.scenes[1].data.bass.auto);
});

test('vélocité : multiplie les notes à leur pas, avant les accents', () => {
  const base = bass(build(null));
  const flat = bass(build({ a: { inst: { bass: { auto: { vel: { shape: 'flat', a: BS.autoNorm('vel', 50), b: 0 } } } } } }));
  flat.forEach((e, i) => assert.ok(Math.abs(e.vel - Math.max(0.12, base[i].vel * 0.5)) < 0.011, `pas ${e.step}`));
  const s = build({ a: { inst: { bass: { auto: { vel: { shape: 'rise', a: 0, b: 1 } } } } } });
  const v = bass(s);
  assert.equal(s.scenes[0].data.bass.auto, undefined); // « vel » n'est pas une courbe de piste
  assert.ok(v[0].vel < base[0].vel && v[v.length - 1].vel >= base[v.length - 1].vel, 'monte de 30 à 127 : plus doux au début, plus fort à la fin');
  // avec accents : la vélocité d'abord, l'accent ensuite (en plus)
  const acc = bass(build({ a: { inst: { bass: { auto: { vel: { shape: 'flat', a: BS.autoNorm('vel', 60), b: 0 } }, accents: { steps: [0], force: 100 } } } } }));
  acc.forEach((e, i) => {
    const soft = Math.max(0.12, Math.round(base[i].vel * 0.6 * 100) / 100);
    assert.ok(Math.abs(e.vel - (e.step % 16 === 0 ? Math.min(1, soft + BS.ACC_VEL) : soft)) < 0.021, `pas ${e.step}`);
  });
  assert.ok(acc.every((e) => e.vel <= 1));
});

test('kit de batterie : toutes les pièces reçoivent les courbes et la vélocité', () => {
  const base = build(null);
  const s = build({ a: { inst: { drummer: { auto: { filter: { shape: 'rise', a: 0, b: 1 }, vel: { shape: 'flat', a: BS.autoNorm('vel', 50), b: 0 } } } } } });
  ['drums:bd', 'drums:sd', 'drums:hh'].forEach((id) => {
    assert.deepEqual(s.scenes[0].data[id].auto, { filter: { 0: -1, 63: 1 } }, id);
    s.scenes[0].data[id].steps.forEach((v, i) => assert.ok(Math.abs(v - (base.scenes[0].data[id].steps[i] > 0 ? Math.max(0.12, base.scenes[0].data[id].steps[i] * 0.5) : 0)) < 0.011, `${id} ${i}`));
    assert.equal(s.scenes[1].data[id].auto, undefined);
  });
  assert.equal(s.scenes[0].data.bass.auto, undefined);
  // un instrument coupé dans la scène n'a pas de courbe
  const off = build({ a: { inst: { bass: { off: true, auto: { filter: { shape: 'rise', a: 0, b: 1 } } } } } });
  assert.equal(off.scenes[0].data.bass.auto, undefined);
});

test('les courbes écrites sont lues par le moteur d\'automation (SS.autoValue, SS.cleanAuto)', () => {
  const s = build({ a: { inst: { bass: { auto: { filter: { shape: 'rise', a: 0, b: 1 } } } } } });
  const lane = s.scenes[0].data.bass.auto.filter;
  assert.ok(Math.abs(SS.autoValue(lane, 31.5, 64) - 0) < 0.05);
  const t = SS.cleanAuto({ auto: JSON.parse(JSON.stringify(s.scenes[0].data.bass.auto)) }, 64);
  assert.deepEqual(t.auto.filter, { 0: -1, 63: 1 });
});
