/**
 * Rules, objective state, respawns, tie-breakers, Boss loot drops, and 1st–4th
 * Victory Podium rankings for all 3 game modes:
 *   1. classic_2v2 (经典对战)
 *   2. bun_grab (抢包山)
 *   3. boss_golem (BOSS挑战：机械傀儡)
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

import {
  ACTIVE_BUN_TARGET,
  BOSS_MAX_HP,
  BOSS_PLAYER_RESPAWN_SEC,
  BOSS_SHARED_LIVES,
  BUN_DROP_LOCK_SEC,
  BUN_RESPAWN_DELAY_SEC,
  BUN_WIN_SCORE,
  CANDY_RAIN_INTERVAL_SEC,
  CLASSIC_RESPAWN_SEC,
  CLASSIC_TEAM_LIVES,
  EVENT_TYPES,
  GRID_COLS,
  GRID_ROWS,
  ITEM_TYPES,
  MATCH_PHASES,
  MODE_IDS,
  OVERTIME_DURATION_SEC,
  PLAYER_RADIUS,
  PLAYER_RESPAWN_SEC,
  PLAYER_STATES,
  RESPAWN_INVULN_SEC,
  SUDDEN_DEATH_START_SEC,
  TILE_TYPE,
} from '../contracts/constants.js';
import { computeEffectiveSpeed } from './characters.js';
import { isInBounds } from './arenas.js';
import { eliminatePlayer, spawnPickup } from './combat.js';
import { circleOverlapsAABB, circleOverlapsTile, clamp } from './physics.js';

export function buildSpiralPath(cols = GRID_COLS, rows = GRID_ROWS) {
  const path = [];
  let top = 1;
  let bottom = Math.max(1, rows - 2);
  let left = 1;
  let right = Math.max(1, cols - 2);

  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c += 1) {
      path.push({ col: c, row: top });
    }
    top += 1;
    for (let r = top; r <= bottom; r += 1) {
      path.push({ col: right, row: r });
    }
    right -= 1;
    if (top <= bottom) {
      for (let c = right; c >= left; c -= 1) {
        path.push({ col: c, row: bottom });
      }
      bottom -= 1;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r -= 1) {
        path.push({ col: left, row: r });
      }
      left += 1;
    }
  }
  return path;
}

export function resolveModeId(modeId) {
  return MODE_IDS.includes(modeId) ? modeId : 'classic_2v2';
}

/**
 * Initializes mode-specific state on the simulation instance.
 */
export function initModeState(sim, arenaData) {
  const classicLives = sim.classicTeamLives || CLASSIC_TEAM_LIVES;
  sim.teamScores = { blue: 0, red: 0 };
  sim.teamStockLives = {
    blue: sim.modeId === 'classic_2v2' ? classicLives : 0,
    red: sim.modeId === 'classic_2v2' ? classicLives : 0,
  };
  sim.teamLives =
    sim.modeId === 'boss_golem'
      ? BOSS_SHARED_LIVES
      : sim.modeId === 'classic_2v2'
        ? classicLives
        : 0;
  sim.suddenDeathActive = false;
  sim.candyRainWarningActive = false;
  sim.candyRainTimer = 0;
  sim.candyRainIndex = 0;
  sim.candyRainPath = buildSpiralPath(GRID_COLS, GRID_ROWS);
  sim.looseBuns = [];
  sim.bunShrineSlots = arenaData.bunShrineSlots.slice();
  sim.bunRespawnTimer = 0;
  sim.inOvertime = false;
  sim.boss = null;

  if (sim.modeId === 'bun_grab') {
    // If customGrid omitted BUN_SHRINE / bases, ensure fallback shrine slots exist
    if (sim.bunShrineSlots.length === 0) {
      sim.bunShrineSlots = [
        { col: 7, row: 5 },
        { col: 7, row: 7 },
        { col: 7, row: 6 },
      ];
    }
    spawnShrineBunsUpToTarget(sim);
  } else if (sim.modeId === 'boss_golem') {
    const sp = arenaData.bossSpawn || { col: 6, row: 5 };
    sim.boss = {
      id: 'mechanical_golem',
      nameZh: '机械傀儡',
      x: sp.col + 1.0, // Center of 2x2 footprint [col..col+2, row..row+2]
      z: sp.row + 1.0,
      col: sp.col,
      row: sp.row,
      widthTiles: 2,
      heightTiles: 2,
      hp: BOSS_MAX_HP,
      maxHp: BOSS_MAX_HP,
      phase: 1,
      state: 'patrol',
      attackType: null,
      telegraphTiles: [],
      telegraphRemainingSec: 0,
      invulnTimer: 0,
      _cooldownSec: 2.2,
      _attackCycle: 0,
      _patrolDirX: 1,
      _patrolDirZ: 1,
      _patrolTimer: 2.4,
      _hurtFlashSec: 0,
    };
    sim.teamScores = { blue: 0, red: BOSS_MAX_HP };
  }
}

