/*
 * Enregistrement automatique des chansons, sans aucun message.
 *
 *  1. Bibliothèque « Mes chansons » dans le navigateur (IndexedDB) : chaque chanson est enregistrée
 *     sous son identifiant (project.id) peu après chaque modification, avec un historique de versions
 *     (un instantané au plus toutes les 10 minutes, 40 par chanson).
 *  2. Fichier lié (Chrome / Edge, File System Access) : une fois la chanson enregistrée ou ouverte depuis
 *     un fichier, chaque modification réécrit ce fichier. Le lien est gardé d'une session à l'autre ;
 *     après un redémarrage du navigateur, un clic sur l'indicateur redonne l'autorisation d'écrire.
 *
 * Un petit indicateur (#saveStatus) dit où en est l'enregistrement ; il n'y a ni fenêtre ni toast.
 */
window.SS = window.SS || {};

SS.store = (() => {
  const DB_NAME = 'stepseq';
  const VERSION_EVERY = 10 * 60 * 1000; // un instantané au plus toutes les 10 minutes
  const MAX_VERSIONS = 40;
  let dbp = null;

  const req = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));
  const done = (tx) => new Promise((res, rej) => ((tx.oncomplete = () => res()), (tx.onerror = tx.onabort = () => rej(tx.error))));

  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('IndexedDB indisponible'));
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          d.createObjectStore('songs', { keyPath: 'id' });
          const v = d.createObjectStore('versions', { keyPath: 'vid', autoIncrement: true });
          v.createIndex('song', 'songId');
          d.createObjectStore('meta', { keyPath: 'key' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('IndexedDB bloquée'));
      });
      dbp.catch(() => {});
    }
    return dbp;
  }

  async function available() {
    try {
      await db();
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Résumé affiché dans la liste (sans le contenu). */
  function summary(p, json) {
    return {
      id: p.id,
      title: p.title || 'Sans titre',
      tempo: p.tempo,
      tracks: (p.tracks || []).length,
      scenes: (p.scenes || []).length,
      size: json.length,
    };
  }

  async function versionsOf(d, songId) {
    const tx = d.transaction('versions');
    const list = await req(tx.objectStore('versions').index('song').getAll(songId));
    return list.sort((a, b) => b.at - a.at);
  }

  /** Enregistre la chanson. `json` = SS.serialize(project). */
  async function put(project, json) {
    const d = await db();
    const now = Date.now();
    const old = await req(d.transaction('songs').objectStore('songs').get(project.id));
    if (old && old.data === json) return old;
    const song = { ...summary(project, json), created: old ? old.created : now, updated: now, data: json };
    const versions = await versionsOf(d, project.id);
    const tx = d.transaction(['songs', 'versions'], 'readwrite');
    tx.objectStore('songs').put(song);
    if (!versions.length || now - versions[0].at >= VERSION_EVERY) {
      tx.objectStore('versions').add({ songId: project.id, at: now, title: song.title, tracks: song.tracks, data: json });
      versions.slice(MAX_VERSIONS - 1).forEach((v) => tx.objectStore('versions').delete(v.vid));
    }
    await done(tx);
    return song;
  }

  /** Ajoute tout de suite une version avec le contenu enregistré (avant de le remplacer). */
  async function keepVersion(songId) {
    const d = await db();
    const old = await req(d.transaction('songs').objectStore('songs').get(songId));
    if (!old) return;
    const versions = await versionsOf(d, songId);
    if (versions.length && versions[0].data === old.data) return;
    const tx = d.transaction('versions', 'readwrite');
    tx.objectStore('versions').add({ songId, at: Date.now(), title: old.title, tracks: old.tracks, data: old.data });
    await done(tx);
  }

  async function list() {
    const d = await db();
    const all = await req(d.transaction('songs').objectStore('songs').getAll());
    const files = await req(d.transaction('meta').objectStore('meta').getAll());
    const fileOf = new Map(files.filter((m) => m.key.startsWith('file:')).map((m) => [m.key.slice(5), m.handle && m.handle.name]));
    return all.map(({ data, ...s }) => ({ ...s, file: fileOf.get(s.id) || null })).sort((a, b) => b.updated - a.updated);
  }

  async function get(id) {
    const d = await db();
    const s = await req(d.transaction('songs').objectStore('songs').get(id));
    return s ? s.data : null;
  }

  async function versions(id) {
    const d = await db();
    return (await versionsOf(d, id)).map(({ data, ...v }) => v);
  }

  async function getVersion(vid) {
    const d = await db();
    const v = await req(d.transaction('versions').objectStore('versions').get(vid));
    return v ? v.data : null;
  }

  async function remove(id) {
    const d = await db();
    const vs = await versionsOf(d, id);
    const tx = d.transaction(['songs', 'versions', 'meta'], 'readwrite');
    tx.objectStore('songs').delete(id);
    vs.forEach((v) => tx.objectStore('versions').delete(v.vid));
    tx.objectStore('meta').delete('file:' + id);
    await done(tx);
  }

  async function setMeta(key, value) {
    const d = await db();
    const tx = d.transaction('meta', 'readwrite');
    if (value == null) tx.objectStore('meta').delete(key);
    else tx.objectStore('meta').put({ key, ...value });
    await done(tx);
  }
  async function getMeta(key) {
    const d = await db();
    return req(d.transaction('meta').objectStore('meta').get(key));
  }

  /** Demande au navigateur de ne pas effacer ces données pour faire de la place (sans message en général). */
  function persist() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  return { available, put, keepVersion, list, get, versions, getVersion, remove, setMeta, getMeta, persist };
})();

