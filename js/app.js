// Interfața aplicației: ecrane, navigare, comenzi vocale.

import * as store from './store.js';
import { S } from './store.js';
import {
  STATUS, DEFAULT_PROCEDURES, live, clientsList, sessionsList, sessionsOnDay, sessionsInRange, clientSessions,
  sessionNumber, nextSessionOf, endOf, overlaps, proposeNext, procTime, generalTime,
} from './model.js';
import {
  ZILE_SCURT, LUNI_SCURT, dateKey, parseKey, toLocal, fromLocal, addDays, startOfDay, startOfWeek, fmtTime, fmtDateLong,
  fmtDateShort, fmtRelDay, capFirst, capName, norm, esc, uid, pad, plural, initials, timeAgo, fmtDur, sayDur,
} from './util.js';
import { parseCommand, EXAMPLES } from './parser.js';
import * as voice from './voice.js';
import * as bio from './bio.js';
import * as timer from './timer.js';
import { icon, LOGO, toast, modal, closeAll, hasModal, confirmBox, formBox, choose } from './ui.js';

const VERSION = '1.0.0';
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

const ui = {
  route: null,
  agendaDay: null,
  agendaMode: 'zi',
  trail: [],
  edits: {},
  editTimers: {},
  nextDraft: {},
  newDraft: null,
  clientQ: '',
  lastActivity: Date.now(),
  hiddenAt: null,
  installPrompt: null,
  pendingRender: false,
  selfChange: false,
  restoreTab: 'gh',
};

const settings = () => S.db.settings;
const client = id => S.db.clients[id];
const isToday = d => dateKey(d) === dateKey(new Date());

// ====================================================================
// Pornire
// ====================================================================

async function boot() {
  registerSW();
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.installPrompt = e; });
  store.onChange(onStoreChange);
  timer.onTimer(onTimerEvent);
  $('#timer-root').addEventListener('click', onTimerClick);
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { ui.lastActivity = Date.now(); }, true));
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', () => store.isUnlocked() && store.syncNow());
  window.addEventListener('hashchange', onHash);
  app.addEventListener('click', onClick);
  app.addEventListener('input', onInput);
  app.addEventListener('change', onInput);
  app.addEventListener('focusout', () => setTimeout(() => {
    if (ui.pendingRender && !isEditing()) { flushEdits(); rerender(); }
  }, 0));
  setInterval(tick, 20000);

  if (await store.hasVault()) {
    showLock();
    if (await bio.bioEnrolled()) setTimeout(() => unlockWithBio(true), 300);
  } else showWelcome();
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const waiting = w => {
      toast('Există o versiune nouă a aplicației.', {
        action: 'Actualizează', ms: 60000,
        onAction: () => w.postMessage('skipWaiting'),
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) waiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) waiting(w);
      });
    });
  }).catch(e => console.warn('SW', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (reloaded) return;
    reloaded = true;
    flushEdits();
    location.reload();
  });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.open && store.isUnlocked()) go(e.data.open);
  });
}

function onStoreChange(what) {
  if (what === 'sync') renderSync();
  if (what === 'data' && !ui.selfChange && store.isUnlocked() && $('#view')) {
    if (isEditing()) ui.pendingRender = true;
    else rerender();
  }
}

function isEditing() {
  const a = document.activeElement;
  return a && $('#view')?.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(a.type)));
}

function onVisibility() {
  if (!store.isUnlocked()) return;
  if (document.hidden) {
    ui.hiddenAt = Date.now();
    flushEdits();
    if (S.cfg?.pending) store.syncNow();
  } else {
    const lockMs = settings().autoLockMin * 60000;
    if (ui.hiddenAt && Date.now() - ui.hiddenAt > lockMs && !timer.T.active) { doLock(); return; }
    ui.lastActivity = Date.now();
    store.syncNow();
    if (ui.route?.name === 'agenda') rerender();
  }
}

function tick() {
  if (!store.isUnlocked()) return;
  if (timer.T.active) ui.lastActivity = Date.now();
  if (Date.now() - ui.lastActivity > settings().autoLockMin * 60000) { doLock(); return; }
  if (!document.hidden && S.cfg?.gh && Date.now() - (S.cfg.lastSync || 0) > 5 * 60000) store.syncNow();
  checkReminders();
}

// ====================================================================
// Ecrane de intrare: bun venit, parolă nouă, restaurare, deblocare
// ====================================================================

function gate(html) {
  app.innerHTML = `<div class="gate"><div class="gate-card">${html}</div></div>`;
}

function showWelcome() {
  gate(`
    ${LOGO}
    <h1>Agenda Bowtech</h1>
    <p class="lead">Programări, fișele clienților și notițe pentru fiecare ședință. Poți folosi și comenzi vocale.</p>
    <button class="btn primary big" data-act="g-new">Încep o agendă nouă</button>
    <button class="btn big" data-act="g-restore">Am deja o copie de siguranță</button>
    <p class="small muted">Datele sunt criptate cu parola ta și rămân pe telefon. Copia de siguranță (opțională) merge în contul tău GitHub, tot criptată.</p>`);
}

function showCreate() {
  gate(`
    <h1>Agendă nouă</h1>
    <p>Alege o parolă. Cu ea deschizi agenda și, pe un telefon nou, copia de siguranță.</p>
    <form id="f-create" class="form" novalidate>
      <label>Parola (cel puțin 8 caractere)
        <input type="password" id="p1" autocomplete="new-password"></label>
      <label>Scrie parola încă o dată
        <input type="password" id="p2" autocomplete="new-password"></label>
      <div class="note warn">${icon('alert')}<div>Dacă uiți parola, datele <b>nu mai pot fi recuperate</b> de nimeni, nici de pe telefon, nici din copia de siguranță. Scrie parola pe o hârtie și păstreaz-o într-un loc sigur.</div></div>
      <label class="check"><input type="checkbox" id="pok"> Am scris parola într-un loc sigur</label>
      <p class="err" role="alert"></p>
      <button class="btn primary big" type="submit">Creează agenda</button>
      <button class="btn ghost" type="button" data-act="g-welcome">Înapoi</button>
    </form>`);
  const f = $('#f-create');
  f.onsubmit = async e => {
    e.preventDefault();
    const p1 = $('#p1').value, p2 = $('#p2').value, err = $('.err', f);
    if (p1.length < 8) return (err.textContent = 'Parola trebuie să aibă cel puțin 8 caractere.');
    if (p1 !== p2) return (err.textContent = 'Cele două parole nu sunt la fel.');
    if (!$('#pok').checked) return (err.textContent = 'Bifează că ai scris parola într-un loc sigur.');
    await busy($('button[type=submit]', f), 'Se pregătește agenda…', async () => {
      await store.createNew(p1);
      startMain();
      setTimeout(firstRunTip, 400);
    }, err);
  };
}

async function firstRunTip() {
  const ok = await confirmBox(
    'Agenda e gata! Îți recomand să pornești acum <b>copia de siguranță</b>, ca să nu pierzi nimic dacă se strică sau se pierde telefonul. Durează câteva minute.',
    { title: 'Bun venit', ok: 'Pornesc copia de siguranță', cancel: 'Mai târziu' });
  if (ok) go('#/setari?s=backup');
}

function showRestore() {
  const gh = ui.restoreTab === 'gh';
  gate(`
    <h1>Restaurez agenda</h1>
    <div class="seg">
      <button data-act="g-rtab" data-v="gh" class="${gh ? 'on' : ''}">Din GitHub</button>
      <button data-act="g-rtab" data-v="file" class="${gh ? '' : 'on'}">Dintr-un fișier</button>
    </div>
    <form id="f-restore" class="form" novalidate>
      ${gh ? `
        <label>Numele tău de utilizator GitHub<input id="r-owner" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
        <label>Numele depozitului cu copia<input id="r-repo" value="agenda-date" autocapitalize="off" spellcheck="false"></label>
        <label>Tokenul GitHub<input id="r-token" type="password" autocomplete="off" placeholder="github_pat_…"></label>
        <p class="small muted">Dacă nu mai ai tokenul, fă unul nou (vezi ghidul, pasul „Token”).</p>`
      : `<label>Fișierul cu copia (agenda-bowtech-….json)<input id="r-file" type="file" accept=".json,application/json"></label>`}
      <label>Parola agendei<input id="r-pw" type="password" autocomplete="current-password"></label>
      <p class="err" role="alert"></p>
      <button class="btn primary big" type="submit">Restaurează</button>
      <button class="btn ghost" type="button" data-act="g-welcome">Înapoi</button>
    </form>`);
  const f = $('#f-restore');
  f.onsubmit = async e => {
    e.preventDefault();
    const err = $('.err', f);
    const pw = $('#r-pw').value;
    if (!pw) return (err.textContent = 'Scrie parola agendei.');
    await busy($('button[type=submit]', f), 'Se restaurează…', async () => {
      if (gh) {
        const owner = $('#r-owner').value, repo = $('#r-repo').value, token = $('#r-token').value;
        if (!owner.trim() || !repo.trim() || !token.trim()) throw new Error('Completează toate câmpurile.');
        await store.restoreFromGitHub({ owner, repo, token }, pw);
      } else {
        const file = $('#r-file').files[0];
        if (!file) throw new Error('Alege fișierul cu copia.');
        await store.restoreFromFile(await file.text(), pw);
      }
      startMain();
      toast('Agenda a fost restaurată.');
    }, err);
  };
}

function showLock() {
  gate(`
    ${LOGO}
    <h1>Agenda Bowtech</h1>
    <form id="f-unlock" class="form" novalidate>
      <label>Parola<input type="password" id="pw" autocomplete="current-password"></label>
      <p class="err" role="alert"></p>
      <button class="btn primary big" type="submit">Deschide agenda</button>
    </form>
    <div id="bio-slot"></div>
    <button class="btn ghost small" data-act="g-forgot">Am uitat parola</button>`);
  bio.bioEnrolled().then(on => {
    if (on && $('#bio-slot')) $('#bio-slot').innerHTML = `<button class="btn big" data-act="g-bio">${icon('finger')} Deschide cu amprenta</button>`;
  });
  const f = $('#f-unlock');
  f.onsubmit = async e => {
    e.preventDefault();
    const err = $('.err', f);
    await busy($('button[type=submit]', f), 'Se deschide…', async () => {
      await store.unlock($('#pw').value);
      startMain();
    }, err);
  };
}

async function unlockWithBio(silent) {
  try {
    const dk = await bio.bioUnlock();
    await store.unlockWithKey(dk);
    startMain();
  } catch (e) {
    if (!silent && e.name !== 'NotAllowedError') toast(e.message || 'Amprenta nu a funcționat. Folosește parola.');
  }
}

async function busy(btn, label, fn, errEl) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ${esc(label)}`;
  if (errEl) errEl.textContent = '';
  try {
    await fn();
  } catch (e) {
    console.warn(e);
    const msg = e.code === 'BAD_PASSWORD' ? 'Parola nu este corectă.' : e.message;
    if (errEl?.isConnected) errEl.textContent = msg; else toast(msg);
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.innerHTML = old; }
  }
}

async function doLock() {
  flushEdits();
  timer.stop();
  await closeAll();
  await store.lock();
  ui.trail = [];
  showLock();
}

// ====================================================================
// Aplicația deblocată
// ====================================================================

function startMain() {
  ui.lastActivity = Date.now();
  ui.hiddenAt = null;
  app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" id="back" data-act="back" aria-label="Înapoi" hidden>${icon('back')}</button>
      <h1 id="title">Agenda</h1>
      <button class="icon-btn sync" id="sync" data-act="syncinfo" aria-label="Copie de siguranță"></button>
      <button class="icon-btn" data-act="lock" aria-label="Blochează agenda">${icon('lock')}</button>
    </header>
    <main id="view"></main>
    <nav class="tabs">
      <a href="#/agenda" data-tab="agenda">${icon('calendar')}<span>Agenda</span></a>
      <a href="#/clienti" data-tab="clienti">${icon('users')}<span>Clienți</span></a>
      <button class="mic" data-act="voice" aria-label="Comandă vocală">${icon('mic')}</button>
      <a href="#/nou" data-tab="nou">${icon('plus')}<span>Programare</span></a>
      <a href="#/setari" data-tab="setari">${icon('sliders')}<span>Setări</span></a>
    </nav>`;
  renderSync();
  route();
  navigator.storage?.persist?.().catch(() => {});
  store.syncNow();
}

function go(hash) {
  if (location.hash === hash) { rerender(); return; }
  ui.trail.push(location.hash || '#/agenda');
  location.hash = hash;
}

// pentru agenda: schimbă ziua fără să umple istoricul
function replaceHash(hash) {
  history.replaceState(history.state, '', hash);
  route();
}

function onHash() {
  if (!store.isUnlocked()) return;
  const prev = ui.trail[ui.trail.length - 1];
  if (prev && prev === location.hash) ui.trail.pop();
  route();
}

function parseHash() {
  const h = location.hash.slice(1) || '/agenda';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'agenda', id: parts[1] ? decodeURIComponent(parts[1]) : null, q: new URLSearchParams(qs || '') };
}

const VIEWS = {};

