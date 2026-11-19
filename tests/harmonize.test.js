/*
 * Harmoniser une mélodie (js/harmony.js : harmonize, noteRoles), sous-onglet « Harmoniser la mélodie » de l'étape Accords.
 *   node --test tests/harmonize.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js'].forEach((f) => require('../js/' + f));
const H = globalThis.SS.harmony;

const N = (step, len, midi) => ({ step, len, midi });
const AM = { tonic: 'A', mode: 'minor' };
// La mineur : La Do Mi | Ré Do Si | Do Si La | Sol♯ La
const MEL = [N(0, 4, 69), N(4, 4, 72), N(8, 8, 76), N(16, 4, 74), N(20, 4, 72), N(24, 8, 71), N(32, 8, 72), N(40, 4, 71), N(44, 4, 69), N(48, 8, 68), N(56, 8, 69)];
const names = (p) => p.chords.map((c) => c.name).join(' ');

test('trois propositions différentes, une grille qui couvre la scène, des explications', () => {
  const r = H.harmonize(AM, MEL, 64);
  assert.equal(r.length, 3);
  assert.equal(new Set(r.map((p) => JSON.stringify(p.grid))).size, 3);
  for (const p of r) {
    assert.equal(p.grid[0].step, 0);
    assert.equal(p.grid.reduce((s, g) => s + g.len, 0), 64);
    assert.ok(p.why.length >= 1 && p.title && p.numerals);
    assert.ok(p.tension >= 0 && p.tension <= 1 && p.color >= 0 && p.color <= 1);
  }
  assert.equal(r[0].title, 'Simple et chantante');
});

test('le Sol♯ appuyé appelle Mi majeur, emprunté et expliqué', () => {
  const r = H.harmonize(AM, MEL, 64);
  assert.ok(r.some((p) => p.chords[p.chords.length - 1].name === 'E'), r.map(names).join(' / '));
  const p = r.find((x) => x.why.some((t) => /mineur harmonique/.test(t)));
  assert.ok(p && p.why.some((t) => /Sol♯/.test(t)));
});

test('une scène de 16 mesures : une boucle de 4 mesures répétée (ou une grille libre)', () => {
  const long = [0, 64, 128, 192].flatMap((o) => MEL.map((x) => ({ ...x, step: x.step + o })));
  const r = H.harmonize(AM, long, 256);
  for (const p of r) {
    assert.equal(p.reps, 4);
    assert.ok(p.cycle.every((g) => g.step < 64));
    assert.equal(p.grid.reduce((s, g) => s + g.len, 0), 256);
  }
  const free = H.harmonize(AM, long, 256, { loop: 0 });
  assert.ok(free.every((p) => p.reps === 1));
});

test('rôle des notes : accord, tension, frottement, passage', () => {
  const grid = [{ step: 0, len: 64, degree: 0, type: 'min', acc: 0 }]; // La mineur tenu
  const roles = H.noteRoles(AM, grid, [N(0, 8, 69), N(8, 8, 71), N(16, 8, 68), N(24, 2, 70)]);
  assert.deepEqual(roles, ['chord', 'tension', 'clash', 'pass']);
});

test('pas assez de notes : rien à proposer', () => {
  assert.equal(H.harmonize(AM, [N(0, 4, 69)], 64), null);
});

test('« ✦ Proposer » : basse + mélodie → La mineur d’abord, puis une grille qui suit la basse', () => {
  const B = (step, len, midi) => ({ step, len, midi, bass: true });
  // basse La | Fa | Do | Sol, mélodie MEL
  const bass = [B(0, 16, 45), B(16, 16, 41), B(32, 16, 48), B(48, 16, 43)];
  const keys = H.suggestKeys([...bass, ...MEL]);
  assert.equal(keys.length, 3);
  assert.deepEqual(keys[0].key, AM);
  assert.ok(keys[0].pct > 0 && keys[0].why);
  const r = H.harmonize(AM, [...bass, ...MEL], 64, { slot: 16 });
  assert.deepEqual(r[0].chords.map((c) => c.rootPc), [9, 5, 0, 7], names(r[0]));
  assert.deepEqual(H.suggestKeys([]), []);
});
