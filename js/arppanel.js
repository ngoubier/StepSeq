/*
 * Fenêtre de l'arpégiateur (moteur : js/arp.js) d'une piste Arpège.
 *
 *   En-tête (toujours visible) : ▶ lecture en boucle sur un accord d'essai, grille des pas avec curseur,
 *     vélocités ; un clic sur un pas règle sa vélocité, sa longueur, ses notes à la fois ou en fait un silence.
 *     La boucle dure le plus petit nombre de mesures entières qui contient au moins 16 pas et un cycle complet
 *     du motif ; au-delà de 16 pas, la grille passe en pages qui suivent le curseur.
 *   Onglet Arpège : motif (tuile → fenêtre de choix, js/motifs.js), vitesse, octaves, pas, geste, durée des notes.
 *   Onglet Geste : gestes tout prêts, pavé (étalement × alternance), zoom sur un groupe, 5 curseurs dans l'ordre
 *     d'application (étalement, alternance, microvariation, accent, articulation), écoute Régulier / Geste.
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
  /*
   * Longueur de la boucle d'écoute : le plus petit nombre de mesures entières qui contient au moins
   * 16 pas d'arpège ET un cycle complet du motif. La grille montre exactement ce qui est joué,
   * par pages de 16 pas qui suivent le curseur.
   */
  const view = { page: 0 };
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
    const notes = sourceChord().notes;
    const spb = SS.stepsPerBar(app.project());
    const rate = track.arp.rate;
    const period = motifPeriod(notes);
    let bars = 1;
    while (bars < 16 && Math.ceil(bars * spb * rate - 1e-9) < Math.max(16, period)) bars++;
    const steps = bars * spb;
    const ticks = Math.ceil(steps * rate - 1e-9);
    return { bars, steps, ticks, period, pages: Math.ceil(ticks / N) };
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
      const arp = gesteCompare === 'regulier' ? { ...track.arp, geste: undefined } : track.arp; // « Écouter : Régulier »
      const out = A().renderStep(arp, ev, s, { loop: lp, stepSec, stepsPerBeat: SS.stepsPerBeat(project), trackLen: total });
      out.forEach((n) => {
        const group = out.filter((x) => x.at === n.at);
        SS.audio.playNote(track, n.midi, loop.next + n.at, n.dur, n.vel * (group.length > 1 ? 0.8 : 1), undefined, group.indexOf(n), group.length, { cutoff: n.cutoff });
      });
      // une entrée par pas d'arpège (et non par double-croche) : le curseur passe par chaque colonne
      const rate = track.arp.rate;
      for (let k = Math.ceil(s * rate - 1e-9); k < Math.ceil((s + 1) * rate - 1e-9); k++) loop.queue.push({ time: loop.next + (k / rate - s) * stepSec, tick: k });
      loop.next += stepSec;
      loop.step++;
    }
  }

  /** Curseur de lecture sur la grille (les 16 premiers pas d'arpège de chaque accord). */
  function drawHead() {
    if (!loop.on) return;
    const now = SS.audio.ensureCtx().currentTime;
    while (loop.queue.length && loop.queue[0].time <= now) loop.tick = loop.queue.shift().tick;
    if (loop.tick >= 0 && Math.floor(loop.tick / N) !== view.page) {
      view.page = Math.floor(loop.tick / N); // la page suit le curseur
      render();
    }
    const head = dlg && dlg.querySelector('.arp-head');
    if (head) {
      const cw = +head.getAttribute('width');
      head.setAttribute('x', loop.tick >= 0 ? (loop.tick % N) * cw : -100);
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
    const info = loopInfo();
    if (view.page >= info.pages) view.page = 0;
    const off = view.page * N;
    const cols = Math.min(N, info.ticks - off);
    const ticks = A().preview(arp, notes, info.ticks, { loop: 0, stepsPerBeat: 4 }).slice(off, off + cols);
    const all = ticks.flatMap((t) => (t ? t.notes : []));
    const W = 640;
    const H = 120;
    const cw = W / N;
    const p = P();
    let svg = '';
    for (let i = 0; i < N; i++) {
      if (i >= cols) {
        svg += `<rect class="ag-end" x="${i * cw + 1}" y="1" width="${cw - 2}" height="${H - 2}" rx="3"/>`;
        continue;
      }
      const cls = (i % 4 === 0 ? 'ag-beat' : 'ag-col') + ((off + i) % p !== off + i ? ' ag-rep' : '');
      svg += `<rect class="${cls}" x="${i * cw + 1}" y="1" width="${cw - 2}" height="${H - 2}" rx="3"/>`;
      svg += `<text class="ag-num" x="${(i * cw + cw / 2).toFixed(1)}" y="${H - 3}">${off + i + 1}</text>`;
      if (sel != null && (off + i) % p === sel) svg += `<rect class="arp-sel" x="${i * cw + 1.5}" y="1.5" width="${cw - 3}" height="${H - 3}" rx="3"/>`;
    }
    if (cols < N) svg += `<text class="ag-endtxt" x="${(cols * cw + (N * cw)) / 2}" y="${H / 2}">fin de la boucle</text>`;
    svg += `<rect class="arp-head" x="${loop.on && loop.tick >= 0 && Math.floor(loop.tick / N) === view.page ? (loop.tick % N) * cw : -100}" y="0" width="${cw}" height="${H}" rx="3"/>`;
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
          const sx = (i + (t.shift || 0)) * cw; // attaque déplacée par le geste
          const w = Math.min(cw * t.gate, W - sx) - 3;
          const op = (0.3 + 0.7 * t.vel).toFixed(2);
          svg += `<rect class="note" x="${sx + 2}" y="${(y(n) - 4).toFixed(1)}" width="${Math.max(4, w).toFixed(1)}" height="8" rx="2" style="opacity:${op}"/>`;
        });
        const label = t.notes.map((n) => A().noteName(n).replace(/-?\d+$/, '')).join('+');
        svg += `<text x="${(i * cw + cw / 2).toFixed(1)}" y="12">${label}</text>`;
      });
    }
    const wrap = h('div', { class: 'arp-grid-wrap', html: `<svg class="arp-grid" viewBox="0 0 ${W} ${H}" role="img">${svg}</svg>` });
    wrap.firstChild.addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N)));
      if (i >= cols) return;
      const k = (off + i) % P();
      sel = sel === k ? null : k;
      render();
    });
    const pager = h(
      'div',
      { class: 'arp-pager' },
      h('span', {}, `Boucle : ${info.bars} mesure${info.bars > 1 ? 's' : ''} · ${info.ticks} pas`),
      h('span', { class: 'spacer' }),
      info.pages > 1
        ? [
            h('button', { type: 'button', class: 'sd-mini', disabled: view.page === 0, onclick: () => ((view.page = Math.max(0, view.page - 1)), render()) }, '‹'),
            h('b', {}, `Page ${view.page + 1} / ${info.pages}`),
            h('button', { type: 'button', class: 'sd-mini', disabled: view.page >= info.pages - 1, onclick: () => ((view.page = Math.min(info.pages - 1, view.page + 1)), render()) }, '›'),
            loop.on ? h('small', {}, 'suit la lecture') : null,
          ]
        : null
    );
    return h('div', {}, pager, wrap);
  }

  /** Rangée de vélocités sous la grille : cliquer / glisser verticalement pour régler chaque pas. */
  function velRow() {
    const p = P();
    const row = h('div', { class: 'arp-vels', title: 'Vélocité de chaque pas : cliquer / glisser verticalement' });
    const info = loopInfo();
    const off = view.page * N;
    for (let i = 0; i < N; i++) {
      if (off + i >= info.ticks) {
        row.append(h('span', { class: 'arp-vel end' }));
        continue;
      }
      const k = (off + i) % p;
      const v = stepValues(k).vel;
      row.append(h('span', { class: 'arp-vel' + (k !== off + i ? ' rep' : '') + (sel != null && k === sel ? ' sel' : '') }, h('i', { style: `height:${Math.round(v * 100)}%` })));
    }
    let drag = false;
    const apply = (e, push) => {
      const r = row.getBoundingClientRect();
      const i = Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N)));
      const v = Math.max(0.05, Math.min(1, Math.round((1 - (e.clientY - r.top) / r.height) * 20) / 20));
      if (off + i >= info.ticks) return;
      const j = (off + i) % p;
      if (!push && stepValues(j).vel === v) return;
      if (push) undo.push(clone(track.arp));
      const lanes = sizedLanes(track.arp, p);
      lanes.vel[j] = v;
      // la vélocité seule ne doit pas activer la ligne de rythme si elle n'existe pas encore
      if (!track.arp.lanes.rhythm.length && track.arp.rhythm.type !== 'lane') lanes.rhythm = [];
      track.arp = A().normalize({ ...track.arp, lanes, preset: '' });
      row.querySelectorAll('.arp-vel').forEach((c, k) => off + k < info.ticks && (off + k) % p === j && (c.firstChild.style.height = `${Math.round(v * 100)}%`));
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

  /* ---------- Geste : étalement, alternance, microvariation, accent, articulation (moteur : SS.Arp.gesteTimes) ---------- */
  let tab = 'arp'; // onglet sous l'en-tête : 'arp' (réglages) ou 'geste' (ajuster le geste)
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
    app.changed();
    const z = dlg.querySelector('.geste-zoom-svg');
    if (z) z.innerHTML = gesteSvg(gesteOf(), groupSize(), stepMs(), true);
  }
  const stepMs = () => 60000 / app.project().tempo / 4 / track.arp.rate; // durée d'un pas d'arpège
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
        h('small', { class: 'arp-help' }, (preset ? `${preset.label} — ${preset.desc}` : 'Personnalisé') + ` · groupes de ${n} notes`),
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
        h('div', { class: 'geste-pad-col' }, gestePad(), h('small', { class: 'arp-help' }, 'Glisser : horizontal = étalement, vertical = alternance.')),
        h(
          'div',
          { class: 'geste-zoom' },
          h(
            'div',
            { class: 'geste-zoom-head' },
            h('span', { class: 'dlg-label' }, `Zoom sur un groupe · ${app.project().tempo} BPM`),
            h('span', { class: 'spacer' }),
            h('span', { class: 'dlg-label' }, 'Groupes de'),
            segmented([{ id: 0, label: `Auto (${groupAuto()})` }, ...A().GROUP_SIZES.map((k) => ({ id: k, label: String(k) }))], g.group || 0, (v) => setGeste({ group: +v }), 'Taille des groupes')
          ),
          h('div', { class: 'geste-zoom-svg', html: gesteSvg(g, n, sub, true) }),
          h(
            'div',
            { class: 'ab' },
            h('small', { class: 'arp-help' }, 'Pointillés : la grille · jaune : respiration avant le groupe suivant.'),
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
  const formRow = (label, ...ctrl) => h('div', { class: 'arp-frow' }, h('span', { class: 'arp-flabel' }, label), h('div', { class: 'arp-fctrl' }, ...ctrl));

  function settingsView() {
    const arp = track.arp;
    const rs = splitRate(arp.rate);
    return h(
      'section',
      { class: 'arp-form' },
      formRow('Motif', motifTile()),
      formRow(
        'Vitesse',
        segmented(BASE_RATES, rs ? rs.base : '', (v) => set({ rate: +v * (rs ? rs.feel : 1) }), 'Vitesse'),
        segmented(FEEL, rs ? rs.feel : '', (v) => set({ rate: (rs ? rs.base : 1) * +v }), 'Triolet ou pointée')
      ),
      formRow('Octaves', segmented([1, 2, 3, 4].map((o) => ({ id: o, label: String(o) })), arp.octaves, (v) => set({ octaves: +v }), 'Octaves')),
      formRow('Pas', segmented([4, 8, 16].map((n) => ({ id: n, label: String(n) })), arp.steps, (v) => set({ steps: +v, lanes: sizedLanes(arp, +v) }), 'Nombre de pas du motif'), h('small', { class: 'arp-fhelp' }, 'longueur de la grille réglable pas à pas')),
      formRow('Geste', h('div', { class: 'geste-line' }, gesteChips(false), h('button', { type: 'button', class: 'btn geste-adjust', title: 'Régler finement le geste', onclick: () => ((tab = 'geste'), render()) }, 'Ajuster ›'))),
      formRow(
        'Durée des notes',
        segmented([{ id: 'geste', label: 'Selon le geste' }, ...LENGTHS], arp.noteLen > 0 ? arp.noteLen : 'geste', (v) => set(v === 'geste' ? { noteLen: 0 } : { noteLen: +v }), 'Durée des notes')
      )
    );
  }

  function render() {
    if (!track || sliding) return;
    if (sel != null && sel >= P()) sel = null;
    const body = dlg.querySelector('.arp-body');
    const scroll = body.scrollTop;
    const tabs = h(
      'div',
      { class: 'arp-tabs2', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'arp'), class: tab === 'arp' ? 'on' : '', onclick: () => ((tab = 'arp'), render()) }, 'Arpège'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'geste'), class: tab === 'geste' ? 'on' : '', onclick: () => ((tab = 'geste'), render()) }, 'Geste')
    );
    body.replaceChildren(playerView(), h('div', { class: 'arp-tabbox' }, tabs, h('div', { class: 'arp-tabpanel', role: 'tabpanel' }, tab === 'arp' ? settingsView() : gesteTab())));
    body.scrollTop = scroll;
    dlg.querySelector('.arp-undo').disabled = !undo.length;
  }

  function build() {
    dlg = h(
      'dialog',
      { id: 'arpDialog', class: 'sd-dialog arp-dialog' },
      h(
        'form',
        { method: 'dialog' },
        h('div', { class: 'sd-head' }, h('h2', {}, 'Arpégiateur')),
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
    tab = 'arp';
    gesteCompare = 'geste';
    view.page = 0;
    render();
    dlg.showModal();
  }

  // _loop / _info / _view : accès pour les tests de bout en bout
  return { init: (a) => (app = a), open, _loop: loop, _info: () => loopInfo(), _view: view };
})();
