/*
 * Transformations mélodiques d'une sélection de notes (piano roll, ligne d'une piste instrument) :
 *   - invert     : miroir des hauteurs autour de la première note (dans la gamme de la scène si elle est connue) ;
 *   - retrograde : la phrase jouée à l'envers (de la fin vers le début), durées gardées ;
 *   - stretch    : durées et écarts ×2 (deux fois plus lent) ou ×½ (deux fois plus vite), depuis le début de la
 *                  sélection ;
 *   - mode       : même tonique, autre mode (Do majeur → Do mineur…) : chaque note garde son degré.
 *
 * Fonctions pures : SS.transform.run(track, selected, op, { key, n }) renvoie une nouvelle liste d'événements
 * (copies), les événements transformés et le nombre de notes perdues (hors de la boucle, ou collision). Les notes
 * non sélectionnées que les notes transformées recouvrent sont retirées ou raccourcies, comme au collage.
 *
 * Accords et arpèges : l'inversion et le changement de mode déplacent tout l'accord d'un même nombre de degrés
 * (l'accord reste dans la gamme : Do → Rém) ; le type d'accord (ev.chord) suit s'il est reconnu.
 */
window.SS = window.SS || {};

SS.transform = (() => {
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const clampMidi = (m) => Math.max(12, Math.min(119, m));

  /** Gamme de la tonalité : classes de notes en partant de la tonique (7 degrés), ou la gamme chromatique. */
  function scaleOf(key) {
    if (key && SS.harmony && SS.harmony.valid(key)) return SS.harmony.scale(key).map((d) => d.pc);
    return null;
  }
  /**
   * Position diatonique d'une note : { idx, off } — idx = octave × 7 + degré (degré juste en dessous pour une note
   * hors de la gamme), off = demi-tons au-dessus de ce degré (0 pour une note de la gamme).
   */
  function toDeg(m, pcs) {
    const tonic = pcs[0];
    const rel = m - tonic;
    const oct = Math.floor(rel / 12);
    const within = rel - oct * 12; // 0..11 au-dessus de la tonique
    const ivs = pcs.map((pc) => pcOf(pc - tonic));
    let deg = 0;
    for (let i = 0; i < 7; i++) if (ivs[i] <= within) deg = i;
    return { idx: oct * 7 + deg, off: within - ivs[deg] };
  }
  function fromDeg(idx, off, pcs) {
    const tonic = pcs[0];
    const ivs = pcs.map((pc) => pcOf(pc - tonic));
    const oct = Math.floor(idx / 7);
    const deg = idx - oct * 7;
    return tonic + oct * 12 + ivs[deg] + off;
  }
  /** Type d'accord reconnu pour des notes (fondamentale = la plus grave), ou null. */
  function chordIdOf(notes) {
    if (!SS.CHORDS || notes.length < 2) return null;
    const root = Math.min(...notes);
    const iv = notes.map((m) => m - root).sort((a, b) => a - b).join(',');
    const c = SS.CHORDS.find((x) => x.iv.slice().sort((a, b) => a - b).join(',') === iv);
    return c ? c.id : null;
  }

  /** Décale toutes les notes d'un événement d'un même nombre de degrés (dans la gamme) ou de demi-tons. */
  function moveBy(notes, deg, pcs, semis) {
    if (!pcs) return notes.map((m) => clampMidi(m + semis));
    return notes.map((m) => {
      const d = toDeg(m, pcs);
      return clampMidi(fromDeg(d.idx + deg, d.off, pcs));
    });
  }

  /** Miroir des hauteurs autour de l'axe `axis` (MIDI). */
  function invertEvents(evs, pcs, axis, mono) {
    const a = pcs ? toDeg(axis, pcs) : null;
    return evs.map((ev) => {
      if (mono || ev.notes.length === 1) {
        const notes = ev.notes.map((m) => {
          if (!pcs) return clampMidi(2 * axis - m);
          const d = toDeg(m, pcs);
          // une note hors de la gamme (degré + off) devient, en miroir, le degré miroir moins off
          return clampMidi(fromDeg(2 * a.idx - d.idx, 0, pcs) - d.off);
        });
        return { ...ev, notes };
      }
      // accord : la fondamentale suit le miroir, l'accord entier se déplace dans la gamme
      const root = ev.notes[0];
      if (!pcs) return { ...ev, notes: moveBy(ev.notes, 0, null, 2 * axis - 2 * root) };
      const d = toDeg(root, pcs);
      return { ...ev, notes: moveBy(ev.notes, 2 * a.idx - 2 * d.idx, pcs) };
    });
  }

  /** Même tonique, autre mode : chaque note garde son degré (et son écart pour une note hors de la gamme). */
  function modeEvents(evs, key, toMode) {
    const from = scaleOf(key);
    const to = scaleOf({ ...key, mode: toMode });
    if (!from || !to) return null;
    return evs.map((ev) => ({
      ...ev,
      notes: ev.notes.map((m) => {
        const d = toDeg(m, from);
        return clampMidi(fromDeg(d.idx, d.off, to));
      }),
    }));
  }

  /** Bornes de la sélection : [début, fin) en pas. */
  const bounds = (evs) => [Math.min(...evs.map((e) => e.step)), Math.max(...evs.map((e) => e.step + e.len))];

  function retroEvents(evs) {
    const [from, to] = bounds(evs);
    return evs.map((ev) => {
      const out = { ...ev, step: from + (to - (ev.step + ev.len)) };
      if (ev.shift) out.shift = -ev.shift; // une note en avance devient en retard, comme la phrase à l'envers
      return out;
    });
  }

  function stretchEvents(evs, factor) {
    const [from] = bounds(evs);
    return evs.map((ev) => {
      const step = from + Math.floor((ev.step - from) * factor);
      const len = Math.max(1, Math.round(ev.len * factor));
      return { ...ev, step, len };
    });
  }

  const sharesVoice = (track, a, b) => a.notes.some((m) => b.notes.includes(m));

  /**
   * Applique `op` aux événements `selected` de la piste.
   *   op : { kind: 'invert' } | { kind: 'retrograde' } | { kind: 'stretch', factor: 2 | 0.5 } | { kind: 'mode', mode }
   *   ctx : { key (tonalité de la scène ou null), n (longueur de la boucle de la piste, en pas) }
   * Renvoie { events, changed, dropped } ou null si l'opération est impossible (mode sans tonalité).
   */
  function run(track, selected, op, ctx = {}) {
    const sel = (track.events || []).filter((ev) => selected.includes(ev));
    if (!sel.length) return null;
    const ordered = sel.slice().sort((a, b) => a.step - b.step || a.notes[0] - b.notes[0]);
    const pcs = scaleOf(ctx.key);
    const mono = sel.every((ev) => ev.notes.length === 1); // notes seules (pas d'accords empilés)
    let out;
    if (op.kind === 'invert') out = invertEvents(ordered, pcs, ordered[0].notes[0], mono);
    else if (op.kind === 'retrograde') out = retroEvents(ordered);
    else if (op.kind === 'stretch') out = stretchEvents(ordered, op.factor);
    else if (op.kind === 'mode') out = modeEvents(ordered, ctx.key, op.mode);
    if (!out) return null;

    const n = ctx.n || Infinity;
    let dropped = 0;
    const changed = [];
    for (const ev of out) {
      if (ev.step >= n) {
        dropped++;
        continue;
      }
      ev.len = Math.min(ev.len, n - ev.step);
      ev.notes = mono ? [ev.notes[0]] : ev.notes;
      if (!mono) {
        const id = chordIdOf(ev.notes);
        if (id) ev.chord = id;
        else delete ev.chord;
      }
      // deux notes transformées sur la même voix au même pas (durées ×½) : la première reste
      if (changed.some((o) => o.step === ev.step && sharesVoice(track, o, ev))) {
        dropped++;
        continue;
      }
      changed.push(ev);
    }
    // les autres notes de la piste : retirées si une note transformée commence sur elles, raccourcies si elles
    // débordent sur une note transformée
    let others = (track.events || []).filter((ev) => !selected.includes(ev)).map((ev) => ({ ...ev }));
    for (const ev of changed) {
      others = others.filter((o) => !(sharesVoice(track, ev, o) && o.step >= ev.step && o.step < ev.step + ev.len));
      others.forEach((o) => {
        if (sharesVoice(track, ev, o) && o.step < ev.step && o.step + o.len > ev.step) o.len = ev.step - o.step;
      });
    }
    // les notes transformées ne se chevauchent pas entre elles sur une même voix
    changed.sort((a, b) => a.step - b.step);
    changed.forEach((ev, i) => {
      const next = changed.slice(i + 1).find((o) => sharesVoice(track, ev, o));
      if (next && ev.step + ev.len > next.step) ev.len = Math.max(1, next.step - ev.step);
    });
    const events = others.concat(changed).sort((a, b) => a.step - b.step);
    return { events, changed, dropped };
  }

  return { run, toDeg, fromDeg, chordIdOf };
})();
