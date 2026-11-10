const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/project.js');
require('../js/sounds.js');
require('../js/bandmix.js');
require('../js/automix.js');
require('../js/automix-pilot.js');
const P = SS.automixPilot;
function fixture() {
  const track = { id: 'bass', name: 'Basse', role: 'bass', mix: structuredClone(SS.mixParams({})) };
  track.mix.eq.on = track.mix.comp.on = track.mix.lim.on = false;
  const sum = { secs: 12, tracks: { bass: { n: 100, inPeak: -8, inP90: -16, grMean: 0, grMax: 0, limGr: 0 } } };
  return { sum, track };
}
test('Pistes : pas de traitement sans écoute fraîche ou sur une piste muette/non entendue', () => {
  const { sum, track } = fixture();
  assert.equal(P.planTrack({ ...sum, secs: 5 }, track), null);
  assert.equal(P.planTrack({ ...sum, tracks: {} }, track), null);
  assert.equal(P.planTrack(sum, { ...track, mute: true }), null);
});
test('Pistes : EQ, compresseur puis limiteur, calibrés sur la piste et sans fader', () => {
  const { sum, track } = fixture();
  const actions = P.planTrack(sum, track);
  assert.deepEqual(actions.map((a) => a.module), ['eq', 'comp', 'lim']);
  assert.ok(actions.every((a) => a.track === 'bass' && a.changes.every((c) => c.path.startsWith('mix.'))));
  assert.equal(actions[1].changes.find((c) => c.path === 'mix.comp.th').to, -17);
  assert.equal(actions[2].changes.find((c) => c.path === 'mix.lim.ceil').to, -11);
  assert.ok(actions[0].changes.some((c) => c.path === 'mix.eq.lm.g' && c.to < 0));
});
test('Pistes : une EQ déjà active n’empêche pas de régler les autres modules', () => {
  const { sum, track } = fixture(); track.mix.eq.on = true;
  assert.deepEqual(P.planTrack(sum, track).map((a) => a.module), ['comp', 'lim']);
});
test('Pistes : pas de limiteur inutile ni de seuil inventé sans mesure d’entrée', () => {
  const { sum, track } = fixture();
  sum.tracks.bass.inP90 = -10;
  assert.ok(!P.planTrack(sum, track).some((a) => a.module === 'lim'));
  sum.tracks.bass.inPeak = null;
  assert.deepEqual(P.planTrack(sum, track).map((a) => a.module), ['eq']);
});
test('Pistes : modules repris à la main et autorisations respectés', () => {
  const { sum, track } = fixture();
  assert.deepEqual(P.planTrack(sum, track, { eq: false, comp: false }), []);
  assert.deepEqual(P.planTrack(sum, track, {}, new Set(['eq', 'comp', 'lim'])), []);
});
test('Pistes déjà traitées : correction mesurée, gains bornés et aucune autre piste touchée', () => {
  const { sum, track } = fixture();
  track.mix.eq.on = track.mix.comp.on = track.mix.lim.on = true;
  const suggestions = [
    { track: 'bass', changes: [{ path: 'mix.eq.lm.g', to: -9 }, { path: 'mix.comp.th', to: -12 }] },
    { track: 'other', changes: [{ path: 'mix.lim.ceil', to: -20 }] },
  ];
  const actions = P.planTrack(sum, track, {}, new Set(), suggestions);
  assert.deepEqual(actions.map((a) => a.module), ['eq', 'comp']);
  assert.equal(actions[0].changes[0].to, -6);
  assert.equal(actions[1].changes[0].to, -12);
});
