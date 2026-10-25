// GitHub simulat pentru teste (doar ce folosește aplicația)
import http from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// ---- GitHub simulat (doar ce folosește aplicația) ----
export function fakeGitHub({ empty = false } = {}) {
  const objects = new Map(); // sha -> {type, ...}
  const refs = {};
  const sha = x => createHash('sha1').update(JSON.stringify(x) + Math.random()).digest('hex');
  const put = o => { const s = sha(o); objects.set(s, o); return s; };
  const flatten = (treeSha, prefix = '') => {
    const out = [];
    for (const e of objects.get(treeSha).entries) out.push({ ...e, path: prefix + e.path });
    return out;
  };
  const treeFrom = entries => put({ type: 'tree', entries });
  if (!empty) {
    const b = put({ type: 'blob', content: 'readme' });
    const t = treeFrom([{ path: 'README.md', mode: '100644', type: 'blob', sha: b }]);
    refs.main = put({ type: 'commit', tree: t, parents: [] });
  }
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    body = body ? JSON.parse(body) : null;
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace('/repos/eu/date', '');
    const send = (code, obj, raw) => { res.writeHead(code, { 'Content-Type': raw ? 'text/plain' : 'application/json' }); res.end(raw ? obj : JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer tok') return send(401, { message: 'Bad credentials' });
    let m;
    if (p === '' && req.method === 'GET') return send(200, { private: true, default_branch: 'main', full_name: 'eu/date' });
    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(p))) {
      if (!Object.keys(refs).length) return send(409, { message: 'Git Repository is empty.' });
      return refs[m[1]] ? send(200, { object: { sha: refs[m[1]] } }) : send(404, {});
    }
    if (!Object.keys(refs).length && p.startsWith('/git/')) return send(409, { message: 'Git Repository is empty.' });
    if ((m = /^\/contents\/(.+)$/.exec(p))) {
      if (req.method === 'PUT') {
        const b = put({ type: 'blob', content: Buffer.from(body.content, 'base64').toString() });
        const t = treeFrom([{ path: m[1], mode: '100644', type: 'blob', sha: b }]);
        refs.main = put({ type: 'commit', tree: t, parents: [] });
        return send(201, {});
      }
      const head = refs.main;
      if (!head) return send(404, {});
      const e = flatten(objects.get(head).tree).find(x => x.path === m[1]);
      return e ? send(200, objects.get(e.sha).content, true) : send(404, {});
    }
    if ((m = /^\/git\/commits\/(\w+)$/.exec(p))) return send(200, { tree: { sha: objects.get(m[1]).tree } });
    if (p === '/git/commits' && req.method === 'POST') return send(201, { sha: put({ type: 'commit', tree: body.tree, parents: body.parents }) });
    if ((m = /^\/git\/trees\/(\w+)$/.exec(p))) return send(200, { tree: flatten(m[1]) });
    if (p === '/git/trees' && req.method === 'POST') {
      const map = new Map(flatten(body.base_tree).map(e => [e.path, e]));
      for (const e of body.tree) e.sha === null ? map.delete(e.path) : map.set(e.path, e);
      return send(201, { sha: treeFrom([...map.values()]) });
    }
    if (p === '/git/blobs' && req.method === 'POST') return send(201, { sha: put({ type: 'blob', content: body.content }) });
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(p)) && req.method === 'PATCH') {
      assert.equal(body.force, true);
      refs[m[1]] = body.sha;
      return send(200, {});
    }
    send(404, { message: 'nu există ' + p });
  });
  return new Promise(r => server.listen(0, () => r({
    server, refs, objects,
    files: () => refs.main ? flatten(objects.get(refs.main).tree).map(e => e.path).sort() : [],
    cfg: { owner: 'eu', repo: 'date', token: 'tok', branch: 'main', api: `http://127.0.0.1:${server.address().port}` },
  })));
}

