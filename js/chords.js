/*
 * Piste Accords de la scène et modes de jeu des pistes instrument.
 *
 * Chaque scène peut porter une grille d'accords (scene.grid.chords, voir SS.normalizeGrid) : des accords rangés
 * par degré dans la tonalité de la scène, avec leur position et leur durée en pas. Elle s'affiche en haut des
 * pistes (« piste Accords ») et dans l'assistant Nouvelle chanson.
 *
 * Une piste instrument a deux interrupteurs indépendants :
 *   track.arpOn  : true → ses notes passent par Arp One (js/arp.js) ;
 *   track.follow : null, ou { play, notes, oct, voicing, near, tie } → elle joue les accords de la scène
 *                  au lieu de ses propres notes :
 *     play    : 'hold'  (chaque accord tenu sur toute sa durée)
 *               'steps' (les notes de la piste donnent le rythme, l'accord du moment donne les hauteurs)
 *     notes   : 'chord' | 'root' (fondamentale seule) | 'noroot' (sans fondamentale) | 'bass' (basse + accord)
 *     oct     : octave de départ (3 → do3 = 48)
 *     voicing : 'close' (serré) | 'open' (ouvert) | 'drop2'
 *     near    : enchaîner au plus proche (le renversement qui bouge le moins)
 *     tie     : en jeu tenu, une note commune à deux accords qui se suivent n'est pas rejouée
 *
 * SS.playEvents(project, track) donne les événements que la piste joue réellement, au format de track.events :
 * c'est ce que lisent la lecture (js/audio.js) et l'export MIDI (js/midi.js).
 */
window.SS = window.SS || {};

