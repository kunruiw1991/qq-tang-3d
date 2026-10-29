#!/usr/bin/env python3
"""Tier 5 White-Box Adversarial & Regression E2E Tests (28 tests).

Covers Milestone M4 Phase 1 Challenger regressions and Milestone M4 Phase 2
white-box adversarial edge paths across:
  - 5A: Boss Footprint Pushback, Static Wall Authority & Respawn Walk-Off Grace
  - 5B: Sliding Bubble Collisions, Cyclic Chains, Simultaneous Multi-Blasts & Mount Swaps
  - 5C: Mode Tie-Breakers, Exact-Tick Base Traps, Multi-Bun Drops & Boss Defeat Races
  - 5D: W3C PointerEvent, Multi-Thumb Isolation, Pause/Blur Input Reset & WebAudio/Render Determinism
"""

from __future__ import annotations

import time
from typing import Callable

from harness import QQTangTestHarness, TestCaseSpec


TIER5_TESTS: list[TestCaseSpec] = []


def _t5(
    group: str,
) -> Callable[[Callable[[QQTangTestHarness], None]], Callable[[QQTangTestHarness], None]]:
  def decorator(
      fn: Callable[[QQTangTestHarness], None],
  ) -> Callable[[QQTangTestHarness], None]:
    TIER5_TESTS.append(TestCaseSpec(tier=5, name=fn.__name__, group=group, fn=fn))
    return fn

  return decorator


def _ensure_loaded(h: QQTangTestHarness) -> None:
  has_api = h.eval_js("Boolean(window.__QQTANG__ || window.__QQ_TANG__)")
  if not has_api:
    h.set_viewport(1280, 800, mobile=False, touch=False)
    h.navigate(wait_qqtang=True)


# ==============================================================================
# Group 5A: Boss Pushback, Static Wall Final Authority & Respawn Grace (5 tests)
# ==============================================================================


@_t5("5A_boss_pushback_and_collision_authority")
def test_t5_01_boss_pushback_ice_village_seed_27097_zero_hard_wall_penetration(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'boss_golem',
        arenaId: 'ice_village',
        p1CharacterId: 'wanzi',
        p2Enabled: false,
        autoPlayP1: false,
        seed: 27097,
        botBehavior: 'active',
      });
      let maxHardPen = 0;
      let maxSoftPen = 0;
      for (let t = 1; t <= 200; t += 1) {
        const st = api.stepFrames(1);
        for (const p of st.sim.players) {
          if (p.state === 'eliminated') continue;
          for (let r = 0; r < 13; r += 1) {
            for (let c = 0; c < 15; c += 1) {
              const tile = st.sim.grid[r][c];
              if (tile !== 1 && !(tile === 2 && p.mount !== 'ufo')) continue;
              const cx = Math.max(c, Math.min(p.x, c + 1));
              const cz = Math.max(r, Math.min(p.z, r + 1));
              const pen = Math.max(0, 0.36 - Math.hypot(p.x - cx, p.z - cz));
              if (tile === 1 && pen > maxHardPen) maxHardPen = pen;
              if (tile === 2 && pen > maxSoftPen) maxSoftPen = pen;
            }
          }
        }
      }
      return {
        maxHardPen: +maxHardPen.toFixed(5),
        maxSoftPen: +maxSoftPen.toFixed(5),
      };
      """
  )
  assert res["maxHardPen"] <= 0.001, f"Boss pushback penetrated HARD_WALL: {res}"
  assert res["maxSoftPen"] <= 0.001, f"Boss pushback penetrated SOFT_BLOCK: {res}"


@_t5("5A_boss_pushback_and_collision_authority")
def test_t5_02_boss_pushback_toy_kingdom_seed_134989_zero_soft_block_penetration(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'boss_golem',
        arenaId: 'toy_kingdom',
        p1CharacterId: 'miduo',
        p2Enabled: false,
        autoPlayP1: false,
        seed: 134989,
        botBehavior: 'active',
      });
      let maxHardPen = 0;
      let maxSoftPen = 0;
      for (let t = 1; t <= 460; t += 1) {
        const st = api.stepFrames(1);
        for (const p of st.sim.players) {
          if (p.state === 'eliminated') continue;
          for (let r = 0; r < 13; r += 1) {
            for (let c = 0; c < 15; c += 1) {
              const tile = st.sim.grid[r][c];
              if (tile !== 1 && !(tile === 2 && p.mount !== 'ufo')) continue;
              const cx = Math.max(c, Math.min(p.x, c + 1));
              const cz = Math.max(r, Math.min(p.z, r + 1));
              const pen = Math.max(0, 0.36 - Math.hypot(p.x - cx, p.z - cz));
              if (tile === 1 && pen > maxHardPen) maxHardPen = pen;
              if (tile === 2 && pen > maxSoftPen) maxSoftPen = pen;
            }
          }
        }
      }
      return {
        maxHardPen: +maxHardPen.toFixed(5),
        maxSoftPen: +maxSoftPen.toFixed(5),
      };
      """
  )
  assert res["maxHardPen"] <= 0.001, res
  assert res["maxSoftPen"] <= 0.001, res


