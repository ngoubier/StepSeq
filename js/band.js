/*
 * Band : assistant de création d'une chanson avec un groupe de musiciens virtuels.
 * Ouvert par le bouton « Nouvelle » de l'en-tête (open, sur le projet en cours) ou par « Nouvelle chanson… » du menu (openWizard,
 * sur une chanson vide). Cinq étapes :
 *  1. Modèle : deux portes, Créer ou Reprendre (une reprise tapée : titre, tempo, tonalité, parties et accords,
 *     ordre des parties — voir coverModel) ; style musical, inspiration (type de chanson) et musiciens — un clic sur un musicien ouvre
 *     son panneau (rôle, instrument phare, 5 conseillés, toute la bibliothèque via « Nouvelle piste ») ;
 *     le batteur choisit un kit et ses éléments (une piste par élément) ;
 *  2. Chanson : vue session (scènes × pistes), ordre des scènes, écoute ;
 *  3. Accords : la grille de chaque scène (comme dans Harmonie) et la fenêtre « Trouver l'inspiration » ;
 *  4. Mélodie : caractère et notes par phrase de chaque scène, phrases, ce que joue chaque instrument
 *     (Muet / Solo / volume par instrument) ;
 *  5. Intégration : les pistes à importer.
 * Des étapes 2 à 5, un bandeau de commande : lecture / pause, stop, position, tempo (réglable), tonalité ;
 * aux étapes 3 et 4, il est à droite de la colonne des scènes et joue la scène choisie en boucle.
 * Seul « Créer la chanson » modifie le projet (après confirmation s'il a déjà des pistes) ; fermer ne change rien.
 *
 * Catalogue : js/band-presets.js (SS.Band).
 */
