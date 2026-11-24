/*
 * Section de cuivres de l'assistant (js/horns.js) : formations, jeux, recalcul sur les accords d'une scène.
 */
const test = require('node:test');
const assert = require('node:assert');
globalThis.window = globalThis;
require('../js/horns.js');
const H = SS.horns;

// Fa, Sol, La mineur, La mineur : une mesure de 4/4 chacun
const SPANS = [[0, 5, [5, 9, 0]], [16, 7, [7, 11, 2]], [32, 9, [9, 0, 4]], [48, 9, [9, 0, 4]]].map(([step, rootPc, pcs]) => ({ step, len: 16, rootPc, pcs }));

test('dix formations, quatre jeux chacune, des musiciens dans leur tessiture', () => {
  assert.strictEqual(H.FORMS.length, 10);
  H.FORMS.forEach((f) => {
    assert.strictEqual(H.jeux(f.id).length, 4);
    f.players.forEach((p) => assert.ok(H.INST[p.i], `${f.id} ${p.id}`));
    H.JEUX.forEach((j) => [true, false].forEach((model) => {
      const r = H.write({ form: f.id, jeu: j, spans: SPANS, bars: 4, model });
      Object.entries(r.lines).forEach(([id, L]) => {
        const p = H.players(f.id).find((x) => x.id === id);
        L.events.forEach((e) => {
          assert.ok(e.step >= 0 && e.step < 64 && e.len >= 1, `${f.id} ${j} ${id} pas ${e.step}`);
          assert.ok(e.notes[0] >= p.lo && e.notes[0] <= p.hi, `${f.id} ${j} ${id} note ${e.notes[0]}`);
          assert.ok(e.vel > 0 && e.vel <= 1);
        });
      });
    }));
  });
});

test('le jeu du style, dans la grille du modèle : les notes du fichier', () => {
  const r = H.write({ form: 'funk', jeu: 'sig', bars: 1, model: true });
  assert.deepStrictEqual(r.lines.tp.events.map((e) => [e.step, e.notes[0], e.len]), [[2, 72, 1], [7, 67, 1], [10, 75, 2], [15, 72, 1]]);
  assert.deepStrictEqual(r.lines.bs.events.map((e) => e.notes[0]), [53, 48, 53, 48]);
});

test('sur les accords de la scène : même degré, même registre', () => {
  const r = H.write({ form: 'funk', jeu: 'sig', spans: SPANS, bars: 4 });
  // Fa9 → Fa : identique ; → Sol : un ton plus haut (la 7e mineure du modèle reste sur un accord parfait)
  assert.deepStrictEqual(r.lines.tp.events.slice(0, 8).map((e) => e.notes[0]), [72, 67, 75, 72, 74, 69, 77, 74]);
  // la mineur : la gamme de l'accord (tierce mineure)
  assert.deepStrictEqual(r.lines.tp.events.slice(8, 12).map((e) => e.notes[0] % 12), [4, 11, 7, 4]);
});

test('swing du big band : le « et » aux deux tiers du temps', () => {
  const e = H.write({ form: 'bigband', jeu: 'sig', bars: 1, model: true }).lines.as.events;
  assert.deepStrictEqual([e[1].step, e[1].shift], [3, -0.333]);
});

test('tenues : une par accord ; coupés : rien ; nuance', () => {
  const r = H.write({ form: 'soul', jeu: 'ten', spans: SPANS, bars: 4, off: ['ts'], nuance: 'p' });
  assert.strictEqual(r.lines.tp.events.length, 4);
  assert.strictEqual(r.lines.ts.events.length, 0);
  assert.ok(r.lines.tp.events.every((e) => e.len >= 14));
  assert.deepStrictEqual(H.offByDefault('soul'), ['tb']);
});

test('doublures et clés de piste', () => {
  const ps = H.players('salsa', ['sb', 'tp']);
  assert.deepStrictEqual(ps.map((p) => p.key), ['salsa-t1', 'salsa-t2', 'salsa-b1', 'salsa-b2', 'salsa-a1_sb', 'salsa-a2_tp']);
  assert.deepStrictEqual(H.fromKeys(ps.map((p) => p.key)), { form: 'salsa', add: ['sb', 'tp'], ids: ['t1', 't2', 'b1', 'b2', 'a1', 'a2'] });
  const r = H.write({ form: 'salsa', add: ['sb'], jeu: 'sig', bars: 2, model: true });
  assert.ok(r.lines.a1.events.length > 0);
});

test('jeu proposé selon la scène, formation selon le style', () => {
  assert.deepStrictEqual(['intro', 'verse', 'chorus', 'bridge', 'outro'].map(H.defaultJeu), ['ten', 'coups', 'sig', 'uni', 'coups']);
  // jeu écrit par le modèle de chanson, sinon celui du nom de la scène
  assert.equal(H.sceneJeu('chorus', 'coups'), 'coups');
  assert.equal(H.sceneJeu('chorus', 'brass-clave'), 'sig');
  assert.strictEqual(H.formFor('latin'), 'salsa');
  assert.strictEqual(H.formFor('synthwave'), 'funk');
});