@_t5("5A_boss_pushback_and_collision_authority")
def test_t5_03_boss_pushing_idle_or_trapped_player_into_wall_slides_around_cleanly(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place HARD_WALL at (7, 9) directly below Boss's southward path and idle p1 at (7, 8)
      const g = makeGrid({ walls: [[7, 9]] });
      api.startMatch({
        deterministic: true,
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5003,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 7, row: 8, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 1, row: 11, team: 0 },
        ],
      });
      let maxWallPen = 0;
      for (let t = 0; t < 240; t += 1) {
        const st = api.stepFrames(1);
        const p1 = getPlayer(st, 'p1');
        if (p1 && p1.state !== 'eliminated') {
          const cx = Math.max(7, Math.min(p1.x, 8));
          const cz = Math.max(9, Math.min(p1.z, 10));
          const pen = Math.max(0, 0.36 - Math.hypot(p1.x - cx, p1.z - cz));
          if (pen > maxWallPen) maxWallPen = pen;
        }
      }
      return { maxWallPen: +maxWallPen.toFixed(5) };
      """
  )
  assert res["maxWallPen"] <= 0.001, res


@_t5("5A_boss_pushback_and_collision_authority")
def test_t5_04_respawn_on_occupied_bubble_pad_grants_walk_off_grace_no_snap(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5004,
        botBehavior: 'idle',
        customGrid: makeGrid({
          tiles: [
            [1, 6, 4],
            [13, 6, 5],
            [7, 6, 3],
          ],
        }),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'p2', col: 3, row: 10, team: 0 },
          { id: 'bot2', col: 6, row: 6, team: 1 },
          { id: 'bot3', col: 12, row: 6, team: 1 },
        ],
      });
      // 1. Trap p1 at (3, 6) and wait for blast linger to end (208 frames) while p2 (row 10) & bot2 (col 6) stay safe
      pulseDropBubble('p1');
      let st = api.stepFrames(208);

      // 2. Steer enemy bot2 West into trapped p1 at (3.5, 6.5) until p1 is popped (respawnTimer = 3.5s = 210 ticks)
      while (getPlayer(st, 'p1').state !== 'eliminated') {
        api.setPlayerInput('bot2', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
        st = api.stepFrames(1);
      }
      // Move bot2 East out of the way
      moveHold('bot2', 1, 0, 35);
      const p1Elim = getPlayer(api.getState(), 'p1');

      // 3. Steer p2 North onto p1's spawn pad (3.5, 6.5), wait until respawnTimer ~ 1.0s, drop bubble (3.0s fuse), walk South
      steerToWorld('p2', 'p2', 3.5, 6.5, 75, 0.06);
      while (getPlayer(api.getState(), 'p1').respawnTimer > 1.0) {
        api.stepFrames(1);
      }
      pulseDropBubble('p2');
      moveHold('p2', 0, 1, 25); // p2 steps South off (3, 6) while p1 still has ~0.58s left on respawnTimer

      // 4. Advance tick-by-tick until p1 respawns on (3, 6) while p2's bubble is still ticking there!
      let respawnState = null;
      for (let i = 0; i < 120; i += 1) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'p1').state === 'alive') {
          respawnState = st;
          break;
        }
      }
      const bOnSpawn = respawnState.sim.bubbles.find((b) => b.col === 3 && b.row === 6);
      const passOnRespawn = bOnSpawn ? bOnSpawn.passThroughIds.slice() : [];
      const x0 = getPlayer(respawnState, 'p1').x;

      // Step 1 frame East: must move smoothly (<= 0.15 tiles), NOT snap 0.86 tiles!
      api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      const sNext = api.stepFrames(1);
      const x1 = getPlayer(sNext, 'p1').x;

      // Finish walking East off (3, 6), then verify solidified bubble blocks re-entry!
      moveHold('p1', 1, 0, 24);
      const sAfterExit = api.getState();
      const passAfterExit = sAfterExit.sim.bubbles[0].passThroughIds.slice();
      moveHold('p1', -1, 0, 24);
      const xBlocked = getPlayer(api.getState(), 'p1').x;

      return {
        wasEliminated: p1Elim.state === 'eliminated',
        passOnRespawn,
        singleTickStep: +(x1 - x0).toFixed(4),
        passAfterExit,
        xBlocked,
      };
      """
  )
  assert res["wasEliminated"] is True, res
  assert "p1" in res["passOnRespawn"], f"Expected p1 in passThroughIds on respawn: {res}"
  assert 0.01 < res["singleTickStep"] <= 0.15, f"Unexpected 1-tick respawn snap: {res}"
  assert res["passAfterExit"] == [], res
  assert res["xBlocked"] >= 4.25, res


@_t5("5A_boss_pushback_and_collision_authority")
def test_t5_05_bubble_squeeze_against_hard_wall_preserves_static_wall_authority(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place HARD_WALL at (4, 6); p2 places a bubble at (5, 6) while p1 stands near (4.86, 6.5)
      const g = makeGrid({ walls: [[4, 6]] });
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5005,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'p2', col: 6, row: 6, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      // Walk p1 West against HARD_WALL (4, 6) -> x clamps at 5.36, then North slightly to exit (5,6)?
      // Actually place bubble at (6, 6) with p2, walk p2 off, then squeeze p1 between wall (4, 6) and bubble (6, 6)
      pulseDropBubble('p2');
      moveHold('p2', 1, 0, 22);
      let maxWallPen = 0;
      for (let i = 0; i < 40; i += 1) {
        api.setPlayerInput('p1', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
        const st = api.stepFrames(1);
        const p1 = getPlayer(st, 'p1');
        const cx = Math.max(4, Math.min(p1.x, 5));
        const cz = Math.max(6, Math.min(p1.z, 7));
        const pen = Math.max(0, 0.36 - Math.hypot(p1.x - cx, p1.z - cz));
        if (pen > maxWallPen) maxWallPen = pen;
      }
      clearInput('p1');
      return { maxWallPen: +maxWallPen.toFixed(5), finalX: getPlayer(api.getState(), 'p1').x };
      """
  )
  assert res["maxWallPen"] <= 0.001, res
  assert res["finalX"] >= 5.359, res


# ==============================================================================
# Group 5B: Sliding Bubbles, Cyclic Chains, Multi-Blasts & Mount Swaps (6 tests)
# ==============================================================================


@_t5("5B_sliding_bubbles_chains_and_mounts")
def test_t5_06_two_kicked_sliding_bubbles_head_on_halt_cleanly_on_distinct_tiles(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5006,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'p2', col: 11, row: 6, team: 0 },
          { id: 'bot2', col: 1, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { canKick: true },
          p2: { canKick: true },
        },
      });
      // p1 drops at (3, 6), steps West to (2, 6); p2 drops at (11, 6), steps East to (12, 6)
      pulseDropBubble('p1');
      pulseDropBubble('p2');
      api.setPlayerInput('p1', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
      api.setPlayerInput('p2', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      api.stepFrames(20);

      // Now p1 kicks East (+1) and p2 kicks West (-1) simultaneously!
      api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      api.setPlayerInput('p2', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
      api.stepFrames(16);
      clearInput('p1');
      clearInput('p2');
      const st = api.stepFrames(35);
      const b0 = st.sim.bubbles[0];
      const b1 = st.sim.bubbles[1];
      return {
        bubbleCount: st.sim.bubbles.length,
        b0: { col: b0.col, row: b0.row, x: b0.x, sliding: b0.sliding },
        b1: { col: b1.col, row: b1.row, x: b1.x, sliding: b1.sliding },
      };
      """
  )
  assert res["bubbleCount"] == 2, res
  assert res["b0"]["sliding"] is False and res["b1"]["sliding"] is False, res
  assert (res["b0"]["col"], res["b0"]["row"]) != (res["b1"]["col"], res["b1"]["row"]), res
  assert abs(res["b0"]["col"] - res["b1"]["col"]) == 1, res


@_t5("5B_sliding_bubbles_chains_and_mounts")
def test_t5_07_sliding_kicked_bubble_intercepted_mid_flight_by_active_blast_detonates_immediately(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5007,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 3, team: 0 },
          { id: 'p2', col: 3, row: 6, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { blastRange: 5 },
          p2: { canKick: true, blastRange: 3 },
        },
      });
      // p1 drops early bomb at (7, 3) whose South ray covers (7, 4..8) at t=3.0s (180 frames)
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 25);

      // Advance to frame 150, then p2 drops at (3, 6), steps West, and kicks East across col 7 right as p1's blast lingers!
      api.stepFrames(124);
      pulseDropBubble('p2');
      moveHold('p2', -1, 0, 18); // tick ~ 168
      moveHold('p2', 1, 0, 14);  // kick initiated around tick 178..182 while p1's blast lingers [180..204]!

      let sawChain = false;
      for (let i = 0; i < 35; i += 1) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length >= 2 || st.sim.bubbles.length === 0) {
          if (st.sim.bubbles.length === 0) {
            sawChain = true;
            break;
          }
        }
      }
      const endSt = api.getState();
      return {
        sawChain,
        remainingBubbles: endSt.sim.bubbles.length,
        p1ActiveBubbles: getPlayer(endSt, 'p1').activeBubbles,
        p2ActiveBubbles: getPlayer(endSt, 'p2').activeBubbles,
        tick: endSt.sim.tick,
      };
      """
  )
  # P2's bubble was dropped around tick 150 (normal fuse would expire at tick 330); chain detonates it by tick ~210!
  assert res["sawChain"] is True and res["tick"] < 230, res
  assert res["remainingBubbles"] == 0, res
  assert res["p1ActiveBubbles"] == 0 and res["p2ActiveBubbles"] == 0, res


@_t5("5B_sliding_bubbles_chains_and_mounts")
def test_t5_08_sliding_kicked_bubble_halts_outside_boss_2x2_footprint(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5008,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 1, row: 11, team: 0 },
        ],
        startingLoadout: { p1: { canKick: true } },
      });
      // Kick bubble East along row 5 toward the 2x2 Boss near center cols 6..7
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 18);
      moveHold('p1', 1, 0, 14);
      const st = api.stepFrames(28);
      const b = st.sim.bubbles[0];
      const boss = st.sim.boss;
      const dx = Math.abs(b.x - boss.x);
      const dz = Math.abs(b.z - boss.z);
      const insideBoss = dx < boss.widthTiles * 0.5 - 0.05 && dz < boss.heightTiles * 0.5 - 0.05;
      return {
        bubble: b,
        bossX: boss.x,
        bossZ: boss.z,
        insideBoss,
      };
      """
  )
  assert res["bubble"]["sliding"] is False, res
  assert res["insideBoss"] is False, f"Sliding bubble entered Boss 2x2 footprint: {res}"


