/*
 * Carte Motif commune des musiciens de l'assistant (maquette « présentation des motifs » validée le 2026-11-25) :
 *   - une seule liste de styles (STYLES), aux noms des styles de chanson, plus des puces propres à un musicien ;
 *   - une ligne de familles : « ★ Pour cette scène » (si la scène a des motifs conseillés), les familles, Tous ;
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

  /**
   * Rendu : [puces de style, puces de famille, cartes].
   * o = {
   *   styles: [[id, nom]] (les styles communs puis les puces propres ; null : pas de ligne de styles, Cuivres et Orchestre),
   *   group, mark (style de la chanson), onGroup(id),
   *   count(id) : nombre de motifs d'un style (0 : puce grisée),
   *   fams?: [[id, nom]], fam, onFam(id), familyOf(id), stars?: [ids] (★ Pour cette scène),
   *   ids : motifs du style choisi, cur, insp?, auto?, name(id), desc(id), svg(id), onPick(id), label,
   *   surprise?: () => …  (bouton Surprends-moi), help?: élément « ? » des styles
   * }
   */
  function render(o) {
    const styles = !o.styles ? null : el(
      'div',
      { class: 'mot-chips', role: 'radiogroup', 'aria-label': 'Styles' },
      [['all', 'Tous'], ...o.styles].map(([id, l]) => {
        const off = id !== 'all' && o.count && !o.count(id) && id !== o.group;
        return chip('mot-chip' + (o.mark === id ? ' mark' : '') + (off ? ' off' : ''), id, o.group === id, l, off ? null : () => o.onGroup(id), { 'data-g': id, disabled: off || null });
      }),
      o.help || null
    );
    const stars = o.stars || [];
    const f = famShown(o.fam, stars);
    const nOf = (fid) => (fid === 'all' ? o.ids.length : fid === 'star' ? stars.length : o.ids.filter((id) => o.familyOf(id) === fid).length);
    const famChip = (id, label, extra = '') => chip('mot-chip mot-fam' + extra, id, f === id, [label, el('span', { class: 'mot-n' }, String(nOf(id)))], () => o.onFam(id), { 'data-f': id });
    const fams = o.fams || o.surprise
      ? el(
          'div',
          { class: 'mot-chips mot-fams', role: 'radiogroup', 'aria-label': 'Familles' },
          stars.length ? famChip('star', '★ Pour cette scène', ' star') : null,
          ...(o.fams || []).filter(([id]) => nOf(id) || f === id).map(([id, l]) => famChip(id, l)),
          o.fams ? famChip('all', 'Tous') : null,
          el('span', { class: 'spacer' }),
          o.surprise ? el('button', { type: 'button', class: 'btn btn-small mot-surprise', onclick: o.surprise, title: 'Un motif au hasard parmi ceux affichés' }, 'Surprends-moi') : null
        )
      : null;
    const card = (id) => {
      const on = id === o.cur;
      const badge = on && id === o.auto ? el('em', { class: 'mot-badge auto', title: 'Joué d’office : le premier motif conseillé pour ce type de scène' }, 'auto') : id === o.insp ? el('em', { class: 'mot-badge insp' }, 'Inspiration') : null;
      return el(
        'button',
        { type: 'button', role: 'radio', 'aria-checked': String(on), class: 'mot-card' + (on ? ' on' : '') + (badge ? (on && id === o.auto ? ' has-auto' : ' has-badge') : ''), 'data-id': id, title: o.desc(id) || null, onclick: () => o.onPick(id) },
        badge,
        el('span', { class: 'mot-name' }, stars.includes(id) ? el('span', { class: 'mot-star', 'aria-label': 'conseillé pour cette scène' }, '★ ') : null, o.name(id)),
        el('span', { class: 'mot-draw', html: o.svg(id) })
      );
    };
    const shown = o.fams || stars.length ? visible(o.ids, { fam: f, stars, familyOf: o.familyOf }) : o.ids;
    const cards = el('div', { class: 'mot-cards', role: 'radiogroup', 'aria-label': o.label || 'Motifs' }, shown.map(card));
    return [styles, fams, cards].filter(Boolean);
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

  return { STYLES, STYLE_IDS, SCOPES, styleOfSong, styleName, matches, famShown, visible, render, scopeSeg, el };
})();
