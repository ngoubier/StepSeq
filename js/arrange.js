/*
 * Arrangement : l'énergie de la chanson, scène par scène (étape « Arrangement » de l'assistant Nouvelle chanson, js/band.js).
 *
 *   stats(scene, groups)        ce que joue chaque instrument dans une scène : { counts: { id: notes ou coups }, active, hits, vel }
 *   energies(list)              énergie de chaque scène, ramenée entre 0,15 et 1 sur la chanson (densité, instruments actifs, vélocité)
 *   blocks(res)                 les passages de la chanson dans l'ordre (une scène répétée = plusieurs passages) : { sceneId, start, bars, t }
 *   target(curve, t)            l'énergie voulue à la position t (0..1) de la chanson pour une courbe (CURVES)
 *   diagnose(scenes, blocks, c) les points à travailler : [{ kind: ok | warn | info, sec, text, hint?, act? }]
 *   moves(ctx)                  mouvements de son (cutoff, vélocité, résonance par temps) proposés d'après l'énergie
 *
 * Fonctions pures (aucun DOM) : tests/arrange.test.js.
 */
window.SS = window.SS || {};

SS.arrange = (() => {
  const CURVES = [
    { id: 'rise', label: 'Montée vers le final', text: 'de plus en plus fort jusqu’au dernier refrain, puis la sortie' },
    { id: 'waves', label: 'Deux vagues', text: 'un premier sommet, un retrait, un sommet plus haut' },
    { id: 'middle', label: 'Sommet au milieu', text: 'monte, culmine aux deux tiers, redescend' },
  ];
  const bump = (t, c, w) => Math.exp(-((t - c) * (t - c)) / (2 * w * w));
  function target(curve, t) {
    if (curve === 'waves') return 0.2 + 0.8 * Math.max(0.78 * bump(t, 0.42, 0.13), bump(t, 0.9, 0.16));
    if (curve === 'middle') return 0.2 + 0.8 * bump(t, 0.62, 0.22);
    return t < 0.85 ? 0.2 + (0.8 * t) / 0.85 : 1 - (0.45 * (t - 0.85)) / 0.15;
  }

  /** Notes (events) et coups (steps) d'une piste dans une scène. */
  const hitsOf = (d) => (d ? (d.events || []).length + (d.steps || []).filter((v) => v).length : 0);
  /** groups : [{ id, cols: [identifiants de piste] }] (un kit de batterie = un instrument de plusieurs pistes). */
  function stats(scene, groups) {
    const counts = {};
    let hits = 0;
    let vs = 0;
    let vn = 0;
    for (const g of groups) {
      let n = 0;
      for (const id of g.cols) {
        const d = scene.data && scene.data[id];
        n += hitsOf(d);
        for (const e of (d && d.events) || []) {
          vs += e.vel ?? 0.8;
          vn++;
        }
      }
      counts[g.id] = n;
      hits += n;
    }
    const active = Object.values(counts).filter((n) => n > 0).length;
    return { counts, active, hits, perBar: hits / Math.max(1, scene.bars || 1), vel: vn ? vs / vn : 0.8, groups: groups.length };
  }
  /** list : [stats] → énergie de chaque scène, entre 0,15 et 1 (0,5 partout si toutes se valent). */
  function energies(list) {
    if (!list.length) return [];
    const maxPb = Math.max(...list.map((s) => s.perBar), 1e-9);
    const raw = list.map((s) => 0.5 * (s.active / Math.max(1, s.groups)) + 0.35 * (s.perBar / maxPb) + 0.15 * s.vel);
    const lo = Math.min(...raw);
    const hi = Math.max(...raw);
    return raw.map((r) => (hi - lo < 1e-6 ? 0.5 : 0.15 + (0.85 * (r - lo)) / (hi - lo)));
  }
  /** Passages de la chanson ({ key, scenes, song } de SS.bandSong.build) : un par répétition, avec sa position t (milieu, 0..1). */
  function blocks(res) {
    const out = [];
    let at = 0;
    for (const s of res.song || []) {
      const sc = res.scenes.find((x) => x.id === s.scene);
      if (!sc) continue;
      for (let r = 0; r < (s.repeat || 1); r++) {
        out.push({ sceneId: sc.id, sec: sc.sec, name: sc.name, start: at, bars: sc.bars });
        at += sc.bars;
      }
    }
    out.forEach((b) => (b.t = at ? (b.start + b.bars / 2) / at : 0));
    return { list: out, bars: at };
  }

  /**
   * scenes : [{ sec, name, e }] (énergie mesurée) ; bl : blocks(res).list ; curve : id de CURVES.
   * act : 'denser' (densifier) ou 'lighter' (alléger) quand une variation de la scène peut aider.
   */
  function diagnose(scenes, bl, curve) {
    const items = [];
    if (!scenes.length || !bl.length) return items;
    const tgt = (b) => target(curve, b.t);
    const bySec = new Map(scenes.map((s) => [s.sec, s]));
    // écart entre l'énergie de la scène et celle que veut la courbe à ses passages (moyenne)
    for (const s of scenes) {
      const mine = bl.filter((b) => b.sec === s.sec);
      if (!mine.length) continue;
      const want = mine.reduce((a, b) => a + tgt(b), 0) / mine.length;
      const d = s.e - want;
      if (d < -0.18) items.push({ kind: 'warn', sec: s.sec, gap: d, text: `${s.name} est plus calme que ta courbe ne le veut.`, hint: 'Faire entrer un instrument ou serrer le rythme (basse en croches, nappe en croches).', act: 'denser' });
      else if (d > 0.18) items.push({ kind: 'warn', sec: s.sec, gap: d, text: `${s.name} est plus chargée que ta courbe ne le veut.`, hint: 'Une scène respire quand on retire : sans l’arpège, ou sans la batterie, la suivante paraîtra plus forte.', act: 'lighter' });
      // une scène qui revient à l'identique alors que la courbe change entre ses passages
      if (mine.length > 1) {
        const ws = mine.map(tgt);
        if (Math.max(...ws) - Math.min(...ws) > 0.25)
          items.push({ kind: 'info', sec: s.sec, text: `${s.name} revient ${mine.length} fois à l’identique alors que ta courbe change entre ses passages.`, hint: 'Duplique la scène à l’étape Scènes pour varier son retour.' });
      }
    }
    // le sommet
    const top = bl.reduce((a, b) => (tgt(b) > tgt(a) ? b : a));
    const loud = scenes.reduce((a, b) => (b.e > a.e ? b : a));
    if (loud.sec !== top.sec && bySec.get(top.sec) && loud.e - bySec.get(top.sec).e > 0.08)
      items.push({ kind: 'warn', sec: top.sec, text: `Le sommet de la chanson est ${loud.name}, ta courbe le veut sur ${top.name}.`, hint: `Densifier ${top.name} ou alléger ${loud.name}.`, act: 'denser' });
    // deux passages voisins de scènes différentes qui se valent : on n'entend pas le changement
    for (let i = 1; i < bl.length; i++) {
      const a = bySec.get(bl[i - 1].sec);
      const b = bySec.get(bl[i].sec);
      if (a && b && a.sec !== b.sec && Math.abs(a.e - b.e) < 0.04 && Math.abs(tgt(bl[i]) - tgt(bl[i - 1])) > 0.12 && !items.some((x) => x.sec === b.sec && x.act))
        items.push({ kind: 'warn', sec: b.sec, text: `Rien ne change entre ${a.name} et ${b.name} : même énergie.`, hint: 'Un contraste se fait par la densité, le registre ou le silence, pas seulement par le volume.', act: tgt(bl[i]) > tgt(bl[i - 1]) ? 'denser' : 'lighter' });
    }
    if (!items.some((x) => x.kind === 'warn')) items.unshift({ kind: 'ok', text: 'La chanson suit ta courbe : chaque scène est à sa place.' });
    return items;
  }

  /*
   * Mouvements de son (automation par temps, js/beatauto.js) proposés d'après l'énergie de la chanson :
   *   open  : le filtre s'ouvre vers le sommet — accords, basse, arpège : cutoff fermé (−2 octaves) dans le passage qui
   *           précède une scène nettement plus forte, et qui s'ouvre jusqu'au réglage du son sur ses 4 dernières mesures ;
   *   qa    : questions et réponses — mélodie : une mesure forte (110 %), une mesure douce (75 %) dans les scènes calmes ;
   *   acid  : montée acide — basse : la résonance grimpe (×1 → ×2,6) sur le pont, puis retombe d'un coup à la scène suivante.
   * ctx : { song: [{ scene, repeat }], scenes: [{ id, sec, name, bars }], energy: Map(sec → 0..1), beatsPerBar,
   *         ins: [{ cols: [id], kind, name, filter: bool }] }.
   * Renvoie [{ id, label, why, k, plan: [{ col, block, rep, k, beats: { temps: valeur } }] }] (mouvements possibles seulement).
   */
  const MOVES = [
    { id: 'open', label: 'Le filtre s’ouvre vers le sommet', k: 'cut', need: 'Il faut une scène nettement plus forte que celle d’avant, et des accords, une basse ou un arpège à filtre (pas le Juno-106).' },
    { id: 'qa', label: 'Questions et réponses de vélocité', k: 'vel', need: 'Il faut une mélodie et au moins une scène calme.' },
    { id: 'acid', label: 'Montée acide au pont', k: 'res', need: 'Il faut une basse à filtre (pas le Juno-106) et un pont, ou une scène calme au milieu de la chanson.' },
  ];
  function moves(ctx) {
    const bpb = ctx.beatsPerBar || 4;
    const sceneOf = (id) => ctx.scenes.find((x) => x.id === id);
    const eOf = (b) => {
      const sc = b && sceneOf(b.scene);
      return sc && ctx.energy.has(sc.sec) ? ctx.energy.get(sc.sec) : null;
    };
    const join = (a) => a.join(', ').replace(/, ([^,]*)$/, ' et $1');
    const names = (list) => join(list.map((x) => x.name));
    const uniq = (a) => [...new Set(a)];
    const top = Math.max(0, ...ctx.song.map(eOf).filter((x) => x != null));
    const out = [];
    const make = (id, targets, blocksFn, why) => {
      const plan = [];
      const where = [];
      for (const T of targets)
        for (const [i, b] of ctx.song.entries()) {
          const sc = sceneOf(b.scene);
          if (!sc) continue;
          const reps = blocksFn(i, b, sc);
          if (!reps) continue;
          where.push(sc.name);
          for (const [rep, beats] of reps) if (Object.keys(beats).length) T.cols.forEach((col) => plan.push({ col, block: i, rep, k: MOVES.find((m) => m.id === id).k, beats }));
        }
      if (plan.length) out.push({ ...MOVES.find((m) => m.id === id), plan, why: why(targets, uniq(where)) });
    };
    // le filtre s'ouvre : passage suivi d'une scène nettement plus forte (dans le haut de la chanson)
    const opens = ctx.ins.filter((T) => T.filter && ['chords', 'bass', 'arp'].includes(T.kind));
    make('open', opens, (i, b, sc) => {
      const e = eOf(b), en = eOf(ctx.song[i + 1]);
      if (e == null || en == null || en < top - 0.2 || en - e < 0.1) return null;
      const n = sc.bars * bpb;
      const L = Math.min(4, sc.bars) * bpb;
      const reps = [];
      for (let r = 0; r < b.repeat; r++) {
        const beats = {};
        for (let x = 0; x < n; x++) {
          const j = x - (n - L);
          beats[x] = r === b.repeat - 1 && j >= 0 ? -2 + (2 * j) / Math.max(1, L - 1) : -2;
        }
        reps.push([r, beats]);
      }
      return reps;
    }, (ts, where) => `${names(ts)} : le filtre fermé dans ${join(where)} s’ouvre sur les 4 dernières mesures. L’oreille sent le sommet arriver avant qu’il n’éclate.`);
    // questions et réponses : mélodie, scènes calmes
    const singers = ctx.ins.filter((T) => T.kind === 'melody');
    make('qa', singers, (i, b, sc) => {
      const e = eOf(b);
      if (e == null || e > 0.6 || e >= top) return null;
      const n = sc.bars * bpb;
      const reps = [];
      for (let r = 0; r < b.repeat; r++) {
        const beats = {};
        for (let x = 0; x < n; x++) beats[x] = Math.floor(x / bpb) % 2 ? 0.75 : 1.1;
        reps.push([r, beats]);
      }
      return reps;
    }, (ts, where) => `${names(ts)} : une mesure forte, une mesure douce, dans ${join(where)}. La phrase respire sans changer une note.`);
    // montée acide : la basse sur le pont (ou le passage le plus calme du milieu, suivi d'une montée)
    const basses = ctx.ins.filter((T) => T.filter && T.kind === 'bass');
    const mids = ctx.song.map((b, i) => ({ b, i })).filter(({ i }) => i > 0 && i < ctx.song.length - 1);
    const named = mids.find(({ b }) => /pont|bridge|break|middle|interlude/i.test(((sceneOf(b.scene) || {}).sec || '') + ' ' + ((sceneOf(b.scene) || {}).name || '')));
    const calm = mids.filter(({ b, i }) => eOf(b) != null && eOf(ctx.song[i + 1]) != null && eOf(ctx.song[i + 1]) > eOf(b)).sort((x, y) => eOf(x.b) - eOf(y.b))[0];
    const pick = named || calm;
    make('acid', pick ? basses : [], (i, b, sc) => {
      if (i !== pick.i) return null;
      const n = sc.bars * bpb;
      const beats = {};
      for (let x = 0; x < n; x++) beats[x] = 1 + 1.6 * Math.pow(x / Math.max(1, n - 1), 1.6);
      return [[b.repeat - 1, beats]];
    }, (ts, where) => `${names(ts)} : la résonance grimpe pendant ${where[0]} puis retombe d’un coup à la scène suivante. La tension monte sur un seul instrument.`);
    return out;
  }

  return { CURVES, target, stats, energies, blocks, diagnose, MOVES, moves };
})();
