/*
 * Musique de film (tuile 🎬 de « Nouvelle chanson ») : des repères de l'image au plan de chanson.
 *
 * Une scène de film = { start, end, cues: [{ t, emo, name, ten, ene, sync }], bpm? } :
 *   start / end : entrée et fin de la musique (secondes de l'image) ; chaque repère (cue) ouvre un passage ;
 *   emo : émotion du passage (EMOS, une couleur chacune) ; dlg : on y parle (la musique s'efface sous les mots) ; ten / ene : tension et énergie sonore, de 1 à 5 ; sync : synchro forte (le tempo est calé
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
  /**
   * Émotions d'un passage : couleur, émotion de l'application (js/emotions.js) et tempo typique.
   * Couleurs (associations les plus constantes des études couleur-émotion, Plutchik, Jonauskaite et al. 2020) :
   * tristesse bleu profond, nostalgie bleu-gris doux (sépia du souvenir, mais lisible sur fond sombre), suspense violet clair,
   * peur violet sombre, colère rouge, espoir vert tendre, héroïsme orange doré, émerveillement turquoise,
   * apaisement vert (paix, harmonie), joie jaune.
   */
  const EMOS = [
    { k: 'tristesse', id: 'tristesse', label: 'Tristesse', color: '#3f6fe0', bpm: 60 },
    { k: 'nostalgie', id: 'nostalgie', label: 'Nostalgie', color: '#8aa0d6', bpm: 72 },
    { k: 'suspense', id: 'suspense', label: 'Suspense', color: '#a98bff', bpm: 90 },
    { k: 'peur', id: 'angoisse', label: 'Peur', color: '#6b3cc9', bpm: 140 },
    { k: 'colere', id: 'angoisse', label: 'Colère', color: '#e5382f', bpm: 140 },
    { k: 'espoir', id: 'espoir', label: 'Espoir', color: '#9ad65a', bpm: 84 },
    { k: 'heroisme', id: 'triomphe', label: 'Héroïsme', color: '#ff9326', bpm: 120 },
    { k: 'emerveillement', id: 'emerveillement', label: 'Émerveillement', color: '#2fcfd6', bpm: 76 },
    { k: 'apaisement', id: 'serenite', label: 'Apaisement', color: '#2fb36d', bpm: 66 },
    { k: 'joie', id: 'joie', label: 'Joie', color: '#ffd23a', bpm: 108 },
  ];
  const emoOf = (k) => EMOS.find((x) => x.k === k) || EMOS[1];
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
    if (!cs.length) cs.push({ t: start, emo: 'nostalgie', name: 'Passage', ten: 2, ene: 2 });
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
      color: emoOf(m.emo).color,
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

  /* ---------- Harmonie de film : une technique par passage (scène libre) ----------
   * Chaque technique est une suite d'accords en degrés de la tonalité de la scène (format de js/harmony.js : degree,
   * type, acc = emprunt −1, bass = basse imposée en demi-tons au-dessus de la fondamentale), une par mode.
   * Un pas = une mesure ; [a, b] = deux accords dans la mesure (suspension puis résolution). */
  const HC = (degree, type, acc = 0, bass = 0) => ({ degree, type, acc, ...(bass ? { bass } : {}) });
  const HARMONY = [
    { k: 'pedal', label: 'Pédale', rule: 'la basse reste sur la tonique, les accords changent au-dessus', effect: 'attente, menace qui ne bouge pas',
      minor: [HC(0, 'min'), HC(5, 'maj', 0, 4), HC(3, 'min', 0, 7), HC(1, 'maj', -1, 11)], major: [HC(0, 'maj'), HC(3, 'maj', 0, 7), HC(6, 'maj', -1, 2), HC(3, 'min', 0, 7)] },
    { k: 'common', label: 'Note commune', rule: 'd’un accord à l’autre, au moins une note reste', effect: 'la lumière change sans rupture',
      minor: [HC(0, 'min'), HC(5, 'maj'), HC(3, 'min'), HC(1, 'maj', -1)], major: [HC(0, 'maj'), HC(2, 'min'), HC(5, 'min'), HC(3, 'maj')] },
    { k: 'mediant', label: 'Médiantes', rule: 'accords à une tierce, souvent hors de la gamme', effect: 'mystère, merveilleux',
      minor: [HC(0, 'min'), HC(2, 'min'), HC(0, 'min'), HC(5, 'min')], major: [HC(0, 'maj'), HC(2, 'maj'), HC(0, 'maj'), HC(5, 'maj', -1)] },
    { k: 'chrom', label: 'Séquence chromatique', rule: 'le même accord monte d’un demi-ton par mesure', effect: 'le danger approche',
      minor: [HC(0, 'min'), HC(1, 'min', -1), HC(1, 'min'), HC(2, 'min')], major: [HC(0, 'maj'), HC(1, 'maj', -1), HC(1, 'maj'), HC(2, 'maj', -1)] },
    { k: 'hero', label: '♭VI – ♭VII – I', rule: 'on arrive en majeur sur la tonique', effect: 'héroïsme, victoire', hold: true,
      minor: [HC(5, 'maj'), HC(6, 'maj'), HC(0, 'maj')], major: [HC(5, 'maj', -1), HC(6, 'maj', -1), HC(0, 'maj')] },
    { k: 'susp', label: 'Suspensions', rule: 'chaque accord commence sur la quarte ou la seconde, puis se résout', effect: 'retenue, émotion qui se pose',
      minor: [[HC(0, 'sus4'), HC(0, 'min')], [HC(5, 'sus2'), HC(5, 'maj')], [HC(3, 'sus4'), HC(3, 'min')], [HC(4, 'sus4'), HC(4, 'maj')]],
      major: [[HC(0, 'sus4'), HC(0, 'maj')], [HC(3, 'sus2'), HC(3, 'maj')], [HC(5, 'sus4'), HC(5, 'min')], [HC(4, 'sus4'), HC(4, 'maj')]] },
    { k: 'open', label: 'Fin ouverte', rule: 'accords enrichis, la dernière mesure en quinte à vide', effect: 'apaisement, une suite à venir', last: true,
      minor: [HC(0, 'madd9'), HC(5, 'maj7'), HC(3, 'm6'), HC(0, '5')], major: [HC(0, 'add9'), HC(3, 'maj7'), HC(1, 'm7'), HC(0, '5')] },
    { k: 'song', label: 'Comme une chanson', rule: 'les accords proposés pour l’émotion, comme dans une chanson', effect: 'simple et familier' },
  ];
  const HARM = Object.fromEntries(HARMONY.map((x) => [x.k, x]));
  /** Technique choisie automatiquement pour un passage (s : passage de timing(), last : dernier passage). */
  function autoHarm(s, last) {
    if (last && s.ene <= 2) return 'open';
    switch (s.emo) {
      case 'suspense': return s.ene <= 2 ? 'pedal' : 'chrom';
      case 'peur': case 'colere': return s.ten >= 4 ? 'chrom' : 'pedal';
      case 'heroisme': return 'hero';
      case 'espoir': return s.sync ? 'hero' : 'susp';
      case 'emerveillement': return 'mediant';
      case 'tristesse': return 'susp';
      case 'nostalgie': return 'common';
      case 'apaisement': return 'open';
      default: return 'song';
    }
  }
  const harmOf = (s, last) => (s.cue.harm && HARM[s.cue.harm] ? s.cue.harm : autoHarm(s, last));
  /** Grille d'un passage avec une technique de film, dans la tonalité de la scène (null : « comme une chanson »). */
  function techGrid(k, mode, bars) {
    const T = HARM[k];
    const seq = T && T[mode === 'major' ? 'major' : 'minor'];
    if (!seq) return null;
    const per = bars >= 8 ? 2 : 1; // passages longs : deux mesures par accord
    const n = Math.ceil(bars / per);
    const at = (i) => {
      if (T.last && i === n - 1) return seq[seq.length - 1];
      const body = T.last ? seq.slice(0, -1) : seq;
      // passage plus court que la formule : on garde sa fin (♭VII – I sur deux mesures, I sur une)
      if (T.hold && n < body.length) return body[body.length - n + i];
      return T.hold && i >= body.length ? body[body.length - 1] : body[i % body.length];
    };
    const grid = [];
    for (let i = 0; i < n; i++) {
      const step = i * per * 16;
      const len = Math.min(per, bars - i * per) * 16;
      const c = at(i);
      if (Array.isArray(c)) {
        grid.push({ step, len: len / 2, ...c[0] }, { step: step + len / 2, len: len / 2, ...c[1] });
      } else grid.push({ step, len, ...c });
    }
    return grid;
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

  /* ---------- Thème et mélodie : motif, transformations, phrase, leitmotiv ----------
   * Un motif = [{ t, d, m }] : départ et durée en temps (noires), hauteur MIDI. Tout se calcule en degrés de la gamme
   * de la tonalité (SC : les notes de la gamme de Do1 à Do7), sauf le demi-ton chromatique.
   * motif = { cont, intv, rhy, n, pick } (film.motif) ; leit = { idPassage: traitement } (film.leit, sinon selon l'émotion) ;
   * phrase = structure de l'énoncé (film.motif.ph). */
  const CONT = {
    desc: { label: 'Descendant', dirs: [-1, -1, -1, -1], start: 4, why: 'retombe : le manque, le regret' },
    asc: { label: 'Ascendant', dirs: [1, 1, 1, 1], start: 0, why: 's’élève : on croit à une issue' },
    arch: { label: 'Arche', dirs: [1, 1, -1, -1], start: 2, why: 's’élance puis revient : un élan maîtrisé' },
    vall: { label: 'Creux', dirs: [-1, -1, 1, 1], start: 7, why: 'plonge puis remonte : on se relève' },
    rep: { label: 'Note répétée', dirs: [0, -1, 0, 1], start: 4, why: 'piétine : l’attente, l’obsession' },
  };
  const INTV = {
    s2: { label: 'Seconde', step: 1, why: 'intime, presque parlé' },
    s3: { label: 'Tierce', step: 2, why: 'chantant, doux' },
    s4: { label: 'Quarte', step: 3, why: 'un appel, une affirmation' },
    s6: { label: 'Sixte', step: 5, why: 'lyrique : le saut qui serre le cœur' },
    ht: { label: 'Demi-ton', step: 0, why: 'chromatique, inquiétant' },
  };
  const RHY = {
    nnb: { label: '♩ ♩ 𝅗𝅥', beats: [1, 1, 2], why: 'court-court-long : on pose' },
    pt: { label: '♩. ♪ 𝅗𝅥', beats: [1.5, 0.5, 2], why: 'pointé : un élan' },
    lev: { label: '♪ | ♩. 𝅗𝅥', beats: [0.5, 1.5, 2], why: 'levée : on hésite avant d’oser' },
    sync: { label: '♪ ♩ ♪ 𝅗𝅥', beats: [0.5, 1, 0.5, 2], why: 'syncopé : instable' },
    tri: { label: '³♪♪♪ 𝅗𝅥.', beats: [1 / 3, 1 / 3, 1 / 3, 3], why: 'triolet : une envolée' },
  };
  /** Réglages de départ du motif selon l'émotion (contour, intervalle-clé, rythme, nombre de notes). */
  const EMO_MOTIF = {
    tristesse: ['desc', 's2', 'lev', 3], nostalgie: ['desc', 's3', 'nnb', 3], suspense: ['rep', 'ht', 'sync', 4], peur: ['rep', 'ht', 'sync', 4],
    colere: ['arch', 's4', 'pt', 4], espoir: ['asc', 's4', 'pt', 4], heroisme: ['arch', 's6', 'pt', 4], emerveillement: ['asc', 's6', 'tri', 5],
    apaisement: ['desc', 's3', 'nnb', 3], joie: ['asc', 's3', 'pt', 4],
  };
  const motifFor = (emo) => {
    const [cont, intv, rhy, n] = EMO_MOTIF[emo] || EMO_MOTIF.nostalgie;
    return { cont, intv, rhy, n, pick: 0, ph: 'qr' };
  };
  const parseKey = (k) => {
    const [tonic, mode] = String(k || 'D minor').split(' ');
    return { tonic, mode: mode || 'minor' };
  };
  const pc = (m) => ((m % 12) + 12) % 12;
  /** Notes de la gamme (MIDI 24 à 96) et tonique à l'octave 4. */
  function scaleOf(key) {
    const sc = SS.harmony.scale(key).map((d) => d.pc);
    const SC = [];
    for (let m = 24; m <= 96; m++) if (sc.includes(pc(m))) SC.push(m);
    return { SC, tonic: 60 + sc[0], pcs: sc };
  }
  /** Degré (index dans SC) de la note de la gamme la plus proche. */
  const degOf = (SC, m) => SC.reduce((b, x, i) => (Math.abs(x - m) < Math.abs(SC[b] - m) ? i : b), 0);
  const at = (SC, i) => SC[Math.max(0, Math.min(SC.length - 1, i))];
  /** Rythme de n notes sur une mesure de 4 temps : celui choisi, complété en croches, la dernière note tient la fin. */
  function rhythmFor(rhy, n) {
    const base = (RHY[rhy] || RHY.nnb).beats;
    let r = base.slice(0, Math.max(1, n - 1));
    while (r.length < n - 1) r.push(0.5);
    let used = r.reduce((a, b) => a + b, 0);
    if (used > 3.5) {
      r = r.map((x) => (x * 3.5) / used);
      used = 3.5;
    }
    r.push(4 - used);
    return r;
  }
  /** Un motif d'une mesure. v : 0, 1, 2 (les trois propositions : la deuxième ouvre la 3e note, la troisième part plus haut). */
  function genMotif(p, key, v = p.pick || 0) {
    const { SC, tonic } = scaleOf(key);
    const c = CONT[p.cont] || CONT.desc;
    const n = Math.max(3, Math.min(5, p.n || 3));
    const ki = (INTV[p.intv] || INTV.s3).step;
    let d = degOf(SC, tonic) + c.start + (v === 2 ? 2 : 0);
    const ms = [at(SC, d)];
    for (let k = 1; k < n; k++) {
      const dir = c.dirs[k - 1] ?? -1;
      if (p.intv === 'ht' && k === 1) {
        ms.push(ms[0] + (dir || 1)); // demi-ton chromatique, puis retour dans la gamme
        continue;
      }
      const step = k === 1 ? ki : v === 1 && k === 2 ? 2 : 1;
      d += dir * step;
      ms.push(at(SC, d));
    }
    const rh = rhythmFor(p.rhy, n);
    let t = 0;
    return ms.map((m, i) => {
      const o = { t, d: rh[i], m };
      t += rh[i];
      return o;
    });
  }
  /** Les trois propositions du motif. */
  const proposals = (p, key) => [0, 1, 2].map((v) => genMotif(p, key, v));
  const shiftDeg = (SC, m, k) => at(SC, degOf(SC, m) + k);
  /** Mode opposé : en mineur, la tierce, la sixte et la septième montent d'un demi-ton (et l'inverse en majeur). */
  function otherMode(M, key) {
    const t = pc(scaleOf(key).tonic);
    const minor = key.mode !== 'major';
    return M.map((n) => {
      const iv = pc(n.m - t);
      return { ...n, m: minor ? ([3, 8, 10].includes(iv) ? n.m + 1 : n.m) : [4, 9, 11].includes(iv) ? n.m - 1 : n.m };
    });
  }
  /** Les 8 transformations : (motif, tonalité) → notes ; un seul changement à la fois. */
  const TRANSFORMS = {
    id: { label: 'Original', why: 'Le motif tel quel.', f: (M) => M },
    inv: { label: 'Renversement', why: 'Les intervalles changent de sens : une chute devient un élan.', f: (M, key) => {
      const { SC } = scaleOf(key);
      const d0 = degOf(SC, M[0].m);
      return M.map((n) => ({ ...n, m: at(SC, 2 * d0 - degOf(SC, n.m)) }));
    } },
    ret: { label: 'Rétrograde', why: 'Les notes à l’envers, même rythme : le souvenir rembobiné.', f: (M) => {
      const ms = M.map((n) => n.m).reverse();
      return M.map((n, i) => ({ ...n, m: ms[i] }));
    } },
    aug: { label: 'Augmentation', why: 'Deux fois plus lent : solennel, la révélation.', f: (M) => M.map((n) => ({ ...n, t: n.t * 2, d: n.d * 2 })) },
    dim: { label: 'Diminution', why: 'Deux fois plus rapide, répété : urgence, poursuite.', f: (M) => [0, 2].flatMap((o) => M.map((n) => ({ ...n, t: n.t / 2 + o, d: n.d / 2 }))) },
    mode: { label: 'Mode opposé', why: 'La même idée, éclairée (mineur → majeur) ou assombrie.', f: (M, key) => otherMode(M, key) },
    seq: { label: 'Séquence', why: 'Répété en montant d’un degré : la tension grandit.', f: (M, key) => {
      const { SC } = scaleOf(key);
      return [0, 1, 2].flatMap((k) => M.map((n) => ({ ...n, t: n.t + 4 * k, m: shiftDeg(SC, n.m, k) })));
    } },
    frag: { label: 'Fragmentation', why: 'Seulement la tête du motif, morcelée : on doute, on hésite.', f: (M, key) => {
      const { SC } = scaleOf(key);
      return [0, 1, 2].flatMap((k) => M.slice(0, 2).map((n, i) => ({ t: k * 1.25 + i * 0.5, d: 0.5, m: shiftDeg(SC, n.m, -k) }))).concat([{ t: 4, d: 2, m: M[M.length - 1].m }]);
    } },
  };
  /** Note de l'accord (classes pcs) la plus proche de m. */
  function snap(m, pcs) {
    if (!pcs || !pcs.length) return m;
    for (let k = 0; k < 7; k++) for (const x of [m - k, m + k]) if (pcs.includes(pc(x))) return x;
    return m;
  }
  /** Structures de phrase sur 8 mesures : [opération, décalage en degrés] par mesure. */
  const PHRASES = {
    qr: { label: 'Question → réponse', why: 'Quatre mesures qui restent en suspens (question), quatre qui finissent sur la tonique (réponse).', plan: [['m', 0], ['m', -1], ['inv', 1], ['long', 4], ['m', 0], ['m', -1], ['m', -3], ['long', 0]] },
    sent: { label: 'Présentation puis développement', why: 'Le motif deux fois, puis seulement sa tête, de plus en plus serrée : l’élan qui pousse vers la fin.', plan: [['m', 0], ['m', -2], ['m', 0], ['m', -2], ['frag', 1], ['frag', 0], ['frag', -1], ['long', 0]] },
    cue: { label: 'Vers le repère (sommet)', why: 'Chaque mesure un peu plus haut : le sommet tombe sur la mesure du repère suivant.', plan: [['m', 0], ['m', -1], ['m', 1], ['m', 2], ['m', 3], ['m', 4], ['m', 5], ['long', 7]] },
  };
  /** Une mesure de la phrase : le motif décalé de k degrés, sa tête morcelée, son renversement ou une note longue. */
  function barOf(op, k, M, key) {
    const { SC } = scaleOf(key);
    if (op === 'long') return [{ t: 0, d: 4, m: shiftDeg(SC, M[0].m, k) }];
    if (op === 'inv') return TRANSFORMS.inv.f(M, key).map((n) => ({ ...n, m: shiftDeg(SC, n.m, k) }));
    if (op === 'frag') return M.slice(0, 2).map((n, i) => ({ t: i, d: 1, m: shiftDeg(SC, n.m, k) })).concat([{ t: 2, d: 2, m: shiftDeg(SC, M[1].m, k - 1) }]);
    return M.map((n) => ({ ...n, m: shiftDeg(SC, n.m, k) }));
  }
  /** Phrase de `bars` mesures (la structure se répète au-delà de 8) ; la note finale de chaque mesure se pose sur l'accord. */
  function phrase(M, ph, key, chordPcs, bars = 8) {
    const plan = (PHRASES[ph] || PHRASES.qr).plan;
    const out = [];
    for (let b = 0; b < bars; b++) {
      const [op, k] = plan[b % plan.length];
      const ns = barOf(op, k, M, key);
      const last = ns[ns.length - 1];
      last.m = snap(last.m, chordPcs(b));
      ns.forEach((n) => out.push({ ...n, t: n.t + b * 4 }));
    }
    return out;
  }
  /** Traitements du thème dans une scène (leitmotiv), et celui proposé selon l'émotion. */
  const TREATMENTS = {
    enonce: { label: 'Énoncé (phrase)', why: 'le motif tel que la phrase le présente' },
    frag: { label: 'Fragmenté', why: 'seulement sa tête : le doute, l’attente' },
    dim: { label: 'Diminué', why: 'deux fois plus vite : l’urgence' },
    seq: { label: 'En séquence', why: 'il monte degré par degré : l’espoir grandit' },
    aug: { label: 'Augmenté', why: 'deux fois plus lent, plus haut : la révélation' },
    mode: { label: 'Mode opposé', why: 'éclairé (ou assombri) : la même idée a changé' },
    retombe: { label: 'Qui retombe', why: 'le motif descend et se pose : la fin' },
    tacet: { label: 'Silence', why: 'le thème se tait : place au dialogue, au bruitage' },
  };
  const EMO_TREAT = { tristesse: 'enonce', nostalgie: 'enonce', suspense: 'frag', peur: 'dim', colere: 'dim', espoir: 'seq', heroisme: 'mode', emerveillement: 'aug', apaisement: 'retombe', joie: 'mode' };
  /** Classes de hauteur de l'accord joué à la mesure b d'une grille (pas de 16 par mesure). */
  function chordAt(grid, key, b) {
    const c = [...(grid || [])].reverse().find((x) => x.step <= b * 16) || (grid || [])[0];
    if (!c || !SS.harmony || !SS.chordNotes) return null;
    const g = SS.harmony.gridChord(key, c.degree, c.type, c.acc || 0, 0);
    return SS.chordNotes(60 + g.rootPc, c.type).map(pc);
  }
  /** Ramène une ligne dans la zone chantante du piano (Sol3 à Do6) par octaves, sans casser les intervalles. */
  function fitRange(ns, lo = 55, hi = 84) {
    if (!ns.length) return ns;
    const mn = Math.min(...ns.map((n) => n.m));
    const mx = Math.max(...ns.map((n) => n.m));
    let o = 0;
    while (mx + o > hi && mn + o - 12 >= lo - 6) o -= 12;
    while (mn + o < lo && mx + o + 12 <= hi + 6) o += 12;
    return o ? ns.map((n) => ({ ...n, m: n.m + o })) : ns;
  }
  /** Notes d'un passage selon son traitement, sur ses accords (key : celle du passage). */
  function treatNotes(tr, M, ph, key, grid, bars) {
    const pcsAt = (b) => chordAt(grid, key, b);
    const { SC } = scaleOf(key);
    let ns = [];
    if (tr === 'tacet') return [];
    if (tr === 'enonce') ns = phrase(M, ph, key, pcsAt, bars);
    else if (tr === 'retombe') {
      for (let b = 0; b < bars; b++) {
        const bar = b === bars - 1 ? [{ t: 0, d: 4, m: snap(shiftDeg(SC, M[0].m, -2 * b - 1), pcsAt(b)) }] : M.map((n) => ({ ...n, m: shiftDeg(SC, n.m, -2 * b) }));
        bar[bar.length - 1].m = snap(bar[bar.length - 1].m, pcsAt(b));
        bar.forEach((n) => ns.push({ ...n, t: n.t + 4 * b }));
      }
    } else {
      const base = tr === 'mode' ? TRANSFORMS.mode.f(M, key) : M;
      const unit = tr === 'aug' ? TRANSFORMS.aug.f(base, key).map((n) => ({ ...n, m: n.m + 12 })) : tr === 'dim' ? TRANSFORMS.dim.f(base, key) : tr === 'frag' ? TRANSFORMS.frag.f(base, key) : base;
      const len = Math.max(4, Math.ceil(Math.max(...unit.map((n) => n.t + n.d)) / 4) * 4); // en temps, mesures entières
      // chaque reprise du motif bouge un peu : la séquence monte d'un degré, la diminution monte toutes les deux
      // reprises (l'urgence grandit), le fragment hésite autour de sa note, le mode opposé répond un ton plus bas
      const SHIFT = { seq: (k) => k, dim: (k) => Math.floor(k / 2), frag: (k) => [0, -1, 0, 1][k % 4], mode: (k) => (k % 2 ? -1 : 0), aug: () => 0 };
      for (let t0 = 0, k = 0; t0 < bars * 4; t0 += len, k++) {
        const shift = (SHIFT[tr] || SHIFT.aug)(k);
        const rep = [];
        unit.forEach((n) => {
          if (t0 + n.t >= bars * 4) return;
          rep.push({ ...n, t: t0 + n.t, d: Math.min(n.d, bars * 4 - t0 - n.t), m: shift ? shiftDeg(SC, n.m, shift) : n.m });
        });
        // la note qui finit la reprise se pose sur l'accord du moment
        const end = rep[rep.length - 1];
        if (end) end.m = snap(end.m, pcsAt(Math.floor(end.t / 4)));
        ns.push(...rep);
      }
    }
    return fitRange(ns);
  }
  /** Notes → événements de section (pas de double croche). */
  const toEvents = (ns, vel = 0.78) => ns.filter((n) => n.d > 0).map((n) => ({ step: Math.round(n.t * 4), len: Math.max(1, Math.round(n.d * 4)), notes: [n.m], vel }));
  /** Le motif de la scène : celui choisi (film.motif), dans la tonalité de la scène. */
  const motifOf = (film) => genMotif(film.motif, parseKey(film.key));
  /** Traitement du thème dans un passage : celui choisi, sinon celui de son émotion. */
  const treatOf = (film, s) => (film.leit && TREATMENTS[film.leit[s.id]] ? film.leit[s.id] : EMO_TREAT[s.emo] || 'enonce');

  /**
   * Percussions d'orchestre frappées sur les repères (kit « orchperc » : lt timbale, mt roulement de timbale,
   * bd grosse caisse, cr cymbale suspendue, misc tam-tam) → { son: [[pas, vélocité]] }.
   * Synchro forte : impact au premier temps (et tam-tam si l'énergie est haute) ; la mesure d'avant : roulement de timbale ;
   * énergie 4–5 : la timbale marque les temps forts ; tension 5 au calme : un battement de cœur ; la fin : tam-tam pianissimo.
   */
  function percHits(tm, i) {
    const s = tm.sections[i];
    const next = tm.sections[i + 1] || null;
    const n = s.bars * 16;
    const hits = { lt: [], mt: [], bd: [], cr: [], oh: [], misc: [] };
    if (s.sync) {
      hits.bd.push([0, 1]);
      hits.cr.push([0, 0.9]);
      hits.lt.push([0, 0.95]);
      if (s.ene >= 4) hits.misc.push([0, 0.7]);
    }
    if (next && next.sync) {
      hits.mt.push([Math.max(0, n - 16), 0.75]);
      // cymbale suspendue en crescendo (échantillon de 4 s) : elle culmine pile sur la synchro
      hits.oh.push([Math.max(0, n - Math.round((tm.bpm * 4) / 15)), 0.8]);
    }
    for (let b = 0; b < s.bars; b++) {
      if (s.ene >= 4) {
        if (!(s.sync && b === 0)) hits.lt.push([b * 16, 0.7]);
        if (s.ene >= 5) hits.lt.push([b * 16 + 8, 0.55]);
      } else if (s.ten >= 5) {
        hits.lt.push([b * 16, 0.5]);
        hits.lt.push([b * 16 + 3, 0.38]);
      }
    }
    if (s.ten >= 4 && s.ene <= 3 && !s.sync) hits.cr.push([0, 0.35]); // un frisson de cymbale à l'entrée d'un passage tendu
    if (!next && s.ene <= 2) hits.misc.push([0, 0.35]);
    Object.values(hits).forEach((l) => l.sort((a, b) => a[0] - b[0]));
    return hits;
  }

  /** Frappes écrites d'un modèle ({ son: [[mesure, temps, vélocité]] }, mesures de la scène) ajoutées à celles d'un passage. */
  function addHits(hits, extra, startBar, bars) {
    Object.entries(extra).forEach(([snd, l]) => {
      l.forEach(([bar, beat, v]) => {
        const b = bar - 1 - startBar;
        if (b < 0 || b >= bars) return;
        const st = b * 16 + Math.round((beat - 1) * 4);
        const lst = (hits[snd] = hits[snd] || []);
        const old = lst.find((x) => x[0] === st);
        if (old) old[1] = Math.max(old[1], v);
        else lst.push([st, v]);
      });
      if (hits[snd]) hits[snd].sort((a, b) => a[0] - b[0]);
    });
    return hits;
  }

  /* ---------- Nuances ---------- */
  const DYN = [null, 'pp', 'p', 'mf', 'f', 'ff'];
  /** Vélocité de base du thème et de l'orchestre selon l'énergie du passage (1–5). */
  const THEME_VEL = [0, 0.5, 0.58, 0.68, 0.8, 0.92];
  const ORCH_VEL = [0, 0.42, 0.5, 0.6, 0.7, 0.8];
  /**
   * Un arc par phrase de deux mesures : la vélocité monte jusqu'à la note la plus haute de la phrase (×1,1) puis
   * retombe (×0,8 au plus bas) ; base = vélocité du passage.
   */
  function phraseArcs(events, base) {
    const out = events.map((e) => ({ ...e }));
    const groups = {};
    out.forEach((e) => (groups[Math.floor(e.step / 32)] = groups[Math.floor(e.step / 32)] || []).push(e));
    Object.values(groups).forEach((ph) => {
      ph.sort((a, b) => a.step - b.step);
      const top = ph.reduce((a, e) => (Math.max(...e.notes) > Math.max(...a.notes) ? e : a), ph[0]);
      const it = ph.indexOf(top);
      ph.forEach((e, i) => {
        const k = i <= it ? (it ? i / it : 1) : 1 - (i - it) / Math.max(1, ph.length - 1 - it);
        e.vel = +Math.min(1, base * (0.8 + 0.3 * k)).toFixed(3);
      });
    });
    return out;
  }

  /** Plan de chanson d'une scène de film (js/band-songs.js) : une section par passage, dans l'ordre. */
  function spec(film) {
    const tm = timing(film);
    const key = film.key || 'D minor';
    const [tonic, mode] = key.split(' ');
    const sections = {};
    tm.sections.forEach((s, i) => {
      const c = s.cue;
      // sous les mots (repère « dialogue ») : un cran d'énergie en moins, la harpe et les percussions se taisent,
      // l'orchestre joue plus doucement (mix à l'image : la musique laisse la place à la voix)
      const dlg = !!c.dlg;
      const ene = dlg ? Math.max(1, s.ene - 1) : s.ene;
      const sec = { bars: s.bars, name: s.name, emotion: s.emotion, energy: energyOf(ene), tension: s.ten, ...playOf({ ...s, ene }) };
      if (dlg) Object.assign(sec, { dialog: true, keys: 'sustain' }); // le piano tient ses accords, sans arpège
      // accords écrits (modèle, ou passage d'un modèle dont la longueur n'a pas changé), sauf technique choisie à la main
      const written = c.grid && c.gridBars === s.bars && !(c.harm && HARM[c.harm]);
      const tg = written ? null : techGrid(harmOf(s, i === tm.sections.length - 1), mode || 'minor', s.bars);
      if (written) sec.grid = c.grid.map((x) => ({ acc: 0, ...x }));
      else if (tg) sec.grid = tg; // une technique d'harmonie de film, dans la tonalité de la scène
      else {
        const g = gridFor(s.emotion, { tonic, mode: mode || 'minor' }, s.bars);
        sec.grid = g.grid;
        if (g.key) sec.key = g.key;
      }
      if (film.motif) {
        // le thème inventé (bloc « 04 Thème ») : le motif, traité selon l'émotion du passage (leitmotiv)
        const M = motifOf(film);
        const ns = treatNotes(treatOf(film, s), M, film.motif.ph, parseKey(sec.key || key), sec.grid, s.bars);
        sec.theme = toEvents(ns);
        if (!ns.length) delete sec.lead; // « Silence » : le thème se tait dans ce passage
      } else if (film.theme && c.gridBars === s.bars) {
        const ev = themeEvents(film.theme, s.startBar, s.bars);
        if (ev.length) sec.theme = ev;
      }
      const next = tm.sections[i + 1];
      // nuances : une nuance par passage (énergie → pp … ff), un arc par phrase de deux mesures sur le thème,
      // crescendo vers la synchro forte, respiration (decrescendo) après le sommet
      if (film.nuance !== false) {
        sec.dyn = DYN[ene];
        sec.orchVel = ORCH_VEL[ene];
        if (sec.theme) sec.theme = phraseArcs(sec.theme, THEME_VEL[ene]);
        const ramps = [];
        if (next && next.sync) {
          const k = Math.min(2, s.bars);
          ramps.push({ a: (s.bars - k) * 16, b: s.bars * 16, from: 0.85, to: 1.2 });
        }
        if (s.sync && next && next.ene < s.ene) ramps.push({ a: (s.bars - 1) * 16, b: s.bars * 16, from: 1, to: 0.8 });
        if (ramps.length) sec.ramps = ramps;
      }
      // scène d'action (peur, colère au moins moyennement forte) : ostinato 3+3+2 à la basse ; accents des cuivres dès l'énergie 4
      const action = ['peur', 'colere'].includes(s.emo) && s.ene >= 3;
      sec.motor = c.motor ?? action;
      sec.stabs = c.stabs ?? (s.ene >= 4 && (action || s.emo === 'heroisme'));
      // le vide avant l'impact : un temps de silence à la fin d'un passage fort qui précède la synchro
      if (c.gap ?? (next && next.sync && s.ene >= 4)) sec.gap = true;
      sec.hits = film.percAuto === false ? { lt: [], mt: [], bd: [], cr: [], misc: [] } : percHits(tm, i);
      if (film.hits && c.gridBars === s.bars) addHits(sec.hits, film.hits, s.startBar, s.bars);
      if (dlg) Object.keys(sec.hits).forEach((k) => (sec.hits[k] = sec.hits[k].filter(([st]) => st === 0 && s.sync)));
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
      { t: 6, emo: 'nostalgie', name: 'Doute', ten: 2, ene: 1, gridBars: 4, grid: [C(0, 16, 0, 'madd9'), C(16, 16, 5, 'maj7'), C(32, 16, 2, 'maj', 4), C(48, 16, 6, 'sus2')] },
      { t: 18, emo: 'suspense', name: 'Réplique', ten: 3, ene: 1, dlg: true, gridBars: 4, grid: [C(0, 16, 0, 'madd9'), C(16, 16, 5, 'maj7'), C(32, 16, 3, 'madd9'), C(48, 16, 6, 'sus4')] },
      { t: 30, emo: 'espoir', name: 'Espoir', ten: 4, ene: 3, gridBars: 4, grid: [C(0, 16, 0, 'madd9'), C(16, 16, 5, 'maj7'), C(32, 16, 2, 'maj', 4), C(48, 8, 6, 'sus4'), C(56, 8, 6, 'maj')] },
      { t: 42, emo: 'emerveillement', name: 'La lumière', ten: 1, ene: 5, sync: true, gridBars: 2, grid: [C(0, 16, 2, 'add9'), C(16, 16, 6, 'maj', 4)] },
      { t: 48, emo: 'apaisement', name: 'Apaisement', ten: 1, ene: 2, gridBars: 2, grid: [C(0, 16, 0, 'm7'), C(16, 16, 0, '5')] },
    ],
    themeNote: 'La–Fa–Mi (noire, noire, blanche), le sommet La5 juste après la synchro.',
    // le thème au piano : motif La–Fa–Mi (noire, noire, blanche), sommet La5 juste après la synchro
    theme: [[1, 1, 69, 1], [1, 2, 65, 1], [1, 3, 64, 2], [2, 2, 65, 1], [2, 3, 69, 2], [3, 1, 69, 2], [3, 3, 65, 1], [4, 2, 67, 1], [4, 3, 62, 2], [5, 1, 69, 1], [5, 2, 65, 1], [5, 3, 64, 2], [6, 1, 65, 2], [6, 3, 69, 1], [7, 1, 67, 1], [7, 2, 70, 1], [7, 3, 69, 0.5], [8, 3, 67, 2], [9, 1, 69, 1], [9, 2, 65, 1], [9, 3, 64, 1], [9, 4, 65, 1], [10, 1, 65, 1], [10, 2, 69, 1], [10, 3, 70, 2], [11, 1, 69, 1], [11, 2, 72, 1], [11, 3, 77, 2], [12, 1, 77, 2], [12, 3, 76, 1], [13, 1, 77, 2], [13, 3, 79, 1], [13, 4, 81, 1], [14, 1, 79, 2], [14, 3, 76, 2], [15, 1, 77, 1], [15, 2, 72, 1], [15, 3, 69, 2], [16, 1, 74, 3]],
  };

  /* ---------- Modèle « La poursuite » : 36 mesures, 144 BPM, Ré mineur, synchro du saut m. 27 = 00:43,3 ----------
   * Le motif de poursuite (2 mesures, M1 + M2, en demi-tons depuis Ré4) passe des cors aux trompettes, se resserre en
   * séquence chromatique (repérée), devient héroïque en majeur au saut ; la fuite finit sur trois coups 3+3+2. */
  const BAR144 = 240 / 144;
  const M1 = [[1, 0, 0.5], [1.5, 1, 0.5], [2, 0, 1], [3, 7, 0.5], [3.5, 8, 0.5], [4, 7, 1]];
  const M2 = [[1, 12, 1.5], [2.5, 10, 0.5], [3, 8, 0.5], [3.5, 7, 0.5], [4, 6, 0.5], [4.5, 7, 0.5]];
  const HERO = { 27: [[1, 62, 1.5], [2.5, 65, 0.5], [3, 70, 2]], 28: [[1, 69, 1], [2, 70, 1], [3, 72, 2]], 29: [[1, 64, 1.5], [2.5, 67, 0.5], [3, 72, 2]], 30: [[1, 74, 1], [2, 72, 1], [3, 76, 2]], 31: [[1, 74, 1.5], [2.5, 73, 0.5], [3, 74, 1], [4, 78, 1]], 32: [[1, 74, 4]] };
  function chaseTheme() {
    const T = [];
    const m1 = (bar, base) => M1.forEach(([b, st, d]) => T.push([bar, b, base + st, d]));
    const mot = (bar, tr) => {
      m1(bar, 62 + tr);
      M2.forEach(([b, st, d]) => T.push([bar + 1, b, 62 + st + tr, d]));
    };
    mot(3, 0), mot(5, -4), mot(7, 0), m1(9, 60), T.push([10, 1, 69, 4]); // départ : les cors
    mot(11, 0), mot(13, 3), mot(15, 0), m1(17, 58), T.push([18, 1, 69, 4]); // le marché : les trompettes, une tierce plus haut
    T.push([19, 1, 50, 2], [19, 3, 51, 2], [21, 3, 50, 1], [21, 4, 51, 1], [22, 1, 56, 4]); // cachette : secondes mineures
    for (let b = 23; b <= 26; b++) m1(b, 62 + b - 23); // repérée : le motif monte d'un demi-ton par mesure
    Object.entries(HERO).forEach(([b, ns]) => ns.forEach(([bt, m, d]) => T.push([+b, bt, m, d]))); // le saut : héroïque, en Ré majeur
    [33, 34].forEach((b) => [1, 2.5, 4].forEach((bt) => T.push([b, bt, 62, 0.5]))); // fuite : trois coups 3+3+2
    T.push([36, 1, 62, 1]);
    return T;
  }
  const barT = (bar) => +((bar - 1) * BAR144).toFixed(1);
  const POURSUITE = {
    id: 'poursuite',
    title: 'La poursuite',
    story: 'L’alarme, elle s’élance, traverse le marché, se cache, elle est repérée, saute d’un toit à l’autre et file.',
    key: 'D minor',
    start: 0,
    end: 60,
    bpm: 144,
    cues: [
      { t: barT(1), emo: 'suspense', name: 'Alarme', ten: 3, ene: 1, gridBars: 2, grid: [C(0, 32, 0, 'min')] },
      { t: barT(3), emo: 'peur', name: 'Départ', ten: 4, ene: 3, gridBars: 8, grid: [C(0, 32, 0, 'min'), C(32, 32, 5, 'maj'), C(64, 32, 0, 'min'), C(96, 16, 6, 'maj'), C(112, 16, 4, 'maj')] },
      { t: barT(11), emo: 'colere', name: 'Le marché', ten: 4, ene: 4, gridBars: 8, grid: [C(0, 32, 0, 'min'), C(32, 32, 2, 'min'), C(64, 32, 0, 'min'), { step: 96, len: 16, degree: 5, type: 'min', acc: 0 }, C(112, 16, 4, 'maj')] },
      { t: barT(19), emo: 'suspense', name: 'Cachette', ten: 5, ene: 1, motor: false, gridBars: 4, grid: [C(0, 64, 0, 'min')] },
      { t: barT(23), emo: 'peur', name: 'Repérée', ten: 5, ene: 4, gridBars: 4, grid: [C(0, 16, 0, 'min'), { step: 16, len: 16, degree: 1, type: 'min', acc: -1 }, C(16 * 2, 16, 1, 'min'), C(48, 16, 2, 'min')] },
      { t: barT(27), emo: 'heroisme', name: 'Le saut', ten: 2, ene: 5, sync: true, motor: true, gridBars: 6, grid: [C(0, 32, 5, 'maj'), C(32, 32, 6, 'maj'), { step: 64, len: 32, degree: 0, type: 'maj', acc: 0 }] },
      { t: barT(33), emo: 'colere', name: 'Fuite', ten: 3, ene: 5, motor: true, stabs: true, gridBars: 4, grid: [C(0, 64, 0, '5')] },
    ],
    themeNote: 'un motif de deux mesures aux cors (Ré–Mi♭–Ré, La–Si♭–La), repris une tierce plus haut au marché, qui monte d’un demi-ton par mesure quand elle est repérée, puis héroïque en Ré majeur au saut.',
    theme: chaseTheme(),
    // frappes écrites (en plus de celles des repères) : roulement d'alarme, caisse claire qui monte vers le saut,
    // cymbales frappées à l'entrée du marché et au saut, trois coups 3+3+2 et le dernier coup de la fuite
    hits: {
      mt: [[1, 1, 0.6]],
      sd: [[19, 1, 0.14], [19, 3, 0.14], [20, 1, 0.14], [20, 3, 0.14], [21, 1, 0.14], [21, 3, 0.14], [22, 1, 0.14], [22, 3, 0.14],
        ...Array.from({ length: 31 }, (_, k) => [25 + Math.floor(k / 16), 1 + (k % 16) / 4, +(0.22 + (k / 32) * 0.55).toFixed(2)])],
      ht: [[11, 1, 0.75], [27, 1, 0.9], [36, 1, 0.9]],
      bd: [33, 34].flatMap((b) => [[b, 1, 0.85], [b, 2.5, 0.85], [b, 4, 0.85]]).concat([[36, 1, 1]]),
      lt: [33, 34].flatMap((b) => [[b, 1, 0.8], [b, 2.5, 0.8], [b, 4, 0.8]]).concat([[36, 1, 0.95]]),
      misc: [[36, 1, 0.8]],
    },
  };

  /* ---------- Modèle « Les grands espaces » : dans l'esprit du Main Title d'Out of Africa (John Barry, 1985) ----------
   * Reprend la forme (55 mesures), la grille, le tempo (noire = 80) et l'effectif : violons en trémolo, cors à l'unisson,
   * harpe, flûtes, tam-tam et grosse caisse (pas de timbales). La mélodie est originale ; elle garde seulement le geste
   * rythmique du genre : une note longue qui passe la barre, un silence, une relance en croches. */
  /** Grille d'une suite de mesures : [degré, type, altération] par mesure ; deux mesures identiques de suite n'en font qu'une. */
  const barsGrid = (list) => {
    const g = [];
    list.forEach(([degree, type, acc = 0], i) => {
      const last = g[g.length - 1];
      if (last && last.degree === degree && last.type === type && last.acc === acc) last.len += 16;
      else g.push({ step: i * 16, len: 16, degree, type, acc });
    });
    return g;
  };
  const CM = { C: [0, 'maj'], Em: [2, 'min'], Am: [5, 'min'], F: [3, 'maj'], Dm: [1, 'min'], Fm: [3, 'min'], G7: [4, '7'], G: [4, 'maj'], Gm: [4, 'min'], D: [1, 'maj'], E5: [2, '5'], Am9: [5, 'madd9'] };
  const seq = (str) => str.split(' ').map((k) => CM[k]);
  // le geste du thème : note d'appui, longue note liée par-dessus la barre, silence, relance en croches
  const THEME_A = (b0, o = 0) => [
    [b0, 1, 64 + o, 1], [b0, 2, 67 + o, 3.5], [b0 + 1, 3, 69 + o, 0.5], [b0 + 1, 3.5, 71 + o, 0.5], [b0 + 1, 4, 72 + o, 0.5], [b0 + 1, 4.5, 71 + o, 0.5],
    [b0 + 2, 1, 72 + o, 1], [b0 + 2, 2, 76 + o, 3.5], [b0 + 3, 3, 77 + o, 0.5], [b0 + 3, 3.5, 76 + o, 0.5], [b0 + 3, 4, 74 + o, 0.5], [b0 + 3, 4.5, 72 + o, 0.5],
    [b0 + 4, 1, 74 + o, 1], [b0 + 4, 2, 77 + o, 3.5],
  ];
  const ESPACES_THEME = [
    // appels des cors sur les pédales de mi et de la : le si tenu devient neuvième sur la
    [1, 1, 64, 1], [1, 2, 71, 3], [2, 1, 69, 1], [2, 2, 67, 1], [2, 3, 64, 2], [3, 1, 71, 4], [4, 3, 72, 0.5], [4, 3.5, 71, 0.5], [4, 4, 69, 1],
    [5, 1, 64, 1], [5, 2, 71, 3], [6, 1, 72, 1], [6, 2, 71, 1], [6, 3, 67, 2], [7, 1, 71, 4], [8, 1, 69, 4],
    // élargissement sur sol mineur et ré : le mi aigu, sixte sur sol, seconde sur ré
    [9, 1, 62, 1], [9, 2, 70, 1], [9, 3, 74, 2], [10, 1, 76, 4], [11, 1, 76, 2], [11, 3, 74, 2], [12, 1, 66, 2], [12, 3, 69, 2],
    [13, 1, 67, 1], [13, 2, 70, 1], [13, 3, 74, 2], [14, 1, 79, 3], [14, 4, 76, 1], [15, 1, 74, 4], [16, 1, 69, 2], [16, 3, 66, 2],
    // repli sur ré mineur : une petite cellule, le fa naturel après le fa dièse
    [17, 2, 69, 0.5], [17, 2.5, 65, 0.5], [17, 3, 62, 2], [19, 2, 69, 0.5], [19, 2.5, 65, 0.5], [19, 3, 62, 2], [20, 3, 64, 1], [20, 4, 67, 1],
    // première exposition (do majeur), fin par fa mineur et deux mesures de dominante
    ...THEME_A(21), [26, 3, 72, 0.5], [26, 3.5, 68, 0.5], [26, 4, 67, 0.5], [26, 4.5, 65, 0.5], [27, 1, 67, 1], [27, 2, 71, 3], [28, 2, 72, 1], [28, 3, 74, 2],
    // seconde exposition, résolue directement de fa mineur sur do (la♭ → sol, fa → mi)
    ...THEME_A(29), [34, 3, 77, 0.5], [34, 3.5, 80, 0.5], [34, 4, 79, 0.5], [34, 4.5, 77, 0.5], [35, 1, 76, 2], [35, 3, 74, 1], [35, 4, 72, 1], [36, 1, 72, 4],
    // interlude, piano : notes liées et réponses en croches
    [37, 2, 69, 3.5], [38, 3, 72, 0.5], [38, 3.5, 74, 0.5], [38, 4, 72, 1], [39, 2, 69, 3.5], [40, 3, 72, 0.5], [40, 3.5, 74, 0.5], [40, 4, 77, 1],
    [41, 1, 76, 2], [41, 3, 74, 1], [41, 4, 72, 1], [42, 1, 69, 2], [42, 3, 72, 1], [42, 4, 76, 1], [43, 1, 77, 3], [43, 4, 76, 1], [44, 1, 74, 4],
    // dernière exposition, puis la coda : la ligne du dessus descend sur la pédale de do
    ...THEME_A(45), [50, 3, 72, 0.5], [50, 3.5, 68, 0.5], [50, 4, 67, 0.5], [50, 4.5, 65, 0.5],
    [51, 1, 76, 4], [52, 1, 74, 4], [53, 1, 72, 4], [54, 1, 71, 2], [54, 3, 74, 2], [55, 1, 72, 4],
  ];
  const ESPACES = {
    id: 'espaces',
    title: 'Les grands espaces',
    story: 'Un survol des collines au lever du jour : des appels de cors au loin, l’horizon qui s’élargit, puis le grand thème, tendre et un peu amer.',
    key: 'C major',
    start: 0,
    end: 165,
    bpm: 80,
    percAuto: false, // pas de timbales : seulement les frappes écrites (tam-tam et grosse caisse)
    themeNote: 'une mélodie originale dans le geste du genre : une note longue qui passe la barre, un silence, une relance en croches. Appels des cors sur les pédales, puis trois expositions du thème ; la seconde se résout de fa mineur directement sur do.',
    cues: [
      { t: 0, emo: 'nostalgie', name: 'Appels', ten: 2, ene: 1, gridBars: 8, grid: barsGrid(seq('E5 E5 Am9 Am9 E5 E5 Am9 Am9')) },
      { t: 24, emo: 'emerveillement', name: 'L’horizon', ten: 3, ene: 3, gridBars: 8, grid: barsGrid(seq('Gm Gm D D Gm Gm D D')) },
      { t: 48, emo: 'nostalgie', name: 'Repli', ten: 2, ene: 1, gridBars: 4, grid: barsGrid(seq('Dm Dm Dm Dm')) },
      { t: 60, emo: 'emerveillement', name: 'Le thème', ten: 2, ene: 3, sync: true, gridBars: 8, grid: barsGrid(seq('C Em Am F Dm Fm G7 G7')) },
      { t: 84, emo: 'nostalgie', name: 'Reprise', ten: 2, ene: 4, gridBars: 8, grid: barsGrid(seq('C Em Am F Dm Fm C C')) },
      { t: 108, emo: 'apaisement', name: 'Interlude', ten: 1, ene: 2, gridBars: 8, grid: barsGrid(seq('F Dm F Dm C Am F G')) },
      { t: 132, emo: 'emerveillement', name: 'Dernier thème', ten: 2, ene: 4, gridBars: 6, grid: barsGrid(seq('C Em Am F Dm Fm')) },
      { t: 150, emo: 'apaisement', name: 'Coda', ten: 1, ene: 1, gridBars: 5, grid: barsGrid(seq('C C C C C')) },
    ],
    theme: ESPACES_THEME,
    // tam-tam et grosse caisse ponctuent l'élargissement ; un dernier tam-tam très doux sous l'accord final
    hits: { bd: [[9, 1, 0.75], [13, 1, 0.75], [21, 1, 0.5], [45, 1, 0.6]], misc: [[9, 1, 0.6], [13, 1, 0.6], [45, 1, 0.45], [55, 1, 0.3]] },
  };
  /** Les modèles (scènes écrites, accords et thème) : une inspiration chacun dans le style. */
  const TEMPLATES = { lumiere: LUMIERE, poursuite: POURSUITE, espaces: ESPACES };

  /** Scène libre de départ : quatre passages, une synchro forte. */
  const blankScene = () => ({
    id: 'scene',
    title: 'Ma scène',
    key: 'D minor',
    start: 0,
    end: 40,
    bpm: null,
    cues: [
      { t: 0, emo: 'suspense', name: 'Attente', ten: 3, ene: 1 },
      { t: 10, emo: 'peur', name: 'Le danger', ten: 5, ene: 3 },
      { t: 24, emo: 'heroisme', name: 'Le sursaut', ten: 2, ene: 5, sync: true },
      { t: 34, emo: 'apaisement', name: 'Après', ten: 1, ene: 2 },
    ],
  });

  /** Copie modifiable d'une scène (repères, sans tempo imposé) : « Modifier les repères » du modèle. */
  const editable = (film) => JSON.parse(JSON.stringify({ ...film, id: 'scene', bpm: null }));

  /* ---------- Le style « Musique de film » (tuile 🎬 de « Nouvelle chanson ») ----------
   * Deux départs : le modèle « La lumière revient » (accords et thème écrits) et une scène libre. Pas de batterie :
   * un piano porte le thème, l'orchestre (js/orchestra.js) tient l'harmonie et la basse, plus dense quand l'énergie monte. */
  const THEME_PICK = 'piano vcsl_fmpiano gm_epiano1 vsco_flute gm_violin gm_cello';
  const ORCH = ['chamber', 'romantique', 'epique', 'intime', 'mystere', 'strings', 'winds', 'hybrid'];
  const PERC = (kit, opt, pieces = 'lt mt bd cr oh misc') => kit('perc', pieces, 'orchperc', { label: 'Percussions d’orchestre', note: 'Timbales, grosse caisse, cymbale et tam-tam, frappés sur les repères', ...opt });
  const KEYS_PICK = 'piano gm_epiano1 vcsl_fmpiano gm_celesta gm_orchestral_harp';
  const STYLE = (mu, kit) => ({
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
          PERC(kit),
          mu('keys', KEYS_PICK, { label: 'Piano (accords)', optional: true }),
        ],
      },
      {
        id: 'poursuite',
        song: 'La poursuite',
        artist: 'Modèle',
        year: '',
        tempo: 144,
        desc: 'Une poursuite sur les toits, saut à 00:43,3. 36 mesures en Ré mineur à 144 BPM : ostinato 3+3+2 aux cordes graves, motif aux cors puis aux trompettes, accents des trombones, thème héroïque au saut.',
        musicians: [
          mu('lead', 'vsco_horn vsco_trumpet ' + THEME_PICK, { label: 'Thème (cor)', note: 'Le motif de poursuite, puis le thème héroïque en majeur au saut' }),
          mu('orch', 'gm_violin', { label: 'Orchestre', orch: true, ens: ['epique', ...ORCH.filter((e) => e !== 'epique')], note: 'Ostinato 3+3+2, accents des cuivres, plus dense quand l’énergie monte' }),
          PERC(kit, { note: 'Timbales, caisse claire, cymbales, grosse caisse et tam-tam' }, 'lt mt bd sd cr oh ht misc'),
          mu('keys', KEYS_PICK, { label: 'Piano (accords)', optional: true }),
        ],
      },
      {
        id: 'espaces',
        song: 'Les grands espaces',
        artist: 'Dans l’esprit de Out of Africa (John Barry, 1985)',
        year: '',
        tempo: 80,
        desc: 'Un survol au lever du jour. 55 mesures à 80 BPM : appels des cors sur les pédales de mi et de la, l’horizon en sol mineur et ré, repli en ré mineur, puis trois expositions du thème en do majeur avec leur fa mineur doux-amer. Violons en trémolo, cors à l’unisson, harpe, flûtes, tam-tam et grosse caisse. Mélodie originale.',
        musicians: [
          mu('lead', 'vsco_horn ' + THEME_PICK, { label: 'Thème (cors)', note: 'Appels, puis le grand thème : note longue liée par-dessus la barre, relance en croches' }),
          mu('orch', 'gm_violin', { label: 'Orchestre', orch: true, ens: ['romantique', ...ORCH.filter((e) => e !== 'romantique')], note: 'Bois, cor, harpe et cordes ; plus dense à chaque exposition' }),
          mu('strings', 'vsco_violins_trem vsco_violins', { label: 'Violons (trémolo)', note: 'Le tapis de l’ouverture, en trémolo' }),
          PERC(kit, { note: 'Tam-tam et grosse caisse sur l’élargissement, pas de timbales' }, 'bd misc'),
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
          mu('orch', 'gm_violin', { label: 'Orchestre', orch: true, ens: ['romantique', ...ORCH.filter((e) => e !== 'romantique')] }),
          PERC(kit),
          mu('keys', KEYS_PICK, { label: 'Piano (accords)', optional: true }),
        ],
      },
    ],
  });
  if (SS.BandSongs) {
    SS.BandSongs.lumiere = spec(LUMIERE);
    SS.BandSongs.poursuite = spec(POURSUITE);
    SS.BandSongs.espaces = spec(ESPACES);
    SS.BandSongs.scene = spec(blankScene());
  }
  if (SS.Band && SS.Band.addStyle) SS.Band.addStyle(STYLE(SS.Band.mu, SS.Band.kit));

  return { EMOS, emoOf, energyOf, tempoOf, fmt, timing, spec, gridFor, themeEvents, LUMIERE, POURSUITE, ESPACES, TEMPLATES, barsGrid, addHits, blankScene, editable, TEMPO_MIN, TEMPO_MAX,
    percHits, phraseArcs, DYN, HARMONY, HARM, autoHarm, harmOf, techGrid, CONT, INTV, RHY, EMO_MOTIF, motifFor, genMotif, proposals, TRANSFORMS, PHRASES, phrase, TREATMENTS, EMO_TREAT, treatOf, treatNotes, motifOf, chordAt, parseKey, scaleOf };
})();
