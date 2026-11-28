/*
 * Nouvelle chanson sur téléphone (telephone.html, js/phone.js) : la recette de la chanson et sa construction, sans DOM.
 *
 * La recette tient en peu de choses : tempo, tonalité, musiciens (batterie, basse, clavier) et liste des scènes.
 * Elle est jouée par le même moteur que l'assistant « Nouvelle chanson » : le plan « Créer de zéro » (SS.BandSongs.zero,
 * ses parties par scène), SS.bandSong.build pour les notes, js/bandmix.js pour le mixage. La chanson obtenue est un projet
 * ordinaire : elle s'ouvre telle quelle dans la Grille. La recette y est rangée (project.phone) pour être reprise
 * sur le téléphone.
 *
 *   recipe = { v: 1, style, tempo, tonic: 0..11, mode: 'major' | 'minor', mus: { drums, bass, bass2, keys, keys2, pad, pad2 }, scenes: ['intro', 'verse', …] }
 *   mus[id] = { on, pick } : pick = indice du son dans la liste du musicien (sounds). « keys2 » : un second Clavier (PLAYERS)
 *   parts = { [type de scène]: { [musicien]: motif | 'off' } } : la partie jouée par chaque musicien dans chaque type de
 *     scène (« Qui joue quoi ») ; absente, le musicien joue la partie du plan. Les scènes de même type (deux couplets)
 *     jouent la même partie, comme dans l'assistant.
 *   edits = { [type de scène]: { drums: { K, S, H, O }, bass: [[pas, durée, ligne, vélocité]], keys: 'motif' } } : la partie
 *     retouchée dans l'écran Pas (ou jouée au doigt dans Jouer), une mesure qui se répète sur la scène. Batterie : pistes de
 *     16 caractères (x o . -) de la grille de l'assistant ; basse : notes d'un motif écrit (js/mybass.js, lignes par rapport
 *     à l'accord) ; clavier : motif réécrit du Clavier (16 jetons, js/keyboardist.js). Une partie « Ne joue pas » l'emporte.
 */
