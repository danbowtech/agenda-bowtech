// Recunoașterea vocii cu un microfon simulat: „Trimite” trebuie să oprească ascultarea
// și să folosească ce s-a auzit, chiar dacă telefonul nu termină singur.
import test from 'node:test';
import assert from 'node:assert/strict';

let last;
class FakeSR {
  constructor() { last = this; this.endsOnStop = true; }
  start() {}
  stop() { if (this.endsOnStop) setTimeout(() => this.onend?.(), 10); }
  abort() { this.aborted = true; }
  say(text, isFinal) {
    const res = [{ transcript: text }];
    res.isFinal = isFinal;
    this.onresult?.({ resultIndex: 0, results: [res] });
  }
}
globalThis.SpeechRecognition = FakeSR;
const voice = await import('../js/voice.js');

test('Trimite în timp ce ascultă: folosește ce s-a auzit până acum', async () => {
  const partials = [];
  const rec = voice.listen({ onPartial: t => partials.push(t) });
  last.say('programează-l pe Ion mâine', false);
  rec.stop();
  assert.deepEqual(await rec.result, ['programează-l pe Ion mâine']);
  assert.deepEqual(partials, ['programează-l pe Ion mâine']);
});

test('telefonul nu se oprește singur: după 2 secunde se trimite oricum', async () => {
  const rec = voice.listen();
  last.endsOnStop = false;
  last.say('ce ședințe am mâine', false);
  const t0 = Date.now();
  rec.stop();
  assert.deepEqual(await rec.result, ['ce ședințe am mâine']);
  assert.ok(Date.now() - t0 >= 1900);
  assert.equal(last.aborted, true);
});

test('rezultatul final are prioritate față de cel parțial', async () => {
  const rec = voice.listen();
  last.say('ce ședințe', false);
  last.say('ce ședințe am azi', true);
  last.onend();
  assert.deepEqual(await rec.result, ['ce ședințe am azi']);
});
