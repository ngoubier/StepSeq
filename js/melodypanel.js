/*
 * Band → onglet « Mélodie » : proposer une mélodie sur une piste à partir d'une grille d'accords et d'une
 * structure (notes par phrase). La mélodie dure exactement la grille : 4 accords → 4 mesures.
 * Vue simple : grille, structure, piste. Paroles, tonalité, tessiture, rythme et fin sont dans « Options ». Le calcul est dans js/melody.js (méthode du skill
 * « composer-melodies-accords-texte ») ; ce module gère le formulaire, l'affichage de la proposition
 * (hypothèses, scansion, tableau des notes, contrôles) et l'écriture sur la piste choisie.
 *
 * Rien n'est écrit dans le projet avant « Écrire sur la piste » (Ctrl+Z revient en arrière).
 */
window.SS = window.SS || {};
SS.melodyPanel = (() => {
  const M = () => SS.melody;
  const H = () => SS.harmony;
  let app = null;
  let ctx = null; // { leadOpts(): { opts, levelKey, style } , close() }
  let box = null;
  const S = {
    grid: '',
    source: 'meter', // 'text' quand des paroles sont écrites dans les options
    text: '',
    meter: '',
    key: 'auto', // d'après les accords écrits ; la tonalité de la scène reste au choix dans les options
    range: 'voix',
    style: 'simple',
    ending: 'closed',
    eMode: 'classique',
    sungFinalE: false,
    track: '',
    seed: 1,
    res: null,
  };

  const $ = (q, root = document) => root.querySelector(q);
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  const opt = (value, label, sel) => h('option', { value, selected: sel ? true : null }, label);

  /* ---------- Contexte du projet ---------- */
  const project = () => app.project();
  const sceneKey = () => SS.sceneKey(project());
  function keyChoice() {
    if (S.key === 'auto') return null;
    if (S.key === 'scene') return sceneKey();
    const [tonic, mode] = S.key.split('|');
    return { tonic, mode };
  }
  const monoTracks = () => project().tracks.filter((t) => t.type === 'instrument' && t.category === 'mono');
  function defaultTrack() {
    const list = monoTracks();
    const pref = list.find((t) => t.melody) || list.find((t) => t.band && ['vox', 'lead', 'sax'].includes(String(t.band.key).split(':')[0]));
    return pref ? pref.id : 'new';
  }

  /** Accords de la scène en cours → texte de grille (grille Harmo One, sinon pistes d'accords). */
  function gridFromScene() {
    const p = project();
    const spb = SS.stepsPerBar(p);
    const beat = SS.stepsPerBeat(p);
    const key = sceneKey();
    const sc = SS.currentScene(p);
    let spans = [];
    if (sc && sc.grid && sc.grid.chords && sc.grid.chords.length && key)
      spans = sc.grid.chords.map((c) => ({
        step: c.step,
        len: c.len,
        name: H().gridChord(key, c.degree, c.type, c.acc || 0).name,
      }));
    if (!spans.length) {
      const evs = [];
      p.tracks.forEach((t) => t.type === 'instrument' && (t.events || []).forEach((e) => new Set(e.notes.map((n) => n % 12)).size >= 3 && evs.push(e)));
      evs.sort((a, b) => a.step - b.step);
      evs.forEach((e) => {
        const id = H().identify(e.notes);
        if (!id) return;
        const name = H()
          .chordName(key || { tonic: 'C', mode: 'major' }, id)
          .replace(/°$/, 'dim');
        const prev = spans[spans.length - 1];
        if (prev && prev.step === e.step) return;
        if (prev && prev.name === name && prev.step + prev.len >= e.step) prev.len = Math.max(prev.len, e.step + e.len - prev.step);
        else spans.push({ step: e.step, len: e.len, name });
      });
    }
    if (!spans.length) return null;
    const lastEnd = Math.max(...spans.map((s) => s.step + s.len));
    const bars = Math.max(1, Math.min(p.bars, Math.ceil(lastEnd / spb)));
    const nameAt = (s) => {
      let n = null;
      spans.forEach((sp) => sp.step <= s && (n = sp.name));
      return n;
    };
    const out = [];
    let prevName = null;
    for (let b = 0; b < bars; b++) {
      const beats = [];
      for (let s = b * spb; s < (b + 1) * spb; s += beat) beats.push(nameAt(s) || prevName || spans[0].name);
      prevName = beats[beats.length - 1];
      const half = beats.length % 2 === 0 ? beats.length / 2 : 0;
      if (beats.every((x) => x === beats[0])) out.push(beats[0]);
      else if (half && beats.slice(0, half).every((x) => x === beats[0]) && beats.slice(half).every((x) => x === beats[half])) out.push(`${beats[0]} ${beats[half]}`);
      else out.push(beats.map((x, i) => (i && x === beats[i - 1] ? '.' : x)).join(' '));
    }
    return out.join(' | ');
  }

  /* ---------- Formulaire ---------- */
  function keyOptions() {
    const sk = sceneKey();
    const list = [opt('auto', 'Automatique (d’après les accords)', S.key === 'auto')];
    if (sk) list.push(opt('scene', `Tonalité de la scène : ${H().label(sk)}`, S.key === 'scene'));
    const modes = ['major', 'minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'harmonic'];
    modes.forEach((mode) =>
      list.push(h('optgroup', { label: (H().MODES.find((m) => m.id === mode) || {}).label }, ...H().TONICS.map((t) => opt(`${t}|${mode}`, H().label({ tonic: t, mode }), S.key === `${t}|${mode}`)))),
    );
    return list;
  }

  function field(label, control, hint) {
    return h('label', { class: 'mel-field' }, h('span', { class: 'dlg-label' }, label), control, hint ? h('small', { class: 'dlg-hint' }, hint) : null);
  }

  function renderForm() {
    if (S.key === 'scene' && !sceneKey()) S.key = 'auto';
    if (!S.track || (S.track !== 'new' && !monoTracks().some((t) => t.id === S.track))) S.track = defaultTrack();
    const sel = (id, value, options, onchange) => {
      const e = h('select', { id, onchange: (ev) => onchange(ev.target.value) }, ...options);
      e.value = value;
      return e;
    };
    const gridArea = h('textarea', {
      id: 'melGrid',
      rows: 2,
      spellcheck: 'false',
      placeholder: 'Am | F | C | G',
      oninput: (e) => {
        S.grid = e.target.value;
        renderGridChips();
      },
    });
    gridArea.value = S.grid;
    const meter = h('input', {
      id: 'melMeter',
      type: 'text',
      value: S.meter,
      placeholder: 'automatique',
      oninput: (e) => (S.meter = e.target.value),
    });
    const textArea = h('textarea', {
      id: 'melText',
      rows: 4,
      spellcheck: 'false',
      placeholder: 'Facultatif : un vers par ligne. Les paroles remplacent alors la structure.',
      oninput: (e) => (S.text = e.target.value),
    });
    textArea.value = S.text;
    return h(
      'div',
      { class: 'mel-form' },
      h('div', { class: 'band-step' }, h('b', {}, '1'), 'Grille d’accords'),
      gridArea,
      h('div', {
        class: 'mel-chips',
        id: 'melGridChips',
        'aria-live': 'polite',
      }),
      h(
        'button',
        {
          type: 'button',
          class: 'btn mel-scene',
          id: 'melFromScene',
          onclick: fromScene,
          title: 'Lire les accords de la scène en cours (grille Key ou pistes d’accords)',
        },
        'Reprendre les accords de la scène',
      ),
      h('div', { class: 'band-step' }, h('b', {}, '2'), 'Structure'),
      meter,
      h('small', { class: 'dlg-hint' }, 'Notes par phrase : « 8 8 » = deux phrases de 8 notes, qui se partagent la grille. « 3+5 » = notes par mesure. Vide : automatique.'),
      h('div', { class: 'band-step' }, h('b', {}, '3'), 'Piste'),
      sel('melTrack', S.track, [...monoTracks().map((t) => opt(t.id, `${t.name}${t.melody ? ' (mélodie)' : ''}`)), opt('new', '+ Nouvelle piste « Mélodie »')], (v) => {
        S.track = v;
        renderOut();
      }),
      h(
        'details',
        { class: 'mel-more', id: 'melMore' },
        h('summary', {}, 'Options'),
        h(
          'div',
          { class: 'mel-grid2' },
          field(
            'Tonalité',
            sel('melKey', S.key, keyOptions(), (v) => (S.key = v)),
          ),
          field(
            'Tessiture',
            sel(
              'melRange',
              S.range,
              Object.entries(M().RANGES).map(([id, r]) => opt(id, r.label)),
              (v) => (S.range = v),
            ),
          ),
          field(
            'Rythme',
            sel('melStyle', S.style, [opt('simple', 'Simple'), opt('varie', 'Varié (pointées, syncopes)'), opt('dense', 'Dense (doubles-croches)')], (v) => (S.style = v)),
          ),
          field(
            'Fin',
            sel('melEnding', S.ending, [opt('closed', 'Fermée (tonique)'), opt('open', 'Ouverte')], (v) => (S.ending = v)),
          ),
        ),
        field('Paroles', textArea, '« / » coupe une syllabe (vi/olon), (ent) rend des lettres muettes, [3+5] en fin de ligne fixe les syllabes par mesure.'),
        h(
          'div',
          { class: 'mel-grid2' },
          field(
            'E muets',
            sel('melEMode', S.eMode, [opt('classique', 'Classique'), opt('chanson', 'Chanson (non chantés)')], (v) => (S.eMode = v)),
          ),
          h(
            'label',
            { class: 'mel-check' },
            h('input', {
              type: 'checkbox',
              id: 'melFinalE',
              checked: S.sungFinalE,
              onchange: (e) => (S.sungFinalE = e.target.checked),
            }),
            ' Chanter le e final',
          ),
        ),
      ),
    );
  }

  function renderGridChips() {
    const el = $('#melGridChips');
    if (!el) return;
    if (!S.grid.trim()) return el.replaceChildren(h('small', { class: 'dlg-hint' }, 'Aucun accord.'));
    const p = project();
    let res;
    try {
      res = M().parseGrid(S.grid, { spb: SS.stepsPerBar(p), key: keyChoice() });
    } catch (e) {
      res = { spans: [], errors: [e.message], bars: 0 };
    }
    el.replaceChildren(
      ...res.spans.map((sp) =>
        h(
          'span',
          {
            class: 'mel-chip',
            title: `mesure ${sp.bar + 1} : ${sp.chord.tones
              .map((pc) =>
                M()
                  .noteLabel(60 + pc)
                  .replace(/-?\d+$/, ''),
              )
              .join('-')}`,
          },
          sp.chord.sym,
        ),
      ),
      res.bars ? h('small', { class: 'dlg-hint' }, `→ mélodie sur ${res.bars} mesure${res.bars > 1 ? 's' : ''}`) : null,
      ...res.errors.map((e) => h('div', { class: 'mel-err' }, '⚠ ' + e)),
    );
  }

  function fromScene() {
    const g = gridFromScene();
    if (!g) {
      SS.ui.toast('Aucun accord dans la scène en cours (grille Harmo One ou piste d’accords).', 3500);
      return;
    }
    S.grid = g;
    const ta = $('#melGrid');
    if (ta) ta.value = g;
    renderGridChips();
  }

  /* ---------- Proposition ---------- */
  function compose(newSeed) {
    if (newSeed) S.seed += 1;
    const p = project();
    S.source = S.text.trim() ? 'text' : 'meter';
    S.res = M().compose({
      grid: S.grid,
      source: S.source,
      text: S.text,
      meter: S.meter,
      fitGrid: true,
      key: keyChoice(),
      range: S.range,
      style: S.style,
      ending: S.ending,
      eMode: S.eMode,
      sungFinalE: S.sungFinalE,
      timeSig: p.timeSig,
      seed: S.seed,
    });
    renderOut();
    updateButtons();
    const out = $('#melOut');
    if (out) {
      out.scrollTo({ top: 0 });
      // petit écran : le résultat est sous le formulaire
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) out.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  /* ---------- Grille de la mélodie : accords en haut, notes en bas ---------- */
  // fonction des accords (mêmes couleurs que la fenêtre Key) et type des notes
  const CHORD_FN = {
    repos: { label: 'Repos', color: '#3fcf8e' },
    prep: { label: 'Préparation', color: '#f5c400' },
    tension: { label: 'Tension', color: '#ff6b6b' },
    color: { label: 'Couleur du mode', color: '#b07cff' },
    emprunt: { label: 'Emprunt', color: '#9aa0a6' },
  };
  const NOTE_KIND = {
    chord: { label: 'Note de l’accord', color: '#2b8cff' },
    color: { label: 'Couleur (7e, 9e…)', color: '#a874ff' },
    passing: { label: 'Passage / broderie', color: '#1fb5a6' },
    appog: { label: 'Appoggiature / anticipation', color: '#f08c2e' },
    scale: { label: 'Note de la gamme', color: '#8b93a1' },
    tension: { label: 'Tension (hors accord)', color: '#ff5c5c' },
  };

  /** Aperçu lisible : une bande d'accords colorée par fonction, puis les notes nommées, colorées par type. */
  function roll(res) {
    const NS = 'http://www.w3.org/2000/svg';
    const notes = res.notes;
    const lo = Math.min(...notes.map((x) => x.midi));
    const hi = Math.max(...notes.map((x) => x.midi));
    const px = Math.max(14, 880 / res.total); // largeur d'une double-croche (une croche contient son nom)
    const W = res.total * px;
    const CH = 44; // bande des accords
    const GAP = 10;
    const ROW = 9; // un demi-ton
    const NH = 20; // hauteur d'une note
    const top = CH + GAP + 16;
    const H2 = Math.max(top + (hi - lo) * ROW + NH + 18, CH + 150); // place pour les noms au-dessus des notes courtes
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H2}`);
    svg.setAttribute('class', 'mel-roll');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Grille de la mélodie : accords en haut, notes en bas');
    svg.style.width = W > 880 ? `${W}px` : '100%';
    const add = (tag, a, text) => {
      const e = document.createElementNS(NS, tag);
      Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v));
      if (text != null) e.textContent = text;
      svg.append(e);
      return e;
    };
    const tip = (el, text) => {
      const t = document.createElementNS(NS, 'title');
      t.textContent = text;
      el.append(t);
    };
    // temps et mesures (zone des notes)
    const beat = res.timeSig[1] === 8 && res.timeSig[0] % 3 === 0 && res.timeSig[0] > 3 ? 6 : 16 / res.timeSig[1];
    for (let s = 0; s <= res.total; s += beat) add('line', { x1: s * px, x2: s * px, y1: CH + GAP, y2: H2, class: s % res.spb === 0 ? 'mr-bar' : 'mr-beat' });
    for (let b = 0; b < res.bars; b++) add('text', { x: b * res.spb * px + 4, y: H2 - 4, class: 'mr-num' }, String(b + 1));
    // accords (la grille, répétée si besoin)
    res.spans.forEach((sp) => {
      const fn = sp.chord.fn || { id: 'repos', label: '' };
      const c = (CHORD_FN[fn.id] || CHORD_FN.repos).color;
      const x = sp.step * px + 1;
      const w = Math.max(4, sp.len * px - 2);
      const g = add('rect', { x, y: 1, width: w, height: CH - 2, rx: 6, fill: c, 'fill-opacity': 0.22, stroke: c, 'stroke-width': 1.5 });
      tip(g, `${sp.chord.sym}${fn.numeral ? ' (' + fn.numeral + ')' : ''} — ${fn.label}${fn.text ? ' : ' + fn.text : ''}`);
      add('text', { x: x + 7, y: 19, class: 'mr-chord' }, sp.chord.sym);
      if (w > 54) add('text', { x: x + 7, y: 35, class: 'mr-fn', fill: c }, (fn.numeral ? fn.numeral + ' · ' : '') + fn.label);
    });
    // notes, nommées
    notes.forEach((x) => {
      const k = NOTE_KIND[x.kind] || NOTE_KIND.scale;
      const y = top + (hi - x.midi) * ROW;
      const w = Math.max(6, x.len * px - 2);
      const name = M().noteLabel(x.midi, res.key);
      const r = add('rect', { x: x.step * px + 1, y, width: w, height: NH, rx: 4, fill: k.color, class: 'mr-note' + (x.syl.accent === 2 ? ' acc' : '') });
      tip(r, `${name} — ${x.role}${res.lines[x.line].abstract ? '' : ' · « ' + x.syl.text + ' »'}`);
      const fits = w >= name.length * 5.8 + 2;
      add('text', { x: x.step * px + 1 + (fits ? w / 2 : 0), y: fits ? y + 14 : y - 4, class: fits ? 'mr-name' : 'mr-name out', 'text-anchor': fits ? 'middle' : 'start' }, name);
    });
    return h('div', { class: 'mel-roll-wrap' }, svg);
  }

  /** Légende : seulement les fonctions d'accord et les types de note présents. */
  function legend(res) {
    const fns = [...new Set(res.spans.map((sp) => (sp.chord.fn || {}).id).filter(Boolean))];
    const kinds = [...new Set(res.notes.map((x) => x.kind))];
    const chip = (d, cls) => h('span', { class: 'mel-key ' + cls, style: `--c:${d.color}` }, d.label);
    return h(
      'div',
      { class: 'mel-legend' },
      h('div', {}, h('b', {}, 'Accords'), ...Object.keys(CHORD_FN).filter((id) => fns.includes(id)).map((id) => chip(CHORD_FN[id], 'fn'))),
      h('div', {}, h('b', {}, 'Notes'), ...Object.keys(NOTE_KIND).filter((id) => kinds.includes(id)).map((id) => chip(NOTE_KIND[id], 'nk')))
    );
  }

  function renderOut() {
    const out = $('#melOut');
    if (!out) return;
    const res = S.res;
    if (!res) {
      out.replaceChildren(
        h(
          'div',
          { class: 'mel-empty' },
          h('b', {}, 'Une mélodie sur ta grille'),
          h('p', {}, 'Écris les accords (ou reprends ceux de la scène), puis « Proposer ». La mélodie dure autant que la grille : 4 accords, 4 mesures.'),
        ),
      );
      return;
    }
    if (!res.ok) {
      out.replaceChildren(h('div', { class: 'mel-errors' }, h('b', {}, 'Impossible de proposer une mélodie'), h('ul', {}, ...res.errors.map((e) => h('li', {}, e)))));
      return;
    }
    const target = S.track !== 'new' && project().tracks.find((t) => t.id === S.track);
    const sceneBars = project().bars;
    const scansion = res.lines[0].abstract
      ? null
      : h(
          'div',
          { class: 'mel-scan' },
          ...res.lines.map((l, i) =>
            h(
              'div',
              { class: 'mel-line' },
              h('span', { class: 'ml-n' }, `${i + 1}`),
              h(
                'span',
                { class: 'ml-syl' },
                ...l.syllables.map((s) =>
                  h(
                    'span',
                    {
                      class: 'sy' + (s.accent === 2 ? ' a2' : s.accent === 1 ? ' a1' : '') + (s.caduc ? ' cad' : ''),
                    },
                    s.text,
                  ),
                ),
              ),
              h('span', { class: 'ml-count' }, `${l.count} syll.`),
            ),
          ),
        );
    const table = h(
      'table',
      { class: 'mel-table' },
      h('thead', {}, h('tr', {}, ...['Mes.', 'Position', 'Accord(s)', 'Syllabe', 'Note', 'MIDI', 'Durée (noires)', 'Valeur', 'Vél.', 'Rôle'].map((x) => h('th', {}, x)))),
      h(
        'tbody',
        {},
        ...res.rows.map((r, i) =>
          h(
            'tr',
            {
              class: (r.midi == null ? 'rest' : '') + (i && res.rows[i - 1].bar !== r.bar ? ' newbar' : ''),
            },
            h('td', {}, r.bar),
            h('td', {}, r.pos),
            h('td', {}, r.chords),
            h('td', { class: r.accent === 2 ? 'a2' : '' }, r.syl),
            h('td', {}, r.note),
            h('td', {}, r.midi ?? ''),
            h('td', {}, r.dur),
            h('td', {}, r.value),
            h('td', {}, r.vel ?? ''),
            h('td', { class: 'role' }, r.role),
          ),
        ),
      ),
    );
    // vue simple : seulement ce qui demande une action (la fin et la scansion restent dans « Détails »)
    const bad = res.checks.filter((c) => (!c.ok || c.warn) && !/aucune écoute|^Fin|^Scansion/.test(c.text));
    const warnTrack =
      target && app.hasNotes(target) ? h('p', { class: 'bcf-warn' }, `⚠ « ${target.name} » contient déjà des notes dans cette scène : elles seront remplacées (Ctrl+Z pour revenir).`) : null;
    const longer = res.bars > sceneBars ? h('p', { class: 'dlg-hint' }, `La scène (${sceneBars} mesures) sera allongée à ${nextBars(res.bars)} mesures.`) : null;
    const notesLine = res.lines.map((l) => l.count).join(' + ');
    out.replaceChildren(
      ...[
        h(
          'div',
          { class: 'mel-sec' },
          h('h3', {}, `Proposition ${S.seed}`),
          h(
            'p',
            { class: 'mel-lead' },
            `${res.notes.length} notes sur ${res.bars} mesure${res.bars > 1 ? 's' : ''} (${res.lines.length > 1 ? `${res.lines.length} phrases : ${notesLine}` : '1 phrase'}), en ${H().label(res.key)}${res.keyAuto ? ' (déduite des accords)' : ''}.`,
          ),
          roll(res),
        legend(res),
          h('p', {}, res.summary.peak),
          h('p', {}, res.summary.ending),
          ...bad.map((c) => h('p', { class: 'bcf-warn' }, '⚠ ' + c.text)),
          warnTrack,
          longer,
        ),
        scansion ? h('div', { class: 'mel-sec' }, h('h3', {}, 'Paroles'), scansion) : null,
        h(
          'details',
          { class: 'mel-details' },
          h('summary', {}, 'Détails : notes, contrôles, MIDI'),
          h('ul', { class: 'mel-hyp' }, ...res.hypotheses.map((x) => h('li', {}, x))),
          h('p', {}, res.summary.motif),
          h('ul', { class: 'mel-checks' }, ...res.checks.map((c) => h('li', { class: !c.ok ? 'bad' : c.warn ? 'warn' : 'ok' }, h('span', { class: 'ck' }, !c.ok ? '✗' : c.warn ? '!' : '✓'), c.text))),
          h('div', { class: 'mel-table-wrap' }, table),
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              id: 'melMidi',
              onclick: exportMidi,
              title: 'Mélodie, tempo, mesure et paroles',
            },
            'Exporter MIDI',
          ),
        ),
      ].filter(Boolean),
    );
  }

  const BARS_OPTIONS = [1, 2, 4, 8, 16, 32, 64];
  const nextBars = (n) => BARS_OPTIONS.find((b) => b >= n) || 64;

  function updateButtons() {
    const ok = !!(S.res && S.res.ok);
    ['#melAgain', '#melWrite'].forEach((q) => {
      const b = $(q);
      if (b) b.disabled = !ok;
    });
  }

  /* ---------- Actions ---------- */
  function exportMidi() {
    if (!S.res || !S.res.ok) return;
    const bytes = M().toMidi(S.res, project().tempo);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const a = h('a', {
      href: url,
      download: `${(project().title || 'melodie').replace(/[\\/:*?"<>|]+/g, '_')} - melodie.mid`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    SS.ui.toast('Fichier MIDI exporté : une piste de mélodie, tempo, mesure et paroles (ni voix chantée ni audio).', 4500);
  }

  function write() {
    const res = S.res;
    if (!res || !res.ok) return;
    if (res.bars > 64) {
      SS.ui.toast('La mélodie dépasse 64 mesures : réduis le nombre de vers ou de mesures par vers.', 4500);
      return;
    }
    const lead = S.track === 'new' ? ctx.leadOpts() : null;
    ctx.close();
    app.writeMelody({
      trackId: S.track === 'new' ? null : S.track,
      newTrack: lead,
      events: M().toEvents(res),
      bars: nextBars(res.bars),
      melodyBars: res.bars,
      label: `${res.lines.length} vers, ${res.notes.length} notes`,
    });
    S.track = '';
  }

  /* ---------- Rendu ---------- */
  function render() {
    if (!box) return;
    box.replaceChildren(h('div', { class: 'mel-body' }, renderForm(), h('section', { class: 'mel-out', id: 'melOut', 'aria-live': 'polite' })));
    renderGridChips();
    renderOut();
    updateButtons();
  }

  function show() {
    // première ouverture : accords de la scène si elle en a
    if (!S.grid) S.grid = gridFromScene() || '';
    render();
  }

  function init(appApi, context) {
    app = appApi;
    ctx = context;
    box = $('#bandMelody');
    $('#melGo').addEventListener('click', () => compose(false));
    $('#melAgain').addEventListener('click', () => compose(true));
    $('#melWrite').addEventListener('click', write);
  }

  return { init, show, render, gridFromScene, _state: S };
})();
