/*
 * Bloc Bruit du VCO : le bruit est une source mélangée à l'oscillateur, plus une forme d'onde — sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/library.js');
require('../js/dirt.js');
require('../js/sample-tuning.js');
require('../js/sounds.js');
require('../js/juno.js');
require('../js/arp.js');
require('../js/modulation.js');
require('../js/project.js');

const synth = (instrument, sd) => ({ id: 't' + instrument, type: 'instrument', name: instrument, category: 'mono', family: 'fx', instrument, octave: 3, events: [], ...(sd ? { sd } : {}) });

test('formes d’onde : plus de bruit ; trois couleurs de bruit', () => {
  assert.ok(!SS.WAVES.some((w) => SS.NOISES.includes(w.id)));
  assert.deepEqual(SS.NOISES, ['white', 'pink', 'brown']);
});

test('presets : oscillateur à fond et pas de bruit par défaut ; Wind = bruit rose seul', () => {
  const saw = SS.soundParams({ ...synth('syn_sawbass'), family: 'bass' });
  assert.equal(saw.osc, 1);
  assert.equal(saw.noise, 0);
  const wind = SS.soundParams(synth('syn_wind'));
  assert.equal(wind.osc, 0);
  assert.equal(wind.noise, 1);
  assert.equal(wind.noiseColor, 'pink');
  assert.ok(!SS.NOISES.includes(wind.wave));
});

test('ancienne onde de bruit dans track.sd : lue comme oscillateur coupé + bruit à fond', () => {
  const p = SS.soundParams({ ...synth('syn_sawbass', { wave: 'brown', cutoff: 400 }), family: 'bass' });
  assert.equal(p.osc, 0);
  assert.equal(p.noise, 1);
  assert.equal(p.noiseColor, 'brown');
  assert.equal(p.cutoff, 400);
});

test('ouverture d’une chanson version 2 : migration des réglages de bruit', () => {
  const data = {
    format: 'stepseq', version: 2, title: 'Ancien', tempo: 120, timeSig: [4, 4], bars: 1,
    tracks: [
      { ...synth('syn_sawbass', { wave: 'white' }), id: 'a', family: 'bass' },
      { ...synth('syn_wind', { wave: 'sine' }), id: 'b' }, // onde choisie sur un preset de bruit : l'oscillateur seul
      { ...synth('syn_wind', { cutoff: 900 }), id: 'c' },
    ],
  };
  const p = SS.normalizeProject(data);
  assert.equal(p.version, 3);
  const [a, b, c] = p.tracks;
  assert.deepEqual({ osc: a.sd.osc, noise: a.sd.noise, color: a.sd.noiseColor, wave: a.sd.wave }, { osc: 0, noise: 1, color: 'white', wave: undefined });
  const pb = SS.soundParams(b);
  assert.deepEqual([pb.wave, pb.osc, pb.noise], ['sine', 1, 0]);
  const pc = SS.soundParams(c);
  assert.deepEqual([pc.osc, pc.noise, pc.noiseColor, pc.cutoff], [0, 1, 'pink', 900]);
});

test('chanson version 3 : rien n’est converti (onde choisie sur Wind = choix actuel)', () => {
  const data = { format: 'stepseq', version: 3, title: 'Neuf', tempo: 120, timeSig: [4, 4], bars: 1, tracks: [{ ...synth('syn_wind', { wave: 'sine' }), id: 'b' }] };
  const p = SS.normalizeProject(data);
  assert.equal(p.tracks[0].sd.osc, undefined);
  assert.equal(SS.soundParams(p.tracks[0]).osc, 0);
});
