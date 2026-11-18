/*
 * Fenêtre « Exporter l'audio » (menu de l'icône de l'application) : options, progression, bilan, téléchargement.
 * Le travail est fait par js/render.js (rendu hors temps réel, mesures, WAV, ZIP).
 */
window.SS = window.SS || {};
SS.audioExport = (() => {
  const $ = (q) => document.querySelector(q);
  const PREF = 'ss.audioExport';
  let app = null;
  let busy = null; // { ctrl } pendant un rendu
  const opt = { range: 'song', loops: 4, master: true, stems: 'none', bits: 24, sampleRate: 44100 };
  try {
    Object.assign(opt, JSON.parse(localStorage.getItem(PREF) || '{}'));
  } catch (e) {
    /* préférences indisponibles */
  }
  const savePrefs = () => {
    try {
      localStorage.setItem(PREF, JSON.stringify({ stems: opt.stems, bits: opt.bits, sampleRate: opt.sampleRate, master: opt.master }));
    } catch (e) {
      /* stockage indisponible */
    }
  };

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const duration = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
  const mb = (bytes) => `${fr(bytes / 1048576, bytes < 10485760 ? 1 : 0)} Mo`;
  const segment = (el, value) => el.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.v === String(value);
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('role', 'radio');
  });

  /** Ce que l'export va produire : durée, nombre de rendus, taille. */
  function summary() {
    const p = app.project();
    const plan = SS.render.songPlan(p, opt);
    const groups = opt.stems === 'none' ? [] : SS.render.stemGroups(p, opt.stems);
    const files = (opt.master ? 1 : 0) + groups.length;
    const secs = plan.seconds + 2; // + la queue de reverb, à peu près
    const bytes = files * secs * opt.sampleRate * 2 * (opt.bits / 8);
    return { plan, groups, files, renders: 1 + groups.length, bytes };
  }

  function renderOptions() {
    segment($('#axRange'), opt.range);
    segment($('#axStems'), opt.stems);
    segment($('#axBits'), opt.bits);
    segment($('#axRate'), opt.sampleRate);
    $('#axLoopsRow').hidden = opt.range !== 'scene';
    $('#axLoops').value = opt.loops;
    $('#axMaster').checked = opt.master;
    const box = $('#axReport');
    box.textContent = '';
    const s = summary();
    const go = $('#axGo');
    go.disabled = !s.files || !s.plan.bars;
    if (!s.files) {
      box.append(h('p', { class: 'midi-error' }, 'Coche le master ou choisis des stems.'));
      return;
    }
    box.append(
      h('p', { class: 'midi-summary' }, h('b', {}, duration(s.plan.seconds)), ` · ${s.plan.bars} mesures · ${app.project().tempo} BPM · ${s.files} fichier${s.files > 1 ? 's' : ''} WAV, environ ${mb(s.bytes)}${s.files > 1 ? ' (dans une archive .zip)' : ''}`)
    );
    if (s.groups.length) {
      box.append(h('section', { class: 'midi-sec' }, h('h3', {}, `Stems (${s.groups.length})`), h('ul', { class: 'midi-song' }, s.groups.map((g) => h('li', {}, g.name, g.tracks.length > 1 ? h('small', {}, ` · ${g.tracks.length} pistes`) : null)))));
      box.append(h('p', { class: 'ax-hint' }, `${s.renders} rendus : la chanson est calculée une fois par stem, plus une fois pour le master. Compte environ ${s.renders} fois la moitié de la durée de la chanson sur un ordinateur récent.`));
    }
    go.textContent = s.files > 1 ? 'Exporter (.zip)' : 'Exporter (.wav)';
  }

  function open() {
    const p = app.project();
    if (!p.tracks.length) {
      SS.ui.toast('Rien à exporter : ajoute d\'abord une piste.');
      return;
    }
    if (busy) return $('#audioExportDialog').showModal();
    if (p.song.length <= 1 && p.song.every((b) => b.repeat <= 1) && p.playMode !== 'song') opt.range = 'scene';
    else opt.range = 'song';
    $('#axOptions').hidden = false;
    $('#axProgress').hidden = true;
    $('#axGo').hidden = false;
    $('#axCancel').textContent = 'Annuler';
    renderOptions();
    const dlg = $('#audioExportDialog');
    dlg.returnValue = '';
    dlg.showModal();
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /** Bilan du master, avec ce qu'en feront les plateformes. */
  function reportView(res, fileName) {
    const M = res.report.master;
    const rows = [];
    const row = (label, value, note, level) => rows.push(h('li', { class: level ? 'ax-' + level : null }, h('b', {}, label), h('span', {}, value), note ? h('small', {}, note) : null));
    const i = M.integrated;
    const down = Number.isFinite(i) ? i + 14 : null;
    row('Volume intégré', `${fr(i)} LUFS`, down > 0.5 ? `Spotify, YouTube et Deezer (−14 LUFS) le baisseront d'environ ${fr(down)} dB : c'est normal pour un titre fort.` : down != null && down < -3 ? 'Plus doux que la référence des plateformes (−14 LUFS) : elles ne le monteront pas toujours.' : 'Proche de la référence des plateformes (−14 LUFS).');
    row('Volume court terme max', `${fr(M.shortMax)} LUFS`, 'La partie la plus forte (3 s).');
    const tpOk = M.truePeak <= -0.95;
    row('Crête vraie', `${fr(M.truePeak)} dBTP`, tpOk ? 'Sous −1 dBTP : pas de saturation après conversion en MP3 ou AAC.' : 'Au-dessus de −1 dBTP : risque de saturation après conversion en MP3 ou AAC. Baisse le gain du mastering.', tpOk ? null : 'warn');
    row('Dynamique (PLR)', `${fr(M.plr)} dB`, M.plr != null && M.plr < 7 ? 'Très compressé : les coups de batterie manquent d’impact.' : M.plr != null && M.plr > 14 ? 'Très dynamique : bien pour l’écoute au casque, discret en playlist.' : 'Équilibre courant pour de la musique électronique.', M.plr != null && M.plr < 7 ? 'warn' : null);
    if (M.lra != null) row('Écart de volume (LRA)', `${fr(M.lra)} LU`, 'Différence entre les passages doux et forts.');
    if (M.corr != null) row('Corrélation stéréo', fr(M.corr, 2), M.corr < 0 ? 'Négative : des sons s’annulent en mono (téléphone, enceinte). À corriger.' : M.corr < 0.3 ? 'Image très large : vérifie l’écoute en mono.' : 'Bonne compatibilité mono.', M.corr < 0 ? 'warn' : null);
    const box = $('#axReport');
    box.textContent = '';
    box.append(h('p', { class: 'midi-summary' }, '✓ ', h('b', {}, fileName), ` · ${duration(res.report.seconds)} · ${res.report.bits === 32 ? '32 bits flottant' : res.report.bits + ' bits'} · ${fr(res.report.sampleRate / 1000, 1)} kHz`));
    box.append(h('section', { class: 'midi-sec' }, h('h3', {}, 'Bilan du master'), h('ul', { class: 'ax-meas' }, rows)));
    if (res.report.stems.length) {
      const hot = res.report.stems.filter((s) => s.peak > -0.1);
      box.append(
        h('section', { class: 'midi-sec' }, h('h3', {}, 'Stems (crête)'), h('ul', { class: 'midi-tracks' }, res.report.stems.map((s) => h('li', {}, h('b', {}, s.name), h('span', {}, s.tracks > 1 ? `${s.tracks} pistes` : ''), h('small', { class: s.peak > -0.1 ? 'ax-warn' : null }, `${fr(s.peak)} dBFS`)))))
      );
      if (hot.length && res.report.bits !== 32) box.append(h('p', { class: 'ax-hint ax-warn' }, `${hot.map((s) => s.name).join(', ')} : crête à 0 dBFS, écrêtée dans le fichier. Exporte en 32 bits flottant, ou baisse ces pistes.`));
      if (res.report.delayMs > 0.05) box.append(h('p', { class: 'ax-hint' }, `Master recalé de ${fr(res.report.delayMs)} ms sur les stems (retard du limiteur du mastering).`));
    }
  }

  async function run() {
    const p = app.project();
    const s = summary();
    if (!s.files) return;
    if (SS.audio.isPlaying() || SS.audio.isPaused()) app.stop(); // le rendu a besoin de tout le processeur
    const ctrl = new AbortController();
    busy = { ctrl };
    $('#axOptions').hidden = true;
    $('#axProgress').hidden = false;
    $('#axGo').hidden = true;
    $('#axCancel').textContent = 'Arrêter';
    $('#axReport').textContent = '';
    const fill = $('#axBarFill');
    const stage = $('#axStage');
    const t0 = performance.now();
    let label = '';
    let frac = 0;
    const show = () => {
      fill.style.width = `${Math.round(frac * 100)}%`;
      const el = (performance.now() - t0) / 1000;
      const left = frac > 0.03 ? (el / frac) * (1 - frac) : null;
      stage.textContent = `${label} · ${Math.round(frac * 100)} %${left != null ? ` · encore ${left > 90 ? Math.round(left / 60) + ' min' : Math.max(1, Math.round(left)) + ' s'}` : ''}`;
    };
    try {
      const res = await SS.render.exportAudio(p, opt, {
        signal: ctrl.signal,
        onStage: (name, i, total) => {
          label = total > 1 ? `Rendu ${i + 1} / ${total} : ${name}` : `Rendu : ${name}`;
          show();
        },
        onProgress: (f) => {
          frac = f;
          show();
        },
      });
      stage.textContent = 'Écriture du fichier…';
      await new Promise((r) => setTimeout(r, 0));
      const base = (p.title || 'chanson').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'chanson';
      let name;
      if (res.files.length === 1) {
        name = res.files[0].name;
        download(new Blob([res.files[0].data], { type: 'audio/wav' }), name);
      } else {
        name = `${base} - audio.zip`;
        download(new Blob(SS.render.zip(res.files), { type: 'application/zip' }), name);
      }
      $('#axProgress').hidden = true;
      reportView(res, name);
      $('#axCancel').textContent = 'Fermer';
      SS.ui.toast(`« ${name} » exporté.`, 4000);
    } catch (e) {
      $('#axProgress').hidden = true;
      $('#axOptions').hidden = false;
      $('#axGo').hidden = false;
      $('#axCancel').textContent = 'Annuler';
      renderOptions();
      if (e && e.name === 'AbortError') SS.ui.toast('Export audio arrêté.');
      else {
        console.error(e);
        $('#axReport').prepend(h('p', { class: 'midi-error' }, `Export impossible : ${(e && e.message) || e}`));
      }
    } finally {
      busy = null;
    }
  }

  function init(api) {
    app = api;
    $('#exportAudio').addEventListener('click', open);
    const seg = (q, key, conv = (v) => v) =>
      $(q).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        opt[key] = conv(b.dataset.v);
        savePrefs();
        renderOptions();
      });
    seg('#axRange', 'range');
    seg('#axStems', 'stems');
    seg('#axBits', 'bits', Number);
    seg('#axRate', 'sampleRate', Number);
    $('#axMaster').addEventListener('change', (e) => {
      opt.master = e.target.checked;
      savePrefs();
      renderOptions();
    });
    $('#axLoops').addEventListener('change', (e) => {
      opt.loops = Math.min(64, Math.max(1, Math.round(+e.target.value) || 1));
      renderOptions();
    });
    $('#axCancel').addEventListener('click', () => {
      if (busy) busy.ctrl.abort();
      else $('#audioExportDialog').close('cancel');
    });
    $('#axForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!busy) run();
    });
    const dlg = $('#audioExportDialog');
    dlg.addEventListener('keydown', (e) => e.stopPropagation()); // la barre d'espace ne lance pas la lecture derrière
    dlg.addEventListener('cancel', (e) => {
      // Échap pendant un rendu : on demande l'arrêt plutôt que de fermer en laissant le rendu tourner
      if (busy) {
        e.preventDefault();
        busy.ctrl.abort();
      }
    });
  }

  return { init, open, _opt: opt };
})();
