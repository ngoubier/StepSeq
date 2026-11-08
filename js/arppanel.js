/*
 * Fenêtre ARP ONE d'une piste Arpège.
 *
 *   PLAY   : un preset musical + quatre macros (RATE, GATE, MOTION, EVOLVE), l'accord reconnu,
 *            les 16 prochains pas, et FREEZE / NOUVELLE GRAINE / RESET / ANNULER.
 *   CREATE : ordre des notes, octaves, harmonie, rythme (euclidien ou ligne), motif relatif,
 *            lignes par pas (vélocité, gate, octave, ratchet, probabilité) de longueurs indépendantes.
 *
 * Tout réglage est écrit dans track.arp (normalisé par SS.Arp.normalize) et s'entend pendant la lecture.
 * Annuler restaure les réglages d'ouverture ; RESET revient aux valeurs exactes du preset.
 */
window.SS = window.SS || {};

SS.arpPanel = (() => {
  const A = () => SS.Arp;
  let app;
  let track = null;
  let snapshot = null;
  let undo = [];
  let tab = 'play';
  let previewPhrase = 0; // passage de boucle affiché (0 = A, 1 = A', 2 = B, 3 = A'')
  let dlg;
  let sliding = false; // pendant le glissé d'un curseur, on ne reconstruit pas la fenêtre

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

  /* ---------- Modification des réglages ---------- */

  /** patch : objet partiel ; push = enregistre l'état précédent pour ANNULER (pas pendant un glissé). */
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

  function sourceChord() {
    // l'accord de l'aperçu : celui du premier accord posé sur la piste, sinon l'accord d'essai du preset
    const ev = (track.events || []).find((e) => e.notes && e.notes.length);
    if (ev) return { notes: ev.notes.slice(), from: 'piste' };
    const p = A().PRESETS.find((x) => x.id === track.arp.preset);
    return { notes: A().parseChordSymbol(p ? p.chord : 'Am', 3), from: 'essai' };
  }

  /* ---------- Rendu ---------- */

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
    return h('div', { class: 'arp-macro' + (opts.cls ? ' ' + opts.cls : '') }, h('label', {}, h('b', {}, label), out), input, opts.help ? h('small', {}, opts.help) : null);
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
    return h('select', { onchange: (e) => onchange(e.target.value) }, options.map((o) => h('option', { value: o.id, selected: o.id === value, title: o.hint || null }, o.label)));
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

  /** Grille des prochains pas : une colonne par pas d'arpège, hauteur = note. */
  function gridSvg(arp, notes) {
    const N = 16;
    const ticks = A().preview(arp, notes, N, { loop: previewPhrase, stepsPerBeat: 4 });
    const all = ticks.flatMap((t) => (t ? t.notes : []));
    const W = 640;
    const H = 120;
    const cw = W / N;
    let svg = '';
    for (let i = 0; i < N; i++) svg += `<rect class="${i % 4 === 0 ? 'ag-beat' : 'ag-col'}" x="${i * cw + 1}" y="1" width="${cw - 2}" height="${H - 2}" rx="3"/>`;
    if (all.length) {
      const lo = Math.min(...all) - 1;
      const hi = Math.max(...all) + 1;
      const y = (n) => H - 8 - ((n - lo) / Math.max(1, hi - lo)) * (H - 22);
      ticks.forEach((t, i) => {
        if (!t) return;
        t.notes.forEach((n) => {
          const w = Math.min(cw * Math.min(t.gate, 4), W - i * cw) - 3;
          const op = (0.35 + 0.65 * t.vel).toFixed(2);
          svg += `<rect class="note${t.anchor ? ' anchor' : ''}" x="${i * cw + 2}" y="${(y(n) - 4).toFixed(1)}" width="${Math.max(4, w).toFixed(1)}" height="8" rx="2" style="opacity:${op}"/>`;
          if (t.ratchet > 1) for (let r = 1; r < t.ratchet; r++) svg += `<line class="ratchet" x1="${(i * cw + 2 + (r * cw) / t.ratchet).toFixed(1)}" x2="${(i * cw + 2 + (r * cw) / t.ratchet).toFixed(1)}" y1="${(y(n) - 6).toFixed(1)}" y2="${(y(n) + 6).toFixed(1)}"/>`;
        });
        if (t.notes.length === 1) svg += `<text x="${(i * cw + cw / 2).toFixed(1)}" y="12">${A().noteName(t.notes[0]).replace(/-?\d+$/, '')}</text>`;
      });
    }
    // innerHTML : l'élément <svg> doit être créé dans l'espace de noms SVG
    return h('div', { html: `<svg class="arp-grid" viewBox="0 0 ${W} ${H}" role="img" aria-label="Les 16 prochains pas de l’arpège">${svg}</svg>` }).firstChild;
  }

  function chordInfo(notes) {
    const hyp = A().analyzeChord(notes);
    if (!hyp.length) return h('span', {}, '—');
    const [b, ...rest] = hyp;
    return h(
      'span',
      { class: 'arp-chord' },
      h('b', {}, b.name),
      ` confiance ${Math.round(b.confidence * 100)} %`,
      rest.length && b.confidence < 0.8 ? h('small', {}, ' · ou ' + rest.slice(0, 2).map((x) => x.name).join(', ')) : null
    );
  }

  function playView() {
    const arp = track.arp;
    const src = sourceChord();
    const preset = A().PRESETS.find((p) => p.id === arp.preset);
    const rateIdx = Math.max(0, A().RATES.findIndex((r) => Math.abs(r.id - arp.rate) < 1e-6));
    return h(
      'section',
      { class: 'arp-play' },
      h(
        'div',
        { class: 'arp-presets' },
        h('label', { class: 'dlg-label', for: 'arpPreset' }, 'Preset'),
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
                listen();
              }
            },
          },
          h('option', { value: '', selected: !preset, disabled: true }, preset ? '—' : 'Personnalisé'),
          A().PRESETS.map((p) => h('option', { value: p.id, selected: p.id === arp.preset }, p.label))
        ),
        h('p', { class: 'arp-desc' }, preset ? `${preset.desc} Accord d’essai : ${preset.chord}, ${preset.bpm} BPM conseillés.` : 'Réglages personnalisés. Choisir un preset repart de ses valeurs exactes.')
      ),
      h(
        'div',
        { class: 'arp-macros' },
        slider('RATE', rateIdx, 0, A().RATES.length - 1, 1, (i) => A().RATES[i].label, (i, push) => set({ rate: A().RATES[i].id }, { push, keepPreset: false }), { help: 'vitesse de la grille' }),
        slider('GATE', Math.round(arp.gate * 100), 5, 200, 1, (v) => `${v} %`, (v, push) => set({ gate: v / 100 }, { push }), { help: 'articulation ; > 100 % : notes liées' }),
        slider('MOTION', Math.round(arp.motion * 100), 0, 100, 1, (v) => (v ? `${v} %` : 'off'), (v, push) => set({ motion: v / 100 }, { push }), { help: 'LFO sur le timbre et la dynamique, jamais sur les notes' }),
        slider('EVOLVE', Math.round(arp.evolve * 100), 0, 100, 1, (v) => (v ? `${v} %` : 'off'), (v, push) => set({ evolve: v / 100 }, { push }), { help: evolveStage(arp.evolve) })
      ),
      h(
        'div',
        { class: 'arp-view' },
        h(
          'div',
          { class: 'arp-view-head' },
          h('span', {}, h('span', { class: 'dlg-label' }, src.from === 'piste' ? 'Accord de la piste ' : 'Accord d’essai '), chordInfo(src.notes)),
          arp.evolve > 0
            ? h(
                'span',
                { class: 'arp-phrases', title: 'Passage de la boucle : EVOLVE varie selon la structure A / A′ / B / A″' },
                ['A', 'A′', 'B', 'A″'].map((l, i) =>
                  h('button', { type: 'button', class: 'chip' + (i === previewPhrase ? ' active' : ''), onclick: () => ((previewPhrase = i), render()) }, l)
                )
              )
            : null
        ),
        gridSvg(arp, src.notes),
        h('small', { class: 'arp-legend' }, 'Les 16 prochains pas. Contour plein : note d’ancrage (premier pas, temps forts), jamais déplacée par EVOLVE.')
      ),
      h(
        'div',
        { class: 'arp-actions' },
        h('button', { type: 'button', class: 'btn btn-accent', onclick: listen }, '▶ Écouter'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn' + (arp.freeze ? ' on' : ''),
            title: 'Fige la variation affichée (le timbre continue de bouger)',
            onclick: () => set({ freeze: !arp.freeze, freezeLoop: previewPhrase }, { keepPreset: true }),
          },
          arp.freeze ? 'FREEZE ✓' : 'FREEZE'
        ),
        h('button', { type: 'button', class: 'btn', title: 'Nouvelle graine pour les choix aléatoires', onclick: () => set({ seed: Math.floor(Math.random() * 999999) + 1 }, { keepPreset: true }) }, `Graine ${arp.seed} ↻`),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            disabled: !arp.preset && !snapshot.preset,
            title: 'Revenir aux valeurs exactes du preset',
            onclick: () => {
              const id = arp.preset || snapshot.preset;
              const next = A().fromPreset(id, { seed: arp.seed });
              if (next) {
                undo.push(clone(track.arp));
                track.arp = next;
                app.changed();
                render();
              }
            },
          },
          'RESET'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            disabled: !undo.length,
            onclick: () => {
              track.arp = A().normalize(undo.pop());
              app.changed();
              render();
            },
          },
          'Annuler'
        )
      )
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
      'section',
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
    body.replaceChildren(tab === 'play' ? playView() : createView());
    body.scrollTop = scroll;
    dlg.querySelectorAll('.arp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    dlg.querySelector('.arp-sub').textContent = `${track.name} · ${A().MODES.find((m) => m.id === track.arp.mode).label} · ${A().rateLabel(track.arp.rate)} · ${track.arp.octaves} oct.`;
  }

  /** Écoute : deux mesures de l'arpège sur l'accord affiché, au tempo du projet. */
  function listen() {
    const project = app.project();
    const notes = sourceChord().notes;
    const stepSec = 60 / project.tempo / 4;
    const ev = { step: 0, len: 32, notes, vel: 0.85 };
    const phrase = [];
    for (let s = 0; s < 32; s++)
      SS.Arp.renderStep(track.arp, ev, s, { loop: previewPhrase, stepSec, stepsPerBeat: SS.stepsPerBeat(project), trackLen: 32 }).forEach((n) =>
        phrase.push({ midi: n.midi, at: s * stepSec + n.at, dur: n.dur, vel: n.vel, cutoff: n.cutoff })
      );
    SS.audio.playPhrase(track, phrase);
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
          h('div', {}, h('h2', {}, 'ARP ONE ', h('small', { class: 'arp-tag' }, 'arpégiateur')), h('p', { class: 'dlg-sub arp-sub' })),
          h(
            'div',
            { class: 'segmented arp-tabs', role: 'tablist' },
            h('button', { type: 'button', 'data-tab': 'play', onclick: () => ((tab = 'play'), render()) }, 'PLAY'),
            h('button', { type: 'button', 'data-tab': 'create', onclick: () => ((tab = 'create'), render()) }, 'CREATE')
          )
        ),
        h('div', { class: 'arp-body' }),
        h(
          'div',
          { class: 'dlg-footer' },
          h('span', { class: 'spacer' }),
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
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
    previewPhrase = track.arp.freeze ? track.arp.freezeLoop % 4 : 0;
    render();
    dlg.showModal();
  }

  function init(appApi) {
    app = appApi;
  }

  return { init, open };
})();
