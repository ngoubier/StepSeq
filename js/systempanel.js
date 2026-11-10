/* Diagnostic local et léger. Les mesures système indisponibles ne sont pas estimées à partir du tas JS. */
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
  let blockCount = 0, maxBlock = 0, lag = 0, report = '';
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
      effects += ['chorus', 'delay', 'room', 'sendPlate', 'sendHall', 'sendEcho'].filter(k => fx[k] > 0).length;
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
    $('systemDiagnosis').replaceChildren(...list.map(text => el('li', text)));
    const issues = a.scheduling.lateSteps > 0 || lag > 80 || maxBlock >= 100 || heapRatio > 0.85 || a.failedAssets > 0 || a.context && a.context.state !== 'running' || (a.output?.loudness?.tp ?? -Infinity) > 0 || a.output?.peak >= 1;
    const status = $('systemStatus');
    status.classList.toggle('has-issues', issues);
    const statusText = (a.paused ? 'En pause' : a.playing ? 'Lecture en cours' : 'Lecture arrêtée') + ' · ' + (issues ? 'Points à vérifier ci-dessous' : 'Observation en cours');
    if (status.textContent !== statusText) status.textContent = statusText;
    set('assetList', a.largestAssets.length ? a.largestAssets.map(x => x.name + ' : ' + mib(x.bytes)).join('\n') : 'Aucun échantillon décodé');
    set('heroMemory', mib(a.bufferBytes));
    set('heroLate', a.scheduling.lateSteps);
    set('heroLag', ms(lag));
    report = ['StepSeq — Diagnostic Système', status.textContent, ...Object.entries(refs).filter(([k]) => !k.startsWith('hero')).map(([, e]) => e.previousElementSibling.textContent + ' : ' + e.textContent), ...list, document.querySelector('.system-note').textContent].join('\n');
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
    refresh();
    timer = setInterval(refresh, 1000);
  }
  function init(options) {
    app = options; dialog = $('systemDialog');
    const metrics = $('systemMetrics');
    for (const [id, label, sub] of [['heroMemory', 'Sons en mémoire', 'Sons décompressés, minimum connu'], ['heroLate', 'Pas en retard', 'Depuis le début de la lecture'], ['heroLag', 'Retard interface', 'Dernière seconde observée']]) {
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
    $('systemCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(report); SS.ui.toast('Diagnostic copié'); }
      catch (e) { SS.ui.toast('Copie indisponible sur ce navigateur'); }
    });
  }
  return { init, open, warnings };
})();
