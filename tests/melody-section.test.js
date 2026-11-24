/*
 * Un seul moteur de mélodie : la mélodie des sections de chanson (assistant Nouvelle chanson, js/bandsong.js) est calculée
 * par js/melody.js (SS.melody.section), comme celle de l'atelier Mélodie (SS.melody.compose).
 *   node --test
 *
 * Non-régression : en déplaçant ce calcul de js/bandsong.js vers js/melody.js, les chansons des 40 inspirations gardent leurs
 * notes, à l'identique, pour cinq réglages de mélodie. Si une évolution change volontairement les mélodies, mettre à jour SIG.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'emotions.js', 'melody-profiles.js', 'melody.js', 'band-presets.js', 'band-songs.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;

const SIG = '1cf7163caf5ebcfd867b3eaf716a0ca9ec7e3e9a';
// les 40 inspirations d'origine (les modèles ajoutés ensuite, de brightside à samedisoir, ont leurs propres chansons)
const NEW_STYLES = ['brightside', 'getlucky', 'feather', 'lk', 'despacito', 'lovely', 'zero', 'kingston', 'noel', 'lampions', 'samedisoir', 'calle', 'lettre', 'phares', 'pluie'];
const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets).filter((p) => !NEW_STYLES.includes(p.id));
const tracksOf = (p) =>
  p.musicians.filter((m) => !m.injected && m.role !== 'ambient').flatMap((m) =>
    m.kits ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } })) : [{ id: m.role, type: 'instrument', band: { key: m.role } }]
  );

test('bandsong passe par le moteur de mélodie unique', () => {
  assert.equal(SS.bandSong.CHARACTERS, SS.melody.CHARACTERS);
  assert.equal(SS.bandSong.FORMS, SS.melody.FORMS);
  assert.equal(typeof SS.melody.section, 'function');
  assert.ok(!SS.harmony.GENERATORS && !SS.harmony.generate, 'plus de générateur de couches (ni d’esquisses de mélodie) dans js/harmony.js');
});

test('les mélodies des 40 inspirations sont identiques, note pour note', () => {
  const h = crypto.createHash('sha1');
  const opts = [null, { character: 'chant' }, { character: 'riff', form: 'ABAB', rhythm: 'dense', complexity: 'adventurous' }, { character: 'float', range: 'high', ending: 'open', notes: 5 }, { character: 'lyric', useProfile: true }];
  let n = 0;
  for (const p of PRESETS)
    for (const [i, mel] of opts.entries()) {
      const emos = {};
      if (mel && mel.useProfile) for (const id of Object.keys(SS.BandSongs[p.id].sections)) emos[id] = 'nostalgie';
      const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tracksOf(p), { melodySeed: i, melody: mel, harmony: mel && mel.useProfile ? { keys: {}, chords: {}, emotions: emos } : null });
      for (const sc of s.scenes)
        for (const [id, d] of Object.entries(sc.data))
          if (d.events) {
            h.update(id + JSON.stringify(d.events));
            n++;
          }
    }
  assert.equal(n, 5835);
  assert.equal(h.digest('hex'), SIG);
});
