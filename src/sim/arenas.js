/**
 * 15x13 themed arena blueprints for Candy Town (糖果镇), Pirate Bay (海盗),
 * Ice & Snow Village (冰雪), and Toy Block Kingdom (积木), with mode-specific
 * adaptations for Classic 2v2, Bun Mountain Grab (抢包山), and Co-op Boss Golem (机械傀儡).
 *
 * Guarantees >= 3-tile L-shaped safe zones around every player spawn so characters
 * can drop a Frame-1 bubble and step safely around a corner.
 *
 * Pure ES2022 module — zero DOM, Three.js, or WebAudio imports.
 */

import {
  ARENA_IDS,
  ARENA_METADATA,
  GRID_COLS,
  GRID_ROWS,
  TILE_TYPE,
} from '../contracts/constants.js';

export const ARENAS = ARENA_METADATA;

export function resolveArenaId(arenaId) {
  return ARENA_IDS.includes(arenaId) ? arenaId : 'candy_town';
}

export function createEmptyGrid() {
  const grid = [];
  for (let r = 0; r < GRID_ROWS; r += 1) {
    grid.push(new Array(GRID_COLS).fill(TILE_TYPE.EMPTY));
  }
  return grid;
}

export function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

export function isInBounds(col, row) {
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

/**
 * Returns default spawn pads for the 4 roster slots given modeId.
 * Slot 0 = P1 (Blue), Slot 1 = Ally/P2 (Blue), Slot 2 = Rival1 / Coop2, Slot 3 = Rival2 / Coop3.
 *
 * @param {string} modeId
 * @returns {Array<{col: number, row: number}>}
 */
export function getDefaultSpawns(modeId) {
  if (modeId === 'bun_grab') {
    return [
      { col: 1, row: 4 },
      { col: 1, row: 8 },
      { col: 13, row: 4 },
      { col: 13, row: 8 },
    ];
  }
  // Classic 2v2 and Co-op Boss Golem use the 4 classic corner pads
  return [
    { col: 1, row: 1 },
    { col: 1, row: 11 },
    { col: 13, row: 1 },
    { col: 13, row: 11 },
  ];
}

/**
 * Populates themed HARD_WALL obstacles and candidate SOFT_BLOCK positions
 * with distinct tactical topology per arena.
 */
function buildThemedBaseGrid(arenaId, rng) {
  const grid = createEmptyGrid();

  if (arenaId === 'candy_town') {
    // Classic QQ Tang alternating cupcake/peppermint pillars with open central cross avenues
    for (let r = 1; r < GRID_ROWS - 1; r += 1) {
      for (let c = 1; c < GRID_COLS - 1; c += 1) {
        if (c % 2 === 0 && r % 2 === 0 && c !== 7 && r !== 6) {
          grid[r][c] = TILE_TYPE.HARD_WALL;
        }
      }
    }
    // Candy box soft blocks along lanes (deterministic high density ~62%)
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < GRID_COLS; c += 1) {
        if (grid[r][c] === TILE_TYPE.EMPTY && rng.chance(0.60)) {
          grid[r][c] = TILE_TYPE.SOFT_BLOCK;
        }
      }
    }
  } else if (arenaId === 'pirate_bay') {
    // Broadside cannon batteries along rows 3 & 9 + midship capstan pillars
    const cannonCols = [2, 4, 6, 8, 10, 12];
    for (const c of cannonCols) {
      grid[3][c] = TILE_TYPE.HARD_WALL;
      grid[9][c] = TILE_TYPE.HARD_WALL;
    }
    const deckPillars = [
      [3, 6],
      [5, 5],
      [5, 7],
      [9, 5],
      [9, 7],
      [11, 6],
      [2, 1],
      [12, 1],
      [2, 11],
      [12, 11],
    ];
    for (const [c, r] of deckPillars) {
      grid[r][c] = TILE_TYPE.HARD_WALL;
    }
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < GRID_COLS; c += 1) {
        if (grid[r][c] === TILE_TYPE.EMPTY && rng.chance(0.56)) {
          grid[r][c] = TILE_TYPE.SOFT_BLOCK;
        }
      }
    }
  } else if (arenaId === 'ice_village') {
    // Long open skating avenues along cols 3, 7, 11 and rows 2, 6, 10 for Kick combos!
    for (let r = 1; r < GRID_ROWS - 1; r += 1) {
      for (let c = 1; c < GRID_COLS - 1; c += 1) {
        const onSkatingCol = c === 1 || c === 3 || c === 7 || c === 11 || c === 13;
        const onSkatingRow = r === 1 || r === 2 || r === 6 || r === 10 || r === 11;
        if (!onSkatingCol && !onSkatingRow) {
          grid[r][c] = TILE_TYPE.HARD_WALL;
        }
      }
    }
    // Add symmetric glacier crystal posts
    const crystals = [
      [2, 4],
      [12, 4],
      [2, 8],
      [12, 8],
      [5, 2],
      [9, 2],
      [5, 10],
      [9, 10],
    ];
    for (const [c, r] of crystals) {
      grid[r][c] = TILE_TYPE.HARD_WALL;
    }
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < GRID_COLS; c += 1) {
        if (grid[r][c] === TILE_TYPE.EMPTY && rng.chance(0.52)) {
          grid[r][c] = TILE_TYPE.SOFT_BLOCK;
        }
      }
    }
  } else {
    // toy_kingdom: Playroom interlocking L-shaped castle turrets + star blocks
    const hardCoords = [
      // Top-left turret
      [3, 2], [4, 2], [3, 3],
      // Top-right turret
      [11, 2], [10, 2], [11, 3],
      // Bottom-left turret
      [3, 10], [4, 10], [3, 9],
      // Bottom-right turret
      [11, 10], [10, 10], [11, 9],
      // Inner stud posts
      [5, 5], [9, 5], [5, 7], [9, 7],
      [2, 6], [12, 6], [7, 2], [7, 10],
    ];
    for (const [c, r] of hardCoords) {
      grid[r][c] = TILE_TYPE.HARD_WALL;
    }
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < GRID_COLS; c += 1) {
        if (grid[r][c] === TILE_TYPE.EMPTY && rng.chance(0.62)) {
          grid[r][c] = TILE_TYPE.SOFT_BLOCK;
        }
      }
    }
  }

  return grid;
}

