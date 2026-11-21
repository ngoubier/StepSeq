/*
 * Motifs de basse de la Grille : le catalogue des modes de basse de Nouvelle chanson (js/band.js BASS_MODES,
 * moteur js/bandsong.js bassEvents), rangés par style, pour le bouton MOTIF des pistes de basse et la fenêtre
 * Nouvelle piste. La lecture est dans js/chords.js (track.follow = { play: 'motif', motif, motifs, oct }).
 */
window.SS = window.SS || {};

SS.bassMotifs = (() => {
  /** Styles : [id, nom, motifs]. Un motif peut être dans plusieurs styles ; « Tous » les montre une fois. */
  const GROUPS = [
    ['synth', 'Synthwave & 80s', ['8', 'gallop', 'oct', 'pulse8', 'sync', 'roll', 'whole', 'half', 'quarter', 'walk', 'drone', 'rootfifth', 'arp', 'pickup', 'sixteen', 'oct16']],
    ['pop', 'Pop-rock', ['rock8', 'ballade', 'b03', 'quarter', 'rootfifth']],
    ['funk', 'Funk & Disco', ['disco16', 'slap', 'funk', 'oct']],
    ['soul', 'Soul & Jazz', ['motown', 'walking', 'ballade']],
    ['hiphop', 'Hip-hop & Trap', ['boombap', 'sub808', 'trap808']],
    ['dnb', 'Drum & bass', ['reese', 'dnbroll']],
    ['latin', 'Latin & Reggae', ['tresillo', 'dembow', 'tumbao', 'onedrop', 'roots', 'bossa', 'afro']],
    ['techno', 'Techno & House', ['hades', 'seismic', 'oracle', 'troy', 'phalanx', 'necropolis', 'styx', 'athens', 'mythos', 'thebes', 'acid', 'offbeat', 'off16', 'trance']],
  ];
  /** Conseillés dans la fenêtre Nouvelle piste. */
  const PICKS = ['8', 'rock8', 'disco16'];

  const modes = () => (SS.band && SS.band.BASS_MODES) || [];
  const entry = (id) => modes().find((m) => m[0] === id);
  const name = (id) => (entry(id) || [id, id])[1];
  const desc = (id) => (entry(id) || [])[2] || '';
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

  // dessin : la première mesure du motif sur Am puis F (le vrai moteur), hauteur 0 grave, 1 milieu, 2 octave
  const draws = {};
  function svg(id) {
    if (!draws[id]) {
      let ev = [];
      try {
        const sp = [
          { step: 0, len: 16, bar: 0, chord: { rootPc: 9, type: 'min', tok: 'Am' } },
          { step: 16, len: 16, bar: 1, chord: { rootPc: 5, type: 'maj', tok: 'F' } },
        ];
        ev = SS.bandSong.bassEvents(sp, id, () => 0.5, [9, 11, 0, 2, 4, 5, 7]).filter((e) => e.step < 16);
      } catch (e) {
        ev = [];
      }
      const bars = [1, 2, 3].map((b) => `<rect x="${b * 40}" y="0" width=".6" height="22" fill="currentColor" opacity=".25"/>`).join('');
      const rects = ev
        .map((e) => {
          const d = e.notes[0] - 33;
          const lv = d === 0 ? 0 : d >= 12 ? 2 : 1;
          return `<rect x="${e.step * 10 + 0.5}" y="${[14, 8, 2][lv]}" width="${Math.max(3, e.len * 10 - 1.5)}" height="6" rx="1.5" fill="currentColor"${e.vel < 0.5 ? ' opacity=".4"' : ''}/>`;
        })
        .join('');
      draws[id] = `<svg viewBox="0 0 160 22" preserveAspectRatio="none" aria-hidden="true">${bars}${rects}</svg>`;
    }
    return draws[id];
  }

  return { GROUPS, PICKS, all, inGroup, name, desc, isBass, svg };
})();
