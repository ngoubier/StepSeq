/*
 * Band : réglages par scène (option parts de SS.bandSong.build) et bibliothèque de motifs de batterie
 * (js/drum-patterns.js).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'drum-patterns.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;

const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets.map((p) => ({ ...p, style: st.id })));
/** Une piste par musicien (et par pièce de batterie), comme les crée Band. */
const tracksOf = (p) =>
  p.musicians.flatMap((m) =>
    m.kits
      ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } }))
      : [{ id: m.role, type: 'instrument', category: m.role === 'bass' || m.role === 'lead' ? 'mono' : 'chord', band: { key: m.role } }]
  );
// toutes les pistes utiles aux réglages, quel que soit le plan
const TR = [
  ...['bd', 'sd', 'cp', 'hh', 'oh', 'cr', 'ht', 'mt', 'lt', 'rim'].map((s) => ({ id: 'drums:' + s, type: 'drum', sound: s, band: { key: 'drums:' + s } })),
  ...['bass', 'pad', 'arp', 'lead'].map((r) => ({ id: r, type: 'instrument', category: 'chord', band: { key: r } })),
];
const SPEC = { key: 'C minor', groove: 'synthpop', form: 'a b', sections: {
  a: { bars: 8, chords: 'i | VI | III | VII', drums: 'main', bass: '8', pad: 'sustain', arp: 'up16', lead: 'verse' },
  b: { bars: 8, chords: 'i | VI | III | VII', drums: 'full' }, // sans basse, nappe ni arpège
} };
const build = (parts, spec = SPEC) => SS.bandSong.build(spec, 'test', TR, { parts });
const scene = (s, i = 0) => s.scenes[i];
const stripIds = (s) => JSON.stringify(s.scenes.map((sc) => ({ ...sc, id: 0 })));
const on = (steps, bar, s) => steps[bar * 16 + s] > 0;
const rows = (steps, bars) => Array.from({ length: bars }, (_, b) => steps.slice(b * 16, b * 16 + 16).map((v) => (v > 0 ? 1 : 0)).join(''));

test('sans parts, ou avec parts vide, la chanson est identique pour les 30 plans', () => {
  for (const p of PRESETS) {
    const tr = tracksOf(p);
    const a = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr);
    const b = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr, { parts: {} });
    const c = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr, { parts: { inconnue: { off: ['arp'] } } });
    assert.equal(stripIds(b), stripIds(a), p.id);
    assert.equal(stripIds(c), stripIds(a), p.id);
    assert.deepEqual(b.song.map((x) => x.repeat), a.song.map((x) => x.repeat));
  }
});

test('bibliothèque : 4 styles de 20 motifs bien formés', () => {
  assert.deepEqual(Object.keys(SS.DRUM_PATTERNS).sort(), ['ambient', 'edm', 'synthwave', 'techno']);
  const ids = new Set();
  for (const [style, list] of Object.entries(SS.DRUM_PATTERNS)) {
    assert.equal(list.length, 20, style);
    for (const p of list) {
      assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.id);
      assert.ok(!ids.has(p.id), 'id en double : ' + p.id);
      ids.add(p.id);
      assert.ok([1, 2, 3].includes(p.energy), p.id);
      for (const [k, l] of Object.entries(p.lanes)) {
        assert.ok('KSCHO'.includes(k), p.id + ' piste ' + k);
        assert.match(l, /^[xo.-]{16}$/, `${p.id}.${k}`);
      }
      assert.equal(SS.drumPattern(style, p.id), p);
    }
  }
  assert.equal(SS.drumPattern('edm', 'nimporte'), null);
  for (const f of Object.values(SS.DRUM_FILLS)) assert.ok(f.ev.every(([s]) => s >= f.from && s < 16));
  assert.deepEqual(Object.keys(SS.DRUM_FILLS), ['roll', 'toms', 'clap4', 'kick', 'cut', 'open']);
  assert.deepEqual(Object.keys(SS.DRUM_FILL_EVERY).sort(), ['4', '8', 'end', 'off']);
});

test('un motif pilote kick, caisse claire, clap et charleston', () => {
  const pat = SS.drumPattern('synthwave', 'night-drive');
  const d = scene(build({ a: { drums: { style: 'synthwave', pattern: 'night-drive' } } })).data;
  const want = (lane) => rows(d['drums:bd'].steps, 1).length && Array.from(pat.lanes[lane] || '').map((c) => (c === '-' ? 0 : 1)).join('');
  assert.deepEqual(rows(d['drums:bd'].steps, 8), Array(8).fill(want('K')));
  assert.deepEqual(rows(d['drums:sd'].steps, 8), Array(8).fill(want('S')));
  assert.deepEqual(rows(d['drums:cp'].steps, 8), Array(8).fill(want('C')));
  assert.deepEqual(rows(d['drums:hh'].steps, 8), Array(8).fill(want('H')));
  assert.deepEqual(rows(d['drums:oh'].steps, 8), Array(8).fill(want('O')));
  assert.ok(d['drums:bd'].steps[0] > d['drums:hh'].steps[1], 'x plus fort que .');
  assert.ok(d['drums:lt'].steps.every((v) => v === 0) && d['drums:cr'].steps.every((v) => v === 0), 'toms et crash muets sans fill ni crash');
  assert.ok(d['drums:rim'].steps.some((v) => v > 0), 'rim : le jeu du plan');
});

