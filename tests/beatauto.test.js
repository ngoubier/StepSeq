/*
 * Automation par temps (js/beatauto.js) : passages, valeurs par répétition, courbe lisse sans dépassement,
 * liaison des voisines, nettoyage à l'ouverture, ce que la lecture applique.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'beatauto.js', 'project.js', 'harmony.js', 'chords.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BA = SS.beatAuto;

function song() {
  const p = SS.newProject();
  p.bars = 2;
  const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_pwmbass', name: 'Basse' }, p);
  p.tracks.push(t);
  p.tracks.push(SS.newTrack({ type: 'drum', name: 'Kick' }, p));
  SS.commitScene(p);
  const a = p.current;
  const b = SS.addScene(p, { copy: false });
  p.song = [{ scene: a, repeat: 2 }, { scene: b, repeat: 1 }, { scene: a, repeat: 1 }];
  return { p, t, a, b };
}

test('passages : une répétition de bloc = un passage, avec sa place dans la chanson', () => {
  const { p, a, b } = song();
  assert.deepEqual(BA.passages(p, a).map((x) => [x.block, x.rep, x.bar]), [[0, 0, 0], [0, 1, 2], [2, 0, 6]]);
  assert.deepEqual(BA.passages(p, b).map((x) => [x.block, x.rep]), [[1, 0]]);
  assert.equal(BA.sceneBeats(p, SS.currentScene(p)), 8);
});

test('valeurs rangées par répétition, bornées, effacées proprement', () => {
  const { p, t } = song();
  BA.set(p, { block: 0, rep: 1 }, t.id, 'cut', 3, 9);
  assert.equal(BA.get(p, { block: 0, rep: 1 }, t.id, 'cut', 3), 4);
  assert.equal(BA.get(p, { block: 0, rep: 0 }, t.id, 'cut', 3), null);
  assert.deepEqual(p.song[0].bauto[t.id].cut, [null, { 3: 4 }]);
  BA.set(p, { block: 0, rep: 1 }, t.id, 'cut', 3, null);
  assert.equal(p.song[0].bauto, undefined, 'plus rien : la clé disparaît');
});

test('courbe lisse : passe par chaque temps, sans dépasser les barres voisines', () => {
  const v = [0, 0, 4, 1, 1];
  const vals = (i) => (i >= 0 && i < v.length ? v[i] : null);
  assert.equal(BA.curveAt(vals, 2.5, false), 4, 'au centre du temps : sa valeur');
  for (let x = 0.5; x < 4.5; x += 0.05) {
    const y = BA.curveAt(vals, x, false);
    const i = Math.floor(x - 0.5);
    assert.ok(y >= Math.min(v[i], v[i + 1] ?? v[i]) - 1e-9 && y <= Math.max(v[i], v[i + 1] ?? v[i]) + 1e-9, `x=${x} : ${y}`);
  }
  assert.ok(BA.curveAt(vals, 2, false) > 0 && BA.curveAt(vals, 2, false) < 4, 'entre deux temps : en chemin');
  assert.equal(BA.curveAt(vals, 2.1, true), 4, 'paliers : la valeur du temps');
  assert.equal(BA.curveAt((i) => (i === 1 ? 2 : null), 0.7, false), null, 'temps vide : comme écrit');
});

test('liaison : les voisines suivent de moins en moins, rien au-delà du rayon', () => {
  const m = BA.brush(() => null, new Map([[5, 4]]), 3, 12, 0);
  assert.equal(m.get(5), 4);
  assert.ok(m.get(4) > m.get(3) && m.get(3) > m.get(2) && m.get(4) < 4);
  assert.equal(m.get(4), m.get(6));
  assert.ok(!m.has(1) && !m.has(9));
  assert.equal(BA.brush(() => null, new Map([[5, 4]]), 0, 12, 0).size, 1, 'aucune : la barre seule');
  // depuis l'état d'avant le geste : la voisine part de sa valeur
  const k = BA.brush((i) => (i === 4 ? 2 : null), new Map([[5, 4]]), 3, 12, 0);
  assert.ok(k.get(4) > 2 && k.get(4) < 4);
});

test('lecture : passage joué en chanson, passage choisi en boucle, réglages selon la piste', () => {
  const { p, t, a } = song();
  const kick = p.tracks[1];
  BA.set(p, { block: 0, rep: 1 }, t.id, 'vel', 0, 0.5);
  BA.set(p, { block: 0, rep: 0 }, t.id, 'vel', 0, 1.2);
  BA.set(p, { block: 0, rep: 0 }, kick.id, 'cut', 0, 2); // la batterie n'a pas de cutoff : ignoré
  assert.equal(BA.forTrack(p, t, { index: 0, rep: 1 }).vel(0.5), 0.5);
  assert.equal(BA.forTrack(p, t, null).vel(0.5), 1.2, 'boucle : le premier passage par défaut');
  BA.setLoopPass(a, 1);
  assert.equal(BA.forTrack(p, t, null).vel(0.5), 0.5, 'boucle : le passage choisi');
  BA.setLoopPass(a, 'all');
  assert.equal(BA.forTrack(p, kick, { index: 0, rep: 0 }), null);
  assert.equal(BA.forTrack(p, t, { index: 1, rep: 0 }), null, 'autre scène : rien');
  assert.deepEqual(BA.paramsFor(kick).map((x) => x.id), ['vel', 'dj', 'echo', 'hall', 'vol'], 'batterie : vélocité et tranche');
  assert.deepEqual(BA.paramsFor(t).map((x) => x.id), ['cut', 'res', 'env', 'dec', 'vel', 'dj', 'echo', 'hall', 'vol']);
  // la courbe continue d'une répétition à l'autre du bloc
  BA.set(p, { block: 0, rep: 0 }, t.id, 'cut', 7, 2);
  BA.set(p, { block: 0, rep: 1 }, t.id, 'cut', 0, 0);
  const f = BA.forTrack(p, t, { index: 0, rep: 0 }).cut;
  assert.ok(f(7.9) < 2 && f(7.9) > 0, 'fin du passage 1 : glisse vers le début du passage 2');
});

test('résonance : un son sans résonance peut quand même monter', () => {
  assert.equal(BA.resQ(4, 0.5), 2);
  assert.equal(BA.resQ(0, 2), 4);
  assert.equal(BA.resQ(6, 2), 12);
});

test('fichier : gardé à l’enregistrement, nettoyé à l’ouverture', () => {
  const { p, t } = song();
  p.tracks[0].bautoStep = true;
  BA.set(p, { block: 2, rep: 0 }, t.id, 'res', 2, 1.5);
  const data = JSON.parse(SS.serialize(p));
  data.song[2].bauto.inconnue = { cut: [{ 0: 1 }] };
  data.song[2].bauto[t.id].cut = [{ 1: 99, x: 2, 3: 'a' }];
  const q = SS.normalizeProject(data);
  assert.deepEqual(q.song[2].bauto, { [t.id]: { res: [{ 2: 1.5 }], cut: [{ 1: 4 }] } });
  assert.equal(q.tracks[0].bautoStep, true);
  assert.equal(q.song[0].bauto, undefined);
});

test('export MIDI : cutoff en CC 74, résonance en CC 71, vélocité dans les notes, passage par passage', () => {
  const { p, t } = song();
  const kick = p.tracks[1];
  // deux mesures, une note par temps ; un coup de grosse caisse par temps
  const evs = Array.from({ length: 8 }, (_, i) => ({ step: i * 4, len: 2, notes: [36], vel: 0.8 }));
  t.events = evs;
  kick.steps = Array.from({ length: 32 }, (_, i) => (i % 4 ? 0 : 0.8));
  SS.commitScene(p);
  t.bautoStep = true; // paliers : une valeur par temps, facile à lire
  BA.set(p, { block: 0, rep: 1 }, t.id, 'cut', 2, 4); // 2e passage, 3e temps : +4 octaves
  BA.set(p, { block: 0, rep: 0 }, t.id, 'res', 0, 0); // 1er passage : résonance coupée
  BA.set(p, { block: 0, rep: 0 }, t.id, 'vel', 1, 0.5); // 1er passage, 2e temps : moitié
  BA.set(p, { block: 0, rep: 0 }, kick.id, 'vel', 0, 0.5);
  const { bytes, report } = SS.midi.exportProject(p, { swing: false, expression: false });
  const m = SS.midiFile.parse(bytes);
  const T = SS.midi.PPQ / 4;
  const [bass, drum] = m.tracks.slice(1);
  const cc = (tr, n) => tr.filter((e) => e.type === 'cc' && e.cc === n).map((e) => [e.tick / T, e.value]);
  assert.deepEqual(cc(bass, 74), [[32 + 8, 127], [32 + 12, 64]], 'cutoff : seulement au 3e temps du 2e passage, puis retour au milieu');
  assert.deepEqual(cc(bass, 71), [[0, 0], [4, 64]], 'résonance : coupée au 1er temps, neutre ensuite (temps vide = comme écrit)');
  const notes = bass.filter((e) => e.type === 'note' && e.vel > 0);
  assert.deepEqual(notes.slice(0, 3).map((e) => e.vel), [102, 51, 102], 'vélocité : moitié au 2e temps');
  assert.equal(notes[9].vel, 102, '2e passage : intacte');
  assert.deepEqual(drum.filter((e) => e.type === 'note' && e.vel > 0).slice(0, 2).map((e) => e.vel), [51, 102], 'batterie aussi');
  assert.ok(report.approx.some((a) => /CC 74/.test(a) && /vélocité/.test(a)));
});

test('assistant, étape Arrangement : mouvements de son d’après l’énergie, posés sur l’arrangement', () => {
  require('../js/arrange.js');
  const scenes = [{ id: 'a', sec: 'intro', name: 'Intro', bars: 4 }, { id: 'b', sec: 'verse', name: 'Couplet', bars: 8 }, { id: 'c', sec: 'chorus', name: 'Refrain', bars: 8 }, { id: 'd', sec: 'bridge', name: 'Pont', bars: 4 }];
  const song = [{ scene: 'a', repeat: 1 }, { scene: 'b', repeat: 2 }, { scene: 'c', repeat: 1 }, { scene: 'd', repeat: 1 }, { scene: 'c', repeat: 2 }];
  const energy = new Map([['intro', 0.2], ['verse', 0.45], ['chorus', 1], ['bridge', 0.3]]);
  const ins = [{ cols: ['p'], kind: 'chords', name: 'Pad', filter: true }, { cols: ['b'], kind: 'bass', name: 'Basse', filter: true }, { cols: ['m'], kind: 'melody', name: 'Lead', filter: false }, { cols: ['k1', 'k2'], kind: 'drums', name: 'Batterie', filter: false }];
  const ms = SS.arrange.moves({ song, scenes, energy, beatsPerBar: 4, ins });
  assert.deepEqual(ms.map((x) => x.id), ['open', 'qa', 'acid']);
  const open = ms[0];
  // avant chaque refrain (couplet ×2, pont) : fermé, et qui s'ouvre sur les 4 dernières mesures du dernier passage
  assert.deepEqual([...new Set(open.plan.map((e) => e.block))], [1, 3]);
  const v2 = open.plan.find((e) => e.col === 'p' && e.block === 1 && e.rep === 1).beats;
  assert.equal(v2[0], -2);
  assert.equal(v2[16], -2);
  assert.equal(v2[31], 0);
  assert.ok(v2[24] > -2 && v2[24] < 0);
  assert.equal(open.plan.find((e) => e.block === 1 && e.rep === 0).beats[31], -2, '1er passage : reste fermé');
  assert.ok(!open.plan.some((e) => e.col === 'k1'), 'pas la batterie');
  // la mélodie, sans filtre, a quand même la vélocité ; la montée acide sur le pont, pour la basse
  assert.ok(ms[1].plan.every((e) => e.col === 'm' && e.k === 'vel') && ms[1].plan.some((e) => e.block === 1));
  assert.deepEqual(ms[2].plan.map((e) => [e.col, e.block, e.k]), [['b', 3, 'res']]);
  assert.ok(ms[2].plan[0].beats[15] > 2.5 && ms[2].plan[0].beats[0] === 1);
  // posé sur un projet (colonne → piste)
  const p = SS.newProject();
  p.scenes = scenes.map((x) => ({ id: x.id, name: x.name, bars: x.bars, data: {} }));
  p.song = song.map((b) => ({ ...b }));
  BA.applyPlan(p, open.plan, (c) => (c === 'p' ? 'T1' : null));
  assert.equal(BA.get(p, { block: 1, rep: 1 }, 'T1', 'cut', 31), 0);
  assert.equal(BA.get(p, { block: 3, rep: 0 }, 'T1', 'cut', 0), -2);
  assert.ok(!p.song[1].bauto.b, 'colonne sans piste : ignorée');
});
