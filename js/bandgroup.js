/*
 * Band : le groupe de l'assistant « Nouvelle chanson » — une liste éditable de musiciens (2 à 10), sans navigateur
 * (js/band.js l'utilise, tests/bandgroup.test.js la teste).
 *
 * Un musicien du groupe est un enregistrement { id, base, name, custom?, type?, ms? } :
 *  - id : identifiant stable. Un musicien du groupe par défaut garde celui de l'inspiration (« bass », « pad2 »…) ; un musicien
 *    ajouté reçoit « x1 », « x2 »… (jamais réutilisé dans un même groupe) ;
 *  - base : l'id du musicien de l'inspiration dont il vient (null pour un musicien ajouté ou dupliqué) ;
 *  - name : son nom (« Bassiste », « Bassiste 2 »…), custom : renommé à la main ;
 *  - type : (musicien ajouté) son type d'origine : drums | bass | chords | arp | melody | orch | horns | ambient ;
 *  - ms : (musicien ajouté) son choix de son : { pick, picked, custom, tok } ; pour un kit, { kit, pieces } ; pour un
 *    orchestre, { ens } (effectif de js/orchestra.js : une piste par pupitre) ; pour une section de cuivres, { form, add? }
 *    (formation de js/horns.js et musiciens ajoutés : une piste par musicien) ; pour un musicien Ambient, { mod, amb, drawn?,
 *    space? } (module de js/ambient.js, ses réglages track.ambient sans la présence, courbe de présence dessinée, envoi Cosmos).
 * L'ordre de la liste est l'ordre des onglets d'instrument de l'assistant.
 *
 * Groupe par défaut (defaultGroup) : les musiciens non facultatifs de l'inspiration, dans l'ordre de l'inspiration (sans retouche,
 * la chanson créée est celle d'avant). Un musicien ajouté joue avec le générateur de son type : son rôle moteur est
 * ROLE_OF_TYPE (drums → perc : un kit de percussions, au motif propre), voir « extra » dans js/bandsong.js.
 */
