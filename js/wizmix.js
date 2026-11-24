/*
 * Assistant « Nouvelle chanson », étape Mix : modèle de données et moteur (sans interface).
 *
 * Le mix de la chanson (`mix`) :
 *   { style, tracks: { [id]: strip }, master: strip, own: { [scène]: { [id]: surcharge partielle } }, base: { tracks, master } }
 *   strip = { vol (dB), pan (−1..1), mute, solo, fx: { eq:{on,low,mid,high}, comp:{on,amount}, filter:{on,cut},
 *             chorus:{on,mix}, delay:{on,mix,time}, reverb:{on,mix}, sends:{plate,hall,echo,cosmos}, sidechain:{on,amount} } }
 *   Valeurs : dB, pourcentages 0..100 ; EQ en dB (graves 120 Hz, médiums 800 Hz, aigus 8 kHz).
 *   `base` est le réglage automatique du style (js/bandmix.js) : tant que `tracks` = `base` et `own` est vide, apply() ne
 *   touche à rien et la chanson créée est identique à celle d'aujourd'hui.
 *
 * Identifiants (idOf) : un par élément de batterie, d'après la voix réellement jouée par la piste (le projet a UNE PISTE PAR
 *   ÉLÉMENT, band.key « drums:bd ») : kick, snare, clap, rim, hh, oh, tomlo, tommid, tomhi, crash, ride, cowbell, shaker,
 *   tamb, perc, misc ; percussionniste : « perc:<voix> » ; autres musiciens : leur rôle (bass, pad, arp, lead, keys, guitar,
 *   strings, sax, brass, vox, fx) ; « master » pour la tranche Master. Le volume et le pan de la batterie s'appliquent donc à la
 *   piste de chaque élément, sans rien de plus.
 *
 * Scènes : une surcharge `own[scène][id]` se règle par id de scène du projet OU par id de section (« chorus »…) ; apply()
 *   accepte les deux (form = [{ id, sec }]).
 *
 * Ce que apply() sait écrire par scène (track.auto de la scène, js/project.js SS.AUTO_PARAMS) :
 *   - volume et Muet : courbe « volume » (0..1, atténue seulement) ; le volume fixe de la piste = le plus fort de toutes les
 *     scènes, la courbe ramène les autres ; les courbes déjà écrites par le plan (fondu d'outro…) sont mises à l'échelle ;
 *   - envois hall / écho / Cosmos : courbes « reverb » / « echo » / « space » (envoi supplémentaire, additif) ; l'envoi fixe
 *     = le plus faible de toutes les scènes ;
 *   - filtre : courbe « filter » (passe-bas, cut 100 = ouvert) quand le filtre est allumé dans la scène (remplace alors la
 *     courbe du plan).
 *   Non automatisable (la valeur de la CHANSON vaut partout, les surcharges de scène sont listées dans report.ignored) :
 *   pan, EQ, compresseur, chorus, delay, reverb propre à la piste, envoi plate, sidechain, et tout le Master.
 */
window.SS = window.SS || {};

