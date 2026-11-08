/*
 * Tests du moteur ARP ONE (js/arp.js) — sans navigateur ni carte son.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/arp.js');
const A = globalThis.SS.Arp;

const C = 60, E = 64, G = 67;
const seqOf = (arp, notes, n = 12, info) => A.preview(arp, notes, n, info).map((t) => (t ? t.notes.join('+') : '.'));
const names = (arr) => arr.map((x) => (x === '.' ? '.' : x.split('+').map((n) => A.noteName(+n)).join('+')));

test('T1 — Up sur C E G, 1/16 à 120 BPM : C E G cyclique, 125 ms entre deux notes', () => {
  const arp = { mode: 'up', rate: 1, octaves: 1 };
  assert.deepEqual(names(seqOf(arp, [C, E, G], 6)), ['C4', 'E4', 'G4', 'C4', 'E4', 'G4']);
  const ev = { step: 0, len: 16, notes: [C, E, G], vel: 0.8 };
  const stepSec = 60 / 120 / 4;
  const times = [];
  for (let s = 0; s < 4; s++) A.renderStep(arp, ev, s, { loop: 0, stepSec, stepsPerBeat: 4 }).forEach((n) => times.push(s * stepSec + n.at));
  for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i - 1] - 0.125) < 1e-9);
});

test('T2 — Up/Down sans doublon : C E G E C E G E …', () => {
  assert.deepEqual(names(seqOf({ mode: 'updown', rate: 1 }, [C, E, G], 8)), ['C4', 'E4', 'G4', 'E4', 'C4', 'E4', 'G4', 'E4']);
  // avec doublons des extrêmes
  assert.deepEqual(names(seqOf({ mode: 'updown_rep', rate: 1 }, [C, E, G], 7)), ['C4', 'E4', 'G4', 'G4', 'E4', 'C4', 'C4']);
});

test('T3 — Aléatoire sans répétition : chaque cycle est une permutation, pas de doublon à la jonction', () => {
  const notes = [C, E, G, 71, 74];
  for (const seed of [1, 2, 3, 99, 12345]) {
    const s = seqOf({ mode: 'shuffle', rate: 1, seed }, notes, 50);
    for (let c = 0; c < 10; c++) assert.equal(new Set(s.slice(c * 5, c * 5 + 5)).size, 5);
    for (let i = 1; i < s.length; i++) assert.notEqual(s[i], s[i - 1], `seed ${seed}, pas ${i}`);
  }
});

test('T4 — Gate 50 % en 1/16 à 120 BPM : note de 62,5 ms', () => {
  const ev = { step: 0, len: 4, notes: [C, E, G], vel: 0.8 };
  const out = A.renderStep({ mode: 'up', rate: 1, gate: 0.5 }, ev, 0, { loop: 0, stepSec: 0.125 });
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0].dur - 0.0625) < 1e-9);
});

test('T5 — Probabilité 0 % / 100 % : aucun pas / tous les pas', () => {
  assert.ok(seqOf({ mode: 'up', rate: 1, lanes: { prob: [0] } }, [C, E, G], 32).every((x) => x === '.'));
  assert.ok(seqOf({ mode: 'up', rate: 1, lanes: { prob: [1] } }, [C, E, G], 32).every((x) => x !== '.'));
});

test('T6 — Même graine, même accord, même transport : sortie identique ; autre graine : autre sortie', () => {
  const arp = { mode: 'drunk', rate: 1, octaves: 3, evolve: 0.9, motion: 0.5, seed: 4242, lanes: { prob: [1, 0.6, 0.8] } };
  const run = (a) => {
    const ev = { step: 0, len: 64, notes: [57, 60, 64, 67], vel: 0.8 };
    const out = [];
    for (let loop = 0; loop < 4; loop++) for (let s = 0; s < 64; s++) out.push(...A.renderStep(a, ev, s, { loop, stepSec: 0.125, trackLen: 64 }));
    return JSON.stringify(out);
  };
  assert.equal(run(arp), run({ ...arp }));
  assert.notEqual(run(arp), run({ ...arp, seed: 4243 }));
});

test('T7 — Am7 puis Fmaj7 : par défaut, uniquement des notes de l’accord, dans la tessiture', () => {
  for (const sym of ['Am7', 'Fmaj7']) {
    const notes = A.parseChordSymbol(sym, 3);
    const pcs = new Set(notes.map((n) => n % 12));
    for (const mode of A.MODES.map((m) => m.id).filter((m) => m !== 'pattern')) {
      const arp = { mode, rate: 1, octaves: 3, evolve: 1, range: [48, 84], seed: 7 };
      for (let loop = 0; loop < 4; loop++)
        A.preview(arp, notes, 64, { loop }).forEach((t) => {
          if (!t) return;
          t.notes.forEach((n) => {
            assert.ok(pcs.has(n % 12), `${sym} ${mode} : ${A.noteName(n)} hors accord`);
            assert.ok(n >= 48 && n <= 84, `${sym} ${mode} : ${n} hors tessiture`);
          });
        });
    }
  }
});

test('Motif relatif : même rythme et même contour sur Am – F – C – G', () => {
  const arp = { mode: 'pattern', pattern: 'd1 d3 d5 d3 . d5 d1+ _', rate: 1 };
  const shape = (sym) => {
    const p = A.preview(arp, A.parseChordSymbol(sym, 3), 8);
    const on = p.map((t) => (t ? 1 : 0));
    const first = p[0].notes[0];
    return { on, iv: p.map((t) => (t ? t.notes[0] - first : null)) };
  };
  const ref = shape('Am');
  for (const s of ['F', 'C', 'G']) {
    const x = shape(s);
    assert.deepEqual(x.on, ref.on, s);
  }
  // fondamentale sur le premier temps, liaison = note prolongée
  const am = A.preview(arp, A.parseChordSymbol('Am', 3), 8);
  assert.equal(am[0].notes[0] % 12, 9);
  assert.equal(am[6].notes[0], am[0].notes[0] + 12);
  assert.ok(am[6].gate >= 2);
  assert.equal(am[7], null);
});

test('Degrés avec repli : d7 sur un accord sans septième = fondamentale à l’octave', () => {
  const c = A.parseChordSymbol('C', 4);
  assert.equal(A.degreeNote(c, 7), 72);
  assert.equal(A.degreeNote(A.parseChordSymbol('Cmaj7', 4), 7), 71);
  assert.equal(A.degreeNote(A.parseChordSymbol('Csus4', 4), 3), 65);
});

test('Reconnaissance d’accords : accords simples, renversements et ambiguïté', () => {
  const best = (ns) => A.analyzeChord(ns)[0].name;
  assert.equal(best([60, 64, 67]), 'C');
  assert.equal(best([57, 60, 64]), 'Am');
  assert.equal(best([57, 60, 64, 67]), 'Am7');
  assert.equal(best([53, 57, 60, 64]), 'Fmaj7');
  assert.equal(best([64, 67, 72]), 'C/E');
  assert.equal(best([55, 59, 62, 65]), 'G7');
  const amb = A.analyzeChord([60, 64, 67, 69]); // C6 ou Am7/C
  assert.ok(amb.length >= 2 && amb[0].confidence < 0.95);
  assert.ok(amb.some((h) => h.name === 'Am7/C'));
});

test('Euclidien E(5,16) : 5 coups répartis, départ sur le premier pas', () => {
  const e = A.euclid(5, 16);
  assert.equal(e.reduce((a, b) => a + b), 5);
  assert.equal(e[0], 1);
  assert.deepEqual(A.euclid(3, 8), [1, 0, 0, 1, 0, 0, 1, 0]);
  // le rythme ne fait pas sauter de note : C E G sur les coups, silences ailleurs
  const s = seqOf({ mode: 'up', rate: 1, rhythm: { type: 'euclid', hits: 3, steps: 8 } }, [C, E, G], 8);
  assert.deepEqual(names(s), ['C4', '.', '.', 'E4', '.', '.', 'G4', '.']);
});

test('Lignes de longueurs indépendantes (polymétrie) et ratchets', () => {
  const p = A.preview({ mode: 'up', rate: 1, lanes: { oct: [0, 0, 1], ratchet: [1, 2] } }, [C], 6);
  assert.deepEqual(p.map((t) => t.notes[0]), [60, 60, 72, 60, 60, 72]);
  assert.deepEqual(p.map((t) => t.ratchet), [1, 2, 1, 2, 1, 2]);
  const ev = { step: 0, len: 4, notes: [C], vel: 1 };
  const out = A.renderStep({ mode: 'up', rate: 1, lanes: { ratchet: [3] } }, ev, 0, { stepSec: 0.12 });
  assert.equal(out.length, 3);
  assert.ok(Math.abs(out[1].at - 0.04) < 1e-9);
});

test('EVOLVE 0 : exactement le même motif à chaque passage ; EVOLVE garde les ancrages', () => {
  const notes = [57, 60, 64, 67];
  const a = seqOf({ mode: 'up', rate: 1, octaves: 2 }, notes, 32, { loop: 0 });
  for (let loop = 1; loop < 8; loop++) assert.deepEqual(seqOf({ mode: 'up', rate: 1, octaves: 2 }, notes, 32, { loop }), a);
  // à EVOLVE maximal, les pas sur les temps et le premier pas restent la note prévue
  for (let loop = 0; loop < 8; loop++) {
    const p = A.preview({ mode: 'up', rate: 1, octaves: 2, evolve: 1, seed: 3 }, notes, 32, { loop });
    for (let k = 0; k < 32; k += 4) assert.ok(p[k] && p[k].anchor, `loop ${loop} pas ${k}`);
  }
  // FREEZE : la variation figée ne dépend plus du passage
  const fz = { mode: 'up', rate: 1, octaves: 2, evolve: 0.8, seed: 5, freeze: true, freezeLoop: 2 };
  assert.deepEqual(seqOf(fz, notes, 32, { loop: 0 }), seqOf(fz, notes, 32, { loop: 9 }));
});

test('MOTION ne change jamais les hauteurs', () => {
  const base = seqOf({ mode: 'updown', rate: 1, octaves: 2 }, [C, E, G], 64);
  assert.deepEqual(seqOf({ mode: 'updown', rate: 1, octaves: 2, motion: 1 }, [C, E, G], 64), base);
});

test('Notes de passage : uniquement si demandées, sur les pas faibles, dans la gamme', () => {
  const am = A.parseChordSymbol('Am', 3);
  const s = A.preview({ mode: 'up', rate: 1, harmony: 'passing' }, am, 12).map((t) => t.notes[0]);
  const aeolian = new Set([9, 11, 0, 2, 4, 5, 7]);
  s.forEach((n) => assert.ok(aeolian.has(n % 12)));
  assert.ok(s.some((n) => ![9, 0, 4].includes(n % 12)), 'au moins une note de passage');
});

test('Accord rythmique et anciens projets ({ mode, rate, octaves })', () => {
  const p = A.preview({ mode: 'chord', rate: 1, lanes: { rhythm: [1, 0] } }, [C, E, G], 4);
  assert.deepEqual(p.map((t) => (t ? t.notes.length : 0)), [3, 0, 3, 0]);
  const old = A.normalize({ mode: 'updown', rate: 2, octaves: 2 });
  assert.equal(old.gate, 0.9);
  assert.equal(old.rate, 2);
  assert.equal(old.evolve, 0);
  // 1/32 : deux notes par double-croche
  const ev = { step: 0, len: 2, notes: [C, E, G], vel: 0.8 };
  assert.equal(A.renderStep(old, ev, 0, { stepSec: 0.125 }).length, 2);
});

test('Rythmes non entiers (1/8 pointée, triolets) : aucun pas perdu ni dupliqué', () => {
  for (const r of A.RATES) {
    const ev = { step: 0, len: 48, notes: [C, E, G], vel: 0.8 };
    let count = 0;
    let last = -1;
    for (let s = 0; s < 48; s++)
      A.renderStep({ mode: 'up', rate: r.id }, ev, s, { stepSec: 0.125 }).forEach((n) => {
        const abs = s * 0.125 + n.at;
        assert.ok(abs > last, `${r.label} : ordre`);
        last = abs;
        count++;
      });
    assert.equal(count, Math.ceil(48 * r.id - 1e-9), r.label);
  }
});

test('Les 10 presets sont valides et jouent', () => {
  assert.equal(A.PRESETS.length, 10);
  for (const p of A.PRESETS) {
    const arp = A.fromPreset(p.id);
    const notes = A.parseChordSymbol(p.chord, 3);
    assert.ok(notes, p.chord);
    const out = A.preview(arp, notes, 32).filter(Boolean);
    assert.ok(out.length > 4, p.id);
    out.forEach((t) => t.notes.forEach((n) => assert.ok(n >= 0 && n <= 127)));
  }
});

test('Bornes extrêmes : notes 0 et 127, valeurs invalides, accord vide', () => {
  assert.deepEqual(A.preview({ mode: 'up' }, [], 4), [null, null, null, null]);
  const n = A.normalize({ rate: 'x', octaves: 99, gate: -3, lanes: { vel: ['a', 5], ratchet: [9] }, rhythm: { type: 'euclid', hits: 99, steps: 0 } });
  assert.equal(n.octaves, 4);
  assert.equal(n.gate, 0.05);
  assert.deepEqual(n.lanes.vel, [1, 1]);
  assert.deepEqual(n.lanes.ratchet, [4]);
  for (const notes of [[0], [127], [0, 127]])
    A.preview({ mode: 'up', octaves: 4, lanes: { oct: [2, -2] } }, notes, 16).forEach((t) => t.notes.forEach((x) => assert.ok(x >= 0 && x <= 127)));
});
