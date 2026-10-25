// Cronometrul pentru pauza de după fiecare pas, cu un sunet blând la final.
//
// Sunetul e sintetizat (fără fișiere) și programat din start pe ceasul audio, ca să
// sune la timp chiar dacă telefonul încetinește pagina. Cât timp merge cronometrul,
// ecranul rămâne aprins (Wake Lock), altfel Android ar putea opri aplicația.

export const T = {
  active: false,   // există un cronometru (care merge, e pe pauză sau tocmai s-a terminat)
  paused: false,
  done: false,
  endAt: 0,        // ms, când se termină (dacă merge)
  left: 0,         // ms rămase (dacă e pe pauză)
  total: 0,        // ms
  label: '',
  sub: '',
  meta: {},
};

let ctx = null;
let scheduled = [];
let opts = { sound: 'bol', volume: 40, vibrate: true };
let ticker = null;
let wakeLock = null;
const listeners = new Set();

export const onTimer = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = what => listeners.forEach(fn => fn(what));

// Trebuie chemată dintr-o atingere (buton), altfel telefonul nu dă voie la sunet
export function unlockAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export const remaining = () => !T.active ? 0 : T.done ? 0 : T.paused ? T.left : Math.max(0, T.endAt - Date.now());
export const isRunning = () => T.active && !T.paused && !T.done;

export function start({ seconds, label, sub = '', meta = {} }, sound) {
  if (sound) opts = { ...opts, ...sound };
  unlockAudio();
  cancelSound();
  Object.assign(T, { active: true, paused: false, done: false, total: seconds * 1000, endAt: Date.now() + seconds * 1000, left: 0, label, sub, meta });
  scheduleSound();
  keepAwake();
  runTicker();
  emit('start');
}

export function pause() {
  if (!isRunning()) return;
  T.left = remaining();
  T.paused = true;
  cancelSound();
  releaseAwake();
  emit('pause');
}

export function resume() {
  if (!T.active || !T.paused) return;
  unlockAudio();
  T.endAt = Date.now() + T.left;
  T.paused = false;
  scheduleSound();
  keepAwake();
  runTicker();
  emit('resume');
}

export function adjust(deltaSec) {
  if (!T.active || T.done) return;
  if (T.paused) T.left = Math.max(1000, T.left + deltaSec * 1000);
  else {
    T.endAt = Math.max(Date.now() + 1000, T.endAt + deltaSec * 1000);
    cancelSound();
    scheduleSound();
  }
  T.total = Math.max(T.total + deltaSec * 1000, remaining());
  emit('adjust');
}

export function stop() {
  if (!T.active) return;
  cancelSound();
  releaseAwake();
  clearInterval(ticker);
  ticker = null;
  Object.assign(T, { active: false, paused: false, done: false, meta: {} });
  emit('stop');
}

function runTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (!isRunning()) return;
    if (remaining() <= 0) finish();
    else emit('tick');
  }, 250);
}

function finish() {
  T.done = true;
  clearInterval(ticker);
  ticker = null;
  releaseAwake();
  // dacă ceasul audio a stat (aplicația a fost oprită), sunăm acum
  if (!scheduled.length || !ctx || ctx.state !== 'running' || ctx.currentTime < scheduled.at - 1) {
    cancelSound();
    unlockAudio();
    if (ctx) scheduled = playAt(ctx.currentTime + 0.05);
  }
  if (opts.vibrate) navigator.vibrate?.([250, 120, 250]);
  emit('done');
}

// ---------- ecranul aprins ----------

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
}

function releaseAwake() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (isRunning()) {
    keepAwake();
    if (remaining() <= 0) finish(); else emit('tick');
  }
});

// ---------- sunetul ----------

function scheduleSound() {
  if (!ctx) return;
  const at = ctx.currentTime + remaining() / 1000;
  scheduled = playAt(at);
}

function cancelSound() {
  for (const n of scheduled) { try { n.stop(); } catch {} try { n.disconnect(); } catch {} }
  scheduled = [];
}

function playAt(at) {
  const nodes = [];
  const master = ctx.createGain();
  const v = Math.max(0, Math.min(100, opts.volume)) / 100;
  master.gain.value = v * v * 0.7;
  master.connect(ctx.destination);
  if (opts.sound === 'clopotel') {
    bell(at, master, nodes);
    bell(at + 3.2, master, nodes);
  } else {
    bowl(at, master, nodes);
    bowl(at + 5.5, master, nodes);
  }
  nodes.at = at;
  return nodes;
}

function tone(freq, at, gain, attack, decay, out, nodes) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + attack + decay + 0.1);
  nodes.push(o);
}

// Bol tibetan: notă joasă, cu armonice și o ușoară „bătaie”, care se stinge încet
function bowl(at, out, nodes) {
  const f = 220;
  for (const [ratio, g, decay] of [[1, 0.5, 7], [2.76, 0.22, 5], [5.4, 0.08, 3.5], [8.9, 0.03, 2]]) {
    tone(f * ratio, at, g, 0.06, decay, out, nodes);
    tone(f * ratio * 1.004, at, g * 0.6, 0.08, decay, out, nodes);
  }
}

// Clopoțel: trei note scurte și moi, urcătoare
function bell(at, out, nodes) {
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const t = at + i * 0.38;
    tone(f, t, 0.35, 0.015, 2.2, out, nodes);
    tone(f * 2, t, 0.06, 0.01, 1.2, out, nodes);
  });
}

// Pentru butonul „Ascultă sunetul”
export function preview(sound) {
  opts = { ...opts, ...sound };
  unlockAudio();
  if (!ctx) return;
  const nodes = [];
  const master = ctx.createGain();
  const v = Math.max(0, Math.min(100, opts.volume)) / 100;
  master.gain.value = v * v * 0.7;
  master.connect(ctx.destination);
  if (opts.sound === 'clopotel') bell(ctx.currentTime + 0.05, master, nodes);
  else bowl(ctx.currentTime + 0.05, master, nodes);
}
