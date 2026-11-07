/*
 * Interface : rendu des pistes, grille de pas, piano roll, dialogue d'ajout de piste.
 */
window.SS = window.SS || {};

SS.ui = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
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

  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" class="fill"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    drum: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/><path d="M4 12l4 5M20 12l-4 5M12 11v8"/></svg>',
    keys: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M12 5v14M16 5v14"/><path d="M6.5 5h3v8h-3zM14.5 5h3v8h-3z" class="fill"/></svg>',
    arp: '<svg viewBox="0 0 24 24"><path d="M4 19h4v-4h4v-4h4V7h4"/></svg>',
    chord: '<svg viewBox="0 0 24 24"><circle cx="8" cy="17" r="2.5" class="fill"/><circle cx="8" cy="11" r="2.5" class="fill"/><circle cx="8" cy="5" r="2.5" class="fill"/><path d="M10.5 17V3"/></svg>',
  };

  const CHORD_SUFFIX = { maj: '', min: 'm', 7: '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', dim: '°', aug: '+', add9: 'add9', m9: 'm9', 5: '5' };

  let app; // { project(), changed(), state }
  const refs = new Map(); // trackId -> { el, cells: [], roll: Map<midi, cells[]> }
  let nowStep = -1;

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */

  function cellClass(project, s, base) {
    const beat = SS.stepsPerBeat(project);
    const bar = SS.stepsPerBar(project);
    let c = base;
    if (s > 0 && s % bar === 0) c += ' bar';
    else if (s > 0 && s % beat === 0) c += ' beat';
    if (Math.floor((s % bar) / beat) % 2 === 1) c += ' alt';
    return c;
  }

  function eventLabel(track, ev) {
    if (track.category === 'mono' || ev.notes.length === 1) return SS.noteName(ev.notes[0]);
    const root = SS.NOTE_NAMES[ev.notes[0] % 12];
    return root + (CHORD_SUFFIX[ev.chord] ?? '');
  }

  function trackSubtitle(track) {
    if (track.type === 'drum') {
      const t = SS.DRUM_TYPES.find((d) => d.id === track.sound);
      return `${track.machine} · ${t ? t.label : track.sound} ${(track.variant || 0) + 1}`;
    }
    const cat = SS.CATEGORIES.find((c) => c.id === track.category);
    return `${cat ? cat.label : ''} · ${SS.findInstrument(track.family, track.instrument).label}`;
  }

  function trackIcon(track) {
    if (track.type === 'drum') return ICONS.drum;
    if (track.category === 'arp') return ICONS.arp;
    if (track.category === 'chord') return ICONS.chord;
    return ICONS.keys;
  }

  const findEventAt = (track, s) => track.events.find((e) => s >= e.step && s < e.step + e.len);

  /** Message temporaire, avec un bouton d'action optionnel { label, run }. */
  function toast(msg, ms = 2600, action) {
    const t = $('#toast');
    t.replaceChildren(h('span', {}, msg));
    if (action) {
      t.append(
        h('button', {
          type: 'button',
          class: 'toast-action',
          onclick: () => {
            t.classList.remove('show');
            action.run();
          },
        }, action.label)
      );
    }
    t.classList.toggle('has-action', !!action);
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ------------------------------------------------------------------ */
  /* Rendu                                                               */
  /* ------------------------------------------------------------------ */

  function renderRuler() {
    const p = app.project();
    const n = SS.totalSteps(p);
    const spb = SS.stepsPerBar(p);
    const beat = SS.stepsPerBeat(p);
    const grid = h('div', { class: 'grid' });
    for (let s = 0; s < n; s++) {
      let label = '';
      let cls = cellClass(p, s, '');
      if (s % spb === 0) label = String(s / spb + 1);
      else if (s % beat === 0) label = `.${Math.floor((s % spb) / beat) + 1}`;
      if (s % spb === 0) cls += ' bar';
      grid.append(h('div', { class: cls, 'data-step': s }, label));
    }
    const ruler = $('#ruler');
    ruler.replaceChildren(h('div', { class: 'head-spacer' }), grid);
  }

  function renderAll() {
    const p = app.project();
    document.documentElement.style.setProperty('--steps', SS.totalSteps(p));
    // colonnes fixes : chaque pas est un petit carré, avec un écart en début de temps et de mesure
    const beat = SS.stepsPerBeat(p);
    const bar = SS.stepsPerBar(p);
    const cols = [];
    for (let i = 0; i < SS.totalSteps(p); i++) cols.push(i > 0 && i % bar === 0 ? '40px' : i > 0 && i % beat === 0 ? '34px' : '30px');
    document.documentElement.style.setProperty('--grid-cols', cols.join(' '));
    renderRuler();
    const container = $('#tracks');
    container.replaceChildren();
    refs.clear();
    p.tracks.forEach((t) => container.append(buildTrack(t)));
    $('#empty').classList.toggle('show', p.tracks.length === 0);
    $('#ruler').style.display = p.tracks.length ? '' : 'none';
    setPlayhead(nowStep);
    updateNoteButton();
  }

  function renderTrack(track) {
    const old = refs.get(track.id);
    const el = buildTrack(track);
    if (old) old.el.replaceWith(el);
    else $('#tracks').append(el);
    setPlayhead(nowStep);
  }

  function buildTrack(track) {
    const p = app.project();
    const n = SS.totalSteps(p);
    const ref = { el: null, cells: [], roll: new Map() };
    refs.set(track.id, ref);

    const isOpen = app.state.openRolls.has(track.id);
    const head = h(
      'div',
      { class: 'track-head' },
      h('button', { class: 'th-btn', title: 'Écouter', html: ICONS.play, onclick: () => SS.audio.preview(track, previewNotes(track)) }),
      h('button', {
        class: 'th-btn box mute' + (track.mute ? ' on' : ''),
        title: 'Muet',
        onclick: (e) => {
          track.mute = !track.mute;
          e.currentTarget.classList.toggle('on', track.mute);
          app.changed();
        },
      }, 'M'),
      h('button', {
        class: 'th-btn box solo' + (track.solo ? ' on' : ''),
        title: 'Solo',
        onclick: (e) => {
          track.solo = !track.solo;
          e.currentTarget.classList.toggle('on', track.solo);
          app.changed();
        },
      }, 'S'),
      h('span', { class: 'th-icon', html: trackIcon(track) }),
      h(
        'div',
        { class: 'th-name', title: 'Double-clic pour renommer', ondblclick: (e) => rename(track, e.currentTarget) },
        h('b', {}, track.name),
        h('small', {}, trackSubtitle(track))
      ),
      h('input', {
        class: 'th-vol',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        value: track.volume,
        title: 'Volume',
        oninput: (e) => {
          track.volume = parseFloat(e.target.value);
          SS.audio.setTrackGain(track, track.volume);
          app.changed();
        },
      }),
      track.type === 'instrument'
        ? h('button', {
            class: 'th-btn' + (isOpen ? ' open' : ''),
            title: 'Afficher / masquer le piano roll',
            html: ICONS.chevron,
            onclick: () => {
              if (isOpen) app.state.openRolls.delete(track.id);
              else app.state.openRolls.add(track.id);
              renderTrack(track);
            },
          })
        : null,
      track.type === 'instrument'
        ? h('button', { class: 'th-btn', title: 'Sound design', html: ICONS.sliders, onclick: () => SS.soundDesign.open(track) })
        : null,
      h('button', { class: 'th-btn', title: 'Modifier la piste', html: ICONS.gear, onclick: () => app.editTrack(track) }),
      h('button', { class: 'th-btn', title: 'Supprimer la piste', html: ICONS.close, onclick: () => app.deleteTrack(track) })
    );

    const grid = h('div', { class: 'grid' });
    for (let s = 0; s < n; s++) {
      const c = h('div', { class: cellClass(p, s, 'cell'), 'data-step': s }, h('div', { class: 'fill' }));
      ref.cells.push(c);
      grid.append(c);
    }
    grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell || e.button !== 0) return; // le clic droit est réservé au menu d'accord
      e.preventDefault();
      const s = +cell.dataset.step;
      if (track.type === 'drum') drumGesture(track, s, e);
      else noteGesture(track, s, null, e);
    });

    grid.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('.cell');
      if (cell) chordMenuFromEvent(track, +cell.dataset.step, e);
    });

    const el = h('div', { class: 'track', style: `--c:${track.color}`, 'data-id': track.id }, h('div', { class: 'track-row' }, head, grid));
    if (track.type === 'instrument' && isOpen) el.append(buildRoll(track, ref));
    ref.el = el;
    SS.audio.setTrackGain(track, track.volume);
    paint(track);
    return el;
  }

  function previewNotes(track) {
    if (track.type === 'drum') return null;
    const root = track.lastRoot ?? (track.octave + 1) * 12;
    return track.category === 'mono' ? root : SS.chordNotes(root, track.chord);
  }

  function rename(track, box) {
    const input = h('input', { type: 'text', value: track.name });
    box.replaceChildren(input);
    input.focus();
    input.select();
    const done = (commit) => {
      if (commit && input.value.trim()) {
        track.name = input.value.trim();
        app.changed();
      }
      renderTrack(track);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true), { once: true });
  }

  /* ---------- Piano roll ---------- */

  function buildRoll(track, ref) {
    const p = app.project();
    const n = SS.totalSteps(p);
    const low = (track.octave + 1) * 12;
    const high = low + 24;

    const sel = (options, value, onchange) =>
      h(
        'select',
        { onchange: (e) => onchange(e.target.value) },
        options.map((o) => h('option', { value: o.id, selected: String(o.id) === String(value) }, o.label))
      );

    const tools = h(
      'div',
      { class: 'roll-tools' },
      h(
        'label',
        {},
        'Octave',
        h('button', { type: 'button', onclick: () => shiftOctave(track, -1), title: 'Octave inférieure' }, '−'),
        h('b', {}, `C${track.octave} – C${track.octave + 2}`),
        h('button', { type: 'button', onclick: () => shiftOctave(track, 1), title: 'Octave supérieure' }, '+')
      ),
      track.category !== 'mono'
        ? h(
            'label',
            {},
            'Accord',
            sel(SS.CHORDS, track.chord, (v) => {
              track.chord = v;
              app.changed();
            })
          )
        : null,
      track.category === 'arp'
        ? [
            h('label', {}, 'Mode', sel(SS.ARP_MODES, track.arp.mode, (v) => ((track.arp.mode = v), app.changed()))),
            h('label', {}, 'Vitesse', sel(SS.ARP_RATES, track.arp.rate, (v) => ((track.arp.rate = parseFloat(v)), app.changed()))),
            h(
              'label',
              {},
              'Octaves',
              sel([1, 2, 3].map((o) => ({ id: o, label: String(o) })), track.arp.octaves, (v) => ((track.arp.octaves = +v), app.changed()))
            ),
          ]
        : null,
      h(
        'span',
        { style: 'opacity:.8' },
        track.category === 'mono'
          ? 'Cliquer pour poser une note, glisser vers la droite pour l’allonger.'
          : 'Cliquer sur la fondamentale pour poser un accord, glisser pour l’allonger. Clic droit (ou appui long) sur un accord : changer son type.'
      ),
      h(
        'button',
        {
          type: 'button',
          title: 'Effacer toutes les notes',
          onclick: () => {
            if (!track.events.length || confirm('Effacer toutes les notes de cette piste ?')) {
              track.events = [];
              paint(track);
              app.changed();
            }
          },
        },
        'Effacer'
      ),
      h(
        'button',
        { type: 'button', class: 'roll-sd', title: 'Sound design : oscillateur, filtre, enveloppe', onclick: () => SS.soundDesign.open(track) },
        h('span', { html: ICONS.sliders }),
        'Sound design'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'roll-close',
          title: 'Fermer le piano roll',
          'aria-label': 'Fermer le piano roll',
          onclick: () => {
            app.state.openRolls.delete(track.id);
            renderTrack(track);
          },
        },
        h('span', { html: ICONS.close }),
        'Fermer'
      )
    );

    const roll = h('div', { class: 'roll' }, tools);
    for (let midi = high; midi >= low; midi--) {
      const black = SS.isBlackKey(midi);
      const isC = midi % 12 === 0;
      const cells = [];
      const grid = h('div', { class: 'grid' });
      for (let s = 0; s < n; s++) {
        const c = h('div', { class: cellClass(p, s, 'rcell'), 'data-step': s, 'data-midi': midi });
        cells.push(c);
        grid.append(c);
      }
      ref.roll.set(midi, cells);
      grid.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('.rcell');
        if (cell) chordMenuFromEvent(track, +cell.dataset.step, e);
      });
      grid.addEventListener('pointerdown', (e) => {
        const cell = e.target.closest('.rcell');
        if (!cell || e.button !== 0) return;
        e.preventDefault();
        noteGesture(track, +cell.dataset.step, +cell.dataset.midi, e);
      });
      roll.append(
        h(
          'div',
          { class: 'roll-row' + (black ? ' black' : '') + (isC ? ' c' : '') },
          h(
            'div',
            { class: 'roll-key' },
            h(
              'span',
              {
                class: (black ? 'black' : '') + (isC ? ' c' : ''),
                onpointerdown: () => SS.audio.preview(track, track.category === 'mono' ? midi : SS.chordNotes(midi, track.chord)),
              },
              isC || !black ? SS.noteName(midi) : ''
            )
          ),
          grid
        )
      );
    }
    return roll;
  }

  function shiftOctave(track, d) {
    track.octave = Math.max(0, Math.min(7, track.octave + d));
    app.changed();
    renderTrack(track);
  }

  /* ---------- Peinture des cases ---------- */

  function paint(track) {
    const ref = refs.get(track.id);
    if (!ref) return;
    if (track.type === 'drum') {
      ref.cells.forEach((c, s) => {
        const v = track.steps[s] || 0;
        c.classList.toggle('on', v > 0);
        c.style.setProperty('--v', v);
        c.title = v > 0 ? `Vélocité ${Math.round(v * 127)}` : '';
      });
      return;
    }
    ref.cells.forEach((c) => {
      c.classList.remove('on', 'start', 'hold', 'end', 'held', 'sel', 'sel-hold');
      c.querySelector('.lbl')?.remove();
      c.title = '';
    });
    ref.roll.forEach((cells) => cells.forEach((c) => c.classList.remove('on', 'start', 'root', 'sel')));

    track.events.forEach((ev) => {
      const label = eventLabel(track, ev);
      for (let s = ev.step; s < ev.step + ev.len && s < ref.cells.length; s++) {
        const c = ref.cells[s];
        c.style.setProperty('--v', ev.vel);
        if (s === ev.step) {
          c.classList.add('on', 'start');
          if (ev.len > 1) c.classList.add('held');
          c.append(h('span', { class: 'lbl' }, label));
          c.title = `${label} · vélocité ${Math.round(ev.vel * 127)}`;
        } else {
          c.classList.add('hold');
          if (s === ev.step + ev.len - 1) c.classList.add('end');
        }
        ev.notes.forEach((m, i) => {
          const rc = ref.roll.get(m);
          if (!rc) return;
          const cell = rc[s];
          cell.classList.add('on');
          cell.style.setProperty('--v', ev.vel);
          if (s === ev.step) {
            cell.classList.add('start');
            if (i === 0) cell.classList.add('root');
          }
        });
      }
    });

    // note / accord sélectionné
    if (sel && sel.track === track && track.events.includes(sel.ev)) {
      const ev = sel.ev;
      for (let s = ev.step; s < ev.step + ev.len && s < ref.cells.length; s++) {
        ref.cells[s].classList.add(s === ev.step ? 'sel' : 'sel-hold');
      }
      ev.notes.forEach((m) => {
        const rc = ref.roll.get(m);
        if (rc && rc[ev.step]) rc[ev.step].classList.add('sel');
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Sélection : la note / l'accord en cours                             */
  /* ------------------------------------------------------------------ */

  let sel = null; // { track, ev }

  function validSelection() {
    if (sel && (!app.project().tracks.includes(sel.track) || !sel.track.events || !sel.track.events.includes(sel.ev))) sel = null;
    return sel;
  }

  function select(track, ev) {
    const prev = sel && sel.track;
    sel = track && ev ? { track, ev } : null;
    if (prev && prev !== track) paint(prev);
    if (track) paint(track);
    updateNoteButton();
  }

  function unselectIfRemoved(track) {
    if (sel && sel.track === track && !track.events.includes(sel.ev)) select(null, null);
  }

  function updateNoteButton() {
    const btn = $('#noteBtn');
    if (!btn) return;
    const cur = validSelection();
    btn.disabled = !cur;
    $('#noteBtnLabel').textContent = cur
      ? `${cur.track.category === 'mono' ? 'Note' : 'Accord'} ${eventLabel(cur.track, cur.ev)} · ${cur.track.name}`
      : 'Aucune note sélectionnée';
  }

  /* ------------------------------------------------------------------ */
  /* Gestes souris / tactile                                             */
  /* ------------------------------------------------------------------ */

  function stepFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest('[data-step]');
    return c ? +c.dataset.step : null;
  }

  function track_gesture(onMove, onEnd) {
    const move = (e) => onMove(e);
    const up = (e) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      onEnd && onEnd(e);
      app.changed();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function drumGesture(track, s, e) {
    if (app.state.editMode === 'velocity') {
      if (!track.steps[s]) track.steps[s] = 0.8;
      const startV = track.steps[s];
      const startY = e.clientY;
      paint(track);
      track_gesture((ev) => {
        track.steps[s] = clamp(startV + (startY - ev.clientY) / 120, 0.05, 1);
        paint(track);
      });
      return;
    }
    const value = track.steps[s] > 0 ? 0 : 0.8;
    track.steps[s] = value;
    if (value && !SS.audio.isPlaying()) SS.audio.preview(track);
    paint(track);
    const ref = refs.get(track.id);
    track_gesture((ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const c = el && el.closest('.cell');
      if (!c || !ref.cells.includes(c)) return;
      const s2 = +c.dataset.step;
      if ((track.steps[s2] > 0) !== (value > 0)) {
        track.steps[s2] = value;
        paint(track);
      }
    });
  }

  /** Geste sur une piste instrument : ligne compacte (midi = null) ou piano roll. */
  const LONG_PRESS_MS = 500;

  /** Appui long (tactile / stylet) : onHold après 500 ms immobile, onTap si relâché avant. */
  function longPress(e, onHold, onTap) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('contextmenu', ctx, true);
    };
    const hold = () => {
      cleanup();
      if (navigator.vibrate) navigator.vibrate(12);
      onHold();
    };
    const timer = setTimeout(hold, LONG_PRESS_MS);
    const move = (ev) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) cleanup(); // le doigt a bougé : on annule
    };
    const up = () => {
      cleanup();
      onTap();
    };
    // Le système peut annuler le pointeur pendant un appui long : le minuteur continue et ouvre le menu.
    const cancel = () => {
      document.removeEventListener('pointerup', up, true);
    };
    // Android déclenche son propre « contextmenu » sur un appui long : on ouvre notre menu à la place.
    const ctx = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hold();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('contextmenu', ctx, true);
  }

  function noteGesture(track, s, midi, e) {
    const n = SS.totalSteps(app.project());
    const existing = findEventAt(track, s);

    if (app.state.editMode === 'velocity') {
      if (!existing) return;
      select(track, existing);
      const startV = existing.vel;
      const startY = e.clientY;
      track_gesture((ev) => {
        existing.vel = clamp(startV + (startY - ev.clientY) / 120, 0.05, 1);
        paint(track);
      });
      return;
    }

    // Tactile : un appui long sur un accord ouvre le menu de type d'accord ;
    // un appui court garde le comportement normal (supprimer / remplacer), exécuté au relâchement.
    if (existing && e.pointerType && e.pointerType !== 'mouse' && !e.deferred) {
      const x = e.clientX;
      const y = e.clientY;
      longPress(
        e,
        () => openChordMenu(track, existing, x, y),
        () => noteGesture(track, s, midi, { clientX: x, clientY: y, pointerType: e.pointerType, deferred: true })
      );
      return;
    }

    if (existing && (midi == null || existing.notes.includes(midi) || midi === existing.notes[0])) {
      track.events = track.events.filter((x) => x !== existing);
      unselectIfRemoved(track);
      paint(track);
      app.changed();
      return;
    }

    if (existing) track.events = track.events.filter((x) => x !== existing); // remplace l'accord/note à cet endroit
    const root = midi ?? track.lastRoot ?? (track.octave + 1) * 12;
    track.lastRoot = root;
    const ev = {
      step: s,
      len: 1,
      notes: track.category === 'mono' ? [root] : SS.chordNotes(root, track.chord),
      vel: 0.8,
    };
    if (track.category !== 'mono') ev.chord = track.chord;
    track.events.push(ev);
    track.events.sort((a, b) => a.step - b.step);
    if (!SS.audio.isPlaying()) SS.audio.preview(track, ev.notes.length === 1 ? ev.notes[0] : ev.notes);
    select(track, ev); // la note posée devient la note en cours
    if (e.deferred) {
      app.changed(); // appui court déjà relâché : pas d'allongement
      return;
    }

    track_gesture((pe) => {
      const s2 = stepFromPoint(pe.clientX, pe.clientY);
      if (s2 == null) return;
      const next = track.events.find((x) => x !== ev && x.step > ev.step);
      const maxLen = (next ? next.step : n) - ev.step;
      const len = clamp(s2 - ev.step + 1, 1, maxLen);
      if (len !== ev.len) {
        ev.len = len;
        paint(track);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Menu clic droit : changer le type d'un accord                       */
  /* ------------------------------------------------------------------ */

  let menuEl = null;

  function closeChordMenu() {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onMenuKey, true);
    window.removeEventListener('resize', closeChordMenu);
    document.getElementById('workspace').removeEventListener('scroll', closeChordMenu);
  }
  function onOutside(e) {
    if (menuEl && !menuEl.contains(e.target)) closeChordMenu();
  }
  function onMenuKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeChordMenu();
    }
  }

  function chordMenuFromEvent(track, s, e) {
    if (track.type !== 'instrument') return; // menu normal du navigateur
    e.preventDefault();
    const ev = findEventAt(track, s);
    if (!ev) return;
    openChordMenu(track, ev, e.clientX, e.clientY);
  }

  function openChordMenu(track, ev, x, y) {
    closeChordMenu();
    select(track, ev);
    const mono = track.category === 'mono';
    const root = ev.notes[0];
    const current = ev.chord || '';
    const rootName = SS.NOTE_NAMES[root % 12];
    const apply = (id) => {
      ev.notes = SS.chordNotes(root, id);
      ev.chord = id;
      paint(track);
      updateNoteButton();
      app.changed();
      if (!SS.audio.isPlaying()) SS.audio.preview(track, ev.notes);
      closeChordMenu();
    };
    menuEl = h(
      'div',
      { class: 'ctx-menu', role: 'menu', 'aria-label': mono ? 'Note' : 'Type d’accord' },
      h('div', { class: 'ctx-title' }, mono ? `Note ${SS.noteName(root)}` : `Accord sur ${rootName}`),
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          onclick: () => {
            closeChordMenu();
            openNoteDialog(track, ev);
          },
        },
        h('span', { class: 'ctx-name' }, mono ? 'Modifier la note…' : 'Modifier l’accord…'),
        h('span', { class: 'ctx-desc' }, 'hauteur, longueur')
      ),
      mono ? null : h('hr'),
      (mono ? [] : SS.CHORDS).map((c) =>
        h(
          'button',
          { type: 'button', role: 'menuitemradio', 'aria-checked': String(c.id === current), class: c.id === current ? 'current' : null, onclick: () => apply(c.id) },
          h('span', { class: 'ctx-name' }, rootName + (CHORD_SUFFIX[c.id] ?? '')),
          h('span', { class: 'ctx-desc' }, c.label)
        )
      ),
      h('hr'),
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'danger',
          onclick: () => {
            track.events = track.events.filter((x) => x !== ev);
            unselectIfRemoved(track);
            paint(track);
            app.changed();
            closeChordMenu();
          },
        },
        mono ? 'Supprimer la note' : 'Supprimer l’accord'
      )
    );
    document.body.append(menuEl);
    // garde le menu dans la fenêtre
    const r = menuEl.getBoundingClientRect();
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth, window.visualViewport ? window.visualViewport.width : Infinity);
    const vh = Math.min(window.innerHeight, window.visualViewport ? window.visualViewport.height : Infinity);
    menuEl.style.left = Math.max(8, Math.min(x, vw - r.width - 8)) + 'px';
    menuEl.style.top = Math.max(8, Math.min(y, vh - r.height - 8)) + 'px';
    (menuEl.querySelector('.current') || menuEl.querySelector('button')).focus();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onMenuKey, true);
    window.addEventListener('resize', closeChordMenu);
    document.getElementById('workspace').addEventListener('scroll', closeChordMenu);
  }

  /* ------------------------------------------------------------------ */
  /* Dialogue « Modifier la note / l'accord »                            */
  /* ------------------------------------------------------------------ */

  const nd = { track: null, ev: null, root: 60, chord: 'maj', len: 1, vel: 0.8 };

  function initNoteDialog() {
    nd.el = $('#noteDialog');
    SS.NOTE_NAMES.forEach((n, i) => $('#ndNote').append(h('option', { value: i }, n)));
    for (let o = 0; o <= 8; o++) $('#ndOct').append(h('option', { value: o }, String(o)));
    SS.CHORDS.forEach((c) => $('#ndChord').append(h('option', { value: c.id }, c.label)));

    const pitchChanged = () => {
      nd.root = clamp(+$('#ndNote').value + (+$('#ndOct').value + 1) * 12, 0, 127);
      syncNoteDialog();
      previewNote();
    };
    $('#ndNote').addEventListener('change', pitchChanged);
    $('#ndOct').addEventListener('change', pitchChanged);
    nd.el.querySelectorAll('[data-shift]').forEach((b) =>
      b.addEventListener('click', () => {
        nd.root = clamp(nd.root + +b.dataset.shift, 12, 119);
        syncNoteDialog();
        previewNote();
      })
    );
    $('#ndChord').addEventListener('change', (e) => {
      nd.chord = e.target.value;
      syncNoteDialog();
      previewNote();
    });
    $('#ndLen').addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (Number.isFinite(v)) nd.len = clamp(v, 1, nd.maxLen);
      syncNoteDialog(true);
    });
    $('#ndVel').addEventListener('input', (e) => {
      nd.vel = +e.target.value / 127;
      syncNoteDialog(true);
    });
    $('#ndPreview').addEventListener('click', previewNote);
    $('#ndCancel').addEventListener('click', () => nd.el.close('cancel'));
    $('#ndDelete').addEventListener('click', () => nd.el.close('delete'));
    $('#noteForm').addEventListener('submit', (e) => {
      e.preventDefault();
      nd.el.close('ok');
    });
    nd.el.addEventListener('close', () => {
      const { track, ev } = nd;
      const action = nd.el.returnValue;
      if (!track || !ev || !track.events.includes(ev)) return;
      if (action === 'ok') {
        ev.notes = ndNotes();
        if (track.category !== 'mono') ev.chord = nd.chord;
        ev.len = clamp(nd.len, 1, nd.maxLen);
        ev.vel = clamp(nd.vel, 0.05, 1);
        track.lastRoot = nd.root;
        select(track, ev);
        app.changed();
      } else if (action === 'delete') {
        track.events = track.events.filter((x) => x !== ev);
        unselectIfRemoved(track);
        paint(track);
        app.changed();
      }
    });
    nd.el.addEventListener('keydown', (e) => e.stopPropagation());
    $('#noteBtn').addEventListener('click', () => {
      const cur = validSelection();
      if (cur) openNoteDialog(cur.track, cur.ev);
    });
  }

  const ndNotes = () => (nd.track.category === 'mono' ? [nd.root] : SS.chordNotes(nd.root, nd.chord));

  function previewNote() {
    if (!nd.track) return;
    const notes = ndNotes();
    SS.audio.preview(nd.track, notes.length === 1 ? notes[0] : notes);
  }

  function syncNoteDialog(keepInputs) {
    const mono = nd.track.category === 'mono';
    if (!keepInputs) {
      $('#ndNote').value = String(nd.root % 12);
      $('#ndOct').value = String(Math.floor(nd.root / 12) - 1);
      $('#ndChord').value = nd.chord;
      $('#ndLen').value = nd.len;
      $('#ndVel').value = Math.round(nd.vel * 127);
    }
    $('#ndVelOut').textContent = Math.round(nd.vel * 127);
    const notes = ndNotes();
    const label = mono ? SS.noteName(nd.root) : SS.NOTE_NAMES[nd.root % 12] + (CHORD_SUFFIX[nd.chord] ?? '');
    $('#ndSummary').replaceChildren(
      h('b', {}, label),
      mono ? '' : notes.map(SS.noteName).join(' · '),
      h('span', { style: 'color:var(--muted)' }, `  —  ${nd.len} pas, vélocité ${Math.round(nd.vel * 127)}`)
    );
  }

  function openNoteDialog(track, ev) {
    if (!track || !ev || !track.events.includes(ev)) return;
    closeChordMenu();
    select(track, ev);
    const mono = track.category === 'mono';
    const n = SS.totalSteps(app.project());
    const next = track.events.find((x) => x !== ev && x.step > ev.step);
    nd.track = track;
    nd.ev = ev;
    nd.root = ev.notes[0];
    nd.chord = ev.chord || track.chord || 'maj';
    nd.len = ev.len;
    nd.vel = ev.vel;
    nd.maxLen = (next ? next.step : n) - ev.step;
    $('#ndTitle').textContent = mono ? 'Modifier la note' : 'Modifier l’accord';
    $('#ndPitchLabel').textContent = mono ? 'Hauteur' : 'Fondamentale';
    $('#ndTrack').textContent = `${track.name} · pas ${ev.step + 1}`;
    $('#ndChordRow').hidden = mono;
    $('#ndLen').max = nd.maxLen;
    syncNoteDialog();
    nd.el.returnValue = '';
    nd.el.showModal();
  }

  /* ------------------------------------------------------------------ */
  /* Tête de lecture                                                     */
  /* ------------------------------------------------------------------ */

  function setPlayhead(step) {
    document.querySelectorAll('#workspace .now').forEach((el) => el.classList.remove('now'));
    nowStep = step;
    const p = app.project();
    if (step < 0) {
      $('#position').textContent = '1 . 1 . 1';
      return;
    }
    document.querySelectorAll(`#workspace [data-step="${step}"]`).forEach((el) => el.classList.add('now'));
    const spb = SS.stepsPerBar(p);
    const beat = SS.stepsPerBeat(p);
    $('#position').textContent = `${Math.floor(step / spb) + 1} . ${Math.floor((step % spb) / beat) + 1} . ${(step % beat) + 1}`;
  }

  /* ------------------------------------------------------------------ */
  /* Dialogue d'ajout / modification de piste                            */
  /* ------------------------------------------------------------------ */

  const dlg = {};

  function initDialog() {
    dlg.el = $('#trackDialog');
    dlg.form = $('#trackForm');

    // Couleurs
    const colors = $('#dlgColors');
    SS.COLORS.forEach((c) =>
      colors.append(h('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'data-c': c, title: c, onclick: () => setColor(c) }))
    );
    dlg.colorInput = h('input', { type: 'color', title: 'Couleur personnalisée', oninput: (e) => setColor(e.target.value) });
    colors.append(dlg.colorInput);

    // Types de drum
    SS.DRUM_TYPES.forEach((t) =>
      $('#dlgDrumTypes').append(
        h('button', { type: 'button', class: 'chip', 'data-v': t.id, onclick: () => setDrumSound(t.id, true) }, t.label)
      )
    );
    // Catégories
    SS.CATEGORIES.forEach((c) =>
      $('#dlgCategory').append(
        h('button', {
          type: 'button',
          'data-v': c.id,
          onclick: () => {
            dlg.s.category = c.id;
            syncDialog();
          },
        }, c.label)
      )
    );
    // Familles
    SS.FAMILIES.forEach((f) =>
      $('#dlgFamilies').append(
        h('button', {
          type: 'button',
          class: 'chip',
          'data-v': f.id,
          onclick: () => {
            dlg.s.family = f.id;
            dlg.s.instrument = f.instruments[0].id;
            fillInstruments();
            autoName();
            syncDialog();
          },
        }, f.label)
      )
    );

    $('#dlgType').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      dlg.s.type = b.dataset.v;
      autoName();
      syncDialog();
      if (dlg.s.type === 'drum') refreshMachines();
    });
    $('#dlgName').addEventListener('input', (e) => {
      dlg.s.name = e.target.value;
      dlg.s.nameEdited = true;
    });
    $('#dlgMachine').addEventListener('change', (e) => {
      dlg.s.machine = e.target.value;
      dlg.s.variant = 0;
      refreshVariants(true);
    });
    $('#dlgVariant').addEventListener('change', (e) => {
      dlg.s.variant = +e.target.value;
      previewDialog();
    });
    $('#dlgInstrument').addEventListener('change', (e) => {
      dlg.s.instrument = e.target.value;
      autoName();
      previewDialog();
    });
    $('#dlgPreview').addEventListener('click', previewDialog);
    $('#dlgCancel').addEventListener('click', () => dlg.el.close('cancel'));
    dlg.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!dlg.s.name.trim()) dlg.s.name = defaultName();
      dlg.el.close('ok');
    });
    dlg.el.addEventListener('close', () => {
      const ok = dlg.el.returnValue === 'ok';
      const res = ok ? { ...dlg.s, name: dlg.s.name.trim() } : null;
      dlg.resolve && dlg.resolve(res);
      dlg.resolve = null;
    });
    // Empêche la barre d'espace de lancer la lecture quand le dialogue est ouvert
    dlg.el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  function setColor(c) {
    dlg.s.color = c;
    syncDialog();
  }

  function defaultName() {
    const s = dlg.s;
    if (s.type === 'drum') {
      const t = SS.DRUM_TYPES.find((d) => d.id === s.sound);
      const count = app.project().tracks.filter((x) => x.type === 'drum' && x.sound === s.sound && x.id !== s.editingId).length;
      return `${t ? t.label : 'Drum'} ${count + 1}`;
    }
    return SS.findInstrument(s.family, s.instrument).label.replace(/\s*\(.*\)$/, '');
  }

  function autoName() {
    if (dlg.s.nameEdited) return;
    dlg.s.name = defaultName();
    $('#dlgName').value = dlg.s.name;
  }

  async function setDrumSound(id, preview) {
    dlg.s.sound = id;
    autoName();
    syncDialog();
    await refreshMachines(preview);
  }

  async function refreshMachines(preview) {
    const sel = $('#dlgMachine');
    let machines = [];
    try {
      machines = await SS.audio.drumMachines(dlg.s.sound);
    } catch (e) {
      toast('Impossible de charger la bibliothèque tidal-drum-machines (connexion internet requise).');
    }
    if (!machines.includes(dlg.s.machine)) {
      dlg.s.machine = machines.includes(SS.DEFAULT_MACHINE) ? SS.DEFAULT_MACHINE : machines[0];
      dlg.s.variant = 0;
    }
    sel.replaceChildren(...machines.map((m) => h('option', { value: m, selected: m === dlg.s.machine }, m)));
    await refreshVariants(preview);
  }

  async function refreshVariants(preview) {
    const list = dlg.s.machine ? await SS.audio.drumVariants(dlg.s.machine, dlg.s.sound).catch(() => []) : [];
    if (dlg.s.variant >= list.length) dlg.s.variant = 0;
    $('#dlgVariant').replaceChildren(
      ...list.map((url, i) =>
        h('option', { value: i, selected: i === dlg.s.variant }, `${i + 1} — ${decodeURIComponent(url.split('/').pop())}`)
      )
    );
    if (preview) previewDialog();
  }

  function fillInstruments() {
    const fam = SS.findFamily(dlg.s.family);
    $('#dlgInstrument').replaceChildren(
      ...fam.instruments.map((i) => h('option', { value: i.id, selected: i.id === dlg.s.instrument }, i.label))
    );
  }

  function syncDialog() {
    const s = dlg.s;
    const isDrum = s.type === 'drum';
    $('#dlgType').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.v === s.type);
      b.disabled = !!s.editingId && b.dataset.v !== s.type;
    });
    $('#dlgDrum').hidden = !isDrum;
    $('#dlgInst').hidden = isDrum;
    $('#dlgColors').querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.c === s.color));
    dlg.colorInput.value = s.color;
    $('#dlgDrumTypes').querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.dataset.v === s.sound));
    $('#dlgCategory').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === s.category));
    $('#dlgFamilies').querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.dataset.v === s.family));
  }

  function previewDialog() {
    const s = dlg.s;
    const fake = { ...s, id: null, octave: SS.findFamily(s.family).octave, chord: 'min' };
    if (s.type === 'drum') SS.audio.preview(fake);
    else {
      const root = (SS.findFamily(s.family).octave + 1) * 12;
      SS.audio.preview(fake, s.category === 'mono' ? root : SS.chordNotes(root, 'min'));
    }
  }

  /** Ouvre le dialogue. `track` = piste existante à modifier (ou undefined). Résout avec les options ou null. */
  function openTrackDialog(track) {
    SS.audio.ensureCtx();
    const p = app.project();
    const usedColors = p.tracks.map((t) => t.color);
    const freeColor = SS.COLORS.find((c) => !usedColors.includes(c)) || SS.COLORS[p.tracks.length % SS.COLORS.length];
    dlg.s = track
      ? {
          editingId: track.id,
          type: track.type,
          name: track.name,
          nameEdited: true,
          color: track.color,
          sound: track.sound || 'bd',
          machine: track.machine || SS.DEFAULT_MACHINE,
          variant: track.variant || 0,
          category: track.category || 'mono',
          family: track.family || 'bass',
          instrument: track.instrument || SS.FAMILIES[0].instruments[0].id,
        }
      : {
          editingId: null,
          type: 'drum',
          name: '',
          nameEdited: false,
          color: freeColor,
          sound: 'bd',
          machine: SS.DEFAULT_MACHINE,
          variant: 0,
          category: 'mono',
          family: 'bass',
          instrument: SS.FAMILIES[0].instruments[0].id,
        };
    $('#dlgTitle').textContent = track ? 'Modifier la piste' : 'Nouvelle piste';
    $('#dlgOk').textContent = track ? 'Appliquer' : 'Valider';
    $('#dlgName').value = dlg.s.name;
    autoName();
    fillInstruments();
    syncDialog();
    refreshMachines(false);
    dlg.el.returnValue = '';
    dlg.el.showModal();
    return new Promise((resolve) => (dlg.resolve = resolve));
  }

  /* ------------------------------------------------------------------ */

  function init(appApi) {
    app = appApi;
    initDialog();
    initNoteDialog();
  }

  return { init, renderAll, renderTrack, paint, setPlayhead, toast, openTrackDialog, trackSubtitle, clearSelection: () => select(null, null) };
})();
