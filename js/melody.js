/*
 * Mélodie sur une grille d'accords et un texte (ou une structure métrique).
 * Reprend la méthode du skill « composer-melodies-accords-texte » (.claude/skills/composer-melodies-accords-texte) :
 *
 *   1. contrat musical : grille, texte ou métrique, mesure, tonalité, tessiture (hypothèses annoncées) ;
 *   2. calendrier harmonique : chaque accord a un début et une fin exacts (en pas de double-croche) ;
 *   3. prosodie : syllabes chantées (e caducs, élisions, synérèses), groupes de sens et accents ;
 *   4. rythme d'abord : les syllabes accentuées sur les temps forts et plus longues, respirations en fin de vers,
 *      un motif rythmique répété et varié d'un vers à l'autre (A A' B A'') ;
 *   5. hauteurs : notes de l'accord aux endroits structurels, notes de passage dans la « gamme du moment » entre
 *      elles, contour en arche avec un sommet, fin ouverte ou fermée ;
 *   6. nuances : vélocité selon l'accent, la durée et la place dans la phrase ;
 *   7. tableau détaillé (mesure, position, accord, syllabe, note, durée, valeur, vélocité, rôle) ;
 *   8. contrôles : couverture exacte du temps, une attaque par syllabe, monophonie, tessiture, notes exposées.
 *
 * Tout est calculé ici, sans réseau ni IA : le même texte, la même grille et la même graine donnent la même
 * mélodie. Unité de calcul : le pas (double-croche) ; 4 pas = une noire. Les triolets ne sont pas représentables
 * dans la grille de pas du séquenceur : ils ne sont jamais proposés.
 */
window.SS = window.SS || {};

