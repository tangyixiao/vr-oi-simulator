const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function rules() {
  const c = vm.createContext({
    state: {},
    localStorage: {
      getItem() {
        return null;
      }
    },
    performance: {
      now() {
        return 0;
      }
    }
  });
  const f = path.join(__dirname, '../js/gameplay.js');
  if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, 'utf8'), c);
  return c;
}
test('custom counts are bounded and malformed settings recover defaults', () => {
  const c = rules();
  assert.equal(c.normalizeGameOptions({ guardTarget: 1 }).guardTarget, 50);
  assert.equal(
    c.normalizeGameOptions({ guardTarget: 99999 }).guardTarget,
    5000
  );
  assert.equal(
    c.normalizeGameOptions({ guardTarget: 'oops' }).guardTarget,
    200
  );
  assert.equal(c.normalizeGameOptions(null).combatMode, 'power');
});
test('challenge distinguishes frontal fists and wider chairs without cooldown', () => {
  const c = rules(),
    p = { x: 0, z: 0 };
  const fist = c.attackProfile({ combatMode: 'challenge' }, 'fist'),
    chair = c.attackProfile({ combatMode: 'challenge' }, 'chair');
  assert.equal(c.targetInAttackRange(p, 0, { x: 0, z: -3 }, fist), false);
  assert.equal(c.targetInAttackRange(p, 0, { x: 0, z: -3 }, chair), true);
  assert.equal(c.targetInAttackRange(p, 0, { x: 0, z: 1 }, chair), false);
  assert.equal(c.targetInAttackRange(p, 0, { x: 2, z: -2 }, fist), false);
  assert.equal(
    c.targetInAttackRange(
      p,
      0,
      { x: 100, z: 0 },
      c.attackProfile({ combatMode: 'power' }, 'chair')
    ),
    true
  );
});
test('second chapter splits quotas exactly even at minimum and odd counts', () => {
  const c = rules();
  for (const n of [50, 51, 200, 501, 5000]) {
    const q = c.stageQuotas(n);
    assert.equal(
      q.reduce((a, b) => a + b, 0),
      Math.ceil(n / 2)
    );
    assert.ok(q.every((x) => x > 0));
  }
});
test('spawn batches never overshoot finite quotas, cap or batch size', () => {
  const c = rules();
  assert.equal(c.spawnAllowance(199, 0, 200, 64), 1);
  assert.equal(c.spawnAllowance(200, 0, 200, 64), 0);
  assert.equal(c.spawnAllowance(8, 63, 200, 64), 1);
  assert.equal(c.spawnAllowance(100000, 0, Infinity, 24), 8);
  assert.equal(c.spawnAllowance(20, 24, Infinity, 24), 0);
});

test('real guard scheduler respects quota, clears dead references and does not spawn after stop', () => {
  const c = rules();
  Object.assign(c, {
    securityGuards: [],
    GUARD_SPEED_BASE: 0.55,
    buildSecurityGuard: (x, z) => ({ group: { position: { x, z } } }),
    findGuardSpawn: () => ({ x: 4, z: 4 })
  });
  const world = fs.readFileSync(path.join(__dirname, '../js/world.js'), 'utf8');
  const from = world.indexOf('function guardPoolRemaining()'),
    to = world.indexOf('function findGuardSpawn()');
  vm.runInContext(world.slice(from, to), c);
  c.findGuardSpawn = () => ({ x: 4, z: 4 });
  Object.assign(c.state, {
    started: true,
    view: 'world',
    guardKills: 0,
    guardsSpawned: 0
  });
  c.hasDialog = () => false;
  c.beginBattle('classroom', 50);
  for (let i = 0; i < 30; i++) {
    c.updateBattle(0.3);
    for (const g of c.securityGuards) g.userData.alive = false;
  }
  assert.equal(c.state.guardsSpawned, 50);
  assert.equal(c.guardPoolRemaining(), 0);
  c.beginBattle('endless', Infinity);
  c.updateBattle(0.3);
  const count = c.state.guardsSpawned;
  c.stopBattle();
  c.updateBattle(10);
  assert.equal(c.state.guardsSpawned, count);
});

test('paused and dialog views do not advance spawning', () => {
  const c = rules();
  Object.assign(c.state, { started: true, view: 'pause' });
  let spawnCount = 0;
  c.spawnTwoGuards = () => spawnCount++;
  c.hasDialog = () => false;
  c.beginBattle('endless', Infinity);
  c.updateBattle(10);
  assert.equal(spawnCount, 0);
  c.state.view = 'world';
  c.hasDialog = () => true;
  c.updateBattle(10);
  assert.equal(spawnCount, 0);
  c.hasDialog = () => false;
  c.updateBattle(0.3);
  assert.equal(spawnCount, 1);
});
