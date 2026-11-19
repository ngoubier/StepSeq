/*
 * Assistant « Nouvelle chanson » ↔ Grille : quelles pistes de la grille ont été retouchées à la main (sans navigateur).
 *
 * À la création (js/main.js addBandSong), chaque piste de l'assistant reçoit band.col (sa colonne dans l'assistant) et
 * band.sig, l'empreinte de son contenu : réglages (son, volume, effets, mix…) et notes de toutes les scènes.
 * Une piste est « retouchée » quand son empreinte a changé (Annuler jusqu'à l'état créé : elle ne l'est plus).
 * Une piste sans band a été ajoutée à la main : l'assistant n'y touche pas.
 * Mettre la grille à jour depuis l'assistant garde les pistes retouchées choisies et les pistes ajoutées à la main, avec
 * leurs notes, scène par scène (scènes appariées par nom, sinon par position : matchScenes).
 */
window.SS = window.SS || {};
SS.gridSync = (() => {
  /** Ce qui ne compte pas comme une retouche : la marque elle-même, l'écoute (Muet, Solo) et les notes (comptées par scène). */
  const SKIP = new Set(['band', 'mute', 'solo', 'steps', 'events', 'rat', 'cond', 'auto', 'autoLen', 'length']);
  function hash(txt) {
    let a = 5381;
    let b = 52711;
    for (let i = 0; i < txt.length; i++) {
      const c = txt.charCodeAt(i);
      a = (Math.imul(a, 33) ^ c) >>> 0;
      b = (Math.imul(b, 31) ^ c) >>> 0;
    }
    return a.toString(36) + b.toString(36) + ':' + txt.length.toString(36);
  }
  /** Les réglages de la piste tels qu'un rechargement les donne (normalizeProject), sans ce qui ne compte pas. */
  function settings(t) {
    let n = t;
    try {
      n = SS.normalizeProject({ tracks: [JSON.parse(JSON.stringify({ ...t, steps: [], events: [], auto: undefined, autoLen: undefined }))] }).tracks[0];
    } catch (e) {
      /* piste illisible : telle quelle */
    }
    const o = {};
    Object.keys(n)
      .filter((k) => !SKIP.has(k) && n[k] !== undefined)
      .sort()
      .forEach((k) => (o[k] = n[k]));
    return o;
  }
  /** Les notes d'une scène pour cette piste (scène en cours : celles de la piste, pas encore rangées). */
  function sceneData(p, t, sc, live) {
    const d = sc.id === p.current ? live : sc.data && sc.data[t.id];
    if (!d) return null;
    const o = {};
    if (Array.isArray(d.steps) && d.steps.some((v) => v > 0)) o.steps = d.steps.join(',').replace(/(,0)+$/, '');
    if (Array.isArray(d.events) && d.events.length) o.events = d.events;
    ['rat', 'cond', 'auto'].forEach((k) => d[k] && Object.keys(d[k]).length && (o[k] = d[k]));
    return Object.keys(o).length ? o : null;
  }
  /** Empreinte du contenu d'une piste du projet p. */
  function trackSig(p, t) {
    const one = { tracks: [t] };
    let live = null;
    try {
      live = SS.snapshotTracks(one)[t.id];
    } catch (e) {
      /* ignore */
    }
    return hash(JSON.stringify([settings(t), (p.scenes || []).map((sc) => sceneData(p, t, sc, live))]));
  }
  const managed = (t) => !!(t && t.band && t.band.col && t.band.sig);
  const retouched = (p, t) => managed(t) && trackSig(p, t) !== t.band.sig;
  /** L'état de la grille vue de l'assistant : null si ses pistes ne viennent pas d'une mise à jour possible. */
  function plan(p) {
    const tracks = p.tracks || [];
    if (!tracks.some(managed)) return null;
    return {
      retouched: tracks.filter((t) => retouched(p, t)),
      fresh: tracks.filter((t) => managed(t) && !retouched(p, t)),
      hand: tracks.filter((t) => !t.band),
    };
  }
  /** Map id de nouvelle scène → ancienne scène : même nom (dans l'ordre des répétitions), sinon même position. */
  function matchScenes(oldScenes, newScenes) {
    const out = new Map();
    const used = new Set();
    newScenes.forEach((sc) => {
      const o = oldScenes.find((x) => !used.has(x) && x.name === sc.name);
      if (o) {
        used.add(o);
        out.set(sc.id, o);
      }
    });
    if (oldScenes.length === newScenes.length)
      newScenes.forEach((sc, i) => !out.has(sc.id) && !used.has(oldScenes[i]) && (used.add(oldScenes[i]), out.set(sc.id, oldScenes[i])));
    return out;
  }
  return { trackSig, retouched, managed, plan, matchScenes };
})();
