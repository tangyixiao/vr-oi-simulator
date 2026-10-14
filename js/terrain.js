'use strict';
/* Bounded walkable surfaces; flat classroom ground is always zero. */
const terrainSurfaces = [];
let terrainVersion = 0;
const TERRAIN_MAX_SLOPE = 0.55, TERRAIN_MAX_STEP = 0.08;
function getTerrainVersion(){ return terrainVersion; }
function clearTerrain(){ terrainSurfaces.length = 0; terrainVersion++; }
function addTerrainPlatform(x, z, width, depth, height){
  const surface = { kind: 'platform', x, z, hw: width / 2, hd: depth / 2, height };
  terrainSurfaces.push(surface); terrainVersion++;
  return surface;
}
function addTerrainRamp(x, z, width, length, height, axis = 'z', direction = 1){
  const surface = { kind: 'ramp', x, z, hw: (axis === 'x' ? length : width) / 2,
    hd: (axis === 'x' ? width : length) / 2, height, axis, direction, length };
  terrainSurfaces.push(surface); terrainVersion++;
  return surface;
}
function groundHeight(x, z){
  let height = 0;
  for (const s of terrainSurfaces){
    if (Math.abs(x - s.x) > s.hw + 1e-7 || Math.abs(z - s.z) > s.hd + 1e-7) continue;
    const value = s.kind === 'platform' ? s.height
      : s.height * Math.max(0, Math.min(1, 0.5 + ((s.axis === 'x' ? x - s.x : z - s.z) * s.direction) / s.length));
    height = Math.max(height, value);
  }
  return height;
}
function terrainSegmentClear(a, b, radius = 0.28){
  if (!terrainSurfaces.length) return true;
  const minX = Math.min(a.x, b.x) - radius, maxX = Math.max(a.x, b.x) + radius;
  const minZ = Math.min(a.z, b.z) - radius, maxZ = Math.max(a.z, b.z) + radius;
  if (!terrainSurfaces.some(s => maxX >= s.x - s.hw && minX <= s.x + s.hw && maxZ >= s.z - s.hd && minZ <= s.z + s.hd)) return true;
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(distance / 0.08));
  const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
  const steepRamps = terrainSurfaces.filter(s => s.kind === 'ramp' && s.height / s.length > TERRAIN_MAX_SLOPE);
  for (const [ox, oz] of offsets){
    let previous = groundHeight(a.x + ox, a.z + oz);
    for (let i = 0; i <= steps; i++){
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      const height = groundHeight(x + ox, z + oz), center = groundHeight(x, z);
      for (const s of steepRamps){
        const px = x + ox, pz = z + oz;
        if (Math.abs(px - s.x) <= s.hw && Math.abs(pz - s.z) <= s.hd){
          const rampHeight = s.height * (0.5 + (s.axis === 'x' ? px - s.x : pz - s.z) * s.direction / s.length);
          if (Math.abs(height - rampHeight) < 1e-7) return false;
        }
      }
      if (Math.abs(height - previous) > Math.max(TERRAIN_MAX_STEP, distance / steps * TERRAIN_MAX_SLOPE) + 1e-7 ||
          Math.abs(height - center) > radius * TERRAIN_MAX_SLOPE + TERRAIN_MAX_STEP + 1e-7) return false;
      previous = height;
    }
  }
  return true;
}
/* Airborne players can cross a raised edge only once their feet clear it. */
function terrainAirSegmentClear(a, b, feetHeight){
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.08));
  for (let i = 1; i <= steps; i++){
    if (groundHeight(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps) > feetHeight + TERRAIN_MAX_STEP) return false;
  }
  return true;
}

/* The wedge is real solid geometry, so cover and gun raycasts see the same floor. */
function getTerrainRampGeo(width, length, height){
  const key = `terrain-ramp:${width}|${length}|${height}`;
  if (!geoCache.has(key)){
    const geo = new THREE.BufferGeometry(), w = width / 2, l = length / 2;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -w,0,-l, w,0,-l, -w,0,l, w,0,l, -w,height,l, w,height,l
    ], 3));
    geo.setIndex([0,4,5,0,5,1, 0,1,3,0,3,2, 2,3,5,2,5,4, 0,2,4, 1,5,3]);
    geo.computeVertexNormals();
    geoCache.set(key, geo);
  }
  return geoCache.get(key);
}
function buildTerrainPlatform(x, z, width, depth, height){
  const s = addTerrainPlatform(x, z, width, depth, height);
  box(width, height, depth, 0x4b6370, x, height / 2, z, scene);
  // Bright edge strips make the raised floor and its entry readable.
  for (const side of [-1, 1]) box(0.06, 0.012, depth, 0xd4bc70, x + side * (width / 2 - 0.06), height + 0.008, z, scene);
  return s;
}
function buildTerrainRamp(x, z, width, length, height, axis = 'z', direction = 1){
  const s = addTerrainRamp(x, z, width, length, height, axis, direction);
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = (axis === 'x' ? Math.PI / 2 : 0) + (direction < 0 ? Math.PI : 0);
  const mesh = new THREE.Mesh(getTerrainRampGeo(width, length, height), mat(0x71838b));
  group.add(mesh); scene.add(group);
  for (let i = 0; i < 6; i++){
    const f = (i + 0.5) / 6;
    const strip = box(width - 0.14, 0.012, 0.07, 0xd4bc70, 0, height * f + 0.012, length * (f - 0.5), group);
    strip.rotation.x = -Math.atan(height / length);
  }
  return s;
}
function buildTerrainCover(x, z, width, depth, height){
  const y = groundHeight(x, z);
  box(width, height, depth, 0x526b64, x, y + height / 2, z, scene);
  box(width + 0.06, 0.05, depth + 0.06, 0xb1bdaf, x, y + height, z, scene);
  addObstacle(x, z, width / 2, depth / 2);
}
function buildRaisedTerrain(index){
  if (index === 2){
    buildTerrainPlatform(-5.4, 1.8, 3.6, 3.8, 0.8);
    buildTerrainRamp(-5.4, 5.3, 2.2, 3.2, 0.8, 'z', -1);
    buildTerrainPlatform(5.2, -3.6, 3.8, 3.2, 1);
    buildTerrainRamp(5.2, 0, 2.2, 4, 1, 'z', -1);
    buildTerrainCover(-2.4, 4.1, 1.5, 0.5, 1);
    buildTerrainCover(2.4, -4.7, 1.5, 0.5, 1);
  } else if (index === 0){
    buildTerrainPlatform(-2.65, 4.6, 1.9, 2.8, 0.6);
    buildTerrainRamp(-2.65, 7.5, 1.9, 3, 0.6, 'z', -1);
  } else {
    buildTerrainPlatform(2.65, -6.3, 1.9, 1.8, 0.6);
    buildTerrainRamp(2.65, -4.2, 1.9, 2.4, 0.6, 'z', -1);
  }
}
