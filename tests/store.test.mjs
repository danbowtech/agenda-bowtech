// Sincronizarea completă: telefonul, copia din GitHub și un al doilea dispozitiv.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fakegh.mjs';

// IndexedDB minimal, în memorie
const kv = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      req.result = {
        createObjectStore() {},
        transaction() {
          const t = {};
          t.objectStore = () => ({
            get: k => ({ result: structuredClone(kv.get(k)) }),
            put: (v, k) => { kv.set(k, structuredClone(v)); return { result: k }; },
            delete: k => { kv.delete(k); return {}; },
          });
          setTimeout(() => t.oncomplete?.(), 0);
          return t;
        },
      };
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

const store = await import('../js/store.js');
const C = await import('../js/crypto.js');
const G = await import('../js/github.js');
const { S } = store;

const client = (id, name) => ({ id, name, phone: '', email: '', birth: '', reason: '', notes: '' });

// Simulează un alt telefon care modifică copia din GitHub
async function otherDeviceAdds(cfg, dk, rec) {
  const remote = JSON.parse(await G.readFile(cfg, 'date.json'));
  const db = await C.decryptJSON(remote, dk);
  db.clients[rec.id] = { ...rec, updatedAt: Date.now() + 5 };
  await G.writeBackup(cfg, JSON.stringify({ ...remote, ...(await C.encryptJSON(db, dk)) }));
}

test('telefonul și copia din GitHub se îmbină în ambele sensuri', async () => {
  const gh = await fakeGitHub();
  try {
    await store.createNew('parola-de-test');
    store.put('clients', client('a', 'Maria Popescu'));
    const r = await store.connectGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api });
    assert.deepEqual(r, { private: true, hasBackup: false, mismatch: false });
    await store.syncNow();
    assert.equal(S.cfg.lastError, null);
    assert.equal(S.cfg.pending, false);
    assert.ok(gh.files().includes('date.json'));

    // copia din GitHub e criptată: numele nu apare în clar
    const raw = await G.readFile(gh.cfg, 'date.json');
    assert.ok(!raw.includes('Maria'));

    // alt dispozitiv adaugă un client, iar telefonul adaugă altul în același timp
    await otherDeviceAdds(gh.cfg, S.dk, client('b', 'Ion Ionescu'));
    store.put('clients', client('c', 'Ana Dumitrescu'));
    await store.syncNow();
    assert.equal(S.cfg.lastError, null);
    assert.deepEqual(Object.keys(S.db.clients).sort(), ['a', 'b', 'c']);
    const remote = JSON.parse(await G.readFile(gh.cfg, 'date.json'));
    assert.deepEqual(Object.keys((await C.decryptJSON(remote, S.dk)).clients).sort(), ['a', 'b', 'c']);

    // fără modificări: nu se mai scrie nimic
    const head = gh.refs.main;
    await store.syncNow();
    assert.equal(gh.refs.main, head);

    // un telefon nou restaurează totul doar cu parola
    const dkBefore = S.dk;
    await store.lock();
    await store.wipeLocal();
    await assert.rejects(store.restoreFromGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api }, 'gresita'), e => e.code === 'BAD_PASSWORD');
    await store.restoreFromGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api }, 'parola-de-test');
    assert.deepEqual(Object.keys(S.db.clients).sort(), ['a', 'b', 'c']);
    assert.ok(dkBefore !== S.dk);

    // după blocare, aceeași parolă deschide agenda locală
    await store.lock();
    await store.unlock('parola-de-test');
    assert.equal(S.db.clients.a.name, 'Maria Popescu');
  } finally { gh.server.close(); }
});

test('schimbarea parolei ajunge și în copie', async () => {
  const gh = await fakeGitHub();
  try {
    await store.wipeLocal();
    await store.createNew('veche-parola');
    await store.connectGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api });
    await store.syncNow();
    await store.changePassword('veche-parola', 'noua-parola');
    await store.syncNow();
    await store.lock();
    await store.wipeLocal();
    await assert.rejects(store.restoreFromGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api }, 'veche-parola'));
    await store.restoreFromGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api }, 'noua-parola');
  } finally { gh.server.close(); }
});

test('o copie făcută cu altă parolă nu este suprascrisă; se poate îmbina', async () => {
  const gh = await fakeGitHub();
  try {
    // prima agendă face copia
    await store.wipeLocal();
    await store.createNew('parola-unu');
    store.put('clients', client('x', 'Client Vechi'));
    await store.connectGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api });
    await store.syncNow();
    const headBefore = gh.refs.main;

    // pe alt telefon cineva începe o agendă nouă și conectează același depozit
    await store.lock();
    await store.wipeLocal();
    await store.createNew('parola-doi');
    store.put('clients', client('y', 'Client Nou'));
    const r = await store.connectGitHub({ owner: 'eu', repo: 'date', token: 'tok', api: gh.cfg.api });
    assert.equal(r.mismatch, true);
    await store.syncNow();
    assert.equal(S.cfg.mismatch, true);
    assert.equal(gh.refs.main, headBefore, 'copia veche nu trebuie suprascrisă');

    await assert.rejects(store.adoptRemote('parola-gresita'), e => e.code === 'BAD_PASSWORD');
    await store.adoptRemote('parola-unu');
    assert.equal(S.cfg.lastError, null);
    assert.deepEqual(Object.keys(S.db.clients).sort(), ['x', 'y']);

    // de acum agenda se deschide cu parola copiei
    await store.lock();
    await store.unlock('parola-unu');
    assert.deepEqual(Object.keys(S.db.clients).sort(), ['x', 'y']);
  } finally { gh.server.close(); }
});

test('readucerea unei versiuni vechi șterge ce s-a adăugat după', async () => {
  await store.wipeLocal();
  await store.createNew('parola-trei');
  store.put('clients', client('p', 'Primul'));
  const old = structuredClone(S.db);
  store.put('clients', client('q', 'Al doilea'));
  store.put('clients', { ...S.db.clients.p, name: 'Primul redenumit' });
  store.restoreSnapshot(old);
  assert.equal(S.db.clients.p.name, 'Primul');
  assert.equal(S.db.clients.q.deleted, true);
  assert.ok(S.db.clients.p.updatedAt > old.clients.p.updatedAt);
});
