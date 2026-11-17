/*
 * Bibliothèque de motifs de batterie (une mesure de 16 pas), par style : utilisée par l'assistant de chanson
 * (SS.bandSong.build, option parts.drums, js/bandsong.js). Aucun accès au DOM.
 *
 * Motif : { id, name, energy (1 calme, 2 moyen, 3 intense), lanes: { K, S, C, H, O } }
 *   K kick, S caisse claire, C clap, H charleston fermé, O charleston ouvert.
 *   Chaque piste est un texte de 16 caractères : x = fort, o = moyen, . = léger, - = silence ; absente ou vide = muette.
 * Fills : { name, from (pas de départ dans la mesure), ev: [[pas, piste, vélocité, tom?]] } ; piste T = toms
 *   (tom 0 aigu, 1 médium, 2 grave).
 */
window.SS = window.SS || {};

SS.DRUM_PATTERNS = {
    synthwave: [
      { id: 'motorik', name: 'Motorik', energy: 2, lanes: { K: 'x---x---x---x---', S: '----x-------x---', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'night-drive', name: 'Night Drive', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '----x-------x---', H: 'x.x.x.x.x.x.x.x.', O: '--------------x-' } },
      { id: 'ballade-half-time', name: 'Ballade half-time', energy: 1, lanes: { K: 'x-------x-------', S: '--------x-------', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'linndrum-pop', name: 'LinnDrum pop', energy: 2, lanes: { K: 'x-----x-x-------', S: '----x-------x---', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'retro-groove', name: 'Retro groove', energy: 2, lanes: { K: 'x-----x---x-----', S: '----x-------x---', H: 'x.x.x.x.x.x.x.x.' } },
      { id: 'outrun', name: 'Outrun', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '----x-------x---', H: 'x.-.x.-.x.-.x.-.', O: '--x---x---x---x-' } },
      { id: 'darksynth', name: 'Darksynth', energy: 3, lanes: { K: 'x-x-x---x-x-x---', S: '----x-------x---', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'gated-snare', name: 'Gated snare', energy: 2, lanes: { K: 'x-------x-x-----', S: 'o---x-------x---', C: '----x-------x---', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'chillwave', name: 'Chillwave', energy: 1, lanes: { K: 'x-------x--x----', S: '----o-------o---', H: '--x---x---x---x-' } },
      { id: 'shuffle-neon', name: 'Shuffle néon', energy: 2, lanes: { K: 'x-----x-x-----x-', S: '----x-------x---', H: 'x-x.x-x.x-x.x-x.' } },
      { id: 'disco-84', name: 'Disco 84', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', H: '--x---x---x---x-', O: '--x---x---x---x-' } },
      { id: 'sidechain-pump', name: 'Sidechain pump', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: '--x---x---x---x-' } },
      { id: 'breakbeat-retro', name: 'Breakbeat rétro', energy: 3, lanes: { K: 'x-----x---x-x---', S: '----x--o-o--x---', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'simmons', name: 'Simmons', energy: 2, lanes: { K: 'x-------x-------', S: '----x-------x---', H: 'x-x-x-x-x-x-x-x-', O: '------------x---' } },
      { id: 'kick-seul', name: 'Kick seul', energy: 1, lanes: { K: 'x---x---x---x---' } },
      { id: 'charleston-seul', name: 'Charleston seul', energy: 1, lanes: { H: 'x-x-x-x-x-x-x-x-', O: '--------------x-' } },
      { id: 'caisse-sur-le-4', name: 'Caisse sur le 4', energy: 1, lanes: { K: 'x-------x-------', S: '------------x---', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'power-ballad', name: 'Power ballad', energy: 2, lanes: { K: 'x-------x-x-----', S: '----x-------x---', H: 'x.x.x.x.x.x.x.x.', O: '--------------x-' } },
      { id: 'cyberpunk', name: 'Cyberpunk', energy: 3, lanes: { K: 'x--x--x-x--x--x-', S: '----x-------x---', C: '----x-------x---', H: 'xoxoxoxoxoxoxoxo' } },
      { id: 'grand-final', name: 'Grand final', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '----x-------x---', H: 'xoxoxoxoxoxoxoxo', O: '--x---x---x---x-' } },
    ],
    edm: [
      { id: 'four-on-the-floor', name: 'Four on the floor', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: '--x---x---x---x-' } },
      { id: 'big-room', name: 'Big Room', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '----x-------x---', H: 'x-x-x-x-x-x-x-x-', O: '--x---x---x---x-' } },
      { id: 'deep-house', name: 'Deep House', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: '..o...o...o...o.', O: '--x---x---x---x-' } },
      { id: 'tech-house', name: 'Tech House', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: 'x.o.x.o.x.o.x.o.', O: '--x---x---x---x-' } },
      { id: 'progressive', name: 'Progressive', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: 'xoxoxoxoxoxoxoxo', O: '--x---x---x---x-' } },
      { id: 'future-house', name: 'Future House', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '-------x------x-', H: 'x-x-x-x-x-x-x-x-', O: '--x---x---x---x-' } },
      { id: 'tropical', name: 'Tropical', energy: 2, lanes: { K: 'x---x---x---x---', S: '---x--x----x--x-', C: '----x-------x---', H: '--x---x---x---x-' } },
      { id: 'breakdown', name: 'Breakdown', energy: 1, lanes: { C: '----x-------x---', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'montee-croches', name: 'Montée en croches', energy: 2, lanes: { K: 'x---x---x---x---', S: 'x-x-x-x-x-x-x-x-' } },
      { id: 'montee-doubles', name: 'Montée en doubles', energy: 3, lanes: { K: 'x---x---x---x---', S: 'xoxoxoxoxoxoxoxo' } },
      { id: 'trance', name: 'Trance', energy: 3, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: 'x-xxx-xxx-xxx-xx', O: '--x---x---x---x-' } },
      { id: 'electro-house', name: 'Electro House', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '----x-------x---', H: 'xoxoxoxoxoxoxoxo' } },
      { id: 'drop-half-time', name: 'Drop half-time', energy: 3, lanes: { K: 'x-------x-x-----', S: '--------x-------', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'uk-garage', name: 'UK Garage', energy: 2, lanes: { K: 'x------x--x-----', S: '----x-------x---', H: 'x-xx-xx-x-xx-xx-' } },
      { id: 'disco-house', name: 'Disco House', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: 'x-x-x-x-x-x-x-x-', O: '--x---x---x---x-' } },
      { id: 'minimal', name: 'Minimal', energy: 2, lanes: { K: 'x---x---x---x---', C: '------------x---', H: '--x---x---x---x-' } },
      { id: 'kick-edm', name: 'Kick seul', energy: 1, lanes: { K: 'x---x---x---x---' } },
      { id: 'intro-filtree', name: 'Intro filtrée', energy: 1, lanes: { K: 'x---x---x---x---', H: '--x---x---x---x-' } },
      { id: 'moombah', name: 'Moombah', energy: 2, lanes: { K: 'x---x---x---x---', S: '---x--x----x--x-', H: 'x-x-x-x-x-x-x-x-' } },
      { id: 'festival', name: 'Festival', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '----x-------x---', H: 'xoxoxoxoxoxoxoxo', O: '--x---x---x---x-' } },
    ],
    ambient: [
      { id: 'battement-lent', name: 'Battement lent', energy: 1, lanes: { K: 'x---------------', H: '--------o-------' } },
      { id: 'pouls-doux', name: 'Pouls doux', energy: 1, lanes: { K: 'o-------o-------', H: '----.-------.---' } },
      { id: 'downtempo', name: 'Downtempo', energy: 2, lanes: { K: 'x------x--x-----', S: '----o-------o---', H: 'o-.-o-.-o-.-o-.-' } },
      { id: 'trip-hop', name: 'Trip-hop', energy: 2, lanes: { K: 'x-----x---x-----', S: '----x-------x---', H: 'x.o.x.o.x.o.x.o.' } },
      { id: 'glitch', name: 'Glitch', energy: 2, lanes: { K: 'x--x------x--x--', C: '------o------o-o', H: 'o.-o.o--o.-o.o-.' } },
      { id: 'charleston-fantome', name: 'Charleston fantôme', energy: 1, lanes: { H: '..o...o...o...o.' } },
      { id: 'balancier', name: 'Balancier', energy: 1, lanes: { K: 'o-------o-------', C: '------------o---' } },
      { id: 'rim-et-shaker', name: 'Rim et shaker', energy: 1, lanes: { S: '----.-------.---', H: '.o.o.o.o.o.o.o.o' } },
      { id: 'lo-fi', name: 'Lo-fi', energy: 2, lanes: { K: 'x-------x-x-----', S: '----o-------o---', H: 'o-o-o-o-o-o-o-o-' } },
      { id: 'respiration', name: 'Respiration', energy: 1, lanes: { O: 'o---------------' } },
      { id: 'croches-douces', name: 'Croches douces', energy: 2, lanes: { K: 'o---o---o---o---', H: '..o...o...o...o.' } },
      { id: 'berceuse', name: 'Berceuse', energy: 1, lanes: { K: 'o-----------o---', H: 'o---o---o---o---' } },
      { id: 'pluie', name: 'Pluie', energy: 1, lanes: { H: '.o.o.o.o.o.o.o.o' } },
      { id: 'coeur', name: 'Cœur', energy: 1, lanes: { K: 'x--o------------' } },
      { id: 'deep-ambient', name: 'Deep ambient', energy: 2, lanes: { K: 'o---o---o---o---', C: '------------o---', H: '--.---.---.---.-' } },
      { id: 'organique', name: 'Organique', energy: 2, lanes: { K: 'x-----x---x--x--', S: '----o-------o---', H: '.-.-.-.-.-.-.-.-' } },
      { id: 'dub', name: 'Dub', energy: 2, lanes: { K: 'x-------x-------', S: '--------x-------', O: '------o-------o-' } },
      { id: 'montee-douce', name: 'Montée douce', energy: 2, lanes: { K: 'o---o---o---o---', H: 'o-o-o-o-o-o-o-o-' } },
      { id: 'sans-batterie', name: 'Sans batterie', energy: 1, lanes: {  } },
      { id: 'cinematique', name: 'Cinématique', energy: 3, lanes: { K: 'x-------x-x-----', S: '----x-------x---', C: '----o-------o---', H: 'xoxoxoxoxoxoxoxo', O: '--------------x-' } },
    ],
    techno: [
      { id: 'techno-classique', name: 'Techno classique', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: '..o...o...o...o.', O: '--x---x---x---x-' } },
      { id: 'rolling', name: 'Rolling', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: '..o...o...o...o.', O: '--o-------o-----' } },
      { id: 'minimal-techno', name: 'Minimal', energy: 2, lanes: { K: 'x---x---x---x---', C: '------------x---', H: 'o.o.o.o.o.o.o.o.', O: '------o-------o-' } },
      { id: 'intro-kick', name: 'Intro : kick seul', energy: 1, lanes: { K: 'x---x---x---x---' } },
      { id: 'intro-hats', name: 'Intro : kick et charleston', energy: 1, lanes: { K: 'x---x---x---x---', H: '--o---o---o---o-' } },
      { id: 'break-calme', name: 'Break calme', energy: 1, lanes: { C: '--------o-------', H: '.-.-.-.-.-.-.-.-' } },
      { id: 'break-pouls', name: 'Break : pouls lent', energy: 1, lanes: { K: 'o-------o-------', H: '..o...o...o...o.' } },
      { id: 'montee-claps', name: 'Montée en croches', energy: 2, lanes: { K: 'x---x---x---x---', S: 'x-x-x-x-x-x-x-x-' } },
      { id: 'montee-serree', name: 'Montée serrée', energy: 3, lanes: { K: 'x---x---x---x---', S: 'xoxoxoxoxoxoxoxo' } },
      { id: 'peak-time', name: 'Peak time', energy: 3, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: 'xoxoxoxoxoxoxoxo', O: '--x---x---x---x-' } },
      { id: 'drumcode', name: 'Drumcode', energy: 3, lanes: { K: 'x---x---x---x---', S: '-------.-------.', C: '----x-------x---', H: 'o.o.o.o.o.o.o.o.', O: '--x---x---x---x-' } },
      { id: 'hypnotique', name: 'Hypnotique', energy: 2, lanes: { K: 'x---x---x---x---', H: '--o---o---o---o-', O: '--------o-------' } },
      { id: 'afterlife', name: 'Afterlife', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: '.-o-.-o-.-o-.-o-', O: '--o---o---o---o-' } },
      { id: 'tech-house-techno', name: 'Tech house', energy: 2, lanes: { K: 'x---x---x---x---', C: '----x-------x---', H: 'x.o.x.o.x.o.x.o.', O: '--x---x---x---x-' } },
      { id: 'kick-brise', name: 'Kick brisé', energy: 2, lanes: { K: 'x---x---x--xx---', C: '----x-------x---', H: '..o...o...o...o.', O: '--x---x---x---x-' } },
      { id: 'industriel', name: 'Industriel', energy: 3, lanes: { K: 'x---x---x---x-x-', S: '----x-------x---', H: 'xoxoxoxoxoxoxoxo' } },
      { id: 'minimal-sourd', name: 'Minimal sourd', energy: 1, lanes: { K: 'x---x---x---x---', H: '--.---.---.---.-' } },
      { id: 'drop-pleine', name: 'Drop pleine', energy: 3, lanes: { K: 'x---x---x---x---', S: '----x-------x---', C: '----x-------x---', H: 'x-x-x-x-x-x-x-x-', O: '--x---x---x---x-' } },
      { id: 'outro-allege', name: 'Outro allégé', energy: 1, lanes: { K: 'x---x---x---x---', C: '------------o---', H: '..o...o...o...o.' } },
      { id: 'break-charleston', name: 'Break : charleston seul', energy: 1, lanes: { H: 'o.o.o.o.o.o.o.o.' } },
    ],
};

