/*
 * Surveillance audio automatique : pendant la lecture (et quelques secondes après), relève 4 fois par seconde
 * les niveaux de chaque étage du moteur (pistes, delays, reverbs, retours partagés, somme du Master, sortie),
 * les événements des modules audio et l'horloge de la sortie, puis détecte et nomme les problèmes :
 *   - signal invalide (NaN / infini) : coupe le son jusqu'à réparation ; on cherche l'étage d'origine ;
 *   - emballement (delay, écho, résonance) : un étage monte bien au-dessus de 0 dBFS ;
 *   - Master trop chaud, écrêtage de la sortie (grésillement) ;
 *   - décrochages du moteur audio (processeur saturé), notes programmées en retard (interface bloquée) ;
 *   - module audio planté, sortie interrompue, son coupé alors que les pistes jouent.
 * Les pannes qui coupent le son sont réparées automatiquement (SS.audio.repair). Les incidents s'affichent dans
 * la fenêtre Système ; un incident grave affiche aussi une notification.
 * assess() et estimateLoad() sont des fonctions pures, testées sous Node (tests/audiowatch.test.js).
 */
window.SS = window.SS || {};

SS.audioWatch = (() => {
  const CFG = {
    runaway: 4, // crête d'un étage au-delà de laquelle on parle d'emballement (+12 dBFS)
    hot: 2, // somme du Master au-delà de +6 dBFS (le limiteur écrase, grésillement possible)
    clipSamples: 48, // échantillons écrêtés en sortie sur un relevé avant de signaler
    silentSecs: 2, // son coupé en sortie pendant que les pistes jouent
    clockRatio: 0.95, // horloge audio plus lente que l'horloge réelle : le moteur décroche
    merge: 10000, // un incident identique dans les 10 s est cumulé (compteur) au lieu d'être répété
    keep: 40, // incidents conservés
  };
  const dB = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  const fmtDb = (v) => (v >= 0 ? '+' : '−') + Math.abs(dB(v)).toFixed(1).replace('.', ',') + ' dB';

  function newState() {
    return { incidents: [], next: 1, unseen: 0, silentFor: 0, hot: 0, clock: null, prev: null, history: new Map(), counters: freshCounters() };
  }
  const freshCounters = () => ({ underruns: 0, clipped: 0, late: 0, maxLateMs: 0, clockRatio: null, load: null, since: null });

  /** Ajoute un incident, ou cumule s'il s'agit du même problème au même endroit dans les 10 dernières secondes. */
  function raise(state, inc, now) {
    const key = inc.kind + ':' + (inc.where || '');
    const same = state.incidents.find((x) => x.key === key && now - x.last < CFG.merge);
    if (same) {
      same.count++;
      same.last = now;
      if (inc.detail) same.detail = inc.detail;
      if (inc.advice) same.advice = inc.advice;
      return null;
    }
    const full = { id: state.next++, key, count: 1, at: now, last: now, fixed: null, ...inc };
    state.incidents.unshift(full);
    if (state.incidents.length > CFG.keep) state.incidents.length = CFG.keep;
    state.unseen++;
    return full;
  }

  const trackName = (names, id) => (names && names.get(id)) || 'piste';
  const RET = { plate: 'Reverb Plate (bus partagé)', hall: 'Reverb Hall (bus partagé)', echo: 'Écho à bande (bus partagé)', space: 'Reverb Cosmos (bus partagé)' };

  /** Étages relevés, dans l'ordre du trajet du son : le premier fautif est l'origine probable. */
  function stages(snap, names) {
    const list = [];
    for (const t of snap.tracks || []) {
      const name = trackName(names, t.id);
      list.push({ where: 'bus:' + t.id, trackId: t.id, kind: 'bus', label: `Piste « ${name} »`, m: t.bus });
      if (t.delay) list.push({ where: 'delay:' + t.id, trackId: t.id, kind: 'delay', label: `Delay de « ${name} »`, m: t.delay, feedback: t.delay.feedback });
      if (t.reverb) list.push({ where: 'reverb:' + t.id, trackId: t.id, kind: 'reverb', label: `Reverb de « ${name} »`, m: t.reverb });
    }
    for (const [k, m] of Object.entries(snap.returns || {})) list.push({ where: 'ret:' + k, kind: 'return', ret: k, label: RET[k] || k, m });
    list.push({ where: 'master', kind: 'master', label: 'Somme du Master', m: snap.masterIn });
    list.push({ where: 'out', kind: 'out', label: 'Sortie', m: snap.out });
    return list.filter((s) => s.m);
  }

  function runawayAdvice(s) {
    if (s.kind === 'delay') {
      const fb = Math.round((s.feedback || 0) * 100);
      return `Le delay de la piste s'auto-entretient (feedback ${fb} %). Baisser son feedback sous 70 % ou son mix, dans la fenêtre Effets de la piste.`;
    }
    if (s.kind === 'return' && s.ret === 'echo') return 'L\'écho partagé se réinjecte trop : baisser sa réinjection (console Master › Retours) ou les envois Écho des pistes.';
    if (s.kind === 'return') return 'Le retour d\'effet reçoit trop de signal : baisser les envois des pistes vers ce bus ou son niveau de retour.';
    if (s.kind === 'reverb') return 'La reverb de la piste sature : baisser son mix ou le volume de la piste.';
    return 'Le son de la piste dépasse largement 0 dBFS (résonance du filtre très haute, drive, gain de l\'égaliseur) : baisser ces réglages ou le volume de la piste.';
  }

  /**
   * Analyse un relevé de SS.audio.probe(). `env` : { now (ms), names (Map id -> nom), load (estimateLoad),
   * masterVolume, hidden }. Renvoie { added: incidents nouveaux, actions: ['repair' | 'resume'] }.
   */
  function assess(state, snap, env = {}) {
    const now = env.now || 0;
    const added = [];
    const actions = new Set();
    const c = state.counters;
    const add = (inc) => {
      const r = raise(state, inc, now);
      if (r) added.push(r);
      return r;
    };
    const prev = state.prev;
    const dt = prev ? Math.min(2, Math.max(0, (now - prev.now) / 1000)) : 0;
    // nouvelle lecture : compteurs remis à zéro (les incidents restent)
    if (snap.playing && (!prev || !prev.playing)) state.counters = Object.assign(c, freshCounters(), { since: now });
    const list = stages(snap, env.names);

    // 1. événements des modules audio et du navigateur
    for (const e of snap.events || []) {
      const who = e.trackId && e.trackId !== '__preview' ? ` (piste « ${trackName(env.names, e.trackId)} »)` : '';
      if (e.kind === 'crash') {
        add({ kind: 'crash', level: 'bad', where: e.label + (e.trackId || ''), title: `Module audio arrêté : ${e.label}${who}`, detail: 'Son processeur a planté et ne produit plus que du silence.', advice: 'Il est recréé automatiquement. Si cela se répète, noter le réglage en cours et le signaler.' });
        actions.add('repair');
      } else if (e.kind === 'bad') {
        // arrivé jusqu'au mastering : les filtres du Master l'ont déjà vu passer et restent bloqués
        if (e.area === 'master') {
          actions.add('repair');
          // conséquence d'un signal invalide déjà localisé plus haut : pas d'incident en double
          const known = state.incidents.some((x) => x.kind === 'nan' && now - x.last < CFG.merge) || list.some((s) => s.m.bad > 0 && s.kind !== 'master' && s.kind !== 'out');
          if (known) continue;
        }
        add({ kind: 'bad', level: 'warn', where: e.label + (e.trackId || ''), title: `Signal invalide neutralisé : ${e.label}${who}`, detail: 'Une valeur numérique invalide (NaN ou infini) est arrivée dans ce module ; elle a été bloquée avant de couper le son.', advice: e.area === 'master' ? 'Elle vient d\'une piste ou d\'un effet : voir les autres incidents pour l\'origine.' : 'Le module a été remis à zéro. Si cela se répète, baisser la résonance ou le drive de ce son.' });
      } else if (e.kind === 'state' && e.label !== 'running' && e.label !== 'closed' && snap.playing) {
        add({ kind: 'state', level: 'bad', where: 'ctx', title: 'Sortie audio interrompue', detail: `Le navigateur a mis le moteur audio en état « ${e.label} ».`, advice: 'Une autre application, un appel ou un changement de sortie (casque Bluetooth) a pris la main. Le moteur est relancé automatiquement.' });
        actions.add('resume');
      }
    }
    if (snap.playing && snap.state && snap.state !== 'running' && !(snap.events || []).some((e) => e.kind === 'state')) {
      add({ kind: 'state', level: 'bad', where: 'ctx', title: 'Sortie audio interrompue', detail: `Le moteur audio est « ${snap.state} » pendant la lecture.`, advice: 'Le moteur est relancé automatiquement ; sinon, appuyer sur Stop puis Lecture.' });
      actions.add('resume');
    }

    // 2. signal invalide : premier étage fautif dans l'ordre du trajet du son
    const bad = list.filter((s) => s.m.bad > 0);
    if (bad.length) {
      const first = bad.find((s) => s.kind !== 'master' && s.kind !== 'out') || bad[0];
      add({ kind: 'nan', level: 'bad', where: first.where, trackId: first.trackId, title: 'Signal invalide : le son se coupe', detail: `Une valeur numérique invalide (NaN ou infini) circule depuis : ${first.label}. Elle bloque les filtres et le limiteur jusqu'à la réparation.`, advice: first.kind === 'delay' ? runawayAdvice(first) : 'Si cela revient, couper un à un les effets de cette piste pour trouver le réglage en cause.' });
      actions.add('repair');
    }

    // 3. emballement : un étage très au-dessus de 0 dBFS, ou qui grimpe vite
    for (const s of list) {
      if (s.kind === 'master' || s.kind === 'out' || s.m.bad) continue;
      const hist = state.history.get(s.where) || [];
      hist.push(s.m.peak);
      if (hist.length > 4) hist.shift();
      state.history.set(s.where, hist);
      const growing = hist.length === 4 && hist[0] > 0.5 && hist.every((v, i) => !i || v > hist[i - 1] * 1.25);
      if (s.m.peak > CFG.runaway || (growing && s.m.peak > 1)) {
        add({ kind: 'runaway', level: 'bad', where: s.where, trackId: s.trackId, title: `Emballement : ${s.label}`, detail: `Crête ${fmtDb(s.m.peak)} au-dessus de 0 dBFS${growing ? ', et elle continue de monter' : ''} : grésillement, puis coupure du son si cela continue.`, advice: runawayAdvice(s) });
      }
    }

    // 4. Master trop chaud (le limiteur écrase) et écrêtage de la sortie
    const mi = snap.masterIn;
    state.hot = mi && mi.peak > CFG.hot ? state.hot + 1 : 0;
    const loudest = list.filter((s) => s.kind === 'bus').sort((a, b) => b.m.peak - a.m.peak)[0];
    if (state.hot >= 3) {
      add({ kind: 'hot', level: 'warn', where: 'master', title: `Master saturé (${fmtDb(mi.peak)})`, detail: 'La somme des pistes dépasse largement 0 dBFS : le limiteur et l\'écrêteur du Master travaillent en permanence, ce qui peut grésiller.', advice: loudest ? `Baisser les pistes les plus fortes, d'abord « ${trackName(env.names, loudest.trackId)} » (crête ${fmtDb(loudest.m.peak)}), ou lancer l'Auto Mix.` : 'Baisser le volume des pistes.' });
    }
    const dClip = prev && snap.clipped >= prev.clipped ? snap.clipped - prev.clipped : 0;
    c.clipped += dClip;
    const outClip = !snap.mastering && snap.out && snap.out.peak >= 0.999;
    if (dClip >= CFG.clipSamples || outClip) {
      add({ kind: 'clip', level: 'warn', where: 'out', title: 'Écrêtage en sortie (grésillement)', detail: dClip ? `${dClip} échantillons à 0 dBFS ou au-delà sur le dernier quart de seconde.` : 'La sortie atteint 0 dBFS.', advice: 'Activer le mastering (son limiteur garantit le plafond) ou baisser le fader du Master.' });
    }

    // 5. décrochages : statistiques du navigateur, charge mesurée, sinon horloge audio en retard sur l'horloge réelle
    const heavy = (env.load || []).slice(0, 3).map((x) => x.label);
    const lighten = heavy.length ? `Alléger d'abord : ${heavy.join(', ')}.` : 'Alléger les effets et synthés.';
    const underAdvice = `Le processeur ne calcule pas le son assez vite. ${lighten} Fermer les autres onglets et applications ; sur un portable, brancher le secteur.`;
    if (snap.stats && snap.stats.underrunEvents != null) {
      const p0 = prev && prev.stats ? prev.stats.underrunEvents : snap.stats.underrunEvents;
      const d = Math.max(0, snap.stats.underrunEvents - p0);
      if (d > 0 && snap.playing) {
        c.underruns += d;
        add({ kind: 'underrun', level: 'bad', where: 'engine', title: 'Décrochages du moteur audio', detail: `${d} coupure(s) de la sortie mesurée(s) par le navigateur.`, advice: underAdvice });
      }
    }
    if (snap.render) {
      c.load = snap.render;
      if (snap.playing && (snap.render.underrun > 0 || snap.render.peak >= 0.98)) {
        add({ kind: 'underrun', level: snap.render.underrun > 0 ? 'bad' : 'warn', where: 'engine', title: snap.render.underrun > 0 ? 'Décrochages du moteur audio' : 'Moteur audio à la limite', detail: `Charge mesurée : ${Math.round(snap.render.average * 100)} % en moyenne, ${Math.round(snap.render.peak * 100)} % en pointe.`, advice: underAdvice });
      }
    }
    if (snap.state === 'running' && snap.playing && !env.hidden) {
      const ck = snap.ts ? { ctx: snap.ts.context, wall: snap.ts.perf } : { ctx: snap.time, wall: now };
      const k = state.clock;
      if (!k || ck.wall < k.wall) state.clock = { ...ck, slow: 0 };
      else if (ck.wall - k.wall >= 1000) {
        const ratio = (ck.ctx - k.ctx) / ((ck.wall - k.wall) / 1000);
        c.clockRatio = ratio;
        const slow = ratio < CFG.clockRatio ? k.slow + 1 : 0;
        state.clock = { ...ck, slow };
        if (slow >= 2 && !snap.render && !(snap.stats && snap.stats.underrunEvents != null)) {
          c.underruns++;
          add({ kind: 'underrun', level: 'bad', where: 'engine', title: 'Décrochages du moteur audio', detail: `L'horloge audio n'avance qu'à ${Math.round(ratio * 100)} % du temps réel : le son est calculé trop lentement et la sortie saute.`, advice: underAdvice });
        }
      }
    } else state.clock = null;

    // 6. notes programmées en retard (interface ou onglet bloqués)
    const late = snap.scheduling ? snap.scheduling.lateSteps : 0;
    const dLate = prev && late >= (prev.late || 0) ? late - (prev.late || 0) : 0;
    if (snap.scheduling) c.maxLateMs = snap.scheduling.maxLateMs || 0;
    c.late = late;
    if (dLate > 0 && snap.playing) {
      add({ kind: 'late', level: 'warn', where: 'sched', title: 'Notes programmées en retard', detail: `${dLate} pas en retard (jusqu'à ${Math.round(snap.scheduling.maxLateMs)} ms) : l'interface a été bloquée.`, advice: env.hidden ? 'L\'onglet est en arrière-plan : le garder au premier plan pendant la lecture.' : 'Une action lourde (ouverture d\'une fenêtre, calcul, autre onglet) a bloqué la page. Si cela arrive en touchant un réglage de reverb, c\'est le calcul de la nouvelle réverbération.' });
    }

    // 7. son coupé : les pistes jouent, la somme du Master a du signal, mais la sortie est muette
    const expecting = snap.playing && (snap.voices > 0 || snap.juno > 0) && (env.masterVolume == null || env.masterVolume > 0.01);
    if (expecting && mi && mi.peak > 0.003 && snap.out && snap.out.peak < 1e-6) state.silentFor += dt;
    else state.silentFor = 0;
    if (state.silentFor >= CFG.silentSecs) {
      add({ kind: 'silent', level: 'bad', where: 'out', title: 'Son coupé en sortie', detail: 'Les pistes jouent et arrivent au Master, mais la sortie est muette.', advice: 'Réparé automatiquement (filtres et mastering remis à zéro). Si le son ne revient pas : Stop puis Lecture, puis vérifier la sortie audio du périphérique.' });
      actions.add('repair');
      state.silentFor = 0;
    }

    state.prev = { now, playing: snap.playing, clipped: snap.clipped, stats: snap.stats, late };
    return { added, actions: [...actions] };
  }

  /** Pire niveau des incidents récents : 'bad', 'warn' ou 'ok'. */
  function verdict(state, now, windowMs = 60000) {
    const recent = state.incidents.filter((x) => now - x.last < windowMs && !(x.fixed && x.level === 'bad' && now - x.last > 5000));
    if (recent.some((x) => x.level === 'bad')) return 'bad';
    if (recent.some((x) => x.level === 'warn')) return 'warn';
    return 'ok';
  }

  /**
   * Poids estimé de chaque élément de la chanson sur le moteur audio (unités arbitraires, ordre de grandeur des
   * mesures sur ordinateur portable). Aucune mesure réelle par piste n'existe dans le navigateur : c'est un guide.
   */
  function estimateLoad(project, opts = {}) {
    const out = [];
    const solo = project.tracks.some((t) => t.solo);
    const used = { plate: 0, hall: 0, echo: 0, space: 0 };
    for (const t of project.tracks) {
      if (t.mute || (solo && !t.solo)) continue;
      const fx = SS.fxParams(t);
      const mix = SS.mixParams(t);
      const name = t.name || 'Piste';
      let cost = t.type === 'drum' ? 0.4 : 0.8;
      const parts = [];
      if (t.type === 'instrument' && t.family === 'analog') {
        cost = 5;
        parts.push('synthé Juno');
      } else if (t.type === 'instrument' && t.sd) {
        const sd = SS.soundParams ? SS.soundParams(t) : t.sd;
        const voices = Math.max(1, sd.voices || 1);
        const heavyFilter = sd.ftype === 'ladder' || sd.ftype === 'sem';
        cost += 0.3 * voices + (heavyFilter ? 1.5 * voices : 0);
        if (heavyFilter) parts.push('filtre ' + (sd.ftype === 'ladder' ? 'ladder' : 'SEM'));
        if (voices > 1) parts.push(voices + ' voix par note');
      }
      if (fx.room > 0) {
        cost += 0.6 + 0.35 * fx.roomSize;
        parts.push(`reverb ${fx.roomSize.toFixed(1).replace('.', ',')} s`);
      }
      if (fx.delay > 0) {
        cost += 0.3;
        parts.push('delay');
      }
      if (fx.chorus > 0) {
        cost += 0.3;
        parts.push('chorus');
      }
      const inserts = ['eq', 'comp', 'lim', 'vcf'].filter((k) => mix[k] && mix[k].on).length;
      cost += 0.15 * inserts;
      for (const [k, r] of [['sendPlate', 'plate'], ['sendHall', 'hall'], ['sendEcho', 'echo'], ['sendSpace', 'space']]) if (fx[k] > 0) used[r]++;
      if (t.auto && Object.keys(t.auto).length) cost += 0.1; // automation : filtres et gains en plus
      out.push({ label: `« ${name} »` + (parts.length ? ' (' + parts.join(', ') + ')' : ''), cost, trackId: t.id });
    }
    const rp = SS.returnParams ? SS.returnParams(project) : null;
    if (used.space) out.push({ label: 'Reverb Cosmos partagée', cost: 4 + (rp && rp.space.shimmer > 0 ? 1.5 : 0) });
    if (used.hall) out.push({ label: 'Reverb Hall partagée', cost: 1.2 + 0.25 * (rp ? rp.hall.size : 2) });
    if (used.plate) out.push({ label: 'Reverb Plate partagée', cost: 0.8 + 0.25 * (rp ? rp.plate.size : 1) });
    if (used.echo) out.push({ label: 'Écho partagé', cost: 0.5 });
    const mp = SS.masterParams(project);
    if (mp.mastering.on) out.push({ label: 'Mastering', cost: 1.5 });
    if (mp.effects.on) {
      if (mp.effects.reverb.on && mp.effects.reverb.mix > 0) out.push({ label: 'Reverb du Master', cost: 1 });
      if (mp.effects.saturation.on && mp.effects.saturation.amount > 0) out.push({ label: 'Saturation du Master', cost: 0.6 });
    }
    if (opts.automix) out.push({ label: 'Auto Mix (analyse)', cost: 1.5 });
    const total = out.reduce((n, x) => n + x.cost, 0) || 1;
    out.forEach((x) => (x.share = x.cost / total));
    return out.sort((a, b) => b.cost - a.cost);
  }

  /* ---------------------------------------------------------------- surveillance en continu (navigateur) */

  let state = newState();
  let app = null;
  let timer = null;
  let lastActive = -Infinity;
  let lastSample = -Infinity;
  let lastRepair = -Infinity;
  let lastToast = -Infinity;
  const listeners = new Set();

  function sample() {
    if (!SS.audio || !SS.audio.probe) return;
    const now = performance.now();
    const playing = SS.audio.isPlaying();
    if (playing) lastActive = now;
    // à l'arrêt : un relevé par seconde pendant 10 s (fin des échos, emballement qui continue), puis plus rien
    if (!playing && (now - lastActive > 10000 || now - lastSample < 1000)) return;
    const snap = SS.audio.probe();
    if (!snap) return;
    lastSample = now;
    const project = app && app.project();
    const names = new Map(project ? project.tracks.map((t) => [t.id, t.name || 'Piste']) : []);
    let load = [];
    try {
      load = project ? estimateLoad(project, { automix: !!(SS.automixListen && SS.automixListen.listening()) }) : [];
    } catch (e) {
      load = [];
    }
    const masterVolume = project ? SS.masterParams(project).volume : null;
    const r = assess(state, snap, { now, names, load, masterVolume, hidden: document.hidden });
    if (r.actions.includes('resume')) SS.audio.ensureCtx();
    if (r.actions.includes('repair') && now - lastRepair > 2000) {
      lastRepair = now;
      const n = SS.audio.repair();
      // second passage : les valeurs invalides encore en route pendant la réparation rebloqueraient le Master
      setTimeout(() => SS.audio.repair(), 300);
      for (const inc of state.incidents) if (now - inc.last < 1000 && (inc.kind === 'nan' || inc.kind === 'silent' || inc.kind === 'crash')) inc.fixed = `Réparé automatiquement (${n} étages remis à zéro)`;
    }
    const grave = r.added.find((x) => x.level === 'bad');
    if (grave && now - lastToast > 12000 && SS.ui && SS.ui.toast && !(SS.systemPanel && SS.systemPanel.isOpen && SS.systemPanel.isOpen())) {
      lastToast = now;
      SS.ui.toast(`Audio : ${grave.title}`, 7000, { label: 'Diagnostic', run: () => SS.systemPanel.open() });
    }
    listeners.forEach((fn) => fn(state, snap));
  }

  function start(options) {
    app = options;
    if (!timer) timer = setInterval(sample, 250);
  }

  return {
    CFG,
    newState,
    assess,
    verdict,
    estimateLoad,
    start,
    state: () => state,
    counters: () => state.counters,
    markSeen: () => (state.unseen = 0),
    clear: () => {
      state.incidents = [];
      state.unseen = 0;
      listeners.forEach((fn) => fn(state, null));
    },
    /** Réparation demandée depuis la fenêtre Système. */
    repair: () => {
      lastRepair = performance.now();
      return SS.audio.repair();
    },
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    _sample: sample,
  };
})();