/**
 * Guarantees an L-shaped >= 4-tile clear safe zone around a spawn coordinate (sc, sr)
 * so the character can drop a bubble on tick 0 and turn around a corner safely.
 */
export function carveSpawnSafeZone(grid, sc, sr) {
  const clearCell = (c, r) => {
    if (!isInBounds(c, r)) return;
    if (grid[r][c] === TILE_TYPE.HARD_WALL || grid[r][c] === TILE_TYPE.SOFT_BLOCK) {
      grid[r][c] = TILE_TYPE.EMPTY;
    }
  };

  clearCell(sc, sr);
  const dxInward = sc < GRID_COLS / 2 ? 1 : -1;
  const dzInward = sr < GRID_ROWS / 2 ? 1 : -1;

  // Clear inward L-corridor (spawn + 2 horizontal + 2 vertical + inner corner bend escape)
  clearCell(sc + dxInward, sr);
  clearCell(sc + dxInward * 2, sr);
  clearCell(sc, sr + dzInward);
  clearCell(sc, sr + dzInward * 2);
  // Ensure an orthogonal escape step off the inward arm too
  clearCell(sc + dxInward, sr + dzInward);
  // Also clear outward edge neighbor if near corner
  if (isInBounds(sc - dxInward, sr)) clearCell(sc - dxInward, sr);
  if (isInBounds(sc, sr - dzInward)) clearCell(sc, sr - dzInward);
}

/**
 * Builds the complete mode-adapted 15x13 arena layout and landmarks.
 *
 * @param {string} arenaId
 * @param {string} modeId
 * @param {import('./prng.js').Mulberry32} rng
 * @returns {{
 *   arenaId: string,
 *   grid: number[][],
 *   spawns: Array<{col: number, row: number}>,
 *   bunShrineSlots: Array<{col: number, row: number}>,
 *   bossSpawn: {col: number, row: number} | null
 * }}
 */
