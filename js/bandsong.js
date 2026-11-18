/*
 * Band : « Créer toute la chanson ».
 * À partir d'un plan de chanson (js/band-songs.js : tonalité, sections, accords, ce que joue chaque musicien)
 * et des pistes créées par Band, écrit toutes les scènes (notes et pas de batterie) et l'arrangement.
 *
 * Tout est déterministe (générateur pseudo-aléatoire initialisé par l'inspiration et la section) :
 * la même inspiration donne toujours la même chanson. Les mélodies sont originales : un motif rythmique
 * et un contour sont tirés pour chaque section, puis répétés et variés (A A' A B) sur les accords.
 *
 * Plans « techno mélodique » (spec.tech) : en plus des notes, la chanson se sert des outils du séquenceur,
 * comme un producteur dans son DAW :
 *  - automation (track.auto) : intro planante dont le filtre s'ouvre lentement, montée qui fait grimper le
 *    passe-haut et lâche la reverb, drop qui repart filtre grand ouvert, outro qui se referme ;
 *  - ratchets (rat) : roulement de caisse claire qui s'emballe à la fin de la montée, petits trilles de charleston ;
 *  - conditions de déclenchement (cond) : charleston fantôme et percussions qui varient d'un passage à l'autre ;
 *  - musicien « Effets » : montée de bruit blanc, nappe d'ambiance, impact au début du drop.
 *
 * Réglages par scène (option parts de build, assistant pas à pas) : { [section]: { drums, bass, pad, arp, off } }.
 * Sans parts (ou vide), la chanson est exactement celle du plan. Tout est facultatif :
 *  - drums { style, pattern, edits, fill, fillType, crash } : pattern = identifiant d'un motif de js/drum-patterns.js,
 *    edits = pistes K S C H O (16 caractères) qui remplacent celles du motif. Avec un motif, bd ← K, sd ← S, cp ← C
 *    (ou S si C est vide), hh ← H, oh / rd ← O ; les toms ne jouent que dans un fill « toms » ; rim, sh, tb… gardent le
 *    jeu du plan. fill : off | end (dernière mesure) | 4 | 8 (une mesure sur 4 / 8) ; fillType : roll toms clap4 kick cut open
 *    (dès le pas « from » du fill, le motif est remplacé par le fill, sauf le kick au pas « from » ; « cut » coupe) ;
 *    crash : cymbale crash au premier pas. Sans motif, fill et crash s'ajoutent au jeu du plan (fill, même « off »,
 *    remplace alors le roulement automatique de fin de section) ; edits peut aussi être la grille de l'assistant (bars, une piste par
 *    pièce du kit, rat, cond : voir gridSteps) et build la progression d'une scène de montée (voir rollBar) ;
 *  - bass { mode, pedal: none | tonic | fifth, approach, register: low | mid } : mode remplace celui du plan (et peut
 *    allumer la basse ; s'ajoutent half et quarter) ; pedal joue la tonique (ou la quinte) de la tonalité sous tous les
 *    accords, sans notes d'approche ; approach false les supprime ; mid = une octave plus haut ;
 *  - pad { mode, voicing: close | open } ; arp { mode } : remplacent ceux du plan (et peuvent les allumer) ;
 *  - arp { one } : réglages d'Arp One (js/arp.js, SS.Arp.normalize) ; les accords de la scène passent dans l'arpégiateur
 *    (voicing médium 57-76, tempo nominal 120 BPM, boucle 0 : déterministe), les notes sont placées sur la grille de pas.
 *    one l'emporte sur mode ; il faut que js/arp.js soit chargé, sinon mode / plan ;
 *  - off : rôles muets dans la scène (['arp', 'lead']) ;
 *  - lead { events: [{ step, len, notes: [midi], vel }] } : la mélodie de la scène (étape Mélodie de l'assistant, panneau
 *    d'Harmonie). Elle remplace celle du moteur sur la première piste chantante présente (lead, puis vox, puis sax) ;
 *    [] = silence ; elle joue aussi dans une scène où l'inspiration ne chante pas (sauf rôle coupé par off).
 *    Les autres pistes chantantes gardent leur mélodie.
 *
 * Type d'instrument (option kinds de build) : chaque instrument a un type parmi KINDS = drums, bass, chords, arp, melody.
 * Le type choisit le générateur qui joue ses notes. Par défaut c'est celui de son rôle (DEFAULT_KIND : drums et perc →
 * drums, bass → bass, pad, strings, keys, guitar → chords, arp, arpchord → arp, lead, vox, sax → melody ; fx n'a pas
 * de type). Identifiant d'instrument : « musicien:clé » de t.band (la clé de colonne de l'assistant), suivi de « #n »
 * pour le n-ième doublon ; sans t.band.musician, la clé seule. kinds = { [idInstrument]: type } (repli : t.id, puis t.kind).
 *  - Un kit de batterie (piste drum) ne peut être que drums (checkKind) : tout autre type est ignoré.
 *  - bass : basse (registre grave) ; chords : accords plaqués ou tenus (53-76) ; arp : arpège des accords (60-79, ou Arp One) ;
 *    melody : mélodie du moteur (même mélodie que le lead pour le premier, une autre graine pour chaque autre : la
 *    graine contient le rôle de la piste et son « #n ») ; drums : notes courtes sur la fondamentale de l'accord (36-47),
 *    jouées sur la grosse caisse et la caisse claire du motif de la scène (parts.drums, ou le jeu du plan).
 *  - Un instrument dont le type a changé ne reprend pas les réglages de son rôle : son mode vient de inst.mode, sinon du
 *    mode du plan pour ce type dans la section (sec.arp, sec.pad, sec.lead…), sinon d'un mode par défaut (DEFAULT_MODE).
 *    Il reste muet là où son propre rôle est muet dans le plan, sauf si inst.mode (ou inst.one) l'allume.
 * Réglages par instrument et par scène : parts[section].inst[idInstrument] = { mode, off, ...réglages du type }, avec repli
 * sur les réglages du rôle (parts[section][rôle]) tant que le type est celui du rôle. Champs : bass { mode, pedal,
 * approach, register, accents } (accents : voir « accents de la basse » plus bas) ; chords { mode, voicing } ; arp { mode, one } ; melody { mode, character, notes, rhythm,
 * complexity, range, ending, form, plan, seeds, lead: { events }, double: 'octave' | 'third' } (double : copie de la
 * mélodie du premier instrument mélodique, une octave au-dessus ou une tierce diatonique au-dessus) ; drums
 * (instrument mélodique) { mode: both | kick | snare, pattern, style, edits } ; kit de batterie { pattern, style,
 * edits, fill, fillType, crash } (clé : id de la pièce ou id du musicien) ; off : true coupe l'instrument dans la scène.
 * Musicien ajouté à l'assistant (id « x1 », « x2 »… : js/bandgroup.js, isExtra) : il joue dans toutes les scènes avec le générateur de son type
 *    (jamais muet d'office : mode du plan pour ce type, sinon mode par défaut) et sa graine contient son id (autre mélodie, autre motif de kit).
 * Automation par scène : inst[id].auto (voir « automation par scène » plus bas). Sans kinds ni inst, la chanson est exactement celle d'avant.
 */
window.SS = window.SS || {};

