/*
 * Fenêtre « ✦ D'après une émotion » (assistant Nouvelle chanson, étape Style : tuile après les styles).
 * Maquette validée : maquettes/maquette-chanson-emotion.html (2026-11-24).
 *
 * Un style et jusqu'à trois émotions pondérées → la chanson déduite (js/emotionsong.js) : tempo, orientation, tonalité
 * et mode, groupe, scènes et accords, avec les chansons modèles qui l'ont inspirée. Un clic sur une scène montre les
 * autres grilles possibles. « Créer cette chanson » règle l'assistant par son pont (SS.band.claude) : inspiration la
 * plus proche, tempo, tonalité, scènes, arrangement, accords et émotion de chaque scène, musiciens ajoutés ; puis l'étape
 * Scènes s'ouvre. Tout reste un brouillon de l'assistant, modifiable étape par étape.
 */
window.SS = window.SS || {};

SS.emotionSongPanel = (() => {
  const $ = (q) => document.querySelector(q);
  const E = () => SS.emotionSong;
  const st = { style: 'synthwave', emotions: [{ id: 'nostalgie', w: 60 }, { id: 'espoir', w: 40 }], picks: {}, open: -1 };
  let dlg = null;
  let cur = null; // dernière déduction

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  const emoLabel = (id) => SS.findEmotion(id).label;
  const pct = (x) => `${Math.round(x * 100)} %`;
  /** Camembert d'un mélange d'émotions (couleurs de la table des émotions). */
  function pie(mix) {
    let a = 0;
    const parts = mix.map((e) => {
      const s = a;
      a += e.w * 360;
      return `${SS.emotionColor(e.id)} ${s}deg ${a}deg`;
    });
    return h('span', { class: 'es-pie', style: `background: conic-gradient(${parts.join(', ')})`, title: mix.map((e) => `${emoLabel(e.id)} ${pct(e.w)}`).join(' · ') });
  }
  const keyText = (k) => SS.harmony.label(k);

  /* ---------- tuile de l'étape Style ---------- */
  function card() {
    const cv = h('canvas', { class: 'bsty-art es-art', 'aria-hidden': 'true' });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawArt(cv)).observe(cv);
    else requestAnimationFrame(() => drawArt(cv));
    return h(
      'button',
      { type: 'button', class: 'bsty bsty-emo', title: 'Un style et jusqu’à trois émotions : tempo, tonalité, groupe, scènes et accords en sont déduits', onclick: open },
      cv,
      h(
        'span',
        { class: 'bsty-body' },
        h('span', { class: 'bsty-name' }, '✦ D’après une émotion'),
        h('span', { class: 'bsty-desc' }, 'Un style, une à trois émotions : la chanson en est déduite.'),
        h(
          'dl',
          { class: 'bsty-list' },
          h('dt', {}, 'Départ'), h('dd', {}, 'Style et émotions pondérées'),
          h('dt', {}, 'Déduit'), h('dd', {}, 'Tempo, tonalité, groupe, scènes, accords'),
          h('dt', {}, 'Modèles'), h('dd', {}, `${E().refs().length} chansons de référence`)
        )
      )
    );
  }
  /** Image de la tuile : des disques aux couleurs des émotions qui se mêlent. */
  function drawArt(cv) {
    const w = cv.clientWidth;
    const ht = cv.clientHeight;
    if (!w || !ht) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(ht * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = getComputedStyle(cv).getPropertyValue('--c-bg-deep') || '#0e0e10';
    g.fillRect(0, 0, w, ht);
    g.globalCompositeOperation = 'lighter';
    ['nostalgie', 'espoir', 'mystere', 'joie', 'tendresse'].forEach((id, i) => {
      const x = w * (0.2 + 0.15 * i);
      const y = ht * (0.45 + 0.18 * Math.sin(i * 1.7));
      const r = ht * 0.42;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, SS.emotionColor(id) + '88');
      grd.addColorStop(1, SS.emotionColor(id) + '00');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, ht);
    });
  }

  /* ---------- fenêtre ---------- */
  function open() {
    if (!dlg) build();
    render();
    if (!dlg.open) dlg.showModal();
  }
  function close() {
    if (dlg && dlg.open) dlg.close();
  }
  function build() {
    dlg = $('#emotionSongDialog');
    $('#esClose').addEventListener('click', close);
    $('#esCancel').addEventListener('click', close);
    $('#esCreate').addEventListener('click', () => {
      try {
        apply(cur);
        close();
      } catch (e) {
        $('#esMsg').textContent = e.message;
      }
    });
  }
  const changed = () => ((st.picks = {}), (st.open = -1), render());

  function render() {
    if (!E().TEMPO[st.style] || st.style === 'film') st.style = 'synthwave';
    cur = E().deduce({ style: st.style, emotions: st.emotions });
    $('#esMsg').textContent = '';
    if (cur) cur.sections.forEach((s, i) => st.picks[i] != null && s.grids[st.picks[i]] && (s.pick = st.picks[i]));
    $('#esBody').replaceChildren(inputs(), result(), models());
    $('#esCreate').disabled = !cur || !cur.model;
  }

  function inputs() {
    const mix = E().normMix(st.emotions);
    const rows = st.emotions.map((e, i) =>
      h(
        'div',
        { class: 'es-row', style: `--c:${SS.emotionColor(e.id)}` },
        h('span', { class: 'es-dot' }),
        h(
          'select',
          { 'aria-label': `Émotion ${i + 1}`, onchange: (ev) => ((e.id = ev.target.value), changed()) },
          ...SS.EMOTIONS.map((x) => h('option', { value: x.id, selected: x.id === e.id, disabled: x.id !== e.id && st.emotions.some((y) => y.id === x.id) }, x.label))
        ),
        h('input', { type: 'range', min: 5, max: 100, value: e.w, 'aria-label': `Poids de ${emoLabel(e.id)}`, oninput: (ev) => ((e.w = +ev.target.value), changed()) }),
        h('span', { class: 'es-pct' }, pct((mix.find((x) => x.id === e.id) || { w: 0 }).w)),
        h('button', { type: 'button', class: 'es-x', title: 'Enlever cette émotion', 'aria-label': `Enlever ${emoLabel(e.id)}`, disabled: st.emotions.length < 2, onclick: () => (st.emotions.splice(i, 1), changed()) }, '×')
      )
    );
    const bar = h('div', { class: 'es-mixbar' }, ...mix.map((e) => h('i', { style: `flex:${e.w};background:${SS.emotionColor(e.id)}` })));
    return h(
      'div',
      { class: 'es-col es-in' },
      h('label', { class: 'es-lbl', for: 'esStyle' }, 'Style'),
      h('select', { id: 'esStyle', onchange: (ev) => ((st.style = ev.target.value), changed()) }, ...E().styles({ film: false }).map((s) => h('option', { value: s.id, selected: s.id === st.style }, s.label))),
      h('div', { class: 'es-lbl' }, 'Émotions', SS.helpTip('Jusqu’à trois émotions et leur poids. La chanson garde ce mélange ; chaque scène penche vers l’émotion la plus calme, la plus énergique ou la plus tendue selon son rôle.', 'Émotions')),
      bar,
      ...rows,
      h('button', {
        type: 'button', class: 'es-add', disabled: st.emotions.length >= E().MAX_EMOTIONS,
        onclick: () => {
          const free = SS.EMOTIONS.find((x) => !st.emotions.some((y) => y.id === x.id));
          st.emotions.push({ id: free.id, w: 30 });
          changed();
        },
      }, '+ Ajouter une émotion')
    );
  }

  function result() {
    const d = cur;
    if (!d) return h('div', { class: 'es-col es-res' }, h('p', { class: 'es-empty' }, 'Choisis au moins une émotion.'));
    const t = d.tempo;
    const vt = d.modeVotes.reduce((a, v) => a + v.v, 0) || 1;
    const MODES = SS.harmony.MODES;
    const modeName = (m) => SS.harmony.label({ tonic: 'C', mode: m }).replace(/^Do /, '');
    const row = (k, v, help) => [h('span', { class: 'es-k' }, k), h('div', { class: 'es-v' }, v), help ? SS.helpTip(help, k) : h('span')];
    const top3 = d.refs.slice(0, 3).map((r) => `${r.title} (${r.bpm})`).join(', ');
    const tempoNote = t.bpm > t.base ? 'poussé par l’énergie' : t.bpm < t.base ? 'freiné par le calme' : '';
    const grid = h(
      'div',
      { class: 'es-grid' },
      ...row('Tempo', [h('b', {}, `${t.bpm} BPM`), h('small', {}, `modèles ≈ ${t.base}${tempoNote ? ' · ' + tempoNote : ''}`)], `Moyenne des chansons modèles du style, pondérée par leur proximité (${top3}…), puis ajustée selon l’énergie du mélange (${t.energy}/100 contre ${t.refEnergy} pour les modèles), dans la plage du style (${t.range.join('–')} BPM).`),
      ...row('Orientation', [h('b', {}, d.orientation.label), h('small', {}, `comme ${d.orientation.ref}`)], `L’orientation de la chanson modèle la plus proche. Le groupe et les sons viennent de l’inspiration « ${d.model ? d.model.song : '—'} » de l’assistant.`),
      ...row(
        'Tonalité',
        [
          h('b', {}, keyText(d.key)),
          h('div', { class: 'es-votes' }, ...d.modeVotes.map((v) => h('i', { style: `flex:${v.v}`, class: 'es-vote es-m-' + (MODES.find((m) => m.id === v.mode) || {}).fam, title: `${modeName(v.mode)} ${pct(v.v / vt)}` }))),
          h('small', {}, d.modeVotes.slice(0, 3).map((v) => `${modeName(v.mode)} ${pct(v.v / vt)}`).join(' · ')),
        ],
        'Vote moitié émotions (le mode de leurs propositions, selon leur poids), moitié chansons modèles (selon leur proximité). Le côté clair (majeur, mixolydien, lydien) ou sombre (mineur, dorien, phrygien) est tranché d’abord, puis le mode le plus voté de ce côté. La tonique est la plus fréquente chez les modèles du même côté.'
      ),
      ...row(
        'Groupe',
        h('div', { class: 'es-chips' }, ...d.roles.map((r) => h('span', { class: 'es-chip' + (r.added ? ' es-added' : ''), title: r.why }, h('i', { style: `background:${SS.Band.ROLES[r.role].color}` }), SS.Band.ROLES[r.role].short))),
        'Le groupe de l’inspiration la plus proche. En pointillé : ajouté par les émotions (survol pour savoir pourquoi).'
      )
    );
    const byType = Object.fromEntries(d.sections.map((s, i) => [s.type, i]));
    const shown = new Set();
    const scenes = d.form.map((type) => {
      const si = byType[type];
      const s = d.sections[si];
      const again = shown.has(type);
      shown.add(type);
      const g = s.grids[s.pick];
      const chords = g ? E().chordsIn(d.key, g.chords) : [];
      const isOpen = st.open === si && !again;
      return h(
        'div',
        { class: 'es-sc' + (isOpen ? ' open' : ''), onclick: (ev) => (ev.target.closest('.es-alt') ? null : ((st.open = st.open === si ? -1 : si), render())) },
        pie(s.mix),
        h('span', { class: 'es-sn' }, s.name, h('small', {}, `${s.bars} mes.`)),
        h('span', { class: 'es-ch selectable' }, chords.map((c) => c.name).join(' ') || '—', h('small', {}, g ? `${g.chords.map((c) => c.tok.replace('b', '♭')).join(' ')} · ${again ? 'comme plus haut' : 'd’après ' + E().fromText(g, s.type)}` : '')),
        h('span', { class: 'es-en', title: 'Énergie' }, h('i', { style: `width:${Math.round(s.energy * 100)}%` })),
        isOpen
          ? h(
              'div',
              { class: 'es-alts' },
              ...s.grids.slice(0, 6).map((a, j) =>
                h('button', { type: 'button', class: 'es-alt' + (j === s.pick ? ' on' : ''), onclick: () => ((st.picks[si] = j), render()) }, h('b', {}, E().chordsIn(d.key, a.chords).map((c) => c.name).join(' ')), h('span', {}, E().fromText(a, s.type)))
              )
            )
          : null
      );
    });
    return h(
      'div',
      { class: 'es-col es-res' },
      grid,
      h('div', { class: 'es-lbl' }, 'Scènes et accords', SS.helpTip('La forme vient de la chanson modèle la plus proche. Chaque scène garde le mélange d’émotions (la pastille) et prend une grille des modèles ou des émotions qui tient dans le mode. Un clic sur une scène : les autres grilles possibles.', 'Scènes et accords')),
      h('div', { class: 'es-scenes' }, ...scenes)
    );
  }

  function models() {
    const d = cur;
    return h(
      'div',
      { class: 'es-col es-refs' },
      h('div', { class: 'es-lbl' }, 'Chansons modèles', SS.helpTip('Les chansons de référence les plus proches : même style ou style voisin, émotions semblables. On n’en garde que des données (tempo, mode, grilles en degrés, forme, instruments), jamais la mélodie ni les paroles.', 'Chansons modèles')),
      ...(d ? d.refs : []).map((r) =>
        h(
          'div',
          { class: 'es-ref' },
          h('span', {}, h('b', {}, r.title), ' ', h('span', { class: 'es-art-name' }, r.artist)),
          h('span', { class: 'es-score' }, pct(r.score)),
          h('div', { class: 'es-bar' }, h('i', { style: `width:${Math.round(r.score * 100)}%` })),
          h('div', { class: 'es-meta' }, `${(SS.Band.STYLES.find((s) => s.id === r.style) || { label: 'Musique de film' }).label} · ${r.bpm} BPM · ${keyText({ tonic: SS.TONIC_NAMES[SS.harmony.MODES.find((m) => m.id === r.mode).fam][r.tonicPc], mode: r.mode })}`),
          h('div', { class: 'es-emod' }, ...r.emotions.map((e) => h('i', { style: `flex:${e.w};background:${SS.emotionColor(e.id)}`, title: `${emoLabel(e.id)} ${pct(e.w)}` })))
        )
      )
    );
  }

  /* ---------- « Créer cette chanson » : l'assistant réglé par son pont ---------- */
  /** Section de l'inspiration qui sert de départ à un type de scène : la même, sinon la plus proche (même ordre de repli que les grilles). */
  const FALL = {
    intro: ['intro', 'verse', 'theme', 'groove'], outro: ['outro', 'chorus', 'drop', 'theme', 'verse'], pre: ['pre', 'build', 'bridge', 'verse'],
    build: ['build', 'pre', 'bridge', 'verse'], drop: ['drop', 'chorus', 'peak', 'theme'], chorus: ['chorus', 'drop', 'peak', 'theme'],
    peak: ['peak', 'chorus', 'drop', 'theme'], break: ['break', 'bridge', 'verse'], bridge: ['bridge', 'break', 'solo', 'pre', 'verse'],
    solo: ['solo', 'instr', 'bridge', 'verse'], theme: ['theme', 'chorus', 'verse', 'groove'], groove: ['groove', 'verse', 'theme'], verse: ['verse', 'theme', 'groove'],
  };
  /** Son d'un rôle ajouté : celui d'un musicien de ce rôle dans l'inspiration (même facultatif), sinon dans le style, sinon ailleurs. */
  function soundForRole(role, styleId, presetId) {
    const all = SS.Band.STYLES.flatMap((s) => s.presets.map((p) => ({ s, p })));
    const order = [...all.filter((x) => x.p.id === presetId), ...all.filter((x) => x.s.id === styleId && x.p.id !== presetId), ...all.filter((x) => x.s.id !== styleId)];
    for (const { p } of order) {
      const mu = p.musicians.find((m) => m.role === role && m.pick && m.pick.length);
      if (mu) return mu.pick[0];
    }
    return null;
  }

  function apply(d) {
    const W = SS.band.claude;
    if (!d || !d.model) throw new Error('Pas d’inspiration pour ce style');
    W.porte('create');
    W.style(d.model.style, d.model.preset);
    W.tempo(d.tempo.bpm);
    W.tonalite(d.key);
    // scènes : chaque type de scène prend une section de l'inspiration (copiée si elle sert déjà), renommée
    const base = W.etat().scenes.map((s) => s.id);
    const used = new Set();
    const map = {};
    d.sections.forEach((s) => {
      const cands = [...(FALL[s.type] || [s.type]), ...base];
      const free = cands.find((id) => base.includes(id) && !used.has(id));
      const src = cands.find((id) => base.includes(id));
      const id = free || W.scene(src, { dupliquer: true });
      used.add(id);
      map[s.type] = id;
    });
    base.filter((id) => !used.has(id)).forEach((id) => W.scene(id, { supprimer: true }));
    d.sections.forEach((s) => W.scene(map[s.type], { nom: s.name, mesures: s.bars }));
    // arrangement : la forme du modèle (deux passages de suite = ×2)
    const blocs = [];
    d.form.forEach((type) => {
      const last = blocs[blocs.length - 1];
      if (last && last.scene === map[type]) last.fois++;
      else blocs.push({ scene: map[type], fois: 1 });
    });
    W.structure(blocs);
    // accords (une mesure par accord, la grille répétée sur la scène) et émotion principale de chaque scène
    d.sections.forEach((s) => {
      const g = s.grids[s.pick];
      if (g) {
        const bars = E().chordsIn(d.key, g.chords).map((c) => c.grid).filter(Boolean).map((c) => [c]);
        if (bars.length) W.accords(map[s.type], bars);
      }
      W.emotion(map[s.type], s.emotion);
    });
    // musiciens ajoutés par les émotions
    d.roles.filter((r) => r.added).forEach((r) => {
      const type = SS.bandGroup.typeOfRole(r.role);
      try {
        W.ajouter(type, soundForRole(r.role, d.model.style, d.model.preset), SS.Band.ROLES[r.role].short);
      } catch (e) {
        /* groupe complet ou son introuvable : on garde le groupe de l'inspiration */
      }
    });
    try {
      W.etape('scenes');
    } catch (e) {
      /* l'étape s'ouvrira au prochain clic */
    }
    return map;
  }

  /** Pour Claude (StepSeq.assistantEmotion) : déduire, et appliquer si demandé. */
  const claude = {
    deduire: (o) => E().deduce(o),
    appliquer: (o) => {
      const d = E().deduce(o);
      if (!d) throw new Error('style inconnu ou aucune émotion');
      apply(d);
      return d;
    },
  };

  return { card, open, close, claude, _state: st };
})();
