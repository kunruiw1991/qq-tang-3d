/**
 * Smart Danger-Forecasting Autonomous Bot AI for Allies, Rivals, and P1 Autopilot.
 *
 * Features:
 *   - Computes full 15x13 time-to-impact danger map across active blasts, chain-propagated
 *     ticking sugar bubbles, Boss 2x2 footprint, and Boss floor telegraph tiles.
 *   - Runs simulated BFS escape verification BEFORE placing any bubble so bots NEVER self-trap (E10).
 *   - Auto-uses Needle immediately when 'trapped' with needles > 0; otherwise drifts toward allies.
 *   - Priority hierarchy:
 *       0) Evade immediate danger to nearest safe tile
 *       1) Rescue 'trapped' teammates (F10)
 *       2) Pop 'trapped' opposing rivals (F09)
 *       3) Mode-specific tactical objective:
 *            - 'bun_grab': bank carried bun at own Team Base, snatch loose buns, intercept enemy carriers
 *            - 'boss_golem': collect nearby upgrades, align on safe cardinal lanes & bomb Mechanical Golem
 *            - 'classic_2v2': hunt/trap rivals, collect pickups/mounts, break soft blocks
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

import {
  BUBBLE_FUSE_SEC,
  CARDINAL_DIRS,
  FIXED_DT,
  GRID_COLS,
  GRID_ROWS,
  PLAYER_RADIUS,
  PLAYER_STATES,
  TILE_TYPE,
} from '../contracts/constants.js';
import { isInBounds } from '../sim/arenas.js';
import { circleOverlapsTile, isGridCellPassableForPlayer } from '../sim/physics.js';

function createInfinityMatrix() {
  const mat = [];
  for (let r = 0; r < GRID_ROWS; r += 1) {
    mat.push(new Array(GRID_COLS).fill(Infinity));
  }
  return mat;
}

/**
 * Returns the cadence, reaction delay, and overconfidence profile for a bot:
 *   - Enemy bots (team === 1):
 *       'normal': 4 Hz (every 15 ticks), reaction delay 0.35–0.60 s via phase offset, 25% overconfidence on fuses > 1.2s
 *       'easy':   3 Hz (every 20 ticks), reaction delay 0.40–0.60 s via phase offset, 35% overconfidence on fuses > 1.2s
 *   - Human's teammate bot (team === 0 && !isHuman):
 *       2 Hz (every 30 ticks), 0% overconfidence, prioritizes rescuing trapped p1 within 2 s
 *   - Autopilot P1 (id === 'p1'):
 *       full rate, 0% overconfidence
 */
export function getBotAiProfile(sim, bot, botSlotIndex = 0) {
  const difficulty = sim && sim.difficulty === 'easy' ? 'easy' : 'normal';
  const seed = sim && Number.isFinite(sim.seed) ? sim.seed : 12345;
  const isEnemyBot = Boolean(bot && bot.team === 1);
  const isTeammateBot = Boolean(bot && bot.team === 0 && !bot.isHuman);

  if (isEnemyBot) {
    const evalIntervalTicks = difficulty === 'easy' ? 20 : 15; // 3 Hz on easy, 4 Hz on normal
    const delayTicks = 21 + ((botSlotIndex * 7 + (seed % 11)) % 16); // 21..36 ticks = 0.35..0.60 s
    const reactionDelaySec = delayTicks * FIXED_DT;
    const overconfidenceRate = difficulty === 'easy' ? 0.35 : 0.25;
    return {
      role: 'enemy',
      difficulty,
      evalIntervalTicks,
      phaseOffsetTicks: delayTicks,
      reactionDelaySec,
      overconfidenceRate,
    };
  }

  if (isTeammateBot) {
    const evalIntervalTicks = 30; // 2 Hz
    const phaseOffsetTicks = (botSlotIndex * 9 + (seed % 7)) % 15;
    return {
      role: 'teammate',
      difficulty,
      evalIntervalTicks,
      phaseOffsetTicks,
      reactionDelaySec: 0,
      overconfidenceRate: 0,
    };
  }

  return {
    role: 'autopilot_p1',
    difficulty,
    evalIntervalTicks: 1,
    phaseOffsetTicks: 0,
    reactionDelaySec: 0,
    overconfidenceRate: 0,
  };
}

function deterministicOverconfidenceRoll(seed, botId, cycleId, col, row) {
  let h = (seed ^ (cycleId * 0x9e3779b1) ^ (col * 73856093) ^ (row * 19349663)) >>> 0;
  for (let i = 0; i < botId.length; i += 1) {
    h = Math.imul(h ^ botId.charCodeAt(i), 2654435761) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h >>> 0) / 4294967296;
}

/**
 * Computes time-to-impact (seconds; 0 = currently lethal, Infinity = completely safe)
 * for every tile on the 15x13 arena, including multi-hop bubble chain propagation!
 */
