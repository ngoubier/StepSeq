/*
 * Expression et articulations des instruments joués « à l'archet ou au souffle » : cordes, cuivres, bois, voix.
 *
 * Réglage de la piste (fenêtre Sound design, onglet Jeu), rangé dans track.sd comme les autres réglages du son :
 *   sd.expr   : 'light' | 'natural' | 'expressive' (absent : aucune expression, le son d'avant) ;
 *   sd.phrase : 0 coupe le phrasé automatique (par défaut, il accompagne l'expression).
 * Articulation d'une note (menu de la note, piano roll) : ev.art = 'leg' | 'stac' | 'det' | 'ten' | 'swell'.
 *
 * SS.expression.plan(events, opts) calcule, pour chaque note de la scène, comment la jouer :
 *   - les PHRASES : notes séparées par moins d'une croche de silence, coupées toutes les 4 mesures au plus ;
 *   - l'ARC de la phrase : elle monte vers sa note la plus haute puis retombe sur la dernière ;
 *   - le SOUFFLET des notes longues (une blanche ou plus) : elles enflent puis se posent ; en Expressive, les très
 *     longues notes des cordes et des cuivres font un « fp » (attaque, recul, crescendo) ;
 *   - la fin de phrase qui s'éteint, et la RESPIRATION des vents et des voix dans les longues lignes ;
 *   - le PHRASÉ automatique (notes sans articulation écrite) : notes liées → legato, notes répétées → détaché,
 *     doubles-croches isolées → staccato ;
 *   - les ARTICULATIONS écrites, qui l'emportent.
 * Résultat par note (Map événement → jeu) : { shape: [[x 0..1 de la durée, niveau]], durK, overlap (s), attack (s),
 * release (s), breath (s), bright: { ratio } }. js/audio.js l'applique : gain qui suit la forme, filtre qui s'ouvre
 * avec la nuance (le forte est plus brillant), durée, attaque et relâchement.
 *
 * Fonctions pures (aucun Web Audio) : testées par tests/expression.test.js.
 */
window.SS = window.SS || {};

SS.EXPR_LEVELS = [
  { id: 'off', label: 'Aucune', amt: 0, desc: 'Chaque note est jouée telle qu’elle est écrite, sans nuance ajoutée.' },
  { id: 'light', label: 'Légère', amt: 0.5, desc: 'Des nuances discrètes : la phrase respire, les notes longues enflent à peine.' },
  { id: 'natural', label: 'Naturelle', amt: 1, desc: 'Comme un musicien : arc de la phrase, soufflet des notes longues, timbre plus brillant dans le forte.' },
  { id: 'expressive', label: 'Expressive', amt: 1.5, desc: 'Nuances marquées, « fp » sur les très longues notes : pour les passages lyriques et cinématiques.' },
];

SS.ARTS = [
  { id: 'leg', label: 'Legato', mark: '⌒', desc: 'Liée à la note suivante : pas de nouvelle attaque, les deux notes se fondent.' },
  { id: 'stac', label: 'Staccato', mark: '•', desc: 'Piquée : courte, détachée, vite éteinte.' },
  { id: 'det', label: 'Détaché', mark: '‐', desc: 'Durée presque pleine avec un léger espace : chaque note se détache.' },
  { id: 'ten', label: 'Tenuto', mark: '—', desc: 'Tenue jusqu’au bout, sans retombée.' },
  { id: 'swell', label: 'Soufflet', mark: '◇', desc: 'Crescendo puis decrescendo dans la note (instruments à archet ou à vent).' },
  { id: 'mute', label: 'Étouffé', mark: '×', desc: 'Courte et sourde, la main posée sur les cordes (palm mute de la guitare).' },
];

/** Articulation d'une note : bornée, absente si aucune. */
SS.cleanArt = (ev) => {
  if (!SS.ARTS.some((a) => a.id === ev.art)) delete ev.art;
  return ev;
};

