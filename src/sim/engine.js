/**
 * Pure deterministic SimEngine for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).
 *
 * Implements the exact PROJECT.md § Interface Contracts:
 *   - new SimEngine(config)
 *   - setPlayerIntent(playerId, intent)
 *   - setAutoPlayP1(enabled)
 *   - step(dt = FIXED_DT)
 *   - getSnapshot() -> JSON-cloneable SimSnapshot
 *
 * Zero DOM, Three.js, or WebAudio imports; 100% relative ES module imports.
 */

import {
  BUBBLE_FUSE_SEC,
  FIXED_DT,
  GRID_COLS,
  GRID_ROWS,
  MATCH_DURATION_SEC,
  MATCH_PHASES,
  PICKUP_SPAWN_GRACE_SEC,
  TILE_TYPE,
  normalizeItemType,
} from '../contracts/constants.js';
import { createPRNG } from './prng.js';
import {
  applyStartingLoadout,
  buildMatchRoster,
  createPlayerEntity,
} from './characters.js';
import {
  cloneGrid,
  createEmptyGrid,
  generateArena,
  isInBounds,
  resolveArenaId,
} from './arenas.js';
import {
  clamp,
  stepPlayersPhysics,
  stepSlidingBubbles,
  tryPlaceBubble,
} from './physics.js';
import {
  resolveCombatAndInteractions,
  spawnPickup,
  stepBubblesAndBlasts,
} from './combat.js';
import {
  computeRankings,
  dropCarriedBun,
  handleBossDamaged,
  handlePlayerEliminatedForMode,
  initModeState,
  resolveModeId,
  stepModeRules,
} from './modes.js';
import { computeBotIntent } from '../ai/bot_ai.js';
import { stepBossAI } from '../ai/boss_ai.js';

const PLAYER_STAT_KEYS = new Set([
  'maxBubbles',
  'blastRange',
  'baseSpeed',
  'speedUps',
  'canKick',
  'needles',
  'hasShield',
  'mount',
]);

function normalizeCustomGrid(customGrid) {
  const grid = createEmptyGrid();
  for (let r = 0; r < GRID_ROWS; r += 1) {
    const srcRow = Array.isArray(customGrid[r]) ? customGrid[r] : [];
    for (let c = 0; c < GRID_COLS; c += 1) {
      const val = Number(srcRow[c]);
      grid[r][c] = Number.isInteger(val) && val >= 0 && val <= 5 ? val : TILE_TYPE.EMPTY;
    }
  }
  return grid;
}

