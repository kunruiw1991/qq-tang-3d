/**
 * Continuous 60Hz arena movement physics, smooth lane-centering corner-assist,
 * walk-off bubble passability & solidification (E01), Kick bubble sliding (F16, E09),
 * and UFO soft-block hover + safe dismount block shattering (F20).
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

import {
  EVENT_TYPES,
  GRID_COLS,
  GRID_ROWS,
  ITEM_TYPES,
  KICK_SLIDE_SPEED,
  PLAYER_RADIUS,
  PLAYER_STATES,
  TILE_TYPE,
} from '../contracts/constants.js';
import { computeEffectiveSpeed } from './characters.js';
import { isInBounds } from './arenas.js';

export function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

/**
 * Exact circle vs axis-aligned rectangle overlap test.
 */
export function circleOverlapsAABB(cx, cz, radius, minX, minZ, maxX, maxZ) {
  const closestX = clamp(cx, minX, maxX);
  const closestZ = clamp(cz, minZ, maxZ);
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return dx * dx + dz * dz < radius * radius - 1e-9;
}

export function circleOverlapsTile(cx, cz, radius, col, row) {
  return circleOverlapsAABB(cx, cz, radius, col, row, col + 1, row + 1);
}

/**
 * Resolves circle penetration against a static blocking AABB [minX, maxX] x [minZ, maxZ].
 */
function pushCircleOutOfAABB(pos, radius, minX, minZ, maxX, maxZ) {
  const closestX = clamp(pos.x, minX, maxX);
  const closestZ = clamp(pos.z, minZ, maxZ);
  const dx = pos.x - closestX;
  const dz = pos.z - closestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius - 1e-10) {
    return false;
  }

  if (distSq > 1e-10) {
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    pos.x += (dx / dist) * push;
    pos.z += (dz / dist) * push;
    return true;
  }

  // Circle center is inside the AABB: eject out of nearest face
  const leftPen = pos.x - minX + radius;
  const rightPen = maxX - pos.x + radius;
  const topPen = pos.z - minZ + radius;
  const botPen = maxZ - pos.z + radius;
  const minPen = Math.min(leftPen, rightPen, topPen, botPen);
  if (minPen === leftPen) pos.x = minX - radius;
  else if (minPen === rightPen) pos.x = maxX + radius;
  else if (minPen === topPen) pos.z = minZ - radius;
  else pos.z = maxZ + radius;
  return true;
}

/**
 * Checks whether grid cell (col, row) is passable for a given player.
 * UFO mount ('alive') glides freely over SOFT_BLOCK tiles, never HARD_WALL.
 */
export function isGridCellPassableForPlayer(grid, col, row, player) {
  if (!isInBounds(col, row)) return false;
  const t = grid[row][col];
  if (t === TILE_TYPE.HARD_WALL) return false;
  if (t === TILE_TYPE.SOFT_BLOCK) {
    return player.state === PLAYER_STATES.ALIVE && player.mount === ITEM_TYPES.UFO;
  }
  return true;
}

/**
 * Checks whether (col, row) is completely open for a player (including solid bubbles).
 */
export function isTileOpenForPlayer(sim, col, row, player) {
  if (!isGridCellPassableForPlayer(sim.grid, col, row, player)) {
    return false;
  }
  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    if (b.col === col && b.row === row && !b.passThroughIds.includes(player.id)) {
      return false;
    }
  }
  return true;
}

/**
 * Shatters any SOFT_BLOCK currently overlapped by player (called when UFO mount breaks
 * or gets replaced so the rider is never wedged inside a soft block).
 */
export function shatterOverlappingSoftBlocks(sim, player) {
  const minC = Math.max(0, Math.floor(player.x - PLAYER_RADIUS));
  const maxC = Math.min(GRID_COLS - 1, Math.floor(player.x + PLAYER_RADIUS));
  const minR = Math.max(0, Math.floor(player.z - PLAYER_RADIUS));
  const maxR = Math.min(GRID_ROWS - 1, Math.floor(player.z + PLAYER_RADIUS));

  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (
        sim.grid[r][c] === TILE_TYPE.SOFT_BLOCK &&
        circleOverlapsTile(player.x, player.z, PLAYER_RADIUS, c, r)
      ) {
        sim.grid[r][c] = TILE_TYPE.EMPTY;
        sim.events.push({
          type: EVENT_TYPES.BLOCK_BREAK,
          col: c,
          row: r,
          playerId: player.id,
          cause: 'ufo_dismount',
        });
      }
    }
  }
}

