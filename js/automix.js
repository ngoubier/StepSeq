/*
 * Auto Mix : diagnostic de mixage et de mastering, et conseils chiffrés (fonctions pures, testées sous Node).
 *
 * L'écoute (js/automix-listen.js) relève environ 20 fois par seconde, pendant la lecture :
 *   - pour chaque piste : l'énergie dans 10 bandes d'octave (31 Hz … 16 kHz), la crête, la réduction de gain
 *     du compresseur de la tranche ;
 *   - pour le Master avant mastering : les mêmes bandes et la crête (marge, « gain staging ») ;
 *   - pour la sortie : la corrélation gauche / droite (toutes fréquences et sous 120 Hz), l'équilibre G/D,
 *     et les mesures EBU R128 du mastering (LUFS momentané, true peak).
 * accumulate() cumule ces relevés, summarize() en tire un résumé (dB), diagnose() note chaque critère de 0 à 100
 * et produit les conseils : { id, tab, scope, sev, track, title, why, meas, changes: [{ path, from, to }] }.
 *
 * Les critères d'un morceau « pro » et leurs cibles (TARGETS, ROLE_LEVEL, CURVES) : volume perçu, crêtes,
 * dynamique, balance tonale, équilibre des pistes, graves, stéréo, marge avant mastering. Les courbes et niveaux
 * par rôle sont calés sur les chansons du Band (tools/automix-calibrate.js).
 */
window.SS = window.SS || {};

