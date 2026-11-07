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
    if (key === 'chorus') SS.audio.applySynth(track);
    app.changed();
    syncAll();
  }

  /* ---------- Lectures physiques (bulle d'aide) ---------- */
  const M = SS.JUNO_MAP;
  const fmtT = (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
  const fmtHz = (v) => (v < 1000 ? `${v < 10 ? v.toFixed(2) : Math.round(v)} Hz` : `${(v / 1000).toFixed(2)} kHz`);
  const READOUT = {
    lfoRate: (x) => fmtHz(M.lfoRate(x)),
    lfoDelay: (x) => (x ? fmtT(M.lfoDelay(x)) : 'off'),
    dcoLfo: (x) => `±${Math.round(M.dcoLfo(x))} cents`,
    pwm: (x) => `largeur ${Math.round((0.5 - x * 0.45) * 100)} %`,
    sub: (x) => `${Math.round(x * 100)} %`,
    noise: (x) => `${Math.round(x * 100)} %`,
    hpf: (v) => ['0 : renfort de graves', '1 : neutre', '2 : coupe-bas 240 Hz', '3 : coupe-bas 720 Hz'][v],
    vcfFreq: (x) => fmtHz(M.vcfFreq(x)),
    vcfRes: (x) => `${Math.round(x * 100)} %`,
    vcfEnv: (x) => `${M.vcfEnv(x).toFixed(1)} oct`,
    vcfLfo: (x) => `±${M.vcfLfo(x).toFixed(1)} oct`,
    kybd: (x) => `${Math.round(x * 100)} %`,
    vcaLevel: (x) => `${Math.round(x * 200)} %`,
    attack: (x) => fmtT(M.attack(x)),
    decay: (x) => fmtT(M.decay(x)),
    sustain: (x) => `${Math.round(x * 100)} %`,
    release: (x) => fmtT(M.release(x)),
    volume: (x) => `${Math.round(x * 100)} %`,
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

    const cap = el('div', 'js-cap');
    const slot = el('div', 'js-slot', {}, cap);
    const scale = el('div', 'js-scale', { 'aria-hidden': 'true' });
    const marks = steps ? [...Array(steps).keys()].reverse() : [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    marks.forEach((m) => scale.append(el('span', '', { text: String(m) })));
    const tip = el('div', 'js-tip');
    const box = el('div', 'js-box', { role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(steps ? steps - 1 : 10) }, scale, slot, tip);
    const wrap = el('div', 'jslider' + (steps ? ' notched' : ''), {}, box, el('div', 'js-label', { text: label }));

    const valueAt = (clientY) => {
      const r = slot.getBoundingClientRect();
      return Math.max(0, Math.min(1, 1 - (clientY - r.top - 6) / (r.height - 12)));
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
          const h = slot.getBoundingClientRect().height - 12;
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
        cap.style.bottom = `calc(${(u * 100).toFixed(2)}% - ${(u * 12).toFixed(2)}px)`;
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

  /** Bouton du Juno avec sa LED rouge. */
  function button(label, isOn, onPress, cls = '') {
    const led = el('span', 'jb-led', { 'aria-hidden': 'true' });
    const b = el('button', 'jbtn ' + cls, { type: 'button', onclick: onPress }, el('span', 'jb-cap', {}, label));
    const wrap = el('div', 'jb-wrap', {}, led, b);
    controls.push({
      sync() {
        const on = isOn();
        led.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      },
    });
    return wrap;
  }

  /** Interrupteur à 2 positions (haut / bas). */
  function toggle(key, upVal, upLabel, downVal, downLabel, aria) {
    const lever = el('span', 'jt-lever');
    const sw = el('button', 'jtoggle', { type: 'button', 'aria-label': aria, onclick: () => set(key, params()[key] === upVal ? downVal : upVal) }, lever);
    const wrap = el('div', 'jt-wrap', {}, el('span', 'jt-l', { text: upLabel }), sw, el('span', 'jt-l', { text: downLabel }));
    controls.push({
      sync() {
        const up = params()[key] === upVal;
        sw.classList.toggle('up', up);
        sw.title = `${aria} : ${up ? upLabel : downLabel}`;
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
      section('LFO', 'jsec-lfo', slider('lfoRate', 'RATE'), slider('lfoDelay', 'DELAY TIME')),
      section('DCO', 'jsec-dco',
        group('jrange',
          el('div', 'jgroup-title', { text: 'RANGE' }),
          el('div', 'jrow', {},
            button("16'", () => pv().range === 16, () => set('range', 16)),
            button("8'", () => pv().range === 8, () => set('range', 8)),
            button("4'", () => pv().range === 4, () => set('range', 4))
          )
        ),
        slider('dcoLfo', 'LFO'),
        slider('pwm', 'PWM'),
        toggle('pwmMode', 'lfo', 'LFO', 'man', 'MAN', 'Source du PWM'),
        group('jwaves',
          el('div', 'jrow', {},
            button(waveIcon('pulse'), () => pv().pulse, () => set('pulse', !pv().pulse), 'wave'),
            button(waveIcon('saw'), () => pv().saw, () => set('saw', !pv().saw), 'wave')
          )
        ),
        slider('sub', 'SUB OSC'),
        slider('noise', 'NOISE')
      ),
      section('HPF', 'jsec-hpf', slider('hpf', 'FREQ', { steps: 4 })),
      section('VCF', 'jsec-vcf',
        slider('vcfFreq', 'FREQ'),
        slider('vcfRes', 'RES'),
        toggle('envPol', 1, '+', -1, '−', "Polarité de l'enveloppe du filtre"),
        slider('vcfEnv', 'ENV'),
        slider('vcfLfo', 'LFO'),
        slider('kybd', 'KYBD')
      ),
      section('VCA', 'jsec-vca', toggle('vcaMode', 'env', 'ENV', 'gate', 'GATE', 'Mode du VCA'), slider('vcaLevel', 'LEVEL')),
      section('ENV', 'jsec-env', slider('attack', 'A'), slider('decay', 'D'), slider('sustain', 'S'), slider('release', 'R')),
      section('CHORUS', 'jsec-chorus',
        el('div', 'jrow jchorus', {},
          button('OFF', () => !pv().chorus, () => set('chorus', 0)),
          button('I', () => pv().chorus === 1, () => set('chorus', 1)),
          button('II', () => pv().chorus === 2, () => set('chorus', 2))
        )
      )
    );

    // Section des patches
    const bottom = $('#junoBottom');
    const groupBtns = el('div', 'jrow', {},
      button('A', () => groupOf() === 'A', () => pickPatch('A', bankOf() || 1, numOf() || 1), 'grp'),
      button('B', () => groupOf() === 'B', () => pickPatch('B', bankOf() || 1, numOf() || 1), 'grp')
    );
    const banks = el('div', 'jrow', {});
    const nums = el('div', 'jrow', {});
    for (let i = 1; i <= 8; i++) {
      banks.append(button(String(i), () => bankOf() === i, () => pickPatch(groupOf() || 'A', i, numOf() || 1), 'pbtn bank'));
      nums.append(button(String(i), () => numOf() === i, () => pickPatch(groupOf() || 'A', bankOf() || 1, i), 'pbtn num'));
    }
    bottom.append(
      el('div', 'jpatch-sec', {},
        el('div', 'jgroup-title', { text: 'MANUAL' }),
        el('div', 'jrow', {}, button('MANUAL', () => track.junoPatch === 'MAN', () => pickManual(), 'man'))
      ),
      el('div', 'jpatch-sec', {}, el('div', 'jgroup-title', { text: 'GROUP' }), groupBtns),
      el('div', 'jpatch-sec banks', {}, el('div', 'jgroup-title', { text: 'BANK' }), banks),
      el('div', 'jpatch-sec nums', {}, el('div', 'jgroup-title', { text: 'NUMBER' }), nums)
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
        ? '<svg viewBox="0 0 24 14" aria-hidden="true"><path d="M1 12 L8 2 L8 12 L15 2 L15 12 L22 2 L22 12"/></svg><span class="sr">Dent de scie</span>'
        : '<svg viewBox="0 0 24 14" aria-hidden="true"><path d="M1 12 V2 H6 V12 H12 V2 H17 V12 H23"/></svg><span class="sr">Impulsion</span>';
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
      d.textContent = id;
      $('#junoPatchName').textContent = '— mémoire vide —';
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

  function syncAll() {
    if (!track) return;
    controls.forEach((c) => c.sync());
    const patch = SS.findJunoPatch(track.junoPatch);
    const edited = track.juno && Object.keys(track.juno).length;
    $('#junoDisplay').textContent = track.junoPatch === 'MAN' ? 'MAN' : track.junoPatch;
    $('#junoDisplay').classList.toggle('edited', !!edited);
    $('#junoPatchName').textContent = patch ? patch.name + (edited ? ' (modifié)' : '') : '';
  }

  /* ---------- Écoute ---------- */
  function preview() {
    if (!track || SS.audio.isPlaying()) return; // en lecture, on entend déjà le résultat
    const root = track.lastRoot ?? (track.octave + 1) * 12;
    const notes = track.category === 'mono' ? root : SS.chordNotes(root, track.chord);
    const p = params();
    const len = Math.min(2, Math.max(0.5, M.attack(p.attack) + 0.4));
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
