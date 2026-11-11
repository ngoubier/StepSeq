/*
 * Band → Mélodie (js/melody.js) : méthode du skill « composer-melodies-accords-texte ».
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'bandsong.js', 'melody.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const M = SS.melody;
const pc = (m) => ((m % 12) + 12) % 12;

test('accords : formules du skill, renversements, noms français, chiffres romains', () => {
  const c = (s, k) => M.parseChordSymbol(s, k);
  assert.deepEqual(c('Am7').tones, [9, 0, 4, 7]);
  assert.deepEqual(c('F♯m7♭5').tones, [6, 9, 0, 4]);
  assert.deepEqual(c('Bbmaj7').tones, [10, 2, 5, 9]);
  assert.deepEqual(c('Csus4').tones, [0, 5, 7]);
  assert.deepEqual(c('G7sus4').tones, [7, 0, 2, 5]);
  assert.deepEqual(c('Cm(maj7)').tones, [0, 3, 7, 11]);
  assert.deepEqual(c('C6/9').tones, [0, 4, 7, 9, 2]);
  assert.equal(c('C/E').bassPc, 4);
  assert.deepEqual(c('Solm').tones, c('Gm').tones);
  assert.deepEqual(c('vi', { tonic: 'C', mode: 'major' }).tones, [9, 0, 4]);
  assert.throws(() => c('vi'), /tonalité/);
  assert.throws(() => c('G7alt'), /altérations/);
  assert.throws(() => c('Cxyz'), /inconnu/);
});

test('grille : mesures, accords partagés, prolongation, répétition, erreurs', () => {
  const g = M.parseGrid('Am | F G | C . . G | %', { spb: 16 });
  assert.deepEqual(g.errors, []);
  assert.equal(g.bars, 4);
  assert.deepEqual(g.spans.map((s) => [s.chord.sym, s.step, s.len]), [['Am', 0, 16], ['F', 16, 8], ['G', 24, 8], ['C', 32, 12], ['G', 44, 4], ['C', 48, 12], ['G', 60, 4]]);
  assert.ok(M.parseGrid('C D E', { spb: 16 }).errors[0].includes('parts égales'));
  const guess = M.guessKeys(M.parseGrid('Am | F | C | G').spans)[0].key;
  assert.deepEqual(guess, { tonic: 'A', mode: 'minor' });
  assert.deepEqual(M.guessKeys(M.parseGrid('C | Am | F | G | C').spans)[0].key, { tonic: 'C', mode: 'major' });
});

test('scansion : vers classiques (élision, e caduc, fin de vers, synérèse, diérèse)', () => {
  const VERS = [
    ["Demain, dès l'aube, à l'heure où blanchit la campagne", 12],
    ["Le vierge, le vivace et le bel aujourd'hui", 12],
    ['Mignonne, allons voir si la rose', 8],
    ['Heureux qui, comme Ulysse, a fait un beau voyage', 12],
    ["Je suis le ténébreux, le veuf, l'inconsolé", 12],
    ['Il pleure dans mon cœur comme il pleut sur la ville', 12],
    ['Sous le pont Mirabeau coule la Seine', 10],
    ['La lune était sereine et jouait sur les flots', 12],
    ['Ô temps, suspends ton vol ! et vous, heures propices', 12],
    ['Elle a les yeux de la lumière', 8],
    ['Les sanglots longs des vi/olons', 8],
  ];
  for (const [v, n] of VERS) assert.equal(M.scanLine(v).count, n, v);
  // -es / -ent devant voyelle : comptés (liaison) en classique
  assert.equal(M.scanLine('Ils chantent et dansent sous la pluie').count, 9);
  // chanson : les e muets de fin de mot ne sont pas chantés
  assert.equal(M.scanLine('Une belle fille sous la pluie', { eMode: 'chanson' }).count, 6);
  // fin féminine chantée
  assert.equal(M.scanLine('Mignonne, allons voir si la rose', { sungFinalE: true }).count, 9);
  // accent principal : dernière syllabe prononcée du vers ; césure d'un vers long sans ponctuation
  const l = M.scanLine('Le vierge, le vivace et le bel aujourd’hui');
  assert.equal(l.syllables[l.count - 1].accent, 2);
  assert.equal(l.syllables[1].accent, 2); // « vier(ge), » : fin de groupe
  // incertitudes signalées
  assert.ok(M.scanLine('Les rues s’allument').notes.some((n) => n.includes('-ent')));
});

test('structure métrique : « 3+5 » par mesure, « 6+6 » en groupes, « 8x4 »', () => {
  const a = M.scanMeter('3+5 8x3', 2);
  assert.deepEqual(a.errors, []);
  assert.equal(a.lines.length, 4);
  assert.deepEqual(a.lines[0].dist, [3, 5]);
  assert.equal(a.lines[0].syllables[0].text, 'V1-S1');
  const b = M.scanMeter('6+6', 2);
  assert.deepEqual(b.lines[0].dist, [6, 6]);
  const c = M.scanMeter('6+6', 3);
  assert.equal(c.lines[0].dist, null);
  assert.equal(c.lines[0].syllables[5].accent, 2);
  assert.ok(M.scanMeter('huit').errors.length);
});

const TEXT = "Je pense à toi quand vient la nuit\nLes rues s'allument une à une\nEt dans le vent de la lune\nJe reviens chanter près de toi";

test('composition : une attaque par syllabe, temps exact, monophonie, tessiture, accords', () => {
  for (const style of ['simple', 'varie', 'dense'])
    for (let seed = 1; seed <= 12; seed++) {
      const r = M.compose({ grid: 'Am | F | C | G', source: 'text', text: TEXT, barsPerLine: 2, seed, style });
      assert.ok(r.ok, r.errors && r.errors.join());
      assert.equal(r.total, 8 * 16);
      r.lines.forEach((l, li) => assert.equal(r.notes.filter((x) => x.line === li).length, l.count));
      // contigu, sans chevauchement, couvre exactement la durée (notes + silences)
      let t = 0;
      r.rows.forEach((row) => {
        assert.equal(row.step, t);
        assert.ok(row.len > 0);
        t += row.len;
      });
      assert.equal(t, r.total);
      r.notes.forEach((x) => assert.ok(x.midi >= 60 && x.midi <= 72 && x.vel >= 1 && x.vel <= 127));
      // appuis (accents de groupe, notes longues) : dans l'accord du moment
      const spanAt = (s) => r.spans.find((sp) => s >= sp.step && s < sp.step + sp.len);
      r.notes.filter((x) => x.syl.accent === 2 || x.len >= 8).forEach((x) => assert.ok(spanAt(x.step).chord.tones.includes(pc(x.midi)), `${x.syl.text} hors accord (graine ${seed})`));
      // un saut d'au plus une octave
      r.notes.forEach((x, i) => i && r.notes[i - 1].line === x.line && assert.ok(Math.abs(x.midi - r.notes[i - 1].midi) <= 12));
      // respiration à la fin de chaque vers
      r.lines.forEach((_, li) => {
        const last = r.notes.filter((x) => x.line === li).pop();
        assert.ok(last.step + last.len <= (li + 1) * 32 - 2, 'respiration en fin de vers');
      });
      assert.ok(!r.checks.some((c) => !c.ok), r.checks.filter((c) => !c.ok).map((c) => c.text).join());
    }
});

test('composition : déterministe, et « autre proposition » change la mélodie', () => {
  const o = { grid: 'C | Am | F | G7 | C', source: 'text', text: TEXT, barsPerLine: 2 };
  const a = M.compose({ ...o, seed: 3 });
  const b = M.compose({ ...o, seed: 3 });
  const c = M.compose({ ...o, seed: 4 });
  assert.deepEqual(a.notes.map((x) => [x.step, x.midi]), b.notes.map((x) => [x.step, x.midi]));
  assert.notDeepEqual(a.notes.map((x) => [x.step, x.midi]), c.notes.map((x) => [x.step, x.midi]));
});

test('fin fermée sur la tonique quand le dernier accord la contient ; conflit expliqué sinon', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = M.compose({ grid: 'C | F | G | C', source: 'meter', meter: '8 8', barsPerLine: 2, seed, ending: 'closed' });
    assert.equal(pc(r.notes[r.notes.length - 1].midi), 0, `graine ${seed}`);
  }
  const r = M.compose({ grid: 'Am | F | C | G', source: 'meter', meter: '8 8', barsPerLine: 2, seed: 1, ending: 'closed' });
  assert.ok(r.checks.some((c) => c.warn && /ne contient pas la tonique/.test(c.text)));
});

test('répartition imposée par mesure et contraintes impossibles', () => {
  const r = M.compose({ grid: 'C | G | Am | F', source: 'meter', meter: '3+5 3+5', barsPerLine: 2, seed: 2 });
  assert.ok(r.ok);
  [[3, 5], [3, 5]].forEach((d, li) => d.forEach((k, b) => assert.equal(r.notes.filter((x) => Math.floor(x.step / 16) === li * 2 + b).length, k)));
  const bad = M.compose({ grid: 'C', source: 'meter', meter: '20', barsPerLine: 1 });
  assert.ok(!bad.ok && /ne tiennent pas/.test(bad.errors[0]));
  const bad2 = M.compose({ grid: 'C', source: 'text', text: 'Je pense à toi [3+3]', barsPerLine: 2 });
  assert.ok(!bad2.ok && /répartition/.test(bad2.errors[0]));
});

test('mesures composées et ternaires', () => {
  const r = M.compose({ grid: 'Am | E7', source: 'meter', meter: '6 6', barsPerLine: 2, timeSig: [6, 8], seed: 1 });
  assert.ok(r.ok);
  assert.equal(r.spb, 12);
  assert.equal(r.total, 4 * 12);
  const w = M.compose({ grid: 'C | G', source: 'meter', meter: '5 5', barsPerLine: 2, timeSig: [3, 4], seed: 1 });
  assert.ok(w.ok && w.total === 4 * 12);
});

test('tableau : positions et valeurs en noires, silences explicites', () => {
  assert.equal(M.posLabel(6), '2 1/2');
  assert.equal(M.quarters(6), '3/2');
  assert.equal(M.valueName(6), 'noire pointée');
  assert.equal(M.valueName(10), 'blanche + croche (liées)');
  const r = M.compose({ grid: 'Am | F', source: 'text', text: 'Je pense à toi', barsPerLine: 2, seed: 1 });
  assert.ok(r.rows.some((x) => x.midi == null && x.syl === 'silence' && x.vel == null));
});

test('export MIDI : en-tête, tempo, paroles, une note par syllabe', () => {
  const r = M.compose({ grid: 'Am | F | C | G', source: 'text', text: TEXT, barsPerLine: 2, seed: 1 });
  const b = M.toMidi(r, 90);
  assert.equal(String.fromCharCode(...b.slice(0, 4)), 'MThd');
  assert.equal((b[12] << 8) | b[13], 960);
  let ons = 0;
  let lyr = 0;
  for (let i = 22; i < b.length - 2; i++) {
    if (b[i] === 0x90 && b[i + 2] > 0) ons++;
    if (b[i] === 0xff && b[i + 1] === 5) lyr++;
  }
  assert.ok(ons >= r.notes.length && lyr === r.notes.length);
  const ev = M.toEvents(r);
  assert.equal(ev.length, r.notes.length);
  assert.ok(ev.every((e) => e.notes.length === 1 && e.vel > 0 && e.vel <= 1 && e.lyric));
});

test('fitGrid : la mélodie dure la grille (4 accords → 4 mesures), structure automatique ou partagée', () => {
  const g = 'Am | F | C | G';
  const a = M.compose({ grid: g, source: 'meter', meter: '', fitGrid: true, seed: 1 });
  assert.ok(a.ok && a.bars === 4 && a.lines.length === 2);
  for (const [m, bars, lines] of [['8', 4, 1], ['8 8', 4, 2], ['4 4 4 4', 4, 4], ['3+5 3+5', 4, 2]]) {
    const r = M.compose({ grid: g, source: 'meter', meter: m, fitGrid: true, seed: 2 });
    assert.ok(r.ok, m + ' ' + (r.errors || []).join());
    assert.equal(r.bars, bars);
    assert.equal(r.lines.length, lines);
    assert.ok(r.notes.every((x) => x.step + x.len <= bars * 16));
  }
  const bad = M.compose({ grid: g, source: 'meter', meter: '8 8 8', fitGrid: true });
  assert.ok(!bad.ok && /parts égales/.test(bad.errors[0]));
  const six = M.compose({ grid: 'C | G | Am | F | C | G', source: 'meter', meter: '', fitGrid: true, seed: 1 });
  assert.equal(six.bars, 6);
  // une mesure très dense reste possible (7 notes dans la dernière mesure)
  assert.ok(M.compose({ grid: 'C | G', source: 'meter', meter: '5+7', fitGrid: true, seed: 1 }).ok);
});

test('aperçu : fonction des accords (repos, préparation, tension, emprunt) et type des notes', () => {
  const r = M.compose({ grid: 'Am | Dm | E7 | Am Bb', source: 'meter', meter: '', fitGrid: true, seed: 1 });
  const fn = Object.fromEntries(r.spans.map((sp) => [sp.chord.sym, sp.chord.fn.id]));
  assert.deepEqual(fn, { Am: 'repos', Dm: 'prep', E7: 'tension', Bb: 'emprunt' });
  assert.ok(r.notes.every((x) => ['chord', 'color', 'passing', 'appog', 'scale', 'tension'].includes(x.kind)));
  assert.equal(M.noteKind("note de l'accord (tierce)"), 'chord');
  assert.equal(M.noteKind('couleur (neuvième)'), 'color');
  assert.equal(M.noteKind('broderie'), 'passing');
});

test('notes en notation anglo-saxonne, orthographiées selon la tonalité', () => {
  assert.equal(M.noteLabel(60), 'C4');
  assert.equal(M.noteLabel(70, { tonic: 'F', mode: 'major' }), 'B♭4');
  assert.equal(M.noteLabel(66, { tonic: 'D', mode: 'major' }), 'F♯4');
  assert.equal(M.keyLabel({ tonic: 'A', mode: 'minor' }), 'A mineur');
  const r = M.compose({ grid: 'Am | F | C | G', source: 'meter', meter: '', fitGrid: true, seed: 1 });
  assert.ok(r.rows.filter((x) => x.midi != null).every((x) => /^[A-G][♯♭]?\d$/.test(x.note)));
  assert.ok(r.hypotheses.some((h) => h.includes('A mineur')));
});

test('checkMelody : tessiture, sauts, temps forts, frottements, fin', () => {
  const chordAt = (st) => (st < 16 ? { pcs: [9, 0, 4], name: 'Am' } : { pcs: [5, 9, 0], name: 'F' });
  const Am = { tonic: 'A', mode: 'minor' };
  // mélodie sage : conjointe, temps forts sur l'accord, fin sur la tonique
  const good = [69, 71, 72, 71, 72, 74, 72, 69].map((m, i) => ({ step: i * 4, len: 4, notes: [m] }));
  const r = M.checkMelody({ events: good, chordAt, key: Am, spb: 16, beat: 4 });
  assert.ok(r.items.every((i) => i.kind !== 'warn'), r.items.map((i) => i.text).join(' / '));
  assert.ok(r.items.some((i) => /tonique/.test(i.text)));
  assert.equal(r.stats.span, 5);
  // sauts > octave, frottement (A♯ tenu sur Am), note hors tonalité, fin hors accord
  const bad = [{ step: 0, len: 8, notes: [57] }, { step: 8, len: 8, notes: [82] }, { step: 16, len: 8, notes: [66] }, { step: 24, len: 8, notes: [71] }];
  const t = M.checkMelody({ events: bad, chordAt, key: Am, spb: 16, beat: 4 }).items.filter((i) => i.kind === 'warn').map((i) => i.text).join(' / ');
  assert.match(t, /Tessiture large/);
  assert.match(t, /plus d’une octave/);
  assert.match(t, /Frottement.*(A♯5|B♭5) sur Am/);
  assert.match(t, /Hors de la tonalité.*F♯4/);
  assert.match(t, /Fin sur B4, hors de l’accord/);
  // la 9e (B sur Am) n'est pas un frottement
  const ninth = [{ step: 0, len: 8, notes: [71] }, { step: 8, len: 8, notes: [69] }];
  assert.ok(!M.checkMelody({ events: ninth, chordAt, key: Am, spb: 16, beat: 4 }).items.some((i) => /Frottement/.test(i.text)));
});


test('complexité : couleurs, appuis hors fondamentale, tessiture et nuances reproductibles', () => {
  const options = { grid: 'Am7 | Fmaj7 | Cmaj7 | G7', source: 'meter', meter: '8 8', fitGrid: true, range: 'voix' };
  const totals = {};
  for (const complexity of ['simple', 'balanced', 'adventurous']) {
    let roots = 0, colors = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = M.compose({ ...options, seed, complexity });
      assert.ok(r.ok);
      assert.equal(r.total, 64);
      assert.equal(r.notes.length, 16);
      assert.deepEqual(r.notes, M.compose({ ...options, seed, complexity }).notes);
      assert.ok(new Set(r.notes.map((n) => n.vel)).size > 3);
      for (const n of r.notes) {
        const chord = r.spans.find((s) => n.step >= s.step && n.step < s.step + s.len).chord;
        roots += pc(n.midi) === chord.rootPc ? 1 : 0;
        colors += !chord.tones.includes(pc(n.midi)) ? 1 : 0;
        assert.ok(n.midi >= 60 && n.midi <= 72 && n.vel >= 1 && n.vel <= 127);
      }
      assert.deepEqual(M.toEvents(r).map((e) => e.vel), r.notes.map((n) => Math.round(n.vel / 127 * 100) / 100));
    }
    totals[complexity] = { roots, colors };
  }
  assert.equal(totals.simple.colors, 0);
  for (const level of ['balanced', 'adventurous']) {
    assert.ok(totals[level].roots < totals.simple.roots);
    assert.ok(totals[level].colors > totals.simple.colors);
  }
});

test('grille commune : calendrier exact, renversements et priorité sur le texte conservé', () => {
  const timeline = { bars: 4, spans: [
    { step: 0, len: 3, symbol: 'C/E' },
    { step: 3, len: 13, symbol: 'Fmaj7' },
    { step: 16, len: 32, symbol: 'G7' },
    { step: 48, len: 16, symbol: 'C' },
  ] };
  const options = { grid: 'Am | Am', timeline, source: 'meter', fitGrid: true, key: { tonic: 'C', mode: 'major' }, seed: 2 };
  const r = M.compose(options);
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.total, 64);
  assert.deepEqual(r.spans.map((s) => [s.step, s.len, s.chord.sym]), timeline.spans.map((s) => [s.step, s.len, s.symbol]));
  assert.equal(r.spans[0].chord.bassPc, 4);
  assert.deepEqual(M.compose(options).notes, r.notes);
  for (const spans of [[], [{ step: 4, len: 12, symbol: 'C' }], [{ step: 0, len: 12, symbol: 'C' }]]) {
    const bad = M.compose({ ...options, timeline: { bars: 1, spans } });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.length > 0);
  }
});
