/*
 * Auto Mix : pilote auto des faders (fonctions pures, testées sous Node).
 *
 * Il règle l'équilibre des pistes comme un ingénieur du son à l'oreille : il écoute, choisit la piste la plus
 * éloignée de sa place, bouge son fader doucement d'un petit pas (au plus 2 dB, 60 % de l'écart), puis réécoute
 * cette piste avant de la retoucher. Quand une piste repart dans l'autre sens, ses pas suivants sont plus fins.
 * Le panneau (js/automixpanel.js) fait glisser le fader et rappelle plan() au fil de la lecture.
 *
 * Mesure : le niveau relatif des pistes qui jouent ENSEMBLE (énergie pondérée K, comparée paire par paire aux
 * mêmes instants). Un fader règle exactement ces écarts, qui ne dépendent pas de l'arrangement : une intro à
 * deux pistes et un refrain à dix donnent le même écart basse / nappe, alors que le niveau « par rapport au
 * mix » de la basse change de 10 dB d'une section à l'autre (et ferait osciller le fader). Les niveaux visés
 * par rôle (ROLE_LEVEL de js/automix.js) donnent les écarts visés ; une résolution par moindres carrés en tire
 * l'erreur de chaque fader, à une constante près, fixée par la moyenne pondérée par l'énergie des pistes : le
 * pilote règle l'équilibre à volume global constant, il ne baisse pas tout.
 *
 * Mémoire : constante de temps TAU ; après un geste sur une piste, ses comparaisons sont oubliées et elle se
 * réécoute. Les sommes d'énergie s'effacent ensemble, leur rapport reste : une piste rare (un clap toutes les
 * 16 mesures) garde sa mesure entre deux frappes et se rejuge à la frappe suivante.
 *
 * Gain staging : si le limiteur de la tranche Master travaille fort (le mix arrive trop chaud), toutes les pistes
 * descendent ensemble ; si le mix arrive trop faible, elles montent ensemble. Le gain d'entrée du mastering
 * compense (panneau), pour garder le même volume final.
 */
window.SS = window.SS || {};