function route(keepScroll = false) {
  if (!store.isUnlocked() || !$('#view')) return;
  flushEdits();
  const r = parseHash();
  const prevName = ui.route?.name;
  ui.route = r;
  ui.pendingRender = false;
  const view = VIEWS[r.name] || VIEWS.agenda;
  if (r.name === 'nou' && prevName !== 'nou') ui.newDraft = null;
  const out = view(r.id, r.q);
  $('#title').textContent = out.title;
  $('#view').innerHTML = out.html;
  $('#view').className = `view v-${r.name}`;
  $('#back').hidden = !out.back;
  ui.backTo = out.back;
  document.querySelectorAll('.tabs [data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === (out.tab || r.name)));
  ui.viewInput = out.onInput || null;
  out.after?.();
  if (!keepScroll) window.scrollTo(0, 0);
}

function rerender() {
  const y = window.scrollY;
  route(true);
  window.scrollTo(0, y);
}

function goBack() {
  if (ui.trail.length) history.back();
  else go(ui.backTo || '#/agenda');
}

// ---------- salvare automată în timp ce scrii ----------

function editRecord(kind, id, patch) {
  const k = `${kind}:${id}`;
  ui.edits[k] = { kind, id, patch: { ...(ui.edits[k]?.patch || {}), ...patch } };
  clearTimeout(ui.editTimers[k]);
  ui.editTimers[k] = setTimeout(() => applyEdit(k), 600);
  savedHint('Se salvează…');
}

function applyEdit(k) {
  const e = ui.edits[k];
  if (!e) return;
  delete ui.edits[k];
  clearTimeout(ui.editTimers[k]);
  const rec = S.db?.[e.kind]?.[e.id];
  if (!live(rec)) return;
  ui.selfChange = true;
  try { store.put(e.kind, { ...rec, ...e.patch }); } finally { ui.selfChange = false; }
  savedHint('Salvat');
}

function flushEdits() {
  Object.keys(ui.edits).forEach(applyEdit);
}

function savedHint(text) {
  const el = $('#saved');
  if (el) { el.textContent = text; el.classList.toggle('ok', text === 'Salvat'); }
}

// ---------- copie de siguranță: indicatorul din bară ----------

function renderSync() {
  const el = $('#sync');
  if (!el) return;
  const { state, error } = S.sync;
  const badge = { ok: icon('check', 'b'), pending: '<span class="b dot"></span>', busy: '<span class="b spin"></span>', error: '<span class="b bang">!</span>', off: '<span class="b slash"></span>' }[state] || '';
  el.className = `icon-btn sync s-${state}`;
  el.innerHTML = icon('cloud') + badge;
  el.setAttribute('aria-label', {
    ok: 'Copia de siguranță este la zi',
    pending: 'Modificări care urmează să fie copiate',
    busy: 'Se face copia de siguranță',
    error: `Problemă la copia de siguranță: ${error}`,
    off: 'Copia de siguranță nu este pornită',
  }[state]);
}

// ====================================================================
// Clicuri și câmpuri
// ====================================================================

const ACTIONS = {};

function onClick(e) {
  const a = e.target.closest('[data-act]');
  if (!a || !app.contains(a)) return;
  const fn = ACTIONS[a.dataset.act];
  if (fn) { e.preventDefault(); fn(a, e); }
}

function onInput(e) {
  if (ui.viewInput && e.target.closest('#view')) ui.viewInput(e);
}

Object.assign(ACTIONS, {
  'g-new': showCreate,
  'g-restore': showRestore,
  'g-welcome': showWelcome,
  'g-rtab': el => { ui.restoreTab = el.dataset.v; showRestore(); },
  'g-bio': () => unlockWithBio(false),
  'g-forgot': forgotPassword,
  back: goBack,
  lock: doLock,
  voice: startVoice,
  syncinfo: () => {
    if (S.sync.state === 'error') toast(S.sync.error, { ms: 8000 });
    else if (S.sync.state === 'off') toast('Copia de siguranță nu este pornită. O poți porni din Setări.');
    else if (S.cfg?.lastSync) toast(`Ultima copie de siguranță: ${timeAgo(S.cfg.lastSync)}.`);
    go('#/setari?s=backup');
  },
});

async function forgotPassword() {
  const ok = await confirmBox(
    'Parola nu poate fi recuperată: nimeni nu poate deschide datele fără ea, nici eu, nici GitHub. Încearcă parolele pe care le folosești de obicei sau caută hârtia pe care ai notat-o.<br><br>Dacă vrei, poți șterge agenda de pe acest telefon și începe una nouă. <b>Toate datele de pe telefon se pierd.</b>',
    { title: 'Am uitat parola', ok: 'Șterge agenda de pe telefon', cancel: 'Încerc din nou', danger: true });
  if (!ok) return;
  const sure = await confirmBox('Sigur? Clienții și ședințele de pe acest telefon vor fi șterse definitiv.', { ok: 'Da, șterge tot', danger: true });
  if (!sure) return;
  await store.wipeLocal();
  showWelcome();
}

// ====================================================================
// Agenda
// ====================================================================

VIEWS.agenda = (id, q) => {
  const today = startOfDay(new Date());
  const day = q.get('d') ? parseKey(q.get('d')) : (ui.agendaDay || today);
  const mode = q.get('m') || ui.agendaMode || 'zi';
  ui.agendaDay = day;
  ui.agendaMode = mode;
  const db = S.db;
  let html = '';

  if (mode === 'zi') {
    const rel = fmtRelDay(day, today);
    const label = ['azi', 'mâine', 'ieri', 'poimâine'].includes(rel)
      ? `<b>${capFirst(rel)}</b><small>${fmtDateLong(day, today)}</small>`
      : `<b>${capFirst(fmtDateLong(day, today))}</b>`;
    html += dateBar(label, mode, !isToday(day));
    html += weekStrip(day);
    const list = sessionsOnDay(db, dateKey(day));
    html += list.length
      ? `<div class="list">${list.map(sessionCard).join('')}</div>`
      : `<div class="empty">${icon('calendar')}<p>Nicio ședință în această zi.</p>
          <a class="btn primary" href="#/nou?d=${dateKey(day)}">${icon('plus')} Programează</a></div>`;
    if (isToday(day)) html += todoBlock();
  } else {
    const ws = startOfWeek(day);
    const we = addDays(ws, 6);
    const thisWeek = dateKey(ws) === dateKey(startOfWeek(today));
    const nextWeek = dateKey(ws) === dateKey(addDays(startOfWeek(today), 7));
    const label = `<b>${thisWeek ? 'Săptămâna aceasta' : nextWeek ? 'Săptămâna viitoare' : 'Săptămâna'}</b>
      <small>${ws.getDate()} ${LUNI_SCURT[ws.getMonth()]} – ${we.getDate()} ${LUNI_SCURT[we.getMonth()]} ${we.getFullYear() !== today.getFullYear() ? we.getFullYear() : ''}</small>`;
    html += dateBar(label, mode, !thisWeek);
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const list = sessionsOnDay(db, dateKey(d));
      total += list.filter(s => s.status !== 'anulata').length;
      html += `<section class="wday ${isToday(d) ? 'today' : ''}">
        <button class="wday-h" data-act="ag-day" data-v="${dateKey(d)}">
          <span>${capFirst(fmtDateLong(d, today))}</span><small>${list.length ? plural(list.length, 'ședință', 'ședințe') : 'liber'}</small>
        </button>
        ${list.map(s => `<a class="wrow st-${s.status}" href="#/sedinta/${s.id}"><b>${fmtTime(fromLocal(s.start))}</b><span>${esc(client(s.clientId).name)}</span>${statusPill(s)}</a>`).join('')}
      </section>`;
    }
    html += `<p class="muted center small">${total ? `În total: ${plural(total, 'ședință', 'ședințe')}` : 'Nicio ședință în această săptămână.'}</p>`;
  }
  return { title: 'Agenda', html, tab: 'agenda' };
};

function dateBar(label, mode, showToday) {
  return `<div class="datebar">
      <button class="icon-btn" data-act="ag-prev" aria-label="Înapoi">${icon('left')}</button>
      <button class="datebtn" data-act="ag-today">${label}</button>
      <button class="icon-btn" data-act="ag-next" aria-label="Înainte">${icon('right')}</button>
    </div>
    <div class="seg small">
      <button data-act="ag-mode" data-v="zi" class="${mode === 'zi' ? 'on' : ''}">Zi</button>
      <button data-act="ag-mode" data-v="sapt" class="${mode === 'sapt' ? 'on' : ''}">Săptămână</button>
      ${showToday ? '<button data-act="ag-today" class="today-btn">Azi</button>' : ''}
    </div>`;
}

function weekStrip(day) {
  const ws = startOfWeek(day);
  let h = '<div class="strip">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const n = sessionsOnDay(S.db, dateKey(d)).filter(s => s.status !== 'anulata').length;
    h += `<button data-act="ag-day" data-v="${dateKey(d)}" class="${dateKey(d) === dateKey(day) ? 'on' : ''} ${isToday(d) ? 'today' : ''}">
      <small>${ZILE_SCURT[d.getDay()]}</small><b>${d.getDate()}</b><i>${n ? '•'.repeat(Math.min(n, 3)) : ''}</i></button>`;
  }
  return h + '</div>';
}

function statusPill(s) {
  if (s.status === 'programata' && endOf(s) < new Date()) return '<span class="pill warn">De completat</span>';
  return `<span class="pill st-${s.status}">${STATUS[s.status]}</span>`;
}

function sessionCard(s) {
  const c = client(s.clientId);
  const n = sessionNumber(S.db, s);
  const sum = s.status === 'efectuata' && s.procedures?.length ? `<div class="sum">${esc(s.procedures.join(', '))}</div>` : '';
  return `<a class="card sess st-${s.status}" href="#/sedinta/${s.id}">
    <div class="time"><b>${fmtTime(fromLocal(s.start))}</b><small>${s.duration} min</small></div>
    <div class="info"><div class="name">${esc(c.name)}</div>
      <div class="meta">${n ? `Ședința nr. ${n}` : ''} ${statusPill(s)}</div>${sum}</div>
    ${icon('right', 'chev')}</a>`;
}

// ședințe trecute rămase „programate”: trebuie completate
function todoBlock() {
  const now = new Date();
  const from = dateKey(addDays(now, -30));
  const list = sessionsList(S.db).filter(s => s.status === 'programata' && s.start >= from && endOf(s) < now && !isToday(fromLocal(s.start)));
  if (!list.length) return '';
  return `<section class="todo"><h2 class="sec">${icon('edit')} De completat (${list.length})</h2>
    <p class="small muted">Ședințe trecute care nu au fost marcate ca efectuate sau anulate.</p>
    <div class="list">${list.map(s => `<a class="wrow" href="#/sedinta/${s.id}"><b>${fmtDateShort(fromLocal(s.start))}</b><span>${esc(client(s.clientId).name)}</span>${icon('right', 'chev')}</a>`).join('')}</div></section>`;
}

Object.assign(ACTIONS, {
  'ag-prev': () => shiftAgenda(-1),
  'ag-next': () => shiftAgenda(1),
  'ag-today': () => replaceHash(`#/agenda?d=${dateKey(new Date())}&m=${ui.agendaMode}`),
  'ag-mode': el => replaceHash(`#/agenda?d=${dateKey(ui.agendaDay)}&m=${el.dataset.v}`),
  'ag-day': el => replaceHash(`#/agenda?d=${el.dataset.v}&m=zi`),
});

function shiftAgenda(dir) {
  const step = ui.agendaMode === 'zi' ? 1 : 7;
  replaceHash(`#/agenda?d=${dateKey(addDays(ui.agendaDay, dir * step))}&m=${ui.agendaMode}`);
}

// ====================================================================
// Ședința
// ====================================================================

const DURATIONS = [15, 20, 30, 40, 45, 50, 60, 75, 90, 120];

function durationOptions(cur) {
  const list = DURATIONS.includes(cur) ? DURATIONS : [...DURATIONS, cur].sort((a, b) => a - b);
  return list.map(d => `<option value="${d}" ${d === cur ? 'selected' : ''}>${d} min</option>`).join('');
}

function textField(key, label, value, rows = 3) {
  return `<div class="field">
    <div class="lbl"><label for="f-${key}">${esc(label)}</label>
      ${voice.canListen ? `<button class="icon-btn small dict" data-act="dictate" data-v="${key}" aria-label="Dictează">${icon('mic')}</button>` : ''}</div>
    <textarea id="f-${key}" data-f="${key}" rows="${rows}">${esc(value || '')}</textarea></div>`;
}

function overlapWarn(start, duration, excludeId) {
  const o = overlaps(S.db, start, duration, excludeId);
  if (!o.length) return '';
  return `<div class="note warn small">${icon('alert')}<div>Se suprapune cu: ${o.map(x => `${esc(client(x.clientId).name)} (${fmtTime(fromLocal(x.start))})`).join(', ')}</div></div>`;
}

VIEWS.sedinta = id => {
  const s = S.db.sessions[id];
  if (!live(s) || !live(client(s.clientId))) return notFound('Ședința nu mai există.');
  const c = client(s.clientId);
  const st = fromLocal(s.start);
  const n = sessionNumber(S.db, s);
  const procs = [...new Set([...settings().procedures, ...(s.procedures || [])])];

  const next = s.nextId && live(S.db.sessions[s.nextId]) && S.db.sessions[s.nextId].status !== 'anulata'
    ? S.db.sessions[s.nextId]
    : clientSessions(S.db, c.id).find(x => x.start > s.start && x.status !== 'anulata');
  let nextHtml;
  if (next) {
    nextHtml = `<a class="card sess mini" href="#/sedinta/${next.id}">
      <div class="info"><div class="name">${capFirst(fmtRelDay(fromLocal(next.start)))}, la ${fmtTime(fromLocal(next.start))}</div>
      <div class="meta">${statusPill(next)}</div></div>${icon('right', 'chev')}</a>`;
  } else {
    const prop = ui.nextDraft[s.id] || proposeNext(s, settings());
    nextHtml = `<p class="small muted">Propunere: la ${settings().interval} zile după această ședință (se schimbă din Setări).</p>
      <div class="row2">
        <label>Data<input type="date" data-f="nextdate" value="${prop.slice(0, 10)}"></label>
        <label>Ora<input type="time" data-f="nexttime" value="${prop.slice(11)}" step="300"></label>
      </div>
      <p class="small muted" id="nextlabel">${capFirst(fmtDateLong(fromLocal(prop)))}</p>
      <div id="nextwarn">${overlapWarn(prop, settings().duration)}</div>
      <button class="btn primary" data-act="s-next">${icon('calendar')} Programează ședința următoare</button>`;
  }

  const html = `
    <section class="card head">
      <a class="client-link" href="#/client/${c.id}"><b>${esc(c.name)}</b>${icon('right', 'chev')}</a>
      <div class="muted">${n ? `Ședința nr. ${n}` : 'Ședință anulată'} · <span id="saved" class="saved"></span></div>
      <div class="row3">
        <label>Data<input type="date" data-f="date" value="${dateKey(st)}"></label>
        <label>Ora<input type="time" data-f="time" value="${fmtTime(st)}" step="300"></label>
        <label>Durata<select data-f="duration">${durationOptions(s.duration)}</select></label>
      </div>
      <div id="overlap">${overlapWarn(s.start, s.duration, s.id)}</div>
      <div class="seg status">${Object.entries(STATUS).map(([k, v]) =>
        `<button data-act="s-status" data-v="${k}" class="${s.status === k ? 'on' : ''} st-${k}">${v}</button>`).join('')}</div>
    </section>
    <section class="card" id="steps">
      <h2>${icon('timer')} Pași și pauze</h2>
      <p class="small muted">Bifează pașii făcuți. Apasă ${icon('play', 'inl')} ca să pornești pauza de după pas; apasă pe timp ca să-l schimbi doar pentru ${esc(c.name.split(' ')[0])}.</p>
      <div class="steps-list">${procs.map(p => stepRow(p, s, c)).join('')}</div>
      <div class="addrow"><input data-f="newproc" placeholder="Altă procedură…" enterkeyhint="done"><button class="btn" data-act="s-addproc">Adaugă</button></div>
    </section>
    <section class="card">
      ${textField('reactions', 'Reacțiile clientului în timpul ședinței', s.reactions)}
      ${textField('after', 'Starea clientului după ședință', s.after)}
      ${textField('notes', 'Alte notițe', s.notes, 2)}
    </section>
    <section class="card" id="next">
      <h2>Ședința următoare</h2>
      ${nextHtml}
    </section>
    <section class="actions">
      <button class="btn" data-act="s-cal">${icon('calendar')} Adaugă în Google Calendar</button>
      <button class="btn danger ghost" data-act="s-del">${icon('trash')} Șterge ședința</button>
    </section>`;

  return {
    title: 'Ședință', html, back: `#/agenda?d=${dateKey(st)}&m=zi`, tab: 'agenda',
    onInput: e => {
      const f = e.target.dataset.f;
      const cur = S.db.sessions[id];
      if (['reactions', 'after', 'notes'].includes(f)) editRecord('sessions', id, { [f]: e.target.value });
      else if (f === 'date' || f === 'time') {
        const d = $('[data-f=date]').value, t = $('[data-f=time]').value;
        if (!d || !t) return;
        const start = `${d}T${t}`;
        editRecord('sessions', id, { start });
        $('#overlap').innerHTML = overlapWarn(start, cur.duration, id);
      } else if (f === 'duration') {
        const duration = Number(e.target.value);
        editRecord('sessions', id, { duration });
        $('#overlap').innerHTML = overlapWarn(ui.edits[`sessions:${id}`]?.patch.start || cur.start, duration, id);
      } else if (f === 'nextdate' || f === 'nexttime') {
        const d = $('[data-f=nextdate]').value, t = $('[data-f=nexttime]').value;
        if (!d || !t) return;
        ui.nextDraft[id] = `${d}T${t}`;
        $('#nextlabel').textContent = capFirst(fmtDateLong(fromLocal(ui.nextDraft[id])));
        $('#nextwarn').innerHTML = overlapWarn(ui.nextDraft[id], settings().duration);
      }
    },
    after: () => {
      $('[data-f=newproc]')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ACTIONS['s-addproc'](); } });
    },
  };
};

