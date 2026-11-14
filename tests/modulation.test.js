/*
 * LFO et PWM du synthé intégré (js/modulation.js) : formes, vitesses calées sur le tempo, phase commune,
 * courbes, réglages par défaut, enregistrement dans le projet.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'modulation.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('formes : bornées à [−1, 1], points remarquables', () => {
  for (const sh of SS.LFO_SHAPES) {
    for (let c = 0; c < 4; c += 0.037) {
      const v = SS.lfoShapeValue(sh.id, c, 7);
      assert.ok(v >= -1 && v <= 1, `${sh.id} ${c} -> ${v}`);
    }
  }
  near(SS.lfoShapeValue('sine', 0.25), 1);
  near(SS.lfoShapeValue('triangle', 0.25), 1);
  near(SS.lfoShapeValue('triangle', 0.75), -1);
  near(SS.lfoShapeValue('rampup', 0), -1);
  near(SS.lfoShapeValue('rampdown', 0), 1);
  assert.equal(SS.lfoShapeValue('square', 0.2), 1);
  assert.equal(SS.lfoShapeValue('square', 0.7), -1);
});

test('aléatoires : déterministes, palier par cycle (S&H), continus (lissé)', () => {
  assert.equal(SS.lfoShapeValue('sh', 3.1, 42), SS.lfoShapeValue('sh', 3.9, 42));
  assert.notEqual(SS.lfoShapeValue('sh', 3.5, 42), SS.lfoShapeValue('sh', 4.5, 42));
  assert.equal(SS.lfoShapeValue('sh', 3.5, 42), SS.lfoShapeValue('sh', 3.5, 42));
  // lissé : vaut la valeur tirée au début de chaque cycle, sans saut
  near(SS.lfoShapeValue('smooth', 5, 9), SS.lfoRandom(9, 5));
  near(SS.lfoShapeValue('smooth', 5.9999999, 9), SS.lfoRandom(9, 6), 1e-6);
  assert.notEqual(SS.lfoSeed('t1', 1), SS.lfoSeed('t1', 2));
  assert.notEqual(SS.lfoSeed('t1', 1), SS.lfoSeed('t2', 1));
});

test('vitesses calées sur le tempo : notes et mesures (selon le chiffrage)', () => {
  const clock = SS.lfoClock(120, 4);
  const lfo = (rate) => ({ rate, hz: 3, mode: 'free' });
  near(SS.lfoHz(lfo('n4'), clock), 2); // une noire à 120 = 0,5 s
  near(SS.lfoHz(lfo('n16'), clock), 8);
  near(SS.lfoHz(lfo('b1'), clock), 0.5); // 4 noires
  near(SS.lfoHz(lfo('b4'), clock), 0.125);
  near(SS.lfoHz(lfo('b1'), SS.lfoClock(120, 3)), 2 / 3); // 6/8 : mesure de 3 noires
  near(SS.lfoHz(lfo('hz'), clock), 3);
});

test('phase : commune en mode Libre (calée sur la lecture), repart à la note en Retrig', () => {
  // à t = 10 s, la lecture en était à la noire 8 (début de la 3e mesure)
  const clock = SS.lfoClock(120, 4, 10, 8);
  const free = { rate: 'b1', mode: 'free', hz: 1 };
  near(SS.lfoCycles(free, 10, 10, clock), 2);
  near(SS.lfoCycles(free, 11, 10.7, clock), 2.5); // ne dépend pas du début de la note
  const retrig = { ...free, mode: 'retrig' };
  near(SS.lfoCycles(retrig, 11, 10.5, clock), 0.25);
  near(SS.lfoCycles(retrig, 10, 10.5, clock), 0);
});

test('courbe : fondu d’entrée, longueur raisonnable, quantité non appliquée', () => {
  const clock = SS.lfoClock(120, 4, 0, 0);
  const lfo = { shape: 'square', rate: 'n4', mode: 'retrig', hz: 1, amt: 0.3, fade: 1 };
  const c = SS.lfoCurve(lfo, 0, 2, 0, clock, 1);
  assert.ok(c instanceof Float32Array);
  assert.ok(c.length > 50 && c.length < 2000);
  assert.equal(c[0], 0); // fondu : silence au début
  assert.ok(Math.abs(c[c.length - 1]) > 0.99); // carré, fondu terminé, quantité non appliquée
  // très longue note : nombre de points borné
  assert.ok(SS.lfoCurve({ ...lfo, rate: 'n16', fade: 0 }, 0, 600, 0, clock).length <= 16384);
});

test('réglages : LFO inactifs par défaut, presets PWM / ambient, lecture des LFO', () => {
  const sub = { type: 'instrument', family: 'bass', instrument: 'syn_sub' };
  const d = SS.soundDefaults(sub);
  assert.equal(d.pw, 0.5);
  assert.equal(d.lfo1Dest, 'off');
  assert.deepEqual(SS.activeLfos(d), []);
  const pwm = SS.soundParams({ type: 'instrument', family: 'bass', instrument: 'syn_pwmbass' });
  assert.equal(pwm.wave, 'pulse');
  const [l] = SS.activeLfos(pwm);
  assert.equal(l.dest, 'pw');
  assert.equal(l.rate, 'b1');
  const drone = SS.soundParams({ type: 'instrument', family: 'pads', instrument: 'syn_drone' });
  assert.deepEqual(SS.activeLfos(drone).map((x) => x.dest), ['cutoff', 'pan']);
  // instrument échantillonné : LFO disponibles aussi (cutoff, volume, pan, hauteur)
  const piano = SS.soundDefaults({ type: 'instrument', family: 'keys', instrument: 'piano' });
  assert.equal(piano.lfo2Dest, 'off');
  // quantité nulle ou destination inconnue : inactif
  assert.equal(SS.lfoOf({ lfo1Dest: 'cutoff', lfo1Amt: 0 }, 1), null);
  assert.equal(SS.lfoOf({ lfo1Dest: 'nimporte', lfo1Amt: 1 }, 1), null);
  assert.equal(SS.lfoOf({ lfo1Dest: 'cutoff', lfo1Amt: 1, lfo1Rate: '1/4' }, 1).rate, 'b1');
});

test('projet : les réglages LFO et PWM sont enregistrés et relus', () => {
  const sd = { wave: 'pulse', pw: 0.3, lfo1Dest: 'pw', lfo1Shape: 'smooth', lfo1Rate: 'b16', lfo1Mode: 'retrig', lfo1Amt: -0.4, lfo1Fade: 2.5, lfo2Dest: 'cutoff', lfo2Rate: 'n8d' };
  const data = {
    title: 'LFO', tempo: 100, bars: 2,
    tracks: [{ id: 'b1', type: 'instrument', name: 'Basse', category: 'mono', family: 'bass', instrument: 'syn_sawbass', events: [], sd }],
  };
  const back = SS.normalizeProject(JSON.parse(JSON.stringify(data)));
  const t2 = back.tracks.find((x) => x.name === 'Basse');
  assert.deepEqual(t2.sd, sd);
  const l = SS.activeLfos(SS.soundParams(t2));
  assert.equal(l.length, 2);
  assert.equal(l[0].mode, 'retrig');
  assert.equal(l[1].rate, 'n8d');
});

/* ---------- Phase 2 : automation du son (réglages « voice » de track.auto) ---------- */

