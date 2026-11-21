/*
 * Tests du mode Guitare d'Arp One (js/guitar-arp.js) — sans navigateur ni carte son.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/arp.js');
require('../js/guitar-arp.js');
const A = globalThis.SS.Arp;
const G = globalThis.SS.GuitarArp;

const Am = [57, 60, 64]; // A3 C4 E4
const C = [60, 64, 67];
const name = (m) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12] + (Math.floor(m / 12) - 1);
// une mesure à 80 BPM, attaques dans l'ordre : « A2+E4 » pour deux cordes ensemble
function bar(guitar, notes, bpm = 80, seed = 1) {
  const arp = A.normalize({ seed, guitar: { on: true, human: 0, ...guitar } });
  const ev = { step: 0, len: 16, notes, vel: 0.8 };
  const sd = 60 / bpm / 4;
  const all = [];
  for (let s = 0; s < 16; s++) A.renderStep(arp, ev, s, { loop: 0, stepSec: sd, stepsPerBeat: 4 }).forEach((n) => all.push({ ...n, t: s * sd + n.at }));
  return all;
}
const seq = (all) => {
  const by = new Map();
  all.forEach((n) => { const k = n.t.toFixed(4); by.set(k, [...(by.get(k) || []), name(n.midi)]); });
  return [...by.values()].map((a) => a.join('+'));
};

test('formes du document : Am x02210, C x32010, G 320003, Em 022000 (notes réelles)', () => {
  const g = G.normalize({});
  const real = (n) => G.shapeFor(n, g).notes.filter((x) => x != null).map(name).join(' ');
  assert.equal(real(Am), 'A2 E3 A3 C4 E4');
  assert.equal(real(C), 'C3 E3 G3 C4 E4');
  assert.equal(real([55, 59, 62]), 'G2 B2 D3 G3 B3 G4');
  assert.equal(real([52, 55, 59]), 'E2 B2 E3 G3 B3 E4');
  // barré : Bm (forme de La en case 2), F# barré sur la 6e corde en case 2
  assert.deepEqual(G.shapeFor([59, 62, 66], g).frets, [null, 2, 4, 4, 3, 2]);
  assert.deepEqual(G.shapeFor([54, 58, 61], G.normalize({ pos: 'barreE' })).frets, [2, 4, 4, 3, 2, 2]);
  // capodastre case 2 : B mineur joué avec la forme de La mineur
  assert.deepEqual(G.shapeFor([59, 62, 66], G.normalize({ capo: 2 })).frets, [null, 2, 4, 4, 3, 2]);
});

test('motif A (Am) : A2 A3 C4 E4 | A2 C4 A3 C4, vélocités 82 … 64 du document', () => {
  const all = bar({ motif: 'classA', thumb: 0, mel: 0 }, Am);
  assert.deepEqual(seq(all).slice(0, 8), ['A2', 'A3', 'C4', 'E4', 'A2', 'C4', 'A3', 'C4']);
  assert.deepEqual(all.slice(0, 8).map((n) => Math.round(n.vel * 127)), [82, 65, 69, 79, 76, 66, 62, 64]);
  assert.deepEqual(all.slice(0, 4).map((n) => n.label), ['p', 'i', 'm', 'a']);
});

test('motif B (Travis sur C) : (C3+E4) G3 E3 C4 | C3 G3 E3 C4', () => {
  assert.deepEqual(seq(bar({ motif: 'travis' }, C)).slice(0, 8), ['C3+E4', 'G3', 'E3', 'C4', 'C3', 'G3', 'E3', 'C4']);
});

test('variante C 6/8 : A2 A3 C4 | E4 C4 A3, en triolets', () => {
  const all = bar({ motif: 'pimami' }, Am);
  assert.deepEqual(seq(all).slice(0, 6), ['A2', 'A3', 'C4', 'E4', 'C4', 'A3']);
  assert.ok(Math.abs(all[1].t - 60 / 80 / 3) < 1e-9);
});

test('médiator : aller-retour sur C = cordes 5 4 3 2 1 2 3 4, bas / haut', () => {
  const all = bar({ motif: 'aller' }, C);
  assert.deepEqual(seq(all).slice(0, 8), ['C3', 'E3', 'G3', 'C4', 'E4', 'C4', 'G3', 'E3']);
  assert.deepEqual(all.slice(0, 4).map((n) => n.label), ['↓', '↑', '↓', '↑']);
});

test('résonance : une corde rejouée coupe sa note ; détaché < résonant ; tout sonne = jusqu’à la reprise', () => {
  const sd = 60 / 80 / 4;
  const det = bar({ motif: 'classA', ring: 0 }, Am);
  const mid = bar({ motif: 'classA', ring: 0.55 }, Am);
  const all = bar({ motif: 'classA', ring: 1 }, Am);
  assert.ok(det[0].dur < 0.4 && mid[0].dur > 0.6 && mid[0].dur <= 1.3); // basse ≈ 700 ms au milieu
  assert.ok(Math.abs(all[0].dur - 8 * sd) < 1e-9); // la basse sonne jusqu'à sa reprise (temps 3)
  assert.ok(Math.abs(all[2].dur - 6 * sd) < 1e-9); // C4 (pas 3) jusqu'au C4 du pas 6
  for (const n of mid) assert.ok(n.dur <= (16 * sd - n.t) + 1e-9); // rien ne dépasse le changement d'accord
});

test('main humaine : déterministe, les basses des temps 1 et 3 restent sur la grille', () => {
  const a = bar({ motif: 'classA', human: 0.8 }, Am, 80, 7);
  const b = bar({ motif: 'classA', human: 0.8 }, Am, 80, 7);
  assert.deepEqual(a, b);
  const sd = 60 / 80 / 4;
  assert.equal(a[0].t, 0);
  assert.ok(Math.abs(a[4].t - 8 * sd) < 1e-12);
  assert.ok(Math.abs(a[1].t - 2 * sd) > 0.002); // « & » de 1 décalé (+8 ms dans le document)
});

test('mode Guitare éteint : l’arpège clavier est inchangé ; réglages gardés', () => {
  const o = A.normalize({ mode: 'up', rate: 1, guitar: { on: false, motif: 'travis' } });
  assert.equal(o.guitar.motif, 'travis');
  const ev = { step: 0, len: 16, notes: C, vel: 0.8 };
  const n = A.renderStep(o, ev, 0, { loop: 0, stepSec: 0.125, stepsPerBeat: 4 });
  assert.deepEqual(n.map((x) => x.midi), [60]);
  assert.equal(A.normalize({}).guitar, undefined);
});
