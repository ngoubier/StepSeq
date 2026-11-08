/*
 * Fenêtre « Harmonie » : tonalité du projet, gamme, accords diatoniques (écoute au clic)
 * et vérificateur d'harmonie de toutes les scènes. Le calcul est dans js/harmony.js.
 */
window.SS = window.SS || {};

SS.harmonyPanel = (() => {
  const $ = (s) => document.querySelector(s);
  const H = () => SS.harmony;
  let app;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const key = () => app.project().key;

  function updateButton() {
    const k = key();
    const on = H().valid(k);
    $('#keyLabel').textContent = 'Tonalité : ' + (on ? H().label(k) : '—');
    $('#keyBtn').classList.toggle('on', on);
  }

  function setKey(k) {
    const p = app.project();
    if (k && H().valid(k)) p.key = { tonic: k.tonic, mode: k.mode };
    else delete p.key;
    app.changed();
    app.renderAll(); // le piano roll met en évidence les notes de la nouvelle gamme
    sync();
  }

  /** Piste qui joue les accords de la palette : la piste en cours si c'est un instrument, sinon une piste Accord. */
  function previewTrack() {
    const tracks = app.project().tracks.filter((t) => t.type === 'instrument');
    const active = app.activeTrack && app.activeTrack();
    if (active && active.type === 'instrument') return active;
    return tracks.find((t) => t.category === 'chord') || tracks[0] || null;
  }

  function chordCard(c, i) {
    return `<button type="button" class="hm-chord role-${c.role.id}${c.borrowed ? ' borrowed' : ''}" data-i="${i}"
      title="${esc(c.name)} = ${esc(c.notes.join('–'))} (${esc(c.quality)}) · ${esc(c.role.text)}${c.borrowed ? ' · emprunt au mineur harmonique' : ''}">
      <b>${esc(c.numeral)}</b><span class="hm-name">${esc(c.name)}</span>
      <small>${esc(c.notes.join(' – '))}</small><em>${esc(c.role.label)}</em></button>`;
  }

  let palette = [];
  let progs = [];

  const instTracks = () => app.project().tracks.filter((t) => t.type === 'instrument');
  function trackOptions(filter) {
    const list = instTracks().filter(filter);
    if (!list.length) return '<option value="">(aucune piste)</option>';
    return list.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  }
  function genOptions() {
    const groups = {};
    H().GENERATORS.forEach((g) => (groups[g.group] = groups[g.group] || []).push(g));
    return Object.entries(groups)
      .map(([name, gs]) => `<optgroup label="${esc(name)}">${gs.map((g) => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}</optgroup>`)
      .join('');
  }
  /** Tonalité relative : même armure, autre tonique (Ré mineur ↔ Fa majeur). */
  function relative(k) {
    const sc = H().scale({ ...k, mode: k.mode === 'major' ? 'major' : 'minor' });
    return k.mode === 'major' ? { tonic: sc[5].name, mode: 'minor' } : { tonic: sc[2].name, mode: 'major' };
  }
  const byId = (id) => app.project().tracks.find((t) => t.id === id);

  /** Choix par défaut des listes : nappe comme source, piste Mono la plus grave pour la basse, la plus aiguë pour la mélodie. */
  function defaultTargets() {
    const src = $('#hmGenSrc');
    const kind = $('#hmGenKind');
    const dst = $('#hmGenDst');
    if (!src || !dst) return;
    const avg = (t) => (t.events.length ? t.events.reduce((a, e) => a + e.notes[0], 0) / t.events.length : (t.octave + 1) * 12);
    const monos = instTracks().filter((t) => t.category === 'mono' && t.id !== src.value);
    const g = kind.value;
    const named = (re) => monos.find((t) => re.test(t.name));
    const bassLike = (t) => t.family === 'bass' || /bass|basse/i.test(t.name);
    const others = monos.filter((t) => !bassLike(t));
    let pick = null;
    if (g.startsWith('bass')) pick = monos.find(bassLike) || [...monos].sort((a, b) => avg(a) - avg(b))[0];
    else if (g.startsWith('mel')) pick = named(/lead|m[ée]lodie|chant|th[èe]me/i) || [...others].sort((a, b) => avg(b) - avg(a))[0];
    else pick = named(/arp/i) || instTracks().find((t) => t.category === 'arp' && t.id !== src.value) || others[0];
    if (pick) dst.value = pick.id;
    $('#hmGenHelp').textContent = (H().GENERATORS.find((x) => x.id === g) || {}).text || '';
  }

  function listen(pr) {
    listenChords(pr.chords, byId($('#hmProgTrack').value));
  }

  function place(pr) {
    const t = byId($('#hmProgTrack').value);
    if (!t) return SS.ui.toast('Ajoutez une piste Accord (ou Arpège) pour poser la progression.');
    if (t.events.length && !confirm(`Remplacer les accords de « ${t.name} » dans cette scène ?`)) return;
    placeChords(t, pr.chords);
    SS.ui.toast(`${pr.label} posée dans « ${t.name} ».`);
  }

  /** Un accord par mesure, répété jusqu'à la fin de la piste (scène en cours). */
  function placeChords(t, chords) {
    const p = app.project();
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
    app.changed();
    app.renderAll();
    render();
  }

  function generate() {
    const src = byId($('#hmGenSrc').value);
    const dst = byId($('#hmGenDst').value);
    const kind = $('#hmGenKind').value;
    if (!src || !src.events.length) return SS.ui.toast('Posez d’abord des accords dans une piste Accord ou Arpège.');
    if (!dst) return SS.ui.toast('Choisissez la piste à remplir.');
    if (dst === src) return SS.ui.toast('Choisissez une autre piste que celle des accords.');
    if (dst.events.length && !confirm(`Remplacer les notes de « ${dst.name} » dans cette scène ?`)) return;
    const p = app.project();
    const g = H().GENERATORS.find((x) => x.id === kind);
    const events = H().generate(src.events, {
      kind,
      octave: dst.octave,
      spb: SS.stepsPerBar(p),
      beat: SS.stepsPerBeat(p),
      key: key(),
      length: SS.trackLen(p, dst),
    });
    // une piste Accord ou Arpège reçoit des notes seules : elle joue alors chaque note telle quelle
    dst.events = events;
    app.changed();
    app.renderAll();
    render();
    SS.ui.toast(`${g.group} « ${g.label} » écrite dans « ${dst.name} » (${events.length} notes).`);
  }

  const KEEP = ['hmProgTrack', 'hmGenSrc', 'hmGenKind', 'hmGenDst', 'hmEmoTrack'];

  /* ---------- Émotion (skill MusicEmotion) ---------- */
  let emoProps = []; // propositions affichées : { label, chords, key, tempo }

  /** Tonalité d'une proposition : sur la tonique du projet s'il en a une (le centre du morceau est gardé). */
  function proposalKey(pr) {
    const k = key();
    const tonic = H().valid(k) ? k.tonic : pr.tonic;
    return { tonic, mode: pr.mode };
  }

  function emotionSection() {
    const p = app.project();
    const emo = SS.findEmotion(p.emotion);
    const chips = SS.EMOTIONS.map(
      (e) => `<button type="button" class="chip emo-chip${emo === e ? ' active' : ''}" data-emo="${e.id}" title="${esc(e.harmony)} · ${esc(e.melody)}">${esc(e.label)}</button>`
    ).join('');
    let card = '<p class="hm-muted">Choisissez une intention : trois pistes contrastées sont proposées (évidence, nuance, surprise), à écouter et comparer.</p>';
    if (emo) {
      emoProps = emo.proposals.map((pr) => {
        const k = proposalKey(pr);
        return { ...pr, key: k, label: `${SS.EMOTION_KINDS[pr.kind]} · ${emo.label}`, chords: pr.seq.map(([d, t, a]) => H().makeChord(k, d, t, a || 0)) };
      });
      const dim = (name, v) => `<span class="emo-dim"><small>${name}</small><i style="--v:${v}%"></i><b>${v}</b></span>`;
      const gen = H().GENERATORS.find((g) => g.id === emo.melodyGen);
      const abs = [...emo.ab, ...H().TRANSFORMS.map((t) => t.id).filter((id) => !emo.ab.includes(id))];
      card = `
        <div class="emo-card">
          <div class="emo-dims">${dim('Valence', emo.dims[0])}${dim('Activation', emo.dims[1])}${dim('Tension', emo.dims[2])}<span class="hm-muted">repères subjectifs</span></div>
          <dl class="emo-matrix">
            <dt>Harmonie</dt><dd>${esc(emo.harmony)}</dd><dt>Mélodie</dt><dd>${esc(emo.melody)}</dd>
            <dt>Rythme, texture</dt><dd>${esc(emo.texture)}</dd><dt>Risque</dt><dd>${esc(emo.risk)}</dd>
          </dl>
          <div class="hm-target">
            <label class="field"><span>Piste d'accords</span><select id="hmEmoTrack">${trackOptions((t) => t.category !== 'mono')}</select></label>
            <label class="emo-opt"><input type="checkbox" id="hmEmoKey" checked> changer aussi la tonalité et le tempo</label>
          </div>
          <div class="hm-progs">${emoProps
            .map(
              (pr, i) => `<div class="hm-progrow emo-prop">
                <div class="hm-proglabel"><b><span class="emo-kind k-${pr.kind}">${SS.EMOTION_KINDS[pr.kind]}</span> ${esc(H().label(pr.key))} · ${pr.tempo} BPM</b><small>${esc(pr.why)}</small><small class="emo-caveat">Réserve : ${esc(pr.caveat)}</small></div>
                <div class="hm-progchords">${pr.chords.map((c) => `<span class="hm-step role-${c.role.id}${c.borrowed ? ' borrowed' : ''}" title="${esc(c.notes.join('–'))}"><b>${esc(c.numeral)}</b>${esc(c.name)}</span>`).join('')}</div>
                <button type="button" class="btn btn-small" data-emo-listen="${i}">Écouter</button>
                <button type="button" class="btn btn-small btn-accent" data-emo-apply="${i}">Appliquer</button>
              </div>`
            )
            .join('')}</div>
          <p class="hm-muted"><b>Ensuite</b> : mélodie conseillée « ${esc(gen ? gen.label : '')} » (${esc(gen ? gen.text : '')}).
            <button type="button" class="btn btn-small" id="hmEmoMel"${H().valid(key()) ? '' : ' disabled'}>Préparer la mélodie</button></p>
          <div class="emo-ab">
            <b>Essai A/B</b> <span class="hm-muted">— la scène est copiée (scène « … B ») et un seul paramètre change ; passez de l'une à l'autre pendant la lecture (mode Boucle) et gardez celle qui communique le mieux l'intention.</span>
            <div class="chips">${abs
              .map((id) => {
                const t = H().TRANSFORMS.find((x) => x.id === id);
                return `<button type="button" class="chip${emo.ab.includes(id) ? ' emo-rec' : ''}" data-ab="${id}" title="${esc(t.text)}"${H().valid(key()) ? '' : ' disabled'}>${esc(t.label)}</button>`;
              })
              .join('')}</div>
          </div>
        </div>`;
    }
    return `
      <section class="hm-sec hm-emo">
        <h3>Émotion <small>hypothèses stylistiques à écouter, pas des recettes</small></h3>
        <div class="chips">${chips}</div>
        ${card}
        <p class="hm-muted">Aucune suite d'accords n'encode une émotion à coup sûr : la mélodie, le tempo, le timbre, la dynamique et le contexte comptent autant. Pour une trajectoire (solitude → espoir…), créez une scène par étape et choisissez une intention pour chacune.</p>
      </section>`;
  }

  function listenChords(chords, t) {
    t = t || previewTrack();
    if (!t) return SS.ui.toast('Ajoutez une piste Instrument ou Synthé pour écouter.');
    let near = 54;
    chords.forEach((c, i) =>
      setTimeout(() => {
        const notes = H().voice(c, near, 54);
        near = notes[0];
        SS.audio.preview(t, notes, 0.75);
      }, i * 800)
    );
  }

  function applyProposal(pr) {
    const p = app.project();
    const t = byId($('#hmEmoTrack') && $('#hmEmoTrack').value);
    if (!t) return SS.ui.toast('Ajoutez une piste Accord (ou Arpège) pour appliquer la proposition.');
    if (t.events.length && !confirm(`Remplacer les accords de « ${t.name} » dans cette scène ?`)) return;
    if ($('#hmEmoKey').checked) {
      p.key = { ...pr.key };
      p.tempo = pr.tempo;
      $('#tempo').value = pr.tempo;
    }
    placeChords(t, pr.chords);
    SS.ui.toast(`${pr.label} : ${pr.chords.map((c) => c.name).join(' – ')} posée dans « ${t.name} »${$('#hmEmoKey').checked ? ` (${H().label(pr.key)}, ${pr.tempo} BPM)` : ''}.`);
  }

  /** Essai A/B : copie la scène en cours, puis change un seul paramètre dans la copie. */
  function abTest(id) {
    const p = app.project();
    const k = key();
    const tr = H().TRANSFORMS.find((x) => x.id === id);
    let target;
    if (id === 'pedal') {
      const monos = p.tracks.filter((t) => t.type === 'instrument' && t.category === 'mono' && t.events.length);
      const avg = (t) => t.events.reduce((a, e) => a + e.notes[0], 0) / t.events.length;
      target = monos.find((t) => t.family === 'bass' || /bass|basse/i.test(t.name)) || monos.sort((a, b) => avg(a) - avg(b))[0];
      if (!target) return SS.ui.toast('Il faut une piste de basse avec des notes (Générer une couche ▸ Basse).');
    } else {
      target = byId($('#hmEmoTrack') && $('#hmEmoTrack').value);
      if (!target || !target.events.length) return SS.ui.toast('Il faut une piste d’accords avec des accords posés.');
    }
    const r = H().transform(id, target.events, k);
    if (!r.changed) return SS.ui.toast(`« ${tr.label} » ne change rien ici (aucun accord concerné).`);
    const before = SS.currentScene(p).name;
    $('#sceneCopy').click(); // nouvelle scène, copie de la scène en cours, qui devient la scène éditée
    const sc = SS.currentScene(p);
    sc.name = (before + ' B').slice(0, 40);
    const t2 = byId(target.id);
    t2.events = r.events;
    app.changed();
    app.renderAll();
    SS.song.render();
    render();
    SS.ui.toast(`Scène « ${sc.name} » : ${tr.label}. Comparez-la à « ${before} » en changeant de scène pendant la lecture.`, 6000);
  }

  function render() {
    const body = $('#hmBody');
    // garde les choix des listes d'un rendu à l'autre (enchaîner basse, arpège, mélodie)
    const kept = Object.fromEntries(KEEP.map((id) => [id, document.getElementById(id) && document.getElementById(id).value]));
    const k = key();
    const restore = () => {
      for (const id of KEEP) {
        const el = document.getElementById(id);
        if (el && kept[id] && [...el.options].some((o) => o.value === kept[id])) el.value = kept[id];
      }
    };
    if (!H().valid(k)) {
      body.innerHTML =
        emotionSection() +
        `<p class="hm-empty">Aucune tonalité choisie. Choisissez une tonique et un mode, cliquez sur <b>Détecter</b> pour l'estimer d'après les notes du projet, ou appliquez une proposition de la section Émotion.</p>`;
      restore();
      return;
    }
    const sc = H().scale(k);
    const iv = H().MODES.find((m) => m.id === k.mode).iv;
    const steps = iv.map((x, i) => (i < 6 ? iv[i + 1] : 12) - x);
    const { diatonic, extra } = H().chords(k);
    palette = [...diatonic, ...extra];
    progs = H().progressions(k);
    const notes = sc.map((d, i) => `<span class="hm-note${i === 0 ? ' tonic' : ''}"><b>${esc(d.name)}</b><small>${esc(H().french(d.name))}</small></span>`).join('');
    const modal = !H().isTonal(k);
    const mode = H().MODES.find((m) => m.id === k.mode);
    body.innerHTML = emotionSection() + `
      <section class="hm-sec">
        <h3>Gamme de ${esc(H().label(k))}</h3>
        <div class="hm-scale">${notes}</div>
        <p class="hm-muted">Écart entre les degrés : ${steps.join(' – ')} demi-tons. La tonique (encadrée) est la note de repos.</p>
      </section>
      <section class="hm-sec">
        <h3>Accords de la tonalité <small>cliquer pour écouter</small></h3>
        <div class="hm-chords">${diatonic.map((c, i) => chordCard(c, i)).join('')}</div>
        ${extra.length ? `<h3 class="hm-h-extra">${k.mode === 'minor' ? 'Emprunts utiles' : 'Septième de dominante'}</h3>
        <div class="hm-chords">${extra.map((c, i) => chordCard(c, diatonic.length + i)).join('')}</div>` : ''}
        <p class="hm-muted">${
          modal
            ? `${esc(H().label(k))} est un mode, pas une tonalité : pas de dominante qui « appelle » la tonique. Sa ${esc(mode.colorText)} (${esc(sc[mode.color].name)}) le distingue ; les accords qui la contiennent sont marqués « couleur du mode ». Faites-la entendre dans la mélodie et revenez souvent au centre ${esc(sc[0].name)}.`
            : k.mode === 'minor'
            ? `En mineur naturel, v est mineur (sans sensible). La dominante majeure ${esc(extra[0].name)} et ${esc(extra[1].name)} empruntent la sensible ${esc(extra[0].notes[1])} au mineur harmonique : elle monte d'un demi-ton vers la tonique ${esc(sc[0].name)}.`
            : `${esc(extra[0].name)} ajoute la septième ${esc(extra[0].notes[3])} à la dominante : le triton ${esc(extra[0].notes[1])}–${esc(extra[0].notes[3])} se résout sur ${esc(sc[0].name)}–${esc(sc[2].name)}.`
        } Dans le piano roll d'une piste Accord ou Arpège, la palette pose ces accords à l'endroit cliqué.</p>
      </section>
      <section class="hm-sec">
        <h3>Progressions <small>transposées en ${esc(H().label(k))}</small></h3>
        <div class="hm-target">
          <label class="field"><span>Piste d'accords</span><select id="hmProgTrack">${trackOptions((t) => t.category !== 'mono')}</select></label>
          <span class="hm-muted">« Poser » remplace les accords de la scène en cours : un accord par mesure, répété jusqu'à la fin.</span>
        </div>
        ${modal ? '<p class="hm-muted">Les progressions tonales ne s’appliquent pas à un mode : partez des propositions de la section Émotion ou de la palette d’accords.</p>' : ''}
        <div class="hm-progs">${progs
          .map(
            (pr, i) => `<div class="hm-progrow">
              <div class="hm-proglabel"><b>${esc(pr.label)}</b><small>${esc(pr.style)}</small></div>
              <div class="hm-progchords">${pr.chords.map((c) => `<span class="hm-step role-${c.role.id}${c.borrowed ? ' borrowed' : ''}"><b>${esc(c.numeral)}</b>${esc(c.name)}</span>`).join('')}</div>
              <button type="button" class="btn btn-small" data-listen="${i}">Écouter</button>
              <button type="button" class="btn btn-small btn-accent" data-place="${i}">Poser</button>
            </div>`
          )
          .join('')}</div>
        ${modal ? '' : `<p class="hm-muted">${k.mode === 'major' ? 'En majeur' : 'En mineur'}, seules les progressions de ce mode sont proposées ; la tonalité relative (${esc(H().label(relative(k)))}) offre les autres. Les accords marqués en pointillés sont des emprunts.</p>`}
      </section>
      <section class="hm-sec">
        <h3>Générer une couche <small>à partir des accords posés</small></h3>
        <div class="hm-gen">
          <label class="field"><span>Accords de</span><select id="hmGenSrc">${trackOptions((t) => t.category !== 'mono' && t.events.length)}</select></label>
          <label class="field"><span>Couche</span><select id="hmGenKind">${genOptions()}</select></label>
          <label class="field"><span>Dans la piste</span><select id="hmGenDst">${trackOptions(() => true)}</select></label>
          <button type="button" class="btn btn-accent" id="hmGen">Générer</button>
        </div>
        <p class="hm-muted" id="hmGenHelp"></p>
        <p class="hm-muted">Ajoutez une couche à la fois et écoutez ce qu'elle change avant la suivante. Le résultat est un point de départ : variez ensuite le rythme, l'octave ou une note de passage. Ctrl+Z annule.</p>
      </section>
      <section class="hm-sec">
        <h3>Analyse des scènes <button type="button" class="btn btn-small" id="hmRefresh">Analyser à nouveau</button></h3>
        <div id="hmAnalysis"></div>
      </section>`;
    defaultTargets();
    restore();
    $('#hmGenHelp').textContent = (H().GENERATORS.find((x) => x.id === $('#hmGenKind').value) || {}).text || '';
    renderAnalysis();
  }

  const KIND = { warn: 'À vérifier', info: 'Emprunt', tip: 'Conseil' };

  function renderAnalysis() {
    const el = $('#hmAnalysis');
    if (!el) return;
    const res = H().analyze(app.project());
    const html = res
      .map((sec) => {
        const prog = sec.progressions.length
          ? sec.progressions
              .map(
                (pr) =>
                  `<div class="hm-prog"><span class="hm-track">${esc(pr.track)}</span>${pr.items
                    .map((it) => `<span class="hm-step st-${it.status}" title="${esc(it.status)}${it.why ? ' : ' + esc(it.why) : ''}"><b>${esc(it.numeral)}</b>${esc(it.name)}</span>`)
                    .join('')}</div>`
              )
              .join('')
          : '<p class="hm-muted">Pas d’accords dans cette scène (pistes Accord ou Arpège).</p>';
        const rem = sec.remarks.length
          ? `<ul class="hm-remarks">${sec.remarks
              .map(
                (r) =>
                  `<li class="k-${r.kind}"><span class="hm-badge">${KIND[r.kind]}</span><div><b>${esc(r.track)}</b> · ${esc(r.where)}<br>${esc(r.text)}<br><small>${esc(r.hint)}</small></div></li>`
              )
              .join('')}</ul>`
          : '<p class="hm-ok">Rien à signaler : notes dans la tonalité, temps forts sur des notes des accords.</p>';
        return `<div class="hm-scene">${sec.name ? `<h4>${esc(sec.name)}</h4>` : ''}${prog}${rem}</div>`;
      })
      .join('');
    el.innerHTML = html || '<p class="hm-muted">Aucune piste instrument.</p>';
  }

  function sync() {
    const k = key();
    $('#hmTonic').value = H().valid(k) ? k.tonic : '';
    $('#hmMode').value = H().valid(k) ? k.mode : '';
    updateButton();
    render();
  }

  function init(appApi) {
    app = appApi;
    const tonic = $('#hmTonic');
    tonic.append(new Option('—', ''));
    H().TONICS.forEach((t) => tonic.append(new Option(`${t} (${H().french(t)})`, t)));
    const mode = $('#hmMode');
    mode.append(new Option('Aucune tonalité', ''));
    H().MODES.forEach((m) => mode.append(new Option(m.label, m.id)));
    const onPick = () => {
      const t = tonic.value || (key() && key().tonic) || 'C';
      const m = mode.value;
      $('#hmDetectOut').textContent = '';
      setKey(m ? { tonic: t, mode: m } : tonic.value ? { tonic: t, mode: 'major' } : null);
    };
    tonic.addEventListener('change', onPick);
    mode.addEventListener('change', onPick);
    $('#hmDetect').addEventListener('click', () => {
      const d = H().detect(app.project());
      if (!d) {
        $('#hmDetectOut').textContent = 'Aucune note dans le projet.';
        return;
      }
      setKey(d.key);
      $('#hmDetectOut').textContent = `Estimation : ${H().label(d.key)} (sinon ${H().label(d.second.key)}). La tonalité perçue dépend aussi de la mélodie et des cadences : écoutez !`;
    });
    $('#hmBody').addEventListener('change', (e) => {
      if (e.target.id === 'hmGenKind' || e.target.id === 'hmGenSrc') defaultTargets();
    });
    $('#hmBody').addEventListener('click', (e) => {
      if (e.target.closest('#hmRefresh')) return renderAnalysis();
      if (e.target.closest('#hmGen')) return generate();
      const emoB = e.target.closest('[data-emo]');
      if (emoB) {
        const p = app.project();
        p.emotion = p.emotion === emoB.dataset.emo ? undefined : emoB.dataset.emo;
        if (!p.emotion) delete p.emotion;
        app.changed();
        return render();
      }
      const el = e.target.closest('[data-emo-listen]');
      if (el) return listenChords(emoProps[+el.dataset.emoListen].chords, byId($('#hmEmoTrack').value));
      const ea = e.target.closest('[data-emo-apply]');
      if (ea) {
        applyProposal(emoProps[+ea.dataset.emoApply]);
        return sync();
      }
      const ab = e.target.closest('[data-ab]');
      if (ab) return abTest(ab.dataset.ab);
      if (e.target.closest('#hmEmoMel')) {
        const emo = SS.findEmotion(app.project().emotion);
        const kind = $('#hmGenKind');
        if (!emo || !kind) return;
        kind.value = emo.melodyGen;
        defaultTargets();
        kind.closest('section').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return SS.ui.toast('Mélodie prête : vérifiez la piste cible puis cliquez sur Générer.');
      }
      const lb = e.target.closest('[data-listen]');
      if (lb) return listen(progs[+lb.dataset.listen]);
      const pb = e.target.closest('[data-place]');
      if (pb) return place(progs[+pb.dataset.place]);
      const b = e.target.closest('.hm-chord');
      if (!b) return;
      const c = palette[+b.dataset.i];
      const t = previewTrack();
      if (!t) return SS.ui.toast('Ajoutez une piste Instrument ou Synthé pour écouter les accords.');
      SS.audio.preview(t, H().voice(c, 60), 0.9);
    });
    const dlg = $('#harmonyDialog');
    $('#harmonyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      dlg.close();
    });
    dlg.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['BUTTON', 'SELECT'].includes(e.target.tagName)) return;
      e.stopPropagation();
    });
    $('#keyBtn').addEventListener('click', open);
  }

  function open() {
    $('#hmDetectOut').textContent = '';
    sync();
    $('#harmonyDialog').showModal();
  }

  return { init, open, updateButton };
})();
