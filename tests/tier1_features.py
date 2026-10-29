#!/usr/bin/env python3
"""Tier 1 Happy-Path Feature E2E Tests (55 test cases, >=5 per feature group).

Covers every feature area F01–F28 from ORIGINAL_REQUEST.md (R1–R3, AC1–AC6)
and PROJECT.md § Feature Inventory using genuine fixed-timestep physics,
real input intents, real DOM events, and WebGL2 diagnostics.
"""

from __future__ import annotations

from typing import Callable

from harness import QQTangTestHarness, TestCaseSpec


TIER1_TESTS: list[TestCaseSpec] = []


def _t1(group: str) -> Callable[[Callable[[QQTangTestHarness], None]], Callable[[QQTangTestHarness], None]]:
  def decorator(fn: Callable[[QQTangTestHarness], None]) -> Callable[[QQTangTestHarness], None]:
    TIER1_TESTS.append(TestCaseSpec(tier=1, name=fn.__name__, group=group, fn=fn))
    return fn

  return decorator


def _ensure_loaded(h: QQTangTestHarness) -> None:
  has_api = h.eval_js("Boolean(window.__QQTANG__ || window.__QQ_TANG__)")
  if not has_api:
    h.set_viewport(1280, 800, mobile=False, touch=False)
    h.navigate(wait_qqtang=True)


# ==============================================================================
# Group 1A: Grid, Fixed-Timestep Movement & Corner-Assist (F01, F02) — 6 tests
# ==============================================================================


@_t1("1A_grid_and_movement")
def test_f01_grid_dimensions_and_fixed_timestep_advance(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const s0 = api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1001,
        botBehavior: 'idle',
      });
      api.setDeterministicMode(true);
      api.setAutoPlayP1(false);
      const s1 = api.stepFrames(1);
      const s61 = api.stepFrames(60);
      return {
        rows: s0.sim.grid.length,
        cols: s0.sim.grid[0].length,
        tick0: s0.sim.tick,
        tick1: s1.sim.tick,
        tick61: s61.sim.tick,
        dt60: s1.sim.timeRemainingSec - s61.sim.timeRemainingSec,
      };
      """
  )
  assert res["rows"] == 13 and res["cols"] == 15, res
  assert res["tick1"] - res["tick0"] == 1, res
  assert res["tick61"] - res["tick1"] == 60, res
  assert 0.95 <= res["dt60"] <= 1.05, res


@_t1("1A_grid_and_movement")
def test_f01_cardinal_movement_east_and_west(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1002,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const p0 = getPlayer(api.getState(), 'p1');
      api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      const midEast = getPlayer(api.stepFrames(24), 'p1');
      const facingEast = midEast.facingRad;
      const movingFlag = midEast.isMoving;
      api.setPlayerInput('p1', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
      const afterWest = getPlayer(api.stepFrames(24), 'p1');
      clearInput('p1');
      const stopped = getPlayer(api.stepFrames(1), 'p1');
      return {
        x0: p0.x,
        xEast: midEast.x,
        colEast: midEast.col,
        xWest: afterWest.x,
        movingFlag,
        stoppedFlag: stopped.isMoving,
        facingDiff: Math.abs(facingEast - afterWest.facingRad),
      };
      """
  )
  assert res["xEast"] - res["x0"] > 1.5, res
  assert res["colEast"] > 3, res
  assert abs(res["xWest"] - res["x0"]) < 0.25, res
  assert res["movingFlag"] is True and res["stoppedFlag"] is False, res
  assert res["facingDiff"] > 1.5, res


@_t1("1A_grid_and_movement")
def test_f01_cardinal_movement_north_and_south(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1003,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 4, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const p0 = getPlayer(api.getState(), 'p1');
      const sSouth = moveHold('p1', 0, 1, 24);
      const pSouth = getPlayer(sSouth, 'p1');
      const sNorth = moveHold('p1', 0, -1, 36);
      const pNorth = getPlayer(sNorth, 'p1');
      return {
        z0: p0.z,
        zSouth: pSouth.z,
        rowSouth: pSouth.row,
        zNorth: pNorth.z,
        rowNorth: pNorth.row,
        distStat: pNorth.stats.distanceMoved,
      };
      """
  )
  assert res["zSouth"] - res["z0"] > 1.5 and res["rowSouth"] > 4, res
  assert res["zNorth"] < res["z0"] and res["rowNorth"] < 4, res
  assert res["distStat"] > 3.5, res


@_t1("1A_grid_and_movement")
def test_f01_spawn_safe_zone_l_shape_clearance(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const arenas = ['candy_town', 'pirate_bay', 'ice_village', 'toy_kingdom'];
      const report = [];
      for (const arenaId of arenas) {
        const st = api.startMatch({
          modeId: 'classic_2v2',
          arenaId,
          p1CharacterId: 'miduo',
          seed: 1004,
          botBehavior: 'idle',
        });
        api.setDeterministicMode(true);
        const g = st.sim.grid;
        const passable = (c, r) => r >= 0 && r < 13 && c >= 0 && c < 15 && g[r][c] === 0;
        for (const p of st.sim.players) {
          // BFS up to depth 2 to verify an L-shaped escape corner (>=3 tiles including non-collinear turn)
          const visited = new Map();
          const q = [[p.col, p.row]];
          visited.set(`${p.col},${p.row}`, [p.col, p.row]);
          while (q.length && visited.size < 8) {
            const [c, r] = q.shift();
            for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nc = c + dc, nr = r + dr;
              const k = `${nc},${nr}`;
              if (passable(nc, nr) && !visited.has(k) && Math.abs(nc - p.col) + Math.abs(nr - p.row) <= 2) {
                visited.set(k, [nc, nr]);
                q.push([nc, nr]);
              }
            }
          }
          const pts = Array.from(visited.values());
          const hasCorner = pts.some(([c, r]) => c !== p.col && r !== p.row) ||
                            (pts.some(([c]) => c !== p.col) && pts.some(([, r]) => r !== p.row));
          report.push({ arenaId, player: p.id, spawnFree: passable(p.col, p.row), count: pts.length, hasCorner });
        }
      }
      return report;
      """
  )
  for entry in res:
    assert entry["spawnFree"] is True, entry
    assert entry["count"] >= 3 and entry["hasCorner"] is True, entry