/**
 * Checks whether a tile (col, row) can be entered by a kicked sliding bubble.
 * Stops before walls, soft blocks, other bubbles, non-eliminated characters, and Boss.
 * (Active blasts DO allow entry so the bubble snaps & chain-detonates per E09b!)
 */
export function isTileFreeForSlidingBubble(sim, col, row, ignoreBubbleId) {
  if (!isInBounds(col, row)) return false;
  const tile = sim.grid[row][col];
  if (tile === TILE_TYPE.HARD_WALL || tile === TILE_TYPE.SOFT_BLOCK) {
    return false;
  }

  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    if (b.id === ignoreBubbleId) continue;
    if (b.col === col && b.row === row) return false;
    if (Math.abs(b.x - (col + 0.5)) < 0.85 && Math.abs(b.z - (row + 0.5)) < 0.85) {
      return false;
    }
  }

  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.state === PLAYER_STATES.ELIMINATED) continue;
    if (circleOverlapsTile(p.x, p.z, PLAYER_RADIUS * 0.92, col, row)) {
      return false;
    }
  }

  if (sim.boss && sim.boss.state !== 'defeated') {
    const bx0 = sim.boss.x - sim.boss.widthTiles * 0.5;
    const bx1 = sim.boss.x + sim.boss.widthTiles * 0.5;
    const bz0 = sim.boss.z - sim.boss.heightTiles * 0.5;
    const bz1 = sim.boss.z + sim.boss.heightTiles * 0.5;
    if (col + 1 > bx0 + 0.05 && col < bx1 - 0.05 && row + 1 > bz0 + 0.05 && row < bz1 - 0.05) {
      return false;
    }
  }

  return true;
}

/**
 * Attempts to place a Sugar Bubble on the player's current grid tile.
 * Seeds all currently overlapping non-eliminated characters into passThroughIds (E01).
 */
export function tryPlaceBubble(sim, player) {
  if (player.state !== PLAYER_STATES.ALIVE) return null;
  if (player.activeBubbles >= player.maxBubbles) return null;

  const col = clamp(Math.floor(player.x), 0, GRID_COLS - 1);
  const row = clamp(Math.floor(player.z), 0, GRID_ROWS - 1);
  const tile = sim.grid[row][col];

  // Cannot place bubble inside hard walls or unbroken soft blocks (e.g. while hovering on UFO)
  if (tile === TILE_TYPE.HARD_WALL || tile === TILE_TYPE.SOFT_BLOCK) {
    return null;
  }

  // Cannot stack two bubbles on the same tile
  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    if (b.col === col && b.row === row) {
      return null;
    }
  }

  const passThroughIds = [];
  for (let i = 0; i < sim.players.length; i += 1) {
    const other = sim.players[i];
    if (other.state === PLAYER_STATES.ELIMINATED) continue;
    if (
      other.id === player.id ||
      circleOverlapsTile(other.x, other.z, PLAYER_RADIUS, col, row)
    ) {
      passThroughIds.push(other.id);
    }
  }

  const bubble = {
    id: sim.nextEntityId++,
    ownerId: player.id,
    col,
    row,
    x: col + 0.5,
    z: row + 0.5,
    blastRange: player.blastRange,
    fuseRemaining: sim.constants.BUBBLE_FUSE_SEC,
    passThroughIds,
    sliding: false,
    vx: 0,
    vz: 0,
  };

  sim.bubbles.push(bubble);
  player.activeBubbles += 1;
  player.stats.bubblesPlaced += 1;
  sim.events.push({
    type: EVENT_TYPES.BUBBLE_DROP,
    bubbleId: bubble.id,
    ownerId: player.id,
    col,
    row,
  });
  return bubble;
}

/**
 * Prunes passThroughIds for every bubble once overlapping characters walk off (F04, E01).
 */
export function pruneBubblePassThrough(sim) {
  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    if (b.passThroughIds.length === 0) continue;
    const minX = b.x - 0.5;
    const maxX = b.x + 0.5;
    const minZ = b.z - 0.5;
    const maxZ = b.z + 0.5;

    b.passThroughIds = b.passThroughIds.filter((pid) => {
      const p = sim.playersById.get(pid);
      if (!p || p.state === PLAYER_STATES.ELIMINATED) return false;
      return circleOverlapsAABB(p.x, p.z, PLAYER_RADIUS, minX, minZ, maxX, maxZ);
    });
  }
}

