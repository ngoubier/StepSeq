/*
 * Band : « Créer toute la chanson ».
 * À partir d'un plan de chanson (js/band-songs.js : tonalité, sections, accords, ce que joue chaque musicien)
 * et des pistes créées par Band, écrit toutes les scènes (notes et pas de batterie) et l'arrangement.
 *
 * Tout est déterministe (générateur pseudo-aléatoire initialisé par l'inspiration et la section) :
 * la même inspiration donne toujours la même chanson. Les mélodies (calculées par le moteur unique, js/melody.js,
 * SS.melody.section) sont originales : un motif rythmique
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
 *  - bass { mode, pedal: none | tonic | fifth, approach, register: low | mid | high (C1, C2, C3) } : mode remplace celui du plan (et peut
 *    allumer la basse ; s'ajoutent half et quarter) ; pedal joue la tonique (ou la quinte) de la tonalité sous tous les
 *    accords, sans notes d'approche ; approach false les supprime ; mid = une octave plus haut ;
 *  - pad { mode, voicing: close | open } ; arp { mode } : remplacent ceux du plan (et peuvent les allumer) ;
 *  - arp { one } : réglages d'Arp One (js/arp.js, SS.Arp.normalize) ; les accords de la scène passent dans l'arpégiateur
 *    (voicing médium 57-76, tempo nominal 120 BPM, boucle 0 : déterministe), les notes sont placées sur la grille de pas.
 *    one l'emporte sur mode ; il faut que js/arp.js soit chargé, sinon mode / plan ;
 *  - off : rôles muets dans la scène (['arp', 'lead']) ;
 *  - lead { events: [{ step, len, notes: [midi], vel }] } : la mélodie de la scène (étape Mélodie de l'assistant).
 *    Elle remplace celle du moteur sur la première piste chantante présente (lead, puis vox, puis sax) ;
 *    [] = silence ; elle joue aussi dans une scène où l'inspiration ne chante pas (sauf rôle coupé par off).
 *    Les autres pistes chantantes gardent leur mélodie.
 *
 * Type d'instrument (option kinds de build) : chaque instrument a un type parmi KINDS = drums, bass, chords, arp, guitar,
 * melody. Le type choisit le générateur qui joue ses notes. Par défaut c'est celui de son rôle (DEFAULT_KIND : drums et perc →
 * drums, bass → bass, pad, strings, keys, brass → chords, guitar → guitar, arp, arpchord → arp, lead, vox, sax → melody ; fx
 * n'a pas de type). guitar (le Guitariste, js/guitarist.js) joue avec le générateur des accords : motifs « g:<motif> » du
 * moteur de guitare (js/guitar-arp.js) ou accords plaqués (52-74) ; ajouté, il part du jeu sec.guitar, sinon de « g:pop ». Identifiant d'instrument : « musicien:clé » de t.band (la clé de colonne de l'assistant), suivi de « #n »
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
 * Piste Effets (rôle fx, sans type) : parts[section].fx = { mode, level, every, color, len, filter, dlen } (voir withSceneFx).
 * Musicien ajouté à l'assistant (id « x1 », « x2 »… : js/bandgroup.js, isExtra) : il joue dans toutes les scènes avec le générateur de son type
 *    (jamais muet d'office : mode du plan pour ce type, sinon mode par défaut) et sa graine contient son id (autre mélodie, autre motif de kit).
 * Automation par scène : inst[id].auto (voir « automation par scène » plus bas). Sans kinds ni inst, la chanson est exactement celle d'avant.
 * Musicien Ambient (rôle ambient, piste générative de js/ambient.js) : pas de notes ; inst[id].amb = { p, mv, r } règle sa présence
 * dans la scène (p : far | soft | mid | front), son mouvement (mv : stable | up | down | breathe) et son hasard (r, 0–1) ; build
 * en tire la courbe de présence sur toute la chanson (res.ambient[idPiste] = { presence, rands }, voir ambientCurves).
 */
window.SS = window.SS || {};

