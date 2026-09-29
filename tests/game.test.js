import assert from 'node:assert/strict';
import test from 'node:test';

class MockElement {
  constructor(id, dataset = {}) {
    this.id = id;
    this.dataset = dataset;
    this.hidden = false;
    this.textContent = '';
    this.style = {};
    this.handlers = new Map();
  }

  addEventListener(type, handler) {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  dispatch(type, properties = {}) {
    const event = {
      code: '',
      preventDefault() {},
      target: this,
      ...properties
    };
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }

  click() {
    this.dispatch('click');
  }
}

const elements = new Map();
const touchButtons = ['left', 'right', 'shield', 'thrust', 'fire'].map(key => new MockElement(key, { k: key }));
const windowHandlers = new Map();

globalThis.localStorage = {
  values: new Map(),
  getItem(key) {
    return this.values.get(key) ?? null;
  },
  setItem(key, value) {
    this.values.set(key, String(value));
  }
};

globalThis.document = {
  hidden: false,
  addEventListener() {},
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new MockElement(id));
    return elements.get(id);
  },
  querySelectorAll(selector) {
    return selector === '#touch button' ? touchButtons : [];
  }
};

globalThis.window = {
  addEventListener(type, handler) {
    const handlers = windowHandlers.get(type) ?? [];
    handlers.push(handler);
    windowHandlers.set(type, handlers);
  }
};

function dispatchWindow(type, properties) {
  const event = { preventDefault() {}, ...properties };
  for (const handler of windowHandlers.get(type) ?? []) handler(event);
}

function rock(overrides = {}) {
  return {
    x: 4,
    y: 4,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rx: 0,
    ry: 0,
    sx: 0,
    sy: 0,
    scale: 0.7,
    tier: 1,
    hp: 1,
    radius: 0.72,
    variant: 0,
    tint: 1,
    ...overrides
  };
}

const { game, keys } = await import('../state.js');
const { gameOver, startGame, update } = await import('../gameplay.js');
await import('../input.js');

test('gameplay and input regressions', async t => {
  await t.test('starts from the keyboard and initializes the first wave', () => {
    dispatchWindow('keydown', { code: 'Enter' });

    assert.equal(game.mode, 'play');
    assert.equal(game.paused, false);
    assert.equal(game.wave, 1);
    assert.equal(game.lives, 3);
    assert.equal(game.rocks.length, 5);
    assert.equal(elements.get('menu').hidden, true);
  });

  await t.test('keyboard controls thrust, fire, and shield energy', () => {
    startGame();
    dispatchWindow('keydown', { code: 'KeyW' });
    dispatchWindow('keydown', { code: 'Space' });
    dispatchWindow('keydown', { code: 'ShiftLeft' });
    const startingEnergy = game.shieldEnergy;

    for (let frame = 0; frame < 10; frame++) update(0.02);

    assert.ok(Math.hypot(game.ship.vx, game.ship.vy) > 0);
    assert.ok(game.bullets.length > 0);
    assert.ok(game.shieldEnergy < startingEnergy);

    dispatchWindow('keyup', { code: 'KeyW' });
    dispatchWindow('keyup', { code: 'Space' });
    dispatchWindow('keyup', { code: 'ShiftLeft' });
    assert.equal(keys.thrust, false);
    assert.equal(keys.fire, false);
    assert.equal(keys.shield, false);
  });

  await t.test('keyboard pause toggles the pause overlay and resumes play', () => {
    startGame();
    dispatchWindow('keydown', { code: 'KeyP' });

    assert.equal(game.paused, true);
    assert.equal(elements.get('pauseMenu').hidden, false);

    dispatchWindow('keydown', { code: 'KeyP' });
    assert.equal(game.paused, false);
    assert.equal(elements.get('pauseMenu').hidden, true);
  });

  await t.test('pointer controls hold and release touch actions', () => {
    const thrustButton = touchButtons.find(button => button.dataset.k === 'thrust');
    thrustButton.dispatch('pointerdown', { pointerId: 1 });
    assert.equal(keys.thrust, true);
    thrustButton.dispatch('pointerup', { pointerId: 1 });
    assert.equal(keys.thrust, false);
  });

  await t.test('asteroid destruction awards score and persists the best score', () => {
    startGame();
    game.rocks = [rock({ x: 4, y: 4 })];
    game.bullets = [{ x: 4, y: 4, z: 0, vx: 0, vy: 0, life: 1, angle: 0 }];

    update(0.01);

    assert.equal(game.rocks.length, 0);
    assert.equal(game.bullets.length, 0);
    assert.equal(game.score, 100);
    assert.equal(localStorage.getItem('asteroid3d-best'), '100');
  });

  await t.test('collision costs a life and shield blocks collision damage', () => {
    startGame();
    game.ship.invuln = 0;
    game.rocks = [rock({ x: 0, y: 0, z: 0 })];
    update(0.01);
    assert.equal(game.lives, 2);
    assert.ok(game.ship.invuln > 0);

    startGame();
    game.ship.invuln = 0;
    game.rocks = [rock({ x: 0, y: 0, z: 0 })];
    keys.shield = true;
    const startingEnergy = game.shieldEnergy;
    update(0.01);
    keys.shield = false;

    assert.equal(game.lives, 3);
    assert.ok(game.shieldEnergy < startingEnergy);
  });

  await t.test('clearing a wave awards a bonus and spawns the next wave', () => {
    startGame();
    game.rocks = [];
    game.enemies = [];

    for (let frame = 0; frame < 5; frame++) update(0.3);

    assert.equal(game.wave, 2);
    assert.equal(game.score, 200);
    assert.equal(game.rocks.length, 6);
  });

  await t.test('enemy drones fire after their cooldown', () => {
    startGame();
    game.wave = 3;
    game.enemies = [{ x: 0, y: 3, z: -2, vx: 0, t: 0, fireCd: 0.01, hp: 2, radius: 0.95 }];

    update(0.03);

    assert.equal(game.enemyBullets.length, 1);
  });

  await t.test('game over displays the overlay and restart resets the game', () => {
    startGame();
    game.score = 500;
    gameOver();
    assert.equal(game.mode, 'over');
    assert.equal(elements.get('gameOver').hidden, false);

    elements.get('againBtn').click();
    assert.equal(game.mode, 'play');
    assert.equal(game.score, 0);
    assert.equal(game.lives, 3);
    assert.equal(game.wave, 1);
    assert.equal(elements.get('gameOver').hidden, true);
  });
});
