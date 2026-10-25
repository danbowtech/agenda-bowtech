// Starea aplicației în memorie: cheia, datele decriptate, salvarea și sincronizarea.

import { kvGet, kvSet, kvDel } from './storage.js';
import * as C from './crypto.js';
import * as G from './github.js';
import { emptyDB, normalizeDB, mergeDB, fingerprint } from './model.js';

export const S = {
  dk: null,        // cheia datelor (doar în memorie, cât timp agenda e deblocată)
  keyWrap: null,   // cheia împachetată cu parola
  db: null,        // datele decriptate
  cfg: null,       // setările acestui telefon (GitHub, mementouri trimise), criptate local
  sync: { state: 'off', error: null },
};

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = what => listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });

export const isUnlocked = () => !!S.dk;
export const hasVault = async () => C.isVault(await kvGet('vault'));

// ---------- salvare locală ----------

let saveChain = Promise.resolve();
function persist() {
  const job = saveChain.then(async () => {
    if (!S.dk) return null;
    const vault = await C.sealVault(S.db, S.dk, S.keyWrap);
    await kvSet('vault', vault);
    return vault;
  });
  saveChain = job.catch(e => console.error('Salvare eșuată', e));
  return job;
}

async function loadCfg() {
  const box = await kvGet('config');
  return box ? C.decryptJSON(box, S.dk) : {};
}

export async function saveCfg() {
  if (S.dk) await kvSet('config', await C.encryptJSON(S.cfg, S.dk));
}

async function setup(dk, keyWrap, db, cfg) {
  S.dk = dk;
  S.keyWrap = keyWrap;
  S.db = normalizeDB(db);
  S.cfg = cfg;
  updateSyncState();
  await persist();
  await saveCfg();
  emit('unlock');
}

export async function createNew(password) {
  const dk = await C.newDataKey();
  await setup(dk, await C.makeKeyWrap(password, dk), emptyDB(), {});
}

export async function unlock(password) {
  const vault = await kvGet('vault');
  const dk = await C.openKeyWrap(vault.keyWrap, password);
  await unlockWithKey(dk, vault);
}

export async function unlockWithKey(dk, vault) {
  vault = vault || await kvGet('vault');
  const db = await C.decryptJSON(vault, dk);
  S.dk = dk;
  S.keyWrap = vault.keyWrap;
  S.db = normalizeDB(db);
  S.cfg = await loadCfg();
  updateSyncState();
  emit('unlock');
}

export async function lock() {
  await Promise.race([syncing || Promise.resolve(), new Promise(r => setTimeout(r, 8000))]);
  await saveChain;
  S.dk = null; S.db = null; S.cfg = null; S.keyWrap = null;
  emit('lock');
}

export async function changePassword(oldPwd, newPwd) {
  await C.openKeyWrap(S.keyWrap, oldPwd); // verifică parola veche
  S.keyWrap = await C.makeKeyWrap(newPwd, S.dk);
  await persist();
  markPending();
}

export async function checkPassword(pwd) {
  await C.openKeyWrap(S.keyWrap, pwd);
}

// ---------- modificări ----------

export function put(kind, rec) {
  rec.updatedAt = Math.max(Date.now(), (rec.updatedAt || 0) + 1);
  S.db[kind][rec.id] = rec;
  changed();
  return rec;
}

export function remove(kind, id) {
  S.db[kind][id] = { id, deleted: true, updatedAt: Math.max(Date.now(), (S.db[kind][id]?.updatedAt || 0) + 1) };
  changed();
}

export function setSettings(patch) {
  S.db.settings = { ...S.db.settings, ...patch, updatedAt: Math.max(Date.now(), (S.db.settings.updatedAt || 0) + 1) };
  changed();
}

function changed() {
  persist();
  markPending();
  emit('data');
}

function markPending() {
  if (!S.cfg?.gh) return;
  S.cfg.pending = true;
  saveCfg();
  updateSyncState();
  scheduleSync();
}

// ---------- copia de siguranță ----------

let syncTimer = null;
let syncing = null;

export function scheduleSync(ms = 15000) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), ms);
}

