/*
 * Band, « Créer toute la chanson » (js/band-songs.js, js/bandsong.js) : les 30 plans de chanson.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
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
  assert.equal(PRESETS.length, 30);
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
  assert.equal(grids.size, 30);
});

/* ---------- Tonalité : toutes les pistes instrumentales sont dans la bonne tonalité ---------- */
const pcOf = (n) => ((n % 12) + 12) % 12;
const MELODIC = ['bass', 'pad', 'arp', 'lead', 'keys', 'guitar', 'strings', 'sax', 'vox'];
/** Toutes les notes de toutes les pistes, avec l'accord qui sonne à ce moment. */
function eachNote(p, fn) {
  const spec = SS.BandSongs[p.id];
  const tr = MELODIC.map((r) => ({ id: r, type: 'instrument', category: 'mono', band: { key: r } }));
  const s = SS.bandSong.build(spec, p.id, tr);
  const order = [...new Set(spec.form.split(/\s+/).map((x) => x.split('*')[0]))];
  s.scenes.forEach((sc, i) => {
    const spans = SS.bandSong.spansOf(spec.sections[order[i]], sc.key, sc.bars);
    const keyPcs = H.scale(sc.key).map((d) => d.pc);
    tr.forEach((t) =>
      sc.data[t.id].events.forEach((e) => {
        const sp = spans.find((x) => e.step >= x.step && e.step < x.step + x.len);
        const ct = SS.chordNotes(60 + sp.chord.rootPc, sp.chord.type).map(pcOf);
        e.notes.forEach((n) => fn({ role: t.id, note: n, e, ct, keyPcs, sc }));
      })
    );
  });
}

test('tonalité : chaque note est dans la tonalité ou dans l\'accord du moment (emprunts compris), aucune note étrangère', () => {
  for (const p of PRESETS)
    eachNote(p, ({ role, note, ct, keyPcs, sc }) =>
      assert.ok(keyPcs.includes(pcOf(note)) || ct.includes(pcOf(note)), `${p.id} / ${sc.name} / ${role} : ${note} hors tonalité et hors accord`)
    );
});

test('tonalité : les mélodies ne frottent jamais (demi-ton) contre une note de l\'accord', () => {
  for (const p of PRESETS)
    eachNote(p, ({ role, note, ct, sc, e }) => {
      if (!['lead', 'vox', 'sax'].includes(role) || ct.includes(pcOf(note))) return;
      const clash = ct.some((c) => pcOf(note - c) === 1 || pcOf(c - note) === 1);
      assert.ok(!clash, `${p.id} / ${sc.name} / ${role} : ${note} à un demi-ton de l'accord (pas ${e.step})`);
    });
});

test('tonalité : les chiffres romains se lisent sur le majeur ou le mineur naturel, même dans un mode', () => {
  const dor = { tonic: 'C', mode: 'dorian' };
  assert.equal(SS.bandSong.parseChord('VI', dor).rootPc, 8); // La♭, pas La
  assert.equal(SS.bandSong.parseChord('IV', dor).type, 'maj'); // Fa majeur : la couleur dorienne
  assert.equal(SS.bandSong.parseChord('bVII', { tonic: 'A', mode: 'major' }).rootPc, 7); // Sol
});

test('accordage : les échantillons Dirt proposés par Band ont une hauteur mesurée', () => {
  const ids = new Set(SS.Band.STYLES.flatMap((st) => st.presets.flatMap((p) => p.musicians.flatMap((m) => m.pick || []))));
  const dirt = SS.FAMILIES.flatMap((f) => f.instruments).filter((i) => i.kind === 'dirt' && ids.has(i.id));
  assert.ok(dirt.length > 0);
  for (const inst of dirt) assert.ok(SS.DIRT_TUNING[inst.files[0]] != null, `${inst.id} : hauteur inconnue (${inst.files[0]})`);
  assert.ok(Math.abs(SS.dirtRoot('arpy/arpy01.wav') - 60) < 0.1); // arpy : Do4, et non Do2
  assert.ok(Math.abs(SS.dirtRoot('jvbass/000_01.wav') - 30) < 0.1); // jvbass : Fa♯1
  assert.equal(SS.dirtRoot('inconnu.wav'), SS.DIRT_ROOT);
});

