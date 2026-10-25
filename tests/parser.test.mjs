import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, EXAMPLES } from '../js/parser.js';

// marți, 27 octombrie 2026, ora 9
const now = new Date(2026, 9, 27, 9, 0);
const clients = [
  { id: 'maria', name: 'Maria Popescu' },
  { id: 'ion', name: 'Ion Ionescu' },
  { id: 'ana', name: 'Ana Dumitrescu' },
  { id: 'mariaI', name: 'Maria Ilie' },
];
const sessions = [
  { id: 's1', clientId: 'maria', start: '2026-10-27T15:00', status: 'programata' },
  { id: 's2', clientId: 'ion', start: '2026-10-28T10:00', status: 'programata' },
  { id: 's3', clientId: 'ion', start: '2026-11-04T10:00', status: 'programata' },
  { id: 's4', clientId: 'ana', start: '2026-10-29T15:00', status: 'programata' },
  { id: 's5', clientId: 'ana', start: '2026-10-20T15:00', status: 'efectuata' },
];
const ctx = { now, clients, sessions };
const p = t => parseCommand(t, ctx);

test('programare cu zi și oră', () => {
  const r = p('Programează-o pe Maria Popescu marți la ora 10');
  assert.equal(r.type, 'schedule');
  assert.deepEqual(r.exact, ['maria']);
  assert.equal(r.date, '2026-11-03'); // azi e marți -> marțea viitoare
  assert.equal(r.time, '10:00');
});

test('ore spuse în cuvinte și după-amiaza', () => {
  const r = p('Programează-l pe Ion Ionescu mâine la trei și jumătate');
  assert.equal(r.date, '2026-10-28');
  assert.equal(r.time, '15:30');
  assert.deepEqual(r.exact, ['ion']);
  assert.equal(p('programeaza pe Ion joi la 10:45').time, '10:45');
  assert.equal(p('programeaza pe Ion joi la ora 9 dimineata').time, '09:00');
  assert.equal(p('programeaza pe Ion joi la 3 fără un sfert').time, '14:45');
  assert.equal(p('programeaza pe Ion joi la zece și un sfert').time, '10:15');
  assert.equal(p('programeaza pe Ion joi la 11 30').time, '11:30');
  assert.equal(p('programeaza pe Ion joi la prânz').time, '12:00');
  assert.equal(p('programeaza pe Ion joi la 6 seara').time, '18:00');
});

test('date: zi din lună, lună, peste', () => {
  assert.equal(p('programeaza pe Ana pe 5 noiembrie la 9').date, '2026-11-05');
  assert.equal(p('programeaza pe Ana pe douăzeci și opt la 9').date, '2026-10-28');
  assert.equal(p('programeaza pe Ana pe 3 la 9').date, '2026-11-03'); // 3 oct a trecut
  assert.equal(p('programeaza pe Ana peste o săptămână la 9').date, '2026-11-03');
  assert.equal(p('programeaza pe Ana vinerea viitoare la 9').date, '2026-11-06');
  assert.equal(p('programeaza pe Ana joi săptămâna viitoare').date, '2026-11-05');
  assert.equal(p('programeaza pe Ana pe 2 ianuarie').date, '2027-01-02');
});

test('client nou și client ambiguu', () => {
  const r = p('programează pe Elena Vasilescu vineri la 12');
  assert.equal(r.clientQuery, 'Elena Vasilescu');
  assert.deepEqual(r.exact, []);
  const a = p('programeaz-o pe Maria joi la 10');
  assert.deepEqual(a.exact.sort(), ['maria', 'mariaI']);
});

test('„nouă” ca adjectiv nu devine oră', () => {
  const r = p('fă o programare nouă pentru Ana mâine la 2');
  assert.equal(r.type, 'schedule');
  assert.deepEqual(r.exact, ['ana']);
  assert.equal(r.time, '14:00');
  assert.equal(p('programeaza pe Ana mâine la nouă').time, '09:00');
});

test('programare fără dată', () => {
  const r = p('Programează următoarea ședință pentru Ana');
  assert.equal(r.type, 'schedule');
  assert.deepEqual(r.exact, ['ana']);
  assert.equal(r.date, null);
  assert.equal(r.time, null);
});

