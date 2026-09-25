export let soundOn = true;
/* ---------- audio ---------- */
let audioCtx = null, masterGain = null;
function ensureAudio() {
  if (audioCtx || !soundOn) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.24;
    masterGain.connect(audioCtx.destination);
  } catch (e) { audioCtx = null; }
}
function beep(freq, dur, type = 'square', vol = 0.5, slide = 0) {
  if (!audioCtx || !soundOn) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur = 0.35, vol = 0.7) {
  if (!audioCtx || !soundOn) return;
  const n = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = audioCtx.createBufferSource(); s.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = audioCtx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(masterGain); s.start();
}
export function resumeAudio() {
  return audioCtx?.resume?.();
}
export function setSoundEnabled(value) { soundOn = value; }
export { ensureAudio, beep, noiseBurst };
