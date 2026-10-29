/**
 * Master 3D Diorama Coordinator (`src/render/renderer.js`) for
 * QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Pure visual projection of `SimSnapshot` + `uiState` onto Three.js WebGL2:
 *   - Studio Candy Lighting (`SRGBColorSpace`, `ACESFilmicToneMapping`, `PCFSoftShadowMap`,
 *     procedural `PMREMGenerator` Candy Studio Lightbox `scene.environment`)
 *   - 4-Viewport Safe-Subrectangle Camera Auto-Framing (`CameraRig`)
 *   - 4 Iconic Themed 3D Arenas (`ArenaStageManager`)
 *   - 4 Articulated Chibi 3D Heroes with Opaque 512x512 Faces (`character_meshes.js`)
 *   - Glossy Transmissive Sugar Bubbles, Crystal Water-Trap Shells, 4-Way Jets,
 *     8 Pickups, Rideable Turtle & UFO Mounts, Shields & Steamed Buns (`EntityVisualManager`)
 *   - 2x2 Articulated Mechanical Golem Boss & Floor Hazard Decals (`BossVisualManager`)
 *   - Stepped 1st/2nd/3rd Victory Podium & 3D Candy Confetti (`PodiumSceneManager`)
 *
 * 100% relative ES module imports — zero bare specifiers.
 */

import * as THREE from '../../vendor/three.module.min.js';
import {
  CHARACTER_IDS,
  EVENT_TYPES,
  GRID_COLS,
  GRID_ROWS,
  SCREEN_IDS,
  TILE_TYPE,
  tileToWorldX,
  tileToWorldZ,
} from '../contracts/constants.js';
import {
  configureRendererPipeline,
  createCandyMaterial,
  createCandyStudioEnvMap,
  createMetallicMaterial,
  getArenaThemeLighting,
} from './materials.js';
import { CameraRig } from './camera_rig.js';
import { ArenaStageManager } from './arena_meshes.js';
import { createCharacterRig, updateCharacterRig } from './character_meshes.js';
import {
  EntityVisualManager,
  createTurtleMountMesh,
  createUfoMountMesh,
} from './entity_meshes.js';
import { BossVisualManager } from './boss_meshes.js';
import { PodiumSceneManager } from './podium_scene.js';

function normalizeScreenMode(rawMode) {
  if (rawMode === 'select_preview' || rawMode === SCREEN_IDS.SELECT) return SCREEN_IDS.SELECT;
  if (rawMode === SCREEN_IDS.TITLE) return SCREEN_IDS.TITLE;
  if (rawMode === SCREEN_IDS.PODIUM) return SCREEN_IDS.PODIUM;
  if (rawMode === SCREEN_IDS.PAUSED) return SCREEN_IDS.PAUSED;
  return SCREEN_IDS.PLAYING;
}

function buildShowcaseGridFromSnapshot(simSnapshot) {
  const base = [];
  for (let r = 0; r < GRID_ROWS; r += 1) {
    const srcRow = simSnapshot?.grid?.[r];
    base.push(Array.isArray(srcRow) ? srcRow.slice() : new Array(GRID_COLS).fill(TILE_TYPE.EMPTY));
  }
  // Clear a clean central showcase plaza (cols 4..10, rows 4..8) so Title & Select 3D heroes shine!
  for (let r = 4; r <= 8; r += 1) {
    for (let c = 4; c <= 10; c += 1) {
      if (base[r][c] === TILE_TYPE.HARD_WALL || base[r][c] === TILE_TYPE.SOFT_BLOCK) {
        base[r][c] = TILE_TYPE.EMPTY;
      }
    }
  }
  return base;
}

