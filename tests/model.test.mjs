import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, procTime, mergeDB, emptyDB } from '../js/model.js';
import { fmtDur, sayDur } from '../js/util.js';

test('timpul pauzei: client > procedură > pauza obișnuită', () => {
  const st = { ...defaultSettings(), timerDefault: 120, timers: { Coccis: 90 } };
  const maria = { timers: { Coccis: 240, Gât: 45 } };
  assert.deepEqual(procTime(st, null, 'Umăr'), { seconds: 120, source: 'default' });
  assert.deepEqual(procTime(st, null, 'Coccis'), { seconds: 90, source: 'general' });
  assert.deepEqual(procTime(st, maria, 'Coccis'), { seconds: 240, source: 'client' });
  assert.deepEqual(procTime(st, maria, 'Gât'), { seconds: 45, source: 'client' });
  assert.deepEqual(procTime(st, { timers: {} }, 'Coccis'), { seconds: 90, source: 'general' });
});

test('setările vechi primesc valorile noi pentru cronometru', () => {
  const old = emptyDB();
  delete old.settings.timers;
  delete old.settings.timerDefault;
  const m = mergeDB(old, emptyDB());
  assert.equal(m.settings.timerDefault, 120);
  assert.deepEqual(m.settings.timers, {});
});

test('durate scrise și spuse', () => {
  assert.equal(fmtDur(150), '2:30');
  assert.equal(fmtDur(45), '0:45');
  assert.equal(sayDur(60), 'un minut');
  assert.equal(sayDur(150), '2 minute și jumătate');
  assert.equal(sayDur(90), 'un minut și jumătate');
  assert.equal(sayDur(45), '45 de secunde');
  assert.equal(sayDur(125), '2 minute și 5 secunde');
  assert.equal(sayDur(1200), '20 de minute');
});
