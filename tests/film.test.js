/*
 * Musique de film (js/film.js) : repères → tempo calé → plan de chanson ; modèle « La lumière revient ».
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'vsco.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'harmony.js', 'emotions.js', 'project.js', 'band-presets.js', 'band-songs.js', 'film.js', 'melody.js', 'bandsong.js', 'orchestra.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const F = SS.film;
const H = SS.harmony;

test('BPM = 60 × noires ÷ secondes ; temps lisibles', () => {
  assert.equal(F.tempoOf(12, 36), 80);
  assert.equal(Math.round(F.tempoOf(26, 43.3)), 144);
  assert.equal(F.fmt(42), '00:42');
  assert.equal(F.fmt(41.25), '00:41,3');
  assert.equal(F.fmt(83), '01:23');
});

test('chaque émotion d’un passage a sa couleur et mène à une émotion de l’application', () => {
  assert.equal(new Set(F.EMOS.map((e) => e.color)).size, F.EMOS.length, 'couleurs distinctes');
  for (const e of F.EMOS) assert.ok(SS.findEmotion(e.id), e.k + ' → ' + e.id);
  assert.equal(F.energyOf(1), 0.78);
  assert.equal(F.energyOf(5), 1);
  assert.equal(SS.orchestra.levelOf(F.energyOf(5)), 'full');
  assert.equal(SS.orchestra.levelOf(F.energyOf(1)), 'light');
});

test('« La lumière revient » : 80 BPM, synchro m. 13 pile à 00:42, 16 mesures, 48 s', () => {
  const tm = F.timing(F.LUMIERE);
  assert.equal(tm.bpm, 80);
  assert.equal(tm.bars, 16);
  assert.equal(tm.seconds, 48);
  assert.deepEqual(tm.sections.map((s) => [s.name, s.startBar + 1, s.bars]), [['Doute', 1, 4], ['Réplique', 5, 4], ['Espoir', 9, 4], ['La lumière', 13, 2], ['Apaisement', 15, 2]]);
  const sync = tm.marks.find((m) => m.sync);
  assert.equal(sync.bar + 1, 13);
  assert.equal(sync.land, 42);
  assert.ok(tm.options.some((o) => o.bars === 12 && o.bpm === 80 && Math.abs(o.drift) < 1e-9), 'option 12 mesures à 80 BPM, sans écart');
});

test('tempo calé : la synchro tombe au premier temps d’une mesure, à l’écart d’arrondi près', () => {
  const film = { start: 0, end: 60, cues: [{ t: 0, emo: 'suspense' }, { t: 16.7, emo: 'peur' }, { t: 43.3, emo: 'heroisme', sync: true }, { t: 53.3, emo: 'peur' }] };
  const tm = F.timing(film);
  assert.ok(tm.options.length >= 1 && tm.options.length <= 3);
  const o = tm.options.find((x) => x.bpm === tm.bpm);
  assert.ok(o, 'le tempo choisi est une des options');
  const sync = tm.marks.find((m) => m.sync);
  assert.equal(sync.bar, o.bars);
  assert.ok(Math.abs(sync.drift) < 0.3, `écart ${sync.drift}`);
  // tempo imposé : les repères suivent, la synchro peut s'écarter
  const t2 = F.timing({ ...film, bpm: 100 });
  assert.equal(t2.bpm, 100);
  // les passages ne se chevauchent jamais, même très rapprochés
  const t3 = F.timing({ start: 0, end: 10, cues: [{ t: 0 }, { t: 0.2 }, { t: 0.4 }] });
  assert.deepEqual(t3.sections.map((s) => s.bars >= 1), [true, true, true]);
});

test('le plan du modèle : grille exacte, thème imposé, énergie et émotion par passage', () => {
  const sp = SS.BandSongs.lumiere;
  assert.equal(sp.key, 'D minor');
  assert.equal(sp.form, 'p1 p2 p3 p4 p5');
  const key = { tonic: 'D', mode: 'minor' };
  const names = (id) => sp.sections[id].grid.map((c) => H.gridChord(key, c.degree, c.type, c.acc, c.bass || 0).name).join(' ');
  assert.equal(names('p1'), 'Dm(add9) B♭maj7 F/A Csus2');
  assert.equal(names('p3'), 'Dm(add9) B♭maj7 F/A Csus4 C');
  assert.equal(names('p4'), 'Fadd9 C/E');
  assert.equal(sp.sections.p4.energy, 1);
  assert.equal(sp.sections.p4.emotion, 'emerveillement');
  // le sommet La5 (midi 81) au 4e temps de la mesure 13, première mesure de la scène « La lumière »
  assert.ok(sp.sections.p4.theme.some((e) => e.notes[0] === 81 && e.step === 12));
  const n = Object.values(sp.sections).reduce((a, s) => a + s.theme.length, 0);
  assert.equal(n, F.LUMIERE.theme.length, 'toutes les notes du thème');
});

test('le thème du modèle est joué tel quel par le piano', () => {
  const p = SS.Band.STYLES.find((s) => s.id === 'film').presets.find((x) => x.id === 'lumiere');
  const tracks = [{ id: 'lead', type: 'instrument', category: 'mono', band: { key: 'lead' } }];
  const s = SS.bandSong.build(SS.BandSongs.lumiere, p.id, tracks);
  assert.equal(s.scenes.length, 5);
  const evs = s.scenes.flatMap((sc) => sc.data.lead.events);
  assert.equal(evs.length, F.LUMIERE.theme.length);
  assert.deepEqual(s.scenes[3].data.lead.events.map((e) => e.notes[0]), [77, 79, 81, 79, 76]);
});

test('scène libre : un passage par repère, accords de l’émotion, tonalité valide', () => {
  const film = F.blankScene();
  const sp = F.spec(film);
  const ids = sp.form.split(' ');
  assert.equal(ids.length, film.cues.length);
  ids.forEach((id) => {
    const sec = sp.sections[id];
    assert.ok(sec.bars >= 1 && sec.grid.length >= 1, id);
    const [tonic, mode] = (sec.key || sp.key).split(' ');
    assert.ok(H.valid({ tonic, mode }), id + ' tonalité');
  });
  const s = SS.bandSong.build(sp, 'scene', [{ id: 'lead', type: 'instrument', category: 'mono', band: { key: 'lead' } }]);
  assert.equal(s.scenes.length, film.cues.length);
  // l'émotion « espoir » n'a pas de proposition en mineur seulement : passage en relative si besoin, jamais d'erreur
  const g = F.gridFor('espoir', { tonic: 'D', mode: 'minor' }, 4);
  assert.equal(g.grid.length, 4);
});

test('motif : contour, intervalle-clé, rythme, 3 à 5 notes, 3 propositions dans la gamme', () => {
  const key = { tonic: 'D', mode: 'minor' };
  const inKey = (m) => F.scaleOf(key).pcs.includes(((m % 12) + 12) % 12);
  const p = F.motifFor('nostalgie');
  const [a, b, c] = F.proposals(p, key);
  assert.deepEqual(a.map((n) => n.m), [69, 65, 64], 'La–Fa–Mi : descendant, tierce, ♩ ♩ 𝅗𝅥');
  assert.deepEqual(a.map((n) => n.d), [1, 1, 2]);
  assert.notDeepEqual(a.map((n) => n.m), b.map((n) => n.m));
  assert.notDeepEqual(a.map((n) => n.m), c.map((n) => n.m));
  for (const cont of Object.keys(F.CONT))
    for (const intv of Object.keys(F.INTV))
      for (const rhy of Object.keys(F.RHY))
        for (const n of [3, 4, 5]) {
          const M = F.genMotif({ cont, intv, rhy, n }, key);
          assert.equal(M.length, n);
          assert.ok(Math.abs(M.reduce((x, y) => x + y.d, 0) - 4) < 1e-9, 'une mesure');
          assert.ok(M.every((x, i) => (intv === 'ht' && i === 1) || inKey(x.m)), `${cont}/${intv} dans la gamme`);
        }
  const asc = F.genMotif({ cont: 'asc', intv: 's4', rhy: 'pt', n: 4 }, key);
  assert.ok(asc.every((x, i) => !i || x.m > asc[i - 1].m), 'ascendant');
});

test('transformations : renversement, rétrograde, augmentation, diminution, mode, séquence, fragmentation', () => {
  const key = { tonic: 'D', mode: 'minor' };
  const M = F.genMotif(F.motifFor('nostalgie'), key);
  const T = (id) => F.TRANSFORMS[id].f(M, key);
  assert.equal(Object.keys(F.TRANSFORMS).length, 8);
  assert.deepEqual(T('inv').map((n) => n.m), [69, 72, 74], 'La–Do–Ré : la chute devient un élan');
  assert.deepEqual(T('ret').map((n) => n.m), [64, 65, 69]);
  assert.deepEqual(T('aug').map((n) => n.d), [2, 2, 4]);
  assert.equal(T('dim').length, 6);
  assert.deepEqual(T('mode').map((n) => n.m), [69, 66, 64], 'Fa♯ : Ré majeur');
  assert.equal(T('seq').length, 9);
  assert.ok(T('frag').length >= 6);
});

test('phrase et leitmotiv : chaque passage reçoit le thème traité selon son émotion, posé sur ses accords', () => {
  const film = { ...F.blankScene(), motif: F.motifFor('suspense') };
  const sp = F.spec(film);
  const tm = F.timing(film);
  tm.sections.forEach((s) => {
    const sec = sp.sections[s.id];
    assert.ok(sec.theme && sec.theme.length, s.id + ' a son thème');
    assert.ok(sec.theme.every((e) => e.step >= 0 && e.step + e.len <= s.bars * 16), s.id + ' dans la scène');
    assert.ok(sec.theme.every((e) => e.notes[0] >= 48 && e.notes[0] <= 90), s.id + ' tessiture du piano');
    // la dernière note se pose sur l'accord du moment
    const last = sec.theme[sec.theme.length - 1];
    const pcs = F.chordAt(sec.grid, F.parseKey(sec.key || sp.key), Math.floor(last.step / 16));
    assert.ok(pcs.includes(last.notes[0] % 12), s.id + ' fin sur l’accord');
  });
  assert.equal(F.treatOf(film, tm.sections[0]), 'frag', 'suspense : fragmenté');
  assert.equal(F.treatOf(film, tm.sections[2]), 'mode', 'héroïsme : mode opposé');
  // choix de l'utilisateur, et silence
  const f2 = { ...film, leit: { p1: 'tacet', p2: 'enonce' } };
  const sp2 = F.spec(f2);
  assert.ok(!sp2.sections.p1.theme.length && !sp2.sections.p1.lead, 'le thème se tait');
  const ph = F.phrase(F.motifOf(film), 'qr', F.parseKey(film.key), () => null, 8);
  assert.equal(Math.ceil(Math.max(...ph.map((n) => n.t + n.d)) / 4), 8, 'phrase de 8 mesures');
  // le thème est joué tel quel par le piano
  const s = SS.bandSong.build(sp, 'scene', [{ id: 'lead', type: 'instrument', category: 'mono', band: { key: 'lead' } }]);
  assert.deepEqual(s.scenes[0].data.lead.events.map((e) => e.notes[0]), sp.sections.p1.theme.map((e) => e.notes[0]));
});

test('orchestre étendu : effectifs de film, cuivres réservés au sommet, harpe en arpèges, tuba à la basse', () => {
  const O = SS.orchestra;
  for (const id of ['intime', 'romantique', 'epique', 'mystere']) {
    assert.ok(O.ENS[id] && O.ENS[id].film, id);
    O.ENS[id].parts.forEach((p) => assert.ok(O.PART[p] && SS.locateInstrument(null, O.PART[p].tok).inst.id === O.PART[p].tok, `${id} : ${p} (${O.PART[p] && O.PART[p].tok})`));
  }
  const spans = [{ step: 0, len: 16, pcs: [2, 5, 9], bassPc: 2 }, { step: 16, len: 16, pcs: [10, 2, 5], bassPc: 10 }];
  const melody = [{ step: 0, len: 4, midi: 69 }, { step: 4, len: 4, midi: 65 }, { step: 8, len: 8, midi: 64 }, { step: 16, len: 16, midi: 65 }];
  const ep = (level) => O.orchestrate({ parts: O.ENS.epique.parts, spans, melody, level }).lines;
  ['tp', 'tb', 'tu', 'pic'].forEach((p) => assert.equal(ep('mid')[p].role, 'tacet', p + ' se tait hors du sommet'));
  const full = ep('full');
  assert.equal(full.tp.role, 'melody', 'trompettes sur le thème');
  assert.ok(full.pic.lo > full.vl1.lo, 'piccolo au-dessus des violons');
  assert.equal(full.tu.role, 'bass');
  assert.ok(full.tu.lo <= full.cb.lo, 'tuba au grave');
  const it = O.orchestrate({ parts: O.ENS.intime.parts, spans, melody, level: 'mid' }).lines;
  assert.equal(it.vs.role, 'melody', 'violon solo sur le thème');
  assert.equal(it.hp.role, 'arp');
  assert.equal(it.hp.events.length, 16, 'harpe en croches');
  assert.ok(it.hp.events.every((e) => [2, 5, 9, 10].includes(e.notes[0] % 12)), 'harpe dans les accords');
});

test('percussions d’orchestre sur les repères : impact à la synchro, roulement avant, battement de cœur', () => {
  const sp = SS.BandSongs.lumiere;
  assert.deepEqual(sp.sections.p3.hits.mt, [[48, 0.75]], 'roulement de timbale dans la mesure avant la lumière');
  const h4 = sp.sections.p4.hits;
  assert.ok(h4.bd.some(([s]) => s === 0) && h4.cr.some(([s]) => s === 0) && h4.lt.some(([s]) => s === 0), 'impact à la synchro');
  assert.ok(!sp.sections.p1.hits.bd.length && !sp.sections.p1.hits.lt.length, 'rien dans le doute');
  const film = { start: 0, end: 20, cues: [{ t: 0, emo: 'peur', ten: 5, ene: 2 }, { t: 10, emo: 'heroisme', ten: 2, ene: 5, sync: true }] };
  const tm = F.timing(film);
  const h0 = F.percHits(tm, 0);
  assert.ok(h0.lt.some(([s]) => s % 16 === 3), 'battement de cœur');
  // le kit et la construction : les pistes de percussion jouent exactement les frappes
  const B = SS.Band;
  assert.equal(B.KITS.orchperc.source, 'vcsl');
  assert.equal(B.pieceOpts('orchperc', 'lt').label, 'Timbale');
  const tracks = ['lt', 'mt', 'bd', 'cr', 'misc'].map((pc) => ({ id: 'perc:' + pc, type: 'drum', sound: pc, band: { key: 'perc:' + pc } }));
  const s = SS.bandSong.build(sp, 'lumiere', tracks);
  const sync = s.scenes.find((x) => x.sec === 'p4');
  assert.ok(sync.data['perc:bd'].steps[0] > 0 && sync.data['perc:bd'].steps.slice(1).every((v) => !v), 'une seule grosse caisse, sur la synchro');
  const film2 = SS.Band.STYLES.find((x) => x.id === 'film');
  assert.ok(film2.presets.every((p) => p.musicians.some((m) => m.role === 'perc' && m.kits[0] === 'orchperc' && !m.optional)));
});

test('modèle « La poursuite » : 36 mesures à 144 BPM, saut à 00:43,3, ostinato 3+3+2, accents et vide avant le saut', () => {
  const P = F.POURSUITE;
  const tm = F.timing(P);
  assert.equal(tm.bpm, 144);
  assert.equal(tm.bars, 36);
  assert.deepEqual(tm.sections.map((s) => s.startBar), [0, 2, 10, 18, 22, 26, 32]);
  assert.equal(F.fmt(tm.sections[5].cue.land), '00:43,3', 'le saut tombe à 00:43,3');
  const sp = SS.BandSongs.poursuite;
  assert.ok(sp, 'plan enregistré');
  const S = sp.sections;
  assert.ok(S.p2.motor && S.p3.motor && S.p5.motor && !S.p1.motor && !S.p4.motor, 'moteur dans l’action, pas dans l’alarme ni la cachette');
  assert.ok(S.p3.stabs && S.p5.stabs && !S.p2.stabs, 'accents des cuivres dès l’énergie 4');
  assert.ok(S.p5.gap && !S.p3.gap, 'un temps de silence avant le saut');
  assert.equal(S.p6.theme[0].notes[0], 62, 'thème héroïque au saut');
  assert.ok(S.p5.theme.some((e) => e.notes[0] === 65 && e.step >= 48), 'la séquence monte d’un demi-ton par mesure');
  assert.equal(S.p5.grid[1].acc, -1, 'Mi♭m dans la séquence');
  assert.ok(S.p7.hits.bd.some(([s]) => s === 6) && S.p7.hits.bd.some(([s]) => s === 12), 'coups 3+3+2 de la fuite');
  assert.ok(S.p5.hits.sd.length > 20, 'roulement de caisse claire vers le saut');
  // l'orchestre : ostinato de croches à la basse, accents des trombones sur les croches 1, 4 et 7
  const O = SS.orchestra;
  const spans = [{ step: 0, len: 16, pcs: [2, 5, 9], bassPc: 2 }];
  const L = O.orchestrate({ parts: O.ENS.epique.parts, spans, melody: [{ step: 0, len: 4, midi: 62 }], level: 'mid', motor: true, stabs: true }).lines;
  assert.equal(L.cb.role, 'motor');
  assert.equal(L.cb.events.length, 8, 'huit croches par mesure');
  const acc = L.cb.events.filter((e) => e.vel > 0.7).map((e) => e.step);
  assert.deepEqual(acc, [0, 6, 12], 'accents 3+3+2');
  assert.deepEqual(L.tb.events.map((e) => e.step), [0, 6, 12]);
  assert.equal(L.tb.role, 'stabs');
  // le modèle est une inspiration du style, avec caisse claire et cymbales frappées
  const st = SS.Band.STYLES.find((x) => x.id === 'film');
  const pr = st.presets.find((p) => p.id === 'poursuite');
  assert.ok(pr && pr.musicians.find((m) => m.role === 'perc').pieces.includes('sd'));
  assert.equal(SS.Band.pieceOpts('orchperc', 'ht').label, 'Cymbales frappées');
  assert.ok(F.TEMPLATES.poursuite === P && F.TEMPLATES.lumiere === F.LUMIERE);
});

test('mix à l’image : sous les mots, stems par famille', () => {
  const film = { start: 0, end: 30, cues: [{ t: 0, emo: 'heroisme', ten: 2, ene: 5 }, { t: 15, emo: 'heroisme', ten: 2, ene: 5, dlg: true }] };
  const sp = F.spec(film);
  const [a, b] = [sp.sections.p1, sp.sections.p2];
  assert.ok(b.dialog && !a.dialog);
  assert.ok(b.energy < a.energy, 'un cran d’énergie en moins sous le dialogue');
  assert.equal(b.keys, 'sustain', 'le piano tient ses accords');
  assert.ok(Object.values(b.hits).every((l) => !l.length), 'pas de percussions sous les mots');
  const O = SS.orchestra;
  const spans = [{ step: 0, len: 16, pcs: [2, 5, 9], bassPc: 2 }];
  const args = { parts: O.ENS.intime.parts, spans, melody: [{ step: 0, len: 4, midi: 69 }], level: 'mid' };
  const free = O.orchestrate(args).lines;
  const under = O.orchestrate({ ...args, under: true }).lines;
  assert.equal(free.hp.role, 'arp');
  assert.equal(under.hp.role, 'tacet');
  assert.equal(under.hp.events.length, 0);
  assert.ok(under.vc.events[0].vel < free.vc.events[0].vel, 'l’orchestre joue plus doucement');
  // stems par famille : cordes (avec la harpe), bois, cuivres, thème, percussions
  require('../js/render.js');
  const T = (id, key) => ({ id, name: id, type: 'instrument', volume: 0.8, band: { key } });
  const p = SS.createProject ? SS.createProject() : { tracks: [], scenes: [] };
  p.tracks = [T('a', 'lead'), T('b', 'orch:vl1'), T('c', 'orch:hp'), T('d', 'orch:fl'), T('e', 'orch:tp'), T('f', 'orch:tb'), { ...T('g', 'perc:bd'), type: 'drum' }];
  const g = SS.render.stemGroups(p, 'family');
  assert.deepEqual(g.map((x) => x.name), ['Thème', 'Cordes', 'Bois', 'Cuivres', 'Percussions']);
  assert.deepEqual(g.find((x) => x.name === 'Cordes').tracks, ['b', 'c']);
  assert.deepEqual(g.find((x) => x.name === 'Cuivres').tracks, ['e', 'f']);
});

test('modèle « Les grands espaces » : 55 mesures à 80 BPM, grille et effectif dans l’esprit d’Out of Africa, sans timbales', () => {
  const E = F.ESPACES;
  const tm = F.timing(E);
  assert.equal(tm.bpm, 80);
  assert.equal(tm.bars, 55);
  assert.deepEqual(tm.sections.map((s) => s.startBar + 1), [1, 9, 17, 21, 29, 37, 45, 51]);
  const S = SS.BandSongs.espaces.sections;
  assert.deepEqual(S.p1.grid.map((g) => [g.degree, g.type]), [[2, '5'], [5, 'madd9'], [2, '5'], [5, 'madd9']], 'pédales de mi et de la');
  assert.deepEqual(S.p4.grid.map((g) => g.type), ['maj', 'min', 'min', 'maj', 'min', 'min', '7'], 'C Em Am F Dm Fm G7');
  assert.equal(S.p4.grid[6].len, 32, 'deux mesures de dominante');
  assert.equal(S.p5.grid[6].degree, 0, 'la reprise résout fa mineur directement sur do');
  assert.ok(Object.values(S).every((s) => !s.hits.lt.length && !s.hits.mt.length), 'pas de timbales');
  assert.ok(S.p2.hits.bd.some(([st]) => st === 64) && S.p2.hits.misc.some(([st]) => st === 64), 'tam-tam et grosse caisse sur l’élargissement');
  // le geste du thème : une note longue qui passe la barre
  const crosses = S.p4.theme.filter((e) => Math.floor(e.step / 16) !== Math.floor((e.step + e.len - 1) / 16));
  assert.ok(crosses.length >= 3, 'notes liées par-dessus la barre');
  const pr = SS.Band.STYLES.find((x) => x.id === 'film').presets.find((p) => p.id === 'espaces');
  assert.ok(pr.musicians.some((m) => m.role === 'strings') && pr.musicians.find((m) => m.role === 'perc').pieces.join() === 'bd,misc');
});

test('harmonie de film : une technique par passage, choisie d’après l’émotion, dans la tonalité de la scène', () => {
  const H = SS.harmony;
  const key = { tonic: 'D', mode: 'minor' };
  const names = (g) => g.map((c) => H.gridChord(key, c.degree, c.type, c.acc || 0, c.bass || 0).name);
  assert.deepEqual(names(F.techGrid('chrom', 'minor', 4)), ['Dm', 'E♭m', 'Em', 'Fm']);
  assert.deepEqual(names(F.techGrid('pedal', 'minor', 4)), ['Dm', 'B♭/D', 'Gm/D', 'E♭/D']);
  assert.deepEqual(names(F.techGrid('hero', 'minor', 4)), ['B♭', 'C', 'D', 'D'], 'le sommet reste sur la tonique majeure');
  assert.deepEqual(names(F.techGrid('open', 'minor', 3)), ['Dm(add9)', 'B♭maj7', 'D5'], 'la fin ouverte finit en quinte à vide');
  assert.equal(F.techGrid('susp', 'minor', 2).length, 4, 'suspension puis résolution dans chaque mesure');
  assert.equal(F.techGrid('song', 'minor', 4), null);
  const g8 = F.techGrid('mediant', 'minor', 8);
  assert.ok(g8.every((c) => c.len === 32), 'deux mesures par accord dans un long passage');
  // choix automatique dans la scène libre de départ
  const film = F.blankScene();
  const tm = F.timing(film);
  assert.deepEqual(tm.sections.map((s, i) => F.harmOf(s, i === tm.sections.length - 1)), ['pedal', 'chrom', 'hero', 'open']);
  const sp = F.spec(film);
  assert.deepEqual(names(sp.sections.p2.grid).slice(0, 4), ['Dm', 'E♭m', 'Em', 'Fm']);
  // un choix à la main l'emporte ; « comme une chanson » revient aux propositions de l'émotion
  film.cues[1].harm = 'mediant';
  assert.deepEqual(names(F.spec(film).sections.p2.grid).slice(0, 4), ['Dm', 'Fm', 'Dm', 'B♭m']);
  film.cues[1].harm = 'song';
  assert.deepEqual(F.spec(film).sections.p2.grid, F.gridFor('angoisse', key, tm.sections[1].bars).grid);
  // les modèles gardent leurs accords écrits
  assert.equal(SS.BandSongs.lumiere.sections.p1.grid[0].type, 'madd9');
  // tonalité majeure
  const kM = { tonic: 'C', mode: 'major' };
  assert.deepEqual(F.techGrid('hero', 'major', 3).map((c) => H.gridChord(kM, c.degree, c.type, c.acc || 0).name), ['A♭', 'B♭', 'C']);
});

test('harmonie de film : un passage court garde la fin de la formule', () => {
  const key = { tonic: 'D', mode: 'minor' };
  const names = (g) => g.map((c) => SS.harmony.gridChord(key, c.degree, c.type, c.acc || 0, c.bass || 0).name);
  assert.deepEqual(names(F.techGrid('hero', 'minor', 1)), ['D']);
  assert.deepEqual(names(F.techGrid('hero', 'minor', 2)), ['C', 'D']);
});

test('nuances : une nuance par passage, arcs de phrase, crescendo et cymbale vers la synchro', () => {
  const sp = SS.BandSongs.lumiere;
  const S = sp.sections;
  assert.equal(S.p1.dyn, 'pp');
  assert.equal(S.p4.dyn, 'ff');
  assert.ok(S.p1.orchVel < S.p4.orchVel);
  // arc : dans une phrase, la note la plus haute est la plus forte
  const ph = S.p4.theme.filter((e) => e.step < 32);
  const top = ph.reduce((a, e) => (e.notes[0] > a.notes[0] ? e : a));
  assert.equal(Math.max(...ph.map((e) => e.vel)), top.vel);
  assert.ok(Math.min(...S.p1.theme.map((e) => e.vel)) < Math.max(...S.p4.theme.map((e) => e.vel)), 'pp plus doux que ff');
  // crescendo sur les deux mesures avant la synchro, respiration après
  assert.deepEqual(S.p3.ramps, [{ a: 32, b: 64, from: 0.85, to: 1.2 }]);
  assert.ok(S.p4.ramps && S.p4.ramps[0].to < 1);
  // cymbale en crescendo de 4 s : à 80 BPM, 21 doubles croches avant la synchro
  assert.deepEqual(S.p3.hits.oh, [[64 - 21, 0.8]]);
  assert.equal(SS.Band.pieceOpts('orchperc', 'oh').label, 'Cymbale (crescendo)');
  // la construction applique la rampe : les dernières notes du passage d'avant la synchro sont plus fortes
  const O = SS.orchestra;
  const tracks = [{ id: 'lead', type: 'instrument', band: { key: 'lead' } }];
  const s = SS.bandSong.build(sp, 'lumiere', tracks);
  const flat = JSON.parse(JSON.stringify(sp));
  delete flat.sections.p3.ramps;
  const f = SS.bandSong.build(flat, 'lumiere', [{ id: 'lead', type: 'instrument', band: { key: 'lead' } }]);
  const ev = s.scenes.find((x) => x.sec === 'p3').data.lead.events;
  const evf = f.scenes.find((x) => x.sec === 'p3').data.lead.events;
  const k = ev.findIndex((e) => e.step >= 56);
  assert.ok(k >= 0 && ev[k].vel > evf[k].vel, 'crescendo appliqué au thème');
});
