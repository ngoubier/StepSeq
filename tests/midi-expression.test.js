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

test('courbe de volume dans la scène (CC 11 importé) : le jeu automatique ne gonfle plus les notes, l’articulation reste', () => {
  const t = SS.newTrack({ name: 'V', color: '#888', type: 'instrument', family: 'strings', instrument: 'gm_violin' }, SS.newProject());
  t.sd = { expr: 'expressive' };
  const evs = [{ step: 0, len: 16, notes: [69], vel: 0.8 }, { step: 16, len: 2, notes: [71], vel: 0.8, art: 'stac' }, { step: 20, len: 4, notes: [72], vel: 0.8 }];
  const free = SS.expression.forTrack(t, evs);
  assert.ok(free.get(evs[0]).shape.some(([, v]) => v !== 1), 'sans courbe : la note longue enfle');
  const own = SS.expression.forTrack({ ...t, auto: { volume: { 0: 0.4, 8: 0.9, 15: 0.5 } } }, evs.map((e) => ({ ...e })));
  const plans = [...own.values()];
  assert.ok(plans.every((o) => o.shape.every(([, v]) => v === 1)), 'avec courbe : formes plates');
  assert.ok(plans[1].durK < 0.6, 'le staccato reste court');
  // à l'export, la courbe de la scène part en CC 11 et l'expression n'en ajoute pas
  const p = SS.newProject();
  const v = SS.newTrack({ name: 'V', color: '#888', type: 'instrument', family: 'strings', instrument: 'gm_violin' }, p);
  v.events = evs.map((e) => ({ ...e }));
  v.auto = { volume: { 0: 0.4, 8: 0.9, 15: 0.5 } };
  v.sd = { expr: 'expressive' };
  p.tracks = [v];
  SS.commitScene(p);
  const c11 = SS.midiFile.parse(SS.midi.exportProject(p, { range: 'scene', loops: 1 }).bytes).tracks[1].filter((e) => e.type === 'cc' && e.cc === 11).map((e) => e.value);
  assert.equal(c11[0], Math.round(0.4 * 127));
  assert.ok(Math.max(...c11) === Math.round(0.9 * 127), `la courbe de la scène : ${c11}`);
});

test('import d’un jeu humain : décalages d’attaque gardés, CC 11 en courbe, puis export : les nuances reviennent', () => {
  const M = SS.midiFile;
  const trk = [M.meta.name(0, 'Cordes'), { tick: 0, bytes: [0xc0, 48] }];
  const on = (tick, n, len) => trk.push({ tick, bytes: [0x90, n, 70] }, { tick: tick + len, bytes: [0x80, n, 0] });
  on(17, 57, 7 * 480); // un peu en retard
  on(1920 * 2 - 25, 60, 1800); // un peu en avance
  for (let s = 0; s < 64; s += 2) trk.push({ tick: s * T, bytes: [0xb0, 11, 40 + s] });
  trk.sort((a, b) => a.tick - b.tick);
  const { project: p } = SS.midi.importFile(M.write({ ppq: 480, tracks: [[M.meta.tempo(0, 70)], trk] }));
  const t = p.tracks[0];
  const evs = p.scenes.flatMap((s) => s.data[t.id].events);
  assert.equal(evs[0].shift, Math.round((17 / T) * 100) / 100);
  assert.equal(evs[1].shift, -Math.round((25 / T) * 100) / 100);
  const back = SS.midiFile.parse(SS.midi.exportProject(p, { range: 'song', expression: false }).bytes).tracks[1];
  const starts = back.filter((e) => e.type === 'note' && !e.off).map((e) => e.tick);
  assert.ok(Math.abs(starts[0] - 17) <= 2 && Math.abs(starts[1] - (1920 * 2 - 25)) <= 2, `attaques : ${starts}`);
  const c11 = back.filter((e) => e.type === 'cc' && e.cc === 11).map((e) => e.value);
  assert.ok(c11.length > 2 && Math.max(...c11) > Math.min(...c11) + 40, `CC 11 retrouvé : ${c11}`);
});

test('courbe de volume : le timbre la suit (sombre quand elle est basse, il s’ouvre quand elle monte)', () => {
  const t = SS.newTrack({ name: 'C', color: '#888', type: 'instrument', family: 'brass', instrument: 'gm_french_horn' }, SS.newProject());
  const evs = [{ step: 0, len: 16, notes: [60], vel: 0.8 }, { step: 16, len: 16, notes: [62], vel: 0.8 }];
  const o = SS.expression.forTrack({ ...t, auto: { volume: { 0: 0.2, 16: 0.9, 31: 0.9 } } }, evs);
  const b0 = o.get(evs[0]).bright.shape;
  assert.ok(b0, 'forme du timbre');
  assert.ok(Math.abs(b0[0][1] - 0.2) < 1e-6 && b0[4][1] > 0.85, `suit la courbe dans la note : ${JSON.stringify(b0)}`);
  assert.ok(o.get(evs[0]).shape.every(([, v]) => v === 1), 'le volume, lui, reste à la courbe');
  const hz = (d) => SS.expression.brightHz(4000, o.get(evs[0]).bright.ratio, d);
  assert.ok(hz(b0[0][1]) < hz(b0[4][1]) / 2, 'plus sombre dans le piano');
  // une autre courbe sur les mêmes notes : le plan est recalculé
  const o2 = SS.expression.forTrack({ ...t, auto: { volume: { 0: 0.9, 31: 0.9 } } }, evs);
  assert.ok(o2.get(evs[0]).bright.shape[0][1] > 0.85);
  // instrument frappé : pas de forme de timbre (la force de frappe s'en charge)
  const pia = SS.newTrack({ name: 'P', color: '#888', type: 'instrument', family: 'keys', instrument: 'gm_piano' }, SS.newProject());
  const op = SS.expression.forTrack({ ...pia, auto: { volume: { 0: 0.2 } } }, evs.map((e) => ({ ...e })));
  assert.ok(![...op.values()].some((x) => x.bright && x.bright.shape));
});

test('courbe de volume : un soufflet posé à la main garde sa forme', () => {
  const t = SS.newTrack({ name: 'C', color: '#888', type: 'instrument', family: 'brass', instrument: 'gm_french_horn' }, SS.newProject());
  const evs = [{ step: 0, len: 16, notes: [60], vel: 0.8, art: 'swell' }, { step: 16, len: 16, notes: [62], vel: 0.8 }];
  const o = SS.expression.forTrack({ ...t, sd: { expr: 'expressive' }, auto: { volume: { 0: 0.5, 31: 0.5 } } }, evs);
  assert.ok(o.get(evs[0]).shape.some(([, v]) => v !== 1), 'soufflet gardé');
  assert.ok(o.get(evs[1]).shape.every(([, v]) => v === 1), 'les autres notes suivent la courbe');
});