@_t5("5B_sliding_bubbles_chains_and_mounts")
def test_t5_09_ufo_to_turtle_swap_while_hovering_soft_block_shatters_tile_cleanly(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place SOFT_BLOCK at (5, 6) and a Turtle pickup adjacent at (5.45, 6.5) / (6, 6) within collect reach
      const g = makeGrid({ softBlocks: [[5, 6]] });
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5009,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'turtle', col: 6, row: 6 },
        ],
        startingLoadout: { p1: { mount: 'ufo' } },
      });
      // Hover East on UFO across SOFT_BLOCK (5, 6) until p1 overlaps (5, 6) AND collects Turtle at (6, 6)
      let swapState = null;
      for (let i = 0; i < 40; i += 1) {
        api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
        const st = api.stepFrames(1);
        if (getPlayer(st, 'p1').mount === 'turtle') {
          swapState = st;
          break;
        }
      }
      // Now walk West across (5, 6) on Turtle to prove p1 is completely unwedged!
      const afterWalk = moveHold('p1', -1, 0, 45);
      return {
        swappedToTurtle: Boolean(swapState && getPlayer(swapState, 'p1').mount === 'turtle'),
        tile56AfterSwap: swapState ? swapState.sim.grid[6][5] : -1,
        finalX: getPlayer(afterWalk, 'p1').x,
      };
      """
  )
  assert res["swappedToTurtle"] is True, res
  assert res["tile56AfterSwap"] == 0, f"Overlapped SOFT_BLOCK (5,6) must shatter on UFO->Turtle swap: {res}"
  assert res["finalX"] < 4.8, res


@_t5("5B_sliding_bubbles_chains_and_mounts")
def test_t5_10_four_simultaneous_blasts_consume_shield_then_mount_then_trap_across_three_waves(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Surround p1 at (7, 6) with 4 allies/bots at (5,6), (9,6), (7,4), (7,8) firing 4 simultaneous blasts per wave
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5010,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },
          { id: 'p2', col: 5, row: 6, team: 0 },
          { id: 'bot2', col: 9, row: 6, team: 1 },
          { id: 'bot3', col: 7, row: 4, team: 1 },
        ],
        startingLoadout: {
          p1: { hasShield: true, mount: 'ufo', blastRange: 3 },
          p2: { blastRange: 3 },
          bot2: { blastRange: 3 },
          bot3: { blastRange: 3 },
        },
      });

      function fireSimultaneousWave() {
        // Drop 4 simultaneous bubbles (p1 at (7,6), p2 at (5,6), bot2 at (9,6), bot3 at (7,4)) on the exact same tick!
        api.setPlayerInput('p1', { moveX: 0, moveZ: 0, dropBubble: true, useItem: false });
        api.setPlayerInput('p2', { moveX: 0, moveZ: 0, dropBubble: true, useItem: false });
        api.setPlayerInput('bot2', { moveX: 0, moveZ: 0, dropBubble: true, useItem: false });
        api.setPlayerInput('bot3', { moveX: 0, moveZ: 0, dropBubble: true, useItem: false });
        api.stepFrames(1);
        clearInput('p1');
        clearInput('p2');
        clearInput('bot2');
        clearInput('bot3');

        // Steer the 3 outer bombers diagonally off ALL 4 cardinal blast rows/cols:
        //   p2   -> (4.5, 5.5) [col 4, row 5]
        //   bot2 -> (10.5, 7.5) [col 10, row 7]
        //   bot3 -> (8.5, 3.5) [col 8, row 3]
        steerToWorld('p2', 'p2', 4.5, 5.5, 35, 0.08);
        steerToWorld('bot2', 'bot2', 10.5, 7.5, 35, 0.08);
        steerToWorld('bot3', 'bot3', 8.5, 3.5, 35, 0.08);

        // Advance tick-by-tick until the 4 simultaneous bubbles detonate together on (7, 6)
        let sHit = api.getState();
        let blastCountAtHit = 0;
        for (let i = 0; i < 200; i += 1) {
          sHit = api.stepFrames(1);
          if (sHit.sim.blasts.length > 0 && sHit.sim.bubbles.length === 0) {
            blastCountAtHit = sHit.sim.blasts.length;
            break;
          }
        }

        // Wait for blast linger (0.40s) + dismount/shield invuln (1.10s = 66f) to expire completely
        api.stepFrames(80);
        if (getPlayer(api.getState(), 'p1').state === 'alive') {
          steerToWorld('p2', 'p2', 5.5, 6.5, 45, 0.06);
          steerToWorld('bot2', 'bot2', 9.5, 6.5, 45, 0.06);
          steerToWorld('bot3', 'bot3', 7.5, 4.5, 45, 0.06);
        }
        const p1AtHit = getPlayer(sHit, 'p1');
        return { state: p1AtHit.state, hasShield: p1AtHit.hasShield, mount: p1AtHit.mount, blastCountAtHit };
      }

      const w1 = fireSimultaneousWave();
      const w2 = fireSimultaneousWave();
      const w3 = fireSimultaneousWave();

      return { w1, w2, w3 };
      """
  )
  assert res["w1"] == {"state": "alive", "hasShield": False, "mount": "ufo", "blastCountAtHit": 4}, res
  assert res["w2"] == {"state": "alive", "hasShield": False, "mount": None, "blastCountAtHit": 4}, res
  assert res["w3"] == {"state": "trapped", "hasShield": False, "mount": None, "blastCountAtHit": 4}, res


