/*
 * Clavier de « Nouvelle chanson » : catalogue, motifs « k: » et réglages (js/keyboardist.js), et son moteur (js/bandsong.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'melody.js', 'horns.js', 'padmotifs.js', 'keyboardist.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const K = SS.keyboardist;
const B = SS.bandSong;

const spans = (names, key = { tonic: 'A', mode: 'minor' }) => names.map((n, i) => ({ step: i * 16, len: 16, chord: B.parseChord(n, key), bar: i }));
const ctx = { voice: B.voiceChord, tones: (c) => SS.chordNotes(60 + c.rootPc, c.type).map((n) => ((n % 12) + 12) % 12), vel: (v) => v };

test('chaque mode du Clavier a un jeu, une famille, un nom et au moins un style connu', () => {
  for (const j of ['acc', 'arp']) {
    const fams = K.FAMILIES[j].map(([f]) => f);
    for (const id of K.modesOf(j)) {
      assert.equal(K.jeuOf(id), j, id);
      assert.ok(fams.includes(K.familyOf(id)), id);
      assert.ok(K.name(id) && K.name(id) !== id, `${id} : un nom`);
      assert.ok(K.stylesOf(id).length && K.stylesOf(id).every((s) => K.STYLES.some((x) => x[0] === s)), `${id} : styles connus`);
      if (!/^k:/.test(id)) assert.ok(B.PAD_NEW[id] || SS.padMotifs.MODES.some((m) => m[0] === id), `${id} : mode du moteur de nappe`);
    }
  }
  // en 4/4, chaque style a au moins un motif par jeu
  for (const [st] of K.STYLES) for (const j of ['acc', 'arp']) assert.ok(K.modesOf(j).some((id) => K.inStyle(id, st) && B.meterOK('keys', id, '4/4')), `${st} : rien en ${j}`);
  assert.equal(K.styleOfSong('latin'), 'salsa');
  assert.equal(K.styleOfSong('zero'), 'all');
  assert.equal(K.jeuOf('ballad'), 'arp');
  assert.equal(K.jeuOf('inconnu'), 'acc');
});

test('motifs « k: » : 4/4 seulement ; hors du 4/4, un rythme de la mesure', () => {
  assert.ok(B.meterOK('keys', 'k:pop8', '4/4'));
  assert.ok(!B.meterOK('keys', 'k:pop8', '3/4'));
  assert.ok(B.meterOK('keys', 'valse3', '3/4'));
  B.setMeter('3/4');
  try {
    assert.equal(B.fitMode('keys', 'k:alberti'), 'arpvalse');
    assert.ok(B.meterOK('keys', B.fitMode('keys', 'k:pop8')));
  } finally {
    B.setMeter('4/4');
  }
});

test('notes des motifs : main gauche grave, main droite au médium, dans les accords', () => {
  const sp = spans(['i', 'VI', 'III', 'VII']);
  for (const m of K.OWN) {
    const ev = K.events(sp, 'k:' + m.id, ctx);
    assert.ok(ev.length >= 4, m.id);
    for (const e of ev) {
      assert.ok(e.len >= 1 && e.step + e.len <= 64, `${m.id} : durée`);
      const c = sp.find((x) => e.step >= x.step && e.step < x.step + x.len).chord;
      const pcs = ctx.tones(c);
      for (const n of e.notes) {
        if (e.lh) assert.ok(n >= 28 && n < 60, `${m.id} : main gauche ${n}`);
        else assert.ok(n >= 52 && n <= 96, `${m.id} : main droite ${n}`);
        const rel = (((n - c.rootPc) % 12) + 12) % 12;
        assert.ok(pcs.includes(((n % 12) + 12) % 12) || [2, 9, 10, 11].includes(rel), `${m.id} : ${n} hors de l’accord`);
      }
    }
  }
  // une tenue rejoue au changement d'accord en cours de mesure
  const half = [{ step: 0, len: 8, chord: B.parseChord('i', { tonic: 'A', mode: 'minor' }), bar: 0 }, { step: 8, len: 8, chord: B.parseChord('VI', { tonic: 'A', mode: 'minor' }), bar: 0 }];
  const ev = K.events(half, 'k:neuv', ctx);
  assert.ok(ev.some((e) => e.step === 8 && !e.lh) && ev.some((e) => e.step === 8 && e.lh), 'la tenue rejoue sur le deuxième accord');
});

test('réglages : neutres sans réglage, main gauche, voicing, pédale, énergie', () => {
  const sp = spans(['i', 'VI']);
  const ev = K.events(sp, 'k:pop8', ctx);
  const same = K.shape(ev, sp, null);
  assert.deepEqual(same.map((e) => e.notes), ev.map((e) => e.notes));
  assert.ok(same.every((e) => !('lh' in e)));
  const none = K.shape(ev, sp, { lh: 'aucune' });
  assert.ok(none.every((e) => Math.min(...e.notes) >= 55), 'main droite seule');
  const oct = K.shape(ev, sp, { lh: 'oct' });
  assert.ok(oct.find((e) => e.step === 0).notes.length > same.find((e) => e.step === 0).notes.length, 'octave ajoutée');
  const wide = K.shape(ev, sp, { voice: 0.9, lh: 'aucune' });
  const span = (e) => Math.max(...e.notes) - Math.min(...e.notes);
  assert.ok(span(wide[0]) > span(none[0]), 'voicing large');
  const ped = K.shape(ev, sp, { pedal: 1 });
  assert.ok(ped.find((e) => e.step === 2).len > same.find((e) => e.step === 2).len, 'pédale');
  const soft = K.shape(ev, sp, { energy: 0 });
  assert.ok(soft[0].vel < same[0].vel, 'énergie');
  assert.equal(K.knobValue({}, 'energy'), 50);
  assert.deepEqual(K.knobPatch('pedal', 75), { pedal: 0.75 });
  assert.ok(!K.touched({ energy: 0.5 }) && K.touched({ lh: 'oct' }));
});

test('dans la chanson : le pianiste de l’inspiration joue un motif du Clavier, avec ses réglages', () => {
  const p = SS.Band.STYLES.flatMap((s) => s.presets).find((x) => x.musicians.some((m) => m.role === 'keys') && SS.BandSongs[x.id].sections && !SS.BandSongs[x.id].meter);
  const spec = SS.BandSongs[p.id];
  const tr = p.musicians.filter((m) => !m.injected && !m.kits && !m.horns).map((m) => ({ id: m.role, type: 'instrument', category: 'chord', band: { key: m.role } }));
  const sec = Object.keys(spec.sections)[0];
  const base = B.build(spec, p.id, tr).scenes.find((x) => x.sec === sec).data.keys.events;
  const mine = B.build(spec, p.id, tr, { parts: { [sec]: { keys: { mode: 'k:rockh', keys: { lh: 'aucune' } } } } }).scenes.find((x) => x.sec === sec).data.keys.events;
  assert.ok(mine.length && JSON.stringify(mine) !== JSON.stringify(base));
  assert.ok(mine.every((e) => Math.min(...e.notes) >= 55), 'main gauche coupée');
  assert.ok(mine.every((e) => !('lh' in e)));
  assert.equal(B.kindOfRole('keys'), 'keys');
});
