/*
 * Boîte à outils pour Claude : window.StepSeq (maquette-claude-boite-a-outils.html).
 *
 * L'extension Claude in Chrome exécute du JavaScript dans l'onglet : elle appelle ces outils directement, sans cliquer
 * dans l'interface. Plus tard, le panneau intégré (API Claude) recevra la même liste (StepSeq.outils) comme outils.
 *
 * Règles :
 *  - chaque outil prend UN objet de paramètres (ou rien) et renvoie un objet JSON simple : { ok: true, message, … }
 *    ou { ok: false, erreur } ; une erreur ne casse rien, Claude corrige et réessaie ;
 *  - un outil d'écriture = une étape d'annulation (Ctrl+Z), un message « ✳ Claude : … » avec un bouton Annuler ;
 *    StepSeq.groupe(titre, () => {…}) regroupe plusieurs écritures en une seule étape ;
 *  - noms lisibles : scène « Refrain » (ou son id), piste par id ou par nom, note « E2 » / « Mi2 » / 40, accord « Am7 ».
 */
window.SS = window.SS || {};
SS.claudeTools = (() => {
  let app = null; // { project, changed, commit, switchScene, afterSceneChange, setBars, play, stop, undo, redo }
  let actions = 0; // écritures depuis l'ouverture de la page (badge « Claude »)
  let group = null; // { titre, n } pendant StepSeq.groupe

  const P = () => app.project();
  const H = () => SS.harmony;
  const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fail = (msg) => {
    throw new Error(msg);
  };

  /* ---------------- Recherches ---------------- */
  function findScene(ref) {
    const p = P();
    if (ref == null || ref === '' || fold(ref) === 'en cours') return SS.currentScene(p);
    const f = fold(ref);
    const sc = p.scenes.find((s) => s.id === ref) || p.scenes.find((s) => fold(s.name) === f);
    if (!sc) fail(`scène inconnue : « ${ref} ». Scènes : ${p.scenes.map((s) => s.name).join(', ')}`);
    return sc;
  }
  function findTrack(ref) {
    const p = P();
    if (ref == null) fail('piste manquante : donne son id ou son nom (voir StepSeq.etat())');
    const f = fold(ref);
    const t = p.tracks.find((x) => x.id === ref) || p.tracks.find((x) => fold(x.name) === f) || p.tracks.filter((x) => fold(x.name).includes(f)).sort((a, b) => a.name.length - b.name.length)[0];
    if (!t) fail(`piste inconnue : « ${ref} ». Pistes : ${p.tracks.map((x) => `${x.name} (${x.id})`).join(', ') || 'aucune'}`);
    return t;
  }
  /** Les écritures de notes portent sur la scène en cours : on y passe (visible pour l'utilisateur). */
  function goScene(ref) {
    const sc = findScene(ref);
    if (sc.id !== P().current) app.switchScene(sc.id);
    return SS.currentScene(P());
  }

  /* ---------------- Notes, tonalités, accords ---------------- */
  const FR_NOTE = SS.FR_LETTER;
  /** « E2 », « F#3 », « Bb1 », « Mi2 », « Sib3 », 40 → numéro MIDI (60 = Do central, C4). */
  function midiOf(n) {
    if (typeof n === 'number' && Number.isFinite(n)) return clamp(Math.round(n), 0, 127);
    let s = String(n).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
    const fr = /^(do|ré|re|mi|fa|sol|la|si)/i.exec(s);
    if (fr) s = FR_NOTE[fold(fr[1])] + s.slice(fr[1].length);
    const m = SS.parseNote(s);
    if (m == null) fail(`note illisible : « ${n} » (exemples : "E2", "F#3", "Sib2", ou 40)`);
    return clamp(m, 0, 127);
  }
  const PC = SS.LETTER_PC;
  /** Tonique écrite pour chaque classe de hauteur (toutes dans SS.harmony.TONICS). */
  const PC_TONIC = SS.TONIC_NAMES.major;
  /** « F », « Fa », « F# », « Sib », « Bb » → une tonique de SS.harmony.TONICS. */
  function tonicOf(x) {
    let s = String(x || '').trim();
    const fr = /^(do|ré|re|mi|fa|sol|la|si)/i.exec(s);
    if (fr) s = FR_NOTE[fold(fr[1])] + s.slice(fr[1].length);
    const m = /^([A-Ga-g])\s*([#♯b♭]?)/.exec(s);
    if (!m) fail(`tonique illisible : « ${x} » (exemples : "F", "Fa", "F#", "Sib")`);
    const L = m[1].toUpperCase();
    const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
    const name = L + (acc > 0 ? '♯' : acc < 0 ? '♭' : '');
    return H().TONICS.includes(name) ? name : PC_TONIC[(PC[L] + acc + 12) % 12];
  }
  const MODE_FR = { majeur: 'major', major: 'major', mineur: 'minor', minor: 'minor', 'mineur naturel': 'minor', 'mineur harmonique': 'harmonic', harmonic: 'harmonic', dorien: 'dorian', dorian: 'dorian', phrygien: 'phrygian', phrygian: 'phrygian', lydien: 'lydian', lydian: 'lydian', mixolydien: 'mixolydian', mixolydian: 'mixolydian', 'phrygien dominant': 'phrygdom', phrygdom: 'phrygdom', locrien: 'locrian', locrian: 'locrian' };
  function modeOf(m) {
    const id = MODE_FR[fold(m || 'majeur')];
    if (!id) fail(`mode inconnu : « ${m} » (${Object.keys(MODE_FR).filter((k) => !/[a-z]+ian$|^major$|^minor$|harmonic|phrygdom/.test(k)).join(', ')})`);
    return id;
  }
  const keyText = (k) => (k && H().valid(k) ? H().label(k) : 'aucune');
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const tonicPc = (k) => PC[k.tonic[0]] + (k.tonic[1] === '♯' ? 1 : k.tonic[1] === '♭' ? -1 : 0);

  /** « Am7 », « F#m7b5 », « C/E », « Sol7 » → accord de grille { degree, type, acc, bass? } dans la tonalité. */
  function gridChordOf(sym, key) {
    let c;
    try {
      c = SS.melody.parseChordSymbol(String(sym), key);
    } catch (e) {
      fail(e.message);
    }
    const ivs = [...c.ivs].sort((a, b) => a - b).join(',');
    const pcs = (l) => [...new Set(l.map(pcOf))].sort((a, b) => a - b).join(',');
    const t = SS.CHORDS.find((x) => [...x.iv].sort((a, b) => a - b).join(',') === ivs) || SS.CHORDS.find((x) => pcs(x.iv) === pcs(c.ivs));
    if (!t) fail(`accord « ${sym} » : cette couleur n'existe pas dans la grille de StepSeq (couleurs : ${SS.CHORDS.map((x) => x.label).join(', ')})`);
    const g = H().toGridChord(key, { rootPc: c.rootPc, type: t.id });
    if (!g) fail(`accord « ${sym} » : sa fondamentale est trop loin de ${keyText(key)} pour la grille (essaie une autre tonalité)`);
    const bass = pcOf(c.bassPc - c.rootPc);
    return bass ? { ...g, bass } : g;
  }
  const chordName = (key, c) => H().gridChord(key, c.degree, c.type, c.acc || 0, c.bass || 0).name;

  /* ---------------- Sons ---------------- */
  const ROLE_FR = { batterie: 'drums', batteur: 'drums', drums: 'drums', percu: 'perc', percussions: 'perc', perc: 'perc', basse: 'bass', bass: 'bass', nappe: 'pad', pad: 'pad', arpege: 'arp', arp: 'arp', lead: 'lead', melodie: 'lead', piano: 'keys', clavier: 'keys', keys: 'keys', guitare: 'guitar', guitar: 'guitar', cordes: 'strings', strings: 'strings', sax: 'sax', saxophone: 'sax', cuivres: 'brass', brass: 'brass', trompettes: 'brass', voix: 'vox', vox: 'vox', orchestre: 'orch', orch: 'orch', effets: 'fx', fx: 'fx' };
  function roleOf(r) {
    const id = ROLE_FR[fold(r)];
    if (!id) fail(`rôle inconnu : « ${r} ». Rôles : batterie, percu, basse, nappe, arpege, lead, piano, guitare, cordes, sax, cuivres, voix, orchestre, effets`);
    return { id, ...SS.Band.ROLES[id] };
  }
  const DRUM_FR = { kick: 'bd', 'grosse caisse': 'bd', bd: 'bd', snare: 'sd', 'caisse claire': 'sd', sd: 'sd', clap: 'cp', cp: 'cp', rim: 'rim', rimshot: 'rim', charley: 'hh', 'charley ferme': 'hh', hihat: 'hh', 'hi-hat': 'hh', hh: 'hh', 'charley ouvert': 'oh', 'hi-hat ouvert': 'oh', oh: 'oh', 'tom grave': 'lt', lt: 'lt', 'tom medium': 'mt', tom: 'mt', mt: 'mt', 'tom aigu': 'ht', ht: 'ht', crash: 'cr', cymbale: 'cr', cr: 'cr', ride: 'rd', rd: 'rd', cowbell: 'cb', cb: 'cb', shaker: 'sh', sh: 'sh', tambourin: 'tb', tb: 'tb', perc: 'perc', percussion: 'perc' };
  function drumOf(e) {
    const id = DRUM_FR[fold(e)] || (SS.DRUM_TYPES.find((d) => fold(d.label) === fold(e)) || {}).id;
    if (!id) fail(`élément de batterie inconnu : « ${e} ». Éléments : ${SS.DRUM_TYPES.map((d) => `${d.id} (${d.label})`).join(', ')}`);
    return id;
  }
  /** Instruments d'un rôle (familles du rôle), filtrés par un texte facultatif. */
  function instrumentsFor(role, query) {
    const fams = role ? role.families || [] : SS.FAMILIES.map((f) => f.id);
    const q = fold(query);
    const out = [];
    for (const fid of fams) {
      const f = SS.findFamily(fid);
      for (const i of f.instruments) if (!q || fold(i.label).includes(q) || fold(i.id).includes(q)) out.push({ son: i.id, nom: i.label, famille: f.label });
    }
    return out;
  }
  /** Options SS.newTrack pour un son : id du catalogue, « j:A48 » (Juno-106), ou un bout de nom. */
  function soundOpts(son, role) {
    const cat = role && role.cat;
    if (/^j:/i.test(son || '')) {
      const patch = son.slice(2);
      if (SS.JUNO_PATCHES && !SS.JUNO_PATCHES.some((x) => x.id === patch)) fail(`patch Juno inconnu : « ${patch} »`);
      return SS.Band.choiceOpts('j:' + patch, cat);
    }
    if (!son) {
      const first = instrumentsFor(role)[0];
      if (!first) fail('aucun son pour ce rôle');
      son = first.son;
    }
    for (const f of SS.FAMILIES) if (f.instruments.some((i) => i.id === son)) return SS.Band.choiceOpts(son, cat);
    const hit = instrumentsFor(role, son)[0] || instrumentsFor(null, son)[0];
    if (!hit) fail(`son introuvable : « ${son} ». Liste les sons avec StepSeq.sons({ role: "${role ? fold(role.short) : 'basse'}" })`);
    return SS.Band.choiceOpts(hit.son, cat);
  }
  function soundText(t) {
    if (t.type === 'drum') return `${SS.Band.drumLabel(t.sound)} · ${SS.Band.kitLabelOf(t)}`;
    if (t.family === 'analog') {
      const pt = (SS.JUNO_PATCHES || []).find((x) => x.id === t.junoPatch);
      return `Juno-106 · ${pt ? pt.id + ' ' + pt.name : t.junoPatch}`;
    }
    const { family, inst } = SS.locateInstrument(t.family, t.instrument);
    return `${inst.label} · ${family.label}`;
  }

  /* ---------------- Lecture de l'état ---------------- */
  function sceneInfo(sc) {
    const p = P();
    const key = SS.sceneKey(p, sc);
    const spb = SS.stepsPerBar(p);
    const chords = key && sc.grid ? [...sc.grid.chords].sort((a, b) => a.step - b.step) : [];
    return {
      id: sc.id,
      nom: sc.name,
      mesures: sc.id === p.current ? p.bars : sc.bars,
      tonalite: keyText(key),
      accords: chords.map((c) => chordName(key, c) + (c.step % spb ? ` (mesure ${Math.floor(c.step / spb) + 1}, pas ${c.step % spb})` : ` (mesure ${c.step / spb + 1})`)),
      ...(sc.emotion ? { emotion: sc.emotion } : {}),
    };
  }
  /** Contenu d'une piste dans une scène (la scène en cours vit dans les pistes, les autres dans scene.data). */
  function trackData(t, sc) {
    const p = P();
    if (sc.id === p.current) return t.type === 'drum' ? { steps: t.steps } : { events: t.events };
    return (sc.data || {})[t.id] || (t.type === 'drum' ? { steps: [] } : { events: [] });
  }
  function trackInfo(t) {
    const sc = SS.currentScene(P());
    const d = trackData(t, sc);
    return {
      id: t.id,
      nom: t.name,
      type: t.type === 'drum' ? 'batterie' : 'instrument',
      son: soundText(t),
      volume: Math.round(t.volume * 100) / 100,
      ...(t.mute ? { muet: true } : {}),
      ...(t.solo ? { solo: true } : {}),
      ...(SS.freeze && SS.freeze.isOn(t) ? { figee: SS.freeze.state(t) === 'on' ? 'oui' : 'en cours d’enregistrement' } : {}),
      ...(SS.follows(t) ? { suitAccords: true } : {}),
      ...(SS.arpOn(t) ? { arpege: true } : {}),
      contenuSceneEnCours: t.type === 'drum' ? `${(d.steps || []).filter((v) => v > 0).length} coups` : `${(d.events || []).length} notes`,
    };
  }
  function etat() {
    const p = P();
    return {
      titre: p.title,
      tempo: p.tempo,
      mesure: `${p.timeSig[0]}/${p.timeSig[1]}`,
      pasParMesure: SS.stepsPerBar(p),
      pasParTemps: SS.stepsPerBeat(p),
      sceneEnCours: SS.currentScene(p).name,
      lecture: p.playMode === 'song' ? 'chanson' : 'boucle de la scène',
      scenes: p.scenes.map(sceneInfo),
      structure: p.song.map((b) => ({ scene: (p.scenes.find((s) => s.id === b.scene) || {}).name, fois: b.repeat })),
      pistes: p.tracks.map(trackInfo),
    };
  }
  function piste({ piste: ref, scene } = {}) {
    const t = findTrack(ref);
    const sc = findScene(scene);
    const d = trackData(t, sc);
    const out = { ...trackInfo(t), scene: sc.name };
    delete out.contenuSceneEnCours;
    if (t.type === 'drum') {
      out.motif = (d.steps || []).map((v) => (v >= 0.95 ? 'X' : v >= 0.5 ? 'x' : v > 0 ? 'o' : '.')).join('');
      out.velocites = (d.steps || []).map((v) => Math.round(v * 100) / 100);
    } else {
      out.notes = (d.events || []).map((e) => ({ pas: e.step, note: e.notes.length > 1 ? e.notes.map(SS.noteName) : SS.noteName(e.notes[0]), dur: e.len, vel: Math.round((e.vel ?? 0.8) * 100) / 100 }));
    }
    if (t.fx) out.effets = t.fx;
    const au = sc.id === P().current ? t.auto : d.auto;
    if (au) out.automation = Object.fromEntries(Object.entries(au).map(([k, l]) => [k, Object.entries(l).map(([pas, valeur]) => ({ pas: +pas, valeur }))]));
    return out;
  }
  function accords({ scene } = {}) {
    const sc = findScene(scene);
    const key = SS.sceneKey(P(), sc);
    if (!key) return { scene: sc.name, tonalite: 'aucune', accords: [] };
    const list = sc.grid ? [...sc.grid.chords].sort((a, b) => a.step - b.step) : [];
    return { scene: sc.name, tonalite: keyText(key), accords: list.map((c) => ({ accord: chordName(key, c), pas: c.step, duree: c.len })) };
  }
  function sons({ role, recherche } = {}) {
    const r = role ? roleOf(role) : null;
    if (r && r.kind === 'kit')
      return {
        kits: Object.entries(SS.Band.KITS).map(([id, k]) => ({ kit: id, nom: k.label, ...(k.year ? { annee: k.year } : {}) })),
        elements: SS.DRUM_TYPES.map((d) => ({ element: d.id, nom: d.label })),
        conseil: 'une piste par élément : ajouterPiste({ role: "batterie", element: "bd", kit: "RolandTR909" })',
      };
    const list = instrumentsFor(r, recherche);
    return { total: list.length, sons: list.slice(0, 60), ...(list.length > 60 ? { conseil: 'affine avec « recherche »' } : {}) };
  }

  /* ---------------- Écritures ---------------- */
  function refresh() {
    SS.ui.renderAll();
    if (SS.song) SS.song.render();
  }
  function changedNow(label) {
    app.changed();
    afterChange(label);
  }
  /** Une écriture faite : une étape d'annulation (ou une de plus dans le groupe en cours). */
  function afterChange(label) {
    if (group) return void group.n++;
    app.commit();
    done(label);
  }
  function done(label) {
    actions++;
    badge();
    SS.ui.toast(`✳ Claude : ${label}`, 5000, { label: 'Annuler', run: () => app.undo() });
  }
  function badge() {
    const b = document.getElementById('claudeBadge');
    if (!b) return;
    b.hidden = false;
    b.querySelector('b').textContent = `${actions} action${actions > 1 ? 's' : ''}`;
  }

  function titre({ titre: x } = {}) {
    if (!x) fail('titre manquant');
    P().title = String(x).slice(0, 80);
    document.getElementById('title').value = P().title;
    changedNow(`titre « ${P().title} »`);
    return { message: `Titre : ${P().title}` };
  }
  function tempo({ bpm } = {}) {
    const v = Math.round(Number(bpm));
    if (!(v >= 20 && v <= 300)) fail('tempo entre 20 et 300 BPM');
    P().tempo = v;
    document.getElementById('tempo').value = v;
    SS.audio.applyAllFx(P());
    changedNow(`tempo ${v} BPM`);
    return { message: `Tempo : ${v} BPM` };
  }
  function mesure({ temps, unite = 4 } = {}) {
    const n = Math.round(Number(temps));
    const d = Math.round(Number(unite));
    if (!(n >= 1 && n <= 12) || ![2, 4, 8, 16].includes(d)) fail('mesure : temps de 1 à 12, unité 2, 4, 8 ou 16 (ex. { temps: 3, unite: 4 })');
    const p = P();
    p.timeSig = [n, d];
    SS.resizeProject(p);
    document.getElementById('sigNum').value = n;
    document.getElementById('sigDen').value = d;
    refresh();
    changedNow(`mesure ${n}/${d}`);
    return { message: `Mesure : ${n}/${d}`, pasParMesure: SS.stepsPerBar(p) };
  }
  function mesures({ nombre, scene } = {}) {
    const n = Math.round(Number(nombre));
    if (!(n >= 1 && n <= 64)) fail('nombre de mesures entre 1 et 64');
    const sc = goScene(scene);
    app.setBars(n); // plus de mesures : les nouvelles reprennent le motif (comme le sélecteur Mesures) ; appelle changed()
    afterChange(`${sc.name} : ${n} mesures`);
    return { message: `${sc.name} : ${n} mesures (les mesures ajoutées reprennent le motif existant)` };
  }

  function tonalite({ tonique, mode = 'majeur', scene, transposer = true } = {}) {
    const p = P();
    const sc = findScene(scene);
    const key = { tonic: tonicOf(tonique), mode: modeOf(mode) };
    if (!H().valid(key)) fail('tonalité invalide');
    const old = SS.sceneKey(p, sc);
    let shift = 0;
    if (old && transposer) {
      shift = pcOf(tonicPc(key) - tonicPc(old));
      if (shift > 6) shift -= 12; // l'intervalle le plus court : Mi → Fa monte d'un demi-ton, Mi → Ré descend d'un ton
    }
    if (shift) {
      if (sc.id !== p.current) goScene(sc.id);
      for (const t of p.tracks) if (t.type === 'instrument' && !SS.follows(t)) t.events.forEach((e) => (e.notes = e.notes.map((m) => clamp(m + shift, 0, 127))));
    }
    sc.key = key; // les accords de la grille sont des degrés : ils suivent la tonalité
    SS.ui.updateKeyButton();
    refresh();
    changedNow(`${sc.name} en ${keyText(key)}${shift ? ` (notes transposées de ${shift > 0 ? '+' : ''}${shift} demi-ton${Math.abs(shift) > 1 ? 's' : ''})` : ''}`);
    return { message: `${sc.name} : ${keyText(key)}`, transposition: shift, accords: accords({ scene: sc.id }).accords.map((c) => c.accord) };
  }

  function ecrireAccords({ scene, accords: list, tonalite: k } = {}) {
    const p = P();
    const sc = findScene(scene);
    if (!Array.isArray(list) || !list.length) fail('accords : une liste, une mesure par élément, ex. ["Am", "F", "C G"] (« C G » = deux accords dans la mesure)');
    let key = SS.sceneKey(p, sc);
    if (k) key = { tonic: tonicOf(k.tonique || k.tonic), mode: modeOf(k.mode) };
    if (!key) {
      // pas de tonalité : celle du premier accord (majeur ou mineur)
      const c = SS.melody.parseChordSymbol(String(list[0]).split(/\s+/)[0]);
      const minor = c.ivs.includes(3) && !c.ivs.includes(4);
      key = { tonic: PC_TONIC[c.rootPc], mode: minor ? 'minor' : 'major' };
    }
    const spb = SS.stepsPerBar(p);
    const chords = [];
    list.forEach((bar, b) => {
      if (bar && typeof bar === 'object') {
        // { accord, pas, duree } : placement libre
        chords.push({ step: Math.max(0, Math.round(bar.pas)), len: Math.max(1, Math.round(bar.duree || spb)), ...gridChordOf(bar.accord, key) });
        return;
      }
      const parts = String(bar).trim().split(/\s+/).filter(Boolean);
      const len = spb / parts.length;
      parts.forEach((sym, i) => chords.push({ step: Math.round(b * spb + i * len), len: Math.max(1, Math.round(len)), ...gridChordOf(sym, key) }));
    });
    const bars = sc.id === p.current ? p.bars : sc.bars;
    const total = bars * spb;
    sc.key = key;
    const g = SS.sceneGrid(sc);
    g.initialized = true;
    g.chords = chords.filter((c) => c.step < total).map((c) => ({ ...c, len: Math.min(c.len, total - c.step) }));
    SS.ui.updateKeyButton();
    refresh();
    const names = g.chords.map((c) => chordName(key, c));
    changedNow(`accords de ${sc.name} : ${names.join(' – ')}`);
    return { message: `${sc.name} (${keyText(key)}) : ${names.join(' – ')}`, ...(list.length > bars ? { attention: `la scène n'a que ${bars} mesures : les accords en trop sont ignorés (StepSeq.mesures)` } : {}) };
  }

  /** ✦ PROPOSER : la tonalité puis des accords d'après la basse et la mélodie de la scène (comme le bouton de la piste Accords). */
  function proposerAccords({ scene, choix = 0 } = {}) {
    const p = P();
    const sc = goScene(scene);
    const notes = [];
    for (const t of p.tracks) {
      if (t.type !== 'instrument' || SS.follows(t) || !(t.events || []).length) continue;
      const all = t.events.flatMap((e) => e.notes);
      const isBass = all.reduce((a, m) => a + m, 0) / all.length < 50;
      for (const e of t.events) {
        const low = Math.min(...e.notes);
        for (const midi of e.notes) notes.push({ step: e.step, len: e.len, midi, bass: isBass && midi === low });
      }
    }
    if (notes.length < 2) fail('il faut d’abord une basse ou une mélodie dans la scène : StepSeq en déduit la tonalité et les accords');
    const keys = H().suggestKeys(notes);
    if (!keys.length) fail('tonalité introuvable');
    const key = keys[0].key;
    const props = H().harmonize(key, notes, SS.totalSteps(p), { slot: SS.stepsPerBar(p), loop: 4 });
    if (!props || !props.length) fail('pas assez de notes pour proposer des accords');
    const pr = props[Math.abs(Math.round(choix)) % props.length];
    sc.key = { ...key };
    const g = SS.sceneGrid(sc);
    g.initialized = true;
    g.chords = pr.grid.map((c) => ({ step: c.step, len: c.len, degree: c.degree, type: c.type, acc: c.acc || 0 }));
    SS.ui.updateKeyButton();
    refresh();
    const names = g.chords.map((c) => chordName(key, c));
    changedNow(`accords proposés pour ${sc.name} : ${names.join(' – ')}`);
    return {
      message: `${sc.name} : ${keyText(key)}, ${names.join(' – ')}`,
      pourquoi: pr.title,
      autresTonalites: keys.slice(1).map((k) => `${keyText(k.key)} (${k.pct} %)`),
      autresGrilles: props.length - 1,
      conseil: props.length > 1 ? `une autre grille : proposerAccords({ scene: "${sc.name}", choix: ${(Math.abs(Math.round(choix)) + 1) % props.length} })` : undefined,
    };
  }

  function ajouterPiste({ role, son, nom, element, kit, suitAccords } = {}) {
    const p = P();
    const r = roleOf(role || 'lead');
    let opts;
    if (r.kind === 'kit') {
      const piece = drumOf(element || 'bd');
      const k = kit ? Object.keys(SS.Band.KITS).find((id) => fold(id) === fold(kit) || fold(SS.Band.KITS[id].label) === fold(kit)) : 'RolandTR808';
      if (!k) fail(`kit inconnu : « ${kit} ». Liste : StepSeq.sons({ role: "batterie" })`);
      opts = SS.Band.pieceOpts(k, piece).opts;
      opts.name = nom || SS.Band.drumLabel(piece);
    } else {
      opts = soundOpts(son, r);
      opts.name = nom || r.short;
      if (suitAccords) opts.follow = true;
    }
    opts.color = r.color;
    const t = SS.newTrack(opts, p);
    const fx = t.type === 'instrument' && !t.fx && SS.presetFx(t.family, t.instrument);
    if (fx) t.fx = fx;
    p.tracks.push(t);
    refresh();
    SS.audio.prepareTrack(t);
    changedNow(`piste « ${t.name} » ajoutée (${soundText(t)})`);
    return { message: `Piste « ${t.name} » : ${soundText(t)}`, id: t.id };
  }

  function supprimerPiste({ piste: ref } = {}) {
    const p = P();
    const t = findTrack(ref);
    p.tracks = p.tracks.filter((x) => x !== t);
    p.scenes.forEach((sc) => sc.data && delete sc.data[t.id]);
    SS.audio.removeTrack(t.id);
    refresh();
    changedNow(`piste « ${t.name} » supprimée`);
    return { message: `Piste « ${t.name} » supprimée (Ctrl+Z la ramène)` };
  }

  function renommerPiste({ piste: ref, nom } = {}) {
    const t = findTrack(ref);
    if (!nom) fail('nom manquant');
    const old = t.name;
    t.name = String(nom).slice(0, 40);
    SS.ui.renderTrack(t);
    changedNow(`« ${old} » devient « ${t.name} »`);
    return { message: `Piste renommée : ${t.name}` };
  }

  function son({ piste: ref, son: s } = {}) {
    const p = P();
    const t = findTrack(ref);
    if (t.type === 'drum') {
      const k = Object.keys(SS.Band.KITS).find((id) => fold(id) === fold(s) || fold(SS.Band.KITS[id].label) === fold(s));
      if (!k) fail(`batterie : donne un kit (StepSeq.sons({ role: "batterie" }))`);
      const { fx, ...o } = SS.Band.pieceOpts(k, t.sound).opts;
      Object.assign(t, o);
      // effets propres au kit (reverb gated…) : remplacés par ceux du nouveau kit, le reste des effets est gardé
      const rest = { ...(t.fx || {}) };
      delete rest.gated;
      t.fx = { ...rest, ...(fx || {}) };
      if (!Object.keys(t.fx).length) delete t.fx;
    } else {
      const fresh = SS.newTrack({ ...soundOpts(s, null), name: t.name, color: t.color }, p);
      for (const k of ['family', 'instrument', 'sfv', 'octave']) t[k] = fresh[k];
      if (fresh.junoPatch) t.junoPatch = fresh.junoPatch;
      else delete t.junoPatch;
    }
    SS.ui.renderTrack(t);
    SS.audio.prepareTrack(t);
    changedNow(`« ${t.name} » joue ${soundText(t)}`);
    return { message: `${t.name} : ${soundText(t)}` };
  }

  function mix({ piste: ref, volume, muet, solo } = {}) {
    const t = findTrack(ref);
    const what = [];
    if (volume != null) {
      const v = Number(volume);
      if (!(v >= 0 && v <= 1)) fail('volume entre 0 et 1');
      t.volume = v;
      what.push(`volume ${Math.round(v * 100)} %`);
    }
    if (muet != null) {
      t.mute = !!muet;
      what.push(muet ? 'muette' : 'audible');
    }
    if (solo != null) {
      t.solo = !!solo;
      what.push(solo ? 'en solo' : 'solo retiré');
    }
    if (!what.length) fail('rien à changer : volume (0–1), muet, solo');
    SS.ui.renderTrack(t);
    SS.audio.applyAllFx(P());
    changedNow(`${t.name} : ${what.join(', ')}`);
    return { message: `${t.name} : ${what.join(', ')}` };
  }

  /** Figer une piste en audio (js/freeze.js) : jouée depuis son enregistrement, presque plus de calcul. */
  function figer({ piste: ref, figer: on = true } = {}) {
    const t = findTrack(ref);
    if (t.type !== 'instrument') fail('seules les pistes instrument se figent (la batterie coûte peu)');
    SS.freeze.set(t, on !== false);
    return { message: `${t.name} : ${on !== false ? 'figée (enregistrement en arrière-plan, quelques secondes)' : 'dégelée (joue en direct)'}` };
  }

  /** Notes [{ pas, note, dur, vel }] → événements de piste (notes de même pas et même durée = un accord). */
  function toEvents(notes, total) {
    if (!Array.isArray(notes)) fail('notes : une liste [{ pas, note, dur, vel }]');
    const by = new Map();
    for (const n of notes) {
      if (!n || n.pas == null || n.note == null) fail('chaque note : { pas, note, dur?, vel? } (ex. { pas: 0, note: "E2", dur: 2, vel: 0.9 })');
      const step = Math.round(Number(n.pas));
      if (!(step >= 0) || step >= total) continue;
      const len = clamp(Math.round(Number(n.dur) || 1), 1, total - step);
      const vel = clamp(Number(n.vel ?? 0.8), 0.05, 1);
      const midis = (Array.isArray(n.note) ? n.note : [n.note]).map(midiOf);
      const k = step + ':' + len;
      const e = by.get(k);
      if (e) e.notes.push(...midis.filter((m) => !e.notes.includes(m)));
      else by.set(k, { step, len, notes: [...new Set(midis)], vel });
    }
    return [...by.values()].sort((a, b) => a.step - b.step);
  }
  function ecrireNotes({ piste: ref, scene, notes, ajouter = false, deMesure, aMesure } = {}) {
    const p = P();
    const t = findTrack(ref);
    if (t.type !== 'instrument') fail(`« ${t.name} » est une piste de batterie : utilise ecrireBatterie`);
    if (SS.isAmbient(t)) fail(`« ${t.name} » est une piste générative : son module choisit ses notes ; règle sa présence avec presence()`);
    const sc = goScene(scene);
    const total = SS.trackLen(p, t);
    const evs = toEvents(notes, total);
    const spb = SS.stepsPerBar(p);
    if (deMesure != null) {
      const a = (Math.max(1, deMesure) - 1) * spb;
      const z = (aMesure != null ? aMesure : deMesure) * spb;
      t.events = t.events.filter((e) => e.step < a || e.step >= z).concat(evs).sort((x, y) => x.step - y.step);
    } else t.events = ajouter ? t.events.concat(evs).sort((x, y) => x.step - y.step) : evs;
    SS.ui.renderTrack(t);
    changedNow(`${evs.length} note${evs.length > 1 ? 's' : ''} pour « ${t.name} » (${sc.name})`);
    return { message: `${t.name}, ${sc.name} : ${evs.length} note(s) écrites, ${t.events.length} au total`, ...(SS.followsGhost(t) ? { attention: 'cette piste suit les accords en mode Tenu ou arpège : ses notes ne s’entendent pas telles quelles' } : {}) };
  }

  const MOTIF_VEL = { X: 1, x: 0.8, o: 0.35, '.': 0, '-': 0, _: 0 };
  function ecrireBatterie({ piste: ref, scene, motif, pas, vel = 0.8 } = {}) {
    const p = P();
    const t = findTrack(ref);
    if (t.type !== 'drum') fail(`« ${t.name} » n'est pas une piste de batterie : utilise ecrireNotes`);
    const sc = goScene(scene);
    const n = t.steps.length;
    const steps = new Array(n).fill(0);
    if (typeof motif === 'string') {
      const m = motif.replace(/[\s|]/g, '');
      if (!m.length || /[^Xxo.\-_]/.test(m)) fail('motif : X (accent), x (coup), o (ghost note), . (silence) ; ex. "x...x...x...x..." ; les barres | et espaces sont ignorés');
      for (let i = 0; i < n; i++) steps[i] = MOTIF_VEL[m[i % m.length]];
    } else if (Array.isArray(pas)) {
      for (const s of pas) {
        const o = typeof s === 'object' ? s : { pas: s, vel };
        const i = Math.round(o.pas);
        if (i >= 0 && i < n) steps[i] = clamp(Number(o.vel ?? vel), 0.05, 1);
      }
    } else fail('donne un motif ("x...o...") ou une liste de pas ([0, 4, 8, 12] ou [{ pas, vel }])');
    t.steps = steps;
    SS.cleanDrumConds(SS.cleanDrumRatchets(t));
    SS.ui.renderTrack(t);
    const hits = steps.filter((v) => v > 0).length;
    changedNow(`« ${t.name} » : ${hits} coups (${sc.name})`);
    return { message: `${t.name}, ${sc.name} : ${hits} coups sur ${n} pas` };
  }

  /* ---------------- Effets et automation ---------------- */
  // nom en français → réglage de track.fx (js/fx.js), avec ses bornes
  const FX_KEYS = {
    chorus: ['chorus', 0, 1], chorusVitesse: ['chorusRate', 0.1, 6], chorusProfondeur: ['chorusDepth', 0, 1],
    delay: ['delay', 0, 1], delayRepetitions: ['delayFeedback', 0, 0.9],
    reverb: ['room', 0, 1], reverbGated: ['gated', 0, 1], reverbTaille: ['roomSize', 0.2, 10], reverbBrillance: ['roomLp', 500, 20000],
    sidechainProfondeur: ['scDepth', 0, 1], sidechainRelachement: ['scRelease', 0.03, 1],
    envoiPlate: ['sendPlate', 0, 1], envoiHall: ['sendHall', 0, 1], envoiEcho: ['sendEcho', 0, 1], envoiCosmos: ['sendSpace', 0, 1],
  };
  function effets({ piste: ref, aucun, delayTemps, sidechainSource, scene, ...vals } = {}) { // eslint-disable-line no-unused-vars
    // les effets sont communs à toutes les scènes : `scene` est ignorée
    const p = P();
    const t = findTrack(ref);
    const patch = {};
    const what = [];
    if (aucun) {
      delete t.fx;
      what.push('effets retirés');
    }
    for (const [k, v] of Object.entries(vals)) {
      if (v == null) continue;
      const spec = FX_KEYS[k];
      if (!spec) fail(`réglage d'effet inconnu : « ${k} ». Réglages : ${Object.keys(FX_KEYS).join(', ')}, delayTemps, sidechainSource, aucun`);
      const n = Number(v);
      if (!(n >= spec[1] && n <= spec[2])) fail(`${k} : entre ${spec[1]} et ${spec[2]}`);
      patch[spec[0]] = n;
      what.push(`${k} ${n}`);
    }
    if (delayTemps != null) {
      const d = SS.DELAY_TIMES.find((x) => x.id === String(delayTemps) || fold(x.label) === fold(delayTemps));
      if (!d) fail(`delayTemps : ${SS.DELAY_TIMES.map((x) => `"${x.id}" (${x.label})`).join(', ')}`);
      patch.delayTime = d.id;
      what.push(`delay ${d.label}`);
    }
    if (sidechainSource != null) {
      const src = sidechainSource ? findTrack(sidechainSource) : null;
      if (src === t) fail('une piste ne peut pas se déclencher elle-même en sidechain');
      patch.scSource = src ? src.id : '';
      what.push(src ? `sidechain déclenché par ${src.name}` : 'sidechain retiré');
    }
    if (!what.length) fail(`rien à changer. Réglages : ${Object.keys(FX_KEYS).join(', ')}, delayTemps, sidechainSource, aucun`);
    t.fx = { ...(t.fx || {}), ...patch };
    for (const [k, v] of Object.entries(t.fx)) if (v === SS.FX_DEFAULTS[k]) delete t.fx[k]; // comme la fenêtre Effets
    if (!Object.keys(t.fx).length) delete t.fx;
    SS.audio.applyFx(t);
    SS.ui.renderTrack(t);
    changedNow(`effets de « ${t.name} » : ${what.join(', ')}`);
    return { message: `${t.name} : ${what.join(', ')}`, effets: { ...SS.fxParams(t), ...(SS.fxParams(t).scSource ? { scSource: (p.tracks.find((x) => x.id === SS.fxParams(t).scSource) || {}).name } : {}) } };
  }

  /**
   * Présence d'une piste générative dans une scène (la bande de la Grille) : la part de sa courbe « présence sur toute
   * la chanson » qui tombe dans la scène. valeur : constante ; debut / fin : une rampe. Sans réglage : la lit.
   */
  function presence({ piste: ref, scene, valeur, debut, fin } = {}) {
    const t = findTrack(ref);
    if (!SS.isAmbient(t)) fail(`« ${t.name} » n’est pas une piste générative (Jardin, Paysage, Fresque)`);
    const sc = goScene(scene);
    const A = SS.ambient;
    const [a, b] = A.sceneSpan(P());
    const PN = A.PN;
    const i0 = Math.round(a * (PN - 1)), i1 = Math.round(b * (PN - 1));
    const cur = (t.ambient && Array.isArray(t.ambient.presence) ? t.ambient.presence : null);
    const read = () => [0, 0.25, 0.5, 0.75, 1].map((x) => Math.round(A.curveAt(cur, a + (b - a) * x) * 100) / 100);
    if (valeur == null && debut == null && fin == null) return { piste: t.name, scene: sc.name, presence: read(), lecture: 'début, 1/4, milieu, 3/4, fin de la scène (0–1)' };
    const v0 = Number(valeur != null ? valeur : debut != null ? debut : fin);
    const v1 = Number(valeur != null ? valeur : fin != null ? fin : debut);
    if (![v0, v1].every((v) => v >= 0 && v <= 1)) fail('présence entre 0 et 1');
    const arr = (cur || new Array(PN).fill(1)).slice();
    for (let k = i0; k <= i1; k++) arr[k] = Math.round((i1 === i0 ? v1 : v0 + ((v1 - v0) * (k - i0)) / (i1 - i0)) * 1000) / 1000;
    t.ambient = { ...(t.ambient || {}), presence: arr };
    SS.ui.renderTrack(t);
    changedNow(`présence de « ${t.name} » dans ${sc.name} : ${v0 === v1 ? v0 : `${v0} → ${v1}`}`);
    return { message: `${t.name}, ${sc.name} : présence ${v0 === v1 ? v0 : `${v0} → ${v1}`}` };
  }

  /** Paramètres et formes d'automation proposés pour une piste. */
  function automations({ piste: ref } = {}) {
    const t = findTrack(ref);
    return {
      piste: t.name,
      parametres: SS.autoParamsFor(t).map((P) => ({ parametre: P.id, nom: P.label, min: P.min, max: P.max, defaut: P.def, formes: (SS.AUTO_SHAPES[P.id] || []).map((x) => `${x.id} (${x.label})`) })),
      enPlace: t.auto ? Object.keys(t.auto) : [],
    };
  }
  function automation({ piste: ref, scene, parametre, forme, points, effacer } = {}) {
    const p = P();
    const t = findTrack(ref);
    const Pm = SS.autoParamsFor(t).find((x) => x.id === parametre || fold(x.label) === fold(parametre));
    if (!Pm) fail(`paramètre d'automation inconnu pour « ${t.name} » : « ${parametre} ». Voir automations({ piste: "${t.name}" })`);
    const sc = goScene(scene);
    const n = SS.autoLen(p, t);
    let what;
    if (effacer) {
      if (t.auto) delete t.auto[Pm.id];
      what = `automation ${Pm.label} effacée`;
    } else if (forme) {
      const sh = (SS.AUTO_SHAPES[Pm.id] || []).find((x) => x.id === forme || fold(x.label) === fold(forme));
      if (!sh) fail(`forme inconnue pour ${Pm.label} : ${(SS.AUTO_SHAPES[Pm.id] || []).map((x) => x.id).join(', ') || 'aucune forme toute prête, donne des points'}`);
      SS.applyAutoShape(t, Pm.id, sh.id, n, SS.stepsPerBeat(p), SS.stepsPerBar(p));
      what = `${Pm.label} : ${sh.label}`;
    } else if (Array.isArray(points) && points.length) {
      if (t.auto) delete t.auto[Pm.id];
      for (const pt of points) {
        const s = Math.round(Number(pt && pt.pas));
        const v = Number(pt && pt.valeur);
        if (!(s >= 0 && s < n) || !(v >= Pm.min && v <= Pm.max)) fail(`point invalide ${JSON.stringify(pt)} : pas 0 à ${n - 1}, valeur ${Pm.min} à ${Pm.max}`);
        SS.setAutoPoint(t, Pm.id, s, v);
      }
      what = `${Pm.label} : ${points.length} points`;
    } else fail('donne une forme (voir automations()), des points [{ pas, valeur }] ou effacer: true');
    SS.cleanAuto(t);
    SS.ui.renderTrack(t);
    changedNow(`${t.name}, ${sc.name} : ${what}`);
    return { message: `${t.name}, ${sc.name} : ${what} (les valeurs glissent d'un point à l'autre)` };
  }

  /* ---------------- Console, retours, Master ----------------
   * Noms français → réglages internes (SS.MIX_DEFAULTS, SS.RETURN_DEFAULTS, SS.MASTER_DEFAULTS dans js/project.js).
   * Une carte : { nomFr: 'cléInterne' } pour un réglage, { nomFr: ['cléInterne', sous-carte] } pour un module.
   * Donner un réglage d'un module (EQ, compresseur…) l'allume, sauf si `actif` est donné aussi. Les bornes sont celles
   * de la console (SS.cleanMix…) : une valeur hors bornes est ramenée à la borne. */
  const EQ_BAND = { f: 'f', gain: 'g', q: 'q' };
  const MIX_FR = {
    pan: 'pan',
    eq: ['eq', { actif: 'on', passeHaut: ['hp', { actif: 'on', f: 'f' }], graves: ['low', { f: 'f', gain: 'g' }], basMedium: ['lm', EQ_BAND], hautMedium: ['hm', EQ_BAND], aigus: ['high', { f: 'f', gain: 'g' }] }],
    compresseur: ['comp', { actif: 'on', seuil: 'th', ratio: 'ratio', attaque: 'att', relachement: 'rel', genou: 'knee', gain: 'makeup' }],
    limiteur: ['lim', { actif: 'on', plafond: 'ceil', relachement: 'rel' }],
  };
  const MASTER_MIX_FR = { ...MIX_FR, filtre: ['vcf', { actif: 'on', pente: 'slope', passeHaut: ['hp', { f: 'f', resonance: 'res' }], passeBas: ['lp', { f: 'f', resonance: 'res' }] }] };
  const MASTER_FX_FR = { actif: 'on', saturation: ['saturation', { actif: 'on', quantite: 'amount' }], chorus: ['chorus', { actif: 'on', mix: 'mix' }], reverb: ['reverb', { actif: 'on', mix: 'mix' }] };
  const MASTERING_FR = { actif: 'on', drive: 'drive', plafond: 'ceiling', largeur: 'width', mono: 'mono', relachement: 'release', clip: 'clip' };
  const RET_COMMON = { passeHaut: 'hp', passeBas: 'lp', niveau: 'level' };
  const RET_FR = {
    plate: ['plate', { taille: 'size', predelai: 'predelay', ...RET_COMMON }],
    hall: ['hall', { taille: 'size', predelai: 'predelay', ...RET_COMMON }],
    echo: ['echo', { temps: 'time', repetitions: 'feedback', pleurage: 'wow', saturation: 'drive', ...RET_COMMON }],
    cosmos: ['space', { duree: 'decay', taille: 'size', predelai: 'predelay', amorti: 'damp', modulation: 'mod', shimmer: 'shimmer', gel: 'freeze', ...RET_COMMON }],
  };
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  /** Applique les réglages français `src` sur `cur` (réglages internes), d'après la carte `map`. */
  function patchFr(cur, src, map, path = '') {
    if (!isObj(src)) fail(`${path || 'réglages'} : donne un objet { ${Object.keys(map).join(', ')} }`);
    for (const [k, v0] of Object.entries(src)) {
      if (v0 === undefined) continue;
      const spec = map[k];
      if (!spec) fail(`${path}${k} : réglage inconnu. Réglages : ${Object.keys(map).join(', ')}`);
      if (Array.isArray(spec)) {
        const [ik, sub] = spec;
        let v = v0;
        const first = Object.keys(sub).find((x) => x !== 'actif');
        if (sub.actif && typeof v === 'boolean') v = { actif: v };
        else if (sub.actif && typeof v === 'number') v = { [first]: v }; // passeHaut: 80, saturation: 0.3
        patchFr((cur[ik] = isObj(cur[ik]) ? cur[ik] : {}), v, sub, `${path}${k}.`);
        if (sub.actif && v.actif === undefined) cur[ik].on = true;
        continue;
      }
      if (spec === 'on' || spec === 'freeze') cur[spec] = !!v0;
      else if (spec === 'time') {
        const d = SS.DELAY_TIMES.find((x) => x.id === String(v0) || fold(x.label) === fold(v0));
        if (!d) fail(`${path}${k} : ${SS.DELAY_TIMES.map((x) => `"${x.id}"`).join(', ')}`);
        cur.time = d.id;
      } else {
        const n = Number(v0);
        if (typeof v0 === 'boolean' || !Number.isFinite(n)) fail(`${path}${k} : un nombre`);
        cur[spec] = spec === 'slope' ? (n >= 18 ? 24 : 12) : n;
      }
    }
  }
  /** Réglages internes → noms français (même carte). */
  function toFr(cur, map) {
    const out = {};
    for (const [k, spec] of Object.entries(map)) {
      if (Array.isArray(spec)) out[k] = toFr(cur[spec[0]] || {}, spec[1]);
      else if (cur[spec] !== undefined) out[k] = spec === 'on' || spec === 'freeze' ? !!cur[spec] : cur[spec];
    }
    return out;
  }
  const r2 = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  const given = (o) => Object.keys(o).filter((k) => o[k] !== undefined);

  /** Inserts de la tranche d'une piste : panoramique, EQ, compresseur, limiteur. Sans réglage : les lit. */
  function consoleTool({ piste: ref, reinitialiser, ...vals } = {}) {
    const t = findTrack(ref);
    const ks = given(vals);
    if (!ks.length && !reinitialiser) return { piste: t.name, console: r2(toFr(SS.mixParams(t), MIX_FR)) };
    const m = reinitialiser ? JSON.parse(JSON.stringify(SS.MIX_DEFAULTS)) : SS.mixParams(t);
    patchFr(m, vals, MIX_FR);
    t.mix = SS.cleanMix(m);
    SS.audio.applyMix(t);
    SS.ui.renderTrack(t);
    const what = [reinitialiser ? 'remise à zéro' : null, ...ks].filter(Boolean).join(', ');
    changedNow(`console de « ${t.name} » : ${what}`);
    return { message: `${t.name} : ${what}`, console: r2(toFr(SS.mixParams(t), MIX_FR)) };
  }

  /** Bus d'effets partagés (Plate, Hall, Écho, Cosmos). Sans réglage : les lit. */
  function retours({ reinitialiser, ...vals } = {}) {
    const p = P();
    const ks = given(vals);
    if (!ks.length && !reinitialiser) return { retours: r2(toFr(SS.returnParams(p), RET_FR)) };
    const r = reinitialiser ? JSON.parse(JSON.stringify(SS.RETURN_DEFAULTS)) : SS.returnParams(p);
    patchFr(r, vals, RET_FR);
    p.returns = SS.cleanReturns(r);
    SS.audio.applyMaster(p);
    const what = [reinitialiser ? 'remise à zéro' : null, ...ks].filter(Boolean).join(', ');
    changedNow(`retours : ${what}`);
    return { message: `Retours : ${what}`, retours: r2(toFr(SS.returnParams(p), RET_FR)) };
  }

  /** Master : volume, console (EQ, filtre, compresseur, limiteur), effets du Master, mastering. Sans réglage : le lit. */
  function master({ volume, effets: fx, mastering, reinitialiser, ...mixVals } = {}) {
    const p = P();
    const read = () => {
      const mp = SS.masterParams(p);
      return r2({ volume: mp.volume, ...toFr(mp.mix, MASTER_MIX_FR), effets: toFr(SS.cleanMasterEffects(mp.effects), MASTER_FX_FR), mastering: toFr(SS.cleanMastering(mp.mastering), MASTERING_FR) });
    };
    const ks = given({ volume, effets: fx, mastering, ...mixVals });
    if (!ks.length && !reinitialiser) return { master: read() };
    const mp = reinitialiser ? JSON.parse(JSON.stringify(SS.MASTER_DEFAULTS)) : SS.masterParams(p);
    if (volume !== undefined) {
      const v = Number(volume);
      if (!(v >= 0 && v <= 2)) fail('volume : entre 0 et 2 (0.8 par défaut)');
      mp.volume = v;
    }
    patchFr(mp.mix, mixVals, MASTER_MIX_FR);
    if (fx !== undefined) {
      const e = SS.cleanMasterEffects(mp.effects);
      patchFr(e, typeof fx === 'boolean' ? { actif: fx } : fx, MASTER_FX_FR, 'effets.');
      if (isObj(fx) && fx.actif === undefined) e.on = true;
      mp.effects = e;
    }
    if (mastering !== undefined) {
      const ms = SS.cleanMastering(mp.mastering);
      patchFr(ms, typeof mastering === 'boolean' ? { actif: mastering } : mastering, MASTERING_FR, 'mastering.');
      if (isObj(mastering) && mastering.actif === undefined) ms.on = true;
      mp.mastering = ms;
    }
    p.master = { ...mp, mix: SS.cleanMix(mp.mix, SS.MASTER_DEFAULTS.mix), effects: SS.cleanMasterEffects(mp.effects), mastering: SS.cleanMastering(mp.mastering) };
    SS.audio.applyMaster(p);
    const what = [reinitialiser ? 'remise à zéro' : null, ...ks].filter(Boolean).join(', ');
    changedNow(`Master : ${what}`);
    return { message: `Master : ${what}`, master: read() };
  }

  /* ---------------- Automation par temps sur toute la chanson (js/beatauto.js) ---------------- */
  const BA = () => SS.beatAuto;
  const BAUTO_FR = { cutoff: 'cut', cut: 'cut', filtre: 'cut', resonance: 'res', res: 'res', velocite: 'vel', vel: 'vel' };
  const BSHAPE_FR = { montee: 'rise', rise: 'rise', descente: 'fall', fall: 'fall', vague: 'swell', swell: 'swell', neutre: 'flat', flat: 'flat' };
  function bautoParam(t, parametre) {
    const k = BAUTO_FR[fold(parametre).replace(/[^a-z]/g, '')];
    if (!k) fail(`paramètre inconnu : « ${parametre} » (cutoff, resonance, velocite)`);
    const ok = BA().paramsFor(t);
    if (!ok.some((x) => x.id === k)) fail(`« ${t.name} » : ${ok.map((x) => x.label.toLowerCase()).join(', ')} seulement (batterie et Juno-106 : la vélocité)`);
    return BA().P[k];
  }
  /** Tous les passages de la chanson, dans l'ordre : { block, rep, bar (1re mesure, à partir de 0), bars, scene, n (n° du passage de la scène, à partir de 1) }. */
  function allPasses(p) {
    const out = [];
    const seen = {};
    let bar = 0;
    p.song.forEach((b, i) => {
      const sc = p.scenes.find((s) => s.id === b.scene);
      if (!sc) return;
      const bars = sc.id === p.current ? p.bars : sc.bars;
      for (let r = 0; r < b.repeat; r++) {
        seen[sc.id] = (seen[sc.id] || 0) + 1;
        out.push({ block: i, rep: r, bar, bars, scene: sc, n: seen[sc.id] });
        bar += bars;
      }
    });
    return out;
  }
  /** Les temps visés, en groupes (une forme par groupe) : [[{ pass, beat }]]. */
  function bautoTargets(p, { scene, passage, deMesure, aMesure }) {
    const bpb = BA().beatsPerBar(p);
    const all = allPasses(p);
    const range = (from, n) => {
      const a = deMesure == null ? 1 : Math.round(Number(deMesure));
      const b = aMesure == null ? n : Math.round(Number(aMesure));
      if (!(a >= 1 && b >= a && b <= n)) fail(`mesures : de 1 à ${n}${scene != null ? ' (dans la scène)' : ' (dans la chanson)'}`);
      return [a - 1, b];
    };
    if (scene == null) {
      const total = all.reduce((s, x) => s + x.bars, 0);
      const [a, b] = range(0, total);
      const g = [];
      for (const ps of all) for (let bar = Math.max(a, ps.bar); bar < Math.min(b, ps.bar + ps.bars); bar++) for (let i = 0; i < bpb; i++) g.push({ pass: ps, beat: (bar - ps.bar) * bpb + i });
      return [g];
    }
    const sc = findScene(scene);
    let list = all.filter((x) => x.scene === sc);
    if (!list.length) fail(`« ${sc.name} » n’est pas dans la structure de la chanson`);
    if (passage != null && fold(passage) !== 'tous') {
      const n = Math.round(Number(passage));
      if (!(n >= 1 && n <= list.length)) fail(`passage : de 1 à ${list.length} (« ${sc.name} » est jouée ${list.length} fois), ou "tous"`);
      list = [list[n - 1]];
    }
    const [a, b] = range(0, list[0].bars);
    return list.map((ps) => Array.from({ length: (b - a) * bpb }, (_, i) => ({ pass: ps, beat: a * bpb + i })));
  }
  /** Courbes par temps d'une piste sur toute la chanson. */
  function automationsChanson({ piste: ref } = {}) {
    const p = P();
    const t = findTrack(ref);
    const params = BA().paramsFor(t);
    const passages = [];
    for (const ps of allPasses(p)) {
      const courbes = {};
      for (const x of params) {
        const l = BA().layer(p, ps, t.id, x.id);
        if (l && Object.keys(l).length) courbes[x.id] = Object.fromEntries(Object.entries(l).map(([b, v]) => [b, v]));
      }
      if (Object.keys(courbes).length) passages.push({ scene: ps.scene.name, passage: ps.n, mesure: ps.bar + 1, mesures: ps.bars, courbes });
    }
    return {
      piste: t.name,
      parametres: params.map((x) => ({ parametre: x.id, nom: x.label, min: x.min, max: x.max, neutre: x.def })),
      lecture: t.bautoStep ? 'paliers' : 'fluide',
      tempsParMesure: BA().beatsPerBar(p),
      passages,
      ...(passages.length ? {} : { conseil: 'aucune courbe : automationChanson({ piste, parametre: "cutoff", scene: "Refrain", forme: "montee" })' }),
    };
  }
  /** Pose une courbe par temps (cutoff, résonance, vélocité) sur une scène, un de ses passages ou des mesures de la chanson. */
  function automationChanson({ piste: ref, parametre, scene, passage, deMesure, aMesure, forme, de, a, valeur, points, effacer, lecture } = {}) {
    const p = P();
    const t = findTrack(ref);
    let what = [];
    if (lecture != null) {
      const st = fold(lecture);
      if (st !== 'fluide' && st !== 'paliers') fail('lecture : "fluide" ou "paliers"');
      if (st === 'paliers') t.bautoStep = true;
      else delete t.bautoStep;
      what.push(`lecture ${st}`);
    }
    if (parametre != null || forme != null || valeur != null || points != null || effacer) {
      if (parametre == null) fail('parametre manquant : cutoff, resonance ou velocite');
      const X = bautoParam(t, parametre);
      const groups = bautoTargets(p, { scene, passage, deMesure, aMesure });
      const inRange = (v, name) => {
        const n = Number(v);
        if (!(n >= X.min && n <= X.max)) fail(`${name} : entre ${X.min} et ${X.max} pour ${X.label.toLowerCase()} (neutre ${X.def})`);
        return n;
      };
      let valsOf;
      if (effacer) valsOf = (n) => Array(n).fill(null);
      else if (forme != null) {
        const id = BSHAPE_FR[fold(forme)];
        if (!id) fail(`forme inconnue : « ${forme} » (montee, descente, vague, neutre)`);
        if (de == null && a == null) valsOf = (n) => BA().shape(X.id, id, n);
        else {
          if (id === 'flat') fail('neutre ne prend pas de valeurs de/a');
          const lo = inRange(de ?? X.def, 'de');
          const hi = inRange(a ?? X.def, 'a');
          const tt = (i, n) => (n > 1 ? i / (n - 1) : 1);
          valsOf = (n) => Array.from({ length: n }, (_, i) => (id === 'swell' ? lo + (hi - lo) * Math.sin(Math.PI * tt(i, n)) : lo + (hi - lo) * tt(i, n)));
        }
      } else if (valeur != null) {
        const v = inRange(valeur, 'valeur');
        valsOf = (n) => Array(n).fill(v);
      } else if (Array.isArray(points) && points.length) {
        const pts = points.map((pt) => ({ t: Math.round(Number(pt && pt.temps)), v: inRange(pt && pt.valeur, `point ${JSON.stringify(pt)}`) })).sort((x, y) => x.t - y.t);
        if (pts.some((x) => !(x.t >= 0))) fail('points : [{ temps, valeur }], temps à partir de 0 (début de la plage visée)');
        valsOf = (n) => Array.from({ length: n }, (_, i) => {
          if (i <= pts[0].t) return pts[0].v;
          const j = pts.findIndex((x) => x.t >= i);
          if (j < 0) return pts[pts.length - 1].v;
          const A = pts[j - 1], B = pts[j];
          return A.v + ((B.v - A.v) * (i - A.t)) / (B.t - A.t || 1);
        });
      } else fail('donne une forme (montee, descente, vague, neutre), une valeur, des points [{ temps, valeur }] ou effacer: true');
      let beats = 0;
      for (const g of groups) {
        const vs = valsOf(g.length);
        g.forEach((x, i) => BA().set(p, x.pass, t.id, X.id, x.beat, vs[i]));
        beats += g.length;
      }
      if (!beats) fail('aucun temps visé');
      const where = scene != null ? `${findScene(scene).name}${passage != null && fold(passage) !== 'tous' ? ` (passage ${passage})` : groups.length > 1 ? ` (${groups.length} passages)` : ''}` : 'chanson';
      const span = deMesure != null || aMesure != null ? `, mesures ${deMesure ?? 1}–${aMesure ?? '…'}` : '';
      what.push(`${X.label.toLowerCase()} ${effacer ? 'effacé' : forme != null ? fold(forme) : valeur != null ? `à ${valeur}` : `${points.length} points`} — ${where}${span}`);
    }
    if (!what.length) fail('rien à changer : donne parametre + forme / valeur / points / effacer, ou lecture');
    SS.ui.renderTrack(t);
    changedNow(`${t.name} : ${what.join(' ; ')}`);
    return { message: `${t.name} : ${what.join(' ; ')} (retouchable sous les notes de la piste, bouton ∿)` };
  }

  /* ---------------- Scènes et structure ---------------- */
  function allerScene({ scene } = {}) {
    const sc = goScene(scene);
    return { message: `Scène en cours : ${sc.name}` };
  }
  function ajouterScene({ nom, copier, mesures: bars, dansStructure = true } = {}) {
    const p = P();
    if (copier) goScene(copier);
    const id = SS.addScene(p, { copy: !!copier });
    const sc = p.scenes.find((s) => s.id === id);
    if (nom) sc.name = String(nom).slice(0, 40);
    if (dansStructure) p.song.push({ scene: id, repeat: 1 });
    app.switchScene(id);
    if (bars) {
      const b = clamp(Math.round(bars), 1, 64);
      if (b !== p.bars) {
        p.bars = b;
        SS.resizeProject(p);
        if (!copier) p.tracks.forEach((t) => (t.type === 'drum' ? t.steps.fill(0) : (t.events = [])));
        app.afterSceneChange();
      }
    }
    refresh();
    changedNow(`scène « ${sc.name} » ajoutée${copier ? ` (copie de ${copier})` : ''}`);
    return { message: `Scène « ${sc.name} » (${p.bars} mesures)${dansStructure ? ', ajoutée à la fin de la structure' : ''}`, id };
  }
  function renommerScene({ scene, nom } = {}) {
    const sc = findScene(scene);
    if (!nom) fail('nom manquant');
    const old = sc.name;
    sc.name = String(nom).slice(0, 40);
    refresh();
    changedNow(`scène « ${old} » renommée « ${sc.name} »`);
    return { message: `Scène renommée : ${sc.name}` };
  }
  function supprimerScene({ scene } = {}) {
    const p = P();
    const sc = findScene(scene);
    if (!SS.deleteScene(p, sc.id)) fail('impossible : il faut garder au moins une scène');
    app.afterSceneChange();
    changedNow(`scène « ${sc.name} » supprimée`);
    return { message: `Scène « ${sc.name} » supprimée (Ctrl+Z la ramène)` };
  }
  function structure({ blocs } = {}) {
    const p = P();
    if (!Array.isArray(blocs) || !blocs.length) fail('blocs : la suite des scènes, ex. ["Intro", { scene: "Couplet", fois: 2 }, "Refrain"]');
    p.song = blocs.map((b) => {
      const o = typeof b === 'object' ? b : { scene: b };
      return { scene: findScene(o.scene).id, repeat: clamp(Math.round(o.fois || 1), 1, 64) };
    });
    refresh();
    const txt = p.song.map((b) => (p.scenes.find((s) => s.id === b.scene).name + (b.repeat > 1 ? ` ×${b.repeat}` : ''))).join(' → ');
    changedNow(`structure : ${txt}`);
    return { message: `Structure : ${txt}` };
  }

  /* ---------------- Écoute et historique ---------------- */
  function jouer({ scene, chanson } = {}) {
    const p = P();
    if (scene) goScene(scene);
    if (chanson != null) {
      p.playMode = chanson ? 'song' : 'loop';
      if (SS.song) SS.song.render();
    }
    app.stop();
    app.play();
    return { message: `Lecture : ${p.playMode === 'song' ? 'la chanson' : 'la scène ' + SS.currentScene(p).name + ' en boucle'}`, attention: 'si rien ne s’entend, l’utilisateur doit d’abord cliquer une fois dans la page (règle des navigateurs pour le son)' };
  }
  function stop() {
    app.stop();
    return { message: 'Lecture arrêtée' };
  }
  function annuler() {
    app.undo();
    return { message: 'Dernière action annulée' };
  }
  function retablir() {
    app.redo();
    return { message: 'Action rétablie' };
  }

  /* ---------------- Import MIDI (même chemin que menu ▸ Importer MIDI…, js/midipanel.js) ---------------- */
  const SPLIT_FR = { fidele: 0.95, equilibre: 0.85, compact: 0.7 };
  function midiOpts({ decoupage = 'equilibre', batterie = 'gm', quantize } = {}) {
    const similar = SPLIT_FR[fold(decoupage)];
    if (!similar) fail(`découpage inconnu : « ${decoupage} » (fidele, equilibre, compact)`);
    const m = fold(batterie);
    const machine = m === 'gm' || m === 'general midi' ? SS.midi.GM_KIT : Object.keys(SS.midi.MACHINES).find((k) => fold(k) === m || fold(SS.midi.MACHINES[k].label) === m);
    if (!machine) fail(`batterie inconnue : « ${batterie} » (gm, ${Object.keys(SS.midi.MACHINES).join(', ')})`);
    return { similar, machine, quantize: quantize == null ? SS.quantizeOn() : !!quantize };
  }
  /** Les octets du fichier : Uint8Array, liste de nombres, base64 (« data:audio/midi;base64,… » accepté) ou une URL. */
  async function midiBytes({ octets, base64, url }) {
    if (octets) return octets instanceof Uint8Array ? octets : octets instanceof ArrayBuffer ? new Uint8Array(octets) : Uint8Array.from(octets);
    if (base64) {
      const bin = atob(String(base64).replace(/^data:[^,]*,/, '').replace(/\s+/g, ''));
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }
    if (url) {
      let r;
      try {
        r = await fetch(url);
      } catch (e) {
        fail(`fichier inaccessible depuis la page (${e.message}) : le site refuse peut-être (CORS). Télécharge-le et passe ses octets en base64`);
      }
      if (!r.ok) fail(`fichier introuvable : ${r.status} ${url}`);
      return new Uint8Array(await r.arrayBuffer());
    }
    return fail('donne le fichier : url, base64 ou octets. Un fichier sur l’ordinateur de l’utilisateur : il le choisit lui-même (menu ▸ Importer MIDI…)');
  }
  const nameOfUrl = (u) => decodeURIComponent(String(u).split(/[?#]/)[0].split('/').pop() || '');
  function midiReport(r) {
    return {
      mesures: r.bars,
      tempo: Math.round(r.tempo * 100) / 100,
      signature: `${r.timeSig[0]}/${r.timeSig[1]}`,
      tonaliteEstimee: r.key ? H().label(r.key) : null,
      pistes: r.tracks.map((t) => ({ nom: t.name, son: t.sound, notes: t.notes, batterie: t.kind === 'drum' })),
      scenes: r.scenes.length,
      structure: r.song.map((b) => b.name + (b.repeat > 1 ? ` ×${b.repeat}` : '')).join(' → '),
      fidelite: `${Math.floor(r.fidelity.kept * 1000) / 10} % des notes rejouées à leur place`,
      ...(r.warnings.length ? { pertes: r.warnings } : {}),
    };
  }
  async function importerMidi({ url, base64, octets, nom, decoupage, batterie, quantize, apercu, fenetre } = {}) {
    const o = midiOpts({ decoupage, batterie, quantize });
    const buf = await midiBytes({ octets, base64, url });
    const name = nom || (url ? nameOfUrl(url) : 'Import MIDI');
    if (fenetre) {
      SS.midiPanel.openWith(name, buf, o);
      return { message: 'Fenêtre « Importer MIDI » ouverte : l’utilisateur relit le bilan et clique Importer', attente: true };
    }
    let res;
    try {
      res = SS.midiPanel.analyze(buf, { name, ...o });
    } catch (e) {
      fail(`import impossible : ${e.message}`);
    }
    const bilan = midiReport(res.report);
    if (apercu) return { message: `Aperçu (rien n’est importé) : ${bilan.mesures} mesures, ${bilan.pistes.length} pistes, ${bilan.scenes} scènes`, bilan };
    const avant = P().title;
    await SS.midiPanel.loadImported(res.project, name, o.machine, 'Claude');
    actions++;
    badge();
    return { message: `« ${res.project.title} » importé : nouvelle chanson de ${bilan.pistes.length} pistes, ${bilan.scenes} scènes. « ${avant} » reste dans « Mes chansons ».`, bilan };
  }

  /* ---------------- Lire une partition (fenêtre js/scorepanel.js) ----------------
   * L'utilisateur dépose l'image ou le PDF ; Claude regarde chaque page (partitionPage) et écrit les notes (lirePartition). */
  const FORMAT_PARTITION = 'portees: [{ nom, instrument, mesures: ["C5:1 D5:0.5 E5:0.5 r:2", "C4+E4+G4:4", …] }] : une chaîne par mesure ; note:durée en noires (1 noire, 0.5 croche, 1.5 noire pointée, 1/3 croche de triolet), r = silence, + = notes ensemble, ~ après la durée = liée à la suivante, !mf = nuance ; accords: ["Dm7", "G7 C", …] une chaîne par mesure';
  function partition() {
    return { message: 'Fenêtre « Lire une partition »', ...SS.scorePanel.claude.etat(), format: FORMAT_PARTITION };
  }
  function partitionPage({ page } = {}) {
    const r = SS.scorePanel.claude.page(page);
    return { message: `Page ${r.page} sur ${r.pages} affichée en grand dans la fenêtre : regarde-la (capture d’écran, zoom si besoin)`, ...r };
  }
  function lirePartition({ titre, tempo, mesure, tonalite, portees, accords, anacrouse, musicxml } = {}) {
    let score;
    try {
      score = musicxml ? SS.scoreRead.fromMusicXML(musicxml) : SS.scoreRead.fromNotes({ titre, tempo, mesure, tonalite, portees, accords, anacrouse });
    } catch (e) {
      fail(`${e.message} — format : ${FORMAT_PARTITION}`);
    }
    if (titre) score.title = titre;
    const r = SS.scorePanel.claude.lire(score, 'Claude');
    const bad = score.bars.filter((b) => b.suspect).map((b) => `${b.n} (${b.parts && b.parts.length ? b.parts.join(', ') : 'durée'})`);
    return {
      message: `Partition lue : ${r.mesures} mesures, ${r.notes} notes, ${score.parts.length} portée(s). L’utilisateur vérifie, puis Enregistrer le .mid ou Importer dans StepSeq.`,
      ...r,
      ...(bad.length ? { aVerifier: bad, conseil: `ces mesures n’ont pas ${score.timeSig[0]}/${score.timeSig[1]} : relis-les et rappelle lirePartition corrigé` } : {}),
      ...(score.errors && score.errors.length ? { erreurs: score.errors } : {}),
    };
  }
  function partitionSortie({ importer } = {}) {
    if (!SS.scorePanel.claude.etat().resultat) fail('aucune partition lue : appelle d’abord lirePartition');
    if (importer) {
      SS.scorePanel.claude.importer();
      return { message: 'Fenêtre « Importer MIDI » ouverte : l’utilisateur relit et clique Importer', attente: true };
    }
    return { message: `« ${SS.scorePanel.claude.enregistrer()} » téléchargé` };
  }

  /* ---------------- Assistant « Nouvelle chanson » (pont SS.band.claude, js/band.js) ----------------
   * L'assistant s'affiche et avance comme sous les clics. Ses réglages sont un brouillon (enregistré tout seul, pas de
   * Ctrl+Z) ; seule assistantCreer() écrit dans la grille, en une étape Ctrl+Z. */
  const W = () => SS.band.claude;
  const TYPE_FR = { batterie: 'drums', drums: 'drums', percu: 'drums', basse: 'bass', bass: 'bass', nappe: 'chords', accords: 'chords', chords: 'chords', pad: 'chords', clavier: 'keys', claviers: 'keys', piano: 'keys', pianiste: 'keys', keys: 'keys', arpege: 'arp', arp: 'arp', guitariste: 'guitar', guitare: 'guitar', guitar: 'guitar', melodie: 'melody', melody: 'melody', lead: 'melody', orchestre: 'orch', orch: 'orch', cuivres: 'horns', horns: 'horns', section: 'horns', ambient: 'ambient', generatif: 'ambient' };
  function typeOf(t) {
    const id = TYPE_FR[fold(t)];
    if (!id) fail(`type de musicien inconnu : « ${t} » (batterie, basse, clavier, nappe, arpege, guitariste, melodie, orchestre, cuivres, ambient)`);
    return id;
  }
  const STEP_FR = { style: 'style', instruments: 'inst', inst: 'inst', tempo: 'tempo', tonalite: 'tempo', scenes: 'scenes', accords: 'chords', chords: 'chords', arrangement: 'arr', arr: 'arr', effets: 'fx', transitions: 'fx', fx: 'fx', mix: 'mix', integration: 'pick', pick: 'pick', creer: 'pick' };
  /** Un son pour un type : id ou nom d'un conseillé (assistantSons), sinon un son du catalogue (id, « j:A48 », bout de nom). */
  function soundTok(type, son) {
    const list = W().sons(type);
    const q = fold(son);
    const hit = list.find((x) => fold(x.son) === q) || list.find((x) => fold(x.nom) === q) || list.find((x) => fold(x.nom).includes(q) || fold(x.son).includes(q));
    if (hit) return hit.son;
    if (type === 'drums' || type === 'orch' || type === 'horns' || type === 'ambient') fail(`« ${son} » : choisis parmi ${list.map((x) => `${x.son} (${x.nom})`).join(', ')}`);
    if (/^j:/i.test(son)) return 'j:' + soundOpts(son).patch;
    return soundOpts(son).instrument;
  }
  const keyOfArg = (k) => (k && typeof k === 'object' ? { tonic: tonicOf(k.tonique), mode: modeOf(k.mode || 'majeur') } : null);
  function draft(label) {
    actions++;
    badge();
    SS.ui.toast(`✳ Claude : ${label}`, 4000);
  }
  const muText = (m) => `${m.nom} (${m.son})`;
  const findMu = (id) => (W().etat().musiciens || []).find((m) => m.id === id);

  function assistantStyles() {
    return { styles: W().styles(), conseil: 'assistantStyle({ style: "synthwave", inspiration: "<id d’une inspiration>" })' };
  }
  function assistantEtat() {
    return W().etat();
  }
  function assistantSons({ type } = {}) {
    return { sons: W().sons(typeOf(type)) };
  }
  function assistantOuvrir() {
    const r = W().ouvrir();
    const box = document.getElementById('bandConfirm');
    const wait = box && !box.hidden ? { attente: 'une fenêtre de l’assistant attend le choix de l’utilisateur (reprendre les instruments de la grille, verrouiller des pistes) : demande-lui de choisir' } : {};
    return { message: `Assistant ${r}`, ...wait, etat: W().etat() };
  }
  function assistantEtape({ etape } = {}) {
    const k = STEP_FR[fold(etape)];
    if (!k) fail(`étape inconnue : « ${etape} » (${Object.keys(STEP_FR).filter((x) => !/^(inst|chords|arr|fx|pick|creer|transitions|tonalite)$/.test(x)).join(', ')})`);
    return { message: `Étape ${W().etape(k)}` };
  }
  function assistantEcouter() {
    W().ecouter();
    return { message: 'Écoute lancée (le son ne part qu’après un clic de l’utilisateur dans la page)' };
  }
  function assistantStop() {
    W().stop();
    return { message: 'Écoute arrêtée' };
  }
  /** Panneau Mix auto de l'assistant (js/wizautomix.js) : ouvrir, mode, familles, accepter, annuler, A/B ; renvoie l'état. */
  function assistantMixAuto({ ouvrir, mode, toucher, parScene, accepter, refuser, annuler, annulerSession } = {}) {
    const M = SS.wizAutoMix;
    if (!M || !SS.band.mixAuto) return { erreur: 'Mix auto indisponible' };
    if (ouvrir === true) M.open();
    if (ouvrir === false) M.close();
    if (!M.isOpen()) return { ouvert: false, conseil: 'assistantMixAuto({ ouvrir: true }) à partir de l’étape 3, puis assistantEcouter()' };
    const st = () => M._state();
    if (mode != null) M.setMode(mode === 'auto');
    if (toucher && typeof toucher === 'object') M.setScopes(toucher);
    if (parScene != null) M.setPerScene(!!parScene);
    const find = (id) => M.pending().find((x) => x._key === id || x.id === id || x.title === id);
    if (accepter) {
      const s = find(accepter);
      if (!s) return { erreur: `Conseil introuvable : ${accepter}` };
      M.accept(s);
    }
    if (refuser) M.refuse(refuser);
    if (annuler) M.undoAt(0);
    if (annulerSession) M.undoSession();
    const s = st();
    return {
      ouvert: true,
      mode: s.prefs.auto ? 'auto' : 'main',
      toucher: s.prefs.scopes,
      parScene: !!s.prefs.perScene,
      scene: s.scene,
      ecoute: Math.round(SS.automixListen.secs()),
      note: s.diag && s.diag.ready ? s.diag.total : null,
      conseils: M.pending().map((x) => ({ id: x._key, titre: x.title, onglet: x.tab === 'master' ? 'Master' : 'Instruments', famille: x.scope, ...(s.prefs.perScene ? { scene: x._scene || 'toute la chanson' } : {}) })),
      faits: s.log.map((x) => ({ titre: x.title, par: x.by === 'auto' ? 'pilote' : 'main', ...(x.scene ? { scene: x.scene } : {}) })),
    };
  }
  function assistantFermer() {
    W().fermer();
    return { message: 'Retour à la grille, le brouillon de l’assistant est gardé' };
  }
  /** « D'après une émotion » : la chanson déduite d'un style et d'émotions pondérées (js/emotionsong.js), appliquée si demandé. */
  function assistantEmotion({ style, emotions, parScene, trajectoire, relatives, dernierRefrain = true, appliquer = false, passages, histoire, duree, tempo, orchestre } = {}) {
    if (fold(style) === 'film' || fold(style).startsWith('musique de film')) return assistantEmotionFilm({ emotions, passages, histoire, duree, tempo, orchestre, appliquer });
    if (parScene || trajectoire) return assistantEmotionArc({ style, parScene, trajectoire, relatives, dernierRefrain, appliquer });
    const list = (Array.isArray(emotions) ? emotions : String(emotions || '').split(/[\s,;]+/).filter(Boolean)).map((x) => {
      const [name, w] = typeof x === 'object' ? [x.emotion || x.id, x.poids ?? x.w ?? 1] : String(x).split(':');
      const e = SS.EMOTIONS.find((m) => fold(m.id) === fold(name) || fold(m.label) === fold(name) || fold(m.label).startsWith(fold(name)));
      if (!e) fail(`émotion inconnue : « ${name} » (${SS.EMOTIONS.map((m) => m.id).join(', ')})`);
      return { id: e.id, w: Number(w) || 1 };
    });
    const st = SS.emotionSong.styles({ film: false }).find((x) => fold(x.id) === fold(style) || fold(x.label) === fold(style));
    if (!st) fail(`style inconnu : « ${style} » (${SS.emotionSong.styles({ film: false }).map((x) => x.id).join(', ')})`);
    if (!list.length) fail('emotions : au moins une, ex. "nostalgie:60 espoir:40"');
    const d = appliquer ? SS.emotionSongPanel.claude.appliquer({ style: st.id, emotions: list }) : SS.emotionSong.deduce({ style: st.id, emotions: list });
    if (appliquer) draft(`chanson d’après ${d.mix.map((e) => SS.findEmotion(e.id).label).join(' + ')}`);
    const E = SS.emotionSong;
    return {
      message: appliquer ? 'Assistant réglé d’après les émotions (étape Scènes)' : 'Chanson déduite (rien n’est encore changé : appliquer: true pour régler l’assistant)',
      melange: d.mix.map((e) => `${SS.findEmotion(e.id).label} ${Math.round(e.w * 100)} %`),
      tempo: d.tempo.bpm, tonalite: keyText(d.key), orientation: `${d.orientation.label} (comme ${d.orientation.ref})`,
      inspiration: d.model && d.model.preset, groupe: d.roles.map((r) => SS.Band.ROLES[r.role].short + (r.added ? ' (ajouté)' : '')),
      scenes: d.sections.map((s) => { const g = s.grids[s.pick]; return { scene: s.name, emotion: SS.findEmotion(s.emotion).label, accords: g ? E.chordsIn(d.key, g.chords).map((c) => c.name).join(' ') : null, source: g ? E.fromText(g, s.type) : null }; }),
      forme: d.form.map((t) => E.SCENES[t][0]).join(' → '),
      modeles: d.refs.slice(0, 5).map((r) => `${r.title} (${r.artist}, ${r.bpm} BPM, ${Math.round(r.score * 100)} %)`),
    };
  }
  /** « D'après une émotion » › Musique de film : une émotion par passage de l'image (ou un mélange pour toute la scène). */
  function assistantEmotionFilm({ emotions, passages, histoire, duree, tempo, orchestre, appliquer }) {
    const FE = SS.filmEmotion;
    const emoOf = (name) => (SS.FILM_EMOTIONS.find((m) => fold(m.k) === fold(name) || fold(m.label) === fold(name)) || fail(`émotion de film inconnue : « ${name} » (${SS.FILM_EMOTIONS.map((m) => m.k).join(', ')})`)).k;
    let ps = null;
    if (histoire) {
      const s = FE.STORIES.find((x) => fold(x.id) === fold(histoire) || fold(x.name) === fold(histoire)) || fail(`histoire inconnue : « ${histoire} » (${FE.STORIES.map((x) => x.id).join(', ')})`);
      ps = JSON.parse(JSON.stringify(s.p));
    }
    if (passages) {
      if (!Array.isArray(passages) || !passages.length) fail('passages : [{ emotion, secondes, nom?, synchro?, dialogue? }]');
      ps = passages.map((p) => ({ emo: emoOf(p.emotion), s: Number(p.secondes) || 8, name: p.nom || '', sync: !!p.synchro, dlg: !!p.dialogue }));
    }
    if (!ps) {
      const list = (Array.isArray(emotions) ? emotions : String(emotions || '').split(/[\s,;]+/).filter(Boolean)).map((x) => {
        const [name, w] = typeof x === 'object' ? [x.emotion || x.id, x.poids ?? x.w ?? 1] : String(x).split(':');
        return { emo: emoOf(name), w: Number(w) || 1 };
      });
      if (!list.length) fail('musique de film : passages, histoire, ou emotions ("tristesse:60 espoir:40") avec duree');
      ps = FE.fromMix(list.slice(0, 3), Number(duree) || 50);
    }
    const t = tempo == null ? null : fold(tempo).startsWith('pass') ? 'passage' : 'cale';
    const ens = orchestre ? (FE.ENS.find((x) => fold(x) === fold(orchestre)) || fail(`orchestre : ${FE.ENS.join(', ')}`)) : null;
    const pre = FE.deduce({ passages: ps, tempo: 'cale', ens });
    if (!pre) fail('aucun passage');
    const d = (t || pre.adviseTempo) === 'cale' ? pre : FE.deduce({ passages: ps, tempo: 'passage', ens });
    if (appliquer) {
      SS.filmEmotionPanel.apply(d);
      draft(`musique de film d’après ${d.passages.map((p) => SS.FILM_EMOTIONS.find((m) => m.k === p.emo).label).join(' → ')}`);
    }
    return {
      message: appliquer ? 'Assistant Musique de film réglé (« Ma scène » : repères, tonalité, thème, effectif)' : 'Scène de film déduite (rien n’est encore changé : appliquer: true pour régler l’assistant)',
      tempo: d.tempoMode === 'passage' ? d.tm.sections.map((s) => s.bpm) : d.tm.bpm, tempoConseille: d.adviseTempo === 'passage' ? 'par passage' : 'un tempo calé',
      tonalite: keyText(d.key), orchestre: d.ens, theme: `motif ${SS.FILM_EMOTIONS.find((m) => m.k === d.heart.emo).label}`,
      proches: d.refs.map((r) => r.title), mesures: d.tm.bars, duree: SS.film.fmt(d.tm.seconds),
      passages: d.tm.sections.map((s) => {
        const sp = d.spec.sections[s.id];
        return {
          nom: s.name, emotion: SS.FILM_EMOTIONS.find((m) => m.k === s.emo).label, image: SS.film.fmt(s.cue.land), mesure: s.startBar + 1, mesures: s.bars, bpm: s.bpm,
          synchro: s.sync, dialogue: sp.film.dlg, energie: s.ene, tension: s.ten, harmonie: sp.film.harm, accords: SS.filmEmotionPanel.chordNames(sp, d.film.key).join(' '), nuance: sp.dyn,
          theme: SS.film.TREATMENTS[SS.film.treatOf(d.film, s)].label, articulations: sp.film.art,
        };
      }),
    };
  }
  /** « D'après une émotion » › Par scène : une émotion par moment (couplet, montée, refrain, pont, fin) ou une trajectoire toute faite. */
  function assistantEmotionArc({ style, parScene, trajectoire, relatives, dernierRefrain, appliquer }) {
    const E = SS.emotionSong;
    const st = E.styles({ film: false }).find((x) => fold(x.id) === fold(style) || fold(x.label) === fold(style));
    if (!st) fail(`style inconnu : « ${style} » (${E.styles({ film: false }).map((x) => x.id).join(', ')})`);
    const emoOf = (name) => (SS.EMOTIONS.find((m) => fold(m.id) === fold(name) || fold(m.label) === fold(name) || fold(m.label).startsWith(fold(name))) || fail(`émotion inconnue : « ${name} » (${SS.EMOTIONS.map((m) => m.id).join(', ')})`)).id;
    const momentOf = (k) => E.MOMENTS.find((m) => fold(m.id) === fold(k) || fold(m.name) === fold(k)) || fail(`moment inconnu : « ${k} » (${E.MOMENTS.map((m) => m.name.toLowerCase()).join(', ')})`);
    let moments = {};
    if (trajectoire) {
      const a = E.ARCS.find((x) => fold(x.id) === fold(trajectoire) || fold(x.name) === fold(trajectoire)) || fail(`trajectoire inconnue : « ${trajectoire} » (${E.ARCS.map((x) => x.id).join(', ')})`);
      moments = { ...a.e };
    }
    Object.entries(parScene || {}).forEach(([k, v]) => (moments[momentOf(k).id] = emoOf(v)));
    if (!moments.debut) fail('parScene : au moins l’émotion du couplet, ex. { couplet: "melancolie", refrain: "euphorie" }');
    const links = {};
    Object.entries(relatives || {}).forEach(([k, v]) => (links[momentOf(k).id] = fold(v).startsWith('homo') || fold(v) === 'parallel' ? 'parallel' : 'relative'));
    const o = { style: st.id, moments, links, lift: dernierRefrain !== false };
    const d = appliquer ? SS.emotionSongPanel.claude.appliquer(o) : E.deduceArc(o);
    if (!d) fail('pas de chanson pour ce style');
    if (appliquer) draft(`chanson d’après ${E.MOMENTS.map((m) => SS.findEmotion(d.moments[m.id]).label).join(' → ')}`);
    return {
      message: appliquer ? 'Assistant réglé scène par scène (étape Scènes)' : 'Chanson déduite scène par scène (rien n’est encore changé : appliquer: true pour régler l’assistant)',
      trajectoire: E.MOMENTS.map((m) => `${m.name} : ${SS.findEmotion(d.moments[m.id]).label}`),
      tempo: d.tempo.bpm, depart: keyText(d.home), inspiration: d.model && d.model.preset,
      scenes: d.sections.map((s) => {
        const g = s.grids[s.pick];
        return {
          scene: s.name, emotion: SS.findEmotion(s.emotion).label, tonalite: keyText(s.key) + (s.rel !== 'same' && !s.lift ? ` (${s.rel === 'parallel' ? 'homonyme' : 'relative'})` : ''),
          accords: g ? E.chordsIn(s.key, g.chords).map((c) => c.name).join(' ') : null, charniere: s.pivot ? s.pivot.name : null,
          energie: s.energy, batterie: s.feel,
        };
      }),
      forme: d.blocks.map((b) => d.sections.find((s) => s.sid === b.sid).name).join(' → '),
    };
  }
  function assistantStyle({ style, inspiration } = {}) {
    const st = W().styles().find((s) => fold(s.style) === fold(style) || fold(s.nom) === fold(style));
    if (!st) fail(`style inconnu : « ${style} » (${W().styles().map((s) => s.style).join(', ')})`);
    let pid = null;
    if (inspiration) {
      const q = fold(inspiration);
      const p = st.inspirations.find((x) => fold(x.id) === q || fold(x.chanson) === q) || st.inspirations.find((x) => fold(x.chanson).includes(q) || fold(x.artiste).includes(q));
      if (!p) fail(`inspiration inconnue pour ${st.nom} : « ${inspiration} » (${st.inspirations.map((x) => `${x.id} : ${x.chanson}, ${x.artiste}`).join(' ; ')})`);
      pid = p.id;
    }
    W().style(st.style, pid);
    const e = W().etat();
    draft(`style ${st.nom}${e.inspiration ? `, dans l’esprit de « ${e.inspiration.chanson} »` : ''}`);
    return { message: `Style ${st.nom} · ${e.inspiration ? e.inspiration.chanson + ', ' + e.inspiration.artiste : ''} · ${e.tempo} BPM`, musiciens: e.musiciens };
  }
  function assistantMusicien({ ajouter, musicien, son, type, nom, retirer } = {}) {
    if (ajouter) {
      const t = typeOf(ajouter);
      const mu = W().ajouter(t, son ? soundTok(t, son) : null, nom);
      const m = findMu(mu.id);
      draft(`musicien ajouté : ${muText(m)}`);
      return { message: `Musicien ajouté : ${muText(m)}`, musicien: m };
    }
    if (!musicien) fail('donne « ajouter » (un type) ou « musicien » (id ou nom, voir assistantEtat())');
    const before = (W().etat().musiciens || []).find((m) => m.id === musicien || fold(m.nom) === fold(musicien) || fold(m.nom).startsWith(fold(musicien)));
    const t = type ? typeOf(type) : null;
    const tok = son ? soundTok(t || (before && before.type !== 'effets' ? before.type : 'melody'), son) : null;
    const mu = W().musicien(musicien, { son: tok, type: t, nom, retirer });
    if (!mu) {
      draft(`musicien retiré : ${before ? before.nom : musicien}`);
      return { message: `Musicien retiré : ${before ? before.nom : musicien}` };
    }
    const m = findMu(mu.id);
    draft(`musicien ${muText(m)}`);
    return { message: `Musicien : ${muText(m)}, type ${m.type}`, musicien: m };
  }
  function assistantFilm() {
    return W().film();
  }
  function assistantRepere(o = {}) {
    const r = W().repere(o);
    draft(o.ajouter != null ? 'repère ajouté' : o.supprimer ? 'repère retiré' : `repère ${o.index + 1} modifié`);
    return { message: 'Scène de film mise à jour', ...r };
  }
  function assistantTempo({ bpm } = {}) {
    if (!Number.isFinite(Number(bpm))) fail('bpm : un nombre (40 à 240)');
    const t = W().tempo(Number(bpm));
    draft(`tempo ${t} BPM`);
    return { message: `Tempo de la chanson : ${t} BPM` };
  }
  function assistantTonalite({ tonique, mode = 'majeur' } = {}) {
    const k = { tonic: tonicOf(tonique), mode: modeOf(mode) };
    W().tonalite(k);
    draft(`tonalité ${keyText(k)}`);
    return { message: `Tonalité de la chanson : ${keyText(k)}, toutes les scènes transposées`, scenes: W().etat().scenes.map((s) => ({ scene: s.nom, tonalite: keyText(s.tonalite) })) };
  }
  function assistantScene({ scene, mesures: bars, nom, dupliquer, supprimer } = {}) {
    const id = W().scene(scene, { mesures: bars, nom, dupliquer, supprimer });
    if (!id) {
      draft(`scène supprimée : ${scene}`);
      return { message: `Scène supprimée : ${scene}`, structure: W().etat().structure };
    }
    const s = W().etat().scenes.find((x) => x.id === id);
    draft(`scène ${s.nom}`);
    return { message: `${dupliquer ? 'Copie : ' : 'Scène '}${s.nom} (${s.id}), ${s.mesures} mesures`, scene: s };
  }
  function assistantStructure({ blocs } = {}) {
    if (!Array.isArray(blocs) || !blocs.length) fail('blocs : une liste, ex. ["intro", { scene: "chorus", fois: 2 }]');
    W().structure(blocs.map((b) => (typeof b === 'string' ? { scene: b, fois: 1 } : b)));
    const e = W().etat();
    const txt = e.structure.map((b) => e.scenes.find((s) => s.id === b.scene).nom + (b.fois > 1 ? ` ×${b.fois}` : '')).join(' → ');
    draft(`structure ${txt}`);
    return { message: `Structure : ${txt}` };
  }
  function assistantAccords({ scene, accords: list, tonalite: k } = {}) {
    const key = keyOfArg(k);
    if (key && !list) {
      const s = W().accords(scene, null, key);
      draft(`tonalité de la scène : ${keyText(s.key)}`);
      return { message: `Tonalité de la scène : ${keyText(s.key)} (les accords gardent leurs degrés)` };
    }
    if (!Array.isArray(list) || !list.length) fail('accords : une liste, une mesure par élément, ex. ["Am", "F", "C G", "E7"]');
    const sc = W().sceneOf(W().sceneId(scene));
    const kk = key || sc.key;
    const bars = list.map((x) => String(x).trim().split(/\s+/).map((sym) => gridChordOf(sym, kk)));
    const s = W().accords(sc.sec, bars, key);
    const e = W().etat().scenes.find((x) => x.id === s.sec);
    const txt = e.grille.map((c) => c.accord).join(' – ');
    draft(`accords de ${e.nom}`);
    return { message: `${e.nom} (${e.mesures} mesures, ${keyText(e.tonalite)}) : ${txt}`, ...(list.length > e.mesures ? { attention: `${list.length - e.mesures} mesure(s) en trop ignorée(s)` } : {}) };
  }
  function assistantChangement({ scene, geste, passage, accords, suivent } = {}) {
    const r = W().changement(scene, { geste, passage, accords, suivent });
    if (!geste) return { message: `Gestes possibles depuis ${r.depuis.tonalite}${r.depuis.scene ? ` (${r.depuis.scene})` : ''}`, ...r };
    draft(`changement de tonalité : ${r.scene} en ${r.vers}`);
    return { message: `${r.scene} : ${r.depuis} → ${r.vers} (passage ${r.passage}, ${r.accords})`, ...r };
  }
  function assistantMelodie() {
    W().melodie();
    draft('une autre mélodie');
    return { message: 'Nouvelle mélodie pour toute la chanson (propose à l’utilisateur d’écouter)' };
  }
  function assistantEffets() {
    return W().effets();
  }
  function assistantTransition({ transition, recette, effets: fx, reset } = {}) {
    const r = W().transition(transition, { recette, effets: fx, reset });
    draft(`transition ${r.de} → ${r.vers} : ${r.recette}`);
    return { message: `${r.de} → ${r.vers} : ${r.recette}`, ...r };
  }
  function assistantEffetsScene({ scene, ...o } = {}) {
    const r = W().effetsScene(scene, o);
    draft(r.nom ? `effets de ${r.nom}` : 'musicien ajouté');
    return { message: r.nom ? `Effets de « ${r.nom} » réglés` : 'Musicien ajouté au groupe', ...r };
  }
  function assistantMouvements({ garder, retirer } = {}) {
    if (garder == null && retirer == null) fail('donne garder et/ou retirer : ["open", "qa", "acid"] (voir assistantEffets().mouvements)');
    const r = W().mouvements({ garder: garder ?? [], retirer: retirer ?? [] });
    draft('mouvements de son');
    return { message: `Mouvements gardés : ${r.filter((x) => x.garde).map((x) => x.nom).join(', ') || 'aucun'}`, mouvements: r };
  }
  function assistantCreer() {
    const r = W().creer();
    if (r === 'confirmation') return { message: 'Une fenêtre de confirmation est ouverte (la grille a déjà des pistes) : c’est l’utilisateur qui choisit', attente: true };
    actions++;
    badge();
    return { message: `Chanson créée dans la grille (Ctrl+Z revient en arrière)`, etat: etat() };
  }

  /* ---------------- Chanson guidée par Claude : méthode, jeu par scène, mélodie écrite, versions, point d'écoute, bilan ---------------- */
  const METHODE = [
    'Méthode « chanson guidée » : tu crées une chanson AVEC l’utilisateur, dans l’assistant « Nouvelle chanson ». Une étape à la fois.',
    '',
    'Règles :',
    '- Après chaque étape : résume en deux lignes ce que tu as fait, appelle pointEcoute({ message }) puis ARRÊTE-TOI et attends son avis (« on garde », « plus sombre »…). Ne fais pas deux étapes d’affilée, sauf s’il dit « fais le reste ».',
    '- Propose souvent deux idées (A et B) : assistantVersions({ garder: "A" }), autre réglage, assistantVersions({ garder: "B" }) ; il écoute, puis assistantVersions({ essayer: "A" }) remet la A.',
    '- Tu n’entends pas le son. Dis ce que tu as voulu faire, vérifie ce qui se mesure (frottements de la mélodie, bilan() une fois la chanson créée), et fais-le écouter.',
    '- Une chanson connue peut servir de modèle (tempo, forme, instruments, groove, couleur des accords) ; la mélodie et les paroles restent originales, jamais une copie.',
    '- Parle en français simple, sans jargon technique ni noms d’outils.',
    '',
    'Étapes :',
    '1. Intention : trois questions courtes : ce que la chanson raconte ou fait ressentir ; un style ou un morceau en tête ; courte (2 min) ou complète (3–4 min). Puis assistantStyles() et etat().',
    '   Un modèle ? Demande s’il a une chanson en tête comme modèle. Si elle est dans assistantStyles() (inspirations, style « cliches »), prends-la comme inspiration. Sinon, choisis le style et l’inspiration les plus proches, puis règle à sa manière ce que tu connais du morceau : tempo, tonalité, forme (assistantScene, assistantStructure), instruments (assistantMusicien), groove de batterie et de basse (assistantJeu), couleur des accords. Dis-lui ce que tu reprends du modèle. La mélodie et les paroles restent originales : jamais celles du modèle, même s’il insiste (il peut importer son propre fichier MIDI avec importerMidi).',
    '2. Cadre : assistantOuvrir(), assistantStyle({ style, inspiration }), assistantTempo({ bpm }), assistantTonalite({ tonique, mode }). Explique ton choix d’après l’émotion (mineur sombre, tempo lent pour la mélancolie…). 🎧',
    '3. Plan : assistantEtat() puis assistantScene (longueur, noms) et assistantStructure. Décris la courbe d’énergie (où ça monte, où ça respire). 🎧',
    '4. Accords : pour le refrain puis le couplet, propose deux grilles (A/B) avec assistantAccords et assistantVersions, explique la couleur de chacune. 🎧',
    '5. Groupe : assistantMusicien (sons, assistantSons), puis qui joue où : assistantMotifs({ musicien }) et assistantJeu({ musicien, scene, motif | joue: false }). Une intro dépouillée, un refrain plein, un pont qui respire. 🎧',
    '6. Mélodie : assistantEcrireMelodie({ scene, notes }) pour une mélodie précise (corrige les frottements renvoyés), ou assistantMelodie() pour en tirer une au hasard. L’utilisateur peut te dicter la sienne en noms de notes. 🎧',
    '7. Arrangement : assistantEffets(), assistantTransition (montées, coupures avant les refrains), assistantMouvements. 🎧',
    '8. Créer et mixer : assistantCreer(), puis await bilan() : corrige ce qu’il signale (console, effets, master), redis ce que tu as changé. 🎧 Ensuite, retouches libres (automationChanson, effets…).',
  ];
  function methode() {
    return { methode: METHODE.join('\n') };
  }
  function assistantMotifs({ musicien, tous } = {}) {
    if (!musicien) fail('musicien manquant (voir assistantEtat().musiciens)');
    return W().motifs(musicien, !!tous);
  }
  function assistantJeu({ musicien, scene, scenes, motif, joue, presence, mouvement, hasard, mainGauche, clavier } = {}) {
    if (!musicien) fail('musicien manquant (voir assistantEtat().musiciens)');
    const r = W().jeu(musicien, scenes != null ? scenes : scene, { motif, joue: joue == null ? undefined : !!joue, presence, mouvement, hasard, mainGauche, clavier });
    const txt = r.scenes.map((x) => `${x.scene} : ${x.joue}`).join(', ');
    draft(`${r.musicien} · ${txt}`);
    return { message: `${r.musicien} — ${txt} (propose à l’utilisateur d’écouter)`, ...r };
  }
  function assistantEcrireMelodie({ musicien, scene, notes, effacer } = {}) {
    if (!effacer && !Array.isArray(notes)) fail('notes manquantes : [{ pas, note, dur, vel }] (ou effacer: true pour revenir à la mélodie de l’inspiration)');
    const list = effacer ? null : notes.map((n, i) => {
      if (!n || n.note == null) fail(`note ${i + 1} : « note » manquante`);
      const pas = Number(n.pas);
      if (!Number.isFinite(pas)) fail(`note ${i + 1} : « pas » manquant`);
      return { pas, midi: midiOf(n.note), dur: n.dur == null ? 2 : Number(n.dur), vel: clamp(n.vel == null ? 0.8 : Number(n.vel), 0.05, 1) };
    });
    const r = W().ecrireMelodie(musicien, scene, list);
    draft(effacer ? `mélodie de « ${r.scene} » : celle de l’inspiration` : `mélodie de « ${r.scene} » (${r.notes} notes)`);
    return { message: effacer ? r.message : `${r.notes} notes écrites pour ${r.musicien} dans « ${r.scene} »${r.frottements.length ? ` ; ${r.frottements.length} frottement(s) à vérifier` : ', aucune note ne frotte'}`, ...r };
  }
  function assistantVersions({ garder, essayer, oublier } = {}) {
    const list = W().versions({ garder, essayer, oublier });
    if (garder != null) draft(`version « ${garder} » gardée`);
    if (essayer != null) draft(`version « ${essayer} » remise`);
    return { message: essayer != null ? `Version « ${essayer} » remise dans l’assistant` : garder != null ? `Version « ${garder} » gardée` : 'Versions gardées', versions: list };
  }
  /** Pastille d'écoute : « ✳ Claude : … ▶ Écouter » en bas à droite, jusqu'au clic (le son exige un clic de l'utilisateur). */
  function earEl() {
    let e = document.getElementById('claudeEar');
    if (e) return e;
    e = document.createElement('div');
    e.id = 'claudeEar';
    e.className = 'claude-ear';
    e.setAttribute('role', 'status');
    if ('popover' in HTMLElement.prototype) e.popover = 'manual'; // au-dessus des fenêtres ouvertes (assistant…)
    document.body.append(e);
    return e;
  }
  function hideEar() {
    const e = document.getElementById('claudeEar');
    if (!e) return;
    e.classList.remove('show');
    try {
      if (e.matches(':popover-open')) e.hidePopover();
    } catch (x) {
      /* sans popover */
    }
  }
  function pointEcoute({ message, quoi } = {}) {
    const what = quoi ? fold(quoi) : SS.band && SS.band.active() ? 'assistant' : 'chanson';
    if (!['assistant', 'chanson', 'scene'].includes(what)) fail('quoi : "chanson", "scene" ou "assistant"');
    const e = earEl();
    const msg = String(message || 'à écouter').slice(0, 120);
    const play = () => {
      hideEar();
      if (SS.band && SS.band.active()) return W().ecouter();
      jouer({ chanson: what !== 'scene' });
    };
    const b1 = document.createElement('button');
    b1.type = 'button';
    b1.className = 'claude-ear-play';
    b1.textContent = '▶ Écouter';
    b1.onclick = play;
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.className = 'claude-ear-close';
    b2.setAttribute('aria-label', 'Fermer');
    b2.textContent = '×';
    b2.onclick = hideEar;
    const t = document.createElement('span');
    t.textContent = `✳ Claude : ${msg}`;
    e.replaceChildren(t, b1, b2);
    try {
      if (e.popover && e.matches(':popover-open')) e.hidePopover();
      if (e.popover) e.showPopover();
    } catch (x) {
      /* sans popover */
    }
    e.classList.add('show');
    return { message: `Pastille « ▶ Écouter » affichée : l’utilisateur clique pour entendre ${what === 'scene' ? 'la scène' : what === 'assistant' ? 'l’assistant' : 'la chanson'}` };
  }
  let bilanRun = null;
  async function bilan({ scene, pistes = true } = {}) {
    if (SS.band && SS.band.active()) fail('l’assistant est ouvert : crée la chanson (assistantCreer) ou reviens à la grille (assistantFermer) avant le bilan');
    if (bilanRun) fail('un bilan est déjà en cours');
    const p = P();
    if (!p.tracks.length) fail('la grille est vide : rien à mesurer');
    if (scene) goScene(scene);
    const range = scene ? 'scene' : 'song';
    bilanRun = true;
    try {
      const r = await SS.bilan.run(p, { range, loops: 2, pistes: pistes !== false }, { onStage: (nom, i, n) => SS.ui.toast(`✳ Claude : bilan du son… ${nom} (${i + 1}/${n})`, 60000) });
      SS.ui.toast('✳ Claude : bilan du son terminé', 3000);
      return { message: `Bilan de ${scene ? 'la scène ' + SS.currentScene(p).name : 'la chanson'} : ${r.master.lufs} LUFS, crête ${r.master.crete} dBTP${r.conseils.length ? ` ; ${r.conseils.length} conseil(s)` : ''}`, ...r, lecture: 'lufs = volume perçu (streaming : −14 ; pop forte : −9) ; crete en dBTP ; equilibre = parts grave (<250 Hz) / médium / aigu (>4 kHz) ; passages = volume de chaque passage (la courbe d’énergie) ; basseSurKick = part des coups de grosse caisse couverts par la basse ; reperes = valeurs habituelles des chansons de l’assistant' };
    } finally {
      bilanRun = null;
    }
  }

  /* ---------------- Liste des outils (aussi pour le futur panneau intégré, API Claude) ---------------- */
  const S = (type, description, requis) => ({ type, description, ...(requis ? { requis: true } : {}) });
  const SCENE = S('texte', 'nom ou id de la scène (par défaut : la scène en cours)');
  const PISTE = S('texte', 'id ou nom de la piste (voir etat())', true);
  const OUTILS = [
    { nom: 'aide', lecture: true, description: 'Ce mode d’emploi.', params: {}, faire: () => ({ aide: aideTexte() }) },
    { nom: 'etat', lecture: true, description: 'La chanson : titre, tempo, mesure, scènes (tonalité, accords), structure, pistes (id, son, volume, muet).', params: {}, faire: etat },
    { nom: 'piste', lecture: true, description: 'Le contenu d’une piste dans une scène : notes (pas, note, dur, vel) ou motif de batterie.', params: { piste: PISTE, scene: SCENE }, faire: piste },
    { nom: 'accords', lecture: true, description: 'La grille d’accords d’une scène (accord, pas, durée).', params: { scene: SCENE }, faire: accords },
    { nom: 'sons', lecture: true, description: 'Les sons disponibles pour un rôle (ou les kits et éléments de batterie).', params: { role: S('texte', 'batterie, percu, basse, nappe, arpege, lead, piano, guitare, cordes, sax, cuivres, voix, orchestre, effets'), recherche: S('texte', 'un bout de nom : "moog", "strings", "rhodes"…') }, faire: sons },

    { nom: 'importerMidi', description: 'Importe un fichier MIDI comme menu ▸ Importer MIDI… : une nouvelle chanson (pistes, scènes, arrangement) remplace celle en cours, qui reste dans « Mes chansons ». Asynchrone : await.', params: { url: S('texte', 'adresse du fichier .mid (le site doit l’autoriser)'), base64: S('texte', 'ou le fichier en base64'), octets: S('liste', 'ou ses octets (Uint8Array ou liste de nombres)'), nom: S('texte', 'nom du fichier (titre de la chanson)'), decoupage: S('texte', 'scènes : fidele, equilibre (défaut), compact'), batterie: S('texte', 'gm (défaut, sons d’origine), RolandTR808, RolandTR909, LinnDrum, RolandTR707'), quantize: S('booléen', 'caler les notes sur la grille (défaut : réglage Quantize de l’app)'), apercu: S('booléen', 'seulement le bilan, sans importer'), fenetre: S('booléen', 'ouvrir la fenêtre d’import réglée ainsi : l’utilisateur relit et confirme') }, faire: importerMidi },
    { nom: 'partition', lecture: true, description: 'État de la fenêtre « Lire une partition » (menu ▸ Lire une partition…) : fichier déposé, pages, contenu (auto, melodie, piano, ensemble), résultat ; et le format attendu par lirePartition.', params: {}, faire: partition },
    { nom: 'partitionPage', lecture: true, description: 'Affiche en grand une page de la partition déposée par l’utilisateur, pour la lire à l’écran.', params: { page: S('nombre', 'n° de page (1 = la première)') }, faire: partitionPage },
    { nom: 'lirePartition', lecture: true, description: 'Donne à la fenêtre « Lire une partition » les notes lues sur la partition (ne touche pas à la chanson) : l’utilisateur vérifie les mesures signalées, puis enregistre le .mid ou importe. Rappelle-le corrigé si des mesures sont à vérifier.', params: { titre: S('texte', ''), tempo: S('texte', 'BPM (80) ou mot écrit (Andante)'), mesure: S('texte', '"4/4" (défaut), "3/4", "6/8"…'), tonalite: S('texte', '"Fa majeur", "Ré mineur"…'), portees: S('liste', '[{ nom, instrument, mesures: ["C5:1 D5:0.5 E5:0.5 r:2", …] }] (voir partition().format)', true), accords: S('liste', 'accords chiffrés, une chaîne par mesure : ["Dm7", "G7 C"]'), anacrouse: S('nombre', 'durée de la mesure d’anacrouse en noires (sinon déduite)'), musicxml: S('texte', 'ou une partition MusicXML complète (remplace le reste)') }, faire: lirePartition },
    { nom: 'partitionSortie', lecture: true, description: 'Après lirePartition : télécharge le .mid, ou (importer: true) ouvre la fenêtre Importer MIDI.', params: { importer: S('booléen', 'true : importer dans StepSeq ; sinon enregistrer le .mid') }, faire: partitionSortie },
    { nom: 'titre', description: 'Change le titre de la chanson.', params: { titre: S('texte', 'le nouveau titre', true) }, faire: titre },
    { nom: 'tempo', description: 'Change le tempo.', params: { bpm: S('nombre', '20 à 300', true) }, faire: tempo },
    { nom: 'mesure', description: 'Change la signature rythmique (toute la chanson).', params: { temps: S('nombre', 'temps par mesure (1–12)', true), unite: S('nombre', '2, 4, 8 ou 16 (défaut 4)') }, faire: mesure },
    { nom: 'mesures', description: 'Nombre de mesures d’une scène (les mesures ajoutées reprennent le motif).', params: { nombre: S('nombre', '1 à 64', true), scene: SCENE }, faire: mesures },
    { nom: 'tonalite', description: 'Change la tonalité d’une scène ; les accords suivent, les notes sont transposées (intervalle le plus court).', params: { tonique: S('texte', '"F", "Fa", "F#", "Sib"…', true), mode: S('texte', 'majeur (défaut), mineur, mineur harmonique, dorien, phrygien, lydien, mixolydien, locrien'), scene: SCENE, transposer: S('booléen', 'transposer les notes (défaut true)') }, faire: tonalite },
    { nom: 'ecrireAccords', description: 'Pose la grille d’accords d’une scène, une mesure par élément ("C G" = deux accords dans la mesure). Remplace la grille existante.', params: { accords: S('liste', '["Am", "F", "C G", "E7"] ou [{ accord, pas, duree }]', true), scene: SCENE, tonalite: S('objet', '{ tonique, mode } si la scène n’en a pas (sinon déduite du premier accord)') }, faire: ecrireAccords },
    { nom: 'proposerAccords', description: '✦ PROPOSER : StepSeq devine la tonalité et propose des accords d’après la basse et la mélodie de la scène.', params: { scene: SCENE, choix: S('nombre', 'n° de la grille proposée (0, 1, 2…)') }, faire: proposerAccords },
    { nom: 'ajouterPiste', description: 'Crée une piste. Batterie : une piste par élément (kick, snare…).', params: { role: S('texte', 'batterie, percu, basse, nappe, arpege, lead, piano, guitare, cordes, sax, cuivres, voix, orchestre, effets', true), son: S('texte', 'id ou bout de nom d’un son (voir sons()), ou "j:A48" (Juno-106)'), nom: S('texte', 'nom de la piste'), element: S('texte', 'batterie : bd/kick, sd/snare, cp/clap, hh/charley, oh, rim, lt, mt, ht, cr, rd, cb, sh, tb'), kit: S('texte', 'batterie : RolandTR808 (défaut), RolandTR909, LinnDrum…'), suitAccords: S('booléen', 'la piste joue les accords de la grille (nappes, pianos)') }, faire: ajouterPiste },
    { nom: 'ecrireNotes', description: 'Écrit les notes d’une piste instrument dans une scène. Remplace toutes ses notes, sauf avec ajouter ou deMesure/aMesure.', params: { piste: PISTE, notes: S('liste', '[{ pas, note, dur, vel }] ; note "E2" ou ["C4","E4","G4"] (accord) ; dur en pas (défaut 1) ; vel 0–1 (défaut 0.8, ghost ≈ 0.3)', true), scene: SCENE, ajouter: S('booléen', 'ajouter sans effacer'), deMesure: S('nombre', 'ne remplacer que de cette mesure (1 = la première)…'), aMesure: S('nombre', '…à cette mesure incluse') }, faire: ecrireNotes },
    { nom: 'ecrireBatterie', description: 'Pose le motif d’une piste de batterie dans une scène (répété sur toute la scène).', params: { piste: PISTE, motif: S('texte', 'un caractère par pas : X accent, x coup, o ghost note, . silence ; ex. "x...x...x...x..."'), pas: S('liste', 'ou une liste de pas : [0, 4, 8, 12] ou [{ pas, vel }]'), vel: S('nombre', 'vélocité des pas donnés en liste (défaut 0.8)'), scene: SCENE }, faire: ecrireBatterie },
    { nom: 'son', description: 'Change le son d’une piste (batterie : le kit).', params: { piste: PISTE, son: S('texte', 'id ou bout de nom (voir sons()), "j:A48", ou un kit pour la batterie', true) }, faire: son },
    { nom: 'figer', description: 'Fige une piste instrument en audio (bouton ❄) : elle est jouée depuis un enregistrement et ne fait presque plus calculer le moteur audio (son qui décroche avec plusieurs synthés). figer: false la dégèle.', params: { piste: PISTE, figer: S('booléen', 'false : dégeler') }, faire: figer },
    { nom: 'mix', description: 'Volume, muet, solo d’une piste.', params: { piste: PISTE, volume: S('nombre', '0 à 1'), muet: S('booléen', ''), solo: S('booléen', '') }, faire: mix },
    { nom: 'presence', description: 'Piste générative (Jardin, Paysage, Fresque) : sa présence dans une scène, comme la bande de la Grille (ses notes viennent du module, pas de la grille). Sans valeur : la lit.', params: { piste: PISTE, scene: SCENE, valeur: S('nombre', 'présence constante 0–1'), debut: S('nombre', 'rampe : présence au début de la scène 0–1'), fin: S('nombre', 'rampe : présence à la fin de la scène 0–1') }, faire: presence },
    { nom: 'effets', description: 'Règle les effets d’une piste (comme la fenêtre Effets). Seuls les réglages donnés changent.', params: { piste: PISTE, chorus: S('nombre', 'mix 0–1'), chorusVitesse: S('nombre', 'Hz 0.1–6'), chorusProfondeur: S('nombre', '0–1'), delay: S('nombre', 'mix de l’écho 0–1'), delayTemps: S('texte', '"1/16", "1/8", "3/16" (croche pointée), "1/4"…'), delayRepetitions: S('nombre', 'feedback 0–0.9'), reverb: S('nombre', 'mix 0–1'), reverbTaille: S('nombre', 'secondes 0.2–10'), reverbBrillance: S('nombre', 'Hz 500–20000'), sidechainSource: S('texte', 'piste qui fait pomper celle-ci (souvent le kick) ; "" pour retirer'), sidechainProfondeur: S('nombre', '0–1'), sidechainRelachement: S('nombre', 'secondes 0.03–1'), envoiPlate: S('nombre', 'envoi vers la reverb Plate commune (batterie) 0–1'), envoiHall: S('nombre', 'envoi vers la reverb Hall commune (instruments) 0–1'), envoiEcho: S('nombre', 'envoi vers l’écho à bande commun 0–1'), envoiCosmos: S('nombre', 'envoi vers Cosmos, reverb longue ambient 0–1'), aucun: S('booléen', 'retirer tous les effets d’abord') }, faire: effets },
    { nom: 'automations', lecture: true, description: 'Les paramètres automatisables d’une piste et leurs formes toutes prêtes.', params: { piste: PISTE }, faire: automations },
    { nom: 'automation', description: 'Fait évoluer un réglage au fil d’une scène : une forme toute prête ou des points (les valeurs glissent d’un point à l’autre).', params: { piste: PISTE, parametre: S('texte', 'filter, res, volume, reverb, echo, space, vcf, pw, fdecay, lfoamt, sustain, mod, bend (voir automations())', true), forme: S('texte', 'ex. "lp-open", "hp-rise", "in", "pump" (voir automations())'), points: S('liste', '[{ pas, valeur }] ; filter : −1 passe-bas fermé … 0 ouvert … +1 passe-haut'), effacer: S('booléen', 'retirer cette automation'), scene: SCENE }, faire: automation },
    { nom: 'automationsChanson', lecture: true, description: 'Les courbes par temps (cutoff, résonance, vélocité) d’une piste sur toute la chanson, passage par passage.', params: { piste: PISTE }, faire: automationsChanson },
    { nom: 'automationChanson', description: 'Courbe par temps sur toute la chanson (suit l’arrangement : le 2e refrain peut être plus ouvert que le 1er). Vise une scène (tous ses passages, ou un seul), ou des mesures de la chanson sans scène. Retouchable sous les notes de la piste (bouton ∿).', params: { piste: PISTE, parametre: S('texte', 'cutoff (−4…+4 octaves autour du son, 0 = inchangé), resonance (×0…×3, 1 = inchangée), velocite (0.4…1.3, 1 = comme écrit) ; batterie et Juno-106 : velocite seulement'), scene: S('texte', 'scène visée (sinon : la chanson entière, ou deMesure/aMesure de la chanson)'), passage: S('nombre', 'n° du passage de la scène (1 = sa 1re fois dans la chanson) ; défaut : tous, chacun avec la même courbe'), deMesure: S('nombre', 'première mesure (1 = début de la scène, ou de la chanson sans scène)'), aMesure: S('nombre', 'dernière mesure incluse'), forme: S('texte', 'montee, descente, vague (monte puis redescend), neutre'), de: S('nombre', 'valeur de départ de la forme (vague : la base)'), a: S('nombre', 'valeur d’arrivée (vague : le sommet)'), valeur: S('nombre', 'une seule valeur sur toute la plage'), points: S('liste', '[{ temps, valeur }] ; temps à partir de 0 = début de la plage ; entre deux points la valeur glisse'), effacer: S('booléen', 'retirer la courbe sur la plage'), lecture: S('texte', 'fluide (la valeur glisse d’un temps à l’autre, défaut) ou paliers') }, faire: automationChanson },
    { nom: 'console', description: 'Inserts de la tranche d’une piste dans la console : panoramique, EQ, compresseur, limiteur. Sans réglage : les lit. Donner un réglage d’un module l’allume (sauf actif: false).', params: { piste: PISTE, pan: S('nombre', '−1 gauche … 0 centre … 1 droite'), eq: S('objet', '{ actif, passeHaut: Hz (ou { actif, f }), graves: { f, gain }, basMedium: { f, gain, q }, hautMedium: { f, gain, q }, aigus: { f, gain } } ; gain en dB −18…+18'), compresseur: S('objet', '{ actif, seuil (dB −60…0), ratio (1–20), attaque (s), relachement (s), genou (dB), gain (dB) }'), limiteur: S('objet', '{ actif, plafond (dB), relachement (s) }'), reinitialiser: S('booléen', 'remettre la tranche à plat d’abord') }, faire: consoleTool },
    { nom: 'retours', description: 'Bus d’effets partagés, où les pistes envoient (effets() : envoiPlate, envoiHall, envoiEcho, envoiCosmos). Sans réglage : les lit.', params: { plate: S('objet', 'reverb Plate (batterie) : { taille (s 0.2–10), predelai (s), passeHaut, passeBas (Hz), niveau (0–2) }'), hall: S('objet', 'reverb Hall (instruments) : mêmes réglages'), echo: S('objet', 'écho à bande : { temps ("1/8", "3/16"…), repetitions (0–1), pleurage (0–1), saturation (0–1), passeHaut, passeBas, niveau }'), cosmos: S('objet', 'reverb longue ambient : { duree (s 0.5–60), taille (0.1–1), predelai, amorti (Hz), modulation (0–1), shimmer (0–1), gel (booléen), passeHaut, passeBas, niveau }'), reinitialiser: S('booléen', 'revenir aux réglages d’origine d’abord') }, faire: retours },
    { nom: 'master', description: 'Le Master : volume, console (EQ, filtre, compresseur, limiteur), effets du Master et mastering. Sans réglage : le lit.', params: { volume: S('nombre', '0 à 2 (0.8 par défaut)'), eq: S('objet', 'comme console()'), filtre: S('objet', '{ actif, pente (12 ou 24), passeHaut: { f, resonance }, passeBas: { f, resonance } } ; resonance en dB 0–18'), compresseur: S('objet', 'comme console()'), limiteur: S('objet', 'comme console()'), effets: S('objet', '{ actif, saturation: { actif, quantite 0–1 }, chorus: { actif, mix 0–0.5 }, reverb: { actif, mix 0–0.3 } }'), mastering: S('objet', '{ actif, drive (dB −24…24), plafond (dBTP −12…0), largeur (0–2), mono (Hz 0–300 : graves en mono), relachement (s), clip (0–1) }'), reinitialiser: S('booléen', 'revenir au Master d’origine d’abord') }, faire: master },
    { nom: 'renommerPiste', description: 'Renomme une piste.', params: { piste: PISTE, nom: S('texte', 'nouveau nom', true) }, faire: renommerPiste },
    { nom: 'supprimerPiste', description: 'Supprime une piste (Ctrl+Z la ramène).', params: { piste: PISTE }, faire: supprimerPiste },
    { nom: 'allerScene', description: 'Affiche une scène (sans rien modifier).', params: { scene: S('texte', 'nom ou id', true) }, faire: allerScene, lecture: true },
    { nom: 'ajouterScene', description: 'Ajoute une scène, vide ou copie d’une autre, et la place à la fin de la structure.', params: { nom: S('texte', 'Intro, Couplet 2…'), copier: S('texte', 'scène à copier (sinon vide)'), mesures: S('nombre', '1 à 64'), dansStructure: S('booléen', 'l’ajouter à la structure (défaut true)') }, faire: ajouterScene },
    { nom: 'renommerScene', description: 'Renomme une scène.', params: { scene: S('texte', 'nom ou id', true), nom: S('texte', 'nouveau nom', true) }, faire: renommerScene },
    { nom: 'supprimerScene', description: 'Supprime une scène (Ctrl+Z la ramène).', params: { scene: S('texte', 'nom ou id', true) }, faire: supprimerScene },
    { nom: 'structure', description: 'L’ordre des scènes de la chanson (remplace la structure).', params: { blocs: S('liste', '["Intro", { scene: "Couplet", fois: 2 }, "Refrain"]', true) }, faire: structure },
    { nom: 'jouer', lecture: true, description: 'Lance la lecture (le son ne part qu’après un clic de l’utilisateur dans la page).', params: { scene: SCENE, chanson: S('booléen', 'true : toute la chanson ; false : la scène en boucle') }, faire: jouer },
    { nom: 'stop', lecture: true, description: 'Arrête la lecture.', params: {}, faire: stop },
    { nom: 'annuler', lecture: true, description: 'Annule la dernière action (comme Ctrl+Z).', params: {}, faire: annuler },
    { nom: 'retablir', lecture: true, description: 'Rétablit l’action annulée (comme Ctrl+Y).', params: {}, faire: retablir },
    { nom: 'assistantStyles', lecture: true, assistant: true, description: 'Assistant « Nouvelle chanson » : les styles et leurs inspirations (chanson, artiste, tempo).', params: {}, faire: assistantStyles },
    { nom: 'assistantEtat', lecture: true, assistant: true, description: 'Assistant : ouvert ou non, étape, style, inspiration, musiciens (id, type, son), tempo, tonalité, scènes (id, mesures, tonalité, grille), structure.', params: {}, faire: assistantEtat },
    { nom: 'assistantSons', lecture: true, assistant: true, description: 'Assistant : les sons conseillés pour un type de musicien (batterie : les kits ; orchestre : les effectifs ; ambient : les modules Jardin, Paysage, Fresque).', params: { type: S('texte', 'batterie, basse, nappe, arpege, melodie, orchestre, ambient', true) }, faire: assistantSons },
    { nom: 'assistantOuvrir', assistant: true, description: 'Ouvre l’assistant « Nouvelle chanson » sur la chanson (reprend son brouillon s’il y en a un).', params: {}, faire: assistantOuvrir },
    { nom: 'assistantEtape', assistant: true, description: 'Affiche une étape de l’assistant.', params: { etape: S('texte', 'style, instruments, tempo, scenes, accords, arrangement, effets, mix, integration', true) }, faire: assistantEtape },
    { nom: 'assistantEcouter', lecture: true, assistant: true, description: 'Écoute la chanson en cours de création (ou la scène, aux étapes Accords et instruments).', params: {}, faire: assistantEcouter },
    { nom: 'assistantStop', lecture: true, assistant: true, description: 'Arrête l’écoute de l’assistant.', params: {}, faire: assistantStop },
    { nom: 'assistantMixAuto', assistant: true, description: 'Panneau Mix auto de l’assistant (à droite, étapes 3 à 12) : écoute pendant la lecture et propose des conseils de mix et de mastering (volumes, égaliseur, compresseur, limiteur, envois, mastering) rangés dans le mix de l’assistant, pour toute la chanson ou pour chaque scène (volumes, envoi hall). La tranche écoutée ou réglée s’illumine à l’étape Mix. Mode main (accepter un par un) ou auto (le pilote applique, un geste à la fois, les familles permises). Sans paramètre : l’état (conseils, faits).', params: { ouvrir: S('booléen', 'true ouvre, false ferme'), mode: S('texte', 'main ou auto'), toucher: S('objet', 'familles permises au mode auto : { fader, eq, comp, pan, sidechain, sends, mastereq, mastering } → true/false'), parScene: S('booléen', 'true : « Chaque scène » (écoute scène par scène, volumes et envoi hall rangés dans la scène entendue) ; false : toute la chanson'), accepter: S('texte', 'id ou titre d’un conseil'), refuser: S('texte', 'id d’un conseil'), annuler: S('booléen', 'défait le dernier réglage (comme Ctrl+Z)'), annulerSession: S('booléen', 'revient au mix d’avant la session') }, faire: assistantMixAuto },
    { nom: 'assistantFermer', assistant: true, description: 'Revient à la grille ; le brouillon de l’assistant est gardé.', params: {}, faire: assistantFermer },
    { nom: 'assistantEmotion', assistant: true, description: 'Assistant « Nouvelle chanson » › « D’après une émotion » : déduit tempo, tonalité, groupe, scènes et accords d’un style et d’une à trois émotions pondérées (chansons de référence). appliquer: true règle l’assistant (inspiration la plus proche, scènes, accords, émotion de chaque scène). Par scène (parScene ou trajectoire) : l’émotion évolue au fil des scènes, chaque scène a sa tonalité (relative ou homonyme), sa charnière V7, son énergie et ses musiciens. Style film (Musique de film) : une émotion par passage de l’image (passages ou histoire) ou un mélange (emotions + duree) → repères, tempo calé ou par passage, tonalité, effectif, thème ; appliquer ouvre « Ma scène » réglée.', params: { style: S('texte', 'id du style (synthwave, edm, ambient, techno, pop, funk, hiphop, dnb, latin, soul, cliches, film)', true), passages: S('liste', 'film : [{ emotion (' + SS.FILM_EMOTIONS.map((e) => e.k).join(', ') + '), secondes, nom, synchro, dialogue }]'), histoire: S('texte', 'film, histoire toute faite : danger, adieux, decouverte, traque, retour'), duree: S('nombre', 'film avec emotions : durée de la scène en secondes (défaut 50)'), tempo: S('texte', 'film : cale (un tempo calé sur la synchro) ou passage (un tempo par passage) ; défaut : le conseil'), orchestre: S('texte', 'film : intime, romantique, epique, mystere (défaut : déduit)'), emotions: S('texte', 'toute la chanson : émotions et poids, ex. "nostalgie:60 espoir:40" ou [{ emotion, poids }]'), parScene: S('objet', 'par scène : { couplet, montee, refrain, pont, fin } → émotion, ex. { couplet: "melancolie", refrain: "euphorie" }'), trajectoire: S('texte', 'par scène, trajectoire toute faite : lumiere, puissance, brise, tempete, reve (parScene la complète)'), relatives: S('objet', 'par scène : { refrain: "homonyme" } pour garder la tonique au lieu de la tonalité relative'), dernierRefrain: S('booléen', 'par scène : dernier refrain un ton plus haut quand il est proposé (true par défaut)'), appliquer: S('booléen', 'true : régler l’assistant (sinon : seulement la proposition)') }, faire: assistantEmotion },
    { nom: 'assistantStyle', assistant: true, description: 'Choisit le style et l’inspiration (le groupe, le tempo et le plan de la chanson suivent).', params: { style: S('texte', 'synthwave, edm, ambient, techno, pop, funk, hiphop, dnb, latin, soul, cliches (Clichés : recettes de tubes connus), zero (Créer de zéro : départ neutre sans inspiration)', true), inspiration: S('texte', 'id, titre ou artiste d’une inspiration (voir assistantStyles())') }, faire: assistantStyle },
    { nom: 'assistantMusicien', assistant: true, description: 'Ajoute un musicien, ou change le son, le type ou le nom d’un musicien, ou le retire.', params: { ajouter: S('texte', 'type du musicien à ajouter : batterie, basse, clavier, nappe, arpege, guitariste, melodie, orchestre, cuivres (section : une piste par musicien), ambient (piste générative)'), musicien: S('texte', 'id ou nom d’un musicien (voir assistantEtat())'), son: S('texte', 'id ou nom d’un son conseillé (assistantSons), ou tout son du catalogue (sons()), "j:A48"… ; ambient : le module jardin, paysage ou fresque ; cuivres : la formation (bigband, soul, funk, disco, salsa, ska, rock, film, nola, brit)'), type: S('texte', 'nouveau type'), nom: S('texte', 'nouveau nom'), retirer: S('booléen', 'retirer ce musicien') }, faire: assistantMusicien },
    { nom: 'assistantTempo', assistant: true, description: 'Tempo de la chanson à créer.', params: { bpm: S('nombre', '40 à 240', true) }, faire: assistantTempo },
    { nom: 'assistantTonalite', assistant: true, description: 'Tonalité de la chanson : toutes les scènes sont transposées.', params: { tonique: S('texte', '"D", "Ré", "F#"…', true), mode: S('texte', 'majeur (défaut), mineur, dorien…') }, faire: assistantTonalite },
    { nom: 'assistantScene', assistant: true, description: 'Longueur, nom, copie ou suppression d’une scène de l’assistant.', params: { scene: S('texte', 'id ou nom (voir assistantEtat())', true), mesures: S('nombre', '1 à 64'), nom: S('texte', 'nouveau nom'), dupliquer: S('booléen', 'faire une copie (les autres réglages s’appliquent à la copie)'), supprimer: S('booléen', 'supprimer la scène') }, faire: assistantScene },
    { nom: 'assistantStructure', assistant: true, description: 'L’ordre des scènes de la chanson (remplace l’arrangement).', params: { blocs: S('liste', '["intro", { scene: "chorus", fois: 2 }, "outro"]', true) }, faire: assistantStructure },
    { nom: 'assistantAccords', assistant: true, description: 'La grille d’une scène, une mesure par élément ("C G" = deux accords), répétée pour couvrir la scène ; ou sa tonalité seule.', params: { scene: S('texte', 'id ou nom (défaut : la scène affichée)'), accords: S('liste', '["Am", "F", "C", "G"]'), tonalite: S('objet', '{ tonique, mode } : tonalité de la scène') }, faire: assistantAccords },
    { nom: 'assistantChangement', assistant: true, description: 'Assistant, étape Accords : change la tonalité ou le mode d’une scène par rapport à la scène jouée juste avant (monter d’un demi-ton ou d’un ton, accord pivot, relatif, parallèle, dorien, lydien…). Sans geste : la liste des gestes possibles.', params: { scene: S('texte', 'id ou nom (défaut : la scène affichée)'), geste: S('texte', 'demi, ton, pivot, rel, par, mixo, lyd, loin (depuis le majeur) ; demi, ton, relM, parM, dor, phr, loin (depuis le mineur)'), passage: S('texte', 'direct ou prepare (dominante de la nouvelle tonalité au dernier temps de la scène d’avant)'), accords: S('texte', 'miens (la scène garde ses accords) ou geste (la grille du geste)'), suivent: S('booléen', 'les scènes qui ne jouent qu’après passent aussi dans la nouvelle tonalité') }, faire: assistantChangement },
    { nom: 'assistantMelodie', assistant: true, description: 'Une autre mélodie pour toute la chanson (comme 🎲).', params: {}, faire: assistantMelodie },
    { nom: 'assistantFilm', lecture: true, assistant: true, description: 'Assistant, style « Musique de film » : la scène (entrée, fin, tempo calé), ses repères (temps, émotion, tension, énergie, synchro, dialogue, point d’orgue, harmonie, accords, nuance, articulations).', params: {}, faire: assistantFilm },
    { nom: 'assistantRepere', assistant: true, description: 'Assistant, musique de film : change un repère (un modèle devient une scène libre), en ajoute un (ajouter: temps en s) ou le retire.', params: { index: S('nombre', 'n° du repère (voir assistantFilm())'), ajouter: S('nombre', 'temps en secondes d’un nouveau repère'), supprimer: S('booléen', 'retire le repère'), temps: S('nombre', 'secondes'), emotion: S('texte', SS.FILM_EMOTIONS.map((e) => e.k).join(', ')), nom: S('texte', 'nom du passage'), tension: S('nombre', '1 à 5'), energie: S('nombre', '1 à 5'), tempo: S('nombre', 'BPM propre au passage (0 : celui de la scène)'), synchro: S('booléen', 'synchro forte (une seule par scène)'), dialogue: S('booléen', 'on parle : la musique s’efface (−4 dB)'), pointDOrgue: S('booléen', 'la dernière mesure tient l’accord'), harmonie: S('texte', 'pedal, common, mediant, chrom, hero, susp, open, song, ou auto'), articulations: S('objet', '{ trem, pizz, glock, marimba, bells } : true / false') }, faire: assistantRepere },
    { nom: 'assistantEffets', lecture: true, assistant: true, description: 'Assistant : les transitions (n°, recette, effets), ce que joue le musicien Effets dans chaque scène, les boucles du Percussionniste, les mouvements de son de l’étape Arrangement.', params: {}, faire: assistantEffets },
    { nom: 'assistantTransition', assistant: true, description: 'Assistant : règle une transition entre deux scènes, par une recette ou effet par effet (les effets non donnés gardent leur réglage). Le réglage vaut pour toutes les transitions entre les mêmes scènes.', params: { transition: S('texte', 'n° (voir assistantEffets()), "Couplet > Refrain", ou la scène d’arrivée', true), recette: S('texte', 'Aucune, Douce, Montée, Montée + coupure, Coupure sèche, Explosion'), effets: S('objet', '{ montee: { mesures, filtre: passeBas|passeHaut|aucun }, filtre: { hz 200–4000 }, cymbaleInversee: { temps }, silence: { temps }, impact: { type: grave+crash|crash|grave, niveau 0.2–1 }, descente: { mesures 2|4 }, retraitBatterie: { mesures 1|2 }, fragmentation, pedale: { mesures 2|4, note: dominante|tonique }, elargissement: { mesures 2|4 }, suspension: { temps 1|2 } } ; true / false pour allumer / éteindre'), reset: S('booléen', 'revenir à ce que fait le plan') }, faire: assistantTransition },
    { nom: 'assistantEffetsScene', assistant: true, description: 'Assistant : ce que joue le musicien Effets dans une scène (hors transitions) et les boucles du Percussionniste ; ou ajoute l’un de ces musiciens.', params: { scene: S('texte', 'id ou nom'), role: S('texte', 'ambiance, montee, descente, rien'), niveau: S('nombre', '0.2–1.5 (1 = normal)'), rythme: S('nombre', 'ambiance : mesures entre deux souffles (1, 2, 4) ou "tenue"'), couleur: S('texte', 'ambiance : sombre ou claire'), longueur: S('nombre', 'montée : en mesures (défaut : toute la scène)'), filtre: S('texte', 'montée : passeBas, passeHaut, aucun'), dureeDescente: S('nombre', 'descente : 1, 2 ou 4 mesures'), percussions: S('objet', '{ shaker, conga, tom } : true / false dans cette scène'), stylePercussions: S('texte', 'techno, latin, minimal (toute la chanson)'), ajouter: S('texte', '"effets" ou "percussionniste" : l’ajoute au groupe') }, faire: assistantEffetsScene },
    { nom: 'assistantMouvements', assistant: true, description: 'Assistant : garde ou retire les mouvements de son proposés à l’étape Arrangement (courbes de cutoff, vélocité, résonance d’après l’énergie).', params: { garder: S('liste', 'ids ou noms : open, qa, acid (voir assistantEffets())'), retirer: S('liste', 'ids ou noms') }, faire: assistantMouvements },
    { nom: 'assistantCreer', assistant: true, description: 'Crée la chanson dans la grille (une étape Ctrl+Z). Si la grille a déjà des pistes, la fenêtre de confirmation s’ouvre : l’utilisateur choisit.', params: {}, faire: assistantCreer },
    { nom: 'assistantMotifs', lecture: true, assistant: true, description: 'Assistant : les motifs possibles d’un musicien (batterie, basse, nappe ou guitare, arpège ; cuivres : les 13 jeux de la section ; orchestre : les jeux de cordes (Orchestration, Tenues, Pizzicato, Trémolo…) ; avec leur famille et « conseille » = ★ pour la scène affichée) dans la mesure de la chanson, et ce qu’il joue dans chaque scène.', params: { musicien: S('texte', 'id ou nom (voir assistantEtat().musiciens)', true), tous: S('booléen', 'batterie : les motifs de tous les styles (sinon ceux du style)') }, faire: assistantMotifs },
    { nom: 'assistantJeu', assistant: true, description: 'Assistant : ce que joue un musicien dans une ou plusieurs scènes : un motif (assistantMotifs ; orchestre : le jeu des cordes), ou joue: false pour qu’il se taise, joue: true pour qu’il revienne. Musicien Ambient : sa présence, son mouvement et son hasard dans la scène.', params: { musicien: S('texte', 'id ou nom', true), scene: SCENE, scenes: S('liste', 'plusieurs scènes, ou "toutes"'), motif: S('texte', 'id ou nom d’un motif (assistantMotifs) ; guitariste : « g:travis », « g:pop », « strum », « r:power »… (jeu arpèges, accords ou riffs) ; clavier : « k:pop8 », « montuno23 », « k:alberti », ou un des 150 motifs du fichier « kf:f001 » à « kf:f150 » (dans sa mesure)…'), joue: S('booléen', 'false : muet dans ces scènes ; true : il rejoue'), presence: S('texte', 'ambient : lointain, discret, present, premier plan'), mouvement: S('texte', 'ambient : stable, monte, descend, respire'), hasard: S('nombre', 'ambient : 0–1 (part d’improvisation dans la scène)'), mainGauche: S('texte', 'clavier : basse (comme écrit), octaves, aucune (main droite seule)'), clavier: S('objet', 'clavier : réglages des boutons et de la fenêtre Avancé, de 0 à 1 sauf mention : voicing, energie, pedale, mainHumaine, registre, accent ; septieme, neuvieme, sus4 (oui/non) ; etalement (0–60 ms), swing, equilibre (0 main gauche ↔ 1 main droite), octaves (1–3, arpèges) ; pas : le motif réécrit, 16 pas séparés par des espaces (« . » = rien ; main droite C C9 c k T M1 M3 M5 M8 1 3 5 7 8 9 10 12 15, main gauche B b O F L1 L5 L8, plusieurs par pas avec +) ; null efface un réglage') }, faire: assistantJeu },
    { nom: 'assistantEcrireMelodie', assistant: true, description: 'Assistant : écrit la mélodie d’une scène note par note (remplace celle de l’inspiration ou du 🎲). Renvoie les notes qui frottent avec les accords.', params: { musicien: S('texte', 'musicien de type mélodie (par défaut : le premier)'), scene: SCENE, notes: S('liste', '[{ pas (0 = début de la scène), note ("E4", "Do5", 64), dur (pas, défaut 2), vel (0–1) }]'), effacer: S('booléen', 'revenir à la mélodie de l’inspiration') }, faire: assistantEcrireMelodie },
    { nom: 'assistantVersions', assistant: true, description: 'Assistant : photos du brouillon pour comparer deux idées (A/B). garder prend la photo, essayer la remet (le brouillon de l’assistant n’a pas de Ctrl+Z). Gardées jusqu’à ce que la page se ferme.', params: { garder: S('texte', 'nom de la version à photographier ("A")'), essayer: S('texte', 'nom de la version à remettre'), oublier: S('texte', 'nom de la version à oublier') }, faire: assistantVersions },
    { nom: 'pointEcoute', lecture: true, assistant: true, description: 'Affiche dans la page une pastille « ✳ Claude : … ▶ Écouter » : un clic de l’utilisateur lance l’écoute (le navigateur exige ce clic). À appeler à la fin de chaque étape.', params: { message: S('texte', 'ce qu’il y a à écouter, court', true), quoi: S('texte', '"chanson", "scene" (grille) ; dans l’assistant : son écoute') }, faire: pointEcoute },
    { nom: 'bilan', lecture: true, assistant: true, description: 'Mesure le son de la chanson de la grille (rendu hors temps réel, 10 s à 1 min) : volume perçu (LUFS) et crête du Master, équilibre grave/médium/aigu, volume de chaque passage, volume de chaque musicien seul, basse qui couvre la grosse caisse, cible de volume du style (cible, référence commune js/mixref.js), conseils. À attendre : await StepSeq.bilan().', params: { scene: S('texte', 'mesurer seulement cette scène (deux tours), plus rapide'), pistes: S('booléen', 'false : le Master seul, sans les musiciens un par un (plus rapide)') }, faire: bilan },
    { nom: 'methode', lecture: true, assistant: true, description: 'La méthode pour créer une chanson avec l’utilisateur, étape par étape (à lire quand il demande de créer une chanson).', params: {}, faire: methode },
  ];


  function aideTexte() {
    const lines = [
      'StepSeq : séquenceur pour composer, arranger et mixer. Tu le pilotes par window.StepSeq.',
      'Appel : StepSeq.nomOutil({ paramètres }) → { ok, message, … } ou { ok: false, erreur }. Commence par StepSeq.etat().',
      'Chaque écriture = une étape Ctrl+Z ; StepSeq.groupe("titre", () => { … }) regroupe plusieurs écritures en une seule.',
      'Temps : 1 pas = une double-croche ; en 4/4 une mesure = 16 pas (pasParMesure dans etat()), le pas 0 est le début de la scène.',
      'Notes : "C4" = do central (MIDI 60), "E2" basse, "F#3", "Sib2", ou un numéro MIDI. Vélocité 0–1 : 1 accent, 0.8 normal, 0.3 ghost note.',
      'La chanson = des scènes (Couplet, Refrain…) ; chaque scène a ses notes, sa tonalité et sa grille d’accords ; les sons et le mix sont communs.',
      'Écrire dans une scène l’affiche à l’écran. Claude n’entend pas le son : décris ce que tu fais et propose à l’utilisateur d’écouter.',
      'Effets : effets() = chorus, écho, reverb, sidechain et envois d’une piste ; console() = ses inserts (EQ, compresseur, limiteur, pan) ; retours() = les bus partagés ; master() = Master et mastering.',
      'Automation : automation() = par pas, propre à une scène, qui boucle avec elle ; automationChanson() = cutoff, résonance, vélocité par temps sur toute la chanson (chaque passage d’une scène peut être différent).',
      'Import MIDI : await StepSeq.importerMidi({ url | base64, decoupage, batterie }) ouvre une nouvelle chanson (apercu: true pour le bilan seul).',
      'Créer une chanson AVEC l’utilisateur (« crée une chanson avec moi ») : lis d’abord StepSeq.methode() et suis-la, étape par étape.',
      'Assistant « Nouvelle chanson » : outils assistant… (assistantOuvrir, assistantStyle, assistantMusicien, assistantAccords… puis assistantCreer). Ses réglages sont un brouillon sans Ctrl+Z ; assistantCreer écrit la chanson dans la grille (une étape Ctrl+Z).',
      '',
      'Outils :',
    ];
    for (const o of OUTILS) {
      const ps = Object.entries(o.params).map(([k, v]) => `${k}${v.requis ? '' : '?'}: ${v.description}`);
      lines.push(`- ${o.nom}(${ps.length ? '{ ' + Object.keys(o.params).join(', ') + ' }' : ''}) — ${o.description}${ps.length ? '\n    ' + ps.join('\n    ') : ''}`);
    }
    lines.push('', 'Exemple : const b = StepSeq.ajouterPiste({ role: "basse", son: "moog", nom: "Basse" }); StepSeq.ecrireNotes({ piste: b.id, scene: "Refrain", notes: [{ pas: 0, note: "E2", dur: 3, vel: 0.9 }, { pas: 4, note: "E3", vel: 0.3 }] })');
    return lines.join('\n');
  }

  /** Enveloppe : erreurs en clair, une étape d'annulation par écriture. */
  function wrap(o) {
    return (args = {}) => {
      if (!app) return { ok: false, erreur: 'StepSeq n’est pas encore prêt' };
      if (SS.band && SS.band.active() && !o.lecture && !o.assistant) return { ok: false, erreur: 'l’assistant « Nouvelle chanson » est ouvert : pilote-le avec les outils assistant…, ou reviens à la grille avec StepSeq.assistantFermer()' };
      try {
        const r = o.faire(args && typeof args === 'object' ? args : {}) || {};
        if (r && typeof r.then === 'function') return r.then((x) => ({ ok: true, ...(x || {}) }), (e) => ({ ok: false, erreur: e.message }));
        return { ok: true, ...r };
      } catch (e) {
        return { ok: false, erreur: e.message };
      }
    };
  }
  function groupe(label, fn) {
    if (typeof label === 'function') [label, fn] = ['plusieurs changements', label];
    if (group) return { ok: true, resultat: fn() };
    group = { label: String(label), n: 0 };
    let res;
    try {
      res = fn();
    } catch (e) {
      res = { ok: false, erreur: e.message };
    } finally {
      const n = group.n;
      group = null;
      if (n) {
        app.commit();
        done(String(label));
      }
    }
    return { ok: true, message: `${label} : une seule étape Ctrl+Z`, resultat: res };
  }

  const api = { version: 1, outils: OUTILS.map(({ nom, description, params, lecture }) => ({ nom, description, params, ecriture: !lecture })), groupe };
  for (const o of OUTILS) api[o.nom] = wrap(o);
  api.aide = () => aideTexte(); // texte brut : plus lisible dans le panneau de l'extension
  api.methode = () => METHODE.join('\n');

  function init(a) {
    app = a;
  }

  window.StepSeq = api;
  return { init, api, _midiOf: midiOf, _tonicOf: tonicOf, _project: () => P() };
})();
