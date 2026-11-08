/*
 * Fenêtre de l'arpégiateur (moteur : js/arp.js) d'une piste Arpège.
 *
 * Inspirée de l'Arpeggiator d'Ableton Live : un seul panneau, quelques choix visuels, le reste replié.
 *
 *   Lecteur (toujours visible) : ▶ lecture en boucle de l'arpège sur un accord d'essai, avec curseur sur la grille ;
 *            l'accord d'essai se choisit en deux menus et peut remplir la piste d'un clic.
 *   Simple : style (vignettes dessinées par le moteur), vitesse (+ triolet / pointée), octaves, durée des notes.
 *   Avancé : idées toutes prêtes (presets), MOTION / EVOLVE, rythme, harmonie, lignes par pas, etc.
 *
 * Tout réglage est écrit dans track.arp (normalisé par SS.Arp.normalize) et s'entend tout de suite,
 * y compris pendant la lecture en boucle. Annuler restaure les réglages d'ouverture.
 */
window.SS = window.SS || {};

SS.arpPanel = (() => {
  const A = () => SS.Arp;
  let app;
  let track = null;
  let snapshot = null;
  let undo = [];
  let tab = 'simple';
  let previewPhrase = 0; // passage de boucle affiché (0 = A, 1 = A', 2 = B, 3 = A'')
  let dlg;
  let sliding = false; // pendant le glissé d'un curseur, on ne reconstruit pas la fenêtre
  let test = null; // accord d'essai choisi { root (0..11), type } ; null = accord de la piste

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
  const pct = (v) => `${Math.round(v * 100)} %`;
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTES_FR = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

  /* ---------- Modification des réglages ---------- */

  /** patch : objet partiel ; push = enregistre l'état précédent pour Annuler (pas pendant un glissé). */
  function set(patch, { push = true, keepPreset = false } = {}) {
    if (push) {
      undo.push(clone(track.arp));
      if (undo.length > 60) undo.shift();
    }
    const next = { ...track.arp, ...patch };
    if (!keepPreset && !('preset' in patch)) next.preset = '';
    track.arp = A().normalize(next);
    app.changed();
    render();
  }

  /* ---------- Accord d'essai ---------- */

  const trackChord = () => {
    const ev = (track.events || []).find((e) => e.notes && e.notes.length);
    return ev ? ev.notes.slice() : null;
  };
  const rootMidi = (pc) => 12 * ((Number.isFinite(track.octave) ? track.octave : 3) + 1) + pc;

  /** Accord joué par la lecture en boucle et dessiné sur la grille. */
  function sourceChord() {
    if (test) return { notes: SS.chordNotes(rootMidi(test.root), test.type), from: 'essai' };
    const notes = trackChord();
    if (notes) return { notes, from: 'piste' };
    return { notes: SS.chordNotes(rootMidi(9), 'min'), from: 'essai' }; // La mineur par défaut
  }

  /** Pose l'accord d'essai sur toute la boucle de la piste (accord à arpéger). */
  function fillTrack() {
    const notes = sourceChord().notes;
    const len = SS.trackLen(app.project(), track);
    if (track.events.length && !confirm('Remplacer les accords de la piste par cet accord sur toute la boucle ?')) return;
    track.events = [{ step: 0, len, notes, vel: 0.8 }];
    test = null;
    app.changed();
    app.renderTrack && app.renderTrack(track);
    render();
  }

  /* ---------- Lecture en boucle ---------- */

  const loop = { on: false, timer: null, raf: null, next: 0, step: 0, queue: [], tick: -1 };
  const LOOP_STEPS = () => SS.stepsPerBar(app.project()) * 2; // la boucle d'écoute dure 2 mesures

  async function startLoop() {
    const ctx = SS.audio.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    loop.on = true;
    render();
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
  }

  /** Programme les notes un peu en avance (comme le séquenceur), avec les réglages du moment. */
  function loopTick() {
    if (!loop.on || !track) return stopLoop();
    const ctx = SS.audio.ensureCtx();
    const project = app.project();
    const stepSec = 60 / project.tempo / 4;
    const total = LOOP_STEPS();
    const notes = sourceChord().notes;
    while (loop.next < ctx.currentTime + 0.12) {
      const s = loop.step % total;
      const lp = Math.floor(loop.step / total); // passage de boucle : EVOLVE varie d'un passage à l'autre
      const ev = { step: 0, len: total, notes, vel: 0.85 };
      const out = A().renderStep(track.arp, ev, s, { loop: lp, stepSec, stepsPerBeat: SS.stepsPerBeat(project), trackLen: total });
      out.forEach((n) => {
        const group = out.filter((x) => x.at === n.at);
        SS.audio.playNote(track, n.midi, loop.next + n.at, n.dur, n.vel * (group.length > 1 ? 0.8 : 1), undefined, group.indexOf(n), group.length, { cutoff: n.cutoff });
      });
      loop.queue.push({ time: loop.next, tick: Math.floor(s * track.arp.rate + 1e-9) });
      loop.next += stepSec;
      loop.step++;
    }
  }

  /** Curseur de lecture sur la grille (les 16 premiers pas d'arpège de chaque accord). */
  function drawHead() {
    if (!loop.on) return;
    const now = SS.audio.ensureCtx().currentTime;
    while (loop.queue.length && loop.queue[0].time <= now) loop.tick = loop.queue.shift().tick;
    const head = dlg && dlg.querySelector('.arp-head');
    if (head) {
      const cw = +head.getAttribute('width');
      head.setAttribute('x', loop.tick >= 0 && loop.tick < 16 ? loop.tick * cw : -100);
    }
    loop.raf = requestAnimationFrame(drawHead);
  }

  /* ---------- Petits composants ---------- */

  function slider(label, value, min, max, step, fmt, oninput, opts = {}) {
    const out = h('output', {}, fmt(value));
    const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
    let pushed = false;
    input.addEventListener('input', () => {
      sliding = true;
      const v = +input.value;
      out.textContent = fmt(v);
      oninput(v, !pushed);
      pushed = true;
    });
    input.addEventListener('change', () => {
      pushed = false;
      sliding = false;
      render();
    });
    if (opts.reset != null) input.addEventListener('dblclick', () => oninput(opts.reset, true));
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
      options.map((o) =>
        h('button', { type: 'button', class: String(o.id) === String(value) ? 'active' : '', title: o.hint || null, onclick: () => onpick(o.id) }, o.label)
      )
    );
  }

  function plainSelect(options, value, onchange) {
    return h('select', { onchange: (e) => onchange(e.target.value) }, options.map((o) => h('option', { value: o.id, selected: String(o.id) === String(value), title: o.hint || null }, o.label)));
  }

  function modeSelect(value, onchange) {
    const groups = {};
    A().MODES.forEach((m) => (groups[m.group] = groups[m.group] || []).push(m));
    return h(
      'select',
      { onchange: (e) => onchange(e.target.value) },
      Object.entries(groups).map(([g, ms]) => h('optgroup', { label: g }, ms.map((m) => h('option', { value: m.id, selected: m.id === value }, m.label))))
    );
  }

  const evolveStage = (e) =>
    e === 0 ? 'boucle identique' : e <= 0.25 ? 'nuances (vélocité, gate)' : e <= 0.5 ? '+ petites permutations, octaves' : e <= 0.75 ? '+ respirations, ratchets' : '+ phrase B au contour différent';

  /** Grille des 16 premiers pas : une colonne par pas d'arpège, hauteur = note. Le curseur suit la lecture. */
  function gridSvg(arp, notes) {
    const N = 16;
    const ticks = A().preview(arp, notes, N, { loop: previewPhrase, stepsPerBeat: 4 });
    const all = ticks.flatMap((t) => (t ? t.notes : []));
    const W = 640;
    const H = 120;
    const cw = W / N;
    let svg = '';
    for (let i = 0; i < N; i++) svg += `<rect class="${i % 4 === 0 ? 'ag-beat' : 'ag-col'}" x="${i * cw + 1}" y="1" width="${cw - 2}" height="${H - 2}" rx="3"/>`;
    svg += `<rect class="arp-head" x="${loop.on && loop.tick >= 0 && loop.tick < N ? loop.tick * cw : -100}" y="0" width="${cw}" height="${H}" rx="3"/>`;
    if (all.length) {
      const lo = Math.min(...all) - 1;
      const hi = Math.max(...all) + 1;
      const y = (n) => H - 8 - ((n - lo) / Math.max(1, hi - lo)) * (H - 22);
      ticks.forEach((t, i) => {
        if (!t) return;
        t.notes.forEach((n) => {
          const w = Math.min(cw * Math.min(t.gate, 4), W - i * cw) - 3;
          const op = (0.35 + 0.65 * t.vel).toFixed(2);
          svg += `<rect class="note${t.anchor && arp.evolve > 0 ? ' anchor' : ''}" x="${i * cw + 2}" y="${(y(n) - 4).toFixed(1)}" width="${Math.max(4, w).toFixed(1)}" height="8" rx="2" style="opacity:${op}"/>`;
          if (t.ratchet > 1) for (let r = 1; r < t.ratchet; r++) svg += `<line class="ratchet" x1="${(i * cw + 2 + (r * cw) / t.ratchet).toFixed(1)}" x2="${(i * cw + 2 + (r * cw) / t.ratchet).toFixed(1)}" y1="${(y(n) - 6).toFixed(1)}" y2="${(y(n) + 6).toFixed(1)}"/>`;
        });
        if (t.notes.length === 1) svg += `<text x="${(i * cw + cw / 2).toFixed(1)}" y="12">${A().noteName(t.notes[0]).replace(/-?\d+$/, '')}</text>`;
      });
    }
    // innerHTML : l'élément <svg> doit être créé dans l'espace de noms SVG
    return h('div', { html: `<svg class="arp-grid" viewBox="0 0 ${W} ${H}" role="img" aria-label="Les 16 premiers pas de l’arpège">${svg}</svg>` }).firstChild;
  }

  /** Petit dessin du contour d'un style, calculé par le moteur sur un accord de 4 notes. */
  function styleIcon(mode) {
    const arp = { mode, rate: 1, octaves: 1, seed: 3 };
    const ticks = A().preview(arp, [60, 64, 67, 71], 8);
    const y = (n) => (27 - (n - 60) * 2).toFixed(1); // Do4 en bas, Si4 en haut
    const pts = [];
    let bars = '';
    ticks.forEach((t, i) => {
      if (!t) return;
      const x = 4 + i * 8;
      if (t.notes.length > 1) t.notes.forEach((n) => (bars += `<rect x="${x - 2}" y="${y(n) - 1.3}" width="5" height="2.6" rx="1"/>`));
      else pts.push(`${x},${y(t.notes[0])}`);
    });
    const line = pts.length ? `<polyline points="${pts.join(' ')}"/>` + pts.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="1.8"/>`).join('') : '';
    return `<svg viewBox="0 0 64 30" aria-hidden="true">${line}${bars}</svg>`;
  }

  /* ---------- Lecteur (toujours visible) ---------- */

  function playerView() {
    const arp = track.arp;
    const src = sourceChord();
    const hyp = A().analyzeChord(src.notes)[0];
    const has = !!trackChord();
    const cur = test || (src.from === 'essai' ? { root: 9, type: 'min' } : null);
    return h(
      'div',
      { class: 'arp-player' },
      h(
        'div',
        { class: 'arp-player-bar' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn arp-loop' + (loop.on ? ' on' : ''),
            title: loop.on ? 'Arrêter la lecture en boucle' : 'Écouter l’arpège en boucle (les réglages s’entendent tout de suite)',
            onclick: () => (loop.on ? (stopLoop(), render()) : startLoop()),
          },
          loop.on ? '■ Stop' : '▶ Lire en boucle'
        ),
        h(
          'div',
          { class: 'arp-chordpick' },
          h('span', { class: 'dlg-label' }, 'Accord'),
          has
            ? h(
                'button',
                { type: 'button', class: 'chip' + (!test ? ' active' : ''), title: 'Le premier accord posé sur la piste', onclick: () => ((test = null), render()) },
                'De la piste'
              )
            : null,
          h(
            'select',
            {
              'aria-label': 'Note fondamentale',
              class: test || !has ? 'active' : '',
              onchange: (e) => ((test = { root: +e.target.value, type: (cur && cur.type) || 'min' }), render()),
            },
            !test && has ? h('option', { value: '', selected: true, disabled: true }, '—') : null,
            NOTES_FR.map((n, i) => h('option', { value: i, selected: cur && !(!test && has) && cur.root === i }, `${n} (${NOTES[i]})`))
          ),
          h(
            'select',
            {
              'aria-label': 'Type d’accord',
              onchange: (e) => ((test = { root: cur ? cur.root : 9, type: e.target.value }), render()),
            },
            !test && has ? h('option', { value: '', selected: true, disabled: true }, '—') : null,
            SS.CHORDS.map((c) => h('option', { value: c.id, selected: cur && !(!test && has) && cur.type === c.id }, c.label))
          ),
          h('b', { class: 'arp-chordname', title: `Accord reconnu (confiance ${Math.round((hyp ? hyp.confidence : 0) * 100)} %)` }, hyp ? hyp.name : ''),
          src.from === 'essai'
            ? h('button', { type: 'button', class: 'btn arp-fill', title: 'Pose cet accord sur toute la boucle de la piste', onclick: fillTrack }, has ? 'Mettre sur la piste' : 'Poser sur la piste')
            : null
        )
      ),
      gridSvg(arp, src.notes),
      !has ? h('small', { class: 'arp-legend' }, 'La piste est vide : choisis un accord, écoute, puis « Poser sur la piste ».') : null
    );
  }

  /* ---------- Simple ---------- */

  const STYLES = [
    { id: 'up', label: 'Montant' },
    { id: 'down', label: 'Descendant' },
    { id: 'updown', label: 'Montant / descendant' },
    { id: 'pedal', label: 'Basse pivot' },
    { id: 'converge', label: 'Converge' },
    { id: 'shuffle', label: 'Aléatoire' },
    { id: 'chord', label: 'Accord' },
  ];
  const BASE_RATES = [
    { id: 0.25, label: '1/4', hint: 'noire' },
    { id: 0.5, label: '1/8', hint: 'croche' },
    { id: 1, label: '1/16', hint: 'double-croche' },
    { id: 2, label: '1/32', hint: 'triple-croche' },
  ];
  const FEEL = [
    { id: 1, label: 'Normale' },
    { id: 1.5, label: 'Triolet' },
    { id: 2 / 3, label: 'Pointée' },
  ];
  /** Décompose une vitesse en valeur de base × modificateur (triolet / pointée). */
  function splitRate(r) {
    for (const f of FEEL) for (const b of BASE_RATES) if (Math.abs(b.id * f.id - r) < 1e-6) return { base: b.id, feel: f.id };
    return null;
  }

  function simpleView() {
    const arp = track.arp;
    const rs = splitRate(arp.rate);
    const inStyles = STYLES.some((s) => s.id === arp.mode);
    return h(
      'section',
      { class: 'arp-simple' },
      h(
        'div',
        { class: 'arp-field' },
        h('span', { class: 'dlg-label' }, 'Style'),
        h(
          'div',
          { class: 'arp-styles', role: 'radiogroup', 'aria-label': 'Style' },
          STYLES.map((s) =>
            h(
              'button',
              { type: 'button', class: 'arp-style' + (arp.mode === s.id ? ' active' : ''), role: 'radio', 'aria-checked': String(arp.mode === s.id), onclick: () => set({ mode: s.id }) },
              h('span', { html: styleIcon(s.id) }),
              s.label
            )
          ),
          h(
            'label',
            { class: 'arp-style more' + (!inStyles ? ' active' : '') },
            h('span', { class: 'arp-more-title' }, inStyles ? 'Autres…' : A().MODES.find((m) => m.id === arp.mode).label),
            modeSelect(inStyles ? '' : arp.mode, (v) => set({ mode: v }))
          )
        )
      ),
      h(
        'div',
        { class: 'arp-simple-row' },
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Vitesse'),
          segmented(BASE_RATES, rs ? rs.base : '', (v) => set({ rate: +v * (rs ? rs.feel : 1) }), 'Vitesse'),
          segmented(FEEL, rs ? rs.feel : '', (v) => set({ rate: (rs ? rs.base : 1) * +v }), 'Triolet ou pointée'),
          !rs ? h('small', { class: 'arp-help' }, `Vitesse actuelle : ${A().rateLabel(arp.rate)}`) : null
        ),
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Octaves'),
          segmented([1, 2, 3, 4].map((o) => ({ id: o, label: String(o) })), arp.octaves, (v) => set({ octaves: +v }), 'Octaves'),
          h('small', { class: 'arp-help' }, 'L’arpège monte sur autant d’octaves.')
        )
      ),
      slider('Durée des notes', Math.round(arp.gate * 100), 10, 200, 5, (v) => `${v} %`, (v, push) => set({ gate: v / 100 }, { push }), {
        cls: 'wide',
        reset: 90,
        scale: ['piqué', 'normal', 'lié'],
      })
    );
  }

  /* ---------- Avancé ---------- */

  function advancedView() {
    const arp = track.arp;
    const preset = A().PRESETS.find((p) => p.id === arp.preset);
    return h(
      'section',
      { class: 'arp-advanced' },
      h(
        'div',
        { class: 'arp-presets' },
        h('label', { class: 'dlg-label', for: 'arpPreset' }, 'Idées'),
        h(
          'select',
          {
            id: 'arpPreset',
            onchange: (e) => {
              const next = A().fromPreset(e.target.value, { seed: arp.seed });
              if (next) {
                undo.push(clone(track.arp));
                track.arp = next;
                app.changed();
                render();
              }
            },
          },
          h('option', { value: '', selected: !preset, disabled: true }, 'Charger une idée toute prête…'),
          A().PRESETS.map((p) => h('option', { value: p.id, selected: p.id === arp.preset }, p.label))
        ),
        preset ? h('p', { class: 'arp-desc' }, `${preset.desc} Accord conseillé : ${preset.chord}, ${preset.bpm} BPM.`) : null
      ),
      h(
        'div',
        { class: 'arp-macros two' },
        slider('MOTION', Math.round(arp.motion * 100), 0, 100, 1, (v) => (v ? `${v} %` : 'off'), (v, push) => set({ motion: v / 100 }, { push }), { help: 'Fait bouger le filtre et la dynamique, jamais les notes.' }),
        slider('EVOLVE', Math.round(arp.evolve * 100), 0, 100, 1, (v) => (v ? `${v} %` : 'off'), (v, push) => set({ evolve: v / 100 }, { push }), { help: 'Varie la boucle à chaque passage : ' + evolveStage(arp.evolve) + '.' })
      ),
      arp.evolve > 0
        ? h(
            'div',
            { class: 'arp-evolve-bar' },
            h('span', { class: 'dlg-label' }, 'Passage affiché'),
            h(
              'span',
              { class: 'arp-phrases', title: 'EVOLVE varie selon la structure A / A′ / B / A″ ; les notes cerclées (temps forts) ne bougent jamais' },
              ['A', 'A′', 'B', 'A″'].map((l, i) => h('button', { type: 'button', class: 'chip' + (i === previewPhrase ? ' active' : ''), onclick: () => ((previewPhrase = i), render()) }, l))
            ),
            h(
              'button',
              { type: 'button', class: 'btn' + (arp.freeze ? ' on' : ''), title: 'Fige la variation affichée', onclick: () => set({ freeze: !arp.freeze, freezeLoop: previewPhrase }, { keepPreset: true }) },
              arp.freeze ? 'Figé ✓' : 'Figer'
            ),
            h('button', { type: 'button', class: 'btn', title: 'Tirer d’autres variations', onclick: () => set({ seed: Math.floor(Math.random() * 999999) + 1 }, { keepPreset: true }) }, 'Autres variations ↻')
          )
        : null,
      createView()
    );
  }

  /** Éditeur d'une ligne de pas : barres cliquables / glissables, longueur propre. */
  function laneEditor(name) {
    const spec = A().LANES[name];
    const arr = track.arp.lanes[name];
    const len = arr.length;
    const norm = (v) => (v - spec.min) / (spec.max - spec.min);
    const fmt = (v) => (name === 'oct' ? (v > 0 ? `+${v}` : String(v)) : name === 'ratchet' ? `×${v}` : name === 'rhythm' ? (v ? '●' : '·') : pct(v));
    const resize = (n) => {
      n = Math.max(0, Math.min(64, n));
      const next = arr.slice(0, n);
      while (next.length < n) next.push(len ? arr[next.length % len] : spec.def);
      const patch = { lanes: { ...track.arp.lanes, [name]: next } };
      if (name === 'rhythm') patch.rhythm = { ...track.arp.rhythm, type: n ? 'lane' : 'all' };
      set(patch);
    };
    const cells = h('div', { class: 'arp-cells' + (name === 'oct' ? ' bipolar' : '') });
    arr.forEach((v, i) => {
      const bar = h('i', { style: `height:${(name === 'oct' ? Math.abs(v) / 2 / 2 : norm(v)) * 100}%;${name === 'oct' && v < 0 ? 'top:50%' : name === 'oct' ? 'bottom:50%' : ''}` });
      cells.append(h('span', { class: 'arp-cell' + (i % 4 === 0 ? ' beat' : ''), 'data-i': i, title: `Pas ${i + 1} : ${fmt(v)}` }, bar, h('em', {}, fmt(v))));
    });
    let drag = null;
    const valueAt = (e) => {
      const r = cells.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left) / r.width) * len);
      let x = 1 - (e.clientY - r.top) / r.height;
      x = Math.max(0, Math.min(1, x));
      let v = spec.min + x * (spec.max - spec.min);
      if (spec.int) v = Math.round(v);
      else v = Math.round(v * 20) / 20;
      return { i: Math.max(0, Math.min(len - 1, i)), v };
    };
    cells.addEventListener('pointerdown', (e) => {
      if (!len) return;
      e.preventDefault();
      cells.setPointerCapture(e.pointerId);
      const { i, v } = valueAt(e);
      const lanes = clone(track.arp.lanes);
      if (name === 'rhythm') lanes.rhythm[i] = lanes.rhythm[i] ? 0 : 1; // clic = bascule
      else lanes[name][i] = v;
      drag = { push: true, rhythmValue: lanes.rhythm[i] };
      set({ lanes }, { push: true });
    });
    cells.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { i, v } = valueAt(e);
      const lanes = clone(track.arp.lanes);
      const nv = name === 'rhythm' ? drag.rhythmValue : v;
      if (lanes[name][i] === nv) return;
      lanes[name][i] = nv;
      // on modifie sans rendre toute la fenêtre pendant le glissé
      track.arp = A().normalize({ ...track.arp, lanes, preset: '' });
      const cell = cells.children[i];
      const val = track.arp.lanes[name][i];
      cell.querySelector('i').style.height = `${(name === 'oct' ? Math.abs(val) / 4 : norm(val)) * 100}%`;
      if (name === 'oct') {
        cell.querySelector('i').style.top = val < 0 ? '50%' : '';
        cell.querySelector('i').style.bottom = val >= 0 ? '50%' : '';
      }
      cell.querySelector('em').textContent = fmt(val);
      app.changed();
    });
    const end = () => {
      if (drag) {
        drag = null;
        render();
      }
    };
    cells.addEventListener('pointerup', end);
    cells.addEventListener('pointercancel', end);
    return h(
      'div',
      { class: 'arp-lane' + (len ? '' : ' off') },
      h(
        'div',
        { class: 'arp-lane-head' },
        h('b', {}, spec.label),
        h('button', { type: 'button', class: 'sd-mini', title: 'Un pas de moins', onclick: () => resize(len - 1) }, '−'),
        h('span', { class: 'arp-len' }, len ? `${len} pas` : 'off'),
        h('button', { type: 'button', class: 'sd-mini', title: 'Un pas de plus', onclick: () => resize(len ? len + 1 : 16) }, '+'),
        len ? h('button', { type: 'button', class: 'sd-mini', title: 'Désactiver la ligne', onclick: () => resize(0) }, '×') : null
      ),
      len ? cells : h('small', { class: 'arp-off' }, name === 'rhythm' ? 'Rythme : voir ci-dessus. « + » crée une ligne de 16 pas.' : `Valeur neutre (${fmt(spec.def)}). « + » crée une ligne de 16 pas.`)
    );
  }

  function numInput(label, value, min, max, onchange) {
    return h(
      'label',
      { class: 'arp-num' },
      label,
      h('input', { type: 'number', min, max, value, onchange: (e) => onchange(Math.max(min, Math.min(max, Math.round(+e.target.value || 0)))) })
    );
  }

  function createView() {
    const arp = track.arp;
    const rh = arp.rhythm;
    const bad = arp.mode === 'pattern' ? A().parsePattern(arp.pattern).filter((t) => t.bad).map((t) => t.bad) : [];
    return h(
      'div',
      { class: 'arp-create' },
      h(
        'div',
        { class: 'arp-row2' },
        h('label', { class: 'arp-field' }, h('span', { class: 'dlg-label' }, 'Ordre des notes'), modeSelect(arp.mode, (v) => set({ mode: v }))),
        h('div', { class: 'arp-field' }, h('span', { class: 'dlg-label' }, 'Octaves'), segmented([1, 2, 3, 4].map((o) => ({ id: o, label: String(o) })), arp.octaves, (v) => set({ octaves: +v }), 'Octaves')),
        h('label', { class: 'arp-field' }, h('span', { class: 'dlg-label' }, 'Harmonie'), plainSelect(A().HARMONY, arp.harmony, (v) => set({ harmony: v }))),
        h('label', { class: 'arp-field' }, h('span', { class: 'dlg-label' }, 'Lignes et rythme'), plainSelect(A().RETRIG, arp.retrig, (v) => set({ retrig: v })))
      ),
      arp.mode === 'pattern'
        ? h(
            'div',
            { class: 'arp-field' },
            h('span', { class: 'dlg-label' }, 'Motif relatif'),
            h('input', {
              type: 'text',
              class: 'arp-pattern',
              value: arp.pattern,
              placeholder: 'd1 d5 d1+ d5 d3+ d5 . _',
              spellcheck: 'false',
              onchange: (e) => set({ pattern: e.target.value }),
            }),
            h(
              'small',
              { class: 'arp-help' },
              'd1 d3 d5 d7 d9 : degrés de l’accord (repli défini si absent) · 0 1 2… : index des notes, du grave à l’aigu · + / − : octave · . silence · _ liaison. ',
              bad.length ? h('b', { class: 'arp-bad' }, `Ignoré : ${bad.join(' ')}`) : null
            )
          )
        : null,
      h(
        'div',
        { class: 'arp-field' },
        h('span', { class: 'dlg-label' }, 'Rythme'),
        h(
          'div',
          { class: 'arp-rhythm' },
          segmented(
            [
              { id: 'all', label: 'Tous les pas' },
              { id: 'euclid', label: 'Euclidien' },
              { id: 'lane', label: 'Ligne de pas' },
            ],
            rh.type,
            (v) => {
              const patch = { rhythm: { ...rh, type: v } };
              if (v === 'lane' && !arp.lanes.rhythm.length) patch.lanes = { ...arp.lanes, rhythm: A().euclid(rh.hits, rh.steps, rh.rot) };
              set(patch);
            },
            'Rythme'
          ),
          rh.type === 'euclid'
            ? [
                numInput('Coups', rh.hits, 0, rh.steps, (v) => set({ rhythm: { ...rh, hits: v } })),
                numInput('Pas', rh.steps, 1, 64, (v) => set({ rhythm: { ...rh, steps: v, hits: Math.min(rh.hits, v) } })),
                numInput('Rotation', rh.rot, 0, 63, (v) => set({ rhythm: { ...rh, rot: v } })),
                h('code', { class: 'arp-euclid' }, A().euclid(rh.hits, rh.steps, rh.rot).map((x) => (x ? '●' : '·')).join('')),
              ]
            : null
        ),
        h('small', { class: 'arp-help' }, 'Le rythme ne fait pas sauter de note : l’ordre n’avance que sur les pas joués.')
      ),
      h(
        'div',
        { class: 'arp-row2' },
        slider('Swing', Math.round(arp.swing * 100), 50, 75, 1, (v) => (v <= 50 ? 'droit' : `${v} %`), (v, push) => set({ swing: v / 100 }, { push }), { reset: 50 }),
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Tessiture'),
          h(
            'div',
            { class: 'arp-range' },
            numInput('de', arp.range[0], 0, 115, (v) => set({ range: [v, Math.max(v + 12, arp.range[1])] })),
            h('span', {}, A().noteName(arp.range[0])),
            numInput('à', arp.range[1], 12, 127, (v) => set({ range: [Math.min(arp.range[0], v - 12), v] })),
            h('span', {}, A().noteName(arp.range[1]))
          )
        ),
        h('div', { class: 'arp-field' }, h('span', { class: 'dlg-label' }, 'Graine'), numInput('', arp.seed, 0, 2147483647, (v) => set({ seed: v }, { keepPreset: true })))
      ),
      h(
        'div',
        { class: 'arp-lanes' },
        h('span', { class: 'dlg-label' }, 'Lignes par pas — chaque ligne a sa propre longueur (polymétrie). Cliquer / glisser verticalement pour régler.'),
        ['rhythm', 'vel', 'gate', 'oct', 'ratchet', 'prob'].filter((n) => n !== 'rhythm' || rh.type === 'lane').map(laneEditor)
      )
    );
  }

  function render() {
    if (!track || sliding) return;
    const body = dlg.querySelector('.arp-body');
    const scroll = body.scrollTop;
    body.replaceChildren(playerView(), tab === 'simple' ? simpleView() : advancedView());
    body.scrollTop = scroll;
    dlg.querySelectorAll('.arp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const undoBtn = dlg.querySelector('.arp-undo');
    undoBtn.disabled = !undo.length;
    const mode = A().MODES.find((m) => m.id === track.arp.mode);
    dlg.querySelector('.arp-sub').textContent = `${track.name} · ${mode.label} · ${A().rateLabel(track.arp.rate)} · ${track.arp.octaves} oct.`;
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
          h('div', {}, h('h2', {}, 'Arpégiateur'), h('p', { class: 'dlg-sub arp-sub' })),
          h(
            'div',
            { class: 'segmented arp-tabs', role: 'tablist' },
            h('button', { type: 'button', 'data-tab': 'simple', onclick: () => ((tab = 'simple'), render()) }, 'Simple'),
            h('button', { type: 'button', 'data-tab': 'advanced', onclick: () => ((tab = 'advanced'), render()) }, 'Avancé')
          )
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
                app.changed();
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
              title: 'Revenir à un arpège montant simple (1/16, 1 octave)',
              onclick: () => set({ ...A().DEFAULTS, rate: 1, seed: track.arp.seed }),
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
                app.changed();
                close();
              },
            },
            'Annuler'
          ),
          h('button', { type: 'button', class: 'btn btn-accent', onclick: close }, 'OK')
        )
      )
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    document.body.append(dlg);
  }

  function close() {
    stopLoop();
    dlg.close();
    const t = track;
    track = null;
    app.renderTrack && t && app.renderTrack(t);
  }

  function open(t) {
    if (!dlg) build();
    track = t;
    track.arp = A().normalize(track.arp);
    snapshot = clone(track.arp);
    undo = [];
    test = null;
    previewPhrase = track.arp.freeze ? track.arp.freezeLoop % 4 : 0;
    render();
    dlg.showModal();
  }

  function init(appApi) {
    app = appApi;
  }

  return { init, open, _loop: loop };
})();