function disposeRigNodeWithoutTextures(rootObj) {
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

export class Renderer3D {
  /**
   * @param {HTMLCanvasElement} canvasElement
   */
  constructor(canvasElement) {
    if (!canvasElement) {
      throw new Error('Renderer3D requires a valid <canvas> element.');
    }
    this.canvas = canvasElement;

    this.webgl = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    configureRendererPipeline(this.webgl);

    this.isWebGL2 = Boolean(this.webgl.capabilities?.isWebGL2);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffeaf2);
    this.scene.fog = new THREE.FogExp2(0xfff0f6, 0.011);
    this.scene.environment = createCandyStudioEnvMap(this.webgl);

    // Studio Candy Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0xfff7ed, 0xf9a8d4, 0.95);
    this.hemiLight.position.set(0, 22, 0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffaf0, 1.72);
    this.dirLight.position.set(8.5, 19.5, 11.5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(512, 512);
    this.dirLight.shadow.camera.near = 2.0;
    this.dirLight.shadow.camera.far = 42.0;
    this.dirLight.shadow.camera.left = -10.5;
    this.dirLight.shadow.camera.right = 10.5;
    this.dirLight.shadow.camera.top = 10.0;
    this.dirLight.shadow.camera.bottom = -10.0;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0x67e8f9, 0.55);
    this.rimLight.position.set(-10, 9, -8);
    this.scene.add(this.rimLight);

    // Camera Rig
    this.cameraRig = new CameraRig();

    // Scene Graph Containers
    this.matchWorldGroup = new THREE.Group();
    this.actorsGroup = new THREE.Group();
    this.showcaseGroup = new THREE.Group();

    this.scene.add(this.matchWorldGroup);
    this.matchWorldGroup.add(this.actorsGroup);
    this.scene.add(this.showcaseGroup);

    this.arenaManager = new ArenaStageManager(this.matchWorldGroup);
    this.entityManager = new EntityVisualManager(this.matchWorldGroup);
    this.bossManager = new BossVisualManager(this.matchWorldGroup);
    this.podiumManager = new PodiumSceneManager();
    this.scene.add(this.podiumManager.root);

    this.characterRigsById = new Map();
    this.screenMode = SCREEN_IDS.TITLE;
    this.activeThemeArenaId = '';
    this.elapsedSec = 0;
    this.lastSnapshotData = null;
    this._lastMatchTick = -1;

    this._initShowcaseActors();

    const initW =
      (typeof window !== 'undefined' && window.innerWidth) ||
      canvasElement.clientWidth ||
      1280;
    const initH =
      (typeof window !== 'undefined' && window.innerHeight) ||
      canvasElement.clientHeight ||
      800;
    this.resize(initW, initH);
    this._applyThemePalette('candy_town');
  }

  _initShowcaseActors() {
    // 1. Title Showcase Group (all 4 classic heroes + Turtle + UFO + glossy bubbles in center plaza!)
    this.titleStageGroup = new THREE.Group();
    this.titleHeroRigs = [];

    const titleHeroLayout = [
      { id: 'miduo', x: -1.85, z: 0.75, yaw: 0.28, team: 0 },
      { id: 'xiaoqiang', x: -0.62, z: 1.15, yaw: 0.10, team: 0 },
      { id: 'haiwangzi', x: 0.65, z: 1.15, yaw: -0.10, team: 1 },
      { id: 'wanzi', x: 1.88, z: 0.75, yaw: -0.28, team: 1 },
    ];
    for (let i = 0; i < titleHeroLayout.length; i += 1) {
      const cfg = titleHeroLayout[i];
      const rig = createCharacterRig(cfg.id, { team: cfg.team, isPrimaryHuman: i === 0 });
      rig.root.position.set(cfg.x, 0, cfg.z);
      rig.actorPivot.rotation.y = cfg.yaw;
      this.titleStageGroup.add(rig.root);
      this.titleHeroRigs.push({ rig, phaseOffset: i * 1.1 });
    }

    // Add flanking Turtle & UFO showcase mounts on Title plaza!
    this.titleTurtle = createTurtleMountMesh();
    this.titleTurtle.position.set(-2.65, 0, 1.9);
    this.titleTurtle.rotation.y = 0.5;
    this.titleUfo = createUfoMountMesh();
    this.titleUfo.position.set(2.65, 0, 1.9);
    this.titleUfo.rotation.y = -0.5;
    this.titleStageGroup.add(this.titleTurtle, this.titleUfo);

    // 2. Select Turntable Pedestal Group (displays selected hero + optional P2 hero!)
    this.selectStageGroup = new THREE.Group();
    this.selectTurntable = new THREE.Group();
    this.selectTurntable.position.set(0, 0, 1.2);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.62, 0.20, 32),
      createCandyMaterial(0xfff1f5, { roughness: 0.16, clearcoat: 0.9 })
    );
    disc.position.y = 0.10;
    disc.receiveShadow = true;
    const goldRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.52, 0.055, 10, 36),
      createMetallicMaterial(0xfbbf24, { roughness: 0.2, metalness: 0.88 })
    );
    goldRim.rotation.x = Math.PI * 0.5;
    goldRim.position.y = 0.16;
    this.selectTurntable.add(disc, goldRim);

    this.selectHeroContainer = new THREE.Group();
    this.selectHeroContainer.position.y = 0.20;
    this.selectTurntable.add(this.selectHeroContainer);
    this.selectStageGroup.add(this.selectTurntable);

    this.selectSignature = '';
    this.selectRigs = [];

    this.showcaseGroup.add(this.titleStageGroup, this.selectStageGroup);
  }

  _applyThemePalette(arenaId) {
    const safeArena = arenaId || 'candy_town';
    if (this.activeThemeArenaId === safeArena) return;
    this.activeThemeArenaId = safeArena;

    const pal = getArenaThemeLighting(safeArena);
    this.scene.background.setHex(pal.skyHex);
    this.scene.fog.color.setHex(pal.fogHex);
    this.hemiLight.color.setHex(pal.hemiSky);
    this.hemiLight.groundColor.setHex(pal.hemiGround);
    this.hemiLight.intensity = pal.hemiIntensity;
    this.dirLight.color.setHex(pal.dirColor);
    this.dirLight.intensity = pal.dirIntensity;
  }

  /**
   * Resizes the WebGL2 drawing buffer & recomputes 4-viewport Safe-Subrectangle camera framing.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    const w = Math.max(1, Math.round(Number(width) || 1280));
    const h = Math.max(1, Math.round(Number(height) || 800));
    const dpr =
      typeof window !== 'undefined' && window.devicePixelRatio
        ? Math.min(window.devicePixelRatio, 2)
        : 1;
    this.webgl.setPixelRatio(dpr);
    this.webgl.setSize(w, h, false);
    this.cameraRig.resize(w, h);
  }

  /**
   * Clears all transient match entities, boss decals, and shatter debris when starting a new match,
   * and synchronizes the initial grid without spawning phantom tick-0 soft-block break cubes.
   */
  resetForNewMatch(snapshot = null) {
    this.elapsedSec = 0;
    this._lastMatchTick = -1;
    this.entityManager.clearAll();
    this.bossManager.clear();
    this.arenaManager.clearDebris();
    this.cameraRig.shakeSec = 0;
    this.cameraRig.shakeAmp = 0;
    this.cameraRig.lastShakeAmp = 0;
    this.cameraRig.orbitPhase = 0;
    const p1 = snapshot?.players?.find((p) => p.id === 'p1') || snapshot?.players?.[0];
    this.cameraRig.resetFollowTarget(
      p1 ? tileToWorldX(p1.x) : 0,
      p1 ? tileToWorldZ(p1.z) : 0
    );
    this.cameraRig.updateFraming();
    for (const entry of this.characterRigsById.values()) {
      entry.rig.initializedPose = false;
    }
    if (snapshot) {
      this.lastSnapshotData = snapshot;
      this._applyThemePalette(snapshot.arenaId);
      this.arenaManager.resetForNewMatch(snapshot.arenaId, snapshot.grid);
      this._lastMatchTick = typeof snapshot.tick === 'number' ? snapshot.tick : 0;
    }
  }

  /**
   * Switches active 3D scene mode (`'title' | 'select' | 'playing' | 'paused' | 'podium'`).
   * @param {string} screenMode
   * @param {object|null} previewOrSnapshot
   */
  setScreenMode(screenMode, previewOrSnapshot = null) {
    const nextMode = normalizeScreenMode(screenMode);
    const modeChanged = this.screenMode !== nextMode;
    this.screenMode = nextMode;
    if (previewOrSnapshot) {
      this.lastSnapshotData = previewOrSnapshot;
    }

    this.cameraRig.setScreenMode(nextMode);

    if (nextMode === SCREEN_IDS.PODIUM) {
      this.matchWorldGroup.visible = false;
      this.showcaseGroup.visible = false;
      this.podiumManager.setVisible(true);
      this._applyThemePalette('candy_town');
    } else if (nextMode === SCREEN_IDS.TITLE || nextMode === SCREEN_IDS.SELECT) {
      this._lastMatchTick = -1;
      this.matchWorldGroup.visible = true;
      this.actorsGroup.visible = false;
      this.entityManager.clearAll();
      this.bossManager.clear();
      this.arenaManager.clearDebris();
      this.showcaseGroup.visible = true;
      this.titleStageGroup.visible = nextMode === SCREEN_IDS.TITLE;
      this.selectStageGroup.visible = nextMode === SCREEN_IDS.SELECT;
      this.podiumManager.setVisible(false);
    } else {
      // 'playing' | 'paused'
      if (modeChanged && nextMode === SCREEN_IDS.PLAYING && this._lastMatchTick < 0) {
        this.entityManager.clearAll();
        this.bossManager.clear();
        this.arenaManager.clearDebris();
      }
      this.matchWorldGroup.visible = true;
      this.actorsGroup.visible = true;
      this.showcaseGroup.visible = false;
      this.podiumManager.setVisible(false);
    }
  }

  /**
   * Alias of `setScreenMode` for contract flexibility (`architecture.md §4.4`).
   */
  setModeScene(screenMode, previewOrSnapshot = null) {
    this.setScreenMode(screenMode, previewOrSnapshot);
  }

  /**
   * Syncs the Three.js scene graph with `simSnapshot` + `uiState` and renders one WebGL frame.
   *
   * @param {object|null} simSnapshot
   * @param {number} dtSec
   * @param {object|null} uiState
   */
  render(simSnapshot = null, dtSec = 1 / 60, uiState = null) {
    const dt = Math.max(0, Math.min(Number(dtSec) || 0, 0.1));
    this.elapsedSec += dt;

    if (uiState && uiState.uiScreen) {
      const uiMode = normalizeScreenMode(uiState.uiScreen);
      if (uiMode !== this.screenMode) {
        this.setScreenMode(uiMode, simSnapshot);
      }
    }

    const snap = simSnapshot || this.lastSnapshotData;
    if (simSnapshot) {
      this.lastSnapshotData = simSnapshot;
    }

    if (this.screenMode === SCREEN_IDS.PODIUM) {
      this.podiumManager.update(snap?.rankings || null, this.elapsedSec, dt || 1 / 60);
    } else if (this.screenMode === SCREEN_IDS.TITLE) {
      const arenaId = snap?.arenaId || 'candy_town';
      this._applyThemePalette(arenaId);
      const showcaseGrid = buildShowcaseGridFromSnapshot(snap);
      this.arenaManager.sync(arenaId, showcaseGrid, this.elapsedSec, dt, false);

      for (let i = 0; i < this.titleHeroRigs.length; i += 1) {
        const item = this.titleHeroRigs[i];
        updateCharacterRig(item.rig, null, this.elapsedSec, dt || 1 / 60, {
          mode: i % 2 === 0 ? 'celebrate' : 'turntable',
          phaseOffset: item.phaseOffset,
        });
      }
      if (this.titleUfo) {
        this.titleUfo.userData.hoverRoot.position.y =
          0.26 + Math.sin(this.elapsedSec * 4.5) * 0.05;
        this.titleUfo.userData.bulbSpinGroup.rotation.y = this.elapsedSec * 3.5;
      }
    } else if (this.screenMode === SCREEN_IDS.SELECT) {
      const selCfg = uiState?.selectedConfig || {};
      const arenaId = selCfg.arenaId || snap?.arenaId || 'candy_town';
      const p1Char = selCfg.p1CharacterId || snap?.players?.[0]?.characterId || 'miduo';
      const p2Enabled = Boolean(selCfg.p2Enabled);
      const p2Char = selCfg.p2CharacterId || 'wanzi';

      this._applyThemePalette(arenaId);
      const showcaseGrid = buildShowcaseGridFromSnapshot(snap);
      this.arenaManager.sync(arenaId, showcaseGrid, this.elapsedSec, dt, false);
      this._syncSelectTurntable(p1Char, p2Enabled, p2Char, dt || 1 / 60);
    } else if (snap) {
      // Active Gameplay ('playing' | 'paused')
      const tick = typeof snap.tick === 'number' ? snap.tick : 0;
      const matchElapsedSec = Math.max(0, tick / 60);
      const allowBreakBurst =
        tick > 2 && this._lastMatchTick >= 0 && tick >= this._lastMatchTick;
      this._applyThemePalette(snap.arenaId);
      this.arenaManager.sync(snap.arenaId, snap.grid, this.elapsedSec, dt, allowBreakBurst);
      this._lastMatchTick = tick;

      const p1 = (snap.players || []).find((p) => p.id === 'p1') || snap.players?.[0] || null;
      if (p1 && this._lastFollowSyncTick !== tick) {
        this._lastFollowSyncTick = tick;
        this.cameraRig.updateFollowTarget(
          tileToWorldX(p1.x),
          tileToWorldZ(p1.z),
          dt || 1 / 60,
          tick <= 1
        );
      }

      this._syncMatchPlayers(snap.players || [], dt, matchElapsedSec);

      const events = Array.isArray(uiState?.pendingEvents)
        ? uiState.pendingEvents
        : snap.events || [];
      this.entityManager.sync(snap, this.elapsedSec, dt, events);
      this.bossManager.sync(snap.boss || null, this.elapsedSec, dt);

      // Camera shake: 0.40 amp for 0.22s on chain explosions / KOs / boss attacks; 0.25 amp on own/nearby blast
      for (let i = 0; i < events.length; i += 1) {
        const ev = events[i];
        const t = ev.type;
        if (
          t === EVENT_TYPES.CHAIN_EXPLODE ||
          t === EVENT_TYPES.BOSS_ATTACK ||
          t === EVENT_TYPES.POP
        ) {
          this.cameraRig.triggerImpulse(0.40, 0.22);
        } else if (t === EVENT_TYPES.EXPLODE) {
          const isOwnOrNearP1 =
            ev.ownerId === 'p1' ||
            (p1 && Math.hypot((ev.col ?? 7) + 0.5 - p1.x, (ev.row ?? 6) + 0.5 - p1.z) <= 6.5);
          if (isOwnOrNearP1) {
            this.cameraRig.triggerImpulse(0.25, 0.22);
          } else {
            this.cameraRig.triggerImpulse(0.14, 0.18);
          }
        }
      }
    }

    this.cameraRig.update(dt);
    this.webgl.render(this.scene, this.cameraRig.camera);
  }

  _syncSelectTurntable(p1Char, p2Enabled, p2Char, dt) {
    const safeP1 = CHARACTER_IDS.includes(p1Char) ? p1Char : 'miduo';
    const safeP2 = CHARACTER_IDS.includes(p2Char) ? p2Char : 'wanzi';
    const sig = `${safeP1}:${p2Enabled ? safeP2 : '1p'}`;

    if (sig !== this.selectSignature) {
      while (this.selectHeroContainer.children.length > 0) {
        const old = this.selectHeroContainer.children[0];
        this.selectHeroContainer.remove(old);
        disposeRigNodeWithoutTextures(old);
      }
      this.selectRigs = [];

      if (p2Enabled) {
        const r1 = createCharacterRig(safeP1, { team: 0, isPrimaryHuman: true });
        r1.root.position.set(-0.55, 0, 0);
        const r2 = createCharacterRig(safeP2, { team: 0, isPrimaryHuman: false });
        r2.root.position.set(0.55, 0, 0);
        this.selectHeroContainer.add(r1.root, r2.root);
        this.selectRigs.push(r1, r2);
      } else {
        const r1 = createCharacterRig(safeP1, { team: 0, isPrimaryHuman: true });
        r1.root.position.set(0, 0, 0);
        r1.root.scale.setScalar(1.18);
        this.selectHeroContainer.add(r1.root);
        this.selectRigs.push(r1);
      }
      this.selectSignature = sig;
    }

    this.selectHeroContainer.rotation.y = Math.sin(this.elapsedSec * 1.1) * 0.55;
    for (let i = 0; i < this.selectRigs.length; i += 1) {
      updateCharacterRig(this.selectRigs[i], null, this.elapsedSec, dt, {
        mode: 'turntable',
        phaseOffset: i * 1.2,
      });
    }
  }

  _syncMatchPlayers(players, dt, matchElapsedSec = 0) {
    const activeSlotIds = new Set();

    for (let i = 0; i < players.length; i += 1) {
      const p = players[i];
      activeSlotIds.add(p.id);

      let entry = this.characterRigsById.get(p.id);
      if (
        entry &&
        (entry.characterId !== p.characterId || entry.team !== p.team)
      ) {
        this.actorsGroup.remove(entry.rig.root);
        disposeRigNodeWithoutTextures(entry.rig.root);
        entry = null;
      }

      if (!entry) {
        const rig = createCharacterRig(p.characterId, {
          team: p.team,
          isPrimaryHuman: p.id === 'p1',
        });
        this.actorsGroup.add(rig.root);
        entry = {
          characterId: p.characterId,
          team: p.team,
          rig,
        };
        this.characterRigsById.set(p.id, entry);
      }

      updateCharacterRig(entry.rig, p, this.elapsedSec, dt || 1 / 60, null, matchElapsedSec);
    }

    for (const [slotId, entry] of this.characterRigsById.entries()) {
      if (!activeSlotIds.has(slotId)) {
        this.actorsGroup.remove(entry.rig.root);
        disposeRigNodeWithoutTextures(entry.rig.root);
        this.characterRigsById.delete(slotId);
      }
    }
  }

  /**
   * Projects a 3D world coordinate `(wx, wy, wz)` into viewport pixel coordinates `{ x, y }`.
   */
  projectWorldToScreen(wx, wy, wz) {
    const vec = this.cameraRig._tmpVec.set(wx, wy, wz).project(this.cameraRig.camera);
    const w = this.cameraRig.viewportWidth || 1280;
    const h = this.cameraRig.viewportHeight || 800;
    return {
      x: Math.round(((vec.x + 1) * 0.5) * w),
      y: Math.round(((1 - vec.y) * 0.5) * h),
    };
  }

  syncCameraFollow(snap, dt = 1 / 60) {
    if (!snap || !this.cameraRig.followCameraActive) return;
    const tick = typeof snap.tick === 'number' ? snap.tick : 0;
    const p1 = (snap.players || []).find((p) => p.id === 'p1') || snap.players?.[0] || null;
    if (p1) {
      this._lastFollowSyncTick = tick;
      this.cameraRig.updateFollowTarget(
        tileToWorldX(p1.x),
        tileToWorldZ(p1.z),
        dt,
        tick <= 1
      );
    }
  }

  dispose() {
    this.entityManager.clearAll();
    this.bossManager.clear();
    this.arenaManager.clearDebris();
    if (this.webgl && typeof this.webgl.dispose === 'function') {
      this.webgl.dispose();
    }
  }

  /**
   * Returns live WebGL2 & CameraRig telemetry matching `PROJECT.md § Interface Contracts`.
   */
  getDiagnostics() {
    const renderInfo = this.webgl.info?.render || {};
    return {
      webgl2: this.isWebGL2,
      drawCalls: Number(renderInfo.calls || 0),
      triangles: Number(renderInfo.triangles || 0),
      cameraDistance: this.cameraRig.cameraDistance,
      cameraFov: this.cameraRig.cameraFov,
      viewportWidth: this.cameraRig.viewportWidth,
      viewportHeight: this.cameraRig.viewportHeight,
      screenMode: this.screenMode,
      followCameraActive: Boolean(this.cameraRig.followCameraActive),
      followTargetX: +this.cameraRig.followTargetX.toFixed(3),
      followTargetZ: +this.cameraRig.followTargetZ.toFixed(3),
      visibleTileWidth: Number(this.cameraRig.visibleTileWidth || 0),
      visibleTileWidthFull: Number(this.cameraRig.visibleTileWidthFull || 0),
      visibleTileHeight: Number(this.cameraRig.visibleTileHeight || 0),
      arenaFillRatioW: this.cameraRig.arenaFillRatioW,
      lastShakeAmp: +this.cameraRig.lastShakeAmp.toFixed(3),
      arenaScreenBounds: { ...this.cameraRig.arenaScreenBounds },
    };
  }

  /**
   * Alias of `getDiagnostics()` (`architecture.md §4.4`).
   */
  getRenderDiagnostics() {
    return this.getDiagnostics();
  }
}

export default Renderer3D;