test('clap : prend la caisse claire quand le motif n’a pas de clap ; edits remplace le motif', () => {
  const d = scene(build({ a: { drums: { style: 'synthwave', pattern: 'motorik' } } })).data;
  assert.deepEqual(rows(d['drums:cp'].steps, 1), rows(d['drums:sd'].steps, 1));
  const e = scene(build({ a: { drums: { style: 'synthwave', pattern: 'motorik', edits: { K: 'x-------x-------' } } } })).data;
  assert.deepEqual(rows(e['drums:bd'].steps, 1), ['1000000010000000']);
  assert.ok(e['drums:sd'].steps.every((v) => v === 0), 'piste absente = muette');
});

test('fill : la bonne fréquence de mesures', () => {
  const bars = (fill) => {
    const d = scene(build({ a: { drums: { style: 'synthwave', pattern: 'motorik', fill, fillType: 'roll' } } })).data;
    return Array.from({ length: 8 }, (_, b) => on(d['drums:sd'].steps, b, 8) ? 1 : 0).map((x, b) => (x ? b : -1)).filter((b) => b >= 0);
  };
  assert.deepEqual(bars('off'), []);
  assert.deepEqual(bars('end'), [7]);
  assert.deepEqual(bars('4'), [3, 7]);
  assert.deepEqual(bars('8'), [7]);
});

test('fill : kick au début, charleston remplacé ; « cut » coupe les pas 12 à 15 ; toms ; clap ; crash', () => {
  const run = (fillType, extra = {}) => scene(build({ a: { drums: { style: 'synthwave', pattern: 'motorik', fill: 'end', fillType, ...extra } } })).data;
  const roll = run('roll');
  assert.ok(on(roll['drums:bd'].steps, 7, 8), 'kick conservé au pas from');
  assert.ok(!on(roll['drums:bd'].steps, 7, 12) && !on(roll['drums:hh'].steps, 7, 10), 'le reste est remplacé');
  assert.ok(on(roll['drums:hh'].steps, 7, 6) && on(roll['drums:bd'].steps, 6, 12), 'les autres mesures gardent le motif');
  const cut = run('cut');
  for (const t of ['bd', 'sd', 'cp', 'hh', 'oh']) for (let s = 12; s < 16; s++) assert.ok(!on(cut['drums:' + t].steps, 7, s), `${t} pas ${s}`);
  assert.ok(on(cut['drums:hh'].steps, 7, 10), 'avant la coupure, le motif continue');
  assert.ok(!on(cut['drums:bd'].steps, 7, 8) === !SS.drumPattern('synthwave', 'motorik').lanes.K[8].match(/[xo.]/), 'cut : le kick du motif');
  const toms = run('toms');
  assert.ok(on(toms['drums:ht'].steps, 7, 8) && on(toms['drums:mt'].steps, 7, 10) && on(toms['drums:lt'].steps, 7, 12));
  assert.ok(!on(toms['drums:ht'].steps, 6, 8), 'toms seulement dans le fill');
  const clap = run('clap4');
  assert.deepEqual([12, 13, 14, 15].map((s) => on(clap['drums:cp'].steps, 7, s)), [true, true, true, true]);
});

test('crash au pas 0 de la scène', () => {
  const d = scene(build({ a: { drums: { style: 'edm', pattern: 'festival', crash: true } } })).data;
  assert.ok(d['drums:cr'].steps[0] > 0);
  assert.equal(d['drums:cr'].steps.filter((v) => v > 0).length, 1);
  const none = scene(build({ a: { drums: { style: 'edm', pattern: 'festival' } } })).data;
  assert.ok(none['drums:cr'].steps.every((v) => v === 0));
});

test('sans motif, fill et crash s’ajoutent au jeu du plan', () => {
  const base = scene(build({})).data;
  const d = scene(build({ a: { drums: { fill: '4', fillType: 'cut', crash: true } } })).data;
  assert.ok(d['drums:cr'].steps[0] > 0);
  for (const b of [3, 7]) for (let s = 12; s < 16; s++) assert.ok(!on(d['drums:hh'].steps, b, s) && !on(d['drums:bd'].steps, b, s));
  assert.deepEqual(d['drums:bd'].steps.slice(0, 48), base['drums:bd'].steps.slice(0, 48));
  assert.deepEqual(d['drums:rim'].steps, base['drums:rim'].steps);
});

