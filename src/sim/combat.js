/**
 * Sugar bubble fuses, 4-way cardinal ray clamping (before HARD_WALL, halting at first SOFT_BLOCK),
 * synchronous cycle-safe BFS chain detonation (E02, E03), soft-block loot rolls with 0.55s blast grace (E04),
 * strict damage mitigation stack (Invuln > Shield > Mount > Trap, E05, E06),
 * Ally Rescue > Needle Self-Rescue > Enemy Pop > Trap Timeout (E07, E08), and floor pickup collection.
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

import {
  BLAST_HURT_HALF_EXTENT,
  BLAST_LINGER_SEC,
  BOSS_HIT_INVULN_SEC,
  CARDINAL_DIRS,
  DISMOUNT_INVULN_SEC,
  EVENT_TYPES,
  GRID_COLS,
  GRID_ROWS,
  ITEM_METADATA,
  ITEM_TYPES,
  PICKUP_COLLECT_DIST,
  PICKUP_SPAWN_GRACE_SEC,
  PLAYER_CONTACT_DIST,
  PLAYER_STATES,
  RESCUE_INVULN_SEC,
  SOFT_BLOCK_DROP_RATE,
  TILE_TYPE,
  TRAP_DURATION_SEC,
} from '../contracts/constants.js';
import { applyPickupToPlayer, computeEffectiveSpeed } from './characters.js';
import { isInBounds } from './arenas.js';
import { clamp, shatterOverlappingSoftBlocks } from './physics.js';

const ALL_LOOT_ITEMS = Object.freeze([
  ITEM_METADATA[ITEM_TYPES.BUBBLE],
  ITEM_METADATA[ITEM_TYPES.POWER],
  ITEM_METADATA[ITEM_TYPES.SPEED],
  ITEM_METADATA[ITEM_TYPES.KICK],
  ITEM_METADATA[ITEM_TYPES.NEEDLE],
  ITEM_METADATA[ITEM_TYPES.SHIELD],
  ITEM_METADATA[ITEM_TYPES.TURTLE],
  ITEM_METADATA[ITEM_TYPES.UFO],
]);

/**
 * Rolls a random pickup item from the weighted loot table.
 */
export function rollRandomLootType(rng) {
  const chosen = rng.pickWeighted(ALL_LOOT_ITEMS, (entry) => entry.dropWeight);
  return chosen.id;
}

/**
 * Spawns a floor pickup at (col, row) with blast spawn grace.
 */
export function spawnPickup(sim, type, col, row, graceSec = PICKUP_SPAWN_GRACE_SEC) {
  const pickup = {
    id: sim.nextEntityId++,
    type,
    col,
    row,
    x: col + 0.5,
    z: row + 0.5,
    spawnGraceSec: graceSec,
  };
  sim.pickups.push(pickup);
  return pickup;
}

/**
 * Builds the set of currently active blast tiles mapped to an ownerId.
 * @returns {Map<string, {col: number, row: number, ownerId: string}>}
 */
export function collectActiveBlastTileMap(sim) {
  const map = new Map();
  for (let i = 0; i < sim.blasts.length; i += 1) {
    const blast = sim.blasts[i];
    if (blast.remainingSec <= 0) continue;
    for (let ti = 0; ti < blast.tiles.length; ti += 1) {
      const t = blast.tiles[ti];
      const key = `${t.col},${t.row}`;
      if (!map.has(key)) {
        map.set(key, { col: t.col, row: t.row, ownerId: blast.ownerId });
      }
    }
  }
  return map;
}

/**
 * Decrements active blast linger timers and pickup spawn grace timers,
 * and ticks down bubble fuses + resolves synchronous BFS chain detonations (F05, F06, F07, E02, E03, E04).
 */
