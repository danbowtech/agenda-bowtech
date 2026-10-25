// Testează criptarea, îmbinarea și copia pe GitHub cu un server GitHub simulat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fakegh.mjs';
import * as C from '../js/crypto.js';
import * as G from '../js/github.js';
import { emptyDB, mergeDB } from '../js/model.js';

test('criptare: parola corectă deschide, cea greșită nu', async () => {
  const dk = await C.newDataKey();
  const kw = await C.makeKeyWrap('parola mea lungă', dk, 1000);
  const db = emptyDB();
  db.clients.a = { id: 'a', name: 'Maria Popescu', notes: 'ș ț ă î â', updatedAt: 1 };
  const vault = await C.sealVault(db, dk, kw);
  assert.ok(!JSON.stringify(vault).includes('Maria'));
  const dk2 = await C.openKeyWrap(vault.keyWrap, 'parola mea lungă');
  assert.deepEqual(await C.decryptJSON(vault, dk2), db);
  await assert.rejects(C.openKeyWrap(vault.keyWrap, 'alta'), e => e.code === 'BAD_PASSWORD');
  const other = await C.newDataKey();
  await assert.rejects(C.decryptJSON(vault, other), e => e.code === 'KEY_MISMATCH');
});

test('schimbarea parolei păstrează aceeași cheie', async () => {
  const dk = await C.newDataKey();
  const vault = await C.sealVault(emptyDB(), dk, await C.makeKeyWrap('veche123', dk, 1000));
  const newWrap = await C.makeKeyWrap('noua1234', dk, 1000);
  const dk2 = await C.openKeyWrap(newWrap, 'noua1234');
  assert.ok(await C.decryptJSON(vault, dk2));
});

test('îmbinare: câștigă modificarea mai recentă, ștergerile se păstrează', () => {
  const a = emptyDB(), b = emptyDB();
  a.clients.x = { id: 'x', name: 'Vechi', updatedAt: 1 };
  b.clients.x = { id: 'x', name: 'Nou', updatedAt: 2 };
  a.clients.y = { id: 'y', name: 'Doar pe telefon', updatedAt: 5 };
  b.sessions.s = { id: 's', deleted: true, updatedAt: 9 };
  a.sessions.s = { id: 's', clientId: 'x', start: '2026-10-27T10:00', updatedAt: 3 };
  a.settings.interval = 5; a.settings.updatedAt = 10;
  const m = mergeDB(a, b);
  assert.equal(m.clients.x.name, 'Nou');
  assert.equal(m.clients.y.name, 'Doar pe telefon');
  assert.equal(m.sessions.s.deleted, true);
  assert.equal(m.settings.interval, 5);
});

test('copie pe GitHub: scriere, citire, versiuni zilnice, curățare', async () => {
  const gh = await fakeGitHub();
  const { cfg } = gh;
  try {
    assert.deepEqual(await G.checkRepo(cfg), { private: true, branch: 'main', fullName: 'eu/date' });
    assert.equal(await G.readFile(cfg, 'date.json'), null);
    const day = d => new Date(2026, 9, d, 12);
    for (const d of [1, 2, 3, 10, 20, 25]) await G.writeBackup(cfg, JSON.stringify({ zi: d }), day(d));
    assert.equal(JSON.parse(await G.readFile(cfg, 'date.json')).zi, 25);
    const files = gh.files();
    assert.ok(files.includes('README.md'));
    // păstrăm doar ultimele 14 zile (12–25 octombrie)
    assert.deepEqual(files.filter(f => f.startsWith('zilnic/')), ['zilnic/2026-10-20.json', 'zilnic/2026-10-25.json']);
    const v = await G.listVersions(cfg);
    assert.deepEqual(v.map(x => x.day), ['2026-10-25', '2026-10-20']);
    assert.equal(JSON.parse(await G.readFile(cfg, v[1].path)).zi, 20);
    // aceeași zi de două ori: un singur fișier pe zi, cu ultima versiune
    await G.writeBackup(cfg, JSON.stringify({ zi: 25, a: 2 }), day(25));
    assert.equal(JSON.parse(await G.readFile(cfg, 'zilnic/2026-10-25.json')).a, 2);
    // fără istoric: fiecare commit e singur
    assert.deepEqual(gh.objects.get(gh.refs.main).parents, []);
  } finally { gh.server.close(); }
});

test('copie pe GitHub: depozit complet gol', async () => {
  const gh = await fakeGitHub({ empty: true });
  try {
    assert.equal(await G.getHead(gh.cfg), null);
    await G.writeBackup(gh.cfg, '{"ok":1}', new Date(2026, 9, 25));
    assert.equal(await G.readFile(gh.cfg, 'date.json'), '{"ok":1}');
    assert.ok(gh.files().includes('README.md'));
  } finally { gh.server.close(); }
});

test('copie pe GitHub: token greșit dă mesaj clar', async () => {
  const gh = await fakeGitHub();
  try {
    await assert.rejects(G.checkRepo({ ...gh.cfg, token: 'rău' }), e => e.status === 401 && /token/i.test(e.message));
  } finally { gh.server.close(); }
});
