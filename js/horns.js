/*
 * Section de cuivres de l'assistant Nouvelle chanson (musicien « Cuivres ») : formations par style, jeux, écriture de
 * chaque musicien sur les accords d'une scène. Fonctions pures (aucun DOM) : tests/horns.test.js.
 *
 *   INST                    instruments (son, tessiture réelle en MIDI)
 *   FORMS / FORM            formations : musiciens (rôle Dessus / Harmonie / Basse, place sur scène), grille d'accords
 *                           du modèle, jeu du style (notes MIDI, placements, durées, vélocités) et rythme des coups
 *   JEUX, jeux(form), FAMS  les treize jeux en quatre familles (Riffs, Coups, Tenues, Transitions et fins), noms du style
 *   sceneStars(sec)         jeux conseillés (★) pour une scène d'après son nom ; defaultJeu(sec) : le premier
 *   sceneJeu(sec, model)    le jeu écrit par le modèle de chanson pour la scène, sinon defaultJeu
 *   players(form, add)      musiciens d'une formation, plus ceux ajoutés (doublures) : { id, key, i, role, pan, label, tok, lo, hi }
 *   fromKeys(keys)          formation et musiciens ajoutés d'après les clés des pistes (« funk-tp », « funk-a1_tb »)
 *   write(opts)             notes de chaque musicien pour une scène : { lines: { id: { role, events, lo, hi } } }
 *
 * Les jeux sont écrits sur la grille du modèle (tonalité d'origine) : sur les accords d'une scène, chaque note garde son
 * degré dans la gamme de l'accord (la tierce reste la tierce, la neuvième reste la neuvième) et le musicien garde son
 * registre (la note la plus proche de l'originale transposée). Un musicien ajouté double la voix la plus proche de son
 * registre. Positions en temps (1 = 0, 1& = 0,5…), durées en temps, vélocités MIDI ; une boucle de 1 ou 2 mesures de 4/4.
 */
window.SS = window.SS || {};

