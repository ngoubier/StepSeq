const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function load(file, SS = {}, extra = {}) {
  const context = vm.createContext({ window: null, SS, console, ...extra });
  context.window = context;
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return context.SS;
}

test('Auto Mix : longue écoute à mémoire constante, quantiles et crêtes conservés', () => {
  const A = load('js/automix.js').automix;
  const acc = A.newAccumulator();
  const bands = new Float64Array(A.BANDS.length).fill(0.001);
  const levels = Array.from({ length: 1000 }, (_, i) => -45 + ((i * 37) % 1000) / 30);
  const frame = { dt: 0.1, tracks: { bass: { bands, peak: 0.5, inPeak: 0.5, inMs: 0.01 } }, pre: { bands, peak: 0.5 }, loud: { m: -14, s: -14, fresh: true } };
  const bytes = () => [acc.ms, acc.ss, acc.mix.peaks, acc.tracks.bass.inPeaks].reduce((n, h) => n + h.counts.byteLength + h.sums.byteLength + h.powers.byteLength, 0);
  A.accumulate(acc, frame);
  const initial = bytes();
  for (let i = 1; i < 100000; i++) {
    frame.loud.m = levels[i % levels.length];
    frame.loud.s = levels[i % levels.length];
    frame.tracks.bass.inPeak = i === 90000 ? 0.99 : 0.5;
    A.accumulate(acc, frame);
  }
  assert.equal(bytes(), initial);
  assert.equal(acc.ms.count, 100000);
  assert.ok(Math.abs(A.integrated(acc.ms) - A.integrated(levels)) < 0.1);
  assert.ok(Math.abs(A.loudnessRange(acc.ss) - A.loudnessRange(levels)) < 0.11);
  const summary = A.summarize(acc);
  assert.ok(Number.isFinite(summary.mix.prePeak));
  assert.ok(Math.abs(summary.tracks.bass.inPeak - 20 * Math.log10(0.99)) < 1e-9);
});

test('Écoute mobile : analyse à 10 Hz et libération des pistes retirées', () => {
  const intervals = [], nodes = [];
  const node = () => {
    const n = { connections: new Set(), connect(dst) { this.connections.add(dst); return dst; }, disconnect(dst) { if (dst) this.connections.delete(dst); else this.connections.clear(); } };
    nodes.push(n);
    return n;
  };
  const ctx = { createAnalyser: node, createChannelSplitter: node, createBiquadFilter: () => ({ ...node(), frequency: {} }) };
  const source = node(), input = node();
  const taps = { ctx, pre: node(), post: node(), tracks: new Map([['bass', source]]), inputs: new Map([['bass', input]]) };
  const SS = { audio: { taps: () => taps, ensureCtx() {} }, automix: { newAccumulator: () => ({}) } };
  const L = load('js/automix-listen.js', SS, { matchMedia: () => ({ matches: true }), setInterval: (fn, ms) => (intervals.push(ms), 1), clearInterval() {} }).automixListen;
  L.start(() => ({ tracks: [] }));
  assert.deepEqual(intervals, [100]);
  assert.equal(source.connections.size, 1);
  assert.equal(input.connections.size, 1);
  taps.tracks.clear(); taps.inputs.clear();
  L.connect();
  assert.equal(source.connections.size, 0);
  assert.equal(input.connections.size, 0);
  L.stop();
  assert.ok(nodes.every(n => !n.connections.size), 'aucun branchement résiduel après fermeture');
});
