/*
 * Expression et articulations (js/expression.js) : phrases, arc, soufflet, phrasé automatique, articulations écrites.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'library.js', 'sounds.js', 'harmony.js', 'project.js', 'expression.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const X = SS.expression;

const n = (step, len, midi, extra = {}) => ({ step, len, notes: [midi], vel: 0.8, ...extra });
const first = (o) => o.shape[0][1];
const lastV = (o) => o.shape[o.shape.length - 1][1];

test('familles : cordes, cuivres, bois, voix ; cordes pincées et Juno à part ; expression proposée aux instruments acoustiques', () => {
  const t = (family, instrument) => ({ type: 'instrument', family, instrument });
  assert.equal(SS.exprFamily(t('strings', 'gm_violin')), 'strings');
  assert.equal(SS.exprFamily(t('strings', 'gm_string_ensemble_1')), 'strings');
  assert.equal(SS.exprFamily(t('strings', 'gm_pizzicato_strings')), 'pluck');
  assert.equal(SS.exprFamily(t('strings', 'gm_orchestral_harp')), 'pluck');
  assert.equal(SS.exprFamily(t('strings', 'gm_synth_strings_1')), 'synth');
  assert.equal(SS.exprFamily(t('brass', 'gm_french_horn')), 'brass');
  assert.equal(SS.exprFamily(t('winds', 'gm_flute')), 'winds');
  assert.equal(SS.exprFamily(t('winds', 'vcsl_sax_stacc')), 'pluck');
  assert.equal(SS.exprFamily({ type: 'drum' }), null);
  assert.equal(SS.exprDefault(t('strings', 'gm_cello')), 'natural');
  assert.equal(SS.exprDefault(t('strings', 'gm_synth_strings_1')), null);
  const tr = SS.applyExprDefault(t('brass', 'gm_trumpet'));
  assert.equal(tr.sd.expr, 'natural');
  tr.sd.expr = 'light';
  assert.equal(SS.applyExprDefault(tr).sd.expr, 'light', 'un réglage déjà choisi est gardé');
  assert.equal(SS.exprAmount(tr), 0.5);
  assert.equal(SS.exprAmount({}), 0);
});

test('articulation : bornée, absente si inconnue', () => {
  assert.equal(SS.cleanArt({ art: 'leg' }).art, 'leg');
  assert.equal('art' in SS.cleanArt({ art: 'xx' }), false);
});

test('phrases : coupées par un silence d’une croche, et toutes les 4 mesures dans une ligne continue', () => {
  const evs = [n(0, 4, 60), n(4, 4, 62), n(9, 2, 64), n(14, 2, 65)];
  assert.deepEqual(X.phrases(evs).map((p) => p.idx), [[0, 1, 2], [3]]);
  const line = Array.from({ length: 20 }, (_, i) => n(i * 4, 4, 60));
  const ph = X.phrases(line);
  assert.equal(ph.length, 2);
  assert.equal(ph[0].idx.length, 16);
  assert.equal(ph[0].forced, true);
});

test('arc : la phrase monte vers sa note la plus haute et retombe ; jamais plus fort que la note écrite', () => {
  const evs = [n(0, 2, 60), n(2, 2, 62), n(4, 2, 64), n(6, 2, 67), n(8, 2, 65), n(10, 2, 62), n(12, 2, 60)];
  const p = X.plan(evs, { amt: 1, family: 'strings', phrase: false });
  const lv = evs.map((e) => first(p.get(e)));
  assert.equal(Math.max(...lv), lv[3], 'sommet sur la note la plus haute');
  assert.ok(lv[0] < lv[3] && lv[6] < lv[3]);
  assert.ok(lastV(p.get(evs[6])) < first(p.get(evs[6])), 'la dernière note s’éteint');
  for (const o of p.values()) for (const [, v] of o.shape) assert.ok(v <= 1.1 && v > 0.3);
  // plus d'expression : plus d'écart
  const q = X.plan(evs, { amt: 1.5, family: 'strings', phrase: false });
  assert.ok(first(q.get(evs[0])) < lv[0]);
  const l = X.plan(evs, { amt: 0.5, family: 'strings', phrase: false });
  assert.ok(first(l.get(evs[0])) > lv[0]);
});

test('notes longues : soufflet (enfle puis se pose) ; « fp » des très longues notes en Expressive', () => {
  const half = n(0, 8, 60);
  const o = X.plan([half, n(8, 8, 62)], { amt: 1, family: 'strings', phrase: false }).get(half);
  assert.equal(o.shape.length, 3);
  assert.ok(o.shape[1][1] > o.shape[0][1] && o.shape[1][1] > o.shape[2][1]);
  const whole = n(0, 16, 60);
  const fp = X.plan([whole, n(16, 4, 62)], { amt: 1.5, family: 'strings', phrase: false }).get(whole);
  assert.equal(fp.shape.length, 4);
  assert.ok(fp.shape[1][1] < fp.shape[0][1] && fp.shape[2][1] > fp.shape[1][1], 'attaque, recul, crescendo');
  const winds = X.plan([whole, n(16, 4, 62)], { amt: 1.5, family: 'winds', phrase: false }).get(whole);
  assert.equal(winds.shape.length, 3, 'pas de fp aux bois : un soufflet');
});

test('phrasé automatique : legato entre notes liées, détaché sur les notes répétées, staccato sur les doubles isolées', () => {
  const a = n(0, 4, 60);
  const b = n(4, 4, 62);
  const c = n(8, 4, 62);
  const d = n(14, 1, 67);
  const e = n(16, 4, 60);
  const p = X.plan([a, b, c, d, e], { amt: 1, family: 'strings' });
  assert.equal(p.get(a).overlap, 0.05, 'a lié à b');
  assert.ok(p.get(b).attack > 0, 'b n’attaque pas (legato)');
  assert.equal(p.get(b).durK, 0.82, 'b répété par c : détaché');
  assert.equal(p.get(d).durK, 0.45, 'double croche isolée : staccato');
  const off = X.plan([a, b, c, d, e], { amt: 1, family: 'strings', phrase: false });
  assert.equal(off.get(a).overlap, 0);
  assert.equal(off.get(d).durK, 1);
});

test('articulations écrites : elles l’emportent, même sans expression', () => {
  const a = n(0, 4, 60, { art: 'stac' });
  const b = n(4, 4, 62, { art: 'swell' });
  const c = n(8, 4, 64, { art: 'ten' });
  const d = n(12, 4, 65, { art: 'leg' });
  const e = n(16, 4, 67);
  const p = X.plan([a, b, c, d, e], { amt: 0, family: 'strings' });
  assert.equal(p.get(a).durK, 0.45);
  assert.ok(p.get(b).shape[1][1] > p.get(b).shape[0][1] && p.get(b).shape[2][1] < p.get(b).shape[1][1]);
  assert.equal(p.get(c).durK, 1.02);
  assert.equal(p.get(d).overlap, 0.05);
  assert.ok(p.get(e).attack > 0);
  assert.equal(p.get(e).bright.ratio, 1, 'sans expression, le timbre ne bouge pas');
  assert.equal(first(p.get(e)), 1, 'sans expression, pas d’arc');
});

test('respiration : vents et voix au bout d’une longue ligne sans silence, pas les cordes', () => {
  const line = Array.from({ length: 20 }, (_, i) => n(i * 4, 4, 60 + (i % 5)));
  const w = X.plan(line, { amt: 1, family: 'winds' });
  assert.equal(w.get(line[15]).breath, 0.08);
  const s = X.plan(line, { amt: 1, family: 'strings' });
  assert.equal(s.get(line[15]).breath, 0);
});

test('timbre : le filtre s’assombrit dans le piano, s’ouvre dans le forte, jusqu’au réglage du son', () => {
  assert.equal(X.brightHz(20000, 0.1, 1), 20000);
  assert.ok(Math.abs(X.brightHz(20000, 0.1, 0) - 2000) < 1e-6);
  assert.ok(X.brightHz(8000, 0.1, 0.5) < 8000);
  assert.equal(X.at([[0, 0.5], [0.5, 1], [1, 0.5]], 0.25), 0.75);
});

test('piste : aucun calcul sans expression ni articulation ; mémoire tant que les notes ne changent pas', () => {
  const t = { type: 'instrument', family: 'strings', instrument: 'gm_violin' };
  const evs = [n(0, 4, 60), n(4, 4, 62)];
  assert.equal(X.forTrack(t, evs), null);
  t.sd = { expr: 'natural' };
  const p1 = X.forTrack(t, evs);
  assert.ok(p1 instanceof Map && p1.size === 2);
  assert.equal(X.forTrack(t, evs), p1);
  evs[1].notes = [64];
  assert.notEqual(X.forTrack(t, evs), p1, 'une note modifiée : nouveau calcul');
  t.sd.phrase = 0;
  assert.equal(X.forTrack(t, evs).get(evs[0]).overlap, 0, 'phrasé automatique coupé');
});
