export const canvas = document.getElementById('gpu');
export const scoreEl = document.getElementById('score');
export const waveEl = document.getElementById('wave');
export const bestEl = document.getElementById('best');
export const rocksEl = document.getElementById('rocks');
export const shieldFill = document.getElementById('shieldFill');
export const livesRow = document.getElementById('livesRow');
export const toastEl = document.getElementById('toast');
export const menuEl = document.getElementById('menu');
export const pauseEl = document.getElementById('pauseMenu');
export const overEl = document.getElementById('gameOver');
export const noGpuEl = document.getElementById('noGpu');
export const finalStats = document.getElementById('finalStats');

export const ARENA = { x: 15, y: 9, zMin: -9, zMax: 3 };
export const TAU = Math.PI * 2;
export let best = Number(localStorage.getItem('asteroid3d-best') || 0);
bestEl.textContent = best;

export const keys = { thrust: false, brake: false, left: false, right: false, fire: false, shield: false };
export const game = {
  mode: 'menu',
  paused: false,
  time: 0,
  score: 0,
  lives: 3,
  wave: 1,
  shake: 0,
  ship: null,
  rocks: [],
  bullets: [],
  enemyBullets: [],
  enemies: [],
  particles: [],
  rings: [],
  pendingWaveTimer: 0
};

export function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.style.opacity = '0'; }, ms);
}
function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let z = Math.imul(t ^ (t >>> 15), t | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function randRange(rng, a, b) { return a + (b - a) * rng(); }

export function updateBest(value) { best = value; }
export { clamp };
