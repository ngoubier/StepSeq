/*
 * Sons de l'utilisateur rangés dans le navigateur (IndexedDB « stepseq-sounds ») : fichiers audio importés par les
 * pistes génératives (js/ambient.js) et échantillons de batterie d'un projet Ableton (js/midipanel.js, source 'user').
 *   await SS.userSamples.put(arrayBuffer) -> clé (empreinte SHA-1 : le même fichier n'est rangé qu'une fois)
 *   await SS.userSamples.get(clé)         -> ArrayBuffer, ou undefined
 */
window.SS = window.SS || {};
SS.userSamples = (() => {
  let dbp = null;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('pas de stockage'));
      const r = indexedDB.open('stepseq-sounds', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const req = fn(t.objectStore('files'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  async function put(arrayBuffer) {
    const h = await crypto.subtle.digest('SHA-1', arrayBuffer);
    const key = Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
    await tx('readwrite', (s) => s.put(arrayBuffer, key));
    return key;
  }
  const get = (key) => tx('readonly', (s) => s.get(key));
  return { put, get };
})();
