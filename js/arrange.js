/*
 * Arrangement : l'énergie de la chanson, scène par scène (étape « Arrangement » de l'assistant Nouvelle chanson, js/band.js).
 *
 *   stats(scene, groups)        ce que joue chaque instrument dans une scène : { counts: { id: notes ou coups }, active, hits, vel }
 *   energies(list)              énergie de chaque scène, ramenée entre 0,15 et 1 sur la chanson (densité, instruments actifs, vélocité)
 *   blocks(res)                 les passages de la chanson dans l'ordre (une scène répétée = plusieurs passages) : { sceneId, start, bars, t }
 *   target(curve, t)            l'énergie voulue à la position t (0..1) de la chanson pour une courbe (CURVES)
 *   diagnose(scenes, blocks, c) les points à travailler : [{ kind: ok | warn | info, sec, text, hint?, act? }]
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

  return { CURVES, target, stats, energies, blocks, diagnose };
})();