const curSession = () => S.db.sessions[ui.route.id];

function stepRow(p, s, c) {
  const done = s.procedures?.includes(p);
  const pt = procTime(settings(), c, p);
  const running = timer.T.active && timer.T.meta.proc === p && timer.T.meta.sessionId === s.id;
  return `<div class="step ${done ? 'on' : ''} ${running ? 'running' : ''}">
    <button class="tick" data-act="s-proc" data-v="${esc(p)}" aria-pressed="${done}" aria-label="${done ? 'Debifează' : 'Bifează'} ${esc(p)}">${icon('check')}</button>
    <button class="sname" data-act="s-proc" data-v="${esc(p)}">${esc(p)}</button>
    <button class="dur ${pt.source === 'client' ? 'personal' : ''}" data-act="s-dur" data-v="${esc(p)}" aria-label="Pauza: ${sayDur(pt.seconds)}${pt.source === 'client' ? ', personalizată' : ''}">${fmtDur(pt.seconds)}</button>
    <button class="play" data-act="t-start" data-v="${esc(p)}" aria-label="Pornește pauza pentru ${esc(p)}">${icon('play')}</button>
  </div>`;
}

Object.assign(ACTIONS, {
  's-status': el => {
    flushEdits();
    const s = curSession();
    store.put('sessions', { ...s, status: el.dataset.v });
    rerender();
    if (el.dataset.v === 'efectuata') {
      toast('Ședința a fost marcată ca efectuată.');
      if (!s.nextId) setTimeout(() => $('#next')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  },
  's-proc': el => {
    flushEdits();
    const s = curSession();
    const p = el.dataset.v;
    const procs = s.procedures?.includes(p) ? s.procedures.filter(x => x !== p) : [...(s.procedures || []), p];
    store.put('sessions', { ...s, procedures: procs });
    rerender();
  },
  's-addproc': () => {
    const inp = $('[data-f=newproc]');
    const p = inp.value.trim();
    if (!p) return;
    flushEdits();
    const s = curSession();
    if (!s.procedures.includes(p)) store.put('sessions', { ...s, procedures: [...s.procedures, p] });
    if (!settings().procedures.includes(p)) {
      toast(`„${p}” a fost adăugată la ședință.`, {
        action: 'Păstrează în listă', onAction: () => store.setSettings({ procedures: [...settings().procedures, p] }),
      });
    }
    rerender();
  },
  's-next': async () => {
    flushEdits();
    const s = curSession();
    const start = ui.nextDraft[s.id] || proposeNext(s, settings());
    const ns = newSession(s.clientId, start);
    store.put('sessions', { ...curSession(), nextId: ns.id });
    delete ui.nextDraft[s.id];
    rerender();
    afterSchedule(ns);
  },
  's-cal': () => openCalendar(curSession()),
  's-del': async () => {
    const s = curSession();
    const ok = await confirmBox(`Ștergi ședința lui <b>${esc(client(s.clientId).name)}</b> din ${fmtDateLong(fromLocal(s.start))}? Notițele ei se pierd.<br><br>Dacă ședința doar nu a avut loc, mai bine marchez-o „Anulată”.`,
      { ok: 'Șterge', danger: true });
    if (!ok) return;
    const before = structuredClone(s);
    store.remove('sessions', s.id);
    toast('Ședința a fost ștearsă.', { action: 'Anulează', onAction: () => { store.put('sessions', before); rerender(); } });
    go(`#/agenda?d=${s.start.slice(0, 10)}&m=zi`);
  },
  dictate: el => dictateInto(el.dataset.v),
  't-start': el => {
    const s = curSession();
    timer.unlockAudio();
    startStep(el.dataset.v, { clientId: s.clientId, sessionId: s.id });
  },
  's-dur': async el => {
    const s = curSession();
    await editClientTime(s.clientId, el.dataset.v);
    rerender();
  },
});

// ====================================================================
// Cronometrul pașilor
// ====================================================================

const spokenProc = p => p.replace(/\s*\(.*?\)\s*/g, ' ').trim();

function soundOpts() {
  const st = settings();
  return { sound: st.alarmSound, volume: st.alarmVolume, vibrate: st.alarmVibrate };
}

function startStep(proc, { clientId = null, sessionId = null, seconds = null } = {}) {
  const c = clientId ? client(clientId) : null;
  const pt = procTime(settings(), c, proc);
  const secs = seconds || pt.seconds;
  const note = seconds ? 'durată aleasă acum' : pt.source === 'client' ? 'timp personalizat' : '';
  timer.start({
    seconds: secs,
    label: proc,
    sub: [c?.name, note].filter(Boolean).join(' · '),
    meta: { proc, clientId, sessionId, seconds },
  }, soundOpts());
  // pasul pentru care pornește pauza a fost făcut: îl bifăm în ședință
  const s = sessionId && S.db.sessions[sessionId];
  if (live(s) && !s.procedures?.includes(proc)) {
    flushEdits();
    store.put('sessions', { ...s, procedures: [...(s.procedures || []), proc] });
  }
  if (ui.route?.name === 'sedinta') rerender();
}

function onTimerEvent(what) {
  renderTimer(what === 'tick');
  if (what === 'done') {
    const { label, sub } = timer.T;
    if (document.hidden && settings().notify && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then(reg => reg.showNotification(`Pauza s-a terminat: ${spokenProc(label)}`, {
        body: sub || 'Poți trece la pasul următor.', tag: 'cronometru', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', silent: true,
      })).catch(() => {});
    }
  }
  if (['start', 'stop'].includes(what) && ui.route?.name === 'sedinta') rerender();
}

function renderTimer(onlyTime = false) {
  const root = $('#timer-root');
  const T = timer.T;
  const show = T.active && store.isUnlocked();
  document.body.classList.toggle('has-timer', show);
  if (!show) { root.innerHTML = ''; return; }
  const left = timer.remaining();
  if (onlyTime && root.firstElementChild) {
    root.querySelector('.ttime').textContent = fmtDur(Math.ceil(left / 1000));
    root.querySelector('.tprog i').style.width = `${100 - (left / T.total) * 100}%`;
    return;
  }
  const state = T.done ? 'done' : T.paused ? 'paused' : 'running';
  root.innerHTML = `<div class="tbar ${state}" role="timer" aria-live="off">
    <div class="tprog"><i></i></div>
    <div class="trow">
      <div class="tinfo"><b>${T.done ? 'Gata: ' : ''}${esc(T.label)}</b><small>${esc(T.sub || (T.paused ? 'pe pauză' : 'pauză după pas'))}</small></div>
      <div class="ttime">${fmtDur(Math.ceil(left / 1000))}</div>
    </div>
    <div class="tbtns">${T.done
      ? `<button class="btn small" data-t="again">${icon('history')} Repetă</button>
         <button class="btn small primary" data-t="stop">${icon('check')} Închide</button>`
      : `<button class="btn small" data-t="minus" aria-label="Scade 30 de secunde">−30s</button>
         <button class="btn small" data-t="toggle" aria-label="${T.paused ? 'Continuă' : 'Pauză'}">${icon(T.paused ? 'play' : 'pause')}</button>
         <button class="btn small" data-t="plus" aria-label="Adaugă 30 de secunde">+30s</button>
         <button class="btn small ghost" data-t="stop" aria-label="Oprește cronometrul">${icon('x')}</button>`}
    </div></div>`;
  root.querySelector('.tprog i').style.width = `${100 - (left / T.total) * 100}%`;
}

function onTimerClick(e) {
  const b = e.target.closest('[data-t]');
  if (!b) return;
  ui.lastActivity = Date.now();
  const a = b.dataset.t;
  if (a === 'minus') timer.adjust(-30);
  else if (a === 'plus') timer.adjust(30);
  else if (a === 'toggle') timer.T.paused ? timer.resume() : timer.pause();
  else if (a === 'stop') timer.stop();
  else if (a === 'again') { const m = timer.T.meta; startStep(m.proc, m); }
}

// Clientul „din context”: ședința deschisă, fișa deschisă sau ședința care are loc acum
function currentSessionOf(clientId) {
  if (!clientId) return null;
  const now = Date.now();
  const today = sessionsOnDay(S.db, dateKey(new Date())).filter(s => s.clientId === clientId && s.status !== 'anulata');
  return today.sort((a, b) => Math.abs(fromLocal(a.start) - now) - Math.abs(fromLocal(b.start) - now))[0] || null;
}

function contextClient() {
  const r = ui.route;
  if (r?.name === 'sedinta' && live(S.db.sessions[r.id])) return { clientId: S.db.sessions[r.id].clientId, sessionId: r.id };
  if (r?.name === 'client' && live(client(r.id))) return { clientId: r.id, sessionId: currentSessionOf(r.id)?.id || null };
  const now = Date.now();
  const s = sessionsOnDay(S.db, dateKey(new Date())).find(x => x.status !== 'anulata'
    && fromLocal(x.start).getTime() - 15 * 60000 <= now && endOf(x).getTime() + 30 * 60000 >= now);
  return s ? { clientId: s.clientId, sessionId: s.id } : { clientId: null, sessionId: null };
}

function setClientTime(clientId, proc, secs) {
  const c = client(clientId);
  const timers = { ...(c.timers || {}) };
  if (secs) timers[proc] = secs; else delete timers[proc];
  store.put('clients', { ...c, timers });
}

function setGeneralTime(proc, secs) {
  const timers = { ...(settings().timers || {}) };
  if (secs) timers[proc] = secs; else delete timers[proc];
  store.setSettings({ timers });
}

// Fereastră pentru alegerea unei durate. Întoarce secunde, 'reset' sau null.
function durationBox({ title, text = '', seconds, resetLabel = '' }) {
  return new Promise(resolve => {
    let result = null;
    const quick = [30, 60, 90, 120, 180, 240, 300];
    const m = modal(`
      <h2>${esc(title)}</h2>
      ${text ? `<p class="small muted">${text}</p>` : ''}
      <div class="chips quick">${quick.map(q => `<button class="chip ${q === seconds ? 'on' : ''}" data-act="q" data-v="${q}">${fmtDur(q)}</button>`).join('')}</div>
      <div class="row2">
        <label>Minute<input id="du-m" type="number" inputmode="numeric" min="0" max="60" value="${Math.floor(seconds / 60)}"></label>
        <label>Secunde<input id="du-s" type="number" inputmode="numeric" min="0" max="59" step="5" value="${seconds % 60}"></label>
      </div>
      <p class="err" role="alert"></p>
      <div class="btns"><button class="btn primary" data-act="ok">${icon('check')} Salvează</button><button class="btn" data-act="no">Renunță</button></div>
      ${resetLabel ? `<button class="btn ghost small" data-act="reset">${esc(resetLabel)}</button>` : ''}`, {
      onClose: () => resolve(result),
      actions: {
        q: el => { const v = Number(el.dataset.v); m.$('#du-m').value = Math.floor(v / 60); m.$('#du-s').value = v % 60; m.el.querySelectorAll('.quick .chip').forEach(c => c.classList.toggle('on', c === el)); },
        ok: () => {
          const sec = (Number(m.$('#du-m').value) || 0) * 60 + (Number(m.$('#du-s').value) || 0);
          if (sec < 5 || sec > 3600) { m.$('.err').textContent = 'Alege o durată între 5 secunde și 60 de minute.'; return; }
          result = sec;
          m.close();
        },
        reset: () => { result = 'reset'; m.close(); },
        no: () => m.close(),
      },
    });
  });
}

async function editClientTime(clientId, proc) {
  const c = client(clientId);
  const pt = procTime(settings(), c, proc);
  const g = generalTime(settings(), proc);
  const v = await durationBox({
    title: `Pauza după „${spokenProc(proc)}”`,
    text: `Doar pentru <b>${esc(c.name)}</b>. Timpul general pentru această procedură este ${fmtDur(g)}.`,
    seconds: pt.seconds,
    resetLabel: pt.source === 'client' ? `Folosește timpul general (${fmtDur(g)})` : '',
  });
  if (v === null) return;
  setClientTime(clientId, proc, v === 'reset' ? null : v);
  toast(v === 'reset' ? `${c.name}: „${spokenProc(proc)}” folosește din nou timpul general.` : `${c.name}: pauza după „${spokenProc(proc)}” este ${sayDur(v)}.`);
}

function newSession(clientId, start) {
  return store.put('sessions', {
    id: uid(), clientId, start, duration: settings().duration, status: 'programata',
    procedures: [], reactions: '', after: '', notes: '', nextId: null, createdAt: Date.now(),
  });
}

function afterSchedule(s) {
  const c = client(s.clientId);
  toast(`Programare: ${c.name}, ${fmtRelDay(fromLocal(s.start))} la ${fmtTime(fromLocal(s.start))}.`, {
    action: 'Pune în Calendar', ms: 8000, onAction: () => openCalendar(s),
  });
}

function calStamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function openCalendar(s) {
  const c = client(s.clientId);
  const who = settings().calTitle === 'initials' ? initials(c.name) : c.name;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bucharest';
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(`Ședință Bowtech – ${who}`)}` +
    `&dates=${calStamp(fromLocal(s.start))}/${calStamp(endOf(s))}` +
    `&ctz=${encodeURIComponent(tz)}` +
    `&details=${encodeURIComponent('Programare din Agenda Bowtech')}`;
  window.open(url, '_blank', 'noopener');
}

// Dictare într-un câmp de text
function dictateInto(key) {
  const ta = $(`[data-f=${key}]`);
  if (!ta) return;
  const btn = $(`[data-act=dictate][data-v=${key}]`);
  btn.classList.add('listening');
  const rec = voice.listen({ onPartial: t => { btn.dataset.partial = t; } });
  rec.result.then(alts => {
    btn.classList.remove('listening');
    if (!alts.length) return;
    let t = alts[0];
    t = t[0].toLocaleUpperCase('ro') + t.slice(1);
    ta.value = ta.value ? `${ta.value.replace(/\s+$/, '')}\n${t}` : t;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }).catch(e => { btn.classList.remove('listening'); toast(e.message); });
}

// ====================================================================
// Programare nouă
// ====================================================================

function defaultTime() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(Math.min(Math.max(d.getHours() + 1, 9), 18));
  return fmtTime(d);
}

function lastSessionBefore(clientId, start) {
  const list = clientSessions(S.db, clientId).filter(s => s.status !== 'anulata' && s.start < start);
  return list[list.length - 1] || null;
}

VIEWS.nou = (id, q) => {
  const d = ui.newDraft ||= {
    clientId: q.get('c') && live(client(q.get('c'))) ? q.get('c') : null,
    newName: q.get('name') || '',
    search: '',
    date: q.get('d') || dateKey(new Date()),
    time: q.get('t') || defaultTime(),
    duration: settings().duration,
  };
  const chosen = d.clientId ? client(d.clientId).name : d.newName;
  let hint = '';
  if (d.clientId) {
    const last = lastSessionBefore(d.clientId, `${d.date}T${d.time}`) || lastSessionBefore(d.clientId, '9999');
    if (last) {
      const prop = proposeNext(last, settings());
      hint = `<div class="note small">${icon('history')}<div>Ultima ședință: ${fmtDateLong(fromLocal(last.start))}.
        Propunere pentru următoarea: <b>${fmtDateLong(fromLocal(prop))}, ${prop.slice(11)}</b>.
        <button class="link" data-act="n-sug" data-v="${prop}">Folosește propunerea</button></div></div>`;
    }
  }
  const html = `
    <section class="card">
      <h2>Client</h2>
      ${chosen ? `<div class="chosen"><div><b>${esc(chosen)}</b>${d.newName ? ' <span class="pill">client nou</span>' : ''}</div>
          <button class="btn small" data-act="n-clear">Schimbă</button></div>`
        : `<div class="searchbar">${icon('search')}<input type="search" data-f="csearch" placeholder="Caută sau scrie numele clientului" autocomplete="off" value="${esc(d.search)}"></div>
           <div id="cresults" class="pick">${clientResults(d.search)}</div>`}
    </section>
    <section class="card">
      <h2>Când</h2>
      <div class="row3">
        <label>Data<input type="date" data-f="date" value="${d.date}"></label>
        <label>Ora<input type="time" data-f="time" value="${d.time}" step="300"></label>
        <label>Durata<select data-f="duration">${durationOptions(d.duration)}</select></label>
      </div>
      <p class="small muted" id="nlabel">${capFirst(fmtDateLong(parseKey(d.date)))}</p>
      <div id="overlap">${overlapWarn(`${d.date}T${d.time}`, d.duration)}</div>
      ${hint}
    </section>
    <button class="btn primary big" data-act="n-create">${icon('check')} Programează</button>`;
  return {
    title: 'Programare nouă', html, tab: 'nou',
    onInput: e => {
      const f = e.target.dataset.f;
      if (f === 'csearch') { d.search = e.target.value; $('#cresults').innerHTML = clientResults(d.search); return; }
      if (f === 'date' || f === 'time' || f === 'duration') {
        d.date = $('[data-f=date]').value || d.date;
        d.time = $('[data-f=time]').value || d.time;
        d.duration = Number($('[data-f=duration]').value);
        $('#nlabel').textContent = capFirst(fmtDateLong(parseKey(d.date)));
        $('#overlap').innerHTML = overlapWarn(`${d.date}T${d.time}`, d.duration);
      }
    },
  };
};

function clientResults(search) {
  const n = norm(search);
  const all = clientsList(S.db);
  const list = (n ? all.filter(c => norm(c.name).includes(n) || norm(c.phone).replace(/ /g, '').includes(n.replace(/ /g, ''))) : all).slice(0, 8);
  let h = list.map(c => {
    const nx = nextSessionOf(S.db, c.id);
    return `<button class="pick-row" data-act="n-pick" data-v="${c.id}"><span>${esc(c.name)}</span>
      <small>${nx ? `Următoarea: ${fmtDateShort(fromLocal(nx.start))}, ${fmtTime(fromLocal(nx.start))}` : esc(c.phone || '')}</small></button>`;
  }).join('');
  if (search.trim() && !all.some(c => norm(c.name) === n)) {
    h += `<button class="pick-row new" data-act="n-picknew">${icon('plus')}<span>Client nou: <b>${esc(capName(search.trim()))}</b></span></button>`;
  }
  if (!h) h = '<p class="small muted">Scrie numele clientului.</p>';
  return h;
}

Object.assign(ACTIONS, {
  'n-pick': el => { ui.newDraft.clientId = el.dataset.v; ui.newDraft.newName = ''; rerender(); },
  'n-picknew': () => { ui.newDraft.newName = capName(ui.newDraft.search.trim()); ui.newDraft.clientId = null; rerender(); },
  'n-clear': () => { ui.newDraft.clientId = null; ui.newDraft.newName = ''; rerender(); setTimeout(() => $('[data-f=csearch]')?.focus(), 30); },
  'n-sug': el => { ui.newDraft.date = el.dataset.v.slice(0, 10); ui.newDraft.time = el.dataset.v.slice(11); rerender(); },
  'n-create': () => {
    const d = ui.newDraft;
    if (!d.clientId && !d.newName) { toast('Alege clientul.'); $('[data-f=csearch]')?.focus(); return; }
    if (!d.date || !d.time) { toast('Alege data și ora.'); return; }
    const clientId = d.clientId || createClient({ name: d.newName }).id;
    const start = `${d.date}T${d.time}`;
    const prev = lastSessionBefore(clientId, start);
    const s = store.put('sessions', { ...newSession(clientId, start), duration: d.duration });
    if (prev && !prev.nextId) store.put('sessions', { ...prev, nextId: s.id });
    ui.newDraft = null;
    afterSchedule(s);
    go(`#/agenda?d=${d.date}&m=zi`);
  },
});

