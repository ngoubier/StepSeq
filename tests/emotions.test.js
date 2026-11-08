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
