/*
 * Accent des notes (ev.acc) et sous-oscillateur : réglages de la note accentuée, mémoire des accents,
 * enregistrement dans le projet, export MIDI (vélocité), réglages par défaut.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'dirt-tuning.js', 'modulation.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'midi-file.js', 'midi.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('accent : nettoyage (présent seulement si vrai)', () => {
  assert.deepEqual(SS.cleanAccent({ step: 0, acc: 1 }), { step: 0, acc: true });
  assert.deepEqual(SS.cleanAccent({ step: 0, acc: false }), { step: 0 });
  assert.deepEqual(SS.cleanAccent({ step: 0 }), { step: 0 });
});

test('accent : note plus forte, filtre plus ouvert et plus résonant, qui retombe', () => {
  const p = { env: 0, q: 2, gain: 1, fdecay: 0.4, fsustain: 0.7, cutoff: 300 };
  const { p: q, vel } = SS.accentParams(p, 0.6, 1, 0);
  assert.ok(q.env > 1 && q.q > p.q && q.gain > 1 && vel > 0.6, JSON.stringify(q));
  assert.equal(q.fsustain, 0); // sans enveloppe d'origine : le filtre redescend au cutoff après le « coup »
  assert.ok(q.fdecay < p.fdecay);
  assert.equal(p.env, 0); // copie
  // accents rapprochés : la mémoire chargée pousse plus loin le filtre et la résonance
  const charged = SS.accentParams(p, 0.6, 1, 0.9).p;
  assert.ok(charged.env > q.env + 1 && charged.q > q.q);
  // force nulle : rien ne change
  const none = SS.accentParams(p, 0.6, 0, 1);
  assert.equal(none.p, p);
  assert.equal(none.vel, 0.6);
  assert.ok(SS.accentParams({ q: 29 }, 1, 1, 1).p.q <= 30);
  assert.equal(SS.accentParams(p, 1, 1).vel, 1);
});

test('accent et sous-oscillateur : réglages par défaut, presets', () => {
  const d = SS.soundDefaults({ type: 'instrument', family: 'bass', instrument: 'syn_sawbass' });
  assert.deepEqual([d.accent, d.sub, d.subOct], [0.6, 0, 1]);
  const acid = SS.soundParams({ type: 'instrument', family: 'bass', instrument: 'syn_acidsub' });
  assert.deepEqual([acid.accent, acid.sub, acid.subOct], [0.8, 0.55, 1]);
  const tech = SS.soundParams({ type: 'instrument', family: 'bass', instrument: 'syn_techsub' });
  assert.equal(tech.subOct, 2);
  // instrument échantillonné : accent oui (filtre et volume), pas de VCO donc pas de sous-oscillateur utile
  assert.equal(SS.soundDefaults({ type: 'instrument', family: 'keys', instrument: 'piano' }).accent, 0.6);
});

test('accent : enregistré dans le projet et exporté en MIDI avec une vélocité plus forte', () => {
  const p = SS.newProject();
  p.tempo = 120;
  const t = SS.newTrack({ type: 'instrument', category: 'mono', family: 'bass', instrument: 'syn_acidsub', name: 'Acid' }, p);
  t.events = [
    { step: 0, len: 1, notes: [36], vel: 0.6, acc: true },
    { step: 2, len: 1, notes: [36], vel: 0.6 },
  ];
  p.tracks.push(t);
  const back = SS.normalizeProject(JSON.parse(JSON.stringify(p)));
  const evs = back.tracks.find((x) => x.name === 'Acid').events;
  assert.equal(evs[0].acc, true);
  assert.equal('acc' in evs[1], false);
  const { bytes } = SS.midi.exportProject(back, { range: 'scene', loops: 1, swing: false });
  const m = SS.midiFile.parse(bytes);
  const ons = m.tracks.flatMap((x) => x.filter((e) => e.type === 'note' && !e.off));
  assert.equal(ons.length, 2);
  const [a, b] = ons.sort((x, y) => x.tick - y.tick);
  assert.ok(a.vel > b.vel + 15, `accent ${a.vel} contre ${b.vel}`);
  assert.equal(a.vel, Math.round(SS.accentVel(0.6) * 127));
});
