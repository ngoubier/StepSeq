/*
 * Développer un motif (onglet Mélodie de l'assistant Nouvelle chanson, js/band.js) :
 *
 *   motif(notes, bar, bars)      les notes d'un motif de `bars` mesures (2 par défaut), ramenées au début
 *   continuations(notes, opts)   quatre suites du motif pour finir une phrase (séquence, réponse, variation rythmique,
 *                                augmentation), sur une forme de phrase (FORMS), répétée sur toute la scène
 *   contrast(notes, opts)        trois mélodies pour une autre scène à partir du même motif (plus haut et plus long,
 *                                renversé, plus serré)
 *
 * notes : [{ step, len, midi, vel }] (une note par attaque, la plus haute) ; un pas = une double-croche, 16 par mesure.
 * opts : { pcs (gamme : classes de notes depuis la tonique), chordAt(step) → [classes de notes] | null, bars (longueur
 *          de la scène), bar (première mesure du motif), form }.
 * Chaque proposition : { id, title, why, events: [{ step, len, notes: [midi], vel }], motif: [début, fin] en pas }.
 * Fonctions pures (aucun DOM) : tests/develop.test.js.
 */
window.SS = window.SS || {};

SS.develop = (() => {
  // mesure de la chanson (js/bandsong.js setMeter) : 16 pas en 4/4, 12 en 3/4 et 6/8, 24 en 12/8
  let SPB = 16;
  let SEG = 2 * SPB; // un segment de phrase = 2 mesures
  const setMeter = (spb) => ((SPB = spb || 16), (SEG = 2 * SPB));
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const clamp = (m) => Math.max(36, Math.min(96, m));

  const FORMS = [
    { id: 'aaba', label: 'A A’ B A', text: 'le motif, sa suite, un contraste, le motif qui conclut' },
    { id: 'abac', label: 'A B A C', text: 'le motif revient entre deux idées, la dernière conclut' },
    { id: 'qa', label: 'Question / réponse', text: 'deux fois : le motif pose une question, la suite y répond' },
  ];

  /* ---------- degrés ---------- */
  function toDeg(m, pcs) {
    const t = pcs[0];
    const rel = m - t;
    const oct = Math.floor(rel / 12);
    const within = rel - oct * 12;
    const ivs = pcs.map((pc) => pcOf(pc - t));
    let deg = 0;
    for (let i = 0; i < 7; i++) if (ivs[i] <= within) deg = i;
    return { idx: oct * 7 + deg, off: within - ivs[deg] };
  }
  function fromDeg(idx, off, pcs) {
    const t = pcs[0];
    const ivs = pcs.map((pc) => pcOf(pc - t));
    const oct = Math.floor(idx / 7);
    return t + oct * 12 + ivs[idx - oct * 7] + off;
  }
  const shift = (m, d, pcs) => {
    const x = toDeg(m, pcs);
    return clamp(fromDeg(x.idx + d, x.off, pcs));
  };
  /** La note de classe `pc` la plus proche de `m`. */
  const nearestPc = (m, pc) => {
    const b = m - pcOf(m - pc);
    return m - b <= 6 ? b : b + 12;
  };

  /* ---------- motif ---------- */
  function motif(notes, bar = 0, bars = 2) {
    const a = bar * SPB;
    const b = a + bars * SPB;
    return notes
      .filter((n) => n.step >= a && n.step < b)
      .map((n) => ({ step: n.step - a, len: Math.max(1, Math.min(n.len, b - n.step)), midi: n.midi, vel: n.vel ?? 0.8 }));
  }
  /** Mesures (paires) où un motif de 2 mesures a au moins deux notes. */
  function motifBars(notes, bars) {
    const out = [];
    for (let b = 0; b + 2 <= bars; b += 2) if (motif(notes, b).length >= 2) out.push(b);
    return out;
  }

  /* ---------- transformations d'un segment (pas relatifs, 0..SEG) ---------- */
  const copy = (M) => M.map((n) => ({ ...n }));
  const seq = (M, d, pcs) => M.map((n) => ({ ...n, midi: shift(n.midi, d, pcs) }));
  /** Miroir diatonique autour de la première note. */
  function invert(M, pcs) {
    const a = toDeg(M[0].midi, pcs).idx;
    return M.map((n) => {
      const x = toDeg(n.midi, pcs);
      return { ...n, midi: clamp(fromDeg(2 * a - x.idx, 0, pcs)) };
    });
  }
  /** Même rythme ; la fin descend par degrés conjoints vers la tonique (cadence), la dernière note est tenue. */
  function answer(M, pcs) {
    const out = copy(M);
    close(out, pcs, 0);
    return out;
  }
  /** Mêmes notes, autre rythme : les notes des 2e et 4e temps sont anticipées d'une croche (syncope). */
  function syncopate(M) {
    const out = copy(M);
    let n = 0;
    for (let i = 1; i < out.length; i++) {
      const x = out[i];
      const prev = out[i - 1];
      if ((x.step % SPB === 4 || x.step % SPB === 12) && x.step - 2 > prev.step) {
        x.step -= 2;
        x.len += 2;
        prev.len = Math.min(prev.len, x.step - prev.step);
        n++;
      }
    }
    if (!n) {
      // pas de note sur les temps 2 et 4 : rythme pointé (la première note s'allonge, la deuxième arrive une croche plus tard)
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i];
        const b = out[i + 1];
        const nx = out[i + 2] ? out[i + 2].step : SEG;
        if (b.step + 2 < nx && b.step % 4 === 0) {
          b.step += 2;
          b.len = Math.max(1, Math.min(b.len, nx - b.step));
          a.len = b.step - a.step;
          n++;
          i++;
        }
      }
    }
    return out;
  }
  /** Durées doublées : la première mesure du motif occupe les deux mesures. */
  function augment(M) {
    return M.filter((n) => n.step < SPB).map((n) => ({ ...n, step: n.step * 2, len: Math.min(n.len * 2, SEG - n.step * 2) }));
  }
  /** Durées divisées par deux : le motif tient en une mesure, joué deux fois (la reprise un degré plus haut). */
  function diminish(M, pcs) {
    const half = M.map((n) => ({ ...n, step: Math.floor(n.step / 2), len: Math.max(1, Math.round(n.len / 2)) }));
    return [...half, ...seq(half, 1, pcs).map((n) => ({ ...n, step: n.step + SPB }))];
  }
  /**
   * Fin de phrase : la dernière note va sur la tonique (deg 0) ou la dominante (deg 4, cadence suspendue), la
   * précédente un degré au-dessus si elle en est loin, et la dernière tient jusqu'à une croche de la fin.
   */
  function close(M, pcs, deg) {
    if (!M.length) return M;
    const last = M[M.length - 1];
    last.midi = clamp(nearestPc(last.midi, pcs[deg]));
    if (M.length > 1) {
      const p = M[M.length - 2];
      if (Math.abs(p.midi - last.midi) > 4) p.midi = clamp(fromDeg(toDeg(last.midi, pcs).idx + 1, 0, pcs));
    }
    last.len = Math.max(last.len, SEG - 2 - last.step);
    return M;
  }
  /** Les notes longues sur un temps vont sur la note de l'accord la plus proche (2 demi-tons au plus). */
  function fit(M, at, chordAt) {
    if (!chordAt) return M;
    return M.map((n) => {
      const pcsC = chordAt(at + n.step);
      if (!pcsC || !pcsC.length || n.step % 4 || n.len < 4 || pcsC.includes(pcOf(n.midi))) return n;
      let best = n.midi;
      for (const d of [1, -1, 2, -2]) if (pcsC.includes(pcOf(n.midi + d))) return { ...n, midi: n.midi + d };
      return { ...n, midi: best };
    });
  }

  /* ---------- phrases ---------- */
  const TECH = {
    sequence: { title: 'Séquence', why: 'Le même dessin, un degré plus bas : l’oreille reconnaît le motif et sent qu’on avance.', make: (M, pcs) => seq(M, -1, pcs) },
    answer: { title: 'Réponse', why: 'Même rythme, la fin redescend sur la tonique : le motif posait une question, la réponse la ferme.', make: (M, pcs) => answer(M, pcs) },
    rhythm: { title: 'Variation rythmique', why: 'Mêmes notes, autre rythme (syncope sur les temps faibles) : le motif reste, l’énergie change.', make: (M) => syncopate(M) },
    augment: { title: 'Augmentation', why: 'Durées doublées : le motif devient une ligne large, idéale avant un refrain.', make: (M) => augment(M) },
  };
  /** Segments de la phrase pour une forme et une technique (2 mesures chacun) : [{ notes, part }]. */
  function plan(M, form, T, pcs, nSeg) {
    const A = () => copy(M);
    const A2 = () => T.make(M, pcs);
    const B = () => seq(invert(M, pcs), 2, pcs);
    if (nSeg < 4) return [{ notes: A(), part: 'motif' }, { notes: close(A2(), pcs, 0), part: 'suite' }];
    if (form === 'abac') return [{ notes: A(), part: 'motif' }, { notes: B(), part: 'contraste' }, { notes: A(), part: 'motif' }, { notes: close(A2(), pcs, 0), part: 'suite' }];
    if (form === 'qa') return [{ notes: A(), part: 'motif' }, { notes: close(A2(), pcs, 4), part: 'suite' }, { notes: A(), part: 'motif' }, { notes: close(A2(), pcs, 0), part: 'suite' }];
    return [{ notes: A(), part: 'motif' }, { notes: A2(), part: 'suite' }, { notes: B(), part: 'contraste' }, { notes: close(A(), pcs, 0), part: 'motif' }];
  }
  /** Les segments posés bout à bout, la phrase répétée jusqu'à remplir la scène. */
  function lay(segs, total, chordAt, keepFirst) {
    const ev = [];
    for (let at = 0, i = 0; at + SEG <= total; at += SEG, i++) {
      const s = segs[i % segs.length];
      const notes = keepFirst && s.part === 'motif' && i % segs.length === 0 ? s.notes : fit(s.notes, at, chordAt);
      for (const n of notes) if (n.step < SEG) ev.push({ step: at + n.step, len: Math.max(1, Math.min(n.len, SEG - n.step)), notes: [n.midi], vel: n.vel ?? 0.8 });
    }
    return ev;
  }

  function continuations(notes, { pcs, chordAt = null, bars, bar = 0, form = 'aaba' } = {}) {
    const M = motif(notes, bar);
    if (M.length < 2 || !pcs || bars < 4) return [];
    const nSeg = bars >= 8 ? 4 : 2;
    const total = Math.floor(bars / 2) * SEG;
    const f = FORMS.find((x) => x.id === form) || FORMS[0];
    return Object.entries(TECH).map(([id, T]) => {
      const segs = plan(M, f.id, T, pcs, nSeg);
      return { id, title: T.title, why: T.why, form: nSeg < 4 ? null : f.id, parts: segs.map((s) => s.part), events: lay(segs, total, chordAt, true), motif: [0, SEG] };
    });
  }

  /** Le motif dans une autre tonalité : chaque note garde son degré. */
  function moveKey(M, from, to) {
    if (!from || !to || from.join() === to.join()) return copy(M);
    return M.map((n) => {
      const x = toDeg(n.midi, from);
      return { ...n, midi: clamp(fromDeg(x.idx, x.off, to)) };
    });
  }
  const CONTRAST = {
    high: {
      title: 'Plus haut, notes longues',
      why: 'Le motif monte d’une tierce et ses durées doublent : la scène s’ouvre, on la reconnaît sans qu’elle répète.',
      segs: (M, pcs) => {
        const up = seq(M, 2, pcs);
        const second = up.filter((n) => n.step >= SPB).map((n) => ({ ...n, step: n.step - SPB }));
        return [augment(up), augment(second.length >= 2 ? second : up)];
      },
    },
    invert: {
      title: 'Le motif renversé',
      why: 'Là où le motif montait, la ligne descend : même rythme, dessin opposé, un contraste net mais de la même famille.',
      segs: (M, pcs) => {
        const I = seq(invert(M, pcs), 4, pcs);
        return [I, seq(I, -1, pcs)];
      },
    },
    dense: {
      title: 'Rythme serré',
      why: 'Le motif deux fois plus rapide, repris un degré plus haut : plus d’énergie, la scène pousse vers l’avant.',
      segs: (M, pcs) => {
        const D = diminish(seq(M, 2, pcs), pcs);
        return [D, syncopate(seq(D, -1, pcs))];
      },
    },
  };
  /** opts : { pcs (tonalité du motif), toPcs (tonalité de la scène visée), chordAt (de la scène visée), bars (de la scène visée), bar }. */
  function contrast(notes, { pcs, toPcs = pcs, chordAt = null, bars, bar = 0 } = {}) {
    const M0 = motif(notes, bar);
    if (M0.length < 2 || !pcs || bars < 2) return [];
    const M = moveKey(M0, pcs, toPcs);
    const total = Math.floor(bars / 2) * SEG;
    return Object.entries(CONTRAST).map(([id, C]) => {
      const [a, b] = C.segs(M, toPcs).map((x) => x.filter((n) => n.step < SEG));
      const n = Math.max(1, total / SEG);
      const segs = Array.from({ length: n }, (_, i) => ({ notes: i === n - 1 ? close(copy(i % 2 ? b : a), toPcs, 0) : copy(i % 2 ? b : a), part: 'contraste' }));
      return { id, title: C.title, why: C.why, events: lay(segs, total, chordAt, false), motif: null };
    });
  }

  return { setMeter, FORMS, motif, motifBars, continuations, contrast, _t: { seq, invert, answer, syncopate, augment, diminish, close, fit, toDeg, fromDeg } };
})();