test('întrebări', () => {
  let r = p('Ce ședințe am mâine?');
  assert.equal(r.type, 'query');
  assert.equal(r.from, '2026-10-28');
  assert.equal(r.to, '2026-10-29');
  r = p('ce programări am săptămâna aceasta');
  assert.equal(r.from, '2026-10-26');
  assert.equal(r.to, '2026-11-02');
  r = p('ce am azi');
  assert.equal(r.from, '2026-10-27');
  r = p('cine vine marți'); // azi e marți: pentru întrebări înseamnă azi
  assert.equal(r.from, '2026-10-27');
  r = p('arată-mi agenda de vineri');
  assert.equal(r.type, 'query');
  assert.equal(r.from, '2026-10-30');
});

test('când vine clientul', () => {
  let r = p('Când vine Maria Popescu?');
  assert.equal(r.type, 'when');
  assert.deepEqual(r.exact, ['maria']);
  r = p('când e următoarea ședință a lui Ion');
  assert.deepEqual(r.exact, ['ion']);
  r = p('ce ședințe are Ana');
  assert.equal(r.type, 'when');
  assert.deepEqual(r.exact, ['ana']);
});

test('notițe', () => {
  let r = p('Notează la Ion: durerea de spate s-a ameliorat');
  assert.equal(r.type, 'note');
  assert.deepEqual(r.exact, ['ion']);
  assert.equal(r.field, 'notes');
  assert.equal(r.note, 'Durerea de spate s-a ameliorat');
  r = p('Notează la Maria Popescu reacții: a simțit căldură în zona lombară');
  assert.deepEqual(r.exact, ['maria']);
  assert.equal(r.field, 'reactions');
  assert.equal(r.note, 'A simțit căldură în zona lombară');
  r = p('noteaza la Ana starea după ședință: se simte relaxată');
  assert.equal(r.field, 'after');
  assert.equal(r.note, 'Se simte relaxată');
  r = p('notează în fișa Mariei Popescu că doarme mai bine');
  assert.deepEqual(r.exact, ['maria']);
  assert.equal(r.note, 'Doarme mai bine');
  r = p('adaugă o notă la Ion: a venit la 10:30');
  assert.equal(r.type, 'note');
  assert.equal(r.note, 'A venit la 10:30');
  r = p('noteaza la Gheorghe ceva');
  assert.deepEqual(r.exact, []);
});

test('mutare', () => {
  let r = p('Mută ședința de la ora 15 pe joi');
  assert.equal(r.type, 'move');
  assert.deepEqual(r.candidates, ['s1']); // azi la 15
  assert.equal(r.dest.date, '2026-10-29');
  assert.equal(r.dest.time, null);
  r = p('Mută ședința Mariei Popescu pe vineri la 11');
  assert.deepEqual(r.candidates, ['s1']);
  assert.equal(r.dest.date, '2026-10-30');
  assert.equal(r.dest.time, '11:00');
  r = p('Amână ședința lui Ion cu o zi');
  assert.deepEqual(r.candidates, ['s2', 's3']);
  assert.equal(r.dest.shiftDays, 1);
  r = p('mută ședința de joi a Anei la ora 4');
  assert.deepEqual(r.candidates, ['s4']);
  assert.equal(r.dest.time, '16:00');
  r = p('reprogramează ședința lui Ion de pe 4 noiembrie pe 6 noiembrie');
  assert.deepEqual(r.candidates, ['s3']);
  assert.equal(r.dest.date, '2026-11-06');
});

test('anulare', () => {
  let r = p('Anulează ședința de mâine a lui Ion');
  assert.equal(r.type, 'cancel');
  assert.deepEqual(r.candidates, ['s2']);
  r = p('anulează programarea de la 3');
  assert.deepEqual(r.candidates, ['s1']);
});

test('deschide fișa', () => {
  const r = p('Deschide fișa Mariei');
  assert.equal(r.type, 'open');
  assert.deepEqual(r.exact.sort(), ['maria', 'mariaI']);
  assert.equal(p('arată fișa lui Ion').type, 'open');
});

test('fără diacritice și litere mari', () => {
  const r = p('PROGRAMEAZA PE ION IONESCU MAINE LA 10');
  assert.equal(r.date, '2026-10-28');
  assert.equal(r.time, '10:00');
});

test('necunoscut și ajutor', () => {
  assert.equal(p('bună ziua').type, 'unknown');
  assert.equal(p('ajutor').type, 'help');
});

test('toate exemplele din ajutor sunt înțelese', () => {
  for (const e of EXAMPLES) assert.notEqual(p(e).type, 'unknown', e);
});
