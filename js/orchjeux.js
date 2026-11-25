/*
 * Jeux de cordes de l'Orchestre (étape Orchestre de l'assistant Nouvelle chanson).
 *
 *   JEUX / FAMS              les treize jeux, en quatre familles (Tenues, Rythmes, Lignes, Transitions et fins), plus
 *                            « Orchestration » (l'écriture d'orchestre de js/orchestra.js, sans jeu)
 *   stars(sec, ensId)        jeux conseillés (★) pour une scène d'après son nom et l'effectif ; le premier est joué d'office
 *   apply(res, opts)         réécrit les cordes d'une orchestration (js/orchestra.js) avec un jeu : chaque pupitre
 *                            (violons I et II, altos, violoncelles, contrebasses) reçoit un rôle et une façon de jouer
 *                            (archet, pizzicato, spiccato, trémolo) ; bois, cuivres, harpe gardent leur rôle
 *
 * Le jeu choisit le son : une note pincée des violons part sur le pupitre « Violons (pizzicato) » de l'effectif, une note
 * sautillée sur « Violons (spiccato) »… Sans ce pupitre dans l'effectif, la note reste à l'archet (courte pour le
 * pizzicato et le spiccato). Les jeux suivent les accords de la scène ; chaque pupitre bouge le moins possible d'un
 * accord à l'autre et reste dans son registre. Mesures : 4/4, 3/4, 6/8, 12/8 (spb pas par mesure, beat pas par temps).
 * Fonctions pures (aucun DOM) : tests/orchjeux.test.js.
 */
window.SS = window.SS || {};

