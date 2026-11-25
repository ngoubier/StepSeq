/*
 * Clavier : le musicien de type « keys » de l'assistant « Nouvelle chanson » (js/band.js, étape Clavier). Pianos, pianos
 * électriques, orgues, clavinet, synthés polyphoniques : le son se choisit à l'étape Instruments. Fonctions pures, sans
 * DOM (testées par tests/keyboardist.test.js).
 *
 * Il joue, scène par scène, un des deux « jeux » :
 *  - Accords : Deux mains (main gauche à la basse, main droite à l'accord), Rythmés (stabs, skank, montuno…), Tenus ;
 *  - Arpèges : Piano brisé (ballade, Alberti, vagues…) et Arpégiateur (motifs de synthé en doubles-croches).
 * Un mode est soit un motif propre au Clavier, « k:<id> » (une mesure de 16 doubles-croches, 4/4 seulement, écrite en
 * jetons, voir TOKENS), soit un mode du moteur de nappe de js/bandsong.js (block4, montuno23, ballad… : ceux que jouent
 * les pianistes des inspirations, et ceux des autres mesures), soit un des 150 motifs du fichier de Nicolas, « kf:NN »
 * (js/keys-motifs.js, généré) : ses notes sont écrites sur sa propre grille et recalculées sur les accords de la scène
 * (chaque note garde son degré dans la gamme de l'accord, comme les cuivres : SS.horns.realize), dans sa mesure.
 *
 * Réglages de la scène (parts[section].inst[id].keys, de 0 à 1 sauf lh) : voice (voicing serré → large), energy,
 * pedal, human, reg (registre de la main droite), accent ; lh = main gauche : 'basse' (comme écrit), 'oct' (octaves),
 * 'aucune' (main droite seule). Fenêtre Avancé : pat (motif réécrit, 16 jetons séparés par des espaces, « . » = rien),
 * col7, col9, sus (couleurs de l'accord), roll (étalement, ms), swing, bal (main gauche 0 ↔ 1 main droite), oct
 * (octaves de l'arpège, 1 à 3). shape() les applique à tous les modes ; sans réglage, la chanson ne change pas.
 *
 * Jetons d'un motif « k: » (plusieurs par pas, séparés par +) :
 *   main droite : C accord tenu, C9 accord avec la neuvième, c accord court, k accord court et doux, T note haute de
 *                 l'accord, M1 M3 M5 M8 octave sur un degré (montuno), 1 3 5 7 8 9 10 12 15 un degré seul ;
 *   main gauche : B basse tenue, b basse courte, O basse en octave, F quinte, L1 L3 L5 L8 un degré grave.
 * Une note tient jusqu'au prochain jeton de la même main (ou jusqu'au changement d'accord) ; « c », « k » et « b » sont
 * courts. Au changement d'accord en cours de mesure, une main qui tenait rejoue sur le nouvel accord.
 */
