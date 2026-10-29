/**
 * 3D Gameplay Entities, Glossy Sugar Bubbles, Giant Wobbling Water-Traps,
 * 4-Way Syrup/Water Blast Jets, 8 Pickups, Rideable Turtle & UFO Mounts,
 * Shield Auras, Steamed Buns, and Event VFX (`src/render/entity_meshes.js`).
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import {
  BLAST_LINGER_SEC,
  BUBBLE_FUSE_SEC,
  EVENT_TYPES,
  GRID_COLS,
  GRID_ROWS,
  ITEM_METADATA,
  ITEM_TYPES,
  PLAYER_STATES,
  TILE_TYPE,
  colToWorldX,
  normalizeItemType,
  rowToWorldZ,
  tileToWorldX,
  tileToWorldZ,
} from '../contracts/constants.js';
import {
  createCandyMaterial,
  createMetallicMaterial,
  createTurtleShellTexture,
} from './materials.js';

function markShared(resource) {
  if (resource) {
    resource.userData = resource.userData || {};
    resource.userData.shared = true;
  }
  return resource;
}

function disposeEntityHierarchy(rootObj) {
  if (!rootObj) return;
  rootObj.traverse((node) => {
    if (node.geometry && !node.geometry.userData?.shared) {
      node.geometry.dispose();
    }
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (m && !m.userData?.shared) {
          m.dispose();
        }
      }
    }
  });
}

function createPlacedSugarBubbleMesh(isBossBomb = false) {
  const g = new THREE.Group();

  // Soft floor shadow/glow disc
  const floorDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({
      color: isBossBomb ? 0xf97316 : 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  floorDisc.rotation.x = -Math.PI * 0.5;
  floorDisc.position.y = 0.02;
  g.add(floorDisc);

  const wobblePivot = new THREE.Group();
  wobblePivot.position.y = 0.46;
  g.add(wobblePivot);

  // Opaque inner pastel candy swirl core (`transparent: false` so transmission pass refracts it!)
  const coreGroup = new THREE.Group();
  const coreMat = createCandyMaterial(isBossBomb ? 0xef4444 : 0xff6b9d, {
    roughness: 0.15,
    clearcoat: 0.9,
    emissive: isBossBomb ? 0xf97316 : 0xff4d8d,
    emissiveIntensity: 0.35,
  });
  const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), coreMat);
  const swirlRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.038, 8, 18),
    createCandyMaterial(isBossBomb ? 0xfde047 : 0xfef08a, {
      emissive: 0xfacc15,
      emissiveIntensity: 0.3,
    })
  );
  swirlRing.rotation.x = 0.8;
  coreGroup.add(coreSphere, swirlRing);
  wobblePivot.add(coreGroup);

  // Crisp BackSide cyan/amber rim halo so every sugar bubble pops against any floor
  const rimMat = new THREE.MeshBasicMaterial({
    color: isBossBomb ? 0xf97316 : 0x0284c7,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const rimShell = new THREE.Mesh(new THREE.SphereGeometry(0.478, 24, 18), rimMat);
  rimShell.renderOrder = 2;
  wobblePivot.add(rimShell);

  // Outer Glossy Iridescent Candy Sugar Shell (single-pass WebGL2 for 60fps SwiftShader!)
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(isBossBomb ? 0xfb923c : 0x22d3ee),
    emissive: new THREE.Color(isBossBomb ? 0xea580c : 0x0284c7),
    emissiveIntensity: 0.20,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    roughness: 0.05,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    iridescence: 0.62,
    iridescenceIOR: 1.33,
    envMapIntensity: 1.45,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.455, 28, 22), shellMat);
  shell.renderOrder = 3;
  shell.castShadow = true;
  wobblePivot.add(shell);

  // Signature arcade white specular crescent highlight on upper-front-left
  const specMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const specMain = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), specMat);
  specMain.scale.set(1.35, 0.72, 0.35);
  specMain.position.set(-0.17, 0.24, 0.34);
  specMain.rotation.set(-0.45, -0.35, 0.45);

  const specDot = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), specMat);
  specDot.position.set(-0.06, 0.32, 0.31);
  wobblePivot.add(specMain, specDot);

  g.userData = {
    isBossBomb,
    wobblePivot,
    coreGroup,
    shellMat,
    floorDisc,
  };
  return g;
}

/**
 * Giant Wobbling Water-Trap Bubble (`困泡`, radius = 0.76) encasing a `trapped` character.
 * Uses a non-distorting crystal Fresnel shell (`transparent: true, opacity: 0.36, depthWrite: false`)
 * so the panicked chibi character & opaque 512x512 face inside stay 100% sharp and vivid!
 */
function createWaterTrapBubbleMesh() {
  const g = new THREE.Group();
  const centerPivot = new THREE.Group();
  centerPivot.position.y = 0.88;
  g.add(centerPivot);

  // BackSide cyan rim halo
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const rimHalo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 26, 20), rimMat);
  rimHalo.renderOrder = 3;
  centerPivot.add(rimHalo);

  // Crystal Fresnel outer water sphere (scaled to comfortably encase 1.35x character rig!)
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x60d5ff),
    emissive: new THREE.Color(0x0ea5e9),
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    roughness: 0.04,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    iridescence: 0.35,
    envMapIntensity: 2.0,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.92, 32, 24), shellMat);
  shell.renderOrder = 4;
  centerPivot.add(shell);

  // Crisp glossy specular crescent + dot on front-top-left
  const specMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const specArc = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), specMat);
  specArc.scale.set(1.45, 0.65, 0.28);
  specArc.position.set(-0.28, 0.42, 0.56);
  specArc.rotation.set(-0.5, -0.35, 0.48);
  specArc.renderOrder = 5;

  const specDot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), specMat);
  specDot.position.set(-0.10, 0.54, 0.52);
  specDot.renderOrder = 5;
  centerPivot.add(specArc, specDot);

  // 3 orbiting mini glossy water droplets
  const orbitGroup = new THREE.Group();
  const dropMat = createCandyMaterial(0x67e8f9, {
    roughness: 0.06,
    clearcoat: 1.0,
    emissive: 0x0284c7,
    emissiveIntensity: 0.25,
  });
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3;
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), dropMat);
    d.position.set(Math.cos(a) * 0.86, Math.sin(a * 2) * 0.18, Math.sin(a) * 0.86);
    orbitGroup.add(d);
  }
  centerPivot.add(orbitGroup);

  // Shrinking 3D ring timer around trapped player's water bubble
  const timerRingMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    side: THREE.DoubleSide,
    transparent: false,
  });
  const timerRing = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.055, 10, 36), timerRingMat);
  timerRing.rotation.x = Math.PI * 0.5;
  timerRing.position.y = 0.08;
  g.add(timerRing);

  g.userData = {
    centerPivot,
    shellMat,
    rimMat,
    orbitGroup,
    timerRing,
    timerRingMat,
  };
  return g;
}

