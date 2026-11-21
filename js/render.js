/*
 * Export audio : rendu hors temps réel de la chanson, master et stems, en WAV (menu de l'icône › Exporter l'audio…).
 *
 * Le rendu se fait dans un cadre invisible (render.html, js/render-boot.js, js/render-host.js) qui ne charge que le
 * moteur audio : la chanson y est jouée exactement comme par le bouton Lecture (mêmes notes, même mixage, même
 * mastering), mais calculée plus vite que le temps réel, sans décrochage possible, et sans rien enregistrer.
 *
 *   master : la chanson telle qu'on l'entend (traitement du Master et mastering compris) ;
 *   stems  : un fichier par musicien (toute la batterie ensemble, le percussionniste à part) ou par piste, avec ses
 *            envois d'effets (sa part de reverb et d'écho), sans le traitement du Master : posés ensemble dans un
 *            logiciel de musique, ils redonnent le mix avant mastering. Tous ont la même longueur et le même départ ;
 *            l'humanisation est tirée de la même suite aléatoire à chaque rendu (js/render-boot.js), les autres pistes
 *            jouent mais à volume nul (le sidechain du kick agit toujours). Le master est recalé sur les stems (le
 *            limiteur à anticipation du mastering le retarde de quelques millisecondes).
 *
 * Fonctions pures (testées par tests/render.test.js) : songPlan, stemGroups, prepare, measure, encodeWav, zip, crc32.
 */
