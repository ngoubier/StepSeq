/*
 * Fenêtre Système : verdict sur la santé du son, jauges de la lecture, incidents détectés automatiquement
 * (js/audiowatch.js) avec leur origine et quoi faire, poids estimé des éléments de la chanson, puis les
 * détails techniques. Diagnostic local et léger : les mesures système indisponibles ne sont pas estimées.
 */
window.SS = window.SS || {};
SS.systemPanel = (() => {
  const unavailable = 'Non accessible';
  const mib = (v) => {
    if (!Number.isFinite(v)) return unavailable;
    const small = v > 0 && v < 1048576;
    return (v / (small ? 1024 : 1048576)).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + (small ? ' Kio' : ' Mio');
  };
  const ms = (v) => Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' ms' : unavailable;
  let app, dialog, timer = null, observer = null, lastPoll = 0, openedAt = 0;
  let blockCount = 0, maxBlock = 0, lag = 0, report = '', shownIncidents = '';
  const W = () => SS.audioWatch;
  const refs = {};
  const $ = (id) => document.getElementById(id);
  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function row(parent, id, label) {
    const dt = el('dt', label), dd = el('dd', '—');
    dd.dataset.metric = id;
    parent.append(dt, dd);
    refs[id] = dd;
  }
  function set(id, text) { if (refs[id].textContent !== String(text)) refs[id].textContent = text; }

  /** Les signaux sont des indices, pas une mesure de la charge CPU globale ou une preuve de coupure. */
  function warnings(a, signals = {}) {
    const list = [];
    if (signals.hidden) list.push('L’onglet est en arrière-plan : le navigateur peut ralentir la programmation des notes. Garder StepSeq au premier plan.');
    if (a.context && a.context.state !== 'running') list.push('Le moteur audio est interrompu ou suspendu. Relancer la lecture et vérifier la sortie audio du périphérique.');
    if (a.scheduling.lateSteps) list.push(`${a.scheduling.lateSteps} pas programmés en retard depuis le début de cette lecture (maximum ${ms(a.scheduling.maxLateMs)}). Des notes peuvent arriver en retard : essayer de réduire les synthés et effets, puis comparer avec Auto Mix arrêté.`);
    if (signals.lag > 80 || signals.maxBlock >= 100) list.push('L’interface a subi des blocages. Fermer les autres onglets et applications, puis comparer la lecture avec moins de fenêtres ouvertes.');
    if (signals.heapRatio > 0.85) list.push('Le tas JavaScript approche de sa limite. Recharger la page après avoir sauvegardé ; cette limite ne représente pas la RAM totale.');
    if ((a.output?.loudness?.tp ?? -Infinity) > 0 || a.output?.peak >= 1) list.push('Une crête de sortie atteint ou dépasse 0 dBFS : risque de saturation. Baisser le Master ou vérifier le limiteur.');
    if (a.failedAssets) list.push(`${a.failedAssets} son(s) n’ont pas pu être chargés. Vérifier la connexion puis relancer la lecture.`);
    if (a.loadingAssets) list.push(`${a.loadingAssets} son(s) sont encore en chargement. Attendre leur chargement avant de juger la lecture.`);
    if (!list.length) list.push(a.playing ? 'Aucune anomalie dans les mesures disponibles pour le moment. Si le son grésille, comparer avec moins de synthés et d’effets, désactiver Auto Mix, puis essayer la sortie filaire ou les haut-parleurs.' : 'Lancer la chanson et laisser cette fenêtre ouverte pendant les grésillements pour observer les retards et la charge du morceau.');
    return list;
  }

  const LEVEL = { bad: 'Grave', warn: 'À surveiller', info: 'Info' };
  function ago(now, t) {
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 60) return 'il y a ' + s + ' s';
    const m = Math.round(s / 60);
    return m < 60 ? 'il y a ' + m + ' min' : 'il y a ' + Math.round(m / 60) + ' h';
  }
  /** Bouton « Ouvrir les effets » d'un incident lié à une piste (delay, reverb, emballement). */
  function fxButton(inc) {
    const t = inc.trackId && app.project().tracks.find((x) => x.id === inc.trackId);
    if (!t || !SS.fx || !SS.fx.open || !/^(delay|reverb|bus)/.test(inc.where || '')) return null;
    const b = el('button', 'Ouvrir les effets de « ' + (t.name || 'Piste') + ' »', 'btn btn-small');
    b.type = 'button';
    b.addEventListener('click', () => { dialog.close(); SS.fx.open(t); });
    return b;
  }
  function renderIncidents(now, force) {
    const st = W().state();
    const sig = st.incidents.map((x) => x.id + ':' + x.count + ':' + (x.fixed ? 1 : 0)).join(',') + '|' + Math.floor(now / 5000);
    if (!force && sig === shownIncidents) return;
    shownIncidents = sig;
    const list = $('systemIncidents');
    $('systemClearIncidents').hidden = !st.incidents.length;
    if (!st.incidents.length) {
      list.replaceChildren(el('li', 'Aucun incident. La surveillance tourne dès que la lecture démarre : si le son grésille ou se coupe, la cause apparaîtra ici.', 'sys-empty'));
      return;
    }
    list.replaceChildren(...st.incidents.map((x) => {
      const li = el('li', null, 'sys-inc');
      li.dataset.level = x.level;
      li.dataset.kind = x.kind;
      const head = el('div', null, 'sys-inc-head');
      head.append(el('span', LEVEL[x.level] || x.level, 'sys-chip'), el('b', x.title), el('time', ago(now, x.last) + (x.count > 1 ? ' · ×' + x.count : '')));
      li.append(head, el('p', x.detail));
      if (x.advice) li.append(el('p', x.advice, 'sys-advice'));
      if (x.fixed) li.append(el('p', '✓ ' + x.fixed, 'sys-fixed'));
      const b = fxButton(x);
      if (b) li.append(b);
      return li;
    }));
  }
  function renderVerdict(a, now) {
    const st = W().state();
    const level = W().verdict(st, now);
    const box = $('systemVerdict');
    const recent = st.incidents.find((x) => x.level === level);
    let title, text;
    if (level === 'bad') {
      title = 'Problème détecté';
      text = recent.title + (recent.fixed ? ' — réparé automatiquement.' : '. ' + (recent.advice || ''));
    } else if (level === 'warn') {
      title = 'À surveiller';
      text = recent.title + '. ' + (recent.advice || '');
    } else if (a.playing) {
      title = 'Son stable';
      text = 'Aucun problème détecté pendant cette lecture.';
    } else {
      title = st.incidents.length ? 'Plus d’incident récent' : 'Prêt';
      text = 'Lance la lecture et joue avec les réglages : grésillements, emballements et coupures seront détectés et expliqués ici, même fenêtre fermée.';
    }
    const lvl = level === 'ok' ? (a.playing ? 'ok' : 'idle') : level;
    if (box.dataset.level !== lvl) box.dataset.level = lvl;
    if ($('systemVerdictTitle').textContent !== title) $('systemVerdictTitle').textContent = title;
    if ($('systemVerdictText').textContent !== text) $('systemVerdictText').textContent = text;
    return { title, text };
  }
  function renderGauges(a) {
    const c = W().counters();
    const pct = (v) => Math.round(v * 100) + ' %';
    if (c.load) {
      set('heroLoad', pct(c.load.average));
      setSub('heroLoad', 'pointe ' + pct(c.load.peak) + ' · mesurée par le navigateur');
    } else if (c.clockRatio != null && a.playing) {
      set('heroLoad', c.clockRatio >= W().CFG.clockRatio ? 'Stable' : 'Ralentie');
      setSub('heroLoad', 'horloge audio à ' + pct(Math.min(1, c.clockRatio)) + ' du temps réel');
    } else {
      set('heroLoad', '—');
      setSub('heroLoad', a.playing ? 'mesure en cours…' : 'pendant la lecture');
    }
    set('heroUnder', c.underruns);
    set('heroClip', c.clipped.toLocaleString('fr-FR'));
    set('heroLate', a.scheduling.lateSteps);
    for (const [id, bad] of [['heroUnder', c.underruns > 0], ['heroClip', c.clipped > 0], ['heroLate', a.scheduling.lateSteps > 0]]) refs[id].parentElement.classList.toggle('is-bad', bad);
  }
  function setSub(id, text) {
    const sub = refs[id].nextElementSibling;
    if (sub.textContent !== text) sub.textContent = text;
  }
  function renderLoad() {
    let load = [];
    try { load = W().estimateLoad(app.project(), { automix: !!SS.automixListen?.listening() }); } catch (e) { load = []; }
    const top = load.slice(0, 6);
    const sig = top.map((x) => x.label + x.cost.toFixed(2)).join('|');
    const box = $('systemLoad');
    if (box.dataset.sig === sig) return load;
    box.dataset.sig = sig;
    if (!top.length) {
      box.replaceChildren(el('li', 'Aucune piste audible.', 'sys-empty'));
      return load;
    }
    const max = top[0].cost;
    box.replaceChildren(...top.map((x) => {
      const li = el('li');
      const bar = el('span', null, 'sys-bar');
      bar.style.setProperty('--w', Math.max(4, Math.round((x.cost / max) * 100)) + '%');
      li.append(el('span', x.label, 'sys-load-label'), bar, el('span', Math.round(x.share * 100) + ' %', 'sys-load-share'));
      return li;
    }));
    return load;
  }

  function refresh() {
    if (!dialog.open) return;
    const now = performance.now();
    lag = lastPoll && !document.hidden ? Math.max(0, now - lastPoll - 1000) : 0;
    lastPoll = now;
    const a = SS.audio.diagnostics(), p = app.project();
    const heap = performance.memory;
    const heapRatio = heap?.jsHeapSizeLimit > 0 ? heap.usedJSHeapSize / heap.jsHeapSizeLimit : 0;
    const nav = navigator;
    const platform = nav.userAgentData?.platform || nav.platform || unavailable;
    set('device', platform + (nav.maxTouchPoints > 0 ? ' · tactile' : ''));
    set('browser', nav.userAgent);
    set('cores', nav.hardwareConcurrency ? nav.hardwareConcurrency + ' cœurs logiques annoncés' : unavailable);
    set('cpu', unavailable + ' dans le navigateur');
    set('ram', nav.deviceMemory ? '≈ ' + nav.deviceMemory + ' Gio (valeur arrondie et plafonnée)' : unavailable);
    set('ramFree', unavailable + ' dans le navigateur');
    set('heapUsed', heap ? mib(heap.usedJSHeapSize) + ' (estimation)' : unavailable);
    set('heapLimit', heap ? mib(heap.jsHeapSizeLimit) : unavailable);
    set('heapFree', heap ? mib(Math.max(0, heap.jsHeapSizeLimit - heap.usedJSHeapSize)) + ' (marge JS uniquement)' : unavailable);
    set('buffers', mib(a.bufferBytes));
    set('bufferCount', a.buffers + ' buffers · ' + a.loadingAssets + ' en chargement · ' + a.failedAssets + ' en échec');
    set('audioState', a.context ? a.context.state : 'Pas encore initialisé');
    set('rate', a.context ? (a.context.sampleRate / 1000).toLocaleString('fr-FR') + ' kHz' : '—');
    set('baseLatency', a.context ? ms(a.context.baseLatency * 1000) : '—');
    set('outLatency', a.context ? ms(a.context.outputLatency * 1000) : '—');
    set('mastering', a.masteringReady ? 'Chargé' : 'Non chargé');
    set('voices', a.scheduledVoices + ' (hors voix internes des synthés Juno)');
    set('truePeak', Number.isFinite(a.output?.loudness?.tp) ? a.output.loudness.tp.toFixed(1) + ' dBTP' : 'Mesure indisponible');
    set('peak', a.output ? (a.output.peak > 0 ? (20 * Math.log10(a.output.peak)).toFixed(1) : '−∞') + ' dBFS' : '—');
    set('lastLate', a.scheduling.lastLateAt != null ? 'Il y a ' + Math.floor((now - a.scheduling.lastLateAt) / 1000) + ' s' : 'Aucun depuis le début de la lecture');
    set('late', a.scheduling.lateSteps + ' · max. ' + ms(a.scheduling.maxLateMs));
    set('tick', ms(a.scheduling.maxTickMs) + ' · cycle prévu toutes les 25 ms');
    set('lag', ms(lag));
    set('blocks', observer ? blockCount + ' · max. ' + ms(maxBlock) : 'Mesure indisponible sur ce navigateur');
    const solo = p.tracks.some(t => t.solo);
    const audible = p.tracks.filter(t => !t.mute && (!solo || t.solo));
    set('tracks', p.tracks.length + ' · ' + audible.length + ' audibles');
    set('scenes', (p.scenes || []).length + ' · ' + (p.song || []).length + ' blocs de chanson');
    let modules = 0, effects = 0;
    for (const t of audible) {
      const mix = SS.mixParams(t), fx = SS.fxParams(t);
      modules += ['eq', 'comp', 'lim', 'vcf'].filter(k => mix[k]?.on).length;
      effects += ['chorus', 'delay', 'room', 'sendPlate', 'sendHall', 'sendEcho', 'sendSpace'].filter(k => fx[k] > 0).length;
    }
    set('modules', modules + ' inserts actifs sur les pistes audibles');
    set('effects', effects + ' effets / envois actifs sur les pistes audibles');
    const mix = SS.masterParams(p);
    const creative = mix.effects.on ? ['saturation', 'chorus', 'reverb'].filter(k => mix.effects[k].on && (mix.effects[k].amount ?? mix.effects[k].mix) > 0).length : 0;
    set('masterEffects', ['eq', 'comp', 'lim', 'vcf'].filter(k => mix.mix[k]?.on).length + ' inserts · ' + creative + ' effets · ' + (mix.mastering.on ? 'mastering actif' : 'mastering coupé'));
    set('juno', a.junoEngines + ' moteurs instanciés (6 voix chacun)');
    const mode = SS.automixPanel?._state().mode;
    set('automix', SS.automixListen?.listening() ? (mode === 'pilot' ? 'Pilote Auto' : 'Assistant') + ' · analyse active' : 'Arrêté');
    set('visibility', document.hidden ? 'En arrière-plan' : 'Au premier plan');
    const list = warnings(a, { hidden: document.hidden, lag, maxBlock, heapRatio });
    const verdict = renderVerdict(a, now);
    renderGauges(a);
    renderIncidents(now);
    const load = renderLoad();
    W().markSeen();
    updateBadge();
    $('systemDiagnosis').replaceChildren(...list.map(text => el('li', text)));
    const issues = a.scheduling.lateSteps > 0 || lag > 80 || maxBlock >= 100 || heapRatio > 0.85 || a.failedAssets > 0 || a.context && a.context.state !== 'running' || (a.output?.loudness?.tp ?? -Infinity) > 0 || a.output?.peak >= 1;
    const status = $('systemStatus');
    status.classList.toggle('has-issues', issues);
    const statusText = (a.paused ? 'En pause' : a.playing ? 'Lecture en cours' : 'Lecture arrêtée') + ' · ' + (issues ? 'Points à vérifier ci-dessous' : a.playing ? 'Surveillance en cours' : 'Surveillance prête');
    if (status.textContent !== statusText) status.textContent = statusText;
    set('assetList', a.largestAssets.length ? a.largestAssets.map(x => x.name + ' : ' + mib(x.bytes)).join('\n') : 'Aucun échantillon décodé');
    const incidents = W().state().incidents.map((x) => `- [${LEVEL[x.level] || x.level}] ${x.title} (${ago(now, x.last)}${x.count > 1 ? ', ×' + x.count : ''}) : ${x.detail}${x.advice ? ' → ' + x.advice : ''}${x.fixed ? ' ✓ ' + x.fixed : ''}`);
    report = [
      'StepSeq — Diagnostic Système', verdict.title + ' : ' + verdict.text, status.textContent, '',
      ...['heroLoad', 'heroUnder', 'heroClip', 'heroLate'].map((k) => refs[k].previousElementSibling.textContent + ' : ' + refs[k].textContent + ' (' + refs[k].nextElementSibling.textContent + ')'), '',
      'Incidents détectés :', ...(incidents.length ? incidents : ['- aucun']), '',
      'Poids estimé sur le moteur audio :', ...load.slice(0, 8).map((x) => '- ' + x.label + ' : ' + Math.round(x.share * 100) + ' %'), '',
      'Points à vérifier :', ...list.map((x) => '- ' + x), '',
      ...Object.entries(refs).filter(([k]) => !k.startsWith('hero')).map(([, e]) => e.previousElementSibling.textContent + ' : ' + e.textContent),
      '', document.querySelector('.system-note').textContent,
    ].join('\n');
  }

  function stop() {
    clearInterval(timer); timer = null;
    observer?.disconnect(); observer = null;
    lastPoll = 0;
  }
  function open() {
    if (dialog.open) return;
    blockCount = 0; maxBlock = 0; lag = 0;
    openedAt = performance.now();
    dialog.showModal();
    if (window.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
      try {
        observer = new PerformanceObserver(list => {
          for (const e of list.getEntries()) if (e.startTime >= openedAt && !document.hidden) { blockCount++; maxBlock = Math.max(maxBlock, e.duration); }
        });
        observer.observe({ type: 'longtask', buffered: false });
      } catch (e) { observer = null; }
    }
    shownIncidents = '';
    refresh();
    timer = setInterval(refresh, 1000);
  }
  /** Pastille sur le bouton Système : incidents pas encore vus. */
  function updateBadge() {
    const btn = $('systemBtn');
    const st = W().state();
    const unseen = dialog.open ? 0 : st.unseen;
    const level = unseen ? W().verdict(st, performance.now()) : 'ok';
    btn.classList.toggle('has-alert', level === 'bad');
    btn.classList.toggle('has-warn', level === 'warn');
    btn.setAttribute('aria-label', 'Système' + (unseen ? ` (${unseen} incident${unseen > 1 ? 's' : ''} audio)` : ''));
  }
  function init(options) {
    app = options; dialog = $('systemDialog');
    const metrics = $('systemMetrics');
    for (const [id, label, sub] of [['heroLoad', 'Charge audio', 'pendant la lecture'], ['heroUnder', 'Décrochages', 'coupures du moteur audio, depuis Lecture'], ['heroClip', 'Écrêtage', 'échantillons à 0 dBFS en sortie, depuis Lecture'], ['heroLate', 'Notes en retard', 'pas programmés en retard, depuis Lecture']]) {
      const card = el('div', null, 'system-metric');
      card.append(el('span', label)); const value = el('b', '—'); refs[id] = value;
      card.append(value, el('small', sub)); metrics.append(card);
    }
    const definitions = [
      ['Périphérique & CPU', [['device', 'Plateforme'], ['cores', 'Processeur'], ['cpu', 'Utilisation CPU globale'], ['visibility', 'Onglet'], ['browser', 'Navigateur']]],
      ['Mémoire', [['ram', 'RAM totale du périphérique'], ['ramFree', 'RAM consommée / restante'], ['heapUsed', 'JavaScript utilisé'], ['heapLimit', 'Limite du tas JavaScript'], ['heapFree', 'Marge du tas JavaScript'], ['buffers', 'Audio décodé connu'], ['bufferCount', 'Sons en cache'], ['assetList', 'Sons les plus lourds']]],
      ['Lecture audio', [['audioState', 'Moteur audio'], ['rate', 'Fréquence'], ['baseLatency', 'Latence de base'], ['outLatency', 'Latence de sortie estimée'], ['mastering', 'Processeur Master'], ['voices', 'Voix Web Audio en cours / anticipées'], ['juno', 'Synthés Juno'], ['peak', 'Crête Master instantanée'], ['truePeak', 'True peak depuis le début de la lecture'], ['late', 'Pas programmés en retard'], ['lastLate', 'Dernier retard audio'], ['tick', 'Préparation audio : maximum'], ['lag', 'Retard de l’interface'], ['blocks', 'Blocages ≥ 50 ms depuis ouverture']]],
      ['Charge de la chanson', [['tracks', 'Pistes'], ['scenes', 'Scènes / arrangement'], ['modules', 'Traitements des pistes'], ['effects', 'Effets des pistes'], ['masterEffects', 'Traitements du Master'], ['automix', 'Auto Mix']]],
    ];
    for (const [title, rows] of definitions) {
      const section = el('section'); section.append(el('h3', title)); const dl = el('dl');
      rows.forEach(([id, label]) => row(dl, id, label)); section.append(dl); $('systemSections').append(section);
    }
    $('systemBtn').addEventListener('click', open);
    $('systemClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', stop);
    dialog.addEventListener('keydown', e => e.stopPropagation());
    document.addEventListener('visibilitychange', () => { lastPoll = 0; });
    $('systemRepair').addEventListener('click', () => {
      const n = W().repair();
      SS.ui.toast(n ? `Son réparé : ${n} étages remis à zéro.` : 'Le moteur audio n’est pas encore démarré.');
      refresh();
    });
    $('systemClearIncidents').addEventListener('click', () => { W().clear(); refresh(); });
    let pending = false;
    W().onChange(() => {
      if (!dialog.open) return updateBadge();
      if (pending) return;
      pending = true; // nouvel incident : affiché sans attendre la seconde suivante
      requestAnimationFrame(() => { pending = false; if (dialog.open) renderIncidents(performance.now()); });
    });
    $('systemCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(report); SS.ui.toast('Diagnostic copié'); }
      catch (e) { SS.ui.toast('Copie indisponible sur ce navigateur'); }
    });
  }
  return { init, open, warnings, isOpen: () => !!dialog?.open };
})();
