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
  const FR_NOTE = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
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
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  /** Tonique écrite pour chaque classe de hauteur (toutes dans SS.harmony.TONICS). */
  const PC_TONIC = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
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
  const ROLE_FR = { batterie: 'drums', batteur: 'drums', drums: 'drums', percu: 'perc', percussions: 'perc', perc: 'perc', basse: 'bass', bass: 'bass', nappe: 'pad', pad: 'pad', arpege: 'arp', arp: 'arp', lead: 'lead', melodie: 'lead', piano: 'keys', clavier: 'keys', keys: 'keys', guitare: 'guitar', guitar: 'guitar', cordes: 'strings', strings: 'strings', sax: 'sax', saxophone: 'sax', voix: 'vox', vox: 'vox', orchestre: 'orch', orch: 'orch', effets: 'fx', fx: 'fx' };
  function roleOf(r) {
    const id = ROLE_FR[fold(r)];
    if (!id) fail(`rôle inconnu : « ${r} ». Rôles : batterie, percu, basse, nappe, arpege, lead, piano, guitare, cordes, sax, voix, orchestre, effets`);
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
    if (t.type === 'drum') return `${SS.Band.drumLabel(t.sound)} · ${(SS.Band.KITS[t.machine] || { label: t.bank || t.machine || '' }).label}`;
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
    document.getElementById('lcdTitle').textContent = P().title;
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
      Object.assign(t, SS.Band.pieceOpts(k, t.sound).opts);
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

  /* ---------------- Liste des outils (aussi pour le futur panneau intégré, API Claude) ---------------- */
  const S = (type, description, requis) => ({ type, description, ...(requis ? { requis: true } : {}) });
  const SCENE = S('texte', 'nom ou id de la scène (par défaut : la scène en cours)');
  const PISTE = S('texte', 'id ou nom de la piste (voir etat())', true);
  const OUTILS = [
    { nom: 'aide', lecture: true, description: 'Ce mode d’emploi.', params: {}, faire: () => ({ aide: aideTexte() }) },
    { nom: 'etat', lecture: true, description: 'La chanson : titre, tempo, mesure, scènes (tonalité, accords), structure, pistes (id, son, volume, muet).', params: {}, faire: etat },
    { nom: 'piste', lecture: true, description: 'Le contenu d’une piste dans une scène : notes (pas, note, dur, vel) ou motif de batterie.', params: { piste: PISTE, scene: SCENE }, faire: piste },
    { nom: 'accords', lecture: true, description: 'La grille d’accords d’une scène (accord, pas, durée).', params: { scene: SCENE }, faire: accords },
    { nom: 'sons', lecture: true, description: 'Les sons disponibles pour un rôle (ou les kits et éléments de batterie).', params: { role: S('texte', 'batterie, percu, basse, nappe, arpege, lead, piano, guitare, cordes, sax, voix, orchestre, effets'), recherche: S('texte', 'un bout de nom : "moog", "strings", "rhodes"…') }, faire: sons },

    { nom: 'titre', description: 'Change le titre de la chanson.', params: { titre: S('texte', 'le nouveau titre', true) }, faire: titre },
    { nom: 'tempo', description: 'Change le tempo.', params: { bpm: S('nombre', '20 à 300', true) }, faire: tempo },
    { nom: 'mesure', description: 'Change la signature rythmique (toute la chanson).', params: { temps: S('nombre', 'temps par mesure (1–12)', true), unite: S('nombre', '2, 4, 8 ou 16 (défaut 4)') }, faire: mesure },
    { nom: 'mesures', description: 'Nombre de mesures d’une scène (les mesures ajoutées reprennent le motif).', params: { nombre: S('nombre', '1 à 64', true), scene: SCENE }, faire: mesures },
    { nom: 'tonalite', description: 'Change la tonalité d’une scène ; les accords suivent, les notes sont transposées (intervalle le plus court).', params: { tonique: S('texte', '"F", "Fa", "F#", "Sib"…', true), mode: S('texte', 'majeur (défaut), mineur, mineur harmonique, dorien, phrygien, lydien, mixolydien, locrien'), scene: SCENE, transposer: S('booléen', 'transposer les notes (défaut true)') }, faire: tonalite },
    { nom: 'ecrireAccords', description: 'Pose la grille d’accords d’une scène, une mesure par élément ("C G" = deux accords dans la mesure). Remplace la grille existante.', params: { accords: S('liste', '["Am", "F", "C G", "E7"] ou [{ accord, pas, duree }]', true), scene: SCENE, tonalite: S('objet', '{ tonique, mode } si la scène n’en a pas (sinon déduite du premier accord)') }, faire: ecrireAccords },
    { nom: 'proposerAccords', description: '✦ PROPOSER : StepSeq devine la tonalité et propose des accords d’après la basse et la mélodie de la scène.', params: { scene: SCENE, choix: S('nombre', 'n° de la grille proposée (0, 1, 2…)') }, faire: proposerAccords },
    { nom: 'ajouterPiste', description: 'Crée une piste. Batterie : une piste par élément (kick, snare…).', params: { role: S('texte', 'batterie, percu, basse, nappe, arpege, lead, piano, guitare, cordes, sax, voix, orchestre, effets', true), son: S('texte', 'id ou bout de nom d’un son (voir sons()), ou "j:A48" (Juno-106)'), nom: S('texte', 'nom de la piste'), element: S('texte', 'batterie : bd/kick, sd/snare, cp/clap, hh/charley, oh, rim, lt, mt, ht, cr, rd, cb, sh, tb'), kit: S('texte', 'batterie : RolandTR808 (défaut), RolandTR909, LinnDrum…'), suitAccords: S('booléen', 'la piste joue les accords de la grille (nappes, pianos)') }, faire: ajouterPiste },
    { nom: 'ecrireNotes', description: 'Écrit les notes d’une piste instrument dans une scène. Remplace toutes ses notes, sauf avec ajouter ou deMesure/aMesure.', params: { piste: PISTE, notes: S('liste', '[{ pas, note, dur, vel }] ; note "E2" ou ["C4","E4","G4"] (accord) ; dur en pas (défaut 1) ; vel 0–1 (défaut 0.8, ghost ≈ 0.3)', true), scene: SCENE, ajouter: S('booléen', 'ajouter sans effacer'), deMesure: S('nombre', 'ne remplacer que de cette mesure (1 = la première)…'), aMesure: S('nombre', '…à cette mesure incluse') }, faire: ecrireNotes },
    { nom: 'ecrireBatterie', description: 'Pose le motif d’une piste de batterie dans une scène (répété sur toute la scène).', params: { piste: PISTE, motif: S('texte', 'un caractère par pas : X accent, x coup, o ghost note, . silence ; ex. "x...x...x...x..."'), pas: S('liste', 'ou une liste de pas : [0, 4, 8, 12] ou [{ pas, vel }]'), vel: S('nombre', 'vélocité des pas donnés en liste (défaut 0.8)'), scene: SCENE }, faire: ecrireBatterie },
    { nom: 'son', description: 'Change le son d’une piste (batterie : le kit).', params: { piste: PISTE, son: S('texte', 'id ou bout de nom (voir sons()), "j:A48", ou un kit pour la batterie', true) }, faire: son },
    { nom: 'mix', description: 'Volume, muet, solo d’une piste.', params: { piste: PISTE, volume: S('nombre', '0 à 1'), muet: S('booléen', ''), solo: S('booléen', '') }, faire: mix },
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
      if (SS.band && SS.band.active() && !o.lecture) return { ok: false, erreur: 'l’assistant « Nouvelle chanson » est ouvert : demande à l’utilisateur de revenir à la Grille (bouton ▦ Grille en haut)' };
      try {
        const r = o.faire(args && typeof args === 'object' ? args : {}) || {};
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

  function init(a) {
    app = a;
  }

  window.StepSeq = api;
  return { init, api, _midiOf: midiOf, _tonicOf: tonicOf };
})();
