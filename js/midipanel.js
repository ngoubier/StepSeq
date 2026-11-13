/*
 * Fenêtres « Importer MIDI » et « Exporter MIDI » (menu de l'icône de l'application).
 * Le travail est fait par js/midi.js ; ici : choix du fichier, options, aperçu du bilan, téléchargement.
 */
window.SS = window.SS || {};
SS.midiPanel = (() => {
  const $ = (q) => document.querySelector(q);
  let app = null;
  let file = null; // { name, buf } fichier MIDI en cours d'import
  let result = null; // dernier résultat d'import (projet + bilan)
  let split = 0.85;

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
  const pct = (x) => `${(Math.floor(x * 1000) / 10).toLocaleString('fr-FR')} %`;
  const duration = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
  const segment = (el, value) => el.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === String(value)));
  const section = (title, ...kids) => h('section', { class: 'midi-sec' }, h('h3', {}, title), ...kids);

  /* ---------------- Import ---------------- */

  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mid,.midi,.kar,audio/midi,audio/x-midi';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      file = { name: f.name, buf: new Uint8Array(await f.arrayBuffer()) };
      openImport();
    };
    input.click();
  }

  function analyzeFile() {
    const title = file.name.replace(/\.(mid|midi|kar)$/i, '').replace(/[_]+/g, ' ').trim();
    try {
      result = SS.midi.importFile(file.buf, { title, similar: split, machine: $('#miMachine').value });
    } catch (e) {
      console.error(e);
      result = { error: e.message || String(e) };
    }
    renderImport();
  }

  function renderImport() {
    const box = $('#miReport');
    box.textContent = '';
    $('#miOk').disabled = !!result.error;
    if (result.error) {
      box.append(h('p', { class: 'midi-error' }, `Import impossible : ${result.error}`));
      return;
    }
    const r = result.report;
    const key = r.key && SS.harmony ? SS.harmony.label(r.key) : null;
    box.append(
      h('p', { class: 'midi-summary' },
        h('b', {}, `${r.bars} mesures`), ` · ${Math.round(r.tempo * 100) / 100} BPM · ${r.timeSig[0]}/${r.timeSig[1]}`,
        key ? ` · ${key} (estimée)` : '', ` · ${r.tracks.length} pistes`)
    );
    const fid = r.fidelity;
    box.append(
      section(`Structure : ${r.scenes.length} scène${r.scenes.length > 1 ? 's' : ''}, ${r.song.length} blocs`,
        h('ol', { class: 'midi-song' }, r.song.map((b) => h('li', {}, b.name, b.repeat > 1 ? h('small', {}, ` ×${b.repeat}`) : null))),
        h('p', { class: 'dlg-hint' },
          `${pct(fid.kept)} des notes du fichier sont rejouées à leur place`,
          fid.added ? ` (${fid.added} note${fid.added > 1 ? 's' : ''} ajoutée${fid.added > 1 ? 's' : ''} par les répétitions)` : '',
          '. Les scènes, leurs noms et l\'arrangement restent modifiables dans la fenêtre Song.')
      )
    );
    const drums = r.tracks.filter((t) => t.kind === 'drum');
    const insts = r.tracks.filter((t) => t.kind !== 'drum');
    const rows = (list) => h('ul', { class: 'midi-tracks' }, list.map((t) => h('li', {}, h('b', {}, t.name), h('span', {}, t.sound), h('small', {}, `${t.notes} notes`))));
    if (insts.length) box.append(section(`Instruments (${insts.length})`, rows(insts)));
    if (drums.length) box.append(section(`Batterie (${drums.length})`, rows(drums)));
    if (r.warnings.length) box.append(section('Pertes et approximations', h('ul', { class: 'midi-warn' }, r.warnings.map((w) => h('li', {}, w)))));
  }

  function openImport() {
    $('#miFile').textContent = file.name;
    segment($('#miSplit'), split);
    $('#miReport').textContent = 'Analyse…';
    const dlg = $('#midiImportDialog');
    dlg.returnValue = '';
    dlg.showModal();
    setTimeout(analyzeFile, 20); // laisse la fenêtre s'afficher pendant l'analyse
  }

  async function confirmImport() {
    if (!result || result.error) return;
    const { project } = result;
    $('#midiImportDialog').close('ok');
    await app.flush();
    SS.files.reset();
    await app.loadSong(project);
    SS.ui.toast(`« ${project.title} » importé : ${project.tracks.length} pistes, ${project.scenes.length} scènes. Lecture en mode Chanson.`, 6000);
    result = null;
    file = null;
  }

  /* ---------------- Export ---------------- */
  const exp = { range: 'song', loops: 4, audibleOnly: true, swing: true };

  function exportOptions() {
    return { ...exp };
  }

  function renderExport() {
    segment($('#meRange'), exp.range);
    $('#meLoopsRow').hidden = exp.range !== 'scene';
    const box = $('#meReport');
    box.textContent = '';
    let res;
    try {
      res = SS.midi.exportProject(app.project(), exportOptions());
    } catch (e) {
      console.error(e);
      box.append(h('p', { class: 'midi-error' }, `Export impossible : ${e.message}`));
      return null;
    }
    const r = res.report;
    box.append(h('p', { class: 'midi-summary' }, h('b', {}, duration(r.seconds)), ` · ${r.tracks} pistes · ${r.notes} notes · ${app.project().tempo} BPM`));
    if (r.approx.length) box.append(section('Sons remplacés par leur équivalent General MIDI', h('ul', { class: 'midi-warn' }, r.approx.map((w) => h('li', {}, w)))));
    if (r.ignored.length) box.append(section('Non exporté', h('ul', { class: 'midi-warn' }, r.ignored.map((w) => h('li', {}, w)))));
    return res;
  }

  function openExport() {
    const p = app.project();
    if (!p.tracks.length) {
      SS.ui.toast('Rien à exporter : ajoute d\'abord une piste.');
      return;
    }
    // une chanson à une seule scène : on propose la scène bouclée
    if (p.song.length <= 1 && p.song.every((b) => b.repeat <= 1)) exp.range = 'scene';
    $('#meLoops').value = exp.loops;
    $('#meAudible').checked = exp.audibleOnly;
    $('#meSwing').checked = exp.swing;
    renderExport();
    const dlg = $('#midiExportDialog');
    dlg.returnValue = '';
    dlg.showModal();
  }

  function download() {
    const res = renderExport();
    if (!res) return;
    const p = app.project();
    const blob = new Blob([res.bytes], { type: 'audio/midi' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = SS.midiFileName(p);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('#midiExportDialog').close('ok');
    SS.ui.toast(`« ${a.download} » exporté (${res.report.notes} notes).`);
  }

  function init(api) {
    app = api;
    const sel = $('#miMachine');
    Object.entries(SS.midi.MACHINES).forEach(([id, m]) => sel.append(h('option', { value: id }, m.label)));
    $('#importMidi').addEventListener('click', pickFile);
    $('#exportMidi').addEventListener('click', openExport);
    $('#miSplit').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      split = +b.dataset.v;
      segment($('#miSplit'), split);
      analyzeFile();
    });
    sel.addEventListener('change', analyzeFile);
    $('#miCancel').addEventListener('click', () => $('#midiImportDialog').close('cancel'));
    $('#miForm').addEventListener('submit', (e) => {
      e.preventDefault();
      confirmImport();
    });
    $('#meRange').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      exp.range = b.dataset.v;
      renderExport();
    });
    $('#meLoops').addEventListener('change', (e) => {
      exp.loops = Math.min(64, Math.max(1, Math.round(+e.target.value) || 1));
      e.target.value = exp.loops;
      renderExport();
    });
    $('#meAudible').addEventListener('change', (e) => {
      exp.audibleOnly = e.target.checked;
      renderExport();
    });
    $('#meSwing').addEventListener('change', (e) => {
      exp.swing = e.target.checked;
      renderExport();
    });
    $('#meCancel').addEventListener('click', () => $('#midiExportDialog').close('cancel'));
    $('#meForm').addEventListener('submit', (e) => {
      e.preventDefault();
      download();
    });
    // la barre d'espace ne lance pas la lecture derrière la fenêtre
    ['#midiImportDialog', '#midiExportDialog'].forEach((q) => $(q).addEventListener('keydown', (e) => e.stopPropagation()));
  }

  return { init, openExport, pickFile };
})();