/**
 * Finds the nearest passable non-base tile to (startCol, startRow) so dropped buns
 * never land inside walls, soft blocks, or directly on a scoring base pad (E11).
 */
export function findNearestValidBunDropTile(sim, startCol, startRow) {
  const c0 = clamp(startCol, 0, GRID_COLS - 1);
  const r0 = clamp(startRow, 0, GRID_ROWS - 1);

  const isValid = (c, r) => {
    if (!isInBounds(c, r)) return false;
    const t = sim.grid[r][c];
    if (t !== TILE_TYPE.EMPTY && t !== TILE_TYPE.BUN_SHRINE) return false;
    for (let i = 0; i < sim.looseBuns.length; i += 1) {
      if (sim.looseBuns[i].col === c && sim.looseBuns[i].row === r) return false;
    }
    return true;
  };

  if (isValid(c0, r0)) return { col: c0, row: r0 };

  for (let radius = 1; radius <= 14; radius += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
        const nc = c0 + dc;
        const nr = r0 + dr;
        if (isValid(nc, nr)) {
          return { col: nc, row: nr };
        }
      }
    }
  }
  return { col: 7, row: 6 };
}

/**
 * Detaches a carried bun when a carrier becomes trapped or eliminated (E11).
 */
export function dropCarriedBun(sim, player) {
  if (!player.carryingBun) return;
  player.carryingBun = false;
  player.carriedBuns = 0;
  player.bunPickupLockSec = BUN_DROP_LOCK_SEC;
  player.effectiveSpeed = computeEffectiveSpeed(player);

  const dropTile = findNearestValidBunDropTile(sim, player.col, player.row);
  const bun = {
    id: sim.nextEntityId++,
    col: dropTile.col,
    row: dropTile.row,
    x: dropTile.col + 0.5,
    z: dropTile.row + 0.5,
  };
  sim.looseBuns.push(bun);
  sim.events.push({
    type: EVENT_TYPES.BUN_DROP,
    playerId: player.id,
    bunId: bun.id,
    col: bun.col,
    row: bun.row,
  });
}

function countTotalBunsInPlay(sim) {
  let carried = 0;
  for (let i = 0; i < sim.players.length; i += 1) {
    if (sim.players[i].carryingBun) carried += 1;
  }
  return sim.looseBuns.length + carried;
}

function spawnShrineBunsUpToTarget(sim, overrideTarget = null) {
  const target = overrideTarget ?? sim.activeBunTarget ?? ACTIVE_BUN_TARGET;
  let active = countTotalBunsInPlay(sim);
  for (let i = 0; i < sim.bunShrineSlots.length && active < target; i += 1) {
    const slot = sim.bunShrineSlots[i];
    const occupied = sim.looseBuns.some((b) => b.col === slot.col && b.row === slot.row);
    if (occupied) continue;
    const t = sim.grid[slot.row][slot.col];
    if (t === TILE_TYPE.HARD_WALL || t === TILE_TYPE.SOFT_BLOCK) continue;

    sim.looseBuns.push({
      id: sim.nextEntityId++,
      col: slot.col,
      row: slot.row,
      x: slot.col + 0.5,
      z: slot.row + 0.5,
    });
    active += 1;
  }
}

/**
 * Schedules player respawn when eliminated in classic_2v2, bun_grab, or boss_golem.
 */