(() => {
  const cleanFollow = (f) => SS.FOLLOW.clean(f);
  const FOLLOW_DEFAULTS = SS.FOLLOW.DEFAULTS;
  const isInst = (t) => !!t && t.type === 'instrument';

  /* ---------------- Accords de la scène ---------------- */

  const pcOf = (m) => ((m % 12) + 12) % 12;

  /** Grille d'accords de la scène `sc` (scène en cours par défaut), triée et bornée à la durée de la scène. */
  SS.sceneGridChords = (p, sc) => {
    sc = sc || (p.scenes && p.scenes.length ? SS.currentScene(p) : null);
    const key = sc && SS.harmony && SS.harmony.valid(sc.key) ? sc.key : null;
    if (!sc || !key || !sc.grid || !sc.grid.chords || !sc.grid.chords.length) return [];
    const total = SS.stepsPerBar(p) * (sc.id === p.current ? p.bars : sc.bars || p.bars);
    return [...sc.grid.chords]
      .filter((c) => c.step < total)
      .sort((a, b) => a.step - b.step)
      .map((c) => ({ ...c, len: Math.max(1, Math.min(c.len, total - c.step)), info: SS.chordInfoAt(key, sc.grid, c) }));
  };

  /** Pédale de la grille qui couvre le pas `step` (ou null). */
  SS.pedalAt = (g, step) => ((g && g.pedals) || []).find((x) => step >= x.step && step < x.step + x.len) || null;
  /** Classe de note d'une pédale dans la tonalité `key`. */
  SS.pedalPc = (key, ped) => pcOf(SS.harmony.scale(key)[0].pc + ped.semi);

  /**
   * Accord de grille → informations (nom, notes…) ; sous une pédale, la note de la pédale devient la basse
   * (Dm sur une pédale de La → Dm/A) et `pedalPc` est renseigné.
   */
  SS.chordInfoAt = (key, g, c) => {
    const ped = SS.pedalAt(g, c.step);
    if (!ped) return SS.harmony.gridChord(key, c.degree, c.type, c.acc, c.bass || 0);
    const pc = SS.pedalPc(key, ped);
    const root = SS.harmony.gridChord(key, c.degree, c.type, c.acc, 0).rootPc;
    return { ...SS.harmony.gridChord(key, c.degree, c.type, c.acc, pcOf(pc - root)), pedalPc: pc };
  };

  /** Notes de l'accord en position fondamentale, la fondamentale à l'octave `oct` (do`oct` = 12·(oct+1)). */
  function rootPosition(info, oct) {
    const root = 12 * (oct + 1) + info.rootPc;
    return SS.chordNotes(root, info.type);
  }

  // renversements de l'accord, chacun décalé d'une octave en dessous / au-dessus
  function candidates(notes) {
    const out = [];
    let cur = [...notes];
    for (let i = 0; i < notes.length; i++) {
      for (const d of [-12, 0, 12]) out.push(cur.map((m) => m + d));
      cur = [...cur.slice(1), cur[0] + 12];
    }
    return out;
  }
  const distance = (a, b) => a.reduce((s, m) => s + Math.min(...b.map((x) => Math.abs(x - m))), 0) + b.reduce((s, m) => s + Math.min(...a.map((x) => Math.abs(x - m))), 0);

  function applyVoicing(notes, voicing) {
    const s = [...notes].sort((a, b) => a - b);
    if (s.length < 3) return s;
    if (voicing === 'open') s[1] += 12;
    else if (voicing === 'drop2') s[s.length - 2] -= 12;
    return s.sort((a, b) => a - b);
  }

  /**
   * Notes de chaque accord de la grille pour une piste : renversement le plus proche du précédent (si `near`),
   * voicing, choix des notes. → [{ step, len, notes, name }]
   */
  SS.voiceChords = (chords, f) => {
    f = cleanFollow(f) || { ...FOLLOW_DEFAULTS };
    const center = 12 * (f.oct + 1) + 6;
    let prev = null;
    return chords.map((c) => {
      const info = c.info;
      if (info.pedalPc != null) {
        // pédale : la même note grave sous chaque accord, les autres notes de l'accord dans l'octave au-dessus
        const P = 12 * (f.oct + 1) + info.pedalPc;
        const pcs = [...new Set(rootPosition(info, f.oct).map(pcOf))].filter((pc) => pc !== info.pedalPc);
        let ups = pcs.map((pc) => P + (pcOf(pc - info.pedalPc) || 12)).sort((a, b) => a - b);
        if (f.notes === 'noroot' && info.rootPc !== info.pedalPc) ups = ups.filter((m) => pcOf(m) !== info.rootPc);
        let notes = f.notes === 'root' ? [P] : f.notes === 'bass' ? [P - 12, ...ups] : [P, ...ups];
        notes = notes.map((m) => Math.max(12, Math.min(119, m)));
        prev = notes;
        return { step: c.step, len: c.len, notes, name: info.name };
      }
      const base = rootPosition(info, f.oct);
      let notes = base;
      if (f.near && prev) {
        let best = null;
        for (const cand of candidates(base)) {
          const mean = cand.reduce((a, b) => a + b, 0) / cand.length;
          const cost = distance(cand, prev) + Math.abs(mean - center) * 0.5; // reste près du registre choisi
          if (!best || cost < best.cost) best = { cand, cost };
        }
        notes = best.cand;
      }
      prev = notes;
      notes = applyVoicing(notes, f.voicing);
      const bassPc = info.bassPc != null ? info.bassPc : info.rootPc;
      const low = Math.min(...notes);
      const below = (pc) => low - (pcOf(low - pc) || 12); // la note `pc` juste sous l'accord
      if (f.notes === 'root') notes = [12 * (f.oct + 1) + bassPc];
      else if (f.notes === 'noroot') {
        const rest = notes.filter((m) => pcOf(m) !== info.rootPc);
        notes = rest.length ? rest : notes;
      } else if (f.notes === 'bass') notes = [below(bassPc) - 12, ...notes];
      else if (info.bassPc != null && info.bassPc !== info.rootPc) {
        // basse imposée : si elle fait déjà partie de l'accord, c'est un renversement (Dm/A = La Ré Fa, sans La doublé)
        const rest = notes.filter((m) => pcOf(m) !== info.bassPc);
        notes = [below(info.bassPc), ...(rest.length >= 2 ? rest : notes)];
      }
      notes = notes.map((m) => Math.max(12, Math.min(119, m)));
      // bassPc : basse imposée (C/E), pour le mode Guitare d'Arp One (js/guitar-arp.js)
      return { step: c.step, len: c.len, notes: [...new Set(notes)].sort((a, b) => a - b), name: info.name, ...(info.bassPc != null && info.bassPc !== info.rootPc ? { bassPc: info.bassPc } : {}) };
    });
  };

  /**
   * Jeu tenu : une note par note d'accord ; une note commune à deux accords qui se suivent est prolongée au lieu
   * d'être rejouée (`tie`).
   */
  function holdEvents(voiced, tie, vel = 0.7) {
    const out = [];
    let open = new Map(); // note → événement en cours
    for (const v of voiced) {
      const next = new Map();
      for (const m of v.notes) {
        const ev = open.get(m);
        if (tie && ev && ev.step + ev.len === v.step) {
          ev.len += v.len;
          next.set(m, ev);
        } else {
          const e = { step: v.step, len: v.len, notes: [m], vel };
          out.push(e);
          next.set(m, e);
        }
      }
      open = next;
    }
    return out.sort((a, b) => a.step - b.step || a.notes[0] - b.notes[0]);
  }

  /** Jeu « sur mes pas » : chaque note de la piste joue l'accord en cours à son départ (une attaque par pas). */
  function stepEvents(voiced, events) {
    const byStep = new Map();
    for (const ev of events) {
      const cur = byStep.get(ev.step);
      if (!cur || ev.len > cur.len) byStep.set(ev.step, ev);
    }
    const out = [];
    for (const ev of [...byStep.values()].sort((a, b) => a.step - b.step)) {
      const v = voiced.find((c) => ev.step >= c.step && ev.step < c.step + c.len);
      if (!v) continue;
      const e = { ...ev, notes: [...v.notes] };
      delete e.chord;
      delete e.lyric;
      out.push(e);
    }
    return out;
  }

  /**
   * Notes tenues en même temps → un accord par tranche de temps (pour l'arpégiateur) : une piste écrite note par
   * note s'arpège comme si on tenait ces notes au clavier. La tranche s'arrête dès qu'une note commence ou finit.
   */
  SS.heldChords = (events) => {
    if (!events.length) return [];
    if (events.every((e, i) => i === 0 || e.step >= events[i - 1].step + events[i - 1].len) && events.every((e, i) => i === 0 || events[i - 1].step <= e.step)) return events; // déjà une suite d'accords
    const cuts = [...new Set(events.flatMap((e) => [e.step, e.step + e.len]))].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      const on = events.filter((e) => e.step <= a && e.step + e.len > a);
      if (!on.length) continue;
      const starting = on.filter((e) => e.step === a);
      const first = starting[0] || on[0];
      const seg = { step: a, len: b - a, notes: [...new Set(on.flatMap((e) => e.notes))].sort((x, y) => x - y), vel: Math.max(...on.map((e) => e.vel)) };
      if (first.cond) seg.cond = first.cond;
      if (starting.some((e) => e.acc)) seg.acc = true;
      // tranche qui prolonge exactement la précédente (aucune note ne commence) : l'arpège continue
      const prev = out[out.length - 1];
      if (prev && !starting.length && prev.step + prev.len === a && prev.notes.join() === seg.notes.join()) prev.len += seg.len;
      else out.push(seg);
    }
    return out;
  };

  // petit cache : la lecture demande les événements de chaque piste à chaque pas
  const cache = new WeakMap();
  const sig = (x) => JSON.stringify(x);

  /**
   * Événements joués par une piste instrument :
   *   - piste normale : ses notes ;
   *   - suit les accords, sans arpège : accords tenus ou rythmés par ses notes ;
   *   - arpège : une suite d'accords pour Arp One (les accords de la scène, ou les notes tenues de la piste).
   * `opts.events` / `opts.scene` : notes et scène à utiliser (export MIDI), sinon celles de la scène en cours.
   */
  SS.playEvents = (p, track, opts = {}) => {
    const events = opts.events || track.events || [];
    if (!isInst(track)) return events;
    const arp = !!track.arpOn;
    if (!track.follow) return arp ? SS.heldChords(events) : events;
    const chords = SS.sceneGridChords(p, opts.scene);
    const f = cleanFollow(track.follow);
    if (f.play === 'motif') return motifCached(p, track, f, chords, opts.scene);
    const key = sig([arp, f, chords.map((c) => [c.step, c.len, c.info.name, c.info.rootPc, c.info.type, c.info.pedalPc]), f.play === 'steps' && !arp ? events.map((e) => [e.step, e.len, e.vel, e.acc, e.cond, e.rat, e.shift]) : 0]);
    const hit = cache.get(track);
    if (hit && hit.key === key) return hit.out;
    let out;
    if (arp) out = SS.voiceChords(chords, { ...f, notes: f.notes === 'root' ? 'chord' : f.notes }).map((v) => ({ step: v.step, len: v.len, notes: v.notes, vel: 0.8, ...(v.bassPc != null ? { bass: v.bassPc } : {}) }));
    else {
      const voiced = SS.voiceChords(chords, f);
      out = f.play === 'steps' ? stepEvents(voiced, events) : holdEvents(voiced, f.tie);
    }
    cache.set(track, { key, out });
    return out;
  };

  /* ---------------- Motif de basse ---------------- */

  /** Motif de la piste dans la scène `sc` : celui de la scène s'il en a un, sinon celui de la piste. */
  SS.bassMotifOf = (track, sc) => {
    const f = track && (track.follow || track.lastFollow);
    if (!f || f.play !== 'motif') return null;
    return (sc && f.motifs && f.motifs[sc.id]) || f.motif;
  };

  /**
   * Notes d'un motif de basse sur les accords de la scène : le moteur de Nouvelle chanson (js/bandsong.js,
   * bassEvents : approches, notes fantômes, octaves, anticipations), joué sur la piste Accords de la Grille.
   */
  function motifEvents(p, track, f, chords, sc) {
    const BS = SS.bandSong;
    sc = sc || SS.currentScene(p);
    if (!BS || !chords.length || !sc) return [];
    const key = sc.key;
    const total = SS.stepsPerBar(p) * (sc.id === p.current ? p.bars : sc.bars || p.bars);
    // les accords couvrent toute la scène : le premier part du début, chacun dure jusqu'au suivant (comme spansFromGrid)
    const spans = chords.map((c, i) => {
      const step = i === 0 ? 0 : c.step;
      const end = chords[i + 1] ? chords[i + 1].step : total;
      const bassPc = c.info.pedalPc ?? c.info.bassPc;
      return { step, len: end - step, bar: Math.floor(step / SS.stepsPerBar(p)), chord: { rootPc: c.info.rootPc, type: c.info.type || c.type, tok: c.info.name, ...(bassPc != null ? { bassPc } : {}) } };
    }).filter((x) => x.len > 0);
    const keyPcs = SS.harmony.scale(key).map((d) => d.pc);
    const mode = SS.bassMotifOf({ follow: f }, sc);
    const r = BS._rng(`${track.id}|${sc.id}|${mode}`);
    try {
      return BS.bassEvents(spans, mode, r, keyPcs, { shift: (f.oct - 2) * 12, spb: SS.stepsPerBar(p), beat: BS.beatOf ? BS.beatOf(p.timeSig) : 4 }).filter((e) => e.step < total);
    } catch (e) {
      return [];
    }
  }
  function motifCached(p, track, f, chords, sc) {
    sc = sc || SS.currentScene(p);
    const key = sig(['motif', f, sc && sc.id, sc && sc.key, p.bars, chords.map((c) => [c.step, c.len, c.info.rootPc, c.info.type, c.info.bassPc, c.info.pedalPc])]);
    const hit = cache.get(track);
    if (hit && hit.key === key) return hit.out;
    const out = motifEvents(p, track, f, chords, sc);
    cache.set(track, { key, out });
    return out;
  }

  /** Accords suivis par la piste, pour l'affichage (un bloc par accord) : [{ step, len, notes, name }]. */
  SS.followBlocks = (p, track) => (!SS.follows(track) ? [] : SS.playsMotif(track) ? SS.playEvents(p, track) : SS.voiceChords(SS.sceneGridChords(p), track.follow));

  /** « Convertir en notes » : la piste reprend en notes ce qu'elle joue, et ne suit plus les accords. */
  SS.freezeFollow = (p, track) => {
    if (!SS.follows(track)) return false;
    const evs = SS.playEvents(p, track).map((e) => ({ ...e, notes: [...e.notes] }));
    // l'arpège garde des accords (une note empilée par note) : Arp One les arpège comme avant
    track.events = SS.arpOn(track) ? evs.flatMap((e) => e.notes.map((m) => ({ step: e.step, len: e.len, notes: [m], vel: e.vel }))) : evs;
    delete track.follow;
    return true;
  };

  /* ---------------- Édition de la grille (piste Accords) ---------------- */

  /** Grille de la scène, créée vide si besoin. */
  SS.sceneGrid = (sc) => {
    if (!sc.grid) sc.grid = SS.normalizeGrid({ chords: [], initialized: true });
    return sc.grid;
  };

  /** Pose un accord : il remplace ce qu'il recouvre (un accord coupé en deux garde ses deux bouts). */
  SS.gridPut = (g, chord) => SS.harmony.gridPut(g.chords, chord);

})();
