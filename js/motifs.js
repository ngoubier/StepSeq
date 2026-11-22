/*
 * Catalogue des motifs d'arpège prédéfinis, classés par catégorie.
 * Chaque motif est un petit réglage de l'arpégiateur : un mode du moteur (js/arp.js) ou un motif relatif
 * en degrés (d1 fondamentale, d3 tierce, d5 quinte, d7 septième ; + / − octave ; . silence),
 * éventuellement avec un rythme. Ils suivent donc l'accord joué.
 */
(function (root) {
  root.SS = root.SS || {};
})(typeof window !== 'undefined' ? window : globalThis);
var SS = (typeof window !== 'undefined' ? window : globalThis).SS;

SS.MOTIF_CATS = [
  { id: 'updown', label: 'Montées et descentes' },
  { id: 'groups', label: 'Groupes qui grimpent' },
  { id: 'leaps', label: 'Sauts et intervalles' },
  { id: 'bass', label: 'Basse et pédale' },
  { id: 'octaves', label: 'Octaves et répétitions' },
  { id: 'synth', label: 'Synthwave et années 80' },
  { id: 'chords', label: 'Accords et rythmes' },
  { id: 'world', label: 'Rythmes du monde' },
  { id: 'ternary', label: 'Ternaires (3/4, 6/8, 12/8)' },
  { id: 'gen', label: 'Formes génératives' },
  { id: 'random', label: 'Hasard' },
];