@_t1("1A_grid_and_movement")
def test_f02_corner_assist_slides_around_hard_wall_east(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // HARD_WALL at (5, 5), open lane along row 6. Spawn p1 slightly nudged toward row 5 (z offset -0.30)
      const g = makeGrid({ walls: [[5, 5]] });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1005,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      // Nudge slightly North (~4 frames) so p1 overlaps the vertical projection of wall (5, 5)
      moveHold('p1', 0, -1, 4);
      const before = getPlayer(api.getState(), 'p1');
      // Now press purely East: corner-assist must smoothly align p1 back onto row 6 and pass col 5!
      const afterSt = moveHold('p1', 1, 0, 36);
      const after = getPlayer(afterSt, 'p1');
      return { beforeX: before.x, beforeZ: before.z, afterX: after.x, afterZ: after.z, afterCol: after.col };
      """
  )
  assert res["afterX"] - res["beforeX"] > 1.8 and res["afterCol"] >= 6, res


@_t1("1A_grid_and_movement")
def test_f02_corner_assist_slides_around_soft_block_south(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // SOFT_BLOCK at (6, 5), open vertical lane along col 7.
      const g = makeGrid({ softBlocks: [[6, 5]] });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1006,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 7, row: 4, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      // Nudge slightly West (~4 frames) so collider clips edge of (6, 5)
      moveHold('p1', -1, 0, 4);
      const before = getPlayer(api.getState(), 'p1');
      // Press purely South: corner-assist slides p1 cleanly down col 7 past row 5!
      const after = getPlayer(moveHold('p1', 0, 1, 36), 'p1');
      return { beforeZ: before.z, afterZ: after.z, afterRow: after.row };
      """
  )
  assert res["afterZ"] - res["beforeZ"] > 1.8 and res["afterRow"] >= 6, res


# ==============================================================================
# Group 1B: Bubble Placement, Walk-Off, Fuse & Chain Blast (F03–F07) — 7 tests
# ==============================================================================


@_t1("1B_bubbles_and_blasts")
def test_f03_bubble_drop_centers_on_tile_and_increments_active_count(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1101,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const s = pulseDropBubble('p1');
      const p1 = getPlayer(s, 'p1');
      const b = s.sim.bubbles[0];
      return {
        bubbleCount: s.sim.bubbles.length,
        col: b.col,
        row: b.row,
        fuse: b.fuseRemaining,
        activeBubbles: p1.activeBubbles,
        placedStat: p1.stats.bubblesPlaced,
      };
      """
  )
  assert res["bubbleCount"] == 1, res
  assert res["col"] == 5 and res["row"] == 6, res
  assert 2.85 <= res["fuse"] <= 3.05, res
  assert res["activeBubbles"] == 1 and res["placedStat"] == 1, res


@_t1("1B_bubbles_and_blasts")
def test_f03_bubble_capacity_gate_blocks_excess_drops(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // startBubbles = 1
        seed: 1102,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      moveHold('p1', 1, 0, 18); // Move onto (5, 6)
      const s2 = pulseDropBubble('p1'); // Should be rejected because activeBubbles (1) == maxBubbles (1)
      const p1 = getPlayer(s2, 'p1');
      return { maxBubbles: p1.maxBubbles, activeBubbles: p1.activeBubbles, count: s2.sim.bubbles.length };
      """
  )
  assert res["maxBubbles"] == 1 and res["activeBubbles"] == 1 and res["count"] == 1, res


@_t1("1B_bubbles_and_blasts")
def test_f04_walk_off_grace_allows_placer_exit_then_blocks_reentry(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1103,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const sDrop = pulseDropBubble('p1');
      const passAtSpawn = sDrop.sim.bubbles[0].passThroughIds.slice();
      const bX = sDrop.sim.bubbles[0].x;

      // Walk East ~1.5 tiles to separate completely from (6, 6)
      const sExit = moveHold('p1', 1, 0, 22);
      const passAfterExit = sExit.sim.bubbles[0].passThroughIds.slice();
      const xAfterExit = getPlayer(sExit, 'p1').x;

      // Attempt to walk West back onto (6, 6) for 35 frames: must be blocked outside bubble!
      const sBlocked = moveHold('p1', -1, 0, 35);
      const pBlocked = getPlayer(sBlocked, 'p1');
      return {
        passAtSpawn,
        passAfterExit,
        bX,
        xAfterExit,
        xBlocked: pBlocked.x,
        colBlocked: pBlocked.col,
      };
      """
  )
  assert "p1" in res["passAtSpawn"], res
  assert "p1" not in res["passAfterExit"], res
  assert res["xAfterExit"] > res["bX"] + 1.0, res
  assert res["xBlocked"] > res["bX"] + 0.75 and res["colBlocked"] >= 7, res


@_t1("1B_bubbles_and_blasts")
def test_f05_fuse_countdown_detonates_at_3_seconds_and_refunds_quota(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1104,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 4, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const s0 = pulseDropBubble('p1');
      // Escape L-corner: East 2 tiles, South 2 tiles
      moveHold('p1', 1, 0, 24);
      moveHold('p1', 0, 1, 24);
      const sMid = api.stepFrames(60); // ~109 frames elapsed (~1.8s)
      const fuseMid = sMid.sim.bubbles[0]?.fuseRemaining ?? -1;

      let detonateTick = -1;
      let blastsAtDetonate = 0;
      let activeAfter = -1;
      for (let i = 0; i < 100; i++) {
        const st = api.stepFrames(1);
        if (st.sim.bubbles.length === 0) {
          detonateTick = st.sim.tick;
          blastsAtDetonate = st.sim.blasts.length;
          activeAfter = getPlayer(st, 'p1').activeBubbles;
          break;
        }
      }
      return { tickDrop: s0.sim.tick, fuseMid, detonateTick, blastsAtDetonate, activeAfter };
      """
  )
  assert 0.8 <= res["fuseMid"] <= 1.5, res
  elapsed_ticks = res["detonateTick"] - res["tickDrop"]
  assert 175 <= elapsed_ticks <= 185, (elapsed_ticks, res)
  assert res["blastsAtDetonate"] >= 1 and res["activeAfter"] == 0, res


@_t1("1B_bubbles_and_blasts")
def test_f06_four_way_cardinal_blast_rays_on_open_cross(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // startPower = 2
        seed: 1105,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      // Escape diagonally via East 2, South 2 so p1 is safe at (9, 8)
      moveHold('p1', 1, 0, 26);
      moveHold('p1', 0, 1, 26);
      let blastSnap = null;
      for (let i = 0; i < 160; i++) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          blastSnap = st.sim.blasts[0];
          break;
        }
      }
      return blastSnap;
      """
  )
  assert res is not None, "Expected blast wave to spawn"
  coords = {(t["col"], t["row"]) for t in res["tiles"]}
  expected = {
      (7, 6),
      (7, 5), (7, 4),  # North 2
      (7, 7), (7, 8),  # South 2
      (6, 6), (5, 6),  # West 2
      (8, 6), (9, 6),  # East 2
  }
  assert expected.issubset(coords), f"Missing cardinal blast tiles: expected {expected}, got {coords}"
  assert 0.30 <= res["remainingSec"] <= 0.45, res


@_t1("1B_bubbles_and_blasts")
def test_f06_soft_block_destruction_increments_blocks_broken(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const g = makeGrid({ softBlocks: [[6, 4]] });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1106,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 5, row: 4, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1'); // at (5, 4), hits (6, 4)
      moveHold('p1', -1, 0, 22);
      moveHold('p1', 0, 1, 22);
      let finalSt = null;
      for (let i = 0; i < 160; i++) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          finalSt = st;
          break;
        }
      }
      return {
        tileAfter: finalSt.sim.grid[4][6],
        blocksBroken: getPlayer(finalSt, 'p1').stats.blocksBroken,
      };
      """
  )
  assert res["tileAfter"] == 0 and res["blocksBroken"] >= 1, res


