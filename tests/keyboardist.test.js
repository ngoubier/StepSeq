/*
 * Clavier de « Nouvelle chanson » : catalogue, motifs « k: » et réglages (js/keyboardist.js), et son moteur (js/bandsong.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'melody.js', 'horns-motifs.js', 'horns.js', 'padmotifs.js', 'keys-motifs.js', 'keyboardist.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
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
      if (!/^kf?:/.test(id)) assert.ok(B.PAD_NEW[id] || SS.padMotifs.MODES.some((m) => m[0] === id), `${id} : mode du moteur de nappe`);
    }
  }
  // en 4/4, chaque style a au moins trois motifs par jeu
  for (const [st] of K.STYLES) for (const j of ['acc', 'arp']) assert.ok(K.modesOf(j).filter((id) => K.inStyle(id, st) && B.meterOK('keys', id, '4/4')).length >= 3, `${st} : moins de trois motifs en ${j}`);
  // noms uniques dans chaque jeu
  for (const j of ['acc', 'arp']) {
    const names = K.modesOf(j).map(K.name);
    assert.equal(new Set(names).size, names.length, `${j} : deux motifs du même nom`);
  }
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

test('fenêtre Avancé : motif réécrit, couleurs, étalement, swing, équilibre, octaves', () => {
  const sp = spans(['i', 'VI']);
  // motif réécrit : texte de 16 pas, jetons connus seulement
  assert.ok(K.parsePat('B+C . . . c . . . O+C . . . c . . .'));
  assert.equal(K.parsePat('B+C . X'), null);
  assert.equal(K.parsePat('Z . . . . . . . . . . . . . . .'), null);
  const steps = K.stepsOf('k:blanches');
  assert.equal(steps.length, 16);
  assert.equal(steps[0], 'B+C');
  const pat = K.patText(steps.map((t, i) => (i === 4 ? 'c' : t)));
  const ev = K.events(sp, 'block4', ctx, pat);
  assert.ok(ev.some((e) => e.step === 4) && ev.some((e) => e.step === 20), 'le motif réécrit joue, même sur un mode du moteur');
  assert.equal(K.normalize({ pat }).pat, pat);
  assert.equal(K.normalize({ pat: 'n’importe quoi' }).pat, undefined);
  assert.ok(K.advanced({ pat }) && K.advanced({ roll: 20 }) && !K.advanced({ lh: 'oct', energy: 0.9 }));
  // couleurs : la septième s'ajoute, sus4 remplace la tierce
  const base = K.events(sp, 'k:blanches', ctx);
  const rh = (es) => es.filter((e) => Math.min(...e.notes) >= 55 || e.notes.length >= 3);
  const c0 = sp[0].chord;
  const rel = (n) => (((n - c0.rootPc) % 12) + 12) % 12;
  const col = K.shape(base, sp, { col7: true, lh: 'aucune' }, () => 0.5, ctx.tones);
  assert.ok(col[0].notes.some((n) => rel(n) === 10), 'septième mineure sur i');
  const sus = K.shape(base, sp, { sus: true, lh: 'aucune' }, () => 0.5, ctx.tones);
  assert.ok(sus[0].notes.some((n) => rel(n) === 5) && !sus[0].notes.some((n) => rel(n) === 3), 'sus4');
  assert.ok(rh(col).length);
  // étalement : une note après l'autre, décalées
  const roll = K.shape(base, sp, { roll: 60, lh: 'aucune' }, () => 0.5);
  const first = roll.filter((e) => e.step <= 1);
  assert.ok(first.length >= 3 && first.some((e) => e.shift || e.step === 1), 'accord étalé');
  // swing des croches : les contretemps arrivent en retard
  const pop = K.events(sp, 'k:pop8', ctx);
  const sw = K.shape(pop, sp, { swing: 1 }, () => 0.5);
  assert.ok(sw.some((e) => e.shift && e.step === 3), 'croche du contretemps retardée');
  // équilibre : main droite devant
  const bal = K.shape(base, sp, { bal: 1 }, () => 0.5);
  const lhV = bal.find((e) => Math.max(...e.notes) < 55).vel;
  const rhV = bal.find((e) => Math.min(...e.notes) >= 55).vel;
  assert.ok(rhV > lhV, 'main droite plus forte');
  // octaves de l'arpège : la deuxième moitié une octave plus haut
  const arp = K.events(sp, 'k:up16', ctx);
  const o2 = K.shape(arp, sp, { oct: 2 }, () => 0.5);
  assert.equal(o2.find((e) => e.step === 8).notes[0], arp.find((e) => e.step === 8).notes[0] + 12);
  // jetons approchés d'un mode du moteur
  const fromEngine = K.patFromEvents(B.chordEvents([{ step: 0, len: 16, chord: { rootPc: 0, type: 'maj' } }], 'block4', () => 0.5, { lo: 57, hi: 79 }));
  assert.ok(K.parsePat(fromEngine) && /C|c/.test(fromEngine), fromEngine);
});

test('dans la chanson : le motif réécrit du Clavier', () => {
  const p = SS.Band.STYLES.flatMap((s) => s.presets).find((x) => x.musicians.some((m) => m.role === 'keys') && SS.BandSongs[x.id].sections && !SS.BandSongs[x.id].meter);
  const spec = SS.BandSongs[p.id];
  const tr = p.musicians.filter((m) => !m.injected && !m.kits && !m.horns).map((m) => ({ id: m.role, type: 'instrument', category: 'chord', band: { key: m.role } }));
  const sec = Object.keys(spec.sections)[0];
  const pat = 'B+C . . . . . . . . . . . . . . .';
  const mine = B.build(spec, p.id, tr, { parts: { [sec]: { keys: { mode: 'k:pop8', keys: { pat } } } } }).scenes.find((x) => x.sec === sec).data.keys.events;
  assert.ok(mine.length && mine.every((e) => e.step % 16 === 0), 'une attaque par mesure');
});

test('les 150 motifs du fichier : lus, rangés, joués sur les accords de la scène', () => {
  assert.equal(K.FILE.length, 150);
  assert.deepEqual(K.FILE.map((m) => m.n), Array.from({ length: 150 }, (_, i) => i + 1));
  for (const m of K.FILE) {
    const id = 'kf:' + m.id;
    assert.ok(K.modesOf(m.jeu).includes(id), `${m.n} : dans son jeu`);
    assert.ok(m.styles.length && m.styles.every((s) => K.STYLES.some((x) => x[0] === s)), `${m.n} : styles`);
    assert.ok(m.scenes.length, `${m.n} : types de scène`);
    assert.ok(B.meterOK('keys', id, m.meter) && (m.meter === '4/4' || !B.meterOK('keys', id, '4/4')), `${m.n} : sa mesure seulement`);
    assert.ok(Object.values(m.parts).flat().every(([st, n, len, v]) => st >= 0 && st < m.bars * m.spb && n >= 21 && n <= 108 && len > 0 && v >= 1 && v <= 127), `${m.n} : notes lisibles`);
  }
  // sur sa propre grille, le motif rend les notes du fichier
  const m1 = K.FILE[0];
  const own = m1.chords.map(([st, root, , sym], i) => ({ step: st, len: (m1.chords[i + 1] ? m1.chords[i + 1][0] : m1.bars * m1.spb) - st, chord: { rootPc: root, type: /m7/.test(sym) ? 'm7' : 'maj' } }));
  const same = K.events(own, 'kf:' + m1.id, ctx);
  const written = Object.values(m1.parts).flat().map((x) => x[1]).sort((a, b) => a - b);
  assert.deepEqual(same.flatMap((e) => e.notes).sort((a, b) => a - b), written);
  // sur une autre grille : chaque note reste près de l'originale et dans la gamme de l'accord, la main gauche marquée
  const sp = spans(['i', 'VI', 'III', 'VII']);
  for (const m of K.FILE.filter((x) => x.meter === '4/4')) {
    const ev = K.events(sp, 'kf:' + m.id, ctx);
    assert.ok(ev.length, `${m.n} : des notes`);
    for (const e of ev) {
      assert.ok(e.step >= 0 && e.step < 64 && e.len >= 1 && e.step + e.len <= 64, `${m.n} : durée`);
      assert.ok(e.notes.every((n) => n >= 20 && n <= 110), `${m.n} : registre`);
    }
    if (m.parts.MG) assert.ok(ev.some((e) => e.lh), `${m.n} : main gauche`);
  }
  // ★ : trois au plus par scène, jeu et style
  for (const sec of ['intro', 'verse', 'chorus', 'bridge', 'outro', 'pre']) for (const j of ['acc', 'arp']) assert.ok(K.stars(sec, j, 'all').length <= 3 && K.stars(sec, j, 'all').every((id) => K.jeuOf(id) === j));
  assert.ok(K.stars('chorus', 'acc', 'pop').length >= 1);
  // dans la chanson : un motif du fichier joue, la main gauche peut se couper
  const p = SS.Band.STYLES.flatMap((s) => s.presets).find((x) => x.musicians.some((mm) => mm.role === 'keys') && SS.BandSongs[x.id].sections && !SS.BandSongs[x.id].meter);
  const spec = SS.BandSongs[p.id];
  const tr = p.musicians.filter((mm) => !mm.injected && !mm.kits && !mm.horns).map((mm) => ({ id: mm.role, type: 'instrument', category: 'chord', band: { key: mm.role } }));
  const sec = Object.keys(spec.sections)[0];
  const mine = B.build(spec, p.id, tr, { parts: { [sec]: { keys: { mode: 'kf:f026', keys: { lh: 'aucune' } } } } }).scenes.find((x) => x.sec === sec).data.keys.events;
  assert.ok(mine.length && mine.every((e) => !('lh' in e)));
  // Clavier ajouté : il joue d'office le motif ★ de chaque scène (dans le style de la chanson)
  const xt = { id: 'xk', type: 'instrument', category: 'chord', kind: 'keys', band: { key: 'keys', musician: 'x1' } };
  const star = K.sceneDefault(sec, spec.sections[sec].keys, p.id, (m) => B.meterOK('keys', m));
  assert.ok(/^kf:/.test(star) && K.stars(sec, K.jeuOf(star), K.styleOfPreset(p.id), (m) => B.meterOK('keys', m))[0] === star, star);
  const ev = (parts) => B.build(spec, p.id, [...tr, xt], { parts }).scenes.find((x) => x.sec === sec).data.xk.events;
  const auto = ev(null);
  assert.ok(auto.length);
  assert.deepStrictEqual(auto, ev({ [sec]: { inst: { 'x1:keys': { mode: star } } } }));
  assert.notDeepStrictEqual(auto, ev({ [sec]: { inst: { 'x1:keys': { mode: 'block4' } } } }));
  // hors de sa mesure : un motif du fichier de la mesure (ou le rythme de la mesure)
  B.setMeter('6/8');
  try {
    const f = B.fitMode('keys', 'kf:f001');
    assert.ok(B.meterOK('keys', f), f);
  } finally {
    B.setMeter('4/4');
  }
});
