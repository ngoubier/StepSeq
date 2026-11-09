/*
 * Fenêtre « Harmo One », propre à la scène en cours (intro, couplet, refrain…) :
 *  - un ASSISTANT en 3 étapes (ambiance → grille d'accords → couches) pour démarrer une scène
 *    qui n'a pas encore de tonalité ;
 *  - des ONGLETS pour modifier ou vérifier ensuite : Ambiance, Accords, Grille, Couches, Vérifier.
 *    L'onglet Grille pose les accords à la main sur une ligne (glisser-déposer) et génère d'un coup
 *    la basse, les accords et l'arpège (joué par Arp One).
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

  const LAYERS = [
    { id: 'bass', group: 'Basse', title: 'Basse' },
    { id: 'arp', group: 'Arpège', title: 'Arpège' },
    { id: 'mel', group: 'Mélodie', title: 'Mélodie' },
  ];
  const gensOf = (group) => H().GENERATORS.filter((g) => g.group === group);
  const genById = (id) => H().GENERATORS.find((g) => g.id === id);

  let view = 'tabs'; // 'tabs' | 'wiz'
  let tab = 'amb';
  let viewEmo = null; // émotion affichée dans l'onglet Ambiance (sinon celle de la scène)
  let chordTrackId = null; // piste qui reçoit les accords
  let ambTempo = null; // case « régler aussi le tempo » (null = valeur par défaut)
  let wiz = null;
  let cou = null; // réglages des cartes de l'onglet Couches
  let palette = [];
  let progs = [];
  let emoProps = [];

  /* ---------- Bouton de la barre du haut ---------- */

  function updateButton() {
    const k = key();
    $('#keyLabel').textContent = 'Tonalité : ' + (k ? H().label(k) : '—');
    $('#keyBtn').classList.toggle('on', !!k);
    $('#keyBtn').title = `Harmo One, harmonie de la scène « ${scene().name} » : émotion, tonalité, accords, couches, vérification`;
  }

  /* ---------- Pistes ---------- */

  /** Piste qui reçoit les accords : celle choisie, sinon la piste en cours si c'est une piste Accord / Arpège, sinon la première. */
  function chordTrack() {
    const list = instTracks().filter((t) => t.category !== 'mono');
    const chosen = list.find((t) => t.id === chordTrackId);
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

  function options(list, selected, empty = '(aucune piste)') {
    if (!list.length) return `<option value="">${empty}</option>`;
    return list.map((t) => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
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

  /** Un accord par mesure, répété jusqu'à la fin de la piste (scène en cours). */
  function placeChords(t, chords) {
    const p = proj();
    const spb = SS.stepsPerBar(p);
    const n = SS.trackLen(p, t);
    const center = (t.octave + 1) * 12 + 6;
    let near = center;
    t.events = [];
    for (let s = 0, i = 0; s < n; s += spb, i++) {
      const c = chords[i % chords.length];
      const notes = H().voice(c, near, center);
      near = notes[0];
      t.events.push({ step: s, len: Math.min(spb, n - s), notes, vel: 0.7, chord: c.type });
    }
    t.lastRoot = near;
  }

  /** Basse, arpège ou mélodie écrite dans `dst` d'après les accords de `src` ; une piste Accord / Arpège reçoit des notes seules. */
  function writeLayer(src, dst, kind) {
    const p = proj();
    dst.events = H().generate(src.events, {
      kind,
      octave: dst.octave,
      spb: SS.stepsPerBar(p),
      beat: SS.stepsPerBeat(p),
      key: key(),
      length: SS.trackLen(p, dst),
    });
    return dst.events.length;
  }

  function listenChords(chords) {
    const t = previewTrack();
    if (!t) return toast('Ajoutez une piste Instrument ou Synthé pour écouter.');
    let near = 54;
    chords.forEach((c, i) =>
      setTimeout(() => {
        const notes = H().voice(c, near, 54);
        near = notes[0];
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

  const stepChips = (chords) =>
    chords.map((c) => `<span class="hm-step role-${c.role.id}${c.borrowed ? ' borrowed' : ''}" title="${esc(c.notes.join('–'))}"><b>${esc(c.numeral)}</b>${esc(c.name)}</span>`).join('');

  function propCard(pr, i, { pick = false, on = false } = {}) {
    const btns = pick
      ? `<button type="button" class="btn btn-small" data-wlisten="${i}">▶ Écouter</button>`
      : `<button type="button" class="btn btn-small" data-emo-listen="${i}">▶ Écouter</button><button type="button" class="btn btn-small btn-accent" data-emo-apply="${i}">Appliquer</button>`;
    return `<div class="hm-ex${pick ? ' pick' : ''}${on ? ' on' : ''}"${pick ? ` data-wpick="${i}" tabindex="0" role="radio" aria-checked="${on}"` : ''}>
      <div class="hm-ex-top"><span class="emo-kind k-${pr.kind}">${SS.EMOTION_KINDS[pr.kind]}</span><span class="hm-ex-meta">${esc(H().label(pr.key))} · ${pr.tempo} BPM</span><span class="hm-ex-btns">${btns}</span></div>
      <div class="hm-progchords">${stepChips(pr.chords)}</div>
      <p class="hm-why">${esc(pr.why)}</p>
    </div>`;
  }

  function colorLine(modeId) {
    const md = H().MODES.find((m) => m.id === modeId);
    if (md.color != null) return `Note caractéristique : <b>${esc(md.colorText)}</b>. Les accords qui la contiennent sont marqués « couleur du mode » ; faites-la entendre dans la mélodie.`;
    if (modeId === 'major') return 'Le mode de référence : la dominante attire vers la tonique.';
    if (modeId === 'harmonic') return 'La sensible (7<sup>e</sup> degré haussé) tire vers la tonique : tension, drame.';
    return 'Pas de sensible : la boucle tourne sans se résoudre.';
  }

  /** Applique une proposition à la scène en cours : tonalité, émotion, accords (et tempo si demandé). */
  function applyProposal(pr, emo, withTempo) {
    const t = chordTrack();
    if (!t) return toast('Ajoutez une piste Accord (ou Arpège) pour poser les accords.');
    const sc = scene();
    if (t.events.length && !confirm(`Remplacer les accords de « ${t.name} » dans la scène « ${sc.name} » ?`)) return;
    sc.key = { ...pr.key };
    sc.emotion = emo.id;
    if (withTempo) setTempo(pr.tempo);
    placeChords(t, pr.chords);
    app.changed();
    app.renderAll();
    sync();
    toast(`« ${sc.name} » : ${emo.label}, ${pr.chords.map((c) => c.name).join(' – ')} (${H().label(pr.key)}${withTempo ? `, ${pr.tempo} BPM` : ''}) dans « ${t.name} ».`, 4000);
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
      if (!target) return toast('Il faut une piste de basse avec des notes (onglet Couches ▸ Basse).');
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

  const STEPS = ['Ambiance', 'Grille d’accords', 'Couches'];

  function newWiz() {
    return { step: 0, emo: scene().emotion || null, pick: 0, tempo: proj().scenes.length === 1, layers: null };
  }

  function wizLayers() {
    const src = chordTrack();
    const emo = SS.findEmotion(wiz.emo);
    const used = new Set();
    wiz.layers = LAYERS.map((L) => {
      const d = defaultDst(L.group, src && src.id);
      const free = d && !used.has(d.id);
      if (free && L.id !== 'arp') used.add(d.id);
      return {
        ...L,
        on: !!free && L.id !== 'arp',
        gen: L.id === 'mel' && emo ? emo.melodyGen : gensOf(L.group)[0].id,
        dst: d ? d.id : '',
      };
    });
  }

  function renderWizard() {
    $('#hmSteps').innerHTML = STEPS.map(
      (s, i) => `<span class="hm-st${i === wiz.step ? ' on' : i < wiz.step ? ' past' : ''}"><i>${i < wiz.step ? '✓' : i + 1}</i>${s}</span>`
    ).join('');
    const body = $('#hmBody');
    const emo = SS.findEmotion(wiz.emo);
    const sc = scene();
    if (emo) emoProps = proposalsOf(emo);
    if (wiz.step === 0) {
      body.innerHTML = `<p class="hm-q">Quelle ambiance pour « ${esc(sc.name)} » ?</p>
        <p class="hm-muted">Du plus lumineux au plus sombre. Sous chaque émotion, le mode qui lui donne sa couleur.</p>
        <div class="hm-emogrid">${SS.MODE_MOODS.flatMap((m) =>
          m.emotions.map((id) => {
            const e = SS.findEmotion(id);
            return `<button type="button" class="hm-emo${id === wiz.emo ? ' on' : ''}" data-wemo="${id}" style="--lum:${m.lum}"><b>${esc(e.label)}</b><span>${esc(m.name)} · ${esc(m.mood)}</span></button>`;
          })
        ).join('')}</div>`;
    } else if (wiz.step === 1) {
      const pr = emoProps[wiz.pick];
      body.innerHTML = `<p class="hm-q">Choisissez une grille pour « ${esc(emo.label)} »</p>
        <p class="hm-muted">Écoutez les trois, puis cliquez sur celle qui vous parle le plus. Un accord par mesure, répété jusqu'à la fin de la scène.</p>
        <div class="hm-exs" role="radiogroup">${emoProps.map((x, i) => propCard(x, i, { pick: true, on: i === wiz.pick })).join('')}</div>
        <label class="emo-opt"><input type="checkbox" id="hmWizTempo"${wiz.tempo ? ' checked' : ''}> régler aussi le tempo sur ${pr.tempo} BPM (tout le morceau${proj().scenes.length > 1 ? ', toutes les scènes' : ''})</label>`;
    } else {
      if (!wiz.layers) wizLayers();
      const pr = emoProps[wiz.pick];
      const src = chordTrack();
      const all = instTracks();
      body.innerHTML = `<p class="hm-q">Que faut-il ajouter autour des accords ?</p>
        <p class="hm-muted">${esc(pr.chords.map((c) => c.name).join(' – '))} en ${esc(H().label(pr.key))}. Une couche à la fois s'écoute mieux : vous pourrez en ajouter d'autres dans l'onglet Couches.</p>
        <div class="hm-checks">
          <div class="hm-check"><input type="checkbox" checked disabled aria-label="Accords"><div><b>Accords</b><small>Un accord par mesure.</small></div>
            <label class="field"><span>Piste</span><select id="hmWizChord">${options(all.filter((t) => t.category !== 'mono'), src && src.id)}</select></label></div>
          ${wiz.layers
            .map(
              (l, i) => `<div class="hm-check"><input type="checkbox" data-wl="${i}" data-f="on"${l.on ? ' checked' : ''} aria-label="${l.title}"><div><b>${l.title}</b><small>${esc((genById(l.gen) || {}).text || '')}</small></div>
              <select data-wl="${i}" data-f="gen" aria-label="Style ${l.title}">${gensOf(l.group).map((g) => `<option value="${g.id}"${g.id === l.gen ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}</select>
              <label class="field"><span>Piste</span><select data-wl="${i}" data-f="dst">${options(all.filter((t) => !src || t.id !== src.id), l.dst)}</select></label></div>`
            )
            .join('')}
        </div>`;
    }
    const pr = wiz.step > 0 && emoProps[wiz.pick];
    $('#hmFoot').innerHTML = `
      <span class="hm-foot-info">${wiz.step === 0 ? `Scène « ${esc(sc.name)} »${emo ? ' · ' + esc(emo.label) : ''}` : `${esc(emo.label)} · ${esc(H().label(pr.key))} · ${pr.tempo} BPM`}</span>
      ${wiz.step === 0 ? '<button type="button" class="btn" id="hmWizSkip">Choisir la tonalité moi-même</button>' : '<button type="button" class="btn" id="hmWizBack">Retour</button>'}
      <button type="button" class="btn btn-accent" id="hmWizNext"${wiz.step === 0 && !emo ? ' disabled' : ''}>${wiz.step === 2 ? 'Créer' : 'Suivant'}</button>`;
  }

  function wizCreate() {
    const emo = SS.findEmotion(wiz.emo);
    const pr = emoProps[wiz.pick];
    const t = chordTrack();
    if (!t) return toast('Ajoutez une piste Accord (ou Arpège) pour poser les accords.');
    const layers = wiz.layers.filter((l) => l.on && byId(l.dst) && l.dst !== t.id);
    const dsts = layers.map((l) => l.dst);
    if (new Set(dsts).size !== dsts.length) return toast('Choisissez une piste différente pour chaque couche.');
    const sc = scene();
    const full = [t, ...layers.map((l) => byId(l.dst))].filter((x) => x.events.length);
    if (full.length && !confirm(`Remplacer le contenu de ${full.map((x) => `« ${x.name} »`).join(', ')} dans la scène « ${sc.name} » ?`)) return;
    sc.key = { ...pr.key };
    sc.emotion = emo.id;
    if (wiz.tempo) setTempo(pr.tempo);
    placeChords(t, pr.chords);
    const done = layers.map((l) => {
      writeLayer(t, byId(l.dst), l.gen);
      return `${l.title.toLowerCase()} dans « ${byId(l.dst).name} »`;
    });
    app.changed();
    app.renderAll();
    view = 'tabs';
    tab = 'amb';
    viewEmo = emo.id;
    chordTrackId = t.id;
    sync();
    toast(`« ${sc.name} » : ${emo.label} en ${H().label(pr.key)}. Accords dans « ${t.name} »${done.length ? ', ' + done.join(', ') : ''}. Ctrl+Z annule.`, 6000);
  }

  /* ================================================================ */
  /* Onglets                                                           */
  /* ================================================================ */

  function renderAmb() {
    const sc = scene();
    const emoId = viewEmo || sc.emotion;
    const emo = SS.findEmotion(emoId);
    const list = SS.MODE_MOODS.map(
      (m) => `<div class="hm-mode${emo && m.emotions.includes(emo.id) ? ' on' : ''}">
        <div class="hm-mode-h"><b>${esc(m.name)}</b><span>${esc(m.mood)}</span></div>
        <div class="chips">${m.emotions
          .map((id) => `<button type="button" class="chip emo-chip${id === emoId ? ' active' : ''}${id === sc.emotion ? ' current' : ''}" data-emo="${id}"${id === sc.emotion ? ' title="Émotion de cette scène"' : ''}>${esc(SS.findEmotion(id).label)}</button>`)
          .join('')}</div></div>`
    ).join('');
    let right = `<p class="hm-q">Quelle ambiance pour « ${esc(sc.name)} » ?</p><p class="hm-muted">Choisissez une émotion à gauche : trois grilles d'accords sont proposées, à écouter puis appliquer à cette scène.</p>`;
    if (emo) {
      const m = SS.emotionMode(emo.id);
      emoProps = proposalsOf(emo);
      const tempoOn = ambTempo ?? proj().scenes.length === 1;
      const gen = genById(emo.melodyGen);
      const abs = [...emo.ab, ...H().TRANSFORMS.map((t) => t.id).filter((id) => !emo.ab.includes(id))];
      const dim = (name, v) => `<span class="emo-dim"><small>${name}</small><i style="--v:${v}%"></i><b>${v}</b></span>`;
      right = `
        <div class="hm-ex-head"><h3>${esc(emo.label)}</h3><span>→ ${esc(m.name)} · ${esc(m.mood)}</span>${sc.emotion === emo.id ? '<em class="hm-cur">émotion de cette scène</em>' : ''}</div>
        <p class="hm-color">${colorLine(m.mode)}</p>
        <div class="hm-exs">${emoProps.map((pr, i) => propCard(pr, i)).join('')}</div>
        <label class="emo-opt"><input type="checkbox" id="hmEmoTempo"${tempoOn ? ' checked' : ''}> « Appliquer » règle aussi le tempo conseillé (tout le morceau)</label>
        <details class="hm-more"><summary>En savoir plus : repères, réserves, mélodie, essais A/B</summary>
          <div class="emo-dims">${dim('Valence', emo.dims[0])}${dim('Activation', emo.dims[1])}${dim('Tension', emo.dims[2])}<span class="hm-muted">repères subjectifs</span></div>
          <dl class="emo-matrix">
            <dt>Harmonie</dt><dd>${esc(emo.harmony)}</dd><dt>Mélodie</dt><dd>${esc(emo.melody)}</dd>
            <dt>Rythme, texture</dt><dd>${esc(emo.texture)}</dd><dt>Risque</dt><dd>${esc(emo.risk)}</dd>
            ${emoProps.map((pr) => `<dt>Réserve ${SS.EMOTION_KINDS[pr.kind].toLowerCase()}</dt><dd>${esc(pr.caveat)}</dd>`).join('')}
          </dl>
          <p class="hm-muted"><b>Mélodie conseillée</b> : « ${esc(gen ? gen.label : '')} » (${esc(gen ? gen.text : '')}).
            <button type="button" class="btn btn-small" id="hmEmoMel">Préparer la mélodie</button></p>
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
        </details>`;
    }
    $('#hmBody').innerHTML = `<div class="hm-amb"><div class="hm-amb-l"><div class="hm-lbl">Du plus lumineux au plus sombre</div><div class="hm-modes">${list}</div></div><div class="hm-amb-r">${right}</div></div>`;
  }

  function chordCard(c, i) {
    return `<button type="button" class="hm-chord role-${c.role.id}${c.borrowed ? ' borrowed' : ''}" data-i="${i}"
      title="${esc(c.name)} = ${esc(c.notes.join('–'))} (${esc(c.quality)}) · ${esc(c.role.text)}${c.borrowed ? ' · emprunt au mineur harmonique' : ''}">
      <b>${esc(c.numeral)}</b><span class="hm-name">${esc(c.name)}</span><em>${esc(c.role.label)}</em></button>`;
  }

  const noKeyMsg = () =>
    `<p class="hm-empty">La scène « ${esc(scene().name)} » n'a pas encore de tonalité. Choisissez-la en haut, cliquez sur <b>Détecter</b>, ou partez d'une émotion avec l'<button type="button" class="btn btn-small" data-go-wiz>Assistant</button>.</p>`;

  function renderAcc() {
    const k = key();
    if (!k) return ($('#hmBody').innerHTML = noKeyMsg());
    const sc = H().scale(k);
    const { diatonic, extra } = H().chords(k);
    palette = [...diatonic, ...extra];
    progs = H().progressions(k);
    const mode = H().MODES.find((m) => m.id === k.mode);
    const modal = !H().isTonal(k);
    const notes = sc.map((d, i) => `<span class="hm-note${i === 0 ? ' tonic' : ''}${modal && mode.color === i ? ' color' : ''}"><b>${esc(d.name)}</b><small>${esc(H().french(d.name))}</small></span>`).join('');
    const note = modal
      ? `${esc(H().label(k))} est un mode : pas de dominante qui « appelle » la tonique. Sa ${esc(mode.colorText)} (${esc(sc[mode.color].name)}) le distingue : faites-la entendre et revenez souvent sur ${esc(sc[0].name)}.`
      : k.mode === 'minor'
      ? `${esc(extra[0].name)} et ${esc(extra[1].name)} empruntent la sensible ${esc(extra[0].notes[1])} au mineur harmonique : elle monte d'un demi-ton vers ${esc(sc[0].name)}.`
      : `${esc(extra[0].name)} ajoute la septième ${esc(extra[0].notes[3])} à la dominante : le triton se résout sur ${esc(sc[0].name)}.`;
    $('#hmBody').innerHTML = `<div class="hm-stack">
      <div><div class="hm-lbl">Gamme de ${esc(H().label(k))}</div><div class="hm-scale">${notes}</div></div>
      <div><div class="hm-lbl">Accords · cliquer pour écouter</div>
        <div class="hm-chords">${palette.map((c, i) => chordCard(c, i)).join('')}</div>
        <p class="hm-muted">${note} Dans le piano roll d'une piste Accord ou Arpège, la palette pose ces accords à l'endroit cliqué.</p></div>
      <div><div class="hm-lbl">Grilles connues · « Poser » remplace les accords de la scène</div>
        ${
          modal
            ? '<p class="hm-muted">Les grilles tonales ne s’appliquent pas à un mode : partez des propositions de l’onglet Ambiance ou de la palette d’accords.</p>'
            : `<div class="hm-progs">${progs
                .map(
                  (pr, i) => `<div class="hm-progrow">
                    <div class="hm-proglabel"><b>${esc(pr.label)}</b><small>${esc(pr.style)}</small></div>
                    <div class="hm-progchords">${stepChips(pr.chords)}</div>
                    <button type="button" class="btn btn-small" data-listen="${i}" aria-label="Écouter">▶</button>
                    <button type="button" class="btn btn-small btn-accent" data-place="${i}">Poser</button>
                  </div>`
                )
                .join('')}</div>`
        }</div>
    </div>`;
  }

  function couState() {
    if (!cou) cou = {};
    const srcList = instTracks().filter((t) => t.category !== 'mono' && t.events.length);
    if (!srcList.some((t) => t.id === cou.src)) cou.src = (srcList.find((t) => t.id === (chordTrack() || {}).id) || srcList[0] || {}).id || '';
    for (const L of LAYERS) {
      const s = (cou[L.id] = cou[L.id] || {});
      if (!genById(s.gen)) s.gen = L.id === 'mel' && SS.findEmotion(scene().emotion) ? SS.findEmotion(scene().emotion).melodyGen : gensOf(L.group)[0].id;
      if (!byId(s.dst) || s.dst === cou.src) s.dst = (defaultDst(L.group, cou.src) || {}).id || '';
    }
    return srcList;
  }

  /** « Am – Fmaj7 – C – G » : les accords d'une piste, sans répéter deux fois de suite le même. */
  function chordNames(t) {
    const names = [...t.events]
      .sort((a, b) => a.step - b.step)
      .map((ev) => {
        const id = H().identify(ev.notes);
        return id ? H().chordName(key(), id) : '?';
      })
      .filter((n, i, a) => n !== a[i - 1]);
    return names.slice(0, 8).join(' – ') + (names.length > 8 ? ' …' : '');
  }

  function renderCou() {
    if (!key()) return ($('#hmBody').innerHTML = noKeyMsg());
    const srcList = couState();
    const all = instTracks().filter((t) => t.id !== cou.src);
    const src = byId(cou.src);
    $('#hmBody').innerHTML = `
      <div class="hm-src"><label class="field"><span>À partir des accords de</span><select id="hmGenSrc">${options(srcList, cou.src, '(aucune piste avec des accords)')}</select></label>
        ${src ? `<span class="hm-muted">${esc(chordNames(src))}</span>` : '<span class="hm-muted">Posez d’abord des accords (onglet Ambiance ou Accords).</span>'}</div>
      <div class="hm-layers">${LAYERS.map((L) => {
        const s = cou[L.id];
        return `<div class="hm-layer">
          <h4>${L.title}<small>${gensOf(L.group).length} styles</small></h4>
          <select data-cgen="${L.id}" aria-label="Style ${L.title}">${gensOf(L.group).map((g) => `<option value="${g.id}"${g.id === s.gen ? ' selected' : ''}>${esc(g.label)}</option>`).join('')}</select>
          <p class="hm-muted">${esc((genById(s.gen) || {}).text || '')}</p>
          <label class="field"><span>Dans</span><select data-cdst="${L.id}">${options(all, s.dst)}</select></label>
          <button type="button" class="btn btn-accent" data-cgo="${L.id}"${src ? '' : ' disabled'}>Générer</button>
        </div>`;
      }).join('')}</div>
      <p class="hm-muted">Ajoutez une couche à la fois et écoutez ce qu'elle change. Le résultat est un point de départ : variez ensuite le rythme, l'octave ou une note de passage. Ctrl+Z annule.</p>`;
  }

  function generate(layerId) {
    const L = LAYERS.find((x) => x.id === layerId);
    const s = cou[layerId];
    const src = byId(cou.src);
    const dst = byId(s.dst);
    if (!src || !src.events.length) return toast('Posez d’abord des accords dans une piste Accord ou Arpège.');
    if (!dst) return toast('Choisissez la piste à remplir.');
    if (dst === src) return toast('Choisissez une autre piste que celle des accords.');
    if (dst.events.length && !confirm(`Remplacer les notes de « ${dst.name} » dans la scène « ${scene().name} » ?`)) return;
    const n = writeLayer(src, dst, s.gen);
    app.changed();
    app.renderAll();
    render();
    toast(`${L.title} « ${genById(s.gen).label} » écrite dans « ${dst.name} » (${n} notes).`);
  }

  const KIND = { warn: 'À vérifier', info: 'Emprunt', tip: 'Conseil' };

  function renderVer(res) {
    const cur = scene().id;
    const ordered = [...res.filter((r) => r.id === cur), ...res.filter((r) => r.id !== cur)];
    $('#hmBody').innerHTML =
      `<div class="hm-stack hm-ver">${ordered
        .map((sec) => {
          const warns = sec.remarks.filter((r) => r.kind === 'warn').length;
          const pill = !sec.key
            ? '<span class="hm-pill none">pas de tonalité</span>'
            : warns
            ? `<span class="hm-pill warn">${warns} à vérifier</span>`
            : '<span class="hm-pill ok">rien à signaler</span>';
          const prog = sec.progressions
            .map((pr) => `<div class="hm-prog"><span class="hm-track">${esc(pr.track)}</span>${pr.items.map((it) => `<span class="hm-step st-${it.status}" title="${esc(it.status)}${it.why ? ' : ' + esc(it.why) : ''}"><b>${esc(it.numeral)}</b>${esc(it.name)}</span>`).join('')}</div>`)
            .join('');
          const rem = sec.remarks.length
            ? `<ul class="hm-remarks">${sec.remarks
                .map((r) => `<li class="k-${r.kind}"><span class="hm-badge">${KIND[r.kind]}</span><div><b>${esc(r.track)}</b> · ${esc(r.where)}<br>${esc(r.text)}<br><small>${esc(r.hint)}</small></div></li>`)
                .join('')}</ul>`
            : '';
          return `<div class="hm-scene${sec.id === cur ? ' current' : ''}">
            <div class="hm-scene-h"><b>${esc(sec.name)}</b><span class="hm-muted">${sec.key ? esc(H().label(sec.key)) : ''}${sec.id === cur ? ' · scène en cours' : ''}</span>${pill}</div>
            ${sec.key ? prog || '<p class="hm-muted">Pas d’accords dans cette scène.</p>' : '<p class="hm-muted">Choisissez sa tonalité pour l’analyser.</p>'}${rem}</div>`;
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
  const gChord = (c) => H().gridChord(key(), c.degree, c.type, c.acc);
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
      near = notes[0];
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
  function generateGrid({ auto = false } = {}) {
    const k = key();
    if (!k) return;
    const p = proj();
    const g = grid();
    if (!g.chords.length && !auto) return toast('Glissez d’abord des accords sur la grille.');
    const plan = GLAYERS.filter((L) => g.layers[L.id].on).map((L) => ({ L, l: g.layers[L.id], t: byId(g.layers[L.id].dst) }));
    if (!plan.length) return auto || toast('Cochez au moins une couche à générer.');
    const ids = plan.filter((x) => x.t).map((x) => x.t.id);
    if (new Set(ids).size !== ids.length) return toast('Choisissez une piste différente pour chaque couche.');
    const edited = plan.filter((x) => x.t && x.t.events.length && g.sig[x.t.id] !== sigOf(x.t.events));
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
    if (!auto)
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
    const chord = moving ? { degree: moving.degree, type: moving.type, acc: moving.acc } : { degree: +src.dataset.gd, type: src.dataset.gt, acc: +src.dataset.ga };
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

  function renderTabs() {
    const res = H().analyze(proj());
    const cur = res.find((r) => r.id === scene().id);
    const warns = cur ? cur.remarks.filter((r) => r.kind === 'warn').length : 0;
    $('#hmBadge').textContent = warns ? warns : '';
    document.querySelectorAll('#hmTabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    if (tab === 'amb') renderAmb();
    else if (tab === 'acc') renderAcc();
    else if (tab === 'cou') renderCou();
    else if (tab === 'gri') return renderGri();
    else renderVer(res);
    const t = chordTrack();
    $('#hmFoot').innerHTML = `
      <label class="field hm-foot-info"><span>Accords posés dans</span><select id="hmChordTrack">${options(instTracks().filter((x) => x.category !== 'mono'), t && t.id)}</select></label>
      <span class="hm-muted">scène « ${esc(scene().name)} »</span>
      <button type="submit" class="btn btn-accent">Fermer</button>`;
  }

  function render() {
    if (tab !== 'gri' || view !== 'tabs') stopGridPlay();
    const wizOn = view === 'wiz';
    $('#hmTabs').hidden = wizOn;
    $('#hmSteps').hidden = !wizOn;
    $('#hmKeyBar').hidden = wizOn;
    $('#hmTitle').textContent = wizOn ? 'Harmo One · nouvelle harmonie' : 'Harmo One';
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
      wiz.layers = null;
      return render();
    }
    if ((b = el('[data-wlisten]'))) return listenChords(emoProps[+b.dataset.wlisten].chords);
    if ((b = el('[data-wpick]'))) {
      wiz.pick = +b.dataset.wpick;
      return render();
    }
    if (el('#hmWizSkip')) {
      view = 'tabs';
      tab = 'acc';
      return render();
    }
    if (el('#hmWizBack')) {
      wiz.step--;
      return render();
    }
    if (el('#hmWizNext')) {
      if (wiz.step < 2) {
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
    if ((b = el('[data-emo-apply]'))) return applyProposal(emoProps[+b.dataset.emoApply], SS.findEmotion(viewEmo || scene().emotion), $('#hmEmoTempo').checked);
    if ((b = el('[data-ab]'))) return abTest(b.dataset.ab);
    if (el('#hmEmoMel')) {
      const emo = SS.findEmotion(viewEmo || scene().emotion);
      couState();
      cou.mel.gen = emo.melodyGen;
      tab = 'cou';
      render();
      return toast('Mélodie prête : vérifiez la piste puis cliquez sur Générer.');
    }
    // onglet Accords
    if ((b = el('[data-listen]'))) return listenChords(progs[+b.dataset.listen].chords);
    if ((b = el('[data-place]'))) {
      const pr = progs[+b.dataset.place];
      const t = chordTrack();
      if (!t) return toast('Ajoutez une piste Accord (ou Arpège) pour poser la grille.');
      if (t.events.length && !confirm(`Remplacer les accords de « ${t.name} » dans la scène « ${scene().name} » ?`)) return;
      placeChords(t, pr.chords);
      app.changed();
      app.renderAll();
      render();
      return toast(`${pr.label} posée dans « ${t.name} ».`);
    }
    if ((b = el('.hm-chord'))) {
      const t = previewTrack();
      if (!t) return toast('Ajoutez une piste Instrument ou Synthé pour écouter les accords.');
      return SS.audio.preview(t, H().voice(palette[+b.dataset.i], 60), 0.9);
    }
    // onglet Couches
    if ((b = el('[data-cgo]'))) return generate(b.dataset.cgo);
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
    else if (t.id === 'hmWizChord') {
      chordTrackId = t.value;
      wizLayers();
      render();
    } else if (t.dataset.wl != null) {
      const l = wiz.layers[+t.dataset.wl];
      l[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.f !== 'on') render();
    } else if (t.id === 'hmGenSrc') {
      cou.src = t.value;
      render();
    } else if (t.dataset.cgen) {
      cou[t.dataset.cgen].gen = t.value;
      render();
    } else if (t.dataset.cdst) cou[t.dataset.cdst].dst = t.value;
    else if (t.id === 'hmChordTrack') {
      chordTrackId = t.value;
      render();
    } else if (t.id === 'grSnap') {
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
    $('#hmDetect').addEventListener('click', () => {
      const d = H().detect(proj(), scene().id);
      if (!d) return toast(`Aucune note dans la scène « ${scene().name} ».`);
      setKey(d.key);
      toast(`Estimation : ${H().label(d.key)} (sinon ${H().label(d.second.key)}). La mélodie et les cadences font entendre l'une ou l'autre : écoutez !`, 6000);
    });
    $('#hmWizBtn').addEventListener('click', startWizard);
    $('#hmScene').addEventListener('change', (e) => {
      app.switchScene(e.target.value);
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

  /** Ouvre la fenêtre : l'assistant si la scène n'a pas encore de tonalité, sinon les onglets. */
  function open() {
    viewEmo = null;
    cou = null;
    view = key() ? 'tabs' : 'wiz';
    wiz = newWiz();
    sync();
    $('#harmonyDialog').showModal();
  }

  return { init, open, updateButton };
})();
