/*
 * Nouvelle chanson sur téléphone (telephone.html, js/phone.js) : la recette de la chanson et sa construction, sans DOM.
 *
 * La recette tient en peu de choses : tempo, tonalité, musiciens (batterie, basse, clavier) et liste des scènes.
 * Elle est jouée par le même moteur que l'assistant « Nouvelle chanson » : le plan « Créer de zéro » (SS.BandSongs.zero,
 * ses parties par scène), SS.bandSong.build pour les notes, js/bandmix.js pour le mixage. La chanson obtenue est un projet
 * ordinaire : elle s'ouvre telle quelle dans la Grille. La recette y est rangée (project.phone) pour être reprise
 * sur le téléphone.
 *
 *   recipe = { v: 1, tempo, tonic: 0..11, mode: 'major' | 'minor', mus: { drums, bass, keys }, scenes: ['intro', 'verse', …] }
 *   mus[id] = { on, pick } : pick = indice du son dans la liste du musicien (SOUNDS)
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
  const PRESET = 'zero'; // inspiration « Créer de zéro » : son plan, ses musiciens et son mixage
  const VERSION = 1;
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 240;

  /** Les trois musiciens du téléphone, dans l'ordre de l'écran. */
  const MUSICIANS = [
    { id: 'drums', label: 'Batterie', icon: '🥁', color: 'var(--c-pink)' },
    { id: 'bass', label: 'Basse', icon: '🎸', color: 'var(--c-green)' },
    { id: 'keys', label: 'Clavier', icon: '🎹', color: 'var(--c-yellow)' },
  ];

  /** Types de scène proposés : ceux du plan « Créer de zéro ». minor : accords en mineur (le plan est écrit en majeur). */
  const SCENES = [
    { id: 'intro', label: 'Intro', color: 'var(--c-violet)', minor: 'i | VI | III | VII' },
    { id: 'verse', label: 'Couplet', color: 'var(--c-cyan)', minor: 'i | VI | III | VII' },
    { id: 'chorus', label: 'Refrain', color: 'var(--c-amber)', minor: 'VI | III | VII | i' },
    { id: 'bridge', label: 'Pont', color: 'var(--c-green)', minor: 'iv | VI | III | VII' },
    { id: 'outro', label: 'Fin', color: 'var(--c-pink)', minor: 'i | VI | VII | i' },
  ];
  const sceneType = (id) => SCENES.find((s) => s.id === id) || null;

  const preset = () => B().STYLES.find((s) => s.id === PRESET).presets[0];
  const musician = (id) => preset().musicians.find((m) => m.id === id);
  const plan = () => SS.BandSongs[PRESET];

  /**
   * Sons proposés pour un musicien : les kits de la batterie, les choix de la basse et du piano. Les synthés Juno (« j: »)
   * sont laissés de côté : ils sont trop lourds à calculer sur un téléphone.
   */
  function sounds(id) {
    const mu = musician(id);
    if (!mu) return [];
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

  /** Recette de départ : 100 BPM, Do majeur, les trois musiciens, la structure courte du plan. */
  function fresh() {
    return {
      v: VERSION,
      tempo: preset().tempo,
      tonic: 0,
      mode: 'major',
      mus: Object.fromEntries(MUSICIANS.map((m) => [m.id, { on: true, pick: 0 }])),
      scenes: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
      parts: {},
      edits: {},
    };
  }

  /** Recette lue (projet enregistré, fichier) : valeurs bornées, champs manquants remplacés ; null si inutilisable. */
  function clean(r) {
    if (!r || typeof r !== 'object' || r.v !== VERSION) return null;
    const f = fresh();
    const int = (x, lo, hi, d) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
    const mus = {};
    MUSICIANS.forEach((m) => {
      const x = (r.mus && r.mus[m.id]) || {};
      mus[m.id] = { on: x.on !== false, pick: int(x.pick, 0, Math.max(0, sounds(m.id).length - 1), 0) };
    });
    const scenes = Array.isArray(r.scenes) ? r.scenes.filter((s) => sceneType(s)).slice(0, 24) : f.scenes;
    const parts = {};
    Object.entries((r.parts && typeof r.parts === 'object' && r.parts) || {}).forEach(([sc, row]) => {
      if (!sceneType(sc) || !row || typeof row !== 'object') return;
      MUSICIANS.forEach(({ id }) => {
        const v = row[id];
        if (v === 'off' || (typeof v === 'string' && motifs(id).includes(v))) (parts[sc] = parts[sc] || {})[id] = v;
      });
    });
    const edits = {};
    Object.entries((r.edits && typeof r.edits === 'object' && r.edits) || {}).forEach(([sc, row]) => {
      if (!sceneType(sc) || !row || typeof row !== 'object') return;
      MUSICIANS.forEach(({ id }) => {
        const v = cleanEdit(id, row[id]);
        if (v) (edits[sc] = edits[sc] || {})[id] = v;
      });
    });
    return { v: VERSION, tempo: int(r.tempo, TEMPO_MIN, TEMPO_MAX, f.tempo), tonic: int(r.tonic, 0, 11, 0), mode: r.mode === 'minor' ? 'minor' : 'major', mus, scenes, parts, edits };
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
    const base = plan();
    const sections = {};
    r.scenes.forEach((id) => {
      if (sections[id]) return;
      const sec = { ...base.sections[id] };
      if (r.mode === 'minor') sec.chords = sceneType(id).minor;
      sections[id] = sec;
    });
    return { ...base, key: `${SS.TONIC_NAMES[r.mode][r.tonic]} ${r.mode}`, sections, form: r.scenes.join(' ') };
  }

  /** Longueur d'une scène en mesures. */
  const barsOf = (id) => (plan().sections[id] || { bars: 4 }).bars;

  /** Accords d'une scène par leur nom (« Am | F | C | G »). */
  function chordsOf(r, id) {
    const H = SS.harmony;
    const sp = spec(r);
    const key = { tonic: SS.TONIC_NAMES[r.mode][r.tonic], mode: r.mode };
    const sec = sp.sections[id];
    if (!sec) return '';
    const n = String(sec.chords || '').split('|').length; // une mesure par accord écrit : la grille une seule fois
    return SS.bandSong.spansOf(sec, key, n).map((s) => H.chordName(key, { ...s.chord, bassPc: s.chord.rootPc })).join(' · ');
  }

  /** Options de piste (SS.newTrack) des musiciens présents, comme l'assistant les crée (band, levelKey pour le mixage). */
  function trackOpts(r) {
    const p = preset();
    const out = [];
    MUSICIANS.forEach(({ id }) => {
      const st = r.mus[id];
      const mu = musician(id);
      if (!st || !st.on || !mu) return;
      const color = B().ROLES[mu.role].color;
      const tag = (sound) => ({ style: PRESET, preset: p.id, musician: mu.id, key: mu.role + (sound ? ':' + sound : '') });
      const tok = (sounds(id)[st.pick] || sounds(id)[0]).tok;
      if (mu.kits) {
        mu.pieces.forEach((pc) => {
          const info = B().pieceOpts(tok, pc);
          out.push({ ...info.opts, name: info.label, color, band: tag(info.opts.sound), levelKey: `${tok}|${pc}` });
        });
      } else {
        const cat = catOf(mu);
        out.push({ ...B().choiceOpts(tok, cat), category: cat, arpOn: false, name: B().ROLES[mu.role].short, color, band: tag(null), levelKey: `${mu.role}|${tok}|${cat}` });
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
    const res = SS.bandSong.build(spec(r), PRESET, proj.tracks, { sig: '4/4', parts: buildParts(r) });
    proj.scenes = res.scenes.map(({ spans, ...sc }) => sc); // eslint-disable-line no-unused-vars -- comme « Créer la chanson » (js/main.js)
    proj.scenes.forEach((sc) => sceneType(sc.sec || sc.id) && (sc.name = sceneType(sc.sec || sc.id).label)); // noms de l'écran (« Fin », pas « Outro »)
    proj.song = res.song;
    proj.playMode = 'song';
    proj.songLoop = false;
    SS.bandMix.mixTracks(proj.tracks, levelKeys, PRESET);
    SS.bandMix.mixMaster(proj, PRESET, SS.bandMix.driveFor(p0(), PRESET));
    proj.groove = { ...(proj.groove || { res: 0, swing: 0.5 }), human: 0.15 };
    proj.phone = JSON.parse(JSON.stringify(r));
    if (SS.myBass) mine.forEach((m) => SS.myBass.toProject(proj, m.id)); // ils voyagent avec la chanson (Grille)
    SS.loadScene(proj, proj.scenes[0].id, { commit: false });
    return proj;
  }
  const p0 = () => preset().id;


  /* ---------- Qui joue quoi : la partie de chaque musicien dans chaque type de scène ----------
   * Les motifs sont ceux de l'assistant : motifs de batterie du style pop (celui de « Créer de zéro », js/drum-patterns.js,
   * ★ = la nuance de la scène), modes de basse (js/bassmotifs.js, ★ de js/scenestars.js), motifs du Clavier
   * (js/keyboardist.js, Accords puis Arpèges, ★ du fichier de motifs). */
  const DRUM_STYLE = 'pop';
  /** Identifiant d'instrument de l'assistant (« musicien:clé », js/bandsong.js) : réglages parts[section].inst[id]. */
  const INST = { bass: 'bass:bass', keys: 'keys:keys' };
  /** Jeu de batterie du plan « Créer de zéro » (sec.drums) : son nom à l'écran. */
  const DRUM_PLAN = { hats: 'Charleston seul', main: 'Groove', full: 'Groove plein', break: 'Break', light: 'Léger' };
  const drumList = () => SS.DRUM_PATTERNS[DRUM_STYLE] || [];
  /** Nuance d'une scène pour la batterie : 1 calme, 2 moyen, 3 intense (comme l'étape Batterie de l'assistant). */
  const energyOf = (sc) => (sc === 'intro' || sc === 'outro' ? 1 : sc === 'chorus' ? 3 : 2);

  /** Motif du Clavier jouable en 4/4 (les chansons du téléphone sont en 4/4). */
  const in44 = (id) => !SS.keyboardist.meterOf(id) || SS.keyboardist.meterOf(id) === '4/4';
  /** Tous les motifs d'un musicien, dans l'ordre du catalogue. */
  function motifs(mu) {
    if (mu === 'drums') return drumList().map((p) => p.id);
    if (mu === 'bass') return SS.bassMotifs ? SS.bassMotifs.inGroup(SS.bassMotifs.groupOfStyle(PRESET)).filter((id) => !SS.bassMotifs.isMine(id) && SS.bassMotifs.fits(id, 16)) : [];
    if (mu === 'keys') return SS.keyboardist ? [...SS.keyboardist.modesOf('acc'), ...SS.keyboardist.modesOf('arp')].filter(in44) : [];
    return [];
  }
  /** ★ : les motifs conseillés pour ce musicien dans ce type de scène. */
  function stars(mu, sc) {
    if (mu === 'drums') return drumList().filter((p) => p.energy === energyOf(sc)).slice(0, 4).map((p) => p.id);
    if (mu === 'bass') return SS.sceneStars && SS.bassMotifs ? SS.sceneStars.sceneStars('bass', sc, PRESET, { ok: (id) => SS.bassMotifs.fits(id, 16) }) : [];
    if (mu === 'keys') return SS.keyboardist ? [...SS.keyboardist.stars(sc, 'acc', 'all', in44), ...SS.keyboardist.stars(sc, 'arp', 'all', in44)].slice(0, 4) : [];
    return [];
  }
  /** Nom d'un motif. */
  function motifName(mu, id) {
    if (mu === 'drums') return (drumList().find((p) => p.id === id) || { name: id }).name;
    if (mu === 'bass') return SS.bassMotifs ? SS.bassMotifs.name(id) : id;
    if (mu === 'keys') return SS.keyboardist ? SS.keyboardist.name(id) : id;
    return id;
  }
  /** Ce que joue le plan pour ce musicien dans ce type de scène : { id, name } ; id null si le musicien ne joue pas. */
  function planPart(mu, sc) {
    const sec = plan().sections[sc] || {};
    const m = mu === 'drums' ? sec.drums : mu === 'bass' ? sec.bass : sec.keys;
    if (!m) return { id: null, name: 'Ne joue pas' };
    return { id: m, name: mu === 'drums' ? DRUM_PLAN[m] || m : motifName(mu, m) };
  }
  /** Partie choisie : un motif, 'off', ou null (celle du plan). */
  const partOf = (r, mu, sc) => (r.parts && r.parts[sc] && r.parts[sc][mu]) || null;
  /** Partie à l'écran : { id (motif, 'off' ou null : plan), name, plays }. */
  function partLabel(r, mu, sc) {
    const p = partOf(r, mu, sc);
    if (p === 'off') return { id: 'off', name: 'Ne joue pas', plays: false };
    if (p) return { id: p, name: motifName(mu, p), plays: true };
    const pl = planPart(mu, sc);
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
    const types = new Set([...Object.keys(r.parts || {}), ...Object.keys(r.edits || {})]);
    types.forEach((sc) => {
      const row = (r.parts && r.parts[sc]) || {};
      const ed = (r.edits && r.edits[sc]) || {};
      const p = {};
      const off = [];
      MUSICIANS.forEach(({ id: mu }) => {
        const role = musician(mu) && musician(mu).role;
        const v = row[mu];
        if (!role) return;
        if (v === 'off') return off.push(role);
        const e = ed[mu];
        if (mu === 'drums') {
          if (e) p.drums = { pattern: v || drumList()[0].id, style: DRUM_STYLE, edits: { bars: 1, ...e } };
          else if (v) p.drums = { pattern: v, style: DRUM_STYLE };
        } else if (mu === 'bass' && e) (p.inst = p.inst || {})[INST.bass] = { mode: bassId(e) };
        else if (mu === 'keys' && e) (p.inst = p.inst || {})[INST.keys] = { mode: v || planPart(mu, sc).id || 'sustain', keys: { pat: e } };
        else if (v) (p.inst = p.inst || {})[INST[mu]] = { mode: v };
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

  function cleanEdit(mu, v) {
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
    return Object.entries(r.edits || {}).filter(([, e]) => e.bass).map(([sc, e]) => ({ id: bassId(e.bass), name: `${sceneType(sc).label} (téléphone)`, meter: '4/4', notes: e.bass }));
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
  function startEdit(r, mu, sc) {
    const e = editOf(r, mu, sc);
    if (mu === 'keys') return e ? SS.keyboardist.stepsOf(null, e) : SS.keyboardist.startSteps(partLabel(r, mu, sc).plays ? partOf(r, mu, sc) || planPart(mu, sc).id : null);
    if (e) return JSON.parse(JSON.stringify(e));
    const p = partLabel(r, mu, sc);
    if (mu === 'bass') return p.plays && SS.myBass ? SS.myBass.fromMotif(partOf(r, mu, sc) || planPart(mu, sc).id).filter((n) => n[0] < STEPS).map((n) => [n[0], Math.min(n[1], STEPS - n[0]), n[2], n[3]]) : [];
    const empty = Object.fromEntries(DRUM_LANES.map(([k]) => [k, '-'.repeat(STEPS)]));
    if (!p.plays) return empty;
    const pat = partOf(r, mu, sc) && SS.drumPattern(DRUM_STYLE, partOf(r, mu, sc));
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
    return s ? { rootPc: s.chord.rootPc, type: s.chord.type, name: SS.harmony.chordName(key, { ...s.chord, bassPc: s.chord.rootPc }) } : null;
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
  function pickOf(id, tracks) {
    const list = sounds(id);
    if (id === 'drums') {
      const t = tracks.find((x) => x.sound === 'bd') || tracks[0];
      const i = list.findIndex((s) => {
        const o = B().pieceOpts(s.tok, t.sound).opts;
        return o.source === t.source && o.machine === t.machine && (o.bank || null) === (t.bank || null);
      });
      return Math.max(0, i);
    }
    return Math.max(0, list.findIndex((s) => B().choiceOpts(s.tok, catOf(musician(id))).instrument === tracks[0].instrument));
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
      const role = roleOf(t);
      t.mute = !!role && mute.includes(role);
      t.solo = !!role && solo.includes(role);
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
    for (const t of d.tracks) {
      const role = roleOf(t);
      if (!MUSICIANS.some((m) => m.id === role) || (role === 'drums') !== (t.type === 'drum')) return null; // autre musicien, ou piste de la Grille
      (byMu[role] = byMu[role] || []).push(t);
    }
    const sceneOf = (id) => d.scenes.find((x) => x && x.id === id);
    const used = d.song.map((b) => sceneOf(b && b.scene));
    if (used.some((sc) => !sc || !sceneType(sc.sec))) return null;
    const keys = [...new Set(used.map((sc) => JSON.stringify(sc.key || {})))];
    if (keys.length !== 1) return null; // changement de tonalité
    const key = used[0].key || {};
    const tonic = tonicPc(key.tonic);
    if (tonic == null || !['major', 'minor'].includes(key.mode)) return null;
    const r = fresh();
    r.tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(+d.tempo || r.tempo)));
    r.tonic = tonic;
    r.mode = key.mode;
    MUSICIANS.forEach(({ id }) => (r.mus[id] = byMu[id] ? { on: true, pick: pickOf(id, byMu[id]) } : { on: false, pick: 0 }));
    r.scenes = d.song.flatMap((b) => Array.from({ length: Math.max(1, Math.min(8, Math.round(+b.repeat || 1))) }, () => sceneOf(b.scene).sec)).slice(0, 24);
    // motifs choisis dans l'assistant (brouillon rangé dans la chanson)
    const wp = d.wizard && d.wizard.state && d.wizard.state.w && d.wizard.state.w.parts;
    if (wp && typeof wp === 'object') {
      sceneTypes(r).forEach((sc) => {
        const x = wp[sc];
        if (!x || typeof x !== 'object') return;
        const off = Array.isArray(x.off) ? x.off : [];
        const inst = (x.inst && typeof x.inst === 'object' && x.inst) || {};
        const instOf = (mu) => Object.entries(inst).find(([k]) => k.split(':')[0] === mu);
        MUSICIANS.forEach(({ id: mu }) => {
          if (!r.mus[mu].on) return;
          if (off.includes(musician(mu).role)) return setPart(r, mu, sc, 'off');
          if (mu === 'drums') {
            const dp = x.drums || {};
            if (dp.pattern && motifs('drums').includes(dp.pattern)) setPart(r, mu, sc, dp.pattern);
            const ed = dp.edits;
            if (ed && DRUM_LANES.every(([k]) => !ed[k] || (typeof ed[k] === 'string' && ed[k].length === STEPS))) setEdit(r, mu, sc, ed);
            return;
          }
          const e = instOf(mu);
          if (!e) return;
          const o = e[1] || {};
          if (o.off) return setPart(r, mu, sc, 'off');
          if (o.mode && motifs(mu).includes(o.mode)) setPart(r, mu, sc, o.mode);
          if (mu === 'keys' && o.keys && SS.keyboardist && SS.keyboardist.parsePat(o.keys.pat)) setEdit(r, mu, sc, o.keys.pat);
          const mine = mu === 'bass' && o.mode && d.bassMotifs && d.bassMotifs[o.mode];
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

  return { MUSICIANS, SCENES, TEMPO_MIN, TEMPO_MAX, sceneType, sounds, fresh, clean, keyLabel, tonicLabel, spec, barsOf, chordsOf, trackOpts, build, seconds, motifs, stars, motifName, planPart, partLabel, setPart, sceneTypes, buildParts, energyOf, STEPS, DRUM_LANES, BASS_ROWS, rowName, isLH, editOf, setEdit, startEdit, chordAt, rowSemis, toggleBass, toggleKeys, keysPat, bassId, fromProject, listenMix };
})();
