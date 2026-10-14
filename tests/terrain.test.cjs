const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../assets/vendor/three.min.js');

function terrain() {
  const ctx = vm.createContext({ THREE, Math, scene: new THREE.Scene(), state: {
    pos: new THREE.Vector3(0, 1.65, 4), keys: {}, yaw: 0, pitch: 0, bob: 0,
    started: true, view: 'world'
  }, camera: new THREE.PerspectiveCamera(),
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    audio: { step() {}, beep() {} }, getTension: () => 0, shakeEnabled: false,
    yawTarget: 0, pitchTarget: 0, npcs: [], teacher: null,
    smoothAmount: 0, renderer: null, minimap: null, mmCtx: null
  });
  const core = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
  vm.runInContext(core.slice(core.indexOf('const geoCache'), core.indexOf('/* ---------- 音频')), ctx);
  for (const file of ['gameplay', 'terrain', 'navigation', 'look', 'campaign']) {
    const p = path.join(__dirname, `../js/${file}.js`);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
  }
  assert.equal(typeof ctx.groundHeight, 'function', 'playable terrain needs ground sampling');
  return ctx;
}
function raised(ctx) {
  ctx.addTerrainPlatform(0, 0, 3, 2, 0.8);
  ctx.addTerrainRamp(0, 2.6, 2, 3.2, 0.8, 'z', -1);
}

test('bounded platform and ramp sample flat, sloped and raised ground', () => {
  const ctx = terrain(); raised(ctx);
  for (const [x, z, h] of [[0, 0, 0.8], [0, 1, 0.8], [0, 2.6, 0.4], [0, 4.2, 0], [3, 0, 0]]) {
    assert.ok(Math.abs(ctx.groundHeight(x, z) - h) < 1e-8, `${x},${z}`);
  }
  ctx.clearTerrain();
  assert.equal(ctx.groundHeight(0, 0), 0, 'removed scenes must not leave invisible raised ground');
});

test('walking rejects platform cliffs and accepts its connected ramp', () => {
  const ctx = terrain(); raised(ctx);
  assert.equal(ctx.terrainSegmentClear({ x: 2, z: 0 }, { x: 0, z: 0 }, 0.28), false);
  assert.equal(ctx.terrainSegmentClear({ x: 0, z: 4.5 }, { x: 0, z: 0 }, 0.28), true);
  assert.equal(ctx.terrainSegmentClear({ x: 0, z: 0 }, { x: -2, z: 0 }, 0.28), false);
});

test('a steep ramp cannot become a walkable shortcut across elevations', () => {
  const ctx = terrain();
  ctx.addTerrainRamp(0, 0, 2, 1, 0.8);
  assert.equal(ctx.terrainSegmentClear({ x: 0, z: -0.2 }, { x: 0, z: 0.2 }, 0.28), false);
});

test('guard flow field routes to the ramp instead of teleporting up the cliff', () => {
  const ctx = terrain(); raised(ctx);
  const nav = ctx.createGuardNavigation({ w: 10, d: 12 }, []);
  const p = { x: 2.5, z: 0 }, goal = { x: 0, z: 0 };
  assert.equal(ctx.navigationSegmentClear(nav, p, goal), false);
  let highestZ = 0;
  for (let i = 0; i < 1200; i++) {
    const next = ctx.navigationTarget(nav, p, goal);
    assert.ok(next, 'high platform must be reachable by ramp');
    const dx = next.x - p.x, dz = next.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.01) break;
    const step = Math.min(2 / 60, d), dest = { x: p.x + dx / d * step, z: p.z + dz / d * step };
    assert.equal(ctx.navigationSegmentClear(nav, p, dest), true);
    p.x = dest.x; p.z = dest.z; highestZ = Math.max(highestZ, p.z);
  }
  assert.ok(highestZ > 3.8, 'route must visit the low end of the ramp');
  assert.ok(Math.hypot(p.x, p.z) < 0.15, JSON.stringify(p));
});