SS.bandSong = (() => {
  const H = () => SS.harmony;
  const pcOf = (n) => ((n % 12) + 12) % 12;
  /* ---------- mesure de la chanson ----------
   * Tout le moteur compte en doubles-croches. SPB = pas par mesure, BEAT = pas par temps : 4/4 (16, 4), 3/4 (12, 4),
   * 6/8 (12, 6 : noire pointée) et 12/8 (24, 6). setMeter('6/8') change la mesure de tout le moteur (build la règle
   * d'après son option sig) ; le tempo reste à la noire. Les motifs écrits pour une mesure (METER) ne sont proposés que
   * dans celle-ci ; les motifs sans mesure suivent celle de la chanson.
   */
  const METERS = { '4/4': [16, 4], '3/4': [12, 4], '6/8': [12, 6], '12/8': [24, 6] };
  let SPB = 16; // pas par mesure
  let BEAT = 4; // pas par temps
  let SIG = '4/4';
  /** Change la mesure du moteur ('4/4', '3/4', '6/8', '12/8' ; autre : 4/4). Rend la mesure retenue. */
  function setMeter(sig) {
    SIG = METERS[sig] ? sig : '4/4';
    [SPB, BEAT] = METERS[SIG];
    if (SS.melody && SS.melody.setMeter) SS.melody.setMeter(SPB, BEAT);
    if (SS.develop && SS.develop.setMeter) SS.develop.setMeter(SPB);
    return SIG;
  }
  const meter = () => ({ sig: SIG, spb: SPB, beat: BEAT, beats: SPB / BEAT });
  /** Temps forts secondaires : le 3 en 4/4, le 3 (7e croche) en 12/8 ; aucun en 3/4 et 6/8. */
  const halfBar = () => (SPB / BEAT) % 2 === 0 && SPB / BEAT > 2 ? SPB / 2 : -1;
  /** Contretemps de la caisse claire : 2 et 4 en 4/4, 2 et 3 en 3/4, le 2e temps en 6/8, 2 et 4 en 12/8. */
  const backbeats = () => (SIG === '3/4' ? [4, 8] : SIG === '6/8' ? [6] : SIG === '12/8' ? [6, 18] : [4, 12]);

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
    return p === 0 ? 1 : p === halfBar() ? 0.96 : p % BEAT === 0 ? 0.92 : p % 2 === 0 ? 0.86 : 0.8;
  };
  const DEPTH = { bass: 0.6, arp: 1, lead: 0.5, vox: 0.5, sax: 0.5, brass: 0.5, pad: 0.3, strings: 0.4, keys: 0.7, guitar: 0.8 };
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
      strong: (s) => s % SPB === 0 || s % SPB === halfBar() || (SIG === '6/8' && s % SPB === BEAT),
      beat: (s) => s % BEAT === 0,
      off: (s) => (BEAT === 4 ? s % 4 === 2 : s % 2 === 0 && s % BEAT !== 0),
      gallop: (s) => s % 6 === 0,
      sync: (s) => (SPB === 16 ? [0, 6, 12].includes(s % 16) : s % BEAT === 0),
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
  /** Baisse de volume sous un dialogue : −4 dB (10^(−4/20)). */
  const DIALOG_DIP = 0.631;
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
  function shapeVel(events, role, { energy, bars, build, own }) {
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
      // own : notes du moteur de guitare (Arp One), qui portent déjà leurs accents (pouce, doigts, mélodie) : pas d'accent en plus
      let v = e.vel * (own ? 1 : 1 - (DEPTH[role] ?? 0.5) * (1 - ACCENT(e.step)));
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
  function parseChord(tok0, key) {
    // « I>4 » : basse imposée, n demi-tons au-dessus de la fondamentale (I>4 = Sol/Si en Sol, iv6>3 = Do m6/Mi♭)
    const [tok, bassIv] = tok0.split('>');
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
    if (bassIv != null && !/^\d+$/.test(bassIv)) throw new Error('basse inconnue : ' + tok0);
    return { rootPc, type: T[s], tok: tok0, ...(bassIv ? { bassPc: pcOf(rootPc + +bassIv) } : {}) };
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
   * Accords d'une grille de l'assistant (grille d’accords : { step, len, degree, type, acc, bass? }, degrés dans
   * la tonalité de la scène) → spans. Les trous sont comblés par l'accord précédent (le premier commence au début).
   */
  /**
   * Grille d'une scène, au format de la piste Accords et de l'assistant ({ step, len, degree, type, acc, bass? }, degrés
   * dans la tonalité de la scène) : celle de l'étape Accords si elle existe, sinon les accords du plan (spans) convertis.
   * Accords triés, sans trou ni chevauchement, qui couvrent toute la scène.
   */
  function sceneGrid(list, spans, key, bars) {
    const total = bars * SPB;
    const src = list && list.length
      ? list.map((c) => ({ ...c }))
      : (spans || []).map((x) => {
          const g = H().toGridChord(key, x.chord);
          const bass = x.chord.bassPc != null ? pcOf(x.chord.bassPc - x.chord.rootPc) : 0;
          return g && { step: x.step, len: x.len, ...g, ...(bass ? { bass } : {}) };
        }).filter(Boolean);
    return H().gridFill(src, total);
  }
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
    // styles de nov. 2026 : rock, disco, boom bap, drum & bass, dembow, soul
    rock: { bd: 'x-------x-x-----', bk: '----x-------x---', hh: 'x-x-x-x-x-x-x-x-', oh: '--------------o-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '----o-------o---', tom: '------------oooo' },
    disco: { bd: 'x---x---x---x---', bk: '----x-------x---', hh: 'x---x---x---x---', oh: '--x---x---x---x-', sh: '.o.o.o.o.o.o.o.o', tb: '----x-------x---', rim: '-------o-------o', tom: '------------o-o-' },
    boombap: { bd: 'x------x--x-----', bk: '----x-------x---', hh: 'x-o-x-o-x-o-x-o-', oh: '--------------o-', sh: '..o...o...o...o.', tb: '------------o---', rim: '----o-------o---', tom: '-------------o-o' },
    dnb: { bd: 'x---------x-----', bk: '----x-------x---', hh: 'x-o-x-o-x-o-x-o-', oh: '--o-----------o-', sh: '.o.o.o.o.o.o.o.o', tb: '----o-------o---', rim: '-------o------o-', tom: '-----------o-o-o' },
    dembow: { bd: 'x---x---x---x---', bk: '---x--x----x--x-', hh: 'x-x-x-x-x-x-x-x-', oh: '--------------o-', sh: 'xoxoxoxoxoxoxoxo', tb: '----o-------o---', rim: '---o--o----o--o-', tom: '-------------o-o' },
    soul: { bd: 'x-----x-x-------', bk: '----x-------x---', hh: 'x-o-x-o-x-o-x-o-', oh: '------------o---', sh: '.o.o.o.o.o.o.o.o', tb: 'x---x---x---x---', rim: '----o-------o---', tom: '------------o-o-' },
    // reggae roots, one drop : rien sur le 1, grosse caisse et cross-stick ensemble sur le 3 ; charleston appuyé sur les temps,
    // doubles fantômes ; tambourin sur 2 et 4 avec le skank ; by : motif propre à un son (tambour nyabinghi en battement de cœur)
    // (charleston : rien sur le 1 non plus, croches swinguées, une double fantôme ; charleston ouvert sur le dernier « et »)
    // shuffle de Noël (pop des années 60 revue en 90) : tout en croches, swinguées en triolet par le groove de la chanson
    // (preset.swingRes = 8) ; grosse caisse 1, « et » du 2, 3 ; caisse claire 2 et 4 ; grelots continus appuyés sur 2 et 4 ;
    // by : timbales sur le 1 toutes les deux mesures et en appel au 4 de la 4e ; cloches tubulaires au début de chaque
    // phrase de 4 mesures (motifs de plusieurs mesures)
    shuffle: { bd: 'x-------x-----o-', bk: '----x-------x---', hh: '.-.-.-.-.-.-.-.-', oh: '--------------o-', sh: 'o-o-x-o-o-o-x-o-', tb: '----o-------o---', rim: '----------------', tom: '--------o-o-o-oo', by: { perc: 'x---------------' + '-'.repeat(16) + 'x---------------' + '------------x-o-' } },
    // salsa en clave 2-3 (une mesure = un cycle de clave en croches ; kit « Percussions salsa ») ; byAny : chaque son a son
    // motif (le clap = la clave, la caisse claire = les timbales) ; fixed : la frappe choisit la manière de jouer
    // (congas : . talon-pointe, o slap, x ouverte ; bongos : . étouffé, o ouvert, x grave ; güiro : o coup, x long
    // grattage ; campana : o col, x bouche). Couplet : cáscara sur la coque, bongos en martillo, güiro, tumbao
    salsa23: {
      bd: '-----------o----', bk: '----------------', hh: '----------------', oh: '----------------', sh: '----------------', tb: '----------------',
      rim: 'o.x.xo.ox.ox.o.o', tom: '------------o-oo', byAny: true, fixed: ['cp', 'perc', 'misc', 'sh', 'oh', 'cb'],
      by: { cp: '--o-o---x--o--o-', sd: '---------------.', perc: '..o...xx..o...xx', misc: 'o..oo..xo..oo..x', sh: 'x.oox.oox.oox.oo' },
    },
    // montuno : le timbalero passe à la campana (bouche sur les temps), le bongocero à la cloche du bongo
    salsa23m: {
      bd: '-----------o----', bk: '----------------', hh: '----------------', oh: 'x-o-x-o-x-o-x-o-', sh: '----------------', tb: '----------------',
      rim: '----------------', tom: '------------o-oo', byAny: true, fixed: ['cp', 'perc', 'misc', 'sh', 'oh', 'cb'],
      by: { cp: '--o-o---x--o--o-', sd: '---------------.', perc: '..o...xx..o...xx', cb: 'x-o-x-o-x-o-x-o-', sh: 'x.oox.oox.oox.oo' },
    },
    // mambo : campana, coups de timbales avec les cuivres sur la clave, bombo sur les deux « et » du 2
    salsa23x: {
      bd: '---o-------o----', bk: '----------------', hh: '----------------', oh: 'x-o-x-o-x-o-x-o-', sh: '----------------', tb: '----------------',
      rim: '----------------', tom: '------------o-oo', byAny: true, fixed: ['cp', 'perc', 'misc', 'sh', 'oh', 'cb'],
      by: { cp: '--o-o---x--o--o-', sd: '--.-o---o--o--x-', perc: '..o...xx..o...xx', cb: 'x-o-x-o-x-o-x-o-', sh: '----------------' },
    },
    onedrop: { bd: '--------x-------', bk: '--------o-------', hh: '--o-x-o.x-o-x-o-', oh: '--------------o-', sh: '..o...o...o...o.', tb: '----o-------o---', rim: '--------x-------', tom: '----------o-oo-o', by: { perc: 'x--.---ox--.---o' } },
  };
  /*
   * Jeu du plan dans les autres mesures (une mesure de SPB pas, mêmes lettres) : valse (3/4), ballade bercée (6/8),
   * blues lent (12/8). Les grooves de G sont écrits en 4/4 : ailleurs, c'est ce jeu-là qui sert de plan.
   */
  const TG = {
    '3/4': { bd: 'x-----------', bk: '----o---o---', hh: 'x-o-x-o-x-o-', oh: '----------o-', sh: '.o.o.o.o.o.o', tb: '----o---o---', rim: '----o---o---', tom: '--------oooo' },
    '6/8': { bd: 'x-----------', bk: '------x-----', hh: 'x-o-o-x-o-o-', oh: '----------o-', sh: 'o-.-.-o-.-.-', tb: '------o-----', rim: '------o-----', tom: '------o-o-oo' },
    '12/8': {
      bd: 'x---------o-x-----------', bk: '------x-----------x-----', hh: 'x-o-o-x-o-o-x-o-o-x-o-o-', oh: '----------------------o-',
      sh: 'o-.-.-o-.-.-o-.-.-o-.-.-', tb: '------o-----------o-----', rim: '------o-----------o-----', tom: '------------------o-o-oo',
    },
  };
  /** Groove du plan dans la mesure de la chanson. */
  const grooveOf = (id) => (SPB === 16 ? G[id] || G.synthpop : TG[SIG]);
  /** Accent d'un charleston ou d'un shaker au pas i : temps > croches > doubles-croches. */
  const hatAccent = (i) => (i % BEAT === 0 ? 1 : i % 2 === 0 ? (BEAT === 4 ? 0.88 : 0.82) : 0.74);
  /** Fill de js/drum-patterns.js calé sur la fin de la mesure de la chanson (écrit pour 16 pas). */
  function fillOf(F) {
    if (!F || SPB === 16) return F;
    const own = SS.DRUM_FILLS && SS.DRUM_FILLS_METER && SS.DRUM_FILLS_METER[SIG] && SS.DRUM_FILLS_METER[SIG][Object.keys(SS.DRUM_FILLS).find((k) => SS.DRUM_FILLS[k] === F)];
    if (own) return { ...F, ...own }; // fill écrit pour la mesure (6/8, 12/8)
    const d = SPB - 16;
    return { ...F, from: Math.max(0, F.from + d), ev: F.ev.map(([st, ...x]) => [st + d, ...x]).filter(([st]) => st >= 0) };
  }
  const LEVEL = { x: 1, o: 0.72, '.': 0.45, r: 0.72 }; // r : roulement (trois coups dans le pas, motifs de js/drum-patterns.js)
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
    const g = grooveOf(grooveId);
    const k = kind(sound);
    // pièce « fixe » du groove (g.fixed) : sa frappe choisit la manière de jouer (kit salsa : talon, slap, ouverte…),
    // elle garde donc les vélocités du motif (ni accent de charleston, ni nuance de section, ni roulement de fin)
    const fixed = !!(g.fixed && g.fixed.includes(sound));
    // la grosse caisse reste régulière ; charleston et percussions varient davantage
    const spread = fixed ? 0.06 : k === 'bd' ? 0.05 : k === 'bk' ? 0.08 : 0.14;
    // charleston, shaker : temps > croches > doubles-croches
    const hatAcc = (i) => (!fixed && ['hh', 'sh'].includes(k) ? hatAccent(i) : 1);
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
        const step = t <= 0.5 ? BEAT : t <= 0.75 ? 2 : 1;
        for (let s = 0; s < SPB; s += step) {
          const v = 0.35 + 0.6 * ((b * SPB + s) / n);
          if (k === 'bk' && !(b === bars - 1 && s >= SPB - BEAT)) put(b * SPB + s, v);
          if (k === 'bd' && t <= 0.75 && s % BEAT === 0) put(b * SPB + s, 0.9);
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
        if (k === 'bk' && b % 2 === 1) put(b * SPB + (SPB === 16 ? 8 : backbeats()[0]), 0.6);
        if (k === 'hh' || k === 'sh') bar(b, g.hh.replace(/o/g, '.'), 0.8);
        continue;
      }
      const own0 = g.by && g.by[sound]; // motif propre à ce son dans le groove (16 pas, ou plusieurs mesures qui tournent)
      const own = own0 && own0.length > SPB ? own0.substr((b % Math.floor(own0.length / SPB)) * SPB, SPB) : own0;
      if (mode === 'hats') {
        bar(b, k === 'oh' ? null : k === 'sh' ? own || g.sh : g.hh, 0.75);
        continue;
      }
      // dernière mesure d'une section pleine : roulement (caisse claire ou toms) sur le dernier temps
      const fill = last && b === bars - 1 && ['main', 'full', 'drop'].includes(mode);
      const lb = SPB - BEAT; // début du dernier temps
      let pat = own && (['sh', 'tb'].includes(k) || g.byAny) ? own : k === 'bd' ? g.bd : k === 'bk' ? g.bk : k === 'hh' ? (mode === 'drop' ? '.o'.repeat(SPB / 2) : g.hh) : k === 'oh' ? g.oh : k === 'rim' ? g.rim : k === 'sh' ? g.sh : k === 'tb' ? g.tb : k === 'tom' ? (fill ? g.tom : null) : null;
      if (fill && k === 'bk' && !fixed) pat = pat.slice(0, lb) + '-'.repeat(BEAT);
      if (fill && k === 'hh') pat = pat.slice(0, lb) + '-'.repeat(BEAT);
      bar(b, pat, mode === 'light' ? 0.8 : 1);
      const groove = ['main', 'full', 'drop'].includes(mode);
      // roulement de fin de section en crescendo
      if (fill && k === 'bk' && !fixed) (BEAT === 4 ? [0.5, 0.64, 0.8, 0.98] : [0.5, 0.6, 0.7, 0.8, 0.9, 0.98]).forEach((v, i) => put(b * SPB + lb + i, v));
      // ghost notes de caisse claire (pas sur le clap) : une ou deux par mesure, très douces
      if (groove && sound === 'sd' && !fill)
        (SPB === 16 ? [7, 10, 15] : [BEAT + 3, SPB - 1]).forEach((o) => !out[b * SPB + o] && r() < 0.3 && (out[b * SPB + o] = clampV(0.24 + r() * 0.08)));
      // fin de phrase de 8 mesures : grosse caisse d'appel et charleston ouvert
      if (groove && b % 8 === 7 && !fill) {
        if (k === 'bd' && !out[b * SPB + SPB - 2]) put(b * SPB + SPB - 2, 0.62);
        if (k === 'oh') put(b * SPB + SPB - 2, 0.8);
      }
    }
    // nuance de la section (atténuée sur la grosse caisse et la caisse claire, qui tiennent le tempo)
    const e = ['bd', 'bk'].includes(k) ? Math.sqrt(energy) : energy;
    if (!fixed) for (let s = 0; s < n; s++) if (out[s] > 0.34) out[s] = clampV(out[s] * e); // les ghost notes restent telles quelles
    return out;
  }

  /**
   * Batterie d'une section d'après un motif de js/drum-patterns.js (lanes K S C H O, et R T P s'il les a ; 16 caractères)
   * et ses fills. lanes = null : on garde `base` (pas déjà écrits d'après le plan) et on n'y ajoute que fill et crash.
   * Retourne null pour les pièces que le motif ne pilote pas (rim, shaker, tambourin… quand il n'a pas de ligne R ou P).
   * `rat` (objet) reçoit les roulements « r » : { pas: 3 }.
   */
  const tomIndex = { ht: 0, mt: 1, lt: 2 };
  /** Ligne T des motifs : le tom joué dépend du pas (0–5 aigu, 6–10 médium, 11–15 grave). */
  const tomOfStep = (s0) => {
    const s = SPB === 16 ? s0 : (s0 * 16) / SPB; // autres mesures : mêmes tiers de mesure
    return s < 6 ? 0 : s < 11 ? 1 : 2;
  };
  /** Ligne du motif qui pilote ce son (null : aucune). */
  function patternLane(sound, lanes) {
    const k = kind(sound);
    if (k === 'bd') return 'K';
    if (k === 'bk') return sound === 'cp' && (!lanes || /[xo.r]/.test(lanes.C || '')) ? 'C' : 'S';
    if (k === 'hh') return 'H';
    if (k === 'oh') return 'O';
    if (k === 'rim') return lanes && lanes.R ? 'R' : null;
    if (k === 'tom') return lanes && lanes.T ? 'T' : null;
    if (k === 'sh' || k === 'tb') return lanes && lanes.P ? 'P' : null;
    return null;
  }
  function patternSteps(sound, bars, r, { lanes = null, base = null, fill = 'off', fillType = 'roll', crash = false, energy = 1, rat = null } = {}) {
    const k = kind(sound);
    if (!['bd', 'bk', 'hh', 'oh', 'tom', 'cr'].includes(k) && !(lanes && patternLane(sound, lanes))) return null;
    const n = bars * SPB;
    const out = base ? base.slice() : new Array(n).fill(0);
    const F = fillOf((SS.DRUM_FILLS && SS.DRUM_FILLS[fillType]) || (SS.DRUM_FILLS && SS.DRUM_FILLS.roll));
    const lane = patternLane(sound, lanes);
    const ti = tomIndex[sound] ?? 1;
    const spread = k === 'bd' ? 0.05 : k === 'bk' ? 0.08 : 0.14;
    const e = ['bd', 'bk'].includes(k) ? Math.sqrt(energy) : energy;
    // nuance de la section : même règle que drumSteps (les notes très douces restent telles quelles)
    const put = (s, v) => {
      if (s < 0 || s >= n) return;
      const x = vel(r, v * (k === 'hh' ? hatAccent(s % SPB) : 1), spread);
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
          const c = (lanes[lane] || '')[s];
          const v = LEVEL[c];
          if (v && !(lane === 'T' && tomOfStep(s) !== ti)) {
            put(b * SPB + s, v);
            if (c === 'r' && rat) rat[b * SPB + s] = 3;
          }
        }
      }
      if (f)
        F.ev.forEach(([s, ln, v, ti]) => {
          if ((ln === lane && ln !== 'T') || (ln === 'C' && sound === 'cp') || (ln === 'T' && k === 'tom' && ti === (tomIndex[sound] ?? 1))) put(b * SPB + s, v);
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
  /**
   * Pistes de batterie (motif ou grille de l'assistant) écrites pour la mesure de la chanson, sinon null : un motif de 4/4
   * dans une chanson en 6/8 (ou une grille d'avant le changement de mesure) laisse jouer le plan.
   */
  function fitLanes(l) {
    if (!l || typeof l !== 'object' || SPB === 16) return l;
    const strs = Object.entries(l).filter(([k, v]) => k !== 'bars' && typeof v === 'string' && v.length);
    const want = typeof l.bars === 'number' ? l.bars * SPB : SPB;
    return strs.every(([, v]) => v.length === want) ? l : null;
  }
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
    const F = fillOf((SS.DRUM_FILLS && SS.DRUM_FILLS[fillType]) || (SS.DRUM_FILLS && SS.DRUM_FILLS.roll));
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
  /** Pas entre deux coups d'un niveau (les noires suivent le temps de la mesure : noire pointée en 6/8 et 12/8). */
  const levelStep = (lv) => (lv.step === 4 ? BEAT : lv.step);
  /** Coups par mesure d'un niveau, dans la mesure de la chanson. */
  const levelPer = (lv) => (SPB / levelStep(lv)) * lv.rat;
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
      for (let s = 0; s < SPB; s += levelStep(lv)) {
        v[s] = Math.max(0.12, rollVel(bp, bars, b, s) * (lv.rat === 3 ? 0.8 : 1));
        if (lv.rat > 1) (rat[roller] = rat[roller] || {})[s] = lv.rat;
      }
      lane(roller, v);
    }
    if (roller === 'sd' && sounds.has('cp')) {
      const v = blank();
      backbeats().forEach((s) => (v[s] = 0.7));
      lane('cp', v);
    }
    if (sounds.has('hh')) {
      const v = blank();
      if (level >= 2) for (let s = level >= 3 ? 0 : 2; s < SPB; s += level >= 3 ? 2 : BEAT) v[s] = 0.45;
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
  function bassEvents(spans, mode, r, keyPcs, { pedalPc = null, approach = true, shift = 0, spb = SPB, beat = spb === SPB ? BEAT : 4 } = {}) {
    const ev = [];
    const add = (s, len, n, v) => len > 0 && ev.push({ step: s, len, notes: [n], vel: vel(r, v) });
    /** Note d'approche : la voisine de `target` dans la gamme, du côté `dir` (−1 dessous, +1 dessus). */
    const approachOf = (target, dir) => {
      let m = target + dir;
      for (let k = 0; k < 2 && !keyPcs.includes(pcOf(m)); k++) m += dir;
      return keyPcs.includes(pcOf(m)) ? m : target + dir;
    };
    if (RECIPES.includes(mode)) {
      recipeBass(spans, mode, keyPcs, pedalPc, shift, add);
      return ev;
    }
    if (mode === 'tumbao23') {
      // tumbao de salsa en croches (une mesure = un cycle de clave, deux accords par mesure de partition) : le « et » du 2
      // et le 4 de chaque mesure de partition jouent la fondamentale de l'accord qui arrive, liée par-dessus la barre ;
      // la fondamentale de l'accord au début de la scène
      const rootAt = (st) => {
        const sp = spans.find((x) => st >= x.step && st < x.step + x.len) || spans[spans.length - 1];
        return bassMidi(pedalPc ?? sp.chord.bassPc ?? sp.chord.rootPc) + shift;
      };
      const first = spans.length ? spans[0].step : 0;
      const last = spans.length ? spans[spans.length - 1].step + spans[spans.length - 1].len : 0;
      for (let st = first; st < last; st++) {
        const pos = (st - first) % 8;
        if (st === first) add(st, 3, rootAt(st), 0.88);
        // à la fin de la scène, l'accord qui arrive est celui de son début (scène répétée)
        const ahead = (k) => rootAt(st + k < last ? st + k : first + ((st + k - last) % (last - first)));
        if (pos === 3) add(st, Math.min(3, last - st), ahead(1), 0.8);
        if (pos === 6) add(st, Math.min(5, last - st), ahead(2), 0.9);
      }
      return ev;
    }
    let pushed = null; // fondamentale de l'accord jouée en avance à la fin du précédent (BASS_RHYTHMS terminé par « n »)
    spans.forEach((sp, i) => {
      const root = bassMidi(pedalPc ?? sp.chord.bassPc ?? sp.chord.rootPc) + shift; // pédale, ou basse imposée (D/F♯ : Fa♯)
      const fifth = root + 7;
      const next = spans[i + 1];
      const end = sp.step + sp.len;
      const each = (dt, fn) => {
        for (let s = sp.step; s < end; s += dt) fn(s, s - sp.step);
      };
      // modes ajoutés en nov. 2026 (BASS_RHYTHMS) : une mesure type, répétée ; notes relatives à l'accord
      if (BASS_RHYTHMS[mode]) {
        const third = root + ([3, 4].find((iv) => tones(sp.chord).includes(pcOf(sp.chord.rootPc + iv))) ?? 4);
        // septième : celle de l'accord s'il en a une, sinon celle de la gamme (Si♭ sur Do en Fa majeur, Si en Do majeur)
        const ct = tones(sp.chord);
        const seventh = root + ([10, 11].find((iv) => ct.includes(pcOf(sp.chord.rootPc + iv))) ?? ([10, 11].find((iv) => keyPcs.includes(pcOf(root + iv))) || 10));
        const nextRoot = next && next.step === end ? bassMidi(pedalPc ?? next.chord.bassPc ?? next.chord.rootPc) + shift : null;
        // motif d'une ou deux mesures : la mesure du motif suit la mesure du morceau (pas 0–15 puis 16–31)
        const motif = BASS_RHYTHMS[mode];
        const mBars = motifBars(mode);
        const mbl = motifBar(mode); // pas par mesure du motif (16 en 4/4, 12 en 3/4 et 6/8)
        const tail = motif[motif.length - 1];
        let pushedNow = false;
        for (let b = sp.step; b < end; b += spb) {
          const lastBar = b + spb >= end;
          const k = Math.floor(b / spb) % mBars;
          motif.forEach((nt) => {
            const [o0, l0, n, v, fx] = nt; // fx 'g' : note glissée depuis la précédente
            if (Math.floor(o0 / mbl) !== k) return;
            // position en fraction de pas (triolets : 1,33 ; 2,67…) = pas entier + décalage (ev.shift, ±0,5 pas)
            const at = o0 - k * mbl;
            const o = Math.round(at);
            const sh = Math.round((at - o) * 100) / 100;
            const l = Math.max(1, Math.round(l0));
            if (b + o >= end || o >= spb) return; // un motif de 4/4 dans une mesure de 3/4 : la fin est coupée
            let m;
            if (n === 't') m = third;
            else if (n === 's') m = seventh;
            else if (n === 'a') m = lastBar && nextRoot != null && nextRoot !== root ? approachOf(nextRoot, nextRoot > root ? -1 : 1) : fifth; // note voisine de l'accord suivant
            else if (n === 'n') m = lastBar && nextRoot != null ? nextRoot : root; // anticipation de l'accord suivant
            else if (n === 'c') {
              // approche chromatique : un demi-ton sous l'accord suivant (au-dessus s'il descend) ; sinon sous la fondamentale
              const target = lastBar && nextRoot != null ? nextRoot : root;
              m = target + (target < root ? 1 : -1);
            } else if (UP[n]) {
              // montée vers l'accord : la k-ième note de la gamme avant l'accord suivant, du côté d'où l'on vient ;
              // si l'accord ne change pas, fondamentale, tierce, quinte
              if (lastBar && nextRoot != null && nextRoot !== root) {
                m = nextRoot;
                for (let j = 0; j < UP[n]; j++) m = approachOf(m, nextRoot > root ? -1 : 1);
              } else m = [fifth, third, root][UP[n] - 1];
            } else m = root + n;
            if (pushed != null && b === sp.step && o === 0 && !sh && n === 0 && pushed === m && ev.length) {
              ev[ev.length - 1].len += Math.min(l, end - b); // l'accord est arrivé en avance : la note se prolonge, sans nouvelle attaque
              return;
            }
            const len = Math.min(l, end - b - o);
            if (len > 0) {
              const prev = ev[ev.length - 1];
              add(b + o, len, m, v);
              const e = ev[ev.length - 1];
              if (sh) e.shift = sh;
              // glissé : la note précédente tient jusqu'à celle-ci (legato), puis la voix glisse sans nouvelle attaque
              if (fx === 'g' && prev && prev.notes[0] !== m && prev.step + prev.len >= b + o - 1) {
                prev.len = Math.max(1, Math.ceil(b + o + sh - prev.step - (prev.shift || 0) - 0.01));
                prev.slideFrom = true;
                e.slide = true;
              }
            }
            // anticipation : la dernière note du motif est déjà la fondamentale du suivant (liée par-dessus la barre)
            if (nt === tail && n === 'n' && lastBar && at + l0 >= mbl && b + spb === end) pushedNow = true;
          });
        }
        pushed = pushedNow && nextRoot != null ? nextRoot : null;
        return;
      }
      if (mode === 'walking') {
        // walking : une noire par temps, notes de l'accord ; le dernier temps de l'accord approche le suivant d'un demi-ton
        const third = root + ([3, 4].find((iv) => tones(sp.chord).includes(pcOf(sp.chord.rootPc + iv))) ?? 4);
        const line = [root, third, fifth, third];
        const nextRoot = next && next.step === end ? bassMidi(pedalPc ?? next.chord.bassPc ?? next.chord.rootPc) + shift : null;
        let prev = root;
        each(beat, (s, o) => {
          const lastQ = s + beat >= end;
          let m = line[(o / beat) % 4];
          if (lastQ && o > 0 && nextRoot != null) m = approachOf(nextRoot, prev > nextRoot ? 1 : -1);
          add(s, Math.min(beat, end - s), m, o % spb === 0 ? 0.88 : 0.74);
          prev = m;
        });
        return;
      }
      switch (mode) {
        case 'whole':
          add(sp.step, sp.len, root, 0.85);
          break;
        case '8':
          each(2, (s, o) => add(s, 2, root, o % beat === 0 ? 0.9 : 0.7));
          break;
        case 'pulse8':
          each(2, (s, o) => add(s, 1, root, o % beat === 0 ? 0.85 : 0.68));
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
          each(beat, (s, o) => add(s, Math.min(beat - 1, end - s), root, o % spb === 0 ? 0.9 : 0.74));
          break;
        case 'drone':
          // intro planante : une note tenue par accord, sans attaque marquée
          add(sp.step, sp.len, root, 0.6);
          break;
        case 'sync': {
          // basse synthpop syncopée : 1, 1a, 2&, 3, 3a, 4& avec octave et quinte
          const pat = [[0, 3, root, 0.92], [3, 2, root + 12, 0.7], [6, 2, root, 0.8], [8, 3, fifth, 0.85], [11, 2, root + 12, 0.7], [14, 2, root, 0.78]];
          for (let b = sp.step; b < end; b += spb) pat.forEach(([o, l, n, v]) => b + o < end && add(b + o, Math.min(l, end - b - o), n, v));
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
          for (let b = sp.step; b < end; b += spb)
            [[0, 3, 0.9], [3, 3, 0.78], [6, 2, 0.82], [8, 3, 0.9], [11, 3, 0.78], [14, 2, 0.82]].forEach(([o, l, v]) => b + o < end && add(b + o, Math.min(l, end - b - o), root, v));
          break;
        case 'trance':
          // basse trance roulante : trois doubles après chaque temps, la première un peu plus douce
          each(4, (s) => [1, 2, 3].forEach((d) => add(s + d, 1, root, d === 1 ? 0.66 : 0.8)));
          break;
        case 'sixteen':
          each(1, (s, o) => add(s, 1, root, o % beat === 0 ? 0.92 : 0.7));
          break;
        case 'oct16':
          each(1, (s, o) => add(s, 1, o % 2 ? root + 12 : root, o % 2 ? 0.72 : 0.86));
          break;
        case 'pickup':
          // fondamentale tenue, reprise à l'octave au pas 14
          for (let b = sp.step; b < end; b += spb)
            [[0, 13, root, 0.88], [14, 2, root + 12, 0.8]].forEach(([o, l, n, v]) => b + o < end && add(b + o, Math.min(l, end - b - o), n, v));
          break;
        case 'funk':
          // syncopes en doubles ; notes fantômes aux pas 7 et 10
          for (let b = sp.step; b < end; b += spb)
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

  /**
   * Basse B03 de la formation (docs/reference/formation-composition/23_bibliotheque_de_procedes.md, § 4) : ligne
   * conjointe. Pour chaque accord, la note de l'accord la plus proche de la précédente, une attaque par mesure ; si la
   * suivante est à plus d'un ton, le dernier temps est une note de passage. Basse imposée (C/E) et pédale gardées.
   * (B01, B02 et B04 ont des équivalents : Croches, Marche / Fondamentale-quinte, Tenue + pédale tonique.)
   */
  const RECIPES = ['b03'];
  function recipeBass(spans, mode, keyPcs, pedalPc, shift, add) {
    const low = (pc) => bassMidi(pc) + shift;
    const nearest = (pc, near) => {
      let m = near - pcOf(near) + pcOf(pc);
      if (m - near > 6) m -= 12;
      if (near - m > 6) m += 12;
      return m;
    };
    // note de la gamme voisine de `to`, du côté de `from`
    const approachTo = (from, to) => {
      if (from === to) return null;
      const dir = to > from ? -1 : 1;
      let m = to + dir;
      for (let k = 0; k < 3 && !keyPcs.includes(pcOf(m)); k++) m += dir;
      return m;
    };
    // découpe [from, to) aux barres de mesure : une attaque par mesure
    const perBar = (from, to, fn) => {
      for (let s = from; s < to; ) {
        const e = Math.min(to, (Math.floor(s / SPB) + 1) * SPB);
        fn(s, e - s);
        s = e;
      }
    };
    if (mode === 'b03') {
      // une note par accord, choisie pour avancer par degrés conjoints, dans la tessiture de la basse
      const lo = low(0) - 5; // Sol1 … Ré3 (avec le registre de la partie)
      const hi = low(0) + 14;
      const line = [];
      let prev = null;
      spans.forEach((sp, i) => {
        const c = sp.chord;
        const t = tones(c);
        const pcs = pedalPc != null ? [pedalPc] : c.bassPc != null && c.bassPc !== c.rootPc ? [c.bassPc] : [c.rootPc, t[1], t[2]].filter((x) => x != null);
        if (prev == null) return void line.push((prev = low(pcs[0])));
        const lastOne = i === spans.length - 1;
        let best = null;
        pcs.forEach((pc, k) => {
          const m = nearest(pc, prev);
          const d = Math.abs(m - prev);
          // conjoint (1 ou 2 demi-tons) d'abord, puis note répétée, puis le plus petit saut ; la fondamentale départage
          let cost = d >= 1 && d <= 2 ? 0 : d === 0 ? 2.5 : d;
          if (k === 0) cost -= lastOne ? 1.5 : 0.4;
          if (m < lo || m > hi) cost += 6;
          if (!best || cost < best.cost) best = { m, cost };
        });
        line.push((prev = best.m));
      });
      spans.forEach((sp, i) => {
        const m = line[i];
        const end = sp.step + sp.len;
        const nxt = spans[i + 1] && spans[i + 1].step === end ? line[i + 1] : null;
        const pass = nxt != null && Math.abs(nxt - m) > 2 && sp.len >= 8 ? approachTo(m, nxt) : null;
        const stop = pass != null ? end - 4 : end;
        perBar(sp.step, stop, (s, l) => add(s, l, m, s === sp.step ? 0.9 : 0.8));
        if (pass != null) add(stop, 4, pass, 0.74);
      });
    }
  }

  /* ---------- accords (nappe, cordes, piano, guitare) ---------- */
  const RHYTHM = {
    pulse8: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    block4: [[0, 3], [4, 3], [8, 3], [12, 3]],
    stabs: [[0, 2], [3, 2], [6, 2], [10, 2], [12, 2]],
    house: [[0, 2], [3, 2], [6, 1], [8, 2], [11, 2], [14, 2]],
    strum: [[0, 3], [4, 2], [6, 2], [10, 2], [12, 2], [14, 2]],
    chop: [[2, 1], [6, 1], [10, 1], [14, 1]],
    // piano de la pop de Noël : l'accord répété en croches (swinguées par le groove), court et rebondissant, poussé sur 2 et 4
    xmas: [[0, 2, 0.74], [2, 1, 0.56], [4, 1, 0.88], [6, 1, 0.6], [8, 2, 0.74], [10, 1, 0.56], [12, 1, 0.9], [14, 1, 0.64]],
    // orgue « bubble » du reggae : deux petits accords par temps, le « et » appuyé, le « a » qui rebondit plus doux
    bubble: [[2, 1, 0.7], [3, 1, 0.44], [6, 1, 0.7], [7, 1, 0.44], [10, 1, 0.7], [11, 1, 0.44], [14, 1, 0.7], [15, 1, 0.44]],
    // piano du reggae : un accord court sur 2 et 4, avec la guitare
    skank: [[4, 1, 0.72], [12, 1, 0.72]],
  };
  /*
   * Motifs de nappe par degrés (étape Nappe de Nouvelle chanson, catalogue js/padmotifs.js) : une mesure de
   * [pas, durée, degrés, vélocité?] rejouée à chaque mesure de l'accord. Degrés : b (fondamentale une octave plus bas),
   * 1, 2 (seconde), 3 (tierce de l'accord), 4 (quarte), 5 (quinte de l'accord), 6 (sixte majeure), 7 (septième : celle de
   * l'accord, sinon celle de la gamme), M7, m7, 8 (octave), 9 (neuvième de la gamme), 10 (tierce à l'octave), 12, 15.
   * fx : mouvement de son écrit en automation de la scène (padFxLanes) : duck = pompe à chaque temps, open = filtre qui
   * s'ouvre sur la mesure, rev = souffle inversé (monte sur la mesure et se coupe).
   */
  const PD = '1 3 5';
  const pEvery = (st, len, n = PD) => Array.from({ length: 16 / st }, (_, i) => [i * st, len, n]);
  const PAD_NEW = {
    add9: { ev: [[0, 16, '1 3 5 9']] },
    fifths: { ev: [[0, 16, 'b 1 5 8']] },
    octs: { ev: [[0, 16, 'b 1 8 15', 0.55]] },
    mist: { ev: [[0, 16, '5 8 9 10', 0.4]] },
    breath: { ev: [[0, 12, PD]] },
    pump: { ev: [[0, 16, '1 3 5 8']], fx: 'duck' },
    filt: { ev: [[0, 16, 'b 1 3 5 8']], fx: 'open' },
    rev: { ev: [[0, 16, '1 3 5 8']], fx: 'rev' },
    sus: { ev: [[0, 8, '1 4 5'], [8, 8, PD]] },
    inner: { ev: [[0, 16, 'b 1 5 8'], [0, 4, '3'], [4, 4, '4'], [8, 4, '3'], [12, 4, '2']] },
    cliche: { ev: [[0, 16, 'b 3 5'], [0, 4, '8'], [4, 4, 'M7'], [8, 4, 'm7'], [12, 4, '6']] },
    climb: { ev: [[0, 16, 'b 1'], [0, 4, '3'], [4, 4, '5'], [8, 4, '8'], [12, 4, '9']] },
    choral: { ev: [[0, 4, 'b 1 3 5'], [4, 4, 'b 1 3 6'], [8, 4, 'b 1 4 6'], [12, 4, 'b 1 3 5']] },
    rock2: { ev: [[0, 4, PD], [4, 4, '1 2 5'], [8, 4, PD], [12, 4, '1 2 5']] },
    stagger: { ev: [[0, 16, 'b'], [2, 14, '1'], [4, 12, '5'], [6, 10, '3'], [8, 8, '8']] },
    gallop: { ev: [0, 4, 8, 12].flatMap((b) => [[b, 2, PD], [b + 2, 1, PD, 0.55], [b + 3, 1, PD, 0.6]]) },
    brass: { ev: [[0, 2, PD], [3, 2, PD], [6, 10, PD, 0.6]] },
    relaunch: { ev: [[0, 10, PD], [10, 6, PD, 0.55]] },
    p332: { ev: [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]].map(([s, l]) => [s, l, PD]) },
    rock8: { ev: pEvery(2, 2, 'b 1 5').map((e, i) => [...e, i % 4 ? 0.52 : 0.8]) },
    spicc: { ev: pEvery(2, 1).map((e, i) => [e[0], 1, i % 2 ? '3 8' : 'b 1 5', i % 4 ? 0.52 : 0.76]) },
    trem: { ev: pEvery(1, 1).map((e) => [...e, 0.42]) },
    gate: { ev: [0, 2, 3, 5, 6, 8, 10, 11, 13, 14].map((s) => [s, 1, '1 3 5 8']) },
    deep: { ev: [[0, 3], [6, 1], [10, 2], [13, 3]].map(([s, l]) => [s, l, '1 3 5 7']) },
    dub: { ev: [[3, 0.76], [6, 0.42], [9, 0.24], [11, 0.76], [14, 0.42]].map(([s, v]) => [s, 1, '1 3 5 7', v]) },
    clav: { ev: [0, 3, 5, 7, 10, 11, 14].map((s) => [s, 1, PD]) },
    disco: { ev: [2, 6, 10, 14].map((s) => [s, 2, '1 3 5 8']) },
    rhodes: { ev: [[0, 2], [3, 1], [6, 3], [11, 1], [12, 2]].map(([s, l]) => [s, l, '1 3 7 9']) },
    charl: { ev: [[0, 3, '3 7 9'], [6, 2, '3 7 9']] },
    comp: { ev: [[2, 1], [7, 2], [12, 1], [14, 2]].map(([s, l]) => [s, l, '3 7 9']) },
    gospel: { ev: [[0, 6, PD], [6, 2, PD, 0.55], [8, 6, PD], [14, 2, PD, 0.55]] },
    bossa: { ev: [[0, 3], [3, 3], [6, 2], [10, 3], [13, 3]].map(([s, l]) => [s, l, '1 3 7 9']) },
    montuno: { ev: [0, 2, 3, 5, 6, 8, 10, 11, 13, 14].map((s, i) => [s, 1, i % 2 ? '3 5' : '1 8', i % 2 ? 0.56 : 0.72]) },
    // montunos de salsa (une mesure = un cycle de clave en croches, deux accords par mesure de partition) : octave de la
    // tierce anticipée sur le « et » et liée à l'accord qui arrive (>), notes du milieu (quinte et octave), octave de la
    // fondamentale ; en 2-3 la mesure « 2 » est pleine, la « 3 » respire sur son 2e temps ; chaque coup de clave tombe
    // sur une attaque ou une note liée
    montuno23: { ev: montunoEv([[0, 'O'], [1, 'C'], [2, 'P'], [3, 'A'], [5, 'C'], [6, 'P'], [7, 'A'], [9, 'C'], [11, 'A'], [13, 'C'], [14, 'P'], [15, 'A']]) },
    montuno32: { ev: montunoEv([[0, 'O'], [1, 'C'], [3, 'A'], [5, 'C'], [6, 'P'], [7, 'A'], [9, 'C'], [10, 'P'], [11, 'A'], [13, 'C'], [14, 'P'], [15, 'A']]) },
    // guajeo en octaves : la ligne seule (tierce, quinte, fondamentale), sans les notes du milieu
    guajeo23: { ev: montunoEv([[0, 'O'], [1, 'Q'], [2, 'P'], [3, 'A'], [5, 'Q'], [6, 'P'], [7, 'A'], [9, 'Q'], [11, 'A'], [13, 'Q'], [14, 'P'], [15, 'A']]) },
    // montuno du mambo : croches continues, appuyées sur les coups de la clave 2-3
    mambo23: { ev: montunoEv([[0, 'O'], [1, 'C'], [2, 'P'], [3, 'A'], [5, 'C'], [6, 'P'], [7, 'A'], [9, 'C'], [10, 'P'], [11, 'A'], [13, 'C'], [14, 'P'], [15, 'A']], [2, 4, 8, 11, 14]) },
    // section de cuivres (rôle brass) : deux trompettes et un trombone en accords serrés, écrits en clave 2-3 comme les
    // montunos ; voix : trompette 1 en haut, trompette 2 une tierce (ou une quarte) dessous, trombone une octave sous la 1
    'brass-tenues': { ev: [[0, 16, '3 8 10', 0.5]] },
    'brass-clave': { ev: [2, 4, 8, 11, 14].map((s) => [s, 1, '3 8 10', 0.8]) },
    'brass-mona': { ev: brassRiff([[2, 2, 1], [4, 1, 3], [8, 2, 2], [11, 1, 2, '>'], [14, 2, 1], [15, 3, 2, '>']], true) },
    // mambo : riff serré des trompettes et contre-chant tenu du trombone sur la fondamentale
    'brass-mambo': { ev: [...brassRiff([[0, 3, 1], [1, 2, 1], [2, 1, 1], [3, 0, 2, '>'], [6, 1, 2], [8, 3, 1], [9, 2, 1], [10, 3, 1], [12, 2, 1], [14, 1, 2]]), [0, 6, '1', 0.62], [8, 6, '1', 0.62]] },
    // cierre : trois coups ensemble dans la dernière mesure de la scène, le dernier tenu
    'brass-cierre': { ev: [[0, 1, '$1 8 10 12', 0.9], [3, 1, '$1 8 10 12', 0.9], [6, 10, '$1 8 10 12', 0.95]] },
    skank2: { ev: [[4, 1, PD, 0.72], [6, 1, PD, 0.42], [12, 1, PD, 0.72], [14, 1, PD, 0.42]] },
    lofi: { ev: [[0, 6, '1 3 5 7'], [7, 1, '1 3 5 7', 0.5], [10, 6, '1 3 5 7']] },
    chops: { ev: [[0, 2], [3, 1], [8, 2], [10, 1], [11, 1]].map(([s, l]) => [s, l, PD]) },
    dark: { ev: [[0, 16, 'b 1 3 8', 0.55]] },
    // autres mesures (meter : la seule où le motif est proposé) : valse « oum-pa-pa » et arpège de valse (3/4), accord
    // bercé et arpège (6/8), triolets plaqués du doo-wop, accord par temps et arpège (12/8)
    valse3: { meter: '3/4', ev: [[0, 4, 'b', 0.72], [4, 3, PD, 0.6], [8, 3, PD, 0.56]] },
    arpvalse: { meter: '3/4', ev: ['b', '5', '8', '5', '10', '5'].map((d, i) => [i * 2, 2, d, i ? 0.54 : 0.7]) },
    berce68: { meter: '6/8', ev: [[0, 6, PD, 0.66], [6, 6, PD, 0.56]] },
    arp68: { meter: '6/8', ev: ['b', '5', '8', '10', '8', '5'].map((d, i) => [i * 2, 2, d, i % 3 ? 0.52 : 0.68]) },
    triolets128: { meter: '12/8', ev: Array.from({ length: 12 }, (_, i) => [i * 2, 2, PD, i % 3 ? 0.48 : 0.66]) },
    berce128: { meter: '12/8', ev: [0, 6, 12, 18].map((o, i) => [o, 6, PD, i % 2 ? 0.56 : 0.66]) },
    arp128: { meter: '12/8', ev: Array.from({ length: 12 }, (_, i) => [i * 2, 2, ['b', '5', '8', '10', '8', '5'][i % 6], i % 3 ? 0.52 : 0.68]) },
  };
  /**
   * Événements d'un montuno (main droite en octaves, main gauche qui double la ligne une octave plus bas) : [pas, rôle] ;
   * O : octave de la tierce (début de scène), A : la même, anticipée et liée,
   * C : quinte et octave (milieu), P : octave de la fondamentale, Q : octave de la quinte ; acc : pas appuyés (clave).
   */
  function montunoEv(list, acc = []) {
    // main gauche : elle double la ligne d'octaves une octave plus bas (b3, b, b5), pas les notes du milieu
    const D = { O: ['^b3 3 10', 3, 0.74], A: ['>b3 3 10', 3, 0.8], C: ['5 8', 1, 0.5], P: ['b 1 8', 1, 0.66], Q: ['b5 5 12', 1, 0.6] };
    return list.map(([s, k]) => [s, D[k][1], D[k][0], Math.min(0.9, D[k][2] + (acc.includes(s) ? 0.1 : 0))]);
  }
  /**
   * Riff de cuivres : [pas, rang de la note du dessus dans l'accord (0 : fondamentale, 1 : tierce, 2 : quinte, 3 :
   * fondamentale à l'octave), durée, '>' pour une anticipation liée] ; trio : avec le trombone une octave sous la note
   * du dessus, sinon les deux trompettes seules.
   */
  function brassRiff(list, trio = false) {
    const TOP = [['8', '5', '1'], ['10', '8', '3'], ['12', '10', '5'], ['15', '12', '8']];
    return list.map(([s, k, l, f = '']) => [s, l, f + TOP[k].slice(0, trio ? 3 : 2).join(' '), l >= 2 ? 0.8 : 0.72]);
  }
  /** Motif de nappe tenu (une seule tenue d'une mesure de 4/4) : il s'étire à la mesure de la chanson. */
  const padHeld = (p) => p.ev.every(([o, l]) => o === 0 && l === 16);
  /** Hauteurs des degrés d'un accord, fondamentale `root` (MIDI) ; kp : notes de la gamme (classes), pour 7, 9 et 6. */
  function padDegrees(c, root, kp) {
    const iv = SS.chordNotes(60 + c.rootPc, c.type).map((n) => n - 60 - c.rootPc);
    const has = (x) => iv.some((i) => pcOf(i) === pcOf(x));
    const inKey = (x) => !kp || kp.includes(pcOf(c.rootPc + x));
    const third = has(3) ? 3 : has(4) ? 4 : has(2) ? 2 : has(5) ? 5 : 4;
    const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
    const minor = third === 3;
    const sev = has(10) ? 10 : has(11) ? 11 : has(9) && fifth === 6 ? 9 : inKey(10) && !inKey(11) ? 10 : inKey(11) && !inKey(10) ? 11 : minor || fifth === 6 ? 10 : 11;
    const ninth = inKey(2) || !inKey(1) ? 14 : 13;
    return { b: root - 12, b3: root - 12 + third, b5: root - 12 + fifth, 1: root, 2: root + ninth - 12, 3: root + third, 4: root + 5, 5: root + fifth, 6: root + 9, 7: root + sev, M7: root + 11, m7: root + 10, 8: root + 12, 9: root + ninth, 10: root + 12 + third, 12: root + 12 + fifth, 15: root + 24 };
  }
  /** Notes d'un motif de PAD_NEW sur un accord : fondamentale au plus près de la précédente (prevRoot), dans lo − 5 … lo + 12. */
  function padNewEvents(spans, p, r, { lo = 55, open = false, kp = null, top = null } = {}) {
    const ev = [];
    let prevRoot = lo + 5;
    const degs = spans.map((sp) => {
      let root = null;
      for (let n = lo - 5; n <= lo + 12; n++) if (pcOf(n) === pcOf(sp.chord.rootPc) && (root === null || Math.abs(n - prevRoot) < Math.abs(root - prevRoot))) root = n;
      prevRoot = root;
      return padDegrees(sp.chord, root, kp);
    });
    const start = spans.length ? spans[0].step : 0;
    const lastBar = spans.length ? Math.floor((spans[spans.length - 1].step + spans[spans.length - 1].len - 1) / SPB) * SPB : 0;
    spans.forEach((sp, si) => {
      const end = sp.step + sp.len;
      const held = SPB !== 16 && !p.meter && padHeld(p);
      for (let b = sp.step - (sp.step % SPB); b < end; b += SPB)
        p.ev.forEach(([o, l0, d0 = PD, v]) => {
          if (o >= SPB) return;
          // « ^ » : seulement au début de la scène (ailleurs, la note anticipée juste avant est liée) ;
          // « > » : anticipation, la note prend l'accord qui arrive au pas suivant et se lie à lui (montuno de salsa)
          // « $ » : seulement dans la dernière mesure de la scène (cierre des cuivres)
          const flag = /^[>^$]/.test(String(d0)) ? String(d0)[0] : '';
          const d = flag ? String(d0).slice(1) : d0;
          const l = held ? SPB : Math.min(l0, SPB - o);
          let s = b + o;
          if (flag === '^' && s !== start) return;
          if (flag === '$' && b !== lastBar) return;
          const nx = flag === '>' && spans[si + 1] && spans[si + 1].step === s + 1 ? si + 1 : -1;
          const deg = degs[nx >= 0 ? nx : si];
          let e = nx >= 0 ? Math.min(s + l0, spans[nx].step + spans[nx].len) : Math.min(s + l, end);
          if (s < sp.step) {
            if (l < 4) return; // coup court d'avant l'accord : rien ; note tenue : elle repart avec l'accord
            s = sp.step;
          }
          if (e <= s) return;
          let notes = [...new Set(String(d).split(' ').map((x) => deg[x]).filter((n) => n != null))].sort((x, y) => x - y);
          if (open && notes.length >= 3 && !/\bb\b/.test(d)) notes = [notes[0] - 12, ...notes.slice(1)];
          if (top && notes[notes.length - 1] > top) notes = notes.map((n) => n - 12); // trop aigu pour l'instrument : une octave plus bas
          ev.push({ step: s, len: e - s, notes, vel: vel(r, v ?? (l >= 8 ? 0.6 : o % 4 === 0 ? 0.74 : 0.64)) });
        });
    });
    return ev;
  }
  /**
   * Mouvement de son d'un motif de nappe : courbes { volume | filter: { pas: valeur } } pour track.auto de la scène
   * (null sans mouvement). La pompe retombe à chaque temps ; le souffle inversé monte sur la mesure et se coupe.
   */
  function padFxLanes(mode, bars) {
    const fx = PAD_NEW[mode] && PAD_NEW[mode].fx;
    if (!fx) return null;
    const lane = {};
    for (let b = 0; b < bars; b++) {
      const s0 = b * SPB;
      if (fx === 'duck')
        for (let q = 0; q < SPB / BEAT; q++) Object.assign(lane, { [s0 + q * BEAT]: 0.18, [s0 + q * BEAT + 1]: 0.55, [s0 + q * BEAT + 2]: 0.85, [s0 + q * BEAT + 3]: 1 });
      else if (fx === 'rev') for (let i = 0; i < SPB; i++) lane[s0 + i] = Math.round((0.04 + 0.96 * Math.pow(i / (SPB - 1), 2.2)) * 1000) / 1000;
      else if (fx === 'open') Object.assign(lane, { [s0]: -0.75, [s0 + SPB / 2]: -0.45, [s0 + SPB - 1]: 0 });
    }
    return fx === 'open' ? { filter: lane } : { volume: lane };
  }
  function chordEvents(spans, mode, r, { lo = 55, hi = 79, open = false, kp = null, top = null } = {}) {
    if (PAD_NEW[mode]) return padNewEvents(spans, PAD_NEW[mode], r, { lo, open, kp, top });
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
        for (let s = sp.step, i = 0; s < end; s += 2, i++) add(s, 2, [seq[i % seq.length]], (SPB === 16 ? i % 4 === 0 : (s - sp.step) % BEAT === 0) ? 0.66 : 0.52);
      } else if (mode === 'pluck') {
        const seq = [notes[0], notes[2] ?? notes[1], notes[1], notes[2] ?? notes[0] + 12, notes[0] + 12, notes[1]];
        for (let s = sp.step, i = 0; s < end; s += 2, i++) add(s, 2, [seq[i % seq.length]], i % 2 ? 0.55 : 0.68);
      } else if (RHYTHM[mode]) {
        for (let b = sp.step - (sp.step % SPB); b < end; b += SPB)
          RHYTHM[mode].forEach(([o, l, v]) => {
            const s = b + o;
            if (s >= sp.step && s < end) add(s, Math.min(l, end - s), notes, v ?? (o % 4 === 0 ? 0.74 : 0.64) * (mode === 'chop' ? 0.9 : 1));
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
      // mesures ternaires (croches) : Alberti de valse (3/4), vague de six croches (6/8), triolets du slow (12/8)
      else if (mode === 'alb3') (seq = [v[0] - 12, up[2], up[4], up[2], up[4], up[2]]), (dt = 2);
      else if (mode === 'wave6') (seq = [up[0], up[1], up[2], up[3], up[2], up[1]]), (dt = 2);
      else if (mode === 'tri8') (seq = [up[0], up[1], up[2]]), (dt = 2);
      else if (mode === 'toll') {
        // volée de cloche : la note du dessus de l'accord, longue, au premier temps de chaque phrase de deux mesures
        if (sp.step % (2 * SPB) === 0) add(sp.step, Math.min(2 * SPB, end - sp.step), v[v.length - 1], 0.82);
        return;
      }
      else return;
      for (let s = sp.step, i = 0; s < end; s += dt, i++) {
        if (mode === 'pluck16' && ![0, 3, 6, 8, 11, 14].includes(s % SPB)) continue;
        const k = TRI_ARP.includes(mode) ? ((s - sp.step) / dt) | 0 : i; // ternaires : le cycle suit la place dans l'accord, accent sur chaque temps
        add(s, Math.min(dt === 1 ? 1 : dt === 3 ? 3 : 2, end - s), seq[k % seq.length], TRI_ARP.includes(mode) ? ((s % SPB) % BEAT === 0 ? 0.76 : 0.58) : i % 4 === 0 ? 0.78 : 0.6);
      }
    });
    return ev;
  }

  /* ---------- Arp One (parts[section].arp.one) ----------
   * Les accords de la scène passent dans le vrai arpégiateur (SS.Arp.renderStep, js/arp.js).
   * Chaque accord est posé en position serrée dans le médium
   * (57-76), l'octave du dessus est faite par le réglage « octaves » d'Arp One. Les temps (secondes) sont convertis
   * en pas avec un tempo nominal fixe : seul le rapport compte. Même accords + mêmes réglages = mêmes notes.
   */
  /** Riff du Guitariste (mode « r:<riff> », js/guitar-riffs.js) : notes en degrés sur les accords de la scène. */
  function riffEvents(spans, mode, riff, bars, seedStr) {
    let h = 7;
    for (const c of String(seedStr)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    return SS.GuitarRiffs.events(spans, mode.slice(2), riff, bars * SPB, h);
  }
  function arpOneEvents(spans, one, bars) {
    const A = SS.Arp;
    const total = bars * SPB;
    const sd = 60 / 120 / 4; // tempo nominal : 120 BPM
    const chords = [];
    let prev = null;
    spans.forEach((sp) => {
      const v = voiceChord(sp.chord, prev, 57, 76);
      prev = v;
      chords.push({ step: sp.step, len: sp.len, notes: v, vel: 0.8, ...(sp.chord.bassPc != null && sp.chord.bassPc !== sp.chord.rootPc ? { bass: sp.chord.bassPc } : {}) });
    });
    const arp = A.normalize(BEAT === 6 && one && one.guitar ? { ...one, guitar: { ...one.guitar, tern: true } } : one); // 6/8, 12/8 : guitare en vraies croches
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
          if (n.str != null && Math.abs(step + n.at / sd - s) > 0.02) e.shift = Math.round((step + n.at / sd - s) * 100) / 100; // guitare : grattage étalé, placement fin
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
  /** Rôles qui chantent la mélodie de la chanson. */
  const SINGERS = ['lead', 'vox', 'sax'];
  // mélodie des sections : le moteur de mélodie unique (js/melody.js, SS.melody.section et ses réglages)
  const { CHARACTERS, FORMS, LETTERS, RHYTHMS, CENTER, defaultPlan, fitPlan } = SS.melody;
  const melodyPart = (...a) => SS.melody.section(...a);

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
  const MELODIC = ['pad', 'arp', 'keys', 'strings', 'guitar', 'brass', 'lead', 'vox', 'sax'];

  /* ---------- dynamique des chansons EDM et techno ----------
   * Un producteur retient le groove pour que le drop frappe : nappes et claviers plus bas et plus sombres, charleston
   * plus doux, basse un peu filtrée ; la montée avance en volume (nappes, arpège, mélodie) ; le dernier drop est le
   * sommet ; l'outro garde le kick et baisse le reste. Réglages posés comme automation de la scène (volume, filtre) :
   * ceux de l'utilisateur les remplacent. Sans drop dans le plan (deep house), rien ne change.
   *   dyn : 'intro' | 'groove' | 'build' | 'first' (drop suivi d'un autre) | 'drop' | 'outro'
   */
  const HOLD = { pad: [0.5, -0.2], strings: [0.55, -0.2], keys: [0.6, 0], guitar: [0.65, 0], brass: [0.7, 0], arp: [0.62, -0.25], lead: [0.7, -0.15], vox: [0.72, 0], sax: [0.72, 0] };
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
          rat[s] = s >= n - SPB + BEAT ? 3 : 2;
          d.steps[s] = clampV(d.steps[s] * (rat[s] === 3 ? 0.65 : 0.78));
        }
    }
    if (['main', 'full', 'drop'].includes(mode)) {
      for (let b = 0; b < bars; b++) {
        const o = b * SPB;
        if (k === 'hh') {
          if (b % 4 === 3 && d.steps[o + SPB - 2] > 0) rat[o + SPB - 2] = 3;
          (SPB === 16 ? [3, 7, 11, 15] : Array.from({ length: SPB / BEAT }, (_, q) => q * BEAT + BEAT - 1)).forEach((x) => {
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
          for (let x = 0; x < SPB; x++) if (d.steps[o + x] > 0 && x % BEAT !== 0 && r() < 0.25) cond[o + x] = pick(r, ['p75', '1:2', '2:2']);
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
    const ao = (a && a.fxo) || {};
    return {
      riser: { on: !!a && a.fx === 'riser', len: a ? Math.min(a.bars, ao.len || a.bars) : 8, filter: ao.filter || 'lp' },
      hp: { on: !!spec.tech && !!a && a.drums === 'build', freq: hpHz(HP_MEL) },
      rev: { on: false, len: SPB },
      gap: { len: a && a.gap ? BEAT : 0 },
      impact: { on: !!b && b.fx === 'down', type: 'both', level: 0.95 },
      down: { on: false, len: 2 },
      retrait: { on: false, len: 1 },
      frag: { on: false },
      pedal: { on: false, len: 2, note: 'dom' },
      widen: { on: false, len: 2 },
      susp: { on: false, len: BEAT },
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
  /**
   * Jeu de la piste Effets réglé scène par scène (étape Effets et transitions, carte « Musicien Effets ») :
   * parts[section].fx = { mode: swell | riser | down | none, level (0–1,5), every (mesures, ambiance), color: dark | bright (ambiance),
   * len (mesures, montée), filter: lp | hp | none (montée), dlen (mesures, descente) }. Le plan rendu a ces réglages dans ses
   * sections : sec.fx (le rôle, null pour « none ») et sec.fxo (les options). Sans réglage, le plan est rendu tel quel.
   */
  function withSceneFx(spec, parts) {
    if (!spec || !parts) return spec;
    let sections = null;
    Object.entries(parts).forEach(([id, p]) => {
      const f = p && p.fx;
      const sec = spec.sections[id];
      if (!f || !sec || !Object.keys(f).length) return;
      sections = sections || { ...spec.sections };
      const s = { ...sec, fxo: f };
      if (f.mode) s.fx = f.mode === 'none' ? null : f.mode;
      sections[id] = s;
    });
    return sections ? { ...spec, sections } : spec;
  }
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
    { id: 'salsa', name: 'Salsa : güiro, tumbao, martillo' },
  ];
  // une mesure de 16 pas : un chiffre = vélocité (en dixièmes), « . » = silence
  const PERC_PAT = {
    techno: { sh: '6354636463546364', cg: '..5..6..5.6..5.6', tom: '....5.......5...' },
    latin: { sh: '6.4.6.4.6.4.6.4.', cg: '..6.76..6.76.67.', tom: '.5..5.5.5..5..5.' },
    minimal: { sh: '..5...5...5...5.', cg: '......5.......5.', tom: '..............5.' },
    // salsa (une mesure = deux mesures de croches, kit « Percussions salsa » : la frappe choisit la manière de jouer) :
    // güiro long sur 1 et 3 puis deux coups ; congas en tumbao (talon-pointe, slap sur le 2, deux ouvertes sur le 4) ;
    // bongos en martillo (ouvert sur 1 et 4, étouffé entre, grave sur le dernier « et »)
    salsa: { sh: '9.449.449.449.44', cg: '4474449944744499', tom: '7447744974477449' },
  };
  /** Pas d'une boucle de percussion sur `bars` mesures (le tom roule sur la dernière mesure de chaque phrase de 4). */
  function percLoopSteps(loop, style, bars, r) {
    const pat = (PERC_PAT[style] || PERC_PAT.techno)[loop];
    const out = new Array(bars * SPB).fill(0);
    for (let b = 0; b < bars; b++) {
      for (let i = 0; i < SPB; i++) {
        const c = pat[SPB === 16 ? i : Math.floor((i * 16) / SPB)]; // autre mesure : la boucle s'étire sur la mesure
        if (c !== '.') out[b * SPB + i] = vel(r, +c / 10, 0.06);
      }
      if (loop === 'tom' && style !== 'minimal' && style !== 'salsa' && b % 4 === 3) Array.from({ length: BEAT }, (_, k) => SPB - BEAT + k).forEach((i, k) => (out[b * SPB + i] = vel(r, 0.5 + (k * 0.4) / BEAT, 0.04)));
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
    // niveau de la scène (réglage « Musicien Effets ») : vélocité et volume de ce que joue la scène, pas des effets de transition
    const fo = sec.fxo || {};
    const lv = fo.level == null ? 1 : Math.max(0, Math.min(1.5, +fo.level));
    const lvE = (evs) => (lv === 1 ? evs : evs.map((e) => ({ ...e, vel: clampV(e.vel * lv) })));
    const lvV = (vol) => (lv === 1 ? vol : Object.fromEntries(Object.entries(vol).map(([x, y]) => [x, Math.round(Math.min(1, y * lv) * 1000) / 1000])));
    if (sec.fx === 'swell') {
      const ev = [];
      const every = Math.max(1, Math.min(bars, fo.every || 4)) * SPB;
      for (let s = 0; s < n; s += every) ev.push({ step: s, len: Math.min(every, n - s), notes: [t + 12], vel: 0.55 });
      const bright = fo.color === 'bright';
      add(lvE(ev), 0, n - 1, { filter: bright ? ramp(n, -0.3, 0) : ramp(n, -0.75, -0.35), volume: lvV({ 0: 0.5 }), reverb: { 0: bright ? 0.45 : 0.6 } });
    }
    if (out.riser.on) {
      const L = Math.min(out.riser.len, bars) * SPB;
      const off = n - L;
      const mine = sec.fx === 'riser'; // la montée de la scène : son niveau s'applique
      const lanes = { volume: shift(off, mine ? lvV(ramp(L, 0.15, RISER_TOP)) : ramp(L, 0.15, RISER_TOP)), reverb: shift(off, ramp(L, 0.2, 0.6, 0.5)) };
      if (out.riser.filter === 'lp') lanes.filter = shift(off, ramp(L, -0.9, 0.1));
      else if (out.riser.filter === 'hp') lanes.filter = shift(off, ramp(L, 0.85, 0));
      const ev = [{ step: off, len: L, notes: [t + 12], vel: 0.8 }];
      add(mine ? lvE(ev) : ev, off, n - 1, lanes);
    }
    if (out.rev.on) {
      const L = Math.min(out.rev.len, n);
      const off = n - L;
      add([{ step: off, len: L, notes: [t + 12], vel: 0.75 }], off, n - 1, { volume: shift(off, { 0: 0.1, [L - 1]: 0.85 }), filter: shift(off, { 0: -0.8, [L - 1]: 0.1 }), reverb: shift(off, { 0: 0.4 }) }, true);
    }
    if (inn.impact.on && inn.impact.type !== 'crash') {
      // descente de la scène (plan : fx « down ») : longueur et niveau réglables
      const mine = sec.fx === 'down';
      const L = Math.min(n, (mine && fo.dlen ? fo.dlen : 2) * SPB);
      const ev = [{ step: 0, len: L, notes: [t], vel: inn.impact.level }];
      add(mine ? lvE(ev) : ev, 0, L - 1, { volume: mine ? lvV({ 0: 1, [L - 1]: 0 }) : { 0: 1, [L - 1]: 0 }, reverb: { 0: 0.6 } });
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
  const KINDS = ['drums', 'bass', 'chords', 'keys', 'arp', 'guitar', 'melody'];
  const DEFAULT_KIND = { drums: 'drums', perc: 'drums', bass: 'bass', pad: 'chords', strings: 'chords', keys: 'keys', guitar: 'guitar', brass: 'chords', arp: 'arp', arpchord: 'arp', lead: 'melody', vox: 'melody', sax: 'melody', orch: 'orch', horns: 'horns', ambient: 'ambient' };
  const DEFAULT_MODE = { bass: '8', chords: 'sustain', keys: 'block4', arp: 'up16', guitar: 'g:pop', melody: 'verse', drums: 'both' };
  const ARP_MODES = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'rise', 'ost16', 'dotted', 'toll', 'alb3', 'wave6', 'tri8'];
  const MODES = () => ({
    bass: [...['whole', '8', 'pulse8', 'oct', 'gallop', 'offbeat', 'roll', 'off16', 'half', 'quarter', 'drone', 'sync', 'walk'], ...BASS_NEW.map((b) => b[0])],
    chords: ['sustain', 'swell', 'float', 'ballad', 'pluck', ...Object.keys(RHYTHM), ...Object.keys(PAD_NEW), ...(SS.GuitarArp ? SS.GuitarArp.MOTIFS.map((m) => 'g:' + m.id) : [])],
    // Clavier : ses motifs (« k: », js/keyboardist.js), plus tous les modes du moteur de nappe (ceux des pianistes des inspirations)
    keys: [...(SS.keyboardist ? [...SS.keyboardist.OWN.map((m) => 'k:' + m.id), ...SS.keyboardist.FILE.map((m) => 'kf:' + m.id)] : []), 'sustain', 'swell', 'float', 'ballad', 'pluck', ...Object.keys(RHYTHM), ...Object.keys(PAD_NEW)],
    // Guitariste : motifs guitare, plus les accords plaqués (jeu « Accords », voir js/guitarist.js)
    guitar: [...(SS.GuitarArp ? SS.GuitarArp.MOTIFS.map((m) => 'g:' + m.id) : []), ...(SS.GuitarRiffs ? SS.GuitarRiffs.RIFFS.map((x) => 'r:' + x.id) : []), 'strum', 'pluck', 'chop', 'pulse8', 'sustain'],
    arp: ARP_MODES,
    melody: Object.keys(CENTER),
    drums: ['both', 'kick', 'snare'],
  });
  /*
   * Modes jouables dans la mesure de la chanson (en 4/4 : tous). Ailleurs : les motifs écrits pour cette mesure (METER,
   * PAD_NEW.meter, motifs de guitare à meter), plus ceux qui n'ont pas de mesure (une note par temps, par croche, tenue).
   */
  const BASS_ANY = ['whole', 'quarter', '8', 'pulse8', 'oct', 'drone', 'half', 'sixteen', 'oct16', 'walking', 'rootfifth', 'arp', 'b03'];
  const CHORD_ANY = ['sustain', 'swell', 'float', 'ballad', 'pluck'];
  const ARP_ANY = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'rise', 'ost16', 'dotted', 'toll'];
  /** Arpèges du moteur écrits en croches ternaires (dans toutes les mesures ternaires). */
  const TRI_ARP = ['alb3', 'wave6', 'tri8'];
  const gtrMeterOK = (m) => !!m && (m.meter || '4/4') !== '4/4' && (m.meter === SIG || (SIG === '12/8' && m.meter === '6/8'));
  function meterOK(kind, id, sig = SIG) {
    if (kind === 'guitar') kind = 'chords';
    if (kind === 'keys') {
      if (/^k:/.test(id || '')) return (sig === SIG ? SPB === 16 : true) && sig === '4/4'; // motifs du Clavier : une mesure de 16 doubles-croches
      if (/^kf:/.test(id || '')) return !!SS.keyboardist && SS.keyboardist.meterOf(id) === sig; // motifs du fichier : dans leur mesure
      kind = 'chords';
    }
    if (sig !== SIG) {
      const was = SIG;
      setMeter(sig);
      const ok = meterOK(kind, id);
      setMeter(was);
      return ok;
    }
    if (SPB === 16 && SIG === '4/4') {
      if (kind === 'bass') return !METER[id];
      if (kind === 'chords' && PAD_NEW[id]) return !PAD_NEW[id].meter;
      return true;
    }
    if (kind === 'bass') return METER[id] === SIG || BASS_ANY.includes(id);
    if (kind === 'arp') return TRI_ARP.includes(id) || (BEAT === 6 ? ['toll'] : ['up16', 'dotted', 'toll', 'rise']).includes(id); // cycles calés sur le temps : 4 doubles en 3/4, croches ternaires en 6/8 et 12/8
    if (kind === 'chords') {
      if (/^r:/.test(id)) return false; // riffs du Guitariste : une mesure de 16 doubles-croches, en 4/4 seulement
      if (/^g:/.test(id)) return !!SS.GuitarArp && gtrMeterOK(SS.GuitarArp.MOTIFS.find((m) => m.id === id.slice(2)));
      if (ARP_ANY.includes(id) || TRI_ARP.includes(id)) return meterOK('arp', id);
      if (PAD_NEW[id]) return PAD_NEW[id].meter ? PAD_NEW[id].meter === SIG : padHeld(PAD_NEW[id]);
      return CHORD_ANY.includes(id);
    }
    return true;
  }
  /** Rythme de remplacement d'un mode qui ne va pas dans la mesure (le plan est écrit en 4/4). */
  const METER_FALLBACK = {
    '3/4': { bass: 'valse', chords: 'valse3', held: 'sustain', arp: 'alb3', guitar: 'valse' },
    '6/8': { bass: 'ballade68', chords: 'berce68', held: 'sustain', arp: 'wave6', guitar: 'pimami' },
    '12/8': { bass: 'slow128', chords: 'triolets128', held: 'sustain', arp: 'tri8', guitar: 'pimami' },
  };
  /** Mode du plan ramené à la mesure de la chanson (inchangé en 4/4 ou s'il y va déjà). */
  function fitMode(kind, mode) {
    if (kind === 'guitar') kind = 'chords'; // le Guitariste joue avec le générateur des accords (motifs « g: » compris)
    if (kind === 'keys') {
      // Clavier : un motif « k: » hors du 4/4 devient le rythme de la mesure (accords) ou son arpège brisé
      if (/^kf:/.test(mode || '') && SS.keyboardist) {
        if (SS.keyboardist.meterOf(mode) === SIG) return mode;
        // motif du fichier d'une autre mesure : un motif du fichier de la même famille dans la mesure, sinon le rythme de la mesure
        const st = SS.keyboardist.fileOf(mode);
        const alt = st && SS.keyboardist.FILE.find((x) => x.meter === SIG && x.jeu === st.jeu && x.fam === st.fam && x.styles.some((y) => st.styles.includes(y)));
        if (alt) return 'kf:' + alt.id;
        if (SS.keyboardist.jeuOf(mode) === 'arp') return { '4/4': 'ballad', '3/4': 'arpvalse', '6/8': 'arp68', '12/8': 'arp128' }[SIG] || 'sustain';
        return SIG === '4/4' ? 'block4' : (METER_FALLBACK[SIG] || {}).chords || 'sustain';
      }
      if (!/^k:/.test(mode || '') || SIG === '4/4') kind = 'chords';
      else return SS.keyboardist && SS.keyboardist.jeuOf(mode) === 'arp' ? { '3/4': 'arpvalse', '6/8': 'arp68', '12/8': 'arp128' }[SIG] || 'sustain' : (METER_FALLBACK[SIG] || {}).chords || 'sustain';
    }
    if (!mode || SIG === '4/4' || !['bass', 'chords', 'arp'].includes(kind) || meterOK(kind, mode)) return mode;
    const f = METER_FALLBACK[SIG];
    if (kind === 'chords') {
      if (/^[gr]:/.test(mode)) return 'g:' + f.guitar;
      return RHYTHM[mode] || (PAD_NEW[mode] && !padHeld(PAD_NEW[mode])) ? f.chords : f.held;
    }
    return f[kind];
  }
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
   *   kinds : { [idInstrument]: 'drums' | 'bass' | 'chords' | 'arp' | 'guitar' | 'melody' } (voir l'en-tête), null = le type du rôle
   *   spec : plan (js/band-songs.js) ; tracks : pistes du projet créées par Band (avec t.band.key « rôle » ou « rôle:son »)
   *   melodySeed : 0 = la mélodie d'origine de l'inspiration ; un autre nombre tire une autre mélodie (lead, voix,
   *   sax) sans rien changer aux autres musiciens (assistant « Nouvelle chanson »)
   *   melody : réglages de la mélodie (null = caractère « Inspiration », plan par défaut) :
   *   { character (CHARACTERS), form (FORMS), rhythm ('auto' | RHYTHMS), complexity, range ('auto' = selon le rôle),
   *     ending ('closed' | 'open'), notes (notes par phrase, 0 = libre),
   *     plans: { section: [{ bars, mode: 'on'|'hold'|'off', letter }] }, seeds: { section: { A: n, B: n… } },
   *     scenes: { section: { character, notes } } (caractère et notes par phrase propres à une scène) }
   *   harmony : accords et tonalités choisis dans l'assistant (étape Accords), par section :
   *     { keys: { section: { tonic, mode } }, chords: { section: [grille d’accords] }, emotions: { section: id } }
   *   parts : réglages par scène (batterie, basse, nappe, arpège, rôles muets), voir l'en-tête du fichier ; null = le plan tel quel
   *   fx : transitions et percussions d'ambiance (étape « Effets et transitions »), voir junctionDefaults ; null = le plan tel quel
   * → { key, scenes: [{ id, name, bars, key, emotion, data, spans }], song: [{ scene, repeat }] }
   */
  /* ---------- musicien Ambient : présence par scène → courbe sur toute la chanson ---------- */
  const AMB_LEVELS = { far: 0.25, soft: 0.5, mid: 0.8, front: 1 };
  const AMB_MOVES = ['stable', 'up', 'down', 'breathe'];
  /** Réglage Ambient d'une scène, complété : { on, p, mv, r (null : celui du module) }. */
  function ambientOf(parts, sec, id) {
    const pp = parts && parts[sec];
    const ie = (pp && pp.inst && pp.inst[id]) || {};
    const a = ie.amb || {};
    return {
      on: !ie.off && !((pp && pp.off) || []).includes('ambient'),
      p: AMB_LEVELS[a.p] !== undefined ? a.p : 'mid',
      mv: AMB_MOVES.includes(a.mv) ? a.mv : 'stable',
      r: typeof a.r === 'number' ? Math.max(0, Math.min(1, a.r)) : null,
    };
  }
  /** Présence dans une scène, à la position u (0..1) de la scène. */
  function ambientLevel(s, u) {
    if (!s.on) return 0;
    const lv = AMB_LEVELS[s.p];
    if (s.mv === 'up') return lv * (0.15 + 0.85 * u);
    if (s.mv === 'down') return lv * (1 - 0.9 * u);
    if (s.mv === 'breathe') return lv * (0.55 + 0.45 * Math.sin(Math.PI * u));
    return lv;
  }
  /**
   * Courbes d'un musicien Ambient sur toute la chanson (n points, comme track.ambient.presence de js/ambient.js) : presence
   * d'après la présence et le mouvement de chaque scène (0 où il se tait), rands (hasard) seulement si une scène règle le sien.
   * `id` : son id d'instrument (parts[sec].inst[id]). Dans rands, null : le hasard du module (voir ambientApply).
   */
  function ambientCurves(spec, parts, id, { n = 48 } = {}) {
    const blocks = [];
    spec.form.split(/\s+/).filter(Boolean).forEach((t) => {
      const [sid, k] = t.split('*');
      const sec = spec.sections[sid];
      if (sec) for (let i = 0; i < (+k || 1); i++) blocks.push({ sec: sid, bars: sec.bars || 1, s: ambientOf(parts, sid, id) });
    });
    const total = blocks.reduce((a, b) => a + b.bars, 0) || 1;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const presence = [];
    const rands = [];
    for (let i = 0; i < n; i++) {
      let x = (i / Math.max(1, n - 1)) * total;
      let b = blocks[blocks.length - 1];
      for (const bl of blocks) {
        if (x <= bl.bars) {
          b = bl;
          break;
        }
        x -= bl.bars;
      }
      if (!b) return { presence: null, rands: null };
      presence.push(r3(ambientLevel(b.s, Math.min(1, x / b.bars))));
      rands.push(b.s.r === null ? null : r3(b.s.r));
    }
    return { presence, rands: blocks.some((b) => b.s.r !== null) ? rands : null };
  }

  /**
   * Pose les courbes de build (res.ambient[id]) sur une piste Ambient créée : la présence, sauf si la piste en a déjà une
   * (dessinée à la main dans l'assistant) ; le hasard par scène (les scènes sans réglage prennent celui du module).
   * Renvoie vrai si la présence posée est celle des scènes.
   */
  function ambientApply(t, c) {
    if (!t || !c) return false;
    const a = (t.ambient = t.ambient || {});
    const own = !Array.isArray(a.presence) && !!c.presence;
    if (own) a.presence = c.presence.slice();
    const base = typeof a.rand === 'number' ? a.rand : 0.5;
    if (c.rands) a.rands = c.rands.map((v) => (v === null ? base : v));
    else delete a.rands;
    return own;
  }

  function build(spec, presetId, tracks, { melodySeed = 0, melody = null, harmony = null, parts = null, kinds = null, fx = null, sig = null } = {}) {
    setMeter(sig || (spec && spec.meter) || '4/4'); // mesure de la chanson (4/4, 3/4, 6/8, 12/8) : tout le moteur la suit
    spec = withSceneFx(spec, parts); // jeu de la piste Effets réglé scène par scène
    const key = parseKey(spec.key);
    const ids = instIds(tracks);
    const melCache = {}; // mélodies déjà écrites, par section et instrument (copie « même mélodie » : voir sing)
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
      const gapSteps = oj ? outE.gap.len : sec.gap ? BEAT : 0;
      const hk = harmony && harmony.keys && harmony.keys[id];
      const k = hk ? { tonic: hk.tonic, mode: hk.mode } : sec.key ? parseKey(sec.key) : key;
      // grille : celle de l'étape Accords, sinon celle de la section (reprise tapée au clavier), sinon ses degrés
      const grid = (harmony && harmony.chords && harmony.chords[id]) || sec.grid;
      const spans0 = (grid && grid.length && spansFromGrid(grid, k, bars)) || spansOf(sec, k, bars);
      // pédales de l'étape Accords : la note tenue passe à la basse des accords qui commencent sous elle
      const peds = (harmony && harmony.pedals && harmony.pedals[id]) || [];
      const spans = peds.length ? spans0.map((sp) => {
        const ped = peds.find((x) => sp.step >= x.step && sp.step < x.step + x.len);
        return ped ? { ...sp, chord: { ...sp.chord, bassPc: pcOf(H().scale(k)[0].pc + ped.semi) } } : sp;
      }) : spans0;
      // as : section du modèle dont une section de reprise reprend le jeu (nuance, automation)
      const as = sec.as || id;
      // mel : section dont la scène reprend la mélodie (copie « même mélodie » : un refrain final transposé)
      const mid = sec.mel || id;
      // empreinte des accords en degrés (le dernier temps ne compte pas : un passage préparé y pose la dominante)
      const tpc = H().scale(k)[0].pc;
      const gsig = JSON.stringify(spans.filter((x) => x.step < bars * SPB - BEAT).map((x) => [x.step, Math.min(x.len, bars * SPB - BEAT - x.step), pcOf(x.chord.rootPc - tpc), x.chord.type]));
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
      // mélodie imposée (parts[section].lead) : portée par la première piste chantante, dans l'ordre lead, vox, sax ;
      // sinon le thème écrit dans le plan (sec.theme : modèle de musique de film, js/film.js)
      const ownLead = pp && pp.lead && Array.isArray(pp.lead.events) ? pp.lead.events : Array.isArray(sec.theme) && sec.theme.length ? sec.theme : null;
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
          // percussions frappées sur les repères (musique de film, js/film.js) : sec.hits = { son: [[pas, vélocité]] }
          if (role === 'perc' && sec.hits && !(dp && (dp.edits || dp.pattern))) {
            const steps = new Array(bars * SPB).fill(0);
            (sec.hits[snd] || []).forEach(([st, v]) => st >= 0 && st < steps.length && (steps[st] = v));
            return void (data[t.id] = { steps });
          }
          const pat = dp && dp.pattern && SS.drumPattern ? SS.drumPattern(dp.style, dp.pattern) : null;
          const lanes = fitLanes(dp && (dp.edits || (pat && pat.lanes)));
          const fo = { fill: dp && dp.fill, fillType: (dp && dp.fillType) || 'roll', crash: !!(dp && dp.crash), energy };
          if (dp && dp.build) ownBuild.add(t.id); // progression réglée dans l'assistant : la dynamique n'y touche pas
          // montée avec progression réglée dans l'assistant : le roulement (caisse claire ou clap, charleston, crash) suit la courbe
          if (sec.drums === 'build' && dp && dp.build && role !== 'perc') {
            const rs = rollSteps(snd, bars, r, dp.build, rollerOf(kitSounds), role, kitSounds);
            if (rs) return void (data[t.id] = rs);
          }
          // grille de l'assistant : ce son a sa piste (toute longueur, ratchets, conditions)
          if (hasGridLane(lanes, snd)) return void (data[t.id] = gridSteps(snd, bars, r, lanes, fo));
          if (lanes) {
            // motif de la bibliothèque : il pilote kick, caisse, clap, charleston, crash et toms
            const rat = {};
            const st = patternSteps(snd, bars, r, { lanes, ...fo, rat });
            if (st) return void (data[t.id] = Object.keys(rat).length ? { steps: st, rat } : { steps: st });
          }
          // fill explicite (même « off ») : il remplace le roulement automatique de fin de section
          let steps = drumSteps(snd, mode, sec.groove || spec.groove, bars, r, { perc: role === 'perc', last: sec.fill !== false && !(dp && dp.fill), energy });
          if (dp && ((dp.fill && dp.fill !== 'off') || dp.crash) && mode && mode !== 'off' && mode !== 'build') steps = patternSteps(snd, bars, r, { base: steps, ...fo }) || steps;
          data[t.id] = { steps };
          if (dynK === 'groove') holdDrums(steps, snd);
          if (spec.tech && !(mode === 'build' && dp && dp.build)) drumSpice(data[t.id], snd, mode, bars, r); // la progression de montée remplace le roulement d'origine
          return;
        }
        if (role === 'orch') return; // orchestre : écrit après les autres (il part de la mélodie de la scène), voir plus bas
        if (role === 'horns') return; // section de cuivres : écrite après les autres (js/horns.js), voir plus bas
        if (role === 'ambient') return void (data[t.id] = { events: [] }); // musicien Ambient : le moteur génératif joue seul (courbe de présence, plus bas)
        const kd = kindOfT.get(t); // type de l'instrument (null : fx)
        const extra = isExtra(t); // musicien ajouté : jamais muet d'office, réglages de l'instrument seulement
        const changed = !!kd && (extra || kd !== kindOfRole(role)); // type différent de celui du rôle : pas de réglages du rôle
        const gk = kd === 'guitar'; // Guitariste : générateur des accords, motifs de guitare (« g: ») d'abord
        const kk = kd === 'keys'; // Clavier : ses motifs (« k: ») ou le moteur de nappe, puis ses réglages (js/keyboardist.js)
        const o = changed ? ie : ie ? { ...((pp && pp[role]) || {}), ...ie } : (pp && pp[role]) || null; // réglages de l'instrument, du rôle (basse, nappe, arpège)
        const off = muted.includes(role) || !!(ie && ie.off);
        const er = !changed ? role : kd === 'bass' || kd === 'drums' ? 'bass' : kd === 'arp' ? 'arp' : kd === 'melody' ? 'lead' : gk ? 'guitar' : kk ? 'keys' : 'pad'; // rôle dont l'instrument prend la nuance et les effets
        // musicien ajouté (Basse, Nappe, Guitariste, Arpège) : le premier ★ de la scène, dans le style de la chanson (js/scenestars.js)
        const extraStar = (k, secId, sc0) =>
          SS.sceneStars.sceneDefault(k, secId, SS.sceneStars.styleOfPreset(presetId), { ok: (m) => MODES()[k].includes(m) && meterOK(k, m), spb: SPB, jeu: k === 'guitar' && SS.guitarist && sc0.guitar ? SS.guitarist.jeuOf(sc0.guitar) || 'acc' : 'acc' });
        let mode;
        if (off) mode = null;
        else if (!changed) mode = (o && o.mode) || sec[role];
        else if (!extra && !((o && (o.mode || o.one)) || sec[role])) mode = null; // muet dans le plan, rien ne l'allume
        else {
          const valid = MODES()[kd];
          const plan = { bass: [sec.bass], chords: [sec.pad, sec.strings, sec.keys, sec.brass], keys: [sec.keys], guitar: [sec.guitar], arp: [sec.arp, sec.arpchord], melody: [sec.lead, sec.vox, sec.sax], drums: [] }[kd];
          const star = o && valid.includes(o.mode) ? null : kk && SS.keyboardist ? SS.keyboardist.sceneDefault(id, sec.keys, presetId, (m) => meterOK('keys', m)) : extra && SS.sceneStars && ['bass', 'chords', 'guitar', 'arp'].includes(kd) ? extraStar(kd, id, sec) : null; // Clavier ou musicien ajouté : le motif ★ de la scène
          mode = o && valid.includes(o.mode) ? o.mode : star || plan.find((m) => m && valid.includes(m)) || DEFAULT_MODE[kd];
        }
        mode = fitMode(changed ? kd : kindOfRole(role), mode); // autre mesure que 4/4 : un rythme écrit pour elle
        const one = ((kd === 'arp' && (role === 'arp' || changed)) || kd === 'keys') && !off && o && o.one && SS.Arp ? o.one : null; // Arp One : l'emporte sur le mode (Arpège, arpégiateur du Clavier)
        const ownL = ie && ie.lead && Array.isArray(ie.lead.events) ? ie.lead.events : t === leadTrack ? ownLead : null; // mélodie imposée de cet instrument
        // mélodie du moteur : réglages de l'instrument par-dessus ceux de la scène ; la graine contient le rôle et le doublon
        const sing = (mrole, m) => {
          const im2 = ie ? Object.fromEntries(['character', 'notes', 'rhythm', 'complexity', 'range', 'ending', 'form'].filter((f) => ie[f] !== undefined).map((f) => [f, ie[f]])) : null;
          const dup = (ids[ti].dup ? `#${ids[ti].dup}` : '') + (extra ? `@${t.band.musician}` : '');
          if (m === 'rise') return riseEvents(spans, r, k, bars);
          // copie « même mélodie » (refrain final transposé) : la mélodie de la scène d'origine, transposée, si les accords
          // ont les mêmes degrés dans le même mode (sinon le moteur la récrit avec la même graine)
          const ck = `${role}${dup}|${m}`;
          const hit = mid !== id && melCache[`${mid}|${ck}`];
          if (hit && hit.mode === k.mode && hit.sig === gsig && hit.bars === bars) {
            const sh = ((tpc - hit.pc + 18) % 12) - 6;
            return hit.events.map((e) => ({ ...e, notes: e.notes.map((n) => n + sh) }));
          }
          const ev = melodyPart(spans, k, bars, mrole, im2 && Object.keys(im2).length ? { ...smel, ...im2 } : smel, (ie && ie.plan) || (mel.plans && (mel.plans[id] || mel.plans[mid])), (ie && ie.seeds) || (mel.seeds && (mel.seeds[id] || mel.seeds[mid])), `${presetId}/${mid}/${role}${dup}/${melodySeed}`, m);
          if (Array.isArray(ev)) melCache[`${id}|${ck}`] = { events: ev, pc: tpc, mode: k.mode, sig: gsig, bars };
          return ev;
        };
        // Clavier : motif « k: » (js/keyboardist.js), sinon le moteur de nappe (arpège ou accords, registre du piano)
        const kpat = kk && SIG === '4/4' && o && o.keys && SS.keyboardist && SS.keyboardist.parsePat(o.keys.pat) ? o.keys.pat : null; // motif réécrit dans la fenêtre Avancé
        const keysEv = (m, range = { lo: 57, hi: 79 }) =>
          (/^kf?:/.test(m) || kpat) && SS.keyboardist
            ? SS.keyboardist.events(spans, m, { voice: voiceChord, tones, vel: (v) => vel(r, v) }, kpat)
            : ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'ost16', 'dotted', 'toll', ...TRI_ARP].includes(m)
              ? arpEvents(spans, m, r)
              : chordEvents(spans, m, r, { ...range, kp: H().scale(k).map((d) => d.pc) });
        let events = [];
        let gtrEv = false; // notes du moteur de guitare (voir shapeVel)
        // mélodie imposée : même dans une scène où l'inspiration ne chante pas (sauf rôle coupé par « off »)
        if (ownL && kd === 'melody' && !off)
          events = ownL.filter((e) => e && e.step >= 0 && e.step < bars * SPB && e.notes && e.notes.length).map((e) => ({ step: e.step, len: Math.max(1, Math.min(e.len, bars * SPB - e.step)), notes: [...e.notes], vel: e.vel ?? 0.8 }));
        else if (one) (events = arpOneEvents(spans, one, bars)), (gtrEv = !!(one.guitar && one.guitar.on));
        else if (mode && changed) {
          if (kd === 'bass') {
            const kp = H().scale(k).map((d) => d.pc);
            const ped = o && { tonic: kp[0], fifth: pcOf(kp[0] + 7) }[o.pedal];
            events = bassEvents(spans, mode, r, kp, { pedalPc: (o && ped) ?? null, approach: !o || o.approach !== false, shift: (o ? { mid: 12, high: 24 }[o.register] || 0 : 0) + (spec.bassShift || 0) });
          } else if (kd === 'arp') events = arpEvents(spans, mode, r);
          else if (gk && /^r:/.test(mode) && SS.GuitarRiffs) (events = riffEvents(spans, mode, o && o.riff, bars, `${presetId}/${id}/${ids[ti].id}`)), (gtrEv = true);
          else if ((kd === 'chords' || gk) && /^g:/.test(mode) && SS.GuitarArp) (events = arpOneEvents(spans, { guitar: { ...((o && o.gtr) || {}), on: true, motif: mode.slice(2) } }, bars)), (gtrEv = true);
          else if (gk) events = chordEvents(spans, /^[gr]:/.test(mode) ? 'chop' : mode, r, { lo: 52, hi: 74, kp: H().scale(k).map((d) => d.pc) }); // sans le moteur de guitare : petits accords hachés
          else if (kk) events = keysEv(mode);
          else if (kd === 'chords') events = chordEvents(spans, mode, r, { lo: 53, hi: 76, open: !!(o && o.voicing === 'open'), kp: H().scale(k).map((d) => d.pc) });
          else if (kd === 'melody') events = sing(role === 'vox' ? 'vox' : 'lead', mode);
          else {
            // notes percussives : fondamentale de l'accord sur la grosse caisse et la caisse claire du motif de la scène
            const dsrc = ie && (ie.pattern || ie.edits) ? ie : dp0;
            const dpat = dsrc && dsrc.pattern && SS.drumPattern ? SS.drumPattern(dsrc.style, dsrc.pattern) : null;
            const lanes = fitLanes(dsrc && (dsrc.edits || (dpat && dpat.lanes)));
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
            events = bassEvents(spans, mode, r, kp, { pedalPc: (o && ped) ?? null, approach: !o || o.approach !== false, shift: (o ? { mid: 12, high: 24 }[o.register] || 0 : 0) + (spec.bassShift || 0) });
          }
          else if (role === 'fx') events = fxEvents(spans, mode, k, bars);
          else if (role === 'arp') events = arpEvents(spans, mode, r);
          else if (singer) events = sing(role, mode);
          else if (role === 'arpchord') events = arpEvents(spans, mode, r);
          else {
            // nappe, cordes, piano, guitare : accords (ou arpège si le mode en est un)
            const range = role === 'keys' ? { lo: 57, hi: 79 } : role === 'guitar' ? { lo: 52, hi: 74 } : role === 'strings' ? { lo: 55, hi: 81 } : role === 'brass' ? { lo: 53, hi: 84, top: 84 } : { lo: 53, hi: 76 };
            // guitare : motif du mode Guitare d'Arp One (« g:travis »…), joué par le vrai moteur (js/guitar-arp.js)
            if (kk) events = keysEv(mode, range);
            else if (/^r:/.test(mode) && SS.GuitarRiffs) (events = riffEvents(spans, mode, o && o.riff, bars, `${presetId}/${id}/${ids[ti].id}`)), (gtrEv = true);
            else if (/^g:/.test(mode) && SS.GuitarArp) (events = arpOneEvents(spans, { guitar: { ...((o && o.gtr) || {}), on: true, motif: mode.slice(2) } }, bars)), (gtrEv = true);
            else if (/^[gr]:/.test(mode)) events = chordEvents(spans, 'chop', r, range); // sans le moteur de guitare : petits accords hachés
            else events = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'ost16', 'dotted', 'toll', ...TRI_ARP].includes(mode) ? arpEvents(spans, mode, r) : chordEvents(spans, mode, r, { ...range, open: role === 'pad' && !!o && o.voicing === 'open', kp: H().scale(k).map((d) => d.pc) });
          }
        }
        if (kk) events = SS.keyboardist ? SS.keyboardist.shape(events, spans, o && o.keys, r, tones) : events; // réglages du Clavier (voicing, main gauche, pédale…)
        // piste Effets d'une scène dont une jonction est réglée : montée, cymbale inversée, impact, descente (voir fxSceneTrack)
        let fxScene = null;
        if (role === 'fx' && !changed && !off && (oj || ij || sec.fxo)) {
          fxScene = fxSceneTrack(sec, k, bars, outE, inE, gapSteps, !!spec.tech);
          events = fxScene.events;
        }
        data[t.id] = { events: role === 'fx' ? events : shapeVel(events, er, { energy, bars, build: sec.drums === 'build', own: gtrEv }) };
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
        // motif de nappe à mouvement de son (pompe, filtre qui s'ouvre, souffle inversé) : sa courbe passe devant celle du plan
        const pfx = events.length && mode && (kd === 'chords' || gk || kk || (!changed && !['bass', 'fx', 'arp', 'arpchord'].includes(role) && !singer)) ? padFxLanes(mode, bars) : null;
        if (pfx) data[t.id].auto = { ...(data[t.id].auto || {}), ...pfx };
      });
      // doublure : la mélodie du premier instrument mélodique, une octave ou une tierce diatonique au-dessus
      const src = primaryMel && data[primaryMel.id];
      if (src) {
        const kp = H().scale(k).map((d) => d.pc);
        doubles.forEach(([t, how]) => {
          data[t.id] = { events: src.events.map((e) => ({ ...e, notes: e.notes.map((n) => (how === 'third' ? scaleUp(n, 2, kp) : n + 12)), vel: clampV(e.vel * 0.85) })) };
        });
      }
      // orchestre (js/orchestra.js) : un musicien, une piste par pupitre ; il distribue la mélodie, les accords et la basse
      const orchOut = {};
      const orchMus = [...new Set(tracks.filter((t) => roleOfTrack(t) === 'orch').map((t) => t.band.musician))];
      orchMus.forEach((mid) => {
        const ts = tracks.filter((t) => roleOfTrack(t) === 'orch' && t.band.musician === mid);
        const ie = (pp && pp.inst && pp.inst[mid]) || null;
        const ord = ts.map((t) => (t.band.key.split(':')[1] || ''));
        if (!SS.orchestra || muted.includes('orch') || (ie && ie.off)) {
          ts.forEach((t) => (data[t.id] = { events: [] }));
          return;
        }
        const top = (primaryMel && data[primaryMel.id] && data[primaryMel.id].events) || [];
        const level = (ie && ie.orch && ie.orch.level) || SS.orchestra.levelOf(energy);
        const ospans = spans.map((sp) => ({ step: sp.step, len: sp.len, pcs: [...new Set(tones(sp.chord))], bassPc: sp.chord.bassPc ?? sp.chord.rootPc }));
        const omel = top.filter((e) => e.notes && e.notes.length).map((e) => ({ step: e.step, len: e.len, midi: Math.max(...e.notes) }));
        const ooff = (ie && ie.orch && ie.orch.off) || [];
        let res = SS.orchestra.orchestrate({
          parts: ord,
          spans: ospans,
          melody: omel,
          level,
          off: ooff,
          motor: !!sec.motor,
          stabs: !!sec.stabs,
          under: !!sec.dialog,
          vel: sec.orchVel ?? null,
          art: { ...(sec.art || {}), motor: !!sec.motor },
          spb: SPB,
          beat: BEAT,
        });
        // jeu de cordes de la scène (js/orchjeux.js) : parts[sec].inst[musicien].orch.jeu, sinon le premier ★ de l'effectif
        const ensId = (SS.orchestra.ENSEMBLES.find((e) => e.parts.length === ord.length && e.parts.every((p, i) => p === ord[i])) || {}).id || '';
        const OJ = SS.orchJeux;
        const autoJeu = OJ ? OJ.autoJeu(id, ensId) : 'orch';
        const ownJeu = ie && ie.orch && ie.orch.jeu;
        const jeu = OJ && OJ.JEU[ownJeu] ? ownJeu : autoJeu;
        if (OJ && jeu !== 'orch') res = OJ.apply(res, { parts: ord, jeu, spans: ospans, melody: omel, level, off: ooff, vel: sec.orchVel ?? null, spb: SPB, beat: BEAT, scale: H().scale(k).map((d) => d.pc) });
        ts.forEach((t, i) => {
          const L = res.lines[ord[i]];
          data[t.id] = { events: L ? L.events.map((e) => ({ ...e, notes: [...e.notes] })) : [] };
          // jeux qui enflent ou s'éteignent : courbe de volume, que l'automation de la scène remplace
          if (L && L.vol && L.events.length) data[t.id].auto = { volume: { ...L.vol } };
          const A = ie && ie.auto ? normalizeAuto(ie.auto) : null;
          if (A) applyAutoLanes(data[t.id], A, bars);
        });
        orchOut[mid] = { level, auto: !(ie && ie.orch && ie.orch.level), lines: res.lines, items: res.items, ens: ensId, jeu, autoJeu, jeuAuto: !(OJ && OJ.JEU[ownJeu]), view: res.view || null };
      });
      // section de cuivres (js/horns.js) : un musicien, une piste par membre de la section ; jeu, nuance et membres coupés
      // par scène : parts[sec].inst[musicien].horns = { jeu, nu, off } (off absent : ceux que la formation coupe d'office)
      const hornsOut = {};
      const eighths = !!spec.eighths && SPB === 16 && BEAT === 4;
      const hornsMus = [...new Set(tracks.filter((t) => roleOfTrack(t) === 'horns').map((t) => t.band.musician))];
      hornsMus.forEach((mid) => {
        const ts = tracks.filter((t) => roleOfTrack(t) === 'horns' && t.band.musician === mid);
        const ie = (pp && pp.inst && pp.inst[mid]) || null;
        const fk = SS.horns ? SS.horns.fromKeys(ts.map((t) => t.band.key.split(':')[1] || '')) : null;
        if (!fk || muted.includes('horns') || (ie && ie.off)) {
          ts.forEach((t) => (data[t.id] = { events: [] }));
          return;
        }
        const own = (ie && ie.horns) || {};
        const autoJeu = SS.horns.sceneJeu(id, sec.horns, fk.form); // jeu écrit par le modèle pour cette scène, sinon d'après son nom
        // jeu choisi : un jeu commun, ou un motif du fichier de cette formation (un motif d'une autre formation ne vaut plus)
        const ownOK = SS.horns.JEUX.includes(own.jeu) && (!/^m\d/.test(own.jeu) || !!SS.horns.motifOf(own.jeu, fk.form));
        const jeu = ownOK ? own.jeu : autoJeu;
        const res = SS.horns.write({
          form: fk.form,
          add: fk.add,
          jeu,
          off: Array.isArray(own.off) ? own.off : SS.horns.offByDefault(fk.form),
          nuance: own.nu || 'mf',
          spans: spans.map((sp) => ({ step: sp.step, len: sp.len, rootPc: sp.chord.rootPc, pcs: [...new Set(tones(sp.chord))] })),
          // chanson écrite en croches (spec.eighths, salsa : une mesure de la grille = deux mesures jouées) : la section
          // lit ses jeux en croches, sinon elle jouerait deux fois trop lentement
          ...(eighths ? { bars: bars * 2, spb: SPB / 2, beat: BEAT / 2 } : { bars, spb: SPB, beat: BEAT }),
        });
        ts.forEach((t, i) => {
          const L = res.lines[fk.ids[i]];
          data[t.id] = { events: L ? L.events.map((e) => ({ ...e, notes: [...e.notes] })) : [] };
          // jeux qui enflent (Tenues qui enflent, Montée) : courbe de volume, que l'automation de la scène remplace
          if (L && L.vol && L.events.length) data[t.id].auto = { volume: { ...L.vol } };
          const A = ie && ie.auto ? normalizeAuto(ie.auto) : null;
          if (A) applyAutoLanes(data[t.id], A, bars);
        });
        hornsOut[mid] = { form: fk.form, jeu, autoJeu, auto: !ownOK, lines: res.lines };
      });
      // nuances de film (js/film.js) : crescendo vers la synchro, respiration après le sommet (sec.ramps = [{ a, b, from, to }])
      if (Array.isArray(sec.ramps) && sec.ramps.length)
        tracks.forEach((t) => {
          const d = data[t.id];
          if (!d || !Array.isArray(d.events)) return;
          d.events.forEach((e) => {
            const r = sec.ramps.find((x) => e.step >= x.a && e.step < x.b);
            if (r) e.vel = clampV((e.vel ?? 0.7) * (r.from + ((r.to - r.from) * (e.step - r.a)) / Math.max(1, r.b - r.a)));
          });
        });
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
      // point d'orgue (js/film.js, sec.fermata) : la dernière mesure tient l'accord atteint, tout le reste se tait
      if (sec.fermata && bars >= 2) {
        const a = (bars - 1) * SPB;
        const end = bars * SPB;
        tracks.forEach((t) => {
          const d = data[t.id];
          if (!d) return;
          if (Array.isArray(d.steps)) {
            // percussions : un seul coup au début de la tenue, s'il y en avait un ; puis silence
            for (let st = a + 1; st < end; st++) d.steps[st] = 0;
            return;
          }
          if (!Array.isArray(d.events) || !d.events.length) return;
          const onA = d.events.filter((e) => e.step === a);
          const held = onA.length ? onA : d.events.filter((e) => e.step < a && e.step + e.len > a);
          d.events = d.events.filter((e) => e.step < a || onA.includes(e));
          held.forEach((e) => (e.len = end - e.step));
        });
      }
      // sous un dialogue (js/film.js, sec.dialog) : toute la musique baisse de 4 dB pendant la scène (courbe de volume),
      // en plus des notes plus douces ; une courbe déjà posée est multipliée
      if (sec.dialog)
        tracks.forEach((t) => {
          const d = data[t.id];
          if (!d || !((d.events && d.events.length) || (d.steps && d.steps.some((v) => v > 0)))) return;
          const old = d.auto && d.auto.volume;
          d.auto = { ...(d.auto || {}), volume: old ? Object.fromEntries(Object.entries(old).map(([k, v]) => [k, Math.round(v * DIALOG_DIP * 1000) / 1000])) : { 0: DIALOG_DIP } };
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
        writeTransitions(data, tracks, (t) => (t.type === 'drum' ? 'drums' : ['guitar', 'keys'].includes(kindOfT.get(t)) ? 'chords' : kindOfT.get(t) || null), { bars, key: k, spans, out: oj ? outE : null, inn: ij ? inE : null });
      if (gapSteps) gapEnd(data, bars, gapSteps, oj ? new Set(tracks.filter((t) => roleOfTrack(t) === 'fx').map((t) => t.id)) : null);
      const sc = { id: SS.uid(), sec: id, name: sec.name || NAMES[id] || id, bars, key: k, data, spans };
      if (orchMus.length) Object.defineProperty(sc, 'orch', { value: orchOut, enumerable: false }); // rapport de l'étape Orchestration (pas dans le projet)
      if (hornsMus.length) Object.defineProperty(sc, 'horns', { value: hornsOut, enumerable: false }); // rapport de l'étape Cuivres
      // grille de la scène (piste Accords du projet) : la même que celle de l'étape Accords de l'assistant
      const gch = sceneGrid(grid, spans0, k, bars);
      if (gch.length) sc.grid = { chords: gch, ...(peds.length ? { pedals: peds.map((x) => ({ ...x })) } : {}), initialized: true };
      const emo = harmony && harmony.emotions && harmony.emotions[id];
      if (emo || spec.emotion) sc.emotion = emo || sec.emotion || spec.emotion;
      // musique de film : le passage (émotion du film, énergie, tension, repère, harmonie…) pour la fiche Scène
      if (sec.tempo >= 20 && sec.tempo <= 300) sc.tempo = Math.round(sec.tempo); // tempo propre (passage de film)
      if (sec.film) {
        sc.film = JSON.parse(JSON.stringify(sec.film));
        sc.energy = sec.film.ene;
        sc.tension = sec.film.ten;
      }
      return sc;
    });
    const song = form.map((f) => ({ scene: scenes[order.indexOf(f.id)].id, repeat: f.repeat }));
    // musiciens Ambient : leur présence (et leur hasard) scène par scène, en courbes sur toute la chanson
    const ambient = {};
    tracks.forEach((t, i) => roleOfTrack(t) === 'ambient' && (ambient[t.id] = ambientCurves(spec, parts, ids[i].id, { n: (SS.ambient && SS.ambient.PN) || 48 })));
    return { key, scenes, song, ...(Object.keys(ambient).length ? { ambient } : {}) };
  }

  /* Modes de basse de nov. 2026 : une mesure type [pas, longueur, note, vélocité] ; les vélocités font les nuances (temps
     appuyés, contretemps plus doux, notes fantômes vers 0,35–0,4 en slap, Motown, boom bap, afrobeats) ; note : demi-tons au-dessus de la fondamentale
     (0, 7, 12), « t » tierce de l'accord, « s » septième, « a » note voisine (dans la gamme) de l'accord suivant (dernière mesure de
     l'accord, sinon la quinte), « n » fondamentale de l'accord suivant jouée en avance (dernière mesure, sinon la fondamentale ;
     en fin de mesure, elle se prolonge sur le 1 suivant sans nouvelle attaque), « c » demi-ton sous l'accord suivant (approche
     chromatique), « u3 » « u2 » « u1 » montée par la gamme vers l'accord suivant (sinon quinte, tierce, fondamentale).
     5e valeur 'g' : la note glisse depuis la précédente (ev.slide ; la précédente, ev.slideFrom, tient jusqu'à elle). */
  /** « u3 », « u2 », « u1 » : montée vers l'accord suivant, à 3, 2 puis 1 note de la gamme de lui. */
  const UP = { u3: 3, u2: 2, u1: 1 };
  /** Motifs écrits pour une autre mesure que 4/4 : 12 pas (3/4 et 6/8) ou 24 (12/8) ; les autres en 4/4 (16 pas). */
  const METER = { valse: '3/4', valsejazz: '3/4', ballade68: '6/8', galop68: '6/8', slow128: '12/8', boogie128: '12/8', berce128: '12/8', valsepop: '3/4', valseavance: '3/4', valse8: '3/4', valseped: '3/4', tarentelle: '6/8', oct68: '6/8', arp68b: '6/8', gigue: '6/8', shuffle128: '12/8', arp128b: '12/8', gospel128: '12/8', marche128: '12/8' };
  /** Pas par mesure du motif. */
  const motifBar = (id) => (METER[id] ? METERS[METER[id]][0] : 16);
  /** Nombre de mesures d'un motif BASS_RHYTHMS (1, ou 2 si une note tombe après la première mesure). */
  const motifBars = (id) => (BASS_RHYTHMS[id] ? Math.max(1, Math.ceil(Math.max(...BASS_RHYTHMS[id].map((x) => x[0] + 0.01)) / motifBar(id))) : 1);
  const BASS_RHYTHMS = {
    rock8: [[0, 2, 0, 0.92], [2, 2, 0, 0.62], [4, 2, 0, 0.8], [6, 2, 0, 0.62], [8, 2, 0, 0.88], [10, 2, 0, 0.62], [12, 2, 0, 0.8], [14, 2, 12, 0.74]],
    ballade: [[0, 10, 0, 0.85], [10, 2, 7, 0.7], [12, 4, 'a', 0.72]],
    // noire pointée, croche (le « et » du 2, plus douce), blanche : toujours la fondamentale
    pointee: [[0, 6, 0, 0.9], [6, 2, 0, 0.7], [8, 8, 0, 0.85]],
    disco16: [[0, 2, 0, 0.92], [2, 1, 12, 0.74], [3, 1, 0, 0.7], [4, 2, 0, 0.88], [6, 1, 12, 0.74], [7, 1, 0, 0.7], [8, 2, 0, 0.9], [10, 1, 12, 0.74], [11, 1, 0, 0.7], [12, 2, 0, 0.88], [14, 1, 12, 0.76], [15, 1, 'a', 0.7]],
    slap: [[0, 1, 0, 0.95], [2, 1, 0, 0.36], [3, 1, 0, 0.8], [4, 1, 12, 0.9], [6, 1, 0, 0.85], [7, 1, 12, 0.75], [9, 1, 0, 0.36], [10, 1, 0, 0.88], [11, 1, 7, 0.72], [12, 1, 12, 0.9], [13, 1, 0, 0.38], [14, 1, 0, 0.82], [15, 1, 's', 0.72]],
    motown: [[0, 3, 0, 0.9], [3, 1, 0, 0.55], [4, 2, 12, 0.78], [6, 1, 7, 0.7], [7, 1, 7, 0.38], [8, 3, 0, 0.88], [11, 1, 't', 0.6], [12, 2, 7, 0.76], [14, 2, 'a', 0.74]],
    boombap: [[0, 3, 0, 0.92], [5, 1, 0, 0.38], [7, 2, 0, 0.78], [10, 3, 7, 0.8], [14, 2, 's', 0.6]],
    sub808: [[0, 14, 0, 0.92], [14, 2, 12, 0.75]],
    trap808: [[0, 3, 0, 0.95], [3, 3, 0, 0.8], [6, 2, 12, 0.78], [8, 4, 0, 0.9], [12, 2, 7, 0.76], [14, 2, 0, 0.8]],
    reese: [[0, 8, 0, 0.88], [8, 6, 0, 0.8], [14, 2, 12, 0.74]],
    dnbroll: [[0, 2, 0, 0.92], [3, 1, 0, 0.72], [6, 1, 0, 0.78], [7, 1, 12, 0.7], [10, 2, 0, 0.88], [13, 1, 0, 0.72], [14, 1, 7, 0.74], [15, 1, 0, 0.7]],
    dembow: [[0, 3, 0, 0.92], [3, 3, 0, 0.72], [6, 2, 7, 0.78], [8, 3, 0, 0.88], [11, 3, 0, 0.72], [14, 2, 12, 0.7]],
    tumbao: [[6, 6, 7, 0.86], [12, 4, 'n', 0.9]],
    onedrop: [[2, 2, 0, 0.82], [4, 2, 0, 0.76], [6, 2, 't', 0.74], [8, 4, 7, 0.86], [14, 2, 12, 0.72]],
    // reggae roots : fondamentale ronde et tenue, note fantôme, tierce et quinte qui chantent, approche de l'accord suivant
    // (posée sur le 1 et le 2, quinte sous la fondamentale, notes courtes comme étouffées de la paume, silences)
    roots: [[0, 3, 0, 0.92], [3, 1, 0, 0.36], [4, 2, -5, 0.8], [6, 1, 0, 0.74], [8, 2, 't', 0.78], [10, 2, 7, 0.82], [13, 1, 7, 0.38], [14, 2, 'a', 0.76]],
    // shuffle : fondamentale qui rebondit en croches (swinguées), appui sur 1 et 3, note d'approche de l'accord suivant sur le
    // dernier « et » (la quinte si l'accord ne change pas) ; les renversements (Sol/Si, Do m6/Mi♭) gardent leur basse
    shuffle: [[0, 3, 0, 0.9], [4, 2, 0, 0.66], [6, 2, 0, 0.58], [8, 3, 0, 0.86], [12, 2, 0, 0.66], [14, 2, 'a', 0.72]],
    bossa: [[0, 6, 0, 0.88], [6, 2, 7, 0.72], [8, 6, 7, 0.82], [14, 2, 0, 0.72]],
    afro: [[0, 3, 0, 0.9], [6, 2, 0, 0.72], [9, 1, 0, 0.38], [10, 2, 12, 0.76], [12, 3, 0, 0.84], [15, 1, 12, 0.4]],
    acid: [[0, 1, 0, 0.95], [1, 1, 0, 0.6], [2, 1, 12, 0.85], [3, 1, 0, 0.6], [5, 1, 0, 0.75], [6, 1, 's', 0.8], [7, 1, 12, 0.7], [8, 1, 0, 0.92], [10, 1, 0, 0.65], [11, 1, 7, 0.8], [12, 1, 12, 0.88], [13, 1, 0, 0.6], [14, 1, 0, 0.75], [15, 1, 't', 0.7]],
    // nov. 2026 : basses techno / house de Nicolas (une mesure en doubles, 125 BPM) ; 13 = seconde mineure à l'octave, 10 = septième mineure ;
    // nuances : le « et » appuyé, les autres doubles plus douces
    oracle: [[1, 1, 0, 0.66], [2, 1, 12, 0.9], [3, 1, 0, 0.66], [5, 1, 0, 0.66], [6, 1, 12, 0.9], [7, 1, 0, 0.66], [9, 1, 0, 0.66], [10, 1, 13, 0.9], [11, 1, 10, 0.66], [13, 1, 0, 0.66], [14, 1, 13, 0.9], [15, 1, 0, 0.66]],
    troy: [[1, 1, 0, 0.66], [2, 1, 12, 0.9], [3, 1, 12, 0.78], [5, 1, 12, 0.78], [6, 1, 0, 0.9], [7, 1, 12, 0.78], [9, 1, 0, 0.66], [10, 1, 12, 0.9], [11, 1, 0, 0.66], [13, 1, 12, 0.78], [14, 1, 0, 0.9], [15, 1, 12, 0.78]],
    phalanx: [[1, 1, 12, 0.78], [2, 1, 0, 0.9], [3, 1, 12, 0.78], [5, 1, 12, 0.78], [6, 1, 0, 0.9], [7, 1, 12, 0.78], [9, 1, 12, 0.78], [10, 1, 0, 0.9], [11, 1, 12, 0.78], [13, 1, 0, 0.66], [14, 1, 13, 0.9], [15, 1, 0, 0.66]],
    necropolis: [[3, 1, 0, 0.66], [6, 1, 0, 0.9], [11, 1, 0, 0.66], [14, 1, 0, 0.9]],
    styx: [[1, 1, 0, 0.66], [3, 1, 0, 0.66], [6, 1, 0, 0.9], [9, 1, 0, 0.66], [11, 1, 0, 0.66], [13, 1, 0, 0.66], [14, 1, 0, 0.9]],
    athens: [[1, 1, 12, 0.78], [2, 1, 12, 0.9], [3, 1, 0, 0.66], [5, 1, 12, 0.78], [6, 1, 0, 0.9], [7, 1, 12, 0.78], [9, 1, 12, 0.78], [10, 1, 0, 0.9], [11, 1, 12, 0.78], [13, 1, 12, 0.78], [14, 1, 0, 0.9], [15, 1, 13, 0.78]],
    seismic: [[2, 1, 0, 0.9], [7, 1, 0, 0.66], [10, 1, 0, 0.9], [14, 1, 0, 0.9]],
    hades: [[2, 1, 0, 0.9], [6, 1, 0, 0.9], [10, 1, 0, 0.9], [14, 1, 0, 0.9]],
    mythos: [[1, 1, 0, 0.66], [2, 1, 0, 0.9], [5, 1, 0, 0.66], [6, 1, 12, 0.9], [7, 1, 0, 0.66], [9, 1, 0, 0.66], [10, 1, 12, 0.9], [13, 1, 0, 0.66], [14, 1, 12, 0.9], [15, 1, 0, 0.66]],
    thebes: [[1, 1, 0, 0.66], [2, 1, 0, 0.9], [3, 1, 0, 0.66], [5, 1, 0, 0.66], [6, 1, 0, 0.9], [7, 1, 0, 0.66], [9, 1, 0, 0.66], [10, 1, 0, 0.9], [11, 1, 0, 0.66], [13, 1, 0, 0.66], [14, 1, 0, 0.9], [15, 1, 0, 0.66]],
    // nov. 2026 : motifs « célèbres » = des procédés de bassistes et de genres connus, rejoués avec des notes originales
    // (jamais la ligne d'un morceau) ; 14 = neuvième, 10 = septième mineure, 9 = sixte, -5 = quinte sous la fondamentale
    cel_chic: [[0, 2, 0, 0.92], [3, 1, 0, 0.45], [4, 1, 12, 0.8], [6, 2, 0, 0.85], [8, 1, 0, 0.9], [10, 1, 12, 0.78], [11, 1, 0, 0.4], [12, 2, 7, 0.8], [14, 1, 12, 0.75], [15, 1, 'a', 0.7]],
    cel_hitsville: [[0, 3, 0, 0.9], [3, 1, 't', 0.45], [4, 2, 7, 0.78], [6, 1, 12, 0.7], [7, 1, 10, 0.4], [8, 2, 7, 0.82], [10, 1, 0, 0.5], [11, 1, 't', 0.7], [12, 2, 7, 0.78], [14, 1, 9, 0.6], [15, 1, 'a', 0.72]],
    cel_pfunk: [[0, 4, 0, 0.98], [6, 1, 12, 0.7], [7, 1, 10, 0.6], [10, 1, 0, 0.4], [11, 1, 7, 0.75], [13, 1, 12, 0.8], [14, 2, 's', 0.7]],
    cel_thumb: [[0, 1, 0, 0.95], [1, 1, 0, 0.35], [2, 1, 12, 0.9], [4, 1, 0, 0.9], [5, 1, 0, 0.35], [6, 1, 12, 0.88], [7, 1, 10, 0.7], [8, 1, 0, 0.92], [10, 1, 12, 0.88], [11, 1, 0, 0.35], [12, 1, 7, 0.8], [13, 1, 12, 0.85], [14, 1, 0, 0.4], [15, 1, 10, 0.75]],
    cel_fretless: [[0, 3, 0, 0.88], [3, 1, 7, 0.6], [4, 2, 12, 0.78], [6, 2, 14, 0.7], [8, 3, 't', 0.8], [11, 1, 7, 0.6], [12, 2, 12, 0.78], [14, 2, 'a', 0.72]],
    cel_liverpool: [[0, 2, 0, 0.9], [2, 2, 7, 0.7], [4, 2, 12, 0.78], [6, 2, 7, 0.68], [8, 2, 't', 0.82], [10, 2, 7, 0.7], [12, 2, 0, 0.78], [14, 2, 'a', 0.74]],
    cel_studio60: [[0, 3, 0, 0.9], [3, 1, 0, 0.55], [4, 4, 7, 0.8], [8, 3, 12, 0.85], [11, 1, 7, 0.55], [12, 4, 'a', 0.75]],
    cel_gallop: [0, 4, 8, 12].flatMap((s) => [[s, 2, s === 12 ? 12 : 0, 0.92], [s + 2, 1, s === 12 ? 12 : 0, 0.72], [s + 3, 1, s === 12 ? 12 : 0, 0.72]]),
    cel_motorik: [[0, 2, 0, 0.9], [2, 2, 0, 0.74], [4, 2, 12, 0.8], [6, 2, 0, 0.74], [8, 2, 0, 0.88], [10, 2, 0, 0.74], [12, 2, 12, 0.8], [14, 2, 0, 0.74]],
    cel_coldwave: [[0, 4, 12, 0.85], [4, 2, 19, 0.78], [6, 2, 17, 0.68], [8, 6, 12, 0.82], [14, 2, 7, 0.72]],
    cel_staccato80: [[0, 1, 0, 0.92], [2, 1, 7, 0.75], [4, 1, 12, 0.8], [6, 1, 7, 0.72], [8, 1, 0, 0.9], [10, 1, 7, 0.75], [12, 1, 10, 0.78], [14, 1, 12, 0.74]],
    cel_steppers: [[0, 2, 0, 0.9], [3, 1, 0, 0.4], [4, 2, 0, 0.85], [7, 1, 7, 0.5], [8, 2, 0, 0.9], [11, 1, 0, 0.4], [12, 2, 0, 0.85], [14, 2, 'a', 0.7]],
    cel_ska: [[0, 2, 0, 0.88], [2, 2, 't', 0.74], [4, 2, 7, 0.8], [6, 2, 9, 0.72], [8, 2, 12, 0.86], [10, 2, 9, 0.72], [12, 2, 7, 0.78], [14, 2, 'a', 0.74]],
    cel_boogie: [[0, 2, 0, 0.9], [2, 2, 't', 0.72], [4, 2, 7, 0.8], [6, 2, 9, 0.72], [8, 2, 10, 0.84], [10, 2, 9, 0.72], [12, 2, 7, 0.78], [14, 2, 't', 0.7]],
    cel_rockabilly: [[0, 2, 0, 0.9], [2, 1, 0, 0.35], [4, 2, 7, 0.85], [6, 1, 7, 0.35], [8, 2, 0, 0.9], [10, 1, 0, 0.35], [12, 2, 7, 0.85], [14, 1, 'a', 0.6]],
    cel_lagos: [[0, 2, 0, 0.9], [3, 1, 0, 0.6], [4, 1, 12, 0.75], [6, 2, 10, 0.78], [9, 1, 7, 0.6], [10, 2, 0, 0.85], [13, 1, 10, 0.55], [14, 2, 12, 0.75]],
    cel_surdo: [[0, 3, 0, 0.85], [3, 1, 0, 0.5], [4, 3, -5, 0.92], [7, 1, -5, 0.5], [8, 3, 0, 0.85], [11, 1, 0, 0.5], [12, 3, -5, 0.92], [15, 1, 'a', 0.55]],
    cel_gfunk: [[0, 4, 0, 0.9], [6, 1, 0, 0.5], [7, 1, 12, 0.75], [8, 3, 10, 0.8], [11, 1, 7, 0.6], [12, 2, 0, 0.85], [14, 2, -2, 0.7]],
    cel_frenchtouch: [[2, 2, 0, 0.9], [5, 1, 12, 0.6], [6, 2, 0, 0.88], [9, 1, 12, 0.6], [10, 2, 0, 0.9], [13, 1, 12, 0.6], [14, 2, 'a', 0.8]],
    cel_wobble: [[0, 6, 0, 0.95], [6, 2, 12, 0.7], [8, 4, 0, 0.88], [12, 2, -2, 0.75], [14, 2, 0, 0.8]],
    cel_neosoul: [[0, 4, 0, 0.85], [5, 1, 0, 0.4], [6, 2, 't', 0.7], [9, 3, 7, 0.78], [12, 1, 10, 0.55], [13, 3, 'a', 0.72]],
    // nov. 2026 : motifs courants qui manquaient (état des lieux des basses) ; rythmes génériques de genre
    // anticipation : croches, la fondamentale de l'accord suivant arrive sur le « et » du 4 et se lie au 1
    anticip: [[0, 2, 0, 0.9], [2, 2, 0, 0.62], [4, 2, 0, 0.8], [6, 2, 0, 0.62], [8, 2, 0, 0.86], [10, 2, 0, 0.62], [12, 2, 0, 0.78], [14, 2, 'n', 0.88]],
    // montée vers l'accord : trois notes conjointes (3, « et » du 3, 4) qui mènent au nouvel accord
    walkup: [[0, 6, 0, 0.9], [6, 2, 7, 0.64], [8, 2, 'u3', 0.76], [10, 2, 'u2', 0.72], [12, 4, 'u1', 0.82]],
    // approche chromatique soul / gospel : le demi-ton sous l'accord suivant sur le « et » du 4
    chroma: [[0, 3, 0, 0.9], [3, 1, 0, 0.45], [4, 2, 7, 0.76], [6, 2, 12, 0.7], [8, 3, 0, 0.86], [11, 1, 7, 0.5], [12, 2, 't', 0.74], [14, 2, 'c', 0.76]],
    // boom-chick country (two-beat) : fondamentale sur 1, quinte grave sur 3, notes courtes
    boomchick: [[0, 3, 0, 0.9], [8, 3, -5, 0.82]],
    // cha-cha-cha : 1, 3, puis « cha-cha » sur 4 et le « et » du 4
    chacha: [[0, 4, 0, 0.88], [8, 4, 7, 0.8], [12, 2, 0, 0.74], [14, 2, 'a', 0.78]],
    // cumbia : fondamentale sur 1, quinte sur 3, reprise sur le « et » du 4
    cumbia: [[0, 4, 0, 0.9], [8, 4, 7, 0.82], [14, 2, 'a', 0.66]],
    // baião (forró) : fondamentale, puis quinte sur le « a » du 1 tenue sur le 2, deux fois par mesure
    baiao: [[0, 3, 0, 0.9], [3, 5, 7, 0.78], [8, 3, 0, 0.88], [11, 5, 7, 0.76]],
    // 2-step (UK garage) : notes décalées, octave sur le « a » du 2, le 3 appuyé
    twostep: [[0, 2, 0, 0.9], [3, 2, 0, 0.64], [7, 1, 12, 0.7], [8, 3, 0, 0.84], [13, 1, 7, 0.6], [14, 2, 0, 0.74]],
    // triolets (position en fraction de pas, jouée par le décalage de note) et motifs de deux mesures (pas 16–31)
    // walking avec « skip » : la noire du 3 rebondit sur un triolet fantôme, puis le demi-ton vers l'accord suivant
    walkskip: [[0, 4, 0, 0.88], [4, 4, 't', 0.74], [8, 2, 7, 0.78], [10.67, 1.33, 7, 0.36], [12, 4, 'c', 0.8]],
    // ballade 12/8 jouée en 4/4 : la fondamentale qui berce, troisième croche de triolet du 2 et du 4
    ballade128: [[0, 6, 0, 0.88], [6.67, 1.33, 0, 0.55], [8, 4, 7, 0.8], [12, 2, 12, 0.7], [14.67, 1.33, 'a', 0.6]],
    // son montuno sur la clave 3-2 : tumbao en mesure « 3 », une relance sur le « a » du 1 en mesure « 2 »
    montuno: [[6, 6, 7, 0.86], [12, 4, 'n', 0.9], [19, 3, 0, 0.7], [22, 6, 7, 0.84], [28, 4, 'n', 0.9]],
    // glissés : 808 drill (syncopes en triolets, glissés vers l'octave et la septième), log drum amapiano (notes courtes
    // syncopées, glissées)
    drill: [[0, 4, 0, 0.95], [4, 2.67, 0, 0.8], [6.67, 3.33, 12, 0.85, 'g'], [10, 2.67, 10, 0.8, 'g'], [12.67, 3.33, 0, 0.88, 'g']],
    amapiano: [[0, 2, 0, 0.9], [3, 3, 0, 0.6], [6, 2, 7, 0.82, 'g'], [8, 1, 7, 0.5], [10, 2, 0, 0.86], [13, 1, 10, 0.7], [14, 2, 0, 0.8, 'g']],
    // mesures de 12 pas (METER) : valse 3/4 (fondamentale, puis quinte grave la mesure suivante), valse jazz (une noire par
    // temps, demi-ton vers l'accord suivant), ballade 6/8 (fondamentale sur le 1, quinte sur le 4, approche)
    valse: [[0, 4, 0, 0.9], [12, 4, -5, 0.82]],
    valsejazz: [[0, 4, 0, 0.88], [4, 4, 't', 0.72], [8, 4, 'c', 0.76]],
    ballade68: [[0, 6, 0, 0.88], [6, 4, 7, 0.78], [10, 2, 'a', 0.62]],
    // 6/8 qui avance : noire-croche sur chaque temps (fondamentale, puis quinte)
    galop68: [[0, 4, 0, 0.9], [4, 2, 0, 0.6], [6, 4, 7, 0.82], [10, 2, 0, 0.6]],
    // 12/8 (24 pas, quatre temps de noire pointée) : blues lent (fondamentale, quinte, approche), boogie (une note de l'accord
    // par temps : fondamentale, tierce, quinte, sixte), ballade bercée (fondamentale tenue, relance, quinte)
    slow128: [[0, 6, 0, 0.9], [6, 6, 7, 0.76], [12, 6, 0, 0.86], [18, 4, 7, 0.74], [22, 2, 'a', 0.66]],
    boogie128: [[0, 6, 0, 0.9], [6, 6, 't', 0.74], [12, 6, 7, 0.84], [18, 6, 9, 0.74]],
    berce128: [[0, 10, 0, 0.88], [10, 2, 0, 0.55], [12, 12, 7, 0.8]],
    // motifs ternaires ajoutés (nov. 2026) : 3/4, 6/8, 12/8
    valsepop: [[0, 6, 0, 0.9], [6, 2, 0, 0.6], [8, 4, 7, 0.78]],
    valseavance: [[0, 4, 0, 0.9], [4, 4, 7, 0.74], [8, 4, 'a', 0.72]],
    valse8: [[0, 2, 0, 0.9], [2, 2, 0, 0.58], [4, 2, 7, 0.78], [6, 2, 7, 0.58], [8, 2, 12, 0.76], [10, 2, 7, 0.6]],
    valseped: [[0, 8, 0, 0.88], [8, 4, 12, 0.72]],
    tarentelle: [[0, 2, 0, 0.92], [2, 2, 0, 0.6], [4, 2, 7, 0.7], [6, 2, 0, 0.86], [8, 2, 0, 0.6], [10, 2, 7, 0.7]],
    oct68: [[0, 6, 0, 0.9], [6, 6, 12, 0.76]],
    arp68b: [[0, 2, 0, 0.9], [2, 2, 7, 0.66], [4, 2, 12, 0.72], [6, 2, 't', 0.8], [8, 2, 12, 0.66], [10, 2, 7, 0.64]],
    gigue: [[0, 4, 0, 0.9], [4, 2, 7, 0.62], [6, 4, 0, 0.84], [10, 2, 'a', 0.64]],
    shuffle128: [[0, 4, 0, 0.9], [4, 2, 0, 0.58], [6, 4, 7, 0.82], [10, 2, 7, 0.58], [12, 4, 9, 0.84], [16, 2, 9, 0.58], [18, 4, 7, 0.8], [22, 2, 7, 0.58]],
    arp128b: [0, 7, 12, 't', 12, 7, 0, 7, 12, 't', 12, 7].map((n, i) => [i * 2, 2, n, i % 3 ? 0.62 : 0.86]),
    gospel128: [[0, 10, 0, 0.88], [10, 2, 7, 0.58], [12, 6, 9, 0.8], [18, 4, 7, 0.74], [22, 2, 'a', 0.66]],
    marche128: [[0, 6, 0, 0.9], [6, 6, 7, 0.74], [12, 6, 12, 0.82], [18, 6, 7, 0.72]],
  };
  /** Dessin d'une mesure type (niveau 0 = fondamentale, 1 = quinte, tierce, septième ou approche, 2 = octave). */
  const rhythmDraw = (id) => BASS_RHYTHMS[id].filter(([o]) => o < motifBar(id)).map(([o, l, n]) => [o, l, n === 0 ? 0 : n === 12 ? 2 : 1]); // première mesure, en pas (fractions possibles)

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
    // procédé B03 de la formation (chapitre 23, § 4), recette de recipeBass
    ['b03', 'Ligne conjointe (B03)', 'La note de l’accord la plus proche : la basse avance par degrés (C – G/B – Am)', [[0, 12, 0], [12, 4, 1]]],
    // nov. 2026 : rythmes de basse par style (BASS_RHYTHMS) et walking
    ['rock8', 'Croches rock', 'Fondamentale en croches, octave sur le dernier « et » : pop-rock', rhythmDraw('rock8')],
    ['ballade', 'Ballade', 'Fondamentale tenue, quinte, puis la note voisine de l’accord suivant', rhythmDraw('ballade')],
    ['pointee', 'Noire pointée', 'Noire pointée, croche, blanche sur la fondamentale : posé, avec un petit élan vers le 3', rhythmDraw('pointee')],
    ['disco16', 'Disco syncopée', 'Octaves avec doubles en fin de temps : disco, nu-disco', rhythmDraw('disco16')],
    ['slap', 'Slap', 'Pouce sur la fondamentale, « pop » à l’octave : funk', rhythmDraw('slap')],
    ['motown', 'Motown', 'Fondamentale, octave, quinte et note d’approche : soul', rhythmDraw('motown')],
    ['walking', 'Walking', 'Une noire par temps, notes de l’accord, puis la note voisine de l’accord suivant : jazz', [[0, 4, 0], [4, 4, 1], [8, 4, 1], [12, 4, 1]]],
    ['boombap', 'Boom bap', 'Notes courtes posées sur le kick : hip-hop', rhythmDraw('boombap')],
    ['sub808', '808 tenue', 'Longue note grave, reprise à l’octave : trap, hip-hop', rhythmDraw('sub808')],
    ['trap808', '808 trap', 'Syncopes 3-3-2 avec octave et quinte : trap', rhythmDraw('trap808')],
    ['reese', 'Reese', 'Une note par demi-mesure, reprise à l’octave : drum & bass', rhythmDraw('reese')],
    ['dnbroll', 'Roller', 'Doubles sur les contretemps du break : drum & bass', rhythmDraw('dnbroll')],
    ['dembow', 'Dembow', 'Fondamentale en 3-3-2, quinte et octave : reggaeton', rhythmDraw('dembow')],
    ['tumbao', 'Tumbao', 'Le « et » du 2 et le 4 annoncent l’accord suivant : salsa', rhythmDraw('tumbao')],
    ['tumbao23', 'Tumbao salsa', 'Mesure = cycle de clave en croches : le « et » du 2 et le 4 jouent l’accord qui arrive, lié', [[0, 3, 0], [3, 3, 1], [6, 5, 0], [11, 3, 1], [14, 2, 0]]],
    ['onedrop', 'One drop', 'Silence sur le 1, la ligne commence après : reggae', rhythmDraw('onedrop')],
    ['shuffle', 'Shuffle', 'Fondamentale qui rebondit en croches, anticipe l’accord suivant : pop de Noël', rhythmDraw('shuffle')],
    ['roots', 'Roots', 'Fondamentale ronde, tierce, quinte et approche, notes fantômes : reggae roots', rhythmDraw('roots')],
    ['bossa', 'Bossa nova', 'Fondamentale et quinte en noire pointée-croche', rhythmDraw('bossa')],
    ['afro', 'Afrobeats', 'Syncopes posées, fondamentale et octave', rhythmDraw('afro')],
    ['acid', 'Acide 303', 'Doubles accentuées, octaves, septième : acid techno', rhythmDraw('acid')],
    // nov. 2026 : basses techno / house de Nicolas
    ['oracle', 'Oracle', 'Doubles autour des kicks, octave et seconde mineure sur le « et », septième : techno', rhythmDraw('oracle')],
    ['troy', 'Troy', 'Grave et octave qui se répondent en doubles : techno', rhythmDraw('troy')],
    ['phalanx', 'Phalanx', 'Octave en doubles, la fondamentale sur le « et », seconde mineure à la fin : techno', rhythmDraw('phalanx')],
    ['necropolis', 'Necropolis', 'Quatre notes sèches, syncopées : techno sombre', rhythmDraw('necropolis')],
    ['styx', 'Styx', 'Fondamentale en doubles qui évitent le kick : techno roulante', rhythmDraw('styx')],
    ['athens', 'Athens', 'Octave en doubles, grave sur le « et », seconde mineure en fin de mesure : techno', rhythmDraw('athens')],
    ['seismic', 'Seismic', 'Contretemps, avec un « a » du 2 qui décale : house', rhythmDraw('seismic')],
    ['hades', 'Hades', 'Une double sur chaque « et », piquée : la basse house (aussi Prometheus, Epoch)', rhythmDraw('hades')],
    ['mythos', 'Mythos', 'Doubles grave, octave sur les « et » des temps 2 à 4 : tech house', rhythmDraw('mythos')],
    ['thebes', 'Thebes', 'Trois doubles après chaque kick, le « et » appuyé : basse roulante', rhythmDraw('thebes')],
    // nov. 2026 : ★ Célèbres (procédés de bassistes connus, notes originales)
    ['cel_chic', 'Octaves new-yorkaises', 'Dans l’esprit de la disco de Bernard Edwards : syncopes, octaves, notes fantômes', rhythmDraw('cel_chic')],
    ['cel_hitsville', 'Hitsville', 'Dans l’esprit de James Jamerson (Motown) : un doigt, approches chromatiques, fantômes', rhythmDraw('cel_hitsville')],
    ['cel_pfunk', 'Le « One »', 'Dans l’esprit de Bootsy Collins (P-Funk) : le 1 énorme, puis de l’espace', rhythmDraw('cel_pfunk')],
    ['cel_thumb', 'Pouce et pop', 'Dans l’esprit de Larry Graham : slap pouce sur le grave, pop à l’octave', rhythmDraw('cel_thumb')],
    ['cel_fretless', 'Fretless chantante', 'Dans l’esprit de Jaco Pastorius : ligne liée, neuvième, tierce aiguë', rhythmDraw('cel_fretless')],
    ['cel_liverpool', 'Mélodique 60s', 'Dans l’esprit de Paul McCartney : une basse qui chante entre les notes de l’accord', rhythmDraw('cel_liverpool')],
    ['cel_studio60', 'Studio 60s', 'Dans l’esprit de Carol Kaye (Wrecking Crew) : pointé, quinte, octave, approche', rhythmDraw('cel_studio60')],
    ['cel_gallop', 'Galop heavy', 'Dans l’esprit de Steve Harris (heavy metal) : croche et deux doubles à chaque temps', rhythmDraw('cel_gallop')],
    ['cel_motorik', 'Motorik', 'Dans l’esprit du krautrock (Neu!, Can) : croches implacables, octave en relance', rhythmDraw('cel_motorik')],
    ['cel_coldwave', 'Cold wave', 'Dans l’esprit de Peter Hook : la mélodie jouée dans l’aigu de la basse', rhythmDraw('cel_coldwave')],
    ['cel_staccato80', 'Pop 80s piquée', 'Dans l’esprit des basses synthé de la pop 80s : doubles courtes, quinte, octave, septième', rhythmDraw('cel_staccato80')],
    ['cel_steppers', 'Steppers', 'Dans l’esprit du reggae steppers (Sly & Robbie) : la fondamentale sur chaque temps, fantômes', rhythmDraw('cel_steppers')],
    ['cel_ska', 'Ska qui marche', 'Dans l’esprit du ska jamaïcain : croches qui montent et descendent l’accord', rhythmDraw('cel_ska')],
    ['cel_boogie', 'Boogie blues', 'Le boogie-woogie : fondamentale, tierce, quinte, sixte, septième, et retour', rhythmDraw('cel_boogie')],
    ['cel_rockabilly', 'Slap contrebasse', 'Dans l’esprit du rockabilly : fondamentale et quinte, clic de la corde sur les contretemps', rhythmDraw('cel_rockabilly')],
    ['cel_lagos', 'Afrobeat 70s', 'Dans l’esprit des orchestres de Fela Kuti : boucle syncopée, septième et octave', rhythmDraw('cel_lagos')],
    ['cel_surdo', 'Samba', 'La basse du surdo : fondamentale, quinte grave appuyée sur le 2 et le 4', rhythmDraw('cel_surdo')],
    ['cel_gfunk', 'G-funk', 'Dans l’esprit du rap West Coast 90s : grave tenu, octave, septième qui glisse', rhythmDraw('cel_gfunk')],
    ['cel_frenchtouch', 'French touch', 'Dans l’esprit de la house filtrée française : contretemps, octave fantôme', rhythmDraw('cel_frenchtouch')],
    ['cel_wobble', 'Wobble', 'Dans l’esprit du dubstep : longue note grave, relances à l’octave et au ton en dessous', rhythmDraw('cel_wobble')],
    ['cel_neosoul', 'Néo-soul', 'Dans l’esprit de Pino Palladino (D’Angelo) : en retard sur le temps, tierce, septième', rhythmDraw('cel_neosoul')],
    // nov. 2026 : motifs courants qui manquaient
    ['anticip', 'Anticipation', 'Croches ; l’accord suivant arrive en avance, sur le « et » du 4 : pop-rock', rhythmDraw('anticip')],
    ['walkup', 'Montée vers l’accord', 'Trois notes conjointes qui mènent à l’accord suivant : pop, soul, country', rhythmDraw('walkup')],
    ['chroma', 'Approche chromatique', 'Le demi-ton sous l’accord suivant, sur le « et » du 4 : soul, gospel', rhythmDraw('chroma')],
    ['boomchick', 'Boom-chick', 'Fondamentale sur 1, quinte grave sur 3, notes courtes : country', rhythmDraw('boomchick')],
    ['chacha', 'Cha-cha-cha', '1, 3, puis « cha-cha » sur 4 et le « et » du 4 : latin', rhythmDraw('chacha')],
    ['cumbia', 'Cumbia', 'Fondamentale sur 1, quinte sur 3, reprise sur le « et » du 4', rhythmDraw('cumbia')],
    ['baiao', 'Baião', 'Fondamentale, quinte sur le « a » du 1 tenue : forró, deux fois par mesure', rhythmDraw('baiao')],
    ['twostep', '2-step', 'Notes décalées autour du 3, octave sur le « a » du 2 : UK garage', rhythmDraw('twostep')],
    ['walkskip', 'Walking avec skip', 'Walking, triolet fantôme sur le 3, demi-ton vers l’accord suivant : jazz', rhythmDraw('walkskip')],
    ['ballade128', 'Ballade 12/8', 'Fondamentale qui berce, croches de triolet : soul lente, doo-wop', rhythmDraw('ballade128')],
    ['montuno', 'Son montuno', 'Tumbao sur deux mesures, calé sur la clave 3-2 : son, salsa', rhythmDraw('montuno')],
    ['drill', 'Drill', '808 syncopée en triolets, glissée vers l’octave et la septième : drill', rhythmDraw('drill')],
    ['amapiano', 'Log drum', 'Notes courtes syncopées, glissées vers la quinte : amapiano', rhythmDraw('amapiano')],
    ['valse', 'Valse', 'Mesure à 3 temps : la fondamentale sur le 1, la quinte grave à la mesure suivante (3/4)', rhythmDraw('valse')],
    ['valsejazz', 'Valse jazz', 'Une noire par temps, le demi-ton vers l’accord suivant (3/4)', rhythmDraw('valsejazz')],
    ['ballade68', 'Ballade 6/8', 'Fondamentale sur le 1, quinte sur le 4, la note voisine de l’accord suivant (6/8)', rhythmDraw('ballade68')],
    ['galop68', 'Galop 6/8', 'Noire-croche sur chaque temps, fondamentale puis quinte (6/8)', rhythmDraw('galop68')],
    ['slow128', 'Slow 12/8', 'Blues lent : fondamentale et quinte sur les temps, la note voisine de l’accord suivant (12/8)', rhythmDraw('slow128')],
    ['boogie128', 'Boogie 12/8', 'Une note de l’accord par temps : fondamentale, tierce, quinte, sixte (12/8)', rhythmDraw('boogie128')],
    ['berce128', 'Ballade 12/8 bercée', 'Fondamentale tenue, petite relance, quinte sur le 3 (12/8)', rhythmDraw('berce128')],
    ['valsepop', 'Valse pop', 'Noire pointée, croche, noire sur la quinte (3/4)', rhythmDraw('valsepop')],
    ['valseavance', 'Valse qui avance', 'Fondamentale, quinte, la note voisine de l’accord suivant (3/4)', rhythmDraw('valseavance')],
    ['valse8', 'Valse en croches', 'Six croches : fondamentale, quinte, octave (3/4)', rhythmDraw('valse8')],
    ['valseped', 'Pédale valse', 'Fondamentale tenue, rebond à l’octave sur le 3 (3/4)', rhythmDraw('valseped')],
    ['tarentelle', 'Tarentelle', 'Six croches qui tournent : fondamentale, fondamentale, quinte (6/8)', rhythmDraw('tarentelle')],
    ['oct68', 'Octave 6/8', 'Fondamentale puis octave, une par temps (6/8)', rhythmDraw('oct68')],
    ['arp68b', 'Arpège 6/8', 'Croches : fondamentale, quinte, octave, tierce, octave, quinte (6/8)', rhythmDraw('arp68b')],
    ['gigue', 'Gigue', 'Noire-croche, noire-croche, approche de l’accord suivant (6/8)', rhythmDraw('gigue')],
    ['shuffle128', 'Shuffle 12/8', 'Longue-courte sur chaque temps : fondamentale, quinte, sixte, quinte (12/8)', rhythmDraw('shuffle128')],
    ['arp128b', 'Arpège 12/8', 'Triolets de croches : fondamentale, quinte, octave, tierce… (12/8)', rhythmDraw('arp128b')],
    ['gospel128', 'Gospel 12/8', 'Fondamentale tenue, sixte, quinte et approche (12/8)', rhythmDraw('gospel128')],
    ['marche128', 'Marche lente', 'Une noire pointée par temps : fondamentale, quinte, octave, quinte (12/8)', rhythmDraw('marche128')],
  ];

  return { build, MODES, ambientCurves, ambientApply, ambientOf, AMB_LEVELS, AMB_MOVES, setMeter, meter, METERS, meterOK, fitMode, backbeats, halfBar, levelStep, levelPer, fitLanes, beatOf: (ts) => (ts && ts[1] === 8 && ts[0] % 3 === 0 && ts[0] > 3 ? 6 : Math.max(1, Math.round(16 / ((ts && ts[1]) || 4)))), voiceChord, bassEvents, chordEvents, PAD_NEW, padFxLanes, tomOfStep, junctionDefaults, junctionEff, withSceneFx, PERC_LOOPS, PERC_STYLES, hpHz, hpAmt, HP_MEL, isExtra, KINDS, DEFAULT_KIND, DEFAULT_MODE, kindOfRole, instIds, checkKind, parseChord, spansOf, spansFromGrid, sceneGrid, SINGERS, NAMES, CHARACTERS, FORMS, LETTERS, RHYTHMS, defaultPlan, fitPlan, BASS_NEW, motifBars, motifBar, METER, ACC_PRESETS, ACC_DEFAULT, ACC_VEL, accentPreset, accentPeriod, normalizeAccents, AUTO_SHAPES, SCENE_AUTO, AUTO_DEF, normalizeAuto, normalizeAutoSpec, newAutoSpec, autoPoints, autoCurve, autoLane, autoAt, autoNorm, autoReal, velMul, BUILD_LEVELS, BUILD_PRESETS, buildLevels, progLevels, rollBar, rollerOf, hasGridLane, laneKey, _rng: rng };
})();
