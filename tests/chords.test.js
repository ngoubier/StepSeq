/*
 * Piste Accords de la scène et modes de jeu des pistes (js/chords.js, SS.migrateCategory dans js/project.js).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'chords.js'].forEach((f) => require('../js/' + f));

const Fm = { tonic: 'F', mode: 'minor' };
const pcs = (notes) => notes.map((m) => ((m % 12) + 12) % 12);

/** Projet d'une scène de 4 mesures en Fa mineur : Fm (1 mes.), D♭ (1 mes.), A♭ (2 temps), E♭ (2 temps). */
function project() {
  const p = SS.newProject();
  p.bars = 4;
  SS.normalizeScenes(p, {});
  const sc = SS.currentScene(p);
  sc.key = Fm;
  sc.grid = SS.normalizeGrid({
    chords: [
      { step: 0, len: 16, degree: 0, type: 'min' },
      { step: 16, len: 16, degree: 5, type: 'maj' },
      { step: 32, len: 8, degree: 2, type: 'maj' },
      { step: 40, len: 8, degree: 6, type: 'maj' },
    ],
  });
  return p;
}
const inst = (p, opts = {}) => SS.newTrack({ type: 'instrument', name: 'x', color: '#fff', family: 'pads', instrument: 'syn_softpad', ...opts }, p);

test('anciennes catégories : Arpège → ARP allumé, Accord → piste normale, plus de champ category', () => {
  const p = project();
  const a = inst(p, { category: 'arp' });
  const c = inst(p, { category: 'chord' });
  const m = inst(p, { category: 'mono' });
  assert.equal(a.arpOn, true);
  assert.ok(!c.arpOn && !c.follow && !m.arpOn);
  for (const t of [a, c, m]) assert.ok(!('category' in t));
  const loaded = SS.normalizeProject({ tracks: [{ type: 'instrument', category: 'arp', family: 'synth', instrument: 'syn_pluck', events: [{ step: 0, len: 4, notes: [60, 64, 67], vel: 0.8 }] }], bars: 1 });
  assert.equal(loaded.tracks[0].arpOn, true);
  assert.ok(!('category' in loaded.tracks[0]));
});

test('réglages ACCORDS bornés ; true = réglages par défaut', () => {
  assert.deepEqual(SS.FOLLOW.clean(true), SS.FOLLOW.DEFAULTS);
  assert.deepEqual(SS.FOLLOW.clean({ play: 'zzz', oct: 9, notes: 'root' }), { ...SS.FOLLOW.DEFAULTS, notes: 'root' });
  assert.equal(SS.FOLLOW.clean(null), null);
});

test('accords de la scène : bornés à la durée de la scène, avec leur nom', () => {
  const p = project();
  SS.currentScene(p).grid.chords.push({ step: 60, len: 16, degree: 4, type: 'min', acc: 0 });
  const ch = SS.sceneGridChords(p);
  assert.deepEqual(ch.map((c) => c.info.name), ['Fm', 'D♭', 'A♭', 'E♭', 'Cm']);
  assert.equal(ch[4].len, 4); // 4 mesures = 64 pas : l'accord s'arrête à la fin de la scène
  delete SS.currentScene(p).key;
  assert.deepEqual(SS.sceneGridChords(p), []); // sans tonalité, pas d'accords
});

test('jeu tenu : notes de chaque accord sur toute sa durée, notes communes liées', () => {
  const p = project();
  const t = inst(p, { follow: true });
  const evs = SS.playEvents(p, t);
  // Fm → D♭ : Fa et La♭ sont communs, ils tiennent (au moins) 2 mesures
  const held = evs.filter((e) => e.step === 0 && e.len >= 32); // La♭ tient même jusqu'à la fin de A♭
  assert.deepEqual(pcs(held.map((e) => e.notes[0])).sort((a, b) => a - b), [5, 8]);
  // toutes les notes sonnant à un pas sont celles de l'accord du moment
  for (const [step, want] of [[0, [0, 5, 8]], [20, [1, 5, 8]], [34, [0, 3, 8]], [44, [3, 7, 10]]]) {
    const on = evs.filter((e) => step >= e.step && step < e.step + e.len).map((e) => e.notes[0]);
    assert.deepEqual([...new Set(pcs(on))].sort((a, b) => a - b), want, `pas ${step}`);
  }
  // sans liaison, chaque accord rejoue toutes ses notes
  t.follow.tie = false;
  assert.equal(SS.playEvents(p, t).filter((e) => e.step === 16).length, 3);
});

