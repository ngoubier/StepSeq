/*
 * « D'après une émotion » : table des chansons de référence (js/songrefs.js) et chanson déduite (js/emotionsong.js).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/sounds.js');
require('../js/harmony.js');
require('../js/emotions.js');
require('../js/band-presets.js');
require('../js/band-songs.js');
require('../js/songrefs.js');
require('../js/emotionsong.js');
const E = SS.emotionSong;
const H = SS.harmony;

test('chaque chanson de référence se lit : style, mode, émotions (somme 100), rôles, forme, grilles', () => {
  const styles = new Set([...SS.Band.STYLES.map((s) => s.id), 'film']);
  const presets = new Set(SS.Band.STYLES.flatMap((s) => s.presets.map((p) => p.id)));
  const titles = new Set();
  assert.ok(E.refs().length >= 250, `${E.refs().length} chansons`);
  E.refs().forEach((r) => {
    const t = `${r.title} (${r.artist})`;
    assert.ok(!titles.has(r.title.toLowerCase()), `${t} : en double`);
    titles.add(r.title.toLowerCase());
    assert.ok(styles.has(r.style), `${t} : style ${r.style}`);
    assert.ok(H.MODES.some((m) => m.id === r.mode), `${t} : mode ${r.mode}`);
    assert.ok(Number.isInteger(r.tonicPc) && r.bpm >= 40 && r.bpm <= 200, `${t} : tonique ou tempo`);
    assert.equal(Math.round(r.emotions.reduce((a, e) => a + e.w, 0) * 100), 100, `${t} : poids des émotions`);
    r.emotions.forEach((e) => assert.ok(SS.findEmotion(e.id), `${t} : émotion ${e.id}`));
    r.roles.forEach((x) => assert.ok(SS.Band.ROLES[x], `${t} : rôle ${x}`));
    r.form.forEach((x) => assert.ok(E.SCENES[x], `${t} : scène ${x}`));
    Object.entries(r.grids).forEach(([k, g]) => {
      assert.ok(E.SCENES[k], `${t} : grille ${k}`);
      g.split(' ').forEach((tok) => assert.ok(E.parseRoman(tok), `${t} : accord ${tok}`));
    });
    if (r.model) assert.ok(presets.has(r.model), `${t} : modèle ${r.model}`);
  });
});

test('degrés : lecture et noms dans la tonalité', () => {
  assert.deepEqual(E.parseRoman('bVI'), { semi: 8, type: 'maj', tok: 'bVI' });
  assert.deepEqual(E.parseRoman('ii7'), { semi: 2, type: 'm7', tok: 'ii7' });
  assert.equal(E.parseRoman('IVmaj7').type, 'maj7');
  assert.equal(E.parseRoman('X'), null);
  const names = (key, g) => E.chordsIn(key, E.parseGrid(g)).map((c) => c.name).join(' ');
  assert.equal(names({ tonic: 'A', mode: 'minor' }, 'i bVI bIII bVII'), 'Am F C G');
  assert.equal(names({ tonic: 'E♭', mode: 'major' }, 'I vi IV V'), 'E♭ Cm A♭ B♭');
  assert.equal(E.fitIn(E.parseGrid('i bVI bIII bVII'), 'minor'), 1);
  assert.ok(E.fitIn(E.parseGrid('I IV V'), 'minor') < 0.8);
});

test('mélange : au plus trois émotions, poids normalisés, inconnues écartées', () => {
  const m = E.normMix([{ id: 'joie', w: 2 }, { id: 'joie', w: 5 }, { id: 'inconnue', w: 3 }, { id: 'espoir', w: 2 }, { id: 'tristesse', w: 4 }, { id: 'mystere', w: 1 }]);
  assert.deepEqual(m.map((e) => e.id), ['joie', 'espoir', 'tristesse']);
  assert.equal(m.reduce((a, e) => a + e.w, 0), 1);
  assert.equal(E.deduce({ style: 'pop', emotions: [] }), null);
  assert.equal(E.deduce({ style: 'inconnu', emotions: [{ id: 'joie', w: 1 }] }), null);
});

test('chaque style × chaque émotion : une chanson complète et jouable', () => {
  E.styles({ film: false }).forEach((st) =>
    SS.EMOTIONS.forEach((em) => {
      const t = `${st.id} + ${em.id}`;
      const d = E.deduce({ style: st.id, emotions: [{ id: em.id, w: 1 }] });
      assert.ok(d, t);
      assert.ok(d.tempo.bpm >= d.tempo.range[0] && d.tempo.bpm <= d.tempo.range[1], `${t} : tempo ${d.tempo.bpm}`);
      assert.ok(H.valid(d.key), `${t} : tonalité ${d.key.tonic} ${d.key.mode}`);
      const style = SS.Band.STYLES.find((s) => s.id === st.id);
      assert.ok(d.model && style.presets.some((p) => p.id === d.model.preset), `${t} : inspiration`);
      assert.ok(d.form.length >= 3 && d.form.every((x) => d.sections.some((s) => s.type === x)), `${t} : forme`);
      d.sections.forEach((s) => {
        assert.ok(s.pick >= 0, `${t} : ${s.name} sans grille`);
        const g = s.grids[s.pick];
        assert.ok(E.fitIn(g.chords, d.key.mode) >= 0.8, `${t} : ${s.name} hors du mode`);
        assert.ok(E.chordsIn(d.key, g.chords).every((c) => c.grid), `${t} : ${s.name} accords hors grille`);
        assert.ok(SS.findEmotion(s.emotion), `${t} : ${s.name} émotion`);
      });
    })
  );
});

test('les déductions vont dans le bon sens', () => {
  const d = (style, ...ids) => E.deduce({ style, emotions: ids.map((id) => ({ id, w: 1 })) });
  assert.ok(d('pop', 'euphorie').tempo.bpm > d('pop', 'tristesse').tempo.bpm, 'euphorie plus rapide que tristesse');
  assert.equal(d('pop', 'tristesse').side, 'dark');
  assert.equal(d('pop', 'joie').side, 'light');
  assert.equal(d('techno', 'mystere', 'suspense').side, 'dark');
  // le mélange penche : le refrain vers l'émotion la plus énergique, l'intro vers la plus calme
  const m = E.deduce({ style: 'pop', emotions: [{ id: 'tristesse', w: 50 }, { id: 'euphorie', w: 50 }] });
  const sec = (type) => m.sections.find((s) => s.type === type);
  const w = (s, id) => s.mix.find((e) => e.id === id).w;
  assert.ok(w(sec('chorus'), 'euphorie') > w(sec('intro'), 'euphorie'));
});