window.SS = window.SS || {};
SS.band = (() => {
  const B = () => SS.Band;
  let app = null;
  let el = null;
  // mel : réglages de la mélodie (étape Mélodie), gardés d'une ouverture à l'autre — voir melodyOpts()
  // hide : étape Mélodie, colonnes masquées (menu « Pistes ») ; la mélodie reste toujours affichée
  const S = {
    styleId: null, presetId: null, sel: null, cache: {}, wiz: null, hide: new Set(), mode: 'create', cover: null,
    mel: { character: 'inspiration', form: 'auto', rhythm: 'auto', complexity: 'balanced', range: 'auto', ending: 'auto', notes: 0, fine: false, profile: 'on' },
  };

  /* ---------- Petits outils DOM ---------- */
  const $ = (q, root = document) => root.querySelector(q);
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }

  /* Icônes des rôles (traits simples, 24×24) */
  const ICON = {
    drums: '<ellipse cx="12" cy="13" rx="7" ry="2.5"/><path d="M5 13v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5"/><path d="M3 6.5h6M6 6.5v4"/><path d="M15 3l4 5M19 3l-4 5"/>',
    perc: '<path d="M7 5h4l1 15H6z"/><path d="M14 8h4l1 12h-6z"/><path d="M6.5 9h5M13.6 12h5"/>',
    bass: '<path d="M20 3l-8.5 8.5"/><path d="M11 10.5c-2-1-4.5-.3-5.5 1.6-.6 1.2-2.8 1.3-2.8 3.5 0 2.6 3 5.4 5.6 5.4 2.2 0 2.3-2.2 3.5-2.8 1.9-1 2.6-3.5 1.6-5.5z"/><path d="M8 14l2 2"/><path d="M18.5 2l3 3"/>',
    guitar: '<path d="M20 3l-7.5 7.5"/><path d="M12 9.5c-2.2-1.2-5-.4-6 1.8-.5 1-2.6 1.4-2.6 3.6 0 2.8 2.9 5.7 5.7 5.7 2.2 0 2.6-2.1 3.6-2.6 2.2-1 3-3.8 1.8-6z"/><circle cx="8.6" cy="15.4" r="1.3"/><path d="M18 2.5l3.5 3.5"/>',
    keys: '<rect x="2" y="7" width="20" height="11" rx="1.5"/><path d="M6 7v7M10 7v7M14 7v7M18 7v7"/>',
    pad: '<rect x="2" y="11" width="20" height="9" rx="1.5"/><path d="M6 11v5M10 11v5M14 11v5M18 11v5"/><path d="M3 6c3-3 6 3 9 0s6 3 9 0"/>',
    arp: '<rect x="2" y="12" width="20" height="8" rx="1.5"/><path d="M6 12v4M10 12v4M14 12v4M18 12v4"/><path d="M4 9h3V7h3V5h3V3"/>',
    lead: '<rect x="2" y="12" width="20" height="8" rx="1.5"/><path d="M6 12v4M10 12v4M14 12v4M18 12v4"/><path d="M15 9V3l4 1.5"/><circle cx="13.5" cy="9" r="1.5"/>',
    strings: '<path d="M12 2v6"/><path d="M9 8h6c0 2-1.5 2.5-1.5 4s2.5 2 2.5 4.5S14 21 12 21s-4-1.5-4-4.5S10.5 13.5 10.5 12 9 10 9 8z"/><path d="M4 21L20 5"/>',
    sax: '<path d="M14 3h4M16 3v11a5 5 0 0 1-10 0v-1"/><path d="M4 13h4"/><circle cx="16" cy="7" r=".6"/><circle cx="16" cy="10" r=".6"/>',
    vox: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
    fx: '<path d="M3 19c3 0 4-2 5-5s2-8 4-8 3 5 4 8 2 5 5 5"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  };
  const icon = (role) => `<svg viewBox="0 0 24 24">${ICON[(B().ROLES[role] || {}).icon] || ICON.keys}</svg>`;
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" class="fill"/></svg>';
  const STOP = '<svg viewBox="0 0 24 24" class="stop"><rect x="6" y="6" width="12" height="12" rx="1.5" class="fill"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" class="fill"/><rect x="14" y="5" width="4" height="14" rx="1" class="fill"/></svg>';

  /* ---------- Modèle ---------- */
  const style = () => B().STYLES.find((s) => s.id === S.styleId);
  const preset = () => (style() || { presets: [] }).presets.find((p) => p.id === S.presetId);
  const roleOf = (mu) => B().ROLES[mu.role];
  const catOf = (mu) => mu.cat || roleOf(mu).cat || 'mono';
  const labelOf = (mu) => mu.label || roleOf(mu).label;
  const colorOf = (mu) => roleOf(mu).color;

  /** État des choix d'une inspiration (gardé si on revient dessus). */
  function musState() {
    const p = preset();
    if (!p) return {};
    if (!S.cache[p.id]) {
      const st = {};
      p.musicians.forEach((mu) => {
        if (mu.kits) {
          const extra = B().EXTRA_PIECES[mu.role].filter((x) => !mu.pieces.some((pc) => pc.split('@')[0] === x));
          st[mu.id] = {
            on: !mu.optional,
            kit: mu.kits[0],
            pieces: [...mu.pieces.map((pc) => ({ piece: pc, on: true })), ...extra.map((pc) => ({ piece: pc, on: false }))],
          };
        } else st[mu.id] = { on: !mu.optional, pick: 0, custom: null };
      });
      S.cache[p.id] = st;
    }
    return S.cache[p.id];
  }

  /* Mode General MIDI du projet (project.gm, même réglage que la fenêtre de piste) :
     chaque choix est remplacé par son équivalent GM, le batteur joue la batterie General MIDI. */
  const gm = () => !!(app && app.project().gm);
  const toGm = (opts) => (gm() ? SS.midi.gmEquivalent(opts) : opts);
  const kitOf = (ms) => (gm() ? 'gm' : ms.kit);
  /** Choix n° i d'un musicien (avant le choix libre). */
  const choiceAt = (mu, i) => toGm(B().choiceOpts(mu.pick[i], catOf(mu)));
  /** Ordre des conseillés : en mode GM, les sons déjà General MIDI (gm_*) d'abord, ils sont plus fidèles qu'une conversion. */
  const pickOrder = (mu) => {
    const idx = mu.pick.map((_, i) => i);
    return gm() ? [...idx.filter((i) => mu.pick[i].startsWith('gm_')), ...idx.filter((i) => !mu.pick[i].startsWith('gm_'))] : idx;
  };
  /** Choix retenu : celui de l'utilisateur, sinon le premier de la liste (en mode GM, le premier son GM). */
  const effPick = (mu, ms) => (ms.picked || !gm() ? ms.pick : pickOrder(mu)[0]);

  /** Options de piste de l'instrument retenu pour un musicien (hors batterie). */
  function instOpts(mu) {
    const st = musState()[mu.id];
    return st.custom ? toGm(st.custom) : choiceAt(mu, effPick(mu, st));
  }
  /** Clé de niveau (js/band-levels.js) d'un instrument : celle du son réellement joué en mode GM. */
  function instLevelKey(mu, ms) {
    if (ms.custom) return null;
    const tok = gm() ? instOpts(mu).instrument : mu.pick[effPick(mu, ms)];
    return `${mu.role}|${tok}|${catOf(mu)}`;
  }
  /** Élément de batterie résolu : { opts, label, borrowed, custom } */
  function pieceInfo(mu, pc) {
    const st = musState()[mu.id];
    if (pc.custom) {
      const o = toGm(pc.custom);
      const d = o.source === 'gm' && SS.findGmDrum(o.bank);
      return { opts: o, label: d ? d.label : B().drumLabel(o.sound), borrowed: false, custom: true };
    }
    const info = B().pieceOpts(kitOf(st), gm() ? pc.piece.split('@')[0] : pc.piece); // « cp@RolandTR909 » : en GM, le son GM du type
    if (info.opts.source === 'gm') info.label = (SS.findGmDrum(info.opts.bank) || {}).label || info.label;
    return info;
  }

  /** Marque d'une piste créée par Band (gardée dans le projet) : sert à la retrouver pour la remplacer. */
  const tag = (p, mu, sound) => ({ style: S.styleId, preset: p.id, musician: mu.id, key: mu.role + (sound ? ':' + sound : '') });

  /** Pistes à créer : [{ opts, name, color, band }] */
  function plannedTracks() {
    const p = preset();
    if (!p) return [];
    const st = musState();
    const out = [];
    p.musicians.forEach((mu) => {
      const ms = st[mu.id];
      if (!ms.on) return;
      const color = colorOf(mu);
      if (mu.kits) {
        ms.pieces.filter((pc) => pc.on).forEach((pc) => {
          const info = pieceInfo(mu, pc);
          const name = mu.role === 'perc' ? `Percu · ${info.label}` : info.label;
          // levelKey : clé de la mesure de niveau (js/band-levels.js) qui sert au mixage automatique (js/bandmix.js)
          out.push({ ...info.opts, name, color, band: tag(p, mu, info.opts.sound), levelKey: pc.custom ? null : `${kitOf(ms)}|${pc.piece}` });
        });
      } else {
        const o = instOpts(mu);
        out.push({ ...o, category: o.category || catOf(mu), name: roleOf(mu).short, color, band: tag(p, mu), levelKey: instLevelKey(mu, ms) });
      }
    });
    return out;
  }

  /* ---------- Écoute ---------- */
  function preview(opts) {
    try {
      SS.audio.ensureCtx();
      if (opts.type === 'drum') return SS.audio.preview({ ...opts, id: null });
      const synth = opts.type === 'synth';
      const family = synth ? 'analog' : opts.family;
      const oct = SS.findFamily(family).octave;
      const fake = synth
        ? { ...opts, type: 'instrument', id: null, family, instrument: opts.analog, junoPatch: opts.patch, octave: oct, chord: 'min' }
        : { ...opts, id: null, octave: oct, chord: 'min' };
      const root = (oct + 1) * 12;
      SS.audio.preview(fake, opts.category === 'mono' ? root : SS.chordNotes(root, 'min'));
    } catch (e) {
      console.warn(e);
    }
  }

  /* ---------- Rendu ---------- */
  function renderStyles() {
    const box = $('#bandStyles');
    box.replaceChildren(
      ...B().STYLES.map((s) =>
        h('button', { type: 'button', class: s.id === S.styleId ? 'active' : '', 'data-v': s.id, onclick: () => setStyle(s.id) }, s.label)
      )
    );
    $('#bandStyleDesc').textContent = (style() || {}).desc || '';
  }

  function renderPresets() {
    const st = style();
    $('#bandPresets').replaceChildren(
      ...st.presets.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: 'band-preset' + (p.id === S.presetId ? ' active' : ''),
            role: 'radio',
            'aria-checked': p.id === S.presetId ? 'true' : 'false',
            onclick: () => setPreset(p.id),
          },
          h('span', { class: 'bp-insp' }, 'Inspiration'),
          h('span', { class: 'bp-song' }, p.song),
          h('span', { class: 'bp-artist' }, `${p.artist} · ${p.year}`),
          h('span', { class: 'bp-meta' }, `${p.tempo} BPM · ${p.musicians.filter((m) => !m.optional).length} musiciens`)
        )
      )
    );
  }

  function renderSong() {
    const p = preset();
    $('#bandSong').replaceChildren(
      h('div', { class: 'bs-title' }, h('b', {}, `Inspiration « ${p.song} »`), ` — ${p.artist} (${p.year})`),
      h('div', { class: 'bs-desc' }, p.desc)
    );
  }

  /* ---------- Porte « Créer » ou « Reprendre » ---------- */
  function renderMode() {
    const cv = cover();
    document.querySelectorAll('#bandMode [data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)));
    el.classList.toggle('cover', cv);
    $('#bandPresetsLabel').textContent = cv ? 'Le groupe joue à la façon de…' : 'Type de chanson';
    const gs = $('.band-main > .band-step b');
    if (gs) gs.textContent = cv ? '4' : '3';
    $('#bandSong').hidden = cv;
    $('#bandCover').hidden = !cv;
    if (cv) renderCover();
  }
  function setMode(m) {
    if (S.mode === m) return;
    S.mode = m;
    if (m === 'cover' && !S.cover) S.cover = COVER_DEFAULT();
    coverChanged();
    dropListen();
    renderMode();
    refresh();
    renderWiz();
  }

  /** Formulaire de la reprise : titre, tempo, tonalité, une ligne par partie, ordre des parties. */
  function renderCover() {
    const c = S.cover;
    const edit = (fn, full = false) => (e) => {
      fn(e.target.value);
      coverChanged();
      if (full) renderCover();
      else coverInfo();
      if (S.wiz) wizFoot();
    };
    const keyOpts = [h('option', { value: 'auto', selected: c.key === 'auto' }, 'Auto (1er accord)')];
    [['major', MAJOR_TONICS, 'majeur'], ['minor', MINOR_TONICS, 'mineur']].forEach(([mode, list, label]) =>
      list.forEach((t) => {
        const v = `${t} ${mode}`;
        keyOpts.push(h('option', { value: v, selected: c.key === v }, `${SS.harmony.french ? SS.harmony.french(t) : t} ${label}`));
      })
    );
    const rows = c.parts.map((pt, i) =>
      h(
        'div',
        { class: 'bcv-row' },
        h('input', { type: 'text', class: 'bcv-name', value: pt.name, 'aria-label': `Nom de la partie ${i + 1}`, placeholder: 'Couplet', oninput: edit((v) => (pt.name = v)) }),
        h('input', {
          type: 'text', class: 'bcv-chords', value: pt.chords, spellcheck: 'false', autocomplete: 'off',
          'aria-label': `Accords de la partie ${i + 1}`, placeholder: 'Am | F | C | G', oninput: edit((v) => (pt.chords = v)),
        }),
        h('button', {
          type: 'button', class: 'btn btn-icon bcv-del', title: 'Enlever cette partie', 'aria-label': `Enlever la partie ${i + 1}`, disabled: c.parts.length < 2,
          onclick: edit(() => c.parts.splice(i, 1), true), html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        }),
        h('div', { class: 'bcv-info', 'data-part': i })
      )
    );
    const field = (label, input, cls = '') => h('label', { class: 'bcv-field ' + cls }, h('span', {}, label), input);
    $('#bandCover').replaceChildren(
      h('div', { class: 'band-step' }, h('b', {}, '3'), ' La reprise'),
      h(
        'div',
        { class: 'bcv-top' },
        field('Titre', h('input', { type: 'text', id: 'bcvTitle', value: c.title, placeholder: 'Titre de la reprise', oninput: edit((v) => (c.title = v)) }), 'grow'),
        field('Tempo', h('input', { type: 'number', id: 'bcvTempo', min: TEMPO_MIN, max: TEMPO_MAX, value: c.tempo, onchange: edit((v) => {
          c.tempo = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Number(v) || 110)));
          if (S.wiz) S.wiz.tempo = null;
        }, true) })),
        h('button', { type: 'button', class: 'btn bcv-tap', title: 'Tape en rythme (4 fois ou plus) pour trouver le tempo', onclick: tapTempo }, 'Tap'),
        field('Tonalité', h('select', { id: 'bcvKey', onchange: edit((v) => (c.key = v)) }, ...keyOpts))
      ),
      h(
        'div',
        { class: 'bcv-head' },
        h('b', {}, 'Parties et accords'),
        h('small', { class: 'dlg-hint' }, '« | » sépare les mesures · « Am F » partage une mesure · « . » prolonge · « % » répète la mesure · Do, Ré… et C/E acceptés')
      ),
      h('div', { class: 'bcv-rows' }, ...rows),
      h(
        'div',
        { class: 'bcv-actions' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: edit(() => c.parts.push({ name: '', chords: '' }), true) }, '+ Partie'),
        h('button', { type: 'button', class: 'btn btn-small', title: 'Revenir à l’exemple', onclick: edit(() => (S.cover = COVER_DEFAULT()), true) }, '↺ Exemple')
      ),
      field(
        'Ordre des parties',
        h('input', { type: 'text', id: 'bcvOrder', value: c.order, spellcheck: 'false', placeholder: 'Intro Couplet Refrain Couplet Refrain ×2 Outro (vide : chaque partie une fois)', oninput: edit((v) => (c.order = v)) }),
        'wide'
      ),
      h('p', { class: 'bcv-sum', id: 'bcvSum', 'aria-live': 'polite' })
    );
    coverInfo();
  }
  /** Sous chaque partie : ses accords lus (nom et degré) ou ses erreurs ; en bas, le résumé de la reprise. */
  function coverInfo() {
    const m = coverModel();
    const H = SS.harmony;
    m.parts.forEach((pt, i) => {
      const box = document.querySelector(`#bandCover [data-part="${i}"]`);
      if (!box) return;
      if (pt.errors.length) return box.replaceChildren(h('span', { class: 'bcv-err' }, '⚠ ' + pt.errors.join(' · ')));
      const chips = pt.spans.map((sp) => {
        let g = null;
        try {
          g = H.toGridChord(m.key, { rootPc: sp.chord.rootPc, type: coverType(sp.chord.ivs) });
          const bass = (((sp.chord.bassPc - sp.chord.rootPc) % 12) + 12) % 12;
          g = g && H.gridChord(m.key, g.degree, g.type, g.acc, bass);
        } catch (e) {
          g = null;
        }
        return h('span', { class: `bcv-chip role-${g ? g.role.id : 'color'}` }, sp.chord.sym, g ? h('small', {}, g.numeral) : null);
      });
      box.replaceChildren(
        ...chips,
        h('span', { class: 'bcv-meta' }, `${pt.bars} mesure${pt.bars > 1 ? 's' : ''} · jeu : ${(SS.bandSong.NAMES[pt.as] || pt.as || '').toLowerCase()} de « ${(preset() || {}).song} »${m.used.has(i) ? '' : ' · pas dans l’ordre'}`)
      );
    });
    const sum = $('#bcvSum');
    if (!sum) return;
    sum.classList.toggle('bad', !m.spec);
    if (!m.spec) return (sum.textContent = m.errors.length ? '⚠ ' + m.errors.join(' · ') : '⚠ Ajoute au moins une partie.');
    const t = tempo();
    const sec = Math.round((m.bars * 4 * 60) / t);
    const kn = H.french ? H.french(m.key.tonic) : m.key.tonic;
    sum.textContent = `${m.spec.form.split(' ').reduce((n, f) => n + (+f.split('*')[1] || 1), 0)} blocs · ${m.bars} mesures · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} à ${t} BPM · ${kn} ${m.key.mode === 'minor' ? 'mineur' : 'majeur'}${S.cover.key === 'auto' ? ' (déduite)' : ''} · Suivant pour entendre le groupe`;
  }
  /** Tap tempo : la moyenne des derniers intervalles (on recommence après 2 s sans tape). */
  let taps = [];
  function tapTempo() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-8);
    if (taps.length < 3) return;
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    S.cover.tempo = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, 60000 / avg)));
    if (S.wiz) S.wiz.tempo = null;
    const inp = $('#bcvTempo');
    if (inp) inp.value = S.cover.tempo;
    coverInfo();
  }

  function stageLine(mu) {
    const ms = musState()[mu.id];
    if (mu.kits) {
      const n = ms.pieces.filter((pc) => pc.on).length;
      return `${(B().KITS[kitOf(ms)] || {}).label} · ${n} piste${n > 1 ? 's' : ''}`;
    }
    return B().describe(instOpts(mu)).name;
  }

  function renderStage() {
    const p = preset();
    const st = musState();
    const rows = B().STAGE_ROWS.map(() => []);
    p.musicians.forEach((mu) => {
      let r = B().STAGE_ROWS.findIndex((row) => row.includes(mu.role));
      if (r < 0) r = rows.length - 1;
      rows[r].push(mu);
    });
    const order = (row, r) => row.slice().sort((a, b) => B().STAGE_ROWS[r].indexOf(a.role) - B().STAGE_ROWS[r].indexOf(b.role));
    $('#bandStage').replaceChildren(
      h('div', { class: 'stage-back', 'aria-hidden': 'true' }),
      ...rows.map((row, r) =>
        row.length
          ? h(
              'div',
              { class: 'stage-row stage-row-' + r },
              ...order(row, r).map((mu) => {
                const ms = st[mu.id];
                return h(
                  'button',
                  {
                    type: 'button',
                    class: 'band-mus' + (S.sel === mu.id ? ' sel' : '') + (ms.on ? '' : ' off'),
                    style: `--c:${colorOf(mu)}`,
                    'aria-pressed': S.sel === mu.id ? 'true' : 'false',
                    title: ms.on ? labelOf(mu) : `${labelOf(mu)} (optionnel, pas dans le groupe)`,
                    onclick: () => select(S.sel === mu.id ? null : mu.id),
                  },
                  h('span', { class: 'bm-avatar', html: icon(mu.role) }),
                  h('span', { class: 'bm-role' }, labelOf(mu)),
                  h('span', { class: 'bm-inst' }, ms.on ? stageLine(mu) : '+ optionnel'),
                  mu.kits && ms.on ? h('span', { class: 'bm-badge' }, String(ms.pieces.filter((pc) => pc.on).length)) : null
                );
              })
            )
          : null
      )
    );
  }

  function choiceCard(opts, { active, star, onPick, extraClass = '' }) {
    const d = B().describe(opts);
    return h(
      'div',
      { class: 'band-choice' + (active ? ' active' : '') + extraClass },
      h(
        'button',
        { type: 'button', class: 'bc-main', role: 'radio', 'aria-checked': active ? 'true' : 'false', onclick: onPick },
        h('span', { class: 'bc-kind' }, star ? '★ ' + d.kind : d.kind),
        h('span', { class: 'bc-name' }, d.name),
        h('span', { class: 'bc-detail' }, d.detail)
      ),
      h('button', { type: 'button', class: 'bc-play', title: 'Écouter', 'aria-label': 'Écouter ' + d.name, html: PLAY, onclick: () => preview(opts) })
    );
  }

  function panelHead(mu, ms) {
    return h(
      'div',
      { class: 'bpn-head', style: `--c:${colorOf(mu)}` },
      h('span', { class: 'bm-avatar', html: icon(mu.role) }),
      h('div', { class: 'bpn-title' }, h('b', {}, labelOf(mu)), h('small', {}, roleOf(mu).label + (mu.optional ? ' · optionnel' : ''))),
      h('button', { type: 'button', class: 'btn btn-icon', title: 'Fermer le panneau', 'aria-label': 'Fermer le panneau', html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', onclick: () => select(null) }),
      mu.note ? h('p', { class: 'bpn-note' }, mu.note) : null,
      h(
        'label',
        { class: 'bpn-on' },
        h('input', {
          type: 'checkbox',
          checked: ms.on,
          onchange: (e) => {
            ms.on = e.target.checked;
            refresh();
          },
        }),
        ' Dans le groupe'
      )
    );
  }

  function renderInstPanel(mu, ms) {
    const panel = $('#bandPanel');
    const cat = catOf(mu);
    const pick = (i) => {
      ms.pick = i;
      ms.picked = true;
      ms.custom = null;
      refresh();
      preview(instOpts(mu));
    };
    // en mode GM, deux choix peuvent donner le même son : on ne garde que le premier
    const same = (a, b) => a.type === b.type && a.instrument === b.instrument && (a.sfv || 0) === (b.sfv || 0) && a.analog === b.analog && a.patch === b.patch;
    const cur = instOpts(mu);
    const seen = [];
    const cards = pickOrder(mu)
      .map((i, k) => {
        const o = choiceAt(mu, i);
        if (seen.some((x) => same(x, o))) return null;
        seen.push(o);
        return choiceCard(o, { active: !ms.custom && same(o, cur), star: k === 0, onPick: () => pick(i) });
      })
      .filter(Boolean);
    const catLabel = (SS.CATEGORIES.find((c) => c.id === cat) || {}).label;
    // replaceChildren écrirait « null » en texte : on retire les absents
    panel.replaceChildren(
      ...[
        panelHead(mu, ms),
        h('div', { class: 'bpn-sec' }, 'Instrument phare'),
        cards[0],
        h('div', { class: 'bpn-sec' }, 'Conseillés'),
        ...cards.slice(1),
        ms.custom ? h('div', { class: 'bpn-sec' }, 'Ton choix') : null,
        ms.custom ? choiceCard(instOpts(mu), { active: true, onPick: () => {}, extraClass: ' custom' }) : null,
        h(
          'button',
          { type: 'button', class: 'btn bpn-browse', onclick: () => browseInstrument(mu, ms) },
          h('span', { html: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' }),
          'Tous les instruments…'
        ),
        h('p', { class: 'dlg-hint' }, gm()
          ? `Jeu : ${catLabel}. Mode General MIDI : les sons conseillés sont remplacés par le programme GM le plus proche ; « Tous les instruments… » propose les 128 programmes.`
          : `Jeu : ${catLabel}. La fenêtre « Nouvelle piste » donne accès à toute la bibliothèque (instruments et synthés).`)
      ].filter(Boolean)
    );
  }

  function renderKitPanel(mu, ms) {
    const panel = $('#bandPanel');
    const kitCards = (gm() ? ['gm'] : mu.kits).map((k, i) => {
      const def = B().KITS[k];
      return h(
        'button',
        {
          type: 'button',
          class: 'band-kit' + (kitOf(ms) === k ? ' active' : ''),
          role: 'radio',
          'aria-checked': kitOf(ms) === k ? 'true' : 'false',
          onclick: () => {
            ms.kit = k;
            refresh();
          },
        },
        h('span', { class: 'bk-name' }, (i === 0 ? '★ ' : '') + def.label),
        h('span', { class: 'bk-detail' }, def.source ? ({ vcsl: 'Échantillons acoustiques', gm: 'Les 47 sons de la norme, canal 10' }[def.source] || 'Dirt-Samples') : `Boîte à rythmes · ${def.year}`)
      );
    });
    const rows = ms.pieces.map((pc) => {
      const info = pieceInfo(mu, pc);
      const d = B().describe(info.opts);
      return h(
        'div',
        { class: 'band-piece' + (pc.on ? ' on' : '') },
        h(
          'label',
          { class: 'bpc-check' },
          h('input', {
            type: 'checkbox',
            checked: pc.on,
            onchange: (e) => {
              pc.on = e.target.checked;
              refresh();
            },
          }),
          h('span', { class: 'bpc-name' }, info.label)
        ),
        h(
          'span',
          { class: 'bpc-src', title: info.borrowed ? 'Absent de ce kit : emprunté à une autre machine' : '' },
          d.detail,
          info.borrowed ? h('em', {}, ' (emprunté)') : null,
          info.custom ? h('em', {}, ' (ton choix)') : null
        ),
        h('button', { type: 'button', class: 'bc-play', title: 'Écouter', 'aria-label': 'Écouter ' + info.label, html: PLAY, onclick: () => preview(info.opts) }),
        info.custom
          ? h('button', { type: 'button', class: 'bpc-btn', title: 'Revenir au son du kit', onclick: () => ((pc.custom = null), refresh()) }, '↺')
          : null,
        h('button', { type: 'button', class: 'bpc-btn', title: 'Choisir un autre son', onclick: () => browsePiece(mu, ms, pc) }, 'Changer…')
      );
    });
    const n = ms.pieces.filter((pc) => pc.on).length;
    panel.replaceChildren(
      panelHead(mu, ms),
      h('div', { class: 'bpn-sec' }, gm() ? 'Kit (mode General MIDI)' : 'Kit (★ phare + 5 conseillés)'),
      h('div', { class: 'band-kits', role: 'radiogroup', 'aria-label': 'Kit' }, ...kitCards),
      h('div', { class: 'bpn-sec' }, `Éléments — une piste par élément coché (${n})`),
      h('div', { class: 'band-pieces' }, ...rows),
      h(
        'button',
        { type: 'button', class: 'btn bpn-browse', onclick: () => addPiece(mu, ms) },
        h('span', { html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' }),
        'Ajouter un élément…'
      ),
      h('p', { class: 'dlg-hint' }, gm()
        ? `Mode General MIDI : chaque élément est un son de la batterie General MIDI. « Ajouter un élément… » propose les 47 sons (bongos, congas, claves, triangles…).`
        : `${mu.role === 'perc' ? 'Le percussionniste' : 'Le batteur'} n’a accès qu’aux drums et échantillons : boîtes à rythmes, Dirt-Samples, percussions acoustiques. Les éléments peuvent venir de kits différents.`)
    );
  }

  function renderPanel() {
    const panel = $('#bandPanel');
    const p = preset();
    const mu = p && p.musicians.find((x) => x.id === S.sel);
    panel.hidden = !mu;
    el.classList.toggle('with-panel', !!mu);
    if (!mu) return;
    const ms = musState()[mu.id];
    if (mu.kits) renderKitPanel(mu, ms);
    else renderInstPanel(mu, ms);
  }

  function syncGm() {
    const b = $('#bandGm');
    if (!b) return;
    b.classList.toggle('active', gm());
    b.setAttribute('aria-pressed', gm() ? 'true' : 'false');
  }
  function setGm(on) {
    const p = app.project();
    if (!!p.gm === on) return;
    if (on) p.gm = true;
    else delete p.gm;
    app.changed && app.changed();
    SS.ui.renderAll(); // badges GM de la liste des pistes
    refresh();
  }

  function refresh() {
    syncGm();
    renderStage();
    renderPanel();
    if (S.wiz) wizFoot();
  }

  /* ---------- Actions ---------- */
  function setStyle(id) {
    if (S.styleId === id) return;
    S.styleId = id;
    S.presetId = style().presets[0].id;
    S.sel = null;
    renderStyles();
    renderPresets();
    renderSong();
    if (cover()) coverChanged(), coverInfo();
    refresh();
  }
  function setPreset(id) {
    S.presetId = id;
    S.sel = null;
    renderPresets();
    renderSong();
    if (cover()) coverChanged(), coverInfo();
    refresh();
  }
  function select(id) {
    S.sel = id;
    refresh();
  }

  async function browseInstrument(mu, ms) {
    const cur = instOpts(mu);
    const res = await app.openTrackDialog(null, {
      state: { ...cur, name: labelOf(mu) },
      types: ['instrument', 'synth'],
      title: `Choisir l’instrument — ${labelOf(mu)}`,
      okLabel: 'Choisir',
    });
    if (!res) return;
    ms.custom = pickOpts(res);
    ms.on = true;
    refresh();
  }
  async function browsePiece(mu, ms, pc) {
    const cur = pieceInfo(mu, pc).opts;
    const res = await app.openTrackDialog(null, {
      state: { ...cur, name: B().drumLabel(cur.sound) },
      types: ['drum'],
      title: `Choisir le son — ${labelOf(mu)}`,
      okLabel: 'Choisir',
    });
    if (!res) return;
    pc.custom = pickOpts(res);
    pc.on = true;
    refresh();
  }
  async function addPiece(mu, ms) {
    const res = await app.openTrackDialog(null, {
      state: gm()
        ? { type: 'drum', sound: 'perc', source: 'gm', bank: '63', machine: SS.DEFAULT_MACHINE, name: 'Élément' }
        : { type: 'drum', sound: 'perc', source: 'tdm', machine: B().KITS[ms.kit].source ? SS.DEFAULT_MACHINE : ms.kit, name: 'Élément' },
      types: ['drum'],
      title: `Ajouter un élément — ${labelOf(mu)}`,
      okLabel: 'Ajouter',
    });
    if (!res) return;
    ms.pieces.push({ piece: res.sound || 'perc', on: true, custom: pickOpts(res) });
    refresh();
  }
  /** Garde seulement ce qui décrit le son (pas le nom, la couleur ni la longueur du dialogue). */
  function pickOpts(r) {
    const keys = ['type', 'category', 'arpOn', 'family', 'instrument', 'analog', 'patch', 'sfv', 'source', 'sound', 'machine', 'bank', 'variant'];
    const o = {};
    keys.forEach((k) => r[k] !== undefined && (o[k] = r[k]));
    return o;
  }

  /* ---------- Assistant « Nouvelle chanson » ----------
   * Ouvert par le menu de l'application, sur une chanson vide :
   *  1. Modèle : le style, l'inspiration et les musiciens (l'écran habituel de Band) ;
   *  2. Chanson : toute la chanson en vue « session » — une ligne par scène, une colonne par piste ;
   *  3. Accords : la grille de chaque scène (tonalité, accords au temps, palette Simple / Avancé, comme dans Harmonie) ;
   *     « Trouver l'inspiration » ouvre une fenêtre mode → émotion → propositions, à écouter avant de « Choisir » ;
   *  4. Mélodie : les phrases de la mélodie sur les accords de la scène choisie, son caractère et son nombre de notes
   *     par phrase (propres à chaque scène), les notes de chaque instrument (Muet / Solo / volume) ;
   *  5. Intégration : on coche les pistes à importer (batterie, basse, nappes, arpèges, lead…).
   * Étapes 3 et 4 : les scènes en colonne à gauche, sous le titre ; la lecture joue la scène choisie, en boucle.
   * Rien n'est écrit dans le projet avant « Créer la chanson » ; fermer laisse la chanson vide.
   */
  const STEPS = [
    { label: 'Modèle', hint: 'Choisis le style, l’inspiration et les musiciens' },
    { label: 'Chanson', hint: 'Toute la chanson : une ligne par scène, une colonne par piste' },
    { label: 'Accords', hint: 'Les accords de chaque scène : tonalité, grille au temps, inspiration par émotion' },
    { label: 'Mélodie', hint: 'La mélodie, phrase par phrase, sur les accords de chaque scène, avec ce que joue chaque instrument' },
    { label: 'Intégration', hint: 'Coche les pistes à importer dans la chanson' },
  ];
  const ST = { model: 1, song: 2, chords: 3, harm: 4, pick: 5 }; // numéros des étapes
  /** Étapes où l'on travaille une scène (colonne des scènes, lecture de la scène en boucle). */
  const sceneStep = (n = S.wiz && S.wiz.step) => n === ST.chords || n === ST.harm;
  const cover = () => S.mode === 'cover';
  /** Plan de la chanson : celui de l'inspiration, ou la reprise tapée (porte « Reprendre »), jouée à la façon de l'inspiration. */
  const spec = () => (cover() ? coverModel().spec : preset() && SS.BandSongs && SS.BandSongs[preset().id]);

  /* ---------- Porte « Reprendre » : une reprise tapée au clavier ----------
   * Titre, tempo, tonalité (déduite du premier accord, ou choisie), parties (« Couplet : Am | F | C | G ») et ordre
   * des parties. Chaque partie reprend le jeu de la section du modèle qui lui correspond (couplet → verse, refrain →
   * chorus ou drop…) : batterie, basse, nappes, arpège, lead de l'inspiration choisie, sur les accords tapés.
   */
  const COVER_SECTIONS = [
    [/^intro/, ['intro']],
    [/^(pre|montee|build)/, ['pre', 'build', 'verse']],
    [/^(couplet|verse|strophe|theme)/, ['verse', 'groove', 'theme']],
    [/^(refrain|chorus|drop|hook)/, ['chorus', 'drop', 'peak']],
    [/^post/, ['post', 'chorus', 'drop']],
    [/^(pont|bridge|break)/, ['bridge', 'break']],
    [/^(solo|instru|riff)/, ['solo', 'instr', 'riff', 'chorus']],
    [/^(outro|fin|coda)/, ['outro']],
  ];
  const normName = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const MAJOR_TONICS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const MINOR_TONICS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  const COVER_DEFAULT = () => ({
    title: '',
    tempo: 110,
    key: 'auto',
    parts: [
      { name: 'Intro', chords: 'Am | F | C | G' },
      { name: 'Couplet', chords: 'Am | F | C | G' },
      { name: 'Refrain', chords: 'F | G | Am | Am' },
      { name: 'Outro', chords: 'Am | F | C | G' },
    ],
    order: 'Intro Couplet Refrain Couplet Refrain Refrain Outro',
  });
  /** Section du modèle dont une partie reprend le jeu (d'après son nom). */
  function coverTemplate(base, name) {
    const n = normName(name);
    const hit = COVER_SECTIONS.find(([re]) => re.test(n));
    const ids = [...(hit ? hit[1] : []), 'verse', 'chorus', 'groove', 'drop'];
    return ids.find((id) => base.sections[id]) || Object.keys(base.sections)[0];
  }
  /** Type d'accord de l'application (SS.CHORDS) pour les intervalles d'un accord tapé. */
  function coverType(ivs) {
    const key = (a) => [...new Set(a.map((i) => ((i % 12) + 12) % 12))].sort((x, y) => x - y).join(',');
    const k = key(ivs);
    const hit = SS.CHORDS.find((c) => key(c.iv) === k);
    if (hit) return hit.id;
    const has = (i) => ivs.some((x) => ((x % 12) + 12) % 12 === i);
    if (has(3) && has(6) && !has(7)) return has(10) ? 'm7b5' : 'dim';
    if (has(3) && !has(4)) return has(10) ? 'm7' : 'min';
    if (has(4)) return has(10) ? '7' : has(11) ? 'maj7' : 'maj';
    if (has(5)) return has(10) ? '7sus4' : 'sus4';
    if (has(2)) return 'sus2';
    return '5';
  }
  /** Accords d'une partie tapée : { spans, bars, errors } (grille d’Harmonie : « | » sépare les mesures, « . » prolonge, « % » répète). */
  function coverParse(text) {
    if (!String(text || '').trim()) return { spans: [], bars: 0, errors: ['pas d’accords'] };
    try {
      return SS.melody.parseGrid(text, { spb: 16 });
    } catch (e) {
      return { spans: [], bars: 0, errors: [e.message] };
    }
  }
  /** Tonalité de la reprise : choisie, sinon déduite du premier accord (Am → La mineur, F → Fa majeur). */
  function coverKey(parsed) {
    const c = S.cover;
    if (c.key && c.key !== 'auto') {
      const [tonic, mode] = c.key.split(' ');
      return { tonic, mode: mode || 'major' };
    }
    const first = parsed.map((x) => x.spans[0]).find(Boolean);
    if (!first) return { tonic: 'A', mode: 'minor' };
    const iv = first.chord.ivs.map((i) => ((i % 12) + 12) % 12);
    const minor = iv.includes(3) && !iv.includes(4);
    return { tonic: (minor ? MINOR_TONICS : MAJOR_TONICS)[first.chord.rootPc], mode: minor ? 'minor' : 'major' };
  }
  /**
   * Ordre des parties (« Intro Couplet Refrain ×2 Outro », virgules permises) → [{ i, repeat }].
   * Le nom le plus long qui convient est pris (« Couplet 2 » avant « Couplet »). Vide : chaque partie une fois.
   */
  function coverOrder(names, text) {
    const errors = [];
    if (!String(text || '').trim()) return { seq: names.map((_, i) => i), errors };
    const ns = names.map(normName);
    let rest = normName(text);
    const seq = [];
    const SEP = /^[\s,;→>|]+/;
    while ((rest = rest.replace(SEP, ''))) {
      const rep = /^(?:[x×*])\s*(\d+)/.exec(rest);
      if (rep && seq.length) {
        for (let n = 1; n < +rep[1]; n++) seq.push(seq[seq.length - 1]);
        rest = rest.slice(rep[0].length);
        continue;
      }
      let best = -1;
      ns.forEach((n, i) => {
        if (n && rest.startsWith(n) && (rest.length === n.length || /[\s,;→>|x×*]/.test(rest[n.length])) && (best < 0 || n.length > ns[best].length)) best = i;
      });
      if (best < 0) {
        const tok = rest.split(/[\s,;→>|]/)[0];
        errors.push(`ordre : « ${tok} » n’est pas une partie`);
        rest = rest.slice(tok.length);
        continue;
      }
      seq.push(best);
      rest = rest.slice(ns[best].length);
    }
    if (!seq.length && !errors.length) errors.push('ordre : aucune partie');
    return { seq, errors };
  }
  let coverMemo = { sig: null, val: null };
  /**
   * La reprise → { spec, key, parts: [{ name, bars, spans, errors, id, as }], errors, bars } ; spec est null s'il y a
   * une erreur. Le plan suit le format de js/band-songs.js, avec une grille par section (sec.grid, degrés dans la
   * tonalité) et `as` (section du modèle reprise : nuance et automation).
   */
  function coverModel() {
    const p = preset();
    const sig = JSON.stringify([S.cover, p && p.id]);
    if (coverMemo.sig === sig) return coverMemo.val;
    const base = p && SS.BandSongs && SS.BandSongs[p.id];
    const c = S.cover;
    const parsed = c.parts.map((pt) => coverParse(pt.chords));
    const key = coverKey(parsed);
    const errors = [];
    const seen = new Set();
    const parts = c.parts.map((pt, i) => {
      const r = parsed[i];
      const name = String(pt.name || '').trim();
      const errs = [...r.errors];
      if (!name) errs.unshift('sans nom');
      else if (seen.has(normName(name))) errs.unshift('nom déjà pris');
      seen.add(normName(name));
      errs.forEach((e) => errors.push(`${name || `Partie ${i + 1}`} : ${e}`));
      const as = base ? coverTemplate(base, name) : null;
      return { name, bars: r.bars, spans: r.spans, errors: errs, as, id: `${as}_${i + 1}` };
    });
    const order = coverOrder(parts.map((x) => x.name), c.order);
    errors.push(...order.errors);
    let spec = null;
    let bars = 0;
    if (base && !errors.length && parts.length) {
      const sections = {};
      parts.forEach((pt) => {
        const t = { ...base.sections[pt.as] };
        delete t.key;
        delete t.emotion;
        const grid = pt.spans.map((sp) => {
          const g = SS.harmony.toGridChord(key, { rootPc: sp.chord.rootPc, type: coverType(sp.chord.ivs) });
          const bass = (((sp.chord.bassPc - sp.chord.rootPc) % 12) + 12) % 12;
          return g && { step: sp.step, len: sp.len, ...g, ...(bass ? { bass } : {}) };
        });
        sections[pt.id] = { ...t, as: pt.as, name: pt.name, bars: Math.max(1, pt.bars), grid: grid.filter(Boolean) };
      });
      const form = [];
      order.seq.forEach((i) => {
        const last = form[form.length - 1];
        if (last && last.i === i) last.n++;
        else form.push({ i, n: 1 });
        bars += Math.max(1, parts[i].bars);
      });
      spec = {
        ...base,
        emotion: undefined,
        key: `${key.tonic} ${key.mode}`,
        sections,
        form: form.map((f) => parts[f.i].id + (f.n > 1 ? `*${f.n}` : '')).join(' '),
      };
    }
    coverMemo = { sig, val: { spec, key, parts, errors, bars, used: new Set(order.seq) } };
    return coverMemo.val;
  }
  /** La reprise a changé : les retouches des étapes suivantes (grilles, phrases…) repartent des accords tapés. */
  function coverChanged() {
    if (S.wiz) Object.assign(S.wiz, { plans: {}, pseeds: {}, keys: {}, grids: {}, emos: {}, chars: {}, gsel: null, insp: null });
  }
  const singer = (role) => SS.bandSong.SINGERS.includes(role);

  /** Colonnes de la vue session : une par piste prévue, avec un identifiant stable (musicien + son). */
  function wizCols() {
    const seen = new Map();
    return plannedTracks().map((o) => {
      const base = `${o.band.musician}:${o.band.key}`;
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      return { id: n ? `${base}#${n}` : base, o, role: o.band.key.split(':')[0], musician: o.band.musician };
    });
  }

  /** La chanson calculée pour la vue session (même calcul que « Créer la chanson », sur des pistes fictives). */
  function wizSong() {
    const p = preset();
    const cols = wizCols();
    const harmony = harmonyOpts(true);
    const sig = JSON.stringify([p.id, cover() && S.cover, S.wiz.seed, melodyOpts(), harmony, cols.map((c) => [c.id, c.o])]);
    if (S.wiz.sig !== sig) {
      const sp = spec();
      const fake = cols.map((c) => ({ id: c.id, type: c.o.type, sound: c.o.sound, band: c.o.band }));
      S.wiz.res = sp ? SS.bandSong.build(sp, p.id, fake, { melodySeed: S.wiz.seed, melody: melodyOpts(), harmony }) : null;
      S.wiz.sig = sig;
    }
    return { cols, res: S.wiz.res };
  }

  /** Accords d'une scène, par leur nom (« Cm | B♭ | A♭ | B♭ »). */
  function sceneChords(sc) {
    const sec = spec().sections[sc.sec];
    if (!sec || !sec.chords) return '';
    return sec.chords
      .split('|')
      .map((bar) => bar.trim().split(/\s+/).map((tok) => tok.split('/').map((t) => {
        try {
          const c = SS.bandSong.parseChord(t, sc.key);
          return SS.harmony.chordName(sc.key, { ...c, bassPc: c.rootPc });
        } catch (e) {
          return t;
        }
      }).join(' ')).join(' '))
      .join(' | ');
  }

  /** Petit clip dessiné (comme une case de la vue session d'un DAW) : pas de batterie ou notes. */
  function clipSvg(d, bars, range) {
    const W = bars * 16;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} 20`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('bw-clip-svg');
    const rect = (x, y, w, hh) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x);
      r.setAttribute('y', y);
      r.setAttribute('width', w);
      r.setAttribute('height', hh);
      svg.append(r);
    };
    for (let b = 4; b < bars; b += 4) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', b * 16);
      l.setAttribute('x2', b * 16);
      l.setAttribute('y1', 0);
      l.setAttribute('y2', 20);
      l.setAttribute('class', 'bw-bar');
      svg.append(l);
    }
    if (d.steps) d.steps.forEach((v, i) => v > 0 && rect(i + 0.15, 20 - 3 - 15 * v, 0.7, 3 + 15 * v));
    else {
      const [lo, hi] = range;
      const span = Math.max(12, hi - lo);
      (d.events || []).forEach((e) => e.notes.forEach((n) => rect(e.step, 17 - (15 * (n - lo)) / span - 1.5, Math.max(0.6, e.len - 0.15), 3)));
    }
    return svg;
  }
  const hasData = (d) => !!d && (d.steps ? d.steps.some((v) => v > 0) : (d.events || []).length > 0);

  /** Réglages passés à SS.bandSong.build (caractère, réglages fins, plan de phrases de chaque section). */
  function melodyOpts() {
    const m = S.mel;
    return {
      character: m.character, form: m.form === 'auto' ? null : m.form, rhythm: m.rhythm, complexity: m.complexity, range: m.range, ending: m.ending, notes: m.notes,
      useProfile: m.profile !== 'off',
      plans: S.wiz.plans, seeds: S.wiz.pseeds, scenes: S.wiz.chars,
    };
  }
  /**
   * Accords de l'étape Accords, par section : tonalité, grille, émotion. `preview` : la proposition choisie dans la
   * fenêtre « Trouver l'inspiration » remplace la scène le temps de l'écouter.
   */
  function harmonyOpts(preview = false) {
    const w = S.wiz;
    const out = { keys: { ...w.keys }, chords: { ...w.grids }, emotions: { ...w.emos } };
    const pv = preview && w.insp && w.insp.preview;
    if (pv) {
      out.keys[pv.sec] = pv.key;
      out.chords[pv.sec] = pv.grid;
      out.emotions[pv.sec] = pv.emo;
    }
    return out;
  }
  /** Caractère et notes par phrase d'une scène (sinon ceux par défaut). */
  const charOf = (sec) => (S.wiz.chars[sec] && S.wiz.chars[sec].character) || S.mel.character;
  const notesOf = (sec) => (S.wiz.chars[sec] && S.wiz.chars[sec].notes != null ? S.wiz.chars[sec].notes : S.mel.notes);
  const BS = () => SS.bandSong;
  const melForm = () => (S.mel.form === 'auto' ? null : S.mel.form);
  /** Plan de phrases d'une scène : celui qu'on a modifié, sinon celui par défaut. */
  function scenePlan(sc) {
    const own = S.wiz.plans[sc.sec];
    return own ? BS().fitPlan(own, sc.bars, charOf(sc.sec), melForm()) : BS().defaultPlan(sc.bars, charOf(sc.sec), melForm());
  }
  function setPlan(sc, fn) {
    const plan = scenePlan(sc).map((p) => ({ ...p }));
    fn(plan);
    // silences côte à côte : une seule phrase muette
    for (let i = plan.length - 1; i > 0; i--)
      if (plan[i].mode === 'off' && plan[i - 1].mode === 'off') {
        plan[i - 1].bars += plan[i].bars;
        plan.splice(i, 1);
      }
    S.wiz.plans[sc.sec] = BS().fitPlan(plan, sc.bars, charOf(sc.sec), melForm());
    renderWiz();
  }
  /** Longueur d'une phrase : plus courte, la place libérée devient un silence ; plus longue, elle prend sur les suivantes. */
  function setPhraseBars(sc, i, bars) {
    setPlan(sc, (plan) => {
      const p = plan[i];
      const d = bars - p.bars;
      p.bars = bars;
      if (d < 0) plan.splice(i + 1, 0, { bars: -d, mode: 'off', letter: p.letter });
      else {
        let take = d;
        while (take > 0 && plan[i + 1]) {
          const q = plan[i + 1];
          const t = Math.min(take, q.bars);
          q.bars -= t;
          take -= t;
          if (!q.bars) plan.splice(i + 1, 1);
        }
      }
    });
  }
  /**
   * Réglages fins de la mélodie : rien n'est perdu de l'ancienne « mélodie composée » (pieds = notes par phrase,
   * mesures par vers = longueur des phrases, complexité, rythme, tessiture, fin), plus la forme des phrases.
   */
  function melodyForm() {
    const m = S.mel;
    const set = (k, v) => {
      m[k] = v;
      if (k === 'form') Object.entries(S.wiz.plans).forEach(([sec, plan]) => plan.forEach((p, i) => (p.letter = (BS().FORMS[melForm()] || BS().FORMS[BS().CHARACTERS[charOf(sec)].form])[i % 4])));
      renderWiz();
    };
    const sel = (id, label, k, options, hint) =>
      h(
        'label',
        { class: 'bw-field' },
        h('span', {}, label),
        h(
          'select',
          { id, title: hint || null, onchange: (e) => set(k, typeof m[k] === 'number' ? Number(e.target.value) : e.target.value) },
          ...options.map(([v, t]) => {
            const o = h('option', { value: v }, t);
            o.selected = String(m[k]) === String(v);
            return o;
          })
        )
      );
    const R = (SS.melody && SS.melody.RANGES) || {};
    const ch = BS().CHARACTERS[(S.wiz && S.wiz.hsec && charOf(S.wiz.hsec)) || m.character] || BS().CHARACTERS.inspiration;
    return h(
      'div',
      { class: 'bw-melform', id: 'bwMelForm' },
      sel('bwForm', 'Forme', 'form', [['auto', `Selon le caractère (${ch.form})`], ...Object.keys(BS().FORMS).map((f) => [f, f])], 'Lettres des phrases, par groupes de 4 : les phrases de même lettre reprennent le même motif ; ′ varie la fin.'),
      sel('bwRhythm', 'Rythme', 'rhythm', [['auto', 'Selon le caractère'], ['simple', 'Simple'], ['varie', 'Varié (pointées, syncopes)'], ['dense', 'Dense (doubles-croches)']]),
      sel('bwComplexity', 'Mouvement', 'complexity', [['simple', 'Simple (petits intervalles)'], ['balanced', 'Équilibré'], ['adventurous', 'Audacieux (grands sauts)']], 'Simple : sauts jusqu’à la quinte, rares. Audacieux : jusqu’à l’octave, plus souvent.'),
      sel('bwRange', 'Tessiture', 'range', [['auto', 'Auto (voix ou instrument)'], ...Object.entries(R).filter(([id]) => id !== 'profil').map(([id, r]) => [id, r.label])]),
      sel('bwEnding', 'Fin de la scène', 'ending', [['auto', 'Selon l’émotion (sinon fermée)'], ['closed', 'Fermée (se pose)'], ['open', 'Ouverte (en suspens)'], ['suspended', 'Suspendue']]),
      sel('bwProfile', 'Émotion de la scène', 'profile', [['on', 'Guide la mélodie (profil)'], ['off', 'Ignorée']], 'Le profil de l’émotion (étape Accords) règle le contour, la note visée sur les temps forts, le registre et la fin. Le caractère garde le rythme et les sauts.')
    );
  }

  function renderWizSteps() {
    const box = $('#bandWizSteps');
    box.replaceChildren(
      ...STEPS.map((st, i) => {
        const n = i + 1;
        const cls = n === S.wiz.step ? 'cur' : n < S.wiz.step ? 'done' : '';
        return h(
          'li',
          { class: cls, 'aria-current': n === S.wiz.step ? 'step' : null },
          h('button', { type: 'button', disabled: n > S.wiz.step && !canGo(n), title: st.hint, onclick: () => goStep(n) }, h('b', {}, String(n)), h('span', {}, st.label))
        );
      })
    );
  }

  /** On peut aller à l'étape n si la chanson se calcule (inspiration avec un plan, au moins une piste). */
  function canGo(n) {
    if (n <= 1) return true;
    return !!spec() && plannedTracks().length > 0;
  }

  function goStep(n) {
    if (n === S.wiz.step || !canGo(n)) return;
    S.wiz.step = n;
    S.sel = null;
    S.wiz.insp = null;
    S.wiz.gsel = null;
    if (sceneStep(n) && L.mode && L.scene) S.wiz.hscene = L.scene; // Accords, Mélodie : la scène qu'on entend
    if (n === 1) dropListen();
    renderWiz();
    if (sceneStep(n) && L.mode === 'song' && !L.paused) playScene(S.wiz.hscene); // ici, on écoute une scène
  }

  function toggleCols(ids, on) {
    ids.forEach((id) => (on ? S.wiz.off.delete(id) : S.wiz.off.add(id)));
    renderWiz();
  }

  function renderWizGrid() {
    const p = preset();
    const { cols, res } = wizSong();
    const step = S.wiz.step;
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    // scènes : une ligne chacune, dans l'ordre d'arrivée ; combien de fois elle est jouée dans l'arrangement
    const plays = new Map();
    res.song.forEach((b) => plays.set(b.scene, (plays.get(b.scene) || 0) + b.repeat));
    // tessiture de chaque colonne (même échelle dans toutes les scènes)
    const range = new Map(cols.map((c) => {
      const ns = res.scenes.flatMap((sc) => ((sc.data[c.id] || {}).events || []).flatMap((e) => e.notes));
      return [c.id, ns.length ? [Math.min(...ns), Math.max(...ns)] : [48, 72]];
    }));
    // groupes de colonnes : un par musicien (la batterie a une colonne par élément)
    const groups = [];
    cols.forEach((c) => {
      const g = groups[groups.length - 1];
      if (g && g.musician === c.musician) g.cols.push(c);
      else groups.push({ musician: c.musician, mu: p.musicians.find((m) => m.id === c.musician), cols: [c] });
    });
    const pick = step === ST.pick;
    // étape Chanson : les colonnes coupées à l'étape Mélodie (Muet / Solo) sont grisées
    const muted = (c) => !pick && silenced(c.id);
    const isOff = (c) => pick && S.wiz.off.has(c.id);
    const check = (ids, label) => {
      const on = ids.filter((id) => !S.wiz.off.has(id)).length;
      const cb = h('input', { type: 'checkbox', 'aria-label': `Importer ${label}`, onchange: (e) => toggleCols(ids, e.target.checked) });
      cb.checked = on > 0;
      cb.indeterminate = on > 0 && on < ids.length;
      return cb;
    };
    const len = res.song.reduce((a, b) => a + res.scenes.find((sc) => sc.id === b.scene).bars * b.repeat, 0);
    const secs = (len * 4 * 60) / tempo();
    const time = `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
    const kept = cols.filter((c) => !S.wiz.off.has(c.id)).length;

    const order = h(
      'div',
      { class: 'bw-order', role: 'group', 'aria-label': 'Ordre des scènes dans la chanson' },
      h(
        'ol',
        { class: 'bw-blocks' },
        ...res.song.map((b, i) => {
          const sc = res.scenes.find((x) => x.id === b.scene);
          const bars = sc.bars * b.repeat;
          return h(
            'li',
            { style: `flex:${bars} 1 0` },
            h(
              'button',
              { type: 'button', class: 'bw-block', 'data-sec': sc.sec, title: `Écouter à partir de « ${sc.name} » (${bars} mesures)`, onclick: () => listenSong(i) },
              h('span', {}, sc.name),
              b.repeat > 1 ? h('small', {}, `×${b.repeat}`) : null
            )
          );
        })
      ),
      h('span', { class: 'bw-seed bw-dur' }, time)
    );
    const top = h(
      'div',
      { class: 'bw-top' },
      h(
        'div',
        { class: 'bw-info' },
        h('b', {}, `« ${p.song} »`),
        h('span', {}, ` ${p.artist} · ${SS.harmony.label(res.key)} · ${tempo()} BPM · ${res.scenes.length} scènes · ${len} mesures · ${time}`)
      ),
      h('p', { class: 'bw-hint' }, STEPS[step - 1].hint + '. Clique une scène pour l’écouter en boucle.'),
      order,
      step === ST.pick
        ? h(
            'div',
            { class: 'bw-actions' },
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => toggleCols(cols.map((c) => c.id), true) }, 'Tout'),
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => toggleCols(cols.map((c) => c.id), false) }, 'Rien'),
            h('span', { class: 'bw-seed' }, `${kept} piste${kept > 1 ? 's' : ''} sur ${cols.length}`)
          )
        : null
    );

    const head1 = h(
      'tr',
      { class: 'bw-groups' },
      h('th', { class: 'bw-corner', rowspan: 2, scope: 'col' }, 'Scènes'),
      ...groups.map((g) => {
        const label = labelOf(g.mu);
        const ids = g.cols.map((c) => c.id);
        const off = pick && ids.every((id) => S.wiz.off.has(id));
        return h(
          'th',
          {
            colspan: g.cols.length,
            scope: 'colgroup',
            class: 'bw-group' + (off ? ' off' : ''),
            style: `--c:${colorOf(g.mu)}`,
          },
          h('label', { class: 'bw-glabel' }, pick ? check(ids, label) : null, h('span', { class: 'bw-ico', html: icon(g.mu.role) }), h('span', {}, label))
        );
      })
    );
    const head2 = h(
      'tr',
      { class: 'bw-tracks' },
      ...cols.map((c) => {
        const multi = groups.find((g) => g.musician === c.musician).cols.length > 1;
        return h(
          'th',
          { scope: 'col', class: 'bw-track' + (isOff(c) ? ' off' : '') + (muted(c) ? ' muted' : ''), style: `--c:${c.o.color}`, title: B().describe(c.o).name },
          h('label', {}, pick && multi ? check([c.id], c.o.name) : null, h('span', {}, c.o.name))
        );
      })
    );
    const body = res.scenes.map((sc) =>
      h(
        'tr',
        { 'data-scene': sc.id, 'data-bars': sc.bars },
        h(
          'th',
          { scope: 'row', class: 'bw-scene', title: sceneChords(sc) },
          h(
            'button',
            { type: 'button', class: 'bw-splay', 'aria-pressed': 'false', title: `Écouter « ${sc.name} » en boucle (re-clic : arrêt)`, onclick: () => listenScene(sc.id) },
            h('span', { class: 'bw-pico', html: PLAY + STOP }),
            h('span', { class: 'bw-sname' }, sc.name),
            h('small', {}, `${sc.bars} mes.` + (plays.get(sc.id) > 1 ? ` · ×${plays.get(sc.id)}` : '')),
            h('small', { class: 'bw-chords' }, sceneChords(sc))
          )
        ),
        ...cols.map((c) => {
          const d = sc.data[c.id];
          const on = hasData(d);
          const n = on ? (d.steps ? d.steps.filter((v) => v > 0).length : d.events.length) : 0;
          return h(
            'td',
            { class: 'bw-cell' + (isOff(c) ? ' off' : '') + (muted(c) ? ' muted' : '') },
            on
              ? h('div', { class: 'bw-clip', style: `--c:${c.o.color}`, title: `${sc.name} · ${c.o.name} : ${n} ${d.steps ? 'coup' : 'note'}${n > 1 ? 's' : ''}` }, clipSvg(d, sc.bars, range.get(c.id)))
              : h('div', { class: 'bw-slot', title: `${sc.name} · ${c.o.name} : silence` })
          );
        })
      )
    );
    box.replaceChildren(top, h('div', { class: 'bw-scroll' }, h('table', { class: 'bw-grid', style: `--cols:${cols.length}` }, h('thead', {}, head1, head2), h('tbody', {}, ...body))));
  }

  /* ---------- Étape Mélodie (accords, phrases de la mélodie, instruments) ----------
   * À gauche les scènes (dans l'ordre d'arrivée, avec leurs accords en résumé) ; à droite la scène choisie : la
   * piste d'accords en haut, dessinée comme dans Harmonie (degré, nom, rôle : repos / préparation / tension), puis les
   * instruments. Une note pleine appartient à l'accord du moment ; en creux, c'est une note de passage.
   * La batterie, sans hauteur de note, est masquée par défaut (interrupteur « Batterie »).
   */
  const NO_ROLE = { id: 'color', label: 'emprunt', text: 'accord pris hors de la tonalité' };
  /** Nom, degré, rôle et notes (classes de hauteur) d'un accord de la chanson dans la tonalité de sa scène. */
  function chordInfo(key, c) {
    const H = SS.harmony;
    const id = { rootPc: c.rootPc, type: c.type, bassPc: c.rootPc };
    const deg = H.scale(key).findIndex((d) => d.pc === c.rootPc);
    return {
      name: H.chordName(key, id),
      numeral: H.analyzeChord(key, id).numeral,
      role: deg >= 0 ? H.role(key, deg, c.type) : NO_ROLE,
      pcs: SS.chordNotes(60 + c.rootPc, c.type).map((n) => ((n % 12) + 12) % 12),
    };
  }
  /** Accords d'une scène, pas par pas : [{ step, len, bar, info }]. */
  function sceneSpans(sc) {
    if (sc.spans) return sc.spans.map((x) => ({ step: x.step, len: x.len, bar: x.bar, info: chordInfo(sc.key, x.chord) }));
    const sec = spec() && spec().sections[sc.sec];
    if (!sec || !sec.chords) return [];
    try {
      return SS.bandSong.spansOf(sec, sc.key, sc.bars).map((x) => ({ step: x.step, len: x.len, bar: x.bar, info: chordInfo(sc.key, x.chord) }));
    } catch (e) {
      return [];
    }
  }

  /** Scène choisie aux étapes Accords et Mélodie (la même section après un nouveau calcul de la chanson). */
  function curScene(res) {
    if (!res.scenes.some((x) => x.id === S.wiz.hscene)) S.wiz.hscene = (res.scenes.find((x) => x.sec === S.wiz.hsec) || res.scenes[0]).id;
    const sc = res.scenes.find((x) => x.id === S.wiz.hscene);
    S.wiz.hsec = sc.sec;
    return sc;
  }
  function pickScene(x) {
    if (x.id === S.wiz.hscene) return;
    S.wiz.hscene = x.id;
    S.wiz.hsec = x.sec;
    S.wiz.gsel = null;
    renderWiz();
    if (L.mode === 'scene') playScene(x.id); // la lecture suit la scène choisie
  }

  /**
   * Colonne des scènes (étapes Accords et Mélodie), sous le titre : nom, longueur, accords distincts, puis une
   * ligne propre à l'étape (`sub` : émotion choisie, caractère de la mélodie…).
   */
  function sceneNav(res, sc, sub, legend = false) {
    const plays = new Map();
    res.song.forEach((b) => plays.set(b.scene, (plays.get(b.scene) || 0) + b.repeat));
    return h(
      'nav',
      { class: 'bh-scenes', 'aria-label': 'Scènes, dans l’ordre' },
      h('div', { class: 'bh-label' }, 'Scènes, dans l’ordre'),
      ...res.scenes.map((x) => {
        const seen = new Map();
        sceneSpans(x).forEach((sp) => !seen.has(sp.info.name) && seen.set(sp.info.name, sp.info));
        const on = x.id === sc.id;
        const line = sub && sub(x);
        return h(
          'button',
          { type: 'button', class: 'bh-scene' + (on ? ' on' : ''), 'data-scene': x.id, 'data-sec': x.sec, 'aria-pressed': String(on), title: `Travailler « ${x.name} » (la lecture joue la scène choisie)`, onclick: () => pickScene(x) },
          h('span', { class: 'bh-sname' }, h('b', {}, x.name), h('small', {}, `${x.bars} mes.` + (plays.get(x.id) > 1 ? ` · ×${plays.get(x.id)}` : ''))),
          h('span', { class: 'bh-mini' }, ...[...seen.values()].map((c) => h('span', { class: 'bh-mchip role-' + c.role.id, title: `${c.numeral} · ${c.role.label}` }, c.name))),
          line ? h('small', { class: 'bh-ssub' }, line) : null
        );
      }),
      legend ? h('div', { class: 'bh-legend' }, h('span', {}, h('i', { class: 'bh-lg-in' }), 'Note de l’accord'), h('span', {}, h('i', { class: 'bh-lg-out' }), 'Note de passage')) : null
    );
  }
  /** Mise en page des étapes Accords et Mélodie : colonne des scènes à gauche, bandeau de lecture et contenu à droite. */
  function splitView(nav, ...content) {
    const box = $('#bandWiz');
    box.classList.add('bw-split');
    box.replaceChildren(h('div', { class: 'bh-wrap' }, nav, h('div', { class: 'bh-right' }, $('#bwTransport'), h('div', { class: 'bh-content' }, ...content))));
  }

  function renderHarmony() {
    const { cols, res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const sc = curScene(res);
    const melOf = (x) => {
      const n = notesOf(x.sec);
      const emo = S.mel.profile !== 'off' && S.wiz.emos[x.sec] && SS.findEmotion(S.wiz.emos[x.sec]);
      return `${emo ? emo.label + ' · ' : ''}${BS().CHARACTERS[charOf(x.sec)].label} · ${n ? `${n} notes` : 'notes libres'}`;
    };

    const total = sc.bars * 16;
    const pct = (x) => `${((100 * x) / total).toFixed(3)}%`;
    const spans = sceneSpans(sc);
    const spanAt = (step) => spans.find((x) => step >= x.step && step < x.step + x.len);
    const head = (cls, ...kids) => h('div', { class: 'bh-head ' + cls }, ...kids);
    const row = (cls, headEl, ...kids) => h('div', { class: 'bh-row ' + cls }, headEl, h('div', { class: 'bh-track' }, ...kids));
    // bandes des accords (repères de lecture dans toutes les lignes)
    const bands = () => spans.map((x, i) => h('i', { class: 'bh-band' + (i % 2 ? '' : ' alt'), style: `left:${pct(x.step)};width:${pct(x.len)}` }));

    const ruler = row(
      'bh-ruler',
      head('', ''),
      ...Array.from({ length: sc.bars }, (_, b) => h('span', { class: 'bh-num', style: `left:${pct(b * 16)}` }, String(b + 1)))
    );
    const chords = row(
      'bh-chords',
      head('bh-chead', h('b', {}, 'Accords'), h('small', {}, 'degré · nom · rôle')),
      ...spans.map((x) => {
        const c = x.info;
        const narrow = x.len / total < 0.07;
        return h(
          'div',
          { class: `bh-chord role-${c.role.id}${narrow ? ' narrow' : ''}`, style: `left:${pct(x.step)};--w:${pct(x.len)}`, title: `${c.name} · ${c.numeral} — ${c.role.text}` },
          h('small', {}, c.numeral),
          h('b', {}, c.name),
          narrow ? null : h('span', { class: 'bh-role' }, c.role.label)
        );
      }),
      spans.length ? null : h('span', { class: 'bh-empty' }, 'Pas de grille d’accords pour cette scène')
    );

    // tête d'une ligne : couleur, nom, Muet / Solo et volume (une seule commande pour toute la batterie)
    const laneHead = (ids, name, sub, color) =>
      head(
        'bh-ihead',
        h('i', { class: 'bh-swatch', style: `--c:${color}` }),
        h(
          'span',
          { class: 'bh-name' },
          h('b', { title: name }, name),
          sub ? h('small', { title: sub }, sub) : null,
          h('span', { class: 'bh-ctl' }, msBtns(ids, name), volCtl(ids, name))
        )
      );
    const melIds = new Set(cols.filter((c) => singer(c.role)).map((c) => c.id));
    // la mélodie joue dans cette scène (pas en montée « rise ») : ligne des phrases
    const secSpec = spec() && spec().sections[sc.sec];
    const melPlays = !!secSpec && cols.some((c) => melIds.has(c.id) && secSpec[c.role] && secSpec[c.role] !== 'rise');
    const shown = (c) => melIds.has(c.id) || !S.hide.has(c.id);

    // batterie : une ligne par élément (coups, sans hauteur)
    const drumCols = cols.filter((c) => c.o.type === 'drum');
    const drumIds = drumCols.map((c) => c.id);
    const drums = drumCols.length && drumCols.some(shown)
      ? row(
          'bh-drums' + (drumIds.every(silenced) ? ' muted' : ''),
          laneHead(drumIds, 'Batterie', drumCols.map((c) => c.o.name).join(' · '), drumCols[0].o.color),
          ...bands(),
          ...drumCols.flatMap((c, i) => {
            const d = sc.data[c.id];
            const steps = (d && d.steps) || [];
            const y = ((i + 0.5) / drumCols.length) * 100;
            return steps.map((v, k) => (v > 0 && k < total ? h('i', { class: 'bh-hit', style: `left:${pct(k)};top:${y.toFixed(1)}%;--c:${c.o.color};opacity:${(0.45 + 0.55 * v).toFixed(2)}` }) : null)).filter(Boolean);
          })
        )
      : null;
    if (drums) drums.style.setProperty('--rows', drumCols.length);

    // instruments : notes pleines (dans l'accord) ou en creux (notes de passage)
    const lanes = cols
      .filter((c) => c.o.type !== 'drum' && shown(c))
      .map((c) => {
        const d = sc.data[c.id];
        const events = (d && d.events) || [];
        const all = events.flatMap((e) => e.notes);
        let inCount = 0;
        const notes = [];
        if (all.length) {
          const lo = Math.min(...all);
          const hi = Math.max(...all);
          const span = Math.max(1, hi - lo);
          events.forEach((e) => {
            const chord = spanAt(e.step);
            e.notes.forEach((n) => {
              const inside = !chord || chord.info.pcs.includes(((n % 12) + 12) % 12);
              if (inside) inCount++;
              notes.push(
                h('i', {
                  class: 'bh-note' + (inside ? '' : ' out'),
                  style: `left:${pct(e.step)};width:max(2px, calc(${pct(Math.min(e.len, total - e.step))} - 1px));top:calc(6px + (100% - 12px - var(--nh)) * ${((hi - n) / span).toFixed(3)})`,
                })
              );
            });
          });
        }
        const fit = all.length ? `${Math.round((100 * inCount) / all.length)} % dans l’accord` : 'ne joue pas ici';
        const el = row(
          'bh-lane' + (all.length ? '' : ' empty') + (melIds.has(c.id) ? ' mel' : '') + (silenced(c.id) ? ' muted' : ''),
          laneHead([c.id], c.o.name, fit, c.o.color),
          ...bands(),
          ...notes
        );
        el.style.setProperty('--c', c.o.color);
        el.dataset.col = c.id;
        // hauteur d'une note : plus fine quand la tessiture est large
        const range = all.length ? Math.max(...all) - Math.min(...all) + 1 : 1;
        el.style.setProperty('--nh', `${Math.max(3, Math.min(9, Math.floor(76 / range)))}px`);
        return el;
      });

    const loop = h(
      'button',
      { type: 'button', class: 'btn btn-small bh-loop', 'aria-pressed': 'false', title: `Écouter « ${sc.name} » en boucle (re-clic : arrêt)`, onclick: () => listenScene(sc.id) },
      h('span', { class: 'bw-pico', html: PLAY + STOP }),
      h('span', {}, 'Écouter la scène')
    );
    const plays = res.song.reduce((a, b) => a + (b.scene === sc.id ? b.repeat : 0), 0);
    // accompagnement : replié sur une ligne (les pistes cochées dans le menu « Pistes » s'affichent dépliées)
    const accLanes = [drums, ...lanes.filter((x) => !x.classList.contains('mel'))].filter(Boolean);
    const accN = cols.filter((c) => !melIds.has(c.id) && c.o.type !== 'drum').length + (drumCols.length ? 1 : 0);
    const acc = accN
      ? h(
          'div',
          { class: 'bh-row bh-acc' },
          h(
            'button',
            { type: 'button', class: 'bh-acc-btn', id: 'bwAcc', 'aria-expanded': String(!!S.accOpen), onclick: () => ((S.accOpen = !S.accOpen), renderHarmony(), markListen()) },
            `${S.accOpen ? '▾' : '▸'} Accompagnement · ${accN} piste${accN > 1 ? 's' : ''}`,
            h('small', {}, [drumCols.length ? 'batterie' : null, ...cols.filter((c) => !melIds.has(c.id) && c.o.type !== 'drum').map((c) => c.o.name.toLowerCase())].filter(Boolean).join(', '))
          ),
          S.accOpen ? tracksMenu(cols, melIds) : null
        )
      : null;
    const board = h(
      'div',
      { class: 'bh-board', 'data-scene': sc.id, 'data-bars': sc.bars, style: `--bars:${sc.bars}` },
      ruler,
      melPlays ? phraseRow(sc, pct, head, row) : null,
      chords,
      ...lanes.filter((x) => x.classList.contains('mel')),
      acc,
      ...(S.accOpen || !melIds.size ? accLanes : []),
      h('i', { class: 'bh-ph', 'aria-hidden': 'true' })
    );
    const main = h(
      'main',
      { class: 'bh-main' },
      h('div', { class: 'bh-top' }, h('h3', {}, sc.name), h('span', { class: 'bh-info' }, `${sc.bars} mesures` + (plays > 1 ? ` · jouée ${plays} fois` : '') + ` · ${SS.harmony.label(sc.key)}`), h('span', { class: 'spacer' }), loop),
      h('div', { class: 'bw-top bh-head-mel' }, ...melodyBar(melIds.size > 0, sc)),
      h('div', { class: 'bh-scroll' }, board)
    );
    splitView(sceneNav(res, sc, melIds.size ? melOf : null, true), main);
  }

  /* ---------- Étape Accords : la grille de chaque scène, comme dans Harmonie ----------
   * La grille est celle d’Harmonie ({ step, len, degree, type, acc }, en pas de double-croche, degrés dans la tonalité
   * de la scène) : changer de tonalité garde les degrés. Tant qu'on n'y touche pas, c'est celle de l'inspiration.
   * Elle couvre toute la scène : un trou est tenu par l'accord d'avant (comme à l'écoute).
   */
  const HM = () => SS.harmony;
  const SNAPS = [['bar', 'à la mesure', 16], ['half', 'à la demi-mesure', 8], ['beat', 'au temps', 4]];
  const snapUnit = () => (SNAPS.find((x) => x[0] === S.wiz.snap) || SNAPS[2])[2];
  const GFAMS = [
    { id: 'repos', title: 'Repos', sub: 'on s’y pose' },
    { id: 'prep', title: 'Préparation', sub: 'on s’éloigne' },
    { id: 'color', title: 'Couleur du mode', sub: 'sa note caractéristique' },
    { id: 'tension', title: 'Tension', sub: 'appelle le retour' },
  ];
  let gridAdv = false; // palette : Simple ou Avancé (7, 9, sus…)

  /** Grille de l'inspiration pour une scène (accords du plan, lus dans la tonalité de la scène). */
  function specGrid(sc) {
    const sec = spec() && spec().sections[sc.sec];
    if (sec && sec.grid) return fillGrid(sec.grid.map((c) => ({ ...c })), sc.bars * 16); // reprise : les accords tapés
    if (!sec || !sec.chords) return [];
    try {
      return fillGrid(
        BS()
          .spansOf(sec, sc.key, sc.bars)
          .map((x) => {
            const g = HM().toGridChord(sc.key, x.chord);
            return g && { step: x.step, len: x.len, ...g };
          })
          .filter(Boolean),
        sc.bars * 16
      );
    } catch (e) {
      return [];
    }
  }
  function gridOf(sc) {
    const pv = S.wiz.insp && S.wiz.insp.preview;
    if (pv && pv.sec === sc.sec) return pv.grid; // la proposition qu'on écoute (fenêtre d'inspiration)
    return S.wiz.grids[sc.sec] || specGrid(sc);
  }
  /** Accords triés, sans chevauchement, qui couvrent toute la scène (un trou : l'accord d'avant tient). */
  function fillGrid(list, total) {
    const g = list
      .filter((c) => c.len > 0 && c.step < total)
      .map((c) => ({ ...c, len: Math.min(c.len, total - c.step) }))
      .sort((a, b) => a.step - b.step);
    if (!g.length) return g;
    g[0].len += g[0].step;
    g[0].step = 0;
    g.forEach((c, i) => (c.len = (g[i + 1] ? g[i + 1].step : total) - c.step));
    return g.filter((c) => c.len > 0);
  }
  /** Modifie la grille de la scène (copie de celle de l'inspiration au premier changement). */
  function editGrid(sc, fn) {
    const g = gridOf(sc).map((c) => ({ ...c }));
    const keep = fn(g);
    const out = fillGrid(g, sc.bars * 16);
    S.wiz.grids[sc.sec] = out;
    if (keep) S.wiz.gsel = out.indexOf(out.find((c) => c.step === keep.step)) ;
    else if (S.wiz.gsel != null && !out[S.wiz.gsel]) S.wiz.gsel = null;
    renderWiz();
  }
  /** Pose un accord : il remplace ce qu'il recouvre (un accord coupé en deux garde ses deux bouts). */
  function gridPut(g, chord) {
    const end = chord.step + chord.len;
    const out = g.flatMap((c) => {
      const ce = c.step + c.len;
      if (ce <= chord.step || c.step >= end) return [c];
      const parts = [];
      if (c.step < chord.step) parts.push({ ...c, len: chord.step - c.step });
      if (ce > end) parts.push({ ...c, step: end, len: ce - end });
      return parts;
    });
    g.splice(0, g.length, ...out, chord);
    g.sort((a, b) => a.step - b.step);
    return chord;
  }
  /** Durée d'un accord : plus long, il prend sur les suivants ; plus court, le suivant commence plus tôt. */
  function setChordLen(sc, i, len) {
    const total = sc.bars * 16;
    editGrid(sc, (g) => {
      const c = g[i];
      len = Math.max(1, Math.min(len, total - c.step));
      const end = c.step + len;
      const next = g[i + 1];
      if (len < c.len && next) {
        next.len += next.step - end;
        next.step = end;
      } else
        for (let j = i + 1; g[j] && g[j].step < end; ) {
          const e = g[j].step + g[j].len;
          if (e <= end) g.splice(j, 1);
          else {
            g[j].len = e - end;
            g[j].step = end;
            j++;
          }
        }
      c.len = len;
      return c;
    });
  }
  const chordOf = (key, c) => HM().gridChord(key, c.degree, c.type, c.acc || 0, c.bass || 0);
  /** Fait entendre un accord sur la nappe (ou le clavier) du groupe. */
  function hearChord(c, elx) {
    const proj = listenProject();
    const pref = ['pad', 'keys', 'strings', 'guitar', 'arpchord'];
    const t = proj && (pref.map((r) => proj.tracks.find((x) => x.band && x.band.key.split(':')[0] === r)).find(Boolean) || proj.tracks.find((x) => x.type !== 'drum'));
    if (!t) return;
    SS.audio.preview(t, HM().voice(c, 60), 0.9);
    if (elx) {
      elx.classList.add('sounding');
      setTimeout(() => elx.classList.remove('sounding'), 450);
    }
  }
  /** Tonalité d'une scène : la nouvelle garde les degrés de la grille (comme dans Harmonie). */
  function setSceneKey(sc, k) {
    if (!S.wiz.grids[sc.sec]) S.wiz.grids[sc.sec] = specGrid(sc); // les accords gardent leurs degrés
    S.wiz.keys[sc.sec] = k;
    renderWiz();
  }

  function renderChords() {
    const { res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const sc = curScene(res);
    const k = sc.key;
    const total = sc.bars * 16;
    const g = gridOf(sc);
    const own = !!S.wiz.grids[sc.sec] || !!S.wiz.keys[sc.sec] || !!S.wiz.emos[sc.sec];
    const pct = (x) => `${((100 * x) / total).toFixed(3)}%`;
    const H = HM();
    // en-tête de la grille : tonalité, aimant, effacer, revenir à l'inspiration, trouver l'inspiration
    const tonic = h('select', { id: 'bwTonic', 'aria-label': 'Tonique', onchange: (e) => setSceneKey(sc, { tonic: e.target.value, mode: k.mode }) }, ...H.TONICS.map((t) => h('option', { value: t, selected: t === k.tonic }, H.french(t))));
    const mode = h('select', { id: 'bwMode', 'aria-label': 'Mode', onchange: (e) => setSceneKey(sc, { tonic: k.tonic, mode: e.target.value }) }, ...H.MODES.map((m) => h('option', { value: m.id, selected: m.id === k.mode }, m.label)));
    const snap = h('select', { id: 'bwSnap', onchange: (e) => ((S.wiz.snap = e.target.value), renderWiz()) }, ...SNAPS.map(([v, l]) => h('option', { value: v, selected: S.wiz.snap === v }, l)));
    const emo = S.wiz.emos[sc.sec] && SS.findEmotion(S.wiz.emos[sc.sec]);
    const head = h(
      'div',
      { class: 'bw-top gr-head bwc-head' },
      h('h3', {}, sc.name),
      h('span', { class: 'bh-info' }, `${sc.bars} mesures en 4/4` + (emo ? ` · ${emo.label}` : '')),
      h('span', { class: 'spacer' }),
      h('label', { class: 'field' }, h('span', {}, 'Tonalité'), tonic, mode),
      h('label', { class: 'field' }, h('span', {}, 'Aimanter'), snap),
      h('button', { type: 'button', class: 'btn btn-small', id: 'bwGridClear', title: 'Un seul accord, la tonique, sur toute la scène', onclick: () => editGrid(sc, (gg) => void gg.splice(0, gg.length, { step: 0, len: total, degree: 0, type: H.gridPalette(k).simple[0].type, acc: 0 })) }, 'Effacer'),
      own
        ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwGridBack', title: 'Revenir aux accords et à la tonalité de l’inspiration', onclick: () => (delete S.wiz.grids[sc.sec], delete S.wiz.keys[sc.sec], delete S.wiz.emos[sc.sec], (S.wiz.gsel = null), renderWiz()) }, '↺ Inspiration')
        : null,
      h('button', { type: 'button', class: 'btn btn-accent', id: 'bwInspBtn', title: 'Choisir un mode et une émotion, écouter des propositions d’accords', onclick: () => openInsp(sc) }, '✦ Trouver l’inspiration')
    );
    // la grille : règle (mesures, temps), accords en blocs
    const ruler = [];
    const lines = [];
    for (let b = 0; b < sc.bars; b++) {
      ruler.push(h('span', { class: 'gr-bar', style: `left:${pct(b * 16)};width:${pct(16)}` }, String(b + 1)));
      for (let q = 4; q < 16; q += 4) ruler.push(h('i', { style: `left:${pct(b * 16 + q)}` }));
      if (b) lines.push(h('div', { class: 'gr-bl', style: `left:${pct(b * 16)}` }));
      for (let q = 4; q < 16; q += 4) lines.push(h('div', { class: 'gr-bt', style: `left:${pct(b * 16 + q)}` }));
    }
    const blocks = g.map((gc, i) => {
      const c = chordOf(k, gc);
      const beats = gc.len / 4;
      return h(
        'div',
        {
          class: `gr-blk role-${c.role.id}${c.borrowed ? ' borrowed' : ''}${gc.len / total < 0.07 ? ' narrow' : ''}${S.wiz.gsel === i ? ' sel' : ''}`,
          'data-gi': i, tabindex: 0, style: `left:calc(${pct(gc.step)} + 2px);width:calc(${pct(gc.len)} - 4px)`,
          title: `${c.name} · ${c.numeral} · ${beats} temps — clic : écouter et choisir · glisser : déplacer · bord droit : allonger · Suppr : enlever`,
        },
        h('b', {}, c.name),
        h('small', {}, `${c.numeral} · ${beats % 1 ? beats.toFixed(1) : beats} t.`),
        h('span', { class: 'gr-rz', title: 'Allonger ou raccourcir' })
      );
    });
    const lane = h('div', { class: 'gr-lane', id: 'bwLane' }, ...lines, ...blocks);
    const tl = h('div', { class: 'gr-tl bw-gtl', 'data-scene': sc.id, 'data-bars': sc.bars, style: `min-width:${sc.bars * 56}px` }, h('div', { class: 'gr-ruler' }, ...ruler), lane, h('div', { class: 'gr-ph', id: 'bwGridPh', hidden: true }));
    // accord sélectionné : durée en temps, écouter, enlever
    const sel = g[S.wiz.gsel];
    let selBar = h('p', { class: 'dlg-hint bwc-hint' }, 'Clic sur un accord : l’écouter et régler sa durée · glisser : le déplacer · tirer son bord droit : l’allonger (aimanté) · glisser un accord de la palette sur la grille pour le poser.');
    if (sel) {
      const c = chordOf(k, sel);
      const durs = [[4, '1 temps'], [8, '2'], [12, '3'], [16, '4 temps'], [32, '2 mesures']];
      selBar = h(
        'div',
        { class: 'bwc-sel role-' + c.role.id, id: 'bwChordSel' },
        h('span', { class: 'bh-lbl' }, 'Accord'),
        h('b', {}, c.name),
        h('span', { class: 'bwc-role' }, `${c.numeral} · ${c.role.label}`),
        h('span', { class: 'bh-info' }, `mes. ${Math.floor(sel.step / 16) + 1}, temps ${Math.floor((sel.step % 16) / 4) + 1}`),
        h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
        h('span', { class: 'bh-lbl' }, 'Durée'),
        h(
          'span',
          { class: 'segmented bwc-dur', role: 'radiogroup', 'aria-label': 'Durée de l’accord' },
          ...durs.map(([len, label]) =>
            h('button', { type: 'button', role: 'radio', 'data-len': len, class: sel.len === len ? 'active' : '', 'aria-checked': String(sel.len === len), disabled: sel.step + len > total, onclick: () => setChordLen(sc, S.wiz.gsel, len) }, label)
          )
        ),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => hearChord(c) }, '▶ Écouter'),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwChordDel', disabled: g.length < 2, onclick: () => editGrid(sc, (gg) => void gg.splice(S.wiz.gsel, 1)) }, 'Enlever')
      );
    }
    // palette : accords de la tonalité (Simple : par rôle ; Avancé : 7, 9, sus…)
    const P = H.gridPalette(k);
    const tok = (c, small) =>
      h('span', { class: `gr-tok role-${c.role.id}${c.borrowed ? ' borrowed' : ''}${small ? ' small' : ''}`, 'data-gd': c.degree, 'data-gt': c.type, 'data-ga': c.acc || 0, title: `${c.name} · ${c.numeral} · ${c.notes.join(' ')} — clic : écouter, glisser : poser` }, h('b', {}, c.numeral), small ? null : h('span', {}, c.name));
    let pal;
    if (!gridAdv) {
      pal = h(
        'div',
        { class: 'gr-fams' },
        ...GFAMS.map((f) => ({ ...f, list: P.simple.filter((c) => c.role.id === f.id) }))
          .filter((f) => f.list.length)
          .map((f) => h('div', { class: 'gr-fam role-' + f.id, style: `flex:${Math.max(2, f.list.length)}` }, h('h5', {}, f.title, h('small', {}, f.sub)), h('div', { class: 'gr-toks' }, ...f.list.map((c) => tok(c)))))
      );
    } else {
      let sep = false;
      pal = h(
        'div',
        { class: 'gr-adv', style: `grid-template-columns:minmax(120px,1.3fr) repeat(${P.cols.length},1fr)` },
        h('div', { class: 'gr-adv-h' }, 'Degré'),
        ...P.cols.map((c) => h('div', { class: 'gr-adv-h' }, c.label)),
        ...P.rows.flatMap((r) => [
          r.borrowed && !sep ? ((sep = true), h('div', { class: 'gr-adv-sep' }, 'Emprunts au mineur harmonique (sensible) : la vraie dominante, qui appelle la tonique')) : null,
          h('div', { class: 'gr-adv-deg' }, tok(r.chord, true), h('strong', {}, r.chord.name), r.borrowed ? h('em', {}, 'emprunt') : null),
          ...r.cells.map((c) => (c ? h('span', { class: `gr-chip role-${c.role.id}${c.borrowed ? ' borrowed' : ''}`, 'data-gd': c.degree, 'data-gt': c.type, 'data-ga': c.acc || 0, title: `${c.name} · ${c.numeral} — clic : écouter, glisser : poser` }, c.name) : h('span', { class: 'gr-no' }, '·'))),
        ])
      );
    }
    const palette = h(
      'section',
      { class: 'bwc-pal' },
      h(
        'div',
        { class: 'gr-head' },
        h('div', { class: 'hm-lbl' }, `Accords de ${H.label(k)}`, h('span', { class: 'gr-hint' }, 'clic : écouter · glisser : poser sur la grille')),
        h(
          'span',
          { class: 'segmented gr-mode', role: 'radiogroup', 'aria-label': 'Palette' },
          h('button', { type: 'button', id: 'bwPalSimple', class: gridAdv ? '' : 'active', 'aria-pressed': String(!gridAdv), onclick: () => ((gridAdv = false), renderWiz()) }, 'Simple'),
          h('button', { type: 'button', id: 'bwPalAdv', class: gridAdv ? 'active' : '', 'aria-pressed': String(gridAdv), onclick: () => ((gridAdv = true), renderWiz()) }, 'Avancé · 7, 9, sus…')
        )
      ),
      pal
    );
    const content = h('div', { class: 'bwc', id: 'bwChords' }, head, h('div', { class: 'gr-scroll' }, tl), selBar, palette);
    content.addEventListener('pointerdown', (e) => gridDown(e, sc));
    content.addEventListener('keydown', (e) => {
      const blk = e.target.closest && e.target.closest('.gr-blk');
      if (!blk || !['Delete', 'Backspace'].includes(e.key) || gridOf(sc).length < 2) return;
      e.preventDefault();
      editGrid(sc, (gg) => void gg.splice(+blk.dataset.gi, 1));
    });
    const keep = $('.bwc', box);
    const top = keep ? keep.scrollTop : 0;
    splitView(sceneNav(res, sc, (x) => (S.wiz.emos[x.sec] ? SS.findEmotion(S.wiz.emos[x.sec]).label : S.wiz.grids[x.sec] ? 'accords modifiés' : null)), content);
    content.scrollTop = top;
  }

  /** Gestes sur la grille : clic (écouter, choisir), glisser (déplacer, poser depuis la palette), bord droit (durée). */
  function gridDown(e, sc) {
    if (e.button !== 0) return;
    const rz = e.target.closest('.gr-rz');
    const blk = e.target.closest('.gr-blk');
    const src = !blk && e.target.closest('[data-gd]');
    if (!rz && !blk && !src) return;
    e.preventDefault();
    const k = sc.key;
    const g = gridOf(sc);
    const total = sc.bars * 16;
    const unit = snapUnit();
    const lane = $('#bwLane');
    const stepAt = (x) => {
      const r = lane.getBoundingClientRect();
      return Math.max(0, Math.min(total - 1, Math.floor(((x - r.left) / r.width) * total)));
    };
    if (rz) {
      const i = +blk.dataset.gi;
      const gc = g[i];
      let len = gc.len;
      const move = (ev) => {
        const end = Math.min(total, Math.max(gc.step + unit, Math.round((stepAt(ev.clientX) + 1) / unit) * unit));
        len = end - gc.step;
        blk.style.width = `calc(${(len / total) * 100}% - 4px)`;
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        S.wiz.gsel = i;
        if (len !== gc.len) setChordLen(sc, i, len);
        else renderWiz();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      return;
    }
    const mi = blk ? +blk.dataset.gi : -1;
    const moving = blk ? g[mi] : null;
    const chord = moving ? { degree: moving.degree, type: moving.type, acc: moving.acc || 0, ...(moving.bass ? { bass: moving.bass } : {}) } : { degree: +src.dataset.gd, type: src.dataset.gt, acc: +src.dataset.ga };
    const len = moving ? moving.len : unit;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const elx = blk || src;
    let started = false;
    let target = null;
    const fly = h('div', { class: 'gr-fly' }, chordOf(k, chord).name);
    const ghost = h('div', { class: 'gr-ghost' });
    const inside = (x, y) => {
      const r = $('.bw-gtl').getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom + 24;
    };
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        started = true;
        el.append(fly);
        elx.classList.add('dragging');
      }
      fly.style.left = ev.clientX + 'px';
      fly.style.top = ev.clientY + 'px';
      if (inside(ev.clientX, ev.clientY)) {
        target = Math.floor(stepAt(ev.clientX) / unit) * unit;
        ghost.style.left = `calc(${(target / total) * 100}% + 2px)`;
        ghost.style.width = `calc(${(Math.min(len, total - target) / total) * 100}% - 4px)`;
        if (!ghost.parentNode) lane.append(ghost);
      } else {
        target = null;
        ghost.remove();
      }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      fly.remove();
      ghost.remove();
      elx.classList.remove('dragging');
      if (!started) {
        hearChord(chordOf(k, chord), elx);
        if (blk) {
          S.wiz.gsel = mi;
          renderWiz();
          const b = $(`#bwLane .gr-blk[data-gi="${mi}"]`);
          if (b) b.focus();
        }
        return;
      }
      if (target === null) return;
      editGrid(sc, (gg) => {
        if (moving) gg.splice(mi, 1);
        return gridPut(gg, { step: target, len: Math.min(len, total - target), ...chord });
      });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  /* ---------- Fenêtre « Trouver l'inspiration » ----------
   * Mode → émotion → propositions (les trois pistes de l'émotion, puis ses grilles de référence), transposées sur
   * la tonique de la scène. Une proposition choisie remplace la scène à l'écoute (lecture en boucle, au tempo du
   * bandeau) ; « Choisir » la pose dans la grille, avec sa tonalité et l'émotion ; Annuler laisse la scène intacte.
   */
  function openInsp(sc) {
    const md = SS.MODE_MOODS.find((m) => m.mode === sc.key.mode) || SS.MODE_MOODS.find((m) => m.mode === (HM().MODES.find((x) => x.id === sc.key.mode) || {}).fam) || SS.MODE_MOODS[4];
    const cur = S.wiz.emos[sc.sec] || sc.emotion;
    const emo = cur && md.emotions.includes(cur) ? cur : SS.emotionMode(cur) ? cur : md.emotions[0];
    S.wiz.insp = { sec: sc.sec, mode: (SS.emotionMode(emo) || md).mode, emo, refs: false, pick: -1, preview: null, tonic: sc.key.tonic, bars: sc.bars, keepTempo: false };
    renderWiz();
  }
  function closeInsp() {
    S.wiz.insp = null;
    renderWiz();
  }
  /** Propositions d'une émotion sur la tonique `tonic` : { kind, key, chords, grid (1 accord par mesure, ou les mesures de la grille), why, tempo }. */
  function inspOptions(emoId, tonic) {
    const H = HM();
    const emo = SS.findEmotion(emoId);
    const props = emo.proposals.map((pr) => {
      const k = { tonic, mode: pr.mode };
      const chords = pr.seq.map(([d, t, a]) => H.makeChord(k, d, t, a || 0));
      const grid = chords.map((c) => H.toGridChord(k, c, c.degree)).filter(Boolean);
      return { kind: pr.kind, label: SS.EMOTION_KINDS[pr.kind], key: k, chords, grid, tempo: pr.tempo || null, why: SS.fillEmotionText(pr.why, chords, k.tonic, H.french) };
    });
    const refs = SS.libraryFor(emoId).map((e) => {
      const { key: k, grid, chords } = SS.libraryGrid(e, tonic);
      const src = SS.EMOTION_SOURCES && SS.EMOTION_SOURCES[e.src];
      const why = src ? `Source : ${src.name}${e.n ? `, fiche ${e.n}` : ''}${e.mood ? ` · ${e.stated ? 'émotion annoncée' : 'interprétation'} : ${e.mood}` : ''}` : '';
      return { kind: 'ref', label: e.label, key: k, chords, grid, tempo: e.tempo || null, why };
    });
    return { props, refs };
  }
  /** Une proposition répétée sur toute la scène (un accord par mesure, ou les mesures de la grille de référence). */
  function fitProposal(pr, bars) {
    const total = bars * 16;
    const out = [];
    for (let at = 0, i = 0; at < total && pr.grid.length; i++) {
      const { bars: b = 1, ...c } = pr.grid[i % pr.grid.length];
      const len = Math.max(4, Math.round(b * 16));
      out.push({ step: at, len: Math.min(len, total - at), degree: c.degree, type: c.type, acc: c.acc || 0, ...(c.bass ? { bass: c.bass } : {}) });
      at += len;
    }
    return out;
  }
  function inspList() {
    const w = S.wiz.insp;
    const o = inspOptions(w.emo, w.tonic);
    return w.refs ? o.refs : o.props;
  }
  function pickInsp(i) {
    const w = S.wiz.insp;
    const pr = inspList()[i];
    if (!pr) return;
    w.pick = i;
    w.preview = { sec: w.sec, key: pr.key, grid: fitProposal(pr, w.bars), emo: w.emo };
    w.tempo = pr.tempo;
    renderWiz();
    const sc = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === w.sec);
    if (sc && !(L.mode === 'scene' && L.sec === w.sec && !L.paused)) playScene(sc.id);
  }
  function chooseInsp() {
    const w = S.wiz.insp;
    if (!w || !w.preview) return;
    const pv = w.preview;
    S.wiz.grids[pv.sec] = pv.grid;
    S.wiz.keys[pv.sec] = pv.key;
    S.wiz.emos[pv.sec] = pv.emo;
    S.wiz.gsel = null;
    S.wiz.insp = null;
    if (w.keepTempo && w.tempo) setTempo(w.tempo);
    else renderWiz();
  }

  function renderInsp() {
    let box = $('#bwInsp');
    const w = S.wiz && S.wiz.step === ST.chords && S.wiz.insp;
    if (!w) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = h('div', { class: 'bw-insp', id: 'bwInsp' });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeInsp();
        }
      });
      el.querySelector('.band-shell').append(box);
    }
    const res = S.wiz.res;
    const sc = res && res.scenes.find((x) => x.sec === w.sec);
    if (!sc) return closeInsp();
    const H = HM();
    const m = SS.MODE_MOODS.find((x) => x.mode === w.mode) || SS.MODE_MOODS[0];
    const o = inspOptions(w.emo, w.tonic);
    const list = w.refs ? o.refs : o.props;
    const pr = list[w.pick];
    const playing = L.mode === 'scene' && L.sec === w.sec && !L.paused;
    const card = (x, i) =>
      h(
        'div',
        {
          class: 'hm-ex pick' + (x.kind === 'ref' ? ' ref' : '') + (i === w.pick ? ' on' : ''), role: 'radio', tabindex: 0, 'aria-checked': String(i === w.pick), 'data-pick': i,
          onclick: () => pickInsp(i),
          onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickInsp(i)),
        },
        h(
          'div',
          { class: 'hm-ex-top' },
          h('span', { class: `emo-kind k-${x.kind}` }, x.kind === 'ref' ? 'Référence' : x.label),
          x.kind === 'ref' ? h('b', { class: 'hm-ref-l' }, x.label) : null,
          h('span', { class: 'hm-ex-meta' }, H.label(x.key) + (x.tempo ? ` · ${x.tempo} BPM` : '')),
          h('span', { class: 'hm-ex-btns' }, h('span', { class: 'bwi-state' }, i === w.pick ? (playing ? '♪ en écoute' : 'choisie') : '▶ écouter'))
        ),
        h('div', { class: 'hm-progchords' }, ...x.chords.map((c) => h('span', { class: `hm-step role-${c.role.id}${c.borrowed ? ' borrowed' : ''}`, title: c.notes.join('–') }, h('b', {}, c.numeral), c.name))),
        x.why ? h('p', { class: 'hm-why' }, x.why) : null
      );
    const card0 = h(
      'div',
      { class: 'bwi-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bwiTitle' },
      h(
        'header',
        { class: 'bwi-head' },
        h('h3', { id: 'bwiTitle' }, '✦ Trouver l’inspiration'),
        h('span', { class: 'bh-info' }, `pour « ${sc.name} » · ${sc.bars} mesures`),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-icon', id: 'bwiClose', 'aria-label': 'Fermer sans rien changer', title: 'Fermer sans rien changer', onclick: closeInsp, html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' })
      ),
      h(
        'div',
        { class: 'bwi-bar' },
        h('button', { type: 'button', class: 'btn bt-btn bt-play' + (playing ? ' on' : ''), id: 'bwiPlay', title: playing ? 'Pause' : 'Écouter la scène en boucle', 'aria-label': playing ? 'Pause' : 'Écouter la scène en boucle', html: playing ? PAUSE : PLAY, onclick: () => {
            const here = L.mode === 'scene' && L.sec === w.sec;
            if (here && !L.paused) {
              SS.audio.pause();
              L.paused = true;
            } else if (here && L.paused) {
              L.paused = false;
              SS.audio.resume();
            } else playScene(sc.id);
            renderWiz();
          } }),
        h('button', { type: 'button', class: 'btn bt-btn bt-stop', id: 'bwiStop', title: 'Stop', 'aria-label': 'Stop', html: STOP, disabled: !L.mode, onclick: () => (stopListen(), renderWiz()) }),
        h('span', { class: 'bh-info' }, pr ? `Écoute : ${pr.chords.map((c) => c.name).join(' – ')}` : 'Choisis une proposition pour l’écouter dans la scène'),
        h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'bt-field' },
          h('span', { class: 'bt-label' }, 'Tempo'),
          h(
            'span',
            { class: 'bt-tempo' },
            h('button', { type: 'button', 'aria-label': 'Ralentir', onclick: () => setTempo(tempo() - 1) }, '−'),
            h('input', { type: 'number', id: 'bwiTempo', min: TEMPO_MIN, max: TEMPO_MAX, value: tempo(), 'aria-label': 'Tempo en BPM', onchange: (e) => setTempo(e.target.value) }),
            h('button', { type: 'button', 'aria-label': 'Accélérer', onclick: () => setTempo(tempo() + 1) }, '+')
          ),
          h('span', { class: 'bt-unit' }, 'BPM')
        ),
        pr && pr.tempo && pr.tempo !== tempo() ? h('button', { type: 'button', class: 'bt-orig', id: 'bwiTempoAdv', title: 'Prendre le tempo conseillé pour cette émotion', onclick: () => setTempo(pr.tempo) }, `conseillé ${pr.tempo}`) : null
      ),
      h(
        'div',
        { class: 'bwi-body' },
        h(
          'div',
          { class: 'bwi-row' },
          h('span', { class: 'bh-lbl' }, 'Mode'),
          ...SS.MODE_MOODS.map((x) =>
            h('button', { type: 'button', class: 'chip' + (x.mode === w.mode ? ' active' : ''), 'data-mode': x.mode, 'aria-pressed': String(x.mode === w.mode), title: x.mood, onclick: () => ((w.mode = x.mode), (w.emo = x.emotions[0]), (w.pick = -1), (w.preview = null), renderWiz()) }, x.name.replace(/ \(.*\)/, ''), h('small', {}, x.mood))
          )
        ),
        h(
          'div',
          { class: 'bwi-row' },
          h('span', { class: 'bh-lbl' }, 'Émotion'),
          ...m.emotions.map((id) =>
            h('button', { type: 'button', class: 'chip emo-chip' + (id === w.emo ? ' active' : ''), 'data-emo': id, 'aria-pressed': String(id === w.emo), onclick: () => ((w.emo = id), (w.pick = -1), (w.preview = null), renderWiz()) }, SS.findEmotion(id).label, h('small', {}, String(SS.libraryFor(id).length + 3)))
          )
        ),
        h(
          'div',
          { class: 'bwi-row' },
          h('span', { class: 'bh-lbl' }, 'Propositions'),
          h(
            'span',
            { class: 'segmented', role: 'radiogroup', 'aria-label': 'Propositions' },
            h('button', { type: 'button', id: 'bwiProps', class: w.refs ? '' : 'active', onclick: () => ((w.refs = false), (w.pick = -1), (w.preview = null), renderWiz()) }, '3 pistes'),
            h('button', { type: 'button', id: 'bwiRefs', class: w.refs ? 'active' : '', disabled: !o.refs.length, onclick: () => ((w.refs = true), (w.pick = -1), (w.preview = null), renderWiz()) }, `Grilles de référence · ${o.refs.length}`)
          ),
          h('span', { class: 'dlg-hint' }, 'Clic sur une proposition : elle remplace la scène à l’écoute.')
        ),
        h('div', { class: 'bwi-props', role: 'radiogroup', 'aria-label': 'Propositions d’accords' }, ...list.map(card))
      ),
      h(
        'footer',
        { class: 'bwi-foot' },
        h('label', { class: 'emo-opt' }, h('input', { type: 'checkbox', id: 'bwiKeep', checked: w.keepTempo, onchange: (e) => (w.keepTempo = e.target.checked) }), ' Garder le tempo conseillé'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn', id: 'bwiCancel', onclick: closeInsp }, 'Annuler'),
        h('button', { type: 'button', class: 'btn btn-accent', id: 'bwiChoose', disabled: !pr, onclick: chooseInsp }, pr ? `Choisir : ${pr.chords.map((c) => c.name).join(' – ')}` : 'Choisir')
      )
    );
    const scroll = $('.bwi-body', box);
    const top = scroll ? scroll.scrollTop : 0;
    const focus = document.activeElement && box.contains(document.activeElement) ? document.activeElement.id || document.activeElement.dataset.pick : null;
    box.replaceChildren(card0);
    $('.bwi-body', box).scrollTop = top;
    const f = focus && ($('#' + CSS.escape(focus), box) || $(`[data-pick="${focus}"]`, box));
    (f || $('#bwiClose', box)).focus();
  }

  /** Notes par phrase proposées : libre (selon le rythme), puis de 2 à 12 (comme des pieds par vers). */
  const NOTE_STEPS = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  /**
   * En-tête de l'étape Mélodie, pour la scène choisie : caractère et notes par phrase (propres à la scène),
   * relancer la scène, réglages fins (panneau, pour toute la chanson).
   */
  function melodyBar(has, sc) {
    if (!has) return [h('div', { class: 'bw-actions' }, h('span', { class: 'bw-seed' }, 'Ce groupe n’a ni lead ni voix : pas de mélodie à générer. Ajoute un musicien à l’étape 1.'))];
    const m = S.mel;
    const ch = charOf(sc.sec);
    const notes = notesOf(sc.sec);
    const setOwn = (k, v) => {
      S.wiz.chars[sc.sec] = { character: charOf(sc.sec), notes: notesOf(sc.sec), [k]: v };
      renderWiz();
    };
    const ni = Math.max(0, NOTE_STEPS.indexOf(notes));
    const seeds = S.wiz.pseeds[sc.sec];
    // émotion de la scène (étape Accords) → profil mélodique : caractère conseillé et badge
    const emoId = m.profile !== 'off' ? S.wiz.emos[sc.sec] : null;
    const prof = emoId && SS.resolveMelodyProfile ? SS.resolveMelodyProfile(emoId, {}, sc.key) : null;
    return [
      prof
        ? h('span', { class: 'bh-emo', id: 'bwEmoBadge', title: SS.melodyProfileSummary(prof).map((c) => `${c.k} : ${c.v}`).join(' · ') }, 'Émotion ', h('b', {}, SS.findEmotion(emoId).label), ' → profil ', h('b', {}, prof.name))
        : null,
      h('span', { class: 'bh-lbl' }, 'Caractère', h('small', {}, `de « ${sc.name} »`)),
      h(
        'span',
        { class: 'segmented bh-chars', role: 'radiogroup', 'aria-label': `Caractère de la mélodie de « ${sc.name} »`, id: 'bwChars' },
        ...Object.entries(BS().CHARACTERS).map(([id, c]) =>
          h('button', { type: 'button', role: 'radio', class: 'bh-char' + (ch === id ? ' active' : ''), 'data-v': id, 'aria-checked': String(ch === id), title: c.hint + (prof && prof.character === id ? ' — conseillé pour cette émotion' : ''), onclick: () => setOwn('character', id) }, c.label, prof && prof.character === id ? h('small', { class: 'bh-rec' }, 'conseillé') : null)
        )
      ),
      h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
      h('span', { class: 'bh-lbl' }, 'Notes par phrase'),
      h(
        'span',
        { class: 'bt-tempo bh-notes', id: 'bwNotes', title: 'Comme des pieds par vers : 8 = octosyllabe, 12 = alexandrin. Libre : selon le rythme.' },
        h('button', { type: 'button', id: 'bwNotesLess', 'aria-label': 'Moins de notes par phrase', disabled: ni === 0, onclick: () => setOwn('notes', NOTE_STEPS[ni - 1]) }, '−'),
        h('output', { id: 'bwNotesVal', 'aria-live': 'polite' }, notes ? `${notes} notes` : 'Libre'),
        h('button', { type: 'button', id: 'bwNotesMore', 'aria-label': 'Plus de notes par phrase', disabled: ni === NOTE_STEPS.length - 1, onclick: () => setOwn('notes', NOTE_STEPS[ni + 1]) }, '+')
      ),
      h('span', { class: 'spacer' }),
      h(
        'button',
        {
          type: 'button', class: 'btn btn-accent', id: 'bwMelody', title: `Une autre mélodie pour « ${sc.name} » : ses phrases changent, leurs longueurs et silences restent`,
          onclick: () => {
            const sd = (S.wiz.pseeds[sc.sec] = { ...(S.wiz.pseeds[sc.sec] || {}) });
            ['A', 'B', 'C'].forEach((l) => (sd[l] = (sd[l] || 0) + 1));
            renderWiz();
          },
        },
        '🎲 Relancer la scène'
      ),
      seeds ? h('span', { class: 'bw-seed', id: 'bwSeed' }, `n° ${Math.max(...Object.values(seeds)) + 1}`) : null,
      h(
        'span',
        { class: 'bh-fine' },
        h('button', { type: 'button', class: 'btn' + (m.fine ? ' on' : ''), id: 'bwMelFine', 'aria-expanded': String(!!m.fine), onclick: () => ((m.fine = !m.fine), renderWiz()) }, '⚙ Réglages fins'),
        m.fine ? melodyForm() : null
      ),
    ];
  }

  const PMODES = [
    ['on', '♪', 'Joue'],
    ['hold', '━', 'Tenue', 'Un court motif, puis la dernière note tenue jusqu’au bout de la phrase'],
    ['off', '∅', 'Silence'],
  ];
  /** Rôle d'une phrase, d'après sa lettre : A pose la question, ′ répond, B contraste, C apporte du neuf. */
  const phraseRole = (p) => (p.mode === 'off' ? 'Silence' : p.letter.includes('′') ? 'Réponse' : p.letter[0] === 'B' ? 'Contraste' : p.letter[0] === 'C' ? 'Nouveau' : 'Question');

  /**
   * Ligne « Phrases » de la scène : une carte par phrase, calée sur les mesures, qui se règle sur place —
   * motif (lettre : même lettre = même motif, ′ = fin variée), jeu (joue / tenue / silence), longueur (− / +), 🎲.
   * Une carte étroite (phrase courte) se replie à l'essentiel.
   */
  function phraseRow(sc, pct, head, row) {
    const plan = scenePlan(sc);
    const L = BS().LETTERS;
    let at = 0;
    const cards = plan.map((p, i) => {
      const start = at;
      at += p.bars;
      const rest = plan.slice(i).reduce((a, q) => a + q.bars, 0);
      const mini = p.bars / sc.bars < 0.25;
      const where = `mes. ${start + 1}${p.bars > 1 ? '–' + (start + p.bars) : ''}`;
      const base = p.letter[0];
      const letter = h(
        'button',
        { type: 'button', class: 'bh-pl', title: 'Motif de la phrase (clic : le suivant). Même lettre = même motif ; ′ = la fin varie.', 'aria-label': `Phrase ${i + 1}, motif ${p.letter}`, onclick: () => setPlan(sc, (pl) => (pl[i].letter = L[(L.indexOf(pl[i].letter) + 1) % L.length])) },
        p.letter
      );
      const modes = h(
        'span',
        { class: 'segmented bh-pmode', role: 'radiogroup', 'aria-label': `Jeu de la phrase ${i + 1}` },
        ...PMODES.map(([v, g, t, tip]) =>
          h('button', { type: 'button', role: 'radio', 'data-v': v, class: p.mode === v ? 'active' : '', 'aria-checked': String(p.mode === v), title: tip || t, 'aria-label': t, onclick: () => setPlan(sc, (pl) => (pl[i].mode = v)) }, mini ? g : t.toLowerCase())
        )
      );
      const len = h(
        'span',
        { class: 'bh-step', title: 'Longueur de la phrase. Plus courte : la place libérée devient un silence ; plus longue : elle prend sur les phrases suivantes.' },
        h('button', { type: 'button', class: 'bh-pminus', 'aria-label': `Raccourcir la phrase ${i + 1}`, disabled: p.bars <= 1, onclick: () => setPhraseBars(sc, i, p.bars - 1) }, '−'),
        h('span', { class: 'bh-plen' }, mini ? String(p.bars) : `${p.bars} mes.`),
        h('button', { type: 'button', class: 'bh-pplus', 'aria-label': `Allonger la phrase ${i + 1}`, disabled: p.bars >= rest, onclick: () => setPhraseBars(sc, i, p.bars + 1) }, '+')
      );
      const roll =
        p.mode === 'off'
          ? null
          : h(
              'button',
              {
                type: 'button', class: 'bh-proll', title: `Un autre motif pour les phrases ${base} de cette scène`, 'aria-label': `Relancer les phrases ${base}`,
                onclick: () => {
                  const sd = (S.wiz.pseeds[sc.sec] = S.wiz.pseeds[sc.sec] || {});
                  sd[base] = (sd[base] || 0) + 1;
                  renderWiz();
                },
              },
              '🎲'
            );
      return h(
        'div',
        { class: `bh-phr ${p.mode}` + (mini ? ' mini' : ''), 'data-i': i, 'data-mode': p.mode, style: `left:${pct(start * 16)};width:calc(${pct(p.bars * 16)} - 4px)` },
        h('div', { class: 'bh-ptop' }, letter, mini ? null : h('small', {}, `${phraseRole(p)}${p.mode === 'hold' ? ', note tenue' : ''} · ${where}`)),
        h('div', { class: 'bh-prow' }, modes),
        h('div', { class: 'bh-prow' }, len, roll)
      );
    });
    const own = !!S.wiz.plans[sc.sec] || !!S.wiz.pseeds[sc.sec];
    const playing = plan.reduce((a, q) => a + (q.mode === 'off' ? 0 : q.bars), 0);
    return row(
      'bh-phrases',
      head(
        'bh-phead',
        h('b', {}, 'Phrases'),
        h('small', {}, `${plan.map((p) => (p.mode === 'off' ? '·' : p.letter)).join(' ')} · ${playing} / ${sc.bars} mes.`),
        own ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwPhrReset', title: 'Revenir au découpage par défaut de cette scène', onclick: () => (delete S.wiz.plans[sc.sec], delete S.wiz.pseeds[sc.sec], renderWiz()) }, '↺ Par défaut') : null
      ),
      ...cards
    );
  }

  /** Menu « Pistes » : une case par piste (la batterie en une seule) ; la mélodie reste affichée. */
  function tracksMenu(cols, melIds) {
    const entries = [];
    const drums = cols.filter((c) => c.o.type === 'drum');
    cols.forEach((c) => {
      if (c.o.type === 'drum') {
        if (c === drums[0]) entries.push({ ids: drums.map((d) => d.id), name: 'Batterie', color: c.o.color });
      } else entries.push({ ids: [c.id], name: c.o.name, color: c.o.color, mel: melIds.has(c.id) });
    });
    const shownN = entries.filter((e) => e.mel || !e.ids.every((id) => S.hide.has(id))).length;
    const redraw = () => {
      S.tracksOpen = true;
      renderHarmony();
    };
    const box = h(
      'details',
      { class: 'bh-tracks', id: 'bwTracks' },
      h('summary', { class: 'btn btn-small', title: 'Choisir les pistes d’accompagnement affichées (la mélodie reste affichée)' }, `Pistes · ${shownN} / ${entries.length}`),
      h(
        'div',
        { class: 'bh-tpop', id: 'bwTracksPop' },
        ...entries.map((e) => {
          const cb = h('input', { type: 'checkbox', 'data-ids': e.ids.join(' '), disabled: !!e.mel });
          cb.checked = e.mel || !e.ids.every((id) => S.hide.has(id));
          cb.addEventListener('change', () => {
            e.ids.forEach((id) => (cb.checked ? S.hide.delete(id) : S.hide.add(id)));
            redraw();
          });
          return h('label', { class: e.mel ? 'mel' : '' }, cb, h('i', { style: `--c:${e.color}` }), h('span', {}, e.name), e.mel ? h('small', {}, 'mélodie') : null);
        }),
        h(
          'div',
          { class: 'bh-tbtns' },
          h('button', { type: 'button', class: 'btn btn-small', id: 'bwTracksAll', onclick: () => (S.hide.clear(), redraw()) }, 'Tout'),
          h('button', { type: 'button', class: 'btn btn-small', id: 'bwTracksMel', onclick: () => (cols.forEach((c) => !melIds.has(c.id) && S.hide.add(c.id)), redraw()) }, 'Aucune')
        )
      )
    );
    box.open = !!S.tracksOpen;
    box.addEventListener('toggle', () => (S.tracksOpen = box.open));
    return box;
  }

  /* ---------- Muet / Solo / volume (étape Mélodie) ---------- */
  /** La colonne ne s'entend pas : coupée, ou une autre est en solo. */
  function silenced(id) {
    return S.wiz.mute.has(id) || (S.wiz.solo.size > 0 && !S.wiz.solo.has(id));
  }
  function msBtns(ids, label) {
    const m = ids.every((id) => S.wiz.mute.has(id));
    const s = ids.every((id) => S.wiz.solo.has(id));
    return h(
      'span',
      { class: 'bw-ms' },
      h('button', { type: 'button', class: 'bw-m' + (m ? ' on' : ''), 'aria-pressed': String(m), title: `Muet : couper ${label}`, 'aria-label': `Muet ${label}`, onclick: () => toggleMS(S.wiz.mute, ids) }, 'M'),
      h('button', { type: 'button', class: 'bw-s' + (s ? ' on' : ''), 'aria-pressed': String(s), title: `Solo : écouter ${label} seul`, 'aria-label': `Solo ${label}`, onclick: () => toggleMS(S.wiz.solo, ids) }, 'S')
    );
  }
  const VOL_MIN = -30;
  const VOL_MAX = 6;
  const volDb = (id) => S.wiz.vol.get(id) || 0;
  const volText = (db) => (db <= VOL_MIN ? 'silence' : `${db > 0 ? '+' : ''}${db} dB`);
  /** Volume d'un instrument (ou de toute la batterie) en dB autour du mixage automatique ; double-clic : 0 dB. */
  function volCtl(ids, label) {
    const db = volDb(ids[0]);
    const inp = h('input', { type: 'range', class: 'bh-vol', min: VOL_MIN, max: VOL_MAX, step: 1, value: db, 'aria-label': `Volume ${label}`, title: `Volume ${label} : ${volText(db)} (double-clic : 0 dB)` });
    const set = (v) => {
      const x = Math.round(Number(v));
      ids.forEach((id) => (x ? S.wiz.vol.set(id, x) : S.wiz.vol.delete(id)));
      inp.value = x;
      inp.title = `Volume ${label} : ${volText(x)} (double-clic : 0 dB)`;
      inp.setAttribute('aria-valuetext', volText(x));
      applyListenMutes();
    };
    inp.setAttribute('aria-valuetext', volText(db));
    inp.addEventListener('input', () => set(inp.value));
    inp.addEventListener('dblclick', () => set(0));
    return inp;
  }
  /** Gain d'une colonne (multiplie le niveau du mixage automatique). */
  function volGain(id) {
    const db = volDb(id);
    return db <= VOL_MIN ? 0 : Math.pow(10, db / 20);
  }

  /** Affiche l'étape en cours de l'assistant. */
  function renderWiz() {
    const step = S.wiz.step;
    el.classList.add('wizard');
    el.querySelectorAll('.wiz-only').forEach((x) => (x.hidden = false));
    $('#bandTitle').firstChild.textContent = 'Nouvelle chanson ';
    renderWizSteps();
    // bandeau de lecture : sous le titre (étapes 2 et 5), à droite de la colonne des scènes (étapes 3 et 4)
    const body = el.querySelector('.band-body');
    const tr = $('#bwTransport');
    if (tr.nextElementSibling !== body) body.before(tr);
    $('#bandWiz').classList.remove('bw-split');
    body.hidden = step !== 1;
    $('#bandWiz').hidden = step === 1;
    $('#bandGm').hidden = step !== 1;
    tr.hidden = step === 1;
    if (step === 1) refresh();
    else {
      if (step === ST.harm) renderHarmony();
      else if (step === ST.chords) renderChords();
      else renderWizGrid();
      wizFoot();
      relisten();
      markListen();
    }
    renderInsp();
  }

  /** Boutons du pied de la fenêtre selon l'étape. */
  function wizFoot() {
    const step = S.wiz.step;
    $('#bwEmpty').hidden = step !== 1 || !S.wiz.fresh;
    $('#bwBack').hidden = step === 1;
    $('#bwNext').hidden = step === ST.pick;
    $('#bwNext').disabled = !canGo(step + 1);
    $('#bwNext').title = step < ST.pick ? (canGo(step + 1) ? `${STEPS[step].label} : ${STEPS[step].hint.toLowerCase()}` : cover() && !spec() ? 'Corrige la reprise (parties, accords, ordre)' : 'Choisis au moins un musicien') : '';
    $('#bwCreate').hidden = step !== ST.pick;
    const kept = step === ST.pick ? wizCols().filter((c) => !S.wiz.off.has(c.id)).length : 0;
    $('#bwCreate').disabled = step === ST.pick && !kept;
    $('#bwCount').hidden = step !== ST.pick;
    $('#bwCount').textContent = kept ? `${kept} piste${kept > 1 ? 's' : ''} à importer` : 'Aucune piste cochée';
    renderWizSteps();
  }

  /** Crée la chanson avec les pistes cochées (même calcul que la vue session, même mélodie). */
  function createWizSong(confirmed) {
    const cols = wizCols().filter((c) => !S.wiz.off.has(c.id));
    if (!cols.length) return;
    // projet déjà commencé (bouton Nouvelle de l'en-tête) : la chanson le remplace, on demande d'abord
    if (confirmed !== true && app.project().tracks.length) return showSongConfirm(cols.length);
    const p = preset();
    const seed = S.wiz.seed;
    hideConfirm();
    el.close('ok');
    // volumes réglés à l'étape Mélodie : appliqués au mixage automatique de la chanson créée
    const plan = cover() ? { ...p, spec: spec(), cover: { title: S.cover.title.trim() || 'Reprise' } } : p;
    app.applySong(cols.map((c) => c.o), plan, tempo(), { melodySeed: seed, melody: melodyOpts(), harmony: harmonyOpts(), gains: cols.map((c) => volGain(c.id)) });
  }

  /* ---------- Bandeau de commande (étapes 2 à 4) ----------
   * Lecture / pause de la chanson (ou de la scène qu'on écoute en boucle), stop, position, tempo et tonalité.
   * Le tempo vaut pour l'écoute et pour « Créer la chanson » ; il revient à celui de l'inspiration si on en change.
   */
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 240;
  /** Le tempo du bandeau vaut pour cette inspiration (ou pour la reprise). */
  const tempoKey = () => (cover() ? 'cover' : preset().id);
  /** Tempo de la chanson : celui choisi dans le bandeau, sinon celui de l'inspiration (ou de la reprise). */
  function tempo() {
    const p = preset();
    const base = cover() ? S.cover.tempo : p.tempo;
    return S.wiz && S.wiz.tempo && S.wiz.tempoFor === tempoKey() ? S.wiz.tempo : base;
  }
  function setTempo(v) {
    if (!S.wiz) return;
    const t = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Number(v) || tempo())));
    S.wiz.tempo = t;
    S.wiz.tempoFor = tempoKey();
    if (L.proj) L.proj.tempo = t; // la lecture en cours prend le nouveau tempo au pas suivant
    const inp = $('#bwTempo');
    if (inp) inp.value = t; // valeur bornée, même pendant la saisie
    renderWiz();
  }

  /** Construit le bandeau une fois (init) ; updateTransport en met à jour l'état. */
  function buildTransport() {
    const box = $('#bwTransport');
    const btn = (id, label, html, onclick, cls = '') =>
      h('button', { type: 'button', id, class: 'btn bt-btn ' + cls, title: label, 'aria-label': label, html, onclick });
    const input = h('input', {
      type: 'number', id: 'bwTempo', min: TEMPO_MIN, max: TEMPO_MAX, step: 1, 'aria-label': 'Tempo en BPM',
      onchange: (e) => setTempo(e.target.value),
      onkeydown: (e) => e.key === 'Enter' && setTempo(e.target.value),
    });
    box.replaceChildren(
      btn('bwPlay', 'Lecture', PLAY, togglePlay, 'bt-play'),
      btn('bwStop', 'Stop', STOP, () => stopListen(), 'bt-stop'),
      h('div', { class: 'bt-pos', 'aria-live': 'off' }, h('b', { id: 'bwPos' }, '1 . 1 . 1'), h('small', { id: 'bwPosInfo' }, 'À l’arrêt')),
      h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'bt-field' },
        h('span', { class: 'bt-label' }, 'Tempo'),
        h(
          'span',
          { class: 'bt-tempo' },
          h('button', { type: 'button', id: 'bwSlower', 'aria-label': 'Ralentir', title: 'Ralentir (−1 BPM)', onclick: () => setTempo(tempo() - 1) }, '−'),
          input,
          h('button', { type: 'button', id: 'bwFaster', 'aria-label': 'Accélérer', title: 'Accélérer (+1 BPM)', onclick: () => setTempo(tempo() + 1) }, '+')
        ),
        h('span', { class: 'bt-unit' }, 'BPM'),
        h('button', { type: 'button', id: 'bwTempoBack', class: 'bt-orig', title: 'Revenir au tempo de l’inspiration', onclick: () => setTempo(preset().tempo) })
      ),
      h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
      h('div', { class: 'bt-field' }, h('span', { class: 'bt-label' }, 'Tonalité'), h('span', { class: 'bt-key', id: 'bwKey' }, h('b', {}), h('small', {})))
    );
  }

  /** Lecture : reprend après une pause, sinon joue la chanson (depuis le début) ; en lecture : pause. */
  function togglePlay() {
    if (L.mode && !L.paused) {
      SS.audio.pause();
      L.paused = true;
    } else if (L.mode && L.paused) {
      L.paused = false;
      SS.audio.resume();
    } else if (sceneStep()) playScene(S.wiz.hscene);
    else listenSong(0);
    markListen();
  }

  function updateTransport() {
    if (!S.wiz || !$('#bwTransport')) return;
    const { res } = wizSong();
    const playing = !!L.mode && !L.paused;
    const play = $('#bwPlay');
    play.classList.toggle('on', playing);
    if (play.dataset.icon !== String(playing)) {
      play.innerHTML = playing ? PAUSE : PLAY;
      play.dataset.icon = String(playing);
    }
    play.setAttribute('aria-pressed', String(playing));
    play.title = playing ? 'Pause' : L.paused ? 'Reprendre' : sceneStep() ? 'Écouter la scène en boucle' : 'Écouter la chanson';
    play.setAttribute('aria-label', play.title);
    $('#bwStop').disabled = !L.mode;
    const t = tempo();
    const inp = $('#bwTempo');
    if (document.activeElement !== inp) inp.value = t;
    const orig = preset().tempo;
    const back = $('#bwTempoBack');
    back.hidden = t === orig;
    back.textContent = `origine ${orig}`;
    const sc = res && L.scene ? res.scenes.find((x) => x.id === L.scene) : null;
    if (sc && L.step >= 0) {
      const st = L.step % (sc.bars * 16);
      $('#bwPos').textContent = `${Math.floor(st / 16) + 1} . ${Math.floor((st % 16) / 4) + 1} . ${(st % 4) + 1}`;
    } else if (!L.mode) $('#bwPos').textContent = '1 . 1 . 1';
    $('#bwPosInfo').textContent = sc ? `${sc.name}${L.mode === 'scene' ? ' · en boucle' : ''}${L.paused ? ' · en pause' : ''}` : 'À l’arrêt';
    // tonalité : celle de la scène qu'on entend (ou qu'on regarde à l'étape Mélodie), sinon celle de la chanson
    const shown = sc || (res && sceneStep() ? res.scenes.find((x) => x.id === S.wiz.hscene) : null);
    const key = (shown && shown.key) || (res && res.key);
    const kb = $('#bwKey');
    kb.firstChild.textContent = key ? SS.harmony.label(key) : '—';
    kb.lastChild.textContent = key ? keyInfo(key) : '';
  }

  /** « 3 ♭ · i = Cm » : armure (gamme de référence) et accord de tonique. */
  function keyInfo(key) {
    const H = SS.harmony;
    try {
      const m = H.MODES.find((x) => x.id === key.mode);
      const ref = H.scale({ tonic: key.tonic, mode: m && m.fam === 'major' ? 'major' : 'minor' });
      const fl = ref.filter((d) => d.name.includes('♭')).length;
      const sh = ref.filter((d) => d.name.includes('♯')).length;
      const sig = fl ? `${fl} ♭` : sh ? `${sh} ♯` : 'sans altération';
      const tonic = H.chords(key).diatonic[0];
      return `${sig} · ${tonic.numeral} = ${tonic.name}`;
    } catch (e) {
      return '';
    }
  }

  /* ---------- Écoute dans l'assistant ----------
   * La chanson de la vue session est jouée telle qu'elle sera créée : pistes, scènes, mixage et mastering
   * automatiques, sur un projet temporaire (rien n'est écrit dans la chanson). Clic sur une scène : elle tourne
   * en boucle ; « Écouter la chanson » ou un bloc du bandeau : l'arrangement à partir de ce bloc.
   * Muet / Solo et volume (étape Mélodie) : par colonne, comme sur une console.
   */
  const L = { proj: null, sig: null, mode: null, scene: null, sec: null, block: -1, step: -1, paused: false };
  const LID = (id) => 'bw·' + id; // identifiants des pistes d'écoute : jamais ceux de la chanson

  /** Projet d'écoute : construit comme « Créer la chanson » (main.js, addBandSong), recalculé si la chanson change. */
  function listenProject() {
    const { cols, res } = wizSong();
    if (!res) return null;
    if (L.proj && L.sig === S.wiz.sig) return L.proj;
    dropListen();
    const p = preset();
    const proj = SS.newProject();
    proj.tempo = tempo();
    proj.timeSig = [4, 4];
    const levelKeys = new Map();
    proj.tracks = cols.map((c) => {
      const t = SS.newTrack(c.o, proj);
      t.id = LID(c.id);
      t.col = c.id;
      if (c.o.band) t.band = { ...c.o.band };
      levelKeys.set(t.id, c.o.levelKey);
      return t;
    });
    proj.scenes = res.scenes.map((sc) => ({
      id: sc.id,
      name: sc.name,
      bars: sc.bars,
      key: sc.key,
      data: Object.fromEntries(Object.entries(sc.data).map(([id, d]) => [LID(id), d])),
    }));
    proj.song = res.song.map((b) => ({ ...b }));
    proj.playMode = 'song';
    proj.songLoop = false;
    const st = (proj.tracks.find((t) => t.band) || { band: {} }).band.style || 'synthwave';
    SS.bandMix.mixTracks(proj.tracks, levelKeys, st);
    SS.bandMix.mixMaster(proj, st, SS.bandMix.driveFor(p.id, st));
    proj.groove = { ...(proj.groove || { res: 0, swing: 0.5 }), human: 0.15 };
    SS.loadScene(proj, proj.scenes[0].id, { commit: false });
    L.proj = proj;
    L.sig = S.wiz.sig;
    applyListenMutes();
    return proj;
  }

  /** Muet / Solo et volume des colonnes sur les pistes d'écoute. */
  function applyListenMutes() {
    if (!L.proj) return;
    L.proj.tracks.forEach((t) => {
      t.mute = S.wiz.mute.has(t.col);
      t.solo = S.wiz.solo.has(t.col);
      if (t.baseVol == null) t.baseVol = typeof t.volume === 'number' ? t.volume : 0.8;
      const v = t.baseVol * volGain(t.col);
      if (v !== t.volume) {
        t.volume = v;
        SS.audio.setTrackGain(t, v);
      }
    });
    if (L.mode) SS.audio.applyMutes(L.proj);
  }

  function stopListen() {
    if (L.mode) SS.audio.stop();
    L.paused = false;
    L.mode = null;
    L.scene = null;
    L.sec = null;
    L.block = -1;
    L.step = -1;
    markListen();
  }

  /** Arrête et libère les tranches audio des pistes d'écoute. */
  function dropListen() {
    stopListen();
    if (L.proj) L.proj.tracks.forEach((t) => SS.audio.removeTrack(t.id));
    L.proj = null;
    L.sig = null;
  }

  function onListenStep(step) {
    if (step < 0) {
      // arrêt par le moteur (autre lecture, fin)
      if (L.mode) {
        L.mode = null;
        L.scene = null;
        L.block = -1;
        L.paused = false;
      }
      L.step = -1;
    } else L.step = step;
    markListen();
  }

  /** Une scène en boucle (re-clic : arrêt). */
  function listenScene(id) {
    if (L.mode === 'scene' && L.scene === id) return stopListen();
    playScene(id);
  }
  /** Joue une scène en boucle (depuis son début). */
  function playScene(id) {
    const proj = listenProject();
    if (!proj || !proj.scenes.some((x) => x.id === id)) return;
    stopListen();
    SS.loadScene(proj, id, { commit: false });
    L.mode = 'scene';
    L.scene = id;
    L.sec = (S.wiz.res.scenes.find((x) => x.id === id) || {}).sec || null;
    markListen();
    SS.audio.start(() => proj, onListenStep, {});
  }

  /** L'arrangement à partir du bloc `index` (re-clic sur « Écouter la chanson » : arrêt). */
  function listenSong(index = 0) {
    const proj = listenProject();
    if (!proj) return;
    stopListen();
    L.mode = 'song';
    L.block = index;
    L.scene = proj.song[index].scene;
    markListen();
    SS.audio.start(() => proj, onListenStep, {
      song: {
        index,
        onBlock: (i) => {
          const b = proj.song[i];
          if (b && b.scene !== proj.current) SS.loadScene(proj, b.scene, { commit: false });
        },
        onBlockVisible: (i) => {
          L.block = i;
          L.scene = proj.song[i].scene;
          L.step = -1;
          // étape Mélodie : la vue suit la scène qu'on entend
          if (S.wiz && S.wiz.step === ST.harm && S.wiz.hscene !== L.scene) {
            S.wiz.hscene = L.scene;
            renderHarmony();
          }
          markListen();
        },
        onEnd: stopListen,
      },
    });
  }

  /** La chanson a changé (autre mélodie…) pendant l'écoute : on reprend au même endroit avec les nouvelles notes. */
  function relisten() {
    if (!L.mode || L.sig === S.wiz.sig) return;
    const { mode, sec, block, paused } = L;
    dropListen();
    if (paused) return;
    // les scènes ont de nouveaux identifiants : on retrouve la même section
    if (mode === 'scene') {
      const sc = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === sec);
      if (sc) playScene(sc.id);
    } else listenSong(Math.max(0, block));
  }

  /** Muet / Solo d'une ou plusieurs colonnes (un groupe : toutes ses colonnes). */
  function toggleMS(set, ids) {
    const all = ids.every((id) => set.has(id));
    ids.forEach((id) => (all ? set.delete(id) : set.add(id)));
    applyListenMutes();
    renderWiz();
  }

  /** Ce qui joue : bandeau, ligne de la scène et tête de lecture (sans reconstruire la grille). */
  function markListen() {
    const box = $('#bandWiz');
    if (!box) return;
    updateTransport();
    const hb = $('.bh-board', box);
    if (hb) {
      const on = !!L.mode && L.scene === hb.dataset.scene && L.step >= 0;
      hb.classList.toggle('playing', on);
      if (on) hb.style.setProperty('--ph', (L.step % (Number(hb.dataset.bars) * 16)) / (Number(hb.dataset.bars) * 16));
      box.querySelectorAll('.bh-scene').forEach((b) => b.classList.toggle('playing', !!L.mode && b.dataset.scene === L.scene));
      const lp = $('.bh-loop', box);
      if (lp) {
        const loop = L.mode === 'scene' && L.scene === hb.dataset.scene;
        lp.classList.toggle('on', loop);
        lp.setAttribute('aria-pressed', loop);
      }
    }
    const gt = $('.bw-gtl', box);
    const gph = $('#bwGridPh', box);
    if (gt && gph) {
      const on = !!L.mode && L.scene === gt.dataset.scene && L.step >= 0;
      gph.hidden = !on;
      if (on) gph.style.left = `${((L.step % (Number(gt.dataset.bars) * 16)) / (Number(gt.dataset.bars) * 16)) * 100}%`;
    }
    box.querySelectorAll('.bh-scene').forEach((b) => b.classList.toggle('playing', !!L.mode && b.dataset.scene === L.scene));
    if (S.wiz && S.wiz.insp) {
      const pl = $('#bwiPlay');
      const on = L.mode === 'scene' && L.sec === S.wiz.insp.sec && !L.paused;
      if (pl && pl.dataset.on !== String(on)) {
        pl.dataset.on = String(on);
        pl.innerHTML = on ? PAUSE : PLAY;
      }
    }
    box.querySelectorAll('.bw-block').forEach((b, i) => b.classList.toggle('playing', L.mode === 'song' && i === L.block));
    box.querySelectorAll('.bw-grid tbody tr').forEach((tr) => {
      const on = !!L.mode && tr.dataset.scene === L.scene;
      tr.classList.toggle('playing', on);
      const b = $('.bw-splay', tr);
      if (b) b.setAttribute('aria-pressed', L.mode === 'scene' && on);
      if (on && L.step >= 0) tr.style.setProperty('--ph', L.step / (Number(tr.dataset.bars) * 16));
      else tr.style.removeProperty('--ph');
    });
  }

  /** Instrument d'une nouvelle piste « Mélodie » : la voix ou le lead du groupe choisi (ou le premier lead du catalogue). */
  function melodyTrackOpts() {
    const find = (p) => p && p.musicians.find((m) => m.role === 'vox') || (p && p.musicians.find((m) => m.role === 'lead'));
    let p = preset();
    let mu = find(p);
    if (!mu) {
      p = B().STYLES.flatMap((st) => st.presets).find((x) => find(x));
      mu = find(p);
    }
    const ms = S.cache[p.id] && S.cache[p.id][mu.id];
    const pi = ms ? effPick(mu, ms) : gm() ? pickOrder(mu)[0] : 0;
    const opts = ms && ms.custom ? toGm(ms.custom) : choiceAt(mu, pi);
    const levelKey = ms && ms.custom ? null : `${mu.role}|${gm() ? opts.instrument : mu.pick[pi]}|${catOf(mu)}`;
    return { ...opts, category: 'mono', name: 'Mélodie', color: colorOf(mu), levelKey, role: mu.role, style: S.styleId || 'synthwave' };
  }

  /* ---------- Ouverture / fermeture ---------- */
  /** Bouton Nouvelle de l'en-tête : l'assistant, sur le projet en cours (remplacé à la création, après confirmation). */
  function open() {
    openWizard({ fresh: false });
  }
  /** « Nouvelle chanson… » (menu de l'application) : l'assistant sur une chanson vide. */
  function openWizard({ fresh = true } = {}) {
    // keys / grids / emos : étape Accords (tonalité, grille, émotion par section) ; chars : caractère et notes par
    // phrase par section ; snap : aimant de la grille ; gsel : accord sélectionné ; insp : fenêtre d'inspiration
    S.wiz = {
      step: 1, seed: 0, off: new Set(), mute: new Set(), solo: new Set(), sig: null, res: null, fresh, mel: S.mel, vol: new Map(), hscene: null, hsec: null, tempo: null, tempoFor: null,
      plans: {}, pseeds: {}, keys: {}, grids: {}, emos: {}, chars: {}, snap: 'beat', gsel: null, insp: null,
    };
    show();
  }
  function show() {
    SS.audio.ensureCtx();
    if (!S.styleId) {
      S.styleId = B().STYLES[0].id;
      S.presetId = style().presets[0].id;
    }
    S.sel = null;
    renderStyles();
    renderPresets();
    renderSong();
    renderMode();
    refresh();
    renderWiz();
    el.returnValue = '';
    el.showModal();
    requestAnimationFrame(() => {
      const a = $('#bandPresets .band-preset.active');
      a && a.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ---------- Confirmation : la chanson remplace le projet en cours ---------- */
  function showSongConfirm(n) {
    const pr = app.project();
    const p = preset();
    const notes = pr.tracks.filter((t) => app.hasNotes(t)).length;
    const box = $('#bandConfirm');
    box.replaceChildren(
      h(
        'div',
        { class: 'bcf-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'bcfTitle', 'aria-describedby': 'bcfText' },
        h('h3', { id: 'bcfTitle' }, 'Remplacer le projet par la chanson ?'),
        h(
          'p',
          { id: 'bcfText' },
          cover()
            ? `« Créer la chanson » écrit la reprise « ${S.cover.title.trim() || 'Reprise'} » : ${n} piste${n > 1 ? 's' : ''}, les scènes et l'arrangement. `
            : `« Créer la chanson » écrit une chanson dans l'esprit de « ${p.song} » : ${n} piste${n > 1 ? 's' : ''}, les scènes et l'arrangement. `,
          `Elle remplace ${pr.tracks.length > 1 ? `les ${pr.tracks.length} pistes` : 'la piste'}, ${pr.scenes.length > 1 ? `les ${pr.scenes.length} scènes` : 'la scène'} et l'arrangement actuels.`
        ),
        notes ? h('p', { class: 'bcf-warn' }, `⚠ ${notes} piste${notes > 1 ? 's' : ''} contien${notes > 1 ? 'nent' : 't'} des notes : Ctrl+Z pour revenir en arrière, et la chanson actuelle reste dans « Mes chansons » (ses versions).`) : null,
        h(
          'div',
          { class: 'bcf-actions' },
          h('button', { type: 'button', class: 'btn', id: 'bcfBack', onclick: hideConfirm }, 'Retour'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-accent', id: 'bcfSong', onclick: () => createWizSong(true) }, 'Remplacer par la chanson')
        )
      )
    );
    box.hidden = false;
    requestAnimationFrame(() => $('#bcfSong').focus());
  }

  function hideConfirm() {
    const box = $('#bandConfirm');
    if (box) box.hidden = true;
  }

  function init(appApi) {
    app = appApi;
    el = $('#bandDialog');
    if (!el) return;
    const cancel = () => {
      hideConfirm();
      el.close('cancel');
    };
    $('#bandClose').addEventListener('click', cancel);
    $('#bandCancel').addEventListener('click', cancel);
    $('#bandGm').addEventListener('click', () => setGm(!gm()));
    $('#bwEmpty').addEventListener('click', cancel);
    $('#bwBack').addEventListener('click', () => goStep(S.wiz.step - 1));
    $('#bwNext').addEventListener('click', () => goStep(S.wiz.step + 1));
    $('#bwCreate').addEventListener('click', () => createWizSong());
    document.querySelectorAll('#bandMode [data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    buildTransport();
    el.addEventListener('close', () => {
      dropListen();
      S.wiz = null;
    });
    SS.melodyPanel.init(app); // l'atelier Mélodie vit dans Harmonie → Chanson
    // Échap = annuler (rien n'est créé)
    el.addEventListener('cancel', (e) => {
      e.preventDefault();
      // Échap ferme d'abord la confirmation (ou la fenêtre d'inspiration), puis la fenêtre
      if (!$('#bandConfirm').hidden) hideConfirm();
      else if (S.wiz && S.wiz.insp) closeInsp();
      else cancel();
    });
    // la barre d'espace ne lance pas la lecture quand la fenêtre est ouverte
    el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  return { init, open, openWizard, plannedTracks, melodyTrackOpts, _state: S, _listen: () => L.proj };
})();
