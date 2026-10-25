// Iconițe, ferestre (modale), mesaje scurte.

import { esc } from './util.js';

const I = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  finger: '<path d="M12 11c0 3.5-1 6.5-3 9"/><path d="M8.5 7.6A5 5 0 0 1 17 11c0 1.6-.1 3.2-.4 4.7"/><path d="M5.6 9.5A7 7 0 0 1 19 11c0 2.5-.3 4.8-1 7"/><path d="M15 17.5c-.4 1.3-.9 2.4-1.5 3.5"/><path d="M7 11a5 5 0 0 1 .2-1.4"/><path d="M5 15c.4-1.2.6-2.5.6-4"/><path d="M3.3 6.5A9.9 9.9 0 0 1 12 1a10 10 0 0 1 9.5 7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  history: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;

export const LOGO = `<svg class="logo" viewBox="0 0 96 96" aria-hidden="true">
  <rect width="96" height="96" rx="24" fill="#1f6f6b"/>
  <rect x="22" y="26" width="52" height="48" rx="8" fill="none" stroke="#fff" stroke-width="5"/>
  <line x1="22" y1="40" x2="74" y2="40" stroke="#fff" stroke-width="5"/>
  <line x1="36" y1="20" x2="36" y2="31" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <line x1="60" y1="20" x2="60" y2="31" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <path d="M38 66c0-9 6-16 18-17-1 11-7 17-18 17z" fill="#f3c98b"/>
  <path d="M38 66c4-6 8-9 13-11" stroke="#1f6f6b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;

// ---------- mesaje scurte ----------

let toastTimer;
export function toast(msg, { action, onAction, ms = 4500, kind = '' } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast ${kind}" role="status"><span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}</div>`;
  const el = root.firstElementChild;
  if (action) el.querySelector('button').onclick = () => { root.innerHTML = ''; onAction?.(); };
  toastTimer = setTimeout(() => { if (el.isConnected) el.remove(); }, ms);
}

// ---------- ferestre ----------
// Butonul „înapoi” al telefonului închide fereastra de deasupra.

const stack = [];
const pendingBack = [];

window.addEventListener('popstate', () => {
  if (pendingBack.length) { pendingBack.shift()(); return; }
  const top = stack[stack.length - 1];
  if (top) top.close(true);
});

export function modal(html, { cls = '', onClose, actions = {}, sticky = false } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = `modal-wrap ${cls}`;
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(wrap);
  const m = {
    el: wrap.firstElementChild,
    closed: false,
    set(h) { m.el.innerHTML = h; },
    $(s) { return m.el.querySelector(s); },
    // onClose se cheamă după ce istoricul a revenit, ca să se poată naviga imediat
    close(fromPop = false) {
      if (m.closed) return m.done;
      m.closed = true;
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 160);
      stack.splice(stack.indexOf(m), 1);
      m.done = fromPop ? Promise.resolve() : new Promise(res => { pendingBack.push(res); history.back(); });
      return m.done.then(() => onClose?.());
    },
  };
  wrap.addEventListener('click', e => {
    if (e.target === wrap && !sticky) { m.close(); return; }
    const a = e.target.closest('[data-act]');
    if (a && m.el.contains(a) && actions[a.dataset.act]) {
      e.preventDefault();
      actions[a.dataset.act](a, m, e);
    }
  });
  stack.push(m);
  history.pushState({ modal: true }, '');
  requestAnimationFrame(() => wrap.classList.add('in'));
  return m;
}

export function closeAll() {
  return Promise.all([...stack].reverse().map(m => m.close()));
}

export const hasModal = () => stack.length > 0;

export function confirmBox(text, { ok = 'Da', cancel = 'Renunță', danger = false, title = '' } = {}) {
  return new Promise(resolve => {
    let result = false;
    const m = modal(`
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      <p>${text}</p>
      <div class="btns">
        <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(ok)}</button>
        <button class="btn" data-act="no">${esc(cancel)}</button>
      </div>`, {
      onClose: () => resolve(result),
      actions: {
        ok: () => { result = true; m.close(); },
        no: () => m.close(),
      },
    });
  });
}

// Fereastră cu formular. fields: [{ id, label, type, value, placeholder }]
// check(values) poate întoarce un mesaj de eroare sau arunca o eroare.
export function formBox({ title, text = '', fields, ok = 'Gata', check }) {
  return new Promise(resolve => {
    let result = null;
    const m = modal(`
      <h2>${esc(title)}</h2>
      ${text ? `<p>${text}</p>` : ''}
      <form class="form" novalidate>
        ${fields.map(f => `<label>${esc(f.label)}<input id="fb-${f.id}" type="${f.type || 'text'}" value="${esc(f.value || '')}"
          placeholder="${esc(f.placeholder || '')}" autocomplete="${f.autocomplete || 'off'}"></label>`).join('')}
        <p class="err" role="alert"></p>
        <div class="btns">
          <button class="btn primary" type="submit">${esc(ok)}</button>
          <button class="btn" type="button" data-act="no">Renunță</button>
        </div>
      </form>`, {
      onClose: () => resolve(result),
      actions: { no: () => m.close() },
    });
    const form = m.$('form');
    setTimeout(() => m.$('input')?.focus(), 50);
    form.onsubmit = async e => {
      e.preventDefault();
      const vals = Object.fromEntries(fields.map(f => [f.id, m.$(`#fb-${f.id}`).value]));
      const btn = m.$('button[type=submit]');
      const err = m.$('.err');
      err.textContent = '';
      btn.disabled = true;
      try {
        const msg = check ? await check(vals) : null;
        if (msg) { err.textContent = msg; return; }
        result = vals;
        m.close();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    };
  });
}

// Listă de variante. options: [{ label, sub, value, cls }]
export function choose(title, options, { text = '' } = {}) {
  return new Promise(resolve => {
    let result = null;
    const m = modal(`
      <h2>${esc(title)}</h2>
      ${text ? `<p>${text}</p>` : ''}
      <div class="pick">${options.map((o, i) => `
        <button class="pick-row ${o.cls || ''}" data-act="pick" data-i="${i}">
          <span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}
        </button>`).join('')}</div>
      <div class="btns"><button class="btn" data-act="no">Renunță</button></div>`, {
      onClose: () => resolve(result),
      actions: {
        pick: el => { result = options[Number(el.dataset.i)].value; m.close(); },
        no: () => m.close(),
      },
    });
  });
}