export class SimEngine {
  /**
   * @param {object} config
   */
  constructor(config = {}) {
    this.modeId = resolveModeId(config.modeId);
    this.arenaId = resolveArenaId(config.arenaId);
    this.seed = (Number.isFinite(Number(config.seed)) ? Number(config.seed) : 12345) >>> 0;
    this.rng = createPRNG(this.seed);

    this.botBehavior = config.botBehavior === 'idle' ? 'idle' : 'active';
    this.difficulty = config.difficulty === 'easy' ? 'easy' : 'normal';
    this.autoPlayP1 = Boolean(config.autoPlayP1);
    this.p2Enabled = Boolean(config.p2Enabled);
    this.disableRandomDrops = Boolean(config.disableRandomDrops);
    this.classicTeamLives =
      Number.isInteger(config.classicTeamLives) && config.classicTeamLives >= 1
        ? config.classicTeamLives
        : null;

    this.constants = {
      BUBBLE_FUSE_SEC,
    };

    this.tick = 0;
    this.activeBunTarget =
      Number.isInteger(config.activeBunTarget) && config.activeBunTarget >= 1
        ? config.activeBunTarget
        : null;
    this.timeRemainingSec =
      typeof config.matchDurationSec === 'number' && config.matchDurationSec > 0
        ? config.matchDurationSec
        : MATCH_DURATION_SEC;
    this.phase = MATCH_PHASES.PLAYING;
    this.winningTeam = null;
    this.nextEntityId = 1;

    // 1. Build arena (or apply customGrid override)
    const arenaData = generateArena(this.arenaId, this.modeId, this.rng);
    if (Array.isArray(config.customGrid) && config.customGrid.length > 0) {
      this.grid = normalizeCustomGrid(config.customGrid);
      // Scan customGrid for BUN_SHRINE if bun_grab
      if (this.modeId === 'bun_grab') {
        const customShrineSlots = [];
        for (let r = 0; r < GRID_ROWS; r += 1) {
          for (let c = 0; c < GRID_COLS; c += 1) {
            if (this.grid[r][c] === TILE_TYPE.BUN_SHRINE) {
              customShrineSlots.push({ col: c, row: r });
            }
          }
        }
        if (customShrineSlots.length > 0) {
          arenaData.bunShrineSlots = customShrineSlots;
        }
      }
    } else {
      this.grid = arenaData.grid;
    }

    // 2. Build 4-player roster + apply customSpawns if provided
    let roster = buildMatchRoster({
      modeId: this.modeId,
      p1CharacterId: config.p1CharacterId || 'miduo',
      p2CharacterId: config.p2CharacterId || null,
      p2Enabled: this.p2Enabled,
    });

    const resolvedSpawns = arenaData.spawns.map((s) => ({ ...s }));
    if (config.customSpawns) {
      if (Array.isArray(config.customSpawns)) {
        // If customSpawns specifies explicit custom roster entries (e.g. < 4 or custom teams/characters), honor overrides
        if (
          config.customSpawns.length > 0 &&
          config.customSpawns.every((sp) => sp && typeof sp === 'object')
        ) {
          if (config.customSpawns[0].id || config.customSpawns[0].team !== undefined) {
            roster = config.customSpawns.map((sp, idx) => {
              const fallback = roster[idx] || {
                id: idx === 0 ? 'p1' : `bot${idx}`,
                characterId: 'miduo',
                team: idx === 0 ? 0 : 1,
                isHuman: idx === 0,
              };
              const resolvedId = sp.id || fallback.id;
              const defaultIsHuman =
                sp.id !== undefined
                  ? resolvedId === 'p1' || (resolvedId === 'p2' && this.p2Enabled)
                  : fallback.isHuman;
              return {
                id: resolvedId,
                characterId: sp.characterId || fallback.characterId,
                team: sp.team !== undefined ? sp.team : fallback.team,
                isHuman: sp.isHuman !== undefined ? sp.isHuman : defaultIsHuman,
              };
            });
          }
          for (let i = 0; i < config.customSpawns.length; i += 1) {
            const sp = config.customSpawns[i];
            const col = clamp(
              sp.col !== undefined ? Math.floor(sp.col) : Math.floor(sp.x ?? 1),
              0,
              GRID_COLS - 1
            );
            const row = clamp(
              sp.row !== undefined ? Math.floor(sp.row) : Math.floor(sp.z ?? 1),
              0,
              GRID_ROWS - 1
            );
            resolvedSpawns[i] = {
              col,
              row,
              x: typeof sp.x === 'number' ? sp.x : col + 0.5,
              z: typeof sp.z === 'number' ? sp.z : row + 0.5,
            };
          }
        }
      } else if (typeof config.customSpawns === 'object') {
        for (let i = 0; i < roster.length; i += 1) {
          const slotId = roster[i].id;
          const sp = config.customSpawns[slotId];
          if (sp && typeof sp === 'object') {
            const col = clamp(
              sp.col !== undefined ? Math.floor(sp.col) : Math.floor(sp.x ?? resolvedSpawns[i].col),
              0,
              GRID_COLS - 1
            );
            const row = clamp(
              sp.row !== undefined ? Math.floor(sp.row) : Math.floor(sp.z ?? resolvedSpawns[i].row),
              0,
              GRID_ROWS - 1
            );
            resolvedSpawns[i] = {
              col,
              row,
              x: typeof sp.x === 'number' ? sp.x : col + 0.5,
              z: typeof sp.z === 'number' ? sp.z : row + 0.5,
            };
            if (sp.team !== undefined) roster[i].team = sp.team;
            if (sp.characterId) roster[i].characterId = sp.characterId;
          }
        }
      }
    }

    this.players = [];
    this.playersById = new Map();
    this.intentsByPlayerId = new Map();

    for (let i = 0; i < roster.length; i += 1) {
      const sp = resolvedSpawns[i] || { col: 1, row: 1 };
      if (!config.customGrid && this.grid[sp.row][sp.col] === TILE_TYPE.SOFT_BLOCK) {
        this.grid[sp.row][sp.col] = TILE_TYPE.EMPTY;
      }
      const player = createPlayerEntity(roster[i], sp, this.autoPlayP1);
      this.players.push(player);
      this.playersById.set(player.id, player);
      this.intentsByPlayerId.set(player.id, {
        moveX: 0,
        moveZ: 0,
        dropBubble: false,
        useItem: false,
      });
    }

    // 3. Apply startingLoadout (supports direct P1 stat object OR { p1: {...}, bot1: {...} } map)
    if (config.startingLoadout && typeof config.startingLoadout === 'object') {
      const keys = Object.keys(config.startingLoadout);
      const isDirectStatObject = keys.some((k) => PLAYER_STAT_KEYS.has(k));
      if (isDirectStatObject) {
        const p1 = this.playersById.get('p1') || this.players[0];
        if (p1) applyStartingLoadout(p1, config.startingLoadout);
      } else {
        for (const pid of keys) {
          const targetPlayer = this.playersById.get(pid);
          if (targetPlayer) {
            applyStartingLoadout(targetPlayer, config.startingLoadout[pid]);
          }
        }
      }
    }

    // 4. Entities & Mode State
    this.bubbles = [];
    this.blasts = [];
    this.pickups = [];
    this.events = [];

    initModeState(this, arenaData);

    // 5. Spawn customPickups if provided
    if (Array.isArray(config.customPickups)) {
      for (let i = 0; i < config.customPickups.length; i += 1) {
        const cp = config.customPickups[i];
        if (!cp) continue;
        const normType = normalizeItemType(cp.type);
        const col = Math.floor(Number(cp.col));
        const row = Math.floor(Number(cp.row));
        if (!normType || !isInBounds(col, row)) continue;
        const grace =
          typeof cp.spawnGraceSec === 'number' ? cp.spawnGraceSec : PICKUP_SPAWN_GRACE_SEC;
        spawnPickup(this, normType, col, row, grace);
      }
    }
  }

