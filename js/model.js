// Structura datelor și operațiile pe ele (fără interfață, fără stocare).
//
// db = {
//   v: 1,
//   clients:  { [id]: { id, name, phone, email, birth, reason, notes, timers?, createdAt, updatedAt, deleted? } },
//             timers = { [procedură]: secunde } – timpi de pauză doar pentru acest client
//   sessions: { [id]: { id, clientId, start: 'YYYY-MM-DDTHH:MM', duration, status,
//                        procedures: [], reactions, after, notes, nextId, updatedAt, deleted? } },
//   settings: { ..., updatedAt }
// }
// Ștergerile păstrează o „piatră funerară” { id, deleted: true, updatedAt } ca să se
// propage corect între telefon și copia de siguranță.

import { addDays, fromLocal, toLocal, dateKey, norm } from './util.js';

export const STATUS = {
  programata: 'Programată',
  efectuata: 'Efectuată',
  anulata: 'Anulată',
};

export const DEFAULT_PROCEDURES = [
  'Relaxare de bază – spate jos (BRM1)',
  'Relaxare de bază – spate sus (BRM2)',
  'Gât (BRM3)',
  'Coccis',
  'Pelvis',
  'Sacrum',
  'Rinichi',
  'Respirator',
  'Umăr',
  'Cot',
  'Încheietura mâinii',
  'Șold',
  'Genunchi',
  'Gleznă',
  'Ischiogambieri',
  'ATM (maxilar)',
];

export function defaultSettings() {
  return {
    interval: 7,            // zile până la ședința următoare
    duration: 45,           // minute
    workDays: [1, 2, 3, 4, 5, 6], // 0 = duminică
    reminderMin: 30,
    notify: false,
    calTitle: 'full',       // 'full' | 'initials'
    speak: true,
    autoLockMin: 15,
    procedures: [...DEFAULT_PROCEDURES],
    timerDefault: 120,      // secunde de pauză după un pas, dacă procedura nu are timp propriu
    timers: {},             // { [procedură]: secunde } – timpii generali pe procedură
    alarmSound: 'bol',      // 'bol' | 'clopotel'
    alarmVolume: 40,        // 0–100
    alarmVibrate: true,
    updatedAt: 0,
  };
}

export function emptyDB() {
  return { v: 1, clients: {}, sessions: {}, settings: defaultSettings() };
}

// Completează câmpurile lipsă (de exemplu după o actualizare a aplicației)
export function normalizeDB(db) {
  const out = { v: 1, clients: { ...(db?.clients || {}) }, sessions: { ...(db?.sessions || {}) } };
  out.settings = { ...defaultSettings(), ...(db?.settings || {}) };
  return out;
}

export const live = r => r && !r.deleted;

export function clientsList(db) {
  return Object.values(db.clients).filter(live)
    .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
}

export function sessionsList(db) {
  return Object.values(db.sessions).filter(s => live(s) && live(db.clients[s.clientId]))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function sessionsOnDay(db, key) {
  return sessionsList(db).filter(s => s.start.startsWith(key));
}

// [fromKey, toKey) – chei 'YYYY-MM-DD'
export function sessionsInRange(db, fromKey, toKey) {
  return sessionsList(db).filter(s => s.start >= fromKey && s.start < toKey);
}

export function clientSessions(db, clientId) {
  return sessionsList(db).filter(s => s.clientId === clientId);
}

// Al câtelea e ședința pentru client (ședințele anulate nu se numără)
export function sessionNumber(db, s) {
  if (s.status === 'anulata') return null;
  return clientSessions(db, s.clientId)
    .filter(x => x.status !== 'anulata' && (x.start < s.start || (x.start === s.start && x.id <= s.id)))
    .length;
}

export function nextSessionOf(db, clientId, now = new Date()) {
  const n = toLocal(now);
  return clientSessions(db, clientId).find(s => s.status === 'programata' && s.start >= n) || null;
}

export function lastDoneOf(db, clientId) {
  const done = clientSessions(db, clientId).filter(s => s.status === 'efectuata');
  return done[done.length - 1] || null;
}

export function endOf(s) {
  return new Date(fromLocal(s.start).getTime() + (s.duration || 45) * 60000);
}

// Ședințe programate care se suprapun cu intervalul dat
export function overlaps(db, start, duration, excludeId) {
  const a0 = fromLocal(start).getTime();
  const a1 = a0 + duration * 60000;
  return sessionsList(db).filter(s => {
    if (s.id === excludeId || s.status === 'anulata') return false;
    const b0 = fromLocal(s.start).getTime();
    const b1 = b0 + (s.duration || 45) * 60000;
    return a0 < b1 && b0 < a1;
  });
}

// Data propusă pentru ședința următoare: după `interval` zile, la aceeași oră,
// mutată pe prima zi de lucru.
export function proposeNext(session, settings) {
  const days = settings.workDays?.length ? settings.workDays : [0, 1, 2, 3, 4, 5, 6];
  let d = addDays(fromLocal(session.start), settings.interval || 7);
  for (let i = 0; i < 7 && !days.includes(d.getDay()); i++) d = addDays(d, 1);
  return toLocal(d);
}

export function findClientsByName(db, name) {
  const n = norm(name);
  return clientsList(db).filter(c => norm(c.name) === n);
}

// Îmbină două versiuni ale bazei de date: pentru fiecare înregistrare câștigă
// cea modificată mai recent.
export function mergeDB(a, b) {
  a = normalizeDB(a);
  b = normalizeDB(b);
  const out = { v: 1, clients: {}, sessions: {} };
  for (const kind of ['clients', 'sessions']) {
    const ids = new Set([...Object.keys(a[kind]), ...Object.keys(b[kind])]);
    for (const id of ids) {
      const x = a[kind][id], y = b[kind][id];
      out[kind][id] = !y ? x : !x ? y : ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x);
    }
  }
  out.settings = (b.settings.updatedAt || 0) > (a.settings.updatedAt || 0) ? b.settings : a.settings;
  return out;
}

// Rezumat folosit pentru a vedea dacă două versiuni diferă
export function fingerprint(db) {
  const parts = [];
  for (const kind of ['clients', 'sessions']) {
    for (const id of Object.keys(db[kind]).sort()) parts.push(`${kind}:${id}:${db[kind][id].updatedAt || 0}`);
  }
  parts.push(`settings:${db.settings?.updatedAt || 0}`);
  return parts.join('|');
}

export function todayKey(now = new Date()) {
  return dateKey(now);
}

// Cât durează pauza după o procedură, pentru un client (sau în general dacă client lipsește).
// source: 'client' (timp personalizat), 'general' (timpul procedurii) sau 'default' (timpul general)
export function procTime(settings, client, proc) {
  const c = client?.timers?.[proc];
  if (c > 0) return { seconds: c, source: 'client' };
  const g = settings.timers?.[proc];
  if (g > 0) return { seconds: g, source: 'general' };
  return { seconds: settings.timerDefault || 120, source: 'default' };
}

export function generalTime(settings, proc) {
  return procTime(settings, null, proc).seconds;
}