SS.horns = (() => {
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const I = (label, tok, lo, hi, hp) => ({ label, tok, lo, hi, hp });
  // échantillons libres (samples/libre : saxophones MTG, trombones Iowa, tuba War Tuba ; VSCO : trompette, cor) ;
  // pas d'échantillons libres pour cornet, bugle, saxhorns, euphonium et sousaphone : le son le plus proche
  const INST = {
    tp: I('Trompette', 'vsco_trumpet', 52, 82, 160),
    cn: I('Cornet', 'vsco_trumpet', 52, 82, 160),
    fl: I('Bugle', 'vsco_horn', 52, 79, 140),
    sa: I('Sax alto', 'libre_sax_alto', 49, 80, 150),
    st: I('Sax ténor', 'libre_sax_tenor', 44, 75, 110),
    sb: I('Sax baryton', 'libre_sax_bari', 36, 68, 60),
    tb: I('Trombone', 'libre_trombone', 40, 72, 80),
    bt: I('Trombone basse', 'libre_bass_trombone', 34, 65, 50),
    hn: I('Cor', 'vsco_horn', 34, 77, 60),
    ha: I('Saxhorn alto', 'vsco_horn', 45, 74, 100),
    hb: I('Saxhorn baryton', 'libre_trombone', 40, 70, 70),
    eu: I('Euphonium', 'libre_tuba', 34, 70, 50),
    tu: I('Tuba', 'libre_tuba', 28, 58, 30),
    so: I('Sousaphone', 'libre_tuba', 28, 58, 30),
  };
  const ROLE_LABEL = { lead: 'Dessus', harm: 'Harmonie', bass: 'Basse', dbl: 'Doublure' };
  // gammes des accords : la note du modèle garde son rang dans la gamme de l'accord
  const SCALES = { ion: [0, 2, 4, 5, 7, 9, 11], mix: [0, 2, 4, 5, 7, 9, 10], aeo: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], loc: [0, 1, 3, 5, 6, 8, 10] };
  /** Gamme d'un accord d'après ses notes (classes) : mineur, dominante, diminué, sinon majeur. */
  function scaleOf(rootPc, pcs, like) {
    const rel = new Set((pcs || []).map((p) => pcOf(p - rootPc)));
    if (rel.has(3) && !rel.has(4)) {
      if (rel.has(6) && !rel.has(7)) return 'loc';
      if (rel.has(9)) return 'dor';
      return rel.has(8) || rel.has(10) || !['aeo', 'dor'].includes(like) ? 'aeo' : like; // accord parfait : la couleur du modèle
    }
    if (rel.has(10)) return 'mix';
    if (rel.has(11)) return 'ion';
    return ['ion', 'mix'].includes(like) ? like : 'ion'; // accord parfait majeur : la septième du modèle (la 7 mineure du funk reste)
  }

  const P = (id, i, role, pan, x = {}) => ({ id, i, role, pan, ...x });
  // chords : [temps, fondamentale (classe), gamme, symbole] ; sig.p : { musicien: [[position, MIDI, durée, vélocité]] }
  const FORMS = [
    { id: 'bigband', label: 'Big band', tempo: 132, swing: true, bars: 1,
      chords: [[0, 10, 'ion', 'Bb6'], [2, 5, 'mix', 'F7']],
      players: [P('as', 'sa', 'harm', -0.55), P('ts', 'st', 'harm', -0.35), P('bs', 'sb', 'bass', -0.15), P('t1', 'tp', 'lead', 0.35, { label: 'Trompette 1' }), P('t2', 'tp', 'harm', 0.5, { label: 'Trompette 2' }), P('tb', 'tb', 'harm', 0.15, { label: 'Trombone ténor' }), P('bt', 'bt', 'bass', 0)],
      sig: { label: 'Réponses entre pupitres', text: 'Les saxes, puis les cuivres', p: {
        as: [[0, 65, 0.5, 84], [0.5, 67, 0.25, 77]], ts: [[0, 62, 0.5, 79], [0.5, 65, 0.25, 73]], bs: [[0, 46, 0.5, 83], [0.5, 50, 0.25, 75]],
        t1: [[2, 72, 0.5, 106], [2.5, 69, 0.25, 88]], t2: [[2, 69, 0.5, 99], [2.5, 63, 0.25, 83]], tb: [[2, 63, 0.5, 92], [2.5, 60, 0.25, 81]], bt: [[2, 41, 0.5, 89], [2.5, 41, 0.25, 77]] } },
      coups: { label: 'Shout en bloc', h: [[0, 0.5, 100], [1.5, 0.25, 92], [2.5, 1, 108], [3.5, 0.25, 96]] } },
    { id: 'soul', label: 'Soul', tempo: 104, bars: 1,
      chords: [[0, 0, 'mix', 'C7']],
      players: [P('tp', 'tp', 'lead', 0.3), P('ts', 'st', 'harm', -0.3), P('tb', 'tb', 'bass', 0, { off: true, from: ['ts', -12] })],
      sig: { label: 'Réponse au chant', text: 'Les temps 1 et 2 restent à la voix', p: {
        tp: [[2, 67, 0.25, 86], [2.5, 70, 0.5, 99], [3.5, 72, 0.25, 92]], ts: [[2, 64, 0.25, 79], [2.5, 67, 0.5, 92], [3.5, 70, 0.25, 85]] } },
      coups: { label: 'Coups soul', h: [[0, 0.5, 96], [1.5, 0.25, 88], [3, 1, 100]] } },
    { id: 'funk', label: 'Funk', tempo: 108, bars: 1,
      chords: [[0, 5, 'mix', 'F9']],
      players: [P('tp', 'tp', 'lead', 0.35), P('ts', 'st', 'harm', -0.35), P('tb', 'tb', 'harm', 0.12), P('bs', 'sb', 'bass', -0.12)],
      sig: { label: 'Accents syncopés', text: 'Doubles croches, 3e coup appuyé', p: {
        tp: [[0.5, 72, 0.25, 96], [1.75, 67, 0.25, 82], [2.5, 75, 0.5, 110], [3.75, 72, 0.25, 89]],
        ts: [[0.5, 69, 0.25, 90], [1.75, 63, 0.25, 76], [2.5, 72, 0.5, 103], [3.75, 69, 0.25, 83]],
        tb: [[0.5, 63, 0.25, 85], [1.75, 57, 0.25, 73], [2.5, 67, 0.5, 98], [3.75, 63, 0.25, 81]],
        bs: [[0.5, 53, 0.25, 91], [1.75, 48, 0.25, 78], [2.5, 53, 0.5, 100], [3.75, 48, 0.25, 84]] } },
      coups: { label: 'Coups funk', h: [[0, 0.25, 108], [0.75, 0.25, 88], [2.5, 0.5, 110]] } },
    { id: 'disco', label: 'Disco-funk', tempo: 122, bars: 1,
      chords: [[0, 5, 'mix', 'F9']],
      players: [P('tp', 'tp', 'lead', 0.35), P('ts', 'st', 'harm', -0.35), P('tb', 'tb', 'harm', 0.12), P('bs', 'sb', 'bass', -0.12)],
      sig: { label: 'Contretemps', text: 'Tout sur les « et »', p: {
        tp: [[0.5, 72, 0.25, 96], [1.5, 67, 0.25, 82], [2.5, 75, 0.25, 110], [3.5, 72, 0.25, 89]],
        ts: [[0.5, 69, 0.25, 90], [1.5, 63, 0.25, 76], [2.5, 72, 0.25, 103], [3.5, 69, 0.25, 83]],
        tb: [[0.5, 63, 0.25, 85], [1.5, 57, 0.25, 73], [2.5, 67, 0.25, 98], [3.5, 63, 0.25, 81]],
        bs: [[0.5, 53, 0.25, 91], [1.5, 48, 0.25, 78], [2.5, 53, 0.25, 100], [3.5, 48, 0.25, 84]] } },
      coups: { label: 'Coups disco', h: [[0, 0.5, 100], [1.5, 0.25, 90], [3.5, 0.5, 104]] } },
    { id: 'salsa', label: 'Salsa', tempo: 96, bars: 2,
      chords: [[0, 0, 'aeo', 'Cm'], [4, 7, 'mix', 'G7']],
      players: [P('t1', 'tp', 'lead', 0.35, { label: 'Trompette 1' }), P('t2', 'tp', 'harm', 0.55, { label: 'Trompette 2' }), P('b1', 'tb', 'harm', -0.35, { label: 'Trombone 1' }), P('b2', 'tb', 'bass', -0.55, { label: 'Trombone 2' })],
      sig: { label: 'Mambo 2-3', text: 'Sommet sur le 3& de la 2e mesure', p: {
        t1: [[0.5, 67, 0.5, 93], [1.5, 70, 0.25, 100], [3, 72, 0.5, 108], [4, 71, 0.5, 104], [5.5, 74, 0.25, 107], [6.5, 77, 0.5, 114], [7.5, 74, 0.25, 96]],
        t2: [[0.5, 63, 0.5, 86], [1.5, 67, 0.25, 93], [3, 67, 0.5, 99], [4, 67, 0.5, 97], [5.5, 71, 0.25, 100], [6.5, 74, 0.5, 106], [7.5, 71, 0.25, 89]],
        b1: [[0.5, 60, 0.5, 88], [1.5, 63, 0.25, 94], [3, 63, 0.5, 99], [4, 62, 0.5, 94], [5.5, 65, 0.25, 101], [6.5, 71, 0.5, 105], [7.5, 65, 0.25, 90]],
        b2: [[0.5, 55, 0.5, 83], [1.5, 60, 0.25, 90], [3, 60, 0.5, 96], [4, 55, 0.5, 90], [5.5, 62, 0.25, 96], [6.5, 65, 0.5, 100], [7.5, 55, 0.25, 87]] } },
      coups: { label: 'Coups sur la clave', h: [[1, 0.25, 96], [2, 0.25, 100], [4, 0.25, 104], [5.5, 0.25, 104], [7, 0.5, 110]] } },
    { id: 'ska', label: 'Ska', tempo: 148, bars: 1,
      chords: [[0, 7, 'ion', 'G']],
      players: [P('tp', 'tp', 'lead', 0.3), P('ts', 'st', 'harm', -0.3), P('as', 'sa', 'harm', -0.5), P('tb', 'tb', 'bass', 0.1)],
      sig: { label: 'Thème ska', text: 'Trompette et ténor ensemble', p: {
        tp: [[0, 74, 0.5, 94], [1.5, 71, 0.25, 88], [2, 67, 0.5, 98], [3.5, 69, 0.25, 83]],
        ts: [[0, 71, 0.5, 85], [1.5, 67, 0.25, 79], [2, 62, 0.5, 91], [3.5, 64, 0.25, 76]],
        as: [[0, 67, 0.5, 82], [2, 71, 0.5, 89], [3.5, 72, 0.25, 79]],
        tb: [[0.5, 55, 0.25, 85], [1, 59, 0.5, 77], [2.5, 62, 0.25, 89], [3, 55, 0.5, 79]] } },
      coups: { label: 'Coups au contretemps', h: [[0.5, 0.25, 90], [1.5, 0.25, 84], [2.5, 0.25, 90], [3.5, 0.25, 84]] } },
    { id: 'rock', label: 'Rock à cuivres', tempo: 126, bars: 1,
      chords: [[0, 4, 'aeo', 'Em'], [2.5, 2, 'ion', 'D']],
      players: [P('tp', 'tp', 'lead', 0.3), P('ts', 'st', 'harm', -0.3), P('tb', 'tb', 'bass', 0)],
      sig: { label: 'Tenue puis deux attaques', text: 'De la place pour le riff de guitare', p: {
        tp: [[0, 71, 1.5, 95], [2.5, 69, 0.25, 101], [3.5, 74, 0.25, 108]], ts: [[0, 67, 1.5, 86], [2.5, 66, 0.25, 92], [3.5, 69, 0.25, 97]], tb: [[0, 52, 1.5, 88], [2.5, 50, 0.25, 95], [3.5, 54, 0.25, 100]] } },
      coups: { label: 'Coups rock', h: [[0, 0.5, 104], [1.5, 0.5, 96], [3, 0.25, 100], [3.5, 0.5, 110]] } },
    { id: 'film', label: 'Musique de film', tempo: 84, bars: 2, swell: true,
      chords: [[0, 2, 'aeo', 'Dm'], [4, 10, 'ion', 'Bb']],
      players: [P('c1', 'hn', 'lead', -0.3, { label: 'Cor 1' }), P('c2', 'hn', 'harm', -0.45, { label: 'Cor 2' }), P('tp', 'tp', 'lead', 0.35), P('tb', 'tb', 'harm', 0.2, { label: 'Trombone ténor' }), P('bt', 'bt', 'bass', 0.3), P('tu', 'tu', 'bass', 0.05)],
      sig: { label: 'Thème aux cors', text: 'La trompette attend la 2e mesure', p: {
        c1: [[0, 62, 2, 73], [2, 65, 2, 82], [4, 67, 2, 87], [6, 65, 2, 83]], c2: [[0, 57, 4, 70], [4, 62, 4, 77]], tp: [[4, 70, 1, 104], [6, 74, 1, 111]],
        tb: [[0, 50, 4, 68], [4, 53, 4, 78]], bt: [[0, 45, 4, 65], [4, 46, 4, 73]], tu: [[0, 38, 4, 62], [4, 34, 4, 72]] } },
      coups: { label: 'Fanfare', h: [[0, 0.25, 90], [0.25, 0.25, 84], [0.5, 0.5, 92], [1, 3, 100], [4, 0.25, 96], [4.25, 0.25, 90], [4.5, 0.5, 100], [5, 3, 112]] } },
    { id: 'nola', label: 'Nouvelle-Orléans', tempo: 108, bars: 1,
      chords: [[0, 5, 'mix', 'F7']],
      players: [P('so', 'so', 'bass', 0), P('tp', 'tp', 'lead', 0.3), P('tb', 'tb', 'harm', -0.3), P('ts', 'st', 'harm', 0.45)],
      sig: { label: 'Basse au sousaphone', text: 'Le grave mène, les autres répondent', p: {
        so: [[0, 41, 0.75, 99], [1.5, 48, 0.25, 87], [2, 51, 0.5, 94], [3.5, 48, 0.25, 84]], tp: [[0.5, 72, 0.5, 93], [1.5, 69, 0.25, 86], [3, 75, 0.5, 103]],
        tb: [[1, 53, 0.5, 87], [2.5, 60, 0.25, 94], [3, 57, 0.5, 82]], ts: [[0.5, 69, 0.5, 85], [2, 67, 0.5, 81], [3, 72, 0.5, 95]] } },
      coups: { label: 'Coups second line', h: [[0, 0.5, 100], [1.5, 0.25, 90], [2, 0.5, 96], [3.5, 0.5, 104]] } },
    { id: 'brit', label: 'Brass band', tempo: 116, bars: 1,
      chords: [[0, 3, 'ion', 'Eb']],
      players: [P('cn', 'cn', 'lead', 0.4), P('fl', 'fl', 'harm', 0.25), P('ha', 'ha', 'harm', -0.25), P('hb', 'hb', 'harm', -0.4), P('eu', 'eu', 'harm', 0.1), P('tb', 'tb', 'harm', -0.1), P('tu', 'tu', 'bass', 0)],
      sig: { label: 'Marche', text: 'La basse sur 1 et 3, les réponses sur 2 et 4', p: {
        cn: [[0, 70, 0.75, 98], [1, 72, 0.5, 91], [1.5, 70, 0.5, 84], [2, 67, 1.5, 96]], fl: [[0, 67, 1.75, 79], [2, 63, 1.5, 81]], ha: [[1, 63, 0.5, 80], [3, 58, 0.5, 77]],
        hb: [[1, 58, 0.5, 74], [3, 55, 0.5, 72]], eu: [[0, 51, 1, 85], [1.5, 55, 0.5, 79], [2, 58, 0.75, 89], [3, 55, 0.5, 78]], tb: [[1, 55, 0.5, 82], [3, 51, 0.5, 79]], tu: [[0, 39, 0.75, 91], [2, 34, 0.75, 84]] } },
      coups: { label: 'Coups de marche', h: [[0, 0.75, 96], [1.5, 0.5, 88], [2, 1.5, 100]] } },
  ];
  const FORM = Object.fromEntries(FORMS.map((f) => [f.id, f]));
  const formOf = (id) => FORM[id] || FORM.funk;
  /** Formation conseillée pour un style de l'assistant. */
  const STYLE_FORM = { soul: 'soul', funk: 'funk', hiphop: 'funk', pop: 'rock', disco: 'disco', latin: 'salsa', salsa: 'salsa', reggae: 'ska', ska: 'ska', rock: 'rock', poprock: 'rock', film: 'film', cinematic: 'film', jazz: 'bigband', swing: 'bigband', cliches: 'brit' };
  const formFor = (styleId) => STYLE_FORM[styleId] || 'funk';

  /*
   * Treize jeux en quatre familles. Les jeux de « Transitions et fins » s'écrivent sur toute la scène (la dernière mesure
   * change), les autres sont une boucle de la formation répétée. Certains prennent le nom du style (ALIAS).
   */
  const FAMS = [['riff', 'Riffs'], ['coups', 'Coups'], ['ten', 'Tenues'], ['trans', 'Transitions et fins']];
  const JEU_DEFS = [
    { id: 'sig', fam: 'riff' },
    { id: 'rep', fam: 'riff', label: 'Question-réponse', text: 'Le dessus lance une mesure, la section répond la suivante' },
    { id: 'uni', fam: 'riff', label: 'Unisson', text: 'Toute la section sur la ligne du dessus, en octaves ; la basse garde sa ligne' },
    { id: 'contre', fam: 'riff', label: 'Contre-chant', text: 'Harmonie et basse : une ligne lente sous le chant, le dessus se tait' },
    { id: 'coups', fam: 'coups' },
    { id: 'temps', fam: 'coups', label: 'Coups sur 2 et 4', text: 'Courts, sur les temps faibles' },
    { id: 'antic', fam: 'coups', label: 'Coups anticipés', text: 'Un coup sur le 2&, un autre poussé sur le 4&, qui prend déjà l’accord suivant' },
    { id: 'ten', fam: 'ten', label: 'Tenues', text: 'Un accord tenu à chaque changement d’accord' },
    { id: 'swell', fam: 'ten', label: 'Tenues qui enflent', text: 'Chaque accord part piano et enfle' },
    { id: 'pad', fam: 'ten', label: 'Nappe douce', text: 'L’harmonie seule, piano, le dessus se tait' },
    { id: 'montee', fam: 'trans', label: 'Montée', text: 'Des tenues qui enflent, puis la section grimpe ensemble sur la dernière mesure' },
    { id: 'fin', fam: 'trans', label: 'Fin', text: 'Le jeu du style, puis trois coups dans la dernière mesure, le dernier tenu' },
    { id: 'break', fam: 'trans', label: 'Coup d’arrêt', text: 'Un coup sur le 1, puis silence' },
  ];
  const JEU_IDS = JEU_DEFS.map((j) => j.id);

  /*
   * Les 50 motifs du fichier de Nicolas (js/horns-motifs.js, généré), cinq par formation, rangés dans les familles ;
   * MOTIF_TAGS : [famille, types de scène où le motif est conseillé (★)]. Une Transition se joue sur les dernières mesures.
   */
  const MOTIFS = (SS.HORN_MOTIFS || []).map((m) => ({ ...m, id: 'm' + String(m.n).padStart(2, '0') }));
  const MOTIF_TAGS = {
    1: ['riff', 'chorus'], 2: ['coups', 'bridge'], 3: ['trans', 'pre'], 4: ['riff', 'verse'], 5: ['trans', 'outro'],
    6: ['riff', 'verse'], 7: ['riff', 'verse'], 8: ['riff', 'bridge'], 9: ['coups', 'chorus'], 10: ['riff', 'chorus'],
    11: ['coups', 'chorus'], 12: ['riff', 'intro'], 13: ['coups', 'verse'], 14: ['coups', 'bridge'], 15: ['riff', 'chorus'],
    16: ['coups', 'verse'], 17: ['trans', 'pre'], 18: ['riff', 'chorus'], 19: ['coups', 'intro'], 20: ['coups', 'chorus'],
    21: ['riff', 'chorus'], 22: ['riff', 'chorus'], 23: ['coups', 'verse'], 24: ['trans', 'pre'], 25: ['trans', 'outro'],
    26: ['riff', 'chorus'], 27: ['riff', 'verse'], 28: ['riff', 'bridge'], 29: ['coups', 'verse'], 30: ['riff', 'outro'],
    31: ['riff', 'verse'], 32: ['ten', 'intro'], 33: ['riff', 'bridge'], 34: ['trans', 'pre'], 35: ['riff', 'chorus'],
    36: ['ten', 'intro'], 37: ['coups', 'chorus'], 38: ['ten', 'pre'], 39: ['riff', 'verse'], 40: ['riff', 'outro'],
    41: ['riff', 'intro'], 42: ['riff', 'chorus'], 43: ['riff', 'bridge'], 44: ['riff', 'verse'], 45: ['coups', 'chorus'],
    46: ['riff', 'chorus'], 47: ['riff', 'verse'], 48: ['ten', 'intro'], 49: ['trans', 'outro'], 50: ['riff', 'bridge'],
  };
  MOTIFS.forEach((m) => {
    const t = MOTIF_TAGS[m.n] || ['riff'];
    m.fam = t[0];
    m.scenes = t.slice(1);
  });
  const JEUX = [...JEU_IDS, ...MOTIFS.map((m) => m.id)];
  /** Motif du fichier d'après son id (« m21 »), s'il appartient à la formation. */
  const motifOf = (id, formId) => MOTIFS.find((m) => m.id === id && m.form === formId) || null;
  // instruments du fichier → instruments de js/horns.js
  const DOC_INST = { Trompette: 'tp', 'Trompette 1': 'tp', 'Trompette 2': 'tp', 'Sax alto': 'sa', 'Sax ténor': 'st', 'Sax baryton': 'sb', Trombone: 'tb', 'Trombone 1': 'tb', 'Trombone 2': 'tb', 'Trombone basse': 'bt', Cor: 'hn', Tuba: 'tu', Sousaphone: 'so', Cornet: 'cn', Bugle: 'fl', Euphonium: 'eu' };
  const motifCache = new Map();
  /**
   * Formation qui joue un motif du fichier : mêmes musiciens, grille et mesures du motif. Chaque partie du fichier va au
   * musicien du même instrument (dans l'ordre : Trompette 1 puis 2) ; un musicien sans partie double la partie la plus
   * proche de son registre (la basse : la partie la plus grave), à l'octave qui lui convient.
   */
  function motifForm(F, n) {
    const key = F.id + ':' + n;
    if (motifCache.has(key)) return motifCache.get(key);
    const M = MOTIFS.find((m) => m.n === n);
    const parts = Object.entries(M.parts).map(([name, ev]) => ({ name, i: DOC_INST[name], ev, first: ev[0][1], avg: ev.reduce((a, e) => a + e[1], 0) / ev.length }));
    const used = new Set();
    const p = {};
    F.players.forEach((pl) => {
      const x = parts.find((q) => !used.has(q) && q.i === pl.i);
      if (x) {
        used.add(x);
        p[pl.id] = x.ev.map(([o, m, d, v]) => [o, m, d, v]);
      }
    });
    F.players.forEach((pl) => {
      if (p[pl.id]) return;
      const I = INST[pl.i];
      const mid = (I.lo + I.hi) / 2;
      let best = null;
      const cands = pl.role === 'bass' ? [parts.reduce((a, b) => (b.avg < a.avg ? b : a))] : parts;
      cands.forEach((q) => {
        let sh = 0;
        while (q.avg + sh - mid > 6) sh -= 12;
        while (mid - (q.avg + sh) > 6) sh += 12;
        const d = Math.abs(sh) * 10 + Math.abs(q.avg + sh - mid);
        if (!best || d < best.d) best = { q, sh, d };
      });
      p[pl.id] = best.q.ev.map(([o, m, d, v]) => [o, m + best.sh, d, v * 0.9]);
    });
    const Fm = { ...F, bars: M.bars, chords: M.chords, sig: { label: M.title, text: M.text, p } };
    motifCache.set(key, Fm);
    return Fm;
  }
  const SCENE_WIDE = ['montee', 'fin', 'break'];
  const ALIAS = {
    salsa: { rep: 'Moña', fin: 'Cierre' },
    bigband: { rep: 'Questions-réponses sax / cuivres', fin: 'Shout final' },
    nola: { contre: 'Contre-chant du trombone' },
    film: { swell: 'Crescendo des cors' },
  };
  /** Les treize jeux d'une formation : { id, label, text, fam }. */
  const jeux = (formId) => {
    const F = formOf(formId);
    const al = ALIAS[F.id] || {};
    return [
      ...JEU_DEFS.map((j) => {
        if (j.id === 'sig') return { id: 'sig', fam: j.fam, label: F.sig.label, text: F.sig.text };
        if (j.id === 'coups') return { id: 'coups', fam: j.fam, label: F.coups.label, text: 'Des attaques ensemble, sur le rythme du style' };
        return { id: j.id, fam: j.fam, label: al[j.id] || j.label, text: j.text };
      }),
      ...MOTIFS.filter((m) => m.form === F.id).map((m) => ({ id: m.id, fam: m.fam, label: m.title, text: m.text, n: m.n, bars: m.bars })),
    ];
  };
  /** Type d'une scène d'après son nom : intro, verse, pre, chorus, bridge, outro. */
  function sceneKind(sec) {
    const s = String(sec || '').toLowerCase();
    if (/^(pre|build|mont)/.test(s)) return 'pre';
    if (/^intro/.test(s)) return 'intro';
    if (/^(verse|couplet)/.test(s)) return 'verse';
    if (/^(bridge|break|solo|pont)/.test(s)) return 'bridge';
    if (/^(outro|fin|coda)/.test(s)) return 'outro';
    return 'chorus';
  }
  const STARS = { pre: ['montee', 'swell'], intro: ['swell', 'ten', 'uni'], verse: ['antic', 'contre', 'temps'], bridge: ['uni', 'contre', 'pad'], outro: ['fin', 'break'], chorus: ['sig', 'rep', 'coups'] };
  /**
   * Jeux conseillés (★) pour une scène d'après son nom ; le premier est joué d'office. Les motifs du fichier conseillés
   * pour ce type de scène passent en tête (au refrain : après le jeu du style, qui vient aussi du fichier).
   */
  function sceneStars(sec, formId) {
    const k = sceneKind(sec);
    const doc = formId ? MOTIFS.filter((m) => m.form === formOf(formId).id && m.scenes.includes(k)).map((m) => m.id) : [];
    return k === 'chorus' ? ['sig', ...doc, 'rep', 'coups'] : [...doc, ...STARS[k]];
  }
  /** Jeu proposé d'après le nom de la scène (le premier ★). */
  const defaultJeu = (sec, formId) => sceneStars(sec, formId)[0];
  /** Jeu d'une scène : celui que le modèle de chanson écrit (sections[…].horns), sinon le premier ★ de son nom. */
  const sceneJeu = (sec, model, formId) => (JEUX.includes(model) && (!/^m\d/.test(model) || !formId || motifOf(model, formOf(formId).id)) ? model : defaultJeu(sec, formId));

  /* ---------- musiciens ---------- */
  const chordAt = (F, beat) => {
    const b = ((beat % (F.bars * 4)) + F.bars * 4) % (F.bars * 4);
    let c = F.chords[0];
    for (const x of F.chords) if (x[0] <= b + 1e-6) c = x;
    return c;
  };
  /** Partie « jeu du style » d'un musicien de la formation (une doublure : celle de sa source, à l'octave). */
  function sigPart(F, p) {
    if (p.dbl) {
      const src = F.players.find((x) => x.id === p.dbl[0]);
      return src ? sigPart(F, src).map(([o, m, d, v]) => [o, m + p.dbl[1], d, v * 0.92]) : [];
    }
    if (p.from) return (F.sig.p[p.from[0]] || []).map(([o, m, d, v]) => [o, m + p.from[1], d, v * 0.95]);
    return F.sig.p[p.id] || [];
  }
  const voiceOf = (F, p) => {
    const s = sigPart(F, p);
    return s.length ? s[0] : [0, Math.round((INST[p.i].lo + INST[p.i].hi) / 2), 1, 80];
  };
  /**
   * Musiciens d'une formation, puis ceux ajoutés (add : [clé d'instrument]) : chacun double la voix de la formation la plus
   * proche de son registre, à l'octave qui lui convient. key : identifiant de piste (« funk-tp », « funk-a1 »).
   */
  function players(formId, add = []) {
    const F = formOf(formId);
    const out = F.players.map((p) => ({ ...p, key: `${F.id}-${p.id}`, label: p.label || INST[p.i].label, tok: INST[p.i].tok, lo: INST[p.i].lo, hi: INST[p.i].hi }));
    (add || []).filter((i) => INST[i]).forEach((i, n) => {
      const mid = (INST[i].lo + INST[i].hi) / 2;
      let best = null;
      F.players.forEach((p) => {
        const v = voiceOf(F, p)[1];
        let sh = 0;
        while (v + sh - mid > 6) sh -= 12;
        while (mid - (v + sh) > 6) sh += 12;
        const d = Math.abs(sh) * 10 + Math.abs(v - mid);
        if (!best || d < best.d) best = { p, sh, d };
      });
      const same = out.filter((x) => x.i === i).length;
      out.push({ id: 'a' + (n + 1), i, role: 'dbl', pan: (n % 2 ? -1 : 1) * (0.2 + 0.1 * n), dbl: [best.p.id, best.sh], key: `${F.id}-a${n + 1}_${i}`, label: INST[i].label + (same ? ` ${same + 1}` : ''), tok: INST[i].tok, lo: INST[i].lo, hi: INST[i].hi });
    });
    return out;
  }
  /** Ligne du dessus : à chaque attaque, la note la plus haute des musiciens qui ne font pas la basse. */
  function topLine(F) {
    const at = new Map();
    F.players.filter((p) => p.role !== 'bass').forEach((p) => sigPart(F, p).forEach((e) => {
      const k = e[0].toFixed(3);
      if (!at.has(k) || at.get(k)[1] < e[1]) at.set(k, e);
    }));
    return [...at.values()].sort((a, b) => a[0] - b[0]);
  }
  const avgVel = (F, p) => {
    const s = sigPart(F, p);
    return s.length ? s.reduce((a, x) => a + x[3], 0) / s.length : 85;
  };
  const SAX = ['sa', 'st', 'sb'];
  /** Rôle d'un musicien (une doublure : celui de la voix qu'elle double). */
  const roleOf = (F, p) => (p.dbl ? (F.players.find((x) => x.id === p.dbl[0]) || p).role : p.role);
  /**
   * Question-réponse : qui lance ? Les saxes en big band (les cuivres répondent), sinon le dessus.
   */
  function callsFirst(F, p) {
    const src = p.dbl ? F.players.find((x) => x.id === p.dbl[0]) || p : p;
    return F.id === 'bigband' ? SAX.includes(src.i) : src.role === 'lead';
  }
  /** Ligne du dessus dans le registre d'un musicien (jeu Unisson). */
  function uniLine(F, p) {
    const v = voiceOf(F, p)[1];
    const k = avgVel(F, p) / 100;
    return topLine(F).map(([o, m, d, vel]) => {
      let x = m;
      while (x - v > 6) x -= 12;
      while (v - x > 6) x += 12;
      return [o, x, d, vel * k];
    });
  }
  /**
   * Une boucle du jeu pour un musicien, sur la grille du modèle : [[position, MIDI, durée, vélocité, poussé?]]
   * (n : rang de la boucle dans la scène, pour la Question-réponse ; poussé : la note prend l'accord du temps suivant).
   */
  function loopOf(F, p, jeu, n = 0) {
    const role = roleOf(F, p);
    const [o0, m0] = voiceOf(F, p);
    const src = chordAt(F, o0);
    const k = avgVel(F, p) / 100;
    const on = (o, dm = 0) => realize(m0 + dm, src[1], src[2], chordAt(F, o)[1], chordAt(F, o)[2]);
    const bars = Array.from({ length: F.bars }, (_, b) => b * 4);
    if (jeu === 'uni') return role === 'bass' ? sigPart(F, p) : uniLine(F, p);
    if (jeu === 'rep') {
      const call = callsFirst(F, p);
      if (n % 2 === 0) return call ? uniLine(F, p) : [];
      return call ? [] : sigPart(F, p);
    }
    if (jeu === 'contre') {
      if (role === 'lead') return [];
      // la seconde note : le degré voisin (au-dessus, au-dessous pour la basse) dans la gamme de l'accord du modèle
      const step = (o, dir) => {
        const c = chordAt(F, o);
        const sc = SCALES[c[2]] || SCALES.ion;
        const n = on(o);
        const i = sc.indexOf(pcOf(n - c[1]));
        if (i < 0) return n + dir * 2;
        const j = (i + dir + 7) % 7;
        return n + pcOf(sc[j] - sc[i]) - (dir < 0 ? 12 : 0) * (pcOf(sc[j] - sc[i]) ? 1 : 0);
      };
      return bars.flatMap((b) => [[b, on(b), 1.9, 70 * k + 6], [b + 2, step(b + 2, role === 'bass' ? -1 : 1), 1.9, 64 * k + 6]]);
    }
    if (jeu === 'coups') return F.coups.h.map(([o, d, v]) => [o, on(o), d, v * k]);
    if (jeu === 'temps') return bars.flatMap((b) => [1, 3].map((o) => [b + o, on(b + o), 0.35, 96 * k]));
    if (jeu === 'antic') {
      const cyc = F.bars * 4;
      return bars.flatMap((b) => [[b + 1.5, on(b + 1.5), 0.4, 92 * k], [b + 3.5, on((b + 4) % cyc), 1.3, 106 * k, true]]);
    }
    return sigPart(F, p);
  }

  /** Une note du modèle (accord sRoot, gamme sSc) recalculée sur un autre accord : même rang dans la gamme, au plus près. */
  function realize(n, sRoot, sSc, dRoot, dSc) {
    if (sRoot === dRoot && sSc === dSc) return n;
    const sa = Array.isArray(sSc) ? sSc : SCALES[sSc] || SCALES.ion;
    const sb = Array.isArray(dSc) ? dSc : SCALES[dSc] || SCALES.ion;
    const rel = pcOf(n - sRoot);
    let s = 0;
    for (let i = 0; i < 7; i++) if (sa[i] <= rel) s = i;
    const alt = rel - sa[s];
    const pc = pcOf(dRoot + sb[s] + alt);
    const tgt = n + (pcOf(dRoot - sRoot + 6) - 6);
    let best = null;
    for (let m = tgt - 6; m <= tgt + 6; m++) if (pcOf(m) === pc && (best === null || Math.abs(m - tgt) < Math.abs(best - tgt))) best = m;
    return best;
  }
  const semi = (a, b) => pcOf(a - b) === 1 || pcOf(b - a) === 1;
  /**
   * Gamme d'un accord dans la tonalité de la chanson (keyPcs : ses 7 notes) : la gamme de la tonalité depuis la
   * fondamentale, où chaque note de l'accord étrangère à la tonalité remplace sa voisine à un demi-ton (Mi7 en la mineur :
   * Mi Fa Sol♯ La Si Do Ré). Intervalles depuis la fondamentale, ou null si l'accord ne s'y prête pas.
   */
  function keyScale(rootPc, pcs, keyPcs) {
    const set = new Set(keyPcs);
    (pcs || []).forEach((t) => {
      if (set.has(t)) return;
      const nb = [...set].filter((x) => semi(x, t) && !(pcs || []).includes(x));
      if (!nb.length) return;
      set.delete(nb[0]);
      set.add(t);
    });
    const iv = [...set].map((x) => pcOf(x - rootPc)).sort((a, b) => a - b);
    return iv.length === 7 && iv[0] === 0 ? iv : null;
  }
  const inRange = (m, p) => {
    while (m > p.hi) m -= 12;
    while (m < p.lo) m += 12;
    return m;
  };
  const NUANCE = { p: 0.72, mf: 0.88, f: 1 };

  /**
   * Écrit la section pour une scène.
   *   form, add : formation et musiciens ajoutés ; jeu : un des JEUX ; off : [ids coupés] ; nuance : p | mf | f
   *   spans : [{ step, len, rootPc, pcs }] (accords de la scène, en pas) ; bars, spb (pas par mesure), beat (pas par temps)
   *   model : true = les notes du modèle telles quelles (sa tonalité, sa grille), sans recalcul
   * → { lines: { id: { role, events: [{ step, len, notes, vel, shift? }], lo, hi, vol? } } }
   *   vol : courbe de volume { pas: 0..1 } des jeux qui enflent (Tenues qui enflent, Montée)
   */
  function write({ form, add = [], jeu = 'sig', off = [], nuance = 'mf', spans = [], bars = 4, spb = 16, beat = 4, model = false, key = null }) {
    const F = formOf(form);
    const MO = motifOf(jeu, F.id);
    const J = MO ? jeu : JEU_IDS.includes(jeu) ? jeu : 'sig';
    const nu = NUANCE[nuance] || NUANCE.mf;
    const perBar = spb / beat; // temps par mesure (4 en 4/4, 3 en 3/4)
    const total = bars * spb;
    const spanAt = (step) => spans.find((sp) => step >= sp.step && step < sp.step + sp.len) || spans[spans.length - 1] || null;
    /** Note du modèle (sur l'accord du modèle au temps o de la boucle) posée sur l'accord de la scène au pas `at`. */
    const place = (m, o, at, Fx = F) => {
      const s = chordAt(Fx, o % (Fx.bars * 4));
      if (model || !spans.length) {
        const t = chordAt(Fx, (Math.floor(at / spb) % Fx.bars) * 4 + Math.min(3.99, (at % spb) / beat));
        return realize(m, s[1], s[2], t[1], t[2]);
      }
      const sp = spanAt(Math.min(total - 1, at));
      if (!sp) return m;
      const ks = key && keyScale(sp.rootPc, sp.pcs, key);
      const n = realize(m, s[1], s[2], sp.rootPc, ks || scaleOf(sp.rootPc, sp.pcs, s[2]));
      if (!ks) return n;
      // une note chromatique du modèle (altération) qui tombe hors de la gamme de l'accord : la note de la gamme la plus proche
      const ok = (x) => ks.includes(pcOf(x - sp.rootPc));
      return ok(n) ? n : ok(n - 1) ? n - 1 : ok(n + 1) ? n + 1 : n;
    };
    /** Une note tenue (un temps ou plus) qui frotte à un demi-ton d'une note de l'accord glisse sur la note de l'accord. */
    const settle = (m, step, len) => {
      if (!key || model || !spans.length || len < beat) return m;
      const sp = spanAt(Math.min(total - 1, step));
      if (!sp || !sp.pcs || sp.pcs.includes(pcOf(m)) || !sp.pcs.some((t) => semi(pcOf(m), t))) return m;
      for (const d of [-1, 1, -2, 2]) if (sp.pcs.includes(pcOf(m + d))) return m + d;
      return m;
    };
    const lines = {};
    players(F.id, add).forEach((p) => {
      const events = [];
      const vol = {};
      const push = (x, m, len, v) => {
        if (x >= total) return null;
        const st = Math.round(x);
        const shift = +(x - st).toFixed(3);
        const ln = Math.max(1, Math.min(total - st, Math.round(len)));
        const e = { step: st, len: ln, notes: [inRange(settle(m, st, ln), p)], vel: +Math.max(0.15, Math.min(1, (v / 127) * nu)).toFixed(3) };
        if (shift) e.shift = shift;
        events.push(e);
        return e;
      };
      const [o0, m0] = voiceOf(F, p);
      const k = avgVel(F, p) / 100;
      /** Un accord tenu par accord de la scène (dans le modèle : par accord du modèle), sur les mesures [0, upto). */
      const tenues = (vel, upto, swell) => {
        const end = upto * spb;
        const out = [];
        if (model || !spans.length) {
          for (let b = 0; b < upto; b++) {
            const mb = b % F.bars;
            const segs = F.chords.filter((c) => Math.floor(c[0] / 4) === mb);
            const list = segs.length && segs[0][0] === mb * 4 ? segs : [chordAt(F, mb * 4), ...segs];
            list.forEach((c, i) => {
              const a = Math.max(0, c[0] - mb * 4);
              const e = Math.min(perBar, list[i + 1] ? list[i + 1][0] - mb * 4 : 4);
              if (a < e) out.push([b * spb + a * beat, (e - a) * beat - 1]);
            });
          }
        } else spans.forEach((sp) => sp.step < end && out.push([sp.step, Math.max(1, Math.min(sp.len, end - sp.step) - Math.max(1, Math.round(beat / 4)))]));
        out.forEach(([x, len]) => {
          const e = push(x, place(m0, o0, x), len, typeof vel === 'function' ? vel(x) : vel);
          if (e && swell) {
            vol[e.step] = 0.35;
            vol[Math.min(total - 1, e.step + e.len - 1)] = 1;
          }
        });
      };
      /** Les boucles du jeu sur les mesures [from, upto) (Fx : la formation, ou un motif du fichier). */
      const loops = (J2, upto, from = 0, Fx = F) => {
        for (let b = from, n = 0; b < upto; b += Fx.bars, n++)
          loopOf(Fx, p, J2, n).forEach(([o, m, d, v, pushed]) => {
            const mb = Math.floor(o / 4); // mesure dans la boucle
            const ib = o - mb * 4; // temps dans la mesure
            if (ib >= perBar - 1e-6) return; // mesure plus courte que 4 temps : on coupe
            const bar = b + mb;
            if (bar >= upto) return;
            const pos = Fx.swing && Math.abs((ib % 1) - 0.5) < 1e-6 ? ib + 1 / 6 : ib;
            const x = bar * spb + pos * beat;
            // une note poussée prend l'accord du temps qui suit (elle est écrite sur l'accord du modèle à o + ½)
            const note = pushed ? place(m, o + 0.5, Math.round(x + beat / 2), Fx) : place(m, o, Math.round(x), Fx);
            push(x, note, pushed ? d * beat : Math.min(d, perBar - ib) * beat, v);
          });
      };
      if (!off.includes(p.id)) {
        const last = bars - 1;
        const lead = roleOf(F, p) === 'lead';
        if (J === 'ten') tenues(66 + (lead ? 4 : 0), bars);
        else if (J === 'swell') tenues(62 + (lead ? 4 : 0), bars, true);
        else if (J === 'pad') {
          if (!lead) tenues(50, bars);
        } else if (J === 'break') push(0, place(m0, o0, 0), beat, 112 * k);
        else if (J === 'montee') {
          // des tenues qui enflent, de plus en plus fort, puis la section grimpe ensemble (croches) sur la dernière mesure
          tenues((x) => 56 + (12 * x) / Math.max(1, last * spb), last, true);
          const sc = SCALES[chordAt(F, o0)[2]] || SCALES.ion;
          const root = chordAt(F, o0)[1];
          const start = m0 - 12 >= p.lo ? m0 - 12 : m0;
          let deg = sc.indexOf(pcOf(start - root));
          let base = start - (deg >= 0 ? sc[deg] : 0);
          if (deg < 0) deg = 0;
          const nn = Math.round(perBar * 2);
          for (let i = 0; i < nn; i++) {
            const d = deg + i;
            const m = base + sc[d % 7] + 12 * Math.floor(d / 7);
            const x = last * spb + i * (beat / 2);
            push(x, place(m, o0, Math.round(x)), beat / 2 - 0.5, 74 + (36 * i) / nn);
          }
        } else if (J === 'fin') {
          loops('sig', last);
          [[0, 0.5, 104], [1.5, 0.5, 106], [perBar - 1, 1, 118]].forEach(([o, d, v]) => {
            const x = last * spb + o * beat;
            push(x, place(m0, o0, Math.round(x)), d * beat, v * k);
          });
        } else if (MO) {
          // motif du fichier : en boucle ; une transition ou une fin se joue sur les dernières mesures, après le jeu du style
          const Fm = motifForm(F, MO.n);
          const from = MO.fam === 'trans' ? Math.max(0, bars - Fm.bars) : 0;
          if (from) loops('sig', from);
          loops('sig', bars, from, Fm);
        } else loops(J, bars);
      }
      events.sort((a, b) => a.step - b.step);
      const ns = events.map((e) => e.notes[0]);
      const L = { role: p.role, events, lo: ns.length ? Math.min(...ns) : null, hi: ns.length ? Math.max(...ns) : null };
      if (Object.keys(vol).length) L.vol = vol;
      lines[p.id] = L;
    });
    return { lines };
  }
  /** Formation et musiciens ajoutés d'après les clés de ses pistes : { form, add, ids } (ids : un par clé). */
  function fromKeys(keys) {
    const ks = (keys || []).filter(Boolean);
    const form = (ks[0] || '').split('-')[0];
    const add = [];
    const ids = ks.map((k) => {
      const id = k.slice(k.indexOf('-') + 1);
      const m = /^a\d+_(\w+)$/.exec(id);
      if (m) add.push(m[1]);
      return m ? id.split('_')[0] : id;
    });
    return { form: FORM[form] ? form : 'funk', add, ids };
  }
  /** Joue d'office ? (musicien d'une formation coupé au départ, comme le trombone de la soul). */
  const offByDefault = (formId) => formOf(formId).players.filter((p) => p.off).map((p) => p.id);

  const NOTES_FR = () => (SS.NOTE_NAMES_FR || ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si']);
  const midiName = (m) => NOTES_FR()[pcOf(m)] + (Math.floor(m / 12) - 1);

  return { INST, FORMS, FORM, formOf, fromKeys, formFor, STYLE_FORM, JEUX, FAMS, SCENE_WIDE, ALIAS, MOTIFS, motifOf, motifForm, jeux, sceneKind, sceneStars, defaultJeu, sceneJeu, players, write, realize, scaleOf, SCALES, offByDefault, ROLE_LABEL, midiName, NUANCE };
})();
