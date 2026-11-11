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

/* ---------- Bibliothèque de grilles de référence (compilation « Émotions et schémas harmoniques ») ---------- */

test('bibliothèque : 39 grilles, toutes lisibles et jouables dans leur mode', () => {
  assert.equal(SS.EMOTION_LIBRARY.length, 39);
  assert.equal(new Set(SS.EMOTION_LIBRARY.map((x) => x.id)).size, 39);
  for (const e of SS.EMOTION_LIBRARY) {
    const k = { tonic: e.tonic, mode: e.mode };
    assert.ok(H.valid(k), e.id);
    assert.ok(SS.EMOTION_SOURCES[e.src], `${e.id} : source`);
    assert.ok(e.emos.length && e.emos.every((id) => SS.findEmotion(id)), `${e.id} : émotions`);
    const syms = e.chords.split(' ');
    assert.equal(SS.libraryBars(e).length, syms.length, `${e.id} : une durée par accord`);
    for (const sym of syms) {
      const c = SS.parseLibraryChord(sym);
      assert.ok(c, `${e.id} : ${sym}`);
      const g = H.toGridChord(k, c);
      assert.ok(g, `${e.id} : ${sym} sur la grille`);
      assert.equal(H.gridChord(k, g.degree, g.type, g.acc, c.bass).name.replace('°', 'dim'), sym, `${e.id} : ${sym} retrouvé`);
    }
  }
});

test('bibliothèque : basses imposées, emprunts et modes', () => {
  assert.deepEqual(SS.parseLibraryChord('Am/G'), { rootPc: 9, type: 'min', bass: 10 });
  assert.deepEqual(SS.parseLibraryChord('C/E'), { rootPc: 0, type: 'maj', bass: 4 });
  assert.deepEqual(SS.parseLibraryChord('B♭'), { rootPc: 10, type: 'maj', bass: 0 });
  assert.equal(SS.parseLibraryChord('Xm'), null);
  const C = { tonic: 'C', mode: 'major' };
  // C/E : la basse sous l'accord, et la couche Basse joue Mi
  const ce = H.gridChord(C, 0, 'maj', 0, 4);
  assert.equal(ce.name, 'C/E');
  const v = H.voice(ce, 60);
  assert.equal(H.pcOf(v[0]), 4);
  assert.ok(v[0] < v[1]);
  const bass = H.generate([{ step: 0, len: 16, notes: v }], { kind: 'bass-whole', octave: 2, spb: 16, beat: 4, key: C, length: 16 });
  assert.equal(H.pcOf(bass[0].notes[0]), 4);
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