window.SS = window.SS || {};
SS.render = (() => {
  const PREROLL = 0.08; // js/audio.js begin() : la première note part à currentTime + 0,08 s
  const TAIL = 8; // secondes rendues après la fin de l'arrangement (queues de reverb et d'écho)
  const SILENCE = Math.pow(10, -80 / 20); // en dessous de −80 dBFS, la queue est finie
  const FADE = 0.5; // fondu de sortie si la queue est encore audible à la fin du rendu (s)
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ================= Préparation ================= */

  /** Ce qui est joué : { song: [{ scene, repeat }], bars, seconds }. range : 'song' (arrangement) | 'scene' (scène en cours). */
  function songPlan(project, { range = 'song', loops = 1 } = {}) {
    const p = project;
    const spb = SS.stepsPerBar(p);
    const barsOf = (id) => {
      const sc = p.scenes.find((x) => x.id === id);
      return sc ? (sc.id === p.current ? p.bars : sc.bars) : 0;
    };
    let song;
    if (range === 'scene' || !p.song || !p.song.length) song = [{ scene: p.current, repeat: Math.max(1, Math.min(64, Math.round(loops) || 1)) }];
    else song = p.song.filter((b) => p.scenes.some((sc) => sc.id === b.scene)).map((b) => ({ scene: b.scene, repeat: b.repeat }));
    const bars = song.reduce((a, b) => a + barsOf(b.scene) * b.repeat, 0);
    return { song, bars, seconds: (bars * spb * 60) / p.tempo / 4 };
  }

  const audibleTracks = (p) => {
    const soloed = p.tracks.some((t) => t.solo);
    return p.tracks.filter((t) => !t.mute && (!soloed || t.solo));
  };

  const MUSICIANS = { drums: 'Batterie', perc: 'Percussions', bass: 'Basse', pad: 'Nappe', arp: 'Arpège', lead: 'Lead', keys: 'Clavier', guitar: 'Guitare', strings: 'Cordes', sax: 'Sax', vox: 'Voix', fx: 'Effets', chords: 'Accords' };

  /**
   * Stems : [{ id, name, tracks: [id] }]. by 'musician' : les pistes Band d'un même musicien ensemble (band.key
   * « drums:bd » → « drums ») ; les autres pistes, une par stem. by 'track' : une piste par stem. Seules les pistes
   * qu'on entend (Muet / Solo) donnent un stem.
   */
  /**
   * Stems par famille (musique de film : livraison au mixeur de la scène) : les pupitres de l'orchestre par famille
   * (Cordes avec la harpe, Bois, Cuivres), le thème, le piano et les percussions à part.
   */
  const FAMILY = { cordes: 'Cordes', 'cordes pincées': 'Cordes', bois: 'Bois', cuivres: 'Cuivres', 'synthé': 'Synthé' };
  const ROLE_FAMILY = { lead: 'Thème', keys: 'Piano', perc: 'Percussions', drums: 'Percussions' };
  function familyOf(key) {
    const [role, part] = key.split(':');
    if (role === 'orch') {
      const P = SS.orchestra && SS.orchestra.PART[part];
      return (P && FAMILY[P.fam]) || 'Orchestre';
    }
    return ROLE_FAMILY[role] || null;
  }
  function stemGroups(project, by = 'musician') {
    const out = [];
    const byId = new Map();
    for (const t of audibleTracks(project)) {
      const key = t.band && t.band.key ? String(t.band.key) : '';
      const role = key.split(':')[0];
      const fam = by === 'family' && role ? familyOf(key) : null;
      const gid = fam ? 'fam:' + fam : (by === 'musician' || by === 'family') && role ? 'band:' + role : 'track:' + t.id;
      let g = byId.get(gid);
      if (!g) {
        const name = fam || ((by === 'musician' || by === 'family') && role ? MUSICIANS[role] || (t.band && t.band.label) || t.name || role : t.name || 'Piste');
        g = { id: gid, name, tracks: [] };
        byId.set(gid, g);
        out.push(g);
      }
      g.tracks.push(t.id);
    }
    // noms en double (deux pistes « Lead ») : numérotés
    const seen = {};
    out.forEach((g) => (seen[g.name] = (seen[g.name] || 0) + 1));
    const idx = {};
    out.forEach((g) => {
      if (seen[g.name] > 1) g.name = `${g.name} ${(idx[g.name] = (idx[g.name] || 0) + 1)}`;
    });
    return out;
  }

  /** Début du son dans le rendu (s) : le pré-roll du moteur, moins les notes jouées en avance et l'humanisation. */
  function leadIn(project) {
    const sd = 60 / project.tempo / 4;
    let early = 0;
    const scan = (d) => d && Array.isArray(d.events) && d.events.forEach((ev) => Number.isFinite(ev.shift) && ev.shift < early && (early = ev.shift));
    project.tracks.forEach((t) => scan(t));
    project.scenes.forEach((sc) => Object.values(sc.data || {}).forEach(scan));
    const human = (project.groove && project.groove.human) || 0;
    return Math.max(0, PREROLL + early * sd - human * 0.015 - 0.002);
  }

  /**
   * Projet envoyé au cadre de rendu (texte JSON) et durée à rendre.
   * keep : pistes entendues (stem) ; les autres jouent à volume nul. neutralMaster : sans EQ, compresseur, limiteur,
   * effets ni mastering sur le Master (stems).
   */
  function prepare(project, { range = 'song', loops = 1, keep = null, neutralMaster = false } = {}) {
    const p = JSON.parse(SS.serialize(project, { wizard: false }));
    const plan = songPlan(project, { range, loops });
    p.song = plan.song;
    p.playMode = 'song';
    p.songLoop = false;
    delete p.wizard;
    if (keep) {
      const k = new Set(keep);
      p.tracks.forEach((t) => {
        if (!k.has(t.id)) t.volume = 0;
      });
    }
    if (neutralMaster) {
      const m = p.master || {};
      p.master = {
        ...m,
        mix: clone(SS.MIX_DEFAULTS),
        mastering: { ...(m.mastering || {}), on: false },
        effects: { ...(m.effects || {}), on: false },
      };
    }
    return { json: JSON.stringify(p), seconds: PREROLL + plan.seconds + TAIL, songSeconds: plan.seconds, lead: leadIn(project) };
  }

  /* ================= Mesure (EBU R128 / ITU-R BS.1770-4) ================= */

  /** Coefficients de la pondération K à la fréquence sr : [plateau aigu, passe-haut], chacun [b0, b1, b2, a1, a2]. */
  function kWeighting(sr) {
    let f0 = 1681.974450955533;
    const G = 3.999843853973347;
    let Q = 0.7071752369554196;
    let K = Math.tan((Math.PI * f0) / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const shelf = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
    f0 = 38.13547087602444;
    Q = 0.5003270373238773;
    K = Math.tan((Math.PI * f0) / sr);
    a0 = 1 + K / Q + K * K;
    const hp = [1 / a0, -2 / a0, 1 / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
    return [shelf, hp];
  }

  /** Énergie pondérée K par tranche de 100 ms, pour un canal. */
  function blockEnergy(x, sr, from, to) {
    const [s, h] = kWeighting(sr);
    const hop = Math.round(sr * 0.1);
    const n = Math.max(0, Math.floor((to - from) / hop));
    const out = new Float64Array(n);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    for (let b = 0; b < n; b++) {
      let acc = 0;
      const end = from + (b + 1) * hop;
      for (let i = from + b * hop; i < end; i++) {
        const v = x[i];
        const y = s[0] * v + s[1] * x1 + s[2] * x2 - s[3] * y1 - s[4] * y2;
        x2 = x1; x1 = v; y2 = y1; y1 = y;
        const z = h[0] * y + h[1] * z1 + h[2] * z2 - h[3] * w1 - h[4] * w2;
        z2 = z1; z1 = y; w2 = w1; w1 = z;
        acc += z * z;
      }
      out[b] = acc / hop;
    }
    return out;
  }
  const lufs = (e) => (e > 0 ? -0.691 + 10 * Math.log10(e) : -Infinity);

  /** Crête vraie approchée (sur-échantillonnage ×4, sinus cardinal fenêtré), en valeur linéaire. */
  function truePeak(x, from, to) {
    let sp = 0;
    for (let i = from; i < to; i++) {
      const a = Math.abs(x[i]);
      if (a > sp) sp = a;
    }
    if (sp === 0) return 0;
    const TAPS = 8; // de chaque côté
    const phases = [0.25, 0.5, 0.75].map((f) => {
      const k = [];
      for (let j = -TAPS + 1; j <= TAPS; j++) {
        const t = j - f; // distance entre l'échantillon i + j et le point i + f
        const sinc = Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
        const win = 0.5 + 0.5 * Math.cos((Math.PI * t) / TAPS); // fenêtre de Hann
        k.push(sinc * win);
      }
      return k;
    });
    let peak = sp;
    const gate = sp * 0.5; // une crête inter-échantillons ne dépasse la crête des échantillons qu'à côté d'un grand échantillon
    for (let i = Math.max(from, TAPS); i < Math.min(to, x.length - TAPS) - 1; i++) {
      if (Math.abs(x[i]) < gate && Math.abs(x[i + 1]) < gate) continue;
      for (const k of phases) {
        let v = 0;
        for (let j = 0; j < k.length; j++) v += k[j] * x[i - TAPS + 1 + j];
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
    return peak;
  }

  /**
   * Bilan d'un rendu stéréo : { integrated, shortMax, momentaryMax, lra (LUFS / LU), truePeak, samplePeak (dBTP / dBFS),
   * plr (dB), corr (−1..1), seconds }.
   */
  function measure(left, right, sr, from = 0, to = left.length) {
    const eL = blockEnergy(left, sr, from, to);
    const eR = blockEnergy(right, sr, from, to);
    const e = eL.map((v, i) => v + eR[i]);
    const win = (n) => {
      const out = [];
      for (let i = 0; i + n <= e.length; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += e[i + j];
        out.push(s / n);
      }
      return out;
    };
    const mom = win(4); // 400 ms
    const st = win(30); // 3 s
    const absGate = (arr) => arr.filter((v) => lufs(v) > -70);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const g1 = absGate(mom);
    let integrated = -Infinity;
    if (g1.length) {
      const rel = lufs(mean(g1)) - 10;
      const g2 = g1.filter((v) => lufs(v) > rel);
      if (g2.length) integrated = lufs(mean(g2));
    }
    let lra = null;
    const s1 = absGate(st);
    if (s1.length >= 10) {
      const rel = lufs(mean(s1)) - 20;
      const s2 = s1.filter((v) => lufs(v) > rel).map(lufs).sort((a, b) => a - b);
      if (s2.length >= 10) {
        const q = (p) => s2[Math.min(s2.length - 1, Math.round(p * (s2.length - 1)))];
        lra = q(0.95) - q(0.1);
      }
    }
    const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
    let sp = 0, ll = 0, rr = 0, lr = 0;
    for (let i = from; i < to; i++) {
      const a = left[i], b = right[i];
      if (Math.abs(a) > sp) sp = Math.abs(a);
      if (Math.abs(b) > sp) sp = Math.abs(b);
      ll += a * a;
      rr += b * b;
      lr += a * b;
    }
    const tp = Math.max(truePeak(left, from, to), truePeak(right, from, to));
    const max = (a) => (a.length ? lufs(Math.max(...a)) : -Infinity);
    return {
      integrated,
      shortMax: max(st),
      momentaryMax: max(mom),
      lra,
      truePeak: db(tp),
      samplePeak: db(sp),
      plr: Number.isFinite(integrated) && tp > 0 ? db(tp) - integrated : null,
      corr: ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : null,
      seconds: (to - from) / sr,
    };
  }

  /* ================= Bornes du fichier ================= */

  /** Dernier échantillon audible (au-dessus de −80 dBFS) ; −1 si silence. */
  function lastAudible(left, right, from = 0) {
    for (let i = left.length - 1; i >= from; i--) if (Math.abs(left[i]) > SILENCE || Math.abs(right[i]) > SILENCE) return i;
    return -1;
  }

  /**
   * Bornes communes { from, to, fade } (échantillons) d'après le rendu du master : on enlève le pré-roll du moteur et le
   * silence de fin ; si la queue dure jusqu'au bout du rendu, un fondu de FADE s le referme.
   */
  function bounds(left, right, sr, lead, songSeconds) {
    const from = Math.min(left.length - 1, Math.round(lead * sr));
    const songEnd = Math.min(left.length, Math.round((PREROLL + songSeconds) * sr));
    const last = lastAudible(left, right, from);
    let to = Math.max(songEnd, last + Math.round(0.1 * sr));
    let fade = 0;
    if (to >= left.length) {
      to = left.length;
      fade = Math.round(FADE * sr);
    }
    return { from, to, fade };
  }

  /**
   * Retard du master sur la somme des stems (échantillons, 0 à 40 ms) : intercorrélation des signaux mono sur la
   * seconde la plus forte du début du morceau.
   */
  function masterDelay(mL, mR, sL, sR, from, sr) {
    const maxLag = Math.round(0.04 * sr);
    const n = Math.round(sr * 1);
    const span = Math.min(mL.length - maxLag - n, from + Math.round(30 * sr));
    if (span <= from) return 0;
    // seconde la plus forte de la somme des stems (pas de 0,25 s)
    let best = from, bestE = -1;
    for (let s = from; s + n < span; s += Math.round(sr * 0.25)) {
      let e = 0;
      for (let i = s; i < s + n; i += 8) e += (sL[i] + sR[i]) * (sL[i] + sR[i]);
      if (e > bestE) {
        bestE = e;
        best = s;
      }
    }
    if (bestE <= 0) return 0;
    let lag = 0, top = -Infinity;
    for (let d = 0; d <= maxLag; d++) {
      let c = 0;
      for (let i = best; i < best + n; i += 2) c += (sL[i] + sR[i]) * (mL[i + d] + mR[i + d]);
      if (c > top) {
        top = c;
        lag = d;
      }
    }
    return lag;
  }

  /* ================= WAV ================= */

  /** Générateur pseudo-aléatoire reproductible (dither). */
  function rng(seed = 1) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Fichier WAV stéréo (Uint8Array) des échantillons [from, to[, avec fondu de sortie sur les `fade` derniers.
   * bits 16 ou 24 : PCM entier, dither triangulaire (TPDF) d'un pas de quantification ; 32 : flottant, sans dither.
   */
  function encodeWav(left, right, sr, bits = 24, { from = 0, to = left.length, fade = 0, seed = 1 } = {}) {
    const n = Math.max(0, to - from);
    const bps = bits === 32 ? 4 : bits === 16 ? 2 : 3;
    const dataLen = n * 2 * bps;
    const buf = new ArrayBuffer(44 + dataLen);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, 36 + dataLen, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, bits === 32 ? 3 : 1, true); // 3 : flottant IEEE, 1 : PCM
    v.setUint16(22, 2, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2 * bps, true);
    v.setUint16(32, 2 * bps, true);
    v.setUint16(34, bits === 32 ? 32 : bits, true);
    str(36, 'data');
    v.setUint32(40, dataLen, true);
    const fadeFrom = to - fade;
    const gainAt = (i) => (fade > 0 && i >= fadeFrom ? Math.max(0, (to - 1 - i) / fade) : 1); // le dernier échantillon à 0
    let o = 44;
    if (bits === 32) {
      for (let i = from; i < to; i++) {
        const g = gainAt(i);
        v.setFloat32(o, left[i] * g, true);
        v.setFloat32(o + 4, right[i] * g, true);
        o += 8;
      }
      return new Uint8Array(buf);
    }
    const full = bits === 16 ? 32767 : 8388607;
    const lo = -full - 1;
    const r = rng(seed);
    const bytes = new Uint8Array(buf);
    const q = (x) => {
      const s = Math.round(x * full + (r() - r()));
      return s > full ? full : s < lo ? lo : s;
    };
    for (let i = from; i < to; i++) {
      const g = gainAt(i);
      for (const ch of [left, right]) {
        const s = q(ch[i] * g);
        if (bps === 2) v.setInt16(o, s, true);
        else {
          bytes[o] = s & 0xff;
          bytes[o + 1] = (s >> 8) & 0xff;
          bytes[o + 2] = (s >> 16) & 0xff;
        }
        o += bps;
      }
    }
    return bytes;
  }

  /* ================= ZIP (sans compression) ================= */

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Archive ZIP (méthode « stockée ») : [{ name, data: Uint8Array }] → tableau de morceaux (Uint8Array) à mettre dans un Blob. */
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x0800, true); // noms en UTF-8
      h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true);
      h.setUint16(12, dosDate, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, f.data.length, true);
      h.setUint32(22, f.data.length, true);
      h.setUint16(26, name.length, true);
      h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true);
      c.setUint16(14, dosDate, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, f.data.length, true);
      c.setUint32(24, f.data.length, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + f.data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true);
    e.setUint32(16, offset, true);
    return [...parts, ...central, new Uint8Array(e.buffer)];
  }

  /* ================= Rendu dans le cadre invisible ================= */

  /** Un rendu : { left, right, sampleRate }. */
  function renderOnce(json, { seconds, sampleRate, seed }, { onProgress, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new DOMException('Rendu annulé', 'AbortError'));
      const f = document.createElement('iframe');
      f.name = JSON.stringify({ ssRender: 1, seconds, sampleRate, seed });
      f.title = 'Rendu audio';
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-40px;top:-40px;width:16px;height:16px;opacity:0;pointer-events:none;border:0';
      let settled = false;
      const cleanup = () => {
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        f.remove();
      };
      const onAbort = () => {
        if (settled) return;
        cleanup();
        reject(new DOMException('Rendu annulé', 'AbortError'));
      };
      if (signal) signal.addEventListener('abort', onAbort);
      f.addEventListener('load', async () => {
        try {
          const host = f.contentWindow && f.contentWindow.SS && f.contentWindow.SS.renderHost;
          if (!host) throw new Error('page de rendu introuvable');
          const r = await host.run(json, { onProgress });
          if (settled) return;
          const out = { left: new Float32Array(r.left), right: new Float32Array(r.right), sampleRate: r.sampleRate };
          cleanup();
          resolve(out);
        } catch (e) {
          if (settled) return;
          cleanup();
          reject(e);
        }
      });
      f.src = 'render.html';
      document.body.appendChild(f);
    });
  }

  const safe = (s) => String(s || 'chanson').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'chanson';

  /**
   * Export complet. opts : { range, loops, master: bool, stems: 'none'|'musician'|'track', bits, sampleRate }.
   * Retourne { files: [{ name, data }], report: { master: mesure, stems: [{ name, peak }], delayMs, seconds } }.
   * Le master est toujours rendu (il fixe le début et la fin de tous les fichiers), même s'il n'est pas demandé.
   */
  async function exportAudio(project, opts = {}, { onProgress, onStage, signal } = {}) {
    const o = { range: 'song', loops: 4, master: true, stems: 'none', bits: 24, sampleRate: 44100, ...opts };
    const sr = o.sampleRate;
    const title = safe(project.title);
    const groups = o.stems === 'none' ? [] : stemGroups(project, o.stems);
    if (!o.master && !groups.length) throw new Error('rien à exporter');
    const total = 1 + groups.length;
    let done = 0;
    const prog = (p) => onProgress && onProgress(Math.min(1, (done + p) / total));
    const seed = 0x5eed;

    // 1. master
    onStage && onStage('Master', 0, total);
    const pm = prepare(project, { range: o.range, loops: o.loops });
    const cfg = { seconds: pm.seconds, sampleRate: sr, seed };
    const M = await renderOnce(pm.json, cfg, { onProgress: prog, signal });
    done++;
    const B = bounds(M.left, M.right, sr, pm.lead, pm.songSeconds);
    const files = [];
    const report = { stems: [], seconds: (B.to - B.from) / sr, delayMs: 0, bits: o.bits, sampleRate: sr };

    // 2. stems (même début, même fin), et la somme du début du morceau pour recaler le master
    const winLen = Math.min(M.left.length - B.from, Math.round(32 * sr));
    const sumL = groups.length ? new Float32Array(M.left.length) : null;
    const sumR = groups.length ? new Float32Array(M.left.length) : null;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      onStage && onStage(g.name, i + 1, total);
      const ps = prepare(project, { range: o.range, loops: o.loops, keep: g.tracks, neutralMaster: true });
      const S = await renderOnce(ps.json, cfg, { onProgress: prog, signal });
      done++;
      for (let j = B.from; j < B.from + winLen; j++) {
        sumL[j] += S.left[j];
        sumR[j] += S.right[j];
      }
      let peak = 0;
      for (let j = B.from; j < B.to; j++) peak = Math.max(peak, Math.abs(S.left[j]), Math.abs(S.right[j]));
      report.stems.push({ name: g.name, tracks: g.tracks.length, peak: peak > 0 ? 20 * Math.log10(peak) : -Infinity });
      files.push({ name: `${title} - stems/${String(i + 1).padStart(2, '0')} ${safe(g.name)}.wav`, data: encodeWav(S.left, S.right, sr, o.bits, { ...B, seed: seed + i + 1 }) });
      await new Promise((r) => setTimeout(r, 0));
    }

    // 3. master recalé sur les stems, puis mesuré
    let delay = 0;
    if (groups.length) delay = masterDelay(M.left, M.right, sumL, sumR, B.from, sr);
    report.delayMs = (delay / sr) * 1000;
    const mFrom = B.from + delay;
    const mTo = Math.min(M.left.length, B.to + delay);
    report.master = measure(M.left, M.right, sr, mFrom, mTo);
    if (o.master) files.unshift({ name: `${title} - master.wav`, data: encodeWav(M.left, M.right, sr, o.bits, { from: mFrom, to: mTo, fade: B.fade, seed }) });
    onProgress && onProgress(1);
    return { files, report };
  }

  return { exportAudio, renderOnce, songPlan, stemGroups, prepare, leadIn, measure, truePeak, bounds, masterDelay, encodeWav, zip, crc32, kWeighting, PREROLL, TAIL };
})();
