/*
 * Procédés de la formation (docs/reference/formation-composition/23_bibliotheque_de_procedes.md) :
 * basses B01–B04 (styles de basse de la grille, js/harmony.js), arpège huit pas A03 (Arp One, js/arp.js),
 * transitions T01–T05 (étape « Effets et transitions » de l'assistant, js/bandsong.js).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'arp.js', 'band-presets.js', 'band-songs.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const H = SS.harmony;

const C = { tonic: 'C', mode: 'major' };
const Am = { tonic: 'A', mode: 'minor' };
/** Une mesure par accord : [notes MIDI de l'accord, type]. */
const chordsOf = (list) => list.map(([notes, chord], i) => ({ step: i * 16, len: 16, notes, chord }));
const gen = (kind, evs, key) => H.generate(evs, { kind, octave: 2, spb: 16, beat: 4, key, length: evs.length * 16 });
const pc = (m) => ((m % 12) + 12) % 12;

test('B01–B04 sont des styles de basse de la grille', () => {
  const ids = H.GENERATORS.filter((g) => g.group === 'Basse').map((g) => g.id);
  ['bass-b01', 'bass-b02', 'bass-b03', 'bass-b04'].forEach((id) => assert.ok(ids.includes(id), id));
});

test('B01 : huit croches sur la fondamentale, accents différenciés, une seule approche vers l’accord suivant', () => {
  const evs = chordsOf([[[57, 60, 64], 'min'], [[53, 57, 60], 'maj']]); // Am – F
  const b = gen('bass-b01', evs, Am);
  const bar1 = b.filter((e) => e.step < 16);
  assert.equal(bar1.length, 8);
  assert.ok(bar1.slice(0, 7).every((e) => pc(e.notes[0]) === 9), 'La sur les sept premières croches');
  assert.ok(pc(bar1[7].notes[0]) !== 9, 'la dernière croche approche le Fa');
  assert.ok(Math.abs(bar1[7].notes[0] - b.find((e) => e.step === 16).notes[0]) <= 2, 'approche à un degré du Fa');
  assert.ok(bar1[0].vel > bar1[4].vel && bar1[4].vel > bar1[2].vel && bar1[2].vel > bar1[1].vel, '1er temps > 3e > 2e > contretemps');
  // dernière mesure : pas d'accord suivant, pas d'approche
  assert.ok(b.filter((e) => e.step >= 16).every((e) => pc(e.notes[0]) === 5));
});

test('B02 : noires alternées fondamentale / quinte au-dessus (La2 – Mi3 sur Am)', () => {
  const b = gen('bass-b02', chordsOf([[[57, 60, 64], 'min']]), Am);
  assert.deepEqual(b.map((e) => [e.step, e.len]), [[0, 4], [4, 4], [8, 4], [12, 4]]);
  assert.equal(b[1].notes[0] - b[0].notes[0], 7);
  assert.equal(b[0].notes[0], 45, 'La2');
});

test('B03 : ligne conjointe sur C – G – Am – F : Do, Si, La… (la basse choisit la note de l’accord la plus proche)', () => {
  const evs = chordsOf([[[60, 64, 67], 'maj'], [[55, 59, 62], 'maj'], [[57, 60, 64], 'min'], [[53, 57, 60], 'maj']]);
  const line = gen('bass-b03', evs, C).filter((e) => e.step % 16 === 0).map((e) => e.notes[0]);
  assert.deepEqual(line.slice(0, 3).map(pc), [0, 11, 9], 'Do – Si – La');
  for (let i = 1; i < line.length; i++) assert.ok(Math.abs(line[i] - line[i - 1]) <= 2, `mouvement conjoint ${line[i - 1]} → ${line[i]}`);
  // basse imposée (C/E) respectée
  const slash = [{ step: 0, len: 16, notes: [52, 60, 64, 67], chord: 'maj' }];
  assert.equal(pc(gen('bass-b03', slash, C)[0].notes[0]), 4);
});

