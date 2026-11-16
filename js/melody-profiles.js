/*
 * Profils mélodiques par émotion : comment une mélodie peut servir l'intention d'une scène.
 *
 * Sources : l'« appui à essayer » du guide MusicEmotion (docs/reference/musicemotion-guide.md, chap. 6 à 8), la méthode
 * mélodique et les transformations du motif de la formation (docs/reference/formation-composition/05_…, 13_…, 23_…).
 * Ce sont des POINTS DE DÉPART RÉGLABLES : la même émotion peut appeler plusieurs réalisations ; l'écoute tranche.
 *
 * Un profil a deux parties :
 *   - six AXES d'intention (0–100, formation chap. 13) : calme/agité, stable/incertain, intime/ample, sombre/lumineux,
 *     retenu/exubérant, régulier/flottant. Ils donnent les réglages continus : notes par mesure, ambitus, registre,
 *     goût pour les sauts, rythme, nombre d'ornements ;
 *   - des CHOIX : contour de la phrase, note visée sur les appuis, fin, ornements permis, transformation du motif à la
 *     reprise, motif de départ et caractère conseillé pour Band.
 * SS.resolveMelodyProfile() combine les deux (et les retouches de l'utilisateur) en réglages pour js/melody.js et
 * js/bandsong.js.
 */
window.SS = window.SS || {};

/** Les six axes : `main` = visibles d'emblée, les autres sont dans « Réglages fins ». */
SS.MELODY_AXES = [
  { id: 'energy', left: 'Calme', right: 'Agité', main: true },
  { id: 'light', left: 'Sombre', right: 'Lumineux', main: true },
  { id: 'space', left: 'Intime', right: 'Ample', main: true },
  { id: 'stability', left: 'Stable', right: 'Incertain' },
  { id: 'drive', left: 'Retenu', right: 'Exubérant' },
  { id: 'flow', left: 'Régulier', right: 'Flottant' },
];

SS.MELODY_CONTOURS = {
  arch: { label: 'Arche', path: 'M6 28 Q 48 -6 90 28' },
  rise: { label: 'Montée', path: 'M6 30 L 30 24 L 52 22 L 72 12 L 90 6' },
  fall: { label: 'Descente', path: 'M6 6 L 30 12 L 52 14 L 72 22 L 90 28' },
  plateau: { label: 'Plateau', path: 'M6 20 L 30 16 L 52 18 L 72 16 L 90 18' },
  wave: { label: 'Vagues', path: 'M6 20 Q 20 6 34 18 T 62 18 T 90 16' },
};
SS.MELODY_TARGETS = {
  root: 'Fondamentale',
  third: 'Tierce',
  fifth: 'Quinte',
  color: 'Couleur du mode',
  pivot: 'Note pivot',
};
SS.MELODY_ENDINGS = { closed: 'Fermée (tonique)', open: 'Ouverte', suspended: 'Suspendue' };
SS.MELODY_ORNAMENTS = {
  passing: { label: 'Note de passage', ex: 'E – F – G sur C' },
  neighbor: { label: 'Broderie', ex: 'E – F – E sur C' },
  suspension: { label: 'Retard', ex: 'note tenue sur le changement d’accord, puis résolue' },
  appoggiatura: { label: 'Appoggiature', ex: 'A attaqué sur G, puis G' },
  anticipation: { label: 'Anticipation', ex: 'la note du prochain accord arrive avant lui' },
};
/** Transformations du motif à la reprise (formation, chap. 05) : une seule par reprise. */
SS.MELODY_REPEATS = {
  varied: 'Répétition variée (fin changée)',
  sequence: 'Séquence, une tierce plus haut',
  register: 'Changement de registre (octave)',
  invert: 'Renversement du contour',
  augment: 'Augmentation (moins de notes, plus longues)',
  diminish: 'Diminution (plus de notes, plus courtes)',
  fragment: 'Fragmentation (début du motif repris)',
  shift: 'Décalage d’une croche',
};
/** Motifs de départ (formation, chap. 23, M01–M04). */
SS.MELODY_MOTIFS = {
  auto: { label: 'Auto', text: 'le motif naît du rythme et du contour' },
  arch: { label: 'Arche', text: '1 – 3 – 5 – 3 de l’accord en noires (M01)' },
  call: { label: 'Appel et retenue', text: 'deux notes conjointes puis une tenue plus basse (M02)' },
  repeat: { label: 'Note répétée', text: 'une note répétée puis un saut vers le haut (M03)' },
  common: { label: 'Note commune', text: 'la note pivot tenue d’un accord à l’autre (M04)' },
};