export function stepBubblesAndBlasts(sim, dt) {
  // 1. Decay existing lingering blasts & pickup spawn grace timers
  for (let i = sim.blasts.length - 1; i >= 0; i -= 1) {
    sim.blasts[i].remainingSec -= dt;
    if (sim.blasts[i].remainingSec <= 1e-9) {
      sim.blasts.splice(i, 1);
    }
  }

  for (let i = 0; i < sim.pickups.length; i += 1) {
    if (sim.pickups[i].spawnGraceSec > 0) {
      sim.pickups[i].spawnGraceSec = Math.max(0, sim.pickups[i].spawnGraceSec - dt);
    }
  }

  // 2. Check existing active blast tiles (e.g. for sliding bubbles entering a lingering blast ray, E09b)
  const preExistingBlastMap = collectActiveBlastTileMap(sim);
  const queue = [];
  const queuedIds = new Set();

  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    b.fuseRemaining -= dt;
    const qCol = clamp(Math.floor(b.x), 0, GRID_COLS - 1);
    const qRow = clamp(Math.floor(b.z), 0, GRID_ROWS - 1);
    const hitByLingering = preExistingBlastMap.has(`${qCol},${qRow}`);

    if (b.fuseRemaining <= 1e-9 || hitByLingering) {
      if (hitByLingering) {
        b.col = qCol;
        b.row = qRow;
        b.x = qCol + 0.5;
        b.z = qRow + 0.5;
        b.sliding = false;
        b.vx = 0;
        b.vz = 0;
      }
      queue.push({ bubble: b, isChain: hitByLingering });
      queuedIds.add(b.id);
    }
  }

  if (queue.length > 0) {
    const detonatedIds = new Set();
    // Defer mutating grid[r][c] = EMPTY until the entire same-tick BFS wave finishes
    // so parallel chained rays in the same tick still clamp at the FIRST soft block (E03)!
    const softBlocksBrokenMap = new Map();

    let head = 0;
    while (head < queue.length) {
      const { bubble: b, isChain } = queue[head++];
      if (detonatedIds.has(b.id)) continue;
      detonatedIds.add(b.id);

      const originCol = clamp(Math.round(b.x - 0.5), 0, GRID_COLS - 1);
      const originRow = clamp(Math.round(b.z - 0.5), 0, GRID_ROWS - 1);
      b.col = originCol;
      b.row = originRow;
      b.x = originCol + 0.5;
      b.z = originRow + 0.5;

      const owner = sim.playersById.get(b.ownerId);
      if (owner) {
        owner.activeBubbles = Math.max(0, owner.activeBubbles - 1);
      }

      const tiles = [{ col: originCol, row: originRow, dir: 'center' }];

      // Enqueue any other bubble sharing origin tile
      for (let bi = 0; bi < sim.bubbles.length; bi += 1) {
        const ob = sim.bubbles[bi];
        if (!queuedIds.has(ob.id)) {
          const oc = clamp(Math.floor(ob.x), 0, GRID_COLS - 1);
          const or = clamp(Math.floor(ob.z), 0, GRID_ROWS - 1);
          if (oc === originCol && or === originRow) {
            queuedIds.add(ob.id);
            queue.push({ bubble: ob, isChain: true });
          }
        }
      }

      // Trace 4 cardinal blast rays
      for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
        const { name: dirName, dc, dr } = CARDINAL_DIRS[di];
        for (let step = 1; step <= b.blastRange; step += 1) {
          const tc = originCol + dc * step;
          const tr = originRow + dr * step;
          if (!isInBounds(tc, tr)) break;

          const cell = sim.grid[tr][tc];
          // Clamped strictly BEFORE HARD_WALL
          if (cell === TILE_TYPE.HARD_WALL) {
            break;
          }

          tiles.push({ col: tc, row: tr, dir: dirName });

          // Halts AT (and destroys) the FIRST SOFT_BLOCK per ray (E03)
          if (cell === TILE_TYPE.SOFT_BLOCK) {
            const key = `${tc},${tr}`;
            if (!softBlocksBrokenMap.has(key)) {
              softBlocksBrokenMap.set(key, { col: tc, row: tr, ownerId: b.ownerId });
            }
            break;
          }

          // Trigger synchronous BFS chain detonation on any intersected bubble (F07, E02)
          for (let bi = 0; bi < sim.bubbles.length; bi += 1) {
            const ob = sim.bubbles[bi];
            if (queuedIds.has(ob.id)) continue;
            const oc = clamp(Math.floor(ob.x), 0, GRID_COLS - 1);
            const or = clamp(Math.floor(ob.z), 0, GRID_ROWS - 1);
            if (oc === tc && or === tr) {
              ob.col = tc;
              ob.row = tr;
              ob.x = tc + 0.5;
              ob.z = tr + 0.5;
              ob.sliding = false;
              ob.vx = 0;
              ob.vz = 0;
              queuedIds.add(ob.id);
              queue.push({ bubble: ob, isChain: true });
            }
          }
        }
      }

      sim.blasts.push({
        id: sim.nextEntityId++,
        ownerId: b.ownerId,
        originCol,
        originRow,
        tiles,
        remainingSec: BLAST_LINGER_SEC,
      });

      sim.events.push({
        type: isChain ? EVENT_TYPES.CHAIN_EXPLODE : EVENT_TYPES.EXPLODE,
        bubbleId: b.id,
        ownerId: b.ownerId,
        col: originCol,
        row: originRow,
        range: b.blastRange,
      });
    }

    // Remove detonated bubbles
    sim.bubbles = sim.bubbles.filter((b) => !detonatedIds.has(b.id));

    // Destroy exposed pre-existing pickups (whose spawnGraceSec === 0) on newly blasted tiles
    const postWaveBlastMap = collectActiveBlastTileMap(sim);
    sim.pickups = sim.pickups.filter((item) => {
      if (item.spawnGraceSec > 0) return true;
      return !postWaveBlastMap.has(`${item.col},${item.row}`);
    });

    // Finalize broken SOFT_BLOCKs and spawn fresh loot with 0.55s spawnGraceSec (E04)
    for (const broken of softBlocksBrokenMap.values()) {
      sim.grid[broken.row][broken.col] = TILE_TYPE.EMPTY;
      const breaker = sim.playersById.get(broken.ownerId);
      if (breaker) {
        breaker.stats.blocksBroken += 1;
      }
      sim.events.push({
        type: EVENT_TYPES.BLOCK_BREAK,
        col: broken.col,
        row: broken.row,
        playerId: broken.ownerId,
      });

      if (!sim.disableRandomDrops && sim.rng.chance(SOFT_BLOCK_DROP_RATE)) {
        const dropType = rollRandomLootType(sim.rng);
        spawnPickup(sim, dropType, broken.col, broken.row, PICKUP_SPAWN_GRACE_SEC);
      }
    }
  } else if (preExistingBlastMap.size > 0) {
    // Lingering blasts also vaporize unprotected pickups if grace expired
    sim.pickups = sim.pickups.filter((item) => {
      if (item.spawnGraceSec > 0) return true;
      return !preExistingBlastMap.has(`${item.col},${item.row}`);
    });
  }
}

