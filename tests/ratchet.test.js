/*
 * Ratchet des notes (ev.rat) et des pas de batterie (track.rat) : modèle, scènes, export MIDI.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const T = 120; // ticks par double-croche à l'export

function project() {
  const p = SS.newProject();
  const drum = SS.newTrack({ type: 'drum', name: 'Snare', color: '#fff', source: 'tdm', sound: 'sd', machine: 'RolandTR808' }, p);
  const bass = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_sub', name: 'Bass', color: '#fff' }, p);
  p.tracks = [drum, bass];
  drum.steps[4] = 1;
  drum.steps[12] = 0.5;
  SS.setDrumRatchet(drum, 12, 3);
  bass.events = [{ step: 0, len: 4, notes: [36], vel: 1, rat: 2 }];
  SS.commitScene(p);
  return p;
}

test('ratchet de note : 2 à 4, absent si 1, borné', () => {
  assert.equal(SS.cleanRatchet({ rat: 3 }).rat, 3);
  assert.equal(SS.cleanRatchet({ rat: 9 }).rat, 4);
  assert.ok(!('rat' in SS.cleanRatchet({ rat: 1 })));
  assert.ok(!('rat' in SS.cleanRatchet({ rat: 'x' })));
});

test('ratchet de batterie : seulement sur un pas allumé, enlevé à ×1', () => {
  const t = { steps: [1, 0, 1, 0] };
  SS.setDrumRatchet(t, 0, 2);
  SS.setDrumRatchet(t, 1, 3); // pas éteint
  assert.equal(SS.drumRatchet(t, 0), 2);
  assert.equal(SS.drumRatchet(t, 1), 1);
  SS.cleanDrumRatchets(t);
  assert.deepEqual(t.rat, { 0: 2 });
  SS.setDrumRatchet(t, 0, 1);
  assert.ok(!('rat' in t));
});

test('scènes et recopie de mesures : les ratchets suivent les pas', () => {
  const p = project();
  const id = p.current;
  assert.deepEqual(p.scenes[0].data[p.tracks[0].id].rat, { 12: 3 });
  const other = SS.addScene(p, { copy: false });
  SS.loadScene(p, other);
  assert.ok(!('rat' in p.tracks[0]), 'scène vide : pas de ratchet');
  SS.loadScene(p, id);
  assert.equal(SS.drumRatchet(p.tracks[0], 12), 3);
  assert.equal(p.tracks[1].events[0].rat, 2);
  p.bars = 2;
  SS.resizeProject(p);
  SS.repeatBars(p, 1);
  assert.equal(SS.drumRatchet(p.tracks[0], 28), 3, 'recopié dans la 2e mesure');
  // ouverture d'un fichier : valeurs nettoyées
  const back = SS.normalizeProject(JSON.parse(SS.serialize(p)));
  assert.equal(SS.drumRatchet(back.tracks[0], 28), 3);
  assert.equal(back.tracks[1].events[0].rat, 2);
});

test('export MIDI : coups et notes répétés à intervalles égaux dans le pas', () => {
  const m = SS.midiFile.parse(SS.midi.exportProject(project(), { range: 'scene', loops: 1, swing: false }).bytes);
  const on = (trk) => trk.filter((e) => e.type === 'note' && !e.off);
  const snare = on(m.tracks[1]);
  assert.deepEqual(snare.map((e) => e.tick), [4 * T, 12 * T, 12 * T + T / 3, 12 * T + (2 * T) / 3]);
  assert.ok(snare[2].vel < snare[1].vel, 'répétitions un peu moins fortes');
  const bass = on(m.tracks[2]);
  assert.deepEqual(bass.map((e) => e.tick), [0, T / 2]);
  // la dernière répétition tient le reste de la note (4 pas)
  const off = m.tracks[2].filter((e) => e.type === 'note' && e.off).map((e) => e.tick);
  assert.equal(Math.max(...off), 4 * T);
});
