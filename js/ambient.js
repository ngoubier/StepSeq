/*
 * Pistes Ambient : un moteur génératif et trois modules (un seul module par piste, choisi à la création).
 *
 *   🌿 Jardin   : nuage de grains (sur un son intégré ou un fichier à toi), 4 boucles de longueurs différentes façon
 *                 Eno, drone, enregistrement de terrain (pluie intégrée ou fichier à toi), marée (filtre très lent).
 *   🏔 Paysage  : graines plantées dans un paysage (cloche, corde, souffle, piano, bol, gouttes) ; x = grave → aigu,
 *                 y = loin (réverbe, sombre) → proche ; vent (ou pluie) qui passe dans des résonateurs accordés.
 *   🎞 Fresque  : 5 couches dont on dessine la présence sur toute la chanson : boucle de bande qui s'use à chaque
 *                 tour, nappe spectrale, cloches, piano, grave.
 *
 * Le moteur (commun) : la piste est une piste instrument de la famille « ambient » (track.instrument = module).
 * À chaque pas de la lecture (js/audio.js scheduleStep), SS.ambient.step() programme ce qui tombe dans le pas :
 * les notes viennent de l'accord de la scène (piste Accords) ou, si « Suit les accords » est coupé, de la gamme de
 * la scène ; la courbe de présence (sur toute la chanson) règle le volume de la piste. Les modules gardent leur
 * propre horloge en secondes : les boucles et les mouvements lents ne sont pas calés sur la grille.
 *
 * Réglages : track.ambient = { follow, rand, presence: [PN valeurs] | null, rands: [PN valeurs] | null, jardin: {…}, paysage: {…},
 * fresque: {…} } (rands : le hasard au fil de la chanson, posé par le musicien Ambient de l'assistant ; sinon rand partout)
 * (un bloc par module : changer de module garde les réglages de l'autre). Les fichiers audio importés sont rangés
 * dans le navigateur (IndexedDB « stepseq-sounds ») ; le projet ne garde que leur clé et leur nom.
 *
 * Couleurs : noms de variables CSS de la palette (css/style.css), lues par la fenêtre de réglages.
 *
 * Fonctions pures testées sous Node (tests/ambient.test.js) : settings, curveAt, pool, songFrac, sceneSpan, harmonyAt.
 */
window.SS = window.SS || {};
SS.isAmbient = (t) => !!t && t.type === 'instrument' && t.family === 'ambient';

