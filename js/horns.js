/*
 * Section de cuivres de l'assistant Nouvelle chanson (musicien « Cuivres ») : formations par style, jeux, écriture de
 * chaque musicien sur les accords d'une scène. Fonctions pures (aucun DOM) : tests/horns.test.js.
 *
 *   INST                    instruments (son, tessiture réelle en MIDI)
 *   FORMS / FORM            formations : musiciens (rôle Dessus / Harmonie / Basse, place sur scène), grille d'accords
 *                           du modèle, jeu du style (notes MIDI, placements, durées, vélocités) et rythme des coups
 *   JEUX, jeux(form)        les quatre jeux : sig (le jeu du style), uni (unisson), coups, ten (tenues)
 *   defaultJeu(sec)         jeu proposé pour une scène d'après son nom (intro, couplet, refrain…)
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

  const JEUX = ['sig', 'uni', 'coups', 'ten'];
  /** Les quatre jeux d'une formation : { id, label, text }. */
  const jeux = (formId) => {
    const F = formOf(formId);
    return [
      { id: 'sig', label: F.sig.label, text: F.sig.text },
      { id: 'uni', label: 'Unisson', text: 'Toute la section sur la ligne du dessus, en octaves ; la basse garde sa ligne' },
      { id: 'coups', label: F.coups.label, text: 'Des attaques ensemble, sur le rythme du style' },
      { id: 'ten', label: 'Tenues', text: 'Un accord tenu à chaque changement d’accord' },
    ];
  };
  /** Jeu proposé d'après le nom de la scène. */
  function defaultJeu(sec) {
    const s = String(sec || '').toLowerCase();
    if (/^(pre|build)/.test(s)) return 'ten';
    if (/^intro/.test(s)) return 'ten';
    if (/^(verse|couplet)/.test(s)) return 'coups';
    if (/^(bridge|break|solo|pont)/.test(s)) return 'uni';
    if (/^(outro|fin)/.test(s)) return 'coups';
    return 'sig';
  }

  /** Jeu d'une scène : celui que le modèle de chanson écrit (sections[…].horns), sinon celui de son nom. */
  const sceneJeu = (sec, model) => (JEUX.includes(model) ? model : defaultJeu(sec));

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
  /** Une boucle du jeu pour un musicien, sur la grille du modèle : [[position, MIDI, durée, vélocité]]. */
  function loopOf(F, p, jeu) {
    if (jeu === 'uni') {
      if (p.role === 'bass') return sigPart(F, p);
      const v = voiceOf(F, p)[1];
      const k = avgVel(F, p) / 100;
      return topLine(F).map(([o, m, d, vel]) => {
        let x = m;
        while (x - v > 6) x -= 12;
        while (v - x > 6) x += 12;
        return [o, x, d, vel * k];
      });
    }
    if (jeu === 'coups') {
      const [o0, m0] = voiceOf(F, p);
      const src = chordAt(F, o0);
      const k = avgVel(F, p) / 100;
      return F.coups.h.map(([o, d, v]) => [o, realize(m0, src[1], src[2], chordAt(F, o)[1], chordAt(F, o)[2]), d, v * k]);
    }
    return sigPart(F, p);
  }

  /** Une note du modèle (accord sRoot, gamme sSc) recalculée sur un autre accord : même rang dans la gamme, au plus près. */
  function realize(n, sRoot, sSc, dRoot, dSc) {
    if (sRoot === dRoot && sSc === dSc) return n;
    const sa = SCALES[sSc] || SCALES.ion;
    const sb = SCALES[dSc] || SCALES.ion;
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
  const inRange = (m, p) => {
    while (m > p.hi) m -= 12;
    while (m < p.lo) m += 12;
    return m;
  };
  const NUANCE = { p: 0.72, mf: 0.88, f: 1 };

  /**
   * Écrit la section pour une scène.
   *   form, add : formation et musiciens ajoutés ; jeu : sig | uni | coups | ten ; off : [ids coupés] ; nuance : p | mf | f
   *   spans : [{ step, len, rootPc, pcs }] (accords de la scène, en pas) ; bars, spb (pas par mesure), beat (pas par temps)
   *   model : true = les notes du modèle telles quelles (sa tonalité, sa grille), sans recalcul
   * → { lines: { id: { role, events: [{ step, len, notes, vel, shift? }], lo, hi } } }
   */
  function write({ form, add = [], jeu = 'sig', off = [], nuance = 'mf', spans = [], bars = 4, spb = 16, beat = 4, model = false }) {
    const F = formOf(form);
    const J = JEUX.includes(jeu) ? jeu : 'sig';
    const nu = NUANCE[nuance] || NUANCE.mf;
    const perBar = spb / beat; // temps par mesure (4 en 4/4, 3 en 3/4)
    const total = bars * spb;
    const spanAt = (step) => spans.find((sp) => step >= sp.step && step < sp.step + sp.len) || spans[spans.length - 1] || null;
    const target = (step, like) => {
      const sp = spanAt(step);
      return sp ? [sp.rootPc, scaleOf(sp.rootPc, sp.pcs, like)] : null;
    };
    const lines = {};
    players(F.id, add).forEach((p) => {
      const events = [];
      if (!off.includes(p.id)) {
        const push = (x, m, len, v) => {
          if (x >= total) return;
          const st = Math.round(x);
          const shift = +(x - st).toFixed(3);
          const e = { step: st, len: Math.max(1, Math.min(total - st, Math.round(len))), notes: [inRange(m, p)], vel: +Math.max(0.15, Math.min(1, (v / 127) * nu)).toFixed(3) };
          if (shift) e.shift = shift;
          events.push(e);
        };
        if (J === 'ten') {
          // une tenue par accord de la scène (dans le modèle : par accord du modèle)
          const [o0, m0] = voiceOf(F, p);
          const src = chordAt(F, o0);
          const vel = 66 + (p.role === 'lead' ? 4 : 0);
          if (model || !spans.length) {
            for (let b = 0; b < bars; b++) {
              const mb = b % F.bars;
              const segs = F.chords.filter((c) => Math.floor(c[0] / 4) === mb);
              const list = segs.length && segs[0][0] === mb * 4 ? segs : [chordAt(F, mb * 4), ...segs];
              list.forEach((c, i) => {
                const a = Math.max(0, c[0] - mb * 4);
                const end = Math.min(perBar, list[i + 1] ? list[i + 1][0] - mb * 4 : 4);
                if (a < end) push(b * spb + a * beat, realize(m0, src[1], src[2], c[1], c[2]), (end - a) * beat - 1, vel);
              });
            }
          } else
            spans.forEach((sp) => {
              if (sp.step >= total) return;
              push(sp.step, realize(m0, src[1], src[2], sp.rootPc, scaleOf(sp.rootPc, sp.pcs, src[2])), Math.max(1, sp.len - Math.max(1, Math.round(beat / 4))), vel);
            });
        } else {
          const loop = loopOf(F, p, J);
          const cyc = F.bars * 4;
          for (let b = 0; b < bars; b += F.bars)
            loop.forEach(([o, m, d, v]) => {
              const mb = Math.floor(o / 4); // mesure dans la boucle
              const ib = o - mb * 4; // temps dans la mesure
              if (ib >= perBar - 1e-6) return; // mesure plus courte que 4 temps : on coupe
              const bar = b + mb;
              if (bar >= bars) return;
              const pos = F.swing && Math.abs((ib % 1) - 0.5) < 1e-6 ? ib + 1 / 6 : ib;
              const x = bar * spb + pos * beat;
              let note = m;
              if (!model && spans.length) {
                const s = chordAt(F, o % cyc);
                const t = target(Math.min(total - 1, Math.round(x)), s[2]);
                if (t) note = realize(m, s[1], s[2], t[0], t[1]);
              }
              push(x, note, Math.min(d, perBar - ib) * beat, v);
            });
        }
      }
      events.sort((a, b) => a.step - b.step);
      const ns = events.map((e) => e.notes[0]);
      lines[p.id] = { role: p.role, events, lo: ns.length ? Math.min(...ns) : null, hi: ns.length ? Math.max(...ns) : null };
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

  return { INST, FORMS, FORM, formOf, fromKeys, formFor, STYLE_FORM, JEUX, jeux, defaultJeu, sceneJeu, players, write, realize, scaleOf, SCALES, offByDefault, ROLE_LABEL, midiName, NUANCE };
})();
