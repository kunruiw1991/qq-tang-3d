/**
 * Imposing `2×2` Articulated 3D Mechanical Golem Boss (`机械傀儡`) & Pulsing 3D
 * Floor Hazard Telegraph Decals (`src/render/boss_meshes.js`).
 *
 * Stands `~2.65` world units tall across its `2×2` tile footprint (`boss.x, boss.z`):
 *   - Riveted bronze, gunmetal, and crimson-gold armor chassis
 *   - Glowing chest furnace reactor core (cyan-gold in Phase 1 -> overdrive crimson in Phase 2)
 *   - Horned visor helmet with glowing eyes & twin steam exhaust stacks
 *   - Spinning brass cog/gear wheel on back
 *   - Articulated hydraulic piston crusher arms (raising high overhead during `'telegraph'`
 *     and slamming down during `'attack'`)
 *   - Pooled 3D floor hazard warning decals on every tile in `boss.telegraphTiles`
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import {
  BOSS_TELEGRAPH_SEC,
  colToWorldX,
  rowToWorldZ,
  tileToWorldX,
  tileToWorldZ,
} from '../contracts/constants.js';
import {
  createCandyMaterial,
  createHazardTelegraphTexture,
  createMetallicMaterial,
} from './materials.js';

function buildGolemRig() {
  const root = new THREE.Group();
  root.name = 'boss_mechanical_golem';

  // 2x2 Footprint Perimeter Ring on floor (`width = 2.0`, `depth = 2.0`)
  const footprintRing = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1.04, 36),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
  );
  footprintRing.rotation.x = -Math.PI * 0.5;
  footprintRing.position.y = 0.026;
  root.add(footprintRing);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const bronzeMat = createMetallicMaterial(0xb45309, { roughness: 0.28, metalness: 0.78 });
  const brassMat = createMetallicMaterial(0xfbbf24, { roughness: 0.22, metalness: 0.88 });
  const ironMat = createMetallicMaterial(0x334155, { roughness: 0.34, metalness: 0.82 });
  const crimsonMat = createCandyMaterial(0xdc2626, { roughness: 0.2, clearcoat: 0.85 });

  const coreMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x38bdf8),
    emissive: new THREE.Color(0x0ea5e9),
    emissiveIntensity: 0.95,
    roughness: 0.08,
    clearcoat: 1.0,
    transparent: false,
  });

  const visorMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xfef08a),
    emissive: new THREE.Color(0xf59e0b),
    emissiveIntensity: 1.1,
    roughness: 0.1,
    clearcoat: 1.0,
    transparent: false,
  });

  // 1. Heavy Hydraulic Stomping Legs
  const createLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.44, 0, 0);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.22, 0.66), ironMat);
    foot.position.set(0, 0.11, 0.06);
    const toeClaw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.16), brassMat);
    toeClaw.position.set(0, 0.06, 0.40);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 0.52, 12), bronzeMat);
    shin.position.set(0, 0.44, 0);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), brassMat);
    knee.position.set(0, 0.70, 0.04);

    leg.add(foot, toeClaw, shin, knee);
    return leg;
  };

  const leftLeg = createLeg(-1);
  const rightLeg = createLeg(1);
  bodyPivot.add(leftLeg, rightLeg);

  // 2. Massive Riveted Bronze & Crimson Chest Chassis
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 1.32, 0);
  bodyPivot.add(torsoPivot);

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.52, 0.32, 12), ironMat);
  pelvis.position.y = -0.52;
  torsoPivot.add(pelvis);

  const chestBox = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.92, 0.96), bronzeMat);
  torsoPivot.add(chestBox);

  const chestTrim = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.22, 1.02), crimsonMat);
  chestTrim.position.y = 0.28;
  torsoPivot.add(chestTrim);

  // Glowing Furnace Reactor Core on front chest (+Z)
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 10, 24), brassMat);
  coreRing.position.set(0, -0.02, 0.49);
  const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.23, 18, 14), coreMat);
  coreSphere.scale.set(1, 1, 0.65);
  coreSphere.position.set(0, -0.02, 0.48);
  torsoPivot.add(coreRing, coreSphere);

  // Twin Shoulder Smokestack Chimneys
  for (const side of [-1, 1]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.52, 12), ironMat);
    stack.position.set(side * 0.46, 0.66, -0.26);
    stack.rotation.x = -0.18;
    const stackRim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 14), brassMat);
    stackRim.rotation.x = Math.PI * 0.5 - 0.18;
    stackRim.position.set(side * 0.46, 0.91, -0.31);
    torsoPivot.add(stack, stackRim);
  }

  // 3. Giant Rotating Brass Gear Wheel on Back (-Z)
  const gearGroup = new THREE.Group();
  gearGroup.position.set(0, 0.06, -0.56);
  const gearDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 20), brassMat);
  gearDisc.rotation.x = Math.PI * 0.5;
  gearGroup.add(gearDisc);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 14), crimsonMat);
  hub.rotation.x = Math.PI * 0.5;
  gearGroup.add(hub);
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI * 2) / 8;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.12), brassMat);
    tooth.position.set(Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0);
    tooth.rotation.z = a;
    gearGroup.add(tooth);
  }
  torsoPivot.add(gearGroup);

  // 4. Horned Iron Jaw-Helmet Head (`y ~ 2.18` to `2.65` horn tips)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.76, 0.06);
  torsoPivot.add(headGroup);

  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.48, 12), ironMat);
  dome.position.y = 0.12;
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.58), bronzeMat);
  jaw.position.set(0, -0.08, 0.10);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.12), visorMat);
  visor.position.set(0, 0.14, 0.38);
  headGroup.add(dome, jaw, visor);

  // Twin Curved Bronze Horns
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.46, 10), brassMat);
    horn.position.set(side * 0.44, 0.34, 0.02);
    horn.rotation.z = -side * 0.58;
    headGroup.add(horn);
  }

  // 5. Articulated Hydraulic Piston Crusher Arms
  const createCrusherArm = (side) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.88, 0.30, 0);

    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), crimsonMat);
    pauldron.scale.set(1.1, 0.95, 1.05);
    shoulderPivot.add(pauldron);

    const pistonRod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 12), ironMat);
    pistonRod.position.set(side * 0.08, -0.34, 0.05);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.52), bronzeMat);
    forearm.position.set(side * 0.10, -0.74, 0.14);

    const knuckleGlow = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.14, 0.55), coreMat);
    knuckleGlow.position.set(side * 0.10, -0.94, 0.14);

    // 3 brass crusher claws
    for (const cz of [-0.14, 0.14, 0.36]) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.20, 6), brassMat);
      claw.rotation.x = Math.PI;
      claw.position.set(side * 0.10, -1.08, cz);
      shoulderPivot.add(claw);
    }

    shoulderPivot.add(pistonRod, forearm, knuckleGlow);
    return shoulderPivot;
  };

  const leftArm = createCrusherArm(-1);
  const rightArm = createCrusherArm(1);
  torsoPivot.add(leftArm, rightArm);

  bodyPivot.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  root.userData = {
    footprintRing,
    bodyPivot,
    torsoPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    gearGroup,
    coreMat,
    visorMat,
    bronzeMat,
    crimsonMat,
    lastX: null,
    lastZ: null,
    yaw: 0,
  };
  return root;
}

function createTelegraphTileDecal(hazardTex) {
  const g = new THREE.Group();

  // Floor warning pad
  const padMat = new THREE.MeshBasicMaterial({
    map: hazardTex,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), padMat);
  pad.rotation.x = -Math.PI * 0.5;
  pad.position.y = 0.032;
  g.add(pad);

  // Contracting 3D countdown ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.90,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 24), ringMat);
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.048;
  g.add(ring);

  // Subtle vertical laser-warning column so telegraphs stay visible behind soft blocks!
  const columnMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.40, 0.44, 0.46, 16, 1, true),
    columnMat
  );
  column.position.y = 0.25;
  g.add(column);

  g.userData = { padMat, ring, ringMat, column, columnMat };
  return g;
}

/**
 * Manages the 3D Mechanical Golem Boss rig and pooled floor hazard warning decals.
 */
