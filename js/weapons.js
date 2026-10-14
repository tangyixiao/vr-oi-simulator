'use strict';
const chairs = [];
let heldChair = null, fistRig = null, weaponSwing = 0;
const _chairPos = new THREE.Vector3();
function chairAvailable(c){
  c.group.getWorldPosition(_chairPos);
  return !npcs.some(n => n.userData.state === 'seated' &&
    Math.hypot(n.group.position.x - _chairPos.x, n.group.position.z - _chairPos.z) < 0.55);
}
function nearbyChair(){
  let best = null, nearest = 2;
  for (const c of chairs){
    if (!chairAvailable(c)) continue;
    c.group.getWorldPosition(_chairPos);
    const d = Math.hypot(_chairPos.x - state.pos.x, _chairPos.z - state.pos.z);
    if (d <= nearest){ best = c; nearest = d; }
  }
  return best;
}
function makeLooseChair(x, z){
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  box(0.46, 0.05, 0.46, 0x2e3440, 0, 0.45, 0, group);
  box(0.46, 0.52, 0.05, 0x2e3440, 0, 0.72, 0.21, group);
  for (const x1 of [-0.18, 0.18]) for (const z1 of [-0.18, 0.18])
    box(0.04, 0.45, 0.04, 0x242a34, x1, 0.22, z1, group);
  scene.add(group);
  const c = { group };
  chairs.push(c);
  return c;
}
function equipChair(c){
  chairs.splice(chairs.indexOf(c), 1);
  heldChair = c;
  camera.add(c.group);
  c.group.scale.setScalar(0.65);
  c.group.position.set(0.35, -0.65, -0.85);
  c.group.rotation.set(0.2, -0.35, 0.12);
  state.weapon = 'chair';
  if (fistRig) fistRig.visible = false;
}
function toggleChair(){
  if (!canFight()) return;
  if (isFirearm(state.weapon)){ reloadGun(); return; }
  if (heldChair && state.weapon !== 'chair'){ selectWeapon('chair'); return; }
  if (heldChair){
    const c = heldChair;
    const x = clamp(state.pos.x + Math.cos(state.yaw) * 0.6, -worldBounds.w/2 + 0.6, worldBounds.w/2 - 0.6);
    const z = clamp(state.pos.z - Math.sin(state.yaw) * 0.6,
      worldBounds.minZ ?? (-worldBounds.d/2 + 0.6), worldBounds.maxZ ?? (worldBounds.d/2 - 0.6));
    if (collides(x, z, 0.25)) { toast('旁边太挤了，移动到空处再放下椅子。', 1400); return; }
    scene.add(c.group);
    c.group.scale.setScalar(1);
    c.group.rotation.set(0, state.yaw, 0);
    c.group.position.set(x, 0, z);
    chairs.push(c);
    heldChair = null;
    state.weapon = 'fist';
    if (fistRig) fistRig.visible = true;
    toast('放下椅子 · 切换拳头', 1200);
  } else {
    const c = nearbyChair();
    if (!c) { toast('靠近空椅子 2 米内，再按 R 拾取。', 1600); return; }
    equipChair(c);
    toast('已拿起椅子！左键挥击 · R 放下', 1800);
  }
}
function initWeapons(){
  fistRig = new THREE.Group();
  fistRig.position.set(0.28, -0.26, -0.48);
  box(0.10, 0.11, 0.13, 0xd0a070, 0, 0, 0, fistRig);
  box(0.08, 0.08, 0.18, 0x324665, 0, -0.02, 0.12, fistRig);
  camera.add(fistRig);
  initGuns();
}
function animateWeaponSwing(){ weaponSwing = 0.16; }
function updateWeapons(dt){
  weaponSwing = Math.max(0, weaponSwing - dt);
  const v = Math.sin(Math.PI * weaponSwing / 0.16);
  if (heldChair){
    heldChair.group.position.set(0.35 - v * 0.25, -0.65 + v * 0.18, -0.85 - v * 0.3);
    heldChair.group.rotation.set(0.2 + v * 0.7, -0.35 - v * 0.9, 0.12);
  }
  if (fistRig){
    fistRig.visible = state.weapon === 'fist' && state.view === 'world' && state.started && !state.ended;
    fistRig.position.set(0.28 - v * 0.12, -0.26 + v * 0.08, -0.48 - v * 0.18);
  }
  if (heldChair) heldChair.group.visible = state.weapon === 'chair' && state.view === 'world' && state.started && !state.ended;
}
