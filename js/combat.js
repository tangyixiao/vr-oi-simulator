'use strict';
/* =========================================================
   combat —— 殴打老师 / 保安 AI / 全员收尾
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   打老师 / 打保安
   ========================================================= */
function punchTeacher(){
  if (!canFight() || !teacher || teacher.userData.leaving) return;
  if (!inPunchRange(teacher.group.position.x, teacher.group.position.z)) return;
  downTeacher();
}
function downTeacher(){
  if (!canFight() || !teacher || teacher.userData.leaving) return;
  const target = teacher;
  target.userData.leaving = true;
  spawnBodyDebris(target.group, { speed: 3.2 });
  scene.remove(target.group);
  disposeOwnedMaterials(target.group);
  teacher = null;
  state.teacherDown = true;
  state.teacherWarnActive = false;
  state.wanderTimer = 0;
  revealHp();
  unlockAch('teacher_hit');
  hitFeedback(1);
  beginBattle('classroom', currentRun().guardTarget);
  captureCheckpoint();
  const ammoHint = currentRun().combatMode === 'challenge' ? 'R 换弹／拾椅子' : '枪械无限弹药 · R 拾椅子';
  toast(`监考老师跑了！保安正在赶来。2 手枪 · 3 步枪 · 4 加特林 · ${ammoHint}`, 3200);
}

/* ---------- 攻击范围：100 米、360°，无需对准 ---------- */
function inPunchRange(x, z){
  return targetInAttackRange(state.pos, state.yaw, { x, z }, attackProfile(currentRun(), state.weapon));
}

/* 统计当前拳范围内的所有活保安 */
function guardsInPunchRange(){
  const out = [];
  for (const g of securityGuards){
    if (!g.userData.alive) continue;
    if (inPunchRange(g.group.position.x, g.group.position.z)) out.push(g);
  }
  return out;
}

/* Each guard owns HP; the live setting changes maximum HP without healing wounds. */
let guardHealthAssets = null;
function createGuardHealthBar(g){
  if (g.healthBar || typeof THREE === 'undefined' || !g.group.add) return;
  if (!guardHealthAssets){
    guardHealthAssets = {
      back: new THREE.PlaneGeometry(0.86, 0.1), fill: new THREE.PlaneGeometry(0.8, 0.06),
      backMaterial: new THREE.MeshBasicMaterial({ color: 0x142130, side: THREE.DoubleSide, depthWrite: false }),
      fillMaterial: new THREE.MeshBasicMaterial({ color: 0xf3cb69, side: THREE.DoubleSide, depthWrite: false })
    };
    if (typeof geoCache !== 'undefined'){
      geoCache.set('guard-health-back', guardHealthAssets.back);
      geoCache.set('guard-health-fill', guardHealthAssets.fill);
    }
    if (typeof matCache !== 'undefined'){
      matCache.set('guard-health-back', guardHealthAssets.backMaterial);
      matCache.set('guard-health-fill', guardHealthAssets.fillMaterial);
    }
  }
  const bar = new THREE.Group(); bar.position.y = 2.15;
  bar.userData.shotIgnore = true;
  const back = new THREE.Mesh(guardHealthAssets.back, guardHealthAssets.backMaterial);
  const fill = new THREE.Mesh(guardHealthAssets.fill, guardHealthAssets.fillMaterial);
  back.userData.sharedMaterial = fill.userData.sharedMaterial = true;
  fill.position.z = 0.002;
  bar.add(back, fill); g.group.add(bar);
  g.healthBar = bar; g.healthFill = fill;
}
function updateGuardHealthBar(g){
  if (!g.healthBar) return;
  const fraction = g.userData.hp / g.userData.maxHp;
  g.healthBar.visible = g.userData.alive && fraction > 0 && fraction < 1;
  g.healthFill.scale.x = fraction;
  g.healthFill.position.x = (fraction - 1) * 0.4;
  if (typeof camera !== 'undefined' && camera.position){
    g.healthBar.rotation.y = Math.atan2(camera.position.x - g.group.position.x,
      camera.position.z - g.group.position.z) - g.group.rotation.y;
  }
}
function initGuardHealth(g){
  const maximum = normalizeGuardHealth(gameOptions.guardHealth);
  g.userData.maxHp = maximum; g.userData.hp = maximum;
  createGuardHealthBar(g); updateGuardHealthBar(g);
}
function syncGuardHealth(g){
  if (!g || !g.userData.alive) return;
  const hp = g.userData.hp, oldMax = g.userData.maxHp;
  if (!Number.isFinite(hp) || !Number.isFinite(oldMax) || oldMax <= 0){ initGuardHealth(g); return; }
  const maximum = normalizeGuardHealth(gameOptions.guardHealth);
  if (maximum !== oldMax){
    g.userData.hp = Math.max(0, Math.min(1, hp / oldMax)) * maximum;
    g.userData.maxHp = maximum;
  }
  createGuardHealthBar(g); updateGuardHealthBar(g);
}
/* Returns true only when this hit actually downs a living guard. */
function damageGuard(g, damage){
  if (!g || !g.userData.alive || !Number.isFinite(damage) || damage <= 0) return false;
  syncGuardHealth(g);
  g.userData.hp = Math.max(0, g.userData.hp - damage);
  updateGuardHealthBar(g);
  if (g.userData.hp > 0) return false;
  return killGuard(g);
}

