/*
 * Musique de film d'après une émotion (assistant Nouvelle chanson › « ✦ D'après une émotion », style 🎬 Musique de film).
 * Maquette validée : maquettes/maquette-film-emotion.html (2026-11-24).
 *
 * Une émotion par passage de l'image (ou un mélange pour toute la scène) → une scène de film au format de js/film.js
 * (repères, tonalité, motif du thème, leitmotiv) et l'effectif de l'orchestre. Le vrai moteur (SS.film.timing / spec)
 * en tire ensuite le tempo calé, les mesures, l'harmonie, les nuances, les articulations et les percussions.
 *
 *   deduce({ passages, tempo, ens }) → { film, tm, spec, passages, total, mix, refs, key, keyFrom, ens, ensList, heart, adviseTempo }
 *     passages : [{ emo (SS.FILM_EMOTIONS k), s (secondes), name?, sync?, dlg?, ene?, ten? }]
 *     tempo : 'cale' (un tempo, calé sur la synchro forte) ou 'passage' (chaque passage au tempo de son émotion)
 *   fromMix(mix, total) → passages d'un mélange [{ emo, w }] (« Toute la scène »)
 *   STORIES : histoires toutes faites
 *
 * Fonctions pures (aucun DOM) : tests/filmemotion.test.js.
 */
window.SS = window.SS || {};

