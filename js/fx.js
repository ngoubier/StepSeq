/*
 * Fenêtre « Effets » d'une piste : chorus, delay, reverb, sidechain et envois vers les bus partagés
 * (reverbs plate / hall et écho communs à tout le morceau, réglés dans project.returns).
 * Delay et reverb reprennent les paramètres de strudel.cc
 * (delay / delaytime / delayfeedback, room / roomsize / roomlp).
 * Les réglages sont dans track.fx et s'entendent immédiatement, y compris pendant la lecture.
 */
window.SS = window.SS || {};

SS.fx = (() => {
  const $ = (s) => document.querySelector(s);
  let app;
  let track = null;
  let snapshot = null;
  const inputs = new Map();

  const lin = (min, max) => ({ to: (x) => min + (max - min) * x, from: (v) => (v - min) / (max - min) });
  const logf = (min, max) => ({ to: (x) => min * Math.pow(max / min, x), from: (v) => Math.log(v / min) / Math.log(max / min) });
  const pct = (v) => (v ? `${Math.round(v * 100)} %` : 'off');

  const SPECS = {
    chorus: { label: 'Mix', scale: lin(0, 1), fmt: pct, box: '#fxChorusSliders' },
    chorusRate: { label: 'Vitesse', scale: logf(0.1, 6), fmt: (v) => `${v.toFixed(2)} Hz`, box: '#fxChorusSliders' },
    chorusDepth: { label: 'Profondeur', scale: lin(0, 1), fmt: (v) => `${Math.round(v * 100)} %`, box: '#fxChorusSliders' },
    delay: { label: 'Mix', scale: lin(0, 1), fmt: pct, box: '#fxDelaySliders' },
    delayFeedback: { label: 'Feedback (répétitions)', scale: lin(0, 0.9), fmt: (v) => `${Math.round(v * 100)} %`, box: '#fxDelaySliders' },
    room: { label: 'Mix', scale: lin(0, 1), fmt: pct, box: '#fxRoomSliders' },
    roomSize: { label: 'Taille (durée)', scale: logf(0.2, 10), fmt: (v) => `${v.toFixed(1)} s`, box: '#fxRoomSliders' },
    scDepth: { label: 'Profondeur (baisse du volume)', scale: lin(0, 1), fmt: (v) => `${Math.round(v * 100)} %`, box: '#fxScSliders' },
    scRelease: { label: 'Relâchement (remontée)', scale: logf(0.03, 1), fmt: (v) => `${Math.round(v * 1000)} ms`, box: '#fxScSliders' },
    sendPlate: { label: 'Plate (batterie)', scale: lin(0, 1), fmt: pct, box: '#fxSendSliders' },
    sendHall: { label: 'Hall (instruments)', scale: lin(0, 1), fmt: pct, box: '#fxSendSliders' },
    sendEcho: { label: 'Écho', scale: lin(0, 1), fmt: pct, box: '#fxSendSliders' },
    roomLp: { label: 'Brillance', scale: logf(500, 20000), fmt: (v) => (v < 1000 ? `${Math.round(v)} Hz` : `${(v / 1000).toFixed(1)} kHz`), box: '#fxRoomSliders' },
  };

  const PRESETS = {
    chorus: [
      { label: 'Léger', v: { chorus: 0.3, chorusRate: 0.6, chorusDepth: 0.35 } },
      { label: 'Large', v: { chorus: 0.5, chorusRate: 0.9, chorusDepth: 0.6 } },
      { label: 'Profond', v: { chorus: 0.7, chorusRate: 2.5, chorusDepth: 0.85 } },
      { label: 'Off', v: { chorus: 0 } },
    ],
    delay: [
      { label: 'Slapback', v: { delay: 0.3, delayTime: '1/16', delayFeedback: 0.1 } },
      { label: 'Écho 1/8', v: { delay: 0.35, delayTime: '1/8', delayFeedback: 0.35 } },
      { label: 'Dub 1/8 pointée', v: { delay: 0.45, delayTime: '3/16', delayFeedback: 0.6 } },
      { label: '1/4', v: { delay: 0.3, delayTime: '1/4', delayFeedback: 0.45 } },
      { label: 'Off', v: { delay: 0 } },
    ],
    sc: [
      { label: 'Léger', v: { scDepth: 0.35, scRelease: 0.15 } },
      { label: 'Pompe house', v: { scDepth: 0.7, scRelease: 0.22 } },
      { label: 'Extrême', v: { scDepth: 0.95, scRelease: 0.4 } },
    ],
    send: [
      { label: 'Sec', v: { sendPlate: 0, sendHall: 0, sendEcho: 0 } },
      { label: 'Batterie', v: { sendPlate: 0.3, sendHall: 0, sendEcho: 0 } },
      { label: 'Nappe', v: { sendPlate: 0, sendHall: 0.4, sendEcho: 0 } },
      { label: 'Lead', v: { sendPlate: 0, sendHall: 0.25, sendEcho: 0.18 } },
      { label: 'Arpège', v: { sendPlate: 0, sendHall: 0.2, sendEcho: 0.25 } },
    ],
    room: [
      { label: 'Pièce', v: { room: 0.2, roomSize: 0.8, roomLp: 9000 } },
      { label: 'Hall', v: { room: 0.35, roomSize: 2.8, roomLp: 7000 } },
      { label: 'Cathédrale', v: { room: 0.5, roomSize: 7, roomLp: 5000 } },
      { label: 'Plate', v: { room: 0.3, roomSize: 1.6, roomLp: 16000 } },
      { label: 'Off', v: { room: 0 } },
    ],
  };

  const params = () => SS.fxParams(track);

  function build() {
    for (const [key, spec] of Object.entries(SPECS)) {
      const id = 'fx_' + key;
      const row = document.createElement('div');
      row.className = 'sd-row';
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = spec.label;
      const out = document.createElement('output');
      out.htmlFor = id;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = 0;
      input.max = 1000;
      input.addEventListener('input', () => set({ [key]: +spec.scale.to(+input.value / 1000).toPrecision(3) }));
      input.addEventListener('change', () => preview());
      row.append(label, out, input);
      $(spec.box).append(row);
      inputs.set(key, { input, out, spec });
    }
    SS.DELAY_TIMES.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.label;
      $('#fxDelayTime').append(o);
    });
    $('#fxScSource').addEventListener('change', (e) => {
      set({ scSource: e.target.value });
      refresh();
    });
    $('#fxDelayTime').addEventListener('change', (e) => {
      set({ delayTime: e.target.value });
      preview();
    });
    document.querySelectorAll('#fxDialog [data-presets]').forEach((box) => {
      PRESETS[box.dataset.presets].forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = p.label;
        b.addEventListener('click', () => {
          set(p.v);
          // un préréglage de sidechain sans source : on prend la première piste proposée (le kick s'il existe)
          if (box.dataset.presets === 'sc' && !params().scSource && $('#fxScSource').options[1]) set({ scSource: $('#fxScSource').options[1].value });
          refresh();
          preview();
        });
        box.append(b);
      });
    });

    buildReturns();

    const dlg = $('#fxDialog');
    $('#fxPreview').addEventListener('click', () => preview());
    $('#fxReset').addEventListener('click', () => {
      delete track.fx;
      SS.audio.applyFx(track);
      refresh();
      app.changed();
    });
    $('#fxCancel').addEventListener('click', () => dlg.close('cancel'));
    $('#fxForm').addEventListener('submit', (e) => {
      e.preventDefault();
      dlg.close('ok');
    });
    dlg.addEventListener('close', () => {
      if (!track) return;
      if (dlg.returnValue !== 'ok') {
        if (snapshot) track.fx = snapshot;
        else delete track.fx;
        SS.audio.applyFx(track);
        app.changed();
      }
      app.renderTrack(track);
      track = null;
    });
    dlg.addEventListener('keydown', (e) => e.stopPropagation());
  }

  /* Réglages communs des bus partagés (project.returns) */
  const RETURN_SPECS = [
    { bus: 'plate', key: 'size', label: 'Plate : durée', scale: logf(0.3, 4), fmt: (v) => `${v.toFixed(1)} s` },
    { bus: 'hall', key: 'size', label: 'Hall : durée', scale: logf(0.5, 8), fmt: (v) => `${v.toFixed(1)} s` },
    { bus: 'hall', key: 'predelay', label: 'Hall : pré-délai', scale: lin(0, 0.12), fmt: (v) => `${Math.round(v * 1000)} ms` },
    { bus: 'echo', key: 'feedback', label: 'Écho : répétitions', scale: lin(0, 0.85), fmt: (v) => `${Math.round(v * 100)} %` },
  ];
  const returnInputs = [];
  function setReturn(bus, patch) {
    const p = app.project();
    const r = SS.returnParams(p);
    r[bus] = { ...r[bus], ...patch };
    p.returns = SS.cleanReturns(r);
    SS.audio.applyMaster(p);
    updateReturns();
    app.changed();
  }
  function buildReturns() {
    RETURN_SPECS.forEach((spec) => {
      const id = `fxRet_${spec.bus}_${spec.key}`;
      const row = document.createElement('div');
      row.className = 'sd-row';
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = spec.label;
      const out = document.createElement('output');
      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = 0;
      input.max = 1000;
      input.addEventListener('input', () => setReturn(spec.bus, { [spec.key]: +spec.scale.to(+input.value / 1000).toPrecision(3) }));
      row.append(label, out, input);
      $('#fxReturnSliders').append(row);
      returnInputs.push({ spec, input, out });
    });
    SS.DELAY_TIMES.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.label;
      $('#fxEchoTime').append(o);
    });
    $('#fxEchoTime').addEventListener('change', (e) => setReturn('echo', { time: e.target.value }));
  }
  function updateReturns() {
    const p = app.project();
    const r = SS.returnParams(p);
    returnInputs.forEach(({ spec, input, out }) => {
      const v = r[spec.bus][spec.key];
      if (document.activeElement !== input) input.value = Math.round(Math.max(0, Math.min(1, spec.scale.from(v))) * 1000);
      out.textContent = spec.fmt(v);
    });
    $('#fxEchoTime').value = r.echo.time;
    $('#fxEchoMs').textContent = `${Math.round(SS.delaySeconds({ delayTime: r.echo.time }, p.tempo) * 1000)} ms`;
  }

  function set(patch) {
    track.fx = { ...(track.fx || {}), ...patch };
    // ne garde que ce qui diffère des valeurs par défaut
    for (const [k, v] of Object.entries(track.fx)) if (v === SS.FX_DEFAULTS[k]) delete track.fx[k];
    if (!Object.keys(track.fx).length) delete track.fx;
    SS.audio.applyFx(track);
    update();
    app.changed();
  }

  function refresh() {
    update(true);
  }

  function update(moveSliders = false) {
    const f = params();
    for (const [key, { input, out, spec }] of inputs) {
      if (moveSliders || document.activeElement !== input) input.value = Math.round(Math.max(0, Math.min(1, spec.scale.from(f[key]))) * 1000);
      out.textContent = spec.fmt(f[key]);
    }
    $('#fxDelayTime').value = f.delayTime;
    $('#fxDelayMs').textContent = `${Math.round(SS.delaySeconds(f, app.project().tempo) * 1000)} ms`;
    const state = (id, on) => {
      const el = $(id);
      el.textContent = on ? 'actif' : 'off';
      el.classList.toggle('on', on);
    };
    state('#fxChorusState', f.chorus > 0);
    state('#fxDelayState', f.delay > 0);
    state('#fxRoomState', f.room > 0);
    state('#fxSendState', f.sendPlate > 0 || f.sendHall > 0 || f.sendEcho > 0);
    updateReturns();
    const sc = !!f.scSource && f.scDepth > 0;
    state('#fxScState', sc);
    $('#fxScSource').value = f.scSource;
    ['scDepth', 'scRelease'].forEach((k) => inputs.get(k).input.closest('.sd-row').classList.toggle('dim', !f.scSource));
    $('#fxScCurve').classList.toggle('dim', !f.scSource);
    drawDuck(f);
    ['chorusRate', 'chorusDepth'].forEach((k) => inputs.get(k).input.closest('.sd-row').classList.toggle('dim', !f.chorus));
    inputs.get('delayFeedback').input.closest('.sd-row').classList.toggle('dim', !f.delay);
    $('#fxDelayTime').closest('.sd-row').classList.toggle('dim', !f.delay);
    ['roomSize', 'roomLp'].forEach((k) => inputs.get(k).input.closest('.sd-row').classList.toggle('dim', !f.room));
    $('#fxCode').textContent = strudelCode(f);
  }

  /** Schéma du volume sur une mesure à 4 temps (déclenchement sur chaque temps). */
  function drawDuck(f) {
    const W = 300;
    const H = 60;
    const beat = (60 / app.project().tempo) * 1; // secondes par temps
    const pts = [];
    for (let x = 0; x <= W; x += 2) {
      const t = (x / W) * 4 * beat;
      const since = t % beat;
      let g = 1;
      if (f.scSource && f.scDepth > 0) {
        const floor = 1 - f.scDepth;
        g = since < 0.03 ? floor : 1 - (1 - floor) * Math.exp(-(since - 0.03) / Math.max(0.01, f.scRelease / 3));
      }
      pts.push([x, H - 4 - g * (H - 10)]);
    }
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1].toFixed(1)).join(' ');
    const svg = $('#fxScCurve');
    svg.querySelector('.line').setAttribute('d', d);
    svg.querySelector('.fill-area').setAttribute('d', d + ` L${W} ${H} L0 ${H} Z`);
  }

  function strudelCode(f) {
    const r = (v, n = 2) => +v.toFixed(n);
    const parts = [];
    if (f.room > 0) parts.push(`room(${r(f.room)})`, `roomsize(${r(f.roomSize, 1)})`, `roomlp(${Math.round(f.roomLp)})`);
    if (f.delay > 0)
      parts.push(`delay(${r(f.delay)})`, `delaytime(${r(SS.delaySeconds(f, app.project().tempo), 3)})`, `delayfeedback(${r(f.delayFeedback)})`);
    let code = parts.length ? '.' + parts.join('.') : '';
    if (f.chorus > 0) code += `  // + chorus ${Math.round(f.chorus * 100)} % (effet StepSeq)`;
    const sends = [['sendPlate', 'plate'], ['sendHall', 'hall'], ['sendEcho', 'écho']].filter(([k]) => f[k] > 0);
    if (sends.length) code += `  // + bus ${sends.map(([k, n]) => `${n} ${Math.round(f[k] * 100)} %`).join(', ')}`;
    if (f.scSource && f.scDepth > 0) {
      const src = app.project().tracks.find((t) => t.id === f.scSource);
      code += `  // + sidechain sur « ${src ? src.name : '?'} » ${Math.round(f.scDepth * 100)} %`;
    }
    code = code.trim();
    if (!code) code = 'aucun effet';
    return code;
  }

  function preview() {
    if (!track || SS.audio.isPlaying()) return; // en lecture, on entend déjà le résultat dans la boucle
    if (track.type === 'drum') return SS.audio.preview(track);
    const root = track.lastRoot ?? (track.octave + 1) * 12;
    SS.audio.preview(track, track.category === 'mono' ? root : SS.chordNotes(root, track.chord), 0.35);
  }

  function open(t) {
    SS.audio.ensureCtx();
    track = t;
    snapshot = t.fx ? { ...t.fx } : null;
    $('#fxTrack').textContent = t.name;
    // sources possibles : toutes les autres pistes (le kick en premier, s'il existe)
    const others = app.project().tracks.filter((x) => x !== t);
    others.sort((a, b) => (b.sound === 'bd') - (a.sound === 'bd'));
    const opt = (v, label) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      return o;
    };
    $('#fxScSource').replaceChildren(opt('', 'Aucune (sidechain coupé)'), ...others.map((x) => opt(x.id, x.name)));
    refresh();
    $('#fxDialog').returnValue = '';
    $('#fxDialog').showModal();
  }

  function init(appApi) {
    app = appApi;
    build();
  }

  return { init, open };
})();