  /**
   * Toggles P1 autonomous AI control.
   * @param {boolean} enabled
   */
  setAutoPlayP1(enabled) {
    this.autoPlayP1 = Boolean(enabled);
    const p1 = this.playersById.get('p1');
    if (p1) {
      p1.isBotControlled = this.autoPlayP1;
      if (!this.autoPlayP1) {
        this.intentsByPlayerId.set('p1', {
          moveX: 0,
          moveZ: 0,
          dropBubble: false,
          useItem: false,
        });
      }
    }
  }

  /**
   * Updates botBehavior ('active' | 'idle') dynamically if needed.
   * @param {'active'|'idle'} behavior
   */
  setBotBehavior(behavior) {
    this.botBehavior = behavior === 'idle' ? 'idle' : 'active';
  }

  /**
   * Updates AI difficulty ('easy' | 'normal') dynamically if needed.
   * @param {'easy'|'normal'} difficulty
   */
  setDifficulty(difficulty) {
    this.difficulty = difficulty === 'easy' ? 'easy' : 'normal';
  }

  /**
   * Sets directional movement and action triggers for a player slot ('p1', 'p2', etc.).
   * Movement axes persist across steps until changed; dropBubble & useItem fire as crisp pulses.
   *
   * @param {string|number} playerId
   * @param {object} intent
   */
  setPlayerIntent(playerId, intent = {}) {
    let resolvedId = playerId;
    if (playerId === 0) resolvedId = 'p1';
    else if (playerId === 1) resolvedId = this.p2Enabled ? 'p2' : 'bot1';

    if (!this.playersById.has(resolvedId)) return;
    const prev = this.intentsByPlayerId.get(resolvedId) || {
      moveX: 0,
      moveZ: 0,
      dropBubble: false,
      useItem: false,
    };

    const moveX =
      intent.moveX !== undefined ? clamp(Number(intent.moveX) || 0, -1, 1) : prev.moveX;
    const moveZ =
      intent.moveZ !== undefined ? clamp(Number(intent.moveZ) || 0, -1, 1) : prev.moveZ;
    const dropBubble = Boolean(intent.dropBubble || intent.dropBubbleEdge);
    const useItem = Boolean(intent.useItem || intent.useItemEdge);

    this.intentsByPlayerId.set(resolvedId, {
      moveX,
      moveZ,
      dropBubble,
      useItem,
    });
  }

