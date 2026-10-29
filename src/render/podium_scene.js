/**
 * Celebratory 3D Victory Podium Diorama (`src/render/podium_scene.js`)
 * featuring stepped `1st / 2nd / 3rd` (+ `4th`) candy pedestals with crown/medal
 * emblems, the match's actual ranked 3D characters performing `celebrate` animations,
 * a pastel rainbow celebration arch, and continuous 3D spinning candy confetti!
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { CHARACTER_IDS } from '../contracts/constants.js';
import {
  createCandyMaterial,
  createMetallicMaterial,
  getOrCreateCanvasTexture,
} from './materials.js';
import { createCharacterRig, updateCharacterRig } from './character_meshes.js';

function createRankBadgeTexture(rankText, bgHex, textHex) {
  return getOrCreateCanvasTexture(`podium_badge:${rankText}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = bgHex;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = textHex;
    ctx.font = '900 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankText, w * 0.5, h * 0.54);
  });
}

function buildPedestalColumn(rank, height, bodyColor, trimColor, badgeBg, badgeFg) {
  const g = new THREE.Group();

  const bodyMat = createCandyMaterial(bodyColor, { roughness: 0.18, clearcoat: 0.9 });
  const trimMat = createCandyMaterial(trimColor, { roughness: 0.2, clearcoat: 0.85 });

  // Frosted fluted candy cylinder + top & bottom wafer caps
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.72, height, 24), bodyMat);
  col.position.y = height * 0.5;
  col.castShadow = true;
  col.receiveShadow = true;
  g.add(col);

  const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.70, 0.12, 24), trimMat);
  topCap.position.y = height + 0.04;
  topCap.receiveShadow = true;
  g.add(topCap);

  const baseCap = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.10, 24), trimMat);
  baseCap.position.y = 0.05;
  baseCap.receiveShadow = true;
  g.add(baseCap);

  // Embossed front rank medallion (`1`, `2`, `3`)
  const badgeTex = createRankBadgeTexture(String(rank), badgeBg, badgeFg);
  const medallion = new THREE.Mesh(
    new THREE.CircleGeometry(0.30, 24),
    new THREE.MeshBasicMaterial({ map: badgeTex, transparent: false })
  );
  medallion.position.set(0, height * 0.54, 0.72);
  g.add(medallion);

  if (rank === 1) {
    // Extra 3D Golden Crown Rim atop 1st Place!
    const goldMat = createMetallicMaterial(0xfbbf24, { roughness: 0.18, metalness: 0.88 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.04, 10, 28), goldMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = height + 0.08;
    g.add(ring);
  }

  return g;
}

export class PodiumSceneManager {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;

    this.actorsGroup = new THREE.Group();
    this.confettiGroup = new THREE.Group();
    this.actorRigs = [];
    this.currentSignature = '';
    this.confettiItems = [];

    this._buildStaticStage();
    this._initConfetti(96);
    this.root.add(this.actorsGroup, this.confettiGroup);
  }

  _buildStaticStage() {
    // Festive Pastel Candy Stage Platter
    const floorBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(54, 42),
      createCandyMaterial(0xffe4ef, { roughness: 0.35, clearcoat: 0.3 })
    );
    floorBackdrop.rotation.x = -Math.PI * 0.5;
    floorBackdrop.position.y = -0.08;
    floorBackdrop.receiveShadow = true;
    this.root.add(floorBackdrop);

    const stageDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(4.8, 5.1, 0.22, 40),
      createCandyMaterial(0xfff5f8, { roughness: 0.2, clearcoat: 0.8 })
    );
    stageDisc.position.y = -0.04;
    stageDisc.receiveShadow = true;
    this.root.add(stageDisc);

    const stageRim = new THREE.Mesh(
      new THREE.TorusGeometry(4.92, 0.12, 12, 48),
      createCandyMaterial(0xf472b6, { roughness: 0.18, clearcoat: 0.9 })
    );
    stageRim.rotation.x = Math.PI * 0.5;
    stageRim.position.y = 0.04;
    this.root.add(stageRim);

    // Rainbow Candy Arch Backdrop behind the pedestals
    const archColors = [0xff5e99, 0xfbbf24, 0x38bdf8];
    for (let i = 0; i < archColors.length; i += 1) {
      const r = 3.9 - i * 0.24;
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.11, 12, 40, Math.PI),
        createCandyMaterial(archColors[i], {
          roughness: 0.16,
          clearcoat: 0.9,
          emissive: archColors[i],
          emissiveIntensity: 0.14,
        })
      );
      arch.position.set(0, 0.1, -2.0);
      this.root.add(arch);
    }

    // Stepped 1st (Center Gold), 2nd (Left Silver-Sky), 3rd (Right Rose-Bronze), 4th Pedestals
    this.pedestalSlots = [
      { rank: 1, x: 0.0, z: 0.15, topY: 1.30, yaw: 0.0 },
      { rank: 2, x: -1.68, z: -0.15, topY: 0.94, yaw: 0.22 },
      { rank: 3, x: 1.68, z: -0.15, topY: 0.68, yaw: -0.22 },
      { rank: 4, x: 2.75, z: -0.55, topY: 0.22, yaw: -0.32 },
    ];

    const p1 = buildPedestalColumn(1, 1.24, 0xfacc15, 0xfffbeb, '#F59E0B', '#FFFFFF');
    p1.position.set(0.0, 0, 0.15);

    const p2 = buildPedestalColumn(2, 0.88, 0x7dd3fc, 0xf8fafc, '#0284C7', '#FFFFFF');
    p2.position.set(-1.68, 0, -0.15);

    const p3 = buildPedestalColumn(3, 0.62, 0xfb923c, 0xfff7ed, '#EA580C', '#FFFFFF');
    p3.position.set(1.68, 0, -0.15);

    const p4 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.60, 0.22, 20),
      createCandyMaterial(0xfbcfe8, { clearcoat: 0.75 })
    );
    p4.position.set(2.75, 0.11, -0.55);
    p4.receiveShadow = true;

    this.root.add(p1, p2, p3, p4);
  }

  _initConfetti(count) {
    const geoRibbon = new THREE.BoxGeometry(0.14, 0.03, 0.24);
    const geoCube = new THREE.OctahedronGeometry(0.085, 0);
    const palette = [0xff4d8d, 0xfacc15, 0x38bdf8, 0x4ade80, 0xa855f7, 0xf97316];
    const mats = palette.map((c) =>
      createCandyMaterial(c, {
        roughness: 0.15,
        clearcoat: 0.95,
        emissive: c,
        emissiveIntensity: 0.25,
      })
    );

    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(
        i % 3 === 0 ? geoCube : geoRibbon,
        mats[i % mats.length]
      );
      // Deterministic initial layout keeping the central character face corridor unobstructed
      const px = ((i * 73) % 100) / 100 * 9.0 - 4.5;
      const py = 0.6 + (((i * 41) % 100) / 100) * 4.4;
      let pz = ((i * 29) % 100) / 100 * 4.2 - 2.2;
      if (Math.abs(px) < 3.25 && pz > -0.65) {
        pz = -0.85 - (i % 5) * 0.35;
      }
      mesh.position.set(px, py, pz);
      mesh.rotation.set(i * 0.7, i * 1.1, i * 0.5);
      this.confettiGroup.add(mesh);

      this.confettiItems.push({
        mesh,
        baseX: px,
        fallSpeed: 1.05 + (i % 5) * 0.28,
        swayAmp: 0.22 + (i % 4) * 0.08,
        swayFreq: 2.0 + (i % 3) * 0.7,
        spinX: 3.2 + (i % 4),
        spinY: 4.1 + (i % 3),
        phase: i * 0.63,
      });
    }
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
  }

  /**
   * Syncs ranked 3D characters onto the stepped pedestals and steps 60fps celebration + confetti.
   * @param {Array} rankings
   * @param {number} timeSec
   * @param {number} dtSec
   */
  update(rankings, timeSec = 0, dtSec = 1 / 60) {
    const safeRankings =
      Array.isArray(rankings) && rankings.length > 0
        ? rankings
        : CHARACTER_IDS.map((cid, idx) => ({
            rank: idx + 1,
            playerId: idx === 0 ? 'p1' : `bot${idx}`,
            characterId: cid,
            team: idx < 2 ? 0 : 1,
            isWinner: idx < 2,
          }));

    const sig = safeRankings
      .slice(0, 4)
      .map((r) => `${r.rank}:${r.characterId}:${r.team}:${r.isWinner ? 1 : 0}`)
      .join('|');

    if (sig !== this.currentSignature) {
      while (this.actorsGroup.children.length > 0) {
        const old = this.actorsGroup.children[0];
        this.actorsGroup.remove(old);
        old.traverse((node) => {
          if (node.geometry && !node.geometry.userData?.shared) {
            node.geometry.dispose();
          }
          if (node.material) {
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            for (const m of mats) {
              if (m && !m.userData?.shared) m.dispose();
            }
          }
        });
      }
      this.actorRigs = [];

      for (let i = 0; i < Math.min(4, safeRankings.length); i += 1) {
        const entry = safeRankings[i];
        const slot = this.pedestalSlots[i];
        const rig = createCharacterRig(entry.characterId, {
          team: entry.team,
          isPrimaryHuman: entry.playerId === 'p1',
        });
        rig.root.position.set(slot.x, slot.topY, slot.z);
        rig.actorPivot.rotation.y = slot.yaw;
        this.actorsGroup.add(rig.root);
        this.actorRigs.push({
          rig,
          entry,
          slot,
          mode: i < 3 || entry.isWinner ? 'celebrate' : 'polite_clap',
          phaseOffset: i * 1.15,
        });
      }
      this.currentSignature = sig;
    }

    for (let i = 0; i < this.actorRigs.length; i += 1) {
      const item = this.actorRigs[i];
      updateCharacterRig(item.rig, null, timeSec, dtSec, {
        mode: item.mode,
        phaseOffset: item.phaseOffset,
      });
    }

    const dt = Math.max(0, Math.min(dtSec || 1 / 60, 0.1));
    for (let i = 0; i < this.confettiItems.length; i += 1) {
      const c = this.confettiItems[i];
      c.mesh.position.y -= c.fallSpeed * dt;
      if (c.mesh.position.y < 0.08) {
        c.mesh.position.y = 4.9;
      }
      c.mesh.position.x =
        c.baseX + Math.sin(timeSec * c.swayFreq + c.phase) * c.swayAmp;
      c.mesh.rotation.x += c.spinX * dt;
      c.mesh.rotation.y += c.spinY * dt;
    }
  }
}