export class BossVisualManager {
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    this.container = new THREE.Group();
    this.telegraphGroup = new THREE.Group();
    this.parentGroup.add(this.telegraphGroup, this.container);

    this.golemRig = null;
    this.hazardTex = createHazardTelegraphTexture();
    this.decalPool = [];
  }

  clear() {
    if (this.golemRig) {
      this.golemRig.visible = false;
      const ud = this.golemRig.userData;
      if (ud) {
        ud.lastX = null;
        ud.lastZ = null;
        ud.yaw = 0;
        if (ud.bodyPivot) ud.bodyPivot.rotation.y = 0;
        if (ud.gearGroup) ud.gearGroup.rotation.z = 0;
      }
    }
    for (let i = 0; i < this.decalPool.length; i += 1) {
      this.decalPool[i].visible = false;
    }
  }

  sync(bossSnapshot, timeSec = 0, dtSec = 1 / 60) {
    if (!bossSnapshot || bossSnapshot.state === 'defeated' || bossSnapshot.hp <= 0) {
      this.clear();
      return;
    }

    if (!this.golemRig) {
      this.golemRig = buildGolemRig();
      this.container.add(this.golemRig);
    }
    this.golemRig.visible = true;

    const wx = tileToWorldX(bossSnapshot.x);
    const wz = tileToWorldZ(bossSnapshot.z);
    this.golemRig.position.set(wx, 0, wz);

    const ud = this.golemRig.userData;
    const dt = Math.max(0, Math.min(dtSec || 1 / 60, 0.1));

    // Smoothly orient Golem toward movement direction (defaulting toward +Z camera front)
    if (ud.lastX !== null && ud.lastZ !== null) {
      const dx = wx - ud.lastX;
      const dz = wz - ud.lastZ;
      if (Math.hypot(dx, dz) > 0.002) {
        const targetYaw = Math.atan2(dx, dz);
        let diff = (targetYaw - ud.yaw) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        ud.yaw += diff * Math.min(1, dt * 8);
      }
    }
    ud.lastX = wx;
    ud.lastZ = wz;
    ud.bodyPivot.rotation.y = ud.yaw;

    // Phase 1 vs Phase 2 Overdrive reactor colors + spinning back gear!
    const isPhase2 = bossSnapshot.phase === 2;
    const isHurt = bossSnapshot.state === 'hurt' || bossSnapshot.invulnTimer > 0;
    const gearSpeed = bossSnapshot.state === 'telegraph' ? 8.5 : isPhase2 ? 5.2 : 2.6;
    ud.gearGroup.rotation.z -= gearSpeed * dt;

    if (isHurt) {
      const flash = 0.5 + 0.5 * Math.sin(timeSec * 36);
      ud.coreMat.color.setHex(0xffffff);
      ud.coreMat.emissive.setHex(0xfef08a);
      ud.coreMat.emissiveIntensity = 1.4 + flash;
      ud.visorMat.emissive.setHex(0xffffff);
    } else if (isPhase2 || bossSnapshot.state === 'telegraph') {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 16);
      ud.coreMat.color.setHex(0xf97316);
      ud.coreMat.emissive.setHex(0xef4444);
      ud.coreMat.emissiveIntensity = 0.9 + pulse * 0.85;
      ud.visorMat.color.setHex(0xfef08a);
      ud.visorMat.emissive.setHex(0xef4444);
    } else {
      ud.coreMat.color.setHex(0x38bdf8);
      ud.coreMat.emissive.setHex(0x0ea5e9);
      ud.coreMat.emissiveIntensity = 0.95;
      ud.visorMat.color.setHex(0xfef08a);
      ud.visorMat.emissive.setHex(0xf59e0b);
    }

    // Articulated pose per Boss state!
    if (bossSnapshot.state === 'telegraph') {
      // Raise BOTH giant piston crusher arms overhead with warning tremor!
      const tremor = Math.sin(timeSec * 34) * 0.04;
      ud.torsoPivot.position.y = 1.38 + Math.sin(timeSec * 14) * 0.04;
      ud.torsoPivot.rotation.x = -0.14;
      ud.leftArm.rotation.set(-2.55 + tremor, 0, 0.26);
      ud.rightArm.rotation.set(-2.55 - tremor, 0, -0.26);
      ud.leftLeg.position.y = 0;
      ud.rightLeg.position.y = 0;
      ud.headGroup.rotation.x = -0.15;
    } else if (bossSnapshot.state === 'attack') {
      // Heavy ground-slam pose!
      ud.torsoPivot.position.y = 1.16;
      ud.torsoPivot.rotation.x = 0.28;
      ud.leftArm.rotation.set(-0.65, 0.2, -0.15);
      ud.rightArm.rotation.set(-0.65, -0.2, 0.15);
      ud.headGroup.rotation.x = 0.18;
    } else {
      // Heavy stomping patrol walk cycle
      const stompRate = isPhase2 ? 7.5 : 5.2;
      const w = timeSec * stompRate;
      ud.torsoPivot.position.y = 1.32 + Math.abs(Math.sin(w)) * 0.08;
      ud.torsoPivot.rotation.set(0.06, 0, Math.sin(w) * 0.06);
      ud.leftLeg.position.y = Math.max(0, Math.sin(w) * 0.14);
      ud.rightLeg.position.y = Math.max(0, -Math.sin(w) * 0.14);
      ud.leftArm.rotation.set(Math.sin(w) * 0.42 - 0.18, 0, 0.12);
      ud.rightArm.rotation.set(-Math.sin(w) * 0.42 - 0.18, 0, -0.12);
      ud.headGroup.rotation.set(0, Math.sin(timeSec * 2.1) * 0.16, 0);
    }

    // Sync 3D Floor Hazard Telegraph Decals on every tile in `boss.telegraphTiles`
    const tiles = bossSnapshot.telegraphTiles || [];
    const progress =
      1.0 - Math.max(0, Math.min(1, (bossSnapshot.telegraphRemainingSec || 0) / BOSS_TELEGRAPH_SEC));
    const flash = 0.5 + 0.5 * Math.sin(timeSec * (14 + progress * 20));

    while (this.decalPool.length < tiles.length) {
      const decal = createTelegraphTileDecal(this.hazardTex);
      this.telegraphGroup.add(decal);
      this.decalPool.push(decal);
    }

    for (let i = 0; i < this.decalPool.length; i += 1) {
      const decal = this.decalPool[i];
      if (i >= tiles.length) {
        decal.visible = false;
        continue;
      }
      const t = tiles[i];
      decal.visible = true;
      decal.position.set(colToWorldX(t.col), 0, rowToWorldZ(t.row));

      const dud = decal.userData;
      dud.padMat.opacity = 0.68 + flash * 0.30;
      const ringScale = Math.max(0.45, 1.15 - progress * 0.55);
      dud.ring.scale.set(ringScale, ringScale, 1);
      dud.ringMat.color.setHex(flash > 0.5 ? 0xfef08a : 0xff3b30);
      dud.columnMat.opacity = 0.16 + flash * 0.22;
    }
  }
}
