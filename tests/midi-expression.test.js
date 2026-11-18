/*
 * Export MIDI du jeu des pistes (js/midi.js + js/expression.js) : nuances par la vélocité, CC 11, articulations dans
 * les durées, strum et doigts décalés, pédale automatique en CC 64 ; option « jeu » coupée : les notes telles qu'écrites.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'expression.js', 'arp.js', 'project.js', 'harmony.js', 'chords.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const T = 120; // ticks par double-croche (ppq 480)

/** Projet d'une scène d'une mesure, une piste ; export → { notes: [{ at, end, note, vel }], cc: [{ at, cc, val }] }. */
function exportOne(family, instrument, events, sd, opts = {}) {
  const p = SS.newProject();
  p.tempo = 120;
  const t = SS.newTrack({ name: 'X', color: '#888', type: 'instrument', family, instrument }, p);
  t.events = events;
  if (sd === null) delete t.sd;
  else if (sd) t.sd = sd;
  p.tracks = [t];
  SS.commitScene(p);
  const res = SS.midi.exportProject(p, { range: 'scene', loops: 1, swing: false, ...opts });
  const mf = SS.midiFile.parse(res.bytes);
  const trk = mf.tracks[1];
  const on = new Map();
  const notes = [];
  const cc = [];
  for (const e of trk) {
    if (e.type === 'note' && !e.off) on.set(e.note, { at: e.tick, note: e.note, vel: e.vel });
    else if (e.type === 'note' && e.off) {
      const n = on.get(e.note);
      if (n) notes.push({ ...n, end: e.tick });
      on.delete(e.note);
    } else if (e.type === 'cc') cc.push({ at: e.tick, cc: e.cc, val: e.value });
  }
  notes.sort((a, b) => a.at - b.at || a.note - b.note);
  return { notes, cc, report: res.report };
}

test('lecture du fichier : le parseur donne des ticks absolus', () => {
  const r = exportOne('bass', 'syn_sawbass', [{ step: 4, len: 2, notes: [40], vel: 0.8 }], null);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].at, 4 * T);
  assert.equal(r.notes[0].end, 6 * T);
});

test('piano : pédale automatique en CC 64 (enfoncée après l’attaque, relevée sur la note suivante), notes telles qu’écrites', () => {
  const evs = [{ step: 0, len: 2, notes: [60], vel: 0.8 }, { step: 8, len: 2, notes: [64], vel: 0.8 }];
  const r = exportOne('keys', 'gm_piano', evs, { expr: 'natural' });
  const ped = r.cc.filter((c) => c.cc === 64);
  assert.deepEqual(ped.map((c) => c.val), [127, 0], 'la dernière note de la scène n’a pas de note suivante : pas de pédale');
  assert.ok(ped[0].at > 0 && ped[0].at < T, 'enfoncée juste après la première attaque');
  assert.equal(ped[1].at, 8 * T - 1, 'relevée juste avant la note suivante');
  assert.equal(r.notes[0].end - r.notes[0].at, 2 * T, 'la note reste écrite : c’est la pédale qui tient');
  assert.ok(r.report.approx.some((a) => /pédale automatique du piano en CC 64/.test(a)));
  const off = exportOne('keys', 'gm_piano', evs.map((e) => ({ ...e })), { expr: 'natural', pedal: 0 });
  assert.equal(off.cc.filter((c) => c.cc === 64).length, 0, 'pédale coupée : pas de CC 64');
});

test('piano : la mélodie au-dessus de l’accord, les doigts décalés, la nuance de phrase par la vélocité', () => {
  const evs = [{ step: 0, len: 8, notes: [48, 55, 64, 72], vel: 0.7 }];
  const r = exportOne('keys', 'gm_piano', evs, { expr: 'natural' });
  const top = r.notes.find((n) => n.note === 72);
  const others = r.notes.filter((n) => n.note !== 72);
  assert.ok(others.every((n) => n.vel < top.vel), 'note du haut plus forte');
  assert.equal(top.at, 0, 'la mélodie part la première');
  assert.ok(others.every((n) => n.at > 0 && n.at <= 0.012 * 2 * 4 * T), 'les autres doigts un peu après (au plus 12 ms)');
});

