/*
 * Synthés analogiques émulés (pistes « Synthé »).
 *
 * Premier modèle : Roland Juno-106 (1984).
 *   - 6 voix, 1 DCO par voix : dent de scie, impulsion (largeur réglable / PWM), sous-oscillateur carré
 *     une octave plus bas, bruit blanc ; pieds 16' / 8' / 4'.
 *   - HPF non résonant à 4 positions (0 = renfort de graves, 1 = neutre, 2 et 3 = coupe-bas).
 *   - VCF passe-bas résonant 24 dB/oct (puce IR3109) : FREQ, RES, ENV (polarité +/−), LFO, KYBD.
 *   - VCA : piloté par l'enveloppe (ENV) ou par la porte (GATE), LEVEL.
 *   - 1 ENV ADSR partagée entre VCF et VCA.
 *   - 1 LFO triangle : RATE, DELAY (montée progressive après chaque note).
 *   - Chorus stéréo BBD : I (lent), II (plus rapide et plus profond).
 *
 * Les réglages d'une piste sont dans track.juno (copie complète du patch, modifiable) ;
 * track.junoPatch garde le nom du patch chargé (ex. « A11 »).
 */
window.SS = window.SS || {};

/* ---------- Catalogue des synthés analogiques ---------- */
SS.ANALOG_SYNTHS = [
  {
    id: 'juno106',
    label: 'Roland Juno-106',
    maker: 'Roland',
    year: 1984,
    octave: 3,
    specs: [
      ['Polyphonie', '6 voix'],
      ['Oscillateur', '1 DCO par voix : dent de scie, impulsion (PWM), sous-oscillateur, bruit'],
      ['Pieds', "16' · 8' · 4'"],
      ['Filtres', 'HPF 4 positions + VCF passe-bas résonant 24 dB/oct (IR3109)'],
      ['Modulation', '1 LFO triangle (vitesse, retard), suivi de clavier'],
      ['Enveloppe', '1 ADSR partagée VCF / VCA (ou VCA en mode porte)'],
      ['Effet', 'Chorus stéréo BBD, modes I et II'],
      ['Mémoires', '128 patches (groupes A / B, banques 1–8, numéros 1–8)'],
    ],
  },
];

SS.findAnalog = (id) => SS.ANALOG_SYNTHS.find((s) => s.id === id) || SS.ANALOG_SYNTHS[0];

/** Pseudo-famille des pistes Synthé (elle n'apparaît pas dans la liste des familles d'instruments). */
SS.ANALOG_FAMILY = {
  id: 'analog',
  label: 'Synthés analogiques',
  octave: 3,
  instruments: SS.ANALOG_SYNTHS.map((s) => ({ id: s.id, label: s.label, kind: 'analog' })),
};

SS.isAnalog = (track) => !!track && track.type === 'instrument' && track.family === 'analog';

/* ---------- Juno-106 : paramètres ---------- */

/** Réglage « Manual » : toutes les valeurs de curseur vont de 0 à 1 (graduations 0–10 du panneau). */
SS.JUNO_INIT = {
  lfoRate: 0.5, lfoDelay: 0,
  range: 8, dcoLfo: 0, pwm: 0, pwmMode: 'lfo', pulse: false, saw: true, sub: 0, noise: 0,
  hpf: 1,
  vcfFreq: 0.75, vcfRes: 0, envPol: 1, vcfEnv: 0, vcfLfo: 0, kybd: 0.5,
  vcaMode: 'env', vcaLevel: 0.5,
  attack: 0, decay: 0.45, sustain: 0.7, release: 0.3,
  chorus: 0,
  tune: 0.5, // bouton TUNE : ±50 cents (0,5 = centre)
};

const junoPatch = (id, name, p) => ({ id, name, params: { ...SS.JUNO_INIT, ...p } });

