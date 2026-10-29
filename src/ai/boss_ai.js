/**
 * 2-Phase 2x2 Mechanical Golem (机械傀儡) Boss AI for Mode 3 ('boss_golem').
 *
 * Phase 1 (> 50% HP):
 *   - Deliberate central arena patrol (crushes SOFT_BLOCKs in path, pushes overlapping heroes clear)
 *   - 1.2s floor-telegraphed attacks:
 *       1) 'sky_bomb_barrage' (targeted cross blasts near heroes)
 *       2) 'steam_shockwave' (4-way cardinal steam blast lanes from 2x2 chassis)
 *
 * Phase 2 (<= 50% HP — Overdrive):
 *   - Faster patrol & shorter cooldowns
 *   - Adds 3rd telegraphed attack:
 *       3) 'gear_crate_drop' (summons destructible gear-crates + ticking 3.0s hazard bombs)
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

import {
  BLAST_LINGER_SEC,
  BOSS_TELEGRAPH_SEC,
  BUBBLE_FUSE_SEC,
  CARDINAL_DIRS,
  EVENT_TYPES,
  GRID_COLS,
  GRID_ROWS,
  PLAYER_RADIUS,
  PLAYER_STATES,
  SOFT_BLOCK_DROP_RATE,
  TILE_TYPE,
  PICKUP_SPAWN_GRACE_SEC,
} from '../contracts/constants.js';
import { isInBounds } from '../sim/arenas.js';
import { rollRandomLootType, spawnPickup } from '../sim/combat.js';
import {
  clamp,
  isTileOpenForPlayer,
  pruneBubblePassThrough,
  resolvePlayerCollisions,
} from '../sim/physics.js';

function isBossFootprintClearOfHardWalls(grid, centerX, centerZ) {
  const minC = Math.floor(centerX - 1.0 + 0.04);
  const maxC = Math.floor(centerX + 1.0 - 0.04);
  const minR = Math.floor(centerZ - 1.0 + 0.04);
  const maxR = Math.floor(centerZ + 1.0 - 0.04);

  if (minC < 1 || maxC >= GRID_COLS - 1 || minR < 1 || maxR >= GRID_ROWS - 1) {
    return false;
  }

  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (grid[r][c] === TILE_TYPE.HARD_WALL) {
        return false;
      }
    }
  }
  return true;
}

function crushSoftBlocksUnderBoss(sim, boss) {
  const minC = clamp(Math.floor(boss.x - 0.96), 0, GRID_COLS - 1);
  const maxC = clamp(Math.floor(boss.x + 0.96), 0, GRID_COLS - 1);
  const minR = clamp(Math.floor(boss.z - 0.96), 0, GRID_ROWS - 1);
  const maxR = clamp(Math.floor(boss.z + 0.96), 0, GRID_ROWS - 1);

  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (sim.grid[r][c] === TILE_TYPE.SOFT_BLOCK) {
        sim.grid[r][c] = TILE_TYPE.EMPTY;
        sim.events.push({
          type: EVENT_TYPES.BLOCK_BREAK,
          col: c,
          row: r,
          playerId: 'boss',
        });
      }
    }
  }
}

function isOutsideBossFootprint(boss, halfW, halfH, x, z) {
  return Math.abs(x - boss.x) >= halfW - 1e-5 || Math.abs(z - boss.z) >= halfH - 1e-5;
}

function hasCorridorOutOfBoss(sim, boss, halfW, halfH, startC, startR, dc, dr, player) {
  let c = startC;
  let r = startR;
  for (let step = 1; step <= 4; step += 1) {
    c += dc;
    r += dr;
    if (!isTileOpenForPlayer(sim, c, r, player)) {
      return false;
    }
    const minSafeX = c + (isTileOpenForPlayer(sim, c - 1, r, player) ? 0 : PLAYER_RADIUS);
    const maxSafeX = c + 1 - (isTileOpenForPlayer(sim, c + 1, r, player) ? 0 : PLAYER_RADIUS);
    const minSafeZ = r + (isTileOpenForPlayer(sim, c, r - 1, player) ? 0 : PLAYER_RADIUS);
    const maxSafeZ = r + 1 - (isTileOpenForPlayer(sim, c, r + 1, player) ? 0 : PLAYER_RADIUS);

    if (dc < 0 && minSafeX <= boss.x - halfW + 1e-4) return true;
    if (dc > 0 && maxSafeX >= boss.x + halfW - 1e-4) return true;
    if (dr < 0 && minSafeZ <= boss.z - halfH + 1e-4) return true;
    if (dr > 0 && maxSafeZ >= boss.z + halfH - 1e-4) return true;

    // Also valid if stepping into (c, r) unblocks an immediate perpendicular tile that exits Boss
    if (dc !== 0) {
      if (isTileOpenForPlayer(sim, c, r + 1, player) && r + 2 - PLAYER_RADIUS >= boss.z + halfH - 1e-4) {
        return true;
      }
      if (isTileOpenForPlayer(sim, c, r - 1, player) && r + PLAYER_RADIUS <= boss.z - halfH + 1e-4) {
        return true;
      }
    } else {
      if (isTileOpenForPlayer(sim, c + 1, r, player) && c + 2 - PLAYER_RADIUS >= boss.x + halfW - 1e-4) {
        return true;
      }
      if (isTileOpenForPlayer(sim, c - 1, r, player) && c + PLAYER_RADIUS <= boss.x - halfW + 1e-4) {
        return true;
      }
    }
  }
  return false;
}

function pushPlayersOutOfBossFootprint(sim, boss) {
  const halfW = boss.widthTiles * 0.5 + PLAYER_RADIUS * 0.85;
  const halfH = boss.heightTiles * 0.5 + PLAYER_RADIUS * 0.85;
  const MAX_PUSH_STEP = 0.22; // Strictly < PLAYER_RADIUS (0.36) so pushback never tunnels 1-tile walls
  let movedAny = false;

  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.state === PLAYER_STATES.ELIMINATED) continue;
    const dx = p.x - boss.x;
    const dz = p.z - boss.z;
    if (Math.abs(dx) >= halfW || Math.abs(dz) >= halfH) continue;

    const penX = halfW - Math.abs(dx);
    const penZ = halfH - Math.abs(dz);
    const pos = { x: p.x, z: p.z };

    // 1. Primary minimum-penetration axis push + static/bubble collision projection
    if (penX < penZ) {
      const goalX = boss.x + (dx >= 0 ? halfW : -halfW);
      pos.x += clamp(goalX - pos.x, -MAX_PUSH_STEP, MAX_PUSH_STEP);
    } else {
      const goalZ = boss.z + (dz >= 0 ? halfH : -halfH);
      pos.z += clamp(goalZ - pos.z, -MAX_PUSH_STEP, MAX_PUSH_STEP);
    }
    resolvePlayerCollisions(sim, p, pos);

    const primMoved = Math.hypot(pos.x - p.x, pos.z - p.z);
    const primNeeded = Math.min(penX, penZ, MAX_PUSH_STEP);

    // 2. If primary push was clamped by a wall/soft-block/bubble, slide along nearest open tangent corridor
    if (
      !isOutsideBossFootprint(boss, halfW, halfH, pos.x, pos.z) &&
      primMoved < primNeeded - 1e-4
    ) {
      const cc = clamp(Math.floor(pos.x), 0, GRID_COLS - 1);
      const rc = clamp(Math.floor(pos.z), 0, GRID_ROWS - 1);
      const escapeDirs = [
        { dc: -1, dr: 0, distToExit: pos.x - (boss.x - halfW) },
        { dc: 1, dr: 0, distToExit: boss.x + halfW - pos.x },
        { dc: 0, dr: -1, distToExit: pos.z - (boss.z - halfH) },
        { dc: 0, dr: 1, distToExit: boss.z + halfH - pos.z },
      ].sort((a, b) => a.distToExit - b.distToExit);

      for (let di = 0; di < escapeDirs.length; di += 1) {
        const { dc, dr, distToExit } = escapeDirs[di];
        if (!hasCorridorOutOfBoss(sim, boss, halfW, halfH, cc, rc, dc, dr, p)) {
          continue;
        }
        const step = Math.min(MAX_PUSH_STEP, Math.max(0.14, distToExit));
        const cand = {
          x: pos.x + dc * step,
          z: pos.z + dr * step,
        };
        if (dc !== 0) {
          cand.z += clamp(rc + 0.5 - cand.z, -0.08, 0.08);
        } else {
          cand.x += clamp(cc + 0.5 - cand.x, -0.08, 0.08);
        }
        resolvePlayerCollisions(sim, p, cand);

        // Re-project onto primary Boss face once tangent slide clears blocking corner
        const reprojected = { x: cand.x, z: cand.z };
        if (penX < penZ) {
          const goalX = boss.x + (reprojected.x - boss.x >= 0 ? halfW : -halfW);
          reprojected.x += clamp(goalX - reprojected.x, -MAX_PUSH_STEP, MAX_PUSH_STEP);
        } else {
          const goalZ = boss.z + (reprojected.z - boss.z >= 0 ? halfH : -halfH);
          reprojected.z += clamp(goalZ - reprojected.z, -MAX_PUSH_STEP, MAX_PUSH_STEP);
        }
        resolvePlayerCollisions(sim, p, reprojected);
        if (isOutsideBossFootprint(boss, halfW, halfH, reprojected.x, reprojected.z)) {
          cand.x = reprojected.x;
          cand.z = reprojected.z;
        }

        if (Math.hypot(cand.x - pos.x, cand.z - pos.z) > 0.01) {
          pos.x = cand.x;
          pos.z = cand.z;
          break;
        }
      }

      resolvePlayerCollisions(sim, p, pos);
    }

    p.x = pos.x;
    p.z = pos.z;
    p.col = clamp(Math.floor(pos.x), 0, GRID_COLS - 1);
    p.row = clamp(Math.floor(pos.z), 0, GRID_ROWS - 1);
    movedAny = true;
  }

  if (movedAny) {
    pruneBubblePassThrough(sim);
  }
}

function dedupeTiles(tiles) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    if (!isInBounds(t.col, t.row)) continue;
    const key = `${t.col},${t.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ col: t.col, row: t.row });
  }
  return out;
}

function buildSkyBombTelegraph(sim, boss) {
  const targets = [];
  const aliveHeroes = sim.players.filter((p) => p.state !== PLAYER_STATES.ELIMINATED);

  // Target near up to 2 heroes + 2–3 random arena tiles
  for (let i = 0; i < Math.min(2, aliveHeroes.length); i += 1) {
    const h = aliveHeroes[(i + boss._attackCycle) % aliveHeroes.length];
    const offsetC = sim.rng.rangeInt(-1, 1);
    const offsetR = sim.rng.rangeInt(-1, 1);
    targets.push({
      col: clamp(h.col + offsetC, 1, GRID_COLS - 2),
      row: clamp(h.row + offsetR, 1, GRID_ROWS - 2),
    });
  }

  const extraBombs = boss.phase === 2 ? 3 : 2;
  for (let k = 0; k < extraBombs; k += 1) {
    targets.push({
      col: sim.rng.rangeInt(2, GRID_COLS - 3),
      row: sim.rng.rangeInt(2, GRID_ROWS - 3),
    });
  }

  const armSteps = boss.phase === 2 ? 2 : 1;
  const warning = [];
  for (let i = 0; i < targets.length; i += 1) {
    const { col, row } = targets[i];
    if (sim.grid[row][col] === TILE_TYPE.HARD_WALL) continue;
    // Skip tiles inside Boss's own 2x2 body
    if (col >= boss.col && col <= boss.col + 1 && row >= boss.row && row <= boss.row + 1) {
      continue;
    }
    warning.push({ col, row });
    for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
      for (let s = 1; s <= armSteps; s += 1) {
        const nc = col + CARDINAL_DIRS[di].dc * s;
        const nr = row + CARDINAL_DIRS[di].dr * s;
        if (!isInBounds(nc, nr) || sim.grid[nr][nc] === TILE_TYPE.HARD_WALL) break;
        warning.push({ col: nc, row: nr });
      }
    }
  }
  return dedupeTiles(warning);
}

function buildSteamShockwaveTelegraph(sim, boss) {
  const range = boss.phase === 2 ? 6 : 5;
  const warning = [];
  const bc = boss.col;
  const br = boss.row;

  // Phase 1 emits 2-tile-wide cardinal steam lanes; Phase 2 widens attacks by 2 tiles (4-tile-wide lanes)
  const rayOrigins = [
    // North
    { c: bc, r: br, dc: 0, dr: -1 },
    { c: bc + 1, r: br, dc: 0, dr: -1 },
    // South
    { c: bc, r: br + 1, dc: 0, dr: 1 },
    { c: bc + 1, r: br + 1, dc: 0, dr: 1 },
    // West
    { c: bc, r: br, dc: -1, dr: 0 },
    { c: bc, r: br + 1, dc: -1, dr: 0 },
    // East
    { c: bc + 1, r: br, dc: 1, dr: 0 },
    { c: bc + 1, r: br + 1, dc: 1, dr: 0 },
  ];
  if (boss.phase === 2) {
    rayOrigins.push(
      { c: bc - 1, r: br, dc: 0, dr: -1 },
      { c: bc + 2, r: br, dc: 0, dr: -1 },
      { c: bc - 1, r: br + 1, dc: 0, dr: 1 },
      { c: bc + 2, r: br + 1, dc: 0, dr: 1 },
      { c: bc, r: br - 1, dc: -1, dr: 0 },
      { c: bc, r: br + 2, dc: -1, dr: 0 },
      { c: bc + 1, r: br - 1, dc: 1, dr: 0 },
      { c: bc + 1, r: br + 2, dc: 1, dr: 0 }
    );
  }

  for (let i = 0; i < rayOrigins.length; i += 1) {
    const orig = rayOrigins[i];
    if (!isInBounds(orig.c, orig.r)) continue;
    for (let step = 1; step <= range; step += 1) {
      const tc = orig.c + orig.dc * step;
      const tr = orig.r + orig.dr * step;
      if (!isInBounds(tc, tr)) break;
      const cell = sim.grid[tr][tc];
      if (cell === TILE_TYPE.HARD_WALL) break;
      warning.push({ col: tc, row: tr });
      if (cell === TILE_TYPE.SOFT_BLOCK) break;
    }
  }
  return dedupeTiles(warning);
}

function buildGearCrateTelegraph(sim, boss) {
  const candidates = [];
  for (let r = 2; r <= GRID_ROWS - 3; r += 1) {
    for (let c = 2; c <= GRID_COLS - 3; c += 1) {
      if (sim.grid[r][c] !== TILE_TYPE.EMPTY) continue;
      if (c >= boss.col - 1 && c <= boss.col + 2 && r >= boss.row - 1 && r <= boss.row + 2) {
        continue;
      }
      const nearPlayer = sim.players.some(
        (p) => Math.hypot(p.x - (c + 0.5), p.z - (r + 0.5)) < 1.8
      );
      if (nearPlayer) continue;
      const hasBubble = sim.bubbles.some((b) => b.col === c && b.row === r);
      if (hasBubble) continue;
      candidates.push({ col: c, row: r });
    }
  }
  const picked = sim.rng.shuffle(candidates).slice(0, 5);
  return dedupeTiles(picked);
}

function executeBossTelegraphedAttack(sim, boss) {
  const attackType = boss.attackType;
  const tiles = boss.telegraphTiles.slice();

  if (attackType === 'sky_bomb_barrage' || attackType === 'steam_shockwave') {
    const blastTiles = [];
    for (let i = 0; i < tiles.length; i += 1) {
      const { col, row } = tiles[i];
      if (!isInBounds(col, row)) continue;
      const cell = sim.grid[row][col];
      if (cell === TILE_TYPE.HARD_WALL) continue;

      blastTiles.push({ col, row, dir: 'center' });

      if (cell === TILE_TYPE.SOFT_BLOCK) {
        sim.grid[row][col] = TILE_TYPE.EMPTY;
        sim.events.push({
          type: EVENT_TYPES.BLOCK_BREAK,
          col,
          row,
          playerId: 'boss',
        });
        if (!sim.disableRandomDrops && sim.rng.chance(SOFT_BLOCK_DROP_RATE)) {
          spawnPickup(sim, rollRandomLootType(sim.rng), col, row, PICKUP_SPAWN_GRACE_SEC);
        }
      }
    }

    if (blastTiles.length > 0) {
      sim.blasts.push({
        id: sim.nextEntityId++,
        ownerId: 'boss',
        originCol: boss.col,
        originRow: boss.row,
        tiles: blastTiles,
        remainingSec: BLAST_LINGER_SEC,
      });
    }
  } else if (attackType === 'gear_crate_drop') {
    let cratesSpawned = 0;
    let bombsSpawned = 0;

    for (let i = 0; i < tiles.length; i += 1) {
      const { col, row } = tiles[i];
      if (!isInBounds(col, row) || sim.grid[row][col] !== TILE_TYPE.EMPTY) continue;
      const nearHero = sim.players.some(
        (p) =>
          p.state !== PLAYER_STATES.ELIMINATED &&
          Math.hypot(p.x - (col + 0.5), p.z - (row + 0.5)) < 1.35
      );
      if (nearHero) continue;

      if (bombsSpawned < 2) {
        const occupiedBubble = sim.bubbles.some((b) => b.col === col && b.row === row);
        if (!occupiedBubble) {
          sim.bubbles.push({
            id: sim.nextEntityId++,
            ownerId: 'boss',
            col,
            row,
            x: col + 0.5,
            z: row + 0.5,
            blastRange: 2,
            fuseRemaining: BUBBLE_FUSE_SEC,
            passThroughIds: [],
            sliding: false,
            vx: 0,
            vz: 0,
          });
          bombsSpawned += 1;
          continue;
        }
      }

      if (cratesSpawned < 3) {
        sim.grid[row][col] = TILE_TYPE.SOFT_BLOCK;
        cratesSpawned += 1;
      }
    }
  }

  sim.events.push({
    type: EVENT_TYPES.BOSS_ATTACK,
    attackType,
    tiles,
  });
}

/**
 * Advances the 2x2 Mechanical Golem Boss state machine for one fixed timestep.
 */