test('player walks up ramps with state and camera at raised eye height', () => {
  const ctx = terrain(); raised(ctx);
  ctx.resetPlayer(0, 4.5); ctx.state.keys.w = true;
  for (let i = 0; i < 80; i++) ctx.updatePlayer(1 / 60);
  assert.ok(ctx.state.pos.z < 0.5);
  assert.ok(Math.abs(ctx.state.pos.y - 2.45) < 0.001);
  assert.ok(Math.abs(ctx.camera.position.y - 2.45) < 0.03);
  ctx.resetPlayer(2, 0); ctx.state.keys.a = true; ctx.state.keys.w = false;
  for (let i = 0; i < 50; i++) ctx.updatePlayer(1 / 60);
  assert.ok(ctx.state.pos.x > 1.5, 'walking cannot climb a vertical edge');
  assert.equal(ctx.state.pos.y, 1.65);
});

test('jump height is visible and lands on the raised floor', () => {
  const ctx = terrain(); raised(ctx); ctx.resetPlayer(0, 0);
  ctx.tryJump(); ctx.updatePlayer(0.1);
  assert.ok(ctx.camera.position.y > 2.85, 'camera must display actual jump height');
  for (let i = 0; i < 80; i++) ctx.updatePlayer(1 / 60);
  assert.ok(Math.abs(ctx.state.pos.y - 2.45) < 0.001);
  assert.ok(vm.runInContext('onGround && jumpY === 0.8', ctx));
});

test('campus raised surfaces leave exits reachable in every section', () => {
  const ctx = terrain();
  for (let index = 0; index < 3; index++) {
    ctx.clearTerrain(); vm.runInContext('obstacles.length = 0', ctx); ctx.buildRaisedTerrain(index);
    const b = index === 2 ? { w: 24, d: 20, minZ: -9.5, maxZ: 9.5 }
      : { w: 8, d: 24, minZ: index ? -9.6 : -1.4, maxZ: index ? -2.5 : 11.5 };
    const start = { x: 0, z: index === 2 ? 7.5 : index ? -3.2 : 10 };
    const end = { x: 0, z: index === 2 ? -8 : index ? -9.4 : -1.2 };
    const nav = ctx.createGuardNavigation(b, vm.runInContext('obstacles', ctx));
    assert.ok(ctx.navigationSegmentClear(nav, start, end), `section ${index} center lane should remain open`);
    assert.ok(ctx.groundHeight(index === 2 ? -5.4 : index ? 2.65 : -2.65, index === 2 ? 1.8 : index ? -6.3 : 4.6) >= 0.6);
    const targets = index === 2 ? [{ x: -5.4, z: 1.8 }, { x: 5.2, z: -3.6 }]
      : [{ x: index ? 2.65 : -2.65, z: index ? -6.3 : 4.6 }];
    for (const goal of targets){
      const p = { ...start };
      for (let i = 0; i < 1200; i++){
        const next = ctx.navigationTarget(nav, p, goal);
        assert.ok(next, `section ${index} has an unreachable high platform`);
        const dx = next.x - p.x, dz = next.z - p.z, distance = Math.hypot(dx, dz);
        if (distance < 0.01) break;
        const step = Math.min(distance, 0.05);
        p.x += dx / distance * step; p.z += dz / distance * step;
      }
      assert.ok(Math.hypot(p.x - goal.x, p.z - goal.z) < 0.15, `section ${index}: ${JSON.stringify(p)}`);
    }
  }
});

test('scene reset removes terrain samples and resets player ground height', () => {
  const ctx = terrain(); raised(ctx); ctx.resetPlayer(0, 0);
  Object.assign(ctx, { stopBattle() {}, resetFirearms() {}, dismissDialogs() {}, endSlowMo() {},
    guardLights: [], securityGuards: [], chairs: [], interactables: [], deskScreens: [], contactShadows: [],
    debrisList: [], _shadowGeo: null, _shadowTex: null, slowMoDlg: null, hitStop: 0,
    tPoints: [], tension: 0, nearestGuardDist: Infinity, actionE: null, actionF: null, actionSpace: null,
    postPrimed: false, doorGroup: null, doorLightMesh: null, doorGlowMesh: null, doorFloorMesh: null,
    doorPointLight: null, doorOpenT: 0
  });
  ctx.clearLevel(); ctx.resetPlayer(0, 0);
  assert.equal(ctx.groundHeight(0, 0), 0);
  assert.equal(ctx.state.pos.y, 1.65);
  assert.equal(ctx.camera.position.y, 1.65);
});
