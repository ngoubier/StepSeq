/*
 * Band : mixage et mastering automatiques des pistes créées par Band.
 *
 * Règles (inspirées des usages de mixage synthwave / EDM) :
 *  1. Niveau : chaque instrument est d'abord ramené à un niveau commun grâce à sa mesure (js/band-levels.js,
 *     tools/measure-levels.js), puis placé à la hauteur de son rôle (LU, en dB relatifs) : le kick et la basse
 *     portent le morceau, la caisse claire et le lead sont devant, les nappes et l'arpège derrière, les
 *     percussions en fond.
 *  2. Égalisation : un passe-haut sur tout ce qui n'a pas besoin de graves (seuls le kick et la basse descendent
 *     sous 100 Hz), un creux dans le bas-médium (250–500 Hz, la « boue ») des nappes et claviers, de la présence
 *     (2–5 kHz) pour la caisse claire et le lead, de l'air sur les cymbales.
 *  3. Dynamique : compresseur sur kick, caisse claire, basse, piano et voix lead ; sidechain sur le kick pour la
 *     basse et les nappes (fort en EDM, léger en synthwave).
 *  4. Espace : panoramique (kick, caisse claire, basse, lead au centre ; charleston, percussions, guitare et
 *     claviers répartis à gauche et à droite) ; envois vers trois bus partagés : « plate » courte pour la
 *     batterie, « hall » pour les instruments, écho ping-pong synchronisé au tempo. Kick et basse restent secs.
 *     Chorus sur les nappes, la guitare et la voix.
 *  5. Master : légère inclinaison d'EQ, compresseur « glue » 2:1 lent, puis mastering (js/master-dsp.js) : graves
 *     en mono, aigus un peu élargis, écrêtage doux des pointes, limiteur à anticipation à −1 dBTP ; gain d'entrée
 *     réglé sur la partie la plus forte du morceau (court terme −9,5 LUFS en synthwave, −8,5 en EDM, js/band-drive.js) :
 *     environ −11 à −10 LUFS intégrés pour un morceau dense, moins pour un morceau à longs breaks.
 */
window.SS = window.SS || {};

