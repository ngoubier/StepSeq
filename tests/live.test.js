/*
 * Jeu au clavier (js/live.js) : placement d'une note jouée en direct et écriture dans la piste.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'project.js', 'live.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;

test('placement : jeu gardé (décalage), quantifié, et pris dans la boucle de la piste', () => {
  assert.deepEqual(SS.live.place(4.2, 6.1, 0, 16), { step: 4, len: 2, shift: 0.2 });
  assert.deepEqual(SS.live.place(7.7, 7.8, 0, 16), { step: 8, len: 1, shift: -0.3 }); // note très courte : un pas
  assert.deepEqual(SS.live.place(5.4, 9.2, 2, 16), { step: 6, len: 4 }); // croche
  assert.deepEqual(SS.live.place(33.1, 35, 1, 16), { step: 1, len: 2 }); // troisième tour de la boucle
  assert.deepEqual(SS.live.place(14, 20, 1, 16), { step: 14, len: 2 }); // ne déborde pas de la fin
});

test('écriture : accord regroupé, même note remplacée, batterie', () => {
  const t = { type: 'instrument', events: [{ step: 0, len: 2, notes: [60], vel: 0.8 }] };
  SS.live.writeNote(t, { step: 4, len: 2, midi: 64, vel: 0.756 });
  SS.live.writeNote(t, { step: 4, len: 2, midi: 60, vel: 0.756 });
  SS.live.writeNote(t, { step: 0, len: 1, midi: 60, vel: 1, shift: -0.1 }); // remplace la note du pas 0
  assert.deepEqual(t.events, [
    { step: 0, len: 1, notes: [60], vel: 1, shift: -0.1 },
    { step: 4, len: 2, notes: [60, 64], vel: 0.76 },
  ]);
  const d = { type: 'drum', steps: new Array(8).fill(0) };
  SS.live.writeNote(d, { step: 3, len: 1, midi: 60, vel: 0.5 });
  assert.equal(d.steps[3], 0.5);
});

test('clavier : deux octaves et demie, O et P compris, une note par touche', () => {
  const map = new Map(SS.live.KEYMAP);
  assert.equal(map.get('KeyO'), 26);
  assert.equal(map.get('KeyP'), 28);
  assert.equal(map.size, 32);
  assert.equal(new Set(SS.live.KEYMAP.map(([, n]) => n)).size, 32); // de 0 à 31, sans doublon
  SS.live.KEYMAP.forEach(([c]) => assert.ok(SS.live.AZERTY[c], 'lettre affichée pour ' + c));
});
