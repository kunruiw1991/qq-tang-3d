/**
 * Articulated Chibi 3D Character Rigs & 60fps Procedural Animations
 * (`src/render/character_meshes.js`) for all 4 classic *QQ Tang* heroes:
 *   - `miduo` (`米多`): Sunny strawberry-pink sporty mascot with star-visor cap,
 *     bouncy candy twin-pigtails, fluttering scarf, and oversized sneakers.
 *   - `xiaoqiang` (`小强`): Energetic electric-blue/crimson-gold boy with springy
 *     curved 3D feeler antennae, spiky bangs, and beetle-wing jetpack shell.
 *   - `haiwangzi` (`海王子`): Dashing Ocean Prince with swept azure bangs, gleaming
 *     3D golden royal crown + ruby/sapphire gems, royal navy tunic & fluttering capelet.
 *   - `wanzi` (`丸子`): Adorable girl with symmetrical twin spherical Odango buns (`丸子头`)
 *     wrapped in yellow ribbon bands + coral/marigold pleated dress.
 *
 * CRITICAL TRANSMISSION INVARIANT:
 *   Every character mesh & `512x512` `CanvasTexture` face uses `transparent: false`
 *   so character faces stay 100% sharp and visible inside transmissive/transparent bubbles!
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import {
  CHARACTER_METADATA,
  ITEM_TYPES,
  PLAYER_STATES,
  tileToWorldX,
  tileToWorldZ,
} from '../contracts/constants.js';
import {
  createCandyMaterial,
  createChibiFaceTexture,
  createMetallicMaterial,
} from './materials.js';

function createStarBadgeMesh(radius = 0.085, thickness = 0.025, mat) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const ang = -Math.PI * 0.5 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.46;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  geo.center();
  return new THREE.Mesh(geo, mat);
}

function shortestAngleDelta(fromRad, toRad) {
  let diff = (toRad - fromRad) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Builds a complete articulated 3D chibi rig facing `+Z` (`rotation.y = facingRad`).
 *
 * @param {string} characterId - 'miduo' | 'xiaoqiang' | 'haiwangzi' | 'wanzi'
 * @param {object} [options] - { team: 0|1, isPrimaryHuman: boolean }
 */
