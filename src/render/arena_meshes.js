/**
 * 3D Stage & Diorama Builders (`src/render/arena_meshes.js`) for all 4 iconic
 * themed *QQ Tang* arenas:
 *   1. `candy_town` (`糖果镇`): Wafer checkerboard, frosted cupcakes & peppermint
 *      lollipops, ribbon-wrapped gift boxes & macarons, chocolate fence & gumball rim.
 *   2. `pirate_bay` (`海盗`): Oak ship deck over animated turquoise ocean, naval
 *      cannons & rum barrels, X-braced cargo crates, ship railings, mast & treasure chests.
 *   3. `ice_village` (`冰雪`): Specular snow/glacier floor, faceted crystal spires &
 *      snowmen, snow-capped frosted ice bricks, snow-dusted pines & candy-cane lanterns.
 *   4. `toy_kingdom` (`积木`): Studded playroom baseplate, multi-tier glossy plastic
 *      brick towers with top studs, star/heart toy blocks & studded bricks, train tracks & pinwheels.
 *
 * Also renders `TILE_TYPE.BUN_SHRINE` (golden bamboo steamer shrine) and glowing
 * `TEAM_BASE_BLUE` / `TEAM_BASE_RED` delivery pads in `bun_grab` mode, plus 3D
 * shatter debris bursts whenever destructible `SOFT_BLOCK` tiles break.
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import {
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE,
  TILE_TYPE,
  colToWorldX,
  rowToWorldZ,
} from '../contracts/constants.js';
import {
  createCandyMaterial,
  createDeckPlankTexture,
  createGiftBoxTexture,
  createIceBlockTexture,
  createMetallicMaterial,
  createPeppermintStripeTexture,
  createToyBlockTexture,
  createWoodCrateTexture,
} from './materials.js';

function markShared(resource) {
  if (resource) {
    resource.userData = resource.userData || {};
    resource.userData.shared = true;
  }
  return resource;
}

function disposeHierarchyWithoutTextures(rootObj) {
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

function enableShadows(obj, cast = true, receive = true) {
  obj.traverse((child) => {
    if (child.isMesh) {
      if (child.userData?.noCastShadow) {
        child.castShadow = false;
      } else {
        child.castShadow = cast;
      }
      child.receiveShadow = receive;
    }
  });
  return obj;
}

function buildCupcakeHardWall(variant = 0) {
  const g = new THREE.Group();
  const wrapperColor = variant % 2 === 0 ? 0xdb2777 : 0x2563eb;
  const frostingColor = variant % 2 === 0 ? 0x78350f : 0xec4899;

  // Fluted cupcake liner
  const liner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.41, 0.31, 0.48, 14),
    createCandyMaterial(wrapperColor, { roughness: 0.35, clearcoat: 0.4 })
  );
  liner.position.y = 0.24;
  g.add(liner);

  // Rich chocolate / berry ganache lower tier + contrasting buttercream swirl
  const cream1 = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 16, 12),
    createCandyMaterial(frostingColor, { roughness: 0.2, clearcoat: 0.85 })
  );
  cream1.scale.set(1.0, 0.68, 1.0);
  cream1.position.y = 0.56;
  g.add(cream1);

  const cream2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 14, 10),
    createCandyMaterial(variant % 2 === 0 ? 0xfbcfe8 : 0xfef08a, {
      roughness: 0.18,
      clearcoat: 0.9,
    })
  );
  cream2.scale.set(1.0, 0.78, 1.0);
  cream2.position.y = 0.82;
  g.add(cream2);

  // Glossy cherry topper
  const cherry = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    createCandyMaterial(0xe11d48, { roughness: 0.08, clearcoat: 1.0 })
  );
  cherry.position.y = 1.05;
  g.add(cherry);

  // Colorful candy sprinkles (micro-ornaments skip shadow map pass)
  const sprinkleColors = [0x38bdf8, 0xfacc15, 0x4ade80, 0xf43f5e];
  const spGeo = new THREE.CapsuleGeometry(0.025, 0.06, 4, 6);
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3 + 0.3;
    const sp = new THREE.Mesh(
      spGeo,
      createCandyMaterial(sprinkleColors[i % sprinkleColors.length], { clearcoat: 0.9 })
    );
    sp.position.set(Math.cos(a) * 0.27, 0.76, Math.sin(a) * 0.27);
    sp.rotation.set(0.6, a, 0.5);
    sp.userData.noCastShadow = true;
    g.add(sp);
  }
  return enableShadows(g);
}

function buildPeppermintPillarHardWall() {
  const g = new THREE.Group();
  const pepTex = createPeppermintStripeTexture();

  // Wafer pedestal
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.45, 0.18, 16),
    createCandyMaterial(0xfde68a, { roughness: 0.35 })
  );
  base.position.y = 0.09;
  g.add(base);

  // Striped candy-cane column
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.72, 18),
    new THREE.MeshPhysicalMaterial({
      map: pepTex,
      roughness: 0.14,
      clearcoat: 0.95,
      transparent: false,
    })
  );
  col.position.y = 0.52;
  g.add(col);

  // Swirled lollipop disc crown on top
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.41, 0.41, 0.16, 20),
    new THREE.MeshPhysicalMaterial({
      map: pepTex,
      roughness: 0.1,
      clearcoat: 1.0,
      transparent: false,
    })
  );
  cap.position.y = 0.94;
  g.add(cap);

  return enableShadows(g);
}

function buildCandySoftBlock(variant = 0) {
  const g = new THREE.Group();
  if (variant % 3 === 2) {
    // Giant double-stacked raspberry / taro Macaron soft block!
    const shellColor = variant % 2 === 0 ? 0xf43f5e : 0xa855f7;
    const shellMat = createCandyMaterial(shellColor, { roughness: 0.24, clearcoat: 0.8 });
    const creamMat = createCandyMaterial(0xfffbeb, { roughness: 0.2, clearcoat: 0.6 });

    const botShell = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.40, 0.24, 18), shellMat);
    botShell.position.y = 0.14;
    g.add(botShell);

    const filling = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.18, 18), creamMat);
    filling.position.y = 0.34;
    g.add(filling);

    const topShell = new THREE.Mesh(new THREE.SphereGeometry(0.43, 18, 12), shellMat);
    topShell.scale.set(1, 0.52, 1);
    topShell.position.y = 0.50;
    g.add(topShell);
    return enableShadows(g);
  }

  // Saturated Ribbon-wrapped Candy Gift Box with 3D satin bow on top
  const isPink = variant % 2 === 0;
  const tex = createGiftBoxTexture(isPink ? '#FBBF24' : '#FB7185', isPink ? '#BE185D' : '#FEF08A');
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.74, 0.86),
    new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.22,
      clearcoat: 0.78,
      transparent: false,
    })
  );
  box.position.y = 0.37;
  g.add(box);

  const bowMat = createCandyMaterial(isPink ? 0xbe185d : 0xfacc15, {
    roughness: 0.18,
    clearcoat: 0.9,
  });
  const loopGeo = new THREE.TorusGeometry(0.13, 0.045, 8, 14);
  const loopL = new THREE.Mesh(loopGeo, bowMat);
  loopL.position.set(-0.11, 0.80, 0);
  loopL.rotation.set(0.3, 0.2, 0.5);
  loopL.userData.noCastShadow = true;
  const loopR = new THREE.Mesh(loopGeo, bowMat);
  loopR.position.set(0.11, 0.80, 0);
  loopR.rotation.set(0.3, -0.2, -0.5);
  loopR.userData.noCastShadow = true;
  g.add(loopL, loopR);

  return enableShadows(g);
}

function buildPirateHardWall(variant = 0, col = 0, row = 0) {
  const g = new THREE.Group();
  // Dark gunmetal / obsidian-iron Naval Cannon on dark stone plinth (unmistakably distinct from turquoise-gold soft crates!)
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.28, 0.72),
    createCandyMaterial(0x1e293b, { roughness: 0.36, clearcoat: 0.45 })
  );
  plinth.position.y = 0.14;
  g.add(plinth);

  // 4 brass wheels
  const wheelGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12);
  wheelGeo.rotateX(Math.PI * 0.5);
  const brassMat = createMetallicMaterial(0xd97706, { roughness: 0.3, metalness: 0.8 });
  for (const [wx, wz] of [
    [-0.24, -0.34],
    [0.24, -0.34],
    [-0.24, 0.34],
    [0.24, 0.34],
  ]) {
    const w = new THREE.Mesh(wheelGeo, brassMat);
    w.position.set(wx, 0.13, wz);
    g.add(w);
  }

  // Dark gunmetal iron cannon barrel + crimson-brass muzzle ring
  const ironMat = createMetallicMaterial(0x0f172a, { roughness: 0.28, metalness: 0.88 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.88, 16), ironMat);
  barrel.rotation.z = Math.PI * 0.5;
  barrel.position.set(0, 0.52, 0);
  g.add(barrel);

  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), brassMat);
  muzzle.rotation.y = Math.PI * 0.5;
  muzzle.position.set(0.42, 0.52, 0);
  g.add(muzzle);

  const breech = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), brassMat);
  breech.position.set(-0.45, 0.52, 0);
  g.add(breech);

  if (col > 7 || (variant & 1) === 1) g.rotation.y = Math.PI;
  return enableShadows(g);
}

function buildPirateSoftBlock() {
  const g = new THREE.Group();
  // Bright Turquoise & Gold Striped Pirate Treasure Parcel (100% distinct from dark gunmetal iron cannons!)
  const parcelTex = createGiftBoxTexture('#06B6D4', '#FBBF24');
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.76, 0.86),
    new THREE.MeshPhysicalMaterial({
      map: parcelTex,
      roughness: 0.22,
      clearcoat: 0.82,
      transparent: false,
    })
  );
  box.position.y = 0.38;
  g.add(box);

  // Golden treasure seal gem on top
  const seal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.08, 12),
    createCandyMaterial(0xfacc15, {
      roughness: 0.16,
      clearcoat: 0.92,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.28,
    })
  );
  seal.position.y = 0.79;
  seal.userData.noCastShadow = true;
  g.add(seal);
  return enableShadows(g);
}

function buildIceHardWall(variant = 0) {
  const g = new THREE.Group();
  if (variant % 3 === 0) {
    // High-contrast Winter Snowman Guard on deep slate-sapphire pedestal with crimson coat & navy top hat!
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.48, 0.16, 12),
      createCandyMaterial(0x1e3a8a, { roughness: 0.24, clearcoat: 0.75 })
    );
    plinth.position.y = 0.08;
    g.add(plinth);

    const coatMat = createCandyMaterial(0xdc2626, { roughness: 0.26, clearcoat: 0.7 });
    const snowMat = createCandyMaterial(0xf8fafc, { roughness: 0.28, clearcoat: 0.5 });
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 14), coatMat);
    bot.scale.set(1, 0.85, 1);
    bot.position.y = 0.36;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), snowMat);
    head.position.y = 0.80;
    g.add(bot, head);

    // Golden scarf
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.055, 8, 16),
      createCandyMaterial(0xfbbf24, { clearcoat: 0.8 })
    );
    scarf.rotation.x = Math.PI * 0.5;
    scarf.position.y = 0.60;
    g.add(scarf);

    // Carrot nose + midnight-navy top hat
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.22, 10),
      createCandyMaterial(0xf97316)
    );
    nose.rotation.x = Math.PI * 0.5;
    nose.position.set(0, 0.80, 0.32);
    g.add(nose);

    const hatMat = createCandyMaterial(0x0f172a, { roughness: 0.32 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 14), hatMat);
    brim.position.y = 1.04;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.24, 14), hatMat);
    crown.position.y = 1.17;
    g.add(brim, crown);
    return enableShadows(g);
  }

  // Deep Sapphire-Cobalt Glacier Crystal Pillar with snow-cap rim trim
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.48, 0.20, 8),
    createCandyMaterial(0x1e3a8a, { roughness: 0.22, clearcoat: 0.85 })
  );
  base.position.y = 0.10;
  g.add(base);

  const snowRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.065, 8, 16),
    createCandyMaterial(0xffffff, { roughness: 0.32, clearcoat: 0.45 })
  );
  snowRing.rotation.x = Math.PI * 0.5;
  snowRing.position.y = 0.21;
  snowRing.userData.noCastShadow = true;
  g.add(snowRing);

  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x1d4ed8),
    emissive: new THREE.Color(0x1e40af),
    emissiveIntensity: 0.24,
    roughness: 0.08,
    metalness: 0.08,
    clearcoat: 1.0,
    iridescence: 0.42,
    envMapIntensity: 1.2,
    transparent: false,
  });

  const mainSpire = new THREE.Mesh(new THREE.ConeGeometry(0.31, 1.06, 6), crystalMat);
  mainSpire.position.y = 0.64;
  g.add(mainSpire);

  const sideA = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.70, 6), crystalMat);
  sideA.position.set(-0.18, 0.42, 0.12);
  sideA.rotation.z = 0.25;

  const sideB = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.64, 6), crystalMat);
  sideB.position.set(0.19, 0.40, -0.10);
  sideB.rotation.z = -0.22;
  g.add(sideA, sideB);

  return enableShadows(g);
}

function buildIceSoftBlock(variant = 0) {
  const g = new THREE.Group();
  // Warm winter holiday gift / amber-berry frost blocks so destructible soft blocks contrast
  // immediately against deep cobalt hard walls and cool frosted skating lanes!
  const isWarmAmber = variant % 2 === 0;
  const giftTex = createGiftBoxTexture(
    isWarmAmber ? '#F59E0B' : '#F43F5E',
    isWarmAmber ? '#0D9488' : '#FDE047'
  );
  const brick = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.70, 0.86),
    new THREE.MeshPhysicalMaterial({
      map: giftTex,
      roughness: 0.18,
      clearcoat: 0.88,
      envMapIntensity: 1.15,
      transparent: false,
    })
  );
  brick.position.y = 0.35;
  g.add(brick);

  // Petite winter snow puff on top leaving vibrant amber/berry edges clearly visible from 55° overhead
  const snowCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.11, 0.46),
    createCandyMaterial(0xffffff, { roughness: 0.32, clearcoat: 0.45 })
  );
  snowCap.position.y = 0.73;
  snowCap.userData.noCastShadow = true;
  g.add(snowCap);

  return enableShadows(g);
}

function buildToyHardWall(variant = 0) {
  const g = new THREE.Group();
  const palette = [0xef4444, 0x2563eb, 0xfacc15, 0x10b981];
  const c1 = palette[variant % palette.length];
  const c2 = palette[(variant + 1) % palette.length];

  const mat1 = createCandyMaterial(c1, { roughness: 0.14, clearcoat: 0.92 });
  const mat2 = createCandyMaterial(c2, { roughness: 0.14, clearcoat: 0.92 });

  const tier1 = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.46, 0.88), mat1);
  tier1.position.y = 0.23;
  const tier2 = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.46, 0.88), mat2);
  tier2.position.y = 0.69;
  g.add(tier1, tier2);

  // 4 iconic interlocking cylindrical studs on top
  const studGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.14, 12);
  for (const [sx, sz] of [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [0.22, 0.22],
  ]) {
    const stud = new THREE.Mesh(studGeo, mat2);
    stud.position.set(sx, 0.99, sz);
    stud.userData.noCastShadow = true;
    g.add(stud);
  }
  return enableShadows(g);
}

function buildToySoftBlock(variant = 0) {
  const g = new THREE.Group();
  if (variant % 2 === 0) {
    // Painted Star/Heart Toy Cube
    const isHeart = variant % 4 === 2;
    const tex = createToyBlockTexture(
      isHeart ? '#FB7185' : '#3B82F6',
      '#FEF08A',
      isHeart ? 'heart' : 'star'
    );
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.78, 0.84),
      new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.2,
        clearcoat: 0.82,
        transparent: false,
      })
    );
    cube.position.y = 0.39;
    g.add(cube);
    return enableShadows(g);
  }

  // Single-tier colorful studded toy brick
  const colors = [0x38bdf8, 0xa855f7, 0xf97316, 0x22c55e];
  const mat = createCandyMaterial(colors[variant % colors.length], {
    roughness: 0.15,
    clearcoat: 0.9,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.64, 0.85), mat);
  body.position.y = 0.32;
  g.add(body);

  const studGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10);
  for (const [sx, sz] of [
    [-0.21, -0.21],
    [0.21, -0.21],
    [-0.21, 0.21],
    [0.21, 0.21],
  ]) {
    const s = new THREE.Mesh(studGeo, mat);
    s.position.set(sx, 0.70, sz);
    s.userData.noCastShadow = true;
    g.add(s);
  }
  return enableShadows(g);
}

function buildBunShrineLandmark() {
  const g = new THREE.Group();

  // Ornate walkable golden-red Chinese Steamer Platform (low-profile so center bun & characters stand cleanly!)
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.62, 0.12, 24),
    createCandyMaterial(0xd97706, { roughness: 0.3, clearcoat: 0.7 })
  );
  rim.position.y = 0.06;
  g.add(rim);

  const innerMat = createCandyMaterial(0xfef08a, {
    roughness: 0.25,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.28,
  });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.14, 24), innerMat);
  inner.position.y = 0.07;
  g.add(inner);

  // Glowing golden halo ring around the shrine
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.78, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
    })
  );
  halo.rotation.x = -Math.PI * 0.5;
  halo.position.y = 0.03;
  g.add(halo);
  g.userData.halo = halo;

  // 4 festive red-gold mini corner posts outside walk center
  const postMat = createCandyMaterial(0xdc2626, { clearcoat: 0.85 });
  const goldMat = createMetallicMaterial(0xfbbf24, { roughness: 0.22, metalness: 0.85 });
  for (const [px, pz] of [
    [-0.46, -0.46],
    [0.46, -0.46],
    [-0.46, 0.46],
    [0.46, 0.46],
  ]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.48, 10), postMat);
    post.position.set(px, 0.24, pz);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), goldMat);
    orb.position.set(px, 0.52, pz);
    g.add(post, orb);
  }

  return enableShadows(g, true, true);
}

function buildTeamBasePad(isBlue) {
  const g = new THREE.Group();
  const mainHex = isBlue ? 0x2563eb : 0xe11d48;
  const glowHex = isBlue ? 0x38bdf8 : 0xfb7185;

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.08, 0.94),
    createCandyMaterial(mainHex, {
      roughness: 0.18,
      clearcoat: 0.9,
      emissive: glowHex,
      emissiveIntensity: 0.32,
    })
  );
  pad.position.y = 0.04;
  g.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.39, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    })
  );
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.088;
  g.add(ring);
  g.userData.pulseRing = ring;

  return enableShadows(g, false, true);
}

/**
 * Builds the outer decorative perimeter border & themed diorama backdrop around the 15x13 arena.
 */
