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
 * les pianistes des inspirations, et ceux des autres mesures).
 *
 * Réglages de la scène (parts[section].inst[id].keys, de 0 à 1 sauf lh) : voice (voicing serré → large), energy,
 * pedal, human, reg (registre de la main droite), accent ; lh = main gauche : 'basse' (comme écrit), 'oct' (octaves),
 * 'aucune' (main droite seule). shape() les applique à tous les modes ; sans réglage, la chanson ne change pas.
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
    ['alberti', 'Alberti', 'Fondamentale, quinte, tierce, quinte', 'arp', 'brise', 'film ballade', P({ 0: 'L1+1', 2: '5', 4: '3', 6: '5', 8: '1', 10: '5', 12: '3', 14: '5' })],
    ['vagues', 'Vagues deux mains', 'La main gauche monte, la droite continue', 'arp', 'brise', 'film ballade', P({ 0: 'L1', 1: 'L5', 2: 'L8', 3: '3', 4: '5', 5: '8', 6: '10', 7: '8', 8: '5', 9: '3', 10: 'L8', 11: 'L5', 12: 'L1', 13: 'L5', 14: 'L8', 15: '3' })],
    ['cascade', 'Cascade', 'L’accord descend en doubles-croches', 'arp', 'brise', 'film pop', P({ 0: 'L1+15', 1: '12', 2: '10', 3: '8', 4: '5', 5: '3', 8: 'L5+12', 9: '10', 10: '8', 11: '5', 12: '3', 13: '1' })],
    ['popd', 'Pop doubles', 'Basse et accord brisé en doubles', 'arp', 'brise', 'pop rock', P({ 0: 'L1+1', 2: '5', 3: '8', 4: '1', 6: '5', 7: '8', 8: 'L5+1', 10: '5', 11: '8', 12: '10', 14: '8' })],
    ['bossaarp', 'Bossa brisée', 'Basse, tierce et septième, quinte', 'arp', 'brise', 'bossa jazz', P({ 0: 'L1', 3: '3+7', 6: '5', 8: 'L5', 10: '3+7', 13: '5' })],
    ['reggaearp', 'Brisé reggae', 'Quinte et octave sur 2 et 4, la tierce répond', 'arp', 'brise', 'reggae', P({ 4: '5+8', 6: '3', 12: '5+8', 14: '3' })],
    ['up16', 'Montée', 'Doubles-croches, en montant', 'arp', 'arpeg', 'electro pop film', seq16(['1', '3', '5', '8'])],
    ['updown16', 'Aller-retour', 'Doubles-croches, monte et descend', 'arp', 'arpeg', 'electro film', seq16(['1', '3', '5', '8', '10', '8', '5', '3'])],
    ['up8', 'Montée en croches', 'Plus lent, plus ouvert', 'arp', 'arpeg', 'pop ballade film', P({ 0: '1', 2: '3', 4: '5', 6: '8', 8: '10', 10: '8', 12: '5', 14: '3' })],
    ['bells', 'Cloches', 'Croches aiguës qui tintent', 'arp', 'arpeg', 'film electro', P({ 0: '15', 2: '12', 4: '10', 6: '12', 8: '15', 10: '12', 12: '8', 14: '12' })],
    ['ost16', 'Ostinato', 'Huit doubles qui reviennent', 'arp', 'arpeg', 'electro film', seq16(['1', '5', '8', '5', '10', '5', '8', '5'])],
    ['dotted', 'Pointé', 'Une note tous les trois pas', 'arp', 'arpeg', 'electro pop', P({ 0: '1', 3: '5', 6: '8', 9: '10', 12: '8', 15: '5' })],
    ['pluck16', 'Pincé', 'Doubles syncopées, très piquées', 'arp', 'arpeg', 'electro funk', P({ 0: '1', 2: '8', 3: '5', 6: '10', 7: '8', 10: '5', 11: '12', 14: '8' })],
  ].map(([id, name, desc, jeu, fam, st, pat]) => ({ id, name, desc, jeu, fam, styles: st.split(' '), pat }));
  const OWN_BY = new Map(OWN.map((m) => [m.id, m]));
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
  const entryOf = (mode) => ownOf(mode) || ENGINE_BY.get(mode) || null;
  /** Arpèges du moteur de nappe (un mode d'arpège venu d'une inspiration). */
  const ARP_LIKE = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'ost16', 'dotted', 'toll', 'alb3', 'wave6', 'tri8', 'arp68', 'arp128', 'arpvalse', 'ballad', 'pluck'];
  /** Jeu d'un mode (un mode inconnu, venu d'une inspiration, est rangé avec les accords). */
  const jeuOf = (mode) => (entryOf(mode) ? entryOf(mode).jeu : ARP_LIKE.includes(mode) ? 'arp' : 'acc');
  const familyOf = (mode) => (entryOf(mode) ? entryOf(mode).fam : jeuOf(mode) === 'arp' ? 'brise' : 'tenu');
  const stylesOf = (mode) => (entryOf(mode) ? entryOf(mode).styles : []);
  const inStyle = (mode, style) => !style || style === 'all' || stylesOf(mode).includes(style);
  const name = (mode) => (ownOf(mode) ? ownOf(mode).name : SS.padMotifs ? SS.padMotifs.name(mode) : mode);
  const desc = (mode) => (ownOf(mode) ? ownOf(mode).desc : SS.padMotifs ? SS.padMotifs.desc(mode) : '');
  /** Tous les modes d'un jeu, famille par famille : les motifs du Clavier, puis ceux du moteur de nappe. */
  function modesOf(jeu) {
    return (FAMILIES[jeu] || []).flatMap(([f]) => [...OWN.filter((m) => m.jeu === jeu && m.fam === f).map((m) => 'k:' + m.id), ...ENGINE.filter((m) => m.jeu === jeu && m.fam === f).map((m) => m.id)]);
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
  const DEF = { voice: 0.3, energy: 0.5, pedal: 0.3, human: 0.3, reg: 0.5, accent: 0.3, lh: 'basse' };
  const LH = [['basse', 'Basse', 'La main gauche joue comme écrit dans le motif'], ['oct', 'Octaves', 'La basse doublée à l’octave : plus de poids'], ['aucune', 'Aucune', 'La main droite seule : la place au bassiste']];
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
  function normalize(s) {
    const o = { ...DEF };
    if (s && typeof s === 'object') {
      for (const k of ['voice', 'energy', 'pedal', 'human', 'reg', 'accent']) if (Number.isFinite(Number(s[k])) && s[k] !== null && s[k] !== '') o[k] = clamp01(s[k]);
      if (LH.some(([v]) => v === s.lh)) o.lh = s.lh;
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
  function events(spans, mode, ctx) {
    const m = ownOf(mode);
    if (!m || !spans.length) return [];
    const end = spans.reduce((a, sp) => Math.max(a, sp.step + sp.len), 0);
    const spanAt = (s) => spans.find((sp) => s >= sp.step && s < sp.step + sp.len);
    const toks = Array.from({ length: SPB }, (_, i) => (m.pat[i] ? String(m.pat[i]).split('+') : []));
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
   * Réglages du Clavier appliqués aux notes d'un mode (motif « k: » ou mode du moteur de nappe) : voicing, main gauche,
   * énergie, pédale, main humaine, registre, accent. set absent : les notes ne changent pas (sauf le marqueur lh retiré).
   * r : hasard (0..1) du moteur.
   */
  function shape(evs, spans, set, r = Math.random) {
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
      // registre de la main droite
      const sh = s.reg < 0.33 ? -12 : s.reg >= 0.67 ? 12 : 0;
      if (sh) md = md.map((n) => n + sh);
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
      out.push(e);
    }
    return out;
  }

  /** Dessin d'un motif « k: » pour sa carte (SVG en texte, comme SS.padMotifs.svg) : main droite pleine, main gauche pâle. */
  const draws = {};
  function svg(mode) {
    if (draws[mode]) return draws[mode];
    const C = { rootPc: 0, type: 'maj' };
    const ev = events([{ step: 0, len: 16, chord: C }], mode, { voice: () => [60, 64, 67], tones: () => [0, 4, 7], vel: (v) => v });
    const ns = ev.flatMap((e) => e.notes);
    const lo = Math.min(...ns, 60);
    const hi = Math.max(...ns, 72);
    const y = (n) => 30 - ((n - lo) / Math.max(12, hi - lo)) * 26;
    const bars = [1, 2, 3].map((b) => `<rect x="${b * 40}" y="0" width=".6" height="34" fill="currentColor" opacity=".25"/>`).join('');
    const rects = ev.flatMap((e) => e.notes.map((n) => `<rect x="${e.step * 10 + 0.5}" y="${y(n).toFixed(1)}" width="${Math.max(3, Math.min(e.len, 4) * 10 - 1.5)}" height="3.5" rx="1" fill="currentColor" opacity="${e.lh ? 0.45 : 0.95}"/>`)).join('');
    return (draws[mode] = `<svg viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true">${bars}${rects}</svg>`);
  }

  return { svg, JEUX, FAMILIES, STYLES, STYLE_OF, styleOfSong, OWN, ENGINE, ownOf, entryOf, jeuOf, familyOf, stylesOf, inStyle, name, desc, modesOf, ALL, firstOf, surprise, DEF, LH, normalize, KNOBS, knobValue, knobPatch, touched, intervals, events, shape };
})();
