/**
 * Master Application Coordinator & window.__QQTANG__ Diagnostic Seam
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Wires SimEngine + Renderer3D + AudioSynth + InputController + HudScreens
 * in a fixed-timestep 60Hz loop with 100% relative ES2022 module imports
 * and zero cheat backdoors.
 */

import {
  ARENA_IDS,
  CHARACTER_IDS,
  FIXED_DT,
  MATCH_PHASES,
  MAX_ACCUMULATOR_SEC,
  MODE_IDS,
  SCREEN_IDS,
  TEST_IDS,
} from './contracts/constants.js';
import { SimEngine } from './sim/engine.js';
import { Renderer3D } from './render/renderer.js';
import { AudioSynth } from './audio/synth.js';
import { InputController } from './ui/input.js';
import { HudScreens } from './ui/hud_screens.js';

function cloneJsonSafe(val) {
  if (val === null || val === undefined) return val;
  return JSON.parse(JSON.stringify(val));
}

function getTrackedErrors() {
  const src =
    typeof window !== 'undefined' && window.__E2E_ERROR_TRACKER__
      ? window.__E2E_ERROR_TRACKER__
      : { jsErrors: [], unhandledRejections: [], resourceErrors: [] };
  return {
    jsErrors: Array.isArray(src.jsErrors) ? src.jsErrors.slice() : [],
    unhandledRejections: Array.isArray(src.unhandledRejections)
      ? src.unhandledRejections.slice()
      : [],
    resourceErrors: Array.isArray(src.resourceErrors) ? src.resourceErrors.slice() : [],
  };
}

function pickDefaultP2Char(p1CharId) {
  return p1CharId === 'wanzi' ? 'miduo' : 'wanzi';
}

