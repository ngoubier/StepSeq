/*
 * Profils de la console : réglages de tranche (EQ, compresseur, limiteur, sidechain) ou de Master,
 * à appliquer à la demande.
 *  - profils d'usine : SS.FACTORY_PROFILES (+ « à plat » / « Master d'origine »)
 *  - mes profils : enregistrés dans ce navigateur (localStorage), exportables / importables en fichier
 */
window.SS = window.SS || {};

SS.profiles = (() => {
  const KEY = 'stepseq.mixProfiles';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function builtins() {
    return [
      {
        id: 'f_flat',
        name: 'Tranche à plat',
        desc: 'EQ, compresseur et limiteur désactivés.',
        kind: 'channel',
        factory: true,
        mix: clone({ eq: SS.MIX_DEFAULTS.eq, comp: SS.MIX_DEFAULTS.comp, lim: SS.MIX_DEFAULTS.lim }),
      },
      ...(SS.FACTORY_PROFILES || []),
      {
        id: 'f_master_default',
        name: 'Master d’origine (sécurité)',
        desc: 'Le réglage par défaut de StepSeq : compresseur doux et limiteur à −0,3 dB.',
        kind: 'master',
        factory: true,
        volume: SS.MASTER_DEFAULTS.volume,
        mix: clone({ eq: SS.MASTER_DEFAULTS.mix.eq, comp: SS.MASTER_DEFAULTS.mix.comp, lim: SS.MASTER_DEFAULTS.mix.lim }),
      },
    ];
  }

  function loadUser() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.filter(valid) : [];
    } catch (e) {
      return [];
    }
  }
  function saveUser(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }
  const valid = (p) => p && typeof p === 'object' && typeof p.name === 'string' && (p.kind === 'channel' || p.kind === 'master') && p.mix && typeof p.mix === 'object';

  /** Tous les profils d'un type : { factory: [...], user: [...] } */
  function list(kind) {
    return { factory: builtins().filter((p) => p.kind === kind), user: loadUser().filter((p) => p.kind === kind) };
  }
  const find = (id) => builtins().concat(loadUser()).find((p) => p.id === id);

  /** Enregistre (ou remplace, à nom égal) un profil personnel. */
  function save(kind, name, data) {
    const all = loadUser();
    const existing = all.find((p) => p.kind === kind && p.name.toLowerCase() === name.toLowerCase());
    const p = { id: existing ? existing.id : 'u_' + SS.uid(), name, kind, ...clone(data) };
    const out = existing ? all.map((x) => (x === existing ? p : x)) : all.concat(p);
    return saveUser(out) ? p : null;
  }
  function remove(id) {
    return saveUser(loadUser().filter((p) => p.id !== id));
  }

  function exportJson() {
    return JSON.stringify({ format: 'stepseq-profiles', version: 1, profiles: loadUser() }, null, 1);
  }
  /** Ajoute les profils d'un fichier exporté ; retourne le nombre importé. */
  function importJson(text) {
    const data = JSON.parse(text);
    const incoming = (Array.isArray(data) ? data : data.profiles || []).filter(valid);
    const all = loadUser();
    incoming.forEach((p) => {
      const clean = { id: 'u_' + SS.uid(), name: p.name.slice(0, 60), kind: p.kind, mix: SS.cleanMix(p.mix, p.kind === 'master' ? SS.MASTER_DEFAULTS.mix : SS.MIX_DEFAULTS) };
      if (p.kind === 'master' && Number.isFinite(p.volume)) clean.volume = Math.min(2, Math.max(0, p.volume));
      if (p.sc && Number.isFinite(p.sc.depth)) clean.sc = { depth: Math.min(1, Math.max(0, p.sc.depth)), release: Math.min(1, Math.max(0.03, p.sc.release || 0.2)) };
      const i = all.findIndex((x) => x.kind === clean.kind && x.name === clean.name);
      if (i >= 0) all[i] = { ...clean, id: all[i].id };
      else all.push(clean);
    });
    saveUser(all);
    return incoming.length;
  }

  return { list, find, save, remove, exportJson, importJson };
})();
