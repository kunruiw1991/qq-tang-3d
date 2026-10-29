/**
 * Icon-first Kid-Friendly UI Screens & Strict <= 5-Control Active HUD Manager
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Screens:
 *  - 'title'   : Candy-glossy Title badge + Play button ([data-testid="btn-play"]) + Quick Start ([data-testid="btn-quick-start"])
 *  - 'select'  : Visual Character (4), Arena (4), Mode (3), 1P/2P toggle & GO button
 *  - 'playing' : Strictly <= 5 clickable controls (>=68x68px, 0 overlap) + non-interactive status strip,
 *                big team stock hearts, 3-2-1-GO countdown banner, and floating combat text popups
 *  - 'paused'  : Resume / Restart / Quit-to-Select modal
 *  - 'podium'  : Top/bottom framed Victory Podium overlay showing hearts/KOs/rescues as big icons & primary "再来一局" CTA
 */

import {
  ARENA_IDS,
  ARENA_METADATA,
  BUN_WIN_SCORE,
  CHARACTER_IDS,
  CHARACTER_METADATA,
  EVENT_TYPES,
  MODE_IDS,
  MODE_METADATA,
  P1_MARKER_DURATION_SEC,
  PLAYER_STATES,
  SCREEN_IDS,
  TEST_IDS,
  TRAP_DURATION_SEC,
  tileToWorldX,
  tileToWorldZ,
} from '../contracts/constants.js';
import {
  ARENA_ILLUSTRATIONS,
  CHARACTER_PORTRAITS,
  MODE_ILLUSTRATIONS,
  UI_ICONS,
} from './icons.js';

