/*
 * Console Live : jouer les réglages pendant la lecture (cutoff, résonance, enveloppe, decay, filtre DJ, envois, volume)
 * et, si on le veut, enregistrer les gestes dans l'automation par temps de la chanson (js/beatauto.js).
 *
 * Partie sans DOM (l'interface est dans js/liveconsolepanel.js) :
 *  - touch / move / release : un geste sur un réglage. La valeur tenue passe par SS.beatAuto.setLive et remplace la
 *    courbe à la lecture tant qu'elle est tenue ;
 *  - sans enregistrement, le réglage reste où on l'a laissé jusqu'à l'arrêt (ou un double-clic) ;
 *  - en enregistrement, mode « Au toucher » : le geste s'écrit tant qu'on le tient, puis la courbe reprend ;
 *    mode « Verrou » : la dernière valeur continue de s'écrire jusqu'à la fin de la prise ;
 *  - onStep : appelé par le moteur audio à chaque pas programmé (js/audio.js, scheduleAuto) ; écrit la valeur tenue
 *    dans le temps du passage joué (bloc et répétition de la chanson, ou passage choisi pour la boucle de la scène) ;
 *  - une prise = une étape Ctrl+Z ; « Annuler la prise » remet les courbes d'avant.
 */
window.SS = window.SS || {};

SS.liveConsole = (() => {
  const BA = () => SS.beatAuto;
  let app = { project: () => null, changed() {} };
  const st = { open: false, rec: false, mode: 'touch', held: new Set(), latched: new Set(), take: null, lastTake: null };
  const key = (tid, k) => tid + '|' + k;
  const split = (s) => {
    const i = s.lastIndexOf('|');
    return [s.slice(0, i), s.slice(i + 1)];
  };

  function init(a) {
    app = { ...app, ...a };
  }

  /** Courbes de toute la chanson (pour revenir à l'état d'avant une prise). */
  const snapCurves = (p) => p.song.map((b) => (b.bauto ? JSON.parse(JSON.stringify(b.bauto)) : null));
  function restoreCurves(p, snap) {
    p.song.forEach((b, i) => {
      const v = snap[i];
      if (v) b.bauto = JSON.parse(JSON.stringify(v));
      else delete b.bauto;
    });
  }

  /* ---------- gestes ---------- */
  function touch(tid, k, v) {
    st.held.add(key(tid, k));
    st.latched.delete(key(tid, k));
    BA().setLive(tid, k, v);
  }
  function move(tid, k, v) {
    BA().setLive(tid, k, v);
  }
  function release(tid, k) {
    const kk = key(tid, k);
    if (!st.held.delete(kk)) return;
    if (!st.rec) return; // sans enregistrement : le réglage reste où on l'a laissé
    if (st.mode === 'latch') st.latched.add(kk);
    else BA().setLive(tid, k, null); // au toucher : la courbe reprend
  }
  /** Double-clic : le réglage revient à la courbe (ou au neutre). */
  function reset(tid, k) {
    st.held.delete(key(tid, k));
    st.latched.delete(key(tid, k));
    BA().setLive(tid, k, null);
  }
  /** Valeur tenue à la main, ou null. */
  const liveValue = (tid, k) => BA().liveOf(tid, k);
  const isWriting = (tid, k) => st.rec && (st.held.has(key(tid, k)) || st.latched.has(key(tid, k)));

  /* ---------- prise ---------- */
  function setRec(on) {
    const p = app.project();
    if (!p) return;
    if (on && !st.rec) {
      st.rec = true;
      st.take = { before: snapCurves(p), beats: new Set(), tracks: new Set(), cells: new Set() };
      // les réglages déjà tenus sans enregistrement s'écrivent aussi
      for (const [tid, o] of BA().live) for (const k of Object.keys(o)) if (!st.held.has(key(tid, k))) st.latched.add(key(tid, k));
    } else if (!on && st.rec) endTake();
  }
  function endTake() {
    st.rec = false;
    for (const kk of st.latched) BA().setLive(...split(kk), null);
    st.latched.clear();
    const t = st.take;
    st.take = null;
    if (t && t.beats.size) {
      st.lastTake = { before: t.before, beats: t.beats.size, tracks: t.tracks.size, cells: t.cells };
      app.changed(); // une prise = une étape Ctrl+Z
    }
  }
  function undoTake() {
    const p = app.project();
    if (!p || !st.lastTake) return false;
    restoreCurves(p, st.lastTake.before);
    st.lastTake = null;
    app.changed();
    return true;
  }
  /** Arrêt de la lecture : la prise se termine, les réglages tenus reviennent aux courbes. */
  function stopped() {
    if (st.rec) endTake();
    st.held.clear();
    st.latched.clear();
    BA().clearLive();
  }

  /** Le moteur doit-il appeler onStep ? */
  const active = () => st.rec && (st.held.size > 0 || st.latched.size > 0);

  /** Pas programmé d'une piste : écrit les valeurs tenues dans le temps joué. */
  function onStep(project, track, tick, song) {
    if (!active()) return;
    const lv = BA().live.get(track.id);
    if (!lv) return;
    let pass = null;
    for (const k of Object.keys(lv)) {
      if (!isWriting(track.id, k)) continue;
      if (!pass) pass = BA().playedPass(project, song);
      if (!pass) return; // scène hors de l'arrangement : rien où écrire
      const beat = Math.floor((tick % SS.totalSteps(project)) / SS.stepsPerBeat(project));
      BA().set(project, pass, track.id, k, beat, lv[k]);
      st.take.beats.add(`${pass.block}|${pass.rep}|${beat}`);
      st.take.tracks.add(track.id);
      st.take.cells.add(`${track.id}|${k}|${pass.block}|${pass.rep}|${beat}`);
    }
  }

  return {
    init,
    isOpen: () => st.open,
    setOpen: (on) => {
      st.open = !!on;
      if (!st.open) stopped();
    },
    isRec: () => st.rec,
    setRec,
    mode: () => st.mode,
    setMode: (m) => (st.mode = m === 'latch' ? 'latch' : 'touch'),
    touch,
    move,
    release,
    reset,
    liveValue,
    isWriting,
    takeBeats: () => (st.take ? st.take.beats.size : 0),
    /** Temps écrits par la prise en cours (ou la dernière) : « piste|réglage|bloc|répétition|temps ». */
    takeCells: () => (st.take ? st.take.cells : st.lastTake ? st.lastTake.cells : null),
    lastTake: () => (st.lastTake ? { beats: st.lastTake.beats, tracks: st.lastTake.tracks } : null),
    undoTake,
    stopped,
    active,
    onStep,
  };
})();
