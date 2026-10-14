const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../assets/vendor/three.min.js');
function game(combatMode = 'challenge') {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1, 0.05, 120);
  camera.position.set(0, 1.65, 0); scene.add(camera);
  const c = vm.createContext({ THREE, scene, camera, state: {
    started: true, ended: false, frozen: false, view: 'world', weapon: 'pistol',
    runConfig: { combatMode, runMode: 'campaign' },
    pos: camera.position, yaw: 0, pitch: 0, teacherDown: true, guardKills: 0,
    bestPunch: 0, chairKills: 0, gunKills: 0, realPlayTime: 0, achievements: new Set()
  }, securityGuards: [], npcs: [], teacher: null, guardLights: [], debrisList: [],
  heldChair: null, hasDialog: () => false, spawnBodyDebris() {}, disposeOwnedMaterials() {},
  toast() {}, audio: { beep() {}, punch() {} }, kickView() {}, animateWeaponSwing() {},
  unlockAch() {}, captureCheckpoint() {}, revealHp() {}, hitStop: 0,
  box(w, h, d, color, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z); parent.add(m); return m;
  }});
  for (const file of ['gameplay', 'combat', 'firearms']) {
    const p = path.join(__dirname, `../js/${file}.js`);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), c);
  }
  assert.equal(typeof c.fireGun, 'function', 'guns must fire aimed shots');
  return c;
}
function enemy(c, x, z) {
  const group = new THREE.Group(); group.position.set(x, 0, z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.4), new THREE.MeshBasicMaterial());
  mesh.position.y = 0.9; group.add(mesh); c.scene.add(group);
  const g = { group, userData: { alive: true } };
  if (typeof c.initGuardHealth === 'function') c.initGuardHealth(g);
  c.securityGuards.push(g); return g;
}
test('aimed bullet hits only the nearest guard, excludes side and rear targets', () => {
  const c = game(), near = enemy(c, 0, -3), far = enemy(c, 0, -5);
  const side = enemy(c, 3, -3), rear = enemy(c, 0, 3);
  assert.equal(c.fireGun(), true);
  assert.equal(near.userData.alive, true);
  assert.equal(near.userData.hp, 40);
  assert.equal(c.state.guardKills, 0); assert.equal(c.state.gunKills, 0);
  c.updateFirearms(0.24); c.fireGun();
  assert.equal(near.userData.alive, false);
  assert.ok(far.userData.alive && side.userData.alive && rear.userData.alive);
  assert.equal(c.state.guardKills, 1); assert.equal(c.state.gunKills, 1);
  assert.equal(c.state.bestPunch, 0);
});
test('scene geometry blocks bullets even in power mode', () => {
  const c = game('power'), g = enemy(c, 0, -5);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.1), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.5, -2); c.scene.add(wall);
  c.fireGun(); assert.equal(g.userData.alive, true);
});
test('shots respect pitch, so shooting above a guard misses', () => {
  const c = game(), g = enemy(c, 0, -3);
  c.camera.rotation.x = 0.8;
  c.fireGun(); assert.equal(g.userData.alive, true);
});
test('magazine, cooldown and timed reload prevent free repeated shots', () => {
  const c = game();
  assert.equal(c.fireGun(), true);
  assert.equal(c.fireGun(), false);
  for (let i = 1; i < 12; i++) { c.updateFirearms(0.24); assert.equal(c.fireGun(), true); }
  c.updateFirearms(0.24); assert.equal(c.fireGun(), false);
  assert.equal(c.reloadGun(), true);
  c.updateFirearms(0.9); assert.equal(c.fireGun(), false);
  c.updateFirearms(0.11); assert.equal(c.fireGun(), true);
});
test('rifle holds fire until released, and pause requires fresh trigger input', () => {
  const c = game(); c.selectWeapon('rifle');
  c.setFirearmTrigger(true); c.updateFirearms(0.11); c.updateFirearms(0.11);
  assert.equal(c.gunMagazine('rifle'), 27);
  c.clearFirearmInput(); c.updateFirearms(1); assert.equal(c.gunMagazine('rifle'), 27);
  c.setFirearmTrigger(true); c.state.view = 'pause'; c.updateFirearms(1);
  const rounds = c.gunMagazine('rifle'); c.state.view = 'world'; c.updateFirearms(1);
  assert.equal(c.gunMagazine('rifle'), rounds);
});
test('single-fire pistol cannot repeat from holding down trigger', () => {
  const c = game(); c.setFirearmTrigger(true); c.updateFirearms(2);
  assert.equal(c.gunMagazine('pistol'), 11);
});
test('dialogs and non-world views block firing, reloading and switching', () => {
  for (const mode of ['dialog', 'pause', 'code', 'ended', 'frozen']) {
    const c = game();
    if (mode === 'dialog') c.hasDialog = () => true;
    else if (mode === 'ended' || mode === 'frozen') c.state[mode] = true;
    else c.state.view = mode;
    assert.equal(c.fireGun(), false, mode);
    assert.equal(c.reloadGun(), false, mode);
    assert.equal(c.selectWeapon('rifle'), false, mode);
    assert.equal(c.gunMagazine('pistol'), 12);
  }
});
test('switching cancels reload and preserves each magazine', () => {
  const c = game(); c.fireGun(); c.reloadGun(); c.selectWeapon('rifle');
  c.updateFirearms(2); c.selectWeapon('pistol');
  assert.equal(c.gunMagazine('pistol'), 11);
});
test('restoring ammo clamps malformed values and defaults legacy saves to full magazines', () => {
  const c = game(); c.restoreGunAmmo({ pistol: -3, rifle: 999 });
  assert.equal(c.gunMagazine('pistol'), 0); assert.equal(c.gunMagazine('rifle'), 30);
  c.restoreGunAmmo(null);
  assert.equal(c.gunMagazine('pistol'), 12); assert.equal(c.gunMagazine('rifle'), 30);
});
test('rifle and pistol kills count towards endless kill achievements', () => {
  const c = game();
  c.unlockAch = id => c.state.achievements.add(id);
  c.state.runConfig = { runMode: 'endless', combatMode: 'power' };
  c.state.guardKills = 999;
  enemy(c, 0, -3); c.fireGun();
  assert.equal(c.state.achievements.has('endless1000'), false);
  c.updateFirearms(0.24); c.fireGun();
  assert.equal(c.state.achievements.has('endless500'), true);
  assert.equal(c.state.achievements.has('endless1000'), true);
  assert.equal(c.state.achievements.has('one_punch'), false);
});
test('hitting only a guard contact shadow cannot knock down the guard', () => {
  const c = game(), g = enemy(c, 0, -3);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012;
  shadow.userData.contactShadow = true; g.group.add(shadow);
  c.camera.lookAt(0.5, 0.012, -3);
  c.fireGun();
  assert.equal(g.userData.alive, true);
  assert.equal(g.userData.hp, 100);
});
test('hitting only a guard glow cannot knock down the guard', () => {
  const c = game(), g = enemy(c, 0, -3);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = 1.5; g.group.add(glow);
  c.camera.lookAt(0.5, 1.5, -3); c.fireGun();
  assert.equal(g.userData.alive, true);
  assert.equal(g.userData.hp, 100);
});
test('rifle damage requires three hits for a default guard and counts only the kill', () => {
  const c = game(), g = enemy(c, 0, -3); c.selectWeapon('rifle');
  c.fireGun(); assert.equal(g.userData.hp, 65);
  c.updateFirearms(0.1); c.fireGun();
  assert.equal(g.userData.hp, 30); assert.equal(c.state.gunKills, 0);
  c.updateFirearms(0.1); c.fireGun();
  assert.equal(g.userData.hp, 0); assert.equal(c.state.guardKills, 1);
  assert.equal(c.state.gunKills, 1);
});
test('gatling sustains 25 rounds per second across uneven frames and stops on release', () => {
  const c = game(), g = enemy(c, 0, -3);
  assert.equal(c.selectWeapon('gatling'), true);
  c.setFirearmTrigger(true);
  assert.equal(g.userData.hp, 82);
  c.updateFirearms(0.1);
  assert.equal(c.gunMagazine('gatling'), 197); assert.equal(g.userData.hp, 46);
  c.updateFirearms(0.1);
  assert.equal(c.gunMagazine('gatling'), 194); assert.equal(c.state.gunKills, 1);
  c.clearFirearmInput(); c.updateFirearms(1);
  assert.equal(c.gunMagazine('gatling'), 194);
});
test('gatling catchup is bounded and long frames do not leave an automatic backlog', () => {
  const c = game(); c.selectWeapon('gatling'); c.setFirearmTrigger(true);
  c.updateFirearms(10);
  assert.equal(c.gunMagazine('gatling'), 195);
  c.updateFirearms(0.001);
  assert.equal(c.gunMagazine('gatling'), 195);
});
test('gatling reload takes 2.5 seconds and restores its own saved magazine', () => {
  const c = game();
  c.restoreGunAmmo({ pistol: 5, rifle: 8, gatling: 150 });
  assert.equal(c.gunMagazine('gatling'), 150);
  c.selectWeapon('gatling'); c.reloadGun();
  c.updateFirearms(2.49); assert.equal(c.fireGun(), false);
  c.updateFirearms(0.02); assert.equal(c.gunMagazine('gatling'), 200);
  assert.equal(c.gunMagazine('pistol'), 5); assert.equal(c.gunMagazine('rifle'), 8);
  c.restoreGunAmmo({ gatling: 500 }); assert.equal(c.gunMagazine('gatling'), 200);
  c.restoreGunAmmo(null); assert.equal(c.gunMagazine('gatling'), 200);
});
test('gatling requires fresh input after dialogs, pause or weapon switches', () => {
  for (const interruption of ['pause', 'dialog', 'switch']) {
    const c = game(); c.selectWeapon('gatling'); c.setFirearmTrigger(true);
    if (interruption === 'pause') c.state.view = 'pause';
    if (interruption === 'dialog') c.hasDialog = () => true;
    if (interruption === 'switch') c.selectWeapon('rifle');
    c.updateFirearms(0.2);
    c.state.view = 'world'; c.hasDialog = () => false; c.selectWeapon('gatling');
    c.updateFirearms(0.2); assert.equal(c.gunMagazine('gatling'), 199, interruption);
  }
});
test('opaque decorative meshes and health bars cannot receive bullets', () => {
  const c = game(), g = enemy(c, 0, -3);
  const decoration = new THREE.Group(); decoration.userData.shotIgnore = true;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2), new THREE.MeshBasicMaterial());
  decoration.add(mesh); decoration.position.set(0, 1.65, 1); g.group.add(decoration);
  g.group.children[0].visible = false;
  c.fireGun(); assert.equal(g.userData.hp, 100);
  g.group.children[0].visible = true;
  c.updateFirearms(0.24); c.fireGun(); assert.equal(g.userData.hp, 40);
});
test('gatling has a visible six-barrel rig that spins during held fire', () => {
  const c = game(); c.initGuns(); c.selectWeapon('gatling'); c.updateFirearms(0.01);
  const rig = vm.runInContext('gunRigs.gatling', c);
  assert.equal(rig.visible, true);
  assert.equal(rig.userData.barrels.children.length, 6);
  const angle = rig.userData.barrels.rotation.z;
  c.setFirearmTrigger(true); c.updateFirearms(0.1);
  assert.ok(rig.userData.barrels.rotation.z > angle);
  assert.equal(vm.runInContext('gunRigs.pistol.visible', c), false);
});
test('power firearms shoot beyond magazine capacities without consuming checkpoint ammo or requiring reload', () => {
  for (const [weapon, capacity, interval] of [['pistol', 12, 0.24], ['rifle', 30, 0.1], ['gatling', 200, 0.04]]) {
    const c = game('power'); c.restoreGunAmmo({ pistol: 3, rifle: 7, gatling: 11 }); c.selectWeapon(weapon);
    for (let i = 0; i < capacity + 5; i++) {
      assert.equal(c.fireGun(), true, `${weapon} round ${i + 1}`); c.updateFirearms(interval);
    }
    assert.equal(c.gunMagazine(weapon), Infinity);
    assert.equal(c.reloadGun(), false);
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(gunAmmo)', c)), { pistol: 3, rifle: 7, gatling: 11 });
  }
});
test('power firearms can shoot even when a restored finite magazine contains zero rounds', () => {
  const c = game('power'); c.restoreGunAmmo({ pistol: 0, rifle: 0, gatling: 0 });
  for (const weapon of ['pistol', 'rifle', 'gatling']) {
    c.selectWeapon(weapon); c.updateFirearms(0.24);
    assert.equal(c.fireGun(), true, weapon);
    assert.equal(c.gunHasInfiniteAmmo?.(weapon), true);
  }
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(gunAmmo)', c)), { pistol: 0, rifle: 0, gatling: 0 });
});
test('power gatling held fire continues past 200 hits and pressing reload does not interrupt it', () => {
  const c = game('power'); vm.runInContext('gameOptions.guardHealth = 10', c);
  c.selectWeapon('gatling'); enemy(c, 0, -3); c.setFirearmTrigger(true);
  for (let i = 1; i < 210; i++) { enemy(c, 0, -3); c.updateFirearms(0.04); }
  assert.equal(c.state.gunKills, 210);
  assert.equal(c.reloadGun(), false);
  enemy(c, 0, -3); c.updateFirearms(0.04); assert.equal(c.state.gunKills, 211);
  c.clearFirearmInput(); enemy(c, 0, -3); c.updateFirearms(1); assert.equal(c.state.gunKills, 211);
});
test('challenge firearms still consume finite ammo, stop empty, and require their reload duration', () => {
  for (const [weapon, capacity, reload] of [['pistol', 12, 1], ['rifle', 30, 1.5], ['gatling', 200, 2.5]]) {
    const c = game(); c.restoreGunAmmo({ pistol: 1, rifle: 1, gatling: 1 }); c.selectWeapon(weapon);
    assert.equal(c.gunHasInfiniteAmmo?.(weapon), false);
    assert.equal(c.fireGun(), true); assert.equal(c.gunMagazine(weapon), 0);
    c.updateFirearms(0.24); assert.equal(c.fireGun(), false);
    assert.equal(c.reloadGun(), true); c.updateFirearms(reload - 0.01);
    assert.equal(c.fireGun(), false);
    c.updateFirearms(0.02); assert.equal(c.gunMagazine(weapon), capacity);
  }
});
test('power interaction prompts advertise infinite ammo and do not ask for reload', () => {
  const c = game('power'), attack = { textContent: '' };
  Object.assign(c, { actionE: null, actionF: null, actionSpace: null, pointerLocked: true,
    promptEl: { textContent: '', classList: { add() {}, remove() {}, toggle() {} } },
    $: id => id === 'attackPrompt' ? attack : null, aimingAtWhiteLight: () => false,
    campusExit: null, nearbyChair: () => null,
    raycaster: { setFromCamera() {}, intersectObjects: () => [] }, CENTER: {}, interactables: [] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/interact.js'), 'utf8'), c);
  c.updateInteract();
  assert.match(attack.textContent, /无限弹药/);
  assert.match(c.promptEl.textContent, /无需换弹/);
  assert.doesNotMatch(c.promptEl.textContent, /\[ R \]/);
});
