// Interpretarea comenzilor vocale în limba română.
//
// parseCommand(text, ctx) întoarce un obiect care descrie ce s-a cerut, fără să
// modifice nimic. Aplicația îi arată utilizatorului ce a înțeles și cere confirmare.
// ctx = { now: Date, clients: [{ id, name }], sessions: [{ id, clientId, start, status }] }

import { norm, dateKey, parseKey, addDays, startOfDay, startOfWeek, pad, levenshtein, capName } from './util.js';

const WEEKDAYS = {
  luni: 1, lunea: 1, marti: 2, martea: 2, miercuri: 3, miercurea: 3, joi: 4, joia: 4,
  vineri: 5, vinerea: 5, sambata: 6, duminica: 0,
};
const MONTHS = {
  ianuarie: 0, ian: 0, februarie: 1, feb: 1, martie: 2, aprilie: 3, apr: 3, mai: 4, iunie: 5, iun: 5,
  iulie: 6, iul: 6, august: 7, aug: 7, septembrie: 8, sept: 8, sep: 8, octombrie: 9, oct: 9,
  noiembrie: 10, nov: 10, decembrie: 11, dec: 11,
};
const UNITS = { unu: 1, una: 1, intai: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9 };
const TEENS = {
  zece: 10, unsprezece: 11, unspe: 11, doisprezece: 12, douasprezece: 12, doispe: 12, treisprezece: 13, treispe: 13,
  paisprezece: 14, paispe: 14, cincisprezece: 15, cincispe: 15, saisprezece: 16, saispe: 16,
  saptesprezece: 17, saptispe: 17, saptespe: 17, optsprezece: 18, optspe: 18, nouasprezece: 19, nouaspe: 19,
};
const TENS = { douazeci: 20, treizeci: 30, patruzeci: 40, cincizeci: 50 };
// „nouă” și „două” sunt și adjective („programare nouă”); le citim ca cifre doar în context
const AMBIGUOUS_NUM = new Set(['noua', 'doua', 'una']);
const NUM_CONTEXT = new Set(['la', 'ora', 'orele', 'pe', 'si', 'de', 'peste', 'fara', 'cu', 'in']);

const FILLER = new Set([
  'o', 'l', 'pe', 'lui', 'cu', 'pentru', 'pt', 'sedinta', 'sedinte', 'sedintei', 'sedintele', 'programare',
  'programarea', 'programari', 'programarile', 'noua', 'nou', 'un', 'una', 'client', 'clientul', 'clienta',
  'clientei', 'clientului', 'doamna', 'doamnei', 'domnul', 'domnului', 'dna', 'dl', 'd', 'si', 'a', 'al', 'ale',
  'la', 'de', 'te', 'rog', 'va', 'imi', 'mi', 'ora', 'urmatoarea', 'urmatoare', 'viitoare', 'alta', 'inca',
  'mai', 'sa', 'ma', 'fisa', 'fisei', 'in', 'din', 'vreau', 'as', 'dori', 'poti', 'puteti', 'ok', 'bine',
  'te', 'rog', 'acum', 'te rog', 'ii', 'ei', 'lor', 'are', 'e', 'este', 'vine', 'am', 'cand', 'ce',
  'mea', 'meu', 'deschide', 'arata', 'cauta', 'despre', 'ca', 'ul', 'le', 'li',
]);

// Verbele care dau tipul comenzii (primul găsit în frază câștigă)
const VERB = {
  muta: 'move', mutati: 'move', mut: 'move', mutam: 'move', amana: 'move', amanati: 'move', amanam: 'move',
  reprogrameaza: 'move', reprogramez: 'move', reprogramati: 'move', schimba: 'move',
  anuleaza: 'cancel', anulez: 'cancel', anulati: 'cancel', anulam: 'cancel', sterge: 'cancel', contramandeaza: 'cancel',
  programeaza: 'schedule', programez: 'schedule', programati: 'schedule', programam: 'schedule',
  programeazal: 'schedule', programeazao: 'schedule', programeaz: 'schedule', programare: 'schedule',
  noteaza: 'note', notez: 'note', notati: 'note', noteazai: 'note', scrie: 'note', nota: 'note', notita: 'note',
  deschide: 'open', fisa: 'open', cauta: 'open',
  cand: 'when',
  ce: 'query', cine: 'query', cate: 'query', care: 'query', agenda: 'query', programul: 'query',
  ajutor: 'help', help: 'help',
  adauga: 'add', fa: 'add', pune: 'add', fac: 'add', vreau: 'add', arata: 'show',
};

// ---------- împărțirea în cuvinte ----------

function tokenize(text) {
  const prepped = String(text).replace(/(\d{1,2})[:.](\d{2})\b/g, '$1h$2');
  const orig = prepped.split(/\s+/).filter(Boolean);
  const toks = [];
  orig.forEach((w, o) => norm(w).split(' ').filter(Boolean).forEach(t => toks.push({ t, o })));
  return { orig, toks: numberize(toks) };
}

function wordNum(t) {
  if (/^\d+$/.test(t)) return Number(t);
  return UNITS[t] ?? TEENS[t] ?? TENS[t];
}