/* ---------- Nuances : vélocités vivantes ---------- */
test('nuances : refrain / drop plus forts que l\'intro, accents et ghost notes', () => {
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const p of PRESETS) {
    const tr = tracksOf(p);
    const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr);
    const vels = (sc) => tr.flatMap((t) => (sc.data[t.id].steps ? sc.data[t.id].steps.filter((v) => v > 0) : sc.data[t.id].events.map((e) => e.vel)));
    const intro = s.scenes.find((sc) => sc.name === 'Intro');
    const peak = s.scenes.find((sc) => ['Refrain', 'Drop', 'Sommet'].includes(sc.name));
    assert.ok(avg(vels(peak)) > avg(vels(intro)) + 0.02, `${p.id} : le ${peak.name} n'est pas plus fort que l'intro`);
    // une partie n'est jamais jouée à vélocité constante : au moins 6 niveaux différents
    for (const t of tr) {
      const all = s.scenes.flatMap((sc) => (sc.data[t.id].steps ? sc.data[t.id].steps.filter((v) => v > 0) : sc.data[t.id].events.map((e) => e.vel)));
      if (all.length > 30) assert.ok(new Set(all).size >= 6, `${p.id} : ${t.id} trop mécanique (${new Set(all).size} vélocités)`);
    }
    const sd = tr.find((t) => t.sound === 'sd');
    if (sd) assert.ok(s.scenes.some((sc) => sc.data[sd.id].steps.some((v) => v > 0 && v < 0.35)), `${p.id} : pas de ghost note de caisse claire`);
  }
});

/* ---------- Techno mélodique : intro planante, montées, drops ---------- */
test('techno mélodique : intro planante (filtre qui s\'ouvre, pas de batterie, une mélodie), montée au passe-haut et drop puissant', () => {
  const list = PRESETS.filter((x) => x.style === 'techno');
  assert.equal(list.length, 10);
  for (const p of list) {
    const spec = SS.BandSongs[p.id];
    assert.ok(spec.tech, `${p.id} : plan techno`);
    const tr = tracksOf(p);
    const s = SS.bandSong.build(spec, p.id, tr);
    const intro = s.scenes.find((sc) => sc.name === 'Intro');
    const builds = s.scenes.filter((sc) => /Montée/.test(sc.name));
    const drops = s.scenes.filter((sc) => /Drop/.test(sc.name));
    assert.ok(builds.length && drops.length, `${p.id} : montée et drop`);
    // intro : pas de batterie, une nappe dont le passe-bas s'ouvre, au moins une partie mélodique
    for (const t of tr.filter((x) => x.type === 'drum')) assert.ok(!plays(intro.data[t.id]), `${p.id} : ${t.id} joue dans l'intro`);
    const pad = intro.data.pad;
    assert.ok(pad && pad.auto && pad.auto.filter, `${p.id} : la nappe de l'intro n'a pas d'automation de filtre`);
    const pts = Object.entries(pad.auto.filter).sort((a, b) => a[0] - b[0]);
    assert.ok(pts[0][1] < -0.5 && pts[pts.length - 1][1] > pts[0][1] + 0.4, `${p.id} : le filtre de l'intro doit s'ouvrir`);
    assert.ok(['lead', 'vox', 'keys', 'guitar'].some((r) => intro.data[r] && intro.data[r].events.length), `${p.id} : intro sans mélodie`);
    // montée : passe-haut qui grimpe sur la nappe, bruit blanc dont le filtre s'ouvre, roulement en ratchets
    for (const b of builds) {
      const hp = ['pad', 'keys', 'strings', 'arp', 'lead'].filter((r) => b.data[r] && b.data[r].events.length && b.data[r].auto && b.data[r].auto.filter);
      assert.ok(hp.length && hp.every((r) => Math.max(...Object.values(b.data[r].auto.filter)) > 0.4), `${p.id} : pas de passe-haut dans la montée`);
      assert.ok(b.data.fx.events.length && b.data.fx.auto.filter, `${p.id} : pas de montée de bruit`);
      const sn = tr.find((t) => t.sound === 'cp' || t.sound === 'sd');
      assert.ok(b.data[sn.id].rat && Object.values(b.data[sn.id].rat).some((r) => r >= 3), `${p.id} : roulement sans ratchet`);
    }
    // drop : impact, cymbale et kick sur le premier temps, basse sidechainée qui joue, filtres rouverts
    for (const d of drops) {
      assert.ok(d.data.fx.events.some((e) => e.step === 0), `${p.id} : pas d'impact au début du drop`);
      const kick = tr.find((t) => t.sound === 'bd');
      assert.ok(d.data[kick.id].steps[0] > 0.8, `${p.id} : kick faible au début du drop`);
      const crash = tr.find((t) => t.sound === 'cr');
      if (crash) assert.ok(d.data[crash.id].steps[0] > 0, `${p.id} : pas de cymbale au drop`);
      assert.ok(d.data.bass.events.length >= d.bars * 4, `${p.id} : basse trop clairsemée au drop`);
      if (d.data.pad.auto) assert.ok(!d.data.pad.auto.filter || Math.min(...Object.values(d.data.pad.auto.filter)) >= -0.4, `${p.id} : nappe filtrée au drop`);
    }
  }
});