export function computeDangerMap(
  sim,
  extraHypotheticalBubble = null,
  observerBot = null,
  botProfile = null,
  evalCycleId = 0
) {
  const danger = createInfinityMatrix();

  // 1. Active lingering blasts are lethal right now (t = 0)
  for (let i = 0; i < sim.blasts.length; i += 1) {
    const blast = sim.blasts[i];
    if (blast.remainingSec <= 0) continue;
    for (let ti = 0; ti < blast.tiles.length; ti += 1) {
      const { col, row } = blast.tiles[ti];
      if (isInBounds(col, row)) {
        danger[row][col] = 0;
      }
    }
  }

  // 2. Mechanical Golem 2x2 body + active floor telegraph tiles
  if (sim.boss && sim.boss.state !== 'defeated' && sim.boss.hp > 0) {
    const minC = Math.max(0, Math.floor(sim.boss.x - 1.05));
    const maxC = Math.min(GRID_COLS - 1, Math.floor(sim.boss.x + 1.05));
    const minR = Math.max(0, Math.floor(sim.boss.z - 1.05));
    const maxR = Math.min(GRID_ROWS - 1, Math.floor(sim.boss.z + 1.05));
    for (let r = minR; r <= maxR; r += 1) {
      for (let c = minC; c <= maxC; c += 1) {
        danger[r][c] = 0;
      }
    }

    if (sim.boss.state === 'telegraph' && sim.boss.telegraphTiles) {
      const rem = Math.max(0.05, sim.boss.telegraphRemainingSec);
      for (let i = 0; i < sim.boss.telegraphTiles.length; i += 1) {
        const { col, row } = sim.boss.telegraphTiles[i];
        if (isInBounds(col, row)) {
          danger[row][col] = Math.min(danger[row][col], rem);
        }
      }
    }
  }

  // 3. Collect all bubbles (plus optional hypothetical bubble for E10 escape simulation)
  const bubbles = sim.bubbles.map((b) => {
    const owner = sim.playersById ? sim.playersById.get(b.ownerId) : null;
    return {
      id: b.id || 0,
      col: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(b.x))),
      row: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(b.z))),
      blastRange: b.blastRange,
      fuse: Math.max(0.02, b.fuseRemaining),
      ownerId: b.ownerId,
      ownerTeam: owner ? owner.team : null,
    };
  });

  if (extraHypotheticalBubble) {
    bubbles.push({
      id: 999999,
      col: extraHypotheticalBubble.col,
      row: extraHypotheticalBubble.row,
      blastRange: extraHypotheticalBubble.blastRange,
      fuse: extraHypotheticalBubble.fuse,
      ownerId: observerBot ? observerBot.id : 'hyp',
      ownerTeam: observerBot ? observerBot.team : null,
    });
  }

  if (bubbles.length === 0) {
    return danger;
  }

  // Precompute each bubble's clamped 4-way blast tiles for fast chain propagation
  const bubbleBlastSets = bubbles.map((b) => {
    if (danger[b.row][b.col] === 0) {
      b.fuse = 0.01;
    }
    const rayTiles = [{ col: b.col, row: b.row }];
    for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
      const { dc, dr } = CARDINAL_DIRS[di];
      for (let step = 1; step <= b.blastRange; step += 1) {
        const tc = b.col + dc * step;
        const tr = b.row + dr * step;
        if (!isInBounds(tc, tr)) break;
        const cell = sim.grid[tr][tc];
        if (cell === TILE_TYPE.HARD_WALL) break;
        rayTiles.push({ col: tc, row: tr });
        if (cell === TILE_TYPE.SOFT_BLOCK) break;
      }
    }
    return rayTiles;
  });

  // Fixed-point relaxation to propagate chain detonation fuses (A hitting B lowers B.fuse to A.fuse)
  let changed = true;
  let guard = 0;
  while (changed && guard < bubbles.length + 2) {
    changed = false;
    guard += 1;
    for (let i = 0; i < bubbles.length; i += 1) {
      const srcFuse = bubbles[i].fuse;
      const rays = bubbleBlastSets[i];
      for (let j = 0; j < bubbles.length; j += 1) {
        if (i === j || bubbles[j].fuse <= srcFuse) continue;
        const targetCol = bubbles[j].col;
        const targetRow = bubbles[j].row;
        for (let ri = 0; ri < rays.length; ri += 1) {
          if (rays[ri].col === targetCol && rays[ri].row === targetRow) {
            bubbles[j].fuse = srcFuse;
            changed = true;
            break;
          }
        }
      }
    }
  }

  // Stamp minimum effective fuse onto danger matrix.
  // Enemy bots have human-like imperfection:
  //   1) Reaction delay (0.35–0.60 s): newly dropped opposing bubbles are not noticed until reactionDelaySec
  //   2) Overconfidence (25% normal / 35% easy): when a threatening fuse has > 1.2 s remaining,
  //      the enemy ignores it for this evaluation cycle.
  // Friendly/own hypothetical bubbles in canSafelyDropBubble are always respected so E10 never self-traps.
  const isEnemyObserver = Boolean(
    !extraHypotheticalBubble && observerBot && observerBot.team === 1
  );
  const reactionDelaySec =
    isEnemyObserver && botProfile ? botProfile.reactionDelaySec : 0;
  const overconfidenceRate =
    isEnemyObserver && botProfile ? botProfile.overconfidenceRate : 0;

  for (let i = 0; i < bubbles.length; i += 1) {
    const b = bubbles[i];
    if (isEnemyObserver && b.ownerId !== observerBot.id) {
      const bubbleAgeSec = Math.max(0, BUBBLE_FUSE_SEC - b.fuse);
      if (
        b.ownerTeam !== null &&
        b.ownerTeam !== observerBot.team &&
        bubbleAgeSec < reactionDelaySec
      ) {
        continue;
      }
      if (overconfidenceRate > 0) {
        // 25% (normal) / 35% (easy) overconfidence:
        // 1) Per-cycle check when fuse > 1.2s
        const cycleRoll = deterministicOverconfidenceRoll(
          sim.seed || 12345,
          observerBot.id,
          evalCycleId,
          b.col,
          b.row
        );
        if (b.fuse > 1.2 && cycleRoll < overconfidenceRate) {
          continue;
        }
        // 2) Per-bubble tunnel-vision roll: an overconfident bot underestimates this bubble until 0.24s left
        const bubbleRoll = deterministicOverconfidenceRoll(
          (sim.seed || 12345) ^ 0x5a5a5a5a,
          observerBot.id,
          b.id || 1,
          b.col,
          b.row
        );
        if (b.fuse > 0.24 && bubbleRoll < overconfidenceRate) {
          continue;
        }
      }
    }
    const f = b.fuse;
    const rays = bubbleBlastSets[i];
    for (let ri = 0; ri < rays.length; ri += 1) {
      const { col, row } = rays[ri];
      if (f < danger[row][col]) {
        danger[row][col] = f;
      }
    }
  }

  return danger;
}

function isCellTraversableForBot(sim, bot, col, row, extraBlockedBubble = null) {
  if (!isGridCellPassableForPlayer(sim.grid, col, row, bot)) {
    return false;
  }
  // Avoid Boss 2x2 body
  if (sim.boss && sim.boss.state !== 'defeated' && sim.boss.hp > 0) {
    const minC = Math.floor(sim.boss.x - 1.05);
    const maxC = Math.floor(sim.boss.x + 1.05);
    const minR = Math.floor(sim.boss.z - 1.05);
    const maxR = Math.floor(sim.boss.z + 1.05);
    if (col >= minC && col <= maxC && row >= minR && row <= maxR) {
      return false;
    }
  }
  if (extraBlockedBubble && extraBlockedBubble.col === col && extraBlockedBubble.row === row) {
    // Placer can step OFF their own newly placed tile, never back onto it; BFS starts AT origin so neighbors aren't origin
    return false;
  }
  for (let i = 0; i < sim.bubbles.length; i += 1) {
    const b = sim.bubbles[i];
    const bc = Math.floor(b.x);
    const br = Math.floor(b.z);
    if (bc === col && br === row && !b.passThroughIds.includes(bot.id)) {
      return false;
    }
  }
  return true;
}

/**
 * Simulated BFS Escape Check (E10):
 * Verifies that if `bot` places a bubble at (bot.col, bot.row) right now,
 * there is a guaranteed safe tile (danger === Infinity) reachable with generous safety margin.
 */
export function canSafelyDropBubble(sim, bot) {
  if (bot.state !== PLAYER_STATES.ALIVE) return false;
  if (bot.activeBubbles >= bot.maxBubbles) return false;

  const col = bot.col;
  const row = bot.row;
  const cell = sim.grid[row][col];
  if (cell === TILE_TYPE.HARD_WALL || cell === TILE_TYPE.SOFT_BLOCK) return false;

  // Ensure bot is reasonably aligned with tile center before dropping
  if (Math.abs(bot.x - (col + 0.5)) > 0.34 || Math.abs(bot.z - (row + 0.5)) > 0.34) {
    return false;
  }

  for (let i = 0; i < sim.bubbles.length; i += 1) {
    if (sim.bubbles[i].col === col && sim.bubbles[i].row === row) return false;
  }

  const hypBubble = {
    col,
    row,
    blastRange: bot.blastRange,
    fuse: BUBBLE_FUSE_SEC,
  };
  const hypDanger = computeDangerMap(sim, hypBubble);
  const speed = Math.max(2.6, bot.effectiveSpeed);
  const safetyMarginSec = 0.42;

  const visited = new Set([`${col},${row}`]);
  const queue = [{ col, row, steps: 0 }];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.steps > 0 && hypDanger[cur.row][cur.col] === Infinity) {
      return true;
    }
    if (cur.steps >= 7) continue;

    for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
      const nc = cur.col + CARDINAL_DIRS[di].dc;
      const nr = cur.row + CARDINAL_DIRS[di].dr;
      if (!isInBounds(nc, nr)) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (!isCellTraversableForBot(sim, bot, nc, nr, hypBubble)) continue;

      const nextSteps = cur.steps + 1;
      const arrivalSec = nextSteps / speed;
      if (arrivalSec + safetyMarginSec >= hypDanger[nr][nc]) continue;

      visited.add(key);
      queue.push({ col: nc, row: nr, steps: nextSteps });
    }
  }

  return false;
}

