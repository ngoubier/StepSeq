/*
 * Juno-106 : voix inaudibles arrêtées et filtre allégé (Options › Son).
 *   node --test
 * Le processeur juno106 (js/juno-dsp.js) est exécuté ici sans navigateur, avec un faux AudioWorkletProcessor.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let Proc;
globalThis.sampleRate = 48000;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = { postMessage() {} };
  }
};
globalThis.registerProcessor = (name, cls) => {
  if (name === 'juno106') Proc = cls;
};
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'juno-dsp.js'), 'utf8').replace(/window\.SS[\s\S]*$/, '');
(0, eval)(src + '\njunoDspModule(globalThis);');

// patchs proches de ceux de l'assistant (synthwave) : basse percussive (maintien 0), nappe tenue
const BASS = { lfoRate: 0.46, lfoDelay: 0.13, range: 4, dcoLfo: 0, pwm: 0.45, pwmMode: 'man', pulse: true, saw: false, sub: 0.8, noise: 0, hpf: 0, vcfFreq: 0.25, vcfRes: 0, envPol: 1, vcfEnv: 0.52, vcfLfo: 0, kybd: 0.28, vcaMode: 'env', vcaLevel: 0.59, attack: 0, decay: 0.27, sustain: 0, release: 0.28, chorus: 0, tune: 0.5 };
const PAD = { ...BASS, range: 8, saw: true, sub: 0, vcfFreq: 0.56, vcfRes: 0.6, vcfEnv: 0, attack: 0.3, decay: 0.24, sustain: 1, release: 0.35, chorus: 2 };

function play(params, { seconds = 2, notes = [[48, 0, 1]], light = false } = {}) {
  globalThis.currentFrame = 0;
  const p = new Proc({ processorOptions: {} });
  p.onMessage({ type: 'params', p: params });
  if (light) p.onMessage({ type: 'lightVcf', on: true });
  let id = 0;
  for (const [midi, t, d] of notes) {
    p.onMessage({ type: 'on', id: ++id, midi, vel: 0.8, time: t });
    p.onMessage({ type: 'off', id, time: t + d });
  }
  const N = 128;
  const out = [[new Float32Array(N), new Float32Array(N)]];
  const l = [];
  const busy = [];
  for (let b = 0; b < (seconds * 48000) / N; b++) {
    p.process([], out);
    l.push(...out[0][0]);
    busy.push(p.voices.filter((v) => v.busy()).length);
    globalThis.currentFrame += N;
  }
  return { l: Float32Array.from(l), busy, p };
}
const rms = (a, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

test('voix inaudible : une note qui s’éteint libère sa voix bien avant la fin du relâchement', () => {
  // basse percussive tenue 3 s : déclin vers un maintien nul, la voix ne doit pas calculer pendant 3 s
  const r = play(BASS, { seconds: 3, notes: [[36, 0, 3]] });
  const lastBusy = r.busy.lastIndexOf(1) * 128 / 48000;
  assert.ok(lastBusy < 1.5, `voix libérée à ${lastBusy.toFixed(2)} s`);
  assert.ok(rms(r.l, 0, 4800) > 0.01, 'la note sonne bien au début');
});

test('voix inaudible : une note tenue (maintien à fond) n’est jamais coupée', () => {
  const r = play(PAD, { seconds: 2, notes: [[60, 0, 2]] });
  assert.ok(r.busy.slice(-10).every((n) => n === 1), 'voix toujours active');
  assert.ok(rms(r.l, 48000 * 1.5, 48000 * 2) > 0.01, 'la nappe sonne encore');
});

test('filtre allégé : même niveau et même couleur, son pas identique', () => {
  const notes = [[48, 0, 1.5], [55, 0, 1.5], [60, 0, 1.5], [63, 0, 1.5]];
  const a = play(PAD, { notes });
  const b = play(PAD, { notes, light: true });
  const ra = rms(a.l), rb = rms(b.l);
  assert.ok(ra > 0.01 && rb > 0.01);
  const db = 20 * Math.log10(rb / ra);
  assert.ok(Math.abs(db) < 1.5, `écart de niveau ${db.toFixed(2)} dB`);
  let d = 0;
  for (let i = 0; i < a.l.length; i++) d = Math.max(d, Math.abs(a.l[i] - b.l[i]));
  assert.ok(d > 1e-4, 'le filtre allégé est bien utilisé');
  assert.ok(b.p.voices.every((v) => v.vcf.light), 'réglage transmis à toutes les voix');
});
