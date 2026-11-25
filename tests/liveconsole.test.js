/*
 * Console Live (js/liveconsole.js) : gestes tenus, écriture dans l'automation par temps, modes Au toucher et Verrou,
 * annulation d'une prise.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'beatauto.js', 'project.js', 'liveconsole.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BA = SS.beatAuto;
const LC = SS.liveConsole;

function setup() {
  const p = SS.newProject();
  p.bars = 2;
  const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_pwmbass', name: 'Basse' }, p);
  p.tracks.push(t);
  SS.commitScene(p);
  p.song = [{ scene: p.current, repeat: 2 }];
  let changes = 0;
  LC.stopped();
  LC.setMode('touch');
  LC.init({ project: () => p, changed: () => changes++ });
  return { p, t, changes: () => changes };
}
const step = (p, t, tick, rep = 0) => LC.onStep(p, t, tick, { index: 0, rep });

test('sans enregistrement : le réglage remplace la courbe et reste où on le laisse', () => {
  const { p, t } = setup();
  LC.touch(t.id, 'cut', 2);
  LC.release(t.id, 'cut');
  assert.equal(BA.forTrack(p, t, { index: 0, rep: 0 }).cut(1), 2);
  step(p, t, 0);
  assert.equal(p.song[0].bauto, undefined, 'rien n’est écrit');
  LC.reset(t.id, 'cut');
  assert.equal(BA.forTrack(p, t, { index: 0, rep: 0 }), null, 'double-clic : retour à la courbe');
});

test('au toucher : le geste s’écrit dans le temps joué, puis la courbe reprend', () => {
  const { p, t, changes } = setup();
  LC.setRec(true);
  LC.touch(t.id, 'cut', 1.5);
  step(p, t, 0);
  step(p, t, 4); // 2e temps
  LC.move(t.id, 'cut', -1);
  step(p, t, 8, 1); // 3e temps, 2e passage
  LC.release(t.id, 'cut');
  step(p, t, 12, 1);
  assert.deepEqual(p.song[0].bauto[t.id].cut, [{ 0: 1.5, 1: 1.5 }, { 2: -1 }]);
  assert.equal(BA.liveOf(t.id, 'cut'), null, 'relâché : plus de valeur tenue');
  assert.equal(LC.takeBeats(), 3);
  LC.setRec(false);
  assert.equal(changes(), 1, 'une prise = une étape');
  assert.equal(LC.lastTake().beats, 3);
});

test('verrou : la dernière valeur s’écrit jusqu’à la fin de la prise ; Annuler la prise', () => {
  const { p, t } = setup();
  BA.set(p, { block: 0, rep: 0 }, t.id, 'vol', 0, 0.5);
  LC.setMode('latch');
  LC.setRec(true);
  LC.touch(t.id, 'echo', 0.4);
  LC.release(t.id, 'echo');
  step(p, t, 4);
  step(p, t, 8);
  assert.deepEqual(p.song[0].bauto[t.id].echo, [{ 1: 0.4, 2: 0.4 }]);
  LC.stopped(); // arrêt de la lecture
  assert.equal(BA.liveOf(t.id, 'echo'), null);
  assert.ok(LC.undoTake());
  assert.deepEqual(p.song[0].bauto, { [t.id]: { vol: [{ 0: 0.5 }] } }, 'les courbes d’avant reviennent');
});

test('formes prêtes et affichage des nouveaux réglages', () => {
  assert.deepEqual(BA.shape('dj', 'rise', 3), [-0.8, -0.4, 0]);
  assert.equal(BA.fmt('dj', -0.5), 'passe-bas 50 %');
  assert.equal(BA.fmt('env', 1.5), '+1,5 oct');
  assert.equal(BA.fmt('dec', 2), '×2,00');
  assert.equal(BA.fmt('vol', 0.8), '80 %');
});

test('phaser et flanger : vitesse au tempo, effet actif, bouton Mouvement seulement s’il y en a un', () => {
  assert.equal(SS.modRate(0.5, 0, 120), 0.5, 'libre : la vitesse en Hz');
  assert.equal(SS.modRate(0.5, 4, 120), 1 / 8, 'au tempo : 4 mesures à 120 = 8 s');
  assert.equal(SS.modRate(0.5, 0.25, 120), 2, 'un temps à 120 = 0,5 s');
  const { t } = setup();
  assert.ok(!BA.paramsFor(t).some((x) => x.id === 'mov'));
  t.fx = { phaser: 0.5 };
  assert.ok(SS.fxActive(t));
  assert.ok(BA.paramsFor(t).some((x) => x.id === 'mov'), 'avec un phaser : Mouvement');
  assert.equal(BA.fmt('mov', 1.5), '×1,50');
});
