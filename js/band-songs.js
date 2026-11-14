/*
 * Band : plans de chansons complètes, un par inspiration (js/band-presets.js).
 * Chaque plan est une chanson ORIGINALE « dans l'esprit » du morceau cité : tonalité, tempo, forme,
 * montée d'énergie et rôle des instruments s'en inspirent (analyses publiées : Hooktheory, Wikipedia,
 * MusicRadar, Reverb Machine…), mais les grilles d'accords et les mélodies sont nouvelles et varient
 * d'une chanson à l'autre. Les notes sont écrites par js/bandsong.js.
 *
 * Format :
 *   key : « C minor » ; groove : batterie (js/bandsong.js, G) ; emotion : js/emotions.js ; sc : sidechain basse/nappe sur le kick
 *   sections : { id: { bars, chords, drums, perc?, bass?, pad?, strings?, keys?, guitar?, arp?, lead?, vox?, sax?, gap?, groove?, name? } }
 *     chords : degrés, une mesure par accord (« i/VII » = deux accords dans la mesure), répétés jusqu'à la fin de la section ;
 *       chiffres romains lus sur le majeur ou le mineur naturel de la tonique (« VI » en mineur = 6e degré abaissé),
 *       altérations explicites pour les emprunts (« bVII » en majeur)
 *     drums : off | hats | light | main | full | drop | break | build ; gap : silence au dernier temps (avant un drop)
 *     bass : whole | 8 | pulse8 | oct | gallop | offbeat | roll | sync | walk
 *     pad, strings, keys, guitar : sustain | swell | pulse8 | block4 | stabs | house | strum | chop | ballad | pluck (ou un arpège)
 *     arp : up16 | updown16 | up8 | bells | strobe | pluck16 | rise
 *     lead, vox, sax : verse | hook | long | solo | drop | riff | answer | rise
 *     fx (musicien « Effets ») : riser | swell | down
 *     bass aussi : off16 (deux doubles-croches après chaque kick) | drone ; arp aussi : ost16 | dotted ; pad aussi : float
 *     float : intro (ou break) planante — le filtre des nappes s'ouvre lentement (automation)
 *   tech : techno mélodique — automation des sections (intro planante, montée au passe-haut, drop qui s'ouvre,
 *     outro qui se referme), ratchets et conditions de déclenchement sur la batterie (js/bandsong.js)
 *   form : ordre des sections, « chorus*2 » = deux fois de suite
 */
window.SS = window.SS || {};

