/*
 * Point d'entrée : état de l'application, barre d'outils, raccourcis, sauvegarde auto.
 */
(() => {
  const $ = (s) => document.querySelector(s);
  const AUTOSAVE_KEY = 'stepseq.autosave';

  let project;
  let dirty = false;
  const state = { openRolls: new Set(), songStart: 0, cue: 0 }; // cue : pas où démarre la lecture (clic sur la règle)

  /* ---------- Annuler / Rétablir ----------
   * On garde des instantanés du projet (JSON). Chaque modification enregistre l'état précédent ;
   * les modifications rapprochées (glisser un curseur, taper un titre) sont regroupées en une seule
   * étape grâce à un court délai.
   */
  const MAX_HISTORY = 100;
  const history = { past: [], future: [], present: null, timer: null };

  function snapshot() {
    return SS.serialize(project, { wizard: false }); // le brouillon de l'assistant a son propre enregistrement : Annuler ne le touche pas
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
    if (project.wizard) p.wizard = project.wizard; // Annuler / Rétablir ne concernent que les pistes
    const o = SS.audioWatch && SS.audioWatch.origin ? SS.audioWatch.origin(project) : null;
    noteOrigin(p, 'Annuler / Rétablir (copie de l\'historique)', { avant: o ? o.kind : 'inconnue' });
    project = p;
    SS.ui.clearSelection();
    syncHeader();
    SS.ui.renderAll();
    SS.song.render();
    SS.audio.applyAllFx(p);
    p.tracks.forEach((t) => SS.audio.prepareTrack(t));
    if (SS.freeze) SS.freeze.refresh(p);
    if (SS.load) SS.load.changed();
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
    markRetouched();
    syncStudio();
    syncMeta();
    if (SS.freeze) SS.freeze.refresh(project); // pistes figées : passages à réenregistrer
    if (SS.load) SS.load.changed(); // jauge CALCUL
    scheduleHistory();
    updateUndoButtons();
    // la durée de la chanson dépend des mesures / du tempo : on rafraîchit le panneau (sauf pendant un renommage)
    if (SS.song && !document.querySelector('.scene-rename')) SS.song.render();
    SS.autosave.schedule(); // bibliothèque « Mes chansons » et fichier lié, sans message (js/store.js)
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, SS.serialize(project));
      } catch (e) {
        /* stockage indisponible : on ignore */
      }
    }, 400);
  }

  /**
   * Brouillon de l'assistant (js/band.js) : rangé dans project.wizard et enregistré comme n'importe quelle modification
   * (stockage local, Mes chansons, fichier lié), mais sans toucher aux pistes ni à l'historique Annuler / Rétablir.
   * null : on efface le brouillon.
   */
  function setWizardDraft(d) {
    if (d) project.wizard = d;
    else delete project.wizard;
    syncView();
    dirty = true;
    SS.autosave.schedule();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveLocal, 400);
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
    const bass = add({ type: 'instrument', name: 'Saw Bass', color: '#3fcf3f', family: 'bass', instrument: 'syn_sawbass' });
    bass.events = [
      { step: 0, len: 2, notes: [33], vel: 0.9 },
      { step: 3, len: 1, notes: [45], vel: 0.6 },
      { step: 6, len: 2, notes: [36], vel: 0.8 },
      { step: 10, len: 1, notes: [31], vel: 0.8 },
      { step: 12, len: 3, notes: [33], vel: 0.9 },
    ];
    const pad = add({ type: 'instrument', name: 'Pad 2', color: '#1ea7ff', family: 'pads', instrument: 'gm_pad_warm' });
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
  /** Infobulle du bouton Mesure / groove : l'état, puisque le bouton n'a pas de texte. */
  function syncMeta() {
    const btn = $('#metaBtn');
    if (!btn) return;
    const gl = ($('#grooveLabel') || {}).textContent || '';
    const sig = $('#metaSig');
    if (sig) sig.textContent = `${project.timeSig[0]}/${project.timeSig[1]}`;
    btn.title = `${project.timeSig[0]}/${project.timeSig[1]} · ${project.bars} mesure${project.bars > 1 ? 's' : ''} · ${gl}`;
  }
  SS.syncMeta = () => syncMeta();
  /** Bulle Mesure / Mesures / Groove : ouverte au survol (CSS), au clic (toucher) ou au clavier ; Échap ou clic ailleurs la ferme. */
  function initMeta() {
    const wrap = $('#metaWrap');
    const btn = $('#metaBtn');
    if (!wrap || !btn) return;
    const set = (on) => {
      wrap.classList.toggle('open', on);
      btn.setAttribute('aria-expanded', String(on || wrap.matches(':hover')));
    };
    btn.addEventListener('click', () => set(!wrap.classList.contains('open')));
    wrap.addEventListener('mouseenter', () => btn.setAttribute('aria-expanded', 'true'));
    wrap.addEventListener('mouseleave', () => btn.setAttribute('aria-expanded', String(wrap.classList.contains('open'))));
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      set(false);
      btn.focus();
    });
    document.addEventListener('pointerdown', (e) => !wrap.contains(e.target) && set(false));
    $('#grooveBtn').addEventListener('click', () => set(false));
  }
  /** Barre du haut : le tempo de la scène en cours (doré quand la scène a son propre tempo, fiche Scène). */
  function syncTempo() {
    const sc = SS.currentScene(project);
    const own = !!(sc && sc.tempo);
    const el = $('#tempo');
    el.value = SS.tempoOf(project);
    el.classList.toggle('scene-tempo', own);
    el.title = own ? `Tempo propre à la scène « ${sc.name} » (chanson : ${project.tempo})` : 'Tempo de la chanson';
  }
  function syncHeader() {
    if (SS.live) SS.live.refresh(); // piste armée disparue (autre chanson, Annuler…) : oubliée
    $('#title').value = project.title;
    $('#lcdTitle').textContent = ''; // à l'arrêt, l'afficheur ne répète pas le titre (déjà à gauche)
    syncTempo();
    $('#sigNum').value = project.timeSig[0];
    $('#sigDen').value = project.timeSig[1];
    const barsSel = $('#bars');
    // Ancien projet avec un nombre de mesures hors liste (ex. 3) : on l'ajoute pour l'afficher
    [...barsSel.querySelectorAll('option[data-extra]')].forEach((o) => o.remove());
    if (![...barsSel.options].some((o) => +o.value === project.bars)) {
      const o = document.createElement('option');
      o.textContent = project.bars; o.dataset.extra = '1';
      const next = [...barsSel.options].find((x) => +x.value > project.bars);
      barsSel.insertBefore(o, next || null);
    }
    barsSel.value = project.bars;
    SS.groove.updateButton();
    SS.ui.updateKeyButton();
    syncStudio();
    syncMeta();
    syncView();
    document.title = project.title + ' — StepSeq';
  }

  /* ---------- Bascule Assistant | Grille (barre du haut) ----------
   * L'assistant est une « recette » rangée dans le projet (project.wizard) ; la grille, ce sont les pistes du projet.
   * Passer de l'un à l'autre ne crée ni n'efface rien : seul « Créer la chanson » (ou le bandeau) écrit les pistes. */
  function syncView() {
    const on = !!(SS.band && SS.band.active());
    const d = project && project.wizard;
    const late = !!(d && SS.wizDraft && SS.wizDraft.pending(d));
    $('#viewWiz').classList.toggle('active', on);
    $('#viewGrid').classList.toggle('active', !on);
    $('#viewWiz').setAttribute('aria-checked', String(on));
    $('#viewGrid').setAttribute('aria-checked', String(!on));
    $('#viewDot').hidden = !late;
    $('#viewWiz').title = late
      ? 'L’assistant « Nouvelle chanson » : il a des changements qui ne sont pas encore dans la grille'
      : d ? 'L’assistant « Nouvelle chanson », à l’étape où tu l’as laissé' : 'L’assistant « Nouvelle chanson », sur ce projet';
    const banner = $('#wizBanner');
    banner.hidden = on || !late;
    if (!banner.hidden)
      $('#wizBannerText').textContent = d.createdAt
        ? 'L’assistant a des changements qui ne sont pas encore dans la grille.'
        : 'La chanson de l’assistant n’est pas encore dans la grille : tu vois le projet tel qu’il était.';
  }
  /** Pistes de la grille retouchées à la main depuis la création par l'assistant : petit ✎ après leur nom (js/gridsync.js). */
  let markTimer = 0;
  function markRetouched() {
    clearTimeout(markTimer);
    markTimer = setTimeout(() => {
      if (!SS.gridSync) return;
      project.tracks.forEach((t) => {
        const b = document.querySelector(`.track[data-id="${t.id}"] .th-name b`);
        if (!b) return;
        const on = SS.gridSync.retouched(project, t);
        let m = b.querySelector('.th-retouch');
        if (on && !m) {
          m = document.createElement('span');
          m.className = 'th-retouch';
          m.textContent = '✎';
          m.title = 'Retouchée dans la grille : gardée si tu mets la grille à jour depuis l’assistant (tu pourras aussi la régénérer)';
          b.append(m);
        } else if (!on && m) m.remove();
      });
    }, 300);
  }
  function initViewSwitch() {
    new MutationObserver(markRetouched).observe($('#tracks'), { childList: true });
    const toWizard = () => {
      if (SS.band.active()) return;
      if (project.wizard) SS.band.resume();
      else SS.band.open();
    };
    $('#viewWiz').addEventListener('click', toWizard);
    $('#viewGrid').addEventListener('click', () => SS.band.active() && SS.band.close());
    $('#wizBannerBack').addEventListener('click', toWizard);
    // « Mettre la chanson dans la grille » = « Créer la chanson » de l'assistant (avec sa confirmation si le projet a des pistes)
    $('#wizBannerPut').addEventListener('click', () => {
      if (project.wizard && SS.band.resume()) SS.band.create();
    });
    // flèches gauche / droite dans le sélecteur (groupe radio)
    $('#viewSeg').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const b = e.key === 'ArrowLeft' ? $('#viewWiz') : $('#viewGrid');
      b.click();
      b.focus();
    });
  }

  /**
   * Sous-titre du bouton Song (celui de Tonalité vient de SS.ui.updateKeyButton) :
   * la scène en cours.
   */
  function syncStudio() {
    // Song : la scène en cours
    const sc = SS.currentScene(project);
    $('#songSub').textContent = sc ? sc.name : '—';
  }

  /** Origine d'une chanson pour le journal de débogage (js/audiowatch.js, section « Origine des projets »). */
  function noteOrigin(p, kind, detail, keep) {
    if (SS.audioWatch && SS.audioWatch.setOrigin) SS.audioWatch.setOrigin(p, { kind, detail, keep });
  }

  function setProject(p, origin) {
    stop();
    project = p;
    if (origin) noteOrigin(p, origin.kind, origin.detail);
    SS.commitScene(p);
    SS.ui.clearSelection();
    state.openRolls = new Set();
    state.songStart = 0;
    syncHeader();
    SS.ui.renderAll();
    SS.song.render();
    SS.audio.applyAllFx(p);
    p.tracks.forEach((t) => SS.audio.prepareTrack(t));
    if (SS.freeze) SS.freeze.refresh(p);
    if (SS.load) SS.load.changed();
    resetHistory(); // ouvrir ou créer un projet repart d'un historique vide
    if (SS.automixPanel) SS.automixPanel.songChanged();
  }

  function initHeader() {
    const trackHeight = $('#trackHeight');
    try { trackHeight.value = localStorage.getItem('stepseq.trackHeight') === 'compact' ? 'compact' : 'normal'; } catch (_) {}
    document.documentElement.classList.toggle('compact-tracks', trackHeight.value === 'compact');
    trackHeight.addEventListener('change', () => {
      document.querySelectorAll('.th-options:popover-open').forEach((menu) => menu.hidePopover());
      document.documentElement.classList.toggle('compact-tracks', trackHeight.value === 'compact');
      try { localStorage.setItem('stepseq.trackHeight', trackHeight.value); } catch (_) {}
    });
    // Son : filtre Juno allégé (à l'essai), réglage gardé par js/juno.js
    const junoLight = $('#optJunoLight');
    junoLight.checked = !!(SS.juno && SS.juno.isLightVcf && SS.juno.isLightVcf());
    junoLight.addEventListener('change', () => SS.juno.setLightVcf(junoLight.checked));
    // Son : écoute de l'assistant calculée à l'avance (js/band.js, ss.prerender : '1' oui, '0' non, absent = automatique)
    const prerender = $('#optPrerender');
    try { prerender.checked = localStorage.getItem('ss.prerender') === '1'; } catch (_) {}
    prerender.addEventListener('change', () => {
      try { localStorage.setItem('ss.prerender', prerender.checked ? '1' : '0'); } catch (_) {}
    });
    // contour pointillé de la case d'origine des notes décalées (affiché par défaut)
    const shiftHome = $('#optShiftHome');
    try { shiftHome.checked = localStorage.getItem('stepseq.shiftHome') !== '0'; } catch (_) {}
    document.documentElement.classList.toggle('hide-shift-home', !shiftHome.checked);
    shiftHome.addEventListener('change', () => {
      document.documentElement.classList.toggle('hide-shift-home', !shiftHome.checked);
      try { localStorage.setItem('stepseq.shiftHome', shiftHome.checked ? '1' : '0'); } catch (_) {}
    });
    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    const num = $('#sigNum');
    for (let i = 1; i <= 12; i++) num.append(new Option(String(i), String(i)));

    $('#title').addEventListener('input', (e) => {
      project.title = e.target.value;
      document.title = project.title + ' — StepSeq';
      changed();
    });
    $('#tempo').addEventListener('change', (e) => {
      if (SS.band.active()) return SS.band.setTempo(e.target.value); // assistant : le tempo de la chanson en création
      const v = Math.max(20, Math.min(300, Math.round(+e.target.value || 120)));
      const sc = SS.currentScene(project);
      if (sc && sc.tempo) sc.tempo = v; // la scène a son propre tempo : c'est lui qu'on règle
      else project.tempo = v;
      syncTempo();
      SS.audio.applyAllFx(project); // le delay suit le tempo
      changed();
    });
    const onSig = () => {
      project.timeSig = [+num.value, +$('#sigDen').value];
      project.bars = +$('#bars').value;
      SS.resizeProject(project);
      SS.ui.renderAll();
      syncMeta(); // « 4/4 » de la barre du haut
      changed();
    };
    num.addEventListener('change', onSig);
    $('#sigDen').addEventListener('change', onSig);
    // Plus de mesures : les nouvelles reprennent le motif existant (avec possibilité de les vider)
    $('#bars').addEventListener('change', () => setBars(+$('#bars').value));

    $('#emptyAdd').addEventListener('click', addTrack);
    // projet sans piste : le gros bouton « Nouvelle chanson » ouvre l'assistant sur ce projet (rien à perdre)
    $('#emptySong').addEventListener('click', () => SS.band.open());
    $('#play').addEventListener('click', togglePlay);
    $('#ruler').addEventListener('click', (e) => {
      const cell = e.target.closest('.grid [data-step]');
      if (cell) setCue(+cell.dataset.step);
    });
    $('#stop').addEventListener('click', () => (SS.band.active() ? SS.band.stopListen() : stop()));

    $('#newProject').addEventListener('click', async () => {
      // la chanson en cours est déjà dans « Mes chansons » : pas besoin de confirmation
      if (!SS.autosave.libraryAvailable() && project.tracks.length && !confirm('Créer un nouveau projet ? Les modifications non enregistrées seront perdues.')) return;
      await SS.autosave.saveNow();
      SS.files.reset();
      const fresh = SS.newProject();
      fresh.bars = 4; // nouvelle chanson : 4 mesures par défaut
      fresh.title = await inventTitle(); // un nom inventé (nom + adjectif) plutôt que « Nouveau projet »
      autoNamed = { id: fresh.id, title: fresh.title };
      SS.commitScene(fresh);
      await loadSong(fresh, { changed: true, origin: { kind: 'nouvelle chanson vide', detail: { via: 'menu « Nouvelle chanson… » (assistant ouvert ensuite)' } } });
      // assistant : modèle d'instruments → la chanson en scènes × pistes → mélodie → pistes à importer
      // (fermer l'assistant laisse la chanson vide)
      SS.band.openWizard();
    });
    $('#songsBtn').addEventListener('click', () => SS.mySongs.open());
    initAppMenu();
    initOptions();
    initExport();
    initViewSwitch();
    $('#openProject').addEventListener('click', openProject);
    $('#saveProject').addEventListener('click', (e) => saveProject(e.shiftKey));
  }

  /** Nombre de mesures de la scène en cours (sélecteur Mesures, ou tuile de la fenêtre Song). */
  function setBars(newBars) {
    const oldBars = project.bars;
    if (newBars === oldBars) return;
    project.bars = newBars;
    $('#bars').value = String(newBars);
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
  }

  /* ---------- Menu de l'icône de l'application (Nouvelle chanson, Mes chansons, Ouvrir, Enregistrer, Exporter, Options) ---------- */
  /**
   * « Exporter… » : une seule entrée pour l'audio (js/audioexport.js) et le MIDI (js/midipanel.js). Les deux fenêtres ont en haut
   * le même choix Audio | MIDI : changer de format passe d'une fenêtre à l'autre. Le dernier format choisi est retenu.
   */
  let exportFormat = 'audio';
  function openExport(fmt = exportFormat) {
    exportFormat = fmt;
    try { localStorage.setItem('stepseq.exportFormat', fmt); } catch (e) { /* stockage indisponible */ }
    if (fmt === 'midi') SS.midiPanel.openExport();
    else SS.audioExport.open();
    // le focus sur le choix du format (pas sur le « ? », dont la bulle cacherait ce choix)
    const dlg = $(fmt === 'midi' ? '#midiExportDialog' : '#audioExportDialog');
    if (dlg.open) dlg.querySelector('.ex-fmt .active').focus();
  }
  function initExport() {
    try { if (localStorage.getItem('stepseq.exportFormat') === 'midi') exportFormat = 'midi'; } catch (e) { /* stockage indisponible */ }
    $('#exportBtn').addEventListener('click', () => openExport());
    document.querySelectorAll('.ex-fmt').forEach((seg) =>
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-f]');
        const dlg = seg.closest('dialog');
        if (!b || b.classList.contains('active')) return;
        if (dlg.id === 'audioExportDialog' && $('#axGo').hidden) return; // calcul audio en cours : on reste
        dlg.close();
        openExport(b.dataset.f);
      }));
  }
  /** Fenêtre Options (menu principal → Options…) : onglets en haut, un panneau par onglet. */
  function initOptions() {
    const dlg = $('#optionsDialog');
    const tabs = [...dlg.querySelectorAll('.opt-tab')];
    const show = (name) => {
      tabs.forEach((t) => {
        const on = t.dataset.tab === name;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      dlg.querySelectorAll('.opt-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    };
    tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
    dlg.querySelector('.opt-tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = tabs.indexOf(document.activeElement);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      show(next.dataset.tab);
      next.focus();
    });
    dlg.addEventListener('keydown', (e) => e.stopPropagation()); // pas de raccourcis du séquenceur derrière la fenêtre
    show(tabs[0].dataset.tab);
    $('#optionsBtn').addEventListener('click', () => dlg.showModal());
  }
  function initAppMenu() {
    const btn = $('#appMenuBtn');
    const menu = $('#appMenu');
    const items = () => [...menu.querySelectorAll('[role=menuitem]')].filter((b) => !b.hidden);
    const setOpen = (open, focusFirst) => {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open && focusFirst) items()[0].focus();
    };
    btn.addEventListener('click', () => setOpen(menu.hidden, false));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true, true);
      }
    });
    // un choix ferme le menu (l'action de l'élément s'exécute ensuite par son propre écouteur)
    menu.addEventListener('click', (e) => {
      if (e.target.closest('[role=menuitem]')) setOpen(false);
    });
    menu.addEventListener('keydown', (e) => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btn.focus();
      } else if (e.key === 'Tab') setOpen(false);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !e.target.closest('.app-menu-wrap')) setOpen(false);
    });
  }

  /**
   * L'assistant « Nouvelle chanson » prend / rend la place de la zone des pistes (body.wizard-mode).
   * Pendant qu'il est ouvert, Lecture, Stop, tempo et position de la barre du haut lui appartiennent (js/band.js) ;
   * à la sortie, la barre redevient celle du projet.
   */
  function wizardMode(on) {
    stop(); // le projet ne joue pas derrière l'assistant ; à la sortie, la barre repart de zéro
    syncView();
    if (on) return SS.live && SS.live.setOn(false); // pas de mode Jouer dans l'assistant (pas de piste à armer)
    const play = $('#play');
    play.removeAttribute('aria-pressed');
    $('#stop').disabled = false;
    syncHeader();
  }

  /* ---------- Transport ---------- */
  /** Bouton Lecture / Pause (et barre d'espace) */
  function togglePlay() {
    if (SS.band.active()) return SS.band.togglePlay(); // assistant : Lecture écoute la scène choisie ou la chanson en création
    if (SS.trackLoop && SS.trackLoop.active()) return play(); // la boucle d'une piste seule laisse la place au morceau
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
  // lecture en attente des sons : le bouton le montre (et Espace / clic annule comme une pause)
  SS.audio.setOnLoading((on) => {
    const b = $('#play');
    b.classList.toggle('loading', on);
    if (on) b.title = 'Chargement des sons… la lecture démarre dès qu’ils sont prêts';
    else setPlayButton(SS.audio.isPlaying() ? 'playing' : SS.audio.isPaused() ? 'paused' : 'stopped');
  });
  function setPlayButton(state) {
    const b = $('#play');
    b.classList.toggle('playing', state === 'playing');
    b.classList.toggle('paused', state === 'paused');
    b.title = state === 'playing' ? 'Pause (Espace)' : state === 'paused' ? 'Reprendre la lecture (Espace)' : 'Lecture (Espace)';
    b.setAttribute('aria-label', state === 'playing' ? 'Pause' : 'Lecture');
  }

  /**
   * Clic sur la règle des mesures : place le curseur de lecture sur ce pas.
   * Arrêté : la prochaine lecture partira de là. En pause : la reprise partira de là. En lecture : saut immédiat.
   */
  function setCue(step) {
    const total = SS.totalSteps(project);
    step = Math.max(0, Math.min(total - 1, step));
    state.cue = step;
    if (SS.audio.isPlaying() || SS.audio.isPaused()) SS.audio.seek(step);
    SS.ui.setPlayhead(step);
  }

  /** extra (enregistrement au clavier, js/live.js) : { loop: scène en boucle même en mode Song, preroll: pas de décompte } */
  function play(extra = {}) {
    if (SS.trackLoop && SS.trackLoop.active()) SS.trackLoop.stop(); // une piste écoutée seule en boucle laisse la place au morceau
    if (SS.audio.isPlaying()) return;
    if (SS.audio.isPaused()) SS.audio.stop(); // repartir du curseur
    const opts = { from: Math.min(state.cue, SS.totalSteps(project) - 1), preroll: extra.preroll || 0 };
    if (!extra.loop && project.playMode === 'song' && project.song.length) {
      opts.song = {
        index: Math.min(state.songStart, project.song.length - 1),
        // charge la scène du bloc juste avant de programmer son premier pas
        // le son a besoin des notes de la scène tout de suite ; l'affichage suit juste après (voir sceneUiSoon)
        onBlock: (i) => {
          const b = project.song[i];
          if (b && b.scene !== project.current) {
            SS.loadScene(project, b.scene);
            sceneUiSoon();
          }
        },
        onBlockVisible: (i, rep) => SS.song.setPlaying(i, rep),
        onEnd: () => stop(),
      };
    }
    SS.audio.start(() => project, (step) => {
      SS.ui.setPlayhead(step);
      SS.song.setStep(step);
    }, opts);
    setPlayButton('playing');
  }
  function stop() {
    if (SS.audio.isPlaying() || SS.audio.isPaused()) SS.audio.stop();
    state.cue = 0; // Stop ramène le curseur au début
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
  /*
   * Changement de scène pendant la lecture (mode chanson) : l'affichage est mis à jour hors de la programmation
   * des notes, juste après elle. Reconstruire la page peut prendre du temps (piano roll ouvert) : fait pendant
   * la programmation, cela retardait les premières notes du bloc (le kick du premier temps « sautait »).
   */
  let sceneUiTimer = null;
  function sceneUiSoon() {
    if (sceneUiTimer) return;
    sceneUiTimer = setTimeout(() => {
      sceneUiTimer = null;
      SS.ui.clearSelection();
      syncHeader();
      SS.ui.refreshScene();
      SS.song.render();
      persist();
    }, 0);
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
    // effets suggérés par le preset du synthé (chorus, écho, reverb), modifiables ensuite dans Effets
    const fx = track.type === 'instrument' && !track.fx && SS.presetFx(track.family, track.instrument);
    if (fx) track.fx = fx;
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

  /** Fenêtre Band : crée d'un coup les pistes du groupe (vierges de notes). */
  /** Pistes créées par la fenêtre Band (marquées track.band). */
  const bandTracks = () => project.tracks.filter((t) => t.band);
  /** Une piste a-t-elle des notes, dans la scène en cours ou une autre ? */
  function hasNotes(t) {
    const filled = (d) => !!d && ((Array.isArray(d.steps) && d.steps.some((v) => v > 0)) || (Array.isArray(d.events) && d.events.length > 0));
    return filled(t) || project.scenes.some((sc) => sc.data && filled(sc.data[t.id]));
  }
  /** Retire des pistes (et leurs notes dans toutes les scènes). Renvoie les ids retirés. */
  function removeTracks(list) {
    const ids = new Set(list.map((t) => t.id));
    project.tracks = project.tracks.filter((t) => !ids.has(t.id));
    project.scenes.forEach((sc) => sc.data && ids.forEach((id) => delete sc.data[id]));
    ids.forEach((id) => {
      state.openRolls.delete(id);
      SS.audio.removeTrack(id);
    });
    return ids;
  }

  /**
   * Band : « Créer toute la chanson ». Remplace les pistes, les scènes et l'arrangement du projet par la chanson
   * écrite d'après le plan de l'inspiration (js/band-songs.js, js/bandsong.js). Ctrl+Z revient en arrière.
   */
  function addBandSong(list, preset, tempo, { melodySeed = 0, melody = null, harmony = null, parts = null, kinds = null, gains = null, mix = null, groove = null, fx = null, bauto = null, keep = null, lock = null, only = null, drop = null, restore = null, sig = '4/4' } = {}) {
    // preset.spec : plan d'une reprise tapée dans l'assistant (porte « Reprendre »), jouée à la façon de l'inspiration
    const spec = preset.spec || (SS.BandSongs && SS.BandSongs[preset.id]);
    if (!spec) return addBandTracks(list, tempo, { replace: true });
    stop();
    // mise à jour depuis l'assistant (keep : colonnes des pistes retouchées à garder) : ces pistes et celles ajoutées à
    // la main restent telles quelles, avec leurs notes ; les autres sont régénérées (js/gridsync.js)
    // lock : pistes verrouillées dans l'assistant ([{ id, key }] : gardées telles quelles, transposées si key) ; drop : pistes
    // ajoutées à la main que l'assistant joue maintenant (elles ne sont pas gardées) ; restore : volume, mix et effets d'une
    // piste dont on garde le son (« Garder le son, refaire les notes »), par index dans list
    const kept = new Map();
    const hand = [];
    const locks = new Map((lock || []).map((l) => [l.id, l]));
    const dropped = new Set(drop || []);
    let oldScenes = [];
    if (keep || locks.size) {
      SS.commitScene(project);
      oldScenes = project.scenes;
      const cols = new Set(list.map((o) => o.band && o.band.col).filter(Boolean));
      project.tracks.forEach((t) => {
        if (locks.has(t.id)) hand.push(t); // verrouillée : à côté des pistes régénérées (qui ne jouent que ses scènes déverrouillées)
        else if (!keep) return;
        else if (!t.band) !dropped.has(t.id) && hand.push(t);
        else if (t.band.col && keep.includes(t.band.col)) (cols.has(t.band.col) ? kept.set(t.band.col, t) : hand.push(t));
      });
    }
    const stay = new Set([...kept.values(), ...hand]);
    removeTracks(project.tracks.filter((t) => !stay.has(t)));
    if (tempo) project.tempo = tempo;
    project.timeSig = (SS.bandSong.METERS[sig] ? sig : '4/4').split('/').map(Number); // mesure choisie à l'étape Tempo
    const levelKeys = new Map();
    const created = list.map((opts) => {
      const t = SS.newTrack(opts, project);
      if (opts.band) t.band = { ...opts.band };
      levelKeys.set(t.id, opts.levelKey);
      return t;
    });
    project.tracks = created;
    const res = SS.bandSong.build(spec, preset.id, created, { melodySeed, melody, harmony, parts, kinds, fx, sig });
    project.scenes = res.scenes.map(({ spans, ...sc }) => sc); // eslint-disable-line no-unused-vars -- sec : la section de l'assistant (relue par l'assistant)
    project.song = res.song;
    // mouvements de son gardés à l'étape Arrangement : automation par temps (js/beatauto.js), colonne → piste créée
    if (bauto && SS.beatAuto) SS.beatAuto.applyPlan(project, bauto, (i) => created[i] && !kept.has(created[i].band && created[i].band.col) && created[i].id);
    project.playMode = 'song';
    project.songLoop = false;
    state.songStart = 0;
    state.cue = 0;
    // mixage et mastering automatiques (js/bandmix.js) : niveaux calibrés, EQ, compression, panoramique,
    // bus d'effets partagés, sidechain, caisse claire « posée » ; puis petite humanisation de tout le groupe
    const style = (created.find((t) => t.band) || { band: {} }).band.style || 'synthwave';
    SS.bandMix.mixTracks(created, levelKeys, style);
    // volumes réglés dans l'assistant (étape Mélodie) : en plus ou en moins du mixage automatique
    if (gains) created.forEach((t, i) => gains[i] != null && gains[i] !== 1 && (t.volume = Math.round((typeof t.volume === 'number' ? t.volume : 0.8) * gains[i] * 1000) / 1000));
    SS.bandMix.mixMaster(project, style, SS.bandMix.driveFor(preset.id, style));
    // étape Mix de l'assistant (js/wizmix.js) : sans retouche (mix absent ou égal à sa base), rien ne change
    if (mix && SS.wizMix) SS.wizMix.apply(project, mix, res.scenes);
    // « Garder le son, refaire les notes » : la piste régénérée reprend le volume, le mix et les effets de l'ancienne
    if (restore)
      restore.forEach((r) => {
        const t = r && created[r.i];
        if (!t) return;
        ['volume', 'mix', 'fx'].forEach((k) => r[k] !== undefined && (t[k] = JSON.parse(JSON.stringify(r[k]))));
      });
    project.groove = { ...(project.groove || { res: 0, swing: 0.5 }), ...(groove || { human: 0.15 }) }; // groove : swing et humanisation réglés à l'étape Batterie
    if (preset.cover) project.title = preset.cover.title;
    else if (!project.title || project.title === 'Nouveau projet') project.title = `Dans l'esprit de ${preset.song}`;
    noteOrigin(project, 'assistant « Nouvelle chanson » : Créer la chanson', { style, inspiration: `${preset.id} (« ${preset.song} »${preset.artist ? ', ' + preset.artist : ''})`, reprise: preset.cover ? preset.cover.title : null, pistes: created.length, graineMelodie: melodySeed }, true);
    if (keep || locks.size) keepTracks(created, kept, hand, oldScenes, locks);
    // pistes d'un musicien verrouillé qui ne jouent que ses scènes déverrouillées : marquées part (elles ne sont pas « ses » pistes)
    (only || []).forEach((o) => created.forEach((t) => t.band && t.band.col === o.col && (t.band.part = true)));
    // scènes déverrouillées (sc.sec) : la piste verrouillée s'y tait, le musicien de l'assistant n'y joue que là (only)
    const empty = (d, bars) => ({ ...(Array.isArray(d.steps) ? { steps: new Array(bars * 16).fill(0) } : {}), ...(Array.isArray(d.events) ? { events: [] } : {}) });
    project.scenes.forEach((sc) => {
      locks.forEach((l, id) => (l.free || []).includes(sc.sec) && sc.data && sc.data[id] && (sc.data[id] = empty(sc.data[id], sc.bars)));
      (only || []).forEach((o) => created.forEach((t) => t.band && t.band.col === o.col && !o.secs.includes(sc.sec) && sc.data && sc.data[t.id] && (sc.data[t.id] = empty(sc.data[t.id], sc.bars))));
    });
    SS.loadScene(project, project.scenes[0].id, { commit: false });
    // empreinte de chaque piste créée : la grille saura lesquelles on retouche (js/gridsync.js) ; les pistes gardées gardent la leur
    if (SS.gridSync) project.tracks.forEach((t) => t.band && t.band.col && !stay.has(t) && SS.gridSync.stamp(project, t));
    state.openRolls.clear();
    SS.audio.applyAllFx(project);
    syncHeader();
    SS.ui.clearSelection();
    SS.ui.renderAll();
    SS.song.render();
    project.tracks.forEach((t) => SS.audio.prepareTrack(t));
    changed();
    const len = SS.songLength(project);
    const time = `${Math.floor(len.seconds / 60)}:${String(Math.round(len.seconds % 60)).padStart(2, '0')}`;
    const what = preset.cover ? `reprise « ${preset.cover.title} » créée, jouée à la façon de « ${preset.song} »` : `chanson créée dans l'esprit de « ${preset.song} » (${preset.artist})`;
    SS.ui.toast(`Band : ${what} · ${project.scenes.length} scènes, ${len.bars} mesures, ${time} · ${created.length} pistes. Mode Chanson : appuie sur ▶.`, 7000);
  }

  /**
   * Mise à jour de la grille depuis l'assistant : les pistes gardées prennent la place de leur version régénérée (même
   * colonne), les pistes ajoutées à la main suivent ; leurs notes passent des anciennes scènes aux nouvelles (même nom,
   * sinon même position). Les sidechains qui visaient une piste remplacée visent la piste gardée.
   */
  function keepTracks(created, kept, hand, oldScenes, locks = new Map()) {
    const match = SS.gridSync.matchScenes(oldScenes, project.scenes);
    const moveData = (newId, old) =>
      project.scenes.forEach((sc) => {
        sc.data = sc.data || {};
        if (newId) delete sc.data[newId];
        const os = match.get(sc.id);
        const d = os && os.data && os.data[old.id];
        if (!d) return;
        const l = locks.get(old.id);
        // piste verrouillée qui suit la tonalité : ses notes passent de la tonalité de l'ancienne scène à celle de la nouvelle
        sc.data[old.id] = l && l.key ? SS.gridSync.transposeData(d, os.key, sc.key) : JSON.parse(JSON.stringify(d));
      });
    const swap = new Map();
    const tracks = created.map((t) => {
      const old = kept.get(t.band && t.band.col);
      if (!old) return t;
      swap.set(t.id, old.id);
      SS.audio.removeTrack(t.id);
      moveData(t.id, old);
      return old;
    });
    hand.forEach((t) => moveData(null, t));
    project.tracks = [...tracks, ...hand];
    project.tracks.forEach((t) => t.fx && swap.has(t.fx.scSource) && (t.fx.scSource = swap.get(t.fx.scSource)));
    const ids = new Set(project.tracks.map((t) => t.id));
    project.tracks.forEach((t) => t.fx && t.fx.scSource && !ids.has(t.fx.scSource) && delete t.fx.scSource);
  }

  function addBandTracks(list, tempo, { replace = false } = {}) {
    noteOrigin(project, replace ? 'assistant : pistes du groupe remplacées' : 'assistant : pistes du groupe ajoutées', { pistes: list.length }, true);
    let removed = [];
    if (replace) {
      removed = bandTracks();
      removeTracks(removed);
    }
    if (tempo) {
      project.tempo = tempo;
      $('#tempo').value = tempo;
      SS.audio.applyAllFx(project);
    }
    const levelKeys = new Map();
    const created = list.map((opts) => {
      const t = SS.newTrack(opts, project);
      if (opts.band) t.band = { ...opts.band };
      levelKeys.set(t.id, opts.levelKey);
      project.tracks.push(t);
      return t;
    });
    // niveaux calibrés, EQ, compression, panoramique et envois d'effets selon le rôle de chaque musicien
    SS.bandMix.mixTracks(created, levelKeys, (created.find((t) => t.band) || { band: {} }).band.style || 'synthwave');
    // un sidechain qui écoutait une piste remplacée suit la nouvelle piste du même rôle (le kick…), sinon il est coupé
    if (removed.length) {
      const byKey = new Map(created.map((t) => [t.band && t.band.key, t.id]));
      const oldKey = new Map(removed.map((t) => [t.id, t.band.key]));
      project.tracks.forEach((t) => {
        if (!t.fx || !oldKey.has(t.fx.scSource)) return;
        const to = byKey.get(oldKey.get(t.fx.scSource));
        if (to) t.fx.scSource = to;
        else delete t.fx.scSource;
      });
      SS.audio.applyAllFx(project);
    }
    SS.ui.renderAll();
    created.forEach((t) => SS.audio.prepareTrack(t));
    changed();
    const pl = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
    SS.ui.toast(
      `Band : ${pl(created.length, 'piste')} ${created.length > 1 ? 'créées' : 'créée'}` +
        (removed.length ? `, ${pl(removed.length, 'ancienne piste')} Band ${removed.length > 1 ? 'remplacées' : 'remplacée'}` : '') +
        (tempo ? ` · tempo ${tempo} BPM` : '') +
        '.'
    );
    requestAnimationFrame(() => {
      const el = created[0] && document.querySelector(`.track[data-id="${created[0].id}"]`);
      el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  /**
   * Atelier Mélodie (étape Mélodie de l'assistant) : écrit une mélodie (js/melody.js) sur une piste Mono de la scène en cours, ou sur une nouvelle
   * piste « Mélodie ». La scène est allongée si la mélodie est plus longue (les autres pistes sont recopiées en boucle).
   */
  function writeMelody({ trackId, newTrack, events, bars, melodyBars, label }) {
    let t = trackId && project.tracks.find((x) => x.id === trackId);
    let created = false;
    if (!t) {
      if (!newTrack) return;
      const { levelKey, style, role, ...opts } = newTrack; // eslint-disable-line no-unused-vars
      t = SS.newTrack(opts, project);
      t.melody = true;
      project.tracks.push(t);
      created = true;
      // mixage du rôle « lead » (ou « vox ») de Band : niveau calibré, EQ, envois ; la piste n'est pas marquée Band
      // (« Remplacer les pistes Band » ne la supprime donc pas)
      t.band = { key: newTrack.role || 'lead' };
      SS.bandMix.mixTracks([t], new Map([[t.id, levelKey]]), style || 'synthwave');
      delete t.band;
    }
    const oldBars = project.bars;
    if (bars > oldBars) {
      project.bars = bars;
      $('#bars').value = String(bars);
      SS.resizeProject(project);
      SS.repeatBars(project, oldBars);
    }
    const total = SS.totalSteps(project);
    t.events = events.filter((e) => e.step < total).map((e) => ({ ...e, notes: [...e.notes], len: Math.min(e.len, total - e.step) }));
    // la mélodie n'est pas recopiée au-delà de sa longueur
    state.openRolls.add(t.id);
    SS.ui.renderAll();
    if (created) SS.audio.prepareTrack(t);
    changed();
    SS.ui.toast(
      `Mélodie écrite sur « ${t.name} » (${label}, ${melodyBars} mesure${melodyBars > 1 ? 's' : ''})` + (bars > oldBars ? ` · scène allongée à ${bars} mesures` : '') + '. Ctrl+Z pour revenir.',
      6000
    );
    requestAnimationFrame(() => {
      const el = document.querySelector(`.track[data-id="${t.id}"]`);
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
    } else if (opts.type === 'synth') {
      // un autre patch remplace les réglages du panneau
      if (opts.patch !== track.junoPatch || opts.analog !== track.instrument) delete track.juno;
      Object.assign(track, { instrument: opts.analog, junoPatch: opts.patch });
    } else {
      // un autre instrument repart de son propre preset de sound design ; le jeu (expression, phrasé) le suit
      const changedInst = opts.family !== track.family || opts.instrument !== track.instrument;
      const prev = track.sd || {};
      if (changedInst) delete track.sd;
      Object.assign(track, { family: opts.family, instrument: opts.instrument, sfv: opts.sfv || 0 });
      // nouvel instrument sur une piste sans effets : ceux que suggère son preset
      if (changedInst && !SS.fxActive(track)) {
        const fx = SS.presetFx(track.family, track.instrument);
        if (fx) track.fx = fx;
      }
      if (changedInst) {
        if (prev.expr && SS.exprFamily(track)) track.sd = { expr: prev.expr, ...(prev.phrase === 0 ? { phrase: 0 } : {}), ...(prev.pedal === 0 ? { pedal: 0 } : {}) };
        else SS.applyExprDefault(track);
      }
    }
    if (track.type === 'instrument') {
      // interrupteurs ARP / ACCORDS de la fenêtre (les réglages d'accords sont gardés)
      if (opts.arpOn) track.arpOn = true;
      else delete track.arpOn;
      if (opts.follow && !track.follow) {
        track.follow = SS.FOLLOW.clean(track.lastFollow || true);
        delete track.lastFollow;
      } else if (!opts.follow && track.follow) {
        track.lastFollow = track.follow;
        delete track.follow;
      }
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
        // Chrome / Edge : ce fichier sera ensuite mis à jour automatiquement à chaque modification
        const handle = SS.files.current();
        if (handle) await SS.autosave.linkFile(handle);
        SS.ui.toast(handle ? `Projet enregistré : ${name} — mis à jour automatiquement ensuite.` : `Projet enregistré : ${name}`);
      }
    } catch (e) {
      console.error(e);
      SS.ui.toast("Erreur lors de l'enregistrement.");
    }
  }

  async function openProject() {
    if (!SS.autosave.libraryAvailable() && dirty && project.tracks.length && !confirm('Ouvrir un autre projet ? Les modifications non enregistrées seront perdues.')) return;
    try {
      await SS.autosave.saveNow();
      const p = await SS.files.open();
      if (!p) return;
      if (p.midi) return SS.midiPanel.openWith(p.midi.name, p.midi.buf); // fichier MIDI : la fenêtre « Importer MIDI »
      const handle = SS.files.current();
      // la même chanson déjà dans la bibliothèque : son état actuel reste dans ses versions
      if (SS.autosave.libraryAvailable()) await SS.store.keepVersion(p.id).catch(() => {});
      await loadSong(p, { changed: true, handle, origin: { kind: 'fichier ouvert', detail: { fichier: handle && handle.name, titre: p.title } } });
      SS.ui.toast(`Projet « ${p.title} » ouvert.`);
    } catch (e) {
      console.error(e);
      SS.ui.toast("Ce fichier n'est pas un projet StepSeq valide.");
    }
  }

  /** Charge une chanson (Nouveau, Ouvrir, Mes chansons) et la range tout de suite dans la bibliothèque. */
  async function loadSong(p, { changed: mark = false, handle = null, origin = null } = {}) {
    const prev = project;
    // quittée vide et jamais renommée : elle ne reste pas dans « Mes chansons »
    const untouched = prev && (prev.title === 'Nouveau projet' || (autoNamed && autoNamed.id === prev.id && autoNamed.title === prev.title));
    const dropPrev = untouched && prev.id !== p.id && isEmptySong(prev) && !SS.autosave.fileName();
    setProject(p, origin || { kind: 'chargée (origine non précisée)' });
    if (mark) changed();
    else persist(); // c'est la chanson qu'on retrouvera au prochain démarrage
    dirty = false;
    if (handle) await SS.autosave.linkFile(handle);
    await SS.autosave.songChanged();
    if (dropPrev && SS.autosave.libraryAvailable()) await SS.store.remove(prev.id).catch(() => {});
    resumeWizardIfOnly();
  }

  let autoNamed = null; // { id, title } : le nom inventé de la dernière nouvelle chanson
  /** Chanson vide : ni piste, ni travail de l'assistant (elle peut être supprimée sans rien perdre). */
  function isEmptySong(p) {
    return !(p.tracks || []).length && !p.wizard;
  }
  /** Chanson qui n'existe que dans l'assistant (pas de piste, un brouillon) : elle s'ouvre dans l'assistant. */
  function resumeWizardIfOnly() {
    if (project.tracks.length || !project.wizard || SS.band.active()) return;
    SS.band.resume();
  }
  /** Nom inventé pour une nouvelle chanson, différent des titres déjà dans « Mes chansons ». */
  async function inventTitle() {
    let taken = [];
    try {
      if (SS.autosave.libraryAvailable()) taken = (await SS.store.list()).map((s) => s.title);
    } catch (e) {
      /* bibliothèque indisponible : un nom au hasard */
    }
    return SS.songName.invent(taken);
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
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e' && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        openExport();
        return;
      }
      // sélection : Ctrl+C / X / V / D / A, Suppr, Échap
      if (SS.ui.handleKey(e)) return;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      // avec la bibliothèque, rien ne se perd : pas d'avertissement en quittant
      if (!SS.autosave.libraryAvailable() && dirty && project.tracks.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ---------- Démarrage ---------- */
  SS.audio.setErrorHandler((msg) => SS.ui.toast(msg));
  SS.soundDesign.init({ project: () => project, changed, renderTrack: (t) => SS.ui.renderTrack(t) });
  SS.junoPanel.init({ changed, renderTrack: (t) => SS.ui.renderTrack(t) });
  SS.live.init({ project: () => project, changed, play });
  SS.arpPanel.init({ project: () => project, changed, renderTrack: (t) => SS.ui.renderTrack(t) });
  SS.groove.init({ project: () => project, changed });
  initMeta();
  $('#keyBtn').addEventListener('click', (e) => SS.ui.openKeyPicker(null, e.currentTarget));
  SS.mixer.init({ project: () => project, changed, renderAll: () => SS.ui.renderAll() });
  // un module optionnel qui ne démarre pas (page en cache d'une version précédente…) ne doit pas bloquer l'application
  try {
    SS.automixPanel.init({ project: () => project, changed, play, stop });
  } catch (e) {
    console.warn('Auto Mix indisponible :', e);
  }
  SS.systemPanel.init({
    project: () => project,
    // avant un rechargement (changement de latence) : sauvegarde locale et bibliothèque
    save: async () => {
      clearTimeout(autosaveTimer);
      saveLocal();
      await SS.autosave.saveNow();
    },
  });
  SS.audioWatch.start({ project: () => project }); // surveillance audio automatique (grésillements, coupures)
  SS.song.init({ project: () => project, changed, state, switchScene, afterSceneChange, play, stop, setBars });
  SS.sceneSheet.init({ project: () => project, changed, switchScene, syncTempo });
  SS.fx.init({ project: () => project, changed, renderTrack: (t) => SS.ui.renderTrack(t) });
  SS.ui.init({
    project: () => project,
    changed,
    state,
    editTrack,
    deleteTrack,
  });
  SS.load.init({ project: () => project });
  SS.freeze.init({ project: () => project, changed, renderTrack: (t) => SS.ui.renderTrack(t), toast: (m, ms) => SS.ui.toast(m, ms) });
  // window.StepSeq : boîte à outils pour Claude (extension Claude in Chrome, plus tard le panneau intégré), js/claude-tools.js
  SS.claudeTools.init({ project: () => project, changed, commit: recordHistory, switchScene, afterSceneChange, setBars, play, stop, undo, redo });
  SS.band.init({ project: () => project, changed, setWizardDraft, toast: (m) => SS.ui.toast(m), wizardMode, openTrackDialog: (t, init) => SS.ui.openTrackDialog(t, init), apply: addBandTracks, applySong: addBandSong, bandTracks, hasNotes, writeMelody, loadSong });
  SS.mySongs.init({ project: () => project, loadSong, flush: () => SS.autosave.saveNow() });
  SS.midiPanel.init({ project: () => project, loadSong: (p, opts) => loadSong(p, { changed: true, ...(opts || {}) }), flush: () => SS.autosave.saveNow() });
  SS.audioExport.init({ project: () => project, stop });
  initHeader();
  initKeys();
  {
    const saved = loadAutosave();
    setProject(saved || demoProject(), saved ? { kind: 'démarrage : dernière chanson (sauvegarde locale)', detail: { titre: saved.title } } : { kind: 'démarrage : projet de démonstration (aucune sauvegarde locale)' });
  }
  SS.autosave.init({ project: () => project, openLibrary: () => SS.mySongs.open() }).then(() => SS.autosave.songChanged());
  resumeWizardIfOnly(); // dernière chanson ouverte, seulement dans l'assistant : on la retrouve dans l'assistant
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
