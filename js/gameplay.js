'use strict';
/* Run rules are independent of Three.js so they can also be tested in Node. */
const QUALITY = {
  low: { guards: 24, debris: 80, dpr: 1 },
  standard: { guards: 64, debris: 240, dpr: 1.25 },
  high: { guards: 96, debris: 480, dpr: 1.5 }
};
const GAME_SETTINGS_KEY = 'oi_game_v1';
function normalizeGameOptions(input){
  const o = input && typeof input === 'object' ? input : {};
  const n = Number(o.guardTarget);
  return {
    combatMode: o.combatMode === 'challenge' ? 'challenge' : 'power',
    runMode: o.runMode === 'endless' ? 'endless' : 'campaign',
    guardTarget: Number.isFinite(n) ? Math.max(50, Math.min(5000, Math.round(n))) : 200,
    quality: Object.hasOwn(QUALITY, o.quality) ? o.quality : 'standard',
    comfort: o.comfort !== false,
    trail: typeof o.trail === 'boolean' ? o.trail : o.comfort === false,
    blink: typeof o.blink === 'boolean' ? o.blink : o.comfort === false,
    fragments: o.fragments !== false,
    shake: typeof o.shake === 'boolean' ? o.shake : o.comfort === false
  };
}
let gameOptions = normalizeGameOptions(null);
const worldBounds = { w: 16, d: 14, h: 3.4 };
const battle = { active: false, stage: 'classroom', target: 200, spawned: 0,
  kills: 0, generation: 0, spawnClock: 0, ready: false, broadcastAt: -999 };
let frameAverage = 1 / 60, perfScale = 1, perfClock = 0;
let checkpoint = null;
function currentRun(){ return state.runConfig || gameOptions; }
function attackProfile(config, weapon){
  if (config.combatMode !== 'challenge') return { range: 100, halfArc: Math.PI };
  return weapon === 'chair' ? { range: 4, halfArc: Math.PI / 3 } : { range: 2.4, halfArc: Math.PI / 4 };
}
function targetInAttackRange(pos, yaw, target, profile){
  const x = target.x - pos.x, z = target.z - pos.z, d = Math.hypot(x, z);
  if (d > profile.range) return false;
  if (d < 1e-4 || profile.halfArc >= Math.PI) return true;
  return (-Math.sin(yaw) * x - Math.cos(yaw) * z) / d >= Math.cos(profile.halfArc) - 1e-10;
}
function stageQuotas(n){
  const total = Math.ceil(n / 2), first = Math.floor(total * 0.3);
  return [first, first, total - first * 2];
}
function spawnAllowance(spawned, alive, target, cap){
  return Math.max(0, Math.min(8, target - spawned, cap - alive));
}
function qualityBudget(){ return QUALITY[gameOptions.quality]; }
function effectiveDebrisCap(){ return Math.floor(qualityBudget().debris * perfScale); }
function loadGameOptions(){
  try { gameOptions = normalizeGameOptions(JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY))); } catch(e){}
  shakeEnabled = gameOptions.shake;
}
function saveGameOptions(){
  gameOptions.shake = shakeEnabled;
  try { localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(gameOptions)); } catch(e){}
}
function canFight(){
  return state.started && !state.ended && !state.frozen && state.view === 'world' && !hasDialog();
}
function updatePerformance(dt){
  if (!canFight() || !battle.active) return;
  frameAverage += (Math.min(dt, 0.25) - frameAverage) * 0.025;
  perfClock += dt;
  if (perfClock < 2) return;
  perfClock = 0;
  perfScale = frameAverage > 1 / 30 ? 0.5 : frameAverage > 1 / 45 ? 0.75 : 1;
  while (debrisList.length > effectiveDebrisCap()){
    const d = debrisList.shift(); scene.remove(d.mesh); d.mat.dispose();
  }
}
function beginBattle(stage, target){
  battle.generation++;
  Object.assign(battle, { stage, target, kills: 0, spawned: 0, active: true,
    ready: false, spawnClock: 0, broadcastAt: -999 });
  state.chapter = stage;
  state.doorOpen = false;
}
function stopBattle(){
  if (typeof cancelJudging === 'function') cancelJudging();
  if (typeof scene !== 'undefined' && typeof guardLights !== 'undefined') {
    for (const light of guardLights){ scene.add(light); light.intensity = 0; }
  }
  battle.generation++;
  battle.active = false;
  battle.spawnClock = 0;
}
function updateBattle(dt){
  if (!battle.active || !canFight()) return;
  battle.spawnClock += dt;
  if (battle.spawnClock < 0.25 / perfScale) return;
  battle.spawnClock = 0;
  spawnTwoGuards();
}
function finishBattleIfReady(){
  if (!battle.active || !Number.isFinite(battle.target) || battle.kills < battle.target) return;
  battle.active = false;
  battle.ready = true;
  if (battle.stage === 'classroom'){
    if (battle.kills >= 200) unlockAch('army');
    openFinalDoor();
  } else openCheckpointGate();
}
function recordPunch(n){
  state.bestPunch = Math.max(state.bestPunch || 0, n);
  if (n >= 50) unlockAch('one_punch');
  if (state.weapon === 'chair'){
    state.chairKills = (state.chairKills || 0) + n;
    if (state.chairKills >= 50) unlockAch('chair50');
  }
  if (currentRun().runMode === 'endless'){
    if (state.guardKills >= 500) unlockAch('endless500');
    if (state.guardKills >= 1000) unlockAch('endless1000');
  }
}