/** Patches d'usine de StepSeq (réglages originaux inspirés des sons typiques du Juno-106). */
SS.JUNO_PATCHES = [
  junoPatch('A11', 'Strings', { saw: true, vcfFreq: 0.62, vcfRes: 0.1, vcfEnv: 0.15, kybd: 0.6, attack: 0.45, decay: 0.6, sustain: 0.85, release: 0.55, lfoRate: 0.45, dcoLfo: 0.12, lfoDelay: 0.5, chorus: 2 }),
  junoPatch('A12', 'Brass', { saw: true, vcfFreq: 0.38, vcfRes: 0.15, vcfEnv: 0.5, kybd: 0.5, attack: 0.3, decay: 0.5, sustain: 0.65, release: 0.35, chorus: 1 }),
  junoPatch('A13', 'Juno Bass', { range: 16, pulse: true, saw: false, pwm: 0.35, pwmMode: 'man', sub: 0.8, vcfFreq: 0.3, vcfRes: 0.25, vcfEnv: 0.45, kybd: 0.3, decay: 0.42, sustain: 0.25, release: 0.2, hpf: 0, vcaLevel: 0.55 }),
  junoPatch('A14', 'PWM Pad', { pulse: true, saw: false, pwm: 0.7, pwmMode: 'lfo', lfoRate: 0.42, vcfFreq: 0.6, vcfRes: 0.12, vcfEnv: 0.1, attack: 0.5, decay: 0.55, sustain: 0.9, release: 0.6, chorus: 1 }),
  junoPatch('A15', 'Lead', { saw: true, pulse: true, pwm: 0.2, pwmMode: 'man', vcfFreq: 0.55, vcfRes: 0.3, vcfEnv: 0.3, decay: 0.45, sustain: 0.6, release: 0.3, dcoLfo: 0.18, lfoRate: 0.55, lfoDelay: 0.55, chorus: 1 }),
  junoPatch('A16', 'Pluck', { saw: true, vcfFreq: 0.28, vcfRes: 0.35, vcfEnv: 0.55, kybd: 0.6, decay: 0.38, sustain: 0, release: 0.38, chorus: 2 }),
  junoPatch('A17', 'Organ', { pulse: true, saw: false, pwm: 0, pwmMode: 'man', sub: 0.6, vcfFreq: 0.7, vcfRes: 0, vcaMode: 'gate', release: 0.1, hpf: 2, chorus: 2, vcaLevel: 0.45 }),
  junoPatch('A18', 'Sub Bass', { range: 16, saw: false, pulse: false, sub: 1, vcfFreq: 0.4, vcfRes: 0, vcfEnv: 0.15, decay: 0.5, sustain: 0.8, release: 0.2, hpf: 0, vcaLevel: 0.65 }),
  junoPatch('A21', 'Hollow Pad', { pulse: true, saw: true, pwm: 0.45, pwmMode: 'lfo', lfoRate: 0.3, vcfFreq: 0.48, vcfRes: 0.45, vcfEnv: 0.2, vcfLfo: 0.1, attack: 0.6, decay: 0.7, sustain: 0.8, release: 0.65, chorus: 2 }),
  junoPatch('A22', 'Resonant Bass', { range: 16, saw: true, sub: 0.5, vcfFreq: 0.22, vcfRes: 0.7, vcfEnv: 0.55, kybd: 0.4, decay: 0.35, sustain: 0.1, release: 0.15, hpf: 1 }),
  junoPatch('A23', 'Clav', { pulse: true, saw: false, pwm: 0.75, pwmMode: 'man', range: 4, vcfFreq: 0.45, vcfRes: 0.3, vcfEnv: 0.5, kybd: 0.7, decay: 0.32, sustain: 0, release: 0.25, hpf: 2 }),
  junoPatch('A24', 'Bells', { pulse: true, saw: false, pwm: 0.85, pwmMode: 'man', range: 4, vcfFreq: 0.68, vcfRes: 0.6, vcfEnv: 0.2, kybd: 1, decay: 0.62, sustain: 0, release: 0.6, hpf: 2, chorus: 2 }),
  junoPatch('A25', 'Sweep Pad', { saw: true, pulse: true, pwm: 0.3, pwmMode: 'lfo', lfoRate: 0.25, vcfFreq: 0.3, vcfRes: 0.55, vcfEnv: 0.2, vcfLfo: 0.35, attack: 0.55, decay: 0.7, sustain: 0.9, release: 0.7, chorus: 1 }),
  junoPatch('A26', 'Noise Wind', { saw: false, pulse: false, noise: 1, vcfFreq: 0.45, vcfRes: 0.7, vcfLfo: 0.4, lfoRate: 0.3, attack: 0.65, decay: 0.6, sustain: 0.8, release: 0.7, kybd: 1, chorus: 2 }),
  junoPatch('A27', 'Synth Brass', { saw: true, range: 8, vcfFreq: 0.3, vcfRes: 0.2, vcfEnv: 0.6, attack: 0.35, decay: 0.55, sustain: 0.5, release: 0.4, chorus: 2, dcoLfo: 0.08, lfoDelay: 0.6 }),
  junoPatch('A28', 'Arp Pluck', { pulse: true, saw: true, pwm: 0.25, pwmMode: 'man', vcfFreq: 0.35, vcfRes: 0.45, vcfEnv: 0.45, kybd: 0.5, decay: 0.3, sustain: 0, release: 0.3, chorus: 1 }),
];
SS.JUNO_MANUAL = { id: 'MAN', name: 'Manual', params: { ...SS.JUNO_INIT } };
SS.findJunoPatch = (id) => SS.JUNO_PATCHES.find((p) => p.id === id) || (id === 'MAN' ? SS.JUNO_MANUAL : null);

