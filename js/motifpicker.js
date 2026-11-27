/*
 * Carte Motif commune des musiciens de l'assistant (maquettes « présentation des motifs » du 2026-11-25 et « filtres
 * des motifs » du 2026-11-27) :
 *   - une seule liste de styles (STYLES), aux noms des styles de chanson, plus des styles propres à un musicien ;
 *   - une seule ligne de filtres : « ★ Pour cette scène » (si la scène a des motifs conseillés), les familles, Tous,
 *     puis le menu « Style : … ▾ », le dé Surprends-moi et Avancé ;
 *   - des cartes au même gabarit : ★ devant le nom si conseillé, dessin, badge « auto » ou « Inspiration » en coin ;
 *   - au pied, « Scènes : Cette scène | Même type | Toutes ».
 * Utilisée par l'étape Basse, l'étape Nappe (js/band.js) et la fenêtre MOTIF de la Grille (js/ui.js) à travers
 * SS.bassMotifs.picker. Fonctions pures en tête (testables sous Node), rendu DOM ensuite.
 */
window.SS = window.SS || {};

SS.motifPicker = (() => {
  /** Styles communs : [id, nom]. Les catalogues rangent leurs motifs sous ces ids. */
  const STYLES = [
    ['synth', 'Synthwave & 80s'],
    ['pop', 'Pop-rock'],
    ['funk', 'Funk & Disco'],
    ['soul', 'Soul & Jazz'],
    ['hiphop', 'Hip-hop & Lo-fi'],
    ['electro', 'Électro'],
    ['dnb', 'Drum & bass'],
    ['latin', 'Latin & Reggae'],
    ['film', 'Film & ambient'],
  ];
  const STYLE_IDS = STYLES.map((s) => s[0]);
  /** Style de chanson de l'assistant (SS.Band.STYLES) → style commun ; 'all' si aucun ne correspond (Créer de zéro…). */
  const SONG_STYLE = { synthwave: 'synth', edm: 'electro', techno: 'electro', ambient: 'film', film: 'film', pop: 'pop', cliches: 'pop', funk: 'funk', soul: 'soul', hiphop: 'hiphop', dnb: 'dnb', latin: 'latin' };
  const styleOfSong = (songStyle) => SONG_STYLE[songStyle] || 'all';
  const styleName = (id) => (STYLES.find((s) => s[0] === id) || [, id])[1];
  /**
   * Un motif rangé sous les étiquettes `tags` (styles propres à un catalogue : rock, folk, salsa…) va-t-il dans la puce
   * `style` ? Puce commune : une étiquette qui y mène (tagStyle : étiquette → style commun, sinon elle-même) ; puce
   * propre (Folk, Jazz…) : l'étiquette elle-même ; « all » : toujours.
   */
  function matches(tags, style, tagStyle = {}) {
    if (!style || style === 'all') return true;
    if (STYLE_IDS.includes(style)) return tags.some((t) => (tagStyle[t] || t) === style);
    return tags.includes(style);
  }
  /** Portée d'un choix : la scène, les scènes du même type (couplets, refrains…), toutes. */
  const SCOPES = [['one', 'Cette scène'], ['type', 'Même type'], ['all', 'Toutes']];
  /** Famille affichée : « ★ » seulement si la scène a des conseillés, sinon Tous. */
  const famShown = (fam, stars) => (fam === 'star' && !(stars && stars.length) ? 'all' : fam || (stars && stars.length ? 'star' : 'all'));
  /** Motifs montrés : filtrés par la famille, les conseillés en tête. */
  function visible(ids, { fam, stars = [], familyOf }) {
    const f = famShown(fam, stars);
    const list = ids.filter((id) => f === 'all' || (f === 'star' ? stars.includes(id) : familyOf && familyOf(id) === f));
    return [...list.filter((id) => stars.includes(id)), ...list.filter((id) => !stars.includes(id))];
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  }
  const chip = (cls, id, on, label, onclick, extra = {}) =>
    el('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: cls + (on ? ' on' : ''), onclick, ...extra }, ...[].concat(label));

  /** Styles proposés dans le menu : celui de la chanson en tête, puis ceux qui ont des motifs (et le style choisi), puis Tous. */
  function styleMenuItems(styles, { mark, group, count } = {}) {
    const has = (id) => id === group || id === mark || !count || count(id) > 0;
    const first = styles.filter(([id]) => id === mark);
    const rest = styles.filter(([id]) => id !== mark && has(id));
    return [...first, ...rest, ['all', 'Tous les styles']];
  }

  /**
   * Rendu : [barre, cartes]. La barre tient sur une ligne : « ★ Pour cette scène », les familles et Tous en puces, puis
   * le menu « Style : … ▾ » (celui de la chanson en tête, sans les styles vides), le dé Surprends-moi et Avancé.
   * o = {
   *   styles: [[id, nom]] (les styles communs puis les puces propres ; null : pas de menu de styles, Cuivres et Orchestre),
   *   styleId?: id du menu de styles, group, mark (style de la chanson), onGroup(id),
   *   count(id) : nombre de motifs d'un style (0 : absent du menu),
   *   fams?: [[id, nom]], fam, onFam(id), familyOf(id), stars?: [ids] (★ Pour cette scène),
   *   ids : motifs du style choisi, cur, insp?, auto?, name(id), desc(id), svg(id), onPick(id), label,
   *   surprise?: () => …  (dé Surprends-moi), advanced?: bouton au bout (Avancé…), help?: élément « ? » après le menu,
   *   mine?(id) : motif écrit par l'utilisateur (badge « ✎ À moi »), addCard?: carte au bout de la famille « mine »
   * }
   */
  function render(o) {
    const stars = o.stars || [];
    // sans famille choisie : « ★ Pour cette scène », sauf si le motif joué n'en est pas (on le voit dans Tous)
    const f = famShown(o.fam === undefined && o.cur && stars.length && !stars.includes(o.cur) && o.ids.includes(o.cur) ? 'all' : o.fam, stars);
    const nOf = (fid) => (fid === 'all' ? o.ids.length : fid === 'star' ? stars.length : o.ids.filter((id) => o.familyOf(id) === fid).length);
    const famChip = (id, label, extra = '') => chip('mot-chip mot-fam' + extra, id, f === id, label, () => o.onFam(id), { 'data-f': id });
    const menu = o.styles ? styleMenu(o) : null;
    const bar = o.fams || o.surprise || o.advanced || menu
      ? el(
          'div',
          { class: 'mot-chips mot-fams mot-bar' },
          el(
            'span',
            { class: 'mot-famset', role: 'radiogroup', 'aria-label': 'Familles' },
            stars.length ? famChip('star', '★ Pour cette scène', ' star') : null,
            ...(o.fams || []).filter(([id]) => nOf(id) || f === id).map(([id, l]) => famChip(id, l)),
            o.fams ? famChip('all', 'Tous') : null
          ),
          el('span', { class: 'spacer' }),
          el(
            'span',
            { class: 'mot-acts' },
            menu,
            menu ? o.help || null : null,
            o.surprise ? el('button', { type: 'button', class: 'btn btn-small mot-surprise', onclick: o.surprise, title: 'Surprends-moi : un motif au hasard parmi ceux affichés', 'aria-label': 'Surprends-moi', html: DICE }) : null,
            o.advanced || null
          )
        )
      : null;
    const card = (id) => {
      const on = id === o.cur;
      const badge = on && id === o.auto ? el('em', { class: 'mot-badge auto', title: 'Joué d’office : le premier motif conseillé pour ce type de scène' }, 'auto') : id === o.insp ? el('em', { class: 'mot-badge insp' }, 'Inspiration') : o.mine && o.mine(id) ? el('em', { class: 'mot-badge mine' }, '✎ À moi') : null;
      return el(
        'button',
        { type: 'button', role: 'radio', 'aria-checked': String(on), class: 'mot-card' + (on ? ' on' : '') + (badge ? (on && id === o.auto ? ' has-auto' : ' has-badge') : ''), 'data-id': id, title: o.desc(id) || null, onclick: () => o.onPick(id) },
        badge,
        el('span', { class: 'mot-name' }, stars.includes(id) ? el('span', { class: 'mot-star', 'aria-label': 'conseillé pour cette scène' }, '★ ') : null, o.name(id)),
        el('span', { class: 'mot-draw', html: o.svg(id) })
      );
    };
    const shown = o.fams || stars.length ? visible(o.ids, { fam: f, stars, familyOf: o.familyOf }) : o.ids;
    const cards = el('div', { class: 'mot-cards', role: 'radiogroup', 'aria-label': o.label || 'Motifs' }, shown.map(card), f === 'mine' && o.addCard ? o.addCard : null);
    return [bar, cards].filter(Boolean);
  }
  /** Dé de Surprends-moi. */
  const DICE = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" style="fill:none;stroke:currentColor;stroke-width:1.4"/><circle cx="5" cy="5" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="11" cy="11" r="1.1" fill="currentColor"/></svg>';
  /** Menu « Style : … ▾ » : un bouton et sa liste (data-g sur chaque style). */
  function styleMenu(o) {
    const all = [['all', 'Tous les styles'], ...o.styles];
    const curName = (all.find((s) => s[0] === o.group) || all[0])[1];
    const pop = el('span', { class: 'mot-pop', role: 'menu', 'aria-label': 'Styles', hidden: true });
    const items = styleMenuItems(o.styles, o);
    items.forEach(([id, l], i) => {
      if (i && (id === 'all' || (i === 1 && items[0][0] === o.mark))) pop.append(el('span', { class: 'mot-sep', 'aria-hidden': 'true' }));
      pop.append(
        el(
          'button',
          { type: 'button', role: 'menuitemradio', 'aria-checked': String(o.group === id), class: 'mot-opt' + (o.group === id ? ' on' : '') + (o.mark === id ? ' mark' : ''), 'data-g': id, onclick: () => ((pop.hidden = true), o.onGroup(id)) },
          el('span', {}, l),
          o.mark === id ? el('small', {}, 'la chanson') : null
        )
      );
    });
    const btn = el(
      'button',
      { type: 'button', class: 'btn btn-small mot-style-btn', 'aria-haspopup': 'menu', title: 'Style des motifs', onclick: () => (closeMenus(pop), (pop.hidden = !pop.hidden)) },
      'Style : ',
      el('b', {}, o.group === 'all' ? 'tous' : curName),
      ' ▾'
    );
    return el('span', { class: 'mot-style', id: o.styleId || null }, btn, pop);
  }
  /** Ferme les menus de styles ouverts (sauf `keep`). */
  function closeMenus(keep) {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.mot-pop:not([hidden])').forEach((p) => p !== keep && (p.hidden = true));
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', (e) => !(e.target.closest && e.target.closest('.mot-style')) && closeMenus());
    // Échap ferme d'abord un menu ouvert (sans fermer la fenêtre autour)
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !document.querySelector('.mot-pop:not([hidden])')) return;
        closeMenus();
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
  }

  /** Segment « Scènes : Cette scène | Même type | Toutes » (classes de l'assistant). */
  function scopeSeg(id, value, onChange, help) {
    return el(
      'div',
      { class: 'bwp-field' },
      el('span', { class: 'bh-lbl' }, 'Scènes', help || null),
      el('span', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Scènes', id }, ...SCOPES.map(([v, t]) => el('button', { type: 'button', role: 'radio', class: v === value ? 'active' : '', 'aria-checked': String(v === value), 'data-v': v, onclick: () => onChange(v) }, t)))
    );
  }

  return { STYLES, STYLE_IDS, SCOPES, styleOfSong, styleName, matches, famShown, visible, styleMenuItems, render, scopeSeg, el };
})();