test('guitare : strum (cordes décalées, vers le haut sans la corde grave)', () => {
  const chord = (step) => ({ step, len: 2, notes: [40, 47, 52, 56, 59, 64], vel: 0.8 });
  const r = exportOne('guitar', 'gm_acoustic_guitar_steel', [chord(0), chord(2)], { expr: 'natural' });
  const down = r.notes.filter((n) => n.at < 2 * T);
  const up = r.notes.filter((n) => n.at >= 2 * T);
  assert.equal(down.length, 6);
  assert.equal(up.length, 5, 'coup vers le haut : 5 cordes');
  const byNote = (list) => list.slice().sort((a, b) => a.note - b.note).map((n) => n.at);
  const d = byNote(down);
  for (let i = 1; i < 6; i++) assert.ok(d[i] > d[i - 1], 'vers le bas : de la corde grave à l’aiguë');
  const u = byNote(up);
  for (let i = 1; i < 5; i++) assert.ok(u[i] < u[i - 1], 'vers le haut : de l’aiguë à la grave');
  assert.ok(up[0].vel < down[0].vel, 'coup vers le haut plus léger');
});

test('cordes : nuance dans les notes en CC 11 ; articulations dans les durées', () => {
  const evs = [{ step: 0, len: 8, notes: [69], vel: 0.8 }, { step: 8, len: 2, notes: [71], vel: 0.8, art: 'stac' }, { step: 12, len: 4, notes: [72], vel: 0.8 }];
  const r = exportOne('strings', 'gm_violin', evs, { expr: 'natural' });
  const c11 = r.cc.filter((c) => c.cc === 11);
  assert.ok(c11.length >= 4, `courbe CC 11 (${c11.length} points)`);
  const inLong = c11.filter((c) => c.at < 8 * T).map((c) => c.val);
  assert.ok(Math.max(...inLong) > inLong[0], 'la note longue enfle');
  const stac = r.notes.find((n) => n.note === 71);
  assert.ok(stac.end - stac.at < 2 * T * 0.6, 'staccato raccourci');
  assert.ok(r.report.approx.some((a) => /CC 11/.test(a) && /articulations/.test(a)));
});

test('une courbe de volume dans la scène garde le CC 11 : pas de CC 11 d’expression en plus', () => {
  const p = SS.newProject();
  const t = SS.newTrack({ name: 'V', color: '#888', type: 'instrument', family: 'strings', instrument: 'gm_violin' }, p);
  t.events = [{ step: 0, len: 8, notes: [69], vel: 0.8 }];
  t.auto = { volume: { 0: 0.5, 15: 0.5 } };
  p.tracks = [t];
  SS.commitScene(p);
  const res = SS.midi.exportProject(p, { range: 'scene', loops: 1 });
  const c11 = SS.midiFile.parse(res.bytes).tracks[1].filter((e) => e.type === 'cc' && e.cc === 11).map((e) => e.value);
  assert.ok(c11.length >= 1);
  assert.ok(c11.every((v) => v === 64), `seulement la courbe de volume : ${c11}`);
});

test('option « jeu » coupée : les notes telles qu’écrites, ni CC 11 ni CC 64', () => {
  const evs = [{ step: 0, len: 2, notes: [48, 55, 64], vel: 0.8 }, { step: 8, len: 2, notes: [60], vel: 0.8, art: 'stac' }];
  const r = exportOne('keys', 'gm_piano', evs, { expr: 'natural' }, { expression: false });
  assert.ok(r.notes.slice(0, 3).every((n) => n.at === 0 && n.vel === Math.round(0.8 * 127)));
  assert.equal(r.notes[3].end - r.notes[3].at, 2 * T);
  assert.equal(r.cc.filter((c) => c.cc === 64 || c.cc === 11).length, 0);
  // et sans expression sur la piste : rien ne change non plus
  const plain = exportOne('keys', 'gm_piano', evs.map((e) => ({ ...e, art: undefined })), null);
  assert.ok(plain.notes.every((n) => n.vel === Math.round(0.8 * 127)));
});
