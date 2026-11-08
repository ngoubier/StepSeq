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

  function render() {
    const body = $('#hmBody');
    const k = key();
    if (!H().valid(k)) {
      body.innerHTML = `<p class="hm-empty">Aucune tonalité choisie. Choisissez une tonique et un mode, ou cliquez sur <b>Détecter</b> pour l'estimer d'après les notes du projet.</p>`;
      return;
    }
    const sc = H().scale(k);
    const iv = H().MODES.find((m) => m.id === k.mode).iv;
    const steps = iv.map((x, i) => (i < 6 ? iv[i + 1] : 12) - x);
    const { diatonic, extra } = H().chords(k);
    palette = [...diatonic, ...extra];
    const notes = sc.map((d, i) => `<span class="hm-note${i === 0 ? ' tonic' : ''}"><b>${esc(d.name)}</b><small>${esc(H().french(d.name))}</small></span>`).join('');
    body.innerHTML = `
      <section class="hm-sec">
        <h3>Gamme de ${esc(H().label(k))}</h3>
        <div class="hm-scale">${notes}</div>
        <p class="hm-muted">Écart entre les degrés : ${steps.join(' – ')} demi-tons. La tonique (encadrée) est la note de repos.</p>
      </section>
      <section class="hm-sec">
        <h3>Accords de la tonalité <small>cliquer pour écouter</small></h3>
        <div class="hm-chords">${diatonic.map((c, i) => chordCard(c, i)).join('')}</div>
        <h3 class="hm-h-extra">${k.mode === 'minor' ? 'Emprunts utiles' : 'Septième de dominante'}</h3>
        <div class="hm-chords">${extra.map((c, i) => chordCard(c, diatonic.length + i)).join('')}</div>
        <p class="hm-muted">${
          k.mode === 'minor'
            ? `En mineur naturel, v est mineur (sans sensible). La dominante majeure ${esc(extra[0].name)} et ${esc(extra[1].name)} empruntent la sensible ${esc(extra[0].notes[1])} au mineur harmonique : elle monte d'un demi-ton vers la tonique ${esc(sc[0].name)}.`
            : `${esc(extra[0].name)} ajoute la septième ${esc(extra[0].notes[3])} à la dominante : le triton ${esc(extra[0].notes[1])}–${esc(extra[0].notes[3])} se résout sur ${esc(sc[0].name)}–${esc(sc[2].name)}.`
        } Dans le piano roll d'une piste Accord ou Arpège, la palette pose ces accords à l'endroit cliqué.</p>
      </section>
      <section class="hm-sec">
        <h3>Analyse des scènes <button type="button" class="btn btn-small" id="hmRefresh">Analyser à nouveau</button></h3>
        <div id="hmAnalysis"></div>
      </section>`;
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
    $('#hmBody').addEventListener('click', (e) => {
      if (e.target.closest('#hmRefresh')) return renderAnalysis();
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