SS.bandSong = (() => {
  const H = () => SS.harmony;
  const pcOf = (n) => ((n % 12) + 12) % 12;
  const SPB = 16; // pas par mesure (4/4)

  const NAMES = {
    intro: 'Intro', verse: 'Couplet', verse2: 'Couplet 2', pre: 'Pré-refrain', chorus: 'Refrain', chorus2: 'Refrain final', post: 'Post-refrain',
    bridge: 'Pont', break: 'Break', break2: 'Break 2', build: 'Montée', build2: 'Montée 2', drop: 'Drop', drop2: 'Drop final',
    instr: 'Instrumental', solo: 'Solo', outro: 'Outro', groove: 'Groove', peak: 'Sommet', theme: 'Thème', riff: 'Riff',
  };

  /* ---------- nuances (vélocité) ----------
   * Toutes les parties passent par trois règles, comme un musicien :
   *  1. la nuance de la section (ENERGY) : intro et pont retenus, refrain et drop à pleine force ;
   *  2. l'accent métrique (ACCENT) : temps 1 > temps 3 > temps 2 et 4 > contretemps > doubles-croches,
   *     plus ou moins marqué selon le rôle (DEPTH) ;
   *  3. le phrasé : respiration sur 4 mesures, notes aiguës de la mélodie plus fortes, fins de phrase adoucies.
   * La batterie a en plus des ghost notes de caisse claire, un charleston accentué et des roulements en crescendo.
   */
  const ENERGY = {
    intro: 0.8, verse: 0.86, verse2: 0.88, pre: 0.9, chorus: 1, chorus2: 1, post: 0.92, bridge: 0.8, break: 0.78, break2: 0.78,
    build: 0.9, build2: 0.9, drop: 1, drop2: 1, instr: 0.95, solo: 0.97, outro: 0.8, groove: 0.9, peak: 1, theme: 0.88, riff: 0.95,
  };
  const ACCENT = (s) => {
    const p = s % SPB;
    return p === 0 ? 1 : p === 8 ? 0.96 : p % 4 === 0 ? 0.92 : p % 2 === 0 ? 0.86 : 0.8;
  };
  const DEPTH = { bass: 0.6, arp: 1, lead: 0.5, vox: 0.5, sax: 0.5, pad: 0.3, strings: 0.4, keys: 0.7, guitar: 0.8 };
  const clampV = (v) => Math.round(Math.max(0.12, Math.min(1, v)) * 100) / 100;

  /* ---------- accents de la basse ----------
   * parts[section].inst[id].accents = { steps: [pas en doubles-croches dans la période], repeat: 1 | 2 | 'scene', force: 0..100,
   * filter: bool, bright: 0..100 }. La période est 16 pas (repeat 1 : le motif d'une mesure revient à chaque mesure), 32 pas
   * (repeat 2 : motif de 2 mesures) ou toute la scène. Une note de basse qui commence sur un pas accentué (pas modulo la période)
   * est plus forte : vélocité + ACC_VEL × force / 100 (ACC_VEL = 27 / 127 : de la vélocité 100 à 127 pour force 100) ; avec
   * filter, la note porte aussi ev.acc (accent du séquenceur : le filtre s'ouvre sur la note, voir SS.accentParams) et
   * ev.accAmt = bright / 100 (jusqu'où il s'ouvre ; remplace le réglage « accent » du son pour cette note). Sans accents : rien ne change.
   */
  const ACC_VEL = 27 / 127;
  const ACC_DEFAULT = { steps: [], repeat: 1, force: 75, filter: false, bright: 60 };
  const accentPeriod = (repeat, bars) => (repeat === 'scene' ? Math.max(1, bars) * SPB : repeat === 2 ? 2 * SPB : SPB);
  /** Accents propres : pas entiers uniques triés, répétition valide, force et brillance bornées (null : pas un objet). */
  function normalizeAccents(a) {
    if (!a || typeof a !== 'object') return null;
    const n = (x, d) => Math.max(0, Math.min(100, Math.round(Number.isFinite(+x) && x !== null && x !== '' ? +x : d)));
    const steps = [...new Set((Array.isArray(a.steps) ? a.steps : []).map(Number).filter((s) => Number.isInteger(s) && s >= 0))].sort((x, y) => x - y);
    return { steps, repeat: a.repeat === 2 || a.repeat === 'scene' ? a.repeat : 1, force: n(a.force, ACC_DEFAULT.force), filter: !!a.filter, bright: n(a.bright, ACC_DEFAULT.bright) };
  }
  /** Motifs d'accents prêts : [identifiant, nom, aide, répétition conseillée]. */
  const ACC_PRESETS = [
    ['none', 'Aucun', '', 1],
    ['strong', 'Temps forts', '1 et 3', 1],
    ['beat', 'Chaque temps', '', 1],
    ['off', 'Contretemps', 'les « et »', 1],
    ['gallop', 'Galop', '1re de chaque groupe', 2],
    ['sync', 'Synco 3-3-2', '', 1],
    ['rand', 'Aléatoire léger', 'un nouveau tirage', 1],
  ];
  /**
   * Pas accentués d'un motif prêt. notesSteps : pas où une note commence (modulo la période, ou dans la scène) ; period : 16, 32 ou
   * la longueur de la scène ; seed : graine de « rand » (même graine, même tirage). Ne rend que des pas où il y a une note, dans [0, period).
   */
  function accentPreset(id, notesSteps, period, seed = 0) {
    const has = new Set((notesSteps || []).map((s) => ((s % period) + period) % period));
    const want = {
      none: () => false,
      strong: (s) => s % 16 === 0 || s % 16 === 8,
      beat: (s) => s % 4 === 0,
      off: (s) => s % 4 === 2,
      gallop: (s) => s % 6 === 0,
      sync: (s) => [0, 6, 12].includes(s % 16),
    }[id];
    const out = [];
    if (id === 'rand') {
      const r = rng('accents/' + seed);
      const pool = [...has].sort((a, b) => a - b);
      pool.forEach((s) => r() < 0.22 && out.push(s));
      // jamais vide : un tirage sans accent se lirait « Aucun »
      if (!out.length && pool.length) out.push(pool[Math.floor(r() * pool.length)]);
    } else if (want) for (let s = 0; s < period; s++) if (has.has(s) && want(s)) out.push(s);
    return out;
  }
  /** Marque les notes de la basse qui tombent sur un pas accentué (modifie et rend `events`). */
  function applyAccents(events, accents, bars) {
    const A = normalizeAccents(accents);
    if (!A || !A.steps.length) return events;
    const period = accentPeriod(A.repeat, bars);
    const on = new Set(A.steps.filter((s) => s < period));
    events.forEach((e) => {
      if (!on.has(e.step % period)) return;
      e.vel = clampV(e.vel + (ACC_VEL * A.force) / 100);
      if (A.filter) {
        e.acc = true;
        e.accAmt = A.bright / 100;
      }
    });
    return events;
  }

  /* ---------- automation par scène ----------
   * parts[section].inst[id].auto = { [param]: { shape, a, b, period?, points?, from?, hidden? } } (tout instrument, kit compris).
   * param : un réglage de SS.AUTO_PARAMS (filter, res, volume, reverb, echo, space, vcf, fdecay, lfoamt : voir SCENE_AUTO) ou
   * « vel » (vélocité). a, b, points : valeurs normalisées 0..1 de l'étendue du réglage (min..max de SCENE_AUTO) ; pas = doubles
   * croches depuis le début de la scène. Formes (shape), avec L = longueur de la scène en pas :
   *   flat   : a partout ;                                   rise / fall : a au pas 0 → b au dernier pas (droite) ;
   *   open   : a → b au milieu → a (ouvre puis ferme) ;      close : idem, b est le creux (ferme puis ouvre) ;
   *   lfo    : b + (a / 2) × sinus, période `period` mesures (1, 2 ou 4), a = profondeur, b = centre ;
   *   steps  : une marche par mesure, de a à b ;             final : a jusqu'aux 2 dernières mesures, puis monte à b ;
   *   breath : de a à b et retour, sur 2 mesures (cosinus) ; drawn : `points` [[pas, valeur]] posés à la main (from : la forme
   *   d'origine, a, b, period gardés pour « Revenir à la forme »). hidden : seul l'affichage est replié, la courbe joue.
   * Écriture : chaque courbe devient track.auto[param] = { pas: valeur réelle } de la scène (celle de la scène, le pas 0 est son
   * début) pour toutes les pistes de l'instrument (un kit : toutes ses pièces). Elle REMPLACE, pour ce réglage et cette scène,
   * la courbe du plan (intro qui s'ouvre, riser, fondu) ; wizmix.js passe après : il met à l'échelle « volume » et ajoute ses envois
   * à « reverb » / « echo » / « space », et remplace « filter » seulement si son filtre est allumé. Un instrument sans note
   * (muet, scène vide) n'a pas de courbe. « vel » n'est pas une courbe de piste : la valeur (30..127, 100 = inchangé) multiplie
   * la vélocité de chaque note (ou coup de batterie) à son pas, AVANT les accents de la basse (l'accent s'ajoute ensuite).
   * Sans `auto`, rien ne change.
   */
  const AUTO_SHAPES = ['flat', 'rise', 'fall', 'open', 'close', 'lfo', 'steps', 'final', 'breath', 'drawn'];
  /** Réglages automatisables d'une scène : id (celui de SS.AUTO_PARAMS, ou « vel »), étendue réelle, valeur neutre. */
  const SCENE_AUTO = [
    { id: 'filter', name: 'Cutoff', menu: 'Cutoff (Filtre)', sub: 'filtre de la piste', min: -1, max: 1, def: 0, color: '#ff9a2e' },
    { id: 'res', name: 'Résonance', min: 0, max: 1, def: 0, color: '#ff6b8b' },
    { id: 'vel', name: 'Vélocité', sub: 'module les notes de la scène', min: 30, max: 127, def: 100, color: '#3fcf3f', notes: true },
    { id: 'volume', name: 'Volume', min: 0, max: 1, def: 1, color: '#b4b4c2' },
    { id: 'reverb', name: 'Reverb', min: 0, max: 1, def: 0, color: '#4f8cff' },
    { id: 'echo', name: 'Écho', min: 0, max: 1, def: 0, color: '#33b5ff' },
    { id: 'space', name: 'Cosmos', sub: 'reverb longue', min: 0, max: 1, def: 0, color: '#7b83ff' },
    { id: 'vcf', name: 'Cutoff du son', sub: 'filtre de la voix', min: -1, max: 1, def: 0, color: '#ffd23f', voice: true },
    { id: 'fdecay', name: 'Decay du filtre', min: -1, max: 1, def: 0, color: '#d9a066', voice: true },
    { id: 'lfoamt', name: 'Quantité des LFO', min: 0, max: 2, def: 1, color: '#e879c8', voice: true },
  ];
  const sceneParam = (id) => SCENE_AUTO.find((p) => p.id === id);
  const AUTO_DEF = {
    flat: { a: 0.5, b: 0.5 }, rise: { a: 0.2, b: 0.7 }, fall: { a: 0.7, b: 0.2 }, open: { a: 0.2, b: 0.8 }, close: { a: 0.8, b: 0.2 },
    lfo: { a: 0.4, b: 0.5, period: 2 }, steps: { a: 0.2, b: 0.8 }, final: { a: 0.3, b: 0.9 }, breath: { a: 0.3, b: 0.8 },
  };
  const unit = (v) => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
  /** Valeur normalisée d'une valeur réelle, et inversement. */
  const autoNorm = (param, real) => unit((real - sceneParam(param).min) / (sceneParam(param).max - sceneParam(param).min));
  const autoReal = (param, n) => {
    const p = sceneParam(param);
    return Math.round((p.min + n * (p.max - p.min)) * 1000) / 1000;
  };
  /** Courbe neuve d'un réglage : forme `shape` (plate, au niveau neutre du réglage), réglages par défaut de la forme. */
  function newAutoSpec(param, shape = 'flat') {
    const d = AUTO_DEF[shape];
    return shape === 'flat' ? { shape, a: autoNorm(param, sceneParam(param).def), b: autoNorm(param, sceneParam(param).def) } : { shape, ...d };
  }
  /** Courbe propre : forme connue, a / b bornés, période 1, 2 ou 4, points triés à pas entiers uniques (null : inutilisable). */
  function normalizeAutoSpec(s) {
    if (!s || typeof s !== 'object') return null;
    const shape = AUTO_SHAPES.includes(s.shape) ? s.shape : 'flat';
    const d = AUTO_DEF[shape === 'drawn' ? AUTO_SHAPES.includes(s.from) && s.from !== 'drawn' ? s.from : 'rise' : shape];
    const n = (x, f) => unit(Number.isFinite(+x) && x !== null && x !== '' ? +x : f);
    const o = { shape, a: n(s.a, d.a), b: n(s.b, d.b) };
    const per = shape === 'lfo' || s.period != null || s.from === 'lfo' ? +s.period : 0;
    if (shape === 'lfo' || per) o.period = [1, 2, 4].includes(per) ? per : 2;
    if (shape === 'drawn') {
      const pts = new Map();
      (Array.isArray(s.points) ? s.points : []).forEach((p) => Array.isArray(p) && Number.isInteger(+p[0]) && +p[0] >= 0 && Number.isFinite(+p[1]) && pts.set(+p[0], unit(+p[1])));
      if (!pts.size) return { ...o, shape: AUTO_SHAPES.includes(s.from) && s.from !== 'drawn' ? s.from : 'flat' };
      o.points = [...pts].sort((x, y) => x[0] - y[0]);
      if (AUTO_SHAPES.includes(s.from) && s.from !== 'drawn') o.from = s.from;
    }
    if (s.hidden) o.hidden = true;
    return o;
  }
  /** `auto` propre d'un instrument : ne garde que les réglages connus aux courbes valides ; null si rien. */
  function normalizeAuto(a) {
    if (!a || typeof a !== 'object') return null;
    const out = {};
    SCENE_AUTO.forEach((p) => {
      const s = normalizeAutoSpec(a[p.id]);
      if (s) out[p.id] = s;
    });
    return Object.keys(out).length ? out : null;
  }
  /** Points de rupture [[pas, valeur 0..1]] d'une courbe sur une scène de `len` pas (pas croissants, entiers, dans [0, len − 1]). */
  function autoPoints(spec, len) {
    const s = normalizeAutoSpec(spec) || { shape: 'flat', a: 0.5, b: 0.5 };
    const last = Math.max(0, Math.round(len) - 1);
    const bars = Math.max(1, Math.round(len / SPB));
    const { a, b } = s;
    let p = [];
    if (s.shape === 'drawn') p = s.points.filter(([x]) => x <= last);
    else if (s.shape === 'flat') p = [[0, a], [last, a]];
    else if (s.shape === 'rise' || s.shape === 'fall') p = [[0, a], [last, b]];
    else if (s.shape === 'open' || s.shape === 'close') p = [[0, a], [Math.round(last / 2), b], [last, a]];
    else if (s.shape === 'lfo' || s.shape === 'breath') {
      const per = (s.shape === 'lfo' ? s.period || 2 : 2) * SPB;
      const f = (x) => (s.shape === 'lfo' ? b + (a / 2) * Math.sin((2 * Math.PI * x) / per) : a + (b - a) * (0.5 - 0.5 * Math.cos((2 * Math.PI * x) / per)));
      for (let x = 0; x < last; x += 2) p.push([x, f(x)]);
      p.push([last, f(last)]);
    } else if (s.shape === 'steps')
      for (let i = 0; i < bars; i++) {
        const v = bars > 1 ? a + ((b - a) * i) / (bars - 1) : a;
        p.push([Math.min(last, i * SPB), v], [Math.min(last, (i + 1) * SPB - 1), v]);
      }
    else if (s.shape === 'final') p = [[0, a], [Math.min(last, (bars - 2) * SPB), a], [last, b]];
    const m = new Map();
    p.forEach(([x, y]) => m.set(Math.max(0, Math.min(last, x)), unit(y)));
    return [...m].sort((x, y) => x[0] - y[0]);
  }
  /** Courbe d'une scène de `len` pas : { pas: valeur 0..1 }, prête à être mise à l'échelle du réglage (autoReal). */
  const autoCurve = (spec, len) => Object.fromEntries(autoPoints(spec, len));
  /** Valeur 0..1 de la courbe au pas `s` (droites entre les points, tenue avant le premier et après le dernier). */
  function autoAt(points, s) {
    if (!points.length) return 0;
    if (s <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++)
      if (s <= points[i][0]) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (s - x0)) / (x1 - x0);
      }
    return points[points.length - 1][1];
  }
  /** Courbe d'une scène en valeurs réelles d'un réglage de piste : { pas: valeur } pour track.auto[param]. */
  const autoLane = (param, spec, len) => Object.fromEntries(autoPoints(spec, len).map(([x, y]) => [x, autoReal(param, y)]));
  /** Multiplicateur de vélocité au pas `s` d'après la courbe « vel » (vél. 100 = ×1). */
  const velMul = (spec, len) => {
    const pts = autoPoints(spec, len);
    return (s) => autoReal('vel', autoAt(pts, s)) / 100;
  };
  /** Applique la courbe de vélocité aux notes (events) ou aux coups de batterie (steps) d'une partie. */
  function applyVelCurve(d, spec, bars) {
    const mul = velMul(spec, bars * SPB);
    if (d.events) d.events.forEach((e) => (e.vel = clampV(e.vel * mul(e.step))));
    if (d.steps) for (let s = 0; s < d.steps.length; s++) if (d.steps[s] > 0) d.steps[s] = clampV(d.steps[s] * mul(s));
    return d;
  }
  /** Écrit les courbes de réglages d'un instrument dans track.auto de la scène (rien si la partie n'a ni note ni coup). */
  function applyAutoLanes(d, auto, bars) {
    const A = normalizeAuto(auto);
    if (!A || !(d.events ? d.events.length : d.steps && d.steps.some((v) => v > 0))) return d;
    const lanes = {};
    Object.entries(A).forEach(([param, spec]) => param !== 'vel' && (lanes[param] = autoLane(param, spec, bars * SPB)));
    if (Object.keys(lanes).length) d.auto = { ...(d.auto || {}), ...lanes };
    return d;
  }

  /** Applique nuance, accents et phrasé aux notes d'une partie (vélocités déjà tirées autour de leur valeur de base). */
  function shapeVel(events, role, { energy, bars, build }) {
    const n = bars * SPB;
    const melodic = ['lead', 'vox', 'sax'].includes(role);
    // hauteur moyenne de chaque phrase de 2 mesures (les notes plus aiguës que la moyenne sont chantées plus fort)
    const mean = new Map();
    if (melodic)
      events.forEach((e) => {
        const ph = Math.floor(e.step / (2 * SPB));
        const m = mean.get(ph) || { s: 0, c: 0 };
        m.s += e.notes[0];
        m.c++;
        mean.set(ph, m);
      });
    events.forEach((e, i) => {
      let v = e.vel * (1 - (DEPTH[role] ?? 0.5) * (1 - ACCENT(e.step)));
      v *= build ? 0.76 + 0.3 * (e.step / n) : energy;
      v *= 0.96 + 0.06 * Math.sin((Math.PI * (e.step % (4 * SPB))) / (4 * SPB)); // respiration sur 4 mesures
      if (role === 'arp') v *= 0.92 + 0.1 * Math.sin((Math.PI * (e.step % (2 * SPB))) / (2 * SPB)); // vague sur 2 mesures
      if (melodic) {
        const m = mean.get(Math.floor(e.step / (2 * SPB)));
        v *= Math.max(0.9, Math.min(1.1, 1 + 0.015 * (e.notes[0] - m.s / m.c)));
        const next = events[i + 1];
        if (!next || next.step >= e.step + e.len + 4) v *= 0.92; // fin de phrase (suivie d'un silence)
      }
      e.vel = clampV(v);
    });
    return events;
  }

  /* ---------- hasard reproductible ---------- */
  function rng(seed) {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  function weighted(r, table) {
    const tot = Object.values(table).reduce((a, b) => a + b, 0);
    let x = r() * tot;
    for (const [k, w] of Object.entries(table)) if ((x -= w) <= 0) return k;
    return Object.keys(table)[0];
  }
  const vel = (r, v, spread = 0.08) => Math.round(Math.max(0.2, Math.min(1, v + (r() - 0.5) * spread)) * 100) / 100;

  /* ---------- tonalité et accords ---------- */
  function parseKey(s) {
    const [tonic, mode] = s.split(' ');
    return { tonic, mode: mode || 'major' };
  }
  const NUM = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
  /**
   * Gamme de référence des chiffres romains : le majeur ou le mineur naturel de même tonique (comme en analyse
   * harmonique). En Do dorien, « VI » est donc La♭ (et non La, 6e degré du mode, qui sonnerait faux sous le
   * Do mineur) ; la couleur du mode s'écrit dans les accords (« IV » = Fa majeur, avec son La naturel).
   */
  function refScale(key) {
    const m = H().MODES.find((x) => x.id === key.mode);
    return H().scale({ tonic: key.tonic, mode: m && m.fam === 'major' ? 'major' : 'minor' });
  }
  /**
   * « vi », « IV », « bVII », « V7 », « iim7 »… → { rootPc, type }.
   * Majuscule : accord majeur ; minuscule : mineur. Suffixes : 7 (7 de dominante ou m7), maj7, 9, add9, sus2, sus4,
   * 7sus4, 6, dim (ou °), m7b5 (ou ø), 5.
   */
  function parseChord(tok, key) {
    const m = tok.match(/^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
    if (!m) throw new Error('accord inconnu : ' + tok);
    const deg = NUM.indexOf(m[2].toLowerCase());
    const minor = m[2] === m[2].toLowerCase();
    const acc = m[1] === 'b' || m[1] === '♭' ? -1 : m[1] ? 1 : 0;
    const rootPc = pcOf(refScale(key)[deg].pc + acc);
    const s = m[3];
    const T = {
      '': minor ? 'min' : 'maj', 7: minor ? 'm7' : '7', maj7: 'maj7', m7: 'm7', 9: minor ? 'm9' : '9', add9: minor ? 'madd9' : 'add9',
      sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', 6: minor ? 'm6' : '6', dim: 'dim', '°': 'dim', dim7: 'dim7', m7b5: 'm7b5', ø: 'm7b5', 5: '5', maj9: 'maj9',
      '7no3': '7no3', '5add9': '5add9', add4: minor ? 'madd4' : 'add4',
    };
    if (!(s in T)) throw new Error('suffixe inconnu : ' + tok);
    return { rootPc, type: T[s], tok };
  }
  /** Accords d'une section, mesure par mesure (« i/VII » = deux accords dans la mesure), répétés jusqu'à la fin. */
  function spansOf(sec, key, bars) {
    const toks = sec.chords.split(/\s+/).filter((t) => t && t !== '|');
    const out = [];
    for (let b = 0; b < bars; b++) {
      const parts = toks[b % toks.length].split('/');
      const len = SPB / parts.length;
      parts.forEach((p, i) => out.push({ step: b * SPB + i * len, len, chord: parseChord(p, key), bar: b }));
    }
    return out;
  }
  /**
   * Accords d'une grille de l'assistant (comme la grille d’Harmonie : { step, len, degree, type, acc, bass? }, degrés dans
   * la tonalité de la scène) → spans. Les trous sont comblés par l'accord précédent (le premier commence au début).
   */
  function spansFromGrid(list, key, bars) {
    const total = bars * SPB;
    const cs = list
      .filter((c) => c.step < total && c.len > 0)
      .sort((a, b) => a.step - b.step)
      .map((c) => {
        const g = H().gridChord(key, c.degree, c.type, c.acc || 0, c.bass || 0);
        return { step: c.step, len: c.len, chord: { rootPc: g.rootPc, type: c.type, tok: g.name, ...(g.bassPc != null ? { bassPc: g.bassPc } : {}) } };
      });
    if (!cs.length) return null;
    cs[0].len += cs[0].step;
    cs[0].step = 0;
    cs.forEach((c, i) => {
      const next = cs[i + 1];
      c.len = (next ? next.step : total) - c.step;
    });
    return cs.filter((c) => c.len > 0).map((c) => ({ ...c, bar: Math.floor(c.step / SPB) }));
  }
  const tones = (c) => SS.chordNotes(60 + c.rootPc, c.type).map(pcOf);
  const semi = (a, b) => pcOf(a - b) === 1 || pcOf(b - a) === 1;
  /**
   * Gamme du moment, pour les notes de passage : les notes de l'accord, plus les notes de la tonalité qui ne sont
   * pas à un demi-ton d'une note de l'accord (pas de frottement). Un accord emprunté (iii en mineur, bVII en
   * majeur) ou une dominante majeure (V en mineur) changent donc la gamme le temps de leur mesure.
   */
  function chordScale(c, keyPcs) {
    const ct = tones(c);
    return [...new Set([...ct, ...keyPcs.filter((pc) => !ct.includes(pc) && !ct.some((t) => semi(pc, t)))])];
  }
  const nearest = (pc, near) => {
    let m = near - pcOf(near) + pc;
    if (m - near > 6) m -= 12;
    if (near - m > 6) m += 12;
    return m;
  };

  /** Voicing d'accord proche du précédent (mouvement minimal), entre lo et hi. */
  function voiceChord(c, prev, lo = 55, hi = 79) {
    const pcs = [...new Set(tones(c))];
    const cands = [];
    for (let inv = 0; inv < pcs.length; inv++) {
      const order = pcs.slice(inv).concat(pcs.slice(0, inv));
      for (let base = Math.floor((lo - 12) / 12) * 12; base <= hi; base += 12) {
        const notes = [];
        let cur = base + order[0];
        notes.push(cur);
        for (let i = 1; i < order.length; i++) {
          cur = cur - pcOf(cur) + order[i] + (order[i] <= pcOf(cur) ? 12 : 0);
          notes.push(cur);
        }
        if (notes[0] >= lo && notes[notes.length - 1] <= hi) cands.push(notes);
      }
    }
    if (!cands.length) return SS.chordNotes(60 + c.rootPc, c.type);
    const ref = prev && prev.length ? prev : [lo + 7, lo + 11, lo + 14];
    const cost = (n) => n.reduce((s, x) => s + Math.min(...ref.map((y) => Math.abs(x - y))), 0) + Math.abs(n[0] - ref[0]) * 0.3;
    return cands.sort((a, b) => cost(a) - cost(b))[0];
  }

  /* ---------- batterie ---------- */
  // une mesure de 16 pas : x = fort, o = moyen, . = léger, - = rien
  const G = {
    four: { bd: 'x---x---x---x---', bk: '----x-------x---', hh: '..o...o...o...o.', oh: '--x---x---x---x-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '---o-----o-----o', tom: '--------o--o-o--' },
    hinrg: { bd: 'x---x---x---x---', bk: '----x-------x---', hh: '--x---x---x---x-', oh: '--o---o---o---o-', sh: '.o.o.o.o.o.o.o.o', tb: 'o-o-o-o-o-o-o-o-', rim: '-------o------o-', tom: '------------o-o-' },
    synthpop: { bd: 'x-------x-o-----', bk: '----x-------x---', hh: 'o-.-o-.-o-.-o-.-', oh: '--------------o-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '--o-----------o-', tom: '------------oo-o' },
    drive: { bd: 'x-----o-x-o-----', bk: '----x-------x---', hh: 'o-o-o-o-o-o-o-o-', oh: '------o-------o-', sh: '.o.o.o.o.o.o.o.o', tb: '--o---o---o---o-', rim: '-------o-------o', tom: '------------o-oo' },
    slow: { bd: 'x-------x-o-----', bk: '----x-------x---', hh: 'o-.-o-.-o-.-o-.-', oh: '------o---------', sh: '..o...o...o...o.', tb: '----o-------o---', rim: '-------o--------', tom: '-------------o-o' },
    big: { bd: 'x-----o-x-------', bk: '----x-------x---', hh: '.o.o.o.o.o.o.o.o', oh: '--o-----------o-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '--o-----o-------', tom: '-----------oo-oo' },
    tom: { bd: 'x-------x-------', bk: '----x-------x---', hh: 'o-o-o-o-o-o-o-o-', oh: '--------------o-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '-------o--------', tom: '-o-o--o-.o-o--o-' },
    softpop: { bd: 'x-------x-------', bk: '----x-------x---', hh: 'o.o.o.o.o.o.o.o.', oh: '--------------o-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '----o-------o---', tom: '------------o-o-' },
    tropical: { bd: 'x---x---x---x---', bk: '----x-------x---', hh: '--o---o---o---o-', oh: '------o-------o-', sh: 'o.o.o.o.o.o.o.o.', tb: '--o--o----o--o--', rim: '---o--o----o--o-', tom: '-------------o-o' },
    half: { bd: 'x-----o---x-----', bk: '--------x-------', hh: 'o-o-o-o-o-o-o-o-', oh: '------------o---', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '----o-------o---', tom: '-----------o-oo-' },
    deep: { bd: 'x---x---x---x---', bk: '----o-------o---', hh: '--o---o---o---o-', oh: '------o-------o-', sh: '..o...o...o...o.', tb: '--------o-------', rim: '---o--o-----o---', tom: '-------------o--' },
    // techno mélodique : kick en noires, clap sur 2 et 4, charleston en doubles-croches, open hat à contretemps
    techno: { bd: 'x---x---x---x---', bk: '----x-------x---', hh: '..o...o...o...o.', oh: '--x---x---x---x-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '---o--o----o--o-', tom: '-------------o-o' },
    // « rolling » (Afterlife, Drumcode) : charleston à contretemps, rimshot syncopé, percussions qui roulent
    rolling: { bd: 'x---x---x---x---', bk: '----x-------x---', hh: '..o...o...o...o.', oh: '--o-------o-----', sh: '-o-oo-o--o-oo-o-', tb: '------o-------o-', rim: '-o----o--o----o-', tom: '-----------o-o-o' },
    // minimal / high-tech : kick sec, clap retenu, charleston serré
    minimal: { bd: 'x---x---x---x---', bk: '----o-------x---', hh: 'o.o.o.o.o.o.o.o.', oh: '------o-------o-', sh: '..o...o...o...o.', tb: '---o-------o----', rim: '--o--o----o--o--', tom: '--------------oo' },
  };
  const LEVEL = { x: 1, o: 0.72, '.': 0.45 };
  const kind = (sound) => {
    if (sound === 'bd') return 'bd';
    if (['sd', 'cp'].includes(sound)) return 'bk';
    if (sound === 'rim') return 'rim';
    if (sound === 'hh') return 'hh';
    if (['oh', 'rd'].includes(sound)) return 'oh';
    if (sound === 'cr') return 'cr';
    if (['lt', 'mt', 'ht'].includes(sound)) return 'tom';
    if (['sh', 'perc', 'misc'].includes(sound)) return 'sh';
    if (['tb', 'cb'].includes(sound)) return 'tb';
    return 'sh';
  };

  /** Pas d'une pièce de batterie pour une section : mode off | hats | light | main | full | drop | break | build. */
  function drumSteps(sound, mode, grooveId, bars, r, { perc = false, last = false, energy = 1 } = {}) {
    const n = bars * SPB;
    const out = new Array(n).fill(0);
    if (!mode || mode === 'off') return out;
    const g = G[grooveId] || G.synthpop;
    const k = kind(sound);
    // la grosse caisse reste régulière ; charleston et percussions varient davantage
    const spread = k === 'bd' ? 0.05 : k === 'bk' ? 0.08 : 0.14;
    // charleston, shaker : temps > croches > doubles-croches
    const hatAcc = (i) => (['hh', 'sh'].includes(k) ? [1, 0.74, 0.88, 0.74][i % 4] : 1);
    const put = (s, v) => s >= 0 && s < n && (out[s] = vel(r, v * hatAcc(s % SPB), spread));
    const bar = (b, pat, scale = 1) => {
      if (!pat) return;
      for (let i = 0; i < SPB; i++) if (LEVEL[pat[i]]) put(b * SPB + i, LEVEL[pat[i]] * scale);
    };
    const playing = { hats: ['hh', 'sh', 'oh'], light: ['bd', 'hh', 'sh', 'rim'], main: ['bd', 'bk', 'hh', 'rim', 'sh', 'tb'], full: ['bd', 'bk', 'hh', 'oh', 'rim', 'sh', 'tb', 'cr', 'tom'], drop: ['bd', 'bk', 'hh', 'oh', 'rim', 'sh', 'tb', 'cr', 'tom'], break: ['bk', 'hh', 'sh', 'cr'] };
    if (mode === 'build') {
      // montée : grosse caisse en noires, puis caisse claire de plus en plus serrée, crescendo, dernière mesure coupée au 4e temps
      for (let b = 0; b < bars; b++) {
        const t = (b + 1) / bars;
        const step = t <= 0.5 ? 4 : t <= 0.75 ? 2 : 1;
        for (let s = 0; s < SPB; s += step) {
          const v = 0.35 + 0.6 * ((b * SPB + s) / n);
          if (k === 'bk' && !(b === bars - 1 && s >= 12)) put(b * SPB + s, v);
          if (k === 'bd' && t <= 0.75 && s % 4 === 0) put(b * SPB + s, 0.9);
          if (k === 'sh' && s % 2 === 0) put(b * SPB + s, v * 0.6);
        }
      }
      return out; // la montée a déjà son crescendo
    }
    if (!(playing[mode] || []).includes(k)) return out;
    if (perc && mode === 'hats' && k !== 'sh') return out;
    for (let b = 0; b < bars; b++) {
      if (k === 'cr') {
        if (b === 0 || (mode === 'drop' && b % 8 === 0)) put(b * SPB, mode === 'break' ? 0.6 : 0.9);
        continue;
      }
      if (mode === 'break') {
        // break : pas de grosse caisse, un coup de caisse claire toutes les deux mesures, charleston clairsemé
        if (k === 'bk' && b % 2 === 1) put(b * SPB + 8, 0.6);
        if (k === 'hh' || k === 'sh') bar(b, g.hh.replace(/o/g, '.'), 0.8);
        continue;
      }
      if (mode === 'hats') {
        bar(b, k === 'oh' ? null : k === 'sh' ? g.sh : g.hh, 0.75);
        continue;
      }
      // dernière mesure d'une section pleine : roulement (caisse claire ou toms) sur le dernier temps
      const fill = last && b === bars - 1 && ['main', 'full', 'drop'].includes(mode);
      let pat = k === 'bd' ? g.bd : k === 'bk' ? g.bk : k === 'hh' ? (mode === 'drop' ? '.o.o.o.o.o.o.o.o' : g.hh) : k === 'oh' ? g.oh : k === 'rim' ? g.rim : k === 'sh' ? g.sh : k === 'tb' ? g.tb : k === 'tom' ? (fill ? g.tom : null) : null;
      if (fill && k === 'bk') pat = pat.slice(0, 12) + '----';
      if (fill && k === 'hh') pat = pat.slice(0, 12) + '----';
      bar(b, pat, mode === 'light' ? 0.8 : 1);
      const groove = ['main', 'full', 'drop'].includes(mode);
      // roulement de fin de section en crescendo
      if (fill && k === 'bk') [0.5, 0.64, 0.8, 0.98].forEach((v, i) => put(b * SPB + 12 + i, v));
      // ghost notes de caisse claire (pas sur le clap) : une ou deux par mesure, très douces
      if (groove && sound === 'sd' && !fill)
        [7, 10, 15].forEach((o) => !out[b * SPB + o] && r() < 0.3 && (out[b * SPB + o] = clampV(0.24 + r() * 0.08)));
      // fin de phrase de 8 mesures : grosse caisse d'appel et charleston ouvert
      if (groove && b % 8 === 7 && !fill) {
        if (k === 'bd' && !out[b * SPB + 14]) put(b * SPB + 14, 0.62);
        if (k === 'oh') put(b * SPB + 14, 0.8);
      }
    }
    // nuance de la section (atténuée sur la grosse caisse et la caisse claire, qui tiennent le tempo)
    const e = ['bd', 'bk'].includes(k) ? Math.sqrt(energy) : energy;
    for (let s = 0; s < n; s++) if (out[s] > 0.34) out[s] = clampV(out[s] * e); // les ghost notes restent telles quelles
    return out;
  }

  /**
   * Batterie d'une section d'après un motif de js/drum-patterns.js (lanes K S C H O, 16 caractères) et ses fills.
   * lanes = null : on garde `base` (pas déjà écrits d'après le plan) et on n'y ajoute que fill et crash.
   * Retourne null pour les pièces que le motif ne pilote pas (rim, sh, tb…).
   */
  const tomIndex = { ht: 0, mt: 1, lt: 2 };
  function patternSteps(sound, bars, r, { lanes = null, base = null, fill = 'off', fillType = 'roll', crash = false, energy = 1 } = {}) {
    const k = kind(sound);
    if (!['bd', 'bk', 'hh', 'oh', 'tom', 'cr'].includes(k)) return null;
    const n = bars * SPB;
    const out = base ? base.slice() : new Array(n).fill(0);
    const F = (SS.DRUM_FILLS && SS.DRUM_FILLS[fillType]) || (SS.DRUM_FILLS && SS.DRUM_FILLS.roll);
    const hasC = lanes && /[xo.]/.test(lanes.C || '');
    const lane = k === 'bd' ? 'K' : k === 'bk' ? (sound === 'cp' && (hasC || !lanes) ? 'C' : 'S') : k === 'hh' ? 'H' : k === 'oh' ? 'O' : null;
    const spread = k === 'bd' ? 0.05 : k === 'bk' ? 0.08 : 0.14;
    const e = ['bd', 'bk'].includes(k) ? Math.sqrt(energy) : energy;
    // nuance de la section : même règle que drumSteps (les notes très douces restent telles quelles)
    const put = (s, v) => {
      if (s < 0 || s >= n) return;
      const x = vel(r, v * (k === 'hh' ? [1, 0.74, 0.88, 0.74][s % 4] : 1), spread);
      out[s] = x > 0.34 ? clampV(x * e) : x;
    };
    if (k === 'cr') {
      if (crash && (lanes || base)) put(0, 0.9);
      return out;
    }
    const isFill = (b) => (fill === 'end' ? b === bars - 1 : fill === '4' ? b % 4 === 3 : fill === '8' ? b % 8 === 7 : false);
    for (let b = 0; b < bars; b++) {
      const f = F && isFill(b);
      for (let s = 0; s < SPB; s++) {
        const keep = f && s === F.from && lane === 'K' && fillType !== 'cut'; // le kick tombe encore au début du fill
        if (f && s >= F.from && !keep) out[b * SPB + s] = 0;
        else if (lanes && lane) {
          const v = LEVEL[(lanes[lane] || '')[s]];
          if (v) put(b * SPB + s, v);
        }
      }
      if (f)
        F.ev.forEach(([s, ln, v, ti]) => {
          if (ln === lane || (ln === 'C' && sound === 'cp') || (ln === 'T' && k === 'tom' && ti === (tomIndex[sound] ?? 1))) put(b * SPB + s, v);
        });
    }
    return out;
  }

  /* ---------- grille de batterie de l'assistant (edits) et progression de montée (build) ----------
   * edits : { K, S, C, H, O } (anciens brouillons : cinq pistes de 16 caractères) ou, depuis la grille de l'assistant,
   *   { bars: 1 | 2 | 4, K S C H O (grosse caisse, caisse claire, clap, charleston, charleston ouvert) et l'identifiant du son pour
   *     les autres pièces du kit (rd, rim, cr, ht, mt, lt, perc…) : texte de 16 × bars caractères (x o . -),
   *     rat: { piste: { pas: 2..4 } }, cond: { piste: { pas: 'p75' | 'p50' | 'p25' | '1:2' | '2:2' … } } }.
   *   Avec bars, une pièce qui a sa piste dans edits est jouée telle quelle (gridSteps, même vide) ; sinon c'est le jeu de
   *   l'ancien format (patternSteps) ou du plan.
   */
  const LANE_KEY = { bd: 'K', sd: 'S', cp: 'C', hh: 'H', oh: 'O' };
  const laneKey = (sound) => LANE_KEY[sound] || sound;
  /** La pièce a-t-elle sa propre piste dans edits (grille de l'assistant) ? */
  const hasGridLane = (ed, sound) => !!ed && typeof ed === 'object' && typeof ed.bars === 'number' && typeof ed[laneKey(sound)] === 'string';
  /**
   * Pas d'une pièce d'après sa piste de la grille : le motif se répète sur la scène, vélocité x o . (fort, moyen, léger),
   * ratchets et conditions par pas ; fill et crash comme patternSteps. Retourne { steps, rat?, cond? }.
   */
  function gridSteps(sound, bars, r, ed, { fill = 'off', fillType = 'roll', crash = false, energy = 1 } = {}) {
    const k = kind(sound);
    const n = bars * SPB;
    const steps = new Array(n).fill(0);
    const key = laneKey(sound);
    const lane = ed[key];
    const L = lane.length;
    const rt = (ed.rat && ed.rat[key]) || {};
    const cd = (ed.cond && ed.cond[key]) || {};
    const rat = {};
    const cond = {};
    const F = (SS.DRUM_FILLS && SS.DRUM_FILLS[fillType]) || (SS.DRUM_FILLS && SS.DRUM_FILLS.roll);
    const spread = k === 'bd' ? 0.05 : k === 'bk' ? 0.08 : 0.14;
    const e = ['bd', 'bk'].includes(k) ? Math.sqrt(energy) : energy;
    const put = (s, v) => {
      if (s < 0 || s >= n) return;
      const x = vel(r, v, spread);
      steps[s] = x > 0.34 ? clampV(x * e) : x;
    };
    const isFill = (b) => (fill === 'end' ? b === bars - 1 : fill === '4' ? b % 4 === 3 : fill === '8' ? b % 8 === 7 : false);
    const letter = k === 'bd' ? 'K' : k === 'bk' ? (sound === 'cp' ? 'C' : 'S') : k === 'hh' ? 'H' : k === 'oh' ? 'O' : null;
    for (let b = 0; b < bars; b++) {
      const f = !!F && isFill(b);
      for (let s = 0; s < SPB; s++) {
        const i = b * SPB + s;
        if (f && s >= F.from && !(s === F.from && k === 'bd' && fillType !== 'cut')) continue; // le fill remplace le motif (le kick du pas « from » reste)
        const v = L ? LEVEL[lane[i % L]] : 0;
        if (!v) continue;
        put(i, v);
        const q = rt[i % L];
        if (q > 1) rat[i] = Math.min(4, Math.round(q));
        if (cd[i % L]) cond[i] = cd[i % L];
      }
      if (f)
        F.ev.forEach(([s, ln, v, ti]) => {
          if (ln === letter || (ln === 'T' && k === 'tom' && ti === (tomIndex[sound] ?? 1))) put(b * SPB + s, v);
        });
    }
    if (k === 'cr' && crash) put(0, 0.9);
    const out = { steps };
    if (Object.keys(rat).length) out.rat = rat;
    if (Object.keys(cond).length) out.cond = cond;
    return out;
  }

  /* Progression de la montée : parts[section].drums.build = { preset: lin | fast | late | custom, levels: [1..4 par mesure] (custom),
   * cresc: 0..1, lock: { [mesure]: { lanes: { son: 16 caractères }, rat: { son: { pas: n } }, cond: { son: { pas: id } } } } }.
   * Un niveau est une densité de roulement par mesure : 1 noires (4 coups), 2 croches (8), 3 doubles-croches (16), 4 triples
   * (24 : une croche sur deux pas, jouée en ratchet ×3, soit six coups par temps). */
  const BUILD_LEVELS = [{ name: 'Noires', per: 4, step: 4, rat: 1 }, { name: 'Croches', per: 8, step: 2, rat: 1 }, { name: 'Doubles croches', per: 16, step: 1, rat: 1 }, { name: 'Triples', per: 24, step: 2, rat: 3 }];
  const BUILD_PRESETS = { lin: 'Linéaire', fast: 'Rapide', late: 'Tardive', custom: 'Perso' };
  /** Niveaux (1 à 4) de chaque mesure pour un préréglage : lin monte régulièrement, fast atteint le sommet à mi-scène puis tient, late reste en noires jusqu'aux deux dernières mesures. */
  function buildLevels(preset, bars) {
    return Array.from({ length: bars }, (_, b) => {
      if (preset === 'fast') return Math.min(4, 1 + Math.floor((b * 8) / bars));
      if (preset === 'late') return b === bars - 1 ? 4 : b === bars - 2 ? 3 : 1;
      return Math.min(4, 1 + Math.floor((b * 4) / bars));
    });
  }
  /** Niveaux effectifs d'une progression pour une scène de `bars` mesures. */
  function progLevels(bp, bars) {
    if (bp && bp.preset === 'custom' && Array.isArray(bp.levels) && bp.levels.length)
      return Array.from({ length: bars }, (_, b) => Math.max(1, Math.min(4, Math.round(bp.levels[Math.min(b, bp.levels.length - 1)]) || 1)));
    return buildLevels((bp && bp.preset) || 'lin', bars);
  }
  /** Vélocité du roulement au pas s de la mesure b : rampe de la scène (crescendo 0 : plat, 1 : de très doux à fort). */
  function rollVel(bp, bars, b, s) {
    const c = bp && typeof bp.cresc === 'number' ? Math.max(0, Math.min(1, bp.cresc)) : 0.6;
    const t = (b * SPB + s) / (bars * SPB);
    return 0.6 - 0.3 * c + 0.65 * c * t;
  }
  /** Qui roule : la caisse claire, sinon le clap ; null si le kit n'a ni l'un ni l'autre. */
  const rollerOf = (sounds) => (sounds.has('sd') ? 'sd' : sounds.has('cp') ? 'cp' : null);
  /**
   * La mesure b de la montée, telle que le moteur l'écrit : { lanes: { son: 16 caractères }, rat: { son: { pas: n } }, cond: { son: { pas: id } }, vels: { son: [16 vélocités] }, level, locked }
   * pour le roulant (caisse claire ou clap), le clap de contretemps, le charleston et le crash (vide). Une mesure verrouillée rend la sienne.
   */
  function rollBar(bp, bars, b, roller, sounds = new Set(['sd', 'cp', 'hh', 'cr'])) {
    const lock = bp && bp.lock && bp.lock[b];
    const level = progLevels(bp, bars)[b];
    const lv = BUILD_LEVELS[level - 1];
    const lanes = {};
    const rat = {};
    const cond = {};
    const vels = {};
    const blank = () => new Array(SPB).fill(0);
    const ch = (v) => (v >= 0.85 ? 'x' : v >= 0.6 ? 'o' : v > 0 ? '.' : '-');
    const lane = (snd, v) => {
      vels[snd] = v;
      lanes[snd] = v.map(ch).join('');
    };
    if (roller && sounds.has(roller)) {
      const v = blank();
      for (let s = 0; s < SPB; s += lv.step) {
        v[s] = Math.max(0.12, rollVel(bp, bars, b, s) * (lv.rat === 3 ? 0.8 : 1));
        if (lv.rat > 1) (rat[roller] = rat[roller] || {})[s] = lv.rat;
      }
      lane(roller, v);
    }
    if (roller === 'sd' && sounds.has('cp')) {
      const v = blank();
      v[4] = v[12] = 0.7;
      lane('cp', v);
    }
    if (sounds.has('hh')) {
      const v = blank();
      if (level >= 2) for (let s = level >= 3 ? 0 : 2; s < SPB; s += level >= 3 ? 2 : 4) v[s] = 0.45;
      lane('hh', v);
    }
    if (sounds.has('cr')) lane('cr', blank());
    const locked = !!(lock && lock.lanes);
    if (locked)
      Object.entries(lock.lanes).forEach(([snd, str]) => {
        if (typeof str !== 'string') return;
        lane(snd, Array.from({ length: SPB }, (_, s) => LEVEL[str[s]] || 0));
        delete rat[snd];
        delete cond[snd];
        if (lock.rat && lock.rat[snd]) rat[snd] = { ...lock.rat[snd] };
        if (lock.cond && lock.cond[snd]) cond[snd] = { ...lock.cond[snd] };
      });
    return { lanes, rat, cond, vels, level, locked };
  }
  /** Pas du roulement de montée pour une pièce (null : cette pièce ne suit pas la progression). */
  function rollSteps(sound, bars, r, bp, roller, role, sounds) {
    if (role === 'perc' || !['sd', 'cp', 'hh', 'cr'].includes(sound)) return null;
    const steps = new Array(bars * SPB).fill(0);
    const rat = {};
    const cond = {};
    for (let b = 0; b < bars; b++) {
      const bar = rollBar(bp, bars, b, roller, sounds);
      const v = bar.vels[sound];
      if (!v) continue;
      const own = bar.locked && typeof bp.lock[b].lanes[sound] === 'string';
      v.forEach((x, s) => {
        if (x > 0) steps[b * SPB + s] = own ? x : vel(r, x, 0.06);
      });
      Object.entries(bar.rat[sound] || {}).forEach(([s, n]) => (rat[b * SPB + +s] = n));
      Object.entries(bar.cond[sound] || {}).forEach(([s, c]) => (cond[b * SPB + +s] = c));
    }
    const out = { steps };
    if (Object.keys(rat).length) out.rat = rat;
    if (Object.keys(cond).length) out.cond = cond;
    return out;
  }

  /* ---------- basse ---------- */
  const bassMidi = (pc) => 33 + pcOf(pc - 9); // de La1 à Sol♯2
  function bassEvents(spans, mode, r, keyPcs, { pedalPc = null, approach = true, shift = 0 } = {}) {
    const ev = [];
    const add = (s, len, n, v) => len > 0 && ev.push({ step: s, len, notes: [n], vel: vel(r, v) });
    spans.forEach((sp, i) => {
      const root = bassMidi(pedalPc ?? sp.chord.bassPc ?? sp.chord.rootPc) + shift; // pédale, ou basse imposée (D/F♯ : Fa♯)
      const fifth = root + 7;
      const next = spans[i + 1];
      const end = sp.step + sp.len;
      const each = (dt, fn) => {
        for (let s = sp.step; s < end; s += dt) fn(s, s - sp.step);
      };
      switch (mode) {
        case 'whole':
          add(sp.step, sp.len, root, 0.85);
          break;
        case '8':
          each(2, (s, o) => add(s, 2, root, o % 4 === 0 ? 0.9 : 0.7));
          break;
        case 'pulse8':
          each(2, (s, o) => add(s, 1, root, o % 4 === 0 ? 0.85 : 0.68));
          break;
        case 'oct':
          each(2, (s, o) => add(s, 2, (o / 2) % 2 ? root + 12 : root, (o / 2) % 2 ? 0.72 : 0.9));
          break;
        case 'gallop':
          each(4, (s) => {
            add(s, 2, root, 0.9);
            add(s + 2, 1, root, 0.66);
            add(s + 3, 1, root, 0.76);
          });
          break;
        case 'offbeat':
          each(4, (s) => add(s + 2, 2, root, 0.9));
          break;
        case 'roll':
          each(4, (s) => [1, 2, 3].forEach((d) => add(s + d, 1, d === 2 ? root + 12 : root, d === 2 ? 0.8 : 0.7)));
          break;
        case 'off16':
          // techno mélodique : deux doubles-croches après chaque kick (« et-a »), la seconde plus douce
          each(4, (s) => {
            add(s + 2, 1, root, 0.9);
            add(s + 3, 1, root, 0.7);
          });
          break;
        case 'half':
          each(Math.max(1, sp.len / 2), (s, o) => add(s, Math.min(sp.len / 2, end - s), root, o === 0 ? 0.88 : 0.74));
          break;
        case 'quarter':
          each(4, (s, o) => add(s, Math.min(3, end - s), root, o % 16 === 0 ? 0.9 : 0.74));
          break;
        case 'drone':
          // intro planante : une note tenue par accord, sans attaque marquée
          add(sp.step, sp.len, root, 0.6);
          break;
        case 'sync': {
          // basse synthpop syncopée : 1, 1a, 2&, 3, 3a, 4& avec octave et quinte
          const pat = [[0, 3, root, 0.92], [3, 2, root + 12, 0.7], [6, 2, root, 0.8], [8, 3, fifth, 0.85], [11, 2, root + 12, 0.7], [14, 2, root, 0.78]];
          for (let b = sp.step; b < end; b += SPB) pat.forEach(([o, l, n, v]) => b + o < end && add(b + o, Math.min(l, end - b - o), n, v));
          break;
        }
        case 'walk':
          each(8, (s, o) => add(s, 6, o === 0 ? root : fifth, o === 0 ? 0.9 : 0.75));
          break;
        case 'rootfifth':
          each(2, (s, o) => add(s, Math.min(2, end - s), (o / 2) % 2 ? fifth : root, (o / 2) % 2 ? 0.72 : 0.9));
          break;
        case 'arp': {
          // arpège en croches : fondamentale, tierce (majeure ou mineure selon l'accord), quinte, octave
          const third = root + ([3, 4].find((iv) => tones(sp.chord).includes(pcOf(sp.chord.rootPc + iv))) ?? 4);
          const notes = [root, third, fifth, root + 12];
          each(2, (s, o) => add(s, Math.min(2, end - s), notes[(o / 2) % 4], (o / 2) % 4 === 0 ? 0.9 : 0.72));
          break;
        }
        case 'tresillo':
          // trois, trois, deux (3+3+2), deux fois par mesure
          for (let b = sp.step; b < end; b += SPB)
            [[0, 3, 0.9], [3, 3, 0.78], [6, 2, 0.82], [8, 3, 0.9], [11, 3, 0.78], [14, 2, 0.82]].forEach(([o, l, v]) => b + o < end && add(b + o, Math.min(l, end - b - o), root, v));
          break;
        case 'trance':
          // basse trance roulante : trois doubles après chaque temps, la première un peu plus douce
          each(4, (s) => [1, 2, 3].forEach((d) => add(s + d, 1, root, d === 1 ? 0.66 : 0.8)));
          break;
        case 'sixteen':
          each(1, (s, o) => add(s, 1, root, o % 4 === 0 ? 0.92 : 0.7));
          break;
        case 'oct16':
          each(1, (s, o) => add(s, 1, o % 2 ? root + 12 : root, o % 2 ? 0.72 : 0.86));
          break;
        case 'pickup':
          // fondamentale tenue, reprise à l'octave au pas 14
          for (let b = sp.step; b < end; b += SPB)
            [[0, 13, root, 0.88], [14, 2, root + 12, 0.8]].forEach(([o, l, n, v]) => b + o < end && add(b + o, Math.min(l, end - b - o), n, v));
          break;
        case 'funk':
          // syncopes en doubles ; notes fantômes aux pas 7 et 10
          for (let b = sp.step; b < end; b += SPB)
            [[0, 2, root, 0.9], [3, 1, root, 0.8], [6, 1, root + 12, 0.84], [7, 1, root, 0.4], [10, 1, root, 0.4], [12, 2, root, 0.85], [14, 1, fifth, 0.8]].forEach(([o, l, n, v]) => b + o < end && add(b + o, Math.min(l, end - b - o), n, v));
          break;
        default:
          return;
      }
      // note d'approche vers l'accord suivant (sur les basses régulières, une fois sur deux)
      if (approach && pedalPc === null && next && ['8', 'oct', 'pulse8'].includes(mode) && next.chord.rootPc !== sp.chord.rootPc && r() < 0.5) {
        // note d'approche diatonique (voisine de la cible dans la tonalité) ; si elle frotte avec l'accord en cours : la quinte
        const target = bassMidi(next.chord.rootPc) + shift;
        const dir = target > root ? -1 : 1;
        let appr = target + dir;
        while (!keyPcs.includes(pcOf(appr))) appr += dir;
        if (!chordScale(sp.chord, keyPcs).includes(pcOf(appr))) appr = fifth;
        const at = end - 2;
        const i0 = ev.findIndex((e) => e.step === at);
        if (i0 >= 0) ev[i0].notes = [appr];
      }
    });
    return ev;
  }

  /* ---------- accords (nappe, cordes, piano, guitare) ---------- */
  const RHYTHM = {
    pulse8: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    block4: [[0, 3], [4, 3], [8, 3], [12, 3]],
    stabs: [[0, 2], [3, 2], [6, 2], [10, 2], [12, 2]],
    house: [[0, 2], [3, 2], [6, 1], [8, 2], [11, 2], [14, 2]],
    strum: [[0, 3], [4, 2], [6, 2], [10, 2], [12, 2], [14, 2]],
    chop: [[2, 1], [6, 1], [10, 1], [14, 1]],
  };
  function chordEvents(spans, mode, r, { lo = 55, hi = 79, open = false } = {}) {
    const ev = [];
    let prev = null;
    const add = (s, len, notes, v) => len > 0 && ev.push({ step: s, len, notes: [...notes], vel: vel(r, v) });
    spans.forEach((sp) => {
      const close = voiceChord(sp.chord, prev, lo, hi);
      prev = close;
      // accord ouvert : la note la plus grave descend d'une octave (une octave sous la tessiture au plus)
      const notes = open && close.length >= 3 ? [close[0] - 12, ...close.slice(1)] : close;
      const end = sp.step + sp.len;
      if (mode === 'sustain') add(sp.step, sp.len, notes, 0.62);
      else if (mode === 'swell') add(sp.step, sp.len, notes, 0.45);
      else if (mode === 'float') {
        // nappe planante : accord ouvert (fondamentale grave + accord + fondamentale à l'octave), très doux
        const low = notes[0] - 12 - pcOf(notes[0] - sp.chord.rootPc);
        add(sp.step, sp.len, [low, ...notes, low + 24].filter((n, i, a) => a.indexOf(n) === i), 0.4);
      }
      else if (mode === 'ballad') {
        // piano : fondamentale grave tenue + accord, puis accord brisé en croches
        const bass = 48 + pcOf(sp.chord.rootPc);
        add(sp.step, sp.len, [bass], 0.7);
        const seq = [notes[0], notes[1], notes[2] ?? notes[0] + 12, notes[1]];
        for (let s = sp.step, i = 0; s < end; s += 2, i++) add(s, 2, [seq[i % seq.length]], i % 4 === 0 ? 0.66 : 0.52);
      } else if (mode === 'pluck') {
        const seq = [notes[0], notes[2] ?? notes[1], notes[1], notes[2] ?? notes[0] + 12, notes[0] + 12, notes[1]];
        for (let s = sp.step, i = 0; s < end; s += 2, i++) add(s, 2, [seq[i % seq.length]], i % 2 ? 0.55 : 0.68);
      } else if (RHYTHM[mode]) {
        for (let b = sp.step - (sp.step % SPB); b < end; b += SPB)
          RHYTHM[mode].forEach(([o, l]) => {
            const s = b + o;
            if (s >= sp.step && s < end) add(s, Math.min(l, end - s), notes, (o % 4 === 0 ? 0.74 : 0.64) * (mode === 'chop' ? 0.9 : 1));
          });
      }
    });
    return ev;
  }

  /* ---------- arpèges ---------- */
  function arpEvents(spans, mode, r) {
    const ev = [];
    let prev = null;
    const add = (s, len, n, v) => len > 0 && ev.push({ step: s, len, notes: [n], vel: vel(r, v) });
    spans.forEach((sp, si) => {
      const v = voiceChord(sp.chord, prev, 60, 79);
      prev = v;
      const up = [v[0], v[1], v[2] ?? v[0] + 12, v[0] + 12, v[1] + 12, (v[2] ?? v[0] + 12) + 12];
      const end = sp.step + sp.len;
      let seq;
      let dt = 1;
      if (mode === 'up16') seq = up.slice(0, 4);
      else if (mode === 'updown16') seq = [up[0], up[1], up[2], up[3], up[4], up[3], up[2], up[1]];
      else if (mode === 'up8') (seq = up.slice(0, 4)), (dt = 2);
      else if (mode === 'bells') (seq = [up[3], up[2], up[4], up[2], up[3], up[1], up[2], up[1]]), (dt = 2);
      else if (mode === 'strobe') seq = [up[0], up[1], up[2], up[1], up[3], up[2], up[1], up[2]];
      else if (mode === 'pluck16') seq = [up[2], up[0], up[1], up[3]];
      else if (mode === 'rise') seq = si >= spans.length / 2 ? up.slice(2, 6) : up.slice(0, 4);
      else if (mode === 'ost16') seq = [up[0], up[3], up[1], up[3], up[2], up[3], up[1], up[4]];
      else if (mode === 'dotted') (seq = [up[0], up[2], up[1], up[3], up[2], up[4]]), (dt = 3);
      else return;
      for (let s = sp.step, i = 0; s < end; s += dt, i++) {
        if (mode === 'pluck16' && ![0, 3, 6, 8, 11, 14].includes(s % SPB)) continue;
        add(s, Math.min(dt === 1 ? 1 : dt === 3 ? 3 : 2, end - s), seq[i % seq.length], i % 4 === 0 ? 0.78 : 0.6);
      }
    });
    return ev;
  }

  /* ---------- Arp One (parts[section].arp.one) ----------
   * Les accords de la scène passent dans le vrai arpégiateur (SS.Arp.renderStep, js/arp.js), comme l'aperçu de
   * l'atelier Mélodie (js/harmonypanel.js, songPreview). Chaque accord est posé en position serrée dans le médium
   * (57-76), l'octave du dessus est faite par le réglage « octaves » d'Arp One. Les temps (secondes) sont convertis
   * en pas avec un tempo nominal fixe : seul le rapport compte. Même accords + mêmes réglages = mêmes notes.
   */
  function arpOneEvents(spans, one, bars) {
    const A = SS.Arp;
    const total = bars * SPB;
    const sd = 60 / 120 / 4; // tempo nominal : 120 BPM
    const chords = [];
    let prev = null;
    spans.forEach((sp) => {
      const v = voiceChord(sp.chord, prev, 57, 76);
      prev = v;
      chords.push({ step: sp.step, len: sp.len, notes: v, vel: 0.8 });
    });
    const arp = A.normalize(one);
    const seen = new Map();
    const ev = [];
    chords.forEach((c) => {
      const end = Math.min(c.step + c.len, total);
      for (let step = c.step; step < end; step++) {
        A.renderStep(arp, c, step, { loop: 0, trackLen: total, stepSec: sd, stepsPerBeat: 4, events: chords }).forEach((n) => {
          const s = Math.round(step + n.at / sd);
          if (s < 0 || s >= total) return;
          const key = s + ':' + n.midi;
          const len = Math.max(1, Math.min(Math.round(n.dur / sd), total - s));
          if (seen.has(key)) {
            const e = seen.get(key); // deux notes identiques au même pas (rafale, écho) : on garde la plus longue et la plus forte
            e.len = Math.max(e.len, len);
            e.vel = Math.max(e.vel, n.vel);
            return;
          }
          const e = { step: s, len, notes: [n.midi], vel: n.vel };
          seen.set(key, e);
          ev.push(e);
        });
      }
    });
    return ev.sort((a, b) => a.step - b.step || a.notes[0] - b.notes[0]);
  }

  /* ---------- mélodies (lead, voix, sax) ----------
   * La mélodie d'une section suit un plan de phrases (A A′ B A par défaut) : chaque phrase a une longueur en
   * mesures, et joue, se tait, ou joue un court motif puis tient sa dernière note jusqu'au bout. Les règles,
   * reprises des guides de composition :
   *  - notes de l'accord sur les temps forts et les notes longues, notes de passage sur les temps faibles ;
   *  - surtout des mouvements conjoints (au moins deux pas pour un saut), et après un saut on revient par degré
   *    dans l'autre sens ; pas de rabattement d'octave (la ligne rebondit sur les bords de la tessiture) ;
   *  - un motif par lettre : les phrases de même lettre reprennent le même rythme et le même contour, posés sur
   *    leurs propres accords ; « ′ » varie la fin ;
   *  - appel et réponse : A et B finissent en suspens (tierce ou quinte), A′ et la dernière phrase se posent
   *    (fondamentale, tonique si possible) ;
   *  - une respiration (un temps de silence) entre deux phrases ;
   *  - un seul sommet : la note la plus haute est gardée pour la phrase B (ou celle des deux tiers).
   */
  // cellules rythmiques d'un temps (4 pas) : [début, longueur] ; h = blanche (2 temps), w = ronde (4 temps)
  const CELLS = {
    q: [[0, 4]], ee: [[0, 2], [2, 2]], r: [], off: [[2, 2]], dot: [[0, 3], [3, 1]], es: [[0, 2], [2, 1], [3, 1]], se: [[0, 1], [1, 1], [2, 2]], ss: [[0, 1], [1, 1], [2, 1], [3, 1]], h: 'h', w: 'w',
  };
  // rythmes des sections de l'inspiration (caractère « Inspiration »)
  const DENS = {
    verse: { q: 3, ee: 3, r: 1.2, off: 1.5, h: 1.2, dot: 1 },
    hook: { ee: 3, q: 2.5, dot: 1.5, h: 1.5, off: 1.2, es: 0.6 },
    long: { h: 4, w: 2, q: 2, r: 1 },
    solo: { es: 2, se: 2, ee: 3, q: 1, dot: 1, ss: 1 },
    drop: { off: 2, ee: 2.5, es: 1.5, se: 1.5, dot: 1.5, r: 0.6 },
    riff: { ss: 2, es: 2, se: 2, ee: 2 },
    answer: { ee: 3, q: 2, off: 2, es: 1 },
  };
  // réglage fin « Rythme »
  const RHYTHMS = {
    simple: { q: 3, ee: 2, h: 1.5, r: 0.5 },
    varie: { q: 2, ee: 2, dot: 2, off: 1.5, es: 1, se: 1, h: 1 },
    dense: { ee: 2, es: 2, se: 2, ss: 2, dot: 1 },
  };
  /**
   * Caractères de la mélodie. rhythm : cellules (null = celles de la section) ; leap : goût pour les sauts ;
   * low / high : tessiture autour du centre ; cell : motif d'une mesure répété dans la phrase ; long : phrases
   * deux fois plus longues ; stacc : notes courtes ; form : plan des phrases par défaut.
   */
  const CHARACTERS = {
    inspiration: { label: 'Inspiration', hint: 'Dans l’esprit du morceau choisi : le rythme de chaque section', rhythm: null, leap: 0.22, low: 8, high: 9, form: 'AABA' },
    chant: { label: 'Chantante', hint: 'Par degrés, des phrases qui respirent, faciles à fredonner', rhythm: { q: 3, ee: 3, h: 1.6, dot: 1.2, r: 0.4 }, leap: 0.12, low: 7, high: 8, form: 'AABA' },
    hook: { label: 'Accrocheuse', hint: 'Un motif d’une mesure répété, en appel et réponse', rhythm: { ee: 3, q: 2, off: 1.5, es: 1, dot: 1 }, leap: 0.22, low: 7, high: 8, cell: true, form: 'AABA' },
    riff: { label: 'Riff', hint: 'Rythmée, notes courtes et syncopes, motif d’une mesure', rhythm: { es: 2, se: 2, ee: 2.5, off: 1.5, ss: 1 }, leap: 0.3, low: 5, high: 7, cell: true, stacc: true, form: 'AAAA' },
    float: { label: 'Planante', hint: 'Peu de notes, longues, des phrases amples', rhythm: { w: 3, h: 4, q: 1 }, leap: 0.18, low: 7, high: 8, long: true, form: 'ABAB' },
    lyric: { label: 'Lyrique', hint: 'Grands élans et un sommet marqué', rhythm: { q: 2.5, ee: 2, h: 2, dot: 1.5 }, leap: 0.38, low: 9, high: 12, form: 'AABA' },
  };
  /** Plans de phrases (lettres répétées par groupes de 4 phrases). */
  const FORMS = {
    AABA: ['A', 'A′', 'B', 'A′'],
    ABAB: ['A', 'B', 'A', 'B′'],
    AAAA: ['A', 'A', 'A', 'A′'],
    ABAC: ['A', 'B', 'A', 'C'],
  };
  const LETTERS = ['A', 'A′', 'B', 'B′', 'C', 'C′'];
  /** Rôles qui chantent la mélodie de la chanson. */
  const SINGERS = ['lead', 'vox', 'sax'];
  const CENTER = { verse: 64, hook: 70, long: 69, solo: 69, drop: 72, riff: 71, answer: 70, rise: 67 };

  /** Plan de phrases par défaut d'une section : phrases de 1, 2 ou 4 mesures selon sa longueur. */
  function defaultPlan(bars, character = 'inspiration', form = null) {
    const ch = CHARACTERS[character] || CHARACTERS.inspiration;
    let len = bars >= 16 ? 4 : bars >= 8 ? 2 : 1;
    if (ch.long) len = Math.min(bars, len * 2);
    const n = Math.max(1, Math.floor(bars / len));
    const letters = FORMS[form] || FORMS[ch.form];
    return Array.from({ length: n }, (_, i) => ({ bars: i === n - 1 ? bars - len * (n - 1) : len, mode: 'on', letter: letters[i % 4] }));
  }
  /** Plan ramené à la longueur de la section : phrases coupées au-delà, phrases ajoutées s'il en manque. */
  function fitPlan(plan, bars, character, form) {
    const out = [];
    let at = 0;
    for (const p of plan || []) {
      if (at >= bars) break;
      const b = Math.max(1, Math.min(Math.round(p.bars) || 1, bars - at));
      out.push({ bars: b, mode: ['on', 'hold', 'off'].includes(p.mode) ? p.mode : 'on', letter: LETTERS.includes(p.letter) ? p.letter : 'A' });
      at += b;
    }
    if (at < bars) {
      const more = defaultPlan(bars - at, character, form);
      more.forEach((p, i) => (p.letter = (FORMS[form] || FORMS[(CHARACTERS[character] || CHARACTERS.inspiration).form])[(out.length + i) % 4]));
      out.push(...more);
    }
    return out;
  }

  /** Rythme d'une phrase : [début, longueur] sur `L` pas ; la dernière note tient jusqu'au bout. */
  function phraseRhythm(r, table, L, { answer = false } = {}) {
    const out = [];
    const beats = Math.floor(L / 4);
    for (let beat = answer ? Math.floor(beats / 2) : 0; beat < beats; beat++) {
      const c = weighted(r, table);
      if (c === 'w' && beat % 4 === 0 && beat + 4 <= beats) {
        out.push([beat * 4, 16]);
        beat += 3;
        continue;
      }
      if ((c === 'h' || c === 'w') && beat % 2 === 0 && beat + 2 <= beats) {
        out.push([beat * 4, 8]);
        beat++;
        continue;
      }
      (CELLS[c] === 'h' || CELLS[c] === 'w' ? CELLS.q : CELLS[c]).forEach(([o, l]) => out.push([beat * 4 + o, l]));
    }
    if (!out.length || out[0][0] > L / 2) out.unshift([answer ? Math.floor(beats / 2) * 4 : 0, 4]);
    const last = out[out.length - 1];
    last[1] = L - last[0];
    return out;
  }
  /** Exactement n notes (réglage « Notes par phrase ») : on fusionne les notes faibles, ou on coupe les longues. */
  function fitCount(rhy, n) {
    const weak = (s) => (s % 16 === 0 ? 0 : s % 8 === 0 ? 1 : s % 4 === 0 ? 2 : s % 2 === 0 ? 3 : 4);
    while (rhy.length > n && rhy.length > 1) {
      let k = 1;
      for (let i = 2; i < rhy.length; i++) if (weak(rhy[i][0]) > weak(rhy[k][0])) k = i;
      rhy[k - 1][1] += rhy[k][1];
      rhy.splice(k, 1);
    }
    while (rhy.length < n) {
      let k = 0;
      for (let i = 1; i < rhy.length; i++) if (rhy[i][1] > rhy[k][1]) k = i;
      if (rhy[k][1] < 2) break;
      const half = rhy[k][1] >= 4 ? Math.floor(rhy[k][1] / 4) * 2 : 1;
      rhy.splice(k + 1, 0, [rhy[k][0] + half, rhy[k][1] - half]);
      rhy[k][1] = half;
    }
    return rhy;
  }
  /** Contour d'un motif : pour chaque note, le sens (−1, 0, 1), la taille du pas (1 ou 2 degrés) ou un saut. */
  const SHAPES = ['arch', 'up', 'down', 'wave'];
  function motifDirs(r, n, shape, leap) {
    let leaps = 0;
    return Array.from({ length: n }, (_, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const want = shape === 'up' ? (t < 0.8 ? 1 : -1) : shape === 'down' ? (t < 0.15 ? 1 : -1) : shape === 'wave' ? (Math.floor(t * 4) % 2 ? -1 : 1) : t < 0.6 ? 1 : -1;
      const dir = r() < 0.18 ? -want : r() < 0.12 ? 0 : want;
      const isLeap = i > 0 && i < n - 1 && leaps * 3 < n && r() < leap;
      if (isLeap) leaps++;
      return { dir: dir || (isLeap ? want : 0), size: r() < 0.25 ? 2 : 1, leap: isLeap };
    });
  }

  /**
   * Mélodie d'une section d'après son plan de phrases.
   *   o : { character, rhythm, complexity, range, ending, notes, form } ; plan : phrases (null = plan par défaut) ;
   *   seeds : { A: n, B: n… } relance d'une lettre ; secMode : ce que joue le chanteur dans la section.
   */
  function melodyPart(spans, key, bars, role, o, plan, seeds, seedKey, secMode) {
    const ch = CHARACTERS[o.character] || CHARACTERS.inspiration;
    const keyPcs = H().scale(key).map((d) => d.pc);
    const tonic = keyPcs[0];
    const cx = { simple: { leap: 0.5, max: 7 }, adventurous: { leap: 1.6, max: 12 } }[o.complexity] || { leap: 1, max: 9 };
    // profil de l'émotion (js/melody-profiles.js) : il s'ajoute au caractère, qui garde le rythme
    const prof = o.profile || null;
    const ending = o.ending && o.ending !== 'auto' ? o.ending : prof ? prof.ending : 'closed';
    const PSHAPE = { arch: 'arch', rise: 'up', fall: 'down', wave: 'wave', plateau: 'wave' };
    const leapK = prof ? 0.6 + prof.leap * 0.8 : 1;
    // note pivot de la section : commune au plus grand nombre de ses accords
    let pivotPc = null;
    if (prof && (prof.target === 'pivot' || prof.motif === 'common')) {
      const cs = [...new Map(spans.map((sp) => [sp.chord.sym || sp.chord.rootPc + ':' + tones(sp.chord).join(), sp.chord])).values()];
      let best = 1;
      for (let pc = 0; pc < 12; pc++) {
        const n = cs.filter((c) => tones(c).includes(pc)).length;
        if (n > best) [best, pivotPc] = [n, pc];
      }
    }
    /** Note visée par le profil sur un accord (classe de hauteur, ou null). */
    const targetOf = (c) => {
      if (!prof) return null;
      const ct = tones(c);
      const t = prof.target === 'pivot' || prof.motif === 'common' ? pivotPc : prof.target === 'color' ? prof.colorPc : null;
      if (t != null) return ct.includes(t) || chordScale(c, keyPcs).includes(t) ? t : null;
      const root = ct[0];
      const pick = { root: [0], third: [3, 4], fifth: [7] }[prof.target] || [];
      return ct.find((pc) => pick.includes(pcOf(pc - root))) ?? null;
    };
    // tessiture
    const R = (SS.melody && SS.melody.RANGES) || {};
    let lo;
    let hi;
    if (o.range && o.range !== 'auto' && o.range !== 'profil' && R[o.range]) ({ lo, hi } = R[o.range]);
    else {
      // registre : le profil déplace le centre (sombre → plus grave, lumineux → plus aigu)
      const c = (role === 'vox' ? 66 : o.character === 'inspiration' || !o.character ? CENTER[secMode] || 67 : 68) + (prof ? Math.round((prof.center - 0.5) * 10) : 0);
      lo = c - ch.low;
      hi = c + ch.high;
      if (role === 'vox') [lo, hi] = [Math.max(57, lo), Math.min(77, hi)];
    }
    const center = Math.round((lo + hi) / 2);
    const table = RHYTHMS[o.rhythm] || ch.rhythm || DENS[secMode] || DENS.verse;
    const phrases = fitPlan(plan || defaultPlan(bars, o.character, o.form), bars, o.character, o.form);
    const spanAt = (s) => spans.find((sp) => s >= sp.step && s < sp.step + sp.len) || spans[spans.length - 1];
    const stepIn = (n, dir, pcs, k = 1) => {
      let m = n;
      for (let j = 0; j < k; j++) {
        m += dir;
        while (!pcs.includes(pcOf(m))) m += dir;
      }
      return m;
    };
    // sommet : la première phrase B, sinon celle des deux tiers
    const playing = phrases.map((p, i) => i).filter((i) => phrases[i].mode !== 'off');
    let peakAt = playing.find((i) => phrases[i].letter[0] === 'B');
    if (peakAt === undefined) peakAt = playing[Math.floor((playing.length * 2) / 3)] ?? -1;
    const motifs = {};
    const motif = (letter, L, n) => {
      const base = letter[0];
      const k = `${base}/${L}/${n}`;
      if (motifs[k]) return motifs[k];
      const r = rng(`${seedKey}/${base}/${(seeds && seeds[base]) || 0}`);
      const unit = ch.cell ? Math.min(L, SPB) : L;
      let rhy = phraseRhythm(r, table, unit, { answer: secMode === 'answer' && !ch.cell && o.character === 'inspiration' });
      if (unit < L) {
        // motif d'une mesure répété dans toute la phrase
        const one = rhy.map(([s, l], i) => [s, i === rhy.length - 1 ? Math.min(l, 4) : l]);
        rhy = [];
        for (let b = 0; b < L; b += unit) one.forEach(([s, l]) => b + s < L && rhy.push([b + s, Math.min(l, L - b - s)]));
        rhy[rhy.length - 1][1] = L - rhy[rhy.length - 1][0];
      }
      if (n > 0) fitCount(rhy, n);
      const firstShape = prof ? PSHAPE[prof.contour] || pick(r, SHAPES) : pick(r, SHAPES);
      const shape = base === 'A' ? firstShape : pick(r, SHAPES.filter((x) => x !== (motifs.Ashape || 'arch')));
      if (base === 'A') motifs.Ashape = shape;
      const per = ch.cell ? rhy.filter(([s]) => s < unit).length : rhy.length;
      const d = motifDirs(r, per, shape, ch.leap * cx.leap * leapK);
      const dirs = rhy.map((_, i) => d[i % per]);
      // A′ : la fin repart dans l'autre sens
      const alt = dirs.map((x, i) => (i >= dirs.length - Math.max(2, Math.round(dirs.length / 3)) ? { ...x, dir: -x.dir || -1, leap: false } : x));
      const start = base === 'B' ? 3 : base === 'C' ? 1 : -2;
      return (motifs[k] = { rhy, dirs, alt, start, r });
    };

    const ev = [];
    let at = 0;
    let prev = null;
    let lastLeap = 0;
    phrases.forEach((p, pi) => {
      const p0 = at * SPB;
      const L = p.bars * SPB;
      at += p.bars;
      if (p.mode === 'off') {
        prev = null;
        return;
      }
      const next = phrases[pi + 1];
      const breath = next && next.mode !== 'off' ? (L >= 2 * SPB ? 4 : 2) : 0;
      const last = pi === playing[playing.length - 1];
      const prime = p.letter.includes('′');
      // fin : réponse (′ ou dernière phrase) posée ; appel en suspens
      const close = last ? ending === 'closed' : prime;
      const suspend = last && ending === 'suspended';
      const cap = pi === peakAt ? hi : hi - 3;
      let rhy;
      let dirs;
      let m;
      if (p.mode === 'hold') {
        // court motif (une mesure) puis la dernière note tenue jusqu'au bout de la phrase
        if (p.bars === 1) rhy = [[0, L - breath]];
        else {
          m = motif(p.letter, SPB, 0);
          rhy = m.rhy.map(([s, l]) => [s, l]);
          rhy[rhy.length - 1][1] = L - breath - rhy[rhy.length - 1][0];
        }
      } else {
        m = motif(p.letter, L - breath, Math.max(0, Math.round(o.notes || 0)));
        rhy = m.rhy;
      }
      dirs = m ? (prime ? m.alt : m.dirs) : [{ dir: 0, size: 1, leap: false }];
      const rv = rng(`${seedKey}/v/${pi}`);
      rhy.forEach(([s, len], i) => {
        const abs = p0 + s;
        if (abs >= bars * SPB) return;
        const c = spanAt(abs).chord;
        const ct = tones(c);
        const pcs = chordScale(c, keyPcs);
        const strong = abs % 8 === 0 || len >= 6;
        const end = i === rhy.length - 1;
        let n;
        if (prev === null || i === 0) {
          // départ : une note de l'accord près du point de départ de la lettre (et près de la note d'avant)
          const aim = prev === null ? center + (m ? m.start : 0) : Math.round((prev + center + (m ? m.start : 0)) / 2);
          n = ct.map((pc) => nearest(pc, aim)).sort((a, b) => Math.abs(a - aim) - Math.abs(b - aim))[0];
          lastLeap = 0;
        } else {
          const d = dirs[i % dirs.length] || { dir: 0, size: 1 };
          let dir = d.dir;
          if (lastLeap) dir = -Math.sign(lastLeap); // après un saut : retour par degré, dans l'autre sens
          if (d.leap && !lastLeap && dir) {
            // saut vers une note de l'accord, entre une quarte et la limite de la complexité
            const cands = [];
            ct.forEach((pc) => [-24, -12, 0, 12, 24].forEach((o8) => {
              const x = nearest(pc, prev) + o8;
              const iv = (x - prev) * dir;
              if (iv >= 5 && iv <= cx.max) cands.push(x);
            }));
            n = cands.length ? cands.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0] : stepIn(prev, dir, pcs, 2);
          } else n = dir ? stepIn(prev, dir, pcs, lastLeap ? 1 : d.size) : pcs.includes(pcOf(prev)) ? prev : stepIn(prev, 1, pcs);
          if (strong && !ct.includes(pcOf(n))) {
            // temps fort : la note de l'accord la plus proche, de préférence dans le sens du mouvement
            const near = ct.map((pc) => nearest(pc, n)).sort((a, b) => Math.abs(a - n) - Math.abs(b - n) || (b - a) * (dir || 1));
            n = near[0];
          }
          // profil : sur un temps fort, la note visée si elle est à portée (une tierce)
          const tpc = strong ? targetOf(c) : null;
          if (tpc != null && pcOf(n) !== tpc) {
            const t = nearest(tpc, n);
            if (Math.abs(t - n) <= 4 && t >= lo && t <= hi) n = t;
          }
        }
        if (end) {
          // fin de phrase : la réponse se pose (fondamentale, tonique si l'accord la contient), l'appel reste en suspens
          let goal = close ? (ct.includes(tonic) ? [tonic] : [ct[0]]) : ct.slice(1, 3).filter((pc) => pc !== tonic);
          // fin suspendue : la seconde ou la quarte de l'accord, laissée sans résolution
          if (suspend) goal = [pcOf(ct[0] + 2), pcOf(ct[0] + 5)].filter((pc) => keyPcs.includes(pc) && !ct.includes(pc));
          if (p.mode === 'hold') {
            // note tenue : celle qui sonne le mieux sur tous les accords qu'elle traverse
            const fit = (pc) =>
              spans.reduce((a, sp) => {
                const ov = Math.min(abs + len, sp.step + sp.len) - Math.max(abs, sp.step);
                return ov <= 0 ? a : a + ov * (tones(sp.chord).includes(pc) ? 2 : chordScale(sp.chord, keyPcs).includes(pc) ? 0.5 : -3);
              }, 0) + (goal.includes(pc) ? 6 : 0);
            goal = [[...new Set([...goal, ...ct])].sort((a, b) => fit(b) - fit(a))[0]];
          }
          const opts = (goal.length ? goal : [ct[0]]).flatMap((pc) => [nearest(pc, prev ?? n) - 12, nearest(pc, prev ?? n), nearest(pc, prev ?? n) + 12]).filter((x) => x >= lo && x <= cap);
          const from = prev ?? n;
          const near = (list) => list.sort((a, b) => Math.abs(a - from) - Math.abs(b - from))[0];
          // pas de grand saut pour conclure : sinon une autre note de l'accord, la plus proche
          let best = opts.length ? near(opts) : null;
          if (best === null || Math.abs(best - from) > 7) best = near(ct.flatMap((pc) => [nearest(pc, from) - 12, nearest(pc, from), nearest(pc, from) + 12]).filter((x) => x >= lo && x <= cap)) ?? best;
          if (best !== null && best !== undefined) n = best;
        }
        // tessiture : la ligne rebondit au lieu de sauter d'une octave
        const ok = (x) => x >= lo && x <= cap;
        const inside = (aim) => ct.flatMap((pc) => [nearest(pc, aim) - 12, nearest(pc, aim), nearest(pc, aim) + 12]).filter(ok).sort((a, b) => Math.abs(a - aim) - Math.abs(b - aim))[0];
        if (!ok(n)) {
          const back = prev !== null && ok(prev) ? stepIn(prev, n > cap ? -1 : 1, pcs) : null;
          n = back !== null && ok(back) ? back : inside(n > cap ? cap - 4 : lo + 4) ?? Math.max(lo, Math.min(cap, n));
        }
        if (strong && !ct.includes(pcOf(n)) && pcOf(n) !== targetOf(c)) n = inside(n) ?? n;
        lastLeap = prev !== null && Math.abs(n - prev) >= 5 ? n - prev : 0;
        // une note qui dépasse sur l'accord suivant s'arrête avec l'accord si elle frotte (sauf note tenue voulue)
        let l = Math.min(len, bars * SPB - abs);
        const sp = spanAt(abs);
        const nx = spans[spans.indexOf(sp) + 1];
        if (p.mode !== 'hold' && nx && abs + l > nx.step && !chordScale(nx.chord, keyPcs).includes(pcOf(n))) l = Math.max(1, nx.step - abs);
        if (ch.stacc && !end) l = Math.min(l, 2);
        ev.push({ step: abs, len: l, notes: [n], vel: vel(rv, l >= 8 ? 0.74 : abs % 8 === 0 ? 0.86 : 0.7) });
        prev = n;
      });
      // une phrase suivie d'un silence repart de zéro
      if (!next || next.mode === 'off') prev = null;
    });
    return ev;
  }

  /** Montée (« rise ») : une note répétée, en croches puis en doubles-croches, une octave plus haut à mi-chemin. */
  function riseEvents(spans, r, key, bars) {
    const ev = [];
    const t = 60 + pcOf(H().scale(key)[0].pc);
    for (let s = 0; s < bars * SPB; s += s >= (bars - 2) * SPB ? 1 : 2) {
      const up = s >= (bars * SPB) / 2 ? 12 : 0;
      const sp = spans.find((x) => s >= x.step && s < x.step + x.len) || spans[spans.length - 1];
      const ct = tones(sp.chord);
      const n = ct.includes(pcOf(t)) ? t : ct.map((pc) => nearest(pc, t)).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
      if (s < bars * SPB - 4) ev.push({ step: s, len: 1, notes: [n + up], vel: vel(r, 0.5 + (0.4 * s) / (bars * SPB)) });
    }
    return ev;
  }

  /* ---------- effets (montée de bruit, ambiance, impact) ----------
   *   riser : une note de bruit tenue sur toute la section (la courbe d'automation ouvre son filtre) ;
   *   swell : nappe d'ambiance, une note longue toutes les 4 mesures ;
   *   down  : impact au premier temps (début du drop), qui s'éteint sur 2 mesures.
   */
  function fxEvents(spans, mode, key, bars) {
    const n = bars * SPB;
    const t = 48 + pcOf(H().scale(key)[0].pc); // tonique grave (les bruits ne sont pas accordés, les échantillons si)
    if (mode === 'riser') return [{ step: 0, len: n, notes: [t + 12], vel: 0.8 }];
    if (mode === 'down') return [{ step: 0, len: Math.min(n, 2 * SPB), notes: [t], vel: 0.95 }];
    if (mode === 'swell') {
      const ev = [];
      for (let s = 0; s < n; s += 4 * SPB) ev.push({ step: s, len: Math.min(4 * SPB, n - s), notes: [t + 12], vel: 0.55 });
      return ev;
    }
    return [];
  }

  /* ---------- techno mélodique : automation, ratchets, conditions ----------
   * Rampes de valeurs posées sur les pas de la scène (js/project.js, SS.AUTO_PARAMS) :
   *   filter −1 (passe-bas fermé) … 0 (ouvert) … +1 (passe-haut fermé) ; reverb / echo : envois supplémentaires.
   */
  const ramp = (n, a, b, from = 0) => {
    const s0 = Math.min(n - 1, Math.round(n * from));
    return s0 > 0 ? { 0: a, [s0]: a, [n - 1]: b } : { 0: a, [n - 1]: b };
  };
  const RISER_TOP = 0.8; // volume de la montée de bruit à la fin de la montée (elle fait avancer la montée quand le kick se retire)
  const MELODIC = ['pad', 'arp', 'keys', 'strings', 'guitar', 'lead', 'vox', 'sax'];

  /* ---------- dynamique des chansons EDM et techno ----------
   * Un producteur retient le groove pour que le drop frappe : nappes et claviers plus bas et plus sombres, charleston
   * plus doux, basse un peu filtrée ; la montée avance en volume (nappes, arpège, mélodie) ; le dernier drop est le
   * sommet ; l'outro garde le kick et baisse le reste. Réglages posés comme automation de la scène (volume, filtre) :
   * ceux de l'utilisateur les remplacent. Sans drop dans le plan (deep house), rien ne change.
   *   dyn : 'intro' | 'groove' | 'build' | 'first' (drop suivi d'un autre) | 'drop' | 'outro'
   */
  const HOLD = { pad: [0.5, -0.2], strings: [0.55, -0.2], keys: [0.6, 0], guitar: [0.65, 0], arp: [0.62, -0.25], lead: [0.7, -0.15], vox: [0.72, 0], sax: [0.72, 0] };
  /** Nature de la scène pour la dynamique : null (inchangée) ou groove / build / first (drop suivi d'un autre) / drop / outro. */
  function dynKind(spec, id, form) {
    if (!spec.sc) return null;
    const sec = spec.sections[id];
    const drops = form.filter((f) => spec.sections[f.id].drums === 'drop');
    if (!drops.length) return null;
    if (sec.drums === 'build') return 'build';
    if (sec.drums === 'drop') return drops.length > 1 && id !== drops[drops.length - 1].id ? 'first' : 'drop';
    if (id === 'outro' && ['main', 'full', 'light'].includes(sec.drums)) return 'outro';
    if (id === 'intro' && ['light', 'hats'].includes(sec.drums)) return 'intro'; // intro DJ : le kick n'est pas plus fort que celui du groove
    if (['main', 'full'].includes(sec.drums)) return 'groove';
    return null;
  }
  /** Groove retenu : charleston et percussions plus doux, charleston ouvert presque absent (le drop les ouvre en grand). */
  const HOLD_DRUMS = { hh: 0.8, oh: 0.5, sh: 0.85, tb: 0.85, rim: 0.85 };
  function holdDrums(steps, sound) {
    const g = HOLD_DRUMS[kind(sound)];
    if (g) for (let s = 0; s < steps.length; s++) if (steps[s] > 0) steps[s] = clampV(steps[s] * g);
  }
  /** Montée : volume de la batterie qui revient (kick, charleston, percussions) sur la longueur de la scène. */
  function dynDrumsAuto(k, bars, dyn = 'build', tech = false) {
    const n = bars * SPB;
    if (dyn === 'outro') return k === 'bd' ? { volume: { 0: 0.75 } } : null; // outro DJ : le kick reste, tout le reste baisse
    if (dyn === 'groove' || dyn === 'intro') return k === 'bd' ? { volume: { 0: tech ? 0.75 : 0.85 } } : null; // kick du groove un peu en retrait (−2,5 dB en techno, −1,4 dB en EDM) : il reste le moteur, le drop est son plein retour
    if (k === 'bd') return { volume: { 0: 0.42, [Math.round(n * 0.75)]: 1 } };
    if (k === 'bk') return { volume: ramp(n, 0.6, 1) };
    if (['hh', 'sh', 'tb', 'rim', 'oh'].includes(k)) return { volume: ramp(n, 0.5, 1) };
    return null;
  }
  function dynAuto(kind, role, bars) {
    const n = bars * SPB;
    const mel = MELODIC.includes(role);
    if (kind === 'groove') {
      if (mel && HOLD[role]) {
        const [v, f] = HOLD[role];
        const a = { volume: { 0: v } };
        if (f) a.filter = { 0: f };
        return a;
      }
      if (role === 'bass') return { volume: { 0: 0.6 }, filter: { 0: -0.25 } }; // basse retenue (−4,4 dB) et un peu fermée
    }
    if (kind === 'build' && mel) return { volume: ramp(n, 0.35, 1) };
    if (kind === 'first' && mel && role !== 'lead') return { volume: { 0: 0.9 } };
    if (kind === 'outro') {
      if (mel) return { volume: ramp(n, 0.5, 0, 0.75) };
      if (role === 'bass') return { volume: ramp(n, 0.45, 0, 0.75), filter: { 0: -0.2 } };
    }
    return null;
  }
  /**
   * Courbes d'automation d'une piste pour une section (null si rien) :
   *  - intro planante (sec.float) : le passe-bas des nappes et de l'arpège s'ouvre lentement, la reverb se retire ;
   *  - montée (drums « build ») : passe-haut qui grimpe sur la 2e moitié (basse comprise), reverb lâchée à la fin ;
   *  - break : la nappe respire (filtre qui se ferme à mi-chemin puis se rouvre), plus de reverb sur le lead ;
   *  - drop : le lead et l'arpège partent un peu fermés et s'ouvrent sur la première mesure (attaque du drop) ;
   *  - outro : tout se referme, fondu des dernières mesures.
   */
  function sectionAuto(id, sec, role, bars, isFx, dyn = null, tech = true) {
    const base = tech ? sectionAutoTech(id, sec, role, bars, isFx) : null;
    const d = dyn && !isFx ? dynAuto(dyn, role, bars) : null;
    if (!d) return base;
    return mergeAuto(base, d);
  }
  /** Courbes du plan puis de la dynamique : la dynamique ajoute ses courbes ; sur une courbe commune, le volume se multiplie et le filtre garde celui du plan. */
  function mergeAuto(a, d) {
    if (!a) return d;
    const out = { ...a };
    Object.entries(d).forEach(([k, v]) => {
      if (!out[k]) out[k] = v;
      else if (k === 'volume') out[k] = mulLane(out[k], v);
    });
    return out;
  }
  /** Produit de deux courbes de volume { pas: valeur } (aux pas des deux). */
  function mulLane(a, b) {
    const pa = Object.entries(a).map(([x, y]) => [+x, y]).sort((p, q) => p[0] - q[0]);
    const pb = Object.entries(b).map(([x, y]) => [+x, y]).sort((p, q) => p[0] - q[0]);
    const at = (pts, s) => {
      if (s <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (s - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0] || 1);
      return pts[pts.length - 1][1];
    };
    const out = {};
    [...new Set([...pa, ...pb].map((p) => p[0]))].sort((x, y) => x - y).forEach((s) => (out[s] = Math.round(at(pa, s) * at(pb, s) * 1000) / 1000));
    return out;
  }
  function sectionAutoTech(id, sec, role, bars, isFx) {
    const n = bars * SPB;
    if (isFx) {
      // la montée de bruit reste sous le drop : volume plafonné (RISER_TOP), le filtre fait l'essentiel de l'effet
      if (sec.fx === 'riser') return { filter: ramp(n, -0.9, 0.1), volume: ramp(n, 0.15, RISER_TOP), reverb: ramp(n, 0.2, 0.6, 0.5) };
      if (sec.fx === 'down') return { volume: { 0: 1, [Math.min(n - 1, 2 * SPB - 1)]: 0 }, reverb: { 0: 0.6 } };
      if (sec.fx === 'swell') return { filter: ramp(n, -0.75, -0.35), volume: { 0: 0.5 }, reverb: { 0: 0.6 } };
      return null;
    }
    const melodic = MELODIC.includes(role);
    if (sec.float && (melodic || role === 'bass')) {
      // le filtre ne s'ouvre qu'à moitié : la suite (groove, drop) doit rester plus brillante que l'intro
      const a = role === 'bass' ? { filter: ramp(n, -0.55, -0.3) } : { filter: ramp(n, role === 'arp' ? -0.65 : -0.7, -0.15, 0.1) };
      if (['arp', 'lead', 'keys', 'guitar'].includes(role)) a.echo = { 0: 0.35 };
      if (melodic) a.reverb = ramp(n, 0.6, 0.25, 0.6);
      return a;
    }
    if (sec.drums === 'build' && (melodic || role === 'bass')) {
      const a = { filter: ramp(n, 0, role === 'bass' ? 0.75 : 0.55, 0.5) };
      if (['pad', 'lead', 'arp', 'keys'].includes(role)) a.reverb = ramp(n, 0, 0.6, 0.75);
      if (role === 'arp') a.res = ramp(n, 0.1, 0.6, 0.5);
      return a;
    }
    if (/^break/.test(id) && ['pad', 'strings', 'arp'].includes(role)) return { filter: { 0: 0, [Math.round(n / 2)]: -0.6, [n - 1]: 0 } };
    if (/^break/.test(id) && ['lead', 'vox'].includes(role)) return { reverb: { 0: 0.4 } };
    if (/^drop/.test(id) && ['lead', 'arp'].includes(role)) return { filter: { 0: -0.35, [SPB - 1]: 0 } };
    if (id === 'outro' && (melodic || role === 'bass')) return { filter: ramp(n, 0, -0.8, 0.25), volume: ramp(n, 1, 0, 0.75) };
    return null;
  }
  /**
   * Ratchets et conditions de la batterie (sections jouées) :
   *  - montée : la caisse claire / le clap des dernières mesures est rejoué 2 puis 3 fois par pas (roulement) ;
   *  - groove : petit trille de charleston (3 coups) en fin de phrase de 4 mesures ; charleston fantôme sur les
   *    doubles-croches libres, joué un passage sur deux (50 %) ; percussions et rimshots « 1:2 » / 75 %.
   */
  function drumSpice(d, sound, mode, bars, r) {
    const k = kind(sound);
    const n = bars * SPB;
    const rat = {};
    const cond = {};
    if (mode === 'build' && k === 'bk') {
      // roulement retenu (le drop doit frapper plus fort que la montée) ; les coups répétés s'additionnent :
      // chaque coup des ratchets est encore plus doux
      for (let s = 0; s < n; s++) if (d.steps[s] > 0) d.steps[s] = clampV(d.steps[s] * 0.62);
      for (let s = Math.max(0, n - 2 * SPB); s < n; s++)
        if (d.steps[s] > 0) {
          rat[s] = s >= n - SPB + 4 ? 3 : 2;
          d.steps[s] = clampV(d.steps[s] * (rat[s] === 3 ? 0.65 : 0.78));
        }
    }
    if (['main', 'full', 'drop'].includes(mode)) {
      for (let b = 0; b < bars; b++) {
        const o = b * SPB;
        if (k === 'hh') {
          if (b % 4 === 3 && d.steps[o + 14] > 0) rat[o + 14] = 3;
          [3, 7, 11, 15].forEach((x) => {
            if (!d.steps[o + x] && r() < 0.6) {
              d.steps[o + x] = clampV(0.3 + r() * 0.1);
              cond[o + x] = 'p50';
            }
          });
        }
        // ride et open hat : quelques coups seulement trois passages sur quatre ; charleston du drop : coups faibles à 75 %
        if (k === 'oh') for (let x = 0; x < SPB; x++) if (d.steps[o + x] > 0 && r() < 0.25) cond[o + x] = 'p75';
        if (k === 'hh' && mode === 'drop') for (let x = 1; x < SPB; x += 2) if (d.steps[o + x] > 0 && d.steps[o + x] < 0.5 && !cond[o + x] && r() < 0.2) cond[o + x] = 'p75';
        if (k === 'sh' || k === 'tb')
          for (let x = 0; x < SPB; x++) if (d.steps[o + x] > 0 && x % 4 !== 0 && r() < 0.25) cond[o + x] = pick(r, ['p75', '1:2', '2:2']);
        if (k === 'rim') for (let x = 0; x < SPB; x++) if (d.steps[o + x] > 0 && r() < 0.35) cond[o + x] = pick(r, ['p75', '!first']);
      }
    }
    if (Object.keys(rat).length) d.rat = rat;
    if (Object.keys(cond).length) d.cond = cond;
    return d;
  }

  /* ---------- transitions : étape « Effets et transitions » de l'assistant ----------
   * Option fx de build : { junctions: { 'sectionAvant>sectionAprès': { riser, hp, rev, gap, impact, down } }, perc: { style, loops } }.
   * Une jonction relie deux scènes consécutives de l'arrangement ; ses réglages sont partiels : ce qui manque vaut ce que le plan
   * fait déjà (junctionDefaults : montée de bruit si la scène d'avant a fx « riser », silence d'un temps si elle a « gap »,
   * passe-haut des montées techno, impact si la scène d'après a fx « down »). Sans option fx (ou vide), la chanson est celle du plan.
   *  - riser { on, len (mesures : 4, 8, 16), filter: lp | hp | none } : bruit tenu sur les dernières mesures de la scène d'avant,
   *    le filtre s'ouvre (lp : passe-bas, hp : passe-haut), le volume et la reverb montent ;
   *  - hp { on, freq (Hz) } : passe-haut sur toutes les pistes mélodiques et la basse, sur la 2e moitié de la scène d'avant ;
   *  - rev { on, len (pas : 4, 16, 32) } : « cymbale inversée », bruit qui aspire vers le premier temps de la scène d'après
   *    (une montée de bruit courte, d'enveloppe montante : le moteur n'a pas de lecture inversée d'échantillon) ;
   *  - gap { len (pas : 0, 4, 16) } : silence avant la jonction (tout est coupé, sauf la cymbale inversée) ;
   *  - impact { on, type: both | crash | impact, level } : coup grave de la piste Effets et/ou crash de la batterie au pas 0 ;
   *  - down { on, len (mesures : 2, 4) } : descente (bruit qui retombe) après l'impact.
   *  Procédés d'écriture T01–T06 de la formation (docs/reference/formation-composition/23_bibliotheque_de_procedes.md, § 6),
   *  tous éteints par défaut (le plan ne les emploie pas) ; voir writeTransitions :
   *  - retrait { on, len (mesures : 1, 2) } (T01) : la batterie se retire sur les dernières mesures de la scène d'avant,
   *    le charleston fermé reste, plus doux, pour garder le compte ;
   *  - frag { on } (T02) : la mélodie des deux dernières mesures se fragmente : la 1re mesure du motif (les deux mesures
   *    d'avant), puis sa première demi-mesure deux fois ;
   *  - pedal { on, len (mesures : 2, 4), note: dom | tonic } (T03) : la basse tient la dominante (ou la tonique), une note
   *    par mesure, sous les accords qui continuent de changer ;
   *  - widen { on, len (mesures : 2, 4) } (T04) : les accords et arpèges s'ouvrent : doublure à l'octave au-dessus au
   *    premier tiers, à l'octave grave au deuxième (avec une marge sous le sommet : rien au-dessus de Sol6) ;
   *  - susp { on, len (pas : 4, 8) } (T05) : au début de la scène d'après, la tierce du premier accord est retardée par la
   *    quarte (sus4) pendant un ou deux temps, puis se résout ;
   *  - gap (T06) : le silence, ci-dessus ; les queues d'effets (reverb, écho) continuent de sonner.
   * perc { style: techno | latin | minimal, loops: { section: { sh, cg, tom } } } : boucles de la piste Percussionniste
   * (sh : shaker, cg : conga, tom : tom grave) ; vrai = la boucle du style, faux = coupée, absent = le jeu du plan.
   */
  const HP_MEL = 0.55; // passe-haut des montées techno (filtre DJ : 20 Hz × 2^(9,6 v))
  const HP_BASS = 0.75;
  const hpHz = (v) => Math.round(20 * Math.pow(2, 9.6 * v));
  const hpAmt = (hz) => (hz === hpHz(HP_MEL) ? HP_MEL : Math.max(0.1, Math.min(0.95, Math.log2(Math.max(20, hz) / 20) / 9.6)));
  /** Réglages par défaut d'une jonction : ce que le plan fait déjà (from ou to peut manquer : première ou dernière scène). */
  function junctionDefaults(spec, from, to) {
    const a = from && spec.sections[from];
    const b = to && spec.sections[to];
    return {
      riser: { on: !!a && a.fx === 'riser', len: a ? a.bars : 8, filter: 'lp' },
      hp: { on: !!spec.tech && !!a && a.drums === 'build', freq: hpHz(HP_MEL) },
      rev: { on: false, len: SPB },
      gap: { len: a && a.gap ? 4 : 0 },
      impact: { on: !!b && b.fx === 'down', type: 'both', level: 0.95 },
      down: { on: false, len: 2 },
      retrait: { on: false, len: 1 },
      frag: { on: false },
      pedal: { on: false, len: 2, note: 'dom' },
      widen: { on: false, len: 2 },
      susp: { on: false, len: 4 },
    };
  }

  /**
   * Procédés T01–T05 d'une scène (voir l'en-tête des transitions) : `out` = réglages de la jonction qui en sort,
   * `inn` = de celle qui y entre, `role(t)` = type de l'instrument (drums, bass, chords, arp, melody ; null : piste Effets).
   */
  function writeTransitions(data, tracks, role, { bars, key, spans, out, inn }) {
    const n = bars * SPB;
    const kp = H().scale(key).map((d) => d.pc);
    const evsOf = (t) => (data[t.id] && data[t.id].events) || null;
    // T01 : retrait de la batterie
    if (out && out.retrait.on) {
      const from = n - Math.min(bars, out.retrait.len) * SPB;
      tracks.forEach((t) => {
        const d = data[t.id];
        if (!d) return;
        if (d.steps) {
          const [rl, snd] = ((t.band && t.band.key) || '').split(':');
          const hat = rl !== 'perc' && kind(snd || t.sound) === 'hh';
          for (let s = from; s < n; s++) d.steps[s] = hat && d.steps[s] ? clampV(d.steps[s] * 0.6) : 0;
        } else if (role(t) === 'drums' && d.events) d.events = d.events.filter((e) => e.step < from).map((e) => ({ ...e, len: Math.min(e.len, from - e.step) }));
      });
    }
    // T02 : fragmentation de la mélodie (motif de 2 mesures → 1 → 1/2)
    if (out && out.frag.on && bars >= 2) {
      const win = n - 2 * SPB;
      const src = bars >= 4 ? n - 4 * SPB : win;
      const cut = (evs, a, b, at) => evs.filter((e) => e.step >= a && e.step < b).map((e) => ({ ...e, notes: [...e.notes], step: e.step - a + at, len: Math.min(e.len, b - e.step) }));
      tracks.forEach((t) => {
        const evs = role(t) === 'melody' && evsOf(t);
        if (!evs || !evs.some((e) => e.step >= src && e.step < src + SPB / 2)) return; // motif muet au départ : rien à fragmenter
        const keep = evs.filter((e) => e.step < win).map((e) => ({ ...e, len: Math.min(e.len, win - e.step) }));
        data[t.id].events = [...keep, ...cut(evs, src, src + SPB, win), ...cut(evs, src, src + SPB / 2, n - SPB), ...cut(evs, src, src + SPB / 2, n - SPB / 2)];
      });
    }
    // T03 : pédale de dominante (ou de tonique) à la basse
    if (out && out.pedal.on) {
      const from = n - Math.min(bars, out.pedal.len) * SPB;
      const pc = out.pedal.note === 'tonic' ? kp[0] : pcOf(kp[0] + 7);
      tracks.forEach((t) => {
        const evs = role(t) === 'bass' && evsOf(t);
        if (!evs || !evs.length) return;
        const near = evs.filter((e) => e.step >= from)[0] || evs[evs.length - 1];
        const ref = Math.min(...near.notes);
        let m = ref - pcOf(ref) + pc;
        if (m - ref > 6) m -= 12;
        const v = clampV(Math.max(...evs.filter((e) => e.step >= from).map((e) => e.vel ?? 0.8), 0.7));
        const keep = evs.filter((e) => e.step < from).map((e) => ({ ...e, len: Math.min(e.len, from - e.step) }));
        for (let s = from; s < n; s += SPB) keep.push({ step: s, len: Math.min(SPB, n - s), notes: [m], vel: s === from ? v : clampV(v * 0.9) });
        data[t.id].events = keep;
      });
    }
    // T04 : élargissement du registre des accords et des arpèges
    if (out && out.widen.on) {
      const L = Math.min(bars, out.widen.len) * SPB;
      const from = n - L;
      tracks.forEach((t) => {
        const evs = ['chords', 'arp'].includes(role(t)) && evsOf(t);
        if (!evs) return;
        evs.forEach((e) => {
          if (e.step < from || !e.notes.length) return;
          const p = (e.step - from + Math.min(e.len, n - e.step) / 2) / L; // position du milieu de la note dans la fenêtre
          const lo = Math.min(...e.notes);
          const hi = Math.max(...e.notes);
          const add = [];
          if (p >= 1 / 3 && hi + 12 <= 91) add.push(hi + 12);
          if (p >= 2 / 3 && e.notes.length >= 3 && lo - 12 >= 40) add.push(lo - 12);
          if (add.length) e.notes = [...new Set([...e.notes, ...add])].sort((a, b) => a - b);
        });
      });
    }
    // T05 : suspension (retard de la tierce par la quarte) au début de la scène
    if (inn && inn.susp.on && spans.length) {
      const D = Math.min(inn.susp.len, spans[0].len);
      const root = spans[0].chord.rootPc;
      const isThird = (m) => [3, 4].includes(pcOf(m - root));
      tracks.forEach((t) => {
        const evs = ['chords', 'arp'].includes(role(t)) && evsOf(t);
        if (!evs) return;
        const outE = [];
        evs.forEach((e) => {
          if (e.step >= D || !e.notes.some(isThird)) return void outE.push(e);
          const sus = e.notes.map((m) => (isThird(m) ? m - pcOf(m - root) + 5 : m));
          const susE = { ...e, notes: [...new Set(sus)].sort((a, b) => a - b), len: Math.min(e.len, D - e.step) };
          outE.push(susE);
          if (e.step + e.len > D) outE.push({ ...e, step: D, len: e.step + e.len - D, vel: clampV((e.vel ?? 0.7) * 0.9) });
        });
        data[t.id].events = outE.sort((a, b) => a.step - b.step);
      });
    }
  }
  /** Réglages d'une jonction : le plan, puis ce que l'utilisateur a changé (fx.junctions['de>à']). */
  function junctionEff(spec, from, to, fx) {
    const d = junctionDefaults(spec, from, to);
    const u = (fx && fx.junctions && fx.junctions[`${from}>${to}`]) || {};
    Object.keys(d).forEach((k) => (d[k] = { ...d[k], ...(u[k] || {}) }));
    return d;
  }
  const PERC_LOOPS = [
    { id: 'sh', piece: 'sh', name: 'Shaker', sub: 'boucle 16es' },
    { id: 'cg', piece: 'perc', name: 'Conga', sub: 'tumbao' },
    { id: 'tom', piece: 'misc', name: 'Tom', sub: 'roulant, grave' },
  ];
  const PERC_STYLES = [
    { id: 'techno', name: 'Techno : shaker 16es' },
    { id: 'latin', name: 'Latin : tumbao' },
    { id: 'minimal', name: 'Minimal : contretemps' },
  ];
  // une mesure de 16 pas : un chiffre = vélocité (en dixièmes), « . » = silence
  const PERC_PAT = {
    techno: { sh: '6354636463546364', cg: '..5..6..5.6..5.6', tom: '....5.......5...' },
    latin: { sh: '6.4.6.4.6.4.6.4.', cg: '..6.76..6.76.67.', tom: '.5..5.5.5..5..5.' },
    minimal: { sh: '..5...5...5...5.', cg: '......5.......5.', tom: '..............5.' },
  };
  /** Pas d'une boucle de percussion sur `bars` mesures (le tom roule sur la dernière mesure de chaque phrase de 4). */
  function percLoopSteps(loop, style, bars, r) {
    const pat = (PERC_PAT[style] || PERC_PAT.techno)[loop];
    const out = new Array(bars * SPB).fill(0);
    for (let b = 0; b < bars; b++) {
      for (let i = 0; i < SPB; i++) if (pat[i] !== '.') out[b * SPB + i] = vel(r, +pat[i] / 10, 0.06);
      if (loop === 'tom' && style !== 'minimal' && b % 4 === 3) [12, 13, 14, 15].forEach((i, k) => (out[b * SPB + i] = vel(r, 0.5 + k * 0.1, 0.04)));
    }
    return out;
  }
  /** Fusionne des courbes { pas: valeur } de segments qui se recouvrent (volume : le plus fort ; sinon la plus récente). */
  function mergeLanes(comps, param, n) {
    const have = comps.filter((c) => c.lanes && c.lanes[param]);
    if (!have.length) return null;
    const pts = have.map((c) => Object.entries(c.lanes[param]).map(([x, y]) => [+x, y]).sort((p, q) => p[0] - q[0]));
    const steps = new Set();
    have.forEach((c, i) => {
      pts[i].forEach(([x]) => steps.add(x));
      if (have.length > 1) {
        if (c.from > 0) steps.add(c.from - 1);
        if (c.to < n - 1) steps.add(c.to + 1);
      }
    });
    const def = (sceneParam(param) || {}).def ?? 0;
    const out = {};
    let hold = def;
    [...steps].sort((x, y) => x - y).forEach((s) => {
      let v = null;
      have.forEach((c, i) => {
        if (s < c.from || s > c.to) return;
        const y = autoAt(pts[i], s);
        v = v === null ? y : param === 'volume' ? Math.max(v, y) : y;
      });
      if (v === null) v = hold;
      hold = v;
      out[s] = Math.round(v * 1000) / 1000;
    });
    return out;
  }
  /**
   * Piste Effets d'une scène quand ses jonctions sont réglées : notes et courbes. Composantes : ambiance (plan : fx « swell »),
   * montée de bruit (jonction sortante), cymbale inversée (sortante), impact et descente (entrante). `cut` : pas de silence
   * avant la fin de la scène (la montée et l'ambiance s'arrêtent, la cymbale inversée non). Avec les réglages du plan,
   * le résultat est celui de fxEvents / sectionAuto.
   */
  function fxSceneTrack(sec, key, bars, out, inn, cut, tech) {
    const n = bars * SPB;
    const t = 48 + pcOf(H().scale(key)[0].pc);
    const stop = n - cut;
    const comps = [];
    const trim = (e) => (cut && e.step >= stop ? null : cut ? { ...e, len: Math.min(e.len, stop - e.step) } : e);
    const add = (events, from, to, lanes, keep) => comps.push({ events: keep ? events : events.map(trim).filter(Boolean), from, to, lanes: tech ? lanes : null });
    const shift = (off, o) => Object.fromEntries(Object.entries(o).map(([x, y]) => [+x + off, y]));
    if (sec.fx === 'swell') {
      const ev = [];
      for (let s = 0; s < n; s += 4 * SPB) ev.push({ step: s, len: Math.min(4 * SPB, n - s), notes: [t + 12], vel: 0.55 });
      add(ev, 0, n - 1, { filter: ramp(n, -0.75, -0.35), volume: { 0: 0.5 }, reverb: { 0: 0.6 } });
    }
    if (out.riser.on) {
      const L = Math.min(out.riser.len, bars) * SPB;
      const off = n - L;
      const lanes = { volume: shift(off, ramp(L, 0.15, RISER_TOP)), reverb: shift(off, ramp(L, 0.2, 0.6, 0.5)) };
      if (out.riser.filter === 'lp') lanes.filter = shift(off, ramp(L, -0.9, 0.1));
      else if (out.riser.filter === 'hp') lanes.filter = shift(off, ramp(L, 0.85, 0));
      add([{ step: off, len: L, notes: [t + 12], vel: 0.8 }], off, n - 1, lanes);
    }
    if (out.rev.on) {
      const L = Math.min(out.rev.len, n);
      const off = n - L;
      add([{ step: off, len: L, notes: [t + 12], vel: 0.75 }], off, n - 1, { volume: shift(off, { 0: 0.1, [L - 1]: 0.85 }), filter: shift(off, { 0: -0.8, [L - 1]: 0.1 }), reverb: shift(off, { 0: 0.4 }) }, true);
    }
    if (inn.impact.on && inn.impact.type !== 'crash') {
      const L = Math.min(n, 2 * SPB);
      add([{ step: 0, len: L, notes: [t], vel: inn.impact.level }], 0, L - 1, { volume: { 0: 1, [L - 1]: 0 }, reverb: { 0: 0.6 } });
    }
    if (inn.down.on) {
      const off = Math.min(4, n - 1);
      const L = Math.min(inn.down.len * SPB, n - off);
      add([{ step: off, len: L, notes: [t + 12], vel: 0.6 }], off, off + L - 1, { volume: shift(off, { 0: 0.6, [L - 1]: 0 }), filter: shift(off, { 0: 0, [L - 1]: -0.85 }), reverb: shift(off, { 0: 0.5 }) });
    }
    const events = comps.flatMap((c) => c.events).sort((x, y) => x.step - y.step);
    const auto = {};
    ['filter', 'volume', 'reverb'].forEach((p) => {
      const m = mergeLanes(comps, p, n);
      if (m) auto[p] = m;
    });
    return { events, auto: Object.keys(auto).length ? auto : null };
  }

  /* ---------- section et chanson ---------- */
  /** Coupe ce qui sonne dans les derniers pas d'une section (silence avant le drop : un temps par défaut) ; skip : pistes épargnées. */
  function gapEnd(data, bars, steps = 4, skip = null) {
    const cut = bars * SPB - steps;
    for (const [id, d] of Object.entries(data)) {
      if (skip && skip.has(id)) continue;
      if (d.steps) for (let s = cut; s < d.steps.length; s++) d.steps[s] = 0;
      if (d.events) {
        d.events = d.events.filter((e) => e.step < cut);
        d.events.forEach((e) => (e.len = Math.min(e.len, cut - e.step)));
      }
    }
  }

  /* ---------- types d'instrument ---------- */
  const KINDS = ['drums', 'bass', 'chords', 'arp', 'melody'];
  const DEFAULT_KIND = { drums: 'drums', perc: 'drums', bass: 'bass', pad: 'chords', strings: 'chords', keys: 'chords', guitar: 'chords', arp: 'arp', arpchord: 'arp', lead: 'melody', vox: 'melody', sax: 'melody' };
  const DEFAULT_MODE = { bass: '8', chords: 'sustain', arp: 'up16', melody: 'verse', drums: 'both' };
  const ARP_MODES = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'rise', 'ost16', 'dotted'];
  const MODES = () => ({
    bass: [...['whole', '8', 'pulse8', 'oct', 'gallop', 'offbeat', 'roll', 'off16', 'half', 'quarter', 'drone', 'sync', 'walk'], ...BASS_NEW.map((b) => b[0])],
    chords: ['sustain', 'swell', 'float', 'ballad', 'pluck', ...Object.keys(RHYTHM)],
    arp: ARP_MODES,
    melody: Object.keys(CENTER),
    drums: ['both', 'kick', 'snare'],
  });
  const roleOfTrack = (t) => ((t.band && t.band.key) || '').split(':')[0];
  /** Musicien ajouté à l'assistant (id « x1 », « x2 »… : js/bandgroup.js) : il joue partout avec le générateur de son type et a sa propre graine. */
  const isExtra = (t) => !!(t.band && /^x\d+$/.test(t.band.musician || ''));
  /** Type par défaut d'un rôle (null : pas de type, comme « fx »). */
  const kindOfRole = (role) => (role === 'fx' ? null : DEFAULT_KIND[role] || 'chords');
  /** Identifiants d'instrument, un par piste : « musicien:clé », puis « #n » pour le n-ième doublon (comme les colonnes de l'assistant). */
  function instIds(tracks) {
    const seen = new Map();
    return tracks.map((t) => {
      const b = t.band || {};
      const base = b.musician ? `${b.musician}:${b.key}` : b.key || t.id;
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      return { id: n ? `${base}#${n}` : base, dup: n };
    });
  }
  /** Ce type convient-il à cette piste ? Un kit de batterie (piste drum) ne peut être que drums. */
  const checkKind = (t, kind) => KINDS.includes(kind) && (t.type !== 'drum' || kind === 'drums');
  /** Ancres de la fondamentale pour les notes percussives du type drums. */
  const percMidi = (pc) => 36 + pcOf(pc);
  /** Remonte une note de n degrés de la gamme (tierce diatonique : 2). */
  function scaleUp(note, n, keyPcs) {
    let m = note;
    for (let i = 0; i < n; i++) {
      m++;
      while (!keyPcs.includes(pcOf(m))) m++;
    }
    return m;
  }

  /**
   * Construit la chanson.
   *   kinds : { [idInstrument]: 'drums' | 'bass' | 'chords' | 'arp' | 'melody' } (voir l'en-tête), null = le type du rôle
   *   spec : plan (js/band-songs.js) ; tracks : pistes du projet créées par Band (avec t.band.key « rôle » ou « rôle:son »)
   *   melodySeed : 0 = la mélodie d'origine de l'inspiration ; un autre nombre tire une autre mélodie (lead, voix,
   *   sax) sans rien changer aux autres musiciens (assistant « Nouvelle chanson »)
   *   melody : réglages de la mélodie (null = caractère « Inspiration », plan par défaut) :
   *   { character (CHARACTERS), form (FORMS), rhythm ('auto' | RHYTHMS), complexity, range ('auto' = selon le rôle),
   *     ending ('closed' | 'open'), notes (notes par phrase, 0 = libre),
   *     plans: { section: [{ bars, mode: 'on'|'hold'|'off', letter }] }, seeds: { section: { A: n, B: n… } },
   *     scenes: { section: { character, notes } } (caractère et notes par phrase propres à une scène) }
   *   harmony : accords et tonalités choisis dans l'assistant (étape Accords), par section :
   *     { keys: { section: { tonic, mode } }, chords: { section: [grille d’Harmonie] }, emotions: { section: id } }
   *   parts : réglages par scène (batterie, basse, nappe, arpège, rôles muets), voir l'en-tête du fichier ; null = le plan tel quel
   *   fx : transitions et percussions d'ambiance (étape « Effets et transitions »), voir junctionDefaults ; null = le plan tel quel
   * → { key, scenes: [{ id, name, bars, key, emotion, data, spans }], song: [{ scene, repeat }] }
   */
  function build(spec, presetId, tracks, { melodySeed = 0, melody = null, harmony = null, parts = null, kinds = null, fx = null } = {}) {
    const key = parseKey(spec.key);
    const ids = instIds(tracks);
    // type de chaque piste (null : fx, qui garde son jeu) ; un kit de batterie reste drums
    const kindOfT = new Map();
    tracks.forEach((t, i) => {
      const role = roleOfTrack(t);
      const def = t.type === 'drum' ? 'drums' : kindOfRole(role);
      const want = kinds && (kinds[ids[i].id] ?? kinds[t.id]) !== undefined ? kinds[ids[i].id] ?? kinds[t.id] : t.kind;
      kindOfT.set(t, def && want && checkKind(t, want) ? want : def);
    });
    const melTracks = tracks.filter((t) => t.type !== 'drum' && kindOfT.get(t) === 'melody');
    // premier instrument mélodique : lead, vox, sax dans cet ordre, sinon le premier de la liste ; il porte la mélodie imposée
    const primaryMel = melTracks.find((t) => roleOfTrack(t) === SINGERS.find((r) => melTracks.some((x) => roleOfTrack(x) === r))) || melTracks[0] || null;
    const mel = melody || {};
    const order = [];
    const form = spec.form.split(/\s+/).filter(Boolean).map((t) => {
      const [id, n] = t.split('*');
      if (!spec.sections[id]) throw new Error('section inconnue : ' + id);
      if (!order.includes(id)) order.push(id);
      return { id, repeat: +n || 1 };
    });
    // jonctions de l'arrangement réglées par l'utilisateur : la première, dans l'ordre, qui sort de la scène (outJ) ou y entre (inJ)
    const fxJ = (fx && fx.junctions) || {};
    const touchedJ = (key) => !!fxJ[key] && Object.keys(fxJ[key]).length > 0;
    const joins = form.slice(1).map((b, i) => ({ from: form[i].id, to: b.id, key: `${form[i].id}>${b.id}` }));
    const outJ = (id) => joins.find((j) => j.from === id && touchedJ(j.key)) || null;
    const inJ = (id) => joins.find((j) => j.to === id && touchedJ(j.key)) || null;
    const scenes = order.map((id) => {
      const sec = spec.sections[id];
      const bars = sec.bars;
      const oj = outJ(id);
      const ij = inJ(id);
      const nextId = (joins.find((j) => j.from === id) || {}).to || null;
      const prevId = (joins.find((j) => j.to === id) || {}).from || null;
      const outE = oj ? junctionEff(spec, oj.from, oj.to, fx) : junctionDefaults(spec, id, nextId);
      const inE = ij ? junctionEff(spec, ij.from, ij.to, fx) : junctionDefaults(spec, prevId, id);
      const gapSteps = oj ? outE.gap.len : sec.gap ? 4 : 0;
      const hk = harmony && harmony.keys && harmony.keys[id];
      const k = hk ? { tonic: hk.tonic, mode: hk.mode } : sec.key ? parseKey(sec.key) : key;
      // grille : celle de l'étape Accords, sinon celle de la section (reprise tapée au clavier), sinon ses degrés
      const grid = (harmony && harmony.chords && harmony.chords[id]) || sec.grid;
      const spans = (grid && grid.length && spansFromGrid(grid, k, bars)) || spansOf(sec, k, bars);
      // as : section du modèle dont une section de reprise reprend le jeu (nuance, automation)
      const as = sec.as || id;
      // caractère et notes par phrase de cette scène
      const own = mel.scenes && mel.scenes[id];
      let smel = own ? { ...mel, ...own } : mel;
      // émotion de la scène → profil mélodique (contour, note visée sur les temps forts, registre, fin)
      const emoId = harmony && harmony.emotions && harmony.emotions[id];
      if (emoId && mel.useProfile !== false && SS.resolveMelodyProfile && SS.MELODY_PROFILES[emoId]) smel = { ...smel, profile: SS.resolveMelodyProfile(emoId, {}, k) };
      const energy = sec.energy ?? ENERGY[as] ?? 0.9;
      const dynK = dynKind(spec, id, form);
      const ownBuild = new Set();
      const data = {};
      const pp = (parts && parts[id]) || null; // réglages de cette scène
      const muted = (pp && pp.off) || [];
      const dp0 = pp && pp.drums;
      // mélodie imposée (parts[section].lead) : portée par la première piste chantante, dans l'ordre lead, vox, sax
      const ownLead = pp && pp.lead && Array.isArray(pp.lead.events) ? pp.lead.events : null;
      const leadTrack = ownLead ? primaryMel : null;
      const doubles = []; // instruments mélodiques qui doublent le premier (inst.double)
      // pièces du kit (hors percussionniste) : la caisse claire, sinon le clap, joue le roulement de la montée
      const kitSounds = new Set(tracks.filter((x) => x.type === 'drum' && roleOfTrack(x) !== 'perc').map((x) => ((x.band && x.band.key ? x.band.key : '').split(':')[1]) || x.sound));
      tracks.forEach((t, ti) => {
        // réglages de cet instrument dans la scène (clé : id d'instrument, id de piste ; pour un kit, id du musicien)
        const im = pp && pp.inst;
        const ie = (im && (im[ids[ti].id] || im[t.id] || (t.type === 'drum' && t.band && im[t.band.musician]))) || null;
        const [role, sound] = (t.band && t.band.key ? t.band.key : '').split(':');
        const singer = SINGERS.includes(role);
        const r = rng(`${presetId}/${id}/${t.band ? t.band.key : t.id}` + (isExtra(t) ? `@${t.band.musician}` : '') + (singer && melodySeed ? `#${melodySeed}` : ''));
        if (t.type === 'drum') {
          const dp = ie ? { ...(dp0 || {}), ...ie } : dp0; // réglages du kit : par instrument, sinon ceux du rôle
          const mode = role === 'perc' ? sec.perc ?? sec.drums : sec.drums;
          const snd = sound || t.sound;
          if (muted.includes(role) || (ie && ie.off)) return void (data[t.id] = { steps: new Array(bars * SPB).fill(0) });
          const pat = dp && dp.pattern && SS.drumPattern ? SS.drumPattern(dp.style, dp.pattern) : null;
          const lanes = dp && (dp.edits || (pat && pat.lanes));
          const fo = { fill: dp && dp.fill, fillType: (dp && dp.fillType) || 'roll', crash: !!(dp && dp.crash), energy };
          if (dp && dp.build) ownBuild.add(t.id); // progression réglée dans l'assistant : la dynamique n'y touche pas
          // montée avec progression réglée dans l'assistant : le roulement (caisse claire ou clap, charleston, crash) suit la courbe
          if (sec.drums === 'build' && dp && dp.build && role !== 'perc') {
            const rs = rollSteps(snd, bars, r, dp.build, rollerOf(kitSounds), role, kitSounds);
            if (rs) return void (data[t.id] = rs);
          }
          // grille de l'assistant : ce son a sa piste (toute longueur, ratchets, conditions)
          if (hasGridLane(dp && dp.edits, snd)) return void (data[t.id] = gridSteps(snd, bars, r, dp.edits, fo));
          if (lanes) {
            // motif de la bibliothèque : il pilote kick, caisse, clap, charleston, crash et toms
            const st = patternSteps(snd, bars, r, { lanes, ...fo });
            if (st) return void (data[t.id] = { steps: st });
          }
          // fill explicite (même « off ») : il remplace le roulement automatique de fin de section
          let steps = drumSteps(snd, mode, sec.groove || spec.groove, bars, r, { perc: role === 'perc', last: sec.fill !== false && !(dp && dp.fill), energy });
          if (dp && ((dp.fill && dp.fill !== 'off') || dp.crash) && mode && mode !== 'off' && mode !== 'build') steps = patternSteps(snd, bars, r, { base: steps, ...fo }) || steps;
          data[t.id] = { steps };
          if (dynK === 'groove') holdDrums(steps, snd);
          if (spec.tech && !(mode === 'build' && dp && dp.build)) drumSpice(data[t.id], snd, mode, bars, r); // la progression de montée remplace le roulement d'origine
          return;
        }
        const kd = kindOfT.get(t); // type de l'instrument (null : fx)
        const extra = isExtra(t); // musicien ajouté : jamais muet d'office, réglages de l'instrument seulement
        const changed = !!kd && (extra || kd !== kindOfRole(role)); // type différent de celui du rôle : pas de réglages du rôle
        const o = changed ? ie : ie ? { ...((pp && pp[role]) || {}), ...ie } : (pp && pp[role]) || null; // réglages de l'instrument, du rôle (basse, nappe, arpège)
        const off = muted.includes(role) || !!(ie && ie.off);
        const er = !changed ? role : kd === 'bass' || kd === 'drums' ? 'bass' : kd === 'arp' ? 'arp' : kd === 'melody' ? 'lead' : 'pad'; // rôle dont l'instrument prend la nuance et les effets
        let mode;
        if (off) mode = null;
        else if (!changed) mode = (o && o.mode) || sec[role];
        else if (!extra && !((o && (o.mode || o.one)) || sec[role])) mode = null; // muet dans le plan, rien ne l'allume
        else {
          const valid = MODES()[kd];
          const plan = { bass: [sec.bass], chords: [sec.pad, sec.strings, sec.keys], arp: [sec.arp, sec.arpchord], melody: [sec.lead, sec.vox, sec.sax], drums: [] }[kd];
          mode = o && valid.includes(o.mode) ? o.mode : plan.find((m) => m && valid.includes(m)) || DEFAULT_MODE[kd];
        }
        const one = kd === 'arp' && (role === 'arp' || changed) && !off && o && o.one && SS.Arp ? o.one : null; // Arp One : l'emporte sur le mode
        const ownL = ie && ie.lead && Array.isArray(ie.lead.events) ? ie.lead.events : t === leadTrack ? ownLead : null; // mélodie imposée de cet instrument
        // mélodie du moteur : réglages de l'instrument par-dessus ceux de la scène ; la graine contient le rôle et le doublon
        const sing = (mrole, m) => {
          const im2 = ie ? Object.fromEntries(['character', 'notes', 'rhythm', 'complexity', 'range', 'ending', 'form'].filter((f) => ie[f] !== undefined).map((f) => [f, ie[f]])) : null;
          const dup = (ids[ti].dup ? `#${ids[ti].dup}` : '') + (extra ? `@${t.band.musician}` : '');
          return m === 'rise' ? riseEvents(spans, r, k, bars) : melodyPart(spans, k, bars, mrole, im2 && Object.keys(im2).length ? { ...smel, ...im2 } : smel, (ie && ie.plan) || (mel.plans && mel.plans[id]), (ie && ie.seeds) || (mel.seeds && mel.seeds[id]), `${presetId}/${id}/${role}${dup}/${melodySeed}`, m);
        };
        let events = [];
        // mélodie imposée : même dans une scène où l'inspiration ne chante pas (sauf rôle coupé par « off »)
        if (ownL && kd === 'melody' && !off)
          events = ownL.filter((e) => e && e.step >= 0 && e.step < bars * SPB && e.notes && e.notes.length).map((e) => ({ step: e.step, len: Math.max(1, Math.min(e.len, bars * SPB - e.step)), notes: [...e.notes], vel: e.vel ?? 0.8 }));
        else if (one) events = arpOneEvents(spans, one, bars);
        else if (mode && changed) {
          if (kd === 'bass') {
            const kp = H().scale(k).map((d) => d.pc);
            const ped = o && { tonic: kp[0], fifth: pcOf(kp[0] + 7) }[o.pedal];
            events = bassEvents(spans, mode, r, kp, o ? { pedalPc: ped ?? null, approach: o.approach !== false, shift: o.register === 'mid' ? 12 : 0 } : undefined);
          } else if (kd === 'arp') events = arpEvents(spans, mode, r);
          else if (kd === 'chords') events = chordEvents(spans, mode, r, { lo: 53, hi: 76, open: !!(o && o.voicing === 'open') });
          else if (kd === 'melody') events = sing(role === 'vox' ? 'vox' : 'lead', mode);
          else {
            // notes percussives : fondamentale de l'accord sur la grosse caisse et la caisse claire du motif de la scène
            const dsrc = ie && (ie.pattern || ie.edits) ? ie : dp0;
            const dpat = dsrc && dsrc.pattern && SS.drumPattern ? SS.drumPattern(dsrc.style, dsrc.pattern) : null;
            const lanes = dsrc && (dsrc.edits || (dpat && dpat.lanes));
            const hit = (snd) => (hasGridLane(lanes, snd) ? gridSteps(snd, bars, r, lanes).steps : lanes ? patternSteps(snd, bars, r, { lanes }) : drumSteps(snd, sec.drums, sec.groove || spec.groove, bars, r, {})) || [];
            const kick = mode === 'snare' ? [] : hit('bd');
            const snare = mode === 'kick' ? [] : hit('sd');
            for (let s = 0; s < bars * SPB; s++) {
              const v = Math.max(kick[s] || 0, snare[s] || 0);
              const sp = v > 0 && spans.find((x) => s >= x.step && s < x.step + x.len);
              if (sp) events.push({ step: s, len: 1, notes: [percMidi(sp.chord.rootPc)], vel: v });
            }
          }
        } else if (mode) {
          if (role === 'bass') {
            const kp = H().scale(k).map((d) => d.pc);
            const ped = o && { tonic: kp[0], fifth: pcOf(kp[0] + 7) }[o.pedal];
            events = bassEvents(spans, mode, r, kp, o ? { pedalPc: ped ?? null, approach: o.approach !== false, shift: o.register === 'mid' ? 12 : 0 } : undefined);
          }
          else if (role === 'fx') events = fxEvents(spans, mode, k, bars);
          else if (role === 'arp') events = arpEvents(spans, mode, r);
          else if (singer) events = sing(role, mode);
          else if (role === 'arpchord') events = arpEvents(spans, mode, r);
          else {
            // nappe, cordes, piano, guitare : accords (ou arpège si le mode en est un)
            const range = role === 'keys' ? { lo: 57, hi: 79 } : role === 'guitar' ? { lo: 52, hi: 74 } : role === 'strings' ? { lo: 55, hi: 81 } : { lo: 53, hi: 76 };
            events = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'ost16', 'dotted'].includes(mode) ? arpEvents(spans, mode, r) : chordEvents(spans, mode, r, role === 'pad' && o && o.voicing === 'open' ? { ...range, open: true } : range);
          }
        }
        // piste Effets d'une scène dont une jonction est réglée : montée, cymbale inversée, impact, descente (voir fxSceneTrack)
        let fxScene = null;
        if (role === 'fx' && !changed && !off && (oj || ij)) {
          fxScene = fxSceneTrack(sec, k, bars, outE, inE, gapSteps, !!spec.tech);
          events = fxScene.events;
        }
        data[t.id] = { events: role === 'fx' ? events : shapeVel(events, er, { energy, bars, build: sec.drums === 'build' }) };
        if (ie && ie.double && kd === 'melody' && t !== primaryMel && !off) doubles.push([t, ie.double, o]);
        // techno : dans la montée, les mélodies restent en retrait pour que le drop frappe plus fort
        if (spec.tech && sec.drums === 'build' && ['lead', 'vox', 'arp', 'keys'].includes(er)) data[t.id].events.forEach((e) => (e.vel = clampV(e.vel * 0.6)));
        // intro et break planants : tout est joué piano (la basse tenue encore plus), le drop garde la pleine force
        if (spec.tech && sec.float && role !== 'fx') data[t.id].events.forEach((e) => (e.vel = clampV(e.vel * (er === 'bass' ? 0.5 : 0.68))));
        const myAuto = ie && ie.auto && !off ? normalizeAuto(ie.auto) : null; // automation de l'instrument dans la scène
        if (myAuto && myAuto.vel && role !== 'fx') applyVelCurve(data[t.id], myAuto.vel, bars); // vélocité : avant les accents, qui s'y ajoutent
        if (kd === 'bass' && o && o.accents && !off) applyAccents(data[t.id].events, o.accents, bars); // accents : après la nuance, pour qu'ils restent audibles
        if ((spec.tech || dynK) && (events.length || role !== 'fx')) {
          const auto = fxScene ? fxScene.auto : sectionAuto(as, sec, er, bars, role === 'fx', dynK, !!spec.tech);
          if (auto && events.length) data[t.id].auto = auto;
        }
      });
      // doublure : la mélodie du premier instrument mélodique, une octave ou une tierce diatonique au-dessus
      const src = primaryMel && data[primaryMel.id];
      if (src) {
        const kp = H().scale(k).map((d) => d.pc);
        doubles.forEach(([t, how]) => {
          data[t.id] = { events: src.events.map((e) => ({ ...e, notes: e.notes.map((n) => (how === 'third' ? scaleUp(n, 2, kp) : n + 12)), vel: clampV(e.vel * 0.85) })) };
        });
      }
      // montée EDM / techno : la grosse caisse et le charleston reviennent en force (volume), la montée avance
      if (dynK === 'build' || dynK === 'groove' || dynK === 'outro' || dynK === 'intro')
        tracks.forEach((t) => {
          const d = data[t.id];
          const a = t.type === 'drum' && !ownBuild.has(t.id) && d && d.steps && d.steps.some((v) => v > 0) ? dynDrumsAuto(kind((t.band && t.band.key ? t.band.key.split(':')[1] : '') || t.sound), bars, dynK, !!spec.tech) : null;
          if (a) d.auto = { ...(d.auto || {}), ...a };
        });
      // automation de la scène : vélocité des kits et des doublures, courbes de réglages de toutes les pistes (elles remplacent celles du plan)
      tracks.forEach((t, ti) => {
        const im = pp && pp.inst;
        const ie = im && (im[ids[ti].id] || im[t.id] || (t.type === 'drum' && t.band && im[t.band.musician]));
        const A = ie && !ie.off && data[t.id] ? normalizeAuto(ie.auto) : null;
        if (!A) return;
        if (A.vel && (t.type === 'drum' || doubles.some((x) => x[0] === t))) applyVelCurve(data[t.id], A.vel, bars);
        applyAutoLanes(data[t.id], A, bars);
      });
      if (fx) {
        // passe-haut global (jonction sortante réglée) : toutes les pistes mélodiques et la basse, sur la 2e moitié de la scène
        if (oj && oj.key && fxJ[oj.key].hp) {
          const n = bars * SPB;
          tracks.forEach((t) => {
            const kd = kindOfT.get(t);
            const d = data[t.id];
            if (t.type === 'drum' || !kd || kd === 'drums' || roleOfTrack(t) === 'fx' || !d || !d.events || !d.events.length) return;
            const lane = { ...(d.auto || {}) };
            if (outE.hp.on) lane.filter = ramp(n, 0, kd === 'bass' ? Math.min(0.95, hpAmt(outE.hp.freq) + (HP_BASS - HP_MEL)) : hpAmt(outE.hp.freq), 0.5);
            else if (sec.drums === 'build' && !sec.float) delete lane.filter; // le plan l'y mettait : coupé
            if (Object.keys(lane).length) d.auto = lane;
            else delete d.auto;
          });
        }
        // crash de la batterie au premier pas (jonction entrante réglée : impact)
        // (réglage égal à celui du plan : le crash du plan reste tel quel, vélocité comprise)
        const impDef = ij ? junctionDefaults(spec, ij.from, ij.to).impact : null;
        if (ij && fxJ[ij.key].impact && (inE.impact.on !== impDef.on || inE.impact.type !== impDef.type || (inE.impact.on && inE.impact.level !== impDef.level))) {
          tracks.forEach((t) => {
            const [rl, snd] = ((t.band && t.band.key) || '').split(':');
            const d = data[t.id];
            if (t.type !== 'drum' || rl === 'perc' || (snd || t.sound) !== 'cr' || !d || !d.steps) return;
            if (!inE.impact.on || inE.impact.type === 'impact') d.steps[0] = 0;
            else if (fxJ[ij.key].impact.level !== undefined) d.steps[0] = clampV(inE.impact.level * 0.95);
            else if (!d.steps[0]) d.steps[0] = 0.9;
          });
        }
        // boucles de percussion : vrai = la boucle du style, faux = coupée
        const loops = fx.perc && fx.perc.loops && fx.perc.loops[id];
        if (loops)
          tracks.forEach((t) => {
            const [rl, snd] = ((t.band && t.band.key) || '').split(':');
            const d = data[t.id];
            const lp = PERC_LOOPS.find((x) => x.piece === (snd || t.sound));
            if (t.type !== 'drum' || rl !== 'perc' || !lp || typeof loops[lp.id] !== 'boolean' || !d || !d.steps) return;
            delete d.rat;
            delete d.cond;
            d.steps = loops[lp.id] ? percLoopSteps(lp.id, (fx.perc && fx.perc.style) || 'techno', bars, rng(`${presetId}/${id}/loop/${lp.id}`)) : new Array(bars * SPB).fill(0);
          });
      }
      // procédés d'écriture T01–T05 (réglés dans une jonction : éteints dans le plan)
      if (fx && (oj || ij))
        writeTransitions(data, tracks, (t) => (t.type === 'drum' ? 'drums' : kindOfT.get(t) || null), { bars, key: k, spans, out: oj ? outE : null, inn: ij ? inE : null });
      if (gapSteps) gapEnd(data, bars, gapSteps, oj ? new Set(tracks.filter((t) => roleOfTrack(t) === 'fx').map((t) => t.id)) : null);
      const sc = { id: SS.uid(), sec: id, name: sec.name || NAMES[id] || id, bars, key: k, data, spans };
      const emo = harmony && harmony.emotions && harmony.emotions[id];
      if (emo || spec.emotion) sc.emotion = emo || sec.emotion || spec.emotion;
      return sc;
    });
    const song = form.map((f) => ({ scene: scenes[order.indexOf(f.id)].id, repeat: f.repeat }));
    return { key, scenes, song };
  }

  /* catalogue des modes de basse ajoutés : [id, nom, description, dessin] ; dessin = [pas, longueur, niveau] pour une mesure
     (niveau 0 = fondamentale, 1 = quinte ou tierce, 2 = octave) */
  const BASS_NEW = [
    ['rootfifth', 'Fondamentale-quinte', 'Croches alternées fondamentale / quinte', [[0, 2, 0], [2, 2, 1], [4, 2, 0], [6, 2, 1], [8, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]]],
    ['arp', 'Arpège', 'Croches : fondamentale, tierce, quinte, octave', [[0, 2, 0], [2, 2, 1], [4, 2, 1], [6, 2, 2], [8, 2, 0], [10, 2, 1], [12, 2, 1], [14, 2, 2]]],
    ['tresillo', 'Tresillo', 'Trois, trois, deux : le motif latin, deux fois par mesure', [[0, 3, 0], [3, 3, 0], [6, 2, 0], [8, 3, 0], [11, 3, 0], [14, 2, 0]]],
    ['trance', 'Trance', 'Trois doubles après chaque temps : basse trance roulante', [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15].map((s) => [s, 1, 0])],
    ['sixteen', 'Doubles', 'Seize doubles croches, accent sur chaque temps', Array.from({ length: 16 }, (_, s) => [s, 1, 0])],
    ['oct16', 'Octaves en doubles', 'Doubles alternées fondamentale / octave', Array.from({ length: 16 }, (_, s) => [s, 1, s % 2 ? 2 : 0])],
    ['pickup', 'Reprise', 'Fondamentale tenue, reprise à l’octave en fin de mesure', [[0, 13, 0], [14, 2, 2]]],
    ['funk', 'Funk', 'Syncopes en doubles, notes fantômes', [[0, 2, 0], [3, 1, 0], [6, 1, 2], [7, 1, 0], [10, 1, 0], [12, 2, 0], [14, 1, 1]]],
  ];

  return { build, junctionDefaults, junctionEff, PERC_LOOPS, PERC_STYLES, hpHz, hpAmt, HP_MEL, isExtra, KINDS, DEFAULT_KIND, DEFAULT_MODE, kindOfRole, instIds, checkKind, parseChord, spansOf, spansFromGrid, SINGERS, NAMES, CHARACTERS, FORMS, LETTERS, RHYTHMS, defaultPlan, fitPlan, BASS_NEW, ACC_PRESETS, ACC_DEFAULT, ACC_VEL, accentPreset, accentPeriod, normalizeAccents, AUTO_SHAPES, SCENE_AUTO, AUTO_DEF, normalizeAuto, normalizeAutoSpec, newAutoSpec, autoPoints, autoCurve, autoLane, autoAt, autoNorm, autoReal, velMul, BUILD_LEVELS, BUILD_PRESETS, buildLevels, progLevels, rollBar, rollerOf, hasGridLane, laneKey, _rng: rng };
})();
