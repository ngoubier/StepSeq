/*
 * Band : assistant de création d'une chanson avec un groupe de musiciens virtuels.
 * Ouvert par le bouton « Band » de l'en-tête (open) ou par « Nouvelle chanson… » du menu (openWizard,
 * sur une chanson vide). Quatre étapes :
 *  1. Modèle : style musical, inspiration (type de chanson) et musiciens — un clic sur un musicien ouvre
 *     son panneau (rôle, instrument phare, 5 conseillés, toute la bibliothèque via « Nouvelle piste ») ;
 *     le batteur choisit un kit et ses éléments (une piste par élément) ;
 *  2. Chanson : vue session (scènes × pistes), ordre des scènes, écoute ;
 *  3. Mélodie : autres mélodies sur la même grille, écoute avec Muet / Solo ;
 *  4. Pistes : celles à importer.
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
  const S = { styleId: null, presetId: null, sel: null, cache: {}, wiz: null, mel: { method: 'inspiration', feet: 0, barsPerLine: 2, complexity: 'balanced', style: 'simple', range: 'auto', ending: 'closed' } };

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
    refresh();
  }
  function setPreset(id) {
    S.presetId = id;
    S.sel = null;
    renderPresets();
    renderSong();
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
    const keys = ['type', 'category', 'family', 'instrument', 'analog', 'patch', 'sfv', 'source', 'sound', 'machine', 'bank', 'variant'];
    const o = {};
    keys.forEach((k) => r[k] !== undefined && (o[k] = r[k]));
    return o;
  }

  /* ---------- Assistant « Nouvelle chanson » ----------
   * Ouvert par le menu de l'application, sur une chanson vide :
   *  1. Modèle : le style, l'inspiration et les musiciens (l'écran habituel de Band) ;
   *  2. Chanson : toute la chanson en vue « session » — une ligne par scène, une colonne par piste ;
   *  3. Mélodie : « Générer la mélodie » tire une autre mélodie (lead, voix, sax) sur la même grille ;
   *  4. Pistes : on coche les pistes à importer (batterie, basse, nappes, arpèges, lead…).
   * Rien n'est écrit dans le projet avant « Créer la chanson » ; fermer laisse la chanson vide.
   */
  const STEPS = [
    { label: 'Modèle', hint: 'Choisis le style, l’inspiration et les musiciens' },
    { label: 'Chanson', hint: 'Toute la chanson : une ligne par scène, une colonne par piste' },
    { label: 'Mélodie', hint: 'Génère d’autres mélodies sur la même grille d’accords' },
    { label: 'Pistes', hint: 'Coche les pistes à importer dans la chanson' },
  ];
  const spec = () => preset() && SS.BandSongs && SS.BandSongs[preset().id];
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
    const sig = JSON.stringify([p.id, S.wiz.seed, melodyOpts(), cols.map((c) => [c.id, c.o])]);
    if (S.wiz.sig !== sig) {
      const sp = spec();
      const fake = cols.map((c) => ({ id: c.id, type: c.o.type, sound: c.o.sound, band: c.o.band }));
      S.wiz.res = sp ? SS.bandSong.build(sp, p.id, fake, { melodySeed: S.wiz.seed, melody: melodyOpts() }) : null;
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

  /** Réglages passés à SS.bandSong.build : null = mélodie dans le style de l'inspiration. */
  function melodyOpts() {
    const m = S.mel;
    if (m.method !== 'compose') return null;
    const { method, ...o } = m; // eslint-disable-line no-unused-vars
    return o;
  }

  /**
   * Réglages de la mélodie (ceux de l'atelier Mélodie) : la mélodie de l'inspiration, ou une mélodie composée
   * scène par scène — pieds (notes) par vers, mesures par vers, complexité, rythme, tessiture, fin.
   */
  function melodyForm() {
    const m = S.mel;
    const comp = m.method === 'compose';
    const set = (k, v) => {
      m[k] = v;
      renderWiz();
    };
    const sel = (id, label, k, options, hint) =>
      h(
        'label',
        { class: 'bw-field' + (comp ? '' : ' off') },
        h('span', {}, label),
        h(
          'select',
          { id, disabled: !comp, title: hint || null, onchange: (e) => set(k, typeof m[k] === 'number' ? Number(e.target.value) : e.target.value) },
          ...options.map(([v, t]) => {
            const o = h('option', { value: v }, t);
            o.selected = String(m[k]) === String(v);
            return o;
          })
        )
      );
    const R = (SS.melody && SS.melody.RANGES) || {};
    return h(
      'div',
      { class: 'bw-melform', id: 'bwMelForm' },
      h(
        'div',
        { class: 'segmented bw-method', role: 'radiogroup', 'aria-label': 'Mélodie' },
        ...[
          ['inspiration', 'Style de l’inspiration', 'Riffs et refrains dans l’esprit du morceau choisi'],
          ['compose', 'Composée', 'Composée scène par scène comme dans l’atelier Mélodie : pieds par vers, complexité, rythme, tessiture, fin'],
        ].map(([v, t, tip]) =>
          h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-checked': String(m.method === v), class: m.method === v ? 'active' : '', title: tip, onclick: () => set('method', v) }, t)
        )
      ),
      sel('bwFeet', 'Pieds par vers', 'feet', [[0, 'Auto'], ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [n, `${n} pieds`])], 'Syllabes (notes) par vers : 8 = octosyllabe, 12 = alexandrin. Auto : selon la longueur du vers.'),
      sel('bwBpl', 'Mesures par vers', 'barsPerLine', [[1, '1 mesure'], [2, '2 mesures'], [4, '4 mesures']]),
      sel('bwComplexity', 'Complexité', 'complexity', [['simple', 'Simple'], ['balanced', 'Équilibrée'], ['adventurous', 'Audacieuse']], 'Simple : notes d’accord. Équilibrée : tierces, septièmes et passages. Audacieuse : couleurs, contours et sauts plus variés.'),
      sel('bwRhythm', 'Rythme', 'style', [['simple', 'Simple'], ['varie', 'Varié (pointées, syncopes)'], ['dense', 'Dense (doubles-croches)']]),
      sel('bwRange', 'Tessiture', 'range', [['auto', 'Auto (voix ou instrument)'], ...Object.entries(R).map(([id, r]) => [id, r.label])]),
      sel('bwEnding', 'Fin', 'ending', [['closed', 'Fermée (tonique)'], ['open', 'Ouverte']])
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
    if (n === 1) dropListen();
    renderWiz();
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
    const pick = step === 4;
    const mix = step === 3;
    const muted = (c) => {
      const solo = S.wiz.solo.size > 0;
      return mix && (S.wiz.mute.has(c.id) || (solo && !S.wiz.solo.has(c.id)));
    };
    const msBtns = (ids, label) =>
      h(
        'span',
        { class: 'bw-ms' },
        h('button', { type: 'button', class: 'bw-m' + (ids.every((id) => S.wiz.mute.has(id)) ? ' on' : ''), 'aria-pressed': String(ids.every((id) => S.wiz.mute.has(id))), title: `Muet : couper ${label}`, 'aria-label': `Muet ${label}`, onclick: () => toggleMS(S.wiz.mute, ids) }, 'M'),
        h('button', { type: 'button', class: 'bw-s' + (ids.every((id) => S.wiz.solo.has(id)) ? ' on' : ''), 'aria-pressed': String(ids.every((id) => S.wiz.solo.has(id))), title: `Solo : écouter ${label} seul`, 'aria-label': `Solo ${label}`, onclick: () => toggleMS(S.wiz.solo, ids) }, 'S')
      );
    const isOff = (c) => pick && S.wiz.off.has(c.id);
    const check = (ids, label) => {
      const on = ids.filter((id) => !S.wiz.off.has(id)).length;
      const cb = h('input', { type: 'checkbox', 'aria-label': `Importer ${label}`, onchange: (e) => toggleCols(ids, e.target.checked) });
      cb.checked = on > 0;
      cb.indeterminate = on > 0 && on < ids.length;
      return cb;
    };
    const len = res.song.reduce((a, b) => a + res.scenes.find((sc) => sc.id === b.scene).bars * b.repeat, 0);
    const secs = (len * 4 * 60) / p.tempo;
    const time = `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
    const melCols = cols.filter((c) => singer(c.role));
    const kept = cols.filter((c) => !S.wiz.off.has(c.id)).length;

    const order = h(
      'div',
      { class: 'bw-order', role: 'group', 'aria-label': 'Ordre des scènes dans la chanson' },
      h(
        'button',
        { type: 'button', class: 'btn btn-small bw-playsong', id: 'bwPlaySong', 'aria-pressed': 'false', title: 'Écouter toute la chanson, dans l’ordre des scènes', onclick: () => (L.mode === 'song' ? stopListen() : listenSong(0)) },
        h('span', { class: 'bw-pico', html: PLAY + STOP }),
        h('span', {}, 'Écouter la chanson')
      ),
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
        h('span', {}, ` ${p.artist} · ${SS.harmony.label(res.key)} · ${p.tempo} BPM · ${res.scenes.length} scènes · ${len} mesures · ${time}`)
      ),
      h('p', { class: 'bw-hint' }, STEPS[step - 1].hint + '.' + (step === 3 ? ' Clique une scène pour l’écouter ; M coupe un instrument, S l’écoute seul.' : ' Clique une scène pour l’écouter en boucle.')),
      order,
      step === 3
        ? h(
            'div',
            { class: 'bw-actions' },
            melCols.length
              ? [
                  h('button', { type: 'button', class: 'btn btn-accent', id: 'bwMelody', onclick: () => ((S.wiz.seed += 1), renderWiz()) }, '🎲 Générer la mélodie'),
                  S.wiz.seed
                    ? h('button', { type: 'button', class: 'btn', id: 'bwMelodyBack', onclick: () => ((S.wiz.seed = 0), renderWiz()) }, '↺ Mélodie d’origine')
                    : null,
                  h('span', { class: 'bw-seed', id: 'bwSeed' }, S.wiz.seed || S.mel.method === 'compose' ? `Mélodie n° ${S.wiz.seed + 1}` : 'Mélodie d’origine de l’inspiration'),
                ]
              : h('span', { class: 'bw-seed' }, 'Ce groupe n’a ni lead ni voix : pas de mélodie à générer. Ajoute un musicien à l’étape 1.')
          )
        : null,
      step === 3 && melCols.length ? melodyForm() : null,
      step === 4
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
            class: 'bw-group' + (off ? ' off' : '') + (step === 3 && singer(g.mu.role) ? ' mel' : ''),
            style: `--c:${colorOf(g.mu)}`,
          },
          h('label', { class: 'bw-glabel' }, pick ? check(ids, label) : null, h('span', { class: 'bw-ico', html: icon(g.mu.role) }), h('span', {}, label)),
          mix && ids.length > 1 ? msBtns(ids, label) : null
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
          { scope: 'col', class: 'bw-track' + (isOff(c) ? ' off' : '') + (muted(c) ? ' muted' : '') + (step === 3 && singer(c.role) ? ' mel' : ''), style: `--c:${c.o.color}`, title: B().describe(c.o).name },
          h('label', {}, pick && multi ? check([c.id], c.o.name) : null, h('span', {}, c.o.name)),
          mix ? msBtns([c.id], c.o.name) : null
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
            { class: 'bw-cell' + (isOff(c) ? ' off' : '') + (muted(c) ? ' muted' : '') + (step === 3 && singer(c.role) ? ' mel' : '') },
            on
              ? h('div', { class: 'bw-clip', style: `--c:${c.o.color}`, title: `${sc.name} · ${c.o.name} : ${n} ${d.steps ? 'coup' : 'note'}${n > 1 ? 's' : ''}` }, clipSvg(d, sc.bars, range.get(c.id)))
              : h('div', { class: 'bw-slot', title: `${sc.name} · ${c.o.name} : silence` })
          );
        })
      )
    );
    box.replaceChildren(top, h('div', { class: 'bw-scroll' }, h('table', { class: 'bw-grid', style: `--cols:${cols.length}` }, h('thead', {}, head1, head2), h('tbody', {}, ...body))));
  }

  /** Affiche l'étape en cours de l'assistant. */
  function renderWiz() {
    const step = S.wiz.step;
    el.classList.add('wizard');
    el.querySelectorAll('.wiz-only').forEach((x) => (x.hidden = false));
    $('#bandTitle').firstChild.textContent = S.wiz.fresh ? 'Nouvelle chanson ' : 'Band ';
    renderWizSteps();
    el.querySelector('.band-body').hidden = step !== 1;
    $('#bandWiz').hidden = step === 1;
    $('#bandGm').hidden = step !== 1;
    if (step === 1) refresh();
    else {
      renderWizGrid();
      wizFoot();
      relisten();
      markListen();
    }
  }

  /** Boutons du pied de la fenêtre selon l'étape. */
  function wizFoot() {
    const step = S.wiz.step;
    $('#bwEmpty').hidden = step !== 1 || !S.wiz.fresh;
    $('#bwBack').hidden = step === 1;
    $('#bwNext').hidden = step === 4;
    $('#bwNext').disabled = !canGo(step + 1);
    $('#bwNext').title = step < 4 ? (canGo(step + 1) ? `${STEPS[step].label} : ${STEPS[step].hint.toLowerCase()}` : 'Choisis au moins un musicien') : '';
    $('#bwCreate').hidden = step !== 4;
    const kept = step === 4 ? wizCols().filter((c) => !S.wiz.off.has(c.id)).length : 0;
    $('#bwCreate').disabled = step === 4 && !kept;
    $('#bwCount').hidden = step !== 4;
    $('#bwCount').textContent = kept ? `${kept} piste${kept > 1 ? 's' : ''} à importer` : 'Aucune piste cochée';
    renderWizSteps();
  }

  /** Crée la chanson avec les pistes cochées (même calcul que la vue session, même mélodie). */
  function createWizSong(confirmed) {
    const cols = wizCols().filter((c) => !S.wiz.off.has(c.id));
    if (!cols.length) return;
    // projet déjà commencé (bouton Band) : la chanson le remplace, on demande d'abord
    if (confirmed !== true && app.project().tracks.length) return showSongConfirm(cols.length);
    const p = preset();
    const seed = S.wiz.seed;
    hideConfirm();
    el.close('ok');
    app.applySong(cols.map((c) => c.o), p, p.tempo, { melodySeed: seed, melody: melodyOpts() });
  }

  /* ---------- Écoute dans l'assistant ----------
   * La chanson de la vue session est jouée telle qu'elle sera créée : pistes, scènes, mixage et mastering
   * automatiques, sur un projet temporaire (rien n'est écrit dans la chanson). Clic sur une scène : elle tourne
   * en boucle ; « Écouter la chanson » ou un bloc du bandeau : l'arrangement à partir de ce bloc.
   * Muet / Solo (étape Mélodie) : par colonne, comme sur une console.
   */
  const L = { proj: null, sig: null, mode: null, scene: null, block: -1, step: -1 };
  const LID = (id) => 'bw·' + id; // identifiants des pistes d'écoute : jamais ceux de la chanson

  /** Projet d'écoute : construit comme « Créer la chanson » (main.js, addBandSong), recalculé si la chanson change. */
  function listenProject() {
    const { cols, res } = wizSong();
    if (!res) return null;
    if (L.proj && L.sig === S.wiz.sig) return L.proj;
    dropListen();
    const p = preset();
    const proj = SS.newProject();
    proj.tempo = p.tempo;
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

  /** Muet / Solo des colonnes sur les pistes d'écoute. */
  function applyListenMutes() {
    if (!L.proj) return;
    L.proj.tracks.forEach((t) => {
      t.mute = S.wiz.mute.has(t.col);
      t.solo = S.wiz.solo.has(t.col);
    });
    if (L.mode) SS.audio.applyMutes(L.proj);
  }

  function stopListen() {
    if (L.mode) SS.audio.stop();
    L.mode = null;
    L.scene = null;
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
      }
      L.step = -1;
    } else L.step = step;
    markListen();
  }

  /** Une scène en boucle (re-clic : arrêt). */
  function listenScene(id) {
    if (L.mode === 'scene' && L.scene === id) return stopListen();
    const proj = listenProject();
    if (!proj) return;
    stopListen();
    SS.loadScene(proj, id, { commit: false });
    L.mode = 'scene';
    L.scene = id;
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
          markListen();
        },
        onEnd: stopListen,
      },
    });
  }

  /** La chanson a changé (autre mélodie…) pendant l'écoute : on reprend au même endroit avec les nouvelles notes. */
  function relisten() {
    if (!L.mode || L.sig === S.wiz.sig) return;
    const { mode, scene, block } = L;
    dropListen();
    if (mode === 'scene') listenScene(scene);
    else listenSong(Math.max(0, block));
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
    const btn = $('#bwPlaySong', box);
    if (btn) {
      const on = L.mode === 'song';
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on);
      btn.lastChild.textContent = on ? 'Arrêter' : 'Écouter la chanson';
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
  /** Bouton Band de l'en-tête : l'assistant, sur le projet en cours (remplacé à la création, après confirmation). */
  function open() {
    openWizard({ fresh: false });
  }
  /** « Nouvelle chanson… » (menu de l'application) : l'assistant sur une chanson vide. */
  function openWizard({ fresh = true } = {}) {
    S.wiz = { step: 1, seed: 0, off: new Set(), mute: new Set(), solo: new Set(), sig: null, res: null, fresh, mel: S.mel };
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
          `« Créer la chanson » écrit une chanson dans l'esprit de « ${p.song} » : ${n} piste${n > 1 ? 's' : ''}, les scènes et l'arrangement. `,
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
    el.addEventListener('close', () => {
      dropListen();
      S.wiz = null;
    });
    SS.melodyPanel.init(app); // l'atelier Mélodie vit dans Key → Chanson
    // Échap = annuler (rien n'est créé)
    el.addEventListener('cancel', (e) => {
      e.preventDefault();
      // Échap ferme d'abord la confirmation, puis la fenêtre
      if (!$('#bandConfirm').hidden) hideConfirm();
      else cancel();
    });
    // la barre d'espace ne lance pas la lecture quand la fenêtre est ouverte
    el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  return { init, open, openWizard, plannedTracks, melodyTrackOpts, _state: S, _listen: () => L.proj };
})();