@_t1("1B_bubbles_and_blasts")
def test_f07_instant_bfs_chain_detonation_same_tick(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // xiaoqiang starts with maxBubbles = 2, startPower = 1
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        seed: 1107,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      // Drop Bubble A at (5, 6) at tick 1
      pulseDropBubble('p1');
      // Move East to (6, 6) and wait 50 frames (~0.83s) so Bubble B's fuse is ~0.83s younger than A!
      moveHold('p1', 1, 0, 15);
      api.stepFrames(45);
      const sBeforeB = pulseDropBubble('p1'); // Bubble B at (6, 6), 1 tile East of A!
      const fuseGap = sBeforeB.sim.bubbles[1].fuseRemaining - sBeforeB.sim.bubbles[0].fuseRemaining;
      // Escape to (8, 8)
      moveHold('p1', 1, 0, 26);
      moveHold('p1', 0, 1, 26);

      let detTick = -1;
      let remainingBubblesOnDetTick = -1;
      let allBlastTiles = [];
      for (let i = 0; i < 150; i++) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          detTick = st.sim.tick;
          remainingBubblesOnDetTick = st.sim.bubbles.length;
          for (const bl of st.sim.blasts) {
            for (const t of bl.tiles) allBlastTiles.push(`${t.col},${t.row}`);
          }
          break;
        }
      }
      return { fuseGap, detTick, remainingBubblesOnDetTick, allBlastTiles };
      """
  )
  assert res["fuseGap"] > 0.7, res
  # Both Bubble A and Bubble B must detonate on the EXACT same tick!
  assert res["remainingBubblesOnDetTick"] == 0, res
  # Bubble B at (6, 6) with range 1 extends blast to (7, 6), which Bubble A (at 5,6 range 1) could not reach alone!
  assert "7,6" in res["allBlastTiles"], res


# ==============================================================================
# Group 1C: Bubble-Trap, Enemy Pop, Ally Rescue, Timeout & Needle (F08–F11, F17) — 6 tests
# ==============================================================================


@_t1("1C_trap_pop_rescue_needle")
def test_f08_blast_hit_traps_live_character_not_instant_death(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1201,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 6, row: 6, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1'); // at (5, 6), hits bot2 at (6, 6)
      moveHold('p1', -1, 0, 22);
      moveHold('p1', 0, 1, 22);
      let hitTarget = null;
      for (let i = 0; i < 160; i++) {
        const st = api.stepFrames(1);
        const b2 = getPlayer(st, 'bot2');
        if (b2.state !== 'alive') {
          hitTarget = b2;
          break;
        }
      }
      return hitTarget;
      """
  )
  assert res is not None, "Expected bot2 to be hit by blast"
  assert res["state"] == "trapped", f"Expected 'trapped' (not instant death!), got {res}"
  assert res["trapTimer"] >= 4.5, res
  assert res["effectiveSpeed"] < res["baseSpeed"] * 0.4, res


@_t1("1C_trap_pop_rescue_needle")
def test_f09_enemy_contact_pops_trapped_character(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1202,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 6, row: 6, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      // Dodge safely to (4, 7)
      moveHold('p1', -1, 0, 16);
      moveHold('p1', 0, 1, 16);
      // Wait for detonation + blast linger to clear (~210 frames total)
      let st = api.stepFrames(180);
      const stateAfterBlast = getPlayer(st, 'bot2').state;
      // Steer p1 onto trapped bot2 at (6.5, 6.5)
      const target = getPlayer(st, 'bot2');
      st = steerToWorld('p1', 'p1', target.x, target.z, 120, 0.25);
      const b2After = getPlayer(st, 'bot2');
      const p1After = getPlayer(st, 'p1');
      return { stateAfterBlast, finalState: b2After.state, kos: p1After.stats.kos };
      """
  )
  assert res["stateAfterBlast"] == "trapped", res
  assert res["finalState"] == "eliminated" and res["kos"] >= 1, res


@_t1("1C_trap_pop_rescue_needle")
def test_f10_teammate_contact_rescues_trapped_ally(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1203,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 6, row: 6, team: 0 }, // Same-team ally!
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 16);
      moveHold('p1', 0, 1, 16);
      let st = api.stepFrames(180);
      const allyTrapped = getPlayer(st, 'bot1').state;
      const allyPos = getPlayer(st, 'bot1');
      st = steerToWorld('p1', 'p1', allyPos.x, allyPos.z, 120, 0.25);
      const allyRescued = getPlayer(st, 'bot1');
      const p1After = getPlayer(st, 'p1');
      return {
        allyTrapped,
        allyStateAfter: allyRescued.state,
        allyInvuln: allyRescued.invulnTimer,
        rescues: p1After.stats.rescues,
      };
      """
  )
  assert res["allyTrapped"] == "trapped", res
  assert res["allyStateAfter"] == "alive", res
  assert res["allyInvuln"] >= 1.0 and res["rescues"] >= 1, res


@_t1("1C_trap_pop_rescue_needle")
def test_f11_trap_timeout_bursts_into_eliminated(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1204,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 6, row: 6, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 24);
      moveHold('p1', 0, 1, 24);
      let st = api.stepFrames(160);
      const midState = getPlayer(st, 'bot2').state;
      // Advance > 5.5s (360 ticks) without anyone touching bot2
      st = api.stepFrames(360);
      const endState = getPlayer(st, 'bot2').state;
      return { midState, endState };
      """
  )
  assert res["midState"] == "trapped" and res["endState"] == "eliminated", res


@_t1("1C_trap_pop_rescue_needle")
def test_f17_needle_pickup_and_self_rescue_when_trapped(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1205,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'needle', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      // Walk East onto (5, 6) to collect Needle
      let st = moveHold('p1', 1, 0, 18);
      const needlesCollected = getPlayer(st, 'p1').needles;
      // Drop bubble on self and stay put so p1 gets trapped!
      pulseDropBubble('p1');
      for (let i = 0; i < 195; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'p1').state === 'trapped') break;
      }
      const trappedState = getPlayer(st, 'p1').state;
      // Trigger Needle self-rescue!
      st = pulseUseItem('p1');
      const pAfter = getPlayer(st, 'p1');
      return {
        needlesCollected,
        trappedState,
        stateAfterNeedle: pAfter.state,
        needlesRemaining: pAfter.needles,
        invulnAfter: pAfter.invulnTimer,
      };
      """
  )
  assert res["needlesCollected"] == 1 and res["trappedState"] == "trapped", res
  assert res["stateAfterNeedle"] == "alive" and res["needlesRemaining"] == 0, res
  assert res["invulnAfter"] >= 1.0, res


