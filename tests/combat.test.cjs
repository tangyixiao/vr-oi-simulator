const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function game() {
  const ctx = vm.createContext({
    state: {
      view: 'world',
      started: true,
      ended: false,
      frozen: false,
      pos: { x: 0, z: 0 },
      yaw: 0,
      teacherDown: true,
      guardKills: 0,
      achievements: new Set(),
      weapon: 'fist',
      npcKills: 0,
      chairKills: 0,
      bestPunch: 0,
      realPlayTime: 0
    },
    securityGuards: [],
    guardLights: [],
    npcs: [],
    teacher: null,
    actionE: null,
    actionF: null,
    actionSpace: null,
    pointerLocked: true,
    promptEl: { classList: { add() {}, remove() {}, toggle() {} } },
    aimingAtWhiteLight: () => false,
    hasDialog: () => false,
    scene: { remove() {} },
    spawnBodyDebris() {},
    kickView() {},
    disposeOwnedMaterials() {},
    animateWeaponSwing() {},
    captureCheckpoint() {},
    $: () => null,
    campusExit: null,
    heldChair: null,
    isFirearm: () => false,
    nearbyChair: () => null,
    audio: { punch() {}, beep() {} },
    toast() {},
    checkGuardKillMilestones() {},
    maybeGuardWarning() {},
    revealHp() {},
    unlockAch(id) {
      ctx.state.achievements.add(id);
    },
    setTimeout() {},
    hitStop: 0,
    raycaster: { setFromCamera() {}, intersectObjects: () => [] },
    CENTER: {},
    camera: {},
    interactables: []
  });
  for (const file of ['gameplay', 'combat', 'npc', 'interact']) {
    vm.runInContext(
      readFileSync(join(__dirname, `../js/${file}.js`), 'utf8'),
      ctx
    );
  }
  return ctx;
}

function guard(x, z) {
  return { group: { position: { x, z } }, userData: { alive: true } };
}

function student(x, z) {
  return {
    group: { position: { x, z } },
    userData: { state: 'seated', seatX: x, seatZ: z, name: '同学', anger: 0 }
  };
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
  assert.ok(victims.every((g) => !g.userData.alive));
  assert.equal(distant.userData.alive, true);
});

test('teacher can be punched from across the room and behind the player', () => {
  const ctx = game();
  ctx.teacher = {
    group: { position: { x: 0, z: 12 }, rotation: {} },
    armL: { rotation: {} },
    armR: { rotation: {} },
    userData: { mode: 'patrol' }
  };
  const teacher = ctx.teacher;
  ctx.state.teacherDown = false;
  ctx.doInteract('space');
  assert.equal(teacher.userData.leaving, true);
  assert.equal(ctx.teacher, null);
  assert.equal(ctx.state.teacherDown, true);
});

test('successive punches retarget students immediately, even during hit feedback', () => {
  const ctx = game();
  const a = student(0, 12),
    b = student(12, 0);
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

test('neutral CCF text never invokes banned-word punishment', () => {
  const ctx = game();
  assert.equal(ctx.containsBannedWord('I love CCF'), null);
});

test('teacher absence disables old complaint and punishment entrypoints', () => {
  const ctx = game();
  ctx.showBannedWordDialog('shit');
  ctx.triggerNPCComplaint('同学');
  assert.equal(ctx.state.ended, false);
});

test('attack selection does not consume E interactions', () => {
  const ctx = game();
  const target = guard(0, -1);
  ctx.securityGuards.push(target);
  let opened = false;
  ctx.raycaster.intersectObjects = () => [
    {
      object: {
        userData: {
          interact: { label: '使用电脑', action: () => (opened = true) }
        }
      }
    }
  ];
  ctx.doInteract('e');
  assert.equal(opened, true);
  assert.equal(target.userData.alive, true);
});
test('a real fifty-guard chair hit unlocks both achievements and counts once', () => {
  const ctx = game();
  ctx.state.weapon = 'chair';
  ctx.securityGuards.push(...Array.from({ length: 50 }, () => guard(0, 80)));
  ctx.doInteract('space');
  ctx.doInteract('space');
  assert.equal(ctx.state.guardKills, 50);
  assert.equal(ctx.state.bestPunch, 50);
  assert.equal(ctx.state.chairKills, 50);
  assert.equal(ctx.state.achievements.has('one_punch'), true);
  assert.equal(ctx.state.achievements.has('chair50'), true);
});
test('challenge melee wounds independently and records achievements only for actual kills', () => {
  const ctx = game(); ctx.state.runConfig = { combatMode: 'challenge' };
  const a = guard(0, -1), b = guard(0, -2); ctx.securityGuards.push(a, b);
  ctx.doInteract('space');
  assert.equal(a.userData.hp, 65); assert.equal(b.userData.hp, 65);
  assert.equal(ctx.state.guardKills, 0); assert.equal(ctx.state.bestPunch, 0);
  ctx.doInteract('space'); assert.equal(a.userData.hp, 30);
  ctx.doInteract('space');
  assert.equal(ctx.state.guardKills, 2); assert.equal(ctx.state.bestPunch, 2);
});
test('raising guard health makes power fist and chair consume different numbers of attacks', () => {
  for (const [weapon, firstHp, attacks] of [['fist', 200, 3], ['chair', 150, 2]]) {
    const ctx = game(); vm.runInContext('gameOptions.guardHealth = 300', ctx);
    ctx.state.weapon = weapon; const g = guard(0, -1); ctx.securityGuards.push(g);
    ctx.doInteract('space'); assert.equal(g.userData.hp, firstHp);
    assert.equal(ctx.state.bestPunch, 0); assert.equal(ctx.state.chairKills, 0);
    for (let i = 1; i < attacks; i++) ctx.doInteract('space');
    assert.equal(ctx.state.guardKills, 1); assert.equal(ctx.state.bestPunch, 1);
    assert.equal(ctx.state.chairKills, weapon === 'chair' ? 1 : 0);
  }
});
test('challenge chair damage requires two default-health hits', () => {
  const ctx = game(); ctx.state.runConfig = { combatMode: 'challenge' }; ctx.state.weapon = 'chair';
  const g = guard(0, -3); ctx.securityGuards.push(g);
  ctx.doInteract('space'); assert.equal(g.userData.hp, 30);
  assert.equal(ctx.state.chairKills, 0);
  ctx.doInteract('space'); assert.equal(ctx.state.chairKills, 1);
});