test('B04 : pédale de tonique sous Am – F – Dm – E7, une attaque par mesure', () => {
  const evs = chordsOf([[[57, 60, 64], 'min'], [[53, 57, 60], 'maj'], [[50, 53, 57], 'min'], [[52, 56, 59, 62], '7']]);
  const b = gen('bass-b04', evs, Am);
  assert.equal(b.length, 4);
  assert.ok(b.every((e) => e.notes[0] === b[0].notes[0] && pc(e.notes[0]) === 9 && e.len === 16));
});

test('A03 : arpège huit pas, pool redéfini à chaque accord (1 2 3 4 3 2 3 2)', () => {
  const A = SS.Arp;
  const arp = A.fromPreset('a03');
  assert.equal(arp.rate, 0.5);
  const seq = (notes) => A.preview(arp, notes, 8).map((t) => t.notes[0]);
  const am7 = seq([57, 60, 64, 67]);
  assert.deepEqual(am7, [57, 60, 64, 67, 64, 60, 64, 60], 'Am7 : La Do Mi Sol Mi Do Mi Do');
  const c = seq([60, 64, 67]);
  assert.deepEqual(c, [60, 64, 67, 72, 67, 64, 67, 64], 'C sans septième : l’octave complète le pool');
});

/* ---------- transitions T01–T05 ---------- */
const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets.map((p) => ({ ...p, style: st.id })));
const tracksOf = (p) =>
  p.musicians.filter((m) => !m.injected).flatMap((m) =>
    m.kits
      ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } }))
      : [{ id: m.role, type: 'instrument', band: { key: m.role } }]
  );
const P = PRESETS.find((x) => x.id === 'powersoften');
const spec = SS.BandSongs[P.id];
const tr = tracksOf(P);
const ids = spec.form.split(/\s+/).map((x) => x.split('*')[0]);
// une jonction dont la scène d'avant a de la batterie, une basse et une mélodie, et dont la suivante a des accords
const SPB = 16;
const base = SS.bandSong.build(spec, P.id, tr);
const scene = (r, sec) => r.scenes.find((s) => s.sec === sec);
const plays = (d) => d && (d.steps ? d.steps.some((v) => v > 0) : d.events.length > 0);
const J = (() => {
  for (let i = 0; i < ids.length - 1; i++) {
    const a = scene(base, ids[i]);
    const b = scene(base, ids[i + 1]);
    if (ids[i] === ids[i + 1] || a.bars < 4 || spec.sections[ids[i]].gap) continue;
    const d = a.data;
    if (plays(d['drums:bd']) && plays(d.bass) && Object.keys(d).some((k) => ['lead', 'vox', 'sax'].includes(k) && plays(d[k])) && plays(b.data.pad)) return { from: ids[i], to: ids[i + 1], key: `${ids[i]}>${ids[i + 1]}` };
  }
  return null;
})();
const mk = (junction) => SS.bandSong.build(spec, P.id, tr, { fx: { junctions: { [J.key]: junction } } });

test('transitions : les procédés T01–T05 sont éteints dans le plan (mêmes notes)', () => {
  assert.ok(J, 'jonction de test trouvée');
  const D = SS.bandSong.junctionDefaults(spec, J.from, J.to);
  ['retrait', 'frag', 'pedal', 'widen', 'susp'].forEach((k) => assert.equal(D[k].on, false, k));
});

test('T01 retrait : la batterie se tait sur la dernière mesure, le charleston fermé garde le compte', () => {
  const r = scene(mk({ retrait: { on: true, len: 1 } }), J.from);
  const a = scene(base, J.from);
  const n = r.bars * SPB;
  assert.ok(r.data['drums:bd'].steps.slice(n - SPB).every((v) => v === 0), 'grosse caisse coupée');
  assert.deepEqual(r.data['drums:bd'].steps.slice(0, n - SPB), a.data['drums:bd'].steps.slice(0, n - SPB), 'le reste ne change pas');
  const hh = r.data['drums:hh'];
  if (hh && a.data['drums:hh'].steps.slice(n - SPB).some((v) => v > 0)) assert.ok(hh.steps.slice(n - SPB).some((v) => v > 0), 'charleston présent');
  assert.deepEqual(r.data.bass, a.data.bass, 'la basse joue');
});

