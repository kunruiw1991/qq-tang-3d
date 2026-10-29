/**
 * Unified 1P/2P Keyboard + Single-Element Virtual Joystick + Touch Button Input Controller
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Pure ES2022 module with relative imports only.
 */

function clampUnit(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-1, Math.min(1, num));
}

const GAME_PREVENT_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Slash',
]);

export class InputController {
  /**
   * @param {object} callbacks
   * @param {() => string} callbacks.getUiScreen
   * @param {() => void} callbacks.onTogglePause
   * @param {() => void} callbacks.onToggleMute
   */
  constructor({ getUiScreen, onTogglePause, onToggleMute }) {
    this._getUiScreen = getUiScreen;
    this._onTogglePause = onTogglePause;
    this._onToggleMute = onToggleMute;

    this._p2Enabled = false;
    this._heldKeys = new Set();

    // Hardware one-shot action latches (consumed on the next simulation step)
    this._hwLatches = {
      p1: { dropBubble: false, useItem: false },
      p2: { dropBubble: false, useItem: false },
    };

    // Track whether hardware directional input was active on the previous tick
    // so releasing a key/joystick cleanly zeros movement without clobbering
    // programmatic setPlayerInput() calls when hardware is idle.
    this._wasHwMoveActive = {
      p1: false,
      p2: false,
    };

    // Programmatic intents set via window.__QQTANG__.setPlayerInput(slot, intent)
    this._programmatic = {
      p1: { hasMove: false, moveX: 0, moveZ: 0, dropBubble: false, useItem: false },
      p2: { hasMove: false, moveX: 0, moveZ: 0, dropBubble: false, useItem: false },
    };

    // Single-DOM Virtual Joystick state
    this._joystickEl = null;
    this._joystickKnobEl = null;
    this._activeTouchId = null;
    this._activePointerId = null;
    this._activePointerType = null;
    this._mouseDragging = false;
    this._joyMoveX = 0;
    this._joyMoveZ = 0;
    this._actionBtnResetters = [];

    this._bindKeyboardListeners();
  }

  setP2Enabled(enabled) {
    this._p2Enabled = Boolean(enabled);
  }

  _releasePointerCaptureSafe() {
    const el = this._joystickEl;
    const pid = this._activePointerId;
    this._activePointerId = null;
    this._activePointerType = null;
    if (el && pid !== null && typeof el.releasePointerCapture === 'function') {
      try {
        if (typeof el.hasPointerCapture !== 'function' || el.hasPointerCapture(pid)) {
          el.releasePointerCapture(pid);
        }
      } catch (_) {
        // Synthetic PointerEvent has no active browser capture to release
      }
    }
  }

  /**
   * Immediately clears all active hardware keys, pointer/touch/mouse joystick drags,
   * and pending one-shot hardware action latches while latching _wasHwMoveActive if
   * hardware movement was active so the next simulation tick cleanly zeroes velocity.
   */
  releaseAllActiveInputs() {
    const hadHwMove =
      this._heldKeys.size > 0 ||
      Math.abs(this._joyMoveX) > 0.001 ||
      Math.abs(this._joyMoveZ) > 0.001 ||
      this._activePointerId !== null ||
      this._activeTouchId !== null ||
      this._mouseDragging;
    if (hadHwMove || this._wasHwMoveActive.p1) {
      this._wasHwMoveActive.p1 = true;
    }
    if (this._p2Enabled && (this._heldKeys.size > 0 || this._wasHwMoveActive.p2)) {
      this._wasHwMoveActive.p2 = true;
    }
    this._releasePointerCaptureSafe();
    this._heldKeys.clear();
    this._activeTouchId = null;
    this._mouseDragging = false;
    this._hwLatches.p1.dropBubble = false;
    this._hwLatches.p1.useItem = false;
    this._hwLatches.p2.dropBubble = false;
    this._hwLatches.p2.useItem = false;
    for (let i = 0; i < this._actionBtnResetters.length; i += 1) {
      this._actionBtnResetters[i]();
    }
    this._resetJoystick();
  }

  resetForMatch({ p2Enabled = false } = {}) {
    this._p2Enabled = Boolean(p2Enabled);
    this.releaseAllActiveInputs();
    this._wasHwMoveActive.p1 = false;
    this._wasHwMoveActive.p2 = false;
    this._programmatic.p1 = { hasMove: false, moveX: 0, moveZ: 0, dropBubble: false, useItem: false };
    this._programmatic.p2 = { hasMove: false, moveX: 0, moveZ: 0, dropBubble: false, useItem: false };
  }

