/*
 * Fenêtres « Importer un morceau » (menu → Ouvrir un fichier… sur un .mid ou un projet Ableton .als) et « Exporter » au
 * format MIDI (menu → Exporter…).
 * Le travail est fait par js/midi.js (et js/ableton.js, qui fait d'un .als un fichier MIDI) ; ici : choix du fichier,
 * options, aperçu du bilan, téléchargement.
 */
window.SS = window.SS || {};
SS.midiPanel = (() => {
  const $ = (q) => document.querySelector(q);
  let app = null;
  let file = null; // { name, buf, als? } fichier en cours d'import (als : projet Ableton converti, voir js/ableton.js)
  let result = null; // dernier résultat d'import (projet + bilan)
  let split = 0.85; // ressemblance des scènes, ou 'clips' : d'après les clips d'un projet Ableton
  const isAls = (name) => /\.als$/i.test(name || '');

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
    input.accept = '.mid,.midi,.kar,audio/midi,audio/x-midi,.als';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      openWith(f.name, new Uint8Array(await f.arrayBuffer()));
    };
    input.click();
  }

  async function analyzeFile() {
    const title = titleOf(file.name);
    try {
      if (isAls(file.name) && !file.als) file.als = SS.ableton.toMidi(await SS.ableton.unpack(file.buf));
      const clips = split === 'clips' && file.als;
      result = SS.midi.importFile(file.als ? file.als.bytes : file.buf, {
        title,
        similar: clips ? 0.85 : +split || 0.85,
        cuts: clips ? file.als.cuts : null,
        machine: $('#miMachine').value,
        quantize: SS.quantizeOn(),
      });
      if (file.als) result.report.warnings.unshift(...file.als.info.warnings, ...file.als.info.ignored);
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
        key ? ` · ${key} (estimée)` : '', ` · ${r.tracks.length} pistes`, file.als ? ` · ${file.als.info.version}` : '')
    );
    const fid = r.fidelity;
    box.append(
      section(`Structure : ${r.scenes.length} scène${r.scenes.length > 1 ? 's' : ''}, ${r.song.length} blocs`,
        h('ol', { class: 'midi-song' }, r.song.map((b) => h('li', {}, b.name, b.repeat > 1 ? h('small', {}, ` ×${b.repeat}`) : null))),
        h('p', { class: 'dlg-hint' },
          `${pct(fid.kept)} des notes du fichier sont rejouées à leur place`,
          fid.added ? ` (${fid.added} note${fid.added > 1 ? 's' : ''} ajoutée${fid.added > 1 ? 's' : ''} par les répétitions)` : '',
          '.', SS.helpTip('Les scènes, leurs noms et l’arrangement restent modifiables dans la fenêtre Arrangement.', 'Structure'))
      )
    );
    const drums = r.tracks.filter((t) => t.kind === 'drum');
    const insts = r.tracks.filter((t) => t.kind !== 'drum');
    const clipsOf = (name) => {
      const t = file.als && file.als.info.tracks.find((x) => x.name === name);
      return t ? ` · ${t.clips} clip${t.clips > 1 ? 's' : ''}` : '';
    };
    const rows = (list) => h('ul', { class: 'midi-tracks' }, list.map((t) => h('li', {}, h('b', {}, t.name), h('span', {}, t.sound), h('small', {}, `${t.notes} notes${clipsOf(t.name)}`))));
    if (insts.length) box.append(section(`Instruments (${insts.length})`, rows(insts)));
    if (drums.length) box.append(section(`Batterie (${drums.length})`, rows(drums)));
    if (r.moves && r.moves.length) box.append(section('Mouvements de son', moveRows(r.moves)));
    if (r.warnings.length) box.append(section('Pertes et approximations', h('ul', { class: 'midi-warn' }, r.warnings.map((w) => h('li', {}, w)))));
  }

  /** Mouvements de son repris (volume, cutoff, résonance) : piste, courbe sur tout le morceau, destination. */
  const MOVE_COLOR = { 'Volume (CC 7)': 'var(--c-green)', 'Expression (CC 11)': 'var(--c-green)', 'Cutoff (CC 74)': 'var(--c-amber)', 'Résonance (CC 71)': 'var(--c-pink)' };
  function moveRows(moves) {
    const NS = 'http://www.w3.org/2000/svg';
    const box = h('div', { class: 'midi-moves' });
    for (const m of moves) {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${m.curve.length - 1} 22`);
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', m.curve.map((v, i) => `${i ? 'L' : 'M'}${i},${(20 - v * 18).toFixed(1)}`).join(' '));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', MOVE_COLOR[m.what] || 'var(--c-blue)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
      box.append(h('div', { class: 'mv-src' }, m.track, h('small', {}, `${m.what} · ${m.count}`)), svg, h('b', {}, m.to), h('span', { class: 'mv-ok' }, '✓'));
    }
    return box;
  }

  function openImport() {
    $('#miFile').textContent = file.name;
    const als = isAls(file.name);
    $('#miTitle').firstChild.textContent = als ? 'Importer un projet Ableton Live' : 'Importer un fichier MIDI';
    $('#miSplit').querySelector('[data-v="clips"]').hidden = !als;
    if (als && split !== 'clips') split = 'clips';
    if (!als && split === 'clips') split = 0.85;
    segment($('#miSplit'), split);
    $('#miReport').textContent = 'Analyse…';
    const dlg = $('#midiImportDialog');
    dlg.returnValue = '';
    dlg.showModal();
    setTimeout(analyzeFile, 20); // laisse la fenêtre s'afficher pendant l'analyse
  }

  async function confirmImport() {
    if (!result || result.error) return;
    $('#midiImportDialog').close('ok');
    await loadImported(result.project, file && file.name, $('#miMachine').value, null, file && file.als ? 'import Ableton' : null);
    result = null;
    file = null;
  }
  /** Ouvre le projet importé à la place du projet en cours (qui reste dans « Mes chansons »). */
  async function loadImported(project, name, machine, by, kind = 'import MIDI') {
    await app.flush();
    SS.files.reset();
    kind = kind || 'import MIDI';
    await app.loadSong(project, { origin: { kind: by ? `${kind} (${by})` : kind, detail: { fichier: name, machine } } });
    SS.ui.toast(`« ${project.title} » importé : ${project.tracks.length} pistes, ${project.scenes.length} scènes. Lecture en mode Chanson.`, 6000);
  }

  /* ---------------- Pour Claude (js/claude-tools.js, StepSeq.importerMidi) : mêmes options que la fenêtre ---------------- */
  const titleOf = (name) => String(name || 'Import MIDI').replace(/\.(mid|midi|kar|als)$/i, '').replace(/[_]+/g, ' ').trim();
  /**
   * Analyse un fichier : { project, report } (lève une erreur lisible si le fichier n'est pas un MIDI valable).
   * Un projet Ableton (.als) : asynchrone (décompression), similar 'clips' = scènes d'après les clips.
   */
  async function analyze(buf, { name, similar = 0.85, machine = SS.midi.GM_KIT, quantize = SS.quantizeOn() } = {}) {
    if (!isAls(name)) return SS.midi.importFile(buf, { title: titleOf(name), similar: +similar || 0.85, machine, quantize });
    const als = SS.ableton.toMidi(await SS.ableton.unpack(buf));
    const res = SS.midi.importFile(als.bytes, { title: titleOf(name), similar: similar === 'clips' ? 0.85 : similar, cuts: similar === 'clips' ? als.cuts : null, machine, quantize });
    res.report.warnings.unshift(...als.info.warnings, ...als.info.ignored);
    return res;
  }
  /** Ouvre la fenêtre « Importer MIDI » sur ce fichier, réglée comme demandé : l'utilisateur relit le bilan et confirme. */
  function openWith(name, buf, { similar, machine } = {}) {
    file = { name: name || 'import.mid', buf };
    if (similar) split = similar === 'clips' ? 'clips' : +similar;
    if (machine) $('#miMachine').value = machine;
    openImport();
  }

  /* ---------------- Export ---------------- */
  const exp = { range: 'song', loops: 4, audibleOnly: true, swing: true, expression: true };

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
    $('#meExpr').checked = exp.expression;
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
    sel.append(h('option', { value: SS.midi.GM_KIT }, 'General MIDI (sons d’origine, une piste par son)'));
    Object.entries(SS.midi.MACHINES).forEach(([id, m]) => sel.append(h('option', { value: id }, m.label)));
    sel.value = SS.midi.GM_KIT;
    $('#miSplit').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      split = b.dataset.v === 'clips' ? 'clips' : +b.dataset.v;
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
    $('#meExpr').addEventListener('change', (e) => {
      exp.expression = e.target.checked;
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

  return { init, openExport, pickFile, analyze, openWith, loadImported };
})();