test('automation du son : réglages proposés selon la piste', () => {
  const ids = (t) => SS.autoParamsFor(t).map((P) => P.id);
  assert.deepEqual(ids({ type: 'drum' }), ['filter', 'res', 'volume', 'reverb', 'echo', 'space']);
  assert.deepEqual(ids({ type: 'instrument', family: 'bass', instrument: 'syn_sawbass' }), ['filter', 'res', 'volume', 'reverb', 'echo', 'space', 'vcf', 'pw', 'fdecay', 'lfoamt']);
  // échantillon : pas de PWM ; Juno-106 : son réglé dans sa façade, pas de réglages « voice »
  assert.ok(!ids({ type: 'instrument', family: 'keys', instrument: 'piano' }).includes('pw'));
  assert.ok(ids({ type: 'instrument', family: 'keys', instrument: 'piano' }).includes('vcf'));
  const juno = SS.ANALOG_FAMILY.instruments[0].id;
  assert.ok(!ids({ type: 'instrument', family: 'analog', instrument: juno }).includes('vcf'));
});

test('automation du son : verrous lus au pas de la note, interpolés, absents sans courbe', () => {
  const t = { type: 'instrument' };
  assert.equal(SS.voiceLocks(t, 3, 16), null);
  SS.setAutoPoint(t, 'vcf', 0, -0.5);
  SS.setAutoPoint(t, 'vcf', 8, 0.5);
  SS.setAutoPoint(t, 'pw', 4, 0.2);
  SS.setAutoPoint(t, 'filter', 0, -0.3); // réglage de tranche : pas un verrou de note
  assert.deepEqual(SS.voiceLocks(t, 4, 16), { vcf: 0, pw: 0.2 });
  assert.deepEqual(SS.voiceLocks(t, 2, 16), { vcf: -0.25, pw: 0.2 });
  // valeurs bornées et conservées par le nettoyage
  SS.setAutoPoint(t, 'pw', 5, 3);
  assert.equal(t.auto.pw[5], 0.95);
  SS.cleanAuto(t, 16);
  assert.deepEqual(Object.keys(t.auto).sort(), ['filter', 'pw', 'vcf']);
});