SS.ambient = (() => {
  const PN = 48; // points d'une courbe sur toute la chanson
  const GAIN = { jardin: 2, paysage: 2.2, fresque: 1 }; // niveaux des modules, accordés entre eux
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const bump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
  const shape = (f) => Array.from({ length: PN }, (_, i) => Math.round(clamp(f(i / (PN - 1)), 0, 1) * 1000) / 1000);

  /* ================================================================== */
  /* Modules : description et réglages par défaut                        */
  /* ================================================================== */
  const MODULES = {
    jardin: {
      id: 'jardin', label: 'Jardin', icon: '🌿', color: '--c-teal', sub: 'grains · boucles · drone · terrain',
      desc: 'Un nuage de grains fait à partir de n’importe quel son (le tien), des boucles de longueurs différentes façon Eno, un drone et un enregistrement de terrain.',
      defaults: () => ({
        gPos: 0.15, gDrift: 0.35, gSpray: 0.25, gSize: 0.28, gDens: 16, gPitch: 0, gOct: 0.3, gVol: 0.55,
        loops: [17.3, 19.9, 23.1, 29.3], lVoice: 'bell', lProb: 0.85, lVol: 0.6,
        dVol: 0.35, dBeat: 6, dBright: 0.3,
        fVol: 0.25, fFar: 0.4,
        tPer: 90, tAmt: 0.6,
        grainFile: null, fieldFile: null, // { key, name }
      }),
    },
    paysage: {
      id: 'paysage', label: 'Paysage', icon: '🏔', color: '--c-cyan-soft', sub: 'graines · vent qui chante',
      desc: 'Tu plantes des graines (cloche, corde, souffle, piano, bol, gouttes) dans un paysage : chacune joue seule les notes de l’accord. Le vent chante l’accord.',
      defaults: () => ({
        seeds: [
          { k: 'bowl', x: 0.18, y: 0.35, s: 1 }, { k: 'piano', x: 0.5, y: 0.78, s: 1 }, { k: 'bell', x: 0.74, y: 0.3, s: 1.1 },
          { k: 'breath', x: 0.34, y: 0.55, s: 1 }, { k: 'drop', x: 0.88, y: 0.6, s: 0.8 },
        ],
        wKind: 'wind', wVol: 0.4, wRes: 0.7, wGust: 0.5,
      }),
    },
    fresque: {
      id: 'fresque', label: 'Fresque', icon: '🎞', color: '--c-amber', sub: 'bande qui s’use · nappe spectrale · couches dessinées',
      desc: 'Tu dessines 5 couches sur toute la chanson : une boucle de bande qui s’use à chaque tour, une nappe spectrale, des cloches, un piano et un grave.',
      defaults: () => ({
        curves: {
          tape: shape((x) => Math.min(1, x * 5) * 0.8 * (1 - bump(x, 1, 0.12) * 0.9)),
          spec: shape((x) => 0.25 + 0.6 * bump(x, 0.55, 0.25)),
          bell: shape((x) => 0.7 * bump(x, 0.3, 0.1) + 0.5 * bump(x, 0.8, 0.08)),
          piano: shape((x) => 0.75 * bump(x, 0.62, 0.14)),
          low: shape((x) => 0.8 * bump(x, 0.5, 0.2)),
        },
        wear: 0.45, wow: 0.35, hiss: 0.25, move: 0.5, glide: 5,
      }),
    },
  };
  const LAYERS = [
    { id: 'tape', label: 'Bande', color: '--c-amber' },
    { id: 'spec', label: 'Nappe', color: '--c-teal-soft' },
    { id: 'bell', label: 'Cloches', color: '--c-yellow-soft' },
    { id: 'piano', label: 'Piano', color: '--c-red-soft' },
    { id: 'low', label: 'Grave', color: '--c-violet' },
  ];
  const SEEDS = {
    bell: { label: 'Cloche', color: '--c-yellow-soft', mean: 7 },
    string: { label: 'Corde', color: '--c-green-soft', mean: 4 },
    breath: { label: 'Souffle', color: '--c-blue-soft', mean: 11 },
    piano: { label: 'Piano', color: '--c-red-soft', mean: 14 },
    bowl: { label: 'Bol', color: '--c-violet-soft', mean: 16 },
    drop: { label: 'Gouttes', color: '--c-cyan', mean: 6 },
  };

  /* ================================================================== */
  /* Fonctions pures                                                     */
  /* ================================================================== */

  const moduleOf = (track) => (MODULES[track && track.instrument] ? track.instrument : 'jardin');
  /** Réglages complets d'une piste : { mod, follow, rand, presence, p } (p : réglages du module, avec les défauts). */
  function settings(track) {
    const a = (track && track.ambient) || {};
    const mod = moduleOf(track);
    const def = MODULES[mod].defaults();
    const own = a[mod] || {};
    const p = { ...def, ...own };
    if (mod === 'fresque') p.curves = { ...def.curves, ...(own.curves || {}) };
    return { mod, follow: a.follow !== false, rand: typeof a.rand === 'number' ? clamp(a.rand, 0, 1) : 0.5, presence: Array.isArray(a.presence) ? a.presence : null, rands: Array.isArray(a.rands) && a.rands.length ? a.rands : null, p };
  }
  /** Valeur d'une courbe (PN points sur 0..1) en x ; pas de courbe = 1. */
  function curveAt(arr, x) {
    if (!Array.isArray(arr) || !arr.length) return 1;
    const f = clamp(x, 0, 1) * (arr.length - 1), i = Math.floor(f), k = f - i;
    const a = +arr[i] || 0, b = +arr[Math.min(arr.length - 1, i + 1)] || 0;
    return a * (1 - k) + b * k;
  }
  /** Notes (midi) entre lo et hi dont la classe est dans pcs (triées). */
  function pool(pcs, lo, hi) {
    const set = new Set((pcs || []).map(pcOf));
    const out = [];
    for (let m = Math.ceil(lo); m <= hi; m++) if (set.has(pcOf(m))) out.push(m);
    return out.length ? out : [60];
  }
  const barsOf = (p, id) => {
    const sc = (p.scenes || []).find((x) => x.id === id);
    return sc ? (sc.id === p.current ? p.bars : sc.bars || p.bars) : 0;
  };
  /**
   * Position dans la chanson (0..1) : en mode chanson, le bloc, la répétition et le pas ; sinon, la place de la
   * scène en cours dans l'arrangement (sa première apparition), ou la position dans la scène si elle n'y est pas.
   */
  function songFrac(p, song, tick) {
    const spb = SS.stepsPerBar(p);
    const total = SS.totalSteps(p);
    const blocks = (p.song || []).filter((b) => (p.scenes || []).some((sc) => sc.id === b.scene));
    const len = (b) => barsOf(p, b.scene) * spb * Math.max(1, b.repeat || 1);
    const all = blocks.reduce((s, b) => s + len(b), 0);
    const inScene = (tick % total) / total;
    if (!all) return inScene;
    let i = song && Number.isInteger(song.index) ? song.index : blocks.findIndex((b) => b.scene === p.current);
    if (i < 0 || i >= blocks.length) return inScene;
    let before = 0;
    for (let k = 0; k < i; k++) before += len(blocks[k]);
    const rep = song ? song.rep || 0 : 0;
    return clamp((before + rep * total + (tick % total)) / all, 0, 1);
  }
  /**
   * Part de la chanson (0..1) occupée par la scène en cours : [début, fin] de sa première apparition dans
   * l'arrangement (comme songFrac hors mode chanson) ; [0, 1] sans arrangement ou si la scène n'y est pas.
   */
  function sceneSpan(p) {
    const spb = SS.stepsPerBar(p);
    const blocks = (p.song || []).filter((b) => (p.scenes || []).some((sc) => sc.id === b.scene));
    const len = (b) => barsOf(p, b.scene) * spb * Math.max(1, b.repeat || 1);
    const all = blocks.reduce((s, b) => s + len(b), 0);
    const i = blocks.findIndex((b) => b.scene === p.current);
    if (!all || i < 0) return [0, 1];
    let before = 0;
    for (let k = 0; k < i; k++) before += len(blocks[k]);
    return [before / all, clamp((before + SS.totalSteps(p)) / all, 0, 1)];
  }
  /**
   * Harmonie au pas `tick` de la scène en cours : { pcs (accord), scale (gamme), root (classe), key (texte qui change
   * quand l'harmonie change) }. Sans accord : la tonique, la tierce et la quinte de la gamme ; sans tonalité : Do majeur.
   */
  function harmonyAt(p, tick) {
    const sc = p.scenes && p.scenes.length ? SS.currentScene(p) : null;
    const key = sc && SS.harmony && SS.harmony.valid(sc.key) ? sc.key : { tonic: 'C', mode: 'major' };
    const scale = SS.harmony ? SS.harmony.scale(key).map((d) => d.pc) : [0, 2, 4, 5, 7, 9, 11];
    const chords = SS.sceneGridChords ? SS.sceneGridChords(p) : [];
    const st = tick % SS.totalSteps(p);
    let c = chords.find((x) => st >= x.step && st < x.step + x.len);
    if (!c && chords.length) c = [...chords].reverse().find((x) => x.step <= st) || chords[chords.length - 1];
    if (c && c.info) {
      const pcs = SS.chordNotes(c.info.rootPc, c.info.type).map(pcOf);
      return { pcs, scale, root: c.info.rootPc, key: `${c.info.rootPc}:${c.info.type}` };
    }
    const pcs = [scale[0], scale[2], scale[4], scale[1]];
    return { pcs, scale, root: scale[0], key: `s${scale.join('.')}` };
  }

  /* ================================================================== */
  /* Sons de base (par contexte audio)                                   */
  /* ================================================================== */
  const banks = new WeakMap(); // ctx -> { piano, rain, wind, noise, ir, files: Map }
  const bank = (ctx) => {
    let b = banks.get(ctx);
    if (!b) banks.set(ctx, (b = { files: new Map() }));
    return b;
  };
  const SIN = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) SIN[i] = Math.sin((2 * Math.PI * i) / 4096);
  /** Somme de partiels (table de sinus) : [{ f, a, start, dec }] → Float32Array de n échantillons à sr Hz. */
  function additive(n, sr, parts, env) {
    const d = new Float32Array(n);
    parts.forEach(({ f, a, start = 0, dec = 0 }) => {
      const inc = (f / sr) * 4096;
      let ph = Math.random() * 4096;
      const s0 = Math.floor(start * sr);
      const kd = dec ? Math.exp(-1 / (dec * sr)) : 1;
      let g = a;
      for (let i = s0; i < n; i++) {
        d[i] += g * SIN[ph & 4095] * (env ? env(i / sr, start) : 1);
        ph += inc;
        g *= kd;
      }
    });
    return d;
  }
  function normalize(d, to = 0.9) {
    let m = 0;
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
    if (m) for (let i = 0; i < d.length; i++) d[i] *= to / m;
    return d;
  }
  /** Accord de piano intégré (source par défaut des grains) : Ré add9 large, 7 s, 24 kHz. */
  function pianoBuf(ctx) {
    const b = bank(ctx);
    if (b.piano) return b.piano;
    const sr = 24000, n = sr * 7;
    const parts = [];
    [50, 57, 62, 66, 69, 74, 76, 81].forEach((m, k) => {
      for (let h = 1; h <= 4; h++) parts.push({ f: mtof(m) * h * (1 + 0.0004 * h * h), a: 0.18 / Math.pow(h, 1.3), start: k * 0.32, dec: 1.6 + 3 / h });
    });
    const d = normalize(additive(n, sr, parts, (t, s) => Math.min(1, (t - s) * 300)));
    const buf = ctx.createBuffer(1, n, sr);
    buf.copyToChannel(d, 0);
    return (b.piano = buf);
  }
  /** Pluie ou vent intégrés (12–14 s, en boucle). */
  function noiseBuf(ctx, kind) {
    const b = bank(ctx);
    if (b[kind]) return b[kind];
    const sr = 24000, sec = kind === 'wind' ? 14 : 12, n = sr * sec;
    const buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(n);
      let lp = 0, br = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        br = (br + 0.02 * w) / 1.02;
        lp += 0.12 * (w - lp);
        d[i] = kind === 'wind' ? br * 3.5 : kind === 'noise' ? w : lp * 0.6;
      }
      if (kind === 'rain')
        for (let k = 0; k < sec * 200; k++) {
          const p = Math.floor(Math.random() * (n - 400)), a = Math.random() * 0.35, f = rnd(1800, 5200);
          for (let j = 0; j < 400; j++) d[p + j] += a * Math.sin((2 * Math.PI * f * j) / sr) * Math.exp(-j / 50);
        }
      const fade = sr * 0.6;
      for (let i = 0; i < fade; i++) {
        const g = i / fade;
        d[i] = d[i] * g + d[n - fade + i] * (1 - g);
      }
      buf.copyToChannel(normalize(d, 0.75), c);
    }
    return (b[kind] = buf);
  }
  /** Réverbe « lointaine » des graines du Paysage (4 s). */
  function farIR(ctx) {
    const b = bank(ctx);
    if (b.ir) return b.ir;
    const sr = ctx.sampleRate, n = Math.floor(sr * 4), buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(n);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp += 0.3 * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - i / n, 2.3) * Math.min(1, i / (sr * 0.05)) * 0.5;
      }
      buf.copyToChannel(d, c);
    }
    return (b.ir = buf);
  }

  /* ================================================================== */
  /* Fichiers importés (IndexedDB)                                       */
  /* ================================================================== */
  const store = (() => {
    let dbp = null;
    const open = () => {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        if (typeof indexedDB === 'undefined') return rej(new Error('pas de stockage'));
        const r = indexedDB.open('stepseq-sounds', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return dbp;
    };
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('files', mode);
        const req = fn(t.objectStore('files'));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    };
    async function put(arrayBuffer) {
      const h = await crypto.subtle.digest('SHA-1', arrayBuffer);
      const key = Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
      await tx('readwrite', (s) => s.put(arrayBuffer, key));
      return key;
    }
    const get = (key) => tx('readonly', (s) => s.get(key));
    return { put, get };
  })();
  /** Importe un fichier audio de l'utilisateur : { key, name } (le son est rangé dans le navigateur). */
  async function importFile(file) {
    const ab = await file.arrayBuffer();
    const ctx = SS.audio.ensureCtx();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    const key = await store.put(ab);
    bank(ctx).files.set(key, buf);
    return { key, name: file.name, sec: Math.round(buf.duration * 10) / 10 };
  }
  async function loadFile(ctx, ref) {
    if (!ref || !ref.key) return null;
    const b = bank(ctx);
    if (b.files.has(ref.key)) return b.files.get(ref.key);
    try {
      const ab = await store.get(ref.key);
      if (!ab) return null;
      const buf = await ctx.decodeAudioData(ab.slice(0));
      b.files.set(ref.key, buf);
      return buf;
    } catch (e) {
      return null;
    }
  }
  const fileBuf = (ctx, ref) => (ref && ref.key ? bank(ctx).files.get(ref.key) || null : null);
  /** Préchargement (js/audio.js prepareTrack) : sons de base et fichiers importés. */
  async function prepare(ctx, track) {
    const A = settings(track);
    if (A.mod === 'jardin') {
      pianoBuf(ctx);
      noiseBuf(ctx, 'rain');
      await Promise.all([loadFile(ctx, A.p.grainFile), loadFile(ctx, A.p.fieldFile)]);
    } else if (A.mod === 'paysage') {
      noiseBuf(ctx, 'wind');
      noiseBuf(ctx, 'rain');
      farIR(ctx);
    } else noiseBuf(ctx, 'noise');
  }

  /*
   * Notes jouées par le moteur, pour les dessiner dans la Grille (js/ambientlane.js) : pendant un pas, `cur` est
   * l'état de la piste ; chaque voix note sa hauteur, son heure et sa place dans la scène (0..1). Les grains, trop
   * nombreux, ne sont pas notés.
   */
  let cur = null;
  const MARKS = 80;
  function mark(f, t) {
    if (!cur) return;
    const m = cur.marks;
    m.push({ m: 69 + 12 * Math.log2(f / 440), t, x: cur.pos });
    if (m.length > MARKS) m.splice(0, m.length - MARKS);
  }

  /* ================================================================== */
  /* Voix                                                                */
  /* ================================================================== */
  function partials(ctx, dest, f, t, list, atk, amp, spread = 0.7) {
    mark(f, t);
    list.forEach(([h, a, dec]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f * h;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * a, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      let last = g;
      if (spread) {
        const p = ctx.createStereoPanner();
        p.pan.value = rnd(-spread, spread);
        g.connect(p);
        last = p;
      }
      o.connect(g);
      last.connect(dest);
      o.start(t);
      o.stop(t + dec + 0.1);
    });
  }
  const BELL = [[1, 1, 6], [2.76, 0.3, 2.5], [5.4, 0.1, 1.2]];
  const PIANO = [[1, 1, 4.5], [2, 0.4, 2.5], [3, 0.15, 1.4], [4.01, 0.06, 0.8]];

  /* ================================================================== */
  /* Module Jardin                                                       */
  /* ================================================================== */
  const jardin = {
    start(st) {
      const c = st.ctx;
      st.tide = c.createBiquadFilter();
      st.tide.type = 'lowpass';
      st.tide.frequency.value = 8000;
      st.tide.connect(st.out);
      const bus = () => {
        const g = c.createGain();
        g.gain.value = 0;
        g.connect(st.tide);
        return g;
      };
      st.gG = bus();
      st.lG = bus();
      st.dG = bus();
      st.fG = bus();
      st.gHead = 0;
      st.nextGrain = 0;
      st.loopNext = [];
      st.live = [];
    },
    drone(st, P, env, t) {
      const c = st.ctx;
      if (!st.drone) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.setTargetAtTime(0.25, t, 2);
        lp.connect(g).connect(st.dG);
        const oscs = [];
        [0, 7].forEach((iv) =>
          [-1, 1].forEach((s) => {
            const o = c.createOscillator();
            o.type = 'sawtooth';
            const og = c.createGain();
            og.gain.value = 0.07;
            o.connect(og).connect(lp);
            o.start(t);
            oscs.push({ o, iv, s });
          }),
        );
        st.drone = { lp, g, oscs, root: -1 };
        st.stoppers.push((at) => oscs.forEach(({ o }) => o.stop(at)));
      }
      const D = st.drone;
      const r = 36 + env.root + (env.root > 6 ? 0 : 12);
      if (r !== D.root) {
        const first = D.root < 0;
        D.root = r;
        D.oscs.forEach(({ o, iv }) => o.frequency.setTargetAtTime(mtof(r + iv), t, first ? 0.005 : 3));
      }
      D.lp.frequency.setTargetAtTime(150 + Math.pow(P.dBright, 2) * 3000, t, 0.5);
      D.oscs.forEach(({ o, s }) => o.detune.setTargetAtTime(s * P.dBeat, t, 0.5));
    },
    field(st, P, t) {
      const c = st.ctx;
      const buf = fileBuf(c, P.fieldFile) || noiseBuf(c, 'rain');
      if (!st.field || st.field.buf !== buf) {
        if (st.field) {
          const F = st.field;
          F.g.gain.setTargetAtTime(0, t, 0.8);
          F.s.stop(t + 5);
        }
        const s = c.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.setTargetAtTime(1, t, 1.5);
        s.connect(lp).connect(g).connect(st.fG);
        s.start(t);
        st.field = { s, lp, g, buf };
        st.stoppers.push((at) => s.stop(at));
      }
      st.field.lp.frequency.setTargetAtTime(18000 * Math.pow(1 - P.fFar, 2.2) + 300, t, 0.3);
    },
    voice(st, P, m, t, i) {
      const c = st.ctx, f = mtof(m), out = c.createGain(), pan = c.createStereoPanner();
      pan.pan.value = [-0.5, 0.4, -0.2, 0.6][i % 4];
      out.connect(pan).connect(st.lG);
      if (P.lVoice === 'pad') {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.connect(out);
        [-7, 0, 7].forEach((d) => {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = d;
          o.connect(lp);
          o.start(t);
          o.stop(t + 11);
        });
        out.gain.setValueAtTime(0, t);
        out.gain.linearRampToValueAtTime(0.09, t + 3.5);
        out.gain.linearRampToValueAtTime(0, t + 10.5);
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.linearRampToValueAtTime(1600, t + 4);
        lp.frequency.linearRampToValueAtTime(500, t + 10);
      } else
        partials(c, out, f, t, P.lVoice === 'bell' ? [[1, 1, 6], [2, 0.3, 3], [3.01, 0.12, 1.8], [4.2, 0.06, 1.2]] : [[1, 1, 4], [2, 0.45, 2.5], [3, 0.2, 1.6], [4, 0.1, 1]], P.lVoice === 'bell' ? 0.015 : 0.03, 0.16, 0);
    },
    step(st, P, env, t0, t1) {
      const c = st.ctx, set = (prm, v) => prm.setTargetAtTime(v, t0, 0.2);
      set(st.gG.gain, P.gVol);
      set(st.lG.gain, P.lVol);
      set(st.dG.gain, P.dVol);
      set(st.fG.gain, P.fVol);
      this.drone(st, P, env, t0);
      this.field(st, P, t0);
      // marée : filtre de tout le module, sur un cycle de tPer secondes
      const ph = ((t0 - st.t0) / Math.max(5, P.tPer)) % 1, x = 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI);
      st.tide.frequency.setTargetAtTime(Math.min(16000, 9000 * Math.pow(1 - P.tAmt * (1 - x), 3) + 250), t0, 0.5);
      // grains : la tête dérive autour de Position
      const buf = fileBuf(c, P.grainFile) || pianoBuf(c);
      st.gHead = clamp(P.gPos + (P.gDrift * 0.35 * (Math.sin(t0 * 0.031) + 0.5 * Math.sin(t0 * 0.0113 + 1.7))) / 1.5, 0, 0.999);
      const dens = clamp(P.gDens, 1, 60);
      if (!st.nextGrain || st.nextGrain < t0 - 1) st.nextGrain = t0;
      const isOwn = !!fileBuf(c, P.grainFile);
      while (st.nextGrain < t1) {
        const dur = P.gSize * rnd(0.7, 1.3), sp = P.gSpray * 0.25;
        const pos = (((st.gHead + rnd(-sp, sp)) % 1) + 1) % 1;
        let semi = P.gPitch;
        if (Math.random() < P.gOct) semi += pick([-12, 12, 7, -12]);
        // le piano intégré est en Ré : ses grains prennent les notes de l'accord de la scène
        if (!isOwn && Math.random() < 0.5 + env.rand * 0.5) semi += pick(env.pcs.map((pc) => pcOf(pc - 2)));
        const rate = Math.pow(2, semi / 12), off = pos * Math.max(0.01, buf.duration - dur * rate);
        const s = c.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = rate;
        const g = c.createGain(), pk = 0.5 / Math.sqrt(Math.max(1, dens * dur)), t = Math.max(t0, st.nextGrain);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(pk, t + dur * 0.45);
        g.gain.linearRampToValueAtTime(0, t + dur);
        const pn = c.createStereoPanner();
        pn.pan.value = rnd(-0.8, 0.8);
        s.connect(g).connect(pn).connect(st.gG);
        s.start(t, off, dur * rate + 0.01);
        s.stop(t + dur + 0.05);
        st.live.push({ pos, born: t, dur });
        if (st.live.length > 200) st.live.splice(0, 100);
        st.nextGrain += (1 / dens) * rnd(0.5, 1.5);
      }
      // boucles Eno : une note toutes les N secondes, chaque boucle à sa longueur
      const lens = (P.loops || []).slice(0, 4);
      lens.forEach((len, i) => {
        len = clamp(+len || 17, 3, 120);
        if (!st.loopNext[i]) st.loopNext[i] = t0 + rnd(0, 8);
        while (st.loopNext[i] < t1) {
          if (Math.random() < P.lProb) {
            const pl = env.notes(55, 88);
            const m = Math.random() < env.rand ? pick(pl) : pl[(i * 2 + 1) % pl.length];
            this.voice(st, P, m, Math.max(t0, st.loopNext[i]), i);
            st.lastNotes[i] = m;
          }
          st.loopNext[i] += len;
        }
      });
    },
  };

  /* ================================================================== */
  /* Module Paysage                                                      */
  /* ================================================================== */
  const ks = new WeakMap(); // ctx -> Map(hauteur -> buffer Karplus-Strong)
  function karplus(c, f) {
    let m = ks.get(c);
    if (!m) ks.set(c, (m = new Map()));
    const k = Math.round(f * 10);
    if (m.has(k)) return m.get(k);
    const sr = 24000, n = sr * 4, d = new Float32Array(n), P = Math.max(2, Math.round(sr / f)), bf = new Float32Array(P);
    for (let i = 0; i < P; i++) bf[i] = Math.random() * 2 - 1;
    let ix = 0, pv = 0;
    for (let i = 0; i < n; i++) {
      const cu = bf[ix];
      bf[ix] = 0.4985 * (cu + pv);
      pv = cu;
      d[i] = cu;
      ix = (ix + 1) % P;
    }
    const b = c.createBuffer(1, n, sr);
    b.copyToChannel(d, 0);
    m.set(k, b);
    return b;
  }
  const paysage = {
    start(st) {
      const c = st.ctx;
      st.far = c.createConvolver();
      st.far.buffer = farIR(c);
      st.far.connect(st.out);
      st.seedNext = new Map();
    },
    wind(st, P, env, t) {
      const c = st.ctx;
      if (!st.wind || st.wind.kind !== P.wKind) {
        if (st.wind) {
          const W = st.wind;
          W.out.gain.setTargetAtTime(0, t, 1);
          W.src.stop(t + 5);
        }
        const src = c.createBufferSource();
        src.buffer = noiseBuf(c, P.wKind === 'rain' ? 'rain' : 'wind');
        src.loop = true;
        const gust = c.createGain();
        const dryLp = c.createBiquadFilter();
        dryLp.type = 'lowpass';
        dryLp.frequency.value = 2500;
        const dry = c.createGain(), res = c.createGain(), out = c.createGain();
        out.gain.setValueAtTime(0, t);
        src.connect(gust);
        gust.connect(dryLp).connect(dry).connect(out);
        const bands = [];
        for (let i = 0; i < 7; i++) {
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 90;
          const g = c.createGain();
          g.gain.value = 9;
          gust.connect(bp).connect(g).connect(res);
          bands.push(bp);
        }
        res.connect(out);
        out.connect(st.out);
        const s = c.createGain();
        s.gain.value = 0.4;
        out.connect(s).connect(st.far);
        src.start(t);
        st.wind = { kind: P.wKind, src, gust, dry, res, out, bands, key: '' };
        st.stoppers.push((at) => src.stop(at));
      }
      const W = st.wind;
      if (W.key !== env.key) {
        const ns = env.notes(45, 88);
        W.bands.forEach((bp, i) => bp.frequency.setTargetAtTime(mtof(ns[Math.floor((i / W.bands.length) * ns.length)]), t, W.key ? 4 : 0.01));
        W.key = env.key;
      }
      W.dry.gain.setTargetAtTime(0.25 * (1 - P.wRes) + 0.03, t, 0.3);
      W.res.gain.setTargetAtTime(P.wRes * 1.1, t, 0.3);
      W.out.gain.setTargetAtTime(P.wVol, t, 0.8);
      W.gust.gain.setTargetAtTime(Math.max(0.05, 0.35 + P.wGust * 0.65 * (0.5 + 0.5 * Math.sin(t * 0.13) * Math.sin(t * 0.047 + 1))), t, 0.5);
    },
    chain(st, s, t, life) {
      const c = st.ctx, out = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900 + Math.pow(s.y, 1.5) * 9000;
      const pan = c.createStereoPanner();
      pan.pan.value = (s.x * 2 - 1) * 0.8;
      const dry = c.createGain();
      dry.gain.value = 0.15 + s.y * 0.85;
      const send = c.createGain();
      send.gain.value = 0.2 + (1 - s.y) * 0.9;
      out.connect(lp).connect(pan);
      pan.connect(dry).connect(st.out);
      pan.connect(send).connect(st.far);
      return out;
    },
    play(st, s, env, t, idx) {
      const c = st.ctx, pl = env.notes(36, 96), center = 40 + s.x * 50;
      const near = pl.filter((m) => Math.abs(m - center) <= 9);
      const m = pick(near.length ? near : pl), f = mtof(m);
      st.lastSeed.set(idx, { m, t });
      if (s.k === 'bell') partials(c, this.chain(st, s, t, 7), f, t, [[1, 1, 6], [2.76, 0.35, 3], [5.4, 0.12, 1.6], [8.9, 0.05, 0.9]], 0.01, 0.13, 0);
      else if (s.k === 'bowl') partials(c, this.chain(st, s, t, 14), f / 2, t, [[1, 1, 12], [2.71, 0.5, 9], [5.15, 0.25, 6], [8.4, 0.1, 4]], 0.6, 0.11, 0);
      else if (s.k === 'string') {
        const src = c.createBufferSource();
        src.buffer = karplus(c, f);
        mark(f, t);
        const g = c.createGain();
        g.gain.value = 0.35;
        src.connect(g).connect(this.chain(st, s, t, 5));
        src.start(t);
      } else if (s.k === 'breath') {
        const src = c.createBufferSource();
        src.buffer = noiseBuf(c, 'rain');
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 45;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(2.2, t + 3);
        g.gain.linearRampToValueAtTime(0, t + 8.5);
        src.connect(bp).connect(g).connect(this.chain(st, s, t, 10));
        src.start(t, rnd(0, 3));
        src.stop(t + 9);
      } else if (s.k === 'piano') {
        const o = this.chain(st, s, t, 12), pp = env.notes(48, 90);
        const k = Math.max(0, pp.indexOf(m));
        const n = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < n; j++) partials(c, o, mtof(pp[clamp(k - j, 0, pp.length - 1)]), t + j * rnd(0.7, 1.4), PIANO, 0.008, 0.12, 0);
      } else if (s.k === 'drop') {
        const o = this.chain(st, s, t, 3);
        const n = 3 + Math.floor(Math.random() * 5);
        for (let j = 0; j < n; j++) partials(c, o, mtof(pick(env.notes(72, 100))), t + j * rnd(0.08, 0.35), [[1, 1, 0.6], [3.1, 0.2, 0.2]], 0.003, 0.07, 0);
      }
    },
    step(st, P, env, t0, t1) {
      this.wind(st, P, env, t0);
      (P.seeds || []).forEach((s, i) => {
        const def = SEEDS[s.k] || SEEDS.bell;
        const key = `${i}:${s.k}`;
        let next = st.seedNext.get(key);
        if (!next) next = t0 + rnd(0.2, 3) + i * 0.4;
        while (next < t1) {
          this.play(st, { ...s, x: clamp(+s.x || 0, 0, 1), y: clamp(+s.y || 0.5, 0.05, 1) }, env, Math.max(t0, next), i);
          next += (def.mean / clamp(+s.s || 1, 0.3, 3)) * rnd(1 - env.rand * 0.6, 1 + env.rand * 0.8);
        }
        st.seedNext.set(key, next);
      });
    },
  };

  /* ================================================================== */
  /* Module Fresque                                                      */
  /* ================================================================== */
  const TAPE = 7.2;
  const LAYER_GAIN = { tape: 0.4, spec: 0.8, bell: 1, piano: 1, low: 0.6 };
  const fresque = {
    start(st) {
      const c = st.ctx;
      st.lg = {};
      LAYERS.forEach((L) => {
        const g = c.createGain();
        g.gain.value = 0;
        g.connect(st.out);
        st.lg[L.id] = g;
      });
      st.hiss = c.createGain();
      st.hiss.gain.value = 0;
      const hs = c.createBufferSource();
      hs.buffer = noiseBuf(c, 'noise');
      hs.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 5000;
      hp.Q.value = 0.5;
      hs.connect(hp).connect(st.hiss).connect(st.lg.tape);
      hs.start();
      st.spec = [];
      for (let i = 0; i < 12; i++) {
        const o = c.createOscillator();
        o.type = i % 3 ? 'sine' : 'triangle';
        const g = c.createGain();
        g.gain.value = 0;
        const p = c.createStereoPanner();
        p.pan.value = rnd(-0.9, 0.9);
        o.connect(g).connect(p).connect(st.lg.spec);
        o.start();
        st.spec.push({ o, g, m: 0, next: 0 });
      }
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o2.type = 'triangle';
      const g2 = c.createGain();
      g2.gain.value = 0.25;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      const g = c.createGain();
      g.gain.value = 0.35;
      o1.connect(g);
      o2.connect(g2).connect(lp).connect(g);
      g.connect(st.lg.low);
      o1.start();
      o2.start();
      st.low = { o1, o2, m: 0 };
      st.stoppers.push((at) => [hs, o1, o2, ...st.spec.map((x) => x.o)].forEach((o) => o.stop(at)));
      st.tape = { cur: null, key: '', gen: 0, next: 0 };
      st.nextBell = 0;
      st.nextPiano = 0;
    },
    renderTape(env) {
      const sr = 24000, n = Math.floor(sr * TAPE);
      const parts = [];
      env.notes(50, 79).slice(0, 6).forEach((m, k) => {
        for (let h = 1; h <= 3; h++) parts.push({ f: mtof(m) * h, a: 0.12 / Math.pow(h, 1.5), start: k * 0.35 });
      });
      const d = additive(n, sr, parts, (t, s) => clamp((t - s) / 1.6, 0, 1) * Math.min(1, (TAPE - t) / 0.4));
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp += 0.35 * (d[i] - lp);
        d[i] = lp;
      }
      return normalize(d, 0.7);
    },
    wear(d, w) {
      if (w <= 0) return;
      const sr = 24000, a = 1 - w * 0.12;
      let lp = d[0];
      for (let i = 0; i < d.length; i++) {
        lp = a * d[i] + (1 - a) * lp;
        d[i] = lp;
      }
      const holes = Math.round(w * 3 * Math.random() + w);
      for (let h = 0; h < holes; h++) {
        const len = Math.floor(rnd(0.03, 0.35) * sr), p = Math.floor(Math.random() * (d.length - len)), dep = rnd(0.2, 0.7);
        for (let j = 0; j < len; j++) d[p + j] *= 1 - dep * Math.sin((Math.PI * j) / len);
      }
      for (let i = 0; i < d.length; i++) d[i] += (Math.random() - 0.5) * 0.004 * w;
    },
    step(st, P, env, t0, t1) {
      const c = st.ctx, lv = (id) => curveAt(P.curves[id], env.frac);
      LAYERS.forEach((L) => st.lg[L.id].gain.setTargetAtTime(lv(L.id) * LAYER_GAIN[L.id], t0, 0.4));
      st.hiss.gain.setTargetAtTime(P.hiss * 0.05, t0, 0.3);
      // bande : une boucle de 7 s qui s'use à chaque tour ; bande neuve quand l'harmonie change
      const T = st.tape;
      if (lv('tape') > 0.01) {
        if (env.key !== T.key || !T.cur) {
          T.cur = this.renderTape(env);
          T.key = env.key;
          T.gen = 0;
        }
        if (!T.next || T.next < t0 - 1) T.next = t0;
        if (T.next < t1 + 0.3) {
          const b = c.createBuffer(1, T.cur.length, 24000);
          b.copyToChannel(T.cur, 0);
          const s = c.createBufferSource();
          s.buffer = b;
          const wo = c.createOscillator();
          wo.frequency.value = rnd(0.3, 0.6);
          const wg = c.createGain();
          wg.gain.value = P.wow * 0.012;
          wo.connect(wg).connect(s.playbackRate);
          const g = c.createGain(), t = Math.max(t0, T.next);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(1, t + 0.25);
          g.gain.setValueAtTime(1, t + TAPE - 0.3);
          g.gain.linearRampToValueAtTime(0, t + TAPE);
          s.connect(g).connect(st.lg.tape);
          s.start(t);
          s.stop(t + TAPE + 0.1);
          wo.start(t);
          wo.stop(t + TAPE + 0.1);
          T.next = t + TAPE - 0.3;
          T.gen++;
          this.wear(T.cur, P.wear);
        }
      }
      // nappe spectrale : 12 notes pures qui apparaissent et disparaissent
      const ns = env.notes(48, 91);
      st.spec.forEach((s, i) => {
        const m = ns[i % ns.length] + (i >= ns.length ? 12 : 0);
        if (m !== s.m) {
          s.o.frequency.setTargetAtTime(mtof(m), t0, s.m ? P.glide / 3 : 0.005);
          s.m = m;
        }
        if (t0 > s.next) {
          s.g.gain.setTargetAtTime(Math.random() < 0.55 ? rnd(0.01, 0.05) : 0.002, t0, rnd(1.5, 5) / (0.3 + P.move));
          s.next = t0 + rnd(2, 9) / (0.3 + P.move);
        }
      });
      // grave : la fondamentale de l'accord
      const r = 36 + env.root - (env.root > 6 ? 12 : 0);
      if (r !== st.low.m) {
        st.low.o1.frequency.setTargetAtTime(mtof(r), t0, st.low.m ? P.glide / 3 : 0.005);
        st.low.o2.frequency.setTargetAtTime(mtof(r + 12), t0, st.low.m ? P.glide / 3 : 0.005);
        st.low.m = r;
      }
      // cloches et piano : plus la couche est présente, plus ils jouent
      const lb = lv('bell');
      if (!st.nextBell) st.nextBell = t0 + rnd(0.5, 3);
      while (st.nextBell < t1) {
        if (lb > 0.05) partials(c, st.lg.bell, mtof(pick(env.notes(72, 96))), Math.max(t0, st.nextBell), BELL, 0.01, 0.12);
        st.nextBell += rnd(1.5, 6) / Math.max(0.15, lb);
      }
      const lp = lv('piano');
      if (!st.nextPiano) st.nextPiano = t0 + rnd(1, 5);
      while (st.nextPiano < t1) {
        if (lp > 0.05) {
          const pl = env.notes(55, 84);
          let k = Math.floor(Math.random() * pl.length), t = Math.max(t0, st.nextPiano);
          const n = 2 + Math.floor(Math.random() * 4);
          for (let j = 0; j < n; j++) {
            partials(c, st.lg.piano, mtof(pl[clamp(k, 0, pl.length - 1)]), t, PIANO, 0.008, 0.13);
            k += pick([-1, -1, -2, 1]);
            t += rnd(0.6, 1.5);
          }
        }
        st.nextPiano += rnd(6, 16) / Math.max(0.2, lp);
      }
    },
  };

  const ENGINES = { jardin, paysage, fresque };

  /* ================================================================== */
  /* Moteur                                                              */
  /* ================================================================== */
  const states = new Map(); // track.id -> état
  function create(ctx, track, mod, dest, t) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.connect(dest);
    const st = { ctx, mod, out, dest, t0: t, stoppers: [], lastNotes: [], lastSeed: new Map(), marks: [], pos: 0, id: track.id };
    ENGINES[mod].start(st);
    return st;
  }
  function kill(st, at) {
    const t = at != null ? at : st.ctx.currentTime;
    try {
      st.out.gain.cancelScheduledValues(t);
      st.out.gain.setTargetAtTime(0, t, 0.05);
      st.stoppers.forEach((f) => {
        try {
          f(t + 0.5);
        } catch (e) {
          /* déjà arrêté */
        }
      });
      setTimeout(() => st.out.disconnect(), 1500);
    } catch (e) {
      /* contexte fermé */
    }
  }
  /**
   * Un pas de la lecture : c = { ctx, project, track, tick, time, sd, dest, song }.
   * Programme ce qui tombe entre time et time + sd.
   */
  function step(c) {
    const A = settings(c.track);
    let st = states.get(c.track.id);
    if (st && (st.ctx !== c.ctx || st.mod !== A.mod || st.dest !== c.dest)) {
      kill(st);
      st = null;
    }
    if (!st) states.set(c.track.id, (st = create(c.ctx, c.track, A.mod, c.dest, c.time)));
    const H = harmonyAt(c.project, c.tick);
    const pcs = A.follow ? H.pcs : H.scale;
    const frac = songFrac(c.project, c.song, c.tick);
    const env = { pcs, root: H.root, key: (A.follow ? 'c' : 's') + H.key, notes: (lo, hi) => pool(pcs, lo, hi), rand: A.rands ? clamp(curveAt(A.rands, frac), 0, 1) : A.rand, frac };
    st.out.gain.setTargetAtTime(curveAt(A.presence, frac) * GAIN[A.mod], c.time, 0.5);
    st.frac = frac;
    st.env = env;
    st.pos = (c.tick % SS.totalSteps(c.project)) / SS.totalSteps(c.project);
    cur = st;
    try {
      ENGINES[A.mod].step(st, A.p, env, c.time, c.time + c.sd);
    } catch (e) {
      console.warn('Ambient', e);
    }
    cur = null;
  }
  /** Arrêt de la lecture (js/audio.js silenceAll) : tout s'éteint en quelques dizaines de ms. */
  function stopAll() {
    states.forEach((st) => kill(st));
    states.clear();
  }
  function remove(id) {
    const st = states.get(id);
    if (st) kill(st);
    states.delete(id);
  }
  /** Note jouée à la main (bouton Écouter, clavier) : une cloche douce. */
  function note(ctx, track, midi, time, dur, vel, out) {
    partials(ctx, out, mtof(midi), time, BELL, 0.01, 0.2 * vel, 0.3);
  }
  /** Notes jouées récemment par la piste : [{ m (midi, décimal), t (heure du contexte), x (place dans la scène 0..1) }]. */
  function marks(id) {
    const st = states.get(id);
    return st ? { list: st.marks, now: st.ctx.currentTime } : null;
  }
  /** Ce que la fenêtre de réglages affiche pendant la lecture. */
  function live(id) {
    const st = states.get(id);
    if (!st) return null;
    return { frac: st.frac, gHead: st.gHead, grains: st.live, lastNotes: st.lastNotes, loopNext: st.loopNext, lastSeed: st.lastSeed, tapeGen: st.tape ? st.tape.gen : 0, now: st.ctx.currentTime, t0: st.t0, env: st.env };
  }

  /** Sons utilisés par une piste (pour les dessiner) : { grain, own } (Jardin). */
  function grainBuffer(ctx, track) {
    const A = settings(track);
    const own = fileBuf(ctx, A.p.grainFile);
    return { buf: own || pianoBuf(ctx), own: !!own };
  }

  return { grainBuffer, PN, sceneSpan, marks, MODULES, LAYERS, SEEDS, settings, curveAt, pool, songFrac, harmonyAt, shape, step, stopAll, remove, note, prepare, importFile, loadFile, live, moduleOf };
})();