@_t5("5B_sliding_bubbles_chains_and_mounts")
def test_t5_11_cyclic_figure8_bubble_network_detonates_in_single_tick_zero_quota_drift(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        p2CharacterId: 'miduo',
        p2Enabled: true,
        seed: 5011,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 5, team: 0 },
          { id: 'p2', col: 7, row: 5, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 8, blastRange: 3, baseSpeed: 7.2 },
          p2: { maxBubbles: 7, blastRange: 3, baseSpeed: 7.5 },
        },
      });
      // Build an 8-bubble cyclic loop across cols 4..6 and 7..9 so rays cross in a cycle
      const p1Spots = [[4, 5], [5, 5], [6, 5], [6, 6], [5, 6], [4, 6]];
      for (const [c, r] of p1Spots) {
        steerToWorld('p1', 'p1', c + 0.5, r + 0.5, 20);
        pulseDropBubble('p1');
      }
      steerToWorld('p1', 'p1', 1.5, 1.5, 45);

      const p2Spots = [[7, 5], [8, 5], [8, 6], [7, 6]];
      for (const [c, r] of p2Spots) {
        steerToWorld('p2', 'p2', c + 0.5, r + 0.5, 20);
        pulseDropBubble('p2');
      }
      steerToWorld('p2', 'p2', 1.5, 11.5, 55);

      const preCount = api.getState().sim.bubbles.length;
      let chainTickBubblesBefore = preCount;
      let chainTickBubblesAfter = -1;
      for (let i = 0; i < 200; i += 1) {
        const before = api.getState().sim.bubbles.length;
        const st = api.stepFrames(1);
        const after = st.sim.bubbles.length;
        if (after < before) {
          chainTickBubblesBefore = before;
          chainTickBubblesAfter = after;
          break;
        }
      }
      const endSt = api.getState();
      return {
        preCount,
        chainTickBubblesBefore,
        chainTickBubblesAfter,
        p1Active: getPlayer(endSt, 'p1').activeBubbles,
        p2Active: getPlayer(endSt, 'p2').activeBubbles,
      };
      """
  )
  assert res["preCount"] >= 8, res
  assert res["chainTickBubblesBefore"] >= 8 and res["chainTickBubblesAfter"] == 0, (
      f"Expected entire cyclic network to detonate in 1 tick: {res}"
  )
  assert res["p1Active"] == 0 and res["p2Active"] == 0, res


# ==============================================================================
# Group 5C: Mode Tie-Breakers, Base-Trap Races & Boss Defeat Races (6 tests)
# ==============================================================================


@_t5("5C_mode_races_and_tiebreakers")
def test_t5_12_same_tick_ally_rescue_beats_enemy_pop_and_preserves_needle(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5012,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },    // Victim to be trapped
          { id: 'p2', col: 3, row: 6, team: 0 },    // Ally rescuer safely outside blastRange=2
          { id: 'bot2', col: 11, row: 6, team: 1 }, // Enemy popper safely outside blastRange=2
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { needles: 2, baseSpeed: 5.0 },
          p2: { baseSpeed: 6.0 },
          bot2: { baseSpeed: 6.0 },
        },
      });
      // 1. p1 drops bubble on (7, 6), becomes trapped at frame 180, and blast linger finishes by frame 208
      pulseDropBubble('p1');
      api.stepFrames(208);

      // 2. Now park p2 at x = 6.70 and bot2 at x = 8.30 (dist ~0.80 > 0.76 before tick; 1 step of 0.10 crosses into <= 0.76!)
      steerToWorld('p2', 'p2', 6.70, 6.5, 80, 0.012);
      steerToWorld('bot2', 'bot2', 8.30, 6.5, 80, 0.012);

      // Step both Ally p2 (+1) and Enemy bot2 (-1) into contact on the EXACT same tick while p1 also presses Needle!
      api.setPlayerInput('p2', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      api.setPlayerInput('bot2', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
      api.setPlayerInput('p1', { moveX: 0, moveZ: 0, dropBubble: false, useItem: true });
      const st = api.stepFrames(1);
      const p1 = getPlayer(st, 'p1');
      const p2 = getPlayer(st, 'p2');
      const bot2 = getPlayer(st, 'bot2');
      return {
        p1State: p1.state,
        p1Needles: p1.needles,
        p1Invuln: p1.invulnTimer,
        p2Rescues: p2.stats.rescues,
        bot2Kos: bot2.stats.kos,
      };
      """
  )
  assert res["p1State"] == "alive", res
  assert res["p2Rescues"] == 1 and res["bot2Kos"] == 0, res
  assert res["p1Needles"] == 2, f"Ally rescue should run before Needle consumption: {res}"
  assert res["p1Invuln"] >= 1.4, res