/**
 * Famille de jeu d'une piste : 'strings' | 'brass' | 'winds' | 'voice' (instruments acoustiques), 'synth' (cordes et
 * cuivres de synthé), 'pluck' (cordes pincées : harpe, pizzicato, sans expression proposée), null (le reste).
 */
SS.exprFamily = (track) => {
  if (!track || track.type !== 'instrument') return null;
  if (track.family === 'analog' || !SS.locateInstrument) return null;
  const loc = SS.locateInstrument(track.family, track.instrument);
  const inst = loc && loc.inst;
  if (!inst || inst.kind === 'analog') return null;
  const id = String(inst.id || '');
  const fam = loc.family && loc.family.id;
  if (/harp|pizzicato|strumstick|dantranh(?!_tremolo)|orchestra_hit|_stacc/.test(id)) return 'pluck';
  if (/synth_strings|synth_brass/.test(id)) return 'synth';
  if (fam === 'strings') return 'strings';
  if (fam === 'brass') return 'brass';
  if (fam === 'winds') return 'winds';
  if (fam === 'voices' && /choir|voice|oohs|aahs/.test(id)) return 'voice';
  if (fam === 'keys') return 'piano';
  if (fam === 'guitar') return 'guitar';
  return null;
};

/** Instruments frappés ou pincés : le son ne fait que s'éteindre, l'expression passe par la frappe, pas par la note. */
SS.exprStruck = (family) => family === 'piano' || family === 'guitar';

/** Expression proposée d'office pour une piste : 'natural' pour les instruments acoustiques, sinon null. */
SS.exprDefault = (track) => (['strings', 'brass', 'winds', 'voice', 'piano', 'guitar'].includes(SS.exprFamily(track)) ? 'natural' : null);

/** Pose l'expression proposée d'office (nouvelle piste, Band). Ne touche pas une piste qui en a déjà une. */
SS.applyExprDefault = (track) => {
  const d = SS.exprDefault(track);
  if (d && !(track.sd && track.sd.expr)) track.sd = { ...(track.sd || {}), expr: d };
  return track;
};

/** Quantité d'expression d'une piste (0 : aucune). */
SS.exprAmount = (track) => {
  const id = track && track.sd && track.sd.expr;
  const e = SS.EXPR_LEVELS.find((x) => x.id === id);
  return e ? e.amt : 0;
};