function numberize(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const { t, o } = toks[i];
    let n = wordNum(t);
    if (n != null && AMBIGUOUS_NUM.has(t)) {
      const prev = toks[i - 1]?.t, next = toks[i + 1]?.t;
      if (!NUM_CONTEXT.has(prev) && !(next in MONTHS) && next !== 'si' && next !== 'fara' && !UNIT_MIN.has(next) && !UNIT_SEC.has(next)) n = undefined;
    }
    if (n != null && TENS[t] && toks[i + 1]?.t === 'si' && UNITS[toks[i + 2]?.t]) {
      n += UNITS[toks[i + 2].t];
      i += 2;
    }
    out.push(n != null ? { t: String(n), o, n } : { t, o });
  }
  return out;
}

// ---------- date și ore ----------

function nextWeekday(now, wd, nextWeek, todayOk) {
  const today = startOfDay(now);
  if (nextWeek) return addDays(addDays(startOfWeek(today), 7), (wd + 6) % 7);
  let diff = (wd - today.getDay() + 7) % 7;
  if (diff === 0 && !todayOk) diff = 7;
  return addDays(today, diff);
}

const DATE_PREPS = new Set(['pe', 'in', 'de', 'din', 'pentru', 'spre', 'pana']);
const NEXT_WORDS = new Set(['viitoare', 'viitor', 'urmatoare', 'urmator']);
const THIS_WORDS = new Set(['asta', 'aceasta', 'curenta', 'aceea']);

function countWord(tok) {
  if (!tok) return null;
  if (tok.n != null) return tok.n;
  if (tok.t === 'o' || tok.t === 'un') return 1;
  return null;
}

function matchDate(T, i, now, opts) {
  let j = i, prep = null;
  if (DATE_PREPS.has(T[j]?.t)) {
    prep = T[j].t;
    j++;
    if (prep === 'de' && T[j]?.t === 'pe') j++;
  }
  const w = T[j]?.t;
  const today = startOfDay(now);
  const res = (date, end, extra = {}) => ({ kind: 'date', prep, start: i, end, date: dateKey(date), ...extra });

  if (w === 'azi' || w === 'astazi') return res(today, j + 1);
  if (w === 'diseara') return res(today, j + 1, { mod: 'pm' });
  if (w === 'maine') return res(addDays(today, 1), j + 1);
  if (w === 'poimaine') return res(addDays(today, 2), j + 1);
  if (w === 'ieri') return res(addDays(today, -1), j + 1);
  if (w === 'alaltaieri') return res(addDays(today, -2), j + 1);

  if (w === 'peste') {
    const n = countWord(T[j + 1]);
    const unit = T[j + 2]?.t;
    if (n != null && unit) {
      if (unit === 'zi' || unit === 'zile') return res(addDays(today, n), j + 3);
      if (unit === 'saptamana' || unit === 'saptamani') return res(addDays(today, 7 * n), j + 3);
      if (unit === 'luna' || unit === 'luni') {
        const d = new Date(today);
        d.setMonth(d.getMonth() + n);
        return res(d, j + 3);
      }
    }
    return null;
  }

  if (w in WEEKDAYS) {
    let k = j + 1, nextWeek = false;
    if (NEXT_WORDS.has(T[k]?.t)) { nextWeek = true; k++; }
    else if (T[k]?.t === 'saptamana' && NEXT_WORDS.has(T[k + 1]?.t)) { nextWeek = true; k += 2; }
    else if (T[k]?.t === 'din' && T[k + 1]?.t === 'saptamana' && NEXT_WORDS.has(T[k + 2]?.t)) { nextWeek = true; k += 3; }
    return res(nextWeekday(now, WEEKDAYS[w], nextWeek, opts.todayOk), k);
  }

  const n = T[j]?.n;
  if (n != null && n >= 1 && n <= 31) {
    const mon = T[j + 1]?.t;
    if (mon in MONTHS) {
      let k = j + 2;
      let year = today.getFullYear();
      if (T[k]?.n >= 2000 && T[k]?.n < 2100) { year = T[k].n; k++; }
      let d = new Date(year, MONTHS[mon], n);
      if (k === j + 2 && d < today && !opts.pastOk) d = new Date(year + 1, MONTHS[mon], n);
      return res(d, k);
    }
    // „pe 5” – ziua din luna curentă (sau următoare)
    if ((prep === 'pe' || prep === 'de') && !['zile', 'zi', 'ore', 'ora', 'minute'].includes(T[j + 1]?.t)) {
      let d = new Date(today.getFullYear(), today.getMonth(), n);
      if (d < today && !opts.pastOk) d = new Date(today.getFullYear(), today.getMonth() + 1, n);
      return res(d, j + 1);
    }
  }
  return null;
}

const PAST_WORDS = new Set(['trecuta', 'trecut', 'anterioara', 'anterior', 'dinainte']);
const MONTH_FULL = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie',
  'octombrie', 'noiembrie', 'decembrie'];