@_t1("1C_trap_pop_rescue_needle")
def test_f17_hud_needle_button_click_self_rescues_trapped_p1(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  h.set_viewport(1024, 768, mobile=True, touch=True)
  pre = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1206,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'needle', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      moveHold('p1', 1, 0, 18);
      pulseDropBubble('p1');
      let st = api.getState();
      for (let i = 0; i < 195; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'p1').state === 'trapped') break;
      }
      return getPlayer(st, 'p1');
      """
  )
  assert pre["state"] == "trapped" and pre["needles"] == 1, pre
  h.click_testid("hud-btn-item")
  after = h.run_sim_js("return getPlayer(api.stepFrames(2), 'p1');")
  assert after["state"] == "alive" and after["needles"] == 0, after
  h.set_viewport(1280, 800, mobile=False, touch=False)


# ==============================================================================
# Group 1D: Core Stat & Ability Pickups (F12–F16, F18) — 7 tests
# ==============================================================================


@_t1("1D_stat_and_ability_pickups")
def test_f12_breaking_soft_blocks_spawns_floor_pickups(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const softs = [
        [4, 3], [6, 3], [5, 2], [5, 4],
        [9, 3], [11, 3], [10, 2], [10, 4],
      ];
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang', // 2 bubbles
        seed: 1301,
        botBehavior: 'idle',
        customGrid: makeGrid({ softBlocks: softs }),
        customSpawns: [
          { id: 'p1', col: 5, row: 3, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 11, team: 1 },
          { id: 'bot3', col: 13, row: 9, team: 1 },
        ],
        customPickups: [{ type: 'power', col: 6, row: 6 }],
      });
      api.setDeterministicMode(true);
      // Drop at (5, 3) breaking 4 surrounding soft blocks
      pulseDropBubble('p1');
      // Escape via open diagonal? Wait: (5,3) has soft blocks on all 4 sides if we put all 4!
      // Let's check: leave (5, 4) open so p1 walks South!
      return true;
      """
  )
  # Run with South escape lane open around (5,3) and (10,3) so 6 soft blocks break cleanly
  res = h.run_sim_js(
      """
      const softs = [
        [4, 3], [6, 3], [5, 2],
        [9, 3], [11, 3], [10, 2],
      ];
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 4242,
        botBehavior: 'idle',
        customGrid: makeGrid({ softBlocks: softs }),
        customSpawns: [
          { id: 'p1', col: 5, row: 3, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 11, team: 1 },
          { id: 'bot3', col: 13, row: 9, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      // Wave 1 at (5, 3) -> breaks 3 soft blocks
      pulseDropBubble('p1');
      moveHold('p1', 0, 1, 24);
      moveHold('p1', 1, 0, 60); // move toward col 10
      api.stepFrames(110);
      // Steer to (10, 3) and break 3 more soft blocks (6 total, ~52% rate -> high probability >=1 drop)
      steerToWorld('p1', 'p1', 10.5, 3.5, 160);
      pulseDropBubble('p1');
      moveHold('p1', 0, 1, 24);
      moveHold('p1', -1, 0, 24);
      const st = api.stepFrames(150);
      const validTypes = ['bubble', 'power', 'speed', 'kick', 'needle', 'shield', 'turtle', 'ufo'];
      return {
        blocksBroken: getPlayer(st, 'p1').stats.blocksBroken,
        pickups: st.sim.pickups,
        allTypesValid: st.sim.pickups.every((pk) => validTypes.includes(pk.type)),
      };
      """
  )
  assert res["blocksBroken"] == 6, res
  assert len(res["pickups"]) >= 1 and res["allTypesValid"] is True, res


@_t1("1D_stat_and_ability_pickups")
def test_f13_sugar_bubble_pickup_increases_max_bubbles_and_allows_multi_drop(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // startBubbles = 1
        seed: 1302,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'bubble', col: 4, row: 6 }],
      });
      api.setDeterministicMode(true);
      const before = getPlayer(api.getState(), 'p1').maxBubbles;
      let st = moveHold('p1', 1, 0, 18); // Collect 'bubble' at (4, 6)
      const after = getPlayer(st, 'p1').maxBubbles;
      const pickupsLeft = st.sim.pickups.length;
      // Drop 2 simultaneous bubbles on (4, 6) and (5, 6)!
      pulseDropBubble('p1');
      moveHold('p1', 1, 0, 18);
      st = pulseDropBubble('p1');
      return { before, after, pickupsLeft, simultaneousBubbles: st.sim.bubbles.length };
      """
  )
  assert res["before"] == 1 and res["after"] == 2, res
  assert res["pickupsLeft"] == 0 and res["simultaneousBubbles"] == 2, res


@_t1("1D_stat_and_ability_pickups")
def test_f14_power_syrup_pickup_increases_blast_range_and_ray_reach(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'wanzi', // startPower = 1
        seed: 1303,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'power', col: 6, row: 6 }],
      });
      api.setDeterministicMode(true);
      const before = getPlayer(api.getState(), 'p1').blastRange;
      let st = steerToWorld('p1', 'p1', 6.5, 6.5, 45); // Collect 'power' and center on (6, 6)
      const after = getPlayer(st, 'p1').blastRange;
      // Place bubble at (6, 6) -> East & West rays now reach (8, 6) and (4, 6) (distance 2)!
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 22);
      moveHold('p1', 0, 1, 22);
      let blastTiles = [];
      for (let i = 0; i < 160; i++) {
        st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          blastTiles = st.sim.blasts[0].tiles.map((t) => `${t.col},${t.row}`);
          break;
        }
      }
      return { before, after, blastTiles };
      """
  )
  assert res["before"] == 1 and res["after"] == 2, res
  assert "8,6" in res["blastTiles"] and "4,6" in res["blastTiles"], res


@_t1("1D_stat_and_ability_pickups")
def test_f15_roller_skates_pickup_increases_base_speed_and_displacement(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // startSpeed = 5.0
        seed: 1304,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 1, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'speed', col: 5, row: 6 },
          { type: 'speed', col: 6, row: 6 },
        ],
      });
      api.setDeterministicMode(true);
      const p0 = getPlayer(api.getState(), 'p1');
      // Measure 24-frame travel before skates
      const p1Before = getPlayer(moveHold('p1', 1, 0, 24), 'p1');
      const dispBefore = p1Before.x - p0.x;
      // Walk East across (5, 6) and (6, 6) to collect 2 Roller Skates (+0.90 tiles/s)
      const sCollected = moveHold('p1', 1, 0, 40);
      const pCollected = getPlayer(sCollected, 'p1');
      // Measure 24-frame travel West after skates!
      const pAfter = getPlayer(moveHold('p1', -1, 0, 24), 'p1');
      const dispAfter = pCollected.x - pAfter.x;
      return {
        speedBefore: p0.baseSpeed,
        speedAfter: pCollected.baseSpeed,
        dispBefore,
        dispAfter,
      };
      """
  )
  assert abs((res["speedAfter"] - res["speedBefore"]) - 0.90) < 0.05, res
  assert res["dispAfter"] > res["dispBefore"] + 0.25, res


@_t1("1D_stat_and_ability_pickups")
def test_f16_kick_pickup_unlocks_can_kick_and_slides_solid_bubble(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1305,
        botBehavior: 'idle',
        customGrid: makeGrid({ walls: [[11, 6]] }), // Stop wall at col 11 -> bubble should slide to col 10!
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'kick', col: 4, row: 6 }],
      });
      api.setDeterministicMode(true);
      // Collect Kick at (4, 6) and move to (5, 6)
      moveHold('p1', 1, 0, 28);
      const canKick = getPlayer(api.getState(), 'p1').canKick;
      // Place bubble on current tile, step West 1.3 tiles to solidify it
      const sDrop = pulseDropBubble('p1');
      const startCol = sDrop.sim.bubbles[0].col;
      moveHold('p1', -1, 0, 20);
      // Now walk East into the solidified bubble to kick it!
      let sawSliding = false;
      api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      for (let i = 0; i < 45; i++) {
        const st = api.stepFrames(1);
        if (st.sim.bubbles[0]?.sliding) sawSliding = true;
      }
      clearInput('p1');
      const sEnd = api.stepFrames(20);
      const bEnd = sEnd.sim.bubbles[0];
      return { canKick, startCol, sawSliding, endCol: bEnd.col, endSliding: bEnd.sliding };
      """
  )
  assert res["canKick"] is True and res["sawSliding"] is True, res
  assert res["endCol"] == 10 and res["endSliding"] is False, res


