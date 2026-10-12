const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function game() {
  const world = readFileSync(join(__dirname, '../js/world.js'), 'utf8');
  const ctx = vm.createContext({
    state: { view: 'world', started: true, ended: false, frozen: false,
      pos: { x: 0, z: 0 }, yaw: 0, teacherDown: true, guardKills: 0 },
    securityGuards: [], npcs: [], teacher: null,
    actionE: null, actionF: null, actionSpace: null, pointerLocked: true,
    promptEl: { classList: { add() {}, remove() {}, toggle() {} } },
    aimingAtWhiteLight: () => false, hasDialog: () => false,
    scene: { remove() {} }, spawnBodyDebris() {}, kickView() {},
    audio: { punch() {} }, toast() {}, checkGuardKillMilestones() {},
    maybeGuardWarning() {}, revealHp() {}, unlockAch() {},
    setTimeout() {}, hitStop: 0,
    raycaster: { setFromCamera() {}, intersectObjects: () => [] },
    CENTER: {}, camera: {}, interactables: [],
  });
  // Load the real range value without constructing the Three.js scene.
  vm.runInContext(world.match(/const GUARD_PUNCH_RANGE = [^;]+;/)[0], ctx);
  vm.runInContext('const GUARD_MAX_TOTAL = 200;', ctx);
  for (const file of ['combat', 'npc', 'interact']) {
    vm.runInContext(readFileSync(join(__dirname, `../js/${file}.js`), 'utf8'), ctx);
  }
  return ctx;
}

function guard(x, z) {
  return { group: { position: { x, z } }, userData: { alive: true } };
}

function student(x, z) {
  return { group: { position: { x, z } },
    userData: { state: 'seated', seatX: x, seatZ: z, name: '同学', anger: 0 } };
}

test('one punch hits guards up to 100m in every direction, excluding dead and distant guards', () => {
  const ctx = game();
  const victims = [guard(0, -80), guard(0, 80), guard(80, 0), guard(-100, 0)];
  const distant = guard(100.01, 0);
  const dead = guard(0, -1);
  dead.userData.alive = false;
  ctx.securityGuards.push(...victims, distant, dead);
  ctx.doInteract('space');
  assert.equal(ctx.state.guardKills, 4);
  assert.ok(victims.every(g => !g.userData.alive));
  assert.equal(distant.userData.alive, true);
});

test('teacher can be punched from across the room and behind the player', () => {
  const ctx = game();
  ctx.teacher = { group: { position: { x: 0, z: 12 }, rotation: {} },
    armL: { rotation: {} }, armR: { rotation: {} }, userData: { mode: 'patrol' } };
  ctx.state.teacherDown = false;
  ctx.doInteract('space');
  assert.equal(ctx.teacher.userData.leaving, true);
  assert.equal(ctx.state.teacherDown, true);
});

test('successive punches retarget students immediately, even during hit feedback', () => {
  const ctx = game();
  const a = student(0, 12), b = student(12, 0);
  ctx.npcs.push(a, b);
  ctx.doInteract('space');
  assert.equal(a.userData.state, 'down');
  ctx.doInteract('space');
  assert.equal(b.userData.state, 'down');
});

test('students stay protected until the teacher is down', () => {
  const ctx = game();
  ctx.state.teacherDown = false;
  const n = student(0, -1);
  ctx.npcs.push(n);
  ctx.doInteract('space');
  assert.equal(n.userData.state, 'seated');
});

test('a new guard can be punched immediately after the previous group falls', () => {
  const ctx = game();
  ctx.securityGuards.push(guard(0, -1));
  ctx.doInteract('space');
  ctx.securityGuards.push(guard(0, 15));
  ctx.doInteract('space');
  assert.equal(ctx.state.guardKills, 2);
});

test('dialogs, frozen state and other views block combat', () => {
  for (const mode of ['dialog', 'frozen', 'code', 'ended']) {
    const ctx = game();
    const g = guard(0, -1);
    ctx.securityGuards.push(g);
    ctx.updateInteract();
    if (mode === 'dialog') ctx.hasDialog = () => true;
    if (mode === 'frozen') ctx.state.frozen = true;
    if (mode === 'code') ctx.state.view = 'code';
    if (mode === 'ended') ctx.state.ended = true;
    ctx.doInteract('space');
    assert.equal(g.userData.alive, true, mode);
  }
});