// Perioade: „săptămâna asta / viitoare / trecută”, „luna asta / viitoare / trecută”, „în noiembrie”
function matchRange(T, i, now) {
  let j = i, prep = null;
  if (DATE_PREPS.has(T[j]?.t)) { prep = T[j].t; j++; }
  const w = T[j]?.t, nx = T[j + 1]?.t;
  const range = (from, to, label, end = j + 2) => ({ kind: 'range', prep, start: i, end, from: dateKey(from), to: dateKey(to), label });

  if (w === 'saptamana') {
    const mon = startOfWeek(now);
    if (THIS_WORDS.has(nx)) return range(mon, addDays(mon, 7), 'săptămâna aceasta');
    if (NEXT_WORDS.has(nx)) return range(addDays(mon, 7), addDays(mon, 14), 'săptămâna viitoare');
    if (PAST_WORDS.has(nx)) return range(addDays(mon, -7), mon, 'săptămâna trecută');
    return null;
  }

  if (w === 'luna') {
    const m = new Date(now.getFullYear(), now.getMonth(), 1);
    const shift = k => new Date(m.getFullYear(), m.getMonth() + k, 1);
    if (THIS_WORDS.has(nx)) return range(m, shift(1), 'luna aceasta');
    if (NEXT_WORDS.has(nx)) return range(shift(1), shift(2), 'luna viitoare');
    if (PAST_WORDS.has(nx)) return range(shift(-1), m, 'luna trecută');
    return null;
  }

  // numele lunii, fără o zi înainte („5 noiembrie” e o dată, nu o lună întreagă)
  const mi = MONTH_FULL.indexOf(w);
  if (mi >= 0 && T[i - 1]?.n == null && (w !== 'mai' || prep)) {
    let year = now.getFullYear();
    let end = j + 1;
    if (T[end]?.n >= 2000 && T[end]?.n < 2100) { year = T[end].n; end++; }
    // fără an: luna cea mai apropiată (cu 6 luni înapoi sau înainte)
    else if (mi - now.getMonth() > 6) year--;
    else if (now.getMonth() - mi > 5) year++;
    const y = year !== now.getFullYear() ? ` ${year}` : '';
    return range(new Date(year, mi, 1), new Date(year, mi + 1, 1), `în ${MONTH_FULL[mi]}${y}`, end);
  }
  return null;
}

function matchTime(T, i) {
  let j = i, prep = null;
  if (T[j]?.t === 'de' && T[j + 1]?.t === 'la') { prep = 'de'; j += 2; }
  else if (T[j]?.t === 'din' && (T[j + 1]?.t === 'ora' || T[j + 1]?.t === 'orele')) { prep = 'de'; j++; }
  else if (T[j]?.t === 'la' || T[j]?.t === 'pe' || T[j]?.t === 'spre' || T[j]?.t === 'pentru') {
    if (T[j].t !== 'la' && T[j + 1]?.t !== 'la' && T[j + 1]?.t !== 'ora' && T[j + 1]?.t !== 'orele') return null;
    prep = 'la'; j++;
    if (T[j]?.t === 'la') j++;
  }
  let ora = false;
  if (T[j]?.t === 'ora' || T[j]?.t === 'orele') { ora = true; j++; }
  if (!prep && !ora) return null;

  if (T[j]?.t === 'pranz' || T[j]?.t === 'amiaza') return { kind: 'time', prep, start: i, end: j + 1, h: 12, min: 0, fixed: true };

  let h, min = 0;
  const hm = /^(\d{1,2})h(\d{2})$/.exec(T[j]?.t || '');
  if (hm) { h = Number(hm[1]); min = Number(hm[2]); j++; }
  else if (T[j]?.n != null && T[j].n <= 24) {
    h = T[j].n; j++;
    const a = T[j], b = T[j + 1], c = T[j + 2];
    if (a?.t === 'si') {
      if (b?.t === 'jumatate') { min = 30; j += 2; }
      else if (b?.t === 'un' && c?.t === 'sfert') { min = 15; j += 3; }
      else if (b?.t === 'sfert') { min = 15; j += 2; }
      else if (b?.n === 3 && c?.t === 'sferturi') { min = 45; j += 3; }
      else if (b?.n != null && b.n < 60 && !(T[j + 2]?.t in MONTHS)) {
        min = b.n; j += 2;
        if (T[j]?.t === 'de') j++;
        if (T[j]?.t === 'minute' || T[j]?.t === 'minut') j++;
      }
    } else if (a?.t === 'fara') {
      if (b?.t === 'un' && c?.t === 'sfert') { min = -15; j += 3; }
      else if (b?.t === 'sfert') { min = -15; j += 2; }
      else if (b?.n != null && b.n < 60) {
        min = -b.n; j += 2;
        if (T[j]?.t === 'minute' || T[j]?.t === 'minut') j++;
      }
    } else if (a?.n != null && a.n < 60 && a.t.length === 2 && !(b?.t in MONTHS)) {
      min = a.n; j++;
    }
  } else return null;
  if (T[j]?.t === 'fix') j++;
  if (h > 24 || min > 59) return null;
  return { kind: 'time', prep, start: i, end: j, h, min };
}