(() => {
  const m = (id, cat, name, arp, tags = '') => ({ id, cat, name, arp, tags });
  const pat = (pattern, extra = {}) => ({ mode: 'pattern', pattern, ...extra });
  const chordRhythm = (r) => ({ mode: 'chord', rhythm: { type: 'lane' }, lanes: { rhythm: r } });
  const rhythm = (mode, r) => ({ mode, rhythm: { type: 'lane' }, lanes: { rhythm: r } });
  const accents = (mode, vel) => ({ mode, lanes: { vel } }); // polyrythme d'accents : cycle de vélocité ≠ 4
  SS.MOTIFS = [
    m('up', 'updown', 'Montant', { mode: 'up' }, 'monte classique'),
    m('down', 'updown', 'Descendant', { mode: 'down' }, 'descend classique'),
    m('updown', 'updown', 'Montant / descendant', { mode: 'updown' }, 'aller retour pendule'),
    m('updown_rep', 'updown', 'Montant / descendant, extrêmes doublés', { mode: 'updown_rep' }, 'aller retour'),
    m('downup', 'updown', 'Descendant / montant', { mode: 'downup' }, 'retour aller'),
    m('played', 'updown', 'Ordre joué', { mode: 'played' }, 'clavier'),
    m('played_rev', 'updown', 'Ordre joué inversé', { mode: 'played_rev' }, 'clavier'),

    m('up2', 'groups', 'Double montée', { mode: 'up2' }, 'groupes de 4 grimpe'),
    m('down2', 'groups', 'Double descente', { mode: 'down2' }, 'groupes de 4'),
    m('up3', 'groups', 'Montée par 3', { mode: 'up3' }, 'groupes de 3 triolet'),
    m('down3', 'groups', 'Descente par 3', { mode: 'down3' }, 'groupes de 3'),
    m('climb2', 'groups', 'Montée par 2', { mode: 'climb2' }, 'paires'),
    m('fall2', 'groups', 'Descente par 2', { mode: 'fall2' }, 'paires'),
    m('rotate', 'groups', 'Rotation', { mode: 'rotate' }, 'décale chaque cycle'),

    m('thirds', 'leaps', 'Par sauts (1-3-2-4)', { mode: 'thirds' }, 'zigzag'),
    m('alberti', 'leaps', 'Alberti', { mode: 'alberti' }, 'classique piano mozart'),
    m('converge', 'leaps', 'Converge', { mode: 'converge' }, 'extérieur intérieur'),
    m('diverge', 'leaps', 'Diverge', { mode: 'diverge' }, 'intérieur extérieur'),
    m('pendule', 'leaps', 'Pendule', pat('d1 d3 d5 d3'), 'balancier'),
    m('quinte', 'leaps', 'Quinte et octave', pat('d1 d5 d1+ d5'), 'quinte octave'),
    m('ouvert', 'leaps', 'Accord ouvert', pat('d1 d5 d3+ d5'), 'large'),
    m('retour', 'leaps', 'Retour à la fondamentale', pat('d1 d3 d1 d5 d1 d1+'), 'fondamentale'),
    m('grandsauts', 'leaps', 'Grands sauts', pat('d1 d5+ d3 d1+'), 'large octave'),

    m('pedal', 'bass', 'Basse pivot', { mode: 'pedal' }, 'pédale fondamentale'),
    m('pedal_top', 'bass', 'Note haute pivot', { mode: 'pedal_top' }, 'pédale aiguë'),
    m('basseaccord', 'bass', 'Basse puis accord', pat('d1- d1 d3 d5'), 'grave'),
    m('basseoctave', 'bass', 'Basse et quinte', pat('d1- d5 d1 d5'), 'grave quinte'),
    m('pompe', 'bass', 'Basse qui pompe', pat('d1- d1- d5 d1- d1 d1- d5 d1-'), 'grave rythme'),
    m('pedalehaute', 'bass', 'Pédale aiguë', pat('d1+ d5 d1+ d3'), 'aigu'),
    m('bassemelodie', 'bass', 'Basse + mélodie', pat('d1- d3+ d5 d1+ d1- d5+ d3+ d5'), 'grave contre-chant deux voix'),
    m('contrechant', 'bass', 'Basse + contre-chant', pat('d1- d5 d3+ d5 d1- d7 d5+ d3+'), 'grave deux voix septième'),

    m('octaves', 'octaves', 'Octaves', { mode: 'octaves' }, 'octave'),
    m('repeat', 'octaves', 'Notes doublées', { mode: 'repeat' }, 'répétition'),
    m('octpompe', 'octaves', 'Pompe d’octave', pat('d1 d1+ d1 d1+'), 'octave disco'),
    m('octmonte', 'octaves', 'Octaves qui montent', pat('d1 d1+ d3 d3+ d5 d5+'), 'octave'),
    m('rep422', 'octaves', 'Répétitions 4-2-2', pat('d1 d1 d1 d1 d3 d3 d5 d5'), 'répétition'),
    m('echo', 'octaves', 'Écho', pat('d1 . d1 d3 . d3 d5 .'), 'silence répétition'),

    m('midnight', 'synth', 'Midnight Drive', pat('d1 d5 d1+ d5 d3+ d5 d1+ d5'), 'synthwave'),
    m('italo', 'synth', 'Italo disco', pat('d1- d1 d1- d1'), 'octave basse disco'),
    m('pulse', 'synth', 'Pulse 1984', pat('d1 d1 d1+ d1 d5 d1 d1+ d1'), 'synthwave'),
    m('berlin', 'synth', 'Berlin School', { mode: 'pedal', octaves: 2 }, 'séquenceur tangerine'),
    m('progression', 'synth', 'Suiveur de progression', pat('d1 d3 d5 d3 d7 d5 d3 d5'), 'septième'),
    m('ostinato', 'synth', 'Ostinato de film', pat('d1 d5 d3+ d5 d1 d5 d1+ d5'), 'cinéma'),
    m('techno', 'synth', 'Techno euclidienne', { mode: 'updown', octaves: 2, rhythm: { type: 'euclid', hits: 5, steps: 16, rot: 0 } }, 'euclidien'),

    m('chord', 'chords', 'Accord à chaque pas', { mode: 'chord' }, 'accord plaqué'),
    m('croches', 'chords', 'Accord en croches', chordRhythm([1, 0]), 'accord'),
    m('stabs', 'chords', 'Stabs syncopés', chordRhythm([1, 0, 0, 1, 0, 0, 1, 0]), 'accord syncope'),
    m('charleston', 'chords', 'Charleston', chordRhythm([1, 0, 0, 1, 0, 0, 0, 0]), 'accord'),
    m('contretemps', 'chords', 'Contretemps', chordRhythm([0, 0, 1, 0]), 'accord reggae'),

    m('tresillo', 'world', 'Tresillo', rhythm('up', [1, 0, 0, 1, 0, 0, 1, 0]), 'cubain 3-3-2 afro latin'),
    m('clave', 'world', 'Clave son 3-2', rhythm('updown', [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0]), 'cubain salsa latin'),
    m('rumba', 'world', 'Clave rumba', rhythm('up', [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0]), 'cubain latin'),
    m('bossa', 'world', 'Bossa nova', rhythm('pedal', [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0]), 'brésil latin'),
    m('cinquillo', 'world', 'Cinquillo', rhythm('updown', [1, 0, 1, 1, 0, 1, 1, 0]), 'cubain caraïbes'),
    m('bembe', 'world', 'Cloche africaine (12/8)', rhythm('up', [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]), 'afrique bembé ternaire'),
    m('trois4', 'world', '3 contre 4', accents('up', [1, 0.5, 0.5]), 'polyrythme accents'),
    m('cinq4', 'world', '5 contre 4', accents('updown', [1, 0.5, 0.65, 0.5, 0.65]), 'polyrythme accents'),

    m('cascade', 'gen', 'Cascade', { mode: 'cascade' }, 'descentes qui montent chute'),
    m('wave', 'gen', 'Vague qui monte', { mode: 'wave' }, 'arcs spirale'),
    m('balance', 'gen', 'Balancier qui s’élargit', { mode: 'balance' }, 'pendule autour du centre'),
    m('fibo', 'gen', 'Fibonacci', { mode: 'fibo' }, 'suite nombres mathématique'),
    m('norgard', 'gen', 'Série infinie (Nørgård)', { mode: 'norgard' }, 'fractale autosimilaire mathématique'),
    m('cascade2', 'gen', 'Cascade sur 2 octaves', { mode: 'cascade', octaves: 2 }, 'descentes large'),

    m('shuffle', 'random', 'Aléatoire sans répétition', { mode: 'shuffle' }, 'hasard'),
    m('random', 'random', 'Aléatoire', { mode: 'random' }, 'hasard'),
    m('walk', 'random', 'Promenade', { mode: 'walk' }, 'marche hasard'),
    m('drunk', 'random', 'Marche ivre', { mode: 'drunk' }, 'marche hasard'),

    // mesures ternaires : cycles de 3, 6 ou 12 notes calés sur la mesure ; rate 0.5 = croches (rate imposé par le motif)
    m('valsealb', 'ternary', 'Valse Alberti', pat('d1- d5 d3+ d5 d3+ d5', { rate: 0.5 }), '3/4 valse basse accords brisés'),
    m('boite', 'ternary', 'Boîte à musique', pat('d1+ d5 d3 d5 d1+ d3+', { rate: 0.5 }), '3/4 aigu descend remonte'),
    m('menuet', 'ternary', 'Menuet', pat('d1- . d1+ d3+ d5 .', { rate: 0.5 }), '3/4 classique noire croches'),
    m('vague6', 'ternary', 'Montée-descente 6', pat('d1 d3 d5 d1+ d5 d3', { rate: 0.5 }), '6/8 vague mesure'),
    m('berce6', 'ternary', 'Berceuse', pat('d1 d5 d3 d1+ d5 d3', { rate: 0.5 }), '6/8 balancement'),
    m('cascade6', 'ternary', 'Cascade 6/8', pat('d1+ d5 d3 d3+ d1+ d5', { rate: 0.5 }), '6/8 descend sur chaque temps'),
    m('doubles68', 'ternary', 'Doubles 6/8', pat('d1 d3 d5 d1+ d5 d3 d3 d5 d1+ d3+ d1+ d5', { rate: 1 }), '6/8 doubles croches vague'),
    m('trislow', 'ternary', 'Triolets slow', pat('d1 d3 d5', { rate: 0.5 }), '12/8 piano slow doo-wop triolets'),
    m('vague12', 'ternary', 'Vague 12/8', pat('d1 d3 d5 d1+ d3+ d5+ d3+ d1+ d5 d3 d1 d3', { rate: 0.5 }), '12/8 monte redescend'),
    m('cascade12', 'ternary', 'Cascade 12/8', pat('d1+ d5 d3 d3+ d1+ d5 d5+ d3+ d1+ d3+ d1+ d5', { rate: 0.5 }), '12/8 descend sur chaque temps'),
    m('doowop', 'ternary', 'Doo-wop', pat('d1- d1+ d3+ d1- d1+ d3+ d1- d3+ d5+ d1- d1+ d3+', { rate: 0.5 }), '12/8 basse accord années 50'),
  ];
})();