/**
 * Applies a single blast hit to an 'alive' player following the strict mitigation priority:
 * 1. invulnTimer > 0 -> ignore
 * 2. hasShield -> consume shield + 1.1s invuln (mount preserved, E06)
 * 3. mount ('turtle' | 'ufo') -> sacrifice mount + 1.1s invuln, rider stays 'alive' & untrapped (E05, E06)
 * 4. -> state = 'trapped' (trapTimer = 5.5s, 0.22x speed, drop carried bun if any, E11)
 */
export function applyBlastHitToPlayer(sim, player, attackerId, dropBunCallback) {
  if (player.state !== PLAYER_STATES.ALIVE) return false;
  if (player.invulnTimer > 0) return false;

  if (player.hasShield) {
    player.hasShield = false;
    player.invulnTimer = DISMOUNT_INVULN_SEC;
    sim.events.push({
      type: EVENT_TYPES.SHIELD_BREAK,
      playerId: player.id,
      x: player.x,
      z: player.z,
    });
    return true;
  }

  if (player.mount === ITEM_TYPES.TURTLE || player.mount === ITEM_TYPES.UFO) {
    const brokenMount = player.mount;
    player.mount = null;
    player.invulnTimer = DISMOUNT_INVULN_SEC;
    player.effectiveSpeed = computeEffectiveSpeed(player);
    if (brokenMount === ITEM_TYPES.UFO) {
      shatterOverlappingSoftBlocks(sim, player);
    }
    sim.events.push({
      type: EVENT_TYPES.MOUNT_BREAK,
      playerId: player.id,
      mount: brokenMount,
      x: player.x,
      z: player.z,
    });
    return true;
  }

  // Transition to giant water bubble trap (never instant death!)
  player.state = PLAYER_STATES.TRAPPED;
  player.trapTimer = TRAP_DURATION_SEC;
  player.trappedBy = attackerId || null;

  if (player.carryingBun && typeof dropBunCallback === 'function') {
    dropBunCallback(sim, player);
  }
  player.effectiveSpeed = computeEffectiveSpeed(player);

  sim.events.push({
    type: EVENT_TYPES.TRAP,
    playerId: player.id,
    attackerId: attackerId || null,
    x: player.x,
    z: player.z,
  });
  return true;
}

/**
 * Eliminates a player (from Enemy Pop or Trap Timeout), awarding KO credit and handling bun drop.
 */