function matchMod(T, i) {
  const t = T[i]?.t;
  if (t === 'dimineata' || t === 'dimineat') return { kind: 'mod', start: i, end: i + 1, mod: 'am' };
  if (t === 'seara' || t === 'pm' || t === 'noaptea') return { kind: 'mod', start: i, end: i + 1, mod: 'pm' };
  if (t === 'dupa' && ['amiaza', 'masa', 'pranz', 'amiaz'].includes(T[i + 1]?.t)) return { kind: 'mod', start: i, end: i + 2, mod: 'pm' };
  return null;
}

function scanWhen(T, from, now, opts) {
  const segs = [];
  for (let i = from; i < T.length;) {
    const m = matchRange(T, i, now) || matchDate(T, i, now, opts) || matchTime(T, i) || matchMod(T, i);
    if (m) { segs.push(m); i = m.end; } else i++;
  }
  return segs;
}

function timeOf(seg, mod) {
  if (!seg) return null;
  let { h, min } = seg;
  if (!seg.fixed) {
    if (mod === 'pm' && h < 12) h += 12;
    else if (!mod && h >= 1 && h <= 7) h += 12; // „la 3” înseamnă după-amiaza
  }
  let total = (h * 60 + min + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function modOf(segs) {
  return segs.find(s => s.kind === 'mod')?.mod || segs.find(s => s.mod)?.mod || null;
}

function consumedSet(segs) {
  const c = new Set();
  for (const s of segs) for (let k = s.start; k < s.end; k++) c.add(k);
  return c;
}

// ---------- clienți ----------

function genitive(x) {
  return x.endsWith('a') ? x.slice(0, -1) + 'ei' : null;
}

function tokMatch(tok, x) {
  if (tok === x || genitive(x) === tok) return true;
  if (x.length >= 5 && levenshtein(tok, x) <= 1) return true;
  if (x.length >= 8 && levenshtein(tok, x) <= 2) return true;
  return false;
}

// Câte cuvinte din `words` se regăsesc în numele clientului
function scoreClient(words, client) {
  const ct = norm(client.name).split(' ');
  const used = new Set();
  let matched = 0;
  for (const w of words) {
    const k = ct.findIndex((x, idx) => !used.has(idx) && tokMatch(w, x));
    if (k >= 0) { used.add(k); matched++; }
  }
  return { matched, extra: ct.length - matched };
}

export function matchClients(words, clients) {
  if (!words.length) return { exact: [], partial: [] };
  const scored = clients.map(c => ({ c, ...scoreClient(words, c) })).filter(x => x.matched > 0);
  const exact = scored.filter(x => x.matched === words.length).sort((a, b) => a.extra - b.extra);
  // dacă un client se potrivește perfect (toate cuvintele, nimic în plus), e singurul ales
  const perfect = exact.filter(x => x.extra === 0);
  const ex = perfect.length === 1 ? perfect : exact;
  const partial = scored.filter(x => x.matched < words.length).sort((a, b) => b.matched - a.matched || a.extra - b.extra);
  return { exact: ex.map(x => x.c.id), partial: partial.slice(0, 5).map(x => x.c.id) };
}

// Primul grup de cuvinte care nu sunt dată, oră sau cuvinte de legătură
function nameRun(T, from, consumed, skip = new Set()) {
  let run = [];
  for (let k = from; k < T.length; k++) {
    const bad = consumed.has(k) || FILLER.has(T[k].t) || skip.has(k) || T[k].t in VERB || T[k].n != null;
    if (bad) { if (run.length) break; continue; }
    run.push(k);
  }
  return run;
}

function origWords(orig, T, idxs) {
  const os = [...new Set(idxs.map(k => T[k].o))];
  return os.map(o => orig[o].replace(/[^\p{L}\p{N}-]/gu, '')).filter(Boolean).join(' ');
}

function origFrom(orig, T, k) {
  if (k >= T.length) return '';
  return orig.slice(T[k].o).join(' ').replace(/(\d{1,2})h(\d{2})\b/g, '$1:$2').replace(/^[\s:,.\-–]+/, '').trim();
}

// ---------- ședințe ----------

function findSessions(ctx, { clientIds, date, time }) {
  const todayK = dateKey(ctx.now);
  let list = ctx.sessions.filter(s => s.status === 'programata');
  if (clientIds?.length) list = list.filter(s => clientIds.includes(s.clientId));
  if (date) list = list.filter(s => s.start.startsWith(date));
  else {
    list = list.filter(s => s.start >= todayK);
    if (time && !clientIds?.length) {
      const today = list.filter(s => s.start.startsWith(todayK) && s.start.endsWith(time));
      if (today.length) return today.map(s => s.id);
    }
  }
  if (time) list = list.filter(s => s.start.endsWith(time));
  list.sort((a, b) => a.start.localeCompare(b.start));
  return list.slice(0, 6).map(s => s.id);
}

// ---------- comanda ----------

function detectIntent(T) {
  for (let i = 0; i < T.length; i++) {
    let it = VERB[T[i].t];
    if (!it) continue;
    if (it === 'add' || it === 'show') {
      const ahead = T.slice(i + 1, i + 5).map(x => x.t);
      if (ahead.some(a => ['nota', 'notita', 'observatie', 'observatia', 'notite'].includes(a))) it = 'note';
      else if (it === 'show' && ahead.includes('fisa')) it = 'open';
      else if (it === 'show') it = 'query';
      else if (ahead.some(a => a.startsWith('program') || a.startsWith('sedint'))) it = 'schedule';
      else continue;
    }
    if (it === 'open' && T[i].t === 'fisa' && T.slice(0, i).some(x => VERB[x.t] === 'note')) continue;
    return { intent: it, at: i };
  }
  return null;
}

const FIELD_WORDS = {
  reactions: ['reactie', 'reactii', 'reactia', 'reactiile', 'reactiei'],
  after: ['stare', 'starea', 'stareadupa'],
  procedures: ['proceduri', 'procedura', 'procedurile'],
  notes: ['nota', 'notita', 'notite', 'observatie', 'observatii'],
};

export function parseCommand(text, ctx) {
  const now = ctx.now || new Date();
  const { orig, toks: T } = tokenize(text);
  const out = { text: String(text).trim() };
  if (!T.length) return { ...out, type: 'unknown' };

  const timer = parseTimer(T, orig, ctx);
  if (timer) return { ...out, type: 'timer', ...timer };

  const found = detectIntent(T);
  let intent = found?.intent;
  const at = found ? found.at + 1 : 0;

  if (!intent) {
    // „Maria Popescu marți la 10” fără verb: nu ghicim
    return { ...out, type: 'unknown' };
  }

  if (intent === 'help') return { ...out, type: 'help' };

  if (intent === 'query') {
    const segs = scanWhen(T, 0, now, { todayOk: true, pastOk: true });
    const range = segs.find(s => s.kind === 'range');
    if (range) return { ...out, type: 'query', from: range.from, to: range.to, label: range.label, single: false };
    const d = segs.find(s => s.kind === 'date');
    const day = d ? d.date : dateKey(now);
    // „ce ședințe are Maria” -> când vine clientul
    if (!d) {
      const run = nameRun(T, 0, consumedSet(segs));
      if (run.length) {
        const m = matchClients(run.map(k => T[k].t), ctx.clients);
        if (m.exact.length || m.partial.length) return { ...out, type: 'when', ...m, clientQuery: capName(origWords(orig, T, run)) };
      }
    }
    return { ...out, type: 'query', from: day, to: dateKey(addDays(parseKey(day), 1)), single: true };
  }

  if (intent === 'when' || intent === 'open') {
    const segs = scanWhen(T, at, now, { todayOk: true });
    const run = nameRun(T, at, consumedSet(segs));
    const m = matchClients(run.map(k => T[k].t), ctx.clients);
    return { ...out, type: intent, ...m, clientQuery: run.length ? capName(origWords(orig, T, run)) : null };
  }

  if (intent === 'schedule') {
    const segs = scanWhen(T, at, now, { todayOk: false });
    const mod = modOf(segs);
    const dSeg = segs.find(s => s.kind === 'date');
    const tSeg = segs.find(s => s.kind === 'time');
    const run = nameRun(T, at, consumedSet(segs));
    const name = run.length ? capName(origWords(orig, T, run)) : null;
    const m = matchClients(run.map(k => T[k].t), ctx.clients);
    return { ...out, type: 'schedule', clientQuery: name, ...m, date: dSeg?.date || null, time: timeOf(tSeg, mod) };
  }

  if (intent === 'note') {
    let k = at;
    while (k < T.length && (FILLER.has(T[k].t) || T[k].t === 'fisa' || T[k].t === 'fisei' || FIELD_WORDS.notes.includes(T[k].t))) k++;
    let best = null;
    for (let len = Math.min(4, T.length - k); len >= 1; len--) {
      const words = T.slice(k, k + len).map(x => x.t);
      if (words.some(w => FILLER.has(w))) continue;
      const m = matchClients(words, ctx.clients);
      if (m.exact.length) { best = { len, ...m }; break; }
    }
    if (!best) {
      const run = nameRun(T, k, new Set());
      return { ...out, type: 'note', exact: [], partial: [], clientQuery: run.length ? capName(origWords(orig, T, run.slice(0, 2))) : null, field: 'notes', note: '' };
    }
    let j = k + best.len;
    while (j < T.length && ['ca', 'la', 'cu', 'si', 'in', 'despre'].includes(T[j].t)) j++;
    let field = 'notes';
    for (const [f, words] of Object.entries(FIELD_WORDS)) {
      if (words.includes(T[j]?.t)) {
        field = f;
        j++;
        if (f === 'reactions' && ['in', 'din'].includes(T[j]?.t) && T[j + 1]?.t === 'timpul') j += 2;
        if (f === 'reactions' && ['sedintei', 'sedinta'].includes(T[j]?.t)) j++;
        if (f === 'after' && T[j]?.t === 'dupa') { j++; if (T[j]?.t?.startsWith('sedint')) j++; }
        if (f === 'after' && T[j]?.t === 'de') { j++; if (T[j]?.t === 'dupa') j++; if (T[j]?.t?.startsWith('sedint')) j++; }
        break;
      }
    }
    while (j < T.length && ['ca', 'e', 'este'].includes(T[j].t) && field !== 'notes') j++;
    let note = origFrom(orig, T, j);
    note = note ? note[0].toLocaleUpperCase('ro') + note.slice(1) : '';
    return { ...out, type: 'note', exact: best.exact, partial: best.partial, field, note };
  }

  if (intent === 'move' || intent === 'cancel') {
    const segs = scanWhen(T, at, now, { todayOk: true });
    // „cu două zile”, „cu o oră”
    let shiftDays = 0, shiftMin = 0;
    const shiftIdx = new Set();
    if (intent === 'move') {
      for (let k = at; k < T.length - 2; k++) {
        if (T[k].t !== 'cu') continue;
        const n = countWord(T[k + 1]);
        const u = T[k + 2].t;
        if (n == null) continue;
        if (u === 'zi' || u === 'zile') shiftDays = n;
        else if (u === 'saptamana' || u === 'saptamani') shiftDays = 7 * n;
        else if (u === 'ora' || u === 'ore') shiftMin = 60 * n;
        else continue;
        [k, k + 1, k + 2].forEach(x => shiftIdx.add(x));
        if (T[k + 3]?.t === 'mai' && ['tarziu', 'incolo'].includes(T[k + 4]?.t)) { shiftIdx.add(k + 3); shiftIdx.add(k + 4); }
        if (T[k + 3]?.t === 'mai' && ['devreme', 'inainte'].includes(T[k + 4]?.t)) {
          shiftDays = -shiftDays; shiftMin = -shiftMin; shiftIdx.add(k + 3); shiftIdx.add(k + 4);
        }
        break;
      }
    }
    const isSource = s => intent === 'cancel' || s.prep === 'de' || s.prep === 'din';
    const src = segs.filter(s => s.kind !== 'mod' && isSource(s));
    const dst = segs.filter(s => s.kind !== 'mod' && !isSource(s));
    const srcDate = src.find(s => s.kind === 'date')?.date || null;
    const srcTimeSeg = src.find(s => s.kind === 'time');
    const run = nameRun(T, at, consumedSet(segs), shiftIdx);
    const m = run.length ? matchClients(run.map(k => T[k].t), ctx.clients) : { exact: [], partial: [] };
    const clientIds = m.exact.length ? m.exact : null;
    const candidates = findSessions(ctx, { clientIds, date: srcDate, time: srcTimeSeg ? timeOf(srcTimeSeg, null) : null });
    const res = {
      ...out, type: intent, candidates, clientIds: clientIds || [],
      clientQuery: run.length ? capName(origWords(orig, T, run)) : null,
    };
    if (intent === 'move') {
      const dDate = dst.find(s => s.kind === 'date');
      const dTime = dst.find(s => s.kind === 'time');
      res.dest = { date: dDate?.date || null, time: timeOf(dTime, modOf(segs)), shiftDays, shiftMin };
    }
    return res;
  }

  return { ...out, type: 'unknown' };
}

// ---------- cronometrul pașilor ----------

const UNIT_MIN = new Set(['minut', 'minute', 'min', 'minutul', 'minutele']);
const UNIT_SEC = new Set(['secunda', 'secunde', 'sec', 'secundele']);
const TIMER_WORDS = new Set(['cronometru', 'cronometrul', 'cronometre', 'cronometrele', 'numaratoare', 'numaratoarea',
  'countdown', 'pauza', 'pauzei', 'pauzele', 'timp', 'timpul', 'timpi', 'timpii', 'alarma', 'alarmei', 'timer', 'timerul',
  'temporizator', 'temporizatorul']);
const START_WORDS = new Set(['porneste', 'pornesti', 'pornim', 'pornește', 'start', 'starteaza', 'incepe', 'incepem']);
const STOP_WORDS = new Set(['opreste', 'oprim', 'stop', 'opresti']);
const RESET_WORDS = new Set(['obisnuit', 'obisnuita', 'normal', 'normala', 'implicit', 'implicita', 'standard', 'general', 'generala']);
const ALL_WORDS = new Set(['toti', 'toate', 'toata', 'tuturor', 'fiecare']);
const EVERYONE = new Set(['clientii', 'pacientii', 'lumea', 'clientilor', 'pacientilor', 'clientele', 'pacientele']);
const ALL_PROCS = new Set(['procedurile', 'procedurilor', 'pasii', 'pasilor', 'miscarile', 'procedura', 'pasul']);
const TIMER_FILLER = new Set([...FILLER, ...TIMER_WORDS, ...START_WORDS, ...STOP_WORDS, ...RESET_WORDS, ...ALL_WORDS,
  ...EVERYONE, ...ALL_PROCS, ...UNIT_MIN, ...UNIT_SEC,
  'seteaza', 'setez', 'setati', 'setam', 'pune', 'puneti', 'punem', 'schimba', 'schimbati', 'modifica', 'fa', 'fii', 'fie',
  'procedurii', 'pasului', 'pacientul', 'pacienta', 'pacientului', 'pacientei', 'personalizat', 'personalizata',
  'drumul', 'da', 'cat', 'cate', 'cit', 'dureaza', 'durata', 'sterge', 'stergeti', 'revino', 'reveni', 'foloseste',
  'folosim', 'foloseasca', 'reseteaza', 'anuleaza', 'jumatate', 'tot', 'iar', 'aceeasi', 'acelasi', 'lui', 'ei', 'clienta',
  'client', 'clientul', 'clientului', 'clientei', 'si', 'iti', 'vreau', 'ce', 'care']);
const PROC_STOP = new Set(['de', 'baza', 'relaxare', 'zona', 'si', 'a', 'la', 'cu']);

// „2 minute”, „un minut și jumătate”, „90 de secunde”, „2 minute și 30 de secunde”, „2:30”
function matchDuration(T, i) {
  const hm = /^(\d{1,2})h(\d{2})$/.exec(T[i]?.t || '');
  if (hm) return { start: i, end: i + 1, seconds: Number(hm[1]) * 60 + Number(hm[2]) };
  if (T[i]?.t === 'jumatate' && T[i + 1]?.t === 'de' && UNIT_MIN.has(T[i + 2]?.t)) return { start: i, end: i + 3, seconds: 30 };
  const n = countWord(T[i]);
  if (n == null) return null;
  let j = i + 1;
  if (T[j]?.t === 'de') j++;
  let half = false;
  if (T[j]?.t === 'si' && T[j + 1]?.t === 'jumatate' && UNIT_MIN.has(T[j + 2]?.t)) { half = true; j += 2; }
  if (UNIT_MIN.has(T[j]?.t)) {
    let sec = n * 60 + (half ? 30 : 0);
    j++;
    if (!half && T[j]?.t === 'si' && T[j + 1]?.t === 'jumatate') { sec += 30; j += 2; }
    else {
      let k = j;
      if (T[k]?.t === 'si') k++;
      const s2 = T[k]?.n;
      if (s2 != null && s2 < 60) {
        k++;
        if (T[k]?.t === 'de') k++;
        if (UNIT_SEC.has(T[k]?.t)) k++;
        sec += s2;
        j = k;
      }
    }
    return { start: i, end: j, seconds: sec };
  }
  if (UNIT_SEC.has(T[j]?.t)) return { start: i, end: j + 1, seconds: n };
  return null;
}

function procWords(name) {
  return norm(String(name).replace(/\(([^)]*)\)/g, (m, x) => ` ${x.replace(/\s+/g, '')} `))
    .split(' ').filter(w => w && !PROC_STOP.has(w));
}

function procTokMatch(tok, w) {
  if (tokMatch(tok, w)) return true;
  // forme ca „gâtului”, „umărului”, „genunchii”
  if (w.length >= 3 && tok.startsWith(w) && tok.length - w.length <= 4) return true;
  if (tok.length >= 4 && w.startsWith(tok)) return true;
  return false;
}

// Cât de bine se potrivesc cuvintele spuse cu numele procedurii
function scoreProc(words, name) {
  const pw = procWords(name);
  const used = new Set();
  let matched = 0;
  for (const w of words) {
    const k = pw.findIndex((x, i) => !used.has(i) && procTokMatch(w, x));
    if (k >= 0) { used.add(k); matched++; }
  }
  return matched;
}

function bestProcs(words, procedures) {
  if (!words.length) return { score: 0, names: [] };
  let best = 0, names = [];
  for (const p of procedures) {
    const sc = scoreProc(words, p);
    if (sc > best) { best = sc; names = [p]; }
    else if (sc === best && sc > 0) names.push(p);
  }
  return { score: best, names };
}

// „b r m 3” / „brm 3” -> „brm3”
function joinBrm(T) {
  const out = [];
  for (let i = 0; i < T.length; i++) {
    if (T[i].t === 'b' && T[i + 1]?.t === 'r' && T[i + 2]?.t === 'm') { out.push({ t: 'brm', o: T[i].o }); i += 2; continue; }
    out.push(T[i]);
  }
  const res = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i].t === 'brm' && out[i + 1]?.n != null) { res.push({ t: `brm${out[i + 1].n}`, o: out[i].o }); i++; continue; }
    res.push(out[i]);
  }
  return res;
}