SS.BandSongs = {
  /* ================= Synthwave ================= */

  // Hi-NRG mélancolique : basse en octaves continue, cloches, voix aiguë et plaintive au refrain
  smalltown: {
    key: 'C minor', groove: 'hinrg', emotion: 'melancolie',
    sections: {
      intro: { bars: 8, chords: 'i | VII | VI | VII', drums: 'hats', pad: 'swell', arp: 'bells' },
      verse: { bars: 16, chords: 'i | v | VI | iv | i | v | III | VII', drums: 'main', perc: 'main', bass: 'oct', pad: 'sustain', lead: 'verse' },
      chorus: { bars: 8, chords: 'VI | VII | III | i/v', drums: 'full', perc: 'full', bass: 'oct', pad: 'sustain', arp: 'bells', lead: 'hook' },
      bridge: { bars: 8, chords: 'iv | i | iv | V', drums: 'break', bass: 'whole', pad: 'swell', arp: 'bells', lead: 'long' },
      outro: { bars: 8, chords: 'i | VII | VI | VII', drums: 'light', bass: 'oct', pad: 'swell', arp: 'bells', fill: false },
    },
    form: 'intro verse chorus verse chorus bridge chorus*2 outro',
  },

  // Nocturne et menaçant : voix grave (vocodeur) aux couplets, voix claire au refrain, basse en croches
  nightcall: {
    key: 'A minor', groove: 'slow', emotion: 'mystere',
    sections: {
      intro: { bars: 8, chords: 'i | VI | VII | v', drums: 'off', bass: 'whole', pad: 'swell', arp: 'up8' },
      verse: { bars: 16, chords: 'i | VII | VI | VI | iv | v | i | VII', drums: 'main', bass: 'pulse8', pad: 'sustain', vox: 'verse' },
      chorus: { bars: 8, chords: 'VI | III | VII | i', drums: 'full', bass: '8', pad: 'sustain', arp: 'up16', lead: 'hook' },
      solo: { bars: 8, chords: 'iv | i | VI | v', drums: 'main', bass: 'pulse8', pad: 'sustain', lead: 'solo' },
      outro: { bars: 8, chords: 'i | VI | VII | v', drums: 'light', pad: 'swell', arp: 'up8', vox: 'long', fill: false },
    },
    form: 'intro verse chorus verse chorus solo chorus outro',
  },

  // Course de nuit à 171 BPM : riff de synthé, refrain euphorique, élan permanent
  blinding: {
    key: 'C minor', groove: 'drive', emotion: 'euphorie',
    sections: {
      intro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', pad: 'sustain', arp: 'up16', lead: 'riff' },
      verse: { bars: 16, chords: 'iv | i | VI | VII', drums: 'main', perc: 'main', bass: '8', pad: 'pulse8', lead: 'verse' },
      pre: { bars: 8, chords: 'VI | VII | iv | V', drums: 'main', bass: 'whole', pad: 'sustain', lead: 'verse' },
      chorus: { bars: 16, chords: 'VI | III | VII | iv', drums: 'full', perc: 'full', bass: 'oct', pad: 'sustain', arp: 'up16', lead: 'hook' },
      instr: { bars: 8, chords: 'i | VI | III | VII', drums: 'full', bass: 'oct', pad: 'sustain', arp: 'up16', lead: 'riff' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'off', pad: 'swell', arp: 'up16', fill: false },
    },
    form: 'intro verse pre chorus instr verse pre chorus*2 outro',
  },

  // Froid et hypnotique : riff de basse syncopé, IV majeur emprunté au dorien, pont sur deux accords
  sweetdreams: {
    key: 'C minor', groove: 'synthpop', emotion: 'ambivalence',
    sections: {
      intro: { bars: 8, chords: 'i | VII/VI | i | VII/VI', drums: 'main', bass: 'sync' },
      verse: { bars: 16, chords: 'i | VII/VI | i | v/VI', drums: 'main', bass: 'sync', pad: 'stabs', lead: 'verse' },
      chorus: { bars: 8, chords: 'IV | i | VI | V', drums: 'full', bass: 'sync', pad: 'sustain', strings: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'i | IV7 | i | IV7', drums: 'break', bass: 'whole', strings: 'sustain', lead: 'long' },
      outro: { bars: 8, chords: 'i | VII/VI | i | VII/VI', drums: 'main', bass: 'sync', pad: 'stabs', fill: false },
    },
    form: 'intro verse chorus verse chorus bridge verse chorus outro',
  },

  // Pop lumineuse et rapide : riff de synthé en doubles-croches, refrain qui monte haut
  takeonme: {
    key: 'A major', groove: 'drive', emotion: 'joie',
    sections: {
      intro: { bars: 8, chords: 'vi | IV | I | V', drums: 'main', bass: '8', keys: 'block4', lead: 'riff' },
      verse: { bars: 16, chords: 'ii7 | V | Imaj7 | IVmaj7 | ii7 | V | iii | vi', drums: 'main', bass: '8', keys: 'block4', lead: 'verse' },
      chorus: { bars: 8, chords: 'I | iii | IV | V', drums: 'full', bass: 'oct', pad: 'sustain', keys: 'block4', guitar: 'strum', lead: 'hook' },
      instr: { bars: 8, chords: 'vi | IV | I | V', drums: 'full', bass: '8', keys: 'block4', lead: 'riff' },
      bridge: { bars: 8, chords: 'iii | bVII | iii | bVII | ii | ii | Vsus4 | V', drums: 'break', bass: 'whole', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'vi | IV | I | V', drums: 'light', keys: 'block4', lead: 'riff', fill: false },
    },
    form: 'intro verse chorus instr verse chorus bridge chorus*2 outro',
  },

  // Tension sensuelle : accords piqués à deux notes, dominante majeure qui retient le retour
  taintedlove: {
    key: 'G minor', groove: 'hinrg', emotion: 'suspense',
    sections: {
      intro: { bars: 4, chords: 'i | III | VI | V', drums: 'light', keys: 'stabs' },
      verse: { bars: 16, chords: 'i | III | VI | iv', drums: 'main', bass: 'pulse8', keys: 'stabs', lead: 'verse' },
      chorus: { bars: 8, chords: 'VI | VII | i | V', drums: 'full', bass: '8', keys: 'stabs', pad: 'sustain', lead: 'hook' },
      break: { bars: 8, chords: 'i | i | iv | V', drums: 'break', keys: 'stabs', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'i | III | VI | V', drums: 'main', bass: 'pulse8', keys: 'stabs', fill: false },
    },
    form: 'intro verse chorus verse chorus break chorus*2 outro',
  },

  // Mélancolie dansante : guitare en arpège, accord mineur emprunté sur le 3e degré
  enjoysilence: {
    key: 'C minor', groove: 'hinrg', emotion: 'melancolie',
    sections: {
      intro: { bars: 8, chords: 'i | VI | iii | VII', drums: 'light', pad: 'swell', guitar: 'pluck' },
      verse: { bars: 16, chords: 'i | iii | VI | VII | i | iii | iv | v', drums: 'main', perc: 'main', bass: '8', pad: 'sustain', lead: 'verse' },
      chorus: { bars: 8, chords: 'VI | VII | i | iv', drums: 'full', perc: 'full', bass: '8', pad: 'sustain', guitar: 'pluck', lead: 'hook' },
      instr: { bars: 8, chords: 'i | iii | VI | VI', drums: 'main', bass: '8', pad: 'sustain', guitar: 'pluck' },
      outro: { bars: 8, chords: 'i | VI | iii | VII', drums: 'break', pad: 'swell', guitar: 'pluck', lead: 'long', fill: false },
    },
    form: 'intro verse chorus instr verse chorus instr outro',
  },

  // Élan obstiné : batterie à toms, cordes piquées, ascension vers le refrain
  runninghill: {
    key: 'C minor', groove: 'tom', emotion: 'espoir',
    sections: {
      intro: { bars: 8, chords: 'VI | VII | i | v', drums: 'main', bass: 'whole', pad: 'sustain' },
      verse: { bars: 16, chords: 'i | VI | VII | i | iv | VI | VII | VII', drums: 'main', bass: 'whole', pad: 'sustain', lead: 'verse' },
      chorus: { bars: 8, chords: 'VI | VII | i | III/VII', drums: 'full', bass: '8', strings: 'pulse8', pad: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'iv | v | VI | VII', drums: 'break', strings: 'swell', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'VI | VII | i | i', drums: 'main', bass: 'whole', pad: 'sustain', strings: 'pulse8', fill: false },
    },
    form: 'intro verse chorus verse chorus bridge chorus*2 outro',
  },

  // Rêve urbain : gros snare, lead « voix » de synthé, sortie en solo de saxophone
  midnightcity: {
    key: 'B minor', groove: 'big', emotion: 'euphorie',
    sections: {
      intro: { bars: 8, chords: 'III | VII | i | VI', drums: 'main', pad: 'sustain', lead: 'hook' },
      verse: { bars: 16, chords: 'i | VI | III | VII | iv | VI | III | V', drums: 'main', bass: 'gallop', pad: 'sustain', lead: 'verse' },
      chorus: { bars: 8, chords: 'VI | III | VII | i', drums: 'full', bass: 'gallop', pad: 'sustain', arp: 'up16', lead: 'hook' },
      break: { bars: 8, chords: 'VI | VII | i | i', drums: 'break', pad: 'swell', lead: 'long' },
      solo: { bars: 16, chords: 'i | VI | III | VII', drums: 'full', bass: 'gallop', pad: 'sustain', arp: 'up16', sax: 'solo' },
    },
    form: 'intro verse chorus verse chorus break chorus solo',
  },

  // Douceur héroïque : arpège continu, voix tendre, harmonie majeure qui s'ouvre
  realhero: {
    key: 'F major', groove: 'softpop', emotion: 'tendresse',
    sections: {
      intro: { bars: 8, chords: 'I | iii | vi | IV', drums: 'off', pad: 'swell', arp: 'up16' },
      verse: { bars: 16, chords: 'I | iii | vi | IV | ii | IV | V | V', drums: 'light', bass: 'whole', pad: 'sustain', arp: 'up16', lead: 'verse' },
      chorus: { bars: 8, chords: 'IV | V | vi | Iadd9', drums: 'full', bass: '8', pad: 'sustain', arp: 'up16', lead: 'hook' },
      bridge: { bars: 8, chords: 'vi | IV | I | Vsus4', drums: 'break', pad: 'swell', arp: 'up8', lead: 'long' },
      outro: { bars: 8, chords: 'I | iii | vi | IV', drums: 'off', pad: 'swell', arp: 'up16', fill: false },
    },
    form: 'intro verse chorus verse chorus bridge chorus outro',
  },

  /* ================= EDM mélodique ================= */

  // Piano house euphorique : montée en caisse claire, silence, drop au lead
  levels: {
    key: 'C♯ minor', groove: 'four', emotion: 'euphorie', sc: true,
    sections: {
      intro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', keys: 'house' },
      break: { bars: 8, chords: 'VI | VII | i | III', drums: 'off', pad: 'swell', keys: 'sustain', lead: 'long' },
      build: { bars: 8, chords: 'VI | VII | i | III', drums: 'build', keys: 'house', lead: 'rise', gap: true },
      drop: { bars: 16, chords: 'i | VI | III | VII', drums: 'drop', bass: 'offbeat', keys: 'house', pad: 'stabs', lead: 'drop' },
      break2: { bars: 8, chords: 'iv | VI | III | VII', drums: 'break', pad: 'swell', keys: 'sustain', lead: 'long' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'main', bass: 'offbeat', keys: 'house', fill: false },
    },
    form: 'intro break build drop break2 build drop outro',
  },

  // Hymne de festival : couplet au piano, montée, drop lumineux, cordes au dernier tour
  dywc: {
    key: 'D major', groove: 'four', emotion: 'espoir', sc: true,
    sections: {
      intro: { bars: 8, chords: 'vi | IV | I | V', drums: 'off', keys: 'ballad' },
      verse: { bars: 16, chords: 'vi | IV | I | V | ii | IV | vi | V', drums: 'hats', keys: 'ballad', pad: 'swell', lead: 'verse' },
      build: { bars: 8, chords: 'IV | V | vi | vi', drums: 'build', keys: 'block4', pad: 'sustain', lead: 'rise', gap: true },
      drop: { bars: 16, chords: 'vi | IV | I | V', drums: 'drop', bass: 'offbeat', keys: 'stabs', pad: 'sustain', strings: 'sustain', lead: 'drop' },
      break: { bars: 8, chords: 'IV | I | V | vi', drums: 'off', keys: 'ballad', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'vi | IV | I | V', drums: 'main', bass: 'offbeat', keys: 'stabs', fill: false },
    },
    form: 'intro verse build drop break build drop outro',
  },

  // Folk et house : guitare acoustique au couplet, montée, drop au lead « country »
  wakemeup: {
    key: 'B minor', groove: 'four', emotion: 'espoir', sc: true,
    sections: {
      intro: { bars: 8, chords: 'i | III | VII | VI', drums: 'off', guitar: 'strum' },
      verse: { bars: 16, chords: 'i | III | VII | VI | i | III | VII | VII', drums: 'hats', guitar: 'strum', lead: 'verse' },
      build: { bars: 8, chords: 'VI | VII | i | III', drums: 'build', guitar: 'strum', keys: 'house', lead: 'rise', gap: true },
      drop: { bars: 16, chords: 'i | VI | III | VII', drums: 'drop', bass: 'offbeat', guitar: 'strum', keys: 'house', pad: 'sustain', lead: 'drop' },
      break: { bars: 8, chords: 'VI | III | VII | i', drums: 'off', guitar: 'pluck', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'i | III | VII | VI', drums: 'main', guitar: 'strum', fill: false },
    },
    form: 'intro verse build drop break verse build drop outro',
  },

  // Tropical house : tempo posé, marimba / flûte au drop, tout en douceur
  firestone: {
    key: 'D major', groove: 'tropical', emotion: 'tendresse', sc: true,
    sections: {
      intro: { bars: 8, chords: 'vi | V | IV | V', drums: 'off', keys: 'ballad' },
      verse: { bars: 16, chords: 'vi | V | IV | I | ii | IV | V | V', drums: 'light', perc: 'main', keys: 'ballad', lead: 'verse' },
      build: { bars: 8, chords: 'IV | V | vi | V', drums: 'build', keys: 'block4', pad: 'swell', gap: true },
      drop: { bars: 16, chords: 'vi | V | IV | V', drums: 'drop', perc: 'full', bass: 'walk', keys: 'chop', pad: 'swell', lead: 'drop' },
      break: { bars: 8, chords: 'IV | I | V | vi', drums: 'hats', keys: 'ballad', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'vi | V | IV | V', drums: 'light', perc: 'main', keys: 'chop', fill: false },
    },
    form: 'intro verse build drop break build drop outro',
  },

  // Électro-pop triomphante : septièmes au piano, refrain, montée et drop « big room »
  clarity: {
    key: 'A♭ major', groove: 'four', emotion: 'triomphe', sc: true,
    sections: {
      intro: { bars: 8, chords: 'ii7 | IV | vi7 | V', drums: 'off', keys: 'ballad' },
      verse: { bars: 16, chords: 'ii7 | IV | vi7 | V | ii7 | IV | iii7 | V', drums: 'hats', bass: 'whole', keys: 'ballad', lead: 'verse' },
      chorus: { bars: 8, chords: 'IV | V | vi | iii7', drums: 'main', bass: '8', keys: 'block4', pad: 'sustain', lead: 'hook' },
      build: { bars: 8, chords: 'IV | V | vi | V', drums: 'build', keys: 'block4', arp: 'rise', gap: true },
      drop: { bars: 16, chords: 'ii7 | IV | vi | V', drums: 'drop', bass: 'offbeat', keys: 'stabs', pad: 'sustain', lead: 'drop', arp: 'up16' },
      break: { bars: 8, chords: 'IV | I | V | vi', drums: 'off', keys: 'ballad', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'ii7 | IV | vi7 | V', drums: 'main', bass: 'offbeat', keys: 'block4', fill: false },
    },
    form: 'intro verse chorus build drop break chorus build drop outro',
  },

  // Disco-house d'été : guitare funky en contretemps, drop solaire
  summer: {
    key: 'G major', groove: 'four', emotion: 'joie', sc: true,
    sections: {
      intro: { bars: 8, chords: 'IV | vi | V | ii', drums: 'light', perc: 'main', guitar: 'chop' },
      verse: { bars: 16, chords: 'IV | vi | V | ii | IV | iii | ii | V', drums: 'main', perc: 'main', bass: '8', guitar: 'chop', lead: 'verse' },
      build: { bars: 8, chords: 'IV | V | iii | vi', drums: 'build', guitar: 'chop', pad: 'swell', lead: 'rise', gap: true },
      drop: { bars: 16, chords: 'IV | V | iii | vi', drums: 'drop', perc: 'full', bass: 'offbeat', guitar: 'chop', pad: 'stabs', lead: 'drop' },
      break: { bars: 8, chords: 'ii | IV | I | V', drums: 'break', pad: 'swell', guitar: 'strum', lead: 'long' },
      outro: { bars: 8, chords: 'IV | vi | V | ii', drums: 'main', perc: 'main', guitar: 'chop', fill: false },
    },
    form: 'intro verse build drop verse break build drop outro',
  },

  // Progressive house : très longue montée, arpège qui clignote, drop tardif
  strobe: {
    key: 'A major', groove: 'four', emotion: 'serenite', sc: true,
    sections: {
      intro: { bars: 16, chords: 'vi | IV | I | V | vi | IV | ii | V', drums: 'off', pad: 'swell' },
      theme: { bars: 16, chords: 'vi | IV | I | V | vi | IV | ii | V', drums: 'hats', pad: 'sustain', arp: 'strobe' },
      groove: { bars: 16, chords: 'vi | IV | I | V', drums: 'main', bass: 'offbeat', pad: 'sustain', arp: 'strobe' },
      break: { bars: 16, chords: 'IV | V | iii | vi | IV | V | I | I', drums: 'off', pad: 'swell', arp: 'strobe', lead: 'long' },
      build: { bars: 8, chords: 'IV | V | vi | vi', drums: 'build', pad: 'sustain', arp: 'rise', gap: true },
      drop: { bars: 16, chords: 'vi | IV | I | V', drums: 'drop', bass: 'offbeat', pad: 'sustain', arp: 'strobe', lead: 'hook' },
      outro: { bars: 16, chords: 'vi | IV | I | V', drums: 'light', pad: 'swell', arp: 'strobe', fill: false },
    },
    form: 'intro theme groove break build drop outro',
  },

  // Une seule idée qui grandit : arpège seul, puis nappe, batterie, longue montée, drop final
  opus: {
    key: 'F♯ minor', groove: 'four', emotion: 'triomphe', sc: true,
    sections: {
      intro: { bars: 16, chords: 'i | VI | III | VII | iv | VI | VII | VII', drums: 'off', arp: 'updown16' },
      theme: { bars: 16, chords: 'i | VI | III | VII | iv | VI | VII | VII', drums: 'hats', pad: 'swell', arp: 'updown16' },
      groove: { bars: 16, chords: 'i | VI | III | VII | iv | VI | VII | VII', drums: 'main', bass: 'offbeat', pad: 'sustain', arp: 'updown16' },
      build: { bars: 16, chords: 'iv | VI | VII | VII', drums: 'build', pad: 'sustain', arp: 'rise', gap: true },
      drop: { bars: 32, chords: 'i | VI | III | VII | iv | VI | VII | VII', drums: 'drop', bass: 'roll', pad: 'sustain', arp: 'updown16', lead: 'hook' },
      outro: { bars: 16, chords: 'i | VI | III | VII', drums: 'off', pad: 'swell', arp: 'updown16', fill: false },
    },
    form: 'intro theme groove build drop outro',
  },

  // Mélancolie électronique : piano d'introduction, drop en demi-temps au lead pincé
  faded: {
    key: 'E♭ minor', groove: 'half', emotion: 'tristesse', sc: true,
    sections: {
      intro: { bars: 8, chords: 'i | VI | III | VII', drums: 'off', keys: 'ballad' },
      verse: { bars: 16, chords: 'i | VI | VII | v | i | VI | III | VII', drums: 'off', keys: 'ballad', pad: 'swell', lead: 'verse' },
      build: { bars: 8, chords: 'VI | VII | i | i', drums: 'build', keys: 'block4', pad: 'sustain', lead: 'rise', gap: true },
      drop: { bars: 16, chords: 'VI | VII | i | III', drums: 'drop', bass: 'whole', pad: 'stabs', lead: 'drop' },
      break: { bars: 8, chords: 'iv | VI | VII | i', drums: 'off', keys: 'ballad', lead: 'long' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'off', keys: 'ballad', pad: 'swell', fill: false },
    },
    form: 'intro verse build drop break build drop outro',
  },

  // Deep house hypnotique : longue respiration, guitare en écho, arpège qui s'épanouit
  innerbloom: {
    key: 'E♭ major', groove: 'deep', emotion: 'serenite', sc: true,
    sections: {
      intro: { bars: 16, chords: 'vi | IV | I | V', drums: 'off', pad: 'swell' },
      groove: { bars: 16, chords: 'vi | IV | I | V', drums: 'light', perc: 'main', bass: 'whole', pad: 'sustain' },
      theme: { bars: 16, chords: 'vi | IV | Imaj7 | Vsus4', drums: 'main', perc: 'main', bass: 'walk', pad: 'sustain', guitar: 'pluck' },
      peak: { bars: 16, chords: 'IV | V | vi | iii', drums: 'full', perc: 'full', bass: 'walk', pad: 'sustain', guitar: 'pluck', arp: 'up16' },
      break: { bars: 16, chords: 'IV | I | V | vi', drums: 'off', pad: 'swell', arp: 'up8' },
      outro: { bars: 16, chords: 'vi | IV | I | V', drums: 'light', perc: 'main', pad: 'swell', guitar: 'pluck', fill: false },
    },
    form: 'intro groove theme peak break theme peak outro',
  },

  /* ================= Techno mélodique =================
   * Points communs : intro planante sans batterie (nappe ouverte, arpège en croches pointées, filtre qui s'ouvre),
   * montées de 8 à 16 mesures (passe-haut, bruit blanc, roulement en ratchets, un temps de silence), drops
   * puissants (impact, cymbale, kick 909 plein, basse « et-a » sidechainée, lead et nappe en accords piqués).
   */

  // Arpège analogique obsédant (façon Moog), mélancolie cosmique, deux montées
  powersoften: {
    key: 'C♯ minor', groove: 'rolling', emotion: 'mystere', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | VI | VI | III | III | VII | VII', drums: 'off', bass: 'drone', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 16, chords: 'i | i | VI | VI | iv | iv | VII | VII', drums: 'main', perc: 'main', bass: 'off16', pad: 'sustain', arp: 'ost16' },
      build: { bars: 8, chords: 'iv | VI | VII | VII', drums: 'build', pad: 'sustain', arp: 'ost16', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'i | VI | III | VII', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'drop', fx: 'down' },
      break: { bars: 16, chords: 'VI | VII | i | i | VI | VII | III | V', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      drop2: { bars: 16, chords: 'i | VI | III | VII | iv | VI | VII | VII', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'drop', fx: 'down' },
      outro: { bars: 16, chords: 'i | VI | III | VII', drums: 'light', perc: 'main', bass: 'off16', pad: 'swell', arp: 'ost16', fill: false },
    },
    form: 'intro groove build drop break build drop2 outro',
  },

  // Épopée cinématique : chœur, lead supersaw immense, montée sur la dominante majeure
  eternity: {
    key: 'C minor', groove: 'rolling', emotion: 'triomphe', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | VI | VI | III | III | VII | VII', drums: 'off', pad: 'float', vox: 'long', fx: 'swell', float: true, fill: false },
      theme: { bars: 16, chords: 'i | VI | III | VII', drums: 'hats', bass: 'drone', pad: 'sustain', arp: 'up16', lead: 'long' },
      build: { bars: 8, chords: 'VI | VII | iv | V', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'i | VI | III | VII', drums: 'drop', bass: 'roll', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'long', fx: 'down' },
      break: { bars: 16, chords: 'VI | III | VII | i | iv | VI | VII | VII', drums: 'off', pad: 'float', vox: 'verse', lead: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 8, chords: 'iv | VI | VII | V', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', vox: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 16, chords: 'i | VI | III | VII | iv | VI | v | VII', drums: 'drop', bass: 'roll', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'hook', fx: 'down' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', bass: 'drone', pad: 'swell', arp: 'up16', fill: false },
    },
    form: 'intro theme build drop break build2 drop2 outro',
  },

  // Riff de lead hypnotique en doubles-croches, techno sombre et ample
  upperground: {
    key: 'E minor', groove: 'techno', emotion: 'suspense', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | VII | VII | VI | VI | VII | VII', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 16, chords: 'i | VII | VI | VII', drums: 'main', perc: 'main', bass: 'off16', pad: 'stabs', lead: 'riff' },
      build: { bars: 8, chords: 'iv | iv | VI | VII', drums: 'build', pad: 'sustain', lead: 'riff', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i | VII | VI | VII', drums: 'drop', perc: 'full', bass: 'off16', pad: 'sustain', arp: 'ost16', lead: 'riff', fx: 'down' },
      break: { bars: 16, chords: 'VI | VII | i | i', drums: 'off', pad: 'float', lead: 'long', arp: 'dotted', fx: 'swell', float: true, fill: false },
      drop2: { bars: 16, chords: 'i | VII | VI | VII | iv | VI | VII | V', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'drop', fx: 'down' },
      outro: { bars: 16, chords: 'i | VII | VI | VII', drums: 'light', perc: 'main', bass: 'off16', lead: 'riff', fill: false },
    },
    form: 'intro groove build drop break build drop2 outro',
  },

  // Voix grave et guitare réverbérée, puis drop sombre au lead saturé
  returntooz: {
    key: 'D minor', groove: 'rolling', emotion: 'melancolie', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | VI | VI | III | III | VII | VII', drums: 'off', pad: 'float', guitar: 'pluck', vox: 'long', fx: 'swell', float: true, fill: false },
      verse: { bars: 16, chords: 'i | VI | III | VII', drums: 'main', perc: 'main', bass: 'off16', pad: 'sustain', guitar: 'pluck', vox: 'verse' },
      build: { bars: 8, chords: 'VI | VII | i | i', drums: 'build', pad: 'sustain', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'i | VI | VII | v', drums: 'drop', perc: 'full', bass: 'roll', pad: 'stabs', lead: 'drop', fx: 'down' },
      break: { bars: 16, chords: 'iv | VI | III | VII', drums: 'off', pad: 'float', guitar: 'pluck', vox: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 8, chords: 'iv | VI | VII | V', drums: 'build', pad: 'sustain', lead: 'rise', vox: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 16, chords: 'i | VI | VII | v | iv | VI | VII | V', drums: 'drop', perc: 'full', bass: 'roll', pad: 'stabs', guitar: 'pluck', lead: 'drop', fx: 'down' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', pad: 'swell', guitar: 'pluck', vox: 'long', fill: false },
    },
    form: 'intro verse build drop break build2 drop2 outro',
  },

  // Chanson tendre posée sur la techno : piano, voix, refrain qui s'envole au drop
  allthatmatters: {
    key: 'A minor', groove: 'rolling', emotion: 'tendresse', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | VI | VI | III | III | VII | VII', drums: 'off', pad: 'float', keys: 'ballad', fx: 'swell', float: true, fill: false },
      verse: { bars: 16, chords: 'i | VI | III | VII | i | VI | iv | v', drums: 'main', bass: 'offbeat', pad: 'sustain', keys: 'block4', vox: 'verse' },
      build: { bars: 8, chords: 'VI | VII | III | III', drums: 'build', pad: 'sustain', keys: 'block4', vox: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'VI | III | VII | i', drums: 'drop', bass: 'off16', pad: 'stabs', keys: 'block4', arp: 'up16', vox: 'hook', fx: 'down' },
      break: { bars: 8, chords: 'iv | i | VI | VII', drums: 'off', pad: 'float', keys: 'ballad', vox: 'long', fx: 'swell', float: true, fill: false },
      drop2: { bars: 16, chords: 'VI | III | VII | i | iv | VI | VII | VII', drums: 'drop', bass: 'off16', pad: 'stabs', keys: 'block4', arp: 'up16', vox: 'hook', fx: 'down' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', pad: 'swell', keys: 'ballad', fill: false },
    },
    form: 'intro verse build drop break build drop2 outro',
  },

  // High-tech minimal : lead ludique en doubles-croches, voix douce, groove sec et long
  gravity: {
    key: 'E minor', groove: 'minimal', emotion: 'serenite', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | III | III | VII | VII | VI | VI', drums: 'off', pad: 'float', vox: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 16, chords: 'i | III | VII | VI', drums: 'main', bass: 'off16', pad: 'stabs', lead: 'riff' },
      build: { bars: 8, chords: 'iv | VI | VII | VII', drums: 'build', pad: 'sustain', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i | III | VII | VI | i | III | iv | V', drums: 'drop', bass: 'off16', pad: 'sustain', lead: 'drop', vox: 'long', fx: 'down' },
      break: { bars: 16, chords: 'VI | VII | III | i', drums: 'off', pad: 'float', vox: 'verse', fx: 'swell', float: true, fill: false },
      drop2: { bars: 16, chords: 'i | III | VII | VI', drums: 'drop', bass: 'off16', pad: 'stabs', lead: 'riff', vox: 'answer', fx: 'down' },
      outro: { bars: 16, chords: 'i | III | VII | VI', drums: 'light', bass: 'off16', lead: 'riff', fill: false },
    },
    form: 'intro groove build drop break build drop2 outro',
  },

  // Hymne berlinois : voix chaleureuse, synthé qui monte, nappe lumineuse au majeur relatif
  skyandsand: {
    key: 'F minor', groove: 'minimal', emotion: 'nostalgie', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'VI | VI | III | III | VII | VII | i | i', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      verse: { bars: 16, chords: 'VI | III | VII | i', drums: 'main', bass: 'off16', pad: 'sustain', arp: 'up8', vox: 'verse' },
      build: { bars: 8, chords: 'iv | VI | VII | VII', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'VI | III | VII | i', drums: 'drop', bass: 'off16', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'hook', fx: 'down' },
      break: { bars: 16, chords: 'iv | VI | III | VII', drums: 'off', pad: 'float', arp: 'dotted', vox: 'long', fx: 'swell', float: true, fill: false },
      drop2: { bars: 16, chords: 'VI | III | VII | i | iv | VI | VII | VII', drums: 'drop', bass: 'off16', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'hook', fx: 'down' },
      outro: { bars: 16, chords: 'VI | III | VII | i', drums: 'light', bass: 'off16', pad: 'swell', arp: 'up8', fill: false },
    },
    form: 'intro verse build drop break build drop2 outro',
  },

  // Techno de festival : phrase vocale en écho, longue montée de 16 mesures, drop massif
  yourmind: {
    key: 'B minor', groove: 'techno', emotion: 'suspense', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | VI | VI | VII | VII | i | i', drums: 'off', pad: 'float', vox: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 16, chords: 'i | i | VI | VII', drums: 'full', perc: 'main', bass: 'off16', pad: 'stabs', vox: 'answer' },
      build: { bars: 16, chords: 'iv | iv | VI | VII', drums: 'build', pad: 'sustain', lead: 'rise', vox: 'answer', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i | VI | VII | i', drums: 'drop', perc: 'full', bass: 'roll', pad: 'stabs', lead: 'drop', vox: 'answer', fx: 'down' },
      break: { bars: 8, chords: 'VI | VII | i | i', drums: 'off', pad: 'float', lead: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 8, chords: 'iv | VI | VII | V', drums: 'build', pad: 'sustain', lead: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 16, chords: 'i | VI | VII | i | iv | VI | VII | V', drums: 'drop', perc: 'full', bass: 'roll', pad: 'stabs', lead: 'drop', vox: 'answer', fx: 'down' },
      outro: { bars: 16, chords: 'i | i | VI | VII', drums: 'light', perc: 'main', bass: 'off16', fill: false },
    },
    form: 'intro groove build drop break build2 drop2 outro',
  },

  // Deep techno des années 2000 : accords mineurs à sept, IV majeur du dorien, riff de basse hypnotique
  rej: {
    key: 'C♯ dorian', groove: 'deep', emotion: 'mystere', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i7 | i7 | IV | IV | i7 | i7 | VII | VII', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 16, chords: 'i7 | IV | i7 | IV', drums: 'main', perc: 'main', bass: 'off16', pad: 'stabs' },
      theme: { bars: 16, chords: 'i7 | IV | VII | i7 | iv | IV | VII | VII', drums: 'full', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'verse' },
      build: { bars: 8, chords: 'iv | v | VI | VII', drums: 'build', pad: 'sustain', arp: 'ost16', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'i7 | IV | i7 | IV', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'drop', fx: 'down' },
      break: { bars: 16, chords: 'VI | VII | i7 | IV', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      outro: { bars: 16, chords: 'i7 | IV | i7 | IV', drums: 'light', perc: 'main', bass: 'off16', pad: 'stabs', fill: false },
    },
    form: 'intro groove theme build drop break build drop outro',
  },

  // Piano néo-classique et cordes sur un beat minimal : lumineux, retenu, puis tout s'ouvre
  blurred: {
    key: 'E major', groove: 'minimal', emotion: 'espoir', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'vi | vi | IV | IV | I | I | V | V', drums: 'off', pad: 'float', keys: 'ballad', strings: 'swell', fx: 'swell', float: true, fill: false },
      theme: { bars: 16, chords: 'vi | IV | I | V', drums: 'hats', bass: 'drone', pad: 'sustain', keys: 'ballad', arp: 'up8' },
      groove: { bars: 16, chords: 'vi | IV | I | iii', drums: 'main', bass: 'off16', pad: 'sustain', keys: 'pluck', arp: 'up16' },
      build: { bars: 8, chords: 'IV | V | vi | vi', drums: 'build', keys: 'block4', strings: 'sustain', arp: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'vi | IV | I | V', drums: 'drop', bass: 'off16', pad: 'stabs', keys: 'pluck', strings: 'sustain', arp: 'up16', fx: 'down' },
      break: { bars: 16, chords: 'IV | I | V | vi | IV | I | ii | V', drums: 'off', keys: 'ballad', strings: 'swell', pad: 'float', fx: 'swell', float: true, fill: false },
      drop2: { bars: 16, chords: 'vi | IV | I | V | ii | IV | V | V', drums: 'drop', bass: 'off16', pad: 'stabs', keys: 'pluck', strings: 'sustain', arp: 'up16', fx: 'down' },
      outro: { bars: 16, chords: 'vi | IV | I | V', drums: 'light', pad: 'swell', keys: 'ballad', strings: 'swell', fill: false },
    },
    form: 'intro theme groove build drop break build drop2 outro',
  },
};