/* 用引用而非索引：避免数组被 prune 后索引错位 */
function killGuard(g){
  if (!g || !g.userData.alive) return false;
  g.userData.alive = false; g.userData.hp = 0;
  if (g.healthBar){ g.healthBar.visible = false; g.group.remove(g.healthBar); }
  for (const light of guardLights) if (light.parent === g.group) { scene.add(light); light.intensity = 0; }
  /* 先炸散再移除组：部件已摘到场景里，带物理飞走 */
  spawnBodyDebris(g.group, { speed: 3.9 });
  scene.remove(g.group);
  disposeOwnedMaterials(g.group);
  state.guardKills++;
  battle.kills++;
  return true;
}

/* 打完全部保安：不直接结算，开门 + 弹"警告"，等玩家自己走出去 */
function openFinalDoor(){
  if (state.doorOpen || state.ended) return;
  openTheDoor();
  toast('考场已清空！靠近白光出口按 E，结束本局或继续校园突围。', 4200);
  audio.beep(880, 0.25, 0.05);
}

function walkOutOfTheRoom(){
  if (!canFight() || !battle.ready) return;
  openDialog({ title: '第一关完成',
    text: `击倒 ${battle.kills} / ${battle.target} 名保安。\n\n门外还有走廊和庭院。要继续突围吗？`,
    options: [
      { label: '继续校园突围', cb: dlg => { closeDialog(dlg); enterCampus(); } },
      { label: '走进白光 · 结束本局', cb: dlg => { closeDialog(dlg); endByTotalVictory(); } }
    ] });
}

function hitFeedback(n){
  animateWeaponSwing();
  if (state.weapon === 'chair') audio.beep(95, 0.15, 0.06, 'triangle');
  else audio.punch();
  const scale = gameOptions.comfort ? 0.18 : 1;
  kickView(0.05 * scale, (Math.random() - 0.5) * 0.05 * scale);
  hitStop = gameOptions.comfort ? 0.025 : 0.09 + Math.min(0.06, n * 0.02);
}

/* 一拳伤害拳范围内所有保安，击倒统计只计入血量归零者。 */
function punchGuardsArc(){
  if (!canFight()) return;
  const victims = guardsInPunchRange();
  if (!victims.length){ animateWeaponSwing(); return; }
  let kills = 0;
  const damage = meleeDamage(currentRun(), state.weapon);
  for (const g of victims) if (damageGuard(g, damage)) kills++;
  if (kills) recordPunch(kills);
  hitFeedback(victims.length);
  toast(kills ? `一击放倒 ${kills} 名保安！` : `命中 ${victims.length} 名保安 · 每名 −${damage} 血量`, 1200);
  if (kills){
    checkGuardKillMilestones(state.guardKills);
    maybeGuardWarning();
    finishBattleIfReady();
  }
}

