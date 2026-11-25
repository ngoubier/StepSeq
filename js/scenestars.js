/*
 * Motifs conseillés (★) par type de scène pour la Basse, la Nappe, le Guitariste et l'Arpège (maquette « présentation
 * des motifs » validée le 2026-11-25, décision B) : chaque scène reçoit ses ★ selon son type (intro, couplet, montée,
 * refrain, pont, fin), pris dans le style de la chanson et la mesure ; un musicien ajouté joue d'office le premier
 * (« auto »), un musicien venu de l'inspiration garde son jeu. Le Clavier, les Cuivres, l'Orchestre et la Batterie ont
 * leurs propres ★ (js/keyboardist.js, js/horns.js, js/orchjeux.js, étape Batterie de js/band.js).
 *
 *   kindOf(sec)                       type de scène d'après son nom
 *   pick(ids, familyOf, prefs, n)     n motifs pris tour à tour dans les familles préférées, dans l'ordre du catalogue
 *   stars(kind, sec, ids, familyOf)   ★ d'une scène parmi ids (bass | chords | guitar | arp)
 *   candidates(kind, style, o)        motifs du style de la chanson pour ce musicien (catalogues chargés à l'appel)
 *   sceneDefault(kind, sec, style, o) le premier ★, motif joué d'office par un musicien ajouté (null : aucun)
 *
 * Fonctions pures, sans DOM : tests/scenestars.test.js. Les catalogues (SS.bassMotifs, SS.padMotifs, SS.guitarist) sont
 * lus au moment de l'appel ; absents, il n'y a pas de ★ et le plan joue.
 */
window.SS = window.SS || {};

SS.sceneStars = (() => {
  /** Type de scène d'après son nom (comme js/keyboardist.js et js/horns.js) : intro, verse, pre, chorus, bridge, outro. */
  function kindOf(sec) {
    const s = String(sec || '').toLowerCase();
    if (/^(pre|build|mont)/.test(s)) return 'pre';
    if (/^intro/.test(s)) return 'intro';
    if (/^(verse|couplet)/.test(s)) return 'verse';
    if (/^(bridge|break|solo|pont)/.test(s)) return 'bridge';
    if (/^(outro|fin|coda)/.test(s)) return 'outro';
    return 'chorus';
  }
  /**
   * Familles préférées par type de scène (l'Arpège n'a pas de familles : ses modes eux-mêmes). Intro et fin tiennent,
   * le couplet avance sans prendre trop de place, la montée pousse, le refrain syncope ou gratte, le pont respire.
   */
  const PREFS = {
    bass: { intro: ['tenue', 'ligne'], verse: ['regul', 'ligne', 'synco'], pre: ['regul', 'synco'], chorus: ['synco', 'regul'], bridge: ['ligne', 'tenue'], outro: ['tenue', 'regul'] },
    chords: { intro: ['tenue', 'mouv'], verse: ['tenue', 'rythme'], pre: ['mouv', 'rythme'], chorus: ['rythme', 'tenue'], bridge: ['mouv', 'tenue'], outro: ['tenue', 'mouv'] },
    guitar: {
      intro: ['doigts', 'plaque', 'quintes'],
      verse: ['doigts', 'etouffe', 'lignes'],
      pre: ['mediator', 'gratte', 'quintes'],
      chorus: ['gratte', 'etouffe', 'mediator', 'quintes'],
      bridge: ['doigts', 'plaque', 'lignes'],
      outro: ['plaque', 'doigts', 'quintes'],
    },
    arp: {
      intro: ['bells', 'up8', 'toll', 'wave6', 'alb3'],
      verse: ['up8', 'dotted', 'pluck16', 'tri8', 'alb3'],
      pre: ['rise', 'up16', 'updown16', 'wave6', 'tri8'],
      chorus: ['up16', 'updown16', 'ost16', 'strobe', 'tri8', 'wave6'],
      bridge: ['toll', 'bells', 'dotted', 'alb3'],
      outro: ['toll', 'up8', 'bells', 'wave6'],
    },
  };
  /** n motifs : le premier de chaque famille préférée, puis le deuxième…, sans doublon. familyOf absent : id = famille. */
  function pick(ids, familyOf, prefs, n = 3) {
    const lists = (prefs || []).map((f) => ids.filter((id) => (familyOf ? familyOf(id) : id) === f));
    const out = [];
    for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) lists.forEach((l) => l[i] && out.length < n && !out.includes(l[i]) && out.push(l[i]));
    return out;
  }
  const stars = (kind, sec, ids, familyOf) => (PREFS[kind] ? pick(ids, kind === 'arp' ? null : familyOf, PREFS[kind][kindOf(sec)]) : []);
  /** Modes de l'Arpège qui peuvent être conseillés (moteur js/bandsong.js). */
  const ARP_IDS = [...new Set(Object.values(PREFS.arp).flat())];
  /**
   * Motifs du style de la chanson pour un musicien → { ids, familyOf }. o = { ok(id) (mesure), spb (16 en 4/4 :
   * hors 4/4, les motifs de la mesure), jeu (Guitariste : arp | acc | riff) }.
   */
  function candidates(kind, style, { ok = () => true, spb = 16, jeu = 'acc' } = {}) {
    const MP = SS.motifPicker;
    const common = MP ? MP.styleOfSong(style) : 'all';
    if (kind === 'bass' || kind === 'chords') {
      const L = kind === 'bass' ? SS.bassMotifs : SS.padMotifs;
      if (!L) return { ids: [], familyOf: null };
      const g = spb !== 16 ? 'ternary' : L.groupOfStyle(style);
      let ids = L.inGroup(g).filter(ok);
      if (!ids.length) ids = L.inGroup('all').filter(ok);
      return { ids, familyOf: L.familyOf };
    }
    if (kind === 'guitar') {
      const G = SS.guitarist;
      if (!G) return { ids: [], familyOf: null };
      const all = G.modesOf(jeu).filter(ok);
      const ids = common === 'all' ? all : all.filter((id) => G.inStyle(id, common));
      return { ids: ids.length ? ids : all, familyOf: G.familyOf };
    }
    if (kind === 'arp') return { ids: ARP_IDS.filter(ok), familyOf: null };
    return { ids: [], familyOf: null };
  }
  /** ★ d'une scène dans le style de la chanson. */
  const sceneStars = (kind, sec, style, o) => {
    const c = candidates(kind, style, o);
    return stars(kind, sec, c.ids, c.familyOf);
  };
  /** Motif joué d'office par un musicien ajouté : le premier ★ de la scène (null : aucun, le plan ou le défaut joue). */
  const sceneDefault = (kind, sec, style, o) => sceneStars(kind, sec, style, o)[0] || null;
  /** Style de la chanson d'après son modèle (SS.Band.STYLES) ; null si le modèle n'est pas connu. */
  function styleOfPreset(presetId) {
    const B = SS.Band;
    const st = B && B.STYLES && B.STYLES.find((x) => (x.presets || []).some((p) => p.id === presetId));
    return st ? st.id : null;
  }

  return { kindOf, PREFS, ARP_IDS, pick, stars, candidates, sceneStars, sceneDefault, styleOfPreset };
})();
