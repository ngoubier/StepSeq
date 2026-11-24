/*
 * Arp One, la fenêtre de l'arpégiateur (moteur : js/arp.js) d'une piste Arpège ; titre : « Arp One · piste — partie ».
 *
 *   En-tête (toujours visible) : ▶ lecture en boucle sur un accord d'essai, grille des pas avec curseur,
 *     éditeur de lignes (vélocité ; en mode Avancé : rythme, degré, vitesse, ratchet, longueur, notes, octave,
 *     probabilité), dessiné en glissant ; un clic sur un pas ouvre tous ses réglages.
 *     La boucle dure le plus petit nombre de mesures entières qui contient au moins 16 pas et un cycle complet
 *     du motif ; la grille la montre en entier (colonnes plus étroites, mais jamais moins de MIN_COL_PX pixels :
 *     au-delà, elle défile pour suivre le curseur).
 *   Modules (liste à gauche, voyant = actif, clic sur le voyant = allumer / éteindre) : Motif, Rythme, Accord,
 *     Pas à pas, Geste, Écho, Ratchet roulé, Évolution ; le module choisi s'affiche à droite.
 *   Niveau Essentiel / Avancé (en-tête) : Essentiel montre les modules principaux et ceux qui sont allumés.
 *   Geste (« Ajuster › ») : gestes tout prêts, pavé (étalement × alternance), zoom sur un groupe, 5 curseurs dans
 *     l'ordre d'application (étalement, alternance, microvariation, accent, articulation), écoute Régulier / Geste.
 *
 * Tout réglage est écrit dans track.arp (normalisé par SS.Arp.normalize) et s'entend tout de suite.
 */
window.SS = window.SS || {};

