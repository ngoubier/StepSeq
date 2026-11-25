/*
 * Carte Motif commune (js/motifpicker.js) : styles communs, familles, conseillés en tête ; catalogues de la basse et
 * de la nappe rangés sous ces styles.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'melody.js', 'bandsong.js', 'motifpicker.js', 'padmotifs.js', 'bassmotifs.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const MP = SS.motifPicker;

test('styles communs : un style de chanson de l’assistant mène à un style commun', () => {
  assert.equal(MP.STYLES.length, 9);
  SS.Band.STYLES.forEach((s) => assert.ok(s.id === 'zero' || MP.STYLE_IDS.includes(MP.styleOfSong(s.id)), s.id));
  assert.equal(MP.styleOfSong('zero'), 'all');
  assert.equal(MP.styleOfSong('edm'), 'electro');
});

test('familles : ★ seulement si la scène a des conseillés, conseillés en tête', () => {
  const fam = { a: 'x', b: 'y', c: 'x', d: 'y' };
  const familyOf = (id) => fam[id];
  assert.equal(MP.famShown(undefined, []), 'all');
  assert.equal(MP.famShown(undefined, ['b']), 'star');
  assert.equal(MP.famShown('star', []), 'all');
  assert.deepEqual(MP.visible(['a', 'b', 'c', 'd'], { fam: 'all', stars: ['c'], familyOf }), ['c', 'a', 'b', 'd']);
  assert.deepEqual(MP.visible(['a', 'b', 'c', 'd'], { fam: 'star', stars: ['d', 'b'], familyOf }), ['b', 'd']);
  assert.deepEqual(MP.visible(['a', 'b', 'c', 'd'], { fam: 'x', stars: [], familyOf }), ['a', 'c']);
});

test('basse et nappe : leurs styles sont les styles communs (plus Célèbres et 3/4 · 6/8), leurs familles sont nommées', () => {
  const own = ['ternary', 'famous'];
  [SS.bassMotifs, SS.padMotifs].forEach((L) => {
    L.GROUPS.forEach((g) => assert.ok(MP.STYLE_IDS.includes(g[0]) || own.includes(g[0]), g[0]));
    assert.ok(L.FAMS.length >= 3 && L.FAMS.every((f) => f[0] && f[1]));
  });
  assert.equal(SS.bassMotifs.GROUPS.find((g) => g[0] === 'famous')[1], 'Célèbres', 'plus de ★ : il veut dire « conseillé pour la scène »');
  const seen = SS.bassMotifs.FAMS.flatMap((f) => f[2]);
  assert.equal(new Set(seen).size, seen.length, 'un motif de basse dans une seule famille');
  SS.padMotifs.all().forEach((id) => assert.ok(SS.padMotifs.FAMS.some((f) => f[0] === SS.padMotifs.familyOf(id)), id));
  assert.equal(SS.padMotifs.groupOfStyle('dnb'), 'electro');
  assert.equal(SS.bassMotifs.groupOfStyle('ambient'), 'synth');
});
