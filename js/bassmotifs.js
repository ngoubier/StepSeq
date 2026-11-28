/*
 * Motifs de basse de la Grille : le catalogue des modes de basse de Nouvelle chanson (MODES, ex-BASS_MODES de js/band.js,
 * moteur js/bandsong.js bassEvents), rangés par style, pour le bouton MOTIF des pistes de basse et la fenêtre
 * Nouvelle piste. La lecture est dans js/chords.js (track.follow = { play: 'motif', motif, motifs, oct }).
 */
window.SS = window.SS || {};

SS.bassMotifs = (() => {
  const every = (dt, len, lv = () => 0) => Array.from({ length: 16 / dt }, (_, i) => [i * dt, len, lv(i)]);
  const perBeat = (f) => [0, 4, 8, 12].flatMap(f);
  /**
   * Modes de la basse (js/bandsong.js, bassEvents) : [identifiant, nom, description, dessin, doux]. Le dessin (notes :
   * [pas, durée, hauteur 0 grave, 1 quinte, 2 octave]) sert aux cartes de l'étape Basse de l'assistant (js/band.js).
   * Ce fichier doit être chargé après js/bandsong.js (BASS_NEW) et avant js/band.js.
   */
  const MODES = [
    ['whole', 'Tenue', 'Une note par accord, tenue', [[0, 16, 0]]],
    ['half', 'Blanches', 'Deux attaques par mesure, posé', every(8, 8)],
    ['quarter', 'Noires', 'Sur chaque temps : pop, rock', every(4, 3)],
    ['8', 'Croches', 'Huit croches régulières : le moteur synthwave', every(2, 2)],
    ['gallop', 'Galop', 'Croche et deux doubles : la cavalcade 80s', perBeat((s) => [[s, 2, 0], [s + 2, 1, 0], [s + 3, 1, 0]])],
    ['offbeat', 'Contretemps', 'Entre les kicks : la basse house', every(4, 2).map(([s, l, v]) => [s + 2, l, v])],
    ['oct', 'Octaves', 'Grave / aigu en croches : disco, italo', every(2, 2, (i) => (i % 2 ? 2 : 0))],
    ['roll', 'Roulement', 'Trois doubles par temps, l’octave au milieu', perBeat((s) => [[s + 1, 1, 0], [s + 2, 1, 2], [s + 3, 1, 0]])],
    ['sync', 'Syncopée', '1, 1a, 2&, 3, 3a, 4& avec octave et quinte', [[0, 3, 0], [3, 2, 2], [6, 2, 0], [8, 3, 1], [11, 2, 2], [14, 2, 0]]],
    ['walk', 'Marche', 'Fondamentale, puis quinte à la demi-mesure', [[0, 6, 0], [8, 6, 1]]],
    ['drone', 'Drone', 'Une note tenue par accord, sans attaque marquée', [[0, 16, 0]], true],
    ['pulse8', 'Croches piquées', 'Huit croches courtes, détachées', every(2, 1)],
    ['off16', 'Après le kick', 'Deux doubles « et-a » après chaque temps : techno mélodique', perBeat((s) => [[s + 2, 1, 0], [s + 3, 1, 0]])],
    // modes ajoutés au moteur : fondamentale-quinte, arpège, tresillo, trance, doubles, octaves en doubles, reprise, funk
    ...((SS.bandSong && SS.bandSong.BASS_NEW) || []),
  ];
  /** Styles : [id, nom, motifs]. Un motif peut être dans plusieurs styles ; « Tous » les montre une fois. */
  const GROUPS = [
    ['synth', 'Synthwave & 80s', ['8', 'gallop', 'oct', 'pulse8', 'sync', 'roll', 'whole', 'half', 'quarter', 'walk', 'drone', 'rootfifth', 'arp', 'pickup', 'sixteen', 'oct16', 'pointee', 'sequence8']],
    ['pop', 'Pop-rock', ['rock8', 'ballade', 'b03', 'quarter', 'rootfifth', 'pointee', 'anticip', 'walkup', 'boomchick']],
    ['funk', 'Funk & Disco', ['disco16', 'slap', 'funk', 'oct']],
    ['soul', 'Soul & Jazz', ['motown', 'walking', 'walkskip', 'ballade', 'ballade128', 'pointee', 'chroma', 'walkup']],
    ['hiphop', 'Hip-hop & Lo-fi', ['boombap', 'sub808', 'trap808', 'drill']],
    ['dnb', 'Drum & bass', ['reese', 'dnbroll']],
    ['latin', 'Latin & Reggae', ['tresillo', 'dembow', 'tumbao', 'onedrop', 'roots', 'bossa', 'afro', 'chacha', 'cumbia', 'baiao', 'montuno', 'tumbao23', 'amapiano']],
    ['electro', 'Électro', ['hades', 'seismic', 'oracle', 'troy', 'phalanx', 'necropolis', 'styx', 'athens', 'mythos', 'thebes', 'acid', 'offbeat', 'off16', 'trance', 'twostep']],
    ['ternary', '3/4, 6/8, 12/8', ['valse', 'valsejazz', 'ballade68', 'galop68', 'slow128', 'boogie128', 'berce128', 'valsepop', 'valseavance', 'valse8', 'valseped', 'tarentelle', 'oct68', 'arp68b', 'gigue', 'shuffle128', 'arp128b', 'gospel128', 'marche128', 'whole', 'quarter', '8', 'pulse8', 'oct', 'drone', 'walking', 'rootfifth', 'arp']],
    ['famous', 'Célèbres', ['cel_chic', 'cel_hitsville', 'cel_pfunk', 'cel_thumb', 'cel_fretless', 'cel_liverpool', 'cel_studio60', 'cel_gallop', 'cel_motorik', 'cel_coldwave', 'cel_staccato80', 'cel_steppers', 'cel_ska', 'cel_boogie', 'cel_rockabilly', 'cel_lagos', 'cel_surdo', 'cel_gfunk', 'cel_frenchtouch', 'cel_wobble', 'cel_neosoul']],
  ];
  /**
   * Familles (carte Motif commune, js/motifpicker.js) : [id, nom, motifs]. Tenues : notes longues ; Régulières : une
   * pulsation égale (croches, noires, doubles, valse) ; Syncopées : des coups hors des temps ; Lignes : la basse se
   * promène sur plusieurs notes (walking, arpège, approche). Un motif absent d'ici est rangé dans Syncopées.
   */
  const FAMS = [
    ['tenue', 'Tenues', ['whole', 'half', 'walk', 'drone', 'pickup', 'ballade', 'sub808', 'reese', 'valseped']],
    ['regul', 'Régulières', ['8', 'sequence8', 'oct', 'pulse8', 'quarter', 'rootfifth', 'sixteen', 'oct16', 'rock8', 'boomchick', 'hades', 'offbeat', 'off16', 'trance', 'valse', 'valsepop', 'valseavance', 'valse8', 'oct68', 'tarentelle', 'marche128', 'shuffle', 'cel_motorik', 'cel_rockabilly', 'cel_wobble']],
    ['synco', 'Syncopées', ['gallop', 'sync', 'roll', 'pointee', 'anticip', 'disco16', 'slap', 'funk', 'boombap', 'trap808', 'drill', 'dnbroll', 'tresillo', 'dembow', 'tumbao', 'onedrop', 'roots', 'bossa', 'afro', 'chacha', 'cumbia', 'baiao', 'montuno', 'tumbao23', 'amapiano', 'seismic', 'oracle', 'troy', 'phalanx', 'necropolis', 'styx', 'athens', 'mythos', 'thebes', 'twostep', 'ballade128', 'ballade68', 'galop68', 'slow128', 'berce128', 'gigue', 'cel_chic', 'cel_pfunk', 'cel_thumb', 'cel_studio60', 'cel_gallop', 'cel_steppers', 'cel_lagos', 'cel_surdo', 'cel_gfunk', 'cel_frenchtouch']],
    ['ligne', 'Lignes', ['arp', 'b03', 'walkup', 'motown', 'walking', 'walkskip', 'chroma', 'acid', 'valsejazz', 'boogie128', 'arp68b', 'arp128b', 'shuffle128', 'gospel128', 'cel_hitsville', 'cel_fretless', 'cel_liverpool', 'cel_coldwave', 'cel_staccato80', 'cel_ska', 'cel_boogie', 'cel_neosoul']],
  ];
  // « Mes motifs » : ceux écrits dans la fenêtre « Mon motif de basse » (js/mybass.js), dans tous les styles
  FAMS.push(['mine', '✎ Mes motifs', []]);
  const mine = () => (SS.bandSong && SS.bandSong.myBassIds ? SS.bandSong.myBassIds() : []);
  const isMine = (id) => /^my_/.test(id || '');
  const familyOf = (id) => (isMine(id) ? 'mine' : (FAMS.find((f) => f[2].includes(id)) || ['synco'])[0]);
  /** Conseillés dans la fenêtre Nouvelle piste. */
  const PICKS = ['8', 'rock8', 'disco16'];

  const modes = () => [...MODES, ...mine().map((id) => [id, SS.bandSong.myBass(id).name, ''])];
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
  const inGroup = (g) => (g === 'all' ? all() : [...((GROUPS.find((x) => x[0] === g) || [])[2] || []).filter((id) => entry(id)), ...mine()]);

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
    const ck = `${id}|${spb || ''}|${beat0 || ''}${isMine(id) && SS.myBass ? '|' + SS.myBass.version() : ''}`; // un motif écrit change : nouveau dessin
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
  // la basse n'a pas de motifs « Film & ambient » : une chanson ambient part sur Synthwave
  const groupOfStyle = (style) => (style === 'ambient' ? 'synth' : SS.motifPicker.styleOfSong(style));

  /**
   * Écran de choix partagé (fenêtre MOTIF de la Grille, étapes Basse et Nappe de Nouvelle chanson) : la carte Motif
   * commune (SS.motifPicker.render). o = { group, cur, insp?, auto?, mark?, onGroup(g), onPick(id), lib?, keep?, spb?,
   * beat?, fam?, onFam?(f), stars?, surprise?, advanced?, addCard? } ; advanced : bouton « Avancé… » à côté de Surprends-moi ;
   * addCard : carte « ＋ Nouveau motif… » au bout de la famille « ✎ Mes motifs » ; mark : puce marquée d'un point (style de la chanson) ; lib : autre
   * bibliothèque ({ GROUPS, inGroup, name, desc, svg, FAMS, familyOf, label }, par exemple SS.padMotifs) ; keep(id) :
   * filtre en plus du style ; spb : pas par mesure du morceau (12 en 3/4 et 6/8, 24 en 12/8 : seuls les motifs qui y
   * vont) ; beat : pas par temps (6 en 6/8 et 12/8) ; sans onFam, pas de ligne de familles. Rend [puces, familles, cartes].
   */
  function picker(o) {
    const MP = SS.motifPicker;
    const L = o.lib || { GROUPS, FAMS, familyOf, inGroup, name, desc, svg, label: 'Motifs de basse' };
    const spb = o.spb || 16;
    const ok = (id) => (!o.keep || o.keep(id)) && (o.lib || fits(id, spb));
    const ids = (g) => L.inGroup(g).filter(ok);
    const own = L.GROUPS.filter((g) => !MP.STYLE_IDS.includes(g[0]) && (g[0] !== 'ternary' || spb !== 16)).map((g) => [g[0], g[1]]);
    return MP.render({
      styles: [...MP.STYLES, ...own],
      group: o.group,
      mark: o.mark,
      onGroup: o.onGroup,
      count: (g) => ids(g).length,
      fams: o.onFam ? L.FAMS.map((f) => [f[0], f[1]]) : null,
      fam: o.fam,
      onFam: o.onFam,
      familyOf: L.familyOf,
      stars: (o.stars || []).filter(ok),
      ids: ids(o.group),
      cur: o.cur,
      insp: o.insp,
      auto: o.auto,
      name: L.name,
      desc: L.desc,
      svg: (id) => L.svg(id, o.lib ? undefined : o.spb, o.beat),
      onPick: o.onPick,
      label: L.label,
      surprise: o.surprise,
      mine: o.lib ? null : isMine,
      advanced: o.advanced,
      addCard: o.addCard,
    });
  }

  return { MODES, GROUPS, FAMS, familyOf, isMine, PICKS, all, inGroup, name, desc, isBass, svg, picker, groupOfStyle, fits, barOf };
})();