/**
 * Rideable 3D Turtle Mount (`乌龟`, `transparent: false` on all solid meshes!).
 */
export function createTurtleMountMesh() {
  const g = new THREE.Group();
  const shellTex = createTurtleShellTexture();

  const shellMat = new THREE.MeshPhysicalMaterial({
    map: shellTex,
    roughness: 0.2,
    clearcoat: 0.88,
    transparent: false,
  });
  const rimMat = createCandyMaterial(0xfef3c7, { roughness: 0.28, clearcoat: 0.6 });
  const skinMat = createCandyMaterial(0x34d399, { roughness: 0.26, clearcoat: 0.65 });
  const eyeMat = createCandyMaterial(0x0f172a, { roughness: 0.08, clearcoat: 1.0 });
  const whiteMat = createCandyMaterial(0xffffff);

  // Generous emerald hex-patterned shell visibly framing rider from 55° overhead
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.46, 22, 16), shellMat);
  shell.scale.set(1.16, 0.64, 1.28);
  shell.position.set(0, 0.22, -0.02);
  g.add(shell);

  // Cream shell rim border
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 10, 24), rimMat);
  rim.scale.set(1.14, 1.28, 1.0);
  rim.rotation.x = Math.PI * 0.5;
  rim.position.set(0, 0.15, -0.02);
  g.add(rim);

  // Cute protruding turtle head at +Z front!
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.24, 0.62);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 14), skinMat);
  head.scale.set(1.0, 0.92, 1.18);
  headGroup.add(head);

  for (const side of [-1, 1]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.054, 10, 8), whiteMat);
    sclera.position.set(side * 0.105, 0.05, 0.135);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 8), eyeMat);
    pupil.position.set(side * 0.115, 0.05, 0.175);
    const blush = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      createCandyMaterial(0xfb7185)
    );
    blush.position.set(side * 0.135, -0.02, 0.125);
    headGroup.add(sclera, pupil, blush);
  }
  g.add(headGroup);

  // 4 paddling flippers + cute tail extending clearly around shell
  const flippers = [];
  for (const [fx, fz, yaw] of [
    [-0.46, 0.30, 0.42],
    [0.46, 0.30, -0.42],
    [-0.44, -0.30, -0.42],
    [0.44, -0.30, 0.42],
  ]) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), skinMat);
    fl.scale.set(1.30, 0.42, 0.88);
    fl.position.set(fx, 0.09, fz);
    fl.rotation.y = yaw;
    g.add(fl);
    flippers.push(fl);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.17, 8), skinMat);
  tail.rotation.x = -Math.PI * 0.45;
  tail.position.set(0, 0.14, -0.64);
  g.add(tail);

  g.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  g.userData = { kind: 'turtle', headGroup, flippers };
  return g;
}

/**
 * Rideable 3D UFO Mount (`飞碟`, sleek metallic violet & neon cyan saucer!).
 */
export function createUfoMountMesh() {
  const g = new THREE.Group();
  const hoverRoot = new THREE.Group();
  hoverRoot.position.y = 0.24;
  g.add(hoverRoot);

  const saucerMat = createMetallicMaterial(0xc084fc, {
    roughness: 0.18,
    metalness: 0.72,
    emissive: 0x7e22ce,
    emissiveIntensity: 0.18,
  });
  const cyanTrimMat = createCandyMaterial(0x22d3ee, {
    roughness: 0.1,
    clearcoat: 1.0,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.55,
  });

  // Beveled flying saucer hull
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.58, 0.18, 28), saucerMat);
  const lowerDish = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.26, 0.12, 28), saucerMat);
  lowerDish.position.y = -0.14;
  hoverRoot.add(hull, lowerDish);

  // Glowing cyan cockpit collar around rider seat
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.048, 10, 26), cyanTrimMat);
  collar.rotation.x = Math.PI * 0.5;
  collar.position.y = 0.11;
  hoverRoot.add(collar);

  // 8 Chasing Rainbow Rim Bulbs!
  const bulbSpinGroup = new THREE.Group();
  const bulbColors = [0xfde047, 0x38bdf8, 0xf472b6, 0x4ade80];
  const bulbGeo = new THREE.SphereGeometry(0.058, 10, 8);
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI * 2) / 8;
    const c = bulbColors[i % bulbColors.length];
    const b = new THREE.Mesh(
      bulbGeo,
      createCandyMaterial(c, { emissive: c, emissiveIntensity: 0.75, clearcoat: 1.0 })
    );
    b.position.set(Math.cos(a) * 0.53, -0.02, Math.sin(a) * 0.53);
    bulbSpinGroup.add(b);
  }
  hoverRoot.add(bulbSpinGroup);

  // Anti-gravity tractor ring on the ground
  const tractorRing = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.50, 28),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
  );
  tractorRing.rotation.x = -Math.PI * 0.5;
  tractorRing.position.y = 0.03;
  g.add(tractorRing);

  hoverRoot.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  g.userData = { kind: 'ufo', hoverRoot, bulbSpinGroup, tractorRing };
  return g;
}