/* =========================================================
   保安 AI + 碰撞
   ========================================================= */
function updateGuards(realDt, t){
  if (!canFight()) return;
  if (securityGuards.some(g => g.userData.alive)) updateGuardNavigation(realDt);

  let minDist = Infinity;
  nearestGuardDist = Infinity;
  /* 距离最近的两名保安：用于挂载红色警灯（点光源有上限） */
  const near = [null, null];
  const nearD = [Infinity, Infinity];

  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;
    syncGuardHealth(g);

    const pos = g.group.position;
    const dx = state.pos.x - pos.x;
    const dz = state.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < minDist) minDist = d;

    if (d < nearD[0]){ nearD[1] = nearD[0]; near[1] = near[0]; nearD[0] = d; near[0] = g; }
    else if (d < nearD[1]){ nearD[1] = d; near[1] = g; }

    if (d < GUARD_HIT_RADIUS && navigationSegmentClear(guardNavigation, pos, state.pos, 0.05)){
      if (!handleGuardCatch(g)) return;
    }

    const previousX = pos.x, previousZ = pos.z;
    moveGuard(g, i, realDt);
    updateGuardGait(g, Math.hypot(pos.x - previousX, pos.z - previousZ), realDt, t);
    updateGuardHealthBar(g);

    if (g.warnLight){
      const blink = gameOptions.blink ? 0.5 + 0.5 * Math.sin(t * 6 + g.phase) : 0.35;
      g.warnLight.material.color.setRGB(1, blink * 0.4, blink * 0.4);
      g.userData.blink = blink;
    }
    if (g.glow){
      /* 加法光晕跟着闪烁，紧张态下更亮更大 */
      const b = g.userData.blink || 0;
      const tn = getTension();
      g.glow.material.opacity = 0.16 + 0.42 * b + 0.30 * tn;
      g.glow.scale.setScalar(1 + 0.5 * b + 0.6 * tn);
    }
  }

  /* 红色警灯挂到最近的两名保安头顶（无保安时强度归零） */
  updateGuardLights(near, getTension());
  nearestGuardDist = minDist;
}

/* 最近活保安的距离（供紧张值系统读取；无保安为 Infinity） */
let nearestGuardDist = Infinity;

function endByGuards(){
  if (state.ended) return;
  if (currentRun().runMode === 'endless') { endEndless('血量耗尽'); return; }
  persistSave();
  finishRun('被 保 安 抓 走', '血量耗尽。答题娱乐分保留；可从最近检查点重试。', true);
}

/* 保安抓住玩家：有血条就扣 1 格，没有血条直接结局。
   受击无敌改为玩家侧 1 秒：任何保安都能抓，但玩家 1 秒内只掉一格。
   返回 false 表示本局已经结束。 */
function handleGuardCatch(g){
  const now = state.worldTime;    /* 用世界时钟：慢放期间受击间隔同样被拉长 */
  if (state.hpVisible && state.hp > 0){
    if (now - state.lastDamageAt < PLAYER_HURT_INVULN / 1000) return true;
    state.lastDamageAt = now;
    if (!damagePlayer(g, now)){
      endByGuards();
      return false;
    }
    return true;
  }
  endByGuards();
  return false;
}

/* =========================================================
   击杀里程碑 + 保安警告窗
   ---------------------------------------------------------
   - 击杀 10 / 20 / 50 / 100 解锁对应成就；
   - 从第 10 杀起，每次击杀有 GUARD_WARN_CHANCE 概率弹出保安队
     警告窗（3D 悬浮弹窗，必须交互消除）。文案按击杀数分四档，
     语气逐渐升级：口头提醒 → 正式警告 → 纪律处理 → 最后通牒；
   - 选项含"配合"与两条随机叛逆台词。配合：违抗计数清零；
     嘴硬：违抗计数 +1（直接推高紧张值，见 tension.js）并立刻
     叫来更多保安。
   ========================================================= */