/**
 * Returns the minimum time-to-impact (seconds; Infinity = completely safe)
 * across the bot's center tile and overlapping circle footprint.
 */
function getMinBotDanger(bot, dangerMap) {
  let minD = dangerMap[bot.row][bot.col];
  const minC = Math.max(0, Math.floor(bot.x - PLAYER_RADIUS * 0.85));
  const maxC = Math.min(GRID_COLS - 1, Math.floor(bot.x + PLAYER_RADIUS * 0.85));
  const minR = Math.max(0, Math.floor(bot.z - PLAYER_RADIUS * 0.85));
  const maxR = Math.min(GRID_ROWS - 1, Math.floor(bot.z + PLAYER_RADIUS * 0.85));
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (
        dangerMap[r][c] < minD &&
        circleOverlapsTile(bot.x, bot.z, PLAYER_RADIUS * 0.85, c, r)
      ) {
        minD = dangerMap[r][c];
      }
    }
  }
  return minD;
}

/**
 * Checks if a Kick-capable bot can push an adjacent solidified bubble down a lane toward an enemy (F16).
 */
function tryKickTorpedo(sim, bot, dangerMap) {
  if (!bot.canKick || bot.state !== PLAYER_STATES.ALIVE) return null;

  for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
    const { dc, dr } = CARDINAL_DIRS[di];
    const bc = bot.col + dc;
    const br = bot.row + dr;
    if (!isInBounds(bc, br)) continue;
    if (dangerMap[br][bc] <= 1.35) continue;

    const bubble = sim.bubbles.find(
      (b) =>
        Math.floor(b.x) === bc &&
        Math.floor(b.z) === br &&
        !b.sliding &&
        b.passThroughIds.length === 0 &&
        b.fuseRemaining >= 0.70
    );
    if (!bubble) continue;

    // Verify next tile beyond bubble is open so the kick actually slides
    const nextC = bc + dc;
    const nextR = br + dr;
    if (!isInBounds(nextC, nextR)) continue;
    const nextCell = sim.grid[nextR][nextC];
    if (nextCell === TILE_TYPE.HARD_WALL || nextCell === TILE_TYPE.SOFT_BLOCK) continue;
    if (sim.bubbles.some((ob) => Math.floor(ob.x) === nextC && Math.floor(ob.z) === nextR)) continue;

    let allyInLane = false;
    let enemyInTorpedoZone = false;
    for (let step = 1; step <= 9; step += 1) {
      const tc = bc + dc * step;
      const tr = br + dr * step;
      if (!isInBounds(tc, tr)) break;
      const cell = sim.grid[tr][tc];
      if (cell === TILE_TYPE.HARD_WALL || cell === TILE_TYPE.SOFT_BLOCK) break;

      for (let pi = 0; pi < sim.players.length; pi += 1) {
        const p = sim.players[pi];
        if (p.state === PLAYER_STATES.ELIMINATED) continue;
        const nearLane =
          (p.col === tc && Math.abs(p.row - tr) <= 1) ||
          (p.row === tr && Math.abs(p.col - tc) <= 1);
        if (!nearLane) continue;
        if (p.team === bot.team && p.id !== bot.id) {
          allyInLane = true;
        } else if (p.team !== bot.team && p.state === PLAYER_STATES.ALIVE) {
          enemyInTorpedoZone = true;
        }
      }
    }

    if (enemyInTorpedoZone && !allyInLane) {
      return steerToCell(bot, bc, br);
    }
  }
  return null;
}

function proportionalAxis(delta, stepDist) {
  const absD = Math.abs(delta);
  if (absD <= 0.025) return 0;
  if (absD < stepDist) {
    const frac = delta / stepDist;
    return Math.abs(frac) < 0.09 ? 0 : frac;
  }
  return Math.sign(delta);
}

/**
 * Converts a target next grid cell (nextCol, nextRow) into smooth proportional cardinal steering
 * that aligns cleanly down lane centers, settles in 1 tick without overshoot dithering, and never snags.
 */
function steerToCell(bot, nextCol, nextRow, exactX = null, exactZ = null) {
  bot._aiLastSteerCell = { col: nextCol, row: nextRow };
  const tx = exactX !== null ? exactX : nextCol + 0.5;
  const tz = exactZ !== null ? exactZ : nextRow + 0.5;
  const dx = tx - bot.x;
  const dz = tz - bot.z;
  const stepDist = Math.max(0.02, (bot.effectiveSpeed || 5.0) * FIXED_DT);

  if (Math.hypot(dx, dz) <= 0.03) {
    return { moveX: 0, moveZ: 0 };
  }

  if (nextCol !== bot.col && nextRow === bot.row) {
    const rowCenterOffset = bot.row + 0.5 - bot.z;
    if (Math.abs(rowCenterOffset) > 0.14) {
      return {
        moveX: proportionalAxis(dx, stepDist) * 0.65,
        moveZ: proportionalAxis(rowCenterOffset, stepDist),
      };
    }
    return { moveX: proportionalAxis(dx, stepDist), moveZ: 0 };
  }

  if (nextRow !== bot.row && nextCol === bot.col) {
    const colCenterOffset = bot.col + 0.5 - bot.x;
    if (Math.abs(colCenterOffset) > 0.14) {
      return {
        moveX: proportionalAxis(colCenterOffset, stepDist),
        moveZ: proportionalAxis(dz, stepDist) * 0.65,
      };
    }
    return { moveX: 0, moveZ: proportionalAxis(dz, stepDist) };
  }

  // Same cell centering or diagonal close approach with proportional 1-tick settle
  if (Math.abs(dx) >= Math.abs(dz)) {
    return {
      moveX: proportionalAxis(dx, stepDist),
      moveZ: Math.abs(dz) > 0.09 ? proportionalAxis(dz, stepDist) * 0.55 : 0,
    };
  }
  return {
    moveX: Math.abs(dx) > 0.09 ? proportionalAxis(dx, stepDist) * 0.55 : 0,
    moveZ: proportionalAxis(dz, stepDist),
  };
}

/**
 * Finds the fastest escape step out of danger.
 */
function findEscapeMove(sim, bot, dangerMap) {
  const speed = Math.max(2.4, bot.effectiveSpeed);
  const visited = new Set([`${bot.col},${bot.row}`]);
  const queue = [{ col: bot.col, row: bot.row, steps: 0, firstStep: null }];
  let head = 0;

  let bestFallback = null;
  let bestFallbackSurvival = dangerMap[bot.row][bot.col];

  while (head < queue.length) {
    const cur = queue[head++];
    const tileDanger = dangerMap[cur.row][cur.col];

    if (tileDanger === Infinity && cur.steps > 0) {
      return steerToCell(bot, cur.firstStep.col, cur.firstStep.row);
    }
    if (cur.steps === 0 && tileDanger === Infinity) {
      // Bot's center cell is already safe, pull cleanly to cell center away from clipped edge!
      return steerToCell(bot, bot.col, bot.row);
    }

    if (cur.firstStep && tileDanger > bestFallbackSurvival) {
      bestFallbackSurvival = tileDanger;
      bestFallback = cur.firstStep;
    }

    if (cur.steps >= 9) continue;

    for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
      const nc = cur.col + CARDINAL_DIRS[di].dc;
      const nr = cur.row + CARDINAL_DIRS[di].dr;
      if (!isInBounds(nc, nr)) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (!isCellTraversableForBot(sim, bot, nc, nr)) continue;

      const nextSteps = cur.steps + 1;
      const arrivalSec = nextSteps / speed;
      if (dangerMap[nr][nc] > 0 && arrivalSec + 0.20 >= dangerMap[nr][nc]) continue;
      if (dangerMap[nr][nc] === 0) continue;

      const firstStep = cur.firstStep || { col: nc, row: nr };
      visited.add(key);
      queue.push({ col: nc, row: nr, steps: nextSteps, firstStep });
    }
  }

  if (bestFallback) {
    return steerToCell(bot, bestFallback.col, bestFallback.row);
  }
  return steerToCell(bot, bot.col, bot.row);
}

