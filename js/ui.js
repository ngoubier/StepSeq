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
    synth: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 8v5M10 8v5M14 8v5M18 8v5"/><path d="M5 11h2M9 9h2M13 12h2M17 10h2" class="fill"/></svg>',
    sliders: '<svg viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
    grip: '<svg viewBox="0 0 10 20"><circle cx="3" cy="5" r="1.4" class="fill"/><circle cx="7" cy="5" r="1.4" class="fill"/><circle cx="3" cy="10" r="1.4" class="fill"/><circle cx="7" cy="10" r="1.4" class="fill"/><circle cx="3" cy="15" r="1.4" class="fill"/><circle cx="7" cy="15" r="1.4" class="fill"/></svg>',
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
    // accord renversé (la basse n'est pas la fondamentale) ou tonalité choisie : nom calculé d'après les notes
    const key = app.project().key;
    const plain = ev.chord && SS.chordNotes(ev.notes[0], ev.chord).join() === ev.notes.join();
    if (SS.harmony && (!plain || SS.harmony.valid(key))) {
      const id = SS.harmony.identify(ev.notes);
      if (id) return SS.harmony.chordName(key, id);
    }
    const root = SS.NOTE_NAMES[ev.notes[0] % 12];
    return root + (CHORD_SUFFIX[ev.chord] ?? '');
  }

  /* ---------- Palette d'accords de la tonalité (piano roll des pistes Accord / Arpège) ---------- */

  /** Pose l'accord `c` (voir SS.harmony.chords) au dernier endroit cliqué, jusqu'à la fin de la mesure. */
  function placeChord(track, c) {
    const p = app.project();
    const n = SS.trackLen(p, track);
    const spb = SS.stepsPerBar(p);
    let pos = cursor && cursor.trackId === track.id ? cursor.step : 0;
    if (pos >= n) pos = 0;
    const len = Math.min(spb - (pos % spb), n - pos);
    const prev = [...track.events].filter((e) => e.step < pos).sort((a, b) => b.step - a.step)[0];
    const near = prev ? prev.notes[0] : track.lastRoot ?? (track.octave + 1) * 12;
    const notes = SS.harmony.voice(c, near);
    track.events = track.events.filter((e) => e.step < pos || e.step >= pos + len);
    track.events.forEach((e) => {
      if (e.step < pos && e.step + e.len > pos) e.len = pos - e.step;
    });
    const ev = { step: pos, len, notes, vel: 0.8, chord: c.type };
    track.events.push(ev);
    track.events.sort((a, b) => a.step - b.step);
    track.lastRoot = notes[0];
    cursor = { trackId: track.id, step: pos + len >= n ? 0 : pos + len };
    paint(track);
    select(track, ev);
    if (!SS.audio.isPlaying()) SS.audio.preview(track, notes);
    app.changed();
  }

  function buildPalette(track) {
    const key = app.project().key;
    if (track.category === 'mono' || !SS.harmony || !SS.harmony.valid(key)) return null;
    const { diatonic, extra } = SS.harmony.chords(key);
    const chip = (c) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip pal-chip role-' + c.role.id + (c.borrowed ? ' borrowed' : ''),
          title: `${c.name} = ${c.notes.join('–')} (${c.quality}) · ${c.role.text} — pose l'accord au dernier endroit cliqué, jusqu'à la fin de la mesure`,
          onclick: () => placeChord(track, c),
        },
        h('b', {}, c.numeral),
        ' ' + c.name
      );
    return h(
      'div',
      { class: 'roll-palette' },
      h('span', { class: 'pal-label', title: 'Changer la tonalité : bouton « Tonalité » en haut' }, SS.harmony.label(key)),
      diatonic.map(chip),
      h('span', { class: 'pal-sep' }),
      extra.map(chip)
    );
  }

  /** « 2 mes. », « 12 pas »… ou '' si la piste suit la longueur du projet. */
  function lenLabel(track) {
    const p = app.project();
    if (!track.length || track.length >= SS.totalSteps(p)) return '';
    const len = SS.trackLen(p, track);
    const spb = SS.stepsPerBar(p);
    return len % spb === 0 ? `${len / spb} mes.` : `${len} pas`;
  }

  function trackSubtitle(track) {
    const l = app && lenLabel(track);
    return (l ? `⟲ ${l} · ` : '') + trackSubtitleBase(track);
  }

  function trackSubtitleBase(track) {
    if (track.type === 'drum') {
      if (track.source && track.source !== 'tdm') {
        const lib = SS.DRUM_LIBS.find((l) => l.id === track.source);
        return `${lib ? lib.label : track.source} · ${track.bank} ${(track.variant || 0) + 1}`;
      }
      const t = SS.DRUM_TYPES.find((d) => d.id === track.sound);
      return `${track.machine} · ${t ? t.label : track.sound} ${(track.variant || 0) + 1}`;
    }
    const cat = SS.CATEGORIES.find((c) => c.id === track.category);
    if (SS.isAnalog(track)) {
      const patch = SS.findJunoPatch(track.junoPatch);
      const edited = track.juno && Object.keys(track.juno).length ? '*' : '';
      return `${cat ? cat.label : ''} · ${SS.findAnalog(track.instrument).label.replace(/^Roland /, '')} · ${patch ? patch.id + ' ' + patch.name : ''}${edited}`;
    }
    const inst = SS.findInstrument(track.family, track.instrument);
    const variant = inst.files && inst.files.length > 1 ? ` (${SS.variantLabel(inst, SS.sfFile(inst, track))})` : '';
    return `${cat ? cat.label : ''} · ${inst.label}${variant}`;
  }

  function trackIcon(track) {
    if (track.type === 'drum') return ICONS.drum;
    if (SS.isAnalog(track)) return ICONS.synth;
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
    if (SS.mixer && SS.mixer.isOpen()) SS.mixer.render();
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
      h('span', {
        class: 'th-grip',
        role: 'button',
        tabindex: 0,
        title: 'Glisser pour déplacer la piste (ou flèches haut / bas)',
        'aria-label': `Déplacer la piste ${track.name}`,
        html: ICONS.grip,
        onpointerdown: (e) => dragTrack(track, e),
        onkeydown: (e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          e.stopPropagation();
          const tracks = app.project().tracks;
          const from = tracks.indexOf(track);
          moveTrack(from, from + (e.key === 'ArrowUp' ? -1 : 1));
          const grip = document.querySelector(`.track[data-id="${track.id}"] .th-grip`);
          if (grip) grip.focus();
        },
      }),
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
      h('button', {
        type: 'button',
        class: 'th-icon',
        title: 'Sélectionner toutes les notes de la piste (Ctrl+A)',
        'aria-label': `Sélectionner toutes les notes de la piste ${track.name}`,
        html: trackIcon(track),
        onclick: () => selectAll(track),
      }),
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
        ? h('button', {
            class: 'th-btn',
            title: SS.isAnalog(track) ? `Sound design : façade du ${SS.findAnalog(track.instrument).label}` : 'Sound design',
            html: ICONS.sliders,
            onclick: () => (SS.isAnalog(track) ? SS.junoPanel.open(track) : SS.soundDesign.open(track)),
          })
        : null,
      h('button', {
        class: 'th-btn fx-btn' + (SS.fxActive(track) ? ' on' : ''),
        title: 'Effets : chorus, delay, reverb',
        onclick: () => SS.fx.open(track),
      }, 'FX'),
      h('button', { class: 'th-btn', title: 'Modifier la piste', html: ICONS.gear, onclick: () => app.editTrack(track) }),
      h('button', { class: 'th-btn', title: 'Supprimer la piste', html: ICONS.close, onclick: () => app.deleteTrack(track) })
    );

    const grid = h('div', { class: 'grid track-grid' });
    for (let s = 0; s < n; s++) {
      const c = h('div', { class: cellClass(p, s, 'cell'), 'data-step': s }, h('div', { class: 'fill' }));
      ref.cells.push(c);
      grid.append(c);
    }
    // poignée de fin de boucle : on la glisse pour changer la longueur de la piste
    ref.lenHandle = h('div', {
      class: 'len-handle',
      title: 'Glisser pour changer la longueur de la piste',
      onpointerdown: (e) => dragLength(track, e),
    });
    grid.append(ref.lenHandle);
    grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell || e.button !== 0) return; // le clic droit est réservé au menu d'accord
      e.preventDefault();
      const s = +cell.dataset.step;
      if (s >= SS.trackLen(app.project(), track)) return; // au-delà de la boucle de la piste
      cursor = { trackId: track.id, step: s };
      if (e.shiftKey || e.ctrlKey || e.metaKey) return marquee(track, 'line', cell, e);
      const edge = noteEdgeAt(track, cell, e.clientX);
      if (edge) return resizeNote(track, edge, e);
      const top = velEdgeAt(track, cell, e.clientY);
      if (top) return dragVelocity(track, cell, top, e);
      if (grabSelected(track, cell, e)) return;
      if (selectMode) return marquee(track, 'line', cell, e);
      if (track.type === 'drum') return drumGesture(track, s, e);
      noteGesture(track, s, null, e);
    });
    hoverResize(track, grid, '.cell');

    grid.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('.cell');
      if (cell) chordMenuFromEvent(track, +cell.dataset.step, e);
    });

    const selected = sel && sel.track === track;
    const el = h('div', { class: 'track' + (selected ? ' selected' : ''), style: `--c:${track.color}`, 'data-id': track.id }, h('div', { class: 'track-row' }, head, grid));
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
    // toute la tessiture est construite ; on en voit ROLL_VIEW lignes, avec défilement vertical
    const low = ROLL_LOW;
    const high = ROLL_HIGH;
    const rangeLabel = h('b', { class: 'roll-range' });

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
        h('button', { type: 'button', onclick: () => scroller.by(12 * ROLL_ROW_H), title: 'Une octave plus bas' }, '−'),
        rangeLabel,
        h('button', { type: 'button', onclick: () => scroller.by(-12 * ROLL_ROW_H), title: 'Une octave plus haut' }, '+')
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
          ? 'Cliquer pour poser une note, glisser vers la droite pour l’allonger. Maj+glisser : sélectionner.'
          : 'Cliquer sur la fondamentale pour poser un accord, glisser pour l’allonger. Clic droit (ou appui long) sur un accord : changer son type. Maj+glisser : sélectionner.'
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
        {
          type: 'button',
          class: 'roll-sd',
          title: SS.isAnalog(track) ? `Sound design : façade du ${SS.findAnalog(track.instrument).label}` : 'Sound design : oscillateur, filtre, enveloppe',
          onclick: () => (SS.isAnalog(track) ? SS.junoPanel.open(track) : SS.soundDesign.open(track)),
        },
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

    const inner = h('div', { class: 'roll-inner' });
    const thumb = h('div', { class: 'roll-vthumb', title: 'Glisser pour faire défiler les notes' });
    const bar = h('div', { class: 'roll-vbar', style: `height:${ROLL_VIEW * ROLL_ROW_H}px` }, thumb);
    const view = h(
      'div',
      { class: 'roll-view', style: `height:${ROLL_VIEW * ROLL_ROW_H}px` },
      h('div', { class: 'roll-side' }, bar),
      inner
    );
    // bande des mesures : clic = sélectionner la mesure, glisser = plusieurs mesures
    const spb = SS.stepsPerBar(p);
    const barGrid = h('div', { class: 'grid' });
    ref.bars = [];
    for (let s = 0; s < n; s++) {
      const c = h('div', { class: cellClass(p, s, 'bcell'), 'data-step': s }, s % spb === 0 ? String(s / spb + 1) : '');
      ref.bars.push(c);
      barGrid.append(c);
    }
    let hoverBar = -1;
    const markBar = (b) => {
      if (b === hoverBar) return;
      hoverBar = b;
      ref.bars.forEach((c, s) => c.classList.toggle('hover', Math.floor(s / spb) === b));
    };
    barGrid.addEventListener('pointermove', (e) => {
      const c = e.target.closest('.bcell');
      markBar(c ? Math.floor(+c.dataset.step / spb) : -1);
    });
    barGrid.addEventListener('pointerleave', () => markBar(-1));
    barGrid.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.bcell');
      if (!c || e.button !== 0) return;
      e.preventDefault();
      barGesture(track, c, e);
    });
    const barRow = h(
      'div',
      { class: 'roll-row roll-bars', title: 'Cliquer : sélectionner la mesure · glisser : plusieurs mesures · Maj+clic : jusqu’à cette mesure · Ctrl+clic : ajouter' },
      h('div', { class: 'roll-key' }, h('small', {}, 'Mesures')),
      barGrid
    );
    const roll = h('div', { class: 'roll' }, tools, buildPalette(track), barRow, view);
    // tonalité : notes de la gamme mises en évidence, tonique marquée
    const key = p.key && SS.harmony && SS.harmony.valid(p.key) ? p.key : null;
    const scalePcs = key ? SS.harmony.scale(key).map((d) => d.pc) : null;
    const scroller = makeRollScroller(track, view, inner, bar, thumb, rangeLabel);
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
        if (+cell.dataset.step >= SS.trackLen(app.project(), track)) return;
        cursor = { trackId: track.id, step: +cell.dataset.step };
        if (e.shiftKey || e.ctrlKey || e.metaKey) return marquee(track, 'roll', cell, e);
        const edge = noteEdgeAt(track, cell, e.clientX);
        if (edge) return resizeNote(track, edge, e);
        const top = velEdgeAt(track, cell, e.clientY);
        if (top) return dragVelocity(track, cell, top, e);
        if (grabSelected(track, cell, e)) return;
        if (selectMode) return marquee(track, 'roll', cell, e);
        noteGesture(track, +cell.dataset.step, +cell.dataset.midi, e);
      });
      hoverResize(track, grid, '.rcell');
      inner.append(
        h(
          'div',
          {
            class:
              'roll-row' + (black ? ' black' : '') + (isC ? ' c' : '') +
              (scalePcs ? (scalePcs.includes(midi % 12) ? ' in-key' : ' out-key') + (midi % 12 === scalePcs[0] ? ' tonic' : '') : ''),
            title: scalePcs && scalePcs.includes(midi % 12) ? `${SS.harmony.spell(key, midi)} : degré ${scalePcs.indexOf(midi % 12) + 1} de ${SS.harmony.label(key)}` : undefined,
          },
          h(
            'div',
            { class: 'roll-key' },
            h(
              'span',
              {
                class: (black ? 'black' : '') + (isC ? ' c' : ''),
                // clic : écouter la note ; glisser : faire défiler le piano roll
                onpointerdown: (e) =>
                  scroller.dragFrom(e, () => SS.audio.preview(track, track.category === 'mono' ? midi : SS.chordNotes(midi, track.chord))),
              },
              isC || !black ? SS.noteName(midi) : ''
            )
          ),
          grid
        )
      );
    }
    scroller.init();
    return roll;
  }

  /* ---------- Longueur de boucle propre à chaque piste ---------- */

  function applyLen(track, ref) {
    const p = app.project();
    const len = SS.trackLen(p, track);
    const total = SS.totalSteps(p);
    ref.cells.forEach((c, s) => c.classList.toggle('beyond', s >= len));
    ref.roll.forEach((cells) => cells.forEach((c, s) => c.classList.toggle('beyond', s >= len)));
    if (ref.lenHandle) {
      const last = ref.cells[len - 1];
      ref.lenHandle.classList.toggle('custom', len < total);
      // positionnée juste après la dernière case de la boucle (une fois la grille dans la page)
      requestAnimationFrame(() => {
        if (last && last.isConnected) ref.lenHandle.style.left = last.offsetLeft + last.offsetWidth + 1 + 'px';
      });
    }
  }

  function setTrackLength(track, len) {
    const total = SS.totalSteps(app.project());
    if (len >= total) delete track.length;
    else track.length = Math.max(1, len);
  }

  /** Glisser la poignée de fin de boucle d'une piste. */
  function dragLength(track, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const ref = refs.get(track.id);
    ref.lenHandle.classList.add('drag');
    const move = (ev) => {
      // la case sous le pointeur devient la dernière de la boucle
      const cell = ref.cells.reduce((best, c) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(ev.clientX - (r.left + r.width / 2));
        return !best || d < best.d ? { c, d, right: ev.clientX > r.left + r.width / 2 } : best;
      }, null);
      if (!cell) return;
      const s = +cell.c.dataset.step;
      setTrackLength(track, s + 1);
      applyLen(track, ref);
      ref.lenHandle.dataset.len = lenLabel(track) || 'projet';
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      ref.lenHandle.classList.remove('drag');
      renderTrack(track);
      app.changed();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  /* ---------- Réorganiser les pistes (poignée à gauche) ---------- */

  function moveTrack(from, to) {
    const tracks = app.project().tracks;
    if (to < 0 || to >= tracks.length || to === from) return;
    const [t] = tracks.splice(from, 1);
    tracks.splice(to, 0, t);
    renderAll();
    app.changed();
  }

  /** Glisser une piste par sa poignée : la piste suit la souris, un trait indique où elle sera déposée. */
  function dragTrack(track, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const container = $('#tracks');
    const workspace = $('#workspace');
    const els = [...container.querySelectorAll(':scope > .track')];
    const el = els.find((x) => x.dataset.id === track.id);
    const from = els.indexOf(el);
    if (!el || els.length < 2) return;
    const others = els.filter((x) => x !== el);
    const marker = h('div', { class: 'track-drop' });
    container.append(marker);
    el.classList.add('dragging');
    const y0 = e.clientY;
    const scroll0 = workspace.scrollTop;
    let to = from;
    let lastY = e.clientY;
    let autoScroll = 0;

    const update = () => {
      const dy = lastY - y0 + (workspace.scrollTop - scroll0);
      el.style.transform = `translateY(${dy}px)`;
      // position d'insertion : nombre d'autres pistes dont le milieu est au-dessus du pointeur
      to = others.filter((o) => {
        const r = o.getBoundingClientRect();
        return r.top + r.height / 2 < lastY;
      }).length;
      const cRect = container.getBoundingClientRect();
      const y = to < others.length ? others[to].getBoundingClientRect().top : others[others.length - 1].getBoundingClientRect().bottom;
      marker.style.top = y - cRect.top - 2 + 'px';
      marker.classList.toggle('same', to === from);
    };
    // défilement automatique près des bords
    const tick = () => {
      if (!autoScroll) return;
      workspace.scrollTop += autoScroll;
      update();
      requestAnimationFrame(tick);
    };
    const move = (ev) => {
      lastY = ev.clientY;
      const r = workspace.getBoundingClientRect();
      const was = autoScroll;
      autoScroll = ev.clientY < r.top + 40 ? -8 : ev.clientY > r.bottom - 40 ? 8 : 0;
      if (autoScroll && !was) requestAnimationFrame(tick);
      update();
    };
    const up = () => {
      autoScroll = 0;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      marker.remove();
      el.classList.remove('dragging');
      el.style.transform = '';
      if (to !== from) moveTrack(from, to);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    update();
  }

  /* ---------- Défilement vertical du piano roll ---------- */
  const ROLL_LOW = 24; // C1
  const ROLL_HIGH = 108; // C8
  const ROLL_ROW_H = 16; // = --roll-h
  const ROLL_VIEW = 25; // lignes visibles (2 octaves)

  /**
   * Le piano roll ne peut pas être un conteneur défilant natif : il casserait l'alignement
   * horizontal (en-têtes collants) avec le reste des pistes. On décale donc son contenu
   * (translateY) et on dessine notre propre barre de défilement, pilotée par la molette,
   * par le glisser du clavier, le bouton du milieu ou la barre elle-même.
   */
  function makeRollScroller(track, view, inner, bar, thumb, rangeLabel) {
    const total = (ROLL_HIGH - ROLL_LOW + 1) * ROLL_ROW_H;
    const viewH = ROLL_VIEW * ROLL_ROW_H;
    const maxOff = total - viewH;
    const thumbH = Math.max(28, Math.round((viewH / total) * viewH));
    thumb.style.height = thumbH + 'px';
    let off = 0;

    function set(v) {
      off = Math.max(0, Math.min(maxOff, v));
      inner.style.transform = `translateY(${-off}px)`;
      thumb.style.top = Math.round((off / maxOff) * (viewH - thumbH)) + 'px';
      const top = ROLL_HIGH - Math.round(off / ROLL_ROW_H);
      const bottom = top - ROLL_VIEW + 1;
      rangeLabel.textContent = `${SS.noteName(bottom)} – ${SS.noteName(top)}`;
      track.rollTop = top;
      // l'octave « de travail » (note posée par défaut sur la ligne compacte) suit la vue
      track.octave = Math.max(0, Math.min(7, Math.ceil(bottom / 12) - 1));
    }

    function init() {
      const top = track.rollTop ?? (track.octave + 1) * 12 + 24;
      set((ROLL_HIGH - top) * ROLL_ROW_H);
    }

    // molette (ou pavé tactile) : défile les notes ; aux butées, on laisse défiler la page
    view.addEventListener(
      'wheel',
      (e) => {
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // défilement horizontal : la page
        const d = e.deltaY * (e.deltaMode === 1 ? ROLL_ROW_H : e.deltaMode === 2 ? viewH : 1);
        if ((off <= 0 && d < 0) || (off >= maxOff && d > 0)) return;
        e.preventDefault();
        set(off + d);
      },
      { passive: false }
    );

    // glisser le pouce de la barre
    thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      thumb.setPointerCapture(e.pointerId);
      thumb.classList.add('drag');
      const y0 = e.clientY;
      const o0 = off;
      const ratio = maxOff / (viewH - thumbH);
      const move = (ev) => set(o0 + (ev.clientY - y0) * ratio);
      const up = () => {
        thumb.classList.remove('drag');
        thumb.removeEventListener('pointermove', move);
        thumb.removeEventListener('pointerup', up);
        thumb.removeEventListener('pointercancel', up);
      };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up);
      thumb.addEventListener('pointercancel', up);
    });
    // clic dans la barre : saute d'une page
    bar.addEventListener('pointerdown', (e) => {
      if (e.target !== bar) return;
      const thumbTop = thumb.getBoundingClientRect().top;
      set(off + (e.clientY < thumbTop ? -1 : 1) * (viewH - 2 * ROLL_ROW_H));
    });

    /** Glisser pour faire défiler (clavier, ou bouton du milieu partout). Un simple clic appelle onClick. */
    function dragFrom(e, onClick) {
      e.preventDefault();
      const y0 = e.clientY;
      const o0 = off;
      let dragging = false;
      const move = (ev) => {
        if (!dragging && Math.abs(ev.clientY - y0) > 4) {
          dragging = true;
          view.classList.add('grabbing');
        }
        if (dragging) set(o0 - (ev.clientY - y0)); // le contenu suit la main
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        view.classList.remove('grabbing');
        if (!dragging && onClick) onClick();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    }
    // bouton du milieu : saisir le fond n'importe où
    view.addEventListener('pointerdown', (e) => {
      if (e.button === 1) dragFrom(e, null);
    });

    return { init, by: (d) => set(off + d), dragFrom };
  }

  /* ---------- Peinture des cases ---------- */

  function paint(track) {
    const ref = refs.get(track.id);
    if (!ref) return;
    applyLen(track, ref);
    if (track.type === 'drum') {
      ref.cells.forEach((c, s) => {
        const v = track.steps[s] || 0;
        c.classList.toggle('on', v > 0);
        c.style.setProperty('--v', v);
        c.title = v > 0 ? `Vélocité ${Math.round(v * 127)}` : '';
      });
      paintSelection(track, ref);
      return;
    }
    ref.cells.forEach((c) => {
      c.classList.remove('on', 'start', 'hold', 'end', 'held', 'sel', 'sel-hold');
      c.querySelector('.lbl')?.remove();
      c.title = '';
    });
    ref.roll.forEach((cells) => cells.forEach((c) => c.classList.remove('on', 'start', 'root', 'sel', 'sel-hold')));

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

    paintSelection(track, ref);
  }

  /** Notes sélectionnées (contour blanc) et plage de temps choisie (liseré sous les cases, bande des mesures). */
  function paintSelection(track, ref) {
    ref.cells.forEach((c) => c.classList.remove('sel', 'sel-hold', 'rng'));
    if (ref.bars) ref.bars.forEach((c) => c.classList.remove('rng'));
    const s = sel && sel.track === track ? sel : null;
    if (!s) return;
    for (const it of [...s.items]) if (!itemValid(track, it)) s.items.delete(it);
    if (!s.items.size && !s.range) {
      sel = null;
      updateSelBar();
      return;
    }
    if (s.range) {
      for (let i = s.range[0]; i < s.range[1]; i++) {
        if (ref.cells[i]) ref.cells[i].classList.add('rng');
        if (ref.bars && ref.bars[i]) ref.bars[i].classList.add('rng');
      }
    }
    s.items.forEach((it) => {
      if (isDrum(track)) return ref.cells[it] && ref.cells[it].classList.add('sel');
      for (let st = it.step; st < it.step + it.len && st < ref.cells.length; st++) {
        const k = st === it.step ? 'sel' : 'sel-hold';
        ref.cells[st].classList.add(k);
        it.notes.forEach((m) => {
          const rc = ref.roll.get(m);
          if (rc && rc[st]) rc[st].classList.add(k);
        });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Sélection : la note / l'accord en cours                             */
  /* ------------------------------------------------------------------ */

  /*
   * La sélection appartient à une seule piste :
   *  - items : les pas allumés (n° de pas, piste Drum) ou les événements note / accord (piste instrument) ;
   *  - range : la plage de temps choisie [début, fin[ (rectangle, mesures, toute la piste), ou null.
   *    Une plage sans note est permise : elle désigne l'endroit où coller.
   */
  let sel = null; // { track, items: Set, range: [from, to] | null }
  let clip = null; // presse-papiers : { kind: 'drum' | 'notes', span, items, trackId, from }
  let cursor = null; // { trackId, step } : dernier endroit cliqué (pour coller sans survol)
  let selectMode = false; // outil « Sélection » : glisser = rectangle, sans poser de note
  const pointer = { x: -1, y: -1 };

  const isDrum = (track) => track.type === 'drum';
  const trackById = (id) => app.project().tracks.find((t) => t.id === id);
  const itemValid = (track, it) => (isDrum(track) ? track.steps[it] > 0 : track.events.includes(it));
  const itemSpan = (track, it) => (isDrum(track) ? [it, it + 1] : [it.step, it.step + it.len]);
  const isSelected = (track, it) => !!sel && sel.track === track && sel.items.has(it);

  function validSelection() {
    if (!sel) return null;
    if (!app.project().tracks.includes(sel.track)) sel = null;
    else for (const it of [...sel.items]) if (!itemValid(sel.track, it)) sel.items.delete(it);
    if (sel && !sel.items.size && !sel.range) sel = null;
    return sel;
  }

  /** Remplace la sélection (track = null : tout désélectionner). */
  function setSelection(track, items = [], range = null) {
    const prev = sel && sel.track;
    const set = new Set(items);
    sel = track && (set.size || range) ? { track, items: set, range } : null;
    if (prev && prev !== track && app.project().tracks.includes(prev)) paint(prev);
    if (track) paint(track);
    updateSelBar();
  }

  function select(track, ev) {
    setSelection(track, ev ? [ev] : []);
  }

  function toggleItem(track, it) {
    const items = new Set(sel && sel.track === track ? sel.items : []);
    if (items.has(it)) items.delete(it);
    else items.add(it);
    setSelection(track, items);
  }

  function unselectIfRemoved(track) {
    if (sel && sel.track === track) {
      validSelection();
      updateSelBar();
    }
  }

  /** Début et fin (exclue) de la sélection : la plage choisie, élargie aux notes qui en sortent par la gauche. */
  function selBounds() {
    const spans = [...sel.items].map((it) => itemSpan(sel.track, it));
    if (!sel.range) return [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))];
    return [Math.min(sel.range[0], ...spans.map((s) => s[0])), Math.max(sel.range[1], ...spans.map((s) => s[0] + 1))];
  }

  /**
   * Notes / pas d'une piste dans les pas [a, b] (inclus).
   * lo / hi : tessiture (piano roll) ; startOnly : seulement les notes qui commencent dans la plage (mesures).
   */
  function itemsInRange(track, a, b, { lo = null, hi = null, startOnly = false } = {}) {
    const n = SS.trackLen(app.project(), track);
    b = Math.min(b, n - 1);
    if (isDrum(track)) {
      const out = [];
      for (let s = Math.max(0, a); s <= b; s++) if (track.steps[s] > 0) out.push(s);
      return out;
    }
    return track.events.filter((ev) => {
      const inTime = startOnly ? ev.step >= a && ev.step <= b : ev.step <= b && ev.step + ev.len - 1 >= a;
      return inTime && (lo == null || ev.notes.some((m) => m >= lo && m <= hi));
    });
  }

  /** La note (ou le pas) sous une case, sinon null. */
  function itemAtCell(track, cell) {
    const s = +cell.dataset.step;
    if (isDrum(track)) return track.steps[s] > 0 ? s : null;
    const ev = findEventAt(track, s);
    if (!ev) return null;
    if (cell.dataset.midi && !ev.notes.includes(+cell.dataset.midi)) return null;
    return ev;
  }

  function selectAll(track) {
    if (!track) return toast('Cliquez d’abord dans une piste.');
    const n = SS.trackLen(app.project(), track);
    setSelection(track, itemsInRange(track, 0, n - 1), [0, n]);
    if (!sel.items.size) toast(`La piste « ${track.name} » est vide.`, 1600);
  }

  /** La case de piste sous le pointeur de la souris (pour coller à cet endroit), sinon null. */
  function hovered() {
    const el = pointer.x >= 0 && document.elementFromPoint(pointer.x, pointer.y);
    const c = el && el.closest('#tracks .cell, #tracks .rcell, #tracks .bcell');
    const t = c && trackById(c.closest('.track').dataset.id);
    return t ? { track: t, step: +c.dataset.step } : null;
  }

  /** La piste « active » : celle de la sélection, sinon celle sous la souris, sinon la dernière cliquée. */
  function activeTrack() {
    if (validSelection()) return sel.track;
    const hv = hovered();
    if (hv) return hv.track;
    return cursor ? trackById(cursor.trackId) : null;
  }

  const unitLabel = (track, k) =>
    isDrum(track) ? `${k} pas` : track.category === 'mono' ? `${k} note${k > 1 ? 's' : ''}` : `${k} accord${k > 1 ? 's' : ''}`;

  function rangeLabel(range) {
    const spb = SS.stepsPerBar(app.project());
    if (range[0] % spb || range[1] % spb) return '';
    const a = range[0] / spb + 1;
    const b = range[1] / spb;
    return a === b ? `mesure ${a}` : `mesures ${a}–${b}`;
  }

  /** Barre du bas : nombre d'éléments sélectionnés et boutons Copier / Couper / Coller… */
  function updateSelBar() {
    const s = sel;
    const has = !!(s && s.items.size);
    ['#selCopy', '#selCut', '#selDup', '#selDel'].forEach((id) => $(id) && ($(id).disabled = !has));
    if ($('#selPaste')) $('#selPaste').disabled = !clip;
    if ($('#selClear')) $('#selClear').disabled = !s;
    const info = $('#selInfo');
    if (info) {
      if (!s) info.textContent = clip ? `Presse-papiers : ${clip.items.length} élément${clip.items.length > 1 ? 's' : ''}` : 'Aucune sélection';
      else {
        const r = s.range ? rangeLabel(s.range) : '';
        info.textContent = `${s.track.name} · ${has ? unitLabel(s.track, s.items.size) : 'zone vide'}${r ? ' · ' + r : ''}`;
      }
      info.classList.toggle('on', !!s);
    }
    document.querySelectorAll('#tracks .track').forEach((el) => el.classList.toggle('selected', !!s && el.dataset.id === s.track.id));
  }

  /* ---------- Copier / Couper / Coller ---------- */

  function copySelection({ cut = false, quiet = false } = {}) {
    if (!validSelection() || !sel.items.size) {
      if (!quiet) toast('Rien à copier : sélectionnez d’abord des notes.');
      return false;
    }
    const t = sel.track;
    const [from, to] = selBounds();
    const items = [...sel.items].sort((a, b) => itemSpan(t, a)[0] - itemSpan(t, b)[0]);
    clip = isDrum(t)
      ? { kind: 'drum', items: items.map((s) => ({ off: s - from, vel: t.steps[s] })) }
      : {
          kind: 'notes',
          items: items.map((ev) => ({ off: ev.step - from, len: ev.len, notes: [...ev.notes], vel: ev.vel, chord: ev.chord })),
        };
    Object.assign(clip, { span: to - from, trackId: t.id, from });
    const what = unitLabel(t, items.length);
    if (cut) {
      if (isDrum(t)) items.forEach((s) => (t.steps[s] = 0));
      else t.events = t.events.filter((ev) => !sel.items.has(ev));
      cursor = { trackId: t.id, step: from };
      setSelection(t, [], [from, to]); // la zone vidée reste choisie : Ctrl+V y remet les notes
      app.changed();
      if (!quiet) toast(`Coupé : ${what}`, 1600);
    } else {
      updateSelBar();
      if (!quiet) toast(`Copié : ${what}`, 1600);
    }
    return true;
  }

  /**
   * Colle le presse-papiers. Destination, dans l'ordre :
   *  la case sous la souris → une zone vide choisie (son début) → juste après la sélection →
   *  le dernier endroit cliqué → l'endroit d'origine.
   * Les notes collées remplacent celles qu'elles chevauchent, puis deviennent la sélection
   * (Ctrl+V à nouveau colle donc à la suite).
   */
  function paste({ after = false } = {}) {
    if (!clip) return toast('Le presse-papiers est vide : copiez d’abord des notes (Ctrl+C).');
    const p = app.project();
    let track = null;
    let pos = null;
    const hv = !after && hovered();
    if (hv) ({ track, step: pos } = hv);
    else if (validSelection()) {
      track = sel.track;
      pos = sel.items.size ? selBounds()[1] : sel.range[0];
    } else if (cursor && trackById(cursor.trackId)) {
      track = trackById(cursor.trackId);
      pos = cursor.step;
    } else {
      track = trackById(clip.trackId);
      pos = clip.from;
    }
    if (!track) return toast('Choisissez une piste où coller (survolez-la ou cliquez dedans).');
    if ((clip.kind === 'drum') !== isDrum(track)) {
      return toast(clip.kind === 'drum' ? 'Des pas de batterie ne se collent que dans une piste Drum.' : 'Des notes ne se collent que dans une piste instrument ou synthé.');
    }
    const n = SS.trackLen(p, track);
    const pasted = [];
    let dropped = 0;
    clip.items.forEach((it) => {
      const s = pos + it.off;
      if (s < 0 || s >= n) return dropped++;
      if (isDrum(track)) {
        track.steps[s] = it.vel;
        return pasted.push(s);
      }
      const len = Math.min(it.len, n - s);
      track.events = track.events.filter((e) => !(e.step >= s && e.step < s + len));
      track.events.forEach((e) => {
        if (e.step < s && e.step + e.len > s) e.len = s - e.step;
      });
      const ev = { step: s, len, notes: track.category === 'mono' ? [it.notes[0]] : [...it.notes], vel: it.vel };
      if (track.category !== 'mono' && it.chord) ev.chord = it.chord;
      track.events.push(ev);
      pasted.push(ev);
    });
    if (!isDrum(track)) track.events.sort((a, b) => a.step - b.step);
    const end = Math.min(n, pos + clip.span);
    cursor = { trackId: track.id, step: end };
    setSelection(track, pasted, pasted.length ? [pos, Math.max(end, pos + 1)] : null);
    app.changed();
    const spb = SS.stepsPerBar(p);
    const where = `mesure ${Math.floor(pos / spb) + 1}${pos % spb ? `, pas ${(pos % spb) + 1}` : ''}`;
    if (!pasted.length) toast('Rien n’a été collé : la destination est au-delà de la boucle de la piste.');
    else toast(`Collé dans « ${track.name} », ${where}${dropped ? ` · ${dropped} hors de la boucle, ignoré${dropped > 1 ? 's' : ''}` : ''}`, 2000);
  }

  function deleteSelection() {
    if (!validSelection() || !sel.items.size) return;
    const t = sel.track;
    if (isDrum(t)) sel.items.forEach((s) => (t.steps[s] = 0));
    else t.events = t.events.filter((ev) => !sel.items.has(ev));
    const range = sel.range;
    setSelection(t, [], range);
    app.changed();
  }

  /** Dupliquer : copie puis colle juste après la sélection. */
  function duplicateSelection() {
    const keep = clip;
    if (!copySelection({ quiet: true })) return toast('Rien à dupliquer : sélectionnez d’abord des notes.');
    paste({ after: true });
    clip = keep || clip; // dupliquer ne remplace pas le presse-papiers
    updateSelBar();
  }

  function setSelectMode(on) {
    selectMode = on;
    document.body.classList.toggle('select-mode', on);
    const b = $('#selMode');
    if (b) {
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  /** Raccourcis de la sélection ; renvoie true si la touche a été prise en charge. */
  function handleKey(e) {
    const tag = e.target.tagName;
    const textField = (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(e.target.type)) || tag === 'TEXTAREA' || tag === 'SELECT';
    if (textField || document.querySelector('dialog[open]') || document.body.classList.contains('mixer-open') || menuEl) return false;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.toLowerCase();
    const run = (fn) => {
      e.preventDefault();
      fn();
      return true;
    };
    if (mod && key === 'c') return run(() => copySelection());
    if (mod && key === 'x') return run(() => copySelection({ cut: true }));
    if (mod && key === 'v') return run(() => paste());
    if (mod && key === 'd') return run(duplicateSelection);
    if (mod && key === 'a') return run(() => selectAll(activeTrack()));
    if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && validSelection()) return run(deleteSelection);
    if (!mod && e.key.startsWith('Arrow') && e.target.type !== 'range' && validSelection() && sel.items.size) {
      const horiz = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (!horiz && isDrum(sel.track)) return false; // une batterie n'a pas de hauteur
      const sign = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
      return run(() => nudge(horiz ? sign * (e.shiftKey ? SS.stepsPerBar(app.project()) : 1) : 0, horiz ? 0 : sign * (e.shiftKey ? 12 : 1)));
    }
    if (!mod && e.key === 'Escape' && (sel || selectMode)) return run(() => (sel ? setSelection(null) : setSelectMode(false)));
    return false;
  }

  /* ---------- Sélection à la souris ---------- */

  /** Le geste du pointeur doit-il sélectionner (plutôt que poser / effacer des notes) ? */
  const wantsSelect = (e) => selectMode || e.shiftKey || e.ctrlKey || e.metaKey;

  /**
   * Sélection rectangle sur la ligne compacte (kind = 'line', seulement le temps)
   * ou dans le piano roll (kind = 'roll', temps × hauteur).
   *  - glisser : remplace la sélection (Ctrl / Cmd : l'agrandit) ;
   *  - simple clic sur une note : Maj / Ctrl l'ajoute ou la retire, en mode Sélection elle devient la sélection ;
   *  - simple clic sur une case vide en mode Sélection : tout désélectionner.
   */
  function marquee(track, kind, startCell, e) {
    const ref = refs.get(track.id);
    const add = e.ctrlKey || e.metaKey;
    const modifier = add || e.shiftKey;
    const base = add && sel && sel.track === track ? [...sel.items] : [];
    const s0 = +startCell.dataset.step;
    const m0 = kind === 'roll' ? +startCell.dataset.midi : null;
    const r0 = startCell.getBoundingClientRect();
    const lineY = r0.top + r0.height / 2;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let cur = startCell;
    let moved = false;
    let box = null;

    const update = () => {
      const s1 = +cur.dataset.step;
      const a = Math.min(s0, s1);
      const b = Math.max(s0, s1);
      let lo = null;
      let hi = null;
      if (kind === 'roll') {
        lo = Math.min(m0, +cur.dataset.midi);
        hi = Math.max(m0, +cur.dataset.midi);
      }
      const r1 = cur.getBoundingClientRect();
      const top = kind === 'roll' ? Math.min(r0.top, r1.top) : r0.top;
      const bottom = kind === 'roll' ? Math.max(r0.bottom, r1.bottom) : r0.bottom;
      Object.assign(box.style, {
        left: Math.min(r0.left, r1.left) + 'px',
        top: top + 'px',
        width: Math.max(r0.right, r1.right) - Math.min(r0.left, r1.left) + 'px',
        height: bottom - top + 'px',
      });
      const found = itemsInRange(track, a, b, { lo, hi });
      setSelection(track, base.concat(found), add ? null : [a, b + 1]);
    };

    gesture(
      (pe) => {
        if (!moved && Math.hypot(pe.clientX - x0, pe.clientY - y0) < 4) return;
        if (!moved) {
          moved = true;
          box = h('div', { class: 'marquee' });
          document.body.append(box);
          document.body.classList.add('marquee-on');
        }
        const el = document.elementFromPoint(pe.clientX, kind === 'line' ? lineY : pe.clientY);
        const c = el && el.closest(kind === 'line' ? '.cell' : '.rcell');
        if (c && ref.el.contains(c)) cur = c;
        update();
      },
      () => {
        if (box) box.remove();
        document.body.classList.remove('marquee-on');
        if (moved) return;
        const it = itemAtCell(track, startCell);
        if (it == null) {
          if (!modifier) setSelection(null);
          return;
        }
        if (modifier) toggleItem(track, it);
        else setSelection(track, [it]);
        if (!SS.audio.isPlaying() && isSelected(track, it)) {
          SS.audio.preview(track, isDrum(track) ? undefined : it.notes.length === 1 ? it.notes[0] : it.notes);
        }
      }
    );
  }

  /* ---------- Déplacer la sélection ---------- */

  /**
   * Prépare le déplacement des éléments sélectionnés (copy : on déplace une copie, les originaux restent).
   * apply(dt, dp) les place à dt pas / dp demi-tons de leur position de départ (écarts bornés pour rester
   * dans la boucle et la tessiture) ; ils remplacent ce qu'ils chevauchent, sans rien détruire tant que
   * le geste n'est pas fini : chaque appel repart de l'état initial. commit() valide.
   */
  function beginMove(track, { copy = false } = {}) {
    const n = SS.trackLen(app.project(), track);
    const items = [...sel.items];
    const range0 = sel.range;
    let last = { dt: 0, dp: 0 };
    const setSel = (list, dt) => {
      const range = range0 && [clamp(range0[0] + dt, 0, n), clamp(range0[1] + dt, 0, n)];
      sel = { track, items: new Set(list), range: range && range[1] > range[0] ? range : null };
    };
    let place;
    if (isDrum(track)) {
      const moved = items.map((st) => ({ st, vel: track.steps[st] }));
      const base = track.steps.slice();
      if (!copy) items.forEach((st) => (base[st] = 0));
      const minS = Math.min(...items);
      const maxS = Math.max(...items);
      place = (dt) => {
        dt = clamp(dt, -minS, n - 1 - maxS);
        base.forEach((v, i) => (track.steps[i] = v));
        moved.forEach((m) => (track.steps[m.st + dt] = m.vel));
        setSel(moved.map((m) => m.st + dt), dt);
        return { dt, dp: 0 };
      };
    } else {
      const moving = copy ? items.map((ev) => ({ ...ev, notes: [...ev.notes] })) : items;
      const orig = moving.map((ev) => ({ ev, step: ev.step, len: ev.len, notes: [...ev.notes] }));
      const base = track.events.filter((ev) => copy || !sel.items.has(ev)).map((ev) => ({ ev, len: ev.len }));
      const minS = Math.min(...orig.map((o) => o.step));
      const maxS = Math.max(...orig.map((o) => o.step));
      const lo = Math.min(...orig.flatMap((o) => o.notes));
      const hi = Math.max(...orig.flatMap((o) => o.notes));
      place = (dt, dp) => {
        dt = clamp(dt, -minS, n - 1 - maxS);
        dp = clamp(dp, ROLL_LOW - lo, ROLL_HIGH - hi);
        base.forEach((b) => (b.ev.len = b.len));
        let evs = base.map((b) => b.ev);
        orig.forEach((o) => {
          o.ev.step = o.step + dt;
          o.ev.len = Math.min(o.len, n - o.ev.step);
          o.ev.notes = o.notes.map((m) => m + dp);
          const a = o.ev.step;
          const b = a + o.ev.len;
          evs = evs.filter((x) => !(x.step >= a && x.step < b));
          evs.forEach((x) => {
            if (x.step < a && x.step + x.len > a) x.len = a - x.step;
          });
        });
        track.events = evs.concat(moving).sort((x, y) => x.step - y.step);
        setSel(moving, dt);
        return { dt, dp };
      };
    }
    return {
      apply(dt, dp = 0) {
        last = place(dt, dp);
        paint(track);
        return last;
      },
      commit() {
        updateSelBar();
        if (last.dt || last.dp || copy) app.changed();
        return last;
      },
    };
  }

  const fmtMove = ({ dt, dp }) =>
    [dt ? `${dt > 0 ? '+' : ''}${dt} pas` : '', dp ? `${dp > 0 ? '+' : ''}${dp} demi-ton${Math.abs(dp) > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'Sans déplacement';

  function previewMoved(track) {
    if (SS.audio.isPlaying() || isDrum(track) || !sel) return;
    const ev = [...sel.items].sort((a, b) => a.step - b.step)[0];
    if (ev) SS.audio.preview(track, ev.notes.length === 1 ? ev.notes[0] : ev.notes);
  }

  /** Flèches : ← → d'un pas (Maj : d'une mesure), ↑ ↓ d'un demi-ton (Maj : d'une octave). */
  function nudge(dt, dp) {
    const t = sel.track;
    const mv = beginMove(t);
    const r = mv.apply(dt, dp);
    mv.commit();
    if (!r.dt && !r.dp) toast(dp ? 'Impossible de transposer plus loin.' : 'Impossible d’aller plus loin : bord de la boucle.', 1400);
    else if (r.dp) previewMoved(t);
  }

  /**
   * Appui sur une note déjà sélectionnée (ou sur n'importe quelle note en mode Sélection) : glisser déplace
   * toute la sélection (Alt : une copie). Sans mouvement, le clic garde son effet habituel.
   * Renvoie true si le geste est pris en charge.
   */
  function grabSelected(track, cell, e) {
    const it = itemAtCell(track, cell);
    if (it == null || (!isSelected(track, it) && !selectMode)) return false;
    const wasSelected = isSelected(track, it);
    if (!wasSelected) setSelection(track, [it]);
    const s0 = +cell.dataset.step;
    const m0 = cell.dataset.midi ? +cell.dataset.midi : null;
    const roll = cell.closest('.roll');
    const x0 = e.clientX;
    const y0 = e.clientY;
    const copy = e.altKey;
    let mv = null;
    let last = { dt: 0, dp: 0 };
    let badge = null;
    gesture(
      (pe) => {
        if (!mv) {
          if (Math.hypot(pe.clientX - x0, pe.clientY - y0) < 4) return;
          mv = beginMove(track, { copy });
          badge = h('div', { class: 'vel-badge', role: 'status' });
          document.body.append(badge);
          document.body.classList.add(copy ? 'copying-notes' : 'moving-notes');
        }
        const s1 = stepFromPoint(pe.clientX, pe.clientY);
        let dp = last.dp;
        if (m0 != null) {
          const el = document.elementFromPoint(pe.clientX, pe.clientY);
          const c = el && el.closest('[data-midi]');
          if (c && roll.contains(c)) dp = +c.dataset.midi - m0;
        }
        const r = mv.apply(s1 == null ? last.dt : s1 - s0, dp);
        if (r.dp !== last.dp) previewMoved(track);
        last = r;
        badge.textContent = (copy ? 'Copie · ' : '') + fmtMove(r);
        badge.style.left = pe.clientX + 'px';
        badge.style.top = Math.max(4, pe.clientY - 36) + 'px';
      },
      () => {
        if (badge) badge.remove();
        document.body.classList.remove('moving-notes', 'copying-notes');
        if (mv) return mv.commit();
        // simple clic : en mode Sélection, la note devient la seule sélectionnée ; sinon effet habituel (effacer)
        if (selectMode) {
          setSelection(track, [it]);
          if (!wasSelected && !SS.audio.isPlaying()) SS.audio.preview(track, isDrum(track) ? undefined : it.notes.length === 1 ? it.notes[0] : it.notes);
        } else if (isDrum(track)) {
          track.steps[s0] = 0;
          paint(track);
          app.changed();
        } else noteGesture(track, s0, m0, { clientX: x0, clientY: y0, deferred: true });
      }
    );
    return true;
  }

  /** Bande des mesures du piano roll : clic = la mesure, glisser = plusieurs, Maj+clic = jusqu'à, Ctrl+clic = ajouter. */
  let barAnchor = null; // { trackId, bar }
  function barGesture(track, cell, e) {
    const strip = cell.parentElement;
    const p = app.project();
    const spb = SS.stepsPerBar(p);
    const n = SS.trackLen(p, track);
    const add = e.ctrlKey || e.metaKey;
    const base = add && sel && sel.track === track ? [...sel.items] : [];
    const b0 = Math.floor(+cell.dataset.step / spb);
    const anchor = e.shiftKey && barAnchor && barAnchor.trackId === track.id ? barAnchor.bar : b0;
    if (!e.shiftKey) barAnchor = { trackId: track.id, bar: b0 };
    let last = -1;
    const apply = (b1) => {
      if (b1 === last) return;
      last = b1;
      const from = Math.min(anchor, b1) * spb;
      const to = Math.min(n, (Math.max(anchor, b1) + 1) * spb);
      if (from >= n) return;
      setSelection(track, base.concat(itemsInRange(track, from, to - 1, { startOnly: true })), add ? null : [from, to]);
    };
    apply(b0);
    cursor = { trackId: track.id, step: b0 * spb };
    gesture((pe) => {
      const el = document.elementFromPoint(pe.clientX, pe.clientY);
      const c = el && el.closest('.bcell');
      if (c && c.parentElement === strip) apply(Math.floor(+c.dataset.step / spb));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Gestes souris / tactile                                             */
  /* ------------------------------------------------------------------ */

  function stepFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest('[data-step]');
    return c ? +c.dataset.step : null;
  }

  /** Suit un glisser jusqu'au relâchement ; track_gesture signale en plus une modification du projet. */
  function track_gesture(onMove, onEnd) {
    gesture(onMove, onEnd, true);
  }

  function gesture(onMove, onEnd, changes = false) {
    const move = (e) => onMove(e);
    const up = (e) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      onEnd && onEnd(e);
      if (changes) app.changed();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function drumGesture(track, s, e) {
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
      if (s2 >= SS.trackLen(app.project(), track)) return;
      if ((track.steps[s2] > 0) !== (value > 0)) {
        track.steps[s2] = value;
        paint(track);
      }
    });
  }

  /* ---------- Allonger / raccourcir une note par son bord droit ---------- */
  const EDGE_PX = 7; // largeur de la zone de saisie sur le bord droit d'une note

  /** La note dont le bord droit est sous le pointeur (mode On/Off seulement), sinon null. */
  function noteEdgeAt(track, cell, clientX) {
    if (track.type !== 'instrument' || !cell) return null;
    const s = +cell.dataset.step;
    const ev = findEventAt(track, s);
    if (!ev || s !== ev.step + ev.len - 1) return null;
    if (cell.dataset.midi && !ev.notes.includes(+cell.dataset.midi)) return null; // piano roll : sur une ligne de la note
    const r = cell.getBoundingClientRect();
    return clientX >= r.right - EDGE_PX && clientX <= r.right + 3 ? ev : null;
  }

  /** Curseur « poignée » au survol du bord droit d'une note. */
  function hoverResize(track, grid, sel) {
    grid.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const cell = e.target.closest(sel);
      const right = !!noteEdgeAt(track, cell, e.clientX);
      grid.classList.toggle('edge-hover', right);
      // poignée de vélocité : haut du remplissage (ligne compacte) ou haut de la note (piano roll)
      const vel = !right && !!velEdgeAt(track, cell, e.clientY);
      grid.classList.toggle('vel-hover', vel);
      const prev = grid.querySelector('.vel-target');
      if (prev && (prev !== cell || !vel)) prev.classList.remove('vel-target');
      if (vel) cell.classList.add('vel-target');
    });
    grid.addEventListener('pointerleave', () => {
      grid.classList.remove('edge-hover', 'vel-hover');
      const prev = grid.querySelector('.vel-target');
      if (prev) prev.classList.remove('vel-target');
    });
  }

  /* ---------- Poignée de vélocité : le haut d'un pas ou d'une note ---------- */
  const VEL_EDGE_PX = 5;
  const ROLL_VEL_PX = 4; // bande de prise en haut d'une note du piano roll

  /** Vélocité d'une case de la ligne compacte : { get, set, label } ou null si la case est vide. */
  function velTarget(track, s) {
    if (track.type === 'drum') {
      if (!(track.steps[s] > 0)) return null;
      return { step: s, get: () => track.steps[s], set: (v) => (track.steps[s] = v) };
    }
    const ev = findEventAt(track, s);
    if (!ev) return null;
    return { ev, get: () => ev.vel, set: (v) => (ev.vel = v) };
  }

  /** Le pointeur est-il sur le haut du remplissage (mode On/Off) ? */
  function velEdgeAt(track, cell, clientY) {
    if (!cell) return null;
    if (cell.classList.contains('rcell')) {
      // piano roll : bande du haut d'une case de note (la vélocité y est montrée par l'opacité)
      if (!cell.classList.contains('on')) return null;
      const t = velTarget(track, +cell.dataset.step);
      if (!t || !t.ev.notes.includes(+cell.dataset.midi)) return null;
      const r = cell.getBoundingClientRect();
      return clientY >= r.top - 1 && clientY <= r.top + ROLL_VEL_PX ? t : null;
    }
    if (!cell.classList.contains('cell')) return null;
    const t = velTarget(track, +cell.dataset.step);
    if (!t) return null;
    const r = cell.getBoundingClientRect();
    const top = r.bottom - Math.max(0.12, t.get()) * r.height; // même hauteur que l'affichage
    return Math.abs(clientY - top) <= VEL_EDGE_PX ? t : null;
  }

  /** Glisser le haut : la hauteur suit le pointeur, la valeur (0-127) s'affiche près de la note. */
  function dragVelocity(track, cell, target, e) {
    e.preventDefault();
    // sur une note d'une sélection multiple : toutes les notes sélectionnées suivent (même écart)
    const key = target.ev || target.step;
    const others = isSelected(track, key) && sel.items.size > 1 ? [...sel.items].filter((it) => it !== key) : [];
    const getVel = (it) => (isDrum(track) ? track.steps[it] : it.vel);
    const setVel = (it, v) => (isDrum(track) ? (track.steps[it] = v) : (it.vel = v));
    const starts = others.map(getVel);
    if (target.ev && !others.length) select(track, target.ev);
    const r = cell.getBoundingClientRect();
    // piano roll : case trop fine pour y lire une hauteur → glissé relatif (vers le haut = plus fort)
    const relative = cell.classList.contains('rcell');
    const startV = target.get();
    const startY = e.clientY;
    const badge = h('div', { class: 'vel-badge', role: 'status' });
    document.body.append(badge);
    document.body.classList.add('dragging-vel');
    const show = () => {
      const v = target.get();
      badge.textContent = `Vélocité ${Math.round(v * 127)}${others.length ? ` · ${others.length + 1} notes` : ''}`;
      const top = relative ? r.top : r.bottom - v * r.height;
      badge.style.left = r.left + r.width / 2 + 'px';
      badge.style.top = Math.max(4, top - 30) + 'px';
    };
    show();
    track_gesture(
      (pe) => {
        const v = relative ? clamp(startV + (startY - pe.clientY) / 150, 0.05, 1) : clamp((r.bottom - pe.clientY) / r.height, 0.05, 1);
        target.set(Math.round(v * 127) / 127);
        others.forEach((it, i) => setVel(it, Math.round(clamp(starts[i] + v - startV, 0.05, 1) * 127) / 127));
        paint(track);
        show();
      },
      () => {
        badge.remove();
        document.body.classList.remove('dragging-vel');
      }
    );
  }

  /** Glisser le bord droit : la case sous le pointeur devient la dernière de la note. */
  function resizeNote(track, ev, e) {
    e.preventDefault();
    const n = SS.trackLen(app.project(), track);
    // sur une note d'une sélection multiple : toutes s'allongent / se raccourcissent d'autant
    const group = isSelected(track, ev) && sel.items.size > 1 ? [...sel.items] : [ev];
    if (group.length === 1) select(track, ev);
    const limits = group.map((x) => {
      const next = track.events.find((y) => y !== x && y.step > x.step);
      return { x, len0: x.len, max: (next ? next.step : n) - x.step };
    });
    const maxLen = limits.find((l) => l.x === ev).max;
    const len0 = ev.len;
    document.body.classList.add('resizing-note');
    track_gesture(
      (pe) => {
        const s2 = stepFromPoint(pe.clientX, pe.clientY);
        if (s2 == null) return;
        const len = clamp(s2 - ev.step + 1, 1, maxLen);
        if (len !== ev.len) {
          limits.forEach((l) => (l.x.len = clamp(l.len0 + len - len0, 1, l.max)));
          paint(track);
        }
      },
      () => {
        document.body.classList.remove('resizing-note');
      }
    );
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
    const n = SS.trackLen(app.project(), track);
    const existing = findEventAt(track, s);


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

  // ordre des notes dans le menu (de La à Sol#, comme demandé)
  const MENU_NOTES = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];

  /**
   * Menu du clic droit / appui long sur une note ou un accord.
   *  - piste Mono : une colonne de notes (A, A#, B…) + octave
   *  - piste Accord / Arpège : deux colonnes, la fondamentale à gauche et le type d'accord à droite
   * Chaque choix s'applique et s'entend tout de suite ; le menu reste ouvert pour enchaîner
   * (note puis type), et se ferme avec Échap, un clic ailleurs ou « Fermer ».
   */
  function openChordMenu(track, ev, x, y) {
    closeChordMenu();
    select(track, ev);
    const mono = track.category === 'mono';

    const commit = () => {
      paint(track);
      app.changed();
      if (!SS.audio.isPlaying()) SS.audio.preview(track, ev.notes.length === 1 ? ev.notes[0] : ev.notes);
      render();
    };
    // nouvelle fondamentale : même classe de note, au plus près de l'ancienne (±6 demi-tons)
    const setRoot = (pc) => {
      const old = ev.notes[0];
      let root = old - (((old % 12) + 12) % 12) + pc;
      if (root - old > 6) root -= 12;
      if (old - root > 6) root += 12;
      root = Math.max(12, Math.min(119, root));
      ev.notes = mono ? [root] : SS.chordNotes(root, ev.chord || track.chord);
      if (!mono && !ev.chord) ev.chord = track.chord;
      track.lastRoot = root;
      commit();
    };
    const setType = (id) => {
      ev.chord = id;
      ev.notes = SS.chordNotes(ev.notes[0], id);
      commit();
    };
    const shiftOct = (d) => {
      const root = Math.max(12, Math.min(119, ev.notes[0] + 12 * d));
      ev.notes = mono ? [root] : SS.chordNotes(root, ev.chord || track.chord);
      track.lastRoot = root;
      commit();
    };

    menuEl = h('div', {
      class: 'ctx-menu ctx-picker' + (mono ? ' mono' : ''),
      role: 'dialog',
      'aria-label': mono ? 'Changer la note' : 'Changer l’accord',
    });

    /* Longueur et vélocité dans la même fenêtre : curseurs + boutons −/+ ; la grille suit en direct. */
    const n = SS.trackLen(app.project(), track);
    const next = track.events.find((o) => o !== ev && o.step > ev.step);
    const maxLen = Math.max(1, (next ? next.step : n) - ev.step);
    let saveT = null;
    const saveSoon = () => {
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        app.changed();
      }, 250);
    };
    function paramRow(label, get, set, min, max, fmt, title) {
      const out = h('output', {}, fmt(get()));
      const range = h('input', { type: 'range', min, max, step: 1, value: get(), 'aria-label': label, title });
      const apply = (v) => {
        v = clamp(Math.round(v), min, max);
        set(v);
        range.value = v;
        out.textContent = fmt(v);
        paint(track);
        saveSoon();
      };
      range.addEventListener('input', () => apply(+range.value));
      range.addEventListener('change', () => {
        if (!SS.audio.isPlaying()) SS.audio.preview(track, ev.notes.length === 1 ? ev.notes[0] : ev.notes);
      });
      range.addEventListener('dblclick', () => apply(label === 'Vélocité' ? 102 : 1));
      return h(
        'div',
        { class: 'ctx-param' },
        h('span', { class: 'ctx-param-label' }, label),
        h('button', { type: 'button', title: label + ' −', 'aria-label': label + ' moins', onclick: () => apply(get() - 1) }, '−'),
        range,
        h('button', { type: 'button', title: label + ' +', 'aria-label': label + ' plus', onclick: () => apply(get() + 1) }, '+'),
        out
      );
    }
    const spb = SS.stepsPerBar(app.project());
    const fmtLen = (v) => `${v} pas` + (v % spb === 0 ? ` · ${v / spb} mes.` : v % 4 === 0 ? ` · ${v / 4} t.` : '');
    const paramsBox = () =>
      h(
        'div',
        { class: 'ctx-params' },
        paramRow('Longueur', () => ev.len, (v) => (ev.len = v), 1, maxLen, fmtLen, `De 1 à ${maxLen} pas (jusqu'à la note suivante)`),
        paramRow('Vélocité', () => Math.round(ev.vel * 127), (v) => (ev.vel = v / 127), 1, 127, (v) => String(v), 'Force de la note, de 1 à 127')
      );

    function render() {
      const root = ev.notes[0];
      const pc = ((root % 12) + 12) % 12;
      const label = mono ? SS.noteName(root) : SS.NOTE_NAMES[pc] + (CHORD_SUFFIX[ev.chord] ?? '');
      const noteCol = h(
        'div',
        { class: 'ctx-col', role: 'radiogroup', 'aria-label': mono ? 'Note' : 'Fondamentale' },
        h('div', { class: 'ctx-col-title' }, mono ? 'Note' : 'Note'),
        MENU_NOTES.map((n) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(n === pc),
              class: (n === pc ? 'current' : '') + (SS.isBlackKey(n) ? ' sharp' : ''),
              onclick: () => setRoot(n),
            },
            SS.NOTE_NAMES[n]
          )
        )
      );
      const typeCol = mono
        ? null
        : h(
            'div',
            { class: 'ctx-col', role: 'radiogroup', 'aria-label': 'Type d’accord' },
            h('div', { class: 'ctx-col-title' }, 'Accord'),
            SS.CHORDS.map((c) =>
              h(
                'button',
                {
                  type: 'button',
                  role: 'radio',
                  'aria-checked': String(c.id === ev.chord),
                  class: c.id === ev.chord ? 'current' : null,
                  onclick: () => setType(c.id),
                },
                h('span', { class: 'ctx-name' }, c.label),
                h('span', { class: 'ctx-desc' }, SS.NOTE_NAMES[pc] + (CHORD_SUFFIX[c.id] ?? ''))
              )
            )
          );
      menuEl.replaceChildren(
        h(
          'div',
          { class: 'ctx-head' },
          h('b', { class: 'ctx-current' }, label),
          h('span', { class: 'ctx-desc' }, mono ? '' : ev.notes.map(SS.noteName).join(' · ')),
          h(
            'span',
            { class: 'ctx-oct' },
            h('button', { type: 'button', title: 'Une octave plus bas', onclick: () => shiftOct(-1) }, '−8ve'),
            h('button', { type: 'button', title: 'Une octave plus haut', onclick: () => shiftOct(1) }, '+8ve')
          )
        ),
        h('div', { class: 'ctx-cols' }, noteCol, typeCol),
        paramsBox(),
        h(
          'div',
          { class: 'ctx-foot' },
          h(
            'button',
            {
              type: 'button',
              class: 'danger',
              onclick: () => {
                track.events = track.events.filter((o) => o !== ev);
                unselectIfRemoved(track);
                paint(track);
                app.changed();
                closeChordMenu();
              },
            },
            'Supprimer'
          ),
          h('button', { type: 'button', class: 'ctx-close', onclick: () => closeChordMenu() }, 'Fermer')
        )
      );
    }
    render();

    document.body.append(menuEl);
    // garde le menu dans la fenêtre
    const r = menuEl.getBoundingClientRect();
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth, window.visualViewport ? window.visualViewport.width : Infinity);
    const vh = Math.min(window.innerHeight, window.visualViewport ? window.visualViewport.height : Infinity);
    menuEl.style.left = Math.max(8, Math.min(x, vw - r.width - 8)) + 'px';
    menuEl.style.top = Math.max(8, Math.min(y, vh - r.height - 8)) + 'px';
    (menuEl.querySelector('.ctx-cols .current') || menuEl.querySelector('button')).focus();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onMenuKey, true);
    window.addEventListener('resize', closeChordMenu);
    document.getElementById('workspace').addEventListener('scroll', closeChordMenu);
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
    // chaque piste a sa propre position dans sa boucle
    const total = SS.totalSteps(p);
    const g = step % total;
    $('#ruler').querySelectorAll(`[data-step="${g}"]`).forEach((el) => el.classList.add('now'));
    p.tracks.forEach((t) => {
      const ref = refs.get(t.id);
      if (!ref) return;
      const s = step % SS.trackLen(p, t);
      if (ref.cells[s]) ref.cells[s].classList.add('now');
      ref.roll.forEach((cells) => cells[s] && cells[s].classList.add('now'));
    });
    const spb = SS.stepsPerBar(p);
    const beat = SS.stepsPerBeat(p);
    $('#position').textContent = `${Math.floor(g / spb) + 1} . ${Math.floor((g % spb) / beat) + 1} . ${(g % beat) + 1}`;
    if (follow.on && SS.audio.isPlaying()) followPlayhead(g, spb);
  }

  /* ---------- Suivre la lecture : défilement horizontal automatique ---------- */
  const follow = { on: true };
  try {
    follow.on = localStorage.getItem('stepseq.follow') !== '0';
  } catch (e) {
    /* stockage indisponible : on garde la valeur par défaut */
  }

  /**
   * Si la case jouée sort de la zone visible (à droite, ou à gauche quand la boucle repart au début),
   * on fait défiler pour que sa mesure commence juste après les en-têtes de piste.
   */
  function followPlayhead(g, spb) {
    const ws = $('#workspace');
    const cell = $('#ruler').querySelector(`[data-step="${g}"]`);
    if (!cell) return;
    const head = $('#ruler .head-spacer').offsetWidth;
    const left = ws.scrollLeft + head;
    const right = ws.scrollLeft + ws.clientWidth;
    const x = cell.offsetLeft;
    if (x >= left && x + cell.offsetWidth <= right - 16) return; // déjà visible
    const barStart = $('#ruler').querySelector(`[data-step="${g - (g % spb)}"]`) || cell;
    const target = Math.max(0, barStart.offsetLeft - head - 8);
    if (Math.abs(target - ws.scrollLeft) < 2) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ws.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' });
  }

  function setFollow(on) {
    follow.on = on;
    try {
      localStorage.setItem('stepseq.follow', on ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Dialogue d'ajout / modification de piste                            */
  /* ------------------------------------------------------------------ */

  const dlg = {};

  /* --- Listes de choix (remplacent les listes déroulantes) ------------- */
  // Une liste = div.pick-list[role=listbox] ; ↑ ↓ Début Fin Pg↑ Pg↓ : choisir (et écouter),
  // ← → : colonne voisine, lettres : aller au premier nom qui commence par…, Espace : écouter, Entrée : valider.
  let listUid = 0;
  function setupList(el, onPick) {
    el.setAttribute('role', 'listbox');
    el.tabIndex = 0;
    el._onPick = onPick;
    let buf = '';
    let bufT = null;
    el.addEventListener('click', (e) => {
      const it = e.target.closest('.pl-item');
      if (!it) return;
      el.focus({ preventScroll: true });
      chooseItem(el, it, true);
    });
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.pl-item')) dlg.form.requestSubmit();
    });
    el.addEventListener('keydown', (e) => {
      const items = [...el.querySelectorAll('.pl-item')];
      const i = items.findIndex((x) => x.classList.contains('sel'));
      const go = (j) => {
        e.preventDefault();
        if (items.length) chooseItem(el, items[clamp(j, 0, items.length - 1)], true);
      };
      switch (e.key) {
        case 'ArrowDown': return go(i + 1);
        case 'ArrowUp':
          if (i <= 0) {
            e.preventDefault();
            const search = el.parentElement.querySelector('.br-search');
            if (search) search.focus();
            else focusPills(el, -1, true);
            return;
          }
          return go(i - 1);
        case 'Home': return go(0);
        case 'End': return go(items.length - 1);
        case 'PageDown': return go(i + 8);
        case 'PageUp': return go(i - 8);
        case 'ArrowRight':
        case 'ArrowLeft': {
          e.preventDefault();
          const cols = [...el.closest('.browser').querySelectorAll('.pick-list')].filter((x) => x.offsetParent);
          const next = cols[cols.indexOf(el) + (e.key === 'ArrowRight' ? 1 : -1)];
          if (next) next.focus();
          return;
        }
        case 'Enter':
          e.preventDefault();
          dlg.form.requestSubmit();
          return;
        case ' ':
          e.preventDefault();
          previewDialog();
          return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && items.length) {
        clearTimeout(bufT);
        buf += e.key.toLowerCase();
        bufT = setTimeout(() => (buf = ''), 800);
        const from = buf.length === 1 ? i + 1 : Math.max(0, i);
        for (let k = 0; k < items.length; k++) {
          const it = items[(from + k) % items.length];
          if (it.dataset.key.startsWith(buf)) {
            e.preventDefault();
            chooseItem(el, it, true);
            break;
          }
        }
      }
    });
  }

  function chooseItem(el, it, user) {
    el.querySelectorAll('.pl-item.sel').forEach((x) => {
      x.classList.remove('sel');
      x.setAttribute('aria-selected', 'false');
    });
    it.classList.add('sel');
    it.setAttribute('aria-selected', 'true');
    el.setAttribute('aria-activedescendant', it.id);
    it.scrollIntoView({ block: 'nearest' });
    if (user) el._onPick(it.dataset.v);
  }

  /** Remplit une liste. entries : { v, label, meta?, title? } ou { group: 'Titre' } ; empty : texte si vide. */
  function fillList(el, entries, selected, empty = 'Aucun résultat') {
    const nodes = entries.map((en) => {
      if (en.group) return h('div', { class: 'pl-group', role: 'presentation' }, en.group);
      return h('div', {
        class: 'pl-item' + (String(en.v) === String(selected) ? ' sel' : ''),
        role: 'option',
        id: 'pl' + ++listUid,
        'data-v': en.v,
        'data-key': en.label.toLowerCase(),
        'aria-selected': String(String(en.v) === String(selected)),
        title: en.title || null,
      }, h('span', { class: 'pl-label' }, en.label), en.meta ? h('small', { class: 'pl-meta' }, en.meta) : null);
    });
    el.replaceChildren(...(nodes.length ? nodes : [h('div', { class: 'pl-empty' }, empty)]));
    const sel = el.querySelector('.pl-item.sel');
    if (sel) {
      el.setAttribute('aria-activedescendant', sel.id);
      requestAnimationFrame(() => sel.scrollIntoView({ block: 'nearest' }));
    } else el.removeAttribute('aria-activedescendant');
  }

  /* --- Pastilles : une seule pastille dans l'ordre de tabulation, ← → pour changer, ↓ vers la liste */
  function setupPills(group) {
    group.addEventListener('keydown', (e) => {
      const btns = [...group.querySelectorAll('button')].filter((b) => !b.disabled);
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) {
        e.preventDefault();
        const b = btns[(i + step + btns.length) % btns.length];
        b.focus();
        b.click();
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const b = btns[e.key === 'Home' ? 0 : btns.length - 1];
        b.focus();
        b.click();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusPills(group, e.key === 'ArrowDown' ? 1 : -1);
      }
    });
  }

  /** Va à l'arrêt clavier suivant / précédent visible (pastilles, recherche, liste) ; onlyPills : saute aux pastilles. */
  function focusPills(from, dir, onlyPills) {
    const stops = [...dlg.form.querySelectorAll('.pills-nav, .br-search, .pick-list')].filter((x) => x.offsetParent);
    let j = stops.indexOf(from) + dir;
    while (stops[j] && onlyPills && !stops[j].classList.contains('pills-nav')) j += dir;
    const target = stops[j];
    if (!target) return;
    if (target.classList.contains('pills-nav')) {
      const b = target.querySelector('button.active:not(:disabled)') || target.querySelector('button:not(:disabled)');
      if (b) b.focus();
    } else target.focus();
  }

  function rovePills(group) {
    const btns = [...group.querySelectorAll('button')];
    const act = btns.find((b) => b.classList.contains('active') && !b.disabled) || btns.find((b) => !b.disabled);
    btns.forEach((b) => {
      b.tabIndex = b === act ? 0 : -1;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(b.classList.contains('active')));
    });
  }

  let previewT = null;
  function previewSoon() {
    clearTimeout(previewT);
    previewT = setTimeout(previewDialog, 120);
  }

  function initDialog() {
    dlg.el = $('#trackDialog');
    dlg.form = $('#trackForm');

    // Couleurs
    const colors = $('#dlgColors');
    SS.COLORS.forEach((c) =>
      colors.append(h('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'data-c': c, title: c, 'aria-label': 'Couleur ' + c, onclick: () => setColor(c) }))
    );
    dlg.colorInput = h('input', { type: 'color', title: 'Couleur personnalisée', oninput: (e) => setColor(e.target.value) });
    colors.append(dlg.colorInput);

    // Types de drum
    SS.DRUM_TYPES.forEach((t) =>
      $('#dlgDrumTypes').append(
        h('button', { type: 'button', class: 'chip', 'data-v': t.id, onclick: () => dlg.s.sound !== t.id && setDrumSound(t.id, true) }, t.label)
      )
    );
    // Bibliothèques de batterie
    SS.DRUM_LIBS.forEach((l) =>
      $('#dlgDrumLib').append(
        h('button', {
          type: 'button',
          'data-v': l.id,
          title: l.hint,
          onclick: () => {
            if (dlg.s.source === l.id) return;
            dlg.s.source = l.id;
            dlg.s.variant = 0;
            $('#dlgDrumFilter').value = '';
            syncDialog();
            refreshDrum(true);
          },
        }, l.label)
      )
    );
    setupList($('#dlgDrumList'), (v) => {
      if ((dlg.s.source || 'tdm') === 'tdm') dlg.s.machine = v;
      else dlg.s.bank = v;
      dlg.s.variant = 0;
      autoName();
      refreshVariants(true);
    });
    setupList($('#dlgVariantList'), (v) => {
      dlg.s.variant = +v;
      previewSoon();
    });
    setupList($('#dlgInstList'), (v) => {
      const loc = SS.locateInstrument(dlg.s.family, v);
      dlg.s.instrument = loc.inst.id;
      dlg.s.family = loc.family.id; // un résultat de recherche peut venir d'une autre famille
      dlg.s.sfv = 0;
      fillSfv();
      autoName();
      syncDialog();
      previewSoon();
    });
    setupList($('#dlgSfvList'), (v) => {
      dlg.s.sfv = +v;
      previewSoon();
    });
    setupList($('#dlgSynthList'), (v) => {
      dlg.s.analog = v;
      autoName();
      fillSynth();
      previewSoon();
    });
    setupList($('#dlgPatchList'), (v) => {
      dlg.s.patch = v;
      previewSoon();
    });
    // champs de recherche : ↓ ou Entrée descend dans la liste
    [['#dlgDrumFilter', '#dlgDrumList', fillDrumList], ['#dlgInstFilter', '#dlgInstList', fillInstruments]].forEach(([inp, list, fill]) => {
      $(inp).addEventListener('input', () => {
        fill();
        syncDialog(); // en recherche, aucune famille n'est en surbrillance
      });
      $(inp).addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          const l = $(list);
          l.focus();
          if (!l.querySelector('.pl-item.sel')) {
            const first = l.querySelector('.pl-item');
            if (first) chooseItem(l, first, true);
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusPills(e.target, -1);
        }
      });
    });
    $('#dlgLenSteps').addEventListener('input', (e) => {
      const total = SS.totalSteps(app.project());
      const v = parseInt(e.target.value, 10);
      if (!Number.isFinite(v)) return;
      dlg.s.length = v >= total ? 0 : Math.max(1, v);
      syncLen(true);
    });
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
            if (dlg.s.family === f.id && !$('#dlgInstFilter').value) return;
            dlg.s.family = f.id;
            dlg.s.instrument = f.instruments[0].id;
            dlg.s.sfv = 0;
            $('#dlgInstFilter').value = '';
            fillInstruments();
            fillSfv();
            autoName();
            syncDialog();
          },
        }, f.label)
      )
    );

    $('#dlgType').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled || dlg.s.type === b.dataset.v) return;
      dlg.s.type = b.dataset.v;
      autoName();
      syncDialog();
      if (dlg.s.type === 'drum') refreshDrum();
      if (dlg.s.type === 'synth') fillSynth();
    });
    dlg.form.querySelectorAll('.pills-nav').forEach(setupPills);
    $('#dlgName').addEventListener('input', (e) => {
      dlg.s.name = e.target.value;
      dlg.s.nameEdited = true;
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
      const others = app.project().tracks.filter((x) => x.type === 'drum' && x.id !== s.editingId);
      if (s.source && s.source !== 'tdm') {
        const name = String(s.bank || 'Drum').replace(/_/g, ' ');
        const count = others.filter((x) => x.source === s.source && x.bank === s.bank).length;
        return `${name.charAt(0).toUpperCase() + name.slice(1)} ${count + 1}`;
      }
      const t = SS.DRUM_TYPES.find((d) => d.id === s.sound);
      const count = others.filter((x) => (x.source || 'tdm') === 'tdm' && x.sound === s.sound).length;
      return `${t ? t.label : 'Drum'} ${count + 1}`;
    }
    if (s.type === 'synth') return SS.findAnalog(s.analog).label.replace(/^Roland /, '');
    return SS.findInstrument(s.family, s.instrument).label.replace(/\s*\(.*\)$/, '');
  }

  /** Piste Synthé : liste des synthés analogiques, patches du synthé choisi et fiche de configuration. */
  function fillSynth() {
    const s = dlg.s;
    fillList($('#dlgSynthList'), SS.ANALOG_SYNTHS.map((x) => ({ v: x.id, label: x.label, meta: String(x.year) })), s.analog);
    $('#dlgSynthCount').textContent = String(SS.ANALOG_SYNTHS.length);
    fillList($('#dlgPatchList'), SS.JUNO_PATCHES.map((p) => ({ v: p.id, label: `${p.id} — ${p.name}` })), s.patch);
    $('#dlgPatchCount').textContent = String(SS.JUNO_PATCHES.length);
    const syn = SS.findAnalog(s.analog);
    $('#dlgSynthCard').replaceChildren(
      h('div', { class: 'synth-card-head' }, h('b', {}, syn.label), h('small', {}, `${syn.maker} · ${syn.year}`)),
      h('dl', {}, ...syn.specs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))
    );
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
    let machines = [];
    fillList($('#dlgDrumList'), [], null, 'Chargement…');
    try {
      machines = await SS.audio.drumMachines(dlg.s.sound);
    } catch (e) {
      toast('Impossible de charger la bibliothèque tidal-drum-machines (connexion internet requise).');
    }
    if ((dlg.s.source || 'tdm') !== 'tdm') return;
    if (!machines.includes(dlg.s.machine)) {
      dlg.s.machine = machines.includes(SS.DEFAULT_MACHINE) ? SS.DEFAULT_MACHINE : machines[0];
      dlg.s.variant = 0;
    }
    dlg.machines = machines;
    fillDrumList();
    await refreshVariants(preview);
  }

  /** Batterie : recharge les listes selon la bibliothèque choisie. */
  async function refreshDrum(preview) {
    if ((dlg.s.source || 'tdm') === 'tdm') return refreshMachines(preview);
    return refreshBanks(preview);
  }

  const DEFAULT_BANK = { dirt: 'jazz', vcsl: 'conga', mrid: 'ta' };
  async function refreshBanks(preview) {
    const source = dlg.s.source;
    let banks = [];
    fillList($('#dlgDrumList'), [], null, 'Chargement…');
    try {
      banks = await SS.audio.drumBanks(source);
    } catch (e) {
      toast('Impossible de charger cette bibliothèque (connexion internet requise).');
    }
    if (dlg.s.source !== source) return; // l'utilisateur a changé de bibliothèque entre-temps
    dlg.banks = banks;
    if (!banks.some((b) => b.id === dlg.s.bank)) {
      dlg.s.bank = banks.some((b) => b.id === DEFAULT_BANK[source]) ? DEFAULT_BANK[source] : banks[0] && banks[0].id;
      dlg.s.variant = 0;
    }
    autoName();
    fillDrumList();
    await refreshVariants(preview);
  }

  /** Colonne de gauche des drums : boîtes à rythmes (tidal-drum-machines) ou banques (autres bibliothèques). */
  function fillDrumList() {
    const q = $('#dlgDrumFilter').value.trim().toLowerCase();
    const tdm = (dlg.s.source || 'tdm') === 'tdm';
    const all = tdm ? (dlg.machines || []).map((m) => ({ v: m, label: m })) : (dlg.banks || []).map((b) => ({ v: b.id, label: b.id.replace(/_/g, ' '), meta: String(b.count) }));
    const cur = tdm ? dlg.s.machine : dlg.s.bank;
    const list = all.filter((x) => !q || x.label.toLowerCase().includes(q) || String(x.v).toLowerCase().includes(q));
    $('#dlgDrumListLabel').textContent = tdm ? 'Boîte à rythmes' : 'Banque';
    $('#dlgDrumFilter').placeholder = tdm ? '🔍 Filtrer les boîtes à rythmes (808, linn, dmx…)' : '🔍 Filtrer les banques (808, jazz, conga…)';
    $('#dlgDrumCount').textContent = all.length ? (q ? `${list.length} / ${all.length}` : String(all.length)) : '';
    fillList($('#dlgDrumList'), list, cur);
  }

  async function refreshVariants(preview) {
    const s = dlg.s;
    let list = [];
    if ((s.source || 'tdm') === 'tdm') list = s.machine ? await SS.audio.drumVariants(s.machine, s.sound).catch(() => []) : [];
    else list = s.bank ? await SS.audio.bankVariants(s.source, s.bank).catch(() => []) : [];
    if (dlg.s.variant >= list.length) dlg.s.variant = 0;
    fillList(
      $('#dlgVariantList'),
      list.map((url, i) => ({ v: i, label: String(i + 1), meta: decodeURIComponent(url.split('/').pop()).replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, '') })),
      dlg.s.variant,
      'Aucun son'
    );
    $('#dlgVariantCount').textContent = list.length ? String(list.length) : '';
    if (preview) previewSoon();
  }

  function fillInstruments() {
    const q = $('#dlgInstFilter').value.trim().toLowerCase();
    const ent = (i) => ({ v: i.id, label: i.label, title: i.strudel ? `strudel : s("${i.strudel}")` : null });
    let entries;
    if (!q) {
      entries = SS.findFamily(dlg.s.family).instruments.map(ent);
      $('#dlgInstCount').textContent = String(entries.length);
    } else {
      // recherche dans toutes les familles, résultats groupés par famille
      entries = [];
      let n = 0;
      SS.FAMILIES.forEach((f) => {
        const hits = f.instruments.filter((i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
        if (hits.length) entries.push({ group: f.label }, ...hits.map(ent));
        n += hits.length;
      });
      $('#dlgInstCount').textContent = `${n} trouvé${n > 1 ? 's' : ''}`;
    }
    fillList($('#dlgInstList'), entries, dlg.s.instrument, 'Aucun instrument trouvé');
  }

  /** Longueurs proposées (en mesures, selon le projet) en pastilles + saisie libre en pas. */
  function fillLen() {
    const p = app.project();
    const spb = SS.stepsPerBar(p);
    const total = SS.totalSteps(p);
    const opts = [{ v: 0, label: `Comme le projet (${p.bars} mes.)` }];
    const half = spb / 2;
    if (Number.isInteger(half)) opts.push({ v: half, label: '½ mesure' });
    [1, 2, 4, 8, 16, 32].filter((b) => b * spb < total).forEach((b) => opts.push({ v: b * spb, label: `${b} mes.` }));
    $('#dlgLen').replaceChildren(
      ...opts.map((o) =>
        h('button', {
          type: 'button',
          class: 'chip',
          'data-v': o.v,
          onclick: () => {
            dlg.s.length = o.v;
            syncLen();
          },
        }, o.label)
      )
    );
    $('#dlgLenSteps').max = total;
    syncLen();
  }

  function syncLen(fromInput) {
    const total = SS.totalSteps(app.project());
    const len = dlg.s.length || 0;
    $('#dlgLen').querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', +b.dataset.v === len));
    rovePills($('#dlgLen'));
    if (!fromInput) $('#dlgLenSteps').value = len || total;
  }

  /** Variantes : soundfont (les gm_* de strudel existent en plusieurs banques) ou échantillon Dirt-Samples. */
  function fillSfv() {
    const inst = SS.findInstrument(dlg.s.family, dlg.s.instrument);
    const files = inst.files || [];
    if (dlg.s.sfv >= files.length) dlg.s.sfv = 0;
    fillList(
      $('#dlgSfvList'),
      files.map((f, i) => ({ v: i, label: `${i + 1} — ${SS.variantLabel(inst, f)}`, meta: i === 0 ? 'par défaut' : '' })),
      dlg.s.sfv,
      'Une seule variante'
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
    $('#dlgInst').hidden = s.type !== 'instrument';
    $('#dlgSynth').hidden = s.type !== 'synth';
    $('#dlgCatRow').hidden = isDrum;
    const src = s.source || 'tdm';
    $('#dlgDrumLib').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === src));
    $('#dlgDrumLibHint').textContent = (SS.DRUM_LIBS.find((l) => l.id === src) || {}).hint || '';
    $('#dlgTdm').hidden = src !== 'tdm';
    $('#dlgColors').querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.c === s.color));
    dlg.colorInput.value = s.color;
    $('#dlgDrumTypes').querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.dataset.v === s.sound));
    $('#dlgCategory').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === s.category));
    $('#dlgFamilies').querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.dataset.v === s.family && !$('#dlgInstFilter').value.trim()));
    dlg.form.querySelectorAll('.pills-nav').forEach(rovePills);
  }

  function previewDialog() {
    const s = dlg.s;
    const synth = s.type === 'synth';
    const family = synth ? 'analog' : s.family;
    const fake = synth
      ? { ...s, type: 'instrument', id: null, family, instrument: s.analog, junoPatch: s.patch, octave: SS.findFamily(family).octave, chord: 'min' }
      : { ...s, id: null, octave: SS.findFamily(s.family).octave, chord: 'min' };
    if (s.type === 'drum') SS.audio.preview(fake);
    else {
      const root = (SS.findFamily(family).octave + 1) * 12;
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
          type: SS.isAnalog(track) ? 'synth' : track.type,
          name: track.name,
          nameEdited: true,
          color: track.color,
          source: track.source || 'tdm',
          sound: track.sound || 'bd',
          machine: track.machine || SS.DEFAULT_MACHINE,
          bank: track.bank,
          variant: track.variant || 0,
          category: track.category || 'mono',
          family: SS.isAnalog(track) ? 'bass' : track.family || 'bass',
          instrument: SS.isAnalog(track) ? SS.findFamily('bass').instruments[0].id : track.instrument || SS.findFamily('bass').instruments[0].id,
          analog: SS.isAnalog(track) ? track.instrument : SS.ANALOG_SYNTHS[0].id,
          patch: track.junoPatch || SS.JUNO_PATCHES[0].id,
          sfv: track.sfv || 0,
          length: track.length && track.length < SS.totalSteps(p) ? track.length : 0,
        }
      : {
          editingId: null,
          type: 'drum',
          name: '',
          nameEdited: false,
          color: freeColor,
          source: 'tdm',
          sound: 'bd',
          machine: SS.DEFAULT_MACHINE,
          bank: null,
          variant: 0,
          category: 'mono',
          family: 'bass',
          instrument: SS.findFamily('bass').instruments[0].id,
          analog: SS.ANALOG_SYNTHS[0].id,
          patch: SS.JUNO_PATCHES[0].id,
          sfv: 0,
          length: 0,
        };
    $('#dlgTitle').textContent = track ? 'Modifier la piste' : 'Nouvelle piste';
    $('#dlgOk').textContent = track ? 'Appliquer' : 'Valider';
    $('#dlgName').value = dlg.s.name;
    $('#dlgInstFilter').value = '';
    $('#dlgDrumFilter').value = '';
    autoName();
    fillInstruments();
    fillSfv();
    fillSynth();
    fillLen();
    syncDialog();
    refreshDrum(false);
    dlg.el.returnValue = '';
    dlg.el.showModal();
    // le clavier part de la liste principale (le nom reste à un Maj+Tab)
    requestAnimationFrame(() => $({ drum: '#dlgDrumList', instrument: '#dlgInstList', synth: '#dlgPatchList' }[dlg.s.type]).focus());
    return new Promise((resolve) => (dlg.resolve = resolve));
  }

  /* ------------------------------------------------------------------ */

  function init(appApi) {
    app = appApi;
    const fp = $('#followPlay');
    if (fp) {
      fp.checked = follow.on;
      fp.addEventListener('change', (e) => setFollow(e.target.checked));
    }
    initDialog();
    initSelection();
  }

  function initSelection() {
    document.addEventListener(
      'pointermove',
      (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
      },
      { passive: true }
    );
    // clic dans le vide (fond, en-têtes, règle) : tout désélectionner
    $('#workspace').addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !sel) return;
      if (e.target.closest('button, input, select, label, a, .grid, .roll, .th-name, .th-grip, .len-handle')) return;
      setSelection(null);
    });
    const on = (id, fn) => $(id) && $(id).addEventListener('click', fn);
    on('#selMode', () => setSelectMode(!selectMode));
    on('#selCopy', () => copySelection());
    on('#selCut', () => copySelection({ cut: true }));
    on('#selPaste', () => paste());
    on('#selDup', duplicateSelection);
    on('#selDel', deleteSelection);
    on('#selClear', () => setSelection(null));
    updateSelBar();
  }

  return {
    init,
    renderAll,
    renderTrack,
    paint,
    setPlayhead,
    toast,
    openTrackDialog,
    trackSubtitle,
    handleKey,
    clearSelection: () => setSelection(null),
    activeTrack,
  };
})();