SS.melody = (() => {
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const H = () => SS.harmony;

  /* ================================================================== */
  /* Hasard reproductible                                                */
  /* ================================================================== */
  function rng(seed) {
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================================================================== */
  /* 1. Accords                                                          */
  /* ================================================================== */
  // formules mesurées sur la gamme majeure de la fondamentale (références/harmonie.md du skill)
  const QUALITIES = {
    '': [0, 4, 7], M: [0, 4, 7], maj: [0, 4, 7],
    m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7],
    dim: [0, 3, 6], '°': [0, 3, 6], o: [0, 3, 6],
    aug: [0, 4, 8], '+': [0, 4, 8], '#5': [0, 4, 8],
    sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7], 5: [0, 7],
    maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], 'Δ': [0, 4, 7, 11], 'Δ7': [0, 4, 7, 11], '7M': [0, 4, 7, 11],
    7: [0, 4, 7, 10], dom7: [0, 4, 7, 10],
    m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], '-7': [0, 3, 7, 10],
    mmaj7: [0, 3, 7, 11], mM7: [0, 3, 7, 11], 'mΔ7': [0, 3, 7, 11], 'm7M': [0, 3, 7, 11],
    m7b5: [0, 3, 6, 10], 'ø': [0, 3, 6, 10], 'ø7': [0, 3, 6, 10], '-7b5': [0, 3, 6, 10],
    dim7: [0, 3, 6, 9], '°7': [0, 3, 6, 9], o7: [0, 3, 6, 9],
    'maj7#5': [0, 4, 8, 11], '7#5': [0, 4, 8, 10], '7+5': [0, 4, 8, 10], aug7: [0, 4, 8, 10], '+7': [0, 4, 8, 10],
    6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 69: [0, 4, 7, 9, 14], '6/9': [0, 4, 7, 9, 14], m69: [0, 3, 7, 9, 14], 'm6/9': [0, 3, 7, 9, 14],
    add9: [0, 4, 7, 14], add2: [0, 2, 4, 7], madd9: [0, 3, 7, 14], add11: [0, 4, 7, 17], madd11: [0, 3, 7, 17],
    maj9: [0, 4, 7, 11, 14], M9: [0, 4, 7, 11, 14], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], mmaj9: [0, 3, 7, 11, 14],
    11: [0, 4, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17], maj11: [0, 4, 7, 11, 14, 17],
    13: [0, 4, 7, 10, 14, 17, 21], m13: [0, 3, 7, 10, 14, 17, 21], maj13: [0, 4, 7, 11, 14, 17, 21],
    '7sus4': [0, 5, 7, 10], '7sus': [0, 5, 7, 10], '9sus4': [0, 5, 7, 10, 14], '9sus': [0, 5, 7, 10, 14], '13sus4': [0, 5, 7, 10, 14, 21],
    '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], '7#11': [0, 4, 7, 10, 18], '7b13': [0, 4, 7, 10, 20], '7b5': [0, 4, 6, 10],
    'maj7#11': [0, 4, 7, 11, 18], 'm7b9': [0, 3, 7, 10, 13],
  };
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FR_LETTER = { do: 'C', ré: 'D', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };

  /** Nom de la fonction d'un intervalle dans l'accord (pour le tableau). */
  function degreeName(iv, ivs) {
    const i = pcOf(iv);
    if (i === 0) return 'fondamentale';
    if (i === 3 || i === 4) return ivs.some((x) => pcOf(x) === (i === 3 ? 4 : 3)) && i === 3 ? '♯9' : 'tierce';
    if (i === 7) return 'quinte';
    if (i === 6) return ivs.some((x) => pcOf(x) === 7) ? '♯11' : 'quinte diminuée';
    if (i === 8) return ivs.some((x) => pcOf(x) === 7) ? '♭13' : 'quinte augmentée';
    if (i === 10 || i === 11) return 'septième';
    if (i === 9) return ivs.some((x) => x === 21) ? 'treizième' : ivs.some((x) => x === 9) && ivs.includes(3) && ivs.includes(6) && !ivs.includes(10) ? 'septième diminuée' : 'sixte';
    if (i === 2) return ivs.some((x) => x === 14) ? 'neuvième' : 'seconde (sus2)';
    if (i === 1) return '♭9';
    if (i === 5) return ivs.some((x) => x === 17) ? 'onzième' : 'quarte (sus4)';
    return 'couleur';
  }

  /** « Am7 », « F♯m7♭5 », « C/E », « Sol7 », ou un chiffrage romain si une tonalité est donnée. */
  function parseChordSymbol(tok, key) {
    const raw = tok;
    let s = tok.trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[()]/g, '');
    // noms français : Do, Ré, Mi…
    const fr = /^(do|ré|re|mi|fa|sol|la|si)/i.exec(s);
    if (fr) s = FR_LETTER[fr[1].toLowerCase()] + s.slice(fr[1].length);
    // chiffrage romain (avec une tonalité) : délégué à Band (VI, iv, bVII, V7…)
    if (/^[b#]?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?![a-z])/.test(s) && !/^[A-G]/.test(s)) {
      if (!key) throw new Error(`« ${raw} » : un chiffrage romain demande une tonalité (choisis-la dans « Tonalité »)`);
      const c = SS.bandSong.parseChord(s, key);
      const ivs = (SS.CHORDS.find((x) => x.id === c.type) || SS.CHORDS[0]).iv;
      return chordObj(raw, c.rootPc, ivs, c.rootPc);
    }
    const m = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(s);
    if (!m) throw new Error(`accord non reconnu : « ${raw} »`);
    const rootPc = pcOf(LETTER_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
    let q = m[3];
    if (/alt/.test(q)) throw new Error(`« ${raw} » : précise les altérations réalisées (par exemple 7♭9 ou 7♯9), « alt » en admet plusieurs`);
    if (!(q in QUALITIES)) {
      // « m(add9) » → « madd9 » déjà fait ; « min » / « maj » en toutes lettres
      q = q.replace(/^min(?=[0-9])/, 'm').replace(/^Maj/, 'maj');
      if (!(q in QUALITIES)) throw new Error(`« ${raw} » : suffixe d'accord inconnu « ${m[3]} »`);
    }
    const bassPc = m[4] ? pcOf(LETTER_PC[m[4]] + (m[5] === '#' ? 1 : m[5] === 'b' ? -1 : 0)) : rootPc;
    return chordObj(raw, rootPc, QUALITIES[q], bassPc);
  }
  function chordObj(sym, rootPc, ivs, bassPc) {
    const tones = [...new Set(ivs.map((i) => pcOf(rootPc + i)))];
    // triade d'appui : fondamentale, tierce (ou sus), quinte
    const triad = ivs.filter((i) => [0, 2, 3, 4, 5, 6, 7, 8].includes(i) && !(i === 2 && ivs.includes(4)) && !(i === 5 && (ivs.includes(4) || ivs.includes(3)))).map((i) => pcOf(rootPc + i));
    return { sym: sym.trim(), rootPc, ivs: [...ivs], bassPc, tones, triad: [...new Set(triad)] };
  }

  /**
   * Grille texte → calendrier harmonique.
   *   « Am | F | C | G » : une mesure par segment ; « Am F » : la mesure partagée en parts égales ;
   *   « . » ou « - » : l'accord précédent continue ; « % » : la mesure précédente est rejouée ;
   *   un retour à la ligne vaut une barre de mesure.
   * → { spans: [{ step, len, chord, bar }], bars, errors: [] }
   */
  function parseGrid(text, { spb = 16, key = null } = {}) {
    const errors = [];
    const spans = [];
    const bars = String(text || '')
      .split(/[|\n]+/)
      .map((b) => b.trim())
      .filter(Boolean);
    let prevBar = null;
    let last = null;
    bars.forEach((bar, b) => {
      let toks = bar.split(/\s+/).filter(Boolean);
      if (toks.length === 1 && toks[0] === '%') {
        if (!prevBar) return errors.push(`mesure ${b + 1} : « % » sans mesure précédente`);
        toks = prevBar;
      }
      prevBar = toks;
      if (spb % toks.length) {
        errors.push(`mesure ${b + 1} : ${toks.length} accords ne partagent pas la mesure en parts égales (${spb} doubles-croches)`);
        toks = toks.slice(0, 1);
      }
      const len = spb / toks.length;
      toks.forEach((t, i) => {
        const step = b * spb + i * len;
        if (t === '.' || t === '-' || t === '/') {
          if (last) last.len += len;
          else errors.push(`mesure ${b + 1} : « ${t} » sans accord à prolonger`);
          return;
        }
        try {
          last = { step, len, chord: parseChordSymbol(t, key), bar: b };
          spans.push(last);
        } catch (e) {
          errors.push(`mesure ${b + 1} : ${e.message}`);
        }
      });
    });
    return { spans, bars: bars.length, errors };
  }

  /** Répète la grille pour couvrir `total` pas (une grille plus courte que la mélodie tourne en boucle). */
  function loopSpans(spans, gridSteps, total) {
    if (!spans.length) return [];
    const out = [];
    for (let off = 0; off < total; off += gridSteps)
      spans.forEach((sp) => {
        if (sp.step + off >= total) return;
        out.push({ ...sp, step: sp.step + off, len: Math.min(sp.len, total - sp.step - off) });
      });
    return out;
  }

  /**
   * Tonalité la plus plausible d'après les accords (hypothèse annoncée, jamais certaine) :
   * accords entièrement diatoniques, premier et dernier accord sur la tonique.
   * → [{ key, score }] trié, le meilleur d'abord.
   */
  function guessKeys(spans) {
    if (!spans.length) return [];
    const tonics = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
    const minorTonics = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
    const out = [];
    for (const mode of ['major', 'minor']) {
      (mode === 'major' ? tonics : minorTonics).forEach((tonic) => {
        const key = { tonic, mode };
        const sc = H().scale(key).map((d) => d.pc);
        const tPc = sc[0];
        let score = 0;
        let weight = 0;
        spans.forEach((sp) => {
          const w = sp.len;
          weight += w;
          const inside = sp.chord.triad.filter((pc) => sc.includes(pc)).length / sp.chord.triad.length;
          score += w * (inside === 1 ? 1 : inside * 0.4);
          // dominante majeure en mineur (sensible) : tolérée
          if (mode === 'minor' && inside < 1 && sp.chord.rootPc === pcOf(tPc + 7) && sp.chord.triad.includes(pcOf(tPc + 11))) score += w * 0.55;
        });
        score /= weight || 1;
        const isTonic = (c) => c.rootPc === tPc && c.triad.includes(pcOf(tPc + (mode === 'major' ? 4 : 3)));
        if (isTonic(spans[0].chord)) score += 0.25;
        if (isTonic(spans[spans.length - 1].chord)) score += 0.15;
        if (spans.some((sp) => isTonic(sp.chord))) score += 0.1;
        out.push({ key, score });
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /* ================================================================== */
  /* 3. Prosodie : syllabes du français                                  */
  /* ================================================================== */
  const VOWELS = 'aeiouyàâäéèêëîïôöùûüœæ';
  const isV = (c) => !!c && VOWELS.includes(c);
  const CLUSTERS = ['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'vr', 'ch', 'ph', 'th', 'gn'];
  // h aspirés courants (pas d'élision devant eux)
  const H_ASPIRE = new Set(
    'haie haine haïr hall halte hamac hameau hanche hangar hanter happer harceler hardi hareng haricot harpe hasard hâte hausse haut haute hauteur hautbois havre hennir hérisson héron héros hêtre heurter hibou hideux hiérarchie hisser hocher hockey hollande homard honte honteux hoquet horde hors hotte houle housse houx hublot huer huit huitième humer hurler hurlement hutte'.split(' ')
  );
  // mots grammaticaux : pas d'accent de mot (l'accent tombe sur la fin du groupe)
  const FUNC = new Set(
    'le la les l un une des de du d au aux à a et ou où en dans sur sous par pour avec sans ce cet cette ces c mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je j tu il elle on nous vous ils elles me m te t se s ne n pas qui que qu quoi dont y si mais comme plus très car donc ni or est suis es sont'.split(' ')
  );
  // mots en -ent qui se prononcent (sinon -ent final = terminaison verbale muette, signalée comme incertaine)
  const ENT_SONORE = new Set('vent lent dent cent gent sent ment moment comment souvent content présent absent accent talent serpent argent parent orient client patient urgent récent violent prudent évident innocent agent torrent couvent souvent firmament sentiment serment tourment instant'.split(' '));

  /**
   * Noyaux vocaliques d'un mot (lettres en minuscules, tableau { ch, silent }).
   * → [{ start, end }] (indices dans le mot), chaque noyau = une syllabe possible.
   */
  function nuclei(word, notes) {
    const L = word.map((x) => (x.silent ? '' : x.ch));
    const out = [];
    let i = 0;
    const vowelAt = (j) => {
      const c = L[j];
      if (!isV(c)) return false;
      if (c === 'u' && j > 0 && (L[j - 1] === 'q' || (L[j - 1] === 'g' && 'eéèêiîy'.includes(L[j + 1] || '#')))) return false; // qu, gu(e/i)
      if (c === 'y' && j === 0 && isV(L[1])) return false; // yeux, yaourt
      if (c === 'i' && j > 0 && L[j - 1] === 'g' && L[j + 1] === 'n') return true;
      return true;
    };
    while (i < L.length) {
      if (!vowelAt(i)) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < L.length && vowelAt(j)) {
        const a = L[j - 1];
        const b = L[j];
        const prev2 = L.slice(Math.max(0, i - 2), i).join('');
        // hiatus (deux syllabes)
        let split = false;
        if ('ïüë'.includes(b)) split = true; // naïf, Noël
        else if (a === 'é' && isV(b)) split = true; // créer, idée
        else if ('éèêë'.includes(b) && 'aoéu'.includes(a) && !(a === 'u' && j - 2 >= 0 && L[j - 2] === 'o')) split = true; // poème, aérer, cruel
        else if (b === 'y' && isV(L[j + 1])) split = true; // voyage, payer
        else if (a === 'u' && 'ae'.includes(b) && !(j - 2 >= 0 && L[j - 2] === 'o') && (b === 'a' || (b === 'e' && /^[rzt]?$/.test(L.slice(j + 1).join('').slice(0, 1)) && j + 2 >= L.length))) split = true; // nuage, tuer
        else if (a === 'u' && j - 2 >= 0 && L[j - 2] === 'o' && (b === 'a' || 'éè'.includes(b) || (b === 'e' && j + 2 >= L.length && 'rzt'.includes(L[j + 1] || '#')))) {
          split = true; // jouer, louange (diérèse fréquente au chant)
          notes.add(`« ${word.map((x) => x.ch).join('')} » : « ou » + voyelle compté en deux syllabes (diérèse, fréquente au chant)`);
        } else if (a === 'i' && 'aeoéèu'.includes(b) && !(j - 2 >= i && isV(L[j - 2]))) {
          // i + voyelle : synérèse (pied, ciel), diérèse après consonne + l/r (crier, oublier)
          if (/[bcdfgkptv][lr]$/.test(prev2)) split = true;
          else if (b === 'o') notes.add(`« ${word.map((x) => x.ch).join('')} » : « i » + « o » compté en une syllabe (synérèse) ; la poésie classique compte souvent deux (diérèse) : écris « ${word.slice(0, j).map((x) => x.ch).join('')}/${word.slice(j).map((x) => x.ch).join('')} » pour séparer`);
        }
        if (split) break;
        j++;
      }
      out.push({ start: i, end: j });
      i = j;
    }
    return out;
  }

  /** Mot écrit → lettres (« ( ) » = lettres muettes forcées, « / » = coupure de syllabe forcée). */
  function letters(w) {
    const out = [];
    let silent = false;
    for (const ch of w) {
      if (ch === '(') silent = true;
      else if (ch === ')') silent = false;
      else if (ch === '/') out.length && (out[out.length - 1].cut = true);
      else out.push({ ch: ch.toLowerCase(), orig: ch, silent });
    }
    return out;
  }

  /**
   * Découpe un vers en syllabes chantées.
   *   opts.eMode : 'classique' (e caduc compté devant consonne) | 'chanson' (e caduc final élidé partout)
   *   opts.sungFinalE : chanter le e muet de fin de vers (fin féminine) sur une note
   * → { text, syllables: [{ text, mute, accent, word, groupEnd, caduc }], count, notes: [] }
   */
  function scanLine(line, { eMode = 'classique', sungFinalE = false } = {}) {
    const notes = new Set();
    // mots, avec la ponctuation qui les suit ; l'apostrophe colle l'article au mot suivant
    const words = [];
    const re = /([A-Za-zÀ-ÖØ-öø-ÿœŒæÆ()\/]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿœŒæÆ()\/]+)*)|([,;:.!?…—–])/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) words.push({ raw: m[1], punct: false });
      else if (words.length) words[words.length - 1].punct = true;
    }
    const syl = [];
    words.forEach((w, wi) => {
      const parts = w.raw.split(/['’]/);
      const lex = parts[parts.length - 1];
      const lexLower = lex.toLowerCase().replace(/[()\/]/g, '');
      const L = letters(w.raw.replace(/['’]/g, '’'));
      // l'apostrophe est une lettre muette (affichage seulement)
      L.forEach((x) => x.ch === '’' && (x.silent = true));
      let nu = nuclei(L, notes);
      // coupures forcées « / »
      if (L.some((x) => x.cut)) {
        const forced = [];
        nu.forEach((n) => {
          let s = n.start;
          for (let k = n.start; k < n.end - 1; k++)
            if (L[k].cut) {
              forced.push({ start: s, end: k + 1 });
              s = k + 1;
            }
          forced.push({ start: s, end: n.end });
        });
        nu = forced;
      }
      if (!nu.length) {
        // mot sans voyelle prononcée (« l’ », sigle…) : collé au mot suivant à l'affichage
        syl.push({ text: w.raw, mute: true, word: wi, glue: true });
        return;
      }
      // e caduc final : -e, -es, -ent (verbal) d'un mot de plusieurs syllabes
      const last = nu[nu.length - 1];
      const tail = L.slice(last.start).map((x) => (x.silent ? '' : x.ch)).join('');
      let caduc = null;
      if (nu.length >= 2 && (tail === 'e' || tail === 'es')) caduc = tail;
      else if (nu.length >= 2 && tail === 'ent' && !ENT_SONORE.has(lexLower) && !/(ement|emment|amment)$/.test(lexLower)) {
        caduc = 'ent';
        notes.add(`« ${lex} » : terminaison « -ent » lue comme verbale (e muet) ; écris « ${lex.slice(0, -3)}/ent » si elle se prononce « an »`);
      }
      // e muet directement après une voyelle (vie, joie, pluie) : jamais compté
      const afterVowel = caduc && last.start > 0 && isV(L[last.start - 1].ch);
      // texte de chaque syllabe : consonnes réparties entre les noyaux
      const cuts = [0];
      for (let k = 1; k < nu.length; k++) {
        const a = nu[k - 1].end;
        const b = nu[k].start;
        // consonnes prononcées entre les deux noyaux (sans l'apostrophe ni le h muet)
        const pos = [];
        for (let k2 = a; k2 < b; k2++) if (!L[k2].silent && !(L[k2].ch === 'h' && !'cpt'.includes(L[k2 - 1] ? L[k2 - 1].ch : '#'))) pos.push(k2);
        const cons = pos.map((k2) => L[k2].ch).join('');
        let at;
        const cut = L.slice(a, b).findIndex((x) => x.cut);
        if (cut >= 0) at = a + cut + 1;
        else if (cons.length <= 1) at = pos.length ? pos[0] : a;
        else at = CLUSTERS.includes(cons.slice(-2)) ? pos[pos.length - 2] : pos[pos.length - 1];
        cuts.push(Math.max(a, Math.min(at, b)));
      }
      cuts.push(L.length);
      nu.forEach((n, k) => {
        const txt = L.slice(cuts[k], cuts[k + 1]).map((x) => x.orig).join('');
        const isCaduc = !!caduc && k === nu.length - 1;
        syl.push({ text: txt, word: wi, caduc: isCaduc, tail: isCaduc ? caduc : null, afterVowel: isCaduc && afterVowel, lex: lexLower, wordEnd: k === nu.length - 1, punct: w.punct && k === nu.length - 1 });
      });
    });
    // initiale vocalique du mot suivant (élision du e caduc)
    const vowelInitial = (wi) => {
      const w = words[wi];
      if (!w) return false;
      const s = w.raw.replace(/[()\/]/g, '').toLowerCase();
      if (s.includes("'") || s.includes('’')) return false;
      if (s[0] === 'h') return !H_ASPIRE.has(s.replace(/[^a-zà-ÿœæ]/g, ''));
      if (s[0] === 'y') return s.length === 1 || !isV(s[1]);
      return isV(s[0]);
    };
    // statut des e caducs
    const lastWord = words.length - 1;
    syl.forEach((s) => {
      if (!s.caduc) return;
      const next = s.word + 1;
      if (s.word === lastWord) s.mute = !sungFinalE; // fin de vers : e muet (sauf fin féminine chantée)
      else if (s.afterVowel) {
        s.mute = true;
        notes.add(`« ${s.lex} » : e muet après voyelle, non compté`);
      } else if (vowelInitial(next)) s.mute = s.tail === 'e' ? 'elided' : eMode === 'chanson'; // -es, -ent : liaison, compté en classique
      else s.mute = eMode === 'chanson';
    });
    // les syllabes muettes se collent à la précédente (ou à la suivante pour une élision)
    const out = [];
    for (let k = 0; k < syl.length; k++) {
      const s = syl[k];
      if (s.glue && !s.mute) out.push(s);
      else if (s.mute === 'elided') {
        const nx = syl[k + 1];
        if (nx) nx.text = s.text.replace(/e$/i, '(e)') + '‿' + nx.text;
        if (nx) nx.prefix = true;
      } else if (s.mute || s.glue) {
        const nxt = syl[k + 1];
        if (s.glue && nxt) nxt.text = s.text + nxt.text;
        else if (out.length) {
          out[out.length - 1].text += s.mute && !s.glue ? `(${s.text})` : s.text;
          if (s.punct) out[out.length - 1].punct = true;
        }
      } else out.push(s);
    }
    // accents : fin de mot lexical (1), fin de groupe — ponctuation, fin de vers, césure (2)
    out.forEach((s, k) => {
      s.accent = 0;
      if (s.wordEnd || s.punct) {
        const lastSyl = !s.caduc;
        if (lastSyl && !FUNC.has(s.lex)) s.accent = 1;
        if (s.caduc && k > 0 && out[k - 1].word === s.word && !FUNC.has(s.lex)) out[k - 1].accent = Math.max(out[k - 1].accent, 1);
      }
    });
    const lastFull = (k) => {
      // syllabe accentuable du groupe qui finit à k (la syllabe caduque n'est pas accentuée)
      let j = k;
      while (j > 0 && out[j].caduc && out[j - 1].word === out[j].word) j--;
      return j;
    };
    out.forEach((s, k) => {
      if (s.punct && k < out.length - 1) {
        out[lastFull(k)].accent = 2;
        s.groupEnd = true;
      }
    });
    if (out.length) {
      out[lastFull(out.length - 1)].accent = 2;
      out[out.length - 1].groupEnd = true;
    }
    // césure d'un vers long sans ponctuation : fin du mot lexical le plus proche du milieu
    if (out.length >= 10 && !out.slice(0, -1).some((s) => s.groupEnd)) {
      const mid = out.length / 2;
      let best = -1;
      out.forEach((s, k) => s.accent === 1 && k < out.length - 2 && (best < 0 || Math.abs(k + 1 - mid) < Math.abs(best + 1 - mid)) && (best = k));
      if (best >= 0) {
        out[best].accent = 2;
        let e = best;
        while (out[e + 1] && out[e + 1].caduc && out[e + 1].word === out[e].word) e++;
        out[e].groupEnd = true;
        out[e].cesure = true;
      }
    }
    return {
      text: line.trim(),
      syllables: out.map((s) => ({ text: s.text, accent: s.accent, groupEnd: !!s.groupEnd, caduc: !!s.caduc, cesure: !!s.cesure })),
      count: out.length,
      notes: [...notes],
    };
  }

  /** Paroles → vers (une ligne par vers ; « [3+5] » en fin de ligne = syllabes par mesure). */
  function scanLyrics(text, opts = {}) {
    return String(text || '')
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const dm = /\[\s*(\d+(?:\s*\+\s*\d+)*)\s*\]\s*$/.exec(l);
        const line = scanLine(dm ? l.slice(0, dm.index) : l, opts);
        if (dm) line.dist = dm[1].split('+').map((x) => +x);
        return line;
      });
  }

  /**
   * Structure métrique sans paroles : « 8 8 8 8 », « 3+5 3+5 », « 12x2 », « 6+6 ».
   * Une partie par mesure si le nombre de parties égale le nombre de mesures par vers, sinon des groupes accentuels.
   */
  function scanMeter(text, barsPerLine = 2) {
    const lines = [];
    const errors = [];
    String(text || '')
      .split(/[\s,;]+/)
      .filter(Boolean)
      .forEach((tok) => {
        const m = /^(\d+(?:\+\d+)*)(?:[x×*](\d+))?$/i.exec(tok);
        if (!m) return errors.push(`« ${tok} » : écris un nombre de syllabes (8), une répartition (3+5) ou une répétition (8x4)`);
        const parts = m[1].split('+').map(Number);
        for (let r = 0; r < (+m[2] || 1); r++) {
          const n = parts.reduce((a, b) => a + b, 0);
          const v = lines.length + 1;
          if (n < 1 || n > 24) return errors.push(`« ${tok} » : entre 1 et 24 syllabes par vers`);
          // groupes : les parties, sinon une coupe proposée au milieu pour un vers long
          const groups = parts.length > 1 ? parts : n >= 10 ? [Math.floor(n / 2), n - Math.floor(n / 2)] : [n];
          const ends = new Set();
          groups.reduce((acc, g) => (ends.add(acc + g - 1), acc + g), 0);
          lines.push({
            text: `${n} syllabes`,
            abstract: true,
            syllables: Array.from({ length: n }, (_, i) => ({ text: `V${v}-S${i + 1}`, accent: ends.has(i) ? 2 : 0, groupEnd: ends.has(i), caduc: false })),
            count: n,
            dist: parts.length > 1 && parts.length === barsPerLine ? parts : null,
            notes: [],
          });
        }
      });
    return { lines, errors };
  }

  /* ================================================================== */
  /* 4. Rythme                                                           */
  /* ================================================================== */
  /** Poids métrique d'un pas dans la mesure : temps 1 > milieu > temps > croches > doubles. */
  function metricWeight(pos, spb, timeSig) {
    const p = pos % spb;
    if (p === 0) return 4;
    const compound = timeSig[1] === 8 && timeSig[0] % 3 === 0 && timeSig[0] > 3;
    const beat = compound ? 6 : Math.max(1, 16 / timeSig[1]);
    if (!compound && timeSig[0] % 2 === 0 && timeSig[0] >= 4 && p === spb / 2) return 3;
    if (p % beat === 0) return 2;
    if (p % 2 === 0) return 1;
    return 0;
  }

  const STYLE_DURS = {
    simple: { 2: 3, 4: 4, 6: 1.6, 8: 2, 12: 0.6, 16: 0.4 },
    varie: { 1: 0.5, 2: 3, 3: 1.4, 4: 3, 6: 1.6, 8: 1.4, 12: 0.4 },
    dense: { 1: 2, 2: 3, 3: 1, 4: 2, 6: 0.8, 8: 0.6 },
  };

  /**
   * Un tirage de rythme pour `syls` dans une fenêtre de `W` pas.
   * → [{ on, dur }] (on relatif à la fenêtre) ou null.
   */
  function sampleRhythm(syls, W, r, { style, minDur, breathMin, breathMax, lead, allowGaps }) {
    const k = syls.length;
    const durs = Object.entries(STYLE_DURS[style] || STYLE_DURS.simple)
      .map(([d, w]) => [+d, w])
      .filter(([d]) => d >= minDur);
    if (!durs.some(([d]) => d === minDur)) durs.push([minDur, 1]);
    const maxD = Math.max(...durs.map(([d]) => d));
    const leads = [0, 0, 0, 2, 4, 4, 6, 8].filter((x) => x <= lead);
    let pos = leads[Math.floor(r() * leads.length)] || 0;
    if (pos + k * minDur + breathMin > W) pos = 0;
    const out = [];
    for (let i = 0; i < k; i++) {
      const rest = k - i - 1;
      const s = syls[i];
      if (i === k - 1) {
        // dernière syllabe : tenue jusqu'à la respiration
        const room = W - pos;
        const breaths = [];
        for (let b = breathMin; b <= Math.min(breathMax, room - minDur); b += b < 4 ? 2 : 4) breaths.push(b);
        if (!breaths.length) return null;
        const b = breaths[Math.floor(r() * breaths.length)];
        out.push({ on: pos, dur: room - b });
        return out;
      }
      const hi = W - pos - breathMin - rest * minDur; // garde la place des notes suivantes (dont la dernière)
      const lo = W - pos - breathMax - rest * maxD - 16;
      let cands = durs.filter(([d]) => d <= hi && d >= Math.min(lo, hi));
      if (!cands.length) cands = [[minDur, 1]];
      if (minDur > hi) return null;
      const weights = cands.map(([d, w]) => {
        let x = w;
        if (s.accent === 2) x *= 0.6 + Math.log2(d + 1);
        else if (s.accent === 1) x *= 0.8 + Math.log2(d + 1) * 0.5;
        else x *= 3 / (d + 1);
        if (s.caduc) x *= d <= 2 ? 1.6 : 0.3; // une syllabe caduque est légère
        // la note longue tombe mieux sur un temps
        if (d >= 4 && pos % 4) x *= 0.5;
        return x;
      });
      const tot = weights.reduce((a, b) => a + b, 0);
      let pick = r() * tot;
      let d = cands[0][0];
      for (let c = 0; c < cands.length; c++) if ((pick -= weights[c]) <= 0) {
        d = cands[c][0];
        break;
      }
      out.push({ on: pos, dur: d });
      pos += d;
      // respiration après une fin de groupe (jamais au milieu d'un mot)
      if (allowGaps && s.groupEnd && r() < 0.55) {
        const g = r() < 0.6 ? 2 : 4;
        if (W - pos - g - breathMin - rest * minDur >= 0) pos += g;
      }
    }
    return out;
  }

  /** Note d'un rythme : plus c'est haut, mieux il épouse la prosodie. */
  function scoreRhythm(rh, syls, spb, timeSig, { style, ref, refWeight, offset }) {
    let sc = 0;
    let run = 0;
    rh.forEach((n, i) => {
      const s = syls[i];
      const w = metricWeight(offset + n.on, spb, timeSig);
      if (s.accent === 2) sc += 3 * w;
      else if (s.accent === 1) sc += 1.2 * w;
      else if (i > 0) sc -= 0.5 * w;
      if (s.caduc && w >= 2) sc -= 2.5; // e caduc sur un temps fort : à éviter
      if (s.accent === 2 && n.dur >= 4) sc += 3;
      if (s.accent === 2 && n.dur <= 1) sc -= 4;
      if (s.accent === 0 && n.dur >= 8 && i < rh.length - 1) sc -= 3;
      if (n.on % 2) sc -= style === 'simple' ? 2 : style === 'varie' ? 0.6 : 0.2;
      run = n.dur === 1 ? run + 1 : 0;
      if (run > 3) sc -= 3;
    });
    const last = rh[rh.length - 1];
    if (metricWeight(offset + last.on, spb, timeSig) >= 2) sc += 3;
    if (last.dur >= 4) sc += 2;
    if (ref && refWeight) {
      const set = new Set(ref.map((x) => x.on));
      const shared = rh.filter((x) => set.has(x.on)).length;
      sc += refWeight * 12 * (shared / Math.max(rh.length, ref.length));
    }
    return sc;
  }

  /**
   * Rythme d'un vers sur `barsPerLine` mesures, en respectant une éventuelle répartition par mesure.
   * → [{ on, dur }] (on relatif au début du vers)
   */
  function lineRhythm(line, { spb, timeSig, barsPerLine, style, r, ref, refWeight, tries = 260 }) {
    const syls = line.syllables;
    const W = spb * barsPerLine;
    const n = syls.length;
    // densité : doubles-croches seulement si les croches ne suffisent pas
    let minDur = n * 2 + 2 <= W ? 2 : 1;
    if (style === 'dense' || style === 'varie') minDur = Math.min(minDur, n * 2 + 2 <= W ? (style === 'dense' ? 1 : 2) : 1);
    if (n + 1 > W) throw new Error(`vers « ${line.text} » : ${n} syllabes ne tiennent pas en ${barsPerLine} mesure${barsPerLine > 1 ? 's' : ''} (au plus ${W - 1} doubles-croches et une respiration) : ajoute des mesures par vers`);
    const dist = line.dist;
    if (dist) {
      if (dist.length !== barsPerLine) throw new Error(`vers « ${line.text} » : la répartition ${dist.join('+')} a ${dist.length} parties pour ${barsPerLine} mesures par vers`);
      if (dist.reduce((a, b) => a + b, 0) !== n) throw new Error(`vers « ${line.text} » : la répartition ${dist.join('+')} fait ${dist.reduce((a, b) => a + b, 0)} syllabes, le vers en compte ${n}`);
      if (dist.some((k) => k * 1 + 1 > spb)) throw new Error(`vers « ${line.text} » : trop de syllabes dans une mesure`);
    }
    let best = null;
    let bestScore = -Infinity;
    for (let t = 0; t < tries; t++) {
      let rh;
      if (dist) {
        // mesure par mesure : chaque mesure garde ses attaques (la dernière note d'une mesure va jusqu'au silence suivant)
        rh = [];
        let ok = true;
        let i0 = 0;
        for (let b = 0; b < dist.length && ok; b++) {
          const part = syls.slice(i0, i0 + dist[b]);
          i0 += dist[b];
          if (!part.length) continue;
          const lastBar = b === dist.length - 1;
          const md = part.length * 2 + (lastBar ? 2 : 0) <= spb ? 2 : 1;
          const sub = sampleRhythm(part, spb, r, { style, minDur: md, breathMin: lastBar ? 2 : 0, breathMax: lastBar ? spb / 2 : 4, lead: b === 0 ? 4 : 2, allowGaps: false });
          if (!sub) {
            ok = false;
            break;
          }
          sub.forEach((x) => rh.push({ on: x.on + b * spb, dur: x.dur }));
        }
        if (!ok) continue;
      } else {
        rh = sampleRhythm(syls, W, r, { style, minDur, breathMin: 2, breathMax: Math.max(4, spb / 2), lead: n * minDur + 6 <= W ? 4 : 0, allowGaps: true });
        if (!rh) continue;
      }
      const sc = scoreRhythm(rh, syls, spb, timeSig, { style, ref, refWeight, offset: 0 }) + r() * 1.5;
      if (sc > bestScore) {
        bestScore = sc;
        best = rh;
      }
    }
    if (!best) throw new Error(`vers « ${line.text} » : aucun rythme possible avec ces contraintes`);
    return best;
  }

  /* ================================================================== */
  /* 5. Hauteurs                                                         */
  /* ================================================================== */
  const semi = (a, b) => pcOf(a - b) === 1 || pcOf(b - a) === 1;
  /** Gamme du moment : notes de l'accord + notes de la tonalité qui ne frottent pas (demi-ton) avec elles. */
  function chordScale(chord, keyPcs) {
    const ct = chord.tones;
    return [...new Set([...ct, ...keyPcs.filter((pc) => !ct.includes(pc) && !chord.triad.some((t) => semi(pc, t)))])];
  }
  /** Poids d'une note de l'accord comme appui. */
  function toneWeight(chord, pc) {
    const iv = pcOf(pc - chord.rootPc);
    if (iv === 0) return 0.8;
    if (iv === 3 || iv === 4) return chord.ivs.includes(iv) ? 1 : 0;
    if (iv === 7) return 0.6;
    if (iv === 2 || iv === 5) return chord.ivs.includes(iv) && !chord.ivs.includes(3) && !chord.ivs.includes(4) ? 0.8 : 0.15; // sus : remplace la tierce
    if (iv === 10 || iv === 11) return 0.3;
    // 11e sur une tierce majeure : frotte d'un demi-ton
    if (iv === 5 && chord.ivs.includes(4)) return -2;
    return 0.1;
  }

  const spanAt = (spans, s) => spans.find((sp) => s >= sp.step && s < sp.step + sp.len) || spans[spans.length - 1];
  const spansOver = (spans, s, len) => spans.filter((sp) => sp.step < s + len && sp.step + sp.len > s);

  /**
   * Hauteurs d'un vers.
   *   notes : [{ step (absolu), len, syl }] ; plan : { lo, hi, peak (0–1), endKind: 'closed'|'open'|'half', motif }
   * → midi[] (une note par syllabe)
   */
  function linePitches(notes, spans, keyPcs, tonicPc, plan, prevNote, r) {
    const { lo, hi } = plan;
    const span = hi - lo;
    const n = notes.length;
    // contour en arche : départ, sommet sur l'accent principal (hors dernière syllabe), arrivée
    let peakIdx = -1;
    notes.forEach((x, i) => i < n - 1 && x.syl.accent === 2 && (peakIdx = peakIdx < 0 ? i : peakIdx));
    if (peakIdx < 0) {
      // sans accent de groupe intérieur : le mot accentué le plus proche des 60 % du vers
      const aim = (n - 1) * 0.6;
      notes.forEach((x, i) => i < n - 1 && x.syl.accent === 1 && (peakIdx < 0 || Math.abs(i - aim) < Math.abs(peakIdx - aim)) && (peakIdx = i));
    }
    if (peakIdx < 0) peakIdx = Math.max(0, Math.round((n - 1) * 0.6));
    const start = prevNote != null ? Math.max(lo + 2, Math.min(hi - 4, prevNote)) : lo + span * 0.35;
    const peak = lo + span * plan.peak;
    const endT = lo + span * (plan.endKind === 'closed' ? 0.25 : 0.45);
    const target = (i) => (i <= peakIdx ? start + ((peak - start) * i) / Math.max(1, peakIdx) : peak + ((endT - peak) * (i - peakIdx)) / Math.max(1, n - 1 - peakIdx));
    const out = [];
    let prev = prevNote != null ? prevNote : Math.round(start);
    let lastLeap = 0;
    let repeats = 0;
    notes.forEach((x, i) => {
      const sp = spanAt(spans, x.step);
      const chord = sp.chord;
      const over = spansOver(spans, x.step, x.len);
      const changeAt = sp.step === x.step;
      const structural = x.syl.accent >= 1 || x.len >= 4 || changeAt || i === 0 || i === n - 1;
      let pool = structural ? chord.tones : chordScale(chord, keyPcs);
      // fin fermée : la tonique, si l'accord final la contient (ou si la note tenue arrive sur un accord qui la contient)
      if (i === n - 1 && plan.endKind === 'closed' && (chord.tones.includes(tonicPc) || (over.some((o) => o.chord.tones.includes(tonicPc)) && chordScale(chord, keyPcs).includes(tonicPc))))
        pool = [tonicPc];
      const t = target(i);
      const desired = plan.motif && plan.motif[i] != null && i > 0 ? prev + plan.motif[i] : null;
      let best = null;
      let bestSc = -Infinity;
      for (let m = lo; m <= hi; m++) {
        const pc = pcOf(m);
        if (!pool.includes(pc)) continue;
        const leap = Math.abs(m - prev);
        if (leap > 12) continue;
        let sc = -Math.abs(m - t) * 0.55;
        if (i > 0 || prevNote != null) {
          if (leap === 0) sc += x.syl.accent === 0 && !repeats ? 0.1 : -0.8;
          else if (leap <= 2) sc += 1;
          else if (leap <= 4) sc += 0.2;
          else if (leap <= 7) sc -= 1.6;
          else sc -= 4.5;
          if (leap === 0 && repeats >= 1) sc -= 1.5 * repeats;
          if (Math.abs(lastLeap) > 4 && Math.sign(m - prev) === Math.sign(lastLeap)) sc -= 2.2; // après un saut : on revient
          if (Math.abs(lastLeap) > 4 && Math.sign(m - prev) === -Math.sign(lastLeap) && leap <= 2) sc += 1.4;
          if (leap === 6) sc -= 2; // triton mélodique
        }
        if (structural) sc += toneWeight(chord, pc) * 1.6;
        // le sommet revient à une syllabe importante : une syllabe faible ne monte pas au-dessus de la ligne
        if (x.syl.accent === 0 && m > Math.max(prev, t) + 1) sc -= 1.5 + (m - Math.max(prev, t)) * 0.4;
        // note tenue sur plusieurs accords : réévaluée sur chacun
        over.slice(1).forEach((o) => {
          if (o.chord.tones.includes(pc)) sc += 0.5;
          else if (chordScale(o.chord, keyPcs).includes(pc)) sc -= 0.6;
          else sc -= 3.5;
        });
        if (desired != null) sc -= Math.abs(m - desired) * 0.9;
        if (i === n - 1) {
          if (plan.endKind === 'closed') sc += pc === tonicPc ? 6 : pcOf(pc - chord.rootPc) === 0 ? 2 : 0;
          else if (plan.endKind === 'open') sc += pc !== tonicPc && [3, 4, 7].includes(pcOf(pc - chord.rootPc)) ? 2.5 : 0;
          else sc += pc === tonicPc ? 1 : 0.5;
        }
        sc += r() * 0.35;
        if (sc > bestSc) {
          bestSc = sc;
          best = m;
        }
      }
      if (best == null) {
        // aucun candidat (tessiture trop étroite) : la note de l'accord la plus proche du centre
        best = lo + pcOf(chord.rootPc - lo);
      }
      lastLeap = best - prev;
      repeats = best === prev ? repeats + 1 : 0;
      out.push(best);
      prev = best;
    });
    return out;
  }

  /** Rôle d'une note dans l'harmonie, en mots. */
  function noteRole(notes, i, spans, keyPcs) {
    const x = notes[i];
    const m = x.midi;
    const pc = pcOf(m);
    const over = spansOver(spans, x.step, x.len);
    const chord = over[0].chord;
    const describe = (c) => {
      const iv = c.ivs.find((v) => pcOf(c.rootPc + v) === pc);
      if (iv != null) {
        const d = degreeName(iv, c.ivs);
        return ['neuvième', 'onzième', 'treizième', 'sixte', 'septième', '♭9', '♯9', '♯11', '♭13'].includes(d) ? `couleur (${d})` : `note de l'accord (${d})`;
      }
      return null;
    };
    let role = describe(chord);
    if (!role) {
      const p = notes[i - 1];
      const nx = notes[i + 1];
      const step = (a, b) => a && b && Math.abs(a.midi - b.midi) <= 2 && a.midi !== b.midi;
      if (p && nx && step(p, x) && step(x, nx) && Math.sign(x.midi - p.midi) === Math.sign(nx.midi - x.midi)) role = 'note de passage';
      else if (p && nx && step(p, x) && nx.midi === p.midi) role = 'broderie';
      else if (nx && nx.midi === m && spanAt(spans, nx.step) !== over[0] && spanAt(spans, nx.step).chord.tones.includes(pc)) role = 'anticipation';
      else if (nx && step(x, nx) && nx.midi < m && chord.tones.includes(pcOf(nx.midi)) && x.syl.accent >= 1) role = 'appoggiature (se résout vers le bas)';
      else if (chordScale(chord, keyPcs).includes(pc)) role = 'note de la gamme (mouvement)';
      else role = 'tension (hors accord)';
    }
    if (over.length > 1)
      role +=
        ' ; puis ' +
        over
          .slice(1)
          .map((o) => {
            const d = describe(o.chord);
            return `${o.chord.sym} : ${d ? d.replace("note de l'accord ", '').replace(/^\(|\)$/g, '') + (chord.tones.includes(pc) ? ', note commune' : '') : 'retard / tension'}`;
          })
          .join(' ; ');
    return role;
  }

  /* ================================================================== */
  /* Valeurs et affichage                                                */
  /* ================================================================== */
  const VALUE = { 1: 'double croche', 2: 'croche', 3: 'croche pointée', 4: 'noire', 6: 'noire pointée', 7: 'noire doublement pointée', 8: 'blanche', 12: 'blanche pointée', 14: 'blanche doublement pointée', 16: 'ronde', 24: 'ronde pointée' };
  const REST = { 1: 'quart de soupir', 2: 'demi-soupir', 3: 'demi-soupir pointé', 4: 'soupir', 6: 'soupir pointé', 8: 'demi-pause', 12: 'demi-pause pointée', 16: 'pause' };
  /** Nom d'une durée (en pas) : valeur simple ou valeurs liées. */
  function valueName(len, table = VALUE, tie = ' + ') {
    if (table[len]) return table[len];
    const parts = [];
    let rest = len;
    const sizes = Object.keys(table).map(Number).sort((a, b) => b - a);
    while (rest > 0) {
      const s = sizes.find((x) => x <= rest && table[x] && !/doublement/.test(table[x]));
      parts.push(table[s]);
      rest -= s;
    }
    return parts.join(tie) + (table === VALUE ? ' (liées)' : '');
  }
  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }
  /** Pas → noires en fraction lisible : 6 → « 3/2 », 4 → « 1 ». */
  function quarters(steps) {
    const g = gcd(steps, 4);
    return 4 / g === 1 ? String(steps / g) : `${steps / g}/${4 / g}`;
  }
  /** Position dans la mesure (1 = début, en noires) : 6 → « 2 ½ » écrit « 2 1/2 ». */
  function posLabel(stepInBar) {
    const whole = Math.floor(stepInBar / 4);
    const frac = stepInBar % 4;
    return frac ? `${whole + 1} ${quarters(frac)}` : String(whole + 1);
  }
  const EN_NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  /** Nom anglo-saxon d'une note (A, B♭, F♯…), orthographié selon la tonalité, avec l'octave (C4 = do central, MIDI 60). */
  function noteLabel(midi, key) {
    const oct = Math.floor(midi / 12) - 1;
    if (key && H().valid(key)) return H().spell(key, pcOf(midi)) + oct;
    return EN_NOTES[pcOf(midi)] + oct;
  }
  /** Tonalité avec la tonique en notation anglo-saxonne : « A mineur », « B♭ majeur ». */
  const keyLabel = (key) => H().label(key).replace(/^\S+/, key.tonic);

  /**
   * Fonction d'un accord dans la tonalité (fenêtre Key : repos, préparation, tension, couleur du mode),
   * ou « emprunt » quand sa fondamentale est hors de la gamme. → { id, label, text, borrowed }
   */
  function chordFunction(chord, key) {
    const sc = H().scale(key);
    const deg = sc.findIndex((d) => d.pc === chord.rootPc);
    if (deg < 0) return { id: 'emprunt', label: 'emprunt', text: 'fondamentale hors de la tonalité (accord emprunté ou chromatique)', borrowed: true };
    const set = [...new Set(chord.ivs.map(pcOf))].sort((a, b) => a - b).join();
    let type = (SS.CHORDS.find((c) => [...new Set(c.iv.map(pcOf))].sort((a, b) => a - b).join() === set) || {}).id;
    if (!type) {
      const has = (i) => chord.ivs.some((x) => pcOf(x) === i);
      type = has(3) ? (has(6) && !has(7) ? 'dim' : 'min') : has(4) ? (has(8) && !has(7) ? 'aug' : 'maj') : has(5) ? 'sus4' : has(2) ? 'sus2' : '5';
    }
    const g = H().gridChord(key, deg, type, 0);
    return { ...g.role, borrowed: g.borrowed, numeral: g.numeral };
  }
  /** Type d'une note (couleur de l'aperçu), d'après son rôle. */
  function noteKind(role) {
    if (/^note de l'accord/.test(role)) return 'chord';
    if (/^couleur/.test(role)) return 'color';
    if (/passage|broderie/.test(role)) return 'passing';
    if (/appoggiature|anticipation/.test(role)) return 'appog';
    if (/gamme/.test(role)) return 'scale';
    return 'tension';
  }

  /* ================================================================== */
  /* Composition complète                                                */
  /* ================================================================== */
  const RANGES = {
    voix: { lo: 60, hi: 72, label: 'Voix moyenne (C4–C5)' },
    soprano: { lo: 60, hi: 79, label: 'Soprano (C4–G5)' },
    alto: { lo: 55, hi: 74, label: 'Alto (G3–D5)' },
    tenor: { lo: 48, hi: 67, label: 'Ténor (C3–G4)' },
    baryton: { lo: 45, hi: 64, label: 'Baryton (A2–E4)' },
    instrument: { lo: 60, hi: 84, label: 'Instrument lead (C4–C6)' },
  };

  /**
   * Compose une mélodie.
   *   opts : { grid (texte), source: 'text'|'meter', text, meter, barsPerLine, key ({tonic,mode} | null = auto),
   *            range ('voix'… ou { lo, hi }), style ('simple'|'varie'|'dense'), ending ('closed'|'open'),
   *            eMode, sungFinalE, timeSig, seed }
   * → { ok, errors, key, keyAuto, keyAlternatives, spb, bars, lines, notes, rows, checks, summary, hypotheses }
   */
  function compose(opts) {
    const timeSig = opts.timeSig || [4, 4];
    const spb = Math.round(timeSig[0] * (16 / timeSig[1]));
    let barsPerLine = Math.max(1, Math.min(8, opts.barsPerLine || 2));
    const style = opts.style || 'simple';
    const seed = opts.seed || 1;
    const r = rng(`melodie/${seed}`);
    const hypotheses = [];
    const errors = [];
    const fail = (list) => ({ ok: false, errors: list, hypotheses });

    // --- grille ---
    let key = opts.key && H().valid(opts.key) ? opts.key : null;
    const grid = parseGrid(opts.grid, { spb, key });
    if (grid.errors.length) return fail(grid.errors);
    if (!grid.spans.length) return fail(['Écris une grille d’accords : par exemple « Am | F | C | G ».']);

    // --- textes ou structure ---
    // fitGrid : la mélodie dure exactement la grille (4 accords → 4 mesures), les phrases se la partagent
    const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
    let meter = opts.meter;
    if (opts.fitGrid && opts.source === 'meter' && !String(meter || '').trim()) {
      const phrases = grid.bars % 2 === 0 ? grid.bars / 2 : 1;
      const bpl = grid.bars / phrases;
      meter = Array.from({ length: phrases }, () => String(bpl * 4 - 1)).join(' ');
      hypotheses.push(`Structure automatique : ${plural(phrases, 'phrase')} de ${bpl * 4 - 1} notes (« ${meter} »).`);
    }
    const fit = (count) => {
      if (!opts.fitGrid) return null;
      if (grid.bars % count) {
        const ok = [];
        for (let d = 1; d <= grid.bars; d++) if (grid.bars % d === 0) ok.push(d);
        return `La grille a ${plural(grid.bars, 'mesure')} : ${plural(count, 'phrase')} ne la partagent pas en parts égales. Essaie ${ok.join(', ')} phrase${ok.length > 1 || ok[0] > 1 ? 's' : ''}.`;
      }
      barsPerLine = grid.bars / count;
      return null;
    };
    let lines;
    if (opts.source === 'meter') {
      let res = scanMeter(meter, barsPerLine);
      if (res.errors.length) return fail(res.errors);
      if (!res.lines.length) return fail(['Indique une structure : par exemple « 8 8 » (notes par phrase) ou « 3+5 3+5 ».']);
      const e = fit(res.lines.length);
      if (e) return fail([e]);
      res = scanMeter(meter, barsPerLine);
      lines = res.lines;
      hypotheses.push('Sans paroles : notes abstraites (V1-S1…) et appuis proposés en fin de groupe.');
    } else {
      lines = scanLyrics(opts.text, { eMode: opts.eMode, sungFinalE: opts.sungFinalE });
      if (!lines.length) return fail(['Écris les paroles, un vers par ligne (ou choisis « Structure métrique »).']);
      const e = fit(lines.length);
      if (e) return fail([e]);
    }
    lines.forEach((l) => l.count === 0 && errors.push(`vers « ${l.text} » : aucune syllabe reconnue`));
    if (errors.length) return fail(errors);

    const totalBars = lines.length * barsPerLine;
    const total = totalBars * spb;
    const keyAuto = !key;
    let keyAlternatives = [];
    if (!key) {
      const g = guessKeys(grid.spans);
      key = g[0].key;
      keyAlternatives = g.slice(1, 3).filter((x) => x.score > g[0].score - 0.2).map((x) => x.key);
      hypotheses.push(
        `Tonalité supposée d’après les accords : ${keyLabel(key)}` + (keyAlternatives.length ? ` (autre lecture possible : ${keyAlternatives.map((k) => keyLabel(k)).join(', ')})` : '') + '.'
      );
    }
    const spans = loopSpans(grid.spans, grid.bars * spb, total);
    if (grid.bars !== totalBars)
      hypotheses.push(
        grid.bars < totalBars
          ? `La grille (${grid.bars} mesure${grid.bars > 1 ? 's' : ''}) tourne en boucle sous les ${totalBars} mesures de la mélodie.`
          : `La mélodie (${totalBars} mesures) n’utilise que le début de la grille (${grid.bars} mesures).`
      );
    const keyPcs = H().scale(key).map((d) => d.pc);
    const tonicPc = keyPcs[0];

    // --- tessiture ---
    const rg = typeof opts.range === 'object' && opts.range ? opts.range : RANGES[opts.range] || RANGES.voix;
    const lo = rg.lo;
    const hi = rg.hi;

    // --- plan des vers : A A' B A'' par strophes de 4 ---
    const roleOf = (i) => {
      const L = lines.length;
      if (L === 1) return 'A';
      const p = i % 4;
      if (L - (i - p) === 2 || L === 2) return p === 0 ? 'A' : "A'";
      if (L - (i - p) === 3) return ['A', "A'", 'B'][p];
      return ['A', "A'", 'B', "A''"][p];
    };
    const plans = lines.map((l, i) => {
      const role = roleOf(i);
      const last = i === lines.length - 1;
      return {
        role,
        peak: role === 'B' ? 0.95 : role === "A'" ? 0.68 : role === "A''" ? 0.6 : 0.58,
        endKind: last ? opts.ending || 'closed' : role === 'A' || role === 'B' ? 'open' : 'half',
      };
    });

    // --- rythme puis hauteurs, vers par vers ---
    const notes = [];
    const rhythms = [];
    const motifs = [];
    let prevNote = null;
    try {
      lines.forEach((line, li) => {
        const plan = plans[li];
        const start = li * barsPerLine * spb;
        // référence du motif : le vers A de la strophe (ou de la première strophe si même nombre de syllabes)
        const aIdx = li - (li % 4);
        const first = lines[li % 4] && li >= 4 && lines[li % 4].count === line.count ? li % 4 : null;
        let ref = null;
        let refWeight = 0;
        if (first != null) {
          ref = rhythms[first];
          refWeight = 1.6;
        } else if (plan.role !== 'A' && rhythms[aIdx]) {
          ref = rhythms[aIdx];
          refWeight = plan.role === 'B' ? -0.4 : plan.role === "A'" ? 1.2 : 0.8;
        }
        const rh = lineRhythm(line, { spb, timeSig, barsPerLine, style, r, ref, refWeight });
        rhythms.push(rh);
        const ln = rh.map((x, i) => ({ step: start + x.on, len: x.dur, syl: line.syllables[i], line: li, idx: i }));
        // motif mélodique : un vers A' / A'' reprend les intervalles du vers A s'il a le même nombre de syllabes
        const src = first != null ? first : plan.role !== 'A' && plan.role !== 'B' ? aIdx : null;
        const motif = src != null && motifs[src] && motifs[src].length === ln.length ? motifs[src] : null;
        const midis = linePitches(ln, spans, keyPcs, tonicPc, { lo, hi, peak: plan.peak, endKind: plan.endKind, motif }, prevNote, r);
        motifs.push(midis.map((m, i) => (i ? m - midis[i - 1] : null)));
        ln.forEach((x, i) => (x.midi = midis[i]));
        prevNote = midis[midis.length - 1];
        notes.push(...ln);
      });
    } catch (e) {
      return fail([e.message]);
    }

    // --- nuances (vélocité MIDI 1–127, base 80) ---
    const maxOfLine = new Map();
    notes.forEach((x) => maxOfLine.set(x.line, Math.max(maxOfLine.get(x.line) ?? -1, x.midi)));
    const climaxLine = plans.findIndex((p) => p.role === 'B');
    notes.forEach((x, i) => {
      let v = 80;
      if (x.syl.accent === 2) v += 12;
      else if (x.syl.accent === 1) v += 5;
      else v -= 5;
      if (x.syl.caduc) v -= 8;
      if (x.len >= 8) v += 3;
      if (x.midi === maxOfLine.get(x.line)) v += 6;
      if (x.line === climaxLine) v += 5;
      const next = notes[i + 1];
      if ((!next || next.line !== x.line) && x.line !== climaxLine) v -= 6;
      v += Math.round((metricWeight(x.step, spb, timeSig) - 1) * 1.5);
      x.vel = Math.max(30, Math.min(120, Math.round(v)));
    });

    // --- rôles ---
    notes.forEach((x, i) => {
      x.role = noteRole(notes, i, spans, keyPcs);
      x.kind = noteKind(x.role);
    });
    // fonction de chaque accord (repos, préparation, tension…) pour l'aperçu
    grid.spans.forEach((sp) => (sp.chord.fn = chordFunction(sp.chord, key)));

    // --- tableau : notes et silences, mesure par mesure ---
    const rows = [];
    let cur = 0;
    const chordsOver = (s, len) => spansOver(spans, s, len).map((sp) => sp.chord.sym).join(' → ');
    const pushRest = (from, to) => {
      // un silence par mesure (lisible), découpé aux barres
      let s = from;
      while (s < to) {
        const end = Math.min(to, (Math.floor(s / spb) + 1) * spb);
        rows.push({ bar: Math.floor(s / spb) + 1, pos: posLabel(s % spb), chords: chordsOver(s, end - s), syl: 'silence', note: '—', midi: null, dur: quarters(end - s), value: valueName(end - s, REST, ' + '), vel: null, role: 'respiration', step: s, len: end - s });
        s = end;
      }
    };
    notes.forEach((x) => {
      if (x.step > cur) pushRest(cur, x.step);
      const crosses = Math.floor((x.step + x.len - 1) / spb) > Math.floor(x.step / spb);
      rows.push({
        bar: Math.floor(x.step / spb) + 1,
        pos: posLabel(x.step % spb),
        chords: chordsOver(x.step, x.len),
        syl: x.syl.text,
        accent: x.syl.accent,
        note: noteLabel(x.midi, key),
        midi: x.midi,
        dur: quarters(x.len),
        value: valueName(x.len) + (crosses ? ' — liée sur la barre' : ''),
        vel: x.vel,
        role: x.role,
        step: x.step,
        len: x.len,
        line: x.line,
      });
      cur = x.step + x.len;
    });
    if (cur < total) pushRest(cur, total);

    // --- contrôles (étape 8 du skill) ---
    const checks = [];
    const ck = (ok, text, warn = false) => checks.push({ ok, warn, text });
    ck(true, `Accords : ${grid.spans.length} accord${grid.spans.length > 1 ? 's' : ''} lu${grid.spans.length > 1 ? 's' : ''} sur ${grid.bars} mesure${grid.bars > 1 ? 's' : ''} — ${grid.spans.map((s) => `${s.chord.sym} (${s.chord.tones.map((pc) => noteLabel(60 + pc, key).replace(/-?\d+$/, '')).join('-')})`).join(', ')}.`);
    // couverture exacte et monophonie
    let t = 0;
    let mono = true;
    rows.forEach((row) => {
      if (row.step !== t) mono = false;
      t = row.step + row.len;
    });
    ck(mono && t === total, `Temps : notes et silences couvrent exactement ${totalBars} mesure${totalBars > 1 ? 's' : ''} (${quarters(total)} noires), sans chevauchement (une seule voix).`);
    // une attaque par syllabe
    lines.forEach((l, li) => {
      const att = notes.filter((x) => x.line === li).length;
      const perBar = Array.from({ length: barsPerLine }, (_, b) => notes.filter((x) => x.line === li && Math.floor(x.step / spb) === li * barsPerLine + b).length);
      const distOk = !l.dist || l.dist.every((k, b) => k === perBar[b]);
      ck(att === l.count && distOk, `Vers ${li + 1} : ${l.count} syllabe${l.count > 1 ? 's' : ''}, ${att} attaque${att > 1 ? 's' : ''} (${perBar.join('+')} par mesure${l.dist ? ', répartition demandée ' + l.dist.join('+') : ''}), pas de mélisme.`);
    });
    // tessiture et sauts
    const all = notes.map((x) => x.midi);
    const minN = Math.min(...all);
    const maxN = Math.max(...all);
    ck(minN >= lo && maxN <= hi, `Tessiture : de ${noteLabel(minN, key)} à ${noteLabel(maxN, key)} (MIDI ${minN}–${maxN}), dans ${noteLabel(lo, key)}–${noteLabel(hi, key)}.`);
    let bigLeaps = 0;
    let maxLeap = 0;
    notes.forEach((x, i) => {
      if (!i || notes[i - 1].line !== x.line) return;
      const l = Math.abs(x.midi - notes[i - 1].midi);
      maxLeap = Math.max(maxLeap, l);
      if (l > 7) bigLeaps++;
    });
    ck(bigLeaps <= Math.max(1, Math.floor(lines.length / 2)), `Sauts : le plus grand fait ${maxLeap} demi-ton${maxLeap > 1 ? 's' : ''}${bigLeaps ? `, ${bigLeaps} saut${bigLeaps > 1 ? 's' : ''} de plus d’une quinte` : ''}.`, bigLeaps > 0);
    // notes exposées (accentuées ou longues) hors accord
    const exposed = notes.filter((x) => (x.syl.accent === 2 || x.len >= 8) && !spanAt(spans, x.step).chord.tones.includes(pcOf(x.midi)));
    ck(!exposed.length, exposed.length ? `Notes exposées hors accord : ${exposed.map((x) => `${x.syl.text} (${noteLabel(x.midi, key)}, mesure ${Math.floor(x.step / spb) + 1})`).join(', ')} — à écouter.` : 'Notes exposées (accents principaux, notes longues) : toutes dans l’accord du moment.', exposed.length > 0);
    const ends = lines.map((_, li) => notes.filter((x) => x.line === li).pop());
    const fin = ends[ends.length - 1];
    const finKind = pcOf(fin.midi) === tonicPc ? 'sur la tonique (fin fermée)' : `sur ${noteLabel(fin.midi, key)} (${noteRole(notes, notes.indexOf(fin), spans, keyPcs)}), fin ouverte`;
    const lastChord = spanAt(spans, fin.step).chord;
    const wantClosed = (opts.ending || 'closed') === 'closed';
    ck(
      !wantClosed || pcOf(fin.midi) === tonicPc || !lastChord.tones.includes(tonicPc),
      `Fin : ${finKind}.` +
        (wantClosed && !lastChord.tones.includes(tonicPc)
          ? ` La grille se termine sur ${lastChord.sym}, qui ne contient pas la tonique (${noteLabel(60 + tonicPc, key).replace(/-?\d+$/, '')}) : pour une fin fermée, termine la grille sur l’accord de tonique ou ajoute une mesure.`
          : ''),
      wantClosed && pcOf(fin.midi) !== tonicPc
    );
    const scanNotes = [...new Set(lines.flatMap((l) => l.notes))];
    if (scanNotes.length) scanNotes.forEach((n) => ck(true, 'Scansion à vérifier : ' + n, true));
    ck(true, 'Ces contrôles portent sur la structure ; ils ne remplacent pas l’écoute (aucune écoute n’a eu lieu).', true);

    // --- résumé ---
    const peakNote = notes.reduce((a, b) => (b.midi > a.midi ? b : a));
    const r0 = rhythms[0] || [];
    const motifCells = r0.slice(0, 4).map((x) => valueName(x.dur).replace(' (liées)', '')).join(', ');
    const summary = {
      motif: `Motif : le premier vers ouvre sur ${motifCells}${r0.length > 4 ? '…' : ''} ; ${lines.length > 1 ? 'les vers suivants le reprennent et le varient (' + plans.map((p) => p.role).join(' ') + ')' : 'un seul vers'}.`,
      peak: lines[0].abstract
        ? `Sommet : ${noteLabel(peakNote.midi, key)} (phrase ${peakNote.line + 1}, mesure ${Math.floor(peakNote.step / spb) + 1}).`
        : `Sommet : ${noteLabel(peakNote.midi, key)} sur « ${peakNote.syl.text} » (vers ${peakNote.line + 1}, mesure ${Math.floor(peakNote.step / spb) + 1}).`,
      ending: `Fin : ${finKind}.`,
    };

    hypotheses.push(
      `Mesure ${timeSig[0]}/${timeSig[1]}, ${barsPerLine} mesure${barsPerLine > 1 ? 's' : ''} par vers, tessiture ${rg.label || `MIDI ${lo}–${hi}`}, une note par syllabe.`
    );
    if (opts.source !== 'meter') hypotheses.push(opts.eMode === 'chanson' ? 'Scansion « chanson » : les e muets de fin de mot ne sont pas chantés.' : 'Scansion « classique » : e muet compté devant consonne, élidé devant voyelle, muet en fin de vers' + (opts.sungFinalE ? ' (ici chanté)' : '') + '.');

    return { ok: true, errors: [], key, keyAuto, keyAlternatives, spb, timeSig, bars: totalBars, total, lines, notes, rows, checks, summary, hypotheses, spans };
  }

  /* ================================================================== */
  /* Export MIDI (type 0, 960 PPQ, tempo, mesure et paroles)            */
  /* ================================================================== */
  function toMidi(res, bpm = 90) {
    const PPQ = 960;
    const T = PPQ / 4; // pas de double-croche
    const vlq = (n) => {
      const out = [n & 127];
      n >>= 7;
      while (n) {
        out.unshift((n & 127) | 128);
        n >>= 7;
      }
      return out;
    };
    const enc = (s) => Array.from(new TextEncoder().encode(s));
    const meta = (type, bytes) => [255, type, ...vlq(bytes.length), ...bytes];
    const tempo = Math.round(60000000 / bpm);
    const [num, den] = res.timeSig;
    const ev = [
      [0, -3, meta(0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255])],
      [0, -2, meta(0x58, [num, Math.log2(den), 24, 8])],
      [0, -1, meta(3, enc('Mélodie'))],
    ];
    res.notes.forEach((x) => {
      const on = x.step * T;
      if (!res.lines[x.line].abstract) ev.push([on, 1, meta(5, enc(x.syl.text.replace(/\(.*?\)/g, '').replace('‿', '')))]);
      ev.push([on, 2, [0x90, x.midi, x.vel]]);
      ev.push([(x.step + x.len) * T, 0, [0x80, x.midi, 0]]);
    });
    ev.push([res.total * T, 3, meta(0x2f, [])]);
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const track = [];
    let prev = 0;
    ev.forEach(([t, , bytes]) => {
      track.push(...vlq(t - prev), ...bytes);
      prev = t;
    });
    const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const head = [77, 84, 104, 100, ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255];
    return new Uint8Array([...head, 77, 84, 114, 107, ...u32(track.length), ...track]);
  }

  /** Événements de piste (format du projet) : vélocité 0–1, paroles gardées dans `lyric`. */
  function toEvents(res) {
    return res.notes.map((x) => ({ step: x.step, len: x.len, notes: [x.midi], vel: Math.round((x.vel / 127) * 100) / 100, lyric: x.syl.text }));
  }

  return { compose, keyLabel, chordFunction, noteKind, parseGrid, parseChordSymbol, scanLine, scanLyrics, scanMeter, guessKeys, toMidi, toEvents, RANGES, metricWeight, valueName, quarters, posLabel, noteLabel, _rng: rng };
})();
