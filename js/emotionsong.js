/*
 * Chanson déduite d'un style et d'émotions (assistant Nouvelle chanson › « ✦ D'après une émotion »).
 * Maquette validée : maquettes/maquette-chanson-emotion.html (2026-11-24).
 *
 * On donne un style et jusqu'à trois émotions pondérées ; deduce() cherche les chansons de référence les plus proches
 * (js/songrefs.js : données seulement, jamais de mélodie) et en déduit :
 *   - tempo : moyenne des modèles du style (poids = proximité²), poussée ou freinée par l'énergie du mélange, dans la plage du style ;
 *   - mode : vote moitié émotions (leurs propositions évidence / nuance / surprise), moitié modèles ; on tranche d'abord
 *     entre côté clair (majeur, mixolydien, lydien) et côté sombre (mineur, dorien, phrygien, mineur harmonique) ;
 *   - tonique : la plus fréquente chez les modèles du même côté ;
 *   - orientation et forme : le modèle le plus proche du même côté ;
 *   - groupe : l'inspiration de l'assistant la plus proche dans le style (ses musiciens et ses sons), plus des rôles
 *     ajoutés par les émotions (arpège, cordes, piano) ;
 *   - scènes : chaque scène garde le mélange, en penchant vers l'émotion la plus calme dans les scènes calmes, vers la plus
 *     énergique dans les refrains et les drops, vers la plus tendue dans le pont et le break ;
 *   - accords par scène : grilles des modèles pour ce type de scène et propositions des émotions de la scène, gardées
 *     si 80 % de leurs notes tiennent dans le mode ; chaque type de scène prend la meilleure grille pas encore utilisée.
 * Tout est en fonctions pures (testées sous Node : tests/emotionsong.test.js).
 */
window.SS = window.SS || {};

