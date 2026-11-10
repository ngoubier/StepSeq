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

  /** Un seul module Master par geste, avec des mesures fraîches et des corrections bornées. */
  function planMaster(sum, master, target = 'streaming', locked = new Set(), scopes = {}, spent = {}) {
    if (!sum || sum.secs < 10 || !sum.mix.n || !Number.isFinite(sum.mix.k) || sum.mix.k < -90) return null;
    const mix = master.mix;
    let changes = [];
    let limiterAction = null;
    const add = (path, from, to) => { if (from !== to) changes.push({ path, from, to }); };
    const action = (module, title) => changes.length ? { kind: 'master', module, title, changes } : null;
    const T = A().TARGETS[target] || A().TARGETS.streaming;
    // Sécuriser d'abord la sortie : le module de mastering contient un limiteur true peak.
    const final = master.mastering.on;
    if (!locked.has('lim') && scopes.mastering !== false && (spent.lim || 0) < 12) {
      if (final) {
        add('mastering.ceiling', master.mastering.ceiling, Math.min(master.mastering.ceiling, T.tp));
        const loud = sum.master;
        if (Number.isFinite(loud.i) && Number.isFinite(loud.tp)) {
          let delta = loud.tp > T.tp + 0.3 ? -0.5 : clamp(T.lufs - loud.i, -0.5, 0.5);
          if (Number.isFinite(loud.plr) && loud.plr < T.plr[0]) delta = Math.min(delta, 0); // garder les attaques
          if (Math.abs(T.lufs - loud.i) > 1 || loud.tp > T.tp + 0.3)
            add('mastering.drive', master.mastering.drive, round(clamp(master.mastering.drive + delta, -12, A().DRIVE_MAX), 0.1));
        }
      } else {
        add('mix.lim.on', mix.lim.on, true);
        add('mix.lim.ceil', mix.lim.ceil, mix.lim.on && sum.master.limGr > 3 ? Math.min(-1, mix.lim.ceil + 1) : Math.min(mix.lim.ceil, -1));
        add('mix.lim.rel', mix.lim.rel, 0.1);
      }
      if (changes.length) {
        limiterAction = action('lim', final ? 'Limiteur true peak · niveau de sortie' : 'Limiteur · protection des crêtes');
        if (changes.some((c) => c.path !== 'mastering.drive')) return limiterAction;
        changes = [];
      }
    }
    if (!locked.has('comp') && scopes.comp !== false && (spent.comp || 0) < 8) {
      const c = mix.comp;
      const gr = sum.master.grMaster;
      if (!c.on && Number.isFinite(sum.mix.prePeak)) {
        add('mix.comp.th', c.th, round(clamp(sum.mix.prePeak - (master.volumeDb || 0) - 3, -30, -3), 0.5));
        add('mix.comp.ratio', c.ratio, 1.5);
        add('mix.comp.att', c.att, 0.03);
        add('mix.comp.rel', c.rel, 0.2);
        add('mix.comp.makeup', c.makeup, 0);
        add('mix.comp.on', false, true);
      } else if (gr > 3) add('mix.comp.th', c.th, Math.min(-3, c.th + 1));
      else if (gr < 0.5 && Number.isFinite(sum.master.plr) && sum.master.plr > T.plr[1])
        add('mix.comp.th', c.th, Math.max(-30, c.th - 0.5));
      if (changes.length) return action('comp', 'Compresseur · compression légère');
    }
    if (!locked.has('eq') && scopes.mastereq !== false && (spent.eq || 0) < 8) {
      const dev = A().toneDeviation(sum.mix.bands, A().CURVES[target] || A().CURVES.streaming);
      const zones = [{ key: 'low', bands: [1, 2], f: 100 }, { key: 'high', bands: [8, 9], f: 10000 }]
        .map((z) => ({ ...z, dev: z.bands.reduce((v, b) => v + dev[b], 0) / z.bands.length }))
        .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
      for (const z of zones) {
        if (Math.abs(z.dev) < 3.5) continue;
        const band = mix.eq[z.key];
        const to = round(clamp(band.g - Math.sign(z.dev) * 0.5, -4, 4), 0.5);
        if (to === band.g) continue;
        add('mix.eq.' + z.key + '.f', band.f, z.f);
        add('mix.eq.' + z.key + '.g', band.g, to);
        add('mix.eq.on', mix.eq.on, true);
        return action('eq', 'Égaliseur · ' + (z.key === 'low' ? 'équilibre des graves' : 'équilibre des aigus'));
      }
    }
    return limiterAction;
  }

  /** Positions modérées : centre pour les fondations, paires alternées pour les accompagnements. */
  function panTargets(tracks) {
    const centers = new Set(['kick', 'bass', 'snare', 'clap', 'lead']);
    const starts = { hat: 0.2, ohat: -0.2, cymbal: -0.3, tom: -0.25, perc: 0.35, keys: -0.2, arp: 0.3, pad: -0.15 };
    const count = {};
    return new Map(tracks.filter((t) => !t.mute).map((t) => {
      if (centers.has(t.role)) return [t.id, 0];
      const base = starts[t.role];
      if (base == null) return [t.id, t.mix.pan];
      const i = count[t.role] || 0;
      count[t.role] = i + 1;
      return [t.id, base * (i % 2 ? -1 : 1)];
    }));
  }

  /** Examine les modules d'une piste entendue, sans toucher à son fader. */
  function planTrack(sum, track, scopes = {}, locked = new Set(), suggestions = []) {
    const m = sum && sum.tracks[track.id];
    if (!sum || sum.secs < 10 || !A().heard(m) || track.mute) return null;
    const mix = track.mix;
    const rule = A().ruleFor(track);
    const actions = [];
    for (const module of ['eq', 'comp', 'lim']) {
      if (locked.has(module) || scopes[module === 'eq' ? 'eq' : 'comp'] === false) continue;
      const changes = new Map();
      const add = (path, to) => {
        const from = path.split('.').slice(1).reduce((o, k) => o[k], mix);
        if (from !== to && (typeof to === 'boolean' || Number.isFinite(to))) changes.set(path, { path, from, to });
      };
      if (module === 'eq' && !mix.eq.on && rule && rule.eq) {
        const e = rule.eq;
        add('mix.eq.on', true);
        if (e.hp.on) { add('mix.eq.hp.on', true); add('mix.eq.hp.f', e.hp.f); }
        for (const b of ['low', 'lm', 'hm', 'high']) if (e[b].g) {
          add(`mix.eq.${b}.f`, e[b].f);
          if (e[b].q != null) add(`mix.eq.${b}.q`, e[b].q);
          add(`mix.eq.${b}.g`, clamp(e[b].g, -6, 4));
        }
      }
      if (module === 'comp' && !mix.comp.on && rule && rule.comp && Number.isFinite(m.inPeak)) {
        const c = rule.comp;
        const values = { on: true, th: round(clamp(m.inPeak - (rule.below || 4), -50, -1), 0.5),
          ratio: clamp(c.ratio, 1.5, 6), att: c.att, rel: c.rel, knee: c.knee, makeup: c.makeup || 0 };
        Object.entries(values).forEach(([k, v]) => add('mix.comp.' + k, v));
      }
      if (module === 'lim' && !mix.lim.on && Number.isFinite(m.inPeak) && Number.isFinite(m.inP90) && m.inPeak - m.inP90 > 6) {
        add('mix.lim.ceil', round(clamp(m.inPeak - 3, -24, -0.5), 0.5));
        add('mix.lim.rel', 0.05);
        add('mix.lim.on', true);
      }
      // Réutiliser les corrections mesurées du diagnostic, y compris sur une tranche déjà traitée.
      for (const s of suggestions) {
        if (s.track !== track.id || s.kind === 'chain') continue;
        for (const c of s.changes) if ((!c.track || c.track === track.id) && c.path.startsWith(`mix.${module}.`)) {
          let to = c.to;
          if (c.path.endsWith('.g')) to = clamp(to, -6, 4);
          add(c.path, to);
        }
      }
      if (changes.size) actions.push({ kind: 'track', track: track.id, module,
        title: track.name + ' · ' + ({ eq: 'Égaliseur', comp: 'Compresseur', lim: 'Limiteur' })[module],
        changes: [...changes.values()] });
    }
    return actions;
  }

  return { P, newTracker, feed, forget, relOf, plan, planMaster, planTrack, panTargets, rampSecs, ease };
})();
