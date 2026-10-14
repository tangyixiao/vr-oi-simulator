'use strict';
/* Shared flow fields: one route per surrounding direction, rather than an A* per guard. */
function navigationSegmentClear(nav, a, b, radius = nav.radius){
  const inset = radius - nav.radius;
  if (b.x < nav.minX + inset || b.x > nav.maxX - inset ||
      b.z < nav.minZ + inset || b.z > nav.maxZ - inset) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const o of nav.obstacles){
    let lo = 0, hi = 1;
    for (const [start, delta, min, max] of [
      [a.x, dx, o.x - o.hw - radius, o.x + o.hw + radius],
      [a.z, dz, o.z - o.hd - radius, o.z + o.hd + radius]
    ]){
      if (Math.abs(delta) < 1e-10){
        if (start <= min || start >= max){ hi = -1; break; }
      } else {
        const t1 = (min - start) / delta, t2 = (max - start) / delta;
        lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
      }
    }
    if (lo <= hi && hi >= 0 && lo <= 1) return false;
  }
  return typeof terrainSegmentClear !== 'function' || terrainSegmentClear(a, b, radius);
}
function createGuardNavigation(bounds, obstacles){
  const radius = 0.3, step = 0.5;
  const nav = { radius, step, obstacles: obstacles.map(o => ({ ...o })),
    minX: -bounds.w / 2 + radius + 0.02, maxX: bounds.w / 2 - radius - 0.02,
    minZ: bounds.minZ ?? (-bounds.d / 2 + radius + 0.02),
    maxZ: bounds.maxZ ?? (bounds.d / 2 - radius - 0.02), nodes: [], fields: new Map(),
    terrainVersion: typeof getTerrainVersion === 'function' ? getTerrainVersion() : 0 };
  nav.cols = Math.floor((nav.maxX - nav.minX) / step) + 1;
  nav.rows = Math.floor((nav.maxZ - nav.minZ) / step) + 1;
  for (let z = 0; z < nav.rows; z++) for (let x = 0; x < nav.cols; x++){
    const node = { x: nav.minX + x * step, z: nav.minZ + z * step, edges: [] };
    node.y = typeof groundHeight === 'function' ? groundHeight(node.x, node.z) : 0;
    nav.nodes.push(navigationSegmentClear(nav, node, node) ? node : null);
  }
  for (let i = 0; i < nav.nodes.length; i++){
    const a = nav.nodes[i]; if (!a) continue;
    const x = i % nav.cols, z = Math.floor(i / nav.cols);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){
      if ((!dx && !dz) || x + dx < 0 || x + dx >= nav.cols || z + dz < 0 || z + dz >= nav.rows) continue;
      const j = (z + dz) * nav.cols + x + dx, b = nav.nodes[j];
      if (b && navigationSegmentClear(nav, a, b)) a.edges.push(j);
    }
  }
  return nav;
}
function nearestNavigationNode(nav, target, requireVisible = false){
  let best = -1, bestD = Infinity;
  const cx = Math.round((target.x - nav.minX) / nav.step), cz = Math.round((target.z - nav.minZ) / nav.step);
  function consider(i){
    const node = nav.nodes[i]; if (!node) return;
    const d = (node.x - target.x) ** 2 + (node.z - target.z) ** 2;
    if (d < bestD && (!requireVisible || navigationSegmentClear(nav, target, node))){ best = i; bestD = d; }
  }
  for (let z = Math.max(0, cz - 3); z <= Math.min(nav.rows - 1, cz + 3); z++)
    for (let x = Math.max(0, cx - 3); x <= Math.min(nav.cols - 1, cx + 3); x++) consider(z * nav.cols + x);
  if (best < 0) for (let i = 0; i < nav.nodes.length; i++) consider(i);
  return best;
}
function navigationField(nav, goal){
  if (nav.fields.has(goal)) return nav.fields.get(goal);
  const distances = new Int32Array(nav.nodes.length); distances.fill(-1);
  const queue = new Int32Array(nav.nodes.length); let read = 0, write = 1;
  queue[0] = goal; distances[goal] = 0;
  while (read < write){
    const i = queue[read++];
    for (const j of nav.nodes[i].edges) if (distances[j] < 0){
      distances[j] = distances[i] + 1; queue[write++] = j;
    }
  }
  // Bound cache growth as the player moves across the level.
  if (nav.fields.size >= 16) nav.fields.delete(nav.fields.keys().next().value);
  nav.fields.set(goal, distances);
  return distances;
}
function navigationTarget(nav, from, target){
  if (navigationSegmentClear(nav, from, target)) return target;
  const goal = nearestNavigationNode(nav, target), start = nearestNavigationNode(nav, from, true);
  if (goal < 0 || start < 0) return null;
  const field = navigationField(nav, goal);
  if (field[start] < 0) return null;
  let next = start, best = field[start];
  for (const i of nav.nodes[start].edges)
    if (field[i] >= 0 && field[i] < best && navigationSegmentClear(nav, from, nav.nodes[i])){
      next = i; best = field[i];
    }
  return nav.nodes[next];
}

