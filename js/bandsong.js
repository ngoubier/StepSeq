/*
 * Band : « Créer toute la chanson ».
 * À partir d'un plan de chanson (js/band-songs.js : tonalité, sections, accords, ce que joue chaque musicien)
 * et des pistes créées par Band, écrit toutes les scènes (notes et pas de batterie) et l'arrangement.
 *
 * Tout est déterministe (générateur pseudo-aléatoire initialisé par l'inspiration et la section) :
 * la même inspiration donne toujours la même chanson. Les mélodies sont originales : un motif rythmique
 * et un contour sont tirés pour chaque section, puis répétés et variés (A A' A B) sur les accords.
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
  const vel = (r, v, spread = 0.06) => Math.round(Math.max(0.2, Math.min(1, v + (r() - 0.5) * spread)) * 100) / 100;

  /* ---------- tonalité et accords ---------- */
  function parseKey(s) {
    const [tonic, mode] = s.split(' ');
    return { tonic, mode: mode || 'major' };
  }
  const NUM = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
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
    const rootPc = pcOf(H().scale(key)[deg].pc + acc);
    const s = m[3];
    const T = {
      '': minor ? 'min' : 'maj', 7: minor ? 'm7' : '7', maj7: 'maj7', m7: 'm7', 9: minor ? 'm9' : '9', add9: minor ? 'madd9' : 'add9',
      sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', 6: minor ? 'm6' : '6', dim: 'dim', '°': 'dim', dim7: 'dim7', m7b5: 'm7b5', ø: 'm7b5', 5: '5', maj9: 'maj9',
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
  const tones = (c) => SS.chordNotes(60 + c.rootPc, c.type).map(pcOf);
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
  function drumSteps(sound, mode, grooveId, bars, r, { perc = false, last = false } = {}) {
    const n = bars * SPB;
    const out = new Array(n).fill(0);
    if (!mode || mode === 'off') return out;
    const g = G[grooveId] || G.synthpop;
    const k = kind(sound);
    const put = (s, v) => s >= 0 && s < n && (out[s] = vel(r, v));
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
      return out;
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
      if (fill && k === 'bk') pat = pat.slice(0, 12) + 'oxox';
      if (fill && k === 'hh') pat = pat.slice(0, 12) + '----';
      bar(b, pat, mode === 'light' ? 0.8 : 1);
    }
    return out;
  }

  /* ---------- basse ---------- */
  const bassMidi = (pc) => 33 + pcOf(pc - 9); // de La1 à Sol♯2
  function bassEvents(spans, mode, r) {
    const ev = [];
    const add = (s, len, n, v) => len > 0 && ev.push({ step: s, len, notes: [n], vel: vel(r, v) });
    spans.forEach((sp, i) => {
      const root = bassMidi(sp.chord.rootPc);
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
      if (next && ['8', 'oct', 'pulse8'].includes(mode) && next.chord.rootPc !== sp.chord.rootPc && r() < 0.5) {
        const target = bassMidi(next.chord.rootPc);
        const appr = target + (target > root ? -1 : 2);
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
  function chordEvents(spans, mode, r, { lo = 55, hi = 79 } = {}) {
    const ev = [];
    let prev = null;
    const add = (s, len, notes, v) => len > 0 && ev.push({ step: s, len, notes: [...notes], vel: vel(r, v) });
    spans.forEach((sp) => {
      const notes = voiceChord(sp.chord, prev, lo, hi);
      prev = notes;
      const end = sp.step + sp.len;
      if (mode === 'sustain') add(sp.step, sp.len, notes, 0.62);
      else if (mode === 'swell') add(sp.step, sp.len, notes, 0.45);
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
      else return;
      for (let s = sp.step, i = 0; s < end; s += dt, i++) {
        if (mode === 'pluck16' && ![0, 3, 6, 8, 11, 14].includes(s % SPB)) continue;
        add(s, dt === 1 ? 1 : 2, seq[i % seq.length], i % 4 === 0 ? 0.78 : 0.6);
      }
    });
    return ev;
  }

  /* ---------- mélodies (lead, voix, sax) ---------- */
  // cellules rythmiques d'un temps (4 pas) : [début, longueur]
  const CELLS = {
    q: [[0, 4]], ee: [[0, 2], [2, 2]], r: [], off: [[2, 2]], dot: [[0, 3], [3, 1]], es: [[0, 2], [2, 1], [3, 1]], se: [[0, 1], [1, 1], [2, 2]], ss: [[0, 1], [1, 1], [2, 1], [3, 1]], h: 'h',
  };
  const DENS = {
    verse: { q: 3, ee: 3, r: 2.5, off: 1.5, h: 1.2, dot: 1 },
    hook: { ee: 3, q: 2.5, dot: 1.5, h: 1.5, off: 1.2, es: 0.6 },
    long: { h: 5, q: 2, r: 2 },
    solo: { es: 2, se: 2, ee: 3, q: 1, dot: 1, ss: 1 },
    drop: { off: 2, ee: 2.5, es: 1.5, se: 1.5, dot: 1.5, r: 0.8 },
    riff: { ss: 2, es: 2, se: 2, ee: 2 },
    answer: { ee: 3, q: 2, off: 2, es: 1 },
  };
  function rhythm2(r, mode, { endLong = false } = {}) {
    // deux mesures (32 pas) ; une blanche occupe deux temps
    const out = [];
    for (let beat = 0; beat < 8; beat++) {
      if (mode === 'answer' && beat < 4) continue; // réponse : seulement la 2e mesure
      if (endLong && beat >= 6) {
        out.push([beat * 4, 32 - beat * 4]);
        break;
      }
      const c = weighted(r, DENS[mode] || DENS.verse);
      if (c === 'h' && beat % 2 === 0 && beat < 7) {
        out.push([beat * 4, 8]);
        beat++;
        continue;
      }
      (CELLS[c] === 'h' ? CELLS.q : CELLS[c]).forEach(([o, l]) => out.push([beat * 4 + o, l]));
    }
    if (!out.length) out.push([0, 8]);
    return out;
  }
  const CENTER = { verse: 64, hook: 70, long: 69, solo: 69, drop: 72, riff: 71, answer: 70, rise: 67 };

  function melodyEvents(spans, mode, r, key, bars) {
    const ev = [];
    if (mode === 'rise') {
      // montée : la tonique répétée, en croches puis en doubles-croches, une octave plus haut à mi-chemin
      const t = 60 + pcOf(H().scale(key)[0].pc);
      for (let s = 0; s < bars * SPB; s += s >= (bars - 2) * SPB ? 1 : 2) {
        const up = s >= (bars * SPB) / 2 ? 12 : 0;
        if (s < bars * SPB - 4) ev.push({ step: s, len: 1, notes: [t + up], vel: vel(r, 0.5 + (0.4 * s) / (bars * SPB)) });
      }
      return ev;
    }
    const scalePcs = H().scale(key).map((d) => d.pc);
    const center = CENTER[mode] || 67;
    const lo = center - 8;
    const hi = center + 9;
    const chordAt = (s) => (spans.find((sp) => s >= sp.step && s < sp.step + sp.len) || spans[spans.length - 1]).chord;
    const stepScale = (n, dir) => {
      let m = n + dir;
      while (!scalePcs.includes(pcOf(m))) m += dir;
      return m;
    };
    // motifs : A (2 mesures), B (2 mesures, fin longue), contours
    const motA = rhythm2(r, mode);
    const motB = rhythm2(r, mode, { endLong: !['drop', 'riff', 'solo'].includes(mode) });
    const contour = Array.from({ length: 16 }, () => pick(r, [1, 1, 1, -1, -1, 2, -2, 0]));
    let prev = nearest(tones(spans[0].chord)[1] ?? tones(spans[0].chord)[0], center);
    const pairs = Math.ceil(bars / 2);
    for (let p = 0; p < pairs; p++) {
      const isB = pairs >= 2 && (p % 4 === 3 || p === pairs - 1);
      const mot = isB ? motB : motA;
      const base = p * 2 * SPB;
      // les répétitions de A reprennent le même contour (motif reconnaissable), B le renverse
      mot.forEach(([o, len], i) => {
        const s = base + o;
        if (s >= bars * SPB) return;
        const c = chordAt(s);
        const ct = tones(c);
        let dir = contour[i % contour.length] * (isB ? -1 : 1);
        let n;
        if (o % 4 === 0 || len >= 4 || i === 0) {
          // temps fort ou note longue : une note de l'accord, dans la direction du contour
          const cands = ct.map((pc) => nearest(pc, prev + dir * 2)).sort((a, b) => Math.abs(a - (prev + dir * 2)) - Math.abs(b - (prev + dir * 2)));
          n = cands[0];
        } else n = dir === 0 ? prev : stepScale(prev, dir > 0 ? 1 : -1);
        if (n > hi) n -= 12;
        if (n < lo) n += 12;
        // fin de phrase B : on se pose sur la fondamentale ou la tierce (résolution)
        if (isB && i === mot.length - 1) n = nearest(pick(r, [ct[0], ct[1] ?? ct[0]]), prev);
        const strong = o % 8 === 0;
        ev.push({ step: s, len: Math.min(len, bars * SPB - s), notes: [n], vel: vel(r, len >= 8 ? 0.74 : strong ? 0.86 : 0.7) });
        prev = n;
      });
    }
    return ev;
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
   * → { key, scenes: [{ id, name, bars, key, emotion, data }], song: [{ scene, repeat }] }
   */
  function build(spec, presetId, tracks) {
    const key = parseKey(spec.key);
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
      const k = sec.key ? parseKey(sec.key) : key;
      const spans = spansOf(sec, k, bars);
      const data = {};
      tracks.forEach((t) => {
        const [role, sound] = (t.band && t.band.key ? t.band.key : '').split(':');
        const r = rng(`${presetId}/${id}/${t.band ? t.band.key : t.id}`);
        if (t.type === 'drum') {
          const mode = role === 'perc' ? sec.perc ?? sec.drums : sec.drums;
          data[t.id] = { steps: drumSteps(sound || t.sound, mode, sec.groove || spec.groove, bars, r, { perc: role === 'perc', last: sec.fill !== false }) };
          return;
        }
        const mode = sec[role];
        let events = [];
        if (mode) {
          if (role === 'bass') events = bassEvents(spans, mode, r);
          else if (role === 'arp') events = arpEvents(spans, mode, r);
          else if (['lead', 'vox', 'sax'].includes(role)) events = melodyEvents(spans, mode, r, k, bars);
          else if (role === 'arpchord') events = arpEvents(spans, mode, r);
          else {
            // nappe, cordes, piano, guitare : accords (ou arpège si le mode en est un)
            const range = role === 'keys' ? { lo: 57, hi: 79 } : role === 'guitar' ? { lo: 52, hi: 74 } : role === 'strings' ? { lo: 55, hi: 81 } : { lo: 53, hi: 76 };
            events = ['up16', 'updown16', 'up8', 'bells', 'strobe', 'pluck16'].includes(mode) ? arpEvents(spans, mode, r) : chordEvents(spans, mode, r, range);
          }
        }
        data[t.id] = { events };
      });
      if (sec.gap) gapEnd(data, bars);
      const sc = { id: SS.uid(), sec: id, name: sec.name || NAMES[id] || id, bars, key: k, data };
      if (spec.emotion) sc.emotion = sec.emotion || spec.emotion;
      return sc;
    });
    const song = form.map((f) => ({ scene: scenes[order.indexOf(f.id)].id, repeat: f.repeat }));
    return { key, scenes, song };
  }

  return { build, parseChord, spansOf, _rng: rng };
})();
