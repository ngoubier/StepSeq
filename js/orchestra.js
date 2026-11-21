/*
 * Orchestre de l'assistant Nouvelle chanson : effectifs, tessitures et répartition des voix (étape « Orchestration »).
 *
 *   PARTS / ENSEMBLES        pupitres (son de l'orchestre VSCO 2, sinon General MIDI ; tessiture, zone confortable) et
 *                            effectifs proposés
 *   levelOf(energy)          densité par défaut d'une scène selon son énergie : light | mid | full
 *   orchestrate(opts)        écrit chaque pupitre pour une scène : { lines: { id: { role, events, lo, hi, why } }, items }
 *
 * Principe : la scène a déjà sa mélodie, ses accords et sa basse. On les distribue dans l'effectif :
 *   - basse : le pupitre le plus grave (contrebasses, sinon violoncelles, sinon basson) tient la basse de l'accord ;
 *   - harmonie : une note de l'accord par pupitre, tenue, qui bouge le moins possible d'un accord à l'autre, sans
 *     croiser le pupitre du dessus ni passer au-dessus de la mélodie (tierce et septième d'abord) ;
 *   - mélodie (densité « tout l'effectif ») : les premiers violons doublent la mélodie, à l'octave de leur zone chantante ;
 *   - contrechant (densité moyenne et pleine) : un bois (flûte, hautbois, clarinette) entre dans les silences de la
 *     mélodie au lieu de la doubler ;
 *   - nappe (cordes synthé de l'effectif hybride) : l'accord entier, serré au centre.
 * Densité « léger » : les cordes seules (bois et cor se taisent), pas de doublure. Un pupitre peut être coupé (off).
 * Hauteurs en MIDI (son réel : la contrebasse sonne à l'octave inférieure de son écriture, on note ce qu'on entend).
 * Fonctions pures (aucun DOM) : tests/orchestra.test.js.
 */
window.SS = window.SS || {};

