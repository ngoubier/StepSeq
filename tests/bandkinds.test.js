/*
 * Band : type d'instrument (option kinds de SS.bandSong.build) et réglages par instrument et par scène (parts[section].inst).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'melody.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BS = SS.bandSong;

const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets.map((p) => ({ ...p, style: st.id })));
const tracksOf = (p) =>
  p.musicians.flatMap((m) =>
    m.kits
      ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { musician: m.id, key: m.role + ':' + pc } }))
      : [{ id: m.role, type: 'instrument', band: { musician: m.id, key: m.role } }]
  );
const strip = (s) => JSON.stringify(s.scenes.map((sc) => ({ ...sc, id: 0 })));

// pistes simples : l'id d'instrument est la clé (pas de musicien)
const TR = [
  ...['bd', 'sd', 'hh'].map((s) => ({ id: 'drums:' + s, type: 'drum', sound: s, band: { key: 'drums:' + s } })),
  ...['bass', 'pad', 'arp', 'lead'].map((r) => ({ id: r, type: 'instrument', band: { key: r } })),
];
const SPEC = { key: 'C minor', groove: 'synthpop', form: 'a b', sections: {
  a: { bars: 8, chords: 'i | VI | III | VII', drums: 'main', bass: '8', pad: 'sustain', arp: 'up16', lead: 'verse' },
  b: { bars: 8, chords: 'i | VI | III | VII', drums: 'full', bass: 'whole', pad: 'swell', lead: 'hook' },
} };
const build = (opts = {}, tr = TR) => BS.build(SPEC, 'test', tr, opts);
const ev = (res, id, i = 0) => res.scenes[i].data[id].events;
const lens = (e) => e.map((x) => x.len);

test('sans kinds ni inst, ou avec les types par défaut, la chanson est identique pour les 30 plans', () => {
  for (const p of PRESETS) {
    const tr = tracksOf(p);
    const a = BS.build(BS.SPEC || SS.BandSongs[p.id], p.id, tr);
    const same = {};
    tr.forEach((t) => (same[t.band.musician + ':' + t.band.key] = t.type === 'drum' ? 'drums' : BS.kindOfRole(t.band.key)));
    const b = BS.build(SS.BandSongs[p.id], p.id, tr, { kinds: same, parts: {} });
    const c = BS.build(SS.BandSongs[p.id], p.id, tr, { kinds: {}, parts: { inconnue: { inst: { x: { mode: 'up16' } } } } });
    assert.equal(strip(b), strip(a), p.id);
    assert.equal(strip(c), strip(a), p.id);
  }
});

test('réglage par rôle copié sur l\'instrument : même sortie qu\'avant', () => {
  const role = build({ parts: { a: { bass: { mode: 'oct', pedal: 'tonic' }, pad: { mode: 'swell', voicing: 'open' } } } });
  const inst = build({ parts: { a: { inst: { bass: { mode: 'oct', pedal: 'tonic' }, pad: { mode: 'swell', voicing: 'open' } } } } });
  assert.equal(strip(inst), strip(role));
});

test('identifiants : musicien:clé, puis #n pour les doublons', () => {
  const ids = BS.instIds([{ id: 'x', band: { musician: 'm1', key: 'lead' } }, { id: 'y', band: { musician: 'm1', key: 'lead' } }, { id: 'z', band: { key: 'bass' } }]);
  assert.deepEqual(ids.map((i) => i.id), ['m1:lead', 'm1:lead#1', 'bass']);
});

test('nappe en arpège : notes arpégées des accords', () => {
  const base = build();
  const r = build({ kinds: { pad: 'arp' } });
  const e = ev(r, 'pad');
  assert.ok(e.length > ev(base, 'pad').length);
  assert.ok(e.every((x) => x.notes.length === 1 && x.len <= 2));
  assert.deepEqual(e.slice(0, 4).map((x) => x.step), [0, 1, 2, 3]);
  assert.ok(e.every((x) => x.notes[0] >= 60 && x.notes[0] <= 100));
  // l'arpège du plan n'est pas touché
  assert.equal(JSON.stringify(ev(r, 'arp')), JSON.stringify(ev(base, 'arp')));
  // mode du plan pour ce type (sec.arp = up16) ; réglage par instrument : up8 → croches
  const r8 = build({ kinds: { pad: 'arp' }, parts: { a: { inst: { pad: { mode: 'up8' } } } } });
  assert.deepEqual([...new Set(lens(ev(r8, 'pad')))], [2]);
});

test('basse en accords : accords plaqués, tenus', () => {
  const e = ev(build({ kinds: { bass: 'chords' } }), 'bass');
  assert.ok(e.every((x) => x.notes.length >= 3));
  assert.equal(e[0].len, 16); // « sustain » : un accord par mesure
  assert.ok(e[0].notes.every((n) => n >= 53 && n <= 76));
  // la basse normale reste grave et monophonique
  assert.ok(ev(build(), 'bass').every((x) => x.notes.length === 1 && x.notes[0] < 50));
});

test('lead en arpège, nappe en basse, arpège en mélodie', () => {
  const l = ev(build({ kinds: { lead: 'arp' } }), 'lead');
  assert.ok(l.length > 40 && l.every((x) => x.notes.length === 1 && x.len <= 2));
  const b = ev(build({ kinds: { pad: 'bass' } }), 'pad');
  assert.ok(b.every((x) => x.notes.length === 1 && x.notes[0] < 50));
  const m = ev(build({ kinds: { arp: 'melody' } }), 'arp');
  assert.ok(m.length > 0 && m.every((x) => x.notes.length === 1));
  assert.notEqual(JSON.stringify(m), JSON.stringify(ev(build(), 'lead')), 'une autre mélodie que le lead');
});

test('instrument muet dans le plan : reste muet après changement de type, sauf inst.mode', () => {
  assert.equal(ev(build({ kinds: { arp: 'chords' } }), 'arp', 1).length, 0); // scène b : pas d'arpège
  assert.ok(ev(build({ kinds: { arp: 'chords' }, parts: { b: { inst: { arp: { mode: 'sustain' } } } } }), 'arp', 1).length > 0);
});

test('deux mélodies : le second instrument reçoit une autre mélodie', () => {
  const r = build({ kinds: { pad: 'melody' } });
  const a = ev(r, 'lead');
  const b = ev(r, 'pad');
  assert.ok(a.length && b.length);
  assert.notEqual(JSON.stringify(a.map((x) => [x.step, x.notes])), JSON.stringify(b.map((x) => [x.step, x.notes])));
  assert.equal(JSON.stringify(a), JSON.stringify(ev(build(), 'lead'))); // le lead d'origine ne bouge pas
  // doublure : une octave ou une tierce diatonique au-dessus
  const d = build({ kinds: { pad: 'melody' }, parts: { a: { inst: { pad: { double: 'octave' } } } } });
  assert.deepEqual(ev(d, 'pad').map((x) => x.notes[0]), ev(d, 'lead').map((x) => x.notes[0] + 12));
  const t = build({ kinds: { pad: 'melody' }, parts: { a: { inst: { pad: { double: 'third' } } } } });
  assert.ok(ev(t, 'pad').every((x, i) => x.notes[0] - ev(t, 'lead')[i].notes[0] >= 3 && x.notes[0] - ev(t, 'lead')[i].notes[0] <= 4));
});

test('mélodie imposée : portée par le premier instrument mélodique ; inst.lead pour un autre', () => {
  const lead = { events: [{ step: 0, len: 4, notes: [72], vel: 0.9 }] };
  const r = build({ kinds: { pad: 'melody' }, parts: { a: { lead } } });
  assert.equal(ev(r, 'lead').length, 1);
  const own = { events: [{ step: 4, len: 2, notes: [60] }] };
  const r2 = build({ kinds: { pad: 'melody' }, parts: { a: { lead, inst: { pad: { lead: own } } } } });
  assert.equal(ev(r2, 'pad').length, 1);
  assert.equal(ev(r2, 'pad')[0].step, 4);
});

test('deux arpèges avec des modes différents', () => {
  const r = build({ kinds: { pad: 'arp' }, parts: { a: { inst: { pad: { mode: 'dotted' }, arp: { mode: 'up16' } } } } });
  assert.notEqual(JSON.stringify(ev(r, 'pad').map((x) => x.step)), JSON.stringify(ev(r, 'arp').map((x) => x.step)));
  assert.deepEqual(ev(r, 'arp').slice(0, 4).map((x) => x.step), [0, 1, 2, 3]);
  assert.deepEqual(ev(r, 'pad').slice(0, 3).map((x) => x.step), [0, 3, 6]);
});

test('réglages par instrument et par scène, avec repli sur le rôle', () => {
  const r = build({ parts: { a: { pad: { mode: 'swell' }, inst: { pad: { voicing: 'open' } } } } });
  const base = build({ parts: { a: { pad: { mode: 'swell' } } } });
  assert.notEqual(JSON.stringify(ev(r, 'pad')), JSON.stringify(ev(base, 'pad'))); // voicing ouvert
  assert.equal(JSON.stringify(ev(r, 'pad', 1)), JSON.stringify(ev(base, 'pad', 1))); // scène b : inchangée
  // même mode pour l'instrument que pour le rôle (repli) : swell, un accord par mesure
  assert.equal(ev(r, 'pad')[0].len, 16);
  // off par instrument : seulement lui, seulement la scène
  const o = build({ parts: { a: { inst: { arp: { off: true } } } } });
  assert.equal(ev(o, 'arp').length, 0);
  assert.ok(ev(o, 'pad').length > 0);
  assert.ok(ev(build(), 'arp').length > 0);
  assert.equal(JSON.stringify(ev(o, 'lead')), JSON.stringify(ev(build(), 'lead')));
});

test('kit de batterie : seul le type drums est accepté', () => {
  assert.equal(BS.checkKind(TR[0], 'arp'), false);
  assert.equal(BS.checkKind(TR[0], 'drums'), true);
  assert.equal(BS.checkKind(TR[3], 'drums'), true);
  assert.equal(BS.checkKind(TR[3], 'inconnu'), false);
  const base = build();
  const r = build({ kinds: { 'drums:bd': 'arp', 'drums:sd': 'melody' } });
  assert.equal(strip(r), strip(base));
  assert.ok(r.scenes[0].data['drums:bd'].steps);
});

test('instrument mélodique en drums : fondamentale courte sur le kick et la caisse du motif', () => {
  const parts = { a: { drums: { style: 'synthwave', pattern: 'night-drive' } } };
  const r = build({ kinds: { pad: 'drums' }, parts });
  const e = ev(r, 'pad');
  const d = r.scenes[0].data;
  assert.ok(e.length > 0 && e.every((x) => x.len === 1 && x.notes.length === 1 && x.notes[0] >= 36 && x.notes[0] < 48));
  assert.deepEqual(e.map((x) => x.step), d['drums:bd'].steps.map((v, s) => (v > 0 || d['drums:sd'].steps[s] > 0 ? s : -1)).filter((s) => s >= 0));
  assert.ok(e.filter((x) => x.step < 16).every((x) => x.notes[0] === 36)); // do mineur : fondamentale do sur le premier accord
  // kick seul
  const k = ev(build({ kinds: { pad: 'drums' }, parts: { a: { drums: parts.a.drums, inst: { pad: { mode: 'kick' } } } } }), 'pad');
  assert.deepEqual(k.map((x) => x.step), d['drums:bd'].steps.map((v, s) => (v > 0 ? s : -1)).filter((s) => s >= 0));
  // sans motif : le jeu du plan
  assert.ok(ev(build({ kinds: { pad: 'drums' } }), 'pad').length > 0);
});

test('kinds : repli sur t.id et t.kind', () => {
  const tr = TR.map((t) => (t.id === 'pad' ? { ...t, kind: 'arp' } : t));
  assert.equal(strip(BS.build(SPEC, 'test', tr)), strip(build({ kinds: { pad: 'arp' } })));
  assert.equal(strip(build({ kinds: { pad: 'arp' } }, TR.map((t) => ({ ...t, band: { key: t.band.key + '' } })))), strip(build({ kinds: { pad: 'arp' } })));
});
