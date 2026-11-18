/*
 * Piste Effets réglée scène par scène (parts[section].fx, js/bandsong.js withSceneFx).
 *   node --test tests/fx-scene.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'melody.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets.map((p) => ({ ...p, style: st.id })));
const tracksOf = (p) =>
  p.musicians.filter((m) => !m.injected).flatMap((m) =>
    m.kits
      ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } }))
      : [{ id: m.role, type: 'instrument', category: m.role === 'bass' || m.role === 'lead' ? 'mono' : 'chord', band: { key: m.role } }]
  );
const strip = (r) => JSON.stringify(r.scenes.map((s) => ({ ...s, id: 0 })));
const SPB = 16;
const withFx = PRESETS.filter((p) => p.musicians.some((m) => m.role === 'fx' && !m.injected));

test('le rôle du plan, réglé explicitement sur chaque scène, donne la même chanson', () => {
  assert.ok(withFx.length > 3);
  for (const p of withFx) {
    const spec = SS.BandSongs[p.id];
    const tr = tracksOf(p);
    const ref = strip(SS.bandSong.build(spec, p.id, tr));
    const parts = Object.fromEntries(Object.entries(spec.sections).map(([id, s]) => [id, { fx: { mode: s.fx || 'none' } }]));
    assert.equal(strip(SS.bandSong.build(spec, p.id, tr, { parts })), ref, `${p.id} : rôles du plan = plan`);
  }
});

test('ambiance, montée, descente, rien : ce que joue la piste Effets dans la scène', () => {
  const p = withFx.find((x) => x.id === 'eternity') || withFx[0];
  const spec = SS.BandSongs[p.id];
  const tr = tracksOf(p);
  const ids = Object.keys(spec.sections);
  const quiet = ids.find((id) => !spec.sections[id].fx && spec.sections[id].bars >= 8);
  const amb = ids.find((id) => spec.sections[id].fx === 'swell');
  const build = (parts) => SS.bandSong.build(spec, p.id, tr, { parts });
  const sceneFx = (r, id) => r.scenes.find((s) => s.sec === id).data.fx;

  // scène sans effet → ambiance toutes les 2 mesures, claire
  const bars = spec.sections[quiet].bars;
  let r = build({ [quiet]: { fx: { mode: 'swell', every: 2, color: 'bright' } } });
  let ev = sceneFx(r, quiet).events;
  assert.equal(ev.length, bars / 2, 'une note toutes les 2 mesures');
  assert.ok(ev.every((e) => e.len === 2 * SPB));

  // ambiance tenue : une seule note
  r = build({ [quiet]: { fx: { mode: 'swell', every: bars } } });
  assert.equal(sceneFx(r, quiet).events.length, 1);

  // rien : la scène d'ambiance se tait
  r = build({ [amb]: { fx: { mode: 'none' } } });
  assert.equal(sceneFx(r, amb).events.length, 0, 'plus d’ambiance');

  // niveau : vélocités réduites
  const base = sceneFx(build(null), amb).events;
  ev = sceneFx(build({ [amb]: { fx: { level: 0.5 } } }), amb).events;
  assert.equal(ev.length, base.length);
  ev.forEach((e, i) => assert.ok(Math.abs(e.vel - base[i].vel * 0.5) < 0.02));

  // montée de 4 mesures, passe-haut : la note commence 4 mesures avant la fin, la jonction suit
  r = build({ [quiet]: { fx: { mode: 'riser', len: 4, filter: 'hp' } } });
  ev = sceneFx(r, quiet).events;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].step, (bars - 4) * SPB);
  assert.equal(ev[0].len, 4 * SPB);
  const spx = SS.bandSong.withSceneFx(spec, { [quiet]: { fx: { mode: 'riser', len: 4, filter: 'hp' } } });
  const D = SS.bandSong.junctionDefaults(spx, quiet, null);
  assert.deepEqual([D.riser.on, D.riser.len, D.riser.filter], [true, 4, 'hp']);

  // descente de 4 mesures au début de la scène
  r = build({ [quiet]: { fx: { mode: 'down', dlen: 4 } } });
  ev = sceneFx(r, quiet).events;
  assert.ok(ev.some((e) => e.step === 0 && e.len === 4 * SPB), 'descente de 4 mesures');
});