function formatClock(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function buildStatDots(count, maxShown, dotClass) {
  let html = '';
  const n = Math.max(1, Math.min(maxShown, Math.round(count)));
  for (let i = 0; i < n; i += 1) {
    html += `<span class="stat-dot ${dotClass}"></span>`;
  }
  return html;
}

function renderHeartIcons(lives, maxLives = 3) {
  const aliveCount = Math.max(0, Math.min(maxLives, Math.round(Number(lives) || 0)));
  const lostCount = Math.max(0, maxLives - aliveCount);
  return '❤️'.repeat(aliveCount) + '🖤'.repeat(lostCount);
}

export class HudScreens {
  /**
   * @param {HTMLElement} rootEl
   * @param {object} callbacks
   */
  constructor(rootEl, callbacks = {}) {
    this._root = rootEl;
    this._cb = callbacks;
    this._currentScreen = SCREEN_IDS.TITLE;
    this._els = {};
    this._activePopups = [];
    this._nextPopupId = 1;

    this._renderStaticDom();
    this._bindEvents();
  }

  _renderStaticDom() {
    const charCardsHtml = CHARACTER_IDS.map((cid) => {
      const meta = CHARACTER_METADATA[cid];
      const speedPips = Math.max(1, Math.round((meta.startSpeed - 4.4) * 2.5));
      return `
        <button
          type="button"
          class="picker-card char-card"
          data-testid="${TEST_IDS.CHAR_CARDS[cid]}"
          data-char-id="${cid}"
          style="--card-accent: ${meta.primaryHex};"
          aria-label="${meta.nameZh} ${meta.nameEn}"
        >
          <span class="card-art char-art">${CHARACTER_PORTRAITS[cid]}</span>
          <span class="card-title">${meta.nameZh}</span>
          <span class="card-stat-row" aria-hidden="true">
            ${buildStatDots(meta.startBubbles, 3, 'dot-bubble')}
            ${buildStatDots(meta.startPower, 3, 'dot-power')}
            ${buildStatDots(speedPips, 3, 'dot-speed')}
          </span>
        </button>
      `;
    }).join('');

    const arenaCardsHtml = ARENA_IDS.map((aid) => {
      const meta = ARENA_METADATA[aid];
      return `
        <button
          type="button"
          class="picker-card arena-card"
          data-testid="${TEST_IDS.ARENA_CARDS[aid]}"
          data-arena-id="${aid}"
          style="--card-accent: ${meta.wallHex};"
          aria-label="${meta.nameZh} ${meta.nameEn}"
        >
          <span class="card-art arena-art">${ARENA_ILLUSTRATIONS[aid]}</span>
          <span class="card-title">${meta.nameZh}</span>
        </button>
      `;
    }).join('');

    const modeCardsHtml = MODE_IDS.map((mid) => {
      const meta = MODE_METADATA[mid];
      return `
        <button
          type="button"
          class="picker-card mode-card"
          data-testid="${TEST_IDS.MODE_CARDS[mid]}"
          data-mode-id="${mid}"
          style="--card-accent: ${meta.accentHex};"
          aria-label="${meta.nameZh} ${meta.nameEn}"
        >
          <span class="card-art mode-art">${MODE_ILLUSTRATIONS[mid]}</span>
          <span class="card-title">${meta.nameZh}</span>
        </button>
      `;
    }).join('');

    this._root.innerHTML = `
      <!-- 1. TITLE SCREEN -->
      <section class="ui-screen screen-title" data-screen="title">
        <div class="title-hero-banner">
          <div class="title-emblem">${UI_ICONS.logoBubbleBadge}</div>
          <div class="title-wordmark">
            <div class="title-zh">QQ堂 3D</div>
            <div class="title-sub">CANDY BUBBLE ARENA</div>
          </div>
        </div>

        <div class="title-actions-row">
          <button
            type="button"
            class="candy-btn btn-giant-play"
            data-testid="${TEST_IDS.BTN_PLAY}"
            aria-label="Play QQ Tang 3D"
          >
            <span class="btn-svg">${UI_ICONS.playBig}</span>
            <span class="btn-label">PLAY · 开始</span>
          </button>

          <button
            type="button"
            class="candy-btn btn-quick-start"
            data-testid="${TEST_IDS.BTN_QUICK_START}"
            aria-label="Quick Start Classic Candy Town MiDuo"
          >
            <span class="btn-svg">${UI_ICONS.playBig}</span>
            <span class="btn-label">⚡ 快速开始</span>
          </button>
        </div>
      </section>

      <!-- 2. SELECT SCREEN -->
      <section class="ui-screen screen-select" data-screen="select" hidden>
        <div class="select-shell">
          <div class="select-grid-column">
            <div class="picker-group">
              <div class="picker-row picker-row-4">${charCardsHtml}</div>
            </div>
            <div class="picker-group">
              <div class="picker-row picker-row-4">${arenaCardsHtml}</div>
            </div>
            <div class="picker-group">
              <div class="picker-row picker-row-3">${modeCardsHtml}</div>
            </div>
          </div>

          <div class="select-action-bar">
            <button
              type="button"
              class="candy-btn btn-difficulty-toggle"
              data-testid="${TEST_IDS.BTN_TOGGLE_DIFFICULTY}"
              aria-pressed="false"
              aria-label="Toggle Bot Difficulty Easy or Normal"
            >
              <span class="btn-label" data-role="difficulty-label">🤖 电脑: 简单</span>
            </button>

            <button
              type="button"
              class="candy-btn btn-2p-toggle"
              data-testid="${TEST_IDS.BTN_TOGGLE_2P}"
              aria-pressed="false"
              aria-label="Toggle 1P or 2P Keyboard"
            >
              <span class="btn-svg" data-role="2p-icon">${UI_ICONS.players1P}</span>
              <span class="btn-label" data-role="2p-label">1P</span>
            </button>

            <button
              type="button"
              class="candy-btn btn-start-go"
              data-testid="${TEST_IDS.BTN_START_MATCH}"
              aria-label="Start Match"
            >
              <span class="btn-svg">${UI_ICONS.playBig}</span>
              <span class="btn-label">GO! 出发</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 3. ACTIVE GAMEPLAY HUD (STRICTLY <= 5 CLICKABLE CONTROLS, ALL >= 68x68px) -->
      <section class="ui-screen screen-playing" data-screen="playing" hidden>
        <!-- Non-interactive status strip (pointer-events: none, zero interactive elements) -->
        <div class="hud-status-strip">
          <div class="hud-pill hud-clock-pill">
            <span class="hud-clock-text" data-role="clock-text">2:00</span>
          </div>

          <div class="hud-pill hud-p1-pill">
            <span class="hud-mini-avatar" data-role="p1-avatar">${CHARACTER_PORTRAITS.miduo}</span>
            <span class="hud-stat-chips" data-role="p1-stats"></span>
          </div>

          <div class="hud-pill hud-mode-pill" data-role="mode-status"></div>
        </div>

        <!-- Non-interactive 3-2-1-GO Countdown & 1-line Control Hint Banner -->
        <div class="hud-countdown-banner" data-testid="hud-countdown" data-role="countdown-overlay" hidden aria-hidden="true">
          <div class="countdown-number" data-role="countdown-number">3</div>
          <div class="countdown-hint" data-role="countdown-hint">WASD/摇杆 · 空格/🫧</div>
        </div>

        <!-- Non-interactive >=48px Bouncing "你 · 角色名 ▼" P1 Marker (5s) -->
        <div class="hud-p1-you-marker" data-testid="${TEST_IDS.HUD_P1_MARKER}" data-role="p1-you-marker" hidden aria-hidden="true">
          <span class="p1-marker-name" data-role="p1-marker-name">你 · 米多</span>
          <span class="p1-marker-arrow">▼</span>
        </div>

        <!-- Non-interactive Trapped Onboarding Hint & Shrinking Ring Timer -->
        <div class="hud-trapped-onboarding" data-testid="${TEST_IDS.HUD_TRAPPED_HINT}" data-role="trapped-onboarding" hidden aria-hidden="true">
          <div class="trapped-bubble-ring" data-testid="${TEST_IDS.HUD_TRAPPED_RING}" data-role="trapped-ring"></div>
          <div class="trapped-hint-banner" data-role="trapped-banner">被困住了! 队友来救 / 🪡 用针</div>
        </div>

        <!-- Non-interactive Candy Rain Sudden Death Warning Stamp (1s before start) -->
        <div class="hud-candy-rain-stamp" data-testid="${TEST_IDS.HUD_CANDY_RAIN_STAMP}" data-role="candy-rain-stamp" hidden aria-hidden="true">
          ⚠️ 糖果雨来了!
        </div>

        <!-- Non-interactive Floating Combat Text Popups ("KO!", "救援!", "+1", "连爆×N!", "2×!") -->
        <div class="hud-floating-popups" data-testid="hud-popups" data-role="floating-popups" aria-hidden="true"></div>

        <!-- Control 1/5: Top-Left Pause / Home (>= 68x68px) -->
        <button
          type="button"
          class="hud-round-btn hud-pos-home"
          data-testid="${TEST_IDS.HUD_BTN_HOME}"
          aria-label="Pause Menu"
        >
          <span class="hud-svg">${UI_ICONS.homePause}</span>
        </button>

        <!-- Control 2/5: Top-Right Audio Mute/Unmute (>= 68x68px) -->
        <button
          type="button"
          class="hud-round-btn hud-pos-audio"
          data-testid="${TEST_IDS.HUD_BTN_AUDIO}"
          aria-label="Toggle Audio"
        >
          <span class="hud-svg" data-role="audio-icon">${UI_ICONS.audioOn}</span>
        </button>

        <!-- Control 3/5: Bottom-Left Unified Virtual Joystick (role="slider", 0 child buttons!) -->
        <div
          class="hud-joystick-pad"
          data-testid="${TEST_IDS.HUD_JOYSTICK}"
          role="slider"
          tabindex="0"
          aria-label="Move Character Joystick"
          aria-valuemin="-100"
          aria-valuemax="100"
          aria-valuenow="0"
        >
          <div class="joystick-base-svg">${UI_ICONS.joystickBase}</div>
          <div class="joystick-thumb-knob" data-role="joystick-knob"></div>
        </div>

        <!-- Control 4/5: Bottom-Right Secondary Item / Rescue Needle (>= 68x68px) -->
        <button
          type="button"
          class="hud-round-btn hud-pos-item"
          data-testid="${TEST_IDS.HUD_BTN_ITEM}"
          aria-label="Use Rescue Needle"
        >
          <span class="hud-svg">${UI_ICONS.hudNeedle}</span>
          <span class="hud-item-count" data-role="needle-count">0</span>
        </button>

        <!-- Control 5/5: Bottom-Right Primary Drop Sugar Bubble (>= 84x84px) -->
        <button
          type="button"
          class="hud-round-btn hud-pos-bubble"
          data-testid="${TEST_IDS.HUD_BTN_BUBBLE}"
          aria-label="Drop Sugar Bubble"
        >
          <span class="hud-svg">${UI_ICONS.hudBubble}</span>
          <span class="hud-bubble-quota" data-role="bubble-quota">1/1</span>
        </button>
      </section>

      <!-- 4. PAUSE OVERLAY -->
      <section class="ui-screen screen-paused" data-screen="paused" hidden>
        <div class="pause-card">
          <div class="pause-badge">PAUSED · 暂停</div>
          <div class="pause-actions">
            <button
              type="button"
              class="candy-btn pause-btn btn-resume-green"
              data-testid="${TEST_IDS.BTN_RESUME}"
              aria-label="Resume Match"
            >
              <span class="btn-svg">${UI_ICONS.playBig}</span>
              <span class="btn-label">继续</span>
            </button>
            <button
              type="button"
              class="candy-btn pause-btn btn-restart-amber"
              data-testid="${TEST_IDS.BTN_RESTART}"
              aria-label="Restart Match"
            >
              <span class="btn-svg">${UI_ICONS.restartLoop}</span>
              <span class="btn-label">重来</span>
            </button>
            <button
              type="button"
              class="candy-btn pause-btn btn-quit-blue"
              data-testid="${TEST_IDS.BTN_QUIT_SELECT}"
              aria-label="Back to Character Select"
            >
              <span class="btn-svg">${UI_ICONS.gridMenu}</span>
              <span class="btn-label">选人</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 5. VICTORY PODIUM OVERLAY (Top banner + bottom bar so center 3D Podium stays clear!) -->
      <section class="ui-screen screen-podium" data-screen="podium" hidden>
        <div class="podium-frame" data-testid="${TEST_IDS.PODIUM_OVERLAY}">
          <div class="podium-top-banner">
            <div class="podium-headline">
              <span class="podium-crown">${UI_ICONS.crownTrophy}</span>
              <span class="podium-title-text" data-role="podium-title">VICTORY! 胜利</span>
            </div>
            <div class="podium-rank-strip" data-role="podium-ranks"></div>
          </div>

          <div class="podium-bottom-bar">
            <button
              type="button"
              class="candy-btn podium-btn btn-again-green btn-primary-hero"
              data-testid="${TEST_IDS.BTN_PLAY_AGAIN}"
              aria-label="Play Again"
            >
              <span class="btn-svg">${UI_ICONS.restartLoop}</span>
              <span class="btn-label">再来一局</span>
            </button>

            <button
              type="button"
              class="candy-btn podium-btn btn-select-blue"
              data-testid="${TEST_IDS.BTN_BACK_SELECT}"
              aria-label="Back to Select"
            >
              <span class="btn-svg">${UI_ICONS.gridMenu}</span>
              <span class="btn-label">换角色</span>
            </button>
          </div>
        </div>
      </section>
    `;

    this._els = {
      screens: {
        title: this._root.querySelector('[data-screen="title"]'),
        select: this._root.querySelector('[data-screen="select"]'),
        playing: this._root.querySelector('[data-screen="playing"]'),
        paused: this._root.querySelector('[data-screen="paused"]'),
        podium: this._root.querySelector('[data-screen="podium"]'),
      },
      btnPlay: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_PLAY}"]`),
      btnQuickStart: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_QUICK_START}"]`),
      btnToggleDifficulty: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_TOGGLE_DIFFICULTY}"]`),
      difficultyLabel: this._root.querySelector('[data-role="difficulty-label"]'),
      btnToggle2P: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_TOGGLE_2P}"]`),
      toggle2PIcon: this._root.querySelector('[data-role="2p-icon"]'),
      toggle2PLabel: this._root.querySelector('[data-role="2p-label"]'),
      btnStartMatch: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_START_MATCH}"]`),
      charCards: Array.from(this._root.querySelectorAll('[data-char-id]')),
      arenaCards: Array.from(this._root.querySelectorAll('[data-arena-id]')),
      modeCards: Array.from(this._root.querySelectorAll('[data-mode-id]')),

      hudHome: this._root.querySelector(`[data-testid="${TEST_IDS.HUD_BTN_HOME}"]`),
      hudAudio: this._root.querySelector(`[data-testid="${TEST_IDS.HUD_BTN_AUDIO}"]`),
      audioIcon: this._root.querySelector('[data-role="audio-icon"]'),
      hudJoystick: this._root.querySelector(`[data-testid="${TEST_IDS.HUD_JOYSTICK}"]`),
      joystickKnob: this._root.querySelector('[data-role="joystick-knob"]'),
      hudItem: this._root.querySelector(`[data-testid="${TEST_IDS.HUD_BTN_ITEM}"]`),
      needleCount: this._root.querySelector('[data-role="needle-count"]'),
      hudBubble: this._root.querySelector(`[data-testid="${TEST_IDS.HUD_BTN_BUBBLE}"]`),
      bubbleQuota: this._root.querySelector('[data-role="bubble-quota"]'),

      clockText: this._root.querySelector('[data-role="clock-text"]'),
      p1Avatar: this._root.querySelector('[data-role="p1-avatar"]'),
      p1Stats: this._root.querySelector('[data-role="p1-stats"]'),
      modeStatus: this._root.querySelector('[data-role="mode-status"]'),
      countdownOverlay: this._root.querySelector('[data-role="countdown-overlay"]'),
      countdownNumber: this._root.querySelector('[data-role="countdown-number"]'),
      countdownHint: this._root.querySelector('[data-role="countdown-hint"]'),
      p1YouMarker: this._root.querySelector('[data-role="p1-you-marker"]'),
      p1MarkerName: this._root.querySelector('[data-role="p1-marker-name"]'),
      trappedOnboarding: this._root.querySelector('[data-role="trapped-onboarding"]'),
      trappedRing: this._root.querySelector('[data-role="trapped-ring"]'),
      trappedBanner: this._root.querySelector('[data-role="trapped-banner"]'),
      candyRainStamp: this._root.querySelector('[data-role="candy-rain-stamp"]'),
      floatingPopups: this._root.querySelector('[data-role="floating-popups"]'),

      btnResume: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_RESUME}"]`),
      btnRestart: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_RESTART}"]`),
      btnQuitSelect: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_QUIT_SELECT}"]`),

      podiumTitle: this._root.querySelector('[data-role="podium-title"]'),
      podiumRanks: this._root.querySelector('[data-role="podium-ranks"]'),
      btnPlayAgain: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_PLAY_AGAIN}"]`),
      btnBackSelect: this._root.querySelector(`[data-testid="${TEST_IDS.BTN_BACK_SELECT}"]`),
    };
  }

  _bindEvents() {
    const safeBlur = (el) => {
      if (el && typeof el.blur === 'function') el.blur();
    };

    this._els.btnPlay.addEventListener('click', () => {
      safeBlur(this._els.btnPlay);
      this._cb.onOpenSelect?.();
    });

    if (this._els.btnQuickStart) {
      this._els.btnQuickStart.addEventListener('click', () => {
        safeBlur(this._els.btnQuickStart);
        this._cb.onQuickStartClick?.();
      });
    }

    for (const card of this._els.charCards) {
      card.addEventListener('click', () => {
        safeBlur(card);
        this._cb.onSelectCharacter?.(card.getAttribute('data-char-id'));
      });
    }

    for (const card of this._els.arenaCards) {
      card.addEventListener('click', () => {
        safeBlur(card);
        this._cb.onSelectArena?.(card.getAttribute('data-arena-id'));
      });
    }

    for (const card of this._els.modeCards) {
      card.addEventListener('click', () => {
        safeBlur(card);
        this._cb.onSelectMode?.(card.getAttribute('data-mode-id'));
      });
    }

    if (this._els.btnToggleDifficulty) {
      this._els.btnToggleDifficulty.addEventListener('click', () => {
        safeBlur(this._els.btnToggleDifficulty);
        this._cb.onToggleDifficulty?.();
      });
    }

    this._els.btnToggle2P.addEventListener('click', () => {
      safeBlur(this._els.btnToggle2P);
      this._cb.onToggle2P?.();
    });

    this._els.btnStartMatch.addEventListener('click', () => {
      safeBlur(this._els.btnStartMatch);
      this._cb.onStartMatchClick?.();
    });

    this._els.hudHome.addEventListener('click', () => {
      safeBlur(this._els.hudHome);
      this._cb.onPauseClick?.();
    });

    this._els.hudAudio.addEventListener('click', () => {
      safeBlur(this._els.hudAudio);
      this._cb.onToggleAudioClick?.();
    });

    this._els.btnResume.addEventListener('click', () => {
      safeBlur(this._els.btnResume);
      this._cb.onResumeClick?.();
    });

    this._els.btnRestart.addEventListener('click', () => {
      safeBlur(this._els.btnRestart);
      this._cb.onRestartClick?.();
    });

    this._els.btnQuitSelect.addEventListener('click', () => {
      safeBlur(this._els.btnQuitSelect);
      this._cb.onQuitToSelectClick?.();
    });

    this._els.btnPlayAgain.addEventListener('click', () => {
      safeBlur(this._els.btnPlayAgain);
      this._cb.onPlayAgainClick?.();
    });

    this._els.btnBackSelect.addEventListener('click', () => {
      safeBlur(this._els.btnBackSelect);
      this._cb.onBackToSelectClick?.();
    });
  }

  getHudInputTargets() {
    return {
      joystickEl: this._els.hudJoystick,
      joystickKnobEl: this._els.joystickKnob,
      bubbleBtnEl: this._els.hudBubble,
      itemBtnEl: this._els.hudItem,
    };
  }

  setScreen(screenId) {
    this._currentScreen = screenId;
    for (const [id, el] of Object.entries(this._els.screens)) {
      if (!el) continue;
      const active = id === screenId;
      el.hidden = !active;
      el.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
  }

  syncSelectedConfig(config) {
    for (const card of this._els.charCards) {
      const active = card.getAttribute('data-char-id') === config.p1CharacterId;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    for (const card of this._els.arenaCards) {
      const active = card.getAttribute('data-arena-id') === config.arenaId;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    for (const card of this._els.modeCards) {
      const active = card.getAttribute('data-mode-id') === config.modeId;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    const p2 = Boolean(config.p2Enabled);
    this._els.btnToggle2P.classList.toggle('is-active-2p', p2);
    this._els.btnToggle2P.setAttribute('aria-pressed', p2 ? 'true' : 'false');
    this._els.toggle2PIcon.innerHTML = p2 ? UI_ICONS.players2P : UI_ICONS.players1P;
    this._els.toggle2PLabel.textContent = p2 ? '2P' : '1P';

    if (this._els.btnToggleDifficulty && this._els.difficultyLabel) {
      const isNormal = config.difficulty === 'normal';
      this._els.btnToggleDifficulty.classList.toggle('is-normal-diff', isNormal);
      this._els.btnToggleDifficulty.setAttribute('aria-pressed', isNormal ? 'true' : 'false');
      this._els.difficultyLabel.textContent = isNormal ? '🤖 电脑: 普通' : '🤖 电脑: 简单';
    }
  }

  syncAudioMuted(muted) {
    const isMuted = Boolean(muted);
    if (this._lastAudioMuted === isMuted) return;
    this._lastAudioMuted = isMuted;
    this._els.audioIcon.innerHTML = isMuted ? UI_ICONS.audioOff : UI_ICONS.audioOn;
    this._els.hudAudio.classList.toggle('is-muted', isMuted);
  }

  /**
   * Updates the 3-2-1-GO (1.5s total) countdown banner and control hint.
   * @param {number} remainingSec
   */
  updateCountdown(remainingSec = 0) {
    const overlay = this._els.countdownOverlay;
    if (!overlay) return;
    const rem = Number(remainingSec) || 0;
    if (rem <= 0) {
      if (!overlay.hidden) {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    if (overlay.hidden) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
    }

    let label = 'GO!';
    if (rem > 1.05) label = '3';
    else if (rem > 0.60) label = '2';
    else if (rem > 0.18) label = '1';

    if (this._els.countdownNumber && this._els.countdownNumber.textContent !== label) {
      this._els.countdownNumber.textContent = label;
    }
  }

  /**
   * Clears all floating combat text popups (e.g. on match reset).
   */
  clearFloatingPopups() {
    this._activePopups = [];
    if (this._els.floatingPopups) {
      this._els.floatingPopups.innerHTML = '';
    }
  }

  /**
   * Spawns a floating 3D/DOM text popup ("KO!", "救援!", "+1", "连爆×N!", "2×!") that scales up & fades over 0.9s.
   */
  spawnFloatingPopup({ text, worldX = 0, worldZ = 0, variant = 'ko', projectFn = null }) {
    if (!this._els.floatingPopups || !text) return null;
    const el = document.createElement('div');
    el.className = `floating-combat-popup popup-${variant}`;
    el.textContent = text;
    this._els.floatingPopups.appendChild(el);

    const pt =
      typeof projectFn === 'function'
        ? projectFn(worldX, 1.35, worldZ)
        : { x: 640, y: 360 };

    const entry = {
      id: this._nextPopupId++,
      text,
      variant,
      worldX,
      worldZ,
      screenX: pt.x,
      screenY: pt.y,
      ageSec: 0,
      durationSec: 0.9,
      el,
    };
    this._activePopups.push(entry);
    this._applyPopupStyle(entry);
    return entry;
  }

  _applyPopupStyle(p) {
    const progress = Math.max(0, Math.min(1, p.ageSec / p.durationSec));
    const liftY = progress * 48;
    const scale =
      progress < 0.22
        ? 0.68 + (progress / 0.22) * 0.62
        : 1.30 - ((progress - 0.22) / 0.78) * 0.22;
    const opacity = progress < 0.68 ? 1.0 : Math.max(0, 1.0 - (progress - 0.68) / 0.32);

    p.el.style.left = `${Math.round(p.screenX)}px`;
    p.el.style.top = `${Math.round(p.screenY - liftY)}px`;
    p.el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    p.el.style.opacity = opacity.toFixed(3);
  }

  /**
   * Consumes simulation events to spawn floating "KO!", "救援!", "+1", "连爆×N!", and "2×!" popups.
   */
  consumeCombatEventsForPopups(events, players = [], projectFn = null) {
    if (!Array.isArray(events) || events.length === 0) return;

    const findPlayerWorld = (pid) => {
      const p = players.find((pl) => pl.id === pid);
      return p ? [tileToWorldX(p.x), tileToWorldZ(p.z)] : null;
    };

    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (!ev || !ev.type) continue;

      if (ev.type === EVENT_TYPES.POP) {
        const pos = findPlayerWorld(ev.victimId) || [
          tileToWorldX((ev.col ?? 7) + 0.5),
          tileToWorldZ((ev.row ?? 6) + 0.5),
        ];
        this.spawnFloatingPopup({
          text: 'KO!',
          worldX: pos[0],
          worldZ: pos[1],
          variant: 'ko',
          projectFn,
        });
      } else if (ev.type === EVENT_TYPES.RESCUE || ev.type === EVENT_TYPES.NEEDLE_RESCUE) {
        const pos = findPlayerWorld(ev.playerId || ev.victimId) || [0, 0];
        this.spawnFloatingPopup({
          text: '救援!',
          worldX: pos[0],
          worldZ: pos[1],
          variant: 'rescue',
          projectFn,
        });
      } else if (
        ev.type === EVENT_TYPES.PICKUP ||
        ev.type === EVENT_TYPES.BUN_PICKUP ||
        ev.type === EVENT_TYPES.BUN_SCORE
      ) {
        const pos = findPlayerWorld(ev.playerId) || [
          tileToWorldX((ev.col ?? 7) + 0.5),
          tileToWorldZ((ev.row ?? 6) + 0.5),
        ];
        this.spawnFloatingPopup({
          text: '+1',
          worldX: pos[0],
          worldZ: pos[1],
          variant: 'plus',
          projectFn,
        });
      } else if (ev.type === EVENT_TYPES.CHAIN_EXPLODE) {
        const n = Math.max(2, Number(ev.chainCount) || 2);
        this.spawnFloatingPopup({
          text: `连爆×${n}!`,
          worldX: tileToWorldX((ev.col ?? 7) + 0.5),
          worldZ: tileToWorldZ((ev.row ?? 6) + 0.5),
          variant: 'chain',
          projectFn,
        });
      } else if (ev.type === EVENT_TYPES.BOSS_HIT && ev.isHumanHit) {
        this.spawnFloatingPopup({
          text: '2×!',
          worldX: tileToWorldX((ev.col ?? 7) + 0.5),
          worldZ: tileToWorldZ((ev.row ?? 6) + 0.5),
          variant: 'boss2x',
          projectFn,
        });
      }
    }
  }

  /**
   * Advances active floating popups by `dtSec` and removes expired ones after 0.9s.
   */
  stepFloatingPopups(dtSec = 1 / 60, projectFn = null) {
    const dt = Math.max(0, Math.min(Number(dtSec) || 0, 0.25));
    for (let i = this._activePopups.length - 1; i >= 0; i -= 1) {
      const p = this._activePopups[i];
      p.ageSec += dt;
      if (p.ageSec >= p.durationSec) {
        if (p.el && p.el.parentElement) {
          p.el.parentElement.removeChild(p.el);
        }
        this._activePopups.splice(i, 1);
        continue;
      }
      if (typeof projectFn === 'function') {
        const pt = projectFn(p.worldX, 1.35, p.worldZ);
        p.screenX = pt.x;
        p.screenY = pt.y;
      }
      this._applyPopupStyle(p);
    }
  }

  getActivePopups() {
    return this._activePopups.map((p) => ({
      id: p.id,
      text: p.text,
      variant: p.variant,
      screenX: p.screenX,
      screenY: p.screenY,
      ageSec: +p.ageSec.toFixed(3),
    }));
  }

  updateHud(simSnapshot, muted = false, projectFn = null) {
    this.syncAudioMuted(muted);
    if (!simSnapshot) return;

    const clockStr = formatClock(simSnapshot.timeRemainingSec);
    if (this._lastClockStr !== clockStr) {
      this._lastClockStr = clockStr;
      this._els.clockText.textContent = clockStr;
    }

    const matchElapsedSec = Math.max(0, (Number(simSnapshot.tick) || 0) / 60);
    const p1 =
      simSnapshot.players.find((p) => p.id === 'p1') || simSnapshot.players[0] || null;
    if (p1) {
      if (this._lastAvatarCharId !== p1.characterId) {
        this._lastAvatarCharId = p1.characterId;
        this._els.p1Avatar.innerHTML =
          CHARACTER_PORTRAITS[p1.characterId] || CHARACTER_PORTRAITS.miduo;
      }

      // 1. >=48px Bouncing "你 · 角色名 ▼" P1 Marker for the first 5.0 seconds
      if (this._els.p1YouMarker) {
        const showMarker =
          p1.state !== PLAYER_STATES.ELIMINATED && matchElapsedSec <= P1_MARKER_DURATION_SEC;
        if (showMarker) {
          if (this._els.p1YouMarker.hidden) {
            this._els.p1YouMarker.hidden = false;
            this._els.p1YouMarker.setAttribute('aria-hidden', 'false');
          }
          const charNameZh = CHARACTER_METADATA[p1.characterId]?.nameZh || '米多';
          const markerText = `你 · ${charNameZh}`;
          if (this._els.p1MarkerName && this._els.p1MarkerName.textContent !== markerText) {
            this._els.p1MarkerName.textContent = markerText;
          }
          const pt =
            typeof projectFn === 'function'
              ? projectFn(tileToWorldX(p1.x), 1.95, tileToWorldZ(p1.z))
              : { x: 640, y: 320 };
          const bouncePx = Math.round(Math.abs(Math.sin(matchElapsedSec * 8.5)) * 12);
          const clampedX = Math.max(80, Math.min((window.innerWidth || 1280) - 80, pt.x));
          const clampedY = Math.max(96, Math.min((window.innerHeight || 800) - 60, pt.y));
          this._els.p1YouMarker.style.left = `${clampedX}px`;
          this._els.p1YouMarker.style.top = `${clampedY - bouncePx}px`;
        } else if (!this._els.p1YouMarker.hidden) {
          this._els.p1YouMarker.hidden = true;
          this._els.p1YouMarker.setAttribute('aria-hidden', 'true');
        }
      }

      // 2. Trapped Onboarding ("被困住了! 队友来救 / 🪡 用针" + shrinking ring timer around P1's bubble)
      if (this._els.trappedOnboarding) {
        const isTrapped = p1.state === PLAYER_STATES.TRAPPED;
        if (isTrapped) {
          if (this._els.trappedOnboarding.hidden) {
            this._els.trappedOnboarding.hidden = false;
            this._els.trappedOnboarding.setAttribute('aria-hidden', 'false');
          }
          const pt =
            typeof projectFn === 'function'
              ? projectFn(tileToWorldX(p1.x), 0.72, tileToWorldZ(p1.z))
              : { x: 640, y: 400 };
          const ringScale = Math.max(
            0.20,
            Math.min(1.0, (Number(p1.trapTimer) || 0) / TRAP_DURATION_SEC)
          );
          if (this._els.trappedRing) {
            this._els.trappedRing.style.left = `${pt.x}px`;
            this._els.trappedRing.style.top = `${pt.y}px`;
            this._els.trappedRing.style.transform = `translate(-50%, -50%) scale(${ringScale.toFixed(3)})`;
            this._els.trappedRing.setAttribute('data-scale', ringScale.toFixed(3));
          }
          if (this._els.trappedBanner) {
            const bx = Math.max(150, Math.min((window.innerWidth || 1280) - 150, pt.x));
            const by = Math.max(86, Math.min((window.innerHeight || 800) - 110, pt.y - 72));
            this._els.trappedBanner.style.left = `${bx}px`;
            this._els.trappedBanner.style.top = `${by}px`;
          }
        } else if (!this._els.trappedOnboarding.hidden) {
          this._els.trappedOnboarding.hidden = true;
          this._els.trappedOnboarding.setAttribute('aria-hidden', 'true');
        }
      }

      const freeBubbles = Math.max(0, p1.maxBubbles - p1.activeBubbles);
      const quotaStr = `${freeBubbles}/${p1.maxBubbles}`;
      if (this._lastQuotaStr !== quotaStr) {
        this._lastQuotaStr = quotaStr;
        this._els.bubbleQuota.textContent = quotaStr;
      }

      const needleStr = String(p1.needles || 0);
      if (this._lastNeedleStr !== needleStr) {
        this._lastNeedleStr = needleStr;
        this._els.needleCount.textContent = needleStr;
      }

      const urgentRescue = p1.state === PLAYER_STATES.TRAPPED && p1.needles > 0;
      const hasItem = (p1.needles || 0) > 0;
      if (this._lastUrgentRescue !== urgentRescue) {
        this._lastUrgentRescue = urgentRescue;
        this._els.hudItem.classList.toggle('is-urgent-pulse', urgentRescue);
      }
      if (this._lastHasItem !== hasItem) {
        this._lastHasItem = hasItem;
        this._els.hudItem.classList.toggle('has-item', hasItem);
      }

      const mountTag =
        p1.mount === 'ufo' ? '🛸' : p1.mount === 'turtle' ? '🐢' : '';
      const shieldTag = p1.hasShield ? '🛡️' : '';
      const kickTag = p1.canKick ? '👟' : '';
      const statsStr = `🫧${p1.maxBubbles} 🔥${p1.blastRange} ${mountTag}${shieldTag}${kickTag}`.trim();
      if (this._lastStatsStr !== statsStr) {
        this._lastStatsStr = statsStr;
        this._els.p1Stats.textContent = statsStr;
      }
    }

    let modeStatusHtml = '';
    if (simSnapshot.modeId === 'boss_golem' && simSnapshot.boss) {
      const b = simSnapshot.boss;
      const pct = Math.max(0, Math.min(100, Math.round((b.hp / Math.max(1, b.maxHp)) * 100)));
      modeStatusHtml = `
        <span class="boss-label">🤖 ${b.hp}/${b.maxHp}</span>
        <span class="boss-hp-track"><span class="boss-hp-fill" style="width:${pct}%"></span></span>
        <span class="coop-lives"><span class="hud-hearts-big">${renderHeartIcons(simSnapshot.teamLives, 4)}</span> ${simSnapshot.teamLives}</span>
      `;
    } else if (simSnapshot.modeId === 'bun_grab') {
      modeStatusHtml = `
        <span class="score-chip team-blue">🔵 🥟 ${simSnapshot.teamScores.blue}/${BUN_WIN_SCORE}</span>
        <span class="score-chip team-red">🔴 🥟 ${simSnapshot.teamScores.red}/${BUN_WIN_SCORE}</span>
      `;
    } else {
      const blueHearts = Math.max(0, simSnapshot.teamStockLives?.blue ?? 3);
      const redHearts = Math.max(0, simSnapshot.teamStockLives?.red ?? 3);
      const warningOrActive = Boolean(
        simSnapshot.candyRainWarningActive || simSnapshot.suddenDeathActive
      );
      const suddenTag = warningOrActive
        ? '<span class="sudden-death-pill">⚠️ 糖果雨来了!</span>'
        : '';
      if (this._els.candyRainStamp) {
        const showStamp =
          warningOrActive && Number(simSnapshot.timeRemainingSec) >= 20.0;
        if (showStamp && this._els.candyRainStamp.hidden) {
          this._els.candyRainStamp.hidden = false;
          this._els.candyRainStamp.setAttribute('aria-hidden', 'false');
        } else if (!showStamp && !this._els.candyRainStamp.hidden) {
          this._els.candyRainStamp.hidden = true;
          this._els.candyRainStamp.setAttribute('aria-hidden', 'true');
        }
      }
      modeStatusHtml = `
        <span class="score-chip team-blue" data-role="blue-hearts">🔵 <span class="hud-hearts-big">${renderHeartIcons(blueHearts, 3)}</span> <b>${blueHearts}</b></span>
        <span class="score-chip team-red" data-role="red-hearts">🔴 <span class="hud-hearts-big">${renderHeartIcons(redHearts, 3)}</span> <b>${redHearts}</b></span>
        ${suddenTag}
      `;
    }
    if (simSnapshot.modeId !== 'classic_2v2' && this._els.candyRainStamp && !this._els.candyRainStamp.hidden) {
      this._els.candyRainStamp.hidden = true;
      this._els.candyRainStamp.setAttribute('aria-hidden', 'true');
    }
    if (this._lastModeStatusHtml !== modeStatusHtml) {
      this._lastModeStatusHtml = modeStatusHtml;
      this._els.modeStatus.innerHTML = modeStatusHtml;
    }
  }

  updatePodium(simSnapshot) {
    if (!simSnapshot) return;
    if (simSnapshot.phase === 'victory') {
      this._els.podiumTitle.textContent = 'VICTORY! 胜利';
    } else if (simSnapshot.phase === 'defeat') {
      this._els.podiumTitle.textContent = 'FINISH! 结算';
    } else {
      this._els.podiumTitle.textContent = 'DRAW! 平局';
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    const rankings = Array.isArray(simSnapshot.rankings) ? simSnapshot.rankings : [];
    this._els.podiumRanks.innerHTML = rankings
      .slice(0, 4)
      .map((entry, idx) => {
        const badge = medals[idx] || `#${entry.rank}`;
        const teamHearts =
          entry.team === 0
            ? simSnapshot.teamStockLives?.blue ?? simSnapshot.teamLives ?? 0
            : simSnapshot.teamStockLives?.red ?? 0;
        return `
          <div class="podium-rank-chip ${entry.isWinner ? 'is-winner' : ''}">
            <span class="rank-medal">${badge}</span>
            <span class="rank-name">${entry.nameZh}</span>
            <span class="rank-stat">❤️${teamHearts} · 💥${entry.kos} · 🛟${entry.rescues}</span>
          </div>
        `;
      })
      .join('');
  }

  getVisibleClickableCount() {
    const activeSection = this._els.screens[this._currentScreen];
    if (!activeSection || activeSection.hidden) return 0;
    const candidates = activeSection.querySelectorAll(
      'button:not([hidden]), [role="button"]:not([hidden]), [role="slider"]:not([hidden])'
    );
    let count = 0;
    for (const el of candidates) {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.pointerEvents === 'none' ||
        Number(style.opacity) === 0
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        count += 1;
      }
    }
    return count;
  }
}
