/*
 * Assistant « Nouvelle chanson » : effets et mouvements de son d'un instrument, vus depuis son étape.
 *
 *  - Pastilles d'effet sous le nom du son (« Phaser · 4 mes. · 6 étages », « Écho 14 % ») : les effets écrits dans le plan
 *    du modèle (plan.fx[rôle], js/band-songs.js) et ceux qu'on a retouchés (ms.fxo du musicien, js/band.js). Un clic ouvre
 *    leurs réglages ; une retouche rend l'effet sien (« À moi »), « Revenir au modèle » l'efface.
 *  - « ∿ Toute la chanson » : aperçu replié des mouvements de son (courbes d'automation par scène) de tous les instruments,
 *    une ligne par instrument, une case par scène ; un clic sur une scène ou une ligne l'ouvre dans l'étape.
 *
 * chips() et overviewModel() sont pures (testées sous Node) ; panel() et overview() dessinent.
 */
window.SS = window.SS || {};

SS.wizFx = (() => {
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  };
  const D = (k) => (SS.FX_DEFAULTS || {})[k];
  const val = (fx, k) => (fx[k] != null ? fx[k] : D(k));
  const pct = (v) => `${Math.round(v * 100)} %`;
  const hz = (v) => `${(+v).toFixed(2).replace('.', ',')} Hz`;
  const speed = (fx, p) => {
    const s = val(fx, p + 'Sync');
    return s > 0 ? ((SS.MOD_SYNCS || []).find((x) => x.id === s) || { label: `${s} mes.` }).label : hz(val(fx, p + 'Rate'));
  };
  /** Clés d'effet que l'étape d'un instrument montre et règle. */
  const KEYS = {
    phaser: ['phaser', 'phaserRate', 'phaserSync', 'phaserDepth', 'phaserCenter', 'phaserFb', 'phaserStages'],
    flanger: ['flanger', 'flangerRate', 'flangerSync', 'flangerDepth', 'flangerDelay', 'flangerFb'],
    echo: ['sendEcho'],
  };
  const LABEL = { phaser: 'Phaser', flanger: 'Flanger', echo: 'Écho' };
  const MAIN = { phaser: 'phaser', flanger: 'flanger', echo: 'sendEcho' };

  /**
   * Pastilles d'un instrument : [{ id, label, model, mine }] ; `eff` = effets joués (modèle + retouches), `base` = ceux du
   * modèle, `own` = les retouches. Un effet du modèle coupé à la main garde sa pastille (« coupé ») pour pouvoir y revenir.
   */
  function chips(eff = {}, base = {}, own = {}) {
    const out = [];
    Object.keys(KEYS).forEach((id) => {
      const on = eff[MAIN[id]] > 0;
      if (!on && !(base[MAIN[id]] > 0)) return;
      const mine = KEYS[id].some((k) => own[k] != null);
      const model = !mine && KEYS[id].some((k) => base[k] != null);
      let label = LABEL[id];
      if (!on) label += ' · coupé';
      else if (id === 'echo') label += ` ${pct(eff.sendEcho)}`;
      else if (id === 'phaser') label += ` · ${speed(eff, 'phaser')} · ${val(eff, 'phaserStages')} étages`;
      else label += ` · ${speed(eff, 'flanger')}`;
      out.push({ id, label, model, mine });
    });
    return out;
  }

  /** Réglages d'un effet : { id, name, fx (joués), mine, model, onSet(patch), onRevert(), onClose() }. */
  function panel({ id, name, fx, mine, model, onSet, onRevert, onClose }) {
    const range = (k, label, min, max, fmt, step = 0.01) => {
      const out = h('b', {}, fmt(val(fx, k)));
      const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val(fx, k)), 'data-k': k, 'aria-label': label });
      inp.addEventListener('input', () => (out.textContent = fmt(+inp.value)));
      inp.addEventListener('change', () => onSet({ [k]: +inp.value }));
      return h('label', { class: 'wfx-r' }, h('span', {}, label), out, inp);
    };
    const seg = (k, label, list) =>
      h('div', { class: 'wfx-r' }, h('span', {}, label),
        h('span', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
          ...list.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'data-k': k, 'data-v': String(v), class: val(fx, k) === v ? 'active' : '', 'aria-checked': String(val(fx, k) === v), onclick: () => onSet({ [k]: v }) }, l))));
    const syncs = (SS.MOD_SYNCS || []).map((x) => [x.id, x.label]);
    const body =
      id === 'phaser'
        ? [seg('phaserSync', 'Vitesse', syncs), range('phaser', 'Mix', 0, 1, pct), range('phaserDepth', 'Profondeur', 0, 1, pct), range('phaserFb', 'Résonance', 0, 0.9, pct), seg('phaserStages', 'Étages', (SS.PHASER_STAGES || [4, 6, 8, 12]).map((n) => [n, String(n)]))]
        : id === 'flanger'
          ? [seg('flangerSync', 'Vitesse', syncs), range('flanger', 'Mix', 0, 1, pct), range('flangerDepth', 'Profondeur', 0, 1, pct)]
          : [range('sendEcho', 'Envoi vers l’écho à bande', 0, 1, pct)];
    return h(
      'section',
      { class: 'wfx-pop', role: 'dialog', 'aria-label': `${LABEL[id]} de ${name}`, 'data-fx': id },
      h('div', { class: 'wfx-ph' },
        h('b', {}, `${LABEL[id]} de ${name}`),
        model || mine ? h('span', { class: 'bwau-own ' + (model ? 'model' : 'mine') }, model ? 'Modèle' : 'À moi') : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'bwau-xb', 'aria-label': 'Fermer', onclick: onClose }, '×')),
      ...body,
      mine && onRevert ? h('button', { type: 'button', class: 'bwau-rev wfx-rev', onclick: onRevert }, '↺ Revenir au modèle') : null
    );
  }

  /**
   * Aperçu de la chanson. scenes : [{ sec, name, bars }] ; rows : [{ id, name, color, fx, curves: { sec: [{ param, color,
   * points [[pas, 0..1]], mine }] } }]. Renvoie { scenes: [{ sec, name, x, w }], rows: [{ id, name, color, fx, paths:
   * [{ d, color, mine }] }] } en coordonnées 0..1000 × 0..H (H = hauteur d'une ligne). Pure.
   */
  function overviewModel(scenes, rows, { spb = 16, W = 1000, H = 26 } = {}) {
    const total = scenes.reduce((a, s) => a + s.bars, 0) || 1;
    let x = 0;
    const sc = scenes.map((s) => {
      const w = (W * s.bars) / total;
      const o = { sec: s.sec, name: s.name, x, w };
      x += w;
      return o;
    });
    const y = (v) => (3 + (1 - v) * (H - 6)).toFixed(1);
    return {
      scenes: sc,
      rows: rows.map((r) => ({
        id: r.id, name: r.name, color: r.color, fx: r.fx,
        paths: sc.flatMap((s, i) =>
          ((r.curves && r.curves[s.sec]) || []).map((c) => {
            const len = Math.max(1, scenes[i].bars * spb - 1);
            const pts = c.points.length ? c.points : [[0, 0.5]];
            const xs = (st) => (s.x + (s.w * st) / len).toFixed(1);
            const d = `M${s.x.toFixed(1)} ${y(pts[0][1])}` + pts.map(([st, v]) => `L${xs(st)} ${y(v)}`).join('') + `L${(s.x + s.w).toFixed(1)} ${y(pts[pts.length - 1][1])}`;
            return { d, color: c.color, mine: !!c.mine };
          })
        ),
      })),
    };
  }

  /** Dessine l'aperçu : { scenes, rows, cur: { sec, id }, params: [{ name, color }], onScene(sec), onRow(id), onClose() }. */
  function overview({ scenes, rows, cur = {}, params = [], spb, onScene, onRow, onClose }) {
    const W = 1000;
    const H = 26;
    const m = overviewModel(scenes, rows, { spb, W, H });
    const lines = m.scenes.map((s) => `<line x1="${s.x.toFixed(1)}" y1="0" x2="${s.x.toFixed(1)}" y2="${H}" stroke="var(--c-line)" vector-effect="non-scaling-stroke"/>`).join('');
    const hl = m.scenes.filter((s) => s.sec === cur.sec).map((s) => `<rect x="${s.x}" y="0" width="${s.w}" height="${H}" fill="var(--c-panel-3)" opacity=".6"/>`).join('');
    const grid = h('div', { class: 'wfx-ovgrid' },
      h('div'),
      h('div', { class: 'wfx-ovsc' }, ...m.scenes.map((s) => h('button', { type: 'button', class: s.sec === cur.sec ? 'cur' : '', style: `width:${s.w / 10}%`, 'data-sec': s.sec, title: s.name, onclick: () => onScene(s.sec) }, s.name))),
      ...m.rows.flatMap((r) => [
        h('div', { class: 'wfx-ovlab' }, h('i', { style: `background:${r.color}` }), r.name, r.fx ? h('em', {}, ` · ${r.fx}`) : null),
        h('button', { type: 'button', class: 'wfx-ovlane' + (r.id === cur.id ? ' cur' : ''), 'data-id': r.id, 'aria-label': `Ouvrir ${r.name}`, onclick: () => onRow(r.id),
          html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${hl}${lines}${r.paths.map((p) => `<path d="${p.d}" fill="none" stroke="${p.color}" stroke-width="1.8" ${p.mine ? 'stroke-dasharray="4 3"' : ''} vector-effect="non-scaling-stroke"/>`).join('')}</svg>` }),
      ]));
    const used = params.filter((p) => m.rows.some((r) => r.paths.some((x) => x.color === p.color)));
    return h(
      'section',
      { class: 'wfx-ov', id: 'bwOverview', role: 'dialog', 'aria-label': 'Mouvements de son de toute la chanson' },
      h('div', { class: 'wfx-ph' }, h('b', {}, 'Mouvements de son'), h('span', { class: 'bh-info' }, 'toute la chanson'),
        SS.helpTip ? SS.helpTip('Une ligne par instrument : chaque courbe montre comment un réglage bouge dans chaque scène (filtre, résonance, volume, écho…). Courbes du modèle en trait plein, les tiennes en pointillé. Clique une scène ou une ligne pour l’ouvrir.', 'Mouvements de son') : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'bwau-xb', 'aria-label': 'Fermer', onclick: onClose }, '×')),
      grid,
      h('div', { class: 'wfx-legend' }, ...used.map((p) => h('span', {}, h('i', { style: `background:${p.color}` }), p.name)), used.length ? h('span', {}, 'plein : modèle · pointillé : à toi') : h('span', {}, 'Aucun mouvement de son dans cette chanson'))
    );
  }

  return { KEYS, chips, panel, overviewModel, overview };
})();
