/*
 * Textes des propositions d'émotions (js/emotions.js) : les noms de notes suivent la transposition.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/sounds.js');
require('../js/harmony.js');
require('../js/emotions.js');
const H = globalThis.SS.harmony;

const fill = (pr, tonic) => {
  const k = { tonic, mode: pr.mode };
  const chords = pr.seq.map(([d, t, a]) => H.makeChord(k, d, t, a || 0));
  return [pr.why, pr.caveat].map((x) => SS.fillEmotionText(x, chords, tonic, H.french));
};
const find = (emo, kind) => SS.findEmotion(emo).proposals.find((p) => p.kind === kind);

test('dans la tonalité d’origine, les textes nomment les bonnes notes', () => {
  assert.match(fill(find('nostalgie', 'evidence'), 'A')[0], /: Fmaj7 garde A–C–E de l’accord/);
  assert.match(fill(find('melancolie', 'evidence'), 'D')[0], /^Dm7 → G : le Si de G est la sixte majeure/);
  assert.match(fill(find('espoir', 'surprise'), 'A')[0], /sur un La MAJEUR \(Do♯\)/);
  assert.match(fill(find('mystere', 'surprise'), 'E')[0], /^Esus4 → Fmaj7 : la seconde mineure du phrygien \(Mi → Fa\)/);
});

test('transposés, les textes suivent les accords', () => {
  assert.match(fill(find('nostalgie', 'evidence'), 'D')[0], /: B♭maj7 garde D–F–A de l’accord/);
  assert.match(fill(find('espoir', 'surprise'), 'D')[0], /sur un Ré MAJEUR \(Fa♯\)/);
  assert.match(fill(find('angoisse', 'evidence'), 'A')[0], /^Phrygien : La → Si♭/);
  assert.match(fill(find('ambivalence', 'nuance'), 'E')[1], /^Le Do♯ du IV majeur/);
});

test('aucun repère {…} ne reste, quelle que soit la tonique', () => {
  for (const tonic of H.TONICS)
    for (const emo of SS.EMOTIONS)
      for (const pr of emo.proposals) for (const txt of fill(pr, tonic)) assert.doesNotMatch(txt, /[{}]/, `${emo.id} ${pr.kind} en ${tonic}`);
});

/* ---------- Bibliothèque de grilles de référence ---------- */
// 37 grilles de la compilation « Émotions et schémas harmoniques », 15 du guide MusicEmotion (chap. 8) et
// 42 fiches Piano Diary (docs/reference)

test('bibliothèque : 94 grilles, toutes lisibles et jouables dans leur mode, sous leur nom d’origine', () => {
  assert.equal(SS.EMOTION_LIBRARY.length, 94);
  assert.equal(new Set(SS.EMOTION_LIBRARY.map((x) => x.id)).size, 94);
  for (const e of SS.EMOTION_LIBRARY) {
    const k = { tonic: e.tonic, mode: e.mode };
    assert.ok(H.valid(k), e.id);
    assert.ok(SS.EMOTION_SOURCES[e.src], `${e.id} : source`);
    assert.ok(e.emos.length && e.emos.every((id) => SS.findEmotion(id)), `${e.id} : émotions`);
    const syms = e.chords.split(' ');
    assert.equal(SS.libraryBars(e).length, syms.length, `${e.id} : une durée par accord`);
    for (const sym of syms) assert.ok(SS.parseLibraryChord(sym), `${e.id} : ${sym}`);
    const r = SS.libraryGrid(e);
    assert.equal(r.skipped, 0, `${e.id} : tous les accords sur la grille`);
    assert.deepEqual(r.chords.map((c) => c.name.replace('°', 'dim')), syms, `${e.id} : accords retrouvés`);
  }
});

test('bibliothèque : chaque grille se transpose sur les 14 toniques sans perdre d’accord', () => {
  for (const e of SS.EMOTION_LIBRARY)
    for (const tonic of H.TONICS) {
      const r = SS.libraryGrid(e, tonic);
      assert.equal(r.chords.length, e.chords.split(' ').length, `${e.id} en ${tonic}`);
      assert.equal(r.key.tonic, tonic);
    }
  // transposée, la grille garde ses degrés : Hopeful (La dorien) en Ré dorien
  const hop = SS.EMOTION_LIBRARY.find((x) => x.id === 'hopeful');
  assert.deepEqual(SS.libraryGrid(hop, 'D').chords.map((c) => c.name), ['Dm', 'Am', 'G']);
  assert.deepEqual(SS.libraryGrid(hop).grid.map((g) => g.bars), [1, 1, 2]);
});