export function handlePlayerEliminatedForMode(sim, player) {
  if (sim.modeId === 'classic_2v2') {
    const teamKey = player.team === 0 ? 'blue' : 'red';
    if (sim.teamStockLives && sim.teamStockLives[teamKey] > 0) {
      sim.teamStockLives[teamKey] = Math.max(0, sim.teamStockLives[teamKey] - 1);
    }
    if (sim.teamStockLives) {
      sim.teamLives = sim.teamStockLives.blue;
    }
    if (sim.teamStockLives && sim.teamStockLives[teamKey] > 0) {
      player.respawnTimer = CLASSIC_RESPAWN_SEC;
    } else {
      player.respawnTimer = 0;
    }
  } else if (sim.modeId === 'bun_grab') {
    player.respawnTimer = PLAYER_RESPAWN_SEC;
  } else if (sim.modeId === 'boss_golem') {
    if (sim.teamLives > 0) {
      sim.teamLives -= 1;
      player.respawnTimer = BOSS_PLAYER_RESPAWN_SEC;
    } else {
      player.respawnTimer = 0;
    }
  } else {
    player.respawnTimer = 0;
  }
}

/**
 * Handles Mechanical Golem taking HP damage: drops loot every 3 HP threshold crossed and triggers
 * Co-op Victory at 0 HP.
 */
export function handleBossDamaged(sim, attackerId, prevHp = null) {
  const boss = sim.boss;
  if (!boss) return;

  sim.teamScores.blue = boss.maxHp - boss.hp;
  sim.teamScores.red = boss.hp;

  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.state = 'defeated';
    boss.attackType = null;
    boss.telegraphTiles = [];
    boss.telegraphRemainingSec = 0;

    const attacker = sim.playersById.get(attackerId);
    if (attacker) {
      attacker.stats.kos += 1;
    }

    sim.events.push({
      type: EVENT_TYPES.BOSS_DEFEAT,
      x: boss.x,
      z: boss.z,
      attackerId: attackerId || null,
    });

    concludeMatch(sim, MATCH_PHASES.VICTORY, 0);
    return;
  }

  boss._hurtFlashSec = 0.28;

  // Drop 2 helpful powerup/mount items onto nearby open tiles every 3 HP threshold crossed
  const oldBucket = prevHp !== null ? Math.floor((prevHp - 1) / 3) : Math.floor(boss.hp / 3);
  const newBucket = Math.floor(boss.hp / 3);
  const crossedThreeHp = prevHp !== null ? oldBucket > newBucket || boss.hp % 3 === 0 : boss.hp % 3 === 0;
  if (crossedThreeHp) {
    const bossDropPool = [
      ITEM_TYPES.POWER,
      ITEM_TYPES.BUBBLE,
      ITEM_TYPES.SPEED,
      ITEM_TYPES.NEEDLE,
      ITEM_TYPES.SHIELD,
      ITEM_TYPES.TURTLE,
      ITEM_TYPES.UFO,
    ];
    const candidates = [];
    const bc = Math.round(boss.x - 1);
    const br = Math.round(boss.z - 1);
    for (let r = Math.max(1, br - 2); r <= Math.min(GRID_ROWS - 2, br + 3); r += 1) {
      for (let c = Math.max(1, bc - 2); c <= Math.min(GRID_COLS - 2, bc + 3); c += 1) {
        if (c >= bc && c < bc + 2 && r >= br && r < br + 2) continue;
        if (sim.grid[r][c] !== TILE_TYPE.EMPTY) continue;
        if (sim.pickups.some((pk) => pk.col === c && pk.row === r)) continue;
        candidates.push({ col: c, row: r });
      }
    }
    const shuffled = sim.rng.shuffle(candidates);
    const dropCount = Math.min(2, shuffled.length);
    for (let i = 0; i < dropCount; i += 1) {
      const itemType = sim.rng.pick(bossDropPool);
      spawnPickup(sim, itemType, shuffled[i].col, shuffled[i].row, 0.85);
    }
  }
}

