import { game, keys, ARENA, TAU, menuEl, pauseEl, overEl, finalStats, toast, best, updateBest } from './state.js';
import { mulberry, randRange } from './math.js';
import { ensureAudio, resumeAudio, beep, noiseBurst } from './audio.js';
/* ---------- game state ---------- */
function resetShip() {
  game.ship = { x: 0, y: 0, z: 0, vx: 0, vy: 0, angle: Math.PI / 2, radius: 0.95, fireCd: 0, invuln: 3, thrustFx: 0 };
}
function startGame() {
  ensureAudio();
  resumeAudio();
  game.mode = 'play'; game.paused = false; game.time = 0;
  game.score = 0; game.lives = 3; game.wave = 1; game.shake = 0;
  game.rocks = []; game.bullets = []; game.enemyBullets = []; game.enemies = []; game.particles = []; game.rings = [];
  resetShip();
  spawnWave(1);
  menuEl.hidden = true; overEl.hidden = true; pauseEl.hidden = true;
  toast('Gelombang 1: hancurkan semua asteroid!');
  beep(220, 0.25, 'sawtooth', 0.4, 440);
}
function spawnWave(w) {
  const rng = mulberry(9000 + w * 131);
  const n = Math.min(4 + w, 11);
  for (let i = 0; i < n; i++) spawnRock(rng, 3, true);
  if (w >= 3) spawnEnemy(w);
}
function edgeSpawn(rng) {
  const side = Math.floor(rng() * 4);
  if (side === 0) return [-ARENA.x - 2, randRange(rng, -ARENA.y, ARENA.y)];
  if (side === 1) return [ARENA.x + 2, randRange(rng, -ARENA.y, ARENA.y)];
  if (side === 2) return [randRange(rng, -ARENA.x, ARENA.x), -ARENA.y - 2];
  return [randRange(rng, -ARENA.x, ARENA.x), ARENA.y + 2];
}
function spawnRock(rng, tier, atEdge, px = 0, py = 0, pz = 0) {
  const speedBase = 0.7 + game.wave * 0.18;
  let x = px, y = py, z = pz, vx, vy, vz;
  if (atEdge) {
    [x, y] = edgeSpawn(rng);
    z = randRange(rng, ARENA.zMin, 1);
    const tx = randRange(rng, -6, 6), ty = randRange(rng, -4, 4);
    const d = Math.hypot(tx - x, ty - y) || 1;
    const sp = speedBase * randRange(rng, 0.7, 1.35);
    vx = (tx - x) / d * sp; vy = (ty - y) / d * sp; vz = randRange(rng, -0.4, 0.4);
  } else {
    const a = rng() * TAU, sp = speedBase * randRange(rng, 1.0, 1.8);
    vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; vz = randRange(rng, -0.7, 0.7);
  }
  const scale = tier === 3 ? randRange(rng, 2.0, 2.55) : tier === 2 ? randRange(rng, 1.25, 1.6) : randRange(rng, 0.62, 0.86);
  game.rocks.push({
    x, y, z, vx, vy, vz,
    rx: rng() * TAU, ry: rng() * TAU,
    sx: randRange(rng, -1.2, 1.2), sy: randRange(rng, -1.2, 1.2),
    scale, tier, hp: tier, radius: scale * 1.02,
    variant: Math.floor(rng() * 7),
    tint: 0.82 + rng() * 0.36
  });
}
function spawnEnemy(w) {
  const side = Math.random() < 0.5 ? -1 : 1;
  game.enemies.push({
    x: side * (ARENA.x + 1), y: randRange(Math.random, -5, 5), z: -2,
    vx: -side * (1.4 + w * 0.12), t: 0, fireCd: 2.2, hp: 2 + Math.floor(w / 3), radius: 0.95
  });
  toast('⚠ Drone pemburu terdeteksi!');
  beep(160, 0.4, 'square', 0.5, -80);
}
function explode(x, y, z, color, count, power) {
  for (let i = 0; i < count; i++) {
    if (game.particles.length > 420) return;
    const a = Math.random() * TAU, b = (Math.random() - 0.5) * 3;
    const sp = (0.8 + Math.random() * 3.4) * power;
    game.particles.push({
      x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: b * sp * 0.5,
      life: 0, max: 0.45 + Math.random() * 0.8, size: 0.12 + Math.random() * 0.28,
      color, glow: 0.7 + Math.random() * 1.6
    });
  }
  game.rings.push({ x, y, z, r: 0.4, max: 2.4 + power * 1.5, life: 0, dur: 0.55, color });
  game.shake = Math.min(1.2, game.shake + 0.18 * power);
}
function addScore(n, x, y) {
  game.score += n;
  if (game.score > best) { updateBest(game.score); localStorage.setItem('asteroid3d-best', String(game.score)); }
}
function hitRock(rock, dmg, byPlayer = true) {
  rock.hp -= dmg;
  if (rock.hp > 0) { beep(180, 0.08, 'square', 0.25); return; }
  const val = rock.tier === 3 ? 20 : rock.tier === 2 ? 50 : 100;
  if (byPlayer) addScore(val, rock.x, rock.y);
  explode(rock.x, rock.y, rock.z, [1.0, 0.62, 0.25], rock.tier * 10 + 8, rock.tier * 0.55 + 0.6);
  noiseBurst(0.3, 0.55);
  game.rocks.splice(game.rocks.indexOf(rock), 1);
  if (rock.tier > 1) {
    const rng = mulberry((Math.random() * 1e9) | 0);
    const kids = rock.tier === 3 ? 2 : 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < kids; i++) spawnRock(rng, rock.tier - 1, false, rock.x, rock.y, rock.z);
  }
}
function damageShip() {
  const s = game.ship;
  if (!s || s.invuln > 0 || game.mode !== 'play') return;
  if (keys.shield && game.shieldEnergy > 12) {
    game.shieldEnergy -= 30;
    explode(s.x, s.y, s.z, [0.35, 0.9, 1.0], 18, 1.0);
    beep(300, 0.18, 'sawtooth', 0.4, -160);
    s.invuln = 0.8;
    return;
  }
  game.lives--;
  explode(s.x, s.y, s.z, [0.4, 0.95, 1.0], 70, 2.2);
  explode(s.x, s.y, s.z, [1.0, 0.45, 0.2], 40, 1.6);
  noiseBurst(0.7, 0.9);
  beep(90, 0.7, 'sawtooth', 0.6, -60);
  if (game.lives < 0) return gameOver();
  resetShip();
  game.ship.invuln = 3;
  game.shieldEnergy = Math.max(game.shieldEnergy, 50);
  toast('Kapal cadangan diluncurkan!');
}
function gameOver() {
  game.mode = 'over';
  finalStats.textContent = `Skor ${game.score} • Gelombang ${game.wave} • Terbaik ${best}`;
  overEl.hidden = false;
  beep(140, 0.9, 'sawtooth', 0.5, -100);
}
game.shieldEnergy = 100;