SS.orchJeux = (() => {
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const FAMS = [['tenues', 'Tenues'], ['rythmes', 'Rythmes'], ['lignes', 'Lignes'], ['fins', 'Transitions et fins']];
  const J = (id, fam, label, text, arts) => ({ id, fam, label, text, arts });
  const JEUX = [
    J('orch', 'tenues', 'Orchestration', 'Une note de l’accord par pupitre, les violons doublent la mélodie quand l’orchestre est plein', ['arco']),
    J('tenues', 'tenues', 'Tenues', 'L’accord tenu, chaque pupitre glisse vers la note la plus proche', ['arco']),
    J('enfle', 'tenues', 'Tenues qui enflent', 'Chaque accord part piano et enfle', ['arco']),
    J('aigues', 'tenues', 'Tenues hautes', 'Les violons montent d’une octave : le refrain s’ouvre', ['arco']),
    J('pizz', 'rythmes', 'Pizzicato', 'Basse sur les temps forts, accords pincés sur les autres, violons en croches', ['pizz']),
    J('spic', 'rythmes', 'Ostinato spiccato', 'Doubles-croches sautillées, accents 3+3+2', ['spic', 'arco']),
    J('coups', 'rythmes', 'Coups', 'Toute la section frappe ensemble, attaques anticipées', ['spic']),
    J('trem', 'rythmes', 'Trémolo', 'Archet tremblé qui enfle : tension, attente', ['trem', 'arco']),
    J('contre', 'lignes', 'Contrechant', 'Les violons I chantent dans les silences de la mélodie, le reste tient doucement', ['arco']),
    J('unisson', 'lignes', 'Unisson', 'Toute la section sur un même riff, en octaves', ['arco']),
    J('arpege', 'lignes', 'Arpège', 'Les altos égrènent l’accord en croches sous les tenues', ['arco', 'pizz']),
    J('montee', 'fins', 'Montée', 'Tenues qui enflent, puis une gamme qui monte sur la dernière mesure', ['arco', 'trem']),
    J('trait', 'fins', 'Trait disco', 'Un trait rapide qui monte toutes les deux mesures', ['arco', 'spic']),
    J('final', 'fins', 'Accord final', 'Accord forte sur la dernière mesure, trémolo qui s’éteint', ['arco', 'trem']),
  ];
  const JEU = Object.fromEntries(JEUX.map((j) => [j.id, j]));
  const ART_LABEL = { arco: 'archet', pizz: 'pizz.', spic: 'spicc.', trem: 'trém.' };

  /** ★ par effectif et type de scène (js/horns.js : intro, verse, pre, chorus, bridge, outro). */
  const STARS = {
    cpop: { intro: ['tenues', 'enfle'], verse: ['pizz', 'tenues'], pre: ['montee', 'enfle'], chorus: ['aigues', 'contre'], bridge: ['montee', 'trem'], outro: ['final'] },
    quatuor: { intro: ['enfle', 'tenues'], verse: ['arpege', 'pizz'], pre: ['enfle', 'montee'], chorus: ['contre', 'aigues'], bridge: ['trem'], outro: ['final'] },
    disco: { intro: ['trait'], verse: ['coups', 'tenues'], pre: ['montee', 'trem'], chorus: ['unisson', 'trait', 'coups'], bridge: ['trem', 'montee'], outro: ['final'] },
    cepique: { intro: ['trem', 'enfle'], verse: ['spic'], pre: ['montee', 'trem'], chorus: ['spic', 'aigues'], bridge: ['montee'], outro: ['final'] },
    pizz: { intro: ['pizz'], verse: ['pizz', 'arpege'], pre: ['pizz', 'montee'], chorus: ['pizz', 'coups'], bridge: ['arpege'], outro: ['final'] },
  };
  // les autres effectifs gardent l'orchestration d'office ; les jeux conseillés viennent après
  const OTHER = { intro: ['enfle'], verse: ['tenues', 'arpege'], pre: ['montee'], chorus: ['aigues', 'contre'], bridge: ['trem'], outro: ['final'] };
  const kindOf = (sec) => (SS.horns ? SS.horns.sceneKind(sec) : 'chorus');
  /** L'effectif a ses propres jeux (les effectifs de cordes) : le premier ★ remplace l'orchestration. */
  const hasJeux = (ensId) => !!STARS[ensId];
  function stars(sec, ensId) {
    const k = kindOf(sec);
    return STARS[ensId] ? STARS[ensId][k].slice() : ['orch', ...OTHER[k]];
  }
  const autoJeu = (sec, ensId) => stars(sec, ensId)[0];

  /* ---------- écriture ---------- */
  const STR = ['vl1', 'vl2', 'va', 'vc', 'cb'];
  // registres des voix (où chaque pupitre tient l'accord) et point de départ
  const VOICE = { vl1: [67, 84, 74], vl2: [60, 77, 67], va: [53, 69, 60], vc: [43, 62, 50], cb: [31, 50, 40] };
  // pupitres d'articulation : où part une note de ce pupitre jouée de cette façon
  const ROUTE = { vl1: { pizz: 'vlp', spic: 'vls', trem: 'vlt' }, vl2: { pizz: 'vlp', spic: 'vls', trem: 'vlt' }, va: { pizz: 'vap' }, vc: { pizz: 'vcp', spic: 'vcs' }, cb: { pizz: 'cbp' } };
  const ARTS = ['vlp', 'vls', 'vlt', 'vap', 'vcp', 'vcs', 'cbp'];

  function nearestPc(pcs, near, lo, hi, avoid = []) {
    let best = null;
    let bd = 1e9;
    for (let m = lo; m <= hi; m++) {
      if (!pcs.includes(pcOf(m))) continue;
      const d = Math.abs(m - near) + (avoid.includes(pcOf(m)) ? 2.5 : 0);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }
  /** Voix de chaque accord : la contrebasse tient la basse, chaque pupitre bouge le moins possible, sans croisement. */
  function voicings(spans, hasCb) {
    const prev = Object.fromEntries(STR.map((id) => [id, VOICE[id][2]]));
    return spans.map((sp) => {
      const pcs = [...new Set(sp.pcs)];
      const root = pcs[0];
      const bass = sp.bassPc ?? root;
      const R = (id) => VOICE[id];
      const v = {};
      v.cb = nearestPc([bass], prev.cb, R('cb')[0], R('cb')[1]);
      v.vc = nearestPc(hasCb ? [root, pcs[2] ?? root] : [bass], prev.vc, R('vc')[0], R('vc')[1]);
      v.va = nearestPc(pcs, prev.va, Math.max(R('va')[0], v.vc + 3), R('va')[1], [root]) ?? nearestPc(pcs, prev.va, R('va')[0], R('va')[1]);
      v.vl2 = nearestPc(pcs, prev.vl2, Math.max(R('vl2')[0], v.va + 2), R('vl2')[1], [pcOf(v.va)]) ?? nearestPc(pcs, prev.vl2, R('vl2')[0], R('vl2')[1]);
      v.vl1 = nearestPc(pcs, prev.vl1, Math.max(R('vl1')[0], v.vl2 + 2), R('vl1')[1], [pcOf(v.vl2), pcOf(v.va)]) ?? nearestPc(pcs, prev.vl1, R('vl1')[0], R('vl1')[1]);
      Object.assign(prev, v);
      return v;
    });
  }
  /** k degrés de la gamme au-dessus (k > 0) ou en dessous de m. */
  function scaleStep(m, k, scale) {
    let x = m;
    const s = Math.sign(k);
    for (let i = 0; i < Math.abs(k); i++) {
      let n = 0;
      do x += s;
      while (!scale.includes(pcOf(x)) && ++n < 12);
    }
    return x;
  }
  const fit = (m, lo, hi) => {
    let x = m;
    while (x > hi) x -= 12;
    while (x < lo) x += 12;
    return x;
  };
  const clampV = (v) => +Math.max(0.12, Math.min(1, v)).toFixed(3);

  /**
   * Écrit les cordes pour un jeu → { parts: { id: { role, events: [{ step, len, m, v, art, cres?, dec? }] } } }
   * (par pupitre principal, avant le partage entre pupitres d'articulation)
   */
  function writeStrings({ jeu, parts, spans, melody = [], level = 'mid', vel = null, spb = 16, beat = 4, scale = null }) {
    const out = {};
    if (!spans.length) return out;
    const total = spans[spans.length - 1].step + spans[spans.length - 1].len;
    const bars = Math.ceil(total / spb);
    const V = voicings(spans, parts.includes('cb'));
    const k0 = (vel ?? { light: 0.5, mid: 0.62, full: 0.74 }[level] ?? 0.62) / 0.7; // un « 0,7 » du jeu = la nuance de la densité
    const sc = scale && scale.length >= 5 ? scale : [...new Set(spans.flatMap((s) => s.pcs))];
    const nBeats = Math.max(1, Math.round(spb / beat));
    const strong = (st) => {
      const bi = Math.floor((st % spb) / beat);
      return nBeats === 3 ? bi === 0 : bi % 2 === 0;
    };
    const L = (id, role) => parts.includes(id) && (out[id] = { role, events: [] });
    const add = (id, step, len, m, v, art = 'arco', x = {}) => {
      if (!out[id] || m == null || step >= total || len <= 0) return null;
      const e = { step, len: Math.min(len, total - step), m, v: clampV(v * k0), art, ...x };
      out[id].events.push(e);
      return e;
    };
    /** Une note tenue par accord ; deux accords qui gardent la note la lient (sauf crescendo). */
    const hold = (id, v = 0.7, art = 'arco', x = {}) => {
      if (!out[id]) return;
      spans.forEach((sp, i) => {
        const e = out[id].events;
        const last = e[e.length - 1];
        if (last && !x.cres && !x.dec && last.m === V[i][id] && last.art === art && last.step + last.len === sp.step) last.len += sp.len;
        else add(id, sp.step, sp.len, V[i][id], v, art, x);
      });
    };
    const spanAt = (st) => spans.find((sp) => st >= sp.step && st < sp.step + sp.len) || spans[spans.length - 1];
    const vAt = (st) => V[spans.indexOf(spanAt(st))];
    const each = (fn, every = 1) => {
      for (let st = 0; st < total; st += every) fn(st, vAt(st), spanAt(st));
    };
    const role = (spec) => parts.forEach((id) => STR.includes(id) && L(id, spec[id] || spec.other));

    if (jeu === 'tenues' || jeu === 'enfle' || jeu === 'aigues') {
      role({ cb: 'bass', other: 'tenue' });
      parts.forEach((id) => hold(id, 0.7, 'arco', jeu === 'enfle' ? { cres: true } : {}));
      if (jeu === 'aigues' && out.vl1) {
        if (out.vl2) out.vl2.events = out.vl1.events.map((e) => ({ ...e }));
        out.vl1.events.forEach((e) => ((e.m = fit(e.m + 12, 72, 93)), (e.v = clampV(e.v * 1.08))));
      }
    } else if (jeu === 'pizz') {
      role({ cb: 'bass', vc: 'bass', vl1: 'arp', other: 'offbeat' });
      each((st, v) => {
        if (st % beat) return;
        if (strong(st)) {
          add('cb', st, beat, v.cb, 0.85, 'pizz');
          add('vc', st, beat, (st % spb) / beat >= 2 ? fit(v.vc + 7, VOICE.vc[0], VOICE.vc[1]) : v.vc, 0.8, 'pizz');
        } else {
          add('va', st, beat - 1, v.va, 0.75, 'pizz');
          add('vl2', st, beat - 1, v.vl2, 0.7, 'pizz');
        }
      });
      if (out.vl1)
        each((st, v) => {
          const tones = [v.va + 12, v.vl2, v.vl1, v.vl2 + 12].map((m) => fit(m, 64, 86)).sort((a, b) => a - b);
          const j = Math.floor((st % spb) / 2);
          add('vl1', st, 2, tones[[0, 1, 2, 3, 2, 1][j % 6]], j % 2 ? 0.58 : 0.75, 'pizz');
        }, 2);
    } else if (jeu === 'spic') {
      role({ cb: 'bass', va: 'tenue', other: 'motor' });
      const ACC = spb === 16 ? [0, 3, 6, 8, 11, 14] : null;
      const MOT = [0, 0, 12, 0, 0, 12, 0, 7];
      each((st, v) => {
        const p = st % spb;
        const a = (ACC ? ACC.includes(p) : p % beat === 0) ? 1 : 0.55;
        add('vl1', st, 1, st % 2 ? fit(v.vl2 + 12 <= v.vl1 ? v.vl2 + 12 : v.vl2, 60, 88) : v.vl1, 0.75 * a, 'spic');
        add('vl2', st, 1, st % 2 ? fit(v.va + 12, VOICE.vl2[0], VOICE.vl2[1]) : v.vl2, 0.7 * a, 'spic');
      });
      if (out.vc)
        each((st, v) => {
          const kk = Math.floor((st % spb) / 2);
          const o = spb === 16 ? MOT[kk % 8] : kk % 3 === 2 ? 12 : 0;
          const acc = spb === 16 ? [0, 3, 6].includes(kk) : kk % 3 === 0;
          add('vc', st, 2, fit((v.vc > 52 ? v.vc - 12 : v.vc) + o, 36, 64), acc ? 0.95 : 0.6, 'spic');
        }, 2);
      hold('va', 0.55, 'arco', { cres: true });
      hold('cb', 0.75);
    } else if (jeu === 'coups') {
      role({ cb: 'bass', other: 'hits' });
      const HITS = spb === 16 ? [[0, 2, 1], [6, 2, 0.8], [10, 1, 0.7], [12, 3, 0.9]] : Array.from({ length: nBeats }, (_, i) => [i * beat, 2, i ? 0.8 : 1]);
      for (let b = 0; b < bars; b++)
        HITS.forEach(([s, d, a]) => {
          const st = b * spb + s;
          if (st >= total) return;
          const v = vAt(st);
          parts.forEach((id) => STR.includes(id) && add(id, st, d, v[id], 0.85 * a, 'spic'));
        });
    } else if (jeu === 'trem') {
      role({ cb: 'bass', vc: 'bass', other: 'trem' });
      ['vl1', 'vl2'].forEach((id) => hold(id, 0.8, 'trem', { cres: true }));
      if (out.va) (out.va.role = 'tenue'), hold('va', 0.7, 'arco', { cres: true });
      ['vc', 'cb'].forEach((id) => hold(id, 0.65, 'arco', { cres: true }));
    } else if (jeu === 'contre') {
      role({ vl1: 'counter', cb: 'bass', other: 'tenue' });
      parts.filter((id) => id !== 'vl1').forEach((id) => hold(id, 0.5));
      if (out.vl1) {
        // segments libres : les silences de la mélodie (une croche et demie au moins), sinon chaque accord
        const mel = melody.filter((n) => n.len > 0).sort((a, b) => a.step - b.step);
        let segs = [];
        if (mel.length) {
          let at = 0;
          for (const n of mel) {
            if (n.step - at >= 6) segs.push([at, n.step]);
            at = Math.max(at, n.step + n.len);
          }
          if (total - at >= 6) segs.push([at, total]);
          // un silence qui couvre plusieurs accords se coupe aux changements d'accord
          segs = segs.flatMap(([a, b]) => spans.filter((sp) => sp.step < b && sp.step + sp.len > a).map((sp) => [Math.max(a, sp.step), Math.min(b, sp.step + sp.len)])).filter(([a, b]) => b - a >= 4);
        } else segs = spans.map((sp) => [sp.step, sp.step + sp.len]);
        let cur = V[0].vl1;
        segs.forEach(([a, b]) => {
          const sp = spanAt(a);
          const pcs = [...new Set(sp.pcs)];
          const third = pcs[1] ?? pcs[0];
          const n0 = nearestPc([third, pcs[2] ?? pcs[0]], cur, 64, 88) ?? cur;
          const len = b - a;
          const nx = spanAt(Math.min(total - 1, b));
          const tgt = nearestPc([...new Set(nx.pcs)], n0 + 2, 64, 88) ?? n0;
          const dir = Math.sign(tgt - n0) || -1;
          if (len >= 8) {
            add('vl1', a, len - 4, n0, 0.82);
            add('vl1', b - 4, 2, scaleStep(n0, dir, sc), 0.74);
            add('vl1', b - 2, 2, scaleStep(n0, 2 * dir, sc), 0.74);
            cur = scaleStep(n0, 2 * dir, sc);
          } else {
            add('vl1', a, len, n0, 0.8);
            cur = n0;
          }
        });
      }
    } else if (jeu === 'unisson') {
      role({ other: 'riff' });
      // [pas, durée, degré de l'accord : 0 fondamentale, 1 tierce, 2 quinte, 3 octave]
      const R12 = [[0, 3, 0], [3, 3, 0], [6, 2, 2], [8, 4, 3]];
      const R = spb === 16 ? [[0, 3, 0], [3, 3, 0], [6, 2, 2], [8, 3, 3], [11, 3, 2], [14, 2, 1]] : spb === 24 ? [...R12, ...R12.map(([s, d, g]) => [s + 12, d, g])] : R12;
      const OCT = { vl1: 0, vl2: 0, va: -12, vc: -24, cb: -36 };
      for (let b = 0; b < bars; b++)
        R.forEach(([s, d, g]) => {
          const st = b * spb + s;
          if (st >= total) return;
          const pcs = [...new Set(spanAt(st).pcs)];
          const base = nearestPc([pcs[0]], 69, 64, 75);
          const iv = [0, pcOf((pcs[1] ?? pcs[0]) - pcs[0]), pcOf((pcs[2] ?? pcs[0]) - pcs[0]), 12][g];
          parts.forEach((id) => STR.includes(id) && add(id, st, d, fit(base + iv + OCT[id], VOICE[id][0] - 5, VOICE[id][1] + 7), s ? 0.75 : 0.9));
        });
    } else if (jeu === 'arpege') {
      role({ va: 'arp', cb: 'bass', vc: 'bass', other: 'tenue' });
      ['vl1', 'vl2'].forEach((id) => hold(id, 0.5));
      hold('vc', 0.55);
      if (out.va)
        each((st, v, sp) => {
          const pcs = [...new Set(sp.pcs)];
          const lo = nearestPc([pcs[0]], 56, 52, 63);
          const t = [lo, lo + pcOf((pcs[2] ?? pcs[0]) - pcs[0]), lo + 12, lo + 12 + pcOf((pcs[1] ?? pcs[0]) - pcs[0])];
          const j = Math.floor((st % spb) / 2);
          add('va', st, 2, t[[0, 1, 2, 3, 2, 1, 2, 1][j % 8]], j % 4 ? 0.6 : 0.8);
        }, 2);
      each((st, v) => st % beat === 0 && strong(st) && add('cb', st, beat, v.cb, 0.85, 'pizz'));
    } else if (jeu === 'montee') {
      role({ vl1: 'rise', vl2: 'rise', cb: 'bass', vc: 'bass', other: 'trem' });
      const last = Math.max(0, total - spb);
      ['vl1', 'vl2'].forEach((id) => out[id] && spans.forEach((sp, i) => sp.step < last && add(id, sp.step, Math.min(sp.len, last - sp.step), V[i][id], 0.6, 'arco', { cres: true })));
      if (out.va) hold('va', 0.7, 'trem', { cres: true });
      ['vc', 'cb'].forEach((id) => hold(id, 0.7, 'arco', { cres: true }));
      let m = nearestPc([[...new Set(spanAt(last).pcs)][0]], 66, 60, 71);
      const d = spb > 16 ? 2 : 1; // 12/8 : la gamme en croches (deux octaves au plus)
      for (let s = 0; s < spb && last + s < total; s += d) {
        add('vl1', last + s, d, Math.min(m, 93), 0.55 + (s / spb) * 0.45);
        add('vl2', last + s, d, Math.min(scaleStep(m, -2, sc), 84), 0.5 + (s / spb) * 0.45);
        m = scaleStep(m, 1, sc);
      }
    } else if (jeu === 'trait') {
      role({ vl1: 'run', vl2: 'run', cb: 'bass', other: 'tenue' });
      parts.filter((id) => id !== 'vl1' && id !== 'vl2').forEach((id) => hold(id, 0.6));
      for (let b = 0; b < bars; b++)
        ['vl1', 'vl2'].forEach((id) => {
          const st = b * spb;
          if (!out[id] || st >= total) return;
          const run = b % 2 === 1;
          const n = run ? 5 : 0;
          add(id, st, spb - n, vAt(st)[id], 0.7);
          if (run) {
            const tgt = vAt(Math.min(total - 1, st + spb))[id];
            for (let k = 0; k < n; k++) add(id, st + spb - n + k, 1, scaleStep(tgt, k - n, sc), 0.55 + k * 0.08, 'spic');
          }
        });
    } else if (jeu === 'final') {
      role({ cb: 'bass', vc: 'bass', other: 'trem' });
      const last = Math.max(0, total - spb);
      parts.forEach((id) => STR.includes(id) && spans.forEach((sp, i) => sp.step < last && add(id, sp.step, Math.min(sp.len, last - sp.step), V[i][id], 0.6)));
      const v = vAt(last);
      parts.forEach((id) => {
        if (!out[id]) return;
        add(id, last, 1, v[id], 1, 'spic');
        add(id, last + 1, total - last - 1, v[id], 0.8, ['vl1', 'vl2', 'va'].includes(id) ? 'trem' : 'arco', { dec: true });
      });
    }
    // densité légère : sans contrebasses (dès cinq pupitres) ; pleine : contrebasses doublées à l'octave grave
    if (level === 'light' && out.cb && parts.filter((id) => STR.includes(id)).length > 4) out.cb = { role: 'tacet', events: [] };
    if (level === 'full' && out.cb) out.cb.events.forEach((e) => e.m - 12 >= 28 && (e.dbl = true));
    return out;
  }

  /**
   * Réécrit les cordes de l'orchestration res (js/orchestra.js) avec le jeu → { lines, items, view }.
   * lines : une ligne par pupitre de l'effectif (pistes), les pupitres d'articulation reçoivent les notes jouées de leur
   * façon ; view : par pupitre principal, son rôle, ses façons de jouer et toutes ses notes (affichage de l'étape).
   * opts : { parts: [ids de l'effectif], jeu, spans, melody, level, off, vel, spb, beat, scale }
   */
  function apply(res, opts) {
    const { parts, jeu, off = [] } = opts;
    if (!JEU[jeu] || jeu === 'orch') return res;
    const main = STR.filter((id) => parts.includes(id) && !off.includes(id));
    const W = writeStrings({ ...opts, parts: main });
    const lines = { ...res.lines };
    const view = {};
    const blank = (id, role, why) => (lines[id] = { role, events: [], lo: null, hi: null, why });
    STR.filter((id) => parts.includes(id)).forEach((id) => blank(id, 'tacet', off.includes(id) ? 'Coupé dans cette scène.' : 'Se tait dans ce jeu.'));
    ARTS.filter((id) => parts.includes(id)).forEach((id) => blank(id, 'tacet', 'Joue quand le jeu le demande.'));
    const push = (id, e) => {
      const ev = lines[id].events;
      const notes = e.dbl ? [e.m, e.m - 12] : [e.m];
      const same = ev.find((x) => x.step === e.step && x.len === e.len);
      if (same) same.notes = [...new Set([...same.notes, ...notes])].sort((a, b) => a - b);
      else ev.push({ step: e.step, len: e.len, notes, vel: e.v });
    };
    const vols = {};
    Object.entries(W).forEach(([id, L]) => {
      view[id] = { role: L.role, arts: [...new Set(L.events.map((e) => e.art))], events: L.events.map((e) => ({ step: e.step, len: e.len, notes: e.dbl ? [e.m, e.m - 12] : [e.m], art: e.art })) };
      if (L.role === 'tacet') return;
      lines[id].role = L.role;
      lines[id].why = JEU[jeu].label;
      L.events.forEach((e) => {
        const to = ROUTE[id][e.art];
        let tgt = id;
        let x = e;
        if (to && parts.includes(to)) {
          tgt = to;
          lines[to].role = L.role;
          lines[to].why = JEU[jeu].label;
        } else if (e.art === 'pizz' || e.art === 'spic') x = { ...e, len: Math.min(e.len, e.art === 'pizz' ? 2 : 1) }; // sans ce pupitre : une note courte à l'archet
        push(tgt, x);
        // crescendo et diminuendo : courbe de volume de la piste
        if (e.cres || e.dec) {
          const vl = (vols[tgt] = vols[tgt] || {});
          vl[e.step] = e.cres ? 0.35 : 1;
          vl[e.step + Math.max(1, e.len - 1)] = e.cres ? 1 : 0.3;
        }
      });
    });
    [...STR, ...ARTS].forEach((id) => {
      const L = lines[id];
      if (!L || !parts.includes(id)) return;
      L.events.sort((a, b) => a.step - b.step);
      const ns = L.events.flatMap((e) => e.notes);
      if (ns.length) {
        L.lo = Math.min(...ns);
        L.hi = Math.max(...ns);
      } else L.role = 'tacet';
      if (vols[id]) L.vol = vols[id];
    });
    const items = res.items.filter((i) => !(i.parts || []).some((p) => STR.includes(p)));
    return { lines, items, view };
  }

  return { JEUX, JEU, FAMS, STARS, ART_LABEL, STR, ARTS, ROUTE, hasJeux, stars, autoJeu, writeStrings, apply };
})();
