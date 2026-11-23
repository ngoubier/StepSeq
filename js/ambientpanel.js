/*
 * Fenêtre de réglages d'une piste Ambient (bouton Sound design de la piste) : le module de la piste (Jardin,
 * Paysage ou Fresque), les réglages communs du moteur (Suit les accords, Hasard, courbe de présence sur toute la
 * chanson) et ceux du module. Tout s'entend aussitôt pendant la lecture : le moteur (js/ambient.js) relit les
 * réglages à chaque pas. Annuler rétablit les réglages d'avant l'ouverture.
 */
window.SS = window.SS || {};

SS.ambientPanel = (() => {
  let app = null;
  let track = null;
  let snap = null;
  let dlg = null;
  let raf = 0;
  const draws = []; // fonctions de dessin de la fenêtre ouverte

  const el = (tag, cls, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach((k) => k != null && n.append(k));
    return n;
  };
  const AM = () => SS.ambient;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const cssVar = (name) => (name && name.startsWith('--') ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888' : name);
  const NOTE = ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
  const noteName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const pct = (v) => `${Math.round(v * 100)} %`;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  /* ---------- réglages de la piste ---------- */
  const data = () => (track.ambient = track.ambient || {});
  const mod = () => AM().moduleOf(track);
  const modData = () => {
    const a = data();
    return (a[mod()] = a[mod()] || {});
  };
  const P = () => AM().settings(track).p;
  const changed = () => app && app.changed();
  function setP(k, v) {
    modData()[k] = v;
    changed();
  }

  /* ---------- composants ---------- */
  function fit(cv) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    return dpr;
  }
  function slider(label, key, min, max, step, fmt = pct, help = null) {
    const out = el('output', 'amb-val');
    const inp = el('input', null, { type: 'range', min, max, step, 'aria-label': label });
    inp.value = P()[key];
    const show = () => (out.textContent = fmt(+inp.value));
    inp.addEventListener('input', () => {
      setP(key, +inp.value);
      show();
    });
    show();
    return el('div', 'amb-row', {}, el('label', null, { text: label }, help ? SS.helpTip(help, label) : null), inp, out);
  }
  function box(title, help, ...kids) {
    return el('div', 'amb-box', {}, el('h4', null, {}, title, help ? SS.helpTip(help, title) : null), ...kids);
  }
  /** Import d'un fichier audio à toi (rangé dans le navigateur) : bouton + nom ; « ✕ » revient au son intégré. */
  function fileField(key, builtIn) {
    const name = el('b');
    const show = () => (name.textContent = P()[key] ? P()[key].name : builtIn);
    const input = el('input', null, { type: 'file', accept: 'audio/*', hidden: '' });
    const clear = el('button', 'btn btn-small', { type: 'button', title: `Revenir au son intégré (${builtIn})`, text: '✕' });
    const sync = () => {
      show();
      clear.hidden = !P()[key];
    };
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      name.textContent = 'chargement…';
      try {
        setP(key, await AM().importFile(f));
      } catch (e) {
        SS.ui && SS.ui.toast && SS.ui.toast('Ce fichier audio ne peut pas être lu.');
      }
      input.value = '';
      sync();
    });
    clear.addEventListener('click', () => {
      setP(key, null);
      sync();
    });
    sync();
    const pickBtn = el('button', 'btn btn-small', { type: 'button', text: '⤓ Ton son…', onclick: () => input.click() });
    // glisser-déposer un fichier sur la ligne
    const row = el('div', 'amb-file', {}, pickBtn, name, clear, input);
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    });
    return row;
  }

  /* ---------- frise de la chanson (présence, couches de la Fresque) ---------- */
  function songBlocks() {
    const p = app.project();
    const spb = SS.stepsPerBar(p);
    const barsOf = (id) => {
      const sc = p.scenes.find((x) => x.id === id);
      return sc ? (sc.id === p.current ? p.bars : sc.bars || p.bars) : 0;
    };
    const list = (p.song || []).filter((b) => p.scenes.some((sc) => sc.id === b.scene));
    const blocks = list.length ? list : [{ scene: p.current, repeat: 1 }];
    const steps = blocks.map((b) => barsOf(b.scene) * spb * Math.max(1, b.repeat || 1));
    const all = steps.reduce((a, b) => a + b, 0) || 1;
    let x = 0;
    return blocks.map((b, i) => {
      const sc = p.scenes.find((s) => s.id === b.scene) || {};
      const o = { name: sc.name || 'Scène', x: x / all, w: steps[i] / all };
      x += steps[i];
      return o;
    });
  }
  /**
   * Courbe dessinée à la souris sur toute la chanson. lanes : [{ label, color, get(), set(arr) }] ; une ligne par courbe.
   */
  function curveCanvas(lanes, height) {
    const cv = el('canvas', 'amb-curves');
    cv.style.height = height + 'px';
    const GUT = 74, TOP = 18;
    let lane = -1, li = -1, lv = 0, arr = null;
    const geo = () => {
      const r = cv.getBoundingClientRect();
      return { r, lh: (r.height - TOP) / lanes.length };
    };
    const paint = (e) => {
      const { r, lh } = geo();
      const x = e.clientX - r.left, y = e.clientY - r.top - TOP;
      const v = clamp(1 - (y - lane * lh - 4) / (lh - 8), 0, 1);
      const i = Math.round(((x - GUT) / (r.width - GUT)) * (AM().PN - 1));
      if (i < 0 || i >= AM().PN) return;
      if (li < 0) arr[i] = v;
      else {
        const a = Math.min(li, i), b = Math.max(li, i);
        for (let k = a; k <= b; k++) arr[k] = Math.round((lv + (v - lv) * (b === a ? 1 : (k - li) / (i - li))) * 1000) / 1000;
      }
      li = i;
      lv = v;
      lanes[lane].set(arr);
    };
    cv.addEventListener('pointerdown', (e) => {
      const { r, lh } = geo();
      if (e.clientX - r.left < GUT) return;
      lane = clamp(Math.floor((e.clientY - r.top - TOP) / lh), 0, lanes.length - 1);
      arr = [...lanes[lane].get()];
      li = -1;
      paint(e);
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => lane >= 0 && paint(e));
    cv.addEventListener('pointerup', () => {
      lane = -1;
      changed();
    });
    draws.push(() => {
      const dpr = fit(cv), g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cv.width / dpr, H = cv.height / dpr, lh = (H - TOP) / lanes.length, w = W - GUT;
      g.clearRect(0, 0, W, H);
      g.font = '11px system-ui, sans-serif';
      songBlocks().forEach((b, i) => {
        g.fillStyle = cssVar(i % 2 ? '--c-panel-2' : '--c-panel-3');
        g.fillRect(GUT + b.x * w, 0, b.w * w - 1, TOP - 3);
        g.fillStyle = cssVar('--c-text-2');
        if (b.w * w > 30) g.fillText(b.name, GUT + b.x * w + 4, 11);
      });
      lanes.forEach((L, i) => {
        const top = TOP + i * lh, hh = lh - 8, col = cssVar(L.color), a = L.get();
        g.fillStyle = cssVar(i % 2 ? '--c-surface-1' : '--c-bg');
        g.fillRect(0, top, W, lh);
        g.fillStyle = col;
        g.fillText(L.label, 8, top + lh / 2 + 4);
        g.beginPath();
        g.moveTo(GUT, top + 4 + hh);
        a.forEach((v, k) => g.lineTo(GUT + (k / (a.length - 1)) * w, top + 4 + hh * (1 - v)));
        g.lineTo(W, top + 4 + hh);
        g.closePath();
        g.globalAlpha = 0.3;
        g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        g.beginPath();
        a.forEach((v, k) => {
          const x = GUT + (k / (a.length - 1)) * w, y = top + 4 + hh * (1 - v);
          k ? g.lineTo(x, y) : g.moveTo(x, y);
        });
        g.stroke();
      });
      const lv = AM().live(track.id);
      if (lv && SS.audio.isPlaying()) {
        g.fillStyle = cssVar('--c-text');
        g.fillRect(GUT + lv.frac * w, 0, 1.5, H);
      }
    });
    return cv;
  }

  /* ---------- en-tête commun ---------- */
  function commonPart() {
    const a = data();
    const follow = el('button', 'btn btn-small' + (a.follow !== false ? ' active' : ''), { type: 'button', text: '♪ Suit les accords' });
    follow.addEventListener('click', () => {
      data().follow = data().follow === false;
      follow.classList.toggle('active', data().follow !== false);
      changed();
    });
    const rand = el('input', null, { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': 'Hasard' });
    rand.value = AM().settings(track).rand;
    rand.addEventListener('input', () => {
      data().rand = +rand.value;
      changed();
    });
    const chord = el('b', 'amb-chord', { text: '—' });
    draws.push(() => {
      const lv = AM().live(track.id);
      chord.textContent = lv && lv.env && SS.audio.isPlaying() ? lv.env.pcs.map((pc) => NOTE[pc]).join(' · ') : '—';
    });
    const always = el('button', 'btn btn-small', { type: 'button', text: 'Toujours présente', title: 'Effacer la courbe : la piste joue à plein sur toute la chanson' });
    always.addEventListener('click', () => {
      delete data().presence;
      changed();
    });
    const pres = curveCanvas([{ label: 'Présence', color: '--c-teal', get: () => data().presence || new Array(AM().PN).fill(1), set: (arr) => (data().presence = arr) }], 70);
    return el(
      'div',
      'amb-common',
      {},
      el('div', 'amb-line', {}, follow, SS.helpTip('Le module joue les notes de l’accord de la scène (piste Accords). Coupé : les notes de la gamme de la scène.', 'Suit les accords'), el('span', 'amb-lab', { text: 'Hasard' }), rand, SS.helpTip('Part de hasard dans le choix des notes et le moment où elles partent.', 'Hasard'), el('span', 'amb-lab', { text: 'Notes' }), chord, el('span', 'spacer'), always),
      el('div', 'amb-line', {}, el('span', 'amb-lab', { text: 'Présence sur la chanson' }), SS.helpTip('Dessine le volume de la piste sur toute la chanson : en haut elle est là, en bas elle s’efface. Les scènes de l’arrangement sont en haut de la frise.', 'Présence')),
      pres,
    );
  }

  /* ---------- Jardin ---------- */
  function jardinPart() {
    const wave = el('canvas', 'amb-wave');
    let peaks = null, peakBuf = null;
    draws.push(() => {
      const ctx = SS.audio.ensureCtx(), { buf } = AM().grainBuffer(ctx, track);
      if (buf !== peakBuf) {
        peakBuf = buf;
        const d = buf.getChannelData(0), n = 160, stp = Math.floor(d.length / n);
        peaks = Array.from({ length: n }, (_, i) => {
          let m = 0;
          for (let j = 0; j < stp; j += 8) m = Math.max(m, Math.abs(d[i * stp + j] || 0));
          return m;
        });
      }
      const dpr = fit(wave), g = wave.getContext('2d'), W = wave.width, H = wave.height;
      g.clearRect(0, 0, W, H);
      g.fillStyle = cssVar('--c-teal-deep');
      peaks.forEach((p, i) => {
        const h = p * H * 0.85;
        g.fillRect((i / peaks.length) * W, (H - h) / 2, W / peaks.length, h);
      });
      const lv = AM().live(track.id);
      const P0 = P();
      if (lv && SS.audio.isPlaying()) {
        g.fillStyle = cssVar('--c-teal-soft');
        (lv.grains || []).forEach((q) => {
          const a = 1 - (lv.now - q.born) / q.dur;
          if (a <= 0 || a > 1) return;
          g.globalAlpha = a * 0.8;
          g.beginPath();
          g.arc(q.pos * W, H / 2 + Math.sin(q.born * 97) * H * 0.3, (2 + a * 4) * dpr, 0, 6.28);
          g.fill();
        });
        g.globalAlpha = 1;
      }
      g.fillStyle = cssVar('--c-amber');
      g.fillRect(((lv && SS.audio.isPlaying() ? lv.gHead : P0.gPos) || 0) * W, 0, 2 * dpr, H);
    });
    // boucles
    const loopCv = el('canvas', 'amb-loops-cv');
    const lens = el('div', 'amb-loops');
    const LCOL = ['--c-yellow-soft', '--c-teal', '--c-violet-soft', '--c-red-soft'];
    const noteEls = [];
    const renderLens = () => {
      lens.replaceChildren();
      noteEls.length = 0;
      (P().loops || []).slice(0, 4).forEach((len, i) => {
        const n = el('b', null, { text: '—' });
        noteEls.push(n);
        const inp = el('input', null, { type: 'number', min: 3, max: 120, step: 0.1, 'aria-label': `Longueur de la boucle ${i + 1} (s)` });
        inp.value = len;
        inp.addEventListener('change', () => {
          const L = [...P().loops];
          L[i] = clamp(+inp.value || len, 3, 120);
          setP('loops', L);
        });
        const c = el('span', 'amb-loop-n', { text: String(i + 1) });
        c.style.color = cssVar(LCOL[i]);
        lens.append(el('div', 'amb-loop', {}, c, n, el('span', null, {}, inp, ' s')));
      });
    };
    renderLens();
    const newLens = el('button', 'btn btn-small', { type: 'button', text: '✦ Nouvelles longueurs' });
    newLens.addEventListener('click', () => {
      const L = [13.7, 17.3, 19.9, 23.1, 25.7, 29.3, 31.9, 37.3].sort(() => Math.random() - 0.5).slice(0, 4).map((x) => Math.round((x + (Math.random() - 0.5)) * 10) / 10);
      setP('loops', L);
      renderLens();
    });
    const voice = el('select', null, { 'aria-label': 'Son des boucles' });
    [['bell', 'Cloche douce'], ['piano', 'Piano feutré'], ['pad', 'Souffle']].forEach(([v, t]) => voice.append(el('option', null, { value: v, text: t })));
    voice.value = P().lVoice;
    voice.addEventListener('change', () => setP('lVoice', voice.value));
    draws.push(() => {
      const dpr = fit(loopCv), g = loopCv.getContext('2d'), W = loopCv.width, H = loopCv.height, cx = W / 2, cy = H / 2, R = H * 0.46;
      g.clearRect(0, 0, W, H);
      const lv = AM().live(track.id), play = lv && SS.audio.isPlaying();
      (P().loops || []).slice(0, 4).forEach((len, i) => {
        const r = R * (0.35 + i * 0.21), col = cssVar(LCOL[i]);
        g.strokeStyle = col;
        g.globalAlpha = 0.35;
        g.beginPath();
        g.arc(cx, cy, r, 0, 6.28);
        g.stroke();
        g.globalAlpha = 1;
        let ph = 0, flash = 0;
        if (play && lv.loopNext[i]) {
          const since = len - (lv.loopNext[i] - lv.now);
          ph = (((since / len) % 1) + 1) % 1;
          flash = since >= 0 && since < 0.6 ? 1 - since / 0.6 : 0;
        }
        const a = -Math.PI / 2 + ph * 6.28;
        g.fillStyle = col;
        g.beginPath();
        g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, (3 + flash * 6) * dpr, 0, 6.28);
        g.fill();
        if (noteEls[i]) noteEls[i].textContent = play && lv.lastNotes[i] ? noteName(lv.lastNotes[i]) : '—';
      });
    });
    return el(
      'div',
      'amb-grid',
      {},
      box(
        'Nuage de grains',
        'Le son est découpé en petits morceaux rejoués en désordre : un piano devient un nuage. Prends n’importe quel son à toi (voix, guitare, piano, enregistrement). Le son intégré prend les notes de l’accord.',
        wave,
        fileField('grainFile', 'Accord de piano (intégré)'),
        slider('Position', 'gPos', 0, 1, 0.001),
        slider('Dérive', 'gDrift', 0, 1, 0.01),
        slider('Dispersion', 'gSpray', 0, 1, 0.01),
        slider('Taille', 'gSize', 0.02, 0.8, 0.01, (v) => `${Math.round(v * 1000)} ms`),
        slider('Densité', 'gDens', 1, 50, 1, (v) => `${v}/s`),
        slider('Hauteur', 'gPitch', -24, 12, 1, (v) => `${v > 0 ? '+' : ''}${v} dt`),
        slider('Octaves au hasard', 'gOct', 0, 1, 0.01),
        slider('Volume', 'gVol', 0, 1, 0.01),
      ),
      box('Boucles qui dérivent', 'Chaque boucle joue une note de l’accord toutes les N secondes. Les longueurs ne tombent jamais juste ensemble : les combinaisons changent sans arrêt, façon Music for Airports.', loopCv, lens, el('div', 'amb-line', {}, voice, newLens), slider('Chance de jouer', 'lProb', 0.1, 1, 0.01), slider('Volume', 'lVol', 0, 1, 0.01)),
      box('Drone', 'La fondamentale de l’accord et sa quinte, tenues sans fin ; elles glissent quand l’accord change.', slider('Volume', 'dVol', 0, 1, 0.01), slider('Battements', 'dBeat', 0, 20, 0.5, (v) => `${v} c`), slider('Brillance', 'dBright', 0, 1, 0.01)),
      box('Terrain', 'Un enregistrement du monde réel en fond (pluie, forêt, ville, mer) : la pluie intégrée, ou ton propre fichier.', fileField('fieldFile', 'Pluie (intégrée)'), slider('Volume', 'fVol', 0, 1, 0.01), slider('Lointain', 'fFar', 0, 1, 0.01)),
      box('Marée', 'Un filtre qui s’ouvre et se referme très lentement sur tout le module.', slider('Cycle', 'tPer', 20, 300, 5, mmss), slider('Amplitude', 'tAmt', 0, 1, 0.01)),
    );
  }

  /* ---------- Paysage ---------- */
  function paysagePart() {
    const SEEDS = AM().SEEDS;
    const cv = el('canvas', 'amb-land');
    let kind = 'bell', drag = -1, hover = -1;
    const seeds = () => P().seeds;
    const own = () => {
      if (!modData().seeds) modData().seeds = JSON.parse(JSON.stringify(P().seeds));
      return modData().seeds;
    };
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
    };
    const hit = (p) => {
      const list = seeds();
      for (let i = list.length - 1; i >= 0; i--) if (Math.hypot((list[i].x - p.x) * p.r.width, (list[i].y - p.y) * p.r.height) < 10 + (list[i].s || 1) * 8) return i;
      return -1;
    };
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      const p = pos(e);
      drag = hit(p);
      if (drag < 0) {
        own().push({ k: kind, x: clamp(p.x, 0, 1), y: clamp(p.y, 0.05, 0.96), s: 1 });
        drag = own().length - 1;
      }
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      hover = hit(p);
      if (drag >= 0) {
        const s = own()[drag];
        s.x = Math.round(clamp(p.x, 0, 1) * 1000) / 1000;
        s.y = Math.round(clamp(p.y, 0.05, 0.96) * 1000) / 1000;
      }
    });
    cv.addEventListener('pointerup', () => {
      if (drag >= 0) changed();
      drag = -1;
    });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const i = hit(pos(e));
      if (i >= 0) {
        own().splice(i, 1);
        changed();
      }
    });
    cv.addEventListener(
      'wheel',
      (e) => {
        const i = hit(pos(e));
        if (i < 0) return;
        e.preventDefault();
        const s = own()[i];
        s.s = Math.round(clamp((s.s || 1) - Math.sign(e.deltaY) * 0.2, 0.4, 3) * 10) / 10;
        changed();
      },
      { passive: false },
    );
    draws.push(() => {
      const dpr = fit(cv), g = cv.getContext('2d'), W = cv.width, H = cv.height;
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, cssVar('--c-bg-deep'));
      grd.addColorStop(0.62, cssVar('--c-cyan-bg'));
      grd.addColorStop(1, cssVar('--c-bg-deep'));
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      [[0.62, 0.1, '--c-surface-1'], [0.74, 0.07, '--c-bg'], [0.86, 0.05, '--c-bg-deep']].forEach(([b, a, col], k) => {
        g.fillStyle = cssVar(col);
        g.globalAlpha = 0.85;
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) g.lineTo(x, H * (b - a * (0.5 + 0.5 * Math.sin((x / dpr) * 0.004 * (k + 1) + k * 2) * Math.cos((x / dpr) * 0.0013 + k))));
        g.lineTo(W, H);
        g.fill();
        g.globalAlpha = 1;
      });
      const lv = AM().live(track.id), play = lv && SS.audio.isPlaying();
      seeds().forEach((s, i) => {
        const def = SEEDS[s.k] || SEEDS.bell, col = cssVar(def.color);
        const x = s.x * W, y = s.y * H, rad = (5 + (s.s || 1) * 5) * dpr * (0.55 + 0.45 * s.y);
        const last = play && lv.lastSeed.get(i);
        const age = last ? lv.now - last.t : 99;
        const flash = age >= 0 && age < 1.2 ? 1 - age / 1.2 : 0;
        if (flash > 0) {
          g.strokeStyle = col;
          g.globalAlpha = flash * 0.7;
          g.beginPath();
          g.arc(x, y, rad + (1 - flash) * 40 * dpr, 0, 6.28);
          g.stroke();
          g.globalAlpha = 1;
        }
        const glow = g.createRadialGradient(x, y, 0, x, y, rad * (2 + flash * 2));
        glow.addColorStop(0, col);
        glow.addColorStop(1, 'transparent');
        g.globalAlpha = 0.45;
        g.fillStyle = glow;
        g.beginPath();
        g.arc(x, y, rad * (2 + flash * 2), 0, 6.28);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = col;
        g.beginPath();
        g.arc(x, y, rad, 0, 6.28);
        g.fill();
        if (i === hover || i === drag) {
          g.fillStyle = cssVar('--c-text');
          g.font = `${11 * dpr}px system-ui, sans-serif`;
          g.fillText(def.label + (last ? ` · ${noteName(last.m)}` : ''), x + rad + 6 * dpr, y + 4 * dpr);
        }
      });
      g.fillStyle = cssVar('--c-muted');
      g.font = `${11 * dpr}px system-ui, sans-serif`;
      g.fillText('loin', 8 * dpr, 15 * dpr);
      g.fillText('grave', 8 * dpr, H - 7 * dpr);
      g.fillText('aigu', W - 32 * dpr, H - 7 * dpr);
    });
    const pal = el('div', 'amb-seeds');
    Object.entries(SEEDS).forEach(([k, d]) => {
      const b = el('button', 'amb-seed' + (k === kind ? ' active' : ''), { type: 'button' }, el('i'), d.label);
      b.querySelector('i').style.background = cssVar(d.color);
      b.addEventListener('click', () => {
        kind = k;
        pal.querySelectorAll('.amb-seed').forEach((x) => x.classList.toggle('active', x === b));
      });
      pal.append(b);
    });
    const kinds = el('div', 'amb-line');
    [['wind', 'Vent'], ['rain', 'Pluie']].forEach(([v, t]) => {
      const b = el('button', 'btn btn-small' + (P().wKind === v ? ' active' : ''), { type: 'button', text: t });
      b.addEventListener('click', () => {
        setP('wKind', v);
        kinds.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      });
      kinds.append(b);
    });
    return el(
      'div',
      'amb-paysage',
      {},
      el('div', 'amb-stage', {}, cv),
      el(
        'div',
        'amb-side',
        {},
        box('Graines', 'Clic dans le paysage : planter la graine choisie · glisser : la déplacer · molette : plus ou moins bavarde · clic droit : l’arracher. À gauche c’est grave, à droite aigu ; en haut c’est loin (réverbe, sombre), en bas c’est proche.', pal),
        box('Vent qui chante', 'Le vent (ou la pluie) passe dans des cordes invisibles accordées sur l’accord de la scène : le bruit devient un accord.', slider('Vent', 'wVol', 0, 1, 0.01), slider('Chant', 'wRes', 0, 1, 0.01), slider('Rafales', 'wGust', 0, 1, 0.01), kinds),
      ),
    );
  }

  /* ---------- Fresque ---------- */
  function fresquePart() {
    const curves = () => P().curves;
    const lanes = AM().LAYERS.map((L) => ({
      label: L.label,
      color: L.color,
      get: () => curves()[L.id],
      set: (arr) => {
        const own = (modData().curves = modData().curves || {});
        own[L.id] = arr;
      },
    }));
    const gen = el('b', null, { text: '0' });
    draws.push(() => {
      const lv = AM().live(track.id);
      gen.textContent = lv && SS.audio.isPlaying() ? String(lv.tapeGen || 0) : '—';
    });
    return el(
      'div',
      null,
      {},
      el('div', 'amb-line', {}, el('span', 'amb-lab', { text: 'Couches sur la chanson' }), SS.helpTip('Dessine la présence de chaque couche sur toute la chanson : en haut elle est là, en bas elle se tait. Les notes, elles, sont inventées en jouant.', 'Couches')),
      curveCanvas(lanes, 210),
      el(
        'div',
        'amb-grid',
        {},
        box('Boucle de bande', 'Une boucle de 7 s rejouée comme sur un vieux magnétophone. À chaque tour, la bande s’use : les aigus partent, des trous apparaissent. Bande neuve à chaque changement d’accord.', slider('Usure', 'wear', 0, 1, 0.01), slider('Pleurage', 'wow', 0, 1, 0.01), slider('Souffle', 'hiss', 0, 1, 0.01), el('div', 'amb-line amb-muted', {}, 'Tour ', gen)),
        box('Nappe spectrale', 'L’accord découpé en 12 notes pures qui apparaissent et disparaissent chacune à son rythme, sans jamais d’attaque.', slider('Mouvement', 'move', 0, 1, 0.01), slider('Glissé d’accord', 'glide', 0.5, 12, 0.5, (v) => `${v} s`)),
      ),
    );
  }

  /* ---------- fenêtre ---------- */
  function build() {
    dlg = el('dialog', 'amb-dialog', { 'aria-labelledby': 'ambTitle' });
    dlg.innerHTML = `<form method="dialog"><div class="amb-head"><h2 id="ambTitle"></h2><span class="amb-sub" id="ambSub"></span><span class="spacer"></span><label class="amb-lab" for="ambModule">Module</label><select id="ambModule"></select></div><div id="ambBody" class="amb-body"></div><div class="dlg-footer"><span class="amb-muted" id="ambTrack"></span><span class="spacer"></span><button type="button" class="btn" id="ambCancel">Annuler</button><button type="submit" class="btn btn-accent">OK</button></div></form>`;
    document.body.append(dlg);
    const sel = dlg.querySelector('#ambModule');
    Object.values(AM().MODULES).forEach((m) => sel.append(el('option', null, { value: m.id, text: `${m.icon} ${m.label}` })));
    sel.addEventListener('change', () => {
      const old = AM().MODULES[track.instrument];
      track.instrument = sel.value;
      // nom par défaut (« Jardin ») : il suit le module
      if (old && (track.name === old.label || track.name === `${old.icon} ${old.label}`)) track.name = AM().MODULES[sel.value].label;
      changed();
      app.renderTrack && app.renderTrack(track);
      render();
    });
    dlg.querySelector('#ambCancel').addEventListener('click', () => {
      restore();
      dlg.close();
    });
    dlg.addEventListener('cancel', () => restore());
    dlg.addEventListener('close', () => {
      cancelAnimationFrame(raf);
      raf = 0;
      draws.length = 0;
    });
  }
  function restore() {
    if (!snap) return;
    if (snap.ambient) track.ambient = JSON.parse(snap.ambient);
    else delete track.ambient;
    track.instrument = snap.instrument;
    track.name = snap.name;
    changed();
    app.renderTrack && app.renderTrack(track);
  }
  function render() {
    draws.length = 0;
    const M = AM().MODULES[mod()];
    dlg.style.setProperty('--amb-color', `var(${M.color})`);
    dlg.querySelector('#ambTitle').textContent = `${M.icon} ${M.label}`;
    dlg.querySelector('#ambSub').textContent = M.sub;
    dlg.querySelector('#ambModule').value = M.id;
    dlg.querySelector('#ambTrack').textContent = `Piste « ${track.name} » · moteur Ambient`;
    const part = M.id === 'paysage' ? paysagePart() : M.id === 'fresque' ? fresquePart() : jardinPart();
    dlg.querySelector('#ambBody').replaceChildren(commonPart(), part);
  }
  function loop() {
    draws.forEach((f) => {
      try {
        f();
      } catch (e) {
        /* dessin suivant */
      }
    });
    raf = requestAnimationFrame(loop);
  }
  function open(t) {
    if (!SS.isAmbient(t)) return;
    SS.audio.ensureCtx();
    track = t;
    snap = { ambient: t.ambient ? JSON.stringify(t.ambient) : null, instrument: t.instrument, name: t.name };
    if (!dlg) build();
    render();
    dlg.returnValue = '';
    dlg.showModal();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    SS.audio.prepareTrack(t); // fichiers importés
  }
  function init(appApi) {
    app = appApi;
  }
  return { init, open };
})();