/**
 * Plump Golden-Cream Pleated Steamed Bun (`包子` / Candy Bun for `bun_grab`).
 */
function createSteamedBunMesh(withFloorHalo = true) {
  const g = new THREE.Group();

  if (withFloorHalo) {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.38, 24),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      })
    );
    halo.rotation.x = -Math.PI * 0.5;
    halo.position.y = 0.025;
    g.add(halo);
    g.userData.halo = halo;
  }

  const bunPivot = new THREE.Group();
  bunPivot.position.y = withFloorHalo ? 0.30 : 0;
  g.add(bunPivot);

  // Golden bamboo saucer base
  const tray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.24, 0.06, 18),
    createCandyMaterial(0xf59e0b, { roughness: 0.25, clearcoat: 0.8 })
  );
  tray.position.y = -0.10;
  bunPivot.add(tray);

  // Plump warm-ivory & golden-glowing steamed bun body
  const bunMat = createCandyMaterial(0xfffbeb, {
    roughness: 0.22,
    clearcoat: 0.85,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.24,
  });
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), bunMat);
  bun.scale.set(1.08, 0.82, 1.08);
  bun.position.y = 0.06;
  bunPivot.add(bun);

  // Festive red prosperity dot on top of bun!
  const redDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 8),
    createCandyMaterial(0xef4444, { emissive: 0xe11d48, emissiveIntensity: 0.35 })
  );
  redDot.scale.set(1, 0.5, 1);
  redDot.position.y = 0.25;
  bunPivot.add(redDot);

  bunPivot.traverse((c) => {
    if (c.isMesh) c.castShadow = true;
  });
  g.userData.bunPivot = bunPivot;
  return g;
}

/**
 * Builds distinct 3D models for all 8 *QQ Tang* pickup types (`bubble`, `power`,
 * `speed`, `kick`, `needle`, `shield`, `turtle`, `ufo`).
 */
function createPickupModel(rawType) {
  const type = normalizeItemType(rawType) || ITEM_TYPES.BUBBLE;
  const meta = ITEM_METADATA[type] || ITEM_METADATA[ITEM_TYPES.BUBBLE];

  const root = new THREE.Group();

  // Color-coded glowing floor halo ring
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.38, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(meta.colorHex),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    })
  );
  halo.rotation.x = -Math.PI * 0.5;
  halo.position.y = 0.025;
  root.add(halo);

  const bobGroup = new THREE.Group();
  bobGroup.position.y = 0.38;
  root.add(bobGroup);

  const mainMat = createCandyMaterial(meta.colorHex, {
    roughness: 0.14,
    clearcoat: 0.95,
    emissive: meta.colorHex,
    emissiveIntensity: 0.22,
  });
  const accentMat = createCandyMaterial(meta.accentHex, {
    roughness: 0.16,
    clearcoat: 0.92,
    emissive: meta.accentHex,
    emissiveIntensity: 0.2,
  });
  const goldMat = createMetallicMaterial(0xfbbf24, { roughness: 0.2, metalness: 0.85 });

  switch (type) {
    case ITEM_TYPES.BUBBLE: {
      // Mini Sugar Bubble Orb + Orbiting Pink Ring
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), mainMat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.038, 8, 20), accentMat);
      ring.rotation.x = 0.8;
      ring.rotation.y = 0.4;
      bobGroup.add(orb, ring);
      break;
    }
    case ITEM_TYPES.POWER: {
      // Power Syrup Flask with Cork & Golden Flame Crown
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 14), mainMat);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.16, 12), accentMat);
      neck.position.y = 0.20;
      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.075, 0.08, 10),
        createCandyMaterial(0x92400e)
      );
      cork.position.y = 0.30;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.032, 8, 18), accentMat);
      band.rotation.x = Math.PI * 0.5;
      bobGroup.add(belly, neck, cork, band);
      break;
    }
    case ITEM_TYPES.SPEED: {
      // Sky-Blue Winged Roller Skate!
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.30), mainMat);
      boot.position.set(0, 0.06, -0.03);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 10), mainMat);
      toe.position.set(0, 0.0, 0.12);
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), accentMat);
      wing.rotation.x = -0.8;
      wing.position.set(0.11, 0.14, -0.10);
      const wheelMat = createCandyMaterial(0xfacc15);
      for (const [wx, wz] of [
        [-0.09, -0.10],
        [0.09, -0.10],
        [-0.09, 0.10],
        [0.09, 0.10],
      ]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), wheelMat);
        wh.rotation.z = Math.PI * 0.5;
        wh.position.set(wx, -0.09, wz);
        bobGroup.add(wh);
      }
      bobGroup.add(boot, toe, wing);
      break;
    }
    case ITEM_TYPES.KICK: {
      // Crimson-Gold Spring Kick Boot!
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.24, 0.32), mainMat);
      boot.position.set(0, 0.04, 0.02);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), accentMat);
      toe.position.set(0, -0.02, 0.18);
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 8, 16), goldMat);
      spring.position.set(0, 0.04, -0.19);
      bobGroup.add(boot, toe, spring);
      break;
    }
    case ITEM_TYPES.NEEDLE: {
      // Gleaming Rescue Needle (`救命针`) with Rosy Gem Head!
      const pinGroup = new THREE.Group();
      pinGroup.rotation.z = -0.58;
      const shaft = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.44, 12),
        createMetallicMaterial(0xf8fafc, { roughness: 0.15, metalness: 0.9 })
      );
      shaft.rotation.x = Math.PI;
      shaft.position.y = -0.05;
      const gemHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), accentMat);
      gemHead.position.y = 0.20;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 14), goldMat);
      collar.rotation.x = Math.PI * 0.5;
      collar.position.y = 0.11;
      pinGroup.add(shaft, gemHead, collar);
      bobGroup.add(pinGroup);
      break;
    }
    case ITEM_TYPES.SHIELD: {
      // Radiant Golden Hexagonal Candy Shield!
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.08, 6), goldMat);
      plate.rotation.x = Math.PI * 0.5;
      const bossGem = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 12, 10),
        createCandyMaterial(0x38bdf8, { emissive: 0x0ea5e9, emissiveIntensity: 0.4 })
      );
      bossGem.position.z = 0.05;
      bobGroup.add(plate, bossGem);
      break;
    }
    case ITEM_TYPES.TURTLE: {
      // Miniature Turtle Mount Token on Gold Pedestal Ring
      const miniTurtle = createTurtleMountMesh();
      miniTurtle.scale.setScalar(0.48);
      miniTurtle.position.y = -0.12;
      bobGroup.add(miniTurtle);
      break;
    }
    case ITEM_TYPES.UFO:
    default: {
      // Miniature UFO Saucer Token
      const miniUfo = createUfoMountMesh();
      miniUfo.scale.setScalar(0.52);
      miniUfo.position.y = -0.14;
      bobGroup.add(miniUfo);
      break;
    }
  }

  bobGroup.traverse((c) => {
    if (c.isMesh && !c.material.transparent) {
      c.castShadow = true;
    }
  });

  root.userData = { bobGroup, halo };
  return root;
}

