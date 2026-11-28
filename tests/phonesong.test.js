/*
 * Nouvelle chanson sur téléphone (js/phonesong.js) : la recette (tempo, tonalité, musiciens, scènes) devient une chanson.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'band-presets.js', 'band-songs.js', 'band-levels.js', 'band-drive.js', 'mixref.js', 'horns-motifs.js', 'horns.js', 'bandmix.js', 'melody.js', 'bandsong.js', 'phonesong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const P = SS.phoneSong;

test('recette de départ : Do majeur, trois musiciens, structure courte', () => {
  const r = P.fresh();
  assert.equal(P.keyLabel(r), 'Do majeur');
  assert.deepEqual(P.MUSICIANS.map((m) => m.id), ['drums', 'bass', 'keys']);
  assert.ok(P.MUSICIANS.every((m) => r.mus[m.id].on && P.sounds(m.id).length >= 3));
  assert.ok(P.MUSICIANS.every((m) => P.sounds(m.id).every((s) => !s.tok.startsWith('j:'))), 'pas de synthé Juno sur téléphone');
  assert.equal(P.chordsOf(r, 'verse'), 'C · G · Am · F');
});

test('la tonalité choisie donne les accords : La mineur, Do♯ mineur', () => {
  const r = { ...P.fresh(), tonic: 9, mode: 'minor' };
  assert.equal(P.keyLabel(r), 'La mineur');
  assert.equal(P.chordsOf(r, 'verse'), 'Am · F · C · G');
  assert.equal(P.keyLabel({ ...r, tonic: 1 }), 'Do♯ mineur');
  assert.equal(P.keyLabel({ ...r, tonic: 1, mode: 'major' }), 'Ré♭ majeur');
});

test('la chanson construite suit la recette', () => {
  const r = { ...P.fresh(), tempo: 92, tonic: 2, mode: 'minor', scenes: ['intro', 'verse', 'chorus', 'bridge', 'chorus', 'outro'] };
  r.mus.keys.on = false;
  const p = P.build(r, { id: 'abcd1234', title: 'Essai' });
  assert.equal(p.id, 'abcd1234');
  assert.equal(p.tempo, 92);
  assert.ok(p.tracks.some((t) => t.type === 'drum'), 'batterie');
  assert.ok(p.tracks.some((t) => t.band.key === 'bass'), 'basse');
  assert.ok(!p.tracks.some((t) => t.band.key === 'keys'), 'pas de clavier');
  assert.deepEqual(p.scenes.map((s) => s.name), ['Intro', 'Couplet', 'Refrain', 'Pont', 'Fin']);
  assert.deepEqual(p.song.map((b) => p.scenes.find((s) => s.id === b.scene).name), ['Intro', 'Couplet', 'Refrain', 'Pont', 'Refrain', 'Fin']);
  assert.ok(p.scenes.every((s) => s.key.tonic === 'D' && s.key.mode === 'minor'));
  const bass = p.tracks.find((t) => t.band.key === 'bass');
  assert.ok(p.scenes.some((s) => s.data[bass.id].events.length), 'la basse joue');
  assert.deepEqual(P.clean(p.phone), P.clean(r), 'la recette est rangée dans la chanson');
});

test('recette lue : bornée, inutilisable → null', () => {
  assert.equal(P.clean(null), null);
  assert.equal(P.clean({ v: 99 }), null);
  const r = P.clean({ v: 1, tempo: 999, tonic: 40, mode: 'x', mus: { bass: { on: false, pick: 50 } }, scenes: ['verse', 'nope'] });
  assert.equal(r.tempo, P.TEMPO_MAX);
  assert.equal(r.tonic, 11);
  assert.equal(r.mode, 'major');
  assert.equal(r.mus.bass.on, false);
  assert.ok(r.mus.bass.pick < P.sounds('bass').length);
  assert.deepEqual(r.scenes, ['verse']);
  assert.equal(P.build({ ...r, scenes: [] }), null, 'sans scène, pas de chanson');
});