/*
 * Motif reconnu dans des réglages d'arpège (fenêtre de l'arpégiateur et menu du piano roll),
 * et réglages à appliquer pour un motif. Les silences réglés pas à pas ne changent pas le motif reconnu,
 * sauf pour les motifs qui ont leur propre rythme (cherchés en premier).
 */
SS.motifOf = (arp) => {
  const A = SS.Arp;
  const a = A.normalize(arp);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const velOf = (m) => m.arp.lanes && m.arp.lanes.vel;
  const cands = SS.MOTIFS.filter((m) => {
    const x = A.normalize({ ...m.arp });
    if (x.mode !== a.mode || (a.mode === 'pattern' && x.pattern !== a.pattern)) return false;
    if (velOf(m) && !same(velOf(m), a.lanes.vel)) return false; // motif d'accents : même cycle de vélocité
    return !m.arp.octaves || m.arp.octaves === a.octaves;
  });
  const withRhythm = cands.find((m) => {
    if (!m.arp.rhythm) return false;
    const x = A.normalize({ ...m.arp });
    return x.rhythm.type === a.rhythm.type && (x.rhythm.type !== 'lane' || same(x.lanes.rhythm, a.lanes.rhythm.slice(0, x.lanes.rhythm.length)));
  });
  const plain = cands.filter((m) => !m.arp.rhythm && a.rhythm.type !== 'euclid');
  return withRhythm || plain.find(velOf) || plain[0] || null;
};

