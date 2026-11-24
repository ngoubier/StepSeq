/*
 * Mix auto de l'assistant (js/wizmix.js : change, fromSuggestion, revert, apply de mix.auto) — sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'sounds.js', 'project.js', 'mixref.js', 'band-levels.js', 'band-drive.js', 'bandmix.js', 'automix.js', 'wizmix.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const W = SS.wizMix;

/** Un petit projet « Band » : kick, basse, nappe, mixé par bandmix, et son mix d'assistant. */
function song() {
  const p = SS.newProject();
  const mk = (key, type = 'instrument') => ({ id: 't' + key.replace(':', ''), type, sound: key === 'drums:bd' ? 'bd' : undefined, volume: 0.8, band: { key, style: 'synthwave' } });
  p.tracks = [mk('drums:bd', 'drum'), mk('bass'), mk('pad')];
  SS.bandMix.mixTracks(p.tracks, new Map(), 'synthwave');
  SS.bandMix.mixMaster(p, 'synthwave', 0);
  const mix = W.defaults('synthwave', p.tracks.map((t) => ({ type: t.type, sound: t.sound, band: t.band })));
  return { p, mix };
}
const fresh = (p) => JSON.parse(JSON.stringify(p));

test('volume : le conseil bouge le fader de la tranche, à l’écart près', () => {
  const { mix } = song();
  const v0 = mix.tracks.bass.vol;
  const e = W.change(mix, 'bass', { path: 'volumeDb', from: -6, to: -8.5 });
  assert.equal(mix.tracks.bass.vol, Math.round((v0 - 2.5) * 100) / 100);
  assert.equal(e.kind, 'vol');
  assert.equal(W.revert(mix, [e]), 1);
  assert.equal(mix.tracks.bass.vol, v0);
});

test('réglages fins : passe-haut, limiteur de piste, mastering écrits par apply()', () => {
  const { p, mix } = song();
  const pad = p.tracks[2];
  const entries = W.fromSuggestion(mix, p, pad.id, [
    { path: 'mix.eq.hp.on', from: false, to: true, fixed: true },
    { path: 'mix.eq.hp.f', from: 40, to: 180, fixed: true },
    { path: 'mix.lim.on', from: false, to: true, fixed: true },
  ]);
  entries.push(...W.fromSuggestion(mix, p, '__master', [{ path: 'mastering.drive', from: 2, to: 5.5 }, { path: 'mastering.on', from: false, to: true, fixed: true }]));
  assert.equal(W.autoCount(mix), 5);
  const q = fresh(p);
  W.apply(q, mix, []);
  assert.equal(SS.mixParams(q.tracks[2]).eq.hp.f, 180);
  assert.equal(SS.mixParams(q.tracks[2]).lim.on, true);
  assert.equal(SS.masterParams(q).mastering.drive, 5.5);
  assert.equal(SS.masterParams(q).mastering.on, true);
  // dosage : 50 % du chemin
  W.fromSuggestion(mix, p, '__master', [{ path: 'mastering.drive', from: 2, to: 5 }], 0.5);
  assert.equal(mix.auto.master['mastering.drive'], 3.5);
  // tout annuler : plus rien du Mix auto
  W.revert(mix, entries);
  assert.equal(W.autoCount(mix, 'pad'), 0);
});

test('sidechain : la piste source est retrouvée par son id de mix', () => {
  const { p, mix } = song();
  const [kick, bass] = p.tracks;
  W.fromSuggestion(mix, p, bass.id, [{ path: 'fx.scSource', from: '', to: kick.id, fixed: true }, { path: 'fx.scDepth', from: 0, to: 0.5 }]);
  assert.equal(mix.auto.bass['fx.scSource'], '@kick');
  const q = fresh(p);
  q.tracks.forEach((t, i) => (t.id = 'n' + i)); // un autre projet (la chanson créée) : d'autres ids
  W.apply(q, mix, []);
  assert.equal(q.tracks[1].fx.scSource, 'n0');
  assert.equal(q.tracks[1].fx.scDepth, 0.5);
});

test('une retouche à la main de l’EQ efface les gains fins du Mix auto, garde le passe-haut', () => {
  const { mix } = song();
  W.change(mix, 'pad', { path: 'mix.eq.lm.g', from: 0, to: -3 });
  W.change(mix, 'pad', { path: 'mix.eq.hp.f', from: 40, to: 180 });
  W.set(mix, 'song', 'pad', 'fx.eq.mid', -1);
  assert.deepEqual(Object.keys(mix.auto.pad), ['mix.eq.hp.f']);
});

test('revert ne défait pas une valeur retouchée depuis ; sync garde le Mix auto', () => {
  const { p, mix } = song();
  const e = W.change(mix, 'bass', { path: 'mix.comp.th', from: -18, to: -12 });
  W.change(mix, 'bass', { path: 'mix.comp.th', from: -12, to: -10 });
  assert.equal(W.revert(mix, [e]), 0);
  const next = W.sync(mix, 'synthwave', p.tracks.map((t) => ({ type: t.type, sound: t.sound, band: t.band })));
  assert.equal(next.auto.bass['mix.comp.th'], -10);
});

test('« Chaque scène » : volume et envoi hall rangés dans la scène, le reste pour la chanson ; annulation', () => {
  const { p, mix } = song();
  const pad = p.tracks[2];
  const v0 = mix.tracks.pad.vol;
  const entries = W.fromSuggestion(mix, p, pad.id, [
    { path: 'volumeDb', from: -6, to: -4 },
    { path: 'fx.sendHall', from: 0, to: 0.3 },
    { path: 'mix.eq.hp.on', from: false, to: true, fixed: true },
  ], 1, 'chorus');
  assert.deepEqual(entries.map((e) => e.kind), ['own', 'own', 'auto']);
  assert.equal(mix.tracks.pad.vol, v0, 'le fader de la chanson ne bouge pas');
  assert.equal(mix.own.chorus.pad.vol, Math.round((v0 + 2) * 100) / 100);
  assert.equal(mix.own.chorus.pad.fx.sends.hall, 30);
  assert.equal(W.eff(mix, 'verse', 'pad').vol, v0, 'les autres scènes gardent le réglage de la chanson');
  assert.equal(mix.auto.pad['mix.eq.hp.on'], true);
  // une 2e retouche de la même scène part de son volume propre
  const e2 = W.fromSuggestion(mix, p, pad.id, [{ path: 'volumeDb', from: -6, to: -7 }], 1, 'chorus');
  assert.equal(mix.own.chorus.pad.vol, Math.round((v0 + 1) * 100) / 100);
  assert.equal(W.revert(mix, e2), 1);
  assert.equal(mix.own.chorus.pad.vol, Math.round((v0 + 2) * 100) / 100);
  assert.equal(W.revert(mix, entries), 3);
  assert.ok(!mix.own.chorus, 'la scène redevient comme la chanson');
  assert.ok(!mix.auto || !mix.auto.pad);
  // le Master ne se règle pas par scène
  const m = W.fromSuggestion(mix, p, '__master', [{ path: 'volumeDb', from: 0, to: -1 }], 1, 'chorus');
  assert.equal(m[0].kind, 'vol');
});
