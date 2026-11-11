/*
 * Fenêtre « Key », propre à la scène en cours (intro, couplet, refrain…) :
 *  - un ASSISTANT en 2 étapes (ambiance → grille d'accords) pour démarrer une scène qui n'a pas
 *    encore de tonalité : la grille choisie est posée sur la grille et les couches sont générées ;
 *  - des ONGLETS pour modifier ou vérifier ensuite :
 *    1 Ambiance : une émotion → trois grilles d'accords ; « Poser sur la grille » les met dans l'onglet 2.
 *    2 Grille : les accords sur une ligne (glisser-déposer), et en bas les couches que « Générer » écrit
 *      (basse, accords, arpège joué par Arp One).
 *    3 Mélodie : une mélodie sur la grille (js/melodypanel.js, comme dans Band), à écouter avec la nappe.
 *    4 Vérifier : les accords et la mélodie de chaque scène.
 * La tonalité et l'émotion sont rangées dans la scène (scene.key, scene.emotion). Le calcul est dans
 * js/harmony.js, les intentions et leur rangement par mode dans js/emotions.js.
 */
window.SS = window.SS || {};

SS.harmonyPanel = (() => {
  const $ = (s) => document.querySelector(s);
  const H = () => SS.harmony;
  let app;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const proj = () => app.project();
  const scene = () => SS.currentScene(proj());
  const key = () => SS.sceneKey(proj());
  const instTracks = () => proj().tracks.filter((t) => t.type === 'instrument');
  const byId = (id) => proj().tracks.find((t) => t.id === id);
  const isBass = (t) => t.family === 'bass' || /bass|basse/i.test(t.name);
  const avgPitch = (t) => (t.events.length ? t.events.reduce((a, e) => a + e.notes[0], 0) / t.events.length : (t.octave + 1) * 12);
  const toast = (m, ms) => SS.ui.toast(m, ms);

  const gensOf = (group) => H().GENERATORS.filter((g) => g.group === group);
  const genById = (id) => H().GENERATORS.find((g) => g.id === id);

  let view = 'tabs'; // 'tabs' | 'wiz'
  let tab = 'amb';
  let viewEmo = null; // émotion affichée dans l'onglet Ambiance (sinon celle de la scène)
  let ambTempo = null; // case « régler aussi le tempo » (null = valeur par défaut)
  let wiz = null;
  let emoProps = [];

  /* ---------- Bouton de la barre du haut ---------- */

  function updateButton() {
    const k = key();
    $('#keyLabel').textContent = k ? H().label(k) : 'Pas de tonalité';
    $('#keyBtn').classList.toggle('on', !!k);
    $('#keyBtn').title = `Key, harmonie de la scène « ${scene().name} » : émotion, grille d'accords, mélodie, vérification`;
  }

  /* ---------- Pistes ---------- */

  /** Piste des accords : celle de la couche « Accords » de la grille, sinon la piste en cours si c'est une piste Accord / Arpège, sinon la première. */
  function chordTrack() {
    const list = instTracks().filter((t) => t.category !== 'mono');
    const g = scene().grid;
    const chosen = g && list.find((t) => t.id === g.layers.comp.dst);
    if (chosen) return chosen;
    const active = app.activeTrack && app.activeTrack();
    if (active && list.includes(active)) return active;
    return list.find((t) => t.category === 'chord') || list[0] || null;
  }

  /** Piste qui joue les accords écoutés : la piste en cours si c'est un instrument, sinon la piste d'accords. */
  function previewTrack() {
    const active = app.activeTrack && app.activeTrack();
    if (active && active.type === 'instrument') return active;
    return chordTrack() || instTracks()[0] || null;
  }

  /** Piste proposée pour une couche : piste Mono de basse la plus grave, lead la plus aiguë, piste Arpège… */
  function defaultDst(group, srcId) {
    const monos = instTracks().filter((t) => t.category === 'mono' && t.id !== srcId);
    const others = monos.filter((t) => !isBass(t));
    const named = (re) => monos.find((t) => re.test(t.name));
    if (group === 'Basse') return monos.find(isBass) || [...monos].sort((a, b) => avgPitch(a) - avgPitch(b))[0] || null;
    if (group === 'Mélodie') return named(/lead|m[ée]lodie|chant|th[èe]me/i) || [...others].sort((a, b) => avgPitch(b) - avgPitch(a))[0] || null;
    return named(/arp/i) || instTracks().find((t) => t.category === 'arp' && t.id !== srcId) || others[0] || null;
  }

  /* ---------- Écrire dans les pistes ---------- */

  function setKey(k) {
    const sc = scene();
    if (k && H().valid(k)) sc.key = { tonic: k.tonic, mode: k.mode };
    else delete sc.key;
    app.changed();
    app.renderAll(); // le piano roll met en évidence les notes de la nouvelle gamme
    sync();
  }

  function setTempo(bpm) {
    proj().tempo = bpm;
    $('#tempo').value = bpm;
  }

  /**
   * Pose une proposition sur la grille de la scène, répétée jusqu'à la fin : `pr.grid` (grilles de référence :
   * accords de grille avec leur durée en mesures) ou un accord par mesure d'après `pr.chords` (makeChord).
   */
  function putOnGrid(pr) {
    const g = grid();
    const { spb, total } = gStep();
    const list = pr.grid || pr.chords.map((c) => H().toGridChord(pr.key, c, c.degree)).filter(Boolean);
    g.chords = [];
    for (let s = 0, i = 0; s < total && list.length; i++) {
      const { bars = 1, ...c } = list[i % list.length];
      const len = Math.max(1, Math.round(bars * spb));
      g.chords.push({ step: s, len: Math.min(len, total - s), ...c });
      s += len;
    }
  }

  function listenChords(chords) {
    const t = previewTrack();
    if (!t) return toast('Ajoutez une piste Instrument ou Synthé pour écouter.');
    let near = 54;
    chords.forEach((c, i) =>
      setTimeout(() => {
        const notes = H().voice(c, near, 54);
        near = notes[c.bassPc != null ? 1 : 0]; // la fondamentale (pas la basse imposée)
        SS.audio.preview(t, notes, 0.75);
      }, i * 800)
    );
  }

  /* ---------- Émotions ---------- */

  /** Tonique d'une proposition : celle de la scène, sinon celle d'une autre scène (le morceau garde son centre), sinon la sienne. */
  function anchorTonic() {
    const k = key();
    if (k) return k.tonic;
    const other = proj().scenes.map((sc) => sc.key).find((x) => x && H().valid(x));
    return other ? other.tonic : null;
  }

  function proposalsOf(emo) {
    const tonic = anchorTonic();
    return emo.proposals.map((pr) => {
      const k = { tonic: tonic || pr.tonic, mode: pr.mode };
      const chords = pr.seq.map(([d, t, a]) => H().makeChord(k, d, t, a || 0));
      const fill = (txt) => SS.fillEmotionText(txt, chords, k.tonic, H().french);
      return { ...pr, key: k, chords, why: fill(pr.why), caveat: fill(pr.caveat) };
    });
  }

  /** Grille de référence (SS.EMOTION_LIBRARY) → proposition jouable, transposée sur la tonique de la scène. */
  function libOption(e) {
    const k = { tonic: anchorTonic() || e.tonic, mode: e.mode };
    const shift = H().scale(k)[0].pc - H().scale({ tonic: e.tonic, mode: e.mode })[0].pc;
    const bars = SS.libraryBars(e);
    const gridList = e.chords
      .trim()
      .split(/\s+/)
      .map((sym, i) => {
        const c = SS.parseLibraryChord(sym);
        const g = c && H().toGridChord(k, { rootPc: (c.rootPc + shift + 12) % 12, type: c.type });
        return g && { ...g, ...(c.bass ? { bass: c.bass } : {}), bars: bars[i] };
      })
      .filter(Boolean);
    const chords = gridList.map((g) => H().gridChord(k, g.degree, g.type, g.acc, g.bass || 0));
    return { kind: 'ref', ref: e, key: k, grid: gridList, chords, tempo: null, label: e.label, src: SS.EMOTION_SOURCES[e.src] };
  }

  /** Les trois pistes d'une émotion, puis ses grilles de référence. */
  const optionsOf = (emo) => [...proposalsOf(emo), ...SS.libraryFor(emo.id).map(libOption)];

  const modeName = (id) => (SS.MODE_MOODS.find((m) => m.mode === id) || {}).name || (H().MODES.find((m) => m.id === id) || {}).label || id;

  const stepChips = (chords) =>
    chords.map((c) => `<span class="hm-step role-${c.role.id}${c.borrowed ? ' borrowed' : ''}" title="${esc(c.notes.join('–'))}"><b>${esc(c.numeral)}</b>${esc(c.name)}</span>`).join('');

  function propCard(pr, i, { pick = false, on = false, tags = false } = {}) {
    const btns = pick
      ? `<button type="button" class="btn btn-small" data-wlisten="${i}">▶ Écouter</button>`
      : `<button type="button" class="btn btn-small" data-emo-listen="${i}">▶ Écouter</button><button type="button" class="btn btn-small btn-accent" data-emo-apply="${i}" title="Pose ces accords sur la grille de la scène (onglet 2)">Poser sur la grille</button>`;
    const ref = pr.kind === 'ref';
    const kind = ref ? `<span class="emo-kind k-ref">Référence</span><b class="hm-ref-l">${esc(pr.label)}</b>` : `<span class="emo-kind k-${pr.kind}">${SS.EMOTION_KINDS[pr.kind]}</span>`;
    const src = ref && pr.src ? (pr.src.url ? `<a href="${esc(pr.src.url)}" target="_blank" rel="noopener">${esc(pr.src.name)} ↗</a>` : esc(pr.src.name)) + (pr.src.note ? ` <span class="hm-muted">(${esc(pr.src.note)})</span>` : '') : '';
    // les autres émotions que la grille illustre (cliquables) ; `tags` = l'émotion affichée, qu'on ne répète pas
    const emoTags = ref && tags ? pr.ref.emos.filter((id) => id !== tags).map((id) => `<button type="button" class="chip emo-tag" data-emo="${id}">${esc(SS.findEmotion(id).label)}</button>`).join('') : '';
    return `<div class="hm-ex${ref ? ' ref' : ''}${pick ? ' pick' : ''}${on ? ' on' : ''}"${pick ? ` data-wpick="${i}" tabindex="0" role="radio" aria-checked="${on}"` : ''}>
      <div class="hm-ex-top">${kind}<span class="hm-ex-meta">${esc(H().label(pr.key))}${pr.tempo ? ` · ${pr.tempo} BPM` : ''}</span><span class="hm-ex-btns">${btns}</span></div>
      <div class="hm-progchords">${stepChips(pr.chords)}</div>
      ${ref ? `<p class="hm-why hm-src">${emoTags}<span>Source : ${src}</span></p>` : `<p class="hm-why">${esc(pr.why)}</p>`}
    </div>`;
  }

  function colorLine(modeId) {
    const md = H().MODES.find((m) => m.id === modeId);
    if (md.color != null) return `Note caractéristique : <b>${esc(md.colorText)}</b>. Les accords qui la contiennent sont marqués « couleur du mode » ; faites-la entendre dans la mélodie.`;
    if (modeId === 'major') return 'Le mode de référence : la dominante attire vers la tonique.';
    if (modeId === 'harmonic') return 'La sensible (7<sup>e</sup> degré haussé) tire vers la tonique : tension, drame.';
    return 'Pas de sensible : la boucle tourne sans se résoudre.';
  }

  /** Pose une proposition sur la grille de la scène en cours (tonalité, émotion, tempo si demandé), puis ouvre l'onglet Grille. */
  function applyProposal(pr, emo, withTempo) {
    const sc = scene();
    if (grid().chords.length && !confirm(`Remplacer la grille de la scène « ${sc.name} » ?`)) return;
    sc.key = { ...pr.key };
    emo = emo || SS.findEmotion(pr.ref.emos[0]);
    sc.emotion = emo.id;
    withTempo = withTempo && !!pr.tempo;
    if (withTempo) setTempo(pr.tempo);
    putOnGrid(pr);
    if (grid().auto) generateGrid({ auto: true });
    else app.changed();
    app.renderAll();
    tab = 'gri';
    sync();
    toast(`« ${sc.name} » : ${emo.label}, ${pr.chords.map((c) => c.name).join(' – ')} en ${H().label(pr.key)}${withTempo ? `, ${pr.tempo} BPM` : ''}. Choisissez les couches en bas, puis Générer.`, 5000);
  }

  /** Essai A/B : copie la scène en cours, puis change un seul paramètre dans la copie. */
  function abTest(id) {
    const p = proj();
    const k = key();
    const tr = H().TRANSFORMS.find((x) => x.id === id);
    let target;
    if (id === 'pedal') {
      const monos = p.tracks.filter((t) => t.type === 'instrument' && t.category === 'mono' && t.events.length);
      target = monos.find(isBass) || monos.sort((a, b) => avgPitch(a) - avgPitch(b))[0];
      if (!target) return toast('Il faut une piste de basse avec des notes (onglet Grille ▸ Basse, puis Générer).');
    } else {
      target = chordTrack();
      if (!target || !target.events.length) return toast('Il faut une piste d’accords avec des accords posés.');
    }
    const r = H().transform(id, target.events, k);
    if (!r.changed) return toast(`« ${tr.label} » ne change rien ici (aucun accord concerné).`);
    const before = scene().name;
    $('#sceneCopy').click(); // nouvelle scène, copie de la scène en cours (avec sa tonalité), qui devient la scène éditée
    const sc = SS.currentScene(p);
    sc.name = (before + ' B').slice(0, 40);
    byId(target.id).events = r.events;
    app.changed();
    app.renderAll();
    SS.song.render();
    sync();
    toast(`Scène « ${sc.name} » : ${tr.label}. Comparez-la à « ${before} » en changeant de scène pendant la lecture.`, 6000);
  }

  /* ================================================================ */
  /* Assistant                                                         */
  /* ================================================================ */

  const STEPS = ['Ambiance', 'Grille d’accords'];

  function newWiz() {
    return { step: 0, emo: scene().emotion || null, pick: 0, tempo: proj().scenes.length === 1 };
  }

  function renderWizard() {
    $('#hmSteps').innerHTML = STEPS.map(
      (s, i) => `<span class="hm-st${i === wiz.step ? ' on' : i < wiz.step ? ' past' : ''}"><i>${i < wiz.step ? '✓' : i + 1}</i>${s}</span>`
    ).join('');
    const body = $('#hmBody');
    const emo = SS.findEmotion(wiz.emo);
    const sc = scene();
    if (emo) emoProps = optionsOf(emo);
    if (wiz.step === 0) {
      body.innerHTML = `<p class="hm-q">Quelle ambiance pour « ${esc(sc.name)} » ?</p>
        <p class="hm-muted">Du plus lumineux au plus sombre. Sous chaque émotion, le mode qui lui donne sa couleur.</p>
        <div class="hm-emogrid">${SS.MODE_MOODS.flatMap((m) =>
          m.emotions.map((id) => {
            const e = SS.findEmotion(id);
            return `<button type="button" class="hm-emo${id === wiz.emo ? ' on' : ''}" data-wemo="${id}" style="--lum:${m.lum}"><b>${esc(e.label)}</b><span>${esc(m.name)} · ${esc(m.mood)}</span></button>`;
          })
        ).join('')}</div>`;
    } else {
      const pr = emoProps[wiz.pick];
      body.innerHTML = `<p class="hm-q">Choisissez une grille pour « ${esc(emo.label)} »</p>
        <p class="hm-muted">Trois pistes (évidence, nuance, surprise), puis des grilles de référence. Écoutez, puis cliquez sur celle qui vous parle le plus. « Créer » la pose sur la grille (répétée jusqu'à la fin de la scène) et écrit la basse et les accords.</p>
        <div class="hm-exs" role="radiogroup">${emoProps.map((x, i) => propCard(x, i, { pick: true, on: i === wiz.pick })).join('')}</div>
        ${pr.tempo ? `<label class="emo-opt"><input type="checkbox" id="hmWizTempo"${wiz.tempo ? ' checked' : ''}> régler aussi le tempo sur ${pr.tempo} BPM (tout le morceau${proj().scenes.length > 1 ? ', toutes les scènes' : ''})</label>` : ''}`;
    }
    const pr = wiz.step > 0 && emoProps[wiz.pick];
    $('#hmFoot').innerHTML = `
      <span class="hm-foot-info">${wiz.step === 0 ? `Scène « ${esc(sc.name)} »${emo ? ' · ' + esc(emo.label) : ''}` : `${esc(emo.label)} · ${esc(H().label(pr.key))}${pr.tempo ? ` · ${pr.tempo} BPM` : ''}`}</span>
      ${wiz.step === 0 ? '<button type="button" class="btn" id="hmWizSkip">Choisir la tonalité moi-même</button>' : '<button type="button" class="btn" id="hmWizBack">Retour</button>'}
      <button type="button" class="btn btn-accent" id="hmWizNext"${wiz.step === 0 && !emo ? ' disabled' : ''}>${wiz.step === 1 ? 'Créer' : 'Suivant'}</button>`;
  }

  /** Assistant, « Créer » : tonalité, émotion, grille ; les couches cochées de la grille sont écrites. */
  function wizCreate() {
    const emo = SS.findEmotion(wiz.emo);
    const pr = emoProps[wiz.pick];
    const sc = scene();
    sc.key = { ...pr.key };
    sc.emotion = emo.id;
    if (wiz.tempo && pr.tempo) setTempo(pr.tempo);
    putOnGrid(pr);
    view = 'tabs';
    tab = 'gri';
    viewEmo = emo.id;
    generateGrid({ quiet: true });
    sync();
    toast(`« ${sc.name} » : ${emo.label} en ${H().label(pr.key)}, ${pr.chords.map((c) => c.name).join(' – ')}. Retouchez la grille et les couches, puis l'onglet Mélodie. Ctrl+Z annule.`, 6000);
  }

  /* ================================================================ */
  /* Onglets                                                           */
  /* ================================================================ */

  const ALL = '__all'; // onglet Ambiance : toute la bibliothèque

  function renderAmb() {
    const sc = scene();
    const emoId = viewEmo || sc.emotion;
    const all = emoId === ALL;
    const emo = all ? null : SS.findEmotion(emoId);
    if (emo) emoProps = optionsOf(emo);
    else if (all) emoProps = SS.EMOTION_LIBRARY.map(libOption);
    const used = new Set(emo || all ? emoProps.map((x) => x.key.mode) : []);
    const count = (id) => SS.libraryFor(id).length;
    const list = SS.MODE_MOODS.map(
      (m) => `<div class="hm-mode${emo && m.emotions.includes(emo.id) ? ' on' : ''}${!all && emo && used.has(m.mode) && !m.emotions.includes(emo.id) ? ' used' : ''}">
        <div class="hm-mode-h"><b>${esc(m.name)}</b><span>${esc(m.mood)}</span></div>
        <div class="chips">${m.emotions
          .map((id) => `<button type="button" class="chip emo-chip${id === emoId ? ' active' : ''}${id === sc.emotion ? ' current' : ''}" data-emo="${id}" title="${id === sc.emotion ? 'Émotion de cette scène · ' : ''}3 pistes + ${count(id)} grille${count(id) > 1 ? 's' : ''} de référence">${esc(SS.findEmotion(id).label)}<small>${count(id)}</small></button>`)
          .join('')}</div></div>`
    ).join('');
    const lexicon = `<details class="hm-more hm-lex"><summary>Lexique des accords</summary><dl class="emo-matrix">${SS.CHORD_LEXICON.map(([n, t, ex]) => `<dt>${esc(n)}</dt><dd>${esc(t)} · <span class="hm-muted">${esc(ex)}</span></dd>`).join('')}</dl>
      <p class="hm-muted">Les couleurs des accords : <span class="hm-legend role-repos">repos</span> <span class="hm-legend role-prep">préparation</span> <span class="hm-legend role-tension">tension</span> <span class="hm-legend role-color">couleur du mode</span> ; en pointillé, un emprunt hors de la gamme.</p></details>`;
    let right = `<p class="hm-q">Quelle ambiance pour « ${esc(sc.name)} » ?</p><p class="hm-muted">Choisissez une émotion à gauche : trois pistes (évidence, nuance, surprise) et des grilles de référence relevées dans des guides de composition. Écoutez-les, puis « Poser sur la grille » : vous ajustez ensuite les accords et les couches dans l'onglet Grille.</p>${lexicon}`;
    if (all) {
      const groups = [...SS.MODE_MOODS.map((m) => m.mode)]
        .map((mode) => ({ mode, items: emoProps.map((x, i) => [x, i]).filter(([x]) => x.key.mode === mode) }))
        .filter((g) => g.items.length);
      right = `<div class="hm-ex-head"><h3>Bibliothèque</h3><span>${emoProps.length} grilles de référence, du plus lumineux au plus sombre</span></div>
        <p class="hm-muted">Chaque grille est jouée dans le mode où elle s'entend et transposée sur la tonique de la scène${anchorTonic() ? ` (${esc(anchorTonic())})` : ''}. Les émotions sont des couleurs possibles : le tempo, la mélodie et le jeu comptent autant.</p>
        ${groups.map((g) => `<div class="hm-lib-g"><div class="hm-lbl">${esc(modeName(g.mode))} · ${g.items.length}</div><div class="hm-exs">${g.items.map(([x, i]) => propCard(x, i, { tags: true })).join('')}</div></div>`).join('')}
        ${lexicon}`;
    } else if (emo) {
      const m = SS.emotionMode(emo.id);
      const tempoOn = ambTempo ?? proj().scenes.length === 1;
      const gen = genById(emo.melodyGen);
      const abs = [...emo.ab, ...H().TRANSFORMS.map((t) => t.id).filter((id) => !emo.ab.includes(id))];
      const dim = (name, v) => `<span class="emo-dim"><small>${name}</small><i style="--v:${v}%"></i><b>${v}</b></span>`;
      const props = emoProps.filter((x) => x.kind !== 'ref');
      const refs = emoProps.map((x, i) => [x, i]).filter(([x]) => x.kind === 'ref');
      // modes de toutes les grilles de l'émotion : la couleur dominante et les autres possibles
      const modes = {};
      emoProps.forEach((x) => (modes[x.key.mode] = (modes[x.key.mode] || 0) + 1));
      const modeLine = Object.entries(modes)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `<span class="hm-mchip${id === m.mode ? ' main' : ''}">${esc(modeName(id))} <b>${n}</b></span>`)
        .join('');
      right = `
        <div class="hm-ex-head"><h3>${esc(emo.label)}</h3><span>→ ${esc(m.name)} · ${esc(m.mood)}</span>${sc.emotion === emo.id ? '<em class="hm-cur">émotion de cette scène</em>' : ''}</div>
        <p class="hm-color">${colorLine(m.mode)}</p>
        <p class="hm-modes-line"><span class="hm-muted">Modes de ses ${emoProps.length} grilles :</span>${modeLine}</p>
        <div class="hm-lbl">Trois pistes</div>
        <div class="hm-exs">${props.map((pr, i) => propCard(pr, i)).join('')}</div>
        <label class="emo-opt"><input type="checkbox" id="hmEmoTempo"${tempoOn ? ' checked' : ''}> « Poser sur la grille » règle aussi le tempo conseillé (tout le morceau)</label>
        ${refs.length ? `<div class="hm-lbl">Grilles de référence · ${refs.length}</div><div class="hm-exs">${refs.map(([x, i]) => propCard(x, i, { tags: emo.id })).join('')}</div>` : ''}
        <details class="hm-more"><summary>En savoir plus : repères, réserves, mélodie, essais A/B</summary>
          <div class="emo-dims">${dim('Valence', emo.dims[0])}${dim('Activation', emo.dims[1])}${dim('Tension', emo.dims[2])}<span class="hm-muted">repères subjectifs</span></div>
          <dl class="emo-matrix">
            <dt>Harmonie</dt><dd>${esc(emo.harmony)}</dd><dt>Mélodie</dt><dd>${esc(emo.melody)}</dd>
            <dt>Rythme, texture</dt><dd>${esc(emo.texture)}</dd><dt>Risque</dt><dd>${esc(emo.risk)}</dd>
            ${props.map((pr) => `<dt>Réserve ${SS.EMOTION_KINDS[pr.kind].toLowerCase()}</dt><dd>${esc(pr.caveat)}</dd>`).join('')}
          </dl>
          <p class="hm-muted"><b>Mélodie conseillée</b> : « ${esc(gen ? gen.label : '')} » (${esc(gen ? gen.text : '')}).
            <button type="button" class="btn btn-small" id="hmEmoMel">Composer la mélodie ↗</button></p>
          <div class="emo-ab">
            <b>Essai A/B</b> <span class="hm-muted">La scène est copiée (scène « … B ») et un seul paramètre change. Passez de l'une à l'autre pendant la lecture et gardez celle qui communique le mieux l'intention.</span>
            <div class="chips">${abs
              .map((id) => {
                const t = H().TRANSFORMS.find((x) => x.id === id);
                return `<button type="button" class="chip${emo.ab.includes(id) ? ' emo-rec' : ''}" data-ab="${id}" title="${esc(t.text)}"${key() ? '' : ' disabled'}>${esc(t.label)}</button>`;
              })
              .join('')}</div>
          </div>
          <p class="hm-muted">Aucune suite d'accords n'encode une émotion à coup sûr : la mélodie, le tempo, le timbre et le contexte comptent autant. Pour une trajectoire (solitude → espoir…), donnez une émotion à chaque scène.</p>
        </details>
        ${lexicon}`;
    }
    $('#hmBody').innerHTML = `<div class="hm-amb"><div class="hm-amb-l"><button type="button" class="chip hm-all${all ? ' active' : ''}" data-emo="${ALL}">Toutes les grilles · ${SS.EMOTION_LIBRARY.length}</button><div class="hm-lbl">Du plus lumineux au plus sombre</div><div class="hm-modes">${list}</div></div><div class="hm-amb-r">${right}</div></div>`;
  }

  const noKeyMsg = () =>
    `<p class="hm-empty">La scène « ${esc(scene().name)} » n'a pas encore de tonalité. Choisissez-la en haut, cliquez sur <b>Détecter</b>, ou partez d'une émotion avec l'<button type="button" class="btn btn-small" data-go-wiz>Assistant</button>.</p>`;

  const KIND = { warn: 'À vérifier', info: 'Emprunt', tip: 'Conseil' };

  /** Pistes de mélodie d'une scène : Mono, pas la basse (piste « Mélodie », lead, chant…). */
  const isMelody = (t, evs) => t.type === 'instrument' && t.category === 'mono' && evs.length && (t.melody || (!isBass(t) && evs.reduce((a, e) => a + Math.max(...e.notes), 0) / evs.length >= 55));

  /** Contrôles de la grille et des mélodies d'une scène (en plus de H().analyze). → { grid: [items], melodies: [{ track, items, stats }] } */
  function sceneChecks(sec) {
    const p = proj();
    const sc = p.scenes.find((x) => x.id === sec.id);
    const k = sec.key;
    if (!sc || !k) return { grid: [], melodies: [] };
    const evsOf = (t) => (sc.data[t.id] && sc.data[t.id].events) || [];
    const gch = sc.grid && sc.grid.chords.length ? [...sc.grid.chords].sort((a, b) => a.step - b.step).map((c) => ({ step: c.step, len: c.len, c: H().gridChord(k, c.degree, c.type, c.acc, c.bass) })) : [];
    const chordEvs = instTracks().filter((t) => t.category !== 'mono').flatMap(evsOf);
    // la grille n'est la référence que si elle a été générée dans les pistes (sinon : les accords joués)
    const comp = sc.grid && sc.grid.layers.comp;
    const live = gch.length && comp && comp.on && sc.data[comp.dst] && sc.grid.sig[comp.dst] === sigOf(sc.data[comp.dst].events);
    const useGrid = gch.length && (live || !chordEvs.length);
    const chordAt = (st) => {
      const g = useGrid && gch.find((x) => st >= x.step && st < x.step + x.len);
      if (g) return { pcs: H().voice(g.c, 60).map(H().pcOf), name: g.c.name };
      const on = chordEvs.filter((e) => st >= e.step && st < e.step + e.len);
      if (!on.length) return null;
      const id = on.map((e) => H().identify(e.notes)).find(Boolean);
      return { pcs: on.flatMap((e) => e.notes.map(H().pcOf)), name: id ? H().chordName(k, id) : '' };
    };
    // grille : centre, tensions résolues, fin
    const grid = [];
    if (gch.length && !live && chordEvs.length)
      grid.push({ kind: 'warn', text: 'La grille (onglet 2) diffère des accords joués par les pistes.', hint: 'Cliquez sur « Générer » dans l’onglet Grille pour écrire la grille dans les pistes ; la mélodie est vérifiée sur les accords joués.' });
    if (gch.length) {
      const roles = gch.map((x) => x.c.role.id);
      const first = gch[0].c;
      const last = gch[gch.length - 1].c;
      if (!roles.includes('repos')) grid.push({ kind: 'tip', text: 'Aucun accord de repos sur la grille : le centre tonal reste flou.', hint: `Placer ${H().gridPalette(k).simple[0].name} au début ou à la fin pour l’ancrer.` });
      else if (first.role.id === 'repos') grid.push({ kind: 'ok', text: `Commence sur le centre (${first.name}).` });
      const tens = roles.map((r, i) => (r === 'tension' ? i : -1)).filter((i) => i >= 0);
      const resolved = tens.filter((i) => roles[(i + 1) % roles.length] === 'repos');
      if (tens.length && !resolved.length) grid.push({ kind: 'tip', text: 'Les accords de tension ne vont jamais vers le repos.', hint: 'Une tension (V, vii°) appelle la tonique juste après : c’est la cadence.' });
      else if (resolved.length) grid.push({ kind: 'ok', text: `Cadence : ${gch[resolved[0]].c.name} → ${gch[(resolved[0] + 1) % gch.length].c.name}.` });
      if (last.role.id === 'repos') grid.push({ kind: 'ok', text: `Finit sur le repos (${last.name}) : la boucle est fermée.` });
      else if (last.role.id === 'tension') grid.push({ kind: 'ok', text: `Finit sur une tension (${last.name}) : elle relance la boucle vers ${first.name}.` });
      else grid.push({ kind: 'tip', text: `Finit sur ${last.name} (${last.role.label}) : la fin reste suspendue.`, hint: 'Voulu pour enchaîner sur la scène suivante ? Sinon, finir sur une tension ou le repos.' });
      const out = gch.filter((x) => x.c.borrowed).map((x) => x.c.name);
      if (out.length) grid.push({ kind: 'info', text: `Emprunt${out.length > 1 ? 's' : ''} : ${[...new Set(out)].join(', ')}.`, hint: 'Une couleur hors de la gamme : la mélodie évite ou suit sa note altérée.' });
    }
    const melodies = instTracks()
      .filter((t) => isMelody(t, evsOf(t)))
      .map((t) => ({ track: t, ...SS.melody.checkMelody({ events: evsOf(t), chordAt, key: k, spb: SS.stepsPerBar(p), beat: SS.stepsPerBeat(p) }) }));
    return { grid, melodies };
  }

  const ICON = { ok: '✓', warn: '!', tip: '•', info: 'i' };
  const checkList = (items) =>
    `<ul class="hm-checks2">${items.map((r) => `<li class="k-${r.kind}"><span class="ck">${ICON[r.kind]}</span><div>${esc(r.text)}${r.hint ? `<small>${esc(r.hint)}</small>` : ''}</div></li>`).join('')}</ul>`;

  function renderVer(res, extra) {
    const cur = scene().id;
    const ordered = [...res.filter((r) => r.id === cur), ...res.filter((r) => r.id !== cur)];
    $('#hmBody').innerHTML =
      `<div class="hm-stack hm-ver">${ordered
        .map((sec) => {
          const x = extra.get(sec.id);
          const melNames = new Set(x.melodies.map((m) => m.track.name));
          const remarks = sec.remarks.filter((r) => !melNames.has(r.track)); // la mélodie a ses propres contrôles
          const warns = remarks.filter((r) => r.kind === 'warn').length + x.grid.filter((i) => i.kind === 'warn').length + x.melodies.reduce((a, m) => a + m.items.filter((i) => i.kind === 'warn').length, 0);
          const pill = !sec.key
            ? '<span class="hm-pill none">pas de tonalité</span>'
            : warns
            ? `<span class="hm-pill warn">${warns} à vérifier</span>`
            : '<span class="hm-pill ok">rien à signaler</span>';
          const prog = sec.progressions
            .map((pr) => `<div class="hm-prog"><span class="hm-track">${esc(pr.track)}</span>${pr.items.map((it) => `<span class="hm-step st-${it.status}" title="${esc(it.status)}${it.why ? ' : ' + esc(it.why) : ''}"><b>${esc(it.numeral)}</b>${esc(it.name)}</span>`).join('')}</div>`)
            .join('');
          const rem = remarks.length
            ? `<ul class="hm-remarks">${remarks
                .map((r) => `<li class="k-${r.kind}"><span class="hm-badge">${KIND[r.kind]}</span><div><b>${esc(r.track)}</b> · ${esc(r.where)}<br>${esc(r.text)}<br><small>${esc(r.hint)}</small></div></li>`)
                .join('')}</ul>`
            : '';
          const mel = x.melodies.length
            ? x.melodies.map((m) => `<div class="hm-vsec"><h5>Mélodie · ${esc(m.track.name)}<small>${m.stats ? m.stats.notes + ' notes' : ''}</small></h5>${m.items.length ? checkList(m.items) : '<p class="hm-muted">Trop peu de notes pour juger.</p>'}</div>`).join('')
            : '<div class="hm-vsec"><h5>Mélodie</h5><p class="hm-muted">Pas de mélodie dans cette scène (onglet 3).</p></div>';
          const body = sec.key
            ? `<div class="hm-vsec"><h5>Accords</h5>${x.grid.length ? checkList(x.grid) : ''}${prog || '<p class="hm-muted">Pas d’accords dans cette scène.</p>'}${rem}</div>${mel}`
            : '<p class="hm-muted">Choisissez sa tonalité pour l’analyser.</p>';
          return `<div class="hm-scene${sec.id === cur ? ' current' : ''}" data-scene="${esc(sec.id)}">
            <div class="hm-scene-h"><b>${esc(sec.name)}</b><span class="hm-muted">${sec.key ? esc(H().label(sec.key)) : ''}${sec.id === cur ? ' · scène en cours' : ''}</span>${pill}</div>
            ${body}</div>`;
        })
        .join('')}</div>`;
  }

  /* ================================================================ */
  /* Onglet Grille : poser ses accords sur une ligne, générer basse,   */
  /* accords et arpège d'un coup                                       */
  /* ================================================================ */
  // La grille est rangée dans la scène (scene.grid, voir SS.normalizeGrid) : accords par degré, réglages
  // des trois couches, et l'empreinte des notes écrites par la grille dans chaque piste (une piste
  // retouchée à la main n'est pas écrasée sans le demander).

  const RHYTHMS = [
    { id: 'hold', label: 'Tenus (toute la durée)' },
    { id: 'beats', label: 'Stabs sur les temps' },
    { id: 'pump', label: 'Pompe en croches' },
    { id: 'charleston', label: 'Charleston (1 et 2&)' },
  ];
  const GLAYERS = [
    { id: 'bass', title: 'Basse', cat: 'mono', make: { name: 'Basse', color: '#3fcf3f', category: 'mono', family: 'bass', instrument: 'syn_sawbass' } },
    { id: 'comp', title: 'Accords', cat: 'chord', make: { name: 'Accords', color: '#1ea7ff', category: 'chord', family: 'pads', instrument: 'syn_softpad' } },
    { id: 'arp', title: 'Arpège', cat: 'arp', make: { name: 'Arpège', color: '#13c2a3', category: 'arp', family: 'synth', instrument: 'syn_pluck' } },
  ];
  const FAMS = [
    { id: 'repos', title: 'Repos', sub: 'on s’y pose' },
    { id: 'prep', title: 'Préparation', sub: 'on s’éloigne' },
    { id: 'color', title: 'Couleur du mode', sub: 'sa note caractéristique' },
    { id: 'tension', title: 'Tension', sub: 'appelle le retour' },
  ];
  const NEW = '__new';
  let gridAdv = (() => {
    try {
      return localStorage.getItem('stepseq.gridAdv') === '1';
    } catch (e) {
      return false;
    }
  })();
  let gridPlay = null; // { timers, raf } pendant « Écouter »
  let gridWarned = ''; // dernier avertissement « piste retouchée » (pour ne pas le répéter à chaque geste)

  function grid() {
    const sc = scene();
    if (!sc.grid) sc.grid = SS.normalizeGrid({ chords: [] });
    const g = sc.grid;
    for (const L of GLAYERS) {
      const l = g.layers[L.id];
      const list = gridTracks(L);
      if (l.dst !== NEW && !list.some((t) => t.id === l.dst)) {
        const def = L.id === 'bass' ? defaultDst('Basse') : list[0];
        l.dst = def && list.includes(def) ? def.id : list[0] ? list[0].id : NEW;
      }
      if (L.id === 'bass' && !genById(l.gen)) l.gen = 'bass-8';
      if (L.id === 'comp' && !RHYTHMS.some((r) => r.id === l.rhythm)) l.rhythm = 'hold';
    }
    return g;
  }
  const gridTracks = (L) => instTracks().filter((t) => t.category === L.cat);
  const gStep = () => {
    const p = proj();
    return { spb: SS.stepsPerBar(p), beat: SS.stepsPerBeat(p), total: SS.totalSteps(p) };
  };
  function gUnit(g) {
    const { spb, beat } = gStep();
    if (g.snap === 'beat') return beat;
    if (g.snap === 'half') return spb % 2 === 0 ? spb / 2 : beat;
    return spb;
  }
  const gChord = (c) => H().gridChord(key(), c.degree, c.type, c.acc, c.bass);
  const sigOf = (events) => {
    const s = events.map((e) => `${e.step}:${e.len}:${e.notes.join('.')}`).join('|');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return events.length + '.' + (h >>> 0).toString(36);
  };

  /** Événements d'accords de la grille, voix enchaînées autour de `center`, au rythme `rhythm`. */
  function gridEvents(g, center, rhythm, length) {
    const { spb, beat } = gStep();
    const half = Math.max(1, Math.round(beat / 2));
    const out = [];
    let near = center;
    for (const gc of [...g.chords].sort((a, b) => a.step - b.step)) {
      if (gc.step >= length) continue;
      const end = Math.min(gc.step + gc.len, length);
      const c = gChord(gc);
      const notes = H().voice(c, near, center);
      near = notes[c.bassPc != null ? 1 : 0]; // la fondamentale (pas la basse imposée)
      const add = (s, l, vel) => s < end && l > 0 && out.push({ step: s, len: Math.min(l, end - s), notes: [...notes], vel, chord: c.type });
      if (rhythm === 'beats') for (let s = gc.step; s < end; s += beat) add(s, half, s % spb === 0 ? 0.8 : 0.68);
      else if (rhythm === 'pump') for (let s = gc.step, i = 0; s < end; s += half, i++) add(s, Math.max(1, Math.round(half * 0.75)), i % 2 ? 0.55 : 0.75);
      else if (rhythm === 'charleston') {
        const off = Math.round(beat * 1.5);
        for (let s = gc.step; s < end; s++) {
          const pos = s % spb;
          if (s === gc.step || pos === 0) add(s, beat, 0.8);
          else if (pos === off) add(s, half, 0.7);
        }
      } else add(gc.step, end - gc.step, 0.7);
    }
    return out;
  }

  /** Écrit la basse, les accords et l'arpège d'après la grille. `auto` : après un geste sur la grille, sans question. */
  function generateGrid({ auto = false, quiet = false } = {}) {
    const k = key();
    if (!k) return;
    const p = proj();
    const g = grid();
    if (!g.chords.length && !auto) return toast('Glissez d’abord des accords sur la grille.');
    const plan = GLAYERS.filter((L) => g.layers[L.id].on).map((L) => ({ L, l: g.layers[L.id], t: byId(g.layers[L.id].dst) }));
    if (!plan.length) return auto || toast('Cochez au moins une couche à générer.');
    const ids = plan.filter((x) => x.t).map((x) => x.t.id);
    if (new Set(ids).size !== ids.length) return toast('Choisissez une piste différente pour chaque couche.');
    // retouchée à la main : notes différentes de celles que la grille y a écrites (une piste vidée compte aussi)
    const edited = plan.filter((x) => x.t && (x.t.events.length || g.sig[x.t.id]) && g.sig[x.t.id] !== sigOf(x.t.events));
    let todo = plan;
    if (auto) {
      todo = plan.filter((x) => x.t && !edited.includes(x));
      const names = edited.map((x) => x.t.name).join(', ');
      if (edited.length && gridWarned !== names) {
        gridWarned = names;
        toast(`« ${names} » a des notes qui ne viennent pas de la grille : cliquez sur Générer pour les remplacer.`, 5000);
      }
    } else if (edited.length && !confirm(`Remplacer les notes de ${edited.map((x) => `« ${x.t.name} »`).join(', ')} dans la scène « ${scene().name} » ?`)) return;
    if (!todo.length) return;
    const created = [];
    for (const x of todo) {
      if (x.t) continue;
      x.t = SS.newTrack({ type: 'instrument', ...x.L.make }, p);
      p.tracks.push(x.t);
      SS.audio.prepareTrack(x.t);
      x.l.dst = x.t.id;
      created.push(x.t.name);
    }
    const { spb, beat } = gStep();
    for (const { L, l, t } of todo) {
      const len = SS.trackLen(p, t);
      const center = (t.octave + 1) * 12 + 6;
      if (L.id === 'bass') t.events = H().generate(gridEvents(g, 60, 'hold', len), { kind: l.gen, octave: t.octave, spb, beat, key: k, length: len });
      else t.events = gridEvents(g, center, L.id === 'comp' ? l.rhythm : 'hold', len);
      g.sig[t.id] = sigOf(t.events);
    }
    gridWarned = '';
    app.changed();
    app.renderAll();
    if (tab === 'gri' && view === 'tabs') renderGri();
    if (!auto && !quiet)
      toast(
        `${todo.map((x) => x.L.title).join(', ')} écrit${todo.length > 1 ? 's' : ''} dans la scène « ${scene().name} »` +
          (created.length ? ` (piste${created.length > 1 ? 's' : ''} créée${created.length > 1 ? 's' : ''} : ${created.join(', ')})` : '') +
          '. Ctrl+Z annule.',
        4000
      );
  }

  /** Après chaque geste sur la grille : on la redessine, et on régénère si « Auto » est coché. */
  function gridChanged() {
    const g = grid();
    if (g.auto && g.chords.length) generateGrid({ auto: true });
    else app.changed();
    renderGri();
  }

  /** Place un accord : il remplace ce qu'il recouvre (un accord coupé en deux garde ses deux bouts). */
  function gridPut(g, chord) {
    const end = chord.step + chord.len;
    g.chords = g.chords.flatMap((c) => {
      const ce = c.step + c.len;
      if (ce <= chord.step || c.step >= end) return [c];
      const out = [];
      if (c.step < chord.step) out.push({ ...c, len: chord.step - c.step });
      if (ce > end) out.push({ ...c, step: end, len: ce - end });
      return out;
    });
    g.chords.push(chord);
    g.chords.sort((a, b) => a.step - b.step);
  }

  function gridListen(c, el) {
    const t = byId(grid().layers.comp.dst) || previewTrack();
    if (!t) return toast('Ajoutez une piste Instrument ou Synthé pour écouter les accords.');
    SS.audio.preview(t, H().voice(c, 60), 0.9);
    if (el) {
      el.classList.add('sounding');
      setTimeout(() => el.classList.remove('sounding'), 450);
    }
  }

  function stopGridPlay() {
    if (!gridPlay) return;
    gridPlay.timers.forEach(clearTimeout);
    cancelAnimationFrame(gridPlay.raf);
    gridPlay = null;
    const b = $('#grPlay');
    if (b) b.textContent = '▶ Écouter';
    const ph = $('#grPh');
    if (ph) ph.hidden = true;
  }

  /** Joue la grille (accords seuls, au tempo de la chanson), avec une tête de lecture. */
  function playGrid() {
    if (gridPlay) return stopGridPlay();
    const g = grid();
    if (!g.chords.length) return toast('La grille est vide.');
    const t = byId(g.layers.comp.dst) || previewTrack();
    if (!t) return toast('Ajoutez une piste Instrument ou Synthé pour écouter.');
    const { total } = gStep();
    const stepSec = 60 / proj().tempo / 4;
    const evs = gridEvents(g, 60, 'hold', total);
    const t0 = performance.now();
    gridPlay = { timers: evs.map((ev) => setTimeout(() => SS.audio.preview(t, ev.notes, ev.len * stepSec * 0.95), ev.step * stepSec * 1000)), raf: 0 };
    gridPlay.timers.push(setTimeout(stopGridPlay, total * stepSec * 1000 + 150));
    $('#grPlay').textContent = '■ Stop';
    const tick = () => {
      const ph = $('#grPh');
      if (!gridPlay || !ph) return;
      ph.hidden = false;
      ph.style.left = Math.min(100, ((performance.now() - t0) / 1000 / stepSec / total) * 100) + '%';
      gridPlay.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /* ---------- Rendu ---------- */

  const gData = (c) => `data-gd="${c.degree}" data-gt="${esc(c.type)}" data-ga="${c.acc || 0}"`;
  const gTitle = (c) => `${c.name} · ${c.numeral} · ${c.notes.join(' ')}${c.borrowed ? ' · emprunt' : ''} — clic : écouter, glisser : poser`;
  const token = (c, small) =>
    `<span class="gr-tok role-${c.role.id}${c.borrowed ? ' borrowed' : ''}${small ? ' small' : ''}" ${gData(c)} title="${esc(gTitle(c))}"><b>${esc(c.numeral)}</b>${small ? '' : `<span>${esc(c.name)}</span>`}</span>`;

  function gridPaletteHtml() {
    const P = H().gridPalette(key());
    if (!gridAdv) {
      const fams = FAMS.map((f) => ({ ...f, list: P.simple.filter((c) => c.role.id === f.id) })).filter((f) => f.list.length);
      return `<div class="gr-fams">${fams
        .map((f) => `<div class="gr-fam role-${f.id}" style="flex:${Math.max(2, f.list.length)}"><h5>${f.title}<small>${f.sub}</small></h5><div class="gr-toks">${f.list.map((c) => token(c)).join('')}</div></div>`)
        .join('')}</div>`;
    }
    const head = `<div class="gr-adv-h">Degré</div>${P.cols.map((c) => `<div class="gr-adv-h">${esc(c.label)}</div>`).join('')}`;
    let sep = false;
    const rows = P.rows
      .map((r) => {
        const s = r.borrowed && !sep ? ((sep = true), '<div class="gr-adv-sep">Emprunts au mineur harmonique (sensible) : la vraie dominante, qui appelle la tonique</div>') : '';
        return (
          s +
          `<div class="gr-adv-deg">${token(r.chord, true)}<strong>${esc(r.chord.name)}</strong>${r.borrowed ? '<em>emprunt</em>' : ''}</div>` +
          r.cells
            .map((c) => (c ? `<span class="gr-chip role-${c.role.id}${c.borrowed ? ' borrowed' : ''}" ${gData(c)} title="${esc(gTitle(c))}">${esc(c.name)}</span>` : '<span class="gr-no">·</span>'))
            .join('')
        );
      })
      .join('');
    return `<div class="gr-adv" style="grid-template-columns:minmax(120px,1.3fr) repeat(${P.cols.length},1fr)">${head}${rows}</div>
      <p class="hm-muted">Seuls les accords dont toutes les notes sont dans ${esc(H().label(key()))} sont proposés (« · » : une note sort de la tonalité).</p>`;
  }

  /** Aperçu des pistes des trois couches, aligné sur la grille. */
  function gridPreviewHtml(g, total) {
    return GLAYERS.map((L) => {
      const t = byId(g.layers[L.id].dst);
      if (!g.layers[L.id].on) return '';
      const evs = t ? t.events.filter((e) => e.step < total) : [];
      const all = evs.flatMap((e) => e.notes);
      const lo = Math.min(...all, 127);
      const hi = Math.max(...all, 0);
      const span = Math.max(12, hi - lo);
      const bars = evs
        .flatMap((e) => e.notes.map((n) => `<i style="left:${(e.step / total) * 100}%;width:calc(${(Math.min(e.len, total - e.step) / total) * 100}% - 1px);bottom:${2 + ((n - lo) / span) * 14}px"></i>`))
        .join('');
      return `<div class="gr-pv gr-pv-${L.id}"><label>${L.title}${t ? '' : ' · piste à créer'}</label>${bars}</div>`;
    }).join('');
  }

  function renderGri() {
    const k = key();
    if (!k) {
      $('#hmFoot').innerHTML = '<span class="hm-foot-info"></span><button type="submit" class="btn btn-accent">Fermer</button>';
      return ($('#hmBody').innerHTML = noKeyMsg());
    }
    const body = $('#hmBody');
    const keep = body.scrollTop;
    const p = proj();
    const g = grid();
    const { spb, beat, total } = gStep();
    const pct = (s) => (s / total) * 100 + '%';
    let ruler = '';
    let lines = '';
    for (let b = 0; b < p.bars; b++) {
      ruler += `<span class="gr-bar" style="left:${pct(b * spb)};width:${pct(spb)}">${b + 1}</span>`;
      for (let s = beat; s < spb; s += beat) ruler += `<i style="left:${pct(b * spb + s)}"></i>`;
      if (b) lines += `<div class="gr-bl" style="left:${pct(b * spb)}"></div>`;
      for (let s = beat; s < spb; s += beat) lines += `<div class="gr-bt" style="left:${pct(b * spb + s)}"></div>`;
    }
    const blocks = g.chords
      .map((gc, i) => {
        if (gc.step >= total) return '';
        const c = gChord(gc);
        const len = Math.min(gc.len, total - gc.step);
        return `<div class="gr-blk role-${c.role.id}${c.borrowed ? ' borrowed' : ''}${len / total < 0.07 ? ' narrow' : ''}" data-gi="${i}" tabindex="0" style="left:calc(${pct(gc.step)} + 2px);width:calc(${pct(len)} - 4px)" title="${esc(c.name + ' · ' + c.numeral + ' — clic : écouter · glisser : déplacer · hors de la grille ou Suppr : enlever')}"><b>${esc(c.name)}</b><small>${esc(c.numeral)}</small><span class="gr-rz" title="Allonger ou raccourcir"></span></div>`;
      })
      .join('');
    const progOpts = H()
      .progressions(k)
      .map((pr, i) => `<option value="p:${i}">Grille ${esc(pr.label)} · ${esc(pr.style)}</option>`)
      .join('');
    const trackOpts = instTracks()
      .filter((t) => t.category !== 'mono' && t.events.length)
      .map((t) => `<option value="t:${esc(t.id)}">Reprendre les accords de « ${esc(t.name)} »</option>`)
      .join('');
    const layerCard = (L) => {
      const l = g.layers[L.id];
      const list = gridTracks(L);
      const opts = list.map((t) => `<option value="${esc(t.id)}"${t.id === l.dst ? ' selected' : ''}>${esc(t.name)}</option>`).join('') + `<option value="${NEW}"${l.dst === NEW ? ' selected' : ''}>+ Nouvelle piste « ${L.make.name} »</option>`;
      const style =
        L.id === 'bass'
          ? `<select data-gl="bass" data-gf="gen" aria-label="Style de basse">${gensOf('Basse').map((x) => `<option value="${x.id}"${x.id === l.gen ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`
          : L.id === 'comp'
          ? `<select data-gl="comp" data-gf="rhythm" aria-label="Rythme des accords">${RHYTHMS.map((x) => `<option value="${x.id}"${x.id === l.rhythm ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`
          : `<p class="hm-muted gr-arpinfo">La piste reçoit les accords tenus ; <b>Arp One</b> les arpège selon ses réglages.</p>`;
      const arpBtn = L.id === 'arp' ? `<button type="button" class="btn btn-small" id="grArpOne"${byId(l.dst) ? '' : ' disabled'}>Réglages Arp One ↗</button>` : '';
      return `<div class="hm-layer gr-layer${l.on ? '' : ' off'}">
        <h4><label><input type="checkbox" data-gl="${L.id}" data-gf="on"${l.on ? ' checked' : ''}> ${L.title}</label><small>${L.id === 'bass' ? gensOf('Basse').length + ' styles' : L.id === 'comp' ? RHYTHMS.length + ' rythmes' : 'via Arp One'}</small></h4>
        ${style}
        <label class="field"><span>Piste</span><select data-gl="${L.id}" data-gf="dst">${opts}</select></label>
        ${arpBtn}
      </div>`;
    };
    body.innerHTML = `<div class="hm-stack gr">
      <section>
        <div class="gr-head">
          <div class="hm-lbl">Grille de la scène · ${p.bars} mesure${p.bars > 1 ? 's' : ''} en ${p.timeSig[0]}/${p.timeSig[1]}</div>
          <label class="field"><span>Aimanter</span><select id="grSnap">${[['bar', 'à la mesure'], ['half', 'à la demi-mesure'], ['beat', 'au temps']].map(([v, l]) => `<option value="${v}"${g.snap === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <select id="grFrom" aria-label="Partir d'une grille"><option value="">Partir de…</option>${progOpts}${trackOpts}</select>
          <button type="button" class="btn btn-small" id="grClear"${g.chords.length ? '' : ' disabled'}>Effacer</button>
          <button type="button" class="btn btn-small" id="grPlay">${gridPlay ? '■ Stop' : '▶ Écouter'}</button>
        </div>
        <div class="gr-scroll"><div class="gr-tl" style="min-width:${Math.max(0, p.bars * 64)}px">
          <div class="gr-ruler">${ruler}</div>
          <div class="gr-lane" id="grLane">${lines}${blocks}${g.chords.length ? '' : '<div class="gr-empty">Glissez des accords ici</div>'}</div>
          ${gridPreviewHtml(g, total)}
          <div class="gr-ph" id="grPh" hidden></div>
        </div></div>
        <p class="hm-muted">Cliquez un accord pour l'écouter, glissez-le pour le poser · déplacez un accord en le glissant · tirez son bord droit pour l'allonger · sortez-le de la grille (ou <kbd>Suppr</kbd>) pour l'enlever.</p>
      </section>
      <section>
        <div class="gr-head"><div class="hm-lbl">Accords de ${esc(H().label(k))} <span class="gr-hint">clic : écouter · glisser : poser sur la grille</span></div>
          <span class="segmented gr-mode" role="radiogroup" aria-label="Palette"><button type="button" data-grmode="simple" class="${gridAdv ? '' : 'active'}" aria-pressed="${!gridAdv}">Simple</button><button type="button" data-grmode="adv" class="${gridAdv ? 'active' : ''}" aria-pressed="${gridAdv}">Avancé · 7, 9, sus…</button></span></div>
        ${gridPaletteHtml()}
      </section>
      <section>
        <div class="hm-lbl">Ce que « Générer » écrit dans la scène</div>
        <div class="hm-layers gr-layers">${GLAYERS.map(layerCard).join('')}</div>
      </section>
    </div>`;
    body.scrollTop = keep;
    renderGriFoot();
  }

  function gridSummary(g) {
    const names = [];
    let last = null;
    for (const gc of g.chords) {
      const n = gChord(gc).name;
      if (n !== last) names.push(n);
      last = n;
    }
    return names.length ? names.slice(0, 12).join(' – ') + (names.length > 12 ? ' …' : '') : 'Grille vide';
  }

  function renderGriFoot() {
    const g = grid();
    $('#hmFoot').innerHTML = `
      <span class="hm-foot-info gr-sum">${esc(gridSummary(g))}</span>
      <label class="gr-auto" title="Réécrit les couches à chaque changement de la grille (sauf une piste retouchée à la main)"><input type="checkbox" id="grAuto"${g.auto ? ' checked' : ''}> Auto : régénérer à chaque changement</label>
      <button type="button" class="btn btn-accent" id="grGen"${g.chords.length ? '' : ' disabled'}>Générer</button>
      <button type="submit" class="btn">Fermer</button>`;
  }

  /* ---------- Gestes : glisser-déposer, allonger, écouter ---------- */

  function gridPointerDown(e) {
    if (e.button !== 0 || tab !== 'gri' || view !== 'tabs') return;
    const rz = e.target.closest('.gr-rz');
    const blk = e.target.closest('.gr-blk');
    const src = e.target.closest('[data-gd]');
    if (!rz && !blk && !src) return;
    e.preventDefault();
    const g = grid();
    const lane = $('#grLane');
    const { total } = gStep();
    const unit = gUnit(g);
    const stepAt = (x) => {
      const r = lane.getBoundingClientRect();
      return Math.max(0, Math.min(total - 1, Math.floor(((x - r.left) / r.width) * total)));
    };
    if (rz) {
      const gc = g.chords[+blk.dataset.gi];
      const move = (ev) => {
        const end = Math.min(total, Math.max(gc.step + unit, Math.round((stepAt(ev.clientX) + 1) / unit) * unit));
        gc.len = end - gc.step;
        const next = g.chords.find((c) => c !== gc && c.step > gc.step);
        if (next && end > next.step) {
          const ne = next.step + next.len;
          next.step = end;
          next.len = ne - end;
          if (next.len <= 0) g.chords.splice(g.chords.indexOf(next), 1);
        }
        blk.style.width = `calc(${(gc.len / total) * 100}% - 4px)`;
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        gridChanged();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      return;
    }
    const moving = blk ? g.chords[+blk.dataset.gi] : null;
    const chord = moving ? { degree: moving.degree, type: moving.type, acc: moving.acc, ...(moving.bass ? { bass: moving.bass } : {}) } : { degree: +src.dataset.gd, type: src.dataset.gt, acc: +src.dataset.ga };
    const len = moving ? moving.len : unit;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const el = blk || src;
    let started = false;
    let target = null;
    const fly = document.createElement('div');
    fly.className = 'gr-fly';
    fly.textContent = gChord(chord).name;
    const ghost = document.createElement('div');
    ghost.className = 'gr-ghost';
    const dlg = $('#harmonyDialog');
    const inside = (x, y) => {
      const r = $('.gr-tl').getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom + 24;
    };
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        started = true;
        dlg.append(fly);
        el.classList.add('dragging');
      }
      fly.style.left = ev.clientX + 'px';
      fly.style.top = ev.clientY + 'px';
      if (inside(ev.clientX, ev.clientY)) {
        target = Math.floor(stepAt(ev.clientX) / unit) * unit;
        ghost.style.left = `calc(${(target / total) * 100}% + 2px)`;
        ghost.style.width = `calc(${(Math.min(len, total - target) / total) * 100}% - 4px)`;
        if (!ghost.parentNode) lane.append(ghost);
        fly.classList.remove('out');
      } else {
        target = null;
        ghost.remove();
        fly.classList.toggle('out', !!moving);
      }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      fly.remove();
      ghost.remove();
      el.classList.remove('dragging');
      if (!started) {
        if (blk) blk.focus(); // Suppr enlève l'accord
        return gridListen(gChord(chord), el);
      }
      if (moving) g.chords.splice(g.chords.indexOf(moving), 1);
      if (target !== null) gridPut(g, { step: target, len: Math.min(len, total - target), ...chord });
      if (moving || target !== null) gridChanged();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  function gridKeyDown(e) {
    const blk = e.target.closest && e.target.closest('.gr-blk');
    if (!blk || !['Delete', 'Backspace'].includes(e.key)) return;
    e.preventDefault();
    grid().chords.splice(+blk.dataset.gi, 1);
    gridChanged();
  }

  /** Remplit la grille : une grille connue (un accord par mesure, répétée) ou les accords d'une piste. */
  function gridFrom(v) {
    const g = grid();
    const k = key();
    const { spb, total } = gStep();
    let chords;
    let msg;
    if (v.startsWith('p:')) {
      const pr = H().progressions(k)[+v.slice(2)];
      chords = [];
      for (let s = 0, i = 0; s < total; s += spb, i++) {
        const c = pr.chords[i % pr.chords.length];
        chords.push({ step: s, len: Math.min(spb, total - s), degree: c.degree, type: c.type, acc: 0 });
      }
      msg = `Grille ${pr.label} posée.`;
    } else {
      const t = byId(v.slice(2));
      const r = H().gridFromEvents(k, t.events);
      chords = r.chords;
      msg = `${chords.length} accord${chords.length > 1 ? 's' : ''} repris de « ${t.name} »` + (r.skipped ? ` (${r.skipped} hors de la tonalité, laissé${r.skipped > 1 ? 's' : ''} de côté).` : '.');
    }
    if (g.chords.length && !confirm(`Remplacer la grille de la scène « ${scene().name} » ?`)) return renderGri();
    g.chords = chords;
    gridChanged();
    toast(msg);
  }

  /* ================================================================ */
  /* Onglet Mélodie : le panneau Mélodie de Band, sur la grille        */
  /* ================================================================ */

  /** Instrument d'une nouvelle piste « Mélodie » : la voix ou le lead d'un groupe Band. */
  function leadOpts() {
    try {
      return SS.band.melodyTrackOpts();
    } catch (e) {
      return { type: 'instrument', name: 'Mélodie', color: '#ff8c1a', category: 'mono', family: 'synth', instrument: 'syn_saw' };
    }
  }

  function renderMel() {
    const g = scene().grid;
    const sum = g && g.chords.length && key() ? 'Grille : ' + gridSummary(g) : '';
    $('#hmFoot').innerHTML = `
      <span class="hm-foot-info hm-muted">${esc(sum)}</span>
      <button type="button" class="btn" id="hmMelGo">Générer une mélodie</button>
      <button type="button" class="btn btn-accent" id="hmMelWrite" disabled title="Écrire la mélodie sur la piste choisie, dans la scène en cours (Ctrl+Z pour revenir)">Écrire sur la piste</button>
      <button type="submit" class="btn">Fermer</button>`;
    $('#hmBody').innerHTML = '<div class="hm-mel" id="hmMel"></div>';
    SS.melodyPanel.show({
      box: $('#hmMel'),
      leadOpts,
      preferSceneKey: true,
      buttons: { write: $('#hmMelWrite') },
      padTrack: () => {
        const l = g && g.layers.comp;
        const t = l && l.on && byId(l.dst);
        return t && t.category !== 'mono' ? t : chordTrack();
      },
    });
    if (!sum) $('#hmFoot .hm-foot-info').textContent = SS.melodyPanel._state.grid ? 'Accords repris des pistes de la scène' : 'Pas d’accords : écrivez-les, ou posez-les dans l’onglet Grille';
  }

  function renderTabs() {
    const res = H().analyze(proj());
    const extra = new Map(res.map((r) => [r.id, sceneChecks(r)]));
    const cur = res.find((r) => r.id === scene().id);
    let warns = 0;
    if (cur) {
      const x = extra.get(cur.id);
      const mel = new Set(x.melodies.map((m) => m.track.name));
      warns = cur.remarks.filter((r) => r.kind === 'warn' && !mel.has(r.track)).length + x.grid.filter((i) => i.kind === 'warn').length + x.melodies.reduce((a, m) => a + m.items.filter((i) => i.kind === 'warn').length, 0);
    }
    $('#hmBadge').textContent = warns ? warns : '';
    document.querySelectorAll('#hmTabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    if (tab === 'gri') return renderGri();
    if (tab === 'mel') return renderMel();
    if (tab === 'amb') renderAmb();
    else renderVer(res, extra);
    $('#hmFoot').innerHTML = `
      <span class="hm-foot-info hm-muted">Scène « ${esc(scene().name)} »${key() ? ' · ' + esc(H().label(key())) : ''}</span>
      <button type="submit" class="btn btn-accent">Fermer</button>`;
  }

  function render() {
    if (tab !== 'gri' || view !== 'tabs') stopGridPlay();
    if (tab !== 'mel' || view !== 'tabs') SS.melodyPanel.stop();
    const wizOn = view === 'wiz';
    $('#hmTabs').hidden = wizOn;
    $('#hmSteps').hidden = !wizOn;
    // dans l'assistant, seul « Détecter » reste utile (trouver la tonalité d'accords déjà posés)
    ['#hmTonic', '#hmMode', '#hmWizBtn', '.hm-key-label'].forEach((q) => ($(q).hidden = wizOn));
    $('#hmTitle').textContent = wizOn ? 'Key · nouvelle harmonie' : 'Key';
    if (wizOn) renderWizard();
    else renderTabs();
    $('#hmBody').scrollTop = 0;
  }

  function sync() {
    const p = proj();
    $('#hmScene').innerHTML = p.scenes.map((sc) => `<option value="${esc(sc.id)}"${sc.id === p.current ? ' selected' : ''}>${esc(sc.name)}</option>`).join('');
    const k = key();
    $('#hmTonic').value = k ? k.tonic : '';
    $('#hmMode').value = k ? k.mode : '';
    updateButton();
    render();
  }

  /* ---------- Événements ---------- */

  function onClick(e) {
    const el = (sel) => e.target.closest(sel);
    let b;
    // assistant
    if ((b = el('[data-wemo]'))) {
      wiz.emo = b.dataset.wemo;
      wiz.pick = 0;
      return render();
    }
    if ((b = el('[data-wlisten]'))) return listenChords(emoProps[+b.dataset.wlisten].chords);
    if ((b = el('[data-wpick]'))) {
      wiz.pick = +b.dataset.wpick;
      return render();
    }
    if (el('#hmWizSkip')) {
      view = 'tabs';
      tab = 'gri';
      return render();
    }
    if (el('#hmWizBack')) {
      wiz.step--;
      return render();
    }
    if (el('#hmWizNext')) {
      if (wiz.step < 1) {
        wiz.step++;
        return render();
      }
      return wizCreate();
    }
    if (el('[data-go-wiz]')) return startWizard();
    // onglet Ambiance
    if ((b = el('[data-emo]'))) {
      viewEmo = b.dataset.emo;
      return render();
    }
    if ((b = el('[data-emo-listen]'))) return listenChords(emoProps[+b.dataset.emoListen].chords);
    if ((b = el('[data-emo-apply]'))) {
      const pr = emoProps[+b.dataset.emoApply];
      const emo = viewEmo === ALL ? null : SS.findEmotion(viewEmo || scene().emotion);
      return applyProposal(pr, emo, !!$('#hmEmoTempo') && $('#hmEmoTempo').checked);
    }
    if ((b = el('[data-ab]'))) return abTest(b.dataset.ab);
    if (el('#hmEmoMel')) {
      tab = 'mel';
      return render();
    }
    // onglet Mélodie
    if (el('#hmMelGo')) return SS.melodyPanel.compose(true);
    if (el('#hmMelWrite')) {
      SS.melodyPanel.write();
      return render();
    }
    // onglet Grille
    if ((b = el('[data-grmode]'))) {
      gridAdv = b.dataset.grmode === 'adv';
      try {
        localStorage.setItem('stepseq.gridAdv', gridAdv ? '1' : '0');
      } catch (err) {
        /* stockage indisponible */
      }
      return renderGri();
    }
    if (el('#grPlay')) return playGrid();
    if (el('#grGen')) return generateGrid();
    if (el('#grClear')) {
      if (!confirm(`Effacer la grille de la scène « ${scene().name} » ?`)) return;
      grid().chords = [];
      stopGridPlay();
      return gridChanged();
    }
    if (el('#grArpOne')) {
      const t = byId(grid().layers.arp.dst);
      return t && SS.arpPanel.open(t);
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === 'hmWizTempo') wiz.tempo = t.checked;
    else if (t.id === 'hmEmoTempo') ambTempo = t.checked;
    else if (t.id === 'grSnap') {
      grid().snap = t.value;
      app.changed();
    } else if (t.id === 'grFrom') {
      if (t.value) gridFrom(t.value);
    } else if (t.id === 'grAuto') {
      const g = grid();
      g.auto = t.checked;
      if (g.auto && g.chords.length) generateGrid({ auto: true });
      else app.changed();
    } else if (t.dataset.gl) {
      const l = grid().layers[t.dataset.gl];
      l[t.dataset.gf] = t.type === 'checkbox' ? t.checked : t.value;
      if (grid().auto && grid().chords.length && t.dataset.gf !== 'dst') generateGrid({ auto: true });
      else app.changed();
      renderGri();
    }
  }

  function startWizard() {
    view = 'wiz';
    wiz = newWiz();
    render();
  }

  function init(appApi) {
    app = appApi;
    const tonic = $('#hmTonic');
    tonic.append(new Option('Tonique —', ''));
    H().TONICS.forEach((t) => tonic.append(new Option(`${t} (${H().french(t)})`, t)));
    const mode = $('#hmMode');
    mode.append(new Option('Aucune tonalité', ''));
    H().MODES.forEach((m) => mode.append(new Option(m.label, m.id)));
    const onPick = () => {
      const t = tonic.value || (key() && key().tonic) || 'C';
      const m = mode.value;
      setKey(m ? { tonic: t, mode: m } : tonic.value ? { tonic: t, mode: 'major' } : null);
    };
    tonic.addEventListener('change', onPick);
    mode.addEventListener('change', onPick);
    $('#hmDetect').addEventListener('click', runDetect);
    $('#hmDetectOut').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.alt) {
        const [tonic, mode] = b.dataset.alt.split('|');
        setKey({ tonic, mode });
        showDetect(lastDetect, { tonic, mode });
      } else $('#hmDetectOut').hidden = true;
    });
    $('#hmWizBtn').addEventListener('click', startWizard);
    $('#hmScene').addEventListener('change', (e) => {
      app.switchScene(e.target.value);
      $('#hmDetectOut').hidden = true;
      viewEmo = null;
      view = key() ? 'tabs' : 'wiz';
      wiz = newWiz();
      sync();
    });
    $('#hmTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
      render();
    });
    $('#hmBody').addEventListener('click', onClick);
    $('#hmFoot').addEventListener('click', onClick);
    $('#hmBody').addEventListener('change', onChange);
    $('#hmBody').addEventListener('pointerdown', gridPointerDown);
    $('#hmBody').addEventListener('keydown', gridKeyDown);
    $('#hmFoot').addEventListener('change', onChange);
    $('#hmBody').addEventListener('keydown', (e) => {
      const card = e.target.closest('[data-wpick]');
      if (card && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) {
        e.preventDefault();
        card.click();
      }
    });
    const dlg = $('#harmonyDialog');
    $('#harmonyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      dlg.close();
    });
    dlg.addEventListener('close', stopGridPlay);
    dlg.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['BUTTON', 'SELECT', 'INPUT'].includes(e.target.tagName) && !e.target.closest('[data-wpick]')) return;
      e.stopPropagation();
    });
    $('#keyBtn').addEventListener('click', open);
  }

  /* ---------- Détecter : tonalité estimée et accords reconnus, affichés dans la fenêtre ---------- */
  let lastDetect = null;
  function runDetect() {
    const d = H().detect(proj(), scene().id);
    lastDetect = d;
    if (!d) {
      const out = $('#hmDetectOut');
      out.innerHTML = `<span>Aucune note dans la scène « ${esc(scene().name)} ». <b>Détecter</b> lit les notes des pistes Instrument et Synthé de la scène affichée (pas la batterie).</span><span class="spacer"></span><button type="button" class="hm-detect-x" aria-label="Masquer">×</button>`;
      out.hidden = false;
      return;
    }
    if (view === 'wiz') view = 'tabs'; // une tonalité est trouvée : on quitte l'assistant
    setKey(d.key);
    showDetect(d, d.key);
  }
  function showDetect(d, k) {
    const out = $('#hmDetectOut');
    const same = (a, b) => a.tonic === b.tonic && a.mode === b.mode;
    const alt = same(k, d.key) ? d.second.key : d.key;
    const chips = d.chords
      .map((c) => {
        if (!c.id) return `<span class="hm-dchord off" title="Accord non reconnu">${esc(c.notes.map((n) => H().spell(k, n)).join('·'))}<small>?</small></span>`;
        const a = H().analyzeChord(k, c.id);
        return `<span class="hm-dchord${a.status === 'diatonique' ? '' : ' off'}" title="${esc(a.why || 'dans la tonalité')}">${esc(H().chordName(k, c.id))}<small>${esc(a.numeral)}</small></span>`;
      })
      .join('');
    out.innerHTML = `
      <span>Tonalité estimée : <b>${esc(H().label(k))}</b></span>
      ${d.chords.length ? `<span>· Accords reconnus :</span><span class="hm-dchords">${chips}</span>` : '<span>· aucun accord (notes seules)</span>'}
      <span class="spacer"></span>
      <button type="button" class="btn btn-small" data-alt="${esc(alt.tonic)}|${esc(alt.mode)}" title="La tonalité relative partage les mêmes notes : la mélodie et les cadences font entendre l'une ou l'autre">Plutôt ${esc(H().label(alt))} ?</button>
      <button type="button" class="hm-detect-x" aria-label="Masquer le résultat">×</button>`;
    out.hidden = false;
  }

  /** Ouvre la fenêtre : l'assistant si la scène n'a pas encore de tonalité, sinon les onglets. */
  function open() {
    viewEmo = null;
    view = key() ? 'tabs' : 'wiz';
    wiz = newWiz();
    $('#hmDetectOut').hidden = true;
    sync();
    $('#harmonyDialog').showModal();
  }

  return { init, open, updateButton };
})();
