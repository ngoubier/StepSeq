/*
 * Fenêtre de sound design des pistes instrument.
 * Paramètres inspirés de strudel.cc : s (forme d'onde), unison / detune,
 * lpf / hpf / bpf (cutoff), lpq (résonance), lpenv + lpattack / lpdecay / lpsustain / lprelease,
 * attack / decay / sustain / release,
 * gain, pan, distort.
 *
 * Les réglages sont enregistrés dans track.sd (seulement s'ils diffèrent du preset)
 * et s'entendent immédiatement, y compris pendant la lecture.
 */
window.SS = window.SS || {};

SS.soundDesign = (() => {
  const $ = (s) => document.querySelector(s);
  let app;
  let track = null;
  let snapshot = null;
  const inputs = new Map(); // clé -> { input, out, spec }

  /* ---------- Échelles des curseurs ---------- */
  const lin = (min, max) => ({ to: (x) => min + (max - min) * x, from: (v) => (v - min) / (max - min) });
  const sq = (max) => ({ to: (x) => max * x * x, from: (v) => Math.sqrt(Math.max(0, v) / max) });
  const logf = (min, max) => ({ to: (x) => min * Math.pow(max / min, x), from: (v) => Math.log(v / min) / Math.log(max / min) });

  const fmtTime = (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
  const fmtHz = (v) => (v < 1000 ? `${Math.round(v)} Hz` : `${(v / 1000).toFixed(v < 10000 ? 2 : 1)} kHz`);
  const fmtPct = (v) => `${Math.round(v * 100)} %`;

  const SPECS = {
    voices: { label: 'Voix (unison)', scale: lin(1, 7), int: true, fmt: (v) => String(v), group: 'vco' },
    detune: { label: 'Désaccord', scale: lin(0, 50), fmt: (v) => `${Math.round(v)} cents`, group: 'vco' },
    cutoff: { label: 'Cutoff', scale: logf(20, 20000), fmt: fmtHz, group: 'vcf' },
    q: { label: 'Résonance', scale: lin(0, 30), fmt: (v) => v.toFixed(1), group: 'vcf' },
    env: { label: 'Quantité', scale: lin(0, 6), fmt: (v) => (v ? `+${v.toFixed(1)} oct` : 'off'), group: 'fenv' },
    fattack: { label: 'Attack', scale: sq(2), fmt: fmtTime, group: 'fenv' },
    fdecay: { label: 'Decay', scale: sq(2), fmt: fmtTime, group: 'fenv' },
    fsustain: { label: 'Sustain', scale: lin(0, 1), fmt: fmtPct, group: 'fenv' },
    frelease: { label: 'Release', scale: sq(4), fmt: fmtTime, group: 'fenv' },
    attack: { label: 'Attack', scale: sq(2), fmt: fmtTime, group: 'vca' },
    decay: { label: 'Decay', scale: sq(2), fmt: fmtTime, group: 'vca' },
    sustain: { label: 'Sustain', scale: lin(0, 1), fmt: fmtPct, group: 'vca' },
    release: { label: 'Release', scale: sq(4), fmt: fmtTime, group: 'vca' },
    gain: { label: 'Niveau', scale: lin(0, 1.5), fmt: fmtPct, group: 'out' },
    pan: { label: 'Panoramique', scale: lin(-1, 1), fmt: (v) => (Math.abs(v) < 0.02 ? 'centre' : v < 0 ? `G ${Math.round(-v * 100)}` : `D ${Math.round(v * 100)}`), group: 'out' },
    drive: { label: 'Saturation', scale: lin(0, 1), fmt: (v) => (v ? fmtPct(v) : 'off'), group: 'out' },
  };
  const GROUP_EL = { vco: '#sdVcoSliders', vcf: '#sdVcfSliders', fenv: '#sdFenvSliders', vca: '#sdVcaSliders', out: '#sdOutSliders' };

  const WAVE_ICONS = {
    sawtooth: 'M2 16 L10 4 L10 16 L18 4 L18 16 L22 10',
    square: 'M2 16 V5 H8 V16 H14 V5 H20 V16 H22',
    triangle: 'M2 14 L7 5 L12 14 L17 5 L22 14',
    sine: 'M2 10 C5 1 8 1 10 10 S15 19 18 10 S21 4 22 7',
    supersaw: 'M2 16 L10 4 L10 16 L18 4 L18 16 M2 13 L9 3 L9 13 L17 3 L17 13',
  };

  /* ---------- Construction de la fenêtre ---------- */
  function build() {
    for (const [key, spec] of Object.entries(SPECS)) {
      const id = 'sd_' + key;
      const out = document.createElement('output');
      out.htmlFor = id;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = 0;
      input.max = 1000;
      input.step = 1;
      input.addEventListener('input', () => {
        let v = spec.scale.to(+input.value / 1000);
        v = spec.int ? Math.round(v) : +v.toPrecision(3);
        if (key === 'pan' && Math.abs(v) < 0.03) v = 0;
        set(key, v);
      });
      input.addEventListener('change', () => preview());
      input.addEventListener('dblclick', () => {
        // double-clic : valeur du preset
        const d = SS.soundDefaults(track);
        set(key, d[key]);
        refresh();
      });
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = spec.label;
      const row = document.createElement('div');
      row.className = 'sd-row';
      row.append(label, out, input);
      $(GROUP_EL[spec.group]).append(row);
      inputs.set(key, { input, out, spec, row });
    }

    SS.WAVES.forEach((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = w.id;
      b.setAttribute('role', 'radio');
      b.title = `s("${w.id}")`;
      b.innerHTML = `<svg viewBox="0 0 24 20"><path d="${WAVE_ICONS[w.id]}"/></svg><span>${w.label}</span>`;
      b.addEventListener('click', () => {
        const prevSuper = params().wave === 'supersaw';
        set('wave', w.id);
        // supersaw sans unison sonne comme une simple dent de scie : on donne des voix par défaut
        if (w.id === 'supersaw' && params().voices < 3) set('voices', 5);
        if (prevSuper && w.id !== 'supersaw' && params().voices >= 5) set('voices', 1);
        refresh();
        preview();
      });
      $('#sdWaves').append(b);
    });

    SS.FILTER_TYPES.forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = f.id;
      b.textContent = f.label;
      b.title = `${f.strudel}(…)`;
      b.addEventListener('click', () => {
        set('filter', f.id);
        // passer en passe-haut avec un cutoff grand ouvert couperait tout : on le ramène
        if (f.id === 'highpass' && params().cutoff > 5000) set('cutoff', 200);
        if (f.id === 'bandpass' && params().cutoff > 10000) set('cutoff', 1000);
        refresh();
        preview();
      });
      $('#sdFilterType').append(b);
    });

    $('#sdCopyAdsr').addEventListener('click', () => {
      const p = params();
      set('fattack', p.attack);
      set('fdecay', p.decay);
      set('fsustain', p.sustain);
      set('frelease', p.release);
      if (!params().env) set('env', 2);
      refresh();
      preview();
    });

    const dlg = $('#soundDialog');
    $('#sdPreview').addEventListener('click', () => preview());
    $('#sdReset').addEventListener('click', () => {
      delete track.sd;
      refresh();
      app.changed();
      preview();
    });
    $('#sdCancel').addEventListener('click', () => dlg.close('cancel'));
    $('#sdForm').addEventListener('submit', (e) => {
      e.preventDefault();
      dlg.close('ok');
    });
    dlg.addEventListener('close', () => {
      if (!track) return;
      if (dlg.returnValue !== 'ok') {
        // Annuler / Échap : on revient aux réglages d'avant l'ouverture
        if (snapshot) track.sd = snapshot;
        else delete track.sd;
        app.changed();
      }
      app.renderTrack(track);
      track = null;
    });
    dlg.addEventListener('keydown', (e) => e.stopPropagation());
  }

  /* ---------- Valeurs ---------- */
  const params = () => SS.soundParams(track);

  function set(key, value) {
    const defaults = SS.soundDefaults(track);
    track.sd = { ...(track.sd || {}), [key]: value };
    // ne garde que ce qui diffère du preset (fichier plus lisible, preset suivi s'il évolue)
    for (const k of Object.keys(track.sd)) {
      if (typeof track.sd[k] === 'number' && typeof defaults[k] === 'number' && Math.abs(track.sd[k] - defaults[k]) < 1e-6) delete track.sd[k];
      else if (track.sd[k] === defaults[k]) delete track.sd[k];
    }
    if (!Object.keys(track.sd).length) delete track.sd;
    updateValues();
    app.changed();
  }

  function refresh() {
    const p = params();
    const hasVco = p.wave !== null;
    $('#sdVco').hidden = !hasVco;
    $('#sdNoVco').hidden = hasVco;
    if (!hasVco) {
      const inst = SS.findInstrument(track.family, track.instrument);
      $('#sdNoVco').textContent = `« ${inst.label} » est un instrument échantillonné : il n'a pas d'oscillateur. Le filtre, l'enveloppe et la sortie s'appliquent à l'échantillon. Choisis un instrument « (synthé) » pour avoir un VCO.`;
    }
    $('#sdWaves').querySelectorAll('button').forEach((b) => {
      const on = b.dataset.v === p.wave;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    $('#sdFilterType').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === p.filter));
    updateValues(true);
  }

  function updateValues(moveSliders = false) {
    const p = params();
    const d = SS.soundDefaults(track);
    for (const [key, { input, out, spec, row }] of inputs) {
      const v = p[key];
      if (moveSliders || document.activeElement !== input) input.value = Math.round(Math.max(0, Math.min(1, spec.scale.from(v))) * 1000);
      out.textContent = spec.fmt(v);
      row.classList.toggle('changed', typeof d[key] === 'number' && Math.abs(v - d[key]) > 1e-6);
    }
    const detuneRow = inputs.get('detune').row;
    detuneRow.classList.toggle('dim', p.voices < 2 && p.wave !== 'supersaw');
    ['fattack', 'fdecay', 'fsustain', 'frelease'].forEach((k) => inputs.get(k).row.classList.toggle('dim', !p.env));
    $('#sdFenv').classList.toggle('dim', !p.env);
    drawAdsr(p, '#sdAdsr');
    drawAdsr({ attack: p.fattack, decay: p.fdecay, sustain: p.fsustain, release: p.frelease }, '#sdFenv');
    $('#sdCode').textContent = strudelCode(p);
  }

  function drawAdsr(p, svgSel) {
    const W = 300;
    const H = 90;
    const top = 8;
    const bottom = H - 4;
    const hold = 0.35;
    const total = Math.max(0.6, p.attack + p.decay + hold + p.release);
    const x = (t) => 4 + (t / total) * (W - 8);
    const yS = bottom - (bottom - top) * p.sustain;
    const pts = [
      [x(0), bottom],
      [x(p.attack), top],
      [x(p.attack + p.decay), yS],
      [x(p.attack + p.decay + hold), yS],
      [x(p.attack + p.decay + hold + p.release), bottom],
    ];
    const d = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const svg = $(svgSel);
    svg.querySelector('.line').setAttribute('d', d);
    svg.querySelector('.fill-area').setAttribute('d', d + ' Z');
  }

  const r = (v, n = 3) => +v.toFixed(n);
  function strudelCode(p) {
    const parts = [];
    if (p.wave) {
      parts.push(`s("${p.wave}")`);
      if (p.voices > 1) parts.push(`unison(${p.voices})`, `detune(${r(p.detune / 100, 2)})`);
    } else parts.push(`s("${SS.findInstrument(track.family, track.instrument).label}")`);
    const f = SS.FILTER_TYPES.find((x) => x.id === p.filter) || SS.FILTER_TYPES[0];
    if (!(p.filter === 'lowpass' && p.cutoff >= 19999)) parts.push(`${f.strudel}(${Math.round(p.cutoff)})`);
    if (p.q > 0) parts.push(`${f.strudel === 'lpf' ? 'lpq' : f.strudel === 'hpf' ? 'hpq' : 'bpq'}(${r(p.q, 1)})`);
    if (p.env > 0) {
      const pre = f.strudel === 'lpf' ? 'lp' : f.strudel === 'hpf' ? 'hp' : 'bp';
      parts.push(
        `${pre}env(${r(p.env, 1)})`,
        `${pre}attack(${r(p.fattack)})`,
        `${pre}decay(${r(p.fdecay)})`,
        `${pre}sustain(${r(p.fsustain, 2)})`,
        `${pre}release(${r(p.frelease)})`
      );
    }
    parts.push(`adsr("${r(p.attack)}:${r(p.decay)}:${r(p.sustain, 2)}:${r(p.release)}")`);
    if (p.gain !== 1) parts.push(`gain(${r(p.gain, 2)})`);
    if (p.pan) parts.push(`pan(${r((p.pan + 1) / 2, 2)})`);
    if (p.drive) parts.push(`distort(${r(p.drive * 3, 2)})`);
    return parts.join('.');
  }

  /* ---------- Écoute ---------- */
  function preview() {
    if (!track || SS.audio.isPlaying()) return; // en lecture, on entend déjà le résultat dans la boucle
    const root = track.lastRoot ?? (track.octave + 1) * 12;
    const notes = track.category === 'mono' ? root : SS.chordNotes(root, track.chord);
    const p = params();
    SS.audio.preview(track, notes, Math.min(1.6, Math.max(0.6, p.attack + p.decay + 0.3)));
  }

  /* ---------- API ---------- */
  function open(t) {
    if (!t || t.type !== 'instrument') return;
    SS.audio.ensureCtx();
    track = t;
    snapshot = t.sd ? { ...t.sd } : null;
    const inst = SS.findInstrument(t.family, t.instrument);
    $('#sdTrack').textContent = `${t.name} · ${inst.label}`;
    refresh();
    $('#soundDialog').returnValue = '';
    $('#soundDialog').showModal();
  }

  function init(appApi) {
    app = appApi;
    build();
  }

  return { init, open };
})();
