/*
 * Import / export MIDI (js/midi-file.js, js/midi.js).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const M = SS.midiFile;
const T = 120; // ticks par double-croche (ppq 480)

const notesOf = (track) => track.filter((e) => e.type === 'note' && !e.off);
const note = (trk, ch, at, len, n, v = 100) => trk.push({ tick: at, bytes: [0x90 | ch, n, v] }, { tick: at + len, bytes: [0x80 | ch, n, 0] });

/** Morceau de test : basse + accords + batterie, forme `form` (4 mesures par partie). */
function song(form = 'AABA', extra = () => {}) {
  const bass = [M.meta.name(0, 'Basse'), { tick: 0, bytes: [0xc0, 38] }, { tick: 0, bytes: [0xb0, 7, 100] }];
  const keys = [M.meta.name(0, 'Accords'), { tick: 0, bytes: [0xc1, 4] }];
  const drums = [M.meta.name(0, 'Batterie')];
  [...form].forEach((part, k) => {
    for (let bar = 0; bar < 4; bar++) {
      const at = (k * 4 + bar) * 16 * T;
      const root = part === 'A' ? [36, 36, 41, 43][bar] : [45, 41, 43, 43][bar];
      for (let s = 0; s < 16; s += 4) note(bass, 0, at + s * T, 3 * T, root);
      [0, 4, 7].forEach((i) => note(keys, 1, at, 16 * T, root + 24 + i, 80));
      for (let s = 0; s < 16; s += 2) note(drums, 9, at + s * T, T, 42, 70);
      note(drums, 9, at, T, 36);
      note(drums, 9, at + 8 * T, T, 36);
      if (part === 'A') note(drums, 9, at + 4 * T, T, 38), note(drums, 9, at + 12 * T, T, 38);
    }
  });
  extra({ bass, keys, drums });
  return M.write({ ppq: 480, tracks: [[M.meta.tempo(0, 118), M.meta.timeSig(0, 4, 4)], bass, keys, drums] });
}

test('fichier MIDI : écriture puis lecture (méta, notes, contrôleurs)', () => {
  const bytes = M.write({
    ppq: 480,
    tracks: [
      [M.meta.tempo(0, 90), M.meta.timeSig(0, 6, 8), M.meta.keySig(0, -3, true), M.meta.marker(960, 'Refrain')],
      [M.meta.name(0, 'Piano é'), { tick: 0, bytes: [0xc0, 4] }, { tick: 10, bytes: [0x90, 60, 100] }, { tick: 500, bytes: [0x80, 60, 0] }],
    ],
  });
  const m = M.parse(bytes);
  assert.equal(m.format, 1);
  assert.equal(m.ppq, 480);
  const meta = m.tracks[0];
  assert.equal(Math.round(60000000 / meta.find((e) => e.meta === 0x51).usPerQuarter), 90);
  assert.deepEqual([meta.find((e) => e.meta === 0x58).num, meta.find((e) => e.meta === 0x58).den], [6, 8]);
  assert.deepEqual([meta.find((e) => e.meta === 0x59).sf, meta.find((e) => e.meta === 0x59).mi], [-3, 1]);
  assert.equal(meta.find((e) => e.meta === 0x06).text, 'Refrain');
  assert.equal(meta.find((e) => e.meta === 0x06).tick, 960);
  const t = m.tracks[1];
  assert.equal(t.find((e) => e.meta === 0x03).text, 'Piano é');
  assert.equal(t.find((e) => e.type === 'program').program, 4);
  assert.deepEqual(t.filter((e) => e.type === 'note').map((e) => [e.tick, e.note, e.off]), [[10, 60, false], [500, 60, true]]);
});

test('lecture : running status et Note On de vélocité 0 (= Note Off)', () => {
  // MThd type 0, 1 piste, ppq 96 ; MTrk : 90 3C 64 | (running) 3C 00 | 40 64 | 40 00 | fin
  const body = [0x00, 0x90, 0x3c, 0x64, 0x60, 0x3c, 0x00, 0x00, 0x40, 0x64, 0x60, 0x40, 0x00, 0x00, 0xff, 0x2f, 0x00];
  const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, body.length, ...body]);
  const evs = M.parse(bytes).tracks[0].filter((e) => e.type === 'note');
  assert.deepEqual(evs.map((e) => [e.tick, e.note, e.off]), [[0, 60, false], [96, 60, true], [96, 64, false], [192, 64, true]]);
  assert.throws(() => M.parse(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /MIDI/);
});

