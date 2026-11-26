/*
 * Lire une partition (maquette-partition-midi.html) : MusicXML / MXL, ou notes lues par Claude → partition → fichier MIDI.
 *
 * Partition interne (temps en noires, 1 = une noire) :
 *   { title, tempo, tempoText, timeSig: [n, d], key: { sf, minor },
 *     parts: [{ name, program, notes: [{ p, t, d, v }] }],
 *     bars: [{ n, start, len, expected, suspect }], chords: [{ t, d, name }] }
 *
 *   SS.scoreRead.fromMusicXML(texte)          → partition (Audiveris, MuseScore, Sibelius, Finale, Dorico…)
 *   SS.scoreRead.unzipMxl(octets)             → texte MusicXML d'un .mxl (zip) — asynchrone
 *   SS.scoreRead.fromNotes(objet)             → partition (format écrit par Claude, StepSeq.lirePartition)
 *   SS.scoreRead.toMidi(partition, options)   → Uint8Array (fichier .mid type 1)
 *
 * Une mesure « suspecte » n'a pas le bon nombre de temps : note ou silence mal lu.
 */
(function (root) {
  const SS = (root.SS = root.SS || {});

  /* ---------------- Tempo écrit en mots ---------------- */
  const TEMPO_WORDS = [
    [/grave/i, 40], [/largo|lento/i, 50], [/larghetto/i, 63], [/adagio/i, 70], [/andantino/i, 88], [/andante/i, 80],
    [/moderato/i, 108], [/allegretto/i, 112], [/allegro/i, 132], [/vivace/i, 160], [/presto/i, 180], [/prestissimo/i, 200],
  ];
  const tempoOfWords = (s) => {
    for (const [re, bpm] of TEMPO_WORDS) if (re.test(s)) return bpm;
    return null;
  };

  /* ---------------- Sons proposés (programme General MIDI) ---------------- */
  const PROGRAMS = [
    [0, 'Piano'], [4, 'Piano électrique'], [6, 'Clavecin'], [19, 'Orgue'], [24, 'Guitare'], [32, 'Basse'],
    [40, 'Violon'], [41, 'Alto'], [42, 'Violoncelle'], [43, 'Contrebasse'], [48, 'Cordes'], [46, 'Harpe'],
    [52, 'Chœur'], [56, 'Trompette'], [57, 'Trombone'], [60, 'Cor'], [61, 'Cuivres'], [65, 'Saxophone'],
    [68, 'Hautbois'], [70, 'Basson'], [71, 'Clarinette'], [73, 'Flûte'], [80, 'Lead synthé'], [89, 'Nappe'],
  ];
  const NAME_PROGRAM = [
    [/piano|klavier|pf\b|pno/i, 0], [/clavecin|harpsi/i, 6], [/orgue|organ/i, 19], [/guit/i, 24], [/basse\b|bass guit|e\.? ?bass/i, 32],
    [/violon\b|violin|vln|vl\b/i, 40], [/alto\b|viola|vla/i, 41], [/violoncel|cello|vc\b/i, 42], [/contreb|double bass|kontrab|cb\b/i, 43],
    [/cordes|strings/i, 48], [/harpe|harp/i, 46], [/ch[oœ]e?ur|choir|voi[xc]|soprano|alto voice|t[ée]nor|baryton|bass voice|chant/i, 52],
    [/trompette|trumpet|tpt/i, 56], [/trombone|tbn/i, 57], [/\bcor\b|horn/i, 60], [/sax/i, 65], [/hautbois|oboe/i, 68],
    [/basson|bassoon|fagott/i, 70], [/clarinet/i, 71], [/fl[uû]te|flute|piccolo/i, 73],
  ];
  const guessProgram = (name) => {
    for (const [re, p] of NAME_PROGRAM) if (re.test(name || '')) return p;
    return 0;
  };

  /* ---------------- Tonalités (armure → nom) ---------------- */
  const MAJ = ['Do♭', 'Sol♭', 'Ré♭', 'La♭', 'Mi♭', 'Si♭', 'Fa', 'Do', 'Sol', 'Ré', 'La', 'Mi', 'Si', 'Fa♯', 'Do♯'];
  const MIN = ['La♭', 'Mi♭', 'Si♭', 'Fa', 'Do', 'Sol', 'Ré', 'La', 'Mi', 'Si', 'Fa♯', 'Do♯', 'Sol♯', 'Ré♯', 'La♯'];
  const keyLabel = ({ sf = 0, minor = false } = {}) => `${(minor ? MIN : MAJ)[Math.max(-7, Math.min(7, sf)) + 7]} ${minor ? 'mineur' : 'majeur'}`;
  const KEYS = [];
  for (let sf = -7; sf <= 7; sf++) KEYS.push({ sf, minor: false, label: keyLabel({ sf }) }, { sf, minor: true, label: keyLabel({ sf, minor: true }) });
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/♯/g, '#').replace(/♭/g, 'b').toLowerCase().replace(/\s+/g, ' ').trim();
  /** « Fa majeur », « Ré mineur », « F », « Dm », « Sib majeur » → { sf, minor } (Do majeur sinon). */
  function keyOf(s) {
    if (s && typeof s === 'object') return { sf: +s.sf || 0, minor: !!s.minor };
    const f = fold(s).replace(/#/g, '♯').replace(/(do|re|mi|fa|sol|la|si)b/g, '$1♭');
    const hit = KEYS.find((k) => fold(k.label).replace(/#/g, '♯') === f.replace(/♭/g, 'b').replace(/♯/g, '#') || fold(k.label) === fold(f));
    if (hit) return { sf: hit.sf, minor: hit.minor };
    const m = /^([a-g])([#b♯♭]?)\s*(m|min|mineur|minor)?\b/i.exec(String(s || '').trim());
    if (m) {
      const pc = (SS.LETTER_PC[m[1].toUpperCase()] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0) + 12) % 12;
      const minor = !!m[3];
      for (let sf = -7; sf <= 7; sf++) if (((sf * 7) % 12 + 12 + (minor ? 9 : 0)) % 12 === pc) return { sf, minor };
    }
    return { sf: 0, minor: false };
  }

  /* ---------------- Notes écrites ---------------- */
  const STEP = SS.LETTER_PC;
  const FR = SS.FR_LETTER;
  /** « C4 », « F#5 », « Bb3 », « Sib3 », « Do4 » → numéro MIDI (C4 = 60). */
  function noteOf(tok) {
    let s = String(tok).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
    const fr = /^(do|ré|re|mi|fa|sol|la|si)/i.exec(s);
    if (fr) s = FR[fr[1].toLowerCase()] + s.slice(fr[1].length);
    const m = /^([A-Ga-g])(##|#|bb|b|x)?(-?\d)$/.exec(s);
    if (!m) return null;
    const acc = { '#': 1, '##': 2, x: 2, b: -1, bb: -2 }[m[2]] || 0;
    return Math.max(0, Math.min(127, 12 * (+m[3] + 1) + STEP[m[1].toUpperCase()] + acc));
  }
  /** Durée en noires : « 1 », « 0.5 », « 1.5 », « 1/3 », « 2/3 ». */
  function durOf(s) {
    const t = String(s).trim();
    const fr = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
    const v = fr ? +fr[1] / +fr[2] : +t.replace(',', '.');
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  const DYN = { ppp: 30, pp: 42, p: 55, mp: 68, mf: 82, f: 96, ff: 110, fff: 122, sf: 110, sfz: 110, fp: 96 };

  /* ---------------- Accords chiffrés ---------------- */
  const KIND_SYM = {
    major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
    'diminished-seventh': 'dim7', 'half-diminished': 'm7b5', 'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9',
    'major-ninth': 'maj9', 'minor-ninth': 'm9', 'suspended-fourth': 'sus4', 'suspended-second': 'sus2', power: '5',
  };
  /** Notes d'un accord chiffré (« Dm7 », « F/A », « Bb ») autour de Do3–Do4 ; null si illisible. */
  function chordNotes(name) {
    const m = /^([A-G])([#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/.exec(String(name || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b'));
    if (!m) return null;
    let q = m[3].replace(/^min/, 'm').replace(/^maj$/, '').replace(/^M7/, 'maj7').replace(/^-/, 'm').replace(/^°7?/, (x) => (x.length > 1 ? 'dim7' : 'dim')).replace(/^ø7?/, 'm7b5');
    const arp = SS.arp && SS.arp.parseChordSymbol;
    let notes = arp ? arp(m[1] + m[2] + q, 3) : null;
    if (!notes) notes = arp ? arp(m[1] + m[2] + (/^m(?!aj)/.test(q) ? 'm' : ''), 3) : null;
    if (!notes) {
      const r = 48 + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      notes = /^m(?!aj)/.test(q) ? [r, r + 3, r + 7] : [r, r + 4, r + 7];
    }
    if (m[4]) {
      const b = noteOf(m[4] + '2');
      if (b != null) notes = [b, ...notes];
    }
    return notes;
  }

  /* ---------------- Bilan des mesures ---------------- */
  const EPS = 1e-3;
  function finish(score) {
    const parts = score.parts.filter((p) => p.notes.length);
    score.parts = parts.length ? parts : score.parts;
    score.parts.forEach((p) => p.notes.sort((a, b) => a.t - b.t || a.p - b.p));
    score.suspects = score.bars.filter((b) => b.suspect).map((b) => b.n);
    score.length = score.bars.length ? score.bars[score.bars.length - 1].start + score.bars[score.bars.length - 1].len : 0;
    score.noteCount = score.parts.reduce((s, p) => s + p.notes.length, 0);
    return score;
  }

  /* ---------------- MusicXML ---------------- */
  const kid = (el, tag) => (el ? [...el.children].find((c) => c.localName === tag) || null : null);
  const kids = (el, tag) => (el ? [...el.children].filter((c) => c.localName === tag) : []);
  const txt = (el, tag) => {
    const k = tag ? kid(el, tag) : el;
    return k ? k.textContent.trim() : '';
  };

  function fromMusicXML(text) {
    const doc = new DOMParser().parseFromString(String(text), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('fichier MusicXML illisible');
    const rootEl = doc.documentElement;
    if (rootEl.localName === 'score-timewise') throw new Error('MusicXML « timewise » non pris en charge : exporte-le en « partwise »');
    if (rootEl.localName !== 'score-partwise') throw new Error('ce fichier n’est pas une partition MusicXML');
    const score = { title: '', tempo: null, tempoText: '', timeSig: null, key: null, parts: [], bars: [], chords: [] };
    score.title = txt(kid(rootEl, 'work'), 'work-title') || txt(rootEl, 'movement-title') || '';
    const info = {};
    for (const sp of kids(kid(rootEl, 'part-list'), 'score-part')) {
      const mi = kid(sp, 'midi-instrument');
      const prog = mi && kid(mi, 'midi-program') ? +txt(mi, 'midi-program') - 1 : null;
      const ch = mi && kid(mi, 'midi-channel') ? +txt(mi, 'midi-channel') : null;
      const name = txt(sp, 'part-name') || txt(sp, 'part-abbreviation') || sp.getAttribute('id');
      info[sp.getAttribute('id')] = { name, program: prog != null && prog >= 0 ? prog : guessProgram(name), drum: ch === 10 };
    }
    const barMap = new Map(); // index de mesure → bilan
    kids(rootEl, 'part').forEach((partEl, pi) => {
      const pinf = info[partEl.getAttribute('id')] || { name: `Partie ${pi + 1}`, program: 0 };
      let divisions = 1;
      let beats = 4;
      let beatType = 4;
      let staves = 1;
      let vel = 82;
      let mStart = 0;
      const byStaff = new Map(); // portée → notes
      const open = new Map(); // note liée en attente : `${portée}:${hauteur}` → note
      kids(partEl, 'measure').forEach((mEl, mi) => {
        let pos = 0;
        let maxPos = 0;
        let lastStart = 0;
        const voiceSum = new Map();
        const implicit = mEl.getAttribute('implicit') === 'yes';
        for (const el of mEl.children) {
          const tag = el.localName;
          if (tag === 'attributes') {
            if (kid(el, 'divisions')) divisions = +txt(el, 'divisions') || divisions;
            const k = kid(el, 'key');
            if (k && kid(k, 'fifths') && !score.key) score.key = { sf: +txt(k, 'fifths'), minor: txt(k, 'mode') === 'minor' };
            const tm = kid(el, 'time');
            if (tm && kid(tm, 'beats')) {
              beats = +txt(tm, 'beats').split('+').reduce((s, x) => s + +x, 0) || 4;
              beatType = +txt(tm, 'beat-type') || 4;
              if (!score.timeSig) score.timeSig = [beats, beatType];
            }
            if (kid(el, 'staves')) staves = +txt(el, 'staves') || 1;
          } else if (tag === 'direction' || tag === 'sound') {
            const snd = tag === 'sound' ? el : kid(el, 'sound');
            if (snd && snd.getAttribute('tempo') && !score.tempo) score.tempo = +snd.getAttribute('tempo');
            if (snd && snd.getAttribute('dynamics')) vel = Math.max(20, Math.min(127, Math.round((+snd.getAttribute('dynamics') * 90) / 100)));
            for (const dt of el.getElementsByTagName('direction-type')) {
              const met = kid(dt, 'metronome');
              if (met && kid(met, 'per-minute') && !score.tempo) {
                const bu = txt(met, 'beat-unit');
                const f = { half: 2, quarter: 1, eighth: 0.5, whole: 4 }[bu] || 1;
                score.tempo = Math.round(+txt(met, 'per-minute').replace(/[^\d.]/g, '') * f * (kid(met, 'beat-unit-dot') ? 1.5 : 1)) || null;
              }
              const w = kid(dt, 'words');
              if (w && !score.tempoText && tempoOfWords(w.textContent)) score.tempoText = w.textContent.trim();
              const dyn = kid(dt, 'dynamics');
              if (dyn && dyn.firstElementChild && DYN[dyn.firstElementChild.localName]) vel = DYN[dyn.firstElementChild.localName];
            }
          } else if (tag === 'harmony' && (score._chordPart == null || score._chordPart === pi)) {
            score._chordPart = pi;
            const r = kid(el, 'root');
            if (!r) continue;
            const alter = +txt(r, 'root-alter') || 0;
            const kindEl = kid(el, 'kind');
            const kind = kindEl ? kindEl.textContent.trim() : 'major';
            const sym = kindEl && kindEl.getAttribute('text') != null ? kindEl.getAttribute('text') : KIND_SYM[kind] ?? '';
            const bass = kid(el, 'bass');
            const off = kid(el, 'offset') ? +txt(el, 'offset') / divisions : 0;
            let name = txt(r, 'root-step') + (alter > 0 ? '#' : alter < 0 ? 'b' : '') + sym;
            if (bass) name += '/' + txt(bass, 'bass-step') + ((+txt(bass, 'bass-alter') || 0) > 0 ? '#' : (+txt(bass, 'bass-alter') || 0) < 0 ? 'b' : '');
            score.chords.push({ t: mStart + pos / divisions + off, name });
          } else if (tag === 'backup') {
            pos -= +txt(el, 'duration') || 0;
          } else if (tag === 'forward') {
            const d = +txt(el, 'duration') || 0;
            const v = txt(el, 'voice') || '1';
            voiceSum.set(v, (voiceSum.get(v) || 0) + d);
            pos += d;
            maxPos = Math.max(maxPos, pos);
          } else if (tag === 'note') {
            if (kid(el, 'grace') || kid(el, 'cue')) continue;
            const isChord = !!kid(el, 'chord');
            const dur = +txt(el, 'duration') || 0;
            const start = isChord ? lastStart : pos;
            const voice = txt(el, 'voice') || '1';
            if (!isChord) {
              voiceSum.set(voice, (voiceSum.get(voice) || 0) + dur);
              lastStart = pos;
              pos += dur;
              maxPos = Math.max(maxPos, pos);
            }
            const pitch = kid(el, 'pitch') || kid(el, 'unpitched');
            if (!pitch || kid(el, 'rest')) continue;
            const step = txt(pitch, kid(pitch, 'step') ? 'step' : 'display-step');
            const oct = +txt(pitch, kid(pitch, 'octave') ? 'octave' : 'display-octave');
            const p = 12 * (oct + 1) + (STEP[step] ?? 0) + (Math.round(+txt(pitch, 'alter')) || 0);
            const staff = +txt(el, 'staff') || 1;
            const ties = kids(el, 'tie').map((t) => t.getAttribute('type'));
            const keyId = `${staff}:${p}`;
            const t = mStart + start / divisions;
            const d = dur / divisions;
            const prev = open.get(keyId);
            if (ties.includes('stop') && prev && Math.abs(prev.t + prev.d - t) < 0.05) {
              prev.d += d;
              if (!ties.includes('start')) open.delete(keyId);
              continue;
            }
            const note = { p: Math.max(0, Math.min(127, p)), t, d, v: vel };
            if (!byStaff.has(staff)) byStaff.set(staff, []);
            byStaff.get(staff).push(note);
            if (ties.includes('start')) open.set(keyId, note);
          }
        }
        const expected = (beats * 4) / beatType;
        const actual = maxPos / divisions;
        const sums = [...voiceSum.values()].map((x) => x / divisions);
        const pickup = implicit || (mi === 0 && actual < expected - EPS);
        const last = mi === kids(partEl, 'measure').length - 1 && actual < expected - EPS;
        const bad = !pickup && !last && sums.some((s) => Math.abs(s - expected) > EPS && s > EPS);
        const len = pickup && actual > EPS ? actual : expected;
        const bar = barMap.get(mi) || { n: mEl.getAttribute('number') || String(mi + 1), start: mStart, len, expected, suspect: false, parts: [] };
        if (bad) {
          bar.suspect = true;
          bar.parts.push(pinf.name);
        }
        barMap.set(mi, bar);
        mStart += len;
      });
      const list = [...byStaff.keys()].sort((a, b) => a - b);
      const two = list.length === 2 && staves === 2 && /piano|pno|pf\b|klavier|clav|harp|orgue|organ|^partie|^p\d/i.test(pinf.name + ' piano');
      list.forEach((s) => {
        const name = list.length === 1 ? pinf.name : two && /piano|pno|pf\b|klavier/i.test(pinf.name) ? (s === 1 ? 'Main droite' : 'Main gauche') : `${pinf.name} ${s}`;
        score.parts.push({ name, program: pinf.program, drum: pinf.drum, notes: byStaff.get(s) });
      });
      if (!list.length) score.parts.push({ name: pinf.name, program: pinf.program, notes: [] });
    });
    delete score._chordPart;
    score.bars = [...barMap.keys()].sort((a, b) => a - b).map((k) => barMap.get(k));
    score.timeSig = score.timeSig || [4, 4];
    score.key = score.key || { sf: 0, minor: false };
    if (!score.tempo) score.tempo = tempoOfWords(score.tempoText) || 100;
    score.chords.sort((a, b) => a.t - b.t);
    score.chords.forEach((c, i) => (c.d = (score.chords[i + 1] ? score.chords[i + 1].t : score.bars.reduce((s, b) => s + b.len, 0)) - c.t));
    score.chords = score.chords.filter((c) => c.d > EPS);
    return finish(score);
  }

  /* ---------------- .mxl (MusicXML compressé : un zip) ---------------- */
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  /** Fichiers d'un zip : { names: [chemins], read(chemin) -> Uint8Array | null } (asynchrone). Lève une erreur si le zip est abîmé. */
  function unzip(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('fichier zip illisible (abîmé ?)');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = new Map();
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      files.set(name, { method, csize, off });
      p += 46 + nlen + xlen + clen;
    }
    const read = async (name) => {
      const f = files.get(name);
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const data = b.subarray(start, start + f.csize);
      return f.method === 0 ? data : inflate(data);
    };
    return { names: [...files.keys()], read };
  }
  async function unzipMxl(buf) {
    let z;
    try {
      z = unzip(buf);
    } catch (e) {
      throw new Error('fichier .mxl illisible (zip abîmé)');
    }
    const files = new Set(z.names);
    const dec = new TextDecoder();
    const read = async (name) => {
      const d = await z.read(name);
      return d ? dec.decode(d) : null;
    };
    let target = null;
    const container = await read('META-INF/container.xml');
    if (container) {
      const m = /full-path="([^"]+)"/.exec(container);
      if (m) target = m[1];
    }
    if (!target || !files.has(target)) target = [...files.keys()].find((n) => !n.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(n));
    if (!target) throw new Error('aucune partition dans ce .mxl');
    return read(target);
  }

  /* ---------------- Format écrit par Claude ----------------
   * { titre, tempo, mesure: "3/4", tonalite: "Fa majeur",
   *   portees: [{ nom, instrument, mesures: ["C5:1 D5:0.5 E5:0.5 r:2", "C4+E4+G4:4", …] }],
   *   accords: ["Dm7", "G7 C", …] }   une chaîne par mesure ; durée en noires (1/3 pour un triolet de croches),
   *   « ~ » après la durée = liée à la suivante, « !mf » = nuance pour la suite. */
  function fromNotes(o = {}) {
    const ts = /^(\d+)\s*\/\s*(\d+)$/.exec(String(o.mesure || '4/4')) || [0, 4, 4];
    const timeSig = [+ts[1], +ts[2]];
    const expected = (timeSig[0] * 4) / timeSig[1];
    const portees = o.portees || o.parts || [];
    if (!Array.isArray(portees) || !portees.length) throw new Error('portees manquantes : [{ nom, mesures: ["C5:1 D5:1 E5:2", …] }]');
    const nBars = Math.max(...portees.map((p) => (p.mesures || []).length), (o.accords || []).length);
    const lens = [];
    const sums = portees.map((pt) => (pt.mesures || []).map((m) => String(m || '').split(/\s+/).filter(Boolean).reduce((s, tok) => {
      if (tok.startsWith('!')) return s;
      const d = durOf(tok.split(':')[1] ? tok.split(':')[1].replace(/~$/, '') : '');
      return s + (d || 0);
    }, 0)));
    const pickup = o.anacrouse != null ? +o.anacrouse : sums.every((s) => !s[0] || s[0] < expected - EPS) && sums.some((s) => s[0] > EPS) ? Math.max(...sums.map((s) => s[0] || 0)) : 0;
    let t = 0;
    const bars = [];
    for (let i = 0; i < nBars; i++) {
      const len = i === 0 && pickup > EPS ? pickup : expected;
      const suspect = sums.some((s, k) => (portees[k].mesures || [])[i] && Math.abs(s[i] - len) > EPS && !(i === nBars - 1 && s[i] < len));
      bars.push({ n: String(i + 1), start: t, len, expected, suspect, parts: portees.filter((_, k) => sums[k][i] && Math.abs(sums[k][i] - len) > EPS).map((p) => p.nom) });
      lens.push(len);
      t += len;
    }
    const errors = [];
    const parts = portees.map((pt, k) => {
      const notes = [];
      let vel = 82;
      const open = new Map();
      (pt.mesures || []).forEach((m, i) => {
        let pos = bars[i] ? bars[i].start : 0;
        for (const tok of String(m || '').split(/\s+/).filter(Boolean)) {
          if (tok.startsWith('!')) {
            if (DYN[tok.slice(1)]) vel = DYN[tok.slice(1)];
            continue;
          }
          const [head, dRaw = ''] = tok.split(':');
          const tie = /~$/.test(dRaw);
          const d = durOf(dRaw.replace(/~$/, ''));
          if (!d) {
            errors.push(`mesure ${i + 1}, ${pt.nom || `portée ${k + 1}`} : « ${tok} » illisible`);
            if (bars[i]) bars[i].suspect = true;
            continue;
          }
          if (!/^(r|-|z|silence)$/i.test(head)) {
            for (const nt of head.split('+')) {
              const p = noteOf(nt);
              if (p == null) {
                errors.push(`mesure ${i + 1} : note « ${nt} » illisible`);
                if (bars[i]) bars[i].suspect = true;
                continue;
              }
              const prev = open.get(p);
              if (prev && Math.abs(prev.t + prev.d - pos) < 0.05) {
                prev.d += d;
                if (!tie) open.delete(p);
                continue;
              }
              const note = { p, t: pos, d, v: vel };
              notes.push(note);
              if (tie) open.set(p, note);
              else open.delete(p);
            }
          }
          pos += d;
        }
      });
      const name = pt.nom || pt.name || `Portée ${k + 1}`;
      const prog = pt.programme != null ? +pt.programme : guessProgram(`${pt.instrument || ''} ${name}`);
      return { name, program: prog, notes };
    });
    const chords = [];
    (o.accords || []).forEach((m, i) => {
      const list = String(m || '').split(/\s+/).filter(Boolean);
      if (!list.length || !bars[i]) return;
      const step = bars[i].len / list.length;
      list.forEach((name, j) => {
        if (name === '%' || name === '-') return;
        chords.push({ t: bars[i].start + j * step, d: step, name });
      });
    });
    // un accord répété ( % ) prolonge le précédent
    const score = {
      title: o.titre || o.title || '',
      tempo: +o.tempo || tempoOfWords(o.tempo) || 100,
      tempoText: typeof o.tempo === 'string' && !+o.tempo ? o.tempo : '',
      timeSig,
      key: keyOf(o.tonalite),
      parts,
      bars,
      chords,
      errors,
    };
    return finish(score);
  }

  /* ---------------- Vers un fichier MIDI ----------------
   * options : { tempo, timeSig, key, parts: [{ on, program }] (même ordre que score.parts), merge, chords: { on, program } } */
  function toMidi(score, o = {}) {
    const PPQ = 480;
    const F = SS.midiFile;
    const tempo = +o.tempo || score.tempo || 100;
    const ts = o.timeSig || score.timeSig || [4, 4];
    const key = o.key || score.key || { sf: 0, minor: false };
    const conductor = [F.meta.name(0, score.title || 'Partition'), F.meta.tempo(0, tempo), F.meta.timeSig(0, ts[0], ts[1]), F.meta.keySig(0, key.sf, key.minor)];
    // un repère par mesure suspecte : on le retrouve dans un logiciel de musique
    (score.bars || []).filter((b) => b.suspect).forEach((b) => conductor.push(F.meta.marker(Math.round(b.start * PPQ), `À vérifier : mesure ${b.n}`)));
    const tick = (q) => Math.max(0, Math.round(q * PPQ));
    let lanes = score.parts.map((p, i) => ({ ...p, ...(o.parts && o.parts[i] ? o.parts[i] : {}), on: !(o.parts && o.parts[i] && o.parts[i].on === false) })).filter((p) => p.on && p.notes.length);
    if (o.merge && lanes.length > 1) lanes = [{ name: score.title || 'Partition', program: lanes[0].program, notes: lanes.flatMap((p) => p.notes) }];
    const chordOn = o.chords && o.chords.on && score.chords && score.chords.length;
    if (chordOn) {
      const notes = [];
      score.chords.forEach((c) => (chordNotes(c.name) || []).forEach((p) => notes.push({ p, t: c.t, d: c.d, v: 70 })));
      lanes.push({ name: 'Accords', program: o.chords.program ?? 89, notes });
    }
    const tracks = [conductor];
    let ch = 0;
    lanes.forEach((ln) => {
      const c = ln.drum ? 9 : ch;
      if (!ln.drum) ch = ch + 1 === 9 ? 10 : (ch + 1) % 16;
      const ev = [F.meta.name(0, ln.name), { tick: 0, bytes: [0xc0 | c, (ln.program ?? 0) & 0x7f] }];
      for (const n of ln.notes) {
        const on = tick(n.t);
        const off = Math.max(on + 1, tick(n.t + n.d) - 1);
        ev.push({ tick: on, bytes: [0x90 | c, n.p & 0x7f, Math.max(1, Math.min(127, n.v || 82))] }, { tick: off, bytes: [0x80 | c, n.p & 0x7f, 0] });
      }
      tracks.push(ev);
    });
    return F.write({ ppq: PPQ, tracks });
  }

  SS.scoreRead = { fromMusicXML, unzip, unzipMxl, fromNotes, toMidi, chordNotes, keyOf, keyLabel, KEYS, PROGRAMS, guessProgram, tempoOfWords };
})(typeof window !== 'undefined' ? window : globalThis);
