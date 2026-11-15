/*
 * Contrôleurs MIDI des lignes d'automation : pédale de sustain (entendue dans StepSeq et exportée en CC 64),
 * modulation (CC 1) et pitch bend (pour un synthé externe).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'modulation.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;

test('pédale : deux valeurs seulement, sans rampe entre les points, et qui boucle', () => {
  const t = { type: 'instrument' };
  SS.setAutoPoint(t, 'sustain', 4, 0.8);
  SS.setAutoPoint(t, 'sustain', 12, 0.2);
  assert.deepEqual(t.auto.sustain, { 4: 1, 12: 0 });
  assert.equal(SS.autoValue(t.auto.sustain, 8, 16, true), 1); // pas de rampe entre 4 et 12
  assert.equal(SS.autoValue(t.auto.sustain, 2, 16, true), 0); // avant le premier point : le dernier de la boucle
  assert.equal(SS.autoFormat('sustain', 1), 'Enfoncée');
  assert.equal(SS.autoFormat('bend', 0.5), '+1,0 demi-ton');
});

test('pédale : une note relâchée pédale enfoncée tient jusqu’à ce qu’elle se relève', () => {
  const t = { type: 'instrument', auto: { sustain: { 0: 1, 8: 0, 9: 1 } } };
  assert.equal(SS.pedalLen(t, 0, 2, 16), 8); // relâchée au pas 2, pédale relevée au pas 8
  assert.equal(SS.pedalLen(t, 6, 2, 16), 2); // relâchée au pas 8 : la pédale vient de se relever
  assert.equal(SS.pedalLen(t, 9, 1, 16), 15); // relevée au pas 8 de la boucle suivante (24) : 24 − 9
  assert.equal(SS.pedalLen({ type: 'instrument' }, 0, 2, 16), 2);
  assert.equal(SS.pedalLen({ auto: { sustain: { 0: 1 } } }, 0, 2, 16), 18); // jamais relevée : une boucle de plus
});

test('formes : pédale relevée à chaque mesure (changement d’accord)', () => {
  const t = { type: 'instrument' };
  SS.applyAutoShape(t, 'sustain', 'bar', 32, 4, 16);
  assert.deepEqual(t.auto.sustain, { 0: 0, 1: 1, 16: 0, 17: 1 });
});

test('export MIDI : CC 64 (0 / 127), CC 1 et pitch bend 14 bits', () => {
  const p = SS.newProject();
  p.bars = 1;
  p.tracks.push({ id: 'k', type: 'instrument', name: 'Piano', category: 'mono', family: 'keys', instrument: 'piano', volume: 0.8, events: [{ step: 0, len: 2, notes: [60], vel: 0.8 }], auto: { sustain: { 0: 1, 8: 0 }, mod: { 0: 0, 15: 1 }, bend: { 0: 0, 4: 1 } } });
  SS.commitScene(p);
  const { bytes } = SS.midi.exportProject(p, { range: 'song' });
  const mf = SS.midiFile.parse(bytes);
  const evs = mf.tracks.flat();
  const ccs = (n) => evs.filter((e) => e.type === 'cc' && e.cc === n);
  assert.deepEqual(ccs(64).map((e) => [e.tick, e.value]), [[0, 127], [8 * 120, 0]]);
  assert.ok(ccs(1).length > 5 && ccs(1).at(-1).value === 127);
  const pb = evs.filter((e) => e.type === 'pitch');
  assert.equal(pb.at(-1).value, 8191); // +1 = tout en haut
  assert.ok(pb.some((e) => e.value > 0 && e.value < 8191)); // rampe entre les points
});