/**
 * Golden Candy Shield Aura attached around a shielded player (`hasShield === true`).
 * Uses sleek orbiting golden shield gems + waist ring (`transparent: false` gems) so it
 * looks crisp and never obscures the Turtle/UFO mount or chibi face!
 */
function createShieldAuraMesh() {
  const g = new THREE.Group();
  const goldMat = createCandyMaterial(0xfacc15, {
    roughness: 0.1,
    clearcoat: 1.0,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.55,
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.032, 8, 28), goldMat);
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 0.56;
  g.add(ring);

  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), goldMat);
    gem.position.set(Math.cos(a) * 0.55, 0.56, Math.sin(a) * 0.55);
    g.add(gem);
  }
  return g;
}

/**
 * Glowing Floor Guide Ring + Directional Arrow pointing a Bun Carrier toward their Team Home Base!
 */
function createBunCarrierGuideMesh(team = 0) {
  const g = new THREE.Group();
  const color = team === 0 ? 0x38bdf8 : 0xfb7185;
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.66, 28), mat);
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.03;
  g.add(ring);

  // Pointer triangle pointing along +Z of guide group
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 3), mat);
  arrow.rotation.x = Math.PI * 0.5;
  arrow.position.set(0, 0.04, 0.82);
  g.add(arrow);

  return g;
}

function resolveTeamBaseWorldCoords(grid) {
  let blueSumX = 0;
  let blueSumZ = 0;
  let blueCount = 0;
  let redSumX = 0;
  let redSumZ = 0;
  let redCount = 0;

  if (Array.isArray(grid) && grid.length >= GRID_ROWS) {
    for (let r = 0; r < GRID_ROWS; r += 1) {
      const row = grid[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < GRID_COLS; c += 1) {
        if (row[c] === TILE_TYPE.TEAM_BASE_BLUE) {
          blueSumX += colToWorldX(c);
          blueSumZ += rowToWorldZ(r);
          blueCount += 1;
        } else if (row[c] === TILE_TYPE.TEAM_BASE_RED) {
          redSumX += colToWorldX(c);
          redSumZ += rowToWorldZ(r);
          redCount += 1;
        }
      }
    }
  }

  return {
    blueX: blueCount > 0 ? blueSumX / blueCount : tileToWorldX(1.5),
    blueZ: blueCount > 0 ? blueSumZ / blueCount : tileToWorldZ(6.5),
    redX: redCount > 0 ? redSumX / redCount : tileToWorldX(13.5),
    redZ: redCount > 0 ? redSumZ / redCount : tileToWorldZ(6.5),
  };
}

/**
 * Coordinates all dynamic 3D gameplay entities: placed sugar bubbles, giant water-trap
 * shells, 4-way blast jets, 8 pickups, rideable mounts, shields, buns, and burst VFX.
 */
export class EntityVisualManager {
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    this.bubbleGroup = new THREE.Group();
    this.trapGroup = new THREE.Group();
    this.blastGroup = new THREE.Group();
    this.pickupGroup = new THREE.Group();
    this.bunGroup = new THREE.Group();
    this.playerAttachmentGroup = new THREE.Group();
    this.vfxGroup = new THREE.Group();

    this.parentGroup.add(
      this.pickupGroup,
      this.bunGroup,
      this.playerAttachmentGroup,
      this.bubbleGroup,
      this.blastGroup,
      this.trapGroup,
      this.vfxGroup
    );

    this.bubblesById = new Map();
    this.trapsByPlayerId = new Map();
    this.mountsByPlayerId = new Map();
    this.shieldsByPlayerId = new Map();
    this.carriedBunsByPlayerId = new Map();
    this.carrierGuidesByPlayerId = new Map();
    this.pickupsById = new Map();
    this.looseBunsById = new Map();
    this.blastsById = new Map();
    this.burstParticles = [];

