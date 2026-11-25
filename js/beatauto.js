/*
 * Automation par temps (cutoff, résonance, vélocité) sur toute la chanson.
 *
 * Contrairement à l'automation par pas (track.auto, propre à une scène, qui boucle avec elle), ces courbes suivent
 * l'arrangement : une valeur par temps, différente à chaque passage d'une scène (2ᵉ couplet plus ouvert que le 1er…).
 *
 * Données : sur les blocs de l'arrangement, project.song[i].bauto = { [trackId]: { [réglage]: [ { temps: valeur }, … ] } }
 * — un objet par répétition du bloc (indice = répétition), temps comptés depuis le début de la scène (0 = 1er temps).
 * Rangées par répétition, les valeurs restent à leur place quand on change le nombre de répétitions ou de mesures.
 * Un « passage » = une répétition d'un bloc : { block, rep }.
 *
 * Réglages (SS.BEAT_AUTO) :
 *   cut : cutoff du filtre du son, −4 … +4 octaves autour du réglage du sound design (0 = inchangé) ;
 *   res : résonance du filtre du son, ×0 … ×3 ;
 *   env : profondeur de l'enveloppe du filtre, −3 … +4 octaves ajoutées à celle du son ;
 *   dec : decay de l'enveloppe du filtre, ×0,25 … ×4 ;
 *   vel : vélocité des notes (et des coups de batterie), 40 % … 130 % ;
 *   dj, echo, hall, vol (strip) : réglages de la tranche, comme l'automation de scène (track.auto) qu'ils complètent :
 *     filtre DJ −1 (passe-bas) … +1 (passe-haut), envois vers l'écho et la reverb, volume ×0 … ×1,5 ;
 *   mov (Mouvement) : profondeur du phaser et du flanger de la piste, ×0 … ×2 (seulement si l'un des deux est allumé).
 * Le cutoff et la résonance évoluent pendant la note (une nappe tenue s'ouvre) ; la vélocité, l'enveloppe et le decay
 * sont lus au début de la note ; les réglages de tranche suivent la courbe pas à pas.
 *
 * Console Live (js/liveconsole.js) : un réglage tenu à la main (live) remplace la courbe tant qu'il est tenu.
 *
 * Lecture : « fluide » (par défaut) — la valeur passe d'un temps à l'autre par une courbe lisse (spline cubique
 * monotone par le centre de chaque temps) ; « paliers » (track.bautoStep) — chaque temps garde sa valeur.
 * En boucle (mode Scène), on entend le passage choisi dans le panneau de la piste (le premier par défaut).
 */
window.SS = window.SS || {};

SS.BEAT_AUTO = [
  { id: 'cut', label: 'Cutoff', sub: 'autour du son', min: -4, max: 4, def: 0, color: '#f5a623', cc: 74 },
  { id: 'res', label: 'Résonance', sub: 'du son', min: 0, max: 3, def: 1, color: '#ff5c8a', cc: 71 },
  { id: 'env', label: 'Enveloppe', sub: 'du filtre', min: -3, max: 4, def: 0, color: 'var(--c-cyan)' },
  { id: 'dec', label: 'Decay', sub: 'du filtre', min: 0.25, max: 4, def: 1, color: 'var(--c-teal)' },
  { id: 'vel', label: 'Vélocité', sub: 'des notes', min: 0.4, max: 1.3, def: 1, color: '#3fcf3f' },
  { id: 'dj', label: 'Filtre DJ', sub: 'de la tranche', min: -1, max: 1, def: 0, color: 'var(--c-violet)', strip: true },
  { id: 'echo', label: 'Écho', sub: 'envoi', min: 0, max: 1, def: 0, color: 'var(--c-blue-soft)', strip: true },
  { id: 'hall', label: 'Reverb', sub: 'envoi', min: 0, max: 1, def: 0, color: 'var(--c-violet-soft)', strip: true },
  { id: 'vol', label: 'Volume', sub: 'de la tranche', min: 0, max: 1.5, def: 1, color: 'var(--c-yellow)', strip: true },
  { id: 'mov', label: 'Mouvement', sub: 'phaser, flanger', min: 0, max: 2, def: 1, color: 'var(--c-pink)', strip: true, mod: true },
];