SS.bandMix = (() => {
  const eq = ({ hp, low, lm, hm, high } = {}) => ({
    on: true,
    hp: { on: !!hp, f: hp || 40 },
    low: { f: low ? low[0] : 100, g: low ? low[1] : 0 },
    lm: { f: lm ? lm[0] : 400, g: lm ? lm[1] : 0, q: lm ? lm[2] ?? 1 : 1 },
    hm: { f: hm ? hm[0] : 2500, g: hm ? hm[1] : 0, q: hm ? hm[2] ?? 1 : 1 },
    high: { f: high ? high[0] : 8000, g: high ? high[1] : 0 },
  });
  const comp = (th, ratio, att, rel, makeup = 0, knee = 6) => ({ on: true, th, ratio, att, rel, knee, makeup });

  /*
   * Règles par rôle (« rôle » ou « rôle:élément » pour la batterie).
   *   lu : niveau visé (unités de js/band-levels.js) ; pan ; eq ; comp (below : seuil en dB sous la crête mesurée
   *   du son) ; plate / hall / echo : envois ;
   *   chorus : [mix, vitesse, profondeur].
   */
  const DRUM = {
    bd: { lu: -15, below: 6, eq: eq({ hp: 30, low: [60, 1.5], lm: [350, -3.5, 1.2], hm: [3500, 2, 1] }), comp: comp(-14, 3, 0.012, 0.08, 1.5) },
    sd: { lu: -16.5, below: 6, eq: eq({ hp: 120, lm: [450, -2.5, 1], hm: [5000, 3, 0.8], high: [10000, 1.5] }), comp: comp(-16, 3, 0.005, 0.12, 1.5), plate: 0.3 },
    cp: { lu: -16.5, eq: eq({ hp: 220, high: [9000, 2] }), pan: 0.06, plate: 0.28 },
    rim: { lu: -24, eq: eq({ hp: 300 }), pan: -0.2, plate: 0.15 },
    hh: { lu: -25, eq: eq({ hp: 400, high: [10000, 2] }), pan: 0.25 },
    oh: { lu: -26, eq: eq({ hp: 350, high: [11000, 1.5] }), pan: -0.25, plate: 0.08 },
    rd: { lu: -27, eq: eq({ hp: 350, high: [11000, 1] }), pan: -0.3 },
    cr: { lu: -25, eq: eq({ hp: 350, high: [12000, 1] }), pan: -0.35, hall: 0.1 },
    lt: { lu: -20, eq: eq({ hp: 60, lm: [400, -2, 1] }), pan: 0.3, plate: 0.22 },
    mt: { lu: -20, eq: eq({ hp: 80, lm: [450, -2, 1] }), pan: 0, plate: 0.22 },
    ht: { lu: -20, eq: eq({ hp: 100, lm: [500, -2, 1] }), pan: -0.3, plate: 0.22 },
    tb: { lu: -27, eq: eq({ hp: 500, high: [10000, 1] }), pan: 0.35, plate: 0.1 },
    sh: { lu: -28, eq: eq({ hp: 500 }), pan: -0.4 },
    cb: { lu: -28, eq: eq({ hp: 300 }), pan: 0.3, plate: 0.1 },
    perc: { lu: -27, eq: eq({ hp: 150 }), pan: -0.3, plate: 0.12 },
    misc: { lu: -27, eq: eq({ hp: 150 }), pan: 0.4, plate: 0.12 },
  };
  const INST = {
    bass: { lu: -22, below: 9, eq: eq({ hp: 32, lm: [250, -2.5, 1], hm: [1200, 1.5, 1] }), comp: comp(-20, 4, 0.004, 0.1, 2) },
    pad: { lu: -20.5, eq: eq({ hp: 180, lm: [500, -2.5, 0.8], high: [9000, 1.5] }), hall: 0.4, chorus: [0.35, 0.5, 0.45] },
    strings: { lu: -21, eq: eq({ hp: 150, lm: [400, -2, 0.9], high: [10000, 1] }), hall: 0.35, pan: -0.15 },
    keys: { lu: -25, below: 8, eq: eq({ hp: 90, lm: [300, -2, 1], hm: [3000, 1, 1] }), comp: comp(-18, 2.5, 0.01, 0.15, 1), hall: 0.22, pan: 0.2 },
    guitar: { lu: -22, eq: eq({ hp: 110, lm: [350, -2.5, 1], hm: [3000, 1.5, 1] }), hall: 0.15, echo: 0.12, pan: -0.25, chorus: [0.22, 0.7, 0.35] },
    arp: { lu: -24, eq: eq({ hp: 250, lm: [600, -2, 1], hm: [3000, -1, 1.2], high: [9000, 1.5] }), hall: 0.2, echo: 0.25, pan: 0.3 },
    lead: { lu: -21, below: 7, eq: eq({ hp: 160, lm: [600, -2, 1], hm: [3000, 1.5, 0.9], high: [10000, 1] }), comp: comp(-18, 2.5, 0.01, 0.15, 1.5), hall: 0.25, echo: 0.18 },
    vox: { lu: -22, below: 8, eq: eq({ hp: 150, lm: [400, -2, 1], hm: [2500, 2, 1] }), comp: comp(-20, 3, 0.008, 0.15, 1.5), hall: 0.3, echo: 0.12, chorus: [0.2, 0.6, 0.3] },
    sax: { lu: -21, below: 7, eq: eq({ hp: 140, lm: [500, -1.5, 1], hm: [2500, 1.5, 1] }), comp: comp(-18, 2.5, 0.01, 0.15, 1), hall: 0.3, pan: 0.08 },
  };
  // percussionniste : un peu plus loin et plus écarté que le batteur
  const PERC_SHIFT = { lu: -2, pan: 1.3 };

  /** Réglages propres au style : espace, sidechain, volume visé. */
  const STYLE = {
    synthwave: {
      returns: { plate: { size: 1.6, predelay: 0.015, hp: 250, lp: 8500 }, hall: { size: 3.2, predelay: 0.035, hp: 300, lp: 6000 }, echo: { time: '3/16', feedback: 0.32, hp: 250, lp: 4000 } },
      plate: 1.25, // grosse caisse claire « années 80 »
      hall: 1.1,
      sc: { bass: 0, pad: 0.25, strings: 0.2, keys: 0 },
      loud: -9.5, // volume court terme visé pour la partie la plus forte (LUFS)
      drive: 7,
    },
    edm: {
      returns: { plate: { size: 1.2, predelay: 0.01, hp: 300, lp: 9500 }, hall: { size: 2.5, predelay: 0.025, hp: 350, lp: 7000 }, echo: { time: '3/16', feedback: 0.35, hp: 300, lp: 5000 } },
      plate: 0.7,
      hall: 1,
      sc: { bass: 0.7, pad: 0.5, strings: 0.45, keys: 0.35 },
      lu: { bass: 2.5 }, // la basse sidechainée sur les contretemps paraît plus discrète
      loud: -8.5,
      drive: 8,
    },
  };

  // gestion du gain : le mix arrive au master vers −18 LUFS, crêtes vers −6 dBFS (marge pour la glue et le limiteur)
  const HEADROOM = -11;
  const dbToGain = (db) => Math.pow(10, db / 20);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, n = 3) => +v.toFixed(n);

  /** Règle d'une piste Band (rôle, élément de batterie) ou null. */
  function ruleOf(track) {
    const key = track.band && track.band.key;
    if (!key) return null;
    const [role, sound] = key.split(':');
    if (role === 'drums' || role === 'perc') {
      const r = DRUM[sound] || DRUM.perc;
      return role === 'perc' ? { ...r, lu: r.lu + PERC_SHIFT.lu, pan: clamp((r.pan || 0) * PERC_SHIFT.pan, -0.6, 0.6) } : r;
    }
    return INST[role] || null;
  }

  /** Niveau mesuré du son de la piste (js/band-levels.js), ou null si inconnu (instrument choisi hors catalogue). */
  function measured(levelKey, isDrum, field = 0) {
    const L = SS.BAND_LEVELS;
    if (!L || !levelKey) return null;
    const v = (isDrum ? L.drum : L.inst)[levelKey];
    return v ? v[field] : null;
  }

  /**
   * Mixe les pistes créées par Band. `tracks` : pistes du projet (avec t.band) ; `levelKeys` : Map id -> clé de
   * mesure ; `style` : 'synthwave' | 'edm'. Modifie volume, mix, fx et nudge des pistes.
   */
  function mixTracks(tracks, levelKeys, style) {
    const S = STYLE[style] || STYLE.synthwave;
    const roles = new Set(tracks.map((t) => t.band && t.band.key.split(':')[0]));
    const kick = tracks.find((t) => t.band && t.band.key === 'drums:bd');
    tracks.forEach((t) => {
      const r = ruleOf(t);
      if (!r) return;
      const role = t.band.key.split(':')[0];
      const m = measured(levelKeys.get(t.id), t.type === 'drum');
      if (m != null) t.volume = round(clamp(dbToGain(r.lu + ((S.lu && S.lu[role]) || 0) + HEADROOM - m), 0.01, 2));
      // piano et guitare de part et d'autre ; sans guitare, le piano reste plus près du centre
      let pan = r.pan || 0;
      if (role === 'keys' && !roles.has('guitar')) pan = 0.12;
      if (role === 'arp' && roles.has('keys') && !roles.has('guitar')) pan = -0.3;
      t.mix = { ...JSON.parse(JSON.stringify(SS.MIX_DEFAULTS)), pan, eq: JSON.parse(JSON.stringify(r.eq || SS.MIX_DEFAULTS.eq)) };
      if (r.comp) {
        t.mix.comp = { ...r.comp };
        // seuil calé sous la crête mesurée du son (le compresseur est avant le fader) : 3 à 6 dB de réduction sur
        // les coups forts, quel que soit le niveau d'origine de l'instrument
        const pk = measured(levelKeys.get(t.id), t.type === 'drum', 1);
        if (pk != null && r.below) t.mix.comp.th = round(clamp(pk - r.below, -50, -1), 1);
      }
      const fx = { ...(t.fx || {}) };
      delete fx.room;
      delete fx.delay;
      const isSnare = role === 'drums' && ['sd', 'cp'].includes(t.band.key.split(':')[1]);
      if (r.plate) fx.sendPlate = round(Math.min(1, r.plate * (isSnare ? S.plate : 1)), 2);
      if (r.hall) fx.sendHall = round(Math.min(1, r.hall * S.hall), 2);
      if (r.echo) fx.sendEcho = r.echo;
      if (r.chorus) Object.assign(fx, { chorus: r.chorus[0], chorusRate: r.chorus[1], chorusDepth: r.chorus[2] });
      const sc = S.sc[role];
      if (kick && sc) Object.assign(fx, { scSource: kick.id, scDepth: sc, scRelease: role === 'bass' ? 0.16 : 0.22 });
      else if (fx.scSource && !sc) delete fx.scSource;
      for (const [k, v] of Object.entries(fx)) if (v === SS.FX_DEFAULTS[k]) delete fx[k];
      if (Object.keys(fx).length) t.fx = fx;
      else delete t.fx;
      // jeu humain : caisse claire et clap légèrement en retard
      if (t.band.key === 'drums:sd') t.nudge = 7;
      if (t.band.key === 'drums:cp') t.nudge = 4;
    });
  }

  /** Bus partagés et master du projet (chanson complète). `drive` : gain d'entrée du mastering (dB). */
  function mixMaster(project, style, drive) {
    const S = STYLE[style] || STYLE.synthwave;
    project.returns = SS.cleanReturns(S.returns);
    const master = JSON.parse(JSON.stringify(SS.MASTER_DEFAULTS));
    master.volume = 1;
    master.mix.eq = eq({ hp: 25, lm: [300, -1, 0.7], high: [11000, 1.5] });
    master.mix.comp = comp(-10, 2, 0.03, 0.2, 0, 8); // « glue » : 1 à 2 dB de réduction sur les passages forts
    master.mix.lim = { ...master.mix.lim, on: false }; // le limiteur du mastering prend le relais
    master.mastering = { on: true, drive, ceiling: -1, width: 1.12, mono: style === 'edm' ? 120 : 100, release: style === 'edm' ? 0.12 : 0.18, clip: 0.3 };
    project.master = master;
    delete project.masterProfile;
  }

  /** Gain d'entrée du mastering : mesuré pour chaque chanson (js/band-drive.js), sinon la valeur du style. */
  const driveFor = (presetId, style) => (SS.BAND_DRIVE && SS.BAND_DRIVE[presetId]) ?? (STYLE[style] || STYLE.synthwave).drive;

  return { mixTracks, mixMaster, driveFor, STYLE, DRUM, INST, ruleOf };
})();
