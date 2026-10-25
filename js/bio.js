// Deblocare cu amprenta (sau fața), prin WebAuthn cu extensia PRF.
// Amprenta produce un secret care „împachetează” cheia datelor doar pe acest telefon.
// Parola rămâne necesară pe un telefon nou și dacă amprenta nu mai funcționează.

import { kvGet, kvSet, kvDel } from './storage.js';
import { toB64, fromB64, randomBytes, kekFromSecret, wrapWith, unwrapWith } from './crypto.js';

export async function bioPossible() {
  try {
    return !!globalThis.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

export const bioEnrolled = async () => !!(await kvGet('bio'));
export const bioRemove = () => kvDel('bio');

async function prfSecret(credId, salt) {
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credId }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  const out = a.getClientExtensionResults().prf?.results?.first;
  if (!out) throw unsupported();
  return new Uint8Array(out);
}

function unsupported() {
  const e = new Error('Telefonul acesta nu permite deblocarea cu amprenta pentru aplicații web. Folosește parola.');
  e.code = 'PRF_UNSUPPORTED';
  return e;
}

export async function bioEnroll(dataKey) {
  const salt = randomBytes(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Agenda Bowtech' },
      user: { id: randomBytes(16), name: 'agenda-bowtech', displayName: 'Agenda Bowtech' },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  const ext = cred.getClientExtensionResults();
  if (!ext.prf?.enabled && !ext.prf?.results) throw unsupported();
  const credId = new Uint8Array(cred.rawId);
  const secret = ext.prf.results?.first ? new Uint8Array(ext.prf.results.first) : await prfSecret(credId, salt);
  const kek = await kekFromSecret(secret);
  await kvSet('bio', { credId: toB64(credId), salt: toB64(salt), wrapped: await wrapWith(kek, dataKey) });
}

export async function bioUnlock() {
  const bio = await kvGet('bio');
  if (!bio) throw new Error('Amprenta nu este activată.');
  const secret = await prfSecret(fromB64(bio.credId), fromB64(bio.salt));
  return unwrapWith(await kekFromSecret(secret), bio.wrapped);
}