const GUARD_WARN_MIN_KILLS = 10;   // 从第几杀开始可能弹窗
const GUARD_WARN_CHANCE    = 0.1; // 每次击杀的触发概率

const GUARD_WARN_LINES = [
  /* 档 0（10-19）：口头提醒 */
  [
    '同学，请停止攻击工作人员，配合我们维护考场秩序。',
    '保安同志正在赶来。请你放下拳头，我们可以当作什么都没发生。',
    '考场监控已全程记录。现在停手，还来得及。',
    '同学，打人不能加分。有话好好说，先放下手。'
  ],
  /* 档 1（20-49）：正式警告 */
  [
    '最后一次警告。继续袭击工作人员，我们将按考场纪律处理你。',
    '你的行为已构成扰乱考试秩序，我们有权取消你的成绩。',
    '考场秩序由我们负责，你的拳头不负责。立刻停手。',
    '再说一次：放下拳头。这是通知，不是请求。'
  ],
  /* 档 2（50-99）：纪律处理 */
  [
    '拒不配合者，我们有权取消成绩并禁赛三年。这是正式通知。',
    '你已经打倒了足够多的工作人员。收手，或者承担后果。',
    '考场外已经叫好了人。你要继续，我们就只能继续。',
    '《NOI 竞赛纪律》第三十一条：你现在每挥一拳，都在给自己记一笔。'
  ],
  /* 档 3（100+）：最后通牒 */
  [
    '现在立刻双手抱头蹲下，放弃抵抗，否则我们将动用物理。',
    '最后一次。抱头，蹲下，别逼我们把这考场拆了。',
    '你是考生，不是选手队。停下，或者我们让你停下。',
    '给你十秒。之后发生的事情，写在通报里会很难看。'
  ]
];

const GUARD_WARN_DEFY = ['那就试试', '我才不呢', '有本事来抓我啊',
                         '等我先把这题写完', '你们人多了不起？'];

/* 纯函数：按击杀数选警告档位（0=口头提醒 … 3=最后通牒） */
function guardWarnTier(kills){
  if (kills < 20)  return 0;
  if (kills < 50)  return 1;
  if (kills < 100) return 2;
  return 3;
}

/* 纯函数：本次是否触发警告窗 */
function guardWarnRoll(kills, rng){
  if (kills < GUARD_WARN_MIN_KILLS) return false;
  return rng() < GUARD_WARN_CHANCE;
}

function checkGuardKillMilestones(k){
  if (k >= 5)   unlockAch('guard_5');
  if (k >= 10)  unlockAch('guard10');
  if (k >= 20)  unlockAch('guard20');
  if (k >= 50)  unlockAch('guard50');
  if (k >= 100) unlockAch('guard100');
  if (currentRun().runMode === 'endless'){
    if (k >= 500) unlockAch('endless500');
    if (k >= 1000) unlockAch('endless1000');
  }
}

function maybeGuardWarning(){
  if (state.guardKills < 10 || state.realPlayTime - battle.broadcastAt < 20 || Math.random() >= 0.04) return;
  battle.broadcastAt = state.realPlayTime;
  const lines = GUARD_WARN_LINES[guardWarnTier(state.guardKills)];
  toast('广播：' + lines[Math.floor(Math.random() * lines.length)], 3000);
}

/* =========================================================
   考场通关结局
   ========================================================= */
function endByTotalVictory(){
  finishRun('无 人 能 挡', `考场 ${battle.kills} / ${battle.target} 名保安全部倒下，你走进了白光。`);
}

function hideAllPanels(){
  stopBattle();
  /* 3D 悬浮弹窗也要收场（弹窗不再是 DOM，无法用 classList 隐藏） */
  dismissDialogs();
  ['hud', 'pauseMenu', 'codeUI', 'paperUI', 'corridorUI',
   'bathroomUI', 'npcComputerUI', 'minimapWrap']
    .forEach(id => { const e = $(id); if (e) e.classList.add('hidden'); });
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
}