@_t1("1D_stat_and_ability_pickups")
def test_f18_shield_pickup_equips_and_absorbs_one_blast_hit(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1306,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'shield', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      let st = moveHold('p1', 1, 0, 18); // Collect shield at (5, 6)
      const shieldEquipped = getPlayer(st, 'p1').hasShield;
      // Drop bubble on self and stand in blast!
      pulseDropBubble('p1');
      for (let i = 0; i < 190; i++) {
        st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) break;
      }
      const pAfter = getPlayer(st, 'p1');
      return {
        shieldEquipped,
        shieldAfterBlast: pAfter.hasShield,
        stateAfterBlast: pAfter.state,
        invulnAfter: pAfter.invulnTimer,
      };
      """
  )
  assert res["shieldEquipped"] is True, res
  assert res["shieldAfterBlast"] is False and res["stateAfterBlast"] == "alive", res
  assert res["invulnAfter"] >= 0.7, res


@_t1("1D_stat_and_ability_pickups")
def test_f13_to_f15_stat_pickups_increment_sfx_and_emit_pickup_event(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1307,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'bubble', col: 4, row: 6 }],
      });
      api.setDeterministicMode(true);
      const sfx0 = api.getState().audio?.sfxCount ?? 0;
      let sawPickupEvent = false;
      api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      for (let i = 0; i < 20; i++) {
        const st = api.stepFrames(1);
        if ((st.sim.events || []).some((e) => e.type === 'pickup')) sawPickupEvent = true;
      }
      clearInput('p1');
      const sfx1 = api.getState().audio?.sfxCount ?? 0;
      return { sawPickupEvent, sfx0, sfx1 };
      """
  )
  assert res["sawPickupEvent"] is True and res["sfx1"] > res["sfx0"], res


# ==============================================================================
# Group 1E: Rideable Mounts — Turtle (乌龟) & UFO (飞碟) (F19, F20) — 6 tests
# ==============================================================================


@_t1("1E_rideable_mounts")
def test_f19_turtle_mount_pickup_sets_mount_and_steady_speed(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // baseSpeed = 5.0
        seed: 1401,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'turtle', col: 4, row: 6 }],
      });
      api.setDeterministicMode(true);
      const st = moveHold('p1', 1, 0, 18);
      const p1 = getPlayer(st, 'p1');
      return { mount: p1.mount, effectiveSpeed: p1.effectiveSpeed, baseSpeed: p1.baseSpeed };
      """
  )
  assert res["mount"] == "turtle", res
  assert 3.4 <= res["effectiveSpeed"] <= 3.9 and res["effectiveSpeed"] < res["baseSpeed"], res


@_t1("1E_rideable_mounts")
def test_f19_turtle_mount_sacrifices_on_blast_keeping_rider_alive(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1402,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'turtle', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      let st = moveHold('p1', 1, 0, 18);
      const mountBefore = getPlayer(st, 'p1').mount;
      pulseDropBubble('p1');
      for (let i = 0; i < 195; i++) {
        st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) break;
      }
      const pHit = getPlayer(st, 'p1');
      return {
        mountBefore,
        mountAfter: pHit.mount,
        stateAfter: pHit.state,
        invulnAfter: pHit.invulnTimer,
      };
      """
  )
  assert res["mountBefore"] == "turtle", res
  assert res["mountAfter"] is None and res["stateAfter"] == "alive", res
  assert res["invulnAfter"] >= 0.85, res


@_t1("1E_rideable_mounts")
def test_f19_super_turtle_speed_boost_with_three_skates(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1403,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'speed', col: 3, row: 6 },
          { type: 'speed', col: 4, row: 6 },
          { type: 'speed', col: 5, row: 6 },
          { type: 'turtle', col: 6, row: 6 },
        ],
      });
      api.setDeterministicMode(true);
      const st = moveHold('p1', 1, 0, 56);
      const p1 = getPlayer(st, 'p1');
      return { mount: p1.mount, speedUps: p1.speedUps, effectiveSpeed: p1.effectiveSpeed };
      """
  )
  assert res["mount"] == "turtle" and res["speedUps"] >= 3, res
  assert res["effectiveSpeed"] >= 6.0, res


@_t1("1E_rideable_mounts")
def test_f20_ufo_mount_pickup_sets_mount_and_fast_hover_speed(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // baseSpeed = 5.0
        seed: 1404,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'ufo', col: 4, row: 6 }],
      });
      api.setDeterministicMode(true);
      const st = moveHold('p1', 1, 0, 18);
      const p1 = getPlayer(st, 'p1');
      return { mount: p1.mount, effectiveSpeed: p1.effectiveSpeed, baseSpeed: p1.baseSpeed };
      """
  )
  assert res["mount"] == "ufo" and res["effectiveSpeed"] >= 6.4, res


@_t1("1E_rideable_mounts")
def test_f20_ufo_mount_glides_over_soft_block_while_unmounted_blocked(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Narrow 1-tile corridor along row 6 flanked by HARD_WALL on rows 5 and 7, with SOFT_BLOCK at (6, 6).
      const walls = [];
      for (let c = 2; c <= 10; c++) {
        walls.push([c, 5], [c, 7]);
      }
      const g = makeGrid({ walls, softBlocks: [[6, 6]] });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1405,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'ufo', col: 3, row: 6 }],
      });
      api.setDeterministicMode(true);
      // 1. Unmounted p1 tries to walk East past SOFT_BLOCK at (6, 6): must be blocked at col <= 5!
      const sBlocked = moveHold('p1', 1, 0, 35);
      const colUnmounted = getPlayer(sBlocked, 'p1').col;

      // 2. Walk West to (3, 6) to mount UFO, then glide East right over SOFT_BLOCK (6, 6) to col >= 8!
      moveHold('p1', -1, 0, 35);
      const mounted = getPlayer(api.getState(), 'p1').mount;
      const sGlided = moveHold('p1', 1, 0, 55);
      const colMounted = getPlayer(sGlided, 'p1').col;
      return { colUnmounted, mounted, colMounted, softStillIntact: sGlided.sim.grid[6][6] === 2 };
      """
  )
  assert res["colUnmounted"] <= 5, res
  assert res["mounted"] == "ufo" and res["colMounted"] >= 8, res
  assert res["softStillIntact"] is True, res


@_t1("1E_rideable_mounts")
def test_f20_ufo_mount_sacrifices_on_blast_keeping_rider_alive(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1406,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'ufo', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      let st = moveHold('p1', 1, 0, 18);
      const mountBefore = getPlayer(st, 'p1').mount;
      pulseDropBubble('p1');
      for (let i = 0; i < 195; i++) {
        st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) break;
      }
      const pHit = getPlayer(st, 'p1');
      return {
        mountBefore,
        mountAfter: pHit.mount,
        stateAfter: pHit.state,
        invulnAfter: pHit.invulnTimer,
      };
      """
  )
  assert res["mountBefore"] == "ufo", res
  assert res["mountAfter"] is None and res["stateAfter"] == "alive", res
  assert res["invulnAfter"] >= 0.85, res