SS.orchestra = (() => {
  const pcOf = (m) => ((m % 12) + 12) % 12;
  // lo / hi : tessiture ; clo / chi : zone confortable (où l'instrument sonne sans forcer)
  const P = (id, label, short, tok, fam, lo, hi, clo, chi) => ({ id, label, short, tok, fam, lo, hi, clo, chi });
  const PARTS = [
    P('fl', 'Flûte', 'Fl.', 'vsco_flute', 'bois', 60, 96, 67, 91),
    P('ob', 'Hautbois', 'Hb.', 'vsco_oboe', 'bois', 58, 91, 62, 86),
    P('cl', 'Clarinette', 'Cl.', 'vsco_clarinet', 'bois', 50, 91, 55, 84),
    P('hn', 'Cor', 'Cor', 'vsco_horn', 'cuivres', 41, 77, 48, 72),
    P('bn', 'Basson', 'Bn.', 'vsco_bassoon', 'bois', 34, 75, 38, 67),
    P('vl1', 'Violons I', 'Vl. I', 'vsco_violins', 'cordes', 55, 100, 62, 91),
    P('vl2', 'Violons II', 'Vl. II', 'vsco_violins', 'cordes', 55, 93, 60, 84),
    P('va', 'Altos', 'Altos', 'vsco_violas', 'cordes', 48, 84, 53, 76),
    P('vc', 'Violoncelles', 'Vc.', 'vsco_cellos', 'cordes', 36, 76, 41, 69),
    P('cb', 'Contrebasses', 'Cb.', 'vsco_contrabass', 'cordes', 28, 55, 31, 50),
    P('syn', 'Cordes synthé', 'Synth', 'gm_synth_strings_1', 'synthé', 48, 84, 53, 79),
    // pupitres de l'assistant « Musique de film » (js/film.js) : cuivres, piccolo, harpe, violon solo
    P('pic', 'Piccolo', 'Picc.', 'vsco_piccolo', 'bois', 74, 108, 79, 103),
    P('tp', 'Trompettes', 'Tp.', 'vsco_trumpet', 'cuivres', 54, 82, 60, 77),
    P('tb', 'Trombones', 'Tb.', 'vsco_trombone', 'cuivres', 40, 72, 45, 67),
    P('tu', 'Tuba', 'Tuba', 'vsco_tuba', 'cuivres', 28, 58, 33, 52),
    P('hp', 'Harpe', 'Hp.', 'vsco_harp', 'cordes pincées', 24, 103, 43, 84),
    P('vs', 'Violon solo', 'Vl. solo', 'vsco_violin_solo', 'cordes', 55, 100, 62, 91),
  ];
  const PART = Object.fromEntries(PARTS.map((p) => [p.id, p]));
  const ENSEMBLES = [
    { id: 'strings', label: 'Cordes', text: 'Le quintette à cordes : violons I et II, altos, violoncelles, contrebasses.', parts: ['vl1', 'vl2', 'va', 'vc', 'cb'] },
    { id: 'chamber', label: 'Cordes, cor et flûte', text: 'Les cordes, un cor pour la chaleur au centre, une flûte pour le contrechant.', parts: ['fl', 'vl1', 'vl2', 'va', 'hn', 'vc', 'cb'] },
    { id: 'winds', label: 'Cordes et bois', text: 'Les cordes avec flûte, clarinette et basson : plus de couleurs, plus de souffle.', parts: ['fl', 'cl', 'vl1', 'vl2', 'va', 'bn', 'vc', 'cb'] },
    { id: 'hybrid', label: 'Synthé et cordes', text: 'Une nappe de cordes synthé sous de vraies cordes : le son hybride des musiques de film.', parts: ['vl1', 'va', 'syn', 'vc', 'cb'] },
    // effectifs de musique de film (une couleur chacun)
    { id: 'intime', label: 'Intime', film: true, text: 'Violon solo, violoncelles et harpe : une pièce de chambre, filmée de près.', parts: ['vs', 'hp', 'vc'] },
    { id: 'romantique', label: 'Romantique', film: true, text: 'Bois, cor, harpe et cordes : le hautbois répond, la harpe fait couler l’harmonie, les violons chantent au sommet.', parts: ['fl', 'ob', 'cl', 'vl1', 'vl2', 'va', 'hn', 'hp', 'vc', 'cb'] },
    { id: 'epique', label: 'Épique', film: true, text: 'Cuivres complets sur les cordes : trompettes sur le thème au sommet, trombones et tuba pour la basse, cuivres réservés aux scènes fortes.', parts: ['pic', 'fl', 'tp', 'vl1', 'vl2', 'va', 'hn', 'tb', 'vc', 'cb', 'tu'] },
    { id: 'mystere', label: 'Mystère', film: true, text: 'Clarinette et basson dans le grave, altos, harpe : des couleurs sombres et feutrées.', parts: ['fl', 'cl', 'va', 'hp', 'bn', 'vc', 'cb'] },
  ];
  const ENS = Object.fromEntries(ENSEMBLES.map((e) => [e.id, e]));
  const LEVELS = [
    { id: 'light', label: 'Léger', text: 'les cordes seules, sans doublure' },
    { id: 'mid', label: 'Moyen', text: 'tout l’effectif en harmonie, contrechant des bois' },
    { id: 'full', label: 'Tout l’effectif', text: 'les premiers violons doublent la mélodie' },
  ];
  const ROLE_LABEL = { melody: 'Mélodie', counter: 'Contrechant', harmony: 'Harmonie', bass: 'Basse', pad: 'Nappe', arp: 'Arpège', tacet: 'Se tait' };
  /** Densité par défaut d'une scène selon l'énergie du plan (0,78 calme … 1 refrain). */
  const levelOf = (energy) => (energy >= 0.97 ? 'full' : energy >= 0.85 ? 'mid' : 'light');

  const midiName = (m) => ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'][pcOf(m)] + (Math.floor(m / 12) - 1);
  const center = (p) => (p.clo + p.chi) / 2;
  /** La note de classe pc la plus proche de `near`, dans [lo, hi] (null si aucune). */
  function nearest(pc, near, lo, hi) {
    let best = null;
    for (let m = lo; m <= hi; m++) if (pcOf(m) === pc && (best === null || Math.abs(m - near) < Math.abs(best - near))) best = m;
    return best;
  }
  /** Notes posées bout à bout ; deux notes égales qui se suivent sont liées (tenue). */
  function push(ev, step, len, notes, vel) {
    const last = ev[ev.length - 1];
    if (last && last.step + last.len === step && last.notes.join() === notes.join()) last.len += len;
    else ev.push({ step, len, notes, vel });
  }
  const barOf = (step) => Math.floor(step / 16) + 1;
  const bars = (set) => [...set].sort((a, b) => a - b).slice(0, 3).join(', ') + (set.size > 3 ? '…' : '');

  /**
   * opts : { parts: [id], spans: [{ step, len, pcs: [classes de l'accord, fondamentale d'abord], bassPc }],
   *          melody: [{ step, len, midi }], level: light | mid | full, off: [id], vel }
   */
  function orchestrate({ parts, spans, melody = [], level = 'mid', off = [], vel = null }) {
    const defs = parts.map((id) => PART[id]).filter(Boolean);
    const lines = {};
    const items = [];
    const v0 = vel ?? { light: 0.5, mid: 0.62, full: 0.74 }[level] ?? 0.62;
    const set = (p, role, why) => (lines[p.id] = { role, events: [], lo: null, hi: null, why });
    const isOff = (p) => off.includes(p.id);
    const sounding = defs.filter((p) => !isOff(p));
    const mel = melody.filter((n) => n.len > 0).sort((a, b) => a.step - b.step);
    // rôles
    const bassP = ['cb', 'vc', 'bn'].map((id) => sounding.find((p) => p.id === id)).find(Boolean) || null;
    // le violon solo porte la mélodie dès la densité moyenne (effectif intime) ; sinon les premiers violons au sommet
    const leadP = !mel.length ? null : level === 'full' ? ['vl1', 'vs', 'fl'].map((id) => sounding.find((p) => p.id === id)).find(Boolean) || null : level === 'mid' ? sounding.find((p) => p.id === 'vs') || null : null;
    // au sommet (densité pleine) : trompettes sur le thème, piccolo à l'octave au-dessus
    const dbl = level === 'full' && mel.length ? sounding.filter((p) => (p.id === 'tp' || p.id === 'pic') && p !== leadP) : [];
    const counterP = level !== 'light' && mel.length ? ['ob', 'fl', 'cl', 'vc'].filter((id) => id !== 'vc' || sounding.some((p) => p.id === 'vs')).map((id) => sounding.find((p) => p.id === id && p !== leadP && !dbl.includes(p))).find(Boolean) || null : null;
    const padP = sounding.find((p) => p.id === 'syn') || null;
    const harpP = sounding.find((p) => p.id === 'hp') || null;
    // tuba : double la basse à l'octave grave, au sommet seulement
    const tubaP = level === 'full' && bassP && bassP.id !== 'tu' ? sounding.find((p) => p.id === 'tu') || null : null;
    // cuivres (sauf le cor) : une couleur réservée aux scènes fortes ; trompettes, trombones et tuba se taisent ailleurs
    const brassRest = (p) => ['tp', 'tb', 'tu', 'pic'].includes(p.id) && level !== 'full';
    const harm = sounding
      .filter((p) => p !== bassP && p !== leadP && p !== counterP && p !== padP && p !== harpP && p !== tubaP && !dbl.includes(p) && !brassRest(p))
      .filter((p) => level !== 'light' || p.fam === 'cordes' || p.fam === 'synthé')
      .sort((a, b) => center(b) - center(a));
    defs.forEach((p) => {
      if (isOff(p)) return set(p, 'tacet', 'Coupé dans cette scène.');
      if (dbl.includes(p)) return set(p, 'melody', p.id === 'pic' ? 'Double le thème une octave au-dessus : l’éclat du sommet.' : 'Double le thème au sommet : les trompettes le rendent héroïque.');
      if (p === tubaP) return set(p, 'bass', 'Double la basse à l’octave grave : le poids des scènes fortes.');
      if (p === harpP) return set(p, 'arp', 'Arpège chaque accord en croches, du grave vers l’aigu : l’harmonie qui coule.');
      if (brassRest(p)) return set(p, 'tacet', 'Réservé aux scènes fortes (densité pleine) : les cuivres lassent s’ils jouent tout le temps.');
      if (p === bassP) return set(p, 'bass', `Tient la basse de chaque accord${p.id !== 'cb' ? ' (pas de contrebasses : le pupitre le plus grave la prend)' : ''}.`);
      if (p === leadP) return set(p, 'melody', 'Double la mélodie, à l’octave de sa zone chantante : la ligne principale gagne en ampleur.');
      if (p === counterP) return set(p, 'counter', 'Entre dans les silences de la mélodie : il répond au lieu de doubler.');
      if (p === padP) return set(p, 'pad', 'L’accord entier, serré au centre : le tapis synthé sous les cordes.');
      if (harm.includes(p)) return set(p, 'harmony', p.id === 'hn' ? 'Tient de préférence la tierce ou la septième : chaleur au centre.' : 'Une note de l’accord, qui bouge le moins possible d’un accord à l’autre.');
      set(p, 'tacet', level === 'light' ? 'Se tait : en densité légère, les cordes jouent seules.' : 'Se tait dans cette scène.');
    });

    // mélodie : transposée d'octaves vers la zone chantante du pupitre
    if (leadP) {
      const ms = mel.map((n) => n.midi).sort((a, b) => a - b);
      const med = ms[Math.floor(ms.length / 2)];
      let sh = Math.round((center(leadP) - med) / 12) * 12;
      while (ms[0] + sh < leadP.lo) sh += 12;
      while (ms[ms.length - 1] + sh > leadP.hi && ms[0] + sh - 12 >= leadP.lo) sh -= 12;
      mel.forEach((n) => lines[leadP.id].events.push({ step: n.step, len: n.len, notes: [n.midi + sh], vel: v0 + 0.06 }));
      lines[leadP.id].why += sh ? ` (${sh > 0 ? '+' : ''}${sh / 12} octave${Math.abs(sh) > 12 ? 's' : ''})` : '';
    }
    // doublures du sommet : chaque pupitre à l'octave la plus proche de sa zone chantante (le piccolo au-dessus de tout)
    dbl.forEach((p) => {
      const ms = mel.map((n) => n.midi).sort((a, b) => a - b);
      const med = ms[Math.floor(ms.length / 2)];
      let sh = Math.round((center(p) - med) / 12) * 12;
      while (ms[0] + sh < p.lo) sh += 12;
      while (ms[ms.length - 1] + sh > p.hi && ms[0] + sh - 12 >= p.lo) sh -= 12;
      mel.forEach((n) => lines[p.id].events.push({ step: n.step, len: n.len, notes: [n.midi + sh], vel: v0 + 0.04 }));
    });
    const melAt = (a, b) => mel.filter((n) => n.step < b && n.step + n.len > a);
    const crossBars = new Map();
    const maskBars = new Map();
    const note = (map, key, bar) => (map.get(key) || map.set(key, new Set()).get(key)).add(bar);
    let prevBass = null;
    const prev = {};
    for (const sp of spans) {
      const pcs = [...new Set(sp.pcs)];
      const root = pcs[0];
      const bassPc = sp.bassPc ?? root;
      // basse
      if (bassP) {
        const m = nearest(bassPc, prevBass ?? bassP.clo + 5, bassP.clo, Math.min(bassP.chi, bassP.clo + 14)) ?? nearest(bassPc, bassP.clo + 5, bassP.lo, bassP.hi);
        if (m !== null) push(lines[bassP.id].events, sp.step, sp.len, [m], v0);
        prevBass = m;
        if (tubaP && m !== null) {
          const tm = nearest(bassPc, m - 12, tubaP.lo, tubaP.chi) ?? nearest(bassPc, m, tubaP.lo, tubaP.hi);
          if (tm !== null) push(lines[tubaP.id].events, sp.step, sp.len, [tm], v0 + 0.04);
        }
      }
      // harpe : l'accord arpégé en croches, de la basse vers l'aigu puis retour (deux octaves)
      if (harpP) {
        const base = nearest(bassPc, 43, harpP.lo, harpP.hi) ?? 43;
        const up = [];
        for (let m = base; m <= base + 26 && up.length < 6; m++) if (pcs.includes(pcOf(m)) || pcOf(m) === pcOf(bassPc)) up.push(m);
        const seq = [...up, ...up.slice(1, -1).reverse()];
        for (let st = 0, i = 0; st < sp.len; st += 2, i++) lines[harpP.id].events.push({ step: sp.step + st, len: Math.min(4, sp.len - st), notes: [seq[i % seq.length]], vel: v0 - 0.1 });
      }
      // harmonie : du haut vers le bas, sous la mélodie et sous le pupitre du dessus
      const ms = melAt(sp.step, sp.step + sp.len).map((n) => n.midi);
      const melLo = ms.length ? Math.min(...ms) : null;
      const third = pcs.find((pc) => [3, 4].includes(pcOf(pc - root)));
      const seventh = pcs.find((pc) => [10, 11].includes(pcOf(pc - root)));
      let ceil = melLo !== null ? melLo - 1 : 200;
      const used = [];
      let above = null;
      for (const p of harm) {
        const cands = [];
        for (let m = p.clo; m <= p.chi; m++) if (pcs.includes(pcOf(m))) cands.push(m);
        const score = (m) => {
          let s = Math.abs(m - (prev[p.id] ?? center(p)));
          if (used.includes(pcOf(m)) && pcs.some((pc) => !used.includes(pc))) s += 6;
          if (p.id === 'hn' && (pcOf(m) === third || pcOf(m) === seventh)) s -= 3;
          if (pcOf(m) === third && !used.includes(third)) s -= 1;
          return s;
        };
        const ok = cands.filter((m) => m <= ceil);
        const pick = (ok.length ? ok : cands).sort((a, b) => score(a) - score(b))[0];
        if (pick === undefined) continue;
        if (!ok.length && above) note(crossBars, `${p.id}<${above.id}`, barOf(sp.step));
        if (!ok.length && !above && melLo !== null && pick > melLo) note(maskBars, p.id, barOf(sp.step));
        push(lines[p.id].events, sp.step, sp.len, [pick], v0);
        prev[p.id] = pick;
        used.push(pcOf(pick));
        ceil = Math.min(ceil, pick - 1);
        above = p;
      }
      // nappe : l'accord serré au centre
      if (padP) {
        const c = Math.round(center(padP));
        const ns = pcs.map((pc) => nearest(pc, c, padP.clo, padP.chi)).filter((m) => m !== null).sort((a, b) => a - b);
        if (ns.length) push(lines[padP.id].events, sp.step, sp.len, ns, v0 - 0.08);
      }
    }
    // contrechant : dans les silences de la mélodie (une croche et demie au moins), une note de l'accord au-dessus
    if (counterP) {
      const gaps = [];
      let at = 0;
      const total = spans.length ? spans[spans.length - 1].step + spans[spans.length - 1].len : 0;
      for (const n of mel) {
        if (n.step - at >= 6) gaps.push([at, n.step]);
        at = Math.max(at, n.step + n.len);
      }
      if (total - at >= 6) gaps.push([at, total]);
      let last = mel.length ? mel[0].midi + 4 : center(counterP);
      for (const [a, b] of gaps) {
        const sp = spans.find((x) => a >= x.step && a < x.step + x.len);
        if (!sp) continue;
        const before = mel.filter((n) => n.step < a).pop();
        const near = before ? before.midi + 4 : last;
        const pcs = [...new Set(sp.pcs)];
        const pref = [pcs[1], pcs[2], pcs[0]].filter((x) => x !== undefined);
        let m = null;
        for (const pc of pref) {
          m = nearest(pc, near, counterP.clo, counterP.chi);
          if (m !== null) break;
        }
        if (m === null) continue;
        const len = Math.min(b - a, 16, sp.step + sp.len - a);
        lines[counterP.id].events.push({ step: a, len, notes: [m], vel: v0 - 0.06 });
        last = m;
      }
      if (!lines[counterP.id].events.length) lines[counterP.id].why = 'La mélodie ne laisse pas de silence : il se tait.';
    }
    // registres et contrôles
    let outside = 0;
    for (const p of defs) {
      const L = lines[p.id];
      const ns = L.events.flatMap((e) => e.notes);
      if (!ns.length) {
        L.role = 'tacet';
        continue;
      }
      L.lo = Math.min(...ns);
      L.hi = Math.max(...ns);
      if (L.lo < p.lo || L.hi > p.hi) outside++;
    }
    for (const [k, set2] of crossBars) {
      const [a, b] = k.split('<');
      items.push({ kind: 'warn', parts: [a, b], text: `${PART[a].label} et ${PART[b].label} se croisent (mes. ${bars(set2)}).`, hint: 'Le croisement brouille les lignes : coupe un pupitre ou passe à une densité plus légère.' });
    }
    for (const [id, set2] of maskBars) items.push({ kind: 'warn', parts: [id], text: `${PART[id].label} passent au-dessus de la mélodie (mes. ${bars(set2)}).`, hint: 'La mélodie est couverte : coupe ce pupitre dans la scène ou garde la densité légère.' });
    items.push(outside ? { kind: 'warn', text: `${outside} pupitre${outside > 1 ? 's' : ''} hors de sa tessiture.` } : { kind: 'ok', text: 'Toutes les parties sont dans la tessiture de leur instrument.' });
    return { lines, items };
  }

  return { PARTS, PART, ENSEMBLES, ENS, LEVELS, ROLE_LABEL, levelOf, orchestrate, midiName };
})();