SS.DRUM_FILLS = {
  roll: { name: 'Roulement de caisse claire', from: 8, ev: [8, 9, 10, 11, 12, 13, 14, 15].map((s, i) => [s, 'S', Math.round((0.35 + i * 0.09) * 100) / 100]) },
  toms: { name: 'Toms descendants', from: 8, ev: [[8, 'T', 0.9, 0], [9, 'T', 0.7, 0], [10, 'T', 0.85, 1], [11, 'T', 0.7, 1], [12, 'T', 0.9, 2], [13, 'T', 0.75, 2], [14, 'S', 0.9], [15, 'S', 1]] },
  clap4: { name: 'Clap × 4', from: 12, ev: [[12, 'C', 0.6], [13, 'C', 0.7], [14, 'C', 0.85], [15, 'C', 1]] },
  kick: { name: 'Kick qui accélère', from: 8, ev: [[8, 'K', 0.8], [10, 'K', 0.8], [12, 'K', 0.85], [13, 'K', 0.85], [14, 'K', 0.9], [15, 'K', 1]] },
  cut: { name: 'Coupure avant la reprise', from: 12, ev: [] },
  open: { name: 'Charleston ouvert', from: 14, ev: [[14, 'O', 0.9]] },
};

// fréquence du fill automatique : jamais, dernière mesure de la scène, toutes les 4 ou 8 mesures
SS.DRUM_FILL_EVERY = { off: 'Jamais', end: 'Fin de scène', 4: 'Toutes les 4 mesures', 8: 'Toutes les 8 mesures' };

/** Motif d'un style (null s'il n'existe pas) ; sans style, cherche l'identifiant dans tous les styles. */
SS.drumPattern = (styleId, id) => {
  const styles = styleId ? [styleId] : Object.keys(SS.DRUM_PATTERNS);
  for (const s of styles) {
    const p = (SS.DRUM_PATTERNS[s] || []).find((x) => x.id === id);
    if (p) return p;
  }
  return null;
};