SS.arpPanel = (() => {
  const A = () => SS.Arp;
  let app;
  let track = null;
  let snapshot = null;
  let armed = false; // arpège allumé par l’ouverture (bouton ARP) : « Annuler » le rééteint
  let undo = [];
  let dlg;
  let sliding = false;
  let test = null;
  let sel = null;
  /*
   * host : Arp One ouvert par l'assistant « Nouvelle chanson » (bouton Avancé… de l'étape Arpège, js/band.js) sur une
   * piste d'écoute ; il fournit project() (projet d'écoute), title, bars (mesures de la boucle) et chords (accords de
   * la scène : { step, len, notes, bass, name }) ; apply(arp, toutes) reçoit les réglages à la fermeture.
   * La boucle joue les accords de la scène ; pas d'accord à poser ni d'arpège à éteindre.
   */
  let host = null;
  let hostAll = false; // « Toutes » : les réglages vont à toutes les scènes où l'arpège joue
  let hostLevel = null; // niveau à rendre à la Grille quand la fenêtre de l'assistant se ferme
  let hostAt = -1; // pas joué dans la boucle (accord en cours)
  const ctl = () => host || app;

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const NOTES = SS.NOTE_NAMES;
  const NOTES_FR = SS.NOTE_NAMES_FR;

  function set(patch, { push = true } = {}) {
    if (push) {
      undo.push(clone(track.arp));
      if (undo.length > 60) undo.shift();
    }
    track.arp = A().normalize({ ...track.arp, ...patch, preset: '' });
    ctl().changed();
    render();
  }

  const P = () => track.arp.steps;
  const STEP_LANES = ['rhythm', 'vel', 'len', 'poly', 'ratchet', 'div', 'deg'];

  function sizedLanes(arp, n) {
    const lanes = clone(arp.lanes);
    for (const name of STEP_LANES) {
      let src = lanes[name];
      if (!src.length) {
        if (name === 'rhythm' && arp.rhythm.type === 'euclid') src = A().euclid(arp.rhythm.hits, arp.rhythm.steps, arp.rhythm.rot);
        else src = [A().LANES[name].def];
      }
      lanes[name] = Array.from({ length: n }, (_, i) => src[i % src.length]);
    }
    return lanes;
  }

  function stepValues(i) {
    const l = track.arp.lanes;
    const at = (name) => (l[name].length ? l[name][i % l[name].length] : A().LANES[name].def);
    const r = track.arp.rhythm;
    const rh = r.type === 'lane' && l.rhythm.length ? at('rhythm') : r.type === 'euclid' ? A().euclid(r.hits, r.steps, r.rot)[i % r.steps] : 1;
    return { play: !!rh, vel: at('vel'), len: at('len'), poly: at('poly'), ratchet: at('ratchet'), div: at('div'), deg: at('deg') };
  }

  function setStep(i, patch, opts) {
    // chaque ligne garde sa longueur (polymétrie) ; une ligne vide prend la longueur du motif
    const lanes = clone(track.arp.lanes);
    const names = { play: 'rhythm', vel: 'vel', len: 'len', poly: 'poly', ratchet: 'ratchet', div: 'div', deg: 'deg' };
    const idx = i == null ? [...Array(P()).keys()] : [i];
    for (const [k, name] of Object.entries(names)) {
      if (!(k in patch)) continue;
      lanes[name] = laneValues(name);
      idx.forEach((j) => (lanes[name][j % lanes[name].length] = k === 'play' ? (patch.play ? 1 : 0) : patch[k]));
    }
    set('play' in patch ? { lanes, rhythm: { ...track.arp.rhythm, type: 'lane' } } : { lanes }, opts);
  }

  // premier accord joué par la piste : la piste Accords de la scène (ACCORDS), sinon les notes tenues ensemble
  /** Basse imposée du premier accord de la piste (C/E, piste Accords) : pour le mode Guitare. */
  const trackBass = () => {
    if (test) return undefined;
    if (host) return host.chords[0] && host.chords[0].bass;
    const ev = SS.playEvents(ctl().project(), track).find((e) => e.notes && e.notes.length);
    return ev && Number.isFinite(ev.bass) ? ev.bass : undefined;
  };
  const trackChord = () => {
    if (host) return host.chords[0] ? host.chords[0].notes.slice() : null;
    const ev = SS.playEvents(ctl().project(), track).find((e) => e.notes && e.notes.length);
    return ev ? ev.notes.slice() : null;
  };
  /** Source des accords arpégés : piste Accords de la scène, ou notes de la piste (bouton ACCORDS de la piste). */
  function setSource(follow) {
    test = null;
    if (follow && !track.follow) {
      track.follow = SS.FOLLOW.clean(track.lastFollow || true);
      delete track.lastFollow;
    } else if (!follow && track.follow) {
      track.lastFollow = track.follow;
      delete track.follow;
    }
    ctl().changed();
    ctl().renderTrack && ctl().renderTrack(track);
    render();
  }
  const rootMidi = (pc) => 12 * ((Number.isFinite(track.octave) ? track.octave : 3) + 1) + pc;
  function sourceChord() {
    if (test) return { notes: SS.chordNotes(rootMidi(test.root), test.type), from: 'essai' };
    const notes = trackChord();
    if (notes) return { notes, from: 'piste' };
    return { notes: SS.chordNotes(rootMidi(9), 'min'), from: 'essai' };
  }

  /** Pose l'accord d'essai sur toute la boucle de la piste (accord à arpéger). */
  function fillTrack() {
    const notes = sourceChord().notes;
    const len = SS.trackLen(ctl().project(), track);
    if (track.events.length && !confirm('Remplacer les accords de la piste par cet accord sur toute la boucle ?')) return;
    track.events = [{ step: 0, len, notes, vel: 0.8 }];
    if (track.follow) {
      // la piste jouait la piste Accords : elle joue maintenant l'accord posé
      track.lastFollow = track.follow;
      delete track.follow;
    }
    test = null;
    ctl().changed();
    ctl().renderTrack && ctl().renderTrack(track);
    render();
  }

  const loop = { on: false, timer: null, raf: null, next: 0, step: 0, queue: [], tick: -1 };
  /*
   * Longueur de la boucle d'écoute : le plus petit nombre de mesures entières qui contient au moins
   * 16 pas d'arpège ET un cycle complet du motif. La grille montre exactement ce qui est joué,
   * par pages de 16 pas qui suivent le curseur.
   */
  function motifPeriod(notes) {
    const a = { ...track.arp, evolve: 0, human: 0, motion: 0 };
    const seq = A().preview(a, notes, 192).map((t) => (t ? t.notes.join('+') + '/' + t.vel.toFixed(2) : '.'));
    for (let p = 1; p <= 96; p++) {
      let ok = true;
      for (let i = 0; i + p < seq.length; i++) if (seq[i] !== seq[i + p]) { ok = false; break; }
      if (ok) return p;
    }
    return 96;
  }
  function loopInfo() {
    if (guitarOn()) {
      // mode Guitare : assez de mesures pour un nombre entier de cycles du motif (une valse 3/4 dans du 4/4…)
      const spb = SS.stepsPerBar(ctl().project());
      const c = GA().cycle16(track.arp);
      let bars = 1;
      while (bars < 4 && (bars * spb) % c) bars++;
      if (host) while (bars < 16 && bars % host.bars) bars++;
      return { bars, steps: bars * spb, ticks: bars * spb, period: c };
    }
    const notes = sourceChord().notes;
    const spb = SS.stepsPerBar(ctl().project());
    const rate = track.arp.rate;
    const period = motifPeriod(notes);
    let bars = 1;
    while (bars < 16 && Math.ceil(bars * spb * rate - 1e-9) < Math.max(16, period)) bars++;
    if (host) while (bars < 16 && bars % host.bars) bars++; // la boucle joue toute la grille d'accords de la scène
    const steps = bars * spb;
    const ticks = Math.ceil(steps * rate - 1e-9);
    return { bars, steps, ticks, period };
  }
  const LOOP_STEPS = () => loopInfo().steps;

  async function startLoop() {
    const ctx = SS.audio.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    loop.on = true;
    render();
    if (picker && picker.open) renderPicker();
    await SS.audio.prepareTrack(track);
    if (!loop.on) return;
    loop.next = ctx.currentTime + 0.08;
    loop.step = 0;
    loop.queue = [];
    loopTick();
    loop.timer = setInterval(loopTick, 25);
    loop.raf = requestAnimationFrame(drawHead);
  }

  function stopLoop() {
    loop.on = false;
    clearInterval(loop.timer);
    cancelAnimationFrame(loop.raf);
    loop.queue = [];
    loop.tick = -1;
    if (dlg) dlg.querySelectorAll('.arp-head').forEach((el) => el.setAttribute('x', -100));
    if (dlg) hostChordMark(-1);
  }

  /** Programme les notes un peu en avance (comme le séquenceur), avec les réglages du moment. */
  function loopTick() {
    if (!loop.on || !track) return stopLoop();
    const ctx = SS.audio.ensureCtx();
    const project = ctl().project();
    const stepSec = 60 / project.tempo / 4;
    const total = LOOP_STEPS();
    const notes = sourceChord().notes;
    while (loop.next < ctx.currentTime + 0.12) {
      const s = loop.step % total;
      const lp = Math.floor(loop.step / total); // passage de boucle : EVOLVE varie d'un passage à l'autre
      const ev = hostEv(s) || { step: 0, len: total, notes, vel: 0.85, bass: trackBass() };
      const arp = gesteCompare === 'regulier' ? { ...track.arp, geste: undefined } : track.arp; // « Écouter : Régulier »
      const out = A().renderStep(arp, ev, s, { loop: lp, stepSec, stepsPerBeat: SS.stepsPerBeat(project), trackLen: total });
      out.forEach((n) => {
        const group = out.filter((x) => x.at === n.at);
        SS.audio.playNote(track, n.midi, loop.next + n.at, n.dur, n.vel * (group.length > 1 ? 0.8 : 1), undefined, group.indexOf(n), group.length, { cutoff: n.cutoff });
      });
      // une entrée par pas d'arpège (et non par double-croche) : le curseur passe par chaque colonne
      const rate = guitarOn() ? 1 : track.arp.rate;
      if (guitarOn()) loop.queue.push({ time: loop.next, tick: s % GA().cycle16(track.arp), s });
      else for (let k = Math.ceil(s * rate - 1e-9); k < Math.ceil((s + 1) * rate - 1e-9); k++) loop.queue.push({ time: loop.next + (k / rate - s) * stepSec, tick: k, s });
      loop.next += stepSec;
      loop.step++;
    }
  }

  /** Assistant : l'accord de la scène joué au pas s de la boucle (pas absolu : step décalé d'autant de tours). */
  function hostEv(s) {
    if (!host || test || !host.chords.length) return null;
    const n = host.bars * SS.stepsPerBar(ctl().project());
    const k = s % n;
    const c = host.chords.find((x) => k >= x.step && k < x.step + x.len) || host.chords[0];
    return { step: c.step + s - k, len: c.len, notes: c.notes, vel: 0.85, bass: c.bass };
  }
  /** Assistant : la puce de l'accord en cours s'allume pendant la lecture. */
  function hostChordMark(s) {
    if (!host || s === hostAt) return;
    hostAt = s;
    const n = host.bars * SS.stepsPerBar(ctl().project());
    const k = s < 0 ? -1 : s % n;
    dlg.querySelectorAll('.arp-hchord').forEach((b) => b.classList.toggle('on', k >= +b.dataset.a && k < +b.dataset.b));
  }

  /** Curseur de lecture sur la grille (toute la boucle). */
  function drawHead() {
    if (!loop.on) return;
    const now = SS.audio.ensureCtx().currentTime;
    while (loop.queue.length && loop.queue[0].time <= now) {
      const q = loop.queue.shift();
      loop.tick = q.tick;
      hostChordMark(q.s);
    }
    const head = dlg && dlg.querySelector('.arp-head');
    if (head) {
      const cw = +head.getAttribute('width');
      head.setAttribute('x', loop.tick >= 0 ? loop.tick * cw : -100); // pas de page : toute la boucle est dans la grille
      // grille plus large que la fenêtre : elle défile pour garder le curseur au premier tiers
      const sc = dlg.querySelector('.arp-scroll.on');
      if (sc && loop.tick >= 0) {
        const L = gridLayout();
        const target = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, loop.tick * L.cw * L.scale - sc.clientWidth / 3));
        sc.scrollLeft += (target - sc.scrollLeft) * 0.25; // en douceur
      }
    }
    loop.raf = requestAnimationFrame(drawHead);
  }

  function slider(label, value, min, max, step, fmt, oninput, opts = {}) {
    const out = h('output', {}, fmt(value));
    const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
    let pushed = false; // un seul « Défaire » par geste
    input.addEventListener('input', () => {
      sliding = true;
      out.textContent = fmt(+input.value);
      oninput(+input.value, !pushed);
      pushed = true;
    });
    input.addEventListener('change', () => {
      pushed = false;
      sliding = false;
      render();
    });
    return h(
      'div',
      { class: 'arp-macro' + (opts.cls ? ' ' + opts.cls : '') },
      h('label', {}, h('b', {}, label), out),
      input,
      opts.scale ? h('div', { class: 'arp-scale' }, opts.scale.map((t) => h('span', {}, t))) : null,
      opts.help ? h('small', {}, opts.help) : null
    );
  }

  function segmented(options, value, onpick, aria) {
    return h(
      'div',
      { class: 'segmented arp-seg', role: 'radiogroup', 'aria-label': aria },
      options.map((o) => h('button', { type: 'button', class: String(o.id) === String(value) ? 'active' : '', title: o.hint || null, onclick: () => onpick(o.id) }, o.label))
    );
  }

  /**
   * Grille de toute la boucle : une colonne par pas d'arpège ; plus la boucle a de pas, plus les colonnes sont
   * étroites (pas de pages). Repères : temps (fond plus clair), mesures (trait + « mes. 2 »).
   */
  /*
   * Largeur des colonnes : toute la boucle tient dans la fenêtre tant qu'une colonne garde au moins MIN_COL_PX
   * pixels ; en dessous, les colonnes gardent cette largeur et la grille défile pour suivre le curseur.
   */
  const MIN_COL_PX = 18;
  function gridLayout() {
    const C = loopInfo().ticks;
    const box = dlg && dlg.querySelector('.arp-player');
    const avail = Math.max(240, (box && box.clientWidth ? box.clientWidth - 26 : 760)); // largeur visible (px)
    const scale = avail / 640; // pixels par unité de dessin
    const cw = Math.max(640 / C, MIN_COL_PX / scale); // largeur d'une colonne (unités)
    const W = cw * C;
    return { C, cw, W, scale, scroll: W > 640 + 1e-6, px: W * scale };
  }

  function gridSvg(arp, notes) {
    const info = loopInfo();
    const L = gridLayout();
    const C = L.C;
    const ticks = A().preview(arp, notes, C, { loop: 0, stepsPerBeat: 4 });
    const all = ticks.flatMap((t) => (t ? t.notes : []));
    const W = L.W;
    const H = 120;
    const cw = L.cw;
    const colPx = cw * L.scale; // largeur réelle d'une colonne, en pixels (au moins MIN_COL_PX)
    const gap = colPx > 24 ? 2 : 1;
    const rate = track.arp.rate;
    const spb = SS.stepsPerBar(ctl().project());
    const at16 = (k) => k / rate; // position du pas en doubles-croches
    const isBeat = (k) => Math.abs(at16(k) / 4 - Math.round(at16(k) / 4)) < 1e-6;
    const isBar = (k) => Math.abs(at16(k) / spb - Math.round(at16(k) / spb)) < 1e-6;
    const p = P();
    let svg = '';
    for (let i = 0; i < C; i++) {
      const cls = (isBeat(i) ? 'ag-beat' : 'ag-col') + (i % p !== i ? ' ag-rep' : '');
      svg += `<rect class="${cls}" x="${(i * cw + gap / 2).toFixed(2)}" y="1" width="${(cw - gap).toFixed(2)}" height="${H - 2}" rx="${cw > 14 ? 3 : 1.5}"/>`;
      if (colPx >= 30 || isBeat(i)) svg += `<text class="ag-num" x="${(i * cw + cw / 2).toFixed(1)}" y="${H - 3}">${i + 1}</text>`;
      if (sel != null && i % p === sel) svg += `<rect class="arp-sel" x="${(i * cw + gap / 2).toFixed(2)}" y="1.5" width="${(cw - gap).toFixed(2)}" height="${H - 3}" rx="2"/>`;
    }
    for (let i = 1; i < C; i++) if (isBar(i)) svg += `<line class="ag-bar" x1="${(i * cw).toFixed(2)}" x2="${(i * cw).toFixed(2)}" y1="0" y2="${H}"/><text class="ag-bartxt" x="${(i * cw + 3).toFixed(1)}" y="${H - 12}">mes. ${Math.round(at16(i) / spb) + 1}</text>`;
    svg += `<rect class="arp-head" x="${loop.on && loop.tick >= 0 ? loop.tick * cw : -100}" y="0" width="${cw}" height="${H}" rx="2"/>`;
    if (all.length) {
      const lo = Math.min(...all) - 1;
      const hi = Math.max(...all) + 1;
      const y = (n) => H - 10 - ((n - lo) / Math.max(1, hi - lo)) * (H - 26);
      const nh = colPx >= 24 ? 8 : 6;
      // noms des notes : 12 px, puis 10 px quand la colonne s'affine (jamais masqués : la colonne garde 18 px)
      const fs = (colPx >= 30 ? 12 : 10) / L.scale;
      ticks.forEach((t, i) => {
        if (!t) {
          if (colPx >= 30) svg += `<text class="rest" x="${(i * cw + cw / 2).toFixed(1)}" y="${H / 2 + 4}">silence</text>`;
          return;
        }
        t.notes.forEach((n) => {
          const sx = (i + (t.shift || 0)) * cw;
          const w = Math.min(cw * t.gate, W - sx) - gap;
          const op = (0.3 + 0.7 * t.vel).toFixed(2);
          svg += `<rect class="note" x="${(sx + gap / 2).toFixed(2)}" y="${(y(n) - nh / 2).toFixed(1)}" width="${Math.max(2.5, w).toFixed(2)}" height="${nh}" rx="${nh / 4}" style="opacity:${op}"/>`;
        });
        svg += `<text style="font-size:${fs.toFixed(2)}px" x="${(i * cw + cw / 2).toFixed(1)}" y="12">${t.notes.map((n) => SS.NOTE_NAMES_FR[n % 12]).join('+')}</text>`;
      });
    }
    const wrap = h('div', { class: 'arp-grid-wrap', html: `<svg class="arp-grid" viewBox="0 0 ${W.toFixed(2)} ${H}" role="img" aria-label="Toute la boucle de l’arpège, ${C} pas"${L.scroll ? ` style="width:${L.px.toFixed(0)}px"` : ''}>${svg}</svg>` });
    wrap.firstChild.addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.max(0, Math.min(C - 1, Math.floor(((e.clientX - r.left) / r.width) * C)));
      const k = i % P();
      sel = sel === k ? null : k;
      render();
    });
    return wrap;
  }

  /*
   * Éditeur de lignes sous la grille : une ligne de pas à la fois (vélocité, rythme, degré…), dessinée en glissant.
   * Les colonnes sont alignées sur la grille ; au-delà de la longueur de la ligne, les valeurs se répètent (grisées).
   */
  const LANE_UI = [
    { id: 'vel', label: 'Vélocité', kind: 'bar', min: 0.05, max: 1, step: 0.05, from0: true, fmt: (v) => `${Math.round(v * 100)}` },
    { id: 'rhythm', label: 'Rythme', kind: 'toggle', fmt: (v) => (v ? '●' : '·') },
    { id: 'deg', label: 'Degré', kind: 'bi', min: -2, max: 2, step: 1, fmt: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0') },
    { id: 'div', label: 'Vitesse ×', kind: 'bar', min: 1, max: 4, step: 1, fmt: (v) => `×${v}` },
    { id: 'ratchet', label: 'Ratchet', kind: 'bar', min: 1, max: 4, step: 1, fmt: (v) => String(v) },
    { id: 'len', label: 'Longueur', kind: 'list', opts: [0, 1, 2, 4, 8, 16], fmt: (v) => (v ? (v >= 4 ? `${v / 4}t` : `${v}/4`) : '–') },
    { id: 'poly', label: 'Notes', kind: 'bar', min: 1, max: 3, step: 1, fmt: (v) => String(v) },
    { id: 'oct', label: 'Octave', kind: 'bi', min: -2, max: 2, step: 1, fmt: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0') },
    { id: 'prob', label: 'Probabilité', kind: 'bar', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}` },
  ];
  let laneSel = 'vel';
  const laneUi = () => LANE_UI.find((x) => x.id === laneSel) || LANE_UI[0];

  /** Valeurs actuelles d'une ligne (copie) ; ligne vide : la valeur neutre sur la longueur du motif. */
  function laneValues(name, arp = track.arp) {
    const l = arp.lanes[name];
    if (name === 'rhythm' && !(arp.rhythm.type === 'lane' && l.length)) {
      return arp.rhythm.type === 'euclid' ? A().euclid(arp.rhythm.hits, arp.rhythm.steps, arp.rhythm.rot) : Array(P()).fill(1);
    }
    return l.length ? l.slice() : Array(P()).fill(A().LANES[name].def);
  }
  function writeLane(name, values, opts) {
    const patch = { lanes: { ...track.arp.lanes, [name]: values } };
    if (name === 'rhythm') patch.rhythm = { ...track.arp.rhythm, type: 'lane' };
    set(patch, opts);
  }

  /** Hauteur (0..1) et sens d'une cellule pour l'affichage. */
  function cellShape(u, v) {
    if (u.kind === 'toggle') return { lo: 0, hi: v ? 1 : 0 };
    if (u.kind === 'list') return { lo: 0, hi: Math.max(0.04, u.opts.indexOf(v) / (u.opts.length - 1)) };
    if (u.kind === 'bi') {
      const mid = 0.5;
      const f = (v - u.min) / (u.max - u.min);
      return f >= mid ? { lo: mid, hi: Math.max(f, mid + 0.03) } : { lo: f, hi: mid };
    }
    return { lo: 0, hi: Math.max(0.04, (v - u.min) / (u.max - u.min)) };
  }
  function valueAt(u, f, cur) {
    if (u.kind === 'toggle') return cur;
    if (u.kind === 'list') return u.opts[Math.round(f * (u.opts.length - 1))];
    const lo = u.from0 ? 0 : u.min; // vélocité : la hauteur se lit de 0 à 100 % (au moins 5 %)
    const v = lo + Math.round((f * (u.max - lo)) / u.step) * u.step;
    return Math.round(Math.max(u.min, Math.min(u.max, v)) * 100) / 100;
  }

  function laneRow() {
    const u = laneUi();
    const info = loopInfo();
    const C = info.ticks;
    const row = h('div', { class: 'arp-vels lane-' + u.kind, title: `${u.label} de chaque pas : cliquer / glisser verticalement` });
    if (C > 20) row.classList.add('dense');
    const L = gridLayout();
    if (L.scroll) row.style.width = `${L.px.toFixed(0)}px`;
    let vals = laneValues(u.id);
    const cells = [];
    const paint = () =>
      cells.forEach((c, i) => {
        const v = vals[i % vals.length];
        const sh = cellShape(u, v);
        c.firstChild.style.bottom = `${sh.lo * 100}%`;
        c.firstChild.style.height = `${(sh.hi - sh.lo) * 100}%`;
        c.lastChild.textContent = C <= 24 ? u.fmt(v) : '';
      });
    for (let i = 0; i < C; i++) {
      const c = h('span', { class: 'arp-vel' + (i >= vals.length ? ' rep' : '') + (sel != null && i % P() === sel ? ' sel' : '') }, h('i'), h('em'));
      cells.push(c);
      row.append(c);
    }
    paint();
    let drag = false;
    let paintVal = null; // ligne Rythme : on peint la valeur du premier pas touché
    const apply = (e, push) => {
      const r = row.getBoundingClientRect();
      const i = Math.max(0, Math.min(C - 1, Math.floor(((e.clientX - r.left) / r.width) * C)));
      const f = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      const j = i % vals.length;
      if (u.kind === 'toggle' && push) paintVal = vals[j] ? 0 : 1;
      const v = u.kind === 'toggle' ? paintVal : valueAt(u, f, vals[j]);
      if (!push && vals[j] === v) return;
      vals = vals.slice();
      vals[j] = v;
      if (push) undo.push(clone(track.arp));
      const patch = { ...track.arp, lanes: { ...track.arp.lanes, [u.id]: vals }, preset: '' };
      if (u.id === 'rhythm') patch.rhythm = { ...track.arp.rhythm, type: 'lane' };
      track.arp = A().normalize(patch);
      paint();
      ctl().changed();
    };
    row.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      drag = true;
      sliding = true;
      apply(e, true);
    });
    row.addEventListener('pointermove', (e) => drag && apply(e, false));
    const end = () => {
      if (!drag) return;
      drag = false;
      sliding = false;
      render();
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    const advanced = level === 'avance';
    const tabs = advanced
      ? h(
          'div',
          { class: 'arp-lanetabs', role: 'tablist', 'aria-label': 'Ligne de pas à éditer' },
          LANE_UI.map((x) =>
            h('button', { type: 'button', role: 'tab', 'aria-selected': String(x.id === u.id), class: (x.id === u.id ? 'on' : '') + (laneTouched(x.id) ? ' touched' : ''), onclick: () => ((laneSel = x.id), render()) }, x.label)
          )
        )
      : h('span', { class: 'dlg-label' }, 'Vélocité');
    return h('div', { class: 'arp-vel-wrap' }, tabs, row);
  }
  /** La ligne a-t-elle été modifiée (non vide et pas entièrement neutre) ? */
  function laneTouched(name, arp = track.arp) {
    if (name === 'rhythm') return arp.rhythm.type !== 'all' && !(arp.rhythm.type === 'lane' && arp.lanes.rhythm.every((v) => v));
    const l = arp.lanes[name];
    return l.length > 0 && l.some((v) => v !== A().LANES[name].def);
  }

  const LENGTHS = [
    { id: 1, label: '¼ temps' },
    { id: 2, label: '½ temps' },
    { id: 4, label: '1 temps' },
    { id: 8, label: '2 temps' },
    { id: 16, label: '4 temps' },
  ];

  function stepPanel() {
    if (sel == null) return null;
    const v = stepValues(sel);
    return h(
      'div',
      { class: 'arp-step' },
      h(
        'div',
        { class: 'arp-step-head' },
        h('b', {}, `Pas ${sel + 1}`),
        segmented([{ id: 1, label: 'Joue' }, { id: 0, label: 'Silence' }], v.play ? 1 : 0, (x) => setStep(sel, { play: !!+x }), 'Joue ou silence'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'sd-mini', onclick: () => setStep(null, v) }, 'Appliquer à tous les pas'),
        h('button', { type: 'button', class: 'sd-mini', onclick: () => ((sel = null), render()) }, '×')
      ),
      h(
        'div',
        { class: 'arp-step-grid' + (v.play ? '' : ' dim') },
        slider('Vélocité', Math.round(v.vel * 100), 5, 100, 5, (x) => `${x} %`, (x, push) => setStep(sel, { vel: x / 100 }, { push })),
        h('div', { class: 'arp-field' }, h('span', { class: 'dlg-label' }, 'Longueur'), segmented([{ id: 0, label: 'Comme les autres' }, ...LENGTHS], v.len, (x) => setStep(sel, { len: +x }), 'Longueur')),
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Notes à la fois', SS.helpTip('2 = la note + la note de l’accord juste au-dessus.', 'Notes à la fois')),
          segmented([{ id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }], v.poly, (x) => setStep(sel, { poly: +x }), 'Notes à la fois')
        ),
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Degré', SS.helpTip('décale la note de ce pas d’une ou deux notes de l’accord (et non d’une octave).', 'Degré')),
          segmented([-2, -1, 0, 1, 2].map((d) => ({ id: d, label: d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0' })), v.deg, (x) => setStep(sel, { deg: +x }), 'Degré')
        ),
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Vitesse du pas', SS.helpTip('rafale : ×2 joue les deux notes suivantes de l’arpège dans ce pas.', 'Vitesse du pas')),
          segmented([1, 2, 3, 4].map((d) => ({ id: d, label: `×${d}` })), v.div, (x) => setStep(sel, { div: +x }), 'Vitesse du pas')
        ),
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Ratchet', SS.helpTip('répète la note dans le pas ; voir « Ratchet roulé » pour qu’elle parcoure l’accord.', 'Ratchet')),
          segmented([1, 2, 3, 4].map((d) => ({ id: d, label: String(d) })), v.ratchet, (x) => setStep(sel, { ratchet: +x }), 'Ratchet')
        )
      )
    );
  }

  function styleIcon(motif) {
    const ticks = A().preview({ rate: 1, octaves: 1, seed: 3, ...motif.arp }, [57, 60, 64], 12);
    const ns = ticks.flatMap((t) => (t ? t.notes : []));
    if (!ns.length) return '<svg viewBox="0 0 64 30"></svg>';
    const lo = Math.min(...ns);
    const hi = Math.max(...ns);
    const y = (n) => (26 - ((n - lo) / Math.max(1, hi - lo)) * 22).toFixed(1);
    const pts = [];
    let bars = '';
    ticks.forEach((t, i) => {
      if (!t) return;
      const x = 4 + i * 5.1;
      if (t.notes.length > 1) t.notes.forEach((n) => (bars += `<rect x="${x - 2}" y="${y(n) - 1.3}" width="5" height="2.6" rx="1"/>`));
      else pts.push(`${x},${y(t.notes[0])}`);
    });
    const line = pts.length ? `<polyline points="${pts.join(' ')}"/>` + pts.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="1.8"/>`).join('') : '';
    return `<svg viewBox="0 0 64 30" aria-hidden="true">${line}${bars}</svg>`;
  }

  /** Bouton lecture / stop de la boucle (fenêtre principale et sélecteur de motifs). */
  function loopButton(label) {
    return h(
      'button',
      {
        type: 'button',
        class: 'btn arp-loop' + (loop.on ? ' on' : ''),
        title: loop.on ? 'Arrêter la lecture en boucle' : 'Écouter l’arpège en boucle (les réglages s’entendent tout de suite)',
        onclick: () => (loop.on ? (stopLoop(), render(), picker && picker.open && renderPicker()) : startLoop()),
      },
      loop.on ? '■ Stop' : label
    );
  }

  /** Nom de l'accord joué (après renversement : « C/E »). */
  function chordLabel() {
    const hyp = A().analyzeChord(A().voiced(sourceChord().notes, track.arp))[0];
    return hyp ? hyp.name : '';
  }
  function openAccord() {
    if (level === 'intuitif') level = 'essentiel';
    mod = 'accord';
    render();
  }

  function playerView() {
    const src = sourceChord();
    const has = !!trackChord();
    return h(
      'div',
      { class: 'arp-player' },
      h(
        'div',
        { class: 'arp-player-bar' },
        loopButton('▶ Lire en boucle'),
        host && !test
          ? h('div', { class: 'arp-chordnow arp-hchords', id: 'arpHostChords' }, h('span', { class: 'dlg-label' }, 'Accords de la scène'), host.chords.map((c) => h('span', { class: 'arp-hchord', 'data-a': c.step, 'data-b': c.step + c.len }, c.name)))
          : h(
          'div',
          { class: 'arp-chordnow' },
          h('span', { class: 'dlg-label' }, src.from === 'essai' ? 'Accord d’essai' : 'Accord'),
          h('button', { type: 'button', class: 'arp-chordname', title: 'Choisir l’accord, sa hauteur, les octaves (module Accord)', onclick: openAccord }, chordLabel()),
          h('span', { class: 'arp-chordgo', 'aria-hidden': 'true' }, '›')
        )
      ),
      (() => {
        const info = loopInfo();
        const L = gridLayout();
        return [
          h('div', { class: 'arp-pager' }, h('span', {}, `Boucle : ${info.bars} mesure${info.bars > 1 ? 's' : ''} · ${info.ticks} pas`), L.scroll ? h('small', {}, '↔ la grille défile avec la lecture') : null),
          // grille et lignes de pas défilent ensemble quand les colonnes ne tiennent pas dans la fenêtre
          h('div', { class: 'arp-scroll' + (L.scroll ? ' on' : '') }, gridSvg(track.arp, src.notes), level === 'intuitif' ? null : laneRow()),
        ];
      })(),
      stepPanel(),
      !has ? h('small', { class: 'arp-legend' }, 'La piste est vide : choisis un accord (module Accord), écoute, puis « Poser l’accord sur la piste ».') : null
    );
  }

  // exemple écrit sur La mineur : ′ = une octave plus haut, groupes séparés par « · »
  const GROUP = { cascade: 3, wave: 4, down3: 3, climb2: 2, fall2: 2, up2: 4, down2: 4, up3: 3, alberti: 4, octaves: 2, repeat: 2, up: 3, down: 3, updown: 4, downup: 4, pedal: 2, pedal_top: 2 };
  function example(motif) {
    const mode = motif.arp.mode;
    const ticks = A().preview({ rate: 1, octaves: 1, seed: 3, ...motif.arp }, [57, 60, 64], 8);
    const base = 57;
    const name = (n) => {
      const o = Math.floor((n - base) / 12);
      return SS.NOTE_NAMES_FR[n % 12] + (o > 0 ? '′'.repeat(o) : o < 0 ? '↓'.repeat(-o) : '');
    };
    const g = GROUP[mode];
    return ticks.map((t, i) => (g && i && i % g === 0 ? '· ' : '') + (t ? t.notes.map(name).join('+') : '–')).join(' ');
  }

  const BASE_RATES = [
    { id: 0.25, label: '1/4' },
    { id: 0.5, label: '1/8' },
    { id: 1, label: '1/16' },
    { id: 2, label: '1/32' },
  ];
  const FEEL = [
    { id: 1, label: 'Normale' },
    { id: 1.5, label: 'Triolet' },
    { id: 2 / 3, label: 'Pointée' },
  ];
  function splitRate(r) {
    for (const f of FEEL) for (const b of BASE_RATES) if (Math.abs(b.id * f.id - r) < 1e-6) return { base: b.id, feel: f.id };
    return null;
  }

  // derniers motifs choisis, gardés dans ce navigateur (confort personnel, sans importance si perdu)
  const RECENT_KEY = 'stepseq.arp.recentMotifs';
  let RECENTS = [];
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (Array.isArray(r)) RECENTS = r.filter((id) => typeof id === 'string').slice(0, 8);
  } catch (e) {
    /* stockage indisponible */
  }
  function remember(id) {
    if (!id) return;
    RECENTS = [id, ...RECENTS.filter((x) => x !== id)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(RECENTS));
    } catch (e) {
      /* stockage indisponible */
    }
  }
  function currentMotif() {
    const a = track.arp;
    return SS.motifOf(a) || { id: '', name: 'Motif personnalisé', cat: '', arp: { mode: a.mode, pattern: a.pattern, rhythm: a.rhythm, lanes: { rhythm: a.lanes.rhythm } } };
  }
  function applyMotif(m, opts) {
    set(SS.motifPatch(track.arp, m), opts);
  }

  /** Tuile du motif en cours : un clic ouvre la fenêtre de choix des motifs. */
  function motifTile() {
    const cur = currentMotif();
    return h(
      'button',
      { type: 'button', class: 'arp-motif-tile', title: 'Choisir un autre motif', onclick: openPicker },
      h('span', { class: 'arp-motif-icon', html: styleIcon(cur) }),
      h('span', { class: 'arp-motif-text' }, h('b', {}, cur.name), h('small', {}, example(cur))),
      h('span', { class: 'arp-motif-chev', 'aria-hidden': 'true' }, '›')
    );
  }

  /* ---------- Fenêtre de sélection des motifs ---------- */
  let picker = null;
  const pick = { cat: 'all', q: '', before: null };
  function openPicker() {
    pick.before = clone(track.arp);
    undo.push(clone(track.arp)); // un seul « Défaire » pour tout le passage dans le sélecteur
    pick.q = '';
    pick.cat = currentMotif().cat || 'all';
    if (!picker) {
      picker = h('dialog', { id: 'motifDialog', class: 'sd-dialog motif-dialog' }, h('form', { method: 'dialog' }));
      picker.addEventListener('cancel', (e) => { e.preventDefault(); cancelPicker(); });
      document.body.append(picker);
    }
    renderPicker();
    picker.showModal();
  }
  function cancelPicker() {
    undo.pop();
    track.arp = A().normalize(pick.before);
    ctl().changed();
    picker.close();
    render();
  }
  function renderPicker() {
    const cur = currentMotif();
    const q = pick.q.trim().toLowerCase();
    const match = (m) => !q || (m.name + ' ' + m.tags + ' ' + example(m)).toLowerCase().includes(q);
    const inCat = (m, c) => c === 'all' || (c === 'recent' ? RECENTS.includes(m.id) : m.cat === c);
    const cats = [{ id: 'recent', label: '★ Récents' }, { id: 'all', label: 'Tous les motifs' }, ...SS.MOTIF_CATS];
    const list = SS.MOTIFS.filter((m) => match(m) && inCat(m, q ? 'all' : pick.cat));
    const groups = (q || pick.cat === 'all') ? SS.MOTIF_CATS.map((c) => ({ c, items: list.filter((m) => m.cat === c.id) })).filter((g) => g.items.length) : [{ c: null, items: pick.cat === 'recent' ? RECENTS.map((id) => list.find((m) => m.id === id)).filter(Boolean) : list }];
    const tile = (m) => h('button', { type: 'button', class: 'arp-style' + (m.id === cur.id ? ' active' : ''), onclick: () => { applyMotif(m, { push: false }); renderPicker(); } },
      h('span', { html: styleIcon(m) }), h('span', { class: 'arp-style-name' }, m.name), h('small', { class: 'arp-style-ex' }, example(m)));
    const form = picker.querySelector('form');
    const search = h('input', { type: 'search', class: 'motif-search', placeholder: 'Rechercher : octave, basse, montée, synthwave…', value: pick.q });
    search.addEventListener('input', () => { pick.q = search.value; renderPicker(); const s2 = picker.querySelector('.motif-search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); });
    form.replaceChildren(
      h('div', { class: 'motif-head' }, h('h2', {}, 'Choisir un motif'), search),
      h('div', { class: 'motif-body' },
        h('nav', { class: 'motif-cats' }, cats.map((c) => {
          const n = c.id === 'recent' ? RECENTS.length : SS.MOTIFS.filter((m) => inCat(m, c.id)).length;
          return h('button', { type: 'button', class: 'motif-cat' + (!q && pick.cat === c.id ? ' active' : ''), onclick: () => { pick.cat = c.id; pick.q = ''; renderPicker(); } }, h('span', {}, c.label), h('small', {}, String(n)));
        })),
        h('div', { class: 'motif-list' },
          groups.length ? groups.map((g) => h('section', { class: 'motif-group' }, g.c ? h('h3', {}, g.c.label) : null, h('div', { class: 'arp-styles' }, g.items.map(tile))))
            : h('p', { class: 'arp-help' }, 'Aucun motif ne correspond.'))
      ),
      h('div', { class: 'dlg-footer motif-foot' },
        h('span', { class: 'motif-now' }, h('span', { html: styleIcon(cur) }), h('span', {}, h('b', {}, cur.name), h('small', {}, example(cur)))),
        h('span', { class: 'spacer' }),
        loopButton('▶ Écouter'),
        h('button', { type: 'button', class: 'btn', onclick: cancelPicker }, 'Annuler'),
        h('button', { type: 'button', class: 'btn btn-accent', onclick: () => { remember(currentMotif().id); picker.close(); render(); } }, 'Choisir'))
    );
  }

  /* ---------- Geste : étalement, alternance, microvariation, accent, articulation (moteur : SS.Arp.gesteTimes) ---------- */
  let gesteOpen = false; // module Geste : réglage fin affiché
  let gesteCompare = 'geste'; // écoute : 'geste' ou 'regulier' (le même arpège, sans geste)
  const MECA = () => A().GESTES[0];
  const gesteOf = () => track.arp.geste || A().normGeste({ id: MECA().id, ...MECA().g });
  const groupAuto = () => A().gesteGroup({ ...track.arp, geste: { ...gesteOf(), group: 0 } });
  const groupSize = () => gesteOf().group || groupAuto();
  function setGeste(patch, opts) {
    set({ geste: { ...gesteOf(), ...patch } }, opts);
  }
  /** Change le geste sans reconstruire la fenêtre (pendant un glissé) ; on rafraîchit le zoom seulement. */
  function setGesteLive(patch) {
    track.arp = A().normalize({ ...track.arp, geste: { ...gesteOf(), ...patch }, preset: '' });
    ctl().changed();
    const z = dlg.querySelector('.geste-zoom-svg');
    if (z) z.innerHTML = gesteSvg(gesteOf(), groupSize(), stepMs(), true);
  }
  const stepMs = () => 60000 / ctl().project().tempo / 4 / track.arp.rate; // durée d'un pas d'arpège
  const oddNotes = (n) => (n === 2 ? 'la note 2' : n === 3 ? 'la note 2' : 'les notes 2, 4' + (n > 4 ? '…' : ''));

  /** Dessin d'un groupe : grille en pointillés, attaques, durées, force (opacité), respiration en jaune. */
  function gesteSvg(g, n, sub, big) {
    const r = A().gesteTimes(g, n, sub, 0);
    const W = big ? 560 : 120, H = big ? 150 : 22, L = big ? 10 : 2, R = big ? 10 : 2;
    const x = (ms) => L + (ms / (r.groupMs * 1.05)) * (W - L - R);
    const y = (k) => (big ? 20 : 3) + (1 - k / Math.max(1, n - 1)) * (H - (big ? 48 : 8));
    let s = '';
    if (big) {
      for (let i = 0; i <= n; i++) s += `<line class="${i === n ? 'g-next' : 'g-grid'}" x1="${x(i * sub)}" x2="${x(i * sub)}" y1="10" y2="${H - 24}"/>`;
      s += `<rect class="g-breath" x="${x(r.at[n - 1])}" y="10" width="${x(r.groupMs) - x(r.at[n - 1])}" height="${H - 34}"/>`;
      s += `<text class="g-breath-t" x="${(x(r.at[n - 1]) + x(r.groupMs)) / 2}" y="${H - 10}">respiration ${Math.round(r.groupMs - r.at[n - 1])} ms</text>`;
      s += `<text class="g-t" x="${x(0)}" y="${H - 10}">0</text><text class="g-t" x="${x(r.groupMs)}" y="${H - 10}" text-anchor="end">groupe suivant</text>`;
    } else s += `<line class="g-next" x1="${x(r.groupMs)}" x2="${x(r.groupMs)}" y1="0" y2="${H}"/>`;
    r.at.forEach((ms, k) => {
      if (big) s += `<rect class="g-ghost" x="${x(k * sub)}" y="${y(k) - 4}" width="${x(sub * 0.9) - x(0)}" height="8" rx="2"/>`;
      s += `<rect class="g-note${k === 0 ? ' first' : ''}" x="${x(ms)}" y="${y(k) - (big ? 5 : 1.5)}" width="${Math.max(2, x(ms + r.dur[k]) - x(ms))}" height="${big ? 10 : 3}" rx="${big ? 3 : 1}" style="opacity:${Math.min(1, 0.35 + 0.5 * r.vel[k]).toFixed(2)}"/>`;
      if (big) s += `<text class="g-n" x="${x(ms) + 2}" y="${y(k) - 8}">${k + 1}</text>`;
    });
    return `<svg class="${big ? 'g-big' : 'g-mini'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Geste d’un groupe de ${n} notes">${s}</svg>`;
  }

  function gesteChips(small) {
    const g = gesteOf();
    return h(
      'div',
      { class: 'geste-chips' + (small ? ' small' : ''), role: 'radiogroup', 'aria-label': 'Geste' },
      A().GESTES.map((x) =>
        h(
          'button',
          { type: 'button', role: 'radio', 'aria-checked': String(g.id === x.id), class: 'geste-chip' + (g.id === x.id ? ' on' : ''), title: x.desc, onclick: () => setGeste({ id: x.id, ...x.g }) },
          h('span', { html: gesteSvg(x.g, 4, 125, false) }),
          h('b', {}, x.label)
        )
      )
    );
  }

  /** Pavé tactile : horizontal = étalement (serré → grille), vertical = alternance (en avance ↑, en retard ↓). */
  function gestePad() {
    const g = gesteOf();
    const dot = h('span', { class: 'dot', style: `left:${((g.spread - 0.1) / 0.9) * 100}%;top:${50 + (g.alt / 0.25) * 50}%` });
    const pad = h(
      'div',
      { class: 'geste-pad', role: 'slider', 'aria-label': 'Étalement et alternance', tabindex: '0' },
      h('span', { class: 'cross', style: 'left:0;right:0;top:50%;height:1px' }),
      dot,
      h('span', { class: 'ax', style: 'left:8px;top:6px' }, '↑ ' + oddNotes(groupSize()) + ' en avance'),
      h('span', { class: 'ax', style: 'left:8px;top:calc(50% + 4px)' }, 'régulier'),
      h('span', { class: 'ax', style: 'left:8px;bottom:6px' }, 'serré'),
      h('span', { class: 'ax', style: 'right:8px;bottom:6px' }, 'grille'),
      h('span', { class: 'ax', style: 'right:8px;bottom:22px;text-align:right' }, 'en retard ↓')
    );
    let drag = false;
    const apply = (e) => {
      const r = pad.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      const spread = Math.round((0.1 + 0.9 * fx) * 100) / 100;
      let alt = Math.round((fy - 0.5) * 2 * 0.25 * 100) / 100;
      if (Math.abs(alt) < 0.015) alt = 0; // aimant sur « régulier »
      dot.style.left = `${((spread - 0.1) / 0.9) * 100}%`;
      dot.style.top = `${50 + (alt / 0.25) * 50}%`;
      setGesteLive({ id: '', spread, alt });
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      undo.push(clone(track.arp));
      drag = true;
      sliding = true;
      apply(e);
    });
    pad.addEventListener('pointermove', (e) => drag && apply(e));
    const end = () => {
      if (!drag) return;
      drag = false;
      sliding = false;
      render();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
      if (!d) return;
      e.preventDefault();
      setGeste({ id: '', spread: g.spread + d[0], alt: Math.round((g.alt + d[1]) * 100) / 100 });
      dlg.querySelector('.geste-pad').focus();
    });
    return pad;
  }

  /** Un des 5 curseurs numérotés (dans l'ordre d'application). */
  function gesteSlider(i, name, fmt, lo, hi, v, help, scale, toPatch) {
    const out = h('output', {}, fmt(v));
    const input = h('input', { type: 'range', min: lo, max: hi, value: v, 'aria-label': name });
    let pushed = false;
    input.addEventListener('input', () => {
      sliding = true;
      if (!pushed) undo.push(clone(track.arp));
      pushed = true;
      out.textContent = fmt(+input.value);
      setGesteLive({ id: '', ...toPatch(+input.value) });
    });
    input.addEventListener('change', () => {
      pushed = false;
      sliding = false;
      render();
    });
    return h('div', { class: 'geste-row', title: help }, h('span', { class: 'geste-num' }, String(i)), h('b', {}, name), out, input, h('div', { class: 'arp-scale' }, scale.map((t) => h('span', {}, t))));
  }

  /** Onglet Geste. */
  function gesteTab() {
    const g = gesteOf();
    const n = groupSize();
    const sub = stepMs();
    const preset = A().GESTES.find((x) => x.id === g.id);
    return h(
      'div',
      { class: 'geste-tab' },
      h(
        'div',
        { class: 'geste-tab-head' },
        h('small', { class: 'arp-help' }, (preset ? `${preset.label} — ${preset.desc}` : 'Personnalisé') + ` · groupes de ${n} notes`, SS.helpTip('Pavé : glisser horizontalement pour l’étalement (serré → grille), verticalement pour l’alternance (notes paires en avance ↑ ou en retard ↓). Les curseurs 1 à 5 suivent l’ordre d’application.', 'Réglage fin du geste')),
        h('span', { class: 'spacer' }),
        h('span', { class: 'dlg-label' }, 'Écouter'),
        segmented(
          [
            { id: 'regulier', label: 'Régulier', hint: 'le même arpège, sans geste' },
            { id: 'geste', label: 'Geste' },
          ],
          gesteCompare,
          (v) => ((gesteCompare = v), render()),
          'Comparer'
        )
      ),
      gesteChips(true),
      h(
        'div',
        { class: 'geste-detail' },
        h('div', { class: 'geste-pad-col' }, gestePad()),
        h(
          'div',
          { class: 'geste-zoom' },
          h(
            'div',
            { class: 'geste-zoom-head' },
            h('span', { class: 'dlg-label' }, `Zoom sur un groupe · ${ctl().project().tempo} BPM`),
            h('span', { class: 'spacer' }),
            h('span', { class: 'dlg-label' }, 'Groupes de'),
            segmented([{ id: 0, label: `Auto (${groupAuto()})` }, ...A().GROUP_SIZES.map((k) => ({ id: k, label: String(k) }))], g.group || 0, (v) => setGeste({ group: +v }), 'Taille des groupes')
          ),
          h('div', { class: 'geste-zoom-svg', html: gesteSvg(g, n, sub, true) }),
          h(
            'div',
            { class: 'ab' },
            h('small', { class: 'arp-help' }, SS.helpTip('Pointillés : la grille · jaune : respiration avant le groupe suivant.', 'Zoom sur un groupe')),
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn small', title: 'Tirer d’autres petits décalages', onclick: () => setGeste({ take: g.take + 1 }) }, `Nouvelle prise ↻ (prise ${g.take})`)
          )
        )
      ),
      h(
        'div',
        { class: 'geste-rows five' },
        gesteSlider(1, 'Étalement', (v) => `${Math.round((v / 100) * sub * (n - 1))} ms`, 10, 100, Math.round(g.spread * 100), 'De la 1re à la dernière attaque du groupe. Le groupe suivant ne bouge pas.', ['serré', 'grille'], (v) => ({ spread: v / 100 })),
        gesteSlider(2, 'Alternance', (v) => `${v >= 0 ? '+' : ''}${Math.round((v / 100) * sub)} ms`, -25, 25, Math.round(g.alt * 100), `Avance (−) ou retarde (+) ${oddNotes(n)}. Ce n’est pas un swing.`, ['en avance', 'en retard'], (v) => ({ alt: v / 100 })),
        gesteSlider(3, 'Microvariation', (v) => (v ? `± ${v} ms` : 'aucune'), 0, 20, g.micro, 'Petits décalages ; la note 1 reste sur la pulsation. Toujours les mêmes pour une prise.', ['aucune', '± 20 ms'], (v) => ({ micro: v })),
        gesteSlider(4, 'Accent', (v) => (v ? `1re note +${Math.round(v * 0.25)} %` : 'égal'), 0, 100, Math.round(g.accent * 100), 'Renforce la 1re note du geste, atténue les autres (vélocité : l’effet dépend du son).', ['égal', 'marqué'], (v) => ({ accent: v / 100 })),
        gesteSlider(5, 'Articulation', (v) => (g.legato ? 'lié' : `${v} % de l’espace`), 20, 100, Math.round(g.art * 100), 'Durée de chaque note dans l’espace avant l’attaque suivante.', ['piqué', 'lié'], (v) => ({ art: v / 100, legato: false }))
      )
    );
  }

  /** Une ligne du formulaire : nom à gauche, réglage à droite. */
  // les aides (help(…)) passent dans un « ? » à droite du libellé (js/help.js)
  const formRow = (label, ...ctrl) => {
    const flat = ctrl.flat(Infinity);
    const tips = flat.filter((x) => x && x.__help).map((x) => x.__help);
    return h(
      'div',
      { class: 'arp-frow' },
      h('span', { class: 'arp-flabel' }, label, tips.length ? SS.helpTip(tips.join(' '), label) : null),
      h('div', { class: 'arp-fctrl' }, ...flat.filter((x) => !(x && x.__help)))
    );
  };

  /** Sens de lecture commun à toutes les lignes (« fwd » si aucun, '' si les lignes ont des sens différents). */
  function laneDirAll(arp) {
    const vals = ['rhythm', ...Object.keys(A().LANES)].map((k) => arp.laneDir[k] || 'fwd');
    return vals.every((v) => v === vals[0]) ? vals[0] : '';
  }

  /* ---------- Modules : chaque famille de réglages, avec un voyant (actif ou non) et un résumé ---------- */

  // niveau d'affichage : 'essentiel' (moins de modules, la ligne Vélocité seule) ou 'avance' (tout) — retenu dans ce navigateur
  const LEVEL_KEY = 'stepseq.arp.level';
  let level = 'essentiel';
  try {
    const lv = localStorage.getItem(LEVEL_KEY);
    if (lv === 'avance' || lv === 'intuitif') level = lv;
  } catch (e) {
    /* stockage indisponible */
  }
  function setLevel(v) {
    if (host) {
      // fenêtre de l'assistant : le niveau choisi ne change pas celui de la Grille
      if (!hostLevel) hostLevel = level;
      level = v;
      if (v !== 'avance') laneSel = 'vel';
      return render();
    }
    level = v;
    if (v !== 'avance') laneSel = 'vel';
    try {
      localStorage.setItem(LEVEL_KEY, v);
    } catch (e) {
      /* stockage indisponible */
    }
    render();
  }
  let mod = 'motif'; // module affiché
  // « Surprends-moi » : verrous retenus dans ce navigateur ; prises de la séance (pour revenir à une prise)
  const LOCK_KEY = 'stepseq.arp.locks';
  let locks = { rythme: true };
  try {
    const l = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    if (l && typeof l === 'object') locks = { motif: !!l.motif, rythme: !!l.rythme, accord: !!l.accord, effets: !!l.effets };
  } catch (e) {
    /* stockage indisponible */
  }
  let takes = [];
  let takeIdx = -1;
  const LOCKS = [
    { id: 'motif', label: 'le motif', short: 'motif' },
    { id: 'rythme', label: 'le rythme', short: 'rythme' },
    { id: 'accord', label: 'l’accord', short: 'accord' },
    { id: 'effets', label: 'les effets', short: 'effets' },
  ];
  const LOCK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  function surprise() {
    if (!takes.length) takes = [clone(track.arp)]; // prise 1 : l'arpège de départ
    const next = SS.arpSurprise(track.arp, locks);
    takes = [...takes.slice(0, takeIdx < 0 ? takes.length : takeIdx + 1), clone(next)].slice(-20);
    takeIdx = takes.length - 1;
    replaceArp(next);
  }
  /** Remplace tout le réglage (une prise est complète : un geste absent doit le rester). */
  function replaceArp(a) {
    undo.push(clone(track.arp));
    track.arp = A().normalize(clone(a));
    ctl().changed();
    render();
  }
  function goTake(d) {
    const i = Math.max(0, Math.min(takes.length - 1, takeIdx + d));
    if (i === takeIdx) return;
    takeIdx = i;
    replaceArp(takes[i]);
  }
  /** « Surprends-moi » : bouton, verrous et prises, sur une ligne. */
  function surprisePanel() {
    return h(
      'div',
      { class: 'arp-surp' },
      h('button', { type: 'button', class: 'btn arp-surprise', title: 'Un nouvel arpège tiré au hasard, en gardant ce qui est verrouillé', onclick: surprise }, 'Surprends-moi'),
      h(
        'span',
        { class: 'arp-locks', role: 'group', 'aria-label': 'Garder' },
        h('small', {}, 'garder :'),
        LOCKS.map((l) =>
          h(
            'button',
            {
              type: 'button',
              class: 'chip arp-lock' + (locks[l.id] ? ' active' : ''),
              'aria-pressed': String(!!locks[l.id]),
              title: locks[l.id] ? `${l.label} reste tel quel` : `${l.label} peut changer`,
              onclick: () => {
                locks = { ...locks, [l.id]: !locks[l.id] };
                try {
                  localStorage.setItem(LOCK_KEY, JSON.stringify(locks));
                } catch (e) {
                  /* stockage indisponible */
                }
                render();
              },
            },
            l.short
          )
        )
      ),
      h('span', { class: 'spacer' }),
      takes.length > 1
        ? h(
            'span',
            { class: 'arp-takes', title: takeIdx === 0 ? 'l’arpège de départ' : `prise ${takeIdx + 1}` },
            h('button', { type: 'button', class: 'sd-mini', 'aria-label': 'Prise précédente', disabled: takeIdx <= 0, onclick: () => goTake(-1) }, '‹'),
            h('span', {}, `${takeIdx + 1}/${takes.length}`),
            h('button', { type: 'button', class: 'sd-mini', 'aria-label': 'Prise suivante', disabled: takeIdx >= takes.length - 1, onclick: () => goTake(1) }, '›')
          )
        : null
    );
  }
  /** Motif précédent, tuile du motif, motif suivant. */
  function motifLine() {
    return h(
      'div',
      { class: 'arp-motif-line' },
      h('button', { type: 'button', class: 'btn arp-motif-prev', 'aria-label': 'Motif précédent', title: 'Motif précédent', onclick: () => applyMotif(SS.motifStep(track.arp, -1)) }, '‹'),
      motifTile(),
      h('button', { type: 'button', class: 'btn arp-motif-next', 'aria-label': 'Motif suivant', title: 'Motif suivant', onclick: () => applyMotif(SS.motifStep(track.arp, 1)) }, '›')
    );
  }

  /* ---------- Mode Intuitif : 4 boutons rotatifs (moteur : SS.Arp.macroPatch / macroValue) ---------- */
  function knob(mc) {
    const val = () => A().macroValue(track.arp, mc.id);
    let v = val();
    const ring = h('div', { class: 'arp-knob-ring' }, h('div', { class: 'arp-knob-cap' }, h('b', {}, String(v))));
    const now = h('span', { class: 'arp-knob-now' }, A().macroText(track.arp, mc.id));
    const dial = h('div', { class: 'arp-knob-dial', role: 'slider', tabindex: '0', 'aria-label': mc.label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v), 'aria-valuetext': now.textContent }, ring);
    const paint = () => {
      ring.style.setProperty('--p', `${v}%`);
      ring.querySelector('b').textContent = String(v);
      now.textContent = A().macroText(track.arp, mc.id);
      dial.setAttribute('aria-valuenow', String(v));
      dial.setAttribute('aria-valuetext', now.textContent);
    };
    const apply = (x) => {
      v = Math.max(0, Math.min(100, Math.round(x)));
      track.arp = A().normalize({ ...track.arp, ...A().macroPatch(track.arp, mc.id, v), macros: { ...track.arp.macros, [mc.id]: v }, preset: '' });
      ctl().changed();
      paint();
    };
    let drag = null;
    dial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dial.setPointerCapture(e.pointerId);
      undo.push(clone(track.arp));
      drag = { y: e.clientY, v };
      sliding = true;
    });
    dial.addEventListener('pointermove', (e) => drag && apply(drag.v + (drag.y - e.clientY) * 0.6));
    const end = () => {
      if (!drag) return;
      drag = null;
      sliding = false;
      render();
    };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    dial.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 20, PageDown: -20 }[e.key];
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : d != null ? v + d : null;
      if (to == null) return;
      e.preventDefault();
      undo.push(clone(track.arp));
      apply(to);
      render();
      const again = dlg.querySelector(`.arp-knob[data-k="${mc.id}"] .arp-knob-dial`);
      if (again) again.focus();
    });
    paint();
    return h('div', { class: 'arp-knob', 'data-k': mc.id }, dial, h('b', { class: 'arp-knob-name' }, mc.label, SS.helpTip(`${mc.what[0].toUpperCase()}${mc.what.slice(1)}. Glisser vers le haut ou le bas (ou flèches du clavier). Le bouton remplace les réglages fins qu’il pilote ; « Défaire » revient en arrière.`, mc.label)), now);
  }

  function intuitiveView() {
    return h(
      'div',
      { class: 'arp-intuitif' },
      h('div', { class: 'arp-motif-row' }, motifLine(), surprisePanel()),
      h('div', { class: 'arp-knobs' }, A().MACROS.map(knob))
    );
  }

  const memo = {}; // réglages d'un module éteint, pour le rallumer tel qu'il était (le temps de la fenêtre)

  const ALL_LANES = () => ['rhythm', ...Object.keys(A().LANES)];
  const label = (list, id) => (list.find((x) => x.id === id) || {}).label || '';
  const MODULES = [
    {
      id: 'motif', name: 'Motif', basic: true,
      sum: () => currentMotif().name,
    },
    {
      id: 'rythme', name: 'Rythme', basic: true,
      sum: (a) => `${A().rateLabel(a.rate)} · ${a.steps} pas` + (a.noteLen > 0 ? ` · notes de ${label(LENGTHS, a.noteLen)}` : ''),
    },
    {
      id: 'accord', name: 'Accord', basic: true,
      sum: (a) =>
        [
          chordLabel(),
          a.register !== 'asis' ? `C${a.register}` : '',
          `${a.octaves} oct.`,
          a.inversion !== 'asis' ? (A().INVERSIONS.find((x) => x.id === a.inversion) || {}).short : '',
          a.voicing !== 'close' ? label(A().VOICINGS, a.voicing).toLowerCase() : '',
        ]
          .filter(Boolean)
          .join(' · '),
    },
    {
      id: 'pas', name: 'Pas à pas',
      on: (a) => ALL_LANES().some((k) => laneTouched(k, a)),
      keys: ['lanes', 'rhythm', 'laneDir'], off: { lanes: {}, rhythm: { type: 'all' }, laneDir: {} },
      sum: (a) => {
        const t = LANE_UI.filter((x) => laneTouched(x.id, a)).map((x) => x.label);
        return t.length ? t.join(', ') : 'aucune ligne modifiée';
      },
    },
    {
      id: 'geste', name: 'Geste', basic: true,
      on: (a) => !!a.geste,
      keys: ['geste'], off: { geste: undefined }, def: () => ({ geste: { id: 'detendu', ...A().GESTES.find((x) => x.id === 'detendu').g } }),
      sum: (a) => (a.geste ? label(A().GESTES, a.geste.id) || 'personnalisé' : 'régulier'),
    },
    {
      id: 'echo', name: 'Écho', basic: true,
      on: (a) => a.echo.n > 0,
      keys: ['echo'], off: (a) => ({ echo: { ...a.echo, n: 0 } }), def: (a) => ({ echo: { ...a.echo, n: 2 } }),
      sum: (a) => (a.echo.n ? `${a.echo.n} × ${label(A().ECHO_SHIFTS, a.echo.shift).toLowerCase()}` : 'éteint'),
    },
    {
      id: 'roll', name: 'Ratchet roulé',
      on: (a) => a.roll !== 'none',
      keys: ['roll'], off: { roll: 'none' }, def: { roll: 'up' },
      sum: (a) => (a.roll !== 'none' ? label(A().ROLLS, a.roll) : 'éteint'),
    },
    {
      id: 'evol', name: 'Évolution',
      on: (a) => a.evolve > 0 || a.motion > 0 || a.harmony !== 'chord' || a.swing > 0.5,
      keys: ['evolve', 'motion', 'harmony', 'swing'], off: { evolve: 0, motion: 0, harmony: 'chord', swing: 0.5 }, def: { evolve: 0.4 },
      sum: (a) => {
        const t = [];
        if (a.evolve > 0) t.push(`variations ${Math.round(a.evolve * 100)} %`);
        if (a.motion > 0) t.push(`mouvement ${Math.round(a.motion * 100)} %`);
        if (a.harmony !== 'chord') t.push(label(A().HARMONY, a.harmony).toLowerCase());
        if (a.swing > 0.5) t.push('swing');
        return t.length ? t.join(' · ') : 'éteint';
      },
    },
  ];
  const visibleModules = () => MODULES.filter((m) => level === 'avance' || m.basic || (m.on && m.on(track.arp)) || m.id === mod);

  function toggleModule(m) {
    const a = track.arp;
    if (m.on(a)) {
      memo[m.id] = clone(Object.fromEntries(m.keys.map((k) => [k, a[k]])));
      set(typeof m.off === 'function' ? m.off(a) : { ...m.off }); // copie simple : « geste: undefined » doit rester
    } else {
      const back = memo[m.id] && m.keys.some((k) => JSON.stringify(memo[m.id][k]) !== JSON.stringify((typeof m.off === 'function' ? m.off(a) : m.off)[k]));
      if (back) set(clone(memo[m.id]));
      else if (m.def) set(typeof m.def === 'function' ? m.def(a) : clone(m.def));
      // sans réglage à rallumer (Pas à pas jamais modifié) : on ouvre simplement le module
    }
    mod = m.id;
    render();
  }

  function modulesNav() {
    const a = track.arp;
    return h(
      'nav',
      { class: 'arp-modnav', 'aria-label': 'Modules de l’arpégiateur' },
      visibleModules().map((m) => {
        const on = m.on ? m.on(a) : true;
        return h(
          'div',
          { class: 'arp-mod' + (mod === m.id ? ' active' : '') + (on ? ' on' : '') },
          m.on
            ? h('button', { type: 'button', class: 'arp-led', 'aria-pressed': String(on), 'aria-label': `${on ? 'Éteindre' : 'Allumer'} : ${m.name}`, title: on ? 'Éteindre' : 'Allumer', onclick: () => toggleModule(m) })
            : h('span', { class: 'arp-led fixed', 'aria-hidden': 'true' }),
          h('button', { type: 'button', class: 'arp-mod-btn', 'aria-current': mod === m.id ? 'true' : null, onclick: () => ((mod = m.id), render()) }, h('b', {}, m.name), h('small', {}, m.sum(a)))
        );
      })
    );
  }

  /*
   * Motif écrit à la main (mode « Motif relatif personnalisé » du moteur, syntaxe de SS.Arp.parsePattern) :
   * le mode générique d'Arp One, avec lequel on reproduit n'importe quel arpège qui suit les accords.
   */
  const PATTERN_HELP =
    'Une note par pas, séparées par des espaces. 0 1 2 3… : les notes de l’accord du grave à l’aigu (au-delà, on remonte d’une octave) ; ' +
    'd1 d3 d5 d7 d9 : fondamentale, tierce, quinte, septième, neuvième ; + ou − après : une octave plus haut ou plus bas (0+, d5-) ; ' +
    '. : silence ; _ : la note précédente continue ; | : un motif par accord (« 0 1 2 | 0 2 1 » : 1er accord, 2e accord, puis on recommence). Avec les numéros (0 1 2…) et le renversement « Proche » (module Accord), ' +
    'les notes communes à deux accords restent à la même hauteur.';
  const PATTERN_EXAMPLES = [
    { p: 'd1 d3 d5 d7 d5 d3 d5 d3', hint: 'A03 : arpège huit pas, pool 1-3-5-7 redéfini à chaque accord (l’octave sans septième)' },
    { p: '0 1 2 3 2 1 2 1', hint: 'aller-retour de 8 notes' },
    { p: '0 2 1 2 3 2 1 2', hint: 'broderie autour de la note du milieu' },
    { p: '0- 0 1 2 0- 0 1 2', hint: 'basse grave puis l’accord' },
    { p: 'd1 d5 d1+ d3+ d5+ d3+ d1+ d5', hint: 'arche sur deux octaves' },
  ];
  function patternEditor(arp) {
    const cur = arp.mode === 'pattern' ? arp.pattern : '';
    const apply = (v) => {
      v = v.trim().replace(/\s*\|\s*/g, ' | ').replace(/\s+/g, ' ');
      if (v) set({ mode: 'pattern', pattern: v });
    };
    const input = h('input', {
      type: 'text', class: 'arp-pattern', value: cur, spellcheck: 'false', autocomplete: 'off',
      placeholder: 'ex. 0 1 2 3 2 1 2 1', 'aria-label': 'Motif écrit, une note par pas',
      onchange: (e) => apply(e.target.value),
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(e.target.value); } },
    });
    // ce que donne le motif sur l'accord en cours (un cycle) ; les jetons non compris sont signalés
    let out = null;
    if (cur) {
      const parts = A().patternParts(cur);
      const bad = parts.flatMap((p) => A().parsePattern(p).filter((t) => t.bad).map((t) => t.bad));
      const seqOf = (p) => {
        const toks = A().parsePattern(p);
        const ticks = A().preview({ ...arp, pattern: p, evolve: 0, harmony: 'chord', echo: { n: 0 }, rhythm: { type: 'all' }, lanes: {} }, sourceChord().notes, toks.length);
        return ticks.map((t, k) => (toks[k] && toks[k].tie ? '—' : t ? t.notes.map(A().noteName).join('+') : '·')).join(' ');
      };
      const txt = parts.length > 1 ? parts.map((p, i) => `accord ${i + 1} : ${seqOf(p)}`).join(' · ') : `Sur l’accord : ${seqOf(parts[0] || '')}`;
      out = h('small', { class: 'arp-pattern-out' }, txt, bad.length ? h('b', { class: 'arp-pattern-bad' }, ` · non compris : ${bad.join(' ')}`) : null);
    }
    const ex = h('div', { class: 'arp-pattern-ex' }, PATTERN_EXAMPLES.map((x) => h('button', { type: 'button', class: 'btn small', title: x.hint, onclick: () => set({ mode: 'pattern', pattern: x.p }) }, x.p)));
    return [input, out, ex];
  }

  const adv = () => level === 'avance';
  const help = (t) => ({ __help: t }); // aide d'une ligne : affichée par le « ? » de formRow

  function modulePane() {
    const arp = track.arp;
    const rs = splitRate(arp.rate);
    const m = MODULES.find((x) => x.id === mod) || MODULES[0];
    const paneTip = m.id === 'pas' ? (adv() ? 'Choisis une ligne sous la grille, puis dessine-la en glissant. Chaque ligne a sa propre longueur : avec des longueurs différentes, le motif ne se répète pas pareil (polymétrie).' : 'Glisse sur la rangée sous la grille pour régler la vélocité de chaque pas ; le mode Avancé donne toutes les lignes (degré, vitesse, ratchet…).') : null;
    const head = h('div', { class: 'arp-pane-head' }, h('h3', {}, m.name, paneTip ? SS.helpTip(paneTip, m.name) : null), m.on && !m.on(arp) && (m.def || memo[m.id]) ? h('button', { type: 'button', class: 'btn small', onclick: () => toggleModule(m) }, 'Allumer') : null);
    let rows = [];
    if (m.id === 'motif') {
      rows = [
        formRow('Motif', motifLine()),
        formRow('Écrire un motif', patternEditor(arp), help(PATTERN_HELP)),
        formRow('Hasard', surprisePanel()),
      ];
    } else if (m.id === 'rythme') {
      rows = [
        formRow(
          'Vitesse',
          segmented(BASE_RATES, rs ? rs.base : '', (v) => set({ rate: +v * (rs ? rs.feel : 1) }), 'Vitesse'),
          segmented(FEEL, rs ? rs.feel : '', (v) => set({ rate: (rs ? rs.base : 1) * +v }), 'Triolet ou pointée')
        ),
        formRow('Pas', segmented([4, 8, 16].map((n) => ({ id: n, label: String(n) })), arp.steps, (v) => set({ steps: +v, lanes: sizedLanes(arp, +v) }), 'Nombre de pas du motif'), help('longueur du motif réglable pas à pas')),
        formRow('Durée des notes', segmented([{ id: 'geste', label: arp.geste ? 'Selon le geste' : 'Selon la vitesse' }, ...LENGTHS], arp.noteLen > 0 ? arp.noteLen : 'geste', (v) => set(v === 'geste' ? { noteLen: 0 } : { noteLen: +v }), 'Durée des notes')),
      ];
    } else if (m.id === 'accord') {
      const invs = A().INVERSIONS.filter((x) => adv() || !['3', 'cycle'].includes(String(x.id)) || x.id === arp.inversion);
      const has = !!trackChord();
      const cur = test || { root: 9, type: 'min' };
      const tryChord = () => {
        if (test) return;
        const hyp = A().analyzeChord(sourceChord().notes)[0];
        const ok = hyp && SS.CHORDS.some((c) => c.id === hyp.type);
        test = ok ? { root: hyp.root, type: hyp.type } : { root: 9, type: 'min' };
        render();
      };
      rows = [
        formRow(
          'Accord joué',
          h(
            'div',
            { class: 'arp-chordpick' },
            segmented(
              [
                { id: 'acc', label: 'Piste Accords', hint: 'les accords de la scène : l’arpège change avec chaque accord (bouton ACCORDS de la piste)' },
                { id: 'piste', label: 'Notes de la piste', hint: 'les notes posées dans le piano roll, arpégées quand elles sont tenues ensemble' },
                { id: 'essai', label: 'Essai', hint: 'un accord pour écouter, à poser ensuite sur la piste' },
              ],
              test ? 'essai' : SS.follows(track) ? 'acc' : has ? 'piste' : 'essai',
              (v) => (v === 'acc' ? setSource(true) : v === 'piste' ? setSource(false) : tryChord()),
              'Source des accords'
            ),
            test || !has
              ? [
                  h('select', { 'aria-label': 'Note fondamentale', onchange: (e) => ((test = { root: +e.target.value, type: cur.type }), render()) }, NOTES_FR.map((n, k) => h('option', { value: k, selected: cur.root === k }, `${n} (${NOTES[k]})`))),
                  h('select', { 'aria-label': 'Type d’accord', onchange: (e) => ((test = { root: cur.root, type: e.target.value }), render()) }, SS.CHORDS.map((c) => h('option', { value: c.id, selected: cur.type === c.id }, c.label))),
                ]
              : null
          ),
          help(
            test || !has
              ? SS.follows(track)
                ? 'La scène n’a pas encore d’accords : posez-les dans la piste Accords, en haut des pistes.'
                : '« Poser l’accord sur la piste » (en bas) remplace les notes de la piste par cet accord.'
              : SS.follows(track)
              ? 'les accords de la piste Accords de la scène ; « Essai » pour écouter un autre accord'
              : 'les notes posées sur la piste ; « Essai » pour écouter un autre accord'
          )
        ),
        formRow('Hauteur', segmented(A().REGISTERS.map((x) => ({ id: x.id, label: x.label, hint: x.hint })), arp.register, (v) => set({ register: v }), 'Hauteur de l’accord'), help('l’octave où commence l’accord (sa note la plus grave), quelle que soit la hauteur des accords posés')),
        formRow('Octaves', segmented([1, 2, 3, 4].map((o) => ({ id: o, label: String(o) })), arp.octaves, (v) => set({ octaves: +v }), 'Octaves'), help('sur combien d’octaves l’arpège monte')),
        formRow('Renversement', segmented(invs.map((x) => ({ id: x.id, label: x.short, hint: `${x.label} — ${x.hint}` })), arp.inversion, (v) => set({ inversion: v }), 'Renversement de l’accord'), help('quelle note de l’accord est à la basse (C, C/E, C/G…) ; « Proche » enchaîne les accords de la piste en bougeant le moins possible')),
        formRow('Voicing', segmented(A().VOICINGS.map((x) => ({ id: x.id, label: x.label, hint: x.hint })), arp.voicing, (v) => set({ voicing: v }), 'Voicing')),
      ];
    } else if (m.id === 'pas') {
      const u = laneUi();
      const cur = arp.lanes[u.id];
      const len = cur.length || (u.id === 'rhythm' && arp.rhythm.type === 'euclid' ? arp.rhythm.steps : P());
      const lenSel = h('select', { 'aria-label': 'Longueur de la ligne', onchange: (e) => {
        const n = +e.target.value;
        const src = laneValues(u.id);
        writeLane(u.id, Array.from({ length: n }, (_, k) => src[k % src.length]));
      } }, Array.from({ length: 32 }, (_, k) => k + 1).map((k) => h('option', { value: k, selected: k === len }, `${k} pas`)));
      rows = [
        null,
        adv() ? formRow('Ligne', h('b', { class: 'arp-lane-name' }, u.label), lenSel, h('button', { type: 'button', class: 'btn small', onclick: () => set(u.id === 'rhythm' ? { lanes: { ...arp.lanes, rhythm: [] }, rhythm: { ...arp.rhythm, type: 'all' } } : { lanes: { ...arp.lanes, [u.id]: [] } }) }, 'Remettre à zéro')) : null,
        adv() ? formRow('Lecture de la ligne', segmented(A().LANE_DIRS, arp.laneDir[u.id] || 'fwd', (v) => set({ laneDir: { ...arp.laneDir, [u.id]: v } }), 'Sens de lecture de la ligne')) : null,
        adv() && u.id === 'rhythm'
          ? formRow(
              'Rythme',
              segmented([{ id: 'all', label: 'Tous les pas' }, { id: 'euclid', label: 'Euclidien' }, { id: 'lane', label: 'Dessiné' }], arp.rhythm.type, (v) => set({ rhythm: { ...arp.rhythm, type: v }, ...(v === 'lane' && !arp.lanes.rhythm.length ? { lanes: { ...arp.lanes, rhythm: laneValues('rhythm') } } : {}) }), 'Type de rythme'),
              arp.rhythm.type === 'euclid'
                ? [
                    slider('Coups', arp.rhythm.hits, 0, arp.rhythm.steps, 1, (x) => `${x} sur ${track.arp.rhythm.steps}`, (x, push) => set({ rhythm: { ...track.arp.rhythm, hits: x } }, { push })),
                    slider('Sur', arp.rhythm.steps, 2, 32, 1, (x) => `${x} pas`, (x, push) => set({ rhythm: { ...track.arp.rhythm, steps: x } }, { push })),
                    slider('Décalage', arp.rhythm.rot, 0, arp.rhythm.steps - 1, 1, (x) => `${x}`, (x, push) => set({ rhythm: { ...track.arp.rhythm, rot: x } }, { push })),
                  ]
                : null
            )
          : null,
        adv() ? formRow('Toutes les lignes', segmented(A().LANE_DIRS, laneDirAll(arp), (v) => set({ laneDir: v === 'fwd' ? {} : Object.fromEntries(ALL_LANES().map((k) => [k, v])) }), 'Sens de lecture de toutes les lignes'), help('même sens de lecture pour toutes les lignes')) : null,
      ];
    } else if (m.id === 'geste') {
      rows = [
        h('div', { class: 'geste-line' }, gesteChips(false), h('button', { type: 'button', class: 'btn geste-adjust', 'aria-expanded': String(gesteOpen), title: 'Régler finement le geste', onclick: () => ((gesteOpen = !gesteOpen), render()) }, gesteOpen ? 'Replier' : 'Ajuster ›')),
        gesteOpen ? gesteTab() : null,
      ];
    } else if (m.id === 'echo') {
      rows = [
        formRow('Échos', segmented([0, 1, 2, 3, 4].map((n) => ({ id: n, label: n ? String(n) : 'Non' })), arp.echo.n, (v) => set({ echo: { ...arp.echo, n: +v } }), 'Nombre d’échos'), help('chaque note se répète, plus faible, éventuellement transposée (spirales)')),
        arp.echo.n ? formRow('Écart', segmented(A().ECHO_GAPS.map((g) => ({ id: g, label: g === 0.5 ? '½ pas' : g === 1.5 ? '1½ pas' : `${g} pas` })), arp.echo.gap, (v) => set({ echo: { ...arp.echo, gap: +v } }), 'Écart entre les échos')) : null,
        arp.echo.n ? formRow('Transposition', segmented(A().ECHO_SHIFTS, arp.echo.shift, (v) => set({ echo: { ...arp.echo, shift: v } }), 'Transposition des échos')) : null,
        arp.echo.n && adv() ? formRow('Atténuation', slider('Atténuation', Math.round(arp.echo.decay * 100), 10, 95, 5, (x) => `${x} % à chaque écho`, (x, push) => set({ echo: { ...track.arp.echo, decay: x / 100 } }, { push }))) : null,
      ];
    } else if (m.id === 'roll') {
      rows = [formRow('Ratchet roulé', segmented(A().ROLLS, arp.roll, (v) => set({ roll: v }), 'Ratchet roulé'), help('les répétitions d’un ratchet parcourent l’accord ; le nombre de répétitions se règle dans la ligne Ratchet (Pas à pas).'))];
    } else if (m.id === 'evol') {
      rows = [
        formRow('Variations', slider('Variations', Math.round(arp.evolve * 100), 0, 100, 5, (x) => (x ? `${x} %` : 'aucune'), (x, push) => set({ evolve: x / 100 }, { push })), help('d’une boucle à l’autre : nuances, notes déplacées, respirations (A, A′, B, A″)')),
        formRow('Mouvement', slider('Mouvement', Math.round(arp.motion * 100), 0, 100, 5, (x) => (x ? `${x} %` : 'aucun'), (x, push) => set({ motion: x / 100 }, { push })), help('timbre, vélocité et durées qui ondulent lentement')),
        formRow('Swing', slider('Swing', Math.round(arp.swing * 100), 50, 75, 1, (x) => (x > 50 ? `${x} %` : 'droit'), (x, push) => set({ swing: x / 100 }, { push }))),
        formRow('Notes ajoutées', segmented(A().HARMONY.map((x) => ({ id: x.id, label: x.label, hint: x.hint })), arp.harmony, (v) => set({ harmony: v }), 'Notes ajoutées')),
        adv() ? formRow('Lignes', segmented(A().RETRIG, arp.retrig, (v) => set({ retrig: v }), 'Relance des lignes'), help('à chaque accord, les lignes de pas repartent du début ; en libre, elles continuent')) : null,
        formRow('Hasard', h('span', { class: 'arp-seed' }, `graine ${arp.seed}`), h('button', { type: 'button', class: 'btn small', title: 'Autres tirages pour les motifs aléatoires et les variations', onclick: () => set({ seed: arp.seed + 1 }) }, 'Nouvelle graine ↻')),
      ];
    }
    return h('section', { class: 'arp-pane arp-form' }, head, rows);
  }

  function modulesView() {
    return h('div', { class: 'arp-mods' }, modulesNav(), modulePane());
  }

  function levelSwitch() {
    const el = segmented(
      [
        { id: 'intuitif', label: 'Intuitif', hint: 'quatre boutons rotatifs et Surprends-moi' },
        { id: 'essentiel', label: 'Essentiel', hint: 'les réglages principaux' },
        { id: 'avance', label: 'Avancé', hint: 'tous les modules et toutes les lignes de pas' },
      ],
      level,
      setLevel,
      'Niveau de détail'
    );
    el.classList.add('arp-level');
    return el;
  }

  /** Titre de la fenêtre : « Nom de la piste — Partie » (la partie = la scène en cours, s'il y en a plusieurs ou une nommée). */
  function panelTitle() {
    if (host) return host.title;
    const p = ctl().project();
    const sc = p.scenes && p.scenes.length ? SS.currentScene(p) : null;
    return sc && sc.name ? `${track.name} — ${sc.name}` : track.name;
  }

  /* ------------------------------------------------------------------ */
  /* Mode Guitare (js/guitar-arp.js) : schéma de l'accord, tablature, motifs en cordes, jeu     */
  /* ------------------------------------------------------------------ */
  const GA = () => SS.GuitarArp;
  const guitarOn = () => !!(GA() && track && track.arp.guitar && track.arp.guitar.on);
  function setGuitar(patch, opts) {
    set({ guitar: { ...GA().normalize(track.arp.guitar), ...patch } }, opts);
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (w, hgt, inner, cls) => {
    const el = document.createElementNS(SVGNS, 'svg');
    el.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    el.setAttribute('class', cls);
    el.innerHTML = inner;
    return el;
  };
  const noteName = (m) => SS.noteNameFr(m);

  /** Schéma de l'accord sur le manche (cordes verticales, la fondamentale en orange). */
  function guitarDiagram(sh) {
    const played = sh.frets.filter((f) => f != null && f > 0);
    const start = !played.length || Math.max(...played) <= 4 ? 1 : Math.min(...played);
    const x0 = 22, dx = 22, y0 = 28, dy = 26;
    let s = start === 1 ? `<rect x="${x0 - 1}" y="${y0 - 4}" width="${dx * 5 + 2}" height="4" class="gd-nut"/>` : `<text x="${x0 - 9}" y="${y0 + dy / 2 + 4}" class="gd-fret" text-anchor="end">${start}</text>`;
    for (let i = 0; i < 6; i++) s += `<line x1="${x0 + i * dx}" y1="${y0}" x2="${x0 + i * dx}" y2="${y0 + dy * 5}" class="gd-str" stroke-width="${1 + (5 - i) * 0.25}"/>`;
    for (let j = 0; j <= 5; j++) s += `<line x1="${x0}" y1="${y0 + j * dy}" x2="${x0 + dx * 5}" y2="${y0 + j * dy}" class="gd-wire"/>`;
    const barre = sh.barre && sh.frets.filter((f) => f === sh.barre).length > 1;
    if (barre) {
      const first = sh.frets.findIndex((f) => f === sh.barre);
      s += `<rect x="${x0 + first * dx - 7}" y="${y0 + (sh.barre - start) * dy + dy / 2 - 7}" width="${(5 - first) * dx + 14}" height="14" rx="7" class="${sh.capo ? 'gd-capo' : 'gd-barre'}"/>`;
    }
    sh.frets.forEach((f, i) => {
      const x = x0 + i * dx, root = i === sh.rootStr ? ' root' : '';
      if (f == null) s += `<text x="${x}" y="${y0 - 9}" class="gd-fret" text-anchor="middle">×</text>`;
      else if (f === 0) s += `<circle cx="${x}" cy="${y0 - 12}" r="5" class="gd-open${root}"/>`;
      else if (!(barre && f === sh.barre)) s += `<circle cx="${x}" cy="${y0 + (f - start) * dy + dy / 2}" r="8" class="gd-dot${root}"/>`;
      else if (root) s += `<circle cx="${x}" cy="${y0 + (f - start) * dy + dy / 2}" r="5" class="gd-dot root"/>`;
    });
    const tun = (GA().TUNINGS.find((t) => t.id === sh.tuning) || GA().TUNINGS[0]).notes;
    tun.map((m) => NOTES_FR[m % 12]).forEach((n, i) => (s += `<text x="${x0 + i * dx}" y="${y0 + dy * 5 + 16}" class="gd-fret" text-anchor="middle">${n}</text>`));
    return svg(150, 182, s, 'gt-diagram');
  }

  /**
   * Un cycle du motif : en tablature (une ligne par corde, la case dans chaque attaque) ou en piano roll (une
   * ligne par hauteur) ; trait = la corde résonne ; barres du bas = vélocité de chaque pas.
   */
  let gtView = 'tab';
  /**
   * Hauteur fixe (≈ 100 px) : l'image est dessinée à la largeur réelle de sa place (Wpx) ; sans largeur connue, elle
   * part à 640 et se redessine à sa vraie largeur dès qu'elle est affichée.
   */
  function guitarTab(pv, Wpx) {
    const W = Math.max(320, Math.round(Wpx || 640)), Lm = 22, top = 14, gap = 12, R = 6.5, n16 = pv.len, cw = (W - Lm - 6) / n16, velTop = top + gap * 5 + 10, velH = 14;
    const m = pv.motif;
    const roll = gtView === 'roll';
    const pitches = [...new Set(pv.attacks.map((a) => a.midi))].sort((a, b) => a - b);
    const lo = pitches[0], hi = pitches[pitches.length - 1];
    const yOf = (a) => (roll ? top + gap * 5 - (hi === lo ? gap * 2.5 : ((a.midi - lo) / (hi - lo)) * gap * 5) : top + (5 - a.str) * gap);
    let s = '';
    for (let b = 0; b < m.beats; b++) s += `<rect x="${Lm + b * 4 * cw}" y="${top - 8}" width="${4 * cw}" height="${gap * 5 + 16}" class="${b % 2 ? 'gt-beat2' : 'gt-beat'}"/><text x="${Lm + b * 4 * cw + 3}" y="${top - 1}" class="gt-num">${b + 1}</text>`;
    if (roll) pitches.forEach((p) => { const y = yOf({ midi: p }); s += `<line x1="${Lm}" y1="${y}" x2="${W - 6}" y2="${y}" class="gt-line dash"/>`; });
    else ['e', 'B', 'G', 'D', 'A', 'E'].forEach((nm, r) => (s += `<line x1="${Lm}" y1="${top + r * gap}" x2="${W - 6}" y2="${top + r * gap}" class="gt-line"/><text x="${Lm - 10}" y="${top + r * gap + 3.5}" class="gt-num" text-anchor="middle">${nm}</text>`));
    const cls = (a) => (a.strum ? (a.mute ? 'mute' : 'strum') : m.dir && /[↓↑]/.test(a.label) ? 'pick' : a.bass ? 'thumb' : 'finger');
    pv.attacks.forEach((a) => {
      if (a.mute) return;
      const y = yOf(a), x1 = Lm + (a.step16 + 0.5) * cw, x2 = Math.min(W - 6, x1 + a.ring16 * cw - 6);
      if (x2 > x1 + 6) s += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="gt-ring ${cls(a)}${roll ? ' wide' : ''}"/>`;
    });
    pv.attacks.forEach((a) => {
      const x = Lm + (a.step16 + 0.5) * cw, y = yOf(a);
      const txt = a.mute ? '×' : roll ? '' : pv.shape.frets[a.str];
      s += `<circle cx="${x}" cy="${y}" r="${R}" class="gt-note ${cls(a)}"><title>${noteName(a.midi)} · vélocité ${Math.round(a.vel * 127)}</title></circle><text x="${x}" y="${y + 3}" class="gt-fretnum" text-anchor="middle">${txt}</text>`;
      if (a.label) s += a.strum ? `<text x="${x}" y="${top - 9}" class="gt-stroke" text-anchor="middle">${a.label}</text>` : `<text x="${x + R + 1}" y="${y - R + 1}" class="gt-finger ${cls(a)}">${a.label}</text>`;
    });
    const bySt = new Map();
    pv.attacks.forEach((a) => bySt.set(a.step16, Math.max(bySt.get(a.step16) || 0, a.vel)));
    bySt.forEach((v, st) => {
      const hh = Math.max(2, v * velH), x = Lm + (st + 0.5) * cw;
      s += `<rect x="${x - Math.min(5, cw * 0.3)}" y="${velTop + velH - hh}" width="${Math.min(10, cw * 0.6)}" height="${hh}" rx="2" class="gt-vel"><title>vélocité ${Math.round(v * 127)}</title></rect>`;
    });
    s += `<rect class="arp-head" x="-100" y="${top - 8}" width="${cw}" height="${velTop + velH - top + 8}" transform="translate(${Lm} 0)"/>`;
    const el = svg(W, velTop + velH + 3, s, 'gt-tab');
    el.style.maxWidth = W + 'px';
    if (!Wpx)
      requestAnimationFrame(() => {
        const w = el.isConnected && el.parentElement ? el.parentElement.clientWidth : 0;
        if (w && Math.abs(w - W) > 4) el.replaceWith(guitarTab(pv, w));
      });
    return el;
  }

  function guitarView() {
    const g = GA().normalize(track.arp.guitar);
    const src = sourceChord();
    const pv = GA().preview(track.arp, src.notes, ctl().project().tempo || 100, trackBass());
    const sh = pv.shape;
    const m = pv.motif;
    const cur = test || (() => {
      const hyp = A().analyzeChord(src.notes)[0];
      return hyp && SS.CHORDS.some((c) => c.id === hyp.type) ? { root: hyp.root, type: hyp.type } : { root: 9, type: 'min' };
    })();
    const pct = (v) => Math.round(v * 100) + ' %';
    const gs = (label, key, help, scale) => slider(label, Math.round(g[key] * 100), 0, 100, 1, (v) => v + ' %', (v, first) => setGuitar({ [key]: v / 100 }, { push: first }), { help, scale });
    const kind = g.tuning !== 'standard' ? `forme cherchée sur le manche (${GA().TUNINGS.find((t) => t.id === g.tuning).label})${sh.capo ? `, capodastre case ${sh.capo}` : ''}` : sh.kind === 'open' ? (sh.capo ? `forme ouverte, capodastre case ${sh.capo}` : 'forme ouverte') : `barré case ${sh.barre}, fondamentale sur la ${sh.kind === 'barreE' ? '6e' : '5e'} corde`;
    return h(
      'div',
      { class: 'gt-view' },
      h(
        'div',
        { class: 'arp-player gt-player' },
        h(
          'div',
          { class: 'arp-player-bar' },
          loopButton('▶ Lire en boucle'),
          h('span', { class: 'dlg-label' }, src.from === 'essai' ? 'Accord d’essai' : 'Accord de la piste'),
          h('select', { 'aria-label': 'Note fondamentale', onchange: (e) => ((test = { root: +e.target.value, type: cur.type }), render()) }, NOTES_FR.map((nm, k) => h('option', { value: k, selected: cur.root === k }, `${nm} (${NOTES[k]})`))),
          h('select', { 'aria-label': 'Type d’accord', onchange: (e) => ((test = { root: cur.root, type: e.target.value }), render()) }, SS.CHORDS.map((c) => h('option', { value: c.id, selected: cur.type === c.id }, c.label))),
          test ? h('button', { type: 'button', class: 'btn', title: 'Revenir aux accords de la piste', onclick: () => ((test = null), render()) }, 'Accords de la piste') : null
        ),
        h(
          'div',
          { class: 'gt-main' },
          h('div', { class: 'gt-card gt-chord' }, h('div', { class: 'gt-chordname' }, sh.name), guitarDiagram(sh), h('small', {}, kind), h('div', { class: 'gt-real' }, sh.notes.filter((x) => x != null).map(noteName).join(' · '))),
          h(
            'div',
            { class: 'gt-card' },
            h('div', { class: 'gt-tabhead' }, h('b', {}, m.name), h('span', {}, `${m.meter || '4/4'} · ${m.div === 3 && m.meter !== '6/8' ? 'triolets' : m.div === 4 ? 'doubles-croches' : 'croches'}`), h('span', { class: 'spacer' }), segmented([{ id: 'tab', label: 'Tablature', hint: 'une ligne par corde, la case jouée' }, { id: 'roll', label: 'Piano roll', hint: 'une ligne par hauteur de note' }], gtView, (v) => ((gtView = v), render()), 'Vue du motif')),
            guitarTab(pv),
            h('div', { class: 'gt-legend' }, h('span', { class: 'thumb' }, 'pouce p'), h('span', { class: 'finger' }, 'doigts i m a'), h('span', { class: 'pick' }, 'médiator ↓ ↑'), h('span', { class: 'strum' }, 'grattage (× étouffé)'), h('span', {}, 'trait = la corde résonne · barres = vélocité'))
          )
        )
      ),
      h(
        'div',
        { class: 'gt-mods' },
        h(
          'div',
          { class: 'gt-card' },
          h('h3', {}, 'Motif guitare'),
          GA().HANDS.map((hd) =>
            h(
              'div',
              { class: 'gt-group' },
              h('span', { class: 'dlg-label' }, hd.label),
              h('div', { class: 'gt-chips' }, GA().MOTIFS.filter((x) => x.hand === hd.id).map((x) => h('button', { type: 'button', class: 'gt-chip ' + hd.id + (x.id === g.motif ? ' on' : ''), title: x.desc, onclick: () => setGuitar({ motif: x.id }) }, x.name)))
            )
          ),
          h('p', { class: 'gt-desc' }, m.desc)
        ),
        h(
          'div',
          { class: 'gt-card' },
          h('h3', {}, 'Accord sur le manche'),
          g.tuning === 'standard' ? h('span', { class: 'dlg-label' }, 'Position') : null,
          g.tuning === 'standard' ? segmented(GA().POSITIONS.map((x) => ({ id: x.id, label: x.label, hint: x.hint })), g.pos, (v) => setGuitar({ pos: v }), 'Position de l’accord') : null,
          h('span', { class: 'dlg-label' }, 'Capodastre'),
          h('select', { 'aria-label': 'Capodastre', onchange: (e) => setGuitar({ capo: +e.target.value, pos: 'open' }) }, GA().CAPOS.map((c) => h('option', { value: c, selected: g.capo === c }, c ? `Case ${c}` : 'Sans'))),
          h('span', { class: 'dlg-label' }, 'Accordage'),
          h('select', { 'aria-label': 'Accordage', class: 'gt-tuning', onchange: (e) => setGuitar({ tuning: e.target.value }) }, GA().TUNINGS.map((t) => h('option', { value: t.id, selected: g.tuning === t.id, title: t.hint }, `${t.label} (${t.hint.split(' :')[0]})`))),
          h('small', { class: 'arp-legend' }, g.tuning === 'standard' ? 'Ouverte : la forme en bas du manche quand elle existe, sinon le barré le plus bas. Capodastre : les formes faciles, plus haut. Une basse imposée de la piste Accords (C/E) est jouée sous la forme quand elle est à portée.' : 'Accordage ouvert : la forme est cherchée sur le manche (fondamentale à la basse, cordes à vide en priorité).')
        ),
        h(
          'div',
          { class: 'gt-card' },
          h('h3', {}, 'Jeu'),
          gs('Résonance', 'ring', 'une corde rejouée coupe sa note ; au changement d’accord, tout s’arrête', ['détaché', 'basse ≈ 700 ms', 'tout sonne']),
          gs('Mélodie en avant', 'mel', 'la note la plus aiguë du motif plus forte, les autres aigus plus légers'),
          gs('Pouce accentué', 'thumb', 'les basses plus fortes que les doigts'),
          gs('Main humaine', 'human', 'placement et force varient un peu ; les basses sur les temps ne bougent pas'),
          m.hand === 'gratte' ? slider('Étalement du grattage', g.spread, 0, 40, 1, (v) => v + ' ms', (v, first) => setGuitar({ spread: v }, { push: first }), { help: 'temps entre deux cordes d’un même coup (12 ms : 0, 12, 24, 36 ms)' }) : null
        )
      )
    );
  }

  /** Bascule Clavier ↔ Guitare (en-tête). */
  function modeSwitch() {
    const el = segmented(
      [
        { id: 'clavier', label: 'Clavier', hint: 'l’arpégiateur habituel : les notes de l’accord, dans l’ordre du motif' },
        { id: 'guitare', label: 'Guitare', hint: 'l’accord posé sur le manche, des motifs de picking joués corde par corde' },
      ],
      guitarOn() ? 'guitare' : 'clavier',
      (v) => setGuitar({ on: v === 'guitare' }),
      'Clavier ou guitare'
    );
    el.classList.add('arp-mode');
    return el;
  }

  function render() {
    if (!track || sliding) return;
    if (sel != null && sel >= P()) sel = null;
    const body = dlg.querySelector('.arp-body');
    const scroll = body.scrollTop;
    const old = body.querySelector('.arp-scroll');
    const gridScroll = old ? old.scrollLeft : 0;
    if (guitarOn()) body.replaceChildren(guitarView());
    else body.replaceChildren(playerView(), level === 'intuitif' ? intuitiveView() : modulesView());
    const fill = dlg.querySelector('.arp-fill');
    fill.hidden = !!host || sourceChord().from !== 'essai';
    dlg.querySelector('.arp-off').hidden = !!host;
    dlg.querySelector('.arp-hostfoot').hidden = !host;
    dlg.querySelectorAll('.arp-hscope button').forEach((b) => {
      const on = (b.dataset.v === 'all') === hostAll;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    const lv = dlg.querySelector('.arp-level');
    lv.replaceWith(levelSwitch());
    dlg.querySelector('.arp-level').hidden = guitarOn();
    const ms = dlg.querySelector('.arp-mode');
    if (ms) ms.replaceWith(GA() ? modeSwitch() : h('span', { class: 'arp-mode' }));
    body.scrollTop = scroll;
    const sc = body.querySelector('.arp-scroll');
    if (sc) sc.scrollLeft = gridScroll;
    dlg.querySelector('.arp-undo').disabled = !undo.length;
    dlg.querySelector('.arp-title').textContent = panelTitle();
  }

  function build() {
    dlg = h(
      'dialog',
      { id: 'arpDialog', class: 'sd-dialog arp-dialog' },
      h(
        'form',
        { method: 'dialog' },
        h(
          'div',
          { class: 'sd-head' },
          h('h2', {}, h('span', { class: 'arp-brand' }, 'Arp One'), h('span', { class: 'arp-title' }, '')),
          h('span', { class: 'arp-head-right' }, h('span', { class: 'arp-mode' }), h('span', { class: 'arp-level' }), h('button', { type: 'button', class: 'arp-close', 'aria-label': 'Fermer', title: 'Fermer (les réglages sont gardés)', onclick: close, html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' }))
        ),
        h('div', { class: 'arp-body' }),
        h(
          'div',
          { class: 'dlg-footer' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn arp-undo',
              title: 'Défaire le dernier réglage',
              onclick: () => {
                if (!undo.length) return;
                track.arp = A().normalize(undo.pop());
                ctl().changed();
                render();
              },
            },
            '↶ Défaire'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              title: 'Revenir à un arpège montant simple (1/8, 8 pas, 1 octave, pas neutres)',
              onclick: () => ((sel = null), set({ ...clone(A().DEFAULTS), rate: 0.5, steps: 8, seed: track.arp.seed })),
            },
            'Réinitialiser'
          ),
          h('span', { class: 'spacer' }),
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              title: 'Fermer en revenant aux réglages d’ouverture',
              onclick: () => {
                track.arp = A().normalize(snapshot);
                if (armed) delete track.arpOn;
                ctl().changed();
                close({ discard: true });
              },
            },
            'Annuler'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn arp-off',
              title: 'La piste ne passe plus par l’arpégiateur (les réglages sont gardés)',
              onclick: () => {
                delete track.arpOn;
                ctl().changed();
                close();
              },
            },
            'Éteindre l’arpège'
          ),
          h(
            'span',
            { class: 'arp-hostfoot', hidden: true },
            h('span', { class: 'dlg-label' }, 'Scènes'),
            h(
              'span',
              { class: 'segmented arp-hscope', role: 'radiogroup', 'aria-label': 'Scènes', id: 'arpHostScope' },
              [['one', 'Cette scène'], ['all', 'Toutes']].map(([v, t]) => h('button', { type: 'button', role: 'radio', 'data-v': v, onclick: () => ((hostAll = v === 'all'), render()) }, t))
            ),
            h('button', { type: 'button', class: 'btn btn-accent', id: 'arpHostOk', onclick: () => close() }, 'OK')
          ),
          h('button', { type: 'button', class: 'btn arp-fill', title: 'Remplace les accords de la piste par l’accord d’essai, sur toute la boucle', onclick: fillTrack }, 'Poser l’accord sur la piste')
        )
      )
    );
    // la largeur des colonnes suit la taille de la fenêtre
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => dlg.open && render(), 120);
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    document.body.append(dlg);
  }

  /** Fermer : les réglages sont gardés (assistant : ils vont à la scène, ou à toutes) ; discard : Annuler. */
  function close(opts) {
    stopLoop();
    if (picker && picker.open) picker.close();
    dlg.close();
    const t = track;
    track = null;
    if (host) {
      const hs = host;
      host = null;
      if (hostLevel) level = hostLevel;
      hostLevel = null;
      if (!(opts && opts.discard) && t) hs.apply(A().normalize(t.arp), hostAll);
      return;
    }
    app.renderTrack && t && app.renderTrack(t);
  }

  /** opts.armed : l'arpège vient d'être allumé par le bouton ARP de la piste ; « Annuler » le rééteint. */
  function open(t, opts) {
    if (!dlg) build();
    if (track) close({ discard: true });
    host = (opts && opts.host) || null;
    hostAll = !!(host && host.all);
    hostAt = -1;
    hostLevel = null;
    if (host && host.level && host.level !== level) {
      hostLevel = level; // l'assistant ouvre au niveau Avancé sans changer celui de la Grille
      level = host.level;
    }
    track = t;
    armed = !!(opts && opts.armed);
    track.arp = A().normalize(track.arp);
    snapshot = clone(track.arp);
    // piste de guitare ouverte pour la première fois : mode Guitare d'office (Annuler revient au mode Clavier)
    if (GA() && !host && !track.arp.guitar && track.family === 'guitar') {
      track.arp = A().normalize({ ...track.arp, guitar: { on: true } });
      ctl().changed();
    }
    undo = [];
    test = null;
    sel = null;
    gesteOpen = false;
    mod = trackChord() ? 'motif' : 'accord'; // piste vide : on commence par choisir l'accord
    takes = [];
    takeIdx = -1;
    gesteCompare = 'geste';
    render();
    dlg.showModal();
    render(); // la largeur de la grille dépend de la fenêtre affichée
  }

  // _loop / _info : accès pour les tests de bout en bout
  // motifTools : dessin, exemple et récents des motifs, réutilisés par la fenêtre de choix de l'assistant (js/band.js)
  // guitarTools : schéma d'accord et tablature du mode Guitare, réutilisés par le réglage « Avancé » de l'assistant (js/band.js)
  return { init: (a) => (app = a), open, motifTools: { icon: styleIcon, example, remember, recents: () => RECENTS.slice() }, guitarTools: { diagram: guitarDiagram, tab: guitarTab }, _loop: loop, _info: () => loopInfo() };
})();
