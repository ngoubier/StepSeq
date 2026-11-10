/*
 * Auto Mix (js/automix.js) : mesures, résumé, diagnostic et conseils, sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/project.js');
require('../js/sounds.js');
require('../js/band-presets.js');
require('../js/bandmix.js');
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
function play(tracks, { n = 600, lufs = -14, tp = -1.2, corr = 0.6, corrLow = 0.98, peak = 0.5, gr = {}, input = {} } = {}) {
  const acc = A.newAccumulator();
  for (let i = 0; i < n; i++) {
    const tr = {};
    const live = [];
    for (const [id, f] of Object.entries(tracks)) {
      const bands = f(i) || new Float64Array(A.BANDS.length);
      tr[id] = { bands, peak: 0.3, gr: gr[id] || 0 };
      // entrée de la tranche : input[id](i) = [crête dB, niveau moyen dB] (son brut, avant égaliseur et compresseur)
      if (input[id] && f(i)) {
        const [pk, rms] = input[id](i);
        tr[id].inPeak = Math.pow(10, pk / 20);
        tr[id].inMs = Math.pow(10, rms / 10);
      }
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
/** Tranche déjà traitée (égaliseur actif), pour tester les corrections sans chaîne de départ. */
const treated = () => {
  const m = SS.mixParams({});
  m.eq.on = true;
  return m;
};
const masterOn = () => {
  const m = SS.masterParams({});
  m.mastering = { ...m.mastering, on: true };
  return m;
};
const ctxOf = (tracks, extra = {}) => ({
  tracks: tracks.map(([id, role, mix]) => ({ id, name: id, role, mix: mix || treated(), volumeDb: -2, fx: SS.fxParams({}) })),
  master: { ...masterOn(), volumeDb: -2 },
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
  assert.ok(Math.abs(drive.to - 5) < 0.15, `+5 dB au plus d'un coup pour aller de −18 vers −12 LUFS (${drive.to})`);
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

test('chaîne de départ : kick à plat → égaliseur, compresseur calé sous la crête d\'entrée, limiteur facultatif', () => {
  const s = play(
    { kick: (i) => (i % 8 < 2 ? spectrum({ 1: -8, 2: -12, 6: -28 }) : null), bass: () => spectrum({ 1: -12, 2: -12 }) },
    { input: { kick: () => [-4, -16], bass: () => [-8, -18] } }
  );
  const flat = SS.mixParams({});
  const d = A.diagnose(s, ctxOf([['kick', 'kick', flat], ['bass', 'bass', SS.mixParams({})]]));
  const ch = d.suggestions.find((x) => x.id === 'chain:kick');
  assert.ok(ch && ch.kind === 'chain', 'chaîne proposée pour le kick à plat');
  assert.deepEqual(ch.modules.map((m) => m.k), ['EQ', 'COMP', 'LIM']);
  const th = ch.modules[1].changes.find((c) => c.path === 'mix.comp.th');
  assert.equal(th.to, -4 - SS.bandMix.DRUM.bd.below, 'seuil = crête d\'entrée − marge de la règle du kick');
  assert.equal(ch.modules[2].on, false, 'crêtes régulières : limiteur décoché');
  assert.ok(/Passe-haut/.test(A.moduleDesc(ch.modules[0])) && /3:1|3,5:1|4:1/.test(A.moduleDesc(ch.modules[1])));
  assert.ok(d.suggestions.some((x) => x.id === 'chain:bass'), 'chaîne pour la basse aussi');
  // une piste déjà traitée n'a pas de chaîne
  const t = A.diagnose(s, ctxOf([['kick', 'kick'], ['bass', 'bass']]));
  assert.ok(!t.suggestions.some((x) => x.kind === 'chain' && x.tab === 'mix'));
  // préférences : sans compresseurs ni limiteurs, la chaîne garde l'égaliseur seul
  const e = A.diagnose(s, ctxOf([['kick', 'kick', flat]], { prefs: { scopes: { comp: false } } }));
  assert.deepEqual(e.suggestions.find((x) => x.id === 'chain:kick').modules.map((m) => m.k), ['EQ']);
  // intensité : gains d'EQ et seuil dosés
  assert.equal(A.valueAt(th, 0.5), Math.round(th.to / 2 / 0.5) * 0.5);
});

test('chaîne de départ : crêtes brutales → limiteur coché ; la chaîne remplace le passe-haut isolé', () => {
  const s = play(
    { pad: (i) => spectrum({ 0: -30, 1: -14, 2: -16, 3: -24, 4: -26 }) },
    { input: { pad: (i) => [i % 50 === 0 ? -2 : -12, -20] } }
  );
  const d = A.diagnose(s, ctxOf([['pad', 'pad', SS.mixParams({})]]));
  const ch = d.suggestions.find((x) => x.id === 'chain:pad');
  const lim = ch.modules.find((m) => m.k === 'LIM');
  assert.ok(lim && lim.on, 'limiteur coché sur les crêtes brutales');
  assert.ok(!ch.modules.some((m) => m.k === 'COMP'), 'pas de compresseur sur une nappe');
  assert.ok(!d.suggestions.some((x) => x.id === 'hp:pad'), 'le passe-haut isolé est couvert par la chaîne');
});

test('chaîne de mastering : Master à plat → EQ, glue 2:1, mastering réglé sur l\'objectif ; remplace le conseil de volume', () => {
  const s = play({ lead: () => spectrum({ 2: -18, 3: -16, 4: -17, 5: -19, 6: -21, 7: -24, 8: -27, 9: -35 }) }, { lufs: -18, tp: -3 });
  const d = A.diagnose(s, { ...ctxOf([['lead', 'lead']], { target: 'synthwave' }), master: { ...SS.masterParams({}), volumeDb: -2 } });
  const mc = d.suggestions.find((x) => x.id === 'mchain');
  assert.ok(mc && mc.tab === 'master');
  assert.deepEqual(mc.modules.map((m) => m.k), ['EQ', 'COMP', 'MAST']);
  const mast = mc.modules[2].changes;
  assert.ok(mast.some((c) => c.path === 'mastering.on' && c.to === true));
  assert.ok(Math.abs(mast.find((c) => c.path === 'mastering.drive').to - 6) < 0.15, 'gain d\'entrée pour −12 LUFS');
  assert.equal(mast.find((c) => c.path === 'mastering.ceiling').to, -1);
  assert.equal(mc.modules[1].changes.find((c) => c.path === 'mix.comp.ratio').to, 2);
  assert.ok(!d.suggestions.some((x) => x.id === 'loud'), 'le conseil de volume est inclus dans la chaîne');
  assert.ok(/gain d'entrée/.test(A.moduleDesc(mc.modules[2])));
});

test('corrections : compresseur qui ne travaille pas, limiteur permanent', () => {
  const s = play({ bass: () => spectrum({ 1: -10, 2: -11 }) }, { input: { bass: () => [-6, -16] } });
  const m = treated();
  m.comp = { ...m.comp, on: true, th: -2 };
  m.lim = { ...m.lim, on: true, ceil: -12 };
  const sum = { ...s, tracks: { bass: { ...s.tracks.bass, limGr: 5, grMax: 0 } } };
  const d = A.diagnose(sum, ctxOf([['bass', 'bass', m]]));
  const idle = d.suggestions.find((x) => x.id === 'compidle:bass');
  assert.ok(idle && idle.changes[0].to === -6 - SS.bandMix.INST.bass.below);
  const lim = d.suggestions.find((x) => x.id === 'lim:bass');
  assert.ok(lim && lim.changes[0].to === -8);
});

test('pistes rares : un clap qui ne joue qu\'une fois est jugé et réglé', () => {
  // 640 relevés (32 s), le clap ne frappe que 3 relevés, à la fin
  const s = play({
    kick: (i) => (i % 8 < 2 ? spectrum({ 1: -6, 2: -10 }) : null),
    bass: () => spectrum({ 1: -9, 2: -10 }),
    lead: () => spectrum({ 4: -16, 5: -15, 6: -18 }),
    clap: (i) => (i >= 630 && i < 633 ? spectrum({ 5: -40, 6: -42 }) : null),
  }, { n: 640 });
  assert.ok(s.tracks.clap.active < 0.01 && s.tracks.clap.n === 3);
  const d = A.diagnose(s, ctxOf([['kick', 'kick'], ['bass', 'bass'], ['lead', 'lead'], ['clap', 'clap']]));
  const bal = d.suggestions.find((x) => x.id === 'bal:clap');
  assert.ok(bal, 'le clap trop faible est signalé malgré sa rareté');
  assert.ok(bal.changes[0].to > bal.changes[0].from, 'son fader monte');
  assert.ok(/joue rarement/.test(bal.why));
});

test('équilibre : baisser le fader du Master ne fait pas paraître toutes les pistes trop fortes', () => {
  const tracks = {
    kick: (i) => (i % 8 < 2 ? spectrum({ 1: -6, 2: -10 }) : null),
    bass: () => spectrum({ 1: -9, 2: -10 }),
    lead: () => spectrum({ 4: -16, 5: -15, 6: -18 }),
  };
  // même morceau, Master à 0 dB puis à −10 dB : les énergies du mix sont écoutées après le fader
  const run = (g) => {
    const acc = A.newAccumulator();
    for (let i = 0; i < 400; i++) {
      const tr = {};
      const live = [];
      for (const [id, f] of Object.entries(tracks)) {
        const b = f(i) || new Float64Array(A.BANDS.length);
        tr[id] = { bands: b, peak: 0.3 };
        live.push(b);
      }
      const pre = sumBands(live).map((v) => v * g * g);
      A.accumulate(acc, { dt: 0.05, tracks: tr, pre: { bands: pre, peak: 0.5 * g }, preGain: g });
    }
    return A.summarize(acc);
  };
  const a = run(1);
  const b = run(Math.pow(10, -10 / 20));
  for (const id of Object.keys(tracks)) assert.ok(Math.abs(a.tracks[id].rel - b.tracks[id].rel) < 0.01, id);
});

test('équilibre : l\'écart commun est retiré — pas de baisse générale des volumes', () => {
  // toutes les pistes 6 dB « trop fortes » par rapport au mix (impossible en vrai : c'est l'effet d'un repère faussé)
  const sum = { tracks: {} };
  const rows = [['kick', 'kick'], ['bass', 'bass'], ['lead', 'lead'], ['pad', 'pad']];
  for (const [id, role] of rows) sum.tracks[id] = { n: 100, active: 0.5, rel: A.ROLE_LEVEL[role] + 6, energy: 1 };
  sum.tracks.pad.rel = A.ROLE_LEVEL.pad - 2; // seule la nappe est en retrait par rapport aux autres
  const plan = A.balancePlan(sum, rows.map(([id, role]) => ({ id, role })));
  for (const r of plan.filter((x) => x.t.id !== 'pad')) assert.ok(Math.abs(r.dev) < 2.5, r.t.id);
  const pad = plan.find((x) => x.t.id === 'pad');
  assert.ok(pad.dev < -5, 'la nappe reste à remonter');
});

test('garde-fous : les creux d\'EQ et le gain du mastering ne se cumulent pas sans fin', () => {
  const s = play({
    pad: () => spectrum({ 1: -24, 3: -8, 4: -9, 5: -20, 6: -30, 7: -34, 8: -40, 9: -50 }),
    lead: () => spectrum({ 4: -20, 5: -16, 6: -20 }),
  }, { lufs: -30, tp: -12 });
  const deep = treated();
  deep.eq.lm = { f: 300, g: -6, q: 1.2 };
  const d = A.diagnose(s, ctxOf([['pad', 'pad', deep], ['lead', 'lead']]));
  assert.ok(!d.suggestions.some((x) => x.id === 'lowmid'), 'creux déjà à −6 dB : pas de nouveau creux');
  const mp = masterOn();
  mp.mastering.drive = 13;
  const d2 = A.diagnose(s, ctxOf([['lead', 'lead']], { master: { ...mp, volumeDb: -2 } }));
  const drive = d2.suggestions.find((x) => x.id === 'loud').changes.find((c) => c.path === 'mastering.drive');
  assert.ok(drive.to <= A.DRIVE_MAX, `gain d'entrée plafonné (${drive.to})`);
});

/* ------------------------------------------------------------------ pilote auto */
require('../js/automix-pilot.js');
const PL = SS.automixPilot;

/** Simule le pilote : les faders (dB) changent le niveau réel des pistes ; rend les faders finaux. */
function pilotSim({ tracks, faders, secs = 120, locked = [] }) {
  const tk = PL.newTracker();
  const vol = { ...faders };
  let lastMove = -Infinity;
  let moves = 0;
  for (let i = 0; i < secs * 20; i++) {
    const tr = {};
    const live = [];
    for (const [id, f] of Object.entries(tracks)) {
      const base = f(i);
      const b = base ? base.map((v) => v * Math.pow(10, vol[id] / 10)) : new Float64Array(A.BANDS.length);
      tr[id] = { bands: b };
      live.push(b);
    }
    PL.feed(tk, { dt: 0.05, tracks: tr, pre: { bands: sumBands(live), peak: 0.3 }, preGain: 1 });
    if (tk.t - lastMove < PL.P.settle) continue;
    const ctx = Object.keys(tracks).map((id) => ({ id, name: id, role: id, volumeDb: vol[id], locked: locked.includes(id) }));
    const d = PL.plan(tk, ctx);
    if (d.kind === 'fader') {
      assert.ok(Math.abs(d.to - d.from) <= PL.P.stepMax + 1e-9, 'petits gestes');
      PL.forget(tk, [d.id], [d.to - vol[d.id]]);
      vol[d.id] = d.to;
      lastMove = tk.t;
      moves++;
    } else if (d.kind === 'stage') {
      d.moves.forEach((m) => (vol[m.id] = m.to));
      PL.forget(tk, d.room ? [d.room] : []);
      lastMove = tk.t;
    }
  }
  return { vol, moves, tk };
}

test('pilote auto : remonte pas à pas une nappe trop basse, laisse les pistes en place', () => {
  const tracks = {
    kick: (i) => (i % 8 < 2 ? spectrum({ 1: -6, 2: -10 }) : null),
    bass: () => spectrum({ 1: -9, 2: -10 }),
    lead: () => spectrum({ 4: -16, 5: -15, 6: -18 }),
    pad: () => spectrum({ 3: -30, 4: -30, 5: -32 }),
  };
  const { vol, moves, tk } = pilotSim({ tracks, faders: { kick: 0, bass: 0, lead: 0, pad: 0 } });
  assert.ok(vol.pad >= 4, `nappe remontée (${vol.pad} dB)`);
  const end = PL.plan(tk, Object.keys(tracks).map((id) => ({ id, name: id, role: id, volumeDb: vol[id] })));
  assert.ok(end.state.balanced, 'à la fin, toutes les pistes sont à leur place');
  assert.ok(moves >= 3, 'plusieurs petits gestes plutôt qu\'un grand saut');
  assert.ok(Math.abs(vol.kick - vol.lead) < 3 && Math.abs(vol.bass - vol.lead) < 3, 'kick, basse et lead gardent leur équilibre entre eux');
});

test('pilote auto : une piste rare est réglée à chaque frappe ; une piste reprise en main n\'est pas touchée', () => {
  const tracks = {
    kick: (i) => (i % 8 < 2 ? spectrum({ 1: -6, 2: -10 }) : null),
    bass: () => spectrum({ 1: -9, 2: -10 }),
    lead: () => spectrum({ 4: -16, 5: -15, 6: -18 }),
    clap: (i) => (i % 320 >= 310 && i % 320 < 313 ? spectrum({ 5: -12, 6: -14 }) : null), // une frappe toutes les 16 s
  };
  const r = pilotSim({ tracks, faders: { kick: 0, bass: 0, lead: 0, clap: -20 }, secs: 200 });
  assert.ok(r.vol.clap > -14, `clap remonté (${r.vol.clap} dB)`);
  const l = pilotSim({ tracks, faders: { kick: 0, bass: 0, lead: 0, clap: -20 }, secs: 60, locked: ['clap'] });
  assert.equal(l.vol.clap, -20);
});

test('pilote auto : gain staging quand le limiteur du Master travaille trop', () => {
  const tk = PL.newTracker();
  for (let i = 0; i < 80; i++)
    PL.feed(tk, { dt: 0.05, tracks: { lead: { bands: spectrum({ 5: -10 }) } }, pre: { bands: spectrum({ 5: -10 }), peak: 0.9 }, preGain: 1, masterLimGr: -5 });
  const d = PL.plan(tk, [{ id: 'lead', name: 'lead', role: 'lead', volumeDb: 0 }]);
  assert.equal(d.kind, 'stage');
  assert.ok(d.delta < 0 && d.moves[0].to < 0);
});

test('équilibre : une intro à deux pistes ne fait pas croire que la basse est trop forte', () => {
  // niveaux exactement à leur place les uns par rapport aux autres (écarts = ceux de ROLE_LEVEL)
  const lv = (role) => A.ROLE_LEVEL[role] - 10;
  const intro = (i) => i < 300;
  const s = play({
    kick: (i) => (!intro(i) && i % 8 < 2 ? spectrum({ 1: lv('kick') }) : null),
    bass: () => spectrum({ 2: lv('bass') }),
    pad: () => spectrum({ 4: lv('pad') }),
    lead: (i) => (intro(i) ? null : spectrum({ 5: lv('lead') })),
  }, { n: 600 });
  assert.ok(s.tracks.bass.rel > A.ROLE_LEVEL.bass + 3.5, 'par rapport au mix, la basse paraît trop forte (intro)');
  const d = A.diagnose(s, ctxOf([['kick', 'kick'], ['bass', 'bass'], ['pad', 'pad'], ['lead', 'lead']]));
  assert.ok(!d.suggestions.some((x) => x.id.startsWith('bal:')), 'aucun conseil de fader : l\'équilibre entre pistes est juste');
  assert.ok(d.scores.bal >= 95);
});

test('pilote auto : pas d\'aller-retour quand l\'arrangement change', () => {
  const lv = (role) => A.ROLE_LEVEL[role] - 10;
  const full = (i) => Math.floor(i / 400) % 2 === 1; // 20 s à deux pistes, 20 s à quatre…
  const tracks = {
    kick: (i) => (full(i) && i % 8 < 2 ? spectrum({ 1: lv('kick') }) : null),
    bass: () => spectrum({ 2: lv('bass') - 6 }), // seule erreur : basse 6 dB trop basse
    pad: () => spectrum({ 4: lv('pad') }),
    lead: (i) => (full(i) ? spectrum({ 5: lv('lead') }) : null),
  };
  const r = pilotSim({ tracks, faders: { kick: 0, bass: 0, lead: 0, pad: 0 }, secs: 120 });
  assert.ok(r.vol.bass - r.vol.pad >= 3.5, `basse remontée par rapport à la nappe (${r.vol.bass} / ${r.vol.pad})`);
  assert.ok(r.tk.tracks.bass.flips <= 1, `pas d'aller-retour (${r.tk.tracks.bass.flips})`);
});
