// Recunoașterea vocii (în română) și citirea răspunsurilor cu voce tare.

const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const canListen = !!SR;

const ERRORS = {
  'not-allowed': 'Aplicația nu are voie să folosească microfonul. Permite accesul la microfon din setările browserului.',
  'service-not-allowed': 'Recunoașterea vocii nu este permisă pe acest dispozitiv.',
  'no-speech': 'Nu am auzit nimic. Apasă din nou pe microfon și vorbește.',
  'audio-capture': 'Nu găsesc microfonul telefonului.',
  network: 'Recunoașterea vocii are nevoie de internet.',
  'language-not-supported': 'Limba română nu este disponibilă pentru recunoașterea vocii pe acest telefon.',
};

// Ascultă o frază. Întoarce { result: Promise<string[]>, stop() }
// Promisiunea primește variantele înțelese, cea mai probabilă prima.
export function listen({ onPartial } = {}) {
  if (!SR) {
    return { result: Promise.reject(new Error('Acest browser nu are recunoaștere vocală. Folosește Chrome pe Android.')), stop() {} };
  }
  const r = new SR();
  r.lang = 'ro-RO';
  r.interimResults = true;
  r.maxAlternatives = 4;
  r.continuous = false;
  let finals = null;
  let lastPartial = '';
  let finish;
  const result = new Promise((resolve, reject) => {
    let settled = false;
    finish = () => { if (!settled) { settled = true; resolve(finals || (lastPartial ? [lastPartial] : [])); } };
    r.onresult = e => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finals = Array.from(res).map(a => a.transcript.trim()).filter(Boolean);
        } else partial += res[0].transcript;
      }
      if (partial) { lastPartial = partial.trim(); onPartial?.(lastPartial); }
    };
    r.onerror = e => {
      if (e.error === 'aborted') return;
      reject(new Error(ERRORS[e.error] || `Recunoașterea vocii a eșuat (${e.error}).`));
    };
    r.onend = () => finish();
  });
  try { r.start(); } catch (e) { return { result: Promise.reject(e), stop() {} }; }
  return {
    result,
    // unele telefoane nu se opresc imediat: după 2 secunde folosim ce s-a auzit până atunci
    stop: () => {
      try { r.stop(); } catch {}
      setTimeout(() => { try { r.abort(); } catch {} finish(); }, 2000);
    },
  };
}

let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in globalThis)) return;
  voices = speechSynthesis.getVoices();
}
if ('speechSynthesis' in globalThis) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

export function speak(text) {
  if (!('speechSynthesis' in globalThis) || !text) return;
  const ro = voices.find(v => v.lang?.toLowerCase().replace('_', '-').startsWith('ro'));
  // dacă telefonul are voci, dar niciuna în română, nu citim cu accent străin
  if (!ro && voices.length) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ro-RO';
  if (ro) u.voice = ro;
  u.rate = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in globalThis) speechSynthesis.cancel();
}