# ==============================================================================
# Group 1F: All 4 Playable Classic Chibi Characters (F21) — 5 tests
# ==============================================================================


@_t1("1F_playable_characters")
def test_f21_character_miduo_profile_and_load(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const st = api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1501,
        botBehavior: 'idle',
      });
      api.setDeterministicMode(true);
      api.stepFrames(2);
      return { p1: getPlayer(api.getState(), 'p1'), render: api.getState().render };
      """
  )
  p1 = res["p1"]
  assert p1["characterId"] == "miduo" and "米多" in p1["nameZh"], p1
  assert p1["maxBubbles"] == 1 and p1["blastRange"] == 2 and abs(p1["baseSpeed"] - 5.0) < 0.25, p1
  assert res["render"]["webgl2"] is True and res["render"]["triangles"] > 200, res


@_t1("1F_playable_characters")
def test_f21_character_xiaoqiang_profile_and_multi_bubble_start(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        seed: 1502,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      moveHold('p1', 1, 0, 18);
      const st = pulseDropBubble('p1');
      const p1 = getPlayer(st, 'p1');
      return { p1, bubblesOnFloor: st.sim.bubbles.length };
      """
  )
  p1 = res["p1"]
  assert p1["characterId"] == "xiaoqiang" and "小强" in p1["nameZh"], p1
  assert p1["maxBubbles"] == 2 and res["bubblesOnFloor"] == 2, res


@_t1("1F_playable_characters")
def test_f21_character_haiwangzi_profile_and_range_start(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const st = api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'pirate_bay',
        p1CharacterId: 'haiwangzi',
        seed: 1503,
        botBehavior: 'idle',
      });
      api.setDeterministicMode(true);
      return getPlayer(st, 'p1');
      """
  )
  assert res["characterId"] == "haiwangzi" and "海王子" in res["nameZh"], res
  assert res["blastRange"] == 2 and res["baseSpeed"] >= 5.1, res


@_t1("1F_playable_characters")
def test_f21_character_wanzi_profile_and_fastest_sprint_start(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const speeds = {};
      for (const cid of ['miduo', 'xiaoqiang', 'haiwangzi', 'wanzi']) {
        const st = api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: cid,
          seed: 1504,
          botBehavior: 'idle',
        });
        speeds[cid] = {
          speed: getPlayer(st, 'p1').baseSpeed,
          nameZh: getPlayer(st, 'p1').nameZh,
        };
      }
      return speeds;
      """
  )
  assert "丸子" in res["wanzi"]["nameZh"], res
  assert res["wanzi"]["speed"] > res["haiwangzi"]["speed"] > res["xiaoqiang"]["speed"], res


@_t1("1F_playable_characters")
def test_f21_all_four_characters_distinct_stats_and_3d_silhouettes(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const st = api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1505,
        botBehavior: 'idle',
      });
      api.setDeterministicMode(true);
      api.stepFrames(3);
      const ids = st.sim.players.map((p) => p.characterId).sort();
      return { ids, render: api.getState().render };
      """
  )
  assert res["ids"] == ["haiwangzi", "miduo", "wanzi", "xiaoqiang"], res
  assert res["render"]["triangles"] > 400 and res["render"]["drawCalls"] > 0, res


# ==============================================================================
# Group 1G: All 4 Iconic Themed 3D Arenas (F22) — 5 tests
# ==============================================================================


def _verify_arena_load(h: QQTangTestHarness, arena_id: str, seed: int) -> dict:
  _ensure_loaded(h)
  res = h.run_sim_js(
      f"""
      const st = api.startMatch({{
        modeId: 'classic_2v2',
        arenaId: {arena_id!r},
        p1CharacterId: 'miduo',
        seed: {seed},
        botBehavior: 'idle',
      }});
      api.setDeterministicMode(true);
      const st2 = api.stepFrames(5);
      let hardCount = 0;
      let softCount = 0;
      for (const row of st2.sim.grid) {{
        for (const cell of row) {{
          if (cell === 1) hardCount += 1;
          if (cell === 2) softCount += 1;
        }}
      }}
      return {{
        arenaId: st2.sim.arenaId,
        hardCount,
        softCount,
        track: st2.audio?.currentTrack,
        render: st2.render,
      }};
      """
  )
  assert res["arenaId"] == arena_id, res
  assert res["hardCount"] >= 8 and res["softCount"] >= 20, res
  assert res["render"]["webgl2"] is True and res["render"]["triangles"] > 400, res
  return res


@_t1("1G_themed_arenas")
def test_f22_arena_candy_town_grid_and_3d_stage(h: QQTangTestHarness) -> None:
  res = _verify_arena_load(h, "candy_town", 1601)
  assert res["track"] == "candy_town", res


@_t1("1G_themed_arenas")
def test_f22_arena_pirate_bay_grid_and_3d_stage(h: QQTangTestHarness) -> None:
  res = _verify_arena_load(h, "pirate_bay", 1602)
  assert res["track"] == "pirate_bay", res


@_t1("1G_themed_arenas")
def test_f22_arena_ice_village_grid_and_3d_stage(h: QQTangTestHarness) -> None:
  res = _verify_arena_load(h, "ice_village", 1603)
  assert res["track"] == "ice_village", res


@_t1("1G_themed_arenas")
def test_f22_arena_toy_kingdom_grid_and_3d_stage(h: QQTangTestHarness) -> None:
  res = _verify_arena_load(h, "toy_kingdom", 1604)
  assert res["track"] == "toy_kingdom", res


@_t1("1G_themed_arenas")
def test_f22_all_four_arenas_pairwise_distinct_blueprints_and_palettes(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  wall_signatures: set[str] = set()
  means: list[float] = []
  for arena_id in ("candy_town", "pirate_bay", "ice_village", "toy_kingdom"):
    sig = h.run_sim_js(
        f"""
        const st = api.startMatch({{
          modeId: 'classic_2v2',
          arenaId: {arena_id!r},
          p1CharacterId: 'miduo',
          seed: 1605,
          botBehavior: 'idle',
        }});
        api.setDeterministicMode(true);
        api.stepFrames(3);
        return st.sim.grid.map((row) => row.map((v) => (v === 1 ? 'W' : '.')).join('')).join('|');
        """
    )
    wall_signatures.add(sig)
    shot = h.capture_screenshot()
    stats = h.inspect_image(shot)
    assert stats["std_dev"] > 0.03, (arena_id, stats)
    means.append(float(stats["mean"]))
  assert len(wall_signatures) == 4, "Expected all 4 arenas to have distinct HARD_WALL topologies"
  assert max(means) - min(means) > 0.015, f"Expected distinct visual lighting/palettes, got means={means}"


# ==============================================================================
# Group 1H: All 3 Game Modes & Smart Bot AI (F23–F26) — 7 tests
# ==============================================================================


@_t1("1H_modes_and_ai")
def test_f23_mode_classic_2v2_teams_and_elimination_victory(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // range 2
        seed: 1701,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 6, row: 6, team: 1 },
          { id: 'bot3', col: 7, row: 6, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      // Drop bubble at (5, 6) -> traps BOTH bot2 (6, 6) and bot3 (7, 6)!
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 18);
      moveHold('p1', 0, 1, 18);
      let st = api.stepFrames(175);
      // Walk back to row 6 and East across (6, 6) and (7, 6) to pop both Red rivals!
      moveHold('p1', 0, -1, 18);
      st = moveHold('p1', 1, 0, 48);
      st = api.stepFrames(10);
      return {
        phase: st.sim.phase,
        winningTeam: st.sim.winningTeam,
        rankings: st.sim.rankings,
        uiScreen: st.uiScreen,
      };
      """
  )
  assert res["phase"] == "victory" and res["winningTeam"] == 0, res
  assert len(res["rankings"]) == 4 and res["rankings"][0]["rank"] == 1, res


