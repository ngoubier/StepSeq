/*
 * Mode Guitare d'Arp One : arpèges joués comme sur une vraie guitare (moteur pur, sans DOM ni Web Audio).
 *
 * Quand track.arp.guitar.on est vrai, SS.Arp.renderStep passe la main à SS.GuitarArp.renderStep :
 *   1. l'accord de la piste devient une FORME sur le manche (accordage standard E2 A2 D3 G3 B3 E4) :
 *      forme ouverte quand elle existe (éventuellement avec capodastre), sinon barré sur la 6e ou la 5e corde ;
 *   2. le motif est écrit en CORDES, pas en notes : B = corde de basse (la fondamentale la plus grave),
 *      A = basse alternée, B1…B4 = cordes au-dessus de la basse, 1…4 = cordes aiguës (1 = mi aigu) ;
 *      « B+1 » = deux cordes pincées ensemble ; « . » = silence ;
 *   3. chaque corde RÉSONNE jusqu'à ce qu'elle soit rejouée ou que l'accord change, bornée par le réglage
 *      Résonance (détaché → basse ≈ 700 ms, aigus ≈ 500 ms → tout sonne) ;
 *   4. jeu : pouce accentué, mélodie en avant (la corde la plus aiguë du motif), main humaine (placement
 *      et force, les basses posées sur les temps ne bougent jamais) ;
 *   5. grattage : D/U coups vers le bas / le haut (toutes les cordes, ou les 4 aiguës vers le haut), d/u plus légers,
 *      x étouffé, c coup court sur les aiguës (skank), P palm mute sur les 3 cordes graves ; les cordes d'un coup
 *      sont étalées (12 ms par défaut : 0, 12, 24, 36 ms) ;
 *   6. basse imposée de la piste Accords (ev.bass, C/E) : le mi grave est ajouté sous la forme quand il est à portée ;
 *   7. accordages : standard, Drop D, DADGAD, Open G (formes cherchées sur le manche hors accordage standard).
 *
 * Déterministe : même accord, mêmes réglages, même graine, même passage → mêmes notes (tests/guitar-arp.test.js).
 * Valeurs de départ (résonance, vélocités, décalages de +8 / −5 ms, motifs A, B, C) : document
 * « Arpèges de guitare » de Nicolas, nov. 2026.
 */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  /** Cordes à vide, de la 6e (grave) à la 1re (aiguë) : index 0 … 5. */
  const OPEN = [40, 45, 50, 55, 59, 64];
  const TUNINGS = [
    { id: 'standard', label: 'Standard', notes: OPEN, hint: 'E2 A2 D3 G3 B3 E4' },
    { id: 'dropD', label: 'Drop D', notes: [38, 45, 50, 55, 59, 64], hint: 'D2 A2 D3 G3 B3 E4 : la 6e corde descend d’un ton' },
    { id: 'dadgad', label: 'DADGAD', notes: [38, 45, 50, 55, 57, 62], hint: 'D2 A2 D3 G3 A3 D4 : folk celtique, cordes à vide qui résonnent' },
    { id: 'openG', label: 'Open G', notes: [38, 43, 50, 55, 59, 62], hint: 'D2 G2 D3 G3 B3 D4 : sol majeur à vide, blues et slide' },
  ];
  const openOf = (g) => (TUNINGS.find((t) => t.id === g.tuning) || TUNINGS[0]).notes;
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const x = null; // corde non jouée

  // formes ouvertes : frettes de la 6e à la 1re corde
  const OPEN_SHAPES = {
    'C:maj': [x, 3, 2, 0, 1, 0], 'C:7': [x, 3, 2, 3, 1, 0], 'C:maj7': [x, 3, 2, 0, 0, 0], 'C:add9': [x, 3, 2, 0, 3, 0],
    'D:maj': [x, x, 0, 2, 3, 2], 'D:min': [x, x, 0, 2, 3, 1], 'D:7': [x, x, 0, 2, 1, 2], 'D:maj7': [x, x, 0, 2, 2, 2],
    'D:m7': [x, x, 0, 2, 1, 1], 'D:sus2': [x, x, 0, 2, 3, 0], 'D:sus4': [x, x, 0, 2, 3, 3],
    'E:maj': [0, 2, 2, 1, 0, 0], 'E:min': [0, 2, 2, 0, 0, 0], 'E:7': [0, 2, 0, 1, 0, 0], 'E:m7': [0, 2, 0, 0, 0, 0], 'E:sus4': [0, 2, 2, 2, 0, 0],
    'F:maj': [1, 3, 3, 2, 1, 1], 'F:maj7': [x, x, 3, 2, 1, 0],
    'G:maj': [3, 2, 0, 0, 0, 3], 'G:7': [3, 2, 0, 0, 0, 1], 'G:maj7': [3, 2, 0, 0, 0, 2],
    'A:maj': [x, 0, 2, 2, 2, 0], 'A:min': [x, 0, 2, 2, 1, 0], 'A:7': [x, 0, 2, 0, 2, 0], 'A:m7': [x, 0, 2, 0, 1, 0],
    'A:maj7': [x, 0, 2, 1, 2, 0], 'A:sus2': [x, 0, 2, 2, 0, 0], 'A:sus4': [x, 0, 2, 2, 3, 0],
    'B:7': [x, 2, 1, 2, 0, 2],
  };
  // formes mobiles (barrés) : décalages depuis la case du barré
  const E_SHAPE = { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, x, x, x] };
  const A_SHAPE = {
    maj: [x, 0, 2, 2, 2, 0], min: [x, 0, 2, 2, 1, 0], '7': [x, 0, 2, 0, 2, 0], m7: [x, 0, 2, 0, 1, 0], maj7: [x, 0, 2, 1, 2, 0],
    sus2: [x, 0, 2, 2, 0, 0], sus4: [x, 0, 2, 2, 3, 0], dim: [x, 0, 1, 2, 1, x], m7b5: [x, 0, 1, 0, 1, x], '5': [x, 0, 2, 2, x, x],
  };
  // qualité reconnue par SS.Arp.analyzeChord → qualités jouables, de la plus fidèle à la plus simple
  const QUALITY = {
    maj: ['maj'], min: ['min'], '7': ['7', 'maj'], maj7: ['maj7', 'maj'], m7: ['m7', 'min'], m7b5: ['m7b5', 'dim', 'min'],
    dim: ['dim', 'min'], dim7: ['dim', 'min'], aug: ['maj'], sus2: ['sus2', 'maj'], sus4: ['sus4', 'maj'], '6': ['maj'], m6: ['min'],
    add9: ['add9', 'maj'], madd9: ['min'], '9': ['7', 'maj'], maj9: ['maj7', 'maj'], m9: ['m7', 'min'], '5': ['5', 'maj'],
    '7no3': ['7', '5'], add4: ['maj'], madd4: ['min'], note: ['5'],
  };

  const POSITIONS = [
    { id: 'open', label: 'Ouverte', hint: 'forme en bas du manche quand elle existe, sinon le barré le plus bas' },
    { id: 'barreE', label: 'Barré (6e)', hint: 'forme de Mi barrée : fondamentale sur la 6e corde' },
    { id: 'barreA', label: 'Barré (5e)', hint: 'forme de La barrée : fondamentale sur la 5e corde' },
  ];
  const CAPOS = [0, 1, 2, 3, 4, 5, 7];

  const rootString = (frets, root, open = OPEN) => {
    for (let s = 0; s < 6; s++) if (frets[s] != null && mod(open[s] + frets[s], 12) === root) return s;
    return frets.findIndex((f) => f != null);
  };
  function movable(table, base, root, q, forced) {
    if (!table[q]) return null;
    let f = mod(root - base, 12);
    if (forced && f === 0) f = 12; // barré demandé sur un accord à vide : une octave plus haut
    const frets = table[q].map((d) => (d == null ? null : d + f));
    return { frets, barre: f, capo: 0, kind: table === E_SHAPE ? 'barreE' : 'barreA' };
  }

  /**
   * Recherche d'une forme sur le manche (accordages autres que standard, ou accord absent de la bibliothèque) :
   * chaque corde joue une note de l'accord ou se tait (seulement sous la basse), basse = `bassPc`, toutes les notes
   * principales présentes, écart de 3 cases au plus ; on préfère le bas du manche et les cordes à vide.
   */
  function searchShape(open, pcs, need, bassPc, capo) {
    let best = null;
    for (let w = capo + 1; w <= capo + 10; w++) {
      const opts = open.map((o) => {
        const a = [];
        for (const f of [capo, w, w + 1, w + 2, w + 3]) if (f >= capo && pcs.has(mod(o + f, 12)) && !a.includes(f)) a.push(f);
        return a;
      });
      const frets = new Array(6).fill(null);
      const walk = (s, started) => {
        if (s === 6) {
          const played = frets.map((f, i) => (f == null ? null : open[i] + f)).filter((n) => n != null);
          if (played.length < 4) return;
          const have = new Set(played.map((n) => mod(n, 12)));
          if (!need.every((pc) => have.has(pc))) return;
          const fr = frets.filter((f) => f != null && f > capo);
          const span = fr.length ? Math.max(...fr) - Math.min(...fr) : 0;
          if (span > 3) return;
          const opens = frets.filter((f) => f === capo).length;
          const cost = (fr.length ? Math.min(...fr) - capo : 0) * 1.2 + span + fr.length * 0.3 - opens * 0.4 + frets.filter((f) => f == null).length * 0.6;
          if (!best || cost < best.cost - 1e-9) best = { cost, frets: frets.slice() };
          return;
        }
        if (!started) {
          frets[s] = null;
          walk(s + 1, false); // corde grave muette, sous la basse
          for (const f of opts[s]) if (mod(open[s] + f, 12) === bassPc) { frets[s] = f; walk(s + 1, true); }
          frets[s] = null;
          return;
        }
        for (const f of opts[s]) { frets[s] = f; walk(s + 1, true); }
        frets[s] = null;
      };
      walk(0, false);
      if (best && w > capo + 4 && best.cost < 4) break;
    }
    return best ? best.frets : null;
  }

  /**
   * Basse imposée (C/E) : la note de basse sur une corde plus grave (ou sur la même), à portée de la main ;
   * les cordes en dessous se taisent. Sans position possible, la forme reste telle quelle.
   */
  function withBass(sh, open, bassPc) {
    const played = (fr) => fr.filter((f) => f != null && f > sh.capo);
    for (let s = 0; s <= 3; s++) {
      const f = sh.capo + mod(bassPc - open[s] - sh.capo, 12);
      const rest = sh.frets.map((x, i) => (i > s ? x : null));
      if (rest.filter((x) => x != null).length < 3) continue;
      const fr = played([...rest, f]);
      if (fr.length && Math.max(...fr) - Math.min(...fr) > 3) continue;
      const frets = sh.frets.map((x, i) => (i < s ? null : i === s ? f : x));
      return { ...sh, frets, slash: true, altStr: sh.rootStr > s ? sh.rootStr : null, rootStr: s };
    }
    return sh;
  }

  /**
   * Forme de guitare d'un accord (notes MIDI) : { frets, root, quality, rootStr, barre, capo, kind, name, notes }.
   * g : réglages guitare normalisés (pos, capo).
   */
  const shapeCache = new Map();
  function shapeFor(notes, g, bassPc) {
    const key = notes.join(',') + '|' + g.pos + '|' + g.capo + '|' + g.tuning + '|' + bassPc;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const open = openOf(g);
    const hyp = SS.Arp && SS.Arp.analyzeChord ? SS.Arp.analyzeChord(notes)[0] : null;
    const root = hyp ? hyp.root : mod(Math.min(...notes), 12);
    const type = hyp ? hyp.type : 'maj';
    const qs = QUALITY[type] || ['maj'];
    let sh = null;
    if (g.tuning !== 'standard') {
      // accordage ouvert : forme cherchée sur le manche avec les notes de l'accord
      const pcs = new Set(notes.map((n) => mod(n, 12)));
      const ivs = [...pcs].map((pc) => mod(pc - root, 12));
      const need = [root, ...ivs.filter((iv) => [3, 4, 10, 11].includes(iv)).map((iv) => mod(root + iv, 12))];
      const fr = searchShape(open, pcs, need, root, g.capo) || searchShape(open, pcs, [root], root, g.capo);
      if (fr) {
        const pl = fr.filter((f) => f != null && f > g.capo);
        sh = { frets: fr, barre: 0, capo: g.capo, kind: g.capo ? 'open' : pl.length && Math.min(...pl) > 4 ? 'search' : 'open', q: type };
      }
    }
    for (const q of g.tuning === 'standard' ? qs : []) {
      if (g.pos === 'open') {
        const s = OPEN_SHAPES[NAMES[mod(root - g.capo, 12)] + ':' + q];
        if (s) sh = { frets: s.map((f) => (f == null ? null : f + g.capo)), barre: g.capo, capo: g.capo, kind: 'open', q };
        else {
          const e = movable(E_SHAPE, 4, root, q, false);
          const a = movable(A_SHAPE, 9, root, q, false);
          sh = e && a ? (e.barre <= a.barre ? e : a) : e || a;
          if (sh) sh.q = q;
        }
      } else {
        const first = g.pos === 'barreA' ? [A_SHAPE, 9] : [E_SHAPE, 4];
        const other = g.pos === 'barreA' ? [E_SHAPE, 4] : [A_SHAPE, 9];
        sh = movable(first[0], first[1], root, q, true) || movable(other[0], other[1], root, q, true);
        if (sh) sh.q = q;
      }
      if (sh) break;
    }
    if (!sh) sh = { ...movable(E_SHAPE, 4, root, 'maj', false), q: 'maj' };
    sh.root = root;
    sh.quality = type;
    sh.rootStr = rootString(sh.frets, root, open);
    if (bassPc != null && bassPc !== root) sh = withBass(sh, open, bassPc);
    sh.notes = sh.frets.map((f, s) => (f == null ? null : open[s] + f));
    sh.name = (hyp ? hyp.name.replace(/\/.*/, '') : NAMES[root]) + (sh.slash ? '/' + NAMES[bassPc] : '');
    sh.tuning = g.tuning;
    if (shapeCache.size > 300) shapeCache.clear();
    shapeCache.set(key, sh);
    return sh;
  }

  /** Jeton de motif → index de corde (0 = 6e … 5 = 1re), ou null si cette corde ne fait pas partie de la forme. */
  function stringOf(tok, sh) {
    const ok = (s) => (s >= 0 && s <= 5 && sh.frets[s] != null ? s : null);
    if (tok === 'B') return sh.rootStr;
    if (tok === 'A' && sh.altStr != null) return sh.altStr; // C/E : la basse alterne mi grave et do
    if (tok === 'A') {
      // basse alternée : la corde de Ré (ou de Sol pour une forme posée sur la 4e), sinon la corde au-dessus
      const s = sh.rootStr === 2 ? 3 : 2;
      return ok(s) != null && s !== sh.rootStr ? s : ok(sh.rootStr + 1);
    }
    if (/^B[1-4]$/.test(tok)) return ok(Math.min(5, sh.rootStr + +tok[1]));
    if (/^[1-6]$/.test(tok)) return ok(6 - +tok);
    return null;
  }
  const isBassTok = (t) => t === 'B' || t === 'A';

  /*
   * Motifs. beats × div = nombre de pas (div = pas par temps : 2 croches, 3 triolets, 4 doubles-croches).
   * vel : vélocités MIDI par pas (sinon pouce 92, doigts 76) ; shift : décalage en ms par pas (main humaine) ;
   * dir : doigt ou coup de médiator par pas, pour l'affichage ; src : tiré du document.
   */
  const M = (id, hand, name, beats, div, pat, extra = {}) => ({ id, hand, name, beats, div, pat, steps: pat.split(' ').map((t) => (t === '.' ? [] : t.split('+'))), ...extra });
  const MOTIFS = [
    M('classA', 'doigts', 'Arpège classique', 4, 2, 'B 3 2 1 B 2 3 2', {
      src: 1, vel: [82, 65, 69, 79, 76, 66, 62, 64], shift: [0, 8, 0, -5, 0, 8, 0, 0],
      desc: 'p i m a, puis p m i m. Sur Am : A2 A3 C4 E4 | A2 C4 A3 C4. Le mi aigu sur le « & » de 2 porte la mélodie.',
    }),
    M('travis', 'doigts', 'Travis', 4, 2, 'B+1 3 A 2 B 3 A 2', {
      src: 1, desc: 'Le pouce alterne basse et basse alternée sur les temps (sur C : C3 E3 C3 E3), l’index et le majeur répondent. Première attaque : pouce et annulaire ensemble.',
    }),
    M('pimami', 'doigts', 'p-i-m-a-m-i 6/8', 2, 3, 'B 3 2 1 2 3', {
      src: 1, meter: '6/8', vel: [84, 60, 64, 74, 62, 58],
      desc: 'Six croches : A2 A3 C4 | E4 C4 A3 sur Am, accents légers sur les croches 1 et 4.',
    }),
    M('valse', 'doigts', 'Valse 3/4', 3, 2, 'B B1 B2 B3 B2 B1', {
      src: 1, meter: '3/4', vel: [80, 62, 66, 70, 60, 56],
      desc: 'Six attaques régulières par mesure de 3/4 (sur C : C E G C G E), la note aiguë plus douce.',
    }),
    M('pop16', 'doigts', 'Pop en doubles', 4, 4, 'B 3 2 3 1 3 2 3 A 3 2 3 1 3 2 3', { desc: 'Doubles-croches régulières autour de la 3e corde : pop acoustique, intro qui avance.' }),
    M('pince', 'doigts', 'Pincé', 4, 2, 'B+1 3 2+3 1 A+1 3 2+3 2', { desc: 'Pouce et annulaire ensemble sur le temps : la basse et la note haute en même temps.' }),
    M('bossa', 'doigts', 'Bossa nova', 4, 4, 'B+3+2+1 . . 3+2+1 . . A+3+2+1 . B . 3+2+1 . 3+2+1 . A .', { desc: 'Le pouce marque une basse pointée, trois doigts pincent l’accord en syncope.' }),
    M('cross', 'mediator', 'Crosspicking', 4, 2, '3 2 1 3 2 1 3 2', {
      src: 1, dir: '↓↑↓↑↓↑↓↑', desc: 'Le médiator roule sur les cordes 3, 2, 1 ; un motif de trois en croches donne 3+3+2 sur la mesure (sur C : G3 C4 E4).',
    }),
    M('aller', 'mediator', 'Aller-retour', 4, 2, 'B B1 B2 B3 B4 B3 B2 B1', {
      src: 1, dir: '↓↑↓↑↓↑↓↑', desc: 'Bas, haut, strictement, même aux changements de corde (sur C : cordes 5 4 3 2 1 2 3 4).',
    }),
    M('sweep', 'mediator', 'Sweep', 4, 3, 'B 3 2 1 2 3 A 3 2 1 2 3', {
      src: 1, dir: '↓↓↓↓↑↑↓↓↓↓↑↑', desc: 'Un seul geste vers le bas sur les cordes voisines, puis on repart vers le haut sur 2 et 3. Notes détachées une à une.',
    }),
    M('hybrid', 'mediator', 'Hybrid picking', 4, 2, 'B 3 2 B 3 2 B 3', {
      src: 1, dir: '↓ma↓ma↓m', desc: 'Le médiator prend la basse, le majeur la 3e corde, l’annulaire la 2e (sur C : C3 G3 C4), en groupes 3+3+2.',
    }),
  ];
  // grattage : un coup par pas (D U d u x c P, « . » = rien)
  const S = (id, name, beats, div, pat, desc, extra = {}) => M(id, 'gratte', name, beats, div, pat, { desc, ...extra });
  MOTIFS.push(
    S('pop', 'Pop ↓ ↓↑ ↑↓↑', 4, 4, 'D . . . D . U . . . U . D . U .', 'Le grattage le plus joué en pop et en folk : bas, bas-haut, haut-bas-haut.'),
    S('folk68', 'Folk 6/8', 2, 3, 'D . U D . U', 'Un balancement ternaire, accent sur 1 et 4.', { meter: '6/8' }),
    S('rock', 'Rock croches', 4, 4, 'D . d . D . d . D . d . D . d .', 'Que des coups vers le bas en croches, plus forts sur les temps.'),
    S('palm', 'Palm mute', 4, 4, 'P . P . P . P . P . P . P . P .', 'Croches étouffées de la paume sur les cordes graves : le rock qui pousse sans prendre de place.'),
    S('reggae', 'Reggae skank', 4, 4, '. . . . c . . . . . . . c . . .', 'Un coup court sur les cordes aiguës, sur 2 et 4, coupé tout de suite.'),
    S('funk', 'Funk étouffé', 4, 4, 'x u D u x u x U d x D u x U x u', 'Doubles-croches continues, presque tout étouffé, quelques coups ouverts accentués.'),
    S('ballade', 'Ballade lente', 4, 4, 'D . . . . . . . D . . . U . D .', 'Un grand coup qui sonne, quelques réponses : laisse respirer la voix.')
  );
  /*
   * Coups de grattage : cordes jouées (dans l'ordre du geste), force, durée imposée (fix16 en pas du motif,
   * fixSec en secondes ; sinon la résonance), étouffé.
   */
  const STROKES = {
    D: { pick: (p) => p, vel: 0.8, label: '↓' },
    d: { pick: (p) => p.slice(0, 4), vel: 0.55, label: '↓' },
    U: { pick: (p) => p.slice(-4).reverse(), vel: 0.66, label: '↑' },
    u: { pick: (p) => p.slice(-3).reverse(), vel: 0.42, fix16: 0.45, label: '↑' },
    x: { pick: (p) => p.slice(-4), vel: 0.3, fixSec: 0.035, mute: true, label: '×' },
    c: { pick: (p) => p.slice(-3), vel: 0.72, fix16: 0.5, label: '✂' },
    P: { pick: (p) => p.slice(0, 3), vel: 0.72, fixSec: 0.12, mute: true, label: 'P' },
  };

  const HANDS = [
    { id: 'doigts', label: 'Doigts (p i m a)' },
    { id: 'mediator', label: 'Médiator' },
    { id: 'gratte', label: 'Grattage' },
  ];

  const DEFAULTS = { on: false, motif: 'classA', pos: 'open', capo: 0, tuning: 'standard', ring: 0.55, mel: 0.4, thumb: 0.4, human: 0.4, spread: 12 };

  function normalize(g) {
    g = g && typeof g === 'object' ? g : {};
    const o = { ...DEFAULTS };
    o.on = !!g.on;
    o.motif = MOTIFS.some((m) => m.id === g.motif) ? g.motif : DEFAULTS.motif;
    o.pos = POSITIONS.some((p) => p.id === g.pos) ? g.pos : 'open';
    o.capo = CAPOS.includes(+g.capo) ? +g.capo : 0;
    if (o.pos !== 'open') o.capo = 0;
    o.tuning = TUNINGS.some((t) => t.id === g.tuning) ? g.tuning : 'standard';
    o.spread = Math.round(clamp(num(+g.spread, DEFAULTS.spread), 0, 40));
    for (const k of ['ring', 'mel', 'thumb', 'human']) o[k] = clamp(num(+g[k], DEFAULTS[k]), 0, 1);
    return o;
  }

  // hachage entier → [0, 1) : décisions reproductibles
  function rnd(...xs) {
    let h = 0x9e3779b9;
    for (const v of xs) {
      h = Math.imul(h ^ (v | 0), 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
    }
    return (h >>> 0) / 4294967296;
  }

  const motifOf = (g) => MOTIFS.find((m) => m.id === g.motif) || MOTIFS[0];

  /**
   * Toutes les attaques d'un accord (événement ev) : positions en doubles-croches depuis ev.step.
   * [{ k, step16, str, midi, vel, bass, top, label, until16 (reprise de la corde ou fin de l'accord) }]
   */
  function attacks(g, ev, sh) {
    const m = motifOf(g);
    const n = m.steps.length;
    const len16 = 4 / m.div;
    let top = -1;
    m.steps.forEach((toks) => toks.forEach((t) => { const s = stringOf(t, sh); if (s != null && !isBassTok(t)) top = Math.max(top, s); }));
    const out = [];
    const evVel = (ev.vel == null ? 0.8 : ev.vel) / 0.8;
    const playable = [0, 1, 2, 3, 4, 5].filter((x) => sh.frets[x] != null);
    for (let k = 0; k * len16 < ev.len - 1e-9; k++) {
      const st = k % n;
      if (m.hand === 'gratte') {
        const t = m.steps[st][0];
        const sk = t && STROKES[t];
        if (sk)
          sk.pick(playable).forEach((s, i) =>
            out.push({ k, st, step16: k * len16, str: s, midi: sh.notes[s], vel: clamp(sk.vel * (1 - i * 0.03) * evVel, 0.03, 1), bass: s === sh.rootStr, strum: true, delay: i, fix16: sk.fix16, fixSec: sk.fixSec, mute: !!sk.mute, label: i ? '' : sk.label })
          );
        continue;
      }
      const seen = new Set();
      m.steps[st].forEach((t) => {
        const s = stringOf(t, sh);
        if (s == null || seen.has(s)) return;
        seen.add(s);
        const bass = isBassTok(t) || (m.hand === 'mediator' && t === 'B');
        let v = m.vel ? m.vel[st] / 127 : bass ? 92 / 127 : 76 / 127;
        if (bass) v *= 1 + g.thumb * 0.35;
        else if (m.hand === 'doigts') v *= s === top ? 1 + g.mel * 0.35 : 1 - g.mel * 0.15;
        const label = m.dir ? m.dir[st] : bass ? 'p' : { 5: 'a', 4: 'm', 3: 'i' }[s] || 'i';
        out.push({ k, st, step16: k * len16, str: s, midi: sh.notes[s], vel: clamp(v * evVel, 0.03, 1), bass, top: s === top, label });
      });
    }
    out.forEach((a) => {
      const next = out.find((b) => b.str === a.str && b.k > a.k);
      a.until16 = (next ? next.step16 : ev.len) - a.step16;
    });
    return out;
  }

  /** Durée (s) d'une attaque d'après la résonance : détaché (0) → basse 700 ms / aigus 500 ms (≈ 0,55) → tout sonne (1). */
  function ringDur(g, a, stepSec, len16) {
    if (a.fixSec) return Math.min(a.fixSec, a.until16 * stepSec);
    if (a.fix16) return Math.min(a.fix16 * len16, a.until16) * stepSec;
    const until = a.until16 * stepSec;
    const det = 0.9 * len16 * stepSec;
    if (g.ring >= 0.98) return until;
    const full = a.bass ? 1.3 : 0.95;
    return Math.max(0.03, Math.min(until, det + g.ring * Math.max(0, full - det)));
  }

  /**
   * Notes du pas de séquenceur `step` (double-croche) pour l'accord ev ; même contrat que SS.Arp.renderStep :
   * [{ midi, at (s depuis le début du pas), dur, vel, cutoff, first, str, label }].
   */
  function renderStep(arp, ev, step, info) {
    const g = normalize(arp.guitar);
    if (step < ev.step || step >= ev.step + ev.len) return [];
    const notes = (ev.notes || []).filter(Number.isFinite);
    if (!notes.length) return [];
    const sh = shapeFor(notes, g, Number.isFinite(ev.bass) ? mod(ev.bass, 12) : undefined);
    const m = motifOf(g);
    const len16 = 4 / m.div;
    const sd = info.stepSec;
    const rel = step - ev.step;
    const seed = arp.seed | 0;
    const L = info.loop | 0;
    const out = [];
    attacks(g, ev, sh).forEach((a) => {
      if (Math.floor(a.step16 + 1e-9) !== rel) return;
      // main humaine : les basses posées sur un temps restent sur la grille ; les autres bougent de quelques ms
      const onBeat = Math.abs(a.step16 / 4 - Math.round(a.step16 / 4)) < 1e-9;
      let at = (a.step16 - rel) * sd;
      let vel = a.vel;
      if (a.strum) {
        // grattage : les cordes d'un coup s'étalent ; la main humaine bouge tout le coup à la fois
        at += (a.delay * g.spread) / 1000;
        if (g.human > 0 && !onBeat) at += (rnd(seed, ev.step, L, a.k, 0, 1) * 2 - 1) * 0.008 * g.human;
      } else if (g.human > 0 && !(a.bass && onBeat)) {
        const shift = m.shift ? m.shift[a.st] / 1000 * Math.min(1, g.human * 2.5) : 0;
        at += shift + (rnd(seed, ev.step, L, a.k, a.str, 1) * 2 - 1) * 0.008 * g.human * (m.shift ? 0.4 : 1);
      }
      if (g.human > 0) vel = clamp(vel * (1 + (rnd(seed, ev.step, L, a.k, a.str, 2) * 2 - 1) * 0.12 * g.human), 0.03, 1);
      out.push({ midi: a.midi, at: Math.max(at, -0.006), dur: ringDur(g, a, sd, len16), vel, cutoff: 1, first: a.k === 0, str: a.str, label: a.label, mute: a.mute || undefined });
    });
    return out;
  }

  /** Aperçu d'une mesure de motif pour l'affichage (tablature) : attaques avec leur durée en doubles-croches. */
  function preview(arp, notes, bpm = 100, bassPc) {
    const g = normalize(arp && arp.guitar);
    const m = motifOf(g);
    const sh = shapeFor(notes, g, bassPc);
    const len = m.beats * 4;
    const sd = 60 / bpm / 4;
    const at = attacks(g, { step: 0, len, notes, vel: 0.8 }, sh);
    return { motif: m, shape: sh, len, attacks: at.map((a) => ({ ...a, ring16: Math.min(a.until16, ringDur(g, a, sd, 4 / m.div) / sd) })) };
  }

  /** Longueur d'un cycle du motif, en doubles-croches. */
  const cycle16 = (arp) => motifOf(normalize(arp && arp.guitar)).beats * 4;

  SS.GuitarArp = { OPEN, TUNINGS, MOTIFS, HANDS, POSITIONS, CAPOS, DEFAULTS, STROKES, normalize, shapeFor, stringOf, renderStep, preview, cycle16, motifOf };
})(typeof window !== 'undefined' ? window : globalThis);
