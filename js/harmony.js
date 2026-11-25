/*
 * Aide à la composition : tonalité du projet, gamme, accords diatoniques, identification des accords
 * grille d’accords et ses contrôles. Reprend les règles du skill « composition-harmonie-synthetiseur »
 * (.claude/skills/composition-harmonie-synthetiseur).
 *
 * scene.key = { tonic: "D", mode: "minor" }   (chaque scène a sa tonalité ; absente = pas de tonalité choisie)
 *   tonic : nom de note anglais avec altération (C, C♯, D♭, …) ; mode : voir MODES.
 *
 * Tout est calculé ici, sans réseau ni IA : le résultat est déterministe et vérifiable.
 */
window.SS = window.SS || {};

SS.harmony = (() => {
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const FR = SS.LETTER_FR;

  // fam : couleur générale (tierce majeure ou mineure) ; tonal : tonalité classique (sinon mode) ;
  // color : degré caractéristique du mode (la note qui le distingue du majeur ou du mineur naturel)
  const MODES = [
    { id: 'major', label: 'Majeur', iv: [0, 2, 4, 5, 7, 9, 11], fam: 'major', tonal: true },
    { id: 'minor', label: 'Mineur naturel', iv: [0, 2, 3, 5, 7, 8, 10], fam: 'minor', tonal: true },
    { id: 'harmonic', label: 'Mineur harmonique', iv: [0, 2, 3, 5, 7, 8, 11], fam: 'minor', tonal: true },
    { id: 'dorian', label: 'Dorien (mode)', iv: [0, 2, 3, 5, 7, 9, 10], fam: 'minor', color: 5, colorText: 'sixte majeure' },
    { id: 'phrygian', label: 'Phrygien (mode)', iv: [0, 1, 3, 5, 7, 8, 10], fam: 'minor', color: 1, colorText: 'seconde mineure' },
    { id: 'lydian', label: 'Lydien (mode)', iv: [0, 2, 4, 6, 7, 9, 11], fam: 'major', color: 3, colorText: 'quarte augmentée' },
    { id: 'mixolydian', label: 'Mixolydien (mode)', iv: [0, 2, 4, 5, 7, 9, 10], fam: 'major', color: 6, colorText: 'septième mineure' },
    // modes ajoutés d'après le guide MusicEmotion (docs/reference/musicemotion-guide.md, chap. 4)
    { id: 'phrygdom', label: 'Phrygien dominant (mode)', iv: [0, 1, 4, 5, 7, 8, 10], fam: 'major', color: 2, colorText: 'tierce majeure sur seconde mineure' },
    { id: 'locrian', label: 'Locrien (mode)', iv: [0, 1, 3, 5, 6, 8, 10], fam: 'minor', color: 4, colorText: 'quinte diminuée' },
  ];
  const TONICS = ['C', 'C♯', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  const pcOf = (m) => ((m % 12) + 12) % 12;
  const findMode = (id) => MODES.find((m) => m.id === id);
  const fam = (key) => findMode(key.mode).fam;
  const isTonal = (key) => !!findMode(key.mode).tonal;

  function parseName(name) {
    const letter = name[0];
    let acc = 0;
    for (const ch of name.slice(1)) acc += ch === '♯' || ch === '#' ? 1 : ch === '♭' || ch === 'b' ? -1 : 0;
    return { letter, acc, pc: pcOf(NATURAL[LETTERS.indexOf(letter)] + acc) };
  }
  const accStr = (a) => (a === 2 ? '𝄪' : a === -2 ? '𝄫' : a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));
  const spellLetter = (letter, pc) => {
    const a = ((pc - NATURAL[LETTERS.indexOf(letter)] + 18) % 12) - 6;
    return letter + accStr(a);
  };
  /** Nom français : « Si♭ », « Fa♯ ». */
  const french = (name) => FR[name[0]] + name.slice(1);

  function valid(key) {
    return !!(key && TONICS.includes(key.tonic) && findMode(key.mode));
  }

  /** Les 7 degrés de la gamme : { pc, name } avec l'orthographe correcte (une lettre par degré). */
  function scale(key) {
    const t = parseName(key.tonic);
    const li = LETTERS.indexOf(t.letter);
    return findMode(key.mode).iv.map((iv, i) => {
      const pc = pcOf(t.pc + iv);
      return { pc, name: spellLetter(LETTERS[(li + i) % 7], pc) };
    });
  }

  /** Nom d'une classe de note dans le contexte de la tonalité (bémols dans les tons à bémols). */
  function spell(key, pc) {
    pc = pcOf(pc);
    if (!valid(key)) return SS.NOTE_NAMES[pc];
    const sc = scale(key);
    const hit = sc.find((d) => d.pc === pc);
    if (hit) return hit.name;
    // note étrangère : altération d'un degré voisin, dans le sens des altérations de la tonalité
    const flats = sc.some((d) => d.name.includes('♭')) || (key.tonic.includes('♭') && !key.tonic.includes('♯'));
    const below = sc.find((d) => d.pc === pcOf(pc - 1));
    const above = sc.find((d) => d.pc === pcOf(pc + 1));
    if (key.mode === 'minor' || key.mode === 'harmonic') {
      // en mineur, les degrés VI et VII haussés (mineur mélodique / harmonique) s'écrivent avec un dièse ou un bécarre
      if (pc === pcOf(sc[0].pc + 11)) return spellLetter(sc[6].name[0], pc);
      if (pc === pcOf(sc[0].pc + 9)) return spellLetter(sc[5].name[0], pc);
    }
    if (flats && above) return spellLetter(above.name[0], pc);
    if (below) return spellLetter(below.name[0], pc);
    return SS.NOTE_NAMES[pc];
  }

  const QUALITY = { maj: 'majeur', min: 'mineur', dim: 'diminué', aug: 'augmenté', 7: 'septième de dominante', m7b5: 'demi-diminué', dim7: 'septième diminuée', '7b9': 'dominante neuvième mineure' };
  const SUFFIX = {
    maj: '', min: 'm', 7: '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', dim: '°', aug: '+', add9: 'add9', m9: 'm9', 5: '5',
    m7b5: 'm7♭5', dim7: '°7', maj9: 'maj9', 9: '9', '7b9': '7♭9', madd9: 'm(add9)', 6: '6', m6: 'm6', '7sus4': '7sus4',
    '7no3': '7(no3)', '5add9': '5(add9)', add4: 'add4', madd4: 'm(add4)',
    mmaj7: 'm(maj7)', madd11: 'm(add11)', maj7s11: 'maj7(♯11)', '6sus2': '6sus2',
  };

  function triadType(third, fifth) {
    if (third === 4 && fifth === 7) return 'maj';
    if (third === 3 && fifth === 7) return 'min';
    if (third === 3 && fifth === 6) return 'dim';
    if (third === 4 && fifth === 8) return 'aug';
    return null;
  }

  /**
   * Chiffrage romain. Majuscule = accord majeur, minuscule = mineur ; pour un accord sans tierce (sus2, sus4, 5),
   * la casse suit la triade du degré dans la gamme (`baseType`).
   */
  function numeral(degree, type, baseType) {
    const noThird = ['sus2', 'sus4', '5', '7sus4', '7no3', '5add9', '6sus2'].includes(type);
    const lower = noThird ? ['min', 'dim'].includes(baseType) : ['min', 'dim', 'm7', 'm9', 'm7b5', 'dim7', 'madd9', 'm6', 'madd4', 'mmaj7', 'madd11'].includes(type);
    let r = lower ? ROMAN[degree].toLowerCase() : ROMAN[degree];
    r +=
      {
        dim: '°', aug: '+', 7: '7', maj7: 'maj7', m7: '7', m9: '9', add9: 'add9', sus2: 'sus2', sus4: 'sus4', 5: '5',
        m7b5: 'ø7', dim7: '°7', maj9: 'maj9', 9: '9', '7b9': '7♭9', madd9: 'add9', 6: '6', m6: '6', '7sus4': '7sus4',
        '7no3': '7(no3)', '5add9': '5(add9)', add4: 'add4', madd4: 'add4',
        mmaj7: 'maj7', madd11: 'add11', maj7s11: 'maj7♯11', '6sus2': '6sus2',
      }[type] || '';
    return r;
  }
  /** Type de la triade construite sur le degré `d` d'une gamme (liste de { pc }). */
  const degTriad = (sc, d) => triadType(pcOf(sc[(d + 2) % 7].pc - sc[d].pc), pcOf(sc[(d + 4) % 7].pc - sc[d].pc));

  /** Rôle d'un accord selon son degré (repos / préparation / tension), d'après la pratique tonale. */
  function role(key, degree, type) {
    const m = findMode(key.mode);
    if (!m.tonal) {
      // mode : pas de dominante au sens tonal ; on repère les accords qui contiennent la note caractéristique
      if (degree === 0) return { id: 'repos', label: 'centre', text: 'centre du mode : point de repos' };
      const sc = scale(key);
      const tones = [0, 2, 4].map((k) => sc[(degree + k) % 7].pc);
      if (tones.includes(sc[m.color].pc)) return { id: 'color', label: 'couleur du mode', text: `contient la ${m.colorText} (${sc[m.color].name}) qui caractérise le mode` };
      return { id: 'prep', label: 'mouvement', text: 'accord de passage autour du centre' };
    }
    const major = m.fam === 'major';
    if (degree === 0) return { id: 'repos', label: 'repos', text: 'tonique : sensation d’arrivée' };
    if (degree === 4) {
      if (type === 'maj' || type === '7') return { id: 'tension', label: 'tension', text: 'dominante : sa tierce est la sensible, elle appelle la tonique' };
      return { id: 'tension', label: 'tension faible', text: 'v mineur : sans sensible, la tension est plus douce' };
    }
    if (degree === 6) {
      if (type === 'dim') return { id: 'tension', label: 'tension', text: 'contient la sensible et le triton' };
      return { id: 'tension', label: 'retour ouvert', text: 'VII → i : retour sans sensible, fréquent en synthwave' };
    }
    if (degree === 1 || degree === 3) return { id: 'prep', label: 'préparation', text: 'prédominante : prépare la dominante ou la tonique' };
    if (degree === 5 && !major) return { id: 'prep', label: 'préparation', text: 'VI : couleur, mène souvent vers VII ou iv' };
    return { id: 'repos', label: 'repos', text: major ? 'proche de la tonique (notes communes)' : 'relatif majeur : repos lumineux' };
  }

  /** Accords diatoniques (triades) de la tonalité, puis emprunts utiles. */
  function chords(key) {
    const sc = scale(key);
    const list = sc.map((d, i) => {
      const third = pcOf(sc[(i + 2) % 7].pc - d.pc);
      const fifth = pcOf(sc[(i + 4) % 7].pc - d.pc);
      const type = triadType(third, fifth);
      return {
        degree: i,
        rootPc: d.pc,
        type,
        name: d.name + SUFFIX[type],
        numeral: numeral(i, type),
        notes: [sc[i].name, sc[(i + 2) % 7].name, sc[(i + 4) % 7].name],
        quality: QUALITY[type],
        role: role(key, i, type),
        borrowed: false,
      };
    });
    if (!isTonal(key)) return { diatonic: list, extra: [] };
    // dominante avec septième, et en mineur naturel la dominante majeure empruntée au mineur harmonique
    const d5 = sc[4];
    const lead = spell({ ...key, mode: key.mode === 'major' ? 'major' : 'harmonic' }, d5.pc + 4);
    const v7 = {
      degree: 4,
      rootPc: d5.pc,
      type: '7',
      name: d5.name + '7',
      numeral: 'V7',
      notes: [d5.name, lead, sc[1].name, sc[3].name],
      quality: QUALITY[7],
      role: role(key, 4, '7'),
      borrowed: key.mode === 'minor',
    };
    const extra = [];
    if (key.mode === 'minor') {
      extra.push({ ...v7, type: 'maj', name: d5.name, numeral: 'V', notes: [d5.name, lead, sc[1].name], quality: QUALITY.maj, role: role(key, 4, 'maj'), borrowed: true });
    }
    extra.push(v7);
    return { diatonic: list, extra };
  }

  /** Identifie un accord à partir de ses notes (renversements compris). → { rootPc, type, bassPc } ou null */
  function identify(notes) {
    if (!notes || notes.length < 2) return null;
    const sorted = [...notes].sort((a, b) => a - b);
    const pcs = [...new Set(sorted.map(pcOf))];
    const bassPc = pcOf(sorted[0]);
    // essaie d'abord la basse comme fondamentale, puis les autres notes
    const order = [bassPc, ...pcs.filter((p) => p !== bassPc)];
    // d'abord les accords de base (toutes les fondamentales possibles), puis les couleurs du mode avancé (C6 = Am7/C)
    for (const ext of [false, true]) {
      for (const root of order) {
        const set = new Set(pcs.map((p) => pcOf(p - root)));
        for (const c of SS.CHORDS) {
          if (!!c.ext !== ext) continue;
          const cs = new Set(c.iv.map(pcOf));
          if (cs.size === set.size && [...cs].every((x) => set.has(x))) return { rootPc: root, type: c.id, bassPc };
        }
      }
    }
    return null;
  }

  /** Nom d'un accord identifié : « G », « Am », « C/E » (renversement : note de basse après la barre). */
  function chordName(key, id) {
    const name = spell(key, id.rootPc) + (SUFFIX[id.type] ?? '');
    return id.bassPc !== id.rootPc ? name + '/' + spell(key, id.bassPc) : name;
  }

  const TYPE_IV = (type) => (SS.CHORDS.find((c) => c.id === type) || SS.CHORDS[0]).iv;

  /** Degré et statut d'un accord identifié dans la tonalité. */
  function analyzeChord(key, id) {
    const sc = scale(key);
    const inScale = new Set(sc.map((d) => d.pc));
    const pcs = TYPE_IV(id.type).map((i) => pcOf(id.rootPc + i));
    const deg = sc.findIndex((d) => d.pc === id.rootPc);
    let num;
    if (deg >= 0) num = numeral(deg, id.type, degTriad(sc, deg));
    else {
      const up = sc.findIndex((d) => d.pc === pcOf(id.rootPc + 1));
      const down = sc.findIndex((d) => d.pc === pcOf(id.rootPc - 1));
      num = up >= 0 ? '♭' + numeral(up, id.type, 'maj') : down >= 0 ? '♯' + numeral(down, id.type, 'maj') : '?';
    }
    if (pcs.every((p) => inScale.has(p))) return { numeral: num, status: 'diatonique' };
    if (key.mode === 'minor') {
      const harm = new Set(scale({ ...key, mode: 'harmonic' }).map((d) => d.pc));
      if (pcs.every((p) => harm.has(p))) return { numeral: num, status: 'emprunt', why: 'emprunt au mineur harmonique (sensible haussée)' };
    }
    if (key.mode === 'major') {
      const par = new Set(scale({ ...key, mode: 'minor' }).map((d) => d.pc));
      if (pcs.every((p) => par.has(p))) return { numeral: num, status: 'emprunt', why: 'emprunt au mineur homonyme' };
    }
    return { numeral: num, status: 'chromatique', why: 'contient des notes hors de la tonalité' };
  }

  /* ---------------- Estimation de la tonalité (profils de Krumhansl-Kessler) ---------------- */
  const PROFILE = {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  };
  const MAJOR_TONICS = SS.TONIC_NAMES.major;
  const MINOR_TONICS = SS.TONIC_NAMES.minor;

  function corr(a, b) {
    const ma = a.reduce((x, y) => x + y, 0) / 12;
    const mb = b.reduce((x, y) => x + y, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) {
      n += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? n / Math.sqrt(da * db) : 0;
  }

  /** Toutes les scènes (ou les pistes si le projet n'a pas de scènes) : [{ name, bars, tracks: [{ track, events }] }]. */
  function sections(p) {
    const inst = p.tracks.filter((t) => t.type === 'instrument');
    if (!p.scenes || !p.scenes.length) return [{ name: '', bars: p.bars, key: p.key, tracks: inst.map((t) => ({ track: t, events: t.events || [] })) }];
    SS.commitScene(p);
    return p.scenes.map((sc) => ({
      id: sc.id,
      name: sc.name,
      bars: sc.bars,
      key: sc.key,
      tracks: inst.map((t) => ({ track: t, events: (sc.data[t.id] && sc.data[t.id].events) || [] })),
    }));
  }

  /** Histogramme des classes de notes, pondéré par la durée ; les basses comptent double. */
  function histogram(p, sceneId) {
    const h = new Array(12).fill(0);
    for (const sec of sections(p).filter((s) => !sceneId || s.id === sceneId))
      for (const { events } of sec.tracks)
        for (const ev of events) for (const n of ev.notes) h[pcOf(n)] += ev.len * (n < 48 ? 2 : 1);
    return h;
  }

  /**
   * Accords joués dans la scène `sceneId` (toutes pistes Instrument / Synthé) : un accord = un événement
   * d'au moins 3 notes différentes. Triés dans l'ordre de la scène, sans répéter le même accord d'affilée.
   * → [{ step, id: { rootPc, type, bassPc } | null, notes }]
   */
  function sceneChords(p, sceneId) {
    const out = [];
    for (const sec of sections(p).filter((s) => !sceneId || s.id === sceneId))
      for (const { events } of sec.tracks)
        for (const ev of events) if (new Set(ev.notes.map(pcOf)).size >= 3) out.push({ step: ev.step, id: identify(ev.notes), notes: ev.notes });
    out.sort((a, b) => a.step - b.step);
    const same = (a, b) => a.id && b.id && a.id.rootPc === b.id.rootPc && a.id.type === b.id.type && a.id.bassPc === b.id.bassPc;
    return out.filter((c, i) => {
      if (i === 0) return true;
      const prev = out[i - 1];
      return !(same(c, prev) || (c.step === prev.step && !c.id && !prev.id));
    });
  }

  /**
   * → { key, score, second, chords } ou null s'il n'y a pas de notes (dans la scène `sceneId`, ou dans tout le projet).
   * Profil des notes (Krumhansl-Kessler), affiné par les accords reconnus : une tonalité gagne des points
   * quand ses accords sont diatoniques et quand la grille commence ou finit sur sa tonique.
   */
  function detect(p, sceneId) {
    const h = histogram(p, sceneId);
    if (!h.some((x) => x > 0)) return null;
    const chordsIn = sceneChords(p, sceneId);
    const known = chordsIn.filter((c) => c.id);
    const cands = [];
    for (let t = 0; t < 12; t++)
      for (const mode of ['major', 'minor']) {
        const prof = PROFILE[mode].map((_, i) => PROFILE[mode][pcOf(i - t)]);
        const key = { tonic: (mode === 'major' ? MAJOR_TONICS : MINOR_TONICS)[t], mode };
        let score = corr(h, prof);
        if (known.length) {
          const inKey = new Set(scale(key).map((d) => d.pc));
          const diat = known.filter((c) => TYPE_IV(c.id.type).every((i) => inKey.has(pcOf(c.id.rootPc + i)))).length / known.length;
          score += 0.35 * diat;
          if (known[0].id.rootPc === t) score += 0.12;
          if (known[known.length - 1].id.rootPc === t) score += 0.08;
          // accord de tonique de la bonne couleur (majeur / mineur)
          const tonicChord = known.some((c) => c.id.rootPc === t && (mode === 'minor' ? /^m(?!aj)/.test(c.id.type) : !/^m(?!aj)|dim/.test(c.id.type)));
          if (tonicChord) score += 0.05;
        }
        cands.push({ key, score });
      }
    cands.sort((a, b) => b.score - a.score);
    // la tonalité relative partage les mêmes notes : on la signale comme alternative
    return { ...cands[0], second: cands[1], chords: chordsIn };
  }

  /**
   * Tonalités probables d'une liste de notes ({ step, len, midi, bass? }) : basse et mélodie d'une scène (« ✦ Proposer »).
   * Profil Krumhansl-Kessler pondéré par la durée (basse comptée double), affiné par la première note de basse et la
   * dernière note (les phrases finissent souvent sur la tonique). → [{ key, score, pct, why }] (3 au plus, meilleure d'abord).
   */
  function suggestKeys(notes, max = 3) {
    notes = (notes || []).filter((n) => n && n.len > 0);
    if (!notes.length) return [];
    const h = new Array(12).fill(0);
    for (const n of notes) h[pcOf(n.midi)] += n.len * (n.bass ? 2 : 1);
    const byStep = [...notes].sort((a, b) => a.step - b.step || a.midi - b.midi);
    const bass = byStep.filter((n) => n.bass);
    const firstBass = bass.length ? pcOf(bass[0].midi) : null;
    const tune = byStep.filter((n) => !n.bass);
    const end = (tune.length ? tune : byStep).reduce((a, b) => (b.step + b.len >= a.step + a.len ? b : a));
    const lastPc = pcOf(end.midi);
    const cands = [];
    for (let t = 0; t < 12; t++)
      for (const mode of ['major', 'minor']) {
        const prof = PROFILE[mode].map((_, i) => PROFILE[mode][pcOf(i - t)]);
        const key = { tonic: (mode === 'major' ? MAJOR_TONICS : MINOR_TONICS)[t], mode };
        let score = corr(h, prof);
        const why = [];
        if (firstBass === t) (score += 0.1), why.push(`la basse part de ${french(spell(key, t))}`);
        if (lastPc === t) (score += 0.08), why.push(`la fin revient sur ${french(spell(key, t))}`);
        const out = [...new Set(notes.map((n) => pcOf(n.midi)))].filter((pc) => !scale(key).some((d) => d.pc === pc));
        if (!why.length) why.push(out.length ? `${out.length} note${out.length > 1 ? 's' : ''} hors gamme` : 'toutes les notes jouées sont dans la gamme');
        cands.push({ key, score, why: why.join(', ') });
      }
    cands.sort((a, b) => b.score - a.score);
    return cands.slice(0, max).map((c) => ({ ...c, pct: Math.max(1, Math.min(99, Math.round(c.score * 100))) }));
  }

  function label(key) {
    if (!valid(key)) return 'aucune tonalité';
    const m = { major: 'majeur', minor: 'mineur', harmonic: 'mineur harmonique', dorian: 'dorien', phrygian: 'phrygien', lydian: 'lydien', mixolydian: 'mixolydien', phrygdom: 'phrygien dominant', locrian: 'locrien' }[key.mode];
    return `${french(key.tonic)} ${m}`;
  }

  /* ---------------- Bibliothèque de progressions ---------------- */
  // Reprise du tableau « progressions-et-composition » du skill. Degrés 0–6 dans la gamme majeure (major)
  // ou mineure naturelle (minor) ; le type d'accord est explicite (V7 en mineur = emprunt).
  const PROGRESSIONS = [
    { id: 'pop1', mode: 'major', label: 'I – V – vi – IV', style: 'Pop, synthwave', seq: [[0, 'maj'], [4, 'maj'], [5, 'min'], [3, 'maj']] },
    { id: 'pop2', mode: 'major', label: 'I – vi – IV – V', style: 'Pop lumineuse', seq: [[0, 'maj'], [5, 'min'], [3, 'maj'], [4, 'maj']] },
    { id: 'pop3', mode: 'major', label: 'vi – IV – I – V', style: 'Pop, cinématique (centre ambigu)', seq: [[5, 'min'], [3, 'maj'], [0, 'maj'], [4, 'maj']] },
    { id: 'cad', mode: 'major', label: 'ii – V7 – I – I', style: 'Cadence majeure', seq: [[1, 'min'], [4, '7'], [0, 'maj'], [0, 'maj']] },
    { id: 'min1', mode: 'minor', label: 'i – VI – III – VII', style: 'Mineur, synthwave', seq: [[0, 'min'], [5, 'maj'], [2, 'maj'], [6, 'maj']] },
    { id: 'min2', mode: 'minor', label: 'i – III – VII – VI', style: 'Mineur, montée dramatique', seq: [[0, 'min'], [2, 'maj'], [6, 'maj'], [5, 'maj']] },
    { id: 'min3', mode: 'minor', label: 'i – iv – V7 – i', style: 'Résolution tonale forte (V7 emprunté)', seq: [[0, 'min'], [3, 'min'], [4, '7'], [0, 'min']] },
    { id: 'min4', mode: 'minor', label: 'i – VII – VI – V', style: 'Mouvement descendant (V emprunté)', seq: [[0, 'min'], [6, 'maj'], [5, 'maj'], [4, 'maj']] },
    // procédés H03, H05–H08 de la formation (docs/reference/formation-composition/23_bibliotheque_de_procedes.md) ;
    // H01, H02 et H04 sont déjà pop1, min1 et min3. Les grilles modales ne sont proposées que dans leur mode.
    { id: 'h03', mode: 'major', label: 'ii – V7 – I', style: 'H03 · conduire tierce et septième', seq: [[1, 'm7'], [4, '7'], [0, 'maj7'], [0, 'maj7']] },
    { id: 'h05', mode: 'major', label: 'I – IV – iv – I', style: 'H05 · suivre la voix 6 – ♭6 – 5', seq: [[0, 'maj'], [3, 'maj'], [3, 'min'], [0, 'maj']] },
    { id: 'h08', mode: 'major', label: 'ii7 – subV7 – Imaj7', style: 'H08 · substitution tritonique, basse chromatique', seq: [[1, 'm7'], [1, '7', -1], [0, 'maj7'], [0, 'maj7']] },
    { id: 'h06', mode: 'dorian', label: 'i – IV', style: 'H06 · établir le centre, exposer la sixte majeure', seq: [[0, 'min'], [3, 'maj'], [0, 'min'], [3, 'maj']] },
    { id: 'h07', mode: 'lydian', label: 'I – II', style: 'H07 · exposer la quarte augmentée sans perdre le centre', seq: [[0, 'maj'], [1, 'maj'], [0, 'maj'], [1, 'maj']] },
    // grilles des styles de nov. 2026 (pop-rock, funk, hip-hop lo-fi, soul et jazz, drum & bass liquid, reggae)
    { id: 'rock1', mode: 'major', label: 'I – ♭VII – IV – I', style: 'Rock mixolydien (♭VII emprunté)', seq: [[0, 'maj'], [6, 'maj', -1], [3, 'maj'], [0, 'maj']] },
    { id: 'pop4', mode: 'major', label: 'I – IV – vi – V', style: 'Pop-rock, couplet qui avance', seq: [[0, 'maj'], [3, 'maj'], [5, 'min'], [4, 'maj']] },
    { id: 'lofi1', mode: 'major', label: 'ii7 – V7 – Imaj7 – vi7', style: 'Hip-hop lo-fi, jazz', seq: [[1, 'm7'], [4, '7'], [0, 'maj7'], [5, 'm7']] },
    { id: 'soul1', mode: 'major', label: 'IVmaj7 – iii7 – ii7 – Imaj7', style: 'Neo-soul, descente', seq: [[3, 'maj7'], [2, 'm7'], [1, 'm7'], [0, 'maj7']] },
    { id: 'soul2', mode: 'major', label: 'Imaj7 – vi7 – ii7 – V7', style: 'Soul, turnaround', seq: [[0, 'maj7'], [5, 'm7'], [1, 'm7'], [4, '7']] },
    { id: 'reggae1', mode: 'major', label: 'I – IV – V – IV', style: 'Reggae', seq: [[0, 'maj'], [3, 'maj'], [4, 'maj'], [3, 'maj']] },
    { id: 'funk1', mode: 'dorian', label: 'i7 – IV7', style: 'Funk, vamp dorien', seq: [[0, 'm7'], [3, '7'], [0, 'm7'], [3, '7']] },
    { id: 'dnb1', mode: 'minor', label: 'i7 – VImaj7 – iv7 – v7', style: 'Drum & bass liquid', seq: [[0, 'm7'], [5, 'maj7'], [3, 'm7'], [4, 'm7']] },
  ];

  // lettre de chaque intervalle d'accord (tierce = 2 lettres plus loin…) : Cdim = C E♭ G♭, Fm = F A♭ C
  const LETTER_OFF = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 13: 1, 14: 1, 17: 3, 18: 3 };
  function chordNoteNames(rootName, type) {
    const r = parseName(rootName);
    const li = LETTERS.indexOf(r.letter);
    // la septième diminuée (9 demi-tons) s'écrit sur la 7e lettre : C♯°7 = C♯ E G B♭
    return TYPE_IV(type).map((iv) => spellLetter(LETTERS[(li + (type === 'dim7' && iv === 9 ? 6 : LETTER_OFF[iv])) % 7], pcOf(r.pc + iv)));
  }

  /**
   * Un accord défini par son degré dans la tonalité, au format de la palette. `acc` altère la fondamentale
   * (−1 : ♭VI, ♭II… emprunts) ; le type est libre (V7 en mineur, i majeur = tierce picarde…).
   * Pour une tonalité classique, les degrés sont comptés dans la gamme majeure ou mineure naturelle.
   */
  function makeChord(key, degree, type, acc = 0) {
    const base = isTonal(key) ? { ...key, mode: fam(key) === 'major' ? 'major' : 'minor' } : key;
    const sc = scale(base);
    const rootPc = pcOf(sc[degree].pc + acc);
    const rootName = spellLetter(sc[degree].name[0], rootPc);
    const pcs = TYPE_IV(type).map((i) => pcOf(rootPc + i));
    const inKey = new Set(scale(key).map((d) => d.pc));
    const a = analyzeChord(base, { rootPc, type, bassPc: rootPc });
    return {
      degree,
      rootPc,
      type,
      name: rootName + (SUFFIX[type] ?? ''),
      numeral: (acc < 0 ? '♭' : acc > 0 ? '♯' : '') + numeral(degree, type, acc ? 'maj' : degTriad(sc, degree)),
      notes: chordNoteNames(rootName, type),
      quality: QUALITY[type] || type,
      role: role(key, degree, type),
      borrowed: !pcs.every((pc) => inKey.has(pc)) || a.status !== 'diatonique',
    };
  }

  /** Progressions adaptées au mode de la tonalité (les grilles modales seulement dans leur mode), transposées. */
  function progressions(key) {
    const minor = fam(key) === 'minor';
    const fits = (pr) => (isTonal(key) ? ['major', 'minor'].includes(pr.mode) && (pr.mode === 'minor') === minor : pr.mode === key.mode);
    return PROGRESSIONS.filter(fits).map((pr) => ({
      ...pr,
      chords: pr.seq.map(([d, t, a]) => makeChord(key, d, t, a || 0)),
    }));
  }

  /* ---------------- Grille d'accords (piste Accords et assistant) ---------------- */
  // Un accord de la grille est rangé par degré (0–6 dans la gamme de la scène), type et altération :
  // il suit la tonalité si on la change. `acc` = +1 : septième degré haussé du mineur (sensible, vii° emprunté).

  /** Un degré peut-il être haussé (acc = +1) ? Tous, sauf le 7e quand le mode a déjà une sensible. */
  const raisable = (key, degree) => !(degree === 6 && findMode(key.mode).iv[6] === 11);

  /**
   * Accord de la grille → format de la palette (nom, chiffrage, rôle, notes, emprunt). `bass` (1–11) : note
   * imposée à la basse, en demi-tons au-dessus de la fondamentale (C/E : 4) ; 0 = position fondamentale.
   */
  function gridChord(key, degree, type, acc = 0, bass = 0) {
    const sc = scale(key);
    // −1 : emprunt (♭VI, ♭VII, ♭II…) ; +1 : degré haussé (sensible du mineur harmonique, ou fondamentale
    // chromatique d'un accord de passage : ♯V° = A♯° en Ré majeur, ♯I° = C♯° en Fa majeur). Le 7e degré n'est
    // pas haussé quand le mode a déjà une sensible : vii° d'une grille mineure reste B° si la scène passe en Do majeur.
    acc = acc === -1 || (acc === 1 && raisable(key, degree)) ? acc : 0;
    const rootPc = pcOf(sc[degree].pc + acc);
    const rootName = acc ? spellLetter(sc[degree].name[0], rootPc) : sc[degree].name;
    const pcs = TYPE_IV(type).map((i) => pcOf(rootPc + i));
    const inKey = new Set(sc.map((d) => d.pc));
    const bassPc = bass ? pcOf(rootPc + bass) : null;
    // basse imposée : nommée comme la note de l'accord quand elle en fait partie (Ddim/F, et non Ddim/E♯)
    const toneIdx = bass ? TYPE_IV(type).findIndex((i) => pcOf(i) === bass) : -1;
    const bassName = !bass ? '' : toneIdx >= 0 ? chordNoteNames(rootName, type)[toneIdx] : spell(key, bassPc);
    return {
      degree,
      acc,
      rootPc,
      type,
      ...(bass ? { bass, bassPc } : {}),
      name: rootName + (SUFFIX[type] ?? '') + (bass ? '/' + bassName : ''),
      numeral: (acc < 0 ? '♭' : acc > 0 && !(key.mode === 'minor' && degree === 6) ? '♯' : '') + numeral(degree, type, acc ? (type === 'dim' || type === 'dim7' ? 'dim' : 'maj') : degTriad(sc, degree)),
      notes: chordNoteNames(rootName, type),
      quality: QUALITY[type] || (SS.CHORDS.find((c) => c.id === type) || {}).label || type,
      role: role(key, degree, type),
      borrowed: !pcs.every((pc) => inKey.has(pc)),
    };
  }

  /**
   * Accord d'une proposition (makeChord) → accord de grille { degree, type, acc } dans la tonalité `key`.
   * `c.letter` (lettre écrite de la fondamentale, « A » pour A♯dim) choisit le degré : A♯ reste un La haussé
   * et ne devient pas un Si♭. Sans lettre : la fondamentale diatonique, puis abaissée, puis haussée.
   */
  function toGridChord(key, c, prefDegree = 0) {
    const sc = scale(key);
    if (c.letter) {
      const d = sc.findIndex((x) => x.name[0] === c.letter);
      const acc = d >= 0 ? ((c.rootPc - sc[d].pc + 18) % 12) - 6 : 9;
      if (d >= 0 && (acc === 0 || acc === -1 || (acc === 1 && raisable(key, d)))) return { degree: d, type: c.type, acc };
    }
    const tries = [prefDegree, ...sc.map((_, i) => i).filter((i) => i !== prefDegree)];
    for (const d of tries) for (const acc of d === 6 && key.mode === 'minor' ? [0, 1, -1] : [0, -1]) if (pcOf(sc[d].pc + acc) === c.rootPc) return { degree: d, type: c.type, acc };
    for (const d of tries) if (raisable(key, d) && pcOf(sc[d].pc + 1) === c.rootPc) return { degree: d, type: c.type, acc: 1 };
    return null;
  }

  /* ---------------- Grille d'accords : opérations communes ----------------
   * Une grille = une liste d'accords { step, len, degree, type, acc, bass? } (degrés dans la tonalité de la scène).
   * Partagées par la piste Accords (js/chords.js), l'assistant Nouvelle chanson (js/band.js) et js/bandsong.js.
   */
  /** Accords triés, sans chevauchement, qui couvrent toute la scène (un trou : l'accord d'avant tient). Nouvelle liste. */
  function gridFill(list, total) {
    const g = list
      .filter((c) => c && c.len > 0 && c.step < total)
      .map((c) => ({ ...c, len: Math.min(c.len, total - c.step) }))
      .sort((a, b) => a.step - b.step);
    if (!g.length) return g;
    g[0].len += g[0].step;
    g[0].step = 0;
    g.forEach((c, i) => (c.len = (g[i + 1] ? g[i + 1].step : total) - c.step));
    return g.filter((c) => c.len > 0);
  }
  /** Pose un accord dans la liste (modifiée en place) : il remplace ce qu'il recouvre ; un accord coupé en deux garde ses deux bouts. */
  function gridPut(list, chord) {
    const end = chord.step + chord.len;
    const out = list.flatMap((c) => {
      if (c === chord) return [];
      const ce = c.step + c.len;
      if (ce <= chord.step || c.step >= end) return [c];
      const parts = [];
      if (c.step < chord.step) parts.push({ ...c, len: chord.step - c.step });
      if (ce > end) parts.push({ ...c, step: end, len: ce - end });
      return parts;
    });
    list.splice(0, list.length, ...out, chord);
    list.sort((a, b) => a.step - b.step);
    return chord;
  }
  /**
   * Durée de l'accord n° i (liste triée, modifiée en place) : plus long, il prend sur les suivants ; plus court, le suivant
   * commence plus tôt (la grille reste pleine). → l'accord.
   */
  function gridSetLen(list, i, len, total) {
    const c = list[i];
    len = Math.max(1, Math.min(len, total - c.step));
    const end = c.step + len;
    const next = list[i + 1];
    if (len < c.len && next) {
      next.len += next.step - end;
      next.step = end;
    } else
      for (let j = i + 1; list[j] && list[j].step < end; ) {
        const e = list[j].step + list[j].len;
        if (e <= end) list.splice(j, 1);
        else {
          list[j].len = e - end;
          list[j].step = end;
          j++;
        }
      }
    c.len = len;
    return c;
  }

  // colonnes du mode avancé : pour chaque triade de base, les types essayés dans l'ordre
  const GRID_COLS = [
    { id: '7', label: '7', types: { maj: ['maj7'], min: ['m7'], dim: ['m7b5'] } },
    { id: 'dom', label: '7 (dom.)', types: { maj: ['7'] } },
    { id: '9', label: '9', types: { maj: ['maj9', '9'], min: ['m9'] } },
    { id: 'add9', label: 'add9', types: { maj: ['add9'], min: ['madd9'] } },
    { id: 'sus2', label: 'sus2', types: { maj: ['sus2'], min: ['sus2'], dim: ['sus2'] } },
    { id: 'sus4', label: 'sus4', types: { maj: ['sus4'], min: ['sus4'], dim: ['sus4'] } },
    { id: '7sus4', label: '7sus4', types: { maj: ['7sus4'], min: ['7sus4'], dim: ['7sus4'] } },
    { id: '6', label: '6', types: { maj: ['6'], min: ['m6'] } },
  ];

  /**
   * Palette de la grille : `simple` (triades de la tonalité + emprunts utiles) et `rows` pour le mode avancé
   * (une ligne par triade, une case par colonne de GRID_COLS : l'accord, ou null si l'une de ses notes sort
   * de la tonalité). En mineur naturel, deux lignes d'emprunts au mineur harmonique : V et vii°.
   */
  function gridPalette(key) {
    const sc = scale(key);
    const inKey = new Set(sc.map((d) => d.pc));
    const fits = (c, extra) => TYPE_IV(c.type).every((i) => inKey.has(pcOf(c.rootPc + i)) || extra.has(pcOf(c.rootPc + i)));
    const row = (base, baseType, extra = new Set(), borrowed = false) => ({
      chord: base,
      borrowed,
      cells: GRID_COLS.map((col) => {
        for (const type of col.types[baseType] || []) {
          const c = gridChord(key, base.degree, type, base.acc);
          // une ligne d'emprunt ne montre que les accords qui ont besoin de l'emprunt
          if (fits(c, extra) && (!borrowed || c.borrowed)) return c;
        }
        return null;
      }),
    });
    const diatonic = sc.map((d, i) => gridChord(key, i, degTriad(sc, i) || 'maj'));
    const rows = diatonic.map((c) => row(c, c.type));
    const simple = [...diatonic];
    if (key.mode === 'minor') {
      const lead = new Set([pcOf(sc[6].pc + 1)]);
      const V = gridChord(key, 4, 'maj');
      const vii = gridChord(key, 6, 'dim', 1);
      const rV = row(V, 'maj', lead, true);
      rV.cells[GRID_COLS.findIndex((c) => c.id === '9')] = gridChord(key, 4, '7b9');
      const rvii = row(vii, 'dim', lead, true);
      rvii.cells[0] = gridChord(key, 6, 'dim7', 1);
      rows.push(rV, rvii);
      simple.push(V, vii);
    }
    return { cols: GRID_COLS.map(({ id, label }) => ({ id, label })), simple, rows };
  }

  /** Note MIDI de classe `pc` au plus près de `near`. */
  const nearest = (pc, near) => {
    let m = near - pcOf(near) + pc;
    if (m - near > 6) m -= 12;
    if (near - m > 6) m += 12;
    return m;
  };

  /* ---------------- Essais A/B : un seul paramètre change ---------------- */
  const TRANSFORMS = [
    { id: 'sus2', label: 'Tierce → neuvième (sus2)', text: 'la tierce de chaque accord devient la seconde/neuvième : moins de majeur/mineur, plus d’ouverture' },
    { id: 'seventh', label: 'Triades → septièmes', text: 'maj → maj7, m → m7, V → V7 : couleur plus douce ou plus jazz' },
    { id: 'mode', label: 'Accord de tonique majeur ↔ mineur', text: 'seule la tierce de l’accord de tonique change' },
    { id: 'avoid', label: 'Dernier accord → VI (cadence évitée)', text: 'la résolution attendue est différée' },
    { id: 'open', label: 'Voicing serré → ouvert', text: 'la voix du milieu monte d’une octave : plus d’espace' },
    { id: 'pedal', label: 'Basse en pédale de tonique', text: 'la basse garde son rythme mais reste sur la tonique : suspension, tension' },
    { id: 'borrow', label: 'Fin de phrase IV → iv → I', text: 'emprunt modal : les trois derniers accords deviennent IV, iv (emprunté au mineur) et I ; la sixte descend d’un demi-ton vers la quinte, couleur nostalgique (tonalités majeures)' },
    { id: 'secdom', label: 'Mettre en valeur le V (II7 → V)', text: 'tonicisation : l’accord qui précède le V devient sa propre dominante, II7 (D7 → G en Do) ; sur un accord long, seule sa seconde moitié change' },
  ];

  /**
   * Contrôles d'une grille (« Vérifier la scène » de l’assistant) : centre, cadences, fin, emprunts.
   * gch : [{ step, len, c }] triés, c = gridChord (nom, rôle, emprunt). → [{ kind: ok | tip | info | warn, text, hint? }]
   */
  function gridChecks(key, gch) {
    const out = [];
    if (!gch.length) return out;
    const roles = gch.map((x) => x.c.role.id);
    const first = gch[0].c;
    const last = gch[gch.length - 1].c;
    if (!roles.includes('repos')) out.push({ kind: 'tip', text: 'Aucun accord de repos sur la grille : le centre tonal reste flou.', hint: `Placer ${gridPalette(key).simple[0].name} au début ou à la fin pour l’ancrer.` });
    else if (first.role.id === 'repos') out.push({ kind: 'ok', text: `Commence sur le centre (${first.name}).` });
    const tens = roles.map((r, i) => (r === 'tension' ? i : -1)).filter((i) => i >= 0);
    const resolved = tens.filter((i) => roles[(i + 1) % roles.length] === 'repos');
    if (tens.length && !resolved.length) out.push({ kind: 'tip', text: 'Les accords de tension ne vont jamais vers le repos.', hint: 'Une tension (V, vii°) appelle la tonique juste après : c’est la cadence.' });
    else if (resolved.length) out.push({ kind: 'ok', text: `Cadence : ${gch[resolved[0]].c.name} → ${gch[(resolved[0] + 1) % gch.length].c.name}.` });
    if (last.role.id === 'repos') out.push({ kind: 'ok', text: `Finit sur le repos (${last.name}) : la boucle est fermée.` });
    else if (last.role.id === 'tension') out.push({ kind: 'ok', text: `Finit sur une tension (${last.name}) : elle relance la boucle vers ${first.name}.` });
    else out.push({ kind: 'tip', text: `Finit sur ${last.name} (${last.role.label}) : la fin reste suspendue.`, hint: 'Voulu pour enchaîner sur la scène suivante ? Sinon, finir sur une tension ou le repos.' });
    const bor = gch.filter((x) => x.c.borrowed).map((x) => x.c.name);
    if (bor.length) out.push({ kind: 'info', text: `Emprunt${bor.length > 1 ? 's' : ''} : ${[...new Set(bor)].join(', ')}.`, hint: 'Une couleur hors de la gamme : la mélodie évite ou suit sa note altérée.' });
    return out;
  }

  /**
   * Les essais A/B appliqués à une grille ({ step, len, degree, type, acc, bass? }) plutôt qu'aux notes d'une piste :
   * l'assistant Nouvelle chanson compare ainsi deux versions de la même scène. `total` : longueur de la scène en pas.
   * → { grid, pedals?, changed } (copie ; le rythme des accords ne change pas). 'open' (voicing) ne concerne pas la grille.
   */
  function transformGrid(id, list, key, total) {
    const sc = scale(key);
    let changed = 0;
    const grid = list.map((c) => ({ ...c }));
    const inKey = new Set(sc.map((d) => d.pc));
    const set = (c, type) => {
      if (type && type !== c.type) {
        c.type = type;
        changed++;
      }
    };
    if (id === 'pedal') return { grid, pedals: [{ step: 0, len: total, semi: 0 }], changed: 1 };
    for (const c of grid) {
      const plain = ['maj', 'min'].includes(c.type);
      if (id === 'sus2' && plain) set(c, 'sus2');
      // septième prise dans la gamme : Cmaj7 et Fmaj7 en Do majeur, mais G7 ; B♭7 (et non B♭maj7) en Do mineur
      else if (id === 'seventh') set(c, { maj: inKey.has(pcOf(sc[c.degree].pc + (c.acc || 0) + 11)) ? 'maj7' : '7', min: 'm7', dim: inKey.has(pcOf(sc[c.degree].pc + (c.acc || 0) + 9)) ? 'dim7' : 'm7b5' }[c.type]);
      else if (id === 'mode' && c.degree === 0 && !c.acc && plain) set(c, c.type === 'maj' ? 'min' : 'maj');
    }
    // emprunt modal de fin de phrase (tonalités de couleur majeure) : … IV – iv – I
    if (id === 'borrow' && fam(key) === 'major' && grid.length >= 2) {
      const want = [[3, 'maj'], [3, 'min'], [0, 'maj']].slice(grid.length >= 3 ? 0 : 1);
      grid.slice(-want.length).forEach((c, i) => {
        const [d, t] = want[i];
        if (c.degree !== d || (c.acc || 0) || c.type !== t || c.bass) changed++;
        Object.assign(c, { degree: d, type: t, acc: 0 });
        delete c.bass;
      });
      return { grid, changed };
    }
    // tonicisation : II7 avant chaque V majeur (sur un accord d'au moins une demi-mesure, seule sa seconde moitié change)
    if (id === 'secdom') {
      const out = [];
      grid.forEach((c, i) => {
        const nx = grid[i + 1];
        const isV = nx && nx.degree === 4 && !(nx.acc || 0) && ['maj', '7'].includes(nx.type);
        if (!isV || c.degree === 4 || (c.degree === 1 && c.type === '7' && !(c.acc || 0))) return void out.push(c);
        const two = { degree: 1, type: '7', acc: 0 };
        const half = Math.floor(c.len / 4) * 2;
        if (c.len >= 8 && half >= 2) {
          out.push({ ...c, len: half }, { step: c.step + half, len: c.len - half, ...two });
        } else {
          const r = { ...c, ...two };
          delete r.bass;
          out.push(r);
        }
        changed++;
      });
      return { grid: out, changed };
    }
    if (id === 'avoid' && grid.length) {
      const last = grid[grid.length - 1];
      const t = degTriad(sc, 5);
      if (last.degree !== 5 || last.acc || last.type !== t) {
        Object.assign(last, { degree: 5, acc: 0, type: t === 'dim' ? 'dim' : t });
        delete last.bass;
        changed++;
      }
    }
    return { grid, changed };
  }

  /* ---------------- Harmoniser une mélodie (étape Accords de l'assistant, sous-onglet « Harmoniser la mélodie ») ----------------
   * La mélodie est découpée en tranches (un accord par tranche : `slot` pas, 16 = une mesure). Pour chaque tranche, chaque accord
   * candidat reçoit une note d'accord (fit) : les notes appuyées (longues, sur un temps) qui sont dans l'accord comptent pour, celles
   * qui frottent d'un demi-ton contre une note de l'accord comptent contre. Trois « intentions » choisissent ensuite le meilleur
   * chemin (Viterbi) avec leurs propres préférences d'enchaînement, et chaque proposition dit pourquoi elle marche. */
  const HZ_PROFILES = ['simple', 'tension', 'color'];

  /** Accords candidats : triades de la gamme (sans diminué ni augmenté), plus les emprunts qui ont un sens dans la tonalité. */
  function hzCandidates(key) {
    const sc = scale(key);
    const out = [];
    for (let d = 0; d < 7; d++) {
      const t = degTriad(sc, d);
      if (t === 'maj' || t === 'min') out.push({ degree: d, type: t, acc: 0, kind: 'dia' });
    }
    if (key.mode === 'minor') out.push({ degree: 4, type: 'maj', acc: 0, kind: 'harmV' }, { degree: 3, type: 'maj', acc: 0, kind: 'dorIV' });
    if (key.mode === 'major') out.push({ degree: 3, type: 'min', acc: 0, kind: 'minIV' }, { degree: 6, type: 'maj', acc: -1, kind: 'flatVII' }, { degree: 5, type: 'maj', acc: -1, kind: 'flatVI' });
    return out.map((x) => {
      const c = gridChord(key, x.degree, x.type, x.acc);
      return { ...x, c, pcs: TYPE_IV(x.type).map((i) => pcOf(c.rootPc + i)) };
    });
  }
  /** Poids d'une note dans une tranche : durée entendue (en temps) × appui (premier temps 2, temps 1,4, sinon 1). */
  const hzAccent = (step) => (step % 16 === 0 ? 2 : step % 4 === 0 ? 1.4 : 1);
  /** Note appuyée : une blanche ou plus, ou une noire au moins sur le premier temps (une noire de passage ne l'est pas). */
  const hzLeaned = (n) => n.len >= 8 || (n.len >= 4 && n.step % 16 === 0);
  /** Rôle d'une note sur un accord (pcs, rootPc) : 'chord' | 'tension' (9e, quarte, sixte, septième) | 'clash' (demi-ton au-dessus d'une note de l'accord) | 'pass'. */
  function hzNoteRole(pc, cand) {
    if (cand.pcs.includes(pc)) return 'chord';
    const r = pcOf(pc - cand.c.rootPc);
    // un demi-ton au-dessus d'une note de l'accord frotte ; au-dessous aussi, sauf la neuvième (Si sur La mineur) et la
    // septième majeure d'un accord majeur
    if (cand.pcs.some((q) => pcOf(pc - q) === 1) || (cand.pcs.some((q) => pcOf(q - pc) === 1) && r !== 2 && !(r === 11 && cand.c.type === 'maj'))) return 'clash';
    return [2, 5, 9, 10, 11].includes(r) ? 'tension' : 'pass';
  }
  /** Note d'un accord pour une tranche [a, b) de la mélodie. */
  function hzFit(notes, a, b, cand) {
    let s = 0;
    for (const n of notes) {
      const ov = Math.min(b, n.step + n.len) - Math.max(a, n.step);
      if (ov <= 0) continue;
      const starts = n.step >= a;
      const w = (ov / 4) * (starts ? hzAccent(n.step) : 0.8);
      const strong = starts && hzLeaned(n);
      const role = hzNoteRole(pcOf(n.midi), cand);
      // note de basse (« ✦ Proposer » de la piste Accords) : elle désigne la fondamentale bien plus que la mélodie
      if (n.bass) {
        if (pcOf(n.midi) === cand.c.rootPc) s += 1.5 * w;
        else if (role === 'chord') s += 0.4 * w;
        else s -= (strong ? 1 : 0.4) * w;
        continue;
      }
      if (role === 'chord') s += w;
      else if (role === 'clash') s -= strong ? 1.2 * w : 0.3 * w;
      else if (role === 'tension') s -= strong ? 0.2 * w : 0;
      else s -= strong ? 0.6 * w : 0.1 * w;
    }
    return s;
  }
  /** Préférences propres à une intention : un accord dans une tranche, et un enchaînement. */
  function hzPrefs(profile, key, n) {
    const minor = key.mode === 'minor';
    const isDom = (x) => x.degree === 4 && x.type === 'maj';
    const chord = (x, i) => {
      let v = 0;
      const first = i === 0;
      const last = i === n - 1;
      if (first && x.degree === 0) v += profile === 'simple' ? 1 : 0.6;
      if (profile === 'simple') {
        if (x.kind !== 'dia') v -= 1;
        if (last && ['repos', 'tension'].includes(x.c.role.id)) v += 0.3;
      } else if (profile === 'tension') {
        if (x.kind === 'harmV') v += last ? 1 : 0.3;
        if (!minor && isDom(x) && last) v += 0.8;
        if (x.kind === 'minIV') v += 0.3;
        if (['dorIV', 'flatVII'].includes(x.kind)) v -= 0.4;
      } else {
        v += { dorIV: 1.2, flatVII: 1.2, flatVI: 0.8, minIV: 0.6, harmV: -0.3 }[x.kind] || 0;
        if (x.c.role.id === 'color') v += 0.6;
        if (minor && (x.degree === 2 || x.degree === 5)) v += 0.15;
      }
      return v;
    };
    const trans = (p, x) => {
      const down = pcOf(p.c.rootPc - x.c.rootPc);
      let v = 0;
      if (p === x) v -= profile === 'tension' ? 0.8 : 0.5;
      if (down === 7) v += 0.3; // quinte descendante
      else if (down === 1 || down === 2) v += profile === 'tension' ? 0.5 : 0.15; // basse qui descend d'un degré
      else if (down === 10 || down === 11) v += 0.1;
      if (isDom(p) && x.degree === 0) v += profile === 'tension' ? 0.6 : 0.3; // cadence
      return v;
    };
    return { chord, trans };
  }

  /**
   * Trois harmonisations contrastées d'une mélodie. notes : [{ step, len, midi }] (pas de la scène) ; total : longueur de la scène ;
   * slot : longueur d'un accord (16 = une mesure) ; current : grille actuelle (pour éviter de reproposer la même chose).
   * loop : longueur de la boucle en mesures (0 : grille libre).
   * → null (moins de deux notes) ou [{ id, title, grid, cycle, reps, chords, numerals, why: [phrases], tension, color, fit }]
   */
  function harmonize(key, notes, total, { slot = 16, current = [], loop = 4, bar = 16 } = {}) {
    notes = (notes || []).filter((x) => x && x.len > 0 && x.step < total);
    if (notes.length < 2 || !valid(key)) return null;
    const cands = hzCandidates(key);
    const n = Math.max(1, Math.ceil(total / slot));
    const fit = Array.from({ length: n }, (_, i) => cands.map((x) => hzFit(notes, i * slot, Math.min(total, (i + 1) * slot), x)));
    // boucle : une scène de 8 mesures ou plus est harmonisée comme une boucle de `loop` mesures répétée (la grille des styles de
    // l'assistant), chaque tranche de la boucle notée sur toutes ses répétitions ; loop = 0 : une grille libre sur toute la scène
    const per = loop ? (loop * bar) / slot : 0; // bar : pas par mesure (16 en 4/4)
    const m = per >= 1 && Number.isInteger(per) && n >= 2 * per ? per : n;
    const fitM = m === n ? fit : Array.from({ length: m }, (_, p) => cands.map((_, j) => fit.reduce((s2, row, i) => s2 + (i % m === p ? row[j] : 0), 0)));
    const curAt = (i) => {
      const st = i * slot;
      const c = current.find((y) => st >= y.step && st < y.step + y.len);
      return c ? cands.findIndex((x) => x.degree === c.degree && x.type === c.type && (x.acc || 0) === (c.acc || 0)) : -1;
    };
    const taken = [];
    const out = [];
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    for (const profile of HZ_PROFILES) {
      const P = hzPrefs(profile, key, m);
      let { path } = hzPath(m, cands, fitM, P, curAt, taken, null);
      // une proposition qui redirait une précédente : on interdit tour à tour l'accord d'une tranche et on garde le meilleur résultat
      if (taken.some((t) => same(t, path))) {
        let best = null;
        for (let i = 0; i < m; i++) {
          const r = hzPath(m, cands, fitM, P, curAt, taken, { i, j: path[i] });
          if (!taken.some((t) => same(t, r.path)) && (!best || r.score > best.score)) best = r;
        }
        if (best) path = best.path;
      }
      taken.push(path);
      const d = hzDescribe(key, notes, total, slot, cands, Array.from({ length: n }, (_, i) => path[i % m]), fit, profile);
      // une boucle : le cycle à afficher (cycle) et son nombre de tours (reps) ; grid reste la grille de toute la scène
      d.cycle = m < n ? d.grid.filter((g) => g.step < m * slot) : d.grid;
      d.reps = m < n ? Math.ceil(n / m) : 1;
      d.numerals = d.cycle.map((g) => gridChord(key, g.degree, g.type, g.acc).numeral).join(' – ');
      out.push(d);
    }
    return out;
  }
  /** Meilleur chemin d'accords (Viterbi) : note de la mélodie, préférences de l'intention, écart aux propositions déjà faites. */
  function hzPath(n, cands, fit, P, curAt, taken, ban) {
    {
      const local = (i, j) => 2.5 * fit[i][j] + P.chord(cands[j], i) - (curAt(i) === j ? 0.3 : 0) - 1.2 * taken.filter((path) => path[i] === j).length - (ban && ban.i === i && ban.j === j ? 1e6 : 0);
      // Viterbi : meilleur chemin d'accords sur les tranches
      let score = cands.map((_, j) => local(0, j));
      const back = [];
      for (let i = 1; i < n; i++) {
        const prev = score;
        const bk = [];
        score = cands.map((x, j) => {
          let best = -Infinity;
          let arg = 0;
          prev.forEach((s, p) => {
            const v = s + P.trans(cands[p], x);
            if (v > best) (best = v), (arg = p);
          });
          bk.push(arg);
          return best + local(i, j);
        });
        back.push(bk);
      }
      // boucle : le dernier accord enchaîne sur le premier
      let end = 0;
      let bestEnd = -Infinity;
      score.forEach((s, j) => s > bestEnd && ((bestEnd = s), (end = j)));
      const path = [end];
      for (let i = n - 2; i >= 0; i--) path.unshift(back[i][path[0]]);
      return { path, score: bestEnd };
    }
  }

  /** Grille, titre, explications et jauges d'un chemin d'accords. */
  function hzDescribe(key, notes, total, slot, cands, path, fit, profile) {
    const grid = [];
    path.forEach((j, i) => {
      const x = cands[j];
      const last = grid[grid.length - 1];
      if (last && last.j === j) last.len += Math.min(slot, total - i * slot);
      else grid.push({ step: i * slot, len: Math.min(slot, total - i * slot), degree: x.degree, type: x.type, acc: x.acc, j });
    });
    const used = grid.map((g) => cands[g.j]);
    grid.forEach((g) => delete g.j);
    const nm = (x) => x.c.name;
    const pcName = (pc) => french(spell(key, pc));
    const why = [];
    // notes appuyées dans leur accord
    const chordAt = (st) => cands[path[Math.min(path.length - 1, Math.floor(st / slot))]];
    const strong = notes.filter(hzLeaned);
    const roles = notes.map((x) => hzNoteRole(pcOf(x.midi), chordAt(x.step)));
    const inChord = strong.filter((x) => hzNoteRole(pcOf(x.midi), chordAt(x.step)) === 'chord').length;
    if (strong.length < 3) why.push('Ta mélodie a surtout des notes courtes : les accords suivent ses notes les plus présentes.');
    else {
      if (inChord === strong.length) why.push(`Tes notes appuyées sont toutes dans leur accord (${inChord} sur ${strong.length}).`);
      else why.push(`${inChord} notes appuyées sur ${strong.length} sont dans leur accord ; les autres sont des tensions qui colorent.`);
    }
    // basse qui descend pas à pas
    let run = [used[0]];
    let bestRun = run;
    for (let i = 1; i < used.length; i++) {
      const d = pcOf(used[i - 1].c.rootPc - used[i].c.rootPc);
      run = d === 1 || d === 2 ? [...run, used[i]] : [used[i]];
      if (run.length > bestRun.length) bestRun = run;
    }
    const descending = bestRun.length >= 3;
    if (descending) why.push(`La basse descend pas à pas (${bestRun.map((x) => pcName(x.c.rootPc)).join(' – ')}) : une pente qui entraîne.`);
    // cadence V → I (aussi au retour de la boucle)
    const dom = used.findIndex((x, i) => x.degree === 4 && x.type === 'maj' && (used[(i + 1) % used.length] || {}).degree === 0);
    if (dom >= 0) why.push(`${nm(used[dom])} → ${nm(used[(dom + 1) % used.length])} : la dominante appelle la tonique${dom === used.length - 1 ? ', au retour de la boucle' : ''}.`);
    // emprunts expliqués
    const kinds = [...new Set(used.map((x) => x.kind))];
    const ex = (k) => used.find((x) => x.kind === k);
    if (kinds.includes('harmV')) why.push(`${nm(ex('harmV'))} est emprunté au mineur harmonique : sa tierce ${french(ex('harmV').c.notes[1])} est la sensible, elle tire vers ${pcName(scale(key)[0].pc)}.`);
    if (kinds.includes('dorIV')) why.push(`${nm(ex('dorIV'))} apporte le ${french(ex('dorIV').c.notes[1])}, la note du dorien : une lumière dans le mineur.`);
    if (kinds.includes('minIV')) why.push(`${nm(ex('minIV'))} (iv mineur emprunté) : sa note ${french(ex('minIV').c.notes[1])} donne une couleur nostalgique.`);
    if (kinds.includes('flatVII')) why.push(`${nm(ex('flatVII'))} (♭VII du mixolydien) revient vers la tonique sans sensible : ouvert, rock.`);
    if (kinds.includes('flatVI')) why.push(`${nm(ex('flatVI'))} (♭VI emprunté au mineur) : effet ample, épique.`);
    if (!kinds.some((k) => k !== 'dia') && profile === 'simple') why.push('Que des accords de la gamme : rien ne surprend, la mélodie reste au premier plan.');
    const clashes = notes.filter((x, i) => roles[i] === 'clash' && hzLeaned(x));
    if (clashes.length) {
      const x = clashes[0];
      why.push(`À écouter : ${clashes.length} frottement${clashes.length > 1 ? 's' : ''} d'un demi-ton (mes. ${Math.floor(x.step / 16) + 1}, ${pcName(pcOf(x.midi))} sur ${nm(chordAt(x.step))}).`);
    }
    // titre selon ce que la grille fait vraiment
    let title;
    if (profile === 'simple') title = 'Simple et chantante';
    else if (profile === 'tension') title = descending ? 'Sombre, descendante' : dom >= 0 ? 'Tendue, qui résout' : 'Plus tendue';
    else if (kinds.includes('dorIV')) title = 'Lumineuse (dorien)';
    else if (kinds.includes('flatVII')) title = 'Ouverte (mixolydien)';
    else if (kinds.includes('minIV') || kinds.includes('flatVI')) title = 'Nostalgique (emprunts)';
    else title = isTonal(key) ? 'Colorée' : 'Couleur du mode';
    const nUsed = used.length;
    const tension = Math.min(1, (used.filter((x) => x.c.role.id === 'tension').length + clashes.length) / nUsed + (dom >= 0 ? 0.2 : 0));
    const color = Math.min(1, used.filter((x) => x.kind !== 'dia' || x.c.role.id === 'color').length / nUsed + 0.5 * (roles.filter((r) => r === 'tension').length / roles.length));
    const fitSum = path.reduce((s, j, i) => s + fit[i][j], 0);
    return {
      id: profile,
      title,
      grid,
      chords: used.map((x) => x.c),
      numerals: used.map((x) => x.c.numeral).join(' – '),
      why: why.slice(0, 3),
      tension: Math.round(tension * 100) / 100,
      color: Math.round(color * 100) / 100,
      fit: Math.round(fitSum * 100) / 100,
    };
  }

  /** Rôle de chaque note d'une mélodie sur une grille ({ step, len, degree, type, acc }) : 'chord' | 'tension' | 'clash' | 'pass'. */
  function noteRoles(key, grid, notes) {
    return notes.map((x) => {
      const g = grid.find((y) => x.step >= y.step && x.step < y.step + y.len);
      if (!g) return 'pass';
      const c = gridChord(key, g.degree, g.type, g.acc || 0);
      const r = hzNoteRole(pcOf(x.midi), { c, pcs: TYPE_IV(g.type).map((i) => pcOf(c.rootPc + i)) });
      // une note de passage brève reste « passage » ; une tension n'est signalée que si elle est appuyée
      if (r !== 'chord' && !hzLeaned(x)) return 'pass';
      return r;
    });
  }

  /**
   * Notes MIDI d'un accord de la palette (position fondamentale) : fondamentale au plus près de `near`
   * (l'accord précédent), sans s'éloigner de plus d'une quinte du centre `center` de la piste — sinon les
   * enchaînements dériveraient vers le grave ou l'aigu.
   */
  function voice(chord, near, center = near) {
    let root = nearest(chord.rootPc, near);
    if (root - center > 7) root -= 12;
    if (center - root > 7) root += 12;
    const notes = SS.chordNotes(root, chord.type);
    // accord sur une basse imposée (C/E) : la basse sous l'accord
    if (chord.bassPc != null && chord.bassPc !== chord.rootPc) {
      const b = notes[0] - (pcOf(notes[0] - chord.bassPc) || 12);
      const rest = notes.filter((m) => pcOf(m) !== chord.bassPc);
      return [b, ...(rest.length >= 2 ? rest : notes)]; // basse déjà dans l'accord : renversement, sans doublure
    }
    return notes;
  }

  return { MODES, TONICS, TRANSFORMS, valid, scale, spell, french, chords, role, makeChord, progressions, gridChord, toGridChord, gridFill, gridPut, gridSetLen, gridPalette, identify, chordName, analyzeChord, detect, suggestKeys, sceneChords, transformGrid, gridChecks, harmonize, noteRoles, label, voice, pcOf };
})();
