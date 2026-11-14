/*
 * Band : catalogue des groupes virtuels (styles, inspirations, musiciens, kits de batterie).
 *
 * Chaque style propose 10 « inspirations » (un type de chanson, d'après un titre connu) ; chaque
 * inspiration réunit des musiciens. Un musicien a un rôle (batteur, bassiste, clavier nappe…) et :
 *  - pour un instrumentiste : 6 choix, le premier est l'instrument phare, les 5 suivants les conseillés ;
 *  - pour le batteur / percussionniste : une liste d'éléments (kick, snare…) et 6 kits (le premier = phare).
 *
 * Notation d'un choix d'instrument :
 *  - « j:A48 »          : synthé analogique Roland Juno-106, patch d'usine A48 (piste Synthé) ;
 *  - « syn_moogbass »   : un instrument du catalogue (js/sounds.js), sa famille est retrouvée automatiquement.
 * Notation d'un élément de batterie : un type de SS.DRUM_TYPES (« bd », « sd », « hh »…),
 * éventuellement suivi de « @Machine » pour imposer une boîte à rythmes (« cp@RolandTR909 »).
 *
 * Ce fichier ne touche pas au DOM : il est testé sous Node (tests/band.test.js).
 */
window.SS = window.SS || {};
(() => {
  /* ---------- Rôles ---------- */
  const ROLES = {
    drums: { label: 'Batteur', short: 'Batterie', kind: 'kit', color: '#e3179c', icon: 'drums' },
    perc: { label: 'Percussionniste', short: 'Percu', kind: 'kit', color: '#f08a00', icon: 'perc' },
    bass: { label: 'Bassiste', short: 'Basse', cat: 'mono', color: '#3fcf3f', icon: 'bass', families: ['bass'] },
    pad: { label: 'Clavier nappe', short: 'Nappe', cat: 'chord', color: '#4f6bff', icon: 'pad', families: ['pads', 'strings', 'voices'] },
    arp: { label: 'Clavier arpège', short: 'Arpège', cat: 'arp', color: '#13c2a3', icon: 'arp', families: ['synth', 'mallets', 'keys'] },
    lead: { label: 'Clavier lead', short: 'Lead', cat: 'mono', color: '#9b5cff', icon: 'lead', families: ['synth', 'winds', 'brass'] },
    keys: { label: 'Pianiste', short: 'Piano', cat: 'chord', color: '#f5c400', icon: 'keys', families: ['keys', 'organ'] },
    guitar: { label: 'Guitariste', short: 'Guitare', cat: 'chord', color: '#ff4d6d', icon: 'guitar', families: ['guitar'] },
    strings: { label: 'Cordes', short: 'Cordes', cat: 'chord', color: '#1ea7ff', icon: 'strings', families: ['strings'] },
    sax: { label: 'Saxophoniste', short: 'Sax', cat: 'mono', color: '#c9a227', icon: 'sax', families: ['winds'] },
    vox: { label: 'Voix / vocoder', short: 'Voix', cat: 'mono', color: '#c0c0c0', icon: 'vox', families: ['voices', 'synth'] },
    fx: { label: 'Effets (montées, impacts)', short: 'Effets', cat: 'mono', color: '#7a8a99', icon: 'fx', families: ['fx', 'pads'] },
  };

  /* Ordre de placement sur la scène : fond (rythmique), milieu (claviers), devant (solistes). */
  const STAGE_ROWS = [
    ['perc', 'drums', 'fx'],
    ['pad', 'keys', 'strings', 'arp'],
    ['bass', 'lead', 'vox', 'sax', 'guitar'],
  ];

  /* ---------- Kits de batterie ----------
   * Boîtes à rythmes de tidal-drum-machines (sons disponibles relevés dans la bibliothèque),
   * ou kits composés de banques Dirt-Samples / VCSL. */
  const KITS = {
    RolandTR808: { label: 'Roland TR-808', year: 1980, sounds: 'bd cb cp cr hh ht lt mt oh perc rim sd sh' },
    RolandTR909: { label: 'Roland TR-909', year: 1983, sounds: 'bd cp cr hh ht lt mt oh rd rim sd' },
    RolandTR707: { label: 'Roland TR-707', year: 1985, sounds: 'bd cb cp cr hh ht lt mt oh rim sd tb' },
    RolandTR606: { label: 'Roland TR-606', year: 1981, sounds: 'bd cr hh ht lt oh sd' },
    RolandCompurhythm78: { label: 'Roland CR-78', year: 1978, sounds: 'bd cb hh misc oh perc sd tb' },
    LinnDrum: { label: 'LinnDrum', year: 1982, sounds: 'bd cb cp cr hh ht lt mt oh perc rd rim sd sh tb' },
    LinnLM1: { label: 'Linn LM-1', year: 1980, sounds: 'bd cb cp hh ht lt oh perc rim sd sh tb' },
    Linn9000: { label: 'Linn 9000', year: 1984, sounds: 'bd cb cr hh ht lt mt oh perc rd rim sd tb' },
    OberheimDMX: { label: 'Oberheim DMX', year: 1981, sounds: 'bd cp cr hh ht lt mt oh rd rim sd sh tb' },
    EmuDrumulator: { label: 'E-mu Drumulator', year: 1983, sounds: 'bd cb cp cr hh ht lt mt oh perc rim sd' },
    EmuSP12: { label: 'E-mu SP-12', year: 1985, sounds: 'bd cb cp cr hh ht lt misc mt oh perc rd rim sd' },
    SimmonsSDS5: { label: 'Simmons SDS-5', year: 1981, sounds: 'bd hh ht lt mt oh rim sd' },
    KorgMinipops: { label: 'Korg Mini Pops', year: 1966, sounds: 'bd hh misc oh sd' },
    AkaiMPC60: { label: 'Akai MPC60', year: 1988, sounds: 'bd cp cr hh ht lt misc mt oh perc rd rim sd' },
    RolandR8: { label: 'Roland R-8', year: 1989, sounds: 'bd cb cp cr hh ht lt mt oh perc rd rim sd sh tb' },
    KorgM1: { label: 'Korg M1', year: 1988, sounds: 'bd cb cp cr hh ht misc mt oh perc rd rim sd sh tb' },
    RolandMC303: { label: 'Roland MC-303', year: 1996, sounds: 'bd cb cp fx hh ht lt misc mt oh perc rd rim sd sh tb' },
    dirt808: {
      label: 'Dirt-Samples · 808',
      source: 'dirt',
      map: { bd: '808bd', sd: '808sd', hh: '808hc', oh: '808oh', cr: '808cy', lt: '808lt', mt: '808mt', ht: '808ht', cp: 'realclaps', cb: 'cb', rim: 'rs' },
    },
    dirtclub: {
      label: 'Dirt-Samples · club',
      source: 'dirt',
      map: { bd: 'clubkick', sd: 'sn', cp: 'realclaps', hh: 'hh', oh: 'ho', cr: 'cr', lt: 'lt', mt: 'mt', ht: 'ht', cb: 'cb', perc: 'perc', rim: 'rs', fx: 'noise' },
    },
    vcsl: {
      label: 'Percussions acoustiques (VCSL)',
      source: 'vcsl',
      map: {
        bd: 'bassdrum1', hh: 'hihat', cp: 'clap', cr: 'sus_cymbal', rd: 'sus_cymbal2', tb: 'tambourine', sh: 'cabasa',
        cb: 'cowbell', perc: 'conga', misc: 'bongo', lt: 'tom_mallet', mt: 'tom2_mallet', ht: 'tom_stick', rim: 'clave',
      },
    },
    // batterie General MIDI (bibliothèque « gm ») : seul kit proposé en mode General MIDI
    gm: {
      label: 'Batterie General MIDI',
      source: 'gm',
      map: { bd: '36', sd: '38', cp: '39', rim: '37', hh: '42', oh: '46', lt: '41', mt: '45', ht: '48', cr: '49', rd: '51', cb: '56', sh: '70', tb: '54', perc: '63', misc: '60', fx: '71' },
    },
  };
  // un élément absent d'un kit est emprunté au premier de ces kits qui l'a
  const FALLBACK_KITS = ['RolandTR808', 'LinnDrum', 'RolandMC303'];

  /* Éléments de batterie proposés en plus de ceux du preset (décochés) */
  const EXTRA_PIECES = {
    drums: ['bd', 'sd', 'cp', 'rim', 'hh', 'oh', 'lt', 'mt', 'ht', 'cr', 'rd', 'cb', 'tb', 'sh'],
    perc: ['tb', 'sh', 'cb', 'perc', 'misc', 'rim'],
  };

  /* ---------- Raccourcis de saisie ---------- */
  const m = (role, pick, extra = {}) => ({ role, pick: pick.split(/\s+/), ...extra });
  const kit = (role, pieces, kits, extra = {}) => ({ role, pieces: pieces.split(/\s+/), kits: kits.split(/\s+/), ...extra });
  const opt = { optional: true };

  /* Kits types */
  const K80 = 'LinnDrum RolandTR707 OberheimDMX RolandTR808 EmuDrumulator dirt808';
  const KEDM = 'RolandTR909 dirtclub RolandTR808 AkaiMPC60 EmuSP12 KorgM1';
  const KPERC = 'vcsl LinnDrum RolandTR707 RolandTR808 RolandR8 dirtclub';
  const KTECH = 'RolandTR909 dirtclub RolandTR808 KorgM1 AkaiMPC60 EmuSP12';
  /* Effets : bruit blanc filtré (montées), vent, cymbale inversée, ambiances */
  const FX = 'syn_noiseriser syn_wind gm_reverse_cymbal gm_fx_atmosphere gm_fx_sci_fi gm_fx_echoes';

  /* ---------- Styles et inspirations ---------- */
  const STYLES = [
    {
      id: 'synthwave',
      label: 'Synthwave',
      desc: 'Synthés analogiques des années 80, boîtes à rythmes vintage, nappes et arpèges nocturnes.',
      presets: [
        {
          id: 'smalltown',
          song: 'Smalltown Boy',
          artist: 'Bronski Beat',
          year: 1984,
          tempo: 132,
          desc: 'Hi-NRG mélancolique : basse en octaves qui pulse, cordes synthétiques, petite mélodie de cloches.',
          musicians: [
            kit('drums', 'bd sd cp hh oh cr', K80),
            kit('perc', 'tb sh', KPERC, opt),
            m('bass', 'j:A48 syn_sqbass syn_moogbass dirt_moog j:B38 gm_synth_bass_1', { note: 'Basse en octaves à la croche' }),
            m('pad', 'j:A36 j:A15 gm_synth_strings_1 syn_softpad j:B11 gm_string_ensemble_1', { note: 'Cordes synthétiques en accords tenus' }),
            m('arp', 'j:B48 j:B77 gm_glockenspiel gm_celesta dirt_arpy syn_pluck', { label: 'Clavier ostinato', note: 'Les petites cloches répétées' }),
            m('lead', 'j:A14 gm_lead_3_calliope j:B16 gm_flute syn_triangle j:A51', { note: 'Mélodie aiguë, façon flûte synthétique' }),
          ],
        },
        {
          id: 'nightcall',
          song: 'Nightcall',
          artist: 'Kavinsky',
          year: 2010,
          tempo: 91,
          desc: 'Darksynth nocturne : basse saturée et lente, voix robotique vocodée, nappes sombres.',
          musicians: [
            kit('drums', 'bd sd cp hh oh cr', 'LinnDrum RolandTR808 OberheimDMX RolandTR707 EmuSP12 dirt808'),
            m('bass', 'syn_moogbass j:B68 syn_reese syn_sawbass dirt_moog j:A55', { note: 'Grosse basse ladder, notes longues' }),
            m('pad', 'j:B43 j:B81 syn_superpad gm_pad_warm gm_synth_strings_2 j:B56', { note: 'Ensemble sombre, accords mineurs' }),
            m('vox', 'gm_lead_6_voice gm_synth_choir j:A17 gm_pad_choir gm_voice_oohs syn_square', { label: 'Voix robot (vocoder)' }),
            m('lead', 'j:A53 gm_lead_2_sawtooth syn_saw j:A51 gm_lead_8_bass_lead j:B37', { note: 'Le thème en dent de scie' }),
            m('arp', 'j:A46 syn_pluck j:B24 dirt_arpy gm_lead_1_square j:B17', opt),
          ],
        },
        {
          id: 'blinding',
          song: 'Blinding Lights',
          artist: 'The Weeknd',
          year: 2019,
          tempo: 171,
          desc: 'Synth-pop rétro et rapide : riff de synthé brillant, basse sautillante, batterie LinnDrum.',
          musicians: [
            kit('drums', 'bd sd cp hh oh cr', 'LinnDrum OberheimDMX RolandTR707 EmuSP12 RolandTR808 dirt808'),
            kit('perc', 'tb sh', KPERC, opt),
            m('bass', 'syn_sqbass j:A48 syn_moogbass gm_synth_bass_2 syn_sawbass dirt_jvbass', { note: 'Basse en croches rebondissantes' }),
            m('lead', 'syn_supersaw j:A52 gm_lead_2_sawtooth j:A53 syn_saw gm_synth_brass_1', { label: 'Clavier lead (riff)', note: 'Le riff principal' }),
            m('pad', 'j:A15 syn_superpad gm_pad_poly j:B47 gm_synth_strings_1 syn_softpad'),
            m('arp', 'j:B24 syn_pluck j:A46 dirt_arpy gm_lead_1_square j:B17'),
          ],
        },
        {
          id: 'sweetdreams',
          song: 'Sweet Dreams',
          artist: 'Eurythmics',
          year: 1983,
          tempo: 126,
          desc: 'Synth-pop froide : riff de basse séquencé hypnotique, cordes synthétiques, contre-chant de flûte.',
          musicians: [
            kit('drums', 'bd sd hh oh cr', 'OberheimDMX LinnDrum LinnLM1 RolandTR808 EmuDrumulator RolandTR707'),
            m('bass', 'syn_moogbass dirt_moog j:A55 syn_sawbass j:B68 gm_synth_bass_1', { label: 'Bassiste (riff séquencé)' }),
            m('pad', 'gm_synth_strings_1 j:A36 j:A15 gm_string_ensemble_2 syn_softpad j:B11'),
            m('lead', 'j:A14 gm_flute gm_pan_flute gm_ocarina gm_recorder syn_triangle', { note: 'La petite ligne de flûte' }),
            m('strings', 'gm_cello j:B83 gm_viola gm_string_ensemble_1 gm_tremolo_strings j:B12', { cat: 'mono', label: 'Cordes (contre-chant)', optional: true }),
          ],
        },
        {
          id: 'takeonme',
          song: 'Take On Me',
          artist: 'a-ha',
          year: 1985,
          tempo: 169,
          desc: 'Synth-pop lumineuse : riff de synthé bondissant, basse rebondie, cuivres synthétiques et guitare claire.',
          musicians: [
            kit('drums', 'bd sd hh oh cr tb', 'LinnDrum RolandTR707 OberheimDMX RolandTR808 RolandTR909 EmuDrumulator'),
            m('bass', 'gm_synth_bass_2 j:A48 syn_sqbass gm_electric_bass_finger dirt_jvbass syn_sawbass'),
            m('lead', 'j:A51 gm_lead_1_square syn_square gm_lead_3_calliope j:B71 syn_chip', { label: 'Clavier lead (riff)' }),
            m('pad', 'j:A11 j:A16 gm_synth_brass_1 syn_softpad gm_pad_warm j:B55', { label: 'Clavier nappe (cuivres)' }),
            m('keys', 'j:A27 gm_epiano1 piano j:B61 gm_epiano2 vcsl_fmpiano', { label: 'Clavier accords' }),
            m('guitar', 'gm_electric_guitar_clean gm_electric_guitar_muted gm_electric_guitar_jazz dirt_gtr gm_acoustic_guitar_steel j:A44', opt),
          ],
        },
        {
          id: 'taintedlove',
          song: 'Tainted Love',
          artist: 'Soft Cell',
          year: 1981,
          tempo: 144,
          desc: 'Synth-pop minimaliste : boîte à rythmes vintage, basse synthé, les deux notes « bink-bink ».',
          musicians: [
            kit('drums', 'bd sd hh oh', 'RolandCompurhythm78 KorgMinipops RolandTR808 RolandTR606 LinnLM1 dirt808'),
            m('bass', 'syn_sqbass j:A55 syn_sawbass gm_synth_bass_1 dirt_moog syn_moogbass'),
            m('keys', 'j:A21 gm_drawbar_organ j:A23 syn_square gm_synth_brass_2 j:A11', { label: 'Clavier accords' }),
            m('lead', 'syn_chip j:B77 gm_lead_1_square j:A31 gm_glockenspiel syn_pluck', { label: 'Clavier « bink-bink »' }),
            m('pad', 'gm_synth_strings_2 j:B11 syn_softpad gm_pad_warm j:A36 gm_string_ensemble_1', opt),
          ],
        },
        {
          id: 'enjoysilence',
          song: 'Enjoy the Silence',
          artist: 'Depeche Mode',
          year: 1990,
          tempo: 113,
          desc: 'Synth-pop sombre : nappes de chœurs, riff de guitare claire, basse synthé ronde.',
          musicians: [
            kit('drums', 'bd sd cp hh oh cr', 'EmuSP12 AkaiMPC60 LinnDrum OberheimDMX RolandTR909 Linn9000'),
            kit('perc', 'tb sh', KPERC, opt),
            m('bass', 'syn_moogbass j:B68 syn_sawbass gm_synth_bass_2 dirt_moog j:A48'),
            m('pad', 'gm_pad_choir j:A17 gm_synth_choir j:B23 syn_superpad gm_choir_aahs', { label: 'Clavier nappe (chœurs)' }),
            m('guitar', 'gm_electric_guitar_clean gm_electric_guitar_jazz dirt_gtr gm_electric_guitar_muted gm_acoustic_guitar_steel j:B22', { cat: 'mono', note: 'Le riff en notes simples' }),
            m('lead', 'j:A52 gm_lead_8_bass_lead gm_synth_brass_1 syn_saw j:A53 gm_lead_2_sawtooth'),
          ],
        },
        {
          id: 'runninghill',
          song: 'Running Up That Hill',
          artist: 'Kate Bush',
          year: 1985,
          tempo: 108,
          desc: 'Art-pop épique : toms LinnDrum martelés, riff de violoncelle synthétique, nappes de cordes.',
          musicians: [
            kit('drums', 'bd sd hh lt mt ht', 'LinnDrum OberheimDMX SimmonsSDS5 EmuDrumulator LinnLM1 RolandTR707', { note: 'Les toms sont au cœur du morceau' }),
            m('bass', 'syn_sub j:A55 syn_moogbass gm_synth_bass_1 gm_fretless_bass dirt_moog'),
            m('strings', 'j:B83 gm_cello gm_synth_strings_2 gm_string_ensemble_1 j:B12 gm_viola', { cat: 'mono', label: 'Cordes (riff de violoncelle)' }),
            m('pad', 'j:B81 j:B43 gm_synth_strings_1 syn_superpad gm_pad_bowed j:A36'),
            m('lead', 'j:A14 gm_pan_flute j:B16 gm_shakuhachi syn_triangle gm_ocarina', opt),
          ],
        },
        {
          id: 'midnightcity',
          song: 'Midnight City',
          artist: 'M83',
          year: 2011,
          tempo: 105,
          desc: 'Électro-pop rêveuse : riff de synthé façon voix, batterie massive, solo de saxophone final.',
          musicians: [
            kit('drums', 'bd sd cp hh oh cr', 'LinnDrum RolandTR909 OberheimDMX RolandTR808 EmuSP12 dirtclub'),
            m('bass', 'syn_sawbass syn_moogbass j:A48 gm_synth_bass_2 syn_reese dirt_moog'),
            m('lead', 'gm_lead_6_voice gm_synth_choir j:A53 syn_supersaw gm_lead_2_sawtooth j:A17', { label: 'Clavier lead (riff vocal)' }),
            m('pad', 'syn_superpad j:B56 gm_pad_halo j:A15 gm_pad_warm syn_glasspad'),
            m('sax', 'gm_alto_sax vcsl_sax gm_tenor_sax dirt_sax gm_soprano_sax j:B37', { note: 'Le solo final' }),
            m('arp', 'j:B24 syn_pluck j:A46 dirt_arpy gm_lead_1_square j:B48', opt),
          ],
        },
        {
          id: 'realhero',
          song: 'A Real Hero',
          artist: 'College & Electric Youth',
          year: 2010,
          tempo: 96,
          desc: 'Dreamwave douce : nappes chaleureuses, arpèges scintillants, basse ronde, mélodie éthérée.',
          musicians: [
            kit('drums', 'bd sd cp hh oh', 'LinnDrum RolandTR707 RolandTR808 OberheimDMX RolandTR606 dirt808'),
            m('bass', 'j:A55 syn_sub syn_moogbass gm_synth_bass_1 j:B38 dirt_moog'),
            m('pad', 'j:A15 syn_softpad gm_pad_warm j:B56 gm_pad_new_age syn_glasspad'),
            m('arp', 'j:B48 j:B24 syn_pluck gm_celesta dirt_arpy gm_music_box'),
            m('lead', 'j:A14 j:A51 gm_lead_3_calliope syn_triangle gm_pan_flute gm_lead_6_voice'),
          ],
        },
      ],
    },
    {
      id: 'edm',
      label: 'EDM mélodique',
      desc: 'House progressive et mélodique : kick à chaque temps, supersaws, plucks, pianos et grandes nappes.',
      presets: [
        {
          id: 'levels',
          song: 'Levels',
          artist: 'Avicii',
          year: 2011,
          tempo: 126,
          desc: 'Progressive house euphorique : riff de synthé lumineux, piano house, basse qui pompe.',
          musicians: [
            kit('drums', 'bd cp hh oh cr', KEDM),
            m('bass', 'syn_reese syn_sawbass gm_synth_bass_2 syn_sub syn_moogbass j:A55', { note: 'En sidechain sur le kick' }),
            m('lead', 'syn_supersaw j:A53 gm_lead_2_sawtooth syn_pluck j:A52 gm_lead_7_fifths', { label: 'Clavier lead (riff)' }),
            m('keys', 'piano gm_piano vcsl_piano1 gm_epiano1 j:A18 j:A61', { label: 'Piano house' }),
            m('pad', 'syn_superpad gm_pad_warm j:B23 syn_softpad gm_synth_strings_1 j:A15'),
          ],
        },
        {
          id: 'dywc',
          song: 'Don’t You Worry Child',
          artist: 'Swedish House Mafia',
          year: 2012,
          tempo: 129,
          desc: 'Progressive house épique : piano émouvant, lead supersaw au drop, grande montée.',
          musicians: [
            kit('drums', 'bd cp sd hh oh cr', KEDM),
            m('bass', 'syn_sawbass syn_reese syn_sub gm_synth_bass_2 syn_moogbass j:A48'),
            m('keys', 'piano gm_piano vcsl_piano1 j:A18 gm_epiano1 gm_epiano2'),
            m('lead', 'syn_supersaw gm_lead_2_sawtooth j:A53 gm_lead_7_fifths syn_saw gm_synth_brass_1', { label: 'Clavier lead (drop)' }),
            m('pad', 'syn_superpad gm_synth_strings_1 gm_pad_poly j:B23 gm_string_ensemble_1 syn_softpad'),
            m('strings', 'gm_string_ensemble_1 gm_string_ensemble_2 gm_synth_strings_2 j:A36 gm_tremolo_strings gm_violin', opt),
          ],
        },
        {
          id: 'wakemeup',
          song: 'Wake Me Up',
          artist: 'Avicii',
          year: 2013,
          tempo: 124,
          desc: 'Folk-house : guitare acoustique au premier plan, piano, lead synthé au refrain.',
          musicians: [
            kit('drums', 'bd cp hh oh cr', KEDM),
            m('guitar', 'gm_acoustic_guitar_steel gm_acoustic_guitar_nylon vcsl_strumstick dirt_gtr gm_banjo gm_electric_guitar_clean', { note: 'Accords grattés' }),
            m('keys', 'piano gm_piano vcsl_piano1 gm_epiano1 j:A18 gm_drawbar_organ'),
            m('bass', 'syn_sub syn_sawbass gm_synth_bass_1 syn_moogbass gm_electric_bass_finger j:A55'),
            m('lead', 'syn_supersaw j:A52 gm_lead_2_sawtooth syn_pluck gm_lead_7_fifths j:A53'),
            m('pad', 'syn_softpad gm_pad_warm j:A15 gm_synth_strings_1 syn_superpad gm_string_ensemble_1', opt),
          ],
        },
        {
          id: 'firestone',
          song: 'Firestone',
          artist: 'Kygo',
          year: 2014,
          tempo: 113,
          desc: 'Tropical house : flûte de pan / marimba, piano doux, kick rond et claps feutrés.',
          musicians: [
            kit('drums', 'bd cp hh oh', 'RolandTR808 dirt808 RolandTR909 AkaiMPC60 LinnDrum KorgM1'),
            kit('perc', 'sh tb perc', KPERC, opt),
            m('lead', 'gm_pan_flute gm_marimba gm_celesta gm_steel_drums gm_kalimba syn_pluck', { label: 'Clavier lead (flûte / marimba)' }),
            m('keys', 'piano gm_epiano1 vcsl_piano1 gm_piano j:A27 gm_epiano2'),
            m('bass', 'syn_sub gm_synth_bass_1 syn_moogbass gm_fretless_bass syn_sawbass j:A55'),
            m('pad', 'syn_softpad gm_pad_warm gm_pad_new_age syn_glasspad j:B56 gm_voice_oohs'),
          ],
        },
        {
          id: 'clarity',
          song: 'Clarity',
          artist: 'Zedd',
          year: 2012,
          tempo: 128,
          desc: 'Électro-house mélodique : piano puissant, lead supersaw, basse saturée.',
          musicians: [
            kit('drums', 'bd cp sd hh oh cr', KEDM),
            m('keys', 'piano gm_piano vcsl_piano1 j:A18 gm_epiano1 j:A61'),
            m('lead', 'syn_supersaw gm_lead_2_sawtooth gm_lead_7_fifths syn_saw j:A53 gm_synth_brass_2', { label: 'Clavier lead (drop)' }),
            m('bass', 'syn_reese syn_acidladder syn_sawbass syn_moogbass gm_synth_bass_2 dirt_moog'),
            m('pad', 'syn_superpad gm_pad_poly j:B23 gm_synth_strings_1 syn_softpad j:A15'),
            m('arp', 'syn_pluck j:B24 dirt_arpy gm_lead_1_square j:A46 syn_saw', opt),
          ],
        },
        {
          id: 'summer',
          song: 'Summer',
          artist: 'Calvin Harris',
          year: 2014,
          tempo: 128,
          desc: 'EDM pop solaire : riff de lead pluck, guitare funky étouffée, basse ronde.',
          musicians: [
            kit('drums', 'bd cp hh oh cr', KEDM),
            kit('perc', 'sh tb', KPERC, opt),
            m('lead', 'syn_pluck syn_supersaw j:B24 gm_lead_2_sawtooth j:A53 j:A52', { label: 'Clavier lead (riff)' }),
            m('guitar', 'gm_electric_guitar_muted gm_electric_guitar_clean dirt_gtr gm_electric_guitar_jazz j:A44 gm_acoustic_guitar_steel', { cat: 'mono', note: 'Petites notes étouffées funky' }),
            m('bass', 'syn_moogbass syn_sub gm_synth_bass_2 syn_sawbass gm_electric_bass_pick j:A48'),
            m('pad', 'syn_superpad gm_pad_warm j:A15 syn_softpad gm_synth_strings_1 j:B47'),
          ],
        },
        {
          id: 'strobe',
          song: 'Strobe',
          artist: 'deadmau5',
          year: 2009,
          tempo: 128,
          desc: 'Progressive house hypnotique : arpèges pluck qui évoluent lentement, nappes très longues.',
          musicians: [
            kit('drums', 'bd cp hh oh rd', KEDM),
            m('arp', 'syn_pluck j:B24 dirt_arpy j:A46 gm_lead_1_square syn_saw', { note: 'Le motif principal' }),
            m('pad', 'syn_superpad gm_pad_halo j:B56 gm_pad_sweep syn_glasspad gm_synth_strings_2'),
            m('bass', 'syn_sub syn_moogbass syn_sawbass gm_synth_bass_1 syn_reese j:A55'),
            m('lead', 'syn_saw gm_lead_2_sawtooth j:A53 syn_supersaw gm_lead_8_bass_lead j:A51', opt),
          ],
        },
        {
          id: 'opus',
          song: 'Opus',
          artist: 'Eric Prydz',
          year: 2015,
          tempo: 126,
          desc: 'Progressive épique : un seul arpège qui grandit et s’ouvre pendant de longues minutes.',
          musicians: [
            kit('drums', 'bd cp hh oh cr rd', KEDM),
            m('arp', 'syn_supersaw syn_pluck j:B24 gm_lead_2_sawtooth dirt_arpy syn_saw', { note: 'L’arpège qui monte en puissance' }),
            m('bass', 'syn_reese syn_sub syn_sawbass syn_moogbass gm_synth_bass_2 j:B68'),
            m('pad', 'syn_superpad gm_synth_strings_1 gm_pad_bowed j:B23 syn_softpad gm_string_ensemble_2'),
            m('lead', 'syn_supersaw gm_lead_7_fifths gm_synth_brass_1 j:A53 syn_saw gm_lead_2_sawtooth', opt),
          ],
        },
        {
          id: 'faded',
          song: 'Faded',
          artist: 'Alan Walker',
          year: 2015,
          tempo: 90,
          desc: 'EDM mélancolique : piano, lead pluck aérien, basse sub, nappes vaporeuses.',
          musicians: [
            kit('drums', 'bd cp sd hh oh', 'RolandTR808 dirt808 RolandTR909 AkaiMPC60 KorgM1 dirtclub'),
            m('keys', 'piano gm_piano vcsl_piano1 gm_epiano1 j:A18 gm_epiano2'),
            m('lead', 'syn_pluck j:B24 gm_lead_2_sawtooth syn_supersaw gm_kalimba j:B48', { label: 'Clavier lead (pluck)' }),
            m('bass', 'syn_sub syn_sawbass syn_reese gm_synth_bass_1 syn_moogbass j:A55'),
            m('pad', 'syn_softpad gm_pad_halo syn_superpad gm_pad_choir j:B56 gm_synth_strings_2'),
          ],
        },
        {
          id: 'innerbloom',
          song: 'Innerbloom',
          artist: 'RÜFÜS DU SOL',
          year: 2015,
          tempo: 122,
          desc: 'Melodic house atmosphérique : nappes profondes, guitare réverbérée, arpèges discrets.',
          musicians: [
            kit('drums', 'bd cp hh oh rim', 'RolandTR909 RolandTR808 dirtclub AkaiMPC60 LinnDrum KorgM1'),
            kit('perc', 'sh perc', KPERC, opt),
            m('pad', 'syn_superpad j:B56 gm_pad_warm j:B43 syn_glasspad gm_pad_sweep'),
            m('guitar', 'gm_electric_guitar_clean gm_electric_guitar_jazz dirt_gtr gm_guitar_harmonics gm_acoustic_guitar_nylon j:B22', { cat: 'mono' }),
            m('arp', 'syn_pluck j:A46 dirt_arpy j:B17 gm_celesta syn_triangle'),
            m('bass', 'syn_sub syn_moogbass syn_sawbass gm_synth_bass_1 j:A55 syn_reese'),
          ],
        },
      ],
    },
    {
      id: 'techno',
      label: 'Techno mélodique',
      desc: 'Intros planantes, arpèges hypnotiques, longues montées et drops puissants : kick 909, basse sidechainée, nappes larges.',
      presets: [
        {
          id: 'powersoften',
          song: 'Powers of Ten',
          artist: 'Stephan Bodzin',
          year: 2015,
          tempo: 123,
          desc: 'Techno mélodique cosmique : arpège analogique obsédant, basse Moog qui ronronne, nappes qui s’ouvrent lentement.',
          musicians: [
            kit('drums', 'bd cp hh oh cr rim', KTECH),
            kit('perc', 'sh perc', KPERC, opt),
            m('bass', 'syn_moogbass dirt_moog syn_sawbass syn_reese syn_sub j:B68', { note: 'Deux doubles-croches après chaque kick' }),
            m('arp', 'syn_saw j:A46 syn_pluck syn_supersaw dirt_arpy gm_lead_2_sawtooth', { label: 'Clavier arpège (séquence)', note: 'La séquence qui tourne sans fin' }),
            m('pad', 'syn_superpad gm_pad_halo j:B43 gm_synth_strings_2 syn_glasspad gm_pad_sweep'),
            m('lead', 'syn_saw syn_supersaw gm_lead_2_sawtooth j:A53 gm_lead_8_bass_lead syn_square', { note: 'Thème du drop' }),
            m('fx', FX, { note: 'Montées de bruit blanc et impacts' }),
          ],
        },
        {
          id: 'eternity',
          song: 'Eternity',
          artist: 'Anyma & Chris Avantgarde',
          year: 2023,
          tempo: 125,
          desc: 'Melodic techno cinématique : chœur éthéré, lead supersaw immense, basse roulante, drops de festival.',
          musicians: [
            kit('drums', 'bd cp hh oh cr rd', KTECH),
            m('bass', 'syn_reese syn_sub syn_sawbass syn_moogbass gm_synth_bass_2 j:B68'),
            m('pad', 'syn_superpad gm_synth_strings_1 gm_pad_bowed j:B23 gm_string_ensemble_1 syn_softpad'),
            m('lead', 'syn_supersaw gm_lead_7_fifths gm_lead_2_sawtooth j:A53 syn_saw gm_synth_brass_1', { label: 'Clavier lead (drop)' }),
            m('vox', 'gm_synth_choir gm_pad_choir gm_voice_oohs gm_lead_6_voice j:A17 syn_square', { label: 'Voix (chœur)' }),
            m('arp', 'syn_pluck j:B24 syn_supersaw dirt_arpy gm_lead_1_square syn_triangle'),
            m('fx', FX),
          ],
        },
        {
          id: 'upperground',
          song: 'Upperground',
          artist: 'ARTBAT',
          year: 2019,
          tempo: 123,
          desc: 'Techno mélodique sombre : riff de lead hypnotique en doubles-croches, kick sec, longues nappes.',
          musicians: [
            kit('drums', 'bd cp hh oh cr rd', KTECH),
            kit('perc', 'sh tb', KPERC, opt),
            m('bass', 'syn_sub syn_reese syn_moogbass syn_sawbass gm_synth_bass_1 dirt_moog'),
            m('lead', 'syn_saw gm_lead_2_sawtooth syn_square j:A53 gm_lead_8_bass_lead syn_supersaw', { label: 'Clavier lead (riff)', note: 'Le riff hypnotique' }),
            m('pad', 'syn_superpad gm_pad_halo j:B56 gm_pad_sweep syn_glasspad gm_synth_strings_2'),
            m('arp', 'syn_pluck j:A46 dirt_arpy syn_saw gm_lead_1_square j:B17'),
            m('fx', FX),
          ],
        },
        {
          id: 'returntooz',
          song: 'Return to Oz (ARTBAT Remix)',
          artist: 'Monolink',
          year: 2019,
          tempo: 124,
          desc: 'Melodic techno mélancolique : voix grave, guitare réverbérée, drop sombre au lead saturé.',
          musicians: [
            kit('drums', 'bd cp hh oh cr', KTECH),
            kit('perc', 'sh perc', KPERC, opt),
            m('bass', 'syn_reese syn_sub syn_moogbass syn_sawbass gm_synth_bass_2 j:B68'),
            m('vox', 'gm_voice_oohs gm_synth_choir gm_lead_6_voice gm_pad_choir j:A17 syn_square', { label: 'Voix grave' }),
            m('guitar', 'gm_electric_guitar_clean gm_electric_guitar_jazz dirt_gtr gm_acoustic_guitar_nylon gm_acoustic_guitar_steel j:A44', { note: 'Arpège de guitare dans la reverb' }),
            m('pad', 'syn_superpad j:B43 gm_pad_warm syn_softpad gm_synth_strings_2 j:B56'),
            m('lead', 'syn_supersaw syn_saw gm_lead_2_sawtooth j:A53 gm_lead_8_bass_lead gm_synth_brass_1', { label: 'Clavier lead (drop)' }),
            m('fx', FX),
          ],
        },
        {
          id: 'allthatmatters',
          song: 'All That Matters',
          artist: 'Kölsch feat. Troels Abrahamsen',
          year: 2012,
          tempo: 122,
          desc: 'Chanson techno tendre : piano, voix au premier plan, refrain qui s’envole au drop.',
          musicians: [
            kit('drums', 'bd cp hh oh cr', KTECH),
            m('keys', 'piano gm_piano vcsl_piano1 gm_epiano1 j:A18 gm_epiano2'),
            m('vox', 'gm_voice_oohs gm_lead_6_voice gm_synth_choir gm_pad_choir j:A17 syn_square', { label: 'Voix (mélodie)' }),
            m('bass', 'syn_sub syn_moogbass syn_sawbass gm_synth_bass_1 j:A55 syn_reese'),
            m('pad', 'syn_softpad gm_pad_warm syn_superpad gm_synth_strings_1 j:A15 gm_pad_halo'),
            m('arp', 'syn_pluck j:B24 gm_celesta dirt_arpy syn_triangle gm_music_box'),
            m('fx', FX),
          ],
        },
        {
          id: 'gravity',
          song: 'Gravity',
          artist: 'Boris Brejcha',
          year: 2018,
          tempo: 126,
          desc: 'High-tech minimal : lead ludique et précis, voix douce, groove sec qui ne lâche jamais.',
          musicians: [
            kit('drums', 'bd cp hh oh cr rim', 'RolandTR909 KorgM1 dirtclub RolandTR808 EmuSP12 AkaiMPC60'),
            m('bass', 'syn_sqbass syn_sub syn_moogbass syn_sawbass gm_synth_bass_2 dirt_jvbass'),
            m('lead', 'syn_square syn_pluck gm_lead_1_square syn_chip j:A51 gm_lead_2_sawtooth', { label: 'Clavier lead (riff)' }),
            m('vox', 'gm_voice_oohs gm_synth_choir gm_pad_choir gm_lead_6_voice j:A17 syn_square', { label: 'Voix douce' }),
            m('pad', 'syn_glasspad syn_softpad gm_pad_halo j:B56 gm_pad_warm syn_superpad'),
            m('fx', FX),
          ],
        },
        {
          id: 'skyandsand',
          song: 'Sky and Sand',
          artist: 'Paul & Fritz Kalkbrenner',
          year: 2008,
          tempo: 127,
          desc: 'Hymne techno berlinois : voix chaleureuse, synthé qui monte, nappe lumineuse au majeur relatif.',
          musicians: [
            kit('drums', 'bd cp hh oh cr', 'RolandTR909 RolandTR808 dirtclub KorgM1 AkaiMPC60 EmuSP12'),
            m('bass', 'syn_moogbass syn_sub syn_sawbass gm_synth_bass_1 dirt_moog j:A55'),
            m('vox', 'gm_lead_6_voice gm_voice_oohs gm_synth_choir gm_pad_choir j:A17 syn_square', { label: 'Voix (chant)' }),
            m('lead', 'syn_saw gm_lead_2_sawtooth syn_supersaw j:A53 syn_square gm_synth_brass_1', { label: 'Clavier lead (le synthé qui monte)' }),
            m('pad', 'syn_superpad gm_pad_warm j:A15 syn_softpad gm_synth_strings_1 gm_pad_halo'),
            m('arp', 'syn_pluck dirt_arpy j:B24 syn_triangle gm_celesta j:A46'),
            m('fx', FX),
          ],
        },
        {
          id: 'yourmind',
          song: 'Your Mind',
          artist: 'Adam Beyer & Bart Skils',
          year: 2018,
          tempo: 126,
          desc: 'Techno de festival : phrase vocale répétée en écho, longue montée, drop massif au lead saturé.',
          musicians: [
            kit('drums', 'bd cp hh oh cr rd', KTECH),
            kit('perc', 'sh tb', KPERC, opt),
            m('bass', 'syn_reese syn_sawbass syn_sub syn_moogbass gm_synth_bass_2 j:B68'),
            m('vox', 'gm_lead_6_voice gm_synth_choir gm_voice_oohs gm_pad_choir j:A17 syn_square', { label: 'Voix (phrase en écho)' }),
            m('lead', 'syn_supersaw gm_lead_2_sawtooth syn_saw gm_lead_7_fifths j:A53 gm_synth_brass_2', { label: 'Clavier lead (drop)' }),
            m('pad', 'syn_superpad gm_pad_sweep j:B43 gm_synth_strings_2 syn_softpad gm_pad_halo'),
            m('fx', FX),
          ],
        },
        {
          id: 'rej',
          song: 'Rej',
          artist: 'Âme',
          year: 2005,
          tempo: 125,
          desc: 'Deep techno hypnotique : riff de basse obstiné, accords mineurs à sept, couleur dorienne, percussions qui roulent.',
          musicians: [
            kit('drums', 'bd cp hh oh rim cr', 'RolandTR909 RolandTR808 dirtclub AkaiMPC60 KorgM1 EmuSP12'),
            kit('perc', 'sh perc', KPERC, opt),
            m('bass', 'syn_moogbass dirt_moog syn_sub syn_sawbass gm_synth_bass_1 j:A55', { note: 'Le riff obstiné' }),
            m('pad', 'j:B43 syn_superpad gm_pad_warm gm_synth_strings_2 syn_softpad j:B56', { note: 'Accords piqués' }),
            m('arp', 'syn_pluck j:A46 dirt_arpy syn_saw j:B17 gm_lead_1_square'),
            m('lead', 'syn_saw gm_lead_2_sawtooth j:A53 syn_square gm_lead_8_bass_lead syn_supersaw', opt),
            m('fx', FX),
          ],
        },
        {
          id: 'blurred',
          song: 'Blurred',
          artist: 'Kiasmos',
          year: 2014,
          tempo: 122,
          desc: 'Néo-classique électronique : piano intime, cordes, beat minimal qui s’ouvre peu à peu.',
          musicians: [
            kit('drums', 'bd cp hh oh rim cr', 'RolandTR909 RolandTR808 dirtclub KorgM1 AkaiMPC60 EmuSP12'),
            m('keys', 'piano vcsl_piano1 gm_piano gm_epiano1 j:A18 gm_epiano2'),
            m('strings', 'gm_string_ensemble_1 gm_string_ensemble_2 gm_synth_strings_2 gm_tremolo_strings gm_violin j:A36'),
            m('pad', 'syn_glasspad syn_softpad gm_pad_halo gm_pad_warm j:B56 syn_superpad'),
            m('bass', 'syn_sub syn_moogbass syn_sawbass gm_synth_bass_1 j:A55 syn_reese'),
            m('arp', 'syn_pluck gm_celesta dirt_arpy syn_triangle j:B24 gm_music_box'),
            m('fx', FX),
          ],
        },
      ],
    },
  ];

  // identifiants des musiciens : rôle (+ numéro si le rôle revient)
  STYLES.forEach((st) =>
    st.presets.forEach((p) => {
      const seen = {};
      p.musicians.forEach((mu) => {
        seen[mu.role] = (seen[mu.role] || 0) + 1;
        mu.id = mu.role + (seen[mu.role] > 1 ? seen[mu.role] : '');
      });
    })
  );

  /* ---------- Résolution ---------- */
  const drumLabel = (sound) => (SS.DRUM_TYPES.find((t) => t.id === sound) || { label: sound }).label;
  const kitHas = (kitId, sound) => {
    const k = KITS[kitId];
    if (!k) return false;
    return k.source ? !!k.map[sound] : k.sounds.split(' ').includes(sound);
  };

  /**
   * Options de piste (SS.newTrack) pour un élément de batterie joué sur un kit.
   * `piece` : « bd » ou « cp@RolandTR909 ». Un élément absent du kit est emprunté à un kit de secours.
   */
  function pieceOpts(kitId, piece) {
    const [sound, forced] = piece.split('@');
    let k = forced || kitId;
    let borrowed = false;
    if (!kitHas(k, sound)) {
      borrowed = true;
      k = FALLBACK_KITS.find((f) => kitHas(f, sound)) || 'RolandTR808';
    }
    const kitDef = KITS[k];
    const base = { type: 'drum', sound, variant: 0 };
    const opts = kitDef.source
      ? { ...base, source: kitDef.source, bank: kitDef.map[sound], machine: SS.DEFAULT_MACHINE }
      : { ...base, source: 'tdm', machine: k, bank: null };
    return { opts, kit: k, borrowed: borrowed || (!!forced && forced !== kitId), label: drumLabel(sound) };
  }

  /** Options de piste pour un choix d'instrument (« j:A48 » ou un id du catalogue). */
  function choiceOpts(token, cat) {
    if (token.startsWith('j:')) {
      const patch = token.slice(2);
      return { type: 'synth', category: cat, analog: 'juno106', patch, family: 'bass', instrument: null, sfv: 0 };
    }
    const { family, inst } = SS.locateInstrument(null, token);
    return { type: 'instrument', category: cat, family: family.id, instrument: inst.id, sfv: 0 };
  }

  /** Description lisible d'un choix (pour les cartes) : { name, kind, detail } */
  function describe(opts) {
    const cat = (SS.CATEGORIES.find((c) => c.id === opts.category) || { label: '' }).label;
    if (opts.type === 'drum') {
      if (opts.source === 'gm') {
        const d = SS.findGmDrum(opts.bank);
        return { name: d ? d.label : drumLabel(opts.sound), kind: 'Drum', detail: `General MIDI · note ${opts.bank}` };
      }
      const src = opts.source && opts.source !== 'tdm' ? opts.bank : (KITS[opts.machine] || { label: opts.machine }).label;
      return { name: drumLabel(opts.sound), kind: 'Drum', detail: src };
    }
    if (opts.type === 'synth') {
      const synth = (SS.ANALOG_SYNTHS || []).find((s) => s.id === opts.analog) || { label: 'Synthé' };
      const p = (SS.JUNO_PATCHES || []).find((x) => x.id === opts.patch);
      return { name: p ? `${p.id} – ${p.name}` : opts.patch, kind: 'Synthé', detail: `${cat} · ${synth.label}` };
    }
    const { family, inst } = SS.locateInstrument(opts.family, opts.instrument);
    const gm = SS.trackMidi({ type: 'instrument', family: opts.family, instrument: opts.instrument, sfv: opts.sfv });
    if (gm) return { name: SS.GM_PROGRAMS[gm.program], kind: `GM ${gm.program + 1}`, detail: `${cat} · ${inst.label}` };
    return { name: inst.label, kind: 'Instrument', detail: `${cat} · ${family.label}` };
  }

  SS.Band = { ROLES, STAGE_ROWS, KITS, FALLBACK_KITS, EXTRA_PIECES, STYLES, pieceOpts, choiceOpts, describe, kitHas, drumLabel };
})();
