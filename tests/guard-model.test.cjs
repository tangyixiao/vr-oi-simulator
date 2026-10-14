const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../assets/vendor/three.min.js');

function guards(height = 0) {
  const canvasText = [];
  const ctx = vm.createContext({ THREE, Math, scene: new THREE.Scene(),
    state: { problems: [{ id: 'P1', name: '测试题', starter: 'PLAYER_STARTER' }], score: {}, elapsed: 0 },
    deskScreens: [], interactables: [], chairs: [],
    groundHeight: () => height,
    document: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
      fillText: text => canvasText.push(text)
    }) }) }
  });
  const core = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
  vm.runInContext(core.slice(core.indexOf('const geoCache'), core.indexOf('/* ---------- 音频')), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/world.js'), 'utf8'), ctx);
  return { ctx, canvasText, g: ctx.buildSecurityGuard(0, 0) };
}

test('standing guard legs hang below the hips with both boots on the floor', () => {
  const { g } = guards();
  assert.ok(g.legL && g.legR, 'standing legs must expose hip pivots');
  for (const leg of [g.legL, g.legR]) {
    const bounds = new THREE.Box3().setFromObject(leg);
    assert.ok(bounds.max.y > 0.75 && bounds.max.y < 0.9);
    assert.ok(Math.abs(bounds.min.y) < 0.015, `boot is at ${bounds.min.y}`);
    assert.ok(bounds.max.z - bounds.min.z < 0.4, 'thighs must not project into a sitting pose');
    assert.ok(bounds.max.y - bounds.min.y > 0.75);
  }
});

test('physical student monitor opens that student computer and draws current work', () => {
  const { ctx, canvasText } = guards();
  let opened = -1;
  ctx.useNPCComputer = id => { opened = id; };
  ctx.openCode = () => { opened = -2; };
  ctx.getNpcWorkSnapshot = (name, id, problems, elapsed) => ({
    studentName: name, studentId: id, problemId: 'P1', problemName: '测试题',
    progress: elapsed === 0 ? 25 : 100, accepted: elapsed > 0,
    code: elapsed === 0 ? 'NPC_DRAFT' : 'NPC_FINISHED'
  });
  const desk = ctx.buildDesk(0, 0, true, 2, '小刚');
  const monitor = desk.children.find(o => o.userData.interact && /电脑/.test(o.userData.interact.label));
  assert.ok(monitor);
  monitor.userData.interact.action();
  assert.equal(opened, 2, 'student monitor should open student work');
  assert.ok(canvasText.includes('NPC_DRAFT'));
  assert.ok(canvasText.some(text => /25%/.test(text)));
  ctx.state.elapsed = 500; canvasText.length = 0;
  ctx.updateAllDeskScreens();
  assert.ok(canvasText.includes('NPC_FINISHED'));
  assert.ok(canvasText.some(text => /已 AC/.test(text)));
  const playerDesk = ctx.buildDesk(2, 0, true);
  const playerMonitor = playerDesk.children.find(o => o.userData.interact && o.userData.interact.label === '使用电脑');
  playerMonitor.userData.interact.action();
  assert.equal(opened, -2);
});

test('travel drives counter swinging legs and arms while idle returns to standing', () => {
  const { ctx, g } = guards();
  assert.equal(typeof ctx.updateGuardGait, 'function');
  ctx.updateGuardGait(g, 0.1, 1 / 60, 1);
  assert.ok(Math.abs(g.legL.rotation.x) > 0.05);
  assert.ok(g.legL.rotation.x * g.legR.rotation.x < 0);
  assert.ok(g.legL.rotation.x * g.armL.rotation.x < 0);
  const phase = g.gaitPhase;
  for (let i = 0; i < 90; i++) ctx.updateGuardGait(g, 0, 1 / 60, 2 + i / 60);
  assert.equal(g.gaitPhase, phase, 'blocked guards must not run in place');
  for (const limb of [g.legL, g.legR, g.armL, g.armR]) assert.ok(Math.abs(limb.rotation.x) < 0.001);
  assert.ok(Math.abs(g.group.position.y) < 0.001);
});

test('guard boots and idle pose follow the raised floor', () => {
  const { ctx, g } = guards(0.8);
  assert.equal(typeof ctx.updateGuardGait, 'function');
  ctx.updateGuardGait(g, 0, 1 / 60, 0);
  assert.equal(g.group.position.y, 0.8);
  g.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(g.legL);
  assert.ok(Math.abs(bounds.min.y - 0.8) < 0.015);
});