SS.automix = (() => {
  /* ------------------------------------------------------------------ bandes */
  const BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const BAND_LABEL = ['31 Hz', '63 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz', '16 kHz'];
  const NB = BANDS.length;
  // pondération K (ITU-R BS.1770) approchée par bande d'octave : coupe des infra-graves, +4 dB dans les aigus
  const KW = [-4.5, -1.2, -0.2, 0, 0, 0.5, 2, 3.5, 4, 4].map((db) => Math.pow(10, db / 10));
  // zones de la balance tonale (indices de bandes)
  const ZONES = {
    sub: { name: 'infra-graves', bands: [0] },
    low: { name: 'graves', bands: [1, 2] },
    lowmid: { name: 'bas-médiums', bands: [3, 4] },
    mid: { name: 'médiums', bands: [5] },
    himid: { name: 'hauts-médiums', bands: [6, 7] },
    air: { name: 'aigus', bands: [8, 9] },
  };

  const dB = (p) => (p > 1e-20 ? 10 * Math.log10(p) : -200);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, step = 0.5) => Math.round(v / step) * step;
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  /** Énergie (linéaire) par bande d'octave à partir d'un spectre en dB (AnalyserNode.getFloatFrequencyData). */
  function bandPowers(spec, sampleRate, fftSize) {
    const out = new Float64Array(NB);
    const hz = sampleRate / fftSize;
    for (let i = 1; i < spec.length; i++) {
      const f = i * hz;
      if (f < 22 || f > 22000) continue;
      const b = clamp(Math.round(Math.log2(f / 31.5)), 0, NB - 1);
      const v = spec[i];
      if (v > -200) out[b] += Math.pow(10, v / 10);
    }
    return out;
  }
  const kPower = (bands) => {
    let s = 0;
    for (let b = 0; b < NB; b++) s += bands[b] * KW[b];
    return s;
  };

  /** Sommes utiles à la corrélation de deux canaux (cumulables d'un relevé à l'autre). */
  function stereoSums(L, R) {
    let lr = 0, ll = 0, rr = 0;
    for (let i = 0; i < L.length; i++) {
      lr += L[i] * R[i];
      ll += L[i] * L[i];
      rr += R[i] * R[i];
    }
    return { lr, ll, rr };
  }
  const correlation = (s) => (s.ll > 0 && s.rr > 0 ? s.lr / Math.sqrt(s.ll * s.rr) : 1);

  /** Volume intégré (portes −70 LUFS et −10 LU) à partir des valeurs momentanées (blocs de 400 ms, 10 par seconde). */
  function integrated(ms) {
    const pw = ms.filter((m) => m > -70).map((m) => Math.pow(10, (m + 0.691) / 10));
    if (!pw.length) return -Infinity;
    const rel = mean(pw) / 10;
    const kept = pw.filter((p) => p > rel);
    return kept.length ? -0.691 + 10 * Math.log10(mean(kept)) : -Infinity;
  }
  /** Amplitude de volume (LRA, EBU Tech 3342) : écart entre les centiles 10 et 95 des valeurs court terme. */
  function loudnessRange(st) {
    const a = st.filter((s) => s > -70);
    if (a.length < 10) return null;
    const rel = 10 * Math.log10(mean(a.map((s) => Math.pow(10, s / 10)))) - 20;
    const k = a.filter((s) => s > rel).sort((x, y) => x - y);
    if (k.length < 10) return null;
    const q = (p) => k[Math.min(k.length - 1, Math.round(p * (k.length - 1)))];
    return q(0.95) - q(0.1);
  }
  const percentile = (arr, p) => {
    if (!arr.length) return -Infinity;
    const s = [...arr].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))];
  };

  /* ------------------------------------------------------------------ cumul des relevés */
  function newAccumulator() {
    return { frames: 0, secs: 0, tracks: {}, mix: { bands: new Float64Array(NB), k: 0, n: 0, peaks: [] }, pairs: {}, st: { lr: 0, ll: 0, rr: 0 }, stLow: { lr: 0, ll: 0, rr: 0 }, ms: [], ss: [], tp: -Infinity, scenes: new Set(), grM: 0, grMn: 0 };
  }

  /**
   * Ajoute un relevé :
   *   frame = { dt (s), scene, tracks: { id: { bands, peak, gr } }, pre: { bands, peak }, stereo, stereoLow, loud: { m, s, tp } | null }
   * Une piste compte comme « active » quand elle joue à plus de −40 dB sous le mix à cet instant.
   */
  function accumulate(acc, frame) {
    acc.frames++;
    acc.secs += frame.dt || 0.05;
    if (frame.scene != null) acc.scenes.add(frame.scene);
    const pre = frame.pre;
    const mixK = pre ? kPower(pre.bands) : 0;
    const mixOn = mixK > 1e-9;
    if (pre && mixOn) {
      const m = acc.mix;
      for (let b = 0; b < NB; b++) m.bands[b] += pre.bands[b];
      m.k += mixK;
      m.n++;
      m.peaks.push(pre.peak);
      if (Number.isFinite(frame.masterGr)) {
        acc.grM += Math.abs(frame.masterGr);
        acc.grMn++;
      }
    }
    const strong = []; // pour chaque bande : pistes qui pèsent au moins un quart (−6 dB) du mix dans cette bande
    for (let b = 0; b < NB; b++) strong.push([]);
    for (const [id, t] of Object.entries(frame.tracks || {})) {
      let a = acc.tracks[id];
      if (!a) a = acc.tracks[id] = { bands: new Float64Array(NB), k: 0, mk: 0, n: 0, peak: 0, gr: 0, grMax: 0, lim: 0, total: 0, inPeaks: [], inMs: 0, inN: 0 };
      a.total++;
      const k = kPower(t.bands);
      if (!mixOn || k < 1e-9 || k < mixK * 1e-4) continue;
      for (let b = 0; b < NB; b++) a.bands[b] += t.bands[b];
      a.k += k;
      a.mk += mixK; // le mix aux mêmes instants : niveau relatif « pendant que la piste joue »
      a.n++;
      if (t.peak > a.peak) a.peak = t.peak;
      const gr = Math.abs(t.gr || 0);
      a.gr += gr;
      if (gr > a.grMax) a.grMax = gr;
      a.lim += Math.abs(t.limGr || 0);
      // entrée de la tranche (avant égaliseur et compresseur) : crêtes et niveau moyen du son brut
      if (t.inPeak > 1e-5) {
        a.inPeaks.push(20 * Math.log10(t.inPeak));
        a.inMs += t.inMs || 0;
        a.inN++;
      }
      for (let b = 0; b < NB; b++) if (pre.bands[b] > 1e-10 && t.bands[b] > pre.bands[b] * 0.25) strong[b].push(id);
    }
    // recouvrements : deux pistes fortes dans la même bande au même moment (« either » = au moins l'une forte)
    for (let b = 1; b < 8; b++) {
      const s = strong[b];
      for (let i = 0; i < s.length; i++)
        for (let j = i + 1; j < s.length; j++) {
          const key = [s[i], s[j]].sort().join('|') + '|' + b;
          (acc.pairs[key] = acc.pairs[key] || { both: 0 }).both++;
        }
      for (const id of s) {
        const key = id + '|' + b;
        acc.pairs[key] = acc.pairs[key] || { both: 0 };
        acc.pairs[key].strong = (acc.pairs[key].strong || 0) + 1;
      }
    }
    const add = (dst, s) => s && ((dst.lr += s.lr), (dst.ll += s.ll), (dst.rr += s.rr));
    add(acc.st, frame.stereo);
    add(acc.stLow, frame.stereoLow);
    const L = frame.loud;
    if (L) {
      if (Number.isFinite(L.m) && L.fresh) acc.ms.push(L.m);
      if (Number.isFinite(L.s) && L.fresh) acc.ss.push(L.s);
      if (Number.isFinite(L.tp)) acc.tp = Math.max(acc.tp, L.tp);
    }
    return acc;
  }

  /** Résumé en dB : niveau de chaque piste par rapport au mix, spectre du mix, recouvrements, mesures du Master. */
  function summarize(acc) {
    const m = acc.mix;
    const mixBands = Array.from(m.bands, (p) => dB(p / Math.max(1, m.n)));
    const mixK = dB(m.k / Math.max(1, m.n));
    const tracks = {};
    for (const [id, a] of Object.entries(acc.tracks)) {
      if (!a.n) {
        tracks[id] = { active: 0 };
        continue;
      }
      const k = dB(a.k / a.n);
      const bands = Array.from(a.bands, (p) => dB(p / a.n));
      // part de l'énergie de la piste dans le mix, par bande (sur tout le morceau)
      const share = Array.from(a.bands, (p, b) => (m.bands[b] > 0 ? p / m.bands[b] : 0));
      tracks[id] = {
        active: a.n / Math.max(1, m.n),
        k,
        rel: dB(a.k / a.mk),
        bands,
        share,
        peak: a.peak > 0 ? 20 * Math.log10(a.peak) : -200,
        grMean: a.gr / a.n,
        grMax: a.grMax,
        limGr: a.lim / a.n,
        // son à l'entrée de la tranche : crête maximale, crête habituelle (90e centile), niveau moyen, dynamique
        inPeak: a.inN ? Math.max(...a.inPeaks) : null,
        inP90: a.inN ? percentile(a.inPeaks, 0.9) : null,
        inRms: a.inN ? dB(a.inMs / a.inN) : null,
        crest: a.inN ? Math.max(...a.inPeaks) - dB(a.inMs / a.inN) : null,
      };
    }
    const overlap = [];
    for (const [key, v] of Object.entries(acc.pairs)) {
      const parts = key.split('|');
      if (parts.length !== 3) continue;
      const [x, y, b] = [parts[0], parts[1], +parts[2]];
      const sx = (acc.pairs[x + '|' + b] || {}).strong || 0;
      const sy = (acc.pairs[y + '|' + b] || {}).strong || 0;
      const either = sx + sy - v.both;
      if (either >= 10) overlap.push({ a: x, b: y, band: b, ratio: v.both / either, frames: v.both });
    }
    const i = integrated(acc.ms);
    const st = acc.st;
    const side = st.ll + st.rr - 2 * st.lr;
    const mid = st.ll + st.rr + 2 * st.lr;
    return {
      secs: acc.secs,
      frames: acc.frames,
      scenes: acc.scenes.size,
      mix: { bands: mixBands, k: mixK, prePeak: m.peaks.length ? 20 * Math.log10(Math.max(1e-10, percentile(m.peaks, 0.995))) : null, n: m.n },
      tracks,
      overlap,
      master: {
        i,
        tp: acc.tp,
        lra: loudnessRange(acc.ss),
        plr: Number.isFinite(i) && Number.isFinite(acc.tp) ? acc.tp - i : null,
        corr: st.ll > 0 ? correlation(st) : null,
        corrLow: acc.stLow.ll > 0 ? correlation(acc.stLow) : null,
        balance: st.ll > 0 && st.rr > 0 ? 10 * Math.log10(st.ll / st.rr) : 0,
        width: mid > 0 ? side / mid : 0, // énergie des côtés / du centre
        grMaster: acc.grMn ? acc.grM / acc.grMn : 0, // réduction moyenne du compresseur de la tranche Master
      },
    };
  }

  /* ------------------------------------------------------------------ cibles */
  /*
   * Objectifs de volume par style (LUFS intégrés, plafond true peak, PLR = crête − LUFS, LRA).
   * Les chansons du Band, mixées par js/bandmix.js, mesurent −11,5 à −13 LUFS intégrés en synthwave (médiane −12,4),
   * −11,5 à −14,8 en EDM (médiane −13,1), PLR 9,6 à 12,9 dB (tools/automix-calibrate.js).
   */
  const TARGETS = {
    streaming: { name: 'Streaming', lufs: -14, tp: -1, plr: [9, 15], lra: [4, 10], desc: 'Spotify, Apple Music, YouTube : −14 LUFS, plafond −1 dBTP' },
    synthwave: { name: 'Synthwave', lufs: -12, tp: -1, plr: [8, 13], lra: [3, 9], desc: 'dense mais dynamique : −12 LUFS, plafond −1 dBTP' },
    edm: { name: 'EDM mélodique', lufs: -11, tp: -1, plr: [7, 12], lra: [3, 9], desc: 'fort et serré : −11 LUFS, plafond −1 dBTP' },
    club: { name: 'Club', lufs: -8, tp: -1, plr: [6, 9], lra: [2, 7], desc: 'pour les sonos de club : −8 LUFS, plafond −1 dBTP' },
  };
  /** Objectif proposé d'après le style des pistes du Band (sinon le streaming, valable partout). */
  function proposeTarget(tracks) {
    const styles = (tracks || []).map((t) => t.band && t.band.style).filter(Boolean);
    if (styles.includes('edm')) return 'edm';
    if (styles.includes('synthwave')) return 'synthwave';
    return 'streaming';
  }

  /*
   * Niveau visé de chaque rôle par rapport au mix aux mêmes instants (dB, mesure pondérée K, pendant que la piste
   * joue : un kick se compare au mix pendant ses frappes).
   * Le kick et la basse portent le morceau, la caisse claire et le lead sont devant, les nappes et l'arpège
   * derrière, les cymbales en fond. Tolérance : ±3,5 dB.
   */
  // médianes mesurées sur les 20 chansons du Band (le tom, sans mesure, est estimé)
  const ROLE_LEVEL = {
    kick: -4.5, snare: -6, clap: -8.5, hat: -18, ohat: -19, tom: -10, cymbal: -17.5, perc: -16.5,
    bass: -8, pad: -16, arp: -15, lead: -9.5, keys: -9.5,
  };
  const ROLE_TOL = 3.5;
  /** Passe-haut conseillé par rôle (Hz) : seuls le kick, la basse et les toms descendent sous 100 Hz. */
  const ROLE_HP = { snare: 120, clap: 200, hat: 400, ohat: 350, cymbal: 350, perc: 150, pad: 150, arp: 200, lead: 160, keys: 100 };
  const LOW_ROLES = new Set(['kick', 'bass', 'tom']);

  /*
   * Courbes de référence (dB par bande d'octave, 0 = la bande la plus forte) : moyenne des chansons du Band de
   * chaque style (10 en synthwave, 10 en EDM ; écart type 2 à 3 dB par bande). Streaming : entre les deux ;
   * club : EDM avec plus d'infra-graves. La comparaison se fait après alignement (moyenne des écarts de 63 Hz à
   * 8 kHz retirée).
   */
  const CURVES = {
    streaming: [-11.5, 0, -2.5, -6, -5.5, -6.5, -10, -13, -14.5, -21],
    synthwave: [-10, 0, -4, -8.5, -5.5, -7, -12, -14.5, -16.5, -22.5],
    edm: [-13, 0, -1.5, -3.5, -5, -5.5, -8, -11, -12.5, -19.5],
    club: [-9, 0, -1.5, -4, -5.5, -6, -8.5, -11.5, -13, -20],
  };

  /** Écart du spectre du mix à la courbe du style, par bande (dB, après alignement). */
  function toneDeviation(mixBands, curve) {
    const top = Math.max(...mixBands);
    const rel = mixBands.map((v) => v - top);
    const diff = rel.map((v, b) => v - curve[b]);
    const off = mean(diff.slice(1, 9));
    return diff.map((d) => d - off);
  }

  /** Rôle d'une piste : celui que le Band lui a donné, sinon celui que devine la console (js/profiles.js). */
  const BAND_ROLE = { bass: 'bass', pad: 'pad', strings: 'pad', keys: 'keys', guitar: 'keys', arp: 'arp', lead: 'lead', vox: 'lead', sax: 'lead' };
  const BAND_DRUM = { bd: 'kick', sd: 'snare', cp: 'clap', rim: 'perc', hh: 'hat', oh: 'ohat', rd: 'cymbal', cr: 'cymbal', lt: 'tom', mt: 'tom', ht: 'tom' };
  function roleOf(t) {
    const key = t && t.band && t.band.key;
    if (key) {
      const [r, el] = key.split(':');
      if (r === 'drums') return BAND_DRUM[el] || 'perc';
      if (r === 'perc') return 'perc';
      if (BAND_ROLE[r]) return BAND_ROLE[r];
    }
    return SS.profiles ? SS.profiles.roleOf(t) : 'keys';
  }

  /** Note de 0 à 100 : pleine dans la tolérance, nulle à `zero` d'écart. */
  const grade = (dev, tol, zero) => {
    const d = Math.abs(dev);
    if (d <= tol) return 100;
    return Math.max(0, Math.round(100 * (1 - (d - tol) / (zero - tol))));
  };

  const CRITERIA = [
    { id: 'loud', name: 'Volume perçu', w: 1.2 },
    { id: 'dyn', name: 'Dynamique', w: 1 },
    { id: 'tone', name: 'Balance tonale', w: 1.2 },
    { id: 'bal', name: 'Équilibre des pistes', w: 1.2 },
    { id: 'low', name: 'Graves', w: 1.1 },
    { id: 'stereo', name: 'Stéréo', w: 0.8 },
    { id: 'head', name: 'Marge avant mastering', w: 0.6 },
  ];

  /* ------------------------------------------------------------------ préférences */
  /** Ce que l'assistant a le droit de modifier (page de préférences). */
  const SCOPES = [
    { id: 'fader', name: 'Volumes des pistes (faders)', desc: 'Équilibre entre les pistes' },
    { id: 'eq', name: 'Égaliseur des pistes', desc: 'Passe-haut, creux et bosses' },
    { id: 'comp', name: 'Compresseurs et limiteurs', desc: 'Pistes et Master' },
    { id: 'pan', name: 'Panoramique', desc: 'Placement gauche / droite' },
    { id: 'sidechain', name: 'Sidechain', desc: 'La basse s\'efface sous le kick' },
    { id: 'sends', name: 'Envois de reverb et d\'écho', desc: 'Profondeur, espace' },
    { id: 'mastereq', name: 'Égaliseur du Master', desc: 'Correction de la balance tonale globale' },
    { id: 'mastering', name: 'Mastering', desc: 'Volume final, plafond, graves en mono, largeur' },
  ];
  const DEFAULT_PREFS = {
    scopes: Object.fromEntries(SCOPES.map((s) => [s.id, true])),
    target: 'auto', // 'auto' : proposé d'après le style ; sinon un identifiant de TARGETS
    detail: 'all', // 'all' : tous les conseils ; 'important' : seulement prioritaires et conseillés
    minSecs: 20, // durée d'écoute avant un diagnostic
  };
  function cleanPrefs(p) {
    const o = { ...DEFAULT_PREFS, ...(p && typeof p === 'object' ? p : {}) };
    o.scopes = { ...DEFAULT_PREFS.scopes };
    if (p && p.scopes && typeof p.scopes === 'object') for (const s of SCOPES) if (typeof p.scopes[s.id] === 'boolean') o.scopes[s.id] = p.scopes[s.id];
    if (o.target !== 'auto' && !TARGETS[o.target]) o.target = 'auto';
    if (o.detail !== 'important') o.detail = 'all';
    o.minSecs = clamp(Number(o.minSecs) || 20, 10, 120);
    return o;
  }

  /* ------------------------------------------------------------------ valeurs et correctifs */
  /** Unité et pas d'arrondi d'un chemin de réglage. */
  function unitOf(path) {
    if (path === 'volumeDb' || /\.g$|\.th$|\.makeup$|ceil$|drive$|ceiling$/.test(path)) return { u: 'dB', step: 0.5 };
    if (/\.f$|mono$/.test(path)) return { u: 'Hz', step: 5 };
    if (/\.q$/.test(path)) return { u: '', step: 0.1 };
    if (/ratio$/.test(path)) return { u: ':1', step: 0.5 };
    if (/pan$/.test(path)) return { u: 'pan', step: 0.05 };
    if (/scDepth|send|width|clip/.test(path)) return { u: '%', step: 0.01 };
    if (/scRelease|rel$/.test(path)) return { u: 'ms', step: 0.005 };
    return { u: '', step: 0 };
  }
  /** Valeur lisible (« −3,5 dB », « 140 Hz », « G 30 », « 45 % »…). */
  function formatValue(path, v) {
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'string') return v ? v : 'aucun';
    if (!Number.isFinite(v)) return '—';
    const { u } = unitOf(path);
    const fr = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ',').replace('-', '−');
    if (u === 'dB') return (v > 0 ? '+' : '') + fr(v) + ' dB';
    if (u === 'Hz') return v >= 1000 ? fr(v / 1000, 1) + ' kHz' : Math.round(v) + ' Hz';
    if (u === ':1') return fr(v) + ':1';
    if (u === 'pan') return Math.abs(v) < 0.025 ? 'C' : (v < 0 ? 'G ' : 'D ') + Math.round(Math.abs(v) * 100);
    if (u === '%') return Math.round(v * 100) + ' %';
    if (u === 'ms') return Math.round(v * 1000) + ' ms';
    return fr(v, 2);
  }
  /** Valeur appliquée pour une intensité k (0,25 … 1,5) : seul l'écart numérique est dosé. */
  function valueAt(change, k = 1) {
    const { from, to } = change;
    if (change.fixed || typeof to !== 'number' || typeof from !== 'number') return to;
    const { step } = unitOf(change.path);
    let v = from + (to - from) * k;
    if (change.min != null) v = Math.max(change.min, v);
    if (change.max != null) v = Math.min(change.max, v);
    return step ? Math.round(v / step) * step : v;
  }

  /* ------------------------------------------------------------------ diagnostic et conseils */
  /**
   * ctx = {
   *   tracks: [{ id, name, role, mix (SS.mixParams), volumeDb, fx (SS.fxParams) }],
   *   master: SS.masterParams(project), target: identifiant de TARGETS, prefs
   * }
   * Rend { ready, scores, total, suggestions, hidden }.
   */
  function diagnose(sum, ctx) {
    const prefs = cleanPrefs(ctx.prefs);
    const T = TARGETS[ctx.target] || TARGETS.streaming;
    const curve = CURVES[ctx.target] || CURVES.streaming;
    const M = sum.master;
    const all = [];
    const S = (o) => all.push(o);
    const tr = ctx.tracks.filter((t) => sum.tracks[t.id] && sum.tracks[t.id].active > 0.05);
    const byRole = (r) => tr.filter((t) => t.role === r);
    const meas = (t) => sum.tracks[t.id];
    const ms = ctx.master.mastering;
    const mmix = ctx.master.mix;
    const sev = (d, crit, warn) => (Math.abs(d) >= crit ? 'crit' : Math.abs(d) >= warn ? 'warn' : 'info');
    const fr = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ',').replace('-', '−');
    const scores = {};

    /* --- volume perçu et crêtes --- */
    const devL = Number.isFinite(M.i) ? M.i - T.lufs : -20;
    scores.loud = Math.max(0, grade(devL, 1.5, 8) - (M.tp > T.tp + 0.2 ? Math.min(40, (M.tp - T.tp) * 20) : 0));
    if (Number.isFinite(M.i) && (Math.abs(devL) > 1.5 || M.tp > T.tp + 0.2)) {
      const changes = [];
      if (!ms.on) changes.push({ path: 'mastering.on', from: false, to: true, fixed: true });
      if (Math.abs(devL) > 1.5) changes.push({ path: 'mastering.drive', from: ms.drive, to: round(clamp(ms.drive - devL, -12, 18), 0.1), min: -12, max: 18 });
      if (ms.ceiling > T.tp) changes.push({ path: 'mastering.ceiling', from: ms.ceiling, to: T.tp, fixed: true });
      S({
        id: 'loud', tab: 'master', scope: 'mastering', crit: 'loud', track: '__master', sev: sev(devL, 3, 1.5),
        title: devL < -1.5 ? 'Le morceau est trop faible' : devL > 1.5 ? 'Le morceau est trop fort' : 'Les crêtes dépassent le plafond',
        why: `Volume intégré ${fr(M.i)} LUFS pour une cible ${T.name} de ${fr(T.lufs, 0)} LUFS. Le limiteur du mastering garde les crêtes sous ${fr(T.tp)} dBTP.`,
        meas: [['Intégré', fr(M.i) + ' LUFS'], ['True peak', fr(M.tp) + ' dBTP'], ['Cible', fr(T.lufs, 0) + ' LUFS']],
        changes,
      });
    }

    /* --- dynamique --- */
    const [plo, phi] = T.plr;
    let dynScore = M.plr == null ? 70 : M.plr < plo ? grade(plo - M.plr, 0, 6) : M.plr > phi ? grade(M.plr - phi, 0, 8) : 100;
    const squashed = tr.filter((t) => t.mix.comp.on && meas(t).grMean > 6);
    dynScore = Math.max(0, dynScore - Math.min(40, squashed.length * 12));
    scores.dyn = dynScore;
    if (M.plr != null && M.plr < plo - 0.5 && Number.isFinite(M.i) && M.i > T.lufs - 1.5) {
      const d = plo - M.plr;
      const changes = [{ path: 'mastering.drive', from: ms.drive, to: round(ms.drive - Math.min(4, d), 0.1) }];
      if (ms.clip < 0.3) changes.push({ path: 'mastering.clip', from: ms.clip, to: 0.35 });
      S({
        id: 'plr', tab: 'master', scope: 'mastering', crit: 'dyn', track: '__master', sev: sev(d, 3, 1.5),
        title: 'Le limiteur écrase le morceau',
        why: `L'écart entre les crêtes et le volume moyen (PLR) n'est que de ${fr(M.plr)} dB : les attaques s'émoussent et le son fatigue. L'écrêtage doux arrondit les pointes à la place du limiteur.`,
        meas: [['PLR', fr(M.plr) + ' dB'], ['Cible', `${plo}–${phi} dB`]],
        changes,
      });
    }
    for (const t of squashed) {
      const c = t.mix.comp;
      const m = meas(t);
      S({
        id: 'comp:' + t.id, tab: 'mix', scope: 'comp', crit: 'dyn', track: t.id, sev: m.grMean > 9 ? 'warn' : 'info',
        title: `${t.name} : compresseur trop appuyé`,
        why: `Le compresseur retire en moyenne ${fr(m.grMean)} dB : l'attaque disparaît et le son pompe.`,
        meas: [['Réduction moyenne', fr(m.grMean) + ' dB'], ['Cible', '≤ 6 dB']],
        changes: [
          { path: 'mix.comp.ratio', from: c.ratio, to: round(Math.max(2, c.ratio * 0.6), 0.5) },
          { path: 'mix.comp.th', from: c.th, to: round(Math.min(0, c.th + Math.min(8, m.grMean - 4)), 0.5) },
        ],
      });
    }
    // compresseur du Master (« glue ») trop fort
    if (sum.master.grMaster > 5 && mmix.comp.on) {
      S({
        id: 'mcomp', tab: 'master', scope: 'comp', crit: 'dyn', track: '__master', sev: 'warn',
        title: 'Le compresseur du Master serre trop',
        why: `Il retire en moyenne ${fr(sum.master.grMaster)} dB avant le mastering : le mix pompe.`,
        meas: [['Réduction moyenne', fr(sum.master.grMaster) + ' dB'], ['Cible', '1–3 dB']],
        changes: [
          { path: 'mix.comp.ratio', from: mmix.comp.ratio, to: 2 },
          { path: 'mix.comp.th', from: mmix.comp.th, to: round(Math.min(0, mmix.comp.th + Math.min(8, sum.master.grMaster - 2)), 0.5) },
        ],
      });
    }

    /* --- équilibre des pistes --- */
    const balGrades = [];
    const roleCount = {};
    tr.forEach((t) => (roleCount[t.role] = (roleCount[t.role] || 0) + 1));
    for (const t of tr) {
      const goal = ROLE_LEVEL[t.role];
      if (goal == null) continue;
      // plusieurs pistes du même rôle se partagent la place
      const target = goal - 5 * Math.log10(roleCount[t.role]);
      const dev = meas(t).rel - target;
      balGrades.push(grade(dev, ROLE_TOL, 12));
      if (Math.abs(dev) <= ROLE_TOL) continue;
      const delta = round(clamp(-dev, -9, 9), 0.5);
      S({
        id: 'bal:' + t.id, tab: 'mix', scope: 'fader', crit: 'bal', track: t.id, sev: sev(dev, 8, 5.5),
        title: dev < 0 ? `${t.name} est trop en retrait` : `${t.name} est trop en avant`,
        why: `Dans les mixages de référence, ${ROLE_ART[t.role] || 'cette piste'} se place vers ${fr(target)} dB sous le mix pendant que la piste joue ; ici : ${fr(meas(t).rel)} dB.`,
        meas: [['Niveau / mix', fr(meas(t).rel) + ' dB'], ['Cible', fr(target) + ' ±3,5 dB']],
        changes: [{ path: 'volumeDb', from: round(t.volumeDb, 0.1), to: round(clamp(t.volumeDb + delta, -40, 6), 0.5), max: 6 }],
      });
    }
    scores.bal = balGrades.length ? Math.round(mean(balGrades)) : 80;

    /* --- graves : kick ↔ basse, grave inutile ailleurs --- */
    const kick = byRole('kick')[0];
    const bass = byRole('bass')[0];
    let lowScore = 100;
    const kb = kick && bass ? sum.overlap.find((o) => [o.a, o.b].includes(kick.id) && [o.a, o.b].includes(bass.id) && o.band === 1) : null;
    if (kb) {
      lowScore -= 100 - grade(kb.ratio, 0.4, 0.9);
      if (kb.ratio > 0.45) {
        const f = bass.fx;
        const changes = [];
        let scope = 'sidechain';
        if (f.scSource !== kick.id) {
          changes.push({ path: 'fx.scSource', from: f.scSource || '', to: kick.id, fixed: true, label: kick.name });
          changes.push({ path: 'fx.scDepth', from: 0, to: 0.5 });
          changes.push({ path: 'fx.scRelease', from: f.scRelease, to: 0.15, fixed: true });
        } else if (f.scDepth < 0.8) changes.push({ path: 'fx.scDepth', from: f.scDepth, to: round(Math.min(0.9, f.scDepth + 0.25), 0.05) });
        if (!changes.length || !prefs.scopes.sidechain) {
          // sans sidechain : creux sur la basse là où tape le kick (cloche libre la plus proche)
          scope = 'eq';
          changes.length = 0;
          eqBell(changes, bass.mix, 60, -2.5, 1.4);
        }
        S({
          id: 'kickbass', tab: 'mix', scope, crit: 'low', track: bass.id, sev: kb.ratio > 0.7 ? 'crit' : 'warn',
          title: 'Le kick et la basse se masquent',
          why: `Vers 63 Hz, la basse couvre le kick ${Math.round(kb.ratio * 100)} % du temps : le grave est flou et le kick perd son impact.`,
          meas: [['Recouvrement 45–90 Hz', Math.round(kb.ratio * 100) + ' %'], ['Cible', '< 40 %']],
          changes,
        });
      }
    }
    // grave inutile sur les pistes qui n'en ont pas besoin
    for (const t of tr) {
      if (LOW_ROLES.has(t.role) || !ROLE_HP[t.role]) continue;
      const m = meas(t);
      const lowShare = (m.share[0] + m.share[1] + m.share[2] / 2) / 2.5;
      const own = Math.pow(10, m.bands[1] / 10) + Math.pow(10, m.bands[0] / 10);
      const tot = m.bands.reduce((a, v) => a + Math.pow(10, v / 10), 0);
      const hp = t.mix.eq;
      const cur = hp.on && hp.hp.on ? hp.hp.f : 20;
      if (lowShare < 0.08 || own / tot < 0.05 || cur >= ROLE_HP[t.role] * 0.8) continue;
      lowScore -= Math.min(25, lowShare * 100);
      const changes = [];
      if (!hp.on) changes.push({ path: 'mix.eq.on', from: false, to: true, fixed: true });
      if (!hp.hp.on) changes.push({ path: 'mix.eq.hp.on', from: false, to: true, fixed: true });
      changes.push({ path: 'mix.eq.hp.f', from: cur, to: ROLE_HP[t.role], min: 20 });
      S({
        id: 'hp:' + t.id, tab: 'mix', scope: 'eq', crit: 'low', track: t.id, sev: lowShare > 0.2 ? 'warn' : 'info',
        title: `${t.name} encombre les graves`,
        why: `Cette piste apporte ${Math.round(lowShare * 100)} % de l'énergie sous 125 Hz alors qu'elle n'en a pas besoin : un passe-haut laisse la place au kick et à la basse.`,
        meas: [['Part des graves', Math.round(lowShare * 100) + ' %'], ['Passe-haut', cur > 20 ? Math.round(cur) + ' Hz' : 'aucun']],
        changes,
      });
    }
    if (M.corrLow != null && M.corrLow < 0.85) {
      lowScore -= Math.round((0.85 - M.corrLow) * 60);
      S({
        id: 'mono', tab: 'master', scope: 'mastering', crit: 'low', track: '__master', sev: M.corrLow < 0.6 ? 'warn' : 'info',
        title: 'Les graves ne sont pas mono',
        why: `Sous 120 Hz, la corrélation gauche / droite est de ${fr(M.corrLow, 2)} : le grave s'affaiblit sur un système mono (enceinte Bluetooth, club).`,
        meas: [['Corrélation < 120 Hz', fr(M.corrLow, 2)], ['Cible', '> 0,9']],
        changes: [...(!ms.on ? [{ path: 'mastering.on', from: false, to: true, fixed: true }] : []), { path: 'mastering.mono', from: ms.mono, to: Math.max(120, ms.mono + 30) }],
      });
    }
    scores.low = clamp(Math.round(lowScore), 0, 100);

    /* --- balance tonale --- */
    const dev = toneDeviation(sum.mix.bands, curve);
    scores.tone = grade(mean(dev.slice(1, 10).map(Math.abs)), 2.5, 8);
    const zoneDev = (z) => mean(ZONES[z].bands.map((b) => dev[b]));
    const topIn = (bands, exclude = []) =>
      tr.filter((t) => !exclude.includes(t.role)).map((t) => ({ t, s: mean(bands.map((b) => meas(t).share[b])) })).sort((a, b) => b.s - a.s)[0];
    const lm = zoneDev('lowmid');
    if (lm > 3.5) {
      const top = topIn([3, 4], ['kick']);
      if (top && top.s > 0.15) {
        const f = dev[3] > dev[4] ? 300 : 450;
        const changes = [];
        eqBell(changes, top.t.mix, f, -round(Math.min(4.5, lm), 0.5), 1.2);
        S({
          id: 'lowmid', tab: 'mix', scope: 'eq', crit: 'tone', track: top.t.id, sev: lm > 4.5 ? 'warn' : 'info',
          title: `${top.t.name} rend le mix boueux`,
          why: `Le mix a ${fr(lm)} dB de trop dans les bas-médiums (250–500 Hz) par rapport à la courbe ${T.name}, et ${top.t.name} en apporte ${Math.round(top.s * 100)} %.`,
          meas: [['250–500 Hz', '+' + fr(lm) + ' dB'], ['Cible', '±3,5 dB']],
          changes,
        });
      }
    }
    const hm = zoneDev('himid');
    if (hm > 3.5) {
      const top = topIn([6, 7]);
      if (top && top.s > 0.15) {
        const changes = [];
        eqBell(changes, top.t.mix, 3000, -round(Math.min(4, hm), 0.5), 1.2);
        S({
          id: 'himid', tab: 'mix', scope: 'eq', crit: 'tone', track: top.t.id, sev: hm > 4.5 ? 'warn' : 'info',
          title: `${top.t.name} est agressif`,
          why: `Les hauts-médiums (2–6 kHz) dépassent la courbe de ${fr(hm)} dB : fatigue d'écoute, surtout au casque. ${top.t.name} en apporte ${Math.round(top.s * 100)} %.`,
          meas: [['2–6 kHz', '+' + fr(hm) + ' dB'], ['Cible', '±3,5 dB']],
          changes,
        });
      }
    }
    const air = zoneDev('air');
    if (air < -3.5 || air > 3.5) {
      const g = round(clamp(-air * 0.6, -3, 2.5), 0.5);
      S({
        id: 'air', tab: 'master', scope: 'mastereq', crit: 'tone', track: '__master', sev: Math.abs(air) > 5 ? 'warn' : 'info',
        title: air < 0 ? 'Il manque de l\'air' : 'Les aigus sont trop brillants',
        why: `Au-dessus de 6 kHz, le mix est ${fr(Math.abs(air))} dB ${air < 0 ? 'sous' : 'au-dessus de'} la courbe ${T.name}.`,
        meas: [['6–20 kHz', (air > 0 ? '+' : '') + fr(air) + ' dB'], ['Cible', '±3,5 dB']],
        changes: [
          ...(!mmix.eq.on ? [{ path: 'mix.eq.on', from: false, to: true, fixed: true }] : []),
          { path: 'mix.eq.high.f', from: mmix.eq.high.f, to: 10000, fixed: true },
          { path: 'mix.eq.high.g', from: mmix.eq.high.g, to: round(mmix.eq.high.g + g, 0.5) },
        ],
      });
    }
    const low = zoneDev('low');
    if (Math.abs(low) > 4) {
      const g = round(clamp(-low * 0.5, -3, 2.5), 0.5);
      S({
        id: 'lowtone', tab: 'master', scope: 'mastereq', crit: 'tone', track: '__master', sev: Math.abs(low) > 6 ? 'warn' : 'info',
        title: low < 0 ? 'Le grave manque de poids' : 'Le grave déborde',
        why: `Entre 45 et 180 Hz, le mix est ${fr(Math.abs(low))} dB ${low < 0 ? 'sous' : 'au-dessus de'} la courbe ${T.name}.`,
        meas: [['45–180 Hz', (low > 0 ? '+' : '') + fr(low) + ' dB'], ['Cible', '±3 dB']],
        changes: [
          ...(!mmix.eq.on ? [{ path: 'mix.eq.on', from: false, to: true, fixed: true }] : []),
          { path: 'mix.eq.low.f', from: mmix.eq.low.f, to: 100, fixed: true },
          { path: 'mix.eq.low.g', from: mmix.eq.low.g, to: round(mmix.eq.low.g + g, 0.5) },
        ],
      });
    }
    // masquage dans les médiums : le lead couvert par un autre instrument
    const lead = byRole('lead')[0];
    if (lead) {
      const rivals = sum.overlap
        .filter((o) => o.band >= 5 && o.band <= 7 && (o.a === lead.id || o.b === lead.id) && o.ratio > 0.55)
        .map((o) => ({ o, t: tr.find((t) => t.id === (o.a === lead.id ? o.b : o.a)) }))
        .filter((x) => x.t && ['arp', 'pad', 'keys'].includes(x.t.role))
        .sort((a, b) => b.o.ratio - a.o.ratio);
      if (rivals.length) {
        const { o, t } = rivals[0];
        const changes = [];
        eqBell(changes, t.mix, BANDS[o.band] * 1.25, -2.5, 1.2);
        S({
          id: 'mask:' + t.id, tab: 'mix', scope: 'eq', crit: 'bal', track: t.id, sev: o.ratio > 0.75 ? 'warn' : 'info',
          title: `${lead.name} est masqué par ${t.name}`,
          why: `Autour de ${BAND_LABEL[o.band]}, ${t.name} est aussi fort que le lead ${Math.round(o.ratio * 100)} % du temps. Un creux sur ${t.name} libère la place de la mélodie.`,
          meas: [['Recouvrement ' + BAND_LABEL[o.band], Math.round(o.ratio * 100) + ' %'], ['Cible', '< 50 %']],
          changes,
        });
      }
    }

    /* --- stéréo --- */
    let stScore = 100;
    if (M.corr != null) {
      if (M.corr < 0.2) {
        stScore -= Math.round((0.2 - M.corr) * 150);
        S({
          id: 'phase', tab: 'master', scope: 'mastering', crit: 'stereo', track: '__master', sev: M.corr < 0 ? 'crit' : 'warn',
          title: 'Le mix est trop large',
          why: `Corrélation gauche / droite ${fr(M.corr, 2)} : des sons s'annulent en mono. Resserrer la largeur stéréo du mastering.`,
          meas: [['Corrélation', fr(M.corr, 2)], ['Cible', '> 0,3']],
          changes: [{ path: 'mastering.width', from: ms.width, to: round(Math.min(ms.width, 1) * 0.8, 0.05) }],
        });
      }
      if (Math.abs(M.balance) > 1.2) stScore -= Math.min(30, Math.round((Math.abs(M.balance) - 1) * 10));
    }
    // tout au centre : les instruments d'accompagnement sont répartis à gauche et à droite
    const PAN_SPREAD = { hat: 0.25, ohat: -0.25, cymbal: -0.3, perc: -0.3, arp: 0.3, keys: -0.2, tom: 0.25 };
    const centered = tr.filter((t) => PAN_SPREAD[t.role] != null && Math.abs(t.mix.pan) < 0.08);
    const spread = tr.filter((t) => Math.abs(t.mix.pan) >= 0.15).length;
    if (centered.length >= 1 && spread < 2 && M.width < 0.03) {
      stScore -= 20;
      let side = 1;
      const changes = centered.slice(0, 3).map((t) => {
        const v = Math.abs(PAN_SPREAD[t.role]) * side;
        side = -side;
        return { path: 'mix.pan', track: t.id, from: t.mix.pan, to: v, label: t.name };
      });
      S({
        id: 'pan', tab: 'mix', scope: 'pan', crit: 'stereo', track: centered[0].id, sev: 'info',
        title: 'Tout est au centre',
        why: `L'image stéréo est étroite (côtés ${Math.round(M.width * 100)} % du centre). Écarter l'accompagnement libère le centre pour le kick, la basse, la caisse claire et le lead.`,
        meas: [['Largeur', Math.round(M.width * 100) + ' %'], ['Cible', '3–25 %']],
        changes,
      });
    }
    scores.stereo = clamp(Math.round(stScore), 0, 100);

    /* --- marge avant mastering --- */
    const pk = sum.mix.prePeak;
    scores.head = pk == null ? 80 : pk > -1 ? grade(pk + 4, 0, 6) : pk < -20 ? grade(-20 - pk, 0, 12) : 100;
    if (pk != null && (pk > -1 || pk < -20)) {
      const d = round(pk > -1 ? -(pk + 5) : -(pk + 10), 0.5);
      const changes = [{ path: 'volumeDb', from: round(ctx.master.volumeDb, 0.1), to: round(ctx.master.volumeDb + d, 0.5), max: 6 }];
      if (ms.on) changes.push({ path: 'mastering.drive', from: ms.drive, to: round(clamp(ms.drive - d, -12, 18), 0.1), fixed: true });
      S({
        id: 'head', tab: 'master', scope: 'fader', crit: 'head', track: '__master', sev: pk > 0 ? 'warn' : 'info',
        title: pk > -1 ? 'Le Master sature avant le mastering' : 'Le mix arrive trop faible au Master',
        why: pk > -1
          ? `Les crêtes atteignent ${fr(pk)} dBFS avant le mastering : le compresseur et le limiteur du Master travaillent trop. Baisser le fader du Master et compenser au gain d'entrée du mastering garde le même volume final.`
          : `Les crêtes plafonnent à ${fr(pk)} dBFS : il faut trop de gain au mastering, ce qui remonte le bruit et les défauts.`,
        meas: [['Crête avant mastering', fr(pk) + ' dBFS'], ['Cible', '−6 à −3 dBFS']],
        changes,
      });
    }

    /* --- espace : envois de reverb --- */
    for (const t of tr) {
      const f = t.fx;
      if (LOW_ROLES.has(t.role) && t.role !== 'tom') {
        const wet = f.sendHall + f.sendPlate + f.room;
        if (wet > 0.12)
          S({
            id: 'dry:' + t.id, tab: 'mix', scope: 'sends', crit: 'low', track: t.id, sev: 'info',
            title: `${t.name} : reverb dans le grave`,
            why: 'La reverb sur le kick ou la basse brouille le grave. Les mixages pro les gardent secs et donnent l\'espace aux autres pistes.',
            meas: [['Envois', Math.round(wet * 100) + ' %'], ['Cible', '0–10 %']],
            changes: [
              ...(f.sendHall > 0 ? [{ path: 'fx.sendHall', from: f.sendHall, to: 0 }] : []),
              ...(f.sendPlate > 0 ? [{ path: 'fx.sendPlate', from: f.sendPlate, to: 0 }] : []),
              ...(f.room > 0 ? [{ path: 'fx.room', from: f.room, to: 0 }] : []),
            ],
          });
      } else if (['pad', 'lead'].includes(t.role) && f.sendHall + f.room + f.sendPlate < 0.05) {
        S({
          id: 'wet:' + t.id, tab: 'mix', scope: 'sends', crit: 'stereo', track: t.id, sev: 'info',
          title: `${t.name} manque d'espace`,
          why: `Sans reverb, ${ROLE_NAME[t.role]} reste collé aux enceintes. Un envoi vers la reverb « hall » partagée lui donne de la profondeur.`,
          meas: [['Envoi hall', Math.round(f.sendHall * 100) + ' %'], ['Habituel', t.role === 'pad' ? '30–40 %' : '15–25 %']],
          changes: [{ path: 'fx.sendHall', from: f.sendHall, to: t.role === 'pad' ? 0.35 : 0.2 }],
        });
      }
    }

    /* --- chaînes de départ : pistes à plat (égaliseur, compresseur et limiteur coupés) --- */
    const chainTracks = new Set();
    for (const t of tr) {
      const mx = t.mix;
      if (mx.eq.on || mx.comp.on || mx.lim.on) continue;
      const rule = ruleFor(t);
      if (!rule) continue;
      const m = meas(t);
      const mods = [];
      // égaliseur : la règle du rôle (passe-haut, creux de boue, présence, air)
      if (rule.eq) {
        const e = rule.eq;
        const ch = [{ path: 'mix.eq.on', from: false, to: true, fixed: true }];
        if (e.hp.on) ch.push({ path: 'mix.eq.hp.on', from: false, to: true, fixed: true }, { path: 'mix.eq.hp.f', from: mx.eq.hp.f, to: e.hp.f, fixed: true });
        for (const b of ['low', 'lm', 'hm', 'high']) {
          if (!e[b].g) continue;
          ch.push({ path: `mix.eq.${b}.f`, from: mx.eq[b].f, to: e[b].f, fixed: true });
          if ('q' in e[b]) ch.push({ path: `mix.eq.${b}.q`, from: mx.eq[b].q, to: e[b].q, fixed: true });
          ch.push({ path: `mix.eq.${b}.g`, from: 0, to: e[b].g });
        }
        mods.push({ k: 'EQ', scope: 'eq', on: true, changes: ch });
      }
      // compresseur : seuil sous la crête mesurée à l'entrée de la tranche, ratio selon la dynamique du son
      if (rule.comp) {
        const c = rule.comp;
        let th = c.th;
        if (m.inPeak != null && rule.below) th = round(clamp(m.inPeak - rule.below, -50, -1), 0.5);
        let ratio = c.ratio;
        if (m.crest != null && m.crest > 18) ratio = Math.min(6, ratio + 1);
        if (m.crest != null && m.crest < 8) ratio = Math.max(1.5, ratio - 0.5);
        mods.push({
          k: 'COMP', scope: 'comp', on: true, below: m.inPeak != null && rule.below ? rule.below : null,
          changes: [
            { path: 'mix.comp.on', from: false, to: true, fixed: true },
            { path: 'mix.comp.th', from: 0, to: th },
            { path: 'mix.comp.ratio', from: 1, to: ratio, min: 1 },
            { path: 'mix.comp.att', from: mx.comp.att, to: c.att, fixed: true },
            { path: 'mix.comp.rel', from: mx.comp.rel, to: c.rel, fixed: true },
            { path: 'mix.comp.knee', from: mx.comp.knee, to: c.knee, fixed: true },
            { path: 'mix.comp.makeup', from: 0, to: c.makeup || 0 },
          ],
        });
      }
      // limiteur : sur les frappes de batterie, et sur toute piste aux crêtes brutales (6 dB au-dessus des crêtes habituelles)
      const spikes = m.inPeak != null && m.inP90 != null ? m.inPeak - m.inP90 : 0;
      const hit = ['kick', 'snare', 'clap', 'tom'].includes(t.role);
      if (m.inPeak != null && (hit || spikes > 6)) {
        mods.push({
          k: 'LIM', scope: 'comp', on: spikes > (hit ? 4 : 6), spikes,
          changes: [
            { path: 'mix.lim.on', from: false, to: true, fixed: true },
            { path: 'mix.lim.ceil', from: mx.lim.ceil, to: round(clamp(m.inPeak - 3, -40, -0.5), 0.5), fixed: true },
            { path: 'mix.lim.rel', from: mx.lim.rel, to: 0.05, fixed: true },
          ],
        });
      }
      if (!mods.length) continue;
      chainTracks.add(t.id);
      const dyn = rule.comp ? 'warn' : 'info';
      S({
        id: 'chain:' + t.id, kind: 'chain', tab: 'mix', scope: 'eq', crit: 'dyn', track: t.id, sev: dyn,
        title: `${t.name} : chaîne de départ`,
        why: `Tranche à plat. Point de départ des mixages de référence pour ${ROLE_ART[t.role] || 'cette piste'}, calé sur ta piste${rule.comp ? ' : le seuil du compresseur suit sa crête mesurée' : ''}.`,
        meas: [
          ...(m.inPeak != null ? [['Crête', fr(m.inPeak) + ' dBFS']] : []),
          ...(m.crest != null ? [['Dynamique', fr(m.crest, 0) + ' dB']] : []),
          ...(spikes > 6 ? [['Crêtes brutales', '+' + fr(spikes, 0) + ' dB']] : []),
        ],
        modules: mods,
        changes: mods.flatMap((x) => x.changes),
      });
    }

    /* --- corrections des pistes déjà traitées : compresseur inactif, attaque trop rapide, limiteur qui travaille sans arrêt --- */
    for (const t of tr) {
      if (chainTracks.has(t.id)) continue;
      const m = meas(t);
      const c = t.mix.comp;
      const rule = ruleFor(t);
      if (c.on && m.grMax < 1 && m.inPeak != null && rule && rule.comp && rule.below) {
        const th = round(clamp(m.inPeak - rule.below, -50, -1), 0.5);
        if (th < c.th - 2)
          S({
            id: 'compidle:' + t.id, tab: 'mix', scope: 'comp', crit: 'dyn', track: t.id, sev: 'info',
            title: `${t.name} : le compresseur ne travaille pas`,
            why: `Son seuil (${fr(c.th)} dB) est au-dessus des crêtes de la piste (${fr(m.inPeak)} dBFS) : il ne retire rien. Placé ${rule.below} dB sous la crête, il tient les notes fortes.`,
            meas: [['Réduction', fr(m.grMax) + ' dB au plus'], ['Habituel', '3–6 dB']],
            changes: [{ path: 'mix.comp.th', from: c.th, to: th }],
          });
      }
      if (c.on && ['kick', 'snare', 'clap', 'tom'].includes(t.role) && c.att < 0.003 && m.grMean > 2)
        S({
          id: 'att:' + t.id, tab: 'mix', scope: 'comp', crit: 'dyn', track: t.id, sev: 'info',
          title: `${t.name} : attaque du compresseur trop rapide`,
          why: `Une attaque de ${Math.round(c.att * 1000)} ms écrase le claquement de la frappe. Vers 10 ms, le compresseur laisse passer l'attaque et tient la suite.`,
          meas: [['Attaque', Math.round(c.att * 1000) + ' ms'], ['Habituel', '5–15 ms']],
          changes: [{ path: 'mix.comp.att', from: c.att, to: 0.01, fixed: true }],
        });
      const l = t.mix.lim;
      // sur une frappe de batterie, le limiteur rabote volontairement l'attaque (2 à 6 dB mesurés sur les chansons du Band)
      const limMax = ['kick', 'snare', 'clap', 'tom'].includes(t.role) ? 7 : 3;
      if (l.on && m.limGr > limMax)
        S({
          id: 'lim:' + t.id, tab: 'mix', scope: 'comp', crit: 'dyn', track: t.id, sev: m.limGr > limMax + 3 ? 'warn' : 'info',
          title: `${t.name} : le limiteur travaille sans arrêt`,
          why: `Il retire en moyenne ${fr(m.limGr)} dB : il écrase la piste au lieu de ne rattraper que les crêtes.`,
          meas: [['Réduction moyenne', fr(m.limGr) + ' dB'], ['Habituel', limMax > 3 ? '2–6 dB sur une frappe' : '0–2 dB']],
          changes: [{ path: 'mix.lim.ceil', from: l.ceil, to: round(Math.min(0, l.ceil + m.limGr - 1), 0.5), max: 0 }],
        });
    }

    /* --- chaîne de mastering : Master à plat (module de mastering coupé) --- */
    const masterChain = [];
    if (!ms.on) {
      const gLow = round(clamp(-zoneDev('low') * 0.5, -2, 2), 0.5);
      const gHigh = round(clamp(-zoneDev('air') * 0.6, -2.5, 2.5), 0.5);
      if (!mmix.eq.on)
        masterChain.push({
          k: 'EQ', scope: 'mastereq', on: true,
          changes: [
            { path: 'mix.eq.on', from: false, to: true, fixed: true },
            { path: 'mix.eq.hp.on', from: false, to: true, fixed: true },
            { path: 'mix.eq.hp.f', from: mmix.eq.hp.f, to: 25, fixed: true },
            { path: 'mix.eq.low.f', from: mmix.eq.low.f, to: 100, fixed: true },
            { path: 'mix.eq.low.g', from: 0, to: gLow },
            { path: 'mix.eq.high.f', from: mmix.eq.high.f, to: 10000, fixed: true },
            { path: 'mix.eq.high.g', from: 0, to: gHigh },
          ],
        });
      const D = SS.MASTER_DEFAULTS.mix.comp;
      const defaultGlue = !mmix.comp.on || (mmix.comp.th === D.th && mmix.comp.ratio === D.ratio);
      if (defaultGlue) {
        // « glue » : 2:1 lent, seuil quelques dB sous les crêtes du mix → 1 à 2 dB de réduction sur les passages forts
        const pk = sum.mix.prePeak != null ? sum.mix.prePeak - ctx.master.volumeDb : -6;
        masterChain.push({
          k: 'COMP', scope: 'comp', on: true, glue: true,
          changes: [
            { path: 'mix.comp.on', from: false, to: true, fixed: true },
            { path: 'mix.comp.th', from: 0, to: round(clamp(pk - 5, -30, -3), 0.5) },
            { path: 'mix.comp.ratio', from: 1, to: 2, min: 1 },
            { path: 'mix.comp.att', from: mmix.comp.att, to: 0.03, fixed: true },
            { path: 'mix.comp.rel', from: mmix.comp.rel, to: 0.2, fixed: true },
            { path: 'mix.comp.knee', from: mmix.comp.knee, to: 8, fixed: true },
            { path: 'mix.comp.makeup', from: mmix.comp.makeup, to: 0, fixed: true },
          ],
        });
      }
      const drive = Number.isFinite(M.i) ? round(clamp(-devL, -6, 14), 0.1) : 0;
      masterChain.push({
        k: 'MAST', scope: 'mastering', on: true,
        changes: [
          { path: 'mastering.on', from: false, to: true, fixed: true },
          { path: 'mastering.mono', from: ms.mono, to: ctx.target === 'edm' || ctx.target === 'club' ? 120 : 100, fixed: true },
          // aigus un peu élargis, sauf si le mix est déjà trop large (corrélation faible)
          { path: 'mastering.width', from: 1, to: M.corr != null && M.corr < 0.2 ? 0.85 : 1.1 },
          { path: 'mastering.clip', from: 0, to: 0.3 },
          { path: 'mastering.ceiling', from: ms.ceiling, to: T.tp, fixed: true },
          { path: 'mastering.release', from: ms.release, to: 0.15, fixed: true },
          { path: 'mastering.drive', from: 0, to: drive },
        ],
      });
      S({
        id: 'mchain', kind: 'chain', tab: 'master', scope: 'mastering', crit: 'loud', track: '__master', sev: 'warn',
        title: 'Master : chaîne de mastering',
        why: `Le mastering est coupé : sans limiteur, les crêtes passent et le grave n'est pas tenu en mono. Chaîne des mixages de référence, réglée pour l'objectif ${T.name} (${fr(T.lufs, 0)} LUFS).`,
        meas: [
          ...(Number.isFinite(M.i) ? [['Intégré', fr(M.i) + ' LUFS']] : []),
          ...(Number.isFinite(M.tp) ? [['True peak', fr(M.tp) + ' dBTP']] : []),
          ['Objectif', fr(T.lufs, 0) + ' LUFS'],
        ],
        modules: masterChain,
        changes: masterChain.flatMap((x) => x.changes),
      });
    }

    /* --- note globale et filtrage selon les préférences --- */
    const W = CRITERIA.reduce((a, c) => a + c.w, 0);
    const total = Math.round(CRITERIA.reduce((a, c) => a + (scores[c.id] ?? 0) * c.w, 0) / W);
    const RANK = { crit: 0, warn: 1, info: 2 };
    const ORDER = ['head', 'bal', 'low', 'tone', 'dyn', 'stereo', 'loud'];
    // une chaîne ne garde que les modules autorisés ; elle remplace les corrections qui touchent les mêmes réglages
    const kept = [];
    for (const s of all) {
      if (s.kind !== 'chain') continue;
      s.modules = s.modules.filter((x) => prefs.scopes[x.scope] !== false);
      s.changes = s.modules.flatMap((x) => x.changes);
      s.scope = s.modules.length ? s.modules[0].scope : s.scope;
      if (s.modules.length) kept.push(s);
    }
    const covered = (s) =>
      s.id !== 'kickbass' && // le masquage kick / basse reste un conseil à part
      kept.some((c) => c.track === s.track && c.modules.some((x) => x.scope === s.scope || (s.track === '__master' && x.k === 'MAST' && s.scope === 'mastering')));
    const visible = all
      .filter((s) => (s.kind === 'chain' ? kept.includes(s) : !covered(s)))
      .filter((s) => s.changes.length && prefs.scopes[s.scope] !== false && (prefs.detail === 'all' || s.sev !== 'info'))
      .sort((a, b) =>
        a.tab !== b.tab ? (a.tab === 'mix' ? -1 : 1)
        : (a.kind === 'chain') !== (b.kind === 'chain') ? (a.kind === 'chain' ? -1 : 1)
        : RANK[a.sev] - RANK[b.sev] || ORDER.indexOf(a.crit) - ORDER.indexOf(b.crit));
    return { ready: sum.secs >= prefs.minSecs, final: sum.secs >= prefs.minSecs * 3, scores, total, suggestions: visible, hidden: all.length - visible.length, deviation: dev };
  }

  /** Règle de traitement du rôle (js/bandmix.js : égaliseur, compresseur, seuil sous la crête). */
  const ROLE_RULE = {
    kick: ['DRUM', 'bd'], snare: ['DRUM', 'sd'], clap: ['DRUM', 'cp'], hat: ['DRUM', 'hh'], ohat: ['DRUM', 'oh'], cymbal: ['DRUM', 'cr'],
    tom: ['DRUM', 'mt'], perc: ['DRUM', 'perc'], bass: ['INST', 'bass'], pad: ['INST', 'pad'], arp: ['INST', 'arp'], lead: ['INST', 'lead'], keys: ['INST', 'keys'],
  };
  function ruleFor(t) {
    const B = SS.bandMix;
    if (!B) return null;
    const own = t.band && t.band.key ? B.ruleOf(t) : null;
    if (own) return own;
    const r = ROLE_RULE[t.role];
    return r ? B[r[0]][r[1]] : null;
  }

  /** Description d'un module de chaîne pour l'intensité k (texte, parties dorées entre ⟨ ⟩). */
  function moduleDesc(mod, k = 1) {
    const v = (path) => {
      const c = mod.changes.find((x) => x.path === path);
      return c ? valueAt(c, k) : undefined;
    };
    const f = (x) => formatValue('x.f', x);
    const g = (x) => (x > 0 ? '+' : '') + (Math.round(x * 10) / 10).toString().replace('.', ',').replace('-', '−');
    const out = [];
    if (mod.k === 'EQ') {
      if (v('mix.eq.hp.on')) out.push(`Passe-haut ⟨${f(v('mix.eq.hp.f'))}⟩`);
      if (v('mix.eq.low.g')) out.push(`shelf grave ${f(v('mix.eq.low.f'))} ⟨${g(v('mix.eq.low.g'))}⟩`);
      for (const b of ['lm', 'hm']) if (v(`mix.eq.${b}.g`)) out.push(`${f(v(`mix.eq.${b}.f`))} ⟨${g(v(`mix.eq.${b}.g`))}⟩`);
      if (v('mix.eq.high.g')) out.push(`shelf aigu ${f(v('mix.eq.high.f'))} ⟨${g(v('mix.eq.high.g'))} dB⟩`);
      else if (out.length > 1) out[out.length - 1] += ' dB';
    } else if (mod.k === 'COMP') {
      out.push(`${mod.glue ? 'Glue · s' : 'S'}euil ⟨${g(v('mix.comp.th'))} dB⟩${mod.below && k === 1 ? ` (${mod.below} dB sous la crête)` : ''}`);
      out.push(`⟨${formatValue('ratio', v('mix.comp.ratio'))}⟩`);
      out.push(`attaque ${Math.round(v('mix.comp.att') * 1000)} ms`, `relâchement ${Math.round(v('mix.comp.rel') * 1000)} ms`);
      if (v('mix.comp.makeup')) out.push(`${g(v('mix.comp.makeup'))} dB`);
    } else if (mod.k === 'LIM') {
      out.push(`Plafond ⟨${g(v('mix.lim.ceil'))} dBFS⟩ (3 dB sous les plus fortes crêtes)`, 'relâchement 50 ms');
      if (!mod.on) out.push(mod.spikes != null ? 'facultatif : crêtes régulières' : 'facultatif');
    } else if (mod.k === 'MAST') {
      out.push(`graves en mono sous ⟨${f(v('mastering.mono'))}⟩`, `largeur ⟨${Math.round(v('mastering.width') * 100)} %⟩`, `écrêtage doux ⟨${Math.round(v('mastering.clip') * 100)} %⟩`);
      out.push(`limiteur ⟨${g(v('mastering.ceiling'))} dBTP⟩`, `gain d'entrée ⟨${g(v('mastering.drive'))} dB⟩`);
    }
    const txt = out.join(' · ');
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  // le rôle avec son article, pour les phrases (« la basse », « l'arpège »)
  const ROLE_ART = {
    kick: 'le kick', snare: 'la caisse claire', clap: 'le clap', hat: 'la charleston', ohat: 'la charleston ouverte', tom: 'le tom',
    cymbal: 'la cymbale', perc: 'la percussion', bass: 'la basse', pad: 'la nappe', arp: 'l\'arpège', lead: 'le lead', keys: 'le clavier',
  };
  const ROLE_NAME = {
    kick: 'kick', snare: 'caisse claire', clap: 'clap', hat: 'charleston', ohat: 'charleston ouvert', tom: 'tom', cymbal: 'cymbale',
    perc: 'percussion', bass: 'basse', pad: 'nappe', arp: 'arpège', lead: 'lead', keys: 'clavier',
  };

  /**
   * Ajoute aux changements une cloche d'EQ vers la fréquence f : la cloche déjà proche (moins d'une demi-octave)
   * est creusée davantage, sinon la cloche libre de la bonne moitié du spectre (bas-médium / haut-médium) est prise.
   */
  function eqBell(changes, mix, f, g, q) {
    const e = mix.eq;
    if (!e.on) changes.push({ path: 'mix.eq.on', from: false, to: true, fixed: true });
    const near = ['lm', 'hm'].find((k) => e[k].g !== 0 && Math.abs(Math.log2(e[k].f / f)) < 0.5);
    if (near) {
      changes.push({ path: `mix.eq.${near}.g`, from: e[near].g, to: round(clamp(e[near].g + g, -12, 12), 0.5) });
      return;
    }
    const pref = f < 1000 ? ['lm', 'hm'] : ['hm', 'lm'];
    const k = pref.find((x) => e[x].g === 0) || pref[0];
    changes.push({ path: `mix.eq.${k}.f`, from: e[k].f, to: Math.round(f), fixed: true });
    changes.push({ path: `mix.eq.${k}.q`, from: e[k].q, to: q, fixed: true });
    changes.push({ path: `mix.eq.${k}.g`, from: e[k].g, to: g });
  }

  return {
    BANDS, BAND_LABEL, ZONES, TARGETS, CURVES, ROLE_LEVEL, ROLE_HP, CRITERIA, SCOPES, DEFAULT_PREFS,
    bandPowers, kPower, stereoSums, correlation, integrated, loudnessRange,
    newAccumulator, accumulate, summarize, diagnose, toneDeviation, proposeTarget, cleanPrefs, roleOf,
    unitOf, formatValue, valueAt, grade, moduleDesc, ruleFor,
  };
})();
