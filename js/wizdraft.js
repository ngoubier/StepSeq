/*
 * Brouillon de l'assistant « Nouvelle chanson » : mise en forme JSON de son état, sans navigateur (js/band.js l'utilise).
 *
 * project.wizard = { v, savedAt, createdAt?, state } : le travail de l'assistant est rangé dans le projet, sans créer de piste.
 * pack(src) : l'état vivant (Sets, Maps, objets partagés) devient un JSON autonome (copie profonde, sans objets audio ni caches) ;
 * unpack(state) : l'inverse, avec des valeurs par défaut pour tout champ manquant ou de mauvais type, et null si le brouillon
 * est inutilisable (autre version, pas un objet). Que l'inspiration existe encore, c'est à band.js d'en juger.
 */
window.SS = window.SS || {};
SS.wizDraft = (() => {
  const VERSION = 4; // 4 : l'étape « Arrangement » (arr) a décalé Effets, Mix et Intégration ; 3 : l'étape « Effets et transitions » (fx) a décalé Mix et Intégration (band.js renumérote un brouillon plus ancien) ; 2 : le groupe (liste de musiciens, js/bandgroup.js) ; un brouillon v1 est migré par band.js (musiciens « dans le groupe »)
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const str = (x, d = null) => (typeof x === 'string' && x.length < 200 ? x : d);
  const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const obj = (x) => (isObj(x) ? clone(x) : {});
  const objOrNull = (x) => (isObj(x) ? clone(x) : null);
  const list = (x) => (Array.isArray(x) ? x : []);

  /** Champs de S.wiz rangés tels quels (objets), puis les ensembles et le Map. */
  const OBJ = ['plans', 'pseeds', 'keys', 'grids', 'peds', 'emos', 'chars', 'parts', 'kinds', 'melPanel', 'secs', 'accView', 'groove', 'fx', 'arr'];
  const SETS = ['seen', 'off', 'mute', 'solo'];

  /** src : { mode, styleId, presetId, cover, group, gridInst (instruments repris de la grille), cache, hide: Set, mel, accOpen, tracksOpen, w: S.wiz } */
  function pack(src) {
    const w = src.w || {};
    const o = {
      mode: src.mode === 'cover' ? 'cover' : 'create',
      styleId: src.styleId || null,
      presetId: src.presetId || null,
      cover: clone(src.cover || null),
      group: clone(src.group || null),
      gridInst: clone(src.gridInst || null),
      cache: clone(src.cache || {}),
      hide: [...(src.hide || [])],
      mel: clone(src.mel || null),
      accOpen: !!src.accOpen,
      tracksOpen: !!src.tracksOpen,
      w: {
        step: w.step,
        seed: w.seed,
        vol: [...(w.vol || [])].filter(([, v]) => v),
        mix: clone(w.mix || null),
        mixScope: w.mixScope,
        mixOpen: w.mixOpen || null,
        mixTab: w.mixTab,
        hscene: w.hscene || null,
        hsec: w.hsec || null,
        tempo: w.tempo || null,
        tempoFor: w.tempoFor || null,
        form: clone(w.form || null),
        skey: clone(w.skey || null),
        snap: w.snap,
        gsel: w.gsel == null ? null : w.gsel,
        efilter: w.efilter || 0,
        fresh: !!w.fresh,
        melSec: w.melSec || null,
      },
    };
    SETS.forEach((k) => (o.w[k] = [...(w[k] || [])]));
    OBJ.forEach((k) => (o.w[k] = clone(w[k] || {})));
    return JSON.parse(JSON.stringify(o)); // undefined et fonctions disparaissent
  }

  /** state (JSON) → { mode, styleId, presetId, cover, group, cache, hide: Set, mel, accOpen, tracksOpen, w } ou null. */
  function unpack(state) {
    if (!isObj(state)) return null;
    const x = state;
    const w = isObj(x.w) ? x.w : {};
    const out = {
      mode: x.mode === 'cover' ? 'cover' : 'create',
      styleId: str(x.styleId),
      presetId: str(x.presetId),
      cover: objOrNull(x.cover),
      group: objOrNull(x.group),
      gridInst: Array.isArray(x.gridInst) && x.gridInst.length ? clone(x.gridInst).filter(isObj) : null,
      cache: obj(x.cache),
      hide: new Set(list(x.hide).filter((v) => typeof v === 'string')),
      mel: objOrNull(x.mel),
      accOpen: !!x.accOpen,
      tracksOpen: !!x.tracksOpen,
      w: {
        step: Math.max(1, Math.round(num(w.step, 1))),
        seed: num(w.seed, 0),
        vol: new Map(list(w.vol).filter((e) => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number' && Number.isFinite(e[1]))),
        mix: objOrNull(w.mix),
        mixScope: str(w.mixScope, 'song'),
        mixOpen: str(w.mixOpen),
        mixTab: str(w.mixTab, 'eq'),
        hscene: str(w.hscene),
        hsec: str(w.hsec),
        tempo: num(w.tempo, null),
        tempoFor: str(w.tempoFor),
        form: Array.isArray(w.form) ? clone(w.form) : null,
        skey: objOrNull(w.skey),
        snap: str(w.snap, 'beat'),
        gsel: Number.isInteger(w.gsel) ? w.gsel : null,
        efilter: num(w.efilter, 0),
        fresh: !!w.fresh,
        melSec: str(w.melSec),
      },
    };
    SETS.forEach((k) => (out.w[k] = new Set(list(w[k]).filter((v) => typeof v === 'string' || typeof v === 'number'))));
    OBJ.forEach((k) => (out.w[k] = obj(w[k])));
    // panneau « Accents » : seulement les états connus (ouvert, replié)
    out.w.groove = Object.fromEntries(Object.entries(out.w.groove).filter(([k, v]) => (k === 'swing' || k === 'human') && typeof v === 'number' && v >= 0 && v <= 100)); // groove de la chanson : swing et humanisation en %
    out.w.accView = Object.fromEntries(Object.entries(out.w.accView).filter(([k, v]) => typeof k === 'string' && (v === 'open' || v === 'fold')));
    if (!out.w.seen.size) out.w.seen.add(out.w.step);
    return out;
  }

  /** L'enveloppe du projet (project.wizard) : version connue, état objet ; sinon null (le brouillon est ignoré). */
  function clean(d) {
    if (!isObj(d) || !isObj(d.state)) return null;
    const v = Math.round(num(d.v, 1));
    if (v < 1 || v > VERSION) return null;
    const o = { v, savedAt: num(d.savedAt, 0), state: clone(d.state) };
    if (typeof d.createdAt === 'number' && Number.isFinite(d.createdAt)) o.createdAt = d.createdAt;
    if (typeof d.builtSig === 'string' && d.builtSig.length < 40) o.builtSig = d.builtSig;
    return o;
  }

  /* ---------- Ce qui est dans la grille, et ce qui ne l'est pas encore ----------
   * contentSig(state) : empreinte de ce qui fait la chanson (accords, parties, sons, mix…), sans l'état de navigation
   * (étape, scène affichée, onglets, écoute en solo…) : changer d'étape ne rend pas la grille « en retard ».
   * « Créer la chanson » la range dans le brouillon (builtSig) ; pending(d) : la grille n'a pas (ou plus) la chanson
   * de l'assistant (jamais créée, ou retouchée dans l'assistant depuis). */
  const NAV_W = ['step', 'seen', 'hscene', 'hsec', 'mixOpen', 'mixTab', 'mixScope', 'gsel', 'efilter', 'melSec', 'snap', 'fresh', 'mute', 'solo', 'accView'];
  const NAV = ['accOpen', 'tracksOpen', 'hide'];
  function contentSig(state) {
    if (!isObj(state)) return '';
    const o = { ...state, w: { ...(state.w || {}) } };
    NAV.forEach((k) => delete o[k]);
    NAV_W.forEach((k) => delete o.w[k]);
    const txt = JSON.stringify(o);
    let a = 5381;
    let b = 52711;
    for (let i = 0; i < txt.length; i++) {
      const c = txt.charCodeAt(i);
      a = (Math.imul(a, 33) ^ c) >>> 0;
      b = (Math.imul(b, 31) ^ c) >>> 0;
    }
    return a.toString(36) + b.toString(36) + ':' + txt.length.toString(36);
  }
  const pending = (d) => !!d && (!d.createdAt || !d.builtSig || contentSig(d.state) !== d.builtSig);

  return { VERSION, pack, unpack, clean, contentSig, pending };
})();
