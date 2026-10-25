// Criptarea datelor.
//
// Datele sunt criptate cu o cheie aleatoare (AES-GCM, 256 biți). Cheia aceasta este
// „împachetată” (AES-KW) cu o cheie obținută din parolă prin PBKDF2-SHA256.
// Astfel, schimbarea parolei nu cere recriptarea datelor, iar copia de siguranță
// poate fi deschisă pe orice telefon nou doar cu parola.

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export const KDF_ITER = 600000;

export function toB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const randomBytes = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
const canZip = typeof CompressionStream !== 'undefined';
const gzip = b => pipe(b, new CompressionStream('gzip'));
const gunzip = b => pipe(b, new DecompressionStream('gzip'));

export function newDataKey() {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function passwordKek(password, salt, iter) {
  const base = await subtle.importKey('raw', te.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

export async function wrapWith(kek, dataKey) {
  return toB64(await subtle.wrapKey('raw', dataKey, kek, 'AES-KW'));
}

export function unwrapWith(kek, wrapped) {
  return subtle.unwrapKey('raw', fromB64(wrapped), kek, 'AES-KW',
    { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// Creează „încuietoarea” cheii pentru o parolă
export async function makeKeyWrap(password, dataKey, iter = KDF_ITER) {
  const salt = randomBytes(16);
  const kek = await passwordKek(password, salt, iter);
  return { kdf: 'PBKDF2-SHA256', iter, salt: toB64(salt), wrapped: await wrapWith(kek, dataKey), at: Date.now() };
}

// Aruncă eroare dacă parola e greșită
export async function openKeyWrap(keyWrap, password) {
  const kek = await passwordKek(password, fromB64(keyWrap.salt), keyWrap.iter);
  try {
    return await unwrapWith(kek, keyWrap.wrapped);
  } catch {
    const e = new Error('Parolă greșită');
    e.code = 'BAD_PASSWORD';
    throw e;
  }
}

export async function encryptJSON(obj, key) {
  let bytes = te.encode(JSON.stringify(obj));
  if (canZip) bytes = await gzip(bytes);
  const iv = randomBytes(12);
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { z: canZip ? 1 : 0, iv: toB64(iv), data: toB64(data) };
}

export async function decryptJSON(box, key) {
  let bytes;
  try {
    bytes = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data)));
  } catch {
    const e = new Error('Datele nu pot fi decriptate cu această cheie');
    e.code = 'KEY_MISMATCH';
    throw e;
  }
  if (box.z) bytes = await gunzip(bytes);
  return JSON.parse(td.decode(bytes));
}

// Pachetul complet care se salvează pe telefon și în copia de siguranță
export async function sealVault(db, dataKey, keyWrap) {
  return { app: 'agenda-bowtech', v: 1, savedAt: Date.now(), keyWrap, ...(await encryptJSON(db, dataKey)) };
}

export function isVault(x) {
  return x && x.app === 'agenda-bowtech' && x.keyWrap && x.iv && x.data;
}

// Cheie din amprenta (WebAuthn PRF)
export async function kekFromSecret(secret) {
  const base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: te.encode('agenda-bowtech'), info: te.encode('amprenta') },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