  /**
   * Advances the deterministic simulation by one fixed step (default 1/60s).
   * @param {number} dt
   * @returns {object} Read-only SimSnapshot
   */
  step(dt = FIXED_DT) {
    this.events = [];

    if (this.phase !== MATCH_PHASES.PLAYING) {
      return this.getSnapshot();
    }

    const stepDt = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : FIXED_DT;
    this.tick += 1;

    // 1. Compute BotAI intents for bot-controlled characters (when botBehavior !== 'idle' or autoPlayP1)
    for (let i = 0; i < this.players.length; i += 1) {
      const p = this.players[i];
      const shouldRunBot =
        (p.id === 'p1' && this.autoPlayP1) ||
        (!p.isHuman && this.botBehavior !== 'idle');

      p.isBotControlled = shouldRunBot;

      if (shouldRunBot) {
        const aiIntent = computeBotIntent(this, p, i);
        this.intentsByPlayerId.set(p.id, aiIntent);
      } else if (!p.isHuman && this.botBehavior === 'idle') {
        // Keep idle bots motionless unless tests explicitly fed setPlayerIntent on that bot ID!
      }
    }

    // 2. Process Sugar Bubble placement requests before movement so walk-off grace seeds overlapping entities
    for (let i = 0; i < this.players.length; i += 1) {
      const p = this.players[i];
      const intent = this.intentsByPlayerId.get(p.id);
      if (intent && intent.dropBubble) {
        tryPlaceBubble(this, p);
      }
    }

    // 3. Advance continuous player movement, corner-assist, walk-off solidification, and kick initiation
    stepPlayersPhysics(this, this.intentsByPlayerId, stepDt);

    // 4. Advance kicked sliding bubbles across free tiles
    stepSlidingBubbles(this, stepDt);

    // 5. Advance Mechanical Golem Boss AI (in 'boss_golem' mode)
    if (this.boss) {
      stepBossAI(this, stepDt);
    }

    // 6. Advance bubble fuses, lingering blast rays, synchronous BFS chain detonations, & soft block breaks
    stepBubblesAndBlasts(this, stepDt);

    // 7. Resolve blast hits (Invuln > Shield > Mount > Trap), Ally Rescue > Needle > Enemy Pop > Timeout, & Pickups
    resolveCombatAndInteractions(this, this.intentsByPlayerId, stepDt, {
      onPlayerEliminated: handlePlayerEliminatedForMode,
      dropBunCallback: dropCarriedBun,
      onBossDamaged: handleBossDamaged,
    });

    // 8. Step mode rules (respawns, bun pickups/deliveries, match clock, win/loss transitions)
    stepModeRules(this, stepDt);

    // 9. Consume one-shot action edges (dropBubble & useItem) while preserving continuous moveX / moveZ
    for (const intent of this.intentsByPlayerId.values()) {
      intent.dropBubble = false;
      intent.useItem = false;
    }

    return this.getSnapshot();
  }

