/*
 * Band → onglet « Mélodie » : proposer une mélodie sur une piste à partir d'une grille d'accords et de paroles
 * (ou d'une structure métrique). Le calcul est dans js/melody.js (méthode du skill
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
    source: 'text',
    text: '',
    meter: '8 8 8 8',
    barsPerLine: 2,
    key: 'scene',
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
      spans = sc.grid.chords.map((c) => ({ step: c.step, len: c.len, name: H().gridChord(key, c.degree, c.type, c.acc || 0).name }));
    if (!spans.length) {
      const evs = [];
      p.tracks.forEach((t) => t.type === 'instrument' && (t.events || []).forEach((e) => new Set(e.notes.map((n) => n % 12)).size >= 3 && evs.push(e)));
      evs.sort((a, b) => a.step - b.step);
      evs.forEach((e) => {
        const id = H().identify(e.notes);
        if (!id) return;
        const name = H().chordName(key || { tonic: 'C', mode: 'major' }, id).replace(/°$/, 'dim');
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
      list.push(
        h(
          'optgroup',
          { label: (H().MODES.find((m) => m.id === mode) || {}).label },
          ...H().TONICS.map((t) => opt(`${t}|${mode}`, H().label({ tonic: t, mode }), S.key === `${t}|${mode}`))
        )
      )
    );
    return list;
  }

  function field(label, control, hint) {
    return h('label', { class: 'mel-field' }, h('span', { class: 'dlg-label' }, label), control, hint ? h('small', { class: 'dlg-hint' }, hint) : null);
  }

  function renderForm() {
    if (S.key === 'scene' && !sceneKey()) S.key = 'auto';
    if (!S.track || (S.track !== 'new' && !monoTracks().some((t) => t.id === S.track))) S.track = defaultTrack();
    const p = project();
    const sel = (id, value, options, onchange) => {
      const e = h('select', { id, onchange: (ev) => onchange(ev.target.value) }, ...options);
      e.value = value;
      return e;
    };
    const textArea = h('textarea', {
      id: 'melText',
      rows: 7,
      spellcheck: 'false',
      placeholder: 'Un vers par ligne, par exemple :\nJe pense à toi quand vient la nuit\nLes rues s’allument une à une',
      oninput: (e) => (S.text = e.target.value),
    });
    textArea.value = S.text;
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
    const meter = h('input', { id: 'melMeter', type: 'text', value: S.meter, placeholder: '8 8 8 8  ou  3+5 3+5', oninput: (e) => (S.meter = e.target.value) });
    const form = h(
      'div',
      { class: 'mel-form' },
      h('div', { class: 'band-step' }, h('b', {}, '1'), 'Grille d’accords'),
      gridArea,
      h(
        'div',
        { class: 'mel-row' },
        h('button', { type: 'button', class: 'btn', id: 'melFromScene', onclick: fromScene, title: 'Lire les accords de la scène en cours (grille Harmo One ou pistes d’accords)' }, 'Reprendre les accords de la scène'),
        h('small', { class: 'dlg-hint' }, '« | » sépare les mesures ; « Am F » partage la mesure ; « . » prolonge ; « % » répète la mesure. Chiffres romains (vi IV I V) avec une tonalité choisie.')
      ),
      h('div', { class: 'mel-chips', id: 'melGridChips', 'aria-live': 'polite' }),
      h('div', { class: 'band-step' }, h('b', {}, '2'), 'Paroles ou structure'),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Source' },
        h('button', { type: 'button', class: S.source === 'text' ? 'active' : '', 'data-v': 'text', onclick: () => setSource('text') }, 'Paroles'),
        h('button', { type: 'button', class: S.source === 'meter' ? 'active' : '', 'data-v': 'meter', onclick: () => setSource('meter') }, 'Structure métrique')
      ),
      S.source === 'text'
        ? h(
            'div',
            { class: 'mel-src' },
            textArea,
            h('small', { class: 'dlg-hint' }, 'Un vers par ligne. « / » force une coupure de syllabe (vi/olon), des parenthèses rendent des lettres muettes (aim(ent)), « [3+5] » en fin de ligne impose les syllabes par mesure.'),
            h(
              'div',
              { class: 'mel-grid2' },
              field('E muets', sel('melEMode', S.eMode, [opt('classique', 'Classique : comptés devant consonne'), opt('chanson', 'Chanson : non chantés en fin de mot')], (v) => (S.eMode = v))),
              h('label', { class: 'mel-check' }, h('input', { type: 'checkbox', id: 'melFinalE', checked: S.sungFinalE, onchange: (e) => (S.sungFinalE = e.target.checked) }), ' Chanter le e muet en fin de vers')
            )
          )
        : h('div', { class: 'mel-src' }, meter, h('small', { class: 'dlg-hint' }, 'Syllabes par vers : « 8 8 8 8 », « 12x2 ». « 3+5 » donne les syllabes par mesure quand il y a autant de parties que de mesures par vers, sinon des groupes (6+6 = césure).')),
      h('div', { class: 'band-step' }, h('b', {}, '3'), 'Cadre'),
      h(
        'div',
        { class: 'mel-grid2' },
        field('Mesures par vers', sel('melBpl', String(S.barsPerLine), [1, 2, 3, 4].map((n) => opt(String(n), String(n))), (v) => (S.barsPerLine = +v)), `Mesure ${p.timeSig[0]}/${p.timeSig[1]}, ${p.tempo} BPM (ceux du projet)`),
        field('Tonalité', sel('melKey', S.key, keyOptions(), (v) => (S.key = v))),
        field('Tessiture', sel('melRange', S.range, Object.entries(M().RANGES).map(([id, r]) => opt(id, r.label)), (v) => (S.range = v))),
        field('Rythme', sel('melStyle', S.style, [opt('simple', 'Simple : croches, noires, blanches'), opt('varie', 'Varié : valeurs pointées, syncopes'), opt('dense', 'Dense : doubles-croches')], (v) => (S.style = v))),
        field('Fin de la mélodie', sel('melEnding', S.ending, [opt('closed', 'Fermée : sur la tonique'), opt('open', 'Ouverte : suspendue')], (v) => (S.ending = v)))
      ),
      h('div', { class: 'band-step' }, h('b', {}, '4'), 'Piste'),
      field(
        'Écrire la mélodie sur',
        sel(
          'melTrack',
          S.track,
          [...monoTracks().map((t) => opt(t.id, `${t.name}${t.melody ? ' (mélodie)' : ''}`)), opt('new', '+ Nouvelle piste « Mélodie » (instrument lead du groupe)')],
          (v) => {
            S.track = v;
            renderOut();
          }
        ),
        'Pistes Mono seulement (une note à la fois). La mélodie remplace les notes de la piste dans la scène en cours.'
      )
    );
    return form;
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
      ...res.spans.map((sp) => h('span', { class: 'mel-chip', title: `mesure ${sp.bar + 1} : ${sp.chord.tones.map((pc) => M().noteLabel(60 + pc).replace(/-?\d+$/, '')).join('-')}` }, sp.chord.sym)),
      res.bars ? h('small', { class: 'dlg-hint' }, `${res.bars} mesure${res.bars > 1 ? 's' : ''}`) : null,
      ...res.errors.map((e) => h('div', { class: 'mel-err' }, '⚠ ' + e))
    );
  }

  function setSource(v) {
    S.source = v;
    render();
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
    S.res = M().compose({
      grid: S.grid,
      source: S.source,
      text: S.text,
      meter: S.meter,
      barsPerLine: S.barsPerLine,
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

  /** Petit piano-roll de la proposition (lecture seule). */
  function roll(res) {
    const notes = res.notes;
    const lo = Math.min(...notes.map((x) => x.midi)) - 2;
    const hi = Math.max(...notes.map((x) => x.midi)) + 2;
    const W = 720;
    const Hh = 120;
    const sx = W / res.total;
    const sy = Hh / (hi - lo + 1);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    svg.setAttribute('class', 'mel-roll');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Aperçu de la mélodie');
    const add = (tag, a) => {
      const e = document.createElementNS(NS, tag);
      Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v));
      svg.append(e);
      return e;
    };
    for (let b = 0; b <= res.bars; b++) add('line', { x1: b * res.spb * sx, x2: b * res.spb * sx, y1: 0, y2: Hh, class: 'mr-bar' });
    res.spans.forEach((sp) => {
      const t = add('text', { x: sp.step * sx + 3, y: 11, class: 'mr-chord' });
      t.textContent = sp.chord.sym;
    });
    notes.forEach((x) => {
      const r = add('rect', { x: x.step * sx + 0.5, y: (hi - x.midi) * sy, width: Math.max(2, x.len * sx - 1), height: Math.max(3, sy - 1), rx: 2, class: 'mr-note' + (x.syl.accent === 2 ? ' acc' : '') });
      const tt = document.createElementNS(NS, 'title');
      tt.textContent = `${x.syl.text} · ${M().noteLabel(x.midi, res.key)}`;
      r.append(tt);
    });
    return svg;
  }

  function renderOut() {
    const out = $('#melOut');
    if (!out) return;
    const res = S.res;
    if (!res) {
      out.replaceChildren(
        h('div', { class: 'mel-empty' }, h('b', {}, 'Une mélodie qui sert le texte'), h('p', {}, 'Écris une grille d’accords et des paroles (ou une structure métrique), puis « Proposer ». La proposition montre la scansion, le tableau des notes et les contrôles avant d’écrire quoi que ce soit sur la piste.'), h('p', { class: 'dlg-hint' }, 'Méthode du skill « composer-melodies-accords-texte » : rythme d’abord (accents sur les temps forts, respirations), puis notes de l’accord sur les appuis et notes de passage entre elles, un motif repris et varié.'))
      );
      return;
    }
    if (!res.ok) {
      out.replaceChildren(h('div', { class: 'mel-errors' }, h('b', {}, 'Impossible de proposer une mélodie'), h('ul', {}, ...res.errors.map((e) => h('li', {}, e)))));
      return;
    }
    const target = S.track !== 'new' && project().tracks.find((t) => t.id === S.track);
    const sceneBars = project().bars;
    const scansion = h(
      'div',
      { class: 'mel-scan' },
      ...res.lines.map((l, i) =>
        h(
          'div',
          { class: 'mel-line' },
          h('span', { class: 'ml-n' }, `${i + 1}`),
          h('span', { class: 'ml-syl' }, ...l.syllables.map((s) => h('span', { class: 'sy' + (s.accent === 2 ? ' a2' : s.accent === 1 ? ' a1' : '') + (s.caduc ? ' cad' : ''), title: s.accent === 2 ? 'accent de groupe' : s.accent === 1 ? 'accent de mot' : '' }, s.text))),
          h('span', { class: 'ml-count' }, `${l.count} syll.`)
        )
      )
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
            { class: (r.midi == null ? 'rest' : '') + (i && res.rows[i - 1].bar !== r.bar ? ' newbar' : '') },
            h('td', {}, r.bar),
            h('td', {}, r.pos),
            h('td', {}, r.chords),
            h('td', { class: r.accent === 2 ? 'a2' : '' }, r.syl),
            h('td', {}, r.note),
            h('td', {}, r.midi ?? ''),
            h('td', {}, r.dur),
            h('td', {}, r.value),
            h('td', {}, r.vel ?? ''),
            h('td', { class: 'role' }, r.role)
          )
        )
      )
    );
    const warnTrack =
      target && app.hasNotes(target)
        ? h('p', { class: 'bcf-warn' }, `⚠ « ${target.name} » contient déjà des notes dans cette scène : elles seront remplacées (Ctrl+Z pour revenir).`)
        : null;
    const longer = res.bars > sceneBars ? h('p', { class: 'dlg-hint' }, `La mélodie dure ${res.bars} mesures : la scène (${sceneBars}) sera allongée à ${nextBars(res.bars)} mesures, les autres pistes recopiées en boucle.`) : null;
    out.replaceChildren(
      h('div', { class: 'mel-sec' }, h('h3', {}, 'Hypothèses'), h('ul', { class: 'mel-hyp' }, ...res.hypotheses.map((x) => h('li', {}, x)))),
      h('div', { class: 'mel-sec' }, h('h3', {}, 'Scansion ', h('small', { class: 'dlg-hint' }, 'gras : accent de groupe · souligné : accent de mot · (e) : muet ou élidé')), scansion),
      h('div', { class: 'mel-sec' }, h('h3', {}, `Proposition ${S.seed}`), roll(res), h('p', {}, res.summary.motif), h('p', {}, res.summary.peak), h('p', {}, res.summary.ending), warnTrack, longer),
      h('div', { class: 'mel-sec' }, h('h3', {}, 'Contrôles'), h('ul', { class: 'mel-checks' }, ...res.checks.map((c) => h('li', { class: !c.ok ? 'bad' : c.warn ? 'warn' : 'ok' }, h('span', { class: 'ck' }, !c.ok ? '✗' : c.warn ? '!' : '✓'), c.text)))),
      h('div', { class: 'mel-sec' }, h('h3', {}, 'Notes ', h('small', { class: 'dlg-hint' }, 'position 1 = début de mesure, en noires')), h('div', { class: 'mel-table-wrap' }, table))
    );
  }

  const BARS_OPTIONS = [1, 2, 4, 8, 16, 32, 64];
  const nextBars = (n) => BARS_OPTIONS.find((b) => b >= n) || 64;

  function updateButtons() {
    const ok = !!(S.res && S.res.ok);
    ['#melAgain', '#melMidi', '#melWrite'].forEach((q) => {
      const b = $(q);
      if (b) b.disabled = !ok;
    });
  }

  /* ---------- Actions ---------- */
  function exportMidi() {
    if (!S.res || !S.res.ok) return;
    const bytes = M().toMidi(S.res, project().tempo);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const a = h('a', { href: url, download: `${(project().title || 'melodie').replace(/[\\/:*?"<>|]+/g, '_')} - melodie.mid` });
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
    app.writeMelody({ trackId: S.track === 'new' ? null : S.track, newTrack: lead, events: M().toEvents(res), bars: nextBars(res.bars), melodyBars: res.bars, label: `${res.lines.length} vers, ${res.notes.length} notes` });
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
    if (S.key === 'scene' && !sceneKey()) S.key = 'auto';
    render();
  }

  function init(appApi, context) {
    app = appApi;
    ctx = context;
    box = $('#bandMelody');
    $('#melGo').addEventListener('click', () => compose(false));
    $('#melAgain').addEventListener('click', () => compose(true));
    $('#melMidi').addEventListener('click', exportMidi);
    $('#melWrite').addEventListener('click', write);
  }

  return { init, show, render, gridFromScene, _state: S };
})();
