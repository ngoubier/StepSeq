/*
 * Figer une piste (js/freeze.js) : segments à enregistrer, clés de contenu, projet envoyé au rendu, découpe.
 * Le rendu et la lecture sont testés de bout en bout : node tests/e2e/freeze.js
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'chords.js', 'freeze.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const F = SS.freeze;

function song() {
  const p = SS.newProject();
  p.tempo = 120;
  const t = SS.newTrack({ name: 'Nappe', color: '#00f', type: 'instrument', family: 'pad', instrument: 'warm' }, p);
  t.events = [{ step: 0, len: 8, notes: [60], vel: 0.8 }];
  t.freeze = { on: true };
  p.tracks = [t];
  const a = p.scenes[0];
  a.bars = 1;
  p.bars = 1;
  p.scenes.push({ id: 'b', name: 'Refrain', bars: 2, data: { [t.id]: { events: [{ step: 4, len: 4, notes: [64], vel: 0.8 }] } } });
  p.song = [{ scene: a.id, repeat: 2 }, { scene: 'b', repeat: 1 }, { scene: a.id, repeat: 2 }];
  return { p, t, a };
}

test('segments : un par bloc différent de l’arrangement, plus la boucle de chaque scène', () => {
  const { p, t, a } = song();
  const s = F.segments(p, t);
  const lk = s.map((x) => x.lookup).sort();
  assert.deepEqual(lk, [F.lookup(a.id, 1, ''), F.lookup(a.id, 2, ''), F.lookup('b', 1, '')].sort());
  // même contenu, même clé : deux pistes identiques ou un aller-retour ne réenregistrent rien
  assert.equal(F.segments(p, t).map((x) => x.key).join(), s.map((x) => x.key).join());
});

test('clés : volume, effets, nom ne changent rien ; notes d’une scène ne changent que ses segments', () => {
  const { p, t, a } = song();
  const k0 = Object.fromEntries(F.segments(p, t).map((x) => [x.lookup, x.key]));
  t.volume = 0.2;
  t.fx = { delay: 0.5 };
  t.name = 'Autre';
  t.mute = true;
  const k1 = Object.fromEntries(F.segments(p, t).map((x) => [x.lookup, x.key]));
  assert.deepEqual(k1, k0);
  p.scenes[1].data[t.id].events[0].notes = [65];
  const k2 = Object.fromEntries(F.segments(p, t).map((x) => [x.lookup, x.key]));
  assert.equal(k2[F.lookup(a.id, 2, '')], k0[F.lookup(a.id, 2, '')]);
  assert.notEqual(k2[F.lookup('b', 1, '')], k0[F.lookup('b', 1, '')]);
  // le son change tout
  t.octave = 2;
  const k3 = Object.fromEntries(F.segments(p, t).map((x) => [x.lookup, x.key]));
  assert.notEqual(k3[F.lookup(a.id, 2, '')], k0[F.lookup(a.id, 2, '')]);
  // tempo de la chanson : les scènes sans tempo propre changent
  p.scenes[1].tempo = 100;
  const k4 = Object.fromEntries(F.segments(p, t).map((x) => [x.lookup, x.key]));
  p.tempo = 90;
  const k5 = Object.fromEntries(F.segments(p, t).map((x) => [x.lookup, x.key]));
  assert.equal(k5[F.lookup('b', 1, '')], k4[F.lookup('b', 1, '')]);
  assert.notEqual(k5[F.lookup(a.id, 1, '')], k4[F.lookup(a.id, 1, '')]);
});

test('mode Scène : pistes de longueurs différentes, la boucle dure jusqu’au réalignement', () => {
  const { p, t, a } = song();
  assert.equal(F.loopReps(p, a), 1);
  t.length = 12; // 12 pas dans une scène de 16 : réaligné après 3 passages
  assert.equal(F.loopReps(p, a), 3);
  t.length = 13;
  assert.equal(F.loopReps(p, a), 0); // trop long : la piste joue en direct en mode Scène
});

test('rendu : piste seule, blocs séparés par une scène vide plus longue que la queue', () => {
  const { p, t, a } = song();
  const segs = F.segments(p, t);
  const r = F.prepare(p, t, segs);
  const d = JSON.parse(r.json);
  assert.equal(d.tracks.length, 1);
  assert.equal(d.tracks[0].freeze, undefined);
  assert.equal(d.song.length, segs.length * 2);
  const gap = d.scenes.find((x) => x.id === d.song[1].scene);
  const gapSec = (gap.bars * 16 * 60) / gap.tempo / 4;
  assert.ok(gapSec >= F.TAIL + F.PREROLL);
  // débuts des segments : pré-roll, puis durée de chaque bloc et de la scène vide
  const sec = (s) => (s.repeat * 16 * (s.scene === 'b' ? 2 : 1) * 60) / 120 / 4;
  let at = F.PREROLL;
  segs.forEach((s, i) => {
    assert.ok(Math.abs(r.offs[i][0] - at) < 1e-9);
    assert.ok(Math.abs(r.offs[i][1] - sec(s)) < 1e-9);
    at += sec(s) + gapSec;
  });
});

test('découpe : pré-roll, segment, queue coupée au silence', () => {
  const sr = 1000;
  const L = new Float32Array(20 * sr);
  const R = new Float32Array(20 * sr);
  // segment de 2 s à 1 s, son jusqu'à 3,5 s (queue de 0,5 s)
  for (let i = 1000; i < 3500; i++) L[i] = R[i] = 0.5;
  const { l } = F.slice(L, R, sr, 1, 2);
  assert.equal(l.length, 3500 - Math.round((1 - F.PREROLL) * sr));
  // aucun son après le segment : la découpe garde au moins le segment entier
  const { l: l2 } = F.slice(new Float32Array(20 * sr), new Float32Array(20 * sr), sr, 1, 2);
  assert.equal(l2.length, Math.round((F.PREROLL + 2) * sr));
});

test('projet : figée gardée à l’ouverture, pas sur la batterie', () => {
  const { p, t } = song();
  const d = SS.newTrack({ name: 'Kick', color: '#f00', type: 'drum', sound: 'bd' }, p);
  d.freeze = { on: true };
  p.tracks.push(d);
  const q = SS.normalizeProject(JSON.parse(SS.serialize(p)));
  assert.deepEqual(q.tracks[0].freeze, { on: true });
  assert.equal(q.tracks[1].freeze, undefined);
  assert.equal(F.isOn(q.tracks[0]), true);
  assert.equal(F.isOn(q.tracks[1]), false);
  t.freeze = { re: true, x: 1 };
  assert.deepEqual(SS.normalizeProject(JSON.parse(SS.serialize(p))).tracks[0].freeze, { re: true });
});