window.SS = window.SS || {};
SS.keyboardist = (() => {
  const JEUX = [
    ['acc', 'Accords', 'Les deux mains jouent l’accord : blocs, stabs, montuno, skank, tenues'],
    ['arp', 'Arpèges', 'Les notes de l’accord une à une : piano brisé ou arpégiateur'],
  ];
  const FAMILIES = {
    acc: [['deux', 'Deux mains'], ['rythme', 'Rythmés'], ['tenu', 'Tenus']],
    arp: [['brise', 'Piano brisé'], ['arpeg', 'Arpégiateur']],
  };
  /** Styles des puces (maquette validée le 2026-11-24). */
  const STYLES = [
    ['pop', 'Pop'], ['rock', 'Rock'], ['ballade', 'Ballade'], ['soul', 'Soul'], ['jazz', 'Jazz'], ['funk', 'Funk'],
    ['reggae', 'Reggae'], ['salsa', 'Salsa'], ['bossa', 'Bossa'], ['electro', 'Électro'], ['film', 'Film'],
  ];
  /** Style de la chanson (SS.Band.STYLES) → puce de départ ; les autres partent sur « Tous ». */
  const STYLE_OF = { synthwave: 'electro', edm: 'electro', techno: 'electro', dnb: 'electro', pop: 'pop', funk: 'funk', latin: 'salsa', soul: 'soul', hiphop: 'soul', ambient: 'film', film: 'film', cliches: 'pop' };
  const styleOfSong = (styleId) => STYLE_OF[styleId] || 'all';

  /** Motifs propres au Clavier : [id, nom, description, jeu, famille, styles, { pas: jetons }]. */
  const P = (o) => o;
  const seq16 = (a) => Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, a[i % a.length]]));
  const OWN = [
    ['pop8', 'Pop croches', 'Basse sur 1 et 3, l’accord en croches', 'acc', 'deux', 'pop rock soul', P({ 0: 'B+C', 2: 'c', 4: 'c', 6: 'c', 8: 'O+C', 10: 'c', 12: 'c', 14: 'c' })],
    ['soulc', 'Soul syncopé', 'L’accord tenu puis relancé à contretemps', 'acc', 'deux', 'soul funk pop', P({ 0: 'B+C', 6: 'c', 10: 'k', 11: 'c', 14: 'k' })],
    ['gospelp', 'Piano gospel', 'Accord tenu, note haute qui chante, petits rebonds', 'acc', 'deux', 'soul ballade', P({ 0: 'B+C', 6: 'k', 8: 'O+C', 11: 'T', 14: 'k' })],
    ['rockh', 'Rock martelé', 'Octave et accord martelés en croches', 'acc', 'deux', 'rock', P({ 0: 'O+c', 2: 'O+c', 4: 'O+c', 6: 'O+c', 8: 'O+c', 10: 'O+c', 12: 'O+c', 14: 'O+c' })],
    ['stride', 'Stride', 'Basse et quinte sur 1 et 3, accord sur 2 et 4', 'acc', 'deux', 'jazz', P({ 0: 'B', 4: 'c', 8: 'F', 12: 'c' })],
    ['comp2', 'Comping deux mains', 'Basse sur 1 et 3, accords syncopés', 'acc', 'deux', 'jazz bossa', P({ 0: 'B', 3: 'c', 6: 'k', 8: 'F', 10: 'c', 14: 'k' })],
    ['stabk', 'Stabs piano', 'Accords courts syncopés', 'acc', 'rythme', 'electro funk pop', P({ 0: 'c', 3: 'c', 6: 'c', 10: 'c', 12: 'k' })],
    ['clavi', 'Clavinet funk', 'Doubles-croches sèches, accents syncopés', 'acc', 'rythme', 'funk', P({ 0: 'c', 1: 'k', 3: 'c', 4: 'k', 6: 'c', 7: 'k', 9: 'k', 10: 'c', 12: 'k', 13: 'c', 15: 'k' })],
    ['bossap', 'Bossa deux mains', 'Basse et quinte, accords syncopés de la bossa', 'acc', 'rythme', 'bossa jazz', P({ 0: 'B+c', 3: 'c', 6: 'c', 8: 'F', 10: 'c', 13: 'c' })],
    ['blanches', 'Deux par mesure', 'L’accord en blanches, basse tenue', 'acc', 'tenu', 'ballade film pop', P({ 0: 'B+C', 8: 'C' })],
    ['neuv', 'Neuvième tenue', 'Accord tenu avec la neuvième', 'acc', 'tenu', 'film ballade jazz', P({ 0: 'B+C9' })],
    ['chorale', 'Choral relancé', 'Accord tenu, la note haute relancée', 'acc', 'tenu', 'film soul', P({ 0: 'B+C', 4: 'T', 8: 'O+C', 12: 'T' })],
    ['rocktenu', 'Rock tenu', 'Octave et accord tenus, relancés à contretemps', 'acc', 'deux', 'rock', P({ 0: 'O+C', 6: 'c', 8: 'O+C', 14: 'c' })],
    ['funkstab', 'Stabs funk', 'Basse brève et accords piqués en doubles', 'acc', 'rythme', 'funk', P({ 0: 'b+c', 3: 'k', 6: 'c', 9: 'c', 12: 'k', 14: 'c' })],
    ['skank8', 'Skank croches', 'L’accord court sur tous les contretemps', 'acc', 'rythme', 'reggae', P({ 0: 'b', 2: 'c', 6: 'c', 8: 'b', 10: 'c', 14: 'c' })],
    ['alberti', 'Alberti', 'Fondamentale, quinte, tierce, quinte', 'arp', 'brise', 'film ballade', P({ 0: 'L1+1', 2: '5', 4: '3', 6: '5', 8: '1', 10: '5', 12: '3', 14: '5' })],
    ['vagues', 'Vagues deux mains', 'La main gauche monte, la droite continue', 'arp', 'brise', 'film ballade', P({ 0: 'L1', 1: 'L5', 2: 'L8', 3: '3', 4: '5', 5: '8', 6: '10', 7: '8', 8: '5', 9: '3', 10: 'L8', 11: 'L5', 12: 'L1', 13: 'L5', 14: 'L8', 15: '3' })],
    ['cascade', 'Cascade', 'L’accord descend en doubles-croches', 'arp', 'brise', 'film pop', P({ 0: 'L1+15', 1: '12', 2: '10', 3: '8', 4: '5', 5: '3', 8: 'L5+12', 9: '10', 10: '8', 11: '5', 12: '3', 13: '1' })],
    ['popd', 'Pop doubles', 'Basse et accord brisé en doubles', 'arp', 'brise', 'pop rock', P({ 0: 'L1+1', 2: '5', 3: '8', 4: '1', 6: '5', 7: '8', 8: 'L5+1', 10: '5', 11: '8', 12: '10', 14: '8' })],
    ['bossaarp', 'Bossa brisée', 'Basse, tierce et septième, quinte', 'arp', 'brise', 'bossa jazz', P({ 0: 'L1', 3: '3+7', 6: '5', 8: 'L5', 10: '3+7', 13: '5' })],
    ['reggaearp', 'Brisé reggae', 'Quinte et octave sur 2 et 4, la tierce répond', 'arp', 'brise', 'reggae', P({ 4: '5+8', 6: '3', 12: '5+8', 14: '3' })],
    // PR 3 (2026-11-25) : au moins trois motifs par jeu pour chaque style
    ['rockarp', 'Rock brisé', 'Croches : fondamentale, quinte, octave, la basse sur 1 et 3', 'arp', 'brise', 'rock pop', P({ 0: 'L1+1', 2: '5', 4: '8', 6: '5', 8: 'L1+1', 10: '5', 12: '8', 14: '5' })],
    ['powerarp', 'Octaves rock', 'Basse en octaves, la main droite monte jusqu’à la quinte aiguë', 'arp', 'brise', 'rock', P({ 0: 'O+1', 2: '5', 4: '8', 6: '5', 8: 'O+1', 10: '5', 12: '8', 14: '12' })],
    ['soularp', 'Soul égrené', 'L’accord avec sa septième, égrené et rendu', 'arp', 'brise', 'soul ballade', P({ 0: 'L1', 2: '3', 3: '5', 4: '7', 6: '8', 8: 'L5', 10: '7', 11: '5', 12: '3', 14: '5' })],
    ['gospelarp', 'Gospel roulé', 'L’accord roulé vers l’aigu, puis redescendu', 'arp', 'brise', 'soul', P({ 0: 'L1+1', 1: '3', 2: '5', 3: '8', 8: 'L8', 10: '10', 11: '8', 12: '5', 14: '3' })],
    ['jazzarp', 'Jazz égrené', 'Tierce, quinte, septième, neuvième : les couleurs du jazz', 'arp', 'brise', 'jazz soul', P({ 0: 'L1', 2: '3', 4: '5', 6: '7', 8: 'L5', 10: '9', 12: '7', 14: '5' })],
    ['balladj', 'Ballade jazz', 'Notes longues et neuvième, la basse sur 1 et 3', 'arp', 'brise', 'jazz ballade', P({ 0: 'L1+3', 4: '7', 6: '9', 8: 'L5+5', 12: '3', 14: '7' })],
    ['funkarp', 'Funk piqué', 'Doubles syncopées sur l’octave et la septième', 'arp', 'arpeg', 'funk soul', P({ 0: 'L1+8', 3: '5', 4: '7', 6: '8', 7: '10', 10: 'L1+5', 11: '7', 14: '8' })],
    ['clavarp', 'Clavinet égrené', 'Notes répétées et rebonds, comme un clavinet', 'arp', 'arpeg', 'funk electro', P({ 0: '1', 1: '1', 3: '5', 4: '7', 6: '8', 9: '5', 10: '7', 12: '8', 13: '10', 15: '8' })],
    ['offarp', 'Contretemps égrenés', 'Une note sur chaque contretemps', 'arp', 'brise', 'reggae', P({ 2: '5', 6: '8', 10: '5', 14: '10' })],
    ['onedrop', 'One drop égrené', 'La basse sur le troisième temps, les notes autour', 'arp', 'brise', 'reggae', P({ 4: '3', 6: '5', 8: 'L1+8', 12: '3', 14: '5' })],
    ['guajeo', 'Guajeo croches', 'La figure du piano salsa, en croches et doubles', 'arp', 'brise', 'salsa', P({ 0: '1', 2: '3', 3: '5', 5: '8', 6: '5', 8: '3', 10: '1', 11: '3', 13: '5', 14: '8' })],
    ['tumbaoarp', 'Tumbao égrené', 'La basse anticipée (2 et 4 « et »), la main droite égrène', 'arp', 'brise', 'salsa', P({ 0: '8', 2: '5', 4: '3', 6: 'L5+5', 8: '8', 10: '10', 12: 'L1+8', 14: '5' })],
    ['bossaarp2', 'Bossa égrenée', 'Septième et neuvième sur la basse de bossa', 'arp', 'brise', 'bossa jazz', P({ 0: 'L1', 2: '3', 3: '7', 6: '5', 8: 'L5', 10: '9', 11: '7', 14: '3' })],
    ['samba', 'Samba-canção', 'Octave, quinte et septième sur le balancement de la samba', 'arp', 'brise', 'bossa', P({ 0: 'L1+8', 3: '5', 4: '3', 6: '7', 8: 'L5', 11: '9', 12: '8', 14: '5' })],
    ['up16', 'Montée', 'Doubles-croches, en montant', 'arp', 'arpeg', 'electro pop film', seq16(['1', '3', '5', '8'])],
    ['updown16', 'Aller-retour', 'Doubles-croches, monte et descend', 'arp', 'arpeg', 'electro film', seq16(['1', '3', '5', '8', '10', '8', '5', '3'])],
    ['up8', 'Montée en croches', 'Plus lent, plus ouvert', 'arp', 'arpeg', 'pop ballade film', P({ 0: '1', 2: '3', 4: '5', 6: '8', 8: '10', 10: '8', 12: '5', 14: '3' })],
    ['bells', 'Cloches', 'Croches aiguës qui tintent', 'arp', 'arpeg', 'film electro', P({ 0: '15', 2: '12', 4: '10', 6: '12', 8: '15', 10: '12', 12: '8', 14: '12' })],
    ['ost16', 'Ostinato', 'Huit doubles qui reviennent', 'arp', 'arpeg', 'electro film', seq16(['1', '5', '8', '5', '10', '5', '8', '5'])],
    ['dotted', 'Pointé', 'Une note tous les trois pas', 'arp', 'arpeg', 'electro pop', P({ 0: '1', 3: '5', 6: '8', 9: '10', 12: '8', 15: '5' })],
    ['pluck16', 'Pincé', 'Doubles syncopées, très piquées', 'arp', 'arpeg', 'electro funk', P({ 0: '1', 2: '8', 3: '5', 6: '10', 7: '8', 10: '5', 11: '12', 14: '8' })],
  ].map(([id, name, desc, jeu, fam, st, pat]) => ({ id, name, desc, jeu, fam, styles: st.split(' '), pat }));
  const OWN_BY = new Map(OWN.map((m) => [m.id, m]));

  /* ---------- les 150 motifs du fichier (« kf:NN ») ---------- */
  /** Style de la puce d'après le style du motif dans le fichier (mots-clés, dans l'ordre). */
  const FILE_STYLE = [
    [/ballade|power ballad/, 'ballade pop'], [/couleur gospel/, 'pop soul'], [/vari[ée]t[ée]/, 'pop ballade'], [/pop-rock/, 'pop rock'],
    [/rock à synth/, 'electro rock'], [/synth-pop/, 'electro pop'], [/synthwave/, 'electro'], [/house|techno|trance/, 'electro'], [/hip-hop/, 'soul electro'],
    [/rhythm and blues|blues/, 'rock soul'], [/boogie|rock’n’roll|rock'n'roll|country/, 'rock'], [/^rock/, 'rock'],
    [/fusion/, 'funk jazz'], [/soul-funk/, 'funk soul'], [/disco/, 'funk electro'], [/funk/, 'funk'],
    [/bossa jazz/, 'bossa jazz'], [/bossa/, 'bossa'], [/salsa|son cubain/, 'salsa'], [/reggae|ska|rocksteady|dub/, 'reggae'],
    [/gospel/, 'soul'], [/ternaire/, 'soul ballade'], [/soul|r&b|néo-soul/, 'soul'],
    [/swing|jazz|stride|ragtime/, 'jazz'],
    [/romantique|lied|nocturne|valse/, 'film ballade'], [/classique|cinématique|ambient/, 'film'],
  ];
  const fileStyleLabel = (m) => (m.style || m.title.split(' — ')[0]).toLowerCase();
  const fileStyles = (m) => {
    const l = fileStyleLabel(m);
    const hit = FILE_STYLE.find(([re]) => re.test(l));
    return hit ? hit[1].split(' ') : ['pop'];
  };
  /** Jeu et famille d'un motif du fichier, d'après ses notes : arpège si la main droite joue surtout des notes seules. */
  function fileShape(m) {
    const rh = Object.entries(m.parts).filter(([p]) => !/^MG|Pad/.test(p)).flatMap(([, v]) => v);
    const at = new Map();
    rh.forEach(([st, , len]) => at.set(st, [(at.get(st) || [0])[0] + 1, len]));
    const hits = [...at.values()];
    const single = hits.filter(([k]) => k === 1).length / Math.max(1, hits.length);
    const perBar = hits.length / m.bars;
    const avgLen = hits.reduce((a, [, l]) => a + l, 0) / Math.max(1, hits.length);
    const synth = /synth|pluck|pad/i.test(m.son);
    if (single >= 0.6 && perBar >= 3) return { jeu: 'arp', fam: synth && !/piano/i.test(m.son) ? 'arpeg' : 'brise', perBar, avgLen };
    const fam = avgLen >= 6 && perBar <= 4 ? 'tenu' : m.parts.MG && avgLen > 2.2 ? 'deux' : 'rythme';
    return { jeu: 'acc', fam, perBar, avgLen };
  }
  /** Types de scène où le motif est conseillé (★) : d'après son conseil de jeu, son émotion et sa densité. */
  function fileScenes(m, sh) {
    const t = (m.text + ' ' + m.emo + ' ' + m.title).toLowerCase();
    const vels = Object.values(m.parts).flat().map((x) => x[3]);
    const v = vels.reduce((a, x) => a + x, 0) / Math.max(1, vels.length);
    const out = new Set();
    if (/intro/.test(t)) out.add('intro');
    if (/couplet/.test(t)) out.add('verse');
    if (/refrain/.test(t)) out.add('chorus');
    if (/relance|montée|élan|tension|crescendo/.test(t)) out.add('pre');
    if (/\bfin\b|cadence|résolution|conclu|dernière/.test(t)) out.add('outro');
    if (/suspension|retenue|attente|contraste/.test(t)) out.add('bridge');
    const explicit = out.size > 0;
    if (!out.size) {
      if (sh.fam === 'tenu' || (sh.perBar <= 3 && v < 70)) out.add('intro').add('outro');
      else if (v < 72 && sh.perBar <= 8) out.add('verse');
      else if (v >= 82 || sh.perBar >= 10) out.add('chorus');
      else out.add('verse').add('bridge');
    }
    return { scenes: [...out], explicit };
  }
  const FILE = (SS.KEYS_MOTIFS || []).map((m) => {
    const sh = fileShape(m);
    const short = m.n <= 50 && m.title.includes(' — ') ? m.title.split(' — ').slice(1).join(' — ') : m.title;
    const sc = fileScenes(m, sh);
    return { ...m, id: 'f' + String(m.n).padStart(3, '0'), name: `${m.n}. ${short.charAt(0).toUpperCase() + short.slice(1)}`, jeu: sh.jeu, fam: sh.fam, styles: fileStyles(m), scenes: sc.scenes, explicit: sc.explicit };
  });
  const FILE_BY = new Map(FILE.map((m) => [m.id, m]));
  /** Mode « kf:f001 » : un motif du fichier. */
  const fileOf = (mode) => (/^kf:/.test(mode || '') ? FILE_BY.get(mode.slice(3)) || null : null);
  /** Type de scène d'après son nom (comme les cuivres) : intro, verse, pre, chorus, bridge, outro. */
  function sceneKind(sec) {
    const s = String(sec || '').toLowerCase();
    if (/^(pre|build|mont)/.test(s)) return 'pre';
    if (/^intro/.test(s)) return 'intro';
    if (/^(verse|couplet)/.test(s)) return 'verse';
    if (/^(bridge|break|solo|pont)/.test(s)) return 'bridge';
    if (/^(outro|fin|coda)/.test(s)) return 'outro';
    return 'chorus';
  }
  /**
   * Motifs du fichier conseillés (★) pour une scène (d'après son nom), un jeu et un style, dans la mesure ok : trois au
   * plus, ceux dont le conseil du fichier nomme ce type de scène d'abord.
   */
  function stars(sec, jeu, style, ok = () => true) {
    const k = sceneKind(sec);
    const l = FILE.filter((m) => m.jeu === jeu && m.scenes.includes(k) && (!style || style === 'all' || m.styles.includes(style)) && ok('kf:' + m.id));
    return [...l.filter((m) => m.explicit), ...l.filter((m) => !m.explicit)].slice(0, 3).map((m) => 'kf:' + m.id);
  }
  /** Modes du moteur de nappe (js/bandsong.js) joués par le Clavier : [id, jeu, famille, styles]. Noms et descriptions : SS.padMotifs. */
  const ENGINE = [
    ['block4', 'acc', 'deux', 'pop ballade soul rock'],
    ['charl', 'acc', 'deux', 'jazz soul'],
    ['comp', 'acc', 'deux', 'jazz bossa'],
    ['valse3', 'acc', 'deux', 'ballade pop film'],
    ['berce68', 'acc', 'deux', 'ballade film'],
    ['triolets128', 'acc', 'deux', 'ballade soul'],
    ['berce128', 'acc', 'deux', 'ballade soul'],
    ['stabs', 'acc', 'rythme', 'electro funk pop'],
    ['house', 'acc', 'rythme', 'electro'],
    ['deep', 'acc', 'rythme', 'electro'],
    ['chop', 'acc', 'rythme', 'electro'],
    ['pulse8', 'acc', 'rythme', 'pop electro rock'],
    ['p332', 'acc', 'rythme', 'pop electro'],
    ['skank', 'acc', 'rythme', 'reggae'],
    ['skank2', 'acc', 'rythme', 'reggae'],
    ['bubble', 'acc', 'rythme', 'reggae'],
    ['montuno', 'acc', 'rythme', 'salsa'],
    ['montuno23', 'acc', 'rythme', 'salsa'],
    ['montuno32', 'acc', 'rythme', 'salsa'],
    ['mambo23', 'acc', 'rythme', 'salsa'],
    ['clav', 'acc', 'rythme', 'funk'],
    ['rhodes', 'acc', 'rythme', 'funk soul'],
    ['gospel', 'acc', 'rythme', 'soul ballade'],
    ['bossa', 'acc', 'rythme', 'bossa jazz'],
    ['lofi', 'acc', 'rythme', 'soul jazz'],
    ['xmas', 'acc', 'rythme', 'pop'],
    ['sustain', 'acc', 'tenu', 'ballade film pop electro'],
    ['add9', 'acc', 'tenu', 'film pop ballade'],
    ['choral', 'acc', 'tenu', 'film soul'],
    ['breath', 'acc', 'tenu', 'film soul'],
    ['ballad', 'arp', 'brise', 'ballade pop soul'],
    ['pluck', 'arp', 'brise', 'pop film'],
    ['guajeo23', 'arp', 'brise', 'salsa'],
    ['arpvalse', 'arp', 'brise', 'ballade film'],
    ['arp68', 'arp', 'brise', 'ballade film'],
    ['arp128', 'arp', 'brise', 'ballade soul'],
  ].map(([id, jeu, fam, st]) => ({ id, jeu, fam, styles: st.split(' ') }));
  const ENGINE_BY = new Map(ENGINE.map((m) => [m.id, m]));
  /** Mode « k:<id> » : un motif propre au Clavier. */
  const ownOf = (mode) => (/^k:/.test(mode || '') ? OWN_BY.get(mode.slice(2)) || null : null);
  const entryOf = (mode) => ownOf(mode) || fileOf(mode) || ENGINE_BY.get(mode) || null;
  /** Arpèges du moteur de nappe (un mode d'arpège venu d'une inspiration). */
  const ARP_LIKE = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'ost16', 'dotted', 'toll', 'alb3', 'wave6', 'tri8', 'arp68', 'arp128', 'arpvalse', 'ballad', 'pluck'];
  /** Jeu d'un mode (un mode inconnu, venu d'une inspiration, est rangé avec les accords). */
  const jeuOf = (mode) => (entryOf(mode) ? entryOf(mode).jeu : ARP_LIKE.includes(mode) ? 'arp' : 'acc');
  const familyOf = (mode) => (entryOf(mode) ? entryOf(mode).fam : jeuOf(mode) === 'arp' ? 'brise' : 'tenu');
  const stylesOf = (mode) => (entryOf(mode) ? entryOf(mode).styles : []);
  const inStyle = (mode, style) => !style || style === 'all' || stylesOf(mode).includes(style);
  const name = (mode) => (ownOf(mode) ? ownOf(mode).name : fileOf(mode) ? fileOf(mode).name : SS.padMotifs ? SS.padMotifs.name(mode) : mode);
  const desc = (mode) => {
    const f = fileOf(mode);
    if (f) return `${f.emo}. ${f.text} (${f.son}${f.work ? ' ; d’après ' + f.work : ''})`;
    return ownOf(mode) ? ownOf(mode).desc : SS.padMotifs ? SS.padMotifs.desc(mode) : '';
  };
  /** Mesure d'un mode : celle d'un motif du fichier, '4/4' pour un motif « k: », null pour le moteur (toutes). */
  const meterOf = (mode) => (fileOf(mode) ? fileOf(mode).meter : ownOf(mode) ? '4/4' : null);
  /** Tous les modes d'un jeu, famille par famille : les motifs du Clavier, puis ceux du moteur de nappe. */
  function modesOf(jeu) {
    return (FAMILIES[jeu] || []).flatMap(([f]) => [...OWN.filter((m) => m.jeu === jeu && m.fam === f).map((m) => 'k:' + m.id), ...ENGINE.filter((m) => m.jeu === jeu && m.fam === f).map((m) => m.id), ...FILE.filter((m) => m.jeu === jeu && m.fam === f).map((m) => 'kf:' + m.id)]);
  }
  const ALL = () => [...modesOf('acc'), ...modesOf('arp')];
  /** Premier mode d'un jeu pour un style (parmi ceux qu'accepte ok, la mesure de la chanson). */
  function firstOf(jeu, style, ok = () => true) {
    const l = modesOf(jeu).filter(ok);
    return l.find((id) => inStyle(id, style)) || l[0] || null;
  }
  /** Mode tiré au hasard parmi ceux du jeu et du style (r : 0..1), différent de cur si possible. */
  function surprise(jeu, style, cur, r, ok = () => true) {
    const l = modesOf(jeu).filter((id) => ok(id) && inStyle(id, style));
    const pool = l.length > 1 ? l.filter((id) => id !== cur) : l.length ? l : modesOf(jeu).filter(ok);
    return pool.length ? pool[Math.min(pool.length - 1, Math.floor(r * pool.length))] : null;
  }

  /* ---------- réglages ---------- */
  const DEF = { voice: 0.3, energy: 0.5, pedal: 0.3, human: 0.3, reg: 0.5, accent: 0.3, lh: 'basse', col7: false, col9: false, sus: false, roll: 0, swing: 0, bal: 0.5, oct: 1, pat: undefined };
  /** Jetons permis dans un motif réécrit (voir l'en-tête). */
  const TOKEN = /^(C|C9|c|k|T|M[1358]|1|3|5|7|8|9|10|12|15|B|b|O|F|L[1358])$/;
  /** Motif réécrit (texte de 16 pas) → { pas: jetons }, ou null s'il n'est pas valable. */
  function parsePat(pat) {
    if (typeof pat !== 'string') return null;
    const st = pat.trim().split(/\s+/);
    if (st.length !== SPB || !st.every((t) => t === '.' || t.split('+').every((x) => TOKEN.test(x)))) return null;
    return Object.fromEntries(st.map((t, i) => [i, t === '.' ? null : t]));
  }
  /** Pas d'un motif (16 textes, '' = rien) : le motif réécrit, sinon celui du mode « k: ». */
  function stepsOf(mode, pat) {
    const P = parsePat(pat) || (ownOf(mode) || {}).pat || {};
    return Array.from({ length: SPB }, (_, i) => (P[i] ? String(P[i]) : ''));
  }
  const patText = (steps) => steps.map((t) => t || '.').join(' ');
  /**
   * Jetons approchés d'une mesure de notes jouées sur l'accord de Do majeur (un mode du moteur de nappe), pour que
   * l'éditeur pas à pas parte du jeu entendu : main gauche sous Sol 3, main droite au-dessus.
   */
  function patFromEvents(evs) {
    const DEG = { 0: '1', 2: '9', 4: '3', 7: '5', 10: '7', 11: '7', 9: '5' };
    const steps = Array.from({ length: SPB }, () => []);
    for (const e of evs) {
      if (!(e.step >= 0 && e.step < SPB)) continue;
      const lhN = e.notes.filter((n) => n < 55);
      const md = e.notes.filter((n) => n >= 55);
      const t = steps[e.step];
      if (lhN.length) {
        const lo = Math.min(...lhN);
        const tok = lhN.some((n) => n === lo + 12) ? 'O' : pcOf(lo) === 7 ? 'F' : e.len <= 2 ? 'b' : 'B';
        if (!t.some((x) => isLH(x))) t.push(tok);
      }
      if (md.length >= 2) {
        if (!t.some((x) => /^(C|C9|c|k)$/.test(x))) t.push(e.len <= 1 && e.vel < 0.55 ? 'k' : e.len <= 2 ? 'c' : 'C');
      } else if (md.length === 1) {
        const n = md[0];
        const d = DEG[pcOf(n)] || '1';
        const up = n >= 74 ? { 1: '15', 3: '10', 5: '12', 9: '9', 7: '7' }[d] : n >= 67 && d === '1' ? '8' : d;
        if (!t.some((x) => /^\d+$/.test(x))) t.push(up);
      }
    }
    return patText(steps.map((t) => t.join('+')));
  }
  const LH = [['basse', 'Basse', 'La main gauche joue comme écrit dans le motif'], ['oct', 'Octaves', 'La basse doublée à l’octave : plus de poids'], ['aucune', 'Aucune', 'La main droite seule : la place au bassiste']];
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
  function normalize(s) {
    const o = { ...DEF };
    if (s && typeof s === 'object') {
      for (const k of ['voice', 'energy', 'pedal', 'human', 'reg', 'accent']) if (Number.isFinite(Number(s[k])) && s[k] !== null && s[k] !== '') o[k] = clamp01(s[k]);
      if (LH.some(([v]) => v === s.lh)) o.lh = s.lh;
      for (const k of ['col7', 'col9', 'sus']) if (typeof s[k] === 'boolean') o[k] = s[k];
      if (Number.isFinite(Number(s.roll)) && s.roll !== null && s.roll !== '') o.roll = Math.max(0, Math.min(60, Math.round(Number(s.roll))));
      for (const k of ['swing', 'bal']) if (Number.isFinite(Number(s[k])) && s[k] !== null && s[k] !== '') o[k] = clamp01(s[k]);
      if ([1, 2, 3].includes(Number(s.oct))) o.oct = Number(s.oct);
      if (parsePat(s.pat)) o.pat = s.pat.trim().split(/\s+/).join(' ');
    }
    return o;
  }
  const HUM = (v) => (v < 15 ? 'machine' : v < 60 ? 'naturel' : 'relâché');
  const PED = (v) => (v < 15 ? 'sec' : v < 60 ? 'pédale légère' : 'pédale tenue');
  /** Potentiomètres de chaque jeu : [clé, nom, aide, texte(v 0..100)]. */
  const KNOBS = {
    acc: [
      ['voice', 'Voicing', 'Serré : l’accord groupé. Ouvert : une voix descend d’une octave (drop 2). Large : l’accord s’étale sur les deux mains.', (v) => (v < 35 ? 'serré' : v < 70 ? 'ouvert (drop 2)' : 'large')],
      ['energy', 'Énergie', 'La force des notes.', (v) => (v < 35 ? 'doux' : v < 70 ? 'franc' : 'appuyé')],
      ['pedal', 'Pédale', 'La pédale de sustain : les notes sonnent plus longtemps, jusqu’au changement d’accord.', PED],
      ['human', 'Main humaine', 'La force des notes varie un peu.', HUM],
    ],
    arp: [
      ['reg', 'Registre', 'La main droite une octave plus bas, ou plus haut.', (v) => (v < 33 ? 'grave' : v < 67 ? 'médium' : 'aigu')],
      ['pedal', 'Pédale', 'La pédale de sustain : les notes sonnent plus longtemps, jusqu’au changement d’accord.', PED],
      ['accent', 'Accent', 'Les notes sur les temps plus fortes que les autres.', (v) => (v < 20 ? 'égal' : v < 60 ? 'temps marqués' : 'temps appuyés')],
      ['human', 'Main humaine', 'La force des notes varie un peu.', HUM],
    ],
  };
  const knobValue = (s, key) => Math.round(normalize(s)[key] * 100);
  const knobPatch = (key, v) => ({ [key]: Math.round(Math.max(0, Math.min(100, v))) / 100 });
  /** Réglages différents des valeurs de départ (pour la pastille « réglé »). */
  const touched = (s) => !!s && Object.keys(DEF).some((k) => s[k] !== undefined && s[k] !== DEF[k]);
  /** Réglages de la fenêtre Avancé (pour la pastille « ✎ Réglages avancés »). */
  const ADV = ['pat', 'col7', 'col9', 'sus', 'roll', 'swing', 'bal', 'oct'];
  const advanced = (s) => !!s && ADV.some((k) => s[k] !== undefined && s[k] !== DEF[k]);

  /* ---------- notes ---------- */
  const pcOf = (n) => ((n % 12) + 12) % 12;
  const SPB = 16;
  /** Écarts de la tierce, de la quinte et de la septième d'un accord (tones : ses notes, en classes de hauteur). */
  function intervals(chord, tones) {
    const rel = [...new Set(tones.map((p) => pcOf(p - chord.rootPc)))];
    const third = rel.find((x) => x === 3 || x === 4) ?? rel.find((x) => x === 2 || x === 5) ?? 4;
    const fifth = rel.find((x) => x >= 6 && x <= 8) ?? 7;
    const seventh = rel.find((x) => x === 10 || x === 11 || x === 9) ?? (third === 3 ? 10 : 11);
    return { third, fifth, seventh };
  }
  const isLH = (t) => /^(B|b|O|F|L\d+)$/.test(t);
  /**
   * Notes d'un motif « k: » sur les accords d'une scène.
   *   spans : [{ step, len, chord: { rootPc, bassPc?, type } }] (js/bandsong.js) ; ctx : { voice(chord, prev, lo, hi) →
   *   notes, tones(chord) → classes de hauteur, vel(v) → vélocité (avec le hasard du moteur) }.
   * Renvoie des notes { step, len, notes, vel, lh? } (lh : main gauche, retiré par shape).
   */
  function events(spans, mode, ctx, pat) {
    if (fileOf(mode) && !parsePat(pat)) return fileEvents(spans, fileOf(mode), ctx);
    const m = ownOf(mode);
    const P = parsePat(pat) || (m && m.pat);
    if (!P || !spans.length) return [];
    const end = spans.reduce((a, sp) => Math.max(a, sp.step + sp.len), 0);
    const spanAt = (s) => spans.find((sp) => s >= sp.step && s < sp.step + sp.len);
    const toks = Array.from({ length: SPB }, (_, i) => (P[i] ? String(P[i]).split('+') : []));
    const hasHand = (s, lh) => toks[s % SPB].some((t) => isLH(t) === lh);
    const out = [];
    let prev = null;
    const held = { true: null, false: null }; // dernier jeton tenu de chaque main (rejoué au changement d'accord)
    for (let s = 0; s < end; s++) {
      const sp = spanAt(s);
      if (!sp) continue;
      const items = toks[s % SPB].slice();
      if (s === sp.step && s % SPB) for (const lh of [true, false]) if (!hasHand(s, lh) && held[lh]) items.push(held[lh]);
      if (!items.length) continue;
      const c = sp.chord;
      const iv = intervals(c, ctx.tones(c));
      const spEnd = sp.step + sp.len;
      // longueur : jusqu'au prochain jeton de la même main, dans l'accord
      const until = (lh) => {
        let j = s + 1;
        while (j < spEnd && !hasHand(j, lh)) j++;
        return j - s;
      };
      const bassPc = c.bassPc != null ? c.bassPc : c.rootPc;
      const low = 36 + pcOf(bassPc); // main gauche : 36..47
      const rootLow = 36 + pcOf(c.rootPc);
      const SEM = { 1: 0, 3: iv.third, 5: iv.fifth, 7: iv.seventh, 8: 12, 9: 14, 10: 12 + iv.third, 12: 12 + iv.fifth, 15: 24 };
      const base = 55 + pcOf(c.rootPc - 7); // fondamentale de la main droite : 55..66
      for (const t of items) {
        const lh = isLH(t);
        const span = until(lh);
        if (lh) held[true] = ['B', 'O', 'F'].includes(t) || /^L/.test(t) ? t : null;
        else held[false] = ['C', 'C9', 'T'].includes(t) || /^M\d+$/.test(t) ? t : null;
        let notes = [];
        let v = 0.7;
        let len = span;
        if (t === 'B' || t === 'b') (notes = [low]), (v = 0.72), t === 'b' && (len = Math.min(span, 2));
        else if (t === 'O') (notes = [low, low + 12]), (v = 0.74);
        else if (t === 'F') (notes = [rootLow + iv.fifth]), (v = 0.64);
        else if (/^L\d+$/.test(t)) (notes = [36 + pcOf(c.rootPc) + ({ 1: 0, 3: iv.third, 5: iv.fifth, 8: 12 }[t.slice(1)] ?? 0)]), (v = 0.66);
        else if (/^(C|C9|c|k)$/.test(t)) {
          const vc = ctx.voice(c, prev, 57, 79);
          prev = vc;
          notes = vc.slice();
          if (t === 'C9') {
            let n9 = vc[0] - pcOf(vc[0] - c.rootPc) + 14;
            while (n9 < vc[Math.max(0, vc.length - 2)]) n9 += 12;
            if (!notes.includes(n9)) notes.push(n9);
          }
          v = t === 'k' ? 0.42 : t === 'c' ? 0.74 : 0.66;
          if (t === 'c') len = Math.min(span, 2);
          if (t === 'k') len = Math.min(span, 1);
        } else if (t === 'T') {
          const vc = ctx.voice(c, prev, 57, 79);
          notes = [vc[vc.length - 1]];
          v = 0.6;
        } else if (/^M\d+$/.test(t)) {
          const d = base + (SEM[t.slice(1)] ?? 0) + 5;
          const n = d >= 72 ? d - 12 : d;
          notes = [n, n + 12];
          v = 0.76;
          len = Math.min(span, 2);
        } else if (/^\d+$/.test(t)) (notes = [base + (SEM[t] ?? 0)]), (v = s % 4 === 0 ? 0.68 : 0.6);
        if (!notes.length) continue;
        out.push({ step: s, len: Math.max(1, Math.min(len, spEnd - s)), notes: [...new Set(notes)].sort((a, b) => a - b), vel: ctx.vel(v), ...(lh ? { lh: true } : {}) });
      }
    }
    return out;
  }

  /**
   * Notes d'un motif du fichier sur les accords d'une scène : le motif (une ou deux mesures) se répète ; chaque note
   * garde son degré dans la gamme de son accord, recalculée sur l'accord de la scène au même endroit (SS.horns.realize),
   * la basse de la main gauche suit la basse de l'accord (C/E : Mi). Une note s'arrête au changement d'accord de la scène.
   */
  function fileEvents(spans, m, ctx) {
    const H = SS.horns;
    if (!spans.length) return [];
    const end = spans.reduce((a, sp) => Math.max(a, sp.step + sp.len), 0);
    const L = m.bars * m.spb;
    const chordAt = (st) => {
      let c = m.chords[0];
      for (const x of m.chords) if (x[0] <= st + 1e-6) c = x;
      return c;
    };
    const spanAt = (s) => spans.find((sp) => s >= sp.step && s < sp.step + sp.len);
    const groups = new Map();
    for (let t = 0; t < end; t += L) {
      for (const [part, notes] of Object.entries(m.parts)) {
        const lh = /^MG/.test(part);
        // l'attaque la plus grave de la main gauche à chaque pas : la basse
        const lowAt = new Map();
        if (lh) notes.forEach(([st, n]) => lowAt.set(st, Math.min(lowAt.get(st) ?? 999, n)));
        for (const [st, n, len, vel] of notes) {
          const abs = t + st;
          if (abs >= end) continue;
          let step = Math.floor(abs + 1e-6);
          let shift = Math.round((abs - step) * 100) / 100;
          if (shift > 0.5) (step += 1), (shift = Math.round((shift - 1) * 100) / 100);
          const sp = spanAt(Math.min(end - 1, step));
          if (!sp) continue;
          const [, sRoot, sSc, , sBass] = chordAt(st);
          const c = sp.chord;
          const dSc = H ? H.scaleOf(c.rootPc, ctx.tones(c), sSc) : sSc;
          let note = H ? H.realize(n, sRoot, sSc, c.rootPc, dSc) : n + (pcOf(c.rootPc - sRoot + 6) - 6);
          if (lh && n === lowAt.get(st) && pcOf(n) === sBass) {
            const bp = c.bassPc != null ? c.bassPc : c.rootPc;
            const tgt = n + (pcOf(bp - sBass + 6) - 6);
            note = tgt;
          }
          while (note < 24) note += 12; // pas plus grave que Do1, pas plus aigu que Do8
          while (note > 108) note -= 12;
          const room = sp.step + sp.len - step;
          const ln = Math.max(1, Math.min(Math.round(len), room));
          const key = `${step}|${shift}|${ln}|${vel}|${lh ? 1 : 0}`;
          if (!groups.has(key)) groups.set(key, { step, len: ln, notes: [], vel: ctx.vel(vel / 127), ...(shift ? { shift } : {}), ...(lh ? { lh: true } : {}) });
          groups.get(key).notes.push(note);
        }
      }
    }
    return [...groups.values()].map((e) => ({ ...e, notes: [...new Set(e.notes)].sort((a, b) => a - b) })).sort((a, b) => a.step - b.step || (a.shift || 0) - (b.shift || 0));
  }

  /**
   * Réglages du Clavier appliqués aux notes d'un mode (motif « k: » ou mode du moteur de nappe) : voicing, main gauche,
   * énergie, pédale, main humaine, registre, accent. set absent : les notes ne changent pas (sauf le marqueur lh retiré).
   * r : hasard (0..1) du moteur.
   */
  function shape(evs, spans, set, r = Math.random, tones = null) {
    const clean = (e) => {
      const o = { ...e, notes: [...e.notes] };
      delete o.lh;
      return o;
    };
    if (!set) return evs.map(clean);
    const s = normalize(set);
    const own = evs.some((e) => e.lh);
    const isL = (e, n) => (own ? !!e.lh : n < 55); // main gauche : notée par le motif, sinon les notes graves
    const spanEnd = (st) => {
      const sp = spans.find((x) => st >= x.step && st < x.step + x.len);
      return sp ? sp.step + sp.len : st + 1;
    };
    const chordAt = (st) => (spans.find((x) => st >= x.step && st < x.step + x.len) || {}).chord;
    const end = spans.reduce((a, sp) => Math.max(a, sp.step + sp.len), 0);
    const odd = evs.some((e) => e.step % 2); // doubles-croches : swing des doubles, sinon des croches
    const out = [];
    for (const e0 of evs) {
      const e = clean(e0);
      let lhN = e.notes.filter((n) => isL(e0, n));
      let md = e.notes.filter((n) => !isL(e0, n));
      // main gauche
      if (s.lh === 'aucune') lhN = [];
      else if (s.lh === 'oct' && lhN.length) {
        const lo = Math.min(...lhN);
        if (!lhN.includes(lo + 12) && !lhN.includes(lo - 12)) lhN.push(lo - 12 >= 28 ? lo - 12 : lo + 12);
      }
      // voicing (accords de trois notes et plus)
      if (md.length >= 3 && s.voice >= 0.35) {
        md = md.slice().sort((a, b) => a - b);
        if (s.voice < 0.7) md[md.length - 2] -= 12; // drop 2
        else md[1] += 12; // large : la deuxième voix monte d'une octave
      }
      // couleurs de l'accord : sus4 (la tierce monte à la quarte), septième, neuvième
      const c = (s.sus || s.col7 || s.col9) && chordAt(e.step);
      if (c) {
        const iv = intervals(c, tones ? tones(c) : [c.rootPc, c.rootPc + (/^m(?!aj)|dim/.test(c.type || '') ? 3 : 4), c.rootPc + 7]);
        const rel = (n) => pcOf(n - c.rootPc);
        if (s.sus) md = md.map((n) => (rel(n) === iv.third && (iv.third === 3 || iv.third === 4) ? n + (5 - iv.third) : n));
        if (md.length >= 2) {
          const top = Math.max(...md);
          const add = (semi) => {
            if (md.some((n) => rel(n) === pcOf(semi))) return;
            md.push(top + (pcOf(c.rootPc + semi - top) || 12)); // au-dessus de l'accord : pas de seconde serrée contre la fondamentale
          };
          if (s.col7) add(iv.seventh);
          if (s.col9) add(14);
        }
      }
      // registre de la main droite
      const sh = s.reg < 0.33 ? -12 : s.reg >= 0.67 ? 12 : 0;
      if (sh) md = md.map((n) => n + sh);
      // octaves de l'arpège : la mesure monte d'une octave par partie (notes seules de la main droite)
      if (s.oct > 1 && md.length === 1) md = [md[0] + 12 * Math.floor(((e.step % SPB) / SPB) * s.oct)];
      e.notes = [...new Set([...lhN, ...md])].sort((a, b) => a - b);
      if (!e.notes.length) continue;
      // énergie, accent, main humaine
      let v = e.vel * (0.7 + 0.6 * s.energy);
      if (s.accent > 0.3) v *= e.step % 4 === 0 ? 1 + (s.accent - 0.3) * 0.5 : 1 - (s.accent - 0.3) * 0.3;
      if (s.human > 0.3) v *= 1 + (r() - 0.5) * (s.human - 0.3) * 0.6;
      e.vel = Math.round(Math.max(0.15, Math.min(1, v)) * 100) / 100;
      // pédale : les notes tiennent plus longtemps, jusqu'au changement d'accord au plus
      if (s.pedal > 0.3) {
        const room = spanEnd(e.step) - e.step - e.len;
        if (room > 0) e.len += Math.round(room * ((s.pedal - 0.3) / 0.7));
      }
      // swing : les doubles (ou les croches) du contretemps arrivent en retard
      const sw = s.swing > 0.02 ? (odd ? (e.step % 2 ? s.swing * 0.33 : 0) : e.step % 4 === 2 ? s.swing * 0.67 : 0) : 0;
      // équilibre des mains : la main gauche et la main droite séparées, l'une plus forte que l'autre
      const parts = [];
      const lhSet = new Set(lhN);
      if (Math.abs(s.bal - 0.5) > 0.02 && lhN.length && md.length) {
        parts.push({ ...e, notes: e.notes.filter((n) => lhSet.has(n)), vel: e.vel * (1 + (0.5 - s.bal) * 0.6) });
        parts.push({ ...e, notes: e.notes.filter((n) => !lhSet.has(n)), vel: e.vel * (1 + (s.bal - 0.5) * 0.6) });
      } else if (Math.abs(s.bal - 0.5) > 0.02) parts.push({ ...e, vel: e.vel * (1 + (lhN.length ? 0.5 - s.bal : s.bal - 0.5) * 0.6) });
      else parts.push(e);
      for (const p of parts) {
        p.vel = Math.round(Math.max(0.15, Math.min(1, p.vel)) * 100) / 100;
        // étalement : les notes de l'accord (main droite, trois et plus) l'une après l'autre, de la plus grave à la plus aiguë
        const rh = p.notes.filter((n) => !lhSet.has(n));
        if (s.roll > 0 && rh.length >= 3) {
          const total = s.roll / 125; // ms → pas, au tempo nominal de 120 BPM (comme Arp One)
          const lh = p.notes.filter((n) => lhSet.has(n));
          if (lh.length) out.push(place({ ...p, notes: lh }, sw, end));
          rh.forEach((n, i) => out.push(place({ ...p, notes: [n] }, sw + (total * i) / (rh.length - 1), end)));
        } else out.push(place(p, sw, end));
      }
    }
    return out;
  }
  /** Décale une note de d pas (pas entier + décalage fin ev.shift, ±0,5 pas), sans dépasser la fin. */
  function place(e, d, end) {
    if (!(d > 0.004)) return e;
    const tot = (e.shift || 0) + d;
    const k = Math.round(tot);
    const o = { ...e };
    if (k && o.step + k >= end) return e;
    o.step += k;
    o.len = Math.max(1, o.len - k);
    const f = Math.round((tot - k) * 100) / 100;
    if (f) o.shift = f;
    else delete o.shift;
    return o;
  }

  /** Dessin d'un motif « k: » pour sa carte (SVG en texte, comme SS.padMotifs.svg) : main droite pleine, main gauche pâle. */
  const draws = {};
  function svg(mode) {
    if (draws[mode]) return draws[mode];
    const C = { rootPc: 0, type: 'maj' };
    const f = fileOf(mode);
    const L = f ? f.bars * f.spb : 16;
    const ev = f
      ? fileEvents([{ step: 0, len: L, chord: C }], { ...f, chords: f.chords.map((c) => [c[0], 0, 'ion', 'C', 0]) }, { tones: () => [0, 4, 7], vel: (v) => v })
      : events([{ step: 0, len: 16, chord: C }], mode, { voice: () => [60, 64, 67], tones: () => [0, 4, 7], vel: (v) => v });
    const ns = ev.flatMap((e) => e.notes);
    const lo = Math.min(...ns, 60);
    const hi = Math.max(...ns, 72);
    const y = (n) => 30 - ((n - lo) / Math.max(12, hi - lo)) * 26;
    const X = 160 / L;
    const beat = f ? (f.meter === '6/8' || f.meter === '12/8' ? 6 : 4) : 4;
    const bars = Array.from({ length: Math.floor((L - 1) / beat) }, (_, i) => (i + 1) * beat).map((b) => `<rect x="${(b * X).toFixed(1)}" y="0" width=".6" height="34" fill="currentColor" opacity="${b % (f ? f.spb : 16) ? 0.25 : 0.5}"/>`).join('');
    const rects = ev.flatMap((e) => e.notes.map((n) => `<rect x="${((e.step + (e.shift || 0)) * X + 0.3).toFixed(1)}" y="${y(n).toFixed(1)}" width="${Math.max(2, Math.min(e.len, 4) * X - 1).toFixed(1)}" height="3.5" rx="1" fill="currentColor" opacity="${e.lh ? 0.45 : 0.95}"/>`)).join('');
    return (draws[mode] = `<svg viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true">${bars}${rects}</svg>`);
  }

  return { svg, JEUX, FAMILIES, STYLES, STYLE_OF, styleOfSong, OWN, ENGINE, ownOf, entryOf, jeuOf, familyOf, stylesOf, inStyle, name, desc, modesOf, ALL, firstOf, surprise, FILE, fileOf, fileEvents, meterOf, sceneKind, stars, DEF, LH, normalize, KNOBS, knobValue, knobPatch, touched, ADV, advanced, TOKEN, parsePat, stepsOf, patText, patFromEvents, intervals, events, shape };
})();