SS.emotionSong = (() => {
  /** Styles voisins : une chanson de référence d'un style voisin compte à moitié. */
  const NEAR = {
    synthwave: ['edm', 'pop', 'techno'], edm: ['techno', 'pop', 'synthwave', 'dnb'], ambient: ['film', 'techno'], techno: ['edm', 'ambient'],
    pop: ['synthwave', 'soul', 'funk', 'cliches'], funk: ['soul', 'latin', 'pop'], hiphop: ['soul', 'funk', 'dnb'], dnb: ['edm', 'hiphop'],
    latin: ['funk', 'soul'], soul: ['funk', 'pop', 'hiphop'], cliches: ['pop', 'soul'], film: ['ambient'],
  };
  /** Plage de tempo par style (BPM). */
  const TEMPO = {
    synthwave: [85, 175], edm: [88, 130], ambient: [55, 100], techno: [118, 128], pop: [60, 160], funk: [95, 130], hiphop: [70, 100],
    dnb: [165, 178], latin: [72, 130], soul: [60, 125], cliches: [70, 160], film: [50, 140],
  };
  /** Types de scène : nom affiché et énergie (0–1). */
  const SCENES = {
    intro: ['Intro', 0.3], verse: ['Couplet', 0.5], pre: ['Pré-refrain', 0.65], build: ['Montée', 0.72], chorus: ['Refrain', 0.85],
    drop: ['Drop', 1], break: ['Break', 0.35], bridge: ['Pont', 0.55], solo: ['Solo', 0.7], theme: ['Thème', 0.6], groove: ['Groove', 0.6],
    peak: ['Sommet', 0.9], outro: ['Outro', 0.3],
  };
  /** Grille de repli d'un type de scène quand le modèle n'en a pas pour ce type. */
  const FALL = {
    intro: ['intro', 'verse', 'theme', 'groove', 'chorus', 'drop'], outro: ['outro', 'chorus', 'theme', 'drop', 'verse'],
    pre: ['pre', 'build', 'bridge', 'verse'], build: ['build', 'pre', 'bridge', 'verse', 'theme'], drop: ['drop', 'chorus', 'peak', 'theme'],
    chorus: ['chorus', 'drop', 'peak', 'theme'], peak: ['peak', 'chorus', 'drop', 'theme'], break: ['break', 'bridge', 'verse', 'theme'],
    bridge: ['bridge', 'break', 'pre', 'verse'], solo: ['solo', 'verse', 'chorus'], theme: ['theme', 'chorus', 'verse', 'drop', 'groove'],
    groove: ['groove', 'verse', 'theme', 'drop'], verse: ['verse', 'theme', 'groove', 'chorus', 'drop'],
  };
  /** Ordre de choix des grilles : les scènes fortes d'abord, pour que le refrain ait la meilleure. */
  const PICK_ORDER = ['chorus', 'drop', 'peak', 'verse', 'theme', 'groove', 'pre', 'build', 'bridge', 'break', 'solo', 'intro', 'outro'];
  const DARK = ['minor', 'dorian', 'phrygian', 'harmonic', 'locrian'];
  const MAX_EMOTIONS = 3;
  const SCENE_BARS = 8;
  const TOP = 6; // chansons modèles qui comptent

  const H = () => SS.harmony;
  const pcOf = (n) => ((n % 12) + 12) % 12;
  const modeIv = (mode) => (H().MODES.find((m) => m.id === mode) || H().MODES[0]).iv;
  const chordIv = (type) => (SS.CHORDS.find((c) => c.id === type) || SS.CHORDS[0]).iv;
  const emo = (id) => SS.findEmotion(id);

  /* ---------- chansons de référence ---------- */
  let refsMemo = null;
  /** Les chansons de référence lues : { title, artist, year, style, orientation, bpm, tonicPc, mode, emotions: [{ id, w }], roles, form, grids, model }. */
  function refs() {
    if (refsMemo) return refsMemo;
    refsMemo = (SS.SONG_REFS_RAW || []).map((r) => ({
      title: r[0], artist: r[1], year: r[2], style: r[3], orientation: r[4], bpm: r[5],
      tonic: r[6], tonicPc: pcOf(SS.LETTER_PC[r[6][0]] + (r[6][1] === '#' ? 1 : r[6][1] === 'b' ? -1 : 0)), mode: r[7],
      emotions: r[8].split(' ').map((x) => {
        const [id, w] = x.split(':');
        return { id, w: Number(w) / 100 };
      }),
      roles: r[9].split(' '), form: r[10].split(' '), grids: r[11], model: r[12] || null,
    }));
    return refsMemo;
  }

  /* ---------- accords en degrés ---------- */
  const ROM = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
  const ROMAN_OF = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
  /** « bVI », « ii7 », « IVmaj7 » → { semi (demi-tons au-dessus de la tonique), type (SS.CHORDS), tok } ; null si illisible. */
  function parseRoman(tok) {
    const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(|7|maj7|dim|sus2|sus4|add9)$/.exec(tok);
    if (!m) return null;
    const minor = m[2] === m[2].toLowerCase();
    const semi = pcOf(ROM[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0));
    const type = { '': minor ? 'min' : 'maj', 7: minor ? 'm7' : '7', maj7: 'maj7', dim: 'dim', sus2: 'sus2', sus4: 'sus4', add9: minor ? 'madd9' : 'add9' }[m[3]];
    return { semi, type, tok };
  }
  const parseGrid = (s) => String(s).trim().split(/\s+/).map(parseRoman).filter(Boolean);
  /** Degré écrit d'un accord : « bVI », « ii7 ». */
  function romanOf(semi, type) {
    const iv = chordIv(type);
    const minor = iv.includes(3) && !iv.includes(4);
    let r = ROMAN_OF[pcOf(semi)];
    if (minor) r = r.replace(/[IV]+/, (x) => x.toLowerCase());
    const suf = { m7: '7', '7': '7', maj7: 'maj7', dim: 'dim', sus2: 'sus2', sus4: 'sus4', add9: 'add9', madd9: 'add9', m9: '7', maj7s11: 'maj7' }[type] || '';
    return r + suf;
  }
  /** Proposition d'émotion (degrés dans son propre mode) → accords { semi, type, tok }. */
  function propChords(p) {
    const iv = modeIv(p.mode);
    return p.seq.map(([d, type, alt]) => {
      const semi = pcOf(iv[d] + (alt || 0));
      return { semi, type, tok: romanOf(semi, type) };
    });
  }
  /** Part des notes d'une grille qui tiennent dans le mode (0–1). */
  function fitIn(grid, mode) {
    const sc = new Set(modeIv(mode));
    let n = 0;
    let ok = 0;
    grid.forEach((c) => chordIv(c.type).forEach((i) => (n++, sc.has(pcOf(c.semi + i)) && ok++)));
    return n ? ok / n : 0;
  }

  /* ---------- émotions ---------- */
  /** Mélange normalisé : [{ id, w }] (poids 0–1, somme 1), au plus trois émotions connues, sans doublon. */
  function normMix(list) {
    const seen = new Set();
    const ok = (list || []).filter((e) => e && emo(e.id) && !seen.has(e.id) && seen.add(e.id) && Number(e.w) > 0).slice(0, MAX_EMOTIONS);
    const t = ok.reduce((a, e) => a + Number(e.w), 0);
    return t ? ok.map((e) => ({ id: e.id, w: Number(e.w) / t })) : [];
  }
  /** Point du mélange : [valence, énergie, tension] (0–100). */
  function dimsOf(mix) {
    const d = [0, 0, 0];
    mix.forEach((e) => emo(e.id).dims.forEach((v, i) => (d[i] += v * e.w)));
    return d;
  }

  /* ---------- styles de l'assistant ---------- */
  const styleOf = (id) => (SS.Band.STYLES || []).find((s) => s.id === id) || null;
  const appStyle = (id) => (id === 'film' ? null : styleOf(id));
  /** Styles proposés : ceux de l'assistant qui ont des chansons de référence (dans l'ordre de l'assistant), puis Musique de film
   * (film : false pour l'écarter ; une chanson de film déduite n'a pas encore d'inspiration où se poser). */
  function styles({ film = true } = {}) {
    const has = new Set(refs().map((r) => r.style));
    const out = SS.Band.STYLES.filter((s) => has.has(s.id) && !s.film).map((s) => ({ id: s.id, label: s.label }));
    return film ? [...out, { id: 'film', label: (SS.Band.STYLES.find((s) => s.film) || { label: 'Musique de film' }).label }] : out;
  }

  /**
   * Chanson déduite d'un style et d'émotions.
   * @param {{ style: string, emotions: Array<{id: string, w: number}> }} o
   * @returns {object|null} null si le style est inconnu ou sans émotion
   */
  function deduce({ style, emotions } = {}) {
    const mix = normMix(emotions);
    if (!mix.length || !TEMPO[style]) return null;
    const D = dimsOf(mix);
    // proximité de chaque chanson : émotions en commun et distance dans l'espace valence / énergie / tension, × style
    const scored = refs()
      .map((r) => {
        const common = mix.reduce((a, e) => a + Math.min(e.w, (r.emotions.find((x) => x.id === e.id) || { w: 0 }).w), 0);
        const rd = dimsOf(r.emotions);
        const dist = Math.hypot(rd[0] - D[0], rd[1] - D[1], rd[2] - D[2]) / 120;
        const emoScore = 0.55 * common + 0.45 * Math.max(0, 1 - dist);
        const styleScore = r.style === style ? 1 : (NEAR[style] || []).includes(r.style) ? 0.55 : 0.2;
        return { ref: r, score: emoScore * styleScore };
      })
      .sort((a, b) => b.score - a.score || a.ref.title.localeCompare(b.ref.title));
    const top = scored.slice(0, TOP);
    const W = top.map((x) => x.score * x.score);
    const Ws = W.reduce((a, b) => a + b, 0) || 1;

    // tempo : les modèles du style s'il y en a (un tempo de film ne dit rien d'un drum & bass), sinon tous
    const own = top.map((x, i) => [x, W[i]]).filter(([x]) => x.ref.style === style);
    const tw = own.length ? own : top.map((x, i) => [x, W[i]]);
    const tws = tw.reduce((a, [, w]) => a + w, 0) || 1;
    const baseBpm = tw.reduce((a, [x, w]) => a + x.ref.bpm * w, 0) / tws;
    const refEnergy = tw.reduce((a, [x, w]) => a + dimsOf(x.ref.emotions)[1] * w, 0) / tws;
    const [lo, hi] = TEMPO[style];
    const bpm = Math.round(Math.min(hi, Math.max(lo, baseBpm * (1 + (D[1] - refEnergy) / 220))));

    // mode : côté clair ou sombre, puis le mode le plus voté de ce côté
    const votes = {};
    const vote = (m, v) => (votes[m] = (votes[m] || 0) + v);
    mix.forEach((e) => emo(e.id).proposals.forEach((p, i) => vote(p.mode, 0.5 * e.w * [0.5, 0.3, 0.2][i])));
    top.forEach((x, i) => vote(x.ref.mode, (0.5 * W[i]) / Ws));
    const modeVotes = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const dark = modeVotes.filter(([m]) => DARK.includes(m)).reduce((a, [, v]) => a + v, 0);
    const side = dark > 1 - dark ? 'dark' : 'light';
    const mode = modeVotes.find(([m]) => DARK.includes(m) === (side === 'dark'))[0];

    // tonique : la plus fréquente chez les modèles du même côté (même mode : poids plein)
    const tv = {};
    top.forEach((x, i) => {
      const same = x.ref.mode === mode ? 1 : DARK.includes(x.ref.mode) === (side === 'dark') ? 0.5 : 0.1;
      tv[x.ref.tonicPc] = (tv[x.ref.tonicPc] || 0) + W[i] * same;
    });
    const tonicPc = Number(Object.entries(tv).sort((a, b) => b[1] - a[1])[0][0]);
    const fam = DARK.includes(mode) ? 'minor' : 'major';
    let tonic = SS.TONIC_NAMES[fam][tonicPc];
    if (!H().TONICS.includes(tonic)) tonic = SS.TONIC_NAMES[fam === 'minor' ? 'major' : 'minor'][tonicPc];
    const key = { tonic, mode };

    // orientation et forme : le modèle le plus proche du même côté
    const best = (top.find((x) => DARK.includes(x.ref.mode) === (side === 'dark')) || top[0]).ref;

    // inspiration de l'assistant : une chanson modèle qui y a son modèle, sinon l'inspiration du style la plus proche
    const st = appStyle(style);
    let model = null;
    if (st) {
      const hit = top.find((x) => x.ref.model && st.presets.some((p) => p.id === x.ref.model));
      const pid = hit ? hit.ref.model : nearestPreset(st, D);
      const p = st.presets.find((x) => x.id === pid);
      model = { style: st.id, preset: p.id, song: p.song, fromRef: !!hit };
    }

    // groupe : musiciens de l'inspiration (non facultatifs), plus les rôles appelés par les émotions
    const roles = groupRoles({ st, model, style, top, mix, D });

    // scènes et accords
    const scenes = best.form.map((type) => sceneOf(type, mix, D));
    const byType = {};
    scenes.forEach((s) => (byType[s.type] = byType[s.type] || s));
    Object.values(byType).forEach((s) => (s.grids = gridsFor(s, top, mode)));
    const used = new Set();
    Object.values(byType)
      .sort((a, b) => PICK_ORDER.indexOf(a.type) - PICK_ORDER.indexOf(b.type))
      .forEach((s) => {
        const g0 = s.grids[0];
        if (!g0) return (s.pick = -1);
        let j = s.type === 'intro' || s.type === 'outro' ? 0 : s.grids.findIndex((g) => !used.has(g.key) && g.score >= 0.4 * g0.score);
        if (j < 0) j = 0;
        s.pick = j;
        used.add(s.grids[j].key);
      });
    const sections = Object.values(byType).map((s) => ({ ...s, bars: SCENE_BARS }));
    return {
      style, mix, dims: D,
      refs: scored.slice(0, 8).map((x) => ({ ...x.ref, score: x.score })),
      tempo: { bpm, base: Math.round(baseBpm), energy: Math.round(D[1]), refEnergy: Math.round(refEnergy), range: [lo, hi] },
      key, side, modeVotes: modeVotes.map(([m, v]) => ({ mode: m, v })),
      orientation: { label: best.orientation, ref: best.title },
      model, roles,
      sections, // un type de scène = une section (même grille à chaque passage)
      form: best.form, // ordre des scènes (types)
    };
  }

  /** Inspiration du style dont l'émotion (js/band-songs.js) est la plus proche du mélange (en 4/4 d'abord : les grilles sont en 4/4). */
  function nearestPreset(st, D) {
    let best = st.presets[0].id;
    let bd = Infinity;
    st.presets.forEach((p) => {
      const sp = SS.BandSongs && SS.BandSongs[p.id];
      const e = sp && emo(sp.emotion);
      if (!e) return;
      const d = Math.hypot(e.dims[0] - D[0], e.dims[1] - D[1], e.dims[2] - D[2]) + (sp.meter && sp.meter !== '4/4' ? 1000 : 0);
      if (d < bd) (bd = d), (best = p.id);
    });
    return best;
  }

  /** Rôles du groupe : [{ role, why, added }]. */
  function groupRoles({ st, model, style, top, mix, D }) {
    const out = [];
    const has = (r) => out.some((x) => x.role === r);
    if (model) {
      const p = st.presets.find((x) => x.id === model.preset);
      p.musicians.filter((m) => !m.optional && m.role !== 'fx').forEach((m) => !has(m.role) && out.push({ role: m.role, why: `groupe de « ${p.song} »` }));
    } else {
      const seen = {};
      top.filter((x) => x.ref.style === style).forEach((x) => x.ref.roles.forEach((r) => (seen[r] = (seen[r] || 0) + 1)));
      Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([r]) => out.push({ role: r, why: 'habituel chez les modèles' }));
    }
    const w = (id) => (mix.find((e) => e.id === id) || { w: 0 }).w;
    const add = (role, why) => !has(role) && out.push({ role, why, added: true });
    if (w('emerveillement') + w('serenite') + w('mystere') >= 0.3 && style !== 'ambient') add('arp', 'émerveillement, sérénité ou mystère : petites notes répétées');
    if (w('triomphe') + w('espoir') >= 0.35 && !has('orch')) add('strings', 'triomphe ou espoir : des cordes pour élargir');
    if (w('tristesse') + w('tendresse') + w('nostalgie') >= 0.45 && ['pop', 'soul', 'film', 'hiphop', 'latin'].includes(style)) add('keys', 'émotion intime : un piano');
    return out;
  }

  /** Une scène : son type, son nom, son énergie et son mélange penché. */
  function sceneOf(type, mix, D) {
    const [name, energy] = SCENES[type] || [type, 0.5];
    let m = mix.map((e) => {
      const d = emo(e.id).dims;
      let k = 1 + (1.6 * (energy - 0.55) * (d[1] - D[1])) / 50;
      if (type === 'bridge' || type === 'break') k += (0.6 * (d[2] - D[2])) / 50;
      return { id: e.id, w: e.w * Math.max(0.15, k) };
    });
    const t = m.reduce((a, e) => a + e.w, 0);
    m = m.map((e) => ({ id: e.id, w: e.w / t })).sort((a, b) => b.w - a.w);
    return { type, name, energy, mix: m, emotion: m[0].id };
  }

  /** Grilles possibles d'une scène, les meilleures d'abord : [{ chords, from, score, key }]. */
  function gridsFor(s, top, mode) {
    const list = [];
    top.forEach((x) => {
      for (const f of FALL[s.type] || [s.type]) {
        const txt = x.ref.grids[f];
        if (!txt) continue;
        const g = parseGrid(txt);
        const fit = fitIn(g, mode);
        if (fit >= 0.8) list.push({ chords: g, from: { ref: x.ref.title, type: f }, score: x.score * fit ** 3 * (f === s.type ? 1 : 0.75) });
        break;
      }
    });
    s.mix.forEach((e) =>
      emo(e.id).proposals.forEach((p, i) => {
        const g = propChords(p);
        const fit = fitIn(g, mode);
        if (fit >= 0.8) list.push({ chords: g, from: { emotion: e.id, kind: p.kind }, score: 0.55 * e.w * [1, 0.8, 0.6][i] * fit ** 3 });
      })
    );
    const seen = new Set();
    return list
      .sort((a, b) => b.score - a.score)
      .map((g) => ({ ...g, key: g.chords.map((c) => c.tok).join(' ') }))
      .filter((g) => !seen.has(g.key) && seen.add(g.key));
  }

  /** Accords d'une grille dans une tonalité : [{ rootPc, type, name, grid: { degree, type, acc } }]. */
  function chordsIn(key, chords) {
    const t = H().scale(key)[0].pc;
    return chords.map((c) => {
      const rootPc = pcOf(t + c.semi);
      return { rootPc, type: c.type, name: H().chordName(key, { rootPc, type: c.type, bassPc: rootPc }), grid: H().toGridChord(key, { rootPc, type: c.type }) };
    });
  }

  /** D'où vient une grille, en clair : « Midnight City », « Midnight City, grille du couplet », « Nostalgie (évidence) ». */
  function fromText(g, type) {
    if (g.from.emotion) return `${emo(g.from.emotion).label} (${SS.EMOTION_KINDS[g.from.kind].toLowerCase()})`;
    return g.from.type === type ? g.from.ref : `${g.from.ref}, grille du ${(SCENES[g.from.type] || [g.from.type])[0].toLowerCase()}`;
  }

  return { MAX_EMOTIONS, NEAR, TEMPO, SCENES, refs, styles, deduce, parseRoman, parseGrid, propChords, fitIn, chordsIn, fromText, normMix, dimsOf };
})();