function bootstrapApp() {
  const canvas = document.querySelector(`[data-testid="${TEST_IDS.ARENA_CANVAS}"]`);
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) {
    throw new Error('Missing #arena-canvas or #ui-root in index.html');
  }

  let uiScreen = SCREEN_IDS.TITLE;
  let deterministicMode = false;
  let autoPlayP1 = false;
  let nextMatchSeed = 20261029;

  const selectedConfig = {
    modeId: 'classic_2v2',
    arenaId: 'candy_town',
    p1CharacterId: 'miduo',
    p2CharacterId: 'wanzi',
    p2Enabled: false,
  };

  let lastRestartOptions = { ...selectedConfig };
  let simEngine = null;
  let currentSimSnapshot = null;
  let previewEngine = null;
  let previewSnapshot = null;

  const audio = new AudioSynth();
  audio.setTrack('menu');

  const renderer = new Renderer3D(canvas);
  let lastViewportW = 0;
  let lastViewportH = 0;
  let stepRendersInTask = 0;
  let screenNeedsSyncRender = true;
  let microtaskFlushQueued = false;
  let deferredRenderPending = false;
  let deferredRenderDt = 0;
  let lastRenderEndMs = 0;
  let lastRenderCostMs = 0;
  let disposed = false;
  let rafId = 0;
  const pendingVisualEvents = [];

  function syncViewportSize(force = false) {
    const w = Math.max(1, Math.round(window.innerWidth || canvas.clientWidth || 1280));
    const h = Math.max(1, Math.round(window.innerHeight || canvas.clientHeight || 800));
    if (force || w !== lastViewportW || h !== lastViewportH) {
      lastViewportW = w;
      lastViewportH = h;
      stepRendersInTask = 0;
      screenNeedsSyncRender = true;
      if (typeof renderer.resize === 'function') {
        renderer.resize(w, h);
      }
    }
  }

  function applyRendererScreenMode(mode, data) {
    stepRendersInTask = 0;
    screenNeedsSyncRender = true;
    if (typeof renderer.setScreenMode === 'function') {
      renderer.setScreenMode(mode, data);
    } else if (typeof renderer.setModeScene === 'function') {
      renderer.setModeScene(mode, data);
    }
  }

  function readRenderDiagnostics() {
    let raw = null;
    if (typeof renderer.getDiagnostics === 'function') {
      raw = renderer.getDiagnostics();
    } else if (typeof renderer.getRenderDiagnostics === 'function') {
      raw = renderer.getRenderDiagnostics();
    }
    const safeExtra = raw && typeof raw === 'object' ? cloneJsonSafe(raw) : {};
    return {
      ...safeExtra,
      webgl2: Boolean(raw?.webgl2),
      drawCalls: Number(raw?.drawCalls || 0),
      triangles: Number(raw?.triangles || 0),
      cameraDistance: Number(raw?.cameraDistance || 0),
      cameraFov: Number(raw?.cameraFov || 0),
      viewportWidth: Number(raw?.viewportWidth || lastViewportW),
      viewportHeight: Number(raw?.viewportHeight || lastViewportH),
    };
  }

  function getUiRenderState(pendingEvents = []) {
    return {
      uiScreen,
      selectedConfig: { ...selectedConfig },
      pendingEvents,
    };
  }

  function rebuildPreviewDiorama() {
    previewEngine = new SimEngine({
      modeId: selectedConfig.modeId,
      arenaId: selectedConfig.arenaId,
      p1CharacterId: selectedConfig.p1CharacterId,
      p2CharacterId: selectedConfig.p2CharacterId,
      p2Enabled: selectedConfig.p2Enabled,
      seed: 9001,
      botBehavior: 'idle',
    });
    previewSnapshot = previewEngine.getSnapshot();
  }

  function renderActiveScene(dtSec = FIXED_DT) {
    if (disposed) return;
    syncViewportSize(false);
    const activeSnap =
      uiScreen === SCREEN_IDS.PLAYING ||
      uiScreen === SCREEN_IDS.PAUSED ||
      uiScreen === SCREEN_IDS.PODIUM
        ? currentSimSnapshot
        : previewSnapshot;
    const eventsBatch =
      pendingVisualEvents.length > 0
        ? pendingVisualEvents.splice(0, pendingVisualEvents.length)
        : [];
    const t0 = performance.now();
    if (typeof renderer.render === 'function') {
      renderer.render(activeSnap, dtSec, getUiRenderState(eventsBatch));
    }
    const t1 = performance.now();
    lastRenderEndMs = t1;
    lastRenderCostMs = t1 - t0;
    screenNeedsSyncRender = false;
    deferredRenderPending = false;
    deferredRenderDt = 0;
  }

  function renderFromStepFrames(dtSec = FIXED_DT) {
    if (!microtaskFlushQueued) {
      microtaskFlushQueued = true;
      queueMicrotask(() => {
        microtaskFlushQueued = false;
        stepRendersInTask = 0;
        if (deferredRenderPending && !disposed) {
          renderActiveScene(deferredRenderDt || FIXED_DT);
        }
      });
    }
    const isFastHardwareGpu = lastRenderCostMs > 0 && lastRenderCostMs <= 16;
    if (
      lastRenderEndMs === 0 ||
      screenNeedsSyncRender ||
      (isFastHardwareGpu && stepRendersInTask < 1)
    ) {
      stepRendersInTask += 1;
      renderActiveScene(dtSec);
    } else {
      deferredRenderPending = true;
      deferredRenderDt += dtSec;
    }
  }

  function openSelectScreen() {
    input.releaseAllActiveInputs();
    audio.playUiTap();
    simEngine = null;
    currentSimSnapshot = null;
    pendingVisualEvents.length = 0;
    uiScreen = SCREEN_IDS.SELECT;
    audio.setTrack('menu');
    hud.syncSelectedConfig(selectedConfig);
    hud.setScreen(SCREEN_IDS.SELECT);
    rebuildPreviewDiorama();
    applyRendererScreenMode(SCREEN_IDS.SELECT, previewSnapshot);
    renderActiveScene(FIXED_DT);
  }

  function clearHumanSimMoveIntents() {
    if (!simEngine) return;
    if (!autoPlayP1) {
      simEngine.setPlayerIntent('p1', {
        moveX: 0,
        moveZ: 0,
        dropBubble: false,
        useItem: false,
      });
    }
    if (simEngine.p2Enabled) {
      simEngine.setPlayerIntent('p2', {
        moveX: 0,
        moveZ: 0,
        dropBubble: false,
        useItem: false,
      });
    }
  }

  function togglePauseState() {
    if (uiScreen === SCREEN_IDS.PLAYING && simEngine) {
      input.releaseAllActiveInputs();
      clearHumanSimMoveIntents();
      audio.playUiTap();
      uiScreen = SCREEN_IDS.PAUSED;
      hud.setScreen(SCREEN_IDS.PAUSED);
      applyRendererScreenMode(SCREEN_IDS.PAUSED, currentSimSnapshot);
      renderActiveScene(0);
    } else if (uiScreen === SCREEN_IDS.PAUSED && simEngine) {
      input.releaseAllActiveInputs();
      clearHumanSimMoveIntents();
      audio.playUiTap();
      uiScreen = SCREEN_IDS.PLAYING;
      hud.setScreen(SCREEN_IDS.PLAYING);
      applyRendererScreenMode(SCREEN_IDS.PLAYING, currentSimSnapshot);
      renderActiveScene(0);
    }
  }

  function toggleMuteState() {
    const muted = audio.toggleMuted();
    hud.syncAudioMuted(muted);
  }

  const input = new InputController({
    getUiScreen: () => uiScreen,
    onTogglePause: togglePauseState,
    onToggleMute: toggleMuteState,
  });

  const hud = new HudScreens(uiRoot, {
    onOpenSelect: () => {
      openSelectScreen();
    },
    onSelectCharacter: (charId) => {
      if (!CHARACTER_IDS.includes(charId)) return;
      audio.playUiTap();
      selectedConfig.p1CharacterId = charId;
      if (selectedConfig.p2CharacterId === charId) {
        selectedConfig.p2CharacterId = pickDefaultP2Char(charId);
      }
      hud.syncSelectedConfig(selectedConfig);
      rebuildPreviewDiorama();
      applyRendererScreenMode(SCREEN_IDS.SELECT, previewSnapshot);
      renderActiveScene(FIXED_DT);
    },
    onSelectArena: (arenaId) => {
      if (!ARENA_IDS.includes(arenaId)) return;
      audio.playUiTap();
      selectedConfig.arenaId = arenaId;
      hud.syncSelectedConfig(selectedConfig);
      rebuildPreviewDiorama();
      applyRendererScreenMode(SCREEN_IDS.SELECT, previewSnapshot);
      renderActiveScene(FIXED_DT);
    },
    onSelectMode: (modeId) => {
      if (!MODE_IDS.includes(modeId)) return;
      audio.playUiTap();
      selectedConfig.modeId = modeId;
      hud.syncSelectedConfig(selectedConfig);
      rebuildPreviewDiorama();
      applyRendererScreenMode(SCREEN_IDS.SELECT, previewSnapshot);
      renderActiveScene(FIXED_DT);
    },
    onToggle2P: () => {
      audio.playUiTap();
      selectedConfig.p2Enabled = !selectedConfig.p2Enabled;
      selectedConfig.p2CharacterId = pickDefaultP2Char(selectedConfig.p1CharacterId);
      input.setP2Enabled(selectedConfig.p2Enabled);
      hud.syncSelectedConfig(selectedConfig);
      rebuildPreviewDiorama();
      applyRendererScreenMode(SCREEN_IDS.SELECT, previewSnapshot);
      renderActiveScene(FIXED_DT);
    },
    onStartMatchClick: () => {
      audio.playUiTap();
      nextMatchSeed = (nextMatchSeed + 7919) >>> 0;
      startMatch({
        modeId: selectedConfig.modeId,
        arenaId: selectedConfig.arenaId,
        p1CharacterId: selectedConfig.p1CharacterId,
        p2CharacterId: selectedConfig.p2CharacterId,
        p2Enabled: selectedConfig.p2Enabled,
        seed: nextMatchSeed,
        botBehavior: 'active',
      });
    },
    onPauseClick: () => {
      togglePauseState();
    },
    onToggleAudioClick: () => {
      toggleMuteState();
    },
    onResumeClick: () => {
      input.releaseAllActiveInputs();
      clearHumanSimMoveIntents();
      if (uiScreen === SCREEN_IDS.PAUSED) {
        togglePauseState();
      }
    },
    onRestartClick: () => {
      audio.playUiTap();
      nextMatchSeed = (nextMatchSeed + 101) >>> 0;
      startMatch({
        ...lastRestartOptions,
        seed: nextMatchSeed,
      });
    },
    onQuitToSelectClick: () => {
      openSelectScreen();
    },
    onPlayAgainClick: () => {
      audio.playUiTap();
      nextMatchSeed = (nextMatchSeed + 131) >>> 0;
      startMatch({
        ...lastRestartOptions,
        seed: nextMatchSeed,
      });
    },
    onBackToSelectClick: () => {
      openSelectScreen();
    },
  });

  input.bindHudElements(hud.getHudInputTargets());
  hud.syncSelectedConfig(selectedConfig);
  hud.syncAudioMuted(audio.isMuted());

  function transitionToPodium() {
    input.releaseAllActiveInputs();
    uiScreen = SCREEN_IDS.PODIUM;
    audio.setTrack('podium');
    hud.updatePodium(currentSimSnapshot);
    hud.setScreen(SCREEN_IDS.PODIUM);
    applyRendererScreenMode(SCREEN_IDS.PODIUM, currentSimSnapshot);
  }

  function stepSimulationTick(dt = FIXED_DT) {
    if (uiScreen !== SCREEN_IDS.PLAYING || !simEngine) return;

    const frameIntents = input.consumeFrameIntents(simEngine.p2Enabled);
    if (!autoPlayP1 && frameIntents.p1) {
      simEngine.setPlayerIntent('p1', frameIntents.p1);
    }
    if (simEngine.p2Enabled && frameIntents.p2) {
      simEngine.setPlayerIntent('p2', frameIntents.p2);
    }

    currentSimSnapshot = simEngine.step(dt);
    if (Array.isArray(currentSimSnapshot.events) && currentSimSnapshot.events.length > 0) {
      for (let i = 0; i < currentSimSnapshot.events.length; i += 1) {
        pendingVisualEvents.push(currentSimSnapshot.events[i]);
      }
      if (pendingVisualEvents.length > 96) {
        pendingVisualEvents.splice(0, pendingVisualEvents.length - 96);
      }
    }
    audio.consumeEvents(currentSimSnapshot.events);

    if (currentSimSnapshot.phase !== MATCH_PHASES.PLAYING) {
      transitionToPodium();
    }
  }

  function startMatch(options = {}) {
    if (options.deterministic !== undefined) {
      setDeterministicMode(options.deterministic);
    }

    const modeId = MODE_IDS.includes(options.modeId)
      ? options.modeId
      : selectedConfig.modeId;
    const arenaId = ARENA_IDS.includes(options.arenaId)
      ? options.arenaId
      : selectedConfig.arenaId;
    const p1CharacterId = CHARACTER_IDS.includes(options.p1CharacterId)
      ? options.p1CharacterId
      : selectedConfig.p1CharacterId;
    const p2Enabled =
      options.p2Enabled !== undefined ? Boolean(options.p2Enabled) : false;
    const p2CharacterId = CHARACTER_IDS.includes(options.p2CharacterId)
      ? options.p2CharacterId
      : pickDefaultP2Char(p1CharacterId);

    selectedConfig.modeId = modeId;
    selectedConfig.arenaId = arenaId;
    selectedConfig.p1CharacterId = p1CharacterId;
    selectedConfig.p2CharacterId = p2CharacterId;
    selectedConfig.p2Enabled = p2Enabled;

    lastRestartOptions = {
      modeId,
      arenaId,
      p1CharacterId,
      p2CharacterId,
      p2Enabled,
      botBehavior: options.botBehavior === 'idle' ? 'idle' : 'active',
    };

    autoPlayP1 = Boolean(options.autoPlayP1);
    const seed =
      options.seed !== undefined && Number.isFinite(Number(options.seed))
        ? Number(options.seed) >>> 0
        : (nextMatchSeed = (nextMatchSeed + 17) >>> 0);

    simEngine = new SimEngine({
      ...options,
      modeId,
      arenaId,
      p1CharacterId,
      p2CharacterId,
      p2Enabled,
      seed,
      autoPlayP1,
    });

    pendingVisualEvents.length = 0;
    input.setP2Enabled(p2Enabled);
    input.resetForMatch({ p2Enabled });
    uiScreen = SCREEN_IDS.PLAYING;

    const matchTrack = modeId === 'boss_golem' ? 'boss_golem' : arenaId;
    audio.setTrack(matchTrack);

    currentSimSnapshot = simEngine.getSnapshot();
    hud.syncSelectedConfig(selectedConfig);
    hud.setScreen(SCREEN_IDS.PLAYING);
    hud.updateHud(currentSimSnapshot, audio.isMuted());

    syncViewportSize(false);
    if (typeof renderer.resetForNewMatch === 'function') {
      renderer.resetForNewMatch(currentSimSnapshot);
    }
    applyRendererScreenMode(SCREEN_IDS.PLAYING, currentSimSnapshot);
    renderActiveScene(0);

    return getState();
  }

  function setDeterministicMode(enabled) {
    deterministicMode = Boolean(enabled);
    accumulatorSec = 0;
    return deterministicMode;
  }

  function stepFrames(count = 1) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    syncViewportSize(false);

    if (n === 0) {
      return getState();
    }

    if (uiScreen === SCREEN_IDS.PLAYING && simEngine) {
      for (let i = 0; i < n; i += 1) {
        stepSimulationTick(FIXED_DT);
        if (uiScreen !== SCREEN_IDS.PLAYING) {
          // Match naturally concluded -> remaining frames animate Podium
          const rem = n - 1 - i;
          renderFromStepFrames(Math.max(1, rem + 1) * FIXED_DT);
          return getState();
        }
      }
      hud.updateHud(currentSimSnapshot, audio.isMuted());
      renderFromStepFrames(n * FIXED_DT);
    } else if (uiScreen === SCREEN_IDS.PAUSED) {
      // Simulation stays frozen while paused
      renderFromStepFrames(0);
    } else {
      renderFromStepFrames(n * FIXED_DT);
    }

    return getState();
  }

  function setPlayerInput(slot, intent = {}) {
    if (!intent || typeof intent !== 'object') return;
    let normalizedSlot = slot;
    if (slot === 0) normalizedSlot = 'p1';
    else if (slot === 1) normalizedSlot = selectedConfig.p2Enabled ? 'p2' : 'bot1';

    if (normalizedSlot === 'p1' || normalizedSlot === 'p2') {
      input.setProgrammaticInput(normalizedSlot, intent);
    } else if (simEngine && typeof normalizedSlot === 'string') {
      simEngine.setPlayerIntent(normalizedSlot, intent);
    }
  }

  function setAutoPlayP1(enabled) {
    autoPlayP1 = Boolean(enabled);
    if (simEngine) {
      simEngine.setAutoPlayP1(autoPlayP1);
    }
    return autoPlayP1;
  }

  function getState() {
    syncViewportSize(false);
    return {
      uiScreen,
      selectedConfig: { ...selectedConfig },
      hudClickableCount: hud.getVisibleClickableCount(),
      errors: getTrackedErrors(),
      sim: currentSimSnapshot ? cloneJsonSafe(currentSimSnapshot) : null,
      render: readRenderDiagnostics(),
      audio: audio.getDiagnostics(),
    };
  }

  // Initialize Title Diorama & resize listener
  rebuildPreviewDiorama();
  hud.setScreen(SCREEN_IDS.TITLE);
  syncViewportSize(true);
  applyRendererScreenMode(SCREEN_IDS.TITLE, previewSnapshot);
  renderActiveScene(0);

  window.addEventListener('resize', () => {
    if (disposed) return;
    syncViewportSize(true);
    renderActiveScene(0);
  });

  function cleanupOnUnload() {
    if (disposed) return;
    disposed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    audio.setMuted(true);
    try {
      if (typeof renderer.dispose === 'function') {
        renderer.dispose();
      } else if (renderer.webgl && typeof renderer.webgl.dispose === 'function') {
        renderer.webgl.dispose();
      }
    } catch (_) {}
  }

  window.addEventListener('pagehide', cleanupOnUnload);
  window.addEventListener('beforeunload', cleanupOnUnload);

  // Wall-clock requestAnimationFrame fixed-timestep loop
  let lastRafMs = performance.now();
  let accumulatorSec = 0;

  function onAnimationFrame(nowMs) {
    if (disposed) return;
    const rawDt = Math.max(0, (nowMs - lastRafMs) / 1000);
    lastRafMs = nowMs;

    if (!deterministicMode) {
      // On CPU software rasterizers (e.g. headless SwiftShader where a shadow+transmission
      // pass costs >45ms), leave main-thread breathing room between rAF renders so UI/CDP
      // events stay instantaneous; on hardware GPUs (<4ms/frame) this runs at native 60fps.
      const shouldYieldSoftwareRender =
        lastRenderCostMs > 45 && nowMs - lastRenderEndMs < Math.min(200, lastRenderCostMs * 1.4);

      const clampedDt = Math.min(rawDt, MAX_ACCUMULATOR_SEC);
      if (uiScreen === SCREEN_IDS.PLAYING && simEngine) {
        accumulatorSec = Math.min(MAX_ACCUMULATOR_SEC, accumulatorSec + clampedDt);
        let stepped = false;
        while (accumulatorSec >= FIXED_DT && uiScreen === SCREEN_IDS.PLAYING) {
          stepSimulationTick(FIXED_DT);
          accumulatorSec -= FIXED_DT;
          stepped = true;
        }
        if (stepped && uiScreen === SCREEN_IDS.PLAYING) {
          hud.updateHud(currentSimSnapshot, audio.isMuted());
        }
        if (!shouldYieldSoftwareRender) {
          renderActiveScene(clampedDt || FIXED_DT);
        }
      } else if (uiScreen === SCREEN_IDS.PAUSED) {
        accumulatorSec = 0;
        if (!shouldYieldSoftwareRender) {
          renderActiveScene(0);
        }
      } else {
        accumulatorSec = 0;
        if (!shouldYieldSoftwareRender) {
          renderActiveScene(clampedDt || FIXED_DT);
        }
      }
    }

    if (!disposed) {
      rafId = requestAnimationFrame(onAnimationFrame);
    }
  }

  rafId = requestAnimationFrame(onAnimationFrame);

  // Expose strictly backdoor-free diagnostic & stepping seam
  const publicApi = Object.freeze({
    version: '1.0.0',
    getState,
    startMatch,
    setDeterministicMode,
    stepFrames,
    setPlayerInput,
    setAutoPlayP1,
  });

  window.__QQTANG__ = publicApi;
  window.__QQ_TANG__ = publicApi;
}

bootstrapApp();
