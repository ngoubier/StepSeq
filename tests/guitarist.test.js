/*
 * Guitariste de « Nouvelle chanson » : tables du type guitar (js/guitarist.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['guitar-arp.js', 'guitarist.js'].forEach((f) => require('../js/' + f));
const G = globalThis.SS.guitarist;
const GA = globalThis.SS.GuitarArp;

test('chaque motif guitare a un jeu, une famille et au moins un style', () => {
  for (const m of GA.MOTIFS) {
    const id = 'g:' + m.id;
    assert.ok(['arp', 'acc'].includes(G.jeuOf(id)), id);
    assert.equal(G.jeuOf(id), m.hand === 'gratte' ? 'acc' : 'arp', id);
    assert.ok(G.stylesOf(id).length >= 1, `${id} : un style`);
    assert.ok(G.stylesOf(id).every((s) => G.STYLES.some((x) => x[0] === s)), `${id} : styles connus`);
  }
  assert.equal(G.familyOf('g:palm'), 'etouffe');
  assert.equal(G.familyOf('g:pop'), 'gratte');
  assert.equal(G.familyOf('strum'), 'plaque');
  assert.equal(G.jeuOf('strum'), 'acc');
});

test('modes par jeu, premier mode d’un style, Surprends-moi', () => {
  const arp = G.modesOf('arp');
  const acc = G.modesOf('acc');
  assert.ok(arp.includes('g:travis') && !arp.includes('g:pop'));
  assert.ok(acc.includes('g:pop') && acc.includes('strum'));
  assert.equal(G.firstOf('acc', 'reggae'), 'g:reggae');
  assert.equal(G.firstOf('arp', 'bossa'), 'g:pince');
  const s = G.surprise('acc', 'funk', 'g:funk', 0.5);
  assert.ok(G.inStyle(s, 'funk') && s !== 'g:funk', s);
  assert.equal(G.styleOfSong('latin'), 'reggae');
  assert.equal(G.styleOfSong('zero'), 'all');
});

test('potentiomètres : 0..100 ↔ réglages guitare (étalement en ms)', () => {
  const g = GA.normalize({});
  for (const j of ['arp', 'acc']) for (const [k] of G.KNOBS[j]) {
    const v = G.knobValue(g, k);
    assert.ok(v >= 0 && v <= 100, `${k} ${v}`);
    const back = GA.normalize({ ...g, ...G.knobPatch(k, v) });
    assert.ok(Math.abs(G.knobValue(back, k) - v) <= 3, `${k} aller-retour`);
  }
  assert.deepEqual(G.knobPatch('spread', 100), { spread: 40 });
  assert.deepEqual(G.knobPatch('ring', 50), { ring: 0.5 });
});