test('automation du son : application aux réglages (cutoff en octaves, decay, PWM, LFO)', () => {
  const p = { cutoff: 500, fdecay: 0.2, decay: 0.3, pw: 0.5, lfo1Amt: 0.8, lfo2Amt: -0.4 };
  const q = SS.applyVoiceLocks(p, { vcf: 0.25, fdecay: 0.5, pw: 0.15, lfoamt: 1.5 });
  near(q.cutoff, 1000);
  near(q.fdecay, 0.4);
  assert.equal(q.pw, 0.15);
  assert.equal(q.lfo1Amt, 1); // borné à 1
  near(q.lfo2Amt, -0.6);
  assert.equal(p.cutoff, 500); // copie : le réglage d'origine ne change pas
  assert.equal(SS.applyVoiceLocks(p, null), p);
  assert.equal(SS.applyVoiceLocks({ cutoff: 8000 }, { vcf: 1 }).cutoff, 20000);
  assert.equal(SS.autoFormat('vcf', 0), 'Réglage du son');
  assert.equal(SS.autoFormat('vcf', 0.3), '+1,2 oct');
  assert.equal(SS.autoFormat('vcf', -0.5), '−2,0 oct');
  assert.equal(SS.autoFormat('fdecay', 0.5), '×2,00');
  assert.equal(SS.autoFormat('lfoamt', 1.25), '×1,25');
  assert.equal(SS.autoFormat('pw', 0.35), '35 %');
});

test('automation du son : formes toutes prêtes', () => {
  const t = {};
  SS.applyAutoShape(t, 'vcf', 'acid', 16, 4);
  assert.equal(t.auto.vcf[0], 0.35);
  assert.equal(t.auto.vcf[1], -0.25);
  assert.equal(t.auto.vcf[4], 0.35);
  SS.applyAutoShape(t, 'pw', 'sweep', 16, 4);
  assert.equal(t.auto.pw[0], 0.1);
  assert.equal(t.auto.pw[15], 0.9);
  for (const id of ['vcf', 'pw', 'fdecay', 'lfoamt']) assert.ok(SS.AUTO_SHAPES[id].length >= 2, id);
});
