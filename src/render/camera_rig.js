/**
 * 4-Viewport Safe-Subrectangle Camera Auto-Framing Solver (`src/render/camera_rig.js`)
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Implements `architecture.md §6.1` so the entire `15×13` interior tile grid plus
 * `1`-tile perimeter border (`worldWidth = 17.6`, `worldDepth = 15.6`, `height = 2.8`)
 * projects strictly inside the HUD-free safe sub-rectangle across:
 *   - Desktop `1280×800` (`aspect = 1.60`)
 *   - iPad `1024×768` (`aspect = 1.33`)
 *   - Mobile Landscape `844×390` (`aspect = 2.16` — left/right side gutters!)
 *   - Mobile Portrait `390×844` (`aspect = 0.46` — bottom touch control deck!)
 *
 * Also provides dedicated framing for `'title'`, `'select'` (hero + arena turntable),
 * and `'podium'` (stepped 1st/2nd/3rd Victory Podium).
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from '../contracts/constants.js';

// Full playable 15x13 arena + 1-tile perimeter walls span [-8.75..+8.75] x [-7.75..+7.75]
const ARENA_HALF_W = (GRID_COLS * 0.5 + 1.25) * TILE_SIZE; // 8.75
const ARENA_HALF_D = (GRID_ROWS * 0.5 + 1.25) * TILE_SIZE; // 7.75
const ARENA_MAX_Y = 2.75;

const BOUND_CORNERS = [
  new THREE.Vector3(-ARENA_HALF_W, 0, -ARENA_HALF_D),
  new THREE.Vector3(ARENA_HALF_W, 0, -ARENA_HALF_D),
  new THREE.Vector3(-ARENA_HALF_W, 0, ARENA_HALF_D),
  new THREE.Vector3(ARENA_HALF_W, 0, ARENA_HALF_D),
  new THREE.Vector3(-ARENA_HALF_W, ARENA_MAX_Y, -ARENA_HALF_D),
  new THREE.Vector3(ARENA_HALF_W, ARENA_MAX_Y, -ARENA_HALF_D),
  new THREE.Vector3(-ARENA_HALF_W, 1.8, ARENA_HALF_D),
  new THREE.Vector3(ARENA_HALF_W, 1.8, ARENA_HALF_D),
];

/**
 * Computes the HUD-free safe viewport sub-rectangle `[leftFrac, rightFrac, topFrac, bottomFrac]`
 * and baseline camera pitch/FOV for any viewport dimensions `(width, height)`.
 *
 * @param {number} width
 * @param {number} height
 */