/** Réglages qui appliquent le motif m ; les silences réglés pas à pas sont gardés si l'ancien motif n'imposait pas de rythme. */
SS.motifPatch = (arp, m) => {
  const a = SS.Arp.normalize(arp);
  const prev = SS.motifOf(a);
  const keepSteps = !m.arp.rhythm && (!prev || !prev.arp.rhythm) && a.rhythm.type === 'lane';
  const patch = { mode: m.arp.mode, pattern: m.arp.pattern || '', preset: '' };
  if (m.arp.octaves) patch.octaves = m.arp.octaves;
  if (m.arp.rate) patch.rate = m.arp.rate; // motifs ternaires : leur vitesse (croches) fait le cycle de la mesure
  // cycle d'accents (3 contre 4…) : posé par le motif, retiré quand on quitte un motif d'accents
  const vel = m.arp.lanes && m.arp.lanes.vel;
  const prevVel = prev && prev.arp.lanes && prev.arp.lanes.vel;
  if (keepSteps) {
    if (vel || prevVel) patch.lanes = { ...a.lanes, vel: vel ? vel.slice() : [] };
    return patch;
  }
  patch.rhythm = m.arp.rhythm || { ...a.rhythm, type: 'all' };
  patch.lanes = { ...a.lanes, rhythm: (m.arp.lanes && m.arp.lanes.rhythm) || [] };
  if (vel || prevVel) patch.lanes.vel = vel ? vel.slice() : [];
  return patch;
};

/*
 * « Surprends-moi » : un nouvel arpège tiré au hasard, en gardant ce qui est verrouillé.
 *   locks : { motif, rythme, accord, effets } (true = garder)
 *   rand  : générateur dans [0, 1) (Math.random par défaut ; les tests passent un générateur à graine)
 * Le résultat est un réglage complet (normalisé) : une fois tiré, il est rejoué à l'identique.
 */
