/*
 * Auto Mix (js/automix.js) : mesures, résumé, diagnostic et conseils, sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/project.js');
require('../js/sounds.js');
require('../js/automix.js');
const A = SS.automix;

const P = (db) => Math.pow(10, db / 10);
/** Spectre d'une piste : énergie (dB) par bande d'octave, le reste très bas. */
const spectrum = (map) => Float64Array.from(A.BANDS, (_, b) => P(map[b] ?? -90));
const sumBands = (list) => list.reduce((acc, x) => acc.map((v, b) => v + x[b]), new Float64Array(A.BANDS.length));

/**
 * Morceau synthétique : `tracks` = { id: (i) => spectre ou null (silence) }, `n` relevés de 50 ms.
 * loud : LUFS momentanés et true peak du Master.
 */
function play(tracks, { n = 600, lufs = -14, tp = -1.2, corr = 0.6, corrLow = 0.98, peak = 0.5, gr = {} } = {}) {
  const acc = A.newAccumulator();
  for (let i = 0; i < n; i++) {
    const tr = {};
    const live = [];
    for (const [id, f] of Object.entries(tracks)) {
      const bands = f(i) || new Float64Array(A.BANDS.length);
      tr[id] = { bands, peak: 0.3, gr: gr[id] || 0 };
      live.push(bands);
    }
    const sc = (c) => ({ lr: c, ll: 1, rr: 1 });
    A.accumulate(acc, {
      dt: 0.05, scene: 's1', tracks: tr, pre: { bands: sumBands(live), peak }, stereo: sc(corr), stereoLow: sc(corrLow),
      loud: { m: lufs + (i % 20 < 10 ? 1 : -1), s: lufs, tp, fresh: i % 2 === 0 },
    });
  }
  return A.summarize(acc);
}
const ctxOf = (tracks, extra = {}) => ({
  tracks: tracks.map(([id, role]) => ({ id, name: id, role, mix: SS.mixParams({}), volumeDb: -2, fx: SS.fxParams({}) })),
  master: { ...SS.masterParams({}), volumeDb: -2 },
  target: 'streaming',
  prefs: {},
  ...extra,
});

test('bandes d\'octave : un 1 kHz tombe dans la bande 1 kHz, la pondération K remonte les aigus', () => {
  const fft = 4096;
  const sr = 48000;
  const spec = new Float32Array(fft / 2).fill(-200);
  spec[Math.round(1000 / (sr / fft))] = -20;
  const b = A.bandPowers(spec, sr, fft);
  assert.equal(b.indexOf(Math.max(...b)), 5);
  assert.ok(Math.abs(10 * Math.log10(b[5]) + 20) < 0.01);
  const lo = spectrum({ 1: -20 });
  const hi = spectrum({ 8: -20 });
  assert.ok(A.kPower(hi) > A.kPower(lo) * 3, 'aigus pondérés plus fort que le grave');
});

test('volume intégré et LRA : valeurs EBU attendues sur des séries simples', () => {
  assert.ok(Math.abs(A.integrated(Array(100).fill(-20)) + 20) < 1e-9);
  // les passages à −80 sont sous la porte absolue
  assert.ok(Math.abs(A.integrated([...Array(100).fill(-20), ...Array(100).fill(-80)]) + 20) < 1e-9);
  const lra = A.loudnessRange([...Array(50).fill(-20), ...Array(50).fill(-12)]);
  assert.ok(Math.abs(lra - 8) < 0.01, `LRA ${lra}`);
  assert.ok(A.correlation(A.stereoSums([1, -1, 1], [1, -1, 1])) > 0.999);
  assert.ok(A.correlation(A.stereoSums([1, -1, 1], [-1, 1, -1])) < -0.999);
});

test('résumé : niveau relatif des pistes, recouvrement kick ↔ basse, part des graves', () => {
  const s = play({
    kick: (i) => (i % 8 < 2 ? spectrum({ 1: -10, 2: -14, 6: -30 }) : null),
    bass: () => spectrum({ 1: -11, 2: -12, 3: -22 }),
    pad: () => spectrum({ 1: -24, 3: -14, 4: -16, 5: -22 }),
  });
  assert.ok(s.tracks.kick.active > 0.2 && s.tracks.kick.active < 0.3, `kick actif ${s.tracks.kick.active}`);
  assert.ok(s.tracks.bass.rel < 0 && s.tracks.bass.rel > -6);
  const kb = s.overlap.find((o) => o.band === 1 && [o.a, o.b].sort().join() === 'bass,kick');
  assert.ok(kb && kb.ratio > 0.2, 'kick et basse forts ensemble vers 63 Hz');
  assert.ok(s.tracks.pad.share[3] > 0.8, 'la nappe porte les bas-médiums');
  assert.ok(Math.abs(s.master.i + 14) < 0.3);
  assert.ok(Math.abs(s.master.corr - 0.6) < 1e-9);
});

