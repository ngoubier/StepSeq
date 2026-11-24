/*
 * Riffs du Guitariste (js/guitar-riffs.js) et leur passage dans la chanson (js/bandsong.js, mode « r:<riff> »).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'arp.js', 'guitar-arp.js', 'guitar-riffs.js', 'band-presets.js', 'band-songs.js', 'melody.js', 'bandsong.js', 'bandgroup.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const RF = SS.GuitarRiffs;
const AM = { rootPc: 9, type: 'min' };
const C = { rootPc: 0, type: 'maj' };
const span = (chord, step, len) => ({ step, len, chord });

test('chaque riff : 16 jetons valides, une famille, des styles', () => {
  for (const r of RF.RIFFS) {
    assert.equal(r.steps.length, 16, r.id);
    assert.ok(r.steps.every(RF.validTok), r.id);
    assert.ok(RF.FAMILIES.some(([f]) => f === r.fam), r.id);
    assert.ok((RF.STYLES[r.id] || []).length, r.id);
  }
});

test('degrés → notes : fondamentale entre Mi 2 et Ré♯ 3, tierce selon l’accord, power chord, octave au-dessus', () => {
  assert.deepEqual(RF.notesOf('R5', AM), [45, 52]);
  assert.deepEqual(RF.notesOf('3', AM), [48]);
  assert.deepEqual(RF.notesOf('3', C), [52]);
  assert.deepEqual(RF.notesOf('R', { rootPc: 4, type: 'maj' }), [40]);
  assert.deepEqual(RF.notesOf('R', { rootPc: 3, type: 'maj' }), [51]);
  assert.deepEqual(RF.notesOf('8', C, 12), [72]);
});

test('le riff suit les accords, ou reste fixe ; étouffés courts, swing sur les contretemps', () => {
  const spans = [span(AM, 0, 16), span(C, 16, 16)];
  const ev = RF.events(spans, 'power', {}, 32, 1);
  assert.equal(ev.filter((e) => e.step < 16).length, 8);
  assert.deepEqual(ev.find((e) => e.step === 0).notes, [45, 52]);
  assert.deepEqual(ev.find((e) => e.step === 16).notes, [48, 55]);
  assert.equal(ev.find((e) => e.step === 2).len, 1, 'R5_ étouffé');
  const fixed = RF.events(spans, 'power', { fixed: true }, 32, 1);
  assert.deepEqual(fixed.find((e) => e.step === 16).notes, [45, 52], 'notes fixes : celles du premier accord');
  const sw = RF.events(spans, 'octaves', { swing: 1, human: 0 }, 32, 1);
  assert.ok(sw.find((e) => e.step === 2).shift > 0.5 && !sw.find((e) => e.step === 0).shift, 'swing');
  assert.deepEqual(RF.events(spans, 'power', {}, 32, 1), ev, 'déterministe');
});

test('riff réécrit (pat) : gardé s’il a 16 jetons valides', () => {
  assert.equal(RF.normalize({ pat: 'R . . . . . . . . . . . . . . 5' }).pat, 'R . . . . . . . . . . . . . . 5');
  assert.equal(RF.normalize({ pat: 'R . 9' }).pat, undefined);
  assert.equal(RF.normalize({ pat: 'R q . . . . . . . . . . . . . .' }).pat, undefined);
});

test('chanson : un Guitariste ajouté en « r:boogie » joue le riff sur les accords de la scène ; hors 4/4, un motif de guitare', () => {
  const BG = SS.bandGroup;
  const p = SS.Band.STYLES.flatMap((s) => s.presets).find((x) => x.id === 'smalltown');
  const g = BG.defaultGroup(p);
  const r = BG.add(g, 'guitar');
  const tr = g.list.flatMap((x) => {
    if (!x.base) return [{ id: x.id, type: 'instrument', band: { musician: x.id, key: 'guitar' } }];
    const m = p.musicians.find((y) => y.id === x.base);
    return m.kits ? [] : [{ id: m.id, type: 'instrument', band: { musician: m.id, key: m.role } }];
  });
  const id = SS.bandSong.instIds(tr).find((x) => x.id.startsWith(r.id + ':')).id;
  const parts = { chorus: { inst: { [id]: { mode: 'r:boogie', riff: { oct: 12 } } } } };
  const sc = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr, { parts }).scenes.find((x) => x.sec === 'chorus');
  const ev = sc.data[r.id].events;
  assert.ok(ev.length >= sc.bars * 4 && ev.every((e) => e.notes.length === 2 && e.notes[0] >= 52 && e.notes[0] <= 63), 'quintes/sixtes une octave plus haut');
  const t34 = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr, { parts, sig: '3/4' }).scenes.find((x) => x.sec === 'chorus').data[r.id].events;
  assert.ok(t34.length && t34.every((e) => e.notes.length === 1), '3/4 : motif de guitare à la place');
  SS.bandSong.setMeter('4/4');
});
