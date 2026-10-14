'use strict';
const NPC_DISTURB_RANGE = 0.72;
function updateInteract(){
  actionE = null; actionF = null; actionSpace = null;
  promptEl.classList.add('hidden');
  const attackEl = $('attackPrompt');
  if (attackEl) attackEl.textContent = '';
  promptEl.classList.toggle('bright', aimingAtWhiteLight());
  if (!canFight()) return;

  // Attack selection is independent of E/R interactions.
  if (isFirearm(state.weapon))
    actionSpace = { fn: fireGun, label: gunReload > 0 ? '换弹中…' : gunMagazine(state.weapon) > 0 ? '准星瞄准射击' : '弹匣已空 · R 换弹' };
  else if (securityGuards.some(g => g.userData.alive && inPunchRange(g.group.position.x, g.group.position.z)))
    actionSpace = { fn: punchGuardsArc, label: '横扫保安' };
  else if (teacher && !teacher.userData.leaving && inPunchRange(teacher.group.position.x, teacher.group.position.z))
    actionSpace = { fn: punchTeacher, label: '打倒老师 · 开启战斗' };
  else if (state.teacherDown){
    const n = npcs.find(n => n.userData.state === 'seated' && inPunchRange(n.group.position.x, n.group.position.z));
    if (n) actionSpace = { fn: () => downNPC(n), label: `攻击 ${n.userData.name}` };
  }
  if (actionSpace && attackEl) attackEl.textContent = `[ 左键 ] ${actionSpace.label}`;

  let hint = '';
  if (campusExit){
    if (battle.ready && Math.hypot(state.pos.x - campusExit.x, state.pos.z - campusExit.z) < 2.8){
      actionE = { fn: advanceCampus }; hint = '[ E ] ' + (battle.stage === 'campus-2' ? '推开校门 · 完成突围' : '通过封锁点');
    }
  } else if (currentRun().runMode !== 'endless'){
    const dDoor = Math.hypot(state.pos.x - 7.85, state.pos.z);
    if (dDoor < 3){
      if (state.doorOpen){ actionE = { fn: walkOutOfTheRoom }; hint = '[ E ] 白光出口 · 结束或继续第二关'; }
      else if (state.bathroomApproved){ actionE = { fn: () => enterCorridor('toilet') }; hint = '[ E ] 去洗手间'; }
      else if (teacher) hint = '按 H 举手，征得老师同意后可离开';
    }
    if (!actionE){
      raycaster.setFromCamera(CENTER, camera); raycaster.far = 3.2;
      const hits = raycaster.intersectObjects(interactables, false);
      if (hits.length && hits[0].object.userData.interact){
        const it = hits[0].object.userData.interact;
        actionE = { fn: it.action }; hint = '[ E ] ' + it.label;
      }
    }
    for (let i = 0; i < npcs.length; i++){
      const n = npcs[i], ud = n.userData;
      const d = Math.hypot(state.pos.x - n.group.position.x, state.pos.z - n.group.position.z);
      if (ud.state === 'seated' && d <= NPC_DISTURB_RANGE){
        actionF = { fn: () => disturbNPC(i) };
        if (!hint) hint = `[ F ] 干扰 ${ud.name}`;
      } else if (!actionE && ['away', 'walking_away', 'down'].includes(ud.state) &&
        Math.hypot(state.pos.x - ud.seatX, state.pos.z - ud.seatZ) < 2.3){
        actionE = { fn: () => useNPCComputer(i) }; hint = `[ E ] 使用 ${ud.name} 的电脑`;
      }
    }
  }
  const chairHint = isFirearm(state.weapon) ? '[ R ] 换弹 · [ 1 ] 近战' : heldChair ?
    (state.weapon === 'chair' ? '[ R ] 放下椅子' : '[ R ] 重新拿起椅子') : nearbyChair() ? '[ R ] 拾取空椅子' : '';
  if (chairHint) hint += (hint ? ' · ' : '') + chairHint;
  if (!pointerLocked && !hint) hint = '点击画面捕获鼠标 · Esc 打开设置';
  if (hint){ promptEl.textContent = hint; promptEl.classList.remove('hidden'); }
}
function doInteract(key){
  if (!canFight()) return;
  updateInteract();
  if (key === 'e' && actionE) actionE.fn();
  if (key === 'f' && actionF) actionF.fn();
  if (key === 'space'){
    if (actionSpace) actionSpace.fn();
    else animateWeaponSwing();
  }
}
function drinkWater(){
  audio.beep(520, 0.08, 0.05);
  toast('你喝了一口水，感觉清醒了一些。', 1600);
}
