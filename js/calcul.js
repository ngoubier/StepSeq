/*
 * Jauge CALCUL (barre du haut) et « Calcul par piste » : combien le moteur audio doit calculer pour jouer la chanson.
 *
 * 100 % = 1 seconde de calcul pour 1 seconde de son : au-delà, le moteur audio (un seul fil pour toute la page) ne suit
 * plus et le son décroche. Le navigateur ne donne aucune mesure par piste pendant la lecture : on la mesure hors temps
 * réel (js/render.js, comme Exporter l'audio), sur la scène la plus remplie, chaque piste seule, puis sans aucune piste
 * (Master, reverbs et échos partagés). Mesure faite à l'arrêt, en arrière-plan, seulement pour ce qui a changé.
 * Une piste figée (js/freeze.js) ne coûte presque plus rien (lecture d'un enregistrement).
 *
 * Quand le son décroche pendant la lecture (js/audiowatch.js), une notification propose de figer les pistes les plus
 * lourdes.
 */
window.SS = window.SS || {};

SS.load = (() => {
  const SEC = 6; // secondes de son mesurées par rendu
  const FROZEN_MS = 0.5; // coût d'une piste figée (lecture d'un enregistrement), ms par seconde de son
  const TARGET = 700; // « Figer les plus lourdes » : jusqu'à 70 % de calcul
  const IDLE_MS = 5000; // attente après une modification avant de mesurer

  const costs = new Map(); // clé de contenu -> ms de calcul par seconde de son
  let app = null;
  let timer = null;
  let job = null; // { abort, done, total }
  let overAt = -Infinity;
  let proposedRun = -1;
  let btn = null;
  let pop = null;

  const isOn = (t) => !!(SS.freeze && SS.freeze.isOn(t));
  const hash = (s) => (SS.freeze ? SS.freeze.hash(s) : s);

  /* ================= Ce qui est mesuré ================= */

  /** Scène mesurée : celle où le plus de pistes jouent (la plus longue à égalité). */
  function sceneOf(p) {
    let best = null;
    let bestN = -1;
    for (const sc of p.scenes) {
      const cur = sc.id === p.current;
      const n = p.tracks.filter((t) => {
        const d = cur ? t : sc.data && sc.data[t.id];
        return d && ((d.events && d.events.length) || (d.steps && d.steps.some((v) => v > 0)));
      }).length;
      const bars = cur ? p.bars : sc.bars;
      if (n > bestN || (n === bestN && bars > (best ? (best.id === p.current ? p.bars : best.bars) : 0))) {
        best = sc;
        bestN = n;
      }
    }
    return best;
  }
  const audible = (p) => {
    const solo = p.tracks.some((t) => t.solo);
    return p.tracks.filter((t) => !t.mute && (!solo || t.solo));
  };
  /** Clé de ce qui fait le coût d'une piste : son, notes de la scène mesurée, effets, tranche. */
  function trackKey(p, t, sc) {
    const s = SS.freeze ? SS.freeze.trackSig(p, t) + SS.freeze.sceneSig(p, t, sc) : JSON.stringify(t);
    return hash('t|' + s + JSON.stringify([t.fx || null, t.mix || null, t.type === 'drum' ? [t.steps, sc.id] : null]));
  }
  /** Clé de la chanson entière (pistes entendues, Master, retours partagés, tempo). */
  function allKey(p, sc, tracks) {
    return hash('a|' + JSON.stringify([p.master || null, p.returns || null, SS.tempoOf(p, sc), tracks.map((t) => trackKey(p, t, sc)).sort()]));
  }

  /** Projet envoyé au rendu : la scène mesurée en boucle, avec les pistes `ids` seulement. */
  function prepare(p, sc, ids) {
    const data = JSON.parse(SS.serialize(p, { wizard: false }));
    const keep = new Set(ids);
    data.tracks = data.tracks.filter((t) => keep.has(t.id)).map((t) => ({ ...t, mute: false, solo: false, freeze: undefined }));
    data.scenes = data.scenes.filter((x) => x.id === sc.id);
    data.current = sc.id;
    data.bars = data.scenes[0].bars;
    data.song = [{ scene: sc.id, repeat: 64 }];
    delete data.wizard;
    return JSON.stringify(data);
  }

  /** ms de calcul par seconde de son, préparation (chargement des sons) non comptée. */
  async function time(json, signal) {
    const marks = [];
    const t0 = performance.now();
    await SS.render.renderOnce(json, { seconds: SEC, sampleRate: 48000, seed: 1 }, { onProgress: (f) => marks.push([f * SEC, performance.now() - t0]), signal });
    const end = performance.now() - t0;
    const a = marks[0] || [0, 0];
    return Math.max(0, (end - a[1]) / Math.max(0.5, SEC - a[0]));
  }

  /* ================= Bilan ================= */

  /**
   * Bilan actuel : { total (ms/s) ou null, missing (mesures qui manquent), rows: [{ track, ms, frozen, muted }], base }.
   * Mesures : la scène avec toutes les pistes entendues (F), puis sans chacune d'elles : le coût d'une piste est ce
   * qu'elle ajoute (F − F sans elle) ; « base » = ce qui reste (Master, reverbs et échos partagés). Une piste figée
   * retire son coût et ajoute la lecture de son enregistrement. Les pistes muettes ne comptent pas.
   */
  function report(p = app && app.project()) {
    if (!p) return { total: null, rows: [], base: null, missing: 0 };
    const sc = sceneOf(p);
    if (!sc) return { total: null, rows: [], base: null, missing: 0 };
    const heard = audible(p);
    const play = new Set(heard);
    let missing = 0;
    const rows = p.tracks.map((t) => {
      const ms = play.has(t) ? costs.get('m|' + trackKey(p, t, sc)) : null;
      if (ms == null && play.has(t)) missing++;
      return { track: t, ms: ms == null ? null : ms, frozen: isOn(t), muted: !play.has(t) };
    });
    const F = costs.get(allKey(p, sc, heard));
    if (F == null) missing++;
    if (missing) return { total: null, rows, base: null, missing, scene: sc };
    const live = rows.filter((r) => !r.muted);
    const base = Math.max(0, F - live.reduce((n, r) => n + r.ms, 0));
    const total = F - live.filter((r) => r.frozen).reduce((n, r) => n + r.ms - FROZEN_MS, 0);
    return { total, rows, base, missing: 0, scene: sc };
  }

  /** Pistes à figer, des plus lourdes aux plus légères, jusqu'à passer sous TARGET (au moins une). */
  function heaviest(p = app && app.project(), rep = report(p)) {
    const cand = rep.rows.filter((r) => !r.frozen && !r.muted && r.track.type === 'instrument');
    if (rep.total != null) {
      cand.sort((a, b) => b.ms - a.ms);
      const out = [];
      let total = rep.total;
      for (const r of cand) {
        if (total <= TARGET && out.length) break;
        if (r.ms < 15) break; // une piste légère ne change rien
        out.push(r.track);
        total -= r.ms - FROZEN_MS;
      }
      return { tracks: out, after: total };
    }
    // pas encore mesuré : estimation (js/audiowatch.js), les synthés Juno d'abord
    let est = [];
    try {
      est = SS.audioWatch.estimateLoad(p).filter((x) => x.trackId);
    } catch (e) {
      est = [];
    }
    const by = new Map(est.map((x) => [x.trackId, x.cost]));
    const heavy = cand.filter((r) => (by.get(r.track.id) || 0) >= 3).sort((a, b) => by.get(b.track.id) - by.get(a.track.id));
    return { tracks: heavy.slice(0, 3).map((r) => r.track), after: null };
  }

  /* ================= Mesure en arrière-plan ================= */

  async function measure() {
    if (job || !app) return;
    const p = app.project();
    if (SS.audio.isPlaying() || !p.tracks.length) return;
    const sc = sceneOf(p);
    if (!sc) return;
    const heard = audible(p);
    const ids = heard.map((t) => t.id);
    const ak = allKey(p, sc, heard);
    const todo = heard.filter((t) => !costs.has('m|' + trackKey(p, t, sc)));
    const needAll = !costs.has(ak);
    if (!needAll && !todo.length) return paint();
    const ctl = new AbortController();
    job = { abort: () => ctl.abort(), done: 0, total: todo.length + (needAll ? 1 : 0) };
    paint();
    const step = () => {
      if (SS.audio.isPlaying() || p !== app.project()) throw new DOMException('lecture', 'AbortError');
    };
    try {
      // toute la scène, puis sans chaque piste : le coût d'une piste = ce qu'elle ajoute
      let F = costs.get(ak);
      if (needAll) {
        step();
        F = await time(prepare(p, sc, ids), ctl.signal);
        costs.set(ak, F);
        job.done++;
        paint();
      }
      for (const t of todo) {
        step();
        const ms = await time(prepare(p, sc, ids.filter((id) => id !== t.id)), ctl.signal);
        costs.set('m|' + trackKey(p, t, sc), Math.max(0, F - ms));
        job.done++;
        paint();
        if (pop) fillPop();
      }
    } catch (e) {
      if (!(e && e.name === 'AbortError')) console.warn('Calcul : mesure impossible', e);
    } finally {
      job = null;
      paint();
      if (pop) fillPop();
      if (report().missing && !SS.audio.isPlaying()) schedule(); // modifiée pendant la mesure
    }
  }
  function schedule(ms = IDLE_MS) {
    clearTimeout(timer);
    timer = setTimeout(measure, ms);
  }

  /** Après chaque modification : bilan à jour tout de suite, mesure de ce qui a changé un peu plus tard. */
  function changed() {
    paint();
    if (pop) fillPop();
    const r = report();
    if (r.missing) schedule();
  }

  /** La lecture démarre : la mesure s'arrête (elle prendrait du calcul au son). */
  function playing() {
    if (job) job.abort();
  }

  /* ================= Interface ================= */

  const pct = (ms) => Math.round(ms / 10) + ' %';
  const color = (ms) => (ms > 1000 ? 'var(--load-bad)' : ms > 850 ? 'var(--load-warn)' : 'var(--load-ok)');

  function paint() {
    if (!btn) return;
    const r = report();
    const bar = btn.querySelector('.ld-bar i');
    const val = btn.querySelector('.ld-val');
    const over = performance.now() - overAt < 10000;
    btn.classList.toggle('over', over);
    btn.classList.toggle('busy', !!job);
    if (r.total == null) {
      bar.style.width = '0%';
      val.textContent = job ? `${job.done}/${job.total}` : '—';
      val.style.color = '';
      btn.title = job ? 'Mesure du calcul en cours…' : 'Calcul : pas encore mesuré (clic pour mesurer)';
      return;
    }
    bar.style.width = Math.min(100, r.total / 12) + '%';
    bar.style.background = color(r.total);
    val.textContent = pct(r.total);
    val.style.color = color(r.total);
    btn.title = `Calcul du moteur audio : ${pct(r.total)} (scène « ${r.scene.name} »). Clic : calcul par piste`;
  }

  function freezeTracks(list) {
    list.forEach((t) => SS.freeze.set(t, true));
    if (SS.ui && SS.ui.toast) SS.ui.toast(`${list.map((t) => t.name).join(', ')} : figée${list.length > 1 ? 's' : ''}, enregistrement en arrière-plan`, 4000);
    paint();
    if (pop) fillPop();
  }

  function fillPop() {
    const p = app.project();
    const r = report(p);
    const h = (tag, cls, txt) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };
    pop.replaceChildren();
    const head = h('div', 'ld-head');
    head.append(h('b', null, 'Calcul par piste'));
    if (SS.helpTip)
      head.append(
        SS.helpTip(
          'Part du temps que le moteur audio passe à calculer chaque piste, mesurée hors lecture sur la scène la plus remplie. Au-delà de 100 % au total, il ne suit plus et le son décroche. Figer une piste (❄) la fait presque disparaître du calcul.',
          'Calcul par piste'
        )
      );
    head.append(h('span', 'ld-total', r.total == null ? (job ? `mesure ${job.done}/${job.total}…` : '—') : pct(r.total)));
    pop.append(head);
    const max = Math.max(1, ...r.rows.map((x) => (x.frozen ? 0 : x.ms || 0)), r.base || 0);
    const rows = r.rows.filter((x) => !x.muted).sort((a, b) => (b.frozen ? FROZEN_MS : b.ms || 0) - (a.frozen ? FROZEN_MS : a.ms || 0));
    const line = (name, ms, extra, cls) => {
      const row = h('div', 'ld-row' + (cls ? ' ' + cls : ''));
      row.append(h('span', 'ld-name', name));
      const bar = h('span', 'ld-rbar');
      const fill = h('i');
      fill.style.width = ms == null ? '0%' : Math.max(1, (ms / max) * 100) + '%';
      bar.append(fill);
      row.append(bar, h('span', 'ld-ms', ms == null ? '…' : pct(ms)));
      row.append(extra || h('span', 'ld-slot'));
      pop.append(row);
    };
    for (const x of rows) {
      let extra = null;
      if (x.track.type === 'instrument') {
        extra = h('button', 'ld-frz' + (x.frozen ? ' on' : ''), '❄');
        extra.type = 'button';
        extra.title = x.frozen ? 'Dégeler' : 'Figer';
        extra.onclick = () => {
          SS.freeze.set(x.track, !x.frozen);
          paint();
          fillPop();
        };
      }
      line(x.track.name, x.frozen ? FROZEN_MS : x.ms, extra, x.frozen ? 'frozen' : '');
    }
    line('Master et reverbs', r.base, null, 'base');
    const foot = h('div', 'ld-foot');
    const hv = heaviest(p, r);
    const go = h('button', 'ld-go', hv.tracks.length ? `❄ Figer les plus lourdes (${hv.tracks.length})` : 'Rien à figer');
    go.type = 'button';
    go.disabled = !hv.tracks.length;
    if (hv.tracks.length) go.title = hv.tracks.map((t) => t.name).join(', ') + (hv.after != null ? ` → ≈ ${pct(hv.after)}` : '');
    go.onclick = () => freezeTracks(hv.tracks);
    const again = h('button', 'ld-again', job ? 'Mesure…' : 'Mesurer');
    again.type = 'button';
    again.disabled = !!job || SS.audio.isPlaying();
    again.onclick = () => {
      // tout remesurer (l'ordinateur a pu changer de régime)
      const q = app.project();
      const sc = sceneOf(q);
      if (sc) {
        costs.delete(allKey(q, sc, audible(q)));
        q.tracks.forEach((t) => costs.delete('m|' + trackKey(q, t, sc)));
      }
      measure();
      fillPop();
    };
    foot.append(again, go);
    pop.append(foot);
  }

  function toggle() {
    if (pop) return close();
    pop = document.createElement('div');
    pop.className = 'ld-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Calcul par piste');
    document.body.append(pop);
    fillPop();
    const b = btn.getBoundingClientRect();
    pop.style.top = b.bottom + 6 + 'px';
    pop.style.left = Math.max(8, Math.min(b.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + 'px';
    if (report().missing && !job) measure();
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }
  function outside(e) {
    if (pop && !pop.contains(e.target) && !btn.contains(e.target) && !e.target.closest('[class*="help"], dialog')) close();
  }
  function close() {
    if (pop) pop.remove();
    pop = null;
    document.removeEventListener('pointerdown', outside, true);
  }

  /**
   * Le son décroche (js/audiowatch.js) : une fois par lecture, proposer de figer les pistes les plus lourdes.
   * Retourne true si la proposition est affichée.
   */
  function overloaded(project, run) {
    overAt = performance.now();
    paint();
    if (!app || run === proposedRun || project !== app.project()) return false;
    const hv = heaviest(project);
    if (!hv.tracks.length || !SS.ui || !SS.ui.toast) return false;
    proposedRun = run;
    const names = hv.tracks.map((t) => t.name);
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1] : names[0];
    SS.ui.toast(`Le son décroche : figer ${list}${hv.after != null ? ` (≈ ${pct(hv.after)} de calcul)` : ''} ?`, 12000, {
      label: `❄ Figer${names.length > 1 ? ' les ' + names.length : ''}`,
      run: () => freezeTracks(hv.tracks),
    });
    return true;
  }

  function init(a) {
    app = a;
    btn = document.getElementById('loadBtn');
    if (btn) {
      btn.addEventListener('click', toggle);
    }
    paint();
    schedule(3000);
  }

  return { _project: () => app && app.project(), init, changed, playing, overloaded, report, heaviest, sceneOf, prepare, measure, FROZEN_MS, TARGET, _costs: costs };
})();