/** Description des paramètres : type, valeurs permises (pour valider les fichiers). */
SS.JUNO_SPEC = {
  lfoRate: 'n', lfoDelay: 'n', dcoLfo: 'n', pwm: 'n', sub: 'n', noise: 'n',
  tune: 'n', vcfFreq: 'n', vcfRes: 'n', vcfEnv: 'n', vcfLfo: 'n', kybd: 'n', vcaLevel: 'n',
  attack: 'n', decay: 'n', sustain: 'n', release: 'n',
  range: [16, 8, 4], pwmMode: ['lfo', 'man'], pulse: [true, false], saw: [true, false],
  hpf: [0, 1, 2, 3], envPol: [1, -1], vcaMode: ['env', 'gate'], chorus: [0, 1, 2],
};

/** Réglages effectifs d'une piste Juno (patch d'usine si rien n'a été modifié). */
SS.junoParams = (track) => {
  const base = (SS.findJunoPatch(track.junoPatch) || SS.JUNO_PATCHES[0]).params;
  return { ...base, ...(track.juno || {}) };
};

/** Nettoie des réglages venant d'un fichier. */
SS.cleanJuno = (obj) => {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, spec] of Object.entries(SS.JUNO_SPEC)) {
    const v = obj[k];
    if (spec === 'n') {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v));
    } else if (spec.includes(v)) out[k] = v;
  }
  return out;
};

/* ---------- Juno-106 : correspondances curseur -> grandeur physique ---------- */
SS.JUNO_MAP = {
  lfoRate: (x) => 0.1 * Math.pow(300, x), // 0,1 Hz – 30 Hz
  lfoDelay: (x) => 3 * x * x, // 0 – 3 s
  dcoLfo: (x) => 1200 * x * x, // vibrato : jusqu'à ±1 octave
  attack: (x) => 0.0015 * Math.pow(2000, x), // 1,5 ms – 3 s
  decay: (x) => 0.0015 * Math.pow(8000, x), // 1,5 ms – 12 s
  release: (x) => 0.0015 * Math.pow(8000, x),
  vcfFreq: (x) => 20 * Math.pow(2, x * 10), // 20 Hz – 20 kHz
  vcfRes: (x) => x * 30, // pic de résonance en dB (Q des filtres Web Audio)
  vcfEnv: (x) => x * 8, // octaves
  vcfLfo: (x) => x * 3, // octaves
};