window.SS = window.SS || {};
SS.bandGroup = (() => {
  const MIN = 2;
  const MAX = 10;
  const TYPES = ['drums', 'bass', 'chords', 'arp', 'melody', 'orch', 'horns', 'ambient'];
  const ROLE_OF_TYPE = { drums: 'perc', bass: 'bass', chords: 'pad', arp: 'arp', melody: 'lead', orch: 'orch', horns: 'horns', ambient: 'ambient' };
  const BASE_NAME = { drums: 'Batteur', bass: 'Bassiste', chords: 'Clavier nappe', arp: 'Clavier arpège', melody: 'Clavier lead', orch: 'Orchestre', horns: 'Cuivres', ambient: 'Ambient' };
  const CAT_OF_TYPE = { bass: 'mono', chords: 'chord', arp: 'arp', melody: 'mono', orch: 'mono', horns: 'mono', ambient: 'mono' };
  /** Modules d'un musicien Ambient (js/ambient.js) : une piste générative, un module. */
  const AMB_MODS = ['jardin', 'paysage', 'fresque'];
  const ambMod = (m) => (AMB_MODS.includes(m) ? m : AMB_MODS[0]);
  /** Réglages d'un module sans ce qui vient des scènes (présence, hasard par scène). */
  const ambOwn = (a) => {
    const o = isObj(a) ? clone(a) : {};
    delete o.presence;
    delete o.rands;
    return o;
  };
  /** Type d'un rôle de l'inspiration (null : « fx », sans type). */
  const TYPE_OF_ROLE = { drums: 'drums', perc: 'drums', bass: 'bass', pad: 'chords', strings: 'chords', keys: 'chords', guitar: 'chords', brass: 'chords', arp: 'arp', arpchord: 'arp', lead: 'melody', vox: 'melody', sax: 'melody', orch: 'orch', horns: 'horns', ambient: 'ambient' };
  const typeOfRole = (role) => (role === 'fx' ? null : TYPE_OF_ROLE[role] || 'chords');
  const isExtraId = (id) => /^x\d+$/.test(String(id || ''));
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const B = () => SS.Band;

  /* ---------- noms ---------- */
  const stripNum = (n) => String(n).replace(/ \d+$/, '');
  /** Nom libre : « Bassiste », puis « Bassiste 2 », « Bassiste 3 »… (premier numéro libre). */
  function freeName(list, base, ignoreId) {
    const taken = new Set(list.filter((r) => r.id !== ignoreId).map((r) => r.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  }

  /* ---------- groupe par défaut ---------- */
  const labelOfMu = (mu) => mu.label || B().ROLES[mu.role].label;
  /** Groupe d'une inspiration : ses musiciens non facultatifs (ids et ordre de l'inspiration), noms uniques. */
  function defaultGroup(preset, only) {
    const list = [];
    preset.musicians.forEach((mu) => {
      if (only ? !only.includes(mu.id) : mu.optional) return;
      list.push({ id: mu.id, base: mu.id, name: freeName(list, labelOfMu(mu)) });
    });
    return { nextId: 1, list };
  }
  /** Brouillon v1 : un musicien était « dans le groupe » (on) ; cache = project.wizard…cache[presetId] brut. */
  function fromV1(preset, cache) {
    const on = preset.musicians.filter((mu) => {
      const x = cache && cache[mu.id];
      return x && typeof x === 'object' ? x.on !== false : !mu.optional;
    });
    const g = defaultGroup(preset, on.map((m) => m.id));
    if (g.list.length < MIN) return defaultGroup(preset);
    return g;
  }

  /* ---------- sons conseillés pour un type ---------- */
  /**
   * Conseillés d'un type pour une inspiration : { role, pick: [6 choix, le premier est le phare], cat } ; pour Drums : { kits, pieces }.
   * Source : un musicien de ce type dans l'inspiration (le premier, même facultatif), sinon dans le style, sinon dans le catalogue.
   */
  function recommended(kind, styleId, presetId) {
    const styles = B().STYLES;
    const st = styles.find((s) => s.id === styleId) || styles[0];
    const pr = st.presets.find((p) => p.id === presetId);
    const scopes = [pr ? [pr] : [], st.presets, styles.flatMap((s) => s.presets)];
    const find = (pred) => {
      for (const sc of scopes) for (const p of sc) { const mu = p.musicians.find(pred); if (mu) return mu; }
      return null;
    };
    if (kind === 'drums') {
      const kit = find((mu) => mu.role === 'drums' && mu.kits);
      const perc = find((mu) => mu.role === 'perc' && mu.kits);
      const drumsHere = pr && pr.musicians.find((mu) => mu.role === 'drums' && mu.kits);
      return { role: 'perc', kits: (drumsHere || kit).kits.slice(), pieces: (perc || { pieces: ['tb', 'sh'] }).pieces.slice() };
    }
    if (kind === 'orch') return { role: 'orch', pick: ['gm_violin'], cat: 'mono', ens: SS.orchestra ? SS.orchestra.ENSEMBLES.map((e) => e.id) : ['strings'] };
    if (kind === 'ambient') return { role: 'ambient', pick: AMB_MODS.slice(), cat: 'mono' };
    if (kind === 'horns') return { role: 'horns', pick: ['vsco_trumpet'], cat: 'mono', form: SS.horns ? SS.horns.formFor(styleId) : 'funk' };
    const pref = { bass: ['bass'], chords: ['pad', 'keys', 'strings', 'guitar', 'brass'], arp: ['arp'], melody: ['lead', 'vox', 'sax'] }[kind];
    let mu = null;
    outer: for (const strict of [true, false])
      for (const sc of scopes)
        for (const p of sc)
          for (const role of pref) {
            mu = p.musicians.find((x) => x.role === role && !x.kits && (!strict || !x.cat));
            if (mu) break outer;
          }
    return { role: ROLE_OF_TYPE[kind], pick: mu.pick.slice(), cat: CAT_OF_TYPE[kind] };
  }

  /* ---------- édition (g = { nextId, list }) ---------- */
  const find = (g, id) => g.list.find((r) => r.id === id) || null;
  const canAdd = (g) => g.list.length < MAX;
  const canRemove = (g) => g.list.length > MIN;
  /** Ajoute un musicien d'un type (nom libre par défaut, à la fin). Renvoie l'enregistrement, ou null si le groupe est complet. */
  function add(g, type, { name, ms } = {}) {
    if (!canAdd(g) || !TYPES.includes(type)) return null;
    const used = new Set(g.list.map((r) => r.id));
    while (used.has('x' + g.nextId)) g.nextId++;
    const rec = { id: 'x' + g.nextId++, base: null, name: (name && String(name).trim()) || freeName(g.list, BASE_NAME[type]), type };
    if (name && String(name).trim() && stripNum(rec.name) !== BASE_NAME[type]) rec.custom = true;
    if (ms) rec.ms = ms;
    g.list.push(rec);
    return rec;
  }
  /** Retire un musicien (refusé sous 2 musiciens). */
  function remove(g, id) {
    const i = g.list.findIndex((r) => r.id === id);
    if (i < 0 || !canRemove(g)) return false;
    g.list.splice(i, 1);
    return true;
  }
  /** Déplace un musicien de `delta` places (‹ −1, › +1). */
  function move(g, id, delta) {
    const i = g.list.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= g.list.length) return false;
    const [r] = g.list.splice(i, 1);
    g.list.splice(j, 0, r);
    return true;
  }
  /** Glisser-déposer : `id` prend la place de `toId`. */
  function moveTo(g, id, toId) {
    const a = g.list.findIndex((r) => r.id === id);
    const b = g.list.findIndex((r) => r.id === toId);
    if (a < 0 || b < 0 || a === b) return false;
    const [r] = g.list.splice(a, 1);
    g.list.splice(b, 0, r);
    return true;
  }
  /** Renomme ; un nom vide rend le nom par défaut (`base` : le nom d'origine du type). */
  function rename(g, id, name, base) {
    const r = find(g, id);
    if (!r) return false;
    const t = String(name || '').trim().slice(0, 24);
    if (t) {
      r.name = t;
      if (stripNum(t) === base) delete r.custom;
      else r.custom = true;
    } else {
      r.name = freeName(g.list, base, id);
      delete r.custom;
    }
    return true;
  }
  /** Nom d'une copie : « Bassiste » → « Bassiste 2 » (premier numéro libre). */
  const copyName = (g, name) => freeName(g.list, stripNum(name));
  /** Insère une copie juste après l'original. */
  function insertAfter(g, id, rec) {
    const i = g.list.findIndex((r) => r.id === id);
    g.list.splice(i < 0 ? g.list.length : i + 1, 0, rec);
    return rec;
  }
  /** Prépare un id libre pour un enregistrement construit à la main (duplication). */
  function newId(g) {
    const used = new Set(g.list.map((r) => r.id));
    while (used.has('x' + g.nextId)) g.nextId++;
    return 'x' + g.nextId++;
  }

  /**
   * Efface les traces d'instruments retirés de l'état de l'assistant w (S.wiz) : leur type (kinds), muet / solo / volume / pistes
   * écartées, leurs réglages par scène (parts[section].inst[id], la section vide disparaît) et ceux de l'atelier Mélodie.
   * `ids` : l'id du musicien, celui de son kit et ceux de ses colonnes. (Les tranches du mix suivent : SS.wizMix.sync.)
   */
  function purge(w, ids) {
    const set = new Set(ids);
    set.forEach((k) => {
      if (w.kinds) delete w.kinds[k];
      ['off', 'mute', 'solo'].forEach((f) => w[f] && w[f].delete(k));
      if (w.vol) w.vol.delete(k);
    });
    Object.keys(w.parts || {}).forEach((sec) => {
      const pp = w.parts[sec];
      if (pp && pp.inst) {
        set.forEach((k) => delete pp.inst[k]);
        if (!Object.keys(pp.inst).length) delete pp.inst;
      }
      if (!Object.keys(pp || {}).length) delete w.parts[sec];
    });
    ['melPanel', 'plans', 'pseeds', 'chars', 'accView'].forEach((f) => Object.keys(w[f] || {}).forEach((k) => [...set].some((x) => k.startsWith(x + '|')) && delete w[f][k]));
  }

  /**
   * Changer d'inspiration : même style, le groupe repart de celui de la nouvelle inspiration et garde les musiciens ajoutés
   * (à la fin, dans leur ordre) ; autre style, il repart du groupe du nouveau style, sans rien garder. Le groupe garde au plus 10.
   */
  function rebase(g, preset, sameStyle) {
    const d = defaultGroup(preset);
    if (!sameStyle || !g) return d;
    const kept = g.list.filter((r) => !r.base);
    d.nextId = g.nextId;
    kept.forEach((r) => d.list.length < MAX && d.list.push(r));
    d.list.forEach((r) => r.base && (r.name = freeName(d.list.filter((x) => x !== r), r.name, r.id)));
    return d;
  }

  /* ---------- groupe repris de la grille ----------
   * insts : les instruments de la grille (js/band.js gridInstruments), dans l'ordre des pistes :
   *   { type, name, opts } (opts : options de piste du son, avec keep = ses réglages de son) ;
   *   batterie : { type: 'drums', name, kit, pieces: [{ piece, opts }] } (une piste de la grille par élément).
   * Chaque instrument prend la place d'un musicien de l'inspiration du même type (pour jouer ses motifs), sinon devient un
   * musicien ajouté. Le groupe = les instruments de la grille (au plus 10) ; s'il n'en a qu'un, le premier musicien de
   * l'inspiration d'un autre type complète. Renvoie { group: { nextId, list }, cache: { idMusicien: choix de son },
   * map: [id du musicien de chaque instrument (null au-delà de 10)] }. msFromGrid : le choix de son d'un instrument repris. */
  function msFromGrid(inst, mu, styleId, presetId) {
    if (inst.type === 'drums') {
      const kits = (mu && mu.kits) || recommended('drums', styleId, presetId).kits;
      return { on: true, kit: kits.includes(inst.kit) ? inst.kit : kits[0], pieces: inst.pieces.map((p) => ({ piece: p.piece, on: true, custom: clone(p.opts) })) };
    }
    if (inst.type === 'orch') return { on: true, ens: 'chamber' };
    if (inst.type === 'horns') return cleanMs({ form: inst.form, add: inst.add }, 'horns');
    if (inst.type === 'ambient') {
      // piste générative : son module et ses réglages ; une courbe de présence dessinée à la main reste (« retouchée »)
      const a = (inst.opts && inst.opts.keep && inst.opts.keep.ambient) || {};
      const o = { on: true, mod: ambMod(inst.opts && inst.opts.instrument), amb: ambOwn(a) };
      if (inst.drawn && Array.isArray(a.presence)) o.drawn = a.presence.slice();
      if (typeof inst.space === 'number') o.space = inst.space;
      return o;
    }
    const o = { on: true, pick: 0, picked: true, custom: clone(inst.opts) };
    if (!mu) o.tok = recommended(inst.type, styleId, presetId).pick[0];
    return o;
  }
  function fromGrid(preset, insts, styleId) {
    const list = [];
    const cache = {};
    const g = { nextId: 1, list };
    const used = new Set();
    const map = insts.map(() => null);
    const typeOfMu = (mu) => (mu.kits ? 'drums' : mu.orch || mu.role === 'orch' ? 'orch' : mu.horns || mu.role === 'horns' ? 'horns' : mu.role === 'ambient' ? 'ambient' : typeOfRole(mu.role));
    insts.slice(0, MAX).forEach((inst, i) => {
      // le batteur d'abord (rôle drums), puis les percussions ; les autres : premier musicien libre du même type
      const cands = preset.musicians.filter((m) => !used.has(m.id) && typeOfMu(m) === inst.type);
      const mu = cands.find((m) => m.role === 'drums') || cands[0];
      if (mu) {
        used.add(mu.id);
        list.push({ id: mu.id, base: mu.id, name: freeName(list, String(inst.name || labelOfMu(mu)).slice(0, 24)), custom: true });
        cache[mu.id] = msFromGrid(inst, mu, styleId, preset.id);
        map[i] = mu.id;
      } else {
        const r = add(g, inst.type, { name: String(inst.name || '').slice(0, 24), ms: msFromGrid(inst, null, styleId, preset.id) });
        map[i] = r ? r.id : null;
      }
    });
    if (list.length < MIN) {
      const have = new Set(insts.map((i) => i.type));
      const mu = preset.musicians.find((m) => !used.has(m.id) && !have.has(typeOfMu(m)) && !m.optional) || preset.musicians.find((m) => !used.has(m.id));
      if (mu) list.push({ id: mu.id, base: mu.id, name: freeName(list, labelOfMu(mu)) });
    }
    return { group: g, cache, map };
  }

  /* ---------- brouillon ---------- */
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const cleanMs = (x, type) => {
    if (!isObj(x)) return null;
    if (type === 'drums') {
      const pieces = (Array.isArray(x.pieces) ? x.pieces : [])
        .filter((q) => isObj(q) && typeof q.piece === 'string')
        .map((q) => ({ piece: q.piece, on: q.on !== false, ...(isObj(q.custom) ? { custom: clone(q.custom) } : {}) }));
      return { on: true, kit: typeof x.kit === 'string' ? x.kit : 'RolandTR808', pieces };
    }
    if (type === 'orch') {
      const ids = SS.orchestra ? SS.orchestra.ENSEMBLES.map((e) => e.id) : ['strings'];
      return { on: true, ens: ids.includes(x.ens) ? x.ens : ids[0] };
    }
    if (type === 'horns') {
      // section de cuivres (js/horns.js) : sa formation et les musiciens ajoutés (doublures, 4 au plus)
      const H = SS.horns;
      const form = H && H.FORM[x.form] ? x.form : H ? H.FORMS[2].id : 'funk';
      const add = (Array.isArray(x.add) ? x.add : []).filter((i) => !H || H.INST[i]).slice(0, 4);
      return { on: true, form, ...(add.length ? { add } : {}) };
    }
    if (type === 'ambient') {
      const o = { on: true, mod: ambMod(x.mod), amb: ambOwn(x.amb) };
      if (Array.isArray(x.drawn) && x.drawn.length) o.drawn = x.drawn.map((v) => Math.max(0, Math.min(1, +v || 0)));
      if (typeof x.space === 'number') o.space = Math.max(0, Math.min(1, x.space));
      return o;
    }
    const o = { on: true, pick: Number.isInteger(x.pick) && x.pick >= 0 && x.pick < 12 ? x.pick : 0, custom: isObj(x.custom) ? clone(x.custom) : null };
    if (x.picked) o.picked = true;
    if (typeof x.tok === 'string') o.tok = x.tok;
    return o;
  };
  /** Groupe relu d'un brouillon : null s'il est inutilisable (ids inconnus de l'inspiration, taille, doublons). */
  function clean(raw, preset) {
    if (!isObj(raw) || !Array.isArray(raw.list) || raw.list.length < MIN || raw.list.length > MAX) return null;
    const seen = new Set();
    const list = [];
    for (const r of raw.list) {
      if (!isObj(r) || typeof r.id !== 'string' || seen.has(r.id)) return null;
      seen.add(r.id);
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 24) : null;
      if (typeof r.base === 'string') {
        if (r.base !== r.id || !preset.musicians.some((m) => m.id === r.base)) return null;
        list.push({ id: r.id, base: r.base, name: name || r.base, ...(r.custom ? { custom: true } : {}) });
      } else {
        if (!isExtraId(r.id) || !TYPES.includes(r.type)) return null;
        const ms = cleanMs(r.ms, r.type);
        if (!ms) return null;
        list.push({ id: r.id, base: null, name: name || BASE_NAME[r.type], ...(r.custom ? { custom: true } : {}), type: r.type, ms });
      }
    }
    const nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : 1;
    return { nextId, list };
  }

  return { MIN, MAX, TYPES, AMB_MODS, ambMod, ambOwn, ROLE_OF_TYPE, BASE_NAME, CAT_OF_TYPE, typeOfRole, isExtraId, freeName, stripNum, copyName, defaultGroup, fromV1, fromGrid, msFromGrid, recommended, find, canAdd, canRemove, add, remove, move, moveTo, rename, insertAfter, newId, rebase, purge, clean, clone };
})();
