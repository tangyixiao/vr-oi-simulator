const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../assets/vendor/three.min.js');
function game() {
  const storage = new Map(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.65, 0);
  const c = vm.createContext({ THREE, scene, camera, matCache: new Map(), geoCache: new Map(),
    _shadowGeo: null, _shadowTex: null, shakeEnabled: false,
    state: { guardKills: 0 }, securityGuards: [], guardLights: [],
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    spawnBodyDebris() {},
  });
  for (const name of ['gameplay', 'combat']) vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${name}.js`), 'utf8'), c);
  const core = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
  vm.runInContext(core.slice(core.indexOf('function disposeOwnedMaterials('), core.indexOf('\nfunction mat(')), c);
  const campaign = fs.readFileSync(path.join(__dirname, '../js/campaign.js'), 'utf8');
  vm.runInContext(campaign.slice(campaign.indexOf('function disposeLevelObject('), campaign.indexOf('\nfunction clearLevel(')), c);
  return c;
}
function guard(c) {
  const g = { group: new THREE.Group(), userData: { alive: true } };
  c.scene.add(g.group); c.securityGuards.push(g);
  if (typeof c.initGuardHealth === 'function') c.initGuardHealth(g);
  return g;
}
test('guard health settings clamp, use ten-point increments and persist independently of run config', () => {
  const c = game();
  for (const [input, want] of [[undefined, 100], ['bad', 100], [null, 100], [5, 10], [136, 140], [9999, 2000]]) {
    assert.equal(c.normalizeGameOptions({ guardHealth: input }).guardHealth, want);
  }
  vm.runInContext('gameOptions.guardHealth = 320; saveGameOptions(); gameOptions.guardHealth = 100; loadGameOptions()', c);
  assert.equal(vm.runInContext('gameOptions.guardHealth', c), 320);
});
test('each guard tracks damage separately and deaths count once only when health reaches zero', () => {
  const c = game(), a = guard(c), b = guard(c);
  assert.equal(c.damageGuard?.(a, 35), false);
  assert.equal(a.userData.hp, 65); assert.equal(b.userData.hp, 100);
  assert.equal(c.state.guardKills, 0);
  assert.equal(c.damageGuard(a, 70), true);
  assert.equal(a.userData.hp, 0); assert.equal(a.userData.alive, false);
  assert.equal(c.damageGuard(a, 70), false);
  assert.equal(c.state.guardKills, 1);
  assert.equal(b.userData.alive, true);
});
test('live max health changes preserve a wounded guard fraction and initialize new guards full', () => {
  const c = game(), a = guard(c); c.damageGuard?.(a, 60);
  vm.runInContext('gameOptions.guardHealth = 300', c);
  c.syncGuardHealth?.(a);
  assert.equal(a.userData.hp, 120); assert.equal(a.userData.maxHp, 300);
  const b = guard(c); assert.equal(b.userData.hp, 300);
  vm.runInContext('gameOptions.guardHealth = 50', c);
  c.syncGuardHealth(a); assert.equal(a.userData.hp, 20);
  c.damageGuard(a, 18); assert.equal(a.userData.hp, 2);
  assert.equal(b.userData.hp, 300);
  c.syncGuardHealth(b); assert.equal(b.userData.hp, 50);
});
test('invalid damage cannot heal, corrupt health, or count a death', () => {
  const c = game(), g = guard(c);
  for (const amount of [0, -5, NaN, Infinity, '20']) assert.equal(c.damageGuard?.(g, amount), false);
  assert.equal(g.userData.hp, 100); assert.equal(c.state.guardKills, 0);
});
test('wounded guards share world-bar assets which are ignored by shots and remain reusable after removal', () => {
  const c = game(), a = guard(c), b = guard(c);
  c.damageGuard?.(a, 60); c.damageGuard?.(b, 35);
  assert.equal(a.healthBar?.visible, true);
  assert.equal(a.healthBar.userData.shotIgnore, true);
  assert.equal(a.healthFill.scale.x, 0.4);
  assert.equal(b.healthFill.scale.x, 0.65);
  assert.equal(a.healthFill.geometry, b.healthFill.geometry);
  assert.equal(a.healthFill.material, b.healthFill.material);
  let disposed = false; a.healthFill.material.addEventListener('dispose', () => { disposed = true; });
  c.disposeOwnedMaterials(a.group); assert.equal(disposed, false);
  c.damageGuard(a, 60); assert.equal(a.healthBar.parent, null);
  assert.equal(b.healthBar.visible, true);
});
test('changing stages does not dispose shared guard-health geometry or materials', () => {
  const c = game(), g = guard(c); c.damageGuard(g, 35);
  let disposals = 0;
  for (const mesh of g.healthBar.children){
    mesh.geometry.addEventListener('dispose', () => { disposals++; });
    mesh.material.addEventListener('dispose', () => { disposals++; });
  }
  c.disposeLevelObject(g.group);
  assert.equal(disposals, 0);
  const next = guard(c); c.damageGuard(next, 35);
  assert.equal(next.healthFill.geometry, g.healthFill.geometry);
  assert.equal(next.healthFill.material, g.healthFill.material);
});