SS.beatAuto = (() => {
  const P = Object.fromEntries(SS.BEAT_AUTO.map((x) => [x.id, x]));
  const clamp = (k, v) => Math.max(P[k].min, Math.min(P[k].max, v));
  const round = (v) => Math.round(v * 1000) / 1000;

  /**
   * Réglages proposés pour une piste : vélocité et tranche partout ; le filtre du son (cutoff, résonance, enveloppe,
   * decay) sur les sons à filtre (pas batterie, pas Juno, pas piste générative).
   */
  const STRIP = SS.BEAT_AUTO.filter((x) => x.strip);
  const hasMod = (track) => !!(track && track.fx && (track.fx.phaser > 0 || track.fx.flanger > 0));
  function paramsFor(track) {
    const keep = (list) => (hasMod(track) ? list : list.filter((x) => !x.mod));
    if (!track || track.type !== 'instrument') return keep([P.vel, ...STRIP]);
    const inst = SS.findInstrument ? SS.findInstrument(track.family, track.instrument) : null;
    if (inst && (inst.kind === 'analog' || inst.kind === 'ambient')) return keep([P.vel, ...STRIP]);
    return keep(SS.BEAT_AUTO);
  }
  /** Le son de la piste a-t-il un filtre réglable par temps ? */
  const hasFilter = (track) => paramsFor(track).some((x) => x.id === 'cut');

  /*
   * Console Live : valeurs tenues à la main, par piste. Elles remplacent la courbe (ou le neutre) à la lecture, le temps
   * du geste. live.get(trackId) = { réglage: valeur }.
   */
  const live = new Map();
  function setLive(trackId, k, v) {
    if (v == null) {
      const o = live.get(trackId);
      if (o) {
        delete o[k];
        if (!Object.keys(o).length) live.delete(trackId);
      }
      return;
    }
    const o = live.get(trackId) || {};
    o[k] = clamp(k, v);
    live.set(trackId, o);
  }
  const liveOf = (trackId, k) => {
    const o = live.get(trackId);
    return o && o[k] != null ? o[k] : null;
  };
  const clearLive = () => live.clear();

  const beatsPerBar = (p) => p.timeSig[0];
  const sceneOf = (p, id) => p.scenes.find((sc) => sc.id === id);
  const barsOf = (p, sc) => (sc.id === p.current ? p.bars : sc.bars);
  /** Nombre de temps d'une scène. */
  const sceneBeats = (p, sc) => barsOf(p, sc) * beatsPerBar(p);

  /** Passages d'une scène dans l'arrangement, dans l'ordre : [{ block, rep, bar }] (bar : 1re mesure dans la chanson, à partir de 0). */
  function passages(p, sceneId) {
    const out = [];
    let bar = 0;
    p.song.forEach((b, i) => {
      const sc = sceneOf(p, b.scene);
      if (!sc) return;
      const n = barsOf(p, sc);
      for (let r = 0; r < b.repeat; r++) {
        if (b.scene === sceneId) out.push({ block: i, rep: r, bar: bar + r * n, bars: n });
      }
      bar += n * b.repeat;
    });
    return out;
  }

  /** Couche de valeurs d'un passage pour une piste et un réglage : { temps: valeur } ou null. */
  function layer(p, pass, trackId, k, create = false) {
    const b = p.song[pass.block];
    if (!b) return null;
    if (!create) return (b.bauto && b.bauto[trackId] && b.bauto[trackId][k] && b.bauto[trackId][k][pass.rep]) || null;
    const t = ((b.bauto = b.bauto || {})[trackId] = (b.bauto[trackId] || {}));
    const reps = (t[k] = t[k] || []);
    while (reps.length <= pass.rep) reps.push(null);
    return (reps[pass.rep] = reps[pass.rep] || {});
  }

  function get(p, pass, trackId, k, beat) {
    const l = layer(p, pass, trackId, k);
    return l && l[beat] != null ? l[beat] : null;
  }

  function set(p, pass, trackId, k, beat, v) {
    if (v == null) {
      const l = layer(p, pass, trackId, k);
      if (l) delete l[beat];
      prune(p.song[pass.block]);
      return;
    }
    layer(p, pass, trackId, k, true)[beat] = round(clamp(k, v));
  }

  /** Retire les couches vides d'un bloc. */
  function prune(b) {
    if (!b || !b.bauto) return;
    for (const [tid, lanes] of Object.entries(b.bauto)) {
      for (const [k, reps] of Object.entries(lanes)) {
        const kept = reps.map((l) => (l && Object.keys(l).length ? l : null));
        while (kept.length && !kept[kept.length - 1]) kept.pop();
        if (kept.length) lanes[k] = kept;
        else delete lanes[k];
      }
      if (!Object.keys(lanes).length) delete b.bauto[tid];
    }
    if (!Object.keys(b.bauto).length) delete b.bauto;
  }

  /** Nettoie les courbes d'un bloc lu dans un fichier (pistes et réglages connus, temps entiers, valeurs bornées). */
  function clean(b, trackIds) {
    if (!b || !b.bauto || typeof b.bauto !== 'object') return delete b.bauto;
    const out = {};
    for (const [tid, lanes] of Object.entries(b.bauto)) {
      if (!trackIds.has(tid) || !lanes || typeof lanes !== 'object') continue;
      for (const k of Object.keys(P)) {
        if (!Array.isArray(lanes[k])) continue;
        const reps = lanes[k].slice(0, 64).map((l) => {
          if (!l || typeof l !== 'object') return null;
          const o = {};
          for (const [s, v] of Object.entries(l)) {
            const i = Number(s), x = Number(v);
            if (Number.isInteger(i) && i >= 0 && i < 64 * 32 && Number.isFinite(x)) o[i] = round(clamp(k, x));
          }
          return Object.keys(o).length ? o : null;
        });
        if (reps.some(Boolean)) (out[tid] = out[tid] || {})[k] = reps;
      }
    }
    b.bauto = out;
    prune(b);
  }

  /** La piste a-t-elle une courbe (ce réglage, ou n'importe lequel) quelque part dans la chanson ? */
  function has(p, trackId, k) {
    return p.song.some((b) => b.bauto && b.bauto[trackId] && (k ? !!b.bauto[trackId][k] : true));
  }
  /** … ou dans un des passages donnés ? */
  function hasIn(p, passes, trackId, k) {
    return passes.some((ps) => {
      const l = layer(p, ps, trackId, k);
      return l && Object.keys(l).length > 0;
    });
  }

  /**
   * Valeur au temps `x` (fractionnaire, en temps depuis le début de la scène ; le centre du temps b est en b + 0,5).
   * `vals(b)` : valeur du temps b ou null. step : palier (valeur du temps en cours). null : pas de valeur à cet endroit.
   */
  function curveAt(vals, x, step) {
    const b = Math.floor(x);
    if (step) return vals(b);
    if (vals(b) == null) return null; // un temps vide joue comme écrit, la courbe s'arrête à son bord
    const u = x - 0.5;
    const i = Math.floor(u), f = u - i;
    let p1 = vals(i), p2 = vals(i + 1);
    if (p1 == null) p1 = p2;
    if (p2 == null) p2 = p1;
    const p0 = vals(i - 1) ?? p1, p3 = vals(i + 2) ?? p2;
    // spline cubique monotone (Hermite, pentes de Fritsch-Carlson) : lisse, et sans bosse au-delà des barres dessinées
    const tan = (a, m, c) => {
      const d0 = m - a, d1 = c - m;
      if (d0 * d1 <= 0) return 0; // sommet ou creux : la courbe y arrive à plat
      const t = (d0 + d1) / 2, lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
      return Math.sign(t) * Math.min(Math.abs(t), lim);
    };
    const m1 = tan(p0, p1, p2), m2 = tan(p1, p2, p3);
    const f2 = f * f, f3 = f2 * f;
    return (2 * f3 - 3 * f2 + 1) * p1 + (f3 - 2 * f2 + f) * m1 + (-2 * f3 + 3 * f2) * p2 + (f3 - f2) * m2;
  }

  /**
   * Fonction des valeurs d'un passage pour une piste et un réglage, ou null s'il n'y en a pas.
   * Les temps se lisent à travers les répétitions voisines du même bloc (la courbe ne casse pas entre deux couplets).
   */
  function reader(p, pass, track, k) {
    const b = p.song[pass.block];
    const reps = b && b.bauto && b.bauto[track.id] && b.bauto[track.id][k];
    if (!reps || !reps[pass.rep]) return null;
    const sc = sceneOf(p, b.scene);
    const n = sc ? sceneBeats(p, sc) : Infinity;
    const vals = (x) => {
      const r = pass.rep + Math.floor(x / n);
      const l = r >= 0 && r < b.repeat ? reps[r] : null;
      if (!l) return null;
      const v = l[((x % n) + n) % n];
      return v == null ? null : v;
    };
    const step = !!track.bautoStep;
    return (x) => curveAt(vals, x, step);
  }

  // passage entendu en boucle, par scène : choisi dans le panneau de la piste (index dans passages(), ou 'all' = le premier)
  const loopChoice = new Map();
  function setLoopPass(sceneId, choice) {
    loopChoice.set(sceneId, choice);
  }
  function loopPass(sceneId) {
    return loopChoice.has(sceneId) ? loopChoice.get(sceneId) : 'all';
  }

  /**
   * Ce que la lecture doit appliquer à une piste : { vel(x), cut(x), res(x) } (fonctions du temps dans la scène,
   * valeur ou null) pour le passage joué, ou null s'il n'y a rien. song : { index, rep } en mode Chanson, sinon null.
   */
  /** Passage joué : celui de la chanson (song : { index, rep }), ou en boucle celui choisi pour la scène en cours. */
  function playedPass(p, song) {
    if (song) return { block: song.index, rep: song.rep };
    const all = passages(p, p.current);
    if (!all.length) return null;
    const c = loopPass(p.current);
    return all[c === 'all' ? 0 : c] || all[0];
  }
  function forTrack(p, track, song) {
    const pass = playedPass(p, song);
    if (!pass) return live.has(track.id) ? Object.fromEntries(Object.entries(live.get(track.id)).map(([k, v]) => [k, () => v])) : null;
    const out = {};
    let any = false;
    const lv = live.get(track.id);
    for (const x of paramsFor(track)) {
      const f = lv && lv[x.id] != null ? ((v) => () => v)(lv[x.id]) : reader(p, pass, track, x.id);
      if (f) {
        out[x.id] = f;
        any = true;
      }
    }
    return any ? out : null;
  }

  /** Facteur de résonance appliqué à la résonance du son (un son sans résonance peut quand même monter). */
  const resQ = (q, f) => (f <= 1 ? q * f : Math.max(q, 2) * f);

  /*
   * Liaison : en bougeant une barre, les voisines suivent, d'autant moins qu'elles sont loin (cloche en cosinus sur
   * `radius` temps de chaque côté). `snap` : valeurs avant le geste (repasser sur une barre ne cumule pas) ;
   * `anchors` : Map temps → valeur posée par le geste. Renvoie Map temps → nouvelle valeur (dans [0, n[).
   */
  function brush(snap, anchors, radius, n, def) {
    const out = new Map();
    for (let i = 0; i < n; i++) {
      if (anchors.has(i)) {
        out.set(i, anchors.get(i));
        continue;
      }
      if (!radius) continue;
      let best = 0, bv = 0;
      for (const [a, v] of anchors) {
        const d = Math.abs(i - a);
        if (d > radius) continue;
        const w = 0.5 * (1 + Math.cos((Math.PI * d) / (radius + 1)));
        if (w > best) {
          best = w;
          bv = v;
        }
      }
      if (best < 0.02) continue;
      const old = snap(i) ?? def;
      out.set(i, old + (bv - old) * best);
    }
    return out;
  }

  /** Formes prêtes sur n temps : valeurs (ou null pour effacer). */
  function shape(k, id, n) {
    const x = P[k];
    const [lo, hi] = SHAPE_RANGE[k] || [x.min, x.max];
    const t = (i) => (n > 1 ? i / (n - 1) : 1);
    if (id === 'rise') return Array.from({ length: n }, (_, i) => lo + (hi - lo) * t(i));
    if (id === 'fall') return Array.from({ length: n }, (_, i) => hi - (hi - lo) * t(i));
    if (id === 'swell') return Array.from({ length: n }, (_, i) => lo + (hi - lo) * Math.sin(Math.PI * t(i)));
    if (id === 'flat') return Array(n).fill(x.def);
    return Array(n).fill(null);
  }
  // bornes des formes prêtes (Montée, Descente, Vague) : un geste utile, pas les extrêmes
  const SHAPE_RANGE = { cut: [-2.5, 0.5], res: [0.5, 2.5], env: [-1, 2], dec: [0.5, 2], vel: [0.6, 1.15], dj: [-0.8, 0], echo: [0, 0.6], hall: [0, 0.6], vol: [0.2, 1], mov: [0.2, 1.8] };
  const SHAPES = [
    { id: 'rise', label: 'Montée' },
    { id: 'fall', label: 'Descente' },
    { id: 'swell', label: 'Vague (monte puis redescend)' },
    { id: 'flat', label: 'Neutre partout' },
    { id: 'clear', label: 'Effacer' },
  ];

  /**
   * Valeur MIDI (0..127) d'une courbe pour l'export : cutoff → CC 74, 64 = réglage du son, ±4 octaves aux extrêmes ;
   * résonance → CC 71, 64 = celle du son (×1), 0 = aucune (×0), 127 = ×3.
   */
  function ccValue(k, v) {
    const c = (x) => Math.max(0, Math.min(127, Math.round(x)));
    if (k === 'cut') return c(64 + (v / 4) * 63);
    if (k === 'res') return c(v <= 1 ? 64 * v : 64 + ((v - 1) / 2) * 63);
    return null;
  }

  const fmt = (k, v) => {
    if (v == null) return 'comme écrit';
    if (k === 'cut') return (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + ' oct';
    if (k === 'res' || k === 'dec' || k === 'mov') return '×' + v.toFixed(2).replace('.', ',');
    if (k === 'env') return (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + ' oct';
    if (k === 'dj') return Math.abs(v) < 0.02 ? 'ouvert' : (v < 0 ? 'passe-bas ' : 'passe-haut ') + Math.round(Math.abs(v) * 100) + ' %';
    return Math.round(v * 100) + ' %';
  };

  /** Pose un plan de courbes : [{ col, block, rep, k, beats: { temps: valeur } }] ; idOf(col) → identifiant de piste. */
  function applyPlan(p, plan, idOf) {
    for (const e of plan || []) {
      const id = idOf(e.col);
      if (!id || !p.song[e.block]) continue;
      for (const [b, v] of Object.entries(e.beats)) set(p, { block: e.block, rep: e.rep }, id, e.k, +b, v);
    }
  }

  return { P, STRIP, ccValue, applyPlan, paramsFor, hasFilter, setLive, liveOf, clearLive, live, playedPass, passages, sceneBeats, beatsPerBar, layer, get, set, prune, clean, has, hasIn, curveAt, reader, forTrack, setLoopPass, loopPass, resQ, brush, shape, SHAPES, fmt };
})();
