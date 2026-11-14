/*
 * Octave des instruments multi-échantillonnés (VCSL…) — sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/library.js');
require('../js/dirt.js');
require('../js/sample-tuning.js');
require('../js/sounds.js');
require('../js/juno.js');
require('../js/arp.js');
require('../js/project.js');

const inst = (id) => SS.findInstrument(null, id);

test('décalage d’octave : VCSL Do3 = midi 60 corrigé, piano et soundfonts inchangés', () => {
  assert.equal(SS.multiOctave(inst('vcsl_piano1')), 12);
  assert.equal(SS.multiOctave(inst('vcsl_sax')), 12);
  assert.equal(SS.multiOctave(inst('piano')), 0);
  assert.equal(SS.multiOctave(inst('vcsl_fmpiano')), 0);
  assert.equal(SS.multiOctave(inst('gm_piano')), 0);
});

const oldSong = () => ({
  format: 'stepseq', version: 1, title: 'Ancien', tempo: 120, timeSig: [4, 4], bars: 1,
  tracks: [
    { id: 'p', type: 'instrument', name: 'Piano1', category: 'mono', family: 'keys', instrument: 'vcsl_piano1', octave: 4, rollTop: 84,
      events: [{ step: 0, len: 4, notes: [60, 64], vel: 0.8 }] },
    { id: 'g', type: 'instrument', name: 'GM', category: 'mono', family: 'keys', instrument: 'gm_piano', octave: 4,
      events: [{ step: 0, len: 4, notes: [60], vel: 0.8 }] },
  ],
  scenes: [
    { id: 'a', name: 'Couplet', bars: 1, data: { p: { events: [{ step: 0, len: 4, notes: [60, 64], vel: 0.8 }] }, g: { events: [{ step: 0, len: 4, notes: [60], vel: 0.8 }] } } },
    { id: 'b', name: 'Refrain', bars: 1, data: { p: { events: [{ step: 2, len: 2, notes: [67], vel: 0.8 }] }, g: { events: [] } } },
  ],
  current: 'a',
  song: [{ scene: 'a', repeat: 1 }, { scene: 'b', repeat: 1 }],
});

test('ancien projet : les notes des pistes VCSL montent d’une octave dans toutes les scènes (même son qu’avant)', () => {
  const p = SS.normalizeProject(oldSong());
  assert.equal(p.version, 3);
  const piano = p.tracks.find((t) => t.id === 'p');
  const gm = p.tracks.find((t) => t.id === 'g');
  assert.deepEqual(piano.events[0].notes, [72, 76]);
  assert.equal(piano.octave, 5);
  assert.equal(piano.rollTop, 96);
  assert.deepEqual(gm.events[0].notes, [60]);
  assert.equal(gm.octave, 4);
  const refrain = p.scenes.find((sc) => sc.id === 'b');
  assert.deepEqual(refrain.data.p.events[0].notes, [79]);
});

test('projet récent : pas de transposition, même après plusieurs ouvertures', () => {
  const once = SS.normalizeProject(oldSong());
  const twice = SS.normalizeProject(JSON.parse(SS.serialize(once)));
  assert.deepEqual(twice.tracks.find((t) => t.id === 'p').events[0].notes, [72, 76]);
  assert.deepEqual(twice.scenes.find((sc) => sc.id === 'b').data.p.events[0].notes, [79]);
});
