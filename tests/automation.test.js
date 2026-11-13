/*
 * Automation des pistes (track.auto) : interpolation, nettoyage, formes, scènes, export MIDI (contrôleurs).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const T = 120; // ticks par double-croche à l'export

test('valeur : droite entre deux points, palier avant le premier et après le dernier', () => {
  const lane = { 4: 0, 12: 1 };
  assert.equal(SS.autoValue(lane, 0), 0);
  assert.equal(SS.autoValue(lane, 8), 0.5);
  assert.equal(SS.autoValue(lane, 10), 0.75);
  assert.equal(SS.autoValue(lane, 15), 1);
  assert.equal(SS.autoValue(lane, 4), 0);
  assert.equal(SS.autoValue(null, 3), null);
  // points au-delà de la boucle de la piste : ignorés
  assert.equal(SS.autoValue(lane, 8, 10), 0);
  assert.equal(SS.autoValue({ 12: 1 }, 2, 8), null);
});

test('filtre DJ : passe-bas sous 0, passe-haut au-dessus, ouvert à 0', () => {
  assert.deepEqual(SS.autoFilterHz(0), { lp: 20000, hp: 10 });
  assert.ok(SS.autoFilterHz(-0.5).lp < 1000 && SS.autoFilterHz(-0.5).hp === 10);
  assert.ok(SS.autoFilterHz(0.5).hp > 400 && SS.autoFilterHz(0.5).lp === 20000);
  assert.ok(SS.autoFilterHz(-1).lp >= 30);
  assert.equal(SS.autoFormat('filter', 0), 'Ouvert');
  assert.match(SS.autoFormat('filter', -0.85), /^Passe-bas \d+ Hz$/);
  assert.match(SS.autoFormat('filter', 0.65), /^Passe-haut [\d,]+ (k?Hz)$/);
  assert.equal(SS.autoFormat('volume', 0.2), '20 %');
});

test('points : bornés, arrondis, retirés proprement', () => {
  const t = {};
  SS.setAutoPoint(t, 'filter', 3, -4);
  SS.setAutoPoint(t, 'volume', 0, 0.333);
  SS.setAutoPoint(t, 'nimporte', 0, 1);
  assert.deepEqual(t.auto, { filter: { 3: -1 }, volume: { 0: 0.33 } });
  SS.setAutoPoint(t, 'filter', 3, null);
  assert.deepEqual(t.auto, { volume: { 0: 0.33 } });
  SS.setAutoPoint(t, 'volume', 0, null);
  assert.ok(!('auto' in t));
  const u = { auto: { filter: { 2: '0.5', 40: 0.1, x: 1 }, res: {}, bad: { 0: 1 } } };
  SS.cleanAuto(u, 32);
  assert.deepEqual(u.auto, { filter: { 2: 0.5 } });
});

test('formes : montée de filtre sur toute la boucle, pompe à chaque temps', () => {
  const t = {};
  SS.applyAutoShape(t, 'filter', 'lp-open', 32, 4);
  assert.deepEqual(t.auto.filter, { 0: -0.85, 31: 0 });
  SS.applyAutoShape(t, 'filter', 'hp-rise-half', 32, 4);
  assert.deepEqual(t.auto.filter, { 0: 0, 16: 0, 31: 0.65 }, 'remplace la courbe');
  SS.applyAutoShape(t, 'volume', 'pump', 16, 4);
  assert.deepEqual(t.auto.volume, { 0: 0.2, 3: 1, 4: 0.2, 7: 1, 8: 0.2, 11: 1, 12: 0.2, 15: 1 });
  for (const [id, list] of Object.entries(SS.AUTO_SHAPES)) {
    assert.ok(SS.autoParam(id), id);
    for (const sh of list) {
      const x = {};
      SS.applyAutoShape(x, id, sh.id, 64, 4);
      assert.ok(x.auto && x.auto[id], `${id} / ${sh.id}`);
    }
  }
});

function project() {
  const p = SS.newProject();
  const pad = SS.newTrack({ type: 'instrument', category: 'chord', family: 'pads', instrument: 'syn_pad', name: 'Nappe', color: '#fff' }, p);
  const drum = SS.newTrack({ type: 'drum', name: 'Kick', color: '#fff', source: 'tdm', sound: 'bd', machine: 'RolandTR909' }, p);
  p.tracks = [pad, drum];
  pad.events = [{ step: 0, len: 16, notes: [57, 60, 64], vel: 0.8, chord: 'min' }];
  drum.steps[0] = 1;
  SS.applyAutoShape(pad, 'filter', 'lp-open', 16, 4);
  SS.setAutoPoint(drum, 'volume', 0, 0.5);
  SS.commitScene(p);
  return p;
}

test('scènes, mesures et fichier : la courbe appartient à la scène', () => {
  const p = project();
  const id = p.current;
  const [pad, drum] = p.tracks;
  assert.deepEqual(p.scenes[0].data[pad.id].auto, { filter: { 0: -0.85, 15: 0 } });
  assert.deepEqual(p.scenes[0].data[drum.id].auto, { volume: { 0: 0.5 } });
  const other = SS.addScene(p, { copy: false });
  SS.loadScene(p, other);
  assert.ok(!('auto' in pad), 'scène vide : pas de courbe');
  SS.loadScene(p, id);
  assert.deepEqual(pad.auto, { filter: { 0: -0.85, 15: 0 } });
  pad.auto.filter[3] = -0.5;
  assert.equal(p.scenes[0].data[pad.id].auto.filter[3], undefined, 'copie, pas de partage avec la scène');
  delete pad.auto.filter[3];
  p.bars = 2;
  SS.resizeProject(p);
  SS.repeatBars(p, 1);
  assert.deepEqual(pad.auto.filter, { 0: -0.85, 15: 0, 16: -0.85, 31: 0 }, 'recopiée dans la 2e mesure');
  SS.clearAfterBars(p, 1);
  assert.deepEqual(pad.auto.filter, { 0: -0.85, 15: 0 });
  const back = SS.normalizeProject(JSON.parse(SS.serialize(p)));
  assert.deepEqual(back.tracks[0].auto, { filter: { 0: -0.85, 15: 0 } });
});

test('export MIDI : courbe en CC 74 (filtre), une valeur par pas quand elle change, batterie non exportée', () => {
  const r = SS.midi.exportProject(project(), { range: 'scene', loops: 2, swing: false });
  const m = SS.midiFile.parse(r.bytes);
  const AUTO_CC = [74, 71, 11, 91];
  const ccs = (trk, n) => trk.filter((e) => e.type === 'cc' && (n ? e.cc === n : AUTO_CC.includes(e.cc)));
  const filt = ccs(m.tracks[1], 74);
  const vals = filt.map((e) => e.value);
  assert.equal(vals[0], Math.round(64 - 0.85 * 63), 'départ : passe-bas presque fermé');
  assert.equal(filt.find((e) => e.tick === 15 * T).value, 64, 'fin de boucle : ouvert');
  assert.equal(filt.find((e) => e.tick === 16 * T).value, vals[0], '2e passage : la courbe repart');
  assert.ok(vals.every((v, i) => i === 0 || v !== vals[i - 1]), 'pas de valeur répétée');
  assert.equal(ccs(m.tracks[1]).length, filt.length, 'seulement la courbe du filtre');
  assert.equal(ccs(m.tracks[2]).length, 0, 'batterie : pas de contrôleur d’automation');
  assert.ok(r.report.approx.some((x) => /CC 74/.test(x)));
  assert.ok(r.report.ignored.some((x) => /batterie/.test(x)));
});