  /**
   * Binds the single unified <div data-testid="hud-joystick" role="slider">
   * and the HUD Bubble / Needle buttons with full W3C PointerEvent + Touch/Mouse support.
   */
  bindHudElements({ joystickEl, joystickKnobEl, bubbleBtnEl, itemBtnEl }) {
    this._joystickEl = joystickEl;
    this._joystickKnobEl = joystickKnobEl;
    this._actionBtnResetters = [];

    const cancelAllJoystickDrags = () => {
      this._releasePointerCaptureSafe();
      this._activeTouchId = null;
      this._mouseDragging = false;
      this._resetJoystick();
    };

    const onPointerMove = (ev) => {
      if (this._activePointerId === null) return;
      if (ev.pointerId !== this._activePointerId && !(!ev.isTrusted && ev.pointerId === 0)) {
        return;
      }
      if (this._getUiScreen() !== 'playing') {
        cancelAllJoystickDrags();
        return;
      }
      if (ev.isTrusted && ev.pointerType === 'mouse' && (ev.buttons & 1) === 0) {
        cancelAllJoystickDrags();
        return;
      }
      this._updateJoystickFromClient(ev.clientX, ev.clientY);
    };

    const onPointerUp = (ev) => {
      if (this._activePointerId !== null) {
        if (ev.pointerId === this._activePointerId || (!ev.isTrusted && ev.pointerId === 0)) {
          cancelAllJoystickDrags();
        }
        return;
      }
      if (this._mouseDragging || this._activeTouchId !== null) {
        if (!ev.isTrusted || ev.pointerType === 'mouse' || ev.pointerType === '') {
          cancelAllJoystickDrags();
        }
      }
    };

    const onPointerCancel = (ev) => {
      if (this._activePointerId !== null) {
        if (
          !ev ||
          typeof ev.pointerId !== 'number' ||
          ev.pointerId === this._activePointerId ||
          (!ev.isTrusted && ev.pointerId === 0)
        ) {
          cancelAllJoystickDrags();
        }
        return;
      }
      cancelAllJoystickDrags();
    };

    const onMouseMove = (ev) => {
      if (!this._mouseDragging) return;
      if (this._getUiScreen() !== 'playing' || (ev.isTrusted && (ev.buttons & 1) === 0)) {
        this._mouseDragging = false;
        this._resetJoystick();
        return;
      }
      if (!ev.isTrusted && ev.buttons !== undefined && (ev.buttons & 1) === 0) {
        this._mouseDragging = false;
        this._resetJoystick();
        return;
      }
      this._updateJoystickFromClient(ev.clientX, ev.clientY);
    };

    const onMouseUp = (ev) => {
      if (
        this._mouseDragging ||
        (this._activePointerId !== null && (this._activePointerType === 'mouse' || !ev.isTrusted))
      ) {
        cancelAllJoystickDrags();
      }
    };

    const endTouch = (ev) => {
      if (
        ev.type === 'touchcancel' &&
        !ev.isTrusted &&
        (!ev.changedTouches || ev.changedTouches.length === 0)
      ) {
        cancelAllJoystickDrags();
        return;
      }
      if (this._activeTouchId === null) return;
      if (!ev.changedTouches) return;
      for (let i = 0; i < ev.changedTouches.length; i += 1) {
        if (ev.changedTouches[i].identifier === this._activeTouchId) {
          this._activeTouchId = null;
          if (this._activePointerType === 'touch' || !ev.isTrusted) {
            this._releasePointerCaptureSafe();
          }
          this._resetJoystick();
          break;
        }
      }
    };

    if (joystickEl) {
      joystickEl.addEventListener('pointerdown', (ev) => {
        if (this._getUiScreen() !== 'playing') return;
        if (typeof ev.button === 'number' && ev.button > 0) return;
        if (
          this._activePointerId !== null &&
          ev.pointerId !== this._activePointerId &&
          !(!ev.isTrusted && ev.pointerId === 0)
        ) {
          return;
        }
        if (typeof ev.preventDefault === 'function') {
          ev.preventDefault();
        }
        this._releasePointerCaptureSafe();
        this._mouseDragging = false;
        this._activePointerId = typeof ev.pointerId === 'number' ? ev.pointerId : 0;
        this._activePointerType = ev.pointerType || 'pointer';
        if (typeof joystickEl.setPointerCapture === 'function') {
          try {
            joystickEl.setPointerCapture(this._activePointerId);
          } catch (_) {
            // Synthetic PointerEvent has no active browser pointer to capture
          }
        }
        if (!ev.isTrusted && ev.clientX === 0 && ev.clientY === 0) {
          this._resetJoystick();
        } else {
          this._updateJoystickFromClient(ev.clientX, ev.clientY);
        }
      });

      // Bind move/up/cancel on joystickEl as well as window so non-bubbling
      // synthetic PointerEvent/MouseEvent/TouchEvent dispatches on joystickEl work directly
      joystickEl.addEventListener('pointermove', onPointerMove);
      joystickEl.addEventListener('pointerup', onPointerUp);
      joystickEl.addEventListener('pointercancel', onPointerCancel);
      joystickEl.addEventListener('lostpointercapture', onPointerCancel);

      joystickEl.addEventListener(
        'touchstart',
        (ev) => {
          if (this._getUiScreen() !== 'playing') return;
          ev.preventDefault();
          if (this._activeTouchId !== null && ev.isTrusted) {
            return;
          }
          if (ev.changedTouches && ev.changedTouches.length > 0) {
            const t = ev.changedTouches[0];
            this._activeTouchId = t.identifier;
            this._updateJoystickFromClient(t.clientX, t.clientY);
          }
        },
        { passive: false }
      );
      joystickEl.addEventListener('touchend', endTouch, { passive: true });
      joystickEl.addEventListener('touchcancel', endTouch, { passive: true });

      joystickEl.addEventListener('mousedown', (ev) => {
        if (this._getUiScreen() !== 'playing') return;
        if (ev.button !== 0) return;
        if (ev.isTrusted && (this._activePointerId !== null || this._activeTouchId !== null)) {
          return;
        }
        ev.preventDefault();
        this._mouseDragging = true;
        this._updateJoystickFromClient(ev.clientX, ev.clientY);
      });
      joystickEl.addEventListener('mousemove', onMouseMove);
      joystickEl.addEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('lostpointercapture', onPointerCancel);

    window.addEventListener(
      'touchmove',
      (ev) => {
        if (this._activeTouchId === null) return;
        if (this._getUiScreen() !== 'playing') {
          cancelAllJoystickDrags();
          return;
        }
        for (let i = 0; i < ev.changedTouches.length; i += 1) {
          const t = ev.changedTouches[i];
          if (t.identifier === this._activeTouchId) {
            ev.preventDefault();
            this._updateJoystickFromClient(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: false }
    );
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    this._bindActionButton(bubbleBtnEl, 'dropBubble');
    this._bindActionButton(itemBtnEl, 'useItem');
  }

  _bindActionButton(btnEl, latchKey) {
    if (!btnEl) return;

    let trustedPointerDownActive = false;
    let suppressTrailingClick = false;

    const resetBtnState = () => {
      trustedPointerDownActive = false;
      suppressTrailingClick = false;
    };
    this._actionBtnResetters.push(resetBtnState);

    const triggerLatch = () => {
      this._hwLatches.p1[latchKey] = true;
      if (typeof btnEl.blur === 'function') {
        btnEl.blur();
      }
    };

    btnEl.addEventListener('pointerdown', (ev) => {
      if (this._getUiScreen() !== 'playing') return;
      if (typeof ev.button === 'number' && ev.button > 0) return;
      if (typeof ev.preventDefault === 'function') {
        ev.preventDefault();
      }
      if (ev.isTrusted) {
        trustedPointerDownActive = true;
      }
      suppressTrailingClick = true;
      triggerLatch();
    });

    const clearTrustedPointer = (ev) => {
      trustedPointerDownActive = false;
      if (ev && ev.type === 'pointercancel') {
        suppressTrailingClick = false;
      }
    };
    btnEl.addEventListener('pointerup', clearTrustedPointer);
    btnEl.addEventListener('pointercancel', clearTrustedPointer);
    btnEl.addEventListener('pointerleave', clearTrustedPointer);
    btnEl.addEventListener('lostpointercapture', clearTrustedPointer);

    btnEl.addEventListener(
      'touchstart',
      (ev) => {
        if (this._getUiScreen() !== 'playing') return;
        if (typeof ev.preventDefault === 'function') {
          ev.preventDefault();
        }
        if (ev.isTrusted && trustedPointerDownActive) {
          return;
        }
        suppressTrailingClick = true;
        triggerLatch();
      },
      { passive: false }
    );

    btnEl.addEventListener('mousedown', (ev) => {
      if (this._getUiScreen() !== 'playing') return;
      if (typeof ev.button === 'number' && ev.button > 0) return;
      if (ev.isTrusted && trustedPointerDownActive) {
        return;
      }
      suppressTrailingClick = true;
      triggerLatch();
    });

    btnEl.addEventListener('click', (ev) => {
      if (this._getUiScreen() !== 'playing') return;
      if (suppressTrailingClick) {
        suppressTrailingClick = false;
        if (!ev || ev.detail !== 0) {
          return;
        }
      }
      triggerLatch();
    });
  }

  _updateJoystickFromClient(clientX, clientY) {
    if (!this._joystickEl) return;
    const rect = this._joystickEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    const maxVisualRadius = Math.max(22, rect.width * 0.28);
    const deadzone = 6;

    if (dist <= deadzone) {
      this._joyMoveX = 0;
      this._joyMoveZ = 0;
      this._setKnobOffset(0, 0);
      this._joystickEl.setAttribute('aria-valuenow', '0');
      return;
    }

    const ux = dx / dist;
    const uz = dy / dist;
    const clampedDist = Math.min(dist, maxVisualRadius);
    this._setKnobOffset(ux * clampedDist, uz * clampedDist);

    const strength = Math.min(1, (dist - deadzone) / Math.max(12, maxVisualRadius * 0.45));
    let mx = ux * strength;
    let mz = uz * strength;

    // Gentle cardinal snap so slightly off-center horizontal/vertical drags track lanes cleanly
    if (Math.abs(mx) > 0.85 && Math.abs(mz) < 0.24) {
      mx = mx > 0 ? 1 : -1;
      mz = 0;
    } else if (Math.abs(mz) > 0.85 && Math.abs(mx) < 0.24) {
      mz = mz > 0 ? 1 : -1;
      mx = 0;
    }

    this._joyMoveX = clampUnit(mx);
    this._joyMoveZ = clampUnit(mz);
    const dominantAxis =
      Math.abs(this._joyMoveX) >= Math.abs(this._joyMoveZ) ? this._joyMoveX : this._joyMoveZ;
    this._joystickEl.setAttribute('aria-valuenow', String(Math.round(dominantAxis * 100)));
  }

  _resetJoystick() {
    this._joyMoveX = 0;
    this._joyMoveZ = 0;
    this._setKnobOffset(0, 0);
    if (this._joystickEl) {
      this._joystickEl.setAttribute('aria-valuenow', '0');
    }
  }

  _setKnobOffset(ox, oy) {
    if (!this._joystickKnobEl) return;
    this._joystickKnobEl.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
  }

  _bindKeyboardListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (ev) => {
      const code = ev.code || '';
      const screen = this._getUiScreen();

      if (code === 'KeyM' && !ev.repeat) {
        if (this._onToggleMute) this._onToggleMute();
        return;
      }

      if ((code === 'Escape' || code === 'KeyP') && !ev.repeat) {
        if (screen === 'playing' || screen === 'paused') {
          ev.preventDefault();
          if (this._onTogglePause) this._onTogglePause();
          return;
        }
      }

      if (screen !== 'playing') return;

      if (GAME_PREVENT_KEYS.has(code) || (code === 'Enter' && this._p2Enabled)) {
        ev.preventDefault();
      }

      this._heldKeys.add(code);

      if (ev.repeat) return;

      if (this._p2Enabled) {
        // 2P shared-keyboard layout:
        // P1: WASD + Space + ShiftLeft/KeyE/KeyQ
        // P2: Arrows + Enter/Numpad0 + ShiftRight/Slash
        if (code === 'Space') {
          this._hwLatches.p1.dropBubble = true;
        } else if (code === 'ShiftLeft' || code === 'KeyE' || code === 'KeyQ') {
          this._hwLatches.p1.useItem = true;
        } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Numpad0') {
          this._hwLatches.p2.dropBubble = true;
        } else if (code === 'ShiftRight' || code === 'Slash') {
          this._hwLatches.p2.useItem = true;
        }
      } else {
        // 1P desktop layout: WASD or Arrows + Space + Shift/E/Q
        if (code === 'Space') {
          this._hwLatches.p1.dropBubble = true;
        } else if (
          code === 'ShiftLeft' ||
          code === 'ShiftRight' ||
          code === 'KeyE' ||
          code === 'KeyQ'
        ) {
          this._hwLatches.p1.useItem = true;
        }
      }
    });

    window.addEventListener('keyup', (ev) => {
      const code = ev.code || '';
      this._heldKeys.delete(code);
    });

    window.addEventListener('blur', () => {
      this.releaseAllActiveInputs();
    });

    window.addEventListener('contextmenu', () => {
      this.releaseAllActiveInputs();
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || document.visibilityState === 'hidden') {
          this.releaseAllActiveInputs();
        }
      });
    }
  }

  /**
   * Feeds programmatic input from window.__QQTANG__.setPlayerInput(slot, intent).
   */
  setProgrammaticInput(slot, intent = {}) {
    if (slot !== 'p1' && slot !== 'p2') return;
    const cur = this._programmatic[slot];
    if (intent.moveX !== undefined) {
      cur.moveX = clampUnit(intent.moveX);
      cur.hasMove = true;
    }
    if (intent.moveZ !== undefined) {
      cur.moveZ = clampUnit(intent.moveZ);
      cur.hasMove = true;
    }
    if (intent.dropBubble !== undefined || intent.dropBubbleEdge !== undefined) {
      cur.dropBubble = Boolean(intent.dropBubble || intent.dropBubbleEdge);
    }
    if (intent.useItem !== undefined || intent.useItemEdge !== undefined) {
      cur.useItem = Boolean(intent.useItem || intent.useItemEdge);
    }
  }

  _computeHardwareAxes() {
    let p1x = 0;
    let p1z = 0;
    let p2x = 0;
    let p2z = 0;

    if (this._heldKeys.has('KeyA')) p1x -= 1;
    if (this._heldKeys.has('KeyD')) p1x += 1;
    if (this._heldKeys.has('KeyW')) p1z -= 1;
    if (this._heldKeys.has('KeyS')) p1z += 1;

    if (this._p2Enabled) {
      if (this._heldKeys.has('ArrowLeft')) p2x -= 1;
      if (this._heldKeys.has('ArrowRight')) p2x += 1;
      if (this._heldKeys.has('ArrowUp')) p2z -= 1;
      if (this._heldKeys.has('ArrowDown')) p2z += 1;
    } else {
      if (this._heldKeys.has('ArrowLeft')) p1x -= 1;
      if (this._heldKeys.has('ArrowRight')) p1x += 1;
      if (this._heldKeys.has('ArrowUp')) p1z -= 1;
      if (this._heldKeys.has('ArrowDown')) p1z += 1;
    }

    if (Math.abs(this._joyMoveX) > 0.01 || Math.abs(this._joyMoveZ) > 0.01) {
      p1x = this._joyMoveX;
      p1z = this._joyMoveZ;
    }

    return {
      p1: { moveX: clampUnit(p1x), moveZ: clampUnit(p1z) },
      p2: { moveX: clampUnit(p2x), moveZ: clampUnit(p2z) },
    };
  }

  /**
   * Produces merged intents for one simulation tick and clears one-shot action edges.
   */
  consumeFrameIntents(p2Enabled = false) {
    this._p2Enabled = Boolean(p2Enabled);
    const hw = this._computeHardwareAxes();
    const out = { p1: null, p2: null };

    for (const slot of ['p1', 'p2']) {
      if (slot === 'p2' && !this._p2Enabled) continue;

      const hwAxis = hw[slot];
      const hwMoving = Math.abs(hwAxis.moveX) > 0.001 || Math.abs(hwAxis.moveZ) > 0.001;
      const prog = this._programmatic[slot];
      const latch = this._hwLatches[slot];

      let moveX = 0;
      let moveZ = 0;
      let shouldApply = false;

      if (hwMoving) {
        moveX = hwAxis.moveX;
        moveZ = hwAxis.moveZ;
        this._wasHwMoveActive[slot] = true;
        prog.hasMove = false;
        shouldApply = true;
      } else if (this._wasHwMoveActive[slot]) {
        moveX = 0;
        moveZ = 0;
        this._wasHwMoveActive[slot] = false;
        shouldApply = true;
      } else if (prog.hasMove) {
        moveX = prog.moveX;
        moveZ = prog.moveZ;
        shouldApply = true;
      }

      const dropBubble = Boolean(latch.dropBubble || prog.dropBubble);
      const useItem = Boolean(latch.useItem || prog.useItem);

      if (dropBubble || useItem) {
        shouldApply = true;
      }

      latch.dropBubble = false;
      latch.useItem = false;
      prog.dropBubble = false;
      prog.useItem = false;

      if (shouldApply) {
        out[slot] = { moveX, moveZ, dropBubble, useItem };
      }
    }

    return out;
  }
}
