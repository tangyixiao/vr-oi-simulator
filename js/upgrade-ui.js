'use strict';
function graphicsHtml(suffix){
  return `<div class="set-title">画质与舒适度</div>
    <div class="setting-row"><label for="quality${suffix}">画质</label><select id="quality${suffix}"><option value="low">低 · 更流畅</option><option value="standard">标准</option><option value="high">高 · 更多细节</option></select></div>
    <div class="setting-row"><label for="comfort${suffix}">特效预设</label><select id="comfort${suffix}"><option value="comfort">清晰舒适</option><option value="strong">原版强特效</option></select></div>
    <div class="effect-checks">${[['trail','拖影'],['shake','镜头抖动'],['blink','警灯闪烁'],['fragments','击倒碎块']].map(([key,label]) => `<label><input type="checkbox" id="${key}${suffix}"> ${label}</label>`).join('')}</div>`;
}
function initUpgradeUI(){
  $('graphicsStart').innerHTML = graphicsHtml('Start');
  $('graphicsPause').innerHTML = graphicsHtml('Pause');
  for (const suffix of ['Start','Pause']){
    $(`quality${suffix}`).addEventListener('change', e => {
      gameOptions.quality = e.target.value; applyQuality(); saveGameOptions(); syncUpgradeUI();
    });
    $(`comfort${suffix}`).addEventListener('change', e => {
      const strong = e.target.value === 'strong';
      Object.assign(gameOptions, { comfort: !strong, trail: strong, blink: strong, shake: strong });
      shakeEnabled = strong; saveGameOptions(); syncUpgradeUI();
    });
    for (const key of ['trail','shake','blink','fragments']){
      $(`${key}${suffix}`).addEventListener('change', e => {
        gameOptions[key] = e.target.checked;
        if (key === 'shake') shakeEnabled = e.target.checked;
        if (key === 'trail') postPrimed = false;
        if (key === 'fragments' && !e.target.checked) clearDebris();
        saveGameOptions(); syncUpgradeUI();
      });
    }
  }
  for (const [id,key] of [['combatMode','combatMode'],['runMode','runMode'],['guardTarget','guardTarget']]){
    $(id).addEventListener('change', e => {
      gameOptions = normalizeGameOptions({ ...gameOptions, [key]: e.target.value });
      saveGameOptions(); syncUpgradeUI();
    });
  }
  for (const btn of document.querySelectorAll('[data-guard-target]')) btn.onclick = () => {
    gameOptions.guardTarget = Number(btn.dataset.guardTarget); saveGameOptions(); syncUpgradeUI();
  };
  let hasSave = false;
  try { hasSave = !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY)); } catch(e){}
  $('resumeRow').classList.toggle('hidden', !hasSave);
  syncUpgradeUI();
}
function syncUpgradeUI(){
  $('combatMode').value = gameOptions.combatMode;
  $('runMode').value = gameOptions.runMode;
  $('guardTarget').value = gameOptions.guardTarget;
  $('guardTarget').disabled = gameOptions.runMode === 'endless' || state.started;
  $('combatMode').disabled = state.started; $('runMode').disabled = state.started;
  $('resumeSave').disabled = gameOptions.runMode === 'endless';
  for (const btn of document.querySelectorAll('[data-guard-target]')) btn.disabled = gameOptions.runMode === 'endless' || state.started;
  $('modeDescription').textContent = gameOptions.combatMode === 'power'
    ? '爽快：100 米 · 360° · 无冷却，一拳横扫全场。'
    : '挑战：拳头 2.4 米 / 90°，椅子 4 米 / 120°，无冷却，需要对准目标。';
  for (const suffix of ['Start','Pause']){
    $(`quality${suffix}`).value = gameOptions.quality;
    $(`comfort${suffix}`).value = gameOptions.comfort ? 'comfort' : 'strong';
    for (const key of ['trail','shake','blink','fragments']) $(`${key}${suffix}`).checked = key === 'shake' ? shakeEnabled : gameOptions[key];
  }
  syncViewUI();
  const run = currentRun();
  $('runSummary').textContent = `${run.combatMode === 'power' ? '爽快' : '挑战'} · ${run.runMode === 'endless' ? '无尽模式' : '剧情模式 · 考场目标 ' + run.guardTarget + ' 人'}（本局已锁定）`;
  $('btnEnd').textContent = run.runMode === 'endless' ? '结束挑战' : '交卷离场';
  $('btnPauseEnd').textContent = run.runMode === 'endless' ? '结束挑战' : '交卷离场';
  try {
    const best = JSON.parse(localStorage.getItem(`oi_endless_${gameOptions.combatMode}`) || '{}');
    $('endlessBest').textContent = `本模式无尽最佳：${best.kills || 0} 人 · 单次最高 ${best.bestPunch || 0}`;
  } catch(e){}
}
function applyQuality(){
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityBudget().dpr));
  renderer.setSize(innerWidth, innerHeight);
  resizePostFX(); postPrimed = false;
  const cap = effectiveDebrisCap();
  while (debrisList.length > cap){ const d = debrisList.shift(); scene.remove(d.mesh); d.mat.dispose(); }
}