/**
 * Projects `pos` ({ x, z }) out of solid bubbles, static blocking grid tiles (HARD_WALL / SOFT_BLOCK),
 * and outer perimeter bounds across 2 passes so static walls always hold final authority.
 */
export function resolvePlayerCollisions(sim, p, pos) {
  pos.x = clamp(pos.x, PLAYER_RADIUS, GRID_COLS - PLAYER_RADIUS);
  pos.z = clamp(pos.z, PLAYER_RADIUS, GRID_ROWS - PLAYER_RADIUS);

  for (let pass = 0; pass < 2; pass += 1) {
    // 1. Resolve solid bubbles first (stationary or sliding bubbles not in passThroughIds)
    for (let bi = 0; bi < sim.bubbles.length; bi += 1) {
      const b = sim.bubbles[bi];
      if (b.passThroughIds.includes(p.id)) continue;
      pushCircleOutOfAABB(pos, PLAYER_RADIUS, b.x - 0.5, b.z - 0.5, b.x + 0.5, b.z + 0.5);
    }

    pos.x = clamp(pos.x, PLAYER_RADIUS, GRID_COLS - PLAYER_RADIUS);
    pos.z = clamp(pos.z, PLAYER_RADIUS, GRID_ROWS - PLAYER_RADIUS);

    // 2. Resolve static grid HARD_WALL / SOFT_BLOCK AABBs (3x3 neighborhood around updated pos)
    const cCenter = clamp(Math.floor(pos.x), 0, GRID_COLS - 1);
    const rCenter = clamp(Math.floor(pos.z), 0, GRID_ROWS - 1);

    // Cardinal neighbors first, then diagonals so players never catch phantom internal edges
    const neighbors = [
      [cCenter, rCenter],
      [cCenter - 1, rCenter],
      [cCenter + 1, rCenter],
      [cCenter, rCenter - 1],
      [cCenter, rCenter + 1],
      [cCenter - 1, rCenter - 1],
      [cCenter + 1, rCenter - 1],
      [cCenter - 1, rCenter + 1],
      [cCenter + 1, rCenter + 1],
    ];

    for (let ni = 0; ni < neighbors.length; ni += 1) {
      const [nc, nr] = neighbors[ni];
      if (!isInBounds(nc, nr)) continue;
      if (!isGridCellPassableForPlayer(sim.grid, nc, nr, p)) {
        pushCircleOutOfAABB(pos, PLAYER_RADIUS, nc, nr, nc + 1, nr + 1);
      }
    }

    // 3. Clamp to outer indestructible perimeter walls
    pos.x = clamp(pos.x, PLAYER_RADIUS, GRID_COLS - PLAYER_RADIUS);
    pos.z = clamp(pos.z, PLAYER_RADIUS, GRID_ROWS - PLAYER_RADIUS);
  }

  return pos;
}

/**
 * Advances all characters with smooth lane-centering corner-assist, circle-vs-tile collision,
 * and Kick initiation on stationary solidified bubbles.
 */