/* ------------------------------------------------------------------ */
/* Enregistrement automatique : bibliothèque + fichier lié, indicateur. */
SS.autosave = (() => {
  const LIB_DELAY = 1200;
  const FILE_DELAY = 2000;
  const $ = (q) => document.querySelector(q);
  let app = null;
  let libOk = false;
  let libTimer = null;
  let fileTimer = null;
  let lastSaved = 0;
  let saving = false;
  // fichier lié à la chanson en cours : { songId, handle, state: 'ok' | 'paused' | 'error' }
  let file = null;
  const memHandles = new Map(); // repli si le lien ne peut pas être rangé dans IndexedDB

  const fsSupported = () => typeof window.showSaveFilePicker === 'function';

  /* ---------- Indicateur ---------- */
  function hhmm(t) {
    return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function render() {
    const el = $('#saveStatus');
    if (!el) return;
    let text;
    let title;
    let cls = '';
    if (!libOk) {
      text = 'Copie locale';
      title = 'La bibliothèque du navigateur est indisponible : seule la dernière chanson est gardée.';
    } else if (saving) {
      text = 'Enregistrement…';
      title = 'Enregistrement automatique en cours';
    } else {
      text = 'Enregistré';
      title = `Enregistré automatiquement dans le navigateur${lastSaved ? ' à ' + hhmm(lastSaved) : ''} (Mes chansons).`;
    }
    if (file && file.state === 'ok') {
      text += ' · ' + file.handle.name;
      title += `\nLe fichier « ${file.handle.name} » est aussi mis à jour à chaque modification.`;
    } else if (file && file.state === 'paused') {
      cls = 'paused';
      text = `Reprendre ${file.handle.name}`;
      title = `Le navigateur demande l'autorisation de continuer à écrire dans « ${file.handle.name} ». Clique pour la donner.`;
    } else if (file && file.state === 'error') {
      cls = 'error';
      text = `${file.handle.name} : non écrit`;
      title = "Le fichier lié n'a pas pu être écrit (déplacé ou supprimé ?). La chanson reste enregistrée dans le navigateur. Clique pour réessayer.";
    }
    el.className = 'save-status ' + cls + (saving ? ' saving' : '');
    el.querySelector('.ss-text').textContent = text;
    el.title = title;
    el.setAttribute('aria-label', title);
  }

  /* ---------- Bibliothèque ---------- */
  function schedule() {
    clearTimeout(libTimer);
    libTimer = setTimeout(saveNow, LIB_DELAY);
    if (file && file.state === 'ok') {
      clearTimeout(fileTimer);
      fileTimer = setTimeout(writeFile, FILE_DELAY);
    }
  }

  async function saveNow() {
    clearTimeout(libTimer);
    if (!libOk) return;
    const p = app.project();
    saving = true;
    render();
    try {
      await SS.store.put(p, SS.serialize(p));
      await SS.store.setMeta('last', { id: p.id });
      lastSaved = Date.now();
    } catch (e) {
      console.warn('Enregistrement automatique impossible', e);
    }
    saving = false;
    render();
  }

  /* ---------- Fichier lié ---------- */
  async function permission(handle, ask) {
    try {
      const opts = { mode: 'readwrite' };
      if ((await handle.queryPermission(opts)) === 'granted') return true;
      return ask ? (await handle.requestPermission(opts)) === 'granted' : false;
    } catch (e) {
      return false;
    }
  }

  async function writeFile() {
    clearTimeout(fileTimer);
    if (!file || file.state !== 'ok') return;
    const p = app.project();
    if (file.songId !== p.id) return;
    try {
      if (!(await permission(file.handle, false))) {
        file.state = 'paused';
        return render();
      }
      const w = await file.handle.createWritable();
      await w.write(SS.serialize(p));
      await w.close();
    } catch (e) {
      console.warn('Écriture du fichier lié impossible', e);
      file.state = 'error';
    }
    render();
  }

  /** Lie un fichier (handle) à la chanson en cours : il sera réécrit à chaque modification. */
  async function linkFile(handle) {
    const p = app.project();
    if (!handle) return;
    file = { songId: p.id, handle, state: 'ok' };
    memHandles.set(p.id, handle);
    try {
      await SS.store.setMeta('file:' + p.id, { handle });
    } catch (e) {
      /* le lien reste valable pour cette session */
    }
    render();
  }

  /** Retrouve le fichier lié de la chanson en cours (au démarrage, à l'ouverture d'une chanson). */
  async function loadFile() {
    const p = app.project();
    file = null;
    let handle = memHandles.get(p.id);
    if (!handle && libOk) {
      try {
        const m = await SS.store.getMeta('file:' + p.id);
        handle = m && m.handle;
      } catch (e) {
        /* ignore */
      }
    }
    if (handle && app.project().id === p.id) {
      file = { songId: p.id, handle, state: (await permission(handle, false)) ? 'ok' : 'paused' };
    }
    SS.files.setHandle(handle || null);
    render();
  }

  /** Clic sur l'indicateur : redonner l'autorisation, réessayer, ou ouvrir « Mes chansons ». */
  async function onStatusClick() {
    if (file && (file.state === 'paused' || file.state === 'error')) {
      if (await permission(file.handle, true)) {
        file.state = 'ok';
        await writeFile();
      }
      return render();
    }
    app.openLibrary();
  }

  /** La chanson en cours a changé (Nouveau, Ouvrir, Mes chansons) : on la range tout de suite. */
  async function songChanged() {
    await loadFile();
    await saveNow();
  }

  async function init(api) {
    app = api;
    const el = $('#saveStatus');
    if (el) el.addEventListener('click', onStatusClick);
    libOk = await SS.store.available();
    if (libOk) SS.store.persist();
    render();
  }

  return {
    init,
    schedule,
    saveNow,
    songChanged,
    linkFile,
    fsSupported,
    libraryAvailable: () => libOk,
    fileName: () => (file ? file.handle.name : null),
  };
})();