function updateSyncState(state, error) {
  if (!S.cfg?.gh) S.sync = { state: 'off', error: null };
  else if (state) S.sync = { state, error: error || null };
  else if (S.cfg.lastError) S.sync = { state: 'error', error: S.cfg.lastError };
  else S.sync = { state: S.cfg.pending ? 'pending' : 'ok', error: null };
  emit('sync');
}

export class MismatchError extends Error {
  constructor() {
    super('Copia din GitHub a fost făcută cu altă parolă sau altă agendă. Deschide Setări → Copie de siguranță.');
    this.code = 'MISMATCH';
  }
}

async function readRemote(cfg) {
  const text = await G.readFile(cfg, 'date.json');
  if (!text) return null;
  let v;
  try { v = JSON.parse(text); } catch { v = null; }
  if (!C.isVault(v)) throw new Error('Fișierul date.json din GitHub nu este o copie a agendei.');
  return v;
}

export function syncNow() {
  if (!S.cfg?.gh || !S.dk) return Promise.resolve();
  if (syncing) return syncing;
  clearTimeout(syncTimer);
  syncing = (async () => {
    updateSyncState('busy');
    const cfg = S.cfg.gh;
    try {
      const head = await G.getHead(cfg);
      if (!head) S.cfg.pending = true;
      else if (head !== S.cfg.lastHead) {
        const remote = await readRemote(cfg);
        if (!remote) S.cfg.pending = true;
        else {
          let rdb;
          try { rdb = normalizeDB(await C.decryptJSON(remote, S.dk)); } catch (e) {
            if (e.code === 'KEY_MISMATCH') throw new MismatchError();
            throw e;
          }
          const before = fingerprint(S.db);
          S.db = mergeDB(S.db, rdb);
          // parola a fost schimbată pe alt dispozitiv
          if ((remote.keyWrap.at || 0) > (S.keyWrap.at || 0)) S.keyWrap = remote.keyWrap;
          const after = fingerprint(S.db);
          if (after !== fingerprint(rdb)) S.cfg.pending = true;
          await persist();
          if (after !== before) emit('data');
        }
      }
      if (S.cfg.pending) {
        const vault = await persist();
        S.cfg.lastHead = await G.writeBackup(cfg, JSON.stringify(vault));
        S.cfg.pending = false;
      } else {
        S.cfg.lastHead = head;
      }
      S.cfg.lastSync = Date.now();
      S.cfg.lastError = null;
      S.cfg.mismatch = false;
    } catch (e) {
      console.warn('Sincronizare', e);
      if (S.cfg) {
        S.cfg.lastError = e.message;
        S.cfg.mismatch = e.code === 'MISMATCH';
      }
    } finally {
      if (S.cfg) { await saveCfg().catch(() => {}); updateSyncState(); }
      syncing = null;
    }
  })();
  return syncing;
}

// `api` există doar pentru teste (un GitHub simulat)
function ghCfg({ owner, repo, token, api }) {
  const cfg = {
    owner: owner.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//, '').replace(/\/.*$/, ''),
    repo: repo.trim().replace(/\.git$/, ''),
    token: token.trim(),
  };
  if (api) cfg.api = api;
  return cfg;
}

// Conectează depozitul. Întoarce { private, hasBackup, mismatch }
export async function connectGitHub({ owner, repo, token, api }) {
  const cfg = ghCfg({ owner, repo, token, api });
  const info = await G.checkRepo(cfg);
  cfg.branch = info.branch;
  const remote = await readRemote(cfg).catch(e => { if (e.status) throw e; return null; });
  let mismatch = false;
  if (remote) {
    try { await C.decryptJSON(remote, S.dk); } catch { mismatch = true; }
  }
  S.cfg.gh = cfg;
  S.cfg.lastHead = null; // la prima sincronizare citim și îmbinăm ce e acolo
  S.cfg.lastError = null;
  S.cfg.mismatch = mismatch;
  await saveCfg();
  updateSyncState();
  return { private: info.private, hasBackup: !!remote, mismatch };
}

export async function disconnectGitHub() {
  delete S.cfg.gh;
  S.cfg.pending = false;
  S.cfg.lastError = null;
  S.cfg.mismatch = false;
  await saveCfg();
  updateSyncState();
}