SS.wizMix = (() => {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const merge = (a, b) => {
    const o = clone(a);
    for (const k in b || {}) o[k] = isObj(b[k]) ? merge(isObj(a && a[k]) ? a[k] : {}, b[k]) : b[k];
    return o;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const toDb = (g) => (g > 0.001 ? r2(20 * Math.log10(g)) : -60);
  const fromDb = (db) => Math.pow(10, db / 20);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* ---------- identifiants et noms ---------- */
  const DRUM_ID = { bd: 'kick', sd: 'snare', cp: 'clap', rim: 'rim', hh: 'hh', oh: 'oh', lt: 'tomlo', mt: 'tommid', ht: 'tomhi', cr: 'crash', rd: 'ride', cb: 'cowbell', sh: 'shaker', tb: 'tamb', perc: 'perc', misc: 'misc' };
  const DRUM_NAME = { bd: 'Kick', sd: 'Caisse claire', cp: 'Clap', rim: 'Rimshot', hh: 'Charleston', oh: 'Charl. ouvert', lt: 'Tom grave', mt: 'Tom médium', ht: 'Tom aigu', cr: 'Crash', rd: 'Ride', cb: 'Cowbell', sh: 'Shaker', tb: 'Tambourin', perc: 'Percussion', misc: 'Divers' };
  const ROLE_NAME = { bass: 'Basse', pad: 'Nappe', arp: 'Arpège', lead: 'Lead', keys: 'Piano', guitar: 'Guitare', strings: 'Cordes', sax: 'Sax', brass: 'Cuivres', vox: 'Voix', fx: 'Effets' };
  const ROLE_ORDER = ['bass', 'pad', 'strings', 'keys', 'guitar', 'arp', 'lead', 'sax', 'brass', 'vox', 'fx'];
  const DRUM_ORDER = Object.keys(DRUM_ID);

  /** Identifiant de mix d'une piste Band (ou d'une colonne de l'assistant : { band }), null si elle n'est pas de Band. */
  function idOf(t) {
    const key = t && t.band && t.band.key;
    if (!key) return null;
    const [role, sound] = key.split(':');
    // musicien ajouté à l'assistant (id « x1 »…) : ses propres tranches, suffixées par son id (« kick@x1 », « bass@x2 »)
    const sfx = /^x\d+$/.test(t.band.musician || '') ? '@' + t.band.musician : '';
    if (role === 'drums') return (DRUM_ID[sound] || 'drum:' + sound) + sfx;
    if (role === 'perc') return 'perc:' + sound + sfx;
    return role + sfx;
  }
  /**
   * Tranches à afficher pour ces pistes, dans l'ordre de la console : [{ id, name, group: 'drums' | 'perc' | null, order }].
   * Un id partagé par plusieurs pistes n'apparaît qu'une fois.
   */
  function strips(tracks) {
    const seen = new Map();
    let order_n = 0;
    for (const t of tracks) {
      const id = idOf(t);
      if (!id || seen.has(id)) continue;
      const [role, sound] = t.band.key.split(':');
      const group = role === 'drums' || role === 'perc' ? role : null;
      const own = /^x\d+$/.test(t.band.musician || '') ? t.band.label || t.band.musician : null; // musicien ajouté : son nom
      let name = group ? (DRUM_NAME[sound] || sound) + (role === 'perc' ? ' (percu)' : '') : ROLE_NAME[role] || role;
      if (own) name = group ? `${DRUM_NAME[sound] || sound} (${own})` : own;
      const order = (role === 'drums' ? DRUM_ORDER.indexOf(sound) : role === 'perc' ? 100 + DRUM_ORDER.indexOf(sound) : 200 + ROLE_ORDER.indexOf(role)) + (own ? 0.5 + order_n++ / 1000 : 0);
      seen.set(id, { id, name, group: own && group ? group + ':' + t.band.musician : group, order, ...(own ? { musician: t.band.musician } : {}) });
    }
    return [...seen.values()].sort((a, b) => a.order - b.order);
  }

  /* ---------- lecture d'une piste réelle (ou fictive) vers le modèle ---------- */
  const EQ0 = { on: false, low: 0, mid: 0, high: 0 };
  /** Modèle d'une tranche à partir de { volume, mix, fx, mute, solo } (SS.MIX_DEFAULTS / SS.FX_DEFAULTS pour le reste). */
  function readStrip(t, isMaster) {
    const mx = SS.mixParams ? SS.mixParams(t) : t.mix || SS.MIX_DEFAULTS;
    const fx = { ...SS.FX_DEFAULTS, ...(t.fx || {}) };
    const e = mx.eq;
    const strip = {
      vol: toDb(typeof t.volume === 'number' ? t.volume : 0.8),
      pan: r2(mx.pan || 0),
      mute: !!t.mute,
      solo: !!t.solo,
      fx: {
        eq: e && e.on ? { on: true, low: r2(e.low.g), mid: r2(e.lm.g), high: r2(e.high.g) } : { ...EQ0 },
        comp: { on: !!mx.comp.on, amount: mx.comp.on ? Math.round(clamp((mx.comp.ratio - 1) / 5, 0, 1) * 100) : 30 },
        filter: { on: false, cut: 100 },
        chorus: { on: fx.chorus > 0, mix: fx.chorus > 0 ? Math.round(fx.chorus * 100) : 30 },
        delay: { on: fx.delay > 0, mix: fx.delay > 0 ? Math.round(fx.delay * 100) : 20, time: fx.delayTime },
        reverb: { on: fx.room > 0, mix: fx.room > 0 ? Math.round(fx.room * 100) : 20 },
        sends: { plate: Math.round(fx.sendPlate * 100), hall: Math.round(fx.sendHall * 100), echo: Math.round(fx.sendEcho * 100), cosmos: Math.round(fx.sendSpace * 100) },
        sidechain: { on: !!fx.scSource && fx.scDepth > 0, amount: fx.scSource ? Math.round(fx.scDepth * 100) : 40 },
      },
    };
    if (isMaster) {
      strip.fx = { eq: strip.fx.eq, comp: strip.fx.comp };
      delete strip.pan;
      delete strip.mute;
      delete strip.solo;
    }
    return strip;
  }

  /**
   * Mix de la chanson au départ : exactement le réglage automatique du style (js/bandmix.js, js/band-levels.js).
   * `tracks` : pistes de l'assistant ou du projet { id?, type, instrument?, band: { key }, levelKey? } (levelKey : clé de mesure de
   * band-levels, c.o.levelKey dans l'assistant). `style` : 'synthwave' | 'edm' | 'techno' | 'ambient'.
   */
  function defaults(style, tracks) {
    const fakes = [];
    const levelKeys = new Map();
    tracks.forEach((t, i) => {
      if (!idOf(t)) return;
      const f = { id: 'wm' + i, type: t.type, sound: t.sound, instrument: t.instrument, band: { ...t.band }, volume: 0.8 }; // instrument : module du musicien Ambient (volume par module)
      levelKeys.set(f.id, t.levelKey);
      fakes.push(f);
    });
    SS.bandMix.mixTracks(fakes, levelKeys, style);
    const out = { tracks: {} };
    fakes.forEach((f) => {
      const id = idOf(f);
      if (out.tracks[id]) return;
      const s = readStrip(f);
      if (f.fx && f.fx.scSource) s.fx.sidechain.on = f.fx.scDepth > 0; // la source est le kick : retrouvée à l'application
      out.tracks[id] = s;
    });
    const proj = {};
    SS.bandMix.mixMaster(proj, style, 0);
    out.master = readStrip(proj.master, true);
    return { style, tracks: out.tracks, master: out.master, own: {}, base: clone({ tracks: out.tracks, master: out.master }) };
  }

  /** Remet le mix en phase avec une nouvelle liste de pistes : garde les réglages des ids connus, ajoute les nouveaux. */
  function sync(mix, style, tracks) {
    const d = defaults(style, tracks);
    const next = { style, tracks: {}, master: mix ? mix.master : d.master, own: {}, base: d.base };
    for (const id of Object.keys(d.tracks)) next.tracks[id] = mix && mix.tracks[id] ? mix.tracks[id] : d.tracks[id];
    if (mix) for (const sc of Object.keys(mix.own || {})) for (const id of Object.keys(mix.own[sc])) if (next.tracks[id] || id === 'master') (next.own[sc] = next.own[sc] || {})[id] = mix.own[sc][id];
    return next;
  }

  /* ---------- lecture / écriture ---------- */
  const strip = (mix, id) => (id === 'master' ? mix.master : mix.tracks[id]);
  /** Réglage effectif d'une tranche dans une scène (sceneId null ou 'song' : la chanson) : chanson + surcharge de la scène. */
  function eff(mix, sceneId, id) {
    const s = strip(mix, id);
    if (!s) return null;
    const o = sceneId && sceneId !== 'song' && mix.own && mix.own[sceneId] ? mix.own[sceneId][id] : null;
    return o ? merge(s, o) : clone(s);
  }
  const pathOf = (p) => (Array.isArray(p) ? p : String(p).split('.'));
  /** Écrit une valeur : scope 'song' (réglage de base) ou un id de scène (surcharge propre à la scène). path : ['fx','eq','low'] ou 'fx.eq.low'. */
  function set(mix, scope, id, path, value) {
    const p = pathOf(path);
    let o;
    if (!scope || scope === 'song') o = strip(mix, id);
    else {
      mix.own = mix.own || {};
      o = (mix.own[scope] = mix.own[scope] || {});
      o = o[id] = o[id] || {};
    }
    if (!o) return false;
    for (let i = 0; i < p.length - 1; i++) o = o[p[i]] = isObj(o[p[i]]) ? o[p[i]] : {};
    o[p[p.length - 1]] = value;
    return true;
  }
  const leaves = (o) => (isObj(o) ? Object.values(o).reduce((n, v) => n + leaves(v), 0) : 1);
  /** Efface la surcharge d'une tranche dans la scène (« ↺ chanson »), ou de toute la scène si id est omis. */
  function reset(mix, sceneId, id) {
    if (!mix.own || !mix.own[sceneId]) return;
    if (id) delete mix.own[sceneId][id];
    else delete mix.own[sceneId];
    if (mix.own[sceneId] && !Object.keys(mix.own[sceneId]).length) delete mix.own[sceneId];
  }
  /** Nombre de réglages propres à la scène (valeurs, toutes tranches confondues). */
  function ownCount(mix, sceneId) {
    return leaves((mix.own && mix.own[sceneId]) || {});
  }
  /** Copie les réglages propres de sceneId vers les scènes de sceneIds (les leurs sont remplacés). Renvoie le nombre de scènes écrites. */
  function copyToSameType(mix, sceneId, sceneIds) {
    const src = mix.own && mix.own[sceneId];
    let n = 0;
    for (const to of sceneIds) {
      if (to === sceneId) continue;
      if (src && Object.keys(src).length) (mix.own = mix.own || {})[to] = clone(src);
      else if (mix.own) delete mix.own[to];
      n++;
    }
    return n;
  }

  /* ---------- aperçu dans l'assistant ---------- */
  /**
   * Ce que l'écoute de l'assistant doit refléter pour la scène (null : la chanson) :
   *   { anySolo, tracks: { [id]: { gain, gainDb, pan, mute, solo, audible, fx } }, master: { gain, gainDb } }
   * gain / gainDb : écart au mixage automatique (à MULTIPLIER au volume que bandmix a calculé de la piste), pan : valeur
   * absolue (remplace t.mix.pan), audible : ni muet ni écarté par un solo. Pour une écoute fidèle de toute la chanson
   * (courbes par scène comprises), le plus simple est d'appeler apply(projetDÉcoute, mix, scènes) sur le projet temporaire.
   */
  function preview(mix, sceneId) {
    const out = { anySolo: false, tracks: {}, master: null };
    const ids = Object.keys(mix.tracks);
    const effs = Object.fromEntries(ids.map((id) => [id, eff(mix, sceneId, id)]));
    out.anySolo = ids.some((id) => effs[id].solo);
    ids.forEach((id) => {
      const e = effs[id];
      const gainDb = r2(e.vol - (mix.base && mix.base.tracks[id] ? mix.base.tracks[id].vol : e.vol));
      out.tracks[id] = { gainDb, gain: fromDb(gainDb), pan: e.pan, mute: e.mute, solo: e.solo, audible: !e.mute && (!out.anySolo || e.solo), fx: e.fx };
    });
    const m = eff(mix, sceneId, 'master');
    const mdb = r2(m.vol - (mix.base ? mix.base.master.vol : m.vol));
    out.master = { gainDb: mdb, gain: fromDb(mdb), fx: m.fx };
    return out;
  }

  /* ---------- application à la création ---------- */
  const ensureMix = (t) => (t.mix = t.mix || clone(SS.MIX_DEFAULTS));
  const E = 1e-6;
  const differs = (a, b) => Math.abs(a - b) > E;

  /** EQ et compresseur d'une tranche (piste ou Master) : seulement ce qui diffère de la base. */
  function applyEqComp(mixObj, m, b, rep) {
    const eq = m.fx.eq, beq = b.fx.eq;
    if (eq.on !== beq.on || (eq.on && (differs(eq.low, beq.low) || differs(eq.mid, beq.mid) || differs(eq.high, beq.high)))) {
      mixObj.eq.on = eq.on;
      if (eq.on) {
        mixObj.eq.low.g = clamp(mixObj.eq.low.g + eq.low - beq.low, -18, 18);
        mixObj.eq.lm.g = clamp(mixObj.eq.lm.g + eq.mid - beq.mid, -18, 18);
        mixObj.eq.high.g = clamp(mixObj.eq.high.g + eq.high - beq.high, -18, 18);
      }
      rep.changed++;
    }
    const c = m.fx.comp, bc = b.fx.comp;
    if (c.on !== bc.on || (c.on && differs(c.amount, bc.amount))) {
      mixObj.comp.on = c.on;
      if (c.on) mixObj.comp.ratio = r2(1 + (5 * c.amount) / 100);
      rep.changed++;
    }
  }

  /**
   * Applique le mix de la chanson aux pistes et au Master du projet (déjà mixés par bandmix), puis écrit les surcharges de
   * scène en automation (voir l'en-tête). `form` : scènes de la chanson [{ id, sec? }] (res.scenes de SS.bandSong.build ou
   * project.scenes). Renvoie { changed, automated, ignored: [{ scene, track, param }] }.
   */
  function apply(project, mix, form) {
    const rep = { changed: 0, automated: 0, ignored: [] };
    if (!mix || !mix.tracks) return rep;
    const scenes = (form || project.scenes || []).map((f) => {
      const sc = project.scenes.find((x) => x.id === f.id);
      const key = [f.id, f.sec].find((k) => k && mix.own && mix.own[k]) || f.sec || f.id;
      return sc ? { sc, key } : null;
    }).filter(Boolean);
    const kick = project.tracks.find((t) => t.band && t.band.key === 'drums:bd');

    project.tracks.forEach((t) => {
      const id = idOf(t);
      const m = id && mix.tracks[id];
      const b = id && mix.base && mix.base.tracks[id];
      if (!m || !b) return;
      const effs = scenes.length ? scenes.map((s) => eff(mix, s.key, id)) : [clone(m)];
      // volume et Muet : volume fixe = scène la plus forte ; Muet fixe seulement si toutes les scènes sont muettes
      const audible = effs.filter((e) => !e.mute);
      const allMute = effs.every((e) => e.mute);
      const sv = audible.length ? Math.max(...audible.map((e) => e.vol)) : m.vol;
      if (allMute !== b.mute) {
        t.mute = allMute;
        rep.changed++;
      }
      if (differs(sv, b.vol)) {
        t.volume = Math.round(clamp((typeof t.volume === 'number' ? t.volume : 0.8) * fromDb(sv - b.vol), 0, 2) * 1000) / 1000;
        rep.changed++;
      }
      if (m.solo !== b.solo) t.solo = m.solo;
      if (differs(m.pan, b.pan)) {
        ensureMix(t).pan = clamp(m.pan, -1, 1);
        rep.changed++;
      }
      // effets de la tranche (valeur de la chanson)
      ensureMix(t);
      applyEqComp(t.mix, m, b, rep);
      const fx = { ...(t.fx || {}) };
      const val = (o, scale = 100) => (o.on ? o.mix / scale : 0);
      const setFx = (key, v, bv) => {
        if (differs(v, bv)) {
          fx[key] = Math.round(clamp(v, 0, 1) * 1000) / 1000;
          rep.changed++;
        }
      };
      setFx('chorus', val(m.fx.chorus), val(b.fx.chorus));
      setFx('delay', val(m.fx.delay), val(b.fx.delay));
      setFx('room', val(m.fx.reverb), val(b.fx.reverb));
      if (m.fx.delay.on && m.fx.delay.time !== b.fx.delay.time) fx.delayTime = m.fx.delay.time;
      setFx('sendPlate', m.fx.sends.plate / 100, b.fx.sends.plate / 100);
      // envois hall / écho / Cosmos : fixe = scène la plus faible, le reste en courbes
      const SEND = { hall: ['sendHall', 'reverb'], echo: ['sendEcho', 'echo'], cosmos: ['sendSpace', 'space'] };
      const sendFloor = {};
      for (const [k, [fk]] of Object.entries(SEND)) {
        sendFloor[k] = Math.min(...effs.map((e) => e.fx.sends[k]));
        setFx(fk, sendFloor[k] / 100, b.fx.sends[k] / 100);
      }
      const sc = m.fx.sidechain, bsc = b.fx.sidechain;
      if (sc.on !== bsc.on || (sc.on && differs(sc.amount, bsc.amount))) {
        if (!sc.on) {
          delete fx.scSource;
          rep.changed++;
        } else if (kick && kick.id !== t.id) {
          fx.scSource = kick.id;
          fx.scDepth = sc.amount / 100;
          if (!t.fx || t.fx.scSource !== kick.id) fx.scRelease = id === 'bass' ? 0.16 : 0.22;
          rep.changed++;
        }
      }
      for (const [k, v] of Object.entries(fx)) if (v === SS.FX_DEFAULTS[k]) delete fx[k];
      if (Object.keys(fx).length) t.fx = fx;
      else delete t.fx;

      // surcharges de scène : automation
      scenes.forEach(({ sc: scene, key }, i) => {
        const e = effs[i];
        const own = mix.own && mix.own[key] && mix.own[key][id];
        const d = scene.data && scene.data[t.id];
        // non automatisable : listé
        for (const [param, a, c] of [['pan', e.pan, m.pan], ['fx.eq', e.fx.eq, m.fx.eq], ['fx.comp', e.fx.comp, m.fx.comp], ['fx.chorus', e.fx.chorus, m.fx.chorus], ['fx.delay', e.fx.delay, m.fx.delay], ['fx.reverb', e.fx.reverb, m.fx.reverb], ['fx.sends.plate', e.fx.sends.plate, m.fx.sends.plate], ['fx.sidechain', e.fx.sidechain, m.fx.sidechain], ['solo', e.solo, m.solo]])
          if (own && !same(a, c)) rep.ignored.push({ scene: key, track: id, param });
        if (!d) return;
        const lanes = (d.auto = d.auto || {});
        const lane = (pid, f) => {
          lanes[pid] = f(lanes[pid]);
          rep.automated++;
        };
        const f = e.mute ? 0 : fromDb(e.vol - sv);
        if (f < 0.999)
          lane('volume', (old) => (old ? Object.fromEntries(Object.entries(old).map(([s, v]) => [s, Math.round(v * f * 1000) / 1000])) : { 0: Math.round(f * 1000) / 1000 }));
        for (const [k, [, pid]] of Object.entries(SEND)) {
          const extra = (e.fx.sends[k] - sendFloor[k]) / 100;
          if (extra > E) lane(pid, (old) => (old ? Object.fromEntries(Object.entries(old).map(([s, v]) => [s, Math.min(1, Math.round((v + extra) * 1000) / 1000)])) : { 0: Math.round(extra * 1000) / 1000 }));
        }
        if (e.fx.filter.on) lane('filter', () => ({ 0: Math.round(-(1 - clamp(e.fx.filter.cut, 0, 100) / 100) * 1000) / 1000 }));
        if (!Object.keys(lanes).length) delete d.auto;
      });
    });

    // Master : valeur de la chanson (EQ, compresseur, volume) ; les surcharges de scène ne sont pas automatisables
    const mm = mix.master, mb = mix.base && mix.base.master;
    if (mm && mb) {
      project.master = project.master || clone(SS.MASTER_DEFAULTS);
      const pm = project.master;
      if (differs(mm.vol, mb.vol)) {
        pm.volume = clamp((typeof pm.volume === 'number' ? pm.volume : 1) * fromDb(mm.vol - mb.vol), 0, 2);
        rep.changed++;
      }
      pm.mix = pm.mix || clone(SS.MASTER_DEFAULTS.mix);
      applyEqComp(pm.mix, mm, mb, rep);
      for (const sid of Object.keys(mix.own || {})) {
        const o = mix.own[sid].master;
        if (o && scenes.some((s) => s.key === sid)) rep.ignored.push({ scene: sid, track: 'master', param: 'master' });
      }
    }
    return rep;
  }

  return { idOf, strips, defaults, sync, eff, set, reset, ownCount, copyToSameType, preview, apply };
})();
