// ★ par type de scène pour la Basse, la Nappe, le Guitariste et l'Arpège (js/scenestars.js).
const test = require('node:test');
const assert = require('node:assert');
globalThis.window = globalThis;
require('../js/motifpicker.js');
require('../js/padmotifs.js');
require('../js/scenestars.js');
const ST = SS.sceneStars;

test('type de scène d’après son nom', () => {
  assert.deepStrictEqual(['intro', 'verse2', 'pre', 'chorus', 'bridge', 'outro', 'drop'].map(ST.kindOf), ['intro', 'verse', 'pre', 'chorus', 'bridge', 'outro', 'chorus']);
});

test('pick : tour à tour dans les familles préférées, sans doublon', () => {
  const fam = { a1: 'a', a2: 'a', b1: 'b', b2: 'b', c1: 'c' };
  assert.deepStrictEqual(ST.pick(Object.keys(fam), (id) => fam[id], ['b', 'a']), ['b1', 'a1', 'b2']);
  assert.deepStrictEqual(ST.pick(Object.keys(fam), (id) => fam[id], ['c']), ['c1']);
  assert.deepStrictEqual(ST.pick(Object.keys(fam), (id) => fam[id], ['z']), []);
});

test('Arpège : des modes calmes en intro, rapides au refrain, dans la mesure', () => {
  assert.strictEqual(ST.sceneDefault('arp', 'intro', 'synthwave'), 'bells');
  assert.strictEqual(ST.sceneDefault('arp', 'chorus', 'synthwave'), 'up16');
  const tern = ['alb3', 'wave6', 'tri8'];
  assert.ok(ST.sceneStars('arp', 'chorus', 'synthwave', { ok: (m) => tern.includes(m) }).every((m) => tern.includes(m)));
});

test('Nappe : tenues en intro, rythmées au refrain, dans le style de la chanson', () => {
  const P = SS.padMotifs;
  const intro = ST.sceneStars('chords', 'intro', 'synthwave');
  const chorus = ST.sceneStars('chords', 'chorus', 'funk');
  assert.strictEqual(P.familyOf(intro[0]), 'tenue');
  assert.strictEqual(P.familyOf(chorus[0]), 'rythme');
  assert.ok(chorus.every((id) => P.inGroup('funk').includes(id)), chorus.join());
});

test('sans catalogue : pas de ★', () => {
  assert.deepStrictEqual(ST.sceneStars('bass', 'chorus', 'funk'), []);
  assert.strictEqual(ST.sceneDefault('keys', 'chorus', 'funk'), null);
});