@_t5("5C_mode_races_and_tiebreakers")
def test_t5_13_bun_grab_exact_tick_step_onto_base_while_trapped_by_blast_never_banks(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const g = makeGrid({
        tiles: [
          [2, 6, 4], // TEAM_BASE_BLUE at (2, 6)
          [12, 6, 5],
          [7, 6, 3],
        ],
      });
      api.startMatch({
        deterministic: true,
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5013,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },
          { id: 'p2', col: 2, row: 4, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: { p2: { blastRange: 3 } },
      });
      // Step 1 frame so p1 picks up the central shrine bun at (7, 6)
      api.stepFrames(1);
      // Steer p1 West to x = 3.03 (just outside col 2 = TEAM_BASE_BLUE)
      steerToWorld('p1', 'p1', 3.03, 6.5, 120, 0.02);

      // p2 drops a bubble at (2, 4) whose South ray hits (2, 6) in 180 ticks, then walks off
      pulseDropBubble('p2');
      moveHold('p2', 1, 0, 20);
      // Advance until fuseRemaining is 1 tick (<= 0.02s)
      while (api.getState().sim.bubbles.length > 0 && api.getState().sim.bubbles[0].fuseRemaining > 0.02) {
        api.stepFrames(1);
      }
      // On the exact detonation tick, p1 steps West onto col 2 (TEAM_BASE_BLUE)!
      api.setPlayerInput('p1', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
      const st = api.stepFrames(1);
      const p1 = getPlayer(st, 'p1');
      const droppedOnBase = st.sim.looseBuns.some((b) => st.sim.grid[b.row][b.col] === 4);
      return {
        p1Col: p1.col,
        p1State: p1.state,
        carryingBun: p1.carryingBun,
        blueScore: st.sim.teamScores.blue,
        droppedOnBase,
      };
      """
  )
  assert res["p1Col"] == 2 and res["p1State"] == "trapped", res
  assert res["carryingBun"] is False and res["blueScore"] == 0, res
  assert res["droppedOnBase"] is False, res


@_t5("5C_mode_races_and_tiebreakers")
def test_t5_14_bun_grab_multiple_carriers_trapped_in_tight_corridor_scatter_buns_distinctly(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Tight 1-row corridor along row 6 surrounded by HARD_WALL on rows 5 & 7
      const walls = [];
      for (let c = 1; c < 14; c += 1) {
        walls.push([c, 5], [c, 7]);
      }
      const g = makeGrid({
        walls,
        tiles: [
          [1, 6, 4],
          [13, 6, 5],
          [6, 6, 3],
          [7, 6, 3],
          [8, 6, 3],
        ],
      });
      api.startMatch({
        deterministic: true,
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        activeBunTarget: 3,
        seed: 5014,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'p2', col: 7, row: 6, team: 0 },
          { id: 'bot2', col: 9, row: 6, team: 1 },
          { id: 'bot3', col: 12, row: 6, team: 1 },
        ],
        startingLoadout: { bot2: { blastRange: 4 } },
      });
      api.stepFrames(1); // p1 & p2 snatch buns at (6,6) and (7,6)
      // Move p1 and p2 onto the SAME tile (6, 6), then bot2 bombs them from (9, 6)
      steerToWorld('p2', 'p2', 6.5, 6.5, 30, 0.05);
      pulseDropBubble('bot2');
      moveHold('bot2', 1, 0, 25);
      const st = api.stepFrames(160);
      const coords = st.sim.looseBuns.map((b) => `${b.col},${b.row}`);
      const uniqueCoords = new Set(coords);
      const badTiles = st.sim.looseBuns.filter((b) => {
        const t = st.sim.grid[b.row][b.col];
        return t === 1 || t === 2 || t === 4 || t === 5;
      });
      return {
        p1State: getPlayer(st, 'p1').state,
        p2State: getPlayer(st, 'p2').state,
        looseCount: st.sim.looseBuns.length,
        uniqueCount: uniqueCoords.size,
        badTilesCount: badTiles.length,
      };
      """
  )
  assert res["p1State"] == "trapped" and res["p2State"] == "trapped", res
  assert res["looseCount"] >= 3 and res["uniqueCount"] == res["looseCount"], res
  assert res["badTilesCount"] == 0, res


@_t5("5C_mode_races_and_tiebreakers")
def test_t5_15_bun_grab_regulation_tie_triggers_overtime_and_golden_bun_sudden_death(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const g = makeGrid({
        tiles: [
          [2, 6, 4],
          [12, 6, 5],
          [5, 6, 3],
        ],
      });
      api.startMatch({
        deterministic: true,
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'wanzi',
        seed: 5015,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      // Advance full 150s regulation (9000 ticks) with 0-0 score -> must enter 20s Overtime!
      const stOt = api.stepFrames(9001);
      const otScreen = stOt.uiScreen;
      const otPhase = stOt.sim.phase;
      const otRemaining = stOt.sim.timeRemainingSec;

      // Now snatch 1 bun at (5, 6) and bank at (2, 6): Golden Bun must end match immediately at 1-0!
      steerToWorld('p1', 'p1', 5.5, 6.5, 40, 0.08);
      steerToWorld('p1', 'p1', 2.5, 6.5, 60, 0.08);
      const stWin = api.stepFrames(2);
      return {
        otScreen,
        otPhase,
        otRemaining,
        winScreen: stWin.uiScreen,
        winPhase: stWin.sim.phase,
        scores: stWin.sim.teamScores,
      };
      """
  )
  assert res["otScreen"] == "playing" and res["otPhase"] == "playing", res
  assert 18.0 <= res["otRemaining"] <= 20.0, res
  assert res["winPhase"] == "victory" and res["winScreen"] == "podium", res
  assert res["scores"] == {"blue": 1, "red": 0}, res


@_t5("5C_mode_races_and_tiebreakers")
def test_t5_16_boss_golem_lethal_hit_mid_telegraph_clears_hazards_and_prevents_ghost_attacks(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'haiwangzi',
        seed: 5016,
        botBehavior: 'active',
        autoPlayP1: true,
        startingLoadout: {
          p1: { maxBubbles: 6, blastRange: 7, baseSpeed: 7.5, hasShield: true, mount: 'ufo', needles: 3 },
          bot1: { maxBubbles: 6, blastRange: 7, baseSpeed: 7.2, hasShield: true, mount: 'ufo', needles: 3 },
          bot2: { maxBubbles: 6, blastRange: 7, baseSpeed: 7.2, hasShield: true, mount: 'ufo', needles: 3 },
          bot3: { maxBubbles: 6, blastRange: 7, baseSpeed: 7.2, hasShield: true, mount: 'ufo', needles: 3 },
        },
      });
      // Advance co-op heroes until Boss Golem reaches 0 HP (victory)
      let finalSnap = api.getState();
      for (let step = 0; step < 300 && finalSnap.sim.phase === 'playing'; step += 1) {
        finalSnap = api.stepFrames(30);
      }
      // Step 60 post-victory frames on Podium to confirm 0 ghost boss_attack errors or lingering telegraphs
      const afterPodium = api.stepFrames(60);
      return {
        phase: finalSnap.sim.phase,
        uiScreen: afterPodium.uiScreen,
        bossHp: afterPodium.sim.boss.hp,
        bossState: afterPodium.sim.boss.state,
        telegraphCount: afterPodium.sim.boss.telegraphTiles.length,
      };
      """
  )
  assert res["phase"] == "victory" and res["uiScreen"] == "podium", res
  assert res["bossHp"] == 0 and res["bossState"] == "defeated", res
  assert res["telegraphCount"] == 0, res


@_t5("5C_mode_races_and_tiebreakers")
def test_t5_17_classic_2v2_simultaneous_mutual_all_team_wipe_resolves_deterministically(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5017,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 5, team: 0 },
          { id: 'bot1', col: 7, row: 6, team: 0 },
          { id: 'bot2', col: 7, row: 7, team: 1 },
          { id: 'bot3', col: 7, row: 8, team: 1 },
        ],
        startingLoadout: { p1: { blastRange: 5 } },
      });
      // Single bubble at (7, 5) traps ALL 4 players on the exact same tick, then all 4 burst on timeout on the exact same tick!
      pulseDropBubble('p1');
      const sTrap = api.stepFrames(182);
      const trappedCount = sTrap.sim.players.filter((p) => p.state === 'trapped').length;
      const sEnd = api.stepFrames(340); // 5.5s = 330 frames -> simultaneous timeout burst!
      return {
        trappedCount,
        uiScreen: sEnd.uiScreen,
        phase: sEnd.sim.phase,
        rankingsLen: sEnd.sim.rankings.length,
        ranks: sEnd.sim.rankings.map((r) => r.rank),
      };
      """
  )
  assert res["trappedCount"] == 4, res
  assert res["uiScreen"] == "podium", res
  assert res["phase"] in ("victory", "defeat", "draw"), res
  assert res["rankingsLen"] == 4 and res["ranks"] == [1, 2, 3, 4], res


# ==============================================================================
# Group 5D: Pointer/Multi-Thumb, Pause/Blur Input, Audio, Render & Release (8 tests)
# ==============================================================================


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_18_virtual_joystick_w3c_pointerevent_lifecycle_and_pointercancel_zero_drift(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5018,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      const joy = document.querySelector('[data-testid="hud-joystick"]');
      const knob = joy.querySelector('[data-role="joystick-knob"]');
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;

      const x0 = getPlayer(api.getState(), 'p1').x;
      joy.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, clientX: cx, clientY: cy, bubbles: true }));
      joy.dispatchEvent(new PointerEvent('pointermove', { pointerId: 11, clientX: cx + 52, clientY: cy, buttons: 1, bubbles: true }));
      const ariaActive = joy.getAttribute('aria-valuenow');
      const sMoved = api.stepFrames(18);
      const x1 = getPlayer(sMoved, 'p1').x;

      // Interrupt stream with pointercancel (no pointerup!)
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 11, bubbles: true }));
      const sCancel1 = api.stepFrames(1);
      const xAfterCancel = getPlayer(sCancel1, 'p1').x;
      const sCancel30 = api.stepFrames(30);
      const xAfter30 = getPlayer(sCancel30, 'p1').x;

      return {
        ariaActive,
        moveDelta: +(x1 - x0).toFixed(4),
        ariaAfterCancel: joy.getAttribute('aria-valuenow'),
        knobTransform: knob ? knob.style.transform : '',
        postCancelDrift: +Math.abs(xAfter30 - xAfterCancel).toFixed(5),
      };
      """
  )
  assert res["ariaActive"] == "100" and res["moveDelta"] > 0.8, res
  assert res["ariaAfterCancel"] == "0", res
  assert res["postCancelDrift"] == 0.0, f"Joystick leaked post-pointercancel drift: {res}"


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_19_cross_protocol_mousedown_interrupted_by_pointercancel_zero_drift(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5019,
        botBehavior: 'idle',
        customGrid: makeGrid(),
      });
      const joy = document.querySelector('[data-testid="hud-joystick"]');
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;

      joy.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: cx, clientY: cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: cx + 55, clientY: cy, bubbles: true }));
      api.stepFrames(8);
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
      const s1 = api.stepFrames(1);
      const x1 = getPlayer(s1, 'p1').x;
      const s30 = api.stepFrames(30);
      const x30 = getPlayer(s30, 'p1').x;
      return {
        ariaAfter: joy.getAttribute('aria-valuenow'),
        drift: +Math.abs(x30 - x1).toFixed(5),
      };
      """
  )
  assert res["ariaAfter"] == "0" and res["drift"] == 0.0, res


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_20_multi_thumb_joystick_steer_while_second_thumb_taps_bubble_never_hijacks_vector(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang', // 2 bubbles
        seed: 5020,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      const joy = document.querySelector('[data-testid="hud-joystick"]');
      const bubbleBtn = document.querySelector('[data-testid="hud-btn-bubble"]');
      const jr = joy.getBoundingClientRect();
      const br = bubbleBtn.getBoundingClientRect();
      const jx = jr.left + jr.width * 0.5;
      const jy = jr.top + jr.height * 0.5;

      // Thumb #1 (pointerId=1) holds joystick East (+1)
      joy.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: jx, clientY: jy, bubbles: true }));
      joy.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: jx + 55, clientY: jy, bubbles: true }));
      const sBeforeTap = api.stepFrames(10);
      const xBeforeTap = getPlayer(sBeforeTap, 'p1').x;

      // Thumb #2 (pointerId=2) taps Bubble button (pointerdown -> pointerup + stray pointermove/pointercancel with pointerId=2)
      bubbleBtn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: br.left + 20, clientY: br.top + 20, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: br.left + 25, clientY: br.top + 25, bubbles: true }));
      bubbleBtn.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: br.left + 25, clientY: br.top + 25, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2, pointerType: 'touch', bubbles: true }));

      // Step 18 more frames WITHOUT moving Thumb #1: Thumb #1's East vector must remain 100% intact AND bubble must be placed!
      const sAfterTap = api.stepFrames(18);
      const xAfterTap = getPlayer(sAfterTap, 'p1').x;
      const ariaStillHeld = joy.getAttribute('aria-valuenow');

      // Now lift Thumb #1 (pointerId=1)
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true }));
      api.stepFrames(1);
      const xRelease = getPlayer(api.getState(), 'p1').x;
      const sPost = api.stepFrames(15);

      return {
        bubblesPlaced: sAfterTap.sim.bubbles.length,
        continuedEastDelta: +(xAfterTap - xBeforeTap).toFixed(4),
        ariaStillHeld,
        ariaAfterThumb1Up: joy.getAttribute('aria-valuenow'),
        postReleaseDrift: +Math.abs(getPlayer(sPost, 'p1').x - xRelease).toFixed(5),
      };
      """
  )
  assert res["bubblesPlaced"] == 1, res
  assert res["continuedEastDelta"] > 0.8 and res["ariaStillHeld"] == "100", (
      f"Thumb #2 tap hijacked or cancelled Thumb #1 joystick drag: {res}"
  )
  assert res["ariaAfterThumb1Up"] == "0" and res["postReleaseDrift"] == 0.0, res


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_21_pause_resume_and_window_blur_contextmenu_clear_held_movement_zero_drift(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5021,
        botBehavior: 'idle',
        customGrid: makeGrid(),
      });
      const joy = document.querySelector('[data-testid="hud-joystick"]');
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;

      // 1. Active drag -> Escape pause -> outside release -> Escape resume
      joy.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: cx, clientY: cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: cx + 55, clientY: cy, bubbles: true }));
      api.stepFrames(6);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      const pausedScreen = api.getState().uiScreen;
      const ariaWhilePaused = joy.getAttribute('aria-valuenow');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      const sResumed1 = api.stepFrames(1);
      const xR1 = getPlayer(sResumed1, 'p1').x;
      const xR30 = getPlayer(api.stepFrames(30), 'p1').x;

      // 2. Held KeyD interrupted by window blur and contextmenu (no keyup!)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true }));
      api.stepFrames(6);
      window.dispatchEvent(new Event('blur'));
      const xBlur1 = getPlayer(api.stepFrames(1), 'p1').x;
      const xBlur20 = getPlayer(api.stepFrames(20), 'p1').x;

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 's', bubbles: true }));
      api.stepFrames(6);
      window.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      const zCtx1 = getPlayer(api.stepFrames(1), 'p1').z;
      const zCtx20 = getPlayer(api.stepFrames(20), 'p1').z;

      return {
        pausedScreen,
        ariaWhilePaused,
        pauseResumeDrift: +Math.abs(xR30 - xR1).toFixed(5),
        blurDrift: +Math.abs(xBlur20 - xBlur1).toFixed(5),
        contextmenuDrift: +Math.abs(zCtx20 - zCtx1).toFixed(5),
      };
      """
  )
  assert res["pausedScreen"] == "paused" and res["ariaWhilePaused"] == "0", res
  assert res["pauseResumeDrift"] == 0.0, res
  assert res["blurDrift"] == 0.0 and res["contextmenuDrift"] == 0.0, res


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_22_webaudio_unlocked_synthesizes_all_combat_boss_and_mode_sfx_zero_errors(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  # Perform real CDP user gesture click from Title screen to unlock WebAudio context cleanly
  h.click_testid("btn-play")
  h.click_testid("btn-start-match")
  res = h.run_sim_js(
      """
      // Ensure unmuted and unlocked
      if (api.getState().audio.muted) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
      }
      // Exercise a rich Boss Golem match with pickups, mounts, shield, kick, bubbles, blasts, boss telegraph & boss hit
      api.startMatch({
        deterministic: true,
        modeId: 'boss_golem',
        arenaId: 'pirate_bay',
        p1CharacterId: 'xiaoqiang',
        seed: 5022,
        botBehavior: 'active',
        autoPlayP1: true,
        customPickups: [
          { type: 'turtle', col: 2, row: 1 },
          { type: 'shield', col: 12, row: 1 },
          { type: 'kick', col: 2, row: 11 },
          { type: 'needle', col: 12, row: 11 },
        ],
      });
      const beforeSfx = api.getState().audio.sfxCount;
      const st = api.stepFrames(320);
      return {
        unlocked: st.audio.unlocked,
        muted: st.audio.muted,
        track: st.audio.currentTrack,
        sfxDelta: st.audio.sfxCount - beforeSfx,
      };
      """
  )
  assert res["unlocked"] is True and res["muted"] is False, res
  assert res["track"] in ("boss_golem", "podium"), res
  assert res["sfxDelta"] >= 5, f"Expected >=5 real gameplay SFX events synthesized: {res}"


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_23_webgl2_renderer_reset_determinism_across_dirty_boss_restarts(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.set_viewport(1280, 800, mobile=False, touch=False)
  res = h.run_sim_js(
      """
      const flushMicrotasks = () => new Promise((r) => queueMicrotask(r));
      const canvas = document.querySelector('[data-testid="arena-canvas"]');

      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5151,
        botBehavior: 'active',
      });
      await flushMicrotasks();
      const runATick0 = canvas.toDataURL('image/png');
      api.stepFrames(10);
      await flushMicrotasks();
      const runATick10 = canvas.toDataURL('image/png');

      // Run a dirty 190-tick Boss match on another arena to perturb camera shake, gears, debris & particles
      api.startMatch({
        deterministic: true,
        modeId: 'boss_golem',
        arenaId: 'pirate_bay',
        p1CharacterId: 'wanzi',
        seed: 9999,
        botBehavior: 'active',
        autoPlayP1: true,
      });
      api.stepFrames(190);
      await flushMicrotasks();

      // Re-run identical seed=5151 match and verify bit-exact WebGL2 frame output!
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 5151,
        botBehavior: 'active',
      });
      await flushMicrotasks();
      const runBTick0 = canvas.toDataURL('image/png');
      api.stepFrames(10);
      await flushMicrotasks();
      const runBTick10 = canvas.toDataURL('image/png');

      return {
        tick0Exact: runATick0 === runBTick0,
        tick10Exact: runATick10 === runBTick10,
        tick0DistinctFromTick10: runATick0 !== runATick10,
      };
      """
  )
  assert res["tick0Exact"] is True, res
  assert res["tick10Exact"] is True, res
  assert res["tick0DistinctFromTick10"] is True, res


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_24_extreme_aspect_ratio_resizes_maintain_finite_camera_and_zero_scroll(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  try:
    for w, ht, touch in [(1600, 500, False), (360, 880, True), (1024, 768, True)]:
      dims = h.set_viewport(w, ht, mobile=touch, touch=touch)
      st = h.run_sim_js(
          """
          api.startMatch({
            deterministic: true,
            modeId: 'classic_2v2',
            arenaId: 'ice_village',
            p1CharacterId: 'haiwangzi',
            seed: 5024,
            botBehavior: 'idle',
          });
          return api.stepFrames(3);
          """
      )
      audit = h.audit_viewport_and_hud()
      assert dims["scrollWidth"] <= w and dims["scrollHeight"] <= ht, (w, ht, dims)
      assert audit["controlCount"] <= 5 and audit["overlaps"] == [], (w, ht, audit)
      assert st["render"]["cameraDistance"] > 5 and st["render"]["cameraFov"] > 15, st["render"]
  finally:
    h.set_viewport(1280, 800, mobile=False, touch=False)


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_25_release_readme_screenshot_and_gitignore_publication_readiness(
    h: QQTangTestHarness,
) -> None:
  readme = h.root_dir / "README.md"
  shot = h.root_dir / "screenshot.jpg"
  gitignore = h.root_dir / ".gitignore"

  assert readme.is_file(), "Missing README.md at repository root"
  readme_txt = readme.read_text(encoding="utf-8")
  assert "https://kunruiw1991.github.io/qq-tang-3d/" in readme_txt, (
      "README.md must link to live GitHub Pages URL https://kunruiw1991.github.io/qq-tang-3d/"
  )
  assert "screenshot.jpg" in readme_txt, "README.md must embed screenshot.jpg"
  for token in ("米多", "小强", "海王子", "丸子", "糖果镇", "抢包山", "机械傀儡"):
    assert token in readme_txt, f"README.md missing expected game overview token {token!r}"

  assert shot.is_file(), "Missing screenshot.jpg at repository root"
  shot_stats = h.inspect_image(shot)
  assert shot_stats["width"] == 1280 and shot_stats["height"] == 800, shot_stats
  assert shot_stats["bytes"] >= 35_000 and shot_stats["std_dev"] > 0.06, shot_stats

  gi_txt = gitignore.read_text(encoding="utf-8")
  assert ".agents/" in gi_txt, ".gitignore must exclude .agents/"
  assert (h.root_dir / ".nojekyll").is_file(), "Missing .nojekyll at repository root"


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_26_webaudio_bgm_continues_under_autorepeat_key_hold_and_rapid_taps(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'ice_village',
        p1CharacterId: 'miduo',
        seed: 5026,
        botBehavior: 'idle',
      });
      return api.stepFrames(2);
      """
  )
  # Unlock WebAudio via a genuine CDP click and ensure unmuted
  h.click_at(640, 400)
  h.eval_js(
      """
      (() => {
        const st = window.__QQTANG__.getState();
        if (st.audio && st.audio.muted) {
          document.querySelector('[data-testid="btn-audio"]')?.click();
          document.getElementById('btn-hud-audio')?.click();
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!window.__qqtangOrigCreateOsc) {
          window.__qqtangOrigCreateOsc = AC.prototype.createOscillator;
        }
        window.__qqtangOscCount = 0;
        AC.prototype.createOscillator = function (...args) {
          window.__qqtangOscCount += 1;
          return window.__qqtangOrigCreateOsc.apply(this, args);
        };
      })()
      """
  )
  try:
    before_steps = h.get_state()["audio"]["bgmStepCount"]
    # Simulate OS key auto-repeat (~32ms interval) for >= 2.1s plus rapid pointerdown taps
    h.key_down("ArrowLeft")
    start_t = time.monotonic()
    tap_i = 0
    while time.monotonic() - start_t < 2.15:
      h.cdp(
          "Input.dispatchKeyEvent",
          {
              "type": "rawKeyDown",
              "key": "ArrowLeft",
              "code": "ArrowLeft",
              "windowsVirtualKeyCode": 37,
              "nativeVirtualKeyCode": 37,
              "autoRepeat": True,
          },
      )
      if tap_i % 8 == 0:
        h.click_at(200, 200)
      tap_i += 1
      time.sleep(0.032)
    h.key_up("ArrowLeft")

    res = h.eval_js(
        """
        (() => ({
          oscCount: window.__qqtangOscCount || 0,
          audio: window.__QQTANG__.getState().audio,
        }))()
        """
    )
    assert res["oscCount"] >= 8, f"BGM starved under key autoRepeat: {res}"
    assert res["audio"]["bgmStepCount"] - before_steps >= 6, (before_steps, res)
  finally:
    h.eval_js(
        """
        (() => {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (window.__qqtangOrigCreateOsc) {
            AC.prototype.createOscillator = window.__qqtangOrigCreateOsc;
          }
        })()
        """
    )


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_27_kick_ignored_while_bubble_has_unsolidified_occupant_zero_one_tick_snap(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 5027,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'p2', col: 5, row: 6, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: { p2: { canKick: true } },
      });
      // p1 drops a bubble at (6, 6) and remains standing on it (passThroughIds includes 'p1')
      let st = pulseDropBubble('p1');
      let maxP1StepWhileOccupied = 0;
      let slidWhileOccupied = false;
      let passThroughClearedWhileOccupied = false;

      // p2 pushes East (+X) directly against p1's unsolidified bubble for 18 frames
      for (let i = 0; i < 18; i += 1) {
        const prevX = getPlayer(st, 'p1').x;
        const prevZ = getPlayer(st, 'p1').z;
        api.setPlayerInput('p2', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
        st = api.stepFrames(1);
        const curP1 = getPlayer(st, 'p1');
        const stepDist = Math.hypot(curP1.x - prevX, curP1.z - prevZ);
        if (stepDist > maxP1StepWhileOccupied) maxP1StepWhileOccupied = stepDist;
        const b = st.sim.bubbles[0];
        if (b && b.sliding) slidWhileOccupied = true;
        if (b && !b.passThroughIds.includes('p1')) passThroughClearedWhileOccupied = true;
      }
      clearInput('p2');

      // Now p1 steps North off (6, 6) so passThroughIds clears naturally, then p2 kicks it East!
      st = steerToWorld('p1', 'p1', 6.5, 4.5, 45, 0.08);
      const passThroughAfterExit = st.sim.bubbles[0].passThroughIds.slice();
      st = moveHold('p2', 1, 0, 14);
      const bAfterKick = st.sim.bubbles[0];
      return {
        maxP1StepWhileOccupied,
        slidWhileOccupied,
        passThroughClearedWhileOccupied,
        passThroughAfterExit,
        slidAfterExit: Boolean(bAfterKick && bAfterKick.sliding),
        vxAfterExit: bAfterKick ? bAfterKick.vx : 0,
      };
      """
  )
  assert res["slidWhileOccupied"] is False, res
  assert res["passThroughClearedWhileOccupied"] is False, res
  assert res["maxP1StepWhileOccupied"] < 0.01, res
  assert res["passThroughAfterExit"] == [], res
  assert res["slidAfterExit"] is True and res["vxAfterExit"] > 5.0, res


@_t5("5D_pointer_input_audio_render_and_release")
def test_t5_28_bot_proportional_steering_zero_overshoot_dithering_on_ufo_and_skates(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        deterministic: true,
        modeId: 'bun_grab',
        arenaId: 'ice_village',
        p1CharacterId: 'wanzi',
        seed: 5028,
        botBehavior: 'active',
        autoPlayP1: true,
        startingLoadout: {
          p1: { mount: 'ufo', speedUps: 5, maxBubbles: 4, blastRange: 4 },
          bot1: { speedUps: 5, canKick: true, maxBubbles: 4, blastRange: 4 },
          bot2: { mount: 'ufo', speedUps: 5, maxBubbles: 4, blastRange: 4 },
          bot3: { speedUps: 5, canKick: true, maxBubbles: 4, blastRange: 4 },
        },
      });

      const prevVel = new Map();
      const streak = new Map();
      let totalBotTicks = 0;
      let revTicks = 0;
      let maxStreak = 0;

      for (let t = 0; t < 720; t += 1) {
        const before = api.getState().sim.players.map((p) => ({
          id: p.id,
          x: p.x,
          z: p.z,
          state: p.state,
        }));
        const afterSt = api.stepFrames(1);
        if (afterSt.sim.phase !== 'playing') break;
        for (let i = 0; i < before.length; i += 1) {
          const b = before[i];
          const a = afterSt.sim.players[i];
          if (b.state !== 'alive' || a.state !== 'alive') {
            prevVel.delete(b.id);
            streak.set(b.id, 0);
            continue;
          }
          totalBotTicks += 1;
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          const pv = prevVel.get(b.id);
          if (pv) {
            const rev = dx * pv.dx < -1e-5 || dz * pv.dz < -1e-5;
            if (rev) {
              revTicks += 1;
              const ns = (streak.get(b.id) || 0) + 1;
              streak.set(b.id, ns);
              if (ns > maxStreak) maxStreak = ns;
            } else if (Math.hypot(dx, dz) > 1e-4) {
              streak.set(b.id, 0);
            }
          }
          if (Math.hypot(dx, dz) > 1e-4) {
            prevVel.set(b.id, { dx, dz });
          }
        }
      }
      return {
        totalBotTicks,
        revPct: totalBotTicks > 0 ? (revTicks * 100) / totalBotTicks : 0,
        maxStreak,
      };
      """
  )
  assert res["totalBotTicks"] >= 1000, res
  assert res["revPct"] < 3.0, f"Bot reversal fraction >= 3%: {res}"
  assert res["maxStreak"] < 20, f"Bot consecutive reversal streak >= 20: {res}"