function buildPerimeterDiorama(arenaId, animTargets) {
  const root = new THREE.Group();
  const minX = colToWorldX(-1); // -8.0
  const maxX = colToWorldX(GRID_COLS); // +8.0
  const minZ = rowToWorldZ(-1); // -7.0
  const maxZ = rowToWorldZ(GRID_ROWS); // +7.0

  if (arenaId === 'pirate_bay') {
    // Shimmering turquoise ocean surround + wooden galleon deck hull!
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(68, 56, 24, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x0ea5e9,
        emissive: 0x0369a1,
        emissiveIntensity: 0.18,
        roughness: 0.12,
        clearcoat: 1.0,
        envMapIntensity: 1.5,
        transparent: false,
      })
    );
    ocean.rotation.x = -Math.PI * 0.5;
    ocean.position.y = -0.55;
    root.add(ocean);
    animTargets.ocean = ocean;

    // Galleon hull timber base
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(17.4, 0.72, 15.4),
      createCandyMaterial(0x6b3a19, { roughness: 0.55, clearcoat: 0.2 })
    );
    hull.position.y = -0.38;
    hull.receiveShadow = true;
    root.add(hull);

    // Ship deck gunwale railings & brass bollards around perimeter
    const railMat = createCandyMaterial(0x7c431e, { roughness: 0.45, clearcoat: 0.25 });
    const brassMat = createMetallicMaterial(0xf59e0b, { roughness: 0.25, metalness: 0.85 });

    for (let c = -1; c <= GRID_COLS; c += 1) {
      const wx = colToWorldX(c);
      for (const wz of [minZ, maxZ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.32), railMat);
        post.position.set(wx, 0.36, wz);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), brassMat);
        cap.position.set(wx, 0.78, wz);
        root.add(post, cap);
      }
    }
    for (let r = 0; r < GRID_ROWS; r += 1) {
      const wz = rowToWorldZ(r);
      for (const wx of [minX, maxX]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.32), railMat);
        post.position.set(wx, 0.36, wz);
        root.add(post);
      }
    }
    // Horizontal top rails
    const topRailH = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.16, 0.22), railMat);
    topRailH.position.set(0, 0.58, minZ);
    const botRailH = topRailH.clone();
    botRailH.position.set(0, 0.58, maxZ);
    const leftRailV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 14.4), railMat);
    leftRailV.position.set(minX, 0.58, 0);
    const rightRailV = leftRailV.clone();
    rightRailV.position.set(maxX, 0.58, 0);
    root.add(topRailH, botRailH, leftRailV, rightRailV);

    // Pirate mast + rolled sail at north-center & treasure chests at corners
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.3, 14), railMat);
    mast.position.set(0, 1.15, minZ - 0.25);
    const yardarm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.8, 12), railMat);
    yardarm.rotation.z = Math.PI * 0.5;
    yardarm.position.set(0, 2.05, minZ - 0.15);
    const sail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.20, 0.20, 3.3, 12),
      createCandyMaterial(0xfffbeb, { roughness: 0.45 })
    );
    sail.rotation.z = Math.PI * 0.5;
    sail.position.set(0, 1.88, minZ + 0.02);
    root.add(mast, yardarm, sail);

    // Gold-filled corner treasure chests
    for (const [tx, tz] of [
      [minX, minZ],
      [maxX, minZ],
      [minX, maxZ],
      [maxX, maxZ],
    ]) {
      const chest = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.52, 0.62),
        createCandyMaterial(0x92400e, { roughness: 0.35 })
      );
      chest.position.set(tx, 0.46, tz);
      const gold = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), brassMat);
      gold.scale.set(1.2, 0.6, 0.9);
      gold.position.set(tx, 0.76, tz);
      root.add(chest, gold);
    }

    return enableShadows(root);
  }

  if (arenaId === 'ice_village') {
    // Wide winter glacier-sea surround + frosted sapphire perimeter blocks + snow pines & candy-cane lanterns
    const snowfield = new THREE.Mesh(
      new THREE.PlaneGeometry(68, 56),
      createCandyMaterial(0x7dd3fc, { roughness: 0.22, clearcoat: 0.7 })
    );
    snowfield.rotation.x = -Math.PI * 0.5;
    snowfield.position.y = -0.45;
    root.add(snowfield);

    const platter = new THREE.Mesh(
      new THREE.BoxGeometry(17.4, 0.55, 15.4),
      createCandyMaterial(0x0284c7, { roughness: 0.22, clearcoat: 0.8 })
    );
    platter.position.y = -0.29;
    root.add(platter);

    const iceWallMat = createCandyMaterial(0x0369a1, { roughness: 0.14, clearcoat: 0.92 });
    const snowCapMat = createCandyMaterial(0xffffff, { roughness: 0.3, clearcoat: 0.4 });
    const pineMat = createCandyMaterial(0x0d9488, { roughness: 0.35 });

    const placeIceRim = (wx, wz, idx) => {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.62, 0.90), iceWallMat);
      block.position.set(wx, 0.31, wz);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.14, 0.78), snowCapMat);
      cap.position.set(wx, 0.68, wz);
      cap.userData.noCastShadow = true;
      root.add(block, cap);

      if (idx % 4 === 0) {
        // Snow-dusted pine tree
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.75, 8), pineMat);
        c1.position.set(wx, 1.05, wz);
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 8), pineMat);
        c2.position.set(wx, 1.48, wz);
        const topSnow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 8), snowCapMat);
        topSnow.position.set(wx, 1.66, wz);
        root.add(c1, c2, topSnow);
      } else if (idx % 4 === 2) {
        // Warm glowing candy-cane lantern
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.72, 10),
          new THREE.MeshPhysicalMaterial({
            map: createPeppermintStripeTexture(),
            clearcoat: 0.9,
            transparent: false,
          })
        );
        pole.position.set(wx, 1.08, wz);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 12, 10),
          createCandyMaterial(0xfef08a, {
            emissive: 0xf59e0b,
            emissiveIntensity: 0.85,
          })
        );
        bulb.position.set(wx, 1.50, wz);
        root.add(pole, bulb);
      }
    };

    let idx = 0;
    for (let c = -1; c <= GRID_COLS; c += 1) {
      placeIceRim(colToWorldX(c), minZ, idx++);
      placeIceRim(colToWorldX(c), maxZ, idx++);
    }
    for (let r = 0; r < GRID_ROWS; r += 1) {
      placeIceRim(minX, rowToWorldZ(r), idx++);
      placeIceRim(maxX, rowToWorldZ(r), idx++);
    }
    return enableShadows(root);
  }

  if (arenaId === 'toy_kingdom') {
    // Sky-periwinkle playroom mat + interlocking primary-color plastic border + pinwheels!
    const playMat = new THREE.Mesh(
      new THREE.PlaneGeometry(68, 56),
      createCandyMaterial(0xc7d2fe, { roughness: 0.42, clearcoat: 0.25 })
    );
    playMat.rotation.x = -Math.PI * 0.5;
    playMat.position.y = -0.45;
    root.add(playMat);

    const baseBoard = new THREE.Mesh(
      new THREE.BoxGeometry(17.5, 0.56, 15.5),
      createCandyMaterial(0x4f46e5, { roughness: 0.25, clearcoat: 0.75 })
    );
    baseBoard.position.y = -0.29;
    root.add(baseBoard);

    const colors = [0xef4444, 0x3b82f6, 0xeab308, 0x10b981];
    const mats = colors.map((c) => createCandyMaterial(c, { roughness: 0.14, clearcoat: 0.9 }));
    const studGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12);
    animTargets.pinwheels = [];

    const placeToyRim = (wx, wz, i) => {
      const mat = mats[i % mats.length];
      const brick = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.62, 0.92), mat);
      brick.position.set(wx, 0.31, wz);
      const stud = new THREE.Mesh(studGeo, mat);
      stud.position.set(wx, 0.68, wz);
      stud.userData.noCastShadow = true;
      root.add(brick, stud);
    };

    let idx = 0;
    for (let c = -1; c <= GRID_COLS; c += 1) {
      placeToyRim(colToWorldX(c), minZ, idx++);
      placeToyRim(colToWorldX(c), maxZ, idx++);
    }
    for (let r = 0; r < GRID_ROWS; r += 1) {
      placeToyRim(minX, rowToWorldZ(r), idx++);
      placeToyRim(maxX, rowToWorldZ(r), idx++);
    }

    // 4 Corner spinning toy pinwheels!
    const stickMat = createCandyMaterial(0xffffff);
    for (const [px, pz] of [
      [minX, minZ],
      [maxX, minZ],
      [minX, maxZ],
      [maxX, maxZ],
    ]) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), stickMat);
      stick.position.set(px, 1.15, pz);
      root.add(stick);

      const wheel = new THREE.Group();
      wheel.position.set(px, 1.68, pz);
      for (let b = 0; b < 4; b += 1) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.52, 4), mats[b]);
        const ang = (b * Math.PI) / 2;
        blade.position.set(Math.cos(ang) * 0.22, Math.sin(ang) * 0.22, 0.06);
        blade.rotation.z = ang - Math.PI * 0.5;
        wheel.add(blade);
      }
      root.add(wheel);
      animTargets.pinwheels.push(wheel);
    }

    return enableShadows(root);
  }

  // Default: `candy_town` (`糖果镇`) — Strawberry milk surround, dark-cocoa wafer platter, chocolate fences & giant lollipops
  const meadow = new THREE.Mesh(
    new THREE.PlaneGeometry(68, 56),
    createCandyMaterial(0xfbcfe8, { roughness: 0.36, clearcoat: 0.3 })
  );
  meadow.rotation.x = -Math.PI * 0.5;
  meadow.position.y = -0.45;
  root.add(meadow);

  const waferPlatter = new THREE.Mesh(
    new THREE.BoxGeometry(17.5, 0.56, 15.5),
    createCandyMaterial(0x7c3f25, { roughness: 0.32, clearcoat: 0.55 })
  );
  waferPlatter.position.y = -0.29;
  root.add(waferPlatter);

  const chocoMat = createCandyMaterial(0x5c2d16, { roughness: 0.28, clearcoat: 0.72 });
  const icingMat = createCandyMaterial(0xfff1f5, { roughness: 0.2, clearcoat: 0.85 });
  const pepTex = createPeppermintStripeTexture();

  const placeCandyRim = (wx, wz, i) => {
    const choco = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.60, 0.90), chocoMat);
    choco.position.set(wx, 0.30, wz);
    // Narrowed icing cap (0.76x0.76) reveals rich dark chocolate perimeter border from 55° overhead
    const icing = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.76), icingMat);
    icing.position.set(wx, 0.64, wz);
    icing.userData.noCastShadow = true;
    root.add(choco, icing);

    if (i % 5 === 1) {
      // Giant Swirled Lollipop on perimeter!
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.95, 10),
        icingMat
      );
      stick.position.set(wx, 1.12, wz);
      const candyDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.14, 20),
        new THREE.MeshPhysicalMaterial({
          map: pepTex,
          roughness: 0.08,
          clearcoat: 1.0,
          transparent: false,
        })
      );
      candyDisc.rotation.x = Math.PI * 0.5;
      candyDisc.position.set(wx, 1.62, wz);
      root.add(stick, candyDisc);
    }
  };

  let idx = 0;
  for (let c = -1; c <= GRID_COLS; c += 1) {
    placeCandyRim(colToWorldX(c), minZ, idx++);
    placeCandyRim(colToWorldX(c), maxZ, idx++);
  }
  for (let r = 0; r < GRID_ROWS; r += 1) {
    placeCandyRim(minX, rowToWorldZ(r), idx++);
    placeCandyRim(maxX, rowToWorldZ(r), idx++);
  }

  return enableShadows(root);
}

