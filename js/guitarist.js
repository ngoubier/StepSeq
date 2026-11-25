/*
 * Guitariste : le musicien de type « guitar » de l'assistant « Nouvelle chanson » (js/band.js, étape Guitariste).
 * Tables pures, sans DOM (testées par tests/guitarist.test.js).
 *
 * Il joue, scène par scène, un des « jeux » :
 *  - Arpèges : motifs aux doigts ou au médiator du mode Guitare d'Arp One (js/guitar-arp.js), mode « g:<motif> » ;
 *  - Accords : grattages et coups étouffés du même moteur (« g:<motif> »), ou un accord plaqué du moteur de nappe
 *    (strum, pluck, chop, pulse8, sustain : les jeux des guitaristes des inspirations) ;
 *  - Riffs : une mesure en degrés de l'accord (js/guitar-riffs.js), mode « r:<riff> », réglages dans parts…riff.
 * Chaque motif a sa famille (Doigts, Médiator, Grattage, Étouffés, Plaqués) et les styles où il sonne juste (puces de
 * style de l'étape ; celle du style de la chanson est marquée). Les potentiomètres règlent les réglages guitare de la
 * scène (parts[section].inst[id].gtr : ring, mel, thumb, human en 0..1, spread en ms, voir SS.GuitarArp.normalize).
 */
