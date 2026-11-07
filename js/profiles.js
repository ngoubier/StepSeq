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
      ...(SS.FACTORY_MIXSETS || []),
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
  const valid = (p) =>
    p && typeof p === 'object' && typeof p.name === 'string' &&
    (((p.kind === 'channel' || p.kind === 'master') && p.mix && typeof p.mix === 'object') ||
      (p.kind === 'mixset' && p.roles && typeof p.roles === 'object'));

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
      if (p.kind === 'mixset') {
        const roles = {};
        for (const [r, e] of Object.entries(p.roles)) if (ROLES[r] && e && e.mix) roles[r] = cleanRole(e);
        const clean = { id: 'u_' + SS.uid(), name: p.name.slice(0, 60), kind: 'mixset', roles };
        if (p.master && p.master.mix) clean.master = { mix: SS.cleanMix(p.master.mix, SS.MASTER_DEFAULTS.mix), volume: Number.isFinite(p.master.volume) ? p.master.volume : 1 };
        const i = all.findIndex((x) => x.kind === 'mixset' && x.name === clean.name);
        if (i >= 0) all[i] = { ...clean, id: all[i].id };
        else all.push(clean);
        return;
      }
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

  /* ---------------- Profils multi-tranches : rôles des pistes ---------------- */
  const ROLES = {
    kick: 'Kick', snare: 'Caisse claire', clap: 'Clap', hat: 'Hi-hat', ohat: 'Open hat', tom: 'Toms', cymbal: 'Cymbales',
    perc: 'Percussions', bass: 'Basse', pad: 'Nappe', arp: 'Arpège', lead: 'Lead', keys: 'Claviers',
  };
  const DRUM_ROLE = { bd: 'kick', sd: 'snare', cp: 'clap', hh: 'hat', oh: 'ohat', lt: 'tom', mt: 'tom', ht: 'tom', cr: 'cymbal', rd: 'cymbal' };

  /** Rôle d'une piste, déduit de son son (batterie) ou de sa famille / catégorie (instrument). */
  function roleOf(t) {
    if (t.type === 'drum') {
      if (!t.source || t.source === 'tdm') return DRUM_ROLE[t.sound] || 'perc';
      const b = String(t.bank || '').toLowerCase();
      if (/(^|[^a-z])(bd|kick|bassdrum)|bd$|kick/.test(b)) return 'kick';
      if (/sn|sd|snare/.test(b)) return 'snare';
      if (/cp|clap/.test(b)) return 'clap';
      if (/oh|open/.test(b)) return 'ohat';
      if (/hh|hat/.test(b)) return 'hat';
      if (/tom|lt|mt|ht/.test(b)) return 'tom';
      if (/cr|cy|ride|cymbal|clash|gong/.test(b)) return 'cymbal';
      return 'perc';
    }
    if (t.family === 'bass') return 'bass';
    if (t.category === 'arp') return 'arp';
    if (['pads', 'strings', 'voices'].includes(t.family) || t.category === 'chord') return 'pad';
    if (['synth', 'brass', 'winds'].includes(t.family)) return 'lead';
    return 'keys';
  }

  const cleanRole = (e) => {
    const out = { mix: SS.cleanMix(e.mix) };
    if (Number.isFinite(e.volume)) out.volume = Math.min(2, Math.max(0, e.volume));
    if (Number.isFinite(e.pan)) out.pan = Math.min(1, Math.max(-1, e.pan));
    if (e.sc && Number.isFinite(e.sc.depth)) out.sc = { depth: Math.min(1, Math.max(0, e.sc.depth)), release: Math.min(1, Math.max(0.03, e.sc.release || 0.2)) };
    return out;
  };

  /** Enregistre le mixage du projet comme profil multi-tranches (premier réglage trouvé par rôle). */
  function saveMixset(name, project) {
    const roles = {};
    project.tracks.forEach((t) => {
      const r = roleOf(t);
      if (roles[r]) return;
      const m = SS.mixParams(t);
      const e = { mix: { eq: m.eq, comp: m.comp, lim: m.lim }, volume: t.volume, pan: m.pan };
      const f = SS.fxParams(t);
      if (f.scSource && f.scDepth > 0) e.sc = { depth: f.scDepth, release: f.scRelease };
      roles[r] = e;
    });
    const mp = SS.masterParams(project);
    return save('mixset', name, { roles, master: { mix: { eq: mp.mix.eq, comp: mp.mix.comp, lim: mp.mix.lim }, volume: mp.volume } });
  }

  return { list, find, save, remove, exportJson, importJson, roleOf, ROLES, saveMixset };
})();
