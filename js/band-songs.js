/*
 * Band : plans de chansons complètes, un par inspiration (js/band-presets.js).
 * Chaque plan est une chanson ORIGINALE « dans l'esprit » du morceau cité : tonalité, tempo, forme,
 * montée d'énergie et rôle des instruments s'en inspirent (analyses publiées : Hooktheory, Wikipedia,
 * MusicRadar, Reverb Machine…), mais les grilles d'accords et les mélodies sont nouvelles et varient
 * d'une chanson à l'autre. Les notes sont écrites par js/bandsong.js.
 *
 * Format :
 *   key : « C minor » ; groove : batterie (js/bandsong.js, G) ; emotion : js/emotions.js ; sc : sidechain basse/nappe sur le kick ; bassShift : basse transposée (12 = une octave plus haut)
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

  /* ================= Ambient ================= */

  // Aéroport sans horloge : nappes qui se chevauchent, piano rare, cloches dans le silence, aucune pulsation
  airports: {
    key: 'C major', groove: 'slow', emotion: 'serenite',
    sections: {
      intro: { bars: 8, chords: 'I | I | vi | vi', drums: 'off', pad: 'swell', arp: 'bells' },
      theme: { bars: 16, chords: 'I | I | IV | IV | vi | vi | V | I', drums: 'off', bass: 'drone', pad: 'sustain', keys: 'ballad', arp: 'bells' },
      bridge: { bars: 8, chords: 'IV | IV | ii | V', drums: 'off', bass: 'whole', pad: 'float', keys: 'pluck', arp: 'dotted' },
      peak: { bars: 16, chords: 'I | vi | IV | I | I | vi | ii | V', drums: 'light', bass: 'drone', pad: 'sustain', keys: 'ballad', arp: 'up8' },
      outro: { bars: 8, chords: 'I | I | IV | I', drums: 'off', pad: 'swell', arp: 'bells', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Piano de velours dans la réverbération : accords doux, une phrase de flûte rare
  pearl: {
    key: 'F major', groove: 'softpop', emotion: 'tendresse',
    sections: {
      intro: { bars: 8, chords: 'I | I | iii | vi', drums: 'off', keys: 'ballad', pad: 'swell' },
      theme: { bars: 16, chords: 'I | iii | vi | IV | I | iii | IV | V', drums: 'hats', perc: 'hats', bass: 'drone', keys: 'ballad', pad: 'sustain', lead: 'long' },
      bridge: { bars: 8, chords: 'vi | vi | IV | IV', drums: 'break', bass: 'whole', keys: 'pluck', pad: 'float', lead: 'long' },
      peak: { bars: 16, chords: 'I | V | vi | iii | IV | I | ii | V', drums: 'light', perc: 'hats', bass: 'whole', keys: 'ballad', pad: 'sustain', lead: 'verse' },
      outro: { bars: 8, chords: 'I | iii | IV | I', drums: 'off', keys: 'ballad', pad: 'swell', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Cassette poussiéreuse : beat tranquille, basse chaude, petit motif de boîte à musique
  roygbiv: {
    key: 'G major', groove: 'half', emotion: 'nostalgie',
    sections: {
      intro: { bars: 8, chords: 'I | I | vi | vi', drums: 'hats', pad: 'swell', arp: 'bells' },
      theme: { bars: 16, chords: 'I | vi | IV | IV | I | vi | ii | V', drums: 'light', bass: 'whole', pad: 'sustain', arp: 'bells', lead: 'long' },
      bridge: { bars: 8, chords: 'IV | IV | vi | vi', drums: 'break', bass: 'drone', pad: 'float', arp: 'dotted' },
      peak: { bars: 16, chords: 'I | vi | IV | V | I | vi | IV | I', drums: 'main', bass: 'whole', pad: 'sustain', arp: 'up8', lead: 'verse' },
      outro: { bars: 8, chords: 'I | vi | IV | I', drums: 'hats', bass: 'drone', pad: 'swell', arp: 'bells', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Chillwave d'aube : arpège doux comme un pas régulier, basse ronde, guitare claire qui rêve
  awalk: {
    key: 'A major', groove: 'half', emotion: 'emerveillement',
    sections: {
      intro: { bars: 8, chords: 'I | I | V | V', drums: 'hats', pad: 'swell', arp: 'up8' },
      theme: { bars: 16, chords: 'I | V | vi | IV | I | V | IV | IV', drums: 'light', bass: 'whole', pad: 'sustain', arp: 'up8', lead: 'long' },
      bridge: { bars: 8, chords: 'vi | vi | IV | V', drums: 'break', bass: 'drone', pad: 'float', arp: 'dotted', lead: 'long' },
      peak: { bars: 16, chords: 'I | V | vi | IV | I | V | vi | V', drums: 'main', bass: 'whole', pad: 'sustain', arp: 'up8', lead: 'verse', guitar: 'pluck' },
      outro: { bars: 8, chords: 'I | V | IV | IV', drums: 'light', bass: 'drone', pad: 'swell', arp: 'bells', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Brume aqueuse : accords égrenés, cloches de verre, grande douceur
  rhubarb: {
    key: 'E♭ major', groove: 'slow', emotion: 'serenite',
    sections: {
      intro: { bars: 8, chords: 'I | I | IV | IV', drums: 'off', pad: 'swell', arp: 'bells' },
      theme: { bars: 16, chords: 'I | iii | IV | IV | vi | vi | V | I', drums: 'hats', perc: 'hats', bass: 'drone', pad: 'sustain', keys: 'ballad', arp: 'bells' },
      bridge: { bars: 8, chords: 'vi | vi | ii | ii', drums: 'off', bass: 'whole', pad: 'float', keys: 'pluck', arp: 'dotted' },
      peak: { bars: 16, chords: 'I | IV | iii | vi | IV | V | I | I', drums: 'light', perc: 'hats', bass: 'whole', pad: 'sustain', keys: 'ballad', arp: 'up8' },
      outro: { bars: 8, chords: 'I | I | IV | I', drums: 'off', pad: 'swell', arp: 'bells', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Piano grave et sub profond : pulsation à peine suggérée, mélancolie lumineuse
  abandon: {
    key: 'E minor', groove: 'deep', emotion: 'melancolie',
    sections: {
      intro: { bars: 8, chords: 'i | i | VI | VI', drums: 'off', keys: 'ballad', pad: 'swell', arp: 'bells' },
      theme: { bars: 16, chords: 'i | VI | III | VII | i | VI | iv | v', drums: 'hats', bass: 'drone', keys: 'ballad', pad: 'sustain', arp: 'bells' },
      bridge: { bars: 8, chords: 'iv | iv | VI | VII', drums: 'break', bass: 'whole', keys: 'pluck', pad: 'float', arp: 'dotted' },
      peak: { bars: 16, chords: 'i | VI | III | VII | iv | VI | VII | VII', drums: 'main', bass: 'whole', keys: 'ballad', pad: 'sustain', arp: 'up8' },
      outro: { bars: 8, chords: 'i | VI | VII | i', drums: 'hats', bass: 'drone', keys: 'ballad', pad: 'swell', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Cordes tenues et piano intime : la lumière monte puis s'éteint
  nearlight: {
    key: 'C♯ minor', groove: 'slow', emotion: 'melancolie',
    sections: {
      intro: { bars: 8, chords: 'i | i | VI | VI', drums: 'off', keys: 'ballad', strings: 'swell', arp: 'bells' },
      theme: { bars: 16, chords: 'i | III | VI | VII | i | III | iv | v', drums: 'off', perc: 'hats', bass: 'drone', keys: 'ballad', strings: 'sustain', pad: 'swell', arp: 'bells' },
      bridge: { bars: 8, chords: 'iv | iv | VI | VII', drums: 'off', bass: 'whole', keys: 'pluck', strings: 'swell', pad: 'float', arp: 'dotted' },
      peak: { bars: 16, chords: 'VI | VII | i | i | iv | VI | VII | VII', drums: 'light', perc: 'hats', bass: 'whole', keys: 'ballad', strings: 'sustain', pad: 'sustain', arp: 'up8' },
      outro: { bars: 8, chords: 'i | VI | VII | i', drums: 'off', keys: 'ballad', strings: 'swell', arp: 'bells', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Trip-hop tendre : piano mélancolique, cordes planantes, beat sourd
  porcelain: {
    key: 'A minor', groove: 'half', emotion: 'nostalgie',
    sections: {
      intro: { bars: 8, chords: 'i | i | VI | VI', drums: 'hats', keys: 'ballad', pad: 'swell' },
      theme: { bars: 16, chords: 'i | VI | III | VII | i | VI | iv | v', drums: 'light', bass: 'whole', keys: 'ballad', pad: 'sustain', lead: 'long' },
      bridge: { bars: 8, chords: 'iv | iv | VI | VII', drums: 'break', bass: 'drone', keys: 'pluck', pad: 'float', arp: 'bells' },
      peak: { bars: 16, chords: 'VI | VII | i | i | VI | VII | III | v', drums: 'main', bass: 'whole', keys: 'ballad', pad: 'sustain', lead: 'verse', arp: 'bells' },
      outro: { bars: 8, chords: 'i | VI | VII | i', drums: 'hats', bass: 'drone', keys: 'ballad', pad: 'swell', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Drone orchestral : très longues tenues, presque sans mouvement, appel lointain
  sotl: {
    key: 'D dorian', groove: 'slow', emotion: 'mystere',
    sections: {
      intro: { bars: 8, chords: 'i | i | IV | IV', drums: 'off', pad: 'float', strings: 'swell', float: true },
      theme: { bars: 16, chords: 'i | i | IV | IV | VII | VII | i | i', drums: 'off', perc: 'hats', bass: 'drone', pad: 'sustain', strings: 'sustain', lead: 'long' },
      bridge: { bars: 8, chords: 'VII | VII | VI | VI', drums: 'off', bass: 'drone', pad: 'float', strings: 'swell', lead: 'long' },
      peak: { bars: 16, chords: 'i | IV | VII | i | i | IV | VI | VII', drums: 'light', perc: 'hats', bass: 'drone', pad: 'sustain', strings: 'sustain', lead: 'long' },
      outro: { bars: 8, chords: 'i | i | IV | i', drums: 'off', pad: 'swell', strings: 'swell', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  // Élévation lente : cordes qui s'ouvrent, vibraphone isolé, puis apaisement
  anending: {
    key: 'D major', groove: 'slow', emotion: 'emerveillement',
    sections: {
      intro: { bars: 8, chords: 'I | I | IV | IV', drums: 'off', pad: 'swell', arp: 'bells' },
      theme: { bars: 16, chords: 'I | V | vi | IV | I | V | IV | IV', drums: 'off', bass: 'drone', pad: 'sustain', strings: 'swell', arp: 'bells', lead: 'long' },
      bridge: { bars: 8, chords: 'vi | vi | IV | V', drums: 'off', bass: 'whole', pad: 'float', strings: 'swell', arp: 'dotted' },
      peak: { bars: 16, chords: 'I | V | vi | iii | IV | I | V | V', drums: 'light', bass: 'drone', pad: 'sustain', strings: 'sustain', arp: 'up8', lead: 'long' },
      outro: { bars: 8, chords: 'I | IV | I | I', drums: 'off', pad: 'swell', strings: 'swell', arp: 'bells', fill: false },
    },
    form: 'intro theme bridge peak theme outro',
  },

  /* ================= Techno mélodique =================
   * Points communs : filtre qui s'ouvre, montées de 8 ou 16 mesures (passe-haut, bruit blanc, roulement en ratchets,
   * un temps de silence), drops puissants (impact, cymbale, kick 909 plein, basse « et-a » sidechainée, lead et nappe
   * en accords piqués). Chaque morceau a sa forme (intro planante ou intro DJ kick + charleston, drops de 16 à 32
   * mesures, un ou deux breaks, durée de 4 à 6,5 minutes) et sa harmonie (pédale de tonique, phrygien, dorien, vamp à
   * deux accords…). Le dernier drop est toujours le sommet : percussions pleines, arpège ou lead en plus, voix en refrain.
   */

  // Bodzin, ~6 min 30 : intro DJ kick + charleston, harmonie quasi immobile (pédale de tonique), arpège Moog obsédant ; le drop 2 ajoute le lead et le iv
  powersoften: {
    key: 'C♯ minor', groove: 'rolling', emotion: 'mystere', sc: true, tech: true,
    sections: {
      intro: { bars: 32, chords: 'i | i | i | i | i | i | i | VI', drums: 'light', bass: 'drone', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 32, chords: 'i | i | i | VI | i | i | i | VII', drums: 'main', perc: 'main', bass: 'off16', pad: 'sustain', arp: 'ost16', lead: 'long' },
      build: { bars: 16, chords: 'i | i | VI | VI | i | i | iv | VII', drums: 'build', pad: 'sustain', arp: 'ost16', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i | i | i | VI | i | i | i | VII', drums: 'drop', perc: 'main', bass: 'off16', pad: 'stabs', arp: 'ost16', fx: 'down' },
      break: { bars: 16, chords: 'VI | VI | VII | VII | i | i | i | i', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 8, chords: 'iv | VI | VII | VII', drums: 'build', pad: 'sustain', arp: 'ost16', lead: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 32, chords: 'i | i | i | VI | i | i | iv | VII', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'drop', fx: 'down' },
      outro: { bars: 32, chords: 'i | i | i | VI | i | i | i | VII', drums: 'light', perc: 'main', bass: 'off16', pad: 'swell', arp: 'ost16', fill: false },
    },
    form: 'intro groove build drop break build2 drop2 outro',
  },

  // Épopée cinématique, ~4 min : chœur, supersaw immense, seconde montée de 16 mesures, drop 2 de 32 mesures avec refrain de voix
  eternity: {
    key: 'C minor', groove: 'rolling', emotion: 'triomphe', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | VI | VI | III | III | VII | VII', drums: 'off', pad: 'float', vox: 'long', fx: 'swell', float: true, fill: false },
      theme: { bars: 16, chords: 'i | VI | III | VII', drums: 'hats', bass: 'drone', pad: 'sustain', arp: 'up16', lead: 'long' },
      build: { bars: 8, chords: 'VI | VII | iv | V', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'i | VI | III | VII', drums: 'drop', bass: 'roll', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'long', fx: 'down' },
      break: { bars: 16, chords: 'VI | III | VII | i | iv | VI | VII | VII', drums: 'off', pad: 'float', vox: 'verse', lead: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 16, chords: 'iv | iv | VI | VI | VII | VII | iv | V', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', vox: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 32, chords: 'i | VI | III | VII | i | VI | III | VII | VI | VII | i | i | iv | VI | VII | V', drums: 'drop', perc: 'full', bass: 'roll', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'hook', fx: 'down' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', bass: 'drone', pad: 'swell', arp: 'up16', fill: false },
    },
    form: 'intro theme build drop break build2 drop2 outro',
  },

  // ARTBAT, ~6 min : intro DJ kick + charleston, couleur phrygienne (♭II) sombre, deux breaks différents (court avec batterie, puis long sans), drop 2 de 32 mesures avec arpège
  upperground: {
    key: 'E minor', groove: 'techno', emotion: 'suspense', sc: true, tech: true,
    sections: {
      intro: { bars: 32, chords: 'i | i | bII | bII | i | i | VII | VII', drums: 'light', pad: 'float', lead: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 16, chords: 'i | bII | i | VII', drums: 'main', perc: 'main', bass: 'off16', pad: 'stabs', lead: 'riff' },
      build: { bars: 8, chords: 'iv | iv | bII | VII', drums: 'build', pad: 'sustain', lead: 'riff', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i | bII | i | VII | i | bII | VII | VII', drums: 'drop', perc: 'main', bass: 'off16', pad: 'sustain', lead: 'riff', fx: 'down' },
      break: { bars: 8, chords: 'bII | bII | i | i', drums: 'break', pad: 'float', lead: 'riff', fx: 'swell', float: true, fill: false },
      groove2: { bars: 16, chords: 'i | bII | VII | VII', drums: 'main', perc: 'main', bass: 'off16', pad: 'stabs', arp: 'ost16' },
      break2: { bars: 16, chords: 'VI | VII | bII | i', drums: 'off', pad: 'float', lead: 'long', arp: 'dotted', fx: 'swell', float: true, fill: false },
      build2: { bars: 8, chords: 'iv | bII | VII | V', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 32, chords: 'i | bII | i | VII | i | bII | VII | VII | iv | bII | VII | V | i | bII | VII | VII', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'drop', fx: 'down' },
      outro: { bars: 16, chords: 'i | bII | i | VII', drums: 'light', perc: 'main', bass: 'off16', lead: 'riff', fill: false },
    },
    form: 'intro groove build drop break groove2 break2 build2 drop2 outro',
  },

  // Monolink, ~4 min 20 : voix grave et guitare réverbérée, vamp dorien i–IV, drop 2 plus dense (guitare, refrain de voix, percussions pleines)
  returntooz: {
    key: 'D dorian', groove: 'rolling', emotion: 'melancolie', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | IV | IV | i | i | IV | IV', drums: 'off', pad: 'float', guitar: 'pluck', vox: 'long', fx: 'swell', float: true, fill: false },
      verse: { bars: 16, chords: 'i | IV | i | IV', drums: 'main', perc: 'main', bass: 'off16', pad: 'sustain', guitar: 'pluck', vox: 'verse' },
      build: { bars: 8, chords: 'VII | VII | i | i', drums: 'build', pad: 'sustain', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'i | IV | VII | IV', drums: 'drop', perc: 'main', bass: 'roll', pad: 'stabs', lead: 'drop', fx: 'down' },
      break: { bars: 24, chords: 'IV | i | IV | VII | IV | i | VI | VII', drums: 'off', pad: 'float', guitar: 'pluck', vox: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 16, chords: 'i | i | IV | IV | VII | VII | VI | V', drums: 'build', pad: 'sustain', lead: 'rise', vox: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 24, chords: 'i | IV | VII | IV | i | IV | VI | VII | IV | i | VII | v', drums: 'drop', perc: 'full', bass: 'roll', pad: 'stabs', guitar: 'pluck', lead: 'drop', vox: 'hook', fx: 'down' },
      outro: { bars: 16, chords: 'i | IV | i | IV', drums: 'light', pad: 'swell', guitar: 'pluck', vox: 'long', fill: false },
    },
    form: 'intro verse build drop break build2 drop2 outro',
  },

  // Chanson tendre posée sur la techno, ~4 min : piano, voix, harmonie i–iv–i–v puis refrain qui s'envole ; seconde montée de 16 mesures, drop 2 de 32 mesures
  allthatmatters: {
    key: 'A minor', groove: 'rolling', emotion: 'tendresse', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | i | iv | iv | i | i | v | v', drums: 'off', pad: 'float', keys: 'ballad', fx: 'swell', float: true, fill: false },
      verse: { bars: 16, chords: 'i | iv | i | v | i | iv | i | v', drums: 'main', bass: 'offbeat', pad: 'sustain', keys: 'block4', vox: 'verse' },
      build: { bars: 8, chords: 'VI | VII | III | III', drums: 'build', pad: 'sustain', keys: 'block4', vox: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'VI | III | VII | i', drums: 'drop', bass: 'off16', pad: 'stabs', keys: 'block4', arp: 'up16', vox: 'hook', fx: 'down' },
      break: { bars: 8, chords: 'iv | i | VI | VII', drums: 'off', pad: 'float', keys: 'ballad', vox: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 16, chords: 'iv | iv | i | i | VI | VI | VII | VII', drums: 'build', pad: 'sustain', keys: 'block4', vox: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 32, chords: 'VI | III | VII | i | VI | III | VII | i | iv | VI | VII | VII | VI | III | VII | i', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', keys: 'block4', arp: 'up16', lead: 'drop', vox: 'hook', fx: 'down' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', pad: 'swell', keys: 'ballad', fill: false },
    },
    form: 'intro verse build drop break build2 drop2 outro',
  },

  // Brejcha, ~4 min 50 : high-tech minimal, vamp à deux accords i–VI, UN seul grand break long puis UN grand drop en deux temps (lead, puis voix et percussions pleines)
  gravity: {
    key: 'E minor', groove: 'minimal', emotion: 'serenite', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'i | VI | i | VI', drums: 'hats', pad: 'float', vox: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 32, chords: 'i | VI | i | VI', drums: 'main', bass: 'off16', pad: 'stabs', lead: 'riff' },
      break: { bars: 24, chords: 'VI | VII | III | i | VI | VII | III | III', drums: 'off', pad: 'float', vox: 'verse', fx: 'swell', float: true, fill: false },
      build: { bars: 16, chords: 'iv | iv | VI | VI | iv | VI | VII | VII', drums: 'build', pad: 'sustain', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i | VI | i | VII', drums: 'drop', bass: 'off16', pad: 'sustain', lead: 'riff', fx: 'down' },
      drop2: { bars: 16, chords: 'i | VI | III | VII', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', lead: 'drop', vox: 'answer', fx: 'down' },
      outro: { bars: 16, chords: 'i | VI | i | VI', drums: 'light', bass: 'off16', lead: 'riff', fill: false },
    },
    form: 'intro groove break build drop drop2 outro',
  },

  // Hymne berlinois, ~4 min 30 : voix chaleureuse, synthé qui monte, nappe lumineuse ; couplet de 32 mesures, drop 2 avec percussions pleines et iv/v en fin de boucle
  skyandsand: {
    key: 'F minor', groove: 'minimal', emotion: 'nostalgie', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'VI | VI | III | III | VII | VII | i | i', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      verse: { bars: 32, chords: 'VI | III | VII | i | VI | III | VII | i | VI | III | iv | v | VI | III | VII | i', drums: 'main', bass: 'off16', pad: 'sustain', arp: 'up8', vox: 'verse' },
      build: { bars: 8, chords: 'iv | VI | VII | VII', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'VI | III | VII | i', drums: 'drop', bass: 'off16', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'hook', fx: 'down' },
      break: { bars: 16, chords: 'iv | iv | i | i | VI | VI | VII | VII', drums: 'off', pad: 'float', arp: 'dotted', vox: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 16, chords: 'iv | VI | iv | VII | iv | VI | VII | V', drums: 'build', pad: 'sustain', arp: 'rise', lead: 'rise', vox: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 24, chords: 'VI | III | VII | i | VI | III | VII | i | iv | VI | VII | v', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'up16', lead: 'drop', vox: 'hook', fx: 'down' },
      outro: { bars: 16, chords: 'VI | III | VII | i', drums: 'light', bass: 'off16', pad: 'swell', arp: 'up8', fill: false },
    },
    form: 'intro verse build drop break build2 drop2 outro',
  },

  // Beyer & Skils, ~6 min : techno de festival, intro DJ kick + charleston, pédale de tonique en i, longues montées ; le drop 2 apporte le lead, le refrain de voix et un iv
  yourmind: {
    key: 'B minor', groove: 'techno', emotion: 'suspense', sc: true, tech: true,
    sections: {
      intro: { bars: 32, chords: 'i | i | i | i | i | i | VI | VI', drums: 'light', pad: 'float', vox: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 32, chords: 'i | i | i | VI | i | i | i | VII', drums: 'full', perc: 'main', bass: 'off16', pad: 'stabs', vox: 'answer' },
      build: { bars: 8, chords: 'iv | iv | VI | VII', drums: 'build', pad: 'sustain', lead: 'rise', vox: 'answer', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i | i | i | VII | i | i | i | VI', drums: 'drop', perc: 'main', bass: 'roll', pad: 'stabs', lead: 'riff', vox: 'answer', fx: 'down' },
      break: { bars: 16, chords: 'VI | VII | i | i', drums: 'off', pad: 'float', lead: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 16, chords: 'iv | iv | VI | VI | iv | VI | VII | V', drums: 'build', pad: 'sustain', lead: 'rise', vox: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 32, chords: 'i | VI | i | VII | i | VI | iv | VII', drums: 'drop', perc: 'full', bass: 'roll', pad: 'stabs', arp: 'ost16', lead: 'drop', vox: 'hook', fx: 'down' },
      outro: { bars: 24, chords: 'i | i | i | VI', drums: 'light', perc: 'main', bass: 'off16', fill: false },
    },
    form: 'intro groove build drop break build2 drop2 outro',
  },

  // Âme, ~6 min 30 : deep techno, dorien (i7 et IV majeur), riff de basse hypnotique, intro DJ kick + charleston ; le drop 2 (nouveau) ajoute le lead, le VII et les percussions pleines
  rej: {
    key: 'C♯ dorian', groove: 'deep', emotion: 'mystere', sc: true, tech: true,
    sections: {
      intro: { bars: 32, chords: 'i7 | i7 | IV | IV | i7 | i7 | VII | VII', drums: 'light', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      groove: { bars: 32, chords: 'i7 | IV | i7 | IV', drums: 'main', perc: 'main', bass: 'off16', pad: 'stabs' },
      theme: { bars: 16, chords: 'i7 | IV | VII | i7 | iv | IV | VII | VII', drums: 'full', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'verse' },
      build: { bars: 8, chords: 'iv | v | VI | VII', drums: 'build', pad: 'sustain', arp: 'ost16', fx: 'riser', gap: true },
      drop: { bars: 32, chords: 'i7 | IV | i7 | IV', drums: 'drop', perc: 'main', bass: 'off16', pad: 'stabs', arp: 'ost16', fx: 'down' },
      break: { bars: 16, chords: 'VI | VII | i7 | IV', drums: 'off', pad: 'float', arp: 'dotted', lead: 'long', fx: 'swell', float: true, fill: false },
      build2: { bars: 16, chords: 'IV | IV | VII | VII | iv | IV | VII | v', drums: 'build', pad: 'sustain', arp: 'ost16', lead: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 32, chords: 'i7 | IV | i7 | IV | i7 | IV | VII | IV', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', arp: 'ost16', lead: 'drop', fx: 'down' },
      outro: { bars: 16, chords: 'i7 | IV | i7 | IV', drums: 'light', perc: 'main', bass: 'off16', pad: 'stabs', fill: false },
    },
    form: 'intro groove theme build drop break build2 drop2 outro',
  },

  // Piano néo-classique et cordes sur un beat minimal, ~4 min 40 : lumineux, retenu ; drop 2 (24 mesures) où tout s'ouvre : accords piqués au piano, percussions pleines, lead
  blurred: {
    key: 'E major', groove: 'minimal', emotion: 'espoir', sc: true, tech: true,
    sections: {
      intro: { bars: 16, chords: 'vi | vi | IV | IV | I | I | V | V', drums: 'off', pad: 'float', keys: 'ballad', strings: 'swell', fx: 'swell', float: true, fill: false },
      theme: { bars: 16, chords: 'vi | IV | I | V', drums: 'hats', bass: 'drone', pad: 'sustain', keys: 'ballad', arp: 'up8' },
      groove: { bars: 16, chords: 'vi | IV | I | iii', drums: 'main', bass: 'off16', pad: 'sustain', keys: 'pluck', arp: 'up16' },
      build: { bars: 8, chords: 'IV | V | vi | vi', drums: 'build', keys: 'block4', strings: 'sustain', arp: 'rise', fx: 'riser', gap: true },
      drop: { bars: 16, chords: 'vi | IV | I | V', drums: 'drop', bass: 'off16', pad: 'stabs', keys: 'pluck', strings: 'sustain', arp: 'up16', fx: 'down' },
      break: { bars: 16, chords: 'IV | I | V | vi | IV | I | ii | V', drums: 'off', keys: 'ballad', strings: 'swell', pad: 'float', fx: 'swell', float: true, fill: false },
      build2: { bars: 16, chords: 'IV | IV | I | I | ii | ii | V | V', drums: 'build', keys: 'block4', strings: 'sustain', arp: 'rise', lead: 'rise', fx: 'riser', gap: true },
      drop2: { bars: 24, chords: 'vi | IV | I | V | vi | IV | I | V | IV | I | ii | V', drums: 'drop', perc: 'full', bass: 'off16', pad: 'stabs', keys: 'block4', strings: 'sustain', arp: 'up16', lead: 'drop', fx: 'down' },
      outro: { bars: 16, chords: 'vi | IV | I | V', drums: 'light', pad: 'swell', keys: 'ballad', strings: 'swell', fill: false },
    },
    form: 'intro theme groove build drop break build2 drop2 outro',
  },

  /* ================= Styles de nov. 2026 : une chanson de démo chacun ================= */

  // « Créer de zéro » : un départ neutre, quatre accords en Do majeur, sans effet ni couleur de style
  zero: {
    key: 'C major', groove: 'softpop', emotion: 'joie',
    sections: {
      intro: { bars: 4, chords: 'I | V | vi | IV', drums: 'hats', keys: 'sustain' },
      verse: { bars: 8, chords: 'I | V | vi | IV', drums: 'main', bass: '8', keys: 'block4', lead: 'verse' },
      chorus: { bars: 8, chords: 'IV | I | V | vi', drums: 'full', bass: '8', keys: 'pulse8', pad: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'vi | IV | I | V', drums: 'break', bass: 'whole', keys: 'sustain', pad: 'swell', lead: 'long' },
      outro: { bars: 4, chords: 'I | V | IV | I', drums: 'light', bass: 'whole', keys: 'sustain', fill: false },
    },
    form: 'intro verse chorus verse chorus bridge chorus outro',
  },

  // Pop-rock nerveux : guitare en croches du début à la fin, pré-refrain qui monte, refrain sur le IV
  brightside: {
    key: 'D♭ major', groove: 'rock', emotion: 'euphorie',
    sections: {
      intro: { bars: 8, chords: 'I | iii | IV | IV', drums: 'hats', guitar: 'pulse8' },
      verse: { bars: 16, chords: 'I | iii | IV | IV', drums: 'main', bass: 'rock8', guitar: 'pulse8', lead: 'verse' },
      pre: { bars: 8, chords: 'vi | IV | I | V', drums: 'main', bass: '8', guitar: 'pulse8', pad: 'swell', lead: 'verse' },
      chorus: { bars: 16, chords: 'IV | I | V | vi', drums: 'full', bass: 'rock8', guitar: 'strum', pad: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'vi | V | IV | IV', drums: 'break', bass: 'whole', guitar: 'pluck', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'I | iii | IV | IV', drums: 'light', bass: 'whole', guitar: 'pulse8', fill: false },
    },
    form: 'intro verse pre chorus verse pre chorus bridge chorus*2 outro',
  },

  // Disco-funk en dorien : une seule boucle de quatre accords, l'énergie vient de l'arrangement
  getlucky: {
    key: 'B dorian', groove: 'disco', emotion: 'joie',
    sections: {
      intro: { bars: 8, chords: 'i | III | v | IV', drums: 'hats', guitar: 'chop' },
      verse: { bars: 16, chords: 'i | III | v | IV', drums: 'main', perc: 'main', bass: 'disco16', guitar: 'chop', keys: 'stabs', vox: 'verse' },
      chorus: { bars: 16, chords: 'i | III | v | IV', drums: 'full', perc: 'full', bass: 'disco16', guitar: 'chop', keys: 'block4', strings: 'sustain', vox: 'hook' },
      break: { bars: 8, chords: 'i | III | v | IV', drums: 'break', bass: 'whole', keys: 'pluck', strings: 'swell', vox: 'long' },
      solo: { bars: 8, chords: 'i | III | v | IV', drums: 'full', bass: 'slap', guitar: 'chop', keys: 'stabs', vox: 'answer' },
      outro: { bars: 8, chords: 'i | III | v | IV', drums: 'main', bass: 'disco16', guitar: 'chop', fill: false },
    },
    form: 'intro verse chorus verse chorus break solo chorus*2 outro',
  },

  // Jazz-hop : accords à 7e, flûte en boucle, contrebasse qui marche au refrain
  feather: {
    key: 'F major', groove: 'boombap', emotion: 'serenite',
    sections: {
      intro: { bars: 8, chords: 'IVmaj7 | iii7 | ii7 | Imaj7', drums: 'off', keys: 'ballad' },
      verse: { bars: 16, chords: 'ii7 | V7 | Imaj7 | vi7', drums: 'main', bass: 'boombap', keys: 'chop', lead: 'verse' },
      chorus: { bars: 16, chords: 'IVmaj7 | iii7 | ii7 | V7', drums: 'full', bass: 'walking', keys: 'block4', pad: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'vi7 | ii7 | V7 | Imaj7', drums: 'light', bass: 'whole', keys: 'ballad', pad: 'swell', lead: 'solo' },
      outro: { bars: 8, chords: 'IVmaj7 | iii7 | ii7 | Imaj7', drums: 'light', keys: 'ballad', fill: false },
    },
    form: 'intro verse chorus verse chorus bridge chorus outro',
  },

  // Liquid : nappes et Rhodes, voix douce, montée courte, drop où la basse roule
  lk: {
    key: 'F minor', groove: 'dnb', emotion: 'melancolie',
    sections: {
      intro: { bars: 16, chords: 'i7 | VImaj7 | iv7 | v7', drums: 'hats', pad: 'float', keys: 'ballad' },
      verse: { bars: 32, chords: 'i7 | VImaj7 | iv7 | v7', drums: 'main', perc: 'main', bass: 'reese', pad: 'sustain', keys: 'pluck', vox: 'verse' },
      build: { bars: 8, chords: 'iv7 | v7 | VI | VII', drums: 'build', bass: 'whole', pad: 'swell', vox: 'rise' },
      drop: { bars: 32, chords: 'i7 | VImaj7 | iv7 | v7', drums: 'drop', perc: 'full', bass: 'dnbroll', pad: 'sustain', keys: 'block4', vox: 'hook' },
      break: { bars: 16, chords: 'VImaj7 | v7 | iv7 | i7', drums: 'break', pad: 'float', keys: 'ballad', vox: 'long' },
      outro: { bars: 16, chords: 'i7 | VImaj7 | iv7 | v7', drums: 'light', pad: 'swell', keys: 'ballad', fill: false },
    },
    form: 'intro verse build drop break build drop outro',
  },

  // Reggaeton pop : dembow, guitare pincée puis grattée, quatre accords mineurs en boucle
  despacito: {
    key: 'B minor', groove: 'dembow', emotion: 'joie',
    sections: {
      intro: { bars: 8, chords: 'i | VI | III | VII', drums: 'off', guitar: 'pluck' },
      verse: { bars: 16, chords: 'i | VI | III | VII', drums: 'main', perc: 'main', bass: 'dembow', guitar: 'pluck', lead: 'verse' },
      pre: { bars: 8, chords: 'VI | III | VII | i', drums: 'light', bass: 'whole', guitar: 'strum', pad: 'swell', lead: 'verse' },
      chorus: { bars: 16, chords: 'i | VI | III | VII', drums: 'full', perc: 'full', bass: 'dembow', guitar: 'strum', pad: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'VI | VII | i | i', drums: 'break', guitar: 'pluck', pad: 'swell', lead: 'long' },
      outro: { bars: 8, chords: 'i | VI | III | VII', drums: 'light', guitar: 'pluck', fill: false },
    },
    form: 'intro verse pre chorus verse pre chorus bridge chorus outro',
  },

  // Salsa dura (dans l'esprit de la salsa new-yorkaise des années 70 ; titre, grille et mélodies originaux) en clave de son
  // 2-3 : une mesure = un cycle de clave en croches (95 = 190 à la noire), deux accords par mesure de partition au montuno
  // (i–iv–V7–iv, anticipés par le piano et la basse) ; couplet à la cáscara et aux bongos, montuno à la campana, mambo
  // plus serré ; grooves salsa23 / salsa23m / salsa23x de js/bandsong.js (kit « Percussions salsa »)
  calle: {
    key: 'A minor', groove: 'salsa23', emotion: 'joie',
    sections: {
      intro: { bars: 4, chords: 'i/iv/V7/iv', drums: 'main', perc: 'main', bass: 'tumbao23', keys: 'montuno23' },
      verse: { bars: 8, chords: 'i/iv | VII7/III | i/iv | V7', drums: 'main', perc: 'main', bass: 'tumbao23', keys: 'montuno23', lead: 'verse' },
      chorus: { bars: 8, chords: 'i/iv/V7/iv', groove: 'salsa23m', drums: 'full', perc: 'full', bass: 'tumbao23', keys: 'montuno23', lead: 'hook', name: 'Montuno' },
      instr: { bars: 8, chords: 'i/iv/V7/iv', groove: 'salsa23x', drums: 'full', perc: 'full', bass: 'tumbao23', keys: 'mambo23', lead: 'answer', name: 'Mambo' },
      outro: { bars: 2, chords: 'i/iv/V7/iv | i', groove: 'salsa23m', drums: 'full', perc: 'full', bass: 'tumbao23', keys: 'montuno23', name: 'Coda', fill: false },
    },
    form: 'intro verse chorus verse chorus instr chorus outro',
  },

  // Reggae roots ensoleillé (dans l'esprit de Marley, Toots & the Maytals ; grille et mélodies originales) : one drop,
  // nyabinghi, skank de guitare et de piano sur 2 et 4, orgue bubble, basse ronde qui chante ; instrumental (mélodie en option),
  // passage dub où il ne reste que basse, batterie et orgue
  kingston: {
    key: 'A major', groove: 'onedrop', emotion: 'joie', bassShift: 12, // basse une octave plus haut (La2–Sol♯3) : ronde mais présente
    sections: {
      intro: { bars: 8, chords: 'I | IVmaj7 | I | IVmaj7', drums: 'light', perc: 'hats', bass: 'whole', guitar: 'g:reggae', pad: 'skank', keys: 'bubble' },
      verse: { bars: 16, chords: 'I | iii | IV | IV | I | iii | ii7 | V', drums: 'main', perc: 'main', bass: 'roots', guitar: 'g:reggae', pad: 'skank', keys: 'bubble', lead: 'verse' },
      chorus: { bars: 16, chords: 'IV | I | V | vi | IV | I | ii7 | V', drums: 'full', perc: 'full', bass: 'roots', guitar: 'g:roots', pad: 'skank', keys: 'bubble', lead: 'hook' },
      dub: { bars: 8, chords: 'I | IVmaj7 | I | IVmaj7', drums: 'main', perc: 'hats', bass: 'roots', keys: 'chop', energy: 0.8, name: 'Dub' },
      bridge: { bars: 8, chords: 'vi | iii | IV | I | vi | iii | IV | V', drums: 'main', perc: 'main', bass: 'onedrop', guitar: 'g:reggae', pad: 'skank', keys: 'sustain', lead: 'long' },
      outro: { bars: 8, chords: 'I | IVmaj7 | I | IVmaj7', drums: 'light', perc: 'main', bass: 'roots', guitar: 'g:reggae', pad: 'skank', keys: 'bubble', fill: false },
    },
    form: 'intro verse chorus verse chorus dub bridge chorus*2 outro',
  },

  /* ================= Clichés ================= */

  // Pop de Noël (procédés d'un tube de Noël des années 90 ; grille, mélodie et titre originaux) : ouverture lente à la boîte
  // à musique, mise en marche en shuffle, piano en croches répétées, grelots, claps, timbales, cordes et cloches ; IV qui
  // passe en mineur sur sa tierce (« iv6>3 » : Do m6/Mi♭, basse mi–mi♭–ré avec « I>7 »), dominantes secondaires B7 → Em
  // (III7 → vi) et E7 → Am7 → D7 (VI7 → ii7 → V7), cycle doo-wop I–vi–IV–V
  noel: {
    key: 'G major', groove: 'shuffle', emotion: 'joie',
    sections: {
      intro: { bars: 8, tempo: 60, chords: 'I | I>4 | IV | iv6>3 | I>7 | III7 | vi | V7', drums: 'off', keys: 'sustain', lead: 'long', fill: false },
      launch: { bars: 4, chords: 'I | vi | IV | V7', drums: 'build', perc: 'main', bass: 'shuffle', keys: 'xmas', name: 'Mise en marche' },
      verse: { bars: 16, chords: 'I | I | IV | iv6>3 | I | vi | ii7 | V7', drums: 'main', perc: 'main', bass: 'shuffle', keys: 'xmas', strings: 'sustain', lead: 'verse' },
      pre: { bars: 8, chords: 'I | III7 | vi | iv6>3 | I>7 | VI7 | ii7 | V7', drums: 'main', perc: 'main', bass: 'shuffle', keys: 'xmas', strings: 'sustain', lead: 'long' },
      chorus: { bars: 8, chords: 'I | vi | IV | V7 | I | vi | ii7/V7 | I', drums: 'full', perc: 'full', bass: 'shuffle', keys: 'xmas', strings: 'sustain', arp: 'toll', lead: 'hook' },
      bridge: { bars: 8, chords: 'III7 | vi | III7 | vi | iv6>3 | I>7 | VI7/ii7 | V7', drums: 'main', perc: 'main', bass: 'shuffle', keys: 'xmas', strings: 'sustain', lead: 'long', name: 'Pont' },
      outro: { bars: 8, chords: 'I | vi | ii7 | V7', drums: 'full', perc: 'full', bass: 'shuffle', keys: 'xmas', strings: 'sustain', arp: 'toll', lead: 'answer', name: 'Coda', fill: false },
    },
    form: 'intro launch verse pre chorus verse pre chorus bridge verse chorus*2 outro',
  },

  // Soul joyeuse : boucle à 7e, Rhodes haché, basse Motown, walking au refrain, solo d'harmonica
  lovely: {
    key: 'C♯ minor', groove: 'soul', emotion: 'joie',
    sections: {
      intro: { bars: 8, chords: 'i7 | IV7 | VIImaj7 | VImaj7', drums: 'light', keys: 'ballad' },
      verse: { bars: 16, chords: 'i7 | IV7 | VIImaj7 | VImaj7', drums: 'main', perc: 'main', bass: 'motown', keys: 'chop', lead: 'verse' },
      chorus: { bars: 16, chords: 'VImaj7 | VII7 | i7 | i7', drums: 'full', perc: 'full', bass: 'walking', keys: 'block4', lead: 'hook' },
      solo: { bars: 16, chords: 'i7 | IV7 | VIImaj7 | VImaj7', drums: 'full', bass: 'motown', keys: 'chop', lead: 'solo' },
      outro: { bars: 8, chords: 'i7 | IV7 | VIImaj7 | VImaj7', drums: 'light', bass: 'whole', keys: 'ballad', lead: 'long', fill: false },
    },
    form: 'intro verse chorus verse chorus solo chorus*2 outro',
  },

  /* ================= Mesures ternaires ================= */

  // Valse pop (modèle original) : « oum-pa-pa » du piano, basse sur le 1, refrain où l'arpège de valse et les cordes s'ouvrent ;
  // meter : mesure de la chanson (l'assistant s'ouvre dans cette mesure)
  lampions: {
    key: 'F major', groove: 'softpop', emotion: 'nostalgie', meter: '3/4',
    sections: {
      intro: { bars: 8, chords: 'I | vi | ii7 | V7', drums: 'off', keys: 'arpvalse', lead: 'long' },
      verse: { bars: 16, chords: 'I | I | vi | vi | ii7 | V7 | I | V7', drums: 'main', bass: 'valsepop', keys: 'valse3', lead: 'verse' },
      chorus: { bars: 16, chords: 'IV | V7 | iii | vi | ii7 | V7 | I | I', drums: 'full', bass: 'valsepop', keys: 'arpvalse', strings: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'vi | III7 | vi | II7 | ii7 | V7 | I | V7', drums: 'light', bass: 'valse', keys: 'valse3', strings: 'swell', lead: 'long', name: 'Pont' },
      outro: { bars: 8, chords: 'I | vi | ii7 | V7 | I | IV | I | I', drums: 'off', bass: 'whole', keys: 'arpvalse', strings: 'sustain', lead: 'answer', fill: false },
    },
    form: 'intro verse chorus verse chorus bridge chorus outro',
  },

  // Slow doo-wop 12/8 (modèle original) : cycle I–vi–IV–V, piano en triolets plaqués, basse qui balance, sax ténor
  samedisoir: {
    key: 'E♭ major', groove: 'soul', emotion: 'tendresse', meter: '12/8',
    sections: {
      intro: { bars: 4, chords: 'I | vi | IV | V7', drums: 'light', keys: 'triolets128', lead: 'long' },
      verse: { bars: 8, chords: 'I | vi | IV | V7', drums: 'main', bass: 'slow128', keys: 'triolets128', pad: 'sustain', lead: 'verse' },
      chorus: { bars: 8, chords: 'IV | iv | I | I7 | ii7 | V7 | I | V7', drums: 'full', bass: 'shuffle128', keys: 'triolets128', pad: 'sustain', lead: 'hook' },
      bridge: { bars: 8, chords: 'III7 | III7 | vi | vi | II7 | II7 | ii7 | V7', drums: 'main', bass: 'slow128', keys: 'berce128', pad: 'swell', lead: 'solo', name: 'Pont' },
      outro: { bars: 4, chords: 'I | vi | IV | I', drums: 'light', bass: 'whole', keys: 'arp128', pad: 'sustain', lead: 'answer', fill: false },
    },
    form: 'intro verse verse chorus verse chorus bridge chorus outro',
  },
};
