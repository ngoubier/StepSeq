/*
 * Point d'entrée : état de l'application, barre d'outils, raccourcis, sauvegarde auto.
 */
(() => {
  const $ = (s) => document.querySelector(s);
  const AUTOSAVE_KEY = 'stepseq.autosave';

  let project;
  let dirty = false;
  const state = { editMode: 'toggle', openRolls: new Set(), songStart: 0 };

  /* ---------- Annuler / Rétablir ----------
   * On garde des instantanés du projet (JSON). Chaque modification enregistre l'état précédent ;
   * les modifications rapprochées (glisser un curseur, taper un titre) sont regroupées en une seule
   * étape grâce à un court délai.
   */
  const MAX_HISTORY = 100;
  const history = { past: [], future: [], present: null, timer: null };

  function snapshot() {
    return SS.serialize(project);
  }
  function resetHistory() {
    history.past = [];
    history.future = [];
    clearTimeout(history.timer);
    history.timer = null;
    history.present = snapshot();
    updateUndoButtons();
  }
  /** Enregistre l'état actuel comme nouvelle étape (s'il a changé). */
  function recordHistory() {
    clearTimeout(history.timer);
    history.timer = null;
    const now = snapshot();
    if (now === history.present) return;
    history.past.push(history.present);
    if (history.past.length > MAX_HISTORY) history.past.shift();
    history.present = now;
    history.future = [];
    updateUndoButtons();
  }
  function scheduleHistory() {
    clearTimeout(history.timer);
    history.timer = setTimeout(recordHistory, 350);
  }
  function restoreSnapshot(json) {
    const p = SS.normalizeProject(JSON.parse(json));
    project = p;
    SS.ui.clearSelection();
    syncHeader();
    SS.ui.renderAll();
    SS.song.render();
    SS.audio.applyAllFx(p);
    p.tracks.forEach((t) => SS.audio.prepareTrack(t));
    dirty = true;
    saveLocal();
  }
  function undo() {
    if (history.timer) recordHistory(); // une modification encore en attente compte comme une étape
    if (!history.past.length) return;
    history.future.push(history.present);
    history.present = history.past.pop();
    restoreSnapshot(history.present);
    updateUndoButtons();
    SS.ui.toast('Action annulée', 1200);
  }
  function redo() {
    if (history.timer) recordHistory();
    if (!history.future.length) return;
    history.past.push(history.present);
    history.present = history.future.pop();
    restoreSnapshot(history.present);
    updateUndoButtons();
    SS.ui.toast('Action rétablie', 1200);
  }
  function updateUndoButtons() {
    const u = $('#undoBtn');
    const r = $('#redoBtn');
    if (!u || !r) return;
    u.disabled = !history.past.length && !history.timer;
    r.disabled = !history.future.length;
  }

  /* ---------- Sauvegarde automatique (confort, dans le navigateur) ---------- */
  let autosaveTimer;
  function saveLocal() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, SS.serialize(project));
    } catch (e) {
      /* stockage indisponible : on ignore */
    }
  }
  function changed() {
    dirty = true;
    scheduleHistory();
    updateUndoButtons();
    // la durée de la chanson dépend des mesures / du tempo : on rafraîchit le panneau (sauf pendant un renommage)
    if (SS.song && !document.querySelector('.scene-rename')) SS.song.render();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, SS.serialize(project));
      } catch (e) {
        /* stockage indisponible : on ignore */
      }
    }, 400);
  }

  function loadAutosave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) return SS.normalizeProject(JSON.parse(raw));
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  /* ---------- Projet de démonstration ---------- */
  function demoProject() {
    const p = SS.newProject();
    p.title = 'Démo';
    p.tempo = 112;
    p.bars = 1;
    const add = (opts) => {
      const t = SS.newTrack(opts, p);
      p.tracks.push(t);
      return t;
    };
    const kick = add({ type: 'drum', name: 'Kick 1', color: '#e3179c', sound: 'bd', machine: 'RolandTR909' });
    [0, 4, 8, 12].forEach((s) => (kick.steps[s] = 0.9));
    const clap = add({ type: 'drum', name: 'Clap 1', color: '#f08a00', sound: 'cp', machine: 'RolandTR808' });
    [4, 12].forEach((s) => (clap.steps[s] = 0.8));
    const hat = add({ type: 'drum', name: 'Hi-Hat fermé 1', color: '#f5c400', sound: 'hh', machine: 'RolandTR808' });
    for (let s = 2; s < 16; s += 4) hat.steps[s] = 0.7;
    [0, 6, 10, 14].forEach((s) => (hat.steps[s] = 0.35));
    const bass = add({ type: 'instrument', name: 'Saw Bass', color: '#3fcf3f', category: 'mono', family: 'bass', instrument: 'syn_sawbass' });
    bass.events = [
      { step: 0, len: 2, notes: [33], vel: 0.9 },
      { step: 3, len: 1, notes: [45], vel: 0.6 },
      { step: 6, len: 2, notes: [36], vel: 0.8 },
      { step: 10, len: 1, notes: [31], vel: 0.8 },
      { step: 12, len: 3, notes: [33], vel: 0.9 },
    ];
    const pad = add({ type: 'instrument', name: 'Pad 2', color: '#1ea7ff', category: 'chord', family: 'pads', instrument: 'gm_pad_warm' });
    pad.volume = 0.55;
    pad.events = [
      { step: 0, len: 8, notes: SS.chordNotes(57, 'm7'), vel: 0.6, chord: 'm7' },
      { step: 8, len: 8, notes: SS.chordNotes(53, 'maj7'), vel: 0.6, chord: 'maj7' },
    ];
    pad.chord = 'm7';
    pad.sfv = Math.max(0, SS.findInstrument('pads', 'gm_pad_warm').files.indexOf('0890_FluidR3_GM_sf2_file'));
    return p;
  }

  /* ---------- Barre du haut ---------- */
  function syncHeader() {
    $('#title').value = project.title;
    $('#lcdTitle').textContent = project.title;
    $('#tempo').value = project.tempo;
    $('#sigNum').value = project.timeSig[0];
    $('#sigDen').value = project.timeSig[1];
    $('#bars').value = project.bars;
    SS.groove.updateButton();
    document.title = project.title + ' — StepSeq';
  }

  function setProject(p) {
    stop();
    project = p;
    SS.commitScene(p);
    SS.ui.clearSelection();
    state.openRolls = new Set();
    state.songStart = 0;
    syncHeader();
    SS.ui.renderAll();
    SS.song.render();
    SS.audio.applyAllFx(p);
    p.tracks.forEach((t) => SS.audio.prepareTrack(t));
    resetHistory(); // ouvrir ou créer un projet repart d'un historique vide
  }

  function initHeader() {
    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    const num = $('#sigNum');
    for (let i = 1; i <= 12; i++) num.append(new Option(String(i), String(i)));

    $('#title').addEventListener('input', (e) => {
      project.title = e.target.value;
      $('#lcdTitle').textContent = project.title;
      document.title = project.title + ' — StepSeq';
      changed();
    });
    $('#tempo').addEventListener('change', (e) => {
      project.tempo = Math.max(20, Math.min(300, Math.round(+e.target.value || 120)));
      e.target.value = project.tempo;
      SS.audio.applyAllFx(project); // le delay suit le tempo
      changed();
    });
    const onSig = () => {
      project.timeSig = [+num.value, +$('#sigDen').value];
      project.bars = +$('#bars').value;
      SS.resizeProject(project);
      SS.ui.renderAll();
      changed();
    };
    num.addEventListener('change', onSig);
    $('#sigDen').addEventListener('change', onSig);
    // Plus de mesures : les nouvelles reprennent le motif existant (avec possibilité de les vider)
    $('#bars').addEventListener('change', () => {
      const oldBars = project.bars;
      const newBars = +$('#bars').value;
      project.bars = newBars;
      SS.resizeProject(project);
      if (newBars > oldBars && project.tracks.length) {
        SS.repeatBars(project, oldBars);
        const what = oldBars === 1 ? 'La mesure 1 est recopiée' : `Les mesures 1 à ${oldBars} sont recopiées`;
        SS.ui.toast(`${what} jusqu'à la mesure ${newBars}.`, 6000, {
          label: 'Laisser vides',
          run: () => {
            SS.clearAfterBars(project, oldBars);
            SS.ui.renderAll();
            changed();
          },
        });
      }
      SS.ui.renderAll();
      changed();
    });

    $('#addTrack').addEventListener('click', addTrack);
    $('#emptyAdd').addEventListener('click', addTrack);
    $('#play').addEventListener('click', togglePlay);
    $('#stop').addEventListener('click', stop);

    $('#newProject').addEventListener('click', () => {
      if (project.tracks.length && !confirm('Créer un nouveau projet ? Les modifications non enregistrées seront perdues.')) return;
      SS.files.reset();
      setProject(SS.newProject());
      changed();
      dirty = false;
    });
    $('#openProject').addEventListener('click', openProject);
    $('#saveProject').addEventListener('click', (e) => saveProject(e.shiftKey));

    $('#editMode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state.editMode = b.dataset.mode;
      document.querySelectorAll('#editMode button').forEach((x) => x.classList.toggle('active', x === b));
      document.body.classList.toggle('mode-toggle', state.editMode === 'toggle');
      document.body.classList.toggle('mode-velocity', state.editMode === 'velocity');
    });
    document.body.classList.add('mode-toggle');
  }

  /* ---------- Transport ---------- */
  /** Bouton Lecture / Pause (et barre d'espace) */
  function togglePlay() {
    if (SS.audio.isPlaying()) pause();
    else if (SS.audio.isPaused()) resume();
    else play();
  }
  function pause() {
    SS.audio.pause();
    setPlayButton('paused');
  }
  function resume() {
    SS.audio.resume();
    setPlayButton('playing');
  }
  function setPlayButton(state) {
    const b = $('#play');
    b.classList.toggle('playing', state === 'playing');
    b.classList.toggle('paused', state === 'paused');
    b.title = state === 'playing' ? 'Pause (Espace)' : state === 'paused' ? 'Reprendre la lecture (Espace)' : 'Lecture (Espace)';
    b.setAttribute('aria-label', state === 'playing' ? 'Pause' : 'Lecture');
  }

  function play() {
    if (SS.audio.isPlaying()) return;
    if (SS.audio.isPaused()) SS.audio.stop(); // repartir du début
    const opts = {};
    if (project.playMode === 'song' && project.song.length) {
      opts.song = {
        index: Math.min(state.songStart, project.song.length - 1),
        // charge la scène du bloc juste avant de programmer son premier pas
        onBlock: (i) => {
          const b = project.song[i];
          if (b && b.scene !== project.current) switchScene(b.scene, { keepStart: true });
        },
        onBlockVisible: (i, rep) => SS.song.setPlaying(i, rep),
        onEnd: () => stop(),
      };
    }
    SS.audio.start(() => project, (step) => SS.ui.setPlayhead(step), opts);
    setPlayButton('playing');
  }
  function stop() {
    if (SS.audio.isPlaying() || SS.audio.isPaused()) SS.audio.stop();
    SS.ui.setPlayhead(-1);
    SS.song.setPlaying(-1);
    setPlayButton('stopped');
  }

  /* ---------- Scènes ---------- */
  function afterSceneChange() {
    SS.ui.clearSelection();
    syncHeader();
    SS.ui.renderAll();
    SS.song.render();
  }
  function switchScene(id) {
    if (id === project.current) return SS.song.render();
    SS.loadScene(project, id);
    afterSceneChange();
    persist();
  }
  /** Sauvegarde automatique sans marquer le projet comme modifié (changer de scène n'est pas une modification). */
  function persist() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, SS.serialize(project));
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------- Pistes ---------- */
  async function addTrack() {
    const opts = await SS.ui.openTrackDialog();
    if (!opts) return;
    const track = SS.newTrack(opts, project);
    project.tracks.push(track);
    if (track.type === 'instrument') state.openRolls.add(track.id);
    SS.ui.renderAll();
    SS.audio.prepareTrack(track);
    changed();
    requestAnimationFrame(() => {
      const el = document.querySelector(`.track[data-id="${track.id}"]`);
      el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  async function editTrack(track) {
    const opts = await SS.ui.openTrackDialog(track);
    if (!opts) return;
    track.name = opts.name;
    track.color = opts.color;
    if (opts.length > 0) track.length = opts.length;
    else delete track.length;
    if (track.type === 'drum') {
      Object.assign(track, { source: opts.source, sound: opts.sound, machine: opts.machine, bank: opts.bank, variant: opts.variant });
    } else {
      // un autre instrument repart de son propre preset de sound design
      if (opts.family !== track.family || opts.instrument !== track.instrument) delete track.sd;
      Object.assign(track, { category: opts.category, family: opts.family, instrument: opts.instrument, sfv: opts.sfv || 0 });
    }
    SS.ui.renderTrack(track);
    SS.audio.prepareTrack(track);
    changed();
  }

  function deleteTrack(track) {
    if (!confirm(`Supprimer la piste « ${track.name} » ?`)) return;
    project.tracks = project.tracks.filter((t) => t !== track);
    project.scenes.forEach((sc) => sc.data && delete sc.data[track.id]);
    state.openRolls.delete(track.id);
    SS.audio.removeTrack(track.id);
    SS.ui.renderAll();
    changed();
  }

  /* ---------- Fichiers ---------- */
  async function saveProject(saveAs) {
    try {
      const name = await SS.files.save(project, saveAs);
      if (name) {
        dirty = false;
        SS.ui.toast(`Projet enregistré : ${name}`);
      }
    } catch (e) {
      console.error(e);
      SS.ui.toast("Erreur lors de l'enregistrement.");
    }
  }

  async function openProject() {
    if (dirty && project.tracks.length && !confirm('Ouvrir un autre projet ? Les modifications non enregistrées seront perdues.')) return;
    try {
      const p = await SS.files.open();
      if (!p) return;
      setProject(p);
      changed();
      dirty = false;
      SS.ui.toast(`Projet « ${p.title} » ouvert.`);
    } catch (e) {
      console.error(e);
      SS.ui.toast("Ce fichier n'est pas un projet StepSeq valide.");
    }
  }

  /* ---------- Raccourcis clavier ---------- */
  function initKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject(e.shiftKey);
        return;
      }
      // Annuler / Rétablir : Ctrl+Z, Ctrl+Y ou Ctrl+Maj+Z (dans un champ texte, on laisse l'annulation du navigateur)
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const textField = (tag === 'INPUT' && ['text', 'number', 'search'].includes(e.target.type)) || tag === 'TEXTAREA';
      if (mod && !textField && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openProject();
        return;
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (dirty && project.tracks.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ---------- Démarrage ---------- */
  SS.audio.setErrorHandler((msg) => SS.ui.toast(msg));
  SS.soundDesign.init({ changed, renderTrack: (t) => SS.ui.renderTrack(t) });
  SS.groove.init({ project: () => project, changed });
  SS.mixer.init({ project: () => project, changed, renderAll: () => SS.ui.renderAll() });
  SS.song.init({ project: () => project, changed, state, switchScene, afterSceneChange, play, stop });
  SS.fx.init({ project: () => project, changed, renderTrack: (t) => SS.ui.renderTrack(t) });
  SS.ui.init({
    project: () => project,
    changed,
    state,
    editTrack,
    deleteTrack,
  });
  initHeader();
  initKeys();
  setProject(loadAutosave() || demoProject());
  // L'audio ne peut démarrer qu'après un geste de l'utilisateur : on précharge les sons à ce moment-là.
  const unlock = () => {
    SS.audio.ensureCtx();
    project.tracks.forEach((t) => SS.audio.prepareTrack(t));
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  dirty = false;
  // charge le catalogue de batterie dès le départ
  SS.audio.loadJSON(SS.SOURCES.tdm).catch(() =>
    SS.ui.toast('Bibliothèque de sons inaccessible : vérifiez votre connexion internet.', 5000)
  );
})();
