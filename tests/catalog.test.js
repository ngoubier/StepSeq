/*
 * Tests du catalogue rangé par rôle (js/catalog.js) — sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/library.js');
require('../js/dirt.js');
require('../js/sounds.js');
require('../js/juno.js');
require('../js/catalog.js');
const SS = globalThis.SS;
const C = SS.catalog;

test('chaque patch du Juno-106 a un rôle', () => {
  assert.equal(SS.JUNO_PATCHES.length, 128);
  SS.JUNO_PATCHES.forEach((p) => assert.ok(C.JUNO_ROLE[p.id] && C.ROLE[C.JUNO_ROLE[p.id]], p.id));
  assert.equal(Object.keys(C.JUNO_ROLE).length, 128, 'aucun patch rangé deux fois ni inconnu');
});

test('chaque famille du catalogue est rangée dans un rôle, chaque instrument y apparaît une fois', () => {
  SS.FAMILIES.forEach((f) => assert.ok(C.ROLES.some((r) => r.families.includes(f.id)), f.id));
  const all = C.ROLES.flatMap((r) => C.soundsOf(r.id));
  const n = SS.FAMILIES.reduce((a, f) => a + f.instruments.length, 0) + SS.JUNO_PATCHES.length;
  assert.equal(all.length, n);
  assert.equal(new Set(all.map((e) => e.v)).size, n);
});

test('valeur ↔ réglages de piste, rôle retrouvé', () => {
  assert.deepEqual(C.valueOf({ type: 'synth', patch: 'A36' }), { v: 'j:A36', role: 'strings' });
  assert.deepEqual(C.stateOf('j:A48'), { type: 'synth', analog: 'juno106', patch: 'A48' });
  const bass = SS.findFamily('bass').instruments[0];
  assert.deepEqual(C.valueOf({ type: 'instrument', family: 'bass', instrument: bass.id }), { v: `i:bass:${bass.id}`, role: 'bass' });
  assert.deepEqual(C.stateOf(`i:bass:${bass.id}`), { type: 'instrument', family: 'bass', instrument: bass.id });
  assert.equal(C.valueOf({ type: 'drum' }).role, 'drums');
});

test('mode General MIDI : les 128 programmes, rangés par rôle, sans Juno', () => {
  const all = C.ROLES.flatMap((r) => C.soundsOf(r.id, { gm: true }));
  assert.equal(all.length, 128);
  assert.ok(all.every((e) => /^p\d+$/.test(e.v) && e.src === 'gm'));
  assert.deepEqual(C.soundsOf('bass', { gm: true }).map((e) => e.v), ['p32', 'p33', 'p34', 'p35', 'p36', 'p37', 'p38', 'p39']);
});

test('noms nettoyés, recherche dans tous les rôles', () => {
  assert.deepEqual(C.cleanName('Moog Bass (synthé, ladder + glide)'), { name: 'Moog Bass', detail: 'ladder + glide' });
  assert.deepEqual(C.cleanName('Sax (VCSL)'), { name: 'Sax', detail: '' });
  const g = C.search('strings');
  assert.ok(g.find((x) => x.role.id === 'strings').entries.some((e) => e.v === 'j:A36'));
  assert.ok(C.search('steinway').some((x) => x.role.id === 'keys'), 'le piano Steinway est dans Piano & claviers');
});

test('fichiers VCSL à virgule servis depuis samples/vcsl/ (Chrome refuse la version GitHub)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const base = 'https://raw.githubusercontent.com/sgossner/VCSL/master/';
  const file = 'Chordophones/Zithers/Grand%20Piano%2C%20Steinway%20B/Sus/JHPiano_Sus_Close_A%230_vl4_rr1.wav';
  const url = SS.vcslLocal(base, file);
  assert.equal(url, 'samples/vcsl/Chordophones/Zithers/Grand_Piano_Steinway_B/Sus/JHPiano_Sus_Close_A_0_vl4_rr1.mp3');
  assert.ok(fs.existsSync(path.join(__dirname, '..', url)), 'la copie locale existe');
  assert.equal(SS.vcslLocal(base, 'Idiophones/Struck%20Idiophones/Glockenspiel/x.wav'), null, 'sans virgule : GitHub');
});
