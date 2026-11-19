/*
 * Catalogue des sons rangé par rôle musical, pour la fenêtre « Nouvelle piste » (js/ui.js).
 *
 * On cherche un son par ce qu'il joue (Basse, Cordes, Nappes…) et non par la façon dont il est fabriqué :
 * un rôle réunit les instruments des familles correspondantes (js/sounds.js : synthés intégrés, échantillons VCSL,
 * Dirt-Samples, soundfonts General MIDI) et les patchs d'usine du Juno-106 qui jouent ce rôle (js/juno.js).
 * La batterie (rôle « drums ») garde ses bibliothèques d'échantillons : elle est traitée à part par la fenêtre.
 *
 * Valeur d'une entrée (v), comme dans les listes de la fenêtre :
 *  - « i:<famille>:<instrument> » : un instrument du catalogue (type « instrument ») ;
 *  - « j:<patch> »                : un patch du Juno-106 (type « synth ») ;
 *  - « p<programme> »             : un programme General MIDI (mode General MIDI du projet).
 *
 * Ce fichier ne touche pas au DOM : il est testé sous Node (tests/catalog.test.js).
 */
window.SS = window.SS || {};
(() => {
  /* Rôles, dans l'ordre de la colonne de gauche ; `families` : familles de js/sounds.js rangées dans ce rôle. */
  const ROLES = [
    { id: 'drums', label: 'Batterie', color: '#e3179c', families: [] },
    { id: 'bass', label: 'Basse', color: '#3fcf3f', families: ['bass'] },
    { id: 'keys', label: 'Piano & claviers', color: '#f5c400', families: ['keys'] },
    { id: 'organ', label: 'Orgues & accordéons', color: '#d4a017', families: ['organ'] },
    { id: 'guitar', label: 'Guitares', color: '#ff4d6d', families: ['guitar'] },
    { id: 'strings', label: 'Cordes', color: '#1ea7ff', families: ['strings'] },
    { id: 'brass', label: 'Cuivres', color: '#ff8a3d', families: ['brass'] },
    { id: 'winds', label: 'Bois & vents', color: '#c9a227', families: ['winds'] },
    { id: 'voices', label: 'Voix & chœurs', color: '#c0c0c0', families: ['voices'] },
    { id: 'pads', label: 'Nappes', color: '#4f6bff', families: ['pads'] },
    { id: 'synth', label: 'Synthés lead & plucks', color: '#9b5cff', families: ['synth'] },
    { id: 'mallets', label: 'Cloches & mallets', color: '#13c2a3', families: ['mallets'] },
    { id: 'perc', label: 'Percussions mélodiques', color: '#f08a00', families: ['perc'] },
    { id: 'world', label: 'Instruments du monde', color: '#a0784a', families: ['world'] },
    { id: 'fx', label: 'Effets & ambiances', color: '#7a8a99', families: ['fx'] },
  ];
  const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]));
  const FAMILY_ROLE = {};
  ROLES.forEach((r) => r.families.forEach((f) => (FAMILY_ROLE[f] = r.id)));

  /* Rôle de chacun des 128 patchs d'usine du Juno-106 (d'après leur nom et leur son). */
  const JUNO_GROUPS = {
    brass: 'A11 A12 A13 A16 A34 A35 A43 B31 B55 B82',
    winds: 'A14 A41 A42 B16 B37 B53 B62 B65 B71',
    strings: 'A15 A36 A37 A38 B11 B12 B43 B47 B74 B81 B83 B84',
    voices: 'A17',
    keys: 'A18 A27 A28 A61 A62 A76 B15 B42 B51 B61 B66',
    organ: 'A21 A22 A23 A24 A63 B14 B26 B52 B64 B78 B88',
    mallets: 'A26 A31 A33 A75 B13 B21 B25 B48 B57 B72 B75 B77',
    world: 'A45 B33',
    guitar: 'A44 B22',
    bass: 'A48 A55 B38 B68 B73',
    synth: 'A25 A46 A47 A51 A52 A53 A54 A56 A57 A72 A73 A78 A82 B17 B24 B34 B35 B44 B46 B67 B76 B87',
    pads: 'A68 A71 A74 A77 A88 B23 B56 B58',
    perc: 'A32 A64 A65 A66 A67 A81 A83 A86',
    fx: 'A58 A84 A85 A87 B18 B27 B28 B32 B36 B41 B45 B54 B63 B85 B86',
  };
  const JUNO_ROLE = {};
  Object.entries(JUNO_GROUPS).forEach(([r, ids]) => ids.split(' ').forEach((id) => (JUNO_ROLE[id] = r)));

  /* Sources d'un son : étiquette et couleur (les mêmes que les cartes de l'assistant, js/band.js). */
  const SOURCES = {
    syn: { label: 'Synthé intégré', color: '#9b5cff' },
    smp: { label: 'Échantillons', color: '#e8b04a' },
    dirt: { label: 'Dirt-Samples', color: '#b08a5a' },
    gm: { label: 'General MIDI', color: '#6fa8c9' },
    juno: { label: 'Juno-106', color: '#13c2a3' },
  };
  const SOURCE_ORDER = ['syn', 'smp', 'dirt', 'gm', 'juno'];

  const roleOfFamily = (fam) => FAMILY_ROLE[fam] || 'synth';
  const roleOfJuno = (patch) => JUNO_ROLE[patch] || 'synth';
  /** Source d'un instrument du catalogue. */
  function sourceOf(inst) {
    if (inst.kind === 'synth') return 'syn';
    if (inst.kind === 'sf') return 'gm';
    if (inst.kind === 'dirt' || inst.bank === 'dirt') return 'dirt';
    return 'smp';
  }
  /**
   * Nom et détail lisibles d'un libellé du catalogue : « Moog Bass (synthé, ladder + glide) » -> { name: 'Moog Bass',
   * detail: 'ladder + glide' } ; le nom de la source (synthé, VCSL, Dirt-Samples, strudel) est retiré, l'étiquette le dit.
   */
  function cleanName(label) {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(label || '');
    if (!m) return { name: label || '', detail: '' };
    const detail = m[2].split(',').map((x) => x.trim()).filter((x) => x && !/^(synthé|VCSL|VSCO|Dirt-Samples|strudel)$/i.test(x)).join(', ');
    return { name: m[1], detail };
  }

  const instEntry = (fam, inst) => {
    const { name, detail } = cleanName(inst.label);
    const src = sourceOf(inst);
    const e = { v: `i:${fam.id}:${inst.id}`, name, src, detail: detail || (src === 'gm' && inst.midi != null ? `programme ${inst.midi + 1}` : ''), title: inst.strudel ? `strudel : s("${inst.strudel}")` : null };
    if (inst.kind === 'synth') {
      // presets du synthé intégré : sous-groupe (Leads / Arpèges / Plucks), description, son célèbre
      if (fam.id === 'synth') e.sub = inst.sub || 'lead';
      if (inst.desc) e.desc = inst.desc;
      if (inst.styles) e.styles = inst.styles;
      if (inst.song) Object.assign(e, { song: inst.song, artist: inst.artist, detail: `★ ${inst.song}` });
    }
    return e;
  };
  /* Sous-groupes d'un rôle (seuls les synthés lead & plucks en ont) */
  const SUBS = { synth: [{ id: 'lead', label: 'Leads' }, { id: 'arp', label: 'Arpèges' }, { id: 'pluck', label: 'Plucks' }] };
  const junoEntry = (p) => ({ v: `j:${p.id}`, name: p.name, src: 'juno', detail: `patch ${p.id}` });
  const gmEntry = (k) => ({ v: `p${k}`, name: SS.GM_PROGRAMS[k], src: 'gm', detail: `programme ${k + 1}` });
  /** Rôle d'un programme General MIDI : celui de la famille de son soundfont. */
  const roleOfProgram = (k) => {
    const g = SS.gmInstrumentFor(k);
    return g ? roleOfFamily(g.family) : 'synth';
  };

  /**
   * Sons d'un rôle (hors batterie) : [{ v, name, src, detail, title }]. En mode General MIDI, les 128 programmes
   * rangés par rôle (les synthés et le Juno-106 ne sont pas General MIDI).
   */
  function soundsOf(roleId, { gm = false } = {}) {
    if (roleId === 'drums') return [];
    if (gm) {
      const out = [];
      for (let k = 0; k < 128; k++) if (roleOfProgram(k) === roleId) out.push(gmEntry(k));
      return out;
    }
    const out = [];
    (ROLE[roleId] || { families: [] }).families.forEach((fid) => {
      const fam = SS.findFamily(fid);
      fam.instruments.forEach((inst) => out.push(instEntry(fam, inst)));
    });
    // le Juno-106 après les instruments du catalogue
    (SS.JUNO_PATCHES || []).filter((p) => roleOfJuno(p.id) === roleId).forEach((p) => out.push(junoEntry(p)));
    return out; // ordre du catalogue (synthés intégrés, échantillons, Dirt-Samples, General MIDI), puis le Juno-106
  }

  /** Recherche dans tous les rôles (hors batterie) : [{ role, entries }], dans l'ordre des rôles. */
  function search(q, opts = {}) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    return ROLES.filter((r) => r.id !== 'drums')
      .map((r) => ({
        role: r,
        entries: soundsOf(r.id, opts).filter((e) => `${e.name} ${e.detail} ${e.v} ${e.title || ''} ${e.song || ''} ${e.artist || ''} ${e.desc || ''} ${e.styles || ''}`.toLowerCase().includes(s) || (opts.gm && e.v === `p${+s - 1}`)),
      }))
      .filter((g) => g.entries.length);
  }

  /** Valeur (v) du son décrit par un état de piste, et son rôle. */
  function valueOf(s, { gm = false } = {}) {
    if (s.type === 'drum') return { v: null, role: 'drums' };
    if (s.type === 'synth') return { v: `j:${s.patch}`, role: roleOfJuno(s.patch) };
    if (gm) {
      const m = SS.trackMidi({ type: 'instrument', family: s.family, instrument: s.instrument, sfv: s.sfv });
      if (m) return { v: `p${m.program}`, role: roleOfProgram(m.program) };
    }
    const fam = s.family && SS.findFamily(s.family);
    const famId = fam && fam.instruments.some((i) => i.id === s.instrument) ? fam.id : SS.locateInstrument(s.family, s.instrument).family.id;
    return { v: `i:${famId}:${s.instrument}`, role: roleOfFamily(famId) };
  }

  /** Réglages de piste d'une valeur : { type, family, instrument } ou { type: 'synth', analog, patch }. */
  function stateOf(v) {
    if (v.startsWith('j:')) return { type: 'synth', analog: (SS.ANALOG_SYNTHS[0] || {}).id, patch: v.slice(2) };
    if (/^p\d+$/.test(v)) return { type: 'instrument', ...SS.gmInstrumentFor(+v.slice(1)) };
    const [, family, ...rest] = v.split(':');
    return { type: 'instrument', family, instrument: rest.join(':') };
  }

  /** L'entrée d'une valeur (nom, source, détail), où qu'elle soit rangée. */
  function entryOf(v) {
    if (v.startsWith('j:')) {
      const p = (SS.JUNO_PATCHES || []).find((x) => x.id === v.slice(2));
      return p ? junoEntry(p) : null;
    }
    if (/^p\d+$/.test(v)) return gmEntry(+v.slice(1));
    const st = stateOf(v);
    const { family, inst } = SS.locateInstrument(st.family, st.instrument);
    return instEntry(family, inst);
  }

  SS.catalog = { ROLES, ROLE, SUBS, SOURCES, SOURCE_ORDER, JUNO_ROLE, roleOfFamily, roleOfJuno, roleOfProgram, sourceOf, cleanName, soundsOf, search, valueOf, stateOf, entryOf };
})();
