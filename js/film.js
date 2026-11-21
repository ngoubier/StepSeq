/*
 * Musique de film (tuile 🎬 de « Nouvelle chanson ») : des repères de l'image au plan de chanson.
 *
 * Une scène de film = { start, end, cues: [{ t, emo, name, ten, ene, sync }], bpm? } :
 *   start / end : entrée et fin de la musique (secondes de l'image) ; chaque repère (cue) ouvre un passage ;
 *   emo : émoticône (EMOS) ; ten / ene : tension et énergie sonore, de 1 à 5 ; sync : synchro forte (le tempo est calé
 *   pour qu'elle tombe sur le premier temps d'une mesure) ; bpm : tempo choisi (sinon le meilleur tempo calé).
 *   Un repère peut aussi porter grid (grille exacte, degrés de js/harmony.js), gridBars (sa longueur) et theme (notes
 *   imposées [mesure, temps, midi, durée en temps]) : c'est le cas du modèle « La lumière revient ».
 *
 *   timing(film)  → { bpm, target, options, sync, marks, sections, bars, seconds } : tempo calé et mesure de chaque repère
 *   spec(film)    → plan de chanson au format de js/band-songs.js (une section par passage, énergie, émotion, grille, thème)
 *   tempoOf(bars, seconds, beats = 4) → BPM = 60 × noires ÷ secondes
 *
 * Fonctions pures (aucun DOM) : tests/film.test.js.
 */
window.SS = window.SS || {};