/* ---------- Juno-106 : moteur audio ---------- */
SS.juno = (() => {
  const POLY = 6;
  const voicesByTrack = new Map(); // clé -> [{ start, end, kill(t) }]
  const inserts = new Map(); // clé -> chaîne de chorus

  /**
   * Enveloppe ADSR sur un paramètre (de 0 au pic, puis sustain, puis 0 au relâchement).
   * Les constantes de temps reprennent la forme exponentielle des enveloppes analogiques.
   */
  function adsr(param, t, tOff, peak, a, d, s, r) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(peak * s, t + a, d / 3);
    param.setTargetAtTime(0, Math.max(tOff, t + a * 0.5), r / 4);
  }

  /** Coupe une voix volée (polyphonie de 6) sans clic. */
  function steal(v, t) {
    try {
      const g = v.amp.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
      else g.cancelScheduledValues(t);
      g.setTargetAtTime(0, t, 0.004);
      v.sources.forEach((s) => s.stop(t + 0.04));
    } catch (e) {
      /* déjà arrêtée */
    }
    v.end = t + 0.04;
  }

  /** Chorus BBD stéréo du Juno : une ligne à retard modulée par un triangle, en opposition gauche / droite. */
  const CHORUS = {
    1: { rate: 0.513, min: 0.00166, max: 0.00535 }, // Chorus I
    2: { rate: 0.863, min: 0.00166, max: 0.00535 }, // Chorus II : plus rapide
  };

  function buildInsert(ctx) {
    const c = {};
    c.input = ctx.createGain();
    c.dry = ctx.createGain();
    c.wetL = ctx.createGain();
    c.wetR = ctx.createGain();
    c.tone = ctx.createBiquadFilter(); // les BBD coupent les aigus
    c.tone.type = 'lowpass';
    c.tone.frequency.value = 9000;
    c.dL = ctx.createDelay(0.02);
    c.dR = ctx.createDelay(0.02);
    c.lfo = ctx.createOscillator();
    c.lfo.type = 'triangle';
    c.modL = ctx.createGain();
    c.modR = ctx.createGain();
    c.merge = ctx.createChannelMerger(2);
    c.out = ctx.createGain();
    c.lfo.connect(c.modL).connect(c.dL.delayTime);
    c.lfo.connect(c.modR).connect(c.dR.delayTime);
    c.lfo.start();
    c.input.connect(c.dry).connect(c.out);
    c.input.connect(c.tone);
    c.tone.connect(c.dL).connect(c.wetL).connect(c.merge, 0, 0);
    c.tone.connect(c.dR).connect(c.wetR).connect(c.merge, 0, 1);
    c.merge.connect(c.out);
    c.mode = -1;
    return c;
  }

  function setChorus(ctx, c, mode) {
    if (c.mode === mode) return;
    c.mode = mode;
    const now = ctx.currentTime;
    const ramp = (p, v) => p.setTargetAtTime(v, now, 0.02);
    const m = CHORUS[mode];
    if (!m) {
      ramp(c.wetL.gain, 0);
      ramp(c.wetR.gain, 0);
      ramp(c.dry.gain, 1);
      return;
    }
    const center = (m.min + m.max) / 2;
    const depth = (m.max - m.min) / 2;
    c.dL.delayTime.setValueAtTime(center, now);
    c.dR.delayTime.setValueAtTime(center, now);
    ramp(c.lfo.frequency, m.rate);
    ramp(c.modL.gain, depth);
    ramp(c.modR.gain, -depth);
    ramp(c.dry.gain, 0.75);
    ramp(c.wetL.gain, 0.75);
    ramp(c.wetR.gain, 0.75);
  }

  /** Entrée de la chaîne « synthé » d'une piste (chorus) reliée à `dest`. */
  function insert(ctx, key, dest, params) {
    let c = inserts.get(key);
    if (!c) {
      c = buildInsert(ctx);
      inserts.set(key, c);
    }
    if (c.dest !== dest) {
      c.out.disconnect();
      c.out.connect(dest);
      c.dest = dest;
    }
    setChorus(ctx, c, params.chorus || 0);
    return c.input;
  }

  /** Mise à jour immédiate du chorus (fenêtre de sound design, pendant la lecture). */
  function applyChorus(ctx, track) {
    if (!ctx || !track) return;
    const c = inserts.get(track.id || '__preview');
    if (c) setChorus(ctx, c, SS.junoParams(track).chorus || 0);
  }

  function remove(key) {
    const c = inserts.get(key);
    if (c) {
      c.out.disconnect();
      c.lfo.stop();
    }
    inserts.delete(key);
    voicesByTrack.delete(key);
  }

  /**
   * Joue une note. env = { ctx, noise(kind) -> AudioBuffer, register(sources, gainNode) }.
   */
  function play(env, track, midi, time, dur, vel, dest) {
    const { ctx } = env;
    const p = SS.junoParams(track);
    const M = SS.JUNO_MAP;
    const key = track.id || '__preview';
    const t = Math.max(time, ctx.currentTime);
    const out = insert(ctx, key, dest, p);

    // polyphonie : 6 voix, la plus ancienne est volée
    let list = (voicesByTrack.get(key) || []).filter((v) => v.end > t);
    while (list.length >= POLY) {
      list.sort((a, b) => a.start - b.start);
      steal(list.shift(), t);
    }

    const a = M.attack(p.attack);
    const d = M.decay(p.decay);
    const s = Math.max(0, Math.min(1, p.sustain));
    const r = M.release(p.release);
    const gate = p.vcaMode === 'gate';
    const tOff = t + Math.max(dur, 0.005);
    const relAmp = gate ? 0.006 : r;
    const end = tOff + Math.max(relAmp, r) * 1.6 + 0.05; // l'enveloppe du filtre continue pendant le relâchement

    // fréquence du DCO : pied 16' / 8' / 4'
    const oct = p.range === 16 ? -1 : p.range === 4 ? 1 : 0;
    const freq = 440 * Math.pow(2, (midi - 69) / 12 + oct);

    /* ---- LFO (triangle) avec retard ---- */
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = M.lfoRate(p.lfoRate);
    const lfoAmt = ctx.createGain(); // 0 -> 1 après le retard
    const delay = M.lfoDelay(p.lfoDelay);
    lfoAmt.gain.setValueAtTime(delay > 0.01 ? 0 : 1, t);
    if (delay > 0.01) {
      lfoAmt.gain.setValueAtTime(0, t + delay * 0.4);
      lfoAmt.gain.linearRampToValueAtTime(1, t + delay);
    }
    lfo.connect(lfoAmt);

    /* ---- DCO ---- */
    const sources = [lfo];
    const mix = ctx.createGain();
    const vibrato = ctx.createGain();
    vibrato.gain.value = M.dcoLfo(p.dcoLfo);
    lfoAmt.connect(vibrato);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = freq;
    const tune = ((p.tune ?? 0.5) - 0.5) * 100;
    saw.detune.value = tune;
    vibrato.connect(saw.detune);
    sources.push(saw);
    if (p.saw) {
      const g = ctx.createGain();
      g.gain.value = 0.5;
      saw.connect(g).connect(mix);
    }
    if (p.pulse) {
      // impulsion = dent de scie − la même dent de scie retardée de (largeur × période)
      const T = 1 / freq;
      const dl = ctx.createDelay(0.2);
      const pw = Math.max(0, Math.min(1, p.pwm)) * 0.45;
      const inv = ctx.createGain();
      inv.gain.value = -0.5;
      const pos = ctx.createGain();
      pos.gain.value = 0.5;
      if (p.pwmMode === 'lfo') {
        dl.delayTime.value = 0.5 * T;
        const pwmMod = ctx.createGain();
        pwmMod.gain.value = pw * T;
        lfoAmt.connect(pwmMod).connect(dl.delayTime);
      } else dl.delayTime.value = (0.5 - pw) * T;
      saw.connect(pos).connect(mix);
      saw.connect(dl).connect(inv).connect(mix);
    }
    if (p.sub > 0) {
      const sub = ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = freq / 2;
      sub.detune.value = tune;
      vibrato.connect(sub.detune);
      const g = ctx.createGain();
      g.gain.value = 0.4 * p.sub;
      sub.connect(g).connect(mix);
      sources.push(sub);
    }
    if (p.noise > 0) {
      const n = ctx.createBufferSource();
      n.buffer = env.noise('white');
      n.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.7 * p.noise;
      n.connect(g).connect(mix);
      sources.push(n);
    }

    /* ---- HPF (4 positions) ---- */
    const hpf = ctx.createBiquadFilter();
    if (p.hpf === 0) {
      hpf.type = 'lowshelf'; // position 0 : renfort de graves
      hpf.frequency.value = 110;
      hpf.gain.value = 6;
    } else if (p.hpf === 1) {
      hpf.type = 'highpass';
      hpf.frequency.value = 15;
      hpf.Q.value = -3;
    } else {
      hpf.type = 'highpass';
      hpf.frequency.value = p.hpf === 2 ? 240 : 720;
      hpf.Q.value = -3;
    }
    mix.connect(hpf);

    /* ---- VCF : passe-bas 24 dB/oct (2 étages), modulé en cents (detune) ---- */
    const kyb = Math.pow(2, (p.kybd * (midi - 60)) / 12);
    const fc = Math.min(20000, M.vcfFreq(p.vcfFreq) * kyb);
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'lowpass';
    f1.frequency.value = f2.frequency.value = fc;
    f1.Q.value = -5.35; // étage de Butterworth du 4e ordre
    f2.Q.value = M.vcfRes(p.vcfRes) - 3;
    hpf.connect(f1).connect(f2);

    const fmod = ctx.createGain(); // somme des modulations, en cents
    fmod.gain.value = 1;
    fmod.connect(f1.detune);
    fmod.connect(f2.detune);
    if (p.vcfEnv > 0 && ctx.createConstantSource) {
      const envSrc = ctx.createConstantSource();
      envSrc.offset.value = 0;
      adsr(envSrc.offset, t, tOff, 1, a, d, s, r);
      const g = ctx.createGain();
      g.gain.value = 1200 * M.vcfEnv(p.vcfEnv) * (p.envPol < 0 ? -1 : 1);
      envSrc.connect(g).connect(fmod);
      sources.push(envSrc);
    }
    if (p.vcfLfo > 0) {
      const g = ctx.createGain();
      g.gain.value = 1200 * M.vcfLfo(p.vcfLfo);
      lfoAmt.connect(g).connect(fmod);
    }

    /* ---- VCA ---- */
    const amp = ctx.createGain();
    const level = 0.24 * (2 * p.vcaLevel) * Math.pow(Math.max(0, Math.min(1, vel)), 1.2);
    if (gate) {
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(level, t + 0.002);
      amp.gain.setValueAtTime(level, tOff);
      amp.gain.linearRampToValueAtTime(0, tOff + 0.006);
    } else adsr(amp.gain, t, tOff, level, a, d, s, r);
    f2.connect(amp).connect(out);

    sources.forEach((src) => {
      if (src.buffer) src.start(t, Math.random() * 1.5); // bruit : point de départ aléatoire
      else src.start(t);
      src.stop(end);
    });

    const v = { start: t, end, amp, sources };
    list.push(v);
    voicesByTrack.set(key, list);
    env.register(sources, amp);
  }

  return { play, applyChorus, remove, POLY };
})();