/**
 * Runs safe-tile BFS from (bot.col, bot.row), returning distances and first-steps
 * to reachable tiles. When allowEarlyFuseCrossing is false (default for Priorities 3..7),
 * a safe bot never steps voluntarily onto a ticking blast lane (danger < Infinity),
 * eliminating boundary ping-pong against the early-fuse retreat check!
 */
function computeSafeReachability(sim, bot, dangerMap, botSlotIndex, allowEarlyFuseCrossing = false) {
  const dist = [];
  const firstStep = [];
  const speed = Math.max(2.6, bot.effectiveSpeed);
  const startCellSafe = dangerMap[bot.row][bot.col] === Infinity;
  for (let r = 0; r < GRID_ROWS; r += 1) {
    dist.push(new Array(GRID_COLS).fill(Infinity));
    firstStep.push(new Array(GRID_COLS).fill(null));
  }

  dist[bot.row][bot.col] = 0;
  const queue = [{ col: bot.col, row: bot.row }];
  let head = 0;

  // Rotate cardinal iteration order by botSlotIndex so co-op allies naturally spread across distinct lanes
  const dirShift = botSlotIndex % CARDINAL_DIRS.length;

  while (head < queue.length) {
    const cur = queue[head++];
    const nextDist = dist[cur.row][cur.col] + 1;
    const arrivalSec = nextDist / speed;

    for (let k = 0; k < CARDINAL_DIRS.length; k += 1) {
      const dir = CARDINAL_DIRS[(k + dirShift) % CARDINAL_DIRS.length];
      const nc = cur.col + dir.dc;
      const nr = cur.row + dir.dr;
      if (!isInBounds(nc, nr)) continue;
      if (dist[nr][nc] !== Infinity) continue;
      if (!allowEarlyFuseCrossing && startCellSafe) {
        if (dangerMap[nr][nc] !== Infinity) continue;
      } else if (dangerMap[nr][nc] <= arrivalSec + 1.05) {
        continue;
      }
      if (!isCellTraversableForBot(sim, bot, nc, nr)) continue;

      dist[nr][nc] = nextDist;
      firstStep[nr][nc] =
        cur.col === bot.col && cur.row === bot.row
          ? { col: nc, row: nr }
          : firstStep[cur.row][cur.col];
      queue.push({ col: nc, row: nr });
    }
  }

  return { dist, firstStep };
}

function countSoftBlocksHitFrom(grid, col, row, range) {
  let hits = 0;
  for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
    const { dc, dr } = CARDINAL_DIRS[di];
    for (let step = 1; step <= range; step += 1) {
      const tc = col + dc * step;
      const tr = row + dr * step;
      if (!isInBounds(tc, tr)) break;
      const cell = grid[tr][tc];
      if (cell === TILE_TYPE.HARD_WALL) break;
      if (cell === TILE_TYPE.SOFT_BLOCK) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

function wouldRayHitTargetCell(grid, col, row, range, targetPredicate) {
  if (targetPredicate(col, row)) return true;
  for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
    const { dc, dr } = CARDINAL_DIRS[di];
    for (let step = 1; step <= range; step += 1) {
      const tc = col + dc * step;
      const tr = row + dr * step;
      if (!isInBounds(tc, tr)) break;
      const cell = grid[tr][tc];
      if (cell === TILE_TYPE.HARD_WALL) break;
      if (targetPredicate(tc, tr)) return true;
      if (cell === TILE_TYPE.SOFT_BLOCK) break;
    }
  }
  return false;
}

function wouldRayHitBoss(sim, col, row, range) {
  if (!sim.boss || sim.boss.state === 'defeated' || sim.boss.hp <= 0) return false;
  const bx0 = sim.boss.x - sim.boss.widthTiles * 0.5;
  const bx1 = sim.boss.x + sim.boss.widthTiles * 0.5;
  const bz0 = sim.boss.z - sim.boss.heightTiles * 0.5;
  const bz1 = sim.boss.z + sim.boss.heightTiles * 0.5;

  return wouldRayHitTargetCell(sim.grid, col, row, range, (tc, tr) => {
    const tx = tc + 0.5;
    const tz = tr + 0.5;
    return tx > bx0 - 0.1 && tx < bx1 + 0.1 && tz > bz0 - 0.1 && tz < bz1 + 0.1;
  });
}

function wouldRayHitAliveEnemy(sim, bot, col, row, range) {
  return wouldRayHitTargetCell(sim.grid, col, row, range, (tc, tr) =>
    sim.players.some(
      (p) =>
        p.team !== bot.team &&
        p.state === PLAYER_STATES.ALIVE &&
        p.invulnTimer <= 0.2 &&
        p.col === tc &&
        p.row === tr
    )
  );
}

function hasOpenGridPath(grid, bot, startCol, startRow, goalCol, goalRow) {
  if (startCol === goalCol && startRow === goalRow) return true;
  const visited = new Set([`${startCol},${startRow}`]);
  const queue = [{ col: startCol, row: startRow }];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
      const nc = cur.col + CARDINAL_DIRS[di].dc;
      const nr = cur.row + CARDINAL_DIRS[di].dr;
      if (!isInBounds(nc, nr)) continue;
      if (nc === goalCol && nr === goalRow) return true;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (!isGridCellPassableForPlayer(grid, nc, nr, bot)) continue;
      visited.add(key);
      queue.push({ col: nc, row: nr });
    }
  }
  return false;
}

/**
 * Computes weighted shortest breach cost from all alive opposing players (or a specific target)
 * across the 15x13 grid where EMPTY costs 1.0 and SOFT_BLOCK costs 2.8, weighting human `p1` by x1.5.
 */
function computeEnemyBreachCostMap(sim, bot) {
  const cost = createInfinityMatrix();
  const queue = [];

  const isEasyEnemy = sim.difficulty === 'easy' && bot && bot.team === 1;
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.team === bot.team || p.state === PLAYER_STATES.ELIMINATED) continue;
    // On normal difficulty, enemies weight hunting human p1 by x1.5 (-3.5 offset);
    // on easy difficulty, enemies engage bot1/mid-map first for the opening 25s before pressuring p1's spawn corner.
    let startBias = p.id === 'p1' ? -3.5 : 0;
    if (isEasyEnemy && p.id === 'p1') {
      startBias = sim.tick < 1500 && p.col <= 2 && p.row <= 2 ? 22.0 : 1.5;
    }
    if (isInBounds(p.col, p.row) && startBias < cost[p.row][p.col]) {
      cost[p.row][p.col] = startBias;
      queue.push({ col: p.col, row: p.row, c: startBias });
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.c > cost[cur.row][cur.col]) continue;
    for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
      const nc = cur.col + CARDINAL_DIRS[di].dc;
      const nr = cur.row + CARDINAL_DIRS[di].dr;
      if (!isInBounds(nc, nr)) continue;
      const cell = sim.grid[nr][nc];
      if (cell === TILE_TYPE.HARD_WALL) continue;
      const stepCost = cell === TILE_TYPE.SOFT_BLOCK ? 2.6 : 1.0;
      const nextCost = cur.c + stepCost;
      if (nextCost + 1e-4 < cost[nr][nc]) {
        cost[nr][nc] = nextCost;
        queue.push({ col: nc, row: nr, c: nextCost });
      }
    }
  }
  return cost;
}

