/*
 * Band, « Créer toute la chanson » (js/band-songs.js, js/bandsong.js) : les 20 plans de chanson.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const H = globalThis.SS.harmony;
const SS = globalThis.SS;

const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets.map((p) => ({ ...p, style: st.id })));
/** Une piste par musicien (et par pièce de batterie), comme les crée Band. */
const tracksOf = (p) =>
  p.musicians.flatMap((m) =>
    m.kits
      ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } }))
      : [{ id: m.role, type: 'instrument', category: m.role === 'bass' || m.role === 'lead' ? 'mono' : 'chord', band: { key: m.role } }]
  );
const plays = (d) => (d.steps ? d.steps.some((v) => v > 0) : d.events.length > 0);

test('chaque inspiration a un plan de chanson, et toutes les chansons se construisent', () => {
  assert.equal(PRESETS.length, 20);
  for (const p of PRESETS) {
    assert.ok(SS.BandSongs[p.id], `plan manquant : ${p.id}`);
    const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tracksOf(p));
    assert.ok(s.scenes.length >= 5, `${p.id} : au moins 5 scènes`);
    assert.ok(H.valid(s.key), `${p.id} : tonalité valide`);
    const bars = s.song.reduce((a, b) => a + s.scenes.find((x) => x.id === b.scene).bars * b.repeat, 0);
    const sec = (bars * 4 * 60) / p.tempo;
    assert.ok(sec > 120 && sec < 300, `${p.id} : durée raisonnable (${Math.round(sec)} s)`);
  }
});

test('chaque musicien joue au moins une fois dans la chanson', () => {
  for (const p of PRESETS) {
    const tr = tracksOf(p);
    const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr);
    for (const t of tr) assert.ok(s.scenes.some((sc) => plays(sc.data[t.id])), `${p.id} : ${t.id} ne joue jamais`);
  }
});

test('les accords joués sont complets et reconnus (renversements compris)', () => {
  for (const p of PRESETS) {
    const spec = SS.BandSongs[p.id];
    const tr = ['pad', 'keys', 'strings', 'guitar'].map((r) => ({ id: r, type: 'instrument', category: 'chord', band: { key: r } }));
    const s = SS.bandSong.build(spec, p.id, tr);
    s.scenes.forEach((sc) => {
      for (const t of tr)
        for (const e of sc.data[t.id].events) {
          if (e.notes.length < 2) continue;
          assert.ok(H.identify(e.notes), `${p.id} / ${sc.name} : accord non reconnu ${e.notes}`);
        }
    });
  }
});

test('une grille est fidèle : i VI III VII de Do♯ mineur → C♯m, A, E, B', () => {
  const key = { tonic: 'C♯', mode: 'minor' };
  const names = SS.bandSong.spansOf({ chords: 'i | VI | III | VII' }, key, 4).map((sp) => H.chordName(key, { ...sp.chord, bassPc: sp.chord.rootPc }));
  assert.deepEqual(names, ['C♯m', 'A', 'E', 'B']);
  const c = SS.bandSong.parseChord('V7', { tonic: 'A', mode: 'minor' });
  assert.deepEqual([c.rootPc, c.type], [4, '7']); // E7 : dominante majeure en mineur
});

test('EDM : la montée se coupe au dernier temps, le drop part sur une cymbale', () => {
  for (const p of PRESETS.filter((x) => x.style === 'edm')) {
    const spec = SS.BandSongs[p.id];
    const tr = tracksOf(p);
    const s = SS.bandSong.build(spec, p.id, tr);
    const build = s.scenes.find((sc) => /Montée/.test(sc.name));
    const drop = s.scenes.find((sc) => /Drop/.test(sc.name));
    if (!build || !drop) continue; // Innerbloom : deep house sans drop
    const cut = build.bars * 16 - 4;
    for (const t of tr) {
      const d = build.data[t.id];
      if (d.steps) assert.ok(d.steps.slice(cut).every((v) => !v), `${p.id} : ${t.id} sonne pendant le silence`);
      else assert.ok(d.events.every((e) => e.step + e.len <= cut), `${p.id} : ${t.id} déborde sur le silence`);
    }
    const crash = tr.find((t) => t.sound === 'cr');
    if (crash) assert.ok(drop.data[crash.id].steps[0] > 0, `${p.id} : cymbale au début du drop`);
    // la montée accélère : plus de coups de caisse claire / clap à la fin qu'au début
    const sn = tr.find((t) => t.sound === 'cp' || t.sound === 'sd');
    const hits = (from, to) => build.data[sn.id].steps.slice(from, to).filter(Boolean).length;
    assert.ok(hits(cut - 16, cut) > hits(0, 16), `${p.id} : la montée accélère`);
  }
});

test('mélodies : dans la tessiture et presque toutes dans la gamme', () => {
  for (const p of PRESETS) {
    const tr = [{ id: 'lead', type: 'instrument', category: 'mono', band: { key: 'lead' } }, { id: 'vox', type: 'instrument', category: 'mono', band: { key: 'vox' } }, { id: 'sax', type: 'instrument', category: 'mono', band: { key: 'sax' } }];
    const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr);
    let n = 0;
    let inScale = 0;
    s.scenes.forEach((sc) => {
      const pcs = new Set(H.scale(sc.key).map((d) => d.pc));
      tr.forEach((t) =>
        sc.data[t.id].events.forEach((e) => {
          n++;
          assert.ok(e.notes[0] >= 50 && e.notes[0] <= 90, `${p.id} : note hors tessiture ${e.notes[0]}`);
          if (pcs.has(((e.notes[0] % 12) + 12) % 12)) inScale++;
        })
      );
    });
    if (n) assert.ok(inScale / n > 0.85, `${p.id} : ${Math.round((100 * inScale) / n)} % des notes dans la gamme`);
  }
});

test('même inspiration, même chanson (déterministe) ; deux chansons différentes ne se ressemblent pas', () => {
  const p = PRESETS.find((x) => x.id === 'levels');
  const a = SS.bandSong.build(SS.BandSongs.levels, 'levels', tracksOf(p));
  const b = SS.bandSong.build(SS.BandSongs.levels, 'levels', tracksOf(p));
  const strip = (s) => JSON.stringify(s.scenes.map((sc) => sc.data));
  assert.equal(strip(a), strip(b));
  // grilles : pas toutes identiques d'une chanson à l'autre
  const grids = new Set(PRESETS.map((x) => Object.values(SS.BandSongs[x.id].sections).map((sec) => sec.chords).join(';')));
  assert.equal(grids.size, 20);
});
