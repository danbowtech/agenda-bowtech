// Depozitare simplă cheie–valoare în IndexedDB (mai sigură decât localStorage).

const DB_NAME = 'agenda-bowtech';
const STORE = 'kv';
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const kvGet = key => tx('readonly', s => s.get(key));
export const kvSet = (key, value) => tx('readwrite', s => s.put(value, key));
export const kvDel = key => tx('readwrite', s => s.delete(key));
