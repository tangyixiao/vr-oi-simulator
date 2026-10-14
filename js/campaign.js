'use strict';
let campusGate = null, campusExit = null;
const CHAPTER_NAMES = { classroom: '考场', 'campus-0': '走廊 · 第一封锁点',
  'campus-1': '走廊 · 第二封锁点', 'campus-2': '庭院 · 校门', endless: '无尽考场' };
function clearDebris(){
  for (const d of debrisList){ scene.remove(d.mesh); d.mat.dispose(); }
  debrisList.length = 0;
}
function disposeLevelObject(group){
  const sharedGeo = new Set(geoCache.values()), sharedMat = new Set(matCache.values());
  const geos = new Set(), mats = new Set(), textures = new Set();
  group.traverse(o => {
    if (o.geometry && !sharedGeo.has(o.geometry) && o.geometry !== _shadowGeo) geos.add(o.geometry);
    if (o.material && !sharedMat.has(o.material)){
      mats.add(o.material);
      if (o.material.map && o.material.map !== _shadowTex) textures.add(o.material.map);
    }
  });
  for (const t of textures) t.dispose();
  for (const m of mats) m.dispose();
  for (const g of geos) g.dispose();
}
function clearLevel(){
  stopBattle();
  resetGuardNavigation();
  resetFirearms();
  dismissDialogs();
  endSlowMo();
  slowMoDlg = null;
  clearDebris();
  // Lights survive scene changes and must not remain parented to defeated guards.
  for (const light of guardLights){ scene.add(light); light.intensity = 0; }
  for (const o of [...scene.children]){
    if (o === camera || o.isAmbientLight || o.isHemisphereLight || guardLights.includes(o)) continue;
    scene.remove(o);
    disposeLevelObject(o);
  }
  npcs.length = 0; securityGuards.length = 0; chairs.length = 0;
  obstacles.length = 0; interactables.length = 0; deskScreens.length = 0; contactShadows.length = 0;
  teacher = null; campusGate = null; campusExit = null;
  doorGroup = null; doorLightMesh = null; doorGlowMesh = null; doorFloorMesh = null;
  doorPointLight = null; doorOpenT = 0;
  tPoints = []; tension = 0; nearestGuardDist = Infinity;
  state.keys = {}; state.doorOpen = false; state.frozen = false; state.view = 'world';
  jumpY = 0; velY = 0; onGround = true; hitStop = 0;
  actionE = null; actionF = null; actionSpace = null;
  postPrimed = false;
}
function resetPlayer(x, z){
  state.pos.set(x, 1.65, z);
  state.yaw = 0; state.pitch = 0; yawTarget = 0; pitchTarget = 0;
  recoilPitch = 0; recoilYaw = 0;
  camera.position.copy(state.pos);
  camera.rotation.set(0, 0, 0);
  _jumpSafe.set(x, 0, z);
}
function campusSign(text, x, y, z, color){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const cx = c.getContext('2d');
  cx.fillStyle = '#172b3c'; cx.fillRect(0, 0, 1024, 256);
  cx.fillStyle = color || '#bceacf'; cx.font = 'bold 68px sans-serif'; cx.textAlign = 'center';
  cx.fillText(text, 512, 150);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); scene.add(mesh);
  return mesh;
}
function buildCampus(index){
  const yard = index === 2;
  Object.assign(worldBounds, { w: yard ? 24 : 8, d: yard ? 20 : 24, h: yard ? 8 : 3.4 });
  worldBounds.minZ = yard ? -9.5 : index === 0 ? -1.4 : -9.6;
  worldBounds.maxZ = yard ? 9.5 : index === 0 ? 11.5 : -2.5;
  const w = worldBounds.w, d = worldBounds.d;
  scene.background = new THREE.Color(yard ? 0xadc6d0 : 0x192b39);
  scene.fog = new THREE.FogExp2(yard ? 0xadc6d0 : 0x192b39, 0.016);
  box(w, 0.15, d, yard ? 0x829482 : 0x6a7b82, 0, -0.08, 0, scene);
  box(0.15, 3.4, d, 0x667a88, -w/2, 1.7, 0, scene);
  box(0.15, 3.4, d, 0x667a88, w/2, 1.7, 0, scene);
  box(w, 3.4, 0.15, 0x4d6576, 0, 1.7, d/2, scene);
  box(w, 3.4, 0.15, 0x4d6576, 0, 1.7, -d/2, scene);
  if (!yard){
    box(w, 0.1, d, 0xadb8bb, 0, 3.35, 0, scene);
    for (let z = 8; z >= -8; z -= 4){
      box(0.04, 1.6, 2.4, 0xb7dcdf, -w/2 + 0.1, 1.9, z, scene, { emissive: 0x253d42 });
      box(0.16, 0.08, 1, 0xe9e4d8, w/2 - 0.4, 2.7, z, scene, { emissive: 0x454136 });
    }
    for (const z of [4, -5]){
      box(1.2, 0.8, 0.8, 0x445d58, 2.4, 0.4, z, scene);
      addObstacle(2.4, z, 0.6, 0.4);
    }
  } else {
    for (const x of [-8, 8]) for (const z of [-5, 4]){
      box(1.4, 0.4, 1.4, 0x496650, x, 0.2, z, scene);
      box(0.28, 2.0, 0.28, 0x67543e, x, 1.2, z, scene);
      const leaf = new THREE.Mesh(getSphereGeo(1.3, 12, 8), mat(0x466f52));
      leaf.position.set(x, 3, z); scene.add(leaf); addObstacle(x, z, 0.7, 0.7);
    }
  }
  campusExit = { x: 0, z: yard ? -8.6 : index === 0 ? -2 : -10.2 };
  campusGate = new THREE.Group(); campusGate.position.set(0, 0, campusExit.z);
  box(yard ? 5 : 7.2, 1.6, 0.2, 0x9a7352, 0, 0.8, 0, campusGate);
  scene.add(campusGate);
  addObstacle(0, campusExit.z, yard ? 2.5 : 3.6, 0.1);
  campusSign(CHAPTER_NAMES[`campus-${index}`], 0, 2.45, campusExit.z - 0.3);
  campusSign('清空本段敌人后，靠近闸门按 E', 0, 2.3, worldBounds.d/2 - 0.2, '#f3dba4');
  makeLooseChair(yard ? -2 : -1.7, yard ? 6 : index === 0 ? 8 : -3);
  initTension();
}
function enterCampus(){
  if (state.ended || !battle.ready) return;
  state.hp = HP_MAX; state.hpVisible = true; renderHp();
  enterCampusSection(0);
  toast('第二关 · 校园突围！血量已恢复，武器保留。', 3200);
}
function enterCampusSection(index){
  clearLevel();
  buildCampus(index);
  resetPlayer(0, index === 2 ? 7.5 : index === 0 ? 10 : -3.2);
  beginBattle(`campus-${index}`, stageQuotas(currentRun().guardTarget)[index]);
  captureCheckpoint();
  requestLock();
}
function openCheckpointGate(){
  if (campusGate) campusGate.visible = false;
  const gate = obstacles.findIndex(o => campusExit && o.x === 0 && Math.abs(o.z - campusExit.z) < 0.01);
  if (gate >= 0) obstacles.splice(gate, 1);
  resetGuardNavigation();
  toast('本段清空！靠近闸门按 E 继续。', 2500);
}
function advanceCampus(){
  if (!canFight() || !battle.ready) return;
  const index = Number(battle.stage.slice(-1));
  if (index < 2) enterCampusSection(index + 1);
  else { unlockAch('escape'); finishRun('校 园 突 围', '你穿过走廊与庭院，推开校门。校园突围完成！'); }
}
function startEndless(){
  state.teacherDown = true;
  if (teacher){ scene.remove(teacher.group); disposeLevelObject(teacher.group); teacher = null; }
  state.hp = HP_MAX; state.hpVisible = true; renderHp();
  beginBattle('endless', Infinity);
  toast('无尽战斗开始！左键攻击 · R 拾取椅子 · Esc 可结束挑战', 3000);
}
function captureCheckpoint(){
  if (currentRun().runMode === 'endless') return;
  checkpoint = { stage: battle.stage, config: { ...currentRun() }, hp: state.hp,
    weapon: state.weapon, guardKills: state.guardKills, bestPunch: state.bestPunch,
    chairKills: state.chairKills, gunKills: state.gunKills, ammo: { ...gunAmmo }, heldChair: !!heldChair,
    npcKills: state.npcKills, realPlayTime: state.realPlayTime };
  persistSave();
}
function restoreCheckpoint(cp){
  if (!cp || !['classroom', 'campus-0', 'campus-1', 'campus-2'].includes(cp.stage)) return false;
  state.runConfig = Object.freeze(normalizeGameOptions(cp.config));
  if (state.runConfig.runMode !== 'campaign') return false;
  state.guardKills = Math.max(0, Number(cp.guardKills) || 0);
  state.bestPunch = Math.max(0, Number(cp.bestPunch) || 0);
  state.chairKills = Math.max(0, Number(cp.chairKills) || 0);
  state.gunKills = Math.max(0, Number(cp.gunKills) || 0);
  state.npcKills = Math.max(0, Number(cp.npcKills) || 0);
  state.realPlayTime = Math.max(0, Number(cp.realPlayTime) || 0);
  state.teacherDown = true;
  state.hp = clamp(Number(cp.hp) || HP_MAX, 1, HP_MAX); state.hpVisible = true;
  if (cp.stage === 'classroom'){
    if (teacher){ scene.remove(teacher.group); disposeLevelObject(teacher.group); teacher = null; }
    beginBattle('classroom', currentRun().guardTarget);
    resetPlayer(0, -1.72);
  } else {
    clearLevel();
    const index = Number(cp.stage.slice(-1)); buildCampus(index);
    resetPlayer(0, index === 2 ? 7.5 : index === 0 ? 10 : -3.2);
    beginBattle(cp.stage, stageQuotas(currentRun().guardTarget)[index]);
  }
  if (heldChair){ camera.remove(heldChair.group); heldChair = null; }
  state.weapon = 'fist';
  if (cp.weapon === 'chair' || cp.heldChair === true) equipChair(makeLooseChair(state.pos.x + 0.6, state.pos.z));
  if (isFirearm(cp.weapon)) state.weapon = cp.weapon;
  else if (cp.weapon !== 'chair') state.weapon = 'fist';
  restoreGunAmmo(cp.ammo);
  checkpoint = cp; renderHp();
  return true;
}
function recordEndlessBest(){
  if (currentRun().runMode !== 'endless') return;
  try {
    const key = `oi_endless_${currentRun().combatMode}`;
    const old = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ kills: Math.max(old.kills || 0, state.guardKills),
      duration: Math.max(old.duration || 0, state.realPlayTime), bestPunch: Math.max(old.bestPunch || 0, state.bestPunch) }));
  } catch(e){}
}
function endEndless(reason){
  recordEndlessBest();
  finishRun('无 尽 战 绩', `${reason}。挑战结束，最佳纪录已保存（爽快与挑战分别统计）。`);
}
function finishRun(title, text, keepCheckpoint = false){
  if (state.ended) return;
  state.ended = true; state.view = 'world'; stopBattle(); hideAllPanels();
  resetFirearms();
  for (const g of securityGuards){ scene.remove(g.group); disposeOwnedMaterials(g.group); }
  securityGuards.length = 0; clearDebris();
  state.retryCheckpoint = keepCheckpoint;
  $('btnRestart').textContent = keepCheckpoint ? '从检查点重试' : '再来一场';
  $('endTitle').textContent = title;
  $('endSub').textContent = text;
  showEnding(state.totalScore, `答题娱乐分：${state.totalScore} / 400（模拟评分）\\n战斗模式：${currentRun().combatMode === 'power' ? '爽快' : '挑战'}\\n击倒保安：${state.guardKills}\\n近战单次最高：${state.bestPunch}\\n椅子击倒：${state.chairKills}\\n枪械击倒：${state.gunKills}\\n实际用时：${fmtTime(state.realPlayTime)}`.replace(/\\n/g, '\n'));
  if (!keepCheckpoint && currentRun().runMode !== 'endless') clearSave();
}
function renderBattleHud(){
  const el = $('battleHud'); if (!el) return;
  const p = attackProfile(currentRun(), state.weapon);
  const remaining = Number.isFinite(battle.target) ? `${battle.kills} / ${battle.target}` : `${state.guardKills} · 无尽`;
  const weapon = isFirearm(state.weapon)
    ? `${GUNS[state.weapon].name} · ${gunMagazine(state.weapon)} / ${GUNS[state.weapon].capacity} · ${gunReload > 0 ? '换弹 ' + gunReload.toFixed(1) + ' 秒' : 'R 换弹'}`
    : `${state.weapon === 'chair' ? '椅子' : '拳头'} · ${p.range} 米 · 无冷却`;
  el.textContent = `${CHAPTER_NAMES[state.chapter] || '考场'} · ${currentRun().combatMode === 'power' ? '爽快' : '挑战'}\n${weapon}\n1 拳头 · 2 手枪 · 3 步枪\n保安基础移速 ${gameOptions.guardSpeed.toFixed(1)} 米/秒\n${state.teacherDown ? '本段击倒 ' + remaining : '左键打倒老师，开启战斗'} · 单次最高 ${state.bestPunch}`;
}