test('enchaînement au plus proche : les voix bougent peu', () => {
  const p = project();
  const v = SS.voiceChords(SS.sceneGridChords(p), { near: true, oct: 3 });
  for (let i = 1; i < v.length; i++) {
    const move = Math.max(...v[i].notes.map((n) => Math.min(...v[i - 1].notes.map((m) => Math.abs(n - m)))));
    assert.ok(move <= 4, `${v[i - 1].name} → ${v[i].name} : ${move} demi-tons`);
  }
  const far = SS.voiceChords(SS.sceneGridChords(p), { near: false, oct: 3 });
  assert.equal(far[1].notes[0] % 12, 1); // position fondamentale : D♭ à la basse
});

test('notes jouées : fondamentale seule, sans fondamentale, basse + accord', () => {
  const p = project();
  const ch = SS.sceneGridChords(p).slice(0, 1);
  assert.deepEqual(SS.voiceChords(ch, { notes: 'root', oct: 2 })[0].notes, [41]); // Fa2
  assert.deepEqual(pcs(SS.voiceChords(ch, { notes: 'noroot' })[0].notes).sort(), [0, 8]);
  const b = SS.voiceChords(ch, { notes: 'bass', oct: 3 })[0].notes;
  assert.equal(b.length, 4);
  assert.equal(b[0] % 12, 5);
  assert.ok(b[1] - b[0] >= 12); // la basse est sous l'accord
});

test('sur mes pas : le rythme de la piste, les hauteurs de l’accord du moment', () => {
  const p = project();
  const t = inst(p, { follow: { play: 'steps' } });
  t.events = [
    { step: 0, len: 2, notes: [60], vel: 0.9, acc: true },
    { step: 0, len: 1, notes: [64], vel: 0.5 }, // même pas : une seule attaque
    { step: 18, len: 2, notes: [60], vel: 0.7 },
  ];
  const evs = SS.playEvents(p, t);
  assert.equal(evs.length, 2);
  assert.deepEqual(pcs(evs[0].notes).sort((a, b) => a - b), [0, 5, 8]);
  assert.equal(evs[0].len, 2);
  assert.equal(evs[0].acc, true);
  assert.deepEqual(pcs(evs[1].notes).sort((a, b) => a - b), [1, 5, 8]);
});

test('arpège des accords : une suite d’accords pour Arp One, qui joue les notes de l’accord du moment', () => {
  const p = project();
  const t = inst(p, { arpOn: true, follow: true });
  const evs = SS.playEvents(p, t);
  assert.deepEqual(evs.map((e) => [e.step, e.len]), [[0, 16], [16, 16], [32, 8], [40, 8]]);
  const heard = new Set();
  for (let s = 16; s < 32; s++) for (const ev of evs) SS.Arp.renderStep(t.arp, ev, s, { loop: 0, trackLen: 64, stepSec: 0.1, stepsPerBeat: 4, events: evs }).forEach((n) => heard.add(n.midi % 12));
  assert.ok([...heard].every((pc) => [1, 5, 8].includes(pc)), [...heard].join());
});

test('arpège des notes de la piste : notes tenues ensemble → un accord par tranche', () => {
  const evs = [
    { step: 0, len: 8, notes: [60], vel: 0.8 },
    { step: 0, len: 8, notes: [64], vel: 0.8 },
    { step: 0, len: 16, notes: [67], vel: 0.9 },
    { step: 8, len: 8, notes: [65], vel: 0.6 },
  ];
  const ch = SS.heldChords(evs);
  assert.deepEqual(ch.map((c) => [c.step, c.len, c.notes]), [[0, 8, [60, 64, 67]], [8, 8, [65, 67]]]);
  assert.equal(ch[0].vel, 0.9);
  // anciens accords (une note par accord déjà empilée) : inchangés
  const old = [{ step: 0, len: 16, notes: [57, 60, 64], vel: 0.8 }, { step: 16, len: 16, notes: [53, 57, 60], vel: 0.8 }];
  assert.equal(SS.heldChords(old), old);
});

test('Convertir en notes : la piste reprend ce qu’elle joue et ne suit plus', () => {
  const p = project();
  const t = inst(p, { follow: { notes: 'root' } });
  assert.ok(SS.freezeFollow(p, t));
  assert.ok(!t.follow);
  assert.deepEqual(t.events.map((e) => [e.step, e.len, e.notes.length]), [[0, 16, 1], [16, 16, 1], [32, 8, 1], [40, 8, 1]]);
});

test('piste Accords : un accord posé remplace ce qu’il recouvre', () => {
  const g = { chords: [{ step: 0, len: 16 }, { step: 16, len: 16 }] };
  SS.gridPut(g, { step: 8, len: 16 });
  assert.deepEqual(g.chords.map((c) => [c.step, c.len]), [[0, 8], [8, 16], [24, 8]]);
});
