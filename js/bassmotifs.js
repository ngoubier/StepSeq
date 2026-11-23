/*
 * Motifs de basse de la Grille : le catalogue des modes de basse de Nouvelle chanson (js/band.js BASS_MODES,
 * moteur js/bandsong.js bassEvents), rangés par style, pour le bouton MOTIF des pistes de basse et la fenêtre
 * Nouvelle piste. La lecture est dans js/chords.js (track.follow = { play: 'motif', motif, motifs, oct }).
 */
window.SS = window.SS || {};

SS.bassMotifs = (() => {
  /** Styles : [id, nom, motifs]. Un motif peut être dans plusieurs styles ; « Tous » les montre une fois. */
  const GROUPS = [
    ['synth', 'Synthwave & 80s', ['8', 'gallop', 'oct', 'pulse8', 'sync', 'roll', 'whole', 'half', 'quarter', 'walk', 'drone', 'rootfifth', 'arp', 'pickup', 'sixteen', 'oct16', 'pointee']],
    ['pop', 'Pop-rock', ['rock8', 'ballade', 'b03', 'quarter', 'rootfifth', 'pointee', 'anticip', 'walkup', 'boomchick']],
    ['funk', 'Funk & Disco', ['disco16', 'slap', 'funk', 'oct']],
    ['soul', 'Soul & Jazz', ['motown', 'walking', 'walkskip', 'ballade', 'ballade128', 'pointee', 'chroma', 'walkup']],
    ['hiphop', 'Hip-hop & Trap', ['boombap', 'sub808', 'trap808', 'drill']],
    ['dnb', 'Drum & bass', ['reese', 'dnbroll']],
    ['latin', 'Latin & Reggae', ['tresillo', 'dembow', 'tumbao', 'onedrop', 'roots', 'bossa', 'afro', 'chacha', 'cumbia', 'baiao', 'montuno', 'tumbao23', 'amapiano']],
    ['techno', 'Techno & House', ['hades', 'seismic', 'oracle', 'troy', 'phalanx', 'necropolis', 'styx', 'athens', 'mythos', 'thebes', 'acid', 'offbeat', 'off16', 'trance', 'twostep']],
    ['ternary', '3/4, 6/8, 12/8', ['valse', 'valsejazz', 'ballade68', 'galop68', 'slow128', 'boogie128', 'berce128', 'valsepop', 'valseavance', 'valse8', 'valseped', 'tarentelle', 'oct68', 'arp68b', 'gigue', 'shuffle128', 'arp128b', 'gospel128', 'marche128', 'whole', 'quarter', '8', 'pulse8', 'oct', 'drone', 'walking', 'rootfifth', 'arp']],
    ['famous', '★ Célèbres', ['cel_chic', 'cel_hitsville', 'cel_pfunk', 'cel_thumb', 'cel_fretless', 'cel_liverpool', 'cel_studio60', 'cel_gallop', 'cel_motorik', 'cel_coldwave', 'cel_staccato80', 'cel_steppers', 'cel_ska', 'cel_boogie', 'cel_rockabilly', 'cel_lagos', 'cel_surdo', 'cel_gfunk', 'cel_frenchtouch', 'cel_wobble', 'cel_neosoul']],
  ];
  /** Conseillés dans la fenêtre Nouvelle piste. */
  const PICKS = ['8', 'rock8', 'disco16'];

  const modes = () => (SS.band && SS.band.BASS_MODES) || [];
  const entry = (id) => modes().find((m) => m[0] === id);
  const name = (id) => (entry(id) || [id, id])[1];
  const desc = (id) => (entry(id) || [])[2] || '';
  /** Pas par mesure du motif : 12 (3/4, 6/8), 24 (12/8) ou 16 (4/4). */
  const barOf = (id) => (SS.bandSong && SS.bandSong.motifBar ? SS.bandSong.motifBar(id) : 16);
  /** Motifs sans mesure fixe (une note par temps, par croche, tenue) : jouables dans toutes les mesures. */
  const ANY_METER = ['whole', 'quarter', '8', 'pulse8', 'oct', 'drone', 'half', 'sixteen', 'oct16', 'walking', 'rootfifth', 'arp', 'b03'];
  /** Le motif va-t-il dans une mesure de `spb` pas ? (16 = 4/4 ; 12 = 3/4 ou 6/8 ; 24 = 12/8) */
  const fits = (id, spb = 16) => barOf(id) === spb || (spb !== 16 && ANY_METER.includes(id));
  /** Tous les motifs, dans l'ordre des styles, puis ceux qu'aucun style ne range. */
  function all() {
    const ids = [...new Set(GROUPS.flatMap((g) => g[2]))].filter((id) => entry(id));
    modes().forEach((m) => !ids.includes(m[0]) && ids.push(m[0]));
    return ids;
  }
  const inGroup = (g) => (g === 'all' ? all() : ((GROUPS.find((x) => x[0] === g) || [])[2] || []).filter((id) => entry(id)));

  /** Piste de basse : son rangé dans le rôle Basse (js/catalog.js), ou piste qui joue déjà un motif. */
  function isBass(t) {
    if (!t || t.type !== 'instrument') return false;
    if (SS.playsMotif(t) || (t.lastFollow && t.lastFollow.play === 'motif')) return true;
    if (t.band && /bass|basse/i.test(String(t.band.col || t.band.role || ''))) return true;
    try {
      const s = SS.isAnalog(t) ? { type: 'synth', patch: t.junoPatch } : { type: 'instrument', family: t.family, instrument: t.instrument };
      return SS.catalog.valueOf(s).role === 'bass';
    } catch (e) {
      return t.family === 'bass';
    }
  }

  // dessin : le motif (une ou deux mesures) sur Am puis F (le vrai moteur), hauteur 0 grave, 1 milieu, 2 octave ;
  // les notes décalées (triolets) sont dessinées à leur vraie place
  const draws = {};
  function svg(id, spb, beat0) {
    const ck = `${id}|${spb || ''}|${beat0 || ''}`;
    if (!draws[ck]) {
      const nb = (SS.bandSong.motifBars && SS.bandSong.motifBars(id)) || 1;
      const bl = spb && barOf(id) === 16 ? spb : barOf(id); // pas par mesure (12 en 3/4 et 6/8, 24 en 12/8 ; motif sans mesure : celle du morceau)
      const M = SS.bandSong.METER[id];
      const beat = M ? SS.bandSong.METERS[M][1] : beat0 || 4; // temps : noire, ou noire pointée en 6/8 et 12/8
      let ev = [];
      try {
        const sp = [
          { step: 0, len: bl, bar: 0, chord: { rootPc: 9, type: 'min', tok: 'Am' } },
          { step: bl, len: bl, bar: 1, chord: { rootPc: 5, type: 'maj', tok: 'F' } },
        ];
        ev = SS.bandSong.bassEvents(sp, id, () => 0.5, [9, 11, 0, 2, 4, 5, 7], { spb: bl, beat }).filter((e) => e.step < bl * nb);
      } catch (e) {
        ev = [];
      }
      const w = 160 / (bl * nb); // largeur d'un pas
      const per = bl / beat; // temps par mesure
      const bars = Array.from({ length: per * nb - 1 }, (_, i) => i + 1)
        .map((b) => `<rect x="${b * beat * w}" y="0" width="${b % per ? 0.6 : 1.2}" height="22" fill="currentColor" opacity="${b % per ? 0.25 : 0.5}"/>`)
        .join('');
      const rects = ev
        .map((e) => {
          const d = e.notes[0] - (e.step < bl ? 33 : 41);
          const lv = d === 0 ? 0 : d >= 12 ? 2 : 1;
          return `<rect x="${(e.step + (e.shift || 0)) * w + 0.5}" y="${[14, 8, 2][lv]}" width="${Math.max(2, e.len * w - 1.5)}" height="6" rx="1.5" fill="currentColor"${e.vel < 0.5 ? ' opacity=".4"' : ''}/>`;
        })
        .join('');
      draws[ck] = `<svg viewBox="0 0 160 22" preserveAspectRatio="none" aria-hidden="true">${bars}${rects}</svg>`;
    }
    return draws[ck];
  }

  /** Puce de départ selon le style de la chanson (Nouvelle chanson) : 'all' si aucun style ne correspond. */
  const STYLE_GROUP = { synthwave: 'synth', ambient: 'synth', edm: 'techno', techno: 'techno', pop: 'pop', funk: 'funk', soul: 'soul', hiphop: 'hiphop', dnb: 'dnb', latin: 'latin' };
  const groupOfStyle = (style) => STYLE_GROUP[style] || 'all';

  /**
   * Écran de choix partagé (fenêtre MOTIF de la Grille, étape Basse de Nouvelle chanson) : puces de style + cartes.
   * o = { group, cur, insp?, mark?, none?: { on, pick }, onGroup(g), onPick(id), lib?, keep? } ; mark : puce marquée d'un point
   * (style de la chanson) ; lib : autre bibliothèque de motifs ({ GROUPS, inGroup, name, desc, svg, noneTitle, label }, par
   * exemple SS.padMotifs) ; keep(id) : filtre en plus du style ; spb : pas par mesure du morceau (12 en 3/4 et 6/8, 24 en
   * 12/8 : seuls les motifs qui y vont) ; beat : pas par temps (6 en 6/8 et 12/8). Rend [puces, cartes].
   */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  }
  function picker(o) {
    const L = o.lib || { GROUPS, inGroup, name, desc, svg, noneTitle: 'La basse se tait dans cette scène', label: 'Motifs de basse' };
    const chips = el(
      'div',
      { class: 'mot-chips', role: 'radiogroup', 'aria-label': 'Styles' },
      [['all', 'Tous'], ...L.GROUPS.filter((g) => (o.lib ? g[0] !== 'ternary' || (o.spb || 16) !== 16 : (g[0] === 'ternary') === ((o.spb || 16) !== 16))).map((g) => [g[0], g[1]])].map(([id, l]) =>
        el('button', { type: 'button', role: 'radio', 'aria-checked': String(o.group === id), class: 'mot-chip' + (o.group === id ? ' on' : '') + (o.mark === id ? ' mark' : ''), 'data-g': id, onclick: () => o.onGroup(id) }, l)
      )
    );
    const card = (id) =>
      el(
        'button',
        { type: 'button', role: 'radio', 'aria-checked': String(id === o.cur), class: 'mot-card' + (id === o.cur ? ' on' : ''), 'data-id': id, title: L.desc(id), onclick: () => o.onPick(id) },
        el('span', { class: 'mot-name' }, el('span', {}, L.name(id)), id === o.insp ? el('em', { class: 'mot-insp' }, 'Inspiration') : null),
        el('span', { class: 'mot-draw', html: L.svg(id, o.lib ? undefined : o.spb, o.beat) })
      );
    const none = o.none
      ? el(
          'button',
          { type: 'button', role: 'radio', 'aria-checked': String(!!o.none.on), class: 'mot-card mot-none' + (o.none.on ? ' on' : ''), 'data-id': 'none', title: L.noneTitle, onclick: () => o.none.pick() },
          el('span', { class: 'mot-name' }, el('span', {}, 'Aucune')),
          el('span', { class: 'mot-draw', html: '<svg viewBox="0 0 160 22" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="10.5" width="160" height="1" fill="currentColor" opacity=".35"/></svg>' })
        )
      : null;
    const cards = el('div', { class: 'mot-cards', role: 'radiogroup', 'aria-label': L.label }, none, L.inGroup(o.group).filter((id) => (!o.keep || o.keep(id)) && (o.lib || fits(id, o.spb || 16))).map(card));
    return [chips, cards];
  }

  return { GROUPS, PICKS, all, inGroup, name, desc, isBass, svg, picker, groupOfStyle, fits, barOf };
})();