SS.filmEmotion = (() => {
  const F = () => SS.film;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const femo = (k) => SS.FILM_EMOTIONS.find((x) => x.k === k) || null;
  const dims = (k) => SS.findEmotion(femo(k).id).dims;
  const MAX_PASSAGES = 8;
  const MIN_SECONDS = 2;

  /** Histoires toutes faites : passages { emo, s (durée en secondes), name, sync, dlg }. */
  const STORIES = [
    { id: 'danger', name: 'Le danger approche', p: [
      { emo: 'suspense', s: 12, name: 'L’attente' }, { emo: 'peur', s: 14, name: 'Le danger' },
      { emo: 'heroisme', s: 12, name: 'Le sursaut', sync: true }, { emo: 'apaisement', s: 10, name: 'Après' } ] },
    { id: 'adieux', name: 'Les adieux', p: [
      { emo: 'nostalgie', s: 14, name: 'Le quai' }, { emo: 'tristesse', s: 18, name: 'Les mots', dlg: true },
      { emo: 'tristesse', s: 10, name: 'Le train part', sync: true }, { emo: 'espoir', s: 12, name: 'Seul' } ] },
    { id: 'decouverte', name: 'La découverte', p: [
      { emo: 'suspense', s: 10, name: 'La porte' }, { emo: 'emerveillement', s: 16, name: 'La vallée', sync: true },
      { emo: 'joie', s: 12, name: 'La course' }, { emo: 'apaisement', s: 8, name: 'Le soir' } ] },
    { id: 'traque', name: 'La traque', p: [
      { emo: 'suspense', s: 8, name: 'Dans l’ombre' }, { emo: 'peur', s: 12, name: 'Repéré' },
      { emo: 'colere', s: 12, name: 'Le combat', sync: true }, { emo: 'heroisme', s: 10, name: 'La victoire' } ] },
    { id: 'retour', name: 'Le retour à la vie', p: [
      { emo: 'tristesse', s: 14, name: 'La chambre' }, { emo: 'nostalgie', s: 10, name: 'Les photos' },
      { emo: 'espoir', s: 10, name: 'La fenêtre' }, { emo: 'heroisme', s: 12, name: 'Dehors', sync: true } ] },
  ];

  /** Énergie et tension d'un passage (1–5) tirées de l'émotion ; la synchro forte monte d'un cran (au moins 3). */
  function levels(p) {
    const [, en, te] = dims(p.emo);
    let ene = clamp(Math.round((en - 5) / 20), 1, 5);
    const ten = clamp(Math.round(1 + te / 25), 1, 5);
    if (p.emo === 'colere') ene = Math.min(5, ene + 1);
    if (p.sync) ene = clamp(Math.max(ene + 1, 3), 1, 5);
    return { ene, ten };
  }

  /** Effectif de l'orchestre (js/orchestra.js) : chaque émotion vote (poids = durée) ; Épique compte selon l'énergie. */
  const ENS_VOTE = {
    intime: { tristesse: 1, nostalgie: 1, apaisement: 0.7 },
    romantique: { espoir: 1, emerveillement: 0.8, joie: 0.8, nostalgie: 0.5, apaisement: 0.5 },
    epique: { heroisme: 1.3, colere: 1, peur: 0.6, joie: 0.2 },
    mystere: { suspense: 1.1, peur: 0.7, emerveillement: 0.3 },
  };
  const ENS = Object.keys(ENS_VOTE);
  function ensembles(ps) {
    return ENS.map((id) => ({ id, v: ps.reduce((a, p) => a + p.s * (ENS_VOTE[id][p.emo] || 0) * (id === 'epique' ? p.ene / 4 : 1), 0) })).sort((a, b) => b.v - a.v);
  }

  /** Mélange des émotions de toute la scène (poids = durée), au format de SS.emotionSong (3 au plus). */
  function sceneMix(ps) {
    const w = {};
    ps.forEach((p) => (w[femo(p.emo).id] = (w[femo(p.emo).id] || 0) + p.s));
    return Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => ({ id, w: v }));
  }

  /**
   * « Toute la scène » : un mélange (≤ 3 émotions pondérées) et une durée → les passages : le thème (émotion principale),
   * la deuxième émotion, le sommet (la plus énergique, avec la synchro forte), la fin (la plus calme). Deux passages
   * voisins de même émotion n'en font qu'un.
   */
  function fromMix(mix, total) {
    const list = (mix || []).filter((m) => femo(m.emo) && m.w > 0).sort((a, b) => b.w - a.w);
    if (!list.length) return [];
    const en = (k) => dims(k)[1];
    const main = list[0].emo;
    const hot = list.slice().sort((a, b) => en(b.emo) - en(a.emo))[0].emo;
    const calm = list.slice().sort((a, b) => en(a.emo) - en(b.emo))[0].emo;
    const second = list.find((m) => ![main, hot, calm].includes(m.emo));
    const plan = [{ emo: main, x: 0.3, name: 'Thème' }];
    if (second) plan.push({ emo: second.emo, x: 0.2, name: femo(second.emo).label });
    plan.push({ emo: hot, x: 0.3, name: 'Sommet', sync: true }, { emo: calm, x: 0.2, name: 'Fin' });
    const out = [];
    plan.forEach((p) => {
      const prev = out[out.length - 1];
      if (prev && prev.emo === p.emo) prev.x += p.x;
      else out.push({ ...p });
    });
    if (out.length === 1) out.push({ emo: main, x: 0.25, name: 'Fin' });
    out.forEach((p, i) => (p.sync = i > 0 && !!p.sync));
    if (!out.some((p) => p.sync)) out[1].sync = true;
    const sum = out.reduce((a, p) => a + p.x, 0);
    const T = Math.max(10, Number(total) || 40);
    return out.map(({ x, ...p }) => ({ ...p, s: Math.max(4, Math.round((T * x) / sum)) }));
  }

  /** Passages propres : émotion connue, durée ≥ 2 s, une seule synchro forte (jamais sur le premier). */
  function clean(passages) {
    let synced = false;
    return (passages || [])
      .filter((p) => p && femo(p.emo))
      .slice(0, MAX_PASSAGES)
      .map((p, i) => {
        const sync = i > 0 && !!p.sync && !synced;
        if (sync) synced = true;
        return { ...p, s: Math.max(MIN_SECONDS, Math.round(Number(p.s) || 8)), sync, dlg: !!p.dlg };
      });
  }

  /** Scène de film déduite des passages (voir l'en-tête). null s'il n'y a aucun passage. */
  function deduce({ passages, tempo = 'cale', ens = null } = {}) {
    let t = 0;
    const ps = clean(passages).map((p) => {
      const lv = levels(p);
      const q = { ...p, t, ene: clamp(Math.round(p.ene || lv.ene), 1, 5), ten: clamp(Math.round(p.ten || lv.ten), 1, 5) };
      t += p.s;
      return q;
    });
    if (!ps.length) return null;
    const total = t;
    // tonalité : le mélange de toute la scène et les musiques de film proches (js/emotionsong.js, style film) ;
    // l'entrée donne la couleur quand elle tranche nettement (très sombre ou très lumineuse)
    const mix = sceneMix(ps);
    const d = SS.emotionSong.deduce({ style: 'film', emotions: mix });
    const dark = !['major', 'lydian', 'mixolydian'].includes(d.key.mode);
    const v0 = dims(ps[0].emo)[0];
    const sharp = v0 <= 35 || v0 >= 75;
    const fam = (sharp ? v0 <= 35 : dark) ? 'minor' : 'major';
    const pc = (SS.LETTER_PC[d.key.tonic[0]] + (d.key.tonic.includes('♯') ? 1 : d.key.tonic.includes('♭') ? -1 : 0) + 12) % 12;
    const tonic = SS.TONIC_NAMES[fam][pc];
    // le cœur de la scène (la synchro forte, sinon le plus long passage) donne le motif du thème
    const heart = ps.find((p) => p.sync) || ps.slice().sort((a, b) => b.s - a.s)[0];
    const ensList = ensembles(ps);
    const mode = tempo === 'passage' ? 'passage' : 'cale';
    const film = {
      id: 'scene',
      title: 'Ma scène',
      key: `${tonic} ${fam}`,
      start: 0,
      end: total,
      bpm: null,
      cues: ps.map((p) => ({
        t: p.t, emo: p.emo, name: p.name || femo(p.emo).label, ten: p.ten, ene: p.ene,
        ...(p.sync ? { sync: true } : {}), ...(p.dlg ? { dlg: true } : {}), ...(mode === 'passage' ? { bpm: femo(p.emo).bpm } : {}),
      })),
      motif: F().motifFor(heart.emo),
      // le thème se tait sous le dialogue (leitmotiv « Silence »)
      leit: Object.fromEntries(ps.map((p, i) => [`p${i + 1}`, p.dlg ? 'tacet' : null]).filter(([, v]) => v)),
    };
    const bpms = ps.map((p) => femo(p.emo).bpm);
    return {
      film, tm: F().timing(film), spec: F().spec(film), passages: ps, total, mix,
      refs: d.refs.filter((r) => r.style === 'film').slice(0, 3),
      key: { tonic, mode: fam }, keyFrom: sharp ? 'entree' : 'scene',
      ens: ens && ENS_VOTE[ens] ? ens : ensList[0].id, ensList, heart,
      tempoMode: mode, adviseTempo: Math.max(...bpms) / Math.min(...bpms) >= 1.6 ? 'passage' : 'cale',
    };
  }

  return { STORIES, ENS, MAX_PASSAGES, levels, ensembles, sceneMix, fromMix, clean, deduce };
})();