let guardNavigation = null, guardNavClock = 0, guardNavPlayer = null;
function resetGuardNavigation(){ guardNavigation = null; guardNavPlayer = null; guardNavClock = 0; }
function updateGuardNavigation(dt){
  if (guardNavigation && typeof getTerrainVersion === 'function' && guardNavigation.terrainVersion !== getTerrainVersion()) resetGuardNavigation();
  if (!guardNavigation) guardNavigation = createGuardNavigation(worldBounds, obstacles);
  guardNavClock += dt;
  if (!guardNavPlayer || guardNavClock >= 0.25){
    guardNavPlayer = { x: state.pos.x, z: state.pos.z };
    guardNavClock = 0;
  }
}
function guardSurroundTarget(g, index){
  const pos = g.group.position, player = guardNavPlayer || state.pos;
  const d = Math.hypot(state.pos.x - pos.x, state.pos.z - pos.z);
  const angle = (g.userData.navSlot ?? index) % 8 * Math.PI / 4;
  let target = { x: player.x + Math.cos(angle) * 2, z: player.z + Math.sin(angle) * 2 };
  if (guardNavigation && !navigationSegmentClear(guardNavigation, target, target)){
    const cell = nearestNavigationNode(guardNavigation, target);
    if (cell >= 0) target = guardNavigation.nodes[cell];
  }
  if (d > 4.5) g.userData.closingIn = false;
  if (d < 1.3 || Math.hypot(pos.x - target.x, pos.z - target.z) < 0.6) g.userData.closingIn = true;
  return g.userData.closingIn ? state.pos : target;
}
function guardStepClear(g, nav, from, to){
  if (!navigationSegmentClear(nav, from, to)) return false;
  const dx = to.x - from.x, dz = to.z - from.z, lengthSq = dx * dx + dz * dz;
  for (const other of securityGuards){
    if (other === g || !other.userData.alive) continue;
    const p = other.group.position, x = from.x - p.x, z = from.z - p.z;
    const before = x * x + z * z;
    if (before < 0.16){
      // Overlapping spawns may separate, but cannot move further into each other.
      if ((to.x - p.x) ** 2 + (to.z - p.z) ** 2 < before - 1e-8) return false;
    } else {
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(x * dx + z * dz) / lengthSq)) : 0;
      if ((x + dx * t) ** 2 + (z + dz * t) ** 2 < 0.16) return false;
    }
  }
  return true;
}
function moveGuard(g, index, dt){
  const nav = guardNavigation, pos = g.group.position;
  if (!nav || dt <= 0) return;
  const target = guardSurroundTarget(g, index);
  const next = navigationTarget(nav, pos, target) || navigationTarget(nav, pos, state.pos);
  if (!next) return;
  let dx = next.x - pos.x, dz = next.z - pos.z;
  const distance = Math.hypot(dx, dz);
  const attraction = Math.min(1, distance / 0.6);
  if (distance > 0.001){ dx = dx / distance * attraction; dz = dz / distance * attraction; }
  else { dx = 0; dz = 0; }
  let sx = 0, sz = 0;
  for (const other of securityGuards){
    if (other === g || !other.userData.alive) continue;
    const x = pos.x - other.group.position.x, z = pos.z - other.group.position.z;
    const d = Math.hypot(x, z);
    if (d > 0.01 && d < 0.7){ sx += x / d * (0.7 - d); sz += z / d * (0.7 - d); }
    else if (d <= 0.01){ sx += Math.cos(index * 2.4) * 0.2; sz += Math.sin(index * 2.4) * 0.2; }
  }
  const strength = Math.hypot(sx, sz);
  if (strength > 0){ dx += sx / Math.max(1, strength) * 3; dz += sz / Math.max(1, strength) * 3; }
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;
  dx /= length; dz /= length;
  const far = Math.hypot(state.pos.x - pos.x, state.pos.z - pos.z) > 5;
  const speed = gameOptions.guardSpeed * (g.userData.speedFactor || 1) * (far ? 1.25 : 1);
  const travel = Math.min(speed * dt * Math.min(1, length), strength > 0.001 ? Infinity : distance);
  const steps = Math.max(1, Math.ceil(travel / 0.12)), step = travel / steps;
  for (let i = 0; i < steps; i++){
    const dest = { x: pos.x + dx * step, z: pos.z + dz * step };
    if (guardStepClear(g, nav, pos, dest)){ pos.x = dest.x; pos.z = dest.z; }
    else {
      // If separation pushes into a wall, follow the collision-free route alone.
      const remaining = Math.hypot(next.x - pos.x, next.z - pos.z);
      if (remaining < 0.001) break;
      const fallback = { x: pos.x + (next.x - pos.x) / remaining * Math.min(step, remaining),
        z: pos.z + (next.z - pos.z) / remaining * Math.min(step, remaining) };
      if (!guardStepClear(g, nav, pos, fallback)) break;
      pos.x = fallback.x; pos.z = fallback.z;
    }
  }
  g.group.rotation.y = Math.atan2(dx, dz);
}