function parseTimer(T0, orig, ctx) {
  const procedures = ctx.procedures || [];
  const T = joinBrm(T0);
  const words = T.map(x => x.t);
  const hasTimerWord = words.some(w => TIMER_WORDS.has(w));
  const hasUnit = words.some(w => UNIT_MIN.has(w) || UNIT_SEC.has(w));
  const startWord = words.some(w => START_WORDS.has(w)) || (words.includes('da') && words.includes('drumul'));
  const verb = detectIntent(T0)?.intent;

  if (STOP_WORDS.has(words[0]) && words.length <= 3) return { action: 'stop' };
  if (!hasTimerWord && !hasUnit && !startWord) {
    // „la Ion pentru genunchi 2:30”: fără verb, dar cu o procedură și un număr
    const procHit = T.some(x => !FILLER.has(x.t) && bestProcs([x.t], procedures).score > 0);
    const num = T.some(x => x.n != null || /^\d{1,2}h\d{2}$/.test(x.t));
    if (verb || !procHit || !num) return null;
  }
  if (verb === 'note') return null;
  if (!hasTimerWord && ['schedule', 'move', 'cancel', 'query', 'when', 'open'].includes(verb)) return null;
  if (hasTimerWord && (words.some(w => STOP_WORDS.has(w)) || (words.includes('anuleaza') && !words.includes('personalizat')))) return { action: 'stop' };

  // durata
  let seconds = null;
  const consumed = new Set();
  for (let i = 0; i < T.length; i++) {
    const d = matchDuration(T, i);
    if (d) { seconds = d.seconds; for (let k = d.start; k < d.end; k++) consumed.add(k); break; }
  }

  const general = words.some((w, i) => ALL_WORDS.has(w) && EVERYONE.has(words[i + 1]))
    || (seconds != null && words.some(w => ['general', 'generala', 'implicit', 'implicita'].includes(w)));
  const allProcs = words.some((w, i) => ALL_WORDS.has(w) && ALL_PROCS.has(words[i + 1]));

  // grupuri de cuvinte rămase: fie client, fie procedură
  const runs = [];
  let run = [];
  for (let k = 0; k < T.length; k++) {
    const bad = consumed.has(k) || TIMER_FILLER.has(T[k].t) || (T[k].n != null && !T[k].t.startsWith('brm'));
    if (bad) { if (run.length) runs.push(run); run = []; } else run.push(k);
  }
  if (run.length) runs.push(run);

  let client = null;
  const procs = [];
  let procChoices = [];
  for (const r of runs) {
    const ws = r.map(k => T[k].t);
    let best = null;
    for (let cut = 0; cut <= ws.length; cut++) {
      for (const clientFirst of [true, false]) {
        const cw = clientFirst ? ws.slice(0, cut) : ws.slice(ws.length - cut);
        const pw = clientFirst ? ws.slice(cut) : ws.slice(0, ws.length - cut);
        const cm = cw.length ? matchClients(cw, ctx.clients) : { exact: [], partial: [] };
        if (cw.length && !cm.exact.length) continue;
        const pm = bestProcs(pw, procedures);
        if (pw.length && !pm.score) continue;
        const score = cw.length * 2 + pm.score * 2 - (pw.length - pm.score);
        if (!best || score > best.score) best = { score, cw, cm, pm, cIdx: clientFirst ? r.slice(0, cut) : r.slice(r.length - cut) };
      }
    }
    if (!best) {
      // cuvinte necunoscute: poate un client nou sau un nume greșit
      if (!client) client = { exact: [], partial: matchClients(ws, ctx.clients).partial, query: capName(origWords(orig, T, r)) };
      continue;
    }
    if (best.cw.length && !client?.exact?.length) client = { ...best.cm, query: capName(origWords(orig, T, best.cIdx)) };
    if (best.pm.names.length === 1) { if (!procs.includes(best.pm.names[0])) procs.push(best.pm.names[0]); }
    else if (best.pm.names.length > 1) procChoices = best.pm.names;
  }

  // „la gât 3” – un număr fără unitate înseamnă minute
  if (seconds == null && !startWord) {
    const lone = T.find(x => x.n != null && !x.t.startsWith('brm') && x.n > 0 && x.n <= 30);
    if (lone) seconds = lone.n * 60;
  }

  const question = ['cat', 'cate', 'cit', 'ce', 'care'].includes(words[0]);
  let action;
  if (question) action = 'query';
  else if (startWord) action = 'start';
  else if (seconds == null && (words.some(w => RESET_WORDS.has(w)) || words.includes('personalizat'))) action = 'reset';
  else if (seconds != null) action = 'set';
  else if (!hasTimerWord) return null;
  else action = 'set';

  if (!procs.length && !procChoices.length && !allProcs && action !== 'start' && !hasTimerWord && !client?.exact?.length) return null;

  return {
    action,
    seconds,
    general: general && !client?.exact?.length,
    allProcs,
    procs,
    procChoices,
    exact: client?.exact || [],
    partial: client?.partial || [],
    clientQuery: client?.query || null,
  };
}

export const EXAMPLES = [
  'Programează-o pe Maria Popescu marți la ora 10',
  'Programează-l pe Ion Ionescu mâine la 3 și jumătate',
  'Programează următoarea ședință pentru Ana',
  'Ce ședințe am mâine?',
  'Ce programări am săptămâna aceasta?',
  'Ce programări am luna asta?',
  'Când vine Maria?',
  'Notează la Ion: durerea de spate s-a ameliorat',
  'Notează la Maria reacții: a simțit căldură în zona lombară',
  'Notează la Ana starea după: se simte relaxată',
  'Mută ședința de la ora 15 pe joi',
  'Mută ședința Mariei pe vineri la 11',
  'Amână ședința lui Ion cu o zi',
  'Anulează ședința de mâine a lui Ion',
  'Deschide fișa Mariei',
  'Pornește cronometrul pentru gât',
  'Setează la Maria pentru gât 3 minute',
  'Timpul general pentru umăr să fie 2 minute și jumătate',
  'La Ion pentru coccis timpul obișnuit',
  'Oprește cronometrul',
];