test('T02 fragmentation : 1 mesure du motif, puis la demi-mesure deux fois', () => {
  const r = scene(mk({ frag: { on: true } }), J.from);
  const a = scene(base, J.from);
  const n = r.bars * SPB;
  const mel = Object.keys(a.data).find((k) => ['lead', 'vox', 'sax'].includes(k) && a.data[k].events.some((e) => e.step >= n - 4 * SPB && e.step < n - 4 * SPB + 8));
  assert.ok(mel, 'mélodie présente sur le motif');
  const src = n - 4 * SPB;
  const sig = (evs, from, to, off) => evs.filter((e) => e.step >= from && e.step < to).map((e) => [e.step - off, e.notes.join()]);
  const out = r.data[mel].events;
  assert.deepEqual(sig(out, n - 2 * SPB, n - SPB, n - 2 * SPB), sig(a.data[mel].events, src, src + SPB, src), 'avant-dernière mesure = 1re mesure du motif');
  const half = sig(a.data[mel].events, src, src + SPB / 2, src);
  assert.deepEqual(sig(out, n - SPB, n - SPB / 2, n - SPB), half);
  assert.deepEqual(sig(out, n - SPB / 2, n, n - SPB / 2), half);
});

test('T03 pédale : la basse tient la dominante, une note par mesure', () => {
  const r = scene(mk({ pedal: { on: true, len: 2, note: 'dom' } }), J.from);
  const n = r.bars * SPB;
  const tonic = H.scale(r.key)[0].pc;
  const tail = r.data.bass.events.filter((e) => e.step >= n - 2 * SPB);
  assert.equal(tail.length, 2);
  assert.ok(tail.every((e) => pc(e.notes[0]) === pc(tonic + 7) && e.len === SPB));
  const t2 = scene(mk({ pedal: { on: true, len: 2, note: 'tonic' } }), J.from).data.bass.events.filter((e) => e.step >= n - 2 * SPB);
  assert.ok(t2.every((e) => pc(e.notes[0]) === tonic));
});

test('T04 élargissement : octave au-dessus puis au-dessous sur les dernières mesures, jamais au-delà de Sol6', () => {
  const r = scene(mk({ widen: { on: true, len: 2 } }), J.from);
  const a = scene(base, J.from);
  const n = r.bars * SPB;
  const from = n - 2 * SPB;
  const before = a.data.pad.events;
  const after = r.data.pad.events;
  assert.deepEqual(after.filter((e) => e.step < from), before.filter((e) => e.step < from), 'avant la fenêtre : inchangé');
  const lastA = after[after.length - 1];
  const lastB = before[before.length - 1];
  const span = (e) => Math.max(...e.notes) - Math.min(...e.notes);
  const lo = Math.min(...lastB.notes);
  assert.ok(lastB.step >= from && span(lastA) === span(lastB) + (lo - 12 >= 40 ? 24 : 12), 'le dernier accord s’ouvre d’une octave en haut, et en bas s’il reste au-dessus de Mi2');
  after.forEach((e) => e.notes.forEach((m) => assert.ok(m <= 91)));
});

test('T05 suspension : la tierce du premier accord est retardée par la quarte, puis résolue', () => {
  const r = scene(mk({ susp: { on: true, len: 4 } }), J.to);
  const a = scene(base, J.to);
  const root = a.spans[0].chord.rootPc;
  const first = a.data.pad.events.filter((e) => e.step === 0);
  assert.ok(first.some((e) => e.notes.some((m) => [3, 4].includes(pc(m - root)))), 'le premier accord a une tierce');
  const sus = r.data.pad.events.filter((e) => e.step === 0);
  assert.ok(sus.every((e) => !e.notes.some((m) => [3, 4].includes(pc(m - root))) && e.len <= 4), 'quarte à la place de la tierce, un temps');
  assert.ok(sus.some((e) => e.notes.some((m) => pc(m - root) === 5)));
  const res = r.data.pad.events.filter((e) => e.step === 4);
  assert.ok(res.some((e) => e.notes.some((m) => [3, 4].includes(pc(m - root)))), 'résolution sur la tierce au 2e temps');
  // la scène d'avant ne change pas
  assert.deepEqual(scene(mk({ susp: { on: true, len: 4 } }), J.from).data, scene(base, J.from).data);
});