export function stepBossAI(sim, dt) {
  const boss = sim.boss;
  if (!boss || boss.state === 'defeated' || boss.hp <= 0) return;

  if (boss.invulnTimer > 0) {
    boss.invulnTimer = Math.max(0, boss.invulnTimer - dt);
  }
  if (boss._hurtFlashSec > 0) {
    boss._hurtFlashSec = Math.max(0, boss._hurtFlashSec - dt);
  }
  boss.phase = boss.hp <= Math.floor(boss.maxHp * 0.5) ? 2 : 1;

  if (sim.botBehavior === 'idle') {
    pushPlayersOutOfBossFootprint(sim, boss);
    return;
  }

  if (boss.state === 'telegraph') {
    // Settle onto integer 2x2 grid alignment during warning telegraph
    const targetX = boss.col + 1.0;
    const targetZ = boss.row + 1.0;
    boss.x += clamp(targetX - boss.x, -2.5 * dt, 2.5 * dt);
    boss.z += clamp(targetZ - boss.z, -2.5 * dt, 2.5 * dt);

    boss.telegraphRemainingSec = Math.max(0, boss.telegraphRemainingSec - dt);
    if (boss.telegraphRemainingSec <= 1e-9) {
      executeBossTelegraphedAttack(sim, boss);
      boss.state = 'attack';
      boss._attackRecoverySec = 0.45;
      boss.telegraphTiles = [];
      boss.telegraphRemainingSec = 0;
    }
    pushPlayersOutOfBossFootprint(sim, boss);
    return;
  }

  if (boss.state === 'attack') {
    boss._attackRecoverySec -= dt;
    if (boss._attackRecoverySec <= 1e-9) {
      boss.state = 'patrol';
      boss.attackType = null;
      boss._cooldownSec = boss.phase === 2 ? 3.1 : 4.1;
    }
    pushPlayersOutOfBossFootprint(sim, boss);
    return;
  }

  // Patrol state (shows 'hurt' briefly if damaged without interrupting cooldown)
  boss.state = boss._hurtFlashSec > 0 ? 'hurt' : 'patrol';

  // Phase 2 patrol speed is x1.3 of Phase 1 (1.5 * 1.3 = 1.95)
  const moveSpeed = boss.phase === 2 ? 1.95 : 1.5;
  boss._patrolTimer -= dt;
  if (boss._patrolTimer <= 0) {
    boss._patrolTimer = sim.rng.rangeFloat(1.6, 2.8);
    // Bias gently toward arena center / heroes without corner-camping
    const targetX = sim.rng.rangeFloat(5.0, 10.0);
    const targetZ = sim.rng.rangeFloat(4.5, 8.5);
    const dx = targetX - boss.x;
    const dz = targetZ - boss.z;
    const len = Math.hypot(dx, dz) || 1;
    boss._patrolDirX = dx / len;
    boss._patrolDirZ = dz / len;
  }

  const nextX = clamp(boss.x + boss._patrolDirX * moveSpeed * dt, 4.0, GRID_COLS - 4.0);
  const nextZ = clamp(boss.z + boss._patrolDirZ * moveSpeed * dt, 3.0, GRID_ROWS - 3.0);

  if (isBossFootprintClearOfHardWalls(sim.grid, nextX, boss.z)) {
    boss.x = nextX;
  } else {
    boss._patrolDirX = -boss._patrolDirX;
  }

  if (isBossFootprintClearOfHardWalls(sim.grid, boss.x, nextZ)) {
    boss.z = nextZ;
  } else {
    boss._patrolDirZ = -boss._patrolDirZ;
  }

  boss.col = clamp(Math.round(boss.x - 1.0), 1, GRID_COLS - 3);
  boss.row = clamp(Math.round(boss.z - 1.0), 1, GRID_ROWS - 3);

  crushSoftBlocksUnderBoss(sim, boss);
  pushPlayersOutOfBossFootprint(sim, boss);

  // Trigger next telegraphed attack when cooldown expires
  boss._cooldownSec -= dt;
  if (boss._cooldownSec <= 1e-9) {
    const phase1Pool = ['sky_bomb_barrage', 'steam_shockwave'];
    const phase2Pool = ['sky_bomb_barrage', 'steam_shockwave', 'gear_crate_drop'];
    const pool = boss.phase === 2 ? phase2Pool : phase1Pool;
    const attackType = pool[boss._attackCycle % pool.length];
    boss._attackCycle += 1;

    let telegraphTiles = [];
    if (attackType === 'sky_bomb_barrage') {
      telegraphTiles = buildSkyBombTelegraph(sim, boss);
    } else if (attackType === 'steam_shockwave') {
      telegraphTiles = buildSteamShockwaveTelegraph(sim, boss);
    } else {
      telegraphTiles = buildGearCrateTelegraph(sim, boss);
    }

    boss.state = 'telegraph';
    boss.attackType = attackType;
    boss.telegraphTiles = telegraphTiles;
    boss.telegraphRemainingSec = BOSS_TELEGRAPH_SEC;
    sim.events.push({
      type: EVENT_TYPES.BOSS_TELEGRAPH,
      attackType,
      tiles: telegraphTiles.map((t) => ({ col: t.col, row: t.row })),
    });
  }
}
