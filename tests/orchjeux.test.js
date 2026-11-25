/*
 * Jeux de cordes de l'Orchestre (js/orchjeux.js) : treize jeux, ★ par scène, pupitres d'articulation.
 *   node --test tests/orchjeux.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/sounds.js');
require('../js/orchestra.js');
require('../js/horns-motifs.js');
require('../js/horns.js');
require('../js/orchjeux.js');
const O = globalThis.SS.orchestra;
const J = globalThis.SS.orchJeux;

// Am | F | C | G, une mesure chacun (fondamentale d'abord)
const SPANS = [[9, 0, 4], [5, 9, 0], [0, 4, 7], [7, 11, 2]].map((pcs, i) => ({ step: i * 16, len: 16, pcs }));
const C_MAJ = [0, 2, 4, 5, 7, 9, 11];
const run = (ens, jeu, extra = {}) => {
  const parts = O.ENS[ens].parts;
  const res = O.orchestrate({ parts, spans: SPANS, melody: [], level: 'mid', ...extra });
  return J.apply(res, { parts, jeu, spans: SPANS, level: 'mid', scale: C_MAJ, ...extra });
};

test('treize jeux en quatre familles, plus l’orchestration ; ★ par effectif et type de scène', () => {
  assert.equal(J.JEUX.filter((j) => j.id !== 'orch').length, 13);
  for (const j of J.JEUX) assert.ok(J.FAMS.some(([f]) => f === j.fam), j.id);
  for (const e of O.ENSEMBLES.filter((x) => x.strings)) for (const k of ['intro', 'verse', 'pre', 'chorus', 'bridge', 'outro']) assert.ok(J.STARS[e.id][k].every((id) => J.JEU[id]), `${e.id} ${k}`);
  assert.deepEqual(J.stars('chorus', 'disco'), ['unisson', 'trait', 'coups']);
  assert.equal(J.autoJeu('verse', 'cpop'), 'pizz');
  assert.equal(J.autoJeu('verse', 'romantique'), 'orch', 'les autres effectifs gardent l’orchestration d’office');
});

test('chaque jeu, chaque effectif, chaque mesure : des notes dans la tessiture de la piste, dans la scène', () => {
  for (const [spb, beat] of [[16, 4], [12, 4], [12, 6], [24, 6]]) {
    const sp = [[9, 0, 4], [5, 9, 0], [0, 4, 7]].map((pcs, i) => ({ step: i * spb, len: spb, pcs }));
    for (const e of O.ENSEMBLES)
      for (const j of J.JEUX) {
        const res = J.apply(O.orchestrate({ parts: e.parts, spans: sp, level: 'full', spb, beat }), { parts: e.parts, jeu: j.id, spans: sp, level: 'full', spb, beat, scale: C_MAJ });
        for (const [id, L] of Object.entries(res.lines))
          for (const ev of L.events) {
            assert.ok(ev.step >= 0 && ev.step + ev.len <= 3 * spb, `${e.id} ${j.id} ${id} ${spb} : dans la scène`);
            for (const m of ev.notes) assert.ok(m >= O.PART[id].lo && m <= O.PART[id].hi, `${e.id} ${j.id} ${id} ${spb} : ${m}`);
          }
      }
  }
});

test('Pizzicato : les notes pincées partent sur les pistes pizzicato ; sans elles, notes courtes à l’archet', () => {
  const r = run('cpop', 'pizz');
  assert.equal(r.lines.vl1.events.length, 0, 'violons I à l’archet : rien');
  assert.ok(r.lines.vlp.events.length > 16 && r.lines.vcp.events.length >= 8);
  assert.deepEqual(r.view.vl1.arts, ['pizz']);
  assert.equal(r.view.vc.role, 'bass');
  const s = run('strings', 'pizz'); // le quintette n'a pas de piste pizzicato
  assert.ok(s.lines.vl1.events.length && s.lines.vl1.events.every((e) => e.len <= 2));
});

test('Ostinato spiccato (Cordes épiques) : doubles-croches des violons sur la piste spiccato, contrebasses tenues', () => {
  const r = run('cepique', 'spic');
  assert.equal(r.lines.vls.events.length >= 64, true);
  assert.equal(r.lines.cb.role, 'bass');
  assert.equal(r.lines.vcs.role, 'motor');
});

test('Tenues qui enflent : courbe de volume ; Tenues hautes : violons I une octave au-dessus des II', () => {
  const r = run('quatuor', 'enfle');
  assert.ok(r.lines.va.vol && Object.values(r.lines.va.vol).includes(0.35));
  const h = run('quatuor', 'aigues');
  assert.deepEqual(h.lines.vl1.events.map((e) => e.notes[0] - 12), h.lines.vl2.events.map((e) => e.notes[0]));
});

test('Contrechant : les violons I jouent dans les silences de la mélodie', () => {
  const MEL = [{ step: 0, len: 8, midi: 76 }, { step: 16, len: 8, midi: 72 }];
  const r = run('cpop', 'contre', { melody: MEL });
  assert.ok(r.lines.vl1.events.length > 0);
  for (const e of r.lines.vl1.events) for (const n of MEL) assert.ok(e.step >= n.step + n.len || e.step + e.len <= n.step, 'pas sur la mélodie');
});

test('Orchestration et effectifs mixtes : bois et cuivres gardent leur rôle, pupitre coupé respecté', () => {
  const parts = O.ENS.chamber.parts;
  const res = O.orchestrate({ parts, spans: SPANS, melody: [], level: 'mid' });
  assert.equal(J.apply(res, { parts, jeu: 'orch', spans: SPANS }), res);
  const r = J.apply(res, { parts, jeu: 'trem', spans: SPANS, off: ['va'] });
  assert.equal(r.lines.hn, res.lines.hn);
  assert.equal(r.lines.va.events.length, 0);
  assert.equal(r.lines.vl1.role, 'trem');
});