    // Shared blast & VFX geometries marked shared so per-entity disposal never frees them
    this._blastBeamGeo = markShared(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 14));
    this._blastCoreGeo = markShared(new THREE.CylinderGeometry(0.14, 0.14, 1.02, 10));
    this._blastDomeGeo = markShared(new THREE.SphereGeometry(0.36, 16, 12));
    this._blastCrownGeo = markShared(new THREE.ConeGeometry(0.48, 0.55, 10, 1, true));
    this._blastRingGeo = markShared(new THREE.RingGeometry(0.22, 0.44, 16));
    this._vfxSphereGeo = markShared(new THREE.SphereGeometry(0.11, 10, 8));
  }

  /**
   * Clears all transient match entities and safely frees uncached GPU resources.
   */
  clearAll() {
    for (const [m, grp] of [
      [this.bubblesById, this.bubbleGroup],
      [this.trapsByPlayerId, this.trapGroup],
      [this.mountsByPlayerId, this.playerAttachmentGroup],
      [this.shieldsByPlayerId, this.playerAttachmentGroup],
      [this.carriedBunsByPlayerId, this.playerAttachmentGroup],
      [this.carrierGuidesByPlayerId, this.playerAttachmentGroup],
      [this.pickupsById, this.pickupGroup],
      [this.looseBunsById, this.bunGroup],
      [this.blastsById, this.blastGroup],
    ]) {
      for (const obj of m.values()) {
        grp.remove(obj);
        disposeEntityHierarchy(obj);
      }
      m.clear();
    }
    for (const p of this.burstParticles) {
      this.vfxGroup.remove(p.mesh);
      if (p.mat && !p.mat.userData?.shared) {
        p.mat.dispose();
      }
    }
    this.burstParticles = [];
  }

  /**
   * Syncs all entity meshes with `SimSnapshot` and advances 60fps animations.
   */
  sync(snapshot, timeSec = 0, dtSec = 1 / 60, eventsOverride = null) {
    if (!snapshot) return;

    this._syncBubbles(snapshot.bubbles || [], timeSec);
    this._syncPlayerAttachments(snapshot.players || [], timeSec, snapshot.grid || null);
    this._syncBlasts(snapshot.blasts || [], timeSec, snapshot.players || []);
    this._syncPickups(snapshot.pickups || [], timeSec);
    this._syncLooseBuns(snapshot.looseBuns || [], timeSec);
    const events = Array.isArray(eventsOverride) ? eventsOverride : snapshot.events || [];
    this._consumeEvents(events, snapshot.players || []);
    this._stepBurstParticles(dtSec);
  }

  _syncBubbles(bubbles, timeSec) {
    const activeIds = new Set();
    for (let i = 0; i < bubbles.length; i += 1) {
      const b = bubbles[i];
      activeIds.add(b.id);
      const isBossBomb = b.ownerId === 'boss';

      let mesh = this.bubblesById.get(b.id);
      if (mesh && Boolean(mesh.userData.isBossBomb) !== isBossBomb) {
        this.bubbleGroup.remove(mesh);
        disposeEntityHierarchy(mesh);
        this.bubblesById.delete(b.id);
        mesh = null;
      }
      if (!mesh) {
        mesh = createPlacedSugarBubbleMesh(isBossBomb);
        this.bubbleGroup.add(mesh);
        this.bubblesById.set(b.id, mesh);
      }

      mesh.position.set(tileToWorldX(b.x), 0, tileToWorldZ(b.z));

      // Accelerating squash-and-stretch fuse pulse!
      const fuseRatio = Math.max(0, Math.min(1, b.fuseRemaining / BUBBLE_FUSE_SEC));
      const urgency = 1.0 - fuseRatio;
      const inCriticalWarning = b.fuseRemaining <= 0.80;
      const freq = inCriticalWarning ? 32.0 : 7.0 + urgency * urgency * 18.0;
      const amp = inCriticalWarning ? 0.16 : 0.075 + urgency * 0.065;
      const wave = Math.sin(timeSec * freq + b.id * 1.3);

      const ud = mesh.userData;
      ud.wobblePivot.scale.set(1.0 + wave * amp, 1.0 - wave * amp, 1.0 + wave * amp);
      ud.coreGroup.rotation.y = timeSec * 2.6 + b.id;
      ud.coreGroup.rotation.z = timeSec * 1.8;

      if (!ud.isBossBomb) {
        if (inCriticalWarning) {
          // Vivid crimson-red pulse in the last 0.8s before detonation!
          const flash = 0.5 + 0.5 * Math.sin(timeSec * 34);
          ud.shellMat.color.setHex(flash > 0.45 ? 0xff1744 : 0xffffff);
          ud.shellMat.emissive.setHex(0xff1744);
          ud.shellMat.emissiveIntensity = 0.38 + flash * 0.52;
        } else {
          ud.shellMat.color.setHex(0x38bdf8);
          ud.shellMat.emissive.setHex(0x0284c7);
          ud.shellMat.emissiveIntensity = 0.14;
        }
      }
    }

    for (const [id, mesh] of this.bubblesById.entries()) {
      if (!activeIds.has(id)) {
        this.bubbleGroup.remove(mesh);
        disposeEntityHierarchy(mesh);
        this.bubblesById.delete(id);
      }
    }
  }

  _syncPlayerAttachments(players, timeSec, grid = null) {
    const trappedIds = new Set();
    const mountedIds = new Set();
    const shieldedIds = new Set();
    const carrierIds = new Set();
    let baseCoords = null;

    for (let i = 0; i < players.length; i += 1) {
      const p = players[i];
      if (p.state === PLAYER_STATES.ELIMINATED) continue;

      const wx = tileToWorldX(p.x);
      const wz = tileToWorldZ(p.z);

      // 1. Giant Wobbling Water-Trap Shell (`state === 'trapped'`)
      if (p.state === PLAYER_STATES.TRAPPED) {
        trappedIds.add(p.id);
        let trapMesh = this.trapsByPlayerId.get(p.id);
        if (!trapMesh) {
          trapMesh = createWaterTrapBubbleMesh();
          this.trapGroup.add(trapMesh);
          this.trapsByPlayerId.set(p.id, trapMesh);
        }
        trapMesh.position.set(wx, 0, wz);

        const ud = trapMesh.userData;
        const nearBurst = p.trapTimer < 1.5;
        const wobFreq = nearBurst ? 18.0 : 8.5;
        const wob = Math.sin(timeSec * wobFreq + i);
        ud.centerPivot.scale.set(1.0 + wob * 0.055, 1.0 - wob * 0.055, 1.0 + wob * 0.055);
        ud.orbitGroup.rotation.y = timeSec * 2.4;

        if (ud.timerRing && ud.timerRingMat) {
          const timerFrac = Math.max(0.18, Math.min(1.0, (p.trapTimer || 0) / 5.5));
          ud.timerRing.scale.set(timerFrac, timerFrac, 1);
          ud.timerRingMat.color.setHex(nearBurst ? 0xef4444 : 0xfacc15);
        }

        if (nearBurst) {
          const urgent = 0.5 + 0.5 * Math.sin(timeSec * 24);
          ud.shellMat.color.setHex(urgent > 0.5 ? 0xff6b9d : 0x60d5ff);
          ud.shellMat.emissive.setHex(0xf43f5e);
          ud.shellMat.emissiveIntensity = 0.28 + urgent * 0.25;
        } else {
          ud.shellMat.color.setHex(0x60d5ff);
          ud.shellMat.emissive.setHex(0x0ea5e9);
          ud.shellMat.emissiveIntensity = 0.18;
        }
      }

      // 2. Rideable Turtle or UFO Mount (`alive && (mount === 'turtle' || 'ufo')`)
      if (
        p.state === PLAYER_STATES.ALIVE &&
        (p.mount === ITEM_TYPES.TURTLE || p.mount === ITEM_TYPES.UFO)
      ) {
        mountedIds.add(p.id);
        let mountMesh = this.mountsByPlayerId.get(p.id);
        if (mountMesh && mountMesh.userData.kind !== p.mount) {
          this.playerAttachmentGroup.remove(mountMesh);
          disposeEntityHierarchy(mountMesh);
          mountMesh = null;
        }
        if (!mountMesh) {
          mountMesh =
            p.mount === ITEM_TYPES.UFO ? createUfoMountMesh() : createTurtleMountMesh();
          this.playerAttachmentGroup.add(mountMesh);
          this.mountsByPlayerId.set(p.id, mountMesh);
        }

        mountMesh.position.set(wx, 0, wz);
        mountMesh.rotation.y = p.facingRad || 0;

        if (p.mount === ITEM_TYPES.TURTLE) {
          const rate = p.isMoving ? 14 : 3.5;
          const amp = p.isMoving ? 0.42 : 0.08;
          const flips = mountMesh.userData.flippers;
          for (let fi = 0; fi < flips.length; fi += 1) {
            const sign = fi % 2 === 0 ? 1 : -1;
            flips[fi].rotation.x = Math.sin(timeSec * rate + fi) * amp * sign;
          }
          mountMesh.userData.headGroup.position.y =
            0.24 + Math.sin(timeSec * 5.0) * 0.02;
        } else {
          // UFO hover & spinning rainbow rim bulbs
          mountMesh.userData.hoverRoot.position.y =
            0.24 + Math.sin(timeSec * 5.2) * 0.045;
          mountMesh.userData.bulbSpinGroup.rotation.y = timeSec * 3.8;
          const ts = 0.92 + Math.sin(timeSec * 8.0) * 0.10;
          mountMesh.userData.tractorRing.scale.set(ts, ts, 1);
        }
      }

      // 3. Protective Candy Shield Aura (`hasShield === true`)
      if (p.hasShield) {
        shieldedIds.add(p.id);
        let shieldMesh = this.shieldsByPlayerId.get(p.id);
        if (!shieldMesh) {
          shieldMesh = createShieldAuraMesh();
          this.playerAttachmentGroup.add(shieldMesh);
          this.shieldsByPlayerId.set(p.id, shieldMesh);
        }
        shieldMesh.position.set(wx, p.mount ? 0.25 : 0, wz);
        shieldMesh.rotation.y = timeSec * 2.8;
      }

      // 4. Overhead Carried Steamed Bun + Team Home Base Guide Ring (`carryingBun === true`)
      if (p.carryingBun && p.state === PLAYER_STATES.ALIVE) {
        carrierIds.add(p.id);
        let bunHat = this.carriedBunsByPlayerId.get(p.id);
        if (!bunHat) {
          bunHat = createSteamedBunMesh(false);
          this.playerAttachmentGroup.add(bunHat);
          this.carriedBunsByPlayerId.set(p.id, bunHat);
        }
        const liftY = p.mount ? 1.80 : 1.44;
        bunHat.position.set(wx, liftY + Math.sin(timeSec * 6.0) * 0.04, wz);
        bunHat.rotation.y = timeSec * 2.0;

        let guide = this.carrierGuidesByPlayerId.get(p.id);
        if (!guide || guide.userData.team !== p.team) {
          if (guide) {
            this.playerAttachmentGroup.remove(guide);
            disposeEntityHierarchy(guide);
          }
          guide = createBunCarrierGuideMesh(p.team);
          guide.userData.team = p.team;
          this.playerAttachmentGroup.add(guide);
          this.carrierGuidesByPlayerId.set(p.id, guide);
        }
        guide.position.set(wx, 0, wz);
        if (!baseCoords) {
          baseCoords = resolveTeamBaseWorldCoords(grid);
        }
        const baseX = p.team === 0 ? baseCoords.blueX : baseCoords.redX;
        const baseZ = p.team === 0 ? baseCoords.blueZ : baseCoords.redZ;
        guide.rotation.y = Math.atan2(baseX - wx, baseZ - wz);
      }
    }

    for (const [pid, m] of this.trapsByPlayerId.entries()) {
      if (!trappedIds.has(pid)) {
        this.trapGroup.remove(m);
        disposeEntityHierarchy(m);
        this.trapsByPlayerId.delete(pid);
      }
    }
    for (const [pid, m] of this.mountsByPlayerId.entries()) {
      if (!mountedIds.has(pid)) {
        this.playerAttachmentGroup.remove(m);
        disposeEntityHierarchy(m);
        this.mountsByPlayerId.delete(pid);
      }
    }
    for (const [pid, m] of this.shieldsByPlayerId.entries()) {
      if (!shieldedIds.has(pid)) {
        this.playerAttachmentGroup.remove(m);
        disposeEntityHierarchy(m);
        this.shieldsByPlayerId.delete(pid);
      }
    }
    for (const [pid, m] of this.carriedBunsByPlayerId.entries()) {
      if (!carrierIds.has(pid)) {
        this.playerAttachmentGroup.remove(m);
        disposeEntityHierarchy(m);
        this.carriedBunsByPlayerId.delete(pid);
      }
    }
    for (const [pid, m] of this.carrierGuidesByPlayerId.entries()) {
      if (!carrierIds.has(pid)) {
        this.playerAttachmentGroup.remove(m);
        disposeEntityHierarchy(m);
        this.carrierGuidesByPlayerId.delete(pid);
      }
    }
  }

  _syncBlasts(blasts, timeSec, players = []) {
    const activeIds = new Set();

    for (let i = 0; i < blasts.length; i += 1) {
      const bl = blasts[i];
      activeIds.add(bl.id);

      let group = this.blastsById.get(bl.id);
      if (!group) {
        group = this._buildBlastWaveMesh(bl, players);
        this.blastGroup.add(group);
        this.blastsById.set(bl.id, group);
      }

      const elapsed = Math.max(0, BLAST_LINGER_SEC - bl.remainingSec);
      const lifeRatio = Math.max(0.05, Math.min(1.0, bl.remainingSec / BLAST_LINGER_SEC));

      // Punchy 120ms scale-pop at detonation, then smooth taper
      let popScale = 1.0;
      if (elapsed <= 0.12) {
        popScale = 1.0 + Math.sin((elapsed / 0.12) * Math.PI) * 0.34;
      } else {
        popScale = Math.max(0.28, Math.pow(lifeRatio, 0.5));
      }

      group.userData.beamContainer.scale.set(
        Math.max(0.5, Math.min(1.34, popScale)),
        Math.max(0.25, popScale * 1.12),
        Math.max(0.5, Math.min(1.34, popScale))
      );
      group.userData.outerMat.opacity = 0.94 * Math.min(1, lifeRatio * 1.5);
      if (group.userData.crown) {
        group.userData.crown.rotation.y = timeSec * 8.0;
      }
    }

    for (const [id, group] of this.blastsById.entries()) {
      if (!activeIds.has(id)) {
        this.blastGroup.remove(group);
        disposeEntityHierarchy(group);
        this.blastsById.delete(id);
      }
    }
  }

  _buildBlastWaveMesh(bl, players = []) {
    const isBoss = bl.ownerId === 'boss';
    const ownerPlayer = Array.isArray(players)
      ? players.find((p) => p.id === bl.ownerId)
      : null;
    const isRedTeam =
      !isBoss &&
      (ownerPlayer ? ownerPlayer.team === 1 : bl.ownerId === 'bot2' || bl.ownerId === 'bot3');
    const teamRingColor = isBoss ? 0xff6d00 : isRedTeam ? 0xff1744 : 0x0066ff;

    const root = new THREE.Group();
    const beamContainer = new THREE.Group();
    beamContainer.position.y = 0.38;
    root.add(beamContainer);

    // Saturated team-colored outer shell + ring
    const outerMat = new THREE.MeshBasicMaterial({
      color: teamRingColor,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    });
    // Opaque white-hot core (`transparent: false` so it reads unmistakably on every floor!)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: false,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: teamRingColor,
      side: THREE.DoubleSide,
      transparent: false,
    });

    const tileSet = new Set();
    for (let i = 0; i < bl.tiles.length; i += 1) {
      tileSet.add(`${bl.tiles[i].col},${bl.tiles[i].row}`);
    }

    let crown = null;
    for (let i = 0; i < bl.tiles.length; i += 1) {
      const t = bl.tiles[i];
      const wx = colToWorldX(t.col);
      const wz = rowToWorldZ(t.row);

      if (t.dir === 'center') {
        const dome = new THREE.Mesh(this._blastDomeGeo, outerMat);
        dome.scale.setScalar(1.12);
        dome.position.set(wx, 0.02, wz);
        const coreDome = new THREE.Mesh(this._blastDomeGeo, coreMat);
        coreDome.scale.setScalar(0.74);
        coreDome.position.set(wx, 0.02, wz);
        beamContainer.add(dome, coreDome);

        // Check if neighbors also exist in tileSet (e.g. Boss steam_shockwave / sky_bomb_barrage)
        for (const [dc, dr, rotZ, rotX] of [
          [1, 0, Math.PI * 0.5, 0],
          [0, 1, 0, Math.PI * 0.5],
        ]) {
          if (tileSet.has(`${t.col + dc},${t.row + dr}`)) {
            const bridge = new THREE.Mesh(this._blastBeamGeo, outerMat);
            bridge.position.set(wx + dc * 0.5, 0, wz + dr * 0.5);
            bridge.rotation.set(rotX, 0, rotZ);
            const bridgeCore = new THREE.Mesh(this._blastCoreGeo, coreMat);
            bridgeCore.scale.set(1.25, 1, 1.25);
            bridgeCore.position.copy(bridge.position);
            bridgeCore.rotation.copy(bridge.rotation);
            beamContainer.add(bridge, bridgeCore);
          }
        }

        if (!crown && t.col === bl.originCol && t.row === bl.originRow) {
          crown = new THREE.Mesh(this._blastCrownGeo, outerMat);
          crown.rotation.x = Math.PI;
          crown.position.set(wx, 0.18, wz);
          beamContainer.add(crown);
        }
      } else {
        // Directional cardinal water/syrup jet segment!
        const isHorizontal = t.dir === 'east' || t.dir === 'west';
        const seg = new THREE.Mesh(this._blastBeamGeo, outerMat);
        seg.scale.set(1.12, 1, 1.12);
        seg.position.set(wx, 0, wz);
        if (isHorizontal) seg.rotation.z = Math.PI * 0.5;
        else seg.rotation.x = Math.PI * 0.5;

        const core = new THREE.Mesh(this._blastCoreGeo, coreMat);
        core.scale.set(1.32, 1, 1.32);
        core.position.set(wx, 0, wz);
        core.rotation.copy(seg.rotation);
        beamContainer.add(seg, core);

        // Rounded foam cap at ray tip if next step along `dir` is not in `tileSet`
        const stepC = t.dir === 'east' ? 1 : t.dir === 'west' ? -1 : 0;
        const stepR = t.dir === 'south' ? 1 : t.dir === 'north' ? -1 : 0;
        if (!tileSet.has(`${t.col + stepC},${t.row + stepR}`)) {
          const cap = new THREE.Mesh(this._blastDomeGeo, coreMat);
          cap.scale.setScalar(0.82);
          cap.position.set(wx + stepC * 0.36, 0, wz + stepR * 0.36);
          beamContainer.add(cap);
        }
      }

      // Saturated team-colored ground splash ring under every blast tile
      const ring = new THREE.Mesh(this._blastRingGeo, ringMat);
      ring.rotation.x = -Math.PI * 0.5;
      ring.position.set(wx, 0.025, wz);
      root.add(ring);
    }

    root.userData = { beamContainer, outerMat, coreMat, ringMat, crown };
    return root;
  }

  _syncPickups(pickups, timeSec) {
    const activeIds = new Set();
    for (let i = 0; i < pickups.length; i += 1) {
      const pk = pickups[i];
      activeIds.add(pk.id);

      let mesh = this.pickupsById.get(pk.id);
      if (!mesh) {
        mesh = createPickupModel(pk.type);
        this.pickupGroup.add(mesh);
        this.pickupsById.set(pk.id, mesh);
      }

      mesh.position.set(tileToWorldX(pk.x), 0, tileToWorldZ(pk.z));
      const ud = mesh.userData;
      ud.bobGroup.position.y = 0.38 + Math.sin(timeSec * 4.2 + pk.id) * 0.08;
      ud.bobGroup.rotation.y = timeSec * 2.2 + pk.id * 0.7;
      const hs = 0.92 + Math.sin(timeSec * 5.0 + pk.id) * 0.10;
      ud.halo.scale.set(hs, hs, 1);
    }

    for (const [id, mesh] of this.pickupsById.entries()) {
      if (!activeIds.has(id)) {
        this.pickupGroup.remove(mesh);
        disposeEntityHierarchy(mesh);
        this.pickupsById.delete(id);
      }
    }
  }

  _syncLooseBuns(looseBuns, timeSec) {
    const activeIds = new Set();
    for (let i = 0; i < looseBuns.length; i += 1) {
      const bun = looseBuns[i];
      activeIds.add(bun.id);

      let mesh = this.looseBunsById.get(bun.id);
      if (!mesh) {
        mesh = createSteamedBunMesh(true);
        this.bunGroup.add(mesh);
        this.looseBunsById.set(bun.id, mesh);
      }

      mesh.position.set(tileToWorldX(bun.x), 0, tileToWorldZ(bun.z));
      mesh.userData.bunPivot.position.y = 0.28 + Math.sin(timeSec * 3.8 + bun.id) * 0.06;
      mesh.userData.bunPivot.rotation.y = timeSec * 1.6 + bun.id;
    }

    for (const [id, mesh] of this.looseBunsById.entries()) {
      if (!activeIds.has(id)) {
        this.bunGroup.remove(mesh);
        disposeEntityHierarchy(mesh);
        this.looseBunsById.delete(id);
      }
    }
  }

  _consumeEvents(events, players) {
    if (!events || events.length === 0) return;

    const findPlayerWorld = (pid) => {
      const p = players.find((pl) => pl.id === pid);
      return p ? [tileToWorldX(p.x), tileToWorldZ(p.z)] : null;
    };

    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (ev.type === EVENT_TYPES.POP) {
        const pos = findPlayerWorld(ev.victimId) || [
          colToWorldX(ev.col ?? 7),
          rowToWorldZ(ev.row ?? 6),
        ];
        this._spawnDropletBurst(pos[0], 0.65, pos[1], 0x38bdf8, 10);
      } else if (
        ev.type === EVENT_TYPES.RESCUE ||
        ev.type === EVENT_TYPES.NEEDLE_RESCUE
      ) {
        const pos = findPlayerWorld(ev.playerId || ev.victimId);
        if (pos) this._spawnDropletBurst(pos[0], 0.65, pos[1], 0x4ade80, 8);
      } else if (
        ev.type === EVENT_TYPES.SHIELD_BREAK ||
        ev.type === EVENT_TYPES.MOUNT_BREAK ||
        ev.type === EVENT_TYPES.BUN_SCORE ||
        ev.type === EVENT_TYPES.PICKUP ||
        ev.type === EVENT_TYPES.BUN_PICKUP
      ) {
        const pos = findPlayerWorld(ev.playerId) || [
          colToWorldX(ev.col ?? 7),
          rowToWorldZ(ev.row ?? 6),
        ];
        this._spawnDropletBurst(pos[0], 0.6, pos[1], 0xfacc15, 8);
      }
    }
  }

  _spawnDropletBurst(wx, wy, wz, colorHex, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const ang = (i / count) * Math.PI * 2;
      const mat = createCandyMaterial(colorHex, {
        emissive: colorHex,
        emissiveIntensity: 0.45,
      });
      const mesh = new THREE.Mesh(this._vfxSphereGeo, mat);
      mesh.position.set(wx, wy, wz);
      this.vfxGroup.add(mesh);
      this.burstParticles.push({
        mesh,
        mat,
        vx: Math.cos(ang) * 3.0,
        vy: 2.8 + (i % 3) * 0.7,
        vz: Math.sin(ang) * 3.0,
        age: 0,
        life: 0.42,
      });
    }
  }

  _stepBurstParticles(dtSec) {
    const dt = Math.max(0, Math.min(dtSec || 0, 0.1));
    for (let i = this.burstParticles.length - 1; i >= 0; i -= 1) {
      const p = this.burstParticles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.vfxGroup.remove(p.mesh);
        p.mat.dispose();
        this.burstParticles.splice(i, 1);
        continue;
      }
      p.vy -= 10.0 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.max(0.05, 1.0 - p.age / p.life));
    }
  }
}