test('correspondances General MIDI : programmes des soundfonts, batterie, armures', () => {
  assert.equal(SS.midi.programOf({ instrument: 'gm_epiano1', family: 'keys' }).program, 4);
  assert.equal(SS.midi.programOf({ instrument: 'gm_epiano1', family: 'keys' }).exact, true);
  assert.equal(SS.midi.programOf({ instrument: 'syn_sawbass', family: 'bass' }).program, 38);
  assert.equal(SS.midi.programOf({ instrument: 'syn_softpad', family: 'pads' }).program, 89);
  assert.equal(SS.midi.programOf({ family: 'analog', instrument: 'juno106', junoPatch: 'B83' }).program, 50); // « Cello » → cordes
  assert.equal(SS.midi.gmForProgram(2).id, 'gm_piano'); // programme absent : le plus proche du même groupe
  assert.equal(SS.midi.drumTypeOf({ source: 'tdm', sound: 'oh' }), 'oh');
  assert.equal(SS.midi.drumTypeOf({ source: 'dirt', bank: 'sn' }), 'sd');
  assert.equal(SS.midi.drumTypeOf({ source: 'vcsl', bank: 'tambourine' }), 'tb');
  assert.deepEqual(SS.midi.keySignature({ tonic: 'D', mode: 'minor' }), { sf: -1, minor: true });
  assert.deepEqual(SS.midi.keySignature({ tonic: 'D', mode: 'dorian' }), { sf: -1, minor: true });
  assert.deepEqual(SS.midi.keySignature({ tonic: 'E♭', mode: 'major' }), { sf: -3, minor: false });
  assert.deepEqual(SS.midi.keySignature({ tonic: 'G♭', mode: 'major' }), { sf: -6, minor: false });
  assert.deepEqual(SS.midi.keySignature({ tonic: 'F♯', mode: 'major' }), { sf: 6, minor: false });
});

test('import : pistes, tempo, batterie séparée par élément, forme A A B A en scènes', () => {
  const { project: p, report } = SS.midi.importFile(song('AABA'), { title: 'Test' });
  assert.equal(p.title, 'Test');
  assert.equal(p.tempo, 118);
  assert.deepEqual(p.timeSig, [4, 4]);
  assert.deepEqual(p.tracks.map((t) => t.name), ['Kick', 'Snare', 'Hi-Hat fermé', 'Basse', 'Accords']);
  const bass = p.tracks.find((t) => t.name === 'Basse');
  assert.equal(bass.instrument, 'gm_synth_bass_1'); // programme 38
  assert.equal(bass.volume, 0.79); // CC7 = 100
  assert.equal(p.tracks.find((t) => t.name === 'Accords').instrument, 'gm_epiano1');
  assert.ok(p.tracks.filter((t) => t.type === 'drum').every((t) => t.source === 'tdm' && t.machine === 'RolandTR808'));
  // A ×2 → B → A : 2 scènes de 4 mesures
  assert.deepEqual(p.scenes.map((s) => s.bars), [4, 4]);
  const name = (id) => p.scenes.find((s) => s.id === id).name;
  assert.deepEqual(p.song.map((b) => [name(b.scene), b.repeat]), [[p.scenes[0].name, 2], [p.scenes[1].name, 1], [p.scenes[0].name, 1]]);
  assert.equal(p.playMode, 'song');
  assert.equal(report.fidelity.kept, 1);
  assert.equal(report.fidelity.added, 0);
  // accords : les 3 notes tenues 16 pas forment un seul événement
  const keys = p.scenes[0].data[p.tracks.find((t) => t.name === 'Accords').id].events;
  assert.deepEqual(keys[0], { step: 0, len: 16, notes: [60, 64, 67], vel: 0.63 });
  // tonalité estimée : Do majeur
  assert.deepEqual(p.scenes[0].key, { tonic: 'C', mode: 'major' });
});

