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
      // toute retouche manuelle marque le profil appliqué comme « modifié »
      setMix: (m, opts = {}) => {
        t.mix = m;
        if (!opts.fromProfile && t.mixProfile) t.mixProfile.modified = true;
        SS.audio.applyMix(t);
      },
      getProfile: () => t.mixProfile || null,
      setProfile: (pr) => (pr ? (t.mixProfile = pr) : delete t.mixProfile),
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
      setMix: (m, opts = {}) => {
        p.master = { ...SS.masterParams(p), mix: m };
        if (!opts.fromProfile && p.masterProfile) p.masterProfile.modified = true;
        SS.audio.applyMaster(p);
      },
      getProfile: () => p.masterProfile || null,
      setProfile: (pr) => (pr ? (p.masterProfile = pr) : delete p.masterProfile),
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

  /** Réponse du filtre VCF (mêmes étages que le moteur audio). */
  let vcfFilters = null;
  function vcfResponse(v, freqs) {
    if (!oc) eqResponse(SS.MIX_DEFAULTS.eq, new Float32Array([1000]));
    if (!vcfFilters) vcfFilters = ['highpass', 'highpass', 'lowpass', 'lowpass'].map((type) => {
      const f = oc.createBiquadFilter();
      f.type = type;
      return f;
    });
    const two = v.on && v.slope === 24;
    const [h1, h2, l1, l2] = vcfFilters;
    h1.frequency.value = two ? v.hp.f : 10;
    h1.Q.value = -5.35;
    h2.frequency.value = v.on ? v.hp.f : 10;
    h2.Q.value = v.on ? v.hp.res : 0;
    l1.frequency.value = two ? v.lp.f : 22000;
    l1.Q.value = -5.35;
    l2.frequency.value = v.on ? v.lp.f : 22000;
    l2.Q.value = v.on ? v.lp.res : 0;
    const total = new Float32Array(freqs.length).fill(1);
    const mag = new Float32Array(freqs.length);
    const ph = new Float32Array(freqs.length);
    vcfFilters.forEach((f) => {
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
    $('#mxProject').textContent = app.project().title;
    $('#mixerTop').replaceChildren(mixsetBar(list.length));
    $('#mixerStrips').replaceChildren(...list.map(stripEl));
    renderDetail();
    if (SS.automixPanel) SS.automixPanel.decorate(); // pastilles des conseils Auto Mix
  }

  /** Insert de tranche (EQ / COMP / LIM) : un clic l'active ou le coupe ; ses réglages sont dans le panneau du bas. */
  function insertBtn(ch, key, label, full) {
    const on = ch.getMix()[key].on;
    return h('button', {
      type: 'button',
      class: 'ins' + (on ? ' on' : ''),
      'data-key': key,
      title: `${full} : ${on ? 'actif — cliquer pour le couper' : 'coupé — cliquer pour l’activer'}`,
      'aria-pressed': String(on),
      onclick: () => {
        const mm = ch.getMix();
        mm[key].on = !mm[key].on;
        selected = ch.id;
        ch.setMix(mm);
        app.changed();
        render();
      },
    }, label);
  }

  /** Badge du profil appliqué à la tranche (ou « sans profil »), cliquable pour en choisir un. */
  function profileBadge(ch) {
    const pr = ch.getProfile();
    return h('button', {
      type: 'button',
      class: 'strip-prof' + (pr ? (pr.modified ? ' modified' : ' on') : ''),
      title: pr ? `Profil : ${pr.name}${pr.modified ? ' (retouché depuis)' : ''} — cliquer pour changer` : 'Aucun profil — cliquer pour en choisir un',
      onclick: () => {
        selected = ch.id;
        render();
        const sel = $('#mixerDetail .profile-select');
        if (sel) sel.focus();
      },
    }, h('span', { class: 'prof-ico', 'aria-hidden': 'true' }, '◆'), h('span', { class: 'prof-name' }, pr ? pr.short || pr.name : 'Sans profil'), pr && pr.modified ? h('i', {}, '*') : null);
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
    requestAnimationFrame(() => drawEq(eqCanvas, m.eq, 84, 28));

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
      h('div', { class: 'strip-role' }, ch.master ? 'Sortie' : SS.profiles.ROLES[SS.profiles.roleOf(t)]),
      profileBadge(ch),
      h('div', { class: 'strip-ins' }, insertBtn(ch, 'eq', 'EQ', 'Égaliseur'), insertBtn(ch, 'comp', 'CMP', 'Compresseur'), insertBtn(ch, 'lim', 'LIM', 'Limiteur')),
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
                SS.audio.applyMutes(app.project());
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
                SS.audio.applyMutes(app.project());
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
  const FADER_H = 150;
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
      'data-key': key,
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

  /** Un réglage touché active son module : met à jour les témoins ON/OFF (panneau et tranche) sans tout redessiner. */
  function syncPower(ch, mm) {
    const strip = $(`#mixerStrips .strip[data-id="${ch.id}"]`);
    document.querySelectorAll('#mixerDetail .mod-power[data-key]').forEach((b) => {
      const on = !!mm[b.dataset.key].on;
      b.classList.toggle('on', on);
      b.textContent = on ? 'ON' : 'OFF';
      b.setAttribute('aria-pressed', String(on));
    });
    if (strip) strip.querySelectorAll('.ins[data-key]').forEach((b) => {
      const on = !!mm[b.dataset.key].on;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderDetail() {
    const ch = chan(selected);
    if (!ch) return;
    const m = ch.getMix();
    const update = (fn, { redraw = true } = {}) => {
      const mm = ch.getMix();
      fn(mm);
      ch.setMix(mm);
      syncPower(ch, mm);
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

    // largeur de la courbe : l'espace laissé par le tableau des bandes (à droite), ou toute la largeur sur écran étroit
    const EQW = () => {
      const box = detailRefs && detailRefs.eqBox;
      if (!box) return 480;
      const full = box.clientWidth - 26;
      return Math.round(full > 620 ? Math.min(620, full - 300) : Math.max(280, full));
    };
    const EQH = 170;
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
      h('div', { class: 'eq-layout' }, eqCanvas, eqTable),
      h('p', { class: 'mod-help' }, 'Glisse les points (fréquence ↔, gain ↕) · molette sur 2 ou 3 : largeur (Q) · double-clic : remise à zéro.')
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
        : 'Le limiteur empêche la piste de dépasser le plafond, même sur les coups les plus forts.'),
      ch.master
        ? null
        : h(
            'div',
            { class: 'sd-sliders mod-nudge' },
            slider('Placement', ch.track.nudge || 0, -30, 30, { fmt: (v) => (v > 0 ? '+' : '') + v + ' ms' + (v > 0 ? ' (en retard)' : v < 0 ? ' (en avance)' : ''), step: 1, def: 0 }, (v) => {
              if (v) ch.track.nudge = v;
              else delete ch.track.nudge;
            }),
            h('p', { class: 'mod-help' }, 'Décale la piste dans le temps : une caisse claire jouée quelques millisecondes en retard sonne plus détendue, plus humaine.')
          )
    );

    /* --- Filtre VCF (Master) --- */
    let vcfBox = null;
    let drawVcf = () => {};
    if (ch.master) {
      const v = m.vcf;
      const vcfCanvas = h('canvas', { class: 'vcf-graph' });
      drawVcf = () => {
        const vv = ch.getMix().vcf;
        const W = Math.max(200, (vcfBox && vcfBox.clientWidth - 26) || 300);
        const H = 74;
        const g = setupCanvas(vcfCanvas, W, H);
        g.fillStyle = '#121216';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = '#26262c';
        g.fillStyle = '#6a6a74';
        g.font = '10px system-ui, sans-serif';
        [100, 1000, 10000].forEach((f) => {
          const x = Math.round(fToX(f, W)) + 0.5;
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, H);
          g.stroke();
          g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 3, H - 4);
        });
        const top = 20; // dB affichés au-dessus de 0
        const y0 = (H - 6) * (top / 50) + 3; // échelle +20 … −30 dB
        const toY = (db) => y0 - (db / 50) * (H - 6);
        g.strokeStyle = '#3a3a42';
        g.beginPath();
        g.moveTo(0, y0 + 0.5);
        g.lineTo(W, y0 + 0.5);
        g.stroke();
        const n = Math.floor(W);
        const freqs = new Float32Array(n);
        for (let i = 0; i < n; i++) freqs[i] = xToF((i / (n - 1)) * W, W);
        const resp = vcfResponse(vv, freqs);
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const db = clamp(20 * Math.log10(resp[i] || 1e-6), -30, top);
          const x = (i / (n - 1)) * W;
          i ? g.lineTo(x, toY(db)) : g.moveTo(x, toY(db));
        }
        g.strokeStyle = vv.on ? '#d38bff' : '#5a5a66';
        g.lineWidth = 2;
        g.stroke();
        g.lineTo(W, H);
        g.lineTo(0, H);
        g.closePath();
        g.fillStyle = vv.on ? 'rgba(192, 123, 255, .15)' : 'rgba(120, 120, 130, .08)';
        g.fill();
      };
      const upd = (fn) => {
        update((mm) => {
          fn(mm.vcf);
          mm.vcf.on = true;
        }, { redraw: false });
        drawVcf();
      };
      const slopeBtn = (n) => h('button', {
        type: 'button',
        class: 'seg-btn' + (v.slope === n ? ' on' : ''),
        'aria-pressed': String(v.slope === n),
        title: n === 12 ? 'Pente douce (12 dB/oct), résonance marquée' : 'Pente raide (24 dB/oct), façon filtre de synthé « ladder »',
        onclick: () => {
          upd((vv) => (vv.slope = n));
          app.changed();
          render();
        },
      }, `${n} dB/oct`);
      const fmtHz = (x) => (x >= 1000 ? (x / 1000).toFixed(x >= 10000 ? 1 : 2) + ' kHz' : Math.round(x) + ' Hz');
      const fmtRes = (x) => x.toFixed(1) + ' dB';
      vcfBox = h(
        'section',
        { class: 'mod mod-vcf' + (detailFocus === 'vcf' ? ' focus' : ''), 'data-mod': 'vcf' },
        h('div', { class: 'mod-head' }, h('h3', {}, 'Filtre VCF ', h('small', {}, 'passe-haut + passe-bas')), powerBtn(ch, 'vcf', 'le filtre')),
        vcfCanvas,
        h('div', { class: 'seg vcf-slope' }, slopeBtn(12), slopeBtn(24)),
        h(
          'div',
          { class: 'sd-sliders vcf-sliders' },
          slider('Passe-haut', v.hp.f, 20, 20000, { log: true, fmt: fmtHz, def: 20 }, (x) => upd((vv) => (vv.hp.f = Math.round(x)))),
          slider('Résonance', v.hp.res, 0, 18, { fmt: fmtRes, step: 0.5, def: 0 }, (x) => upd((vv) => (vv.hp.res = Math.round(x * 2) / 2))),
          slider('Passe-bas', v.lp.f, 20, 20000, { log: true, fmt: fmtHz, def: 20000 }, (x) => upd((vv) => (vv.lp.f = Math.round(x)))),
          slider('Résonance', v.lp.res, 0, 18, { fmt: fmtRes, step: 0.5, def: 0 }, (x) => upd((vv) => (vv.lp.res = Math.round(x * 2) / 2)))
        ),
        h('p', { class: 'mod-help' }, 'Monte le passe-haut ou descends le passe-bas pour filtrer tout le morceau (montées, breaks). Double-clic : filtre ouvert.')
      );
    }

    /* --- Mastering (Master) : js/master-dsp.js --- */
    let mastBox = null;
    let mastRefs = null;
    if (ch.master) {
      const p = app.project();
      const ms = SS.masterParams(p).mastering;
      const setM = (patch, redraw = false) => {
        const cur = SS.masterParams(p);
        p.master = { ...cur, mastering: SS.cleanMastering({ ...cur.mastering, ...patch }) };
        if (p.masterProfile) p.masterProfile.modified = true;
        SS.audio.applyMaster(p);
        if (redraw) {
          app.changed();
          render();
        }
      };
      const tile = (label) => {
        const v = h('b', {}, '—');
        return { el: h('div', { class: 'mast-tile' }, h('small', {}, label), v), v };
      };
      const tM = tile('Momentané');
      const tS = tile('Court terme');
      const tI = tile('Intégré');
      const tTP = tile('True peak');
      const tGR = tile('Limiteur');
      const hint = h('p', { class: 'mod-help mast-hint' });
      const aim = (target) => {
        const lv = SS.audio.levels('__master');
        const L = lv && lv.loudness;
        if (!L || !Number.isFinite(L.i) || L.secs < 10) {
          hint.textContent = 'Joue d\'abord au moins 10 secondes (idéalement tout le morceau) : le volume intégré se mesure pendant la lecture.';
          return;
        }
        const drive = Math.round((SS.masterParams(p).mastering.drive + target - L.i) * 10) / 10;
        setM({ on: true, drive }, true);
        SS.ui && SS.ui.toast && SS.ui.toast(`Mastering : gain d'entrée ${drive > 0 ? '+' : ''}${drive} dB pour viser ${target} LUFS. Rejoue le morceau pour vérifier.`, 5000);
      };
      const on = ms.on;
      mastBox = h(
        'section',
        { class: 'mod mod-mast', 'data-mod': 'mast' },
        h('div', { class: 'mod-head' }, h('h3', {}, 'Mastering'), h('button', {
          type: 'button',
          class: 'mod-power' + (on ? ' on' : ''),
          'aria-pressed': String(on),
          title: on ? 'Désactiver le mastering' : 'Activer le mastering',
          onclick: () => setM({ on: !on }, true),
        }, on ? 'ON' : 'OFF')),
        h('div', { class: 'mast-tiles' }, tM.el, tS.el, tI.el, tTP.el, tGR.el),
        h(
          'div',
          { class: 'sd-sliders' },
          slider('Gain d\'entrée', ms.drive, -12, 18, { fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB', step: 0.1, def: 0 }, (v) => setM({ drive: v, on: true })),
          slider('Plafond', ms.ceiling, -6, 0, { fmt: (v) => v.toFixed(1) + ' dBTP', step: 0.1, def: -1 }, (v) => setM({ ceiling: v })),
          slider('Écrêtage doux', ms.clip, 0, 1, { fmt: (v) => (v ? Math.round(v * 100) + ' %' : 'off'), step: 0.01, def: 0 }, (v) => setM({ clip: v })),
          slider('Relâchement', ms.release, 0.02, 0.8, { log: true, fmt: (v) => Math.round(v * 1000) + ' ms', def: 0.12 }, (v) => setM({ release: v })),
          slider('Largeur stéréo', ms.width, 0, 2, { fmt: (v) => Math.round(v * 100) + ' %', step: 0.01, def: 1 }, (v) => setM({ width: v })),
          slider('Graves en mono', ms.mono, 0, 250, { fmt: (v) => (v ? `sous ${Math.round(v)} Hz` : 'off'), step: 5, def: 100 }, (v) => setM({ mono: v }))
        ),
        h(
          'div',
          { class: 'mast-aim' },
          h('small', {}, 'Viser :'),
          ...[[-14, 'streaming'], [-11, 'synthwave'], [-9, 'club']].map(([t, n]) =>
            h('button', { type: 'button', class: 'chip', title: `Règle le gain d'entrée d'après le volume intégré mesuré`, onclick: () => aim(t) }, `${t} LUFS · ${n}`)
          )
        ),
        hint,
        h('p', { class: 'mod-help' }, 'Dernier maillon avant la sortie : graves en mono, largeur des aigus, écrêtage doux des transitoires puis limiteur à anticipation qui ne dépasse jamais le plafond (true peak). Le volume perçu se lit en LUFS (norme EBU R128) : −14 pour le streaming, −11 à −9 pour la musique électronique.')
      );
      mastRefs = { tM: tM.v, tS: tS.v, tI: tI.v, tTP: tTP.v, tGR: tGR.v };
    }

    const head = h(
      'div',
      { class: 'detail-head', style: `--c:${ch.color}` },
      h('b', { class: 'detail-name', title: ch.master ? 'Sortie générale' : 'Chaîne : égaliseur → compresseur → limiteur → panoramique → fader' }, ch.master ? 'Master' : ch.name),
      profileBar(ch),
      h('button', {
        type: 'button',
        class: 'btn btn-small',
        title: 'Remettre cette tranche à plat (EQ, compresseur, limiteur, panoramique)',
        onclick: () => {
          if (ch.master) ch.setMix(JSON.parse(JSON.stringify(SS.MASTER_DEFAULTS.mix)), { fromProfile: true });
          else {
            delete ch.track.mix;
            SS.audio.applyMix(ch.track);
          }
          ch.setProfile(null);
          app.changed();
          render();
        },
      }, 'Réinitialiser')
    );
    $('#mixerDetail').style.setProperty('--c', ch.color);
    $('#mixerDetail').replaceChildren(head, h('div', { class: 'detail-mods' + (vcfBox ? ' with-vcf' : '') }, eqBox, compBox, limBox, vcfBox, mastBox));
    detailRefs = { eqBox, drawBig, drawTransfer, grBig, grLim, ch, mast: mastRefs };
    requestAnimationFrame(() => {
      drawBig();
      drawTransfer();
      drawVcf();
    });
  }

  /* ------------------------------------------------------------------ profils multi-tranches */
  let withLevels = false;
  let lastMixset = '';

  function applyMixset(prof) {
    const p = app.project();
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const roleOf = SS.profiles.roleOf;
    const kick = p.tracks.find((t) => roleOf(t) === 'kick');
    let done = 0;
    const missing = [];
    p.tracks.forEach((t) => {
      const e = prof.roles[roleOf(t)];
      if (!e) {
        missing.push(t.name);
        return;
      }
      const m = SS.mixParams(t);
      m.eq = clone(e.mix.eq);
      m.comp = clone(e.mix.comp);
      m.lim = clone(e.mix.lim);
      if (withLevels && Number.isFinite(e.pan)) m.pan = e.pan;
      t.mix = SS.cleanMix(m);
      const roleName = SS.profiles.ROLES[SS.profiles.roleOf(t)];
      t.mixProfile = { id: prof.id, name: `${prof.name} — ${roleName}`, short: prof.short || prof.name, modified: false };
      if (withLevels && Number.isFinite(e.volume)) {
        t.volume = e.volume;
        SS.audio.setTrackGain(t, t.volume);
      }
      if (e.sc && kick && kick !== t) {
        t.fx = { ...(t.fx || {}), scSource: kick.id, scDepth: e.sc.depth, scRelease: e.sc.release };
        SS.audio.applyFx(t);
      }
      SS.audio.applyMix(t);
      done++;
    });
    if (prof.master) {
      p.master = { volume: prof.master.volume, mix: SS.cleanMix({ ...clone(prof.master.mix), pan: 0 }, SS.MASTER_DEFAULTS.mix) };
      p.masterProfile = { id: prof.id, name: `${prof.name} — Master`, short: prof.short || prof.name, modified: false };
      SS.audio.applyMaster(p);
    }
    lastMixset = prof.id;
    app.changed();
    render();
    SS.ui.toast(
      `« ${prof.name} » appliqué à ${done} piste${done > 1 ? 's' : ''}${prof.master ? ' + Master' : ''}` +
        (missing.length ? ` · sans réglage : ${missing.join(', ')}` : '') + ' — Ctrl+Z pour annuler',
      4500
    );
  }

  const RESET_ID = '__reset';

  /** Remet uniquement les faders des pistes et du Master au gain unitaire. */
  function resetFaders() {
    channels().forEach((ch) => ch.setVol(1));
    app.changed();
    render();
    SS.ui.toast('Faders des pistes et du Master à 0 dB — Ctrl+Z pour annuler', 4000);
  }

  /** Remet toutes les tranches (pistes et Master) à plat : EQ, compresseur, limiteur, panoramique. */
  function resetAll() {
    const p = app.project();
    p.tracks.forEach((t) => {
      delete t.mix;
      delete t.mixProfile;
      SS.audio.applyMix(t);
    });
    p.master = { volume: p.master ? p.master.volume : SS.MASTER_DEFAULTS.volume, mix: JSON.parse(JSON.stringify(SS.MASTER_DEFAULTS.mix)) };
    delete p.masterProfile;
    SS.audio.applyMaster(p);
    app.changed();
    render();
    SS.ui.toast(`${p.tracks.length + 1} tranches remises à plat (volumes conservés) — Ctrl+Z pour annuler`, 4000);
  }

  /** Barre d'action de la console : profil de mixage complet, appliqué à toutes les tranches en dessous. */
  function mixsetBar(nStrips) {
    const { factory, user } = SS.profiles.list('mixset');
    const p = app.project();
    const opt = (x) => h('option', { value: x.id, selected: lastMixset === x.id, title: x.desc || '' }, x.name);
    const sel = h(
      'select',
      { class: 'profile-select', 'aria-label': 'Profil de mixage complet' },
      h('option', { value: '' }, '— Choisir un profil de mixage —'),
      h('optgroup', { label: 'Profils d’usine' }, factory.map(opt)),
      user.length ? h('optgroup', { label: 'Mes profils' }, user.map(opt)) : null,
      h('optgroup', { label: 'Par défaut' },
        h('option', { value: RESET_ID, selected: lastMixset === RESET_ID, title: 'EQ, compresseur, limiteur et panoramique à plat sur toutes les tranches ; volumes conservés' }, '↺ Réinitialiser (toutes les tranches à plat)'))
    );
    const applyBtn = h('button', {
      type: 'button',
      class: 'btn btn-small btn-accent mx-apply',
      title: 'Régler toutes les tranches ci-dessous (pistes et Master) avec ce profil',
      onclick: () => {
        if (sel.value === RESET_ID) return resetAll();
        const prof = sel.value && SS.profiles.find(sel.value);
        if (prof) applyMixset(prof);
      },
    });
    const delBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Supprimer le profil de mixage personnel choisi',
      onclick: () => {
        const prof = SS.profiles.find(sel.value);
        if (!prof || prof.factory || !confirm(`Supprimer le profil « ${prof.name} » ?`)) return;
        SS.profiles.remove(prof.id);
        lastMixset = '';
        render();
      },
    }, 'Supprimer');
    const sync = () => {
      const reset = sel.value === RESET_ID;
      const prof = !reset && sel.value && SS.profiles.find(sel.value);
      applyBtn.disabled = !prof && !reset;
      applyBtn.replaceChildren(h('span', { 'aria-hidden': 'true' }, reset ? '↺' : '⤓'), reset ? ` Réinitialiser les ${nStrips} tranches` : ` Appliquer aux ${nStrips} tranches`);
      applyBtn.title = reset ? 'Remettre toutes les tranches ci-dessous à plat (volumes conservés)' : 'Régler toutes les tranches ci-dessous (pistes et Master) avec ce profil';
      delBtn.disabled = !prof || prof.factory;
      const lv = levels.querySelector('input');
      lv.disabled = reset;
      levels.classList.toggle('disabled', reset);
    };
    sel.addEventListener('change', () => {
      lastMixset = sel.value;
      sync();
    });
    const levels = h('label', { class: 'profile-check', title: 'Appliquer aussi les volumes et panoramiques du profil (sinon : EQ, compresseur, limiteur et sidechain seulement)' },
      h('input', { type: 'checkbox', checked: withLevels, onchange: (e) => (withLevels = e.target.checked) }), ' Volumes et panoramiques');
    const saveBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Mémoriser le réglage de toutes les tranches comme profil de mixage',
      onclick: () => {
        const input = h('input', { type: 'text', class: 'profile-name', placeholder: 'Nom du profil', maxlength: 60, value: `Mixage ${p.title}` });
        const done = (ok) => {
          const name = input.value.trim();
          if (ok && name) {
            const prof = SS.profiles.saveMixset(name, p);
            if (prof) {
              lastMixset = prof.id;
              SS.ui.toast(`Profil de mixage « ${name} » enregistré (${Object.keys(prof.roles).length} rôles + Master)`, 2500);
            } else SS.ui.toast('Impossible d’enregistrer le profil dans ce navigateur.', 3000);
          }
          render();
        };
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
        });
        saveBtn.replaceWith(h('span', { class: 'profile-form' }, input,
          h('button', { type: 'button', class: 'btn btn-small btn-accent', onclick: () => done(true) }, 'OK'),
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => done(false) }, 'Annuler')));
        input.focus();
        input.select();
      },
    }, 'Enregistrer ce mixage…');
    const exportBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Télécharger tous mes profils (tranches, Master, mixages) dans un fichier',
      onclick: () => {
        const blob = new Blob([SS.profiles.exportJson()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'stepseq-profils.json' });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    }, 'Exporter');
    const importBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Ajouter les profils d’un fichier exporté',
      onclick: () => {
        const input = h('input', { type: 'file', accept: '.json,application/json' });
        input.addEventListener('change', async () => {
          const f = input.files[0];
          if (!f) return;
          try {
            const n = SS.profiles.importJson(await f.text());
            SS.ui.toast(`${n} profil(s) importé(s)`, 2500);
            render();
          } catch (e) {
            SS.ui.toast('Ce fichier ne contient pas de profils StepSeq.', 3000);
          }
        });
        input.click();
      },
    }, 'Importer');
    sync();
    return h(
      'div',
      { class: 'mx-actions' },
      h('span', { class: 'mx-actions-label' }, h('b', {}, 'Profil de mixage'), h('small', {}, 'toutes les tranches ↓')),
      sel,
      applyBtn,
      levels,
      h('span', { class: 'mx-sep', 'aria-hidden': 'true' }),
      saveBtn,
      delBtn,
      h('span', { class: 'mx-sep', 'aria-hidden': 'true' }),
      exportBtn,
      importBtn
    );
  }

  /* ------------------------------------------------------------------ profils */
  let lastProfile = {}; // id du dernier profil appliqué, par tranche (pour l'afficher dans la liste)

  /** Piste qui sert de source au sidechain d'un profil : le premier kick (autre que la piste elle-même). */
  const kickOf = (track) => app.project().tracks.find((t) => t !== track && t.type === 'drum' && t.sound === 'bd');

  function applyProfile(ch, prof) {
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const m = ch.getMix();
    m.eq = clone(prof.mix.eq);
    m.comp = clone(prof.mix.comp);
    m.lim = clone(prof.mix.lim);
    ch.setMix(ch.master ? m : SS.cleanMix(m), { fromProfile: true });
    ch.setProfile({ id: prof.id, name: prof.name, short: prof.short || prof.name, modified: false });
    let note = '';
    if (ch.master && Number.isFinite(prof.volume)) ch.setVol(prof.volume);
    if (!ch.master && prof.sc) {
      const kick = kickOf(ch.track);
      if (kick) {
        ch.track.fx = { ...(ch.track.fx || {}), scSource: kick.id, scDepth: prof.sc.depth, scRelease: prof.sc.release };
        SS.audio.applyFx(ch.track);
        note = ` · sidechain sur « ${kick.name} »`;
      } else note = ' · pas de kick pour le sidechain';
    }
    lastProfile[ch.id] = prof.id;
    app.changed();
    render();
    SS.ui.toast(`Profil « ${prof.name} » appliqué${note} — Ctrl+Z pour annuler`, 3500);
  }

  function currentProfileData(ch) {
    const m = ch.getMix();
    const data = { mix: { eq: m.eq, comp: m.comp, lim: m.lim } };
    if (ch.master) data.volume = ch.getVol();
    else {
      const f = SS.fxParams(ch.track);
      if (f.scSource && f.scDepth > 0) data.sc = { depth: f.scDepth, release: f.scRelease };
    }
    return data;
  }

  function profileBar(ch) {
    const kind = ch.master ? 'master' : 'channel';
    const { factory, user } = SS.profiles.list(kind);
    const desc = h('span', { class: 'profile-desc' });
    const opt = (p) => h('option', { value: p.id, selected: lastProfile[ch.id] === p.id }, p.name);
    const sel = h(
      'select',
      { class: 'profile-select', 'aria-label': 'Profil de console' },
      h('option', { value: '' }, ch.master ? '— Choisir un profil de mastering —' : '— Choisir un profil de tranche —'),
      h('optgroup', { label: 'Profils d’usine' }, factory.map(opt)),
      user.length ? h('optgroup', { label: 'Mes profils' }, user.map(opt)) : null
    );
    const showDesc = () => {
      const p = sel.value && SS.profiles.find(sel.value);
      desc.textContent = p ? p.desc || (p.factory ? '' : 'Profil personnel') : 'Applique d’un coup EQ, compresseur et limiteur' + (ch.master ? ' (et le niveau du Master).' : ' (et le sidechain si le profil en a un).');
      delBtn.disabled = !p || p.factory;
    };
    sel.addEventListener('change', () => {
      const p = sel.value && SS.profiles.find(sel.value);
      if (p) applyProfile(ch, p);
    });
    const delBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Supprimer le profil personnel choisi',
      onclick: () => {
        const p = SS.profiles.find(sel.value);
        if (!p || p.factory || !confirm(`Supprimer le profil « ${p.name} » ?`)) return;
        SS.profiles.remove(p.id);
        delete lastProfile[ch.id];
        render();
      },
    }, 'Supprimer');
    const saveBtn = h('button', {
      type: 'button',
      class: 'btn btn-small btn-accent',
      title: 'Mémoriser les réglages actuels de cette tranche comme profil',
      onclick: () => {
        const input = h('input', { type: 'text', class: 'profile-name', placeholder: 'Nom du profil', maxlength: 60, value: ch.master ? 'Mon master' : ch.name });
        const done = (ok) => {
          const name = input.value.trim();
          if (ok && name) {
            const p = SS.profiles.save(kind, name, currentProfileData(ch));
            if (p) {
              lastProfile[ch.id] = p.id;
              SS.ui.toast(`Profil « ${name} » enregistré`, 2000);
            } else SS.ui.toast('Impossible d’enregistrer le profil dans ce navigateur.', 3000);
          }
          render();
        };
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
        });
        const form = h('span', { class: 'profile-form' }, input,
          h('button', { type: 'button', class: 'btn btn-small btn-accent', onclick: () => done(true) }, 'OK'),
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => done(false) }, 'Annuler'));
        saveBtn.replaceWith(form);
        input.focus();
        input.select();
      },
    }, 'Enregistrer comme profil…');
    const exportBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Télécharger mes profils dans un fichier (pour les sauvegarder ou les partager)',
      onclick: () => {
        const blob = new Blob([SS.profiles.exportJson()], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'stepseq-profils.json' });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
    }, 'Exporter');
    const importBtn = h('button', {
      type: 'button',
      class: 'btn btn-small',
      title: 'Ajouter les profils d’un fichier exporté',
      onclick: () => {
        const input = h('input', { type: 'file', accept: '.json,application/json' });
        input.addEventListener('change', async () => {
          const f = input.files[0];
          if (!f) return;
          try {
            const n = SS.profiles.importJson(await f.text());
            SS.ui.toast(`${n} profil(s) importé(s)`, 2500);
            render();
          } catch (e) {
            SS.ui.toast('Ce fichier ne contient pas de profils StepSeq.', 3000);
          }
        });
        input.click();
      },
    }, 'Importer');
    showDesc();
    sel.addEventListener('change', showDesc);
    const cur = ch.getProfile();
    return h(
      'div',
      { class: 'profile-bar' },
      h('span', { class: 'profile-label' }, 'Profil de la tranche'),
      h('span', { class: 'profile-current' + (cur ? (cur.modified ? ' modified' : ' on') : '') },
        h('span', { 'aria-hidden': 'true' }, '◆ '), cur ? cur.name + (cur.modified ? ' (retouché)' : '') : 'aucun'),
      sel,
      saveBtn,
      delBtn,
      desc
    );
  }

  /** Redessine les courbes d'EQ (miniature de la tranche + grande courbe). */
  function refreshEqViews(ch, { skipBig } = {}) {
    const strip = $(`#mixerStrips .strip[data-id="${ch.id}"] .strip-eq`);
    if (strip) drawEq(strip, ch.getMix().eq, 84, 28);
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
      const L = lv && lv.loudness;
      const M = detailRefs.mast;
      if (M) {
        const f = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
        M.tM.textContent = L ? f(L.m) + ' LUFS' : '—';
        M.tS.textContent = L ? f(L.s) + ' LUFS' : '—';
        M.tI.textContent = L ? f(L.i) + ' LUFS' : '—';
        M.tTP.textContent = L ? f(L.tp) + ' dBTP' : '—';
        M.tGR.textContent = L ? '−' + (L.gr || 0).toFixed(1) + ' dB' : '—';
        M.tTP.classList.toggle('over', !!L && L.tp > -0.95);
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
    if (SS.automixPanel) SS.automixPanel.close();
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
    $('#mxClose').addEventListener('click', close);
    $('#mxResetFaders').addEventListener('click', resetFaders);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen && !document.querySelector('dialog[open]') && !document.querySelector('.ctx-menu')) close();
    });
    window.addEventListener('resize', () => isOpen && detailRefs && detailRefs.drawBig());
  }

  return { init, open, close, render, isOpen: () => isOpen, drawEq }; // drawEq : miniatures des chaînes Auto Mix
})();
