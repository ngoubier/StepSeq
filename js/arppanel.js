/*
 * Fenêtre de l'arpégiateur (moteur : js/arp.js) d'une piste Arpège — un seul écran.
 *
 *   Lecteur  : ▶ lecture en boucle sur un accord d'essai (curseur sur la grille) ; l'accord se choisit
 *              en deux menus et peut remplir la piste d'un clic.
 *   Les pas  : cliquer un pas de la grille règle sa vélocité, sa longueur (¼ temps … 4 temps),
 *              le nombre de notes jouées ensemble (1 à 3), ou en fait un silence ; la rangée de vélocités
 *              se règle aussi en glissant.
 *   Motif    : le motif en cours, ‹ › pour passer au voisin, et une fenêtre de sélection (js/motifs.js :
 *              catégories, recherche, récents) qui fait entendre chaque motif tout de suite.
 *   Réglages : vitesse, octaves, longueur du motif (4 / 8 / 16 pas), longueur des notes, jeu humain.
 *
 * Tout réglage est écrit dans track.arp (normalisé par SS.Arp.normalize) et s'entend tout de suite.
 */
window.SS = window.SS || {};

SS.arpPanel = (() => {
  const A = () => SS.Arp;
  let app;
  let track = null;
  let snapshot = null;
  let undo = [];
  let dlg;
  let sliding = false;
  let test = null;
  let sel = null;
  const N = 16;

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
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTES_FR = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

  function set(patch, { push = true } = {}) {
    if (push) {
      undo.push(clone(track.arp));
      if (undo.length > 60) undo.shift();
    }
    track.arp = A().normalize({ ...track.arp, ...patch, preset: '' });
    app.changed();
    render();
  }

  const P = () => track.arp.steps;
  const STEP_LANES = ['rhythm', 'vel', 'len', 'poly'];

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
    return { play: !!rh, vel: at('vel'), len: at('len'), poly: at('poly') };
  }

  function setStep(i, patch, opts) {
    const lanes = sizedLanes(track.arp, P());
    const idx = i == null ? [...Array(P()).keys()] : [i];
    idx.forEach((j) => {
      if ('play' in patch) lanes.rhythm[j] = patch.play ? 1 : 0;
      if ('vel' in patch) lanes.vel[j] = patch.vel;
      if ('len' in patch) lanes.len[j] = patch.len;
      if ('poly' in patch) lanes.poly[j] = patch.poly;
    });
    set({ lanes, rhythm: { ...track.arp.rhythm, type: 'lane' } }, opts);
  }

  const trackChord = () => {
    const ev = (track.events || []).find((e) => e.notes && e.notes.length);
    return ev ? ev.notes.slice() : null;
  };
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
    const len = SS.trackLen(app.project(), track);
    if (track.events.length && !confirm('Remplacer les accords de la piste par cet accord sur toute la boucle ?')) return;
    track.events = [{ step: 0, len, notes, vel: 0.8 }];
    test = null;
    app.changed();
    app.renderTrack && app.renderTrack(track);
    render();
  }

  const loop = { on: false, timer: null, raf: null, next: 0, step: 0, queue: [], tick: -1 };
  const LOOP_STEPS = () => SS.stepsPerBar(app.project()) * 2; // la boucle d'écoute dure 2 mesures

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

  function gridSvg(arp, notes) {
    const ticks = A().preview(arp, notes, N, { loop: 0, stepsPerBeat: 4 });
    const all = ticks.flatMap((t) => (t ? t.notes : []));
    const W = 640;
    const H = 120;
    const cw = W / N;
    const p = P();
    let svg = '';
    for (let i = 0; i < N; i++) {
      const cls = (i % 4 === 0 ? 'ag-beat' : 'ag-col') + (i >= p ? ' ag-rep' : '');
      svg += `<rect class="${cls}" x="${i * cw + 1}" y="1" width="${cw - 2}" height="${H - 2}" rx="3"/>`;
      if (sel != null && i % p === sel) svg += `<rect class="arp-sel" x="${i * cw + 1.5}" y="1.5" width="${cw - 3}" height="${H - 3}" rx="3"/>`;
    }
    svg += `<rect class="arp-head" x="${loop.on && loop.tick >= 0 ? (loop.tick % N) * cw : -100}" y="0" width="${cw}" height="${H}" rx="3"/>`;
    if (all.length) {
      const lo = Math.min(...all) - 1;
      const hi = Math.max(...all) + 1;
      const y = (n) => H - 8 - ((n - lo) / Math.max(1, hi - lo)) * (H - 22);
      ticks.forEach((t, i) => {
        if (!t) {
          svg += `<text class="rest" x="${(i * cw + cw / 2).toFixed(1)}" y="${H / 2 + 4}">silence</text>`;
          return;
        }
        t.notes.forEach((n) => {
          const w = Math.min(cw * t.gate, W - i * cw) - 3;
          const op = (0.3 + 0.7 * t.vel).toFixed(2);
          svg += `<rect class="note" x="${i * cw + 2}" y="${(y(n) - 4).toFixed(1)}" width="${Math.max(4, w).toFixed(1)}" height="8" rx="2" style="opacity:${op}"/>`;
        });
        const label = t.notes.map((n) => A().noteName(n).replace(/-?\d+$/, '')).join('+');
        svg += `<text x="${(i * cw + cw / 2).toFixed(1)}" y="12">${label}</text>`;
      });
    }
    const wrap = h('div', { class: 'arp-grid-wrap', html: `<svg class="arp-grid" viewBox="0 0 ${W} ${H}" role="img">${svg}</svg>` });
    wrap.firstChild.addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N)));
      sel = sel === i % P() ? null : i % P();
      render();
    });
    return wrap;
  }

  /** Rangée de vélocités sous la grille : cliquer / glisser verticalement pour régler chaque pas. */
  function velRow() {
    const p = P();
    const row = h('div', { class: 'arp-vels', title: 'Vélocité de chaque pas : cliquer / glisser verticalement' });
    for (let i = 0; i < N; i++) {
      const v = stepValues(i % p).vel;
      row.append(h('span', { class: 'arp-vel' + (i >= p ? ' rep' : '') + (sel != null && i % p === sel ? ' sel' : '') }, h('i', { style: `height:${Math.round(v * 100)}%` })));
    }
    let drag = false;
    const apply = (e, push) => {
      const r = row.getBoundingClientRect();
      const i = Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N)));
      const v = Math.max(0.05, Math.min(1, Math.round((1 - (e.clientY - r.top) / r.height) * 20) / 20));
      const j = i % p;
      if (!push && stepValues(j).vel === v) return;
      if (push) undo.push(clone(track.arp));
      const lanes = sizedLanes(track.arp, p);
      lanes.vel[j] = v;
      // la vélocité seule ne doit pas activer la ligne de rythme si elle n'existe pas encore
      if (!track.arp.lanes.rhythm.length && track.arp.rhythm.type !== 'lane') lanes.rhythm = [];
      track.arp = A().normalize({ ...track.arp, lanes, preset: '' });
      row.querySelectorAll('.arp-vel').forEach((c, k) => k % p === j && (c.firstChild.style.height = `${Math.round(v * 100)}%`));
      app.changed();
    };
    row.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      drag = true;
      apply(e, true);
    });
    row.addEventListener('pointermove', (e) => drag && apply(e, false));
    const end = () => {
      if (drag) {
        drag = false;
        render();
      }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    return h('div', { class: 'arp-vel-wrap' }, h('span', { class: 'dlg-label' }, 'Vélocité'), row);
  }

  const LENGTHS = [
    { id: 1, label: '¼ temps' },
    { id: 2, label: '½ temps' },
    { id: 4, label: '1 temps' },
    { id: 8, label: '2 temps' },
    { id: 16, label: '4 temps' },
  ];

  function stepPanel() {
    if (sel == null) return h('div', { class: 'arp-step empty' }, '👆 Clique un pas de la grille pour régler sa vélocité, sa longueur, jouer 2 ou 3 notes à la fois, ou en faire un silence.');
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
          h('span', { class: 'dlg-label' }, 'Notes à la fois'),
          segmented([{ id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }], v.poly, (x) => setStep(sel, { poly: +x }), 'Notes à la fois'),
          h('small', { class: 'arp-help' }, '2 = la note + la note de l’accord juste au-dessus.')
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

  function playerView() {
    const src = sourceChord();
    const hyp = A().analyzeChord(src.notes)[0];
    const has = !!trackChord();
    const pickShown = test || !has;
    const cur = test || { root: 9, type: 'min' };
    return h(
      'div',
      { class: 'arp-player' },
      h(
        'div',
        { class: 'arp-player-bar' },
        loopButton('▶ Lire en boucle'),
        h(
          'div',
          { class: 'arp-chordpick' },
          h('span', { class: 'dlg-label' }, 'Accord'),
          has ? h('button', { type: 'button', class: 'chip' + (!test ? ' active' : ''), title: 'Le premier accord posé sur la piste', onclick: () => ((test = null), render()) }, 'De la piste') : null,
          h(
            'select',
            { 'aria-label': 'Note fondamentale', class: pickShown ? 'active' : '', onchange: (e) => ((test = { root: +e.target.value, type: cur.type }), render()) },
            !pickShown ? h('option', { value: '', selected: true, disabled: true }, 'Autre…') : null,
            NOTES_FR.map((n, i) => h('option', { value: i, selected: pickShown && cur.root === i }, `${n} (${NOTES[i]})`))
          ),
          h(
            'select',
            { 'aria-label': 'Type d’accord', onchange: (e) => ((test = { root: cur.root, type: e.target.value }), render()) },
            !pickShown ? h('option', { value: '', selected: true, disabled: true }, '—') : null,
            SS.CHORDS.map((c) => h('option', { value: c.id, selected: pickShown && cur.type === c.id }, c.label))
          ),
          h('b', { class: 'arp-chordname' }, hyp ? hyp.name : ''),
          src.from === 'essai' ? h('button', { type: 'button', class: 'btn arp-fill', title: 'Pose cet accord sur toute la boucle de la piste', onclick: fillTrack }, 'Poser sur la piste') : null
        )
      ),
      gridSvg(track.arp, src.notes),
      velRow(),
      stepPanel(),
      !has ? h('small', { class: 'arp-legend' }, 'La piste est vide : choisis un accord, écoute, puis « Poser sur la piste ».') : null
    );
  }

  // exemple écrit sur La mineur : ′ = une octave plus haut, groupes séparés par « · »
  const GROUP = { down3: 3, climb2: 2, fall2: 2, up2: 4, down2: 4, up3: 3, alberti: 4, octaves: 2, repeat: 2, up: 3, down: 3, updown: 4, downup: 4, pedal: 2, pedal_top: 2 };
  function example(motif) {
    const mode = motif.arp.mode;
    const ticks = A().preview({ rate: 1, octaves: 1, seed: 3, ...motif.arp }, [57, 60, 64], 8);
    const base = 57;
    const name = (n) => {
      const o = Math.floor((n - base) / 12);
      return A().noteName(n).replace(/-?\d+$/, '') + (o > 0 ? '′'.repeat(o) : o < 0 ? '↓'.repeat(-o) : '');
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
  const NOTE_LENGTHS = [{ id: 'short', label: 'Piquée' }, { id: 'normal', label: 'Normale' }, ...LENGTHS];
  const noteLenId = (a) => (a.noteLen > 0 ? a.noteLen : a.gate < 0.7 ? 'short' : 'normal');
  const noteLenPatch = (id) => (id === 'short' ? { noteLen: 0, gate: 0.45 } : id === 'normal' ? { noteLen: 0, gate: 0.9 } : { noteLen: +id });

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
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function currentMotif() {
    const a = track.arp;
    return (
      SS.MOTIFS.find((m) => {
        const x = A().normalize({ ...m.arp });
        return x.mode === a.mode && (a.mode !== 'pattern' || x.pattern === a.pattern) && x.rhythm.type === a.rhythm.type &&
          (x.rhythm.type !== 'lane' || same(x.lanes.rhythm, a.lanes.rhythm)) && (!m.arp.octaves || m.arp.octaves === a.octaves);
      }) || { id: '', name: 'Motif personnalisé', cat: '', arp: { mode: a.mode, pattern: a.pattern, rhythm: a.rhythm, lanes: { rhythm: a.lanes.rhythm } } }
    );
  }
  function applyMotif(m, opts) {
    const patch = { mode: m.arp.mode, pattern: m.arp.pattern || '' };
    if (m.arp.octaves) patch.octaves = m.arp.octaves;
    patch.rhythm = m.arp.rhythm || { ...track.arp.rhythm, type: 'all' };
    patch.lanes = { ...track.arp.lanes, rhythm: (m.arp.lanes && m.arp.lanes.rhythm) || [] };
    set(patch, opts);
  }

  /** Carte du motif en cours (écran principal). */
  function motifCard() {
    const cur = currentMotif();
    const i = SS.MOTIFS.indexOf(cur);
    const cat = SS.MOTIF_CATS.find((c) => c.id === cur.cat);
    const step = (d) => {
      const m = SS.MOTIFS[(i + d + SS.MOTIFS.length) % SS.MOTIFS.length];
      remember(m.id);
      applyMotif(m);
    };
    return h(
      'div',
      { class: 'arp-field' },
      h('span', { class: 'dlg-label' }, 'Motif'),
      h(
        'div',
        { class: 'arp-motif-card' },
        h('button', { type: 'button', class: 'arp-motif-main', title: 'Choisir un autre motif', onclick: openPicker },
          h('span', { class: 'arp-motif-icon', html: styleIcon(cur) }),
          h('span', { class: 'arp-motif-text' }, h('b', {}, cur.name), h('small', {}, (cat ? cat.label + ' · ' : '') + example(cur)))
        ),
        h('button', { type: 'button', class: 'btn arp-motif-nav', title: 'Motif précédent', onclick: () => step(-1) }, '‹'),
        h('button', { type: 'button', class: 'btn arp-motif-nav', title: 'Motif suivant', onclick: () => step(1) }, '›'),
        h('button', { type: 'button', class: 'btn btn-accent arp-motif-change', onclick: openPicker }, `Changer de motif…`)
      )
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
    app.changed();
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

  function settingsView() {
    const arp = track.arp;
    const rs = splitRate(arp.rate);
    return h(
      'section',
      { class: 'arp-simple' },
      motifCard(),
      h(
        'div',
        { class: 'arp-simple-row' },
        h('div', { class: 'arp-field' }, h('span', { class: 'dlg-label' }, 'Vitesse'), segmented(BASE_RATES, rs ? rs.base : '', (v) => set({ rate: +v * (rs ? rs.feel : 1) })), segmented(FEEL, rs ? rs.feel : '', (v) => set({ rate: (rs ? rs.base : 1) * +v }))),
        h(
          'div',
          { class: 'arp-field' },
          h('span', { class: 'dlg-label' }, 'Octaves'),
          segmented([1, 2, 3, 4].map((o) => ({ id: o, label: String(o) })), arp.octaves, (v) => set({ octaves: +v })),
          h('span', { class: 'dlg-label' }, 'Motif'),
          segmented([4, 8, 16].map((n) => ({ id: n, label: `${n} pas` })), arp.steps, (v) => set({ steps: +v, lanes: sizedLanes(arp, +v) }))
        )
      ),
      h(
        'div',
        { class: 'arp-field' },
        h('span', { class: 'dlg-label' }, 'Longueur des notes'),
        segmented(NOTE_LENGTHS, noteLenId(arp), (v) => set(noteLenPatch(v))),
        h('small', { class: 'arp-help' }, 'Piquée / Normale suivent la vitesse ; 1 temps = une noire. Un pas peut avoir sa propre longueur.')
      ),
      slider('Jeu humain', Math.round(arp.human * 100), 0, 100, 5, (v) => (v ? `${v} %` : 'machine'), (v, push) => set({ human: v / 100 }, { push }), {
        cls: 'wide',
        scale: ['machine', 'naturel', 'très libre'],
        help: 'Petits décalages (jusqu’à ±12 ms), temps forts accentués, vélocités et longueurs légèrement variées — toujours les mêmes à la même graine.',
      })
    );
  }

  function render() {
    if (!track || sliding) return;
    if (sel != null && sel >= P()) sel = null;
    const body = dlg.querySelector('.arp-body');
    const scroll = body.scrollTop;
    body.replaceChildren(playerView(), settingsView());
    body.scrollTop = scroll;
    dlg.querySelector('.arp-undo').disabled = !undo.length;
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
        h('div', { class: 'sd-head' }, h('div', {}, h('h2', {}, 'Arpégiateur'), h('p', { class: 'dlg-sub arp-sub' }))),
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
              title: 'Revenir à un arpège montant simple (1/16, 1 octave, pas neutres)',
              onclick: () => ((sel = null), set({ ...clone(A().DEFAULTS), rate: 1, seed: track.arp.seed })),
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
    if (picker && picker.open) picker.close();
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
    sel = null;
    render();
    dlg.showModal();
  }

  return { init: (a) => (app = a), open, _loop: loop };
})();