test('import : quantification, sustain, mesures vides au début et bilan des pertes', () => {
  const bytes = song('A', ({ keys }) => {
    // une note un peu en retard (jeu humain), une note en triolet, de la pédale et du pitch bend
    note(keys, 1, 16 * T * 1 + 2 * T + 13, T, 72);
    note(keys, 1, 16 * T * 2 + 160, T, 74);
    keys.push({ tick: 16 * T * 3, bytes: [0xb1, 64, 127] }, { tick: 16 * T * 3 + T * 8, bytes: [0xb1, 64, 0] });
    note(keys, 1, 16 * T * 3 + T, T, 76);
    keys.push({ tick: 10, bytes: [0xe1, 0, 0x50] });
  });
  const { project: p, report } = SS.midi.importFile(bytes);
  const keys = p.tracks.find((t) => t.name === 'Accords');
  const evs = p.scenes.flatMap((s) => (s.data[keys.id] || {}).events || []);
  assert.ok(evs.some((e) => e.step === 18 && e.notes.includes(72)), 'note recalée sur la double-croche');
  assert.ok(evs.some((e) => e.notes.includes(76) && e.len === 7), 'pédale de sustain : la note dure jusqu’au relâchement');
  assert.ok(report.warnings.some((w) => /recalées/.test(w)));
  assert.ok(report.warnings.some((w) => /pitch bend/.test(w)));

  // une mesure vide au début : supprimée
  const late = M.write({ ppq: 96, tracks: [[M.meta.tempo(0, 100)], [{ tick: 96 * 4, bytes: [0x90, 60, 90] }, { tick: 96 * 5, bytes: [0x80, 60, 0] }]] });
  const r2 = SS.midi.importFile(late);
  assert.equal(r2.report.bars, 1);
  assert.deepEqual(r2.project.tracks[0].events, [{ step: 0, len: 4, notes: [60], vel: 0.71 }]);
  assert.ok(r2.report.warnings.some((w) => /vide/.test(w)));
  assert.throws(() => SS.midi.importFile(M.write({ ppq: 96, tracks: [[M.meta.tempo(0, 100)]] })), /aucune note/);
});

test('import : un morceau long est découpé en scènes de 64 mesures au plus', () => {
  const bytes = M.write({
    ppq: 96,
    tracks: [[M.meta.tempo(0, 120)], Array.from({ length: 150 }, (_, bar) => [{ tick: bar * 384, bytes: [0x90, 48 + (bar % 24), 90] }, { tick: bar * 384 + 96, bytes: [0x80, 48 + (bar % 24), 0] }]).flat()],
  });
  const { project: p, report } = SS.midi.importFile(bytes);
  assert.equal(report.bars, 150);
  assert.ok(p.scenes.every((s) => s.bars <= 64));
  assert.equal(p.song.reduce((a, b) => a + p.scenes.find((s) => s.id === b.scene).bars * b.repeat, 0), 150);
  assert.equal(report.fidelity.kept, 1);
});

test('import : les marqueurs du fichier donnent les débuts et les noms des scènes', () => {
  const bytes = song('AABA', ({ bass }) => bass.push(M.meta.marker(0, 'Couplet'), M.meta.marker(16 * T * 8, 'Pont'), M.meta.marker(16 * T * 12, 'Couplet')));
  const { project: p } = SS.midi.importFile(bytes);
  const name = (id) => p.scenes.find((s) => s.id === id).name;
  assert.deepEqual(p.song.map((b) => [name(b.scene), b.repeat]), [['Couplet', 2], ['Pont', 1], ['Couplet', 1]]);
});

/** Petit projet StepSeq : kick, accords (Accord), arpège, avec deux scènes et un arrangement. */
function project() {
  const p = SS.newProject();
  p.title = 'Export';
  p.tempo = 100;
  const kick = SS.newTrack({ type: 'drum', name: 'Kick', color: '#fff', source: 'tdm', sound: 'bd', machine: 'RolandTR808' }, p);
  const pad = SS.newTrack({ type: 'instrument', category: 'chord', family: 'keys', instrument: 'gm_epiano1', name: 'Pad', color: '#fff' }, p);
  const arp = SS.newTrack({ type: 'instrument', category: 'arp', family: 'synth', instrument: 'syn_saw', name: 'Arp', color: '#fff' }, p);
  arp.arp = SS.Arp.normalize({ mode: 'up', rate: 1, octaves: 1 });
  p.tracks = [kick, pad, arp];
  kick.steps = [1, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0, 0];
  pad.events = [{ step: 0, len: 16, notes: [57, 60, 64], vel: 0.8 }];
  arp.events = [{ step: 0, len: 4, notes: [60, 64, 67], vel: 0.8 }];
  SS.commitScene(p);
  p.scenes[0].key = { tonic: 'A', mode: 'minor' };
  const b = SS.addScene(p, { copy: false });
  p.scenes.find((s) => s.id === b).name = 'Pont';
  p.song = [{ scene: p.scenes[0].id, repeat: 2 }, { scene: b, repeat: 1 }];
  return p;
}