export function stepPlayersPhysics(sim, intentsByPlayerId, dt) {
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.state === PLAYER_STATES.ELIMINATED) {
      p.isMoving = false;
      p.effectiveSpeed = 0;
      continue;
    }

    p.effectiveSpeed = computeEffectiveSpeed(p);
    const intent = intentsByPlayerId.get(p.id) || { moveX: 0, moveZ: 0 };
    let mx = clamp(Number(intent.moveX) || 0, -1, 1);
    let mz = clamp(Number(intent.moveZ) || 0, -1, 1);
    const mag = Math.hypot(mx, mz);

    if (mag < 0.08) {
      p.isMoving = false;
      const idlePos = { x: p.x, z: p.z };
      resolvePlayerCollisions(sim, p, idlePos);
      p.x = idlePos.x;
      p.z = idlePos.z;
      p.col = clamp(Math.floor(idlePos.x), 0, GRID_COLS - 1);
      p.row = clamp(Math.floor(idlePos.z), 0, GRID_ROWS - 1);
      continue;
    }
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }

    p.isMoving = true;
    p.facingRad = Math.atan2(mx, mz);

    const prevX = p.x;
    const prevZ = p.z;
    const stepSpeed = p.effectiveSpeed;

    // Smooth Corner-Assist & Lane-Centering when moving predominantly along one cardinal axis (F02)
    const absX = Math.abs(mx);
    const absZ = Math.abs(mz);
    let vx = mx * stepSpeed;
    let vz = mz * stepSpeed;

    if (absX > 0.45 && absZ < 0.35) {
      const dirX = Math.sign(mx);
      const aheadCol = clamp(Math.floor(p.x + dirX * (PLAYER_RADIUS + 0.14)), 0, GRID_COLS - 1);
      const curRow = clamp(Math.floor(p.z), 0, GRID_ROWS - 1);
      const centerZ = curRow + 0.5;
      const offsetZ = p.z - centerZ;

      if (isTileOpenForPlayer(sim, aheadCol, curRow, p)) {
        // Open lane ahead: gently self-center if brushing an adjacent blocked corner
        if (Math.abs(offsetZ) > 0.015) {
          const sideRow = offsetZ > 0 ? curRow + 1 : curRow - 1;
          if (!isTileOpenForPlayer(sim, aheadCol, sideRow, p)) {
            const maxNudge = Math.abs(offsetZ);
            const nudge = Math.min(maxNudge, stepSpeed * 0.9 * dt);
            vz = -Math.sign(offsetZ) * (nudge / dt);
          }
        }
      } else if (Math.abs(offsetZ) > 0.14) {
        // Ahead tile blocked, check if adjacent lane in direction of offset is open to slide around corner
        const adjRow = offsetZ > 0 ? curRow + 1 : curRow - 1;
        if (
          isTileOpenForPlayer(sim, p.col, adjRow, p) &&
          isTileOpenForPlayer(sim, aheadCol, adjRow, p)
        ) {
          vz = Math.sign(offsetZ) * stepSpeed * 0.88;
        }
      }
    } else if (absZ > 0.45 && absX < 0.35) {
      const dirZ = Math.sign(mz);
      const aheadRow = clamp(Math.floor(p.z + dirZ * (PLAYER_RADIUS + 0.14)), 0, GRID_ROWS - 1);
      const curCol = clamp(Math.floor(p.x), 0, GRID_COLS - 1);
      const centerX = curCol + 0.5;
      const offsetX = p.x - centerX;

      if (isTileOpenForPlayer(sim, curCol, aheadRow, p)) {
        if (Math.abs(offsetX) > 0.015) {
          const sideCol = offsetX > 0 ? curCol + 1 : curCol - 1;
          if (!isTileOpenForPlayer(sim, sideCol, aheadRow, p)) {
            const maxNudge = Math.abs(offsetX);
            const nudge = Math.min(maxNudge, stepSpeed * 0.9 * dt);
            vx = -Math.sign(offsetX) * (nudge / dt);
          }
        }
      } else if (Math.abs(offsetX) > 0.14) {
        const adjCol = offsetX > 0 ? curCol + 1 : curCol - 1;
        if (
          isTileOpenForPlayer(sim, adjCol, p.row, p) &&
          isTileOpenForPlayer(sim, adjCol, aheadRow, p)
        ) {
          vx = Math.sign(offsetX) * stepSpeed * 0.88;
        }
      }
    }

    const pos = {
      x: p.x + vx * dt,
      z: p.z + vz * dt,
    };

    // Kick check before solid bubble collision pushes player back (F16)
    if (p.state === PLAYER_STATES.ALIVE && p.canKick) {
      const kdx = absX >= absZ ? Math.sign(mx) : 0;
      const kdz = absX >= absZ ? 0 : Math.sign(mz);
      if (kdx !== 0 || kdz !== 0) {
        for (let bi = 0; bi < sim.bubbles.length; bi += 1) {
          const b = sim.bubbles[bi];
          // Only unoccupied, fully solidified bubbles can be kicked — prevents 1-tick occupant ejection!
          if (b.sliding || b.passThroughIds.length > 0) continue;
          const overlapsBubble = circleOverlapsAABB(
            pos.x,
            pos.z,
            PLAYER_RADIUS + 0.02,
            b.x - 0.5,
            b.z - 0.5,
            b.x + 0.5,
            b.z + 0.5
          );
          if (!overlapsBubble) continue;
          // Ensure player is pushing along (kdx, kdz) into this bubble
          const relX = b.x - p.x;
          const relZ = b.z - p.z;
          const dot = relX * kdx + relZ * kdz;
          const perp = Math.abs(relX * kdz - relZ * kdx);
          if (dot > 0.25 && perp < 0.65) {
            const nextCol = b.col + kdx;
            const nextRow = b.row + kdz;
            if (isTileFreeForSlidingBubble(sim, nextCol, nextRow, b.id)) {
              b.sliding = true;
              b.vx = kdx * KICK_SLIDE_SPEED;
              b.vz = kdz * KICK_SLIDE_SPEED;
              b.passThroughIds = [];
              sim.events.push({
                type: EVENT_TYPES.KICK_SLIDE,
                bubbleId: b.id,
                playerId: p.id,
                col: b.col,
                row: b.row,
                dx: kdx,
                dz: kdz,
              });
            }
          }
        }
      }
    }

    resolvePlayerCollisions(sim, p, pos);

    const movedDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
    p.x = pos.x;
    p.z = pos.z;
    p.col = clamp(Math.floor(pos.x), 0, GRID_COLS - 1);
    p.row = clamp(Math.floor(pos.z), 0, GRID_ROWS - 1);
    p.stats.distanceMoved = +(p.stats.distanceMoved + movedDist).toFixed(4);
  }

  pruneBubblePassThrough(sim);
}