window.SS = window.SS || {};
SS.phoneSong = (() => {
  const B = () => SS.Band;
  const PRESET = 'zero'; // inspiration « Créer de zéro » : la structure des scènes (longueurs, accords du Pop rock)
  const VERSION = 1;
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 240;

  /** Les trois musiciens du téléphone, dans l'ordre de l'écran. */
  const MUSICIANS = [
    { id: 'drums', label: 'Batterie', icon: '🥁', color: 'var(--c-pink)' },
    { id: 'bass', label: 'Basse', icon: '🎸', color: 'var(--c-green)' },
    { id: 'keys', label: 'Clavier', icon: '🎹', color: 'var(--c-yellow)' },
    // téléphone seulement : la nappe (cordes ou pad) du modèle, absente au départ (offAtStart)
    { id: 'pad', label: 'Nappe', icon: '🎻', color: 'var(--c-blue)', offAtStart: true },
  ];
  /**
   * Musiciens de la chanson (écran Musiciens : liste où l'on ajoute et retire) : une Batterie au plus, deux Basses, deux
   * Claviers, deux Nappes, 6 au plus. Le second d'un type (« keys2 ») joue comme un musicien ajouté de l'assistant
   * (identifiant x1, x2, x3 sur sa piste) : sa propre partie dans chaque scène, le ★ de la scène au départ.
   */
  const PLAYERS = ['drums', 'bass', 'bass2', 'keys', 'keys2', 'pad', 'pad2'];
  const MAX_PLAYERS = 6;
  const SECOND = { bass: 'x1', keys: 'x2', pad: 'x3' };
  const kindOf = (id) => String(id || '').replace(/2$/, '');
  const isSecond = (id) => /2$/.test(String(id || ''));
  /** Fiche d'un musicien de la chanson : { id, kind, label (« Clavier 2 »), icon, color }. */
  function playerInfo(id) {
    const m = MUSICIANS.find((x) => x.id === kindOf(id));
    return m ? { ...m, id, kind: m.id, label: isSecond(id) ? `${m.label} 2` : m.label } : null;
  }
  /** Musiciens présents, dans l'ordre de l'écran. */
  const players = (r) => PLAYERS.filter((id) => r.mus && r.mus[id] && r.mus[id].on).map(playerInfo);
  /** Peut-on ajouter un musicien de ce type ? */
  function canAdd(r, kind) {
    if (players(r).length >= MAX_PLAYERS || !MUSICIANS.some((m) => m.id === kind)) return false;
    if (!r.mus[kind].on) return true;
    return kind !== 'drums' && !r.mus[kind + '2'].on;
  }
  /** Ajoute un musicien de ce type (le premier libre) ; son identifiant, ou null. */
  function addPlayer(r, kind) {
    if (!canAdd(r, kind)) return null;
    const id = r.mus[kind].on ? kind + '2' : kind;
    r.mus[id] = { on: true, pick: 0 };
    forget(r, id);
    return id;
  }
  /** Retire un musicien : ses parties et ses retouches sont oubliées. */
  function removePlayer(r, id) {
    if (!r.mus[id]) return;
    r.mus[id] = { on: false, pick: 0 };
    forget(r, id);
  }
  function forget(r, id) {
    ['parts', 'edits'].forEach((k) => Object.keys(r[k] || {}).forEach((sc) => {
      delete r[k][sc][id];
      if (!Object.keys(r[k][sc]).length) delete r[k][sc];
    }));
  }
  /** Identifiant du musicien sur sa piste (band.musician) : celui du modèle, ou x1/x2/x3 pour le second d'un type. */
  const bandMuOf = (id, r) => (isSecond(id) ? SECOND[kindOf(id)] : musician(kindOf(id), r).id);
  /** Identifiant d'instrument de l'assistant (« musicien:clé », js/bandsong.js) : réglages parts[section].inst[id]. */
  const instOf = (id, r) => `${bandMuOf(id, r)}:${musician(kindOf(id), r).role}`;
  /** Musicien de la chanson qui joue une piste construite (« keys2 »), ou null. */
  function playerOfTrack(t) {
    const role = roleOf(t);
    if (!MUSICIANS.some((m) => m.id === role)) return null;
    return /^x\d+$/.test((t.band && t.band.musician) || '') ? role + '2' : role;
  }
  /** Le musicien a-t-il des parties retouchées (Pas, Jouer) ? */
  const hasEdits = (r, id) => Object.values(r.edits || {}).some((row) => row && row[id]);
  /** Sons de la Nappe : les cordes d'abord, avec des noms simples (les sons du modèle, sans le Juno). */
  const PAD_SOUNDS = [['gm_string_ensemble_1', 'Cordes'], ['gm_synth_strings_1', 'Cordes synthé'], ['syn_softpad', 'Nappe douce'], ['gm_pad_warm', 'Nappe chaude'], ['syn_superpad', 'Super nappe']];

  /** Types de scène proposés : ceux du plan « Créer de zéro ». minor : accords en mineur (le plan est écrit en majeur). */
  const SCENES = [
    { id: 'intro', label: 'Intro', color: 'var(--c-violet)', minor: 'i | VI | III | VII' },
    { id: 'verse', label: 'Couplet', color: 'var(--c-cyan)', minor: 'i | VI | III | VII' },
    { id: 'chorus', label: 'Refrain', color: 'var(--c-amber)', minor: 'VI | III | VII | i' },
    { id: 'bridge', label: 'Pont', color: 'var(--c-green)', minor: 'iv | VI | III | VII' },
    { id: 'outro', label: 'Fin', color: 'var(--c-pink)', minor: 'i | VI | VII | i' },
  ];
  const sceneType = (id) => SCENES.find((s) => s.id === id) || null;

  /**
   * Styles d'une nouvelle chanson (écran Style). Chacun s'appuie sur un modèle de l'assistant (band : style de SS.Band.STYLES,
   * preset : son modèle) pour les sons, le groove, le mixage et les motifs, et dit ce que joue le modèle du téléphone dans
   * chaque type de scène (sec : jeu de batterie, motif de basse, du clavier, de la nappe) et ses accords (chords).
   * Les longueurs de scène restent celles de « Créer de zéro ». Pop rock : le plan de « Créer de zéro » tel quel.
   */
  const STYLES = [
    {
      id: 'pop', label: 'Pop rock', icon: '🎸', color: 'var(--c-orange)', band: 'zero', preset: 'zero', drums: 'pop', tempo: 100, tonic: 0, mode: 'major', info: 'batterie, basse, piano',
      sec: { intro: { pad: 'swell' }, verse: { pad: 'sustain' }, chorus: { pad: 'add9' }, bridge: { pad: 'float' }, outro: { pad: 'sustain' } },
      chords: { minor: { intro: 'i | VI | III | VII', verse: 'i | VI | III | VII', chorus: 'VI | III | VII | i', bridge: 'iv | VI | III | VII', outro: 'i | VI | VII | i' } },
    },
    {
      id: 'dance', label: 'Dance', icon: '🪩', color: 'var(--c-violet)', band: 'edm', preset: 'levels', drums: 'edm', tempo: 126, tonic: 9, mode: 'minor', padOn: true, padFirst: 'syn_superpad', info: 'kick à chaque temps, basse synthé, nappe',
      sec: {
        intro: { drums: 'light', bass: null, keys: 'house', pad: 'swell' },
        verse: { drums: 'main', bass: 'offbeat', keys: 'house', pad: 'sustain' },
        chorus: { drums: 'full', bass: 'offbeat', keys: 'house', pad: 'stabs' },
        bridge: { drums: 'break', bass: null, keys: 'sustain', pad: 'swell' },
        outro: { drums: 'main', bass: 'offbeat', keys: 'house', pad: null },
      },
      chords: {
        major: { intro: 'I | V | vi | IV', verse: 'vi | IV | I | V', chorus: 'IV | V | vi | I', bridge: 'ii | IV | vi | V', outro: 'I | V | vi | IV' },
        minor: { intro: 'i | VI | III | VII', verse: 'i | VI | III | VII', chorus: 'VI | VII | i | III', bridge: 'iv | VI | III | VII', outro: 'i | VI | III | VII' },
      },
    },
    {
      id: 'latin', label: 'Latino', icon: '🌴', color: 'var(--c-pink)', band: 'latin', preset: 'calle', drums: 'latin', tempo: 95, tonic: 9, mode: 'minor', info: 'salsa : clave, tumbao, montuno au piano',
      sec: {
        intro: { drums: 'main', bass: 'tumbao23', keys: 'montuno23', pad: null },
        verse: { drums: 'main', bass: 'tumbao23', keys: 'montuno23', pad: 'sustain' },
        chorus: { drums: 'full', bass: 'tumbao23', keys: 'montuno23', pad: 'sustain' },
        bridge: { drums: 'full', bass: 'tumbao23', keys: 'mambo23', pad: 'swell' },
        outro: { drums: 'full', bass: 'tumbao23', keys: 'montuno23', pad: null },
      },
      chords: {
        major: { intro: 'I | IV | V7 | IV', verse: 'I | IV | V7 | IV', chorus: 'I | IV | V7 | I', bridge: 'ii | V7 | I | vi', outro: 'I | IV | V7 | I' },
        minor: { intro: 'i | iv | V7 | iv', verse: 'i | iv | VII | III', chorus: 'i | iv | V7 | i', bridge: 'iv | VII | III | V7', outro: 'i | iv | V7 | i' },
      },
    },
  ];
  /** Style d'une recette (ou d'un identifiant) ; Pop rock par défaut (chansons faites avant les styles). */
  const styleOf = (x) => STYLES.find((st) => st.id === (typeof x === 'string' ? x : x && x.style)) || STYLES[0];
  const presetOf = (bandId, presetId) => B().STYLES.find((s) => s.id === bandId).presets.find((p) => p.id === presetId);
  const preset = (x) => presetOf(styleOf(x).band, styleOf(x).preset);
  /** Musicien du modèle du style (la Nappe de « Créer de zéro » si le modèle n'en a pas). */
  const musician = (id, x) => preset(x).musicians.find((m) => m.id === id) || presetOf('zero', 'zero').musicians.find((m) => m.id === id);
  const plan = () => SS.BandSongs[PRESET];

  /**
   * Sons proposés pour un musicien : les kits de la batterie, les choix de la basse et du piano. Les synthés Juno (« j: »)
   * sont laissés de côté : ils sont trop lourds à calculer sur un téléphone.
   */
  function sounds(id0, x) {
    const id = kindOf(id0);
    const mu = musician(id, x);
    if (!mu) return [];
    if (id === 'pad') {
      const first = styleOf(x).padFirst;
      const list = PAD_SOUNDS.map(([tok, label]) => ({ tok, label }));
      return first ? [...list.filter((o) => o.tok === first), ...list.filter((o) => o.tok !== first)] : list;
    }
    if (mu.kits) return mu.kits.map((k) => ({ tok: k, label: (B().KITS[k] || { label: k }).label }));
    return mu.pick.filter((tok) => !tok.startsWith('j:')).map((tok) => ({ tok, label: soundLabel(tok, catOf(mu)) }));
  }
  const catOf = (mu) => mu.cat || B().ROLES[mu.role].cat || 'mono';
  function soundLabel(tok, cat) {
    try {
      const { family, inst } = SS.locateInstrument(null, tok);
      return (inst && inst.label) || (family && family.label) || tok;
    } catch (e) {
      return B().describe(B().choiceOpts(tok, cat)).name;
    }
  }

  /** Recette de départ d'un style (Pop rock : 100 BPM, Do majeur, les trois musiciens), la structure courte du plan. */
  function fresh(styleId = 'pop') {
    const st = styleOf(styleId);
    return {
      v: VERSION,
      style: st.id,
      tempo: st.tempo,
      tonic: st.tonic,
      mode: st.mode,
      mus: Object.fromEntries(PLAYERS.map((id) => [id, { on: isSecond(id) ? false : id === 'pad' ? !!st.padOn : !MUSICIANS.find((m) => m.id === id).offAtStart, pick: 0 }])),
      scenes: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
      parts: {},
      edits: {},
    };
  }

  /** Recette lue (projet enregistré, fichier) : valeurs bornées, champs manquants remplacés ; null si inutilisable. */
  function clean(r) {
    if (!r || typeof r !== 'object' || r.v !== VERSION) return null;
    const style = styleOf(r).id;
    const f = fresh(style);
    const int = (x, lo, hi, d) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
    const mus = {};
    PLAYERS.forEach((id) => {
      const x = (r.mus && r.mus[id]) || {};
      const offAtStart = isSecond(id) || MUSICIANS.find((m) => m.id === id).offAtStart;
      mus[id] = { on: offAtStart ? x.on === true : x.on !== false, pick: int(x.pick, 0, Math.max(0, sounds(id, style).length - 1), 0) };
    });
    while (PLAYERS.filter((id) => mus[id].on).length > MAX_PLAYERS) mus[[...PLAYERS].reverse().find((id) => mus[id].on)].on = false;
    const scenes = Array.isArray(r.scenes) ? r.scenes.filter((s) => sceneType(s)).slice(0, 24) : f.scenes;
    const parts = {};
    Object.entries((r.parts && typeof r.parts === 'object' && r.parts) || {}).forEach(([sc, row]) => {
      if (!sceneType(sc) || !row || typeof row !== 'object') return;
      PLAYERS.forEach((id) => {
        const v = row[id];
        if (v === 'off' || (typeof v === 'string' && motifs(id, style).includes(v))) (parts[sc] = parts[sc] || {})[id] = v;
      });
    });
    const edits = {};
    Object.entries((r.edits && typeof r.edits === 'object' && r.edits) || {}).forEach(([sc, row]) => {
      if (!sceneType(sc) || !row || typeof row !== 'object') return;
      PLAYERS.forEach((id) => {
        const v = cleanEdit(id, row[id]);
        if (v) (edits[sc] = edits[sc] || {})[id] = v;
      });
    });
    const chords = {};
    Object.entries((r.chords && typeof r.chords === 'object' && r.chords) || {}).forEach(([sc, list]) => {
      if (!sceneType(sc) || !Array.isArray(list)) return;
      const ok = list.filter(validRoman).slice(0, Math.min(CHORDS_MAX, barsOf(sc)));
      if (ok.length) chords[sc] = ok;
    });
    return { v: VERSION, style, tempo: int(r.tempo, TEMPO_MIN, TEMPO_MAX, f.tempo), tonic: int(r.tonic, 0, 11, 0), mode: r.mode === 'minor' ? 'minor' : 'major', mus, scenes, parts, edits, ...(Object.keys(chords).length ? { chords } : {}) };
  }

  /** Nom de la tonalité à l'écran : « Do majeur », « Do♯ mineur » (la tonique écrite comme dans SS.TONIC_NAMES). */
  function keyLabel(r) {
    const name = SS.TONIC_NAMES[r.mode][r.tonic];
    return `${SS.LETTER_FR[name[0]]}${name.slice(1)} ${r.mode === 'minor' ? 'mineur' : 'majeur'}`;
  }
  /** Nom d'une tonique pour la grille des 12 notes (Do, Do♯, Ré, Mi♭…). */
  const tonicLabel = (pc) => SS.NOTE_NAMES_FR[pc];

  /** Plan de la chanson (format SS.BandSongs) : la tonalité, les scènes choisies et leur ordre. */
  function spec(r) {
    const st = styleOf(r);
    const base = SS.BandSongs[st.preset] || plan(); // groove, croches… du modèle du style
    const sections = {};
    r.scenes.forEach((id) => {
      if (!sections[id]) sections[id] = secOf(r, id);
    });
    return { ...base, key: `${SS.TONIC_NAMES[r.mode][r.tonic]} ${r.mode}`, sections, form: r.scenes.join(' ') };
  }
  /** Une scène du plan : longueur de « Créer de zéro », jeux du style, accords du style ou choisis. */
  function secOf(r, id) {
    const st = styleOf(r);
    const sec = { ...plan().sections[id], ...(st.sec[id] || {}) };
    Object.keys(sec).forEach((k) => sec[k] === null && delete sec[k]);
    const ch = st.chords[r.mode] && st.chords[r.mode][id];
    if (ch) sec.chords = ch;
    const own = r.chords && r.chords[id];
    if (own && own.length) sec.chords = own.join(' | '); // accords choisis à l'écran Accords
    return sec;
  }

  /** Longueur d'une scène en mesures. */
  const barsOf = (id) => (plan().sections[id] || { bars: 4 }).bars;

  /** Accords d'une scène par leur nom (« Am | F | C | G »). */
  function chordsOf(r, id) {
    const sp = spec(r);
    const key = { tonic: SS.TONIC_NAMES[r.mode][r.tonic], mode: r.mode };
    const sec = sp.sections[id];
    if (!sec) return '';
    const n = String(sec.chords || '').split('|').length; // une mesure par accord écrit : la grille une seule fois
    return SS.bandSong.spansOf(sec, key, n).map((s) => nameOf(r, s.chord, key)).join(' · ');
  }

  /* ---------- Accords d'une scène (écran Accords) ---------- */
  // Un accord est rangé en chiffre romain (« vi », « V7 », « bVII »), comme dans les plans de SS.BandSongs : il suit la
  // tonalité si on la change. La palette : les accords de la tonalité, puis quelques emprunts courants.
  const PALETTE = {
    major: { own: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'V7'], borrowed: ['bVII', 'iv', 'bVI', 'III'] },
    minor: { own: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII', 'V7'], borrowed: ['V', 'IV', 'bII', 'I'] },
  };
  const CHORDS_MAX = 8;
  const keyOf = (r) => ({ tonic: SS.TONIC_NAMES[r.mode][r.tonic], mode: r.mode });
  const MINORISH = /^(min|m7|m9|m6|madd9|madd4|dim|dim7|m7b5)$/;
  const SUFFIX_OF = { maj: '', min: '', 7: '7', m7: '7', maj7: 'maj7', dim: '°', m7b5: 'ø', dim7: 'dim7', 9: '9', m9: '9', 6: '6', m6: '6', sus2: 'sus2', sus4: 'sus4', add9: 'add9', madd9: 'add9', maj9: 'maj9' };
  /** Chiffre romain d'un accord rangé par degré (0–6), type et altération (format des grilles de js/harmony.js), ou null. */
  function romanOf(degree, type, acc = 0) {
    if (!(type in SUFFIX_OF) || degree < 0 || degree > 6) return null;
    const n = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree];
    return (acc < 0 ? 'b' : acc > 0 ? '#' : '') + (MINORISH.test(type) ? n.toLowerCase() : n) + SUFFIX_OF[type];
  }
  /** Un chiffre romain lisible par le plan (SS.bandSong.parseChord) ? */
  function validRoman(tok) {
    try {
      SS.bandSong.parseChord(tok, { tonic: 'C', mode: 'major' });
      return typeof tok === 'string' && !tok.includes('>') && !tok.includes('/');
    } catch (e) {
      return false;
    }
  }
  /** Nom d'un accord du plan (spansOf) : par son chiffre romain s'il en a un. */
  function nameOf(r, chord, key) {
    try {
      return chordName(r, chord.tok);
    } catch (e) {
      return SS.harmony.chordName(key, { ...chord, bassPc: chord.rootPc });
    }
  }
  /** Nom d'un accord dans la tonalité de la chanson (« Am », « B♭ », « G7 »). */
  function chordName(r, tok) {
    const key = keyOf(r);
    const c = SS.bandSong.parseChord(tok, key);
    const m = tok.match(/^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)/);
    try {
      // écrit sur la lettre du degré : ♭VII en Do = B♭ (pas A♯)
      return SS.harmony.makeChord(key, ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'].indexOf(m[2].toLowerCase()), c.type, m[1] === 'b' ? -1 : m[1] ? 1 : 0).name;
    } catch (e) {
      return SS.harmony.chordName(key, { ...c, bassPc: c.rootPc });
    }
  }
  /** Accords d'une scène, un par mesure (chiffres romains) : ceux choisis, sinon ceux du plan. */
  function chordList(r, id) {
    const sec = sceneType(id) && secOf(r, id);
    return sec ? String(sec.chords).split(/\s+/).filter((t) => t && t !== '|') : [];
  }
  /** Les accords de la scène ont-ils été changés ? */
  const chordsEdited = (r, id) => !!(r.chords && r.chords[id] && r.chords[id].length);
  /** Range les accords d'une scène (null : ceux du modèle). Au plus une mesure par accord, 8 au plus. */
  function setChords(r, id, toks) {
    r.chords = r.chords || {};
    const list = (toks || []).filter(validRoman).slice(0, Math.min(CHORDS_MAX, barsOf(id)));
    if (list.length) r.chords[id] = list;
    else delete r.chords[id];
  }
  /** Palette de l'écran Accords : { tok, name, numeral, borrowed }. */
  function palette(r) {
    const P = PALETTE[r.mode];
    return [...P.own.map((tok) => [tok, false]), ...P.borrowed.map((tok) => [tok, true])].map(([tok, borrowed]) => ({ tok, name: chordName(r, tok), numeral: tok.replace(/^b/, '♭').replace(/^#/, '♯'), borrowed }));
  }
  /** Grilles toutes prêtes de l'assistant (js/harmony.js), dans le mode de la chanson : { id, style, toks, names }. */
  function readyGrids(r) {
    return SS.harmony.progressions(keyOf(r)).map((pr) => {
      const toks = pr.seq.map(([d, t, a]) => romanOf(d, t, a || 0));
      return toks.every((t) => t && validRoman(t)) ? { id: pr.id, style: pr.style, toks, names: toks.map((t) => chordName(r, t)) } : null;
    }).filter(Boolean);
  }

  /** Options de piste (SS.newTrack) des musiciens présents, comme l'assistant les crée (band, levelKey pour le mixage). */
  function trackOpts(r) {
    const p = preset(r);
    const sty = styleOf(r);
    const out = [];
    PLAYERS.forEach((id) => {
      const st = r.mus[id];
      const mu = musician(kindOf(id), r);
      if (!st || !st.on || !mu) return;
      const color = B().ROLES[mu.role].color;
      const tag = (sound) => ({ style: sty.band, preset: p.id, musician: bandMuOf(id, r), key: mu.role + (sound ? ':' + sound : '') });
      const tok = (sounds(id, r)[st.pick] || sounds(id, r)[0]).tok;
      if (mu.kits) {
        mu.pieces.forEach((pc) => {
          const info = B().pieceOpts(tok, pc);
          out.push({ ...info.opts, name: info.label, color, band: tag(info.opts.sound), levelKey: `${tok}|${pc}` });
        });
      } else {
        const cat = catOf(mu);
        out.push({ ...B().choiceOpts(tok, cat), category: cat, arpOn: false, name: B().ROLES[mu.role].short + (isSecond(id) ? ' 2' : ''), color, band: tag(null), levelKey: `${mu.role}|${tok}|${cat}` });
      }
    });
    return out;
  }

  /** Chanson complète (projet StepSeq) : pistes, scènes, arrangement, mixage et mastering automatiques. null sans musicien ni scène. */
  function build(r, base = null) {
    const opts = trackOpts(r);
    if (!opts.length || !r.scenes.length) return null;
    const proj = SS.newProject();
    if (base) {
      proj.id = base.id;
      proj.title = base.title;
    }
    proj.tempo = r.tempo;
    proj.timeSig = [4, 4];
    const levelKeys = new Map();
    proj.tracks = opts.map((o) => {
      const t = SS.newTrack(o, proj);
      t.band = { ...o.band };
      levelKeys.set(t.id, o.levelKey);
      return t;
    });
    const mine = bassMotifs(r);
    if (mine.length && SS.myBass) SS.myBass.register(mine); // basse retouchée : le moteur la joue comme un motif écrit
    const sty = styleOf(r);
    const res = SS.bandSong.build(spec(r), sty.preset, proj.tracks, { sig: '4/4', parts: buildParts(r) });
    proj.scenes = res.scenes.map(({ spans, ...sc }) => sc); // eslint-disable-line no-unused-vars -- comme « Créer la chanson » (js/main.js)
    proj.scenes.forEach((sc) => sceneType(sc.sec || sc.id) && (sc.name = sceneType(sc.sec || sc.id).label)); // noms de l'écran (« Fin », pas « Outro »)
    proj.song = res.song;
    proj.playMode = 'song';
    proj.songLoop = false;
    SS.bandMix.mixTracks(proj.tracks, levelKeys, sty.band);
    SS.bandMix.mixMaster(proj, sty.band, SS.bandMix.driveFor(sty.preset, sty.band));
    proj.groove = { ...(proj.groove || { res: 0, swing: 0.5 }), human: 0.15 };
    proj.phone = JSON.parse(JSON.stringify(r));
    if (SS.myBass) mine.forEach((m) => SS.myBass.toProject(proj, m.id)); // ils voyagent avec la chanson (Grille)
    SS.loadScene(proj, proj.scenes[0].id, { commit: false });
    return proj;
  }


  /* ---------- Qui joue quoi : la partie de chaque musicien dans chaque type de scène ----------
   * Les motifs sont ceux de l'assistant : motifs de batterie du style pop (celui de « Créer de zéro », js/drum-patterns.js,
   * ★ = la nuance de la scène), modes de basse (js/bassmotifs.js, ★ de js/scenestars.js), motifs du Clavier
   * (js/keyboardist.js, Accords puis Arpèges, ★ du fichier de motifs). */
  /** Jeu de batterie du plan « Créer de zéro » (sec.drums) : son nom à l'écran. */
  const DRUM_PLAN = { hats: 'Charleston seul', main: 'Groove', full: 'Groove plein', break: 'Break', light: 'Léger' };
  const drumList = (x) => SS.DRUM_PATTERNS[styleOf(x).drums] || [];
  /** Nuance d'une scène pour la batterie : 1 calme, 2 moyen, 3 intense (comme l'étape Batterie de l'assistant). */
  const energyOf = (sc) => (sc === 'intro' || sc === 'outro' ? 1 : sc === 'chorus' ? 3 : 2);

  /** Motif du Clavier jouable en 4/4 (les chansons du téléphone sont en 4/4). */
  const in44 = (id) => !SS.keyboardist.meterOf(id) || SS.keyboardist.meterOf(id) === '4/4';
  /** Tous les motifs d'un musicien, dans l'ordre du catalogue. */
  function motifs(mu0, x) {
    const mu = kindOf(mu0);
    if (mu === 'drums') return drumList(x).map((p) => p.id);
    if (mu === 'bass') return SS.bassMotifs ? SS.bassMotifs.inGroup(SS.bassMotifs.groupOfStyle(styleOf(x).band)).filter((id) => !SS.bassMotifs.isMine(id) && SS.bassMotifs.fits(id, 16)) : [];
    if (mu === 'keys') return SS.keyboardist ? [...SS.keyboardist.modesOf('acc'), ...SS.keyboardist.modesOf('arp')].filter(in44) : [];
    if (mu === 'pad') return SS.padMotifs ? SS.padMotifs.all().filter((id) => !SS.padMotifs.meterOf(id) || SS.padMotifs.meterOf(id) === '4/4') : [];
    return [];
  }
  /** ★ : les motifs conseillés pour ce musicien dans ce type de scène. */
  function stars(mu0, sc, x) {
    const mu = kindOf(mu0);
    if (mu === 'drums') return drumList(x).filter((p) => p.energy === energyOf(sc)).slice(0, 4).map((p) => p.id);
    if (mu === 'bass') return SS.sceneStars && SS.bassMotifs ? SS.sceneStars.sceneStars('bass', sc, styleOf(x).band, { ok: (id) => SS.bassMotifs.fits(id, 16) }) : [];
    if (mu === 'keys') {
      if (!SS.keyboardist) return [];
      const kst = (style) => [...SS.keyboardist.stars(sc, 'acc', style, in44), ...SS.keyboardist.stars(sc, 'arp', style, in44)];
      const own = styleOf(x).id === 'pop' ? [] : kst(styleOf(x).band); // les motifs du style d'abord (salsa, house…)
      return [...new Set([...own, ...kst('all')])].slice(0, 4);
    }
    if (mu === 'pad') return SS.sceneStars ? SS.sceneStars.sceneStars('chords', sc, styleOf(x).band, { ok: (id) => motifs('pad').includes(id) }) : [];
    return [];
  }
  /** Nom d'un motif. */
  function motifName(mu0, id, x) {
    const mu = kindOf(mu0);
    if (mu === 'drums') return (drumList(x).find((p) => p.id === id) || { name: id }).name;
    if (mu === 'bass') return SS.bassMotifs ? SS.bassMotifs.name(id) : id;
    if (mu === 'keys') return SS.keyboardist ? SS.keyboardist.name(id) : id;
    if (mu === 'pad') return SS.padMotifs ? SS.padMotifs.name(id) : id;
    return id;
  }
  /** Ce que joue le plan pour ce musicien dans ce type de scène : { id, name } ; id null si le musicien ne joue pas. */
  function planPart(mu0, sc, x) {
    const mu = kindOf(mu0);
    if (isSecond(mu0)) {
      // le second d'un type : le premier ★ de la scène qui ne double pas le premier musicien
      const main = planPart(mu, sc, x).id;
      const st = stars(mu, sc, x);
      const id = st.find((m) => m !== main) || st[0] || main || motifs(mu, x)[0];
      return id ? { id, name: motifName(mu, id, x) } : { id: null, name: 'Ne joue pas' };
    }
    const sec = sceneType(sc) ? secOf(typeof x === 'object' && x ? x : { style: styleOf(x).id, mode: 'major', scenes: [] }, sc) : {};
    const m = mu === 'drums' ? sec.drums : mu === 'bass' ? sec.bass : mu === 'pad' ? sec.pad : sec.keys;
    if (!m) return { id: null, name: 'Ne joue pas' };
    return { id: m, name: mu === 'drums' ? DRUM_PLAN[m] || m : motifName(mu, m, x) };
  }
  /** Partie choisie : un motif, 'off', ou null (celle du plan). */
  const partOf = (r, mu, sc) => (r.parts && r.parts[sc] && r.parts[sc][mu]) || null;
  /** Partie à l'écran : { id (motif, 'off' ou null : plan), name, plays }. */
  function partLabel(r, mu, sc) {
    const p = partOf(r, mu, sc);
    if (p === 'off') return { id: 'off', name: 'Ne joue pas', plays: false };
    if (p) return { id: p, name: motifName(mu, p, r), plays: true };
    const pl = planPart(mu, sc, r);
    return { id: null, name: pl.name, plays: !!pl.id };
  }
  /** Choisit la partie (motif, 'off' ou null pour revenir au plan). */
  function setPart(r, mu, sc, v) {
    setEdit(r, mu, sc, null); // un autre motif : la retouche est oubliée
    r.parts = r.parts || {};
    const row = { ...(r.parts[sc] || {}) };
    if (v) row[mu] = v;
    else delete row[mu];
    if (Object.keys(row).length) r.parts[sc] = row;
    else delete r.parts[sc];
  }
  /** Types de scène de la chanson, dans l'ordre de leur première apparition. */
  const sceneTypes = (r) => [...new Set(r.scenes)];

  /** Réglages par scène pour SS.bandSong.build (option parts). */
  function buildParts(r) {
    const out = {};
    const seconds = PLAYERS.filter((id) => isSecond(id) && r.mus[id] && r.mus[id].on);
    // un second musicien joue toujours une partie dite (sinon le moteur lui donnerait celle du premier)
    const types = new Set([...Object.keys(r.parts || {}), ...Object.keys(r.edits || {}), ...(seconds.length ? r.scenes : [])]);
    types.forEach((sc) => {
      const row = (r.parts && r.parts[sc]) || {};
      const ed = (r.edits && r.edits[sc]) || {};
      const p = {};
      const off = [];
      const inst = (id, v) => ((p.inst = p.inst || {})[instOf(id, r)] = v);
      PLAYERS.forEach((id) => {
        const kind = kindOf(id);
        const mu = musician(kind, r);
        if (!mu || !mu.role || !r.mus[id] || !r.mus[id].on) return;
        const v = row[id];
        if (kind === 'drums') {
          if (v === 'off') return off.push(mu.role);
          const e = ed[id];
          if (e) p.drums = { pattern: v || drumList(r)[0].id, style: styleOf(r).drums, edits: { bars: 1, ...e } };
          else if (v) p.drums = { pattern: v, style: styleOf(r).drums };
          return;
        }
        if (v === 'off') return inst(id, { off: true }); // seul ce musicien se tait (pas l'autre du même type)
        const e = ed[id];
        const m = v || (isSecond(id) ? planPart(id, sc, r).id : null);
        if (kind === 'bass' && e) inst(id, { mode: bassId(e) });
        else if (kind === 'keys' && e) inst(id, { mode: m || planPart(id, sc, r).id || 'sustain', keys: { pat: e } });
        else if (m) inst(id, { mode: m });
        else if (isSecond(id)) inst(id, { off: true });
      });
      if (off.length) p.off = off;
      if (Object.keys(p).length) out[sc] = p;
    });
    return out;
  }

  /* ---------- Pas : la partie retouchée (une mesure de 16 pas) ---------- */
  const STEPS = 16;
  /** Pistes de batterie de l'écran Pas : [lettre de la grille de l'assistant, son du kit, nom]. */
  const DRUM_LANES = [['K', 'bd', 'Grosse caisse'], ['S', 'sd', 'Caisse claire'], ['H', 'hh', 'Charleston'], ['O', 'oh', 'Charleston ouvert']];
  /** Lignes de la basse dans l'écran Pas (de l'aigu au grave), par rapport à l'accord en cours (noms de js/mybass.js). */
  const BASS_ROWS = [12, 's', 7, 5, 't', 0, -5];
  const rowName = (v) => ((SS.myBass && SS.myBass.ROWS.find((x) => x[0] === v)) || [v, String(v)])[1];
  /** Jetons de la main gauche du Clavier (les autres sont ceux de la main droite). */
  const isLH = (t) => /^(B|b|O|F|L[1358])$/.test(t);

  function cleanEdit(mu0, v) {
    const mu = kindOf(mu0);
    if (mu === 'drums') {
      if (!v || typeof v !== 'object') return null;
      const out = {};
      DRUM_LANES.forEach(([k]) => (out[k] = typeof v[k] === 'string' && /^[xo.r-]{16}$/.test(v[k]) ? v[k] : '-'.repeat(STEPS)));
      return out;
    }
    if (mu === 'bass') return Array.isArray(v) && SS.myBass ? SS.myBass.cleanNotes(v, STEPS, 1) : null;
    if (mu === 'keys') return SS.keyboardist && SS.keyboardist.parsePat(v) ? v.trim().split(/\s+/).join(' ') : null;
    return null;
  }
  /** Identifiant du motif de basse écrit d'après ses notes (le même pour les mêmes notes, sur le téléphone comme sur l'ordinateur). */
  function bassId(notes) {
    const txt = JSON.stringify(notes);
    let h = 2166136261;
    for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619);
    return 'my_tel' + (h >>> 0).toString(36);
  }
  /** Motifs de basse écrits d'une recette ({ id, name, meter, notes }), à faire connaître au moteur avant la construction. */
  function bassMotifs(r) {
    return Object.entries(r.edits || {}).flatMap(([sc, e]) => ['bass', 'bass2'].filter((id) => e[id]).map((id) => ({ id: bassId(e[id]), name: `${sceneType(sc).label}${isSecond(id) ? ' 2' : ''} (téléphone)`, meter: '4/4', notes: e[id] })));
  }

  /** Partie retouchée de ce musicien dans ce type de scène, ou null. */
  const editOf = (r, mu, sc) => (r.edits && r.edits[sc] && r.edits[sc][mu]) || null;
  /** Range la partie retouchée (null : on revient au motif). */
  function setEdit(r, mu, sc, v) {
    r.edits = r.edits || {};
    const row = { ...(r.edits[sc] || {}) };
    const c = v == null ? null : cleanEdit(mu, v);
    if (c) row[mu] = c;
    else delete row[mu];
    if (Object.keys(row).length) r.edits[sc] = row;
    else delete r.edits[sc];
  }

  /**
   * Point de départ de l'écran Pas : ce que joue la partie choisie (motif ou modèle), en une mesure. Batterie : { K, S, H, O } ;
   * basse : notes ; clavier : 16 pas (textes, '' = rien). La partie déjà retouchée l'emporte.
   */
  function startEdit(r, mu0, sc) {
    const mu = kindOf(mu0);
    const e = editOf(r, mu0, sc);
    if (mu === 'keys') return e ? SS.keyboardist.stepsOf(null, e) : SS.keyboardist.startSteps(partLabel(r, mu0, sc).plays ? partOf(r, mu0, sc) || planPart(mu0, sc, r).id : null);
    if (e) return JSON.parse(JSON.stringify(e));
    const p = partLabel(r, mu0, sc);
    if (mu === 'bass') return p.plays && SS.myBass ? SS.myBass.fromMotif(partOf(r, mu0, sc) || planPart(mu0, sc, r).id).filter((n) => n[0] < STEPS).map((n) => [n[0], Math.min(n[1], STEPS - n[0]), n[2], n[3]]) : [];
    const empty = Object.fromEntries(DRUM_LANES.map(([k]) => [k, '-'.repeat(STEPS)]));
    if (!p.plays) return empty;
    const pat = partOf(r, mu0, sc) && SS.drumPattern(styleOf(r).drums, partOf(r, mu0, sc));
    if (pat) return Object.fromEntries(DRUM_LANES.map(([k]) => [k, (pat.lanes[k] || '').padEnd(STEPS, '-').slice(0, STEPS).replace(/[^xo.r-]/g, '-')]));
    // jeu du modèle (généré, sans motif écrit) : la première mesure de la scène construite
    const proj = build({ ...r, mus: { ...r.mus, drums: { ...r.mus.drums, on: true } }, scenes: [sc] });
    const scene = proj && proj.scenes[0];
    if (!scene) return empty;
    const lv = (v) => (!v ? '-' : v > 0.8 ? 'x' : v > 0.55 ? 'o' : '.');
    return Object.fromEntries(DRUM_LANES.map(([k, snd]) => {
      const t = proj.tracks.find((x) => x.type === 'drum' && x.band && x.band.key === 'drums:' + snd);
      const st = (t && scene.data[t.id] && scene.data[t.id].steps) || [];
      return [k, Array.from({ length: STEPS }, (_, i) => lv(st[i])).join('')];
    }));
  }

  /** Accord joué au pas `step` (depuis le début de la scène) : { rootPc, type, name }. */
  function chordAt(r, sc, step) {
    const sec = spec(r).sections[sc];
    if (!sec) return null;
    const key = { tonic: SS.TONIC_NAMES[r.mode][r.tonic], mode: r.mode };
    const sp = SS.bandSong.spansOf(sec, key, barsOf(sc));
    const s = sp.find((x) => step >= x.step && step < x.step + x.len) || sp[0];
    return s ? { rootPc: s.chord.rootPc, type: s.chord.type, name: nameOf(r, s.chord, key) } : null;
  }
  /** Demi-tons d'une ligne de basse au-dessus de la fondamentale de l'accord ('t' tierce, 's' septième). */
  function rowSemis(row, chord) {
    const minor = !!chord && /^(min|dim|m7|m$)/.test(chord.type || '');
    if (row === 't') return minor ? 3 : 4;
    if (row === 's') return chord && /maj7/.test(chord.type || '') ? 11 : 10;
    return typeof row === 'number' ? row : 0;
  }

  /**
   * Pose ou retire une note de basse (une note par pas ; elle tient jusqu'à la suivante, un temps au plus). keep : la note
   * est posée même si elle y était déjà (jeu au doigt enregistré).
   */
  function toggleBass(notes, step, row, { vel = 0.8, keep = false } = {}) {
    const had = notes.find((n) => n[0] === step);
    let out = notes.filter((n) => n[0] !== step);
    if (keep || !had || had[2] !== row) out.push([step, 1, row, had ? had[3] : vel]);
    out = out.sort((a, b) => a[0] - b[0]);
    return out.map((n, i) => {
      const next = i + 1 < out.length ? out[i + 1][0] : STEPS;
      const len = n[0] === step ? Math.min(4, next - n[0]) : Math.min(n[1], next - n[0]);
      return [n[0], Math.max(1, len), n[2], n[3]];
    });
  }
  /**
   * Pose ou retire l'accord (main droite) ou la basse (main gauche) du Clavier à un pas. tok : le jeton posé (C accord,
   * c accord court, B basse, O octave…) ; keep : il remplace celui de la même main au lieu de l'enlever (jeu au doigt).
   */
  function toggleKeys(steps, step, hand, { tok = hand === 'lh' ? 'B' : 'C', keep = false } = {}) {
    const toks = steps[step] ? steps[step].split('+') : [];
    const mine = toks.filter((t) => (hand === 'lh' ? isLH(t) : !isLH(t)));
    const rest = toks.filter((t) => !mine.includes(t));
    const next = mine.length && !keep ? rest : [...rest, tok];
    const out = steps.slice();
    out[step] = next.join('+');
    return out;
  }
  /** Les 16 pas du Clavier en motif réécrit (texte). */
  const keysPat = (steps) => SS.keyboardist.patText(steps);


  /* ---------- Chanson existante → recette (modifier sur le téléphone) ----------
   * Une chanson faite sur l'ordinateur avec l'assistant se reprend sur le téléphone si le téléphone sait la refaire :
   * des musiciens de l'assistant parmi batterie, basse et clavier seulement (aucune piste ajoutée à la main), en 4/4, une
   * seule tonalité (majeure ou mineure), des scènes des cinq types du téléphone. Les sons, l'ordre des scènes et, si le
   * brouillon de l'assistant est rangé dans la chanson, les motifs choisis (et motifs réécrits) sont repris ; le mix et
   * les effets réglés sur l'ordinateur ne le sont pas (la chanson est refaite).
   */
  /** Hauteur (0..11) d'un nom de tonique (« D », « F♯ », « Bb »), ou null. */
  function tonicPc(name) {
    if (typeof name !== 'string' || !(name[0] in SS.LETTER_PC)) return null;
    const acc = name.slice(1).replace('#', '♯').replace('b', '♭');
    const d = acc === '♯' ? 1 : acc === '♭' ? -1 : acc === '' ? 0 : null;
    return d == null ? null : (((SS.LETTER_PC[name[0]] + d) % 12) + 12) % 12;
  }
  /** Son de la liste du musicien que joue une piste de la chanson (indice dans sounds), 0 si introuvable. */
  function pickOf(id, tracks, x) {
    const list = sounds(id, x);
    if (id === 'drums') {
      const t = tracks.find((x) => x.sound === 'bd') || tracks[0];
      const i = list.findIndex((s) => {
        const o = B().pieceOpts(s.tok, t.sound).opts;
        return o.source === t.source && o.machine === t.machine && (o.bank || null) === (t.bank || null);
      });
      return Math.max(0, i);
    }
    return Math.max(0, list.findIndex((s) => B().choiceOpts(s.tok, catOf(musician(id, x))).instrument === tracks[0].instrument));
  }
  /**
   * Recette d'une chanson (JSON enregistré, avant SS.normalizeProject) : celle du téléphone si elle y est rangée, sinon
   * celle d'une chanson de l'assistant compatible (voir plus haut) ; null si le téléphone ne sait pas la refaire.
   * Retourne { recipe, phone } : phone vrai pour une chanson faite sur le téléphone.
   */
  /** Musicien d'une piste construite (drums, bass, keys), ou null. */
  const roleOf = (t) => (t && t.band && typeof t.band.key === 'string' ? t.band.key.split(':')[0] : null);

  /**
   * Écoute seulement : coupe (M) ou isole (S) des musiciens dans une chanson construite, sans toucher à la recette.
   * mix : { mute: ['bass'], solo: ['drums'] }.
   */
  function listenMix(proj, mix) {
    const mute = (mix && mix.mute) || [];
    const solo = (mix && mix.solo) || [];
    (proj && proj.tracks ? proj.tracks : []).forEach((t) => {
      const id = playerOfTrack(t);
      t.mute = !!id && mute.includes(id);
      t.solo = !!id && solo.includes(id);
    });
    return proj;
  }

  function fromProject(d) {
    if (!d || typeof d !== 'object') return null;
    const own = clean(d.phone);
    if (own) return { recipe: own, phone: true };
    const ts = d.timeSig || [4, 4];
    if (ts[0] !== 4 || ts[1] !== 4 || !Array.isArray(d.tracks) || !d.tracks.length || !Array.isArray(d.scenes) || !Array.isArray(d.song) || !d.song.length) return null;
    const byMu = {};
    const bandMu = {}; // identifiant du musicien sur ses pistes (x5 pour un musicien ajouté de l'assistant)
    for (const t of d.tracks) {
      const role = roleOf(t);
      if (!MUSICIANS.some((m) => m.id === role) || (role === 'drums') !== (t.type === 'drum')) return null; // autre musicien, ou piste de la Grille
      const id = playerOfTrack(t);
      const bm = (t.band && t.band.musician) || role;
      if (bandMu[id] && bandMu[id] !== bm) return null; // trois musiciens du même type
      if (id === 'drums2') return null; // deux batteries
      bandMu[id] = bm;
      (byMu[id] = byMu[id] || []).push(t);
    }
    if (byMu.bass2 && !byMu.bass) (byMu.bass = byMu.bass2), (bandMu.bass = bandMu.bass2), delete byMu.bass2;
    if (byMu.keys2 && !byMu.keys) (byMu.keys = byMu.keys2), (bandMu.keys = bandMu.keys2), delete byMu.keys2;
    if (byMu.pad2 && !byMu.pad) (byMu.pad = byMu.pad2), (bandMu.pad = bandMu.pad2), delete byMu.pad2;
    if (Object.keys(byMu).length > MAX_PLAYERS) return null;
    const sceneOf = (id) => d.scenes.find((x) => x && x.id === id);
    const used = d.song.map((b) => sceneOf(b && b.scene));
    if (used.some((sc) => !sc || !sceneType(sc.sec))) return null;
    const keys = [...new Set(used.map((sc) => JSON.stringify(sc.key || {})))];
    if (keys.length !== 1) return null; // changement de tonalité
    const key = used[0].key || {};
    const tonic = tonicPc(key.tonic);
    if (tonic == null || !['major', 'minor'].includes(key.mode)) return null;
    // style : celui du modèle de l'assistant s'il en est un (Dance : EDM « levels », Latino : salsa « Calle »), sinon Pop rock
    const tb = d.tracks.find((t) => t.band && t.band.style) || {};
    const st = STYLES.find((x) => tb.band && x.band === tb.band.style && x.preset === tb.band.preset) || STYLES[0];
    const r = fresh(st.id);
    r.tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(+d.tempo || r.tempo)));
    r.tonic = tonic;
    r.mode = key.mode;
    PLAYERS.forEach((id) => (r.mus[id] = byMu[id] ? { on: true, pick: pickOf(kindOf(id), byMu[id], r) } : { on: false, pick: 0 }));
    r.scenes = d.song.flatMap((b) => Array.from({ length: Math.max(1, Math.min(8, Math.round(+b.repeat || 1))) }, () => sceneOf(b.scene).sec)).slice(0, 24);
    // motifs choisis dans l'assistant (brouillon rangé dans la chanson)
    const wp = d.wizard && d.wizard.state && d.wizard.state.w && d.wizard.state.w.parts;
    if (wp && typeof wp === 'object') {
      sceneTypes(r).forEach((sc) => {
        const x = wp[sc];
        if (!x || typeof x !== 'object') return;
        const off = Array.isArray(x.off) ? x.off : [];
        const inst = (x.inst && typeof x.inst === 'object' && x.inst) || {};
        const entryOf = (mu) => Object.entries(inst).find(([k]) => k.split(':')[0] === bandMu[mu]);
        PLAYERS.forEach((mu) => {
          if (!r.mus[mu].on) return;
          const kind = kindOf(mu);
          const extra = /^x\d+$/.test(bandMu[mu] || '');
          if (!extra && off.includes(musician(kind, r).role)) return setPart(r, mu, sc, 'off');
          if (kind === 'drums') {
            const dp = x.drums || {};
            if (dp.pattern && motifs('drums', r).includes(dp.pattern)) setPart(r, mu, sc, dp.pattern);
            const ed = dp.edits;
            if (ed && DRUM_LANES.every(([k]) => !ed[k] || (typeof ed[k] === 'string' && ed[k].length === STEPS))) setEdit(r, mu, sc, ed);
            return;
          }
          const e = entryOf(mu);
          if (!e) return;
          const o = e[1] || {};
          if (o.off) return setPart(r, mu, sc, 'off');
          if (o.mode && motifs(mu, r).includes(o.mode)) setPart(r, mu, sc, o.mode);
          if (kind === 'keys' && o.keys && SS.keyboardist && SS.keyboardist.parsePat(o.keys.pat)) setEdit(r, mu, sc, o.keys.pat);
          const mine = kind === 'bass' && o.mode && d.bassMotifs && d.bassMotifs[o.mode];
          if (mine && SS.myBass) {
            const notes = SS.myBass.cleanNotes(mine.notes, STEPS, 1);
            if (notes.length) setEdit(r, mu, sc, notes);
          }
        });
      });
    }
    return { recipe: clean(r), phone: false };
  }

  /** Durée de la chanson en secondes. */
  function seconds(r) {
    const bars = r.scenes.reduce((a, id) => a + barsOf(id), 0);
    return Math.round((bars * 4 * 60) / r.tempo);
  }

  return { STYLES, styleOf, MUSICIANS, PLAYERS, MAX_PLAYERS, kindOf, isSecond, playerInfo, players, canAdd, addPlayer, removePlayer, hasEdits, playerOfTrack, SCENES, TEMPO_MIN, TEMPO_MAX, sceneType, sounds, fresh, clean, keyLabel, tonicLabel, spec, barsOf, chordsOf, trackOpts, build, seconds, motifs, stars, motifName, planPart, partLabel, setPart, sceneTypes, buildParts, energyOf, STEPS, DRUM_LANES, BASS_ROWS, rowName, isLH, editOf, setEdit, startEdit, chordAt, rowSemis, toggleBass, toggleKeys, keysPat, bassId, fromProject, listenMix, CHORDS_MAX, romanOf, validRoman, chordName, chordList, chordsEdited, setChords, palette, readyGrids };
})();