// Copia din GitHub e criptată cu altă cheie: o deschidem cu parola ei, o îmbinăm și
// de acum folosim cheia ei (astfel toate dispozitivele au aceeași cheie).
export async function adoptRemote(password) {
  const remote = await readRemote(S.cfg.gh);
  if (!remote) return;
  const rdk = await C.openKeyWrap(remote.keyWrap, password);
  const rdb = normalizeDB(await C.decryptJSON(remote, rdk));
  S.db = mergeDB(S.db, rdb);
  S.dk = rdk;
  S.keyWrap = remote.keyWrap;
  await kvDel('bio');
  S.cfg.mismatch = false;
  S.cfg.lastError = null;
  S.cfg.lastHead = null;
  S.cfg.pending = true;
  await persist();
  await saveCfg();
  emit('data');
  return syncNow();
}

export async function listVersions() {
  return G.listVersions(S.cfg.gh);
}

// Deschide o copie (din GitHub sau din fișier). Dacă e făcută cu altă cheie, cere parola.
export async function openVault(vault, password) {
  try { return normalizeDB(await C.decryptJSON(vault, S.dk)); } catch (e) {
    if (e.code !== 'KEY_MISMATCH') throw e;
    if (!password) throw new MismatchError();
    const k = await C.openKeyWrap(vault.keyWrap, password);
    return normalizeDB(await C.decryptJSON(vault, k));
  }
}

export async function readVersion(path) {
  const text = await G.readFile(S.cfg.gh, path);
  const v = JSON.parse(text);
  if (!C.isVault(v)) throw new Error('Copia nu este validă.');
  return v;
}

// Readuce agenda exact cum era în `old` (ce s-a adăugat după aceea se șterge).
export function restoreSnapshot(old) {
  const now = Date.now();
  const out = { v: 1, clients: {}, sessions: {} };
  for (const kind of ['clients', 'sessions']) {
    const ids = new Set([...Object.keys(S.db[kind]), ...Object.keys(old[kind])]);
    for (const id of ids) {
      // trebuie să fie mai nou decât orice versiune existentă, ca să câștige la îmbinare
      const t = Math.max(now, (S.db[kind][id]?.updatedAt || 0) + 1, (old[kind][id]?.updatedAt || 0) + 1);
      out[kind][id] = old[kind][id] ? { ...old[kind][id], updatedAt: t } : { id, deleted: true, updatedAt: t };
    }
  }
  out.settings = { ...old.settings, updatedAt: Math.max(now, (S.db.settings.updatedAt || 0) + 1) };
  S.db = out;
  changed();
}

export function mergeIn(other) {
  S.db = mergeDB(S.db, other);
  changed();
}

export async function exportText() {
  const vault = await persist();
  return JSON.stringify(vault);
}

// ---------- prima pornire: restaurare ----------

export async function restoreFromGitHub({ owner, repo, token, api }, password) {
  const cfg = ghCfg({ owner, repo, token, api });
  const info = await G.checkRepo(cfg);
  cfg.branch = info.branch;
  const head = await G.getHead(cfg);
  const remote = head ? await readRemote(cfg) : null;
  if (!remote) {
    const e = new Error('În acest depozit nu există încă o copie a agendei.');
    e.code = 'NO_BACKUP';
    throw e;
  }
  const dk = await C.openKeyWrap(remote.keyWrap, password);
  const db = await C.decryptJSON(remote, dk);
  await setup(dk, remote.keyWrap, db, { gh: cfg, lastHead: head, lastSync: Date.now() });
}

export async function restoreFromFile(text, password) {
  let vault;
  try { vault = JSON.parse(text); } catch { vault = null; }
  if (!C.isVault(vault)) throw new Error('Fișierul ales nu este o copie a agendei.');
  const dk = await C.openKeyWrap(vault.keyWrap, password);
  const db = await C.decryptJSON(vault, dk);
  await setup(dk, vault.keyWrap, db, {});
}

export function parseVaultFile(text) {
  let v;
  try { v = JSON.parse(text); } catch { v = null; }
  if (!C.isVault(v)) throw new Error('Fișierul ales nu este o copie a agendei.');
  return v;
}

// Șterge tot de pe acest telefon (copia din GitHub rămâne)
export async function wipeLocal() {
  await kvDel('vault');
  await kvDel('config');
  await kvDel('bio');
  S.dk = null; S.db = null; S.cfg = null; S.keyWrap = null;
}
