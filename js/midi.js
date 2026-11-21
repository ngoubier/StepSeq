/*
 * Import / export MIDI (fichiers .mid), au-dessus de js/midi-file.js.
 *
 *   SS.midi.exportProject(project, { range: 'song'|'scene', loops, audibleOnly, swing })
 *       -> { bytes: Uint8Array, report: { tracks, notes, seconds, approx: [texte], ignored: [texte] } }
 *   SS.midi.importFile(ArrayBuffer | Uint8Array, { title, machine: 'gm' | boîte à rythmes, similar, quantize })
 *       -> { project, report: { ... } }   (nouveau projet StepSeq, scènes et arrangement compris)
 *
 * Export : une piste MIDI par piste StepSeq (canal 10 pour la batterie), les arpèges sont rendus en notes
 *   (ARP ONE est déterministe : on obtient exactement ce qu'on entend), l'arrangement est déplié, chaque bloc
 *   est marqué par le nom de sa scène, la tonalité des scènes devient une armure.
 * Import : notes placées sur la double-croche, avec leur décalage d'attaque gardé (ev.shift) ; l'expression (CC 11)
 *   devient une courbe de volume par scène (auto.volume) ; la batterie (canal 10) donne une piste Drum par son
 *   (bibliothèque General MIDI : chaque note GM garde son son d'origine ; ou par élément sur une boîte à rythmes) ;
 *   le morceau est analysé pour retrouver ses parties (scènes) et l'arrangement qui les enchaîne (analyze()).
 */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const PPQ = 480;
  const TPS = PPQ / 4; // ticks par pas (double-croche)
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ================================================================== */
  /* Correspondances General MIDI                                        */
  /* ================================================================== */

  /** Batterie : type de son StepSeq -> note GM (export), d'après la propriété `midi` de SS.DRUM_TYPES. */
  const DRUM_TO_GM = Object.fromEntries((SS.DRUM_TYPES || []).map((d) => [d.id, d.midi]));

  /**
   * Note GM -> type de son StepSeq (import sur une boîte à rythmes), d'après SS.GM_DRUMS.
   * Les percussions latines, sifflets, etc. et les notes hors norme deviennent « perc ».
   */
  const GM_TO_DRUM = { 82: 'sh' };
  (SS.GM_DRUMS || []).forEach((d) => d.type !== 'perc' && d.type !== 'fx' && (GM_TO_DRUM[d.midi] = d.type));
  const gmDrumName = (note) => (SS.findGmDrum && SS.findGmDrum(note) ? SS.findGmDrum(note).label : null);

  /** Sons disponibles sur les boîtes à rythmes proposées à l'import (tidal-drum-machines). */
  const MACHINES = {
    RolandTR808: { label: 'Roland TR-808', sounds: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'perc', 'rim', 'sd', 'sh'] },
    RolandTR909: { label: 'Roland TR-909', sounds: ['bd', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'rd', 'rim', 'sd'] },
    LinnDrum: { label: 'LinnDrum', sounds: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'perc', 'rd', 'rim', 'sd', 'sh', 'tb'] },
    RolandTR707: { label: 'Roland TR-707', sounds: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'rim', 'sd', 'tb'] },
  };
  /** Choix « batterie General MIDI » à l'import : chaque note GM garde son propre son (bibliothèque « gm »). */
  const GM_KIT = 'gm';
  /** Machine qui a ce son : celle choisie, sinon la LinnDrum (la plus complète), sinon la TR-808. */
  const machineFor = (machine, sound) =>
    [machine, 'LinnDrum', 'RolandTR808'].find((m) => MACHINES[m] && MACHINES[m].sounds.includes(sound)) || 'LinnDrum';

  /** Programme GM (0–127) des soundfonts gm_* : le nom de fichier commence par programme × 10 + variante. */
  let gmCache = null;
  function gmTables() {
    if (gmCache) return gmCache;
    const byId = new Map();
    const byProgram = new Map();
    for (const g of (SS.LIB && SS.LIB.gm) || []) {
      const prog = parseInt(String(g.files[0]).slice(0, 3), 10);
      if (!Number.isFinite(prog)) continue;
      byId.set(g.id, prog);
      if (!byProgram.has(prog)) byProgram.set(prog, g);
    }
    return (gmCache = { byId, byProgram });
  }
  /** Variante d'un soundfont gm_* qui joue exactement ce programme (gm_piano regroupe les programmes 0 à 3), FluidR3 de préférence. */
  function gmVariantFor(gm, prog) {
    if (!gm || !gm.files) return 0;
    const ok = gm.files.map((f, i) => ({ f, i })).filter((x) => SS.gmProgramOfFile(x.f) === prog);
    if (!ok.length) return 0;
    return (ok.find((x) => /FluidR3/.test(x.f)) || ok[0]).i;
  }
  /** Soundfont gm_* le plus proche d'un programme GM (même groupe de 8 de préférence). */
  function gmForProgram(prog) {
    const { byProgram } = gmTables();
    if (byProgram.has(prog)) return byProgram.get(prog);
    for (let d = 1; d < 8; d++) {
      for (const p of [prog - d, prog + d]) if (p >> 3 === prog >> 3 && byProgram.has(p)) return byProgram.get(p);
    }
    return byProgram.get(0) || null;
  }

  // sons qui ne sont pas General MIDI : programme le plus proche, par instrument puis par famille
  const FAMILY_PROGRAM = { keys: 0, organ: 16, bass: 38, synth: 81, pads: 89, strings: 48, voices: 52, brass: 61, winds: 73, guitar: 25, mallets: 11, world: 104, perc: 114, fx: 99, analog: 81 };
  const SYNTH_PROGRAM = {
    syn_sqbass: 39, syn_moogbass: 39, syn_square: 80, syn_chip: 80, syn_triangle: 80, syn_sine: 80, syn_pluck: 84,
    syn_supersaw: 81, syn_superpad: 90, syn_glasspad: 92, syn_noiseriser: 122, syn_wind: 122, syn_rumble: 122, syn_pwmbass: 39, syn_pwmpad: 50, syn_breathpad: 89, syn_drone: 95, syn_acidsub: 38, syn_techsub: 39, piano: 0,
  };
  const JUNO_WORDS = [
    [/bass/i, 38], [/string|violin|cello|orchest/i, 50], [/organ|owgan/i, 16], [/brass|trumpet|horn/i, 62],
    [/piano|clav|harpsi/i, 4], [/bell|chime|vibe|marimba/i, 98], [/pad|choir|voice|vox|sweep|space/i, 89],
    [/flute|reed|oboe|clarinet|sax|harmonica/i, 73], [/guitar|koto|harp|pluck|banjo/i, 25],
  ];

  /** → { program, exact } pour une piste Instrument / Synthé. */
  function programOf(track) {
    const gm = SS.trackMidi ? SS.trackMidi(track) : null;
    if (gm && gm.program != null) return { program: gm.program, exact: true };
    const { byId } = gmTables();
    if (byId.has(track.instrument)) return { program: byId.get(track.instrument), exact: true };
    if (track.family === 'analog') {
      const patch = SS.findJunoPatch && SS.findJunoPatch(track.junoPatch);
      const hit = patch && JUNO_WORDS.find(([re]) => re.test(patch.name));
      return { program: hit ? hit[1] : 81, exact: false };
    }
    if (track.instrument in SYNTH_PROGRAM) return { program: SYNTH_PROGRAM[track.instrument], exact: false };
    const inst = SS.findInstrument && SS.findInstrument(track.family, track.instrument);
    if (inst && inst.gmProgram != null) return { program: inst.gmProgram, exact: false }; // orchestre VSCO 2
    return { program: FAMILY_PROGRAM[track.family] ?? 0, exact: false };
  }

  /**
   * Équivalent General MIDI d'un choix de son (options de piste, comme dans Band ou la fenêtre de piste) :
   * un instrument gm_* reste tel quel ; un synthé intégré, un Juno, un son VCSL / Dirt-Samples prend le programme
   * GM le plus proche ; un drum prend le son de la batterie General MIDI de sa note.
   */
  function gmEquivalent(opts) {
    if (!opts) return opts;
    if (opts.type === 'drum') {
      if (opts.source === 'gm') return opts;
      const note = drumNoteOf(opts);
      const n = SS.findGmDrum(note) ? note : DRUM_TO_GM[drumTypeOf(opts)] || 63;
      return { type: 'drum', source: 'gm', bank: String(n), sound: opts.sound, machine: opts.machine || SS.DEFAULT_MACHINE, variant: 0 };
    }
    const asTrack =
      opts.type === 'synth'
        ? { type: 'instrument', family: 'analog', instrument: opts.analog, junoPatch: opts.patch }
        : { type: 'instrument', family: opts.family, instrument: opts.instrument, sfv: opts.sfv };
    const cur = SS.trackMidi(asTrack);
    if (cur && opts.type !== 'synth') return opts;
    const g = SS.gmInstrumentFor(programOf(asTrack).program);
    return g ? { type: 'instrument', category: opts.category, ...g } : opts;
  }

  /** Note GM d'une piste Drum : exacte pour la bibliothèque General MIDI, sinon celle de son type de son. */
  function drumNoteOf(track) {
    const gm = SS.trackMidi ? SS.trackMidi(track) : null;
    return gm && gm.note != null ? gm.note : DRUM_TO_GM[drumTypeOf(track)];
  }

  /** Type de son d'une piste Drum, aussi pour les banques Dirt-Samples / VCSL / Mridangam (d'après le nom). */
  function drumTypeOf(track) {
    if ((!track.source || track.source === 'tdm') && track.sound in DRUM_TO_GM) return track.sound;
    if (track.source === 'gm' && SS.findGmDrum(track.bank)) return SS.findGmDrum(track.bank).type;
    const name = String(track.sound || track.bank || '').toLowerCase();
    const rules = [
      [/^(bd|kick)|kick|bass ?drum/, 'bd'], [/^(sd|sn)|snare/, 'sd'], [/clap|^cp/, 'cp'], [/rim/, 'rim'],
      [/open|^oh/, 'oh'], [/hat|^hh|^ch/, 'hh'], [/crash|^cr|cymbal/, 'cr'], [/ride/, 'rd'], [/tom/, 'mt'],
      [/cowbell|^cb/, 'cb'], [/shak|maraca/, 'sh'], [/tamb/, 'tb'],
    ];
    const hit = rules.find(([re]) => re.test(name));
    return hit ? hit[1] : track.sound in DRUM_TO_GM ? track.sound : 'perc';
  }

  /* ---------- Tonalités ---------- */
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pcOfName = (name) => (PC[name[0]] + (name.includes('♯') ? 1 : name.includes('♭') ? -1 : 0) + 12) % 12;
  const MAJOR_SF = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
  const MINOR_MODES = ['minor', 'harmonic', 'dorian', 'phrygian', 'locrian'];
  /** Armure MIDI d'une tonalité de scène : { sf, minor } (les modes gardent leur tonique et leur couleur). */
  function keySignature(key) {
    const minor = MINOR_MODES.includes(key.mode);
    const pc = pcOfName(key.tonic);
    const majPc = minor ? (pc + 3) % 12 : pc;
    let sf = MAJOR_SF[majPc];
    if (majPc === 6 && key.tonic.includes('♭')) sf = -6;
    return { sf, minor };
  }

  /* ================================================================== */
  /* Export                                                              */
  /* ================================================================== */

  function exportProject(project, opts = {}) {
    const o = { range: 'song', loops: 1, audibleOnly: true, swing: true, expression: true, ...opts };
    const played = { velo: 0, art: 0, strum: 0, pedal: 0, cc11: 0, bauto: 0, bautoCc: 0 }; // jeu exporté (bilan)
    // copie complète (les notes en cours d'édition sont rangées dans leur scène)
    const p = SS.normalizeProject(JSON.parse(SS.serialize(project)));
    const spb = SS.stepsPerBar(p);
    let stepSec = 60 / p.tempo / 4; // change avec le tempo de chaque scène (fiche Scène)
    let seconds = 0;
    const soloed = p.tracks.some((t) => t.solo);
    const audible = (t) => (soloed ? t.solo : !t.mute);
    const tracks = p.tracks.filter((t) => !o.audibleOnly || audible(t));
    const approx = [];
    const ignored = [];

    // blocs joués : l'arrangement, ou la scène en cours répétée
    const sceneOf = (id) => p.scenes.find((s) => s.id === id);
    const blocks = o.range === 'scene' ? [{ scene: p.current, repeat: Math.max(1, Math.round(o.loops) || 1), continuous: true }] : p.song.map((b) => ({ ...b }));

    // pistes MIDI : canaux 1–9 et 11–16 pour les instruments, 10 pour la batterie
    const melodicCh = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
    let nextCh = 0;
    const outs = tracks.map((t) => {
      const drum = t.type === 'drum';
      const ch = drum ? 9 : melodicCh[nextCh++ % melodicCh.length];
      return { t, ch, drum, notes: [], cc: [], bend: [], ccLast: {}, prog: drum ? null : programOf(t) };
    });
    if (nextCh > melodicCh.length) approx.push(`${nextCh} pistes Instrument pour 15 canaux MIDI : certaines partagent un canal (elles restent sur des pistes séparées).`);

    const conductor = [SS.midiFile.meta.name(0, p.title || 'StepSeq'), SS.midiFile.meta.tempo(0, p.tempo), SS.midiFile.meta.timeSig(0, p.timeSig[0], p.timeSig[1])];
    let lastKey = '';
    let lastTempo = p.tempo;
    let pos = 0; // en pas, depuis le début
    const swingAt = (tick) => (o.swing ? SS.grooveOffset(p, tick, stepSec) / stepSec : 0);

    for (const [bi, b] of blocks.entries()) {
      const sc = sceneOf(b.scene);
      if (!sc) continue;
      const total = spb * sc.bars;
      const bpm = SS.tempoOf(p, sc);
      stepSec = 60 / bpm / 4;
      if (bpm !== lastTempo) {
        conductor.push(SS.midiFile.meta.tempo(pos * TPS, bpm)); // changement de tempo net au début de la scène
        lastTempo = bpm;
      }
      seconds += total * b.repeat * stepSec;
      conductor.push(SS.midiFile.meta.marker(pos * TPS, b.repeat > 1 ? `${sc.name} ×${b.repeat}` : sc.name));
      if (sc.key && SS.harmony && SS.harmony.valid(sc.key)) {
        const k = `${sc.key.tonic} ${sc.key.mode}`;
        if (k !== lastKey) {
          const ks = keySignature(sc.key);
          conductor.push(SS.midiFile.meta.keySig(pos * TPS, ks.sf, ks.minor));
          conductor.push(SS.midiFile.meta.text(pos * TPS, `Tonalité : ${SS.harmony.label ? SS.harmony.label(sc.key) : k}`));
          lastKey = k;
        }
      }
      // longueur de boucle des pistes dans cette scène (une piste plus courte que la scène boucle)
      const view = { ...p, bars: sc.bars };
      for (const out of outs) {
        const t = out.t;
        if (o.audibleOnly && SS.sceneMuted(p, t, sc)) continue; // muette dans cette scène (fiche Scène)
        const d = (sc.data || {})[t.id] || {};
        const len = SS.trackLen(view, t);
        const nudge = ((t.nudge || 0) / 1000 / stepSec) * TPS;
        const reps = b.repeat;
        // en mode chanson, le compteur de pas repart à 0 à chaque répétition du bloc ; en boucle, il continue
        const ticksTotal = b.continuous ? total * reps : total;
        const passes = b.continuous ? 1 : reps;
        for (let r = 0; r < passes; r++) {
          const base = pos + r * total;
          // conditions de déclenchement : même passage et même tirage qu'à la lecture (js/audio.js, trigAt)
          const ok = (cond, step, tick) =>
            SS.trigOk(cond, { id: t.id, step, block: b.continuous ? 0 : bi, pass: b.continuous ? Math.floor(tick / len) : SS.trigPass(tick, len, r, total) });
          // automation par temps (js/beatauto.js) : le passage joué (bloc, répétition), ou celui choisi pour la boucle
          const ba = SS.beatAuto ? SS.beatAuto.forTrack(p, t, b.continuous ? null : { index: bi, rep: r }) : null;
          const beatOf = (tick) => (tick % total) / SS.stepsPerBeat(p);
          // une piste qui a une courbe par temps de cutoff (ou de résonance) quelque part dans la chanson : le CC 74 (71)
          // lui revient sur toute la chanson, sans mélange avec le filtre DJ de l'automation par pas
          const owned = new Set(SS.beatAuto ? ['cut', 'res'].filter((k) => SS.beatAuto.paramsFor(t).some((x) => x.id === k) && SS.beatAuto.has(p, t.id, k)).map((k) => SS.beatAuto.P[k].cc) : []);
          const bvel = (tick) => {
            const m = ba && ba.vel ? ba.vel(beatOf(tick)) : null;
            if (m != null && m !== 1) played.bauto++;
            return m == null ? 1 : m;
          };
          if (out.drum) {
            const steps = d.steps || [];
            const drumNote = drumNoteOf(t);
            for (let tick = 0; tick < ticksTotal; tick++) {
              const v = steps[tick % len] || 0;
              if (!(v > 0) || !ok(d.cond && d.cond[tick % len], tick % len, tick)) continue;
              const r = SS.drumRatchet({ steps, rat: d.rat }, tick % len); // ratchet : coups répétés dans le pas
              const bv = bvel(tick);
              for (let j = 0; j < r; j++) out.notes.push({ at: (base + tick + swingAt(tick) + j / r) * TPS + nudge, dur: TPS / 2 / r, note: drumNote, vel: Math.min(1, v * bv * (j ? 0.85 : 1)) });
            }
            continue;
          }
          // automation (track.auto) -> contrôleurs MIDI, une valeur par pas quand elle change ; une courbe absente de
          // la scène revient à la valeur neutre. Batterie : non (canal 10 partagé par toutes les pistes de batterie).
          const alen = SS.autoLen(view, { ...t, autoLen: d.autoLen }); // l'automation boucle sur sa propre longueur
          for (let tick = 0; tick < ticksTotal; tick++) {
            for (const P of SS.AUTO_PARAMS) {
              if (!P.cc && !P.bend) continue;
              if (owned.has(P.cc)) continue; // la piste a des courbes par temps sur ce contrôleur : elles ont la main
              const slot = P.bend ? 'bend' : P.cc;
              let v = SS.autoValue(d.auto && d.auto[P.id], tick % alen, alen, !!P.toggle);
              if (v === null) {
                if (out.ccLast[slot] === undefined) continue;
                v = P.def;
              }
              // pitch bend : 14 bits, 8192 = au centre ; contrôleurs : 0..127 (64 = milieu d'une valeur −1..+1)
              const val = P.bend ? clamp(Math.round(8192 + v * 8191), 0, 16383) : clamp(Math.round(P.min < 0 ? 64 + v * 63 : v * 127), 0, 127);
              if (out.ccLast[slot] === val) continue;
              out.ccLast[slot] = val;
              if (P.bend) out.bend.push({ at: (base + tick) * TPS, val });
              else out.cc.push({ at: (base + tick) * TPS, cc: P.cc, val });
            }
            // automation par temps : cutoff → CC 74, résonance → CC 71, une valeur par pas quand elle change
            for (const k of ['cut', 'res']) {
              const X = SS.beatAuto && SS.beatAuto.P[k];
              if (!X || !owned.has(X.cc)) continue;
              let v = ba && ba[k] ? ba[k](beatOf(tick)) : null;
              if (v == null) {
                if (out.ccLast[X.cc] === undefined) continue;
                v = X.def;
              }
              const val = SS.beatAuto.ccValue(k, v);
              if (out.ccLast[X.cc] === val) continue;
              out.ccLast[X.cc] = val;
              out.cc.push({ at: (base + tick) * TPS, cc: X.cc, val });
              played.bautoCc++;
            }
          }
          // notes jouées : celles de la scène, ou les accords de la scène (piste qui suit la piste Accords)
          const events = SS.playEvents(view, t, { events: d.events || [], scene: sc });
          if (SS.arpOn(t)) {
            for (let tick = 0; tick < ticksTotal; tick++) {
              const step = tick % len;
              for (const ev of events) {
                if (ev.cond && !ok(ev.cond, ev.step, tick)) continue;
                const notes = SS.Arp.renderStep(t.arp, ev, step, { loop: Math.floor(tick / len), trackLen: len, stepSec, stepsPerBeat: SS.stepsPerBeat(p), events });
                for (const n of notes) out.notes.push({ at: (base + tick + swingAt(tick) + n.at / stepSec) * TPS + nudge, dur: (n.dur / stepSec) * TPS, note: n.midi, vel: Math.min(1, (ev.acc ? SS.accentVel(n.vel) : n.vel) * bvel(tick + n.at / stepSec)) });
              }
            }
            continue;
          }
          // jeu de la piste (js/expression.js) : le même plan qu'à la lecture, avec les courbes de la scène
          const plan = o.expression && SS.expression ? SS.expression.forTrack({ ...t, auto: d.auto }, events, { stepsPerBeat: SS.stepsPerBeat(p), stepsPerBar: spb }) : null;
          const fam = plan ? SS.exprFamily(t) : null;
          const sec = (s) => (s / stepSec) * TPS; // secondes -> ticks
          // nuance dans la note -> CC 11 (expression), sauf si la scène a sa propre courbe de volume (déjà en CC 11)
          const cc11 = plan && !SS.exprStruck(fam) && !(d.auto && d.auto.volume);
          for (let start = 0; start < ticksTotal; start += len) {
            for (const ev of events) {
              if (ev.step >= len || start + ev.step >= ticksTotal) continue;
              const tick = start + ev.step;
              if (ev.cond && !ok(ev.cond, ev.step, tick)) continue;
              const ex = plan && plan.get(ev);
              let dur = Math.min(ev.len, len - ev.step) * TPS;
              if (ex) {
                // durée jouée : staccato, détaché, legato qui chevauche, respiration
                const written = dur;
                dur = Math.max(Math.min(dur, sec(0.05)), dur * ex.durK + sec(ex.overlap) - Math.min(sec(ex.breath), dur * 0.4));
                if (Math.abs(dur - written) > 1) played.art++;
              }
              const shift = (ev.shift || 0) * TPS; // micro-décalage de la note (fraction de pas)
              const at = (base + tick + swingAt(tick)) * TPS + nudge + shift + (ex ? sec(ex.delay || 0) : 0);
              if (ex && ex.holdTo) {
                // pédale automatique du piano -> CC 64 : enfoncée juste après l'attaque, relevée sur la note suivante
                const upAt = at + Math.min(ex.holdTo, len - ev.step) * TPS;
                out.cc.push({ at: at + TPS / 8, cc: 64, val: 127 }, { at: upAt - 1, cc: 64, val: 0 });
                played.pedal++;
              }
              if (cc11 && ex) {
                // la forme de la note, un point tous les demi-pas (une courbe d'expression comme au clavier MIDI)
                const n = Math.max(1, Math.round(dur / (TPS / 2)));
                for (let q = 0; q <= n; q++) out.cc.push({ at: at + (q / n) * dur, cc: 11, val: clamp(Math.round(127 * Math.min(1, SS.expression.at(ex.shape, q / n))), 0, 127) });
                played.cc11++;
              }
              // ratchet : répétitions dans le premier pas, la dernière tient le reste de la note
              const r = ev.rat || 1;
              const bv = bvel(tick + (ev.shift || 0));
              for (let j = 0; j < r; j++) {
                const dd = j < r - 1 ? (TPS / r) * 0.9 : Math.max((TPS / r) * 0.9, dur - (j * TPS) / r);
                const v0 = ev.acc ? SS.accentVel(ev.vel) : ev.vel; // note accentuée : plus forte
                ev.notes.forEach((nn, i) => {
                  // force de frappe, mélodie au-dessus de l'accord ; doigts ou strum décalés
                  const vm = ex ? (ex.velK ?? 1) * (ex.noteVel ? ex.noteVel[i] ?? 1 : 1) : 1;
                  if (!vm) return; // strum vers le haut : la corde grave n'est pas jouée
                  const dl = ex && ex.noteDelay ? sec(ex.noteDelay[i] || 0) : 0;
                  if (dl) played.strum++;
                  if (vm !== 1) played.velo++;
                  out.notes.push({ at: at + (j * TPS) / r + dl, dur: Math.max(TPS / 8, dd - dl), note: nn, vel: Math.min(1, v0 * (j ? 0.85 : 1) * vm * bv) });
                });
              }
            }
          }
        }
      }
      pos += total * b.repeat;
    }

    // pistes MIDI
    const midiTracks = [conductor];
    let count = 0;
    for (const out of outs) {
      const { t, ch } = out;
      const evs = [SS.midiFile.meta.name(0, t.name || (out.drum ? 'Drum' : 'Instrument'))];
      if (!out.drum) evs.push({ tick: 0, bytes: [0xc0 | ch, out.prog.program] });
      evs.push({ tick: 0, bytes: [0xb0 | ch, 7, clamp(Math.round((t.volume ?? 0.8) * 127), 0, 127)] });
      const pan = (t.mix && t.mix.pan) || 0;
      evs.push({ tick: 0, bytes: [0xb0 | ch, 10, clamp(Math.round(64 + pan * 63), 0, 127)] });
      // une même hauteur ne se chevauche pas (le Note Off de la première couperait la seconde)
      const notes = out.notes.filter((n) => n.note >= 0 && n.note <= 127).sort((a, b) => a.at - b.at);
      const lastOf = new Map();
      for (const n of notes) {
        n.at = Math.max(0, Math.round(n.at));
        n.end = n.at + Math.max(1, Math.round(n.dur));
        const prev = lastOf.get(n.note);
        if (prev && prev.end > n.at) prev.end = Math.max(prev.at + 1, n.at);
        lastOf.set(n.note, n);
      }
      // contrôleurs : dans l'ordre, un seul par contrôleur et par tick (le dernier gagne), sans répéter une même valeur
      const ccs = out.cc.map((c, i) => ({ ...c, at: Math.max(0, Math.round(c.at)), i })).sort((a, b) => a.at - b.at || a.i - b.i);
      const lastCc = {};
      ccs.forEach((c, k) => {
        const nx = ccs[k + 1];
        if (nx && nx.at === c.at && nx.cc === c.cc) return;
        if (lastCc[c.cc] === c.val) return;
        lastCc[c.cc] = c.val;
        evs.push({ tick: c.at, bytes: [0xb0 | ch, c.cc, c.val] });
      });
      for (const b of out.bend) evs.push({ tick: Math.round(b.at), bytes: [0xe0 | ch, b.val & 0x7f, b.val >> 7] });
      for (const n of notes) {
        const vel = clamp(Math.round(n.vel * 127), 1, 127);
        evs.push({ tick: n.at, bytes: [0x90 | ch, n.note, vel] });
        evs.push({ tick: n.end, bytes: [0x80 | ch, n.note, 0] });
      }
      count += notes.length;
      midiTracks.push(evs);
      if (out.prog && !out.prog.exact) {
        const inst = SS.findInstrument ? SS.findInstrument(t.family, t.instrument) : null;
        const gm = gmForProgram(out.prog.program);
        approx.push(`« ${t.name} » (${inst ? inst.label : t.instrument}) → programme GM ${out.prog.program + 1} ${gm ? gm.label : ''}`.trim());
      }
      if (out.drum && t.source && t.source !== 'tdm' && t.source !== 'gm') approx.push(`« ${t.name} » (banque ${t.bank}) → note GM ${drumNoteOf(t)}`);
    }
    if (o.audibleOnly && tracks.length < p.tracks.length) ignored.push(`${p.tracks.length - tracks.length} piste(s) muette(s) non exportée(s).`);
    const autos = SS.AUTO_PARAMS.filter((P) => P.cc || P.bend)
      .map((P) => (P.bend ? `${P.label.replace(' (synthé externe)', '')} → pitch bend (±${SS.BEND_RANGE} demi-tons)` : `${P.label.replace(' (synthé externe)', '')} → CC ${P.cc}`))
      .join(', ');
    const scenesData = p.scenes.flatMap((sc) => Object.entries(sc.data || {}));
    if (scenesData.some(([, d]) => d.auto)) {
      approx.push(`Automation des pistes instrument en contrôleurs MIDI : ${autos} (une valeur par pas).`);
      if (scenesData.some(([, d]) => d.auto && d.auto.echo) || scenesData.some(([id, d]) => d.auto && p.tracks.some((t) => t.id === id && t.type === 'drum')))
        ignored.push("L'automation de l'écho et celle des pistes de batterie ne sont pas exportées.");
    }
    if (played.bauto || played.bautoCc)
      approx.push(`Automation par temps : ${[played.bautoCc ? 'cutoff → CC 74, résonance → CC 71 (64 = réglage du son)' : '', played.bauto ? 'vélocité appliquée aux notes' : ''].filter(Boolean).join(', ')}.`);
    if (played.velo || played.art || played.strum || played.pedal || played.cc11) {
      const what = [
        played.velo ? 'nuances par la vélocité' : '',
        played.cc11 ? 'nuance dans les notes en CC 11 (expression)' : '',
        played.art ? 'articulations dans les durées (legato, staccato…)' : '',
        played.strum ? 'strum et doigts décalés' : '',
        played.pedal ? 'pédale automatique du piano en CC 64' : '',
      ].filter(Boolean);
      approx.push(`Jeu des pistes (onglet Jeu) : ${what.join(', ')}. Le timbre qui suit la nuance reste dans StepSeq.`);
    }
    if (p.groove && p.groove.human) ignored.push("L'humanisation (aléatoire) n'est pas appliquée.");
    if (p.tracks.some((t) => t.sd || t.fx || t.mix || t.juno)) ignored.push('Le sound design, les effets, le mixage et les réglages du Juno restent dans StepSeq (ce ne sont pas des données MIDI).');

    const bytes = SS.midiFile.write({ ppq: PPQ, tracks: midiTracks });
    return { bytes, report: { tracks: outs.length, notes: count, seconds, approx, ignored } };
  }

  SS.midiFileName = (p) => (p.title || 'projet').replace(/[\\/:*?"<>|]+/g, '_').trim() + '.mid';

  /* ================================================================== */
  /* Import                                                              */
  /* ================================================================== */

  /** Notes du fichier : [{ src, ch, note, start, end, vel }] (en ticks), avec la pédale de sustain appliquée. */
  function collectNotes(midi) {
    const notes = [];
    const info = new Map(); // `${src}:${ch}` -> { name, program, volume, pan }
    const metas = { tempos: [], sigs: [], keys: [], markers: [], names: [] };
    let pitchBends = 0;
    let otherCC = 0;
    let programChanges = 0;
    midi.tracks.forEach((evs, src) => {
      const open = new Map(); // `${ch}:${note}` -> [notes en cours]
      const pedal = new Map(); // ch -> bool
      const held = new Map(); // ch -> notes relâchées pendant la pédale
      let name = '';
      const chInfo = (ch) => {
        const k = src + ':' + ch;
        if (!info.has(k)) info.set(k, { name, program: null, volume: null, pan: null, programs: 0, expr: [] });
        return info.get(k);
      };
      const release = (n, tick) => {
        n.end = tick;
      };
      for (const e of evs) {
        if (e.type === 'meta') {
          if (e.meta === 0x51 && e.usPerQuarter) metas.tempos.push({ tick: e.tick, bpm: 60000000 / e.usPerQuarter });
          else if (e.meta === 0x58 && e.num) metas.sigs.push({ tick: e.tick, num: e.num, den: e.den });
          else if (e.meta === 0x59) metas.keys.push({ tick: e.tick, sf: e.sf, mi: e.mi });
          else if (e.meta === 0x06 && e.text) metas.markers.push({ tick: e.tick, text: e.text.trim() });
          else if (e.meta === 0x03 && !name && e.text) name = e.text.trim();
          continue;
        }
        if (e.type === 'program') {
          const ci = chInfo(e.ch);
          if (ci.program == null || !notes.some((n) => n.src === src && n.ch === e.ch)) ci.program = e.program;
          else programChanges++;
          continue;
        }
        if (e.type === 'cc') {
          const ci = chInfo(e.ch);
          if (e.cc === 7 && ci.volume == null) ci.volume = e.value;
          else if (e.cc === 10 && ci.pan == null) ci.pan = e.value;
          else if (e.cc === 11) ci.expr.push({ tick: e.tick, value: e.value });
          else if (e.cc === 64) {
            const down = e.value >= 64;
            pedal.set(e.ch, down);
            if (!down) {
              (held.get(e.ch) || []).forEach((n) => release(n, e.tick));
              held.set(e.ch, []);
            }
          } else if (![0, 32, 100, 101, 121].includes(e.cc)) otherCC++;
          continue;
        }
        if (e.type === 'pitch') {
          if (e.value !== 0) pitchBends++;
          continue;
        }
        if (e.type !== 'note') continue;
        const k = e.ch + ':' + e.note;
        if (!e.off) {
          chInfo(e.ch);
          const n = { src, ch: e.ch, note: e.note, start: e.tick, end: null, vel: e.vel };
          // la même note rejouée pendant qu'elle est tenue par la pédale : la précédente s'arrête
          (held.get(e.ch) || []).filter((x) => x.note === e.note && x.end == null).forEach((x) => release(x, e.tick));
          if (!open.has(k)) open.set(k, []);
          open.get(k).push(n);
          notes.push(n);
        } else {
          const list = open.get(k);
          const n = list && list.shift();
          if (!n) continue;
          if (pedal.get(e.ch) && e.ch !== 9) {
            if (!held.has(e.ch)) held.set(e.ch, []);
            held.get(e.ch).push(n);
          } else release(n, e.tick);
        }
      }
      // notes jamais relâchées : fin de la piste
      const endTick = evs.length ? evs[evs.length - 1].tick : 0;
      notes.filter((n) => n.src === src && n.end == null).forEach((n) => (n.end = Math.max(endTick, n.start + 1)));
      for (const ci of info.values()) if (!ci.name) ci.name = name;
      metas.names[src] = name;
    });
    return { notes, info, metas, pitchBends, otherCC, programChanges };
  }

  /**
   * Courbe de volume d'une scène (pas -> 0..1) d'après les points de CC 11 [{ tick, value }] d'une piste, ou null.
   * Valeur au début de chaque pas (la dernière reçue), puis on ne garde que les points utiles : les courbes de StepSeq
   * sont linéaires entre deux points.
   */
  function exprLane(points, from, to, tps) {
    if (!points || !points.length) return null;
    const vals = [];
    let i = 0;
    let v = 127;
    for (let s = from; s < to; s++) {
      const tick = s * tps;
      while (i < points.length && points[i].tick <= tick) v = points[i++].value;
      vals.push(Math.round((v / 127) * 1000) / 1000);
    }
    if (vals.every((x) => x >= 0.995)) return null;
    const keep = [0];
    for (let s = 1; s < vals.length - 1; s++) {
      const a = keep[keep.length - 1];
      // le point s est inutile s'il est sur la droite entre le dernier gardé et le suivant
      const lin = vals[a] + ((vals[s + 1] - vals[a]) * (s - a)) / (s + 1 - a);
      const ok = (() => {
        for (let j = a + 1; j <= s; j++) if (Math.abs(vals[a] + ((vals[s + 1] - vals[a]) * (j - a)) / (s + 1 - a) - vals[j]) > 0.012) return false;
        return Math.abs(lin - vals[s]) <= 0.012;
      })();
      if (!ok) keep.push(s);
    }
    if (vals.length > 1) keep.push(vals.length - 1);
    const lane = {};
    keep.forEach((s) => (lane[s] = vals[s]));
    return lane;
  }

  /** Tempo qui dure le plus longtemps. */
  function mainTempo(tempos, lastTick) {
    if (!tempos.length) return 120;
    const t = [...tempos].sort((a, b) => a.tick - b.tick);
    const dur = new Map();
    t.forEach((x, i) => {
      const len = (i + 1 < t.length ? t[i + 1].tick : Math.max(lastTick, x.tick + 1)) - x.tick;
      const k = Math.round(x.bpm * 100) / 100;
      dur.set(k, (dur.get(k) || 0) + len);
    });
    return [...dur.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Analyse de la structure : découpe la suite de mesures en parties (scènes) et en arrangement.
   *   bars : [Map(trackIndex -> [{ pos (pas dans la mesure), id (hauteur, ou 'd' pour la batterie) }])] contenu des mesures
   *   opts : { unit (mesures par phrase, 4), stepsPerBar (16), maxBars (64), similar (seuil de ressemblance 0..1, 1 = identique),
   *            markers: [{ bar, text }] (marqueurs du fichier) }
   * → { sections: [{ start, bars, label }], blocks: [{ start, bars, repeat, sceneKey }], scenes: [{ key, start, bars, name }] }
   *
   * 1. Phrases de `unit` mesures, alignées sur le début du morceau (et sur les marqueurs du fichier s'il y en a).
   * 2. Une nouvelle section commence quand l'orchestration change nettement (des pistes entrent ou sortent).
   * 3. Dans une section, on cherche la plus courte boucle (1, 2 ou 4 phrases) qui se répète : ses répétitions
   *    (ressemblance ≥ `similar`, piste par piste) deviennent « scène × n » ; une variation (break, fill) devient
   *    sa propre scène. Une section sans répétition reste une seule scène (64 mesures au plus).
   * 4. Une boucle déjà vue ailleurs dans le morceau réutilise la même scène.
   * 5. Les sections qui se ressemblent reçoivent le même nom (Intro, Couplet, Refrain, Pont…).
   */
  function analyze(bars, opts = {}) {
    const unit = opts.unit || 4;
    const spb = opts.stepsPerBar || 16;
    const maxBars = opts.maxBars || 64;
    const similar = opts.similar ?? 0.85;
    const n = bars.length;
    /** contenu de `len` mesures : Map(piste -> Set(« mesure|élément »)) ; fold : mesures repliées sur une phrase */
    const content = (from, len, fold = 0) => {
      const m = new Map();
      for (let b = from; b < Math.min(n, from + len); b++)
        for (const [ti, items] of bars[b]) {
          if (!m.has(ti)) m.set(ti, new Set());
          const s = m.get(ti);
          const off = fold ? (b - from) % fold : b - from;
          for (const it of items) s.add(off * spb + it.pos + ':' + it.id);
        }
      return m;
    };
    const jac = (a, b) => {
      if (!a.size && !b.size) return 1;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      return inter / (a.size + b.size - inter);
    };
    /** comme jac, mais une note décalée d'un pas compte (jeu humain mal quantifié) */
    const near = (a, b) => {
      if (!a.size && !b.size) return 1;
      let inter = 0;
      for (const x of a) {
        if (b.has(x)) inter++;
        else {
          const i = x.indexOf(':');
          const pos = +x.slice(0, i);
          const rest = x.slice(i);
          if (b.has(pos - 1 + rest) || b.has(pos + 1 + rest)) inter += 0.9;
        }
      }
      return Math.min(1, inter / (a.size + b.size - inter));
    };
    const EMPTY = new Set();
    /** ressemblance moyenne piste par piste (une piste très fournie, la charleston, ne domine pas) */
    const sim = (A, B) => {
      const keys = new Set([...A.keys(), ...B.keys()]);
      if (!keys.size) return 1;
      let s = 0;
      for (const k of keys) s += near(A.get(k) || EMPTY, B.get(k) || EMPTY);
      return s / keys.size;
    };
    // orchestration : pistes qui jouent vraiment (au moins 2 notes dans la phrase)
    const active = (C) => new Set([...C].filter(([, s]) => s.size >= 2).map(([k]) => k));

    // 1. phrases
    const markers = (opts.markers || []).filter((m) => m.bar >= 0 && m.bar < n);
    const cuts = [...new Set([0, ...markers.map((m) => m.bar)])].sort((a, b) => a - b).concat(n);
    const phrases = [];
    for (let i = 0; i < cuts.length - 1; i++)
      for (let b = cuts[i]; b < cuts[i + 1]; b += unit) phrases.push({ start: b, bars: Math.min(unit, cuts[i + 1] - b), marked: b === cuts[i] && markers.length > 0 });
    phrases.forEach((ph) => {
      ph.c = content(ph.start, ph.bars);
      ph.active = active(ph.c);
    });

    // 2. sections
    const sections = [];
    phrases.forEach((ph, i) => {
      const prev = phrases[i - 1];
      const cur = sections[sections.length - 1];
      const change = !prev || ph.marked || jac(prev.active, ph.active) < 0.75;
      if (change || cur.bars + ph.bars > maxBars) sections.push({ start: ph.start, bars: ph.bars, phrases: [ph] });
      else {
        cur.bars += ph.bars;
        cur.phrases.push(ph);
      }
    });

    // 3. boucles et blocs
    const scenes = [];
    const sceneFor = (start, len) => {
      const c = content(start, len);
      const found = scenes.find((s) => s.bars === len && sim(s.c, c) >= similar);
      if (found) return found;
      const s = { key: scenes.length, start, bars: len, c, folded: content(start, len, unit) };
      scenes.push(s);
      return s;
    };
    // identifiant de chaque phrase : deux phrases semblables ont le même
    const reps = [];
    phrases.forEach((ph) => {
      const r = reps.find((x) => x.bars === ph.bars && sim(x.c, ph.c) >= similar);
      ph.id = r ? r.id : reps.push({ id: reps.length, bars: ph.bars, c: ph.c }) - 1;
    });
    const blocks = [];
    const seen = new Set(); // identifiants de phrases déjà jouées dans un bloc
    const emit = (sec, list, repeat) => {
      const len = list.reduce((a, x) => a + x.bars, 0);
      blocks.push({ start: list[0].start, bars: len, repeat, scene: sceneFor(list[0].start, len), section: sec });
      list.forEach((x) => seen.add(x.id));
    };
    for (const sec of sections) {
      const ps = sec.phrases;
      let pending = []; // phrases qui ne se répètent pas : regroupées en une scène
      const flush = () => {
        if (pending.length) emit(sec, pending, 1);
        pending = [];
      };
      for (let i = 0; i < ps.length; ) {
        // boucle de L phrases répétée k fois à partir de i : on garde celle qui couvre le plus (la plus courte à égalité)
        let best = null;
        for (const L of opts.periods || [1, 2, 4]) {
          if (i + 2 * L > ps.length) break;
          const same = (x, y) => ps[x].id === ps[y].id;
          let k = 1;
          while (i + (k + 1) * L <= ps.length && Array.from({ length: L }, (_, j) => same(i + j, i + k * L + j)).every(Boolean)) k++;
          if (k > 1 && (!best || L * k > best.L * best.k)) best = { L, k };
        }
        if (best) {
          flush();
          emit(sec, ps.slice(i, i + best.L), best.k);
          i += best.L * best.k;
        } else if (seen.has(ps[i].id)) {
          // phrase déjà entendue ailleurs : elle reprend sa scène
          flush();
          emit(sec, [ps[i]], 1);
          i++;
        } else {
          pending.push(ps[i]);
          i++;
        }
      }
      flush();
    }

    // 5. noms : les sections qui se ressemblent forment une partie (A, B, C…)
    const parts = [];
    for (const sec of sections) {
      const mine = blocks.filter((b) => b.section === sec);
      sec.main = [...mine].sort((a, b) => b.repeat * b.bars - a.repeat * a.bars)[0].scene;
      // même partie : même boucle, contenu proche, ou même orchestration (les mêmes pistes jouent)
      sec.active = new Set(sec.phrases.flatMap((ph) => [...ph.active]));
      const like = parts.find((l) => l.scenes.has(sec.main) || sim(l.main.folded, sec.main.folded) >= 0.6 || jac(l.active, sec.active) >= 0.85);
      const part = like || { main: sec.main, active: sec.active, sections: [], scenes: new Set() };
      if (!like) parts.push(part);
      part.sections.push(sec);
      mine.forEach((b) => part.scenes.add(b.scene));
      sec.part = part;
    }
    const notes = (sec) => sec.phrases.reduce((a, ph) => a + [...ph.c.values()].reduce((x, s) => x + s.size, 0), 0);
    const density = (l) => l.sections.reduce((a, s) => a + notes(s), 0) / Math.max(1, l.sections.reduce((a, s) => a + s.bars, 0));
    const tracks = (l) => l.sections.reduce((a, s) => a + s.phrases.reduce((x, ph) => x + ph.active.size, 0) / s.phrases.length, 0) / l.sections.length;
    const names = new Map();
    const markerAt = (sec) => {
      const m = markers.find((x) => x.bar === sec.start);
      return m && m.text ? m.text.replace(/\s*[×x]\s*\d+$/, '').slice(0, 30) : null;
    };
    if (markers.length && sections.every((s) => markerAt(s))) sections.forEach((s) => names.has(s.part) || names.set(s.part, markerAt(s)));
    else {
      const first = sections[0].part;
      const last = sections[sections.length - 1].part;
      const once = (l) => l.sections.length === 1;
      const avgTracks = parts.reduce((a, l) => a + tracks(l), 0) / parts.length;
      if (parts.length > 1 && once(first) && tracks(first) <= avgTracks) names.set(first, 'Intro');
      if (parts.length > 2 && once(last) && last !== first) names.set(last, 'Outro');
      // parmi les parties qui reviennent : la plus fournie est le refrain, l'autre le couplet
      const recurring = parts.filter((l) => !names.has(l) && l.sections.length > 1).sort((a, b) => b.sections.length - a.sections.length);
      if (recurring.length >= 2) {
        const [a, b] = recurring.slice(0, 2).sort((x, y) => tracks(y) - tracks(x) || density(y) - density(x));
        names.set(a, 'Refrain');
        names.set(b, 'Couplet');
      } else if (recurring.length === 1) names.set(recurring[0], 'Couplet');
      if (parts.length === 1) names.set(parts[0], 'Couplet');
      const others = ['Pont', 'Break', 'Montée', 'Solo', 'Interlude'];
      let k = 0;
      parts.filter((l) => !names.has(l)).forEach((l) => names.set(l, others[k++] || `Partie ${k}`));
    }
    // une partie avec plusieurs scènes : « Couplet a », « Couplet b »…
    for (const l of parts) {
      const list = [...l.scenes].filter((s) => !s.name).sort((a, b) => a.start - b.start);
      list.forEach((s, i) => (s.name = list.length > 1 ? `${names.get(l)} ${String.fromCharCode(97 + i)}` : names.get(l)));
    }
    // arrangement : deux blocs consécutifs de la même scène n'en font qu'un
    const merged = [];
    for (const b of blocks) {
      const last = merged[merged.length - 1];
      if (last && last.scene === b.scene) last.repeat += b.repeat;
      else merged.push({ ...b });
    }
    return {
      sections: sections.map((s) => ({ start: s.start, bars: s.bars, label: names.get(s.part) })),
      blocks: merged.map((b) => ({ start: b.start, bars: b.bars, repeat: b.repeat, sceneKey: b.scene.key })),
      scenes: scenes.map((s) => ({ key: s.key, start: s.start, bars: s.bars, name: s.name || `Scène ${s.key + 1}` })),
    };
  }

  function importFile(buf, opts = {}) {
    const o = { machine: GM_KIT, similar: 0.85, ...opts };
    const gmKit = o.machine === GM_KIT;
    const midi = SS.midiFile.parse(buf);
    const { notes, info, metas, pitchBends, otherCC, programChanges } = collectNotes(midi);
    if (!notes.length) throw new Error('Ce fichier MIDI ne contient aucune note.');
    const warnings = [];
    const sig = metas.sigs.sort((a, b) => a.tick - b.tick)[0] || { num: 4, den: 4 };
    const timeSig = [clamp(sig.num, 1, 32), [4, 8].includes(sig.den) ? sig.den : sig.den < 4 ? 4 : 8];
    if (timeSig[1] !== sig.den) warnings.push(`Mesure ${sig.num}/${sig.den} : convertie en ${timeSig[0]}/${timeSig[1]}.`);
    const sigChanges = new Set(metas.sigs.map((s) => s.num + '/' + s.den)).size;
    if (sigChanges > 1) warnings.push(`Le fichier change de mesure en cours de route : tout est lu en ${timeSig[0]}/${timeSig[1]}.`);
    const lastTick = Math.max(...notes.map((n) => n.end));
    const tempo = clamp(Math.round(mainTempo(metas.tempos, lastTick) * 100) / 100, 20, 300);
    const tempoChanges = new Set(metas.tempos.map((t) => Math.round(t.bpm * 10))).size;
    if (tempoChanges > 1) warnings.push(`Le tempo change ${tempoChanges - 1} fois dans le fichier : le morceau est importé à ${Math.round(tempo)} BPM constant (les notes restent en place).`);

    // placement à la double-croche ; l'écart à la grille (jeu humain, triolets) reste en micro-décalage (ev.shift)
    const tps = midi.ppq / 4;
    let shifted = 0;
    let aligned = 0; // notes hors grille alignées par Quantize
    let fine = 0;
    for (const n of notes) {
      const exact = n.start / tps;
      n.step = Math.round(exact);
      const off = exact - n.step;
      n.shift = n.ch === 9 || o.quantize ? 0 : Math.round(Math.max(-SS.SHIFT_MAX, Math.min(SS.SHIFT_MAX, off)) * 100) / 100;
      if (n.shift) shifted++;
      else if (o.quantize && n.ch !== 9 && Math.abs(off) >= 0.005) aligned++;
      if (Math.abs(off) > 0.2 && Math.abs(exact * 3 - Math.round(exact * 3)) < 0.05) fine++;
      n.len = Math.max(1, Math.round((n.end - n.start) / tps));
    }
    // mesures entièrement vides au début : supprimées
    const spb = Math.round(timeSig[0] * (16 / timeSig[1]));
    const firstBar = Math.floor(Math.min(...notes.map((n) => n.step)) / spb);
    if (firstBar > 0) {
      notes.forEach((n) => (n.step -= firstBar * spb));
      metas.markers.forEach((m) => (m.tick -= firstBar * spb * tps));
      for (const ci of info.values()) ci.expr.forEach((x) => (x.tick -= firstBar * spb * tps));
    }
    const totalBars = Math.ceil((Math.max(...notes.map((n) => n.step)) + 1) / spb);

    // pistes StepSeq : une par (piste MIDI, canal) pour les instruments, une par élément pour la batterie
    const groups = new Map();
    const used = new Set();
    const color = (i) => SS.COLORS[i % SS.COLORS.length];
    for (const n of notes) {
      let key;
      if (n.ch === 9) {
        const type = GM_TO_DRUM[n.note] || 'perc';
        // batterie General MIDI : une piste par note GM (son d'origine) ; boîte à rythmes : une piste par type de son
        if (gmKit && SS.findGmDrum(n.note)) key = 'drum:gm:' + n.note;
        else key = type === 'perc' ? 'drum:perc:' + n.note : 'drum:' + type;
        n.type = type;
      } else key = `inst:${n.src}:${n.ch}`;
      if (!groups.has(key)) groups.set(key, { key, notes: [], drum: n.ch === 9, src: n.src, ch: n.ch, type: n.type, note: n.note });
      groups.get(key).notes.push(n);
    }
    // trop de percussions différentes : les moins utilisées vont dans une piste « Percussions »
    const percs = [...groups.values()].filter((g) => g.drum && g.type === 'perc' && !g.key.startsWith('drum:gm:')).sort((a, b) => b.notes.length - a.notes.length);
    if (percs.length > 4) {
      const merged = { key: 'drum:perc:*', notes: [], drum: true, type: 'perc', note: null };
      percs.slice(3).forEach((g) => {
        merged.notes.push(...g.notes);
        groups.delete(g.key);
      });
      groups.set(merged.key, merged);
    }
    const drumOrder = ['bd', 'sd', 'cp', 'rim', 'hh', 'oh', 'lt', 'mt', 'ht', 'cr', 'rd', 'cb', 'tb', 'sh', 'perc'];
    const list = [...groups.values()].sort((a, b) =>
      a.drum !== b.drum ? (a.drum ? -1 : 1) : a.drum ? drumOrder.indexOf(a.type) - drumOrder.indexOf(b.type) || (a.note || 0) - (b.note || 0) : a.src - b.src || a.ch - b.ch
    );
    const p = SS.newProject();
    p.title = String(o.title || 'Import MIDI').slice(0, 80);
    p.gm = true; // projet General MIDI : la fenêtre de piste et Band proposent les sons GM
    p.tempo = tempo;
    p.timeSig = timeSig;
    p.bars = 1;
    const drumLabel = (type) => (SS.DRUM_TYPES.find((d) => d.id === type) || { label: type }).label;
    const percVariant = new Map();
    const tracks = list.map((g, i) => {
      if (g.drum && g.key.startsWith('drum:gm:')) {
        const t = SS.newTrack({ type: 'drum', name: gmDrumName(g.note), color: color(i), source: 'gm', bank: String(g.note), machine: SS.DEFAULT_MACHINE, variant: 0 }, p);
        g.track = t;
        return t;
      }
      if (g.drum) {
        const machine = machineFor(gmKit ? 'LinnDrum' : o.machine, g.type);
        let name = g.type === 'perc' ? (g.note == null ? 'Percussions' : gmDrumName(g.note) || `Percussion ${g.note}`) : drumLabel(g.type);
        const variant = g.type === 'perc' ? percVariant.size : 0;
        if (g.type === 'perc') percVariant.set(g.key, variant);
        const t = SS.newTrack({ type: 'drum', name, color: color(i), source: 'tdm', sound: g.type, machine, variant }, p);
        g.track = t;
        return t;
      }
      const ci = info.get(g.src + ':' + g.ch) || {};
      const prog = ci.program ?? 0;
      const gm = gmForProgram(prog);
      const fam = gm ? gm.family : 'keys';
      const sorted = g.notes.map((n) => n.note).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      let name = ci.name && !used.has(ci.name) ? ci.name : gm ? gm.label : 'Instrument';
      if (used.has(name)) name += ` (${g.ch + 1})`;
      used.add(name);
      const t = SS.newTrack({ type: 'instrument', family: fam, instrument: gm ? gm.id : undefined, name: name.slice(0, 40), color: color(i) }, p);
      t.sfv = gmVariantFor(gm, prog);
      t.octave = clamp(Math.floor(median / 12) - 1, 0, 8);
      if (ci.volume != null) t.volume = Math.round(clamp(ci.volume / 127, 0.05, 1) * 100) / 100;
      if (ci.pan != null && ci.pan !== 64) t.mix = { pan: Math.round(clamp((ci.pan - 64) / 63, -1, 1) * 100) / 100 };
      g.track = t;
      g.program = prog;
      g.expr = (ci.expr || []).slice().sort((a, b) => a.tick - b.tick);
      return t;
    });
    p.tracks = tracks;

    // contenu de chaque mesure, pour l'analyse (vélocité ignorée : un jeu humain reste comparable)
    const bars = Array.from({ length: totalBars }, () => new Map());
    list.forEach((g, ti) => {
      for (const n of g.notes) {
        const bar = Math.floor(n.step / spb);
        const rel = n.step - bar * spb;
        const m = bars[bar];
        if (!m.has(ti)) m.set(ti, []);
        m.get(ti).push({ pos: rel, id: g.drum ? 'd' : n.note });
      }
    });
    const markers = metas.markers.map((m) => ({ bar: Math.round(m.tick / tps / spb), text: m.text })).filter((m) => m.bar >= 0);
    if (o.debug) o.debug.bars = bars; // tests : contenu des mesures avant analyse
    const A = analyze(bars, { unit: o.unit || 4, periods: o.periods, stepsPerBar: spb, similar: o.similar, markers });

    // scènes : contenu pris à la première apparition de chaque boucle
    const exprTracks = new Set();
    const scenes = A.scenes.map((s) => {
      const from = s.start * spb;
      const to = from + s.bars * spb;
      const data = {};
      list.forEach((g) => {
        const t = g.track;
        if (g.drum) {
          const steps = new Array(s.bars * spb).fill(0);
          for (const n of g.notes) if (n.step >= from && n.step < to) steps[n.step - from] = Math.max(steps[n.step - from], Math.round((n.vel / 127) * 100) / 100);
          data[t.id] = { steps };
        } else {
          const evs = new Map();
          for (const n of g.notes) {
            if (n.step < from || n.step >= to) continue;
            const step = n.step - from;
            const len = Math.min(n.len, to - n.step);
            const vel = Math.round((n.vel / 127) * 100) / 100;
            const k = `${step}:${len}:${vel}:${n.shift}`;
            if (!evs.has(k)) evs.set(k, { step, len, notes: [], vel, ...(n.shift ? { shift: n.shift } : {}) });
            const ev = evs.get(k);
            if (!ev.notes.includes(n.note)) ev.notes.push(n.note);
          }
          data[t.id] = { events: [...evs.values()].sort((a, b) => a.step - b.step).map((e) => ({ ...e, notes: e.notes.sort((a, b) => a - b) })) };
          const lane = exprLane(g.expr, from, to, tps);
          if (lane) {
            data[t.id].auto = { volume: lane };
            exprTracks.add(t.id);
          }
        }
      });
      return { id: SS.uid(), name: s.name, bars: s.bars, data, key: s.key };
    });
    const byKey = new Map(scenes.map((s) => [s.key, s]));
    const song = A.blocks.map((b) => ({ scene: byKey.get(b.sceneKey).id, repeat: b.repeat }));
    // fidélité : notes du fichier (quantifiées) retrouvées à leur place quand on joue l'arrangement
    const ref = new Set();
    bars.forEach((m, b) => m.forEach((items, ti) => items.forEach((it) => ref.add(`${ti}|${b * spb + it.pos}|${it.id}`))));
    const heard = new Set();
    let at = 0;
    for (const b of A.blocks) {
      const sc = byKey.get(b.sceneKey);
      for (let r = 0; r < b.repeat; r++, at += sc.bars * spb)
        list.forEach((g, ti) => {
          const d = sc.data[g.track.id];
          if (g.drum) d.steps.forEach((v, i) => v > 0 && heard.add(`${ti}|${at + i}|d`));
          else d.events.forEach((ev) => ev.notes.forEach((nn) => heard.add(`${ti}|${at + ev.step}|${nn}`)));
        });
    }
    let kept = 0;
    for (const x of ref) if (heard.has(x)) kept++;
    let added = 0;
    for (const x of heard) if (!ref.has(x)) added++;
    scenes.forEach((s) => delete s.key);

    // projet : on passe par normalizeProject (mêmes règles qu'un fichier ouvert)
    const data = { ...p, scenes, current: scenes[0].id, song, playMode: 'song', bars: scenes[0].bars };
    data.tracks = p.tracks.map((t) => {
      const d = scenes[0].data[t.id];
      return t.type === 'drum' ? { ...t, steps: d.steps } : { ...t, events: d.events, ...(d.auto ? { auto: d.auto } : {}) };
    });
    const project = SS.normalizeProject(JSON.parse(JSON.stringify(data)));

    // tonalité : estimée sur tout le morceau (plus fiable que l'armure, souvent absente ou fausse)
    let key = null;
    if (SS.harmony && SS.harmony.detect) {
      const d = SS.harmony.detect(project);
      if (d && d.key) key = d.key;
    }
    if (key) project.scenes.forEach((sc) => (sc.key = { ...key }));

    // bilan
    const covered = A.blocks.reduce((a, b) => a + b.bars * b.repeat, 0);
    if (aligned) warnings.push(`${aligned} note(s) jouée(s) à côté de la grille : alignées sur la double-croche (Quantize).`);
    if (shifted) warnings.push(`${shifted} note(s) jouée(s) à côté de la grille des doubles-croches : leur décalage d'attaque est gardé (micro-décalage)${fine ? `, dont ${fine} en triolets, rapprochés de la double-croche la plus proche` : ''}.`);
    if (exprTracks.size) warnings.push(`Expression (CC 11) reprise en courbe de volume dans les scènes, sur ${exprTracks.size} piste(s) : le jeu automatique de StepSeq leur laisse la nuance.`);
    const drumRolls = notes.filter((n) => n.ch === 9).length - list.filter((g) => g.drum).reduce((a, g) => a + new Set(g.notes.map((n) => n.step)).size, 0);
    if (drumRolls > 0) warnings.push(`${drumRolls} coup(s) de batterie plus rapides que la double-croche (roulements, doublages) ont été fusionnés.`);
    if (pitchBends) warnings.push(`${pitchBends} message(s) de pitch bend ignorés.`);
    if (otherCC) warnings.push(`${otherCC} contrôleur(s) (modulation, expression, effets…) ignorés : seuls le volume et le panoramique de départ sont repris.`);
    if (programChanges) warnings.push(`${programChanges} changement(s) d'instrument en cours de morceau ignorés.`);
    if (firstBar > 0) warnings.push(`${firstBar} mesure(s) vide(s) au début supprimée(s).`);
    const report = {
      bars: totalBars,
      covered,
      fidelity: { kept: ref.size ? kept / ref.size : 1, added, total: ref.size },
      tempo,
      timeSig,
      key,
      tracks: list.map((g) => ({
        name: g.track.name,
        kind: g.drum ? 'drum' : 'instrument',
        sound: g.drum
          ? g.track.source === 'gm'
            ? `General MIDI · note ${g.note}`
            : `${drumLabel(g.type)} · ${MACHINES[g.track.machine] ? MACHINES[g.track.machine].label : g.track.machine}${g.note != null && !(g.note in GM_TO_DRUM) && !SS.findGmDrum(g.note) ? ` (note ${g.note} hors norme GM)` : ''}`
          : `${(gmForProgram(g.program) || {}).label || ''} (GM ${g.program + 1})`,
        notes: g.notes.length,
      })),
      scenes: project.scenes.map((s) => ({ name: s.name, bars: s.bars, times: song.filter((b) => b.scene === s.id).reduce((a, b) => a + b.repeat, 0) })),
      song: song.map((b) => ({ name: project.scenes.find((s) => s.id === b.scene).name, repeat: b.repeat })),
      sections: A.sections,
      warnings,
    };
    return { project, report };
  }

  SS.midi = { exportProject, importFile, analyze, programOf, gmEquivalent, drumTypeOf, drumNoteOf, keySignature, gmForProgram, gmVariantFor, MACHINES, GM_KIT, DRUM_TO_GM, GM_TO_DRUM, PPQ };
})(typeof window !== 'undefined' ? window : globalThis);
