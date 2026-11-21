/*
 * Aides de l'application : un petit « ? » à droite du libellé d'une ligne, au lieu d'une ligne de texte.
 *
 *   SS.helpTip(texte, titre)  crée le bouton « ? » (titre : le libellé qu'il explique, repris dans la fenêtre).
 *   En HTML : <button type="button" class="help-tip" data-help="…" data-help-title="…" aria-label="Aide : …">?</button>
 *
 * Survol ou focus clavier : l'aide s'affiche en info-bulle. Appui (écran tactile) : l'info-bulle s'ouvre ou se
 * ferme. Une aide longue (plus de LONG caractères) montre son début en info-bulle et s'ouvre en entier dans une
 * fenêtre, avec une croix pour la fermer, quand on clique sur le « ? ».
 * Le comportement est délégué au document : il vaut aussi pour les « ? » ajoutés plus tard.
 */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const LONG = 160;

  function helpTip(text, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'help-tip';
    b.textContent = '?';
    b.dataset.help = String(text || '');
    if (title) b.dataset.helpTitle = String(title);
    b.setAttribute('aria-label', title ? `Aide : ${title}` : 'Aide');
    return b;
  }
  SS.helpTip = helpTip;
  /** Aide qui change avec l'état (« ? » écrit dans la page) : nouveau texte, et le « ? » se cache s'il n'y a rien à dire. */
  SS.setHelp = (el, text) => {
    if (!el) return;
    el.dataset.help = String(text || '');
    el.hidden = !text;
  };
  SS.HELP_LONG = LONG;

  if (typeof document === 'undefined') return;

  /*
   * Textes d'aide écrits dans la page (HTML ou interface générée) : ils deviennent un « ? » à droite du libellé
   * le plus proche, et disparaissent de la page. Sont concernés : .fx-help, .mod-help (sauf messages d'état),
   * et tout élément marqué data-helpify (data-help-for="id" pour viser un libellé précis).
   * Libellé visé : l'élément précédent qui est un titre / libellé (h2, h3, h4, legend, summary, .dlg-label,
   * label, .help-anchor), ou un en-tête (classe « …head… ») : son titre s'il en contient un, sinon l'en-tête
   * lui-même ; à défaut, le parent.
   */
  const HELP_SEL = '.fx-help, .mod-help:not(.mast-hint), [data-helpify]';
  const HEAD = 'h1, h2, h3, h4, legend, summary, .dlg-label, label, .help-anchor';
  function labelFor(el) {
    if (el.dataset.helpFor) return document.getElementById(el.dataset.helpFor);
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (sib.matches(HEAD)) return sib;
      if (/head/.test(sib.className || '')) {
        return sib.querySelector(HEAD) || sib;
      }
    }
    return el.parentElement;
  }
  const labelText = (t) => (t.cloneNode(true).textContent || '').replace(/\?/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  function helpify(root) {
    if (!root || !root.querySelectorAll) return;
    const list = [...(root.matches && root.matches(HELP_SEL) ? [root] : []), ...root.querySelectorAll(HELP_SEL)];
    for (const el of list) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const target = labelFor(el);
      if (!text || !target) continue;
      const prev = [...target.children].find((c) => c.classList.contains('help-tip'));
      if (prev) prev.dataset.help += ' ' + text;
      else target.append(helpTip(text, labelText(target)));
      el.remove();
    }
  }
  SS.helpify = helpify;
  const start = () => {
    helpify(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) helpify(n);
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  let tip = null;
  let owner = null;
  function hideTip() {
    if (tip) tip.remove();
    if (owner) owner.removeAttribute('aria-describedby');
    owner = null;
  }
  function showTip(btn) {
    const text = btn.dataset.help || '';
    if (!text) return;
    if (owner === btn && tip && tip.isConnected) return;
    hideTip();
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'helpTipBubble';
      tip.className = 'help-bubble';
      tip.setAttribute('role', 'tooltip');
    }
    const long = text.length > LONG;
    tip.textContent = long ? text.slice(0, text.lastIndexOf(' ', LONG - 30) > 40 ? text.lastIndexOf(' ', LONG - 30) : LONG - 30) + '… ' : text;
    if (long) {
      const more = document.createElement('b');
      more.textContent = 'Cliquer sur « ? » pour lire la suite';
      tip.append(more);
    }
    // dans la fenêtre modale ouverte (couche supérieure), sinon dans la page
    (btn.closest('dialog[open]') || document.body).append(tip);
    owner = btn;
    btn.setAttribute('aria-describedby', tip.id);
    const r = btn.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 16);
    tip.style.maxWidth = `${w}px`;
    const tw = Math.min(w, tip.offsetWidth);
    const th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    let y = r.bottom + 8;
    if (y + th > window.innerHeight - 8) y = Math.max(8, r.top - th - 8);
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
  }

  let dlg = null;
  function openWindow(btn) {
    hideTip();
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'help-dialog';
      dlg.setAttribute('aria-labelledby', 'helpDialogTitle');
      dlg.innerHTML =
        '<div class="help-dialog-head"><h2 id="helpDialogTitle"></h2><button type="button" class="help-close" aria-label="Fermer l’aide"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><p class="help-dialog-text"></p>';
      dlg.querySelector('.help-close').addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => e.target === dlg && dlg.close()); // clic hors de la fenêtre
      document.body.append(dlg);
    }
    dlg.querySelector('h2').textContent = btn.dataset.helpTitle || 'Aide';
    dlg.querySelector('.help-dialog-text').textContent = btn.dataset.help || '';
    dlg.returnFocus = btn;
    dlg.addEventListener('close', () => dlg.returnFocus && dlg.returnFocus.isConnected && dlg.returnFocus.focus(), { once: true });
    dlg.showModal();
    dlg.querySelector('.help-close').focus();
  }

  const isTip = (e) => e.target && e.target.closest && e.target.closest('.help-tip');
  document.addEventListener('mouseover', (e) => {
    const b = isTip(e);
    if (b) showTip(b);
  });
  document.addEventListener('mouseout', (e) => {
    const b = isTip(e);
    if (b && b === owner && !(e.relatedTarget && b.contains(e.relatedTarget)) && document.activeElement !== b) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const b = isTip(e);
    if (b) showTip(b);
    else if (owner) hideTip();
  });
  document.addEventListener('focusout', (e) => isTip(e) && hideTip());
  document.addEventListener(
    'click',
    (e) => {
      const b = isTip(e);
      if (!b) {
        if (owner && !(tip && tip.contains(e.target))) hideTip();
        return;
      }
      // le « ? » ne déclenche pas le contrôle qu'il accompagne (libellé cliquable, formulaire…)
      e.preventDefault();
      e.stopPropagation();
      if ((b.dataset.help || '').length > LONG) openWindow(b);
      else if (owner === b && tip && tip.isConnected) hideTip();
      else showTip(b);
    },
    true
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !owner) return;
      // Échap ferme l'info-bulle seulement, pas la fenêtre qui est dessous
      e.preventDefault();
      e.stopPropagation();
      hideTip();
    },
    true
  );
  window.addEventListener('scroll', () => owner && hideTip(), true);
  window.addEventListener('resize', () => owner && hideTip());
})(typeof window !== 'undefined' ? window : globalThis);