/**
 * Profils des 15 émotions de js/emotions.js. axes : [energy, light, space, stability, drive, flow].
 * character : caractère de mélodie conseillé dans Band (js/bandsong.js, CHARACTERS).
 * colorIv : couleur préférée (demi-tons au-dessus de la tonique) quand la note visée est « couleur du mode » : la sixte
 *   majeure de l'espoir (guide : F♯ sur D en La), la quarte augmentée de l'émerveillement… Elle n'est retenue que si elle
 *   appartient à la tonalité de la scène ; sinon la note caractéristique du mode (SS.modeColorPc).
 */
// prettier-ignore
SS.MELODY_PROFILES = {
  joie:           { name: 'Arche claire', axes: [60, 80, 45, 25, 55, 25], contour: 'arch', target: 'third', ending: 'closed', ornaments: ['passing', 'anticipation'], repeat: 'varied', motif: 'arch', character: 'hook' },
  euphorie:       { name: 'Élan en séquences', axes: [85, 85, 80, 30, 75, 30], contour: 'rise', target: 'fifth', ending: 'closed', ornaments: ['anticipation'], repeat: 'sequence', motif: 'repeat', character: 'hook' },
  tristesse:      { name: 'Descente lente', axes: [25, 20, 25, 45, 25, 55], contour: 'fall', target: 'fifth', ending: 'closed', ornaments: ['suspension', 'appoggiatura'], repeat: 'augment', motif: 'auto', character: 'chant' },
  nostalgie:      { name: 'Vagues et souvenir', axes: [45, 45, 45, 45, 40, 45], contour: 'wave', target: 'third', ending: 'open', ornaments: ['neighbor', 'suspension'], repeat: 'varied', motif: 'common', character: 'chant' },
  melancolie:     { name: 'Lueur modale', axes: [45, 55, 45, 40, 40, 50], contour: 'wave', target: 'color', colorIv: 9, ending: 'closed', ornaments: ['neighbor'], repeat: 'shift', motif: 'auto', character: 'chant' },
  espoir:         { name: 'Montée retenue', axes: [50, 70, 50, 40, 50, 35], contour: 'rise', target: 'color', colorIv: 9, ending: 'open', ornaments: ['appoggiatura', 'passing'], repeat: 'sequence', motif: 'arch', character: 'lyric' },
  emerveillement: { name: 'Suspension lumineuse', axes: [20, 85, 75, 55, 30, 80], contour: 'plateau', target: 'color', colorIv: 6, ending: 'open', ornaments: ['anticipation'], repeat: 'register', motif: 'auto', character: 'float' },
  suspense:       { name: 'Attente tenue', axes: [20, 35, 25, 85, 25, 60], contour: 'plateau', target: 'pivot', ending: 'suspended', ornaments: ['suspension'], repeat: 'fragment', motif: 'common', character: 'float' },
  angoisse:       { name: 'Fragments serrés', axes: [70, 10, 25, 90, 60, 70], contour: 'fall', target: 'color', colorIv: 1, ending: 'suspended', ornaments: ['neighbor'], repeat: 'fragment', motif: 'repeat', character: 'riff' },
  mystere:        { name: 'Note pivot', axes: [30, 40, 25, 70, 30, 65], contour: 'plateau', target: 'pivot', ending: 'open', ornaments: [], repeat: 'varied', motif: 'common', character: 'float' },
  serenite:       { name: 'Descente apaisée', axes: [10, 65, 25, 15, 15, 70], contour: 'fall', target: 'fifth', ending: 'closed', ornaments: [], repeat: 'augment', motif: 'auto', character: 'float' },
  tendresse:      { name: 'Arche douce', axes: [30, 70, 35, 25, 30, 45], contour: 'arch', target: 'pivot', ending: 'closed', ornaments: ['suspension'], repeat: 'varied', motif: 'common', character: 'chant' },
  triomphe:       { name: 'Grande arche', axes: [70, 80, 85, 25, 80, 25], contour: 'arch', target: 'root', ending: 'closed', ornaments: ['appoggiatura'], repeat: 'register', motif: 'arch', character: 'lyric' },
  ambivalence:    { name: 'Autour de la quinte', axes: [45, 50, 45, 60, 40, 45], contour: 'wave', target: 'fifth', ending: 'open', ornaments: ['neighbor'], repeat: 'varied', motif: 'auto', character: 'chant' },
  beaute:         { name: 'Arche inquiète', axes: [40, 45, 50, 55, 50, 45], contour: 'arch', target: 'third', ending: 'closed', ornaments: ['appoggiatura'], repeat: 'varied', motif: 'call', character: 'lyric' },
};
/** Profil neutre, quand la scène n'a pas d'émotion. */
SS.MELODY_NEUTRAL = { name: 'Neutre', axes: [50, 50, 50, 40, 45, 40], contour: 'arch', target: 'third', ending: 'closed', ornaments: [], repeat: 'varied', motif: 'auto', character: 'inspiration' };

