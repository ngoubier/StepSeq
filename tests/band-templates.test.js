/*
 * Modèles de l'assistant (js/band-templates.js) : des styles dont les chansons sont des morceaux complets.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'expression.js', 'arp.js', 'project.js', 'harmony.js', 'chords.js', 'band-presets.js', 'band-templates.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;

test('« Cinematic music » : une chanson, rangée dans « Musique de film »', () => {
  const st = SS.BandTemplates.find((s) => s.id === 'cinematic');
  assert.ok(st);
  assert.equal(st.label, 'Cinematic music');
  assert.equal(st.templates.length, 1);
  assert.ok(!SS.Band.STYLES.some((s) => s.id === 'cinematic'), 'pas dans les styles générés (inspirations et musiciens)');
  assert.equal(st.parent, 'film', 'rangé dans la tuile « Musique de film »');
  const ids = SS.BandTemplates.flatMap((s) => s.templates.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('« Reconstitution cinématique » : projet complet, ouvert comme un fichier (scènes, arrangement, mix, master)', () => {
  const t = SS.BandTemplates[0].templates[0];
  for (const k of ['id', 'song', 'tempo', 'key', 'desc', 'project']) assert.ok(t[k], k);
  const p = SS.normalizeProject(JSON.parse(JSON.stringify(t.project)));
  assert.equal(p.tempo, 63.2);
  assert.equal(p.tracks.length, 13);
  assert.equal(p.playMode, 'song');
  assert.equal(SS.songLength(p).bars, 72);
  assert.ok(Math.abs(SS.songLength(p).seconds - 273.4) < 1);
  assert.ok(p.master.mastering.on && p.master.mastering.ceiling === -1, 'master');
  assert.ok(p.tracks.some((tr) => tr.fx && tr.fx.sendHall > 0), 'réverbération de salle');
  assert.ok(p.scenes.some((sc) => Object.values(sc.data).some((d) => d.auto && d.auto.volume)), 'nuances (courbes de volume)');
  assert.ok(p.scenes.some((sc) => Object.values(sc.data).some((d) => (d.events || []).some((e) => e.art))), 'articulations');
  // deux ouvertures : deux copies indépendantes
  const q = SS.normalizeProject(JSON.parse(JSON.stringify(t.project)));
  assert.notEqual(p.id, q.id);
});
