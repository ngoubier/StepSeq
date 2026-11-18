/*
 * Band : assistant de création d'une chanson avec un groupe de musiciens virtuels.
 * Ouvert par le bouton « Nouvelle » de l'en-tête (open, sur le projet en cours) ou par « Nouvelle chanson… » du menu (openWizard,
 * sur une chanson vide). Étapes (en trois groupes) :
 *  Fondations
 *  1. Style : deux portes, Créer ou Reprendre (une reprise tapée : titre, tempo, tonalité, parties et accords,
 *     ordre des parties — voir coverModel) ; style musical (tempo conseillé, description) et inspiration (type de chanson) ;
 *  2. Instruments : le groupe, une liste éditable de 2 à 10 musiciens (js/bandgroup.js, S.group ; musicians() en donne la forme d'un
 *     musicien d'inspiration). Par défaut : les musiciens non facultatifs de l'inspiration (sans retouche, chanson identique). Compteur
 *     « N musiciens · 2 à 10 », tuile « + Ajouter un musicien » (type, puis son : les conseillés réels du type, tuile fantôme, Annuler) ;
 *     un clic sur un musicien ouvre son panneau : nom éditable (l'onglet suit), Type, instrument phare, conseillés, toute la bibliothèque,
 *     ordre ‹ › ou glisser-déposer, Dupliquer, Retirer du groupe (confirmation, réglages et tranche de mix effacés). Un musicien ajouté a
 *     l'id « x1 »… et le rôle de son type (il joue avec le générateur de son type) ; le batteur (et tout kit, y compris un 2e Drums) choisit
 *     un kit et ses éléments (une piste par élément). Changer d'inspiration : même style, les musiciens ajoutés sont gardés ; autre
 *     style, le groupe du nouveau style. Brouillon v2 : state.group ; un brouillon v1 est migré (musiciens « dans le groupe ») ;
 *     sous la scène, l'étiquette colorée du type de chaque instrument (Drums, Basse, Accords, Arpèges, Mélodie ; un kit : Drums)
 *     qui se déplie pour le changer ; interrupteur General MIDI ;
 *  3. Tempo et tonalité : tempo (grand afficheur, − / +, curseur, Tap) et tonalité de la chanson (tonique, mode, gamme à
 *     écouter) ; changer la tonalité transpose toutes les scènes ;
 *  4. Scènes : vue session (scènes × pistes) et arrangement : ordre des blocs (glisser-déposer, ‹ ›), répétitions,
 *     longueur, nom, duplication et suppression des scènes ; écoute de la chanson dans l'ordre choisi ;
 *  5. Accords : la grille de chaque scène (comme dans Harmonie) et la fenêtre « Trouver l'inspiration » ;
 *  Instruments, scène par scène : une étape par instrument du groupe (6 à 5 + n ; le kit de batterie, toutes ses pièces, est
 *     un seul onglet ; « fx » n'en a pas). Tête « 07 Synth Bass », le type en lecture seule (le select de l’étape 2 appelle setKind), la barre de piste
 *     (On entend : Muet, Seule ; le son et le kit se choisissent à l'étape Instruments) et la colonne des scènes, puis l'éditeur du type — batterie (20 motifs, grille 5 pistes × 16 pas, fills,
 *     crash ; pour un instrument qui n'est pas un kit : motifs et « les deux / grosse caisse / caisse claire »), basse (mode de
 *     jeu, pédale, registre, approche), accords (mode de jeu, voicing), arpèges (Arp One), mélodie (l'onglet Mélodie
 *     d'Harmonie, js/melodypanel.js : intention, motif, structure, Générer / Une autre / Variante B). Les réglages sont ceux de
 *     l'instrument et de la scène : parts[section].inst[id] (instPartOf, putInstPart) ;
 *  Finaliser
 *  n+6. Effets et transitions : la frise des scènes et, à chaque jonction, montée de bruit, passe-haut global, cymbale inversée,
 *     coupure, impact, descente ; boucles de percussion par scène (S.wiz.fx, option fx de SS.bandSong.build ; voir renderFx) ;
 *  n+7. Mix : la console de la chanson (une tranche par instrument, effets, Master), pour toute la chanson ou pour une
 *     scène seulement (js/wizmix.js) ;
 *  n+8. Intégration : les pistes à importer.
 * Numéros : ST.style 1, ST.inst 2, ST.tempo 3, ST.scenes 4, ST.chords 5 ; ST.fx, ST.mix et ST.pick suivent le nombre d'instruments (n).
 * Un brouillon d'avant l'étape Effets (version < 3) est renuméroté à sa réouverture (wizRestore).
 * Une étape se désigne aussi par stepRef(n) / stepNum(ref) : « chords », « mix »… ou { inst: id }.
 * Des étapes 3 à la fin, un bandeau de commande : lecture / pause, stop, position, tempo (réglable), tonalité ;
 * aux étapes Accords, instruments et Mix, il est à droite de la colonne des scènes et joue la scène choisie en boucle.
 * Les transitions et percussions (S.wiz.fx) vont à l'option fx de SS.bandSong.build.
 * Les réglages par scène (S.wiz.parts, parts[section].inst[id] et .lead) vont à l'option parts de SS.bandSong.build, le type de chaque
 * instrument (S.wiz.kinds) à son option kinds ; sans réglage, c'est le jeu de l'inspiration.
 * Les étapes 3 et 4 écrivent des retouches du plan (S.wiz.skey, form, secs : voir specEff) ; sans retouche, c'est le plan de l'inspiration.
 * Seul « Créer la chanson » modifie le projet (après confirmation s'il a déjà des pistes) ; fermer ne change rien.
 *
 * Catalogue : js/band-presets.js (SS.Band).
 */
window.SS = window.SS || {};
SS.band = (() => {
  const B = () => SS.Band;
  let app = null;
  let el = null;
  // mel : réglages de la mélodie (étape Mélodie), gardés d'une ouverture à l'autre — voir melodyOpts()
  // hide : étape Mélodie, colonnes masquées (menu « Pistes ») ; la mélodie reste toujours affichée
  const MEL_DEFAULT = { character: 'inspiration', form: 'auto', rhythm: 'auto', complexity: 'balanced', range: 'auto', ending: 'auto', notes: 0, fine: false, profile: 'on' };
  const S = {
    kindPick: null, styleId: null, presetId: null, sel: null, cache: {}, group: null, addMode: null, add: null, confirmRm: null, allKits: false, fresh: null, wiz: null, hide: new Set(), mode: 'create', cover: null,
    mel: { ...MEL_DEFAULT },
  };

  /* ---------- Petits outils DOM ---------- */
  const $ = (q, root = document) => root.querySelector(q);
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }

  /* Icônes des rôles (traits simples, 24×24) */
  const ICON = {
    drums: '<ellipse cx="12" cy="13" rx="7" ry="2.5"/><path d="M5 13v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5"/><path d="M3 6.5h6M6 6.5v4"/><path d="M15 3l4 5M19 3l-4 5"/>',
    perc: '<path d="M7 5h4l1 15H6z"/><path d="M14 8h4l1 12h-6z"/><path d="M6.5 9h5M13.6 12h5"/>',
    bass: '<path d="M20 3l-8.5 8.5"/><path d="M11 10.5c-2-1-4.5-.3-5.5 1.6-.6 1.2-2.8 1.3-2.8 3.5 0 2.6 3 5.4 5.6 5.4 2.2 0 2.3-2.2 3.5-2.8 1.9-1 2.6-3.5 1.6-5.5z"/><path d="M8 14l2 2"/><path d="M18.5 2l3 3"/>',
    guitar: '<path d="M20 3l-7.5 7.5"/><path d="M12 9.5c-2.2-1.2-5-.4-6 1.8-.5 1-2.6 1.4-2.6 3.6 0 2.8 2.9 5.7 5.7 5.7 2.2 0 2.6-2.1 3.6-2.6 2.2-1 3-3.8 1.8-6z"/><circle cx="8.6" cy="15.4" r="1.3"/><path d="M18 2.5l3.5 3.5"/>',
    keys: '<rect x="2" y="7" width="20" height="11" rx="1.5"/><path d="M6 7v7M10 7v7M14 7v7M18 7v7"/>',
    pad: '<rect x="2" y="11" width="20" height="9" rx="1.5"/><path d="M6 11v5M10 11v5M14 11v5M18 11v5"/><path d="M3 6c3-3 6 3 9 0s6 3 9 0"/>',
    arp: '<rect x="2" y="12" width="20" height="8" rx="1.5"/><path d="M6 12v4M10 12v4M14 12v4M18 12v4"/><path d="M4 9h3V7h3V5h3V3"/>',
    lead: '<rect x="2" y="12" width="20" height="8" rx="1.5"/><path d="M6 12v4M10 12v4M14 12v4M18 12v4"/><path d="M15 9V3l4 1.5"/><circle cx="13.5" cy="9" r="1.5"/>',
    strings: '<path d="M12 2v6"/><path d="M9 8h6c0 2-1.5 2.5-1.5 4s2.5 2 2.5 4.5S14 21 12 21s-4-1.5-4-4.5S10.5 13.5 10.5 12 9 10 9 8z"/><path d="M4 21L20 5"/>',
    sax: '<path d="M14 3h4M16 3v11a5 5 0 0 1-10 0v-1"/><path d="M4 13h4"/><circle cx="16" cy="7" r=".6"/><circle cx="16" cy="10" r=".6"/>',
    vox: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
    fx: '<path d="M3 19c3 0 4-2 5-5s2-8 4-8 3 5 4 8 2 5 5 5"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  };
  const icon = (role) => `<svg viewBox="0 0 24 24">${ICON[(B().ROLES[role] || {}).icon] || ICON.keys}</svg>`;
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" class="fill"/></svg>';
  const STOP = '<svg viewBox="0 0 24 24" class="stop"><rect x="6" y="6" width="12" height="12" rx="1.5" class="fill"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" class="fill"/><rect x="14" y="5" width="4" height="14" rx="1" class="fill"/></svg>';

  /* ---------- Modèle ---------- */
  const style = () => B().STYLES.find((s) => s.id === S.styleId);
  const preset = () => (style() || { presets: [] }).presets.find((p) => p.id === S.presetId);
  const BG = () => SS.bandGroup;
  const roleOf = (mu) => B().ROLES[mu.role];
  const labelOf = (mu) => mu.name || mu.label || roleOf(mu).label;
  const colorOf = (mu) => roleOf(mu).color;

  /* ---------- Le groupe : une liste éditable de musiciens (2 à 10, js/bandgroup.js) ----------
   * S.group = { style, nextId, list: [{ id, base, name, custom?, type?, ms? }] }. Le groupe par défaut est celui de l'inspiration
   * (ses musiciens non facultatifs) ; un musicien ajouté (id « x1 »…) porte son type et son choix de son (ms). musicians() en donne
   * la forme que le reste de l'assistant connaît (celle d'un musicien de l'inspiration : id, role, pick, kits, pieces…), dans
   * l'ordre du groupe, qui est celui des onglets d'instrument. Changer de style repart du groupe du nouveau style ; changer
   * d'inspiration dans le même style repart du groupe de la nouvelle inspiration en gardant les musiciens ajoutés (à la fin). */
  function group() {
    const p = preset();
    if (!S.group || S.group.style !== S.styleId) S.group = { ...BG().defaultGroup(p || { musicians: [] }), style: S.styleId };
    return S.group;
  }
  const recMemo = new Map();
  /** Conseillés d'un type pour l'inspiration en cours (mis en mémoire : le catalogue ne change pas). */
  function recFor(kind) {
    const k = `${kind}|${S.styleId}|${S.presetId}`;
    if (!recMemo.has(k)) recMemo.set(k, BG().recommended(kind, S.styleId, S.presetId));
    return recMemo.get(k);
  }
  /** Le musicien d'un enregistrement du groupe, sous la forme d'un musicien d'inspiration. */
  function resolveMu(rec) {
    if (rec.base) {
      const base = preset().musicians.find((m) => m.id === rec.base);
      return base ? { ...base, name: rec.name, custom: !!rec.custom } : null;
    }
    const rc = recFor(rec.type);
    const mu = { id: rec.id, role: rc.role, added: true, type: rec.type, name: rec.name, custom: true, label: rec.name };
    if (rec.type === 'drums') Object.assign(mu, { kits: rc.kits, pieces: rc.pieces });
    else if (rec.type === 'orch') Object.assign(mu, { orch: true, pick: rc.pick, cat: rc.cat });
    else Object.assign(mu, { pick: rc.pick, cat: rc.cat });
    return mu;
  }
  /** Les musiciens du groupe, dans l'ordre du groupe. */
  function musicians() {
    if (!preset()) return [];
    return group().list.map(resolveMu).filter(Boolean);
  }
  const muById = (id) => musicians().find((m) => m.id === id) || null;
  const nameOf0 = (mu) => (mu.added || mu.custom ? mu.name : null);
  /** Type d'un musicien : celui qu'on a choisi (S.wiz.kinds), sinon celui de son rôle ; null pour « fx ». */
  function kindNow(mu) {
    if (mu.kits) return 'drums';
    if (mu.orch) return 'orch';
    const def = BG().typeOfRole(mu.role);
    const k = S.wiz && S.wiz.kinds && S.wiz.kinds[`${mu.id}:${mu.role}`];
    return def && k && BG().TYPES.includes(k) ? k : def;
  }
  const kindChanged = (mu) => !mu.kits && !!kindNow(mu) && kindNow(mu) !== BG().typeOfRole(mu.role);
  /** Choix d'instrument d'un musicien (le premier est le phare) : ceux de son rôle, ou les conseillés du type choisi s'il a changé. */
  const picksOf = (mu) => (kindChanged(mu) ? recFor(kindNow(mu)).pick : mu.pick);
  const catOf = (mu) => (kindChanged(mu) ? BG().CAT_OF_TYPE[kindNow(mu)] : mu.cat || roleOf(mu).cat || 'mono');

  /** Choix de départ d'un musicien (kit : le premier kit et ses éléments ; sinon le premier choix). */
  function newMs(mu) {
    if (mu.kits) {
      const extra = B().EXTRA_PIECES[mu.role === 'perc' ? 'perc' : 'drums'].filter((x) => !mu.pieces.some((pc) => pc.split('@')[0] === x));
      return { on: true, kit: mu.kits[0], pieces: [...mu.pieces.map((pc) => ({ piece: pc, on: true })), ...extra.map((pc) => ({ piece: pc, on: false }))] };
    }
    if (mu.orch) return { on: true, ens: 'chamber' };
    return { on: true, pick: 0, custom: null, ...(mu.added ? { tok: mu.pick[0] } : {}) };
  }
  /** Choix de son de chaque musicien du groupe, par id (état gardé par inspiration ; celui d'un musicien ajouté vit dans le groupe). */
  function musState() {
    const p = preset();
    if (!p) return {};
    if (!S.cache[p.id]) S.cache[p.id] = {};
    const st = S.cache[p.id];
    const out = {};
    const g = group();
    musicians().forEach((mu) => {
      if (mu.added) {
        const rec = g.list.find((r) => r.id === mu.id);
        out[mu.id] = rec.ms || (rec.ms = newMs(mu));
      } else out[mu.id] = st[mu.id] || (st[mu.id] = newMs(mu));
    });
    return out;
  }
  /** Choisit le choix n° i d'un musicien : le son choisi à l'étape Instruments (les autres étapes le retrouvent). */
  function setPick(mu, ms, i) {
    ms.pick = i;
    ms.picked = true;
    ms.custom = null;
    if (mu.added) ms.tok = picksOf(mu)[i];
  }

  /* Mode General MIDI du projet (project.gm, même réglage que la fenêtre de piste) :
     chaque choix est remplacé par son équivalent GM, le batteur joue la batterie General MIDI. */
  const gm = () => !!(app && app.project().gm);
  const toGm = (opts) => (gm() ? SS.midi.gmEquivalent(opts) : opts);
  const kitOf = (ms) => (gm() ? 'gm' : ms.kit);
  /** Choix n° i d'un musicien (avant le choix libre). */
  const choiceAt = (mu, i) => toGm(B().choiceOpts(picksOf(mu)[i], catOf(mu)));
  /** Ordre des conseillés : en mode GM, les sons déjà General MIDI (gm_*) d'abord, ils sont plus fidèles qu'une conversion. */
  const pickOrder = (mu) => {
    const pk = picksOf(mu);
    const idx = pk.map((_, i) => i);
    return gm() ? [...idx.filter((i) => pk[i].startsWith('gm_')), ...idx.filter((i) => !pk[i].startsWith('gm_'))] : idx;
  };
  /** Choix retenu : celui de l'utilisateur, sinon le premier de la liste (en mode GM, le premier son GM). */
  const effPick = (mu, ms) => (ms.picked || !gm() ? ms.pick : pickOrder(mu)[0]);

  /** Options de piste de l'instrument retenu pour un musicien (hors batterie). */
  function instOpts(mu, st = musState()[mu.id]) {
    return st.custom ? toGm(st.custom) : choiceAt(mu, effPick(mu, st));
  }
  /** Deux choix donnent le même son (en mode GM, deux conseillés peuvent se rejoindre). */
  const sameOpts = (a, b) => a.type === b.type && a.instrument === b.instrument && (a.sfv || 0) === (b.sfv || 0) && a.analog === b.analog && a.patch === b.patch;
  /** Clé de niveau (js/band-levels.js) d'un instrument : celle du son réellement joué en mode GM. */
  function instLevelKey(mu, ms) {
    if (ms.custom) return null;
    const tok = gm() ? instOpts(mu).instrument : picksOf(mu)[effPick(mu, ms)];
    return `${kindChanged(mu) ? BG().ROLE_OF_TYPE[kindNow(mu)] : mu.role}|${tok}|${catOf(mu)}`;
  }
  /** Élément de batterie résolu : { opts, label, borrowed, custom } */
  function pieceInfo(mu, pc) {
    const st = musState()[mu.id];
    if (pc.custom) {
      const o = toGm(pc.custom);
      const d = o.source === 'gm' && SS.findGmDrum(o.bank);
      return { opts: o, label: d ? d.label : B().drumLabel(o.sound), borrowed: false, custom: true };
    }
    const info = B().pieceOpts(kitOf(st), gm() ? pc.piece.split('@')[0] : pc.piece); // « cp@RolandTR909 » : en GM, le son GM du type
    if (info.opts.source === 'gm') info.label = (SS.findGmDrum(info.opts.bank) || {}).label || info.label;
    return info;
  }

  /** Effectif d'un orchestre (js/orchestra.js). */
  const ensOf = (ms) => SS.orchestra.ENS[(ms && ms.ens) || 'chamber'] || SS.orchestra.ENSEMBLES[0];
  /** Marque d'une piste créée par Band (gardée dans le projet) : sert à la retrouver pour la remplacer. */
  const tag = (p, mu, sound) => ({ style: S.styleId, preset: p.id, musician: mu.id, key: mu.role + (sound ? ':' + sound : ''), ...(mu.added ? { label: mu.name } : {}) });

  /** Pistes à créer : [{ opts, name, color, band }] */
  function plannedTracks() {
    const p = preset();
    if (!p) return [];
    const st = musState();
    const out = [];
    musicians().forEach((mu) => {
      const ms = st[mu.id];
      const color = colorOf(mu);
      if (mu.kits) {
        ms.pieces.filter((pc) => pc.on).forEach((pc) => {
          const info = pieceInfo(mu, pc);
          const name = mu.added ? `${mu.name} · ${info.label}` : mu.role === 'perc' ? `Percu · ${info.label}` : info.label;
          // levelKey : clé de la mesure de niveau (js/band-levels.js) qui sert au mixage automatique (js/bandmix.js)
          out.push({ ...info.opts, name, color, band: tag(p, mu, info.opts.sound), levelKey: pc.custom ? null : `${kitOf(ms)}|${pc.piece}` });
        });
      } else if (mu.orch) {
        // orchestre : une piste par pupitre de l'effectif choisi (js/orchestra.js)
        ensOf(ms).parts.forEach((id) => {
          const part = SS.orchestra.PART[id];
          out.push({ ...toGm(B().choiceOpts(part.tok, 'mono')), category: 'mono', name: `${mu.name} · ${part.label}`, color, band: tag(p, mu, id), levelKey: null });
        });
      } else {
        const o = instOpts(mu);
        out.push({ ...o, category: o.category || catOf(mu), name: nameOf0(mu) || roleOf(mu).short, color, band: tag(p, mu), levelKey: instLevelKey(mu, ms) });
      }
    });
    return out;
  }

  /* ---------- Écoute ---------- */
  function preview(opts) {
    try {
      SS.audio.ensureCtx();
      if (opts.type === 'drum') return SS.audio.preview({ ...opts, id: null });
      const synth = opts.type === 'synth';
      const family = synth ? 'analog' : opts.family;
      const oct = SS.findFamily(family).octave;
      const fake = synth
        ? { ...opts, type: 'instrument', id: null, family, instrument: opts.analog, junoPatch: opts.patch, octave: oct, chord: 'min' }
        : { ...opts, id: null, octave: oct, chord: 'min' };
      const root = (oct + 1) * 12;
      SS.audio.preview(fake, opts.category === 'mono' ? root : SS.chordNotes(root, 'min'));
    } catch (e) {
      console.warn(e);
    }
  }

  /* ---------- Rendu ---------- */
  /** Tempo conseillé d'un style : de la plus lente à la plus rapide de ses inspirations. */
  const styleTempo = (st) => {
    const t = st.presets.map((p) => p.tempo);
    return [Math.min(...t), Math.max(...t)];
  };
  /** Tonalités les plus fréquentes des inspirations d'un style (« Do mineur, La mineur »). */
  function styleKeys(st) {
    const n = new Map();
    st.presets.forEach((p) => {
      const sp = SS.BandSongs && SS.BandSongs[p.id];
      if (!sp) return;
      const k = SS.harmony.label(parseKeyStr(sp.key));
      n.set(k, (n.get(k) || 0) + 1);
    });
    return [...n.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]).join(', ');
  }
  /** Structure type d'un style : l'ordre des scènes de sa première inspiration (« Intro · Couplet · Refrain… »). */
  function styleForm(st) {
    const sp = SS.BandSongs && SS.BandSongs[st.presets[0].id];
    if (!sp) return '';
    return parseForm(sp.form).map((b) => (SS.bandSong.NAMES[b.id] || b.id) + (b.repeat > 1 ? ` ×${b.repeat}` : '')).join(' · ');
  }
  /** Boîtes à rythmes proposées au batteur du style. */
  function styleDrums(st) {
    const mu = st.presets[0].musicians.find((m) => m.role === 'drums');
    return mu ? mu.kits.slice(0, 3).map((k) => (B().KITS[k] || { label: k }).label).join(', ') : '';
  }

  /* Image d'un style : dessinée en canvas à la résolution de l'écran (devicePixelRatio), repère de 220 px de haut. */
  const ART_H = 220;
  const ART = {
    synthwave(g, w, h) {
      // soleil couchant rayé et grille en perspective, violet et rose
      const hy = h * 0.55;
      g.fillStyle = '#ff8a3d';
      g.beginPath();
      g.arc(w / 2, hy, 60, Math.PI, 0);
      g.fill();
      g.fillStyle = '#3a0d4a';
      for (let i = 0; i < 5; i++) g.fillRect(w / 2 - 62, hy - 10 - i * 11, 124, 3 + i * 0.6);
      g.strokeStyle = '#ff3d8b';
      g.lineWidth = 2;
      g.globalAlpha = 0.6;
      for (let i = 0; i < 9; i++) {
        const y = hy + Math.pow(i / 8, 2) * (h - hy);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      for (let i = -10; i <= 10; i++) {
        g.beginPath();
        g.moveTo(w / 2 + i * 12, hy);
        g.lineTo(w / 2 + i * 80, h);
        g.stroke();
      }
    },
    edm(g, w, h) {
      // barres d'égaliseur, bleu cyan
      for (let i = 0; i < 40; i++) {
        const v = Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * h * 0.7 + 10;
        g.fillStyle = i % 4 === 0 ? '#fff' : '#2bd1ff';
        g.globalAlpha = 0.8;
        g.fillRect(i * (w / 40) + 4, h - v, w / 40 - 5, v);
      }
    },
    ambient(g, w, h) {
      // ondes superposées, vert d'eau
      g.strokeStyle = '#9fe8d0';
      g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        g.globalAlpha = 0.15 + k * 0.1;
        g.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = h * 0.5 + Math.sin(x / 80 + k) * (20 + k * 6) + k * 8 - 20;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    },
    techno(g, w, h) {
      // cercles concentriques et stroboscope, gris acier et rouge
      const cx = w / 2;
      const cy = h * 0.52;
      g.strokeStyle = '#a4afbd';
      g.lineWidth = 1;
      for (let i = -Math.ceil(w / 16); i <= Math.ceil(w / 16); i++) {
        // faisceaux verticaux du stroboscope : un sur deux, d'intensité variable
        g.globalAlpha = 0.05 + 0.14 * Math.abs(Math.sin(i * 1.9));
        g.beginPath();
        g.moveTo(cx + i * 16, 0);
        g.lineTo(cx + i * 16, h);
        g.stroke();
      }
      for (let k = 1; k <= 11; k++) {
        const red = k % 4 === 0;
        g.strokeStyle = red ? '#ff3b2a' : '#8e99a8';
        g.lineWidth = red ? 2.5 : 1.5;
        g.globalAlpha = red ? 0.9 : 0.55 - k * 0.025;
        g.beginPath();
        g.arc(cx, cy, k * 15, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#ff3b2a';
      g.beginPath();
      g.arc(cx, cy, 11, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ff3b2a';
      g.lineWidth = 2;
      g.globalAlpha = 0.75;
      for (let i = 0; i < 5; i++) {
        const y = h * 0.12 + i * 9;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w * (0.18 - i * 0.025), y);
        g.moveTo(w, h - y);
        g.lineTo(w * (0.82 + i * 0.025), h - y);
        g.stroke();
      }
    },
  };
  const ART_BG = { synthwave: ['#1b0b2e', '#3a0d4a'], edm: ['#06121f', '#0a2a4a'], ambient: ['#0d1a1a', '#173a3a'], techno: ['#0b0c0f', '#232830'] };
  function drawArt(cv) {
    const id = cv.dataset.art;
    const cw = cv.clientWidth;
    const ch = cv.clientHeight;
    if (!cw || !ch || !ART[id]) return;
    const dpr = window.devicePixelRatio || 1;
    const px = [Math.round(cw * dpr), Math.round(ch * dpr)];
    if (cv.width !== px[0] || cv.height !== px[1]) [cv.width, cv.height] = px;
    const g = cv.getContext('2d');
    const k = px[1] / ART_H; // un repère logique de 220 px de haut, quelle que soit la largeur de la carte
    g.setTransform(k, 0, 0, k, 0, 0);
    const w = px[0] / k;
    const bg = ART_BG[id];
    const grd = g.createLinearGradient(0, 0, 0, ART_H);
    grd.addColorStop(0, bg[0]);
    grd.addColorStop(1, bg[1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, ART_H);
    g.save();
    ART[id](g, w, ART_H);
    g.restore();
    g.globalAlpha = 1;
  }
  let artObserver = null;
  /** Les images se redessinent quand leur carte change de taille (fenêtre ouverte, redimensionnée, écran tactile tourné). */
  function watchArt(cv) {
    if (typeof ResizeObserver === 'undefined') return drawArt(cv);
    if (!artObserver) artObserver = new ResizeObserver((es) => es.forEach((e) => drawArt(e.target)));
    artObserver.observe(cv);
  }

  function renderStyles() {
    const box = $('#bandStyles');
    if (artObserver) artObserver.disconnect();
    box.replaceChildren(
      ...B().STYLES.map((s) => {
        const [lo, hi] = styleTempo(s);
        const on = s.id === S.styleId;
        const cv = h('canvas', { class: 'bsty-art', 'data-art': s.id, 'aria-hidden': 'true' });
        watchArt(cv);
        return h(
          'button',
          { type: 'button', class: 'bsty' + (on ? ' active' : ''), role: 'radio', 'aria-checked': String(on), 'data-v': s.id, title: `${s.label} : ${lo}–${hi} BPM`, onclick: () => setStyle(s.id) },
          cv,
          h(
            'span',
            { class: 'bsty-body' },
            h('span', { class: 'bsty-name' }, s.label),
            h('span', { class: 'bsty-desc' }, s.desc || ''),
            h(
              'dl',
              { class: 'bsty-list' },
              h('dt', {}, 'Tempo'), h('dd', {}, `${lo}–${hi} BPM`),
              h('dt', {}, 'Tonalités'), h('dd', {}, styleKeys(s)),
              h('dt', {}, 'Structure'), h('dd', { class: 'clamp' }, styleForm(s)),
              h('dt', {}, 'Batterie'), h('dd', {}, styleDrums(s))
            )
          )
        );
      })
    );
    const st = style();
    $('#bandStyleDesc').textContent = (st || {}).desc || '';
    renderStyleCard();
  }
  /** Sous le choix du style : le tempo conseillé sur l'échelle des tempos, un trait par inspiration. */
  function renderStyleCard() {
    const st = style();
    const box = $('#bandStyleCard');
    if (!st || !box) return;
    const [lo, hi] = styleTempo(st);
    const pos = (t) => `${(100 * (t - TEMPO_MIN)) / (TEMPO_MAX - TEMPO_MIN)}%`;
    box.replaceChildren(
      h('span', { class: 'bsc-lbl' }, `${st.presets.length} inspirations ${st.label} · tempo conseillé`),
      h('b', {}, `${lo}–${hi} BPM`),
      h(
        'span',
        { class: 'bsc-scale', 'aria-hidden': 'true' },
        h('i', { class: 'bsc-reco', style: `left:${pos(lo)};width:calc(${pos(hi)} - ${pos(lo)})` }),
        ...st.presets.map((p) => h('i', { class: 'bsc-tick', style: `left:${pos(p.tempo)}`, title: `${p.song} : ${p.tempo} BPM` }))
      )
    );
  }

  function renderPresets() {
    const st = style();
    $('#bandPresets').replaceChildren(
      ...st.presets.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: 'band-preset' + (p.id === S.presetId ? ' active' : ''),
            role: 'radio',
            'aria-checked': p.id === S.presetId ? 'true' : 'false',
            onclick: () => setPreset(p.id),
          },
          h('span', { class: 'bp-song' }, p.song),
          h('span', { class: 'bp-artist' }, `${p.artist} · ${p.year}`),
          h('span', { class: 'bp-meta' }, `${p.tempo} BPM · ${p.musicians.filter((m) => !m.optional).length} musiciens`)
        )
      )
    );
  }

  /** Détail de l'inspiration choisie : titre, artiste, description et musiciens du groupe. */
  function renderSong() {
    const p = preset();
    $('#bandSong').replaceChildren(
      h('div', { class: 'bs-kind' }, 'Inspiration'),
      h('div', { class: 'bs-title' }, h('b', {}, p.song)),
      h('div', { class: 'bs-artist' }, `${p.artist} · ${p.year} · ${p.tempo} BPM`),
      h('div', { class: 'bs-desc' }, p.desc),
      h(
        'ul',
        { class: 'bs-mus' },
        ...p.musicians.map((mu) =>
          h('li', { style: `--c:${colorOf(mu)}`, title: mu.note || '' }, h('i', { 'aria-hidden': 'true' }), h('span', {}, labelOf(mu)), mu.optional ? h('small', {}, 'facultatif') : null)
        )
      )
    );
  }

  /* ---------- Porte « Créer » ou « Reprendre » ---------- */
  function renderMode() {
    const cv = cover();
    document.querySelectorAll('#bandMode [data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)));
    el.classList.toggle('cover', cv);
    $('#bandPresetsLabel').textContent = cv ? 'Le groupe joue à la façon de…' : 'Type de chanson';
    const gs = $('.band-main > .band-step b');
    if (gs) gs.textContent = cv ? '4' : '3';
    $('#bandSong').hidden = cv;
    $('#bandCover').hidden = !cv;
    if (cv) renderCover();
  }
  function setMode(m) {
    if (S.mode === m) return;
    S.mode = m;
    if (m === 'cover' && !S.cover) S.cover = COVER_DEFAULT();
    coverChanged();
    dropListen();
    renderMode();
    refresh();
    renderWiz();
  }

  /** Formulaire de la reprise : titre, tempo, tonalité, une ligne par partie, ordre des parties. */
  function renderCover() {
    const c = S.cover;
    const edit = (fn, full = false) => (e) => {
      fn(e.target.value);
      coverChanged();
      if (full) renderCover();
      else coverInfo();
      if (S.wiz) wizFoot();
    };
    const keyOpts = [h('option', { value: 'auto', selected: c.key === 'auto' }, 'Auto (1er accord)')];
    [['major', MAJOR_TONICS, 'majeur'], ['minor', MINOR_TONICS, 'mineur']].forEach(([mode, list, label]) =>
      list.forEach((t) => {
        const v = `${t} ${mode}`;
        keyOpts.push(h('option', { value: v, selected: c.key === v }, `${SS.harmony.french ? SS.harmony.french(t) : t} ${label}`));
      })
    );
    const rows = c.parts.map((pt, i) =>
      h(
        'div',
        { class: 'bcv-row' },
        h('input', { type: 'text', class: 'bcv-name', value: pt.name, 'aria-label': `Nom de la partie ${i + 1}`, placeholder: 'Couplet', oninput: edit((v) => (pt.name = v)) }),
        h('input', {
          type: 'text', class: 'bcv-chords', value: pt.chords, spellcheck: 'false', autocomplete: 'off',
          'aria-label': `Accords de la partie ${i + 1}`, placeholder: 'Am | F | C | G', oninput: edit((v) => (pt.chords = v)),
        }),
        h('button', {
          type: 'button', class: 'btn btn-icon bcv-del', title: 'Enlever cette partie', 'aria-label': `Enlever la partie ${i + 1}`, disabled: c.parts.length < 2,
          onclick: edit(() => c.parts.splice(i, 1), true), html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        }),
        h('div', { class: 'bcv-info', 'data-part': i })
      )
    );
    const field = (label, input, cls = '') => h('label', { class: 'bcv-field ' + cls }, h('span', {}, label), input);
    $('#bandCover').replaceChildren(
      h('div', { class: 'band-step' }, h('b', {}, '3'), ' La reprise'),
      h(
        'div',
        { class: 'bcv-top' },
        field('Titre', h('input', { type: 'text', id: 'bcvTitle', value: c.title, placeholder: 'Titre de la reprise', oninput: edit((v) => (c.title = v)) }), 'grow'),
        field('Tempo', h('input', { type: 'number', id: 'bcvTempo', min: TEMPO_MIN, max: TEMPO_MAX, value: c.tempo, onchange: edit((v) => {
          c.tempo = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Number(v) || 110)));
          if (S.wiz) S.wiz.tempo = null;
        }, true) })),
        h('button', { type: 'button', class: 'btn bcv-tap', title: 'Tape en rythme (4 fois ou plus) pour trouver le tempo', onclick: tapTempo }, 'Tap'),
        field('Tonalité', h('select', { id: 'bcvKey', onchange: edit((v) => (c.key = v)) }, ...keyOpts))
      ),
      h(
        'div',
        { class: 'bcv-head' },
        h('b', {}, 'Parties et accords'),
        h('small', { class: 'dlg-hint' }, '« | » sépare les mesures · « Am F » partage une mesure · « . » prolonge · « % » répète la mesure · Do, Ré… et C/E acceptés')
      ),
      h('div', { class: 'bcv-rows' }, ...rows),
      h(
        'div',
        { class: 'bcv-actions' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: edit(() => c.parts.push({ name: '', chords: '' }), true) }, '+ Partie'),
        h('button', { type: 'button', class: 'btn btn-small', title: 'Revenir à l’exemple', onclick: edit(() => (S.cover = COVER_DEFAULT()), true) }, '↺ Exemple')
      ),
      field(
        'Ordre des parties',
        h('input', { type: 'text', id: 'bcvOrder', value: c.order, spellcheck: 'false', placeholder: 'Intro Couplet Refrain Couplet Refrain ×2 Outro (vide : chaque partie une fois)', oninput: edit((v) => (c.order = v)) }),
        'wide'
      ),
      h('p', { class: 'bcv-sum', id: 'bcvSum', 'aria-live': 'polite' })
    );
    coverInfo();
  }
  /** Sous chaque partie : ses accords lus (nom et degré) ou ses erreurs ; en bas, le résumé de la reprise. */
  function coverInfo() {
    const m = coverModel();
    const H = SS.harmony;
    m.parts.forEach((pt, i) => {
      const box = document.querySelector(`#bandCover [data-part="${i}"]`);
      if (!box) return;
      if (pt.errors.length) return box.replaceChildren(h('span', { class: 'bcv-err' }, '⚠ ' + pt.errors.join(' · ')));
      const chips = pt.spans.map((sp) => {
        let g = null;
        try {
          g = H.toGridChord(m.key, { rootPc: sp.chord.rootPc, type: coverType(sp.chord.ivs) });
          const bass = (((sp.chord.bassPc - sp.chord.rootPc) % 12) + 12) % 12;
          g = g && H.gridChord(m.key, g.degree, g.type, g.acc, bass);
        } catch (e) {
          g = null;
        }
        return h('span', { class: `bcv-chip role-${g ? g.role.id : 'color'}` }, sp.chord.sym, g ? h('small', {}, g.numeral) : null);
      });
      box.replaceChildren(
        ...chips,
        h('span', { class: 'bcv-meta' }, `${pt.bars} mesure${pt.bars > 1 ? 's' : ''} · jeu : ${(SS.bandSong.NAMES[pt.as] || pt.as || '').toLowerCase()} de « ${(preset() || {}).song} »${m.used.has(i) ? '' : ' · pas dans l’ordre'}`)
      );
    });
    const sum = $('#bcvSum');
    if (!sum) return;
    sum.classList.toggle('bad', !m.spec);
    if (!m.spec) return (sum.textContent = m.errors.length ? '⚠ ' + m.errors.join(' · ') : '⚠ Ajoute au moins une partie.');
    const t = tempo();
    const sec = Math.round((m.bars * 4 * 60) / t);
    const kn = H.french ? H.french(m.key.tonic) : m.key.tonic;
    sum.textContent = `${m.spec.form.split(' ').reduce((n, f) => n + (+f.split('*')[1] || 1), 0)} blocs · ${m.bars} mesures · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} à ${t} BPM · ${kn} ${m.key.mode === 'minor' ? 'mineur' : 'majeur'}${S.cover.key === 'auto' ? ' (déduite)' : ''} · Suivant pour entendre le groupe`;
  }
  /** Tap tempo : la moyenne des derniers intervalles (on recommence après 2 s sans tape) ; null tant qu'il y a moins de 3 tapes. */
  let taps = [];
  function tapBpm() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-8);
    if (taps.length < 3) return null;
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    return Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, 60000 / avg)));
  }
  /** Tap du formulaire de la reprise. */
  function tapTempo() {
    const bpm = tapBpm();
    if (!bpm) return;
    S.cover.tempo = bpm;
    if (S.wiz) S.wiz.tempo = null;
    const inp = $('#bcvTempo');
    if (inp) inp.value = S.cover.tempo;
    coverInfo();
  }

  function stageLine(mu) {
    const ms = musState()[mu.id];
    if (mu.kits) {
      const n = ms.pieces.filter((pc) => pc.on).length;
      return `${(B().KITS[kitOf(ms)] || {}).label} · ${n} piste${n > 1 ? 's' : ''}`;
    }
    if (mu.orch) return `${ensOf(ms).label} · ${ensOf(ms).parts.length} pistes`;
    return B().describe(instOpts(mu)).name;
  }

  /** Scène : les musiciens du groupe, placés par rôle (fond, milieu, devant), puis la tuile « + Ajouter un musicien ». */
  function renderStage() {
    const st = musState();
    const list = musicians();
    const rows = B().STAGE_ROWS.map(() => []);
    list.forEach((mu, i) => {
      let r = B().STAGE_ROWS.findIndex((row) => row.includes(mu.role));
      if (r < 0) r = rows.length - 1;
      rows[r].push({ mu, i });
    });
    const order = (row, r) => row.slice().sort((a, b) => B().STAGE_ROWS[r].indexOf(a.mu.role) - B().STAGE_ROWS[r].indexOf(b.mu.role) || a.i - b.i);
    const full = list.length >= BG().MAX;
    const adding = !!S.addMode;
    let drag = null;
    const tile = ({ mu, i }) => {
      const ms = st[mu.id];
      const sel = S.sel === mu.id && !adding;
      const kd = kindNow(mu);
      return h(
        'button',
        {
          type: 'button',
          class: 'band-mus' + (sel ? ' sel' : '') + (S.fresh === mu.id ? ' fresh' : ''),
          style: `--c:${colorOf(mu)}`,
          'data-mu': mu.id,
          draggable: 'true',
          'aria-pressed': sel ? 'true' : 'false',
          'aria-label': `${mu.name}, ${kd ? KIND_LABEL[kd] : 'Effets'}, position ${i + 1}`,
          title: `${mu.name} · position ${i + 1} dans le groupe (glisser pour changer l’ordre)`,
          onclick: () => select(sel ? null : mu.id),
          ondragstart: (e) => {
            drag = mu.id;
            e.currentTarget.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', mu.id);
          },
          ondragend: (e) => {
            e.currentTarget.classList.remove('dragging');
            el.querySelectorAll('.band-mus.over').forEach((x) => x.classList.remove('over'));
          },
          ondragover: (e) => {
            e.preventDefault();
            e.currentTarget.classList.add('over');
          },
          ondragleave: (e) => e.currentTarget.classList.remove('over'),
          ondrop: (e) => {
            e.preventDefault();
            moveMember(drag || e.dataTransfer.getData('text/plain'), mu.id);
          },
        },
        h('span', { class: 'bm-ord', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'bm-avatar', html: icon(mu.role) }),
        h('span', { class: 'bm-role' }, mu.name),
        h('span', { class: 'bm-inst' }, stageLine(mu)),
        mu.kits ? h('span', { class: 'bm-badge' }, String(ms.pieces.filter((pc) => pc.on).length)) : null
      );
    };
    const left = BG().MAX - list.length;
    const ghost = adding && S.add ? { type: S.add.type, color: KIND_COLOR[S.add.type], name: S.add.name } : null;
    const addTile = adding
      ? h(
          'div',
          { class: 'band-mus pending', id: 'bgGhost', style: `--c:${ghost ? ghost.color : 'var(--accent)'}` },
          h('span', { class: 'bm-avatar', html: ghost ? `<svg viewBox="0 0 30 30">${KIND_ICON[ghost.type]}</svg>` : '<span class="bg-q">?</span>' }),
          h('span', { class: 'bm-role' }, ghost ? ghost.name : 'Nouveau musicien'),
          h('span', { class: 'bm-inst' }, ghost ? 'en cours d’ajout…' : 'choisis un type')
        )
      : h(
          'button',
          { type: 'button', class: 'band-mus band-add', id: 'bgAdd', disabled: full ? true : null, title: full ? '10 musiciens au maximum' : 'Ajouter un musicien au groupe', onclick: startAdd },
          h('span', { class: 'bm-avatar bm-plus', 'aria-hidden': 'true' }, '+'),
          h('span', { class: 'bm-role' }, 'Ajouter un musicien'),
          h('span', { class: 'bm-inst' }, full ? '10 musiciens au maximum' : `${left} place${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}`)
        );
    $('#bandStage').replaceChildren(
      h('div', { class: 'stage-back', 'aria-hidden': 'true' }),
      ...rows.map((row, r) => (row.length ? h('div', { class: 'stage-row stage-row-' + r }, ...order(row, r).map(tile)) : null)).filter(Boolean),
      h('div', { class: 'stage-row stage-row-add' }, addTile)
    );
    S.fresh = null;
  }

  /**
   * Étape 2, panneau de droite, sous le titre : le type de l'instrument du musicien (liste « Type »). Un kit de batterie ne joue
   * que Drums (liste désactivée, avec une explication). Un musicien à plusieurs instruments a une liste par instrument.
   */
  function kindSelect(mu) {
    const list = S.wiz && preset() ? insSteps().filter((T) => T.musician === mu.id) : [];
    if (!list.length) return null;
    return h(
      'div',
      { class: 'bpn-kind', id: 'bpnKind' },
      ...list.map((T) =>
        h(
          'div',
          { class: 'bpn-krow', style: `--c:${KIND_COLOR[T.kind]}`, 'data-ins': T.id },
          h('i', { class: 'bw-dot' }),
          h('label', { for: 'bpnKindSel-' + T.id.replace(/\W/g, '_') }, list.length > 1 ? `Type · ${T.name}` : 'Type'),
          h(
            'select',
            { id: 'bpnKindSel-' + T.id.replace(/\W/g, '_'), class: 'bpn-ksel', 'data-ins': T.id, disabled: T.kit ? true : null, 'aria-label': `Type de ${T.name}`, onchange: (e) => changeKind(T, e.target.value, refresh) },
            ...SS.bandSong.KINDS.map((k) => h('option', { value: k, selected: k === T.kind ? true : null, disabled: T.kit && k !== 'drums' ? true : null }, KIND_LABEL[k]))
          ),
          T.kit ? h('small', { class: 'bpn-kdesc' }, 'Un kit de batterie ne joue que des motifs de batterie.') : null
        )
      )
    );
  }

  function choiceCard(opts, { active, star, onPick, extraClass = '' }) {
    const d = B().describe(opts);
    return h(
      'div',
      { class: 'band-choice' + (active ? ' active' : '') + extraClass },
      h(
        'button',
        { type: 'button', class: 'bc-main', role: 'radio', 'aria-checked': active ? 'true' : 'false', onclick: onPick },
        h('span', { class: 'bc-kind' }, star ? '★ ' + d.kind : d.kind),
        h('span', { class: 'bc-name' }, d.name),
        h('span', { class: 'bc-detail' }, d.detail)
      ),
      h('button', { type: 'button', class: 'bc-play', title: 'Écouter', 'aria-label': 'Écouter ' + d.name, html: PLAY, onclick: () => preview(opts) })
    );
  }

  /** Nom par défaut d'un musicien (celui du rôle ou du type) : celui qu'on retrouve en vidant le nom. */
  const baseNameOf = (mu) => (mu.added ? BG().BASE_NAME[mu.type] : (preset().musicians.find((m) => m.id === mu.id) || mu).label || roleOf(mu).label);
  const soundName = (mu, ms = musState()[mu.id]) => (mu.kits ? (B().KITS[kitOf(ms)] || {}).label || '' : mu.orch ? ensOf(ms).label : B().describe(instOpts(mu, ms)).name);
  const kindName = (mu) => (kindNow(mu) ? KIND_LABEL[kindNow(mu)] : 'Effets');

  /** Renommer : le musicien, sa tuile et son onglet suivent (sans refaire le panneau, pour garder la saisie). */
  function renameMu(mu, value, final) {
    if (!final && !String(value).trim()) return;
    BG().rename(group(), mu.id, value, baseNameOf(mu));
    renderStage();
    if (S.wiz) wizFoot();
  }

  function panelHead(mu, ms) {
    const ic = h('span', { class: 'bm-avatar', html: icon(mu.role) });
    const inp = h('input', {
      type: 'text', class: 'bpn-name', id: 'bpnName', value: mu.name, maxlength: '24', 'aria-label': 'Nom du musicien', spellcheck: 'false',
      oninput: () => renameMu(mu, inp.value, false),
      onblur: () => {
        renameMu(mu, inp.value, true);
        inp.value = (muById(mu.id) || mu).name;
      },
      onkeydown: (e) => e.key === 'Enter' && inp.blur(),
    });
    return h(
      'div',
      { class: 'bpn-head', style: `--c:${colorOf(mu)}` },
      ic,
      h('div', { class: 'bpn-title' }, inp, h('small', { id: 'bpnSub' }, `${kindName(mu)} · ${soundName(mu)}`)),
      h('button', { type: 'button', class: 'btn btn-icon', id: 'bpnClose', title: 'Fermer le panneau', 'aria-label': 'Fermer le panneau', html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', onclick: () => select(null) }),
      mu.note ? h('p', { class: 'bpn-note' }, mu.note) : null
    );
  }

  /** Bas du panneau d'un musicien : place dans le groupe (‹ ›), Dupliquer, Retirer du groupe (confirmation en ligne). */
  function groupActions(mu) {
    const g = group();
    const i = g.list.findIndex((r) => r.id === mu.id);
    const n = g.list.length;
    const canRm = BG().canRemove(g);
    const canDup = BG().canAdd(g) && !!kindNow(mu);
    if (S.confirmRm === mu.id) {
      return h(
        'div',
        { class: 'bg-confirm', id: 'bgConfirm', role: 'alertdialog', 'aria-label': 'Retirer du groupe' },
        h('p', {}, 'Retirer ', h('b', {}, mu.name), ' du groupe ? Ses réglages de scène seront perdus.'),
        h('div', {}, h('button', { type: 'button', class: 'btn', id: 'bgRmNo', onclick: () => ((S.confirmRm = null), refresh()) }, 'Annuler'), h('button', { type: 'button', class: 'btn bg-hot', id: 'bgRmYes', onclick: () => removeMember(mu.id) }, 'Retirer'))
      );
    }
    return h(
      'div',
      { class: 'bg-edit' },
      h(
        'div',
        { class: 'bg-order' },
        h('span', { id: 'bgOrder' }, `Ordre ${i + 1} / ${n}`),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bgLeft', 'aria-label': 'Déplacer avant', title: 'Déplacer avant', disabled: i === 0 ? true : null, onclick: () => moveMember(mu.id, -1) }, '‹'),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bgRight', 'aria-label': 'Déplacer après', title: 'Déplacer après', disabled: i === n - 1 ? true : null, onclick: () => moveMember(mu.id, 1) }, '›')
      ),
      h(
        'div',
        { class: 'bg-actions' },
        h('button', { type: 'button', class: 'btn', id: 'bgDup', disabled: canDup ? null : true, title: !kindNow(mu) ? 'Les effets ne se dupliquent pas' : canDup ? 'Ajoute une copie de ce musicien (même son)' : '10 musiciens au maximum', onclick: () => dupMember(mu.id) }, '⧉ Dupliquer'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn bg-danger', id: 'bgRemove', disabled: canRm ? null : true, onclick: () => ((S.confirmRm = mu.id), refresh(), $('#bgRmNo') && $('#bgRmNo').focus()) }, 'Retirer du groupe')
      ),
      !canRm ? h('p', { class: 'dlg-hint bg-limit' }, '2 musiciens au minimum') : null,
      !BG().canAdd(g) ? h('p', { class: 'dlg-hint bg-limit' }, '10 musiciens au maximum : impossible de dupliquer.') : null
    );
  }

  /** Effectifs d'un orchestre (étape Instruments) : une carte par effectif, avec ses pupitres. */
  function ensCards(ms, after) {
    return [
      h('div', { class: 'bpn-sec' }, 'Effectif'),
      h(
        'div',
        { class: 'bg-ens', role: 'radiogroup', 'aria-label': 'Effectif de l’orchestre' },
        ...SS.orchestra.ENSEMBLES.map((e) =>
          h(
            'button',
            { type: 'button', class: 'band-kit bg-ensc' + (ensOf(ms).id === e.id ? ' active' : ''), role: 'radio', 'data-ens': e.id, 'aria-checked': String(ensOf(ms).id === e.id), onclick: () => ((ms.ens = e.id), after()) },
            h('span', { class: 'bk-name' }, e.label),
            h('span', { class: 'bk-detail' }, e.parts.map((id) => SS.orchestra.PART[id].label).join(', '))
          )
        )
      ),
      h('p', { class: 'dlg-hint' }, `${ensOf(ms).text} Une piste par pupitre ; l’étape Orchestration répartit la mélodie, les accords et la basse de chaque scène.`),
    ];
  }
  function renderInstPanel(mu, ms) {
    const panel = $('#bandPanel');
    const cat = catOf(mu);
    const pick = (i) => {
      setPick(mu, ms, i);
      refresh();
      preview(instOpts(mu));
    };
    // en mode GM, deux choix peuvent donner le même son : on ne garde que le premier
    const same = sameOpts;
    const cur = instOpts(mu);
    const seen = [];
    const labels = new Set();
    const cards = pickOrder(mu)
      .map((i, k) => {
        const o = choiceAt(mu, i);
        // deux réglages différents peuvent s'afficher pareil (« Instrument · Synth Lead ») : un seul
        const d = B().describe(o);
        const label = [d.kind, d.name, d.detail].join('|');
        if (seen.some((x) => same(x, o)) || labels.has(label)) return null;
        seen.push(o);
        labels.add(label);
        return choiceCard(o, { active: !ms.custom && same(o, cur), star: k === 0, onPick: () => pick(i) });
      })
      .filter(Boolean);
    const catLabel = (SS.CATEGORIES.find((c) => c.id === cat) || {}).label;
    // replaceChildren écrirait « null » en texte : on retire les absents
    panel.replaceChildren(
      ...[
        panelHead(mu, ms),
        kindSelect(mu),
        h('div', { class: 'bpn-sec' }, 'Instrument phare'),
        cards[0],
        h('div', { class: 'bpn-sec' }, 'Conseillés'),
        ...cards.slice(1),
        ms.custom ? h('div', { class: 'bpn-sec' }, 'Ton choix') : null,
        ms.custom ? choiceCard(instOpts(mu), { active: true, onPick: () => {}, extraClass: ' custom' }) : null,
        h(
          'button',
          { type: 'button', class: 'btn bpn-browse', onclick: () => browseInstrument(mu, ms) },
          h('span', { html: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' }),
          'Tous les instruments…'
        ),
        h('p', { class: 'dlg-hint' }, gm()
          ? `Jeu : ${catLabel}. Mode General MIDI : les sons conseillés sont remplacés par le programme GM le plus proche ; « Tous les instruments… » propose les 128 programmes.`
          : `Jeu : ${catLabel}. La fenêtre « Nouvelle piste » donne accès à toute la bibliothèque (instruments et synthés).`),
        groupActions(mu)
      ].filter(Boolean)
    );
  }

  /** Cartes de kit (étape Instruments) : les kits conseillés, puis (« Tous les kits… ») tous les autres. */
  function kitCards(mu, ms, onPick) {
    const all = gm() ? ['gm'] : S.allKits ? [...mu.kits, ...Object.keys(B().KITS).filter((k) => k !== 'gm' && !mu.kits.includes(k))] : mu.kits;
    return all.map((k, i) => {
      const def = B().KITS[k];
      return h(
        'button',
        { type: 'button', class: 'band-kit' + (kitOf(ms) === k ? ' active' : ''), 'data-kit': k, role: 'radio', 'aria-checked': kitOf(ms) === k ? 'true' : 'false', onclick: () => onPick(k) },
        h('span', { class: 'bk-name' }, (i === 0 ? '★ ' : '') + def.label),
        h('span', { class: 'bk-detail' }, def.source ? ({ vcsl: 'Échantillons acoustiques', gm: 'Les 47 sons de la norme, canal 10' }[def.source] || 'Dirt-Samples') : `Boîte à rythmes · ${def.year}`)
      );
    });
  }
  const allKitsBtn = (mu) =>
    gm()
      ? null
      : h('button', { type: 'button', class: 'btn bpn-browse', id: 'bgAllKits', 'aria-pressed': String(!!S.allKits), onclick: () => ((S.allKits = !S.allKits), refresh()) }, h('span', { html: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' }), S.allKits ? 'Kits conseillés seulement' : 'Tous les kits…');

  function renderKitPanel(mu, ms) {
    const panel = $('#bandPanel');
    const cards = kitCards(mu, ms, (k) => {
      ms.kit = k;
      refresh();
    });
    const rows = ms.pieces.map((pc) => {
      const info = pieceInfo(mu, pc);
      const d = B().describe(info.opts);
      return h(
        'div',
        { class: 'band-piece' + (pc.on ? ' on' : '') },
        h(
          'label',
          { class: 'bpc-check' },
          h('input', {
            type: 'checkbox',
            checked: pc.on,
            onchange: (e) => {
              pc.on = e.target.checked;
              refresh();
            },
          }),
          h('span', { class: 'bpc-name' }, info.label)
        ),
        h(
          'span',
          { class: 'bpc-src', title: info.borrowed ? 'Absent de ce kit : emprunté à une autre machine' : '' },
          d.detail,
          info.borrowed ? h('em', {}, ' (emprunté)') : null,
          info.custom ? h('em', {}, ' (ton choix)') : null
        ),
        h('button', { type: 'button', class: 'bc-play', title: 'Écouter', 'aria-label': 'Écouter ' + info.label, html: PLAY, onclick: () => preview(info.opts) }),
        info.custom
          ? h('button', { type: 'button', class: 'bpc-btn', title: 'Revenir au son du kit', onclick: () => ((pc.custom = null), refresh()) }, '↺')
          : null,
        h('button', { type: 'button', class: 'bpc-btn', title: 'Choisir un autre son', onclick: () => browsePiece(mu, ms, pc) }, 'Changer…')
      );
    });
    const n = ms.pieces.filter((pc) => pc.on).length;
    panel.replaceChildren(
      panelHead(mu, ms),
      ...[kindSelect(mu)].filter(Boolean),
      h('div', { class: 'bpn-sec' }, gm() ? 'Kit (mode General MIDI)' : 'Kit (★ phare + 5 conseillés)'),
      h('div', { class: 'band-kits', role: 'radiogroup', 'aria-label': 'Kit' }, ...cards),
      allKitsBtn(mu),
      h('div', { class: 'bpn-sec' }, `Éléments — une piste par élément coché (${n})`),
      h('div', { class: 'band-pieces' }, ...rows),
      h(
        'button',
        { type: 'button', class: 'btn bpn-browse', onclick: () => addPiece(mu, ms) },
        h('span', { html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' }),
        'Ajouter un élément…'
      ),
      h('p', { class: 'dlg-hint' }, gm()
        ? `Mode General MIDI : chaque élément est un son de la batterie General MIDI. « Ajouter un élément… » propose les 47 sons (bongos, congas, claves, triangles…).`
        : `Un kit n’a accès qu’aux drums et échantillons : boîtes à rythmes, Dirt-Samples, percussions acoustiques. Les éléments peuvent venir de kits différents.`),
      groupActions(mu)
    );
  }

  /* ---------- Ajouter un musicien : le type, puis le son (panneau de droite, en deux temps) ---------- */
  const TYPE_DESC = {
    drums: 'Le rythme : un kit de batterie ou de percussions, motifs et fills.',
    bass: 'La fondation grave : suit la fondamentale de chaque accord.',
    chords: 'Joue la grille en nappe, plaqué ou en stabs.',
    arp: 'Égrène les notes des accords en motif répété.',
    melody: 'La ligne chantante par-dessus : thème et motifs.',
    orch: 'Un effectif (cordes, cor, bois) qui se partage mélodie, accords et basse : une piste par pupitre.',
  };
  const kindIcon = (k) => `<svg viewBox="0 0 30 30" aria-hidden="true">${KIND_ICON[k]}</svg>`;
  function startAdd() {
    if (!BG().canAdd(group())) return;
    S.addMode = 'type';
    S.add = null;
    S.sel = null;
    S.confirmRm = null;
    refresh();
  }
  function cancelAdd() {
    S.addMode = null;
    S.add = null;
    S.allKits = false;
    refresh();
  }
  /** Le musicien en cours d'ajout, sous la forme d'un musicien du groupe (son choix : S.add.ms). */
  function addMu() {
    const a = S.add;
    return resolveMu({ id: 'x0', base: null, type: a.type, name: a.name });
  }
  function renderAddType(panel) {
    const cnt = (k) => musicians().filter((m) => kindNow(m) === k).length;
    panel.style.setProperty('--c', 'var(--accent)');
    panel.replaceChildren(
      h('div', { class: 'bg-crumb' }, h('h2', {}, 'Nouveau musicien'), h('span', { class: 'bg-n' }, '1 / 2 · Type'), h('button', { type: 'button', class: 'btn btn-small', id: 'bgCancel', onclick: cancelAdd }, 'Annuler')),
      h('p', { class: 'dlg-hint' }, 'Quel rôle ce musicien joue-t-il dans le groupe ?'),
      h(
        'div',
        { class: 'bg-tycards', role: 'group', 'aria-label': 'Type du musicien' },
        ...BG().TYPES.map((k) => {
          const c = cnt(k);
          return h(
            'button',
            {
              type: 'button', class: 'bg-tyc', 'data-type': k, style: `--tc:${KIND_COLOR[k]}`,
              onclick: () => {
                const g = group();
                S.add = { type: k, name: BG().freeName(g.list, BG().BASE_NAME[k]), custom: false };
                S.add.ms = newMs(resolveMu({ id: 'x0', base: null, type: k, name: S.add.name }));
                S.addMode = 'son';
                refresh();
                const i = $('#bgAddName');
                i && i.focus();
              },
            },
            h('span', { class: 'bm-avatar', html: kindIcon(k) }),
            h('b', {}, KIND_LABEL[k]),
            h('span', { class: 'bg-has' }, c ? `${c} dans le groupe` : ''),
            h('small', {}, TYPE_DESC[k] + (k === 'drums' && c ? ' Un kit de plus est possible.' : ''))
          );
        })
      )
    );
  }
  function renderAddSound(panel) {
    const a = S.add;
    const mu = addMu();
    const ms = a.ms;
    panel.style.setProperty('--c', KIND_COLOR[a.type]);
    const inp = h('input', {
      type: 'text', class: 'bpn-name', id: 'bgAddName', value: a.name, maxlength: '24', 'aria-label': 'Nom du musicien', spellcheck: 'false',
      oninput: () => {
        a.name = inp.value || a.name;
        a.custom = true;
        renderStage();
      },
      onblur: () => {
        if (!inp.value.trim()) {
          a.name = BG().freeName(group().list, BG().BASE_NAME[a.type]);
          a.custom = false;
          inp.value = a.name;
          renderStage();
        }
      },
      onkeydown: (e) => e.key === 'Enter' && $('#bgValidate').click(),
    });
    let body;
    if (mu.orch) body = ensCards(ms, refresh);
    else if (mu.kits) {
      body = [
        h('div', { class: 'bpn-sec' }, 'Kit (★ phare + conseillés)'),
        h('div', { class: 'band-kits', role: 'radiogroup', 'aria-label': 'Kit' }, ...kitCards(mu, ms, (k) => ((ms.kit = k), refresh()))),
        allKitsBtn(mu),
        h('p', { class: 'dlg-hint' }, 'Ses éléments (une piste chacun) se règlent ensuite dans son panneau.')
      ];
    } else {
      const cur = instOpts(mu, ms);
      const seen = [];
      const labels = new Set(); // un seul par libellé affiché (voir le panneau du musicien)
      const cards = pickOrder(mu)
        .map((i, k) => {
          const o = choiceAt(mu, i);
          const d = B().describe(o);
          const label = [d.kind, d.name, d.detail].join('|');
          if (seen.some((x) => sameOpts(x, o)) || labels.has(label)) return null;
          seen.push(o);
          labels.add(label);
          return choiceCard(o, { active: !ms.custom && sameOpts(o, cur), star: k === 0, onPick: () => (setPick(mu, ms, i), refresh(), preview(instOpts(mu, ms))) });
        })
        .filter(Boolean);
      body = [
        h('div', { class: 'bpn-sec' }, `Conseillés · ${KIND_LABEL[a.type]} · ${(style() || {}).label || ''}`),
        h('div', { class: 'bg-snds', role: 'radiogroup', 'aria-label': 'Sons conseillés' }, ...cards),
        ms.custom ? h('div', { class: 'bpn-sec' }, 'Ton choix') : null,
        ms.custom ? choiceCard(instOpts(mu, ms), { active: true, onPick: () => {}, extraClass: ' custom' }) : null,
        h('button', { type: 'button', class: 'btn bpn-browse', id: 'bgAllSounds', onclick: () => browseInstrument(mu, ms) }, h('span', { html: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' }), 'Tous les instruments…')
      ].filter(Boolean);
    }
    panel.replaceChildren(
      h('div', { class: 'bg-crumb' }, h('button', { type: 'button', class: 'btn btn-small', id: 'bgBack', 'aria-label': 'Retour au choix du type', onclick: () => ((S.addMode = 'type'), refresh()) }, '‹ Type'), h('h2', {}, 'Nouveau musicien'), h('span', { class: 'bg-n' }, '2 / 2 · Son')),
      h('div', { class: 'bpn-head', style: `--c:${KIND_COLOR[a.type]}` }, h('span', { class: 'bm-avatar', html: kindIcon(a.type) }), h('div', { class: 'bpn-title' }, inp, h('small', {}, `${KIND_LABEL[a.type]} · ${soundName(mu, ms)}`))),
      ...body,
      h('div', { class: 'bg-actions' }, h('button', { type: 'button', class: 'btn', id: 'bgCancel', onclick: cancelAdd }, 'Annuler'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-accent', id: 'bgValidate', style: `--c:${KIND_COLOR[a.type]}`, onclick: validateAdd }, 'Ajouter au groupe'))
    );
  }
  function validateAdd() {
    const a = S.add;
    if (!a) return;
    const ms = a.ms;
    const rec = BG().add(group(), a.type, { name: a.custom ? a.name : undefined, ms });
    if (!rec) return cancelAdd();
    S.addMode = null;
    S.add = null;
    S.allKits = false;
    S.sel = rec.id;
    S.fresh = rec.id;
    groupChanged();
  }

  function renderPanel() {
    const panel = $('#bandPanel');
    if (S.addMode) {
      panel.hidden = false;
      el.classList.add('with-panel');
      return S.addMode === 'type' || !S.add ? renderAddType(panel) : renderAddSound(panel);
    }
    panel.style.removeProperty('--c');
    const mu = S.sel ? muById(S.sel) : null;
    panel.hidden = !mu;
    el.classList.toggle('with-panel', !!mu);
    if (!mu) return;
    const ms = musState()[mu.id];
    if (mu.kits) renderKitPanel(mu, ms);
    else if (mu.orch) $('#bandPanel').replaceChildren(panelHead(mu, ms), ...ensCards(ms, () => groupChanged()), groupActions(mu));
    else renderInstPanel(mu, ms);
  }

  function syncGm() {
    const b = $('#bandGm');
    if (!b) return;
    b.classList.toggle('active', gm());
    b.setAttribute('aria-pressed', gm() ? 'true' : 'false');
  }
  function setGm(on) {
    const p = app.project();
    if (!!p.gm === on) return;
    if (on) p.gm = true;
    else delete p.gm;
    app.changed && app.changed();
    SS.ui.renderAll(); // badges GM de la liste des pistes
    refresh();
  }

  function refresh() {
    syncGm();
    renderStage();
    renderPanel();
    if (S.wiz) {
      wizFoot();
      updateTransport(); // la barre du haut suit tout de suite le style, l'inspiration, le tempo et la tonalité choisis
    }
  }

  /* ---------- Actions ---------- */
  function setStyle(id) {
    if (S.styleId === id) return;
    S.styleId = id;
    S.presetId = style().presets[0].id;
    S.sel = null;
    resetAdd();
    S.group = null; // autre style : le groupe repart de celui du nouveau style
    dropEdits(); // les réglages par scène, la tonalité et l'arrangement étaient ceux de l'autre inspiration
    renderStyles();
    renderPresets();
    renderSong();
    if (cover()) coverChanged(), coverInfo();
    refresh();
  }
  function setPreset(id) {
    S.presetId = id;
    S.sel = null;
    resetAdd();
    S.group = { ...BG().rebase(group(), preset(), true), style: S.styleId }; // même style : le groupe de la nouvelle inspiration, avec les musiciens ajoutés
    rebaseAdded();
    dropEdits(true);
    renderPresets();
    renderSong();
    if (cover()) coverChanged(), coverInfo();
    refresh();
  }
  function select(id) {
    S.sel = id;
    S.addMode = null;
    S.add = null;
    S.confirmRm = null;
    refresh();
  }
  const resetAdd = () => Object.assign(S, { addMode: null, add: null, confirmRm: null, allKits: false });
  /** Autre inspiration, même style : le choix de son d'un musicien ajouté suit ses conseillés (son retrouvé par son nom, sinon gardé tel quel). */
  function rebaseAdded() {
    group().list.forEach((r) => {
      const ms = r.ms;
      if (r.base || !ms || ms.pick === undefined) return;
      const pk = recFor(r.type).pick;
      const i = ms.tok ? pk.indexOf(ms.tok) : 0;
      if (i >= 0) ms.pick = i;
      else {
        ms.custom = ms.custom || B().choiceOpts(ms.tok, BG().CAT_OF_TYPE[r.type]);
        ms.pick = 0;
      }
    });
  }

  /** Le groupe a changé (ajout, retrait, copie, ordre) : le mix, l'écoute et les onglets suivent. */
  function groupChanged() {
    if (S.wiz) {
      if (S.wiz.mix) mixSync();
      dropListen();
    }
    refresh();
  }
  /** Retire un musicien : ses réglages (par scène, type, tranches du mix, muet / solo / volume) disparaissent avec lui. */
  function removeMember(id) {
    const g = group();
    const i = g.list.findIndex((r) => r.id === id);
    if (i < 0 || !BG().canRemove(g)) return;
    const ids = new Set([id]);
    if (S.wiz) wizCols().filter((c) => c.musician === id).forEach((c) => ids.add(c.id));
    BG().remove(g, id);
    if (S.wiz) BG().purge(S.wiz, [...ids]);
    S.confirmRm = null;
    S.sel = (g.list[Math.min(i, g.list.length - 1)] || {}).id || null;
    groupChanged();
  }
  /** Copie : même type, même son, nom libre (« Bassiste 2 »), juste après l'original. */
  function dupMember(id) {
    const g = group();
    const mu = muById(id);
    const kind = mu && kindNow(mu);
    if (!mu || !kind || !BG().canAdd(g)) return;
    const src = musState()[id];
    let ms;
    if (mu.kits || mu.orch) ms = { ...BG().clone(src), on: true };
    else {
      const rc = recFor(kind);
      const tok = picksOf(mu)[effPick(mu, src)];
      const i = rc.pick.indexOf(tok);
      ms = { on: true, pick: Math.max(0, i), custom: src.custom ? BG().clone(src.custom) : i < 0 ? B().choiceOpts(tok, catOf(mu)) : null, tok: i < 0 ? rc.pick[0] : tok, picked: true };
    }
    const rec = BG().insertAfter(g, id, { id: BG().newId(g), base: null, name: BG().copyName(g, mu.name), custom: true, type: kind, ms });
    S.sel = rec.id;
    S.fresh = rec.id;
    S.confirmRm = null;
    groupChanged();
  }
  /** Ordre : delta (‹ -1, › +1) ou une tuile qui en prend une autre (glisser-déposer). Les onglets suivent. */
  function moveMember(id, to) {
    const g = group();
    const ok = typeof to === 'number' ? BG().move(g, id, to) : BG().moveTo(g, id, to);
    if (!ok) return;
    S.sel = id;
    S.addMode = null;
    groupChanged();
  }

  async function browseInstrument(mu, ms) {
    const cur = instOpts(mu, ms);
    const res = await app.openTrackDialog(null, {
      state: { ...cur, name: labelOf(mu) },
      types: ['instrument', 'synth'],
      title: `Choisir l’instrument — ${labelOf(mu)}`,
      okLabel: 'Choisir',
    });
    if (!res) return;
    ms.custom = pickOpts(res);
    ms.on = true;
    refresh();
  }
  async function browsePiece(mu, ms, pc) {
    const cur = pieceInfo(mu, pc).opts;
    const res = await app.openTrackDialog(null, {
      state: { ...cur, name: B().drumLabel(cur.sound) },
      types: ['drum'],
      title: `Choisir le son — ${labelOf(mu)}`,
      okLabel: 'Choisir',
    });
    if (!res) return;
    pc.custom = pickOpts(res);
    pc.on = true;
    refresh();
  }
  async function addPiece(mu, ms) {
    const res = await app.openTrackDialog(null, {
      state: gm()
        ? { type: 'drum', sound: 'perc', source: 'gm', bank: '63', machine: SS.DEFAULT_MACHINE, name: 'Élément' }
        : { type: 'drum', sound: 'perc', source: 'tdm', machine: B().KITS[ms.kit].source ? SS.DEFAULT_MACHINE : ms.kit, name: 'Élément' },
      types: ['drum'],
      title: `Ajouter un élément — ${labelOf(mu)}`,
      okLabel: 'Ajouter',
    });
    if (!res) return;
    ms.pieces.push({ piece: res.sound || 'perc', on: true, custom: pickOpts(res) });
    refresh();
  }
  /** Garde seulement ce qui décrit le son (pas le nom, la couleur ni la longueur du dialogue). */
  function pickOpts(r) {
    const keys = ['type', 'category', 'arpOn', 'family', 'instrument', 'analog', 'patch', 'sfv', 'source', 'sound', 'machine', 'bank', 'variant'];
    const o = {};
    keys.forEach((k) => r[k] !== undefined && (o[k] = r[k]));
    return o;
  }

  /* ---------- Assistant « Nouvelle chanson » ----------
   * Ouvert par le menu de l'application, sur une chanson vide :
   *  1. Style : le style et l'inspiration (ou la reprise tapée) ;
   *  2. Instruments : les musiciens du groupe et leurs instruments (l'écran habituel de Band), avec le type de chacun ;
   *  3. Tempo et tonalité : tempo, tonalité de la chanson (transpose toutes les scènes), gamme à écouter ;
   *  4. Scènes : toute la chanson en vue « session » — une ligne par scène, une colonne par piste — et l'arrangement
   *     (ordre des blocs, répétitions, longueur, nom, duplication, suppression) ;
   *  5. Accords : la grille de chaque scène (tonalité, accords au temps, palette Simple / Avancé, comme dans Harmonie) ;
   *     « Trouver l'inspiration » ouvre une fenêtre mode → émotion → propositions, à écouter avant de « Choisir » ;
   *  6… : un onglet par instrument (voir l'en-tête du fichier) : son type, puis les réglages de ce type pour chaque scène ;
   *  Mix : volume, pan, effets et Master de chaque instrument, pour toute la chanson ou une scène (S.wiz.mix, js/wizmix.js) ;
   *  Intégration : on coche les pistes à importer (batterie, basse, nappes, arpèges, lead…).
   * Étapes Accords, instruments et Mix : les scènes en colonne à gauche, sous le titre ; la lecture joue la scène choisie, en boucle.
   * Rien n'est écrit dans le projet avant « Créer la chanson » ; fermer laisse la chanson vide.
   */
  /* Étapes : Fondations (1 à 5), une étape par instrument du groupe (nombre variable), puis Mix et Intégration.
   * Une étape est adressée par son numéro (S.wiz.step) ; ST donne les numéros fixes (style, inst, tempo, scenes, chords) et calculés
   * (mix, pick : ils suivent le nombre d'instruments). Une étape instrument est { inst: id } (stepRef, stepNum, insAt). */
  const FOUND = [
    { key: 'style', label: 'Style', hint: 'Choisis le style et l’inspiration (ou tape une reprise)', line: 'Choisis un style, puis une inspiration pour partir d’une vraie chanson.' },
    { key: 'inst', label: 'Instruments', hint: 'Compose le groupe : ajoute, renomme, ordonne les musiciens et choisis leurs instruments', line: 'Ajoute des musiciens, renomme-les, change leur type ou leur son (2 à 10).' },
    { key: 'tempo', label: 'Tempo et tonalité', hint: 'Le tempo et la tonalité de la chanson ; changer la tonalité transpose toutes les scènes', line: 'Règle la vitesse et la tonalité ; toutes les scènes suivent.' },
    { key: 'scenes', label: 'Scènes', hint: 'Toute la chanson : les scènes, leur longueur et leur ordre dans l’arrangement', line: 'Dessine la forme : les scènes, leur longueur et leur ordre dans la chanson.' },
    { key: 'chords', label: 'Accords', hint: 'Les accords de chaque scène : tonalité, grille au temps, inspiration par émotion', line: 'Les accords de chaque scène : une grille au temps, dans la tonalité.' },
  ];
  const FINAL = [
    { key: 'arr', label: 'Arrangement', hint: 'L’énergie de la chanson, scène par scène : où elle monte, où elle respire', line: 'Compare l’énergie voulue et celle qu’on entend, puis varie les scènes.' },
    { key: 'fx', label: 'Effets et transitions', hint: 'Les montées, impacts et silences entre les scènes, et des percussions d’ambiance', line: 'Habille les passages entre scènes : montées, impacts, silences, percussions.' },
    { key: 'mix', label: 'Mix', hint: 'Le volume, la place et les effets de chaque instrument, pour toute la chanson ou une scène', line: 'Volume, place et effets de chaque instrument, pour la chanson ou une scène.' },
    { key: 'pick', label: 'Intégration', hint: 'Coche les pistes à importer dans la chanson', line: 'Coche les pistes à importer, puis crée la chanson.' },
  ];
  const FX_COLOR = '#7a8a99'; // rôle Effets (gris), Percussionniste : orange #f08a00
  const ARR_COLOR = '#13c2a3'; // étape Arrangement
  const ST = {
    style: 1, inst: 2, tempo: 3, scenes: 4, chords: 5,
    get arr() { return 6 + insSteps().length; },
    get fx() { return 7 + insSteps().length; },
    get mix() { return 8 + insSteps().length; },
    get pick() { return 9 + insSteps().length; },
  };
  /** Types d'instrument : nom, résumé du fil des étapes, couleur de rôle (batterie rose, basse verte, nappe bleue, arpège turquoise, mélodie violette). */
  const KIND_LABEL = { drums: 'Drums', bass: 'Basse', chords: 'Accords', arp: 'Arpèges', melody: 'Mélodie', orch: 'Orchestre' };
  const KIND_SUM = { drums: 'Drums', bass: 'Basse', chords: 'Nappe', arp: 'Arpège', melody: 'Mélodie', orch: 'Orchestre' };
  /** Étiquette du type dans la tête d'étape instrument : « Nappe » et non « Accords », qui est l'étape 5. */
  const KIND_STEP = { ...KIND_LABEL, chords: 'Nappe', orch: 'Orchestration' };
  const KIND_COLOR = { drums: '#e3179c', bass: '#3fcf3f', chords: '#4f6bff', arp: '#13c2a3', melody: '#9b5cff', orch: '#ff8a3d' };
  const KIND_DESC = { drums: 'Motifs rythmiques et fills', bass: 'Mode de jeu sur la fondamentale', chords: 'Joue la grille en nappe ou plaqué', arp: 'Arpège les accords (Arp One)', melody: 'Ligne mélodique générée', orch: 'Répartit mélodie, accords et basse entre les pupitres' };
  const KIND_SLOT = { drums: 'drums', bass: 'bass', chords: 'pad', arp: 'arp', melody: 'lead', orch: 'orch' }; // suffixe des identifiants de test (#bwp-on-bass…)
  const KIND_ICON = {
    drums: '<ellipse cx="15" cy="17" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 17v5c0 2 4 4 9 4s9-2 9-4v-5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4l7 9M23 4l-7 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bass: '<path d="M3 15h4l3-9 4 18 3-12 2 3h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>',
    chords: '<rect x="4" y="5" width="22" height="5" rx="2" fill="currentColor" opacity=".5"/><rect x="4" y="12.5" width="22" height="5" rx="2" fill="currentColor" opacity=".75"/><rect x="4" y="20" width="22" height="5" rx="2" fill="currentColor"/>',
    arp: '<path d="M3 24h5v-5h5v-5h5v-5h5V4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="7" cy="14" r="1.6" fill="currentColor"/><circle cx="17" cy="22" r="1.6" fill="currentColor"/>',
    melody: '<path d="M3 20c4-12 7-12 10-3s6 8 9-4c1-4 3-5 5-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="25" cy="9" r="2" fill="currentColor"/>',
    orch: '<path d="M15 3v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M11 10h8c0 2.5-2 3-2 5s3 2.5 3 5.5S18 26 15 26s-5-2-5-5.5 3-3.5 3-5.5-2-2.5-2-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 27L25 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  /**
   * Instruments du groupe, un par étape : [{ id, key, kit, col, cols, role, musician, kind, def, name, sound }].
   * id : celui de la colonne (musicien:clé[#n]) ; un kit de batterie (toutes ses pièces) est un seul instrument, d'id le musicien,
   * qui est aussi la clé de ses réglages (parts[section].inst[id]). « fx » n'a pas de type : pas d'étape.
   */
  const kitOfAll = () => (preset() ? musicians().filter((m) => m.kits).map((m) => kitOf(musState()[m.id])) : []);
  let insMemo = { sig: null, val: [] };
  function insSteps() {
    if (!S.wiz || !preset()) return [];
    const cols = wizCols();
    const sig = JSON.stringify([cols.map((c) => [c.id, c.o]), S.wiz.kinds, gm(), kitOfAll(), musicians().map((m) => [m.id, m.name, m.custom])]);
    if (insMemo.sig === sig && insMemo.wiz === S.wiz) return insMemo.val;
    const out = [];
    cols.forEach((c) => {
      const kit = c.o.type === 'drum';
      const orch = c.role === 'orch'; // un orchestre (tous ses pupitres) est un seul instrument, comme un kit
      const id = kit || orch ? c.musician : c.id;
      const t = out.find((x) => x.id === id);
      if (t) return void t.cols.push(c);
      if (!defaultKind(c)) return;
      const mu = muById(c.musician);
      out.push({
        id, key: id, kit, orch, col: c, cols: [c], role: c.role, musician: c.musician, kind: instKind(c), def: defaultKind(c),
        title: nameOf0(mu) || roleOf(mu).short, name: nameOf0(mu) || (kit ? roleOf(mu).short : B().describe(c.o).name.replace(/^[A-Z]\d+\s*[–-]\s*/, '')), sound: kit ? (B().KITS[kitOf(musState()[mu.id])] || {}).label || labelOf(mu) : orch ? ensOf(musState()[mu.id]).label : B().describe(c.o).name,
      });
    });
    insMemo = { sig, wiz: S.wiz, val: out };
    return out;
  }
  const insAt = (n = S.wiz && S.wiz.step) => (n > ST.chords && n < ST.arr ? insSteps()[n - ST.chords - 1] || null : null);
  /** Définition d'une étape fixe (Fondations ou Finaliser : FOUND, FINAL), null pour une étape instrument. */
  const defAt = (n) => (n <= ST.chords ? FOUND[n - 1] : n >= ST.arr ? FINAL[n - ST.arr] : null) || null;
  /** Adresse stable d'une étape : { inst: id } pour un instrument, sinon sa clé (« style », « chords », « mix »…). */
  function stepRef(n) {
    const t = insAt(n);
    if (t) return { inst: t.id };
    return (defAt(n) || {}).key || null;
  }
  /** Numéro de l'étape d'une adresse (voir stepRef), 0 si elle n'existe pas. */
  function stepNum(ref) {
    if (ref && ref.inst) {
      const i = insSteps().findIndex((t) => t.id === ref.inst);
      return i < 0 ? 0 : ST.chords + 1 + i;
    }
    return ST[ref] || 0;
  }
  /** Description d'une étape : { label, hint, line, color, ins, group }. */
  function stepInfo(n) {
    const t = insAt(n);
    if (t) {
      return { label: t.title, sub: t.sound, hint: `${KIND_STEP[t.kind]} : ce que joue cet instrument, scène par scène`, line: 'Règle ce que joue cet instrument, scène par scène.', color: KIND_COLOR[t.kind], ins: t, group: n === ST.chords + 1 ? 'Instruments, scène par scène' : null };
    }
    const d = defAt(n);
    return { ...d, color: d.key === 'chords' ? '#c9a227' : d.key === 'mix' ? '#d0d0da' : d.key === 'fx' ? FX_COLOR : d.key === 'arr' ? ARR_COLOR : null, ins: null, group: n === 1 ? 'Fondations' : n === ST.arr ? 'Finaliser' : null };
  }
  /** Étapes où l'on travaille une scène (colonne des scènes, lecture de la scène en boucle). */
  const sceneStep = (n = S.wiz && S.wiz.step) => n === ST.chords || !!insAt(n);
  /** L'étape en cours est celle d'un instrument de type Mélodie. */
  const melStep = () => !!S.wiz && (insAt() || {}).kind === 'melody';
  const cover = () => S.mode === 'cover';
  /** Plan de la chanson : celui de l'inspiration, ou la reprise tapée (porte « Reprendre »), jouée à la façon de l'inspiration. */
  const spec = () => (cover() ? coverModel().spec : preset() && SS.BandSongs && SS.BandSongs[preset().id]);

  /* ---------- Plan retouché : tonalité de la chanson, arrangement, scènes (étapes Tempo et tonalité, Scènes) ----------
   * Les retouches sont gardées à part, dans S.wiz, et le plan de l'inspiration n'est jamais modifié :
   *  - skey { tonic, mode } : tonalité de la chanson (sinon celle du plan) ; la changer transpose chaque scène
   *    (S.wiz.keys, voir setSongKey). Les grilles sont des degrés dans la tonalité : elles suivent toutes seules ;
   *  - form [{ id, repeat }] : l'arrangement (sinon celui du plan) ;
   *  - secs { id: { bars, name, from, del } } : longueur et nom d'une scène ; from : scène copiée (une scène dupliquée
   *    est une section de plus, sans lien avec sa source) ; del : scène supprimée.
   * specEff() est le plan tel qu'il sera joué : il sert à tout ce qui construit ou lit les scènes.
   */
  const FORM_MAX = 32; // blocs de l'arrangement
  const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const parseKeyStr = (k) => {
    const [tonic, mode] = String(k).split(' ');
    return { tonic, mode: mode || 'major' };
  };
  const parseForm = (f) => f.split(/\s+/).filter(Boolean).map((t) => ({ id: t.split('*')[0], repeat: +t.split('*')[1] || 1 }));
  const formStr = (f) => f.map((b) => b.id + (b.repeat > 1 ? `*${b.repeat}` : '')).join(' ');
  const retouched = () => !!S.wiz && (!!S.wiz.form || !!S.wiz.skey || Object.keys(S.wiz.secs).length > 0);
  /** Arrangement : celui qu'on a modifié, sinon celui du plan. */
  const formOf = () => (S.wiz.form ? S.wiz.form.map((b) => ({ ...b })) : parseForm(spec().form));
  /** Répète une grille d'accords (pas, durée) sur une scène plus longue, ou la coupe si elle est plus courte. */
  function repeatFit(grid, from, to) {
    const old = from * 16;
    const total = to * 16;
    const out = [];
    for (let k = 0; k * old < total; k++) grid.forEach((c) => c.step + k * old < total && out.push({ ...c, step: c.step + k * old, len: Math.min(c.len, total - (c.step + k * old)) }));
    return fillGrid(out, total);
  }
  /** Pédales d'une scène dont la longueur change : coupées à la fin de la scène. */
  function pedFit(id, bars) {
    const total = bars * 16;
    const out = (S.wiz.peds[id] || []).filter((x) => x.step < total).map((x) => ({ ...x, len: Math.min(x.len, total - x.step) }));
    if (out.length) S.wiz.peds[id] = out;
    else delete S.wiz.peds[id];
  }
  let effMemo = { sig: null, val: null };
  function specEff() {
    const base = spec();
    if (!base || !retouched()) return base;
    const w = S.wiz;
    const sig = JSON.stringify([cover() ? S.cover : preset().id, w.form, w.secs, w.skey]);
    if (effMemo.sig === sig && effMemo.base === base) return effMemo.val;
    const out = clone(base);
    Object.entries(w.secs).forEach(([id, o]) => {
      if (o.from && base.sections[o.from]) {
        out.sections[id] = clone(base.sections[o.from]);
        out.sections[id].as = base.sections[o.from].as || o.from;
      }
      const sec = out.sections[id];
      if (!sec) return;
      if (o.del) return void delete out.sections[id];
      if (o.bars && o.bars !== sec.bars) {
        if (sec.grid) sec.grid = repeatFit(sec.grid, sec.bars, o.bars);
        sec.bars = o.bars;
      }
      if (o.name) sec.name = o.name;
    });
    if (w.form) out.form = formStr(w.form);
    if (w.skey) out.key = `${w.skey.tonic} ${w.skey.mode}`;
    effMemo = { sig, base, val: out };
    return out;
  }

  /** Tonalité de la chanson : la retouchée, sinon celle du plan. */
  const songKey = () => (S.wiz && S.wiz.skey) || parseKeyStr(spec().key);
  const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const tonicPc = (t) => (NATURAL_PC[t[0]] + [...t.slice(1)].reduce((a, c) => a + (c === '♯' || c === '#' ? 1 : c === '♭' || c === 'b' ? -1 : 0), 0) + 12) % 12;
  const FAM_MAJOR = (mode) => (SS.harmony.MODES.find((m) => m.id === mode) || {}).fam === 'major';
  // noms des 12 toniques (tous valides dans SS.harmony.TONICS) ; en mineur on préfère les dièses usuels
  const TONIC_MAJ = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const TONIC_MIN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const tonicName = (pc, mode) => (FAM_MAJOR(mode) ? TONIC_MAJ : TONIC_MIN)[((pc % 12) + 12) % 12];
  /**
   * Change la tonalité de la chanson : chaque scène est transposée de l'intervalle entre l'ancienne et la nouvelle
   * tonique (S.wiz.keys). Si le mode change, les scènes qui étaient dans le mode de la chanson prennent le nouveau ;
   * les autres (un pont en majeur dans une chanson mineure) gardent le leur.
   */
  function setSongKey(nk) {
    const w = S.wiz;
    const old = songKey();
    const iv = tonicPc(nk.tonic) - tonicPc(old.tonic);
    if (!iv && nk.mode === old.mode) return;
    const sp = specEff();
    Object.entries(sp.sections).forEach(([id, sec]) => {
      const cur = w.keys[id] || (sec.key ? parseKeyStr(sec.key) : old);
      const mode = cur.mode === old.mode ? nk.mode : cur.mode;
      w.keys[id] = { tonic: tonicName(tonicPc(cur.tonic) + iv, mode), mode };
    });
    const orig = parseKeyStr(spec().key);
    if (tonicPc(nk.tonic) === tonicPc(orig.tonic) && nk.mode === orig.mode) delete w.skey;
    else w.skey = { tonic: nk.tonic, mode: nk.mode };
    // une scène qui retombe sur la tonalité qu'elle aurait sans retouche n'a plus besoin de la sienne
    const nsk = w.skey || orig;
    Object.entries(spec().sections).forEach(([id, sec]) => {
      const dflt = sec.key ? parseKeyStr(sec.key) : nsk;
      const k = w.keys[id];
      if (k && tonicPc(k.tonic) === tonicPc(dflt.tonic) && k.mode === dflt.mode) delete w.keys[id];
    });
    Object.keys(w.keys).forEach((id) => !sp.sections[id] && delete w.keys[id]);
    renderWiz();
  }

  /* Scènes et arrangement : chaque fonction retouche S.wiz puis redessine (la chanson se recalcule à partir de specEff). */
  const SEC_STATE = ['grids', 'peds', 'keys', 'emos', 'parts', 'plans', 'pseeds', 'chars'];
  const secBars = (id) => specEff().sections[id].bars;
  const secName = (id) => {
    const sec = specEff().sections[id];
    return sec.name || BS().NAMES[id] || id;
  };
  function setForm(f) {
    S.wiz.form = f.map((b) => ({ id: b.id, repeat: b.repeat }));
    renderWiz();
  }
  function moveBlock(i, to) {
    const f = formOf();
    if (to < 0 || to >= f.length || i === to) return;
    f.splice(to, 0, f.splice(i, 1)[0]);
    setForm(f);
  }
  function removeBlock(i) {
    const f = formOf();
    if (f.length < 2) return; // une chanson garde au moins un bloc
    f.splice(i, 1);
    setForm(f);
  }
  function repeatBlock(i, d) {
    const f = formOf();
    f[i].repeat = Math.max(1, Math.min(16, f[i].repeat + d));
    setForm(f);
  }
  function addBlock(id) {
    const f = formOf();
    if (f.length >= FORM_MAX) return;
    f.push({ id, repeat: 1 });
    setForm(f);
  }
  /** Longueur d'une scène en mesures ; sa grille d'accords modifiée est répétée ou coupée pour couvrir la scène. */
  function setSecBars(id, bars) {
    const old = secBars(id);
    if (bars === old) return;
    if (S.wiz.grids[id]) S.wiz.grids[id] = repeatFit(S.wiz.grids[id], old, bars);
    if (S.wiz.peds[id]) pedFit(id, bars);
    S.wiz.gsel = null;
    S.wiz.secs[id] = { ...(S.wiz.secs[id] || {}), bars };
    renderWiz();
  }
  function renameSec(id, name) {
    const o = { ...(S.wiz.secs[id] || {}) };
    const n = String(name || '').trim();
    if (n) o.name = n;
    else delete o.name;
    if (Object.keys(o).length) S.wiz.secs[id] = o;
    else delete S.wiz.secs[id];
    renderWiz();
  }
  /** Copie d'une scène : une section de plus (« chorus_b », « Refrain 2 »), indépendante, avec les mêmes réglages au départ. */
  function dupScene(id) {
    const sp = specEff();
    const src = sp.sections[id];
    if (!src) return;
    const w = S.wiz;
    const root = (w.secs[id] && w.secs[id].from) || id;
    const taken = (x) => x in sp.sections || x in w.secs;
    let nid;
    for (let k = 98; k < 98 + 26 && (!nid || taken(nid)); k++) nid = `${root}_${String.fromCharCode(k)}`;
    if (taken(nid)) return;
    const stem = secName(id).replace(/\s+\d+$/, '');
    const names = new Set(Object.keys(sp.sections).map(secName));
    let n = 2;
    while (names.has(`${stem} ${n}`)) n++;
    w.secs[nid] = { from: root, bars: src.bars, name: `${stem} ${n}` };
    SEC_STATE.forEach((k) => w[k][id] !== undefined && (w[k][nid] = clone(w[k][id])));
    // son bloc suit le dernier bloc de la scène copiée
    const f = formOf();
    let at = f.length - 1;
    f.forEach((b, i) => b.id === id && (at = i));
    f.splice(at + 1, 0, { id: nid, repeat: 1 });
    setForm(f);
  }
  /** Supprime une scène et ses blocs (sauf la dernière). */
  function delScene(id) {
    const sp = specEff();
    const ids = Object.keys(sp.sections);
    if (ids.length < 2 || !sp.sections[id]) return;
    const w = S.wiz;
    let f = formOf().filter((b) => b.id !== id);
    if (!f.length) f = [{ id: ids.find((x) => x !== id), repeat: 1 }];
    if (w.secs[id] && w.secs[id].from) delete w.secs[id];
    else w.secs[id] = { ...(w.secs[id] || {}), del: true };
    SEC_STATE.forEach((k) => delete w[k][id]);
    w.gsel = null;
    setForm(f);
  }
  /** Revient au plan de l'inspiration : arrangement, longueurs, noms, copies et suppressions (pas la tonalité). */
  function resetStructure() {
    const w = S.wiz;
    const base = spec().sections;
    Object.entries(w.secs).forEach(([id, o]) => {
      if (o.from) SEC_STATE.forEach((k) => delete w[k][id]);
      else if (o.bars && base[id]) {
        if (w.grids[id]) w.grids[id] = repeatFit(w.grids[id], o.bars, base[id].bars);
        if (w.peds[id]) pedFit(id, base[id].bars);
      }
    });
    w.form = null;
    w.secs = {};
    w.gsel = null;
    renderWiz();
  }
  /** Efface toutes les retouches du plan (autre style ou autre inspiration, autre reprise). */
  function dropEdits(sameStyle = false) {
    if (!S.wiz) return;
    Object.assign(S.wiz, { form: null, secs: {}, skey: null, keys: {}, grids: {}, peds: {}, emos: {}, parts: keptParts(sameStyle), kinds: keptKinds(), melPanel: {}, fx: {} });
  }
  /**
   * Réglages par scène gardés quand on change d'inspiration : ceux des sections que la nouvelle inspiration a aussi
   * (couplet, refrain…). La mélodie générée suivait les accords de l'autre inspiration : elle est oubliée ; les motifs
   * de batterie appartiennent à leur style : gardés seulement dans le même style.
   */
  function keptParts(sameStyle) {
    const sp = spec();
    const out = {};
    if (!sp || !S.wiz.parts) return out;
    const cols = new Map(wizCols().map((c) => [c.id, c]));
    for (const [sec, part] of Object.entries(S.wiz.parts)) {
      if (!sp.sections[sec]) continue;
      const p = { ...part };
      delete p.lead;
      if (!sameStyle) delete p.drums;
      if (p.inst) {
        // réglages par instrument : gardés pour les instruments qui existent encore ; ni mélodie imposée, ni motif d'un autre style
        const inst = {};
        for (const [id, o] of Object.entries(p.inst)) {
          const c = cols.get(id);
          const kit = !c && wizCols().some((x) => x.musician === id && x.o.type === 'drum'); // clé d'un kit : id du musicien
          if (!c && !kit) continue;
          const q = { ...o };
          delete q.lead;
          if (!sameStyle && (kit || c.o.type === 'drum')) ['style', 'pattern', 'edits'].forEach((f) => delete q[f]);
          if (Object.keys(q).length) inst[id] = q;
        }
        if (Object.keys(inst).length) p.inst = inst;
        else delete p.inst;
      }
      if (Object.keys(p).length) out[sec] = p;
    }
    return out;
  }

  /* ---------- Porte « Reprendre » : une reprise tapée au clavier ----------
   * Titre, tempo, tonalité (déduite du premier accord, ou choisie), parties (« Couplet : Am | F | C | G ») et ordre
   * des parties. Chaque partie reprend le jeu de la section du modèle qui lui correspond (couplet → verse, refrain →
   * chorus ou drop…) : batterie, basse, nappes, arpège, lead de l'inspiration choisie, sur les accords tapés.
   */
  const COVER_SECTIONS = [
    [/^intro/, ['intro']],
    [/^(pre|montee|build)/, ['pre', 'build', 'verse']],
    [/^(couplet|verse|strophe|theme)/, ['verse', 'groove', 'theme']],
    [/^(refrain|chorus|drop|hook)/, ['chorus', 'drop', 'peak']],
    [/^post/, ['post', 'chorus', 'drop']],
    [/^(pont|bridge|break)/, ['bridge', 'break']],
    [/^(solo|instru|riff)/, ['solo', 'instr', 'riff', 'chorus']],
    [/^(outro|fin|coda)/, ['outro']],
  ];
  const normName = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const MAJOR_TONICS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const MINOR_TONICS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  const COVER_DEFAULT = () => ({
    title: '',
    tempo: 110,
    key: 'auto',
    parts: [
      { name: 'Intro', chords: 'Am | F | C | G' },
      { name: 'Couplet', chords: 'Am | F | C | G' },
      { name: 'Refrain', chords: 'F | G | Am | Am' },
      { name: 'Outro', chords: 'Am | F | C | G' },
    ],
    order: 'Intro Couplet Refrain Couplet Refrain Refrain Outro',
  });
  /** Section du modèle dont une partie reprend le jeu (d'après son nom). */
  function coverTemplate(base, name) {
    const n = normName(name);
    const hit = COVER_SECTIONS.find(([re]) => re.test(n));
    const ids = [...(hit ? hit[1] : []), 'verse', 'chorus', 'groove', 'drop'];
    return ids.find((id) => base.sections[id]) || Object.keys(base.sections)[0];
  }
  /** Type d'accord de l'application (SS.CHORDS) pour les intervalles d'un accord tapé. */
  function coverType(ivs) {
    const key = (a) => [...new Set(a.map((i) => ((i % 12) + 12) % 12))].sort((x, y) => x - y).join(',');
    const k = key(ivs);
    const hit = SS.CHORDS.find((c) => key(c.iv) === k);
    if (hit) return hit.id;
    const has = (i) => ivs.some((x) => ((x % 12) + 12) % 12 === i);
    if (has(3) && has(6) && !has(7)) return has(10) ? 'm7b5' : 'dim';
    if (has(3) && !has(4)) return has(10) ? 'm7' : 'min';
    if (has(4)) return has(10) ? '7' : has(11) ? 'maj7' : 'maj';
    if (has(5)) return has(10) ? '7sus4' : 'sus4';
    if (has(2)) return 'sus2';
    return '5';
  }
  /** Accords d'une partie tapée : { spans, bars, errors } (grille d’Harmonie : « | » sépare les mesures, « . » prolonge, « % » répète). */
  function coverParse(text) {
    if (!String(text || '').trim()) return { spans: [], bars: 0, errors: ['pas d’accords'] };
    try {
      return SS.melody.parseGrid(text, { spb: 16 });
    } catch (e) {
      return { spans: [], bars: 0, errors: [e.message] };
    }
  }
  /** Tonalité de la reprise : choisie, sinon déduite du premier accord (Am → La mineur, F → Fa majeur). */
  function coverKey(parsed) {
    const c = S.cover;
    if (c.key && c.key !== 'auto') {
      const [tonic, mode] = c.key.split(' ');
      return { tonic, mode: mode || 'major' };
    }
    const first = parsed.map((x) => x.spans[0]).find(Boolean);
    if (!first) return { tonic: 'A', mode: 'minor' };
    const iv = first.chord.ivs.map((i) => ((i % 12) + 12) % 12);
    const minor = iv.includes(3) && !iv.includes(4);
    return { tonic: (minor ? MINOR_TONICS : MAJOR_TONICS)[first.chord.rootPc], mode: minor ? 'minor' : 'major' };
  }
  /**
   * Ordre des parties (« Intro Couplet Refrain ×2 Outro », virgules permises) → [{ i, repeat }].
   * Le nom le plus long qui convient est pris (« Couplet 2 » avant « Couplet »). Vide : chaque partie une fois.
   */
  function coverOrder(names, text) {
    const errors = [];
    if (!String(text || '').trim()) return { seq: names.map((_, i) => i), errors };
    const ns = names.map(normName);
    let rest = normName(text);
    const seq = [];
    const SEP = /^[\s,;→>|]+/;
    while ((rest = rest.replace(SEP, ''))) {
      const rep = /^(?:[x×*])\s*(\d+)/.exec(rest);
      if (rep && seq.length) {
        for (let n = 1; n < +rep[1]; n++) seq.push(seq[seq.length - 1]);
        rest = rest.slice(rep[0].length);
        continue;
      }
      let best = -1;
      ns.forEach((n, i) => {
        if (n && rest.startsWith(n) && (rest.length === n.length || /[\s,;→>|x×*]/.test(rest[n.length])) && (best < 0 || n.length > ns[best].length)) best = i;
      });
      if (best < 0) {
        const tok = rest.split(/[\s,;→>|]/)[0];
        errors.push(`ordre : « ${tok} » n’est pas une partie`);
        rest = rest.slice(tok.length);
        continue;
      }
      seq.push(best);
      rest = rest.slice(ns[best].length);
    }
    if (!seq.length && !errors.length) errors.push('ordre : aucune partie');
    return { seq, errors };
  }
  let coverMemo = { sig: null, val: null };
  /**
   * La reprise → { spec, key, parts: [{ name, bars, spans, errors, id, as }], errors, bars } ; spec est null s'il y a
   * une erreur. Le plan suit le format de js/band-songs.js, avec une grille par section (sec.grid, degrés dans la
   * tonalité) et `as` (section du modèle reprise : nuance et automation).
   */
  function coverModel() {
    const p = preset();
    const sig = JSON.stringify([S.cover, p && p.id]);
    if (coverMemo.sig === sig) return coverMemo.val;
    const base = p && SS.BandSongs && SS.BandSongs[p.id];
    const c = S.cover;
    const parsed = c.parts.map((pt) => coverParse(pt.chords));
    const key = coverKey(parsed);
    const errors = [];
    const seen = new Set();
    const parts = c.parts.map((pt, i) => {
      const r = parsed[i];
      const name = String(pt.name || '').trim();
      const errs = [...r.errors];
      if (!name) errs.unshift('sans nom');
      else if (seen.has(normName(name))) errs.unshift('nom déjà pris');
      seen.add(normName(name));
      errs.forEach((e) => errors.push(`${name || `Partie ${i + 1}`} : ${e}`));
      const as = base ? coverTemplate(base, name) : null;
      return { name, bars: r.bars, spans: r.spans, errors: errs, as, id: `${as}_${i + 1}` };
    });
    const order = coverOrder(parts.map((x) => x.name), c.order);
    errors.push(...order.errors);
    let spec = null;
    let bars = 0;
    if (base && !errors.length && parts.length) {
      const sections = {};
      parts.forEach((pt) => {
        const t = { ...base.sections[pt.as] };
        delete t.key;
        delete t.emotion;
        const grid = pt.spans.map((sp) => {
          const g = SS.harmony.toGridChord(key, { rootPc: sp.chord.rootPc, type: coverType(sp.chord.ivs) });
          const bass = (((sp.chord.bassPc - sp.chord.rootPc) % 12) + 12) % 12;
          return g && { step: sp.step, len: sp.len, ...g, ...(bass ? { bass } : {}) };
        });
        sections[pt.id] = { ...t, as: pt.as, name: pt.name, bars: Math.max(1, pt.bars), grid: grid.filter(Boolean) };
      });
      const form = [];
      order.seq.forEach((i) => {
        const last = form[form.length - 1];
        if (last && last.i === i) last.n++;
        else form.push({ i, n: 1 });
        bars += Math.max(1, parts[i].bars);
      });
      spec = {
        ...base,
        emotion: undefined,
        key: `${key.tonic} ${key.mode}`,
        sections,
        form: form.map((f) => parts[f.i].id + (f.n > 1 ? `*${f.n}` : '')).join(' '),
      };
    }
    coverMemo = { sig, val: { spec, key, parts, errors, bars, used: new Set(order.seq) } };
    return coverMemo.val;
  }
  /** La reprise a changé : les retouches des étapes suivantes (grilles, phrases…) repartent des accords tapés. */
  function coverChanged() {
    if (S.wiz) Object.assign(S.wiz, { plans: {}, pseeds: {}, keys: {}, grids: {}, peds: {}, emos: {}, chars: {}, parts: {}, melPanel: {}, form: null, secs: {}, skey: null, gsel: null, insp: null });
  }
  const singer = (role) => SS.bandSong.SINGERS.includes(role);

  /* ---------- Type d'instrument (S.wiz.kinds) ----------
   * Chaque instrument du groupe (colonne de wizCols, id « musicien:clé[#n] ») a un type : drums, bass, chords, arp ou
   * melody (SS.bandSong.KINDS). S.wiz.kinds = { [id]: type } ne garde que les types choisis ; sans entrée, c'est le type de
   * son rôle (SS.bandSong.DEFAULT_KIND : drums → drums, bass → bass, pad / strings / keys / guitar → chords, arp → arp,
   * lead / vox / sax → melody ; fx n'a pas de type). Un kit de batterie reste drums. Les réglages par scène d'un instrument
   * sont dans S.wiz.parts[section].inst[id], avec repli sur ceux de son rôle (parts[section][rôle]).
   */
  const defaultKind = (c) => (c.o.type === 'drum' ? 'drums' : SS.bandSong.kindOfRole(c.role));
  /** Type d'un instrument (colonne de wizCols) : celui qu'on a choisi, sinon celui de son rôle (null pour fx). */
  function instKind(c) {
    const k = S.wiz && S.wiz.kinds && S.wiz.kinds[c.id];
    return k && SS.bandSong.checkKind({ type: c.o.type }, k) && defaultKind(c) ? k : defaultKind(c);
  }
  /** Change le type d'un instrument ; refusé (false) pour un kit de batterie hors drums ou pour fx. Le type du rôle efface le choix. */
  function setKind(id, kind) {
    const c = wizCols().find((x) => x.id === id);
    if (!c || !defaultKind(c) || !SS.bandSong.checkKind({ type: c.o.type }, kind)) return false;
    if (kind === instKind(c)) return true;
    if (kind === defaultKind(c)) delete S.wiz.kinds[id];
    else S.wiz.kinds[id] = kind;
    // le son devient le phare du nouveau type (ses conseillés sont ceux de ce type)
    const mu = muById(c.musician);
    const ms = mu && !mu.kits ? musState()[mu.id] : null;
    if (ms) {
      Object.assign(ms, { pick: 0, picked: false, custom: null });
      if (mu.added) ms.tok = picksOf(mu)[0];
    }
    return true;
  }
  /** Types gardés quand le groupe change : ceux des instruments qui existent encore. */
  function keptKinds() {
    const ids = new Set(wizCols().map((c) => c.id));
    return Object.fromEntries(Object.entries((S.wiz && S.wiz.kinds) || {}).filter(([id]) => ids.has(id)));
  }
  /**
   * Convertit des parts par rôle en parts par instrument : chaque réglage de rôle (basse, nappe, arpège…) est copié sur
   * les instruments de ce rôle (parts[sec].inst[id]), la batterie sur le kit (clé : id du musicien), et « off » devient
   * inst[id].off. Les réglages déjà par instrument l'emportent. Ne modifie pas parts.
   */
  function partsToInst(parts, cols) {
    const out = {};
    for (const [sec, part] of Object.entries(parts || {})) {
      const p = { ...part };
      const inst = { ...(p.inst || {}) };
      const put = (key, o) => (inst[key] = { ...o, ...(inst[key] || {}) });
      for (const role of Object.keys(p)) {
        if (['inst', 'off', 'lead'].includes(role)) continue;
        const mine = cols.filter((c) => c.role === role);
        if (!mine.length) continue;
        if (role === 'drums') put(mine[0].musician, p[role]);
        else mine.forEach((c) => put(c.id, p[role]));
        delete p[role];
      }
      for (const role of p.off || []) {
        const mine = cols.filter((c) => c.role === role);
        (role === 'drums' ? mine.slice(0, 1).map((c) => c.musician) : mine.map((c) => c.id)).forEach((key) => put(key, { off: true }));
      }
      if (cols.some((c) => (p.off || []).includes(c.role))) p.off = (p.off || []).filter((r) => !cols.some((c) => c.role === r));
      if (!(p.off && p.off.length)) delete p.off;
      if (Object.keys(inst).length) p.inst = inst;
      out[sec] = p;
    }
    return out;
  }
  /** Réglage d'un instrument dans une scène : le sien (parts[sec].inst[id]), sinon celui de son rôle. */
  function instPartOf(sec, c) {
    const pp = S.wiz.parts[sec];
    const own = pp && pp.inst && (pp.inst[c.id] || (c.o.type === 'drum' && pp.inst[c.musician]));
    return own ? { ...((pp && pp[c.role]) || {}), ...own } : (pp && pp[c.role]) || null;
  }
  /** Fusionne `patch` dans le réglage d'un instrument pour une scène (undefined = enlevé) ; un réglage vide disparaît. */
  function putInstPart(sec, id, patch) {
    const p = { ...(S.wiz.parts[sec] || {}) };
    const inst = { ...(p.inst || {}) };
    const o = { ...(inst[id] || {}), ...patch };
    Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
    if (Object.keys(o).length) inst[id] = o;
    else delete inst[id];
    if (Object.keys(inst).length) p.inst = inst;
    else delete p.inst;
    S.wiz.parts[sec] = p;
    tidy(sec);
  }

  /** Colonnes de la vue session : une par piste prévue, avec un identifiant stable (musicien + son). */
  function wizCols() {
    const seen = new Map();
    return plannedTracks().map((o) => {
      const base = `${o.band.musician}:${o.band.key}`;
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      return { id: n ? `${base}#${n}` : base, o, role: o.band.key.split(':')[0], musician: o.band.musician };
    });
  }

  /** La chanson calculée pour la vue session (même calcul que « Créer la chanson », sur des pistes fictives). */
  function wizSong() {
    const p = preset();
    const cols = wizCols();
    const harmony = harmonyOpts(true);
    const parts = partsEff();
    const sig = JSON.stringify([p.id, cover() && S.cover, S.wiz.seed, melodyOpts(), harmony, JSON.stringify(parts, (k, v) => (k === 'hidden' ? undefined : v)), S.wiz.kinds, S.wiz.form, S.wiz.secs, S.wiz.skey, cols.map((c) => [c.id, c.o]), S.wiz.fx]);
    if (S.wiz.sig !== sig) {
      const sp = specEff();
      const fake = cols.map((c) => ({ id: c.id, type: c.o.type, sound: c.o.sound, band: c.o.band }));
      S.wiz.res = sp ? SS.bandSong.build(sp, p.id, fake, { melodySeed: S.wiz.seed, melody: melodyOpts(), harmony, parts, kinds: S.wiz.kinds, fx: fxOpts() }) : null;
      S.wiz.sig = sig;
    }
    return { cols, res: S.wiz.res };
  }

  /**
   * Réglages par scène pour l'écoute : ceux de l'assistant, plus, pendant un essai d'harmonisation (version B à l'écoute),
   * la mélodie de la scène figée telle qu'elle est (sinon le moteur la récrirait sur les nouveaux accords).
   */
  function partsEff() {
    const dv = S.wiz.devAb;
    if (dv && dv.on && melStep() && insAt().key === dv.key) {
      const p = { ...(S.wiz.parts[dv.sec] || {}) };
      const inst = { ...(p.inst || {}) };
      inst[dv.key] = { ...(inst[dv.key] || {}), lead: { events: dv.events } };
      delete inst[dv.key].off;
      const role = insAt().role;
      if (p.off && !typeChanged(insAt())) p.off = p.off.filter((r) => r !== role); // B chante même là où le rôle est coupé
      return { ...S.wiz.parts, [dv.sec]: { ...p, inst } };
    }
    const t = S.wiz.arrAb;
    if (t && t.on && S.wiz.step === ST.arr) {
      const out = { ...S.wiz.parts };
      if (t.part) out[t.sec] = t.part;
      else delete out[t.sec];
      return out;
    }
    const ab = S.wiz.ab;
    if (!ab || !ab.lead || !ab.on || S.wiz.step !== ST.chords) return S.wiz.parts;
    const p = { ...(S.wiz.parts[ab.sec] || {}) };
    const inst = { ...(p.inst || {}) };
    inst[ab.lead.key] = { ...(inst[ab.lead.key] || {}), lead: { events: ab.lead.events } };
    return { ...S.wiz.parts, [ab.sec]: { ...p, inst } };
  }

  /** Accords d'une scène, par leur nom (« Cm | B♭ | A♭ | B♭ »). */
  function sceneChords(sc) {
    const sec = specEff().sections[sc.sec];
    if (!sec || !sec.chords) return '';
    return sec.chords
      .split('|')
      .map((bar) => bar.trim().split(/\s+/).map((tok) => tok.split('/').map((t) => {
        try {
          const c = SS.bandSong.parseChord(t, sc.key);
          return SS.harmony.chordName(sc.key, { ...c, bassPc: c.rootPc });
        } catch (e) {
          return t;
        }
      }).join(' ')).join(' '))
      .join(' | ');
  }

  /** Petit clip dessiné (comme une case de la vue session d'un DAW) : pas de batterie ou notes. */
  function clipSvg(d, bars, range) {
    const W = bars * 16;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} 20`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('bw-clip-svg');
    const rect = (x, y, w, hh) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x);
      r.setAttribute('y', y);
      r.setAttribute('width', w);
      r.setAttribute('height', hh);
      svg.append(r);
    };
    for (let b = 4; b < bars; b += 4) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', b * 16);
      l.setAttribute('x2', b * 16);
      l.setAttribute('y1', 0);
      l.setAttribute('y2', 20);
      l.setAttribute('class', 'bw-bar');
      svg.append(l);
    }
    if (d.steps) d.steps.forEach((v, i) => v > 0 && rect(i + 0.15, 20 - 3 - 15 * v, 0.7, 3 + 15 * v));
    else {
      const [lo, hi] = range;
      const span = Math.max(12, hi - lo);
      (d.events || []).forEach((e) => e.notes.forEach((n) => rect(e.step, 17 - (15 * (n - lo)) / span - 1.5, Math.max(0.6, e.len - 0.15), 3)));
    }
    return svg;
  }
  const hasData = (d) => !!d && (d.steps ? d.steps.some((v) => v > 0) : (d.events || []).length > 0);

  /** Réglages passés à SS.bandSong.build (caractère, réglages fins, plan de phrases de chaque section). */
  function melodyOpts() {
    const m = S.mel;
    return {
      character: m.character, form: m.form === 'auto' ? null : m.form, rhythm: m.rhythm, complexity: m.complexity, range: m.range, ending: m.ending, notes: m.notes,
      useProfile: m.profile !== 'off',
      plans: S.wiz.plans, seeds: S.wiz.pseeds, scenes: S.wiz.chars,
    };
  }
  /**
   * Accords de l'étape Accords, par section : tonalité, grille, émotion. `preview` : la proposition choisie dans la
   * fenêtre « Trouver l'inspiration » remplace la scène le temps de l'écouter.
   */
  function harmonyOpts(preview = false) {
    const w = S.wiz;
    const out = { keys: { ...w.keys }, chords: { ...w.grids }, emotions: { ...w.emos }, pedals: { ...(w.peds || {}) } };
    const ab = preview && w.ab && w.ab.on && w.step === ST.chords ? w.ab : null; // essai A/B : la version B à l'écoute
    if (ab) {
      out.chords[ab.sec] = ab.grid;
      if (ab.peds) out.pedals[ab.sec] = ab.peds;
      else if (ab.lead) delete out.pedals[ab.sec]; // harmonisation : pas de pédale sous les accords proposés
    }
    const pv = preview && w.insp && w.insp.preview;
    if (pv) {
      out.keys[pv.sec] = pv.key;
      out.chords[pv.sec] = pv.grid;
      out.emotions[pv.sec] = pv.emo;
    }
    return out;
  }
  const BS = () => SS.bandSong;

  /* Tête d'étape : une phrase courte et concrète par étape (78 caractères au plus) : voir stepInfo(n).line. */

  /** Résumé d'une ligne d'une étape (style, tempo, motif de la scène…) ; vide si on ne peut pas encore le dire. */
  function stepSummary(n) {
    try {
      const p = preset();
      if (n === ST.style) return cover() ? 'Reprise' : (style() || {}).label || '';
      if (n === ST.inst) {
        const k = musicians().length;
        return `${k} musicien${k > 1 ? 's' : ''}`;
      }
      if (!spec()) return '';
      if (n === ST.tempo) return `${tempo()} BPM · ${SS.harmony.label(songKey())}`;
      const { cols, res } = wizSong();
      if (!res) return '';
      if (n === ST.scenes) {
        const bars = res.song.reduce((a, b) => a + res.scenes.find((sc) => sc.id === b.scene).bars * b.repeat, 0);
        return `${res.scenes.length} scènes · ${bars} mesures`;
      }
      if (n === ST.arr) return arrSummary(res);
      if (n === ST.fx) return fxSummary(res);
      if (n === ST.mix) {
        const m = S.wiz.mix;
        const k = m ? res.scenes.filter((x) => SS.wizMix.ownCount(m, x.sec) > 0).length : 0;
        if (k) return `${k} scène${k > 1 ? 's' : ''} retouchée${k > 1 ? 's' : ''}`;
        return m && JSON.stringify([m.tracks, m.master]) !== JSON.stringify([m.base.tracks, m.base.master]) ? 'Chanson retouchée' : 'Mixage automatique';
      }
      if (n === ST.pick) {
        const k = cols.filter((c) => !S.wiz.off.has(c.id)).length;
        return k ? `${k} piste${k > 1 ? 's' : ''}` : 'aucune piste';
      }
      // étapes par scène : le réglage de la scène qu'on regarde (sans changer de scène)
      const sc = res.scenes.find((x) => x.id === S.wiz.hscene) || res.scenes.find((x) => x.sec === S.wiz.hsec) || res.scenes[0];
      if (n === ST.chords) return sceneChords(sc).split(' | ').slice(0, 4).join(' ');
      const t = insAt(n);
      if (t) return `${t.sound.replace(/\s*\(.*$/, '')} · ${instSub(t, sc)}${autoCount(sc.sec, t) ? ' · auto' : ''}`;
    } catch (e) {
      return '';
    }
    return '';
  }

  function renderWizSteps() {
    const box = $('#bandWizSteps');
    const w = S.wiz;
    w.seen.add(w.step);
    const total = ST.pick;
    box.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const info = stepInfo(n);
        const cur = n === w.step;
        const seen = w.seen.has(n) && !cur;
        const sum = stepSummary(n);
        return h(
          'li',
          {
            class: (cur ? 'cur' : '') + (seen ? ' done' : '') + (info.ins ? ' bw-ins' : ''), 'aria-current': cur ? 'step' : null, 'data-group': info.group || null, 'data-step': n, 'data-kind': info.ins ? info.ins.kind : null,
            style: info.color ? `--c:${info.color}` : null,
          },
          h(
            'button',
            { type: 'button', disabled: n > w.step && !canGo(n), title: info.hint, onclick: () => goStep(n) },
            h('b', { class: 'bw-pill' }, seen ? '✓' : String(n)),
            h('span', { class: 'bw-sn' }, info.ins ? [h('i', { class: 'bw-dot' }), info.label] : info.label),
            sum ? h('small', { class: 'bw-ss' }, sum) : null
          )
        );
      })
    );
    const cur = box.querySelector('li.cur');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' }); // la bande étroite défile jusqu'à l'étape en cours
    renderStepHead();
  }

  /** Étape Instruments : « N musiciens · 2 à 10 » près du titre. */
  function countBadge() {
    const n = group().list.length;
    return h('span', { class: 'bg-count' + (n >= BG().MAX ? ' max' : ''), id: 'bgCount', 'aria-live': 'polite' }, `${n} musicien${n > 1 ? 's' : ''} · ${BG().MIN} à ${BG().MAX}`);
  }

  /** Tête d'étape : le numéro en gris, le nom en grand, puis une phrase. */
  function renderStepHead() {
    const n = S.wiz.step;
    const box = $('#bwStepHead');
    const info = stepInfo(n);
    box.hidden = false;
    box.classList.toggle('bw-insHead', !!info.ins);
    box.replaceChildren(
      h('h1', {}, h('em', {}, String(n).padStart(2, '0')), info.label, n === ST.inst ? countBadge() : null),
      ...(info.sub ? [h('div', { class: 'bw-hsub', id: 'bwSound' }, info.sub)] : []),
      n === ST.fx
        ? h('div', { class: 'bw-insline' }, h('span', { class: 'bw-ktag', style: `--c:${FX_COLOR}`, title: 'Rôle : Effets (montées, impacts) et Percussionniste' }, 'Effets'), h('p', {}, info.line))
        : info.ins
        ? h('div', { class: 'bw-insline' }, h('span', { class: 'bw-ktag', id: 'bwKindTag', 'data-kind': info.ins.kind, style: `--c:${KIND_COLOR[info.ins.kind]}`, title: 'Type de cet instrument (à changer à l’étape 2, Instruments)' }, KIND_STEP[info.ins.kind]), h('p', {}, info.line))
        : h('p', {}, info.line)
    );
  }

  /** On peut aller à l'étape n si la chanson se calcule (inspiration avec un plan, au moins une piste). */
  function canGo(n) {
    if (n <= 1) return true;
    return !!spec() && plannedTracks().length > 0;
  }

  function goStep(n) {
    if (n === S.wiz.step || !canGo(n)) return;
    S.wiz.step = n;
    S.sel = null;
    S.wiz.insp = null;
    S.wiz.gsel = null;
    if (sceneStep(n) && L.mode && L.scene) S.wiz.hscene = L.scene; // Accords, Mélodie : la scène qu'on entend
    if (n <= ST.inst) dropListen(); // style et instruments changent toute la chanson
    else if (L.junc && n !== ST.fx) dropListen(); // la transition ne s'écoute que dans son étape
    renderWiz();
    if (sceneStep(n) && L.mode === 'song' && !L.paused) playScene(S.wiz.hscene); // ici, on écoute une scène
  }

  function toggleCols(ids, on) {
    ids.forEach((id) => (on ? S.wiz.off.delete(id) : S.wiz.off.add(id)));
    renderWiz();
  }

  /* ---------- Étape Tempo et tonalité ----------
   * Tempo : grand afficheur, − / +, curseur (la zone dorée : le tempo conseillé du style), Tap, tempo de l'inspiration.
   * Tonalité de la chanson : 12 toniques, modes, gamme à écouter au piano ; la changer transpose toutes les scènes (setSongKey).
   */
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const mmss = (secs) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
  let scaleTimers = [];
  /** Fait entendre la gamme (huit notes, au piano) ; chaque note allume sa case. */
  function hearScale(key) {
    scaleTimers.forEach(clearTimeout);
    scaleTimers = [];
    const m = SS.harmony.MODES.find((x) => x.id === key.mode);
    if (!m) return;
    stopListen();
    SS.audio.ensureCtx();
    const base = 57 + ((tonicPc(key.tonic) + 3) % 12);
    const fake = { id: null, type: 'instrument', family: 'keys', instrument: 'piano', octave: 4, chord: 'min', sfv: 0, volume: 0.9, name: 'Piano', events: [] };
    [...m.iv, 12].forEach((iv, i) => {
      scaleTimers.push(
        setTimeout(() => {
          try {
            Promise.resolve(SS.audio.preview(fake, base + iv, 0.55)).catch(() => {});
          } catch (e) {
            console.warn(e);
          }
          document.querySelectorAll('#bandWiz .bwt-note').forEach((n, k) => n.classList.toggle('sounding', k === i % 7 && i < 8));
        }, i * 330)
      );
    });
    scaleTimers.push(setTimeout(() => document.querySelectorAll('#bandWiz .bwt-note').forEach((n) => n.classList.remove('sounding')), 8 * 330 + 200));
  }

  function renderTempo() {
    const box = $('#bandWiz');
    const { res } = wizSong();
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const H = SS.harmony;
    const t = tempo();
    const st = style();
    const [lo, hi] = st ? styleTempo(st) : [TEMPO_MIN, TEMPO_MAX];
    const pos = (v) => `${(100 * (v - TEMPO_MIN)) / (TEMPO_MAX - TEMPO_MIN)}%`;
    const orig = origTempo();
    const len = res.song.reduce((a, b) => a + res.scenes.find((sc) => sc.id === b.scene).bars * b.repeat, 0);
    const key = songKey();
    const fam = FAM_MAJOR(key.mode);
    const modes = H.MODES;

    const bpmCard = h(
      'section',
      { class: 'bwt-card bw-card', 'aria-labelledby': 'bwtTempoTitle' },
      h('h3', { id: 'bwtTempoTitle' }, 'Tempo'),
      h(
        'div',
        { class: 'bwt-bpm' },
        h('div', { class: 'bwt-lcd', id: 'bwtLcd', 'aria-live': 'polite', 'aria-label': 'Tempo en BPM' }, String(t)),
        h('span', { class: 'bwt-unit' }, 'BPM'),
        h('button', { type: 'button', class: 'btn bwt-step', id: 'bwtMinus', 'aria-label': 'Ralentir de 1 BPM', title: 'Ralentir (−1 BPM)', onclick: () => setTempo(tempo() - 1) }, '−'),
        h('button', { type: 'button', class: 'btn bwt-step', id: 'bwtPlus', 'aria-label': 'Accélérer de 1 BPM', title: 'Accélérer (+1 BPM)', onclick: () => setTempo(tempo() + 1) }, '+'),
        h(
          'div',
          { class: 'bwt-range' },
          st ? h('i', { class: 'bwt-reco', title: `Tempo conseillé pour ${st.label} : ${lo}–${hi} BPM`, style: `left:${pos(lo)};width:calc(${pos(hi)} - ${pos(lo)})` }) : null,
          h('input', {
            type: 'range', id: 'bwtRange', min: TEMPO_MIN, max: TEMPO_MAX, step: 1, value: t, 'aria-label': 'Tempo',
            oninput: (e) => setTempo(e.target.value, true),
            onchange: (e) => setTempo(e.target.value),
          })
        ),
        h('button', { type: 'button', class: 'btn', id: 'bwtTap', title: 'Tape en rythme (3 fois ou plus) pour trouver le tempo', onclick: () => { const b = tapBpm(); if (b) setTempo(b); } }, 'Tap')
      ),
      h(
        'div',
        { class: 'bwt-meta' },
        st ? h('span', {}, `Conseillé pour ${st.label} : `, h('b', {}, `${lo}–${hi} BPM`), ' (zone dorée)') : null,
        h('span', { id: 'bwtDur' }, `${len} mesures · ${mmss((len * 4 * 60) / t)}`),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwtOrig', hidden: t === orig, title: 'Revenir au tempo de l’inspiration', onclick: () => setTempo(orig) }, `↺ Tempo de l’inspiration : ${orig}`)
      )
    );

    const keyCard = h(
      'section',
      { class: 'bwt-card bw-card', 'aria-labelledby': 'bwtKeyTitle' },
      h('h3', { id: 'bwtKeyTitle' }, 'Tonalité de la chanson'),
      h('p', { class: 'dlg-hint' }, 'Changer la tonalité transpose toutes les scènes : les accords gardent leurs degrés. Une scène qui jouait dans un autre mode (un pont en majeur dans une chanson mineure) garde son mode.'),
      h(
        'div',
        { class: 'bwt-row', role: 'group', 'aria-label': 'Tonique' },
        h('span', { class: 'bwt-lbl' }, 'Tonique'),
        h(
          'div',
          { class: 'bwt-tonics' },
          ...Array.from({ length: 12 }, (_, pc) => {
            const name = tonicName(pc, key.mode);
            const on = pc === tonicPc(key.tonic);
            return h('button', { type: 'button', class: 'bwt-tonic' + (on ? ' active' : '') + (name.length > 1 ? ' blk' : ''), 'data-pc': pc, 'aria-pressed': String(on), onclick: () => setSongKey({ tonic: name, mode: key.mode }) }, H.french(name));
          })
        )
      ),
      h(
        'div',
        { class: 'bwt-row', role: 'group', 'aria-label': 'Mode' },
        h('span', { class: 'bwt-lbl' }, 'Mode'),
        h(
          'div',
          { class: 'bwt-modes segmented' },
          ...modes.map((m) => h('button', { type: 'button', class: 'bwt-mode' + (m.id === key.mode ? ' active' : ''), 'data-skmode': m.id, 'aria-pressed': String(m.id === key.mode), title: m.colorText ? `Note caractéristique : ${m.colorText}` : m.fam === 'major' ? 'Tierce majeure' : 'Tierce mineure', onclick: () => setSongKey({ tonic: key.tonic, mode: m.id }) }, m.label.replace(' (mode)', '')))
        )
      ),
      h(
        'div',
        { class: 'bwt-row' },
        h('span', { class: 'bwt-lbl' }, `Gamme de ${H.label(key)}`),
        h('button', { type: 'button', class: 'btn', id: 'bwtScale', title: 'Fait entendre la gamme au piano', onclick: () => hearScale(key) }, '▶ Écouter la gamme'),
        S.wiz.skey ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwtKeyBack', title: 'Revenir à la tonalité de l’inspiration, scène par scène', onclick: () => setSongKey(parseKeyStr(spec().key)) }, `↺ Tonalité de l’inspiration : ${H.label(parseKeyStr(spec().key))}`) : null
      ),
      h(
        'ol',
        { class: 'bwt-notes', 'aria-label': 'Notes de la gamme' },
        ...H.scale(key).map((d, i) => {
          const mm = modes.find((x) => x.id === key.mode);
          return h('li', { class: 'bwt-note' + (i === 0 ? ' tonic' : '') + (mm && mm.color === i ? ' color' : ''), title: mm && mm.color === i ? mm.colorText : null }, h('small', {}, `${i + 1} · ${ROMAN[i]}`), h('b', {}, H.french(d.name)));
        })
      ),
      h('p', { class: 'dlg-hint' }, `${fam ? 'Mode à tierce majeure' : 'Mode à tierce mineure'} · ${keyInfo(key)}`)
    );
    box.replaceChildren(h('div', { class: 'bwt' }, bpmCard, keyCard));
  }

  /* ---------- Étape Scènes : arrangement et scènes ----------
   * L'arrangement est une bande de blocs (largeur = mesures × répétitions, couleur = type de scène) : glisser-déposer
   * ou ‹ › pour l'ordre, − / + pour les répétitions, × pour retirer. Dessous, une ligne par scène : nom, longueur,
   * « + Ajouter à la fin », « Dupliquer », suppression. Tout passe par specEff : la chanson écoutée est celle-là.
   */
  const SEC_COLORS = [
    [/^intro/, '#4aa3c9'], [/^(verse|groove|theme)/, '#4f6bff'], [/^(pre|build)/, '#f08a00'], [/^(chorus|drop|peak|post)/, '#e3179c'],
    [/^(bridge|break)/, '#9b5cff'], [/^(solo|instr|riff)/, '#13c2a3'], [/^outro/, '#7a8a99'],
  ];
  const secColor = (id) => (SEC_COLORS.find(([re]) => re.test(kindOf(id))) || [0, '#8a8a96'])[1];
  const BAR_CHOICES = [4, 8, 16, 32];
  let dragFrom = -1;
  const ctl = (cls, label, text, onclick, disabled = false) => h('button', { type: 'button', class: 'bw-bc ' + cls, 'aria-label': label, title: label, disabled, onclick }, text);

  /** La bande des blocs de l'arrangement, éditable. */
  function arrangement(res, len, time) {
    const w = S.wiz;
    const edited = !!w.form || Object.keys(w.secs).length > 0;
    const n = res.song.length;
    return h(
      'div',
      { class: 'bw-arr', role: 'group', 'aria-label': 'Arrangement de la chanson' },
      h(
        'div',
        { class: 'bw-arr-head' },
        h('b', {}, 'Arrangement'),
        h('span', { class: 'bw-seed', id: 'bwArrInfo' }, `${n} bloc${n > 1 ? 's' : ''} · ${len} mesures · ${time}`),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwArrReset', hidden: !edited, title: 'Revenir à l’ordre, aux longueurs et aux scènes de l’inspiration', onclick: resetStructure }, '↺ Structure de l’inspiration')
      ),
      h(
        'ol',
        { class: 'bw-blocks bw-arr-blocks' },
        ...res.song.map((b, i) => {
          const sc = res.scenes.find((x) => x.id === b.scene);
          const bars = sc.bars * b.repeat;
          const li = h(
            'li',
            { draggable: 'true', 'data-i': i, style: `flex:${bars} 1 172px;--c:${secColor(sc.sec)}` },
            h(
              'button',
              { type: 'button', class: 'bw-block', 'data-sec': sc.sec, title: `Écouter à partir de « ${sc.name} » (${bars} mesures)`, onclick: () => listenSong(i) },
              h('span', { class: 'bw-bn' }, sc.name),
              h('small', { class: 'bw-bm' }, `${bars} mesures`)
            ),
            h(
              'div',
              { class: 'bw-bctls' },
              ctl('bw-bl', `Avancer « ${sc.name} » (vers le début)`, '‹', () => moveBlock(i, i - 1), i === 0),
              ctl('bw-brl', 'Une répétition de moins', '−', () => repeatBlock(i, -1), b.repeat < 2),
              h('span', { class: 'bw-brn', title: `Joué ${b.repeat} fois de suite` }, `×${b.repeat}`),
              ctl('bw-brm', 'Une répétition de plus', '+', () => repeatBlock(i, 1), b.repeat > 15),
              ctl('bw-br', `Reculer « ${sc.name} » (vers la fin)`, '›', () => moveBlock(i, i + 1), i === n - 1),
              ctl('bw-bx', `Retirer ce bloc « ${sc.name} »`, '×', () => removeBlock(i), n < 2)
            )
          );
          li.addEventListener('dragstart', (e) => {
            dragFrom = i;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
            li.classList.add('dragging');
          });
          li.addEventListener('dragend', () => {
            dragFrom = -1;
            li.parentNode.querySelectorAll('li').forEach((x) => x.classList.remove('dragging', 'over'));
          });
          li.addEventListener('dragover', (e) => {
            if (dragFrom < 0) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            li.classList.add('over');
          });
          li.addEventListener('dragleave', () => li.classList.remove('over'));
          li.addEventListener('drop', (e) => {
            e.preventDefault();
            const from = dragFrom;
            dragFrom = -1;
            if (from >= 0) moveBlock(from, i);
          });
          return li;
        })
      ),
      h('p', { class: 'dlg-hint' }, 'Glisse un bloc pour le déplacer (ou ‹ ›), − / + pour le répéter, × pour le retirer ; clique son nom pour écouter à partir de là.')
    );
  }

  /** Une ligne par scène du plan retouché (même celles que l'arrangement ne joue pas) : nom, longueur, ajouter, dupliquer, supprimer. */
  function sceneEditor() {
    const sp = specEff();
    const f = formOf();
    const plays = new Map();
    f.forEach((b) => plays.set(b.id, (plays.get(b.id) || 0) + b.repeat));
    const ids = [...new Set([...f.map((b) => b.id), ...Object.keys(sp.sections)])].filter((id) => sp.sections[id]);
    const full = f.length >= FORM_MAX;
    return h(
      'div',
      { class: 'bw-sc-list', role: 'list', 'aria-label': 'Scènes de la chanson' },
      ...ids.map((id) => {
        const sec = sp.sections[id];
        const name = secName(id);
        const bars = BAR_CHOICES.includes(sec.bars) ? BAR_CHOICES : [...BAR_CHOICES, sec.bars].sort((a, b) => a - b);
        const n = plays.get(id) || 0;
        return h(
          'div',
          { class: 'bw-sc' + (n ? '' : ' unused'), role: 'listitem', 'data-sec': id, style: `--c:${secColor(id)}` },
          h('span', { class: 'bw-sc-bar', 'aria-hidden': 'true' }),
          h(
            'div',
            { class: 'bw-sc-id' },
            h('input', {
              type: 'text', class: 'bw-sc-name', value: name, maxlength: 40, 'aria-label': `Nom de la scène « ${name} »`, spellcheck: 'false',
              onchange: (e) => renameSec(id, e.target.value),
              onkeydown: (e) => e.key === 'Enter' && e.target.blur(),
            }),
            h('small', {}, `${BS().NAMES[kindOf(id)] || kindOf(id)} · ${sec.bars} mesures · ` + (n ? `jouée ${n} fois` : 'pas dans l’arrangement'))
          ),
          h(
            'span',
            { class: 'segmented bw-bars', role: 'radiogroup', 'aria-label': `Longueur de « ${name} »` },
            ...bars.map((b) => h('button', { type: 'button', role: 'radio', class: b === sec.bars ? 'active' : '', 'aria-checked': String(b === sec.bars), 'data-bars': b, title: `${b} mesures`, onclick: () => setSecBars(id, b) }, String(b)))
          ),
          h('button', { type: 'button', class: 'btn btn-icon bw-sc-add', disabled: full, 'aria-label': `Ajouter « ${name} » à la fin de la chanson`, title: 'Ajouter à la fin : joue cette scène une fois de plus, à la fin de la chanson', onclick: () => addBlock(id), html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' }),
          h('button', { type: 'button', class: 'btn btn-icon bw-sc-dup', disabled: full || ids.length >= 26, 'aria-label': `Dupliquer la scène « ${name} »`, title: 'Dupliquer : copie indépendante de la scène (nouveau nom, mêmes accords et mêmes réglages au départ)', onclick: () => dupScene(id), html: '<svg viewBox="0 0 24 24"><path d="M9 9h10v10H9z"/><path d="M5 15V5h10"/></svg>' }),
          h('button', { type: 'button', class: 'btn btn-icon bw-sc-del', disabled: ids.length < 2, 'aria-label': `Supprimer la scène « ${name} »`, title: ids.length < 2 ? 'La dernière scène ne peut pas être supprimée' : 'Supprime la scène et ses blocs', onclick: () => delScene(id), html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' })
        );
      })
    );
  }

  function renderWizGrid() {
    const p = preset();
    const { cols, res } = wizSong();
    const step = S.wiz.step;
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    // scènes : une ligne chacune, dans l'ordre d'arrivée ; combien de fois elle est jouée dans l'arrangement
    const plays = new Map();
    res.song.forEach((b) => plays.set(b.scene, (plays.get(b.scene) || 0) + b.repeat));
    // tessiture de chaque colonne (même échelle dans toutes les scènes)
    const range = new Map(cols.map((c) => {
      const ns = res.scenes.flatMap((sc) => ((sc.data[c.id] || {}).events || []).flatMap((e) => e.notes));
      return [c.id, ns.length ? [Math.min(...ns), Math.max(...ns)] : [48, 72]];
    }));
    // groupes de colonnes : un par musicien (la batterie a une colonne par élément)
    const groups = [];
    cols.forEach((c) => {
      const g = groups[groups.length - 1];
      if (g && g.musician === c.musician) g.cols.push(c);
      else groups.push({ musician: c.musician, mu: muById(c.musician), cols: [c] });
    });
    const pick = step === ST.pick;
    // étape Chanson : les colonnes coupées à l'étape Mélodie (Muet / Solo) sont grisées
    const muted = (c) => !pick && silenced(c.id);
    const isOff = (c) => pick && S.wiz.off.has(c.id);
    const check = (ids, label) => {
      const on = ids.filter((id) => !S.wiz.off.has(id)).length;
      const cb = h('input', { type: 'checkbox', 'aria-label': `Importer ${label}`, onchange: (e) => toggleCols(ids, e.target.checked) });
      cb.checked = on > 0;
      cb.indeterminate = on > 0 && on < ids.length;
      return cb;
    };
    const len = res.song.reduce((a, b) => a + res.scenes.find((sc) => sc.id === b.scene).bars * b.repeat, 0);
    const secs = (len * 4 * 60) / tempo();
    const time = `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
    const kept = cols.filter((c) => !S.wiz.off.has(c.id)).length;

    const scenesStep = step === ST.scenes;
    const order = scenesStep ? arrangement(res, len, time) : h(
      'div',
      { class: 'bw-order', role: 'group', 'aria-label': 'Ordre des scènes dans la chanson' },
      h(
        'ol',
        { class: 'bw-blocks' },
        ...res.song.map((b, i) => {
          const sc = res.scenes.find((x) => x.id === b.scene);
          const bars = sc.bars * b.repeat;
          return h(
            'li',
            { style: `flex:${bars} 1 0` },
            h(
              'button',
              { type: 'button', class: 'bw-block', 'data-sec': sc.sec, title: `Écouter à partir de « ${sc.name} » (${bars} mesures)`, onclick: () => listenSong(i) },
              h('span', {}, sc.name),
              b.repeat > 1 ? h('small', {}, `×${b.repeat}`) : null
            )
          );
        })
      ),
      h('span', { class: 'bw-seed bw-dur' }, time)
    );
    const top = h(
      'div',
      { class: 'bw-top' },
      h(
        'div',
        { class: 'bw-info' },
        h('b', {}, `« ${p.song} »`),
        h('span', {}, ` ${p.artist} · ${SS.harmony.label(res.key)} · ${tempo()} BPM · ${res.scenes.length} scènes · ${len} mesures · ${time}`)
      ),
      scenesStep ? null : h('p', { class: 'bw-hint' }, 'Clique une scène pour l’écouter en boucle.'),
      order,
      step === ST.pick
        ? h(
            'div',
            { class: 'bw-actions' },
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => toggleCols(cols.map((c) => c.id), true) }, 'Tout'),
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => toggleCols(cols.map((c) => c.id), false) }, 'Rien'),
            h('span', { class: 'bw-seed' }, `${kept} piste${kept > 1 ? 's' : ''} sur ${cols.length}`)
          )
        : null
    );

    const head1 = h(
      'tr',
      { class: 'bw-groups' },
      h('th', { class: 'bw-corner', rowspan: 2, scope: 'col' }, 'Scènes'),
      ...groups.map((g) => {
        const label = labelOf(g.mu);
        const ids = g.cols.map((c) => c.id);
        const off = pick && ids.every((id) => S.wiz.off.has(id));
        return h(
          'th',
          {
            colspan: g.cols.length,
            scope: 'colgroup',
            class: 'bw-group' + (off ? ' off' : ''),
            style: `--c:${colorOf(g.mu)}`,
          },
          h('label', { class: 'bw-glabel' }, pick ? check(ids, label) : null, h('span', { class: 'bw-ico', html: icon(g.mu.role) }), h('span', {}, label))
        );
      })
    );
    const head2 = h(
      'tr',
      { class: 'bw-tracks' },
      ...cols.map((c) => {
        const multi = groups.find((g) => g.musician === c.musician).cols.length > 1;
        return h(
          'th',
          { scope: 'col', class: 'bw-track' + (isOff(c) ? ' off' : '') + (muted(c) ? ' muted' : ''), style: `--c:${c.o.color}`, title: B().describe(c.o).name },
          h('label', {}, pick && multi ? check([c.id], c.o.name) : null, h('span', {}, c.o.name))
        );
      })
    );
    const body = res.scenes.map((sc) =>
      h(
        'tr',
        { 'data-scene': sc.id, 'data-bars': sc.bars },
        h(
          'th',
          { scope: 'row', class: 'bw-scene', title: sceneChords(sc) },
          h(
            'button',
            { type: 'button', class: 'bw-splay', 'aria-pressed': 'false', title: `Écouter « ${sc.name} » en boucle (re-clic : arrêt)`, onclick: () => listenScene(sc.id) },
            h('span', { class: 'bw-pico', html: PLAY + STOP }),
            h('span', { class: 'bw-sname' }, sc.name),
            h('small', {}, `${sc.bars} mes.` + (plays.get(sc.id) > 1 ? ` · ×${plays.get(sc.id)}` : '')),
            h('small', { class: 'bw-chords' }, sceneChords(sc))
          )
        ),
        ...cols.map((c) => {
          const d = sc.data[c.id];
          const on = hasData(d);
          const n = on ? (d.steps ? d.steps.filter((v) => v > 0).length : d.events.length) : 0;
          return h(
            'td',
            { class: 'bw-cell' + (isOff(c) ? ' off' : '') + (muted(c) ? ' muted' : '') },
            on
              ? h('div', { class: 'bw-clip', style: `--c:${c.o.color}`, title: `${sc.name} · ${c.o.name} : ${n} ${d.steps ? 'coup' : 'note'}${n > 1 ? 's' : ''}` }, clipSvg(d, sc.bars, range.get(c.id)))
              : h('div', { class: 'bw-slot', title: `${sc.name} · ${c.o.name} : silence` })
          );
        })
      )
    );
    const table = h('table', { class: 'bw-grid', style: `--cols:${cols.length}` }, h('thead', {}, head1, head2), h('tbody', {}, ...body));
    box.replaceChildren(top, h('div', { class: 'bw-scroll' }, scenesStep ? sceneEditor() : null, table));
  }

  /* ---------- Étape Mélodie (accords, phrases de la mélodie, instruments) ----------
   * À gauche les scènes (dans l'ordre d'arrivée, avec leurs accords en résumé) ; à droite la scène choisie : la
   * piste d'accords en haut, dessinée comme dans Harmonie (degré, nom, rôle : repos / préparation / tension), puis les
   * instruments. Une note pleine appartient à l'accord du moment ; en creux, c'est une note de passage.
   * La batterie, sans hauteur de note, est masquée par défaut (interrupteur « Batterie »).
   */
  const NO_ROLE = { id: 'color', label: 'emprunt', text: 'accord pris hors de la tonalité' };
  /** Nom, degré, rôle et notes (classes de hauteur) d'un accord de la chanson dans la tonalité de sa scène. */
  function chordInfo(key, c) {
    const H = SS.harmony;
    const id = { rootPc: c.rootPc, type: c.type, bassPc: c.rootPc };
    const deg = H.scale(key).findIndex((d) => d.pc === c.rootPc);
    return {
      name: H.chordName(key, id),
      numeral: H.analyzeChord(key, id).numeral,
      role: deg >= 0 ? H.role(key, deg, c.type) : NO_ROLE,
      pcs: SS.chordNotes(60 + c.rootPc, c.type).map((n) => ((n % 12) + 12) % 12),
    };
  }
  /** Accords d'une scène, pas par pas : [{ step, len, bar, info }]. */
  function sceneSpans(sc) {
    if (sc.spans) return sc.spans.map((x) => ({ step: x.step, len: x.len, bar: x.bar, info: chordInfo(sc.key, x.chord) }));
    const sec = spec() && specEff().sections[sc.sec];
    if (!sec || !sec.chords) return [];
    try {
      return SS.bandSong.spansOf(sec, sc.key, sc.bars).map((x) => ({ step: x.step, len: x.len, bar: x.bar, info: chordInfo(sc.key, x.chord) }));
    } catch (e) {
      return [];
    }
  }

  /** Scène choisie aux étapes Accords et Mélodie (la même section après un nouveau calcul de la chanson). */
  function curScene(res) {
    if (!res.scenes.some((x) => x.id === S.wiz.hscene)) S.wiz.hscene = (res.scenes.find((x) => x.sec === S.wiz.hsec) || res.scenes[0]).id;
    const sc = res.scenes.find((x) => x.id === S.wiz.hscene);
    S.wiz.hsec = sc.sec;
    return sc;
  }
  function pickScene(x) {
    if (x.id === S.wiz.hscene) return;
    S.wiz.hscene = x.id;
    S.wiz.hsec = x.sec;
    S.wiz.gsel = null;
    renderWiz();
    if (L.mode === 'scene') playScene(x.id); // la lecture suit la scène choisie
  }

  /**
   * Colonne des scènes (étapes Accords et Mélodie), sous le titre : nom, longueur, accords distincts, puis une
   * ligne propre à l'étape (`sub` : émotion choisie, caractère de la mélodie…).
   */
  function sceneNav(res, sc, sub, legend = false) {
    const plays = new Map();
    res.song.forEach((b) => plays.set(b.scene, (plays.get(b.scene) || 0) + b.repeat));
    return h(
      'nav',
      { class: 'bh-scenes', 'aria-label': 'Scènes, dans l’ordre' },
      h('div', { class: 'bh-label' }, 'Scènes, dans l’ordre'),
      ...res.scenes.map((x) => {
        const seen = new Map();
        sceneSpans(x).forEach((sp) => !seen.has(sp.info.name) && seen.set(sp.info.name, sp.info));
        const on = x.id === sc.id;
        const line = sub && sub(x);
        return h(
          'button',
          { type: 'button', class: 'bh-scene' + (on ? ' on' : ''), style: `--c:${secColor(x.sec)}`, 'data-scene': x.id, 'data-sec': x.sec, 'aria-pressed': String(on), title: `Travailler « ${x.name} » (la lecture joue la scène choisie)`, onclick: () => pickScene(x) },
          h('span', { class: 'bh-sname' }, h('b', {}, x.name), h('small', {}, `${x.bars} mes.` + (plays.get(x.id) > 1 ? ` · ×${plays.get(x.id)}` : ''))),
          h('span', { class: 'bh-mini' }, ...[...seen.values()].map((c) => h('span', { class: 'bh-mchip role-' + c.role.id, title: `${c.numeral} · ${c.role.label}` }, c.name))),
          line ? h('small', { class: 'bh-ssub' }, line) : null
        );
      }),
      legend ? h('div', { class: 'bh-legend' }, h('span', {}, h('i', { class: 'bh-lg-in' }), 'Note de l’accord'), h('span', {}, h('i', { class: 'bh-lg-out' }), 'Note de passage')) : null
    );
  }
  /** Mise en page des étapes Accords et Mélodie : colonne des scènes à gauche, bandeau de lecture et contenu à droite. */
  function splitView(nav, ...content) {
    const box = $('#bandWiz');
    box.classList.add('bw-split');
    box.replaceChildren(h('div', { class: 'bh-wrap' }, nav, h('div', { class: 'bh-right' }, h('div', { class: 'bh-content' }, ...content))));
  }

  /**
   * Étape Mélodie, pour la scène choisie : titre, grille en lecture seule (accords et mélodie qui joue), puis l'onglet
   * Mélodie d'Harmonie (js/melodypanel.js) ; l'accompagnement (Muet / Solo / volume, menu « Pistes ») est dessous.
   * Renvoie les morceaux de la page : ils sont redessinés sans toucher au panneau (refreshMelFrame).
   */
  function melScene(cols, res, sc, T) {
    const total = sc.bars * 16;
    const pct = (x) => `${((100 * x) / total).toFixed(3)}%`;
    const spans = sceneSpans(sc);
    const spanAt = (step) => spans.find((x) => step >= x.step && step < x.step + x.len);
    const head = (cls, ...kids) => h('div', { class: 'bh-head ' + cls }, ...kids);
    const row = (cls, headEl, ...kids) => h('div', { class: 'bh-row ' + cls }, headEl, h('div', { class: 'bh-track' }, ...kids));
    // bandes des accords (repères de lecture dans toutes les lignes)
    const bands = () => spans.map((x, i) => h('i', { class: 'bh-band' + (i % 2 ? '' : ' alt'), style: `left:${pct(x.step)};width:${pct(x.len)}` }));

    const ruler = row(
      'bh-ruler',
      head('', ''),
      ...Array.from({ length: sc.bars }, (_, b) => h('span', { class: 'bh-num', style: `left:${pct(b * 16)}` }, String(b + 1)))
    );
    const chords = row(
      'bh-chords',
      head('bh-chead', h('b', {}, 'Accords'), h('small', {}, 'degré · nom · rôle')),
      ...spans.map((x) => {
        const c = x.info;
        const narrow = x.len / total < 0.07;
        return h(
          'div',
          { class: `bh-chord role-${c.role.id}${narrow ? ' narrow' : ''}`, style: `left:${pct(x.step)};--w:${pct(x.len)}`, title: `${c.name} · ${c.numeral} — ${c.role.text}` },
          h('small', {}, c.numeral),
          h('b', {}, c.name),
          narrow ? null : h('span', { class: 'bh-role' }, c.role.label)
        );
      }),
      spans.length ? null : h('span', { class: 'bh-empty' }, 'Pas de grille d’accords pour cette scène')
    );

    // tête d'une ligne : couleur, nom, Muet / Solo et volume (une seule commande pour toute la batterie)
    const laneHead = (ids, name, sub, color) =>
      head(
        'bh-ihead',
        h('i', { class: 'bh-swatch', style: `--c:${color}` }),
        h(
          'span',
          { class: 'bh-name' },
          h('b', { title: name }, name),
          sub ? h('small', { title: sub }, sub) : null,
          h('span', { class: 'bh-ctl' }, volCtl(ids, name))
        )
      );
    const melIds = new Set([T.col.id]);
    const shown = (c) => melIds.has(c.id) || !S.hide.has(c.id);

    // batterie : une ligne par élément (coups, sans hauteur)
    const drumCols = cols.filter((c) => c.o.type === 'drum');
    const drumIds = drumCols.map((c) => c.id);
    const drums = drumCols.length && drumCols.some(shown)
      ? row(
          'bh-drums' + (drumIds.every(silenced) ? ' muted' : ''),
          laneHead(drumIds, 'Batterie', drumCols.map((c) => c.o.name).join(' · '), drumCols[0].o.color),
          ...bands(),
          ...drumCols.flatMap((c, i) => {
            const d = sc.data[c.id];
            const steps = (d && d.steps) || [];
            const y = ((i + 0.5) / drumCols.length) * 100;
            return steps.map((v, k) => (v > 0 && k < total ? h('i', { class: 'bh-hit', style: `left:${pct(k)};top:${y.toFixed(1)}%;--c:${c.o.color};opacity:${(0.45 + 0.55 * v).toFixed(2)}` }) : null)).filter(Boolean);
          })
        )
      : null;
    if (drums) drums.style.setProperty('--rows', drumCols.length);

    // instruments : notes pleines (dans l'accord) ou en creux (notes de passage)
    const lanes = cols
      .filter((c) => c.o.type !== 'drum' && shown(c))
      .map((c) => {
        const d = sc.data[c.id];
        const events = (d && d.events) || [];
        const all = events.flatMap((e) => e.notes);
        let inCount = 0;
        const notes = [];
        if (all.length) {
          const lo = Math.min(...all);
          const hi = Math.max(...all);
          const span = Math.max(1, hi - lo);
          events.forEach((e) => {
            const chord = spanAt(e.step);
            e.notes.forEach((n) => {
              const inside = !chord || chord.info.pcs.includes(((n % 12) + 12) % 12);
              if (inside) inCount++;
              notes.push(
                h('i', {
                  class: 'bh-note' + (inside ? '' : ' out'),
                  style: `left:${pct(e.step)};width:max(2px, calc(${pct(Math.min(e.len, total - e.step))} - 1px));top:calc(6px + (100% - 12px - var(--nh)) * ${((hi - n) / span).toFixed(3)})`,
                })
              );
            });
          });
        }
        const fit = all.length ? `${Math.round((100 * inCount) / all.length)} % dans l’accord` : 'ne joue pas ici';
        const el = row(
          'bh-lane' + (all.length ? '' : ' empty') + (melIds.has(c.id) ? ' mel' : '') + (silenced(c.id) ? ' muted' : ''),
          laneHead([c.id], c.o.name, fit, c.o.color),
          ...bands(),
          ...notes
        );
        el.style.setProperty('--c', c.o.color);
        el.dataset.col = c.id;
        // hauteur d'une note : plus fine quand la tessiture est large
        const range = all.length ? Math.max(...all) - Math.min(...all) + 1 : 1;
        el.style.setProperty('--nh', `${Math.max(3, Math.min(9, Math.floor(76 / range)))}px`);
        return el;
      });

    const loop = h(
      'button',
      { type: 'button', class: 'btn btn-small bh-loop', 'aria-pressed': 'false', title: `Écouter « ${sc.name} » en boucle (re-clic : arrêt)`, onclick: () => listenScene(sc.id) },
      h('span', { class: 'bw-pico', html: PLAY + STOP }),
      h('span', {}, 'Écouter la scène')
    );
    const plays = res.song.reduce((a, b) => a + (b.scene === sc.id ? b.repeat : 0), 0);
    // accompagnement : replié sur une ligne (les pistes cochées dans le menu « Pistes » s'affichent dépliées)
    const accLanes = [drums, ...lanes.filter((x) => !x.classList.contains('mel'))].filter(Boolean);
    const accN = cols.filter((c) => !melIds.has(c.id) && c.o.type !== 'drum').length + (drumCols.length ? 1 : 0);
    const acc = accN
      ? h(
          'div',
          { class: 'bh-row bh-acc' },
          h(
            'button',
            { type: 'button', class: 'bh-acc-btn', id: 'bwAcc', 'aria-expanded': String(!!S.accOpen), onclick: () => ((S.accOpen = !S.accOpen), refreshMelFrame()) },
            `${S.accOpen ? '▾' : '▸'} Accompagnement · ${accN} piste${accN > 1 ? 's' : ''}`,
            h('small', {}, [drumCols.length ? 'batterie' : null, ...cols.filter((c) => !melIds.has(c.id) && c.o.type !== 'drum').map((c) => c.o.name.toLowerCase())].filter(Boolean).join(', '))
          ),
          S.accOpen ? tracksMenu(cols, melIds) : null
        )
      : null;
    const at = { 'data-scene': sc.id, 'data-bars': sc.bars, style: `--bars:${sc.bars}` };
    const board = h('div', { class: 'bh-board', ...at }, ruler, chords, ...lanes.filter((x) => x.classList.contains('mel')), h('i', { class: 'bh-ph', 'aria-hidden': 'true' }));
    const accBoard = accN || accLanes.length ? h('div', { class: 'bh-board bh-accboard', ...at }, acc, ...(S.accOpen || !melIds.size ? accLanes : []), h('i', { class: 'bh-ph', 'aria-hidden': 'true' })) : null;
    const own = !!(partOf(sc.sec, T) || {}).lead;
    return {
      sc,
      melIds,
      nav: sceneNav(res, sc, (x) => withAutoBadge(melSub(x, T), x, T), true),
      bar: trackbar(T),
      top: h('div', { class: 'bh-top', id: 'bwMelHead' }, h('h3', {}, sc.name), h('span', { class: 'bh-info' }, `${sc.bars} mesures` + (plays > 1 ? ` · jouée ${plays} fois` : '') + ` · ${SS.harmony.label(sc.key)}`), h('span', { class: 'spacer' }), melIds.size ? autoButton(sc, T) : null, loop),
      auto: h('div', { id: 'bwAuto', class: 'bwau-box' }, melIds.size ? autoCard(sc, T, { fit: true, copy: true, grid: true }) : null),
      board: h('div', { class: 'bh-scroll', id: 'bwMelBoard' }, board),
      src: melIds.size
        ? h(
            'div',
            { class: 'bw-melsrc' + (own ? ' own' : ''), id: 'bwMelSrc', 'data-own': String(own) },
            h('b', {}, own ? 'Mélodie générée' : 'Mélodie de l’inspiration'),
            h('small', {}, own ? `profil : ${melSub(sc, T)} · remplace celle de l’inspiration dans « ${sc.name} »` : '« Générer une mélodie » la remplace pour cette scène'),
            playBox(sc, T, 'verse'),
            own ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwMelBack', title: 'Revenir à la mélodie de l’inspiration pour cette scène', onclick: () => backToInspiration(sc.sec) }, '↺ Inspiration') : null
          )
        : h('p', { class: 'dlg-hint', id: 'bwMelSrc' }, 'Pas de mélodie à générer.'),
      acc: accBoard ? h('div', { class: 'bh-scroll bw-melacc', id: 'bwMelAcc' }, accBoard) : null,
    };
  }

  /** Ligne de la colonne des scènes : le profil de la mélodie générée, ou « inspiration ». */
  const melKey = (T, sec) => `${T.id}|${sec}`;
  function melSub(x, T = insAt()) {
    if (mutedIn(x.sec, T)) return 'muette';
    if (!(partOf(x.sec, T) || {}).lead) return typeChanged(T) ? 'mélodie du moteur' : 'inspiration';
    if (partOf(x.sec, T).lead.how) return partOf(x.sec, T).lead.how;
    const k = melKey(T, x.sec);
    const st = k === S.wiz.melSec ? SS.melodyPanel.getState() : S.wiz.melPanel[k];
    const r = st && st.res && st.res.ok ? st.res : null;
    return r && r.profile ? r.profile.name : 'sans profil';
  }

  /** Grille d'une scène pour le panneau : des accords bout à bout sur toute sa durée (un trou est tenu par l'accord d'avant). */
  function melGrid(sc) {
    const total = sc.bars * 16;
    const out = [];
    sceneSpans(sc)
      .filter((x) => x.step < total)
      .sort((a, b) => a.step - b.step)
      .forEach((x) => {
        const last = out[out.length - 1];
        const end = last ? last.step + last.len : 0;
        if (x.step < end) return;
        if (last) last.len += x.step - end;
        out.push({ step: last ? x.step : 0, len: last ? x.len : x.step + x.len, symbol: x.info.name });
      });
    if (out.length) out[out.length - 1].len = total - out[out.length - 1].step;
    return { spans: out, bars: sc.bars };
  }

  /** Un état du panneau par scène : on garde celui de la scène qu'on quitte, on rend celui de la scène choisie. */
  function syncMelState(sc, T) {
    const w = S.wiz;
    const k = melKey(T, sc.sec);
    if (w.melSec === k) return;
    if (w.melSec) w.melPanel[w.melSec] = SS.melodyPanel.getState();
    SS.melodyPanel.setState(w.melPanel[k] || null);
    w.melSec = k;
  }
  /** On quitte l'étape (ou l'assistant) : l'état du panneau est rangé, Harmonie repart d'un panneau neuf. */
  function leaveMel() {
    const w = S.wiz;
    if (!w || w.melSec == null) return;
    w.melPanel[w.melSec] = SS.melodyPanel.getState();
    w.melSec = null;
    SS.melodyPanel.setState(null);
    SS.melodyPanel.stop();
  }

  /** Le panneau a composé (ou effacé) une mélodie : elle devient celle de la scène dans la chanson, et on l'entend. */
  function melResult(sec, res, T) {
    if (!S.wiz || (res && !res.ok)) return;
    putPart(sec, T, { lead: res ? { events: SS.melody.toEvents(res).map(({ step, len, notes, vel }) => ({ step, len, notes, vel })) } : undefined });
    if (S.wiz.melMount) return void (S.wiz.melDirty = true); // pendant l'affichage : la page est redessinée ensuite
    afterLead(sec);
  }
  function afterLead(sec, listen = true) {
    wizSong();
    if (!melStep()) return;
    refreshMelFrame();
    if (!listen) return;
    const sc = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === sec);
    if (L.mode) relisten();
    else if (sc) playScene(sc.id);
    markListen();
  }
  /** « ↺ Inspiration » : la scène rejoue la mélodie de l'inspiration ; le panneau garde ses réglages, sans proposition. */
  function backToInspiration(sec) {
    const T = insAt();
    putPart(sec, T, { lead: undefined });
    SS.melodyPanel.setState({ ...SS.melodyPanel.getState(), res: null, resultSource: null, variant: null, variantN: 0 });
    S.wiz.melPanel[melKey(T, sec)] = SS.melodyPanel.getState();
    renderHarmony(T);
    relisten();
    if (!L.mode) playScene(S.wiz.hscene);
    markListen();
  }

  /** Redessine ce qui entoure le panneau (nav, grille, source, accompagnement) sans le remonter. */
  function refreshMelFrame() {
    const { cols, res } = wizSong();
    const box = $('#bandWiz');
    if (!res || !$('#bwMelBoard', box) || (S.wiz.mtab || 'mel') !== 'mel') return renderHarmony(insAt());
    const f = melScene(cols, res, curScene(res), insAt());
    $('.bh-scenes', box).replaceWith(f.nav);
    ['bar:#bwTrackbar', 'top:#bwMelHead', 'board:#bwMelBoard', 'auto:#bwAuto', 'src:#bwMelSrc', 'acc:#bwMelAcc'].forEach((x) => {
      const [k, q] = x.split(':');
      const old = $(q, box);
      if (old && f[k]) old.replaceWith(f[k]);
      else if (old) old.remove();
    });
    melGoLabel(f.sc.sec);
    syncMelScroll();
    markListen();
  }
  const melGoLabel = (sec) => {
    const go = $('#bwMelGo');
    if (go) go.textContent = (partOf(sec, insAt()) || {}).lead ? '🎲 Une autre' : 'Générer une mélodie';
  };

  /* ---------- Développer le motif / Section qui contraste (sous-onglets de l'étape Mélodie) ----------
   * SS.develop écrit, à partir d'un motif de 2 mesures de la mélodie de la scène, quatre suites pour finir la phrase,
   * ou trois mélodies pour une autre scène. Essai A/B (S.wiz.devAb = { tab, from, sec, key, label, why, how, events, on }) :
   * partsEff fait entendre B, « Garder B » écrit la mélodie de la scène (parts[sec].inst[T].lead). */
  const DV = () => SS.develop;
  const DV_PART = { motif: 'ton motif', suite: 'suite', contraste: 'contraste' };
  function sceneChordAt(sc) {
    const H = HM();
    const gch = gridOf(sc).map((x) => ({ step: x.step, len: x.len, c: chordOf(sc.key, x) }));
    return (st) => {
      const x = gch.find((y) => st >= y.step && st < y.step + y.len);
      return x ? H.voice(x.c, 60).map(H.pcOf) : null;
    };
  }
  const scalePcs = (k) => HM().scale(k).map((d) => d.pc);
  /** Notes de la mélodie T dans la scène (une par attaque, la plus haute), telles qu'elles jouent sans l'essai. */
  function devNotes(sc, T) {
    const dv = S.wiz.devAb;
    if (dv && dv.on && dv.sec === sc.sec && dv.base) return dv.base;
    return (((sc.data[T.col.id] || {}).events) || []).filter((e) => e.notes && e.notes.length).map((e) => ({ step: e.step, len: e.len, midi: Math.max(...e.notes), vel: e.vel ?? 0.8 }));
  }
  /** Petit rouleau : bandes d'accords, mesures, notes (classe par note). */
  function devRoll(sc, notes, { cls = () => '', mark = null, id = null, mini = false } = {}) {
    const total = sc.bars * 16;
    const pct = (x) => `${((100 * x) / total).toFixed(3)}%`;
    const ms = notes.map((x) => x.midi);
    const lo = Math.min(...ms, 60) - 1;
    const hi = Math.max(...ms, 72) + 1;
    const H = mini ? 44 : 96;
    const top = mini ? 4 : 26;
    return h(
      'div',
      { class: 'bwhz-roll bwdv-roll' + (mini ? ' mini' : ''), id },
      mark ? h('i', { class: 'bwdv-mark', style: `left:${pct(mark[0])};width:${pct(mark[1] - mark[0])}` }) : null,
      ...(mini ? [] : gridOf(sc).map((x) => h('div', { class: 'bwhz-band role-' + chordOf(sc.key, x).role.id, style: `left:${pct(x.step)};width:${pct(x.len)}` }, chordOf(sc.key, x).name))),
      ...Array.from({ length: sc.bars - 1 }, (_, b) => h('i', { class: 'bwhz-bl' + ((b + 1) % 2 ? ' odd' : ''), style: `left:${pct((b + 1) * 16)}` })),
      ...notes.map((x, i) => h('span', { class: 'bwhz-n bwdv-n ' + cls(x, i), style: `left:${pct(x.step)};width:calc(${pct(x.len)} - 1px);top:${(top + ((hi - x.midi) / Math.max(1, hi - lo)) * H).toFixed(1)}px` }))
    );
  }
  function startDev(tab, from, target, T, p, base) {
    S.wiz.devAb = { tab, from: from.sec, sec: target.sec, key: T.key, label: p.title, why: p.why, how: tab === 'dev' ? `motif développé · ${p.title.toLowerCase()}` : `contraste · ${p.title.toLowerCase()}`, events: p.events, base, id: p.id, on: true };
    wizSong();
    renderWiz();
    const now = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === target.sec);
    if (now && !(L.mode === 'scene' && L.sec === target.sec && !L.paused)) playScene(now.id);
  }
  function devAbBar(hint) {
    const t = S.wiz.devAb;
    if (!t) return h('p', { class: 'dlg-hint', id: 'bwDevHint' }, hint);
    const T = insSteps().find((x) => x.key === t.key);
    const flip = (on) => ((t.on = on), wizSong(), relisten(), renderWiz());
    const name = (S.wiz.res.scenes.find((x) => x.sec === t.sec) || {}).name || t.sec;
    return h(
      'div',
      { class: 'bwc-ab on', id: 'bwDevAb' },
      h('span', { class: 'bh-lbl' }, 'Essai'),
      h('b', {}, `${name} · ${t.label}`),
      h(
        'span',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Version à l’écoute' },
        h('button', { type: 'button', role: 'radio', id: 'bwDevA', class: t.on ? '' : 'active', 'aria-checked': String(!t.on), onclick: () => flip(false) }, 'A · avant'),
        h('button', { type: 'button', role: 'radio', id: 'bwDevB', class: t.on ? 'active' : '', 'aria-checked': String(t.on), onclick: () => flip(true) }, 'B · essai')
      ),
      h('span', { class: 'dlg-hint' }, `La scène « ${name} » tourne en boucle.`),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-small', id: 'bwDevCancel', onclick: () => ((S.wiz.devAb = null), wizSong(), relisten(), renderWiz()) }, 'Garder A'),
      h(
        'button',
        {
          type: 'button', class: 'btn btn-small btn-accent', id: 'bwDevKeep',
          onclick: () => {
            S.wiz.devAb = null;
            if (T) {
              putOff(t.sec, T, false);
              putPart(t.sec, T, { lead: { events: t.events.map((e) => ({ ...e, notes: [...e.notes] })), how: t.how } });
            }
            wizSong();
            relisten();
            renderWiz();
          },
        },
        'Garder B'
      )
    );
  }
  function devTab(sc, T, tab) {
    const notes = devNotes(sc, T);
    const pairs = DV().motifBars(notes, sc.bars);
    if (!pairs.length)
      return h('div', { class: 'bwhz-empty', id: 'bwDev' }, h('b', {}, 'Pas de motif dans cette scène.'), h('span', {}, 'Il faut au moins deux notes sur deux mesures : choisis une scène où la mélodie chante, ou génère-la dans l’onglet Mélodie.'));
    if (!S.wiz.dev || S.wiz.dev.sec !== sc.sec) S.wiz.dev = { sec: sc.sec, bar: pairs[0], form: 'aaba', target: null };
    const st = S.wiz.dev;
    if (!pairs.includes(st.bar)) st.bar = pairs[0];
    const t = S.wiz.devAb;
    const seg = (items, cur, set, label, id) =>
      h('span', { class: 'segmented', role: 'radiogroup', 'aria-label': label, id }, ...items.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'data-v': String(v), class: v === cur ? 'active' : '', 'aria-checked': String(v === cur), disabled: t ? true : null, onclick: () => set(v) }, l)));
    const motifPick = h('span', { class: 'bwhz-grp' }, h('span', { class: 'bh-lbl' }, 'Motif'), seg(pairs.map((b) => [b, `mesures ${b + 1}-${b + 2}`]), st.bar, (v) => ((st.bar = v), renderWiz()), 'Motif choisi', 'bwDevBar'));
    const mark = [st.bar * 16, st.bar * 16 + 32];
    const inMotif = (x) => x.step >= mark[0] && x.step < mark[1];
    const pcs = scalePcs(sc.key);
    if (tab === 'dev') {
      const props = DV().continuations(notes, { pcs, chordAt: sceneChordAt(sc), bars: sc.bars, bar: st.bar, form: st.form });
      const viewP = t ? props.find((p) => p.id === t.id) : null;
      const shown = viewP && t.on ? viewP.events.map((e) => ({ step: e.step, len: e.len, midi: e.notes[0] })) : notes;
      const phraseBars = sc.bars >= 8 ? 8 : Math.floor(sc.bars / 2) * 2;
      const head = h(
        'div',
        { class: 'bwhz-head' },
        motifPick,
        h('span', { class: 'spacer' }),
        sc.bars >= 8 ? h('span', { class: 'bwhz-grp' }, h('span', { class: 'bh-lbl' }, 'Phrase'), seg(DV().FORMS.map((f) => [f.id, f.label]), st.form, (v) => ((st.form = v), renderWiz()), 'Forme de la phrase', 'bwDevForm')) : null
      );
      const form = DV().FORMS.find((f) => f.id === st.form);
      const mel = h(
        'div',
        { class: 'bwhz-mel' },
        h('div', { class: 'bwhz-mhead' }, h('b', {}, `Ta phrase · ${sc.name}`), h('span', { class: 'bh-info' }, viewP && t.on ? `B : ${viewP.title.toLowerCase()} · motif en mesures 1-2` : `motif choisi : mesures ${st.bar + 1} et ${st.bar + 2} · l’assistant écrit la suite de la phrase de ${phraseBars} mesures` + (sc.bars > phraseBars ? `, répétée sur les ${sc.bars}` : ''))),
        devRoll(sc, shown, { id: 'bwDevRoll', mark: viewP && t.on ? [0, 32] : mark, cls: (x) => (viewP && t.on ? (x.step < 32 ? 'mot' : 'new') : inMotif(x) ? 'mot' : '') }),
        h('div', { class: 'bwhz-legend' }, h('span', {}, h('i', { class: 'bwhz-sw bwdv-sw mot' }), 'ton motif'), h('span', {}, h('i', { class: 'bwhz-sw bwdv-sw new' }), 'suite proposée (B)'), h('span', {}, h('i', { class: 'bwhz-sw' }), 'mélodie actuelle'), sc.bars >= 8 ? h('span', { class: 'bh-info' }, `forme : ${form.text}`) : null)
      );
      const cards = props.map((p) => {
        const trying = t && t.id === p.id;
        const ns = p.events.filter((e) => e.step < phraseBars * 16).map((e) => ({ step: e.step, len: e.len, midi: e.notes[0] }));
        return h(
          'div',
          { class: 'bwhz-card bwdv-card' + (trying ? ' trying on' : ''), 'data-dev': p.id },
          h('header', {}, h('b', {}, p.title), p.form ? h('small', {}, p.parts.map((x) => DV_PART[x]).join(' · ')) : null),
          devRoll({ ...sc, bars: phraseBars }, ns, { mini: true, cls: (x) => (x.step < 32 ? 'mot' : 'new') }),
          h('p', { class: 'bwdv-why' }, p.why),
          h('div', { class: 'bwhz-foot' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-small' + (trying ? ' btn-accent' : ''), 'data-devab': p.id, onclick: () => startDev('dev', sc, sc, T, p, notes) }, trying ? '▶ À l’essai' : '▶ Essai A/B'))
        );
      });
      return h('div', { class: 'bwhz bwdv', id: 'bwDev' }, head, mel, h('div', { class: 'bwhz-cards bwdv-cards' }, ...cards), devAbBar('Lance l’essai d’une suite : la scène tourne en boucle, tu passes de A (la mélodie actuelle) à B (le motif développé), puis tu gardes celle que tu préfères.'));
    }
    // Section qui contraste : une autre scène, écrite à partir du motif de celle-ci
    const others = S.wiz.res.scenes.filter((x) => x.sec !== sc.sec && x.bars >= 2);
    if (!others.length) return h('div', { class: 'bwhz-empty', id: 'bwDev' }, h('b', {}, 'Une seule scène dans la chanson.'), h('span', {}, 'Ajoute une scène à l’étape Scènes pour lui écrire une mélodie qui contraste.'));
    const target = others.find((x) => x.sec === st.target) || others.find((x) => /chorus|refrain/i.test(x.sec + x.name)) || others[0];
    st.target = target.sec;
    const props = DV().contrast(notes, { pcs, toPcs: scalePcs(target.key), chordAt: sceneChordAt(target), bars: target.bars, bar: st.bar });
    const viewP = t ? props.find((p) => p.id === t.id) : null;
    const tNotes = viewP && t.on ? viewP.events.map((e) => ({ step: e.step, len: e.len, midi: e.notes[0] })) : devNotes(target, T);
    const muted = mutedIn(target.sec, T);
    const head = h(
      'div',
      { class: 'bwhz-head' },
      motifPick,
      h('span', { class: 'spacer' }),
      h('span', { class: 'bwhz-grp' }, h('span', { class: 'bh-lbl' }, 'Scène à écrire'), seg(others.map((x) => [x.sec, x.name]), target.sec, (v) => ((st.target = v), renderWiz()), 'Scène à écrire', 'bwDevTarget'))
    );
    const src = h('div', { class: 'bwhz-mel' }, h('div', { class: 'bwhz-mhead' }, h('b', {}, `Ton motif · ${sc.name}`), h('span', { class: 'bh-info' }, `mesures ${st.bar + 1} et ${st.bar + 2}`)), devRoll(sc, notes, { mark, cls: (x) => (inMotif(x) ? 'mot' : '') }));
    const dst = h(
      'div',
      { class: 'bwhz-mel' },
      h('div', { class: 'bwhz-mhead' }, h('b', {}, `${target.name}`), h('span', { class: 'bh-info' }, viewP && t.on ? `B : ${viewP.title.toLowerCase()}` : muted ? 'la mélodie est muette dans cette scène : « Garder B » la fera chanter' : 'mélodie actuelle')),
      devRoll(target, tNotes, { id: 'bwDevRoll', cls: () => (viewP && t.on ? 'new' : '') })
    );
    const cards = props.map((p) => {
      const trying = t && t.id === p.id;
      return h(
        'div',
        { class: 'bwhz-card bwdv-card' + (trying ? ' trying on' : ''), 'data-dev': p.id },
        h('header', {}, h('b', {}, p.title)),
        devRoll(target, p.events.map((e) => ({ step: e.step, len: e.len, midi: e.notes[0] })), { mini: true, cls: () => 'new' }),
        h('p', { class: 'bwdv-why' }, p.why),
        h('div', { class: 'bwhz-foot' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-small' + (trying ? ' btn-accent' : ''), 'data-devab': p.id, onclick: () => startDev('con', sc, target, T, p, null) }, trying ? '▶ À l’essai' : '▶ Essai A/B'))
      );
    });
    return h('div', { class: 'bwhz bwdv', id: 'bwDev' }, head, src, dst, h('div', { class: 'bwhz-cards bwdv-cards' }, ...cards), devAbBar(`Lance l’essai d’une mélodie : « ${target.name} » tourne en boucle, tu passes de A (sa mélodie actuelle) à B (la proposition), puis tu gardes celle que tu préfères.`));
  }

  function renderHarmony(T = insAt()) {
    const { cols, res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const sc = curScene(res);
    const mtab = S.wiz.mtab || 'mel';
    if (S.wiz.devAb && (S.wiz.devAb.key !== T.key || S.wiz.devAb.tab !== mtab || S.wiz.devAb.from !== sc.sec)) {
      S.wiz.devAb = null; // un essai ne suit pas d'une scène ou d'un onglet à l'autre
      wizSong();
      relisten();
      return renderHarmony(T);
    }
    const MT = [['mel', 'Mélodie'], ['dev', 'Développer le motif'], ['con', 'Section qui contraste']];
    const tabs = h('div', { class: 'bwc-tabs', role: 'tablist', 'aria-label': 'Étape Mélodie' }, ...MT.map(([id, label]) => h('button', { type: 'button', role: 'tab', id: 'bwMTab-' + id, class: mtab === id ? 'on' : '', 'aria-selected': String(mtab === id), onclick: () => ((S.wiz.mtab = id), (S.wiz.devAb = null), wizSong(), renderWiz()) }, label)));
    if (mtab !== 'mel') {
      leaveMel();
      const f = melScene(cols, res, sc, T);
      splitView(f.nav, f.bar, h('main', { class: 'bh-main bw-mel' }, tabs, f.top, devTab(sc, T, mtab)));
      return;
    }
    syncMelState(sc, T);
    const f = melScene(cols, res, sc, T);
    const panel = h('div', { class: 'bw-melpanel', id: 'bwMelPanel' });
    splitView(f.nav, f.bar, h('main', { class: 'bh-main bw-mel' }, tabs, f.top, f.board, f.auto, f.src, f.melIds.size ? panel : null, f.acc));
    syncMelScroll();
    if (!f.melIds.size) return;
    const sec = sc.sec;
    const fresh = () => (S.wiz && S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === sec)) || sc;
    const go = h('button', { type: 'button', class: 'btn btn-accent', id: 'bwMelGo', onclick: () => SS.melodyPanel.compose(true) }, 'Générer une mélodie');
    const varB = h('button', { type: 'button', class: 'btn', id: 'bwMelVarB', disabled: true, onclick: () => SS.melodyPanel.variantB() }, 'Variante B');
    S.wiz.melMount = true;
    SS.melodyPanel.show({
      box: panel, leadOpts: melodyTrackOpts, preferSceneKey: true, sharedGrid: true, hideTrack: true, noListen: true, noScroll: true, timeSig: [4, 4],
      sceneKey: () => fresh().key,
      sceneEmotion: () => fresh().emotion || null,
      gridData: () => melGrid(fresh()),
      actions: h('div', { class: 'bw-melbtns' }, go, varB),
      buttons: { variant: varB },
      onResult: (r) => melResult(sec, r, T),
    });
    S.wiz.melMount = false;
    melGoLabel(sec);
    if (S.wiz.melDirty) {
      S.wiz.melDirty = false;
      afterLead(sec, false);
    }
  }

  /* ---------- Étape Accords : la grille de chaque scène, comme dans Harmonie ----------
   * La grille est celle d’Harmonie ({ step, len, degree, type, acc }, en pas de double-croche, degrés dans la tonalité
   * de la scène) : changer de tonalité garde les degrés. Tant qu'on n'y touche pas, c'est celle de l'inspiration.
   * Elle couvre toute la scène : un trou est tenu par l'accord d'avant (comme à l'écoute).
   */
  const HM = () => SS.harmony;
  const SNAPS = [['bar', 'à la mesure', 16], ['half', 'à la demi-mesure', 8], ['beat', 'au temps', 4]];
  const snapUnit = () => (SNAPS.find((x) => x[0] === S.wiz.snap) || SNAPS[2])[2];
  const GFAMS = [
    { id: 'repos', title: 'Repos', sub: 'on s’y pose' },
    { id: 'prep', title: 'Préparation', sub: 'on s’éloigne' },
    { id: 'color', title: 'Couleur du mode', sub: 'sa note caractéristique' },
    { id: 'tension', title: 'Tension', sub: 'appelle le retour' },
  ];
  let gridAdv = false; // palette : Simple ou Avancé (7, 9, sus…)

  /** Grille de l'inspiration pour une scène (accords du plan, lus dans la tonalité de la scène). */
  function specGrid(sc) {
    const sec = spec() && specEff().sections[sc.sec];
    if (!sec || (!sec.grid && !sec.chords)) return [];
    try {
      // reprise : les accords tapés ; sinon les degrés du plan (js/bandsong.js, sceneGrid : la grille que reçoit la scène créée)
      return BS().sceneGrid(sec.grid, sec.grid ? null : BS().spansOf(sec, sc.key, sc.bars), sc.key, sc.bars);
    } catch (e) {
      return [];
    }
  }
  function gridOf(sc) {
    const pv = S.wiz.insp && S.wiz.insp.preview;
    if (pv && pv.sec === sc.sec) return pv.grid; // la proposition qu'on écoute (fenêtre d'inspiration)
    const ab = abOn(sc.sec);
    if (ab) return ab.grid; // essai A/B : la version B à l'écoute
    return S.wiz.grids[sc.sec] || specGrid(sc);
  }
  /** Essai A/B en cours sur cette scène, version B à l'écoute (sinon null). */
  const abOn = (sec) => (S.wiz.ab && S.wiz.ab.sec === sec && S.wiz.ab.on && S.wiz.step === ST.chords ? S.wiz.ab : null);
  /** Pédales affichées : celles de l'essai B s'il est à l'écoute, sinon celles de la scène. */
  const pedsOf = (sec) => {
    const a = abOn(sec);
    return (a && (a.peds || (a.lead ? [] : null))) || S.wiz.peds[sec] || [];
  };
  const fillGrid = (list, total) => HM().gridFill(list, total); // js/harmony.js : commun avec la piste Accords et bandsong
  /** Modifie la grille de la scène (copie de celle de l'inspiration au premier changement). */
  function editGrid(sc, fn) {
    if (S.wiz.ab && S.wiz.ab.sec === sc.sec) S.wiz.ab = null; // on retouche la version A : l'essai s'arrête
    const g = gridOf(sc).map((c) => ({ ...c }));
    const keep = fn(g);
    const out = fillGrid(g, sc.bars * 16);
    S.wiz.grids[sc.sec] = out;
    if (keep) S.wiz.gsel = out.indexOf(out.find((c) => c.step === keep.step)) ;
    else if (S.wiz.gsel != null && !out[S.wiz.gsel]) S.wiz.gsel = null;
    renderWiz();
  }
  const gridPut = (g, chord) => HM().gridPut(g, chord);
  /** Durée d'un accord : plus long, il prend sur les suivants ; plus court, le suivant commence plus tôt. */
  function setChordLen(sc, i, len) {
    editGrid(sc, (g) => HM().gridSetLen(g, i, len, sc.bars * 16));
  }
  const chordOf = (key, c) => HM().gridChord(key, c.degree, c.type, c.acc || 0, c.bass || 0);
  /** Classe de hauteur d'une pédale ({ semi } : demi-tons au-dessus de la tonique de la scène, comme scene.grid.pedals). */
  const pedPc = (key, ped) => (HM().scale(key)[0].pc + ped.semi) % 12;
  /** Modifie les pédales de la scène ; fn rend la pédale à garder sélectionnée (ou rien). */
  function editPeds(sc, fn) {
    const l = (S.wiz.peds[sc.sec] || []).map((x) => ({ ...x }));
    const keep = fn(l);
    l.sort((a, b) => a.step - b.step);
    if (l.length) S.wiz.peds[sc.sec] = l;
    else delete S.wiz.peds[sc.sec];
    S.wiz.psel = keep && l.includes(keep) ? l.indexOf(keep) : null;
    S.wiz.gsel = null;
    renderWiz();
  }
  /** Fait entendre un accord sur la nappe (ou le clavier) du groupe. */
  function hearChord(c, elx) {
    const proj = listenProject();
    const pref = ['pad', 'keys', 'strings', 'guitar', 'arpchord'];
    const t = proj && (pref.map((r) => proj.tracks.find((x) => x.band && x.band.key.split(':')[0] === r)).find(Boolean) || proj.tracks.find((x) => x.type !== 'drum'));
    if (!t) return;
    SS.audio.preview(t, HM().voice(c, 60), 0.9);
    if (elx) {
      elx.classList.add('sounding');
      setTimeout(() => elx.classList.remove('sounding'), 450);
    }
  }
  /** Tonalité d'une scène : la nouvelle garde les degrés de la grille (comme dans Harmonie). */
  function setSceneKey(sc, k) {
    if (!S.wiz.grids[sc.sec]) S.wiz.grids[sc.sec] = specGrid(sc); // les accords gardent leurs degrés
    S.wiz.keys[sc.sec] = k;
    renderWiz();
  }

  /* ---------- Repris d'Harmonie : guide du mode, grilles de la tonalité, essais A/B ---------- */
  const AB_IDS = ['seventh', 'sus2', 'mode', 'avoid', 'pedal'];
  /** Une ligne : la note caractéristique du mode, ce qu'il faut faire entendre et une boucle d'essai (guide MusicEmotion). */
  function modeGuide(k) {
    const H = HM();
    const md = H.MODES.find((m) => m.id === k.mode) || {};
    const g = SS.MODE_GUIDE && SS.MODE_GUIDE[k.mode];
    const loop = g && SS.modeLoop(k.mode, k.tonic);
    const parts = [];
    if (md.color != null && md.colorText) parts.push(h('span', {}, 'Note caractéristique : ', h('b', {}, md.colorText)));
    else if (k.mode === 'major') parts.push(h('span', {}, 'La dominante attire vers la tonique.'));
    else if (k.mode === 'harmonic') parts.push(h('span', {}, 'La sensible tire vers la tonique : tension, drame.'));
    if (g) parts.push(h('span', {}, `À faire entendre : ${g.hear}.`), h('span', {}, g.tip));
    if (!parts.length) return null;
    return h(
      'div',
      { class: 'bwc-guide', id: 'bwGuide' },
      h('span', { class: 'bh-lbl' }, H.label(k)),
      ...parts,
      loop && loop.grid.length
        ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwModeLoop', title: 'Poser la boucle d’essai du mode sur la scène (↺ Inspiration pour revenir)', onclick: () => setGridFrom(curSceneOf(), loop.grid) }, `Boucle d’essai : ${loop.chords.map((c) => c.name).join(' – ')}`)
        : null
    );
  }
  const curSceneOf = () => curScene(wizSong().res);
  /** Remplace la grille de la scène par une suite d'accords répétée ({ degree, type, acc, bars? }), sans pédale. */
  function setGridFrom(sc, seq) {
    delete S.wiz.peds[sc.sec];
    S.wiz.psel = null;
    const g = fitProposal({ grid: seq }, sc.bars);
    editGrid(sc, (gg) => void gg.splice(0, gg.length, ...g));
  }
  /** Grilles de la tonalité (catalogue d'Harmonie, js/harmony.js PROGRESSIONS) : un accord par mesure. */
  function progSelect(sc, k) {
    const list = HM().progressions(k);
    if (!list.length) return null;
    return h(
      'select',
      {
        id: 'bwProg', class: 'bwc-prog', 'aria-label': 'Grilles de la tonalité', style: 'width:240px;flex:0 1 240px',
        onchange: (e) => {
          const pr = list[+e.target.value];
          if (pr) setGridFrom(sc, pr.seq.map(([degree, type, acc]) => ({ degree, type, acc: acc || 0 })));
        },
      },
      h('option', { value: '', selected: true }, 'Grilles de la tonalité…'),
      ...list.map((pr, i) => h('option', { value: i }, `${pr.chords.map((c) => c.name).join(' – ')} · ${pr.label}${pr.style ? ' · ' + pr.style : ''}`))
    );
  }
  /** Essai A/B : la même scène avec un seul changement (septièmes, sus2…), à comparer en boucle avant de le garder. */
  function startAb(sc, id) {
    const k = sc.key;
    const base = S.wiz.grids[sc.sec] || specGrid(sc);
    const r = HM().transformGrid(id, base, k, sc.bars * 16);
    const tr = HM().TRANSFORMS.find((x) => x.id === id);
    if (!r.changed) return app.toast(`« ${tr.label} » ne change rien ici (aucun accord concerné).`);
    S.wiz.ab = { sec: sc.sec, id, grid: r.grid, peds: r.pedals || null, on: true };
    S.wiz.gsel = null;
    S.wiz.psel = null;
    renderWiz();
    const now = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === sc.sec);
    if (now && !(L.mode === 'scene' && L.sec === sc.sec && !L.paused)) playScene(now.id);
  }
  function abBar(sc) {
    const ab = S.wiz.ab && S.wiz.ab.sec === sc.sec && S.wiz.ab;
    const H = HM();
    if (!ab)
      return h(
        'div',
        { class: 'bwc-ab', id: 'bwAb' },
        h('span', { class: 'bh-lbl' }, 'Essai A/B'),
        ...AB_IDS.map((id) => {
          const tr = H.TRANSFORMS.find((x) => x.id === id);
          return h('button', { type: 'button', class: 'chip', 'data-ab': id, title: tr.text, onclick: () => startAb(sc, id) }, tr.label);
        })
      );
    const tr = H.TRANSFORMS.find((x) => x.id === ab.id) || {};
    const flip = (on) => ((ab.on = on), renderWiz());
    return h(
      'div',
      { class: 'bwc-ab on', id: 'bwAb' },
      h('span', { class: 'bh-lbl' }, 'Essai'),
      h('b', {}, ab.label || tr.label),
      h(
        'span',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Version à l’écoute' },
        h('button', { type: 'button', role: 'radio', id: 'bwAbA', class: ab.on ? '' : 'active', 'aria-checked': String(!ab.on), onclick: () => flip(false) }, 'A · avant'),
        h('button', { type: 'button', role: 'radio', id: 'bwAbB', class: ab.on ? 'active' : '', 'aria-checked': String(ab.on), onclick: () => flip(true) }, 'B · essai')
      ),
      h('span', { class: 'dlg-hint' }, 'La scène tourne en boucle : passe de A à B pendant l’écoute.'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-small', id: 'bwAbCancel', onclick: () => ((S.wiz.ab = null), renderWiz()) }, 'Garder A'),
      h(
        'button',
        {
          type: 'button', class: 'btn btn-small btn-accent', id: 'bwAbKeep',
          onclick: () => {
            S.wiz.grids[sc.sec] = ab.grid;
            if (ab.peds) S.wiz.peds[sc.sec] = ab.peds;
            else if (ab.lead) delete S.wiz.peds[sc.sec]; // harmonisation : la nouvelle grille n'a pas de pédale
            // harmonisation : la mélodie reste celle qu'on a harmonisée (elle devient la mélodie imposée de la scène)
            const T = ab.lead && insSteps().find((x) => x.key === ab.lead.key);
            if (T && !(partOf(sc.sec, T) || {}).lead) putPart(sc.sec, T, { lead: { events: ab.lead.events } });
            S.wiz.ab = null;
            renderWiz();
          },
        },
        'Garder B'
      )
    );
  }

  /**
   * Vérifier (ex-onglet d'Harmonie) : la grille de la scène (centre, cadences, fin, emprunts) et la mélodie de chaque
   * instrument mélodique sur cette grille (notes exposées, tessiture, fin… : SS.melody.checkMelody).
   */
  const CK_ICON = { ok: '✓', warn: '!', tip: '•', info: 'i' };
  function checksBox(sc, g, forceOpen = false) {
    const H = HM();
    const k = sc.key;
    const gch = g.map((x) => ({ step: x.step, len: x.len, c: chordOf(k, x) }));
    const chordAt = (st) => {
      const x = gch.find((y) => st >= y.step && st < y.step + y.len);
      return x ? { pcs: H.voice(x.c, 60).map(H.pcOf), name: x.c.name } : null;
    };
    const list = (items) => h('ul', { class: 'hm-checks2' }, ...items.map((r) => h('li', { class: 'k-' + r.kind }, h('span', { class: 'ck' }, CK_ICON[r.kind] || '•'), h('div', {}, r.text, r.hint ? h('small', {}, r.hint) : null))));
    const mels = insSteps()
      .filter((T) => T.kind === 'melody' && !mutedIn(sc.sec, T))
      .map((T) => ({ T, r: SS.melody.checkMelody({ events: ((sc.data[T.col.id] || {}).events) || [], chordAt, key: k, spb: 16, beat: 4 }) }));
    const gridItems = H.gridChecks(k, gch);
    const warns = gridItems.concat(...mels.map((m) => m.r.items)).filter((i) => i.kind === 'warn').length;
    const open = forceOpen || !!S.wiz.ckOpen;
    return h(
      'details',
      { class: 'bwc-checks', id: 'bwChecks', open: open || null, ontoggle: (e) => (S.wiz.ckOpen = e.target.open) },
      h('summary', {}, h('b', {}, 'Vérifier la scène'), h('span', { class: 'hm-pill ' + (warns ? 'warn' : 'ok') }, warns ? `${warns} à vérifier` : 'rien à signaler')),
      h('div', { class: 'bwc-ck-cols' },
        h('div', { class: 'hm-vsec' }, h('h5', {}, 'Accords'), gridItems.length ? list(gridItems) : h('p', { class: 'hm-muted' }, 'Pas d’accords dans cette scène.')),
        ...(mels.length
          ? mels.map(({ T, r }) => h('div', { class: 'hm-vsec' }, h('h5', {}, `Mélodie · ${T.name}`, r.stats ? h('small', {}, ` ${r.stats.notes} notes`) : null), r.items.length ? list(r.items) : h('p', { class: 'hm-muted' }, 'Trop peu de notes pour juger.')))
          : [h('div', { class: 'hm-vsec' }, h('h5', {}, 'Mélodie'), h('p', { class: 'hm-muted' }, 'Pas de mélodie dans cette scène.'))])
      )
    );
  }

  /* ---------- Harmoniser la mélodie (sous-onglet de l'étape Accords) ----------
   * Trois grilles contrastées pour la mélodie de la scène (SS.harmony.harmonize), chacune expliquée, à écouter en essai A/B.
   * Pendant l'essai, la mélodie est figée (partsEff) ; « Garder B » écrit la grille et garde cette mélodie pour la scène. */
  const HZ_SLOTS = [[16, '1 par mesure'], [8, '2 par mesure'], [32, '1 toutes les 2 mesures']];
  const HZ_ROLES = { chord: 'note de l’accord', pass: 'passage', tension: 'tension (9e, quarte, 7e…)', clash: 'frottement à vérifier' };
  /** Instruments Mélodie qui chantent dans la scène, avec leurs notes ({ step, len, midi : la plus haute }). */
  function harmMelodies(sc) {
    return insSteps()
      .filter((T) => T.kind === 'melody' && !mutedIn(sc.sec, T))
      .map((T) => {
        const evs = (((sc.data[T.col.id] || {}).events) || []).filter((e) => e.notes && e.notes.length);
        return { T, evs, notes: evs.map((e) => ({ step: e.step, len: e.len, midi: Math.max(...e.notes) })) };
      })
      .filter((m) => m.notes.length >= 2);
  }
  /** Lance l'essai A/B d'une proposition : la mélodie est figée telle qu'elle joue maintenant. */
  function startHarm(sc, m, p, i) {
    const prev = S.wiz.ab && S.wiz.ab.sec === sc.sec && S.wiz.ab.lead;
    const lead = prev || { key: m.T.key, events: m.evs.map(({ step, len, notes, vel }) => ({ step, len, notes: [...notes], vel })), notes: m.notes };
    S.wiz.ab = { sec: sc.sec, id: 'harm', label: `${i + 1} · ${p.title}`, grid: p.grid.map((x) => ({ ...x })), peds: null, on: true, pi: i, lead };
    S.wiz.hz.view = i;
    S.wiz.gsel = null;
    S.wiz.psel = null;
    renderWiz();
    const now = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === sc.sec);
    if (now && !(L.mode === 'scene' && L.sec === sc.sec && !L.paused)) playScene(now.id);
  }
  function harmTab(sc) {
    const H = HM();
    const k = sc.key;
    const total = sc.bars * 16;
    const pct = (x) => `${((100 * x) / total).toFixed(3)}%`;
    const mels = harmMelodies(sc);
    const ab = S.wiz.ab && S.wiz.ab.sec === sc.sec && S.wiz.ab.lead ? S.wiz.ab : null;
    if (!mels.length && !ab)
      return h(
        'div',
        { class: 'bwhz-empty', id: 'bwHarm' },
        h('b', {}, 'Pas de mélodie dans cette scène.'),
        h('span', {}, 'Choisis une scène où la mélodie chante, ou écris-la dans l’onglet de l’instrument Mélodie : l’assistant proposera ensuite des accords pour elle.')
      );
    if (!S.wiz.hz || S.wiz.hz.sec !== sc.sec) S.wiz.hz = { sec: sc.sec, key: null, slot: 16, loop: true, view: 0 };
    const st = S.wiz.hz;
    const m = mels.find((x) => x.T.key === (ab ? ab.lead.key : st.key)) || mels[0];
    st.key = m ? m.T.key : ab.lead.key;
    const notes = ab ? ab.lead.notes : m.notes; // pendant l'essai : la mélodie figée
    const base = S.wiz.grids[sc.sec] || specGrid(sc);
    const sig = JSON.stringify([k, total, st.slot, st.loop, notes, base]);
    if (!st.memo || st.memo.sig !== sig) st.memo = { sig, props: H.harmonize(k, notes, total, { slot: st.slot, current: base, loop: st.loop ? 4 : 0 }) || [] };
    const props = st.memo.props;
    if (ab) st.view = ab.pi;
    const view = props[st.view] ? st.view : -1;
    // la mélodie sur la grille regardée (A : les accords de la scène ; 1, 2, 3 : une proposition)
    const vg = view >= 0 ? props[view].grid : base;
    const roles = H.noteRoles(k, vg, notes);
    const lo = Math.min(...notes.map((x) => x.midi)) - 1;
    const hi = Math.max(...notes.map((x) => x.midi)) + 1;
    const noteName = (midi) => H.french(H.spell(k, midi % 12)) + (Math.floor(midi / 12) - 1);
    const roll = h(
      'div',
      { class: 'bwhz-roll', id: 'bwHzRoll', 'data-phroll': '', 'data-scene': sc.id, 'data-bars': sc.bars },
      ...vg.map((x) => h('div', { class: 'bwhz-band role-' + chordOf(k, x).role.id, style: `left:${pct(x.step)};width:${pct(x.len)}` }, chordOf(k, x).name)),
      ...Array.from({ length: sc.bars - 1 }, (_, b) => h('i', { class: 'bwhz-bl', style: `left:${pct((b + 1) * 16)}` })),
      ...notes.map((x, i) =>
        h('span', {
          class: 'bwhz-n ' + roles[i],
          'data-s': x.step,
          'data-e': x.step + x.len,
          style: `left:${pct(x.step)};width:calc(${pct(x.len)} - 2px);top:${(26 + ((hi - x.midi) / Math.max(1, hi - lo)) * 96).toFixed(1)}px`,
          title: `${noteName(x.midi)} · ${HZ_ROLES[roles[i]]}`,
        })
      ),
      h('i', { class: 'bwhz-ph', hidden: true, 'aria-hidden': 'true' })
    );
    const seg = (items, cur, set, label) =>
      h('span', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, ...items.map(([v, l]) => h('button', { type: 'button', role: 'radio', class: v === cur ? 'active' : '', 'aria-checked': String(v === cur), onclick: () => set(v) }, l)));
    const head = h(
      'div',
      { class: 'bwhz-head' },
      h('span', { class: 'bwhz-grp' }, h('span', { class: 'bh-lbl' }, 'Mélodie'),
        mels.length > 1 && !ab ? seg(mels.map((x) => [x.T.key, x.T.name]), st.key, (v) => ((st.key = v), renderWiz()), 'Mélodie à harmoniser') : h('b', {}, (m || mels[0] || { T: { name: 'mélodie figée' } }).T.name)),
      h('span', { class: 'spacer' }),
      sc.bars >= 8 ? h('span', { class: 'bwhz-grp' }, h('span', { class: 'bh-lbl' }, 'Forme'), seg([[true, 'Boucle de 4 mesures'], [false, 'Toute la scène']], st.loop, (v) => ((st.loop = v), renderWiz()), 'Forme de la grille')) : null,
      h('span', { class: 'bwhz-grp' }, h('span', { class: 'bh-lbl' }, 'Accords'), seg(HZ_SLOTS, st.slot, (v) => ((st.slot = v), renderWiz()), 'Rythme des accords'))
    );
    const viewSeg = seg([[-1, 'Accords actuels'], ...props.map((p, i) => [i, `${i + 1} · ${p.title}`])], view, (v) => ((st.view = v), renderWiz()), 'Grille regardée');
    const legend = h('div', { class: 'bwhz-legend' }, ...Object.entries(HZ_ROLES).map(([id, l]) => h('span', {}, h('i', { class: 'bwhz-sw ' + id }), l)));
    const same = (a, b) => a.step === b.step && a.degree === b.degree && a.type === b.type && (a.acc || 0) === (b.acc || 0);
    const meter = (label, v) => h('span', { class: 'bwhz-meter' }, label, h('i', { style: `--v:${Math.round(v * 100)}%` }));
    const cards = props.map((p, i) => {
      const trying = ab && ab.pi === i;
      return h(
        'div',
        { class: 'bwhz-card' + (view === i ? ' on' : '') + (trying ? ' trying' : ''), 'data-hz': p.id, onclick: (e) => !e.target.closest('button') && !ab && ((st.view = i), renderWiz()) },
        h('header', {}, h('b', {}, `${i + 1} · ${p.title}`), h('small', {}, p.numerals)),
        h('div', { class: 'bwhz-chords' }, ...p.cycle.map((x) => {
          const c = chordOf(k, x);
          const chg = !base.some((y) => same(x, y));
          return h('span', { class: `bwhz-ch role-${c.role.id}${chg ? ' chg' : ''}`, title: `${c.name} · ${c.numeral} · ${c.role.label}${chg ? ' · nouveau' : ''}` }, c.name, h('small', {}, c.numeral));
        }), p.reps > 1 ? h('span', { class: 'bwhz-reps', title: 'La boucle est jouée sur toute la scène' }, `× ${p.reps}`) : null),
        h('ul', { class: 'bwhz-why' }, ...p.why.map((t) => h('li', {}, t))),
        h('div', { class: 'bwhz-foot' }, meter('Tension', p.tension), meter('Couleur', p.color), h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-small' + (trying ? ' btn-accent' : ''), 'data-hzab': i, onclick: () => startHarm(sc, m || { T: { key: ab.lead.key }, evs: ab.lead.events, notes }, p, i) }, trying ? '▶ À l’essai' : '▶ Essai A/B'))
      );
    });
    return h(
      'div',
      { class: 'bwhz', id: 'bwHarm' },
      head,
      h('div', { class: 'bwhz-mel' }, h('div', { class: 'bwhz-mhead' }, h('b', {}, `Mélodie · ${sc.name}`), h('span', { class: 'bh-info' }, 'chaque note colorée selon son rôle dans l’accord'), h('span', { class: 'spacer' }), viewSeg), roll, legend),
      props.length ? h('div', { class: 'bwhz-cards' }, ...cards) : h('p', { class: 'dlg-hint' }, 'Pas assez de notes pour proposer des accords.'),
      ab ? abBar(sc) : h('p', { class: 'dlg-hint', id: 'bwHzHint' }, 'Lance l’essai d’une proposition : la scène tourne en boucle, tu passes de A (tes accords) à B (la proposition), puis tu gardes celle que tu préfères. La mélodie ne change pas.')
    );
  }

  function renderChords() {
    const { res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const sc = curScene(res);
    if (S.wiz.ab && S.wiz.ab.sec !== sc.sec) S.wiz.ab = null; // un essai A/B ne suit pas d'une scène à l'autre
    const k = sc.key;
    const total = sc.bars * 16;
    const g = gridOf(sc);
    const own = !!S.wiz.grids[sc.sec] || !!S.wiz.peds[sc.sec] || !!S.wiz.keys[sc.sec] || !!S.wiz.emos[sc.sec];
    const pct = (x) => `${((100 * x) / total).toFixed(3)}%`;
    const H = HM();
    // en-tête de la grille : tonalité, aimant, effacer, revenir à l'inspiration, trouver l'inspiration
    const tonic = h('select', { id: 'bwTonic', 'aria-label': 'Tonique', onchange: (e) => setSceneKey(sc, { tonic: e.target.value, mode: k.mode }) }, ...H.TONICS.map((t) => h('option', { value: t, selected: t === k.tonic }, H.french(t))));
    const mode = h('select', { id: 'bwMode', 'aria-label': 'Mode', onchange: (e) => setSceneKey(sc, { tonic: k.tonic, mode: e.target.value }) }, ...H.MODES.map((m) => h('option', { value: m.id, selected: m.id === k.mode }, m.label)));
    const snap = h('select', { id: 'bwSnap', onchange: (e) => ((S.wiz.snap = e.target.value), renderWiz()) }, ...SNAPS.map(([v, l]) => h('option', { value: v, selected: S.wiz.snap === v }, l)));
    const emo = S.wiz.emos[sc.sec] && SS.findEmotion(S.wiz.emos[sc.sec]);
    const head = h(
      'div',
      { class: 'bw-top gr-head bwc-head' },
      h('h3', {}, sc.name),
      h('span', { class: 'bh-info' }, `${sc.bars} mesures en 4/4` + (emo ? ` · ${emo.label}` : '')),
      h('span', { class: 'spacer' }),
      h('label', { class: 'field' }, h('span', {}, 'Tonalité'), tonic, mode),
      h('label', { class: 'field' }, h('span', {}, 'Aimanter'), snap),
      progSelect(sc, k),
      h('button', { type: 'button', class: 'btn btn-small', id: 'bwGridClear', title: 'Un seul accord, la tonique, sur toute la scène', onclick: () => (delete S.wiz.peds[sc.sec], editGrid(sc, (gg) => void gg.splice(0, gg.length, { step: 0, len: total, degree: 0, type: H.gridPalette(k).simple[0].type, acc: 0 }))) }, 'Effacer'),
      own
        ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwGridBack', title: 'Revenir aux accords et à la tonalité de l’inspiration', onclick: () => (delete S.wiz.grids[sc.sec], delete S.wiz.peds[sc.sec], delete S.wiz.keys[sc.sec], delete S.wiz.emos[sc.sec], (S.wiz.gsel = null), (S.wiz.psel = null), renderWiz()) }, '↺ Inspiration')
        : null,
      h('button', { type: 'button', class: 'btn btn-accent', id: 'bwInspBtn', title: 'Choisir un mode et une émotion, écouter des propositions d’accords', onclick: () => openInsp(sc) }, '✦ Trouver l’inspiration')
    );
    // la grille : règle (mesures, temps), accords en blocs
    const ruler = [];
    const lines = [];
    for (let b = 0; b < sc.bars; b++) {
      ruler.push(h('span', { class: 'gr-bar', style: `left:${pct(b * 16)};width:${pct(16)}` }, String(b + 1)));
      for (let q = 4; q < 16; q += 4) ruler.push(h('i', { style: `left:${pct(b * 16 + q)}` }));
      if (b) lines.push(h('div', { class: 'gr-bl', style: `left:${pct(b * 16)}` }));
      for (let q = 4; q < 16; q += 4) lines.push(h('div', { class: 'gr-bt', style: `left:${pct(b * 16 + q)}` }));
    }
    const blocks = g.map((gc, i) => {
      const c = chordOf(k, gc);
      const beats = gc.len / 4;
      return h(
        'div',
        {
          class: `gr-blk role-${c.role.id}${c.borrowed ? ' borrowed' : ''}${gc.len / total < 0.07 ? ' narrow' : ''}${S.wiz.gsel === i ? ' sel' : ''}`,
          'data-gi': i, tabindex: 0, style: `left:calc(${pct(gc.step)} + 2px);width:calc(${pct(gc.len)} - 4px)`,
          title: `${c.name} · ${c.numeral} · ${beats} temps — clic : écouter et choisir · glisser : déplacer · bord droit : allonger · Suppr : enlever`,
        },
        h('b', {}, c.name),
        h('small', {}, `${c.numeral} · ${beats % 1 ? beats.toFixed(1) : beats} t.`),
        h('span', { class: 'gr-rz', title: 'Allonger ou raccourcir' })
      );
    });
    const lane = h('div', { class: 'gr-lane', id: 'bwLane' }, ...lines, ...blocks);
    // pédales : une note tenue à la basse sous plusieurs accords (comme sur la piste Accords du projet)
    const peds = pedsOf(sc.sec);
    const pedName = (x) => H.french(H.spell(k, pedPc(k, x)));
    const pedRow = peds.length
      ? h(
          'div',
          { class: 'bwc-peds', id: 'bwPeds' },
          ...peds.map((x, i) =>
            h('button', { type: 'button', class: 'bwc-ped' + (S.wiz.psel === i ? ' sel' : ''), 'data-pi': i, style: `left:calc(${pct(x.step)} + 2px);width:calc(${pct(x.len)} - 4px)`, title: `Pédale de ${pedName(x)} — clic : régler`, onclick: () => ((S.wiz.psel = i), (S.wiz.gsel = null), renderWiz()) }, `Pédale ${pedName(x)}`)
          )
        )
      : null;
    const tl = h('div', { class: 'gr-tl bw-gtl', 'data-scene': sc.id, 'data-bars': sc.bars, style: `min-width:${sc.bars * 56}px` }, h('div', { class: 'gr-ruler' }, ...ruler), lane, pedRow, h('div', { class: 'gr-ph', id: 'bwGridPh', hidden: true }));
    // accord sélectionné : durée en temps, écouter, enlever
    const sel = g[S.wiz.gsel];
    let selBar = h('p', { class: 'dlg-hint bwc-hint' }, 'Clic sur un accord : l’écouter et régler sa durée · glisser : le déplacer · tirer son bord droit : l’allonger (aimanté) · glisser un accord de la palette sur la grille pour le poser.');
    if (sel) {
      const c = chordOf(k, sel);
      const durs = [[4, '1 temps'], [8, '2'], [12, '3'], [16, '4 temps'], [32, '2 mesures']];
      selBar = h(
        'div',
        { class: 'bwc-sel role-' + c.role.id, id: 'bwChordSel' },
        h('span', { class: 'bh-lbl' }, 'Accord'),
        h('b', {}, c.name),
        h('span', { class: 'bwc-role' }, `${c.numeral} · ${c.role.label}`),
        h('span', { class: 'bh-info' }, `mes. ${Math.floor(sel.step / 16) + 1}, temps ${Math.floor((sel.step % 16) / 4) + 1}`),
        h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
        h('span', { class: 'bh-lbl' }, 'Durée'),
        h(
          'span',
          { class: 'segmented bwc-dur', role: 'radiogroup', 'aria-label': 'Durée de l’accord' },
          ...durs.map(([len, label]) =>
            h('button', { type: 'button', role: 'radio', 'data-len': len, class: sel.len === len ? 'active' : '', 'aria-checked': String(sel.len === len), disabled: sel.step + len > total, onclick: () => setChordLen(sc, S.wiz.gsel, len) }, label)
          )
        ),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => hearChord(c) }, '▶ Écouter'),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwPedAdd', title: 'Tenir la tonique à la basse sous cet accord (réglable ensuite : note, durée)', onclick: () => editPeds(sc, (l) => HM().gridPut(l, { step: sel.step, len: sel.len, semi: 0 })) }, 'Pédale'),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwChordDel', disabled: g.length < 2, onclick: () => editGrid(sc, (gg) => void gg.splice(S.wiz.gsel, 1)) }, 'Enlever')
      );
    }
    const ped = sel ? null : peds[S.wiz.psel];
    if (ped) {
      const tonicPc = pedPc(k, { semi: 0 });
      const under = g.filter((x) => x.step >= ped.step && x.step < ped.step + ped.len).map((x) => chordOf(k, x).name);
      const lens = [[16, '1 mesure'], [32, '2'], [64, '4'], [128, '8 mesures'], [total - ped.step, 'jusqu’à la fin']];
      const set = (patch) => editPeds(sc, (l) => HM().gridPut(l, Object.assign(l[S.wiz.psel], patch)));
      selBar = h(
        'div',
        { class: 'bwc-sel bwc-pedsel', id: 'bwPedSel' },
        h('span', { class: 'bh-lbl' }, 'Pédale'),
        h('b', {}, pedName(ped)),
        h('span', { class: 'bh-info' }, under.length ? `sous ${under.join(' – ')}` : 'aucun accord dessous'),
        h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
        h('label', { class: 'field' }, h('span', {}, 'Note'), h('select', { id: 'bwPedNote', onchange: (e) => set({ semi: (+e.target.value - tonicPc + 12) % 12 }) }, ...Array.from({ length: 12 }, (_, i) => (tonicPc + i) % 12).map((x) => h('option', { value: x, selected: x === pedPc(k, ped) }, H.french(H.spell(k, x)))))),
        h('span', { class: 'bh-lbl' }, 'Durée'),
        h(
          'span',
          { class: 'segmented bwc-dur', role: 'radiogroup', 'aria-label': 'Durée de la pédale' },
          ...lens.filter(([len], i, a) => len > 0 && a.findIndex(([l2]) => l2 === len) === i).map(([len, label]) => h('button', { type: 'button', role: 'radio', class: ped.len === len ? 'active' : '', 'aria-checked': String(ped.len === len), disabled: ped.step + len > total, onclick: () => set({ len }) }, label))
        ),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwPedDel', onclick: () => editPeds(sc, (l) => void l.splice(S.wiz.psel, 1)) }, 'Retirer la pédale')
      );
    }
    // palette : accords de la tonalité (Simple : par rôle ; Avancé : 7, 9, sus…)
    const P = H.gridPalette(k);
    const tok = (c, small) =>
      h('span', { class: `gr-tok role-${c.role.id}${c.borrowed ? ' borrowed' : ''}${small ? ' small' : ''}`, 'data-gd': c.degree, 'data-gt': c.type, 'data-ga': c.acc || 0, title: `${c.name} · ${c.numeral} · ${c.notes.join(' ')} — clic : écouter, glisser : poser` }, h('b', {}, c.numeral), small ? null : h('span', {}, c.name));
    let pal;
    if (!gridAdv) {
      pal = h(
        'div',
        { class: 'gr-fams' },
        ...GFAMS.map((f) => ({ ...f, list: P.simple.filter((c) => c.role.id === f.id) }))
          .filter((f) => f.list.length)
          .map((f) => h('div', { class: 'gr-fam role-' + f.id, style: `flex:${Math.max(2, f.list.length)}` }, h('h5', {}, f.title, h('small', {}, f.sub)), h('div', { class: 'gr-toks' }, ...f.list.map((c) => tok(c)))))
      );
    } else {
      let sep = false;
      pal = h(
        'div',
        { class: 'gr-adv', style: `grid-template-columns:minmax(120px,1.3fr) repeat(${P.cols.length},1fr)` },
        h('div', { class: 'gr-adv-h' }, 'Degré'),
        ...P.cols.map((c) => h('div', { class: 'gr-adv-h' }, c.label)),
        ...P.rows.flatMap((r) => [
          r.borrowed && !sep ? ((sep = true), h('div', { class: 'gr-adv-sep' }, 'Emprunts au mineur harmonique (sensible) : la vraie dominante, qui appelle la tonique')) : null,
          h('div', { class: 'gr-adv-deg' }, tok(r.chord, true), h('strong', {}, r.chord.name), r.borrowed ? h('em', {}, 'emprunt') : null),
          ...r.cells.map((c) => (c ? h('span', { class: `gr-chip role-${c.role.id}${c.borrowed ? ' borrowed' : ''}`, 'data-gd': c.degree, 'data-gt': c.type, 'data-ga': c.acc || 0, title: `${c.name} · ${c.numeral} — clic : écouter, glisser : poser` }, c.name) : h('span', { class: 'gr-no' }, '·'))),
        ])
      );
    }
    const palette = h(
      'section',
      { class: 'bwc-pal' },
      h(
        'div',
        { class: 'gr-head' },
        h('div', { class: 'hm-lbl' }, `Accords de ${H.label(k)}`, h('span', { class: 'gr-hint' }, 'clic : écouter · glisser : poser sur la grille')),
        h(
          'span',
          { class: 'segmented gr-mode', role: 'radiogroup', 'aria-label': 'Palette' },
          h('button', { type: 'button', id: 'bwPalSimple', class: gridAdv ? '' : 'active', 'aria-pressed': String(!gridAdv), onclick: () => ((gridAdv = false), renderWiz()) }, 'Simple'),
          h('button', { type: 'button', id: 'bwPalAdv', class: gridAdv ? 'active' : '', 'aria-pressed': String(gridAdv), onclick: () => ((gridAdv = true), renderWiz()) }, 'Avancé · 7, 9, sus…')
        )
      ),
      pal
    );
    // sous-onglets : la grille, l'harmonisation de la mélodie, la vérification
    const tab = S.wiz.ctab || 'grid';
    const CT = [['grid', 'Grille'], ['harm', 'Harmoniser la mélodie'], ['check', 'Vérifier']];
    const tabs = h('div', { class: 'bwc-tabs', role: 'tablist', 'aria-label': 'Étape Accords' }, ...CT.map(([id, label]) => h('button', { type: 'button', role: 'tab', id: 'bwTab-' + id, class: tab === id ? 'on' : '', 'aria-selected': String(tab === id), onclick: () => ((S.wiz.ctab = id), renderWiz()) }, label)));
    const body = tab === 'harm' ? [harmTab(sc)] : tab === 'check' ? [checksBox(sc, g, true)] : [head, modeGuide(k), abBar(sc), h('div', { class: 'gr-scroll' }, tl), selBar, palette];
    const content = h('div', { class: 'bwc', id: 'bwChords' }, tabs, ...body);
    content.addEventListener('pointerdown', (e) => gridDown(e, sc));
    content.addEventListener('keydown', (e) => {
      const blk = e.target.closest && e.target.closest('.gr-blk');
      if (!blk || !['Delete', 'Backspace'].includes(e.key) || gridOf(sc).length < 2) return;
      e.preventDefault();
      editGrid(sc, (gg) => void gg.splice(+blk.dataset.gi, 1));
    });
    const keep = $('.bwc', box);
    const top = keep ? keep.scrollTop : 0;
    splitView(sceneNav(res, sc, (x) => (S.wiz.emos[x.sec] ? SS.findEmotion(S.wiz.emos[x.sec]).label : S.wiz.grids[x.sec] ? 'accords modifiés' : null)), trackbar('chords'), content);
    content.scrollTop = top;
  }

  /** Gestes sur la grille : clic (écouter, choisir), glisser (déplacer, poser depuis la palette), bord droit (durée). */
  function gridDown(e, sc) {
    if (e.button !== 0) return;
    const rz = e.target.closest('.gr-rz');
    const blk = e.target.closest('.gr-blk');
    const src = !blk && e.target.closest('[data-gd]');
    if (!rz && !blk && !src) return;
    e.preventDefault();
    const k = sc.key;
    const g = gridOf(sc);
    const total = sc.bars * 16;
    const unit = snapUnit();
    const lane = $('#bwLane');
    const stepAt = (x) => {
      const r = lane.getBoundingClientRect();
      return Math.max(0, Math.min(total - 1, Math.floor(((x - r.left) / r.width) * total)));
    };
    if (rz) {
      const i = +blk.dataset.gi;
      const gc = g[i];
      let len = gc.len;
      const move = (ev) => {
        const end = Math.min(total, Math.max(gc.step + unit, Math.round((stepAt(ev.clientX) + 1) / unit) * unit));
        len = end - gc.step;
        blk.style.width = `calc(${(len / total) * 100}% - 4px)`;
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        S.wiz.gsel = i;
        if (len !== gc.len) setChordLen(sc, i, len);
        else renderWiz();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      return;
    }
    const mi = blk ? +blk.dataset.gi : -1;
    const moving = blk ? g[mi] : null;
    const chord = moving ? { degree: moving.degree, type: moving.type, acc: moving.acc || 0, ...(moving.bass ? { bass: moving.bass } : {}) } : { degree: +src.dataset.gd, type: src.dataset.gt, acc: +src.dataset.ga };
    const len = moving ? moving.len : unit;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const elx = blk || src;
    let started = false;
    let target = null;
    const fly = h('div', { class: 'gr-fly' }, chordOf(k, chord).name);
    const ghost = h('div', { class: 'gr-ghost' });
    const inside = (x, y) => {
      const r = $('.bw-gtl').getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom + 24;
    };
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        started = true;
        el.append(fly);
        elx.classList.add('dragging');
      }
      fly.style.left = ev.clientX + 'px';
      fly.style.top = ev.clientY + 'px';
      if (inside(ev.clientX, ev.clientY)) {
        target = Math.floor(stepAt(ev.clientX) / unit) * unit;
        ghost.style.left = `calc(${(target / total) * 100}% + 2px)`;
        ghost.style.width = `calc(${(Math.min(len, total - target) / total) * 100}% - 4px)`;
        if (!ghost.parentNode) lane.append(ghost);
      } else {
        target = null;
        ghost.remove();
      }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      fly.remove();
      ghost.remove();
      elx.classList.remove('dragging');
      if (!started) {
        hearChord(chordOf(k, chord), elx);
        if (blk) {
          S.wiz.gsel = mi;
          S.wiz.psel = null;
          renderWiz();
          const b = $(`#bwLane .gr-blk[data-gi="${mi}"]`);
          if (b) b.focus();
        }
        return;
      }
      if (target === null) return;
      editGrid(sc, (gg) => {
        if (moving) gg.splice(mi, 1);
        return gridPut(gg, { step: target, len: Math.min(len, total - target), ...chord });
      });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  /* ---------- Fenêtre « Trouver l'inspiration » ----------
   * Mode → émotion → propositions (les trois pistes de l'émotion, puis ses grilles de référence), transposées sur
   * la tonique de la scène. Une proposition choisie remplace la scène à l'écoute (lecture en boucle, au tempo du
   * bandeau) ; « Choisir » la pose dans la grille, avec sa tonalité et l'émotion ; Annuler laisse la scène intacte.
   */
  function openInsp(sc) {
    const md = SS.MODE_MOODS.find((m) => m.mode === sc.key.mode) || SS.MODE_MOODS.find((m) => m.mode === (HM().MODES.find((x) => x.id === sc.key.mode) || {}).fam) || SS.MODE_MOODS[4];
    const cur = S.wiz.emos[sc.sec] || sc.emotion;
    const emo = cur && md.emotions.includes(cur) ? cur : SS.emotionMode(cur) ? cur : md.emotions[0];
    S.wiz.insp = { sec: sc.sec, mode: (SS.emotionMode(emo) || md).mode, emo, refs: false, pick: -1, preview: null, tonic: sc.key.tonic, bars: sc.bars, keepTempo: false };
    renderWiz();
  }
  function closeInsp() {
    S.wiz.insp = null;
    renderWiz();
  }
  /** Propositions d'une émotion sur la tonique `tonic` : { kind, key, chords, grid (1 accord par mesure, ou les mesures de la grille), why, tempo }. */
  function inspOptions(emoId, tonic) {
    const H = HM();
    const emo = SS.findEmotion(emoId);
    const props = emo.proposals.map((pr) => {
      const k = { tonic, mode: pr.mode };
      const chords = pr.seq.map(([d, t, a]) => H.makeChord(k, d, t, a || 0));
      const grid = chords.map((c) => H.toGridChord(k, c, c.degree)).filter(Boolean);
      return { kind: pr.kind, label: SS.EMOTION_KINDS[pr.kind], key: k, chords, grid, tempo: pr.tempo || null, why: SS.fillEmotionText(pr.why, chords, k.tonic, H.french) };
    });
    const refs = SS.libraryFor(emoId).map((e) => {
      const { key: k, grid, chords } = SS.libraryGrid(e, tonic);
      const src = SS.EMOTION_SOURCES && SS.EMOTION_SOURCES[e.src];
      const why = src ? `Source : ${src.name}${e.n ? `, fiche ${e.n}` : ''}${e.mood ? ` · ${e.stated ? 'émotion annoncée' : 'interprétation'} : ${e.mood}` : ''}` : '';
      return { kind: 'ref', label: e.label, key: k, chords, grid, tempo: e.tempo || null, why };
    });
    return { props, refs };
  }
  /** Une proposition répétée sur toute la scène (un accord par mesure, ou les mesures de la grille de référence). */
  function fitProposal(pr, bars) {
    const total = bars * 16;
    const out = [];
    for (let at = 0, i = 0; at < total && pr.grid.length; i++) {
      const { bars: b = 1, ...c } = pr.grid[i % pr.grid.length];
      const len = Math.max(4, Math.round(b * 16));
      out.push({ step: at, len: Math.min(len, total - at), degree: c.degree, type: c.type, acc: c.acc || 0, ...(c.bass ? { bass: c.bass } : {}) });
      at += len;
    }
    return out;
  }
  function inspList() {
    const w = S.wiz.insp;
    const o = inspOptions(w.emo, w.tonic);
    return w.refs ? o.refs : o.props;
  }
  function pickInsp(i) {
    const w = S.wiz.insp;
    const pr = inspList()[i];
    if (!pr) return;
    w.pick = i;
    w.preview = { sec: w.sec, key: pr.key, grid: fitProposal(pr, w.bars), emo: w.emo };
    w.tempo = pr.tempo;
    renderWiz();
    const sc = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === w.sec);
    if (sc && !(L.mode === 'scene' && L.sec === w.sec && !L.paused)) playScene(sc.id);
  }
  function chooseInsp() {
    const w = S.wiz.insp;
    if (!w || !w.preview) return;
    const pv = w.preview;
    S.wiz.grids[pv.sec] = pv.grid;
    delete S.wiz.peds[pv.sec]; // les pédales allaient avec les anciens accords
    S.wiz.keys[pv.sec] = pv.key;
    S.wiz.emos[pv.sec] = pv.emo;
    S.wiz.gsel = null;
    S.wiz.insp = null;
    if (w.keepTempo && w.tempo) setTempo(w.tempo);
    else renderWiz();
  }

  function renderInsp() {
    let box = $('#bwInsp');
    const w = S.wiz && S.wiz.step === ST.chords && S.wiz.insp;
    if (!w) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = h('div', { class: 'bw-insp', id: 'bwInsp' });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeInsp();
        }
      });
      el.querySelector('.band-shell').append(box);
    }
    const res = S.wiz.res;
    const sc = res && res.scenes.find((x) => x.sec === w.sec);
    if (!sc) return closeInsp();
    const H = HM();
    const m = SS.MODE_MOODS.find((x) => x.mode === w.mode) || SS.MODE_MOODS[0];
    const o = inspOptions(w.emo, w.tonic);
    const list = w.refs ? o.refs : o.props;
    const pr = list[w.pick];
    const playing = L.mode === 'scene' && L.sec === w.sec && !L.paused;
    const card = (x, i) =>
      h(
        'div',
        {
          class: 'hm-ex pick' + (x.kind === 'ref' ? ' ref' : '') + (i === w.pick ? ' on' : ''), role: 'radio', tabindex: 0, 'aria-checked': String(i === w.pick), 'data-pick': i,
          onclick: () => pickInsp(i),
          onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickInsp(i)),
        },
        h(
          'div',
          { class: 'hm-ex-top' },
          h('span', { class: `emo-kind k-${x.kind}` }, x.kind === 'ref' ? 'Référence' : x.label),
          x.kind === 'ref' ? h('b', { class: 'hm-ref-l' }, x.label) : null,
          h('span', { class: 'hm-ex-meta' }, H.label(x.key) + (x.tempo ? ` · ${x.tempo} BPM` : '')),
          h('span', { class: 'hm-ex-btns' }, h('span', { class: 'bwi-state' }, i === w.pick ? (playing ? '♪ en écoute' : 'choisie') : '▶ écouter'))
        ),
        h('div', { class: 'hm-progchords' }, ...x.chords.map((c) => h('span', { class: `hm-step role-${c.role.id}${c.borrowed ? ' borrowed' : ''}`, title: c.notes.join('–') }, h('b', {}, c.numeral), c.name))),
        x.why ? h('p', { class: 'hm-why' }, x.why) : null
      );
    const card0 = h(
      'div',
      { class: 'bwi-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bwiTitle' },
      h(
        'header',
        { class: 'bwi-head' },
        h('h3', { id: 'bwiTitle' }, '✦ Trouver l’inspiration'),
        h('span', { class: 'bh-info' }, `pour « ${sc.name} » · ${sc.bars} mesures`),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-icon', id: 'bwiClose', 'aria-label': 'Fermer sans rien changer', title: 'Fermer sans rien changer', onclick: closeInsp, html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' })
      ),
      h(
        'div',
        { class: 'bwi-bar' },
        h('button', { type: 'button', class: 'btn bt-btn bt-play' + (playing ? ' on' : ''), id: 'bwiPlay', title: playing ? 'Pause' : 'Écouter la scène en boucle', 'aria-label': playing ? 'Pause' : 'Écouter la scène en boucle', html: playing ? PAUSE : PLAY, onclick: () => {
            const here = L.mode === 'scene' && L.sec === w.sec;
            if (here && !L.paused) {
              SS.audio.pause();
              L.paused = true;
            } else if (here && L.paused) {
              L.paused = false;
              SS.audio.resume();
            } else playScene(sc.id);
            renderWiz();
          } }),
        h('button', { type: 'button', class: 'btn bt-btn bt-stop', id: 'bwiStop', title: 'Stop', 'aria-label': 'Stop', html: STOP, disabled: !L.mode, onclick: () => (stopListen(), renderWiz()) }),
        h('span', { class: 'bh-info' }, pr ? `Écoute : ${pr.chords.map((c) => c.name).join(' – ')}` : 'Choisis une proposition pour l’écouter dans la scène'),
        h('span', { class: 'bt-sep', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'bt-field' },
          h('span', { class: 'bt-label' }, 'Tempo'),
          h(
            'span',
            { class: 'bt-tempo' },
            h('button', { type: 'button', 'aria-label': 'Ralentir', onclick: () => setTempo(tempo() - 1) }, '−'),
            h('input', { type: 'number', id: 'bwiTempo', min: TEMPO_MIN, max: TEMPO_MAX, value: tempo(), 'aria-label': 'Tempo en BPM', onchange: (e) => setTempo(e.target.value) }),
            h('button', { type: 'button', 'aria-label': 'Accélérer', onclick: () => setTempo(tempo() + 1) }, '+')
          ),
          h('span', { class: 'bt-unit' }, 'BPM')
        ),
        pr && pr.tempo && pr.tempo !== tempo() ? h('button', { type: 'button', class: 'bt-orig', id: 'bwiTempoAdv', title: 'Prendre le tempo conseillé pour cette émotion', onclick: () => setTempo(pr.tempo) }, `conseillé ${pr.tempo}`) : null
      ),
      h(
        'div',
        { class: 'bwi-body' },
        h(
          'div',
          { class: 'bwi-row' },
          h('span', { class: 'bh-lbl' }, 'Mode'),
          ...SS.MODE_MOODS.map((x) =>
            h('button', { type: 'button', class: 'chip' + (x.mode === w.mode ? ' active' : ''), 'data-mode': x.mode, 'aria-pressed': String(x.mode === w.mode), title: x.mood, onclick: () => ((w.mode = x.mode), (w.emo = x.emotions[0]), (w.pick = -1), (w.preview = null), renderWiz()) }, x.name.replace(/ \(.*\)/, ''), h('small', {}, x.mood))
          )
        ),
        h(
          'div',
          { class: 'bwi-row' },
          h('span', { class: 'bh-lbl' }, 'Émotion'),
          ...m.emotions.map((id) =>
            h('button', { type: 'button', class: 'chip emo-chip' + (id === w.emo ? ' active' : ''), 'data-emo': id, 'aria-pressed': String(id === w.emo), onclick: () => ((w.emo = id), (w.pick = -1), (w.preview = null), renderWiz()) }, SS.findEmotion(id).label, h('small', {}, String(SS.libraryFor(id).length + 3)))
          )
        ),
        h(
          'div',
          { class: 'bwi-row' },
          h('span', { class: 'bh-lbl' }, 'Propositions'),
          h(
            'span',
            { class: 'segmented', role: 'radiogroup', 'aria-label': 'Propositions' },
            h('button', { type: 'button', id: 'bwiProps', class: w.refs ? '' : 'active', onclick: () => ((w.refs = false), (w.pick = -1), (w.preview = null), renderWiz()) }, '3 pistes'),
            h('button', { type: 'button', id: 'bwiRefs', class: w.refs ? 'active' : '', disabled: !o.refs.length, onclick: () => ((w.refs = true), (w.pick = -1), (w.preview = null), renderWiz()) }, `Grilles de référence · ${o.refs.length}`)
          ),
          h('span', { class: 'dlg-hint' }, 'Clic sur une proposition : elle remplace la scène à l’écoute.')
        ),
        h('div', { class: 'bwi-props', role: 'radiogroup', 'aria-label': 'Propositions d’accords' }, ...list.map(card))
      ),
      h(
        'footer',
        { class: 'bwi-foot' },
        h('label', { class: 'emo-opt' }, h('input', { type: 'checkbox', id: 'bwiKeep', checked: w.keepTempo, onchange: (e) => (w.keepTempo = e.target.checked) }), ' Garder le tempo conseillé'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn', id: 'bwiCancel', onclick: closeInsp }, 'Annuler'),
        h('button', { type: 'button', class: 'btn btn-accent', id: 'bwiChoose', disabled: !pr, onclick: chooseInsp }, pr ? `Choisir : ${pr.chords.map((c) => c.name).join(' – ')}` : 'Choisir')
      )
    );
    const scroll = $('.bwi-body', box);
    const top = scroll ? scroll.scrollTop : 0;
    const focus = document.activeElement && box.contains(document.activeElement) ? document.activeElement.id || document.activeElement.dataset.pick : null;
    box.replaceChildren(card0);
    $('.bwi-body', box).scrollTop = top;
    const f = focus && ($('#' + CSS.escape(focus), box) || $(`[data-pick="${focus}"]`, box));
    (f || $('#bwiClose', box)).focus();
  }

  /** Menu « Pistes » : une case par piste (la batterie en une seule) ; la mélodie reste affichée. */
  function tracksMenu(cols, melIds) {
    const entries = [];
    const drums = cols.filter((c) => c.o.type === 'drum');
    cols.forEach((c) => {
      if (c.o.type === 'drum') {
        if (c === drums[0]) entries.push({ ids: drums.map((d) => d.id), name: 'Batterie', color: c.o.color });
      } else entries.push({ ids: [c.id], name: c.o.name, color: c.o.color, mel: melIds.has(c.id) });
    });
    const shownN = entries.filter((e) => e.mel || !e.ids.every((id) => S.hide.has(id))).length;
    const redraw = () => {
      S.tracksOpen = true;
      refreshMelFrame();
    };
    const box = h(
      'details',
      { class: 'bh-tracks', id: 'bwTracks' },
      h('summary', { class: 'btn btn-small', title: 'Choisir les pistes d’accompagnement affichées (la mélodie reste affichée)' }, `Pistes · ${shownN} / ${entries.length}`),
      h(
        'div',
        { class: 'bh-tpop', id: 'bwTracksPop' },
        ...entries.map((e) => {
          const cb = h('input', { type: 'checkbox', 'data-ids': e.ids.join(' '), disabled: !!e.mel });
          cb.checked = e.mel || !e.ids.every((id) => S.hide.has(id));
          cb.addEventListener('change', () => {
            e.ids.forEach((id) => (cb.checked ? S.hide.delete(id) : S.hide.add(id)));
            redraw();
          });
          return h('label', { class: e.mel ? 'mel' : '' }, cb, h('i', { style: `--c:${e.color}` }), h('span', {}, e.name), e.mel ? h('small', {}, 'mélodie') : null);
        }),
        h(
          'div',
          { class: 'bh-tbtns' },
          h('button', { type: 'button', class: 'btn btn-small', id: 'bwTracksAll', onclick: () => (S.hide.clear(), redraw()) }, 'Tout'),
          h('button', { type: 'button', class: 'btn btn-small', id: 'bwTracksMel', onclick: () => (cols.forEach((c) => !melIds.has(c.id) && S.hide.add(c.id)), redraw()) }, 'Aucune')
        )
      )
    );
    box.open = !!S.tracksOpen;
    box.addEventListener('toggle', () => (S.tracksOpen = box.open));
    return box;
  }

  /* ---------- Barre de piste (étapes Batterie à Mélodie) ----------
   * Le son et le kit se choisissent à l'étape Instruments (pas de menu « Piste » ici) ;
   * « On entend » : une pastille par instrument (Muet), et « Seule » (Solo de l'instrument de l'étape). Même S.wiz.mute / S.wiz.solo
   * que l'écoute : la boucle se tait vraiment, et le réglage vaut pour toutes les étapes.
   */
  /** Seule : le musicien de l'étape en solo ; re-clic : plus de solo. */
  function soloOnly(ids) {
    const same = S.wiz.solo.size === ids.length && ids.every((id) => S.wiz.solo.has(id));
    S.wiz.solo.clear();
    if (!same) ids.forEach((id) => S.wiz.solo.add(id));
    afterMS();
  }
  /** La barre : On entend (une pastille par instrument) et Seule. `T` : l'instrument, ou « chords ». */
  function trackbar(T) {
    const chips = insSteps().map((t) => {
      const ids = t.cols.map((c) => c.id);
      const heard = ids.some((id) => !silenced(id));
      const label = t.name;
      return h(
        'button',
        {
          type: 'button',
          class: 'tb-chip' + (heard ? ' on' : '') + (isT(T) && t.id === T.id ? ' cur' : ''),
          style: `--c:${KIND_COLOR[t.kind]}`,
          'data-ins': t.id,
          'data-mu': t.musician,
          'aria-pressed': String(heard),
          title: heard ? `${label} s’entend : clic pour le couper` : `${label} est coupé : clic pour le réentendre`,
          // en solo, la pastille ajoute ou retire l'instrument du solo ; sinon elle coupe (Muet)
          onclick: () => toggleMS(S.wiz.solo.size ? S.wiz.solo : S.wiz.mute, ids),
        },
        h('i', {}),
        label
      );
    });
    const ids = isT(T) ? T.cols.map((c) => c.id) : [];
    const solo = ids.length > 0 && S.wiz.solo.size === ids.length && ids.every((id) => S.wiz.solo.has(id));
    return h(
      'div',
      { class: 'bw-trackbar', id: 'bwTrackbar', style: `--c:${isT(T) ? KIND_COLOR[T.kind] : 'var(--accent-2)'}` },
      h(
        'div',
        { class: 'tb-grp tb-listen' },
        h('span', { class: 'tb-lbl' }, 'On entend'),
        ...chips,
        ids.length
          ? h('button', { type: 'button', class: 'btn btn-small tb-solo' + (solo ? ' on' : ''), id: 'bwTbSolo', 'aria-pressed': String(solo), title: solo ? 'Revenir à tout le groupe' : `N’écouter que ${T.name}`, onclick: () => soloOnly(ids) }, 'Seule')
          : null
      )
    );
  }

  /* ---------- Aperçu en rouleau (Basse, Nappes, Arpèges) ----------
   * Les notes de la scène choisie, telles que la chanson les joue (wizSong().res), sous la bande des accords (couleur = fonction),
   * avec les barres de mesure ; la tête de lecture suit la boucle (markListen). Dessiné au rendu seulement.
   */
  const BLACK_PC = [1, 3, 6, 8, 10];
  function rollBox(sc, T) {
    const kind = T.kind;
    const mine = [T.col];
    const total = sc.bars * 16;
    const spans = sceneSpans(sc);
    const events = mine.flatMap((c) => ((sc.data[c.id] || {}).events || []).map((e) => ({ ...e, col: c })));
    const all = events.flatMap((e) => e.notes);
    const color = KIND_COLOR[kind];
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs, parent) => {
      const n = document.createElementNS(NS, name);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (parent) parent.append(n);
      return n;
    };
    const lo = (all.length ? Math.min(...all) : 60) - 1;
    const hi = Math.max(all.length ? Math.max(...all) : 71, lo + 11) + 1;
    const rows = hi - lo + 1;
    const svg = el('svg', { viewBox: `0 0 ${total} ${rows}`, preserveAspectRatio: 'none', class: 'bw-roll-svg', 'aria-hidden': 'true' });
    const tonic = sc.key ? tonicPc(sc.key.tonic) : -1;
    for (let m = lo; m <= hi; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (pc === tonic || BLACK_PC.includes(pc)) el('rect', { x: 0, y: hi - m, width: total, height: 1, class: pc === tonic ? 'bw-rt' : 'bw-rb' }, svg);
    }
    for (let s = 0; s < total; s += 4) el('line', { x1: s, x2: s, y1: 0, y2: rows, class: s % 16 === 0 ? 'bw-rbar' : 'bw-rbeat' }, svg);
    // note d'approche (basse) : dernière attaque d'un accord, hors de l'accord, juste avant le suivant
    const spanAt = (step) => spans.find((x) => step >= x.step && step < x.step + x.len);
    const isAppr = (e) => {
      if (kind !== 'bass') return false;
      const sp = spanAt(e.step);
      if (!sp || e.step + e.len < sp.step + sp.len - 1) return false;
      return e.notes.every((n) => !sp.info.pcs.includes(((n % 12) + 12) % 12)) && spans.some((x) => x.step === sp.step + sp.len);
    };
    // basse : les notes se cliquent (accent) ; la ligne « Accents » est dans son panneau (accPanel)
    const acc = kind === 'bass' ? accOf(sc.sec, T) : null;
    const per = acc ? BS().accentPeriod(acc.repeat, sc.bars) : 0;
    const isAcc = (e) => !!acc && acc.steps.includes(e.step % per);
    events.forEach((e) => {
      const appr = isAppr(e);
      e.notes.forEach((n) => el('rect', { x: e.step + 0.08, y: hi - n + 0.1, width: Math.max(0.5, Math.min(e.len, total - e.step) - 0.16), height: 0.8, class: 'bw-rn' + (appr ? ' appr' : '') + (isAcc(e) ? ' ac' : '') }, svg));
    });
    const pct = (x) => `${((100 * x) / total).toFixed(3)}%`;
    const chords = h(
      'div',
      { class: 'bw-rchords' },
      ...spans.map((x) => h('span', { class: `bw-rc role-${x.info.role.id}`, style: `left:${pct(x.step)};width:${pct(x.len)}`, title: `${x.info.name} · ${x.info.numeral} — ${x.info.role.text}` }, x.info.name))
    );
    const empty = all.length ? null : h('p', { class: 'bw-rempty' }, 'Pas de notes dans cette scène.');
    if (!acc) return h('div', { class: 'bw-roll', id: 'bwRoll', 'data-scene': sc.id, 'data-bars': sc.bars, style: `--c:${color}`, role: 'img', 'aria-label': `Notes de la scène ${sc.name}` }, chords, h('div', { class: 'bw-rbody' }, svg, h('i', { class: 'bw-roll-ph', hidden: true })), empty);
    const names = ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
    const nb = events.map((e) => {
      const on = isAcc(e);
      const n = e.notes[0];
      return h('button', {
        type: 'button', class: 'bw-rnb' + (on ? ' ac' : ''), 'data-s': e.step, 'aria-pressed': String(on),
        style: `left:${pct(e.step)};width:${pct(Math.min(e.len, total - e.step))};top:${((100 * (hi - n)) / rows).toFixed(3)}%;height:${(100 / rows).toFixed(3)}%`,
        'aria-label': `${names[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}, pas ${e.step + 1}${on ? ', accentuée' : ''}`,
        title: on ? 'Note accentuée : clic pour la retirer' : 'Clic : accentuer cette note',
        onclick: () => toggleAccent(sc, T, e.step, `#bwRoll .bw-rnb[data-s="${e.step}"]`),
      });
    });
    return h(
      'div',
      { class: 'bw-roll bw-roll-acc', id: 'bwRoll', 'data-scene': sc.id, 'data-bars': sc.bars, style: `--c:${color}`, role: 'group', 'aria-label': `Notes de la scène ${sc.name}` },
      h(
        'div',
        { class: 'bw-rscr' },
        h(
          'div',
          { class: 'bw-rin', style: `--n:${total}` },
          chords,
          h('div', { class: 'bw-rbody' }, svg, ...nb, h('i', { class: 'bw-roll-ph', hidden: true }))
        )
      ),
      empty
    );
  }

  /* ---------- Accents de la basse (parts[section].inst[id].accents, js/bandsong.js) ----------
   * Un accent est posé sur un pas d'une période (16 pas : chaque mesure, 32 : chaque 2 mesures, ou toute la scène) : toutes les notes
   * qui commencent à ce pas, modulo la période, sont plus fortes (vélocité) et, si « Ouvre le filtre » est allumé, ouvrent le filtre.
   */
  /** Accents de la scène pour cet instrument (jamais null : réglages par défaut, sans pas). */
  const accOf = (sec, T) => BS().normalizeAccents((partOf(sec, T) || {}).accents) || { ...BS().ACC_DEFAULT, steps: [] };
  const noteSteps = (sc, T) => (((sc.data[T.col.id] || {}).events) || []).map((e) => e.step);
  /** Nombre d'accents du motif qui tombent sur une note de la scène. */
  function accCount(sc, T) {
    const A = accOf(sc.sec, T);
    if (!A.steps.length) return 0;
    const per = BS().accentPeriod(A.repeat, sc.bars);
    const has = new Set(noteSteps(sc, T).map((s) => s % per));
    return A.steps.filter((s) => has.has(s)).length;
  }
  /** Écrit les accents (sans redessiner) ; des accents sans pas et aux réglages par défaut disparaissent. */
  function writeAcc(sc, T, patch) {
    const next = BS().normalizeAccents({ ...accOf(sc.sec, T), ...patch });
    const d = BS().ACC_DEFAULT;
    const blank = !next.steps.length && next.repeat === 1 && next.force === d.force && !next.filter && next.bright === d.bright;
    putPart(sc.sec, T, { accents: blank ? undefined : next });
  }
  function putAcc(sc, T, patch, focus) {
    writeAcc(sc, T, patch);
    partChanged(focus);
  }
  function toggleAccent(sc, T, step, focus) {
    const A = accOf(sc.sec, T);
    const s = step % BS().accentPeriod(A.repeat, sc.bars);
    putAcc(sc, T, { steps: A.steps.includes(s) ? A.steps.filter((x) => x !== s) : [...A.steps, s] }, focus);
  }
  /* Panneau « Accents » : affichage seulement (pas dans la chanson créée), par instrument et par scène, gardé dans le brouillon
   * (S.wiz.accView) comme l'état replié des courbes : absent = fermé (par défaut), 'open' = ouvert, 'fold' = replié sur sa tête.
   * Fermer ne touche pas aux accents. */
  const accKey = (sc, T) => `${T.id}|${sc.sec}`;
  const accView = (sc, T) => (S.wiz.accView || (S.wiz.accView = {}))[accKey(sc, T)] || null;
  function setAccView(sc, T, v, focus) {
    const m = S.wiz.accView || (S.wiz.accView = {});
    if (v) m[accKey(sc, T)] = v;
    else delete m[accKey(sc, T)];
    renderWiz(); // l'affichage seul change : la lecture continue
    const f = focus && $(focus);
    if (f) f.focus();
  }
  /** Panneau « Accents » (basse) : tête comme une courbe (chevron, ×), ligne de points, répétition, puis la carte des motifs. */
  function accPanel(sc, T) {
    const view = accView(sc, T);
    if (!view) return null;
    const fold = view === 'fold';
    const A = accOf(sc.sec, T);
    const per = BS().accentPeriod(A.repeat, sc.bars);
    const events = ((sc.data[T.col.id] || {}).events || []);
    const on = (e) => A.steps.includes(e.step % per);
    const k = events.filter(on).length;
    const pct = (x) => `${((100 * x) / (sc.bars * 16)).toFixed(3)}%`;
    const head = h(
      'div',
      { class: 'bwau-lh' },
      h('button', { type: 'button', class: 'bwau-xb bwau-fold', id: 'bwAccFold', 'aria-expanded': String(!fold), 'aria-label': `${fold ? 'Afficher' : 'Masquer'} le panneau Accents`, title: fold ? 'Afficher' : 'Masquer (les accents continuent de jouer)', onclick: () => setAccView(sc, T, fold ? 'open' : 'fold', '#bwAccFold') }, fold ? '▸' : '▾'),
      h('i', { class: 'bwau-sq' }),
      h('b', {}, 'Accents'),
      h('span', { class: 'bwau-rd', id: 'bwAccCount' }, `${k} sur ${events.length} notes`),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'bwau-xb', id: 'bwAccClose', 'aria-label': 'Fermer le panneau Accents', title: 'Fermer le panneau (les accents sont gardés)', onclick: () => setAccView(sc, T, null, '#bwAutoBtn') }, '×')
    );
    const body = [];
    if (!fold) {
      const dots = events.map((e) =>
        h('button', {
          type: 'button', class: 'bw-acell' + (on(e) ? ' ac' : '') + (e.step >= per ? ' echo' : ''), 'data-s': e.step, 'aria-pressed': String(on(e)),
          style: `left:${pct(e.step)};width:${pct(1)}`,
          'aria-label': `Accent, pas ${e.step + 1}${on(e) ? ', accentué' : ''}`,
          onclick: () => toggleAccent(sc, T, e.step, `#bwAccPanel .bw-acell[data-s="${e.step}"]`),
        }, h('i'))
      );
      const reps = [[1, 'Répéter chaque mesure'], [2, 'chaque 2 mesures'], ['scene', 'toute la scène']];
      const hint = { 1: 'Le motif d’une mesure se répète sur chacune des mesures de la scène (les points hachurés en reprennent le motif).', 2: 'Un motif de 2 mesures, repris toutes les 2 mesures.', scene: 'Les accents sont posés une seule fois pour toute la scène.' }[A.repeat];
      body.push(
        h('div', { class: 'bwau-xs', 'data-xs': '' }, h('div', { class: 'bwau-in' }, h('div', { class: 'bw-acells', role: 'group', 'aria-label': 'Accents, un point par note' }, ...dots))),
        h('div', { class: 'bwp-row' }, partSeg('Le motif d’accents', 'bwAccRep', reps, A.repeat, (v) => setAccRepeat(sc, T, v))),
        h('p', { class: 'dlg-hint', id: 'bwAccHint' }, hint),
        accentsCard(sc, T)
      );
    }
    return h('section', { class: 'bwp-card bw-card bwau bwac' + (fold ? ' fold' : ''), id: 'bwAccPanel', style: `--n:${sc.bars * 16};--c:${KIND_COLOR.bass}`, 'aria-label': `Accents de « ${sc.name} »` }, head, ...body);
  }
  /** Change la répétition : en grandissant le motif est recopié (même rendu), en rétrécissant on garde le début. */
  function setAccRepeat(sc, T, repeat) {
    const A = accOf(sc.sec, T);
    const from = BS().accentPeriod(A.repeat, sc.bars);
    const to = BS().accentPeriod(repeat, sc.bars);
    const steps = to > from ? Array.from({ length: Math.ceil(to / from) }, (_, k) => A.steps.map((s) => s + k * from)).flat().filter((s) => s < to) : A.steps.filter((s) => s < to);
    putAcc(sc, T, { repeat, steps }, `#bwAccRep [data-v="${repeat}"]`);
  }
  /** Après un changement de jeu (mode, pédale, registre) : on garde les accents qui tombent encore sur une note. */
  function pruneAccents(sc, T) {
    const A = accOf(sc.sec, T);
    if (!A.steps.length) return;
    const { res } = wizSong();
    const x = res && res.scenes.find((s) => s.sec === sc.sec);
    if (!x) return;
    const per = BS().accentPeriod(A.repeat, x.bars);
    const has = new Set(noteSteps(x, T).map((s) => s % per));
    const keep = A.steps.filter((s) => has.has(s));
    if (keep.length !== A.steps.length) writeAcc(sc, T, { steps: keep });
  }
  let accLast = null; // dernier motif posé { clé, id, pas } : « Aléatoire léger » n'est pas recalculable
  function applyAccPreset(sc, T, id) {
    const A = accOf(sc.sec, T);
    const p = BS().ACC_PRESETS.find((x) => x[0] === id);
    const repeat = p[3] === 2 && A.repeat === 1 ? 2 : A.repeat;
    const per = BS().accentPeriod(repeat, sc.bars);
    const steps = BS().accentPreset(id, noteSteps(sc, T), per, id === 'rand' ? Date.now() % 100000 : 0);
    writeAcc(sc, T, { steps, repeat });
    // motif repéré tel que rangé (normalisé), avant le nouveau rendu
    accLast = { key: sc.sec + '/' + T.id, id, steps: JSON.stringify(accOf(sc.sec, T).steps) };
    partChanged(`.bwa-pat[data-id="${id}"]`);
  }
  /** Motif prêt qui correspond aux accents de la scène ('custom' : à la main, 'none' : aucun). */
  function accPatOf(sc, T) {
    const A = accOf(sc.sec, T);
    if (!A.steps.length) return 'none';
    const per = BS().accentPeriod(A.repeat, sc.bars);
    const j = JSON.stringify(A.steps);
    if (accLast && accLast.key === sc.sec + '/' + T.id && accLast.steps === j) return accLast.id;
    const f = BS().ACC_PRESETS.find((p) => p[0] !== 'rand' && p[0] !== 'none' && JSON.stringify(BS().accentPreset(p[0], noteSteps(sc, T), per)) === j);
    return f ? f[0] : 'custom';
  }
  const accForce = (v) => `+${(v * 0.06).toFixed(1).replace('.0', '')} dB / vélocité ${Math.round(100 + v * 0.27)}`;
  /** Petit dessin d'un motif prêt : une mesure de 16 pas, les accents en vert vif. */
  function accPatSvg(id) {
    const on = id === 'rand' ? [0, 6, 9] : BS().accentPreset(id, Array.from({ length: 16 }, (_, i) => i), 16);
    return `<svg viewBox="0 0 96 16" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 16 }, (_, s) => `<rect x="${s * 6 + 1}" y="${on.includes(s) ? 1 : 9}" width="4" height="${on.includes(s) ? 14 : 6}" rx="1" fill="${on.includes(s) ? '#9dff8f' : 'currentColor'}" opacity="${on.includes(s) ? 1 : 0.35}"/>`).join('')}</svg>`;
  }
  /**
   * Potentiomètre rond (rendu des potentiomètres d'Arp One) : glisser, molette, flèches ; `live(v)` à chaque geste (texte), `commit(v)` au lâcher.
   * Rend l'élément ; `text` (facultatif) est tenu à jour par l'appelant dans live.
   */
  function dialKnob(id, label, value, { live, commit, small }) {
    let v = value;
    const num = h('b', {}, String(v));
    const ring = h('div', { class: 'arp-knob-ring' }, h('div', { class: 'arp-knob-cap' }, num));
    const dial = h('div', { class: 'arp-knob-dial bwa-dial' + (small ? ' s' : ''), id, role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v) }, ring);
    const paint = () => {
      ring.style.setProperty('--p', v + '%');
      num.textContent = String(v);
      dial.setAttribute('aria-valuenow', String(v));
      live(v);
    };
    const set = (x) => ((v = Math.max(0, Math.min(100, Math.round(x)))), paint());
    let drag = null;
    dial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dial.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, v, moved: false };
    });
    dial.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.moved = true;
      set(drag.v + (drag.y - e.clientY) * 0.6);
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved) commit(v);
    };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    let wt = 0;
    dial.addEventListener('wheel', (e) => {
      e.preventDefault();
      set(v + (e.deltaY < 0 ? 2 : -2));
      clearTimeout(wt);
      wt = setTimeout(() => commit(v), 350);
    }, { passive: false });
    dial.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 20, PageDown: -20 }[e.key];
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : d != null ? v + d : null;
      if (to == null) return;
      e.preventDefault();
      set(to);
      commit(v);
    });
    paint();
    return dial;
  }
  /** Carte « Accents » de l'onglet Basse : motifs prêts, force, ouverture du filtre. */
  function accentsCard(sc, T) {
    const A = accOf(sc.sec, T);
    const pat = accPatOf(sc, T);
    const fl = h('small', { id: 'bwAccForceText' }, accForce(A.force));
    const fv = h('span', { id: 'bwAccForceNum' }, String(A.force));
    const force = dialKnob('bwAccForce', 'Force de l’accent', A.force, { live: (v) => ((fl.textContent = accForce(v)), (fv.textContent = String(v))), commit: (v) => putAcc(sc, T, { force: v }, '#bwAccForce') });
    const bv = h('span', { id: 'bwAccBrightNum' }, String(A.bright));
    const bright = dialKnob('bwAccBright', 'Brillance', A.bright, { small: true, live: (v) => (bv.textContent = String(v)), commit: (v) => putAcc(sc, T, { bright: v }, '#bwAccBright') });
    const hint = pat === 'custom' ? 'Motif personnalisé : tu as touché des notes à la main.' : A.steps.length && !accCount(sc, T) ? 'Aucune note du mode de jeu ne tombe sur ces accents.' : 'Choisir un motif remplit la ligne de points ci-dessus.';
    return h(
      'div',
      { class: 'bwa-card', id: 'bwAcc' },
      h('div', { class: 'bwp-ch' }, h('b', {}, 'Motifs'), h('span', { class: 'bh-info' }, 'des notes plus fortes, pour faire respirer la basse'), h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwAccClear', disabled: !A.steps.length, onclick: () => putAcc(sc, T, { steps: [] }, '#bwAccClear') }, 'Effacer')),
      h(
        'div',
        { class: 'bwa-accgrid' },
        h(
          'div',
          { class: 'bwa-side' },
          h('div', { class: 'bh-lbl' }, 'Motifs prêts'),
          h('div', { class: 'bwa-pats', role: 'radiogroup', 'aria-label': 'Motifs d’accents' },
            ...BS().ACC_PRESETS.map(([id, name, tip]) => h('button', { type: 'button', role: 'radio', class: 'bwa-pat' + (pat === id ? ' on' : ''), 'data-id': id, 'aria-checked': String(pat === id), onclick: () => applyAccPreset(sc, T, id) }, h('b', {}, name), h('span', { html: accPatSvg(id) }), h('small', {}, tip || ' ')))),
          h('p', { class: 'dlg-hint', id: 'bwAccPatHint' }, hint)
        ),
        h(
          'div',
          { class: 'bwa-side' },
          h('div', { class: 'bwa-ctl' }, force, h('div', { class: 'bwa-txt' }, h('b', {}, 'Force ', fv), fl)),
          h(
            'div',
            { class: 'bwa-filt' },
            h('div', { class: 'bwa-ctl' },
              h('button', { type: 'button', class: 'bwa-sw', id: 'bwAccFilter', role: 'switch', 'aria-checked': String(A.filter), 'aria-label': 'Ouvre le filtre', onclick: () => putAcc(sc, T, { filter: !A.filter }, '#bwAccFilter') }),
              h('div', { class: 'bwa-txt' }, h('b', {}, 'Ouvre le filtre'), h('small', {}, 'L’accent ouvre le filtre : la basse acide.'))),
            A.filter ? h('div', { class: 'bwa-ctl bwa-sub' }, bright, h('div', { class: 'bwa-txt' }, h('b', {}, 'Brillance ', bv), h('small', {}, 'Jusqu’où le filtre s’ouvre.'))) : null
          )
        )
      )
    );
  }

  /* ---------- Automation par scène (parts[section].inst[id].auto, js/bandsong.js) ----------
   * Rien n'est affiché tant qu'on n'ajoute pas de courbe : le bouton « Automation » de la tête de scène ouvre le menu des réglages.
   * Chaque courbe a son panneau sous le piano-roll (ou sous la tête, sans piano-roll), aligné sur les mesures : formes prêtes,
   * deux réglages, retouche au dessin (glisser un point, double-clic pour en ajouter, clic droit ou Alt+clic pour l'enlever :
   * la forme devient « Dessinée »). Un panneau se replie en une ligne ; une courbe repliée joue quand même.
   */
  const AU = () => SS.bandSong;
  const AU_H = 72; // hauteur d'une courbe (px)
  const AU_PAD = 8;
  const AU_SHAPES = [['flat', 'Plate'], ['rise', 'Montée'], ['fall', 'Descente'], ['open', 'Ouvre puis ferme'], ['close', 'Ferme puis ouvre'], ['lfo', 'LFO lent'], ['steps', 'Marches'], ['final', 'Montée finale'], ['breath', 'Respiration']];
  const AU_LABELS = { flat: ['Niveau'], rise: ['Début', 'Fin'], fall: ['Début', 'Fin'], open: ['Bords', 'Sommet'], close: ['Bords', 'Creux'], lfo: ['Profondeur', 'Centre'], steps: ['Début', 'Fin'], final: ['Niveau', 'Sommet'], breath: ['Bas', 'Haut'] };
  let autoOpen = null; // « instrument|scène » dont le menu est ouvert
  let autoBound = false;
  let autoProj = null;
  const autoKey = (sc, T) => `${T.id}|${sc.sec}`;
  /** Courbes de la scène pour cet instrument ({} si aucune). */
  const autoOf = (sec, T) => AU().normalizeAuto((partOf(sec, T) || {}).auto) || {};
  const autoCount = (sec, T) => (mutedIn(sec, T) ? 0 : Object.keys(autoOf(sec, T)).length);
  /** Écrit les courbes de la scène (sans redessiner) ; aucune courbe : le champ disparaît. */
  function setAuto(sc, T, next) {
    putPart(sc.sec, T, { auto: Object.keys(next).length ? next : undefined });
  }
  /** Après un changement : la chanson est refaite et on l'entend (la mélodie : sans remonter son panneau). */
  function autoChanged(sc, T, focus) {
    if (T.kind !== 'melody') return partChanged(focus);
    afterLead(sc.sec);
    const f = focus && $(focus);
    if (f) f.focus();
  }
  /** Ce réglage est-il proposé pour cet instrument (réglages du son : synthés seulement, comme SS.autoParamsFor) ? */
  function autoAllowed(T, id) {
    if (id === 'vel') return true;
    autoProj = autoProj || SS.newProject();
    try {
      return SS.autoParamsFor(SS.newTrack(T.col.o, autoProj)).some((P) => P.id === id);
    } catch (e) {
      return !AU().SCENE_AUTO.find((x) => x.id === id).voice;
    }
  }
  const autoFmt = (id, n) => {
    const v = AU().autoReal(id, n);
    const num = (x, d = 2) => Math.abs(x).toFixed(d).replace('.', ',');
    if (id === 'filter') return (v < 0 ? '−' : '+') + num(v);
    if (id === 'vel') return 'vél. ' + Math.round(v);
    if (id === 'vcf' || id === 'fdecay' || id === 'lfoamt') return SS.autoFormat(id, v);
    return Math.round(v * 100) + ' %';
  };
  const autoPct = (n) => Math.round(n * 100) + ' %';
  /** « Montée +0,20 → +0,70 », « Respiration vél. 80 ↔ vél. 112 »… */
  function autoReadout(id, spec, len) {
    const ys = AU().autoPoints(spec, len).map((p) => p[1]);
    if (spec.shape === 'flat') return autoFmt(id, ys[0]);
    if (['open', 'close', 'lfo', 'breath'].includes(spec.shape)) return `${autoFmt(id, Math.min(...ys))} ↔ ${autoFmt(id, Math.max(...ys))}`;
    return `${autoFmt(id, ys[0])} → ${autoFmt(id, ys[ys.length - 1])}`;
  }
  const autoSummary = (id, spec, len) => (spec.shape === 'drawn' ? 'Dessinée' : nameOf(AU_SHAPES, spec.shape)) + ' ' + autoReadout(id, spec, len);
  const AU_CURVE_IC = '<svg viewBox="0 0 12 9" aria-hidden="true"><path d="M1 7.5C3 7.5 3.5 1.5 6 1.5S9 7.5 11 7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  /** Pastille « auto » de la colonne des scènes, ajoutée à la ligne de la scène (texte ou élément .bwa-ssub). */
  function withAutoBadge(line, x, T) {
    const n = autoCount(x.sec, T);
    if (!n) return line;
    const badge = h('em', { class: 'bwau-badge', title: `${n} courbe${n > 1 ? 's' : ''} d’automation` }, h('i', { html: AU_CURVE_IC }), 'auto');
    if (line && line.nodeType) return line.append(badge), line;
    return h('span', { class: 'bwa-ssub' }, h('span', {}, line || ''), badge);
  }

  /* --- dessin d'une courbe --- */
  const yOfN = (n, hh = AU_H, pad = AU_PAD) => pad + (1 - n) * (hh - 2 * pad);
  /** SVG d'une courbe sur `len` pas (largeur = la scène, étirée) ; les points sont des éléments HTML par-dessus. */
  function autoSvg(pts, len, color, hh, pad, mini) {
    const bars = Math.max(1, Math.round(len / 16));
    let grid = '';
    for (let b = 0; b <= bars; b++) grid += `M${b * 16} 0V${hh}`;
    let beats = '';
    for (let b = 1; b < bars * 4; b++) if (b % 4) beats += `M${b * 4} 0V${hh}`;
    const xy = pts.map(([x, y]) => `${x} ${yOfN(y, hh, pad).toFixed(1)}`);
    const first = pts[0] || [0, 0.5];
    const last = pts[pts.length - 1] || [0, 0.5];
    const path = `M0 ${yOfN(first[1], hh, pad).toFixed(1)}` + xy.map((p) => `L${p}`).join('') + `L${len} ${yOfN(last[1], hh, pad).toFixed(1)}`;
    const vec = 'vector-effect="non-scaling-stroke"';
    return `<svg viewBox="0 0 ${len} ${hh}" preserveAspectRatio="none" width="100%" height="${hh}" aria-hidden="true"><path d="${beats}" stroke="rgba(255,255,255,.05)" stroke-width="1" fill="none" ${vec}/><path d="${grid}" stroke="#4a4a58" stroke-width="1" fill="none" ${vec}/>${mini ? '' : `<path d="M0 ${yOfN(0.5, hh, pad)}H${len}" stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-dasharray="3 5" fill="none" ${vec}/>`}<path d="${path}L${len} ${hh}L0 ${hh}Z" fill="${color}" stroke="none" opacity=".16"/><path d="${path}" fill="none" stroke="${color}" stroke-width="${mini ? 1.8 : 2.4}" stroke-linejoin="round" ${vec}/></svg>`;
  }
  /** Petit dessin d'une forme prête (pour ses puces). */
  const autoMini = (spec, len) => {
    const pts = AU().autoPoints(spec, len);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${((100 * x) / Math.max(1, len - 1)).toFixed(1)} ${(14 - y * 12).toFixed(1)}`).join('');
    return `<svg viewBox="0 0 100 15" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  };

  /* --- menu et bouton de la tête de scène --- */
  function closeAutoMenu(focusBtn) {
    if (!autoOpen) return;
    autoOpen = null;
    const w = $('.bwau-add');
    if (!w) return;
    const m = $('.bwau-menu', w);
    if (m) m.remove();
    const b = $('.bwau-btn', w);
    if (b) {
      b.setAttribute('aria-expanded', 'false');
      if (focusBtn) b.focus();
    }
  }
  function bindAutoMenu() {
    if (autoBound) return;
    autoBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (autoOpen && !(e.target.closest && e.target.closest('.bwau-add'))) closeAutoMenu(false);
    });
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !autoOpen) return;
        e.preventDefault();
        e.stopPropagation();
        closeAutoMenu(true);
      },
      true
    );
  }
  /** Basse : section « Accents » du menu (hors paramètres d'automation) ; l'entrée ouvre ou ferme le panneau. */
  function accMenuItems(sc, T) {
    const shown = !!accView(sc, T);
    const n = accCount(sc, T);
    return [
      h('div', { class: 'bwau-mh bwau-msep' }, 'Accents'),
      h(
        'button',
        { type: 'button', role: 'menuitemcheckbox', class: 'bwau-item', id: 'bwauAcc', 'aria-checked': String(shown), style: `--pc:${KIND_COLOR.bass}`, onclick: () => setAccView(sc, T, shown ? null : 'open', '#bwauAcc') },
        h('i'),
        h('span', {}, (shown ? '✓ ' : '') + 'Accents' + (n ? ` · ${n}` : '')),
        h('small', {}, shown ? 'ouvert' : 'des notes plus fortes')
      ),
    ];
  }
  function autoMenuEl(sc, T) {
    const specs = autoOf(sc.sec, T);
    const n = Object.keys(specs).length;
    const vis = Object.values(specs).filter((s) => !s.hidden).length;
    const items = AU().SCENE_AUTO.map((p) => {
      const added = !!specs[p.id];
      const off = !autoAllowed(T, p.id);
      return h(
        'button',
        {
          type: 'button', role: 'menuitemcheckbox', class: 'bwau-item', 'aria-checked': String(added), 'data-param': p.id, style: `--pc:${p.color}`, disabled: added || off,
          onclick: () => {
            setAuto(sc, T, { ...autoOf(sc.sec, T), [p.id]: AU().newAutoSpec(p.id) });
            autoChanged(sc, T, '.bwau-item:not(:disabled)');
          },
        },
        h('i'),
        h('span', {}, (added ? '✓ ' : '') + (p.menu || p.name), p.sub ? h('small', {}, ` · ${p.sub}`) : null),
        h('small', {}, added ? 'ajouté' : off ? 'synthés seulement' : p.voice ? 'synthé' : '')
      );
    });
    const all = (hidden) => () => {
      setAuto(sc, T, Object.fromEntries(Object.entries(autoOf(sc.sec, T)).map(([k, s]) => [k, { ...s, hidden: hidden || undefined }])));
      renderWiz(); // l'affichage seul change : la lecture continue
      const f = $('.bwau-menu .bwau-item');
      if (f) f.focus();
    };
    const menu = h(
      'div',
      { class: 'bwau-menu', role: 'menu', 'aria-label': `Ajouter une automation à « ${sc.name} »` },
      h('div', { class: 'bwau-mh' }, `Ajouter une automation à « ${sc.name} »`),
      ...items,
      h('div', { class: 'bwau-mh' }, 'Panneaux'),
      h('div', { class: 'bwau-mrow' },
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwauHideAll', disabled: !vis, onclick: all(true) }, 'Tout masquer'),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwauShowAll', disabled: !n || vis === n, onclick: all(false) }, 'Tout afficher')),
      ...(T.kind === 'bass' ? accMenuItems(sc, T) : [])
    );
    menu.addEventListener('keydown', (e) => {
      const list = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = list.indexOf(document.activeElement);
      const to = e.key === 'ArrowDown' ? list[(i + 1) % list.length] : e.key === 'ArrowUp' ? list[(i - 1 + list.length) % list.length] : e.key === 'Home' ? list[0] : e.key === 'End' ? list[list.length - 1] : null;
      if (!to) return;
      e.preventDefault();
      to.focus();
    });
    return menu;
  }
  /** Bouton « Automation · n ▾ » et son menu (dans la tête de la scène). */
  function autoButton(sc, T) {
    bindAutoMenu();
    if (autoOpen && autoOpen !== autoKey(sc, T)) autoOpen = null; // on a changé de scène ou d'instrument
    const n = Object.keys(autoOf(sc.sec, T)).length;
    const open = autoOpen === autoKey(sc, T);
    const btn = h('button', { type: 'button', class: 'btn btn-small bwau-btn' + (n ? ' has' : ''), id: 'bwAutoBtn', 'aria-haspopup': 'menu', 'aria-expanded': String(open), title: 'Ajouter une courbe d’automation (filtre, volume, vélocité…) à cette scène' }, `Automation${n ? ` · ${n}` : ''} ▾`);
    const w = h('span', { class: 'bwau-add' }, btn, open ? autoMenuEl(sc, T) : null);
    btn.addEventListener('click', () => {
      if (autoOpen === autoKey(sc, T)) return closeAutoMenu(true);
      autoOpen = autoKey(sc, T);
      const m = autoMenuEl(sc, T);
      w.append(m);
      btn.setAttribute('aria-expanded', 'true');
      const f = m.querySelector('button:not(:disabled)');
      if (f) f.focus();
    });
    return w;
  }

  /* --- panneaux des courbes --- */
  /** Réglages (curseurs, période) d'une courbe prête, ou « Revenir à la forme ». */
  function autoControls(sc, T, p, spec, live) {
    const id = p.id;
    if (spec.shape === 'drawn') {
      const from = spec.from;
      return h('div', { class: 'bwau-lcn' }, h('button', { type: 'button', class: 'bwau-rev', onclick: () => revertAuto(sc, T, id) }, from ? `↺ Revenir à la forme « ${nameOf(AU_SHAPES, from)} »` : '↺ Revenir à une courbe plate'));
    }
    const labels = AU_LABELS[spec.shape];
    const sl = (which, i) => {
      const val = h('b', {}, spec.shape === 'lfo' && which === 'a' ? autoPct(spec[which]) : autoFmt(id, spec[which]));
      const inp = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(spec[which] * 100)), id: `bwau-${id}-${which}`, 'aria-label': `${p.name} : ${labels[i]}` });
      inp.addEventListener('input', () => {
        spec[which] = inp.value / 100;
        val.textContent = spec.shape === 'lfo' && which === 'a' ? autoPct(spec[which]) : autoFmt(id, spec[which]);
        live();
      });
      inp.addEventListener('change', () => commitAuto(sc, T, id, spec, `#bwau-${id}-${which}`));
      return h('div', { class: 'bwau-k' }, h('label', { for: inp.id }, labels[i], val), inp);
    };
    return h(
      'div',
      { class: 'bwau-lcn', 'data-ctl': '' },
      sl('a', 0),
      labels[1] ? sl('b', 1) : null,
      spec.shape === 'lfo'
        ? h('div', { class: 'bwau-per' }, h('span', { class: 'bh-lbl' }, 'Période'),
            h('span', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Période du LFO' },
              ...[1, 2, 4].map((n) => h('button', { type: 'button', role: 'radio', class: (spec.period || 2) === n ? 'active' : '', 'aria-checked': String((spec.period || 2) === n), 'data-per': n, onclick: () => commitAuto(sc, T, id, { ...spec, period: n }, `.bwau-ln[data-param="${id}"] [data-per="${n}"]`) }, `${n} mes.`))))
        : null
    );
  }
  function commitAuto(sc, T, id, spec, focus) {
    setAuto(sc, T, { ...autoOf(sc.sec, T), [id]: spec });
    autoChanged(sc, T, focus);
  }
  function revertAuto(sc, T, id) {
    const s = autoOf(sc.sec, T)[id];
    const back = s.from ? { shape: s.from, a: s.a, b: s.b, ...(s.period ? { period: s.period } : {}) } : AU().newAutoSpec(id);
    if (s.hidden) back.hidden = true;
    commitAuto(sc, T, id, back, `.bwau-ln[data-param="${id}"] .bwau-xb`);
  }
  function delAuto(sc, T, id) {
    const next = { ...autoOf(sc.sec, T) };
    delete next[id];
    setAuto(sc, T, next);
    autoChanged(sc, T, '#bwAutoBtn');
  }
  function foldAuto(sc, T, id) {
    const s = autoOf(sc.sec, T)[id];
    setAuto(sc, T, { ...autoOf(sc.sec, T), [id]: { ...s, hidden: s.hidden ? undefined : true } });
    renderWiz(); // seul l'affichage change : la lecture continue
    const f = $(`.bwau-ln[data-param="${id}"] .bwau-fold`);
    if (f) f.focus();
  }

  /** Une courbe : tête (nom, valeur, réglages, ×), formes prêtes, courbe éditable ; repliée : une ligne et une mini-courbe. */
  function autoLine(sc, T, p, spec, fit) {
    const len = sc.bars * 16;
    const fold = !!spec.hidden;
    const lane = h('div', { class: 'bwau-cv' + (fold ? ' mini' : ''), style: `height:${fold ? 30 : AU_H}px` });
    const pts = () => AU().autoPoints(spec, len);
    const rd = h('span', { class: 'bwau-rd', 'data-rd': '' }, fold ? autoSummary(p.id, spec, len) : autoReadout(p.id, spec, len));
    const handles = [];
    const paint = () => {
      const q = pts();
      lane.querySelector('svg')?.remove();
      lane.insertAdjacentHTML('afterbegin', autoSvg(q, len, p.color, fold ? 30 : AU_H, fold ? 5 : AU_PAD, fold));
      if (fold) return;
      while (handles.length > q.length) handles.pop().remove();
      q.forEach(([x, y], i) => {
        if (!handles[i]) {
          const d = h('div', { class: 'bwau-pt', role: 'slider', tabindex: '0', 'data-i': i, title: 'Glisser : déplacer · double-clic sur la courbe : ajouter un point · clic droit ou Alt+clic : enlever' });
          handles[i] = d;
          lane.append(d);
        }
        const d = handles[i];
        d.dataset.i = i;
        d.style.left = `${(100 * x) / len}%`;
        d.style.top = `${yOfN(y)}px`;
        d.setAttribute('aria-label', `${p.name}, point ${i + 1} sur ${q.length}, pas ${x + 1}`);
        d.setAttribute('aria-valuemin', '0');
        d.setAttribute('aria-valuemax', '100');
        d.setAttribute('aria-valuenow', String(Math.round(y * 100)));
        d.setAttribute('aria-valuetext', autoFmt(p.id, y));
      });
      rd.textContent = autoReadout(p.id, spec, len);
    };
    paint();
    const head = h(
      'div',
      { class: 'bwau-lh' },
      h('button', { type: 'button', class: 'bwau-xb bwau-fold', 'aria-expanded': String(!fold), 'aria-label': `${fold ? 'Afficher' : 'Masquer'} la courbe ${p.name}`, title: fold ? 'Afficher' : 'Masquer (elle continue de jouer)', onclick: () => foldAuto(sc, T, p.id) }, fold ? '▸' : '▾'),
      h('i', { class: 'bwau-sq' }),
      h('b', {}, p.name),
      !fold && p.sub ? h('span', { class: 'bwau-sub' }, p.sub) : null,
      rd,
      h('span', { class: 'spacer' }),
      fold ? null : autoControls(sc, T, p, spec, () => paint()),
      h('button', { type: 'button', class: 'bwau-xb bwau-del', 'aria-label': `Supprimer la courbe ${p.name}`, title: 'Supprimer la courbe', onclick: () => delAuto(sc, T, p.id) }, '×')
    );
    const chips = fold
      ? null
      : h('div', { class: 'bwau-shapes', role: 'group', 'aria-label': 'Formes prêtes' },
          ...AU_SHAPES.map(([sid, name]) => {
            const on = spec.shape === sid;
            const base = { ...AU().AUTO_DEF[sid], shape: sid };
            if (sid === 'flat') base.a = base.b = AU().newAutoSpec(p.id).a;
            return h('button', { type: 'button', class: 'bwau-shp' + (on ? ' on' : ''), 'data-shape': sid, 'aria-pressed': String(on), style: `--pc:${p.color}`, onclick: () => commitAuto(sc, T, p.id, { ...base, ...(spec.period && sid === 'lfo' ? { period: spec.period } : {}), ...(spec.hidden ? { hidden: true } : {}) }, `.bwau-ln[data-param="${p.id}"] [data-shape="${sid}"]`) }, h('span', { html: autoMini(base, len) }), h('span', {}, name));
          }),
          spec.shape === 'drawn' ? h('button', { type: 'button', class: 'bwau-shp on drawn', 'aria-pressed': 'true', tabindex: '-1', style: `--pc:${p.color}` }, h('span', { html: autoMini(spec, len) }), h('span', {}, 'Dessinée')) : null);
    // retouche au dessin
    const toDrawn = () => {
      if (spec.shape === 'drawn') return;
      const from = spec.shape;
      const q = pts();
      Object.assign(spec, { shape: 'drawn', from, points: q });
    };
    const posOf = (e) => {
      const r = lane.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * len, 1 - (e.clientY - r.top - AU_PAD) / (AU_H - 2 * AU_PAD)];
    };
    const cl01 = (v) => Math.max(0, Math.min(1, v));
    let drag = null;
    lane.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.bwau-pt');
      if (!g || (e.button !== undefined && e.button !== 0)) return;
      e.preventDefault();
      const i = +g.dataset.i;
      if (e.altKey) return delPoint(i);
      g.setPointerCapture(e.pointerId);
      drag = { i, moved: false };
    });
    lane.addEventListener('pointermove', (e) => {
      if (!drag) return;
      toDrawn();
      const q = spec.points || pts();
      const [fx, fy] = posOf(e);
      const { i } = drag;
      let x = q[i][0];
      if (i > 0 && i < q.length - 1) x = Math.min(q[i + 1][0] - 1, Math.max(q[i - 1][0] + 1, Math.round(fx / 2) * 2));
      const y = Math.round(cl01(fy) * 100) / 100;
      if (x === q[i][0] && y === q[i][1]) return;
      q[i] = [x, y];
      spec.points = q;
      drag.moved = true;
      paint();
    });
    const end = () => {
      if (!drag) return;
      const m = drag.moved;
      const i = drag.i;
      drag = null;
      if (m) commitAuto(sc, T, p.id, spec, `.bwau-ln[data-param="${p.id}"] .bwau-pt[data-i="${i}"]`);
    };
    lane.addEventListener('pointerup', end);
    lane.addEventListener('pointercancel', end);
    const delPoint = (i) => {
      const q = pts();
      if (i <= 0 || i >= q.length - 1 || q.length <= 2) return;
      toDrawn();
      spec.points = q.filter((_, k) => k !== i);
      commitAuto(sc, T, p.id, spec, `.bwau-ln[data-param="${p.id}"] .bwau-pt[data-i="${Math.max(0, i - 1)}"]`);
    };
    lane.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const g = e.target.closest('.bwau-pt');
      if (g) delPoint(+g.dataset.i);
    });
    lane.addEventListener('dblclick', (e) => {
      if (fold || e.target.closest('.bwau-pt')) return;
      const [fx, fy] = posOf(e);
      const x = Math.max(1, Math.min(len - 2, Math.round(fx)));
      const q = pts();
      if (q.some((a) => a[0] === x)) return;
      toDrawn();
      spec.points = [...q, [x, Math.round(cl01(fy) * 100) / 100]].sort((a, b) => a[0] - b[0]);
      commitAuto(sc, T, p.id, spec, `.bwau-ln[data-param="${p.id}"] .bwau-pt[data-i="${spec.points.findIndex((a) => a[0] === x)}"]`);
    });
    lane.addEventListener('keydown', (e) => {
      const g = e.target.closest('.bwau-pt');
      if (!g) return;
      const i = +g.dataset.i;
      const q = pts();
      const big = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return delPoint(i);
      }
      const dy = { ArrowUp: big, ArrowDown: -big }[e.key];
      const dx = { ArrowRight: 2, ArrowLeft: -2 }[e.key];
      if (dy === undefined && dx === undefined) return;
      e.preventDefault();
      toDrawn();
      const [x, y] = q[i];
      const nx = dx !== undefined && i > 0 && i < q.length - 1 ? Math.min(q[i + 1][0] - 1, Math.max(q[i - 1][0] + 1, x + dx)) : x;
      q[i] = [nx, Math.round(cl01(y + (dy || 0)) * 100) / 100];
      spec.points = q;
      commitAuto(sc, T, p.id, spec, `.bwau-ln[data-param="${p.id}"] .bwau-pt[data-i="${i}"]`);
    });
    const xs = h('div', { class: 'bwau-xs', 'data-xs': '' }, h('div', { class: 'bwau-in' }, lane));
    return h('section', { class: 'bwau-ln' + (fold ? ' fold' : ''), 'data-param': p.id, style: `--pc:${p.color}` }, head, chips, xs);
  }
  /** Carte « Automation » de la scène (null : aucune courbe, rien n'est affiché). `fit` : sans défilement (largeur de la carte). */
  function autoCard(sc, T, { fit = false, copy = false, grid = false } = {}) {
    const specs = autoOf(sc.sec, T);
    const params = AU().SCENE_AUTO.filter((p) => specs[p.id]);
    if (!params.length) return null;
    const bars = sc.bars;
    const ruler = h('div', { class: 'bwau-xs bwau-ruler', 'data-xs': '' }, h('div', { class: 'bwau-in' }, ...Array.from({ length: bars }, (_, b) => h('span', { style: `left:${((100 * b) / bars).toFixed(3)}%;width:${(100 / bars).toFixed(3)}%` }, String(b + 1)))));
    return h(
      'section',
      { class: 'bwp-card bw-card bwau' + (fit ? ' fit' : '') + (grid ? ' grid' : ''), id: 'bwAuto', style: `--n:${sc.bars * 16};--bars:${sc.bars}` },
      h('div', { class: 'bwp-ch' }, h('b', {}, `Automation de « ${sc.name} »`), h('span', { class: 'bh-info' }, `${bars} mesure${bars > 1 ? 's' : ''} · réglée pour cette scène seulement`),
        copy ? h('span', { class: 'spacer' }) : null,
        copy ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwauCopy', title: 'Même automation pour les autres scènes du même type (couplet et couplet 2…)', onclick: () => copyAuto(sc, T) }, 'Copier l’automation vers les scènes du même type') : null),
      ruler,
      ...params.map((p) => autoLine(sc, T, p, JSON.parse(JSON.stringify(specs[p.id])), fit)),
      h('p', { class: 'dlg-hint' }, 'Retouche : glisse un point (haut/bas et gauche/droite) · double-clic pour en ajouter · clic droit ou Alt+clic sur un point pour l’enlever.')
    );
  }
  /** Copie les courbes de la scène vers les scènes du même type (onglet Mélodie, sans bouton de copie général). */
  function copyAuto(sc, T) {
    const a = (partOf(sc.sec, T) || {}).auto;
    const to = S.wiz.res.scenes.filter((x) => x.sec !== sc.sec && kindOf(x.sec) === kindOf(sc.sec));
    to.forEach((x) => putPart(x.sec, T, { auto: a ? JSON.parse(JSON.stringify(a)) : undefined }));
    S.wiz.pmsg = to.length ? `Automation copiée vers ${to.map((x) => x.name).join(', ')}` : 'Aucune autre scène de ce type';
    renderWiz();
  }
  /** Onglet Mélodie : la grille des notes (#bwMelBoard) et les cadres de l'automation défilent ensemble (un seul écouteur, en capture). */
  function syncMelScroll() {
    const box = $('#bandWiz');
    if (!box) return;
    const xs = () => [...box.querySelectorAll('#bwAuto [data-xs]')];
    const board = $('#bwMelBoard', box);
    if (board) xs().forEach((e) => (e.scrollLeft = board.scrollLeft));
    if (box._melSync) return;
    box._melSync = true;
    let lock = false;
    box.addEventListener(
      'scroll',
      (ev) => {
        const t = ev.target;
        if (lock || !t || !t.matches || !(t.id === 'bwMelBoard' || (t.matches('[data-xs]') && t.closest('#bwAuto')))) return;
        lock = true;
        [$('#bwMelBoard', box), ...xs()].forEach((o) => o && o !== t && (o.scrollLeft = t.scrollLeft));
        lock = false;
      },
      true
    );
  }
  /** Défilement horizontal commun : le piano-roll, la règle et les courbes d'une scène bougent ensemble. */
  function syncAutoScroll(root) {
    const els = [...root.querySelectorAll('[data-xs], .bw-rscr')];
    if (els.length < 2) return;
    let lock = false;
    els.forEach((e) =>
      e.addEventListener('scroll', () => {
        if (lock) return;
        lock = true;
        els.forEach((o) => o !== e && (o.scrollLeft = e.scrollLeft));
        lock = false;
      })
    );
  }

  /* ---------- Muet / Solo (barre de piste) et volume (étape Mélodie) ---------- */
  /** La colonne ne s'entend pas : coupée, ou une autre est en solo. */
  function silenced(id) {
    return S.wiz.mute.has(id) || (S.wiz.solo.size > 0 && !S.wiz.solo.has(id));
  }
  const VOL_MIN = -30;
  const VOL_MAX = 6;
  const volDb = (id) => S.wiz.vol.get(id) || 0;
  const volText = (db) => (db <= VOL_MIN ? 'silence' : `${db > 0 ? '+' : ''}${db} dB`);
  /** Volume d'un instrument (ou de toute la batterie) en dB autour du mixage automatique ; double-clic : 0 dB. */
  function volCtl(ids, label) {
    const db = volDb(ids[0]);
    const inp = h('input', { type: 'range', class: 'bh-vol', min: VOL_MIN, max: VOL_MAX, step: 1, value: db, 'aria-label': `Volume ${label}`, title: `Volume ${label} : ${volText(db)} (double-clic : 0 dB)` });
    const set = (v) => {
      const x = Math.round(Number(v));
      ids.forEach((id) => (x ? S.wiz.vol.set(id, x) : S.wiz.vol.delete(id)));
      inp.value = x;
      inp.title = `Volume ${label} : ${volText(x)} (double-clic : 0 dB)`;
      inp.setAttribute('aria-valuetext', volText(x));
      applyListenMutes();
    };
    inp.setAttribute('aria-valuetext', volText(db));
    inp.addEventListener('input', () => set(inp.value));
    inp.addEventListener('dblclick', () => set(0));
    return inp;
  }
  /** Gain d'une colonne (multiplie le niveau du mixage automatique). */
  function volGain(id) {
    const db = volDb(id);
    return db <= VOL_MIN ? 0 : Math.pow(10, db / 20);
  }

  /* ---------- Étapes Batterie, Basse, Nappes, Arpèges : réglages par scène (S.wiz.parts) ----------
   * Même mise en page que l'étape Accords : les scènes en colonne à gauche, la scène choisie jouée en boucle.
   * Chaque choix écrit parts[section][rôle] (voir l'en-tête de js/bandsong.js). Tant qu'un rôle n'a rien, c'est le jeu de
   * l'inspiration : une première visite ne change rien. Toute modification refait la chanson (sig) et l'écoute repart.
   */
  /* Une « cible » de réglage est un instrument (voir insSteps) : parts[section].inst[id], avec repli sur le rôle tant que le type
   * est celui du rôle. Une chaîne est un rôle (parts[section][rôle]). */
  const isT = (r) => !!r && typeof r === 'object';
  const typeChanged = (T) => T.kind !== T.def;
  const ownPart = (sec, T) => {
    const pp = S.wiz.parts[sec];
    return (pp && pp.inst && pp.inst[T.key]) || null;
  };
  function partOf(sec, r) {
    if (isT(r)) {
      const pp = S.wiz.parts[sec];
      const own = ownPart(sec, r);
      const base = !typeChanged(r) && pp && pp[r.role];
      return own || base ? { ...(base || {}), ...(own || {}) } : null;
    }
    return (S.wiz.parts[sec] && S.wiz.parts[sec][r]) || null;
  }
  function mutedIn(sec, r) {
    const pp = S.wiz.parts[sec];
    if (isT(r)) return !!(ownPart(sec, r) || {}).off || (!typeChanged(r) && !!pp && (pp.off || []).includes(r.role));
    return !!(pp && (pp.off || []).includes(r));
  }
  const secOf = (sc) => (spec() && specEff().sections[sc.sec]) || {};
  /**
   * Mode de jeu du plan de l'inspiration pour cet instrument dans la scène (null : il ne joue pas). Un instrument dont le type a
   * changé prend le mode du plan pour son nouveau type, sinon le mode par défaut (comme SS.bandSong.build).
   */
  function planMode(sc, r) {
    const sec = secOf(sc);
    if (!isT(r)) return sec[r] || null;
    if (!typeChanged(r)) return (r.role === 'perc' ? sec.perc ?? sec.drums : sec[r.role]) || null;
    if (!sec[r.role]) return null;
    const valid = { bass: BASS_MODES, chords: PAD_MODES, arp: ARP_MODES }[r.kind];
    const ids = valid ? valid.map((x) => x[0]) : [];
    const plan = { bass: [sec.bass], chords: [sec.pad, sec.strings, sec.keys], arp: [sec.arp, sec.arpchord] }[r.kind] || [];
    return plan.find((m) => m && ids.includes(m)) || SS.bandSong.DEFAULT_MODE[r.kind] || null;
  }
  /** Genre d'une section (verse2 → verse) ; une reprise suit la section du modèle dont elle reprend le jeu. */
  const kindOf = (sec) => String(((specEff().sections[sec] || {}).as) || sec).replace(/\d+$/, '');
  const tidy = (sec) => !Object.keys(S.wiz.parts[sec]).length && delete S.wiz.parts[sec];
  /** Fusionne `patch` dans le réglage de la cible (undefined = enlevé) ; un réglage vide disparaît. */
  function putPart(sec, r, patch) {
    if (isT(r)) return putInstPart(sec, r.key, patch);
    const p = { ...(S.wiz.parts[sec] || {}) };
    const o = { ...(p[r] || {}), ...patch };
    Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
    if (Object.keys(o).length) p[r] = o;
    else delete p[r];
    S.wiz.parts[sec] = p;
    tidy(sec);
  }
  /** Cible muette (ou non) dans la scène. */
  function putOff(sec, r, off) {
    if (isT(r)) {
      if (!off && mutedIn(sec, r) && !(ownPart(sec, r) || {}).off) return putOff(sec, r.role, false); // coupé par le rôle
      return putInstPart(sec, r.key, { off: off ? true : undefined });
    }
    const p = { ...(S.wiz.parts[sec] || {}) };
    const l = (p.off || []).filter((x) => x !== r).concat(off ? [r] : []);
    if (l.length) p.off = l;
    else delete p.off;
    S.wiz.parts[sec] = p;
    tidy(sec);
  }
  /** Un choix est fait : on refait la chanson, et on l'entend tout de suite dans la scène (en boucle). */
  function partChanged(focus) {
    renderWiz();
    if (!L.mode) playScene(S.wiz.hscene);
    const f = focus && $(focus);
    if (f) f.focus();
  }
  /** Copie le réglage d'un instrument (et son état muet) vers les scènes du même type, ou vers toutes. */
  function copyPart(sc, T, all) {
    const src = ownPart(sc.sec, T);
    const to = S.wiz.res.scenes.filter((x) => x.sec !== sc.sec && (all || kindOf(x.sec) === kindOf(sc.sec)));
    to.forEach((x) => {
      const p = { ...(S.wiz.parts[x.sec] || {}) };
      const inst = { ...(p.inst || {}) };
      if (src) inst[T.key] = JSON.parse(JSON.stringify(src));
      else delete inst[T.key];
      if (Object.keys(inst).length) p.inst = inst;
      else delete p.inst;
      S.wiz.parts[x.sec] = p;
      tidy(x.sec);
    });
    S.wiz.pmsg = to.length ? `Copié vers ${to.map((x) => x.name).join(', ')}` : 'Aucune autre scène de ce type';
    renderWiz();
  }
  function resetPart(sc, T) {
    putPart(sc.sec, T, Object.fromEntries(Object.keys(ownPart(sc.sec, T) || {}).map((k) => [k, undefined])));
    putOff(sc.sec, T, false);
    partChanged();
  }

  /** Rythme d'une mesure en petit dessin (notes : [pas, durée, hauteur 0 grave, 1 quinte, 2 octave]). */
  function rhythmSvg(notes, soft) {
    const bars = [1, 2, 3].map((b) => `<rect x="${b * 40}" y="0" width=".6" height="22" fill="currentColor" opacity=".25"/>`).join('');
    const rects = notes.map(([s, l, v]) => `<rect x="${s * 10 + 0.5}" y="${[14, 8, 2][v]}" width="${Math.max(3, l * 10 - 1.5)}" height="6" rx="1.5" fill="currentColor"${soft ? ' opacity=".5"' : ''}/>`).join('');
    return `<svg viewBox="0 0 160 22" preserveAspectRatio="none" aria-hidden="true">${bars}${rects}</svg>`;
  }
  const every = (dt, len, lv = () => 0) => Array.from({ length: 16 / dt }, (_, i) => [i * dt, len, lv(i)]);
  const perBeat = (f) => [0, 4, 8, 12].flatMap(f);
  /** Modes de la basse (js/bandsong.js, bassEvents) : [identifiant, nom, description, dessin, doux]. */
  const BASS_MODES = [
    ['whole', 'Tenue', 'Une note par accord, tenue', [[0, 16, 0]]],
    ['half', 'Blanches', 'Deux attaques par mesure, posé', every(8, 8)],
    ['quarter', 'Noires', 'Sur chaque temps : pop, rock', every(4, 3)],
    ['8', 'Croches', 'Huit croches régulières : le moteur synthwave', every(2, 2)],
    ['gallop', 'Galop', 'Croche et deux doubles : la cavalcade 80s', perBeat((s) => [[s, 2, 0], [s + 2, 1, 0], [s + 3, 1, 0]])],
    ['offbeat', 'Contretemps', 'Entre les kicks : la basse house', every(4, 2).map(([s, l, v]) => [s + 2, l, v])],
    ['oct', 'Octaves', 'Grave / aigu en croches : disco, italo', every(2, 2, (i) => (i % 2 ? 2 : 0))],
    ['roll', 'Roulement', 'Trois doubles par temps, l’octave au milieu', perBeat((s) => [[s + 1, 1, 0], [s + 2, 1, 2], [s + 3, 1, 0]])],
    ['sync', 'Syncopée', '1, 1a, 2&, 3, 3a, 4& avec octave et quinte', [[0, 3, 0], [3, 2, 2], [6, 2, 0], [8, 3, 1], [11, 2, 2], [14, 2, 0]]],
    ['walk', 'Marche', 'Fondamentale, puis quinte à la demi-mesure', [[0, 6, 0], [8, 6, 1]]],
    ['drone', 'Drone', 'Une note tenue par accord, sans attaque marquée', [[0, 16, 0]], true],
    ['pulse8', 'Croches piquées', 'Huit croches courtes, détachées', every(2, 1)],
    ['off16', 'Après le kick', 'Deux doubles « et-a » après chaque temps : techno mélodique', perBeat((s) => [[s + 2, 1, 0], [s + 3, 1, 0]])],
    // modes ajoutés au moteur : fondamentale-quinte, arpège, tresillo, trance, doubles, octaves en doubles, reprise, funk
    ...((SS.bandSong && SS.bandSong.BASS_NEW) || []),
  ];
  /** Modes de la nappe (js/bandsong.js, chordEvents). */
  const PAD_MODES = [
    ['sustain', 'Tenue', 'L’accord tenu', [[0, 16, 1]]],
    ['swell', 'Montée douce', 'Accord tenu, entrée en douceur', [[0, 16, 1]], true],
    ['float', 'Planante', 'Accord ouvert, très doux', [[0, 16, 1]], true],
    ['pulse8', 'Croches', 'L’accord en croches', every(2, 2, () => 1)],
    ['block4', 'Blocs', 'Un accord par temps', every(4, 3, () => 1)],
    ['stabs', 'Stabs', 'Accords courts, syncopés', [[0, 2, 1], [3, 2, 1], [6, 2, 1], [10, 2, 1], [12, 2, 1]]],
    ['house', 'House', 'Accords de la house, sur les contretemps', [[0, 2, 1], [3, 2, 1], [6, 1, 1], [8, 2, 1], [11, 2, 1], [14, 2, 1]]],
    ['chop', 'Hachée', 'Petits accords sur les contretemps', [2, 6, 10, 14].map((s) => [s, 1, 1])],
    ['pluck', 'Pincée', 'Les notes de l’accord, en croches', every(2, 2, (i) => [0, 1, 2][i % 3])],
  ];
  /** Modes de l'arpège (js/bandsong.js, arpEvents). « rise » ne vient que de l'inspiration. */
  const ARP_MODES = [
    ['up16', 'Montée', 'Doubles-croches, en montant'],
    ['updown16', 'Aller-retour', 'Doubles-croches, monte et descend'],
    ['up8', 'Montée en croches', 'Plus lent, plus ouvert'],
    ['bells', 'Cloches', 'Croches aiguës qui tintent'],
    ['strobe', 'Stroboscope', 'Doubles qui oscillent autour de l’accord'],
    ['pluck16', 'Pincé', 'Doubles syncopées, très piquées'],
    ['ost16', 'Ostinato', 'Motif de huit doubles qui revient'],
    ['dotted', 'Pointé', 'Une note tous les trois pas'],
    ['rise', 'Montée de section', 'Monte vers l’aigu pendant la section'],
  ];
  const nameOf = (list, id) => (list.find((x) => x[0] === id) || [id, id])[1];

  /** « Écouter la scène » : la scène choisie en boucle (re-clic : arrêt). */
  const loopBtn = (sc) =>
    h(
      'button',
      { type: 'button', class: 'btn btn-small bh-loop', id: 'bwpLoop', 'aria-pressed': 'false', title: `Écouter « ${sc.name} » en boucle (re-clic : arrêt)`, onclick: () => listenScene(sc.id) },
      h('span', { class: 'bw-pico', html: PLAY + STOP }),
      h('span', {}, 'Écouter la scène')
    );
  /** En-tête commun : titre de la scène, retour à l'inspiration, boutons de copie. */
  function partHead(sc, role, what, all) {
    const msg = S.wiz.pmsg;
    S.wiz.pmsg = null;
    const own = !!partOf(sc.sec, role) || mutedIn(sc.sec, role);
    return h(
      'div',
      { class: 'bw-top gr-head bwc-head' },
      h('h3', {}, sc.name),
      h('span', { class: 'bh-info' }, `${sc.bars} mesures · ${what}`),
      h('span', { class: 'spacer' }),
      msg ? h('span', { class: 'bh-info bwp-msg', role: 'status' }, msg) : null,
      isT(role) ? autoButton(sc, role) : null,
      isT(role) ? loopBtn(sc) : null,
      own ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwpBack', title: 'Revenir au jeu de l’inspiration dans cette scène', onclick: () => resetPart(sc, role) }, '↺ Inspiration') : null,
      h('button', { type: 'button', class: 'btn btn-small', id: 'bwpSame', title: 'Même réglage pour les autres scènes du même type (couplet et couplet 2…)', onclick: () => copyPart(sc, role, false) }, 'Copier vers les scènes du même type'),
      all ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwpAll', onclick: () => copyPart(sc, role, true) }, 'Copier vers toutes les scènes') : null
    );
  }
  /** Contrôle à choix unique : [valeur, texte, info][]. */
  function partSeg(label, id, opts, cur, pick) {
    return h(
      'div',
      { class: 'bwp-field' },
      h('span', { class: 'bh-lbl' }, label),
      h(
        'span',
        { class: 'segmented', role: 'radiogroup', 'aria-label': label, id },
        ...opts.map(([v, t, tip]) => h('button', { type: 'button', role: 'radio', class: v === cur ? 'active' : '', 'aria-checked': String(v === cur), 'data-v': v, title: tip, onclick: () => pick(v) }, t))
      )
    );
  }
  const partCheck = (id, label, on, change, disabled) => h('label', { class: 'bwp-check' }, h('input', { type: 'checkbox', id, checked: on, disabled, onchange: (e) => change(e.target.checked) }), label);
  /** « Joue dans cette scène » (rôle muet via `off`) ; allumer un rôle absent du plan lui donne le mode `def`. */
  const slotOf = (r) => (isT(r) ? KIND_SLOT[r.kind] : r);
  function playBox(sc, role, def) {
    const has = !!((partOf(sc.sec, role) || {}).mode || (partOf(sc.sec, role) || {}).one || (partOf(sc.sec, role) || {}).lead || planMode(sc, role));
    return partCheck(`bwp-on-${slotOf(role)}`, 'Joue dans cette scène', has && !mutedIn(sc.sec, role), (on) => {
      putOff(sc.sec, role, !on);
      if (on && !has) putPart(sc.sec, role, { mode: def });
      partChanged();
    });
  }
  /** Cartes de modes (basse, nappes) : celui de l'inspiration est choisi tant qu'on n'a rien réglé. */
  function modeCards(sc, role, list, color, after) {
    const insp = planMode(sc, role);
    const cur = (partOf(sc.sec, role) || {}).mode || insp;
    return h(
      'div',
      { class: 'bwp-modes', role: 'radiogroup', 'aria-label': 'Mode de jeu', style: `--c:${color}` },
      ...list.map(([id, name, desc, notes, soft]) => {
        const on = id === cur && !mutedIn(sc.sec, role);
        const pick = () => (putOff(sc.sec, role, false), putPart(sc.sec, role, { mode: id === insp ? undefined : id }), after && after(), partChanged(`.bwp-mode[data-v="${id}"]`));
        return h(
          'button',
          { type: 'button', role: 'radio', class: 'bwp-mode' + (on ? ' on' : ''), 'data-v': id, 'aria-checked': String(on), title: desc, onclick: pick },
          h('b', {}, name, id === insp ? h('em', {}, 'Inspiration') : null),
          h('span', { class: 'bwp-rhy', html: rhythmSvg(notes, soft) }),
          h('small', {}, desc)
        );
      })
    );
  }
  /** Change le type d'un instrument : ses réglages par scène propres à l'ancien type sont oubliés (l'arrêt « muet » et la mélodie générée restent). */
  function changeKind(T, kind, after) {
    if (kind === T.kind || !setKind(T.id, kind)) return;
    Object.keys(S.wiz.parts).forEach((sec) => {
      const own = ownPart(sec, T);
      if (own) putInstPart(sec, T.key, Object.fromEntries(Object.keys(own).filter((k) => k !== 'off' && k !== 'lead' && k !== 'auto').map((k) => [k, undefined])));
    });
    if (T.kind === 'melody') leaveMel();
    after ? after() : partChanged();
  }
  /** Réglage d'un instrument dans une scène, en une ligne pour la colonne des scènes et le fil des étapes. */
  function instSub(T, x) {
    if (mutedIn(x.sec, T)) return 'muette';
    const k = T.kind === 'drums' ? (T.kit ? drumsSub : drumsLiteSub) : { bass: bassSub, chords: padSub, arp: arpSub, melody: melSub, orch: orchSub }[T.kind];
    return k(x, T);
  }
  /** Étape d'un instrument : types, barre de piste, scènes à gauche, éditeur du type choisi (réglages de cet instrument). */
  function renderIns(T) {
    if (T.kind === 'melody') return renderHarmony(T);
    const { res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const sc = curScene(res);
    const body = { drums: () => (T.kit ? drumsBody(sc, T) : drumsLiteBody(sc, T)), bass: () => bassBody(sc, T), chords: () => padBody(sc, T), arp: () => arpBody(sc, T), orch: () => orchBody(sc, T) }[T.kind]();
    const prev = $('#bwParts');
    const top = prev && prev.dataset.ins === T.id && prev.dataset.kind === T.kind ? prev.scrollTop : 0; // un clic bas dans la liste ne la remonte pas
    const content = h('div', { class: 'bwc bwp', id: 'bwParts', 'data-kind': T.kind, 'data-ins': T.id, style: `--c:${KIND_COLOR[T.kind]}` }, ...body);
    splitView(sceneNav(res, sc, (x) => withAutoBadge(T.kind === 'bass' ? bassSceneSub(x, T) : instSub(T, x), x, T)), trackbar(T), content);
    content.scrollTop = top;
    syncAutoScroll(content);
  }

  /* --- Orchestre (étape Orchestration) : densité et pupitres par scène, carte des registres, qui joue quoi et pourquoi ---
   * SS.bandSong.build écrit chaque pupitre avec SS.orchestra.orchestrate et laisse son rapport dans sc.orch[musicien] ;
   * réglages de la scène : parts[sec].inst[musicien].orch = { level: light | mid | full, off: [pupitres coupés] }. */
  const OR = () => SS.orchestra;
  const ORCH_ROLE_C = { melody: '#9b5cff', counter: '#13c2a3', harmony: '#4f6bff', bass: '#3fcf3f', pad: '#c9a227', tacet: '#55555f' };
  const orchSet = (sc, T) => (partOf(sc.sec, T) || {}).orch || {};
  function orchSub(x, T) {
    if (mutedIn(x.sec, T)) return 'muet';
    const r = x.orch && x.orch[T.musician];
    if (!r) return '';
    const L = OR().LEVELS.find((l) => l.id === r.level);
    const n = Object.values(r.lines).filter((l) => l.role !== 'tacet').length;
    return `${L ? L.label : r.level} · ${n} pupitre${n > 1 ? 's' : ''}`;
  }
  function orchEdit(sc, T, patch, focus) {
    const o = { ...orchSet(sc, T), ...patch };
    Object.keys(o).forEach((k) => (o[k] === undefined || (Array.isArray(o[k]) && !o[k].length)) && delete o[k]);
    putPart(sc.sec, T, { orch: Object.keys(o).length ? o : undefined });
    partChanged(focus);
  }
  function orchBody(sc, T) {
    const r = sc.orch && sc.orch[T.musician];
    const muted = mutedIn(sc.sec, T);
    const own = orchSet(sc, T);
    const ens = ensOf(musState()[T.musician]);
    const head = partHead(sc, T, `orchestre · ${ens.label.toLowerCase()}`, true);
    const play = partCheck('bwp-on-orch', 'Joue dans cette scène', !muted, (on) => (putOff(sc.sec, T, !on), partChanged()));
    if (muted || !r) return [head, h('div', { class: 'bwp-row' }, play), h('p', { class: 'dlg-hint', id: 'bwOrchMuted' }, 'L’orchestre se tait dans cette scène.')];
    const lvl = partSeg('Densité', 'bwOrchLevel', [['auto', `Auto · ${OR().LEVELS.find((l) => l.id === r.level).label}`, 'D’après l’énergie de la scène'], ...OR().LEVELS.map((l) => [l.id, l.label, l.text])], own.level || 'auto', (v) => orchEdit(sc, T, { level: v === 'auto' ? undefined : v }, `#bwOrchLevel [data-v="${v}"]`));
    const off = own.off || [];
    const chips = h(
      'div',
      { class: 'bwp-field' },
      h('span', { class: 'bh-lbl' }, 'Pupitres'),
      h('span', { class: 'bwor-chips', id: 'bwOrchParts' }, ...ens.parts.map((id) => {
        const on = !off.includes(id);
        return h('button', { type: 'button', class: 'bwor-chip' + (on ? ' on' : ''), 'data-part': id, 'aria-pressed': String(on), title: on ? 'Couper ce pupitre dans la scène' : 'Faire jouer ce pupitre', onclick: () => orchEdit(sc, T, { off: on ? [...off, id] : off.filter((x) => x !== id) }, `#bwOrchParts [data-part="${id}"]`) }, OR().PART[id].short);
      }))
    );
    // carte des registres : tessiture, zone confortable, notes jouées dans la scène
    const LO = 26;
    const HI = 100;
    const x = (m) => `${(((m - LO) / (HI - LO)) * 100).toFixed(2)}%`;
    const w = (a, b) => `${(((b - a) / (HI - LO)) * 100).toFixed(2)}%`;
    const axis = h('div', { class: 'bwor-axis' }, ...[36, 48, 60, 72, 84, 96].map((m) => h('span', { style: `left:${x(m)}` }, OR().midiName(m))));
    const rows = ens.parts.map((id) => {
      const p = OR().PART[id];
      const L = r.lines[id];
      return h(
        'div',
        { class: 'bwor-row', 'data-part': id },
        h('span', { class: 'bwor-name' }, p.short, h('small', { style: `color:${ORCH_ROLE_C[L.role]}` }, OR().ROLE_LABEL[L.role].toLowerCase())),
        h(
          'span',
          { class: 'bwor-lane' },
          h('i', { class: 'bwor-tess', style: `left:${x(p.lo)};width:${w(p.lo, p.hi)}` }),
          h('i', { class: 'bwor-comf', style: `left:${x(p.clo)};width:${w(p.clo, p.chi)}` }),
          L.lo !== null ? h('i', { class: 'bwor-part', style: `left:${x(L.lo)};width:max(4px, ${w(L.lo, L.hi)});background:${ORCH_ROLE_C[L.role]}` }) : null
        )
      );
    });
    const map = h(
      'div',
      { class: 'bwar-card bwor-map', id: 'bwOrchMap' },
      h('div', { class: 'bwar-head' }, h('b', {}, 'Carte des registres'), h('span', { class: 'bh-info' }, 'tessiture · zone confortable · notes jouées')),
      axis,
      ...rows,
      h('div', { class: 'bwhz-legend' }, ...['melody', 'counter', 'harmony', 'bass', 'pad'].map((k) => h('span', {}, h('i', { class: 'bwhz-sw', style: `background:${ORCH_ROLE_C[k]}` }), OR().ROLE_LABEL[k])))
    );
    const table = h(
      'div',
      { class: 'bwar-card bwor-who', id: 'bwOrchWho' },
      h('div', { class: 'bwar-head' }, h('b', {}, 'Qui joue quoi'), h('span', { class: 'bh-info' }, OR().LEVELS.find((l) => l.id === r.level).text)),
      h(
        'table',
        { class: 'bwor-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Pupitre'), h('th', {}, 'Rôle'), h('th', {}, 'Registre'), h('th', {}, 'Pourquoi'))),
        h('tbody', {}, ...ens.parts.map((id) => {
          const L = r.lines[id];
          return h('tr', { 'data-part': id, class: L.role === 'tacet' ? 'tacet' : '' }, h('td', {}, OR().PART[id].label), h('td', { style: `color:${ORCH_ROLE_C[L.role]}` }, OR().ROLE_LABEL[L.role]), h('td', {}, L.lo !== null ? `${OR().midiName(L.lo)} – ${OR().midiName(L.hi)}` : '—'), h('td', {}, L.why));
        }))
      )
    );
    const items = h(
      'div',
      { class: 'bwar-card', id: 'bwOrchItems' },
      h('div', { class: 'bwar-head' }, h('b', {}, 'À voir'), h('span', { class: 'bh-info' }, `${r.items.filter((i) => i.kind === 'warn').length} point(s)`)),
      h('ul', { class: 'hm-checks2' }, ...r.items.map((i) => h('li', { class: 'k-' + i.kind }, h('span', { class: 'ck' }, CK_ICON[i.kind] || '•'), h('div', {}, i.text, i.hint ? h('small', {}, i.hint) : null))))
    );
    return [head, h('div', { class: 'bwp-row bwor-ctl' }, play, lvl, chips), h('div', { class: 'bwor-cols' }, map, h('div', { class: 'bwor-side' }, items)), table];
  }

  /* --- Batterie : bibliothèque de motifs, grille des éléments du kit (1, 2 ou 4 mesures), fills, crash, montée --- */
  const LANES = [['K', 'Grosse caisse'], ['S', 'Caisse claire'], ['C', 'Clap'], ['H', 'Charleston'], ['O', 'Charl. ouvert']]; // pistes des motifs (miniatures)
  const E16 = '-'.repeat(16);
  const NEXT_VEL = { '-': 'x', x: 'o', o: '.', '.': '-' }; // case : éteinte → fort → moyen → léger → éteinte
  const velChar = (v) => (v >= 0.85 ? 'x' : v >= 0.6 ? 'o' : v > 0 ? '.' : '-');
  /** Style de la bibliothèque de motifs (celui du modèle, sinon synthwave). */
  const drumStyle = () => (SS.DRUM_PATTERNS[S.styleId] ? S.styleId : 'synthwave');
  /** Nuance de la scène : 1 calme (intro, outro, break), 3 intense (refrain, drop, sommet), 2 sinon. */
  const secEnergy = (sec) => {
    const k = kindOf(sec);
    return /^(intro|outro|break)/.test(k) ? 1 : /^(build|pre|bridge)/.test(k) ? 2 : /^(chorus|drop|peak)/.test(k) ? 3 : 2;
  };
  const patOf = (sec, T) => {
    const d = partOf(sec, T);
    return d && d.pattern ? SS.drumPattern(d.style || drumStyle(), d.pattern) : null;
  };
  /** Pistes K S C H O de la première mesure, comme le plan de l'inspiration les joue (aucun motif choisi). */
  function inspLanes(sc, cols) {
    const snd = { K: ['bd'], S: ['sd'], C: ['cp'], H: ['hh'], O: ['oh', 'rd'] };
    const out = {};
    LANES.forEach(([k]) => {
      const cs = cols.filter((c) => snd[k].includes(c.o.band.key.split(':')[1]));
      out[k] = Array.from({ length: 16 }, (_, s) => velChar(Math.max(0, ...cs.map((c) => ((sc.data[c.id] || {}).steps || [])[s] || 0)))).join('');
    });
    return out;
  }

  /* Grille : une ligne par élément coché du kit (T.cols). Chaque ligne est une piste de edits (K S C H O pour grosse caisse, caisse claire, clap,
   * charleston, charleston ouvert ; l'identifiant du son pour les autres : rd, rim, cr, toms, perc…) de 16, 32 ou 64 pas, avec ses ratchets
   * (edits.rat) et ses conditions (edits.cond). Tant qu'on n'a rien touché, la ligne montre ce qui joue (motif choisi, sinon plan de l'inspiration) ;
   * le premier geste écrit toutes les lignes dans edits (format décrit dans js/bandsong.js). */
  const LANE_COLOR = { K: '#ff5c93', S: '#ffb347', C: '#f2d64b', H: '#5ec4e8', O: '#7ee2a8', rd: '#4fd1c5', rim: '#c792ea', cr: '#ff8a65', ht: '#f48fb1', mt: '#f48fb1', lt: '#f48fb1', perc: '#f08a00' };
  const VEL_CLS = { x: 'v1', o: 'v2', '.': 'v3' };
  const VEL_NAME = { x: 'fort', o: 'moyen', '.': 'léger' };
  const COND_LIST = [['', '100 %'], ['p75', '75 %'], ['p50', '50 %'], ['p25', '25 %'], ['1:2', '1:2'], ['2:2', '2:2']];
  let dScroll = 0; // défilement horizontal de la grille, gardé d'un rendu à l'autre
  const norm = (str, n) => String(str || '').padEnd(n, '-').slice(0, n);
  /** Lignes de la grille : un élément du kit chacune (deux colonnes du même son ne font qu'une ligne). */
  function kitLanes(T) {
    const seen = new Set();
    return T.cols
      .map((c) => {
        const snd = c.o.band.key.split(':')[1] || c.o.sound;
        const key = SS.bandSong.laneKey(snd);
        return { id: c.id, snd, key, name: c.o.name || snd, color: LANE_COLOR[key] || '#9aa5b1' };
      })
      .filter((l) => !seen.has(l.key) && seen.add(l.key));
  }
  /** Piste d'un motif (ou d'anciennes edits) qui joue ce son, comme patternSteps ; null : le motif ne le pilote pas. */
  function patLane(L, snd) {
    if (snd === 'bd') return L.K || '';
    if (snd === 'sd') return L.S || '';
    if (snd === 'cp') return /[xo.]/.test(L.C || '') ? L.C : L.S || '';
    if (snd === 'hh') return L.H || '';
    if (snd === 'oh' || snd === 'rd') return L.O || '';
    return null;
  }
  /** La grille de la scène : { bars, lanes, rat, cond, kit } (édition en cours, sinon le motif choisi, sinon le jeu de l'inspiration). */
  function drumGridOf(sc, T) {
    const d = partOf(sc.sec, T) || {};
    const ed = d.edits && typeof d.edits === 'object' ? d.edits : null;
    const grid = !!(ed && ed.bars);
    const bars = grid && [1, 2, 4].includes(ed.bars) ? ed.bars : 1;
    const n = 16 * bars;
    const pat = patOf(sc.sec, T);
    const kit = kitLanes(T);
    const lanes = {};
    const rat = {};
    const cond = {};
    kit.forEach((l) => {
      rat[l.key] = {};
      cond[l.key] = {};
      if (grid && typeof ed[l.key] === 'string') {
        lanes[l.key] = norm(ed[l.key], n);
        Object.assign(rat[l.key], (ed.rat || {})[l.key]);
        Object.assign(cond[l.key], (ed.cond || {})[l.key]);
        return;
      }
      const src = ed || (pat && pat.lanes);
      let str = src ? patLane(src, l.snd) : null;
      const r1 = {};
      const c1 = {};
      if (str == null) {
        const dd = sc.data[l.id] || {};
        str = Array.from({ length: 16 }, (_, s) => velChar((dd.steps || [])[s] || 0)).join('');
        for (let s = 0; s < 16; s++) {
          if (dd.rat && dd.rat[s] > 1) r1[s] = dd.rat[s];
          if (dd.cond && dd.cond[s]) c1[s] = dd.cond[s];
        }
      }
      lanes[l.key] = norm(norm(str, 16).repeat(bars), n);
      for (let q = 0; q < bars; q++) {
        Object.keys(r1).forEach((s) => (rat[l.key][q * 16 + +s] = r1[s]));
        Object.keys(c1).forEach((s) => (cond[l.key][q * 16 + +s] = c1[s]));
      }
    });
    return { bars, lanes, rat, cond, kit };
  }
  /** Écrit la grille dans parts[section].drums.edits (ratchets et conditions seulement sur les cases allumées). */
  function putDrumGrid(sc, T, g) {
    const n = 16 * g.bars;
    const edits = { bars: g.bars };
    const rat = {};
    const cond = {};
    g.kit.forEach((l) => {
      edits[l.key] = norm(g.lanes[l.key], n);
      const keep = (m) => Object.fromEntries(Object.entries(m[l.key] || {}).filter(([s, v]) => v && +s < n && edits[l.key][s] !== '-'));
      const r = keep(g.rat);
      const c = keep(g.cond);
      if (Object.keys(r).length) rat[l.key] = r;
      if (Object.keys(c).length) cond[l.key] = c;
    });
    if (Object.keys(rat).length) edits.rat = rat;
    if (Object.keys(cond).length) edits.cond = cond;
    putPart(sc.sec, T, { edits });
  }
  /** Retouche la grille (fn reçoit la copie de travail), l'écrit, refait la chanson et l'entend. */
  function editDrumGrid(sc, T, fn, focus) {
    const g = drumGridOf(sc, T);
    fn(g);
    putDrumGrid(sc, T, g);
    keepScroll();
    partChanged(focus);
  }
  const keepScroll = () => {
    const sc = $('.bwd-scroll');
    if (sc) dScroll = sc.scrollLeft;
  };
  const setChar = (g, key, s, ch) => (g.lanes[key] = g.lanes[key].slice(0, s) + ch + g.lanes[key].slice(s + 1));
  /** Longueur du motif : 1, 2 ou 4 mesures ; plus long, la grille est répétée ; plus court, elle est coupée. */
  function setLength(sc, T, bars) {
    editDrumGrid(sc, T, (g) => {
      const n = 16 * bars;
      const old = 16 * g.bars;
      g.kit.forEach((l) => {
        const base = g.lanes[l.key].slice(0, old);
        g.lanes[l.key] = norm(base.repeat(Math.ceil(n / old)), n);
        ['rat', 'cond'].forEach((m) => {
          const src = g[m][l.key] || {};
          const out = {};
          for (let s = 0; s < n; s++) if (src[s % old] != null && (s < old || bars > g.bars)) out[s] = src[s % old];
          g[m][l.key] = out;
        });
      });
      g.bars = bars;
    });
  }
  /** Ouvre (ou ferme, avec null) la fenêtre d'options d'une case. */
  function openPop(sel) {
    S.wiz.dsel = sel;
    keepScroll();
    renderWiz();
    const f = sel ? $('.bwd-pop [data-v].active') || $('.bwd-pop button') : null;
    if (f) f.focus();
  }
  function closePop(refocus) {
    const sel = S.wiz.dsel;
    S.wiz.dsel = null;
    keepScroll();
    renderWiz();
    const c = refocus && sel && $(`.bwd-sc-${sel.scope} .bwp-cell[data-l="${sel.key}"][data-s="${sel.s}"]`);
    if (c) c.focus();
  }
  /**
   * Grille d'une ou plusieurs mesures : o = { lanes: [{ key, name, color }], data: { piste: texte }, rat, cond, bars, scope, sel,
   * cycle(key, s), pop(key, s), label(key) }. Les pas sont groupés par temps (4) et par mesure ; la ligne du haut numérote les temps.
   */
  function gridView(o) {
    const n = o.bars * 16;
    const row = (cls, head, cell) =>
      h(
        'div',
        { class: 'bwd-row ' + cls },
        head,
        h('div', { class: 'bwd-cells' }, ...Array.from({ length: o.bars }, (_, b) => h('div', { class: 'bwd-bar' }, ...[0, 1, 2, 3].map((q) => h('div', { class: 'bwd-beat' }, ...[0, 1, 2, 3].map((i) => cell(b * 16 + q * 4 + i, b, q, i)))))))
      );
    const barRow = h('div', { class: 'bwd-row bwd-barh', 'aria-hidden': 'true' }, h('span', { class: 'bwd-ln' }), h('div', { class: 'bwd-cells' }, ...Array.from({ length: o.bars }, (_, b) => h('div', { class: 'bwd-bar' }, o.barName ? o.barName(b) : `Mesure ${b + 1}`))));
    const beatRow = row('bwd-beatrow', h('span', { class: 'bwd-ln' }), (s, b, q, i) => h('span', { class: 'bwd-bt' + (i === 0 ? ' one' : '') }, i === 0 ? String(q + 1) : ''));
    const lanes = o.lanes.map((l) =>
      row('', h('div', { class: 'bwd-ln ' + l.key, style: `--lc:${l.color}`, title: l.name }, h('i'), h('span', {}, l.name)), (s, b, q, i) => {
        const c = (o.data[l.key] || '')[s] || '-';
        const rt = (o.rat[l.key] || {})[s];
        const cd = (o.cond[l.key] || {})[s];
        const sel = o.sel && o.sel.key === l.key && o.sel.s === s;
        const state = c === '-' ? 'vide' : VEL_NAME[c] + (rt > 1 ? `, répété ${rt} fois` : '') + (cd ? `, condition ${SS.condLabel(cd)}` : '');
        let press = null; // appui long (tactile) : ouvre les options, le clic qui suit ne fait rien
        const stop = () => press && (clearTimeout(press), (press = null));
        const btn = h(
          'button',
          {
            type: 'button',
            class: `bwp-cell bwd-c ${l.key}` + (c !== '-' ? ' ' + VEL_CLS[c] : '') + (sel ? ' csel' : ''),
            'data-l': l.key,
            'data-s': s,
            style: `--lc:${l.color}`,
            tabindex: s === 0 && l === o.lanes[0] ? '0' : '-1',
            'aria-label': `${l.name}, mesure ${b + 1}, temps ${q + 1}, pas ${i + 1} : ${state}`,
            'aria-pressed': String(c !== '-'),
            'aria-haspopup': 'dialog',
            title: 'Clic : fort, moyen, léger, éteint · clic droit ou appui long : options de la case',
            onclick: (e) => {
              if (btn._lp) return void (btn._lp = false);
              o.cycle(l.key, s);
            },
            oncontextmenu: (e) => (e.preventDefault(), o.pop(l.key, s)),
            onpointerdown: (e) => {
              if (e.pointerType === 'mouse') return;
              btn._lp = false;
              press = setTimeout(() => ((btn._lp = true), (press = null), o.pop(l.key, s)), 520);
            },
            onpointerup: stop,
            onpointerleave: stop,
            onpointercancel: stop,
            onfocus: () => {
              if (o.root) o.root.querySelectorAll('.bwp-cell[tabindex="0"]').forEach((x) => x !== btn && x.setAttribute('tabindex', '-1'));
              btn.setAttribute('tabindex', '0');
            },
            onkeydown: (e) => {
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) return e.preventDefault(), o.pop(l.key, s);
              if (e.key === 'Escape' && S.wiz.dsel) return e.preventDefault(), closePop(true);
              const di = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
              if (!di) return;
              e.preventDefault();
              const li = o.lanes.indexOf(l) + di[0];
              const nx = o.lanes[li] && $(`.bwd-sc-${o.scope} .bwp-cell[data-l="${o.lanes[li].key}"][data-s="${s + di[1]}"]`);
              if (nx) nx.focus();
            },
          },
          h('i', { class: 'f' }),
          rt > 1 ? h('span', { class: 'rt' }, '×' + rt) : null,
          cd ? h('span', { class: 'pr' }, SS.condMark(cd)) : null
        );
        return btn;
      })
    );
    const inner = h('div', { class: 'bwd-in', style: `--n:${n}` }, barRow, beatRow, ...lanes);
    const sc = h('div', { class: `bwd-scroll bwd-sc-${o.scope}`, role: 'group', 'aria-label': o.aria }, inner);
    o.root = sc;
    return sc;
  }
  /** Fenêtre d'options d'une case : vélocité, répétitions (ratchet), probabilité ou condition, effacer. */
  function drumPop(o) {
    const seg = (label, id, opts, cur, pick) =>
      h(
        'div',
        { class: 'f2' },
        h('span', { class: 'bh-lbl' }, label),
        h('span', { class: 'segmented', role: 'radiogroup', 'aria-label': label, id }, ...opts.map(([v, t]) => h('button', { type: 'button', role: 'radio', class: String(v) === String(cur) ? 'active' : '', 'aria-checked': String(String(v) === String(cur)), 'data-v': v, onclick: () => pick(v) }, t)))
      );
    return h(
      'div',
      { class: 'bwd-pop', role: 'dialog', 'aria-label': `Options de la case : ${o.name}`, onkeydown: (e) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), closePop(true)) },
      h('h4', {}, h('b', {}, o.name), h('span', {}, o.where)),
      seg('Vélocité', 'bwdVel', [['x', 'Fort'], ['o', 'Moyen'], ['.', 'Léger']], o.vel === '-' ? '' : o.vel, o.setVel),
      seg('Répétitions (ratchet)', 'bwdRat', [1, 2, 3, 4].map((v) => [v, '×' + v]), o.rat || 1, o.setRat),
      seg('Probabilité', 'bwdCond', COND_LIST, o.cond || '', o.setCond),
      h('div', { class: 'bwd-popbtns' }, h('button', { type: 'button', class: 'btn btn-small', id: 'bwdClear', onclick: o.clear }, 'Effacer la case'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-small', id: 'bwdClose', onclick: () => closePop(true) }, 'Fermer'))
    );
  }
  /** Place la fenêtre d'options sous la case (dans la carte, sans être coupée par le défilement de la grille). */
  function placePop(wrap) {
    const pop = $('.bwd-pop', wrap);
    const sel = S.wiz.dsel;
    const cell = pop && sel && $(`.bwd-sc-${sel.scope} .bwp-cell[data-l="${sel.key}"][data-s="${sel.s}"]`, wrap);
    if (!cell) return;
    const w = wrap.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const pw = pop.offsetWidth || 290;
    const left = Math.max(6, Math.min(w.width - pw - 6, c.left - w.left + c.width / 2 - pw / 2));
    pop.style.left = left + 'px';
    // sous la case ; au-dessus quand il n'y a pas la place en bas de l'écran
    let sp = wrap.parentElement; // le plus proche parent qui défile : sa bordure basse limite ce qu'on voit
    while (sp && sp !== document.body && sp.scrollHeight <= sp.clientHeight + 1) sp = sp.parentElement;
    const area = (sp || document.body).getBoundingClientRect();
    const up = c.bottom + pop.offsetHeight + 16 > area.bottom && c.top - pop.offsetHeight - 16 > area.top;
    pop.classList.toggle('up', up);
    pop.style.top = (up ? c.top - w.top - pop.offsetHeight - 8 : c.bottom - w.top + 8) + 'px';
    pop.scrollIntoView({ block: 'nearest' }); // ni dessus ni dessous sans défiler : on fait défiler jusqu'à elle
    pop.style.setProperty('--ax', Math.max(14, Math.min(pw - 14, c.left - w.left + c.width / 2 - left)) + 'px');
  }
  /** Réglage du groove de la chanson : swing des doubles-croches et humanisation (project.groove, valable pour toute la chanson). */
  const grooveVals = () => ({ swing: 0, human: 15, ...((S.wiz && S.wiz.groove) || {}) });
  function grooveOf() {
    const g = grooveVals();
    return { res: g.swing > 0 ? 16 : 0, swing: 0.5 + (0.25 * g.swing) / 100, human: g.human / 100 };
  }
  function grooveSliders() {
    const g = grooveVals();
    const one = (id, label, key, max) => {
      const out = h('output', { class: 'bwd-val', for: id }, `${g[key]} %`);
      const inp = h('input', {
        type: 'range', id, min: 0, max, step: 1, value: g[key], 'aria-label': `${label}, pour toute la chanson`,
        oninput: () => {
          S.wiz.groove = { ...grooveVals(), [key]: +inp.value };
          out.textContent = `${inp.value} %`;
          if (L.proj) L.proj.groove = { ...L.proj.groove, ...grooveOf() }; // s'entend tout de suite, sans refaire la chanson
        },
      });
      return h('label', { class: 'bwd-slider' }, h('span', {}, label), inp, out);
    };
    return h('div', { class: 'bwd-groove', title: 'Le swing et l’humanisation valent pour toute la chanson (project.groove), pas pour cette scène seule' }, one('bwdSwing', 'Swing', 'swing', 100), one('bwdHuman', 'Humanisation', 'human', 100), h('small', { class: 'bwd-hint' }, 'pour toute la chanson'));
  }
  const barWhere = (b, q, i) => `Mesure ${b + 1} · temps ${q + 1} · pas ${i + 1}`;

  function drumsSub(x, T) {
    const d = partOf(x.sec, T);
    const p = patOf(x.sec, T);
    return (p ? p.name : d && d.edits ? 'Motif perso' : 'Inspiration') + (d && d.edits && p ? ' · modifié' : '') + (d && d.edits && d.edits.bars > 1 ? ` · ${d.edits.bars} mes.` : '') + (d && d.build ? ' · montée réglée' : '') + (d && d.fill && d.fill !== 'off' ? ' · fill' : '');
  }
  /** Mesure avec fill : celui choisi, sinon le roulement de fin de section du plan (sans motif). */
  function fillBar(sc, b, T) {
    const d = partOf(sc.sec, T) || {};
    const sec = secOf(sc);
    const f = d.fill != null ? d.fill : d.pattern || d.edits ? 'off' : sec.fill !== false && sec.drums && sec.drums !== 'off' ? 'end' : 'off';
    return f === 'end' ? b === sc.bars - 1 : f === '4' ? b % 4 === 3 : f === '8' ? b % 8 === 7 : false;
  }
  const miniLanes = (lanes) => `<span class="bwp-mini">${LANES.map(([k]) => Array.from({ length: 16 }, (_, s) => `<i class="${k}${((lanes[k] || E16)[s] || '-') !== '-' ? ' v' : ''}"></i>`).join('')).join('')}</span>`;
  function pickPattern(sc, T, p) {
    putPart(sc.sec, T, p ? { style: drumStyle(), pattern: p.id, edits: undefined } : { style: undefined, pattern: undefined, edits: undefined });
    partChanged(`.bwp-pat[data-id="${p ? p.id : ''}"]`);
  }
  /** Clic sur une case de la grille : fort, moyen, léger, éteint. */
  function cycleCell(sc, T, k, s) {
    editDrumGrid(sc, T, (g) => setChar(g, k, s, NEXT_VEL[g.lanes[k][s]] || 'x'), `.bwd-sc-main .bwp-cell[data-l="${k}"][data-s="${s}"]`);
  }
  /** Options d'une case de la grille de la scène. */
  function cellPop(sc, T, g, sel) {
    const l = g.kit.find((x) => x.key === sel.key);
    if (!l) return null;
    const s = sel.s;
    const ch = g.lanes[l.key][s] || '-';
    const act = (fn) => (v) => editDrumGrid(sc, T, (gg) => fn(gg, v), `.bwd-pop [data-v="${v}"]`);
    const alive = (gg) => gg.lanes[l.key][s] === '-' && setChar(gg, l.key, s, 'o'); // une option posée sur une case éteinte l'allume (moyen)
    return drumPop({
      name: l.name,
      where: barWhere(Math.floor(s / 16), Math.floor((s % 16) / 4), s % 4),
      vel: ch,
      rat: (g.rat[l.key] || {})[s],
      cond: (g.cond[l.key] || {})[s],
      setVel: act((gg, v) => setChar(gg, l.key, s, v)),
      setRat: act((gg, v) => (alive(gg), (gg.rat[l.key] = { ...gg.rat[l.key], [s]: +v > 1 ? +v : undefined }))),
      setCond: act((gg, v) => (alive(gg), (gg.cond[l.key] = { ...gg.cond[l.key], [s]: v || undefined }))),
      clear: () => editDrumGrid(sc, T, (gg) => setChar(gg, l.key, s, '-'), '#bwdClose'),
    });
  }

  /* --- Montée : progression du roulement, mesure par mesure --- */
  const BP = () => SS.bandSong;
  const isBuild = (sc) => secOf(sc).drums === 'build';
  /** Sons du kit (hors percussionniste) : le roulement est joué par la caisse claire, sinon le clap. */
  const kitSnds = (T) => new Set(kitLanes(T).map((l) => l.snd));
  /** Niveaux de roulement de la scène telle qu'elle joue aujourd'hui (sans progression réglée) : d'après les coups de la caisse claire. */
  function planLevels(sc, T) {
    const roller = BP().rollerOf(kitSnds(T));
    const col = T.cols.find((c) => c.o.band.key.split(':')[1] === roller);
    const dd = (col && sc.data[col.id]) || { steps: [] };
    return Array.from({ length: sc.bars }, (_, b) => {
      let k = 0;
      for (let s = 0; s < 16; s++) if ((dd.steps || [])[b * 16 + s] > 0) k += (dd.rat && dd.rat[b * 16 + s]) || 1;
      return k <= 6 ? 1 : k <= 12 ? 2 : k <= 20 ? 3 : 4;
    });
  }
  const buildOf = (sc, T) => (partOf(sc.sec, T) || {}).build || null;
  const levelsOf = (sc, T) => (buildOf(sc, T) ? BP().progLevels(buildOf(sc, T), sc.bars) : planLevels(sc, T));
  const curBar = (sc) => Math.max(0, Math.min(sc.bars - 1, S.wiz.bsel && S.wiz.bsel.sec === sc.sec ? S.wiz.bsel.b : Math.floor(sc.bars * 0.75)));
  /** Règle la progression (patch fusionné ; sans progression, on part du roulement actuel). */
  function putBuild(sc, T, patch, focus) {
    const cur = buildOf(sc, T) || { preset: 'custom', levels: planLevels(sc, T), cresc: 0.6 };
    const nb = { ...cur, ...patch };
    Object.keys(nb).forEach((k) => nb[k] === undefined && delete nb[k]);
    putPart(sc.sec, T, { build: nb });
    keepScroll();
    partChanged(focus);
  }
  /** Les quatre lignes de la mesure b : { lanes, rat, cond } (la progression, sinon ce que le plan joue). */
  function barOf(sc, T, b) {
    const bp = buildOf(sc, T);
    const snds = kitSnds(T);
    const kit = kitLanes(T);
    const roller = BP().rollerOf(snds);
    if (bp) return BP().rollBar(bp, sc.bars, b, roller, snds);
    const out = { lanes: {}, rat: {}, cond: {} };
    ['sd', 'cp', 'hh', 'cr'].forEach((snd) => {
      const l = kit.find((x) => x.snd === snd);
      if (!l) return;
      const dd = sc.data[l.id] || {};
      out.lanes[snd] = Array.from({ length: 16 }, (_, s) => velChar((dd.steps || [])[b * 16 + s] || 0)).join('');
      out.rat[snd] = {};
      out.cond[snd] = {};
      for (let s = 0; s < 16; s++) {
        if (dd.rat && dd.rat[b * 16 + s] > 1) out.rat[snd][s] = dd.rat[b * 16 + s];
        if (dd.cond && dd.cond[b * 16 + s]) out.cond[snd][s] = dd.cond[b * 16 + s];
      }
    });
    return out;
  }
  /** Retouche une case de la mesure b : la mesure est verrouillée avec ses quatre lignes (« Mesure libre »). */
  function editBar(sc, T, b, fn, focus) {
    const cur = buildOf(sc, T) || { preset: 'custom', levels: planLevels(sc, T), cresc: 0.6 };
    const bar = barOf(sc, T, b);
    const lanes = { ...bar.lanes };
    const rat = Object.fromEntries(Object.entries(bar.rat).map(([k, v]) => [k, { ...v }]));
    const cond = Object.fromEntries(Object.entries(bar.cond || {}).map(([k, v]) => [k, { ...v }]));
    fn(lanes, rat, cond);
    const clean = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([s, x]) => x && lanes[k][s] !== '-'))]).filter(([, v]) => Object.keys(v).length));
    putBuild(sc, T, { ...cur, lock: { ...(cur.lock || {}), [b]: { lanes, rat: clean(rat), cond: clean(cond) } } }, focus);
  }
  function unlockBar(sc, T, b) {
    const cur = buildOf(sc, T);
    if (!cur || !cur.lock) return;
    const lock = { ...cur.lock };
    delete lock[b];
    putBuild(sc, T, { lock: Object.keys(lock).length ? lock : undefined });
  }
  function barPop(sc, T, b, bar, kit, sel) {
    const l = kit.find((x) => x.key === sel.key);
    if (!l) return null;
    const s = sel.s;
    const ch = (bar.lanes[l.key] || '')[s] || '-';
    const act = (fn) => (v) => editBar(sc, T, b, (lanes, rat, cond) => fn(lanes, rat, cond, v), `.bwd-pop [data-v="${v}"]`);
    const setC = (lanes, v) => (lanes[l.key] = lanes[l.key].slice(0, s) + v + lanes[l.key].slice(s + 1));
    const alive = (lanes) => lanes[l.key][s] === '-' && setC(lanes, 'o');
    return drumPop({
      name: l.name,
      where: `Mesure ${b + 1} · temps ${Math.floor(s / 4) + 1} · pas ${(s % 4) + 1}`,
      vel: ch,
      rat: (bar.rat[l.key] || {})[s],
      cond: (bar.cond[l.key] || {})[s],
      setVel: act((lanes, rat, cond, v) => setC(lanes, v)),
      setRat: act((lanes, rat, cond, v) => (alive(lanes), (rat[l.key] = { ...rat[l.key], [s]: +v > 1 ? +v : undefined }))),
      setCond: act((lanes, rat, cond, v) => (alive(lanes), (cond[l.key] = { ...cond[l.key], [s]: v || undefined }))),
      clear: () => editBar(sc, T, b, (lanes) => setC(lanes, '-'), '#bwdClose'),
    });
  }
  /** Cartes « Progression de la montée » et « Mesure n » (scènes de montée). Retourne [cartes, fenêtre d'options] */
  function buildCards(sc, T) {
    const bp = buildOf(sc, T);
    const snds = kitSnds(T);
    const roller = BP().rollerOf(snds);
    const levels = levelsOf(sc, T);
    const b = curBar(sc);
    const LV = BP().BUILD_LEVELS;
    const preset = bp ? bp.preset : null;
    const rollerName = roller === 'sd' ? 'caisse claire' : roller === 'cp' ? 'clap' : null;
    const setLevel = (i, delta) => {
      const lv = levels.slice();
      lv[i] = delta > 0 ? (lv[i] % 4) + 1 : lv[i] === 1 ? 4 : lv[i] - 1;
      S.wiz.bsel = { sec: sc.sec, b: i };
      putBuild(sc, T, { preset: 'custom', levels: lv }, `.bwb-col[data-i="${i}"]`);
    };
    const cols = levels.map((lv, i) =>
      h(
        'button',
        {
          type: 'button',
          class: 'bwb-col' + (i === b ? ' cur' : ''),
          'data-i': i,
          'aria-label': `Mesure ${i + 1} : ${LV[lv - 1].name.toLowerCase()}, ${LV[lv - 1].per} coups par mesure. Clic ou Entrée : plus dense ; Maj + clic ou flèche bas : moins dense`,
          title: `Mesure ${i + 1} : ${LV[lv - 1].name.toLowerCase()} (${LV[lv - 1].per}/mesure) · clic : plus dense · Maj + clic : moins dense`,
          onclick: (e) => setLevel(i, e.shiftKey ? -1 : 1),
          oncontextmenu: (e) => (e.preventDefault(), setLevel(i, -1)),
          onkeydown: (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return e.preventDefault(), setLevel(i, e.key === 'ArrowUp' ? 1 : -1);
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              const nx = $(`.bwb-col[data-i="${i + (e.key === 'ArrowRight' ? 1 : -1)}"]`);
              if (nx) e.preventDefault(), nx.focus();
            }
          },
        },
        ...[4, 3, 2, 1].map((r) => h('span', { class: 'lv' + (lv >= r ? ' on' : '') })),
        h('span', { class: 'nm', onclick: (e) => (e.stopPropagation(), (S.wiz.bsel = { sec: sc.sec, b: i }), keepScroll(), renderWiz()) }, String(i + 1))
      )
    );
    const N = levels.length;
    const pts = levels.map((lv, i) => `${(((i + 0.5) / N) * 100).toFixed(2)},${(4 - lv) * 27 + 12}`).join(' ');
    const curve = h('div', { class: 'bwb-curve', style: `--n:${N}` }, ...cols, h('span', { class: 'bwb-line', 'aria-hidden': 'true', html: `<svg viewBox="0 0 100 105" preserveAspectRatio="none"><polyline points="${pts}" fill="none" vector-effect="non-scaling-stroke"/></svg>` }));
    const lvLabels = h('div', { class: 'bwb-lvl', 'aria-hidden': 'true' }, ...[4, 3, 2, 1].map((r) => h('div', {}, LV[r - 1].name.split(' ')[0], h('em', {}, ` ${LV[r - 1].per}/m.`))));
    const cresc = Math.round(((bp && typeof bp.cresc === 'number' ? bp.cresc : 0.6)) * 100);
    const cout = h('output', { class: 'bwd-val', for: 'bwbCresc' }, `${cresc} %`);
    const cinp = h('input', { type: 'range', id: 'bwbCresc', min: 0, max: 100, step: 5, value: cresc, 'aria-label': 'Crescendo de volume du roulement', oninput: () => (cout.textContent = `${cinp.value} %`), onchange: () => putBuild(sc, T, { cresc: +cinp.value / 100 }, '#bwbCresc') });
    const presets = BP().BUILD_PRESETS;
    const lock = (bp && bp.lock) || {};
    const lockedBars = Object.keys(lock).filter((k) => lock[k] && lock[k].lanes).length;
    const card1 = h(
      'section',
      { class: 'bwp-card bw-card bwb-card' },
      h(
        'div',
        { class: 'bwp-ch' },
        h('b', {}, 'Progression de la montée'),
        h('span', { class: 'bh-info' }, 'Densité du roulement, mesure par mesure. Clic sur une colonne : plus dense (Maj + clic : moins).'),
        h('span', { class: 'spacer' }),
        bp ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwbReset', title: 'Reprendre le roulement de l’inspiration', onclick: () => (putPart(sc.sec, T, { build: undefined }), partChanged()) }, '↺ Roulement de l’inspiration') : null
      ),
      !rollerName ? h('p', { class: 'dlg-hint' }, 'Le kit n’a ni caisse claire ni clap : cochez-en une à l’étape Instruments pour jouer le roulement.') : null,
      h(
        'div',
        { class: 'bwp-row bwb-top' },
        partSeg('Courbe', 'bwbPreset', Object.entries(presets), preset, (v) => putBuild(sc, T, v === 'custom' ? { preset: 'custom', levels } : { preset: v, levels: undefined }, `#bwbPreset [data-v="${v}"]`)),
        h('span', { class: 'spacer' }),
        h('label', { class: 'bwd-slider' }, h('span', {}, 'Crescendo de volume'), cinp, cout)
      ),
      h('div', { class: 'bwb-scroll' }, h('div', { class: 'bwb-prog', style: `--n:${N}` }, lvLabels, curve)),
      h(
        'p',
        { class: 'bwb-cap' },
        h('b', {}, `Mesure ${b + 1} sur ${sc.bars} : ${LV[levels[b] - 1].name}`),
        ` · ${LV[levels[b] - 1].per} coups par mesure` + (rollerName ? ` · le roulement est joué par la ${rollerName}${roller === 'sd' && snds.has('cp') ? ' ; le clap marque les temps 2 et 4' : ''}${snds.has('hh') ? ', le charleston suit' : ''}` : ''),
        bp ? '' : ' · roulement de l’inspiration : un réglage le remplace',
        lockedBars ? ` · ${lockedBars} mesure${lockedBars > 1 ? 's' : ''} libre${lockedBars > 1 ? 's' : ''}` : ''
      )
    );
    // grille de la mesure choisie
    const bar = barOf(sc, T, b);
    const kit = kitLanes(T)
      .filter((l) => ['sd', 'cp', 'hh', 'cr'].includes(l.snd))
      .map((l) => ({ ...l, key: l.snd }));
    const sel = S.wiz.dsel && S.wiz.dsel.sec === sc.sec && S.wiz.dsel.scope === 'bar' ? S.wiz.dsel : null;
    const locked = !!(bp && bp.lock && bp.lock[b] && bp.lock[b].lanes);
    const view = gridView({
      scope: 'bar', bars: 1, lanes: kit, data: bar.lanes, rat: bar.rat, cond: bar.cond || {}, sel, aria: `Mesure ${b + 1} de la montée, 16 pas`,
      barName: () => `Mesure ${b + 1} / ${sc.bars}`,
      cycle: (k, s) => editBar(sc, T, b, (lanes) => (lanes[k] = lanes[k].slice(0, s) + (NEXT_VEL[lanes[k][s]] || 'x') + lanes[k].slice(s + 1)), `.bwd-sc-bar .bwp-cell[data-l="${k}"][data-s="${s}"]`),
      pop: (k, s) => openPop({ sec: sc.sec, scope: 'bar', key: k, s }),
    });
    const card2 = h(
      'section',
      { class: 'bwp-card bw-card bwd-wrap' },
      h(
        'div',
        { class: 'bwp-ch' },
        h('b', {}, `Mesure ${b + 1} · ${LV[levels[b] - 1].name.toLowerCase()}`),
        h('span', { class: 'bh-info' }, locked ? 'Mesure libre : la courbe ne la change plus.' : 'Générée depuis la courbe. Modifier une case la verrouille.'),
        h('span', { class: 'spacer' }),
        locked ? h('button', { type: 'button', class: 'btn btn-small bwb-free', id: 'bwbFree', title: 'Rendre la mesure à la courbe', onclick: () => unlockBar(sc, T, b) }, '🔒 Mesure libre') : null
      ),
      view,
      sel ? barPop(sc, T, b, bar, kit, sel) : null
    );
    return [card1, card2];
  }

  /** « Assortir toutes les scènes » : un motif de la nuance de chaque scène, le même pour les scènes du même type. */
  function matchAllDrums(T) {
    const list = SS.DRUM_PATTERNS[drumStyle()];
    const byKind = new Map();
    const used = { 1: 0, 2: 0, 3: 0 };
    S.wiz.res.scenes.forEach((x) => {
      const kd = kindOf(x.sec);
      if (!byKind.has(kd)) {
        const e = secEnergy(x.sec);
        const cand = list.filter((p) => p.energy === e);
        byKind.set(kd, (cand.length ? cand : list)[used[e]++ % (cand.length || list.length)]);
      }
      putPart(x.sec, T, { style: drumStyle(), pattern: byKind.get(kd).id, edits: undefined });
    });
    S.wiz.pmsg = 'Un motif suggéré pour chaque scène';
    partChanged();
  }
  /** Chips du kit sous la grille : une ligne par élément coché ; les autres éléments du kit sont en pointillés. */
  function kitChips(T) {
    const mu = musState()[T.musician];
    const on = new Set(T.cols.map((c) => c.o.band.key.split(':')[1]));
    const off = mu && mu.pieces ? mu.pieces.filter((pc) => !pc.on) : [];
    return h(
      'div',
      { class: 'bwd-kit' },
      h('span', { class: 'bh-lbl' }, 'Kit : une ligne par élément coché'),
      ...kitLanes(T).map((l) => h('span', { class: 'bwd-chip', style: `--lc:${l.color}` }, h('i'), l.name)),
      ...off.map((pc) => h('span', { class: 'bwd-chip off', title: 'Non coché dans l’étape Instruments : pas de ligne' }, (B().drumLabel ? B().drumLabel(String(pc.piece || '').split('@')[0]) : String(pc.piece || '')))),
      h('button', { type: 'button', class: 'link-btn bwd-edit', id: 'bwdKit', onclick: () => goStep(ST.inst) }, 'Modifier le kit…')
    );
  }
  function drumsBody(sc, T) {
    const d = partOf(sc.sec, T) || {};
    const pat = patOf(sc.sec, T);
    const list = SS.DRUM_PATTERNS[drumStyle()];
    const en = secEnergy(sc.sec);
    const flt = S.wiz.efilter || 0;
    const fill = d.fill != null ? d.fill : d.pattern || d.edits ? 'off' : fillBar(sc, sc.bars - 1, T) ? 'end' : 'off';
    const build = isBuild(sc);
    const g = drumGridOf(sc, T);
    const sel = S.wiz.dsel && S.wiz.dsel.sec === sc.sec && S.wiz.dsel.scope === 'main' ? S.wiz.dsel : null;
    const view = gridView({
      scope: 'main', bars: g.bars, lanes: g.kit, data: g.lanes, rat: g.rat, cond: g.cond, sel, aria: `Motif de la scène, ${g.bars} mesure${g.bars > 1 ? 's' : ''} de 16 pas`,
      cycle: (k, s) => cycleCell(sc, T, k, s),
      pop: (k, s) => openPop({ sec: sc.sec, scope: 'main', key: k, s }),
    });
    const bars = h('div', { class: 'bwp-bars', role: 'img', 'aria-label': 'La scène, mesure par mesure' }, ...Array.from({ length: sc.bars }, (_, b) => h('span', { class: fillBar(sc, b, T) ? 'fill' : '', title: fillBar(sc, b, T) ? 'Fill' : null }, String(b + 1))));
    const legend = h(
      'div',
      { class: 'bwd-legend' },
      h('span', {}, h('i', { class: 'sw v1' }), 'Fort'),
      h('span', {}, h('i', { class: 'sw v2' }), 'Moyen'),
      h('span', {}, h('i', { class: 'sw v3' }), 'Léger'),
      h('span', {}, h('b', { class: 'tag' }, '×2'), h('b', { class: 'tag' }, '×3'), 'répétitions dans le pas'),
      h('span', {}, h('b', { class: 'tag' }, '75%'), 'probabilité'),
      h('span', {}, h('b', { class: 'tag' }, '1:2'), 'un passage sur deux')
    );
    const card1 = h(
      'section',
      { class: 'bwp-card bw-card bwd-wrap' + (build ? ' bwd-sec' : '') },
      h(
        'div',
        { class: 'bwp-ch' },
        h('b', {}, pat ? pat.name : d.edits ? 'Motif perso' : build ? 'Reste de la batterie' : 'Motif de la scène'),
        d.edits ? h('span', { class: 'bwp-mod' }, '· modifié') : null,
        d.edits ? h('button', { type: 'button', class: 'btn btn-small', id: 'bwpUnedit', onclick: () => (putPart(sc.sec, T, { edits: undefined }), partChanged()) }, pat ? 'Revenir au motif' : 'Revenir à l’inspiration') : null,
        h('span', { class: 'bh-info' }, 'Clic : fort, moyen, léger, éteint · clic droit (appui long) : options de la case')
      ),
      h(
        'div',
        { class: 'bwd-ctl' },
        partSeg('Longueur du motif', 'bwdLen', [[1, '1 mesure'], [2, '2 mesures'], [4, '4 mesures']], g.bars, (v) => setLength(sc, T, +v)),
        grooveSliders()
      ),
      view,
      legend,
      sel ? cellPop(sc, T, g, sel) : null,
      build ? null : h('div', { class: 'bh-lbl' }, 'La scène, mesure par mesure (fills en rose)'),
      build ? null : bars,
      build
        ? null
        : h(
            'div',
            { class: 'bwp-row' },
            partSeg('Fill automatique', 'bwpFill', Object.entries(SS.DRUM_FILL_EVERY), fill, (v) => (putPart(sc.sec, T, { fill: v }), partChanged())),
            h(
              'label',
              { class: 'bwp-field' },
              h('span', { class: 'bh-lbl' }, 'Type'),
              h('select', { id: 'bwpFillType', disabled: fill === 'off', onchange: (e) => (putPart(sc.sec, T, { fillType: e.target.value }), partChanged()) }, ...Object.entries(SS.DRUM_FILLS).map(([id, f]) => h('option', { value: id, selected: (d.fillType || 'roll') === id }, f.name)))
            ),
            partCheck('bwpCrash', 'Crash au début de la scène', !!d.crash, (on) => (putPart(sc.sec, T, { crash: on || undefined }), partChanged()))
          ),
      kitChips(T)
    );
    // carte d'un motif ; sans motif : celle de l'inspiration (le jeu du plan), choisie tant qu'on n'a rien réglé
    const card = (p) => {
      const on = p ? !!pat && pat.id === p.id : !d.pattern && !d.edits;
      return h(
        'button',
        { type: 'button', role: 'radio', class: 'bwp-pat' + (on ? ' on' : ''), 'data-id': p ? p.id : '', 'aria-checked': String(on), onclick: () => pickPattern(sc, T, p) },
        h('b', {}, p ? p.name : 'Motif de l’inspiration', p ? h('span', { class: 'bwp-en', title: ['calme', 'moyen', 'intense'][p.energy - 1] }, '●'.repeat(p.energy) + '○'.repeat(3 - p.energy)) : null),
        h('span', { html: miniLanes(p ? p.lanes : inspLanes(sc, T.cols)) }),
        p ? (p.energy === en ? h('span', { class: 'bwp-sug' }, 'Suggéré') : null) : h('small', {}, 'Le jeu du plan, sans rien changer')
      );
    };
    const card2 = h(
      'section',
      { class: 'bwp-card bw-card' },
      h(
        'div',
        { class: 'bwp-ch' },
        h('b', {}, `${list.length} motifs ${style().label}`),
        h('span', { class: 'segmented', id: 'bwpFilter', role: 'radiogroup', 'aria-label': 'Filtrer par énergie' }, ...['Tous', 'Calme', 'Moyen', 'Intense'].map((t, i) => h('button', { type: 'button', role: 'radio', class: flt === i ? 'active' : '', 'aria-checked': String(flt === i), 'data-v': i, onclick: () => ((S.wiz.efilter = i), renderWiz()) }, t))),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small', id: 'bwpMatch', title: 'Un motif suggéré pour chaque scène, selon sa nuance', onclick: () => matchAllDrums(T) }, 'Assortir toutes les scènes')
      ),
      h('div', { class: 'bwp-lib', role: 'radiogroup', 'aria-label': 'Motifs de batterie' }, card(null), ...list.filter((p) => !flt || p.energy === flt).map(card))
    );
    // la fenêtre d'options se place sous sa case une fois la carte dans la page ; le défilement de la grille est rendu
    setTimeout(() => {
      const wraps = document.querySelectorAll('.bwd-wrap');
      wraps.forEach((w) => {
        const sc2 = $('.bwd-scroll', w);
        if (sc2 && dScroll) sc2.scrollLeft = dScroll;
        placePop(w);
      });
    }, 0);
    return [partHead(sc, T, 'batterie', false), autoCard(sc, T), ...(build ? [...buildCards(sc, T)] : []), card1, card2];
  }

  /* --- Drums d'un instrument qui n'est pas un kit : notes courtes sur la fondamentale, jouées sur la grosse caisse et / ou la caisse claire du motif --- */
  const DRUM_MODES = [['both', 'Les deux', 'Sur la grosse caisse et la caisse claire du motif'], ['kick', 'Grosse caisse', 'Seulement sur les coups de grosse caisse'], ['snare', 'Caisse claire', 'Seulement sur les coups de caisse claire']];
  function drumsLiteSub(x, T) {
    const d = partOf(x.sec, T) || {};
    const p = patOf(x.sec, T);
    return (p ? p.name : d.edits ? 'Motif perso' : 'Motif du plan') + (d.mode && d.mode !== 'both' ? ` · ${nameOf(DRUM_MODES, d.mode).toLowerCase()}` : '');
  }
  function drumsLiteBody(sc, T) {
    const d = partOf(sc.sec, T) || {};
    const pat = patOf(sc.sec, T);
    const list = SS.DRUM_PATTERNS[drumStyle()];
    const en = secEnergy(sc.sec);
    const flt = S.wiz.efilter || 0;
    const card = (p) => {
      const on = p ? !!pat && pat.id === p.id : !d.pattern && !d.edits;
      return h(
        'button',
        { type: 'button', role: 'radio', class: 'bwp-pat' + (on ? ' on' : ''), 'data-id': p ? p.id : '', 'aria-checked': String(on), onclick: () => pickPattern(sc, T, p) },
        h('b', {}, p ? p.name : 'Motif du plan', p ? h('span', { class: 'bwp-en', title: ['calme', 'moyen', 'intense'][p.energy - 1] }, '●'.repeat(p.energy) + '○'.repeat(3 - p.energy)) : null),
        p ? h('span', { html: miniLanes(p.lanes) }) : h('small', {}, 'Le jeu du plan, sans rien changer'),
        p && p.energy === en ? h('span', { class: 'bwp-sug' }, 'Suggéré') : null
      );
    };
    return [
      partHead(sc, T, 'drums', true),
      autoCard(sc, T),
      h(
        'section',
        { class: 'bwp-card bw-card' },
        h('div', { class: 'bwp-ch' }, h('b', {}, `Drums de « ${sc.name} »`), h('span', { class: 'spacer' }), playBox(sc, T, 'both')),
        h('p', { class: 'dlg-hint' }, 'Cet instrument joue la fondamentale de chaque accord, en notes courtes, sur les coups du motif de batterie.'),
        partSeg('Joue sur', 'bwpDrumMode', DRUM_MODES.map(([v, t, tip]) => [v, t, tip]), d.mode || 'both', (v) => (putPart(sc.sec, T, { mode: v === 'both' ? undefined : v }), partChanged()))
      ),
      h(
        'section',
        { class: 'bwp-card bw-card' },
        h(
          'div',
          { class: 'bwp-ch' },
          h('b', {}, `${list.length} motifs ${style().label}`),
          h('span', { class: 'segmented', id: 'bwpFilter', role: 'radiogroup', 'aria-label': 'Filtrer par énergie' }, ...['Tous', 'Calme', 'Moyen', 'Intense'].map((t, i) => h('button', { type: 'button', role: 'radio', class: flt === i ? 'active' : '', 'aria-checked': String(flt === i), 'data-v': i, onclick: () => ((S.wiz.efilter = i), renderWiz()) }, t)))
        ),
        h('div', { class: 'bwp-lib', role: 'radiogroup', 'aria-label': 'Motifs de batterie' }, card(null), ...list.filter((p) => !flt || p.energy === flt).map(card))
      ),
    ];
  }

  /* --- Basse : mode de jeu, pédale, registre, note d'approche --- */
  function bassSub(x, T, noAcc) {
    const o = partOf(x.sec, T) || {};
    const m = o.mode || planMode(x, T);
    const n = noAcc || mutedIn(x.sec, T) ? 0 : accCount(x, T);
    return mutedIn(x.sec, T) ? 'muette' : (m ? nameOf(BASS_MODES, m) : 'aucune') + (o.pedal ? ' + pédale' : '') + (o.mode ? '' : m && !typeChanged(T) ? ' · inspiration' : '') + (n ? ` · ${n} accent${n > 1 ? 's' : ''}` : '');
  }
  /** Colonne des scènes (basse) : le jeu de la scène, et à droite la pastille « n accents ». */
  function bassSceneSub(x, T) {
    const n = mutedIn(x.sec, T) ? 0 : accCount(x, T);
    return h('span', { class: 'bwa-ssub' }, h('span', {}, bassSub(x, T, true)), n ? h('em', { class: 'bwa-badge', title: `${n} accent${n > 1 ? 's' : ''}` }, h('i', { html: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 1l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' }), `${n} accent${n > 1 ? 's' : ''}`) : null);
  }
  function bassBody(sc, T) {
    const o = partOf(sc.sec, T) || {};
    const set = (patch) => (putPart(sc.sec, T, patch), pruneAccents(sc, T), partChanged());
    return [
      partHead(sc, T, 'basse', false),
      rollBox(sc, T),
      autoCard(sc, T),
      accPanel(sc, T),
      h(
        'section',
        { class: 'bwp-card bw-card' },
        h('div', { class: 'bwp-ch' }, h('b', {}, `Mode de jeu de « ${sc.name} »`), h('span', { class: 'spacer' }), playBox(sc, T, '8')),
        modeCards(sc, T, BASS_MODES, '#3fcf3f', () => pruneAccents(sc, T)),
        !planMode(sc, T) && !o.mode ? h('p', { class: 'dlg-hint' }, 'L’inspiration ne joue pas de basse dans cette scène : choisis un mode pour l’allumer.') : null
      ),
      h(
        'section',
        { class: 'bwp-card bw-card' },
        h(
          'div',
          { class: 'bwp-row' },
          partSeg('Pédale', 'bwpPedal', [['none', 'Aucune'], ['tonic', 'Tonique'], ['fifth', 'Dominante']], o.pedal || 'none', (v) => set({ pedal: v === 'none' ? undefined : v })),
          partSeg('Registre', 'bwpRegister', [['low', 'Grave'], ['mid', 'Médium', 'Une octave plus haut']], o.register || 'low', (v) => set({ register: v === 'low' ? undefined : v })),
          partCheck('bwpApproach', 'Note d’approche avant le changement d’accord', o.approach !== false && !o.pedal, (on) => set({ approach: on ? undefined : false }), !!o.pedal)
        ),
        o.pedal ? h('p', { class: 'dlg-hint' }, `Pédale de ${o.pedal === 'tonic' ? 'tonique' : 'dominante'} : la basse reste sur cette note de la tonalité pendant que les accords changent au-dessus, sans note d’approche.`) : null
      ),
    ];
  }

  /* --- Nappes : mode de jeu, voicing --- */
  function padSub(x, T) {
    const o = partOf(x.sec, T) || {};
    const m = o.mode || planMode(x, T);
    return mutedIn(x.sec, T) ? 'muette' : (m ? nameOf(PAD_MODES, m) : 'aucune') + (o.voicing === 'open' ? ' · ouvert' : '') + (o.mode ? '' : m && !typeChanged(T) ? ' · inspiration' : '');
  }
  function padBody(sc, T) {
    const o = partOf(sc.sec, T) || {};
    return [
      partHead(sc, T, 'nappe', false),
      rollBox(sc, T),
      autoCard(sc, T, { fit: true }),
      h(
        'section',
        { class: 'bwp-card bw-card' },
        h('div', { class: 'bwp-ch' }, h('b', {}, `Accords de « ${sc.name} »`), h('span', { class: 'spacer' }), playBox(sc, T, 'sustain')),
        modeCards(sc, T, PAD_MODES, '#4f6bff'),
        !planMode(sc, T) && !o.mode ? h('p', { class: 'dlg-hint' }, 'L’inspiration ne joue pas de nappe dans cette scène : choisis un mode pour l’allumer.') : null,
        h('div', { class: 'bwp-row' }, partSeg('Voicing', 'bwpVoicing', [['close', 'Serré', 'Accord au plus proche du précédent'], ['open', 'Ouvert', 'La note grave descend d’une octave']], o.voicing || 'close', (v) => (putPart(sc.sec, T, { voicing: v === 'close' ? undefined : v }), partChanged())))
      ),
    ];
  }

  /* --- Arpèges : Arp One, mode Intuitif (js/arp.js, js/motifs.js) ; l'arpège peut être allumé dans une scène où l'inspiration n'en avait pas ---
   * Tant qu'on n'a rien touché, l'arpège de l'inspiration joue (parts[section].arp absent). Le premier réglage crée
   * parts[section].arp.one à partir du motif d'Arp One le plus proche du mode de l'inspiration (ARP_START).
   */
  const A1 = () => SS.Arp;
  /** Mode de l'inspiration → [motif d'Arp One, vitesse] (vitesse : 1 = doubles-croches, 0,5 = croches). */
  const ARP_START = {
    up16: ['up', 1], updown16: ['updown', 1], up8: ['up', 0.5], bells: ['pedalehaute', 0.5], strobe: ['pendule', 1],
    pluck16: ['alberti', 1], ost16: ['ostinato', 1], dotted: ['up', 1 / 3], rise: ['wave', 1],
  };
  const motifById = (id) => SS.MOTIFS.find((m) => m.id === id);
  /** Réglages Arp One qui jouent comme le mode donné (ou, sans mode, le motif « Midnight Drive »). */
  function arpStart(mode) {
    const [id, rate] = ARP_START[mode] || ['midnight', 1];
    const m = motifById(id);
    return A1().normalize({ ...SS.motifPatch({}, m), rate, octaves: m.arp.octaves || 2 });
  }
  /** Réglages Arp One affichés pour la scène : les siens, sinon le point de départ d'après l'inspiration. */
  const arpOne = (sc, T) => {
    const o = partOf(sc.sec, T) || {};
    return o.one ? A1().normalize(o.one) : arpStart(o.mode || planMode(sc, T));
  };
  const motifLabel = (one) => {
    const m = SS.motifOf(one);
    return m ? m.name : 'Motif perso';
  };
  function arpSub(x, T) {
    const o = partOf(x.sec, T) || {};
    if (mutedIn(x.sec, T)) return 'muet';
    if (o.one) return motifLabel(o.one);
    const m = o.mode || planMode(x, T);
    return (m ? nameOf(ARP_MODES, m) : 'aucun') + (o.mode ? '' : m && !typeChanged(T) ? ' · inspiration' : '');
  }
  /** Change les réglages Arp One de la scène (f reçoit les réglages actuels et rend les nouveaux) ; l'arpège s'allume. */
  function arpEdit(sc, T, f, focus) {
    const next = A1().normalize(f(arpOne(sc, T)));
    putOff(sc.sec, T, false);
    putPart(sc.sec, T, { one: next, mode: undefined });
    partChanged(focus);
  }

  /** Potentiomètre rotatif d'un réglage Arp One (même rendu que le panneau Arp One) : glisser, molette, flèches ; appliqué au lâcher. */
  function arpKnob(sc, T, one, mc) {
    const A = A1();
    let v = A.macroValue(one, mc.id);
    const num = h('b', {}, String(v));
    const ring = h('div', { class: 'arp-knob-ring' }, h('div', { class: 'arp-knob-cap' }, num));
    const now = h('span', { class: 'arp-knob-now' }, A.macroText(one, mc.id));
    const dial = h('div', { class: 'arp-knob-dial', id: 'bwaK-' + mc.id, role: 'slider', tabindex: '0', 'aria-label': mc.label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v), 'aria-valuetext': now.textContent }, ring);
    const paint = () => {
      ring.style.setProperty('--p', v + '%');
      num.textContent = String(v);
      dial.setAttribute('aria-valuenow', String(v));
    };
    const live = (x) => {
      v = Math.max(0, Math.min(100, Math.round(x)));
      const p = A.normalize({ ...one, ...A.macroPatch(one, mc.id, v), macros: { ...one.macros, [mc.id]: v } });
      now.textContent = A.macroText(p, mc.id);
      dial.setAttribute('aria-valuetext', now.textContent);
      paint();
    };
    const commit = () => arpEdit(sc, T, (a) => ({ ...a, ...A.macroPatch(a, mc.id, v), macros: { ...a.macros, [mc.id]: v }, preset: '' }), '#bwaK-' + mc.id);
    let drag = null;
    dial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dial.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, v, moved: false };
    });
    dial.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.moved = true;
      live(drag.v + (drag.y - e.clientY) * 0.6);
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved) commit();
    };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    let wt = 0;
    dial.addEventListener('wheel', (e) => {
      e.preventDefault();
      live(v + (e.deltaY < 0 ? 2 : -2));
      clearTimeout(wt);
      wt = setTimeout(commit, 350);
    }, { passive: false });
    dial.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 20, PageDown: -20 }[e.key];
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : d != null ? v + d : null;
      if (to == null) return;
      e.preventDefault();
      live(to);
      commit();
    });
    paint();
    return h('div', { class: 'arp-knob bwa-knob', 'data-k': mc.id, title: mc.what }, dial, h('b', { class: 'arp-knob-name' }, mc.label), now);
  }

  /** Fenêtre de choix du motif (même présentation que celle d'Arp One) : on choisit une tuile, puis « Choisir ». */
  function openMotifPicker(cur, apply) {
    const tools = SS.arpPanel.motifTools;
    const pick = { id: cur ? cur.id : '', cat: (cur && cur.cat) || 'all', q: '' };
    let dlg = document.getElementById('bwaMotifDialog');
    if (dlg) dlg.remove();
    dlg = h('dialog', { id: 'bwaMotifDialog', class: 'sd-dialog motif-dialog' }, h('form', { method: 'dialog' }));
    document.body.append(dlg);
    const done = () => (dlg.close(), dlg.remove());
    dlg.addEventListener('cancel', (e) => (e.preventDefault(), done()));
    const draw = () => {
      const q = pick.q.trim().toLowerCase();
      const recents = tools.recents();
      const match = (m) => !q || (m.name + ' ' + (m.tags || '') + ' ' + tools.example(m)).toLowerCase().includes(q);
      const inCat = (m, c) => c === 'all' || (c === 'recent' ? recents.includes(m.id) : m.cat === c);
      const cats = [{ id: 'recent', label: '★ Récents' }, { id: 'all', label: 'Tous les motifs' }, ...SS.MOTIF_CATS];
      const list = SS.MOTIFS.filter((m) => match(m) && inCat(m, q ? 'all' : pick.cat));
      const groups = q || pick.cat === 'all'
        ? SS.MOTIF_CATS.map((c) => ({ c, items: list.filter((m) => m.cat === c.id) })).filter((g) => g.items.length)
        : [{ c: null, items: pick.cat === 'recent' ? recents.map((id) => list.find((m) => m.id === id)).filter(Boolean) : list }];
      const sel = motifById(pick.id);
      const tile = (m) => h('button', { type: 'button', class: 'arp-style' + (m.id === pick.id ? ' active' : ''), 'data-id': m.id, onclick: () => ((pick.id = m.id), draw()) },
        h('span', { html: tools.icon(m) }), h('span', { class: 'arp-style-name' }, m.name), h('small', { class: 'arp-style-ex' }, tools.example(m)));
      const search = h('input', { type: 'search', class: 'motif-search', placeholder: 'Rechercher : octave, basse, montée, synthwave…', value: pick.q });
      search.addEventListener('input', () => {
        pick.q = search.value;
        draw();
        const s2 = dlg.querySelector('.motif-search');
        s2.focus();
        s2.setSelectionRange(s2.value.length, s2.value.length);
      });
      dlg.querySelector('form').replaceChildren(
        h('div', { class: 'motif-head' }, h('h2', {}, 'Choisir un motif'), search),
        h('div', { class: 'motif-body' },
          h('nav', { class: 'motif-cats' }, cats.map((c) => h('button', { type: 'button', class: 'motif-cat' + (!q && pick.cat === c.id ? ' active' : ''), onclick: () => ((pick.cat = c.id), (pick.q = ''), draw()) },
            h('span', {}, c.label), h('small', {}, String(c.id === 'recent' ? recents.length : SS.MOTIFS.filter((m) => inCat(m, c.id)).length))))),
          h('div', { class: 'motif-list' },
            groups.length ? groups.map((g) => h('section', { class: 'motif-group' }, g.c ? h('h3', {}, g.c.label) : null, h('div', { class: 'arp-styles' }, g.items.map(tile)))) : h('p', { class: 'arp-help' }, 'Aucun motif ne correspond.'))
        ),
        h('div', { class: 'dlg-footer motif-foot' },
          h('span', { class: 'motif-now' }, sel ? [h('span', { html: tools.icon(sel) }), h('span', {}, h('b', {}, sel.name), h('small', {}, tools.example(sel)))] : null),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn', id: 'bwaMotifCancel', onclick: done }, 'Annuler'),
          h('button', { type: 'button', class: 'btn btn-accent', id: 'bwaMotifOk', disabled: !sel, onclick: () => { const m = motifById(pick.id); done(); if (m) { tools.remember(m.id); apply(m, '#bwaName'); } } }, 'Choisir'))
      );
    };
    draw();
    dlg.showModal();
  }
  const ARP_RATES = [[0.5, '1/8'], [1, '1/16'], [1.5, '1/16 triolet'], [2, '1/32']];
  function arpBody(sc, T) {
    const A = A1();
    const o = partOf(sc.sec, T) || {};
    const insp = planMode(sc, T);
    const one = arpOne(sc, T);
    const muted = mutedIn(sc.sec, T);
    const cur = SS.motifOf(one);
    const cat = cur && SS.MOTIF_CATS.find((c) => c.id === cur.cat);
    const applyMotif = (m, focus) => arpEdit(sc, T, (a) => ({ ...a, ...SS.motifPatch(a, m) }), focus);
    const rateKey = (r) => String(ARP_RATES.find(([x]) => Math.abs(x - r) < 1e-6)?.[0] ?? r);
    const rates = ARP_RATES.map(([r, t]) => [String(r), t]);
    if (!ARP_RATES.some(([r]) => rateKey(one.rate) === String(r))) rates.push([String(one.rate), A.rateLabel(one.rate)]);
    const tools = SS.arpPanel.motifTools;
    const motifLine = h(
      'div',
      { class: 'bwa-motif' },
      h(
        'button',
        { type: 'button', class: 'bwa-name', id: 'bwaName', title: 'Choisir un autre motif', 'aria-haspopup': 'dialog', onclick: () => openMotifPicker(cur, applyMotif) },
        h('span', { class: 'bwa-icon', html: cur ? tools.icon(cur) : '' }),
        h('span', { class: 'bwa-nt' }, h('b', {}, cur ? cur.name : 'Motif perso'), h('small', {}, (cat ? cat.label : 'Réglages à toi') + (o.one ? '' : ' · départ d’après l’inspiration'))),
        h('span', { class: 'bwa-chev', 'aria-hidden': 'true' }, '›')
      ),
      h('button', { type: 'button', class: 'btn bwa-nav', id: 'bwaPrev', 'aria-label': 'Motif précédent', title: 'Motif précédent', onclick: () => applyMotif(SS.motifStep(one, -1), '#bwaPrev') }, '‹'),
      h('button', { type: 'button', class: 'btn bwa-nav', id: 'bwaNext', 'aria-label': 'Motif suivant', title: 'Motif suivant', onclick: () => applyMotif(SS.motifStep(one, 1), '#bwaNext') }, '›'),
      h('button', { type: 'button', class: 'btn bwa-surprise', id: 'bwaSurprise', title: 'Un nouvel arpège tiré au hasard', onclick: () => arpEdit(sc, T, (a) => A.normalize(SS.arpSurprise(a, {})), '#bwaSurprise') }, 'Surprends-moi'),
      partSeg('Vitesse', 'bwaRate', rates, rateKey(one.rate), (v) => arpEdit(sc, T, (a) => ({ ...a, rate: +v }), `#bwaRate [data-v="${v}"]`))
    );
    const knobs = h('div', { class: 'bwa-knobs' }, ...A.MACROS.map((mc) => arpKnob(sc, T, one, mc)));
    return [
      partHead(sc, T, 'arpège', true),
      rollBox(sc, T),
      autoCard(sc, T, { fit: true }),
      h(
        'section',
        { class: 'bwp-card bwa' },
        h('div', { class: 'bwp-ch' }, h('b', {}, `Arpège de « ${sc.name} »`), h('span', { class: 'bh-info' }, 'Arp One · mode Intuitif'), h('span', { class: 'spacer' }), playBox(sc, T, 'up16')),
        motifLine,
        knobs,
        muted ? h('p', { class: 'dlg-hint' }, 'L’arpège est coupé dans cette scène : un réglage le rallume.') : null,
        !insp && !o.one && !o.mode ? h('p', { class: 'dlg-hint' }, 'L’inspiration ne joue pas d’arpège dans cette scène : un premier réglage (motif, bouton, vitesse) l’allume.') : null
      ),
    ];
  }

  /** Affiche l'étape en cours de l'assistant. */
  function renderWiz() {
    const step = S.wiz.step;
    el.classList.add('wizard');
    el.querySelectorAll('.wiz-only').forEach((x) => (x.hidden = false));
    if (!melStep()) leaveMel();
    // bandeau de lecture : dans l'en-tête (étapes 3 à 12), caché aux étapes 1 et 2
    // étapes 1 et 2 : l'écran Band (style et inspiration, puis musiciens) ; les autres blocs sont cachés par le CSS (bs-style, bs-inst)
    const body = el.querySelector('.band-body');
    $('#bandWiz').classList.remove('bw-split');
    const band = step === ST.style || step === ST.inst;
    el.classList.toggle('bs-style', step === ST.style);
    el.classList.toggle('bs-inst', step === ST.inst);
    body.hidden = !band;
    $('#bandWiz').hidden = band;
    $('#bandGm').hidden = step !== ST.inst; // General MIDI : en tête de l'étape Instruments
    $('#bwCreate').hidden = step !== ST.pick;
    $('#bwQuick').hidden = step !== ST.style || (cover() && !spec()); // étape 1 : « Générer et écouter »
    if (band) {
      refresh();
      updateTransport(); // la barre du haut montre déjà tempo et tonalité aux étapes 1 et 2
    } else {
      if (step === ST.tempo) renderTempo();
      else if (step === ST.chords) renderChords();
      else if (insAt(step)) renderIns(insAt(step));
      else if (step === ST.arr) renderArr();
      else if (step === ST.fx) renderFx();
      else if (step === ST.mix) renderMix();
      else renderWizGrid();
      wizFoot();
      relisten();
      markListen();
    }
    renderInsp();
  }

  /** Boutons du pied de la fenêtre selon l'étape. */
  function wizFoot() {
    const step = S.wiz.step;
    $('#bwEmpty').hidden = step !== ST.style || !S.wiz.fresh;
    // #bwBack / #bwNext : cachés, ils servent aux tests et au clavier (Alt + flèches)
    $('#bwBack').disabled = step === 1;
    $('#bwNext').disabled = !canGo(step + 1);
    $('#bwNext').title = step < ST.pick ? (canGo(step + 1) ? `${stepInfo(step + 1).label} : ${stepInfo(step + 1).hint.toLowerCase()}` : cover() && !spec() ? 'Corrige la reprise (parties, accords, ordre)' : 'Choisis au moins un musicien') : '';
    const kept = step === ST.pick ? wizCols().filter((c) => !S.wiz.off.has(c.id)).length : 0;
    $('#bwCreate').disabled = step === ST.pick && !kept;
    $('#bwCount').hidden = step !== ST.pick;
    $('#bwCount').textContent = kept ? `${kept} piste${kept > 1 ? 's' : ''} à importer` : 'Aucune piste cochée';
    renderWizSteps();
  }

  /** Crée la chanson avec les pistes cochées (même calcul que la vue session, même mélodie). */
  function createWizSong(confirmed) {
    const cols = wizCols().filter((c) => !S.wiz.off.has(c.id));
    if (!cols.length) return;
    // projet déjà commencé (bouton Nouvelle de l'en-tête) : la chanson le remplace, on demande d'abord
    if (confirmed !== true && app.project().tracks.length) return showSongConfirm(cols.length);
    const p = preset();
    const seed = S.wiz.seed;
    if (S.wiz.mix) mixSync(); // le mix suit les pistes du groupe, même si on a changé d'instruments depuis l'étape Mix
    hideConfirm();
    // volumes réglés à l'étape Mélodie : appliqués au mixage automatique de la chanson créée
    // plan : celui de l'inspiration ou de la reprise, avec les retouches des étapes Tempo et tonalité et Scènes
    const eff = specEff();
    const plan = cover() ? { ...p, spec: eff, cover: { title: S.cover.title.trim() || 'Reprise' } } : eff !== spec() ? { ...p, spec: eff } : p;
    // tout est lu avant de quitter l'assistant (leave efface S.wiz), puis la fenêtre principale reprend la place
    const args = [cols.map((c) => c.o), plan, tempo(), { melodySeed: seed, melody: melodyOpts(), harmony: harmonyOpts(), parts: S.wiz.parts, kinds: S.wiz.kinds, gains: cols.map((c) => volGain(c.id)), mix: S.wiz.mix, groove: grooveOf(), fx: fxOpts() }];
    const draft = wizSnapshot(Date.now()); // le brouillon est gardé : rouvrir l'assistant permet de retoucher et de recréer
    leave({ keep: false });
    app.applySong(...args);
    app.setWizardDraft(draft);
  }

  /* ---------- Commande de l'écoute : la barre du haut de l'application ----------
   * Dans l'assistant (body.wizard-mode), Lecture / Stop, tempo et position de la barre du haut pilotent l'écoute
   * (js/main.js route vers togglePlay, stopListen et setTempo) ; la tonalité s'affiche à la place d'Harmonie et Song.
   * Le tempo vaut pour l'écoute et pour « Créer la chanson » ; il revient à celui de l'inspiration si on en change.
   */
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 240;
  /** Le tempo du bandeau vaut pour cette inspiration (ou pour la reprise). */
  const tempoKey = () => (cover() ? 'cover' : preset().id);
  /** Tempo de la chanson : celui choisi dans le bandeau, sinon celui de l'inspiration (ou de la reprise). */
  function tempo() {
    const p = preset();
    const base = cover() ? S.cover.tempo : p.tempo;
    return S.wiz && S.wiz.tempo && S.wiz.tempoFor === tempoKey() ? S.wiz.tempo : base;
  }
  /** Tempo de l'inspiration (ou de la reprise tapée) : celui où l'on revient. */
  const origTempo = () => (cover() ? S.cover.tempo : preset().tempo);
  /** soft : pendant qu'on glisse le curseur, on ne redessine pas l'étape (le curseur doit rester en main). */
  function setTempo(v, soft) {
    if (!S.wiz) return;
    const t = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Number(v) || tempo())));
    S.wiz.tempo = t;
    S.wiz.tempoFor = tempoKey();
    if (L.proj) L.proj.tempo = t; // la lecture en cours prend le nouveau tempo au pas suivant
    const inp = $('#tempo'); // le champ de la barre du haut
    if (inp) inp.value = t; // valeur bornée, même pendant la saisie
    if (soft) {
      const lcd = $('#bwtLcd');
      if (lcd) lcd.textContent = t;
      markListen();
      return;
    }
    renderWiz();
  }

  /**
   * Étape 1, « Générer et écouter » : la chanson complète de l'inspiration choisie (la première du style, ou du premier style, si
   * aucune n'est choisie) est jouée comme à l'étape Scènes (listenSong, commandée par la barre du haut) ; re-clic : arrêt.
   */
  function quickGo() {
    if (!S.wiz) return;
    if (L.mode) return stopListen();
    if (!S.styleId) S.styleId = B().STYLES[0].id;
    if (!preset()) S.presetId = style().presets[0].id;
    if (!spec()) return;
    renderStyles();
    renderPresets();
    renderSong();
    listenSong(0);
  }
  /** Le bouton de l'étape 1 montre l'état : « Générer et écouter », ou « Lecture · scène X » (re-clic : stop). */
  function syncQuick() {
    const b = $('#bwGo');
    if (!b || !S.wiz) return;
    const { res } = wizSong();
    const sc = res && L.scene ? res.scenes.find((x) => x.id === L.scene) : null;
    const on = !!L.mode;
    b.classList.toggle('busy', on);
    b.setAttribute('aria-pressed', String(on));
    $('.bw-go-ico', b).textContent = on ? '■' : '▶';
    $('#bwGoText').textContent = on ? `Lecture${sc ? ` · scène ${sc.name}` : ''}` : 'Générer et écouter';
    b.title = on ? 'Arrêter l’écoute' : 'Crée l’aperçu complet (tous les instruments, toutes les scènes) et le joue ; on affine ensuite étape par étape';
  }

  /** Lecture : reprend après une pause, sinon joue la chanson (depuis le début) ; en lecture : pause. */
  function togglePlay() {
    if (L.mode && !L.paused) {
      SS.audio.pause();
      L.paused = true;
    } else if (L.mode && L.paused) {
      L.paused = false;
      SS.audio.resume();
    } else if (mixStep()) mixPlay();
    else if (sceneStep()) playScene(S.wiz.hscene);
    else listenSong(0);
    markListen();
  }

  /** Barre du haut : bouton Lecture, Stop, tempo, position et tonalité suivent l'écoute de l'assistant. */
  function updateTransport() {
    if (!S.wiz) return;
    const { res } = wizSong();
    const playing = !!L.mode && !L.paused;
    const play = $('#play');
    play.classList.toggle('playing', playing);
    play.classList.toggle('paused', !!L.mode && L.paused);
    play.setAttribute('aria-pressed', String(playing));
    play.title = playing ? 'Pause (Espace)' : L.paused ? 'Reprendre (Espace)' : sceneStep() || (mixStep() && mixScope() !== 'song') ? 'Écouter la scène en boucle (Espace)' : 'Écouter la chanson (Espace)';
    play.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
    $('#stop').disabled = !L.mode;
    syncQuick();
    const inp = $('#tempo');
    if (document.activeElement !== inp) inp.value = tempo();
    const sc = res && L.scene ? res.scenes.find((x) => x.id === L.scene) : null;
    let pos = '1 . 1 . 1';
    if (sc && L.step >= 0) {
      const st = L.step % (sc.bars * 16);
      pos = `${Math.floor(st / 16) + 1} . ${Math.floor((st % 16) / 4) + 1} . ${(st % 4) + 1}`;
    }
    $('#position').textContent = pos;
    $('#lcdTitle').textContent = sc ? `${sc.name}${L.mode === 'scene' ? ' · en boucle' : ''}${L.paused ? ' · en pause' : ''}` : 'À l’arrêt';
    // tonalité : celle de la scène qu'on entend (ou qu'on regarde à l'étape Mélodie), sinon celle de la chanson
    const shown = sc || (res && sceneStep() ? res.scenes.find((x) => x.id === S.wiz.hscene) : null);
    const key = (shown && shown.key) || (res && res.key);
    $('#wizKeyName').textContent = key ? SS.harmony.label(key) : '—';
    $('#wizKeyInfo').textContent = key ? keyInfo(key) : '';
    $('#wizKey').title = key ? `Tonalité : ${SS.harmony.label(key)} · ${keyInfo(key)}` : 'Tonalité de la chanson';
  }

  /** « 3 ♭ · i = Cm » : armure (gamme de référence) et accord de tonique. */
  function keyInfo(key) {
    const H = SS.harmony;
    try {
      const m = H.MODES.find((x) => x.id === key.mode);
      const ref = H.scale({ tonic: key.tonic, mode: m && m.fam === 'major' ? 'major' : 'minor' });
      const fl = ref.filter((d) => d.name.includes('♭')).length;
      const sh = ref.filter((d) => d.name.includes('♯')).length;
      const sig = fl ? `${fl} ♭` : sh ? `${sh} ♯` : 'sans altération';
      const tonic = H.chords(key).diatonic[0];
      return `${sig} · ${tonic.numeral} = ${tonic.name}`;
    } catch (e) {
      return '';
    }
  }

  /* ---------- Étape Mix : la console de la chanson, pour toute la chanson ou une scène ----------
   * Le modèle et son application à la création sont dans js/wizmix.js (SS.wizMix, S.wiz.mix) ; ici, l'écran :
   *  - à gauche, la portée : « Toute la chanson » (réglage de base) puis une scène (réglages propres, clés = section) ;
   *  - une tranche par instrument (la batterie : une par élément, sous un cadre), puis le Master ;
   *  - le bouton FX ouvre le tiroir des effets de la tranche, qui écrit dans la portée choisie.
   * Dans une scène, seuls le volume, Muet, le filtre et les envois hall / écho / Cosmos s'automatisent (voir wizmix.js) : les autres
   * réglages sont grisés (« chanson seulement »). L'écoute joue la scène choisie en boucle (ou toute la chanson) avec le mix appliqué.
   */
  const mixStep = () => !!S.wiz && S.wiz.step === ST.mix;
  const mixScope = () => S.wiz.mixScope || 'song';
  const MIX_FX = [
    ['eq', 'EQ', 'Graves, médiums, aigus'], ['comp', 'Compresseur', 'Tient le niveau'], ['filter', 'Filtre', 'Passe-bas qui s’ouvre'],
    ['chorus', 'Chorus', 'Élargit, fait onduler'], ['delay', 'Delay', 'Écho calé sur le tempo'], ['reverb', 'Reverb', 'Espace propre à la piste'],
    ['sends', 'Envois', 'Bus du morceau : plate, hall, écho, Cosmos'], ['sidechain', 'Sidechain', 'Pompe sur le kick'],
  ];
  /** Réglages qu'une scène peut avoir en propre (le reste vaut pour toute la chanson). */
  const mixSceneOk = (path) => path === 'vol' || path === 'mute' || /^fx\.filter\./.test(path) || /^fx\.sends\.(hall|echo|cosmos)$/.test(path);
  const mixDb = (v) => `${v > 0 ? '+' : ''}${(+v).toFixed(1)} dB`;
  const mixPan = (p) => (Math.abs(p) < 0.03 ? 'C' : `${p < 0 ? 'G' : 'D'} ${Math.round(Math.abs(p) * 100)}`);

  /** Met le mix en phase avec les pistes de l'assistant (première visite : le réglage automatique du style). */
  function mixSync() {
    const tr = wizCols().map((c) => ({ type: c.o.type, sound: c.o.sound, band: c.o.band, levelKey: c.o.levelKey }));
    const style = (tr.find((t) => t.band) || { band: {} }).band.style || 'synthwave';
    S.wiz.mix = SS.wizMix.sync(S.wiz.mix, style, tr);
    return S.wiz.mix;
  }
  const mixSig = () => JSON.stringify(S.wiz.mix);
  /** Un réglage a changé : l'écoute en cours le prend sans tout reconstruire. */
  let mixTimer = 0;
  function mixTouched() {
    if (!L.proj || !L.mode) return;
    clearTimeout(mixTimer);
    mixTimer = setTimeout(() => S.wiz && L.proj && liveMix(), 40);
  }
  function mixSet(id, path, value) {
    SS.wizMix.set(S.wiz.mix, mixScope(), id, path, value);
    mixTouched();
  }
  const mixEqSvg = (f) => {
    const W = 400, H = 90, y = (db) => H / 2 - db * 3.5;
    const pts = [];
    for (let x = 0; x <= W; x += 8) {
      const t = x / W;
      const db = f.on ? f.low * Math.exp(-((t - 0.1) ** 2) / 0.02) + f.mid * Math.exp(-((t - 0.5) ** 2) / 0.03) + f.high * Math.exp(-((t - 0.9) ** 2) / 0.02) : 0;
      pts.push(`${x},${y(db).toFixed(1)}`);
    }
    return h('div', { class: 'mx-eq', html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="currentColor" opacity=".25"/><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>` });
  };

  /** Le bouton FX montre combien d'effets sont actifs ; la liste, lesquels. */
  function mixFxOn(f, master) {
    const out = [];
    MIX_FX.forEach(([k, name]) => {
      if (master && k !== 'eq' && k !== 'comp') return;
      const on = k === 'sends' ? ['plate', 'hall', 'echo', 'cosmos'].some((s) => f.sends[s] > 0) : f[k].on;
      if (on) out.push([k, name]);
    });
    return out;
  }

  function renderMix() {
    const { cols, res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const M = SS.wizMix;
    const mix = mixSync();
    if (mixScope() !== 'song' && !res.scenes.some((x) => x.sec === mixScope())) S.wiz.mixScope = 'song';
    const scope = mixScope();
    const scene = res.scenes.find((x) => x.sec === scope) || null;
    const keep = $('#bwMix');
    const scrollTop = keep ? keep.scrollTop : 0;
    const keepCons = keep && $('.mx-console', keep);
    const scrollLeft = keepCons ? keepCons.scrollLeft : 0;
    const focus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.mx ? [document.activeElement.dataset.mx, document.activeElement.dataset.id] : null;
    const fxTab = document.activeElement && document.activeElement.closest && document.activeElement.closest('#mxFx') && document.activeElement.dataset.tab ? document.activeElement.dataset.tab : null;
    const fxPaneTop = $('#mxFx .mx-fxin') ? $('#mxFx .mx-fxin').scrollTop : 0;

    // couleur et instrument de chaque tranche : ceux de la première piste de l'assistant qui la porte
    const colOf = new Map();
    cols.forEach((c) => !colOf.has(M.idOf(c.o)) && colOf.set(M.idOf(c.o), c));
    const strips = M.strips(cols.map((c) => ({ band: c.o.band })));
    const drumCol = cols.find((c) => c.role === 'drums');
    const kit = drumCol ? (B().KITS[kitOf(musState()[drumCol.musician])] || {}).label || '' : '';
    const ownOf = (id) => (scene && mix.own[scope] && mix.own[scope][id]) || null;

    // ---- portée : toute la chanson, puis une scène (colonne de gauche)
    const nav = h(
      'nav',
      { class: 'bh-scenes mx-scenes', 'aria-label': 'Portée du mixage' },
      h('div', { class: 'bh-label' }, 'Mixer pour'),
      h(
        'button',
        { type: 'button', class: 'bh-scene mx-song' + (scope === 'song' ? ' on' : ''), id: 'mxSong', 'aria-pressed': String(scope === 'song'), onclick: () => mixPickScope('song') },
        h('span', { class: 'bh-sname' }, h('b', {}, 'Toute la chanson')),
        h('small', { class: 'bh-ssub' }, 'Réglage de base de chaque piste')
      ),
      h('div', { class: 'bh-label' }, 'ou une scène'),
      ...res.scenes.map((x) => {
        const n = M.ownCount(mix, x.sec);
        return h(
          'button',
          { type: 'button', class: 'bh-scene' + (x.sec === scope ? ' on' : ''), style: `--c:${secColor(x.sec)}`, 'data-scene': x.id, 'data-sec': x.sec, 'aria-pressed': String(x.sec === scope), onclick: () => mixPickScope(x.sec) },
          h('span', { class: 'bh-sname' }, h('b', {}, x.name), h('small', {}, `${x.bars} mes.`)),
          h('small', { class: 'bh-ssub mx-ownct' + (n ? ' own' : ''), 'data-n': n }, n ? `${n} réglage${n > 1 ? 's' : ''} propre${n > 1 ? 's' : ''}` : 'comme la chanson')
        );
      })
    );

    // ---- bandeau de portée
    const same = scene ? res.scenes.filter((x) => x.id !== scene.id && kindOf(x.sec) === kindOf(scene.sec)) : [];
    const nOwn = scene ? M.ownCount(mix, scope) : 0;
    const bar = h(
      'div',
      { class: 'mx-scope', style: `--c:${scene ? secColor(scene.sec) : 'var(--bw-text)'}` },
      h('div', { class: 'mx-who' }, h('i', {}), scene ? `${scene.name} seulement` : 'Toute la chanson'),
      h('p', {}, scene
        ? `Ce que tu touches ici ne vaut que pour « ${scene.name} » ; le trait gris sur le fader montre le réglage de la chanson.`
        : 'Chaque réglage vaut pour toutes les scènes, sauf celles qui ont leur propre réglage (point doré).'),
      scene ? h('button', { type: 'button', class: 'btn', id: 'mxCopy', disabled: !nOwn || !same.length, title: same.length ? `Copie ces réglages vers : ${same.map((x) => x.name).join(', ')}` : 'Aucune autre scène du même type', onclick: () => { M.copyToSameType(mix, scope, same.map((x) => x.sec)); mixAfter(); } }, 'Copier vers les scènes du même type') : null,
      scene ? h('button', { type: 'button', class: 'btn', id: 'mxResetScene', disabled: !nOwn, onclick: () => { M.reset(mix, scope); mixAfter(); } }, `↺ Comme la chanson (${nOwn})`) : null
    );

    // ---- console
    const stripEl = (s) => {
      const id = s.id;
      const master = id === 'master';
      const e = M.eff(mix, scope, id);
      const o = ownOf(id);
      const isOwn = !!o && Object.keys(o).length > 0;
      const song = master ? mix.master : mix.tracks[id];
      const c = colOf.get(id);
      const color = master ? '#d0d0da' : c ? c.o.color : '#9c9ca8';
      const inst = master ? 'Mastering' : c ? B().describe(c.o).name : '';
      const lockedAll = !!scene && master; // le Master ne s'automatise pas
      const on = mixFxOn(e.fx, master);
      const ownFx = o && o.fx ? Object.keys(o.fx) : [];
      const pct = (v) => (Math.max(-40, Math.min(6, v)) + 40) / 46;
      const ctl = (path, attrs) => ({ 'data-mx': path, 'data-id': id, ...attrs });
      const only = (path) => !!scene && !mixSceneOk(path);
      const open = S.wiz.mixOpen === id;
      return h(
        'div',
        { class: 'mx-strip' + (s.group ? ' drum' : '') + (master ? ' master' : '') + (open ? ' sel' : '') + (isOwn ? ' own' : ''), style: `--c:${color}`, 'data-id': id },
        h('div', { class: 'mx-name' }, s.name, h('small', {}, inst)),
        h('button', { type: 'button', class: 'mx-fxb' + (open ? ' open' : ''), 'data-fx': id, 'aria-expanded': String(open), title: lockedAll ? 'Le Master se règle pour toute la chanson' : `Effets de ${s.name}`, disabled: lockedAll, onclick: () => mixFxToggle(id) }, 'FX ', h('span', { class: 'n' }, String(on.length))),
        h('div', { class: 'mx-fxlist' }, ...(on.length ? on.slice(0, 4).map(([k, name]) => h('span', { class: ownFx.includes(k) ? 'own' : '' }, name)) : [h('span', {}, 'aucun effet')])),
        master
          ? h('div', { class: 'mx-pan' }, h('div', {}, h('span', {}, 'Stéréo'), h('b', {}, '—')), h('input', { type: 'range', disabled: true, value: 60, 'aria-label': 'Largeur du Master' }), scene ? h('small', { class: 'mx-only' }, 'chanson seulement') : null)
          : h('div', { class: 'mx-pan' }, h('div', {}, h('span', {}, 'Pan'), h('b', {}, mixPan(e.pan))), h('input', { type: 'range', min: -1, max: 1, step: 0.05, value: e.pan, ...ctl('pan', { 'aria-label': `Panoramique ${s.name}`, disabled: only('pan'), title: only('pan') ? 'chanson seulement' : null }) }), only('pan') ? h('small', { class: 'mx-only' }, 'chanson seulement') : null),
        h(
          'div',
          { class: 'mx-fader' },
          h('input', { type: 'range', min: -40, max: 6, step: 0.1, value: e.vol, ...ctl('vol', { 'aria-label': `Volume ${s.name}`, disabled: lockedAll, orient: 'vertical' }) }),
          scene && o && o.vol != null ? h('span', { class: 'mx-ghost', title: `Chanson : ${mixDb(song.vol)}`, style: `top:${((1 - pct(song.vol)) * 100).toFixed(1)}%` }) : null
        ),
        h('div', { class: 'mx-db' + (o && o.vol != null ? ' own' : '') }, mixDb(e.vol)),
        master
          ? h('div', { class: 'mx-ms' }, h('button', { type: 'button', disabled: true }, '—'), h('button', { type: 'button', disabled: true }, '—'))
          : h(
              'div',
              { class: 'mx-ms' },
              h('button', { type: 'button', class: 'm' + (e.mute ? ' on' : ''), 'data-mute': id, 'aria-pressed': String(!!e.mute), title: 'Muet', onclick: () => { mixSet(id, 'mute', !e.mute); mixAfter(); } }, 'M'),
              h('button', { type: 'button', class: 's' + (song.solo ? ' on' : ''), 'data-solo': id, 'aria-pressed': String(!!song.solo), disabled: !!scene, title: scene ? 'chanson seulement' : 'Solo', onclick: () => { mixSet(id, 'solo', !song.solo); mixAfter(); } }, 'S')
            ),
        isOwn ? h('button', { type: 'button', class: 'mx-back', 'data-back': id, title: 'Revient au réglage de la chanson pour cette tranche', onclick: () => { M.reset(mix, scope, id); mixAfter(); } }, '↺ chanson') : null
      );
    };
    const drums = strips.filter((s) => s.group);
    const rest = strips.filter((s) => !s.group);
    const dCol = '#e3179c';
    const consoleEl = h(
      'div',
      { class: 'mx-console' },
      drums.length ? h('div', { class: 'mx-group', style: `--c:${dCol}` }, h('div', { class: 'mx-ghead' }, `Batterie${kit ? ' · ' + kit : ''}`, h('small', {}, `${drums.length} élément${drums.length > 1 ? 's' : ''}`)), h('div', { class: 'mx-gstrips' }, ...drums.map(stripEl))) : null,
      ...rest.map(stripEl),
      stripEl({ id: 'master', name: 'Master', group: null })
    );

    const root = h('div', { class: 'bwc mx', id: 'bwMix' }, bar, consoleEl, mixDrawer(res, scene, strips, colOf));
    const onInput = (ev) => {
      const el = ev.target;
      const path = el.dataset && el.dataset.mx;
      if (!path || el.type === 'checkbox') return;
      const id = el.dataset.id;
      const v = +el.value;
      mixSet(id, path, v);
      const lab = el.previousElementSibling && el.previousElementSibling.querySelector && el.previousElementSibling.querySelector('b');
      if (lab) lab.textContent = /eq\.(low|mid|high)$/.test(path) ? mixDb(v) : path === 'pan' ? mixPan(v) : `${Math.round(v)} %`;
      if (path === 'vol') {
        const st = el.closest('.mx-strip');
        const db = $('.mx-db', st);
        db.textContent = mixDb(v);
        db.classList.toggle('own', !!scene);
      }
    };
    root.addEventListener('input', onInput);
    root.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!el.dataset || !el.dataset.mx) return;
      if (el.type === 'checkbox') mixSet(el.dataset.id, el.dataset.mx, el.checked);
      mixAfter();
    });
    splitView(nav, root);
    root.scrollTop = scrollTop;
    const cons = $('.mx-console', root);
    if (cons) cons.scrollLeft = scrollLeft;
    if (focus) {
      const again = root.querySelector(`[data-mx="${focus[0]}"][data-id="${focus[1]}"]`);
      if (again && !again.disabled) again.focus({ preventScroll: true });
    }
    if (fxTab) $(`#mxFx [data-tab="${fxTab}"]`)?.focus({ preventScroll: true });
    mixFxPlace(false);
    const fxIn = $('#mxFx .mx-fxin');
    if (fxIn) fxIn.scrollTop = fxPaneTop;
    mixFxListen();
    renderWizSteps();
  }

  /* ---------- Popover des effets (#mxFx) ----------
   * Panneau flottant (position: fixed) ancré à la tranche ouverte : à droite s'il y a la place dans la zone visible de la
   * console, sinon à gauche ; haut aligné sur celui de la tranche, borné à la fenêtre (le contenu défile dedans). Il suit la
   * tranche quand la console ou la page défile ; si la tranche sort de la vue, il se ferme (un panneau resté en l'air, détaché
   * de sa tranche, serait trompeur). Sous 760 px : feuille du bas (CSS), aucune position calculée.
   */
  const phoneMq = window.matchMedia('(max-width: 760px)');
  function mixFxPlace(closeIfGone) {
    const pop = $('#mxFx');
    if (!pop || pop.hidden || !S.wiz || !S.wiz.mixOpen) return;
    const id = S.wiz.mixOpen;
    const strip = $(`#bwMix .mx-strip[data-id="${id}"]`);
    if (!strip) return;
    const set = (o) => ['left', 'top', 'maxHeight', 'width'].forEach((k) => (pop.style[k] = o ? o[k] : ''));
    if (phoneMq.matches) return set(null);
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const sr = strip.getBoundingClientRect();
    const cons = strip.closest('.mx-console');
    const cr = cons ? cons.getBoundingClientRect() : sr;
    const gone = sr.right < cr.left + 24 || sr.left > cr.right - 24 || sr.bottom < 24 || sr.top > vh - 24 || sr.right < 24 || sr.left > vw - 24;
    if (gone && closeIfGone) return mixFxClose(false);
    const gap = 12;
    const lo = Math.max(8, cr.left);
    const hi = Math.min(vw - 8, cr.right);
    const W = 560;
    const roomR = hi - sr.right - gap;
    const roomL = sr.left - gap - lo;
    const right = roomR >= W || roomR >= roomL;
    const w = Math.max(280, Math.min(W, right ? roomR : roomL, vw - 16));
    const left = right ? sr.right + gap : sr.left - gap - w;
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(left, vw - 8 - w)) + 'px';
    pop.style.maxHeight = vh - 16 + 'px';
    const h = pop.offsetHeight;
    const top = Math.max(8, Math.min(sr.top, vh - 8 - h));
    pop.style.top = top + 'px';
    pop.classList.toggle('left', !right);
    const btn = $('.mx-fxb', strip);
    const br = (btn || strip).getBoundingClientRect();
    pop.style.setProperty('--arr', Math.max(14, Math.min(br.top + br.height / 2 - top, h - 14)) + 'px');
  }
  let fxRaf = 0;
  function mixFxListen() {
    if (mixFxListen.on) return;
    mixFxListen.on = true;
    const again = (ev) => {
      if (!$('#mxFx') || $('#mxFx').hidden || (ev && ev.target && ev.target.nodeType === 1 && ev.target.closest && ev.target.closest('#mxFx'))) return;
      cancelAnimationFrame(fxRaf);
      fxRaf = requestAnimationFrame(() => mixFxPlace(true));
    };
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    // clic en dehors (ni console ni popover) : ferme ; une cible déjà retirée du DOM (réaffichage) ne compte pas
    document.addEventListener('click', (ev) => {
      const pop = $('#mxFx');
      if (!pop || pop.hidden || !S.wiz || !ev.target.isConnected) return;
      if (ev.target.closest('#mxFx, .mx-console')) return;
      mixFxClose(false);
    });
  }
  function mixFxToggle(id) {
    if (S.wiz.mixOpen === id) return mixFxClose(true);
    S.wiz.mixOpen = id;
    renderMix();
    const t = $('#mxFx .mx-tabs [aria-selected="true"]') || $('#mxFx button');
    if (t) t.focus({ preventScroll: true });
  }
  /** Ferme le popover ; vrai s'il était ouvert. `focus` : le focus revient au bouton FX de la tranche. */
  function mixFxClose(focus) {
    const id = S.wiz && S.wiz.mixOpen;
    if (!id) return false;
    S.wiz.mixOpen = null;
    renderMix();
    if (focus) $(`#bwMix .mx-fxb[data-fx="${id}"]`)?.focus({ preventScroll: true });
    return true;
  }
  /** Un réglage vient d'être posé (relâché, case, bouton) : l'écran est redessiné, l'écoute suit. */
  function mixAfter() {
    mixTouched();
    renderMix();
  }
  /** Choix de la portée : la lecture en cours suit (la scène en boucle, ou toute la chanson). */
  function mixPickScope(scope) {
    if (scope === mixScope()) return;
    S.wiz.mixScope = scope;
    renderMix();
    updateTransport();
    if (!L.mode || L.paused) return;
    const sc = scope === 'song' ? null : S.wiz.res.scenes.find((x) => x.sec === scope);
    if (sc) playScene(sc.id);
    else if (L.mode === 'scene') listenSong(0);
  }
  /** Lecture dans l'étape Mix : la scène choisie en boucle, ou toute la chanson. */
  function mixPlay() {
    const { res } = wizSong();
    const sc = mixScope() === 'song' || !res ? null : res.scenes.find((x) => x.sec === mixScope());
    if (sc) playScene(sc.id);
    else listenSong(0);
  }

  /** Tiroir des effets de la tranche ouverte : onglets à gauche, réglages à droite ; écrit dans la portée choisie. */
  function mixDrawer(res, scene, strips, colOf) {
    const id = S.wiz.mixOpen;
    const M = SS.wizMix;
    const mix = S.wiz.mix;
    const st = id && (id === 'master' ? { id, name: 'Master' } : strips.find((s) => s.id === id));
    if (!st || (scene && id === 'master')) {
      if (st) S.wiz.mixOpen = null;
      return h('section', { class: 'mx-fx', hidden: true, id: 'mxFx' });
    }
    const master = id === 'master';
    const scope = mixScope();
    const e = M.eff(mix, scope, id);
    const f = e.fx;
    const o = (scene && mix.own[scope] && mix.own[scope][id]) || null;
    const ownFx = (o && o.fx) || {};
    const c = colOf.get(id);
    const color = master ? '#d0d0da' : c ? c.o.color : '#9c9ca8';
    const keys = MIX_FX.filter(([k]) => !master || k === 'eq' || k === 'comp');
    if (!keys.some(([k]) => k === S.wiz.mixTab)) S.wiz.mixTab = keys[0][0];
    const k = S.wiz.mixTab;
    const info = MIX_FX.find((x) => x[0] === k);
    const x = f[k];
    const pct = (v) => `${Math.round(v)} %`;
    const lock = (path) => !!scene && !mixSceneOk(path);
    const knob = (path, label, v, min, max, step, fmt) =>
      h('div', { class: 'mx-k' }, h('label', {}, label, h('b', {}, fmt(v))), h('input', { type: 'range', min, max, step, value: v, 'data-mx': path, 'data-id': id, 'aria-label': label, disabled: lock(path), title: lock(path) ? 'chanson seulement' : null }));
    const on = (path, val) => h('label', { class: 'sw' }, h('input', { type: 'checkbox', 'data-mx': path, 'data-id': id, checked: val, disabled: lock(path) }), val ? 'actif' : 'éteint');
    const onlyKeys = !scene || k === 'filter' || k === 'sends';
    const pane = [h('h4', {}, info[1], k === 'sends' ? null : on(`fx.${k}.on`, !!x.on), ownFx[k] ? h('span', { class: 'mx-tag' }, `propre à ${scene.name}`) : null)];
    pane.push(h('p', { class: 'hint' }, info[2] + (scene ? (onlyKeys ? ` · ce réglage ne vaudra que pour « ${scene.name} »` : ' · chanson seulement : le réglage de la chanson vaut dans toutes les scènes') : ' · pour toute la chanson') + '.'));
    if (k === 'eq') pane.push(mixEqSvg(x), h('div', { class: 'mx-knobs' }, knob('fx.eq.low', 'Graves (120 Hz)', x.low, -12, 12, 0.5, mixDb), knob('fx.eq.mid', 'Médiums (800 Hz)', x.mid, -12, 12, 0.5, mixDb), knob('fx.eq.high', 'Aigus (8 kHz)', x.high, -12, 12, 0.5, mixDb)));
    if (k === 'comp') pane.push(h('div', { class: 'mx-knobs' }, knob('fx.comp.amount', 'Quantité', x.amount, 0, 100, 1, pct)));
    if (k === 'filter') pane.push(h('div', { class: 'mx-knobs' }, knob('fx.filter.cut', 'Ouverture', x.cut, 0, 100, 1, pct)), h('p', { class: 'hint' }, 'Astuce : filtre fermé dans l’intro, ouvert au refrain (réglage propre à la scène).'));
    if (k === 'chorus' || k === 'reverb') pane.push(h('div', { class: 'mx-knobs' }, knob(`fx.${k}.mix`, 'Dosage', x.mix, 0, 100, 1, pct)));
    if (k === 'delay') {
      pane.push(h('div', { class: 'mx-knobs' }, knob('fx.delay.mix', 'Dosage', x.mix, 0, 100, 1, pct), h('div', { class: 'mx-k' }, h('label', {}, 'Temps', h('b', {}, (SS.DELAY_TIMES.find((d) => d.id === x.time) || { label: x.time }).label)), h('div', { class: 'mx-chips' }, ...SS.DELAY_TIMES.map((d) => h('button', { type: 'button', class: 'chip' + (x.time === d.id ? ' active' : ''), 'data-dtime': d.id, disabled: lock('fx.delay.time'), onclick: () => { mixSet(id, 'fx.delay.time', d.id); mixAfter(); } }, d.label))))));
    }
    if (k === 'sends') pane.push(h('div', { class: 'mx-knobs' }, ...['plate', 'hall', 'echo', 'cosmos'].map((s) => knob(`fx.sends.${s}`, { plate: 'Plate', hall: 'Hall', echo: 'Écho à bande', cosmos: 'Cosmos' }[s] + (lock(`fx.sends.${s}`) ? ' · chanson seulement' : ''), x[s], 0, 100, 1, pct))), h('p', { class: 'hint' }, 'Les bus sont partagés par toutes les pistes : leurs réglages (durée, couleur) sont dans la fenêtre FX de la piste, une fois la chanson créée.'));
    if (k === 'sidechain') pane.push(h('div', { class: 'mx-knobs' }, knob('fx.sidechain.amount', 'Profondeur', x.amount, 0, 100, 1, pct)), h('p', { class: 'hint' }, 'La piste baisse à chaque coup de kick : la « pompe » de l’EDM et de la synthwave.'));
    const tab = ([key, name]) => {
      const t = f[key];
      const act = key === 'sends' ? ['plate', 'hall', 'echo', 'cosmos'].some((s) => t[s] > 0) : t.on;
      return h('button', { type: 'button', role: 'tab', class: key === k ? 'on' : '', 'data-tab': key, 'aria-selected': String(key === k), onclick: () => { S.wiz.mixTab = key; renderMix(); } }, name, h('i', { class: act ? 'act' : '' }, act ? (ownFx[key] ? 'scène' : 'on') : 'off'));
    };
    return h(
      'section',
      { class: 'mx-fx', id: 'mxFx', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'mxFxTitle', style: `--c:${color}` },
      h('span', { class: 'mx-fxarr', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'mx-fxin' },
        h('div', { class: 'mx-fxh' }, h('b', { id: 'mxFxTitle' }, `Effets · ${st.name}`), h('span', { class: 'mx-tag' }, scene ? `${scene.name} seulement` : 'Toute la chanson'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-small', id: 'mxFxClose', onclick: () => mixFxClose(true) }, 'Fermer')),
        h('div', { class: 'mx-tabs', role: 'tablist', 'aria-label': 'Effets' }, ...keys.map(tab)),
        h('div', { class: 'mx-pane' }, ...pane)
      )
    );
  }

  /* ---------- Étape Effets et transitions ----------
   * La frise montre les scènes dans l'ordre de l'arrangement ; entre deux blocs, une pastille ronde (nombre d'effets actifs) choisit la
   * jonction à régler. Les réglages d'une jonction sont gardés par couple de sections, « avant>après » : S.wiz.fx.junctions[clé] =
   * { riser, hp, rev, gap, impact, down } (partiels : ce qui n'est pas touché est ce que fait déjà le plan, voir junctionDefaults
   * dans js/bandsong.js, qui lit S.wiz.fx par l'option fx de SS.bandSong.build). Percussions : S.wiz.fx.perc = { style, loops: { section: { sh, cg, tom } } }.
   * Sans retouche, S.wiz.fx est vide et la chanson est celle du plan : l'étape montre ce que le plan fait déjà.
   * Sans musicien Effets (ou Percussionniste) dans le groupe, les réglages qui en dépendent sont remplacés par un message et un
   * bouton qui l'ajoute au groupe. « ▶ Écouter la transition » joue les dernières mesures de la scène d'avant puis les premières de
   * la suivante, en boucle (listenJunction).
   */
  const fxState = () => (S.wiz.fx = S.wiz.fx || {});
  /** Option fx de SS.bandSong.build : les retouches de l'étape, null tant qu'il n'y en a pas (la chanson est celle du plan). */
  function fxOpts() {
    const f = S.wiz && S.wiz.fx;
    if (!f) return null;
    return (f.junctions && Object.keys(f.junctions).length) || (f.perc && ((f.perc.loops && Object.keys(f.perc.loops).length) || f.perc.style)) ? f : null;
  }
  const FX_DROP = /^(drop|peak|chorus)/;
  const FX_DROPS = { drop: 'drops', peak: 'sommets', chorus: 'refrains' };
  const isDropSec = (sec) => FX_DROP.test(kindOf(sec));
  const hasRole = (role) => musicians().some((m) => m.role === role);
  /** Les jonctions de l'arrangement : [{ i, from, to (scènes), key, at (mesure où commence la scène d'après, 0 = début) }]. */
  function fxJoins(res) {
    let at = 0;
    return res.song.slice(1).map((b, i) => {
      const a = res.song[i];
      const from = res.scenes.find((x) => x.id === a.scene);
      const to = res.scenes.find((x) => x.id === b.scene);
      at += from.bars * a.repeat;
      return { i, from, to, key: `${from.sec}>${to.sec}`, at };
    });
  }
  /** Réglages en vigueur d'une jonction (le plan, puis les retouches). */
  const fxEff = (j) => SS.bandSong.junctionEff(specEff(), j.from.sec, j.to.sec, S.wiz.fx);
  /** Effets actifs d'une jonction ; sans musicien Effets, ceux de sa piste ne comptent pas. */
  function fxCount(e, withFx) {
    return [withFx && e.riser.on, e.hp.on, withFx && e.rev.on, e.gap.len > 0, withFx && e.impact.on, withFx && e.down.on, ...FX_WRITE.map((k) => e[k].on)].filter(Boolean).length;
  }
  function fxSummary(res) {
    const withFx = hasRole('fx');
    const keys = new Set(fxJoins(res).filter((j) => fxCount(fxEff(j), withFx) > 0).map((j) => j.key));
    const out = [];
    if (keys.size) out.push(`${keys.size} transition${keys.size > 1 ? 's' : ''}`);
    if (hasRole('perc')) out.push('percus');
    return out.join(' · ') || 'Aucun effet';
  }
  /** Jonction choisie : avant le premier drop, sinon la première. */
  function fxSel(joins) {
    if (S.wiz.fxSel == null || S.wiz.fxSel >= joins.length) {
      const d = joins.findIndex((j) => isDropSec(j.to.sec));
      S.wiz.fxSel = Math.max(0, d);
    }
    return joins[S.wiz.fxSel];
  }
  /** Modifie les réglages d'un effet de la jonction `key` (le reste de la jonction garde ce que fait le plan). */
  function fxSet(key, fxk, patch) {
    const f = fxState();
    const J = (f.junctions = f.junctions || {});
    const o = (J[key] = J[key] || {});
    o[fxk] = { ...(o[fxk] || {}), ...patch };
    fxChanged();
  }
  function fxChanged() {
    renderWiz();
    draftSoon();
  }
  /** Ajoute au groupe le musicien d'un rôle (Effets, Percussionniste) de l'inspiration : même liste qu'à l'étape Instruments. */
  function fxAddMember(role) {
    const g = group();
    const mu = preset().musicians.find((x) => x.role === role);
    if (!mu || g.list.some((r) => r.id === mu.id) || !BG().canAdd(g)) return;
    const was = ST.fx;
    g.list.push({ id: mu.id, base: mu.id, name: BG().freeName(g.list, role === 'fx' ? 'Effets' : 'Percussionniste') });
    if (S.wiz.mix) mixSync();
    dropListen();
    // le Percussionniste ajoute une étape instrument : l'étape Effets et les suivantes prennent un numéro de plus
    const d = ST.fx - was;
    S.wiz.seen = new Set([...S.wiz.seen].map((n) => (n >= was ? n + d : n)));
    S.wiz.step = ST.fx;
    renderWiz();
    draftSoon();
  }

  const FX_ROWS = [
    ['riser', 'Montée de bruit', 'Un souffle qui monte jusqu’à la scène'],
    ['hp', 'Filtre passe-haut global', 'Allège tout le mix pendant la montée'],
    ['rev', 'Cymbale inversée', 'Aspire vers le premier temps de la scène'],
    ['gap', 'Coupure avant (T06 · silence)', 'Tous les rôles se taisent ; reverb et écho continuent de sonner'],
    ['impact', 'Impact au début', 'Coup grave + crash sur le premier temps'],
    ['down', 'Descente (downlifter)', 'Retombée après l’impact'],
    // procédés d'écriture T01–T05 de la formation (chap. 23, § 6) : ils réécrivent les parties, sans piste Effets
    ['retrait', 'Retrait (T01)', 'La batterie se retire avant le retour ; le charleston garde le compte'],
    ['frag', 'Fragmentation (T02)', 'La mélodie des 2 dernières mesures : 1 mesure du motif, puis ½ mesure deux fois'],
    ['pedal', 'Pédale (T03)', 'La basse tient une note sous les accords qui changent : écouter les frottements'],
    ['widen', 'Élargissement (T04)', 'Accords et arpèges s’ouvrent à l’octave, en haut puis en bas, avec une marge sous le sommet'],
    ['susp', 'Suspension (T05)', 'Le premier accord de la scène retarde sa tierce par la quarte, puis se résout'],
  ];
  const FX_WRITE = ['retrait', 'frag', 'pedal', 'widen', 'susp'];
  const FX_NEEDS = { riser: true, rev: true, impact: true, down: true }; // effets joués par la piste Effets
  const FX_FILTERS = [['lp', 'Passe-bas qui s’ouvre'], ['hp', 'Passe-haut qui s’ouvre'], ['none', 'Sans filtre']];
  const FX_IMPACTS = [['both', 'Impact grave + crash'], ['crash', 'Crash seul'], ['impact', 'Impact grave']];

  /** Aperçu de la jonction : de −8 à +2 mesures autour d'elle, une ligne par effet. */
  function fxPreview(e, prevBars, withFx, toName) {
    const x = (m) => `${((Math.max(-8, Math.min(2, m)) + 8) * 10).toFixed(2)}%`;
    const bar = (k, label, a, b, on, extra = '') =>
      h('div', { class: 'fx-pl' + (on ? '' : ' off'), 'data-k': k }, h('i', {}, label), h('div', { style: `left:${x(a)};width:calc(${x(b)} - ${x(a)});${extra}` }));
    const rl = Math.min(e.riser.len, prevBars);
    const axis = h('div', { class: 'fx-axis' }, ...Array.from({ length: 10 }, (_, i) => h('span', { class: i === 8 ? 'drop' : '' }, i === 8 ? toName : i === 9 ? '+1' : `−${8 - i}`)));
    return h(
      'div',
      { class: 'fx-pv', 'aria-hidden': 'true' },
      axis,
      bar('riser', 'Bruit', -rl, 0, withFx && e.riser.on, e.riser.filter === 'none' ? 'background:#9aa7b3' : 'background:linear-gradient(90deg,#3a4651,#cfd8e0)'),
      bar('hp', 'Passe-haut', -prevBars / 2, 0, e.hp.on, 'background:repeating-linear-gradient(90deg,var(--fx) 0 6px,transparent 6px 9px);height:3px;top:8px;bottom:auto'),
      bar('rev', 'Cymbale inversée', -e.rev.len / 16, 0, withFx && e.rev.on),
      bar('gap', 'Coupure', -e.gap.len / 16, 0, e.gap.len > 0, 'background:repeating-linear-gradient(45deg,#e0523a 0 3px,transparent 3px 6px);border:1px solid #e0523a'),
      bar('impact', 'Impact', 0, 0.2, withFx && e.impact.on, 'background:#fff'),
      bar('down', 'Descente', 0.25, 0.25 + e.down.len, withFx && e.down.on),
      e.retrait.on ? bar('retrait', 'Retrait', -e.retrait.len, 0, e.retrait.on, 'background:repeating-linear-gradient(90deg,#c9a24a 0 4px,transparent 4px 8px)') : null,
      e.frag.on ? bar('frag', 'Fragmentation', -2, 0, e.frag.on, 'background:linear-gradient(90deg,#b07ad6 50%,#b07ad6aa 50% 75%,#b07ad666 75%)') : null,
      e.pedal.on ? bar('pedal', 'Pédale', -e.pedal.len, 0, e.pedal.on, 'background:#3fcf3f') : null,
      e.widen.on ? bar('widen', 'Élargissement', -e.widen.len, 0, e.widen.on, 'background:linear-gradient(90deg,#1ea7ff33,#1ea7ff)') : null,
      e.susp.on ? bar('susp', 'Suspension', 0, e.susp.len / 16, e.susp.on, 'background:#1ea7ff') : null,
      h('div', { class: 'fx-dropline', style: `left:calc(120px + (100% - 130px) * .8)` })
    );
  }

  /* ---------- Étape Arrangement (Finaliser) : énergie voulue et mesurée, qui joue où, diagnostic et variations de scène ----------
   * Moteur : SS.arrange (js/arrange.js). La courbe voulue est S.wiz.arr.curve (brouillon). Une variation est un essai A/B sur les
   * réglages d'une scène (S.wiz.arrAb = { sec, label, part, on }) : partsEff le fait entendre, « Garder B » l'écrit dans S.wiz.parts. */
  const AR = () => SS.arrange;
  const arrState = () => S.wiz.arr || (S.wiz.arr = {});
  const arrCurve = () => (AR().CURVES.some((c) => c.id === arrState().curve) ? arrState().curve : 'rise');
  let arrMemo = { sig: null };
  /** Ce que la chanson calculée fait, scène par scène : instruments, énergies, passages, diagnostic. */
  function arrModel(res) {
    const sig = S.wiz.sig + '|' + arrCurve();
    if (arrMemo.sig === sig && arrMemo.res === res) return arrMemo;
    const ins = insSteps();
    const groups = ins.map((T) => ({ id: T.id, cols: T.cols.map((c) => c.id) }));
    const bl = AR().blocks(res);
    const order = [...new Set(bl.list.map((b) => b.sceneId))].map((id) => res.scenes.find((x) => x.id === id));
    const st = order.map((sc) => AR().stats(sc, groups));
    const en = AR().energies(st);
    const scenes = order.map((sc, i) => ({ sc, sec: sc.sec, name: sc.name, e: en[i], counts: st[i].counts }));
    const items = AR().diagnose(scenes, bl.list, arrCurve());
    arrMemo = { sig, res, ins, bl, scenes, items };
    return arrMemo;
  }
  function arrSummary(res) {
    const m = arrModel(res);
    const n = m.items.filter((x) => x.kind === 'warn').length;
    return `${AR().CURVES.find((c) => c.id === arrCurve()).label} · ${n ? `${n} à voir` : 'suit la courbe'}`;
  }
  /** Variations d'une scène pour aller dans le sens voulu (densifier ou alléger) : [{ label, why, part }] (2 au plus). */
  function arrVariants(scn, act) {
    const sc = scn.sc;
    const out = [];
    const plays = (T) => (scn.counts[T.id] || 0) > 0;
    const modeOf = (T) => (partOf(sc.sec, T) || {}).mode || planMode(sc, T);
    const tryPart = (label, why, fn) => {
      const saved = S.wiz.parts;
      S.wiz.parts = JSON.parse(JSON.stringify(saved));
      let part = null;
      try {
        fn();
        part = S.wiz.parts[sc.sec] ? JSON.parse(JSON.stringify(S.wiz.parts[sc.sec])) : null;
      } finally {
        S.wiz.parts = saved;
      }
      if (JSON.stringify(part) !== JSON.stringify(saved[sc.sec] || null)) out.push({ label, why, part });
    };
    const ins = insSteps().filter((T) => T.kind !== 'melody');
    const playing = insSteps().filter(plays).length;
    if (act === 'lighter') {
      for (const kind of ['arp', 'chords', 'drums']) {
        const T = ins.find((x) => x.kind === kind && plays(x));
        if (T && playing > 2) tryPart(`Sans ${T.name}`, `${T.name} se tait dans « ${sc.name} » : la scène respire, la suivante paraîtra plus forte.`, () => putOff(sc.sec, T, true));
      }
      const B = ins.find((x) => x.kind === 'bass' && plays(x));
      if (B && ['8', 'gallop', 'oct', 'roll', 'sync', 'off16', 'pulse8', 'offbeat'].includes(modeOf(B))) tryPart('Basse en blanches', 'La basse pose deux notes par mesure au lieu de courir : moins de pression.', () => putPart(sc.sec, B, { mode: 'half' }));
    } else {
      for (const T of ins.filter((x) => !plays(x))) {
        const where = AR() && arrMemo.scenes ? arrMemo.scenes.filter((x) => (x.counts[T.id] || 0) > 0).length : 0;
        if (!where) continue;
        tryPart(`Avec ${T.name}`, `${T.name} entre dans « ${sc.name} » : une couche de plus, la scène monte d’un cran.`, () => {
          if (mutedIn(sc.sec, T)) putOff(sc.sec, T, false);
          if (!planMode(sc, T) && !(partOf(sc.sec, T) || {}).mode) putPart(sc.sec, T, { mode: SS.bandSong.DEFAULT_MODE[T.kind] });
        });
      }
      const B = ins.find((x) => x.kind === 'bass' && plays(x));
      if (B && ['whole', 'half', 'drone', 'walk', 'quarter'].includes(modeOf(B))) tryPart('Basse en croches', 'Huit croches par mesure : le moteur rythmique accélère sans changer les notes.', () => putPart(sc.sec, B, { mode: '8' }));
      const P = ins.find((x) => x.kind === 'chords' && plays(x));
      if (P && ['sustain', 'swell', 'float'].includes(modeOf(P))) tryPart('Nappe en croches', 'L’accord tenu devient des croches : plus de mouvement, même harmonie.', () => putPart(sc.sec, P, { mode: 'pulse8' }));
    }
    return out.slice(0, 2);
  }
  function startArr(scn, v) {
    S.wiz.arrAb = { sec: scn.sec, label: v.label, why: v.why, part: v.part, on: true };
    renderWiz();
    const now = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === scn.sec);
    if (now && !(L.mode === 'scene' && L.sec === scn.sec && !L.paused)) playScene(now.id);
  }
  function arrAbBar() {
    const t = S.wiz.arrAb;
    if (!t) return h('p', { class: 'dlg-hint', id: 'bwArrHint' }, 'Essaie une variation : la scène tourne en boucle, tu passes de A (la scène) à B (la variation), puis tu gardes celle que tu préfères.');
    const flip = (on) => ((t.on = on), renderWiz());
    const name = (S.wiz.res.scenes.find((x) => x.sec === t.sec) || {}).name || t.sec;
    return h(
      'div',
      { class: 'bwc-ab on', id: 'bwArrAb' },
      h('span', { class: 'bh-lbl' }, 'Essai'),
      h('b', {}, `${name} · ${t.label}`),
      h(
        'span',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Version à l’écoute' },
        h('button', { type: 'button', role: 'radio', id: 'bwArrA', class: t.on ? '' : 'active', 'aria-checked': String(!t.on), onclick: () => flip(false) }, 'A · avant'),
        h('button', { type: 'button', role: 'radio', id: 'bwArrB', class: t.on ? 'active' : '', 'aria-checked': String(t.on), onclick: () => flip(true) }, 'B · essai')
      ),
      h('span', { class: 'dlg-hint' }, t.why),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-small', id: 'bwArrCancel', onclick: () => ((S.wiz.arrAb = null), renderWiz()) }, 'Garder A'),
      h(
        'button',
        {
          type: 'button', class: 'btn btn-small btn-accent', id: 'bwArrKeep',
          onclick: () => {
            if (t.part) S.wiz.parts[t.sec] = t.part;
            else delete S.wiz.parts[t.sec];
            S.wiz.arrAb = null;
            renderWiz();
          },
        },
        'Garder B'
      )
    );
  }
  function renderArr() {
    const { res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const m = arrModel(res);
    const curve = arrCurve();
    const t = S.wiz.arrAb;
    const total = m.bl.bars || 1;
    const bySec = new Map(m.scenes.map((x) => [x.sec, x]));
    const warnSecs = new Set(m.items.filter((x) => x.kind === 'warn' && x.sec).map((x) => x.sec));
    // ---- courbe : voulue (pointillés), mesurée (un palier par passage), scènes à voir en jaune
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 140');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'bwar-svg');
    const y = (v) => (130 - v * 118).toFixed(1);
    const add = (tag, attrs) => {
      const e = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      svg.append(e);
    };
    add('polyline', { class: 'bwar-want', points: Array.from({ length: 51 }, (_, i) => `${i * 20},${y(AR().target(curve, i / 50))}`).join(' ') });
    add('polyline', { class: 'bwar-got', points: m.bl.list.flatMap((b) => { const e = bySec.get(b.sec).e; return [`${((1000 * b.start) / total).toFixed(1)},${y(e)}`, `${((1000 * (b.start + b.bars)) / total).toFixed(1)},${y(e)}`]; }).join(' ') });
    const strip = h('div', { class: 'bwar-strip' }, ...m.bl.list.map((b) => h('button', { type: 'button', class: 'bwar-blk' + (warnSecs.has(b.sec) ? ' warn' : ''), 'data-sec': b.sec, style: `flex:${b.bars} 1 0;--c:${secColor(b.sec)}`, title: `${b.name} · ${b.bars} mesures — clic : écouter la scène en boucle`, onclick: () => listenScene(b.sceneId) }, h('b', {}, b.name), h('small', {}, String(b.bars)))));
    const seg = h('span', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Courbe voulue', id: 'bwArrCurve' }, ...AR().CURVES.map((c) => h('button', { type: 'button', role: 'radio', 'data-curve': c.id, title: c.text, class: c.id === curve ? 'active' : '', 'aria-checked': String(c.id === curve), onclick: () => ((arrState().curve = c.id), renderWiz()) }, c.label)));
    const energy = h('section', { class: 'bwar-card', id: 'bwArrEnergy' },
      h('div', { class: 'bwar-head' }, h('b', {}, 'Énergie'), h('span', { class: 'bh-info' }, t && t.on ? 'voulue (pointillés) · mesurée avec la version B à l’écoute' : 'voulue (pointillés) · mesurée (trait plein) · scènes à voir soulignées en jaune'), h('span', { class: 'spacer' }), seg),
      h('div', { class: 'bwar-chart' }, svg), strip);
    // ---- qui joue où
    const maxOf = (id) => Math.max(1, ...m.scenes.map((x) => x.counts[id] || 0));
    const grid = h('div', { class: 'bwar-grid', id: 'bwArrGrid', style: `grid-template-columns: minmax(96px, 140px) repeat(${m.scenes.length}, minmax(44px, 1fr))` },
      h('span', {}),
      ...m.scenes.map((x) => h('span', { class: 'bwar-gh', title: x.name }, x.name)),
      ...m.ins.flatMap((T) => [
        h('span', { class: 'bwar-rn', style: `--c:${KIND_COLOR[T.kind]}` }, h('i', {}), T.name),
        ...m.scenes.map((x) => {
          const n = x.counts[T.id] || 0;
          const lvl = n ? Math.min(3, Math.ceil((3 * n) / maxOf(T.id))) : 0;
          const off = mutedIn(x.sec, T);
          return h('span', { class: `bwar-cell l${lvl}${off ? ' off' : ''}`, style: `--c:${KIND_COLOR[T.kind]}`, title: `${T.name} · ${x.name} : ${off ? 'muet' : n ? `${n} notes ou coups` : 'ne joue pas'}` }, off ? '×' : '');
        }),
      ]));
    const who = h('section', { class: 'bwar-card' }, h('div', { class: 'bwar-head' }, h('b', {}, 'Qui joue où'), h('span', { class: 'bh-info' }, 'clair : léger · foncé : plein · × : muet')), grid);
    // ---- à travailler
    const list = h('ul', { class: 'hm-checks2 bwar-items', id: 'bwArrItems' }, ...m.items.map((it) => {
      const scn = it.sec && bySec.get(it.sec);
      const vs = it.act && scn && !t ? arrVariants(scn, it.act) : [];
      return h('li', { class: 'k-' + it.kind, 'data-sec': it.sec || '' }, h('span', { class: 'ck' }, CK_ICON[it.kind] || '•'),
        h('div', {}, it.text, it.hint ? h('small', {}, it.hint) : null,
          vs.length ? h('span', { class: 'bwar-acts' }, ...vs.map((v) => h('button', { type: 'button', class: 'btn btn-small', 'data-arrv': v.label, title: v.why, onclick: () => startArr(scn, v) }, `▶ ${v.label}`))) : null));
    }));
    const todo = h('section', { class: 'bwar-card' }, h('div', { class: 'bwar-head' }, h('b', {}, 'À travailler'), h('span', { class: 'bh-info' }, `${m.items.filter((x) => x.kind === 'warn').length} point(s)`)), list);
    const keep = $('#bwArr');
    const top = keep ? keep.scrollTop : 0;
    const content = h('div', { class: 'bwar', id: 'bwArr' }, energy, arrAbBar(), h('div', { class: 'bwar-cols' }, who, todo));
    box.classList.remove('bw-split');
    box.replaceChildren(content);
    content.scrollTop = top;
  }

  function renderFx() {
    const { cols, res } = wizSong();
    const box = $('#bandWiz');
    if (!res) return box.replaceChildren(h('p', { class: 'dlg-hint' }, 'Cette inspiration n’a pas de plan de chanson.'));
    const joins = fxJoins(res);
    const keep = $('#bwFx');
    const top = keep ? keep.scrollTop : 0;
    const fz = keep && $('.fx-frieze', keep);
    const left = fz ? fz.scrollLeft : 0;
    const withFx = hasRole('fx');
    const sel = joins.length ? fxSel(joins) : null;

    // ---- frise
    const frieze = h('div', { class: 'fx-frieze', role: 'group', 'aria-label': 'Frise de la chanson : une pastille par jonction' });
    res.song.forEach((b, i) => {
      const sc = res.scenes.find((x) => x.id === b.scene);
      if (i) {
        const j = joins[i - 1];
        const n = fxCount(fxEff(j), withFx);
        frieze.append(
          h('div', { class: 'fx-tm' }, h('button', { type: 'button', class: (n ? 'has' : '') + (sel && sel.i === j.i ? ' sel' : ''), 'data-j': j.i, 'aria-pressed': String(!!sel && sel.i === j.i), title: `Avant « ${j.to.name} » : ${n ? `${n} effet${n > 1 ? 's' : ''}` : 'aucun effet'}`, onclick: () => ((S.wiz.fxSel = j.i), renderWiz()) }, n ? String(n) : '+'))
        );
      }
      const bars = sc.bars * b.repeat;
      frieze.append(h('div', { class: 'fx-block', 'data-sec': sc.sec, style: `--c:${secColor(sc.sec)};flex:${bars} 0 88px` }, h('b', {}, sc.name), h('small', {}, `${bars} mes.`)));
    });

    // ---- carte « Transition »
    const trans = [];
    if (sel) {
      const e = fxEff(sel);
      const prevBars = sel.from.bars;
      const J = (S.wiz.fx && S.wiz.fx.junctions) || {};
      const last = Math.min(8, prevBars); // mesures montrées dans « fin de la scène »
      const kind = kindOf(sel.to.sec);
      const dropWord = FX_DROPS[kind.match(FX_DROP) ? kind.match(FX_DROP)[1] : 'drop'] || 'drops';
      const targets = joins.filter((j) => j.key !== sel.key && isDropSec(j.to.sec));
      const same = new Set(targets.map((j) => j.key)).size;
      const seg = (id, items, active, onpick) =>
        h('span', { class: 'segmented fx-seg', id, role: 'group' }, ...items.map(([v, label, dis]) => h('button', { type: 'button', 'data-v': String(v), 'aria-pressed': String(active === v), disabled: dis || null, onclick: () => onpick(v) }, label)));
      const lbl = (t) => h('span', { class: 'bw-lbl' }, t);
      const switchBtn = (k, on, set) => h('button', { type: 'button', class: 'fx-sw' + (on ? ' on' : ''), id: `fxon-${k}`, role: 'switch', 'aria-checked': String(on), 'aria-label': FX_ROWS.find((r) => r[0] === k)[1], onclick: () => set(!on) }, '');
      const near = (list, v) => list.filter((n) => n <= v).pop() || list[0]; // la longueur proposée la plus proche, par défaut
      const rows = FX_ROWS.map(([k, name, sub]) => {
        const e1 = e[k];
        const need = FX_NEEDS[k] && !withFx;
        let on = k === 'gap' ? e.gap.len > 0 : e1.on;
        let set = (v) => fxSet(sel.key, k, { on: v });
        let ctl = [];
        if (k === 'riser') {
          const lens = [4, 8, 16];
          ctl = [
            lbl('Longueur'),
            seg('fxlen-riser', lens.map((n) => [n, `${n} mes.`, n > prevBars]), near(lens.filter((n) => n <= prevBars), e1.len), (v) => fxSet(sel.key, 'riser', { on: true, len: v })),
            lbl('Filtre'),
            h('select', { id: 'fxfilter-riser', 'aria-label': 'Filtre de la montée de bruit', onchange: (ev) => fxSet(sel.key, 'riser', { filter: ev.target.value }) }, ...FX_FILTERS.map(([v, t]) => h('option', { value: v, selected: e1.filter === v }, t))),
          ];
        } else if (k === 'hp') {
          const val = Math.max(200, Math.min(4000, e1.freq));
          const out = h('b', { class: 'fx-num', id: 'fxhp-out' }, `${val} Hz`);
          ctl = [
            lbl('Fréquence finale'),
            h('input', { type: 'range', id: 'fxhp-freq', min: 200, max: 4000, step: 10, value: val, 'aria-label': 'Fréquence finale du passe-haut', oninput: (ev) => (out.textContent = `${ev.target.value} Hz`), onchange: (ev) => fxSet(sel.key, 'hp', { on: true, freq: +ev.target.value }) }),
            out,
          ];
        } else if (k === 'rev') {
          ctl = [lbl('Longueur'), seg('fxlen-rev', [[4, '1 temps'], [16, '1 mesure'], [32, '2 mesures', prevBars < 2]], e1.len, (v) => fxSet(sel.key, 'rev', { on: true, len: v }))];
        } else if (k === 'gap') {
          set = (v) => fxSet(sel.key, 'gap', { len: v ? 4 : 0 });
          ctl = [seg('fxgap', [[0, 'Aucune'], [4, '1 temps'], [8, '2 temps'], [16, '1 mesure']], e1.len, (v) => fxSet(sel.key, 'gap', { len: v }))];
        } else if (k === 'impact') {
          const out = h('b', { class: 'fx-num', id: 'fxlevel-out' }, `${Math.round(e1.level * 100)} %`);
          ctl = [
            lbl('Type'),
            h('select', { id: 'fxtype-impact', 'aria-label': 'Type d’impact', onchange: (ev) => fxSet(sel.key, 'impact', { on: true, type: ev.target.value }) }, ...FX_IMPACTS.map(([v, t]) => h('option', { value: v, selected: e1.type === v }, t))),
            lbl('Niveau'),
            h('input', { type: 'range', id: 'fxlevel-impact', min: 0.2, max: 1, step: 0.05, value: e1.level, 'aria-label': 'Niveau de l’impact', oninput: (ev) => (out.textContent = `${Math.round(ev.target.value * 100)} %`), onchange: (ev) => fxSet(sel.key, 'impact', { on: true, level: +ev.target.value }) }),
            out,
          ];
        } else if (k === 'down') {
          ctl = [lbl('Longueur'), seg('fxlen-down', [[2, '2 mes.'], [4, '4 mes.']], e1.len, (v) => fxSet(sel.key, 'down', { on: true, len: v }))];
        } else if (k === 'retrait') {
          ctl = [lbl('Longueur'), seg('fxlen-retrait', [[1, '1 mes.'], [2, '2 mes.', prevBars < 2]], e1.len, (v) => fxSet(sel.key, 'retrait', { on: true, len: v }))];
        } else if (k === 'frag') {
          ctl = prevBars < 2 ? [lbl('Il faut une scène d’au moins 2 mesures')] : [];
        } else if (k === 'pedal') {
          ctl = [
            lbl('Longueur'),
            seg('fxlen-pedal', [[2, '2 mes.', prevBars < 2], [4, '4 mes.', prevBars < 4]], e1.len, (v) => fxSet(sel.key, 'pedal', { on: true, len: v })),
            lbl('Note'),
            h('select', { id: 'fxnote-pedal', 'aria-label': 'Note de la pédale', onchange: (ev) => fxSet(sel.key, 'pedal', { on: true, note: ev.target.value }) }, ...[['dom', 'Dominante (Ve degré)'], ['tonic', 'Tonique']].map(([v, t]) => h('option', { value: v, selected: e1.note === v }, t))),
          ];
        } else if (k === 'widen') {
          ctl = [lbl('Longueur'), seg('fxlen-widen', [[2, '2 mes.', prevBars < 2], [4, '4 mes.', prevBars < 4]], e1.len, (v) => fxSet(sel.key, 'widen', { on: true, len: v }))];
        } else if (k === 'susp') {
          ctl = [lbl('Retard'), seg('fxlen-susp', [[4, '1 temps'], [8, '2 temps']], e1.len, (v) => fxSet(sel.key, 'susp', { on: true, len: v }))];
        }
        if (need) return null;
        const row = h(
          'div',
          { class: 'fx-row' + (on ? '' : ' off'), id: `fxrow-${k}`, 'data-k': k },
          h('div', { class: 'fx-nm' }, switchBtn(k, on, set), h('div', {}, h('b', {}, name), h('small', {}, sub))),
          h('div', { class: 'fx-opt' }, ...ctl)
        );
        // titre du groupe des procédés d'écriture, avant le premier
        return k === FX_WRITE[0] ? [h('h4', { class: 'fx-group', id: 'fxWriteHead' }, 'Procédés d’écriture', h('small', {}, ' les parties elles-mêmes changent (formation, T01–T06)')), row] : row;
      });
      if (!withFx) {
        // les effets joués par la piste Effets : un message et un bouton qui l'ajoute au groupe
        const full = !BG().canAdd(group());
        const miss = h(
          'div',
          { class: 'fx-miss', id: 'fxMissFx' },
          h('p', {}, h('b', {}, 'Pas de musicien Effets dans ce groupe.'), ' Sans lui, pas de montée de bruit, de cymbale inversée, d’impact ni de descente : il joue ces effets sur sa propre piste.'),
          h('button', { type: 'button', class: 'btn', id: 'fxAddFx', disabled: full || null, title: full ? 'Le groupe est complet (10 musiciens)' : 'Ajoute l’Effets au groupe, comme « + Ajouter un musicien » de l’étape Instruments', onclick: () => fxAddMember('fx') }, '+ Ajouter un musicien Effets')
        );
        rows.splice(0, 0, miss);
      }
      const joinBtn = h('button', { type: 'button', class: 'btn btn-small', id: 'fxJListen', 'data-key': sel.key, onclick: () => (L.junc === sel.key && L.mode ? stopListen() : listenJunction(sel)) }, L.junc === sel.key && L.mode ? '■ Arrêter' : '▶ Écouter la transition');
      const copied = h('span', { class: 'fx-copied', id: 'fxCopied', 'aria-live': 'polite' }, '');
      trans.push(
        h('section', { class: 'bw-card fx-card', id: 'fxTrans', style: '--c:#7a8a99' },
          h('div', { class: 'fx-head' },
            h('h3', { class: 'bw-ctitle' }, h('b', {}, `Transition avant « ${sel.to.name} »`), h('small', {}, ` fin de ${sel.from.name}, mesures ${sel.at - last + 1} à ${sel.at}`)),
            h('span', { class: 'spacer' }),
            copied,
            J[sel.key] ? h('button', { type: 'button', class: 'btn btn-small', id: 'fxReset', title: 'Revient à ce que fait le plan pour cette jonction', onclick: () => { delete fxState().junctions[sel.key]; fxChanged(); } }, '↺ Comme le plan') : null,
            joinBtn,
            h('button', { type: 'button', class: 'btn btn-small', id: 'fxCopy', disabled: !same || null, title: same ? `Copie ces réglages vers ${same} autre${same > 1 ? 's' : ''} jonction${same > 1 ? 's' : ''} qui entre${same > 1 ? 'nt' : ''} dans un ${dropWord.replace(/s$/, '')}` : 'Aucune autre jonction vers un drop', onclick: () => {
              const f = fxState();
              const Js = (f.junctions = f.junctions || {});
              const done = new Set();
              targets.forEach((t) => {
                if (done.has(t.key)) return;
                done.add(t.key);
                Js[t.key] = JSON.parse(JSON.stringify({ ...e, riser: { ...e.riser, len: Math.min(e.riser.len, t.from.bars) } }));
              });
              fxChanged();
              const c = $('#fxCopied');
              if (c) c.textContent = `Copié vers ${done.size} jonction${done.size > 1 ? 's' : ''}`;
            } }, `Copier vers les autres ${dropWord}`)
          ),
          fxPreview(e, prevBars, withFx, sel.to.name),
          ...rows.flat().filter(Boolean)
        )
      );
    } else trans.push(h('section', { class: 'bw-card fx-card', id: 'fxTrans' }, h('p', { class: 'dlg-hint' }, 'Il faut au moins deux scènes dans l’arrangement pour régler une transition.')));

    // ---- carte « Percussions »
    const percEl = fxPercCard(cols, res);
    const root = h('div', { class: 'bwc fx', id: 'bwFx' }, h('div', { class: 'bw-lbl' }, 'Frise de la chanson · cliquer une jonction'), frieze, h('div', { class: 'fx-cols' }, ...trans, percEl));
    box.replaceChildren(root);
    root.scrollTop = top;
    frieze.scrollLeft = left;
    const sb = frieze.querySelector('.fx-tm .sel');
    if (sb && !left) frieze.scrollLeft = Math.max(0, sb.offsetLeft - frieze.clientWidth / 2); // la jonction choisie au milieu de la frise (défilement horizontal seulement)
  }

  /** Carte Percussions : une matrice scènes × boucles (Shaker, Conga, Tom) sur les pistes du Percussionniste. */
  function fxPercCard(cols, res) {
    const PC = SS.bandSong.PERC_LOOPS;
    const perc = (S.wiz.fx && S.wiz.fx.perc) || {};
    const loops = perc.loops || {};
    const card = h('section', { class: 'bw-card fx-card fx-perc', id: 'fxPerc', style: '--c:#f08a00' }, h('h3', { class: 'bw-ctitle' }, h('b', {}, 'Percussions'), h('small', {}, ' boucles d’ambiance par scène')));
    if (!hasRole('perc')) {
      const full = !BG().canAdd(group());
      card.append(
        h('div', { class: 'fx-miss', id: 'fxMissPerc' },
          h('p', {}, h('b', {}, 'Pas de Percussionniste dans ce groupe.'), ' Les boucles d’ambiance (shaker, conga, tom) sortent sur sa piste, dont le volume se règle dans Mix.'),
          h('button', { type: 'button', class: 'btn', id: 'fxAddPerc', disabled: full || null, title: full ? 'Le groupe est complet (10 musiciens)' : 'Ajoute le Percussionniste au groupe, comme « + Ajouter un musicien » de l’étape Instruments', onclick: () => fxAddMember('perc') }, '+ Ajouter un Percussionniste'))
      );
      return card;
    }
    const pcols = (lp) => cols.filter((c) => c.role === 'perc' && c.o.sound === lp.piece);
    const actual = (sc, lp) => pcols(lp).some((c) => ((sc.data[c.id] || {}).steps || []).some((v) => v > 0));
    const on = (sc, lp) => (loops[sc.sec] && typeof loops[sc.sec][lp.id] === 'boolean' ? loops[sc.sec][lp.id] : actual(sc, lp));
    const addPiece = (lp) => {
      const mu = musicians().find((m) => m.role === 'perc');
      const pc = mu && musState()[mu.id].pieces.find((q) => q.piece.split('@')[0] === lp.piece);
      if (pc) pc.on = true;
      else if (mu) musState()[mu.id].pieces.push({ piece: lp.piece, on: true });
      if (S.wiz.mix) mixSync();
      dropListen();
      renderWiz();
      draftSoon();
    };
    const head = h('tr', {}, h('th', {}), ...res.scenes.map((sc) => h('th', { title: sc.name, style: `--c:${secColor(sc.sec)}` }, h('i', {}), sc.name.replace('Drop final', 'Drop+').slice(0, 4))));
    const rows = PC.map((lp) => {
      const has = pcols(lp).length > 0;
      return h(
        'tr',
        { 'data-loop': lp.id },
        h('td', { class: 'lab' }, lp.name, h('small', {}, has ? lp.sub : h('button', { type: 'button', class: 'fx-addp', 'data-loop': lp.id, onclick: () => addPiece(lp) }, '+ ajouter la pièce'))),
        ...res.scenes.map((sc) => {
          const v = on(sc, lp);
          return h('td', {}, h('button', { type: 'button', class: 'fx-cb' + (v ? ' on' : ''), 'data-loop': lp.id, 'data-sec': sc.sec, 'aria-pressed': String(v), 'aria-label': `${lp.name} : ${sc.name}`, disabled: !has || null, title: has ? `${lp.name} dans « ${sc.name} »` : 'Pièce absente du kit', onclick: () => {
            const f = fxState();
            const P = (f.perc = f.perc || {});
            const Lp = (P.loops = P.loops || {});
            (Lp[sc.sec] = Lp[sc.sec] || {})[lp.id] = !v;
            fxChanged();
          } }));
        })
      );
    });
    const first = res.scenes.find((sc) => PC.some((lp) => pcols(lp).length && on(sc, lp)));
    const playing = L.mode === 'scene' && first && L.scene === first.id;
    card.append(
      h('div', { class: 'fx-pscroll' }, h('table', { class: 'fx-ptab', 'aria-label': 'Boucles de percussion par scène' }, h('thead', {}, head), h('tbody', {}, ...rows))),
      h('p', { class: 'dlg-hint' }, 'Les percussions sortent sur leur propre piste, volume réglé dans Mix.'),
      h('div', { class: 'fx-prow' }, h('span', { class: 'bw-lbl' }, 'Style'),
        h('select', { id: 'fxPercStyle', 'aria-label': 'Style des percussions', onchange: (ev) => { const P = (fxState().perc = fxState().perc || {}); P.style = ev.target.value; fxChanged(); } }, ...SS.bandSong.PERC_STYLES.map((s) => h('option', { value: s.id, selected: (perc.style || 'techno') === s.id }, s.name))),
        h('button', { type: 'button', class: 'btn btn-small', id: 'fxPercListen', 'data-scene': first ? first.id : null, disabled: !first || null, onclick: () => first && listenScene(first.id) }, playing ? '■ Arrêter' : '▶ Écouter')
      )
    );
    return card;
  }

  /** Une partie de scène (données du projet d'écoute) réduite à `bars` mesures à partir de la mesure `from`. */
  function sliceListenScene(sc, from, bars, id) {
    const a = from * 16;
    const b = (from + bars) * 16;
    const data = {};
    Object.entries(sc.data).forEach(([tid, d]) => {
      const o = {};
      if (d.steps) {
        o.steps = d.steps.slice(a, b);
        while (o.steps.length < bars * 16) o.steps.push(0);
        ['rat', 'cond'].forEach((f) => d[f] && (o[f] = Object.fromEntries(Object.entries(d[f]).filter(([s]) => +s >= a && +s < b).map(([s, v]) => [+s - a, v]))));
      }
      if (d.events)
        o.events = d.events
          .filter((e) => e.step < b && e.step + e.len > a)
          .map((e) => ({ ...e, step: Math.max(0, e.step - a), len: Math.min(e.step + e.len, b) - Math.max(e.step, a) }));
      if (d.auto) {
        o.auto = {};
        Object.entries(d.auto).forEach(([param, lane]) => {
          const pts = Object.entries(lane).map(([s, v]) => [+s, v]).sort((p, q) => p[0] - q[0]);
          const out = { 0: SS.bandSong.autoAt(pts, a) };
          pts.forEach(([s, v]) => s > a && s < b - 1 && (out[s - a] = v));
          out[bars * 16 - 1] = SS.bandSong.autoAt(pts, b - 1);
          o.auto[param] = out;
        });
      }
      data[tid] = o;
    });
    return { id, name: sc.name, bars, key: sc.key, data };
  }
  /** Écoute d'une jonction, en boucle : les dernières mesures de la scène d'avant, puis les premières de la suivante. */
  function listenJunction(j) {
    const { cols, res } = wizSong();
    if (!res || !j) return;
    stopListen();
    dropListen();
    const proj = buildListen(cols, res);
    L.proj = proj;
    L.sig = S.wiz.sig;
    L.mixSig = mixSig();
    applyListenMutes();
    const a = proj.scenes.find((x) => x.id === j.from.id);
    const b = proj.scenes.find((x) => x.id === j.to.id);
    const lead = Math.min(a.bars, 4);
    const tail = Math.min(b.bars, 4);
    const sa = sliceListenScene(a, a.bars - lead, lead, 'junc·a');
    const sb = sliceListenScene(b, 0, tail, 'junc·b');
    proj.scenes = [sa, sb];
    proj.song = [{ scene: sa.id, repeat: 1 }, { scene: sb.id, repeat: 1 }];
    proj.songLoop = true;
    SS.loadScene(proj, sa.id, { commit: false });
    L.junc = j.key;
    L.mode = 'song';
    L.block = 0;
    L.scene = sa.id;
    markListen();
    noteListen(proj, `jonction ${a.name || a.id} → ${b.name || b.id} en boucle`);
    SS.audio.start(() => proj, onListenStep, {
      song: {
        index: 0,
        onBlock: (i) => SS.loadScene(proj, proj.song[i].scene, { commit: false }),
        onBlockVisible: (i) => {
          L.block = i;
          L.scene = proj.song[i].scene;
          L.step = -1;
          markListen();
        },
        onEnd: stopListen,
      },
    });
  }

  /* ---------- Écoute dans l'assistant ----------
   * La chanson de la vue session est jouée telle qu'elle sera créée : pistes, scènes, mixage et mastering
   * automatiques, sur un projet temporaire (rien n'est écrit dans la chanson). Clic sur une scène : elle tourne
   * en boucle ; « Écouter la chanson » ou un bloc du bandeau : l'arrangement à partir de ce bloc.
   * Muet / Solo et volume (étape Mélodie) : par colonne, comme sur une console.
   */
  const L = { proj: null, sig: null, mixSig: null, junc: null, mode: null, scene: null, sec: null, block: -1, step: -1, paused: false };
  const LID = (id) => 'bw·' + id; // identifiants des pistes d'écoute : jamais ceux de la chanson

  /** Journal de débogage (js/audiowatch.js) : d'où vient le projet d'écoute qui va jouer. */
  function noteListen(proj, lecture) {
    const W = SS.audioWatch;
    if (!W || !W.setOrigin || !proj) return;
    const ed = app.project();
    const p = preset();
    W.setOrigin(proj, {
      kind: 'écoute de l\'assistant « Nouvelle chanson » (projet temporaire, rien n\'est écrit dans la chanson)',
      detail: {
        lecture,
        démarche: S.mode === 'cover' ? `reprise « ${(S.cover && S.cover.title) || '?'} »` : 'création',
        style: S.styleId,
        inspiration: p ? `${p.id} (« ${p.song} »${p.artist ? ', ' + p.artist : ''})` : S.presetId,
        étape: S.wiz ? S.wiz.step : null,
        assistant: S.wiz && S.wiz.fresh ? 'ouvert sur une chanson vide' : 'ouvert sur la chanson en cours',
        chansonÉditeur: ed ? `« ${ed.title} » [${ed.id}], ${ed.tracks.length} piste(s)` : null,
        pistesÉcoute: proj.tracks.length,
        pistesMuettes: proj.tracks.filter((t) => t.mute).length || null,
      },
    });
  }
  /** Ligne « ASSIST » du journal de débogage : ouverture, reprise de l'assistant. */
  const noteWizard = (text) => SS.audioWatch && SS.audioWatch.log && SS.audioWatch.log('ASSIST', text);

  /** Projet d'écoute : construit comme « Créer la chanson » (main.js, addBandSong), recalculé si la chanson change. */
  function listenProject() {
    const { cols, res } = wizSong();
    if (!res) return null;
    if (L.junc) dropListen(); // le projet d'écoute était celui d'une jonction
    if (S.wiz.mix) mixSync(); // l'étape Mix a été visitée : son réglage s'entend aussi aux autres étapes
    if (L.proj && L.sig === S.wiz.sig) {
      if (L.mixSig !== mixSig()) liveMix();
      return L.proj;
    }
    dropListen();
    L.proj = buildListen(cols, res);
    L.sig = S.wiz.sig;
    L.mixSig = mixSig();
    applyListenMutes();
    return L.proj;
  }

  /** Construit le projet d'écoute (sans le déclarer) : les pistes, les scènes, le mixage automatique, puis le mix de l'étape Mix. */
  function buildListen(cols, res) {
    const p = preset();
    const proj = SS.newProject();
    proj.tempo = tempo();
    proj.timeSig = [4, 4];
    const levelKeys = new Map();
    proj.tracks = cols.map((c) => {
      const t = SS.newTrack(c.o, proj);
      t.id = LID(c.id);
      t.col = c.id;
      if (c.o.band) t.band = { ...c.o.band };
      levelKeys.set(t.id, c.o.levelKey);
      return t;
    });
    proj.scenes = res.scenes.map((sc) => ({
      id: sc.id,
      name: sc.name,
      bars: sc.bars,
      key: sc.key,
      data: Object.fromEntries(Object.entries(sc.data).map(([id, d]) => [LID(id), d])),
    }));
    proj.song = res.song.map((b) => ({ ...b }));
    proj.playMode = 'song';
    proj.songLoop = false;
    const st = (proj.tracks.find((t) => t.band) || { band: {} }).band.style || 'synthwave';
    SS.bandMix.mixTracks(proj.tracks, levelKeys, st);
    SS.bandMix.mixMaster(proj, st, SS.bandMix.driveFor(p.id, st));
    if (S.wiz.mix) SS.wizMix.apply(proj, S.wiz.mix, res.scenes); // même application que « Créer la chanson » (volumes, effets, courbes de scène)
    proj.tracks.forEach((t) => {
      t.mixMute = !!t.mute;
      t.mixSolo = !!t.solo;
      t.baseVol = typeof t.volume === 'number' ? t.volume : 0.8;
    });
    proj.groove = { ...(proj.groove || { res: 0, swing: 0.5 }), ...grooveOf() }; // swing et humanisation de l'étape Batterie (toute la chanson)
    SS.loadScene(proj, proj.scenes[0].id, { commit: false });
    return proj;
  }

  /** Le mix a changé : l'écoute en cours le prend sur place (volumes, pan, effets, Master, courbes de la scène), sans la reconstruire. */
  function liveMix() {
    const { cols, res } = wizSong();
    if (!L.proj || !res) return;
    const fresh = buildListen(cols, res);
    const cur = L.proj.current;
    L.proj.tracks.forEach((t, i) => {
      const f = fresh.tracks[i];
      if (!f) return;
      t.baseVol = f.baseVol;
      t.mixMute = f.mixMute;
      t.mixSolo = f.mixSolo;
      if (f.mix) t.mix = f.mix;
      else delete t.mix;
      if (f.fx) t.fx = f.fx;
      else delete t.fx;
      t.volume = f.baseVol * volGain(t.col);
      SS.audio.setTrackGain(t, t.volume);
    });
    L.proj.master = fresh.master;
    L.proj.scenes = fresh.scenes;
    SS.loadScene(L.proj, cur, { commit: false });
    L.mixSig = mixSig();
    applyListenMutes();
    SS.audio.applyAllFx(L.proj);
  }

  /** Muet / Solo et volume des colonnes sur les pistes d'écoute. */
  function applyListenMutes() {
    if (!L.proj) return;
    L.proj.tracks.forEach((t) => {
      t.mute = S.wiz.mute.has(t.col) || !!t.mixMute; // Muet / Solo de l'étape Mélodie et ceux de l'étape Mix
      t.solo = S.wiz.solo.has(t.col) || !!t.mixSolo;
      if (t.baseVol == null) t.baseVol = typeof t.volume === 'number' ? t.volume : 0.8;
      const v = t.baseVol * volGain(t.col);
      if (v !== t.volume) {
        t.volume = v;
        SS.audio.setTrackGain(t, v);
      }
    });
    if (L.mode) SS.audio.applyMutes(L.proj);
  }

  function stopListen() {
    if (L.mode) SS.audio.stop();
    L.junc = null; // écoute d'une jonction (étape Effets et transitions)
    L.paused = false;
    L.mode = null;
    L.scene = null;
    L.sec = null;
    L.block = -1;
    L.step = -1;
    markListen();
  }

  /** Arrête et libère les tranches audio des pistes d'écoute. */
  function dropListen() {
    stopListen();
    if (L.proj) L.proj.tracks.forEach((t) => SS.audio.removeTrack(t.id));
    L.proj = null;
    L.sig = null;
  }

  function onListenStep(step) {
    if (step < 0) {
      // arrêt par le moteur (autre lecture, fin)
      if (L.mode) {
        L.mode = null;
        L.scene = null;
        L.block = -1;
        L.paused = false;
      }
      L.step = -1;
    } else L.step = step;
    markListen();
  }

  /** Une scène en boucle (re-clic : arrêt). */
  function listenScene(id) {
    if (L.mode === 'scene' && L.scene === id) return stopListen();
    playScene(id);
  }
  /** Joue une scène en boucle (depuis son début). */
  function playScene(id) {
    const proj = listenProject();
    if (!proj || !proj.scenes.some((x) => x.id === id)) return;
    stopListen();
    SS.loadScene(proj, id, { commit: false });
    L.mode = 'scene';
    L.scene = id;
    L.sec = (S.wiz.res.scenes.find((x) => x.id === id) || {}).sec || null;
    markListen();
    const sc = proj.scenes.find((x) => x.id === id);
    noteListen(proj, `scène « ${(sc && sc.name) || id} » en boucle`);
    SS.audio.start(() => proj, onListenStep, {});
  }

  /** L'arrangement à partir du bloc `index` (re-clic sur « Écouter la chanson » : arrêt). */
  function listenSong(index = 0) {
    const proj = listenProject();
    if (!proj) return;
    stopListen();
    L.mode = 'song';
    L.block = index;
    L.scene = proj.song[index].scene;
    markListen();
    noteListen(proj, `chanson à partir du bloc ${index + 1} sur ${proj.song.length}`);
    SS.audio.start(() => proj, onListenStep, {
      song: {
        index,
        onBlock: (i) => {
          const b = proj.song[i];
          if (b && b.scene !== proj.current) SS.loadScene(proj, b.scene, { commit: false });
        },
        onBlockVisible: (i) => {
          L.block = i;
          L.scene = proj.song[i].scene;
          L.step = -1;
          // étape Mélodie : la vue suit la scène qu'on entend
          if (S.wiz && melStep() && S.wiz.hscene !== L.scene) {
            S.wiz.hscene = L.scene;
            renderHarmony();
          }
          markListen();
        },
        onEnd: stopListen,
      },
    });
  }

  /** La chanson a changé (autre mélodie…) pendant l'écoute : on reprend au même endroit avec les nouvelles notes. */
  function relisten() {
    if (!L.mode || L.sig === S.wiz.sig) return;
    const { mode, sec, block, paused, junc } = L;
    if (junc) {
      // une transition en écoute : on la reprend avec les nouveaux réglages
      const j = S.wiz.res && fxJoins(S.wiz.res).find((x) => x.key === junc);
      dropListen();
      if (j && !paused) listenJunction(j);
      return;
    }
    dropListen();
    if (paused) return;
    // les scènes ont de nouveaux identifiants : on retrouve la même section
    if (mode === 'scene') {
      const sc = S.wiz.res && S.wiz.res.scenes.find((x) => x.sec === sec);
      if (sc) playScene(sc.id);
    } else listenSong(Math.max(0, block));
  }

  /** Muet / Solo d'une ou plusieurs colonnes (un groupe : toutes ses colonnes). */
  function toggleMS(set, ids) {
    const all = ids.every((id) => set.has(id));
    ids.forEach((id) => (all ? set.delete(id) : set.add(id)));
    afterMS();
  }
  /** Muet / Solo ont changé : l'écoute et l'écran suivent (à l'étape Mélodie, sans refaire le panneau). */
  function afterMS() {
    applyListenMutes();
    if (melStep() && $('#bwMelBoard')) refreshMelFrame();
    else renderWiz();
  }

  /** Ce qui joue : bandeau, ligne de la scène et tête de lecture (sans reconstruire la grille). */
  function markListen() {
    const box = $('#bandWiz');
    if (!box || !S.wiz) return;
    updateTransport();
    const jb = $('#fxJListen', box);
    if (jb) jb.textContent = L.junc === jb.dataset.key && L.mode ? '■ Arrêter' : '▶ Écouter la transition';
    const pb = $('#fxPercListen', box);
    if (pb) pb.textContent = L.mode === 'scene' && L.scene === pb.dataset.scene ? '■ Arrêter' : '▶ Écouter';
    box.querySelectorAll('.bh-board').forEach((b) => {
      const on = !!L.mode && L.scene === b.dataset.scene && L.step >= 0;
      b.classList.toggle('playing', on);
      if (on) b.style.setProperty('--ph', (L.step % (Number(b.dataset.bars) * 16)) / (Number(b.dataset.bars) * 16));
    });
    const hb = $('.bh-board', box);
    if (hb) box.querySelectorAll('.bh-scene').forEach((b) => b.classList.toggle('playing', !!L.mode && b.dataset.scene === L.scene));
    const lp = $('.bh-loop', box);
    if (lp) {
      const loop = L.mode === 'scene' && L.scene === (hb ? hb.dataset.scene : S.wiz.hscene);
      lp.classList.toggle('on', loop);
      lp.setAttribute('aria-pressed', loop);
    }
    box.querySelectorAll('.bw-roll').forEach((r) => {
      const total = Number(r.dataset.bars) * 16;
      const ph = $('.bw-roll-ph', r);
      const on = !!L.mode && L.scene === r.dataset.scene && L.step >= 0;
      ph.hidden = !on;
      if (on) ph.style.left = `${((L.step % total) / total) * 100}%`;
    });
    // rouleaux de notes (Harmoniser la mélodie) : curseur de lecture et note qui sonne
    box.querySelectorAll('[data-phroll]').forEach((r) => {
      const total = Number(r.dataset.bars) * 16;
      const ph = $('.bwhz-ph', r);
      const on = !!L.mode && L.scene === r.dataset.scene && L.step >= 0;
      const pos = on ? L.step % total : -1;
      if (ph) {
        ph.hidden = !on;
        if (on) ph.style.left = `${(pos / total) * 100}%`;
      }
      r.querySelectorAll('.bwhz-n').forEach((n) => n.classList.toggle('now', on && pos >= Number(n.dataset.s) && pos < Number(n.dataset.e)));
    });
    const gt = $('.bw-gtl', box);
    const gph = $('#bwGridPh', box);
    if (gt && gph) {
      const on = !!L.mode && L.scene === gt.dataset.scene && L.step >= 0;
      gph.hidden = !on;
      if (on) gph.style.left = `${((L.step % (Number(gt.dataset.bars) * 16)) / (Number(gt.dataset.bars) * 16)) * 100}%`;
    }
    box.querySelectorAll('.bh-scene').forEach((b) => b.classList.toggle('playing', !!L.mode && b.dataset.scene === L.scene));
    if (S.wiz && S.wiz.insp) {
      const pl = $('#bwiPlay');
      const on = L.mode === 'scene' && L.sec === S.wiz.insp.sec && !L.paused;
      if (pl && pl.dataset.on !== String(on)) {
        pl.dataset.on = String(on);
        pl.innerHTML = on ? PAUSE : PLAY;
      }
    }
    box.querySelectorAll('.bw-block').forEach((b, i) => b.classList.toggle('playing', L.mode === 'song' && i === L.block));
    box.querySelectorAll('.bw-grid tbody tr').forEach((tr) => {
      const on = !!L.mode && tr.dataset.scene === L.scene;
      tr.classList.toggle('playing', on);
      const b = $('.bw-splay', tr);
      if (b) b.setAttribute('aria-pressed', L.mode === 'scene' && on);
      if (on && L.step >= 0) tr.style.setProperty('--ph', L.step / (Number(tr.dataset.bars) * 16));
      else tr.style.removeProperty('--ph');
    });
  }

  /** Instrument d'une nouvelle piste « Mélodie » : la voix ou le lead du groupe choisi (ou le premier lead du catalogue). */
  function melodyTrackOpts() {
    const find = (p) => p && p.musicians.find((m) => m.role === 'vox') || (p && p.musicians.find((m) => m.role === 'lead'));
    let p = preset();
    let mu = find(p);
    if (!mu) {
      p = B().STYLES.flatMap((st) => st.presets).find((x) => find(x));
      mu = find(p);
    }
    const ms = S.cache[p.id] && S.cache[p.id][mu.id];
    const cat = mu.cat || roleOf(mu).cat || 'mono';
    const order = gm() ? [...mu.pick.keys()].sort((x, y) => mu.pick[y].startsWith('gm_') - mu.pick[x].startsWith('gm_')) : [...mu.pick.keys()];
    const pi = ms && (ms.picked || !gm()) ? ms.pick : order[0];
    const opts = ms && ms.custom ? toGm(ms.custom) : toGm(B().choiceOpts(mu.pick[pi], cat));
    const levelKey = ms && ms.custom ? null : `${mu.role}|${gm() ? opts.instrument : mu.pick[pi]}|${cat}`;
    return { ...opts, category: 'mono', name: 'Mélodie', color: colorOf(mu), levelKey, role: mu.role, style: S.styleId || 'synthwave' };
  }

  /* ---------- Ouverture / fermeture ---------- */
  /** Bouton Nouvelle de l'en-tête : l'assistant, sur le projet en cours (remplacé à la création, après confirmation). */
  function open() {
    // le projet garde son brouillon : en commencer un autre le remplace, on demande d'abord (Annuler : « Reprendre l'assistant » le rouvre)
    if (app.project().wizard && !S.wiz) {
      if (!confirm(`Remplacer le brouillon de l’assistant ?\n\nCe projet garde déjà le travail d’un assistant (${draftWhen(app.project().wizard)}). OK l’efface pour en commencer un autre ; Annuler le garde (menu : « Reprendre l’assistant »).`)) return;
      app.setWizardDraft(null);
    }
    noteWizard(`ouvert sur la chanson en cours « ${app.project().title} » [${app.project().id}]`);
    openWizard({ fresh: false });
  }
  /** « brouillon du 17/11 à 14:32 » ou « chanson créée le … » */
  function draftWhen(d) {
    const t = new Date(d.createdAt || d.savedAt || 0);
    const fmt = `${t.toLocaleDateString('fr-FR')} à ${t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    return d.createdAt ? `chanson créée le ${fmt}` : `brouillon du ${fmt}`;
  }
  /** « Nouvelle chanson… » (menu de l'application) : l'assistant sur une chanson vide. */
  function openWizard({ fresh = true } = {}) {
    if (S.wiz) leave(); // déjà ouvert : on repart de zéro
    S.group = null; // le groupe repart de celui de l'inspiration
    resetAdd();
    // keys / grids / emos : étape Accords (tonalité, grille, émotion par section) ; parts : réglages par scène (batterie,
    // basse, nappes, arpèges) ; form / secs / skey : arrangement, scènes et tonalité retouchés (specEff) ; chars : caractère et notes par phrase par section (réglages du moteur, sans écran) ; melPanel : état du panneau Mélodie par section ; snap : aimant de la grille ; gsel : accord sélectionné ; insp : fenêtre d'inspiration
    S.wiz = {
      step: 1, seen: new Set([1]), seed: 0, off: new Set(), mute: new Set(), solo: new Set(), sig: null, res: null, fresh, mel: S.mel, vol: new Map(), mix: null, mixScope: 'song', mixOpen: null, mixTab: 'eq', hscene: null, hsec: null, tempo: null, tempoFor: null,
      plans: {}, pseeds: {}, keys: {}, grids: {}, peds: {}, emos: {}, chars: {}, parts: {}, kinds: {}, melPanel: {}, melSec: null, form: null, secs: {}, skey: null, snap: 'beat', gsel: null, insp: null, fx: {},
    };
    show();
    draftStart();
    if (fresh) noteWizard(`ouvert sur une chanson vide « ${app.project().title} » [${app.project().id}]`);
  }

  /* ---------- Brouillon : l'état de l'assistant, rangé dans le projet (project.wizard) ----------
   * Rien n'est créé : seulement un champ du projet, enregistré comme toute modification (js/main.js setWizardDraft).
   * L'assistant s'écrit tout seul (débouncé) dès que son état diffère de celui de l'ouverture ; fermer le garde. */
  /** L'état vivant, prêt pour SS.wizDraft.pack (le panneau Mélodie en cours est relu). */
  function draftSrc() {
    const w = { ...S.wiz };
    if (w.melSec != null) w.melPanel = { ...w.melPanel, [w.melSec]: SS.melodyPanel.getState() };
    return { mode: S.mode, styleId: S.styleId, presetId: S.presetId, cover: S.cover, group: group(), cache: S.cache, hide: S.hide, mel: S.mel, accOpen: S.accOpen, tracksOpen: S.tracksOpen, w };
  }
  /** Le brouillon (enveloppe v, savedAt, createdAt, state) de l'assistant ouvert. */
  function wizSnapshot(createdAt) {
    const d = { v: SS.wizDraft.VERSION, savedAt: Date.now(), state: SS.wizDraft.pack(draftSrc()) };
    const c = createdAt || S.wiz.createdAt;
    if (c) d.createdAt = c;
    return d;
  }
  /** Mélodie « Mix »… : les caches du catalogue (instruments choisis) ne gardent que ce qui existe encore. */
  function cleanCache(raw) {
    const out = {};
    B().STYLES.forEach((st) =>
      st.presets.forEach((p) => {
        const r = raw && raw[p.id];
        if (!r || typeof r !== 'object') return;
        const o = {};
        p.musicians.forEach((mu) => {
          const x = r[mu.id];
          if (!x || typeof x !== 'object') return;
          if (mu.kits) {
            const pieces = Array.isArray(x.pieces) ? x.pieces : [];
            o[mu.id] = {
              on: true,
              kit: mu.kits.includes(x.kit) ? x.kit : mu.kits[0],
              pieces: pieces.filter((q) => q && typeof q.piece === 'string').map((q) => ({ piece: q.piece, on: q.on !== false })),
            };
          } else {
            o[mu.id] = { on: true, pick: Number.isInteger(x.pick) && x.pick >= 0 && x.pick < mu.pick.length ? x.pick : 0, custom: x.custom && typeof x.custom === 'object' ? x.custom : null };
            if (x.picked) o[mu.id].picked = true;
          }
        });
        out[p.id] = o;
      })
    );
    return out;
  }
  /** Rouvre l'assistant dans l'état d'un brouillon. false : brouillon inutilisable (version inconnue, inspiration disparue…). */
  function wizRestore(snap) {
    const d = SS.wizDraft.clean(snap);
    const x = d && SS.wizDraft.unpack(d.state);
    const st = x && B().STYLES.find((s) => s.id === x.styleId);
    const pr = st && st.presets.find((p) => p.id === x.presetId);
    if (!pr) return false;
    if (S.wiz) leave();
    S.styleId = st.id;
    S.presetId = pr.id;
    S.mode = x.mode;
    S.cover = x.mode === 'cover' ? { ...COVER_DEFAULT(), ...(x.cover || {}) } : x.cover ? { ...COVER_DEFAULT(), ...x.cover } : null;
    // groupe : celui du brouillon ; un brouillon v1 (musiciens « dans le groupe » ou non, sans liste) est migré
    const g = BG().clean(x.group, pr) || BG().fromV1(pr, x.cache && x.cache[pr.id]);
    S.group = { ...g, style: st.id };
    resetAdd();
    S.cache = cleanCache(x.cache);
    S.hide = x.hide;
    S.mel = { ...MEL_DEFAULT, ...(x.mel || {}) };
    S.accOpen = x.accOpen;
    S.tracksOpen = x.tracksOpen;
    S.wiz = {
      seed: 0, off: new Set(), mute: new Set(), solo: new Set(), sig: null, res: null, mel: S.mel, vol: new Map(), mix: null, mixScope: 'song', mixOpen: null, mixTab: 'eq', hscene: null, hsec: null, tempo: null, tempoFor: null,
      plans: {}, pseeds: {}, keys: {}, grids: {}, peds: {}, emos: {}, chars: {}, parts: {}, kinds: {}, melPanel: {}, form: null, secs: {}, skey: null, snap: 'beat', gsel: null, efilter: 0, fresh: false, fx: {},
      ...x.w, step: 1, melSec: null, insp: null, createdAt: d.createdAt,
    };
    // brouillon d'avant l'étape « Effets et transitions » (v < 3), puis d'avant l'étape « Arrangement » (v < 4) : les étapes
    // de Finaliser ont gagné un numéro à chaque fois (Mix était à ST.arr avant la v3)
    const shift = (from) => {
      const up = (m) => (typeof m === 'number' && m >= from ? m + 1 : m);
      x.w.step = up(x.w.step);
      x.w.seen = new Set([...x.w.seen].map(up));
    };
    if (d.v < 3) shift(ST.arr);
    if (d.v < 4) shift(ST.arr);
    S.wiz.seen = new Set(x.w.seen);
    const n = x.w.step;
    if (n > 1 && n <= ST.pick && canGo(n)) S.wiz.step = n;
    S.wiz.seen.add(S.wiz.step);
    show();
    draftStart();
    return true;
  }
  /** « Reprendre l'assistant » (menu) : rouvre l'assistant du projet, à l'étape et à la scène où il en était. */
  function resume() {
    const d = app.project().wizard;
    if (!d) return false;
    if (wizRestore(d)) {
      noteWizard(`repris depuis le brouillon de « ${app.project().title} » [${app.project().id}] (${draftWhen(d)}, étape ${S.wiz ? S.wiz.step : '?'})`);
      return true;
    }
    app.toast('Ce brouillon ne peut plus être rouvert (inspiration ou version inconnue).');
    return false;
  }
  const hasDraft = () => !!(app && app.project().wizard);

  let draftTimer = 0;
  let draftTick = 0;
  const draftSig = () => JSON.stringify(SS.wizDraft.pack(draftSrc()));
  /** L'état de l'ouverture sert de référence : un assistant ouvert puis fermé sans rien changer n'écrit rien. */
  function draftStart() {
    S.wiz.draftSig = draftSig();
    clearInterval(draftTick);
    draftTick = setInterval(saveDraft, 1500);
    draftInfo();
  }
  function draftSoon() {
    if (!S.wiz) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 450);
  }
  /** Écrit le brouillon dans le projet s'il a changé (createdAt : la chanson vient d'être créée). */
  function saveDraft(createdAt) {
    clearTimeout(draftTimer);
    if (!S.wiz || !app) return;
    const sig = draftSig();
    if (sig === S.wiz.draftSig && !createdAt) return;
    S.wiz.draftSig = sig;
    if (createdAt) S.wiz.createdAt = createdAt;
    app.setWizardDraft(wizSnapshot());
    draftInfo();
  }
  function draftInfo() {
    const e = $('#bandDraft');
    if (!e || !S.wiz) return;
    const t = app.project().wizard ? new Date(app.project().wizard.savedAt) : null;
    e.hidden = !t;
    e.textContent = t ? 'Brouillon enregistré' : '';
    e.title = t ? `Enregistré dans le projet à ${t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} : « Reprendre l’assistant » dans le menu le rouvre tel quel.` : '';
  }
  function show() {
    SS.audio.ensureCtx();
    if (!S.styleId) {
      S.styleId = B().STYLES[0].id;
      S.presetId = style().presets[0].id;
    }
    S.sel = null;
    renderStyles();
    renderPresets();
    renderSong();
    renderMode();
    refresh();
    renderWiz();
    // l'assistant prend la place de la zone des pistes ; la barre du haut reste (Lecture, tempo, position, tonalité)
    el.setAttribute('open', '');
    document.body.classList.add('wizard-mode');
    app.wizardMode(true);
    updateTransport();
    requestAnimationFrame(() => {
      const a = $('#bandPresets .band-preset.active');
      a && a.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ---------- Confirmation : la chanson remplace le projet en cours ---------- */
  function showSongConfirm(n) {
    const pr = app.project();
    const p = preset();
    const notes = pr.tracks.filter((t) => app.hasNotes(t)).length;
    const box = $('#bandConfirm');
    box.replaceChildren(
      h(
        'div',
        { class: 'bcf-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'bcfTitle', 'aria-describedby': 'bcfText' },
        h('h3', { id: 'bcfTitle' }, 'Remplacer le projet par la chanson ?'),
        h(
          'p',
          { id: 'bcfText' },
          cover()
            ? `« Créer la chanson » écrit la reprise « ${S.cover.title.trim() || 'Reprise'} » : ${n} piste${n > 1 ? 's' : ''}, les scènes et l'arrangement. `
            : `« Créer la chanson » écrit une chanson dans l'esprit de « ${p.song} » : ${n} piste${n > 1 ? 's' : ''}, les scènes et l'arrangement. `,
          `Elle remplace ${pr.tracks.length > 1 ? `les ${pr.tracks.length} pistes` : 'la piste'}, ${pr.scenes.length > 1 ? `les ${pr.scenes.length} scènes` : 'la scène'} et l'arrangement actuels.`
        ),
        notes ? h('p', { class: 'bcf-warn' }, `⚠ ${notes} piste${notes > 1 ? 's' : ''} contien${notes > 1 ? 'nent' : 't'} des notes : Ctrl+Z pour revenir en arrière, et la chanson actuelle reste dans « Mes chansons » (ses versions).`) : null,
        h(
          'div',
          { class: 'bcf-actions' },
          h('button', { type: 'button', class: 'btn', id: 'bcfBack', onclick: hideConfirm }, 'Retour'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-accent', id: 'bcfSong', onclick: () => createWizSong(true) }, 'Remplacer par la chanson')
        )
      )
    );
    box.hidden = false;
    requestAnimationFrame(() => $('#bcfSong').focus());
  }

  function hideConfirm() {
    const box = $('#bandConfirm');
    if (box) box.hidden = true;
  }

  /** Quitte le mode assistant sans rien écrire : l'écoute s'arrête, la barre du haut redevient celle du projet. */
  function leave({ keep = true } = {}) {
    if (!S.wiz) return;
    if (keep) saveDraft(); // fermer garde le brouillon (rien d'autre n'est écrit)
    clearTimeout(draftTimer);
    clearInterval(draftTick);
    hideConfirm();
    dropListen();
    leaveMel();
    S.wiz = null;
    el.removeAttribute('open');
    document.body.classList.remove('wizard-mode');
    app.wizardMode(false);
  }
  const active = () => !!S.wiz;
  /** Pas précédent / suivant (boutons cachés #bwBack / #bwNext, Alt + flèches). */
  const stepBy = (d) => S.wiz && goStep(S.wiz.step + d);

  function init(appApi) {
    app = appApi;
    el = $('#bandDialog');
    if (!el) return;
    $('#bandClose').addEventListener('click', () => leave());
    // chaque geste dans l'assistant (clic, saisie, choix, glissement) programme l'enregistrement du brouillon, débouncé
    ['click', 'input', 'change', 'keyup', 'pointerup'].forEach((t) => el.addEventListener(t, draftSoon));
    $('#bandGm').addEventListener('click', () => setGm(!gm()));
    $('#bwEmpty').addEventListener('click', () => leave());
    $('#bwBack').addEventListener('click', () => stepBy(-1));
    $('#bwNext').addEventListener('click', () => stepBy(1));
    $('#bwCreate').addEventListener('click', () => createWizSong());
    $('#bwGo').addEventListener('click', () => quickGo());
    document.querySelectorAll('#bandMode [data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    SS.melodyPanel.init(app); // l'atelier Mélodie vit dans l'étape Mélodie de l'assistant
    // Échap = Fermer (rien n'est créé) : d'abord la confirmation, puis la fenêtre d'inspiration, puis l'assistant
    document.addEventListener('keydown', (e) => {
      if (!S.wiz || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        if (S.wiz.mixOpen && $('#mxFx') && !$('#mxFx').hidden && $('#bandConfirm').hidden) {
          e.preventDefault();
          mixFxClose(true);
        } else if (!$('#bandConfirm').hidden) hideConfirm();
        else if (S.wiz.dsel) closePop(true);
        else if (S.wiz.insp) closeInsp();
        else leave();
      } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        stepBy(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
    // fenêtre d'options d'une case de batterie : un clic ailleurs la ferme
    document.addEventListener('pointerdown', (e) => {
      if (S.wiz && S.wiz.dsel && !e.target.closest('.bwd-pop, .bwp-cell')) {
        S.wiz.dsel = null;
        keepScroll();
        renderWiz();
      }
    });
    // les raccourcis de la fenêtre principale (Espace, Ctrl+Z…) ne jouent pas quand on tape dans l'assistant
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && !e.altKey) e.stopPropagation();
    });
  }

  return { init, open, openWizard, resume, hasDraft, wizSnapshot, wizRestore, draftWhen, active, togglePlay, stopListen, setTempo, plannedTracks, instKind, setKind, insSteps, stepRef, stepNum, partsToInst, instPartOf, putInstPart, melodyTrackOpts, _state: S, _listen: () => L.proj };
})();
