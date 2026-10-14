'use strict';
const GUNS = {
  pistol: { name: '手枪', capacity: 12, interval: 0.24, reload: 1, range: 100 },
  rifle: { name: '自动步枪', capacity: 30, interval: 0.1, reload: 1.5, range: 100 }
};
const gunAmmo = { pistol: 12, rifle: 30 }, gunRigs = {}, shotTrails = [];
let gunCooldown = 0, gunReload = 0, gunReloadWeapon = null, gunTrigger = false, gunKick = 0;
const shotRay = new THREE.Raycaster(), shotCenter = new THREE.Vector2(0, 0);
function isFirearm(weapon){ return Object.hasOwn(GUNS, weapon); }
function gunMagazine(weapon){ return gunAmmo[weapon]; }
function restoreGunAmmo(ammo){
  for (const key of Object.keys(GUNS)){
    const n = ammo && ammo[key];
    gunAmmo[key] = typeof n === 'number' && Number.isFinite(n)
      ? Math.max(0, Math.min(GUNS[key].capacity, Math.floor(n))) : GUNS[key].capacity;
  }
  resetFirearms();
}
function clearFirearmInput(){ gunTrigger = false; }
function clearShotTrails(){
  for (const trail of shotTrails){ scene.remove(trail.line); trail.line.geometry.dispose(); trail.line.material.dispose(); }
  shotTrails.length = 0;
}
function resetFirearms(){
  clearFirearmInput(); clearShotTrails();
  gunCooldown = 0; gunReload = 0; gunReloadWeapon = null; gunKick = 0;
}
function selectWeapon(weapon){
  if (!canFight() || !['fist', 'chair', 'pistol', 'rifle'].includes(weapon) || (weapon === 'chair' && !heldChair)) return false;
  if (state.weapon === weapon) return true;
  clearFirearmInput(); gunReload = 0; gunReloadWeapon = null;
  state.weapon = weapon;
  toast(`已切换${isFirearm(weapon) ? GUNS[weapon].name : weapon === 'chair' ? '椅子' : '拳头'}`, 1000);
  return true;
}
function reloadGun(){
  if (!canFight() || !isFirearm(state.weapon) || gunReload > 0) return false;
  const gun = GUNS[state.weapon];
  if (gunAmmo[state.weapon] >= gun.capacity) return false;
  clearFirearmInput(); gunReloadWeapon = state.weapon; gunReload = gun.reload;
  audio.beep(320, 0.06, 0.025, 'triangle');
  return true;
}
function setFirearmTrigger(pressed){
  gunTrigger = !!pressed && canFight() && isFirearm(state.weapon);
  if (gunTrigger) fireGun();
}
function aimedGunHit(){
  camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  shotRay.setFromCamera(shotCenter, camera); shotRay.far = GUNS[state.weapon].range;
  const actors = new Map();
  for (const g of securityGuards) if (g.userData.alive) actors.set(g.group, { type: 'guard', actor: g });
  if (teacher && !teacher.userData.leaving) actors.set(teacher.group, { type: 'teacher', actor: teacher });
  for (const n of npcs) if (n.userData.state === 'seated') actors.set(n.group, { type: 'student', actor: n });
  const debris = new Set(debrisList.map(d => d.mesh));
  const roots = scene.children.filter(o => o !== camera && !o.userData.shotEffect && !debris.has(o));
  for (const hit of shotRay.intersectObjects(roots, true)){
    // Hidden gates, contact shadows and additive glows must not stop a bullet.
    let visible = true, target = null;
    for (let o = hit.object; o; o = o.parent){
      if (!o.visible) visible = false;
      if (actors.has(o)) target = actors.get(o);
    }
    if (!visible || hit.object.isSprite || hit.object.isLine) continue;
    const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
    if (hit.object.userData.contactShadow || materials.every(m => !m || (m.transparent && !m.depthWrite))) continue;
    return { ...target, point: hit.point };
  }
  return { point: shotRay.ray.at(shotRay.far, new THREE.Vector3()) };
}
function drawShotTrail(point){
  const start = new THREE.Vector3(0.22, -0.19, -0.65).applyMatrix4(camera.matrixWorld);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, point]),
    new THREE.LineBasicMaterial({ color: 0xffd789, transparent: true, opacity: 0.65, depthWrite: false }));
  line.userData.shotEffect = true; scene.add(line); shotTrails.push({ line, life: 0.055 });
  if (shotTrails.length > 8){
    const old = shotTrails.shift(); scene.remove(old.line); old.line.geometry.dispose(); old.line.material.dispose();
  }
}
function fireGun(){
  if (!canFight() || !isFirearm(state.weapon) || gunCooldown > 1e-6 || gunReload > 0) return false;
  const gun = GUNS[state.weapon];
  if (gunAmmo[state.weapon] <= 0){
    clearFirearmInput(); toast('弹匣已空 · 按 R 换弹', 1000); audio.beep(180, 0.04, 0.02); return false;
  }
  gunAmmo[state.weapon]--; gunCooldown = gun.interval; gunKick = 0.08;
  const hit = aimedGunHit();
  drawShotTrail(hit.point);
  audio.beep(state.weapon === 'rifle' ? 110 : 160, 0.07, 0.045, 'sawtooth');
  const scale = gameOptions.comfort ? 0.18 : 1;
  kickView(0.025 * scale, (Math.random() - 0.5) * 0.012 * scale);
  if (hit.type === 'guard'){
    killGuard(hit.actor); state.gunKills = (state.gunKills || 0) + 1;
    checkGuardKillMilestones(state.guardKills); maybeGuardWarning(); finishBattleIfReady();
  } else if (hit.type === 'teacher') downTeacher();
  else if (hit.type === 'student' && state.teacherDown) downNPC(hit.actor);
  return true;
}
function initGuns(){
  for (const key of Object.keys(GUNS)){
    const rig = new THREE.Group(), rifle = key === 'rifle';
    const metal = 0x253340, accent = rifle ? 0x527b72 : 0xd4ac67;
    box(rifle ? 0.13 : 0.10, 0.1, rifle ? 0.48 : 0.25, metal, 0, 0, -0.05, rig);
    box(0.07, 0.17, 0.09, 0x161f2a, 0, -0.12, 0.035, rig);
    box(0.115, 0.035, rifle ? 0.30 : 0.24, accent, 0, 0.065, -0.045, rig);
    box(0.05, 0.05, rifle ? 0.25 : 0.06, 0x0b1119, 0, 0, rifle ? -0.40 : -0.20, rig);
    box(0.11, 0.08, 0.12, 0xd0a070, 0, -0.19, 0.05, rig);
    if (rifle){
      box(0.10, 0.19, 0.10, 0x17232e, 0, -0.13, -0.1, rig);
      box(0.115, 0.11, 0.18, 0x364e59, 0, -0.01, 0.26, rig);
      box(0.035, 0.055, 0.04, 0x152129, 0, 0.11, -0.2, rig);
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd38a }));
    flash.position.set(0, 0, rifle ? -0.54 : -0.25); rig.add(flash); rig.userData.flash = flash;
    camera.add(rig); rig.visible = false; gunRigs[key] = rig;
  }
}
function updateFirearms(dt){
  gunKick = Math.max(0, gunKick - dt);
  for (let i = shotTrails.length - 1; i >= 0; i--){
    const trail = shotTrails[i]; trail.life -= dt;
    if (trail.life <= 0){ scene.remove(trail.line); trail.line.geometry.dispose(); trail.line.material.dispose(); shotTrails.splice(i, 1); }
  }
  if (!canFight()) clearFirearmInput();
  else {
    gunCooldown = Math.max(0, gunCooldown - dt);
    if (gunReload > 0){
      gunReload = Math.max(0, gunReload - dt);
      if (!gunReload && gunReloadWeapon){
        gunAmmo[gunReloadWeapon] = GUNS[gunReloadWeapon].capacity;
        gunReloadWeapon = null; audio.beep(480, 0.04, 0.025);
      }
    }
    if (gunTrigger && state.weapon === 'rifle') fireGun();
  }
  for (const [key, rig] of Object.entries(gunRigs)){
    rig.visible = state.weapon === key && state.view === 'world' && state.started && !state.ended;
    const loading = gunReloadWeapon === key && gunReload > 0;
    rig.position.set(0.25, -0.23 - (loading ? 0.18 : 0), -0.48 + gunKick * 0.65);
    rig.rotation.x = loading ? -0.5 : gunKick * 0.55;
    rig.userData.flash.visible = gunKick > 0.055 && gameOptions.blink;
  }
}
