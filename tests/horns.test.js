/*
 * Section de cuivres de l'assistant (js/horns.js) : formations, jeux, recalcul sur les accords d'une scène.
 */
const test = require('node:test');
const assert = require('node:assert');
globalThis.window = globalThis;
require('../js/horns-motifs.js');
require('../js/horns.js');
const H = SS.horns;

// Fa, Sol, La mineur, La mineur : une mesure de 4/4 chacun
const SPANS = [[0, 5, [5, 9, 0]], [16, 7, [7, 11, 2]], [32, 9, [9, 0, 4]], [48, 9, [9, 0, 4]]].map(([step, rootPc, pcs]) => ({ step, len: 16, rootPc, pcs }));

test('dix formations, treize jeux et cinq motifs du fichier chacune, des musiciens dans leur tessiture', () => {
  assert.strictEqual(H.FORMS.length, 10);
  H.FORMS.forEach((f) => {
    assert.strictEqual(H.jeux(f.id).length, 18);
    assert.ok(H.jeux(f.id).every((j) => j.label && j.text && H.FAMS.some(([id]) => id === j.fam)));
    f.players.forEach((p) => assert.ok(H.INST[p.i], `${f.id} ${p.id}`));
    H.jeux(f.id).map((x) => x.id).forEach((j) => [true, false].forEach((model) => {
      const r = H.write({ form: f.id, jeu: j, spans: SPANS, bars: 4, model });
      assert.ok(Object.values(r.lines).some((L) => L.events.length), `${f.id} ${j} : des notes`);
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
  assert.deepStrictEqual(['intro', 'verse', 'pre', 'chorus', 'bridge', 'outro'].map((s) => H.defaultJeu(s)), ['swell', 'antic', 'montee', 'sig', 'uni', 'fin']);
  assert.deepStrictEqual(H.sceneStars('chorus2'), ['sig', 'rep', 'coups']);
  assert.ok(['intro', 'verse', 'pre', 'chorus', 'bridge', 'outro'].every((s) => H.sceneStars(s).every((j) => H.JEUX.includes(j))));
  // jeu écrit par le modèle de chanson, sinon celui du nom de la scène
  assert.equal(H.sceneJeu('chorus', 'coups'), 'coups');
  assert.equal(H.sceneJeu('chorus', 'brass-clave'), 'sig');
  assert.strictEqual(H.formFor('latin'), 'salsa');
  assert.strictEqual(H.formFor('synthwave'), 'funk');
});

test('noms du style : Moña et Cierre en salsa, Shout final en big band', () => {
  const lab = (f, id) => H.jeux(f).find((j) => j.id === id).label;
  assert.deepStrictEqual([lab('salsa', 'rep'), lab('salsa', 'fin'), lab('bigband', 'fin'), lab('funk', 'rep')], ['Moña', 'Cierre', 'Shout final', 'Question-réponse']);
});

test('transitions et fins : écrites sur toute la scène', () => {
  const end = (j, f = 'funk') => H.write({ form: f, jeu: j, spans: SPANS, bars: 4 }).lines;
  // coup d'arrêt : un seul coup, sur le 1
  assert.deepStrictEqual(end('break').tp.events.map((e) => e.step), [0]);
  // fin : le jeu du style trois mesures, puis trois coups dans la dernière, le dernier tenu
  const fin = end('fin').tp.events.filter((e) => e.step >= 48);
  assert.deepStrictEqual(fin.map((e) => e.step), [48, 54, 60]);
  assert.ok(fin[2].len >= 4);
  // montée : tenues qui enflent (courbe de volume), puis huit croches qui montent
  const m = end('montee').tp;
  const up = m.events.filter((e) => e.step >= 48).map((e) => e.notes[0]);
  assert.strictEqual(up.length, 8);
  assert.ok(up.every((n, i) => !i || n > up[i - 1]), up.join(' '));
  assert.ok(m.vol && Object.keys(m.vol).length >= 4);
});

test('question-réponse, coups anticipés, nappe douce', () => {
  const r = H.write({ form: 'funk', jeu: 'rep', spans: SPANS, bars: 4 }).lines;
  // le dessus lance (mesures 1 et 3), la section répond (mesures 2 et 4)
  assert.deepStrictEqual([...new Set(r.tp.events.map((e) => Math.floor(e.step / 16)))], [0, 2]);
  assert.deepStrictEqual([...new Set(r.ts.events.map((e) => Math.floor(e.step / 16)))], [1, 3]);
  // big band : les saxes lancent, les cuivres répondent
  const bb = H.write({ form: 'bigband', jeu: 'rep', bars: 2, model: true }).lines;
  assert.ok(bb.as.events.every((e) => e.step < 16) && bb.t1.events.every((e) => e.step >= 16));
  // anticipé : le coup du 4& de la mesure 1 prend déjà l'accord de la mesure 2 (Sol : si, ré ou sol…)
  const a = H.write({ form: 'funk', jeu: 'antic', spans: SPANS, bars: 4 }).lines.tp.events.find((e) => e.step === 14);
  assert.ok([7, 11, 2, 5, 9, 0, 4].includes(a.notes[0] % 12) && a.len > 2);
  assert.strictEqual(H.write({ form: 'funk', jeu: 'pad', spans: SPANS, bars: 4 }).lines.tp.events.length, 0);
});

test('les 50 motifs du fichier : cinq par formation, joués par chaque musicien', () => {
  assert.strictEqual(H.MOTIFS.length, 50);
  H.FORMS.forEach((f) => assert.strictEqual(H.MOTIFS.filter((m) => m.form === f.id).length, 5, f.id));
  // motif 11 (funk) dans la grille du modèle : les notes du fichier, trompette et baryton
  const r = H.write({ form: 'funk', jeu: 'm11', bars: 1, model: true }).lines;
  assert.deepStrictEqual(r.tp.events.map((e) => [e.step, e.notes[0]]), [[1, 72], [7, 67], [10, 75], [13, 72]]);
  assert.deepStrictEqual(r.bs.events.map((e) => e.notes[0]), [53, 53, 48, 53]);
  // disco : la formation n'a pas d'alto, son ténor double la partie la plus proche ; tout le monde joue
  const d = H.write({ form: 'disco', jeu: 'm16', spans: SPANS, bars: 4 }).lines;
  assert.ok(Object.values(d).every((L) => L.events.length === 12));
  // une fin du fichier (25, salsa) : le jeu du style, puis le motif sur les deux dernières mesures
  const s = H.write({ form: 'salsa', jeu: 'm25', bars: 4, model: true }).lines.t1.events;
  assert.deepStrictEqual(s.filter((e) => e.step >= 32).map((e) => e.notes[0]), [70, 72, 71]);
  assert.ok(s.some((e) => e.step < 32));
  // un motif d'une autre formation : le jeu du style
  assert.deepStrictEqual(H.write({ form: 'funk', jeu: 'm21', bars: 1, model: true }).lines.tp.events.map((e) => e.notes[0]), [72, 67, 75, 72]);
});

test('★ : les motifs du fichier conseillés pour la scène passent en tête', () => {
  assert.deepStrictEqual(H.sceneStars('verse', 'funk'), ['m13', 'antic', 'contre', 'temps']);
  assert.deepStrictEqual(H.sceneStars('chorus', 'salsa'), ['sig', 'm21', 'm22', 'rep', 'coups']);
  assert.equal(H.defaultJeu('outro', 'salsa'), 'm25');
  assert.equal(H.sceneJeu('outro', 'fin', 'salsa'), 'fin');
  assert.equal(H.sceneJeu('verse', 'm21', 'funk'), 'm13');
});

test('dans la tonalité : aucune note hors de la gamme de l’accord, pas de tenue qui frotte', () => {
  const pc = (m) => ((m % 12) + 12) % 12;
  const semi = (a, b) => pc(a - b) === 1 || pc(b - a) === 1;
  // la mineur : Am F C G, puis i iv V7 iv deux accords par mesure (Mi7 : sol dièse)
  const T = { m: [0, 3, 7], M: [0, 4, 7], 7: [0, 4, 7, 10] };
  const grids = [[[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']], [[9, 'm'], [2, 'm'], [4, '7'], [2, 'm']]];
  const KEY = [9, 11, 0, 2, 4, 5, 7];
  grids.forEach((g, gi) => {
    const len = gi ? 8 : 16;
    const spans = Array.from({ length: 64 / len }, (_, i) => ({ step: i * len, len, rootPc: g[i % 4][0], pcs: T[g[i % 4][1]].map((x) => pc(g[i % 4][0] + x)) }));
    H.FORMS.forEach((f) => H.jeux(f.id).forEach((j) => {
      const r = H.write({ form: f.id, jeu: j.id, spans, bars: 4, key: KEY });
      Object.entries(r.lines).forEach(([id, L]) => L.events.forEach((e) => {
        const sp = spans.find((s) => e.step >= s.step && e.step < s.step + s.len);
        const n = pc(e.notes[0]);
        if (sp.pcs.includes(n)) return;
        assert.ok(KEY.includes(n), `${f.id} ${j.id} ${id} pas ${e.step} : ${n} hors tonalité`);
        assert.ok(e.len < 4 || !sp.pcs.some((t) => semi(n, t)), `${f.id} ${j.id} ${id} pas ${e.step} : ${n} tenu frotte`);
      }));
    }));
  });
});