function createClient(fields) {
  return store.put('clients', {
    id: uid(), name: capName(fields.name.trim()), phone: fields.phone || '', email: '', birth: '',
    reason: fields.reason || '', notes: '', createdAt: Date.now(),
  });
}

// ====================================================================
// Clienți
// ====================================================================

VIEWS.clienti = () => {
  const html = `
    <div class="searchbar">${icon('search')}<input type="search" data-f="q" placeholder="Caută client după nume sau telefon" value="${esc(ui.clientQ)}" autocomplete="off"></div>
    <a class="btn primary" href="#/client-nou">${icon('plus')} Client nou</a>
    <div id="clist" class="list">${clientRows(ui.clientQ)}</div>`;
  return {
    title: 'Clienți', html,
    onInput: e => { if (e.target.dataset.f === 'q') { ui.clientQ = e.target.value; $('#clist').innerHTML = clientRows(ui.clientQ); } },
  };
};

function avatar(name, cls = '') {
  const p = name.trim().split(/\s+/);
  const ini = (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
  return `<div class="avatar ${cls}">${esc(ini)}</div>`;
}

function clientRows(q) {
  const n = norm(q);
  const all = clientsList(S.db);
  const list = n ? all.filter(c => norm(c.name).includes(n) || norm(c.phone).replace(/ /g, '').includes(n.replace(/ /g, ''))) : all;
  if (!all.length) return `<div class="empty">${icon('users')}<p>Nu ai încă niciun client.</p></div>`;
  if (!list.length) return '<p class="muted center">Niciun client găsit.</p>';
  return list.map(c => {
    const nx = nextSessionOf(S.db, c.id);
    const done = clientSessions(S.db, c.id).filter(s => s.status === 'efectuata');
    const last = done[done.length - 1];
    const meta = nx ? `Următoarea: ${fmtDateShort(fromLocal(nx.start))}, ${fmtTime(fromLocal(nx.start))}`
      : last ? `Ultima: ${fmtDateShort(fromLocal(last.start))}` : 'Fără ședințe';
    return `<a class="card crow" href="#/client/${c.id}">${avatar(c.name)}
      <div class="info"><div class="name">${esc(c.name)}</div><div class="meta">${meta}${done.length ? ` · ${plural(done.length, 'ședință', 'ședințe')}` : ''}</div></div>
      ${icon('right', 'chev')}</a>`;
  }).join('');
}

function waNumber(phone) {
  let d = String(phone).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return '40' + d.slice(1);
  return d;
}

VIEWS.client = id => {
  const c = client(id);
  if (!live(c)) return notFound('Clientul nu mai există.');
  const list = clientSessions(S.db, id).slice().reverse();
  const nx = nextSessionOf(S.db, id);
  const tel = c.phone ? c.phone.replace(/[^\d+]/g, '') : '';
  const html = `
    <section class="card head center">
      ${avatar(c.name, 'big')}
      <h2 class="cname">${esc(c.name)}</h2>
      <div class="quick">
        ${tel ? `<a class="btn" href="tel:${tel}">${icon('phone')} Sună</a>
          <a class="btn" href="sms:${tel}">${icon('msg')} SMS</a>
          <a class="btn" href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <a class="btn primary" href="#/nou?c=${id}">${icon('plus')} Programează</a>
      </div>
      ${nx ? `<p class="nextline">Următoarea ședință: <a href="#/sedinta/${nx.id}">${fmtRelDay(fromLocal(nx.start))}, la ${fmtTime(fromLocal(nx.start))}</a></p>` : ''}
    </section>
    <section class="card form">
      <div class="row-h"><h2>Fișa clientului</h2><span id="saved" class="saved"></span></div>
      <label>Nume<input data-f="name" value="${esc(c.name)}" autocomplete="off"></label>
      <label>Telefon<input type="tel" data-f="phone" value="${esc(c.phone)}" inputmode="tel" autocomplete="off"></label>
      <label>E-mail<input type="email" data-f="email" value="${esc(c.email)}" autocomplete="off"></label>
      <label>Data nașterii<input type="date" data-f="birth" value="${esc(c.birth)}"></label>
      ${textField('reason', 'Motivul pentru care a venit', c.reason)}
      ${textField('notes', 'Notițe generale (istoric, contraindicații)', c.notes)}
    </section>
    <section class="card">
      <h2>${icon('timer')} Pauze doar pentru ${esc(c.name.split(' ')[0])}</h2>
      ${clientTimersHtml(c)}
      <button class="btn" data-act="c-addtime">${icon('plus')} Pauză personalizată</button>
    </section>
    <h2 class="sec">Ședințe ${list.length ? `(${list.length})` : ''}</h2>
    <div class="list">${list.length ? list.map(historyCard).join('') : '<p class="muted center">Nicio ședință încă.</p>'}</div>
    <section class="actions"><button class="btn danger ghost" data-act="c-del">${icon('trash')} Șterge clientul</button></section>`;
  return {
    title: 'Client', html, back: '#/clienti', tab: 'clienti',
    onInput: e => {
      const f = e.target.dataset.f;
      if (!f) return;
      let v = e.target.value;
      if (f === 'name') { if (!v.trim()) return; v = v.replace(/\s+/g, ' ').trimStart(); }
      editRecord('clients', id, { [f]: v });
    },
  };
};

function historyCard(s) {
  const st = fromLocal(s.start);
  const n = sessionNumber(S.db, s);
  const bits = [];
  if (s.procedures?.length) bits.push(`<div class="sum">${esc(s.procedures.join(', '))}</div>`);
  if (s.after) bits.push(`<div class="sum muted">După: ${esc(s.after.slice(0, 120))}${s.after.length > 120 ? '…' : ''}</div>`);
  return `<a class="card sess hist st-${s.status}" href="#/sedinta/${s.id}">
    <div class="time"><b>${st.getDate()}</b><small>${fmtDateShort(st).split(' ').slice(2).join(' ')}</small></div>
    <div class="info"><div class="name">${capFirst(fmtDateLong(st))}, ${fmtTime(st)}</div>
      <div class="meta">${n ? `Ședința nr. ${n}` : ''} ${statusPill(s)}</div>${bits.join('')}</div>
    ${icon('right', 'chev')}</a>`;
}

function clientTimersHtml(c) {
  const entries = Object.entries(c.timers || {}).filter(([, v]) => v > 0);
  if (!entries.length) return '<p class="small muted">Folosește timpii generali pentru toate procedurile. Poți pune alt timp doar pentru acest client, la orice procedură.</p>';
  return `<p class="small muted">Celelalte proceduri folosesc timpii generali din Setări.</p>
    <div class="trows">${entries.map(([p, v]) => `<div class="trow2">
      <span>${esc(p)}<br><small>general: ${fmtDur(generalTime(settings(), p))}</small></span>
      <button class="btn small" data-act="c-edittime" data-v="${esc(p)}">${fmtDur(v)}</button>
      <button class="icon-btn small" data-act="c-deltime" data-v="${esc(p)}" aria-label="Folosește timpul general pentru ${esc(p)}">${icon('x')}</button>
    </div>`).join('')}</div>`;
}

Object.assign(ACTIONS, {
  'c-addtime': async () => {
    const c = client(ui.route.id);
    const p = await choose('Pentru ce procedură?', settings().procedures.map(n => {
      const pt = procTime(settings(), c, n);
      return { label: n, sub: `${fmtDur(pt.seconds)}${pt.source === 'client' ? ' (personalizat)' : ''}`, value: n };
    }));
    if (!p) return;
    await editClientTime(c.id, p);
    rerender();
  },
  'c-edittime': async el => { await editClientTime(ui.route.id, el.dataset.v); rerender(); },
  'c-deltime': el => {
    const c = client(ui.route.id);
    setClientTime(c.id, el.dataset.v, null);
    toast(`„${spokenProc(el.dataset.v)}” folosește din nou timpul general.`);
    rerender();
  },
});

ACTIONS['c-del'] = async () => {
  const c = client(ui.route.id);
  const list = clientSessions(S.db, c.id);
  const ok = await confirmBox(`Ștergi clientul <b>${esc(c.name)}</b>${list.length ? ` și toate cele ${list.length} ședințe ale lui` : ''}? Nu se mai poate reveni.`,
    { ok: 'Șterge', danger: true });
  if (!ok) return;
  flushEdits();
  list.forEach(s => store.remove('sessions', s.id));
  store.remove('clients', c.id);
  toast('Clientul a fost șters.');
  go('#/clienti');
};

VIEWS['client-nou'] = (id, q) => {
  const html = `
    <form class="card form" id="f-client" novalidate>
      <label>Nume și prenume<input id="nc-name" value="${esc(q.get('name') || '')}" autocomplete="off" autocapitalize="words"></label>
      <label>Telefon<input id="nc-phone" type="tel" inputmode="tel" autocomplete="off"></label>
      <label>Motivul pentru care a venit<textarea id="nc-reason" rows="3"></textarea></label>
      <p class="err" role="alert"></p>
      <button class="btn primary big" type="submit">${icon('check')} Salvează clientul</button>
    </form>`;
  return {
    title: 'Client nou', html, back: '#/clienti', tab: 'clienti',
    after: () => {
      setTimeout(() => $('#nc-name')?.focus(), 50);
      $('#f-client').onsubmit = e => {
        e.preventDefault();
        const name = $('#nc-name').value.trim();
        if (!name) { $('#f-client .err').textContent = 'Scrie numele clientului.'; return; }
        const c = createClient({ name, phone: $('#nc-phone').value.trim(), reason: $('#nc-reason').value.trim() });
        history.replaceState(history.state, '', `#/client/${c.id}`);
        route();
      };
    },
  };
};