function findSafeRespawnTile(sim, prefCol, prefRow) {
  const c0 = clamp(prefCol, 0, GRID_COLS - 1);
  const r0 = clamp(prefRow, 0, GRID_ROWS - 1);
  if (sim.grid[r0][c0] !== TILE_TYPE.HARD_WALL) {
    return { col: c0, row: r0 };
  }
  for (let radius = 1; radius <= 14; radius += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
        const nc = c0 + dc;
        const nr = r0 + dr;
        if (isInBounds(nc, nr) && sim.grid[nr][nc] !== TILE_TYPE.HARD_WALL) {
          return { col: nc, row: nr };
        }
      }
    }
  }
  return { col: 7, row: 6 };
}

function respawnPlayer(sim, player) {
  const safeTile = findSafeRespawnTile(sim, player.spawnCol, player.spawnRow);
  player.state = PLAYER_STATES.ALIVE;
  player.x = safeTile.col + 0.5;
  player.z = safeTile.row + 0.5;
  player.col = safeTile.col;
  player.row = safeTile.row;
  player.trapTimer = 0;
  player.trappedBy = null;
  player.respawnTimer = 0;
  player.invulnTimer = RESPAWN_INVULN_SEC;
  player.carryingBun = false;
  player.carriedBuns = 0;
  player.effectiveSpeed = computeEffectiveSpeed(player);

  // Ensure spawn tile wasn't blocked by a Gear Crate drop
  if (sim.grid[player.row][player.col] === TILE_TYPE.SOFT_BLOCK) {
    sim.grid[player.row][player.col] = TILE_TYPE.EMPTY;
  }

  // Grant walk-off grace for any pre-existing bubble overlapping the spawn pad (F04, E01)
  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    if (
      !b.passThroughIds.includes(player.id) &&
      circleOverlapsAABB(
        player.x,
        player.z,
        PLAYER_RADIUS,
        b.x - 0.5,
        b.z - 0.5,
        b.x + 0.5,
        b.z + 0.5
      )
    ) {
      b.passThroughIds.push(player.id);
    }
  }
}

export function concludeMatch(sim, phase, winningTeam) {
  if (sim.phase !== MATCH_PHASES.PLAYING) return;
  sim.phase = phase;
  sim.winningTeam = winningTeam;
  sim.events.push({
    type: EVENT_TYPES.MATCH_END,
    phase,
    winningTeam,
  });
}

function computeTeamCombatTieScore(sim, team) {
  let score = 0;
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.team !== team) continue;
    score += p.stats.kos * 20 + p.stats.rescues * 12 + p.stats.blocksBroken;
  }
  return score;
}

function dropNextCandyRainBlock(sim) {
  if (!sim.candyRainPath || sim.candyRainIndex >= sim.candyRainPath.length - 1) {
    return false;
  }

  let target = null;
  while (sim.candyRainIndex < sim.candyRainPath.length - 1) {
    const cand = sim.candyRainPath[sim.candyRainIndex++];
    if (sim.grid[cand.row][cand.col] !== TILE_TYPE.HARD_WALL) {
      target = cand;
      break;
    }
  }
  if (!target) return false;

  const { col, row } = target;
  sim.grid[row][col] = TILE_TYPE.HARD_WALL;

  // Vaporize bubbles at (col, row)
  for (let i = sim.bubbles.length - 1; i >= 0; i -= 1) {
    const b = sim.bubbles[i];
    const bc = clamp(Math.floor(b.x), 0, GRID_COLS - 1);
    const br = clamp(Math.floor(b.z), 0, GRID_ROWS - 1);
    if ((bc === col && br === row) || (b.col === col && b.row === row)) {
      const owner = sim.playersById.get(b.ownerId);
      if (owner) {
        owner.activeBubbles = Math.max(0, owner.activeBubbles - 1);
      }
      sim.bubbles.splice(i, 1);
    }
  }

  // Vaporize pickups at (col, row)
  for (let i = sim.pickups.length - 1; i >= 0; i -= 1) {
    if (sim.pickups[i].col === col && sim.pickups[i].row === row) {
      sim.pickups.splice(i, 1);
    }
  }

  // Crush (trap -> KO) any player under (col, row)
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.state === PLAYER_STATES.ELIMINATED) continue;
    const overlaps =
      (p.col === col && p.row === row) ||
      circleOverlapsTile(p.x, p.z, PLAYER_RADIUS * 0.85, col, row);
    if (overlaps) {
      if (p.state === PLAYER_STATES.ALIVE) {
        p.state = PLAYER_STATES.TRAPPED;
        sim.events.push({
          type: EVENT_TYPES.TRAP,
          playerId: p.id,
          attackerId: 'candy_rain',
          x: p.x,
          z: p.z,
        });
      }
      eliminatePlayer(
        sim,
        p,
        null,
        'candy_rain',
        handlePlayerEliminatedForMode,
        dropCarriedBun
      );
    }
  }

  sim.events.push({
    type: EVENT_TYPES.CANDY_RAIN_DROP,
    col,
    row,
  });
  return true;
}

