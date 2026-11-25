/*
 * Lecture d'un projet Ableton Live (.als), au-dessus de js/midi-file.js et js/midi.js.
 *
 *   await SS.ableton.unpack(bytes)  -> texte XML (un .als est un XML compressé en gzip ; DecompressionStream du navigateur)
 *   SS.ableton.toMidi(xml)          -> { bytes (fichier MIDI type 1), cuts: [mesures], info: { version, tempo, tracks, ignored, warnings } }
 *   await SS.ableton.fromZip(bytes)  -> { als: octets du .als, samples: Map(nom de fichier -> lire()) } (dossier de projet compressé)
 *
 * Le projet devient un fichier MIDI que l'import habituel (SS.midi.importFile) range en scènes : une piste MIDI par piste
 * Ableton (nom, notes des clips de l'Arrangement avec leur boucle, transposition « Pitch »), programme General MIDI choisi
 * d'après le nom (les sons des plugins ne se lisent pas), batterie (Drum Rack) sur le canal 10 avec la note GM de son nom,
 * volume et panoramique de la console, automations de volume (CC 7), de cutoff (CC 74) et de résonance (CC 71).
 * `cuts` : mesures où les pistes qui jouent changent (une piste entre ou sort) ; l'import y commence une nouvelle scène.
 * Ignorés (listés dans info) : clips audio, vue Session, effets, envois, autres automations.
 */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const PPQ = 480;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; // le canal 10 (9) est celui de la batterie

  /* ---------------- XML minimal (balises et attributs ; le texte est ignoré : Ableton met tout en attributs) ---------------- */
  function parseXml(text) {
    const rootEl = { tag: '#root', attrs: {}, kids: [], parent: null };
    let cur = rootEl;
    const re = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g;
    const attrRe = /([\w.:-]+)="([^"]*)"/g;
    const ent = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e] || String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))));
    let m;
    while ((m = re.exec(text))) {
      if (!m[2]) continue;
      if (m[1]) {
        if (cur.parent) cur = cur.parent;
        continue;
      }
      const attrs = {};
      let a;
      attrRe.lastIndex = 0;
      while ((a = attrRe.exec(m[3]))) attrs[a[1]] = ent(a[2]);
      const el = { tag: m[2], attrs, kids: [], parent: cur };
      cur.kids.push(el);
      if (!m[4]) cur = el;
    }
    return rootEl;
  }
  const kid = (el, tag) => (el ? el.kids.find((k) => k.tag === tag) || null : null);
  const at = (el, path) => path.split('/').reduce((e, t) => kid(e, t), el);
  const val = (el, path) => {
    const e = path ? at(el, path) : el;
    return e ? e.attrs.Value : undefined;
  };
  const num = (el, path, def = 0) => {
    const v = parseFloat(val(el, path));
    return Number.isFinite(v) ? v : def;
  };
  /** Tous les descendants qui portent ce nom (sans descendre dans un élément trouvé). */
  function all(el, tag, out = []) {
    for (const k of el.kids) {
      if (k.tag === tag) out.push(k);
      else all(k, tag, out);
    }
    return out;
  }
  const hasAncestor = (el, tag) => {
    for (let e = el.parent; e; e = e.parent) if (e.tag === tag) return true;
    return false;
  };

  /* ---------------- gzip ---------------- */
  async function unpack(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8[0] === 0x3c) return new TextDecoder('utf-8').decode(u8); // déjà décompressé (« <?xml »)
    if (u8[0] !== 0x1f || u8[1] !== 0x8b) throw new Error('Ce fichier n’est pas un projet Ableton Live (.als).');
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser un projet Ableton : essaie avec Chrome, Edge, Firefox ou Safari récent.');
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new TextDecoder('utf-8').decode(await new Response(stream).arrayBuffer());
  }

  /* ---------------- Sons : programme General MIDI d'après le nom de la piste ---------------- */
  const PROGRAMS = [
    [/sub|bass|basse|808/i, 38], // Synth Bass 1
    [/pad|nappe|string|cordes|drone|ethereal|atmo|ambi/i, 89], // Warm Pad
    [/wind|flute|flûte|pipe/i, 73],
    [/brass|cuivre|horn|trumpet|trompette/i, 61],
    [/sax/i, 65],
    [/organ|orgue/i, 16],
    [/e\.?piano|rhodes|wurli/i, 4],
    [/piano/i, 0],
    [/bell|cloche|glock|keys|mallet|high/i, 98], // Crystal
    [/guitar|guitare|gtr/i, 27],
    [/choir|voice|voix|vox/i, 52],
    [/arp|pluck|seq/i, 84],
    [/lead|solo|melod|thème|theme/i, 81], // Saw Lead
  ];
  const programFor = (name) => (PROGRAMS.find(([re]) => re.test(name)) || [null, 81])[1];
  /** Note GM d'une piste de batterie d'après son nom (une piste par son, cas courant avec un Drum Rack à un pad). */
  const DRUMS = [
    [/kick|bd|bass ?drum|grosse/i, 36],
    [/snare|sd|caisse/i, 38],
    [/clap|cp/i, 39],
    [/rim/i, 37],
    [/open|oh/i, 46],
    [/hat|hh|charley|charleston/i, 42],
    [/crash/i, 49],
    [/ride/i, 51],
    [/tom/i, 45],
    [/shaker|maraca/i, 70],
    [/tamb/i, 54],
    [/cow/i, 56],
    [/conga/i, 63],
    [/bongo/i, 60],
  ];
  const drumFor = (name) => (DRUMS.find(([re]) => re.test(name)) || [null, null])[1];

  /* ---------------- Automations ---------------- */
  /** Courbe d'une enveloppe Ableton : t (en temps) -> valeur, linéaire entre deux points, palier quand deux points ont le même temps. */
  function envelope(evs) {
    const pts = evs.map((e) => ({ t: Math.max(-1, parseFloat(e.attrs.Time)), v: parseFloat(e.attrs.Value) })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
    pts.sort((a, b) => a.t - b.t);
    const f = (t) => {
      if (!pts.length) return null;
      if (t <= pts[0].t) return pts[0].v;
      for (let i = pts.length - 1; i >= 0; i--) {
        if (pts[i].t <= t) {
          const n = pts[i + 1];
          if (!n || n.t === pts[i].t) return pts[i].v;
          return pts[i].v + ((pts[i + 1].v - pts[i].v) * (t - pts[i].t)) / (n.t - pts[i].t);
        }
      }
      return pts[0].v;
    };
    f.points = pts;
    return f;
  }

  /** Paramètre visé par une enveloppe : { kind: 'vol' | 'cut' | 'res' | null, label, mixer } */
  function classify(param) {
    const name = val(param, 'ParameterName') || val(param.parent, 'ParameterName') || param.tag;
    const owner = param.tag === 'ParameterValue' ? param.parent : param;
    const mixer = hasAncestor(owner, 'Mixer');
    const label = owner.tag === 'PluginFloatParameter' ? name : owner.tag;
    const n = String(owner.tag === 'PluginFloatParameter' ? name : owner.tag);
    if (mixer && owner.tag === 'Volume') return { kind: 'vol', label: 'Volume', mixer: true };
    if (mixer) return { kind: null, label: owner.tag === 'Pan' ? 'Panoramique' : owner.tag === 'TrackSendHolder' || owner.tag === 'Send' ? 'Envoi' : owner.tag };
    if (/mod|env|eg\b|eg \d|lfo|amount/i.test(n)) return { kind: null, label };
    if (/cutoff|^freq|frequency/i.test(n)) return { kind: 'cut', label };
    if (/reso|(^|\s)q$/i.test(n)) return { kind: 'res', label };
    if (/^(gain|volume|level|amp)$/i.test(n) && !/pre/i.test(n)) return { kind: 'vol', label };
    return { kind: null, label };
  }

  /* ---------------- Conversion ---------------- */
  function toMidi(xml) {
    const doc = typeof xml === 'string' ? parseXml(xml) : xml;
    const top = kid(doc, 'Ableton');
    const set = kid(top, 'LiveSet');
    if (!set) throw new Error('Ce fichier n’est pas un projet Ableton Live (.als).');
    const version = (top.attrs.Creator || 'Ableton Live').replace(/\s+\(.*\)$/, '');
    const warnings = [];
    const ignored = [];
    const master = kid(set, 'MasterTrack') || kid(set, 'MainTrack');
    const tempoEl = at(master, 'DeviceChain/Mixer/Tempo');
    const tempo = clamp(num(tempoEl, 'Manual', 120), 20, 999);

    // automations : AutomationTarget Id -> paramètre
    const targets = new Map();
    const indexTargets = (el) => {
      for (const k of el.kids) {
        if (k.tag === 'AutomationTarget' && k.attrs.Id) targets.set(k.attrs.Id, el);
        indexTargets(k);
      }
    };
    indexTargets(set);
    const envelopesOf = (el) =>
      all(at(el, 'AutomationEnvelopes/Envelopes') || { kids: [] }, 'AutomationEnvelope').map((e) => ({
        target: targets.get(val(e, 'EnvelopeTarget/PointeeId')),
        f: envelope(all(e, 'FloatEvent')),
      }));
    if (tempoEl) {
      const tempoEnv = envelopesOf(master).find((e) => e.target === tempoEl);
      if (tempoEnv && new Set(tempoEnv.f.points.map((p) => Math.round(p.v * 10))).size > 1) warnings.push('Le tempo change dans le projet : le morceau est importé à tempo constant.');
    }

    const tracksEl = kid(set, 'Tracks');
    const all1 = tracksEl ? tracksEl.kids : [];
    const audio = all1.filter((t) => t.tag === 'AudioTrack').length;
    if (audio) ignored.push(`${audio} piste(s) audio (sons enregistrés) : non importées.`);
    const returns = all1.filter((t) => t.tag === 'ReturnTrack').map((t) => val(t, 'Name/EffectiveName'));
    if (returns.length) ignored.push(`Pistes de retour (${returns.join(', ')}) et envois vers elles : ignorés.`);
    const groups = all1.filter((t) => t.tag === 'GroupTrack').map((t) => val(t, 'Name/EffectiveName'));
    if (groups.length) ignored.push(`Groupe(s) ${groups.map((g) => `« ${g} »`).join(', ')} : leurs pistes sont gardées, le groupe et ses effets sont ignorés.`);
    const plugins = new Set();
    const notTaken = {}; // piste -> automations non reprises

    let timeSig = null;
    let end = 0;
    const midiTracks = [];
    const used = new Set();
    let ch = 0;
    for (const t of all1.filter((x) => x.tag === 'MidiTrack')) {
      let name = val(t, 'Name/EffectiveName') || val(t, 'Name/UserName') || 'Piste';
      while (used.has(name)) name += ' ·';
      used.add(name);
      const chain = at(t, 'DeviceChain');
      all(chain, 'PluginDesc').forEach((d) => {
        const n = val(d, 'VstPluginInfo/PlugName') || val(d, 'Vst3PluginInfo/Name') || val(d, 'AuPluginInfo/Name');
        if (n) plugins.add(n);
      });
      const drum = all(chain, 'DrumGroupDevice').length > 0;
      // échantillon du Drum Rack (le premier pad) : nom du fichier, retrouvé ensuite dans le dossier du projet (.zip)
      const fileRef = drum ? all(chain, 'SampleRef').map((r) => kid(r, 'FileRef')).find(Boolean) : null;
      const samplePath = fileRef ? val(fileRef, 'Name') || val(fileRef, 'RelativePath') || val(fileRef, 'Path') || '' : '';
      const sample = samplePath.split(/[\\/]/).pop() || null;
      const pitch = all(chain, 'MidiPitcher').reduce((a, p) => a + num(p, 'Pitch/Manual', 0), 0);
      const clips = all(at(t, 'DeviceChain/MainSequencer/Sample/ArrangerAutomation/Events') || at(t, 'DeviceChain/MainSequencer/ClipTimeable/ArrangerAutomation/Events') || { kids: [] }, 'MidiClip');
      const notes = [];
      const spans = [];
      for (const c of clips) {
        if (val(c, 'Disabled') === 'true') continue;
        const start = num(c, 'CurrentStart');
        const stop = num(c, 'CurrentEnd');
        const len = stop - start;
        if (len <= 0) continue;
        spans.push([start, stop]);
        end = Math.max(end, stop);
        if (!timeSig) {
          const ts = at(c, 'TimeSignature/TimeSignatures/RemoteableTimeSignature');
          if (ts) timeSig = [num(ts, 'Numerator', 4), num(ts, 'Denominator', 4)];
        }
        const loop = kid(c, 'Loop');
        const ls = num(loop, 'LoopStart');
        const le = num(loop, 'LoopEnd', ls + len);
        const from = ls + num(loop, 'StartRelative');
        const looping = val(loop, 'LoopOn') === 'true' && le > ls;
        const period = le - ls;
        for (const kt of all(c, 'KeyTrack')) {
          const key = num(kt, 'MidiKey');
          for (const n of all(kt, 'MidiNoteEvent')) {
            if (n.attrs.IsEnabled === 'false') continue;
            const time = parseFloat(n.attrs.Time);
            const dur = parseFloat(n.attrs.Duration) || 0.25;
            const vel = clamp(Math.round(parseFloat(n.attrs.Velocity) || 100), 1, 127);
            // positions dans le clip : une fois (sans boucle), ou à chaque tour de boucle
            const firsts = [];
            if (!looping) firsts.push(time - from);
            else if (time >= ls && time < le) {
              let x = time - from;
              if (x < 0) x += Math.ceil(-x / period) * period;
              for (; x < len; x += period) firsts.push(x);
            }
            for (const x of firsts) {
              if (x < 0 || x >= len) continue;
              const d = Math.min(dur, len - x, looping ? le - time : Infinity);
              notes.push({ t: start + x, d: Math.max(1 / 64, d), key: key + pitch, vel });
            }
          }
        }
      }
      const mixer = at(t, 'DeviceChain/Mixer');
      const gain = num(mixer, 'Volume/Manual', 1);
      const pan = num(mixer, 'Pan/Manual', 0);
      const envs = envelopesOf(t).filter((e) => e.target);
      const autos = { vol: [], cut: [], res: [] };
      const autoLabels = [];
      for (const e of envs) {
        const c = classify(e.target);
        const moving = new Set(e.f.points.map((p) => Math.round(p.v * 1000))).size > 1;
        if (!moving) continue;
        if (c.kind) {
          autos[c.kind].push({ ...c, f: e.f });
          autoLabels.push({ label: c.label, kind: c.kind });
        } else (notTaken[name] = notTaken[name] || new Set()).add(c.label);
      }
      if (val(mixer, 'Speaker/Manual') === 'false') warnings.push(`« ${name} » est coupée dans Ableton : elle est importée quand même.`);
      if (!notes.length) continue;
      if (pitch) warnings.push(`« ${name} » : transposition de ${pitch > 0 ? '+' : ''}${pitch} demi-tons appliquée aux notes.`);
      midiTracks.push({ name, drum, notes, spans, gain, pan, autos, autoLabels, clips: clips.length, sample });
    }
    const nt = Object.entries(notTaken).map(([n, set]) => `${n} (${[...set].join(', ')})`);
    if (nt.length) ignored.push(`Automations non reprises : ${nt.join(' ; ')}.`);
    if (!midiTracks.length) throw new Error('Ce projet n’a aucune piste MIDI avec des notes dans l’Arrangement.');
    if (plugins.size) warnings.push(`Plugins ${[...plugins].join(', ')} : leurs sons ne se lisent pas, StepSeq choisit un son proche d’après le nom de chaque piste (à changer ensuite).`);
    const sig = timeSig || [4, 4];
    const beatsPerBar = (sig[0] * 4) / sig[1];

    // pistes MIDI
    const T = (beats) => Math.round(beats * PPQ);
    const tracks = [[SS.midiFile.meta.tempo(0, tempo), SS.midiFile.meta.timeSig(0, sig[0], sig[1])]];
    const info = [];
    for (const tr of midiTracks) {
      const keys = new Set(tr.notes.map((n) => n.key));
      const gmNote = tr.drum && keys.size <= 2 ? drumFor(tr.name) : null;
      const isDrum = tr.drum && (gmNote != null || keys.size > 2);
      const chan = isDrum ? 9 : CHANNELS[ch++ % CHANNELS.length];
      const evs = [SS.midiFile.meta.name(0, tr.name)];
      const prog = isDrum ? null : programFor(tr.name);
      if (prog != null) evs.push({ tick: 0, bytes: [0xc0 | chan, prog] });
      evs.push({ tick: 0, bytes: [0xb0 | chan, 10, clamp(Math.round(64 + tr.pan * 63), 0, 127)] });
      // volume : console (gain linéaire, 1 = 0 dB ; CC 7 suit une loi en carré) × automations de volume (plugins, Utility)
      const mixVol = tr.autos.vol.find((a) => a.mixer);
      const others = tr.autos.vol.filter((a) => !a.mixer);
      const volAt = (b) => {
        let g = mixVol ? mixVol.f(b) : tr.gain;
        let v = Math.sqrt(clamp(g, 0, 1));
        for (const o of others) v *= clamp(o.f(b) > 1.5 ? Math.pow(10, o.f(b) / 20) : o.f(b), 0, 1);
        return clamp(Math.round(v * 127), 0, 127);
      };
      const lastBeat = Math.ceil(end);
      let lastVol = -1;
      for (let b = 0; b <= lastBeat; b++) {
        const v = volAt(b);
        if (v !== lastVol) evs.push({ tick: T(b), bytes: [0xb0 | chan, 7, v] });
        lastVol = v;
        if (!mixVol && !others.length) break;
      }
      // cutoff et résonance : relatifs à la valeur la plus jouée (= le réglage du son dans StepSeq)
      for (const [k, cc] of [['cut', 74], ['res', 71]]) {
        const a = tr.autos[k][0];
        if (!a || isDrum) continue;
        const samples = [];
        for (let b = 0; b <= lastBeat; b++) samples.push(a.f(b + 0.5));
        const counts = new Map();
        samples.forEach((v) => counts.set(Math.round(v * 100), (counts.get(Math.round(v * 100)) || 0) + 1));
        const rest = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0] / 100;
        const span = Math.max(...samples) > 1.5 ? 115 : 1; // Auto Filter : 20..135 ; plugins : 0..1
        let last = -1;
        samples.forEach((v, b) => {
          const d = (v - rest) / span;
          const bv = k === 'cut' ? clamp(d * 10, -4, 4) : clamp(1 + d * 4, 0, 3);
          const c = SS.beatAuto ? SS.beatAuto.ccValue(k, bv) : 64;
          if (c !== last) evs.push({ tick: T(b), bytes: [0xb0 | chan, cc, c] });
          last = c;
        });
      }
      for (const n of tr.notes) {
        const key = isDrum && gmNote != null ? gmNote : clamp(n.key, 0, 127);
        evs.push({ tick: T(n.t), bytes: [0x90 | chan, key, n.vel] }, { tick: T(n.t + n.d), bytes: [0x80 | chan, key, 0] });
      }
      tracks.push(evs);
      info.push({ name: tr.name, drum: isDrum, gmNote: isDrum ? gmNote : null, sample: isDrum ? tr.sample : null, notes: tr.notes.length, clips: tr.clips, automations: tr.autoLabels });
    }

    // scènes « d'après les clips » : une mesure où les pistes qui jouent changent
    const bars = Math.ceil(end / beatsPerBar);
    const activeAt = (bar) =>
      midiTracks
        .map((tr, i) => (tr.spans.some(([s, e]) => s < (bar + 1) * beatsPerBar && e > bar * beatsPerBar) ? i : -1))
        .filter((i) => i >= 0)
        .join(',');
    const cuts = [];
    let prev = null;
    for (let b = 0; b < bars; b++) {
      const a = activeAt(b);
      if (prev !== null && a !== prev) cuts.push(b);
      prev = a;
    }
    // repères (locators) d'Ableton : ils deviennent des marqueurs, donc des débuts et des noms de scènes
    const locators = all(at(set, 'Locators') || { kids: [] }, 'Locator').map((l) => ({ t: num(l, 'Time'), name: val(l, 'Name') || '' }));
    locators.forEach((l) => tracks[0].push(SS.midiFile.meta.marker(T(l.t), l.name || 'Repère')));

    return {
      bytes: SS.midiFile.write({ ppq: PPQ, tracks }),
      cuts,
      info: { version, tempo, timeSig: sig, bars, tracks: info, ignored, warnings, locators: locators.length },
    };
  }

  /** Dossier de projet compressé en .zip : le .als principal (pas une copie de « Backup ») et les fichiers audio. */
  async function fromZip(bytes) {
    const z = SS.scoreRead.unzip(bytes);
    const als = z.names.filter((n) => /\.als$/i.test(n) && !/(^|\/)(Backup|__MACOSX)\//i.test(n) && !/(^|\/)\._/.test(n)).sort((a, b) => a.split('/').length - b.split('/').length);
    if (!als.length) throw new Error('Ce zip ne contient pas de projet Ableton Live (.als).');
    const samples = new Map();
    z.names.filter((n) => /\.(wav|aiff?|mp3|flac|ogg)$/i.test(n) && !/(^|\/)(__MACOSX\/|\._)/.test(n)).forEach((n) => samples.set(n.split('/').pop(), () => z.read(n)));
    return { name: als[0].split('/').pop(), als: await z.read(als[0]), samples };
  }

  SS.ableton = { unpack, toMidi, fromZip, parseXml, programFor, drumFor };
})(typeof window !== 'undefined' ? window : globalThis);
