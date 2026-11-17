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
 *    remplace alors le roulement automatique de fin de section) ;
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
  const MELODIC = ['pad', 'arp', 'keys', 'strings', 'guitar', 'lead', 'vox', 'sax'];
  /**
   * Courbes d'automation d'une piste pour une section (null si rien) :
   *  - intro planante (sec.float) : le passe-bas des nappes et de l'arpège s'ouvre lentement, la reverb se retire ;
   *  - montée (drums « build ») : passe-haut qui grimpe sur la 2e moitié (basse comprise), reverb lâchée à la fin ;
   *  - break : la nappe respire (filtre qui se ferme à mi-chemin puis se rouvre), plus de reverb sur le lead ;
   *  - drop : le lead et l'arpège partent un peu fermés et s'ouvrent sur la première mesure (attaque du drop) ;
   *  - outro : tout se referme, fondu des dernières mesures.
   */
  function sectionAuto(id, sec, role, bars, isFx) {
    const n = bars * SPB;
    if (isFx) {
      // la montée de bruit reste sous le drop : volume plafonné, le filtre fait l'essentiel de l'effet
      if (sec.fx === 'riser') return { filter: ramp(n, -0.9, 0.1), volume: ramp(n, 0.15, 0.5), reverb: ramp(n, 0.2, 0.6, 0.5) };
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

  /* ---------- section et chanson ---------- */
  /** Coupe ce qui sonne au dernier temps d'une section (silence avant le drop). */
  function gapEnd(data, bars) {
    const cut = bars * SPB - 4;
    for (const d of Object.values(data)) {
      if (d.steps) for (let s = cut; s < d.steps.length; s++) d.steps[s] = 0;
      if (d.events) {
        d.events = d.events.filter((e) => e.step < cut);
        d.events.forEach((e) => (e.len = Math.min(e.len, cut - e.step)));
      }
    }
  }

  /**
   * Construit la chanson.
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
   * → { key, scenes: [{ id, name, bars, key, emotion, data, spans }], song: [{ scene, repeat }] }
   */
  function build(spec, presetId, tracks, { melodySeed = 0, melody = null, harmony = null, parts = null } = {}) {
    const key = parseKey(spec.key);
    const mel = melody || {};
    const order = [];
    const form = spec.form.split(/\s+/).filter(Boolean).map((t) => {
      const [id, n] = t.split('*');
      if (!spec.sections[id]) throw new Error('section inconnue : ' + id);
      if (!order.includes(id)) order.push(id);
      return { id, repeat: +n || 1 };
    });
    const scenes = order.map((id) => {
      const sec = spec.sections[id];
      const bars = sec.bars;
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
      const data = {};
      const pp = (parts && parts[id]) || null; // réglages de cette scène
      const muted = (pp && pp.off) || [];
      const dp = pp && pp.drums;
      // mélodie imposée (parts[section].lead) : portée par la première piste chantante, dans l'ordre lead, vox, sax
      const ownLead = pp && pp.lead && Array.isArray(pp.lead.events) ? pp.lead.events : null;
      const roleOf = (x) => ((x.band && x.band.key) || '').split(':')[0];
      const leadTrack = ownLead ? tracks.find((t) => roleOf(t) === SINGERS.find((r) => tracks.some((x) => roleOf(x) === r))) : null;
      tracks.forEach((t) => {
        const [role, sound] = (t.band && t.band.key ? t.band.key : '').split(':');
        const singer = SINGERS.includes(role);
        const r = rng(`${presetId}/${id}/${t.band ? t.band.key : t.id}` + (singer && melodySeed ? `#${melodySeed}` : ''));
        if (t.type === 'drum') {
          const mode = role === 'perc' ? sec.perc ?? sec.drums : sec.drums;
          const snd = sound || t.sound;
          if (muted.includes(role)) return void (data[t.id] = { steps: new Array(bars * SPB).fill(0) });
          const pat = dp && dp.pattern && SS.drumPattern ? SS.drumPattern(dp.style, dp.pattern) : null;
          const lanes = dp && (dp.edits || (pat && pat.lanes));
          const fo = { fill: dp && dp.fill, fillType: (dp && dp.fillType) || 'roll', crash: !!(dp && dp.crash), energy };
          if (lanes) {
            // motif de la bibliothèque : il pilote kick, caisse, clap, charleston, crash et toms
            const st = patternSteps(snd, bars, r, { lanes, ...fo });
            if (st) return void (data[t.id] = { steps: st });
          }
          // fill explicite (même « off ») : il remplace le roulement automatique de fin de section
          let steps = drumSteps(snd, mode, sec.groove || spec.groove, bars, r, { perc: role === 'perc', last: sec.fill !== false && !(dp && dp.fill), energy });
          if (dp && ((dp.fill && dp.fill !== 'off') || dp.crash) && mode && mode !== 'off' && mode !== 'build') steps = patternSteps(snd, bars, r, { base: steps, ...fo }) || steps;
          data[t.id] = { steps };
          if (spec.tech) drumSpice(data[t.id], snd, mode, bars, r);
          return;
        }
        const o = (pp && pp[role]) || null; // réglages du rôle (basse, nappe, arpège)
        const mode = muted.includes(role) ? null : (o && o.mode) || sec[role];
        const one = role === 'arp' && !muted.includes(role) && o && o.one && SS.Arp ? o.one : null; // Arp One : l'emporte sur le mode
        let events = [];
        // mélodie imposée : même dans une scène où l'inspiration ne chante pas (sauf rôle coupé par « off »)
        if (ownLead && t === leadTrack && !muted.includes(role))
          events = ownLead.filter((e) => e && e.step >= 0 && e.step < bars * SPB && e.notes && e.notes.length).map((e) => ({ step: e.step, len: Math.max(1, Math.min(e.len, bars * SPB - e.step)), notes: [...e.notes], vel: e.vel ?? 0.8 }));
        else if (one) events = arpOneEvents(spans, one, bars);
        else if (mode) {
          if (role === 'bass') {
            const kp = H().scale(k).map((d) => d.pc);
            const ped = o && { tonic: kp[0], fifth: pcOf(kp[0] + 7) }[o.pedal];
            events = bassEvents(spans, mode, r, kp, o ? { pedalPc: ped ?? null, approach: o.approach !== false, shift: o.register === 'mid' ? 12 : 0 } : undefined);
          }
          else if (role === 'fx') events = fxEvents(spans, mode, k, bars);
          else if (role === 'arp') events = arpEvents(spans, mode, r);
          else if (singer) events = mode === 'rise' ? riseEvents(spans, r, k, bars) : melodyPart(spans, k, bars, role, smel, mel.plans && mel.plans[id], mel.seeds && mel.seeds[id], `${presetId}/${id}/${role}/${melodySeed}`, mode);
          else if (role === 'arpchord') events = arpEvents(spans, mode, r);
          else {
            // nappe, cordes, piano, guitare : accords (ou arpège si le mode en est un)
            const range = role === 'keys' ? { lo: 57, hi: 79 } : role === 'guitar' ? { lo: 52, hi: 74 } : role === 'strings' ? { lo: 55, hi: 81 } : { lo: 53, hi: 76 };
            events = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16', 'ost16', 'dotted'].includes(mode) ? arpEvents(spans, mode, r) : chordEvents(spans, mode, r, role === 'pad' && o && o.voicing === 'open' ? { ...range, open: true } : range);
          }
        }
        data[t.id] = { events: role === 'fx' ? events : shapeVel(events, role, { energy, bars, build: sec.drums === 'build' }) };
        // techno : dans la montée, les mélodies restent en retrait pour que le drop frappe plus fort
        if (spec.tech && sec.drums === 'build' && ['lead', 'vox', 'arp', 'keys'].includes(role)) data[t.id].events.forEach((e) => (e.vel = clampV(e.vel * 0.6)));
        // intro et break planants : tout est joué piano (la basse tenue encore plus), le drop garde la pleine force
        if (spec.tech && sec.float && role !== 'fx') data[t.id].events.forEach((e) => (e.vel = clampV(e.vel * (role === 'bass' ? 0.5 : 0.68))));
        if (spec.tech && (events.length || role !== 'fx')) {
          const auto = sectionAuto(as, sec, role, bars, role === 'fx');
          if (auto && events.length) data[t.id].auto = auto;
        }
      });
      if (sec.gap) gapEnd(data, bars);
      const sc = { id: SS.uid(), sec: id, name: sec.name || NAMES[id] || id, bars, key: k, data, spans };
      const emo = harmony && harmony.emotions && harmony.emotions[id];
      if (emo || spec.emotion) sc.emotion = emo || sec.emotion || spec.emotion;
      return sc;
    });
    const song = form.map((f) => ({ scene: scenes[order.indexOf(f.id)].id, repeat: f.repeat }));
    return { key, scenes, song };
  }

  return { build, parseChord, spansOf, spansFromGrid, SINGERS, NAMES, CHARACTERS, FORMS, LETTERS, RHYTHMS, defaultPlan, fitPlan, _rng: rng };
})();
