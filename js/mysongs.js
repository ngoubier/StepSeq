/*
 * Fenêtre « Mes chansons » : les chansons enregistrées automatiquement dans le navigateur (js/store.js).
 * Ouvrir, dupliquer, supprimer, et revenir à une version précédente.
 */
window.SS = window.SS || {};
SS.mySongs = (() => {
  const $ = (q, root = document) => root.querySelector(q);
  let app = null;
  let el = null;
  let songs = [];
  let openVersions = null; // id de la chanson dont les versions sont dépliées
  let versions = [];

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

  function render() {
    const q = $('#songsFilter').value.trim().toLowerCase();
    const cur = app.project().id;
    const shown = songs.filter((s) => !q || s.title.toLowerCase().includes(q));
    $('#songsCount').textContent = `${songs.length} chanson${songs.length > 1 ? 's' : ''}`;
    const list = $('#songsList');
    if (!shown.length) {
      list.replaceChildren(h('p', { class: 'dlg-hint songs-empty' }, songs.length ? 'Aucune chanson ne correspond.' : 'Aucune chanson enregistrée pour l’instant.'));
      return;
    }
    list.replaceChildren(
      ...shown.map((s) => {
        const isCur = s.id === cur;
        const row = h(
          'div',
          { class: 'song-row' + (isCur ? ' current' : ''), 'data-id': s.id },
          h(
            'div',
            { class: 'song-info' },
            h('span', { class: 'song-title' }, s.title, isCur ? h('span', { class: 'song-badge' }, 'en cours') : null),
            h(
              'span',
              { class: 'song-meta' },
              `${when(s.updated)} · ${s.tempo} BPM · ${s.tracks} piste${s.tracks > 1 ? 's' : ''}`,
              s.file ? h('span', { class: 'song-file', title: 'Fichier mis à jour automatiquement' }, ` · 📄 ${s.file}`) : null
            )
          ),
          h('div', { class: 'song-actions' },
            h('button', { type: 'button', class: 'btn btn-small', disabled: isCur, onclick: () => openSong(s.id) }, 'Ouvrir'),
            h('button', { type: 'button', class: 'btn btn-small' + (openVersions === s.id ? ' active' : ''), 'aria-expanded': openVersions === s.id ? 'true' : 'false', onclick: () => toggleVersions(s.id) }, 'Versions'),
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => duplicate(s.id) }, 'Dupliquer'),
            h('button', { type: 'button', class: 'btn btn-small btn-danger', disabled: isCur, title: isCur ? 'Impossible de supprimer la chanson en cours' : 'Supprimer de la bibliothèque', onclick: () => remove(s) }, 'Supprimer')
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
          h('p', { class: 'dlg-hint' }, 'Restaurer ouvre la version choisie ; l’état actuel est gardé dans les versions.')
        );
        return h('div', { class: 'song-group' }, row, vlist);
      })
    );
  }

  async function openSong(id) {
    const json = await SS.store.get(id);
    if (!json) return;
    await app.loadSong(SS.normalizeProject(JSON.parse(json)));
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

  async function remove(s) {
    if (!confirm(`Supprimer « ${s.title} » de la bibliothèque, avec ses versions ?\nLe fichier sur le disque, s’il existe, n’est pas touché.`)) return;
    await SS.store.remove(s.id);
    if (openVersions === s.id) openVersions = null;
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
    await app.loadSong(p, { changed: true });
    el.close();
  }

  async function open() {
    await app.flush(); // la chanson en cours apparaît à jour dans la liste
    openVersions = null;
    $('#songsFilter').value = '';
    await refresh();
    el.showModal();
  }

  function init(api) {
    app = api;
    el = $('#songsDialog');
    if (!el) return;
    $('#songsFilter').addEventListener('input', render);
    $('#songsClose').addEventListener('click', () => el.close());
    el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  return { init, open };
})();