function notFound(msg) {
  return { title: 'Agenda', html: `<div class="empty">${icon('alert')}<p>${esc(msg)}</p><a class="btn" href="#/agenda">Înapoi la agendă</a></div>`, back: '#/agenda' };
}

// ====================================================================
// Setări
// ====================================================================

const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

VIEWS.setari = (id, q) => {
  const st = settings();
  const gh = S.cfg.gh;
  const notifState = !('Notification' in window) ? 'none' : Notification.permission;
  const standalone = matchMedia('(display-mode: standalone)').matches;

  let backup;
  if (gh) {
    const err = S.cfg.lastError;
    backup = `
      <div class="kv"><span>Depozit</span><b>${esc(gh.owner)}/${esc(gh.repo)}</b></div>
      <div class="kv"><span>Ultima copie</span><b>${S.cfg.lastSync ? timeAgo(S.cfg.lastSync) : 'încă nu'}</b></div>
      ${S.cfg.pending ? '<p class="small muted">Sunt modificări care se vor copia în câteva secunde.</p>' : ''}
      ${err ? `<div class="note warn small">${icon('alert')}<div>${esc(err)}</div></div>` : ''}
      ${S.cfg.mismatch ? `<button class="btn primary" data-act="b-adopt">Îmbină cu copia din GitHub</button>` : ''}
      <div class="btns wrap">
        <button class="btn" data-act="b-sync">${icon('cloud')} Fă copia acum</button>
        <button class="btn" data-act="b-versions">${icon('history')} Versiuni anterioare</button>
        <button class="btn ghost" data-act="b-disconnect">Deconectează</button>
      </div>`;
  } else {
    backup = `
      <p class="small">Copia se face automat într-un depozit <b>privat</b> din contul tău GitHub (gratuit), criptată cu parola agendei. Dacă se strică telefonul, instalezi aplicația pe altul și restaurezi totul.</p>
      <p class="small">Pașii sunt explicați în <a href="#/ajutor?s=backup">Ajutor → Copia de siguranță</a>.</p>
      <form id="f-gh" class="form" novalidate>
        <label>Numele tău de utilizator GitHub<input id="gh-owner" autocapitalize="off" spellcheck="false" autocomplete="off"></label>
        <label>Numele depozitului privat<input id="gh-repo" value="agenda-date" autocapitalize="off" spellcheck="false" autocomplete="off"></label>
        <label>Tokenul GitHub<input id="gh-token" type="password" placeholder="github_pat_…" autocomplete="off"></label>
        <p class="err" role="alert"></p>
        <button class="btn primary" type="submit">${icon('cloud')} Pornește copia de siguranță</button>
      </form>`;
  }

  const html = `
    <section class="card" id="sec-backup">
      <h2>${icon('cloud')} Copie de siguranță în GitHub</h2>
      ${backup}
    </section>
    <section class="card">
      <h2>${icon('download')} Copie într-un fișier</h2>
      <p class="small muted">Un fișier criptat pe care îl poți păstra în Google Drive sau trimite pe e-mail. Se deschide doar cu parola agendei.</p>
      <div class="btns wrap">
        ${navigator.canShare ? `<button class="btn" data-act="f-share">${icon('share')} Trimite / salvează în Drive</button>` : ''}
        <button class="btn" data-act="f-download">${icon('download')} Descarcă fișierul</button>
        <label class="btn">${icon('upload')} Adaugă dintr-un fișier<input type="file" id="imp-file" accept=".json,application/json" hidden></label>
      </div>
    </section>
    <section class="card form">
      <h2>${icon('calendar')} Programări</h2>
      <label>Ședința următoare se propune după
        <div class="stepper"><button class="btn" data-act="st-int" data-v="-1">−</button><b id="int">${st.interval} ${st.interval === 1 ? 'zi' : 'zile'}</b><button class="btn" data-act="st-int" data-v="1">+</button></div></label>
      <label>Durata obișnuită a unei ședințe<select data-f="duration">${durationOptions(st.duration)}</select></label>
      <div><div class="lbl">Zile de lucru</div>
        <div class="chips">${WD_ORDER.map(w => `<button class="chip ${st.workDays.includes(w) ? 'on' : ''}" data-act="st-wd" data-v="${w}">${ZILE_SCURT[w]}</button>`).join('')}</div>
        <p class="small muted">Dacă ziua propusă nu e zi de lucru, se alege următoarea zi de lucru.</p></div>
    </section>
    <section class="card form">
      <h2>${icon('bell')} Mementouri</h2>
      <p class="small muted">Cel mai sigur memento: după programare apasă „Pune în Calendar”, iar Google Calendar te anunță chiar dacă aplicația e închisă. Notificările de mai jos apar doar când aplicația a fost deschisă recent.</p>
      ${notifState === 'none' ? '<p class="small">Acest browser nu permite notificări.</p>'
        : notifState === 'denied' ? '<p class="small">Notificările sunt blocate. Le poți permite din setările Chrome pentru acest site.</p>'
        : `<label class="check"><input type="checkbox" data-f="notify" ${st.notify && notifState === 'granted' ? 'checked' : ''}> Notificare înainte de ședință</label>`}
      <label>Cu cât timp înainte<select data-f="reminderMin">${[10, 15, 30, 60, 120].map(m => `<option value="${m}" ${st.reminderMin === m ? 'selected' : ''}>${m < 60 ? `${m} minute` : m === 60 ? 'o oră' : '2 ore'}</option>`).join('')}</select></label>
      <label>În Google Calendar scrie<select data-f="calTitle">
        <option value="full" ${st.calTitle === 'full' ? 'selected' : ''}>numele complet al clientului</option>
        <option value="initials" ${st.calTitle === 'initials' ? 'selected' : ''}>doar prenumele și inițiala</option></select></label>
    </section>
    <section class="card form">
      <h2>${icon('mic')} Comenzi vocale</h2>
      ${voice.canListen ? '' : '<p class="small">Acest browser nu are recunoaștere vocală. Pe telefon folosește Google Chrome.</p>'}
      <label class="check"><input type="checkbox" data-f="speak" ${st.speak ? 'checked' : ''}> Răspunde cu voce</label>
      <a class="btn" href="#/ajutor">${icon('help')} Ce comenzi pot spune?</a>
    </section>
    <section class="card form">
      <h2>${icon('timer')} Cronometru și sunet</h2>
      <p class="small muted">După fiecare pas pornești din ședință o pauză cu numărătoare inversă. La final se aude un sunet blând.</p>
      <label>Pauza obișnuită (pentru procedurile fără timp propriu)
        <div class="stepper"><button class="btn" data-act="st-tdef" data-v="-15">−</button><b id="tdef">${fmtDur(st.timerDefault)}</b><button class="btn" data-act="st-tdef" data-v="15">+</button></div></label>
      <label>Sunetul de la final<select data-f="alarmSound">
        <option value="bol" ${st.alarmSound === 'bol' ? 'selected' : ''}>Bol tibetan (jos, se stinge încet)</option>
        <option value="clopotel" ${st.alarmSound === 'clopotel' ? 'selected' : ''}>Clopoțel (trei note moi)</option></select></label>
      <label>Volumul<input type="range" data-f="alarmVolume" min="5" max="100" step="5" value="${st.alarmVolume}"></label>
      <label class="check"><input type="checkbox" data-f="alarmVibrate" ${st.alarmVibrate ? 'checked' : ''}> Vibrează la final</label>
      <button class="btn" data-act="st-tsound">${icon('volume')} Ascultă sunetul</button>
      <p class="small muted">Cât timp merge cronometrul, ecranul telefonului rămâne aprins.</p>
    </section>
    <section class="card">
      <h2>Lista de proceduri</h2>
      <p class="small muted">Apar ca pași în fiecare ședință. Timpul de lângă fiecare este pauza generală după acel pas; apasă pe el ca să-l schimbi. La un client anume poți pune alt timp din fișa lui.</p>
      <div class="plist">${st.procedures.map((p, i) => `<div class="prow"><span>${esc(p)}</span>
        <button class="dur ${st.timers?.[p] ? '' : 'def'}" data-act="st-ptime" data-v="${i}" aria-label="Pauza după ${esc(p)}: ${sayDur(generalTime(st, p))}">${fmtDur(generalTime(st, p))}</button>
        <button class="icon-btn small" data-act="st-pup" data-v="${i}" aria-label="Mută mai sus" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn small" data-act="st-pdel" data-v="${i}" aria-label="Scoate">${icon('x')}</button></div>`).join('')}</div>
      <div class="addrow"><input id="st-newproc" placeholder="Procedură nouă…" enterkeyhint="done"><button class="btn" data-act="st-padd">Adaugă</button></div>
      <button class="btn ghost small" data-act="st-preset">Readu lista inițială</button>
    </section>
    <section class="card form">
      <h2>${icon('lock')} Siguranță</h2>
      <label>Agenda se blochează singură după<select data-f="autoLockMin">${[5, 15, 30, 60, 240].map(m => `<option value="${m}" ${st.autoLockMin === m ? 'selected' : ''}>${m < 60 ? `${m} minute` : m === 60 ? 'o oră' : '4 ore'} fără folosire</option>`).join('')}</select></label>
      <div id="bio-set"></div>
      <div class="btns wrap">
        <button class="btn" data-act="st-pw">Schimbă parola</button>
        <button class="btn" data-act="lock">${icon('lock')} Blochează acum</button>
      </div>
    </section>
    <section class="card">
      <h2>Aplicația</h2>
      ${standalone ? '<p class="small">Aplicația este instalată pe telefon.</p>' : ui.installPrompt
        ? `<button class="btn primary" data-act="st-install">Instalează aplicația pe ecran</button>`
        : '<p class="small">Ca s-o instalezi: în Chrome apasă meniul <b>⋮</b> (sus, dreapta) și alege <b>„Instalează aplicația”</b> sau <b>„Adaugă pe ecranul de pornire”</b>.</p>'}
      <a class="btn" href="#/ajutor">${icon('help')} Ajutor</a>
      <p class="small muted">Versiunea ${VERSION}</p>
      <button class="btn danger ghost small" data-act="st-wipe">Șterge agenda de pe acest telefon</button>
    </section>`;

  return {
    title: 'Setări', html, tab: 'setari',
    onInput: async e => {
      const f = e.target.dataset.f;
      if (e.type !== 'change') return;
      if (f === 'alarmVolume') {
        if (e.type === 'change') { store.setSettings({ alarmVolume: Number(e.target.value) }); timer.preview({ sound: settings().alarmSound, volume: Number(e.target.value) }); }
        return;
      }
      if (f === 'alarmVibrate') { store.setSettings({ alarmVibrate: e.target.checked }); return; }
      if (f === 'alarmSound') { store.setSettings({ alarmSound: e.target.value }); timer.preview({ sound: e.target.value, volume: settings().alarmVolume }); return; }
      if (f === 'duration' || f === 'reminderMin' || f === 'autoLockMin') store.setSettings({ [f]: Number(e.target.value) });
      else if (f === 'calTitle') store.setSettings({ calTitle: e.target.value });
      else if (f === 'speak') store.setSettings({ speak: e.target.checked });
      else if (f === 'notify') {
        if (e.target.checked && Notification.permission !== 'granted') {
          const p = await Notification.requestPermission();
          if (p !== 'granted') { e.target.checked = false; toast('Notificările nu au fost permise.'); return; }
        }
        store.setSettings({ notify: e.target.checked });
        if (e.target.checked) toast('Vei primi o notificare înainte de ședințe (cât timp aplicația e deschisă recent).');
      } else if (e.target.id === 'imp-file' && e.target.files[0]) {
        importFile(e.target.files[0]);
        e.target.value = '';
      }
    },
    after: async () => {
      if (q.get('s') === 'backup') $('#sec-backup')?.scrollIntoView({ block: 'start' });
      $('#st-newproc')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ACTIONS['st-padd'](); } });
      const f = $('#f-gh');
      if (f) f.onsubmit = ev => { ev.preventDefault(); connectGitHub(f); };
      const slot = $('#bio-set');
      if (slot && await bio.bioPossible()) {
        const on = await bio.bioEnrolled();
        if (!$('#bio-set')) return;
        slot.innerHTML = on
          ? `<div class="kv"><span>${icon('finger')} Deblocare cu amprenta</span><b>pornită</b></div><button class="btn ghost small" data-act="st-bio-off">Oprește amprenta</button>`
          : `<button class="btn" data-act="st-bio-on">${icon('finger')} Deschide agenda cu amprenta</button>`;
      }
    },
  };
};

async function connectGitHub(f) {
  const err = $('.err', f);
  const owner = $('#gh-owner').value, repo = $('#gh-repo').value, token = $('#gh-token').value;
  if (!owner.trim() || !repo.trim() || !token.trim()) { err.textContent = 'Completează toate câmpurile.'; return; }
  await busy($('button[type=submit]', f), 'Se verifică…', async () => {
    const r = await store.connectGitHub({ owner, repo, token });
    if (!r.private) {
      await store.disconnectGitHub();
      throw new Error('Depozitul este PUBLIC: oricine îl poate vedea. Fă-l privat (Settings → Danger Zone → Change visibility → Private) sau creează unul nou, privat.');
    }
    if (r.mismatch) {
      rerender();
      const ok = await confirmBox('În acest depozit există deja o copie a unei agende, făcută cu altă parolă. Vrei s-o deschizi și s-o îmbini cu agenda de pe acest telefon?',
        { ok: 'Da, îmbină', cancel: 'Nu acum' });
      if (ok) await adoptRemote();
      return;
    }
    await store.syncNow();
    rerender();
    toast(r.hasBackup ? 'Gata! Am găsit copia existentă și am îmbinat-o cu agenda.' : 'Gata! Copia de siguranță este pornită.');
  }, err);
}

async function adoptRemote() {
  const vals = await formBox({
    title: 'Parola copiei din GitHub',
    text: 'Scrie parola cu care a fost făcută copia din GitHub. După îmbinare, agenda de pe acest telefon se va deschide cu <b>această parolă</b>.',
    fields: [{ id: 'pw', label: 'Parola', type: 'password', autocomplete: 'current-password' }],
    ok: 'Îmbină',
    check: async v => {
      try { await store.adoptRemote(v.pw); } catch (e) {
        if (e.code === 'BAD_PASSWORD') return 'Parola nu este corectă.';
        throw e;
      }
    },
  });
  if (vals) { rerender(); toast('Agendele au fost îmbinate.'); }
}

async function importFile(file) {
  try {
    const v = store.parseVaultFile(await file.text());
    let other;
    try { other = await store.openVault(v); } catch (e) {
      if (e.code !== 'MISMATCH') throw e;
      const vals = await formBox({
        title: 'Parola fișierului',
        text: 'Fișierul a fost făcut cu altă parolă. Scrie parola lui.',
        fields: [{ id: 'pw', label: 'Parola', type: 'password' }],
        ok: 'Deschide',
        check: async x => {
          try { other = await store.openVault(v, x.pw); } catch (er) {
            if (er.code === 'BAD_PASSWORD') return 'Parola nu este corectă.';
            throw er;
          }
        },
      });
      if (!vals) return;
    }
    const nC = Object.values(other.clients).filter(live).length;
    const nS = Object.values(other.sessions).filter(live).length;
    const how = await choose('Ce fac cu fișierul?', [
      { label: 'Adaug-o la agenda de acum', sub: 'Se păstrează tot ce ai; se adaugă ce lipsește', value: 'merge' },
      { label: 'Înlocuiește agenda cu ea', sub: 'Agenda devine exact ca în fișier', value: 'replace', cls: 'danger' },
    ], { text: `Fișierul conține ${plural(nC, 'client', 'clienți')} și ${plural(nS, 'ședință', 'ședințe')}.` });
    if (how === 'merge') { store.mergeIn(other); toast('Datele din fișier au fost adăugate.'); }
    if (how === 'replace') {
      const ok = await confirmBox('Sigur înlocuiești agenda? Ce ai adăugat după data fișierului se pierde.', { ok: 'Înlocuiește', danger: true });
      if (ok) { store.restoreSnapshot(other); toast('Agenda a fost înlocuită cu cea din fișier.'); }
    }
    rerender();
  } catch (e) {
    toast(e.message);
  }
}

async function exportFile(share) {
  const text = await store.exportText();
  const name = `agenda-bowtech-${dateKey(new Date())}.json`;
  const blob = new Blob([text], { type: 'application/json' });
  if (share) {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Copie Agenda Bowtech' }); } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`Fișierul ${name} a fost descărcat.`);
}

Object.assign(ACTIONS, {
  'b-sync': async el => {
    await busy(el, 'Se copiază…', async () => {
      S.cfg.pending = true;
      await store.syncNow();
      if (S.cfg.lastError) throw new Error(S.cfg.lastError);
      toast('Copia de siguranță este la zi.');
    });
    rerender();
  },
  'b-adopt': adoptRemote,
  'b-disconnect': async () => {
    const ok = await confirmBox('Oprești copia de siguranță? Copia existentă rămâne în GitHub, dar nu se mai actualizează.', { ok: 'Oprește', danger: true });
    if (!ok) return;
    await store.disconnectGitHub();
    rerender();
  },
  'b-versions': async el => {
    let list;
    await busy(el, 'Se încarcă…', async () => { list = await store.listVersions(); });
    if (!list) return;
    if (!list.length) { toast('Încă nu există versiuni anterioare.'); return; }
    const pick = await choose('Versiuni anterioare', list.map(v => ({ label: capFirst(fmtDateLong(parseKey(v.day))), sub: 'ultima copie din acea zi', value: v })),
      { text: 'Se păstrează câte o copie pe zi, pentru ultimele 14 zile.' });
    if (!pick) return;
    try {
      let old;
      const vault = await store.readVersion(pick.path);
      try { old = await store.openVault(vault); } catch (e) {
        if (e.code !== 'MISMATCH') throw e;
        const vals = await formBox({
          title: 'Parola copiei', text: 'Această copie a fost făcută cu o parolă veche. Scrie parola de atunci.',
          fields: [{ id: 'pw', label: 'Parola', type: 'password' }], ok: 'Deschide',
          check: async x => { try { old = await store.openVault(vault, x.pw); } catch (er) { if (er.code === 'BAD_PASSWORD') return 'Parola nu este corectă.'; throw er; } },
        });
        if (!vals) return;
      }
      const nC = Object.values(old.clients).filter(live).length;
      const nS = Object.values(old.sessions).filter(live).length;
      const ok = await confirmBox(`Readuc agenda cum era pe <b>${fmtDateLong(parseKey(pick.day))}</b> (${plural(nC, 'client', 'clienți')}, ${plural(nS, 'ședință', 'ședințe')})? Ce ai modificat după aceea se pierde.`,
        { ok: 'Readu agenda', danger: true });
      if (!ok) return;
      store.restoreSnapshot(old);
      rerender();
      toast('Agenda a fost readusă la versiunea aleasă.');
    } catch (e) { toast(e.message); }
  },
  'f-share': () => exportFile(true),
  'f-download': () => exportFile(false),
  'st-int': el => {
    const v = Math.min(60, Math.max(1, settings().interval + Number(el.dataset.v)));
    store.setSettings({ interval: v });
    $('#int').textContent = `${v} ${v === 1 ? 'zi' : 'zile'}`;
  },
  'st-wd': el => {
    const w = Number(el.dataset.v);
    const cur = settings().workDays;
    const next = cur.includes(w) ? cur.filter(x => x !== w) : [...cur, w];
    if (!next.length) { toast('Trebuie să rămână cel puțin o zi de lucru.'); return; }
    store.setSettings({ workDays: next });
    rerender();
  },
  'st-tdef': el => {
    const v = Math.min(1800, Math.max(15, settings().timerDefault + Number(el.dataset.v)));
    store.setSettings({ timerDefault: v });
    $('#tdef').textContent = fmtDur(v);
  },
  'st-tsound': () => timer.preview({ sound: settings().alarmSound, volume: settings().alarmVolume }),
  'st-ptime': async el => {
    const p = settings().procedures[Number(el.dataset.v)];
    const v = await durationBox({
      title: `Pauza după „${spokenProc(p)}”`,
      text: 'Pentru toți clienții, în afară de cei care au un timp personalizat pentru această procedură.',
      seconds: generalTime(settings(), p),
      resetLabel: settings().timers?.[p] ? `Folosește pauza obișnuită (${fmtDur(settings().timerDefault)})` : '',
    });
    if (v === null) return;
    setGeneralTime(p, v === 'reset' ? null : v);
    rerender();
  },
  'st-padd': () => {
    const inp = $('#st-newproc');
    const p = inp.value.trim();
    if (!p) return;
    if (!settings().procedures.includes(p)) store.setSettings({ procedures: [...settings().procedures, p] });
    rerender();
    setTimeout(() => $('#st-newproc')?.focus(), 30);
  },
  'st-pdel': el => {
    const list = settings().procedures.slice();
    list.splice(Number(el.dataset.v), 1);
    store.setSettings({ procedures: list });
    rerender();
  },
  'st-pup': el => {
    const i = Number(el.dataset.v);
    const list = settings().procedures.slice();
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    store.setSettings({ procedures: list });
    rerender();
  },
  'st-preset': async () => {
    const ok = await confirmBox('Readuc lista inițială de proceduri? Procedurile adăugate de tine dispar din listă (dar rămân în ședințele în care le-ai bifat).', { ok: 'Readu lista' });
    if (ok) { store.setSettings({ procedures: [...DEFAULT_PROCEDURES] }); rerender(); }
  },
  'st-pw': async () => {
    const vals = await formBox({
      title: 'Schimbă parola',
      fields: [
        { id: 'old', label: 'Parola de acum', type: 'password', autocomplete: 'current-password' },
        { id: 'n1', label: 'Parola nouă (cel puțin 8 caractere)', type: 'password', autocomplete: 'new-password' },
        { id: 'n2', label: 'Parola nouă, încă o dată', type: 'password', autocomplete: 'new-password' },
      ],
      ok: 'Schimbă parola',
      check: async v => {
        if (v.n1.length < 8) return 'Parola nouă trebuie să aibă cel puțin 8 caractere.';
        if (v.n1 !== v.n2) return 'Parolele noi nu sunt la fel.';
        try { await store.changePassword(v.old, v.n1); } catch (e) {
          if (e.code === 'BAD_PASSWORD') return 'Parola de acum nu este corectă.';
          throw e;
        }
      },
    });
    if (vals) toast('Parola a fost schimbată. Notează noua parolă într-un loc sigur.', { ms: 7000 });
  },
  'st-bio-on': async () => {
    try {
      await bio.bioEnroll(S.dk);
      toast('Gata! De acum poți deschide agenda cu amprenta.');
    } catch (e) {
      if (e.name !== 'NotAllowedError') toast(e.message || 'Amprenta nu a putut fi pornită.');
    }
    rerender();
  },
  'st-bio-off': async () => { await bio.bioRemove(); toast('Deblocarea cu amprenta a fost oprită.'); rerender(); },
  'st-install': async () => {
    const p = ui.installPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice.catch(() => {});
    ui.installPrompt = null;
    rerender();
  },
  'st-wipe': async () => {
    const backup = S.cfg.gh && !S.cfg.lastError ? 'Copia din GitHub rămâne și o poți restaura oricând.' : '<b>Nu ai o copie de siguranță la zi: datele se vor pierde definitiv.</b>';
    const vals = await formBox({
      title: 'Șterge agenda de pe telefon',
      text: `Toți clienții și toate ședințele vor fi șterse de pe acest telefon. ${backup}<br><br>Scrie parola ca să confirmi.`,
      fields: [{ id: 'pw', label: 'Parola', type: 'password' }],
      ok: 'Șterge de pe telefon',
      check: async v => { try { await store.checkPassword(v.pw); } catch { return 'Parola nu este corectă.'; } },
    });
    if (!vals) return;
    if (S.cfg.pending && S.cfg.gh) await store.syncNow();
    await store.wipeLocal();
    showWelcome();
  },
});

// ====================================================================
// Ajutor
// ====================================================================

VIEWS.ajutor = (id, q) => {
  const ex = list => `<ul class="examples">${list.map(e => `<li>„${esc(e)}”</li>`).join('')}</ul>`;
  const html = `
    <section class="card">
      <h2>${icon('mic')} Comenzi vocale</h2>
      <p>Apasă butonul rotund cu microfonul din mijlocul barei de jos și vorbește. Aplicația îți arată ce a înțeles; nimic nu se schimbă până nu apeși <b>Confirmă</b>.</p>
      <h3>Programări</h3>
      ${ex(['Programează-o pe Maria Popescu marți la ora 10', 'Programează-l pe Ion mâine la trei și jumătate', 'Programează-o pe Ana pe 5 noiembrie la 9 dimineața', 'Programează următoarea ședință pentru Ana'])}
      <p class="small muted">Dacă nu spui ziua, se propune ziua obișnuită după ultima ședință. Orele de la 1 la 7 sunt considerate după-amiaza („la 3” = 15:00); spune „dimineața” dacă e altfel.</p>
      <h3>Întrebări</h3>
      ${ex(['Ce ședințe am mâine?', 'Ce programări am săptămâna aceasta?', 'Cine vine vineri?', 'Când vine Maria?'])}
      <h3>Notițe</h3>
      ${ex(['Notează la Ion: durerea de spate s-a ameliorat', 'Notează la Maria reacții: a simțit căldură în zona lombară', 'Notează la Ana starea după: se simte relaxată', 'Notează la Ion proceduri: genunchi'])}
      <p class="small muted">Nota merge la ședința de azi a clientului (sau la ultima lui ședință). Cuvintele „reacții”, „starea după” și „proceduri” aleg câmpul; altfel merge la „Alte notițe”.</p>
      <h3>Mutări și anulări</h3>
      ${ex(['Mută ședința de la ora 15 pe joi', 'Mută ședința Mariei pe vineri la 11', 'Amână ședința lui Ion cu o zi', 'Anulează ședința de mâine a lui Ion'])}
      <h3>Cronometrul pașilor</h3>
      ${ex(['Pornește cronometrul pentru gât', 'Start genunchi', 'Oprește cronometrul'])}
      <p class="small muted">Dacă o ședință e deschisă (sau are loc chiar acum), se folosesc timpii clientului ei.</p>
      ${ex(['Setează la Maria pentru gât 3 minute', 'La Ion pentru coccis un minut și jumătate', 'La Maria toate procedurile 3 minute', 'La Ion pentru coccis timpul obișnuit', 'Timpul general pentru umăr să fie 2 minute', 'Cât timp are Maria la gât?'])}
      <p class="small muted">Cu numele clientului, timpul se schimbă doar pentru el. Cu „general” sau „pentru toți clienții”, se schimbă pentru toți cei care nu au timp personalizat.</p>
      <h3>Altele</h3>
      ${ex(['Deschide fișa Mariei', 'Ajutor'])}
      <p class="small muted">Recunoașterea vocii are nevoie de internet. În câmpurile de text poți dicta și cu butonul mic de microfon de lângă fiecare câmp.</p>
    </section>
    <section class="card" id="h-backup">
      <h2>${icon('cloud')} Copia de siguranță (GitHub, gratuit)</h2>
      <p>Datele stau criptate pe telefon. Ca să nu le pierzi dacă se strică telefonul, aplicația face singură o copie, tot criptată, într-un depozit <b>privat</b> din contul tău GitHub. Paginile GitHub sunt în engleză; mai jos scriu exact ce butoane să apeși.</p>
      <ol class="steps">
        <li><b>Depozitul privat.</b> Deschide <a href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>. La <i>Repository name</i> scrie <code>agenda-date</code>. Alege <b>Private</b>. Bifează <i>Add a README file</i>. Apasă <b>Create repository</b>.</li>
        <li><b>Tokenul</b> (o „cheie” care îi permite aplicației să scrie doar în acel depozit). Deschide <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">pagina de token nou</a>:
          <ul>
            <li><i>Token name</i>: <code>Agenda Bowtech</code></li>
            <li><i>Expiration</i>: alege cea mai lungă perioadă (de exemplu 1 an). Când expiră, faci altul la fel.</li>
            <li><i>Repository access</i>: <b>Only select repositories</b> → alege <code>agenda-date</code></li>
            <li><i>Permissions</i> → <i>Repository permissions</i> → <b>Contents</b> → <b>Read and write</b></li>
            <li>Apasă <b>Generate token</b>, apoi copiază tokenul (începe cu <code>github_pat_</code>).</li>
          </ul></li>
        <li>Revino aici, la <a href="#/setari?s=backup">Setări → Copie de siguranță</a>: scrie numele tău de utilizator GitHub, numele depozitului și lipește tokenul.</li>
      </ol>
      <p class="small muted">Copia se face la câteva secunde după fiecare modificare. Se mai păstrează câte o versiune pe zi pentru ultimele 14 zile.</p>
      <h3>Dacă se strică telefonul</h3>
      <p class="small">Pe telefonul nou deschide adresa aplicației în Chrome, alege <b>„Am deja o copie de siguranță”</b> → <b>Din GitHub</b> și scrie datele de mai sus și parola agendei.</p>
    </section>
    <section class="card">
      <h2>${icon('lock')} Parola</h2>
      <p class="small">Parola nu este trimisă nicăieri și nu poate fi recuperată. Fără ea nimeni nu poate citi datele, nici GitHub, nici altcineva care ar găsi telefonul. Păstreaz-o scrisă pe hârtie într-un loc sigur.</p>
    </section>`;
  return {
    title: 'Ajutor', html, back: '#/setari', tab: 'setari',
    after: () => { if (q.get('s') === 'backup') $('#h-backup')?.scrollIntoView({ block: 'start' }); },
  };
};

// ====================================================================
// Mementouri
// ====================================================================

async function checkReminders() {
  const st = settings();
  if (!st.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  const limit = now + st.reminderMin * 60000;
  S.cfg.notified ||= {};
  let changed = false;
  for (const s of sessionsList(S.db)) {
    if (s.status !== 'programata') continue;
    const t = fromLocal(s.start).getTime();
    if (t <= now || t > limit) continue;
    const key = `${s.id}@${s.start}`;
    if (S.cfg.notified[key]) continue;
    S.cfg.notified[key] = now;
    changed = true;
    const c = client(s.clientId);
    const n = sessionNumber(S.db, s);
    const title = `Ședință la ${fmtTime(fromLocal(s.start))}`;
    const opts = { body: `${c.name}${n ? ` · ședința nr. ${n}` : ''}`, tag: s.id, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { open: `#/sedinta/${s.id}` } };
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    } catch (e) { console.warn('Notificare', e); }
  }
  for (const [k, t] of Object.entries(S.cfg.notified)) if (now - t > 2 * 86400000) { delete S.cfg.notified[k]; changed = true; }
  if (changed) store.saveCfg();
}