/**
 * Steps mode-specific timers, respawns, bun pickups/deliveries, and win/loss checks.
 */
export function stepModeRules(sim, dt) {
  if (sim.phase !== MATCH_PHASES.PLAYING) return;

  // 1. Tick player respawns across all modes (classic_2v2 stock lives, bun_grab, boss_golem)
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.state === PLAYER_STATES.ELIMINATED && p.respawnTimer > 0) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 1e-9) {
        respawnPlayer(sim, p);
      }
    }
  }

  // 2. Decrement match timer
  sim.timeRemainingSec = Math.max(0, sim.timeRemainingSec - dt);

  if (sim.modeId === 'classic_2v2') {
    // 1 s before "糖果雨" starts (<= 31.0 s remaining), trigger warning stamp & rumble SFX!
    if (
      sim.timeRemainingSec <= SUDDEN_DEATH_START_SEC + 1.0 + 1e-9 &&
      sim.timeRemainingSec > 1e-9 &&
      !sim.candyRainWarningActive
    ) {
      sim.candyRainWarningActive = true;
      sim.events.push({
        type: EVENT_TYPES.CANDY_RAIN_WARNING,
        timeRemainingSec: +sim.timeRemainingSec.toFixed(3),
      });
    }

    // "糖果雨" sudden death when <= 30 s remain: indestructible hard candy blocks spiral in every 0.5 s
    if (sim.timeRemainingSec <= SUDDEN_DEATH_START_SEC + 1e-9 && sim.timeRemainingSec > 1e-9) {
      if (!sim.suddenDeathActive) {
        sim.suddenDeathActive = true;
        sim.candyRainTimer = 0;
        dropNextCandyRainBlock(sim);
      } else {
        sim.candyRainTimer = (sim.candyRainTimer || 0) + dt;
        while (sim.candyRainTimer + 1e-9 >= CANDY_RAIN_INTERVAL_SEC) {
          sim.candyRainTimer -= CANDY_RAIN_INTERVAL_SEC;
          dropNextCandyRainBlock(sim);
        }
      }
    }

    let blueActive = 0;
    let redActive = 0;
    let blueRespawning = 0;
    let redRespawning = 0;
    let blueHealthy = 0;
    let redHealthy = 0;
    let blueKos = 0;
    let redKos = 0;

    for (let i = 0; i < sim.players.length; i += 1) {
      const p = sim.players[i];
      if (p.team === 0) {
        blueKos += p.stats.kos;
        if (p.state !== PLAYER_STATES.ELIMINATED) blueActive += 1;
        else if (p.respawnTimer > 0) blueRespawning += 1;
        if (p.state === PLAYER_STATES.ALIVE) blueHealthy += 1;
      } else {
        redKos += p.stats.kos;
        if (p.state !== PLAYER_STATES.ELIMINATED) redActive += 1;
        else if (p.respawnTimer > 0) redRespawning += 1;
        if (p.state === PLAYER_STATES.ALIVE) redHealthy += 1;
      }
    }
    sim.teamScores.blue = blueKos;
    sim.teamScores.red = redKos;
    const blueHearts = sim.teamStockLives ? sim.teamStockLives.blue : blueActive;
    const redHearts = sim.teamStockLives ? sim.teamStockLives.red : redActive;
    sim.teamLives = blueHearts;

    const blueOut = blueHearts <= 0 || (blueActive === 0 && blueRespawning === 0);
    const redOut = redHearts <= 0 || (redActive === 0 && redRespawning === 0);

    if (redOut && !blueOut) {
      concludeMatch(sim, MATCH_PHASES.VICTORY, 0);
      return;
    }
    if (blueOut && !redOut) {
      concludeMatch(sim, MATCH_PHASES.DEFEAT, 1);
      return;
    }
    if ((blueOut && redOut) || sim.timeRemainingSec <= 1e-9) {
      // Timer end or simultaneous 0-heart wipe: more hearts wins, then KOs, then active/healthy/tie-score
      if (blueHearts !== redHearts) {
        const winTeam = blueHearts > redHearts ? 0 : 1;
        concludeMatch(sim, winTeam === 0 ? MATCH_PHASES.VICTORY : MATCH_PHASES.DEFEAT, winTeam);
      } else if (blueKos !== redKos) {
        const winTeam = blueKos > redKos ? 0 : 1;
        concludeMatch(sim, winTeam === 0 ? MATCH_PHASES.VICTORY : MATCH_PHASES.DEFEAT, winTeam);
      } else if (blueActive !== redActive) {
        const winTeam = blueActive > redActive ? 0 : 1;
        concludeMatch(sim, winTeam === 0 ? MATCH_PHASES.VICTORY : MATCH_PHASES.DEFEAT, winTeam);
      } else if (blueHealthy !== redHealthy) {
        const winTeam = blueHealthy > redHealthy ? 0 : 1;
        concludeMatch(sim, winTeam === 0 ? MATCH_PHASES.VICTORY : MATCH_PHASES.DEFEAT, winTeam);
      } else {
        const bTie = computeTeamCombatTieScore(sim, 0);
        const rTie = computeTeamCombatTieScore(sim, 1);
        const winTeam = bTie >= rTie ? 0 : 1;
        concludeMatch(sim, winTeam === 0 ? MATCH_PHASES.VICTORY : MATCH_PHASES.DEFEAT, winTeam);
      }
    }
  } else if (sim.modeId === 'bun_grab') {
    // Replenish central shrine buns
    const targetBuns = sim.activeBunTarget ?? ACTIVE_BUN_TARGET;
    if (countTotalBunsInPlay(sim) < targetBuns) {
      if (sim.bunRespawnTimer > 0) {
        sim.bunRespawnTimer -= dt;
      }
      if (sim.bunRespawnTimer <= 1e-9) {
        spawnShrineBunsUpToTarget(sim, targetBuns);
      }
    }

    // Check bun snatch & Home Base delivery
    for (let pi = 0; pi < sim.players.length; pi += 1) {
      const p = sim.players[pi];
      if (p.state !== PLAYER_STATES.ALIVE) continue;

      if (!p.carryingBun && p.bunPickupLockSec <= 0) {
        for (let bi = sim.looseBuns.length - 1; bi >= 0; bi -= 1) {
          const bun = sim.looseBuns[bi];
          const dist = Math.hypot(p.x - bun.x, p.z - bun.z);
          if (dist <= 0.65 || (p.col === bun.col && p.row === bun.row)) {
            sim.looseBuns.splice(bi, 1);
            p.carryingBun = true;
            p.carriedBuns = 1;
            p.effectiveSpeed = computeEffectiveSpeed(p);
            sim.events.push({
              type: EVENT_TYPES.BUN_PICKUP,
              playerId: p.id,
              bunId: bun.id,
              col: bun.col,
              row: bun.row,
            });
            break;
          }
        }
      }

      if (p.carryingBun) {
        const targetTile =
          p.team === 0 ? TILE_TYPE.TEAM_BASE_BLUE : TILE_TYPE.TEAM_BASE_RED;
        if (sim.grid[p.row][p.col] === targetTile) {
          p.carryingBun = false;
          p.carriedBuns = 0;
          p.stats.bunsBanked += 1;
          p.effectiveSpeed = computeEffectiveSpeed(p);

          if (p.team === 0) sim.teamScores.blue += 1;
          else sim.teamScores.red += 1;

          sim.bunRespawnTimer = BUN_RESPAWN_DELAY_SEC;
          sim.events.push({
            type: EVENT_TYPES.BUN_SCORE,
            playerId: p.id,
            team: p.team,
            blueScore: sim.teamScores.blue,
            redScore: sim.teamScores.red,
          });
        }
      }
    }

    // Win check: first to 3 buns, or Golden-Bun Sudden Death lead, or timer expiration
    if (sim.teamScores.blue >= BUN_WIN_SCORE) {
      concludeMatch(sim, MATCH_PHASES.VICTORY, 0);
      return;
    }
    if (sim.teamScores.red >= BUN_WIN_SCORE) {
      concludeMatch(sim, MATCH_PHASES.DEFEAT, 1);
      return;
    }
    if (sim.inOvertime && sim.teamScores.blue !== sim.teamScores.red) {
      const winTeam = sim.teamScores.blue > sim.teamScores.red ? 0 : 1;
      concludeMatch(sim, winTeam === 0 ? MATCH_PHASES.VICTORY : MATCH_PHASES.DEFEAT, winTeam);
      return;
    }
    if (sim.timeRemainingSec <= 1e-9) {
      if (!sim.inOvertime && sim.teamScores.blue === sim.teamScores.red) {
        sim.inOvertime = true;
        sim.timeRemainingSec = OVERTIME_DURATION_SEC;
        spawnShrineBunsUpToTarget(sim);
      } else {
        let winTeam = 0;
        if (sim.teamScores.blue !== sim.teamScores.red) {
          winTeam = sim.teamScores.blue > sim.teamScores.red ? 0 : 1;
        } else {
          const bTie = computeTeamCombatTieScore(sim, 0);
          const rTie = computeTeamCombatTieScore(sim, 1);
          winTeam = bTie >= rTie ? 0 : 1;
        }
        concludeMatch(sim, winTeam === 0 ? MATCH_PHASES.VICTORY : MATCH_PHASES.DEFEAT, winTeam);
      }
    }
  } else if (sim.modeId === 'boss_golem') {
    if (sim.boss && sim.boss.hp <= 0) {
      concludeMatch(sim, MATCH_PHASES.VICTORY, 0);
      return;
    }

    const anyHeroActiveOrRespawning = sim.players.some(
      (p) => p.state !== PLAYER_STATES.ELIMINATED || p.respawnTimer > 0
    );
    if (!anyHeroActiveOrRespawning || sim.timeRemainingSec <= 1e-9) {
      concludeMatch(sim, MATCH_PHASES.DEFEAT, 1);
    }
  }
}

