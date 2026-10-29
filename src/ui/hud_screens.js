/**
 * Icon-first Kid-Friendly UI Screens & Strict <= 5-Control Active HUD Manager
 * for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Screens:
 *  - 'title'   : Candy-glossy Title badge + giant Play button ([data-testid="btn-play"])
 *  - 'select'  : Visual Character (4), Arena (4), Mode (3), 1P/2P toggle & GO button
 *  - 'playing' : Strictly <= 5 clickable controls (>=64x64px, 0 overlap) + non-interactive status strip
 *  - 'paused'  : Resume / Restart / Quit-to-Select modal
 *  - 'podium'  : Top/bottom framed Victory Podium overlay keeping center 3D characters unobstructed
 */

import {
  ARENA_IDS,
  ARENA_METADATA,
  BUN_WIN_SCORE,
  CHARACTER_IDS,
  CHARACTER_METADATA,
  MODE_IDS,
  MODE_METADATA,
  PLAYER_STATES,
  SCREEN_IDS,
  TEST_IDS,
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

        <button
          type="button"
          class="candy-btn btn-giant-play"
          data-testid="${TEST_IDS.BTN_PLAY}"
          aria-label="Play QQ Tang 3D"
        >
          <span class="btn-svg">${UI_ICONS.playBig}</span>
          <span class="btn-label">PLAY · 开始</span>
        </button>
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

      <!-- 3. ACTIVE GAMEPLAY HUD (STRICTLY <= 5 CLICKABLE CONTROLS, ALL >= 64x64px) -->
      <section class="ui-screen screen-playing" data-screen="playing" hidden>
        <!-- Non-interactive status strip (pointer-events: none, zero interactive elements) -->
        <div class="hud-status-strip">
          <div class="hud-pill hud-clock-pill">
            <span class="hud-clock-text" data-role="clock-text">2:30</span>
          </div>

          <div class="hud-pill hud-p1-pill">
            <span class="hud-mini-avatar" data-role="p1-avatar">${CHARACTER_PORTRAITS.miduo}</span>
            <span class="hud-stat-chips" data-role="p1-stats"></span>
          </div>

          <div class="hud-pill hud-mode-pill" data-role="mode-status"></div>
        </div>

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
              class="candy-btn podium-btn btn-again-green"
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
  }

  syncAudioMuted(muted) {
    const isMuted = Boolean(muted);
    if (this._lastAudioMuted === isMuted) return;
    this._lastAudioMuted = isMuted;
    this._els.audioIcon.innerHTML = isMuted ? UI_ICONS.audioOff : UI_ICONS.audioOn;
    this._els.hudAudio.classList.toggle('is-muted', isMuted);
  }

  updateHud(simSnapshot, muted = false) {
    this.syncAudioMuted(muted);
    if (!simSnapshot) return;

    const clockStr = formatClock(simSnapshot.timeRemainingSec);
    if (this._lastClockStr !== clockStr) {
      this._lastClockStr = clockStr;
      this._els.clockText.textContent = clockStr;
    }

    const p1 =
      simSnapshot.players.find((p) => p.id === 'p1') || simSnapshot.players[0] || null;
    if (p1) {
      if (this._lastAvatarCharId !== p1.characterId) {
        this._lastAvatarCharId = p1.characterId;
        this._els.p1Avatar.innerHTML =
          CHARACTER_PORTRAITS[p1.characterId] || CHARACTER_PORTRAITS.miduo;
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
        <span class="coop-lives">❤️${simSnapshot.teamLives}</span>
      `;
    } else if (simSnapshot.modeId === 'bun_grab') {
      modeStatusHtml = `
        <span class="score-chip team-blue">🔵 🥟 ${simSnapshot.teamScores.blue}/${BUN_WIN_SCORE}</span>
        <span class="score-chip team-red">🔴 🥟 ${simSnapshot.teamScores.red}/${BUN_WIN_SCORE}</span>
      `;
    } else {
      const blueAlive = simSnapshot.players.filter(
        (p) => p.team === 0 && p.state !== PLAYER_STATES.ELIMINATED
      ).length;
      const redAlive = simSnapshot.players.filter(
        (p) => p.team === 1 && p.state !== PLAYER_STATES.ELIMINATED
      ).length;
      modeStatusHtml = `
        <span class="score-chip team-blue">🔵 ${blueAlive}</span>
        <span class="score-chip team-red">🔴 ${redAlive}</span>
      `;
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
        return `
          <div class="podium-rank-chip ${entry.isWinner ? 'is-winner' : ''}">
            <span class="rank-medal">${badge}</span>
            <span class="rank-name">${entry.nameZh}</span>
            <span class="rank-stat">★${entry.kos + entry.rescues + entry.bunsBanked}</span>
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
