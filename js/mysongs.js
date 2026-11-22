/*
 * Fenêtre « Mes chansons » : les chansons enregistrées automatiquement dans le navigateur (js/store.js).
 * Ouvrir (une chanson qui n'existe que dans l'assistant se rouvre dans l'assistant), dupliquer, supprimer (une par une,
 * la sélection, ou toutes les vides d'un coup, avec confirmation dans la fenêtre), et revenir à une version précédente.
 */
window.SS = window.SS || {};
SS.mySongs = (() => {
  const $ = (q, root = document) => root.querySelector(q);
  let app = null;
  let el = null;
  let songs = [];
  let openVersions = null; // id de la chanson dont les versions sont dépliées
  let versions = [];
  let kind = 'all'; // filtre : all, wiz (seulement dans l'assistant), empty (vides)
  const selected = new Set(); // chansons cochées
  let lastSel = null; // dernière case cliquée (Maj+clic)
  let order = []; // ids affichés, dans l'ordre
  let pending = null; // ids à supprimer, en attente de confirmation

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }

  /** « à l'instant », « il y a 5 min », « hier à 21:04 », « 3 nov. à 10:12 » */
  function when(t) {
    const d = Date.now() - t;
    if (d < 60e3) return 'à l’instant';
    if (d < 3600e3) return `il y a ${Math.round(d / 60e3)} min`;
    const date = new Date(t);
    const hm = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const today = new Date();
    const yest = new Date(Date.now() - 864e5);
    if (date.toDateString() === today.toDateString()) return `aujourd’hui à ${hm}`;
    if (date.toDateString() === yest.toDateString()) return `hier à ${hm}`;
    return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })} à ${hm}`;
  }

  async function refresh() {
    try {
      songs = await SS.store.list();
      versions = openVersions ? await SS.store.versions(openVersions) : [];
    } catch (e) {
      songs = [];
    }
    render();
  }

  /** Chanson vide (ni piste ni travail de l'assistant) ; chanson qui n'existe que dans l'assistant. */
  const isEmpty = (s) => !s.tracks && !s.wiz;
  const wizOnly = (s) => !s.tracks && !!s.wiz;
  const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

  function render() {
    const q = $('#songsFilter').value.trim().toLowerCase();
    const cur = app.project().id;
    const byKind = { all: () => true, wiz: wizOnly, empty: isEmpty };
    const shown = songs.filter((s) => (!q || s.title.toLowerCase().includes(q)) && byKind[kind](s));
    order = shown.map((s) => s.id);
    // la sélection ne garde que des chansons encore là (et jamais la chanson en cours)
    [...selected].forEach((id) => (id === cur || !songs.some((s) => s.id === id)) && selected.delete(id));
    $('#songsCount').textContent = `${songs.length} chanson${songs.length > 1 ? 's' : ''}`;
    const counts = { all: songs.length, wiz: songs.filter(wizOnly).length, empty: songs.filter(isEmpty).length };
    el.querySelectorAll('.songs-cnt').forEach((c) => (c.textContent = counts[c.dataset.c]));
    const empties = songs.filter((s) => isEmpty(s) && s.id !== cur);
    const del = $('#songsDelEmpty');
    del.hidden = !empties.length;
    del.textContent = `Supprimer ${empties.length > 1 ? `les ${empties.length} vides` : 'la chanson vide'}…`;
    $('#songsSelbar').hidden = !selected.size;
    $('#songsSelCount').textContent = `${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}`;
    const list = $('#songsList');
    if (!shown.length) {
      const msg = !songs.length ? 'Aucune chanson enregistrée pour l’instant.' : kind === 'empty' && !q ? 'Aucune chanson vide.' : kind === 'wiz' && !q ? 'Aucune chanson seulement dans l’assistant.' : 'Aucune chanson ne correspond.';
      list.replaceChildren(h('p', { class: 'dlg-hint songs-empty' }, msg));
      return;
    }
    list.replaceChildren(
      ...shown.map((s) => {
        const isCur = s.id === cur;
        const sel = selected.has(s.id);
        const wiz = wizOnly(s);
        const empty = isEmpty(s);
        const trash = h('button', { type: 'button', class: 'btn btn-small song-trash', disabled: isCur, title: isCur ? 'Impossible de supprimer la chanson en cours' : 'Supprimer', 'aria-label': `Supprimer « ${s.title} »`, onclick: () => askRemove([s]) });
        trash.innerHTML = TRASH;
        const what = wiz ? 'dans l’assistant, pas encore de piste' : empty ? 'rien dedans' : `${s.tracks} piste${s.tracks > 1 ? 's' : ''}`;
        const row = h(
          'div',
          { class: 'song-row' + (isCur ? ' current' : '') + (sel ? ' selected' : '') + (empty ? ' empty' : ''), 'data-id': s.id },
          h('input', { type: 'checkbox', class: 'song-check', checked: sel, disabled: isCur, 'aria-label': `Sélectionner « ${s.title} »`, onclick: (e) => toggleSel(s.id, e) }),
          h(
            'div',
            { class: 'song-info' },
            h('span', { class: 'song-title' }, s.title,
              isCur ? h('span', { class: 'song-badge' }, 'en cours') : null,
              wiz ? h('span', { class: 'song-tag wiz', title: 'Le travail de l’assistant « Nouvelle chanson », pas encore dans la grille' }, `✦ Assistant${s.wiz.label ? ' · ' + s.wiz.label : ''}`) : null,
              empty && !isCur ? h('span', { class: 'song-tag empty' }, 'vide') : null),
            h(
              'span',
              { class: 'song-meta' },
              `${when(s.updated)} · ${s.tempo} BPM · ${what}`,
              s.file ? h('span', { class: 'song-file', title: 'Fichier mis à jour automatiquement' }, ` · 📄 ${s.file}`) : null
            )
          ),
          h('div', { class: 'song-actions' },
            h('button', { type: 'button', class: 'btn btn-small' + (wiz && !isCur ? ' btn-resume' : ''), disabled: isCur, title: wiz ? 'Rouvrir dans l’assistant, à l’étape où tu l’as laissée' : null, onclick: () => openSong(s.id) }, wiz ? 'Reprendre' : 'Ouvrir'),
            h('button', { type: 'button', class: 'btn btn-small' + (openVersions === s.id ? ' active' : ''), 'aria-expanded': openVersions === s.id ? 'true' : 'false', onclick: () => toggleVersions(s.id) }, 'Versions'),
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => duplicate(s.id) }, 'Dupliquer'),
            trash
          )
        );
        if (openVersions !== s.id) return row;
        const vlist = h(
          'div',
          { class: 'song-versions' },
          versions.length
            ? versions.map((v, i) =>
                h(
                  'div',
                  { class: 'song-version' },
                  h('span', {}, when(v.at), i === 0 ? h('em', {}, ' · la plus récente') : null),
                  h('span', { class: 'song-meta' }, `${v.title} · ${v.tracks} piste${v.tracks > 1 ? 's' : ''}`),
                  h('button', { type: 'button', class: 'btn btn-small', onclick: () => restore(s.id, v.vid) }, 'Restaurer')
                )
              )
            : h('p', { class: 'dlg-hint' }, 'Pas encore de version : un instantané est gardé au plus toutes les 10 minutes de travail.'),
          h('p', { class: 'dlg-hint', 'data-helpify': true }, 'Restaurer ouvre la version choisie ; l’état actuel est gardé dans les versions.')
        );
        return h('div', { class: 'song-group' }, row, vlist);
      })
    );
  }

  /** Case à cocher ; Maj+clic coche (ou décoche) toute la suite depuis la dernière case cliquée. */
  function toggleSel(id, e) {
    const on = !selected.has(id);
    const cur = app.project().id;
    const a = order.indexOf(lastSel);
    const b = order.indexOf(id);
    if (e.shiftKey && a >= 0 && b >= 0) {
      order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => x !== cur && (on ? selected.add(x) : selected.delete(x)));
    } else if (on) selected.add(id);
    else selected.delete(id);
    lastSel = id;
    render();
  }

  /** Confirmation dans la fenêtre : liste des titres (regroupés), puis suppression. */
  function askRemove(list, { empties = false } = {}) {
    if (!list.length) return;
    const n = list.length;
    const one = n === 1;
    $('#songsConfirmTitle').textContent = one ? `Supprimer « ${list[0].title} » ?` : `Supprimer ${n} chansons${empties ? ' vides' : ''} ?`;
    const linked = list.some((s) => s.file);
    $('#songsConfirmSub').textContent = (empties ? 'Elles n’ont ni piste ni travail d’assistant. ' : '') + (one ? 'Ses versions partent avec elle.' : 'Leurs versions partent avec elles.') + (linked ? ' Les fichiers sur le disque ne sont pas touchés.' : '');
    const groups = new Map();
    list.forEach((s) => groups.set(s.title, (groups.get(s.title) || 0) + 1));
    const items = [...groups].map(([t, k]) => (k > 1 ? `${t} (×${k})` : t));
    const MAX = 6;
    const lis = items.slice(0, MAX).map((t) => h('li', {}, t));
    if (items.length > MAX) lis.push(h('li', {}, `… ${items.length - MAX} autre${items.length - MAX > 1 ? 's' : ''}`));
    $('#songsConfirmList').replaceChildren(...lis);
    $('#songsConfirmList').hidden = one;
    $('#songsConfirmYes').textContent = one ? 'Supprimer' : `Supprimer les ${n}`;
    pending = list.map((s) => s.id);
    $('#songsConfirm').hidden = false;
    $('#songsConfirmYes').focus();
  }
  function closeConfirm() {
    pending = null;
    $('#songsConfirm').hidden = true;
  }
  async function confirmRemove() {
    const ids = (pending || []).filter((id) => id !== app.project().id);
    closeConfirm();
    if (!ids.length) return;
    await SS.store.removeMany(ids);
    ids.forEach((id) => selected.delete(id));
    if (ids.includes(openVersions)) openVersions = null;
    await refresh();
  }

  async function openSong(id) {
    const json = await SS.store.get(id);
    if (!json) return;
    await app.loadSong(SS.normalizeProject(JSON.parse(json)), { origin: { kind: 'Mes chansons : chanson ouverte', detail: { id } } });
    el.close();
  }

  async function toggleVersions(id) {
    openVersions = openVersions === id ? null : id;
    await refresh();
  }

  async function duplicate(id) {
    const json = await SS.store.get(id);
    if (!json) return;
    const p = SS.normalizeProject(JSON.parse(json));
    p.id = SS.uid();
    p.title = `${p.title} (copie)`;
    await SS.store.put(p, SS.serialize(p));
    await refresh();
  }

  async function restore(songId, vid) {
    const json = await SS.store.getVersion(vid);
    if (!json) return;
    // l'état actuel de la chanson reste disponible dans ses versions
    if (songId === app.project().id) await app.flush();
    await SS.store.keepVersion(songId);
    const p = SS.normalizeProject(JSON.parse(json));
    p.id = songId;
    await app.loadSong(p, { changed: true, origin: { kind: 'Mes chansons : version restaurée', detail: { id: songId, version: vid } } });
    el.close();
  }

  async function open() {
    await app.flush(); // la chanson en cours apparaît à jour dans la liste
    openVersions = null;
    selected.clear();
    closeConfirm();
    $('#songsFilter').value = '';
    await refresh();
    el.showModal();
  }

  function init(api) {
    app = api;
    el = $('#songsDialog');
    if (!el) return;
    $('#songsFilter').addEventListener('input', render);
    el.querySelectorAll('#songsKind button').forEach((b) =>
      b.addEventListener('click', () => {
        kind = b.dataset.k;
        el.querySelectorAll('#songsKind button').forEach((x) => {
          x.classList.toggle('active', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        render();
      })
    );
    $('#songsDelEmpty').addEventListener('click', () => askRemove(songs.filter((s) => isEmpty(s) && s.id !== app.project().id), { empties: true }));
    $('#songsSelNone').addEventListener('click', () => {
      selected.clear();
      render();
    });
    $('#songsSelDel').addEventListener('click', () => askRemove(songs.filter((s) => selected.has(s.id))));
    $('#songsConfirmNo').addEventListener('click', closeConfirm);
    $('#songsConfirmYes').addEventListener('click', confirmRemove);
    $('#songsClose').addEventListener('click', () => el.close());
    el.addEventListener('cancel', (e) => {
      if (!pending) return;
      e.preventDefault();
      closeConfirm();
    });
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Échap ferme d'abord la confirmation, pas la fenêtre
      if (e.key === 'Escape' && pending) {
        e.preventDefault();
        closeConfirm();
      }
    });
  }

  return { init, open };
})();