// ====================================================================
// Comenzi vocale
// ====================================================================

function say(text) {
  if (settings().speak) voice.speak(text);
}

function voiceCtx() {
  return {
    now: new Date(),
    clients: clientsList(S.db).map(({ id, name }) => ({ id, name })),
    procedures: settings().procedures,
    sessions: sessionsList(S.db).map(({ id, clientId, start, status }) => ({ id, clientId, start, status })),
  };
}

function startVoice() {
  flushEdits();
  timer.unlockAudio();
  let rec = null;
  let listening = false;
  const m = modal(`
    <div class="voice">
      <button class="mic-big" data-act="v-listen" aria-label="Microfon">${icon('mic')}</button>
      <p class="v-status" aria-live="polite"></p>
      <p class="v-text"></p>
      <div class="v-body"></div>
      <form class="v-type">
        <input placeholder="sau scrie comanda aici" autocomplete="off" enterkeyhint="send">
        <button class="btn primary big" type="submit">${icon('check')} Trimite</button>
      </form>
      <button class="btn ghost" data-act="v-close">Închide</button>
    </div>`, {
    cls: 'sheet',
    onClose: () => { if (rec) rec.ignored = true; rec?.stop(); voice.stopSpeaking(); },
    actions: {
      // cât timp ascultă, microfonul înseamnă „am terminat de vorbit”
      'v-listen': () => (listening ? finishListening() : listenNow()),
      'v-close': () => m.close(),
      'v-help': async () => { await m.close(); go('#/ajutor'); },
    },
  });
  const status = t => { m.$('.v-status').textContent = t; };
  const body = h => { m.$('.v-body').innerHTML = h; };

  function setListening(on) {
    listening = on;
    m.$('.mic-big').classList.toggle('listening', on);
    m.$('.mic-big').setAttribute('aria-label', on ? 'Am terminat de vorbit' : 'Ascultă din nou');
  }

  function finishListening() {
    status('Mă gândesc…');
    rec?.stop();
  }

  m.$('.v-type').onsubmit = e => {
    e.preventDefault();
    const inp = m.$('.v-type input');
    const t = inp.value.trim();
    if (!t) {
      // „Trimite” fără text: trimite ce ai spus până acum
      if (listening) finishListening();
      else status('Apasă pe microfon și vorbește, sau scrie comanda în căsuță.');
      return;
    }
    if (rec) { rec.ignored = true; rec.stop(); }
    setListening(false);
    inp.value = '';
    inp.blur();
    m.$('.v-text').textContent = `„${t}”`;
    handle([t]);
  };

  function listenNow() {
    voice.stopSpeaking();
    body('');
    m.$('.v-text').textContent = '';
    if (!voice.canListen) {
      status('Recunoașterea vocii nu este disponibilă în acest browser. Scrie comanda mai jos.');
      m.$('.mic-big').disabled = true;
      return;
    }
    setListening(true);
    status('Te ascult… Când termini, apasă Trimite.');
    const my = rec = voice.listen({ onPartial: t => { if (!my.ignored) m.$('.v-text').textContent = t; } });
    my.result.then(alts => {
      if (m.closed || my.ignored) return;
      setListening(false);
      if (!alts.length) { status('Nu am auzit nimic. Apasă pe microfon și vorbește.'); return; }
      m.$('.v-text').textContent = `„${alts[0]}”`;
      handle(alts);
    }).catch(e => {
      if (m.closed || my.ignored) return;
      setListening(false);
      status(e.message);
    });
  }

  async function handle(alts) {
    status('');
    const ctx = voiceCtx();
    let r = null;
    for (const a of alts) {
      r = parseCommand(a, ctx);
      if (r.type !== 'unknown') break;
    }
    try {
      await (INTENTS[r.type] || INTENTS.unknown)(r, { m, status, body, say });
    } catch (e) {
      console.error(e);
      status(e.message);
    }
  }

  listenNow();
}