SS.arpSurprise = (arp, locks = {}, rand = Math.random) => {
  const A = SS.Arp;
  const a = A.normalize(arp);
  const pickOf = (arr) => arr[Math.floor(rand() * arr.length) % arr.length];
  const chance = (p) => rand() < p;
  let out = { ...a, seed: 1 + Math.floor(rand() * 999999), preset: '' };
  const lanes = { ...a.lanes };
  const steps = a.steps;
  // ligne clairsemée : surtout la valeur neutre, quelques pas différents
  const sparse = (def, vals, n) => {
    const l = Array(steps).fill(def);
    for (let i = 0; i < n; i++) l[1 + Math.floor(rand() * (steps - 1))] = pickOf(vals);
    return l;
  };

  if (!locks.motif) {
    const cur = SS.motifOf(a);
    let pool = SS.MOTIFS.filter((m) => (!cur || m.id !== cur.id) && m.cat !== 'ternary'); // motifs ternaires : choisis exprès (ils imposent leur vitesse)
    if (locks.rythme) pool = pool.filter((m) => !m.arp.rhythm); // un motif à rythme propre changerait le rythme
    const m = pickOf(pool);
    const p = SS.motifPatch(out, m);
    out = { ...out, ...p };
    Object.assign(lanes, p.lanes || {});
    if (!m.arp.octaves) out.octaves = pickOf([1, 2, 2, 3]);
    if (locks.rythme) {
      out.rhythm = a.rhythm; // rythme verrouillé : exactement le même, ligne comprise
      lanes.rhythm = a.lanes.rhythm;
    }
    lanes.deg = chance(0.25) ? sparse(0, [-1, 1, 1, 2], 2) : [];
  }
  if (!locks.rythme) {
    const own = (SS.motifOf({ ...out, lanes }) || { arp: {} }).arp.rhythm;
    if (!own) {
      const r = rand();
      if (r < 0.45) {
        out.rhythm = { ...out.rhythm, type: 'all' };
        lanes.rhythm = [];
      } else {
        // euclidien ou dessiné, écrit comme une ligne : le motif reste reconnu
        const l = r < 0.8 ? A.euclid(pickOf([5, 7, 9, 11, 13]), 16, Math.floor(rand() * 4)) : Array.from({ length: 16 }, (_, i) => (i === 0 || chance(0.72) ? 1 : 0));
        l[0] = 1;
        out.rhythm = { ...out.rhythm, type: 'lane' };
        lanes.rhythm = l; // ligne de 16 pas, quelle que soit la longueur du motif
      }
    }
    out.rate = pickOf([0.5, 1, 1, 1, 1.5, 2]);
    lanes.div = chance(0.25) ? sparse(1, [2, 2, 3], 2) : [];
  }
  if (!locks.accord) {
    out.inversion = pickOf(['asis', 'asis', 0, 1, 2, 'smooth']);
    out.voicing = pickOf(['close', 'close', 'close', 'open', 'drop2', 'bass']);
  }
  if (!locks.effets) {
    out.echo = chance(0.35) ? { n: pickOf([1, 2, 3]), gap: pickOf([1, 2, 3]), decay: pickOf([0.45, 0.6, 0.7]), shift: pickOf(A.ECHO_SHIFTS).id } : { ...a.echo, n: 0 };
    out.roll = chance(0.2) ? pickOf(['up', 'down', 'updown']) : 'none';
    lanes.ratchet = out.roll !== 'none' ? sparse(1, [2, 3, 4], 2) : chance(0.2) ? sparse(1, [2, 3], 1) : [];
    const g = chance(0.45) ? pickOf(A.GESTES) : null;
    out.geste = g ? { id: g.id, ...g.g } : undefined;
  }
  out.lanes = lanes;
  return A.normalize(out);
};

/** Motif voisin dans le catalogue (dir = +1 suivant, −1 précédent) ; motif personnalisé : le premier / le dernier. */
SS.motifStep = (arp, dir) => {
  const cur = SS.motifOf(arp);
  const i = cur ? SS.MOTIFS.findIndex((m) => m.id === cur.id) : dir > 0 ? -1 : 0;
  const n = SS.MOTIFS.length;
  return SS.MOTIFS[(((i + dir) % n) + n) % n];
};
