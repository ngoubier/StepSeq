/*
 * Énergie et diagnostic de l'arrangement (js/arrange.js), étape « Arrangement » de l'assistant.
 *   node --test tests/arrange.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/arrange.js');
const A = globalThis.SS.arrange;

const ev = (n) => ({ events: Array.from({ length: n }, (_, i) => ({ step: i, len: 1, notes: [60], vel: 0.8 })) });
const scene = (id, sec, bars, data) => ({ id, sec, name: sec, bars, data });
const groups = [{ id: 'drums', cols: ['kick', 'snare'] }, { id: 'bass', cols: ['bass'] }, { id: 'pad', cols: ['pad'] }, { id: 'lead', cols: ['lead'] }];

test('stats : un kit compte toutes ses pièces, les instruments actifs', () => {
  const s = A.stats(scene('a', 'verse', 4, { kick: { steps: [1, 0, 1, 0] }, snare: { steps: [0, 1] }, bass: ev(8) }), groups);
  assert.deepEqual(s.counts, { drums: 3, bass: 8, pad: 0, lead: 0 });
  assert.equal(s.active, 2);
  assert.equal(s.perBar, 11 / 4);
});

test('energies : la scène la plus pleine vaut 1, la plus vide 0,15', () => {
  const st = [
    A.stats(scene('i', 'intro', 4, { pad: ev(4) }), groups),
    A.stats(scene('v', 'verse', 4, { pad: ev(4), bass: ev(16), kick: { steps: [1, 1] } }), groups),
    A.stats(scene('c', 'chorus', 4, { pad: ev(16), bass: ev(32), kick: { steps: [1, 1, 1, 1] }, lead: ev(16) }), groups),
  ];
  const e = A.energies(st);
  assert.equal(e[0], 0.15);
  assert.equal(e[2], 1);
  assert.ok(e[1] > e[0] && e[1] < e[2]);
});

test('blocks : une scène répétée donne plusieurs passages, positions au milieu', () => {
  const res = { scenes: [scene('i', 'intro', 4, {}), scene('c', 'chorus', 8, {})], song: [{ scene: 'i', repeat: 1 }, { scene: 'c', repeat: 2 }] };
  const b = A.blocks(res);
  assert.equal(b.bars, 20);
  assert.deepEqual(b.list.map((x) => [x.sec, x.start]), [['intro', 0], ['chorus', 4], ['chorus', 12]]);
  assert.equal(b.list[0].t, 2 / 20);
});

test('target : la montée culmine vers la fin, le sommet au milieu redescend', () => {
  assert.ok(A.target('rise', 0.8) > A.target('rise', 0.2));
  assert.ok(A.target('middle', 0.62) > A.target('middle', 0.1) && A.target('middle', 0.62) > A.target('middle', 0.98));
  assert.ok(A.target('waves', 0.9) > A.target('waves', 0.42) && A.target('waves', 0.42) > A.target('waves', 0.65));
});

test('diagnose : refrain trop calme pour sa place → densifier ; une chanson à sa place → ok', () => {
  const res = { scenes: [scene('i', 'intro', 8, {}), scene('v', 'verse', 8, {}), scene('c', 'chorus', 8, {})], song: [{ scene: 'i', repeat: 1 }, { scene: 'v', repeat: 1 }, { scene: 'c', repeat: 1 }] };
  const bl = A.blocks(res).list;
  const flat = A.diagnose([{ sec: 'intro', name: 'Intro', e: 0.15 }, { sec: 'verse', name: 'Couplet', e: 1 }, { sec: 'chorus', name: 'Refrain', e: 0.3 }], bl, 'rise');
  assert.ok(flat.some((x) => x.sec === 'chorus' && x.act === 'denser'), JSON.stringify(flat));
  assert.ok(flat.some((x) => x.sec === 'verse' && x.act === 'lighter'));
  const good = A.diagnose([{ sec: 'intro', name: 'Intro', e: 0.3 }, { sec: 'verse', name: 'Couplet', e: 0.6 }, { sec: 'chorus', name: 'Refrain', e: 0.9 }], bl, 'rise');
  assert.equal(good[0].kind, 'ok');
});
