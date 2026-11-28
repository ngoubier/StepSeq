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
    return { v: VERSION, tempo: int(r.tempo, TEMPO_MIN, TEMPO_MAX, f.tempo), tonic: int(r.tonic, 0, 11, 0), mode: r.mode === 'minor' ? 'minor' : 'major', mus, scenes, parts };
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
    Object.entries(r.parts || {}).forEach(([sc, row]) => {
      const p = {};
      const off = [];
      Object.entries(row).forEach(([mu, v]) => {
        const role = musician(mu) && musician(mu).role;
        if (!role) return;
        if (v === 'off') return off.push(role);
        if (mu === 'drums') p.drums = { pattern: v, style: DRUM_STYLE };
        else (p.inst = p.inst || {})[INST[mu]] = { mode: v };
      });
      if (off.length) p.off = off;
      if (Object.keys(p).length) out[sc] = p;
    });
    return out;
  }

  /** Durée de la chanson en secondes. */
  function seconds(r) {
    const bars = r.scenes.reduce((a, id) => a + barsOf(id), 0);
    return Math.round((bars * 4 * 60) / r.tempo);
  }

  return { MUSICIANS, SCENES, TEMPO_MIN, TEMPO_MAX, sceneType, sounds, fresh, clean, keyLabel, tonicLabel, spec, barsOf, chordsOf, trackOpts, build, seconds, motifs, stars, motifName, planPart, partLabel, setPart, sceneTypes, buildParts, energyOf };
})();
