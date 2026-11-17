/*
 * Band : le groupe de l'assistant « Nouvelle chanson » — une liste éditable de musiciens (2 à 10), sans navigateur
 * (js/band.js l'utilise, tests/bandgroup.test.js la teste).
 *
 * Un musicien du groupe est un enregistrement { id, base, name, custom?, type?, ms? } :
 *  - id : identifiant stable. Un musicien du groupe par défaut garde celui de l'inspiration (« bass », « pad2 »…) ; un musicien
 *    ajouté reçoit « x1 », « x2 »… (jamais réutilisé dans un même groupe) ;
 *  - base : l'id du musicien de l'inspiration dont il vient (null pour un musicien ajouté ou dupliqué) ;
 *  - name : son nom (« Bassiste », « Bassiste 2 »…), custom : renommé à la main ;
 *  - type : (musicien ajouté) son type d'origine : drums | bass | chords | arp | melody ;
 *  - ms : (musicien ajouté) son choix de son : { pick, picked, custom, tok } ou, pour un kit, { kit, pieces }.
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
  const TYPES = ['drums', 'bass', 'chords', 'arp', 'melody'];
  const ROLE_OF_TYPE = { drums: 'perc', bass: 'bass', chords: 'pad', arp: 'arp', melody: 'lead' };
  const BASE_NAME = { drums: 'Batteur', bass: 'Bassiste', chords: 'Clavier nappe', arp: 'Clavier arpège', melody: 'Clavier lead' };
  const CAT_OF_TYPE = { bass: 'mono', chords: 'chord', arp: 'arp', melody: 'mono' };
  /** Type d'un rôle de l'inspiration (null : « fx », sans type). */
  const TYPE_OF_ROLE = { drums: 'drums', perc: 'drums', bass: 'bass', pad: 'chords', strings: 'chords', keys: 'chords', guitar: 'chords', arp: 'arp', arpchord: 'arp', lead: 'melody', vox: 'melody', sax: 'melody' };
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
    const pref = { bass: ['bass'], chords: ['pad', 'keys', 'strings', 'guitar'], arp: ['arp'], melody: ['lead', 'vox', 'sax'] }[kind];
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
    ['melPanel', 'plans', 'pseeds', 'chars'].forEach((f) => Object.keys(w[f] || {}).forEach((k) => [...set].some((x) => k.startsWith(x + '|')) && delete w[f][k]));
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

  return { MIN, MAX, TYPES, ROLE_OF_TYPE, BASE_NAME, CAT_OF_TYPE, typeOfRole, isExtraId, freeName, stripNum, copyName, defaultGroup, fromV1, recommended, find, canAdd, canRemove, add, remove, move, moveTo, rename, insertAfter, newId, rebase, purge, clean, clone };
})();