@_t1("1H_modes_and_ai")
def test_f24_mode_bun_grab_bases_shrine_and_bun_pickup(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const st0 = api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1702,
        botBehavior: 'idle',
      });
      api.setDeterministicMode(true);
      let hasBlueBase = false, hasRedBase = false, hasShrine = false;
      for (const row of st0.sim.grid) {
        for (const t of row) {
          if (t === 4) hasBlueBase = true;
          if (t === 5) hasRedBase = true;
          if (t === 3) hasShrine = true;
        }
      }
      const initialBuns = st0.sim.looseBuns.length;

      // Test controlled pickup on open corridor
      const g = makeGrid({ tiles: [[1, 6, 4], [7, 6, 3], [13, 6, 5]] });
      const stOpen = api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1702,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const bun = stOpen.sim.looseBuns[0];
      const stPicked = steerToWorld('p1', 'p1', bun.x, bun.z, 120, 0.2);
      const p1 = getPlayer(stPicked, 'p1');
      return {
        hasBlueBase,
        hasRedBase,
        hasShrine,
        initialBuns,
        carryingBun: p1.carryingBun,
        carriedBuns: p1.carriedBuns,
        ratio: p1.effectiveSpeed / p1.baseSpeed,
      };
      """
  )
  assert res["hasBlueBase"] and res["hasRedBase"] and res["hasShrine"], res
  assert res["initialBuns"] >= 1, res
  assert res["carryingBun"] is True and res["carriedBuns"] >= 1, res
  assert 0.72 <= res["ratio"] <= 0.78, res


@_t1("1H_modes_and_ai")
def test_f24_mode_bun_grab_home_base_delivery_scores_point_and_3_wins(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const g = makeGrid({
        tiles: [
          [2, 6, 4], // Blue base right next to center shrine!
          [5, 6, 3], [6, 6, 3], [7, 6, 3],
          [13, 6, 5],
        ],
      });
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'wanzi', // fastest sprinter
        seed: 1703,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      let st = api.getState();
      for (let trip = 0; trip < 5; trip++) {
        // Wait if shrine bun is respawning (up to 3.0s = 180 ticks)
        for (let w = 0; w < 220 && st.sim.looseBuns.length === 0 && st.sim.phase === 'playing'; w++) {
          st = api.stepFrames(1);
        }
        if (st.sim.phase !== 'playing') break;
        const bun = st.sim.looseBuns[0];
        st = steerToWorld('p1', 'p1', bun.x, bun.z, 180, 0.2);
        st = steerToWorld('p1', 'p1', 2.5, 6.5, 180, 0.2);
        st = api.stepFrames(3);
      }
      return {
        blueScore: st.sim.teamScores.blue,
        bunsBanked: getPlayer(st, 'p1').stats.bunsBanked,
        phase: st.sim.phase,
        winningTeam: st.sim.winningTeam,
      };
      """
  )
  assert res["blueScore"] >= 5 and res["bunsBanked"] >= 5, res
  assert res["phase"] == "victory" and res["winningTeam"] == 0, res


@_t1("1H_modes_and_ai")
def test_f25_mode_boss_golem_spawns_2x2_boss_with_hp_bar(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const st = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1704,
        botBehavior: 'idle',
      });
      api.setDeterministicMode(true);
      return {
        boss: st.sim.boss,
        teams: st.sim.players.map((p) => p.team),
        teamLives: st.sim.teamLives,
      };
      """
  )
  boss = res["boss"]
  assert boss is not None and boss["id"] == "mechanical_golem", res
  assert boss["widthTiles"] >= 2 and boss["heightTiles"] >= 2, boss
  assert boss["hp"] == boss["maxHp"] and boss["maxHp"] >= 10, boss
  assert res["teams"] == [0, 0, 0, 0] and res["teamLives"] >= 1, res


@_t1("1H_modes_and_ai")
def test_f25_mode_boss_golem_takes_blast_damage_and_telegraphs_attacks(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      let st = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'haiwangzi',
        seed: 1705,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 13, row: 11, team: 0 },
        ],
        customPickups: [{ type: 'power', col: 4, row: 6 }],
      });
      api.setDeterministicMode(true);
      const hp0 = st.sim.boss.hp;
      // Collect extra power so range = 3
      moveHold('p1', 0, 1, 18);
      let sawTelegraph = false;
      let telegraphTileCount = 0;

      // Track boss position, walk within 2 tiles of boss on same row, drop bubble, dodge!
      const bNow = api.getState().sim.boss;
      const targetCol = Math.max(1, Math.floor(bNow.col) - 1);
      const targetRow = Math.min(11, Math.floor(bNow.row));
      steerToWorld('p1', 'p1', targetCol + 0.5, targetRow + 0.5, 160, 0.25);
      pulseDropBubble('p1');
      // Dodge away West & South
      moveHold('p1', -1, 0, 24);
      moveHold('p1', 0, 1, 24);

      for (let i = 0; i < 240; i++) {
        st = api.stepFrames(1);
        if (st.sim.boss.state === 'telegraph' && st.sim.boss.telegraphTiles.length > 0) {
          sawTelegraph = true;
          telegraphTileCount = Math.max(telegraphTileCount, st.sim.boss.telegraphTiles.length);
        }
      }
      const damagedHp = st.sim.boss.hp;
      // Now verify active BossAI floor telegraph (when botBehavior === 'active')!
      if (!sawTelegraph || damagedHp === hp0) {
        st = api.startMatch({
          modeId: 'boss_golem',
          arenaId: 'candy_town',
          p1CharacterId: 'haiwangzi',
          seed: 1705,
          botBehavior: 'active',
        });
        api.setDeterministicMode(true);
        api.setAutoPlayP1(true);
        let minActiveHp = damagedHp;
        for (let i = 0; i < 540; i++) {
          st = api.stepFrames(1);
          minActiveHp = Math.min(minActiveHp, st.sim.boss.hp);
          if (st.sim.boss.state === 'telegraph' && st.sim.boss.telegraphTiles.length > 0) {
            sawTelegraph = true;
            telegraphTileCount = Math.max(telegraphTileCount, st.sim.boss.telegraphTiles.length);
          }
          if (minActiveHp < hp0 && sawTelegraph) break;
        }
        api.setAutoPlayP1(false);
        return { hp0, hpAfter: minActiveHp, sawTelegraph, telegraphTileCount };
      }
      return { hp0, hpAfter: damagedHp, sawTelegraph, telegraphTileCount };
      """
  )
  assert res["hpAfter"] < res["hp0"], res
  assert res["sawTelegraph"] is True and res["telegraphTileCount"] >= 2, res