/**
 * Manages the active 3D arena floor, hard walls, dynamic soft blocks, mode pads,
 * perimeter props, and soft-block shatter fragment particles.
 */
export class ArenaStageManager {
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    this.stageGroup = new THREE.Group();
    this.debrisGroup = new THREE.Group();
    this.parentGroup.add(this.stageGroup);
    this.parentGroup.add(this.debrisGroup);

    this.currentKey = '';
    this.currentArenaId = 'candy_town';
    this.softBlockMeshes = [];
    this.softBlockPresent = [];
    this.landmarkPulses = [];
    this.animTargets = {};
    this.debrisFragments = [];

    this._fragGeo = markShared(new THREE.BoxGeometry(0.22, 0.22, 0.22));
    this._floorTileGeo = markShared(new THREE.BoxGeometry(0.985, 0.14, 0.985));
    this._floorStudGeo = markShared(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 8));
    this._floorMaterialsByArena = new Map();
  }

  _getFloorMaterials(arenaId) {
    if (this._floorMaterialsByArena.has(arenaId)) {
      return this._floorMaterialsByArena.get(arenaId);
    }
    let matA;
    let matB;
    if (arenaId === 'pirate_bay') {
      matA = markShared(
        new THREE.MeshStandardMaterial({
          map: createDeckPlankTexture('#F3C88E'),
          roughness: 0.46,
          metalness: 0.05,
          transparent: false,
        })
      );
      matB = markShared(
        new THREE.MeshStandardMaterial({
          map: createDeckPlankTexture('#8E511D'),
          roughness: 0.50,
          metalness: 0.05,
          transparent: false,
        })
      );
    } else if (arenaId === 'ice_village') {
      matA = markShared(createCandyMaterial(0xffffff, { roughness: 0.14, clearcoat: 0.85 }));
      matB = markShared(createCandyMaterial(0x60a5fa, { roughness: 0.12, clearcoat: 0.90 }));
    } else if (arenaId === 'toy_kingdom') {
      matA = markShared(createCandyMaterial(0xfefce8, { roughness: 0.24, clearcoat: 0.65 }));
      matB = markShared(createCandyMaterial(0xfacc15, { roughness: 0.22, clearcoat: 0.68 }));
    } else {
      matA = markShared(createCandyMaterial(0xfffbeb, { roughness: 0.24, clearcoat: 0.58 }));
      matB = markShared(createCandyMaterial(0xf472b6, { roughness: 0.22, clearcoat: 0.65 }));
    }
    const pair = { matA, matB };
    this._floorMaterialsByArena.set(arenaId, pair);
    return pair;
  }

  /**
   * Immediately clears all active 3D soft-block shatter debris particles.
   */
  clearDebris() {
    for (let i = 0; i < this.debrisFragments.length; i += 1) {
      const f = this.debrisFragments[i];
      this.debrisGroup.remove(f.mesh);
      if (f.mat && !f.mat.userData?.shared) {
        f.mat.dispose();
      }
    }
    this.debrisFragments = [];
  }

  /**
   * Resets soft-block diff state & clears lingering debris on new match start without firing bursts.
   */
  resetForNewMatch(arenaId, grid) {
    this.clearDebris();
    if (Array.isArray(grid) && grid.length >= GRID_ROWS) {
      this.sync(arenaId, grid, 0, 0, false);
    }
  }

  /**
   * Computes a lightweight topology signature for static tiles (HARD_WALL, BUN_SHRINE, TEAM_BASE_*)
   * so customGrid overrides rebuild cleanly while soft-block destruction stays zero-alloc O(195).
   */
  _computeStaticSignature(arenaId, grid) {
    let sig = `${arenaId}:`;
    for (let r = 0; r < GRID_ROWS; r += 1) {
      const row = grid[r];
      for (let c = 0; c < GRID_COLS; c += 1) {
        const t = row[c];
        // Treat EMPTY and SOFT_BLOCK identically in static topology signature
        sig += t === TILE_TYPE.SOFT_BLOCK ? '0' : String(t);
      }
    }
    return sig;
  }

  /**
   * Synchronizes the 3D arena stage with `(arenaId, grid)`.
   * @param {string} arenaId
   * @param {number[][]} grid
   * @param {number} timeSec
   * @param {number} dtSec
   * @param {boolean} allowBreakBurst
   */
  sync(arenaId, grid, timeSec = 0, dtSec = 1 / 60, allowBreakBurst = true) {
    if (!Array.isArray(grid) || grid.length < GRID_ROWS) return;

    if (!allowBreakBurst) {
      this.clearDebris();
    }

    const sig = this._computeStaticSignature(arenaId, grid);
    if (sig !== this.currentKey) {
      this._rebuildStage(arenaId, grid);
      this.currentKey = sig;
    }

    // Fast dynamic soft-block visibility sync + shatter burst ONLY during live match destruction!
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < GRID_COLS; c += 1) {
        const isSoft = grid[r][c] === TILE_TYPE.SOFT_BLOCK;
        const wasSoft = this.softBlockPresent[r][c];
        const mesh = this.softBlockMeshes[r][c];

        if (isSoft && !mesh) {
          // Handle rare dynamic soft-block spawn (e.g., Boss Phase 2 'gear_crate_drop'!)
          const created = this._createSoftBlockForTheme(this.currentArenaId, c, r);
          created.position.set(colToWorldX(c), 0, rowToWorldZ(r));
          this.stageGroup.add(created);
          this.softBlockMeshes[r][c] = created;
        } else if (mesh) {
          mesh.visible = isSoft;
        }

        if (allowBreakBurst && wasSoft && !isSoft) {
          this.spawnBlockBreakBurst(c, r, this.currentArenaId);
        }
        this.softBlockPresent[r][c] = isSoft;
      }
    }

    // Animate ocean / pinwheels / Bun Shrine & Team Base beacons
    if (this.animTargets.ocean) {
      this.animTargets.ocean.position.y = -0.55 + Math.sin(timeSec * 1.8) * 0.05;
    }
    if (this.animTargets.pinwheels) {
      for (const pw of this.animTargets.pinwheels) {
        pw.rotation.z = timeSec * 2.2;
      }
    }
    for (let i = 0; i < this.landmarkPulses.length; i += 1) {
      const lm = this.landmarkPulses[i];
      if (lm.userData.halo) {
        const s = 1 + Math.sin(timeSec * 3.5) * 0.08;
        lm.userData.halo.scale.set(s, s, 1);
        lm.userData.halo.rotation.z = timeSec * 0.8;
      }
      if (lm.userData.pulseRing) {
        const s = 0.92 + Math.sin(timeSec * 4.2 + i) * 0.12;
        lm.userData.pulseRing.scale.set(s, s, 1);
      }
    }

    this._stepDebris(dtSec);
  }

  _createSoftBlockForTheme(arenaId, c, r) {
    const variant = c * 7 + r * 13;
    if (arenaId === 'pirate_bay') return buildPirateSoftBlock();
    if (arenaId === 'ice_village') return buildIceSoftBlock(variant);
    if (arenaId === 'toy_kingdom') return buildToySoftBlock(variant);
    return buildCandySoftBlock(variant);
  }

  _rebuildStage(arenaId, grid) {
    this.clearDebris();
    // Clear and safely dispose previous stage children (preserving cached textures & shared geo/mat)
    while (this.stageGroup.children.length > 0) {
      const oldChild = this.stageGroup.children[0];
      this.stageGroup.remove(oldChild);
      disposeHierarchyWithoutTextures(oldChild);
    }
    this.currentArenaId = arenaId || 'candy_town';
    this.softBlockMeshes = [];
    this.softBlockPresent = [];
    this.landmarkPulses = [];
    this.animTargets = {};

    // 1. Build 15x13 Checkerboard Floor Tiles using 2 InstancedMeshes (2 draw calls total!)
    const { matA, matB } = this._getFloorMaterials(this.currentArenaId);

    const totalTiles = GRID_COLS * GRID_ROWS;
    const floorInstA = new THREE.InstancedMesh(this._floorTileGeo, matA, Math.ceil(totalTiles / 2));
    const floorInstB = new THREE.InstancedMesh(this._floorTileGeo, matB, Math.ceil(totalTiles / 2));
    floorInstA.receiveShadow = true;
    floorInstB.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let idxA = 0;
    let idxB = 0;
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < GRID_COLS; c += 1) {
        dummy.position.set(colToWorldX(c), -0.07, rowToWorldZ(r));
        dummy.updateMatrix();
        if ((c + r) % 2 === 0) {
          floorInstA.setMatrixAt(idxA++, dummy.matrix);
        } else {
          floorInstB.setMatrixAt(idxB++, dummy.matrix);
        }
      }
    }
    floorInstA.count = idxA;
    floorInstB.count = idxB;
    floorInstA.instanceMatrix.needsUpdate = true;
    floorInstB.instanceMatrix.needsUpdate = true;
    this.stageGroup.add(floorInstA, floorInstB);

    // Optional Toy Kingdom subtle baseplate studs on floor corners (1 InstancedMesh)
    if (this.currentArenaId === 'toy_kingdom') {
      const studInst = new THREE.InstancedMesh(this._floorStudGeo, matB, totalTiles);
      studInst.receiveShadow = true;
      let si = 0;
      for (let r = 0; r < GRID_ROWS; r += 1) {
        for (let c = 0; c < GRID_COLS; c += 1) {
          dummy.position.set(colToWorldX(c), 0.012, rowToWorldZ(r));
          dummy.updateMatrix();
          studInst.setMatrixAt(si++, dummy.matrix);
        }
      }
      studInst.count = si;
      studInst.instanceMatrix.needsUpdate = true;
      this.stageGroup.add(studInst);
    }

    // 2. Populate Hard Walls, Soft Blocks, Bun Shrine, & Team Bases
    for (let r = 0; r < GRID_ROWS; r += 1) {
      this.softBlockMeshes[r] = new Array(GRID_COLS).fill(null);
      this.softBlockPresent[r] = new Array(GRID_COLS).fill(false);

      for (let c = 0; c < GRID_COLS; c += 1) {
        const cell = grid[r][c];
        const wx = colToWorldX(c);
        const wz = rowToWorldZ(r);
        const variant = c * 5 + r * 11;

        if (cell === TILE_TYPE.HARD_WALL) {
          let wall;
          if (this.currentArenaId === 'pirate_bay') {
            wall = buildPirateHardWall(variant, c, r);
          } else if (this.currentArenaId === 'ice_village') {
            wall = buildIceHardWall(variant);
          } else if (this.currentArenaId === 'toy_kingdom') {
            wall = buildToyHardWall(variant);
          } else {
            wall =
              (c + r) % 4 === 0
                ? buildPeppermintPillarHardWall()
                : buildCupcakeHardWall(variant);
          }
          wall.position.set(wx, 0, wz);
          this.stageGroup.add(wall);
        } else if (cell === TILE_TYPE.SOFT_BLOCK) {
          const sb = this._createSoftBlockForTheme(this.currentArenaId, c, r);
          sb.position.set(wx, 0, wz);
          this.stageGroup.add(sb);
          this.softBlockMeshes[r][c] = sb;
          this.softBlockPresent[r][c] = true;
        } else if (cell === TILE_TYPE.BUN_SHRINE) {
          const shrine = buildBunShrineLandmark();
          shrine.position.set(wx, 0, wz);
          this.stageGroup.add(shrine);
          this.landmarkPulses.push(shrine);
        } else if (cell === TILE_TYPE.TEAM_BASE_BLUE || cell === TILE_TYPE.TEAM_BASE_RED) {
          const pad = buildTeamBasePad(cell === TILE_TYPE.TEAM_BASE_BLUE);
          pad.position.set(wx, 0, wz);
          this.stageGroup.add(pad);
          this.landmarkPulses.push(pad);
        }
      }
    }

    // 3. Outer Perimeter Border & Diorama Props
    const perimeter = buildPerimeterDiorama(this.currentArenaId, this.animTargets);
    this.stageGroup.add(perimeter);
  }

  /**
   * Spawns themed 3D shatter fragments when a destructible soft block breaks.
   */
  spawnBlockBreakBurst(col, row, arenaId = 'candy_town') {
    const wx = colToWorldX(col);
    const wz = rowToWorldZ(row);
    const colorMap = {
      candy_town: [0xfbbf24, 0xf43f5e, 0xa855f7],
      pirate_bay: [0xc9823b, 0x8b4d17, 0xfbbf24],
      ice_village: [0x93e2ff, 0xffffff, 0x38bdf8],
      toy_kingdom: [0xef4444, 0x3b82f6, 0xfacc15],
    };
    const palette = colorMap[arenaId] || colorMap.candy_town;

    for (let i = 0; i < 8; i += 1) {
      const ang = (i / 8) * Math.PI * 2 + 0.35;
      const mat = createCandyMaterial(palette[i % palette.length], { clearcoat: 0.7 });
      const mesh = new THREE.Mesh(this._fragGeo, mat);
      mesh.position.set(wx + Math.cos(ang) * 0.16, 0.38, wz + Math.sin(ang) * 0.16);
      this.debrisGroup.add(mesh);
      this.debrisFragments.push({
        mesh,
        mat,
        vx: Math.cos(ang) * 2.3,
        vy: 3.6 + (i % 3) * 0.65,
        vz: Math.sin(ang) * 2.3,
        age: 0,
        life: 0.52,
      });
    }
  }

  _stepDebris(dtSec) {
    const dt = Math.max(0, Math.min(dtSec || 0, 0.1));
    for (let i = this.debrisFragments.length - 1; i >= 0; i -= 1) {
      const f = this.debrisFragments[i];
      f.age += dt;
      if (f.age >= f.life) {
        this.debrisGroup.remove(f.mesh);
        f.mat.dispose();
        this.debrisFragments.splice(i, 1);
        continue;
      }
      f.vy -= 12.5 * dt;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y = Math.max(0.05, f.mesh.position.y + f.vy * dt);
      f.mesh.position.z += f.vz * dt;
      f.mesh.rotation.x += 7.0 * dt;
      f.mesh.rotation.y += 5.5 * dt;
      const s = Math.max(0.05, 1.0 - f.age / f.life);
      f.mesh.scale.setScalar(s);
    }
  }
}
