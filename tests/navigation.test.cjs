const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function navigation(obstacles = []) {
  const ctx = vm.createContext({ state: {}, Math });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/gameplay.js'), 'utf8'), ctx);
  const file = path.join(__dirname, '../js/navigation.js');
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  assert.equal(typeof ctx.createGuardNavigation, 'function', 'navigation must route around obstacles');
  const nav = ctx.createGuardNavigation({ w: 10, d: 10 }, obstacles);
  return { ctx, nav };
}
function walk(ctx, nav, from, target, seconds = 15) {
  const p = { ...from };
  for (let i = 0; i < seconds * 60; i++) {
    const next = ctx.navigationTarget(nav, p, target);
    if (!next) break;
    const dx = next.x - p.x, dz = next.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.01) break;
    const step = Math.min(2 / 60, d);
    const x = p.x + dx / d * step, z = p.z + dz / d * step;
    assert.equal(ctx.navigationSegmentClear(nav, p, { x, z }), true, 'movement must not cut corners');
    p.x = x; p.z = z;
  }
  return p;
}
test('guard gets around a desk directly between it and player', () => {
  const { ctx, nav } = navigation([{ x: 0, z: 0, hw: 1.5, hd: 0.6 }]);
  const p = walk(ctx, nav, { x: 0, z: 3 }, { x: 0, z: -3 });
  assert.ok(Math.hypot(p.x, p.z + 3) < 0.15, JSON.stringify(p));
});
test('guard follows an L-shaped passage without crossing wall corners', () => {
  const { ctx, nav } = navigation([
    { x: 0, z: 1, hw: 0.2, hd: 3 },
    { x: 1, z: -2, hw: 1.2, hd: 0.2 }
  ]);
  const p = walk(ctx, nav, { x: -2, z: 3 }, { x: 3, z: -3 });
  assert.ok(Math.hypot(p.x - 3, p.z + 3) < 0.15, JSON.stringify(p));
});
test('navigation changes direction when player changes location', () => {
  const { ctx, nav } = navigation([{ x: 0, z: 0, hw: 1, hd: 1 }]);
  const p = walk(ctx, nav, { x: 0, z: 3 }, { x: 3, z: 0 }, 1);
  const result = walk(ctx, nav, p, { x: -3, z: 0 });
  assert.ok(Math.hypot(result.x + 3, result.z) < 0.15);
});
test('target inside desk resolves to a reachable edge without walking through it', () => {
  const { ctx, nav } = navigation([{ x: 0, z: 0, hw: 1, hd: 1 }]);
  const p = walk(ctx, nav, { x: 0, z: 3 }, { x: 0, z: 0 });
  assert.ok(Math.hypot(p.x, p.z) < 2);
  assert.ok(Math.abs(p.x) >= 1.3 || Math.abs(p.z) >= 1.3);
});
test('guards cannot route out of stage boundaries or across a sealed wall', () => {
  const { ctx, nav } = navigation([{ x: 0, z: 0, hw: 5, hd: 0.2 }]);
  assert.equal(ctx.navigationSegmentClear(nav, { x: 0, z: 2 }, { x: 6, z: 2 }), false);
  assert.equal(ctx.navigationTarget(nav, { x: 0, z: 2 }, { x: 0, z: -2 }), null);
});
test('guard speed settings accept live values and reject malformed inputs', () => {
  const c = vm.createContext({ state: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/gameplay.js'), 'utf8'), c);
  assert.equal(c.normalizeGameOptions({ guardSpeed: 100 }).guardSpeed, 10);
  assert.equal(c.normalizeGameOptions({ guardSpeed: -1 }).guardSpeed, 0.5);
  assert.equal(c.normalizeGameOptions({ guardSpeed: 'bad' }).guardSpeed, 1.5);
  assert.equal(c.normalizeGameOptions(null).guardSpeed, 1.5);
});

function chase() {
  const { ctx, nav } = navigation();
  const g = { group: { position: { x: 0, z: 4 }, rotation: {} }, userData: { alive: true, navSlot: 0 } };
  Object.assign(ctx, { obstacles: [], securityGuards: [g] });
  Object.assign(ctx.state, { pos: { x: 0, z: 0 }, started: true, view: 'world', hp: 3 });
  ctx.hasDialog = () => false;
  vm.runInContext('guardNavigation = createGuardNavigation({ w: 10, d: 10 }, obstacles); guardNavPlayer = { x: 0, z: 0 };', ctx);
  return { ctx, g, nav };
}
test('stable flank slots send guards to different sides of the player', () => {
  const { ctx, g } = chase();
  const a = ctx.guardSurroundTarget(g, 0);
  g.userData.navSlot = 4;
  const b = ctx.guardSurroundTarget(g, 0);
  assert.equal(a.x, 2); assert.equal(b.x, -2);
});
test('changing guard speed during a run immediately changes travel distance', () => {
  const { ctx, g } = chase();
  vm.runInContext('gameOptions.guardSpeed = 0.5', ctx);
  ctx.moveGuard(g, 0, 0.1);
  const slow = Math.hypot(g.group.position.x, g.group.position.z - 4);
  g.group.position.x = 0; g.group.position.z = 4;
  vm.runInContext('gameOptions.guardSpeed = 10', ctx);
  ctx.moveGuard(g, 0, 0.1);
  const fast = Math.hypot(g.group.position.x, g.group.position.z - 4);
  assert.ok(slow > 0.04 && slow < 0.06);
  assert.ok(fast > 0.95 && fast < 1.05);
});
test('blocked surrounding slots still close in on the player', () => {
  const { ctx, g } = chase();
  ctx.obstacles.push({ x: 2, z: 0, hw: 0.5, hd: 0.5 });
  ctx.resetGuardNavigation();
  for (let i = 0; i < 900; i++) { ctx.updateGuardNavigation(1 / 60); ctx.moveGuard(g, 0, 1 / 60); }
  assert.ok(Math.hypot(g.group.position.x, g.group.position.z) < 0.6, JSON.stringify(g.group.position));
});
test('taking damage does not push the attacking guard into a wall', () => {
  const { ctx, g } = chase();
  ctx.obstacles.push({ x: 0, z: 1.7, hw: 1, hd: 0.1 });
  ctx.resetGuardNavigation(); ctx.updateGuardNavigation(0);
  g.group.position.x = 0; g.group.position.z = 0.8;
  Object.assign(ctx, { redFlash: null, audio: { beep() {} }, toast() {}, $: () => null });
  ctx.state.hpVisible = true;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/hp.js'), 'utf8'), ctx);
  assert.equal(ctx.damagePlayer(g, 1), true);
  assert.equal(ctx.state.hp, 2);
  assert.ok(g.group.position.z < 1.3, 'knockback must stop before the wall');
});
test('a surrounding crowd keeps space between guards rather than stacking on player', () => {
  const { ctx } = chase();
  ctx.securityGuards.length = 0;
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    ctx.securityGuards.push({ group: { position: { x: Math.cos(angle) * 3, z: Math.sin(angle) * 3 }, rotation: {} },
      userData: { alive: true, navSlot: i, speedFactor: 1 } });
  }
  for (let frame = 0; frame < 600; frame++) {
    ctx.updateGuardNavigation(1 / 60);
    ctx.securityGuards.forEach((g, i) => ctx.moveGuard(g, i, 1 / 60));
  }
  let closest = Infinity;
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
    const a = ctx.securityGuards[i].group.position, b = ctx.securityGuards[j].group.position;
    closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
  }
  assert.ok(closest > 0.25, `guards only ${closest}m apart`);
  assert.ok(ctx.securityGuards.some(g => Math.hypot(g.group.position.x, g.group.position.z) < 0.95), 'crowd must still get close enough to attack');
});
test('fast guards keep separation even at ten frames per second', () => {
  const { ctx } = chase(); ctx.securityGuards.length = 0;
  vm.runInContext('gameOptions.guardSpeed = 10', ctx);
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    ctx.securityGuards.push({ group: { position: { x: Math.cos(angle) * 3, z: Math.sin(angle) * 3 }, rotation: {} },
      userData: { alive: true, navSlot: i, speedFactor: 1 } });
  }
  let closest = Infinity;
  for (let frame = 0; frame < 200; frame++) {
    ctx.updateGuardNavigation(0.1);
    ctx.securityGuards.forEach((g, i) => ctx.moveGuard(g, i, 0.1));
    for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
      const a = ctx.securityGuards[i].group.position, b = ctx.securityGuards[j].group.position;
      closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  assert.ok(closest > 0.25, `fast guards crossed within ${closest}m`);
  assert.ok(ctx.securityGuards.some(g => Math.hypot(g.group.position.x, g.group.position.z) < 0.95));
});