/**
 * Advances kicked sliding bubbles at 10.0 tiles/s across free tiles (F16, E09).
 */
export function stepSlidingBubbles(sim, dt) {
  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    if (!b.sliding) continue;

    const dirX = Math.sign(b.vx);
    const dirZ = Math.sign(b.vz);
    if (dirX === 0 && dirZ === 0) {
      b.sliding = false;
      continue;
    }

    const curCol = clamp(Math.floor(b.x), 0, GRID_COLS - 1);
    const curRow = clamp(Math.floor(b.z), 0, GRID_ROWS - 1);
    b.col = curCol;
    b.row = curRow;

    const nextCol = curCol + dirX;
    const nextRow = curRow + dirZ;
    const canEnterNext = isTileFreeForSlidingBubble(sim, nextCol, nextRow, b.id);

    const newX = b.x + b.vx * dt;
    const newZ = b.z + b.vz * dt;
    const curCenterX = curCol + 0.5;
    const curCenterZ = curRow + 0.5;

    if (!canEnterNext) {
      // Advance up to curCenter and halt cleanly centered on current tile
      const reachedX =
        dirX > 0 ? newX >= curCenterX : dirX < 0 ? newX <= curCenterX : true;
      const reachedZ =
        dirZ > 0 ? newZ >= curCenterZ : dirZ < 0 ? newZ <= curCenterZ : true;

      if (reachedX && reachedZ) {
        b.x = curCenterX;
        b.z = curCenterZ;
        b.sliding = false;
        b.vx = 0;
        b.vz = 0;
      } else {
        b.x = newX;
        b.z = newZ;
      }
    } else {
      b.x = clamp(newX, 0.5, GRID_COLS - 0.5);
      b.z = clamp(newZ, 0.5, GRID_ROWS - 0.5);
      b.col = clamp(Math.floor(b.x), 0, GRID_COLS - 1);
      b.row = clamp(Math.floor(b.z), 0, GRID_ROWS - 1);

      // If crossing into a newly reached tile whose successor is blocked and overshot center, clamp cleanly
      const updatedNextCol = b.col + dirX;
      const updatedNextRow = b.row + dirZ;
      if (!isTileFreeForSlidingBubble(sim, updatedNextCol, updatedNextRow, b.id)) {
        const stopX = b.col + 0.5;
        const stopZ = b.row + 0.5;
        if ((dirX > 0 && b.x >= stopX) || (dirX < 0 && b.x <= stopX)) {
          b.x = stopX;
          b.sliding = false;
          b.vx = 0;
          b.vz = 0;
        }
        if ((dirZ > 0 && b.z >= stopZ) || (dirZ < 0 && b.z <= stopZ)) {
          b.z = stopZ;
          b.sliding = false;
          b.vx = 0;
          b.vz = 0;
        }
      }
    }
  }
}
