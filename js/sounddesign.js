/*
 * Fenêtre de sound design des pistes instrument.
 * Paramètres inspirés de strudel.cc : s (forme d'onde), unison / detune,
 * lpf / hpf / bpf (cutoff), lpq (résonance), ftype (12db / 24db / ladder, + SEM) et drive,
 * lpenv + lpattack / lpdecay / lpsustain / lprelease, glide / portamento (pas d'équivalent strudel),
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
    pw: { label: 'Largeur d’impulsion (Pulse)', scale: lin(0.05, 0.95), fmt: fmtPct, group: 'vco' },
    sub: { label: 'Sous-oscillateur (carré)', scale: lin(0, 1), fmt: (v) => (v ? fmtPct(v) : 'off'), group: 'vco' },
    subOct: { label: 'Octave du sous-oscillateur', scale: lin(1, 2), int: true, fmt: (v) => (v >= 2 ? '−2 octaves' : '−1 octave'), group: 'vco' },
    noise: { label: 'Niveau du bruit', scale: sq(1), fmt: (v) => (v ? fmtPct(v) : 'off'), group: 'noise' },
    osc: { label: 'Niveau de l’oscillateur', scale: lin(0, 1), fmt: (v) => (v ? fmtPct(v) : 'coupé'), group: 'noise' },
    cutoff: { label: 'Cutoff', scale: logf(20, 20000), fmt: fmtHz, group: 'vcf' },
    q: { label: 'Résonance', scale: lin(0, 30), fmt: (v) => v.toFixed(1), group: 'vcf' },
    fdrive: { label: 'Drive (filtre)', scale: lin(0, 1), fmt: fmtPct, group: 'vcf' },
    env: { label: 'Quantité', scale: lin(0, 6), fmt: (v) => (v ? `+${v.toFixed(1)} oct` : 'off'), group: 'fenv' },
    fattack: { label: 'Attack', scale: sq(10), fmt: fmtTime, group: 'fenv' },
    fdecay: { label: 'Decay', scale: sq(10), fmt: fmtTime, group: 'fenv' },
    fsustain: { label: 'Sustain', scale: lin(0, 1), fmt: fmtPct, group: 'fenv' },
    frelease: { label: 'Release', scale: sq(20), fmt: fmtTime, group: 'fenv' },
    attack: { label: 'Attack', scale: sq(10), fmt: fmtTime, group: 'vca' },
    decay: { label: 'Decay', scale: sq(10), fmt: fmtTime, group: 'vca' },
    sustain: { label: 'Sustain', scale: lin(0, 1), fmt: fmtPct, group: 'vca' },
    release: { label: 'Release', scale: sq(20), fmt: fmtTime, group: 'vca' },
    glide: { label: 'Temps', scale: sq(1.5), fmt: (v) => (v ? fmtTime(v) : 'off'), group: 'glide' },
    gain: { label: 'Niveau', scale: lin(0, 1.5), fmt: fmtPct, group: 'out' },
    pan: { label: 'Panoramique', scale: lin(-1, 1), fmt: (v) => (Math.abs(v) < 0.02 ? 'centre' : v < 0 ? `G ${Math.round(-v * 100)}` : `D ${Math.round(v * 100)}`), group: 'out' },
    drive: { label: 'Saturation', scale: lin(0, 1), fmt: (v) => (v ? fmtPct(v) : 'off'), group: 'out' },
    accent: { label: 'Force de l’accent (notes accentuées)', scale: lin(0, 1), fmt: (v) => (v ? fmtPct(v) : 'off'), group: 'out' },
  };
  // LFO 1 et 2 (js/modulation.js) : vitesse libre, quantité (selon la destination), fondu d'entrée
  const fmtHz2 = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} Hz`.replace('.', ',');
  for (let i = 1; i <= SS.LFO_COUNT; i++) {
    SPECS[`lfo${i}Hz`] = { label: 'Vitesse libre', scale: logf(0.01, 20), fmt: fmtHz2, group: `lfo${i}` };
    SPECS[`lfo${i}Amt`] = { label: 'Quantité', scale: lin(-1, 1), fmt: (v) => lfoAmtText(i, v), group: `lfo${i}` };
    SPECS[`lfo${i}Fade`] = { label: 'Fondu d’entrée', scale: sq(10), fmt: (v) => (v ? fmtTime(v) : 'off'), group: `lfo${i}` };
  }
  /** Quantité d'un LFO, dans l'unité de sa destination. */
  function lfoAmtText(i, v) {
    const dest = track ? params()[`lfo${i}Dest`] : 'off';
    const sign = v < 0 ? '−' : '±';
    const a = Math.abs(v);
    if (dest === 'pitch') return a * 12 >= 1 ? `${sign}${(a * 12).toFixed(1).replace('.', ',')} demi-tons` : `${sign}${Math.round(a * 1200)} cents`;
    if (dest === 'cutoff') return `${sign}${(a * 4).toFixed(1).replace('.', ',')} oct`;
    if (dest === 'pw') return `${sign}${Math.round(a * 45)} %`;
    if (dest === 'amp') return `${Math.round(a * 100)} %${v < 0 ? ' (inversé)' : ''}`;
    return `${v < 0 ? '−' : ''}${Math.round(a * 100)} %`;
  }
  const GROUP_EL = { vco: '#sdVcoSliders', noise: '#sdNoiseSliders', vcf: '#sdVcfSliders', glide: '#sdGlideSliders', fenv: '#sdFenvSliders', vca: '#sdVcaSliders', out: '#sdOutSliders' };
  for (let i = 1; i <= SS.LFO_COUNT; i++) GROUP_EL[`lfo${i}`] = `#sdLfo${i}Sliders`;

  const WAVE_ICONS = {
    sawtooth: 'M2 16 L10 4 L10 16 L18 4 L18 16 L22 10',
    square: 'M2 16 V5 H8 V16 H14 V5 H20 V16 H22',
    triangle: 'M2 14 L7 5 L12 14 L17 5 L22 14',
    sine: 'M2 10 C5 1 8 1 10 10 S15 19 18 10 S21 4 22 7',
    supersaw: 'M2 16 L10 4 L10 16 L18 4 L18 16 M2 13 L9 3 L9 13 L17 3 L17 13',
    pulse: 'M2 16 V5 H5 V16 H14 V5 H17 V16 H22',
    white: 'M2 10 L3 4 L4 15 L5 7 L6 13 L7 3 L8 16 L9 8 L10 12 L11 5 L12 14 L13 6 L14 15 L15 9 L16 4 L17 13 L18 7 L19 16 L20 9 L21 5 L22 11',
    pink: 'M2 10 L4 6 L6 13 L8 8 L10 14 L12 7 L14 12 L16 6 L18 13 L20 9 L22 11',
    brown: 'M2 12 C5 6 7 15 10 10 S15 5 17 11 S20 14 22 9',
  };

  /* ---------- Construction de la fenêtre ---------- */
  /** Panneaux LFO 1 et 2 dans l'onglet LFOs, un à la fois (sous-onglets « LFO 1 | LFO 2 »). */
  function buildLfoPanels() {
    const panes = $('#sdLfoPanes');
    const tabs = $('#sdLfoTabs');
    for (let i = 1; i <= SS.LFO_COUNT; i++) {
      const t = document.createElement('button');
      t.type = 'button';
      t.id = `sdLfoTab${i}`;
      t.dataset.lfo = String(i);
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', `sdLfo${i}`);
      t.innerHTML = `<span class="dot" aria-hidden="true"></span>LFO ${i}`;
      t.addEventListener('click', () => showLfo(i));
      tabs.append(t);
      const sec = document.createElement('section');
      sec.className = 'sd-lfo';
      sec.id = `sdLfo${i}`;
      sec.setAttribute('role', 'tabpanel');
      sec.setAttribute('aria-labelledby', `sdLfoTab${i}`);
      sec.innerHTML = `
        <div class="segmented sd-ftype" id="sdLfo${i}Dest" role="radiogroup" aria-label="Destination du LFO ${i}"></div>
        <p class="sd-hint" id="sdLfo${i}Hint"></p>
        <div class="sd-lfo-body" id="sdLfo${i}Body">
          <div class="sd-waves sd-lfo-shapes" id="sdLfo${i}Shapes" role="radiogroup" aria-label="Forme du LFO ${i}"></div>
          <div class="sd-lfo-rate">
            <label for="sdLfo${i}Rate">Vitesse</label>
            <select id="sdLfo${i}Rate"></select>
            <div class="segmented sd-ftype" id="sdLfo${i}Mode" role="radiogroup" aria-label="Phase du LFO ${i}"></div>
          </div>
          <div class="sd-sliders" id="sdLfo${i}Sliders"></div>
        </div>`;
      panes.append(sec);

      const radioBtn = (box, id, html, title, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.v = id;
        b.setAttribute('role', 'radio');
        b.innerHTML = html;
        if (title) b.title = title;
        b.addEventListener('click', onClick);
        box.append(b);
      };
      SS.LFO_DESTS.forEach((d) =>
        radioBtn(sec.querySelector(`#sdLfo${i}Dest`), d.id, d.label, d.hint, () => {
          set(`lfo${i}Dest`, d.id);
          // une destination sans quantité ne ferait rien : on donne une valeur de départ
          if (d.id !== 'off' && !params()[`lfo${i}Amt`]) set(`lfo${i}Amt`, 0.5);
          // PWM sans onde Pulse : on passe en Pulse
          if (d.id === 'pw' && params().wave !== 'pulse' && params().wave !== null && !SS.NOISES.includes(params().wave)) set('wave', 'pulse');
          refresh();
          preview();
        })
      );
      SS.LFO_SHAPES.forEach((sh) =>
        radioBtn(sec.querySelector(`#sdLfo${i}Shapes`), sh.id, `<svg viewBox="0 0 24 20"><path d="${sh.icon}"/></svg><span>${sh.label}</span>`, null, () => {
          set(`lfo${i}Shape`, sh.id);
          refresh();
          preview();
        })
      );
      SS.LFO_MODES.forEach((m) =>
        radioBtn(sec.querySelector(`#sdLfo${i}Mode`), m.id, m.label, m.hint, () => {
          set(`lfo${i}Mode`, m.id);
          refresh();
          preview();
        })
      );
      const sel = sec.querySelector(`#sdLfo${i}Rate`);
      SS.LFO_RATES.forEach((r) => sel.add(new Option(r.label, r.id)));
      sel.addEventListener('change', () => {
        set(`lfo${i}Rate`, sel.value);
        refresh();
        preview();
      });
    }
  }

  /* ---------- Onglets verticaux : une section à la fois ; on rouvre sur le dernier onglet utilisé ---------- */
  const TAB_KEY = 'stepseq.sdTab';
  const LFO_KEY = 'stepseq.sdLfoTab';
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null; // stockage indisponible
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        /* rien */
      }
    },
  };
  let tab = store.get(TAB_KEY) || 'vco';
  let lfoTab = Math.min(SS.LFO_COUNT, Math.max(1, +store.get(LFO_KEY) || 1));

  function showTab(id, focus = false) {
    const btns = [...document.querySelectorAll('#sdTabs .fx-tab')];
    if (!btns.some((b) => b.dataset.tab === id)) id = 'vco';
    tab = id;
    btns.forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    document.querySelectorAll('#soundDialog .fx-pane').forEach((p) => (p.hidden = p.dataset.pane !== id));
    const panes = document.querySelector('#soundDialog .fx-panes');
    if (panes) panes.scrollTop = 0;
    store.set(TAB_KEY, id);
  }

  function showLfo(i) {
    lfoTab = i;
    for (let k = 1; k <= SS.LFO_COUNT; k++) {
      const on = k === i;
      $(`#sdLfoTab${k}`).classList.toggle('active', on);
      $(`#sdLfoTab${k}`).setAttribute('aria-selected', String(on));
      $(`#sdLfo${k}`).hidden = !on;
    }
    store.set(LFO_KEY, String(i));
  }

  function buildTabs() {
    const nav = $('#sdTabs');
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('.fx-tab');
      if (b) showTab(b.dataset.tab);
    });
    // flèches : onglet précédent / suivant ; Début / Fin
    nav.addEventListener('keydown', (e) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
      const btns = [...nav.querySelectorAll('.fx-tab')];
      let i = btns.findIndex((b) => b.dataset.tab === tab);
      if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = btns.length - 1;
      else i = (i + keys[e.key] + btns.length) % btns.length;
      e.preventDefault();
      showTab(btns[i].dataset.tab, true);
    });
  }

  /** Résumé de chaque section sous le nom de son onglet (et point des sous-onglets LFO). */
  function updateTabStates(p) {
    const st = (id, text, on = false) => {
      const el = $(`#sdState_${id}`);
      el.textContent = text;
      el.classList.toggle('on', on);
    };
    if (p.wave === null) st('vco', 'échantillon');
    else {
      const w = SS.WAVES.find((x) => x.id === p.wave);
      const color = noiseColor(p).label.toLowerCase();
      const parts = p.osc > 0 ? [w ? w.label : p.wave, p.voices > 1 ? `${p.voices} voix` : ''] : [];
      if (p.sub > 0) parts.push('sub');
      if (p.noise > 0) parts.push(p.osc > 0 ? `bruit ${color} ${fmtPct(p.noise)}` : `Bruit ${color}`);
      st('vco', parts.filter(Boolean).join(' · ') || 'silence');
    }
    const f = SS.FILTER_TYPES.find((x) => x.id === p.filter) || SS.FILTER_TYPES[0];
    st('vcf', p.filter === 'lowpass' && p.cutoff >= 19999 ? 'ouvert' : `${f.label} · ${fmtHz(p.cutoff)}`);
    st('env', `A ${fmtTime(p.attack)} · R ${fmtTime(p.release)}`);
    const active = SS.activeLfos(p).length;
    st('lfo', active ? `${active} actif${active > 1 ? 's' : ''}` : 'off', active > 0);
    st('glide', p.glide ? `${p.glideMode === 'legato' ? 'legato' : 'toujours'} · ${fmtTime(p.glide)}` : 'off', p.glide > 0);
    st('out', `${fmtPct(p.gain)} · ${SPECS.pan.fmt(p.pan)}`);
    for (let i = 1; i <= SS.LFO_COUNT; i++) {
      const dest = p[`lfo${i}Dest`];
      $(`#sdLfoTab${i} .dot`).classList.toggle('on', !!dest && dest !== 'off');
    }
  }

  const noiseColor = (p) => SS.NOISE_COLORS.find((c) => c.id === p.noiseColor) || SS.NOISE_COLORS[0];

  function build() {
    buildTabs();
    buildLfoPanels();
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
      input.addEventListener('change', () => (spec.group === 'glide' ? previewGlide() : preview()));
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
        // choisir une onde avec l'oscillateur coupé (Wind, Rumble…) : on le remet pour l'entendre
        if (!params().osc) set('osc', 1);
        // supersaw sans unison sonne comme une simple dent de scie : on donne des voix par défaut
        if (w.id === 'supersaw' && params().voices < 3) set('voices', 5);
        if (prevSuper && w.id !== 'supersaw' && params().voices >= 5) set('voices', 1);
        refresh();
        preview();
      });
      $('#sdWaves').append(b);
    });

    SS.NOISE_COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = c.id;
      b.textContent = c.label;
      b.title = `${c.hint} — s("${c.id}")`;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => {
        set('noiseColor', c.id);
        // choisir une couleur sans niveau ne ferait rien : on donne une valeur de départ
        if (!params().noise) set('noise', 0.3);
        refresh();
        preview();
      });
      $('#sdNoiseColor').append(b);
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

    SS.FILTER_MODELS.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = m.id;
      b.textContent = m.label;
      b.title = m.id === 'sem' ? m.hint : `ftype("${m.id}") — ${m.hint}`;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => {
        set('ftype', m.id);
        refresh();
        preview();
      });
      $('#sdFilterModel').append(b);
    });

    SS.GLIDE_MODES.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = m.id;
      b.textContent = m.label;
      b.title = m.hint;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => {
        set('glideMode', m.id);
        // choisir un mode de glide sans temps ne ferait rien : on donne une valeur de départ
        if (!params().glide) set('glide', 0.08);
        refresh();
        previewGlide();
      });
      $('#sdGlideMode').append(b);
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
    const radio = (sel, v) =>
      $(sel).querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', b.dataset.v === v);
        b.setAttribute('aria-checked', String(b.dataset.v === v));
      });
    radio('#sdFilterModel', p.ftype);
    radio('#sdGlideMode', p.glideMode);
    radio('#sdNoiseColor', p.noiseColor);
    for (let i = 1; i <= SS.LFO_COUNT; i++) {
      radio(`#sdLfo${i}Dest`, p[`lfo${i}Dest`]);
      radio(`#sdLfo${i}Shapes`, p[`lfo${i}Shape`]);
      radio(`#sdLfo${i}Mode`, p[`lfo${i}Mode`]);
      $(`#sdLfo${i}Rate`).value = p[`lfo${i}Rate`];
    }
    const model = SS.FILTER_MODELS.find((m) => m.id === p.ftype) || SS.FILTER_MODELS[0];
    $('#sdFilterHint').textContent = model.hint + '.';
    const gm = SS.GLIDE_MODES.find((m) => m.id === p.glideMode) || SS.GLIDE_MODES[0];
    $('#sdNoiseHint').textContent = p.noise > 0 ? noiseColor(p).hint + '.' : 'Ajoute du souffle au son de l’oscillateur ; coupe l’oscillateur pour n’entendre que le bruit.';
    $('#sdGlideHint').textContent = p.glide ? gm.hint + '.' : 'Réglez un temps pour faire glisser la hauteur d’une note à la suivante.';
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
    inputs.get('fdrive').row.classList.toggle('dim', p.ftype !== 'ladder' && p.ftype !== 'sem');
    $('#sdGlideMode').classList.toggle('dim', !p.glide);
    inputs.get('pw').row.hidden = p.wave !== 'pulse';
    inputs.get('subOct').row.classList.toggle('dim', !p.sub);
    // oscillateur coupé dans le mixeur : ses réglages n'ont plus d'effet
    $('#sdWaves').classList.toggle('dim', !p.osc);
    ['voices', 'pw'].forEach((k) => inputs.get(k).row.classList.toggle('dim', !p.osc));
    if (!p.osc) detuneRow.classList.add('dim');
    $('#sdNoiseColor').classList.toggle('dim', !p.noise);
    for (let i = 1; i <= SS.LFO_COUNT; i++) {
      const dest = p[`lfo${i}Dest`];
      const off = !dest || dest === 'off';
      $(`#sdLfo${i}Body`).classList.toggle('dim', off);
      inputs.get(`lfo${i}Hz`).row.hidden = p[`lfo${i}Rate`] !== 'hz';
      const d = SS.LFO_DESTS.find((x) => x.id === dest) || SS.LFO_DESTS[0];
      let hint = off ? 'Choisis une destination pour animer le son.' : d.hint + '.';
      if (dest === 'pw' && p.wave !== 'pulse') hint = 'Le PWM n’agit que sur l’onde Pulse.';
      if (dest === 'pitch' && !p.osc && !p.sub) hint = 'Seul le bruit sonne : il n’a pas de hauteur.';
      $(`#sdLfo${i}Hint`).textContent = hint;
    }
    $('#sdFenv').classList.toggle('dim', !p.env);
    drawAdsr(p, '#sdAdsr');
    drawAdsr({ attack: p.fattack, decay: p.fdecay, sustain: p.fsustain, release: p.frelease }, '#sdFenv');
    $('#sdCode').textContent = strudelCode(p);
    updateTabStates(p);
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
    if (p.wave && !p.osc && p.noise > 0) parts.push(`s("${p.noiseColor}")`);
    else if (p.wave) {
      parts.push(`s("${p.wave}")`);
      if (p.voices > 1) parts.push(`unison(${p.voices})`, `detune(${r(p.detune / 100, 2)})`);
      if (p.noise > 0 && p.noiseColor === 'white') parts.push(`noise(${r(p.noise, 2)})`);
    } else parts.push(`s("${SS.findInstrument(track.family, track.instrument).label}")`);
    const f = SS.FILTER_TYPES.find((x) => x.id === p.filter) || SS.FILTER_TYPES[0];
    if (f.strudel && !(p.filter === 'lowpass' && p.cutoff >= 19999)) parts.push(`${f.strudel}(${Math.round(p.cutoff)})`);
    const pre = f.strudel === 'lpf' ? 'lp' : f.strudel === 'hpf' ? 'hp' : 'bp';
    if (f.strudel && p.q > 0) parts.push(`${pre}q(${r(p.q, 1)})`);
    if (f.strudel && p.ftype !== '12db' && p.ftype !== 'sem') {
      parts.push(`ftype("${p.ftype}")`);
      if (p.ftype === 'ladder') parts.push(`drive(${r(p.fdrive * 4, 2)})`);
    }
    if (f.strudel && p.env > 0) {
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
    // ce que strudel ne sait pas (encore) faire : en commentaire
    const extra = [];
    if (!f.strudel) extra.push(`filtre ${f.label.toLowerCase()} ${Math.round(p.cutoff)} Hz`);
    if (p.ftype === 'sem') extra.push('filtre SEM');
    if (p.glide) extra.push(`${p.glideMode === 'legato' ? 'glide legato' : 'portamento'} ${fmtTime(p.glide)}`);
    if (p.wave === 'pulse') extra.push(`largeur ${Math.round(p.pw * 100)} %`);
    if (p.wave && p.osc > 0 && p.osc < 1) extra.push(`oscillateur ${Math.round(p.osc * 100)} %`);
    if (p.wave && p.osc > 0 && p.noise > 0 && p.noiseColor !== 'white') extra.push(`bruit ${noiseColor(p).label.toLowerCase()} ${Math.round(p.noise * 100)} %`);
    if (p.wave && !p.osc && p.noise > 0 && p.noise < 1) extra.push(`bruit ${Math.round(p.noise * 100)} %`);
    if (p.sub > 0 && p.wave) extra.push(`sous-oscillateur ${Math.round(p.sub * 100)} % −${p.subOct >= 2 ? 2 : 1} oct`);
    SS.activeLfos(p).forEach((l) => {
      const d = SS.LFO_DESTS.find((x) => x.id === l.dest);
      const sh = SS.LFO_SHAPES.find((x) => x.id === l.shape);
      extra.push(`LFO ${l.index} ${d.label.toLowerCase()} ${sh.label.toLowerCase()} ${SS.lfoRateLabel(l)} ${lfoAmtText(l.index, l.amt)}`);
    });
    return parts.join('.') + (extra.length ? ` // ${extra.join(', ')}` : '');
  }

  /* ---------- Écoute ---------- */
  function preview() {
    if (!track || SS.audio.isPlaying()) return; // en lecture, on entend déjà le résultat dans la boucle
    const root = track.lastRoot ?? (track.octave + 1) * 12;
    const notes = track.category === 'mono' ? root : SS.chordNotes(root, track.chord);
    const p = params();
    let dur = Math.min(1.6, Math.max(0.6, p.attack + p.decay + 0.3));
    // LFO : on écoute assez longtemps pour l'entendre bouger (un cycle, entre 2 et 6 s)
    const lfos = SS.activeLfos(p);
    if (lfos.length) {
      const pr = app.project && app.project();
      const clock = SS.lfoClock(pr ? pr.tempo : 120, pr ? SS.stepsPerBar(pr) / 4 : 4);
      const cycle = Math.max(...lfos.map((l) => 1 / SS.lfoHz(l, clock)));
      dur = Math.max(dur, Math.min(6, Math.max(2, cycle)));
    }
    if (p.attack > 1.2) dur = Math.max(dur, Math.min(8, p.attack + 1));
    SS.audio.preview(track, notes, dur);
  }

  /** Démo du glide : quelques notes liées (une octave, une quinte) pour l'entendre glisser. */
  function previewGlide() {
    if (!track || SS.audio.isPlaying() || track.category !== 'mono') return preview();
    const root = track.lastRoot ?? (track.octave + 1) * 12;
    const step = 0.22;
    SS.audio.playPhrase(track, [0, 12, 7, 0].map((iv, i) => ({ midi: root + iv, at: i * step, dur: step * (i === 3 ? 2 : 1.02) })));
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
    showLfo(lfoTab);
    $('#soundDialog').returnValue = '';
    $('#soundDialog').showModal();
    showTab(tab, true);
  }

  function init(appApi) {
    app = appApi;
    build();
  }

  return { init, open };
})();