export function eliminatePlayer(sim, player, creditPlayerId, reason, onPlayerEliminated, dropBunCallback) {
  if (player.state === PLAYER_STATES.ELIMINATED) return;

  if (player.carryingBun && typeof dropBunCallback === 'function') {
    dropBunCallback(sim, player);
  }

  player.state = PLAYER_STATES.ELIMINATED;
  player.trapTimer = 0;
  player.isMoving = false;
  player.mount = null;
  player.hasShield = false;
  player.effectiveSpeed = 0;

  if (creditPlayerId && creditPlayerId !== player.id) {
    const killer = sim.playersById.get(creditPlayerId);
    if (killer && killer.team !== player.team) {
      killer.stats.kos += 1;
    }
  }

  sim.events.push({
    type: EVENT_TYPES.POP,
    playerId: player.id,
    popperId: creditPlayerId || null,
    reason,
    x: player.x,
    z: player.z,
  });

  if (typeof onPlayerEliminated === 'function') {
    onPlayerEliminated(sim, player);
  }
}

/**
 * Resolves Blast Hits (on players & Boss), Needle self-rescue, Ally Rescue, Enemy Pop,
 * Trap Timeout, and Floor Pickup collection in deterministic priority order.
 */
export function resolveCombatAndInteractions(
  sim,
  intentsByPlayerId,
  dt,
  { onPlayerEliminated, dropBunCallback, onBossDamaged } = {}
) {
  // 1. Decay player timers (invulnTimer, bunPickupLockSec)
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.invulnTimer > 0) {
      p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    }
    if (p.bunPickupLockSec > 0) {
      p.bunPickupLockSec = Math.max(0, p.bunPickupLockSec - dt);
    }
  }

  // 2. Apply active blasts to 'alive' players and Mechanical Golem Boss
  if (sim.blasts.length > 0) {
    for (let pi = 0; pi < sim.players.length; pi += 1) {
      const p = sim.players[pi];
      if (p.state !== PLAYER_STATES.ALIVE || p.invulnTimer > 0) continue;

      let hitOwnerId = null;
      for (let bi = 0; bi < sim.blasts.length && !hitOwnerId; bi += 1) {
        const blast = sim.blasts[bi];
        if (blast.remainingSec <= 0) continue;
        for (let ti = 0; ti < blast.tiles.length; ti += 1) {
          const t = blast.tiles[ti];
          if (
            Math.abs(p.x - (t.col + 0.5)) < BLAST_HURT_HALF_EXTENT &&
            Math.abs(p.z - (t.row + 0.5)) < BLAST_HURT_HALF_EXTENT
          ) {
            hitOwnerId = blast.ownerId || 'arena';
            break;
          }
        }
      }

      if (hitOwnerId) {
        applyBlastHitToPlayer(sim, p, hitOwnerId, dropBunCallback);
      }
    }

    // Boss blast damage check (0.45s i-frame per wave; Boss ignores its own blasts, E12)
    if (sim.boss && sim.boss.state !== 'defeated' && sim.boss.hp > 0 && sim.boss.invulnTimer <= 0) {
      const bx0 = sim.boss.x - sim.boss.widthTiles * 0.5;
      const bx1 = sim.boss.x + sim.boss.widthTiles * 0.5;
      const bz0 = sim.boss.z - sim.boss.heightTiles * 0.5;
      const bz1 = sim.boss.z + sim.boss.heightTiles * 0.5;

      let bossAttackerId = null;
      for (let bi = 0; bi < sim.blasts.length && !bossAttackerId; bi += 1) {
        const blast = sim.blasts[bi];
        if (blast.remainingSec <= 0 || blast.ownerId === 'boss') continue;
        for (let ti = 0; ti < blast.tiles.length; ti += 1) {
          const t = blast.tiles[ti];
          const tx = t.col + 0.5;
          const tz = t.row + 0.5;
          if (tx > bx0 - 0.15 && tx < bx1 + 0.15 && tz > bz0 - 0.15 && tz < bz1 + 0.15) {
            bossAttackerId = blast.ownerId;
            break;
          }
        }
      }

      if (bossAttackerId) {
        sim.boss.hp = Math.max(0, sim.boss.hp - 1);
        sim.boss.invulnTimer = BOSS_HIT_INVULN_SEC;
        sim.boss.phase = sim.boss.hp <= Math.floor(sim.boss.maxHp * 0.5) ? 2 : 1;
        sim.events.push({
          type: EVENT_TYPES.BOSS_HIT,
          hp: sim.boss.hp,
          maxHp: sim.boss.maxHp,
          attackerId: bossAttackerId,
        });
        if (typeof onBossDamaged === 'function') {
          onBossDamaged(sim, bossAttackerId);
        }
      }
    }
  }

  // 3. Trapped State Resolution in Strict Priority Order:
  //    Priority 1: Teammate Contact Rescue (F10 — wins same-tick tie over Enemy Pop, E08!)
  for (let i = 0; i < sim.players.length; i += 1) {
    const trapped = sim.players[i];
    if (trapped.state !== PLAYER_STATES.TRAPPED) continue;

    for (let j = 0; j < sim.players.length; j += 1) {
      if (i === j) continue;
      const ally = sim.players[j];
      if (ally.state !== PLAYER_STATES.ALIVE || ally.team !== trapped.team) continue;
      const dist = Math.hypot(ally.x - trapped.x, ally.z - trapped.z);
      if (dist <= PLAYER_CONTACT_DIST) {
        trapped.state = PLAYER_STATES.ALIVE;
        trapped.trapTimer = 0;
        trapped.trappedBy = null;
        trapped.invulnTimer = RESCUE_INVULN_SEC;
        trapped.effectiveSpeed = computeEffectiveSpeed(trapped);
        ally.stats.rescues += 1;
        sim.events.push({
          type: EVENT_TYPES.RESCUE,
          playerId: trapped.id,
          rescuerId: ally.id,
          x: trapped.x,
          z: trapped.z,
        });
        break;
      }
    }
  }

  //    Priority 2: Needle Self-Rescue (F17 — safe no-op if 'alive' or 'eliminated', E07!)
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    const intent = intentsByPlayerId.get(p.id);
    if (!intent || !intent.useItem) continue;

    if (p.state === PLAYER_STATES.TRAPPED && p.needles > 0) {
      p.needles -= 1;
      p.state = PLAYER_STATES.ALIVE;
      p.trapTimer = 0;
      p.trappedBy = null;
      p.invulnTimer = RESCUE_INVULN_SEC;
      p.effectiveSpeed = computeEffectiveSpeed(p);
      sim.events.push({
        type: EVENT_TYPES.NEEDLE_RESCUE,
        playerId: p.id,
        x: p.x,
        z: p.z,
      });
    }
  }

  //    Priority 3: Enemy Contact Pop (F09)
  for (let i = 0; i < sim.players.length; i += 1) {
    const trapped = sim.players[i];
    if (trapped.state !== PLAYER_STATES.TRAPPED) continue;

    for (let j = 0; j < sim.players.length; j += 1) {
      if (i === j) continue;
      const enemy = sim.players[j];
      if (enemy.state !== PLAYER_STATES.ALIVE || enemy.team === trapped.team) continue;
      const dist = Math.hypot(enemy.x - trapped.x, enemy.z - trapped.z);
      if (dist <= PLAYER_CONTACT_DIST) {
        eliminatePlayer(sim, trapped, enemy.id, 'enemy_pop', onPlayerEliminated, dropBunCallback);
        break;
      }
    }
  }

  //    Priority 4: Trap Timeout Self-Burst (F11)
  for (let i = 0; i < sim.players.length; i += 1) {
    const trapped = sim.players[i];
    if (trapped.state !== PLAYER_STATES.TRAPPED) continue;
    trapped.trapTimer -= dt;
    if (trapped.trapTimer <= 1e-9) {
      eliminatePlayer(
        sim,
        trapped,
        trapped.trappedBy,
        'timeout',
        onPlayerEliminated,
        dropBunCallback
      );
    }
  }

  // 4. Floor Pickup & Mount Collection by 'alive' players (F13–F20)
  for (let pi = 0; pi < sim.players.length; pi += 1) {
    const p = sim.players[pi];
    if (p.state !== PLAYER_STATES.ALIVE) continue;

    for (let ii = sim.pickups.length - 1; ii >= 0; ii -= 1) {
      const item = sim.pickups[ii];
      const dist = Math.hypot(p.x - item.x, p.z - item.z);
      if (dist <= PICKUP_COLLECT_DIST || (p.col === item.col && p.row === item.row)) {
        const { appliedType, previousMount } = applyPickupToPlayer(p, item.type);
        if (appliedType) {
          if (previousMount === ITEM_TYPES.UFO && p.mount !== ITEM_TYPES.UFO) {
            shatterOverlappingSoftBlocks(sim, p);
          }
          sim.pickups.splice(ii, 1);
          sim.events.push({
            type: EVENT_TYPES.PICKUP,
            playerId: p.id,
            itemType: appliedType,
            col: item.col,
            row: item.row,
          });
          if (appliedType === ITEM_TYPES.TURTLE || appliedType === ITEM_TYPES.UFO) {
            sim.events.push({
              type: EVENT_TYPES.MOUNT_RIDE,
              playerId: p.id,
              mount: appliedType,
              x: p.x,
              z: p.z,
            });
          }
        }
      }
    }
  }
}