test('techno mélodique : conditions de déclenchement et trilles sur la batterie, valeurs valides', () => {
  const ids = new Set(SS.TRIG_CONDS.map((c) => c.id));
  for (const p of PRESETS.filter((x) => x.style === 'techno')) {
    const tr = tracksOf(p);
    const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr);
    let conds = 0;
    s.scenes.forEach((sc) =>
      tr.filter((t) => t.type === 'drum').forEach((t) => {
        const d = sc.data[t.id];
        for (const [k, c] of Object.entries(d.cond || {})) {
          conds++;
          assert.ok(ids.has(c), `${p.id} : condition inconnue ${c}`);
          assert.ok(d.steps[+k] > 0, `${p.id} : condition sur un pas éteint`);
        }
        for (const [k, r] of Object.entries(d.rat || {})) assert.ok(r >= 2 && r <= SS.RATCHET_MAX && d.steps[+k] > 0, `${p.id} : ratchet invalide`);
      })
    );
    assert.ok(conds > 20, `${p.id} : la batterie ne varie pas d'un passage à l'autre`);
  }
});

test('techno mélodique : automation valide (bornes, pas dans la scène) et absente des autres styles', () => {
  for (const p of PRESETS) {
    const tr = tracksOf(p);
    const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr);
    s.scenes.forEach((sc) =>
      tr.forEach((t) => {
        const a = sc.data[t.id].auto;
        if (!a) return;
        assert.equal(p.style, 'techno', `${p.id} : automation hors techno`);
        for (const [id, lane] of Object.entries(a)) {
          const P = SS.autoParam(id);
          assert.ok(P, `${p.id} : réglage inconnu ${id}`);
          for (const [k, v] of Object.entries(lane)) {
            assert.ok(+k >= 0 && +k < sc.bars * 16, `${p.id} / ${sc.name} : point hors de la scène`);
            assert.ok(v >= P.min && v <= P.max, `${p.id} / ${sc.name} : ${id} = ${v}`);
          }
        }
        // copie fidèle par SS.cleanAuto (format du projet)
        const copy = { auto: JSON.parse(JSON.stringify(a)) };
        SS.cleanAuto(copy, sc.bars * 16);
        assert.deepEqual(copy.auto, a, `${p.id} / ${sc.name} / ${t.id} : automation modifiée au nettoyage`);
      })
    );
  }
});