test('la nuance de la section s’applique aussi aux motifs', () => {
  const loud = build({ a: { drums: { style: 'edm', pattern: 'big-room' } } }, { ...SPEC, sections: { ...SPEC.sections, a: { ...SPEC.sections.a, energy: 1 } } });
  const soft = build({ a: { drums: { style: 'edm', pattern: 'big-room' } } }, { ...SPEC, sections: { ...SPEC.sections, a: { ...SPEC.sections.a, energy: 0.5 } } });
  const sum = (s) => scene(s).data['drums:hh'].steps.reduce((x, y) => x + y, 0);
  assert.ok(sum(soft) < sum(loud));
  assert.deepEqual(build({ a: { drums: { pattern: 'big-room' } } }).scenes[0].data, build({ a: { drums: { pattern: 'big-room' } } }).scenes[0].data, 'déterministe');
});

const pcs = (ev) => [...new Set(ev.map((e) => e.notes[0] % 12))];
test('pédale : une seule hauteur sous des accords qui changent, rythme conservé', () => {
  const plain = scene(build({})).data.bass.events;
  assert.ok(pcs(plain).length > 1);
  const tonic = scene(build({ a: { bass: { pedal: 'tonic' } } })).data.bass.events;
  assert.deepEqual(pcs(tonic), [0], 'tonique : Do');
  assert.deepEqual(tonic.map((e) => [e.step, e.len]), plain.map((e) => [e.step, e.len]));
  assert.deepEqual(pcs(scene(build({ a: { bass: { pedal: 'fifth' } } })).data.bass.events), [7], 'quinte : Sol');
  const oct = scene(build({ a: { bass: { mode: 'oct', pedal: 'tonic' } } })).data.bass.events;
  assert.deepEqual(pcs(oct), [0]);
  assert.ok(new Set(oct.map((e) => e.notes[0])).size === 2, 'octaves conservées');
});

test('notes d’approche : approach false les supprime', () => {
  // grille qui change souvent : sans réglage, certaines notes d'approche sont posées
  const spec = { ...SPEC, sections: { ...SPEC.sections, a: { ...SPEC.sections.a, bars: 16, chords: 'i | iv | VI | VII', bass: '8' } } };
  const roots = (s) => scene(s).spans.map((sp) => (33 + ((sp.chord.rootPc - 9 + 12) % 12)) % 12);
  const bad = (s) => {
    const sc = scene(s);
    let n = 0;
    sc.data.bass.events.forEach((e) => {
      const sp = sc.spans.find((x) => e.step >= x.step && e.step < x.step + x.len);
      if (e.notes[0] % 12 !== sp.chord.rootPc && e.notes[0] % 12 !== (sp.chord.rootPc + 7) % 12 && e.notes[0] % 12 !== (sp.chord.rootPc + 7) % 12) n++;
    });
    return n;
  };
  assert.ok(roots(build({}, spec)).length > 0);
  assert.ok(bad(build({}, spec)) > 0, 'sans réglage : des notes d’approche');
  assert.equal(bad(build({ a: { bass: { approach: false } } }, spec)), 0);
});

test('registre mid : une octave plus haut', () => {
  const low = scene(build({})).data.bass.events;
  const mid = scene(build({ a: { bass: { register: 'mid' } } })).data.bass.events;
  assert.equal(mid.length, low.length);
  mid.forEach((e, i) => assert.equal(e.notes[0], low[i].notes[0] + 12));
});

test('modes de basse half et quarter, et basse allumée dans une scène sans basse', () => {
  const half = scene(build({ a: { bass: { mode: 'half' } } })).data.bass.events;
  assert.equal(half.length, 8 * 2);
  assert.ok(half.every((e) => e.len === 8) && half.slice(0, 2).map((e) => e.step).join() === '0,8');
  const q = scene(build({ a: { bass: { mode: 'quarter' } } })).data.bass.events;
  assert.equal(q.length, 8 * 4);
  assert.deepEqual(q.slice(0, 4).map((e) => e.step), [0, 4, 8, 12]);
  assert.equal(scene(build({}), 1).data.bass.events.length, 0);
  const lit = scene(build({ b: { bass: { mode: 'quarter' } } }), 1).data.bass.events;
  assert.equal(lit.length, 32);
  assert.ok(lit.every((e) => e.vel > 0 && e.notes.length === 1));
});