SS.expression = (() => {
  const PHRASE_GAP = 2; // pas de silence (une croche) qui séparent deux phrases
  const PHRASE_MAX = 64; // une phrase ne dépasse pas 4 mesures de 4/4
  const LONG = 8; // une blanche
  const VLONG = 16; // une ronde
  // nuance la plus douce (fraction) du filtre qui suit la nuance, par famille : le forte s'ouvre jusqu'au réglage du son
  const DARK = { strings: 0.11, brass: 0.08, winds: 0.16, voice: 0.14, synth: 0.1, pluck: 0.2, piano: 0.16, guitar: 0.22 };
  // petit nombre reproductible dans [0, 1) (décalage des doigts)
  const h01 = (a, b) => {
    let x = Math.imul((a + 1) * 2654435761, (b + 7) * 40503) ^ 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
    return ((x ^ (x >>> 12)) >>> 0) / 4294967296;
  };
  const lerp = (a, b, u) => a + (b - a) * u;
  const ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u)));
  const top = (ev) => Math.max(...ev.notes);

  /** Phrases : listes d'indices (dans l'ordre des notes), et si la phrase a été coupée faute de silence. */
  function phrases(evs) {
    const out = [];
    let cur = null;
    let end = -Infinity;
    evs.forEach((ev, i) => {
      const gap = ev.step - end;
      if (!cur || gap >= PHRASE_GAP || ev.step - evs[cur.idx[0]].step >= PHRASE_MAX) {
        if (cur) cur.forced = gap < PHRASE_GAP;
        cur = { idx: [], forced: false };
        out.push(cur);
      }
      cur.idx.push(i);
      end = Math.max(end, ev.step + ev.len);
    });
    return out;
  }

  /** Phrasé automatique d'une note sans articulation écrite. */
  function autoArt(ev, next, struck = false) {
    const touching = next && next.step <= ev.step + ev.len && next.step > ev.step;
    if (touching) {
      const same = next.notes.length === ev.notes.length && next.notes.every((m, k) => m === ev.notes[k]);
      return same ? 'det' : struck ? null : 'leg'; // piano, guitare : le legato vient des doigts et de la pédale
    }
    const gapAfter = next ? next.step - (ev.step + ev.len) : Infinity;
    if (ev.len <= 1 && gapAfter >= 1) return 'stac';
    return null;
  }

  /**
   * events : notes de la scène ({ step, len, notes, vel, art? }) ; opts : { amt (0..1,5), family, phrase (bool) }.
   * Retourne une Map événement → jeu (voir l'en-tête). Une note sans rien de particulier n'y figure pas.
   */
  // ownDyn : la scène a sa propre courbe de volume, { lane: { pas: valeur }, len: boucle de la courbe } (ou false)
  function plan(events, { amt = 1, family = 'strings', phrase = true, pedal = true, ownDyn = false, stepsPerBeat = 4, stepsPerBar = 16 } = {}) {
    const out = new Map();
    const evs = (events || []).filter((e) => e && e.notes && e.notes.length && e.len > 0).slice().sort((a, b) => a.step - b.step || top(b) - top(a));
    if (!evs.length) return out;
    const k = Math.max(0, Math.min(1.5, amt));
    const blowing = family === 'winds' || family === 'brass' || family === 'voice';
    const struck = SS.exprStruck(family);
    const ratio = Math.pow(DARK[family] || 0.15, Math.min(1, k));
    // note suivante qui commence après (les notes d'un même accord partagent le même pas)
    const nextOf = (i) => {
      for (let j = i + 1; j < evs.length; j++) if (evs[j].step > evs[i].step) return evs[j];
      return null;
    };
    const legIn = new Set();

    for (const ph of phrases(evs)) {
      const list = ph.idx.map((i) => evs[i]);
      const start = list[0].step;
      const last = list[list.length - 1];
      const span = Math.max(1, last.step + last.len - start);
      // sommet : la note la plus haute (la première si plusieurs)
      let peak = list[0];
      list.forEach((e) => top(e) > top(peak) && (peak = e));
      const up = Math.max(0.2, Math.min(0.85, (peak.step - start) / span));
      const single = list.length === 1;

      ph.idx.forEach((i, n) => {
        const ev = evs[i];
        const next = nextOf(i);
        const art = ev.art || (phrase && k > 0 ? autoArt(ev, next, struck) : null);
        const isLast = n === ph.idx.length - 1 || evs[ph.idx[ph.idx.length - 1]].step === ev.step;
        // niveau de la note dans l'arc de la phrase
        const u = (ev.step - start) / span;
        const arc = single ? 1 : u <= up ? lerp(0.86, 1, ease(u / up)) : lerp(1, 0.84, ease((u - up) / (1 - up)));
        const L = 1 - k * (1 - arc);
        const o = { shape: [[0, L], [1, L]], durK: 1, overlap: 0, attack: 0, release: 0, breath: 0, bright: { ratio }, velK: 1, delay: 0 };

        if (struck) {
          // frappé ou pincé : la nuance passe par la force de la frappe (et le timbre qui la suit), pas par la note
          o.shape = [[0, 1], [1, 1]];
          o.velK = 1 - k * (1 - arc) * (family === 'guitar' ? 0.6 : 1.3);
          if (family === 'guitar' && ev.notes.length > 1) {
            // accents du rythme (accords grattés ; une note seule vient d'un arpège ou d'une ligne qui a déjà ses accents) : premier temps, temps, contretemps, doubles
            const pos = ev.step % stepsPerBar;
            const m = pos === 0 ? 1 : pos % stepsPerBeat === 0 ? 0.93 : pos % (stepsPerBeat / 2 || 1) === 0 ? 0.85 : 0.78;
            o.velK *= 1 - k * (1 - m) * 0.9;
          }
          if (family === 'piano' && isLast && !single) o.delay = 0.015 * Math.min(1, k); // rubato : la fin de phrase s'étire
          const ord = ev.notes.map((m, i) => [m, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]); // du grave à l'aigu
          if (family === 'piano' && ev.notes.length > 1) {
            // la mélodie (note du haut) chante au-dessus de l'accord, les doigts ne tombent pas tout à fait ensemble
            const topI = ord[ord.length - 1];
            o.noteVel = ev.notes.map((_, i) => (i === topI ? 1 + 0.1 * k : 1 - 0.08 * k));
            o.noteDelay = ev.notes.map((m, i) => (i === topI ? 0 : (0.003 + 0.009 * h01(ev.step, m)) * Math.min(1, k)));
          }
          if (family === 'guitar' && ev.notes.length >= 3 && art !== 'mute') {
            // strum : vers le bas sur le temps et sa première moitié, vers le haut sur les contretemps
            const down = ev.step % stepsPerBeat < stepsPerBeat / 2;
            const total = (0.018 + 0.012 * Math.min(1.5, k)) * (down ? 1 : 0.75);
            const order = down ? ord : ord.slice().reverse();
            o.noteDelay = ev.notes.map(() => 0);
            o.noteVel = ev.notes.map(() => (down ? 1 : 0.85));
            order.forEach((i, j) => (o.noteDelay[i] = (total * j) / Math.max(1, order.length - 1)));
            if (!down && ev.notes.length >= 4) o.noteVel[ord[0]] = 0; // le coup vers le haut ne touche pas la corde grave
            o.strum = down ? 'down' : 'up';
          }
          // pédale automatique (piano) : la note tient jusqu'à la note suivante (au plus une mesure), puis la pédale se relève
          if (family === 'piano' && pedal && k > 0 && !['stac', 'det', 'mute'].includes(art) && next) {
            const ext = next.step - ev.step;
            if (ext > ev.len && ext <= stepsPerBar) o.holdTo = ext;
          }
        }
        // forme dans la note (instruments à archet, à vent, voix)
        else if (art === 'swell') o.shape = [[0, L * 0.55], [0.5, Math.min(1.1, L * 1.08)], [1, L * 0.5]];
        else if (art === 'ten') o.shape = [[0, L], [1, L]];
        else if (art !== 'stac' && k > 0 && ev.len >= VLONG && k >= 1.5 && (family === 'strings' || family === 'brass'))
          o.shape = [[0, L], [0.12, L * 0.62], [0.8, Math.min(1.08, L * 1.07)], [1, L * (isLast ? 0.7 : 0.95)]];
        else if (art !== 'stac' && k > 0 && ev.len >= LONG)
          o.shape = [[0, L * (1 - 0.16 * k)], [0.55, Math.min(1.06, L * (1 + 0.05 * k))], [1, L * (1 - (isLast ? 0.35 : 0.12) * k)]];
        else if (k > 0 && isLast && !single && art !== 'stac') o.shape = [[0, L], [1, L * (1 - 0.25 * k)]];

        // articulation
        if (art === 'stac') {
          o.durK = 0.45;
          o.release = 0.06;
        } else if (art === 'mute') {
          o.durK = 0.35;
          o.release = 0.04;
          o.velK *= 0.85;
          o.bright = { ratio: Math.min(ratio, 0.18), dark: true };
        } else if (art === 'det') {
          o.durK = 0.82;
        } else if (art === 'ten') {
          o.durK = 1.02;
        } else if (art === 'leg' && next) {
          o.overlap = 0.05;
          o.release = struck ? 0 : 0.08;
          if (!struck) legIn.add(next); // un piano réattaque toujours : seule la note précédente se prolonge
        }
        // la scène a sa propre courbe de volume (CC 11 d'un fichier MIDI, automation) : elle fait la nuance dans la note
        // (sauf un soufflet posé à la main) ; l'expression garde l'articulation, le phrasé et, pour les instruments frappés, la force de frappe
        if (ownDyn && !struck) {
          if (art !== 'swell') o.shape = [[0, 1], [1, 1]]; // un soufflet posé à la main reste, par-dessus la courbe
          // le timbre suit la courbe : plus sombre dans le piano, il s'ouvre quand la courbe monte (pendant la note aussi)
          if (ownDyn.lane) o.bright = { ...o.bright, shape: [0, 0.25, 0.5, 0.75, 1].map((x) => [x, Math.max(0, Math.min(1, SS.autoValue(ownDyn.lane, ev.step + x * ev.len, ownDyn.len) ?? 1))]) };
        }
        // respiration : vents et voix, au bout d'une longue ligne sans silence
        if (blowing && k > 0 && isLast && ph.forced) o.breath = 0.08;
        out.set(ev, o);
      });
    }
    // une note liée à la précédente n'attaque pas : attaque adoucie (les autres notes de l'accord aussi)
    for (const ev of evs) if (legIn.has(ev) || [...legIn].some((x) => x.step === ev.step)) out.get(ev).attack = 0.045;
    return out;
  }

  /** Niveau de la forme au point x (0..1). */
  function at(shape, x) {
    if (!shape || !shape.length) return 1;
    if (x <= shape[0][0]) return shape[0][1];
    for (let i = 1; i < shape.length; i++) {
      const [x1, v1] = shape[i];
      const [x0, v0] = shape[i - 1];
      if (x <= x1) return x1 === x0 ? v1 : v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
    }
    return shape[shape.length - 1][1];
  }

  /** Fréquence du filtre (Hz) pour une nuance d (0..1+) : du plus sombre (ratio × base) à la fréquence de base. */
  const brightHz = (base, ratio, d) => Math.max(200, Math.min(20000, base * Math.pow(ratio, 1 - Math.max(0, Math.min(1, d)))));

  // mémoire du dernier calcul par liste de notes (le séquenceur le demande à chaque pas)
  const memo = new WeakMap();
  const sig = (events, amt, phrase, family) => {
    let h = 0;
    for (const e of events) {
      h = (h * 31 + e.step * 7 + e.len * 13 + (e.notes ? e.notes.reduce((a, m) => a * 3 + m, 0) : 0) + (e.art ? e.art.length * 101 + e.art.charCodeAt(0) : 0)) | 0;
    }
    return `${events.length}|${h}|${amt}|${phrase}|${family}`;
  };
  /** Plan d'une piste pour ses notes jouées (null si la piste n'a pas d'expression ni d'articulation). */
  function forTrack(track, events, { stepsPerBeat: spb = 4, stepsPerBar: spbar = 16 } = {}) {
    const amt = SS.exprAmount(track);
    if (!events || !events.length) return null;
    if (!amt && !events.some((e) => e.art)) return null;
    const family = SS.exprFamily(track) || 'synth';
    const phrase = !(track.sd && track.sd.phrase === 0);
    // pédale automatique : sauf si la piste a sa propre courbe de pédale, ou si on l'a coupée
    const pedal = !(track.sd && track.sd.pedal === 0) && !(track.auto && track.auto.sustain);
    // courbe de volume propre à la scène : c'est elle qui fait la nuance dans la note
    const lane = track.auto && track.auto.volume && Object.keys(track.auto.volume).length ? track.auto.volume : null;
    const ownDyn = lane ? { lane, len: track.autoLen > 0 ? track.autoLen : Infinity } : false;
    const s = sig(events, amt, phrase, family) + (pedal ? 'p' : '') + (lane ? 'v' + JSON.stringify(lane) + ownDyn.len : '') + `|${spb}|${spbar}`;
    const hit = memo.get(events);
    if (hit && hit.s === s) return hit.plan;
    const p = plan(events, { amt, family, phrase, pedal, ownDyn, stepsPerBeat: spb, stepsPerBar: spbar });
    memo.set(events, { s, plan: p });
    return p;
  }

  return { plan, forTrack, at, brightHz, phrases, autoArt, PHRASE_GAP, PHRASE_MAX, LONG, VLONG };
})();