window.SS = window.SS || {};
SS.guitarist = (() => {
  const JEUX = [
    ['arp', 'Arpèges', 'Les cordes une à une : aux doigts ou au médiator'],
    ['acc', 'Accords', 'L’accord en entier : grattages, coups étouffés, accords plaqués'],
    ['riff', 'Riffs', 'Des notes en degrés de l’accord : quintes, octaves, lignes'],
  ];
  const FAMILIES = {
    arp: [['doigts', 'Doigts'], ['mediator', 'Médiator']],
    acc: [['gratte', 'Grattage'], ['etouffe', 'Étouffés'], ['plaque', 'Plaqués']],
    riff: [['quintes', 'Quintes et octaves'], ['lignes', 'Lignes']],
  };
  const RF = () => SS.GuitarRiffs;
  const riffOf = (mode) => (/^r:/.test(mode || '') && RF() ? RF().byId(mode.slice(2)) : null);
  /** Grattages joués étouffés (main droite sur les cordes, skank). */
  const MUTED = ['palm', 'funk', 'reggae', 'roots', 'boomchick', 'disco', 'funkcourt', 'skank2', 'pmdoubles'];
  /** Accords plaqués (modes du moteur de nappe, js/bandsong.js chordEvents) : ceux que jouent les guitaristes des inspirations. */
  const PLAQUES = ['strum', 'pluck', 'chop', 'pulse8', 'sustain'];
  /** Styles des puces (maquette validée le 2026-11-24). */
  const STYLES = [
    ['pop', 'Pop'], ['rock', 'Rock'], ['folk', 'Folk'], ['ballade', 'Ballade'], ['funk', 'Funk'],
    ['reggae', 'Reggae'], ['blues', 'Blues'], ['bossa', 'Bossa'], ['synth', 'Synthwave'],
  ];
  /** Style de la chanson (SS.Band.STYLES) → puce de départ ; les autres partent sur « Tous ». */
  const STYLE_OF = { synthwave: 'synth', edm: 'synth', techno: 'synth', dnb: 'synth', pop: 'pop', funk: 'funk', latin: 'reggae', soul: 'blues', ambient: 'ballade', hiphop: 'ballade' };
  const styleOfSong = (styleId) => STYLE_OF[styleId] || 'all';
  /** Carte Motif commune (js/motifpicker.js) : étiquette → style commun, et les puces propres au Guitariste. */
  const TAG_STYLE = { rock: 'pop', ballade: 'pop', folk: 'pop', blues: 'soul', reggae: 'latin', bossa: 'latin' };
  const CHIPS = [['folk', 'Folk'], ['blues', 'Blues'], ['bossa', 'Bossa']];
  /** Styles de chaque motif (id du motif guitare ou du mode plaqué). */
  const MOTIF_STYLES = {
    classA: ['pop', 'ballade', 'folk'],
    travis: ['folk', 'pop', 'blues'],
    pop16: ['pop', 'ballade', 'synth'],
    pince: ['folk', 'ballade', 'bossa'],
    bossa: ['bossa'],
    pimami: ['ballade', 'folk'],
    valse: ['folk', 'ballade'],
    vpince: ['folk', 'ballade'],
    celtique: ['folk'],
    bpince: ['ballade', 'folk'],
    slowpim: ['ballade', 'blues'],
    arp128: ['ballade', 'blues'],
    cross: ['synth', 'pop', 'rock', 'funk'],
    aller: ['rock', 'pop', 'synth'],
    sweep: ['rock', 'synth'],
    hybrid: ['pop', 'folk', 'blues'],
    pop: ['pop', 'folk'],
    rock: ['rock', 'pop', 'blues'],
    ballade: ['ballade', 'pop', 'folk'],
    folk68: ['folk', 'ballade'],
    gvalse: ['folk', 'ballade'],
    rock68: ['rock', 'ballade'],
    gslow: ['ballade', 'blues'],
    shuffle128: ['blues', 'rock'],
    palm: ['rock', 'synth', 'pop'],
    funk: ['funk'],
    reggae: ['reggae'],
    roots: ['reggae'],
    strum: ['pop', 'folk', 'rock'],
    pluck: ['pop', 'ballade', 'synth', 'bossa'],
    chop: ['funk', 'synth', 'reggae'],
    pulse8: ['synth', 'rock', 'pop'],
    sustain: ['ballade', 'synth', 'rock'],
    roll: ['folk', 'pop'],
    douce: ['ballade', 'pop'],
    baspince: ['blues', 'folk', 'ballade'],
    partido: ['bossa'],
    funk16: ['funk', 'reggae'],
    bubble: ['reggae', 'funk'],
    pedale: ['synth', 'pop', 'rock'],
    folk16: ['folk', 'pop'],
    boomchick: ['folk', 'blues'],
    shuf: ['blues', 'rock'],
    deuxquatre: ['blues', 'ballade'],
    ballade2: ['ballade', 'folk'],
    disco: ['funk', 'pop'],
    funkcourt: ['funk'],
    skank2: ['reggae'],
    batida: ['bossa'],
    bossalente: ['bossa', 'ballade'],
    pmdoubles: ['synth', 'rock'],
  };
  const motifOf = (mode) => (/^g:/.test(mode || '') && SS.GuitarArp ? SS.GuitarArp.MOTIFS.find((m) => m.id === mode.slice(2)) || null : null);
  /** Famille d'un mode : doigts | mediator | gratte | etouffe | plaque. */
  function familyOf(mode) {
    const rf = riffOf(mode);
    if (rf) return rf.fam;
    const m = motifOf(mode);
    if (!m) return 'plaque';
    if (m.hand === 'gratte') return MUTED.includes(m.id) ? 'etouffe' : 'gratte';
    return m.hand;
  }
  /** Jeu d'un mode : arp (doigts, médiator) ou acc (le reste, accords plaqués compris). */
  const jeuOf = (mode) => (riffOf(mode) ? 'riff' : ['doigts', 'mediator'].includes(familyOf(mode)) ? 'arp' : 'acc');
  const idOf = (mode) => String(mode || '').replace(/^[gr]:/, '');
  const stylesOf = (mode) => (riffOf(mode) ? RF().STYLES[idOf(mode)] || [] : MOTIF_STYLES[idOf(mode)] || []);
  /** Le mode convient-il à la puce de style (« all » : tous) ? */
  const inStyle = (mode, style) => (SS.motifPicker ? SS.motifPicker.matches(stylesOf(mode), style, TAG_STYLE) : !style || style === 'all' || stylesOf(mode).includes(style));
  /** Tous les modes d'un jeu, dans l'ordre des familles : « g:<motif> » puis les accords plaqués. */
  function modesOf(jeu) {
    if (jeu === 'riff') return RF() ? FAMILIES.riff.flatMap(([f]) => RF().RIFFS.filter((x) => x.fam === f).map((x) => 'r:' + x.id)) : [];
    const g = SS.GuitarArp ? SS.GuitarArp.MOTIFS.map((m) => 'g:' + m.id) : [];
    return FAMILIES[jeu].flatMap(([f]) => (f === 'plaque' ? PLAQUES : g.filter((id) => familyOf(id) === f)));
  }
  /** Premier mode d'un jeu pour un style (en gardant ceux qu'accepte ok, la mesure de la chanson). */
  function firstOf(jeu, style, ok = () => true) {
    const l = modesOf(jeu).filter(ok);
    return l.find((id) => inStyle(id, style)) || l[0] || null;
  }
  /** Mode tiré au hasard parmi ceux du jeu et du style (r : 0..1), différent de cur si possible. */
  function surprise(jeu, style, cur, r, ok = () => true) {
    const l = modesOf(jeu).filter((id) => ok(id) && inStyle(id, style));
    const pool = l.length > 1 ? l.filter((id) => id !== cur) : l.length ? l : modesOf(jeu).filter(ok);
    return pool.length ? pool[Math.min(pool.length - 1, Math.floor(r * pool.length))] : null;
  }
  /** Potentiomètres de chaque jeu : [clé gtr, nom, aide, texte(v 0..100)]. Étalement : 0..40 ms affiché en 0..100. */
  const HUM = (v) => (v < 15 ? 'machine' : v < 60 ? 'naturel' : 'relâché');
  const KNOBS = {
    arp: [
      ['ring', 'Résonance', 'Une corde rejouée coupe sa note ; au changement d’accord, tout s’arrête.', (v) => (v < 30 ? 'sec' : v < 70 ? 'les cordes sonnent' : 'tout se mélange')],
      ['mel', 'Mélodie en avant', 'La note la plus aiguë du motif plus forte, les autres aigus plus légers.', (v) => (v < 20 ? 'égal' : 'mi aigu devant')],
      ['thumb', 'Pouce accentué', 'Les basses plus fortes que les doigts.', (v) => (v < 20 ? 'léger' : 'basse appuyée')],
      ['human', 'Main humaine', 'Placement et force varient un peu ; les basses sur les temps ne bougent pas.', HUM],
    ],
    acc: [
      ['spread', 'Étalement', 'Temps entre deux cordes d’un même coup de grattage.', (v) => (v < 15 ? 'plaqué net' : v < 60 ? 'grattage' : 'large et lent')],
      ['ring', 'Résonance', 'Combien de temps les cordes sonnent entre deux coups.', (v) => (v < 30 ? 'sec' : v < 70 ? 'sonne' : 'long')],
      ['thumb', 'Basse appuyée', 'La corde grave de chaque coup plus forte.', (v) => (v < 20 ? 'légère' : 'appuyée')],
      ['human', 'Main humaine', 'Placement et force varient un peu.', HUM],
    ],
    riff: [
      ['mute', 'Étouffé', 'Palm mute : la paume étouffe les cordes, de léger à complet.', (v) => (v < 20 ? 'ouvert' : v < 70 ? 'palm mute léger' : 'tout étouffé')],
      ['swing', 'Swing', 'Retarde les contretemps : droit, léger, shuffle.', (v) => (v < 10 ? 'droit' : v < 45 ? 'léger' : 'shuffle')],
      ['energy', 'Énergie', 'La force des notes.', (v) => (v < 35 ? 'doux' : v < 70 ? 'franc' : 'appuyé')],
      ['human', 'Main humaine', 'Placement et force varient un peu ; les temps ne bougent pas.', HUM],
    ],
  };
  /** Où vont les réglages des potentiomètres : parts…gtr (moteur de guitare) ou parts…riff. */
  const knobStore = (jeu) => (jeu === 'riff' ? 'riff' : 'gtr');
  /** Valeur 0..100 d'un potentiomètre à partir des réglages guitare normalisés. */
  const knobValue = (g, key) => Math.round(key === 'spread' ? (g.spread / 40) * 100 : (g[key] || 0) * 100);
  /** Réglage guitare d'un potentiomètre (v 0..100). */
  const knobPatch = (key, v) => ({ [key]: key === 'spread' ? Math.round((Math.max(0, Math.min(100, v)) / 100) * 40) : Math.max(0, Math.min(100, v)) / 100 });

  return { JEUX, FAMILIES, MUTED, PLAQUES, STYLES, STYLE_OF, styleOfSong, TAG_STYLE, CHIPS, MOTIF_STYLES, familyOf, jeuOf, stylesOf, inStyle, modesOf, firstOf, surprise, KNOBS, knobStore, knobValue, knobPatch };
})();