test('nappe : le voicing ouvert est plus large ; nappe et arpège allumés dans une scène qui n’en a pas', () => {
  const span = (ev) => Math.max(...ev.map((e) => Math.max(...e.notes) - Math.min(...e.notes)));
  const close = scene(build({})).data.pad.events;
  const open = scene(build({ a: { pad: { voicing: 'open' } } })).data.pad.events;
  assert.equal(open.length, close.length);
  assert.ok(open.every((e, i) => Math.max(...e.notes) - Math.min(...e.notes) >= Math.max(...close[i].notes) - Math.min(...close[i].notes) + 12 - 12));
  assert.ok(span(open) > span(close));
  assert.ok(open.every((e) => Math.max(...e.notes) <= 76 && Math.min(...e.notes) >= 41));
  assert.equal(scene(build({}), 1).data.pad.events.length, 0);
  assert.ok(scene(build({ b: { pad: { mode: 'sustain' } } }), 1).data.pad.events.length > 0);
  assert.equal(scene(build({}), 1).data.arp.events.length, 0);
  assert.ok(scene(build({ b: { arp: { mode: 'up8' } } }), 1).data.arp.events.length > 0);
  const swap = scene(build({ a: { arp: { mode: 'bells' }, pad: { mode: 'block4' } } })).data;
  assert.notDeepEqual(swap.arp.events, scene(build({})).data.arp.events);
  assert.equal(swap.pad.events[0].len, 3);
});

test('off : les rôles muets ne jouent plus dans la scène, les autres scènes ne changent pas', () => {
  const base = build({});
  const s = build({ a: { off: ['arp', 'lead', 'drums'] } });
  assert.equal(scene(s).data.arp.events.length, 0);
  assert.equal(scene(s).data.lead.events.length, 0);
  assert.ok(Object.entries(scene(s).data).filter(([id]) => id.startsWith('drums:')).every(([, d]) => d.steps.every((v) => v === 0)));
  assert.ok(scene(base).data.arp.events.length > 0 && scene(base).data.lead.events.length > 0);
  assert.deepEqual(scene(s).data.pad, scene(base).data.pad);
  assert.deepEqual(scene(s, 1).data, scene(base, 1).data);
  // off l'emporte sur un mode demandé
  assert.equal(scene(build({ a: { off: ['bass'], bass: { mode: 'half' } } })).data.bass.events.length, 0);
});

test('parts[section].lead : la mélodie imposée remplace celle du moteur sur la première piste chantante', () => {
  const base = build({});
  const evs = [{ step: 0, len: 4, notes: [72], vel: 0.9 }, { step: 16, len: 8, notes: [67], vel: 0.7 }, { step: 200, len: 4, notes: [60], vel: 0.7 }];
  const s = build({ a: { lead: { events: evs } } });
  const got = scene(s).data.lead.events;
  assert.deepEqual(got.map((e) => [e.step, e.len, e.notes]), [[0, 4, [72]], [16, 8, [67]]]); // le pas 200 est hors scène (8 mesures = 128 pas)
  assert.ok(got.every((e) => e.vel > 0 && e.vel <= 1));
  // la section b et les autres pistes ne changent pas
  assert.deepEqual(scene(s, 1).data, scene(base, 1).data);
  assert.deepEqual(scene(s).data.bass, scene(base).data.bass);
  // tableau vide : silence
  assert.equal(build({ a: { lead: { events: [] } } }).scenes[0].data.lead.events.length, 0);
  // une scène où l'inspiration ne chante pas la joue quand même, sauf si le rôle est coupé (off)
  assert.equal(scene(base, 1).data.lead.events.length, 0);
  assert.deepEqual(scene(build({ b: { lead: { events: evs } } }), 1).data.lead.events.map((e) => e.notes[0]), [72, 67]);
  assert.equal(scene(build({ a: { lead: { events: evs }, off: ['lead'] } })).data.lead.events.length, 0);
  // sans lead : identique
  assert.equal(stripIds(build({ a: { off: [] } })), stripIds(base));
  // plusieurs pistes chantantes : seule la première (lead avant vox) porte la mélodie imposée
  const sp2 = { ...SPEC, sections: { ...SPEC.sections, a: { ...SPEC.sections.a, vox: 'verse' } } };
  const tr = [...TR, { id: 'vox', type: 'instrument', category: 'mono', band: { key: 'vox' } }];
  const two = SS.bandSong.build(sp2, 'test', tr, { parts: { a: { lead: { events: evs } } } });
  const ref = SS.bandSong.build(sp2, 'test', tr, {});
  assert.deepEqual(two.scenes[0].data.lead.events.map((e) => e.notes[0]), [72, 67]);
  assert.deepEqual(two.scenes[0].data.vox, ref.scenes[0].data.vox);
  // sans piste lead : la voix la porte
  const nolead = tr.filter((t) => t.id !== 'lead');
  const v = SS.bandSong.build(sp2, 'test', nolead, { parts: { a: { lead: { events: evs } } } });
  assert.deepEqual(v.scenes[0].data.vox.events.map((e) => e.notes[0]), [72, 67]);
});
