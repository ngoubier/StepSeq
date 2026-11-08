/*
 * Aide à la composition : tonalité du projet, gamme, accords diatoniques, identification des accords
 * et vérificateur d'harmonie. Reprend les règles du skill « composition-harmonie-synthetiseur »
 * (.claude/skills/composition-harmonie-synthetiseur).
 *
 * project.key = { tonic: "D", mode: "minor" }   (absent = pas de tonalité choisie)
 *   tonic : nom de note anglais avec altération (C, C♯, D♭, …) ; mode : major | minor | harmonic.
 *
 * Tout est calculé ici, sans réseau ni IA : le résultat est déterministe et vérifiable.
 */
window.SS = window.SS || {};

SS.harmony = (() => {
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const FR = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

  const MODES = [
    { id: 'major', label: 'Majeur', iv: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'minor', label: 'Mineur naturel', iv: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'harmonic', label: 'Mineur harmonique', iv: [0, 2, 3, 5, 7, 8, 11] },
  ];
  const TONICS = ['C', 'C♯', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  const pcOf = (m) => ((m % 12) + 12) % 12;
  const findMode = (id) => MODES.find((m) => m.id === id);

  function parseName(name) {
    const letter = name[0];
    let acc = 0;
    for (const ch of name.slice(1)) acc += ch === '♯' || ch === '#' ? 1 : ch === '♭' || ch === 'b' ? -1 : 0;
    return { letter, acc, pc: pcOf(NATURAL[LETTERS.indexOf(letter)] + acc) };
  }
  const accStr = (a) => (a === 2 ? '𝄪' : a === -2 ? '𝄫' : a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));
  const spellLetter = (letter, pc) => {
    const a = ((pc - NATURAL[LETTERS.indexOf(letter)] + 18) % 12) - 6;
    return letter + accStr(a);
  };
  /** Nom français : « Si♭ », « Fa♯ ». */
  const french = (name) => FR[name[0]] + name.slice(1);

  function valid(key) {
    return !!(key && TONICS.includes(key.tonic) && findMode(key.mode));
  }

  /** Les 7 degrés de la gamme : { pc, name } avec l'orthographe correcte (une lettre par degré). */
  function scale(key) {
    const t = parseName(key.tonic);
    const li = LETTERS.indexOf(t.letter);
    return findMode(key.mode).iv.map((iv, i) => {
      const pc = pcOf(t.pc + iv);
      return { pc, name: spellLetter(LETTERS[(li + i) % 7], pc) };
    });
  }

  /** Nom d'une classe de note dans le contexte de la tonalité (bémols dans les tons à bémols). */
  function spell(key, pc) {
    pc = pcOf(pc);
    if (!valid(key)) return SS.NOTE_NAMES[pc];
    const sc = scale(key);
    const hit = sc.find((d) => d.pc === pc);
    if (hit) return hit.name;
    // note étrangère : altération d'un degré voisin, dans le sens des altérations de la tonalité
    const flats = sc.some((d) => d.name.includes('♭')) || (key.tonic.includes('♭') && !key.tonic.includes('♯'));
    const below = sc.find((d) => d.pc === pcOf(pc - 1));
    const above = sc.find((d) => d.pc === pcOf(pc + 1));
    if (key.mode !== 'major') {
      // en mineur, les degrés VI et VII haussés (mineur mélodique / harmonique) s'écrivent avec un dièse ou un bécarre
      if (pc === pcOf(sc[0].pc + 11)) return spellLetter(sc[6].name[0], pc);
      if (pc === pcOf(sc[0].pc + 9)) return spellLetter(sc[5].name[0], pc);
    }
    if (flats && above) return spellLetter(above.name[0], pc);
    if (below) return spellLetter(below.name[0], pc);
    return SS.NOTE_NAMES[pc];
  }

  const QUALITY = { maj: 'majeur', min: 'mineur', dim: 'diminué', aug: 'augmenté', 7: 'septième de dominante' };
  const SUFFIX = { maj: '', min: 'm', 7: '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', dim: '°', aug: '+', add9: 'add9', m9: 'm9', 5: '5' };

  function triadType(third, fifth) {
    if (third === 4 && fifth === 7) return 'maj';
    if (third === 3 && fifth === 7) return 'min';
    if (third === 3 && fifth === 6) return 'dim';
    if (third === 4 && fifth === 8) return 'aug';
    return null;
  }

  function numeral(degree, type) {
    const lower = ['min', 'dim', 'm7', 'm9'].includes(type);
    let r = lower ? ROMAN[degree].toLowerCase() : ROMAN[degree];
    if (type === 'dim') r += '°';
    if (type === 'aug') r += '+';
    if (type === '7') r += '7';
    if (type === 'maj7') r += 'maj7';
    if (type === 'm7') r += '7';
    return r;
  }

  /** Rôle d'un accord selon son degré (repos / préparation / tension), d'après la pratique tonale. */
  function role(key, degree, type) {
    const major = key.mode === 'major';
    if (degree === 0) return { id: 'repos', label: 'repos', text: 'tonique : sensation d’arrivée' };
    if (degree === 4) {
      if (type === 'maj' || type === '7') return { id: 'tension', label: 'tension', text: 'dominante : sa tierce est la sensible, elle appelle la tonique' };
      return { id: 'tension', label: 'tension faible', text: 'v mineur : sans sensible, la tension est plus douce' };
    }
    if (degree === 6) {
      if (type === 'dim') return { id: 'tension', label: 'tension', text: 'contient la sensible et le triton' };
      return { id: 'tension', label: 'retour ouvert', text: 'VII → i : retour sans sensible, fréquent en synthwave' };
    }
    if (degree === 1 || degree === 3) return { id: 'prep', label: 'préparation', text: 'prédominante : prépare la dominante ou la tonique' };
    if (degree === 5 && !major) return { id: 'prep', label: 'préparation', text: 'VI : couleur, mène souvent vers VII ou iv' };
    return { id: 'repos', label: 'repos', text: major ? 'proche de la tonique (notes communes)' : 'relatif majeur : repos lumineux' };
  }

  /** Accords diatoniques (triades) de la tonalité, puis emprunts utiles. */
  function chords(key) {
    const sc = scale(key);
    const list = sc.map((d, i) => {
      const third = pcOf(sc[(i + 2) % 7].pc - d.pc);
      const fifth = pcOf(sc[(i + 4) % 7].pc - d.pc);
      const type = triadType(third, fifth);
      return {
        degree: i,
        rootPc: d.pc,
        type,
        name: d.name + SUFFIX[type],
        numeral: numeral(i, type),
        notes: [sc[i].name, sc[(i + 2) % 7].name, sc[(i + 4) % 7].name],
        quality: QUALITY[type],
        role: role(key, i, type),
        borrowed: false,
      };
    });
    // dominante avec septième, et en mineur naturel la dominante majeure empruntée au mineur harmonique
    const d5 = sc[4];
    const lead = spell({ ...key, mode: key.mode === 'major' ? 'major' : 'harmonic' }, d5.pc + 4);
    const v7 = {
      degree: 4,
      rootPc: d5.pc,
      type: '7',
      name: d5.name + '7',
      numeral: 'V7',
      notes: [d5.name, lead, sc[1].name, sc[3].name],
      quality: QUALITY[7],
      role: role(key, 4, '7'),
      borrowed: key.mode === 'minor',
    };
    const extra = [];
    if (key.mode === 'minor') {
      extra.push({ ...v7, type: 'maj', name: d5.name, numeral: 'V', notes: [d5.name, lead, sc[1].name], quality: QUALITY.maj, role: role(key, 4, 'maj'), borrowed: true });
    }
    extra.push(v7);
    return { diatonic: list, extra };
  }

  /** Identifie un accord à partir de ses notes (renversements compris). → { rootPc, type, bassPc } ou null */
  function identify(notes) {
    if (!notes || notes.length < 2) return null;
    const sorted = [...notes].sort((a, b) => a - b);
    const pcs = [...new Set(sorted.map(pcOf))];
    const bassPc = pcOf(sorted[0]);
    // essaie d'abord la basse comme fondamentale, puis les autres notes
    const order = [bassPc, ...pcs.filter((p) => p !== bassPc)];
    for (const root of order) {
      const set = new Set(pcs.map((p) => pcOf(p - root)));
      for (const c of SS.CHORDS) {
        const cs = new Set(c.iv.map(pcOf));
        if (cs.size === set.size && [...cs].every((x) => set.has(x))) return { rootPc: root, type: c.id, bassPc };
      }
    }
    return null;
  }

  /** Nom d'un accord identifié : « G », « Am », « C/E » (renversement : note de basse après la barre). */
  function chordName(key, id) {
    const name = spell(key, id.rootPc) + (SUFFIX[id.type] ?? '');
    return id.bassPc !== id.rootPc ? name + '/' + spell(key, id.bassPc) : name;
  }

  const TYPE_IV = (type) => (SS.CHORDS.find((c) => c.id === type) || SS.CHORDS[0]).iv;

  /** Degré et statut d'un accord identifié dans la tonalité. */
  function analyzeChord(key, id) {
    const sc = scale(key);
    const inScale = new Set(sc.map((d) => d.pc));
    const pcs = TYPE_IV(id.type).map((i) => pcOf(id.rootPc + i));
    const deg = sc.findIndex((d) => d.pc === id.rootPc);
    let num;
    if (deg >= 0) num = numeral(deg, id.type);
    else {
      const up = sc.findIndex((d) => d.pc === pcOf(id.rootPc + 1));
      const down = sc.findIndex((d) => d.pc === pcOf(id.rootPc - 1));
      num = up >= 0 ? '♭' + numeral(up, id.type) : down >= 0 ? '♯' + numeral(down, id.type) : '?';
    }
    if (pcs.every((p) => inScale.has(p))) return { numeral: num, status: 'diatonique' };
    if (key.mode === 'minor') {
      const harm = new Set(scale({ ...key, mode: 'harmonic' }).map((d) => d.pc));
      if (pcs.every((p) => harm.has(p))) return { numeral: num, status: 'emprunt', why: 'emprunt au mineur harmonique (sensible haussée)' };
    }
    if (key.mode === 'major') {
      const par = new Set(scale({ ...key, mode: 'minor' }).map((d) => d.pc));
      if (pcs.every((p) => par.has(p))) return { numeral: num, status: 'emprunt', why: 'emprunt au mineur homonyme' };
    }
    return { numeral: num, status: 'chromatique', why: 'contient des notes hors de la tonalité' };
  }

  /* ---------------- Estimation de la tonalité (profils de Krumhansl-Kessler) ---------------- */
  const PROFILE = {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  };
  const MAJOR_TONICS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const MINOR_TONICS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

  function corr(a, b) {
    const ma = a.reduce((x, y) => x + y, 0) / 12;
    const mb = b.reduce((x, y) => x + y, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) {
      n += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? n / Math.sqrt(da * db) : 0;
  }

  /** Toutes les scènes (ou les pistes si le projet n'a pas de scènes) : [{ name, bars, tracks: [{ track, events }] }]. */
  function sections(p) {
    const inst = p.tracks.filter((t) => t.type === 'instrument');
    if (!p.scenes || !p.scenes.length) return [{ name: '', bars: p.bars, tracks: inst.map((t) => ({ track: t, events: t.events || [] })) }];
    SS.commitScene(p);
    return p.scenes.map((sc) => ({
      id: sc.id,
      name: sc.name,
      bars: sc.bars,
      tracks: inst.map((t) => ({ track: t, events: (sc.data[t.id] && sc.data[t.id].events) || [] })),
    }));
  }

  /** Histogramme des classes de notes, pondéré par la durée ; les basses comptent double. */
  function histogram(p) {
    const h = new Array(12).fill(0);
    for (const sec of sections(p))
      for (const { events } of sec.tracks)
        for (const ev of events) for (const n of ev.notes) h[pcOf(n)] += ev.len * (n < 48 ? 2 : 1);
    return h;
  }

  /** → { key, score, second } ou null si le projet n'a pas de notes. */
  function detect(p) {
    const h = histogram(p);
    if (!h.some((x) => x > 0)) return null;
    const cands = [];
    for (let t = 0; t < 12; t++)
      for (const mode of ['major', 'minor']) {
        const prof = PROFILE[mode].map((_, i) => PROFILE[mode][pcOf(i - t)]);
        cands.push({ key: { tonic: (mode === 'major' ? MAJOR_TONICS : MINOR_TONICS)[t], mode }, score: corr(h, prof) });
      }
    cands.sort((a, b) => b.score - a.score);
    // la tonalité relative partage les mêmes notes : on la signale comme alternative
    return { ...cands[0], second: cands[1] };
  }

  /* ---------------- Vérificateur d'harmonie ---------------- */

  function position(p, step) {
    const spb = SS.stepsPerBar(p);
    const beat = SS.stepsPerBeat(p);
    const bar = Math.floor(step / spb) + 1;
    const inBar = step % spb;
    const b = Math.floor(inBar / beat) + 1;
    const sub = inBar % beat;
    return `mes. ${bar}, temps ${b}` + (sub ? ` +${sub}/${beat}` : '');
  }

  const isStrong = (p, step) => {
    const spb = SS.stepsPerBar(p);
    const s = step % spb;
    return s === 0 || (p.timeSig[0] === 4 && p.timeSig[1] === 4 && s === spb / 2);
  };

  /**
   * Analyse de toutes les scènes. Pour chaque scène :
   *  - progressions : accords des pistes Accord / Arpège, avec degrés ;
   *  - remarques : notes hors tonalité, temps forts hors accord, grands déplacements entre accords.
   * Chaque remarque est une piste de réflexion, pas une erreur : « tension voulue ? ».
   */
  function analyze(p) {
    const key = p.key;
    const scaleSet = new Set(scale(key).map((d) => d.pc));
    const leading = pcOf(scale(key)[0].pc + 11);
    const out = [];
    for (const sec of sections(p)) {
      const res = { name: sec.name, progressions: [], remarks: [] };
      const chordTracks = sec.tracks.filter(({ track }) => track.category !== 'mono');
      const borrowed = new Map(); // nom d'accord -> { numeral, status, why, tracks, steps } (une remarque par accord)
      // accords qui sonnent à un pas donné (toutes pistes Accord / Arpège confondues)
      const chordAt = (step) => {
        const pcs = new Set();
        let id = null;
        for (const { events } of chordTracks)
          for (const ev of events)
            if (step >= ev.step && step < ev.step + ev.len) {
              ev.notes.forEach((n) => pcs.add(pcOf(n)));
              id = id || identify(ev.notes);
            }
        return pcs.size ? { pcs, id } : null;
      };

      for (const { track, events } of chordTracks) {
        const evs = [...events].sort((a, b) => a.step - b.step);
        if (!evs.length) continue;
        const items = evs.map((ev) => {
          const id = identify(ev.notes);
          if (!id) return { step: ev.step, name: ev.notes.map((n) => spell(key, n)).join('–'), numeral: '?', status: 'inconnu' };
          return { step: ev.step, name: chordName(key, id), ...analyzeChord(key, id) };
        });
        res.progressions.push({ track: track.name, items });
        items
          .filter((it) => it.status === 'chromatique' || it.status === 'emprunt')
          .forEach((it) => {
            if (!borrowed.has(it.name)) borrowed.set(it.name, { ...it, tracks: new Set(), steps: new Set() });
            const b = borrowed.get(it.name);
            b.tracks.add(track.name);
            b.steps.add(Math.floor(it.step / SS.stepsPerBar(p)) * SS.stepsPerBar(p));
          });
        // voice leading : plus grand déplacement d'une voix entre deux accords consécutifs
        for (let i = 1; i < evs.length; i++) {
          const a = evs[i - 1].notes;
          const b = evs[i].notes;
          const move = Math.max(...b.map((n) => Math.min(...a.map((m) => Math.abs(n - m)))));
          const common = b.filter((n) => a.includes(n)).length;
          if (move >= 7 && track.category === 'chord')
            res.remarks.push({
              kind: 'tip',
              track: track.name,
              where: position(p, evs[i].step),
              text: `${items[i - 1].name} → ${items[i].name} : une voix saute de ${move} demi-tons (${common} note${common > 1 ? 's' : ''} commune${common > 1 ? 's' : ''}).`,
              hint: 'Essayer un renversement pour garder les notes communes et bouger par petits pas.',
            });
        }
      }

      for (const b of borrowed.values()) {
        const bars = [...b.steps].sort((x, y) => x - y).map((st) => Math.floor(st / SS.stepsPerBar(p)) + 1);
        res.remarks.unshift({
          kind: b.status === 'emprunt' ? 'info' : 'warn',
          track: [...b.tracks].join(', '),
          where: 'mes. ' + bars.join(', '),
          text: `${b.name} (${b.numeral}) : ${b.why}.`,
          hint: b.status === 'emprunt' ? 'Normal en mineur : la sensible renforce la résolution vers la tonique.' : 'Emprunt ou couleur voulue ? Sinon, vérifier la fondamentale et le type d’accord.',
        });
      }
      // pistes Mono (basse, lead…) : les accords sont déjà analysés plus haut
      for (const { track, events } of sec.tracks.filter(({ track }) => track.category === 'mono')) {
        // notes hors tonalité (regroupées par note)
        const outside = new Map();
        for (const ev of events)
          for (const n of ev.notes) {
            const pc = pcOf(n);
            if (scaleSet.has(pc)) continue;
            const ctx = chordAt(ev.step);
            // en mineur naturel, la sensible sur une dominante majeure est un emprunt classique
            const isLeading = key.mode === 'minor' && pc === leading && ctx && ctx.id && pcOf(ctx.id.rootPc - scale(key)[4].pc) === 0;
            if (!outside.has(pc)) outside.set(pc, { steps: [], leading: true });
            const o = outside.get(pc);
            o.steps.push(ev.step);
            o.leading = o.leading && isLeading;
          }
        for (const [pc, o] of outside) {
          const steps = [...new Set(o.steps)].sort((a, b) => a - b);
          res.remarks.push({
            kind: o.leading ? 'info' : 'warn',
            track: track.name,
            where: steps.slice(0, 3).map((s) => position(p, s)).join(' · ') + (steps.length > 3 ? ` (+${steps.length - 3})` : ''),
            text: `${spell(key, pc)} n’appartient pas à ${label(key)}.`,
            hint: o.leading
              ? 'Sensible empruntée au mineur harmonique, sur la dominante : attraction vers la tonique.'
              : 'Note chromatique de passage, emprunt ou erreur ? Si elle est voulue, la résoudre par demi-ton.',
          });
        }
        // temps forts : la mélodie sur une note de l'accord ?
        const misses = [];
        for (const ev of events) {
          if (!isStrong(p, ev.step)) continue;
          const ctx = chordAt(ev.step);
          if (!ctx) continue;
          const pc = pcOf(ev.notes[0]);
          if (!ctx.pcs.has(pc)) misses.push({ step: ev.step, note: spell(key, pc), chord: ctx.id ? chordName(key, ctx.id) : '' });
        }
        if (misses.length) {
          res.remarks.push({
            kind: 'tip',
            track: track.name,
            where: misses.slice(0, 3).map((m) => `${position(p, m.step)} : ${m.note}${m.chord ? ' sur ' + m.chord : ''}`).join(' · ') + (misses.length > 3 ? ` (+${misses.length - 3})` : ''),
            text: `${misses.length} temps fort${misses.length > 1 ? 's' : ''} sur une note qui n’est pas dans l’accord.`,
            hint: 'Retard ou tension voulue ? Sinon, placer une note de l’accord sur le temps fort et la note étrangère juste après (note de passage).',
          });
        }
      }
      out.push(res);
    }
    return out;
  }

  function label(key) {
    if (!valid(key)) return 'aucune tonalité';
    const m = { major: 'majeur', minor: 'mineur', harmonic: 'mineur harmonique' }[key.mode];
    return `${french(key.tonic)} ${m}`;
  }

  /* ---------------- Bibliothèque de progressions ---------------- */
  // Reprise du tableau « progressions-et-composition » du skill. Degrés 0–6 dans la gamme majeure (major)
  // ou mineure naturelle (minor) ; le type d'accord est explicite (V7 en mineur = emprunt).
  const PROGRESSIONS = [
    { id: 'pop1', mode: 'major', label: 'I – V – vi – IV', style: 'Pop, synthwave', seq: [[0, 'maj'], [4, 'maj'], [5, 'min'], [3, 'maj']] },
    { id: 'pop2', mode: 'major', label: 'I – vi – IV – V', style: 'Pop lumineuse', seq: [[0, 'maj'], [5, 'min'], [3, 'maj'], [4, 'maj']] },
    { id: 'pop3', mode: 'major', label: 'vi – IV – I – V', style: 'Pop, cinématique (centre ambigu)', seq: [[5, 'min'], [3, 'maj'], [0, 'maj'], [4, 'maj']] },
    { id: 'cad', mode: 'major', label: 'ii – V7 – I – I', style: 'Cadence majeure', seq: [[1, 'min'], [4, '7'], [0, 'maj'], [0, 'maj']] },
    { id: 'min1', mode: 'minor', label: 'i – VI – III – VII', style: 'Mineur, synthwave', seq: [[0, 'min'], [5, 'maj'], [2, 'maj'], [6, 'maj']] },
    { id: 'min2', mode: 'minor', label: 'i – III – VII – VI', style: 'Mineur, montée dramatique', seq: [[0, 'min'], [2, 'maj'], [6, 'maj'], [5, 'maj']] },
    { id: 'min3', mode: 'minor', label: 'i – iv – V7 – i', style: 'Résolution tonale forte (V7 emprunté)', seq: [[0, 'min'], [3, 'min'], [4, '7'], [0, 'min']] },
    { id: 'min4', mode: 'minor', label: 'i – VII – VI – V', style: 'Mouvement descendant (V emprunté)', seq: [[0, 'min'], [6, 'maj'], [5, 'maj'], [4, 'maj']] },
  ];

  /** Un accord de la tonalité, au même format que la palette (voir chords). */
  function makeChord(key, degree, type) {
    const base = { ...key, mode: key.mode === 'major' ? 'major' : 'minor' };
    const sc = scale(base);
    const rootPc = sc[degree].pc;
    const pcs = TYPE_IV(type).map((i) => pcOf(rootPc + i));
    const id = { rootPc, type, bassPc: rootPc };
    const a = analyzeChord(base, id);
    return {
      degree,
      rootPc,
      type,
      name: spell(base, rootPc) + (SUFFIX[type] ?? ''),
      numeral: numeral(degree, type),
      notes: pcs.map((pc) => spell(key.mode === 'major' ? key : { ...key, mode: 'harmonic' }, pc)),
      quality: QUALITY[type] || type,
      role: role(key, degree, type),
      borrowed: a.status === 'emprunt',
    };
  }

  /** Progressions adaptées au mode de la tonalité, transposées. */
  function progressions(key) {
    const minor = key.mode !== 'major';
    return PROGRESSIONS.filter((pr) => (pr.mode === 'minor') === minor).map((pr) => ({
      ...pr,
      chords: pr.seq.map(([d, t]) => makeChord(key, d, t)),
    }));
  }

  /* ---------------- Générateur de couches ---------------- */
  // À partir des accords d'une piste Accord / Arpège, écrit une basse, un arpège ou une esquisse de mélodie
  // dans une autre piste (méthode du skill : basse sur les fondamentales, arpège 1–3–5–3,
  // mélodie avec notes de l'accord sur les temps forts et notes de passage entre eux).
  const GENERATORS = [
    { id: 'bass-whole', group: 'Basse', label: 'Fondamentales tenues', text: 'une note par accord : l’assise harmonique' },
    { id: 'bass-8', group: 'Basse', label: 'Croches sur la fondamentale', text: 'pulsation régulière, accent sur les temps' },
    { id: 'bass-oct', group: 'Basse', label: 'Octaves en croches', text: 'fondamentale / octave en alternance (disco, synthpop)' },
    { id: 'bass-gallop', group: 'Basse', label: 'Galop (1 – et – a)', text: 'basse « roulante » de la synthwave' },
    { id: 'bass-off', group: 'Basse', label: 'Contretemps', text: 'entre les coups de grosse caisse (trance, techno)' },
    { id: 'arp-1353', group: 'Arpège', label: '1 – 3 – 5 – 3 en croches', text: 'le motif de départ du skill' },
    { id: 'arp-up16', group: 'Arpège', label: '1 – 3 – 5 – 8 en doubles-croches', text: 'montant, plus dense' },
    { id: 'mel-sketch', group: 'Mélodie', label: 'Esquisse de mélodie', text: 'notes de l’accord sur les temps forts, notes de passage entre elles' },
  ];

  /** Accords d'une liste d'événements : [{ step, len, rootPc, tones: [pc fondamentale, tierce, quinte, (7e)] }]. */
  function chordSpans(events) {
    return [...events]
      .sort((a, b) => a.step - b.step)
      .map((ev) => {
        const id = identify(ev.notes) || { rootPc: pcOf(ev.notes[0]), type: ev.chord || 'maj' };
        const tones = TYPE_IV(id.type).map((i) => pcOf(id.rootPc + i));
        return { step: ev.step, len: ev.len, rootPc: id.rootPc, tones };
      });
  }

  /** Note MIDI de classe `pc` au plus près de `near`. */
  const nearest = (pc, near) => {
    let m = near - pcOf(near) + pc;
    if (m - near > 6) m -= 12;
    if (near - m > 6) m += 12;
    return m;
  };

  /**
   * Génère les événements d'une couche. `opt` : { kind, octave (de la piste cible), spb, beat, key, length }.
   * Les notes restent dans les accords source et dans la longueur de la piste.
   */
  function generate(sourceEvents, opt) {
    const spans = chordSpans(sourceEvents);
    const out = [];
    const { kind, spb, beat } = opt;
    const add = (step, len, midi, vel) => {
      if (step >= opt.length || len < 1) return;
      out.push({ step, len: Math.min(len, opt.length - step), notes: [midi], vel: Math.round(vel * 100) / 100 });
    };
    const base = (opt.octave + 1) * 12; // Do de l'octave de la piste
    const rootMidi = (pc) => base + pcOf(pc);
    const half = beat / 2 >= 1 ? beat / 2 : 1; // croche (en pas)
    if (kind.startsWith('bass')) {
      for (const sp of spans) {
        const r = rootMidi(sp.rootPc);
        const end = sp.step + sp.len;
        if (kind === 'bass-whole') add(sp.step, sp.len, r, 0.85);
        for (let s = sp.step; s < end && kind !== 'bass-whole'; s += kind === 'bass-gallop' || kind === 'bass-off' ? beat : half) {
          const onBeat = (s - sp.step) % beat === 0;
          if (kind === 'bass-8') add(s, Math.min(half, end - s), r, onBeat ? 0.9 : 0.72);
          if (kind === 'bass-oct') add(s, Math.min(half, end - s), ((s - sp.step) / half) % 2 ? r + 12 : r, ((s - sp.step) / half) % 2 ? 0.72 : 0.9);
          if (kind === 'bass-gallop') {
            add(s, Math.min(beat / 2, end - s), r, 0.92);
            if (beat >= 4 && s + 2 < end) add(s + 2, 1, r, 0.7);
            if (beat >= 4 && s + 3 < end) add(s + 3, 1, r, 0.78);
          }
          if (kind === 'bass-off' && s + half < end) add(s + half, half, r, 0.88);
        }
      }
    } else if (kind.startsWith('arp')) {
      for (const sp of spans) {
        const root = rootMidi(sp.rootPc);
        const t3 = nearest(sp.tones[1], root + 4);
        const t5 = nearest(sp.tones[2], root + 7);
        const pattern = kind === 'arp-1353' ? [root, t3, t5, t3] : [root, t3, t5, root + 12];
        const dt = kind === 'arp-1353' ? half : Math.max(1, beat / 4);
        let i = 0;
        for (let s = sp.step; s < sp.step + sp.len; s += dt, i++) add(s, dt, pattern[i % 4], i % 4 === 0 ? 0.85 : 0.68);
      }
    } else if (kind === 'mel-sketch') {
      // une note de l'accord par demi-mesure (temps forts), au plus près de la précédente ;
      // la note de passage (degré de la gamme voisin de la note suivante) prépare chaque arrivée.
      const sc = opt.key ? scale(opt.key).map((d) => d.pc) : null;
      const unit = spb % 2 === 0 ? spb / 2 : spb;
      const targets = [];
      let prev = base + (spans[0] ? pcOf(spans[0].tones[1]) : 4); // départ sur la tierce de l'accord, dans l'octave de la piste
      if (prev < base + 4) prev += 12;
      spans.forEach((sp, ci) => {
        for (let s = sp.step; s < sp.step + sp.len; s += unit) {
          const k = targets.length;
          // alternance de contours : on vise tour à tour la note de l'accord la plus proche au-dessus, puis au-dessous
          const cands = sp.tones.map((pc) => nearest(pc, prev)).filter((m) => m !== prev || sp.tones.length === 1);
          const up = cands.filter((m) => m >= prev).sort((a, b) => a - b)[0];
          const down = cands.filter((m) => m <= prev).sort((a, b) => b - a)[0];
          let m = (Math.floor(k / 2) + ci) % 2 === 0 ? up ?? down : down ?? up;
          if (m > base + 19) m = down ?? m - 12; // tessiture : environ une octave et demie au-dessus du Do de la piste
          if (m < base + 2) m = up ?? m + 12;
          targets.push({ step: s, len: Math.min(unit, sp.step + sp.len - s), midi: m });
          prev = m;
        }
      });
      targets.forEach((t, i) => {
        const next = targets[i + 1];
        const pass = next && sc && t.len >= 4 ? passing(sc, t.midi, next.midi) : null;
        if (pass != null) {
          add(t.step, t.len - Math.max(1, Math.round(t.len / 4)), t.midi, t.step % spb === 0 ? 0.85 : 0.78);
          const pl = Math.max(1, Math.round(t.len / 4));
          add(t.step + t.len - pl, pl, pass, 0.66);
        } else add(t.step, t.len, t.midi, t.step % spb === 0 ? 0.85 : 0.78);
      });
    }
    return out;
  }

  /** Note de la gamme juste avant `to` en venant de `from` (note de passage), ou null si les deux sont égales. */
  function passing(scalePcs, from, to) {
    if (from === to) return null;
    const dir = to > from ? -1 : 1; // on approche la cible par le degré voisin, du côté d'où l'on vient
    for (let d = 1; d <= 2; d++) {
      const m = to + dir * d;
      if (scalePcs.includes(pcOf(m)) && m !== from) return m;
    }
    return null;
  }

  /**
   * Notes MIDI d'un accord de la palette (position fondamentale) : fondamentale au plus près de `near`
   * (l'accord précédent), sans s'éloigner de plus d'une quinte du centre `center` de la piste — sinon les
   * enchaînements dériveraient vers le grave ou l'aigu.
   */
  function voice(chord, near, center = near) {
    let root = nearest(chord.rootPc, near);
    if (root - center > 7) root -= 12;
    if (center - root > 7) root += 12;
    return SS.chordNotes(root, chord.type);
  }

  return { MODES, TONICS, GENERATORS, valid, scale, spell, french, chords, progressions, identify, chordName, analyzeChord, detect, analyze, generate, label, voice, pcOf };
})();