/**
 * Computes 1st–4th Victory Podium rankings matching PROJECT.md § Interface Contracts.
 */
export function computeRankings(sim) {
  const sorted = sim.players.slice().sort((a, b) => {
    if (sim.winningTeam !== null) {
      const aWin = a.team === sim.winningTeam ? 1 : 0;
      const bWin = b.team === sim.winningTeam ? 1 : 0;
      if (aWin !== bWin) return bWin - aWin;
    }
    const scoreA =
      a.stats.bunsBanked * 100 +
      a.stats.kos * 20 +
      a.stats.rescues * 15 +
      a.stats.blocksBroken * 2 +
      (a.state !== PLAYER_STATES.ELIMINATED ? 5 : 0);
    const scoreB =
      b.stats.bunsBanked * 100 +
      b.stats.kos * 20 +
      b.stats.rescues * 15 +
      b.stats.blocksBroken * 2 +
      (b.state !== PLAYER_STATES.ELIMINATED ? 5 : 0);
    if (scoreA !== scoreB) return scoreB - scoreA;
    if (a.id === 'p1') return -1;
    if (b.id === 'p1') return 1;
    return a.id.localeCompare(b.id);
  });

  return sorted.map((p, index) => ({
    rank: index + 1,
    playerId: p.id,
    characterId: p.characterId,
    nameZh: p.nameZh,
    team: p.team,
    kos: p.stats.kos,
    rescues: p.stats.rescues,
    bunsBanked: p.stats.bunsBanked,
    isWinner: sim.winningTeam !== null ? p.team === sim.winningTeam : index === 0,
  }));
}
