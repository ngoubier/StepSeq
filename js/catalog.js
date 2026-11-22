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
    { id: 'ambient', label: 'Ambient', color: '#6fe3c8', families: ['ambient'] },
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
    amb: { label: 'Moteur Ambient', color: '#6fe3c8' },
  };
  const SOURCE_ORDER = ['syn', 'smp', 'dirt', 'gm', 'juno', 'amb'];

  const roleOfFamily = (fam) => FAMILY_ROLE[fam] || 'synth';
  const roleOfJuno = (patch) => JUNO_ROLE[patch] || 'synth';
  /** Source d'un instrument du catalogue. */
  function sourceOf(inst) {
    if (inst.kind === 'synth') return 'syn';
    if (inst.kind === 'ambient') return 'amb';
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
    const e = { v: `i:${fam.id}:${inst.id}`, name: frName(name), orig: name, src, detail: detail || (src === 'gm' && inst.midi != null ? `programme ${inst.midi + 1}` : ''), title: inst.strudel ? `strudel : s("${inst.strudel}")` : null };
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
  const junoEntry = (p) => ({ v: `j:${p.id}`, name: frName(p.name), orig: p.name, src: 'juno', detail: `patch ${p.id}` });
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
        entries: soundsOf(r.id, opts).filter((e) => `${e.name} ${e.orig || ''} ${e.detail} ${e.v} ${e.title || ''} ${e.song || ''} ${e.artist || ''} ${e.desc || ''} ${e.styles || ''}`.toLowerCase().includes(s) || (opts.gm && e.v === `p${+s - 1}`)),
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


  /* ---------- Noms lisibles en français (échantillons, General MIDI, Juno-106) ---------- */
  /* Le nom d'origine reste cherchable (champ `orig`). */
  const FR = {
    // basses
    'Bass Hits': 'Coups de basse', 'Bass 3': 'Basse 3', 'Bass': 'Basse', 'Bass 0': 'Basse 0', 'Hardcore Bass': 'Basse hardcore', 'Bass DM': 'Basse DM',
    'Bass Foo': 'Basse Foo', 'Jungle Bass': 'Basse jungle', 'Pluck Bass': 'Basse pincée', 'JV Bass': 'Basse JV',
    'Acoustic bass': 'Contrebasse jazz', 'Electric bass finger': 'Basse électrique aux doigts', 'Electric bass pick': 'Basse électrique au médiator',
    'Fretless bass': 'Basse fretless', 'Slap bass 1': 'Basse slap 1', 'Slap bass 2': 'Basse slap 2', 'Synth bass 1': 'Basse synthé 1', 'Synth bass 2': 'Basse synthé 2',
    'Synth Bass I': 'Basse synthé I', 'Synth Bass II': 'Basse synthé II', 'Bass Pluck': 'Basse pincée', 'OW Bass': 'Basse OW', 'Meow Bass': 'Basse miaou',
    // claviers
    'Piano1': 'Piano brillant', 'Fmpiano': 'Piano FM', 'Steinway grand piano': 'Piano à queue Steinway', 'Kawai grand piano': 'Piano à queue Kawai',
    'Epiano1': 'Piano électrique 1', 'Epiano2': 'Piano électrique 2', 'Harpsichord': 'Clavecin', 'Elect. Piano I': 'Piano électrique I',
    'Elect. Piano II': 'Piano électrique II', 'Clav.': 'Clavinet', 'Clav': 'Clavinet 2', 'Dark Synth Piano': 'Piano synthé sombre',
    'Harpsichord I': 'Clavecin I', 'Harpsichord 2': 'Clavecin II', 'E. Piano with Tremolo': 'Piano électrique trémolo', 'Toy Rhodes': 'Rhodes jouet',
    // orgues
    'Organ full': 'Orgue plein', 'Organ 4inch': 'Orgue 4 pieds', 'Organ 8inch': 'Orgue 8 pieds', 'Pipeorgan loud': 'Orgue à tuyaux fort',
    'Pipeorgan quiet': 'Orgue à tuyaux doux', 'Pipeorgan loud pedal': 'Pédalier d’orgue fort', 'Pipeorgan quiet pedal': 'Pédalier d’orgue doux',
    'Harmonica soft': 'Harmonica doux', 'Harmonica vib': 'Harmonica vibrato', 'Super64': 'Harmonica chromatique', 'Super64 acc': 'Harmonica chromatique, accords',
    'Super64 vib': 'Harmonica chromatique vibrato', 'Drawbar organ': 'Orgue à tirettes', 'Percussive organ': 'Orgue percussif', 'Rock organ': 'Orgue rock',
    'Church organ': 'Orgue d’église', 'Reed organ': 'Harmonium', 'Accordion': 'Accordéon', 'Bandoneon': 'Bandonéon', 'Organ I': 'Orgue I', 'Organ II': 'Orgue II',
    'Organ 2': 'Orgue 2', 'Combo Organ': 'Orgue combo', 'Calliope': 'Orgue à vapeur', 'Frontier Organ': 'Orgue western', 'Reedy Organ': 'Orgue anché',
    'Brassy Organ': 'Orgue cuivré', 'Owgan': 'Orgue wah',
    // guitares
    'Acoustic guitar nylon': 'Guitare classique (nylon)', 'Acoustic guitar steel': 'Guitare folk (acier)', 'Electric guitar jazz': 'Guitare électrique jazz',
    'Electric guitar clean': 'Guitare électrique claire', 'Electric guitar muted': 'Guitare électrique étouffée', 'Overdriven guitar': 'Guitare saturée',
    'Distortion guitar': 'Guitare distorsion', 'Guitar harmonics': 'Harmoniques de guitare', 'Guitar': 'Guitare synthé', 'Nylon Guitar': 'Guitare nylon synthé',
    // cordes
    'Harp': 'Harpe', 'Folkharp': 'Harpe celtique', 'Strumstick': 'Strumstick (dulcimer)', 'Dantranh': 'Đàn tranh (cithare)', 'Dantranh tremolo': 'Đàn tranh trémolo',
    'Dantranh vibrato': 'Đàn tranh vibrato', 'Psaltery pluck': 'Psaltérion pincé', 'Psaltery spiccato': 'Psaltérion spiccato', 'Psaltery bowed': 'Psaltérion à l’archet',
    'Violin': 'Violon', 'Viola': 'Alto', 'Cello': 'Violoncelle', 'Contrabass': 'Contrebasse', 'Tremolo strings': 'Cordes en trémolo', 'Pizzicato strings': 'Cordes en pizzicato',
    'Orchestral harp': 'Harpe d’orchestre', 'Timpani': 'Timbales', 'String ensemble 1': 'Ensemble de cordes 1', 'String ensemble 2': 'Ensemble de cordes 2',
    'Synth strings 1': 'Cordes synthé 1', 'Synth strings 2': 'Cordes synthé 2', 'Moving Strings': 'Cordes synthé en mouvement', 'Strings III': 'Cordes synthé III',
    'High Strings': 'Cordes synthé aiguës', 'Strings': 'Cordes synthé', 'Dark Ensemble': 'Ensemble synthé sombre', 'Phase Ensemble': 'Ensemble synthé phasé',
    'Violin high': 'Violon synthé aigu', 'Low Dark Strings': 'Cordes synthé graves', 'Pizzicato': 'Pizzicato synthé',
    // cuivres
    'Trumpet': 'Trompette', 'Muted trumpet': 'Trompette bouchée', 'French horn': 'Cor d’harmonie', 'Brass section': 'Section de cuivres',
    'Synth brass 1': 'Cuivres synthé 1', 'Synth brass 2': 'Cuivres synthé 2', 'Brass': 'Cuivres synthé', 'Brass Swell': 'Cuivres synthé qui enflent',
    'Brass & Strings': 'Cuivres et cordes synthé', 'Brass III': 'Cuivres synthé III', 'Fanfare': 'Fanfare synthé', 'Brass Ensemble': 'Ensemble de cuivres synthé',
    'Piccolo Trumpet': 'Trompette piccolo synthé',
    // bois
    'Sax stacc': 'Sax staccato', 'Sax vib': 'Sax vibrato', 'Saxello stacc': 'Saxello staccato', 'Saxello vib': 'Saxello vibrato',
    'Recorder soprano sus': 'Flûte à bec soprano', 'Recorder soprano stacc': 'Flûte à bec soprano staccato', 'Recorder alto sus': 'Flûte à bec alto',
    'Recorder alto stacc': 'Flûte à bec alto staccato', 'Recorder alto vib': 'Flûte à bec alto vibrato', 'Recorder tenor sus': 'Flûte à bec ténor',
    'Recorder tenor stacc': 'Flûte à bec ténor staccato', 'Recorder tenor vib': 'Flûte à bec ténor vibrato', 'Recorder bass sus': 'Flûte à bec basse',
    'Recorder bass stacc': 'Flûte à bec basse staccato', 'Recorder bass vib': 'Flûte à bec basse vibrato', 'Ocarina vib': 'Ocarina vibrato',
    'Ocarina small': 'Petit ocarina', 'Ocarina small stacc': 'Petit ocarina staccato', 'Soprano sax': 'Sax soprano', 'Alto sax': 'Sax alto', 'Tenor sax': 'Sax ténor',
    'Baritone sax': 'Sax baryton', 'Oboe': 'Hautbois', 'English horn': 'Cor anglais', 'Bassoon': 'Basson', 'Clarinet': 'Clarinette', 'Flute': 'Flûte',
    'Recorder': 'Flûte à bec', 'Pan flute': 'Flûte de Pan', 'Blown bottle': 'Bouteille soufflée', 'Whistle': 'Sifflet', 'Flutes': 'Flûtes synthé',
    'Bass Clarinet': 'Clarinette basse synthé', 'English Horn': 'Cor anglais synthé', 'Sharp Reed': 'Anche vive synthé', 'Flute - Horn': 'Flûte et cor synthé',
    // voix
    'Choir aahs': 'Chœur « aah »', 'Voice oohs': 'Voix « ooh »', 'Synth choir': 'Chœur synthé', 'Orchestra hit': 'Coup d’orchestre', 'Choir': 'Chœur synthé Juno',
    // nappes
    'Pads': 'Nappes', 'Pad long': 'Nappe longue', 'Pad new age': 'Nappe new age', 'Pad warm': 'Nappe chaude GM', 'Pad poly': 'Nappe polysynth',
    'Pad choir': 'Nappe chœur', 'Pad bowed': 'Nappe à l’archet', 'Pad metallic': 'Nappe métallique', 'Pad halo': 'Nappe halo', 'Pad sweep': 'Nappe balayée',
    'Synth Pad': 'Nappe synthé', 'Sweep I': 'Nappe balayée I', 'Sweep II': 'Nappe balayée II', 'Sustainer': 'Nappe tenue', 'Caverns': 'Cavernes',
    'Orchestral Pad': 'Nappe orchestrale', 'Ethereal': 'Nappe éthérée',
    // mallets
    'Xylophone medium ff': 'Xylophone moyen fort', 'Xylophone medium pp': 'Xylophone moyen doux', 'Xylophone hard ff': 'Xylophone dur fort',
    'Xylophone hard pp': 'Xylophone dur doux', 'Xylophone soft ff': 'Xylophone feutré fort', 'Xylophone soft pp': 'Xylophone feutré doux',
    'Vibraphone soft': 'Vibraphone doux', 'Vibraphone bowed': 'Vibraphone à l’archet', 'Tubularbells': 'Cloches tubulaires', 'Tubularbells2': 'Cloches tubulaires 2',
    'Handchimes': 'Cloches à main', 'Belltree': 'Arbre à cloches', 'Balafon hard': 'Balafon dur', 'Balafon soft': 'Balafon doux', 'Wineglass': 'Verres en cristal',
    'Wineglass slow': 'Verres en cristal lents', 'Celesta': 'Célesta', 'Music box': 'Boîte à musique', 'Tubular bells': 'Cloches tubulaires',
    'Dulcimer': 'Tympanon', 'Celeste': 'Célesta synthé', 'Clock Chimes': 'Carillon d’horloge', 'Pluck Bell': 'Cloche pincée', 'Chorus Vibes': 'Vibraphone chorus',
    'Space Chimes': 'Carillon spatial', 'Organ Bell': 'Cloche d’orgue', 'Chorused Bell': 'Cloche chorus', 'Chorus Bell 2': 'Cloche chorus 2',
    'Melodic Taps': 'Frappes mélodiques', 'High Bells': 'Cloches aiguës', 'Ping Bell': 'Cloche ping',
    // percussions mélodiques
    'Tinkle bell': 'Clochette', 'Steel drums': 'Steel drum', 'Woodblock': 'Wood-block', 'Taiko drum': 'Taiko', 'Melodic tom': 'Tom mélodique',
    'Synth drum': 'Tambour synthé', 'Reverse cymbal': 'Cymbale inversée', 'Steel Drums': 'Steel drum synthé', 'Snare Drum': 'Caisse claire synthé',
    'Tom Toms': 'Toms synthé', 'Shaker': 'Shaker synthé', 'Gong': 'Gong synthé', 'Drum Booms': 'Boums synthé', 'Hand Claps': 'Claps synthé',
    // monde
    'Bagpipe': 'Cornemuse', 'Fiddle': 'Violon folk', 'Shanai': 'Shehnai', 'Lute': 'Luth synthé',
    // effets
    'Fx rain': 'Pluie', 'Fx soundtrack': 'Bande originale', 'Fx crystal': 'Cristal', 'Fx atmosphere': 'Atmosphère', 'Fx brightness': 'Brillance',
    'Fx goblins': 'Gobelins', 'Fx echoes': 'Échos', 'Fx sci fi': 'Science-fiction', 'Guitar fret noise': 'Bruit de frettes', 'Breath noise': 'Souffle',
    'Seashore': 'Bord de mer', 'Bird tweet': 'Oiseaux', 'Telephone': 'Téléphone', 'Helicopter': 'Hélicoptère', 'Applause': 'Applaudissements',
    'Gunshot': 'Coup de feu', 'Going Up': 'Montée', 'Dust Storm': 'Tempête de sable', 'Rocket Men': 'Fusée', 'FX Sweep': 'Balayage', 'Noise Sweep': 'Balayage de bruit',
    'FX Rise 1': 'Montée 1', 'FX Rise 2': 'Montée 2', 'FX Sweep 1': 'Balayage 1', 'Resonant Rise': 'Montée résonante', 'Noise Sweep 2': 'Balayage de bruit 2',
    'Auto Release Noise Sweep': 'Balayage de bruit auto', 'Thunder': 'Tonnerre', 'Forbidden Planet': 'Planète interdite',
    'Wind': 'Vent', 'Rumble': 'Grondement', 'Noise Riser': 'Montée de bruit',
  };
  const frName = (n) => FR[n] || n;

  /* ---------- Familles : 2e colonne de la fenêtre, pour s'y retrouver dans un rôle ---------- */
  /* Chaque famille : { id, label, test(e, nom en minuscules) } ; la première qui répond l'emporte ; `rest` : famille des autres. */
  const fam = (id, label, re, src) => ({ id, label, test: (e, n) => (src && src.includes(e.src)) || (re && re.test(n)) });
  const FAMILIES = {
    bass: { list: [fam('elec', 'Électriques & acoustiques', /électrique|fretless|slap|contrebasse|aux doigts|médiator|electric|acoustic/), fam('sub', 'Sub & 808', /\bsub\b|808/), fam('acid', 'Acid & 303', /acid|acide|303/)], rest: { id: 'syn', label: 'Basses synthé' } },
    keys: { list: [fam('epiano', 'Pianos électriques', /électrique|rhodes|piano fm|electric piano/), fam('clavecin', 'Clavecins', /clavecin|harpsichord/), fam('clavinet', 'Clavinets', /clavinet|clavi\b/), fam('orgue', 'Orgues', /orgue|organ/), fam('synpiano', 'Pianos synthé', /clavisynth|synthé sombre/)], rest: { id: 'piano', label: 'Pianos acoustiques' } },
    organ: { list: [fam('harmonica', 'Harmonicas', /harmonica/), fam('accordeon', 'Accordéons', /accordéon|bandonéon|accordion|bandoneon/), fam('eglise', 'Orgues d’église', /église|tuyaux|pédalier|harmonium|church|reed organ/)], rest: { id: 'orgue', label: 'Orgues' } },
    guitar: { list: [fam('elec', 'Guitares électriques', /électrique|saturée|distorsion|electric|overdriven|distortion/), fam('syn', 'Guitares synthé', null, ['juno'])], rest: { id: 'acou', label: 'Guitares acoustiques' } },
    strings: { list: [fam('syn', 'Cordes synthé', /synthé|synth/, ['juno']), fam('harpe', 'Harpes & cordes pincées', /harpe|psaltérion|strumstick|tranh|harp/), fam('pizz', 'Pizzicato & trémolo', /pizz|trémolo|tremolo/), fam('ens', 'Ensembles', /^violons|^altos|^violoncelles|ensemble/), fam('solo', 'Solistes', /violon|alto|violoncelle|contrebasse|violin|viola|cello|contrabass/)], rest: { id: 'autres', label: 'Autres' }, order: ['ens', 'solo', 'pizz', 'harpe', 'syn', 'autres'] },
    brass: { list: [fam('syn', 'Cuivres synthé', /synthé|synth|stab|sem|\bob\b|80s|new wave|enflent|refrain|épique|funky/, ['syn', 'juno']), fam('trompette', 'Trompettes', /trompette|trumpet/), fam('cor', 'Cors', /\bcor\b|cor d|french horn/), fam('grave', 'Trombones & tubas', /trombone|tuba/)], rest: { id: 'section', label: 'Sections' }, order: ['trompette', 'cor', 'grave', 'section', 'syn'] },
    winds: { list: [fam('sax', 'Saxophones', /sax/), fam('anches', 'Hautbois, clarinettes, bassons', /hautbois|clarinette|basson|cor anglais|anche|oboe|clarinet|bassoon|english horn/), fam('flutes', 'Flûtes & ocarinas', /flûte|piccolo|ocarina|bouteille|shakuhachi|sifflet|flute|recorder|bottle|whistle/)], rest: { id: 'autres', label: 'Autres' }, order: ['flutes', 'anches', 'sax', 'autres'] },
    pads: { list: [fam('cordes', 'Cordes synthé', /cordes|strings/), fam('choeur', 'Chœurs', /chœur|choir/), fam('atmo', 'Atmosphères', /drone|caverne|éthéré|blizzard|balay|halo|métallique|respire|aérienne/)], rest: { id: 'nappes', label: 'Nappes' } },
    synth: { list: [fam('arp', 'Arpèges & séquences', /arp|séquence|boucle|repeater/), fam('pluck', 'Plucks', /pluck|pincé|stab|kalimba|marimba|harpe|pizz|wah|funk/)], rest: { id: 'lead', label: 'Leads' } },
    mallets: { list: [fam('kalimba', 'Kalimbas & mbiras', /kalimba|mbira|nyunga/), fam('cloches', 'Cloches & carillons', /cloche|carillon|verres|arbre|clochette|bell/), fam('lames', 'Claviers à lames', /marimba|xylophone|vibraphone|balafon|glockenspiel|célesta|boîte à musique|tympanon/)], rest: { id: 'autres', label: 'Autres' }, order: ['lames', 'cloches', 'kalimba', 'autres'] },
    fx: { list: [fam('montee', 'Montées & balayages', /montée|balay|riser|fusée/), fam('ambiance', 'Ambiances', /vent|pluie|mer|tonnerre|tempête|atmosph|grondement|cavern|oiseaux|planète|bande originale|cristal|brillance|échos|science/)], rest: { id: 'bruit', label: 'Bruitages' } },
  };
  /** Famille (id) d'une entrée de son dans son rôle ; les presets du synthé intégré gardent leur sous-groupe. */
  function familyOf(roleId, e) {
    const F = FAMILIES[roleId];
    if (!F) return null;
    if (roleId === 'synth' && e.sub) return e.sub;
    const n = `${e.name} ${e.orig || ''}`.toLowerCase();
    const f = F.list.find((x) => x.test(e, n));
    return f ? f.id : F.rest.id;
  }
  /** Familles d'un rôle qui ont des sons : [{ id, label, n }] dans l'ordre (la famille « reste » en tête quand c'est la principale). */
  function familiesOf(roleId, entries) {
    const F = FAMILIES[roleId];
    if (!F) return [];
    const all = [F.rest, ...F.list];
    if (F.order) all.sort((a, b) => F.order.indexOf(a.id) - F.order.indexOf(b.id));
    const out = all.map((f) => ({ id: f.id, label: f.label, n: entries.filter((e) => familyOf(roleId, e) === f.id).length })).filter((f) => f.n);
    return out.length > 1 ? out : [];
  }

  /* ---------- Batterie : chaque son rangé par élément (kick, snare…), toutes bibliothèques confondues ---------- */
  /* Caractère : ac = acoustique, el = électronique, mx = mélangé. */
  const LIVE_KITS = {
    pop: 'Pop · Pearl Black Pearl', rock: 'Rock · Ludwig Red Zeppelin', ballade: 'Ballade · Blonde Bop', rods: 'Fagots · Blonde Bop HotRod',
    reggae: 'Reggae roots · Blonde Bop accordé', cajon: 'Cajón · Buskman’s Holiday', tama: 'Tama · Forzee', pacific: 'Pacific · BJA', christmas: 'Noël · Christmas',
  };
  const MACHINES = {
    AJKPercusyn: 'AJK Percusyn', AkaiLinn: 'Akai Linn', AkaiMPC60: 'Akai MPC60', AkaiXR10: 'Akai XR10', AlesisHR16: 'Alesis HR-16', AlesisSR16: 'Alesis SR-16',
    BossDR110: 'Boss DR-110', BossDR220: 'Boss DR-220', BossDR55: 'Boss DR-55', BossDR550: 'Boss DR-550', CasioRZ1: 'Casio RZ-1', CasioSK1: 'Casio SK-1',
    CasioVL1: 'Casio VL-1', DoepferMS404: 'Doepfer MS-404', EmuDrumulator: 'E-mu Drumulator', EmuModular: 'E-mu Modular', EmuSP12: 'E-mu SP-12',
    KorgDDM110: 'Korg DDM-110', KorgKPR77: 'Korg KPR-77', KorgKR55: 'Korg KR-55', KorgKRZ: 'Korg KR-Z', KorgM1: 'Korg M1', KorgMinipops: 'Korg Minipops',
    KorgPoly800: 'Korg Poly-800', KorgT3: 'Korg T3', Linn9000: 'Linn 9000', LinnDrum: 'LinnDrum', LinnLM1: 'Linn LM-1', LinnLM2: 'Linn LM-2', MFB512: 'MFB 512',
    MPC1000: 'Akai MPC1000', MoogConcertMateMG1: 'Moog Concertmate MG-1', OberheimDMX: 'Oberheim DMX', RhodesPolaris: 'Rhodes Polaris', RhythmAce: 'Ace Tone Rhythm Ace',
    RolandCompurhythm1000: 'Roland CR-1000', RolandCompurhythm78: 'Roland CR-78', RolandCompurhythm8000: 'Roland CR-8000', RolandD110: 'Roland D-110',
    RolandD70: 'Roland D-70', RolandDDR30: 'Roland DDR-30', RolandJD990: 'Roland JD-990', RolandMC202: 'Roland MC-202', RolandMC303: 'Roland MC-303',
    RolandMT32: 'Roland MT-32', RolandR8: 'Roland R-8', RolandS50: 'Roland S-50', RolandSH09: 'Roland SH-09', RolandSystem100: 'Roland System-100',
    RolandTR505: 'Roland TR-505', RolandTR606: 'Roland TR-606', RolandTR626: 'Roland TR-626', RolandTR707: 'Roland TR-707', RolandTR727: 'Roland TR-727',
    RolandTR808: 'Roland TR-808', RolandTR909: 'Roland TR-909', SakataDPM48: 'Sakata DPM-48', SequentialCircuitsDrumtracks: 'Sequential Drumtraks',
    SequentialCircuitsTom: 'Sequential Tom', SergeModular: 'Serge Modular', SimmonsSDS400: 'Simmons SDS-400', SimmonsSDS5: 'Simmons SDS-5',
    SoundmastersR88: 'Soundmaster R-88', UnivoxMicroRhythmer12: 'Univox Micro-Rhythmer 12', ViscoSpaceDrum: 'Visco Space Drum', XdrumLM8953: 'Xdrum LM-8953',
    YamahaRM50: 'Yamaha RM50', YamahaRX21: 'Yamaha RX21', YamahaRX5: 'Yamaha RX5', YamahaRY30: 'Yamaha RY30', YamahaTG33: 'Yamaha TG33',
  };
  const machineName = (id) => MACHINES[id] || String(id || '').replace(/([a-z])([A-Z])/g, '$1 $2');
  /* Percussions VCSL : [éléments, nom] */
  const VCSL_DRUMS = {
    bassdrum1: ['bd', 'Grosse caisse 1'], bassdrum2: ['bd', 'Grosse caisse 2'], snare_modern: ['sd', 'Caisse claire moderne'], snare_hi: ['sd', 'Caisse claire aiguë'],
    snare_low: ['sd', 'Caisse claire grave'], snare_rim: ['rim', 'Cercle de caisse claire'], clap: ['cp', 'Clap'], hihat: ['hh oh', 'Charleston'],
    tom_stick: ['lt mt ht', 'Tom à la baguette'], tom_mallet: ['lt mt ht', 'Tom à la mailloche'], tom_rim: ['lt mt ht', 'Tom sur le cercle'],
    tom2_stick: ['lt mt ht', 'Tom 2 à la baguette'], tom2_mallet: ['lt mt ht', 'Tom 2 à la mailloche'], tom2_rim: ['lt mt ht', 'Tom 2 sur le cercle'],
    sus_cymbal: ['cr rd', 'Cymbale suspendue'], sus_cymbal2: ['cr rd', 'Cymbale suspendue 2'], clash: ['cr', 'Cymbales frappées'], clash2: ['cr', 'Cymbales frappées 2'],
    fingercymbal: ['misc', 'Cymbalettes'], cowbell: ['cb', 'Cowbell'], agogo: ['cb perc', 'Agogo'], tambourine: ['tb', 'Tambourin'], tambourine2: ['tb', 'Tambourin 2'],
    sleighbells: ['tb misc', 'Grelots'], shaker_large: ['sh', 'Gros shaker'], shaker_small: ['sh', 'Petit shaker'], cabasa: ['sh', 'Cabasa'],
    conga: ['perc', 'Conga'], bongo: ['perc', 'Bongo'], cajon: ['perc', 'Cajón'], darbuka: ['perc', 'Darbouka'], framedrum: ['perc', 'Tambour sur cadre'],
    clave: ['perc', 'Claves'], woodblock: ['perc', 'Wood-block'], guiro: ['perc', 'Guiro'], triangles: ['perc', 'Triangle'], vibraslap: ['perc', 'Vibraslap'],
    slitdrum: ['perc', 'Tambour à fente'], timpani: ['perc', 'Timbales'], timpani2: ['perc', 'Timbales 2'], timpani_roll: ['perc', 'Roulement de timbales'],
    gong: ['misc', 'Gong'], gong2: ['misc', 'Gong 2'], handbells: ['misc', 'Cloches à main'], marktrees: ['misc', 'Carillon (mark tree)'], anvil: ['misc', 'Enclume'],
    brakedrum: ['misc', 'Tambour de frein'], slapstick: ['misc', 'Fouet'], ratchet: ['fx', 'Crécelle'], flexatone: ['fx', 'Flexatone'], oceandrum: ['fx', 'Ocean drum'],
    siren: ['fx', 'Sirène'], trainwhistle: ['fx', 'Sifflet de train'], ballwhistle: ['fx', 'Sifflet à bille'], didgeridoo: ['fx', 'Didgeridoo'],
  };
  /* Banques Dirt-Samples rangées par élément : [éléments, caractère] ; les autres banques vont dans « Divers ». */
  const DIRT_DRUMS = {
    bd: ['bd', 'mx'], '808bd': ['bd', 'el'], clubkick: ['bd', 'el'], hardkick: ['bd', 'el'], kicklinn: ['bd', 'el'], popkick: ['bd', 'el'], reverbkick: ['bd', 'el'],
    sd: ['sd', 'mx'], sn: ['sd', 'mx'], '808sd': ['sd', 'el'], rs: ['rim', 'mx'], cp: ['cp', 'mx'], realclaps: ['cp', 'ac'],
    hh: ['hh', 'mx'], hh27: ['hh', 'el'], linnhats: ['hh', 'el'], ho: ['oh', 'mx'], '808oh': ['oh', 'el'],
    lt: ['lt', 'mx'], '808lt': ['lt', 'el'], mt: ['mt', 'mx'], '808mt': ['mt', 'el'], ht: ['ht', 'mx'], '808ht': ['ht', 'el'],
    cr: ['cr', 'mx'], '808cy': ['cr', 'el'], cb: ['cb', 'mx'], '808hc': ['perc', 'el'], '808mc': ['perc', 'el'], '808lc': ['perc', 'el'],
    perc: ['perc', 'mx'], tabla: ['perc', 'ac'], tabla2: ['perc', 'ac'], tablex: ['perc', 'ac'], hand: ['perc', 'ac'],
    gretsch: ['misc', 'ac'], jazz: ['misc', 'ac'], drum: ['misc', 'mx'], '808': ['misc', 'el'], '909': ['misc', 'el'], dr55: ['misc', 'el'], drumtraks: ['misc', 'el'],
  };
  /* Ordre des bibliothèques dans la liste */
  const DRUM_SRC_ORDER = ['live', 'vcsl', 'gm', 'tdm', 'mrid', 'dirt'];

  /**
   * Sons de batterie d'un élément, toutes bibliothèques : [{ v: 'source|id', src, id, name, detail, char }].
   * `libs` : { tdm: [machines qui ont cet élément], live, vcsl, dirt, mrid: [{ id, count }] } (banques chargées) ;
   * `gm` : seulement les sons General MIDI.
   */
  function drumEntries(el, libs = {}, { gm = false } = {}) {
    const out = [];
    const add = (src, id, name, detail, char) => out.push({ v: `${src}|${id}`, src, id: String(id), name, detail: detail || '', char });
    const D = SS.GM_DRUMS || [];
    if (!gm) {
      (libs.live || []).forEach((b) => {
        const i = b.id.lastIndexOf('_');
        if (b.id.slice(i + 1) === el) add('live', b.id, (LIVE_KITS[b.id.slice(0, i)] || b.id.slice(0, i)).split(' · ')[0], (LIVE_KITS[b.id.slice(0, i)] || '').split(' · ')[1], 'ac');
      });
      (libs.vcsl || []).forEach((b) => {
        const m = VCSL_DRUMS[b.id];
        if (m ? m[0].split(' ').includes(el) : el === 'misc') add('vcsl', b.id, m ? m[1] : b.id.replace(/_/g, ' '), '', 'ac');
      });
    }
    D.filter((d) => d.type === el).forEach((d) => add('gm', d.midi, d.label, `note ${d.midi}`, 'ac'));
    if (!gm) {
      (libs.tdm || []).forEach((m) => add('tdm', m, machineName(m), '', 'el'));
      if (el === 'perc') (libs.mrid || []).forEach((b) => add('mrid', b.id, `Mridangam ${b.id}`, '', 'ac'));
      (libs.dirt || []).forEach((b) => {
        const m = DIRT_DRUMS[b.id];
        if (m ? m[0] === el : el === 'misc') add('dirt', b.id, b.id, `${b.count} son${b.count > 1 ? 's' : ''}`, m ? m[1] : 'mx');
      });
    }
    return out.sort((a, b) => DRUM_SRC_ORDER.indexOf(a.src) - DRUM_SRC_ORDER.indexOf(b.src));
  }

  /** Élément (kick, snare…) d'un réglage de batterie { source, sound, bank }. */
  function drumElementOf(s) {
    const src = s.source || 'tdm';
    if (src === 'tdm') return s.sound || 'bd';
    const bank = String(s.bank || '');
    if (src === 'live') return bank.slice(bank.lastIndexOf('_') + 1) || 'bd';
    if (src === 'gm') return (SS.findGmDrum && (SS.findGmDrum(bank) || {}).type) || 'bd';
    if (src === 'vcsl') return VCSL_DRUMS[bank] ? VCSL_DRUMS[bank][0].split(' ')[0] : 'misc';
    if (src === 'mrid') return 'perc';
    if (src === 'dirt') return DIRT_DRUMS[bank] ? DIRT_DRUMS[bank][0] : 'misc';
    return s.sound || 'bd';
  }
  /** Nom court d'un son de batterie (kit, machine, banque), pour le nom de la piste. */
  function drumSourceName(s) {
    const src = s.source || 'tdm';
    if (src === 'tdm') return machineName(s.machine).replace(/^(Roland|Akai|Boss|Korg|Yamaha|Casio|Alesis|E-mu|Linn|Oberheim|Sequential) /, '');
    const e = drumEntries(drumElementOf(s), { [src]: [{ id: String(s.bank), count: 1 }] }).find((x) => x.src === src && x.id === String(s.bank));
    return e ? e.name : String(s.bank || '').replace(/_/g, ' ');
  }

  SS.catalog = { ROLES, ROLE, SUBS, SOURCES, SOURCE_ORDER, JUNO_ROLE, roleOfFamily, roleOfJuno, roleOfProgram, sourceOf, cleanName, soundsOf, search, valueOf, stateOf, entryOf,
    FR, frName, FAMILIES, familyOf, familiesOf, LIVE_KITS, MACHINES, machineName, VCSL_DRUMS, DIRT_DRUMS, DRUM_SRC_ORDER, drumEntries, drumElementOf, drumSourceName };
})();