export function generateArena(arenaId, modeId, rng) {
  const resolvedArena = resolveArenaId(arenaId);
  const grid = buildThemedBaseGrid(resolvedArena, rng);
  const spawns = getDefaultSpawns(modeId);
  let bunShrineSlots = [];
  let bossSpawn = null;

  if (modeId === 'bun_grab') {
    // Enforce left-right mirror symmetry so Blue (left) and Red (right) face identical lane geometry
    for (let r = 0; r < GRID_ROWS; r += 1) {
      for (let c = 0; c < Math.floor(GRID_COLS / 2); c += 1) {
        grid[r][GRID_COLS - 1 - c] = grid[r][c];
      }
    }

    // Clear compact 3x3 Bun Mountain shrine apron and place BUN_SHRINE at center (7, 6)
    for (let r = 5; r <= 7; r += 1) {
      for (let c = 6; c <= 8; c += 1) {
        grid[r][c] = TILE_TYPE.EMPTY;
      }
    }
    grid[6][7] = TILE_TYPE.BUN_SHRINE;
    bunShrineSlots = [
      { col: 7, row: 6 },
      { col: 7, row: 5 },
      { col: 7, row: 7 },
      { col: 6, row: 6 },
      { col: 8, row: 6 },
    ];

    // Ensure Hard Walls never seal row 6 between bases and center shrine
    for (let c = 2; c <= 12; c += 1) {
      if (grid[6][c] === TILE_TYPE.HARD_WALL) {
        grid[6][c] = TILE_TYPE.EMPTY;
      }
    }

    // Place symmetric destructible SOFT_BLOCK gates around the shrine approaches so teams
    // blast open lanes, gather powerups, and clash tactically instead of pure tick-0 footraces!
    const symmetricSoftGates = [
      [4, 4], [10, 4],
      [4, 6], [10, 6],
      [4, 8], [10, 8],
      [5, 4], [9, 4],
      [5, 6], [9, 6],
      [5, 8], [9, 8],
    ];
    for (const [gc, gr] of symmetricSoftGates) {
      if (grid[gr][gc] === TILE_TYPE.EMPTY) {
        grid[gr][gc] = TILE_TYPE.SOFT_BLOCK;
      }
    }

    // Carve Blue Team Home Base on left (cols 0..1, rows 5..7) & Red Team Home Base on right (cols 13..14, rows 5..7)
    for (let r = 5; r <= 7; r += 1) {
      grid[r][0] = TILE_TYPE.TEAM_BASE_BLUE;
      grid[r][1] = TILE_TYPE.TEAM_BASE_BLUE;
      grid[r][2] = TILE_TYPE.EMPTY;

      grid[r][14] = TILE_TYPE.TEAM_BASE_RED;
      grid[r][13] = TILE_TYPE.TEAM_BASE_RED;
      grid[r][12] = TILE_TYPE.EMPTY;
    }
  } else if (modeId === 'boss_golem') {
    // Open central 7x7 combat ring (cols 4..10, rows 3..9) so 2x2 Mechanical Golem patrols cleanly
    for (let r = 3; r <= 9; r += 1) {
      for (let c = 4; c <= 10; c += 1) {
        if (grid[r][c] === TILE_TYPE.HARD_WALL) {
          grid[r][c] = TILE_TYPE.EMPTY;
        }
        // Keep central 5x5 completely clear at start so Golem spawns unobstructed
        if (c >= 5 && c <= 9 && r >= 4 && r <= 8) {
          grid[r][c] = TILE_TYPE.EMPTY;
        }
      }
    }
    // 2x2 Boss top-left at (6, 5) -> occupies (6,5), (7,5), (6,6), (7,6), center at (7.0, 6.0)
    bossSpawn = { col: 6, row: 5 };
  } else if (modeId === 'classic_2v2') {
    // Carve fast skirmish engagement avenues along top (row 1), center (row 6), bottom (row 11),
    // and mid-column (col 7), keeping 1 destructible gate per flank so rivals clash within ~10s!
    for (const r of [1, 6, 11]) {
      for (let c = 2; c <= 12; c += 1) {
        if (grid[r][c] === TILE_TYPE.SOFT_BLOCK) {
          grid[r][c] = c === 7 ? TILE_TYPE.SOFT_BLOCK : TILE_TYPE.EMPTY;
        }
      }
    }
    for (let r = 2; r <= 10; r += 1) {
      if (grid[r][7] === TILE_TYPE.SOFT_BLOCK && r !== 6) {
        grid[r][7] = TILE_TYPE.EMPTY;
      }
    }
  }

  for (const sp of spawns) {
    carveSpawnSafeZone(grid, sp.col, sp.row);
  }

  // Re-assert bases in case spawn safe-zone carving touched adjacent rows in bun_grab
  if (modeId === 'bun_grab') {
    for (let r = 5; r <= 7; r += 1) {
      grid[r][0] = TILE_TYPE.TEAM_BASE_BLUE;
      grid[r][1] = TILE_TYPE.TEAM_BASE_BLUE;
      grid[r][13] = TILE_TYPE.TEAM_BASE_RED;
      grid[r][14] = TILE_TYPE.TEAM_BASE_RED;
    }
    grid[6][7] = TILE_TYPE.BUN_SHRINE;
  }

  return {
    arenaId: resolvedArena,
    grid,
    spawns,
    bunShrineSlots,
    bossSpawn,
  };
}
