// Copia de siguranță într-un depozit privat GitHub.
//
// În depozit se păstrează mereu un singur „commit”, fără istoric, ca depozitul să
// nu crească la nesfârșit. Commit-ul conține:
//   date.json                – ultima versiune (criptată)
//   zilnic/AAAA-LL-ZZ.json   – câte o versiune pe zi, pentru ultimele KEEP_DAYS zile
//   README.md                – explicație

import { dateKey, addDays } from './util.js';

export const KEEP_DAYS = 14;
const README = '# Agenda Bowtech – copie de siguranță\n\nAici se află copia criptată a agendei. ' +
  'Fișierele nu pot fi citite fără parola agendei.\n\n**Nu șterge acest depozit și nu îl face public.**\n';

export class GhError extends Error {
  constructor(status, detail) {
    super(ghMessage(status));
    this.status = status;
    this.detail = detail;
  }
}

function ghMessage(status) {
  if (status === 0) return 'Nu există conexiune la internet. Copia se va face când revine conexiunea.';
  if (status === 401) return 'Tokenul GitHub nu mai este valid (poate a expirat). Fă unul nou și pune-l în Setări.';
  if (status === 403) return 'Tokenul GitHub nu are voie să scrie în depozit. Verifică permisiunea „Contents: Read and write”.';
  if (status === 404) return 'Depozitul nu a fost găsit. Verifică numele de utilizator, numele depozitului și ca tokenul să aibă acces la el.';
  if (status === 422) return 'GitHub a refuzat salvarea. Încearcă din nou peste un minut.';
  return `Eroare GitHub (${status}). Încearcă din nou mai târziu.`;
}

const enc = s => encodeURIComponent(s);

async function gh(cfg, path, { method = 'GET', body, accept, text } = {}) {
  const url = (cfg.api || 'https://api.github.com') + path;
  // un token lipit greșit (spații, diacritice) ar da altfel o eroare de rețea
  if (!cfg.token || /[^\x21-\x7e]/.test(cfg.token)) throw new GhError(401, 'token invalid');
  let r;
  try {
    r = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: accept || 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new GhError(0, String(e));
  }
  if (!r.ok) throw new GhError(r.status, await r.text().catch(() => ''));
  if (r.status === 204) return null;
  return text ? r.text() : r.json();
}

const repoPath = cfg => `/repos/${enc(cfg.owner)}/${enc(cfg.repo)}`;

// Verifică depozitul; întoarce { private, branch }
export async function checkRepo(cfg) {
  const info = await gh(cfg, repoPath(cfg));
  return { private: !!info.private, branch: info.default_branch || 'main', fullName: info.full_name };
}

// sha-ul commit-ului curent sau null dacă depozitul e gol
export async function getHead(cfg) {
  try {
    const ref = await gh(cfg, `${repoPath(cfg)}/git/ref/heads/${enc(cfg.branch)}`);
    return ref.object.sha;
  } catch (e) {
    if (e.status === 409 || e.status === 404) return null;
    throw e;
  }
}

export async function readFile(cfg, path) {
  try {
    return await gh(cfg, `${repoPath(cfg)}/contents/${path}?ref=${enc(cfg.branch)}`,
      { accept: 'application/vnd.github.raw+json', text: true });
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Un depozit complet gol nu acceptă commit-uri prin API-ul git; îl inițializăm cu README.
async function initRepo(cfg) {
  await gh(cfg, `${repoPath(cfg)}/contents/README.md`, {
    method: 'PUT',
    body: { message: 'Inițializare copie de siguranță', content: btoa(unescape(encodeURIComponent(README))) },
  });
  const info = await checkRepo(cfg);
  cfg.branch = info.branch;
  return getHead(cfg);
}

// Scrie copia; întoarce sha-ul noului commit
export async function writeBackup(cfg, text, now = new Date()) {
  let head = await getHead(cfg);
  if (!head) head = await initRepo(cfg);

  const commit = await gh(cfg, `${repoPath(cfg)}/git/commits/${head}`);
  const tree = await gh(cfg, `${repoPath(cfg)}/git/trees/${commit.tree.sha}?recursive=1`);
  const blob = await gh(cfg, `${repoPath(cfg)}/git/blobs`, { method: 'POST', body: { content: text, encoding: 'utf-8' } });

  const today = dateKey(now);
  const oldest = dateKey(addDays(now, -KEEP_DAYS + 1));
  const entries = [
    { path: 'date.json', mode: '100644', type: 'blob', sha: blob.sha },
    { path: `zilnic/${today}.json`, mode: '100644', type: 'blob', sha: blob.sha },
  ];
  const paths = new Set(tree.tree.map(t => t.path));
  if (!paths.has('README.md')) {
    const rb = await gh(cfg, `${repoPath(cfg)}/git/blobs`, { method: 'POST', body: { content: README, encoding: 'utf-8' } });
    entries.push({ path: 'README.md', mode: '100644', type: 'blob', sha: rb.sha });
  }
  for (const t of tree.tree) {
    const m = /^zilnic\/(\d{4}-\d{2}-\d{2})\.json$/.exec(t.path);
    if (t.type === 'blob' && m && m[1] < oldest) entries.push({ path: t.path, mode: '100644', type: 'blob', sha: null });
  }

  const newTree = await gh(cfg, `${repoPath(cfg)}/git/trees`, { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
  const newCommit = await gh(cfg, `${repoPath(cfg)}/git/commits`, {
    method: 'POST',
    body: { message: `Copie de siguranță ${today} ${now.toTimeString().slice(0, 5)}`, tree: newTree.sha, parents: [] },
  });
  await gh(cfg, `${repoPath(cfg)}/git/refs/heads/${enc(cfg.branch)}`, {
    method: 'PATCH', body: { sha: newCommit.sha, force: true },
  });
  return newCommit.sha;
}

// Versiunile zilnice disponibile, cele mai noi primele
export async function listVersions(cfg) {
  const head = await getHead(cfg);
  if (!head) return [];
  const commit = await gh(cfg, `${repoPath(cfg)}/git/commits/${head}`);
  const tree = await gh(cfg, `${repoPath(cfg)}/git/trees/${commit.tree.sha}?recursive=1`);
  return tree.tree
    .map(t => /^zilnic\/(\d{4}-\d{2}-\d{2})\.json$/.exec(t.path))
    .filter(Boolean)
    .map(m => ({ path: m[0], day: m[1] }))
    .sort((a, b) => b.day.localeCompare(a.day));
}
