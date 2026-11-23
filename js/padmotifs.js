/*
 * Motifs de nappe de Nouvelle chanson (étape Nappe) : nom, description, styles et façon de bouger de chaque mode du
 * moteur (js/bandsong.js chordEvents : modes d'origine, RHYTHM et PAD_NEW). Le choix se fait avec l'écran partagé de
 * la basse (SS.bassMotifs.picker, lib = cette bibliothèque) : puces de style + cartes, et un filtre Tenues | Rythmées |
 * En mouvement (KINDS).
 */
window.SS = window.SS || {};

SS.padMotifs = (() => {
  /** [id, nom, description, styles, sorte (tenue | rythme | mouv)] */
  const MODES = [
    ['sustain', 'Tenue', 'L’accord tenu', 'synth pop soul film elec', 'tenue'],
    ['swell', 'Montée douce', 'Accord tenu, entrée en douceur', 'synth film pop', 'tenue'],
    ['float', 'Planante', 'Accord ouvert, très doux', 'film synth', 'tenue'],
    ['pulse8', 'Croches', 'L’accord en croches', 'synth pop elec', 'rythme'],
    ['block4', 'Blocs', 'Un accord par temps', 'pop soul', 'rythme'],
    ['stabs', 'Stabs', 'Accords courts, syncopés', 'synth elec funk', 'rythme'],
    ['house', 'House', 'Accords de la house, sur les contretemps', 'elec', 'rythme'],
    ['chop', 'Hachée', 'Petits accords sur les contretemps', 'elec', 'rythme'],
    ['skank', 'Skank', 'Accord court sur 2 et 4 : piano reggae', 'latin', 'rythme'],
    ['bubble', 'Bubble', 'Orgue reggae : deux petits accords par temps, « et-a »', 'latin', 'rythme'],
    ['pluck', 'Pincée', 'Les notes de l’accord, en croches', 'pop film', 'mouv'],
    ['ballad', 'Ballade brisée', 'Basse tenue et accord brisé en croches : piano de ballade', 'pop soul', 'mouv'],
    ['strum', 'Grattée', 'Rythme de guitare acoustique', 'pop', 'rythme'],
    ['xmas', 'Grelots', 'Accords de Noël en shuffle, appuyés sur 2 et 4', 'pop', 'rythme'],
    // couleurs d'accord et mouvements de son
    ['add9', 'Neuvième', 'Accord tenu avec la neuvième : clair, moderne', 'pop film synth', 'tenue'],
    ['fifths', 'Quintes', 'Fondamentale et quinte, sans tierce : large et neutre', 'pop film', 'tenue'],
    ['octs', 'Octaves vides', 'Fondamentale sur trois octaves : sombre, immense', 'film elec', 'tenue'],
    ['mist', 'Brume', 'Grappe aiguë et très douce', 'film', 'tenue'],
    ['breath', 'Respiration', 'Tenu trois temps, un temps de silence', 'film soul', 'tenue'],
    ['pump', 'Pompe', 'Accord tenu qui s’efface à chaque temps, comme sous un kick (automation de volume)', 'elec synth', 'tenue'],
    ['filt', 'Filtre qui s’ouvre', 'Accord tenu, le filtre s’ouvre sur chaque mesure (automation du filtre)', 'elec synth', 'tenue'],
    ['rev', 'Souffle inversé', 'Monte jusqu’au bout de la mesure et se coupe net (automation de volume)', 'elec synth film', 'tenue'],
    // accords en mouvement
    ['sus', 'Suspendue', 'Quarte suspendue qui se pose sur la tierce', 'pop film soul', 'mouv'],
    ['inner', 'Voix intérieure', 'Accord tenu, la voix du milieu bouge : 3, 4, 3, 2', 'film pop', 'mouv'],
    ['cliche', 'Ligne descendante', 'La voix haute descend par demi-tons sur l’accord tenu', 'film soul pop', 'mouv'],
    ['climb', 'Voix qui monte', 'La voix haute monte : tierce, quinte, octave, neuvième', 'synth film', 'mouv'],
    ['choral', 'Choral', 'Quatre voix qui se balancent comme un cantique', 'soul film', 'mouv'],
    ['rock2', 'Balancement', 'L’accord et sa sus2, un temps sur deux', 'pop synth', 'mouv'],
    ['stagger', 'Entrées échelonnées', 'Les voix entrent l’une après l’autre, du grave à l’aigu', 'film', 'mouv'],
    // rythmes par style
    ['gallop', 'Galop', 'Croche et deux doubles à chaque temps', 'synth', 'rythme'],
    ['brass', 'Cuivres 80s', 'Deux coups de cuivre puis l’accord tenu', 'synth funk', 'rythme'],
    ['relaunch', 'Tenue relancée', 'Accord tenu, relancé sur le « et » du 3', 'synth pop', 'rythme'],
    ['p332', '3-3-2', 'Accents en trois-trois-deux : pop moderne', 'pop synth', 'rythme'],
    ['rock8', 'Croches rock', 'Accord de puissance en croches, appuyé sur 1 et 3', 'pop', 'rythme'],
    ['spicc', 'Spiccato', 'Cordes en croches, deux notes en alternance', 'film', 'rythme'],
    ['trem', 'Trémolo', 'Accord en doubles serrées, très doux', 'film', 'rythme'],
    ['gate', 'Gate trance', 'Accord haché par un motif de doubles', 'elec', 'rythme'],
    ['deep', 'Deep house', 'Accord de septième, syncopé', 'elec', 'rythme'],
    ['dub', 'Dub techno', 'Un accord et ses échos qui s’éteignent', 'elec', 'rythme'],
    ['clav', 'Clavinet', 'Doubles syncopées et sèches', 'funk', 'rythme'],
    ['disco', 'Cordes disco', 'Accords d’octave sur les contretemps', 'funk', 'rythme'],
    ['rhodes', 'Rhodes funk', 'Neuvièmes syncopées', 'funk soul', 'rythme'],
    ['charl', 'Charleston', 'Sur le 1 et le « et » du 2 : jazz', 'soul', 'rythme'],
    ['comp', 'Comping jazz', 'Accords sans fondamentale, en contretemps', 'soul', 'rythme'],
    ['gospel', 'Orgue gospel', 'Orgue tenu, relancé avant chaque demi-mesure', 'soul', 'rythme'],
    ['bossa', 'Bossa', 'Septièmes syncopées de la bossa', 'latin soul', 'rythme'],
    ['montuno', 'Montuno', 'Piano salsa : octaves et accord en alternance', 'latin', 'rythme'],
    ['montuno23', 'Montuno 2-3', 'Piano salsa en clave 2-3 : octaves anticipées et liées, accord au milieu, main gauche qui double', 'latin', 'rythme'],
    ['montuno32', 'Montuno 3-2', 'Le même montuno, calé sur la clave 3-2', 'latin', 'rythme'],
    ['guajeo23', 'Guajeo en octaves', 'Les octaves seules, la ligne du montuno (clave 2-3)', 'latin', 'rythme'],
    ['mambo23', 'Montuno du mambo', 'Croches continues appuyées sur la clave 2-3 : plus serré', 'latin', 'rythme'],
    ['skank2', 'Skank double', 'Skank sur 2 et 4 avec un rebond', 'latin', 'rythme'],
    ['lofi', 'Lo-fi', 'Septième tenue, relancée en retard', 'hiphop', 'rythme'],
    ['chops', 'Sample haché', 'Petits bouts d’accord, comme un sample découpé', 'hiphop', 'rythme'],
    ['dark', 'Chœur sombre', 'Accord grave tenu : trap, film', 'hiphop film', 'tenue'],
    // mesures ternaires (6e champ : la mesure ; ailleurs, ils ne sont pas proposés)
    ['valse3', 'Valse', 'Basse sur le 1, accord sur le 2 et le 3', 'ternary', 'rythme', '3/4'],
    ['arpvalse', 'Valse brisée', 'L’accord brisé en croches, sur trois temps', 'ternary', 'mouv', '3/4'],
    ['berce68', 'Berceuse 6/8', 'Un accord par temps : deux balancements par mesure', 'ternary', 'rythme', '6/8'],
    ['arp68', 'Arpège 6/8', 'L’accord brisé en croches, trois par temps', 'ternary', 'mouv', '6/8'],
    ['triolets128', 'Triolets 12/8', 'L’accord en croches, trois par temps : le slow des années 50', 'ternary', 'rythme', '12/8'],
    ['berce128', 'Bercée 12/8', 'Un accord par temps, appuyé sur le 1 et le 3', 'ternary', 'rythme', '12/8'],
    ['arp128', 'Arpège 12/8', 'L’accord brisé en triolets de croches', 'ternary', 'mouv', '12/8'],
  ];
  const GROUPS = [
    ['synth', 'Synthwave & 80s'],
    ['pop', 'Pop-rock'],
    ['funk', 'Funk & Disco'],
    ['soul', 'Soul & Jazz'],
    ['hiphop', 'Hip-hop & Lo-fi'],
    ['latin', 'Latin & Reggae'],
    ['elec', 'Techno & House'],
    ['film', 'Film & ambient'],
    ['ternary', '3/4, 6/8, 12/8'],
  ].map(([id, l]) => [id, l, MODES.filter((m) => m[3].split(' ').includes(id)).map((m) => m[0])]);
  const KINDS = [['all', 'Tout'], ['tenue', 'Tenues'], ['rythme', 'Rythmées'], ['mouv', 'En mouvement']];

  const entry = (id) => MODES.find((m) => m[0] === id);
  const name = (id) => (entry(id) || [id, id])[1];
  const desc = (id) => (entry(id) || [])[2] || '';
  const kindOf = (id) => (entry(id) || [])[4] || 'tenue';
  const all = () => MODES.map((m) => m[0]);
  /** Mesure propre du motif ('3/4', '6/8', '12/8'), ou null : il suit celle de la chanson. */
  const meterOf = (id) => (entry(id) || [])[5] || null;
  const inGroup = (g) => (g === 'all' ? all() : (GROUPS.find((x) => x[0] === g) || [, , []])[2]);
  /** Puce de départ selon le style de la chanson. */
  const STYLE_GROUP = { synthwave: 'synth', ambient: 'film', edm: 'elec', techno: 'elec', dnb: 'elec', pop: 'pop', funk: 'funk', soul: 'soul', hiphop: 'hiphop', latin: 'latin' };
  const groupOfStyle = (style) => STYLE_GROUP[style] || 'all';

  // dessin : une mesure sur Do mineur (le vrai moteur), chaque note de l'accord est un trait (grave en bas) ;
  // la ligne claire montre le volume ou le filtre qui bouge
  const draws = {};
  const FX_PATH = {
    pump: [0, 4, 8, 12].map((b) => `M${b * 10} 30L${b * 10 + 14} 6L${b * 10 + 40} 4`).join(''),
    filt: 'M0 31C60 30 110 20 160 3',
    rev: 'M0 31C90 30 140 18 158 3L158 31',
    swell: 'M0 31L90 4L160 4',
    mist: 'M0 31L120 4L160 4',
    dark: 'M0 31L50 4L160 4',
  };
  /** Dessin d'une mesure : celle du motif s'il en a une, sinon celle de la chanson (SS.bandSong.meter()). */
  function svg(id) {
    const BS = SS.bandSong;
    const was = BS && BS.meter ? BS.meter().sig : '4/4';
    const sig = meterOf(id) || was;
    const key = id + '@' + sig;
    if (!draws[key]) {
      let ev = [];
      if (sig !== was) BS.setMeter(sig);
      const { spb, beat } = BS && BS.meter ? BS.meter() : { spb: 16, beat: 4 };
      try {
        ev = BS.chordEvents([{ step: 0, len: spb, chord: { rootPc: 0, type: 'min', tok: 'Cm' } }], id, () => 0.5, { lo: 53, hi: 76, kp: [0, 2, 3, 5, 7, 8, 10] });
      } catch (e) {
        ev = [];
      }
      if (sig !== was) BS.setMeter(was);
      const u = 160 / spb;
      const bars = Array.from({ length: spb / beat - 1 }, (_, i) => `<rect x="${((i + 1) * beat * u).toFixed(1)}" y="0" width=".6" height="34" fill="currentColor" opacity=".2"/>`).join('');
      const rects = ev
        .filter((e) => e.step < spb)
        .flatMap((e) => e.notes.map((n) => `<rect x="${(e.step * u + 0.5).toFixed(1)}" y="${Math.max(1, Math.min(31, 31 - ((n - 38) / 44) * 30)).toFixed(1)}" width="${Math.max(3, e.len * u - 1.8).toFixed(1)}" height="2.4" rx="1" fill="currentColor" opacity="${(0.45 + e.vel * 0.6).toFixed(2)}"/>`))
        .join('');
      const fx = FX_PATH[id] && spb === 16 ? `<path d="${FX_PATH[id]}" fill="none" stroke="var(--text)" stroke-width="1.2" opacity=".5" vector-effect="non-scaling-stroke"/>` : '';
      draws[key] = `<svg viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true">${bars}${rects}${fx}</svg>`;
    }
    return draws[key];
  }

  return { MODES, GROUPS, KINDS, all, meterOf, inGroup, name, desc, kindOf, svg, groupOfStyle, noneTitle: 'La nappe se tait dans cette scène', label: 'Motifs de nappe' };
})();