function wrap(o) {
  if (o.x < -ARENA.x - 2) o.x = ARENA.x + 2; if (o.x > ARENA.x + 2) o.x = -ARENA.x - 2;
  if (o.y < -ARENA.y - 2) o.y = ARENA.y + 2; if (o.y > ARENA.y + 2) o.y = -ARENA.y - 2;
}
function update(dt) {
  game.time += dt;
  const s = game.ship;
  if (game.mode === 'play' && s) {
    if (keys.left) s.angle += 3.4 * dt;
    if (keys.right) s.angle -= 3.4 * dt;
    const dx = Math.cos(s.angle), dy = Math.sin(s.angle);
    if (keys.thrust) {
      s.vx += dx * 13 * dt; s.vy += dy * 13 * dt;
      s.thrustFx = Math.min(1, s.thrustFx + dt * 6);
      if (Math.random() < 0.55) game.particles.push({
        x: s.x - dx * 1.1, y: s.y - dy * 1.1, z: s.z - 0.05,
        vx: -dx * 3 + (Math.random()-0.5), vy: -dy * 3 + (Math.random()-0.5), vz: (Math.random()-0.5),
        life: 0, max: 0.35 + Math.random() * 0.25, size: 0.16 + Math.random() * 0.16,
        color: Math.random() < 0.5 ? [0.35,0.9,1] : [1.0,0.55,0.2], glow: 1.7
      });
    } else s.thrustFx = Math.max(0, s.thrustFx - dt * 4);
    if (keys.brake) { s.vx *= (1 - 1.8 * dt); s.vy *= (1 - 1.8 * dt); }
    s.vx *= (1 - 0.18 * dt); s.vy *= (1 - 0.18 * dt);
    const sp = Math.hypot(s.vx, s.vy), max = 10;
    if (sp > max) { s.vx *= max / sp; s.vy *= max / sp; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.z = Math.sin(game.time * 1.7) * 0.08;
    s.fireCd -= dt; s.invuln = Math.max(0, s.invuln - dt);
    wrap(s);
    const wantShield = keys.shield && game.shieldEnergy > 1;
    if (wantShield) game.shieldEnergy = Math.max(0, game.shieldEnergy - 26 * dt);
    else game.shieldEnergy = Math.min(100, game.shieldEnergy + 12 * dt);
    if (keys.fire && s.fireCd <= 0) {
      s.fireCd = 0.14;
      game.bullets.push({ x: s.x + dx * 1.2, y: s.y + dy * 1.2, z: s.z, vx: dx * 22 + s.vx * 0.35, vy: dy * 22 + s.vy * 0.35, life: 1.15, angle: s.angle });
      beep(760 + Math.random() * 120, 0.08, 'square', 0.22, 220);
    }
    for (const r of game.rocks) {
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      r.rx += r.sx * dt; r.ry += r.sy * dt;
      if (r.z < ARENA.zMin || r.z > ARENA.zMax) r.vz *= -1;
      wrap(r);
      if (Math.hypot(r.x - s.x, r.y - s.y) < r.radius + s.radius * 0.72 && Math.abs(r.z - s.z) < 2.4) damageShip();
    }
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const b = game.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || Math.abs(b.x) > ARENA.x + 4 || Math.abs(b.y) > ARENA.y + 4;
      if (!dead) {
        for (let ri = game.rocks.length - 1; ri >= 0; ri--) {
          const r = game.rocks[ri];
          if (Math.hypot(r.x - b.x, r.y - b.y) < r.radius + 0.25 && Math.abs(r.z - b.z) < 2.6) {
            hitRock(r, 1, true); dead = true; break;
          }
        }
        if (!dead) for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
          const e = game.enemies[ei];
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + 0.25) {
            e.hp--; dead = true; explode(b.x, b.y, b.z, [1,0.4,0.5], 10, 0.7); beep(240,0.1,'square',0.3);
            if (e.hp <= 0) { addScore(250); explode(e.x,e.y,e.z,[1,0.35,0.45],60,1.8); noiseBurst(0.5,0.7); game.enemies.splice(game.enemies.indexOf(e),1); toast('+250 drone hancur'); }
            break;
          }
        }
      }
      if (dead) game.bullets.splice(i, 1);
    }
    for (const e of game.enemies) {
      e.t += dt;
      e.x += e.vx * dt;
      e.y += Math.sin(e.t * 2.1) * 1.2 * dt * 2;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && Math.abs(e.x) < ARENA.x + 1) {
        e.fireCd = Math.max(0.9, 2.4 - game.wave * 0.12);
        const a = Math.atan2(s.y - e.y, s.x - e.x);
        game.enemyBullets.push({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 2.4 });
        beep(190, 0.16, 'sawtooth', 0.28, -60);
      }
      if (e.x < -ARENA.x - 3 || e.x > ARENA.x + 3) e.vx *= -1;
      if (Math.hypot(e.x - s.x, e.y - s.y) < e.radius + s.radius) damageShip();
    }
    for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
      const b = game.enemyBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || Math.abs(b.x) > ARENA.x + 4 || Math.abs(b.y) > ARENA.y + 4;
      if (!dead && Math.hypot(b.x - s.x, b.y - s.y) < 0.55) { damageShip(); dead = true; }
      if (dead) game.enemyBullets.splice(i, 1);
    }
    if (game.rocks.length === 0 && game.enemies.length === 0) {
      game.pendingWaveTimer += dt;
      if (game.pendingWaveTimer > 1.4) {
        game.pendingWaveTimer = 0; game.wave++;
        addScore(100 * game.wave);
        spawnWave(game.wave);
        toast(`Gelombang ${game.wave} dimulai! Bonus ${100 * game.wave}`);
        beep(330, 0.3, 'square', 0.4, 330);
      }
    } else game.pendingWaveTimer = 0;
  }
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.life += dt;
    if (p.life >= p.max) { game.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vx *= (1 - 1.4 * dt); p.vy *= (1 - 1.4 * dt);
  }
  for (let i = game.rings.length - 1; i >= 0; i--) {
    const r = game.rings[i];
    r.life += dt;
    r.r += (r.max - r.r) * 5 * dt;
    if (r.life >= r.dur) game.rings.splice(i, 1);
  }
  game.shake = Math.max(0, game.shake - dt * 2.4);
}

export { resetShip, startGame, update, gameOver };