export function createCharacterRig(characterId = 'miduo', options = {}) {
  const safeId = CHARACTER_METADATA[characterId] ? characterId : 'miduo';
  const team = options.team === 1 ? 1 : 0;
  const isPrimaryHuman = Boolean(options.isPrimaryHuman);

  const root = new THREE.Group();
  root.name = `char_${safeId}`;

  // 1. Crisp Team Floor Ring (Blue #38BDF8 vs Red #FB7185) + P1 inner golden star ring
  const floorGroup = new THREE.Group();
  const teamColor = team === 0 ? 0x38bdf8 : 0xfb7185;
  const teamRingMat = new THREE.MeshBasicMaterial({
    color: teamColor,
    side: THREE.DoubleSide,
    transparent: false,
  });
  const teamRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.47, 28), teamRingMat);
  teamRing.rotation.x = -Math.PI * 0.5;
  teamRing.position.y = 0.022;
  floorGroup.add(teamRing);

  let p1Pointer = null;
  if (isPrimaryHuman) {
    p1Pointer = new THREE.Mesh(
      new THREE.RingGeometry(0.49, 0.55, 28),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: false,
      })
    );
    p1Pointer.rotation.x = -Math.PI * 0.5;
    p1Pointer.position.y = 0.025;
    floorGroup.add(p1Pointer);
  }
  root.add(floorGroup);

  // 2. Actor Pivot (elevates smoothly when riding Turtle/UFO, jumping, or floating in water-trap!)
  const actorPivot = new THREE.Group();
  root.add(actorPivot);

  const bodyTilt = new THREE.Group();
  actorPivot.add(bodyTilt);

  // Pre-bake all 3 opaque 512x512 face textures (`transparent: false`!)
  const faceTextures = {
    normal: createChibiFaceTexture(safeId, 'normal'),
    happy: createChibiFaceTexture(safeId, 'happy'),
    trapped: createChibiFaceTexture(safeId, 'trapped'),
  };

  const skinMat = createCandyMaterial(0xffd8bc, { roughness: 0.38, clearcoat: 0.22 });
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTextures.normal,
    roughness: 0.52,
    metalness: 0.0,
    envMapIntensity: 0.25,
    transparent: false,
  });

  // Character-specific palettes
  const paletteMap = {
    miduo: {
      torso: 0xff5e99,
      trim: 0xffffff,
      accent: 0xfacc15,
      shoe: 0xe11d48,
      sole: 0xffffff,
    },
    xiaoqiang: {
      torso: 0x2563eb,
      trim: 0xfacc15,
      accent: 0xef4444,
      shoe: 0xfacc15,
      sole: 0xef4444,
    },
    haiwangzi: {
      torso: 0x1d4ed8,
      trim: 0x67e8f9,
      accent: 0xfbbf24,
      shoe: 0xf8fafc,
      sole: 0x1e3a8a,
    },
    wanzi: {
      torso: 0xff8fab,
      trim: 0xfbbf24,
      accent: 0x34d399,
      shoe: 0xbe185d,
      sole: 0xfff1f2,
    },
  };
  const pal = paletteMap[safeId];

  const torsoMat = createCandyMaterial(pal.torso, { roughness: 0.24, clearcoat: 0.72 });
  const trimMat = createCandyMaterial(pal.trim, { roughness: 0.22, clearcoat: 0.72 });
  const accentMat = createCandyMaterial(pal.accent, { roughness: 0.2, clearcoat: 0.85 });
  const shoeMat = createCandyMaterial(pal.shoe, { roughness: 0.22, clearcoat: 0.8 });
  const soleMat = createCandyMaterial(pal.sole, { roughness: 0.3, clearcoat: 0.4 });
  const goldMetalMat = createMetallicMaterial(0xfbbf24, { roughness: 0.2, metalness: 0.85 });

  // 3. Cute Oversized Chibi Feet / Sneakers
  const createShoe = () => {
    const sg = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), shoeMat);
    upper.scale.set(0.95, 0.72, 1.32);
    upper.position.set(0, 0.095, 0.04);
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.14, 0.05, 14), soleMat);
    sole.scale.set(0.95, 1, 1.32);
    sole.position.set(0, 0.03, 0.04);
    sg.add(upper, sole);
    return sg;
  };

  const leftFoot = createShoe();
  leftFoot.position.set(-0.145, 0, 0);
  const rightFoot = createShoe();
  rightFoot.position.set(0.145, 0, 0);
  bodyTilt.add(leftFoot, rightFoot);

  // 4. Rounded Chibi Torso
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.38, 0);
  bodyTilt.add(torsoGroup);

  if (safeId === 'wanzi') {
    // Flared pleated A-line dress for WanZi!
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.40, 18), torsoMat);
    skirt.position.y = -0.02;
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.032, 8, 20), trimMat);
    hem.rotation.x = Math.PI * 0.5;
    hem.position.y = -0.19;
    const bodice = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), torsoMat);
    bodice.position.y = 0.08;
    // Cute emerald/gold front waist bow
    const frontBow = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), accentMat);
    frontBow.scale.set(1.6, 0.9, 0.7);
    frontBow.position.set(0, 0.04, 0.23);
    torsoGroup.add(skirt, hem, bodice, frontBow);
  } else {
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.225, 0.17, 10, 16), torsoMat);
    torsoGroup.add(chest);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.232, 0.232, 0.06, 16), trimMat);
    belt.position.y = -0.08;
    torsoGroup.add(belt);
  }

  // 5. Stubby Articulated Chibi Arms + Mitten Hands
  const createArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.27, 0.50, 0);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.13, 8, 12), torsoMat);
    sleeve.position.set(side * 0.03, -0.09, 0);
    sleeve.rotation.z = -side * 0.22;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), skinMat);
    hand.position.set(side * 0.06, -0.20, 0.02);
    pivot.add(sleeve, hand);
    return pivot;
  };

  const leftArm = createArm(-1);
  const rightArm = createArm(1);
  bodyTilt.add(leftArm, rightArm);

  // 6. Oversized Expressive Chibi Head (`radius = 0.345`) + Cute Ears
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.84, 0);
  bodyTilt.add(headPivot);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.345, 32, 24), faceMat);
  // Rotate -90 deg around Y so UV (0.5, 0.5) faces directly +Z forward!
  headMesh.rotation.y = -Math.PI * 0.5;
  headPivot.add(headMesh);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skinMat);
    ear.scale.set(0.55, 0.9, 0.75);
    ear.position.set(side * 0.335, -0.02, 0.0);
    headPivot.add(ear);
  }

  // Secondary-motion accessory handles
  const secondaryParts = {
    pigtailL: null,
    pigtailR: null,
    antennaL: null,
    antennaR: null,
    cape: null,
    scarfTail: null,
    odangoL: null,
    odangoR: null,
  };

  // 7. Unmistakable Character-Specific 3D Headgear, Hair & Accessories
  if (safeId === 'miduo') {
    // MiDuo (米多): Sunny Visor Cap with 3D Star Badge + Twin Candy-Pink Pigtail Puffs + Scarf!
    const capMat = createCandyMaterial(0xff4d8d, { roughness: 0.18, clearcoat: 0.88 });
    const visorMat = createCandyMaterial(0xff9f1c, { roughness: 0.18, clearcoat: 0.88 });
    const hairMat = createCandyMaterial(0x7c3aed, { roughness: 0.28, clearcoat: 0.55 });
    const puffMat = createCandyMaterial(0xff6b9d, { roughness: 0.2, clearcoat: 0.82 });

    // Upper cap dome covering crown & back of head without blocking face!
    const capDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.362, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
      capMat
    );
    capDome.rotation.x = -0.22;
    capDome.position.y = 0.02;
    headPivot.add(capDome);

    // Sunny curved front visor brim (+Z)
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.045, 20, 1, false, -1.05, 2.1), visorMat);
    visor.position.set(0, 0.15, 0.13);
    visor.rotation.x = 0.18;
    headPivot.add(visor);

    // Raised 3D Golden Star Emblem on front of cap
    const starBadge = createStarBadgeMesh(0.10, 0.03, goldMetalMat);
    starBadge.position.set(0, 0.25, 0.32);
    starBadge.rotation.x = -0.2;
    headPivot.add(starBadge);

    // Twin Bouncy Candy-Sphere Pigtails on left & right sides
    for (const side of [-1, 1]) {
      const pGroup = new THREE.Group();
      pGroup.position.set(side * 0.34, 0.05, -0.06);

      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 8, 14), accentMat);
      tie.rotation.y = Math.PI * 0.5;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 14), puffMat);
      puff.position.set(side * 0.12, -0.02, -0.03);
      const miniPuff = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), hairMat);
      miniPuff.position.set(side * 0.23, -0.08, -0.05);

      pGroup.add(tie, puff, miniPuff);
      headPivot.add(pGroup);
      if (side < 0) secondaryParts.pigtailL = pGroup;
      else secondaryParts.pigtailR = pGroup;
    }

    // Sporty Scarf around neck + fluttering back tails
    const scarfMat = createCandyMaterial(0xef4444, { roughness: 0.25, clearcoat: 0.65 });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.052, 10, 20), scarfMat);
    collar.rotation.x = Math.PI * 0.5;
    collar.position.set(0, 0.54, 0.01);
    bodyTilt.add(collar);

    const scarfTail = new THREE.Group();
    scarfTail.position.set(0.06, 0.52, -0.20);
    const tailA = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.04), scarfMat);
    tailA.position.set(-0.04, -0.11, -0.04);
    tailA.rotation.set(0.35, 0, -0.15);
    const tailB = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.22, 0.04), trimMat);
    tailB.position.set(0.06, -0.09, -0.05);
    tailB.rotation.set(0.42, 0, 0.2);
    scarfTail.add(tailA, tailB);
    bodyTilt.add(scarfTail);
    secondaryParts.scarfTail = scarfTail;
  } else if (safeId === 'xiaoqiang') {
    // XiaoQiang (小强): Glossy Crimson-Blue Helmet Hood + 2 Springy Curved 3D Feeler Antennae + Wing Backpack!
    const hoodMat = createCandyMaterial(0xdc2626, { roughness: 0.16, clearcoat: 0.92 });
    const sidePodMat = createCandyMaterial(0x2563eb, { roughness: 0.18, clearcoat: 0.88 });
    const darkHairMat = createCandyMaterial(0x1e293b, { roughness: 0.32 });

    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.365, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hoodMat
    );
    hood.rotation.x = -0.30;
    hood.position.y = 0.01;
    headPivot.add(hood);

    // Center gold racing crest on helmet
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42), accentMat);
    crest.position.set(0, 0.33, -0.02);
    headPivot.add(crest);

    // Energetic spiky front bangs above eyes
    for (const [bx, rotZ] of [
      [-0.09, 0.25],
      [0.01, -0.05],
      [0.10, -0.28],
    ]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 8), darkHairMat);
      spike.position.set(bx, 0.20, 0.32);
      spike.rotation.set(2.5, 0, rotZ);
      headPivot.add(spike);
    }

    // Two tall springy curved 3D feeler antennae with glowing gold orb tips!
    for (const side of [-1, 1]) {
      const earPod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14), sidePodMat);
      earPod.rotation.z = Math.PI * 0.5;
      earPod.position.set(side * 0.35, 0.03, 0.02);
      headPivot.add(earPod);

      const antPivot = new THREE.Group();
      antPivot.position.set(side * 0.15, 0.33, 0.06);

      const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.24, 10), hoodMat);
      seg1.position.set(side * 0.04, 0.11, 0.02);
      seg1.rotation.z = -side * 0.32;

      const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.026, 0.20, 10), hoodMat);
      seg2.position.set(side * 0.13, 0.28, 0.08);
      seg2.rotation.set(0.35, 0, -side * 0.58);

      const tipOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.068, 12, 10),
        createCandyMaterial(0xfde047, {
          emissive: 0xf59e0b,
          emissiveIntensity: 0.45,
          clearcoat: 1.0,
        })
      );
      tipOrb.position.set(side * 0.20, 0.36, 0.14);

      antPivot.add(seg1, seg2, tipOrb);
      headPivot.add(antPivot);
      if (side < 0) secondaryParts.antennaL = antPivot;
      else secondaryParts.antennaR = antPivot;
    }

    // Glossy Mini Wing-Shell Backpack on Torso
    const wingPack = new THREE.Group();
    wingPack.position.set(0, 0.04, -0.22);
    for (const side of [-1, 1]) {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), hoodMat);
      shell.scale.set(0.75, 1.35, 0.5);
      shell.position.set(side * 0.10, 0, -0.02);
      shell.rotation.z = -side * 0.28;
      wingPack.add(shell);
    }
    torsoGroup.add(wingPack);
  } else if (safeId === 'haiwangzi') {
    // HaiWangZi (海王子): Swept Ocean-Azure Hair + Gleaming 3D Golden Royal Crown + Gems + Capelet!
    const hairMat = createCandyMaterial(0x0ea5e9, { roughness: 0.22, clearcoat: 0.72 });
    const cyanHighlightMat = createCandyMaterial(0x67e8f9, { roughness: 0.2, clearcoat: 0.8 });

    // Layered azure hair cap covering top/sides/back
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.366, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairCap.rotation.x = -0.34;
    hairCap.position.y = 0.02;
    headPivot.add(hairCap);

    // Swept anime bangs across upper forehead (kept high so sapphire eyes stay 100% clear)
    for (const [bx, by, rotZ, mat] of [
      [-0.14, 0.21, 0.42, hairMat],
      [-0.02, 0.23, 0.22, cyanHighlightMat],
      [0.12, 0.21, -0.30, hairMat],
    ]) {
      const bang = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 10), mat);
      bang.position.set(bx, by, 0.30);
      bang.rotation.set(2.65, 0, rotZ);
      headPivot.add(bang);
    }

    // Side prince locks framing cheeks
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 10), hairMat);
      lock.position.set(side * 0.31, -0.02, 0.15);
      lock.rotation.set(2.95, 0, -side * 0.18);
      headPivot.add(lock);
    }

    // Gleaming 3D Golden Royal Crown with 5 Peaks & Ruby/Sapphire Gems!
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 0.34, 0.03);
    crownGroup.rotation.x = 0.10;

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.20, 0.11, 20), goldMetalMat);
    crownGroup.add(band);

    const rubyMat = createCandyMaterial(0xe11d48, {
      roughness: 0.06,
      clearcoat: 1.0,
      emissive: 0xbe123c,
      emissiveIntensity: 0.3,
    });
    const sapphireMat = createCandyMaterial(0x0284c7, {
      roughness: 0.06,
      clearcoat: 1.0,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.3,
    });

    for (let i = 0; i < 5; i += 1) {
      const ang = (i * Math.PI * 2) / 5 + Math.PI * 0.5; // Peak 0 directly at +Z front!
      const px = Math.cos(ang) * 0.19;
      const pz = Math.sin(ang) * 0.19;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.15, 6), goldMetalMat);
      peak.position.set(px, 0.12, pz);
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), goldMetalMat);
      pearl.position.set(px, 0.20, pz);
      crownGroup.add(peak, pearl);
    }

    // Front center ruby gem + side sapphire gems
    const centerGem = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), rubyMat);
    centerGem.position.set(0, 0.01, 0.21);
    const gemL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), sapphireMat);
    gemL.position.set(-0.14, 0.01, 0.15);
    const gemR = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), sapphireMat);
    gemR.position.set(0.14, 0.01, 0.15);
    crownGroup.add(centerGem, gemL, gemR);
    headPivot.add(crownGroup);

    // Royal Gold Epaulets & Fluttering Ocean Capelet
    for (const side of [-1, 1]) {
      const ep = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), goldMetalMat);
      ep.scale.set(1.2, 0.55, 0.9);
      ep.position.set(side * 0.23, 0.15, 0);
      torsoGroup.add(ep);
    }

    const capePivot = new THREE.Group();
    capePivot.position.set(0, 0.53, -0.18);
    const capeMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.44, 14, 1, false, Math.PI * 0.65, Math.PI * 0.7),
      createCandyMaterial(0x0284c7, { roughness: 0.25, clearcoat: 0.65 })
    );
    capeMesh.position.set(0, -0.18, -0.06);
    capeMesh.rotation.x = 0.28;
    capePivot.add(capeMesh);
    bodyTilt.add(capePivot);
    secondaryParts.cape = capePivot;
  } else {
    // WanZi (丸子): Iconic Symmetrical Twin Spherical Odango Buns (丸子头) + Yellow Ribbon Bands!
    const berryHairMat = createCandyMaterial(0x4a1d35, { roughness: 0.24, clearcoat: 0.78 });
    const ribbonMat = createCandyMaterial(0xfacc15, { roughness: 0.18, clearcoat: 0.9 });
    const coralBowMat = createCandyMaterial(0xff5d8f, { roughness: 0.2, clearcoat: 0.85 });

    // Smooth dark-berry hair dome around back & crown
    const hairDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.362, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.56),
      berryHairMat
    );
    hairDome.rotation.x = -0.34;
    hairDome.position.y = 0.02;
    headPivot.add(hairDome);

    // Cute curved high fringe bangs (above eyebrows so eyes sparkle clearly)
    const fringe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.34, 0.09, 18, 1, false, -0.85, 1.7),
      berryHairMat
    );
    fringe.position.set(0, 0.23, 0.06);
    fringe.rotation.x = 0.15;
    headPivot.add(fringe);

    // Symmetrical Twin Odango Buns (`丸子头`) at ±42° wrapped in Yellow Ribbon Bands + Bows!
    for (const side of [-1, 1]) {
      const bunGroup = new THREE.Group();
      bunGroup.position.set(side * 0.29, 0.28, -0.02);
      bunGroup.rotation.z = -side * 0.62;

      const ribbonRing = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.036, 10, 18), ribbonMat);
      ribbonRing.rotation.x = Math.PI * 0.5;

      const odango = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 16), berryHairMat);
      odango.position.y = 0.09;

      // Cute trailing ribbon tab
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.025), coralBowMat);
      tab.position.set(side * 0.08, -0.05, 0.04);
      tab.rotation.z = -side * 0.4;

      bunGroup.add(ribbonRing, odango, tab);
      headPivot.add(bunGroup);
      if (side < 0) secondaryParts.odangoL = bunGroup;
      else secondaryParts.odangoR = bunGroup;
    }
  }

  // Enable crisp shadows on all character parts
  actorPivot.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const rig = {
    characterId: safeId,
    team,
    root,
    floorGroup,
    teamRing,
    p1Pointer,
    actorPivot,
    bodyTilt,
    torsoGroup,
    leftFoot,
    rightFoot,
    leftArm,
    rightArm,
    headPivot,
    headMesh,
    faceMat,
    faceTextures,
    secondaryParts,
    currentExpression: 'normal',
    currentYaw: team === 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
    initializedPose: false,
  };

  return rig;
}

