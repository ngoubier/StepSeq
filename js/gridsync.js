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
  /** Empreintes séparées du son (réglages) et des notes : une piste dont on n'a changé que le son peut rejouer les accords. */
  const soundSig = (t) => hash(JSON.stringify(settings(t)));
  function notesSig(p, t) {
    let live = null;
    try {
      live = SS.snapshotTracks({ tracks: [t] })[t.id];
    } catch (e) {
      /* ignore */
    }
    return hash(JSON.stringify((p.scenes || []).map((sc) => sceneData(p, t, sc, live))));
  }
  /** Ce qui a été retouché dans une piste de l'assistant : { notes, sound } (piste d'avant nsig/ssig : les deux). */
  function retouch(p, t) {
    if (!managed(t)) return { notes: false, sound: false };
    if (!t.band.nsig || !t.band.ssig) {
      const r = trackSig(p, t) !== t.band.sig;
      return { notes: r, sound: r };
    }
    return { notes: notesSig(p, t) !== t.band.nsig, sound: soundSig(t) !== t.band.ssig };
  }
  /** Les trois empreintes d'une piste, rangées dans band à la création. */
  const stamp = (p, t) => Object.assign(t.band, { sig: trackSig(p, t), nsig: notesSig(p, t), ssig: soundSig(t) });
  /**
   * Empreinte de ce que la grille contient (tempo, mesure, groove, scènes, accords, arrangement, pistes et notes), sans le
   * brouillon de l'assistant, le titre ni l'écoute : l'assistant sait si la grille a changé depuis son dernier passage.
   */
  function projectSig(p) {
    try {
      SS.commitScene(p);
    } catch (e) {
      /* ignore */
    }
    const o = {
      tempo: p.tempo,
      timeSig: p.timeSig,
      groove: p.groove,
      song: (p.song || []).map((b) => [b.scene, b.repeat]),
      scenes: (p.scenes || []).map((sc) => [sc.id, sc.name, sc.bars, sc.key, sc.emotion, sc.grid, sc.data]),
      tracks: (p.tracks || []).map((t) => [t.id, settings(t)]),
    };
    return hash(JSON.stringify(o));
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
  /** Demi-tons de la tonalité a à la tonalité b (−6 à +5) ; 0 si l'une manque. */
  const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = (t) => (NAT[t[0]] + [...t.slice(1)].reduce((x, c) => x + (c === '♯' || c === '#' ? 1 : c === '♭' || c === 'b' ? -1 : 0), 0) + 12) % 12;
  function semis(a, b) {
    if (!a || !b || !a.tonic || !b.tonic) return 0;
    const d = (((pc(b.tonic) - pc(a.tonic)) % 12) + 12) % 12;
    return d > 5 ? d - 12 : d;
  }
  /** Notes d'une scène (copie) transposées de la tonalité a à b (pistes instrument : events ; la batterie ne bouge pas). */
  function transposeData(d, a, b) {
    const o = JSON.parse(JSON.stringify(d));
    const n = semis(a, b);
    if (n && Array.isArray(o.events)) o.events.forEach((e) => Array.isArray(e.notes) && (e.notes = e.notes.map((x) => Math.min(127, Math.max(0, x + n)))));
    return o;
  }
  return { trackSig, retouched, managed, plan, matchScenes, soundSig, notesSig, retouch, stamp, projectSig, semis, transposeData };
})();
