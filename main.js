import { game } from './state.js';
import { resetShip, update } from './gameplay.js';
import { initGPU, render, device } from './renderer.js';
import { hud } from './input.js';
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (device && !game.paused && (game.mode === 'play' || game.mode === 'menu' || game.mode === 'over')) {
    update(dt);
    try { render(); } catch (err) { console.error(err); }
  }
  hud();
  requestAnimationFrame(loop);
}
resetShip();
initGPU().then(ok => { if (ok) requestAnimationFrame(loop); });
