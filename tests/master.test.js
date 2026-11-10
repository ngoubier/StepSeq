/*
 * Mastering (js/master-dsp.js) : processeur AudioWorklet testé sous Node avec un faux environnement.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/master-dsp.js');

const SR = 48000;
/** Instancie le processeur et traite un signal stéréo (Float32Array x2) par blocs de 128. */
function run(L, R, p = {}) {
  let Proc;
  const msgs = [];
  class AWP {
    constructor() {
      this.port = { postMessage: (m) => msgs.push(m), onmessage: null };
    }
  }
  SS.mastering._module({ sampleRate: SR, AudioWorkletProcessor: AWP, registerProcessor: (n, c) => (Proc = c) });
  const proc = new Proc();
  const params = {};
  for (const d of Proc.parameterDescriptors) params[d.name] = new Float32Array([p[d.name] ?? d.defaultValue]);
  const oL = new Float32Array(L.length);
  const oR = new Float32Array(L.length);
  for (let i = 0; i < L.length; i += 128) {
    const out = [new Float32Array(128), new Float32Array(128)];
    proc.process([[L.subarray(i, i + 128), R.subarray(i, i + 128)]], [out], params);
    oL.set(out[0].subarray(0, Math.min(128, L.length - i)), i);
    oR.set(out[1].subarray(0, Math.min(128, L.length - i)), i);
  }
  return { L: oL, R: oR, msgs };
}

const sine = (f, db, secs, phase = 0) => Float32Array.from({ length: Math.round(SR * secs) }, (_, i) => Math.pow(10, db / 20) * Math.sin((2 * Math.PI * f * i) / SR + phase));
const rms = (a, from = 0) => Math.sqrt(a.subarray(from).reduce((s, x) => s + x * x, 0) / (a.length - from));
const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

test('mesure : une sinusoïde 1 kHz à −23 dBFS sur les deux canaux lit −23 LUFS (EBU Tech 3341)', () => {
  const s = sine(1000, -23, 6);
  const { msgs } = run(s, s, { active: 0 });
  const last = msgs[msgs.length - 1];
  assert.ok(Math.abs(last.i + 23) < 0.2, `intégré ${last.i}`);
  assert.ok(Math.abs(last.m + 23) < 0.2, `momentané ${last.m}`);
});

test('limiteur : aucune crête au-dessus du plafond, gain réduit seulement quand il le faut', () => {
  const s = sine(220, -3, 2);
  const { L, msgs } = run(s, s, { drive: 9, ceiling: -1, mono: 0 });
  assert.ok(peak(L) <= Math.pow(10, -1 / 20) + 1e-6, `crête ${peak(L)}`);
  assert.ok(msgs.some((m) => m.gr > 6), 'réduction de gain affichée');
  // avec l'écrêteur doux et beaucoup de gain : toujours sous le plafond
  const c = run(s, s, { drive: 14, ceiling: -1, mono: 0, clip: 1 });
  assert.ok(peak(c.L) <= Math.pow(10, -1 / 20) + 1e-6, `crête avec écrêteur ${peak(c.L)}`);
  const quiet = sine(220, -30, 1);
  const q = run(quiet, quiet, { ceiling: -1, mono: 0 });
  assert.ok(Math.abs(rms(q.L, 4800) - rms(quiet, 4800)) < 1e-3, 'signal faible : transparent');
});

test('graves en mono : un 50 Hz en opposition de phase disparaît, un 2 kHz reste stéréo ; réponse plate', () => {
  const l = sine(50, -12, 1);
  const r = sine(50, -12, 1, Math.PI);
  const o = run(l, r, { mono: 120 });
  assert.ok(rms(o.L, 24000) < 0.05 * rms(l), 'basses en opposition annulées (mono)');
  const hi = run(sine(2000, -12, 1), sine(2000, -12, 1, Math.PI), { mono: 120 });
  assert.ok(Math.abs(rms(hi.L, 24000) / rms(sine(2000, -12, 1)) - 1) < 0.03, 'aigus intacts');
  for (const f of [60, 120, 250, 1000]) {
    const s = sine(f, -12, 1);
    const o2 = run(s, s, { mono: 120 });
    assert.ok(Math.abs(rms(o2.L, 24000) / rms(s, 24000) - 1) < 0.03, `réponse plate à ${f} Hz`);
  }
});