export function computeSafeSubrectangle(width, height) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const aspect = w / h;

  if (aspect < 0.85) {
    // Mobile Portrait (e.g. 390x844, aspect = 0.462):
    // Top status strip (~10% = 84px) + Bottom touch joystick/action deck (~25% = 211px)
    return {
      leftFrac: 0.03,
      rightFrac: 0.03,
      topFrac: 0.105,
      bottomFrac: 0.255,
      pitchDeg: 60,
      fovDeg: 48,
    };
  }

  if (aspect > 1.88) {
    // Ultra-Wide Mobile Landscape (e.g. 844x390, aspect = 2.164):
    // Left Virtual Joystick gutter (18.5% = 156px) & Right Bubble/Item gutter (21.5% = 181px)
    return {
      leftFrac: 0.185,
      rightFrac: 0.215,
      topFrac: 0.135,
      bottomFrac: 0.055,
      pitchDeg: 56,
      fovDeg: 38,
    };
  }

  if (aspect <= 1.44) {
    // iPad / 4:3 Tablet Landscape (e.g. 1024x768, aspect = 1.333):
    // Reserves generous bottom/corner margins so arena rim has 0px overlap with HUD joystick/buttons
    return {
      leftFrac: 0.08,
      rightFrac: 0.08,
      topFrac: 0.105,
      bottomFrac: 0.198,
      pitchDeg: 56,
      fovDeg: 40,
    };
  }

  // Desktop Landscape (e.g. 1280x800, aspect = 1.60):
  return {
    leftFrac: 0.068,
    rightFrac: 0.068,
    topFrac: 0.10,
    bottomFrac: 0.122,
    pitchDeg: 55,
    fovDeg: 38,
  };
}

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(38, 16 / 10, 0.5, 140);
    this.viewportWidth = 1280;
    this.viewportHeight = 800;
    this.screenMode = 'playing';
    this.cameraDistance = 24;
    this.cameraFov = 38;
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    this.basePosition = new THREE.Vector3(0, 20, 14);
    this.shakeSec = 0;
    this.shakeAmp = 0;
    this.orbitPhase = 0;
    this.arenaScreenBounds = {
      minX: 0,
      maxX: 1280,
      minY: 0,
      maxY: 800,
    };
    this._tmpVec = new THREE.Vector3();
    this.updateFraming();
  }

  /**
   * Updates viewport dimensions and recomputes frustum framing.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.viewportWidth = Math.max(1, Math.round(Number(width) || 1280));
    this.viewportHeight = Math.max(1, Math.round(Number(height) || 800));
    this.updateFraming();
  }

  /**
   * Switches camera framing preset ('title' | 'select' | 'playing' | 'paused' | 'podium').
   * @param {string} mode
   */
  setScreenMode(mode) {
    const next = mode || 'playing';
    if (this.screenMode !== next) {
      this.screenMode = next;
      this.updateFraming();
    }
  }

  /**
   * Triggers a brief subtle tactile camera impulse (on chain blasts or boss slams).
   * @param {number} amplitude
   * @param {number} durationSec
   */
  triggerImpulse(amplitude = 0.14, durationSec = 0.18) {
    this.shakeAmp = Math.max(this.shakeAmp, amplitude);
    this.shakeSec = Math.max(this.shakeSec, durationSec);
  }

  /**
   * Solves camera FOV, distance, and look-at offset for the active screenMode and viewport.
   */
  updateFraming() {
    const w = this.viewportWidth;
    const h = this.viewportHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.clearViewOffset();

    if (this.screenMode === 'podium') {
      // Celebratory 3D Victory Podium framing (keeps all 4 pedestals unclipped even on 390x844 portrait)
      const isPortrait = aspect < 0.85;
      const fov = isPortrait ? 46 : 36;
      const dist = isPortrait ? 18.2 : Math.max(9.6, 11.4 / Math.min(aspect, 1.6));
      this.camera.fov = fov;
      this.cameraFov = fov;
      this.cameraDistance = +dist.toFixed(3);
      this.lookTarget.set(0, isPortrait ? 1.15 : 1.25, 0);
      this.basePosition.set(0, isPortrait ? 3.8 : 3.25, dist);
      this.camera.position.copy(this.basePosition);
      this.camera.lookAt(this.lookTarget);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);
      this._computeProjectedBounds();
      return;
    }

    if (this.screenMode === 'select') {
      // Hero + Live Arena 3D Diorama Backdrop around Select Modal
      const isPortrait = aspect < 0.85;
      const fov = isPortrait ? 46 : 38;
      const dist = isPortrait ? 17.5 : 14.6;
      this.camera.fov = fov;
      this.cameraFov = fov;
      this.cameraDistance = +dist.toFixed(3);
      this.lookTarget.set(0, 0.35, 0.15);
      this.basePosition.set(0, isPortrait ? 10.2 : 8.6, dist * 0.86);
      this.camera.position.copy(this.basePosition);
      this.camera.lookAt(this.lookTarget);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);
      this._computeProjectedBounds();
      return;
    }

    if (this.screenMode === 'title') {
      // Inviting toy-diorama hero angle over Candy Town showcase
      const isPortrait = aspect < 0.85;
      const fov = isPortrait ? 46 : 38;
      const dist = isPortrait ? 15.5 : 12.2;
      this.camera.fov = fov;
      this.cameraFov = fov;
      this.cameraDistance = +dist.toFixed(3);
      this.lookTarget.set(0, 0.55, 0.3);
      this.basePosition.set(0, isPortrait ? 8.2 : 6.6, dist * 0.84);
      this.camera.position.copy(this.basePosition);
      this.camera.lookAt(this.lookTarget);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);
      this._computeProjectedBounds();
      return;
    }

    // Active Match ('playing' | 'paused'): Exact Safe-Subrectangle Auto-Framing Solver (§6.1)
    const spec = computeSafeSubrectangle(w, h);
    const fovDeg = spec.fovDeg;
    const pitchRad = THREE.MathUtils.degToRad(spec.pitchDeg);
    const sinP = Math.sin(pitchRad);
    const cosP = Math.cos(pitchRad);

    const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg * 0.5));
    const tanH = tanV * aspect;

    const usableW = Math.max(0.25, 1.0 - spec.leftFrac - spec.rightFrac);
    const usableH = Math.max(0.25, 1.0 - spec.topFrac - spec.bottomFrac);

    const worldWidth = ARENA_HALF_W * 2.0;
    const projectedDepth = ARENA_HALF_D * 2.0 * sinP + ARENA_MAX_Y * cosP;

    const distW = (worldWidth * 0.5) / (tanH * usableW);
    const distH = (projectedDepth * 0.5) / (tanV * usableH);
    let distance = Math.max(distW, distH) * 1.06;

    // Target subrectangle center in normalized screen coords (0..1 left-to-right, 0..1 top-to-bottom)
    const targetScreenX = spec.leftFrac + usableW * 0.5;
    const targetScreenY = spec.topFrac + usableH * 0.5;

    // Convert desired screen center offset into world-space camera+target pan
    // Screen right = +X; Screen down = +Z / sin(pitch) along the y=0 ground plane
    let panX = -(targetScreenX - 0.5) * (2.0 * distance * tanH);
    let panZ = -(targetScreenY - 0.5) * ((2.0 * distance * tanV) / sinP);

    this.camera.fov = fovDeg;
    this.cameraFov = fovDeg;
    this.camera.updateProjectionMatrix();

    // Closed-loop 8-corner projection refinement (2 micro-iterations) so perspective
    // foreshortening on the tilted 15x13 slab never clips a single perimeter wall pixel!
    for (let iter = 0; iter < 3; iter += 1) {
      this._applyPitchPose(pitchRad, distance, panX, panZ);
      const ndc = this._measureNdcExtents();

      // Convert NDC [-1..1] to screen fraction [0..1] (0=left/top, 1=right/bottom)
      const minSX = (ndc.minX + 1) * 0.5;
      const maxSX = (ndc.maxX + 1) * 0.5;
      const minSY = (1 - ndc.maxY) * 0.5;
      const maxSY = (1 - ndc.minY) * 0.5;

      const spanSX = Math.max(0.01, maxSX - minSX);
      const spanSY = Math.max(0.01, maxSY - minSY);
      const scaleNeeded = Math.max(spanSX / usableW, spanSY / usableH);

      if (scaleNeeded > 0.995) {
        distance *= scaleNeeded * 1.015;
      }

      const curCenterSX = (minSX + maxSX) * 0.5;
      const curCenterSY = (minSY + maxSY) * 0.5;
      panX += (curCenterSX - targetScreenX) * (2.0 * distance * tanH);
      panZ += (curCenterSY - targetScreenY) * ((2.0 * distance * tanV) / sinP);
    }

    this._applyPitchPose(pitchRad, distance, panX, panZ);
    this.cameraDistance = +distance.toFixed(3);
    this._computeProjectedBounds();
  }

  _applyPitchPose(pitchRad, distance, panX, panZ) {
    const sinP = Math.sin(pitchRad);
    const cosP = Math.cos(pitchRad);
    this.lookTarget.set(panX, 0.22, panZ);
    this.basePosition.set(
      panX,
      0.22 + distance * sinP,
      panZ + distance * cosP
    );
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld(true);
  }

  _measureNdcExtents() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < BOUND_CORNERS.length; i += 1) {
      this._tmpVec.copy(BOUND_CORNERS[i]).project(this.camera);
      if (this._tmpVec.x < minX) minX = this._tmpVec.x;
      if (this._tmpVec.x > maxX) maxX = this._tmpVec.x;
      if (this._tmpVec.y < minY) minY = this._tmpVec.y;
      if (this._tmpVec.y > maxY) maxY = this._tmpVec.y;
    }
    return { minX, maxX, minY, maxY };
  }

  _computeProjectedBounds() {
    const ndc = this._measureNdcExtents();
    const w = this.viewportWidth;
    const h = this.viewportHeight;
    this.arenaScreenBounds = {
      minX: Math.round(((ndc.minX + 1) * 0.5) * w),
      maxX: Math.round(((ndc.maxX + 1) * 0.5) * w),
      minY: Math.round(((1 - ndc.maxY) * 0.5) * h),
      maxY: Math.round(((1 - ndc.minY) * 0.5) * h),
    };
  }

  /**
   * Advances subtle camera breathing (in title/select) or decay of impact shake.
   * @param {number} dtSec
   */
  update(dtSec) {
    const dt = Math.max(0, Math.min(dtSec || 0, 0.1));
    this.orbitPhase += dt;

    if (this.screenMode === 'title') {
      const swayX = Math.sin(this.orbitPhase * 0.45) * 0.85;
      const swayY = Math.sin(this.orbitPhase * 0.9) * 0.16;
      this.camera.position.set(
        this.basePosition.x + swayX,
        this.basePosition.y + swayY,
        this.basePosition.z
      );
      this.camera.lookAt(this.lookTarget);
      return;
    }

    if (this.shakeSec > 0) {
      this.shakeSec = Math.max(0, this.shakeSec - dt);
      const t = this.orbitPhase * 46;
      const mag = this.shakeAmp * (this.shakeSec / 0.18);
      this.camera.position.set(
        this.basePosition.x + Math.sin(t) * mag,
        this.basePosition.y + Math.cos(t * 1.3) * mag * 0.5,
        this.basePosition.z + Math.cos(t * 0.9) * mag
      );
      this.camera.lookAt(this.lookTarget);
    } else {
      this.camera.position.copy(this.basePosition);
    }
  }
}