// Așteaptă o alegere în fereastra comenzii vocale
function pickIn(v, title, options) {
  return new Promise(resolve => {
    v.body(`<h3>${esc(title)}</h3><div class="pick">${options.map((o, i) =>
      `<button class="pick-row ${o.cls || ''}" data-pick="${i}"><span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`);
    v.m.$('.v-body').onclick = e => {
      const b = e.target.closest('[data-pick]');
      if (b) { v.m.$('.v-body').onclick = null; resolve(options[Number(b.dataset.pick)].value); }
    };
  });
}

function sessionLabel(s) {
  const st = fromLocal(s.start);
  return `${capFirst(fmtRelDay(st))}, ${fmtTime(st)}`;
}

async function resolveClient(r, v, { allowNew }) {
  if (r.exact.length === 1) return { id: r.exact[0] };
  const ids = [...r.exact, ...r.partial.filter(id => !r.exact.includes(id))].slice(0, 6);
  const opts = ids.map(id => {
    const nx = nextSessionOf(S.db, id);
    return { label: client(id).name, sub: nx ? `Următoarea: ${sessionLabel(nx)}` : client(id).phone, value: { id } };
  });
  if (allowNew && r.clientQuery && !ids.some(id => norm(client(id).name) === norm(r.clientQuery))) {
    opts.push({ label: `Client nou: ${r.clientQuery}`, value: { newName: r.clientQuery }, cls: 'new' });
  }
  if (!opts.length) {
    v.status(r.clientQuery ? `Nu am găsit clientul „${r.clientQuery}”.` : 'Nu am înțeles numele clientului.');
    v.say(r.clientQuery ? `Nu am găsit clientul ${r.clientQuery}.` : 'Nu am înțeles numele clientului.');
    return null;
  }
  if (opts.length === 1 && opts[0].value.newName) return opts[0].value;
  v.say('Despre cine e vorba?');
  return pickIn(v, 'Despre cine e vorba?', opts);
}

function confirmIn(v, html, { ok = 'Confirmă', onOk, onInput }) {
  v.body(`<div class="confirm">${html}
    <div class="btns"><button class="btn primary" data-c="ok">${icon('check')} ${esc(ok)}</button>
    <button class="btn" data-c="again">Altă comandă</button></div></div>`);
  const el = v.m.$('.v-body');
  el.oninput = onInput || null;
  el.onclick = async e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    if (b.dataset.c === 'again') { v.m.$('[data-act=v-listen]').click(); return; }
    b.disabled = true;
    const done = await onOk(el);
    if (done === false) { b.disabled = false; return; }
    el.onclick = null;
  };
}

// Aplică o modificare și oferă „Anulează”
function withUndo(msg, records, fn) {
  const before = records.map(([kind, id]) => [kind, id, S.db[kind][id] && live(S.db[kind][id]) ? structuredClone(S.db[kind][id]) : null]);
  const created = fn() || [];
  toast(msg, {
    action: 'Anulează', ms: 8000,
    onAction: () => {
      before.forEach(([kind, id, rec]) => rec ? store.put(kind, rec) : store.remove(kind, id));
      created.forEach(([kind, id]) => store.remove(kind, id));
      rerender();
      toast('Am anulat modificarea.');
    },
  });
}

const FIELD_LABEL = { reactions: 'Reacții în timpul ședinței', after: 'Starea după ședință', notes: 'Alte notițe', procedures: 'Proceduri efectuate' };

const INTENTS = {
  async timer(r, v) {
    const st = settings();
    if (r.action === 'stop') {
      if (timer.T.active) { timer.stop(); v.say('Am oprit cronometrul.'); } else v.say('Nu merge niciun cronometru.');
      await v.m.close();
      return;
    }
    let procs = r.allProcs ? [...st.procedures] : [...r.procs];
    if (!procs.length && r.procChoices.length) {
      v.say('Care procedură?');
      const p = await pickIn(v, 'Care procedură?', r.procChoices.map(n => ({ label: n, value: n })));
      if (!p) return;
      procs = [p];
    }
    const here = contextClient();
    let clientId = null;
    if (r.exact.length || r.partial.length || r.clientQuery) {
      const who = await resolveClient(r, v, { allowNew: false });
      if (!who) return;
      clientId = who.id;
    } else if (!r.general) clientId = here.clientId;
    const c = clientId ? client(clientId) : null;

    if (r.action === 'start') {
      if (!procs.length) {
        v.say('Pentru ce procedură?');
        const p = await pickIn(v, 'Pentru ce procedură?', st.procedures.map(n => ({ label: n, sub: fmtDur(procTime(st, c, n).seconds), value: n })));
        if (!p) return;
        procs = [p];
      }
      const sessionId = clientId === here.clientId ? here.sessionId : currentSessionOf(clientId)?.id || null;
      const secs = r.seconds || procTime(st, c, procs[0]).seconds;
      v.say(`Pornesc ${sayDur(secs)} pentru ${spokenProc(procs[0])}.`);
      startStep(procs[0], { clientId, sessionId, seconds: r.seconds });
      await v.m.close();
      return;
    }

    if (!procs.length) {
      v.status('Nu am înțeles pentru ce procedură. Spune, de exemplu: „la Maria pentru gât 3 minute”.');
      v.say('Nu am înțeles pentru ce procedură.');
      return;
    }

    if (r.action === 'query') {
      const lines = procs.map(p => {
        const pt = procTime(st, c, p);
        return `${spokenProc(p)}: ${sayDur(pt.seconds)}${pt.source === 'client' ? ' (personalizat)' : ''}`;
      });
      const text = `${c ? c.name : 'În general'}: ${lines.join(', ')}.`;
      v.say(text);
      v.body(`<p class="answer">${esc(text)}</p>`);
      return;
    }

    if (r.action === 'reset') {
      if (!c) { v.status('Spune pentru ce client, de exemplu: „la Ion pentru coccis timpul obișnuit”.'); return; }
      const list = procs.filter(p => c.timers?.[p]);
      if (!list.length) { const t = `${c.name} folosește deja timpii generali pentru ${procs.map(spokenProc).join(', ')}.`; v.say(t); v.body(`<p class="answer">${esc(t)}</p>`); return; }
      v.say(`${c.name} revine la timpul general pentru ${list.map(spokenProc).join(', ')}. Confirmi?`);
      confirmIn(v, `<h3>Revin la timpul general</h3><p><b>${esc(c.name)}</b></p>
        <ul class="examples">${list.map(p => `<li>${esc(p)}: ${fmtDur(c.timers[p])} → ${fmtDur(generalTime(st, p))}</li>`).join('')}</ul>`, {
        onOk: async () => {
          withUndo('Am revenit la timpii generali.', [['clients', c.id]], () => { list.forEach(p => setClientTime(c.id, p, null)); });
          v.say('Gata.');
          await v.m.close();
          if (ui.route?.name === 'sedinta' || ui.route?.name === 'client') rerender();
        },
      });
      return;
    }

    // setare: pentru un client sau pentru toți
    const secs = r.seconds || procTime(st, c, procs[0]).seconds;
    const scopeOpts = [
      ...(c ? [`<option value="client" ${r.general ? '' : 'selected'}>doar pentru ${esc(c.name)}</option>`] : []),
      `<option value="general" ${r.general || !c ? 'selected' : ''}>pentru toți clienții (timpul general)</option>`,
    ].join('');
    const who = c && !r.general ? `la ${c.name}` : 'pentru toți';
    v.say(`Pun ${sayDur(secs)} ${who}, pentru ${procs.length > 3 ? 'toate procedurile' : procs.map(spokenProc).join(', ')}. Confirmi?`);
    confirmIn(v, `
      <h3>Pauza după pas</h3>
      <p class="small">${procs.length > 3 ? `Toate procedurile (${procs.length})` : procs.map(p => {
        const pt = procTime(st, c, p);
        return `<b>${esc(p)}</b> <span class="muted">acum ${fmtDur(pt.seconds)}${pt.source === 'client' ? ', personalizat' : ''}</span>`;
      }).join('<br>')}</p>
      <label>Pentru cine<select id="vt-scope">${scopeOpts}</select></label>
      <div class="row2">
        <label>Minute<input id="vt-m" type="number" inputmode="numeric" min="0" max="60" value="${Math.floor(secs / 60)}"></label>
        <label>Secunde<input id="vt-s" type="number" inputmode="numeric" min="0" max="59" step="5" value="${secs % 60}"></label>
      </div>`, {
      ok: 'Salvează',
      onOk: async el => {
        const sec = (Number(el.querySelector('#vt-m').value) || 0) * 60 + (Number(el.querySelector('#vt-s').value) || 0);
        if (sec < 5 || sec > 3600) { v.status('Alege o durată între 5 secunde și 60 de minute.'); return false; }
        const scope = el.querySelector('#vt-scope').value;
        if (scope === 'client') {
          withUndo(`${c.name}: pauza este ${sayDur(sec)}.`, [['clients', c.id]], () => { procs.forEach(p => setClientTime(c.id, p, sec)); });
        } else {
          const before = structuredClone(settings().timers || {});
          procs.forEach(p => setGeneralTime(p, sec));
          toast(`Timpul general este ${sayDur(sec)}.`, { action: 'Anulează', ms: 8000, onAction: () => { store.setSettings({ timers: before }); rerender(); } });
        }
        v.say('Am salvat.');
        await v.m.close();
        rerender();
      },
    });
  },

  unknown(r, v) {
    v.status('Nu am înțeles comanda.');
    v.say('Nu am înțeles. Încearcă din nou.');
    v.body(`<p class="small">Poți spune, de exemplu:</p>
      <ul class="examples">${EXAMPLES.slice(0, 4).map(e => `<li>„${esc(e)}”</li>`).join('')}</ul>
      <button class="btn small" data-act="v-help">Vezi toate comenzile</button>`);
  },

  async help(r, v) {
    await v.m.close();
    go('#/ajutor');
  },

  async query(r, v) {
    const list = sessionsInRange(S.db, r.from, r.to).filter(s => s.status !== 'anulata');
    let text;
    if (r.single) {
      const day = parseKey(r.from);
      const rel = fmtRelDay(day);
      const when = rel;
      const past = startOfDay(day) < startOfDay(new Date());
      text = list.length
        ? `${capFirst(when)} ${past ? 'ai avut' : 'ai'} ${plural(list.length, 'ședință', 'ședințe')}: ${list.map(s => `la ${fmtTime(fromLocal(s.start))} ${client(s.clientId).name}`).join(', ')}.`
        : `${capFirst(when)} nu ${past ? 'ai avut' : 'ai'} nicio ședință.`;
    } else {
      text = list.length ? `${capFirst(r.label)} ai ${plural(list.length, 'ședință', 'ședințe')}.` : `${capFirst(r.label)} nu ai nicio ședință.`;
    }
    v.say(text);
    v.body(`<p class="answer">${esc(text)}</p>
      ${list.length ? `<div class="list">${list.slice(0, 12).map(s => `<a class="wrow" href="#/sedinta/${s.id}" data-nav><b>${r.single ? fmtTime(fromLocal(s.start)) : fmtDateShort(fromLocal(s.start)) + ' ' + fmtTime(fromLocal(s.start))}</b><span>${esc(client(s.clientId).name)}</span></a>`).join('')}</div>` : ''}
      <button class="btn" data-go="#/agenda?d=${r.from}&m=${r.single ? 'zi' : 'sapt'}">${icon('calendar')} Deschide agenda</button>`);
    bindNav(v);
  },

  async when(r, v) {
    const who = await resolveClient(r, v, { allowNew: false });
    if (!who) return;
    const c = client(who.id);
    const nx = nextSessionOf(S.db, c.id);
    const done = clientSessions(S.db, c.id).filter(s => s.status === 'efectuata');
    const last = done[done.length - 1];
    let text = nx ? `${c.name} are următoarea ședință ${fmtRelDay(fromLocal(nx.start))}, la ${fmtTime(fromLocal(nx.start))}.` : `${c.name} nu are nicio ședință programată.`;
    if (last) text += ` Ultima ședință a fost ${fmtRelDay(fromLocal(last.start))}.`;
    v.say(text);
    v.body(`<p class="answer">${esc(text)}</p>
      <div class="btns">
        <button class="btn" data-go="#/client/${c.id}">Deschide fișa</button>
        <button class="btn primary" data-go="#/nou?c=${c.id}">${icon('plus')} Programează</button>
      </div>`);
    bindNav(v);
  },

  async open(r, v) {
    const who = await resolveClient(r, v, { allowNew: false });
    if (!who) return;
    await v.m.close();
    go(`#/client/${who.id}`);
  },

  async schedule(r, v) {
    const who = await resolveClient(r, v, { allowNew: true });
    if (!who) return;
    let { date, time } = r;
    let note = '';
    if (!date && who.id) {
      const last = lastSessionBefore(who.id, '9999');
      if (last) {
        const p = proposeNext(last, settings());
        date = p.slice(0, 10);
        time = time || p.slice(11);
        note = `Propus la ${settings().interval} zile după ultima ședință (${fmtDateShort(fromLocal(last.start))}).`;
      }
    }
    const name = who.id ? client(who.id).name : who.newName;
    const warn = () => {
      const d = v.m.$('#vc-date')?.value, t = v.m.$('#vc-time')?.value;
      if (v.m.$('#vc-when')) v.m.$('#vc-when').textContent = d ? capFirst(fmtDateLong(parseKey(d))) : 'Alege data';
      if (v.m.$('#vc-warn')) v.m.$('#vc-warn').innerHTML = d && t ? overlapWarn(`${d}T${t}`, settings().duration) : '';
    };
    v.say(`Programez pe ${name}${date ? ' ' + fmtRelDay(parseKey(date)) : ''}${time ? ' la ora ' + time : ''}. ${date && time ? 'Confirmi?' : 'Alege data și ora.'}`);
    confirmIn(v, `
      <h3>Programare nouă</h3>
      <p><b>${esc(name)}</b>${who.newName ? ' <span class="pill">client nou</span>' : ''}</p>
      <div class="row2">
        <label>Data<input type="date" id="vc-date" value="${date || ''}"></label>
        <label>Ora<input type="time" id="vc-time" value="${time || ''}" step="300"></label>
      </div>
      <p class="small muted" id="vc-when"></p>
      ${note ? `<p class="small muted">${esc(note)}</p>` : ''}
      <div id="vc-warn"></div>`, {
      onInput: warn,
      onOk: async el => {
        const d = el.querySelector('#vc-date').value, t = el.querySelector('#vc-time').value;
        if (!d || !t) { v.status('Alege data și ora.'); return false; }
        const start = `${d}T${t}`;
        let s;
        const created = [];
        const clientId = who.id || (() => { const c = createClient({ name: who.newName }); created.push(['clients', c.id]); return c.id; })();
        const prev = lastSessionBefore(clientId, start);
        withUndo(`Programare: ${client(clientId).name}, ${fmtRelDay(fromLocal(start))} la ${t}.`, prev ? [['sessions', prev.id]] : [], () => {
          s = newSession(clientId, start);
          if (prev && !prev.nextId) store.put('sessions', { ...prev, nextId: s.id });
          return [...created, ['sessions', s.id]];
        });
        v.say('Gata, am programat.');
        await v.m.close();
        go(`#/agenda?d=${d}&m=zi`);
      },
    });
    warn();
  },

  async note(r, v) {
    const who = await resolveClient(r, v, { allowNew: false });
    if (!who) return;
    const c = client(who.id);
    const today = dateKey(new Date());
    const list = clientSessions(S.db, c.id).filter(s => s.status !== 'anulata');
    const target = list.find(s => s.start.startsWith(today)) || list.filter(s => s.start <= toLocal(new Date())).pop() || null;
    let field = target ? r.field : 'clientNotes';
    const where = target ? `Ședința din ${sessionLabel(target).toLowerCase()}` : 'Fișa clientului (notițe generale)';
    v.say(r.note ? `Adaug nota la ${c.name}. Confirmi?` : `Ce notez la ${c.name}?`);
    confirmIn(v, `
      <h3>Notă pentru ${esc(c.name)}</h3>
      <p class="small muted">${esc(where)}</p>
      ${target ? `<label>Câmpul<select id="vn-field">${Object.entries(FIELD_LABEL).map(([k, l]) => `<option value="${k}" ${k === field ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <label>Textul<textarea id="vn-text" rows="3" placeholder="Scrie nota">${esc(r.note)}</textarea></label>`, {
      ok: 'Salvează nota',
      onOk: async el => {
        const text = el.querySelector('#vn-text').value.trim();
        if (!text) { v.status('Scrie textul notei.'); return false; }
        if (target) field = el.querySelector('#vn-field').value;
        const append = (old, t) => old ? `${old.replace(/\s+$/, '')}\n${t}` : t;
        if (!target) {
          withUndo('Nota a fost adăugată în fișa clientului.', [['clients', c.id]], () => { store.put('clients', { ...c, notes: append(c.notes, text) }); });
        } else {
          const s = S.db.sessions[target.id];
          const patch = field === 'procedures'
            ? { procedures: [...new Set([...(s.procedures || []), ...text.split(/\s*[,;]\s*/).filter(Boolean)])] }
            : { [field]: append(s[field], text) };
          withUndo('Nota a fost salvată.', [['sessions', s.id]], () => { store.put('sessions', { ...s, ...patch }); });
        }
        v.say('Am salvat nota.');
        await v.m.close();
        go(target ? `#/sedinta/${target.id}` : `#/client/${c.id}`);
      },
    });
  },

  async move(r, v) {
    const s = await pickSession(r, v, 'Ce ședință muți?');
    if (!s) return;
    const st = fromLocal(s.start);
    let nd;
    if (r.dest.shiftDays || r.dest.shiftMin) nd = new Date(addDays(st, r.dest.shiftDays).getTime() + r.dest.shiftMin * 60000);
    else {
      nd = new Date(st);
      if (r.dest.date) { const d = parseKey(r.dest.date); nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); }
      if (r.dest.time) { const [h, mi] = r.dest.time.split(':').map(Number); nd.setHours(h, mi); }
    }
    const name = client(s.clientId).name;
    const changed = toLocal(nd) !== s.start;
    const warn = () => {
      const d = v.m.$('#vm-date')?.value, t = v.m.$('#vm-time')?.value;
      if (v.m.$('#vm-when')) v.m.$('#vm-when').textContent = d ? capFirst(fmtDateLong(parseKey(d))) : '';
      if (v.m.$('#vm-warn')) v.m.$('#vm-warn').innerHTML = d && t ? overlapWarn(`${d}T${t}`, s.duration, s.id) : '';
    };
    v.say(changed ? `Mut ședința lui ${name} ${fmtRelDay(nd)} la ${fmtTime(nd)}. Confirmi?` : `Unde muți ședința lui ${name}?`);
    confirmIn(v, `
      <h3>Mut ședința</h3>
      <p><b>${esc(name)}</b><br><span class="small muted">acum: ${esc(sessionLabel(s))}</span></p>
      <div class="row2">
        <label>Data nouă<input type="date" id="vm-date" value="${dateKey(nd)}"></label>
        <label>Ora nouă<input type="time" id="vm-time" value="${fmtTime(nd)}" step="300"></label>
      </div>
      <p class="small muted" id="vm-when"></p>
      <div id="vm-warn"></div>`, {
      ok: 'Mută',
      onInput: warn,
      onOk: async el => {
        const d = el.querySelector('#vm-date').value, t = el.querySelector('#vm-time').value;
        if (!d || !t) return false;
        withUndo(`Ședința lui ${name} a fost mutată: ${fmtRelDay(parseKey(d))} la ${t}.`, [['sessions', s.id]], () => {
          store.put('sessions', { ...S.db.sessions[s.id], start: `${d}T${t}` });
        });
        v.say('Am mutat ședința.');
        await v.m.close();
        go(`#/agenda?d=${d}&m=zi`);
      },
    });
    warn();
  },

  async cancel(r, v) {
    const s = await pickSession(r, v, 'Ce ședință anulezi?');
    if (!s) return;
    const name = client(s.clientId).name;
    v.say(`Anulez ședința lui ${name}, ${fmtRelDay(fromLocal(s.start))} la ${fmtTime(fromLocal(s.start))}. Confirmi?`);
    confirmIn(v, `
      <h3>Anulez ședința</h3>
      <p><b>${esc(name)}</b><br>${esc(sessionLabel(s))}</p>
      <p class="small muted">Ședința rămâne în istoric, marcată „Anulată”.</p>`, {
      ok: 'Anulează ședința',
      onOk: async () => {
        withUndo(`Ședința lui ${name} a fost anulată.`, [['sessions', s.id]], () => {
          store.put('sessions', { ...S.db.sessions[s.id], status: 'anulata' });
        });
        v.say('Am anulat ședința.');
        await v.m.close();
        go(`#/agenda?d=${s.start.slice(0, 10)}&m=zi`);
      },
    });
  },
};

async function pickSession(r, v, title) {
  const list = r.candidates.map(id => S.db.sessions[id]).filter(live);
  if (!list.length) {
    const msg = r.clientQuery && !r.clientIds.length
      ? `Nu am găsit clientul „${r.clientQuery}”.`
      : 'Nu am găsit nicio ședință programată care să se potrivească.';
    v.status(msg);
    v.say(msg);
    return null;
  }
  if (list.length === 1) return list[0];
  v.say(title);
  return pickIn(v, title, list.map(s => ({ label: `${client(s.clientId).name}`, sub: sessionLabel(s), value: s })));
}

function bindNav(v) {
  v.m.$('.v-body').onclick = async e => {
    const a = e.target.closest('[data-go],[data-nav]');
    if (!a) return;
    e.preventDefault();
    const h = a.dataset.go || a.getAttribute('href');
    await v.m.close();
    go(h);
  };
}

boot();