SS.film = (() => {
  /** Émoticônes → émotion de l'application (js/emotions.js) et tempo typique d'un passage. */
  const EMOS = [
    { e: '😢', id: 'tristesse', label: 'Tristesse', bpm: 60 },
    { e: '😔', id: 'nostalgie', label: 'Nostalgie', bpm: 72 },
    { e: '😬', id: 'suspense', label: 'Suspense', bpm: 90 },
    { e: '😱', id: 'angoisse', label: 'Peur', bpm: 140 },
    { e: '😡', id: 'angoisse', label: 'Colère', bpm: 140 },
    { e: '🥹', id: 'espoir', label: 'Espoir', bpm: 84 },
    { e: '🦸', id: 'triomphe', label: 'Héroïsme', bpm: 120 },
    { e: '😮', id: 'emerveillement', label: 'Émerveillement', bpm: 76 },
    { e: '😌', id: 'serenite', label: 'Apaisement', bpm: 66 },
    { e: '🙂', id: 'joie', label: 'Joie', bpm: 108 },
  ];
  const emoOf = (e) => EMOS.find((x) => x.e === e) || EMOS[1];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const lvl = (n) => clamp(Math.round(Number(n) || 3), 1, 5);
  /** Énergie sonore (1–5) → énergie du plan (0,78 calme … 1 sommet ; js/orchestra.js en tire la densité). */
  const energyOf = (n) => +(0.78 + (lvl(n) - 1) * 0.055).toFixed(3);
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 240;
  const tempoOf = (bars, seconds, beats = 4) => (60 * bars * beats) / seconds;

  /** Temps lisible : 42 → « 00:42 », 41.25 → « 00:41,3 ». */
  function fmt(t) {
    const s = Math.max(0, Math.round(t * 10) / 10);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    const whole = Math.floor(r);
    const dec = Math.round((r - whole) * 10);
    return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}${dec ? ',' + dec : ''}`;
  }

  /** Repères triés ; le premier ouvre la musique (start), aucun après la fin. */
  function cuesOf(film) {
    const start = film.start || 0;
    const end = Math.max(start + 1, film.end || start + 30);
    const cs = (film.cues || [])
      .map((c) => ({ ...c, t: Number(c.t) || 0 }))
      .filter((c) => c.t < end)
      .sort((a, b) => a.t - b.t);
    if (!cs.length) cs.push({ t: start, emo: '😔', name: 'Passage', ten: 2, ene: 2 });
    cs[0] = { ...cs[0], t: start };
    return { start, end, cues: cs.filter((c, i) => i === 0 || c.t > start) };
  }

  /**
   * Tempo calé et mesure de chaque repère. Avec une synchro forte, les tempos proposés font tomber la synchro pile sur le
   * premier temps d'une mesure (n mesures après l'entrée) ; le tempo de l'application est entier : l'écart restant (drift,
   * en secondes) est affiché. Sans synchro : le tempo moyen des émotions.
   */
  function timing(film, beats = 4) {
    const { start, end, cues } = cuesOf(film);
    const target = cues.reduce((a, c) => a + emoOf(c.emo).bpm, 0) / cues.length;
    const sync = cues.find((c, i) => i > 0 && c.sync) || null;
    let options = [];
    if (sync) {
      const dt = sync.t - start;
      const n0 = Math.max(1, Math.round((dt * target) / (60 * beats)));
      options = [n0 - 2, n0 - 1, n0, n0 + 1, n0 + 2]
        .filter((n) => n >= 1)
        .map((n) => {
          const exact = tempoOf(n, dt, beats);
          const bpm = Math.round(exact);
          return { bars: n, exact, bpm, drift: (n * beats * 60) / bpm - dt };
        })
        .filter((o) => o.bpm >= TEMPO_MIN && o.bpm <= TEMPO_MAX);
      // les trois plus proches du tempo des émotions, dans l'ordre des tempos
      options = options.sort((a, b) => Math.abs(a.exact - target) - Math.abs(b.exact - target)).slice(0, 3).sort((a, b) => a.bpm - b.bpm);
    }
    const best = options.length ? options.reduce((a, o) => (Math.abs(o.exact - target) < Math.abs(a.exact - target) ? o : a)) : null;
    const bpm = clamp(Math.round(film.bpm || (best ? best.bpm : target)), TEMPO_MIN, TEMPO_MAX);
    const barLen = (60 * beats) / bpm;
    // mesure de chaque repère : la plus proche, toujours après celle du repère d'avant
    const marks = [];
    cues.forEach((c, i) => {
      const at = i === 0 ? 0 : Math.max(marks[i - 1].bar + 1, Math.round((c.t - start) / barLen));
      marks.push({ ...c, bar: at, land: start + at * barLen, drift: start + at * barLen - c.t });
    });
    const bars = Math.max(marks[marks.length - 1].bar + 1, Math.round((end - start) / barLen));
    const sections = marks.map((m, i) => ({
      id: 'p' + (i + 1),
      name: m.name || emoOf(m.emo).label,
      startBar: m.bar,
      bars: (i + 1 < marks.length ? marks[i + 1].bar : bars) - m.bar,
      emo: m.emo,
      emotion: emoOf(m.emo).id,
      ten: lvl(m.ten),
      ene: lvl(m.ene),
      sync: !!m.sync,
      cue: m,
    }));
    return { bpm, target, options, best, sync, marks, sections, bars, seconds: bars * barLen, start, end, beats };
  }

  /* ---------- Harmonie d'un passage libre : une proposition de l'émotion, dans la tonalité de la scène ---------- */
  const TONICS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const TONICS_MAJ = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pcOfName = (t) => (PC[t[0]] + (t.includes('♯') ? 1 : t.includes('♭') ? -1 : 0) + 12) % 12;
  /** Grille d'un passage : les accords d'une proposition de l'émotion, un par mesure, répétés ; key : celle du passage. */
  function gridFor(emotion, key, bars) {
    const emo = SS.findEmotion ? SS.findEmotion(emotion) : null;
    const props = (emo && emo.proposals) || [];
    const fam = key.mode === 'minor' ? 'minor' : 'major';
    let p = props.find((x) => x.mode === fam);
    let k = key;
    if (!p && props.length) {
      // pas de proposition dans le mode de la scène : la relative (Fa majeur pour Ré mineur, et l'inverse)
      p = props.find((x) => x.mode === 'major' || x.mode === 'minor') || null;
      if (p) {
        const pc = (pcOfName(key.tonic) + (p.mode === 'major' ? 3 : 9)) % 12;
        k = { tonic: (p.mode === 'major' ? TONICS_MAJ : TONICS)[pc], mode: p.mode };
      }
    }
    const seq = p ? p.seq : fam === 'minor' ? [[0, 'min'], [5, 'maj'], [2, 'maj'], [6, 'maj']] : [[0, 'maj'], [4, 'maj'], [5, 'min'], [3, 'maj']];
    const per = bars >= 8 ? 2 : 1; // passages longs : deux mesures par accord
    const grid = [];
    for (let b = 0, i = 0; b < bars; b += per, i++) {
      const [degree, type] = seq[i % seq.length];
      grid.push({ step: b * 16, len: Math.min(per, bars - b) * 16, degree, type, acc: 0 });
    }
    return { grid, key: k.tonic === key.tonic && k.mode === key.mode ? null : `${k.tonic} ${k.mode}` };
  }

  /** Notes [mesure, temps, midi, durée en temps] → événements d'une section (pas de double croche, mesure 1 = startBar). */
  function themeEvents(notes, startBar, bars) {
    return notes
      .filter(([bar]) => bar - 1 >= startBar && bar - 1 < startBar + bars)
      .map(([bar, beat, midi, len]) => ({ step: (bar - 1 - startBar) * 16 + Math.round((beat - 1) * 4), len: Math.max(1, Math.round(len * 4)), notes: [midi], vel: 0.78 }));
  }

  /** Jeu des instruments d'un passage selon son énergie (format de js/band-songs.js). */
  function playOf(s) {
    const lead = s.ene >= 5 ? 'hook' : s.ene <= 1 ? 'long' : 'verse';
    return { drums: 'off', keys: s.ene >= 4 ? 'block4' : 'ballad', strings: s.ene <= 2 ? 'sustain' : 'swell', lead, fill: false };
  }

  /** Plan de chanson d'une scène de film (js/band-songs.js) : une section par passage, dans l'ordre. */
  function spec(film) {
    const tm = timing(film);
    const key = film.key || 'D minor';
    const [tonic, mode] = key.split(' ');
    const sections = {};
    tm.sections.forEach((s) => {
      const c = s.cue;
      const sec = { bars: s.bars, name: s.name, emotion: s.emotion, energy: energyOf(s.ene), tension: s.ten, ...playOf(s) };
      if (c.grid && c.gridBars === s.bars) sec.grid = c.grid.map((x) => ({ acc: 0, ...x }));
      else {
        const g = gridFor(s.emotion, { tonic, mode: mode || 'minor' }, s.bars);
        sec.grid = g.grid;
        if (g.key) sec.key = g.key;
      }
      if (film.theme && c.gridBars === s.bars) {
        const ev = themeEvents(film.theme, s.startBar, s.bars);
        if (ev.length) sec.theme = ev;
      }
      sections[s.id] = sec;
    });
    return { key, groove: 'slow', emotion: tm.sections[0].emotion, film: true, sections, form: tm.sections.map((s) => s.id).join(' ') };
  }

  /* ---------- Modèle « La lumière revient » : 16 mesures, 80 BPM, Ré mineur, synchro m. 13 = 00:42 ---------- */
  const C = (step, len, degree, type, bass) => ({ step, len, degree, type, acc: 0, ...(bass ? { bass } : {}) });
  const LUMIERE = {
    id: 'lumiere',
    title: 'La lumière revient',
    story: 'Un couloir dans le noir, une réplique, un relais électrique qui claque, puis la lumière revient.',
    key: 'D minor',
    start: 6,
    end: 54,
    bpm: 80,
    cues: [
      { t: 6, emo: '😔', name: 'Doute', ten: 2, ene: 1, gridBars: 4, grid: [C(0, 16, 0, 'madd9'), C(16, 16, 5, 'maj7'), C(32, 16, 2, 'maj', 4), C(48, 16, 6, 'sus2')] },
      { t: 18, emo: '😬', name: 'Réplique', ten: 3, ene: 1, gridBars: 4, grid: [C(0, 16, 0, 'madd9'), C(16, 16, 5, 'maj7'), C(32, 16, 3, 'madd9'), C(48, 16, 6, 'sus4')] },
      { t: 30, emo: '🥹', name: 'Espoir', ten: 4, ene: 3, gridBars: 4, grid: [C(0, 16, 0, 'madd9'), C(16, 16, 5, 'maj7'), C(32, 16, 2, 'maj', 4), C(48, 8, 6, 'sus4'), C(56, 8, 6, 'maj')] },
      { t: 42, emo: '😮', name: 'La lumière', ten: 1, ene: 5, sync: true, gridBars: 2, grid: [C(0, 16, 2, 'add9'), C(16, 16, 6, 'maj', 4)] },
      { t: 48, emo: '😌', name: 'Apaisement', ten: 1, ene: 2, gridBars: 2, grid: [C(0, 16, 0, 'm7'), C(16, 16, 0, '5')] },
    ],
    // le thème au piano : motif La–Fa–Mi (noire, noire, blanche), sommet La5 juste après la synchro
    theme: [[1, 1, 69, 1], [1, 2, 65, 1], [1, 3, 64, 2], [2, 2, 65, 1], [2, 3, 69, 2], [3, 1, 69, 2], [3, 3, 65, 1], [4, 2, 67, 1], [4, 3, 62, 2], [5, 1, 69, 1], [5, 2, 65, 1], [5, 3, 64, 2], [6, 1, 65, 2], [6, 3, 69, 1], [7, 1, 67, 1], [7, 2, 70, 1], [7, 3, 69, 0.5], [8, 3, 67, 2], [9, 1, 69, 1], [9, 2, 65, 1], [9, 3, 64, 1], [9, 4, 65, 1], [10, 1, 65, 1], [10, 2, 69, 1], [10, 3, 70, 2], [11, 1, 69, 1], [11, 2, 72, 1], [11, 3, 77, 2], [12, 1, 77, 2], [12, 3, 76, 1], [13, 1, 77, 2], [13, 3, 79, 1], [13, 4, 81, 1], [14, 1, 79, 2], [14, 3, 76, 2], [15, 1, 77, 1], [15, 2, 72, 1], [15, 3, 69, 2], [16, 1, 74, 3]],
  };

  /** Scène libre de départ : quatre passages, une synchro forte. */
  const blankScene = () => ({
    id: 'scene',
    title: 'Ma scène',
    key: 'D minor',
    start: 0,
    end: 40,
    bpm: null,
    cues: [
      { t: 0, emo: '😬', name: 'Attente', ten: 3, ene: 1 },
      { t: 10, emo: '😱', name: 'Le danger', ten: 5, ene: 3 },
      { t: 24, emo: '🦸', name: 'Le sursaut', ten: 2, ene: 5, sync: true },
      { t: 34, emo: '😌', name: 'Après', ten: 1, ene: 2 },
    ],
  });

  /** Copie modifiable d'une scène (repères, sans tempo imposé) : « Modifier les repères » du modèle. */
  const editable = (film) => JSON.parse(JSON.stringify({ ...film, id: 'scene', bpm: null }));

  /* ---------- Le style « Musique de film » (tuile 🎬 de « Nouvelle chanson ») ----------
   * Deux départs : le modèle « La lumière revient » (accords et thème écrits) et une scène libre. Pas de batterie :
   * un piano porte le thème, l'orchestre (js/orchestra.js) tient l'harmonie et la basse, plus dense quand l'énergie monte. */
  const THEME_PICK = 'piano vcsl_fmpiano gm_epiano1 vsco_flute gm_violin gm_cello';
  const ORCH = ['chamber', 'strings', 'winds', 'hybrid'];
  const KEYS_PICK = 'piano gm_epiano1 vcsl_fmpiano gm_celesta gm_orchestral_harp';
  const STYLE = (mu) => ({
    id: 'film',
    label: 'Musique de film',
    film: true,
    desc: 'La musique part de l’image : des repères, une émotion par passage, un tempo calé sur la synchro forte.',
    swing: 0,
    presets: [
      {
        id: 'lumiere',
        song: 'La lumière revient',
        artist: 'Modèle',
        year: '',
        tempo: 80,
        desc: 'Un couloir dans le noir, une réplique, un relais qui claque, puis la lumière revient à 00:42. 16 mesures en Ré mineur : thème au piano, cordes, cor et flûte.',
        musicians: [
          mu('lead', THEME_PICK, { label: 'Thème (piano)', note: 'Le motif La–Fa–Mi, puis le sommet La5 après la synchro' }),
          mu('orch', 'gm_violin', { label: 'Orchestre', orch: true, ens: ORCH.slice(), note: 'Harmonie et basse, plus dense quand l’énergie monte' }),
          mu('keys', KEYS_PICK, { label: 'Piano (accords)', optional: true }),
        ],
      },
      {
        id: 'scene',
        song: 'Ma scène',
        artist: 'Scène libre',
        year: '',
        tempo: timing(blankScene()).bpm,
        desc: 'Tes repères : ajoute des passages, donne-leur une émotion, une tension et une énergie, marque la synchro forte. Le tempo se cale tout seul.',
        musicians: [
          mu('lead', THEME_PICK, { label: 'Thème (piano)' }),
          mu('orch', 'gm_violin', { label: 'Orchestre', orch: true, ens: ORCH.slice() }),
          mu('keys', KEYS_PICK, { label: 'Piano (accords)', optional: true }),
        ],
      },
    ],
  });
  if (SS.BandSongs) {
    SS.BandSongs.lumiere = spec(LUMIERE);
    SS.BandSongs.scene = spec(blankScene());
  }
  if (SS.Band && SS.Band.addStyle) SS.Band.addStyle(STYLE(SS.Band.mu));

  return { EMOS, emoOf, energyOf, tempoOf, fmt, timing, spec, gridFor, themeEvents, LUMIERE, blankScene, editable, TEMPO_MIN, TEMPO_MAX };
})();