test('export : pistes, canaux, programmes, marqueurs, armure et arpège rendu en notes', () => {
  const { bytes, report } = SS.midi.exportProject(project(), { swing: false });
  const m = M.parse(bytes);
  assert.equal(m.tracks.length, 4);
  const conductor = m.tracks[0];
  assert.equal(Math.round(60000000 / conductor.find((e) => e.meta === 0x51).usPerQuarter), 100);
  assert.deepEqual(conductor.filter((e) => e.meta === 0x06).map((e) => [e.tick, e.text]), [[0, 'Couplet ×2'], [2 * 16 * T, 'Pont']]);
  assert.deepEqual(conductor.filter((e) => e.meta === 0x59).map((e) => [e.sf, e.mi]), [[0, 1]]); // La mineur
  const [kick, pad, arp] = m.tracks.slice(1);
  // batterie : canal 10, note 36, deux passages de la scène, rien dans le Pont
  assert.ok(notesOf(kick).every((e) => e.ch === 9 && e.note === 36));
  assert.deepEqual(notesOf(kick).map((e) => e.tick / T), [0, 4, 8, 12, 16, 20, 24, 28]);
  assert.deepEqual(notesOf(kick).slice(0, 2).map((e) => e.vel), [127, 64]);
  // accords : programme GM exact
  assert.equal(pad.find((e) => e.type === 'program').program, 4);
  assert.deepEqual(notesOf(pad).map((e) => e.note), [57, 60, 64, 57, 60, 64]);
  // arpège : notes jouées une par une (do mi sol do) au lieu de l'accord tenu
  assert.deepEqual(notesOf(arp).slice(0, 4).map((e) => [e.tick / T, e.note]), [[0, 60], [1, 64], [2, 67], [3, 60]]);
  assert.equal(arp.find((e) => e.type === 'program').program, 81); // Saw → Lead 2 (sawtooth)
  assert.ok(report.approx.some((a) => /Arp/.test(a)));
  assert.equal(Math.round(report.seconds), Math.round((3 * 16 * 60) / 100 / 4));
});

test('export : scène en boucle, pistes muettes, swing', () => {
  const p = project();
  p.tracks[1].mute = true;
  p.groove = { res: 16, swing: 0.6, human: 0 };
  const { bytes, report } = SS.midi.exportProject(p, { range: 'scene', loops: 3, audibleOnly: true, swing: true });
  const m = M.parse(bytes);
  assert.equal(m.tracks.length, 3); // le Pad muet n'est pas exporté
  assert.ok(report.ignored.some((w) => /muette/.test(w)));
  const kick = notesOf(m.tracks[1]).map((e) => e.tick);
  assert.equal(kick.length, 12); // 4 coups × 3 passages
  // swing 60 % : la 2e double-croche de chaque paire est retardée (les pas pairs ne bougent pas)
  const arp = notesOf(m.tracks[2]).map((e) => e.tick);
  assert.equal(arp[0], 0);
  assert.ok(arp[1] > T, 'pas 1 retardé par le swing');
  assert.equal(arp[2], 2 * T);
});

test('aller-retour : export puis import redonne les mêmes notes', () => {
  const src = SS.midi.importFile(song('AABA')).project;
  const { bytes } = SS.midi.exportProject(src, { swing: false });
  const back = SS.midi.importFile(bytes).project;
  const flat = (p) =>
    p.song.flatMap((b) => Array(b.repeat).fill(p.scenes.find((s) => s.id === b.scene))).flatMap((sc, i) =>
      p.tracks.flatMap((t) => {
        const d = sc.data[t.id] || {};
        return t.type === 'drum' ? (d.steps || []).flatMap((v, s) => (v ? [`${t.name}|${i}|${s}`] : [])) : (d.events || []).flatMap((e) => e.notes.map((n) => `${t.name}|${i}|${e.step}|${n}|${e.len}`));
      })
    ).sort();
  assert.deepEqual(back.tracks.map((t) => t.name), src.tracks.map((t) => t.name));
  assert.deepEqual(flat(back), flat(src));
  // les marqueurs exportés redonnent les noms des scènes
  assert.deepEqual(back.scenes.map((s) => s.name).sort(), src.scenes.map((s) => s.name).sort());
});