/**
 * Computes a single bot's raw intent before safe-navigation anti-dither commit.
 */
function computeRawBotIntent(sim, bot, botSlotIndex = 0) {
  if (!bot || bot.state === PLAYER_STATES.ELIMINATED) {
    return { moveX: 0, moveZ: 0, dropBubble: false, useItem: false };
  }
  const profile = getBotAiProfile(sim, bot, botSlotIndex);
  bot._aiProfile = profile;
  bot._aiLastSteerCell = null;
  bot._aiUrgentGoal = false;
  bot._aiLastMinDanger = Infinity;
  bot._aiLastDangerMap = null;

  // 1. Trapped behavior: immediately use Needle if held; else drift toward nearest alive ally!
  if (bot.state === PLAYER_STATES.TRAPPED) {
    if (bot.needles > 0) {
      return { moveX: 0, moveZ: 0, dropBubble: false, useItem: true };
    }
    let nearestAlly = null;
    let bestAllyDist = Infinity;
    for (let i = 0; i < sim.players.length; i += 1) {
      const p = sim.players[i];
      if (p.id !== bot.id && p.team === bot.team && p.state === PLAYER_STATES.ALIVE) {
        const d = Math.hypot(p.x - bot.x, p.z - bot.z);
        if (d < bestAllyDist) {
          bestAllyDist = d;
          nearestAlly = p;
        }
      }
    }
    if (nearestAlly) {
      const dx = nearestAlly.x - bot.x;
      const dz = nearestAlly.z - bot.z;
      const len = Math.hypot(dx, dz) || 1;
      return { moveX: dx / len, moveZ: dz / len, dropBubble: false, useItem: false };
    }
    return { moveX: 0, moveZ: 0, dropBubble: false, useItem: false };
  }

  // 2. Danger map & urgent survival check (re-evaluated at 4 Hz normal / 3 Hz easy for enemies, 2 Hz for teammate bot)
  const curTick = sim.tick || 0;
  const evalCycleId = Math.floor(
    (curTick + profile.phaseOffsetTicks) / Math.max(1, profile.evalIntervalTicks)
  );
  const curBlastCount = Array.isArray(sim.blasts) ? sim.blasts.length : 0;
  if (
    !bot._aiCachedDangerMap ||
    bot._aiEvalCycleId !== evalCycleId ||
    bot._aiCachedBlastCount !== curBlastCount ||
    profile.evalIntervalTicks <= 1
  ) {
    bot._aiCachedDangerMap = computeDangerMap(sim, null, bot, profile, evalCycleId);
    bot._aiEvalCycleId = evalCycleId;
    bot._aiCachedBlastCount = curBlastCount;
    bot._aiEvalCount = (bot._aiEvalCount || 0) + 1;
  }
  const dangerMap = bot._aiCachedDangerMap;
  const minBotDanger = getMinBotDanger(bot, dangerMap);
  bot._aiLastDangerMap = dangerMap;
  bot._aiLastMinDanger = minBotDanger;
  const urgentEvadeSec =
    profile.role === 'enemy' ? (profile.difficulty === 'easy' ? 0.52 : 0.68) : 1.25;
  if (minBotDanger <= urgentEvadeSec) {
    const move = findEscapeMove(sim, bot, dangerMap);
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
  }

  // 3. Safe reachability from current tile (enemy bots allow crossing early fuses > 1.2s to press attacks)
  const allowEnemyEarlyCross = profile.role === 'enemy';
  const { dist, firstStep } = computeSafeReachability(
    sim,
    bot,
    dangerMap,
    botSlotIndex,
    allowEnemyEarlyCross
  );
  const { dist: urgentDist, firstStep: urgentFirstStep } = computeSafeReachability(
    sim,
    bot,
    dangerMap,
    botSlotIndex,
    true
  );

  const moveTowardReachable = (targetCol, targetRow, exactX = null, exactZ = null, useUrgent = false) => {
    const dMat = useUrgent ? urgentDist : dist;
    const fMat = useUrgent ? urgentFirstStep : firstStep;
    if (targetCol === bot.col && targetRow === bot.row) {
      return steerToCell(bot, targetCol, targetRow, exactX, exactZ);
    }
    const step = fMat[targetRow][targetCol];
    if (step) {
      if (dMat[targetRow][targetCol] === 1 && exactX !== null && exactZ !== null) {
        return steerToCell(bot, step.col, step.row, exactX, exactZ);
      }
      return steerToCell(bot, step.col, step.row);
    }
    return { moveX: 0, moveZ: 0 };
  };

  // Priority 1: Rescue 'trapped' teammate! (F10 — human's teammate bot prioritizes rescuing trapped p1 within 2 s!)
  const trappedAllies = [];
  let bestTrappedAlly = null;
  let bestAllyMetric = Infinity;
  let bestAllySteps = Infinity;
  let bestAllyUseUrgent = false;
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.id !== bot.id && p.team === bot.team && p.state === PLAYER_STATES.TRAPPED) {
      // Enemy bots have slow rescue awareness (only notice after 1.5s trapped and if within 2 tiles)
      if (profile.role === 'enemy' && (p.trapTimer > 3.5 || Math.hypot(p.x - bot.x, p.z - bot.z) > 2.4)) {
        continue;
      }
      trappedAllies.push(p);
      const safeD = dist[p.row][p.col];
      const urgD = urgentDist[p.row][p.col];
      const maxUrgSteps = p.id === 'p1' ? 8 : profile.role === 'enemy' ? 2 : 5;
      const candidateD = urgD <= maxUrgSteps ? urgD : safeD;
      const candidateUrgent = urgD <= maxUrgSteps && safeD > urgD;
      const p1PriorityWeight = p.id === 'p1' ? 0.4 : 1.0;
      const metric = candidateD * p1PriorityWeight;
      if (metric < bestAllyMetric) {
        bestAllyMetric = metric;
        bestAllySteps = candidateD;
        bestTrappedAlly = p;
        bestAllyUseUrgent = candidateUrgent;
      }
    }
  }
  if (
    bestTrappedAlly &&
    bestAllySteps < Infinity &&
    (minBotDanger === Infinity || bestAllySteps <= (bestTrappedAlly.id === 'p1' ? 8 : 3))
  ) {
    bot._aiUrgentGoal = true;
    const move = moveTowardReachable(
      bestTrappedAlly.col,
      bestTrappedAlly.row,
      bestTrappedAlly.x,
      bestTrappedAlly.z,
      bestAllyUseUrgent
    );
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
  }
  // If a teammate is trapped and an open tile corridor exists (ignoring transient active blasts/bubbles),
  // hold position rather than dropping a self-blocking farming bubble while the blast clears!
  if (
    trappedAllies.length > 0 &&
    bestAllySteps === Infinity &&
    minBotDanger === Infinity &&
    trappedAllies.some((ally) =>
      hasOpenGridPath(sim.grid, bot, bot.col, bot.row, ally.col, ally.row)
    )
  ) {
    return { moveX: 0, moveZ: 0, dropBubble: false, useItem: false };
  }

  // Priority 2: Pop 'trapped' opposing rival! (F09 — weight popping trapped p1 x1.5, aggressive finish!)
  let bestTrappedEnemy = null;
  let bestEnemyPopMetric = Infinity;
  let bestEnemyPopSteps = Infinity;
  let bestEnemyUseUrgent = false;
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.team !== bot.team && p.state === PLAYER_STATES.TRAPPED) {
      if (
        profile.role === 'enemy' &&
        profile.difficulty === 'easy' &&
        p.id === 'p1' &&
        p.trapTimer > 4.1 &&
        Math.hypot(p.x - bot.x, p.z - bot.z) > 2.6
      ) {
        continue;
      }
      const safeD = dist[p.row][p.col];
      const urgD = urgentDist[p.row][p.col];
      const candidateD = urgD <= 9 ? urgD : safeD;
      const candidateUrgent = urgD <= 9 && safeD > urgD;
      const weight = p.id === 'p1' ? 1 / 1.5 : 1.0;
      const metric = candidateD * weight;
      if (metric < bestEnemyPopMetric) {
        bestEnemyPopMetric = metric;
        bestEnemyPopSteps = candidateD;
        bestTrappedEnemy = p;
        bestEnemyUseUrgent = candidateUrgent;
      }
    }
  }
  if (
    bestTrappedEnemy &&
    bestEnemyPopSteps < Infinity &&
    (minBotDanger === Infinity || bestEnemyPopSteps <= 9)
  ) {
    bot._aiUrgentGoal = true;
    const move = moveTowardReachable(
      bestTrappedEnemy.col,
      bestTrappedEnemy.row,
      bestTrappedEnemy.x,
      bestTrappedEnemy.z,
      bestEnemyUseUrgent
    );
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
  }

  // Priority 2.5: Kick Torpedo — push adjacent stationary solidified bubble at 10.0 tiles/s down lane into rivals!
  if (minBotDanger > 1.35) {
    const kickMove = tryKickTorpedo(sim, bot, dangerMap);
    if (kickMove) {
      bot._aiUrgentGoal = true;
      return { moveX: kickMove.moveX, moveZ: kickMove.moveZ, dropBubble: false, useItem: false };
    }
  }

  // If currently inside an early-fuse lane, Blue team steps out immediately while Enemy bots only step out
  // if they dropped their own bubble or the fuse is below 1.15s (allowing human-like offensive pressure).
  const shouldStepOutEarly =
    minBotDanger < Infinity &&
    (profile.role !== 'enemy' || bot.activeBubbles > 0 || minBotDanger <= 1.15);
  if (shouldStepOutEarly) {
    const move = findEscapeMove(sim, bot, dangerMap);
    let crossfireDrop = false;
    if (bot.activeBubbles < bot.maxBubbles) {
      const hitsEnemyOrEscape = sim.players.some((p) => {
        if (p.team === bot.team || p.state !== PLAYER_STATES.ALIVE || p.invulnTimer > 0.25) {
          return false;
        }
        if (Math.hypot(p.x - bot.x, p.z - bot.z) <= 2.8) return true;
        return wouldRayHitTargetCell(
          sim.grid,
          bot.col,
          bot.row,
          bot.blastRange,
          (tc, tr) => Math.abs(tc - p.col) + Math.abs(tr - p.row) <= 1
        );
      });
      if (hitsEnemyOrEscape && canSafelyDropBubble(sim, bot)) {
        crossfireDrop = true;
      }
    }
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: crossfireDrop, useItem: false };
  }

  // Priority 3A: Mode 2 — Bun Mountain / Candy Grab ('bun_grab')
  if (sim.modeId === 'bun_grab') {
    if (bot.carryingBun) {
      const baseTileType =
        bot.team === 0 ? TILE_TYPE.TEAM_BASE_BLUE : TILE_TYPE.TEAM_BASE_RED;
      let bestBase = null;
      let bestBaseDist = Infinity;
      for (let r = 0; r < GRID_ROWS; r += 1) {
        for (let c = 0; c < GRID_COLS; c += 1) {
          if (sim.grid[r][c] === baseTileType && dist[r][c] < bestBaseDist) {
            bestBaseDist = dist[r][c];
            bestBase = { col: c, row: r };
          }
        }
      }
      if (bestBase && bestBaseDist < Infinity) {
        const chasedClosely = sim.players.some(
          (p) =>
            p.team !== bot.team &&
            p.state === PLAYER_STATES.ALIVE &&
            Math.hypot(p.x - bot.x, p.z - bot.z) < 2.2
        );
        const drop = chasedClosely && canSafelyDropBubble(sim, bot);
        const move = moveTowardReachable(bestBase.col, bestBase.row);
        return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: drop, useItem: false };
      }
    } else {
      // Intercept opposing bun carrier to knock the stolen bun loose!
      const enemyCarrier = sim.players.find(
        (p) => p.team !== bot.team && p.state === PLAYER_STATES.ALIVE && p.carryingBun
      );
      if (enemyCarrier) {
        const hitsCarrier = wouldRayHitTargetCell(
          sim.grid,
          bot.col,
          bot.row,
          bot.blastRange,
          (tc, tr) => Math.abs(tc - enemyCarrier.col) + Math.abs(tr - enemyCarrier.row) <= 1
        );
        if (hitsCarrier && canSafelyDropBubble(sim, bot)) {
          return { moveX: 0, moveZ: 0, dropBubble: true, useItem: false };
        }
        const enemyBaseCol = enemyCarrier.team === 0 ? 1 : 13;
        const interceptCol = Math.max(
          1,
          Math.min(GRID_COLS - 2, enemyCarrier.col + Math.sign(enemyBaseCol - enemyCarrier.col) * 2)
        );
        const interceptRow = enemyCarrier.row;
        if (dist[interceptRow][interceptCol] < Infinity) {
          const move = moveTowardReachable(interceptCol, interceptRow);
          return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
        }
        if (dist[enemyCarrier.row][enemyCarrier.col] < Infinity) {
          const move = moveTowardReachable(
            enemyCarrier.col,
            enemyCarrier.row,
            enemyCarrier.x,
            enemyCarrier.z
          );
          return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
        }
      }

      if (bot.bunPickupLockSec <= 0 && sim.looseBuns.length > 0) {
        for (let i = 0; i < sim.pickups.length; i += 1) {
          const pk = sim.pickups[i];
          if (dist[pk.row][pk.col] <= 2) {
            const move = moveTowardReachable(pk.col, pk.row, pk.x, pk.z);
            return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
          }
        }

        let bestBun = null;
        let bestBunDist = Infinity;
        for (let i = 0; i < sim.looseBuns.length; i += 1) {
          const bun = sim.looseBuns[i];
          if (dist[bun.row][bun.col] < bestBunDist) {
            bestBunDist = dist[bun.row][bun.col];
            bestBun = bun;
          }
        }
        if (bestBun && bestBunDist < Infinity) {
          const contestedAtShrine =
            bestBunDist <= 2 &&
            sim.players.some(
              (p) =>
                p.team !== bot.team &&
                p.state === PLAYER_STATES.ALIVE &&
                Math.hypot(p.x - bestBun.x, p.z - bestBun.z) <= 2.8
            );
          const drop = contestedAtShrine && canSafelyDropBubble(sim, bot);
          const move = moveTowardReachable(bestBun.col, bestBun.row, bestBun.x, bestBun.z);
          return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: drop, useItem: false };
        }
      }
    }
  }

  // Priority 3B: Mode 3 — Co-op Boss Golem ('boss_golem')
  if (sim.modeId === 'boss_golem' && sim.boss && sim.boss.state !== 'defeated') {
    let bestPickup = null;
    let bestPickupDist = 5;
    for (let i = 0; i < sim.pickups.length; i += 1) {
      const pk = sim.pickups[i];
      const d = dist[pk.row][pk.col];
      if (d < bestPickupDist) {
        bestPickupDist = d;
        bestPickup = pk;
      }
    }
    if (bestPickup) {
      const move = moveTowardReachable(bestPickup.col, bestPickup.row, bestPickup.x, bestPickup.z);
      return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
    }

    // Co-op ally bots (!isHuman) pace their boss bomb drops so an idle P1 cannot be carried in < 60 s,
    // while autopilot P1 (isHuman === true, 2x damage) attacks at full hero cadence to win in 40–110 s.
    const bossBombCooldownTicks = bot.isHuman ? 0 : 390;
    const canBombBossNow =
      curTick - (bot._lastBossBombTick ?? -(botSlotIndex * 95 + 10)) >= bossBombCooldownTicks;

    if (
      canBombBossNow &&
      wouldRayHitBoss(sim, bot.col, bot.row, bot.blastRange) &&
      canSafelyDropBubble(sim, bot)
    ) {
      bot._lastBossBombTick = curTick;
      return { moveX: 0, moveZ: 0, dropBubble: true, useItem: false };
    }

    let bestStrikeTile = null;
    let bestStrikeScore = Infinity;
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < GRID_COLS; c += 1) {
        if (dist[r][c] === Infinity) continue;
        if (!wouldRayHitBoss(sim, c, r, bot.blastRange)) continue;
        const bossDist = Math.hypot(c + 0.5 - sim.boss.x, r + 0.5 - sim.boss.z);
        if (bossDist < 1.45) continue;
        const slotBias = ((c * 3 + r * 5 + botSlotIndex) % 4) * 0.15;
        const score = dist[r][c] + slotBias;
        if (score < bestStrikeScore) {
          bestStrikeScore = score;
          bestStrikeTile = { col: c, row: r };
        }
      }
    }

    if (bestStrikeTile) {
      const move = moveTowardReachable(bestStrikeTile.col, bestStrikeTile.row);
      return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
    }
  }

  // Distance to nearest alive enemy (never farm soft blocks when an enemy is within 6 tiles!)
  let minEnemyDist = Infinity;
  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.team !== bot.team && p.state === PLAYER_STATES.ALIVE) {
      const ed = Math.hypot(p.x - bot.x, p.z - bot.z);
      if (ed < minEnemyDist) minEnemyDist = ed;
    }
  }
  const enemyWithinSixTiles = minEnemyDist <= 6.0;

  // Priority 4: Collect nearby safe pickups/mounts (only very close pickups when an enemy is within 6 tiles)
  const pickupMaxSteps = enemyWithinSixTiles ? 2 : 5;
  let nearestPickup = null;
  let nearestPickupSteps = pickupMaxSteps + 1;
  for (let i = 0; i < sim.pickups.length; i += 1) {
    const pk = sim.pickups[i];
    const d = dist[pk.row][pk.col];
    if (d < nearestPickupSteps) {
      nearestPickupSteps = d;
      nearestPickup = pk;
    }
  }
  if (nearestPickup) {
    const move = moveTowardReachable(
      nearestPickup.col,
      nearestPickup.row,
      nearestPickup.x,
      nearestPickup.z
    );
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
  }

  const isEasyEnemy = profile.role === 'enemy' && profile.difficulty === 'easy';
  const easyBombReady =
    !isEasyEnemy || curTick - (bot._lastEasyBombTick ?? -200) >= 108;

  // Priority 5B: Bomb an 'alive' enemy in unobstructed blast sight, pincer escape neighbor, or close-quarters boxing range!
  const hitsEnemyOrPincerNow =
    easyBombReady &&
    sim.players.some((p) => {
      if (p.team === bot.team || p.state !== PLAYER_STATES.ALIVE || p.invulnTimer > 0.25) {
        return false;
      }
      if (isEasyEnemy && p.id === 'p1' && curTick < 1500 && p.col <= 2 && p.row <= 2) {
        return false;
      }
      const distToEnemy = Math.hypot(p.x - bot.x, p.z - bot.z);
      if (distToEnemy <= (isEasyEnemy ? 2.1 : 2.8)) return true;
      const enemyAlreadyThreatened = dangerMap[p.row][p.col] < Infinity;
      return wouldRayHitTargetCell(sim.grid, bot.col, bot.row, bot.blastRange, (tc, tr) => {
        if (tc === p.col && tr === p.row) return true;
        if (
          !isEasyEnemy &&
          (enemyAlreadyThreatened || distToEnemy <= 3.8) &&
          Math.abs(tc - p.col) + Math.abs(tr - p.row) === 1
        ) {
          return dangerMap[tr][tc] === Infinity;
        }
        return false;
      });
    });
  if (hitsEnemyOrPincerNow && canSafelyDropBubble(sim, bot)) {
    bot._lastEasyBombTick = curTick;
    return { moveX: 0, moveZ: 0, dropBubble: true, useItem: false };
  }

  // Priority 6: Pursue reachable 'alive' enemy via direct & pincer escape-cutoff strike tiles!
  // On normal difficulty, enemies weight hunting human `p1` by x1.5; on easy, enemies focus bot1/mid-field for the first 25s.
  let bestEnemyStrike = null;
  let bestEnemyStrikeMetric = Infinity;
  let closestReachableEnemy = null;
  let closestEnemyPathMetric = Infinity;

  for (let i = 0; i < sim.players.length; i += 1) {
    const p = sim.players[i];
    if (p.team === bot.team || p.state !== PLAYER_STATES.ALIVE) continue;
    if (isEasyEnemy && p.id === 'p1' && curTick < 1500 && p.col <= 2 && p.row <= 2) {
      continue;
    }
    const huntMultiplier =
      p.id === 'p1' ? (isEasyEnemy ? 0.72 : 1.5) : 1.0;
    const carrierBonus = p.carryingBun ? -6 : 0;
    const enemyAlreadyThreatened = dangerMap[p.row][p.col] < Infinity;

    const targetCells = [{ col: p.col, row: p.row, bonus: 0 }];
    for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
      const ec = p.col + CARDINAL_DIRS[di].dc;
      const er = p.row + CARDINAL_DIRS[di].dr;
      if (!isInBounds(ec, er)) continue;
      const pathMetric = (dist[er][ec] + carrierBonus) / huntMultiplier;
      if (pathMetric < closestEnemyPathMetric) {
        closestEnemyPathMetric = pathMetric;
        closestReachableEnemy = { col: ec, row: er };
      }
      const cell = sim.grid[er][ec];
      if (cell !== TILE_TYPE.HARD_WALL && cell !== TILE_TYPE.SOFT_BLOCK) {
        const pincerBonus =
          enemyAlreadyThreatened && dangerMap[er][ec] === Infinity ? -4.5 : 0.4;
        targetCells.push({ col: ec, row: er, bonus: pincerBonus });
      }
    }

    for (let ti = 0; ti < targetCells.length; ti += 1) {
      const tgt = targetCells[ti];
      for (let r = 0; r < GRID_ROWS; r += 1) {
        for (let c = 0; c < GRID_COLS; c += 1) {
          if (dist[r][c] === Infinity) continue;
          if (c !== tgt.col && r !== tgt.row) continue;
          const manhattan = Math.abs(c - tgt.col) + Math.abs(r - tgt.row);
          if (manhattan < 1 || manhattan > bot.blastRange) continue;
          const hitsTgt = wouldRayHitTargetCell(
            sim.grid,
            c,
            r,
            bot.blastRange,
            (tc, tr) => tc === tgt.col && tr === tgt.row
          );
          if (!hitsTgt) continue;

          const rawMetric =
            dist[r][c] +
            manhattan * 0.22 +
            carrierBonus +
            tgt.bonus +
            ((c * 3 + r * 5 + botSlotIndex) % 4) * 0.14;
          const metric = rawMetric / huntMultiplier;
          if (metric < bestEnemyStrikeMetric) {
            bestEnemyStrikeMetric = metric;
            bestEnemyStrike = { col: c, row: r };
          }
        }
      }
    }
  }

  const adjacentSoftNow = CARDINAL_DIRS.some(({ dc, dr }) => {
    const nc = bot.col + dc;
    const nr = bot.row + dr;
    return isInBounds(nc, nr) && sim.grid[nr][nc] === TILE_TYPE.SOFT_BLOCK;
  });

  if (bestEnemyStrike) {
    if (
      easyBombReady &&
      bestEnemyStrike.col === bot.col &&
      bestEnemyStrike.row === bot.row &&
      canSafelyDropBubble(sim, bot)
    ) {
      bot._lastEasyBombTick = curTick;
      return { moveX: 0, moveZ: 0, dropBubble: true, useItem: false };
    }
    const spareBomb =
      !enemyWithinSixTiles &&
      adjacentSoftNow &&
      bot.maxBubbles >= 3 &&
      bot.activeBubbles < bot.maxBubbles - 1 &&
      canSafelyDropBubble(sim, bot);
    const move = moveTowardReachable(bestEnemyStrike.col, bestEnemyStrike.row);
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: spareBomb, useItem: false };
  }

  if (closestReachableEnemy && closestEnemyPathMetric < Infinity) {
    const spareBomb =
      !enemyWithinSixTiles &&
      adjacentSoftNow &&
      bot.maxBubbles >= 2 &&
      bot.activeBubbles < bot.maxBubbles - 1 &&
      canSafelyDropBubble(sim, bot);
    const move = moveTowardReachable(closestReachableEnemy.col, closestReachableEnemy.row);
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: spareBomb, useItem: false };
  }

  // Priority 7: Breach SOFT_BLOCKs directly along the shortest path toward enemies (weighting p1 x1.5)!
  const breachCost = computeEnemyBreachCostMap(sim, bot);
  let bestBreachTile = null;
  let bestBreachScore = Infinity;

  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < GRID_COLS; c += 1) {
      if (dist[r][c] === Infinity) continue;
      let minAdjSoftBreachCost = Infinity;
      let adjSoftCount = 0;
      for (let di = 0; di < CARDINAL_DIRS.length; di += 1) {
        const nc = c + CARDINAL_DIRS[di].dc;
        const nr = r + CARDINAL_DIRS[di].dr;
        if (isInBounds(nc, nr) && sim.grid[nr][nc] === TILE_TYPE.SOFT_BLOCK) {
          adjSoftCount += 1;
          if (breachCost[nr][nc] < minAdjSoftBreachCost) {
            minAdjSoftBreachCost = breachCost[nr][nc];
          }
        }
      }
      if (adjSoftCount <= 0) continue;
      const score =
        dist[r][c] * 1.15 +
        (minAdjSoftBreachCost < Infinity ? minAdjSoftBreachCost : (Math.abs(c - 7) + Math.abs(r - 6))) -
        adjSoftCount * 0.35;
      if (score < bestBreachScore) {
        bestBreachScore = score;
        bestBreachTile = { col: c, row: r };
      }
    }
  }

  if (bestBreachTile) {
    if (
      bestBreachTile.col === bot.col &&
      bestBreachTile.row === bot.row &&
      canSafelyDropBubble(sim, bot)
    ) {
      return { moveX: 0, moveZ: 0, dropBubble: true, useItem: false };
    }
    const move = moveTowardReachable(bestBreachTile.col, bestBreachTile.row);
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
  }

  if (adjacentSoftNow && canSafelyDropBubble(sim, bot)) {
    return { moveX: 0, moveZ: 0, dropBubble: true, useItem: false };
  }

  if (dist[6][7] < Infinity && (bot.col !== 7 || bot.row !== 6)) {
    const move = moveTowardReachable(7, 6);
    return { moveX: move.moveX, moveZ: move.moveZ, dropBubble: false, useItem: false };
  }

  return { moveX: 0, moveZ: 0, dropBubble: false, useItem: false };
}