SS.automixPilot = (() => {
  const A = () => SS.automix;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, step = 0.5) => Math.round(v / step) * step;
  const dB = (x) => 10 * Math.log10(x);

  const P = {
    tau: 20, // s : mémoire de l'écoute
    start: 2, // dB d'écart qui déclenche un geste
    gain: 0.6, // part de l'écart corrigée à chaque geste
    stepMax: 2, // dB au plus par geste
    settle: 2, // s de lecture après un geste avant d'en décider un autre
    minFresh: 3, // relevés (50 ms) où la piste joue avec d'autres depuis son dernier geste
    budget: 15, // dB de déplacement cumulé au plus par piste pendant une séance
    min: -40, // butées des faders (dB)
    max: 6,
    rate: 1.5, // vitesse du fader (dB par seconde)
    limHot: 2.5, // réduction moyenne (dB) du limiteur de la tranche Master au-delà de laquelle le mix arrive trop chaud
    coldPeak: -24, // crête du mix (ramenée au fader Master à 0 dB) en dessous de laquelle il arrive trop faible
    stageStep: 1.5, // dB par geste de gain staging
    window: 3, // s d'écoute pour le gain staging
  };

  function newTracker() {
    return { t: 0, tracks: {}, pairs: {}, recent: [] };
  }

  /**
   * Ajoute un relevé (même forme que pour js/automix.js : { dt, tracks, pre, preGain, masterLimGr }).
   * skip : pistes dont le fader bouge en ce moment (leurs relevés ne comptent pas).
   */
  function feed(tk, frame, skip) {
    const dt = frame.dt || 0.05;
    tk.t += dt;
    const keep = Math.exp(-dt / P.tau);
    const g = Number.isFinite(frame.preGain) ? Math.max(frame.preGain, 1e-3) : 1;
    const norm = 1 / (g * g);
    const pre = frame.pre;
    const mixK = pre ? A().kPower(pre.bands) * norm : 0;
    const on = []; // pistes qui jouent à cet instant : [id, énergie]
    for (const [id, f] of Object.entries(frame.tracks || {})) {
      const s = tk.tracks[id] || (tk.tracks[id] = { k: 0, mk: 0, w: 0, fresh: 0, ever: 0, movedAt: -Infinity, dir: 0, flips: 0 });
      s.k *= keep;
      s.mk *= keep;
      s.w *= keep;
      if (skip && skip.has(id)) continue;
      const k = A().kPower(f.bands);
      if (mixK <= 1e-9 || k < 1e-9 || k < mixK * 1e-4) continue;
      s.k += k;
      s.mk += mixK;
      s.w += k;
      s.ever++;
      on.push([id, k]);
    }
    for (const p of Object.values(tk.pairs)) {
      p.ka *= keep;
      p.kb *= keep;
      p.n *= keep;
    }
    if (on.length > 1) on.forEach(([id]) => tk.tracks[id].fresh++);
    A().coPlay(tk.pairs, on);
    if (pre && mixK > 1e-9) {
      tk.recent.push({ t: tk.t, lim: Math.abs(frame.masterLimGr || 0), peak: pre.peak / g });
      while (tk.recent.length && tk.recent[0].t < tk.t - P.window) tk.recent.shift();
    }
    return tk;
  }

  /**
   * Le fader de ces pistes vient de bouger (de `deltas[i]` dB) : leurs mesures sont oubliées, elles se
   * réécoutent à partir de maintenant. Un changement de sens rend les pas suivants plus fins.
   */
  function forget(tk, ids, deltas = []) {
    ids.forEach((id, i) => {
      const s = tk.tracks[id];
      if (!s) return;
      s.k = s.mk = 0;
      s.fresh = 0;
      s.movedAt = tk.t;
      const dir = Math.sign(deltas[i] || 0);
      if (dir && s.dir && dir !== s.dir) s.flips++;
      if (dir) s.dir = dir;
      for (const [key, p] of Object.entries(tk.pairs)) if (p.a === id || p.b === id) delete tk.pairs[key];
    });
    tk.recent = [];
  }

  /** Niveau d'une piste par rapport au mix (dB), depuis son dernier geste ; null si pas encore entendue. */
  function relOf(s) {
    return s && s.mk > 0 && s.k > 0 ? dB(s.k / s.mk) : null;
  }

  /**
   * Prochain geste.
   *   tracks : [{ id, name, role, volumeDb, locked, moved (dB déjà parcourus) }]
   * Rend { kind: 'fader', id, name, from, to, dev } ou { kind: 'stage', delta, moves: [{ id, from, to }], why },
   * et dans tous les cas un état : { balanced, waiting: [noms], rows: [{ id, name, dev }] }.
   */
  function plan(tk, tracks) {
    const state = { balanced: false, waiting: [], rows: [] };
    const free = tracks.filter((t) => !t.locked);
    // gain staging d'abord : un mix qui sature au Master fausse toutes les autres mesures
    const span = tk.recent.length ? tk.recent[tk.recent.length - 1].t - tk.recent[0].t : 0;
    if (span >= P.window * 0.8 && free.length) {
      const lim = tk.recent.reduce((a, r) => a + r.lim, 0) / tk.recent.length;
      const peak = 20 * Math.log10(Math.max(1e-9, tk.recent.reduce((a, r) => Math.max(a, r.peak), 0)));
      let delta = 0;
      if (lim > P.limHot || peak > 0) delta = -P.stageStep;
      else if (peak < P.coldPeak) delta = P.stageStep;
      if (delta) {
        const moves = free.map((t) => ({ id: t.id, from: t.volumeDb, to: clamp(round(t.volumeDb + delta, 0.1), P.min, P.max) })).filter((m) => Math.abs(m.to - m.from) >= 0.1);
        if (moves.length)
          return {
            kind: 'stage', delta, moves, state,
            why: delta < 0
              ? lim > P.limHot ? `le limiteur du Master retire ${lim.toFixed(1).replace('.', ',')} dB : le mix arrive trop chaud` : 'le mix sature en arrivant au Master'
              : `le mix arrive trop faible au Master (crêtes à ${Math.round(peak)} dBFS)`,
          };
      }
    }
    // équilibre : erreur de chaque fader, mesurée sur les pistes qui jouent ensemble
    const roleCount = {};
    const known = tracks.filter((t) => A().ROLE_LEVEL[t.role] != null && tk.tracks[t.id] && tk.tracks[t.id].ever >= 1);
    known.forEach((t) => (roleCount[t.role] = (roleCount[t.role] || 0) + 1));
    const rows = known.map((t) => ({ t, id: t.id, s: tk.tracks[t.id], target: A().roleTarget(t.role, roleCount[t.role]), w: tk.tracks[t.id].w }));
    let err = A().solvePairs(Object.values(tk.pairs), rows);
    if (!err.size && rows.length === 1) {
      // une seule piste entendue : faute de comparaison, son niveau par rapport au mix
      const rel = relOf(rows[0].s);
      if (rel != null) err = new Map([[rows[0].id, rel - rows[0].target]]);
    }
    for (const r of rows) {
      if (err.has(r.id)) r.dev = err.get(r.id);
      else state.waiting.push(r.t.name);
    }
    const judged = rows.filter((r) => r.dev != null);
    state.rows = judged.map((r) => ({ id: r.id, name: r.t.name, dev: r.dev }));
    const ready = (r) => !r.t.locked && r.s.fresh >= P.minFresh && tk.t - r.s.movedAt >= P.settle;
    const stepOf = (r) => {
      const max = Math.max(0.5, P.stepMax / (1 + r.s.flips)); // pas plus fins après chaque aller-retour
      const d = clamp(-r.dev * P.gain, -max, max);
      return Math.sign(d) * Math.max(0.5, round(Math.abs(d), 0.5));
    };
    const cands = judged
      .filter((r) => Math.abs(r.dev) > P.start && ready(r))
      .map((r) => {
        let delta = stepOf(r);
        const left = P.budget - (r.t.moved || 0);
        if (Math.abs(delta) > left) delta = Math.sign(delta) * Math.max(0, round(left, 0.5));
        return { r, to: clamp(round(r.t.volumeDb + delta, 0.1), P.min, P.max) };
      })
      .filter((c) => Math.abs(c.to - c.r.t.volumeDb) >= 0.25)
      .sort((a, b) => Math.abs(b.r.dev) - Math.abs(a.r.dev));
    state.balanced = judged.length > 0 && judged.every((r) => Math.abs(r.dev) <= P.start || r.t.locked);
    if (cands.length) {
      const { r, to } = cands[0];
      return { kind: 'fader', id: r.id, name: r.t.name, from: r.t.volumeDb, to, dev: r.dev, state };
    }
    // une piste à remonter dont le fader est déjà en butée haute : les autres lui font de la place
    const stuck = judged.filter((r) => r.dev < -P.start && ready(r) && r.t.volumeDb >= P.max - 0.25).sort((a, b) => a.dev - b.dev)[0];
    if (stuck) {
      const delta = stepOf(stuck) > 0 ? -stepOf(stuck) : -0.5;
      const moves = free
        .filter((t) => t.id !== stuck.id)
        .map((t) => ({ id: t.id, from: t.volumeDb, to: clamp(round(t.volumeDb + delta, 0.1), P.min, P.max) }))
        .filter((m) => Math.abs(m.to - m.from) >= 0.1);
      if (moves.length) return { kind: 'stage', delta, moves, state, room: stuck.id, why: `${stuck.t.name} est en butée : les autres pistes lui font de la place` };
    }
    return { state };
  }

  /** Durée (s) d'un geste : le fader glisse à vitesse constante, au moins 0,6 s. */
  const rampSecs = (deltaDb) => Math.max(0.6, Math.abs(deltaDb) / P.rate);
  /** Courbe douce du geste (0 → 1). */
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  return { P, newTracker, feed, forget, relOf, plan, rampSecs, ease };
})();