SS.melodyProfileOf = (emoId) => SS.MELODY_PROFILES[emoId] || null;

/** Les axes d'un profil sous forme d'objet { energy, light, … }. */
SS.melodyAxesOf = (p) => Object.fromEntries(SS.MELODY_AXES.map((a, i) => [a.id, p.axes[i]]));

/**
 * Réglages concrets d'un profil, avec les retouches `over` ({ axes: {…}, contour, target, ending, ornaments, repeat,
 * motif }) et la tonalité `key` (pour la couleur du mode).
 * → { id, name, emotion, axes, contour, target, ending, ornaments, repeat, motif, character,
 *     density (notes par mesure, moyenne), densityRange [min, max], ambitus (demi-tons), center (0–1 dans la tessiture),
 *     leap (0–1), style ('simple'|'varie'|'dense'), ornamentRate (ornements par phrase), stability (0–1), colorPc }
 */
SS.resolveMelodyProfile = (emoId, over = {}, key = null) => {
  const base = SS.MELODY_PROFILES[emoId] || SS.MELODY_NEUTRAL;
  const axes = { ...SS.melodyAxesOf(base), ...(over.axes || {}) };
  const t = (id) => Math.max(0, Math.min(100, +axes[id])) / 100;
  // calme → 1 note par mesure, agité → 7 ; un rythme flottant allonge les notes
  const density = Math.max(2, Math.round((1 + t('energy') * 6 - t('flow') * 0.8) * 2) / 2);
  const densityRange = [Math.max(1, Math.round(density - 1)), Math.round(density + 1)];
  // intime → une quinte, ample → plus d'une octave et demie
  const ambitus = Math.round(7 + t('space') * 12);
  // sombre → grave, lumineux → aigu (centre de la tessiture, 0–1)
  const center = 0.32 + t('light') * 0.36;
  const style = t('energy') > 0.72 ? 'dense' : t('flow') > 0.55 || t('drive') > 0.65 ? 'varie' : 'simple';
  const ornaments = over.ornaments || base.ornaments;
  let target = over.target || base.target;
  let colorPc = key ? SS.modeColorPc(key, base.colorIv) : null;
  let fallback = null;
  // couleur préférée absente de la tonalité (sixte majeure de l'espoir dans une scène en mineur naturel) : plutôt que la
  // couleur inverse (sixte mineure), la note visée devient la tierce
  if (target === 'color' && key && base.colorIv != null && SS.harmony && SS.harmony.valid(key)) {
    const sc = SS.harmony.scale(key);
    const want = (sc[0].pc + base.colorIv) % 12;
    if (!sc.some((d) => d.pc === want)) {
      const IV = { 1: 'seconde mineure', 6: 'quarte augmentée', 9: 'sixte majeure' };
      fallback = `La ${IV[base.colorIv] || 'couleur voulue'} (${SS.harmony.spell(key, want)}) n’est pas dans ${SS.harmony.label(key)} : la note visée devient la tierce. Un mode qui la contient (dorien, lydien…) la ferait entendre.`;
      target = 'third';
      colorPc = null;
    }
  }
  return {
    id: emoId || null,
    name: base.name,
    emotion: emoId && SS.findEmotion ? (SS.findEmotion(emoId) || {}).label || null : null,
    axes,
    contour: over.contour || base.contour,
    target,
    fallback,
    ending: over.ending || base.ending,
    ornaments,
    repeat: over.repeat || base.repeat,
    motif: over.motif || base.motif,
    character: base.character,
    density,
    densityRange,
    ambitus,
    center,
    leap: t('drive'),
    style,
    ornamentRate: ornaments.length ? (t('drive') > 0.6 ? 2 : 1) : 0,
    stability: t('stability'),
    colorPc,
  };
};

