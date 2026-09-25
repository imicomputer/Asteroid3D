import { game, keys, scoreEl, waveEl, bestEl, rocksEl, shieldFill, livesRow, best, pauseEl } from './state.js';
import { clamp } from './math.js';
import { ensureAudio, soundOn, setSoundEnabled } from './audio.js';
import { startGame } from './gameplay.js';
/* ---------- HUD/input ---------- */
export function hud() {
  scoreEl.textContent = game.score.toLocaleString('id-ID');
  waveEl.textContent = game.wave;
  bestEl.textContent = best.toLocaleString('id-ID');
  rocksEl.textContent = game.rocks.length + game.enemies.length;
  shieldFill.style.width = `${clamp(game.shieldEnergy, 0, 100)}%`;
  livesRow.textContent = game.lives >= 0 ? '◆'.repeat(Math.max(0, game.lives)) + '◇'.repeat(Math.max(0, 3 - game.lives)) : '—';
}
const keyMap = { KeyW: 'thrust', ArrowUp: 'thrust', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'fire', ShiftLeft: 'shield', ShiftRight: 'shield' };
window.addEventListener('keydown', e => {
  if (e.code === 'Space') e.preventDefault();
  const k = keyMap[e.code];
  if (k) keys[k] = true;
  if (e.code === 'Enter' && game.mode !== 'play') startGame();
  if (e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', e => { const k = keyMap[e.code]; if (k) keys[k] = false; });
document.querySelectorAll('#touch button').forEach(btn => {
  const k = btn.dataset.k;
  const on = e => { e.preventDefault(); ensureAudio(); keys[k] = true; };
  const off = e => { e.preventDefault(); keys[k] = false; };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
});
function togglePause(force) {
  if (game.mode !== 'play') return;
  game.paused = typeof force === 'boolean' ? force : !game.paused;
  pauseEl.hidden = !game.paused;
  document.getElementById('pauseBtn').textContent = game.paused ? 'Lanjut' : 'Jeda';
}
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('againBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
document.getElementById('restartBtn2').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', () => togglePause(false));
document.getElementById('pauseBtn').addEventListener('click', () => togglePause());
document.getElementById('soundBtn').addEventListener('click', e => {
  setSoundEnabled(!soundOn);
  e.target.textContent = `Suara: ${soundOn ? 'On' : 'Off'}`;
  if (soundOn) ensureAudio();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