test('Piano Diary : 42 fiches numérotées, chacune avec sa vidéo, son statut et un tempo de travail quand il existe', () => {
  const pd = SS.EMOTION_LIBRARY.filter((x) => x.src === 'pianodiary');
  assert.equal(pd.length, 42);
  assert.deepEqual(pd.map((x) => x.n).sort((a, b) => a - b), Array.from({ length: 42 }, (_, i) => i + 1));
  for (const e of pd) {
    assert.match(e.url, /^https:\/\/(www\.)?youtube\.com\/shorts\//, `fiche ${e.n}`);
    assert.ok(e.mood, `fiche ${e.n} : émotion / couleur`);
    if (e.tempo) assert.ok(e.tempo >= 40 && e.tempo <= 200, `fiche ${e.n} : tempo`);
  }
  assert.equal(pd.filter((x) => x.tempo).length, 29);
  // Hopeful : découpage validé 1 – 1 – 2 mesures à 132 BPM
  const hop = pd.find((x) => x.n === 3);
  assert.equal(hop.tempo, 132);
  assert.ok(hop.stated);
  // le symbole incertain de la fiche 6 reste signalé
  assert.match(pd.find((x) => x.n === 6).note, /non confirmées/);
});

test('guide MusicEmotion : une grille et un appui par intention (15)', () => {
  assert.equal(SS.EMOTIONS.length, 15);
  for (const e of SS.EMOTIONS) {
    assert.ok(e.appui, `${e.id} : appui`);
    assert.equal(SS.EMOTION_LIBRARY.filter((x) => x.src === 'guide' && x.emos[0] === e.id).length, 1, `${e.id} : grille du guide`);
  }
});

test('bibliothèque : accords chromatiques et basses nommées d’après l’accord', () => {
  const D = { tonic: 'D', mode: 'major' };
  // A♯dim reste un La haussé (♯V°), pas un Si♭
  const asharp = SS.parseLibraryChord('A♯dim');
  assert.deepEqual(H.toGridChord(D, asharp), { degree: 4, type: 'dim', acc: 1 });
  assert.equal(H.gridChord(D, 4, 'dim', 1).name, 'A♯°');
  assert.equal(H.gridChord(D, 4, 'dim', 1).numeral, '♯v°');
  // B♭ en Ré : ♭VI
  assert.deepEqual(H.toGridChord(D, SS.parseLibraryChord('B♭')), { degree: 5, type: 'maj', acc: -1 });
  // basse imposée qui appartient à l'accord : Ddim/F, et non Ddim/E♯
  assert.equal(H.gridChord(D, 0, 'dim', 0, 3).name, 'D°/F');
  assert.equal(H.gridChord({ tonic: 'C', mode: 'minor' }, 4, '7', 0, 5).name, 'G7/C'); // basse étrangère
  // écritures des sources
  assert.equal(SS.parseLibraryChord('FmM7').type, 'mmaj7');
  assert.equal(SS.parseLibraryChord('Dmadd9').type, 'madd9');
  assert.equal(SS.parseLibraryChord('Aaug').type, 'aug');
  assert.equal(SS.parseLibraryChord('E7(♭9)').type, '7b9');
  assert.deepEqual(SS.parseLibraryChord('Gm(add9)/B♭'), { rootPc: 7, letter: 'G', type: 'madd9', bass: 3 });
});

test('modes du guide : couleur, boucle d’essai transposée et appui pour chaque mode', () => {
  for (const m of H.MODES) {
    const g = SS.MODE_GUIDE[m.id];
    assert.ok(g && g.hear && g.tip, `${m.id} : guide`);
    for (const tonic of H.TONICS) {
      const r = SS.modeLoop(m.id, tonic);
      assert.equal(r.skipped, 0, `${m.id} en ${tonic}`);
      assert.equal(r.chords.length, g.loop.split(' ').length);
    }
  }
  assert.deepEqual(SS.modeLoop('lydian', 'C').chords.map((c) => c.name), ['Cmaj7(♯11)', 'D/C', 'Cmaj7(♯11)', 'C']);
  assert.deepEqual(SS.modeLoop('locrian', 'A').chords.map((c) => c.name), ['Am7♭5', 'B♭/A', 'Am7♭5', 'B♭/A']);
  assert.deepEqual(SS.modeLoop('phrygdom', 'E').chords.map((c) => c.name), ['E', 'F', 'Dm', 'E']);
  assert.equal(H.label({ tonic: 'E', mode: 'phrygdom' }), 'Mi phrygien dominant');
});

test('bibliothèque : basses imposées, emprunts et modes', () => {
  assert.deepEqual(SS.parseLibraryChord('Am/G'), { rootPc: 9, letter: 'A', type: 'min', bass: 10 });
  assert.deepEqual(SS.parseLibraryChord('C/E'), { rootPc: 0, letter: 'C', type: 'maj', bass: 4 });
  assert.deepEqual(SS.parseLibraryChord('B♭'), { rootPc: 10, letter: 'B', type: 'maj', bass: 0 });
  assert.equal(SS.parseLibraryChord('Xm'), null);
  const C = { tonic: 'C', mode: 'major' };
  // C/E : la basse sous l'accord
  const ce = H.gridChord(C, 0, 'maj', 0, 4);
  assert.equal(ce.name, 'C/E');
  const v = H.voice(ce, 60);
  assert.equal(H.pcOf(v[0]), 4);
  assert.ok(v[0] < v[1]);
  // Am – B♭ s'entend en La phrygien (B♭ diatonique), Am – Em – D en La dorien
  const phr = { tonic: 'A', mode: 'phrygian' };
  assert.equal(H.gridChord(phr, 1, 'maj').name, 'B♭');
  assert.equal(SS.libraryBars({ chords: 'Am Em D' }).join(), '1,1,2');
});

test('modes de l’onglet Ambiance : chaque émotion sous le mode le plus fréquent de ses grilles', () => {
  const general = ['major', 'minor', 'dorian'];
  for (const m of SS.MODE_MOODS) {
    for (const id of m.emotions) {
      const e = SS.findEmotion(id);
      const n = {};
      [...e.proposals, ...SS.libraryFor(id)].forEach((x) => (n[x.mode] = (n[x.mode] || 0) + 1));
      if (general.includes(m.mode)) {
        const best = Math.max(...Object.values(n));
        assert.equal(n[m.mode], best, `${id} rangée sous ${m.mode} (${JSON.stringify(n)})`);
      } else assert.ok(n[m.mode] || m.mode === 'harmonic', `${id} : au moins une grille en ${m.mode}`);
    }
  }
  // chaque émotion apparaît une fois
  const all = SS.MODE_MOODS.flatMap((m) => m.emotions);
  assert.equal(all.length, SS.EMOTIONS.length);
  assert.equal(new Set(all).size, SS.EMOTIONS.length);
});
