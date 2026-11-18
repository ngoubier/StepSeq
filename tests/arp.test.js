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

test('Les 11 presets sont valides et jouent', () => {
  assert.equal(A.PRESETS.length, 11);
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

test('Longueur des notes en valeurs musicales : 1 temps = 4 doubles-croches, quel que soit RATE', () => {
  for (const rate of [0.5, 1, 2]) {
    const ev = { step: 0, len: 16, notes: [C, E, G], vel: 0.8 };
    const out = A.renderStep({ mode: 'up', rate, noteLen: 4 }, ev, 0, { stepSec: 0.125 });
    assert.ok(Math.abs(out[0].dur - 0.5) < 1e-9, `rate ${rate}`); // 1 temps à 120 BPM = 0,5 s
  }
  // longueur d'un pas : prioritaire sur la longueur générale ; 0 = longueur générale
  const p = A.preview({ mode: 'up', rate: 1, noteLen: 1, lanes: { len: [0, 8] } }, [C, E, G], 4);
  assert.deepEqual(p.map((t) => t.gate), [1, 8, 1, 8]);
});

test('Plusieurs notes à la fois : la note du pas + les notes de l’accord juste au-dessus', () => {
  const p = A.preview({ mode: 'up', rate: 1, lanes: { poly: [1, 2, 3, 1] } }, [C, E, G], 4);
  assert.deepEqual(p.map((t) => t.notes), [[60], [64, 67], [67, 72, 76], [60]]);
  const ev = { step: 0, len: 4, notes: [C, E, G], vel: 0.8 };
  const out = A.renderStep({ mode: 'up', rate: 1, lanes: { poly: [2] } }, ev, 0, { stepSec: 0.125 });
  assert.equal(out.length, 2);
  assert.equal(out[0].at, out[1].at);
});

test('Silence et vélocité par pas', () => {
  const p = A.preview({ mode: 'up', rate: 1, rhythm: { type: 'lane' }, lanes: { rhythm: [1, 0, 1, 1], vel: [1, 1, 0.5, 1] } }, [C, E, G], 4);
  assert.equal(p[1], null);
  assert.deepEqual(p.map((t) => (t ? t.notes[0] : null)), [60, null, 64, 67]); // le silence ne fait pas sauter de note
  assert.ok(Math.abs(p[2].vel - 0.4) < 1e-9);
});

test('Ancien « jeu humain » : converti en geste (même hauteurs, note 1 sur la pulsation)', () => {
  const o = A.normalize({ mode: 'updown', rate: 1, human: 0.5 });
  assert.equal(o.human, 0);
  assert.ok(o.geste && o.geste.micro === 6 && o.geste.spread === 1);
  const hum = A.preview({ mode: 'updown', rate: 1, octaves: 2, human: 1 }, [57, 60, 64], 32);
  const dry = A.preview({ mode: 'updown', rate: 1, octaves: 2 }, [57, 60, 64], 32);
  hum.forEach((t, i) => assert.deepEqual(t.notes, dry[i].notes));
});

test('Double montée : A C E A′ · C E A′ C′ · E A′ C′ E′ (groupes de 4 qui grimpent)', () => {
  const am = [57, 60, 64];
  const names12 = (mode) => A.preview({ mode, rate: 1 }, am, 12).map((t) => A.noteName(t.notes[0]));
  assert.deepEqual(names12('up2'), ['A3', 'C4', 'E4', 'A4', 'C4', 'E4', 'A4', 'C5', 'E4', 'A4', 'C5', 'E5']);
  assert.deepEqual(names12('down2').slice(0, 8), ['E4', 'C4', 'A3', 'E3', 'C4', 'A3', 'E3', 'C3']);
  assert.deepEqual(names12('up3').slice(0, 9), ['A3', 'C4', 'E4', 'C4', 'E4', 'A4', 'E4', 'A4', 'C5']);
  assert.deepEqual(names12('climb2').slice(0, 6), ['A3', 'C4', 'C4', 'E4', 'E4', 'A4']);
  assert.deepEqual(names12('alberti').slice(0, 4), ['A3', 'E4', 'C4', 'E4']);
  assert.deepEqual(names12('octaves').slice(0, 6), ['A3', 'A4', 'C4', 'C5', 'E4', 'E5']);
  assert.deepEqual(names12('repeat').slice(0, 6), ['A3', 'A3', 'C4', 'C4', 'E4', 'E4']);
  // le cycle revient au départ : la double montée ne grimpe pas sans fin
  assert.deepEqual(A.preview({ mode: 'up2', rate: 1 }, am, 16).slice(12).map((t) => t.notes[0]), [57, 60, 64, 69]);
});

test('Catalogue de motifs : valides, uniquement des notes de l’accord, sur des accords variés', () => {
  require('../js/motifs.js');
  const SS = globalThis.SS;
  assert.ok(SS.MOTIFS.length >= 50);
  const ids = new Set();
  for (const m of SS.MOTIFS) {
    assert.ok(!ids.has(m.id), `doublon ${m.id}`);
    ids.add(m.id);
    assert.ok(SS.MOTIF_CATS.some((c) => c.id === m.cat), `${m.id} : catégorie`);
    const norm = A.normalize(m.arp);
    assert.equal(norm.mode, m.arp.mode, `${m.id} : mode inconnu du moteur`);
    if (m.arp.pattern) assert.ok(A.parsePattern(m.arp.pattern).every((t) => !t.bad), `${m.id} : motif illisible`);
    for (const sym of ['Am', 'F', 'Cmaj7', 'G7', 'Dsus4']) {
      const notes = A.parseChordSymbol(sym, 3);
      const pcs = new Set(notes.map((n) => n % 12));
      const out = A.preview(norm, notes, 32).filter(Boolean);
      assert.ok(out.length > 0, `${m.id} sur ${sym} : muet`);
      out.forEach((t) => t.notes.forEach((n) => assert.ok(pcs.has(n % 12), `${m.id} sur ${sym} : ${A.noteName(n)} hors accord`)));
    }
  }
});

/* ---------------- Geste ---------------- */
const GT = (g, n = 4, subMs = 250, gi = 0) => A.gesteTimes(g, n, subMs, gi);
const round = (a) => a.map((x) => Math.round(x));

test('Geste : exemple du document — 120 BPM, groupe de 4, étalement 450 ms, alternance +22 ms', () => {
  // grille 0, 250, 500, 750 ; étalement sur 450 ms → 0, 150, 300, 450 ; alternance +22 ms → 0, 172, 300, 472
  assert.deepEqual(round(GT({ spread: 1 }).at), [0, 250, 500, 750]);
  assert.deepEqual(round(GT({ spread: 0.6 }).at), [0, 150, 300, 450]);
  const g = GT({ spread: 0.6, alt: 0.088 });
  assert.deepEqual(round(g.at), [0, 172, 300, 472]);
  assert.equal(Math.round(g.groupMs - g.at[3]), 528); // respiration avant le groupe suivant
});

test('Geste : le groupe suivant ne bouge pas, pas de dérive sur 64 groupes', () => {
  const arp = { mode: 'up', rate: 1, geste: { spread: 0.3, alt: -0.1, micro: 10, accent: 0.5, art: 0.6 } };
  const ev = { step: 0, len: 256, notes: [57, 60, 64, 67], vel: 0.8 };
  for (let s = 0; s < 256; s += 4) {
    const out = A.renderStep(arp, ev, s, { stepSec: 0.125 });
    assert.ok(out.length >= 1);
    assert.ok(Math.abs(out[0].at) < 1e-9, `groupe au pas ${s} : début décalé de ${out[0].at}`); // note 1 sur la pulsation
    for (let i = 1; i < out.length; i++) assert.ok(out[i].at > out[i - 1].at && out[i].at < 0.5, 'ordre et frontière du groupe');
  }
});

test('Geste : tout le groupe est programmé à son premier pas, rien aux pas suivants', () => {
  const arp = { mode: 'up', rate: 1, geste: { spread: 0.4 } };
  const ev = { step: 0, len: 16, notes: [57, 60, 64], vel: 0.8 };
  assert.equal(A.renderStep(arp, ev, 0, { stepSec: 0.125 }).length, 4);
  for (const s of [1, 2, 3]) assert.equal(A.renderStep(arp, ev, s, { stepSec: 0.125 }).length, 0);
  // groupe coupé par la fin de l'accord : seules les notes dans l'accord
  assert.equal(A.renderStep(arp, { ...ev, len: 2 }, 0, { stepSec: 0.125 }).length, 2);
});

test('Geste : microvariation bornée, reproductible ; changer un autre réglage ne relance pas le tirage', () => {
  const g = { spread: 1, micro: 10, take: 3 };
  const a = GT(g, 4, 250, 7).at;
  assert.deepEqual(GT(g, 4, 250, 7).at, a);
  assert.equal(a[0], 0); // note 1 sur la pulsation
  a.forEach((x, i) => assert.ok(Math.abs(x - i * 250) <= 10 + 1e-9));
  // l'accent ou l'articulation ne changent pas les décalages ; une nouvelle prise, si
  assert.deepEqual(GT({ ...g, accent: 0.9, art: 0.3 }, 4, 250, 7).at, a);
  assert.notDeepEqual(GT({ ...g, take: 4 }, 4, 250, 7).at, a);
  // chaque groupe a ses propres petits écarts
  assert.notDeepEqual(GT(g, 4, 250, 8).at, a);
});

test('Geste : accent sur la 1re note, articulation sans chevauchement sauf legato voulu', () => {
  const g = GT({ spread: 0.5, accent: 1, art: 0.8 });
  assert.ok(g.vel[0] > 1 && g.vel.slice(1).every((v) => v < 1));
  g.dur.forEach((d, i) => assert.ok(d > 0 && g.at[i] + d < (i < 3 ? g.at[i + 1] : g.groupMs), `note ${i + 1} déborde`));
  const leg = GT({ spread: 0.5, legato: true });
  assert.ok(leg.at[0] + leg.dur[0] > leg.at[1], 'legato : chevauchement voulu');
});

test('Geste : alternance et étalement extrêmes, petits groupes — ordre toujours conservé', () => {
  for (const n of [2, 3, 4, 6, 8])
    for (const spread of [0.1, 0.5, 1])
      for (const alt of [-0.25, 0, 0.25])
        for (const sub of [20, 62.5, 250]) {
          const g = GT({ spread, alt, micro: 20, take: 2 }, n, sub, 1);
          for (let i = 1; i < n; i++) assert.ok(g.at[i] > g.at[i - 1], `n=${n} spread=${spread} alt=${alt} sub=${sub}`);
          assert.equal(g.at[0], 0);
          assert.ok(g.at[n - 1] < g.groupMs);
        }
});

test('Geste « Mécanique » : mêmes attaques que sans geste ; taille des groupes d’après le motif', () => {
  const ev = { step: 0, len: 32, notes: [57, 60, 64], vel: 0.8 };
  const times = (arp) => {
    const t = [];
    for (let s = 0; s < 32; s++) A.renderStep(arp, ev, s, { stepSec: 0.125 }).forEach((n) => t.push([n.midi, +(s * 0.125 + n.at).toFixed(6), +n.dur.toFixed(4)]));
    return t;
  };
  const meca = A.GESTES.find((x) => x.id === 'mecanique').g;
  assert.deepEqual(times({ mode: 'up2', rate: 1, geste: { ...meca } }), times({ mode: 'up2', rate: 1 }));
  assert.equal(A.gesteGroup({ mode: 'up2' }), 4);
  assert.equal(A.gesteGroup({ mode: 'up3' }), 3);
  assert.equal(A.gesteGroup({ mode: 'octaves' }), 2);
  assert.equal(A.gesteGroup({ mode: 'up', geste: { group: 6 } }), 6);
});

test('Geste : longueur fixée (générale ou du pas) prioritaire sur l’articulation ; vélocité du pas conservée', () => {
  const ev = { step: 0, len: 16, notes: [57, 60, 64], vel: 1 };
  const out = A.renderStep({ mode: 'up', rate: 1, noteLen: 4, geste: { spread: 0.5, art: 0.3 } }, ev, 0, { stepSec: 0.125 });
  out.forEach((n) => assert.ok(Math.abs(n.dur - 0.5) < 1e-9));
  const v = A.renderStep({ mode: 'up', rate: 1, lanes: { vel: [1, 0.5, 1, 1] }, geste: { accent: 0 } }, ev, 0, { stepSec: 0.125 });
  assert.ok(Math.abs(v[1].vel - 0.5) < 1e-9);
});

test('Les 6 gestes tout prêts sont valides et gardent les hauteurs', () => {
  assert.equal(A.GESTES.length, 6);
  const notes = A.parseChordSymbol('Am7', 3);
  const dry = A.preview({ mode: 'up2', rate: 0.5 }, notes, 16).map((t) => t.notes);
  for (const p of A.GESTES) {
    assert.deepEqual(A.normGeste(p.g).spread, p.g.spread);
    assert.deepEqual(A.preview({ mode: 'up2', rate: 0.5, geste: { id: p.id, ...p.g } }, notes, 16).map((t) => t.notes), dry, p.id);
  }
});

test('Motif reconnu malgré des silences réglés pas à pas ; motifs à rythme propre distingués', () => {
  require('../js/motifs.js');
  const SS = globalThis.SS;
  const up = { mode: 'up', rate: 1 };
  assert.equal(SS.motifOf(up).id, 'up');
  // un pas mis en silence dans la fenêtre : toujours « Montant »
  assert.equal(SS.motifOf({ ...up, rhythm: { type: 'lane' }, lanes: { rhythm: [1, 1, 0, 1] } }).id, 'up');
  // « Accord en croches » (rythme propre) n'est pas pris pour « Accord à chaque pas »
  assert.equal(SS.motifOf({ mode: 'chord', rhythm: { type: 'lane' }, lanes: { rhythm: [1, 0] } }).id, 'croches');
  assert.equal(SS.motifOf({ mode: 'chord' }).id, 'chord');
  // les anciens réglages ARP ONE (rythme euclidien) : motif « Techno euclidienne », ou aucun
  assert.equal(SS.motifOf(A.fromPreset('techno')).id, 'techno');
  // motif relatif reconnu par son texte
  assert.equal(SS.motifOf({ mode: 'pattern', pattern: 'd1 d5 d1+ d5 d3+ d5 d1+ d5' }).id, 'midnight');
  assert.equal(SS.motifOf({ mode: 'pattern', pattern: 'd1 d1 d1' }), null);
});

test('Changer de motif garde les silences réglés pas à pas (sauf motif à rythme propre)', () => {
  const SS = globalThis.SS;
  const m = (id) => SS.MOTIFS.find((x) => x.id === id);
  const steps = { mode: 'up', rhythm: { type: 'lane' }, lanes: { rhythm: [1, 0, 1, 1] } };
  const toDown = A.normalize({ ...steps, ...SS.motifPatch(steps, m('down')) });
  assert.equal(toDown.mode, 'down');
  assert.deepEqual(toDown.lanes.rhythm, [1, 0, 1, 1]);
  // vers un motif qui a son rythme : on prend le sien
  const toStabs = A.normalize({ ...steps, ...SS.motifPatch(steps, m('stabs')) });
  assert.deepEqual(toStabs.lanes.rhythm, [1, 0, 0, 1, 0, 0, 1, 0]);
  // et en le quittant, son rythme ne reste pas
  const back = A.normalize({ ...toStabs, ...SS.motifPatch(toStabs, m('up')) });
  assert.equal(back.rhythm.type, 'all');
  assert.deepEqual(back.lanes.rhythm, []);
});

test('Renversements : C3 E3 G3 → C (fondamental), C/E (Mi Sol Do), C/G (Sol Do Mi)', () => {
  const C3 = 48, E3 = 52, G3 = 55;
  const inv = (notes, i) => A.invertChord(notes, i).map(A.noteName);
  assert.deepEqual(inv([C3, E3, G3], 0), ['C3', 'E3', 'G3']);
  assert.deepEqual(inv([C3, E3, G3], 1), ['E3', 'G3', 'C4']);
  assert.deepEqual(inv([C3, E3, G3], 2), ['G3', 'C4', 'E4']);
  // depuis un accord déjà renversé, l'état fondamental redescend la fondamentale à la basse
  assert.deepEqual(inv([E3, G3, 60], 0), ['C3', 'E3', 'G3']);
  // accord de 4 sons : 3e renversement = septième à la basse ; doublures et tensions conservées
  assert.deepEqual(inv([C3, E3, G3, 58], 3), ['Bb3', 'C4', 'E4', 'G4']);
  assert.deepEqual(inv([C3, E3, G3, 60], 1), ['E3', 'G3', 'C4', 'E4']);
  assert.equal(A.analyzeChord(A.invertChord([C3, E3, G3], 1))[0].name, 'C/E');
  assert.equal(A.analyzeChord(A.invertChord([C3, E3, G3], 2))[0].name, 'C/G');
});

test('Renversement dans l’arpège : Montant part de la basse renversée ; « Tel que joué » ne change rien', () => {
  assert.deepEqual(names(seqOf({ mode: 'up', rate: 1, inversion: 1 }, [C, E, G], 4)), ['E4', 'G4', 'C5', 'E4']);
  assert.deepEqual(names(seqOf({ mode: 'up', rate: 1, inversion: 2 }, [C, E, G], 3)), ['G4', 'C5', 'E5']);
  assert.deepEqual(seqOf({ mode: 'up', rate: 1, inversion: 'asis' }, [E, G, 72], 6), seqOf({ mode: 'up', rate: 1 }, [E, G, 72], 6));
  assert.equal(A.normalize({}).inversion, 'asis');
  assert.equal(A.normalize({ inversion: '2' }).inversion, 2);
  assert.equal(A.normalize({ inversion: 'bad' }).inversion, 'asis');
  // « Tourne à chaque boucle » : fondamental, 1er, 2e renversement, puis on recommence
  const first = (loop) => A.noteName(A.preview({ mode: 'up', rate: 1, inversion: 'cycle' }, [C, E, G], 1, { loop })[0].notes[0]);
  assert.deepEqual([0, 1, 2, 3].map(first), ['C4', 'E4', 'G4', 'C4']);
});

/* ---------- Voicings, enchaînement, écho, ratchet roulé, lignes Degré / Vitesse, sens de lecture, nouveaux motifs ---------- */

test('Voicings : ouvert, drop 2, drop 3, basse grave', () => {
  const nm = (a) => a.map(A.noteName);
  assert.deepEqual(nm(A.applyVoicing([48, 52, 55], 'open')), ['C3', 'G3', 'E4']);
  assert.deepEqual(nm(A.applyVoicing([48, 52, 55, 59], 'drop2')), ['G2', 'C3', 'E3', 'B3']);
  assert.deepEqual(nm(A.applyVoicing([48, 52, 55, 59], 'drop3')), ['E2', 'C3', 'G3', 'B3']);
  assert.deepEqual(nm(A.applyVoicing([48, 52, 55], 'bass')), ['C2', 'E3', 'G3']);
  // voicing + renversement : 1er renversement ouvert = Mi Do Sol′
  assert.deepEqual(names(seqOf({ mode: 'up', rate: 1, inversion: 1, voicing: 'open' }, [48, 52, 55], 3)), ['E3', 'C4', 'G4']);
});

test('Renversement « Le plus proche » : C → F → G enchaînés avec notes communes', () => {
  const events = [
    { step: 0, len: 16, notes: [60, 64, 67] }, // C4 E4 G4
    { step: 16, len: 16, notes: [65, 69, 72] }, // F4 A4 C5
    { step: 32, len: 16, notes: [67, 71, 74] }, // G4 B4 D5
  ];
  const v = (i) => A.voiced(events[i].notes, { inversion: 'smooth' }, 0, events, events[i]).map(A.noteName);
  assert.deepEqual(v(0), ['C4', 'E4', 'G4']); // le premier accord reste tel que joué
  assert.deepEqual(v(1), ['C4', 'F4', 'A4']); // F/C : Do commun gardé
  assert.deepEqual(v(2), ['B3', 'D4', 'G4']); // G/B : Sol commun, petits pas
  // sans la liste des accords (aperçu d'un accord seul) : notes telles que jouées
  assert.deepEqual(A.voiced([65, 69, 72], { inversion: 'smooth' }).map(A.noteName), ['F4', 'A4', 'C5']);
  // dans le moteur : l'arpège du 2e accord part de Do
  const out = A.renderStep({ mode: 'up', rate: 1, inversion: 'smooth' }, events[1], 16, { loop: 0, stepSec: 0.125, events });
  assert.equal(A.noteName(out[0].midi), 'C4');
});

test('Écho : répétitions plus faibles, décalées, transposées dans l’accord', () => {
  const ev = { step: 0, len: 4, notes: [C, E, G], vel: 0.8 };
  const out = A.renderStep({ mode: 'up', rate: 1, echo: { n: 2, gap: 2, decay: 0.5, shift: 'up1' } }, ev, 0, { loop: 0, stepSec: 0.125 });
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((n) => A.noteName(n.midi)), ['C4', 'E4', 'G4']);
  assert.ok(Math.abs(out[1].at - 0.25) < 1e-9 && Math.abs(out[2].at - 0.5) < 1e-9);
  assert.ok(Math.abs(out[1].vel - out[0].vel * 0.5) < 1e-9);
  const oct = A.renderStep({ mode: 'up', rate: 1, echo: { n: 1, shift: 'oct' } }, ev, 0, { loop: 0, stepSec: 0.125 });
  assert.equal(oct[1].midi, C + 12);
  assert.equal(A.normalize({}).echo.n, 0);
});

test('Ratchet roulé : les répétitions parcourent l’accord', () => {
  const ev = { step: 0, len: 4, notes: [C, E, G], vel: 0.8 };
  const r = (roll) => A.renderStep({ mode: 'up', rate: 1, roll, lanes: { ratchet: [4] } }, ev, 0, { loop: 0, stepSec: 0.125 }).map((n) => A.noteName(n.midi));
  assert.deepEqual(r('none'), ['C4', 'C4', 'C4', 'C4']);
  assert.deepEqual(r('up'), ['C4', 'E4', 'G4', 'C5']);
  assert.deepEqual(r('down'), ['C4', 'G3', 'E3', 'C3']);
  assert.deepEqual(r('updown'), ['C4', 'E4', 'G4', 'E4']);
});

test('Ligne Degré et ligne Vitesse du pas (rafales qui avancent dans l’arpège)', () => {
  assert.deepEqual(names(seqOf({ mode: 'up', rate: 1, lanes: { deg: [0, 1] } }, [C, E, G], 4)), ['C4', 'G4', 'G4', 'E4']);
  // ×2 sur le 1er pas : C E dans le pas 1, puis G, puis C …
  const ev = { step: 0, len: 4, notes: [C, E, G], vel: 0.8 };
  const info = { loop: 0, stepSec: 0.125 };
  const arp = { mode: 'up', rate: 1, lanes: { div: [2, 1] } };
  const seq = [];
  for (let s = 0; s < 4; s++) A.renderStep(arp, ev, s, info).forEach((n) => seq.push(A.noteName(n.midi) + '@' + (s * 0.125 + n.at).toFixed(4)));
  assert.deepEqual(seq, ['C4@0.0000', 'E4@0.0625', 'G4@0.1250', 'C4@0.2500', 'E4@0.3125', 'G4@0.3750']);
});

test('Sens de lecture des lignes : arrière, ping-pong, hasard reproductible', () => {
  const vel = (dir, n = 6) => A.preview({ mode: 'up', rate: 1, lanes: { vel: [1, 0.5, 0.25] }, laneDir: { vel: dir } }, [C, E, G], n).map((t) => +(t.vel / 0.8).toFixed(2));
  assert.deepEqual(vel('fwd'), [1, 0.5, 0.25, 1, 0.5, 0.25]);
  assert.deepEqual(vel('rev'), [0.25, 0.5, 1, 0.25, 0.5, 1]);
  assert.deepEqual(vel('pingpong', 8), [1, 0.5, 0.25, 0.5, 1, 0.5, 0.25, 0.5]);
  assert.deepEqual(vel('random', 16), vel('random', 16));
  assert.deepEqual(A.normalize({ laneDir: { vel: 'fwd', oct: 'bad', rhythm: 'rev' } }).laneDir, { rhythm: 'rev' });
  // rythme lu à l'envers : 1 0 0 → 0 0 1
  assert.deepEqual(seqOf({ mode: 'up', rate: 1, lanes: { rhythm: [1, 0, 0] }, laneDir: { rhythm: 'rev' } }, [C, E, G], 6), ['.', '.', '60', '.', '.', '64']);
});

test('Nouveaux motifs génératifs : cascade, vague, balancier, Fibonacci, Nørgård', () => {
  assert.deepEqual(names(seqOf({ mode: 'cascade', rate: 1 }, [C, E, G], 6)), ['G4', 'E4', 'C4', 'C5', 'G4', 'E4']);
  assert.deepEqual(names(seqOf({ mode: 'wave', rate: 1 }, [C, E, G], 8)), ['C4', 'E4', 'G4', 'E4', 'E4', 'G4', 'C5', 'G4']);
  assert.deepEqual(names(seqOf({ mode: 'balance', rate: 1 }, [C, E, G], 5)), ['E4', 'G4', 'C4', 'C5', 'G3']);
  assert.deepEqual([...Array(8).keys()].map((j) => A.fibMod(j, 10)), [0, 1, 1, 2, 3, 5, 8, 3]);
  assert.deepEqual([...Array(8).keys()].map(A.norgard), [0, 1, -1, 2, 1, 0, -2, 3]);
  for (const m of ['cascade', 'wave', 'balance', 'fibo', 'norgard']) {
    assert.ok(A.MODES.some((x) => x.id === m));
    assert.ok(seqOf({ mode: m, rate: 1, octaves: 2 }, [57, 60, 64, 67], 64).every((x) => x !== '.' && +x >= 24 && +x <= 108), m);
  }
});

test('Motifs « Rythmes du monde » et accents reconnus et appliqués', () => {
  require('../js/motifs.js');
  const M = (id) => SS.MOTIFS.find((x) => x.id === id);
  for (const id of ['tresillo', 'clave', 'bossa', 'trois4', 'cinq4', 'cascade', 'norgard', 'bassemelodie']) {
    const m = M(id);
    assert.ok(m, id);
    const a = A.normalize({ mode: 'up', ...SS.motifPatch({ mode: 'up' }, m) });
    assert.equal(SS.motifOf(a).id, id, id);
  }
  // quitter un motif d'accents retire le cycle de vélocité
  const t34 = A.normalize(SS.motifPatch({}, M('trois4')));
  assert.deepEqual(t34.lanes.vel, [1, 0.5, 0.5]);
  const back = A.normalize({ ...t34, ...SS.motifPatch(t34, M('up')) });
  assert.deepEqual(back.lanes.vel, []);
  assert.equal(SS.motifOf(back).id, 'up');
});

test('Surprends-moi : les verrous gardent motif, rythme, accord et effets ; tirages variés', () => {
  require('../js/motifs.js');
  let s = 11;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = A.normalize({ ...SS.motifPatch({}, SS.MOTIFS.find((m) => m.id === 'midnight')), rate: 1, inversion: 1, voicing: 'open', echo: { n: 2, shift: 'oct' }, roll: 'up', geste: { id: 'harpe', ...A.GESTES.find((g) => g.id === 'harpe').g }, rhythm: { type: 'lane' }, lanes: { rhythm: [1, 0, 1, 1] } });
  const all = { motif: true, rythme: true, accord: true, effets: true };
  for (let i = 0; i < 30; i++) {
    const a = SS.arpSurprise(base, all, rand);
    assert.equal(a.pattern, base.pattern);
    assert.equal(a.rate, base.rate);
    assert.deepEqual(a.lanes.rhythm, base.lanes.rhythm);
    assert.equal(a.inversion, 1);
    assert.equal(a.voicing, 'open');
    assert.deepEqual([a.echo, a.roll, a.geste], [base.echo, base.roll, base.geste]);
  }
  const names = new Set();
  for (let i = 0; i < 30; i++) {
    const a = SS.arpSurprise(base, { rythme: true }, rand);
    assert.equal(a.rate, 1);
    assert.deepEqual(a.lanes.rhythm, [1, 0, 1, 1]); // rythme gardé : aucun motif à rythme propre
    assert.deepEqual(A.normalize(a), a);
    names.add((SS.motifOf(a) || { id: 'perso' }).id);
    assert.ok(A.preview(a, [57, 60, 64], 16).some((t) => t), 'le tirage joue des notes');
  }
  assert.ok(names.size >= 10, `motifs variés : ${names.size}`);
});

test('Motif suivant / précédent : on parcourt le catalogue en boucle', () => {
  require('../js/motifs.js');
  const up = { mode: 'up' };
  assert.equal(SS.motifStep(up, 1).id, SS.MOTIFS[1].id);
  assert.equal(SS.motifStep(up, -1).id, SS.MOTIFS[SS.MOTIFS.length - 1].id);
  const last = A.normalize(SS.motifPatch({}, SS.MOTIFS[SS.MOTIFS.length - 1]));
  assert.equal(SS.motifStep(last, 1).id, SS.MOTIFS[0].id);
  assert.equal(SS.motifStep({ mode: 'pattern', pattern: 'd1 d1 d1' }, 1).id, SS.MOTIFS[0].id); // motif personnalisé
});

test('Hauteur : l’accord commence dans l’octave demandée, quelle que soit sa hauteur sur la piste', () => {
  const low = (notes, register, extra = {}) => Math.min(...A.voiced(notes, { register, ...extra }));
  for (const notes of [[41, 44, 48], [65, 68, 72], [77, 80, 84]]) {
    assert.ok(low(notes, 3) >= 48 && low(notes, 3) < 60);
    assert.ok(low(notes, 5) >= 72 && low(notes, 5) < 84);
  }
  assert.deepEqual(A.voiced([65, 68, 72], { register: 'asis' }), [65, 68, 72]);
  assert.equal(A.normalize({ register: '4' }).register, 4);
  assert.equal(A.normalize({ register: 9 }).register, 'asis');
  // avec un renversement : la note la plus grave reste dans l'octave choisie
  assert.ok(low([65, 68, 72], 3, { inversion: 2 }) >= 48 && low([65, 68, 72], 3, { inversion: 2 }) < 60);
});

test('Boutons rotatifs : chaque position écrit ses réglages et se relit', () => {
  const base = A.normalize({ mode: 'up', rate: 0.5, steps: 8 });
  for (const mc of A.MACROS) {
    for (const v of [0, 25, 50, 75, 100]) {
      const a = A.normalize({ ...base, ...A.macroPatch(base, mc.id, v), macros: { [mc.id]: v } });
      assert.equal(A.macroValue(a, mc.id), v, `${mc.id} ${v}`);
      assert.ok(A.macroText(a, mc.id).length > 0);
      assert.ok(A.preview(a, [57, 60, 64], 16).some((t) => t));
    }
  }
  const d0 = A.normalize({ ...base, ...A.macroPatch(base, 'density', 0) });
  assert.ok(d0.lanes.rhythm.filter((x) => x).length < 8);
  const d100 = A.normalize({ ...base, ...A.macroPatch(base, 'density', 100) });
  assert.ok(d100.lanes.div.some((x) => x > 1) && d100.lanes.ratchet.some((x) => x > 1));
  assert.equal(A.normalize({ ...base, ...A.macroPatch(base, 'width', 100) }).octaves, 4);
  assert.equal(A.normalize({ ...base, ...A.macroPatch(base, 'echo', 0) }).echo.n, 0);
  assert.equal(A.normalize({ ...base, ...A.macroPatch(base, 'echo', 80) }).echo.shift, 'up1');
  // réglage changé ailleurs : la position stockée ne vaut plus, elle est déduite des réglages
  const w = A.normalize({ ...base, ...A.macroPatch(base, 'width', 30), macros: { width: 30 }, octaves: 4 });
  assert.ok(A.macroValue(w, 'width') >= 85);
});

test('motif par accord (« | ») : chaque accord de la piste a son motif, qui repart à chaque accord', () => {
  const arp = { mode: 'pattern', pattern: '0 1 2 | 0 1 2 | 0 2 1 | 0 2 1', rate: 1 };
  const chords = [[69, 74, 76], [69, 76, 79], [69, 74, 77], [69, 72, 76]];
  const events = chords.map((notes, i) => ({ step: i * 16, len: 16, notes, vel: 0.8 }));
  const bar = (e) => {
    const out = [];
    for (let s = e.step; s < e.step + 16; s++) A.renderStep(arp, e, s, { loop: 0, stepSec: 0.1, events }).forEach((n) => out.push(A.noteName(n.midi)));
    return out;
  };
  assert.deepEqual(bar(events[0]).slice(0, 4), ['A4', 'D5', 'E5', 'A4']);
  assert.equal(bar(events[0]).length, 16);
  assert.equal(bar(events[0])[15], 'A4'); // 5 groupes de 3 + la note de reprise
  assert.deepEqual(bar(events[2]).slice(0, 3), ['A4', 'F5', 'D5']);
  assert.deepEqual(bar(events[3]).slice(0, 3), ['A4', 'E5', 'C5']);
  // sans les accords de la piste (aperçu) : le premier motif
  assert.deepEqual(A.preview(arp, chords[2], 3).map((t) => A.noteName(t.notes[0])), ['A4', 'D5', 'F5']);
  assert.deepEqual(A.patternParts(' 0 1 |  | 2 '), ['0 1', '2']);
});