/**
 * Switches the opaque 512x512 CanvasTexture on the character's head without reallocating.
 * @param {object} rig
 * @param {'normal'|'happy'|'trapped'} expr
 */
export function setCharacterExpression(rig, expr) {
  const next = expr === 'happy' || expr === 'trapped' ? expr : 'normal';
  if (rig.currentExpression !== next) {
    rig.currentExpression = next;
    rig.faceMat.map = rig.faceTextures[next];
    rig.faceMat.needsUpdate = true;
  }
}

/**
 * Updates 60fps procedural transforms & animations for a character rig from a `PlayerSnapshot`
 * (or showcase pose descriptor for Select / Title / Podium).
 *
 * @param {object} rig
 * @param {object} player - PlayerSnapshot from SimEngine.getSnapshot()
 * @param {number} timeSec
 * @param {number} dtSec
 * @param {object} [poseOverride] - { mode: 'celebrate' | 'polite_clap' | 'turntable' }
 */
export function updateCharacterRig(rig, player, timeSec = 0, dtSec = 1 / 60, poseOverride = null) {
  const dt = Math.max(0, Math.min(dtSec || 1 / 60, 0.1));

  // Showcase / Podium standalone animation path
  if (poseOverride && poseOverride.mode) {
    rig.root.visible = true;
    const phase = timeSec * 5.4 + (poseOverride.phaseOffset || 0);

    if (poseOverride.mode === 'celebrate') {
      setCharacterExpression(rig, 'happy');
      const jump = Math.max(0, Math.sin(phase)) * 0.24;
      rig.actorPivot.position.set(0, jump, 0);
      rig.bodyTilt.rotation.set(-0.08 * Math.sin(phase), 0, Math.sin(phase * 0.5) * 0.08);
      //Joyful raised V-arms!
      rig.leftArm.rotation.set(-0.2, 0, 2.4 + Math.sin(phase * 2) * 0.18);
      rig.rightArm.rotation.set(-0.2, 0, -2.4 - Math.sin(phase * 2) * 0.18);
      rig.leftFoot.position.set(-0.145, jump > 0.05 ? 0.04 : 0, 0);
      rig.rightFoot.position.set(0.145, jump > 0.05 ? 0.04 : 0, 0);
      rig.headPivot.rotation.set(-0.08, Math.sin(phase * 0.5) * 0.16, 0);
      _animateSecondary(rig, timeSec, 1.3);
      return;
    }

    if (poseOverride.mode === 'polite_clap') {
      setCharacterExpression(rig, 'normal');
      rig.actorPivot.position.set(0, Math.abs(Math.sin(phase * 0.7)) * 0.05, 0);
      rig.bodyTilt.rotation.set(0, 0, Math.sin(phase * 0.5) * 0.05);
      rig.leftArm.rotation.set(-0.9, 0.4 + Math.sin(phase * 2.2) * 0.15, 0.3);
      rig.rightArm.rotation.set(-0.9, -0.4 - Math.sin(phase * 2.2) * 0.15, -0.3);
      rig.headPivot.rotation.set(0, Math.sin(phase * 0.6) * 0.12, 0);
      _animateSecondary(rig, timeSec, 0.6);
      return;
    }

    if (poseOverride.mode === 'turntable') {
      setCharacterExpression(rig, 'happy');
      rig.actorPivot.position.set(0, Math.sin(timeSec * 3.4) * 0.04, 0);
      rig.bodyTilt.rotation.set(0, 0, Math.sin(timeSec * 1.8) * 0.04);
      // Friendly wave on right arm!
      rig.leftArm.rotation.set(Math.sin(timeSec * 3.0) * 0.18, 0, 0.15);
      rig.rightArm.rotation.set(-0.35, 0, -2.25 + Math.sin(timeSec * 7.5) * 0.28);
      rig.headPivot.rotation.set(-0.05, Math.sin(timeSec * 1.6) * 0.12, 0.05);
      _animateSecondary(rig, timeSec, 1.0);
      return;
    }
  }

  if (!player) {
    rig.root.visible = false;
    return;
  }

  // Eliminated player handling
  if (player.state === PLAYER_STATES.ELIMINATED) {
    rig.root.visible = false;
    rig.initializedPose = false;
    return;
  }

  rig.root.visible = true;
  const wx = tileToWorldX(player.x);
  const wz = tileToWorldZ(player.z);
  rig.root.position.set(wx, 0, wz);

  // Smooth yaw alignment toward player.facingRad
  const targetYaw = typeof player.facingRad === 'number' ? player.facingRad : 0;
  if (!rig.initializedPose) {
    rig.currentYaw = targetYaw;
    rig.initializedPose = true;
  } else {
    const delta = shortestAngleDelta(rig.currentYaw, targetYaw);
    rig.currentYaw += delta * Math.min(1, dt * 16);
  }
  rig.actorPivot.rotation.y = rig.currentYaw;

  // Mercy invulnerability shimmer (modulates brightness smoothly without blinking invisible!)
  if (player.invulnTimer > 0) {
    const pulse = 0.22 + Math.abs(Math.sin(timeSec * 22)) * 0.35;
    rig.faceMat.emissive.setHex(0xffffff);
    rig.faceMat.emissiveIntensity = pulse * 0.45;
  } else {
    rig.faceMat.emissiveIntensity = 0;
  }

  if (rig.p1Pointer) {
    const s = 1 + Math.sin(timeSec * 4.5) * 0.06;
    rig.p1Pointer.scale.set(s, s, 1);
  }

  // State 1: Trapped inside Giant Water Bubble (`state === 'trapped'`)
  if (player.state === PLAYER_STATES.TRAPPED) {
    setCharacterExpression(rig, 'trapped');
    const panicT = timeSec * 17.5;
    // Turn toward the camera (+Z) so the adorable >_< panic face is always 100% front-and-center!
    rig.currentYaw = Math.sin(timeSec * 4.2) * 0.24;
    rig.actorPivot.rotation.y = rig.currentYaw;
    // Float centered inside the 0.76-radius water-trap sphere!
    rig.actorPivot.position.set(0, 0.25 + Math.sin(timeSec * 4.5) * 0.05, 0);
    rig.bodyTilt.rotation.set(
      Math.sin(timeSec * 5.2) * 0.12,
      0,
      Math.cos(timeSec * 6.1) * 0.16
    );

    // Frantic paddling limbs!
    rig.leftArm.rotation.set(Math.sin(panicT) * 0.85 - 0.5, 0, 0.75);
    rig.rightArm.rotation.set(-Math.sin(panicT) * 0.85 - 0.5, 0, -0.75);
    rig.leftFoot.position.set(-0.145, 0.04 + Math.sin(panicT) * 0.05, Math.cos(panicT) * 0.05);
    rig.rightFoot.position.set(0.145, 0.04 - Math.sin(panicT) * 0.05, -Math.cos(panicT) * 0.05);
    rig.headPivot.rotation.set(0.08, Math.sin(panicT * 0.5) * 0.18, 0);
    _animateSecondary(rig, timeSec, 1.8);
    return;
  }

  // State 2: Riding Turtle or UFO Mount (`mount === 'turtle' | 'ufo'`)
  if (player.mount === ITEM_TYPES.TURTLE || player.mount === ITEM_TYPES.UFO) {
    setCharacterExpression(rig, 'happy');
    const isUfo = player.mount === ITEM_TYPES.UFO;
    const baseLift = isUfo ? 0.42 : 0.34;
    const bob = isUfo
      ? Math.sin(timeSec * 5.2) * 0.045
      : player.isMoving
        ? Math.abs(Math.sin(timeSec * 10)) * 0.045
        : Math.sin(timeSec * 3.5) * 0.02;

    rig.actorPivot.position.set(0, baseLift + bob, 0);
    rig.bodyTilt.rotation.set(player.isMoving ? 0.10 : 0, 0, 0);
    rig.leftArm.rotation.set(-0.65, 0.2, 0.25);
    rig.rightArm.rotation.set(-0.65, -0.2, -0.25);
    rig.leftFoot.position.set(-0.15, 0.05, 0.06);
    rig.rightFoot.position.set(0.15, 0.05, 0.06);
    rig.headPivot.rotation.set(-0.06, 0, 0);
    _animateSecondary(rig, timeSec, player.isMoving ? 1.4 : 0.7);
    return;
  }

  // State 3: Normal Alive On-Foot (`idle` vs `walk`, plus carryingBun arm pose!)
  setCharacterExpression(rig, player.carryingBun ? 'happy' : 'normal');

  if (player.isMoving) {
    const strideRate = 11.5;
    const w = timeSec * strideRate;
    const hop = Math.abs(Math.sin(w)) * 0.075;
    rig.actorPivot.position.set(0, hop, 0);
    rig.bodyTilt.rotation.set(0.13, 0, Math.sin(w) * 0.05);

    if (player.carryingBun) {
      // Hold arms happily overhead supporting the giant steamed bun!
      rig.leftArm.rotation.set(-0.15, 0, 2.35);
      rig.rightArm.rotation.set(-0.15, 0, -2.35);
    } else {
      rig.leftArm.rotation.set(Math.sin(w) * 0.68, 0, 0.14);
      rig.rightArm.rotation.set(-Math.sin(w) * 0.68, 0, -0.14);
    }

    rig.leftFoot.position.set(-0.145, Math.max(0, -Math.sin(w) * 0.06), Math.sin(w) * 0.11);
    rig.rightFoot.position.set(0.145, Math.max(0, Math.sin(w) * 0.06), -Math.sin(w) * 0.11);
    rig.headPivot.rotation.set(-0.06, 0, -Math.sin(w) * 0.04);
    _animateSecondary(rig, timeSec, 1.5);
  } else {
    // Peppy idle breathing
    const breath = Math.sin(timeSec * 3.6);
    rig.actorPivot.position.set(0, (breath + 1) * 0.015, 0);
    rig.bodyTilt.rotation.set(0, 0, Math.sin(timeSec * 1.8) * 0.025);

    if (player.carryingBun) {
      rig.leftArm.rotation.set(-0.15, 0, 2.35);
      rig.rightArm.rotation.set(-0.15, 0, -2.35);
    } else {
      rig.leftArm.rotation.set(breath * 0.06, 0, 0.14);
      rig.rightArm.rotation.set(-breath * 0.06, 0, -0.14);
    }

    rig.leftFoot.position.set(-0.145, 0, 0);
    rig.rightFoot.position.set(0.145, 0, 0);
    rig.headPivot.rotation.set(breath * 0.03, Math.sin(timeSec * 1.4) * 0.06, 0);
    _animateSecondary(rig, timeSec, 0.7);
  }
}

function _animateSecondary(rig, timeSec, amp = 1.0) {
  const sp = rig.secondaryParts;
  if (sp.pigtailL && sp.pigtailR) {
    sp.pigtailL.rotation.z = Math.sin(timeSec * 6.5) * 0.14 * amp;
    sp.pigtailR.rotation.z = -Math.sin(timeSec * 6.5) * 0.14 * amp;
  }
  if (sp.antennaL && sp.antennaR) {
    sp.antennaL.rotation.x = Math.sin(timeSec * 9.0) * 0.22 * amp;
    sp.antennaR.rotation.x = Math.cos(timeSec * 9.0) * 0.22 * amp;
  }
  if (sp.cape) {
    sp.cape.rotation.x = 0.12 + Math.abs(Math.sin(timeSec * 7.0)) * 0.22 * amp;
  }
  if (sp.scarfTail) {
    sp.scarfTail.rotation.x = Math.abs(Math.sin(timeSec * 7.5)) * 0.24 * amp;
  }
  if (sp.odangoL && sp.odangoR) {
    sp.odangoL.rotation.x = Math.sin(timeSec * 5.8) * 0.08 * amp;
    sp.odangoR.rotation.x = -Math.sin(timeSec * 5.8) * 0.08 * amp;
  }
}