@_t1("1H_modes_and_ai")
def test_f26_smart_bot_ai_moves_bombs_and_evades_own_blast(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1706,
        botBehavior: 'active',
      });
      api.setDeterministicMode(true);
      api.setAutoPlayP1(false);
      // Step 360 frames (6.0s): enough for bots to place bubbles AND for 3.0s fuses to detonate!
      const st = api.stepFrames(360);
      const bots = st.sim.players.filter((p) => p.id !== 'p1');
      return {
        totalBotDist: bots.reduce((acc, b) => acc + b.stats.distanceMoved, 0),
        totalBotBubbles: bots.reduce((acc, b) => acc + b.stats.bubblesPlaced, 0),
        aliveBots: bots.filter((b) => b.state === 'alive').length,
      };
      """
  )
  assert res["totalBotDist"] > 6.0 and res["totalBotBubbles"] >= 2, res
  assert res["aliveBots"] >= 2, res


@_t1("1H_modes_and_ai")
def test_f26_desktop_keyboard_wasd_and_space_drive_p1_in_live_match(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1707,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      return true;
      """
  )
  x0 = h.run_sim_js("return getPlayer(api.getState(), 'p1').x;")
  h.key_down("KeyD")
  h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(20)")
  h.key_up("KeyD")
  h.tap_key("Space", hold_frames=2)
  after = h.run_sim_js(
      """
      const st = api.getState();
      return { x: getPlayer(st, 'p1').x, bubbles: st.sim.bubbles.length };
      """
  )
  assert after["x"] - x0 > 1.0 and after["bubbles"] == 1, after


# ==============================================================================
# Group 1I: UX Screens, Audio Diagnostics & WebGL2 Fidelity (F27, F28) — 6 tests
# ==============================================================================


@_t1("1I_ux_audio_webgl2")
def test_f27_ui_navigation_title_to_select_to_playing_to_pause_and_resume(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  assert h.get_state()["uiScreen"] == "title"
  h.click_testid("btn-play")
  assert h.get_state()["uiScreen"] == "select"
  h.click_testid("btn-start-match")
  assert h.get_state()["uiScreen"] == "playing"
  h.click_testid("hud-btn-home")
  assert h.get_state()["uiScreen"] == "paused"
  h.click_testid("btn-resume")
  assert h.get_state()["uiScreen"] == "playing"


@_t1("1I_ux_audio_webgl2")
def test_f27_virtual_joystick_pointer_drag_steers_p1(h: QQTangTestHarness) -> None:
  h.set_viewport(1024, 768, mobile=True, touch=True)
  h.navigate(wait_qqtang=True)
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1802,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      return true;
      """
  )
  x0 = h.run_sim_js("return getPlayer(api.getState(), 'p1').x;")
  st = h.drag_testid("hud-joystick", dx=46.0, dy=0.0, hold_frames=22, steps=5)
  p1 = next(p for p in st["sim"]["players"] if p["id"] == "p1")
  assert p1["x"] - x0 > 0.8, (x0, p1)
  h.set_viewport(1280, 800, mobile=False, touch=False)


@_t1("1I_ux_audio_webgl2")
def test_f28_webaudio_gesture_unlock_and_mute_toggle(h: QQTangTestHarness) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.click_testid("btn-play")
  h.click_testid("btn-start-match")
  st0 = h.get_state()
  assert st0["audio"]["unlocked"] is True, st0["audio"]
  initial_muted = bool(st0["audio"]["muted"])
  h.click_testid("hud-btn-audio")
  st1 = h.get_state()
  assert bool(st1["audio"]["muted"]) is (not initial_muted), st1["audio"]
  h.click_testid("hud-btn-audio")
  st2 = h.get_state()
  assert bool(st2["audio"]["muted"]) is initial_muted, st2["audio"]


@_t1("1I_ux_audio_webgl2")
def test_f28_audio_tracks_switch_across_menu_arena_boss_and_podium(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.click_testid("btn-play")
  menu_track = h.get_state()["audio"]["currentTrack"]
  res = h.run_sim_js(
      """
      const sArena = api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'ice_village',
        p1CharacterId: 'miduo',
        seed: 1804,
        botBehavior: 'idle',
      });
      const sBoss = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1804,
        botBehavior: 'idle',
      });
      // Win classic_2v2 to inspect podium track
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1804,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 6, row: 6, team: 1 },
          { id: 'bot3', col: 7, row: 6, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 18);
      moveHold('p1', 0, 1, 18);
      api.stepFrames(175);
      moveHold('p1', 0, -1, 18);
      moveHold('p1', 1, 0, 48);
      const sPodium = api.stepFrames(15);
      return {
        arenaTrack: sArena.audio?.currentTrack,
        bossTrack: sBoss.audio?.currentTrack,
        podiumTrack: sPodium.audio?.currentTrack,
      };
      """
  )
  assert menu_track == "menu", menu_track
  assert res["arenaTrack"] == "ice_village", res
  assert res["bossTrack"] == "boss_golem", res
  assert res["podiumTrack"] == "podium", res


@_t1("1I_ux_audio_webgl2")
def test_f28_webgl2_canvas_diagnostics_and_non_blank_screenshot(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.set_viewport(1280, 800, mobile=False, touch=False)
  diag = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 1805,
        botBehavior: 'active',
      });
      api.setDeterministicMode(true);
      return api.stepFrames(15).render;
      """
  )
  assert diag["webgl2"] is True, diag
  assert diag["triangles"] > 500 and diag["drawCalls"] > 0, diag
  shot = h.capture_screenshot()
  img = h.inspect_image(shot)
  assert img["width"] == 1280 and img["height"] == 800, img
  assert img["std_dev"] > 0.035 and 0.05 < img["mean"] < 0.96, img


@_t1("1I_ux_audio_webgl2")
def test_ac1_zero_js_promise_resource_and_http_errors_after_smoke(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.assert_zero_errors("tier1-final")