/**
 * Computes a single bot's intent { moveX, moveZ, dropBubble, useItem } for the current tick,
 * applying a short safe-navigation commit window so equal-score goal switches never dither.
 */
export function computeBotIntent(sim, bot, botSlotIndex = 0) {
  const prevSteerCell = bot ? bot._aiLastSteerCell : null;
  const raw = computeRawBotIntent(sim, bot, botSlotIndex);
  if (!bot || bot.state !== PLAYER_STATES.ALIVE) {
    if (bot) {
      bot._aiCommitTicks = 0;
      bot._aiLastSafeMoveX = 0;
      bot._aiLastSafeMoveZ = 0;
    }
    return raw;
  }

  const dangerMap = bot._aiLastDangerMap;
  const minDanger = bot._aiLastMinDanger;
  const urgentThreshold =
    bot._aiProfile?.role === 'enemy'
      ? bot._aiProfile?.difficulty === 'easy'
        ? 0.52
        : 0.68
      : 1.25;
  if (
    minDanger <= urgentThreshold ||
    raw.dropBubble ||
    raw.useItem ||
    !dangerMap
  ) {
    bot._aiCommitTicks = 0;
    bot._aiLastSafeMoveX = raw.moveX;
    bot._aiLastSafeMoveZ = raw.moveZ;
    return raw;
  }

  if ((bot._aiCommitTicks || 0) > 0 && bot._aiCommitCell) {
    const { col, row } = bot._aiCommitCell;
    const stillValid =
      isInBounds(col, row) &&
      isCellTraversableForBot(sim, bot, col, row) &&
      dangerMap[row][col] > urgentThreshold &&
      Math.hypot(col + 0.5 - bot.x, row + 0.5 - bot.z) > 0.08;
    if (stillValid) {
      bot._aiCommitTicks -= 1;
      const held = steerToCell(bot, col, row);
      bot._aiLastSafeMoveX = held.moveX;
      bot._aiLastSafeMoveZ = held.moveZ;
      return { moveX: held.moveX, moveZ: held.moveZ, dropBubble: false, useItem: false };
    }
    bot._aiCommitTicks = 0;
  }

  const prevX = bot._aiLastSafeMoveX || 0;
  const prevZ = bot._aiLastSafeMoveZ || 0;
  const reversed = raw.moveX * prevX < -0.05 || raw.moveZ * prevZ < -0.05;
  if (reversed) {
    if (
      prevSteerCell &&
      isInBounds(prevSteerCell.col, prevSteerCell.row) &&
      isCellTraversableForBot(sim, bot, prevSteerCell.col, prevSteerCell.row) &&
      dangerMap[prevSteerCell.row][prevSteerCell.col] > urgentThreshold &&
      Math.hypot(prevSteerCell.col + 0.5 - bot.x, prevSteerCell.row + 0.5 - bot.z) > 0.08
    ) {
      bot._aiCommitCell = { col: prevSteerCell.col, row: prevSteerCell.row };
      bot._aiCommitTicks = 12;
      const held = steerToCell(bot, prevSteerCell.col, prevSteerCell.row);
      bot._aiLastSafeMoveX = held.moveX;
      bot._aiLastSafeMoveZ = held.moveZ;
      return { moveX: held.moveX, moveZ: held.moveZ, dropBubble: false, useItem: false };
    }
    if (bot._aiLastSteerCell) {
      bot._aiCommitCell = { col: bot._aiLastSteerCell.col, row: bot._aiLastSteerCell.row };
      bot._aiCommitTicks = 12;
    }
  }

  bot._aiLastSafeMoveX = raw.moveX;
  bot._aiLastSafeMoveZ = raw.moveZ;
  return raw;
}
