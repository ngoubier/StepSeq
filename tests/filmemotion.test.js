/*
 * « D'après une émotion » › Musique de film : une émotion par passage → scène de film (js/filmemotion.js).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/sounds.js');
require('../js/harmony.js');
require('../js/emotions.js');
require('../js/songrefs.js');
require('../js/emotionsong.js');
require('../js/film.js');
require('../js/filmemotion.js');
const FE = SS.filmEmotion;
const F = SS.film;

test('chaque histoire toute faite donne une scène jouable : repères, synchro calée, harmonie et thème par passage', () => {
  FE.STORIES.forEach((st) => {
    ['cale', 'passage'].forEach((tempo) => {
      const d = FE.deduce({ passages: st.p, tempo });
      assert.ok(d, st.id);
      assert.equal(d.film.cues.length, st.p.length, `${st.id} : un repère par passage`);
      assert.equal(d.total, st.p.reduce((a, p) => a + p.s, 0));
      assert.ok(['minor', 'major'].includes(d.key.mode) && SS.harmony.valid(d.key), `${st.id} : tonalité`);
      assert.ok(FE.ENS.includes(d.ens), `${st.id} : effectif`);
      assert.equal(d.tm.sections.length, st.p.length);
      d.tm.sections.forEach((s) => {
        const sec = d.spec.sections[s.id];
        assert.ok(s.bars >= 1 && sec.grid.length, `${st.id} ${s.name} : mesures et accords`);
        assert.ok(sec.dyn, `${st.id} ${s.name} : nuance`);
      });
      const sync = d.tm.sections.find((s) => s.sync);
      if (tempo === 'cale' && sync) assert.ok(Math.abs(sync.cue.drift) < 0.6, `${st.id} : synchro à moins de 0,6 s (${sync.cue.drift})`);
      if (tempo === 'passage') d.tm.sections.forEach((s, i) => assert.equal(s.bpm, SS.FILM_EMOTIONS.find((e) => e.k === st.p[i].emo).bpm));
    });
  });
});

test('le moteur du film reçoit ce que la vue montre : motif du passage cœur, thème muet sous le dialogue', () => {
  const adieux = FE.STORIES.find((s) => s.id === 'adieux');
  const d = FE.deduce({ passages: adieux.p });
  assert.equal(d.heart.name, 'Le train part', 'le cœur = la synchro forte');
  assert.deepEqual(d.film.motif, F.motifFor('tristesse'));
  const mots = d.tm.sections.find((s) => s.name === 'Les mots');
  assert.equal(F.treatOf(d.film, mots), 'tacet');
  assert.equal((d.spec.sections[mots.id].theme || []).length, 0, 'le thème se tait sous les mots');
  assert.ok(d.spec.sections[mots.id].film.dlg);
  assert.equal(d.ens, 'intime', 'adieux : effectif intime');
  const traque = FE.deduce({ passages: FE.STORIES.find((s) => s.id === 'traque').p });
  assert.equal(traque.ens, 'epique', 'traque : effectif épique');
  assert.equal(traque.key.mode, 'minor');
  const dec = FE.deduce({ passages: FE.STORIES.find((s) => s.id === 'decouverte').p });
  assert.equal(dec.ens, 'romantique');
});

test('énergie et tension viennent de l’émotion ; la synchro forte monte d’un cran ; les réglages du passage priment', () => {
  assert.deepEqual(FE.levels({ emo: 'apaisement' }), { ene: 1, ten: 1 });
  assert.ok(FE.levels({ emo: 'heroisme', sync: true }).ene === 5);
  assert.ok(FE.levels({ emo: 'emerveillement', sync: true }).ene >= 3);
  assert.ok(FE.levels({ emo: 'peur' }).ten >= 4);
  const d = FE.deduce({ passages: [{ emo: 'suspense', s: 10 }, { emo: 'joie', s: 10, ene: 5, ten: 1 }] });
  assert.equal(d.film.cues[1].ene, 5);
  assert.equal(d.film.cues[1].ten, 1);
});

test('passages nettoyés : une seule synchro, jamais au premier passage, durée minimale, 8 au plus', () => {
  const ps = FE.clean([{ emo: 'joie', s: 1, sync: true }, { emo: 'peur', s: 5, sync: true }, { emo: 'inconnue', s: 5 }, { emo: 'espoir', s: 5, sync: true }]);
  assert.equal(ps.length, 3);
  assert.deepEqual(ps.map((p) => p.sync), [false, true, false]);
  assert.equal(ps[0].s, 2);
  assert.equal(FE.clean(Array.from({ length: 12 }, () => ({ emo: 'joie', s: 4 }))).length, FE.MAX_PASSAGES);
  assert.equal(FE.deduce({ passages: [] }), null);
});

test('« Toute la scène » : un mélange devient des passages (thème, sommet avec synchro, fin calme), voisins identiques fusionnés', () => {
  const ps = FE.fromMix([{ emo: 'tristesse', w: 60 }, { emo: 'espoir', w: 40 }], 50);
  assert.deepEqual(ps.map((p) => p.emo), ['tristesse', 'espoir', 'tristesse']);
  assert.deepEqual(ps.map((p) => !!p.sync), [false, true, false]);
  assert.ok(Math.abs(ps.reduce((a, p) => a + p.s, 0) - 50) <= 2);
  const three = FE.fromMix([{ emo: 'suspense', w: 50 }, { emo: 'heroisme', w: 30 }, { emo: 'apaisement', w: 20 }], 60);
  assert.deepEqual(three.map((p) => p.emo), ['suspense', 'heroisme', 'apaisement']);
  assert.ok(three[1].sync);
  const one = FE.fromMix([{ emo: 'joie', w: 1 }], 30);
  assert.ok(one.length >= 2 && one.some((p) => p.sync) && !one[0].sync);
  assert.deepEqual(FE.fromMix([], 30), []);
});

test('tempo : conseil « par passage » quand les tempos des émotions s’écartent beaucoup', () => {
  assert.equal(FE.deduce({ passages: FE.STORIES[0].p }).adviseTempo, 'passage'); // suspense 90 → peur 140 → apaisement 66
  assert.equal(FE.deduce({ passages: FE.STORIES.find((s) => s.id === 'adieux').p }).adviseTempo, 'cale');
  const d = FE.deduce({ passages: FE.STORIES[0].p, ens: 'mystere' });
  assert.equal(d.ens, 'mystere', 'l’effectif choisi à la main est gardé');
});
