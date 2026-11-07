/*
 * Console de mixage : une tranche par piste + Master.
 * Tranche : inserts EQ / COMP / LIM (témoin d'activation), courbe d'EQ miniature, réduction de gain,
 * panoramique, Mute / Solo, fader en dB avec vumètre crête / RMS.
 * Panneau de détail : EQ 5 bandes (courbe interactive), compresseur (courbe de transfert), limiteur.
 */
window.SS = window.SS || {};

SS.mixer = (() => {
  const $ = (s) => document.querySelector(s);
  let app;
  let isOpen = false;
  let selected = null; // id de piste ou '__master'
  let raf = null;
  const meters = new Map(); // id -> { canvas, peakHold, holdTime, grC, grL, readout }
  let detailRefs = null;

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ------------------------------------------------------------------ canaux */
  function channels() {
    const p = app.project();
    const list = p.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      track: t,
      getMix: () => SS.mixParams(t),
      setMix: (m) => {
        t.mix = m;
        SS.audio.applyMix(t);
      },
      getVol: () => (typeof t.volume === 'number' ? t.volume : 0.8),
      setVol: (v) => {
        t.volume = v;
        SS.audio.setTrackGain(t, v);
      },
    }));
    list.push({
      id: '__master',
      name: 'Master',
      color: '#e8e8ee',
      master: true,
      getMix: () => SS.masterParams(p).mix,
      setMix: (m) => {
        p.master = { ...SS.masterParams(p), mix: m };
        SS.audio.applyMaster(p);
      },
      getVol: () => SS.masterParams(p).volume,
      setVol: (v) => {
        p.master = { ...SS.masterParams(p), volume: v };
        SS.audio.applyMaster(p);
      },
    });
    return list;
  }
  const chan = (id) => channels().find((c) => c.id === id);

  /* ------------------------------------------------------------------ échelle des faders / vumètres */
  // position 0..1 <-> dB : le bas de la course est comprimé (-60 à -20 dB sur le premier quart)
  const posToDb = (x) => (x <= 0 ? -Infinity : x < 0.25 ? -60 + (x / 0.25) * 40 : -20 + ((x - 0.25) / 0.75) * 26);
  const dbToPos = (db) => (db === -Infinity || db <= -60 ? 0 : db < -20 ? ((db + 60) / 40) * 0.25 : clamp(0.25 + ((db + 20) / 26) * 0.75, 0, 1));
  const fmtDb = (db) => (db === -Infinity ? '−∞' : (db > 0 ? '+' : '') + db.toFixed(1));
  const SCALE = [6, 0, -6, -12, -20, -40, -60];

  /* ------------------------------------------------------------------ réponse de l'EQ (contexte hors ligne) */
  let oc = null;
  let ocFilters = null;
  function eqResponse(eq, freqs) {
    if (!oc) {
      oc = new OfflineAudioContext(1, 128, 44100);
      ocFilters = ['highpass', 'lowshelf', 'peaking', 'peaking', 'highshelf'].map((type) => {
        const f = oc.createBiquadFilter();
        f.type = type;
        return f;
      });
    }
    const [hp, lo, lm, hm, hi] = ocFilters;
    hp.frequency.value = eq.hp.on ? eq.hp.f : 10;
    hp.Q.value = 0.707;
    lo.frequency.value = eq.low.f;
    lo.gain.value = eq.low.g;
    lm.frequency.value = eq.lm.f;
    lm.gain.value = eq.lm.g;
    lm.Q.value = eq.lm.q;
    hm.frequency.value = eq.hm.f;
    hm.gain.value = eq.hm.g;
    hm.Q.value = eq.hm.q;
    hi.frequency.value = eq.high.f;
    hi.gain.value = eq.high.g;
    const total = new Float32Array(freqs.length).fill(1);
    const mag = new Float32Array(freqs.length);
    const ph = new Float32Array(freqs.length);
    ocFilters.forEach((f) => {
      f.getFrequencyResponse(freqs, mag, ph);
      for (let i = 0; i < mag.length; i++) total[i] *= mag[i];
    });
    return total;
  }

  const F_MIN = 20;
  const F_MAX = 20000;
  const G_MAX = 18;
  const fToX = (f, W) => (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * W;
  const xToF = (x, W) => F_MIN * Math.pow(F_MAX / F_MIN, clamp(x / W, 0, 1));
  const gToY = (g, H) => H / 2 - (g / G_MAX) * (H / 2 - 8);
  const yToG = (y, H) => clamp(((H / 2 - y) / (H / 2 - 8)) * G_MAX, -G_MAX, G_MAX);
  const fmtF = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz' : Math.round(f) + ' Hz');

  function setupCanvas(canvas, W, H) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  const BANDS = [
    { key: 'hp', label: 'HP', color: '#9a9aa6' },
    { key: 'low', label: 'Grave', color: '#ff7a59' },
    { key: 'lm', label: 'Bas-méd.', color: '#f5c400' },
    { key: 'hm', label: 'Haut-méd.', color: '#3fcf3f' },
    { key: 'high', label: 'Aigu', color: '#2b8cff' },
  ];

  function drawEq(canvas, eq, W, H, opts = {}) {
    const g = setupCanvas(canvas, W, H);
    g.fillStyle = '#121216';
    g.fillRect(0, 0, W, H);
    if (opts.grid) {
      g.strokeStyle = '#26262c';
      g.lineWidth = 1;
      g.fillStyle = '#6a6a74';
      g.font = '10px system-ui, sans-serif';
      [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => {
        const x = Math.round(fToX(f, W)) + 0.5;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
        g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 3, H - 4);
      });
      [12, 6, 0, -6, -12].forEach((db) => {
        const y = Math.round(gToY(db, H)) + 0.5;
        g.strokeStyle = db === 0 ? '#3a3a42' : '#26262c';
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
        g.fillText((db > 0 ? '+' : '') + db, 3, y - 3);
      });
    } else {
      g.strokeStyle = '#2c2c33';
      g.beginPath();
      g.moveTo(0, H / 2 + 0.5);
      g.lineTo(W, H / 2 + 0.5);
      g.stroke();
    }
    const n = Math.max(2, Math.floor(W));
    const freqs = new Float32Array(n);
    for (let i = 0; i < n; i++) freqs[i] = xToF((i / (n - 1)) * W, W);
    const resp = eqResponse(eq, freqs);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const db = clamp(20 * Math.log10(resp[i] || 1e-6), -G_MAX - 6, G_MAX + 6);
      const x = (i / (n - 1)) * W;
      const y = gToY(db, H);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    const col = eq.on ? '#7fc0ff' : '#5a5a66';
    g.strokeStyle = col;
    g.lineWidth = opts.grid ? 2 : 1.5;
    g.stroke();
    g.lineTo(W, H / 2);
    g.lineTo(0, H / 2);
    g.closePath();
    g.fillStyle = eq.on ? 'rgba(43, 140, 255, .15)' : 'rgba(120, 120, 130, .08)';
    g.fill();
    if (opts.handles) {
      BANDS.forEach((b) => {
        const band = eq[b.key];
        const x = fToX(band.f, W);
        const y = b.key === 'hp' ? H / 2 : gToY(band.g, H);
        const active = b.key === 'hp' ? eq.hp.on : true;
        g.beginPath();
        g.arc(x, y, opts.hot === b.key ? 8 : 6, 0, Math.PI * 2);
        g.fillStyle = active ? b.color : '#3a3a42';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#000';
        g.stroke();
        g.fillStyle = '#000';
        g.font = 'bold 9px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText({ hp: 'P', low: '1', lm: '2', hm: '3', high: '4' }[b.key], x, y + 3);
        g.textAlign = 'left';
      });
      if (opts.hot) {
        const b = eq[opts.hot];
        const band = BANDS.find((x) => x.key === opts.hot);
        let txt = `${band.label}  ${fmtF(b.f)}`;
        if (opts.hot !== 'hp') txt += `  ${b.g > 0 ? '+' : ''}${b.g.toFixed(1)} dB`;
        if ('q' in b) txt += `  Q ${b.q.toFixed(2)}`;
        g.font = '12px system-ui, sans-serif';
        const w = g.measureText(txt).width + 12;
        const x = clamp(fToX(b.f, W) - w / 2, 4, W - w - 4);
        g.fillStyle = 'rgba(0,0,0,.8)';
        g.fillRect(x, 6, w, 20);
        g.fillStyle = '#fff';
        g.fillText(txt, x + 6, 20);
      }
    }
  }

  /* ------------------------------------------------------------------ tranches */
  function render() {
    if (!isOpen) return;
    const list = channels();
    if (!selected || !list.some((c) => c.id === selected)) selected = list[0].id;
    meters.clear();
    $('#mixerStrips').replaceChildren(...list.map(stripEl));
    renderDetail();
  }

  function insertBtn(ch, key, label) {
    const m = ch.getMix();
    const on = m[key].on;
    return h(
      'div',
      { class: 'ins' + (on ? ' on' : '') + (selected === ch.id && detailFocus === key ? ' focus' : '') },
      h('button', {
        type: 'button',
        class: 'ins-led',
        title: (on ? 'Désactiver ' : 'Activer ') + label,
        'aria-pressed': String(on),
        onclick: () => {
          const mm = ch.getMix();
          mm[key].on = !mm[key].on;
          ch.setMix(mm);
          app.changed();
          render();
        },
      }),
      h('button', {
        type: 'button',
        class: 'ins-name',
        title: `Régler ${label}`,
        onclick: () => {
          selected = ch.id;
          detailFocus = key;
          render();
          const sec = $(`#mixerDetail [data-mod="${key}"]`);
          if (sec) sec.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        },
      }, label)
    );
  }
  let detailFocus = 'eq';

  function stripEl(ch) {
    const m = ch.getMix();
    const t = ch.track;
    const eqCanvas = h('canvas', { class: 'strip-eq', title: 'Courbe d’égalisation — cliquer pour la régler' });
    eqCanvas.addEventListener('click', () => {
      selected = ch.id;
      detailFocus = 'eq';
      render();
    });
    requestAnimationFrame(() => drawEq(eqCanvas, m.eq, 84, 34));

    const meterCanvas = h('canvas', { class: 'strip-meter' });
    const readout = h('div', { class: 'strip-peak', title: 'Crête (cliquer pour remettre à zéro)' }, '−∞');
    const grC = h('i');
    const grL = h('i');
    meters.set(ch.id, { canvas: meterCanvas, peakHold: 0, holdTime: 0, readout, grC, grL, maxPeak: 0 });
    readout.addEventListener('click', () => {
      const mm = meters.get(ch.id);
      if (mm) mm.maxPeak = 0;
    });

    const fader = faderEl(ch);
    const pan = h('input', {
      type: 'range',
      min: -100,
      max: 100,
      step: 1,
      value: Math.round(m.pan * 100),
      class: 'strip-pan',
      title: 'Panoramique (double-clic : centre)',
      'aria-label': `Panoramique ${ch.name}`,
    });
    const panLbl = h('span', { class: 'strip-pan-lbl' }, panText(m.pan));
    pan.addEventListener('input', () => {
      const mm = ch.getMix();
      mm.pan = Math.abs(+pan.value) < 3 ? 0 : +pan.value / 100;
      ch.setMix(mm);
      panLbl.textContent = panText(mm.pan);
    });
    pan.addEventListener('change', () => app.changed());
    pan.addEventListener('dblclick', () => {
      const mm = ch.getMix();
      mm.pan = 0;
      ch.setMix(mm);
      pan.value = 0;
      panLbl.textContent = panText(0);
      app.changed();
    });

    return h(
      'div',
      { class: 'strip' + (ch.master ? ' master' : '') + (selected === ch.id ? ' selected' : ''), style: `--c:${ch.color}`, 'data-id': ch.id },
      h(
        'button',
        {
          type: 'button',
          class: 'strip-name',
          title: ch.master ? 'Sortie générale' : `Piste ${ch.name}`,
          onclick: () => {
            selected = ch.id;
            render();
          },
        },
        ch.name
      ),
      h('div', { class: 'strip-ins' }, insertBtn(ch, 'eq', 'EQ'), insertBtn(ch, 'comp', 'COMP'), insertBtn(ch, 'lim', 'LIM')),
      eqCanvas,
      h('div', { class: 'strip-gr', title: 'Réduction de gain : compresseur (C) et limiteur (L)' }, h('span', {}, 'C', h('b', {}, grC)), h('span', {}, 'L', h('b', {}, grL))),
      ch.master ? h('div', { class: 'strip-pan-row' }) : h('div', { class: 'strip-pan-row' }, pan, panLbl),
      ch.master
        ? h('div', { class: 'strip-ms' })
        : h(
            'div',
            { class: 'strip-ms' },
            h('button', {
              type: 'button',
              class: 'ms mute' + (t.mute ? ' on' : ''),
              title: 'Muet',
              onclick: (e) => {
                t.mute = !t.mute;
                e.currentTarget.classList.toggle('on', t.mute);
                app.changed();
              },
            }, 'M'),
            h('button', {
              type: 'button',
              class: 'ms solo' + (t.solo ? ' on' : ''),
              title: 'Solo',
              onclick: (e) => {
                t.solo = !t.solo;
                e.currentTarget.classList.toggle('on', t.solo);
                app.changed();
              },
            }, 'S')
          ),
      h('div', { class: 'strip-fader-row' }, fader.el, meterCanvas),
      h('div', { class: 'strip-vals' }, fader.readout, readout)
    );
  }

  const panText = (v) => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? 'L' + Math.round(-v * 100) : 'R' + Math.round(v * 100));

  /** Fader vertical en dB (double-clic : 0 dB). */
  const FADER_H = 170;
  function faderEl(ch) {
    const thumb = h('div', { class: 'fader-thumb' });
    const scale = h(
      'div',
      { class: 'fader-scale' },
      SCALE.map((db) => h('span', { style: `bottom:${dbToPos(db) * 100}%` }, db > 0 ? '+' + db : String(db)))
    );
    const el = h('div', {
      class: 'fader',
      role: 'slider',
      tabindex: 0,
      'aria-label': `Volume ${ch.name}`,
      title: 'Glisser pour régler le volume · double-clic : 0 dB · flèches : ±0,5 dB',
    }, scale, h('div', { class: 'fader-track' }), thumb);
    const readout = h('div', { class: 'strip-db', title: 'Niveau du fader' });
    const show = () => {
      const db = SS.gainToDb(ch.getVol());
      thumb.style.bottom = `calc(${dbToPos(db) * 100}% - 9px)`;
      readout.textContent = fmtDb(db) + ' dB';
      el.setAttribute('aria-valuetext', fmtDb(db) + ' dB');
    };
    const setDb = (db) => {
      const v = db === -Infinity ? 0 : clamp(SS.dbToGain(db), 0, SS.dbToGain(6));
      ch.setVol(v);
      show();
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      const startY = e.clientY;
      const startPos = dbToPos(SS.gainToDb(ch.getVol()));
      const onThumb = e.target === thumb;
      // clic sur le rail : saute à la position ; sur le bouton : glisse en relatif (Maj = réglage fin)
      if (!onThumb) setDb(posToDb(clamp((r.bottom - 9 - e.clientY) / (r.height - 18), 0, 1)));
      const base = onThumb ? startPos : dbToPos(SS.gainToDb(ch.getVol()));
      const y0 = onThumb ? startY : e.clientY;
      const move = (ev) => {
        const k = ev.shiftKey ? 0.2 : 1;
        setDb(posToDb(clamp(base + ((y0 - ev.clientY) / (r.height - 18)) * k, 0, 1)));
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        app.changed();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', () => {
      setDb(0);
      app.changed();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      const db = SS.gainToDb(ch.getVol());
      setDb(clamp((db === -Infinity ? -60 : db) + (e.key === 'ArrowUp' ? 0.5 : -0.5), -60, 6));
      app.changed();
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const db = SS.gainToDb(ch.getVol());
      setDb(clamp((db === -Infinity ? -60 : db) - Math.sign(e.deltaY) * 0.5, -60, 6));
      clearTimeout(el._t);
      el._t = setTimeout(() => app.changed(), 300);
    }, { passive: false });
    show();
    return { el, readout };
  }

  /* ------------------------------------------------------------------ panneau de détail */
  function slider(label, value, min, max, opts, onInput) {
    const scale = opts.log
      ? { to: (x) => min * Math.pow(max / min, x), from: (v) => Math.log(v / min) / Math.log(max / min) }
      : { to: (x) => min + (max - min) * x, from: (v) => (v - min) / (max - min) };
    const out = h('output', {}, opts.fmt(value));
    const input = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: Math.round(clamp(scale.from(value), 0, 1) * 1000) });
    input.addEventListener('input', () => {
      let v = scale.to(+input.value / 1000);
      v = opts.step ? Math.round(v / opts.step) * opts.step : +v.toPrecision(3);
      out.textContent = opts.fmt(v);
      onInput(v);
    });
    input.addEventListener('change', () => app.changed());
    if (opts.def !== undefined) {
      input.addEventListener('dblclick', () => {
        input.value = Math.round(clamp(scale.from(opts.def), 0, 1) * 1000);
        out.textContent = opts.fmt(opts.def);
        onInput(opts.def);
        app.changed();
      });
    }
    return h('div', { class: 'sd-row' }, h('label', {}, label), out, input);
  }

  function powerBtn(ch, key, label) {
    const on = ch.getMix()[key].on;
    return h('button', {
      type: 'button',
      class: 'mod-power' + (on ? ' on' : ''),
      'aria-pressed': String(on),
      title: on ? `Désactiver ${label}` : `Activer ${label}`,
      onclick: () => {
        const m = ch.getMix();
        m[key].on = !m[key].on;
        ch.setMix(m);
        app.changed();
        render();
      },
    }, on ? 'ON' : 'OFF');
  }

  function renderDetail() {
    const ch = chan(selected);
    if (!ch) return;
    const m = ch.getMix();
    const update = (fn, { redraw = true } = {}) => {
      const mm = ch.getMix();
      fn(mm);
      ch.setMix(mm);
      if (redraw) refreshEqViews(ch);
      drawTransfer();
    };

    /* --- EQ --- */
    const eqCanvas = h('canvas', { class: 'eq-graph' });
    const eqTable = h('div', { class: 'eq-bands' });
    function fillBands() {
      const e = ch.getMix().eq;
      eqTable.replaceChildren(
        ...BANDS.map((b) => {
          const band = e[b.key];
          const num = (field, min, max, step, fmt) =>
            h('input', {
              type: 'number',
              min,
              max,
              step,
              value: fmt(band[field]),
              'aria-label': `${b.label} ${field}`,
              onchange: (ev) => {
                const v = clamp(parseFloat(ev.target.value), min, max);
                if (!Number.isFinite(v)) return;
                update((mm) => {
                  mm.eq[b.key][field] = v;
                  mm.eq.on = true;
                  if (b.key === 'hp') mm.eq.hp.on = true;
                });
                app.changed();
              },
            });
          return h(
            'div',
            { class: 'eq-band', style: `--b:${b.color}` },
            h('span', { class: 'eq-band-name' }, b.key === 'hp'
              ? h('label', {}, h('input', {
                  type: 'checkbox',
                  checked: e.hp.on,
                  onchange: (ev) => {
                    update((mm) => {
                      mm.eq.hp.on = ev.target.checked;
                      if (ev.target.checked) mm.eq.on = true;
                    });
                    app.changed();
                  },
                }), ' Passe-haut')
              : b.label),
            h('span', {}, num('f', 20, 20000, 1, (v) => Math.round(v)), ' Hz'),
            b.key === 'hp' ? h('span') : h('span', {}, num('g', -18, 18, 0.5, (v) => v.toFixed(1)), ' dB'),
            'q' in band ? h('span', {}, 'Q ', num('q', 0.2, 12, 0.1, (v) => v.toFixed(2))) : h('span')
          );
        })
      );
    }
    fillBands();

    const EQW = () => Math.max(300, Math.min(560, (detailRefs && detailRefs.eqBox.clientWidth - 24) || 520));
    const EQH = 210;
    let hot = null;
    const drawBig = () => drawEq(eqCanvas, ch.getMix().eq, EQW(), EQH, { grid: true, handles: true, hot });
    const hit = (x, y) => {
      const e = ch.getMix().eq;
      const W = EQW();
      let best = null;
      BANDS.forEach((b) => {
        const bx = fToX(e[b.key].f, W);
        const by = b.key === 'hp' ? EQH / 2 : gToY(e[b.key].g, EQH);
        const d = Math.hypot(bx - x, by - y);
        if (d < 14 && (!best || d < best.d)) best = { key: b.key, d };
      });
      return best && best.key;
    };
    eqCanvas.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const r = eqCanvas.getBoundingClientRect();
      const k = hit(e.clientX - r.left, e.clientY - r.top);
      if (k !== hot) {
        hot = k;
        eqCanvas.style.cursor = k ? 'grab' : 'default';
        drawBig();
      }
    });
    eqCanvas.addEventListener('pointerleave', () => {
      hot = null;
      drawBig();
    });
    eqCanvas.addEventListener('pointerdown', (e) => {
      const r = eqCanvas.getBoundingClientRect();
      const k = hit(e.clientX - r.left, e.clientY - r.top);
      if (!k) return;
      e.preventDefault();
      eqCanvas.setPointerCapture(e.pointerId);
      hot = k;
      eqCanvas.style.cursor = 'grabbing';
      const move = (ev) => {
        const x = ev.clientX - r.left;
        const y = ev.clientY - r.top;
        update((mm) => {
          mm.eq.on = true;
          const b = mm.eq[k];
          b.f = Math.round(clamp(xToF(x, EQW()), k === 'hp' ? 20 : 20, k === 'hp' ? 2000 : 20000));
          if (k === 'hp') mm.eq.hp.on = true;
          else b.g = Math.round(yToG(y, EQH) * 2) / 2;
        }, { redraw: false });
        drawBig();
        refreshEqViews(ch, { skipBig: true });
      };
      const up = () => {
        eqCanvas.removeEventListener('pointermove', move);
        eqCanvas.removeEventListener('pointerup', up);
        eqCanvas.style.cursor = 'grab';
        fillBands();
        app.changed();
      };
      eqCanvas.addEventListener('pointermove', move);
      eqCanvas.addEventListener('pointerup', up);
    });
    // molette sur une cloche : largeur de bande (Q)
    eqCanvas.addEventListener('wheel', (e) => {
      const r = eqCanvas.getBoundingClientRect();
      const k = hit(e.clientX - r.left, e.clientY - r.top) || hot;
      if (k !== 'lm' && k !== 'hm') return;
      e.preventDefault();
      update((mm) => {
        mm.eq[k].q = +clamp(mm.eq[k].q * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.2, 12).toFixed(2);
        mm.eq.on = true;
      }, { redraw: false });
      hot = k;
      drawBig();
      refreshEqViews(ch, { skipBig: true });
      fillBands();
      clearTimeout(eqCanvas._t);
      eqCanvas._t = setTimeout(() => app.changed(), 300);
    }, { passive: false });
    // double-clic sur un point : remise à plat (le passe-haut se coupe)
    eqCanvas.addEventListener('dblclick', (e) => {
      const r = eqCanvas.getBoundingClientRect();
      const k = hit(e.clientX - r.left, e.clientY - r.top);
      if (!k) return;
      update((mm) => {
        if (k === 'hp') mm.eq.hp.on = false;
        else mm.eq[k].g = 0;
      }, { redraw: false });
      drawBig();
      refreshEqViews(ch, { skipBig: true });
      fillBands();
      app.changed();
    });

    const eqBox = h(
      'section',
      { class: 'mod mod-eq' + (detailFocus === 'eq' ? ' focus' : ''), 'data-mod': 'eq' },
      h('div', { class: 'mod-head' }, h('h3', {}, 'Égaliseur ', h('small', {}, '5 bandes')), powerBtn(ch, 'eq', 'l’égaliseur')),
      eqCanvas,
      h('p', { class: 'mod-help' }, 'Glisse les points (fréquence ↔, gain ↕) : P passe-haut, 1 grave, 2 bas-médium, 3 haut-médium, 4 aigu. Molette sur 2 ou 3 : largeur (Q). Double-clic : remise à zéro.'),
      eqTable
    );

    /* --- Compresseur --- */
    const c = m.comp;
    const transfer = h('canvas', { class: 'comp-graph' });
    const grBig = h('div', { class: 'gr-meter' }, h('i'));
    function drawTransfer() {
      const cc = ch.getMix().comp;
      const W = 150;
      const H = 150;
      const g = setupCanvas(transfer, W, H);
      g.fillStyle = '#121216';
      g.fillRect(0, 0, W, H);
      const toX = (db) => ((db + 60) / 60) * W;
      const toY = (db) => H - ((db + 60) / 60) * H;
      g.strokeStyle = '#26262c';
      for (let d = -48; d < 0; d += 12) {
        g.beginPath();
        g.moveTo(toX(d) + 0.5, 0);
        g.lineTo(toX(d) + 0.5, H);
        g.moveTo(0, toY(d) + 0.5);
        g.lineTo(W, toY(d) + 0.5);
        g.stroke();
      }
      g.strokeStyle = '#3a3a42';
      g.beginPath();
      g.moveTo(0, H);
      g.lineTo(W, 0);
      g.stroke();
      const out = (x) => {
        if (!cc.on) return x;
        const t = cc.th;
        const k = cc.knee;
        const r = cc.ratio;
        if (x <= t - k / 2) return x;
        if (x >= t + k / 2 || k === 0) return t + (x - t) / r;
        return x + ((1 / r - 1) * Math.pow(x - t + k / 2, 2)) / (2 * k);
      };
      g.beginPath();
      for (let x = -60; x <= 0; x += 0.5) {
        const y = out(x) + (cc.on ? cc.makeup : 0);
        x === -60 ? g.moveTo(toX(x), toY(y)) : g.lineTo(toX(x), toY(y));
      }
      g.strokeStyle = cc.on ? '#f5a524' : '#5a5a66';
      g.lineWidth = 2;
      g.stroke();
      if (cc.on) {
        g.fillStyle = '#f5a524';
        g.font = '10px system-ui, sans-serif';
        g.fillText(`seuil ${cc.th} dB · ${cc.ratio}:1`, 6, 14);
      }
    }
    const compBox = h(
      'section',
      { class: 'mod mod-comp' + (detailFocus === 'comp' ? ' focus' : ''), 'data-mod': 'comp' },
      h('div', { class: 'mod-head' }, h('h3', {}, 'Compresseur'), powerBtn(ch, 'comp', 'le compresseur')),
      h(
        'div',
        { class: 'comp-top' },
        transfer,
        h('div', { class: 'gr-wrap' }, h('small', {}, 'Réduction'), grBig, h('output', { class: 'gr-val' }, '0.0 dB'))
      ),
      h(
        'div',
        { class: 'sd-sliders' },
        slider('Seuil', c.th, -60, 0, { fmt: (v) => v.toFixed(1) + ' dB', step: 0.5, def: -18 }, (v) => update((mm) => { mm.comp.th = v; mm.comp.on = true; })),
        slider('Ratio', c.ratio, 1, 20, { log: true, fmt: (v) => v.toFixed(1) + ':1', step: 0.1, def: 3 }, (v) => update((mm) => { mm.comp.ratio = v; mm.comp.on = true; })),
        slider('Attaque', c.att, 0.0005, 0.3, { log: true, fmt: (v) => (v * 1000).toFixed(v < 0.01 ? 1 : 0) + ' ms', def: 0.01 }, (v) => update((mm) => { mm.comp.att = v; })),
        slider('Relâchement', c.rel, 0.01, 1, { log: true, fmt: (v) => Math.round(v * 1000) + ' ms', def: 0.15 }, (v) => update((mm) => { mm.comp.rel = v; })),
        slider('Genou (knee)', c.knee, 0, 40, { fmt: (v) => v.toFixed(0) + ' dB', step: 1, def: 6 }, (v) => update((mm) => { mm.comp.knee = v; })),
        slider('Gain de compensation', c.makeup, -12, 24, { fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB', step: 0.5, def: 0 }, (v) => update((mm) => { mm.comp.makeup = v; }))
      )
    );

    /* --- Limiteur --- */
    const l = m.lim;
    const grLim = h('div', { class: 'gr-meter' }, h('i'));
    const limBox = h(
      'section',
      { class: 'mod mod-lim' + (detailFocus === 'lim' ? ' focus' : ''), 'data-mod': 'lim' },
      h('div', { class: 'mod-head' }, h('h3', {}, 'Limiteur'), powerBtn(ch, 'lim', 'le limiteur')),
      h('div', { class: 'gr-wrap wide' }, h('small', {}, 'Réduction'), grLim, h('output', { class: 'gr-val' }, '0.0 dB')),
      h(
        'div',
        { class: 'sd-sliders' },
        slider('Plafond', l.ceil, -24, 0, { fmt: (v) => v.toFixed(1) + ' dB', step: 0.1, def: -1 }, (v) => update((mm) => { mm.lim.ceil = v; mm.lim.on = true; })),
        slider('Relâchement', l.rel, 0.01, 1, { log: true, fmt: (v) => Math.round(v * 1000) + ' ms', def: 0.1 }, (v) => update((mm) => { mm.lim.rel = v; }))
      ),
      h('p', { class: 'mod-help' }, ch.master
        ? 'Sur le Master, le limiteur évite la saturation de la sortie. Un plafond de −0,3 à −1 dB est courant.'
        : 'Le limiteur empêche la piste de dépasser le plafond, même sur les coups les plus forts.')
    );

    const head = h(
      'div',
      { class: 'detail-head', style: `--c:${ch.color}` },
      h('b', {}, ch.name),
      h('span', {}, ch.master ? 'Sortie générale' : 'Inserts de la piste : égaliseur → compresseur → limiteur → panoramique → fader'),
      h('button', {
        type: 'button',
        class: 'btn btn-small',
        title: 'Remettre cette tranche à plat (EQ, compresseur, limiteur, panoramique)',
        onclick: () => {
          if (ch.master) ch.setMix(JSON.parse(JSON.stringify(SS.MASTER_DEFAULTS.mix)));
          else {
            delete ch.track.mix;
            SS.audio.applyMix(ch.track);
          }
          app.changed();
          render();
        },
      }, 'Réinitialiser')
    );
    $('#mixerDetail').replaceChildren(head, h('div', { class: 'detail-mods' }, eqBox, compBox, limBox));
    detailRefs = { eqBox, drawBig, drawTransfer, grBig, grLim, ch };
    requestAnimationFrame(() => {
      drawBig();
      drawTransfer();
    });
  }

  /** Redessine les courbes d'EQ (miniature de la tranche + grande courbe). */
  function refreshEqViews(ch, { skipBig } = {}) {
    const strip = $(`#mixerStrips .strip[data-id="${ch.id}"] .strip-eq`);
    if (strip) drawEq(strip, ch.getMix().eq, 84, 34);
    if (!skipBig && detailRefs && detailRefs.ch.id === ch.id) detailRefs.drawBig();
  }

  /* ------------------------------------------------------------------ vumètres */
  function drawMeter(mm, lv, dt) {
    const W = 10;
    const H = FADER_H;
    const g = mm.ctx2d || (mm.ctx2d = setupCanvas(mm.canvas, W, H));
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0c0c0f';
    g.fillRect(0, 0, W, H);
    const peakDb = lv ? SS.gainToDb(lv.peak) : -Infinity;
    const rmsDb = lv ? SS.gainToDb(lv.rms) : -Infinity;
    // maintien de crête : redescend de 20 dB/s après 0,8 s
    if (peakDb >= mm.peakHold || mm.peakHold === undefined) {
      mm.peakHold = peakDb;
      mm.holdTime = 0.8;
    } else {
      mm.holdTime -= dt;
      if (mm.holdTime <= 0) mm.peakHold = Math.max(-Infinity, mm.peakHold - 20 * dt);
    }
    if (peakDb > (mm.maxPeak === 0 ? -Infinity : mm.maxPeak)) mm.maxPeak = peakDb;
    const pad = 9;
    const yOf = (db) => H - pad - dbToPos(db) * (H - 2 * pad);
    const grad = g.createLinearGradient(0, H - pad, 0, pad);
    grad.addColorStop(0, '#2fbf4a');
    grad.addColorStop(dbToPos(-12), '#2fbf4a');
    grad.addColorStop(dbToPos(-6), '#e8c22c');
    grad.addColorStop(dbToPos(0), '#ff4040');
    grad.addColorStop(1, '#ff4040');
    // RMS plein, crête en plus clair
    const yP = yOf(Math.min(6, peakDb));
    const yR = yOf(Math.min(6, rmsDb));
    g.globalAlpha = 0.45;
    g.fillStyle = grad;
    g.fillRect(1, yP, W - 2, H - pad - yP);
    g.globalAlpha = 1;
    g.fillRect(1, yR, W - 2, H - pad - yR);
    if (mm.peakHold > -60) {
      g.fillStyle = mm.peakHold >= 0 ? '#ff4040' : '#fff';
      g.fillRect(1, yOf(Math.min(6, mm.peakHold)) - 1, W - 2, 2);
    }
    mm.readout.textContent = mm.maxPeak && mm.maxPeak > -100 ? fmtDb(mm.maxPeak) : '−∞';
    mm.readout.classList.toggle('clip', mm.maxPeak >= 0);
    const gr = (el, db) => {
      el.style.width = clamp((-db / 20) * 100, 0, 100) + '%';
    };
    if (lv) {
      gr(mm.grC, lv.gr.comp);
      gr(mm.grL, lv.gr.lim);
    }
  }

  let lastT = 0;
  function loop(t) {
    if (!isOpen) return;
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0.016;
    lastT = t;
    meters.forEach((mm, id) => drawMeter(mm, SS.audio.levels(id), dt));
    if (detailRefs) {
      const lv = SS.audio.levels(detailRefs.ch.id);
      const set = (box, db) => {
        box.querySelector('i').style.height = clamp((-(db || 0) / 20) * 100, 0, 100) + '%';
        box.parentElement.querySelector('.gr-val').textContent = (db || 0).toFixed(1) + ' dB';
      };
      if (lv) {
        set(detailRefs.grBig, lv.gr.comp);
        set(detailRefs.grLim, lv.gr.lim);
      }
    }
    raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ ouverture / fermeture */
  function open() {
    SS.audio.ensureCtx();
    app.project().tracks.forEach((t) => SS.audio.ensureBus(t));
    SS.audio.applyMaster(app.project());
    isOpen = true;
    document.body.classList.add('mixer-open');
    $('#mixer').hidden = false;
    $('#mixerBtn').classList.add('active');
    $('#mixerBtn').setAttribute('aria-pressed', 'true');
    render();
    lastT = 0;
    raf = requestAnimationFrame(loop);
  }
  function close() {
    isOpen = false;
    cancelAnimationFrame(raf);
    document.body.classList.remove('mixer-open');
    $('#mixer').hidden = true;
    $('#mixerBtn').classList.remove('active');
    $('#mixerBtn').setAttribute('aria-pressed', 'false');
    app.renderAll(); // les volumes de l'en-tête des pistes reprennent les valeurs du fader
  }

  function init(appApi) {
    app = appApi;
    $('#mixerBtn').addEventListener('click', () => (isOpen ? close() : open()));
    window.addEventListener('resize', () => isOpen && detailRefs && detailRefs.drawBig());
  }

  return { init, open, close, render, isOpen: () => isOpen };
})();
