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
