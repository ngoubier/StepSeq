/*
 * Orchestre de l'assistant (js/orchestra.js) : effectifs, tessitures, répartition des voix.
 *   node --test tests/orchestra.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/orchestra.js');
const O = globalThis.SS.orchestra;

// Am | F | C | G, une mesure chacun (fondamentale d'abord)
const SPANS = [
  { step: 0, len: 16, pcs: [9, 0, 4] },
  { step: 16, len: 16, pcs: [5, 9, 0] },
  { step: 32, len: 16, pcs: [0, 4, 7] },
  { step: 48, len: 16, pcs: [7, 11, 2] },
];
// mélodie avec deux silences (mes. 2 et 4)
const MEL = [
  { step: 0, len: 8, midi: 76 }, { step: 8, len: 8, midi: 72 },
  { step: 32, len: 8, midi: 76 }, { step: 40, len: 4, midi: 79 },
];
const notesOf = (l) => l.events.flatMap((e) => e.notes);
const inRange = (id, l) => notesOf(l).every((m) => m >= O.PART[id].lo && m <= O.PART[id].hi);

test('effectifs : chaque pupitre existe, avec un son du catalogue et une zone confortable dans sa tessiture', () => {
  for (const e of O.ENSEMBLES) for (const id of e.parts) assert.ok(O.PART[id], `${e.id} : ${id}`);
  for (const p of O.PARTS) assert.ok(/^(gm|vsco|vcsl)_/.test(p.tok) && p.lo <= p.clo && p.clo < p.chi && p.chi <= p.hi, p.id);
  assert.deepEqual(['light', 'mid', 'full'].map((x) => x), O.LEVELS.map((l) => l.id));
  assert.equal(O.levelOf(0.8), 'light');
  assert.equal(O.levelOf(0.88), 'mid');
  assert.equal(O.levelOf(1), 'full');
});

test('cordes, densité moyenne : basse aux contrebasses, harmonie une note par pupitre, sans croisement, sous la mélodie', () => {
  const { lines, items } = O.orchestrate({ parts: O.ENS.strings.parts, spans: SPANS, melody: MEL, level: 'mid' });
  assert.equal(lines.cb.role, 'bass');
  assert.deepEqual(lines.cb.events.map((e) => e.notes[0] % 12), [9, 5, 0, 7], 'la basse de chaque accord');
  for (const id of ['vl1', 'vl2', 'va', 'vc']) assert.equal(lines[id].role, 'harmony', id);
  for (const id of O.ENS.strings.parts) assert.ok(inRange(id, lines[id]), id + ' dans sa tessiture');
  for (let i = 0; i < 4; i++) {
    const at = (id) => lines[id].events.find((e) => e.step <= i * 16 && e.step + e.len > i * 16).notes[0];
    const vs = ['vl1', 'vl2', 'va', 'vc'].map(at);
    assert.ok(vs.every((m, k) => k === 0 || m < vs[k - 1]), `mes. ${i + 1} : du plus aigu au plus grave ${vs}`);
    assert.ok(vs.every((m) => SPANS[i].pcs.includes(m % 12)), `mes. ${i + 1} : notes de l'accord`);
  }
  assert.ok(Math.max(...notesOf(lines.vl1).slice(0, 1)) < 72, 'sous la mélodie (mes. 1)');
  assert.ok(items.some((x) => x.kind === 'ok'), 'tout dans la tessiture');
});

test('densité pleine : les premiers violons doublent la mélodie ; les bois jouent le contrechant dans les silences', () => {
  const { lines } = O.orchestrate({ parts: O.ENS.chamber.parts, spans: SPANS, melody: MEL, level: 'full' });
  assert.equal(lines.vl1.role, 'melody');
  const sh = lines.vl1.events[0].notes[0] - MEL[0].midi;
  assert.equal(sh % 12, 0, 'transposée d’octaves');
  assert.ok(lines.vl1.events.every((e, i) => e.notes[0] - MEL[i].midi === sh), 'toute la mélodie, même transposition');
  assert.equal(lines.fl.role, 'counter');
  assert.ok(lines.fl.events.length >= 2 && lines.fl.events.every((e) => !MEL.some((n) => n.step < e.step + e.len && n.step + n.len > e.step)), 'la flûte ne joue que dans les silences');
  assert.equal(lines.hn.role, 'harmony');
});

test('densité légère : cordes seules, bois et cor se taisent ; un pupitre coupé se tait', () => {
  const { lines } = O.orchestrate({ parts: O.ENS.chamber.parts, spans: SPANS, melody: MEL, level: 'light', off: ['va'] });
  assert.equal(lines.fl.role, 'tacet');
  assert.equal(lines.hn.role, 'tacet');
  assert.equal(lines.va.role, 'tacet');
  assert.equal(lines.va.events.length, 0);
  assert.equal(lines.vl1.role, 'harmony', 'pas de doublure en densité légère');
});

test('hybride : la nappe joue l’accord entier ; sans contrebasses, le pupitre le plus grave prend la basse ; notes tenues liées', () => {
  const { lines } = O.orchestrate({ parts: O.ENS.hybrid.parts, spans: SPANS, melody: [], level: 'mid', off: ['cb'] });
  assert.equal(lines.syn.role, 'pad');
  assert.ok(lines.syn.events.every((e, i) => e.notes.length === 3 && e.notes.every((m) => SPANS[i].pcs.includes(m % 12))));
  assert.equal(lines.vc.role, 'bass');
  const same = O.orchestrate({ parts: ['vl1', 'cb'], spans: [{ step: 0, len: 16, pcs: [9, 0, 4] }, { step: 16, len: 16, pcs: [9, 0, 4] }], level: 'mid' });
  assert.deepEqual(same.lines.cb.events.map((e) => [e.step, e.len]), [[0, 32]], 'même accord : la note est tenue');
});

test('articulations : trémolo, pizzicato, spiccato au moteur, claviers d’orchestre, et silence sans demande', () => {
  const parts = O.ENS.romantique.parts;
  const plain = O.orchestrate({ parts, spans: SPANS, melody: MEL, level: 'mid' });
  for (const id of ['vlt', 'vlp', 'gl', 'ma', 'bl']) assert.equal(plain.lines[id].role, 'tacet', id + ' se tait sans demande');
  // trémolo : les violons passent au pupitre trémolo, les mêmes notes
  const tr = O.orchestrate({ parts, spans: SPANS, melody: MEL, level: 'mid', art: { trem: true } });
  assert.equal(tr.lines.vl1.role, 'tacet');
  assert.deepEqual(notesOf(tr.lines.vlt).sort(), notesOf(plain.lines.vl1).concat(notesOf(plain.lines.vl2)).sort());
  // pizzicato : une attaque par temps
  const pz = O.orchestrate({ parts, spans: SPANS, melody: MEL, level: 'mid', art: { pizz: true } });
  assert.ok(pz.lines.vlp.events.length && pz.lines.vlp.events.every((e) => e.step % 4 === 0 && e.len <= 4));
  // claviers : glockenspiel deux octaves au-dessus du sommet, marimba, une cloche sur l'impact
  const kb = O.orchestrate({ parts, spans: SPANS, melody: MEL, level: 'mid', art: { glock: true, marimba: true, bells: true } });
  assert.ok(kb.lines.gl.events.length && inRange('gl', kb.lines.gl));
  assert.ok(kb.lines.ma.events.length && inRange('ma', kb.lines.ma));
  assert.deepEqual(kb.lines.bl.events.map((e) => e.step), [0]);
  // moteur : spiccato aux violoncelles
  const ep = O.orchestrate({ parts: O.ENS.epique.parts, spans: SPANS, melody: MEL, level: 'full', motor: true, art: { motor: true } });
  assert.equal(ep.lines.vcs.role, 'motor');
  assert.ok(ep.lines.vcs.events.length);
});
