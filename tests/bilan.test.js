/*
 * Bilan d'écoute (js/bilan.js) : bandes grave / médium / aigu, basse sur la grosse caisse, passages, conseils.
 * Le rendu lui-même est testé de bout en bout : node tests/e2e/claude-tools.js
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'sounds.js', 'harmony.js', 'project.js', 'render.js', 'bilan.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const B = SS.bilan;
const sr = 44100;
const sine = (n, f, amp) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));

test('bands : un sinus grave, médium ou aigu tombe dans sa bande', () => {
  const n = sr;
  for (const [f, k] of [[60, 'grave'], [1000, 'medium'], [9000, 'aigu']]) {
    const x = sine(n, f, 0.5);
    const b = B.bands(x, x, sr);
    assert.ok(b[k] > 0.9, `${f} Hz → ${k} (${JSON.stringify(b)})`);
  }
});

test('kickBassOverlap : basse tenue sur les coups = couverte, basse entre les coups = libre', () => {
  const kick = Float64Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? 1 : 0.01));
  const under = Float64Array.from({ length: 100 }, () => 0.5);
  const between = Float64Array.from({ length: 100 }, (_, i) => (i % 10 === 5 ? 0.5 : 0));
  assert.equal(B.kickBassOverlap(kick, under), 1);
  assert.equal(B.kickBassOverlap(kick, between), 0);
  assert.equal(B.kickBassOverlap(new Float64Array(10), under), null);
});

test('passages : chaque répétition est un passage, à son tempo', () => {
  const p = SS.newProject();
  p.tempo = 120;
  p.scenes[0].bars = 2;
  p.bars = 2;
  p.scenes.push({ id: 'b', name: 'Refrain', bars: 4, data: {} });
  const ps = B.passages(p, [{ scene: p.scenes[0].id, repeat: 2 }, { scene: 'b', repeat: 1 }]);
  assert.deepEqual(ps.map((x) => [x.nom, x.debut, x.fin]), [[`${p.scenes[0].name}`, 0, 4], [`${p.scenes[0].name} 2`, 4, 8], ['Refrain', 8, 16]]);
});

test('conseils : trop fort, basse sur le kick, chanson plate', () => {
  const c = B.conseils({ master: { lufs: -6, crete: 0.2, equilibre: { grave: 0.5, medium: 0.4, aigu: 0.1 } }, basseSurKick: 0.7, passages: [{ lufs: -10 }, { lufs: -10.5 }, { lufs: -10.2 }], musiciens: [] });
  assert.ok(c.some((x) => /très fort/.test(x)));
  assert.ok(c.some((x) => /dBTP/.test(x)));
  assert.ok(c.some((x) => /grosse caisse/.test(x)));
  assert.ok(c.some((x) => /plate/.test(x)));
  assert.deepEqual(B.conseils({ master: { lufs: -12, crete: -1.5, equilibre: { grave: 0.6, medium: 0.35, aigu: 0.05 } }, basseSurKick: 0.2, passages: [{ lufs: -16 }, { lufs: -12 }, { lufs: -10 }], musiciens: [] }), []);
});
