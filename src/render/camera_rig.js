/**
 * 4-Viewport Safe-Subrectangle Camera Auto-Framing Solver & Follow-Camera (`src/render/camera_rig.js`)
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Implements:
 *   - Desktop `1280×800` (`aspect = 1.60`) & iPad `1024×768` (`aspect = 1.33`):
 *     Tighter 0.025 margins + 52° pitch so the arena fills >= 90% of the HUD-safe width.
 *   - Ultra-Wide Mobile Landscape `844×390` (`aspect > 1.85`):
 *     Follow-camera centered on P1 showing ~11×9 tiles with soft lerp.
 *   - Mobile Portrait `390×844` (`aspect < 0.85`):
 *     Full-arena framing above the bottom touch control deck.
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
      leftFrac: 0.025,
      rightFrac: 0.025,
      topFrac: 0.105,
      bottomFrac: 0.255,
      pitchDeg: 58,
      fovDeg: 48,
      followCam: false,
    };
  }

  if (aspect > 1.85) {
    // Ultra-Wide Mobile Landscape (e.g. 844x390, aspect = 2.164):
    // Follow-camera centered on P1 showing >= 10 tiles across with soft lerp!
    return {
      leftFrac: 0.15,
      rightFrac: 0.16,
      topFrac: 0.10,
      bottomFrac: 0.03,
      pitchDeg: 56,
      fovDeg: 42,
      followCam: true,
    };
  }

  if (aspect <= 1.44) {
    // iPad / 4:3 Tablet Landscape (e.g. 1024x768, aspect = 1.333):
    // Tighter ~0.025 margins & 52° pitch so the arena fills >= 90% of HUD-safe width!
    return {
      leftFrac: 0.025,
      rightFrac: 0.025,
      topFrac: 0.055,
      bottomFrac: 0.065,
      pitchDeg: 52,
      fovDeg: 40,
      followCam: false,
    };
  }

  // Desktop Landscape (e.g. 1280x800, aspect = 1.60):
  // Tighter ~0.025 margins & 52° pitch so the arena fills >= 90% of HUD-safe width!
  return {
    leftFrac: 0.025,
    rightFrac: 0.025,
    topFrac: 0.045,
    bottomFrac: 0.045,
    pitchDeg: 52,
    fovDeg: 40,
    followCam: false,
  };
}

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(40, 16 / 10, 0.5, 140);
    this.viewportWidth = 1280;
    this.viewportHeight = 800;
    this.screenMode = 'playing';
    this.cameraDistance = 16;
    this.cameraFov = 40;
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    this.basePosition = new THREE.Vector3(0, 16, 12);
    this.shakeSec = 0;
    this.shakeAmp = 0;
    this.shakeMaxSec = 0.22;
    this.lastShakeAmp = 0;
    this.orbitPhase = 0;
    this.followCameraActive = false;
    this.followTargetX = 0;
    this.followTargetZ = 0;
    this._followInitialized = false;
    this._followPitchRad = THREE.MathUtils.degToRad(52);
    this._followPanOffsetX = 0;
    this._followPanOffsetZ = 0;
    this.arenaScreenBounds = {
      minX: 0,
      maxX: 1280,
      minY: 0,
      maxY: 800,
    };
    this.arenaFillRatioW = 0.95;
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
   * Resets follow-camera target immediately (e.g. on new match start for determinism).
   * @param {number} worldX
   * @param {number} worldZ
   */
  resetFollowTarget(worldX = 0, worldZ = 0) {
    this.followTargetX = Math.max(-4.8, Math.min(4.8, Number(worldX) || 0));
    this.followTargetZ = Math.max(-3.8, Math.min(3.8, Number(worldZ) || 0));
    this._followInitialized = false;
    if (this.followCameraActive) {
      this._applyFollowPose();
    }
  }

  /**
   * Updates follow-camera target with soft lerp toward P1 world coordinates on ultra-wide (aspect > 1.85).
   * @param {number} worldX
   * @param {number} worldZ
   * @param {number} dtSec
   * @param {boolean} [immediate]
   */
  updateFollowTarget(worldX, worldZ, dtSec = 1 / 60, immediate = false) {
    const clampedX = Math.max(-4.8, Math.min(4.8, Number(worldX) || 0));
    const clampedZ = Math.max(-3.8, Math.min(3.8, Number(worldZ) || 0));

    if (immediate || !this._followInitialized) {
      this.followTargetX = clampedX;
      this.followTargetZ = clampedZ;
      this._followInitialized = true;
    } else {
      const alpha = Math.min(1.0, Math.max(0.04, (Number(dtSec) || 1 / 60) * 7.5));
      this.followTargetX += (clampedX - this.followTargetX) * alpha;
      this.followTargetZ += (clampedZ - this.followTargetZ) * alpha;
    }

    if (this.followCameraActive) {
      this._applyFollowPose();
    }
  }

  _applyFollowPose() {
    const panX = this.followTargetX + this._followPanOffsetX;
    const panZ = this.followTargetZ + this._followPanOffsetZ;
    this._applyPitchPose(this._followPitchRad, this.cameraDistance, panX, panZ);
    this._computeProjectedBounds();
  }

  /**
   * Triggers a tactile camera impulse (0.25 on own/nearby blast, 0.40 on chain/boss slam for 0.22s).
   * @param {number} amplitude
   * @param {number} durationSec
   */
  triggerImpulse(amplitude = 0.25, durationSec = 0.22) {
    this.shakeAmp = Math.max(this.shakeAmp, amplitude);
    this.lastShakeAmp = this.shakeAmp;
    this.shakeMaxSec = Math.max(0.05, durationSec);
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
    this.followCameraActive = false;

    if (this.screenMode === 'podium') {
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

    // Active Match ('playing' | 'paused')
    const spec = computeSafeSubrectangle(w, h);
    const fovDeg = spec.fovDeg;
    const pitchRad = THREE.MathUtils.degToRad(spec.pitchDeg);
    const sinP = Math.sin(pitchRad);

    const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg * 0.5));
    const tanH = tanV * aspect;

    const usableW = Math.max(0.25, 1.0 - spec.leftFrac - spec.rightFrac);
    const usableH = Math.max(0.25, 1.0 - spec.topFrac - spec.bottomFrac);

    this.camera.fov = fovDeg;
    this.cameraFov = fovDeg;
    this.camera.updateProjectionMatrix();

    if (spec.followCam) {
      // Ultra-wide follow-camera (aspect > 1.85, e.g. 844x390) showing >= 10 tiles across centered on P1!
      this.followCameraActive = true;
      this._followPitchRad = pitchRad;
      const visibleDepthTiles = 11.2;
      const distance = (visibleDepthTiles * 0.5 * sinP) / tanV;
      this.cameraDistance = +distance.toFixed(3);

      // Keep P1 horizontally centered on the viewport
      this._followPanOffsetX = 0;
      this._followPanOffsetZ = 0;
      this._applyFollowPose();
      return;
    }

    const worldWidth = ARENA_HALF_W * 2.0;
    const cosP = Math.cos(pitchRad);
    const projectedDepth = ARENA_HALF_D * 2.0 * sinP + ARENA_MAX_Y * cosP;

    const distW = (worldWidth * 0.5) / (tanH * usableW);
    const distH = (projectedDepth * 0.5) / (tanV * usableH);

    // On desktop & tablet landscape (0.85 <= aspect <= 1.85), fit horizontal width so arena fills >= 90% of HUD-safe width!
    const isDesktopOrTabletLandscape = aspect >= 0.85 && aspect <= 1.85;
    let distance = isDesktopOrTabletLandscape ? distW * 1.01 : Math.max(distW, distH) * 1.04;

    const targetScreenX = spec.leftFrac + usableW * 0.5;
    const targetScreenY = spec.topFrac + usableH * 0.5;

    let panX = -(targetScreenX - 0.5) * (2.0 * distance * tanH);
    let panZ = -(targetScreenY - 0.5) * ((2.0 * distance * tanV) / sinP);

    for (let iter = 0; iter < 3; iter += 1) {
      this._applyPitchPose(pitchRad, distance, panX, panZ);
      const ndc = this._measureNdcExtents();

      const minSX = (ndc.minX + 1) * 0.5;
      const maxSX = (ndc.maxX + 1) * 0.5;
      const minSY = (1 - ndc.maxY) * 0.5;
      const maxSY = (1 - ndc.minY) * 0.5;

      const spanSX = Math.max(0.01, maxSX - minSX);
      const spanSY = Math.max(0.01, maxSY - minSY);

      if (isDesktopOrTabletLandscape) {
        // Converge horizontal span to 96.5% of usableW (>= 91.5% of full viewport width!)
        const targetSpanW = usableW * 0.965;
        distance *= spanSX / targetSpanW;
      } else {
        const scaleNeeded = Math.max(spanSX / usableW, spanSY / usableH);
        if (scaleNeeded > 0.995) {
          distance *= scaleNeeded * 1.015;
        }
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
    const spec = computeSafeSubrectangle(w, h);
    const usableW = Math.max(0.25, 1.0 - spec.leftFrac - spec.rightFrac);
    const minX = Math.round(((ndc.minX + 1) * 0.5) * w);
    const maxX = Math.round(((ndc.maxX + 1) * 0.5) * w);
    this.arenaScreenBounds = {
      minX,
      maxX,
      minY: Math.round(((1 - ndc.maxY) * 0.5) * h),
      maxY: Math.round(((1 - ndc.minY) * 0.5) * h),
    };
    this.arenaFillRatioW = +Math.min(1.5, (maxX - minX) / Math.max(1, w * usableW)).toFixed(4);

    // Measure exact visible tile width & height at lookTarget depth
    const tx = this.lookTarget.x;
    const tz = this.lookTarget.z;
    const xLeft = ((this._tmpVec.set(tx - 0.5, 0.22, tz).project(this.camera).x + 1) * 0.5) * w;
    const xRight = ((this._tmpVec.set(tx + 0.5, 0.22, tz).project(this.camera).x + 1) * 0.5) * w;
    const yTop = ((1 - this._tmpVec.set(tx, 0.22, tz - 0.5).project(this.camera).y) * 0.5) * h;
    const yBot = ((1 - this._tmpVec.set(tx, 0.22, tz + 0.5).project(this.camera).y) * 0.5) * h;
    const tilePxW = Math.max(1, Math.abs(xRight - xLeft));
    const tilePxH = Math.max(1, Math.abs(yBot - yTop));
    const usableH = Math.max(0.25, 1.0 - spec.topFrac - spec.bottomFrac);
    this.visibleTileWidth = +((w * usableW) / tilePxW).toFixed(2);
    this.visibleTileWidthFull = +(w / tilePxW).toFixed(2);
    this.visibleTileHeight = +((h * usableH) / tilePxH).toFixed(2);
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
      const t = this.orbitPhase * 52;
      const mag = this.shakeAmp * (this.shakeSec / Math.max(0.05, this.shakeMaxSec));
      this.camera.position.set(
        this.basePosition.x + Math.sin(t) * mag,
        this.basePosition.y + Math.cos(t * 1.3) * mag * 0.5,
        this.basePosition.z + Math.cos(t * 0.9) * mag
      );
      this.camera.lookAt(this.lookTarget);
      if (this.shakeSec <= 0) {
        this.shakeAmp = 0;
      }
    } else {
      this.camera.position.copy(this.basePosition);
    }
  }
}
