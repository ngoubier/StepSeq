/*
 * Surveillance audio automatique : pendant la lecture (et quelques secondes après), relève 4 fois par seconde
 * les niveaux de chaque étage du moteur (pistes, delays, reverbs, retours partagés, somme du Master, sortie),
 * les événements des modules audio et l'horloge de la sortie, puis détecte et nomme les problèmes :
 *   - signal invalide (NaN / infini) : coupe le son jusqu'à réparation ; on cherche l'étage d'origine ;
 *   - emballement (delay, écho, résonance) : un étage monte bien au-dessus de 0 dBFS ;
 *   - Master trop chaud, écrêtage de la sortie (grésillement) ;
 *   - décrochages du moteur audio (processeur saturé), notes programmées en retard (interface bloquée) ;
 *   - module audio planté, sortie interrompue, son coupé alors que les pistes jouent.
 * Les pannes qui coupent le son sont réparées automatiquement (SS.audio.repair). En cas de surcharge (décrochages,
 * notes en retard à répétition), le mode allégé coupe temporairement ce qui ralentit (SS.audio.setLight : effets,
 * reverbs, bus partagés, EQ / compresseurs / limiteurs, effets du Master, mastering, analyse de l'Auto Mix) jusqu'à
 * l'arrêt de la lecture. Les incidents s'affichent dans la fenêtre Système ; un incident grave affiche aussi une
 * notification.
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
    settle: 4000, // mode Diagnostic : attente après un allègement avant d'en décider un autre (ms)
    maxSteps: 8, // mode Diagnostic : allègements ciblés au plus, ensuite mode allégé complet
    journal: 500, // lignes gardées dans le journal de débogage
    warmup: 1500, // début de lecture : les décrochages du démarrage de la sortie (Android) ne déclenchent pas d'allègement (ms)
    lightCheck: 8000, // mode allégé : délai après lequel on juge s'il a fait cesser les décrochages (ms)
    lightUseless: 3, // décrochages encore relevés pendant ce délai : la surcharge ne vient pas du moteur
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
      if (inc.level === 'bad' && same.level !== 'bad') Object.assign(same, { level: 'bad', title: inc.title }); // aggravation
      return null;
    }
    const full = { id: state.next++, key, count: 1, at: now, last: now, fixed: null, ...inc };
    state.incidents.unshift(full);
    if (state.incidents.length > CFG.keep) state.incidents.length = CFG.keep;
    state.unseen++;
    return full;
  }

  const externalAdvice = 'Essayer sans casque ou enceinte Bluetooth, désactiver l\'économie d\'énergie (et le mode « Performances optimisées » éventuel) et l\'optimisation de batterie de Chrome, fermer les applications en arrière-plan, puis recharger la page.';

  /**
   * Bilan du mode allégé automatique : a-t-il fait cesser les décrochages ? `light` : { at, underruns } au moment où il
   * a été activé ; `underruns` : compteur actuel ; `juno` : synthés Juno actifs (en mode éco pendant le mode allégé, mais toujours joués).
   * 'wait' tant que le délai n'est pas écoulé, puis 'ok', 'synths' (les synthés restent trop lourds) ou 'useless'
   * (presque plus rien à calculer : la sortie de l'appareil décroche d'elle-même).
   */
  function lightVerdict(light, now, underruns, juno = 0) {
    if (!light || now - light.at < CFG.lightCheck) return 'wait';
    if (underruns - light.underruns < CFG.lightUseless) return 'ok';
    return juno > 0 ? 'synths' : 'useless';
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  const when = (ms) => {
    if (!ms) return '?';
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  /** Description d'une origine : « type — détails ». */
  function originText(o) {
    if (!o) return 'inconnue (chargée avant le début du journal, ou chemin non instrumenté)';
    const d = o.detail ? Object.entries(o.detail).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ') : '';
    return `${o.kind}${d ? ' — ' + d : ''}${o.before ? ` (au départ : ${o.before.kind})` : ''}`;
  }
  /** Brouillon de l'assistant rangé dans le projet (project.wizard) : style, inspiration, étape, dates. */
  function draftText(w) {
    if (!w || !w.state) return null;
    const st = w.state;
    const parts = [st.mode === 'cover' ? 'reprise' : 'création', `style ${st.styleId || '?'}`, `inspiration ${st.presetId || '?'}`, `étape ${st.w && st.w.step != null ? st.w.step : '?'}`];
    if (w.createdAt) parts.push(`chanson créée ${when(w.createdAt)}`);
    parts.push(`brouillon enregistré ${when(w.savedAt)}`);
    return parts.join(', ');
  }
  /**
   * Résumé d'un projet pour le journal : titre, identifiant, contenu, brouillon de l'assistant et origine.
   * Fonction pure (testée sous Node).
   */
  function projectSummary(p, origin) {
    if (!p) return 'aucun projet';
    const tracks = p.tracks || [];
    const n = (f) => tracks.filter(f).length;
    const juno = n((t) => t.type === 'instrument' && t.family === 'analog');
    const drums = n((t) => t.type === 'drum');
    const listen = tracks.some((t) => String(t.id).startsWith('bw·'));
    const parts = [
      `« ${p.title || 'sans titre'} » [${p.id || '?'}]`,
      `tempo ${p.tempo}`,
      `${tracks.length} piste(s) (Juno ${juno}, batterie ${drums}, autres ${tracks.length - juno - drums})`,
      `${(p.scenes || []).length} scène(s)`,
      `${(p.song || []).length} bloc(s)`,
      `mode ${p.playMode || 'pattern'}`,
    ];
    if (listen) parts.push('pistes d\'écoute de l\'assistant (bw·)');
    const dr = draftText(p.wizard);
    if (dr) parts.push(`brouillon d'assistant : ${dr}`);
    parts.push(`origine : ${originText(origin)}`);
    return parts.join(' · ');
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
   * masterVolume, hidden, latency ('interactive' | 'playback') }. Renvoie { added: incidents nouveaux, actions: ['repair' | 'resume'] }.
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
    const latencyTip = env.latency === 'interactive' ? ' Le plus efficace : régler la latence sur « Lecture sûre » (fenêtre Système).' : '';
    const underAdvice = env.external
      ? `Les coupures continuent même effets coupés : elles viennent de la sortie audio de l'appareil, pas des calculs de StepSeq. ${externalAdvice}`
      : `Le processeur ne calcule pas le son assez vite.${latencyTip} ${lighten} Fermer les autres onglets et applications ; sur un portable, brancher le secteur.`;
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

  /**
   * Incident de ce relevé qui justifie un allègement : de vrais décrochages du moteur audio (pas une simple pointe).
   * Les notes programmées en retard n'en déclenchent plus : elles viennent de la page bloquée, pas du processeur
   * audio, et raccourcir une reverb recalcule sa réponse dans la page, ce qui créait de nouveaux retards, donc un
   * nouvel allègement… (cascade observée sur Blinding Lights, 2026-11-20). Elles restent signalées comme incident.
   */
  function overload(state, now) {
    return state.incidents.find((x) => x.last === now && x.kind === 'underrun' && x.level === 'bad') || null;
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

  /* ---------------------------------------------------------------- Mode Diagnostic : allègement pas à pas */

  const sec = (v) => v.toFixed(1).replace('.', ',') + ' s';
  /**
   * Prochaines étapes d'allègement possibles, de l'élément le plus lourd au plus léger (fonction pure).
   * `relief` = SS.audio.reliefState() ({ tracks: { id: { roomSize, cut } }, returns: { k: { size, shimmer, cut } }, juno }).
   * Les synthés Juno passent en mode éco (une seule marche : ils restent joués).
   * Chaque élément descend une marche à la fois : reverb raccourcie (moitié, au moins 0,8 s) puis coupée ;
   * Cosmos : shimmer coupé puis bus coupé ; Hall / Plate : raccourcies (au moins 1 s) puis coupées ; delay, chorus,
   * écho : coupés. `cost` = poids actuel de l'élément (même échelle qu'estimateLoad).
   * Renvoie [{ key, target, patch, label, what, cost, cut }].
   */
  function reliefSteps(project, relief = {}) {
    const rt = relief.tracks || {};
    const rr = relief.returns || {};
    const steps = [];
    const solo = project.tracks.some((t) => t.solo);
    const used = { plate: 0, hall: 0, echo: 0, space: 0 };
    for (const t of project.tracks) {
      if (t.mute || (solo && !t.solo)) continue;
      const fx = SS.fxParams(t);
      const r = rt[t.id] || {};
      const cut = r.cut || {};
      const name = `« ${t.name || 'Piste'} »`;
      const target = { track: t.id };
      if (fx.room > 0 && !cut.room) {
        const size = Math.min(fx.roomSize, r.roomSize != null ? r.roomSize : Infinity);
        const cost = 0.6 + 0.35 * size;
        const next = Math.round(Math.max(0.8, size / 2) * 10) / 10;
        if (size > 1 && next < size - 0.05) steps.push({ key: 'room:' + t.id, target, patch: { roomSize: next }, what: `Reverb de ${name}`, label: `Reverb de ${name} raccourcie : ${sec(size)} → ${sec(next)}`, cost });
        else steps.push({ key: 'room:' + t.id, target, patch: { cut: 'room' }, what: `Reverb de ${name}`, label: `Reverb de ${name} coupée`, cost, cut: true });
      }
      if (fx.delay > 0 && !cut.delay) steps.push({ key: 'delay:' + t.id, target, patch: { cut: 'delay' }, what: `Delay de ${name}`, label: `Delay de ${name} coupé`, cost: 0.3, cut: true });
      if (fx.chorus > 0 && !cut.chorus) steps.push({ key: 'chorus:' + t.id, target, patch: { cut: 'chorus' }, what: `Chorus de ${name}`, label: `Chorus de ${name} coupé`, cost: 0.3, cut: true });
      for (const [k, ret] of [['sendPlate', 'plate'], ['sendHall', 'hall'], ['sendEcho', 'echo'], ['sendSpace', 'space']]) if (fx[k] > 0) used[ret]++;
      // automation : envois vers Hall, Écho et Cosmos
      if (t.auto) for (const [k, ret] of [['reverb', 'hall'], ['echo', 'echo'], ['space', 'space']]) if (t.auto[k]) used[ret]++;
    }
    const rp = SS.returnParams ? SS.returnParams(project) : SS.RETURN_DEFAULTS;
    const ret = (k) => rr[k] || {};
    if (used.space && !ret('space').cut) {
      const shimmer = ret('space').shimmer === 0 ? 0 : rp.space.shimmer;
      const cost = 4 + (shimmer > 0 ? 1.5 : 0);
      if (shimmer > 0) steps.push({ key: 'ret:space', target: { ret: 'space' }, patch: { shimmer: 0 }, what: 'Reverb Cosmos partagée', label: 'Shimmer de la Reverb Cosmos coupé', cost });
      else steps.push({ key: 'ret:space', target: { ret: 'space' }, patch: { cut: true }, what: 'Reverb Cosmos partagée', label: 'Reverb Cosmos (bus partagé) coupée', cost, cut: true });
    }
    for (const [k, base, label] of [['hall', 1.2, 'Hall'], ['plate', 0.8, 'Plate']]) {
      if (!used[k] || ret(k).cut) continue;
      const size = Math.min(rp[k].size, ret(k).size != null ? ret(k).size : Infinity);
      const cost = base + 0.25 * size;
      const next = Math.round(Math.max(1, size / 2) * 10) / 10;
      if (size > 1.2 && next < size - 0.05) steps.push({ key: 'ret:' + k, target: { ret: k }, patch: { size: next }, what: `Reverb ${label} partagée`, label: `Reverb ${label} (bus partagé) raccourcie : ${sec(size)} → ${sec(next)}`, cost });
      else steps.push({ key: 'ret:' + k, target: { ret: k }, patch: { cut: true }, what: `Reverb ${label} partagée`, label: `Reverb ${label} (bus partagé) coupée`, cost, cut: true });
    }
    // synthés Juno : le plus lourd (6 voix suréchantillonnées chacun) ; le mode éco divise leur calcul par deux environ
    const junos = project.tracks.filter((t) => t.type === 'instrument' && t.family === 'analog' && !t.mute && !(solo && !t.solo)).length;
    if (junos && !relief.juno) steps.push({ key: 'juno', target: { juno: true }, patch: { eco: true }, what: `Synthés Juno (${junos})`, label: `Synthés Juno en mode éco (${junos} piste${junos > 1 ? 's' : ''} : 4 voix, sans suréchantillonnage)`, cost: 5 * junos });
    if (used.echo && !ret('echo').cut) steps.push({ key: 'ret:echo', target: { ret: 'echo' }, patch: { cut: true }, what: 'Écho partagé', label: 'Écho à bande (bus partagé) coupé', cost: 0.5, cut: true });
    return steps.sort((a, b) => b.cost - a.cost);
  }

  /** Décision du mode Diagnostic sur une surcharge : 'wait' (on laisse l'allègement précédent agir), 'step' ou 'light'. */
  function diagDecide(diag, now, steps) {
    if (diag.lastAt != null && now - diag.lastAt < CFG.settle) return { what: 'wait' };
    if (diag.done.length >= CFG.maxSteps || !steps.length) return { what: 'light' };
    return { what: 'step', step: steps[0] };
  }

  /* ---------------------------------------------------------------- surveillance en continu (navigateur) */

  let state = newState();
  let app = null;
  let timer = null;
  let lastActive = -Infinity;
  let lastSample = -Infinity;
  let lastRepair = -Infinity;
  let lastToast = -Infinity;
  let wasPlaying = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn(state, null));

  /* ---- journal de débogage (copié depuis la fenêtre Système, à transmettre pour corriger le code) ---- */
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const journal = [];
  const stamp = (now) => '+' + ((now - t0) / 1000).toFixed(2).padStart(8, ' ') + 's';
  function log(tag, text, now = performance.now()) {
    journal.push(`${stamp(now)} ${tag.padEnd(7, ' ')} ${text}`);
    if (journal.length > CFG.journal) journal.splice(0, journal.length - CFG.journal);
  }
  /* ---- origine des projets : d'où vient chaque chanson jouée ou chargée (journal, section « Origine ») ---- */
  const origins = new WeakMap(); // projet -> { kind, detail, at }
  /** Enregistre l'origine d'un projet (création, ouverture, import, assistant…) et la note dans le journal. */
  function setOrigin(project, info) {
    if (!project || !info) return;
    const prev = origins.get(project);
    const o = { ...info, at: performance.now() };
    if (prev && info.keep) o.before = prev.before ? prev.before : prev; // même objet modifié sur place : on garde la première origine
    delete o.keep;
    origins.set(project, o);
    log('PROJET', projectSummary(project, o));
  }
  let lastMetrics = -Infinity;
  let runAt = -Infinity; // début de la lecture en cours
  let external = false; // décrochages indépendants de la charge (mode allégé inefficace) pendant cette lecture
  /** Une ligne de mesures toutes les 2 s pendant la lecture : la tendance avant et après chaque allègement. */
  function logMetrics(snap, now) {
    if (!snap.playing || now - lastMetrics < 2000) return;
    lastMetrics = now;
    const c = state.counters;
    const r = snap.render;
    const parts = [
      r ? `charge moy ${Math.round(r.average * 100)}% pic ${Math.round(r.peak * 100)}% underrun ${(r.underrun * 100).toFixed(1)}%` : 'charge n/d',
      snap.stats && snap.stats.underrunEvents != null ? `underrunEvents ${snap.stats.underrunEvents}${snap.stats.underrunDuration != null ? ` (${Math.round(snap.stats.underrunDuration * 1000)} ms de trous)` : ''}` : null,
      snap.outputLatency != null ? `latence sortie ${Math.round(snap.outputLatency * 1000)} ms` : null,
      c.clockRatio != null ? `horloge ${(c.clockRatio * 100).toFixed(1)}%` : null,
      `décrochages ${c.underruns}`,
      `retards ${snap.scheduling ? snap.scheduling.lateSteps : 0} (max ${snap.scheduling ? Math.round(snap.scheduling.maxLateMs) : 0} ms, tick max ${snap.scheduling && snap.scheduling.maxTickMs != null ? Math.round(snap.scheduling.maxTickMs) : '?'} ms)`,
      `voix ${snap.voices} juno ${snap.juno}`,
      // filtres ladder / SEM encore vivants : doit rester proche du nombre de voix (sinon : fuite de nœuds)
      SS.filters && SS.filters.aliveCount ? `filtres ${SS.filters.aliveCount()}` : null,
      `sortie ${snap.out ? (snap.out.peak > 0 ? dB(snap.out.peak).toFixed(1) : '-inf') + ' dBFS' : '?'}`,
      snap.light ? 'ALLÉGÉ' : null,
      SS.juno && SS.juno.isEco && SS.juno.isEco() ? 'JUNO ÉCO' : null,
      diag.done.length ? `allègements ${diag.done.length}` : null,
    ];
    log('MESURE', parts.filter(Boolean).join(' · '), now);
  }

  /* ---- mode Diagnostic ---- */
  const DIAG_KEY = 'ss.diagMode';
  const diag = { done: [], lastAt: null, checked: true, base: null, declined: false, waitLogged: 0, overloads: 0 }; // overloads : relevés en surcharge (toutes sources)
  function diagMode() {
    try {
      return localStorage.getItem(DIAG_KEY) !== '0';
    } catch (e) {
      return true;
    }
  }
  function setDiagMode(on) {
    try {
      localStorage.setItem(DIAG_KEY, on ? '1' : '0');
    } catch (e) {
      /* session seulement */
    }
    log('MODE', 'Mode Diagnostic ' + (on ? 'activé' : 'désactivé'));
  }
  /** Applique la prochaine marche d'allègement ciblé ; renvoie l'étape, ou null. */
  function relieveStep(step, reason, now) {
    if (!SS.audio || !SS.audio.setRelief) return null;
    SS.audio.setRelief(step.target, step.patch);
    const prevStep = diag.done[diag.done.length - 1];
    if (prevStep && prevStep.ok == null) {
      prevStep.ok = false; // la surcharge a continué après l'attente : l'étape précédente n'a pas suffi
      log('BILAN', `#${diag.done.length} ${prevStep.label} → insuffisant : surcharge encore ${Math.round((now - prevStep.at) / 100) / 10} s après`, now);
    }
    const entry = { at: now, key: step.key, label: step.label, what: step.what, cut: !!step.cut, reason, ok: null };
    diag.done.push(entry);
    diag.lastAt = now;
    diag.checked = false;
    diag.base = null;
    log('ACTION', `#${diag.done.length} ${step.label} (cause : ${reason} ; poids estimé ${step.cost.toFixed(2)} ; patch ${JSON.stringify(step.patch)} ; cible ${JSON.stringify(step.target)})`, now);
    raise(state, {
      kind: 'relief',
      level: 'info',
      where: 'relief:' + diag.done.length + ':' + step.key,
      title: `Mode Diagnostic : ${step.label}`,
      detail: `${reason} : ${step.what} est l'élément le plus lourd encore actif ; ${step.cut ? 'il est coupé (plus aucun calcul)' : 'il est allégé'} pour soulager le processeur. Le réglage de la chanson n'est pas modifié.`,
      advice: step.cut ? 'Pour le garder sans décrochage : choisir la latence « Lecture sûre », ou alléger un autre élément. « Rétablir » remet tout.' : 'Si les décrochages continuent, l\'étape suivante le coupera. « Rétablir » remet tout.',
    }, now);
    notify();
    return entry;
  }
  /** Retire tous les allègements ciblés. `manual` : demandé par l'utilisateur (plus d'allègement pendant cette lecture). */
  function clearRelief(manual) {
    const n = SS.audio && SS.audio.clearRelief ? SS.audio.clearRelief() : 0;
    if (manual && SS.audio.isPlaying()) diag.declined = true;
    if (diag.done.length) log('RETOUR', `${diag.done.length} allègement(s) retiré(s)${manual ? ' à la main' : ''}`);
    for (const inc of state.incidents) if (inc.kind === 'relief' && !inc.fixed) inc.fixed = 'Rétabli';
    diag.done = [];
    diag.lastAt = null;
    diag.checked = true;
    notify();
    return n;
  }
  /**
   * Après un allègement : la surcharge a-t-elle cessé ? Les premières secondes ne comptent pas (calcul de la
   * nouvelle réverbération, queues d'effet) : on relève les décrochages entre `settle` et `2 × settle`.
   */
  function diagCheck(now, playing) {
    if (diag.checked || diag.lastAt == null || !playing) return;
    const since = now - diag.lastAt;
    if (since < CFG.settle) return;
    if (diag.base == null) {
      diag.base = diag.overloads;
      return;
    }
    if (since < CFG.settle * 2) return;
    diag.checked = true;
    const last = diag.done[diag.done.length - 1];
    const more = Math.max(0, diag.overloads - diag.base);
    diag.base = null;
    last.ok = more === 0;
    log('BILAN', `#${diag.done.length} ${last.label} → ${more === 0 ? `efficace : aucun décrochage entre ${CFG.settle / 1000} et ${(2 * CFG.settle) / 1000} s après` : more + ' relevé(s) encore en surcharge : insuffisant'}`, now);
    if (more === 0 && SS.ui && SS.ui.toast) SS.ui.toast(`Diagnostic : son stable après « ${last.label} »`, 4000);
  }
  /** Surcharge en mode Diagnostic : une marche de plus, ou le mode allégé complet en dernier recours. */
  function diagOverload(slow, project, now) {
    const reason = 'Processeur saturé';
    let steps = [];
    try {
      steps = project ? reliefSteps(project, SS.audio.reliefState ? SS.audio.reliefState() : {}) : [];
    } catch (e) {
      log('ERREUR', 'reliefSteps : ' + (e && e.message), now);
    }
    const d = diagDecide(diag, now, steps);
    if (d.what === 'wait') {
      if (now - diag.waitLogged > 1000) {
        diag.waitLogged = now;
        log('ATTENTE', `${reason} pendant l'effet de l'allègement #${diag.done.length} (${Math.round((now - diag.lastAt) / 100) / 10} s / ${CFG.settle / 1000} s)`, now);
      }
      return;
    }
    if (d.what === 'step') {
      const e = relieveStep(d.step, reason, now);
      if (e && SS.ui && SS.ui.toast) {
        lastToast = now;
        SS.ui.toast(`Diagnostic (${reason.toLowerCase()}) : ${d.step.label}`, 7000, { label: 'Rétablir', run: () => clearRelief(true) });
      }
      return;
    }
    if (!autoLight()) {
      if (now - diag.waitLogged > 5000) {
        diag.waitLogged = now;
        log('ACTION', `plus d'allègement ciblé possible (${diag.done.length} fait(s)) ; allègement automatique désactivé : rien de plus`, now);
      }
      return;
    }
    log('ACTION', `plus d'allègement ciblé possible (${diag.done.length} fait(s), ${steps.length} restant(s)) → mode allégé complet`, now);
    if (lighten(reason + ' malgré les allègements ciblés', true) && SS.ui && SS.ui.toast) {
      lastToast = now;
      SS.ui.toast('Processeur toujours saturé : tous les effets et le mastering coupés temporairement', 8000, { label: 'Rétablir', run: () => restore(true) });
    }
  }

  /** Journal complet à copier : contexte, chanson, poids estimé, allègements, puis les événements horodatés. */
  function debugLog() {
    const L = [];
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const editor = app && app.project();
    const project = watched() === editor && lastPlayed ? lastPlayed : watched();
    const other = project && project !== editor;
    L.push('### STEPSEQ-DEBUG v1 ###');
    L.push(`date ${new Date().toISOString()} · page ouverte depuis ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    L.push(`navigateur ${nav.userAgent || '?'}`);
    L.push(`cœurs ${nav.hardwareConcurrency || '?'} · mémoire ${nav.deviceMemory || '?'} Gio · onglet ${typeof document !== 'undefined' && document.hidden ? 'arrière-plan' : 'premier plan'}`);
    const a = SS.audio && SS.audio.diagnostics ? SS.audio.diagnostics() : null;
    const lat = SS.audio && SS.audio.latency ? SS.audio.latency() : {};
    if (a && a.context) L.push(`audio ${a.context.state} · ${a.context.sampleRate} Hz · latence pref ${lat.pref} active ${lat.active} · base ${(a.context.baseLatency * 1000).toFixed(1)} ms · sortie ${(a.context.outputLatency * 1000).toFixed(1)} ms`);
    else L.push('audio non démarré');
    const pv = state.prev;
    L.push(`mesures : renderCapacity ${state.counters.load ? 'oui' : 'non/pas encore'} · playbackStats ${pv && pv.stats && pv.stats.underrunEvents != null ? 'oui' : 'non/pas encore'} · repli horloge ${state.counters.clockRatio != null ? 'oui' : 'non'}`);
    if (a) L.push(`moteur : voix ${a.scheduledVoices} · filtres ladder/SEM ${a.filterNodes ?? '?'} · juno ${a.junoEngines} · bus ${a.buses} · mastering ${a.masteringReady ? 'chargé' : 'non'} · tick max ${Math.round(a.scheduling.maxTickMs || 0)} ms · retards ${a.scheduling.lateSteps}`);
    L.push(`modes : Diagnostic ${diagMode() ? 'ON' : 'OFF'} · allègement auto ${autoLight() ? 'ON' : 'OFF'} · allégé ${SS.audio && SS.audio.isLight && SS.audio.isLight() ? 'ACTIF' : 'non'} · Auto Mix ${SS.automixListen && SS.automixListen.listening() ? 'écoute' : 'arrêté'}`);
    const c = state.counters;
    L.push(`compteurs (depuis Lecture) : décrochages ${c.underruns} · écrêtage ${c.clipped} · retards ${c.late} (max ${Math.round(c.maxLateMs)} ms) · horloge ${c.clockRatio != null ? (c.clockRatio * 100).toFixed(1) + '%' : 'n/d'} · charge ${c.load ? Math.round(c.load.average * 100) + '/' + Math.round(c.load.peak * 100) + '%' : 'n/d'}`);
    if (project) {
      L.push('', `## Chanson${other ? ' (jouée en dernier : écoute de l\'assistant, pas la chanson de l\'éditeur)' : ''} : tempo ${project.tempo} · ${project.tracks.length} piste(s) · ${(project.scenes || []).length} scène(s) · ${(project.song || []).length} bloc(s)`);
      const solo = project.tracks.some((t) => t.solo);
      for (const t of project.tracks) {
        const fx = SS.fxParams(t);
        const mix = SS.mixParams(t);
        const sd = t.sd ? (SS.soundParams ? SS.soundParams(t) : t.sd) : null;
        const fxs = [];
        if (fx.room > 0) fxs.push(`reverb ${fx.room.toFixed(2)} ${fx.roomSize.toFixed(1)}s`);
        if (fx.delay > 0) fxs.push(`delay ${fx.delay.toFixed(2)} fb ${fx.delayFeedback.toFixed(2)}`);
        if (fx.chorus > 0) fxs.push(`chorus ${fx.chorus.toFixed(2)}`);
        for (const k of ['sendPlate', 'sendHall', 'sendEcho', 'sendSpace']) if (fx[k] > 0) fxs.push(`${k} ${fx[k].toFixed(2)}`);
        const ins = ['eq', 'comp', 'lim', 'vcf'].filter((k) => mix[k] && mix[k].on);
        const off = t.mute || (solo && !t.solo);
        L.push(`- [${t.id}] « ${t.name || 'Piste'} » ${t.type}/${t.family || '-'}/${t.instrument || '-'}${off ? ' (muette)' : ''}${sd ? ` · voix ${sd.voices || 1} filtre ${sd.ftype || '-'}` : ''} · fx: ${fxs.join(', ') || 'aucun'} · inserts: ${ins.join('+') || 'aucun'}${t.auto && Object.keys(t.auto).length ? ' · automation: ' + Object.keys(t.auto).join('+') : ''}`);
      }
      const rp = SS.returnParams(project);
      L.push(`retours : plate ${rp.plate.size}s · hall ${rp.hall.size}s · cosmos decay ${rp.space.decay} shimmer ${rp.space.shimmer} freeze ${rp.space.freeze} · écho fb ${rp.echo.feedback}`);
      const mp = SS.masterParams(project);
      L.push(`master : mastering ${mp.mastering.on ? 'on' : 'off'} · effets ${mp.effects.on ? ['saturation', 'chorus', 'reverb'].filter((k) => mp.effects[k].on).join('+') || 'aucun' : 'off'} · inserts ${['eq', 'comp', 'lim', 'vcf'].filter((k) => mp.mix[k] && mp.mix[k].on).join('+') || 'aucun'}`);
      try {
        L.push('', '## Poids estimé', ...estimateLoad(project, { automix: !!(SS.automixListen && SS.automixListen.listening()) }).map((x) => `- ${x.label} : ${x.cost.toFixed(2)} (${Math.round(x.share * 100)}%)`));
        L.push('', '## Prochains allègements possibles', ...(reliefSteps(project, SS.audio.reliefState ? SS.audio.reliefState() : {}).map((x) => `- ${x.label} (poids ${x.cost.toFixed(2)})`)));
      } catch (e) {
        L.push('erreur estimation : ' + (e && e.message));
      }
    }
    L.push('', '## Origine des projets');
    L.push(`- chanson jouée${project === editor ? ' (= chanson de l\'éditeur)' : ''} : ${projectSummary(project, project && origins.get(project))}`);
    if (editor && editor !== project) L.push(`- chanson de l'éditeur : ${projectSummary(editor, origins.get(editor))}`);
    if (SS.band && SS.band.active && SS.band.active()) L.push('- assistant « Nouvelle chanson » ouvert');
    L.push('', '## Allègements ciblés en cours');
    if (!diag.done.length) L.push('- aucun');
    for (const [i, d] of diag.done.entries()) L.push(`- #${i + 1} ${stamp(d.at)} ${d.label} · cause ${d.reason} · ${d.ok == null ? 'bilan en attente' : d.ok ? 'efficace' : 'insuffisant'}`);
    if (SS.audio && SS.audio.reliefState) L.push('état moteur : ' + JSON.stringify(SS.audio.reliefState()));
    L.push('', '## Incidents');
    for (const x of state.incidents.slice(0, 20)) L.push(`- ${stamp(x.at)}…${stamp(x.last)} [${x.level}] ${x.kind}@${x.where} ×${x.count} ${x.title} — ${x.detail}${x.fixed ? ' ✓ ' + x.fixed : ''}`);
    L.push('', '## Journal');
    L.push(...(journal.length ? journal : ['(vide : lancer la lecture)']));
    L.push('### FIN STEPSEQ-DEBUG ###');
    return L.join('\n');
  }

  /* ---- mode allégé ---- */
  const AUTO_KEY = 'ss.autoLight';
  let lightInfo = null; // { at, auto, reason, automix } tant que le mode allégé est actif
  let lastRun = 0;
  let declined = false; // effets rétablis à la main pendant cette lecture : pas de nouvel allègement automatique
  function autoLight() {
    try {
      return localStorage.getItem(AUTO_KEY) !== '0';
    } catch (e) {
      return true;
    }
  }
  function setAutoLight(on) {
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch (e) {
      /* stockage indisponible : réglage pour cette session seulement */
    }
  }
  /** Coupe temporairement ce qui ralentit. `reason` : cause affichée ; `auto` : décidé par la surveillance. */
  function lighten(reason, auto) {
    if (!SS.audio || !SS.audio.setLight || SS.audio.isLight()) return 0;
    const now = performance.now();
    const n = SS.audio.setLight(true);
    // l'analyse de l'Auto Mix tire des analyseurs sur toute la chaîne : en pause pendant le mode allégé
    const automix = !!(SS.automixListen && SS.automixListen.listening());
    if (automix) SS.automixListen.stop();
    lightInfo = { at: now, auto: !!auto, reason, automix, underruns: state.counters.underruns, judged: false };
    log('ALLÉGÉ', `activé (${auto ? 'auto' : 'manuel'}) : ${reason || '?'} · ${n} étages contournés${automix ? ' · Auto Mix suspendu' : ''}`, now);
    const inc = raise(state, {
      kind: 'light',
      level: 'info',
      where: 'light',
      title: 'Mode allégé : effets coupés temporairement',
      detail: `${reason ? reason + ' : ' : ''}reverbs, delays, chorus, envois et bus partagés, égaliseurs, compresseurs et limiteurs des pistes et du Master, effets du Master, mastering${automix ? ' et analyse de l’Auto Mix' : ''} sont contournés et les synthés Juno passent en mode éco (4 voix, sans suréchantillonnage) pour soulager le processeur. Les réglages ne sont pas modifiés.`,
      advice: auto ? 'Tout revient à l’arrêt de la lecture, ou tout de suite avec « Rétablir les effets ». Sans limiteur, baisser le Master si le son sature.' : 'Tout revient avec « Rétablir les effets ». Sans limiteur, baisser le Master si le son sature.',
    }, now);
    if (!inc) {
      const same = state.incidents.find((x) => x.kind === 'light');
      if (same) same.fixed = null;
    }
    notify();
    return n;
  }
  /** Rétablit tous les effets. `manual` : demandé par l'utilisateur (pas de nouvel allègement pendant cette lecture). */
  function restore(manual) {
    if (!SS.audio || !SS.audio.isLight || !SS.audio.isLight()) return 0;
    const n = SS.audio.setLight(false);
    if (lightInfo && lightInfo.automix && SS.automixPanel && SS.automixPanel._state().mode && SS.automixListen) SS.automixListen.start();
    if (manual && SS.audio.isPlaying()) declined = true;
    const inc = state.incidents.find((x) => x.kind === 'light' && !x.fixed);
    if (inc) inc.fixed = manual ? 'Effets rétablis' : 'Effets rétablis à l\'arrêt de la lecture';
    log('ALLÉGÉ', `quitté (${manual ? 'à la main' : 'arrêt de la lecture'}) · ${n} étages rétablis`);
    lightInfo = null;
    notify();
    return n;
  }

  function sample() {
    if (!SS.audio || !SS.audio.probe) return;
    const now = performance.now();
    const playing = SS.audio.isPlaying();
    const stopped = !playing && !(SS.audio.isPaused && SS.audio.isPaused());
    if (stopped) {
      declined = false;
      // allègement automatique : il ne vaut que pour la lecture pendant laquelle le processeur a saturé
      if (lightInfo && lightInfo.auto) restore(false);
    }
    if (playing) {
      lastActive = now;
      if (SS.load) SS.load.playing(); // la mesure du calcul s'arrête pendant la lecture
    }
    // à l'arrêt : un relevé par seconde pendant 10 s (fin des échos, emballement qui continue), puis plus rien
    if (!playing && (now - lastActive > 10000 || now - lastSample < 1000)) return;
    const snap = SS.audio.probe();
    if (!snap) return;
    // nouvelle lecture, même relancée aussitôt après Stop : l'allègement automatique de la précédente prend fin
    if (snap.run !== lastRun) {
      lastRun = snap.run;
      runAt = now;
      external = false;
      declined = false;
      diag.declined = false;
      log('LECTURE', `départ #${snap.run} · ${snap.sampleRate} Hz · base ${((snap.baseLatency || 0) * 1000).toFixed(1)} ms · sortie ${((snap.outputLatency || 0) * 1000).toFixed(1)} ms${diag.done.length ? ' · ' + diag.done.length + ' allègement(s) ciblé(s) conservé(s)' : ''}`, now);
      if (lightInfo && lightInfo.auto) restore(false);
    }
    lastSample = now;
    const project = watched();
    if (snap.playing && project && project !== lastLogged) {
      lastLogged = project;
      log('PROJET', `joué : ${projectSummary(project, origins.get(project))}`, now);
    }
    const names = new Map(project ? project.tracks.map((t) => [t.id, t.name || 'Piste']) : []);
    let load = [];
    try {
      load = project ? estimateLoad(project, { automix: !!(SS.automixListen && SS.automixListen.listening()) }) : [];
    } catch (e) {
      load = [];
    }
    const masterVolume = project ? SS.masterParams(project).volume : null;
    const latency = SS.audio.latency ? SS.audio.latency().active : null;
    const r = assess(state, snap, { now, names, load, masterVolume, hidden: document.hidden, latency, external });
    if (snap.playing !== wasPlaying) {
      if (wasPlaying !== null) log('LECTURE', snap.playing ? 'reprise' : snap.paused ? 'pause' : 'arrêt', now);
      wasPlaying = snap.playing;
    }
    for (const x of r.added) log('INCIDENT', `[${x.level}] ${x.kind}@${x.where} ${x.title} — ${x.detail}`, now);
    // incident cumulé (même problème répété) : journalisé aussi, au plus une fois par seconde et par type
    for (const x of state.incidents) if (x.last === now && x.count > 1 && !r.added.includes(x) && now - (x.logged || 0) > 1000 && x.kind !== 'light' && x.kind !== 'relief') {
      x.logged = now;
      log('INCIDENT', `[${x.level}] ${x.kind}@${x.where} ×${x.count} ${x.detail}`, now);
    }
    logMetrics(snap, now);
    diagCheck(now, snap.playing);
    if (r.actions.includes('resume')) SS.audio.ensureCtx();
    if (r.actions.includes('repair') && now - lastRepair > 2000) {
      lastRepair = now;
      const n = SS.audio.repair();
      // second passage : les valeurs invalides encore en route pendant la réparation rebloqueraient le Master
      setTimeout(() => SS.audio.repair(), 300);
      for (const inc of state.incidents) if (now - inc.last < 1000 && (inc.kind === 'nan' || inc.kind === 'silent' || inc.kind === 'crash')) inc.fixed = `Réparé automatiquement (${n} étages remis à zéro)`;
    }
    const repairLog = r.actions.length ? r.actions.join('+') : null;
    if (repairLog) log('RÉPARE', repairLog, now);
    // mode Diagnostic : on allège d'abord l'élément le plus lourd, une marche à la fois, et on vérifie l'effet
    // mode allégé automatique sans effet : la sortie de l'appareil décroche d'elle-même, on rend les effets
    if (lightInfo && lightInfo.auto && !lightInfo.judged && snap.playing) {
      const v = lightVerdict(lightInfo, now, state.counters.underruns, snap.juno);
      if (v !== 'wait') {
        lightInfo.judged = true;
        const more = state.counters.underruns - lightInfo.underruns;
        const why = v === 'synths' ? `${snap.juno} synthé(s) Juno restent trop lourds, même en mode éco` : 'effets coupés et presque rien à calculer';
        log('BILAN', `mode allégé → ${v === 'ok' ? 'efficace' : `insuffisant : ${more} décrochage(s) en ${CFG.lightCheck / 1000} s, ${why}`}`, now);
        if (v === 'synths') {
          raise(state, { kind: 'synths', level: 'warn', where: 'juno', title: 'Synthés Juno trop lourds pour cet appareil', detail: `Les décrochages continuent effets coupés et synthés en mode éco (${more} en ${CFG.lightCheck / 1000} s) : ${snap.juno} synthé(s) Juno jouent ensemble.`, advice: 'Couper (Muet) une ou deux pistes Synthé pour écouter, ou les remplacer par un instrument échantillonné ; sur ordinateur, ces synthés passent sans peine.' }, now);
          notify();
        }
        if (v === 'useless') {
          external = true;
          restore(true);
          for (const inc of state.incidents) if (inc.kind === 'light' && inc.fixed) inc.fixed = 'Effets rétablis : le mode allégé ne supprimait pas les coupures';
          raise(state, { kind: 'external', level: 'warn', where: 'device', title: 'Coupures venant de l\'appareil', detail: `Les décrochages continuent effets coupés (${more} en ${CFG.lightCheck / 1000} s) : ils ne viennent pas de la charge de StepSeq mais de la sortie audio du système.`, advice: externalAdvice }, now);
          if (SS.ui && SS.ui.toast) {
            lastToast = now;
            SS.ui.toast('Coupures venant de l\'appareil, pas de StepSeq : effets rétablis', 8000, { label: 'Diagnostic', run: () => SS.systemPanel.open() });
          }
          notify();
        }
      }
    }
    // pas d'allègement sur les à-coups du démarrage de la sortie, ni quand on sait que la charge n'y est pour rien
    const over = snap.playing && !external && now - runAt >= CFG.warmup ? overload(state, now) : null;
    if (over) diag.overloads++;
    const diagSlow = over && !diag.declined && !declined && diagMode() && !SS.audio.isLight() ? over : null;
    if (diagSlow) diagOverload(diagSlow, project, now);
    const slow = !diagMode() && !declined && autoLight() && !SS.audio.isLight() ? over : null;
    if (slow && lighten('Processeur saturé', true)) {
      if (SS.ui && SS.ui.toast) {
        lastToast = now;
        SS.ui.toast('Processeur saturé : effets, reverbs, compression et mastering coupés temporairement', 8000, { label: 'Rétablir', run: () => restore(true) });
      }
    }
    // le son décroche : proposer de figer les pistes les plus lourdes (js/calcul.js), une fois par lecture
    let proposed = false;
    if (over && project && SS.load) proposed = SS.load.overloaded(project, snap.run);
    if (proposed) lastToast = now;
    const grave = r.added.find((x) => x.level === 'bad');
    if (grave && now - lastToast > 12000 && SS.ui && SS.ui.toast && !(SS.systemPanel && SS.systemPanel.isOpen && SS.systemPanel.isOpen())) {
      lastToast = now;
      SS.ui.toast(`Audio : ${grave.title}`, 7000, { label: 'Diagnostic', run: () => SS.systemPanel.open() });
    }
    listeners.forEach((fn) => fn(state, snap));
  }

  /** Chanson surveillée : celle qui joue (écoute de l'assistant « Nouvelle chanson » comprise), sinon celle de l'éditeur. */
  let lastLogged = null; // dernière chanson décrite par une ligne « PROJET joué »
  let lastPlayed = null; // dernière chanson jouée : le journal copié après Stop la décrit encore
  function watched() {
    const p = SS.audio && SS.audio.playingProject && SS.audio.playingProject();
    if (p) lastPlayed = p;
    return p || (app && app.project());
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
    overload,
    lightVerdict,
    projectSummary,
    setOrigin,
    origin: (p) => origins.get(p) || null,
    reliefSteps,
    diagDecide,
    diagMode,
    setDiagMode,
    clearRelief,
    relief: () => diag.done.map((d) => ({ ...d })),
    debugLog,
    log: (tag, text) => log(tag, text),
    start,
    lighten,
    restore,
    isLight: () => !!(SS.audio && SS.audio.isLight && SS.audio.isLight()),
    lightInfo: () => lightInfo,
    autoLight,
    setAutoLight,
    state: () => state,
    counters: () => state.counters,
    markSeen: () => (state.unseen = 0),
    clear: () => {
      state.incidents = [];
      state.unseen = 0;
      notify();
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