test('diagnostic : volume trop faible → gain d\'entrée du mastering, plafond à la cible', () => {
  const s = play({ lead: () => spectrum({ 2: -18, 3: -16, 4: -17, 5: -19, 6: -21, 7: -24, 8: -27, 9: -35 }) }, { lufs: -18, tp: -3 });
  const d = A.diagnose(s, ctxOf([['lead', 'lead']], { target: 'synthwave' }));
  const loud = d.suggestions.find((x) => x.id === 'loud');
  assert.ok(loud, 'conseil de volume');
  assert.equal(loud.sev, 'crit');
  const drive = loud.changes.find((c) => c.path === 'mastering.drive');
  assert.ok(Math.abs(drive.to - 6) < 0.15, `+6 dB pour passer de −18 à −12 LUFS (${drive.to})`);
  assert.ok(loud.changes.some((c) => c.path === 'mastering.on' && c.to === true));
  assert.ok(d.scores.loud < 50);
  assert.ok(d.total >= 0 && d.total <= 100);
});

test('diagnostic : kick et basse masqués → sidechain, ou creux d\'EQ si le sidechain est interdit', () => {
  const tracks = {
    kick: (i) => (i % 4 < 2 ? spectrum({ 1: -8, 2: -12 }) : null),
    bass: () => spectrum({ 1: -8, 2: -10, 3: -20 }),
  };
  const s = play(tracks);
  const ctx = ctxOf([['kick', 'kick'], ['bass', 'bass']]);
  const kb = A.diagnose(s, ctx).suggestions.find((x) => x.id === 'kickbass');
  assert.ok(kb, 'conseil kick / basse');
  assert.equal(kb.scope, 'sidechain');
  assert.ok(kb.changes.some((c) => c.path === 'fx.scSource' && c.to === 'kick'));
  const noSc = A.diagnose(s, { ...ctx, prefs: { scopes: { sidechain: false } } }).suggestions.find((x) => x.id === 'kickbass');
  assert.equal(noSc.scope, 'eq');
  assert.ok(noSc.changes.some((c) => /mix\.eq\.(lm|hm)\.g/.test(c.path) && c.to < 0));
  const none = A.diagnose(s, { ...ctx, prefs: { scopes: { sidechain: false, eq: false } } });
  assert.ok(!none.suggestions.some((x) => x.id === 'kickbass'));
  assert.ok(none.hidden > 0, 'les conseils interdits sont comptés comme masqués');
});

test('diagnostic : nappe trop basse dans le mix → fader ; grave inutile → passe-haut', () => {
  const s = play({
    kick: (i) => (i % 8 < 2 ? spectrum({ 1: -6, 2: -10 }) : null),
    bass: () => spectrum({ 1: -8, 2: -9 }),
    pad: () => spectrum({ 0: -30, 1: -14, 2: -16, 3: -30, 4: -32, 5: -34 }),
  });
  const d = A.diagnose(s, ctxOf([['kick', 'kick'], ['bass', 'bass'], ['pad', 'pad']]));
  const hp = d.suggestions.find((x) => x.id === 'hp:pad');
  assert.ok(hp, 'passe-haut sur la nappe');
  assert.equal(hp.changes.find((c) => c.path === 'mix.eq.hp.f').to, 150);
  const bal = d.suggestions.find((x) => x.id === 'bal:pad');
  if (bal) assert.equal(bal.changes[0].path, 'volumeDb');
  assert.ok(!d.suggestions.some((x) => x.id === 'hp:bass' || x.id === 'hp:kick'), 'jamais de passe-haut sur le kick ou la basse');
});

test('préférences : nettoyage, filtre « importants seulement »', () => {
  const p = A.cleanPrefs({ scopes: { eq: false, bogus: true }, target: 'nope', detail: 'important', minSecs: 3 });
  assert.equal(p.scopes.eq, false);
  assert.equal(p.scopes.fader, true);
  assert.ok(!('bogus' in p.scopes));
  assert.equal(p.target, 'auto');
  assert.equal(p.minSecs, 10);
  assert.equal(A.proposeTarget([{ band: { style: 'synthwave' } }]), 'synthwave');
  assert.equal(A.proposeTarget([{}]), 'streaming');
  const s = play({ lead: () => spectrum({ 3: -16, 4: -17, 5: -19 }) }, { lufs: -15.5 });
  const all = A.diagnose(s, ctxOf([['lead', 'lead']]));
  const imp = A.diagnose(s, ctxOf([['lead', 'lead']], { prefs: { detail: 'important' } }));
  assert.ok(imp.suggestions.every((x) => x.sev !== 'info'));
  assert.ok(imp.suggestions.length <= all.suggestions.length);
});

test('intensité et affichage des valeurs', () => {
  const c = { path: 'mix.eq.lm.g', from: 0, to: -4 };
  assert.equal(A.valueAt(c, 1), -4);
  assert.equal(A.valueAt(c, 0.5), -2);
  assert.equal(A.valueAt(c, 1.5), -6);
  assert.equal(A.valueAt({ path: 'mix.eq.lm.f', from: 400, to: 300, fixed: true }, 0.5), 300);
  assert.equal(A.valueAt({ path: 'volumeDb', from: -2, to: 4, max: 6 }, 1.5), 6);
  assert.equal(A.formatValue('mix.eq.lm.g', -3.5), '−3,5 dB');
  assert.equal(A.formatValue('mastering.drive', 4.6), '+4,6 dB');
  assert.equal(A.formatValue('mix.eq.hp.f', 140), '140 Hz');
  assert.equal(A.formatValue('mix.eq.high.f', 10000), '10 kHz');
  assert.equal(A.formatValue('mix.pan', -0.3), 'G 30');
  assert.equal(A.formatValue('fx.scDepth', 0.5), '50 %');
  assert.equal(A.formatValue('mastering.on', true), 'on');
});