  /**
   * Produces a deep-cloned, 100% JSON-serializable SimSnapshot matching PROJECT.md § Interface Contracts.
   */
  getSnapshot() {
    return {
      tick: this.tick,
      timeRemainingSec: +this.timeRemainingSec.toFixed(3),
      phase: this.phase,
      winningTeam: this.winningTeam,
      modeId: this.modeId,
      arenaId: this.arenaId,
      difficulty: this.difficulty,
      seed: this.seed,
      suddenDeathActive: Boolean(this.suddenDeathActive),
      candyRainWarningActive: Boolean(this.candyRainWarningActive),
      candyRainIndex: this.candyRainIndex || 0,
      grid: cloneGrid(this.grid),
      players: this.players.map((p) => ({
        id: p.id,
        characterId: p.characterId,
        nameZh: p.nameZh,
        team: p.team,
        isHuman: p.isHuman,
        isBotControlled: p.isBotControlled,
        state: p.state,
        x: +p.x.toFixed(4),
        z: +p.z.toFixed(4),
        col: p.col,
        row: p.row,
        facingRad: +p.facingRad.toFixed(4),
        isMoving: p.isMoving,
        maxBubbles: p.maxBubbles,
        activeBubbles: p.activeBubbles,
        blastRange: p.blastRange,
        baseSpeed: p.baseSpeed,
        effectiveSpeed: p.effectiveSpeed,
        speedUps: p.speedUps,
        canKick: p.canKick,
        needles: p.needles,
        hasShield: p.hasShield,
        mount: p.mount,
        carryingBun: p.carryingBun,
        carriedBuns: p.carriedBuns,
        trapTimer: +p.trapTimer.toFixed(4),
        invulnTimer: +p.invulnTimer.toFixed(4),
        respawnTimer: +p.respawnTimer.toFixed(4),
        stats: {
          kos: p.stats.kos,
          rescues: p.stats.rescues,
          blocksBroken: p.stats.blocksBroken,
          bunsBanked: p.stats.bunsBanked,
          distanceMoved: p.stats.distanceMoved,
          bubblesPlaced: p.stats.bubblesPlaced,
        },
      })),
      bubbles: this.bubbles.map((b) => ({
        id: b.id,
        ownerId: b.ownerId,
        col: b.col,
        row: b.row,
        x: +b.x.toFixed(4),
        z: +b.z.toFixed(4),
        blastRange: b.blastRange,
        fuseRemaining: +b.fuseRemaining.toFixed(4),
        passThroughIds: b.passThroughIds.slice(),
        sliding: b.sliding,
        vx: b.vx,
        vz: b.vz,
      })),
      blasts: this.blasts.map((bl) => ({
        id: bl.id,
        ownerId: bl.ownerId,
        originCol: bl.originCol,
        originRow: bl.originRow,
        tiles: bl.tiles.map((t) => ({ col: t.col, row: t.row, dir: t.dir })),
        remainingSec: +bl.remainingSec.toFixed(4),
      })),
      pickups: this.pickups.map((pk) => ({
        id: pk.id,
        type: pk.type,
        col: pk.col,
        row: pk.row,
        x: pk.x,
        z: pk.z,
        spawnGraceSec: +pk.spawnGraceSec.toFixed(4),
      })),
      looseBuns: this.looseBuns.map((bun) => ({
        id: bun.id,
        col: bun.col,
        row: bun.row,
        x: bun.x,
        z: bun.z,
      })),
      boss: this.boss
        ? {
            id: this.boss.id,
            nameZh: this.boss.nameZh,
            x: +this.boss.x.toFixed(4),
            z: +this.boss.z.toFixed(4),
            col: this.boss.col,
            row: this.boss.row,
            widthTiles: this.boss.widthTiles,
            heightTiles: this.boss.heightTiles,
            hp: this.boss.hp,
            maxHp: this.boss.maxHp,
            phase: this.boss.phase,
            state: this.boss.state,
            attackType: this.boss.attackType,
            telegraphTiles: this.boss.telegraphTiles.map((t) => ({
              col: t.col,
              row: t.row,
            })),
            telegraphRemainingSec: +this.boss.telegraphRemainingSec.toFixed(4),
            invulnTimer: +this.boss.invulnTimer.toFixed(4),
          }
        : null,
      teamScores: {
        blue: this.teamScores.blue,
        red: this.teamScores.red,
      },
      teamLives: this.teamLives,
      teamStockLives: {
        blue: this.teamStockLives ? this.teamStockLives.blue : this.teamLives,
        red: this.teamStockLives ? this.teamStockLives.red : 0,
      },
      rankings: computeRankings(this),
      events: this.events.map((ev) => ({ ...ev })),
    };
  }
}
