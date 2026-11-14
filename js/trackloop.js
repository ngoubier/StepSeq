/*
 * Écoute en boucle d'une piste, depuis les fenêtres Sound design et Effets (bouton « Boucle »).
 *  - la piste a des notes (ou des coups) dans la scène : son motif tourne en boucle, seul, au tempo du projet ;
 *    chaque réglage changé s'entend aussitôt (le son est relu à chaque note) ;
 *  - la piste est vide : la note d'essai (bouton Écouter) est rejouée en boucle.
 * Rien n'est écrit dans le projet ; muet / solo de la piste sont rétablis à l'arrêt.
 */
window.SS = window.SS || {};
SS.trackLoop = (() => {
  let cur = null; // { track, mode: 'pattern' | 'note', mute, solo, timer, onChange }

  const hasNotes = (t) => (t.type === 'drum' ? (t.steps || []).some((v) => v > 0) : (t.events || []).length > 0);

  /**
   * Lance la boucle. once() joue la note d'essai et renvoie sa durée (s). onChange(on) suit l'état.
   * Refusé (false) pendant la lecture du projet : on y entend déjà la piste.
   */
  function start(track, project, once, onChange) {
    stop();
    if (!track || SS.audio.isPlaying()) return false;
    cur = { track, onChange };
    if (hasNotes(track)) {
      cur.mode = 'pattern';
      cur.mute = track.mute;
      cur.solo = track.solo;
      track.mute = false;
      track.solo = false;
      const solo = { ...project, tracks: [track], playMode: 'loop' };
      SS.audio.start(() => solo, (step) => step < 0 && cur && cur.track === track && stop());
    } else {
      cur.mode = 'note';
      const c = cur;
      const go = () => {
        if (cur !== c) return;
        const d = Number(once()) || 1;
        c.timer = setTimeout(go, d * 1000 + 300);
      };
      go();
    }
    onChange && onChange(true);
    return true;
  }

  function stop() {
    const c = cur;
    if (!c) return;
    cur = null;
    if (c.mode === 'pattern') {
      c.track.mute = c.mute;
      c.track.solo = c.solo;
      SS.audio.stop();
    } else clearTimeout(c.timer);
    c.onChange && c.onChange(false);
  }

  const active = (track) => !!cur && (!track || cur.track === track);
  return { start, stop, active, hasNotes, mode: () => cur && cur.mode };
})();