/**
 * Note caractéristique d'une tonalité (classe de hauteur) : la couleur du mode (sixte majeure du dorien, quarte
 * augmentée du lydien…), la sensible du mineur harmonique, la sixte mineure du mineur naturel, la tierce du majeur.
 */
SS.modeColorPc = (key, prefIv = null) => {
  const H = SS.harmony;
  if (!H || !H.valid(key)) return null;
  const sc = H.scale(key);
  if (prefIv != null) {
    const pc = (sc[0].pc + prefIv) % 12;
    if (sc.some((d) => d.pc === pc)) return pc;
  }
  const m = H.MODES.find((x) => x.id === key.mode);
  if (m.color != null) return sc[m.color].pc;
  if (key.mode === 'harmonic') return sc[6].pc;
  if (key.mode === 'minor') return sc[5].pc;
  return sc[2].pc;
};

/** Réglages lisibles d'un profil résolu (bandeau Intention, carte de l'onglet Ambiance). */
SS.melodyProfileSummary = (p) => [
  { k: 'Contour', v: (SS.MELODY_CONTOURS[p.contour] || {}).label.toLowerCase() },
  { k: 'Ambitus', v: p.ambitus <= 8 ? 'une quinte ou une sixte' : p.ambitus <= 13 ? 'environ une octave' : 'plus d’une octave' },
  { k: 'Cible', v: SS.MELODY_TARGETS[p.target].toLowerCase() },
  { k: 'Notes / mesure', v: `${p.densityRange[0]} à ${p.densityRange[1]}` },
  { k: 'Fin', v: SS.MELODY_ENDINGS[p.ending].replace(/ \(.*\)$/, '').toLowerCase() },
  { k: 'Reprise', v: SS.MELODY_REPEATS[p.repeat].replace(/ \(.*\)$/, '').toLowerCase() },
];

/** Contour du profil en tracé SVG (viewBox 0 0 96 34). */
SS.melodyContourPath = (contour) => (SS.MELODY_CONTOURS[contour] || SS.MELODY_CONTOURS.arch).path;

/**
 * « Variante B » : le même profil avec UN seul levier changé (contour, puis fin, puis note visée, puis reprise, selon
 * le tour `n`). → { over, text }
 */
SS.melodyVariantB = (p, over = {}, n = 0) => {
  const order = ['contour', 'ending', 'target', 'repeat'];
  const lever = order[n % order.length];
  const alts = {
    contour: { arch: 'rise', rise: 'arch', fall: 'arch', plateau: 'wave', wave: 'arch' },
    ending: { closed: 'open', open: 'closed', suspended: 'closed' },
    target: { root: 'third', third: 'fifth', fifth: 'third', color: 'third', pivot: 'third' },
    repeat: { varied: 'sequence', sequence: 'varied', register: 'varied', invert: 'varied', augment: 'varied', diminish: 'varied', fragment: 'varied', shift: 'varied' },
  };
  const value = alts[lever][p[lever]];
  const names = { contour: SS.MELODY_CONTOURS, ending: SS.MELODY_ENDINGS, target: SS.MELODY_TARGETS, repeat: SS.MELODY_REPEATS };
  const nm = (v) => (typeof names[lever][v] === 'string' ? names[lever][v] : names[lever][v].label).toLowerCase();
  const label = { contour: 'contour', ending: 'fin', target: 'note visée', repeat: 'reprise du motif' }[lever];
  return { over: { ...over, [lever]: value }, lever, text: `${label} : ${nm(value)} au lieu de ${nm(p[lever])}` };
};
