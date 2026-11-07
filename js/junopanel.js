/*
 * Sound design des pistes Synthé : façade du Roland Juno-106.
 *
 * Même disposition que l'instrument : TUNE / VOLUME, LFO, DCO, HPF, VCF, VCA, ENV, CHORUS,
 * puis la section des patches (MANUAL, groupe A/B, banques 1–8, numéros 1–8) et l'afficheur à LED.
 * Les curseurs vont de 0 à 10 comme sur le panneau ; les réglages vont dans track.juno
 * et s'entendent à la note suivante (le chorus change immédiatement).
 */
window.SS = window.SS || {};

SS.junoPanel = (() => {
  const $ = (s) => document.querySelector(s);
  let app;
  let track = null;
  let snapshot = null;
  const controls = []; // { key, sync() }

  const el = (tag, cls, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach((k) => k != null && n.append(k));
    return n;
  };

  /* ---------- Lecture / écriture des réglages ---------- */
  const params = () => SS.junoParams(track);
  const patchParams = () => (SS.findJunoPatch(track.junoPatch) || SS.JUNO_PATCHES[0]).params;

  function set(key, value) {
    const base = patchParams();
    const j = { ...(track.juno || {}), [key]: value };
    // on ne garde que ce qui diffère du patch
    for (const k of Object.keys(j)) {
      const same = typeof j[k] === 'number' && typeof base[k] === 'number' ? Math.abs(j[k] - base[k]) < 1e-4 : j[k] === base[k];
      if (same) delete j[k];
    }
    if (Object.keys(j).length) track.juno = j;
    else delete track.juno;
    SS.audio.applySynth(track); // comme sur le vrai synthé : les notes tenues changent aussi
    app.changed();
    syncAll();
  }

  /* ---------- Lectures physiques (bulle d'aide) ---------- */
  const D = SS.JunoDSP; // conversions du moteur (modèle J106 de l'Ultramaster KR-106)
  const fmtMs = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);
  const fmtHz = (v) => (v < 1000 ? `${v < 10 ? v.toFixed(2) : Math.round(v)} Hz` : `${(v / 1000).toFixed(2)} kHz`);
  const pct = (x) => `${Math.round(x * 100)} %`;
  const READOUT = {
    lfoRate: (x) => fmtHz(D.lfoFreq(x)),
    lfoDelay: (x) => (D.lfoHoldoff(x) > 0 ? `attente ${fmtMs(D.lfoHoldoff(x) * 1000)}` : 'off'),
    dcoLfo: (x) => (D.dcoLfoDepth(x) ? `±${D.dcoLfoDepth(x).toFixed(2)} demi-ton` : 'off'),
    pwm: (x) => `rapport ${Math.round((0.5 + x * 0.45) * 100)} %`,
    sub: (x) => (x > 0 ? pct(D.subLevel(x)) : 'off'),
    noise: (x) => (x > 0 ? pct(D.noiseLevel(x)) : 'off'),
    hpf: (v) => `${v} : ${D.HPF_LABELS[v]}`,
    vcfFreq: (x) => fmtHz(D.cutoffHz(x)),
    vcfRes: pct,
    vcfEnv: pct,
    vcfLfo: (x) => (x ? `±${D.vcfLfoDepth(x).toFixed(1)} demi-tons` : 'off'),
    kybd: pct,
    vcaLevel: (x) => `${D.vcaLevelDb(x) >= 0 ? '+' : ''}${D.vcaLevelDb(x).toFixed(1)} dB`,
    attack: (x) => fmtMs(D.attackMs(x)),
    decay: (x) => fmtMs(D.decRelMs(x)),
    sustain: pct,
    release: (x) => fmtMs(D.decRelMs(x)),
    volume: pct,
    tune: (x) => `${x >= 0.5 ? '+' : ''}${Math.round((x - 0.5) * 100)} cents`,
  };

  /* ---------- Composants ---------- */

  /** Curseur vertical du Juno (graduations 0–10), steps = nombre de crans (HPF : 4). */
  function slider(key, label, opts = {}) {
    const steps = opts.steps || 0;
    const get = opts.get || (() => params()[key]);
    const put = opts.put || ((v) => set(key, v));
    const toUnit = (v) => (steps ? v / (steps - 1) : v);
    const fromUnit = (u) => (steps ? Math.round(u * (steps - 1)) : Math.round(u * 1000) / 1000);

    const cap = el('div', 'js-cap', {}, el('span', 'js-cap-line'));
    const slot = el('div', 'js-slot', {}, cap);
    // graduations du panneau : un trait par unité, traits épais à 0, 5 et 10 (HPF : un trait par cran)
    const scale = el('div', 'js-scale', { 'aria-hidden': 'true' });
    const n = steps || 11;
    for (let i = 0; i < n; i++) scale.append(el('span', steps || i % 5 === 0 ? 'heavy' : '', { style: `bottom:${((i / (n - 1)) * 100).toFixed(2)}%` }));
    const tip = el('div', 'js-tip');
    const box = el('div', 'js-box', { role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(steps ? steps - 1 : 10) }, scale, slot, tip);
    const wrap = el('div', 'jslider' + (steps ? ' notched' : ''), {}, el('div', 'js-label', { text: label }), box);

    const valueAt = (clientY) => {
      const r = slot.getBoundingClientRect();
      return Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    };
    const commit = (u) => {
      const v = fromUnit(Math.max(0, Math.min(1, u)));
      if (v !== get()) put(v);
    };
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      box.focus();
      box.setPointerCapture(e.pointerId);
      wrap.classList.add('drag');
      // clic sur le capuchon : déplacement relatif (pas de saut) ; ailleurs : le capuchon vient sous le pointeur
      const onCap = e.target === cap;
      const startY = e.clientY;
      const startU = toUnit(get());
      if (!onCap) commit(valueAt(e.clientY));
      const move = (ev) => {
        if (onCap) {
          const h = slot.getBoundingClientRect().height;
          commit(startU - (ev.clientY - startY) / h);
        } else commit(valueAt(ev.clientY));
      };
      const up = () => {
        wrap.classList.remove('drag');
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', up);
        box.removeEventListener('pointercancel', up);
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
    box.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = steps ? Math.sign(-e.deltaY) / (steps - 1) : -e.deltaY * 0.0008;
      commit(toUnit(get()) + d);
    }, { passive: false });
    box.addEventListener('keydown', (e) => {
      const fine = steps ? 1 / (steps - 1) : e.shiftKey ? 0.1 : 0.01;
      const d = { ArrowUp: fine, ArrowRight: fine, ArrowDown: -fine, ArrowLeft: -fine, PageUp: 0.1, PageDown: -0.1 }[e.key];
      if (d !== undefined) {
        e.preventDefault();
        commit(toUnit(get()) + (steps && Math.abs(d) < 1 / (steps - 1) ? Math.sign(d) / (steps - 1) : d));
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        commit(e.key === 'End' ? 1 : 0);
      }
    });
    box.addEventListener('dblclick', () => (opts.reset ? opts.reset() : put(patchParams()[key])));

    controls.push({
      sync() {
        const v = get();
        const u = toUnit(v);
        cap.style.bottom = `${(u * 100).toFixed(2)}%`; // le centre du capuchon suit la graduation
        const txt = READOUT[key] ? READOUT[key](v) : String(v);
        tip.textContent = txt;
        box.setAttribute('aria-valuenow', steps ? String(v) : (v * 10).toFixed(1));
        box.setAttribute('aria-valuetext', txt);
        box.title = `${label} : ${txt}`;
        const base = opts.get ? null : patchParams()[key];
        wrap.classList.toggle('edited', base != null && Math.abs(v - base) > 1e-4);
      },
    });
    return wrap;
  }

  /**
   * Bouton du Juno : sérigraphie au-dessus, LED rouge (ou simple trait, opts.led === false),
   * puis la touche en relief sans inscription (opts.color : 'cream', 'yellow' ou 'orange').
   */
  function button(label, isOn, onPress, opts = {}) {
    const aria = opts.aria || (typeof label === 'string' ? label : '');
    // opts.led : true (LED rouge), false (simple trait sérigraphié), 'none' (rien : touches de patch)
    const led = opts.led === 'none' ? null : el('span', opts.led === false ? 'jb-line' : 'jb-led', { 'aria-hidden': 'true' });
    const b = el('button', `jbtn ${opts.color || 'white'} ${opts.cls || ''}`, { type: 'button', 'aria-label': aria, title: aria, onclick: onPress });
    const wrap = el('div', 'jb-wrap', {}, label === '' ? null : el('span', 'jb-label', { 'aria-hidden': 'true' }, label), led, b);
    controls.push({
      sync() {
        const on = isOn();
        if (led) led.classList.toggle('on', on);
        b.classList.toggle('pressed', on);
        b.setAttribute('aria-pressed', String(on));
      },
    });
    return wrap;
  }

  /** Inverseur à 3 positions (RANGE 4' / 8' / 16'), de haut en bas. */
  function toggle3(key, values, labels, aria) {
    const lever = el('span', 'jt-lever');
    const sw = el('button', 'jtoggle three', {
      type: 'button',
      'aria-label': aria,
      onclick: (e) => {
        // clic dans le tiers haut / milieu / bas = position correspondante
        const r = sw.getBoundingClientRect();
        const i = Math.max(0, Math.min(2, Math.floor(((e.clientY - r.top) / r.height) * 3)));
        set(key, values[e.detail === 0 ? (values.indexOf(params()[key]) + 1) % 3 : i]);
      },
    }, lever);
    const lab = el('div', 'jt3-labels', { 'aria-hidden': 'true' }, ...labels.map((l) => el('span', '', { text: l })));
    const wrap = el('div', 'jt-wrap jt3', {}, el('div', 'jt3-body', {}, lab, sw));
    controls.push({
      sync() {
        const i = values.indexOf(params()[key]);
        sw.dataset.pos = String(i);
        sw.title = `${aria} : ${labels[i]}`;
      },
    });
    return wrap;
  }

  /** Interrupteur à 2 positions (haut / bas). */
  function toggle(key, upVal, upLabel, downVal, downLabel, aria) {
    const lever = el('span', 'jt-lever');
    const sw = el('button', 'jtoggle', { type: 'button', 'aria-label': aria, onclick: () => set(key, params()[key] === upVal ? downVal : upVal) }, lever);
    const lab = (l) => (l instanceof Node ? el('span', 'jt-l', {}, l) : el('span', 'jt-l', { text: l }));
    const wrap = el('div', 'jt-wrap', {}, lab(upLabel), sw, lab(downLabel));
    controls.push({
      sync() {
        const up = params()[key] === upVal;
        sw.classList.toggle('up', up);
        sw.title = `${aria} : ${up ? (typeof upLabel === 'string' ? upLabel : '+') : typeof downLabel === 'string' ? downLabel : '−'}`;
      },
    });
    return wrap;
  }

  /** Bouton rotatif (TUNE, VOLUME). */
  function knob(key, label, get, put, def) {
    const dot = el('span', 'jk-dot');
    const k = el('div', 'jknob', { role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '10' }, dot);
    const tip = el('div', 'js-tip');
    const wrap = el('div', 'jk-wrap', {}, el('div', 'jk-box', {}, k, tip), el('div', 'js-label', { text: label }));
    const commit = (v) => put(Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000);
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      k.focus();
      k.setPointerCapture(e.pointerId);
      wrap.classList.add('drag');
      const y0 = e.clientY;
      const v0 = get();
      const move = (ev) => commit(v0 - (ev.clientY - y0) / 150);
      const up = () => {
        wrap.classList.remove('drag');
        k.removeEventListener('pointermove', move);
        k.removeEventListener('pointerup', up);
      };
      k.addEventListener('pointermove', move);
      k.addEventListener('pointerup', up);
    });
    k.addEventListener('wheel', (e) => {
      e.preventDefault();
      commit(get() - e.deltaY * 0.0008);
    }, { passive: false });
    k.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01 }[e.key];
      if (d) {
        e.preventDefault();
        commit(get() + d * (e.shiftKey ? 10 : 1));
      }
    });
    k.addEventListener('dblclick', () => commit(def()));
    controls.push({
      sync() {
        const v = get();
        k.style.setProperty('--a', `${-135 + v * 270}deg`);
        const txt = READOUT[key](v);
        tip.textContent = txt;
        k.title = `${label} : ${txt}`;
        k.setAttribute('aria-valuenow', (v * 10).toFixed(1));
        k.setAttribute('aria-valuetext', txt);
      },
    });
    return wrap;
  }

  const section = (title, cls, ...kids) =>
    el('section', 'jsec ' + cls, {}, el('h3', 'jsec-title', { text: title }), el('div', 'jsec-body', {}, ...kids));
  const group = (cls, ...kids) => el('div', 'jgroup ' + (cls || ''), {}, ...kids);
  /** Groupe de commandes encadré par les filets blancs du panneau. */
  const cg = (...kids) => el('div', 'jcg', {}, ...kids);
  /** Graduation chiffrée sérigraphiée à gauche / droite d'un groupe de curseurs (10-5-0, 3-2-1-0, +5-0-−5). */
  const nums = (marks, side) =>
    el('div', 'jnum ' + side, { 'aria-hidden': 'true' },
      el('div', 'jnum-pad'),
      el('div', 'jnum-box', {}, ...marks.map((m, i) => el('span', '', { text: m, style: `bottom:${((1 - i / (marks.length - 1)) * 100).toFixed(2)}%` }))));
  /** Groupe de curseurs encadré par sa graduation chiffrée. */
  const scaled = (marks, ...kids) => cg(nums(marks, 'l'), ...kids, nums(marks, 'r'));
  const TEN = ['10', '5', '0'];
  /** Petits symboles d'enveloppe sérigraphiés (polarité du VCF). */
  const envIcon = (inv) => {
    const sp = document.createElement('span');
    sp.innerHTML = `<svg viewBox="0 0 16 10" class="jenv" aria-hidden="true"><path d="${inv ? 'M1 1 L5 9 L9 5 L12 5 L15 1' : 'M1 9 L5 1 L9 5 L12 5 L15 9'}"/></svg>`;
    return sp.firstChild;
  };

  /* ---------- Construction de la façade ---------- */
  function build() {
    const body = $('#junoBody');
    const pv = () => params();

    body.append(
      section('', 'jsec-knobs',
        knob('tune', 'TUNE', () => pv().tune ?? 0.5, (v) => set('tune', v), () => 0.5),
        knob('volume', 'VOLUME', () => track.volume, (v) => {
          track.volume = v;
          SS.audio.setTrackGain(track, v);
          app.changed();
          syncAll();
        }, () => 0.8)
      ),
      section('LFO', 'jsec-lfo', scaled(TEN, slider('lfoRate', 'RATE'), slider('lfoDelay', 'DELAY TIME'))),
      section('DCO', 'jsec-dco',
        cg(group('jrange', el('div', 'jgroup-title', { text: 'RANGE' }),
          el('div', 'jrow', {},
            button("16'", () => pv().range === 16, () => set('range', 16), { aria: "16'" }),
            button("8'", () => pv().range === 8, () => set('range', 8), { aria: "8'" }),
            button("4'", () => pv().range === 4, () => set('range', 4), { aria: "4'" })
          ))),
        scaled(TEN,
          slider('dcoLfo', 'LFO'),
          slider('pwm', 'PWM')),
        cg(toggle('pwmMode', 'lfo', 'LFO', 'man', 'MAN', 'Source du PWM'),
          button(waveIcon('pulse'), () => pv().pulse, () => set('pulse', !pv().pulse), { aria: 'Impulsion', cls: 'wave' }),
          button(waveIcon('saw'), () => pv().saw, () => set('saw', !pv().saw), { aria: 'Dent de scie', cls: 'wave' })),
        scaled(TEN, slider('sub', 'SUB'), slider('noise', 'NOISE'))
      ),
      section('HPF', 'jsec-hpf', scaled(['3', '2', '1', '0'], slider('hpf', 'FREQ', { steps: 4 }))),
      section('VCF', 'jsec-vcf',
        scaled(TEN,
          slider('vcfFreq', 'FREQ'),
          slider('vcfRes', 'RES'),
          toggle('envPol', 1, envIcon(false), -1, envIcon(true), "Polarité de l'enveloppe du filtre"),
          slider('vcfEnv', 'ENV'),
          slider('vcfLfo', 'LFO'),
          slider('kybd', 'KYBD')
        )
      ),
      section('VCA', 'jsec-vca', cg(toggle('vcaMode', 'env', 'ENV', 'gate', 'GATE', 'Mode du VCA'), slider('vcaLevel', 'LEVEL'), nums(['+5', '0', '−5'], 'r'))),
      section('ENV', 'jsec-env', scaled(TEN, slider('attack', 'A'), slider('decay', 'D'), slider('sustain', 'S'), slider('release', 'R'))),
      section('CHORUS', 'jsec-chorus',
        cg(
          el('div', 'jrow jchorus', {},
            button('OFF', () => !pv().chorus, () => set('chorus', 0), { led: false, aria: 'Chorus off' }),
            button('I', () => pv().chorus === 1, () => set('chorus', 1), { color: 'yellow', cls: 'serif', aria: 'Chorus I' }),
            button('II', () => pv().chorus === 2, () => set('chorus', 2), { color: 'yellow', cls: 'serif', aria: 'Chorus II' })
          )
        )
      )
    );

    // Bas de façade : sélection du groupe, banques, afficheur à LED, numéros de patch
    const bottom = $('#junoBottom');
    const ledA = el('span', 'jb-led');
    const ledB = el('span', 'jb-led green');
    controls.push({ sync: () => { ledA.classList.toggle('on', groupOf() !== 'B' && track.junoPatch !== 'MAN'); ledB.classList.toggle('on', groupOf() === 'B'); } });
    const banks = el('div', 'jrow', {});
    const numsRow = el('div', 'jrow', {});
    for (let i = 1; i <= 8; i++) {
      banks.append(button(String(i), () => bankOf() === i, () => pickPatch(groupOf() || 'A', i, numOf() || 1), { color: 'blue', led: 'none', cls: 'pbtn', aria: `Banque ${i}` }));
      numsRow.append(button(String(i), () => numOf() === i, () => pickPatch(groupOf() || 'A', bankOf() || 1, i), { color: 'blue', led: 'none', cls: 'pbtn', aria: `Patch ${i}` }));
    }
    bottom.append(
      el('div', 'jpatch-sec jselect', {},
        el('div', 'jsel-leds', {},
          el('div', 'jsel-row', {}, el('span', 'jsel-l', { text: 'GROUP A' }), ledA),
          el('div', 'jsel-row', {}, el('span', 'jsel-l', { text: 'GROUP B' }), ledB)),
        button('SELECT', () => false, () => pickPatch(groupOf() === 'B' ? 'A' : 'B', bankOf() || 1, numOf() || 1), { led: 'none', aria: 'Groupe A / B' })),
      el('div', 'jpatch-sec banks', {}, el('div', 'jbar', { text: 'BANK' }), banks),
      el('div', 'jpatch-sec jdisp', {},
        el('div', 'jdisp-labels', { 'aria-hidden': 'true' }, el('span', '', { text: 'BANK' }), el('span', '', { text: 'PATCH NUMBER' })),
        el('div', 'jled', { id: 'junoDisplay', 'aria-live': 'polite' }),
        el('div', 'jdisp-name', { id: 'junoPatchName' })),
      el('div', 'jpatch-sec nums', {}, el('div', 'jbar', { text: 'PATCH NUMBER' }), numsRow),
      el('div', 'jpatch-sec', {}, button('MANUAL', () => track.junoPatch === 'MAN', () => pickManual(), { led: false, aria: 'Manual' }))
    );

    const dlg = $('#junoDialog');
    $('#junoPreview').addEventListener('click', () => preview());
    $('#junoReset').addEventListener('click', () => {
      delete track.juno;
      SS.audio.applySynth(track);
      app.changed();
      syncAll();
      preview();
    });
    $('#junoCancel').addEventListener('click', () => dlg.close('cancel'));
    $('#junoForm').addEventListener('submit', (e) => {
      e.preventDefault();
      dlg.close('ok');
    });
    dlg.addEventListener('close', () => {
      if (!track) return;
      if (dlg.returnValue !== 'ok') {
        // Annuler / Échap : retour aux réglages d'avant l'ouverture
        track.junoPatch = snapshot.patch;
        if (snapshot.juno) track.juno = snapshot.juno;
        else delete track.juno;
        track.volume = snapshot.volume;
        SS.audio.setTrackGain(track, track.volume);
        SS.audio.applySynth(track);
        app.changed();
      }
      app.renderTrack(track);
      track = null;
    });
    dlg.addEventListener('keydown', (e) => e.stopPropagation());
  }

  function waveIcon(kind) {
    const span = document.createElement('span');
    span.className = 'jwave';
    span.innerHTML =
      kind === 'saw'
        ? '<svg viewBox="0 0 24 14" aria-hidden="true"><path d="M1 12 L8 2 L8 12 L15 2 L15 12 L22 2 L22 12"/></svg>'
        : '<svg viewBox="0 0 24 14" aria-hidden="true"><path d="M1 12 V2 H6 V12 H12 V2 H17 V12 H23"/></svg>';
    return span;
  }

  /* ---------- Patches ---------- */
  const cur = () => /^([AB])(\d)(\d)$/.exec(track.junoPatch || '') || [];
  const groupOf = () => cur()[1] || null;
  const bankOf = () => (cur()[2] ? +cur()[2] : null);
  const numOf = () => (cur()[3] ? +cur()[3] : null);

  function pickPatch(g, b, n) {
    const id = `${g}${b}${n}`;
    const patch = SS.findJunoPatch(id);
    if (!patch) {
      // mémoire vide : l'afficheur clignote, rien n'est chargé
      const d = $('#junoDisplay');
      showLed(b, n);
      $('#junoPatchName').textContent = '';
      d.classList.remove('blink');
      void d.offsetWidth;
      d.classList.add('blink');
      setTimeout(syncAll, 900);
      return;
    }
    track.junoPatch = id;
    delete track.juno;
    SS.audio.applySynth(track);
    app.changed();
    syncAll();
    preview();
  }

  /** MANUAL : le son prend la position actuelle de tous les curseurs (on garde le son courant, sans patch). */
  function pickManual() {
    const p = params();
    track.junoPatch = 'MAN';
    track.juno = {};
    for (const [k, v] of Object.entries(p)) if (v !== SS.JUNO_MANUAL.params[k]) track.juno[k] = v;
    if (!Object.keys(track.juno).length) delete track.juno;
    app.changed();
    syncAll();
  }

  /** Afficheur à LED : « banque.numéro. » avec les points décimaux (« -- » en manuel). */
  function showLed(bank, num) {
    const d = $('#junoDisplay');
    if (bank == null) {
      d.replaceChildren(el('span', '', { text: '--' }));
      d.setAttribute('aria-label', 'Manual');
      return;
    }
    d.replaceChildren(el('span', '', { text: String(bank) }), el('i', 'dp'), el('span', '', { text: String(num) }), el('i', 'dp'));
    d.setAttribute('aria-label', `Banque ${bank}, patch ${num}`);
  }

  function syncAll() {
    if (!track) return;
    controls.forEach((c) => c.sync());
    const patch = SS.findJunoPatch(track.junoPatch);
    const edited = track.juno && Object.keys(track.juno).length;
    // afficheur : « banque.numéro. » comme sur le Juno-106 (« -- » en manuel)
    showLed(track.junoPatch === 'MAN' ? null : bankOf(), numOf());
    $('#junoDisplay').classList.toggle('edited', !!edited);
    $('#junoPatchName').textContent = (patch ? patch.name : '') + (edited ? ' *' : '');
  }

  /* ---------- Écoute ---------- */
  function preview() {
    if (!track || SS.audio.isPlaying()) return; // en lecture, on entend déjà le résultat
    const root = track.lastRoot ?? (track.octave + 1) * 12;
    const notes = track.category === 'mono' ? root : SS.chordNotes(root, track.chord);
    const p = params();
    const len = Math.min(2, Math.max(0.5, D.attackMs(p.attack) / 1000 + 0.4));
    SS.audio.preview(track, notes, len);
  }

  /* ---------- API ---------- */
  function open(t) {
    if (!SS.isAnalog(t)) return;
    SS.audio.ensureCtx();
    track = t;
    snapshot = { patch: t.junoPatch, juno: t.juno ? { ...t.juno } : null, volume: t.volume };
    $('#junoTrack').textContent = `Piste « ${t.name} »`;
    syncAll();
    const dlg = $('#junoDialog');
    dlg.returnValue = '';
    dlg.showModal();
  }

  function init(appApi) {
    app = appApi;
    build();
  }

  return { init, open };
})();
