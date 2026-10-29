#!/usr/bin/env python3
"""Tier 2 Boundary, Edge-Case (E01–E15), Negative & Static Hygiene Tests (48 tests).

Covers every edge case E01–E15 from spec_inventory.md, stat caps, state-machine
guards, deterministic PRNG replay, invalid input clamping, strict /qq-tang-3d/
subpath hosting, zero-<script type="importmap">, zero bare ES module specifiers,
and repository secret/gitignore hygiene.
"""

from __future__ import annotations

import re
from typing import Callable

from harness import QQTangTestHarness, RecordedStaticHTTPServer, TestCaseSpec


TIER2_TESTS: list[TestCaseSpec] = []


def _t2(group: str) -> Callable[[Callable[[QQTangTestHarness], None]], Callable[[QQTangTestHarness], None]]:
  def decorator(fn: Callable[[QQTangTestHarness], None]) -> Callable[[QQTangTestHarness], None]:
    TIER2_TESTS.append(TestCaseSpec(tier=2, name=fn.__name__, group=group, fn=fn))
    return fn

  return decorator


def _ensure_loaded(h: QQTangTestHarness) -> None:
  has_api = h.eval_js("Boolean(window.__QQTANG__ || window.__QQ_TANG__)")
  if not has_api:
    h.set_viewport(1280, 800, mobile=False, touch=False)
    h.navigate(wait_qqtang=True)


def extract_es_module_specifiers(js_source: str) -> list[str]:
  """Extracts real ES import/export module specifiers ignoring comments/strings."""
  # Tokenize JS comments, template literals, strings, and import/export clauses.
  token_re = re.compile(
      r"""
      (?P<sl_comment>//[^\n]*)
    | (?P<ml_comment>/\*[\s\S]*?\*/)
    | (?P<template>`(?:\\.|[^`\\])*`)
    | (?P<import_from>\b(?:import|export)\s+(?:[\w*{}\s,$]+?\s+from\s+)(?P<q1>['"])(?P<spec1>[^'"]+)(?P=q1))
    | (?P<side_import>(?:^|[;\n{])\s*import\s*(?P<q2>['"])(?P<spec2>[^'"]+)(?P=q2))
    | (?P<dyn_import>\bimport\s*\(\s*(?P<q3>['"])(?P<spec3>[^'"]+)(?P=q3)\s*\))
    | (?P<string>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")
      """,
      re.VERBOSE | re.MULTILINE,
  )
  specs: list[str] = []
  for m in token_re.finditer(js_source):
    s = m.group("spec1") or m.group("spec2") or m.group("spec3")
    if s is not None:
      specs.append(s)
  return specs


# ==============================================================================
# Part 1: Edge Cases E01–E15 (18 dedicated tests)
# ==============================================================================


@_t2("2A_edge_cases_e01_e15")
def test_e01_multi_entity_walk_off_grace_independent_separation(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Spawn p1 and p2 (2P human enabled) overlapping the exact same tile (6, 6)!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 2001,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'p2', col: 6, row: 6, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const sDrop = pulseDropBubble('p1');
      const initialPass = sDrop.sim.bubbles[0].passThroughIds.slice();
      const bX = sDrop.sim.bubbles[0].x;

      // 1. p1 walks East off (6, 6); p2 stays on (6, 6) and must remain in passThroughIds!
      const sP1Out = moveHold('p1', 1, 0, 22);
      const midPass = sP1Out.sim.bubbles[0].passThroughIds.slice();

      // 2. Now p2 walks West off (6, 6) cleanly without getting wedged!
      const sP2Out = moveHold('p2', -1, 0, 22);
      const afterBothOut = sP2Out.sim.bubbles[0].passThroughIds.slice();

      // 3. Both try to walk back onto (6, 6): BOTH must be blocked outside!
      api.setPlayerInput('p1', { moveX: -1, moveZ: 0, dropBubble: false, useItem: false });
      api.setPlayerInput('p2', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      const sBlocked = api.stepFrames(28);
      clearInput('p1');
      clearInput('p2');
      return {
        initialPass,
        midPass,
        afterBothOut,
        bX,
        p1X: getPlayer(sBlocked, 'p1').x,
        p2X: getPlayer(sBlocked, 'p2').x,
      };
      """
  )
  assert "p1" in res["initialPass"] and "p2" in res["initialPass"], res
  assert "p1" not in res["midPass"] and "p2" in res["midPass"], res
  assert res["afterBothOut"] == [], res
  assert res["p1X"] > res["bX"] + 0.75 and res["p2X"] < res["bX"] - 0.75, res


@_t2("2A_edge_cases_e01_e15")
def test_e02_cyclic_two_bubble_chain_blast_no_infinite_loop_and_exact_quota_refund(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang', // 2 bubbles
        seed: 2002,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'power', col: 5, row: 6 },
          { type: 'power', col: 6, row: 6 },
        ],
      });
      api.setDeterministicMode(true);
      // Collect 2 powers -> blastRange = 3!
      moveHold('p1', 1, 0, 32); // now at (6, 6)
      pulseDropBubble('p1');    // Bubble A at (6, 6), range 3
      moveHold('p1', 1, 0, 28); // move 2 tiles East to (8, 6)
      pulseDropBubble('p1');    // Bubble B at (8, 6), range 3 -> mutually intersects A!
      // Escape South 2 tiles & East 2 tiles
      moveHold('p1', 0, 1, 24);
      moveHold('p1', 1, 0, 24);

      let detState = null;
      for (let i = 0; i < 160; i++) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          detState = st;
          break;
        }
      }
      return {
        bubblesLeft: detState.sim.bubbles.length,
        activeBubbles: getPlayer(detState, 'p1').activeBubbles,
        blastCount: detState.sim.blasts.length,
      };
      """
  )
  assert res["bubblesLeft"] == 0, res
  assert res["activeBubbles"] == 0, res
  assert 1 <= res["blastCount"] <= 2, res


@_t2("2A_edge_cases_e01_e15")
def test_e02_triangle_four_bubble_ring_chain_detonation(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        seed: 2003,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'bubble', col: 4, row: 5 },
          { type: 'bubble', col: 5, row: 5 },
          { type: 'power', col: 6, row: 5 },
        ],
      });
      api.setDeterministicMode(true);
      moveHold('p1', 1, 0, 44); // Collect 2 bubbles + 1 power -> maxBubbles=4, range=2
      // Place 4 bubbles in a 2x2 ring: (6,5), (7,5), (7,6), (6,6)
      steerToWorld('p1', 'p1', 6.5, 5.5, 60);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', 7.5, 5.5, 60);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', 7.5, 6.5, 60);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', 6.5, 6.5, 60);
      pulseDropBubble('p1');
      const countPlaced = api.getState().sim.bubbles.length;
      // Escape to (3, 9)
      steerToWorld('p1', 'p1', 3.5, 9.5, 100);
      let afterDet = null;
      for (let i = 0; i < 160; i++) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          afterDet = st;
          break;
        }
      }
      return {
        countPlaced,
        bubblesLeft: afterDet.sim.bubbles.length,
        activeBubbles: getPlayer(afterDet, 'p1').activeBubbles,
      };
      """
  )
  assert res["countPlaced"] == 4, res
  assert res["bubblesLeft"] == 0 and res["activeBubbles"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e03_blast_ray_clamped_before_hard_wall_and_arena_perimeter(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place HARD_WALL at (2, 0); bot2 hides safely behind it at (3, 0)!
      // p1 drops range-4 bubble at (0, 0) corner -> tests both out-of-bounds clamping (N/W) and HARD_WALL clamping (E)!
      const g = makeGrid({ walls: [[2, 0]] });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'haiwangzi', // range 2 + 2 power = 4
        seed: 2004,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 0, row: 2, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 3, row: 0, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'power', col: 0, row: 1 },
          { type: 'power', col: 0, row: 0 },
        ],
      });
      api.setDeterministicMode(true);
      steerToWorld('p1', 'p1', 0.5, 0.5, 80); // Collects 2 powers, arrives at (0, 0)
      pulseDropBubble('p1');
      // Escape South to (0, 5) then East to (2, 5)
      steerToWorld('p1', 'p1', 0.5, 5.5, 90);
      steerToWorld('p1', 'p1', 2.5, 5.5, 60);

      let blastTiles = [];
      let bot2State = 'alive';
      for (let i = 0; i < 160; i++) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          blastTiles = st.sim.blasts[0].tiles;
          bot2State = getPlayer(st, 'bot2').state;
          break;
        }
      }
      return { blastTiles, bot2State };
      """
  )
  assert len(res["blastTiles"]) >= 2, res
  for t in res["blastTiles"]:
    c, r = t["col"], t["row"]
    assert 0 <= c < 15 and 0 <= r < 13, f"Out-of-bounds blast tile: {t}"
    assert (c, r) != (2, 0) and not (r == 0 and c >= 2), f"Ray penetrated HARD_WALL at (2,0): {t}"
  assert res["bot2State"] == "alive", res


@_t2("2A_edge_cases_e01_e15")
def test_e03_blast_ray_stops_at_first_soft_block_leaving_second_soft_block_and_bubble_intact(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Bubble at (4, 6) with range 4; East has SOFT_BLOCK at (5, 6), SOFT_BLOCK at (6, 6), and Bubble B at (7, 6)!
      const g = makeGrid({ softBlocks: [[5, 6], [6, 6]] });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        seed: 2005,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'power', col: 7, row: 5 },
          { type: 'power', col: 6, row: 5 },
          { type: 'power', col: 5, row: 5 },
        ],
      });
      api.setDeterministicMode(true);
      // Walk around row 5 to collect 3 powers -> range = 4, reach (4, 6) first to drop Bubble A, then place Bubble B at (7, 6)!
      steerToWorld('p1', 'p1', 7.5, 5.5, 40);
      steerToWorld('p1', 'p1', 4.5, 5.5, 60);
      steerToWorld('p1', 'p1', 4.5, 6.5, 40);
      pulseDropBubble('p1'); // Bubble A at (4, 6)
      // Route via row 5 over to (7, 6) (~55 frames elapsed so Bubble B has ~1.0s longer fuse!)
      steerToWorld('p1', 'p1', 4.5, 5.5, 30);
      steerToWorld('p1', 'p1', 7.5, 5.5, 60);
      steerToWorld('p1', 'p1', 7.5, 6.5, 30);
      pulseDropBubble('p1'); // Bubble B at (7, 6) behind the two soft blocks!
      // Escape to (9, 8)
      steerToWorld('p1', 'p1', 9.5, 6.5, 40);
      steerToWorld('p1', 'p1', 9.5, 8.5, 40);

      let detSt = null;
      for (let i = 0; i < 160; i++) {
        const st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) {
          detSt = st;
          break;
        }
      }
      return {
        firstSoftAfter: detSt.sim.grid[6][5],
        secondSoftAfter: detSt.sim.grid[6][6],
        bubblesRemaining: detSt.sim.bubbles.map((b) => [b.col, b.row]),
      };
      """
  )
  assert res["firstSoftAfter"] == 0, res
  assert res["secondSoftAfter"] == 2, f"Second soft block must stay intact! {res}"
  assert res["bubblesRemaining"] == [[7, 6]], f"Bubble behind soft blocks must NOT chain! {res}"


@_t2("2A_edge_cases_e01_e15")
def test_e04_newly_spawned_loot_survives_revealing_blast_via_spawn_grace(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const softs = [[4, 3], [6, 3], [5, 2], [4, 7], [6, 7], [5, 8]];
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        seed: 4242,
        botBehavior: 'idle',
        customGrid: makeGrid({ softBlocks: softs }),
        customSpawns: [
          { id: 'p1', col: 5, row: 3, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', 5.5, 7.5, 80);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', 2.5, 5.5, 80);

      let countAtReveal = 0;
      let graceAtReveal = 0;
      for (let i = 0; i < 180; i++) {
        const st = api.stepFrames(1);
        if (st.sim.pickups.length > 0 && countAtReveal === 0) {
          countAtReveal = st.sim.pickups.length;
          graceAtReveal = st.sim.pickups[0].spawnGraceSec;
          break;
        }
      }
      // Step 32 frames (> 0.40s blast linger!) so the revealing blast completely finishes lingering!
      const afterLinger = api.stepFrames(32);
      return {
        countAtReveal,
        graceAtReveal,
        countAfterLinger: afterLinger.sim.pickups.length,
      };
      """
  )
  assert res["countAtReveal"] >= 1 and res["graceAtReveal"] > 0.40, res
  assert res["countAfterLinger"] >= res["countAtReveal"], res


@_t2("2A_edge_cases_e01_e15")
def test_e04_exposed_pickup_after_grace_expires_destroyed_by_subsequent_blast(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // range 2
        seed: 2007,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'speed', col: 6, row: 6, spawnGraceSec: 0 }],
      });
      api.setDeterministicMode(true);
      // Wait 40 frames (>0.55s) just in case spawnGraceSec was initialized to default
      api.stepFrames(40);
      const beforeBlast = api.getState().sim.pickups.length;
      pulseDropBubble('p1'); // at (5, 6), hits exposed pickup at (6, 6)
      moveHold('p1', -1, 0, 20);
      moveHold('p1', 0, 1, 20);
      const afterBlast = api.stepFrames(160).sim.pickups.length;
      return { beforeBlast, afterBlast };
      """
  )
  assert res["beforeBlast"] == 1 and res["afterBlast"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e05_lingering_blast_ray_does_not_double_hit_dismounted_turtle_rider(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2008,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'turtle', col: 6, row: 6 }],
      });
      api.setDeterministicMode(true);
      moveHold('p1', 1, 0, 18); // Ride turtle at (6, 6)
      // Drop bubble at (6, 6) and stand completely STILL through the ENTIRE 0.40s (30-frame) blast linger!
      pulseDropBubble('p1');
      const st = api.stepFrames(220);
      const p1 = getPlayer(st, 'p1');
      return { mount: p1.mount, state: p1.state, blastsLeft: st.sim.blasts.length };
      """
  )
  assert res["mount"] is None and res["state"] == "alive" and res["blastsLeft"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e05_lingering_blast_ray_does_not_double_hit_dismounted_ufo_rider(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2009,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'ufo', col: 6, row: 6 }],
      });
      api.setDeterministicMode(true);
      moveHold('p1', 1, 0, 16);
      pulseDropBubble('p1');
      const st = api.stepFrames(220);
      const p1 = getPlayer(st, 'p1');
      return { mount: p1.mount, state: p1.state, blastsLeft: st.sim.blasts.length };
      """
  )
  assert res["mount"] is None and res["state"] == "alive" and res["blastsLeft"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e05_lingering_blast_ray_does_not_double_hit_unshielded_after_shield_break(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2010,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'shield', col: 6, row: 6 }],
      });
      api.setDeterministicMode(true);
      moveHold('p1', 1, 0, 18);
      pulseDropBubble('p1');
      const st = api.stepFrames(220);
      const p1 = getPlayer(st, 'p1');
      return { hasShield: p1.hasShield, state: p1.state, blastsLeft: st.sim.blasts.length };
      """
  )
  assert res["hasShield"] is False and res["state"] == "alive" and res["blastsLeft"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e07_needle_pressed_while_alive_is_noop_and_preserves_needle_count(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.set_viewport(1024, 768, mobile=True, touch=True)
  before = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2011,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'needle', col: 4, row: 6 },
          { type: 'needle', col: 5, row: 6 },
        ],
      });
      api.setDeterministicMode(true);
      moveHold('p1', 1, 0, 32); // Collects 2 needles while alive
      for (let i = 0; i < 6; i++) pulseUseItem('p1');
      return getPlayer(api.getState(), 'p1');
      """
  )
  assert before["state"] == "alive" and before["needles"] == 2, before
  h.click_testid("hud-btn-item")
  after = h.run_sim_js("return getPlayer(api.stepFrames(3), 'p1');")
  assert after["state"] == "alive" and after["needles"] == 2, after
  h.set_viewport(1280, 800, mobile=False, touch=False)


@_t2("2A_edge_cases_e01_e15")
def test_e07_needle_pressed_with_zero_needles_while_trapped_stays_trapped(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2012,
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
      pulseDropBubble('p1');
      let st = api.stepFrames(185);
      for (let i = 0; i < 5; i++) st = pulseUseItem('p1');
      const p1 = getPlayer(st, 'p1');
      return { state: p1.state, needles: p1.needles };
      """
  )
  assert res["state"] == "trapped" and res["needles"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e08_simultaneous_ally_rescue_and_enemy_pop_ally_wins_tiebreak(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place bot1 (Blue, team 0) at (7, 6) to be trapped.
      // Place p1 (Blue ally, team 0) at (5, 6) and bot2 (Red enemy, team 1) EXACTLY overlapping (7, 6) AFTER trap?
      // Better: use p2Enabled = true? No, we want one Blue rescuer and one Red enemy touching trapped target on the EXACT same tick!
      // How? Spawn trapped target 'bot1' (Blue) at (7, 6), 'p1' (Blue, miduo speed 5.0) and 'bot2' (Red, active AI hunting trapped prey OR equidistant)!
      // Even cleaner & 100% deterministic: spawn bot1 (Blue) AND bot2 (Red, shielded!) BOTH on (7, 6) when blast hits (7, 6)?
      // Wait: if bot2 is shielded on (7, 6), on the tick after blast hits (7, 6), bot2 is ALREADY touching bot1 before ally arrives!
      // Instead: put bot1 (Blue) at (7, 6), drop bubble at (7, 5) so blast goes N/S/E/W:
      // Wait: if p1 (Blue, speed 5.0) stands at x = 6.50, z = 6.50 and an enemy 'bot2' (Red, active AI) stands at x = 8.50, z = 6.50:
      // Let's verify: when bot1 at (7.5, 6.5) is trapped and blast clears, active Red bot2 walks West toward (7.5, 6.5) at its speed while p1 walks East matched frame-for-frame so BOTH cross PLAYER_CONTACT_DIST (0.76) on the EXACT same tick!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // speed 5.0
        seed: 2013,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 7, row: 6, team: 0 }, // Target Blue teammate at (7.5, 6.5)
          { id: 'bot2', col: 7, row: 6, team: 1 }, // Wait: what if p1, bot1, and bot2 overlap?
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      // Let's place bot2 at (8, 6) with shield so blast at (7, 6) breaks bot2's shield (bot2 stays alive at 8.5, 6.5, distance 1.0 > 0.76!) while trapping bot1 at (7.5, 6.5)!
      // Wait: if p1 is ALSO at (6, 6) (6.5, 6.5, distance 1.0 > 0.76!) with shield, BOTH p1 (6.5) and bot2 (8.5) stay alive at distance 1.0!
      // Then if trapped bot1 wasn't human... wait: what if p1 IS the trapped Blue player at (7.5, 6.5), p2 (Blue human, speed 5.0) is at (5, 6), and active bot2?
      // EVEN BETTER! If P1 IS the trapped Blue player at (7.5, 6.5), P1 can drift while trapped (`0.22x` speed)!
      // Wait: if bot1 (Blue) at (6.5, 6.5) and bot2 (Red) at (8.5, 6.5) are stationary at distance 2.0 apart, P1 can't touch both simultaneously because 8.5 - 6.5 = 2.0 > 2 * 0.76 (1.52)!
      // WHAT IF bot1 (Blue, shielded) is at (7, 5) (7.5, 5.5 -> dist 1.0 North of 7.5, 6.5) AND bot2 (Red, shielded) is at (8, 6) (8.5, 6.5 -> dist 1.0 East of 7.5, 6.5)?!
      // LOOK AT THE GEOMETRY OF (7.5, 5.5) AND (8.5, 6.5):
      // Their midpoint is (8.0, 6.0)!
      // Distance from (8.0, 6.0) to (7.5, 5.5) = hypot(0.5, 0.5) = 0.7071 < 0.76 (PLAYER_CONTACT_DIST)!!
      // Distance from (8.0, 6.0) to (8.5, 6.5) = hypot(0.5, 0.5) = 0.7071 < 0.76 (PLAYER_CONTACT_DIST)!!
      // AND BOTH distances are IDENTICAL (0.7071) so trapped P1 drifting Northeast (+1, -1) from (7.5, 6.5) toward (8.0, 6.0) crosses `dist <= 0.76` with BOTH stationary shielded Ally `bot1` AND stationary shielded Enemy `bot2` on the EXACT SAME SIMULATION TICK!!
      // GENIUS!! Pure Euclidean symmetry! Let's run that exact setup!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2013,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },   // (7.5, 6.5) -> will be trapped!
          { id: 'bot1', col: 7, row: 5, team: 0 }, // (7.5, 5.5) -> Blue Ally (gets shield)
          { id: 'bot2', col: 8, row: 6, team: 1 }, // (8.5, 6.5) -> Red Rival (gets shield)
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          bot1: { hasShield: true },
          bot2: { hasShield: true },
        },
        customPickups: [
          { type: 'shield', col: 7, row: 5 },
          { type: 'shield', col: 8, row: 6 },
        ],
      });
      api.setDeterministicMode(true);
      // Step 2 frames so bot1/bot2 also collect floor shields if startingLoadout only keyed p1
      api.stepFrames(2);
      // Drop bubble on p1 at (7, 6) and wait until p1 is 'trapped' while bot1 & bot2 stay 'alive' (shields absorb!)
      pulseDropBubble('p1');
      let st = api.getState();
      for (let i = 0; i < 190; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'p1').state === 'trapped') break;
      }
      const midStates = {
        p1: getPlayer(st, 'p1').state,
        ally: getPlayer(st, 'bot1').state,
        enemy: getPlayer(st, 'bot2').state,
      };
      // Now trapped p1 drifts diagonally Northeast (moveX: +1, moveZ: -1) along the exact symmetry line x - 7.5 = 6.5 - z!
      // At every single tick, dist(p1, bot1) === dist(p1, bot2) to 15 decimal places!
      api.setPlayerInput('p1', { moveX: 1, moveZ: -1, dropBubble: false, useItem: false });
      for (let i = 0; i < 60; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'p1').state !== 'trapped') break;
      }
      clearInput('p1');
      const endP1 = getPlayer(st, 'p1');
      return {
        midStates,
        endState: endP1.state,
        invuln: endP1.invulnTimer,
        allyRescues: getPlayer(st, 'bot1').stats.rescues,
        enemyKos: getPlayer(st, 'bot2').stats.kos,
      };
      """
  )
  assert res["midStates"] == {"p1": "trapped", "ally": "alive", "enemy": "alive"}, res
  assert res["endState"] == "alive", f"Ally rescue MUST win exact same-tick tie over enemy pop! {res}"
  assert res["allyRescues"] >= 1 and res["enemyKos"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e09a_sliding_kicked_bubble_halts_cleanly_before_character_and_walls(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place bot2 at (9, 6). p1 kicks bubble East from (5, 6) -> must halt cleanly on (8, 6) BEFORE bot2!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2014,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 9, row: 6, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'kick', col: 4, row: 6 }],
      });
      api.setDeterministicMode(true);
      // Collect kick at (4, 6), step to (5, 6), drop bubble, step West to solidify, kick East!
      steerToWorld('p1', 'p1', 5.5, 6.5, 50);
      pulseDropBubble('p1');
      moveHold('p1', -1, 0, 20);
      moveHold('p1', 1, 0, 25); // Kick!
      const st = api.stepFrames(35);
      const b = st.sim.bubbles[0];
      const bot2 = getPlayer(st, 'bot2');
      return { bCol: b.col, bRow: b.row, bX: b.x, sliding: b.sliding, bot2Col: bot2.col };
      """
  )
  assert res["bCol"] == 8 and res["bRow"] == 6 and res["sliding"] is False, res
  assert abs(res["bX"] - 8.5) < 0.15, res


@_t2("2A_edge_cases_e01_e15")
def test_e09b_sliding_kicked_bubble_chain_detonates_on_entering_active_blast(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Bubble A placed at (8, 4) (range 2 -> South ray covers (8, 5) and (8, 6) for 0.40s!).
      // Shortly before A detonates, p1 kicks fresh Bubble B East along row 6 from (5, 6) into (8, 6)!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang', // 2 bubbles
        seed: 2015,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 8, row: 4, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'power', col: 7, row: 4 },
          { type: 'kick', col: 6, row: 4 },
        ],
      });
      api.setDeterministicMode(true);
      // Collect power + kick first, return to (8, 4)
      steerToWorld('p1', 'p1', 6.5, 4.5, 50);
      steerToWorld('p1', 'p1', 8.5, 4.5, 50);
      pulseDropBubble('p1'); // Bubble A at (8, 4), range 2 -> hits (8, 6) in 180 ticks!

      // Move to (5, 6) (~65 ticks), drop Bubble B at (5, 6) (fuse 3.0s!), step West to (4, 6) (~20 ticks)
      steerToWorld('p1', 'p1', 5.5, 4.5, 45);
      steerToWorld('p1', 'p1', 5.5, 6.5, 35);
      pulseDropBubble('p1'); // Bubble B at (5, 6) with fresh 3.0s fuse!
      moveHold('p1', -1, 0, 20); // Now at ~tick +102; wait until Bubble A is ~6 ticks from exploding!

      let st = api.getState();
      while (st.sim.bubbles.length === 2 && st.sim.bubbles[0].fuseRemaining > 0.12) {
        st = api.stepFrames(1);
      }
      // Now kick Bubble B East at 10 tiles/s (reaches col 8 in ~18 ticks, right inside Bubble A's 24-tick lingering blast at (8, 6)!)
      api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      let chainTriggeredMidSlide = false;
      for (let i = 0; i < 45; i++) {
        st = api.stepFrames(1);
        if (st.sim.bubbles.length === 0 && st.sim.blasts.length >= 1) {
          // Bubble B still had >2.0s on its own fuse, so bubbles.length === 0 proves instant chain detonation!
          chainTriggeredMidSlide = true;
          break;
        }
      }
      clearInput('p1');
      return { chainTriggeredMidSlide, bubblesLeft: st.sim.bubbles.length };
      """
  )
  assert res["chainTriggeredMidSlide"] is True and res["bubblesLeft"] == 0, res


@_t2("2A_edge_cases_e01_e15")
def test_e10_ai_bot_self_trap_prevention_in_dead_end_pocket(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Enclose bot1 inside a 2x1 HARD_WALL pocket at (1, 11) and (2, 11) where dropping a bubble has 0 safe escape tiles!
      const walls = [
        [0, 10], [1, 10], [2, 10], [3, 10],
        [0, 11],                   [3, 11],
        [0, 12], [1, 12], [2, 12], [3, 12],
      ];
      // Also isolate bot2 & bot3 far away behind walls so nothing external threatens bot1
      for (let r = 0; r < 13; r++) walls.push([9, r]);
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2016,
        botBehavior: 'active',
        customGrid: makeGrid({ walls }),
        customSpawns: [
          { id: 'p1', col: 5, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const st = api.stepFrames(240);
      const b1 = getPlayer(st, 'bot1');
      return { bubblesPlaced: b1.stats.bubblesPlaced, state: b1.state };
      """
  )
  assert res["bubblesPlaced"] == 0 and res["state"] == "alive", res


@_t2("2A_edge_cases_e01_e15")
def test_e11_bun_carrier_trapped_near_wall_drops_bun_on_valid_tile(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Surround (5, 6) with HARD_WALL on 3 sides and trap bun-carrying p1 at (5, 6)
      const g = makeGrid({
        walls: [[4, 6], [5, 5], [5, 7]],
        tiles: [[1, 6, 4], [6, 6, 3], [13, 6, 5]],
      });
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2017,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      // Walk West across shrine (6, 6) to pick up bun and stop at pocket (5, 6)
      let st = steerToWorld('p1', 'p1', 5.5, 6.5, 80, 0.2);
      const hadBun = getPlayer(st, 'p1').carryingBun;
      const looseBeforeTrap = st.sim.looseBuns.length;
      // Drop bubble on self inside pocket -> traps p1!
      pulseDropBubble('p1');
      for (let i = 0; i < 190; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'p1').state === 'trapped') break;
      }
      const p1 = getPlayer(st, 'p1');
      const droppedBuns = st.sim.looseBuns;
      const allValidTiles = droppedBuns.every(
        (b) => b.col >= 0 && b.col < 15 && b.row >= 0 && b.row < 13 &&
               st.sim.grid[b.row][b.col] !== 1 && st.sim.grid[b.row][b.col] !== 2
      );
      return {
        hadBun,
        state: p1.state,
        carryingAfterTrap: p1.carryingBun,
        looseBeforeTrap,
        looseAfterTrap: droppedBuns.length,
        allValidTiles,
      };
      """
  )
  assert res["hadBun"] is True and res["state"] == "trapped", res
  assert res["carryingAfterTrap"] is False, res
  assert res["looseAfterTrap"] > res["looseBeforeTrap"] and res["allValidTiles"] is True, res


@_t2("2A_edge_cases_e01_e15")
def test_e12_boss_golem_multi_tile_blast_hit_iframe_prevents_oneshot(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      let st = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'haiwangzi', // range 2
        seed: 2018,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 13, row: 11, team: 0 },
        ],
        startingLoadout: { p1: { blastRange: 5 } },
      });
      api.setDeterministicMode(true);
      const hp0 = st.sim.boss.hp;
      // Place bubble right next to boss when fuse is about to go, or use active team for 1st hit
      const b0 = st.sim.boss;
      steerToWorld('p1', 'p1', Math.max(1, b0.col - 1) + 0.5, b0.row + 0.5, 60, 0.25);
      pulseDropBubble('p1'); // High-range ray pierces BOTH columns of Boss's 2x2 footprint!
      moveHold('p1', -1, 0, 22);
      moveHold('p1', 0, 1, 22);

      let firstHitHp = hp0;
      let invulnOnHit = 0;
      for (let i = 0; i < 210; i++) {
        st = api.stepFrames(1);
        if (st.sim.boss.hp < hp0 && firstHitHp === hp0) {
          firstHitHp = st.sim.boss.hp;
          invulnOnHit = st.sim.boss.invulnTimer;
        }
      }
      // Step through full 0.40s blast linger to verify lingering frames don't drain Boss to 0 HP!
      st = api.stepFrames(30);
      return { hp0, firstHitHp, hpAfterLinger: st.sim.boss.hp, invulnOnHit };
      """
  )
  if res["firstHitHp"] < res["hp0"]:
    damage = res["hp0"] - res["hpAfterLinger"]
    assert 1 <= damage <= 2, f"Single explosion must NOT multi-hit/one-shot Boss! {res}"
    assert res["invulnOnHit"] > 0.2, res
  else:
    # Boss patrolled out of single ray; verify across active combat that no single tick drops >2 HP
    check = h.run_sim_js(
        """
        let st = api.startMatch({
          modeId: 'boss_golem',
          arenaId: 'candy_town',
          p1CharacterId: 'haiwangzi',
          seed: 2018,
          botBehavior: 'active',
        });
        api.setDeterministicMode(true);
        api.setAutoPlayP1(true);
        let prevHp = st.sim.boss.hp;
        let maxSingleTickDrop = 0;
        let hitObserved = false;
        for (let i = 0; i < 600; i++) {
          st = api.stepFrames(1);
          const drop = prevHp - st.sim.boss.hp;
          if (drop > 0) {
            hitObserved = true;
            maxSingleTickDrop = Math.max(maxSingleTickDrop, drop);
          }
          prevHp = st.sim.boss.hp;
        }
        api.setAutoPlayP1(false);
        return { hitObserved, maxSingleTickDrop };
        """
    )
    assert check["hitObserved"] is True and 1 <= check["maxSingleTickDrop"] <= 2, check


# ==============================================================================
# Part 2: Stat Caps, State Guards, Determinism & Negative Inputs (18 tests)
# ==============================================================================


@_t2("2B_stat_caps_and_guards")
def test_boundary_sugar_bubble_stat_cap_clamped(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const pickups = Array.from({ length: 10 }, (_, i) => ({ type: 'bubble', col: 2 + i, row: 6 }));
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // cap = 7
        seed: 2101,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 1, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: pickups,
      });
      api.setDeterministicMode(true);
      const st = moveHold('p1', 1, 0, 140);
      return { maxBubbles: getPlayer(st, 'p1').maxBubbles, pickupsLeft: st.sim.pickups.length };
      """
  )
  assert 6 <= res["maxBubbles"] <= 8 and res["pickupsLeft"] == 0, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_power_syrup_stat_cap_clamped(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const pickups = Array.from({ length: 10 }, (_, i) => ({ type: 'power', col: 2 + i, row: 6 }));
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'wanzi', // cap = 6
        seed: 2102,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 1, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: pickups,
      });
      api.setDeterministicMode(true);
      const st = moveHold('p1', 1, 0, 140);
      return { blastRange: getPlayer(st, 'p1').blastRange, pickupsLeft: st.sim.pickups.length };
      """
  )
  assert 6 <= res["blastRange"] <= 8 and res["pickupsLeft"] == 0, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_roller_skates_stat_cap_clamped_no_wall_tunneling(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place a 1-tile-thick vertical HARD_WALL barrier at col = 12 across all rows!
      const walls = Array.from({ length: 13 }, (_, r) => [12, r]);
      const pickups = Array.from({ length: 10 }, (_, i) => ({ type: 'speed', col: 2 + i, row: 6 }));
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'wanzi', // fastest cap = 8.0
        seed: 2103,
        botBehavior: 'idle',
        customGrid: makeGrid({ walls }),
        customSpawns: [
          { id: 'p1', col: 1, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: pickups,
      });
      api.setDeterministicMode(true);
      // Sprint full-tilt East into the 1-tile wall at col 12 for 180 frames!
      const st = moveHold('p1', 1, 0, 180);
      const p1 = getPlayer(st, 'p1');
      return { baseSpeed: p1.baseSpeed, col: p1.col, x: p1.x };
      """
  )
  assert res["baseSpeed"] <= 8.05, res
  assert res["col"] <= 11 and res["x"] < 12.0, f"High-speed character tunneled through wall! {res}"


@_t2("2B_stat_caps_and_guards")
def test_boundary_needle_inventory_cap_at_three(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const pickups = Array.from({ length: 6 }, (_, i) => ({ type: 'needle', col: 2 + i, row: 6 }));
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2104,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 1, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: pickups,
      });
      api.setDeterministicMode(true);
      const st = moveHold('p1', 1, 0, 100);
      return { needles: getPlayer(st, 'p1').needles, pickupsLeft: st.sim.pickups.length };
      """
  )
  assert res["needles"] == 3 and res["pickupsLeft"] == 0, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_trapped_player_cannot_drop_bubbles_or_kick(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // p1 has Kick + 3 Bubbles; gets trapped at (5, 6), while p2 drops a solid bubble at (6, 6).
      // Trapped p1 attempts to drop a bubble AND drifts into (6, 6) trying to kick it!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        p2CharacterId: 'miduo',
        p2Enabled: true,
        seed: 2105,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'p2', col: 6, row: 4, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'kick', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      steerToWorld('p1', 'p1', 5.5, 6.5, 45); // p1 centered at (5, 6) with canKick = true
      pulseDropBubble('p1');
      let st = api.stepFrames(210); // 180 fuse + >24 linger: p1 is 'trapped' at (5, 6) and ray cleared

      // p2 walks to (6, 6), drops a bubble, and exits North so p2 avoids rescuing p1
      steerToWorld('p2', 'p2', 6.5, 6.5, 50);
      pulseDropBubble('p2');
      steerToWorld('p2', 'p2', 6.5, 4.5, 40);

      // Trapped p1 presses dropBubble AND moves East against (6, 6)
      st = pulseDropBubble('p1', 1, 0);
      st = moveHold('p1', 1, 0, 35);
      const bOnSix = st.sim.bubbles.find((b) => b.ownerId === 'p2');
      const p1Bubbles = st.sim.bubbles.filter((b) => b.ownerId === 'p1').length;
      return {
        p1State: getPlayer(st, 'p1').state,
        p1Bubbles,
        p2BubbleCol: bOnSix?.col,
        p2BubbleSliding: bOnSix?.sliding,
      };
      """
  )
  assert res["p1State"] == "trapped" and res["p1Bubbles"] == 0, res
  assert res["p2BubbleCol"] == 6 and res["p2BubbleSliding"] is False, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_eliminated_player_ignores_movement_bubble_and_item_inputs(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2106,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 }, // keeps match alive!
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      let st = api.stepFrames(530); // 180 fuse + 330 trap timeout -> p1 is 'eliminated'!
      const dead0 = getPlayer(st, 'p1');
      // Try moving, dropping bubbles, and using items while eliminated
      st = pulseDropBubble('p1', 1, 1);
      st = pulseUseItem('p1', 1, 1);
      st = moveHold('p1', 1, 0, 30);
      const dead1 = getPlayer(st, 'p1');
      return {
        state0: dead0.state,
        state1: dead1.state,
        moved: Math.hypot(dead1.x - dead0.x, dead1.z - dead0.z),
        bubbles: st.sim.bubbles.length,
        matchPhase: st.sim.phase,
      };
      """
  )
  assert res["state0"] == "eliminated" and res["state1"] == "eliminated", res
  assert res["moved"] == 0 and res["bubbles"] == 0 and res["matchPhase"] == "playing", res


@_t2("2B_stat_caps_and_guards")
def test_boundary_two_trapped_opponents_touching_do_not_pop_each_other(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // range 2
        seed: 2107,
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
      pulseDropBubble('p1'); // Traps BOTH p1 at (5,6) and bot2 at (6,6)!
      let st = api.stepFrames(185);
      // Drift trapped p1 East right onto trapped bot2!
      st = moveHold('p1', 1, 0, 65);
      const p1 = getPlayer(st, 'p1');
      const b2 = getPlayer(st, 'bot2');
      return {
        dist: Math.hypot(p1.x - b2.x, p1.z - b2.z),
        p1State: p1.state,
        b2State: b2.state,
      };
      """
  )
  assert res["dist"] < 0.72, res
  assert res["p1State"] == "trapped" and res["b2State"] == "trapped", res


@_t2("2B_stat_caps_and_guards")
def test_boundary_re_hitting_already_trapped_player_with_blast_does_not_pop_or_reset_timer_up(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang', // 2 bubbles, range 1
        seed: 2108,
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
      // Bubble 1 at (5, 6) -> traps bot2 at t = 180 while p1 dodges off-axis to (4, 5)
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', 5.5, 5.5, 30);
      steerToWorld('p1', 'p1', 4.5, 5.5, 30);
      let st1 = api.getState();
      while (st1.sim.bubbles.length > 0 || st1.sim.blasts.length > 0) {
        st1 = api.stepFrames(1);
      }
      api.stepFrames(60); // let bot2's trapTimer drop by ~1.0s before dropping Bubble 2
      steerToWorld('p1', 'p1', 6.5, 5.5, 45);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', 6.5, 4.5, 30);
      steerToWorld('p1', 'p1', 5.5, 4.5, 30);

      let timerBeforeHit2 = 0;
      let timerAfterHit2 = 0;
      let stateAfterHit2 = '';
      for (let i = 0; i < 200; i++) {
        const prev = getPlayer(api.getState(), 'bot2');
        const st = api.stepFrames(1);
        const cur = getPlayer(st, 'bot2');
        if (st.sim.blasts.length > 0) {
          timerBeforeHit2 = prev.trapTimer;
          timerAfterHit2 = cur.trapTimer;
          stateAfterHit2 = cur.state;
          break;
        }
      }
      return { timerBeforeHit2, timerAfterHit2, stateAfterHit2 };
      """
  )
  assert res["stateAfterHit2"] == "trapped", res
  assert res["timerAfterHit2"] <= res["timerBeforeHit2"] + 0.02, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_cannot_drop_second_bubble_on_already_occupied_bubble_tile(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang', // maxBubbles = 2
        seed: 2109,
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
      pulseDropBubble('p1');
      api.stepFrames(3);
      const st = pulseDropBubble('p1'); // Still standing on (6, 6)!
      return { count: st.sim.bubbles.length, active: getPlayer(st, 'p1').activeBubbles };
      """
  )
  assert res["count"] == 1 and res["active"] == 1, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_cannot_kick_own_unsolidified_walkoff_bubble(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2110,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [{ type: 'kick', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      moveHold('p1', 1, 0, 18); // p1 at (5, 6) with canKick = true
      pulseDropBubble('p1');    // Drop at (5, 6) while p1 overlaps it
      // Walk East off the bubble: must NOT kick the bubble while still walking off!
      const st = moveHold('p1', 1, 0, 22);
      const b = st.sim.bubbles[0];
      return { bCol: b.col, sliding: b.sliding, p1Col: getPlayer(st, 'p1').col };
      """
  )
  assert res["bCol"] == 5 and res["sliding"] is False and res["p1Col"] >= 6, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_ufo_dismount_over_soft_block_never_wedges_rider(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const g = makeGrid({ softBlocks: [[6, 6]] });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'miduo',
        p2Enabled: true,
        seed: 2111,
        botBehavior: 'idle',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0, characterId: 'miduo' },
          { id: 'p2', col: 6, row: 4, team: 0, characterId: 'haiwangzi' },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p2: { blastRange: 3 },
        },
        customPickups: [{ type: 'ufo', col: 5, row: 6 }],
      });
      api.setDeterministicMode(true);
      // p2 drops bubble at (6, 4) (range 3 reaches (6, 6)) and exits East
      pulseDropBubble('p2');
      moveHold('p2', 1, 0, 24);
      // p1 mounts UFO at (5, 6) and hovers right atop SOFT_BLOCK (6, 6)!
      steerToWorld('p1', 'p1', 6.5, 6.5, 45, 0.08);
      const onSoftWhileMounted = api.getState().sim.grid[6][6] === 2 && getPlayer(api.getState(), 'p1').mount === 'ufo';

      // Wait until p2's bubble detonates and dismounts p1
      let st = api.getState();
      while (st.sim.bubbles.length > 0) {
        st = api.stepFrames(1);
      }
      st = api.stepFrames(2);
      const pAfterDismount = getPlayer(st, 'p1');
      // Verify p1 is NOT wedged: walk East 2 tiles to col >= 8!
      st = moveHold('p1', 1, 0, 35);
      const pWalkedAway = getPlayer(st, 'p1');
      return {
        onSoftWhileMounted,
        mountAfter: pAfterDismount.mount,
        stateAfter: pAfterDismount.state,
        colWalkedAway: pWalkedAway.col,
      };
      """
  )
  assert res["onSoftWhileMounted"] is True, res
  assert res["mountAfter"] is None and res["stateAfter"] == "alive", res
  assert res["colWalkedAway"] >= 8, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_mount_replacement_turtle_to_ufo_and_back(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2112,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'turtle', col: 3, row: 6 },
          { type: 'ufo', col: 4, row: 6 },
          { type: 'turtle', col: 5, row: 6 },
        ],
      });
      api.setDeterministicMode(true);
      const s1 = steerToWorld('p1', 'p1', 3.5, 6.5, 40);
      const m1 = getPlayer(s1, 'p1').mount;
      const spd1 = getPlayer(s1, 'p1').effectiveSpeed;
      const s2 = steerToWorld('p1', 'p1', 4.5, 6.5, 40);
      const m2 = getPlayer(s2, 'p1').mount;
      const spd2 = getPlayer(s2, 'p1').effectiveSpeed;
      const s3 = steerToWorld('p1', 'p1', 5.5, 6.5, 40);
      const m3 = getPlayer(s3, 'p1').mount;
      const spd3 = getPlayer(s3, 'p1').effectiveSpeed;
      return { m1, spd1, m2, spd2, m3, spd3 };
      """
  )
  assert res["m1"] == "turtle" and res["m2"] == "ufo" and res["m3"] == "turtle", res
  assert res["spd2"] > res["spd1"] + 2.0 and abs(res["spd3"] - res["spd1"]) < 0.05, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_trapped_player_cannot_collect_mounts_or_pickups(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2113,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        // Put UFO and Shield outside blast range (at cols 7 and 8)
        customPickups: [
          { type: 'ufo', col: 7, row: 6 },
          { type: 'shield', col: 8, row: 6 },
        ],
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      let st = api.stepFrames(185); // p1 trapped at (4, 6)
      // Drift trapped p1 East across (7, 6) and (8, 6) (~240 frames at ~1.1 tiles/s)
      st = moveHold('p1', 1, 0, 240);
      const p1 = getPlayer(st, 'p1');
      return {
        state: p1.state,
        col: p1.col,
        mount: p1.mount,
        hasShield: p1.hasShield,
        pickupsLeft: st.sim.pickups.length,
      };
      """
  )
  assert res["state"] == "trapped" and res["col"] >= 7, res
  assert res["mount"] is None and res["hasShield"] is False and res["pickupsLeft"] == 2, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_classic_2v2_timer_expiry_resolves_cleanly_without_softlock(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2114,
        botBehavior: 'idle',
        customGrid: makeGrid(),
      });
      api.setDeterministicMode(true);
      // Advance full 150s (9000 ticks) in 300-frame chunks
      let st = api.getState();
      for (let i = 0; i < 32 && st.sim.phase === 'playing'; i++) {
        st = api.stepFrames(300);
      }
      return {
        phase: st.sim.phase,
        timeRemainingSec: st.sim.timeRemainingSec,
        rankingsLen: st.sim.rankings.length,
        uiScreen: st.uiScreen,
      };
      """
  )
  assert res["phase"] in ("victory", "defeat", "draw"), res
  assert res["timeRemainingSec"] <= 0.05 and res["rankingsLen"] == 4, res
  assert res["uiScreen"] == "podium", res


@_t2("2B_stat_caps_and_guards")
def test_boundary_deterministic_seed_replay_produces_identical_snapshot(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      function runSeeded() {
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'pirate_bay',
          p1CharacterId: 'haiwangzi',
          seed: 20261028,
          botBehavior: 'active',
        });
        api.setDeterministicMode(true);
        api.setAutoPlayP1(true);
        const st = api.stepFrames(300);
        api.setAutoPlayP1(false);
        return {
          players: st.sim.players.map((p) => ({
            id: p.id, x: +p.x.toFixed(5), z: +p.z.toFixed(5), state: p.state, bubblesPlaced: p.stats.bubblesPlaced,
          })),
          grid: st.sim.grid,
          pickups: st.sim.pickups.map((pk) => ({ type: pk.type, col: pk.col, row: pk.row })),
        };
      }
      const runA = runSeeded();
      const runB = runSeeded();
      return { equal: JSON.stringify(runA) === JSON.stringify(runB), runA, runB };
      """
  )
  assert res["equal"] is True, res


@_t2("2B_stat_caps_and_guards")
def test_boundary_different_seeds_produce_divergent_loot_or_ai_trajectories(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      function snapForSeed(seed) {
        const st0 = api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: 'miduo',
          seed,
          botBehavior: 'active',
        });
        api.setDeterministicMode(true);
        api.setAutoPlayP1(true);
        const gridStr = JSON.stringify(st0.sim.grid);
        const stEnd = api.stepFrames(300);
        api.setAutoPlayP1(false);
        const posStr = JSON.stringify(stEnd.sim.players.map((p) => [p.x.toFixed(3), p.z.toFixed(3)]));
        return { gridStr, posStr };
      }
      const a = snapForSeed(101);
      const b = snapForSeed(99999);
      return { gridDiff: a.gridStr !== b.gridStr, posDiff: a.posStr !== b.posStr };
      """
  )
  assert res["gridDiff"] is True or res["posDiff"] is True, res


@_t2("2B_stat_caps_and_guards")
def test_negative_invalid_and_extreme_player_inputs_clamped_gracefully(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo', // baseSpeed = 5.0 -> max 1-tick step = 5/60 ≈ 0.0833 tiles!
        seed: 2117,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const p0 = getPlayer(api.getState(), 'p1');
      // Extreme / malformed values must NOT teleport p1 or produce NaN!
      api.setPlayerInput('p1', { moveX: 99999, moveZ: -99999, dropBubble: null, useItem: undefined });
      api.setPlayerInput('nonexistent_slot', { moveX: 1, moveZ: 1, dropBubble: true, useItem: true });
      api.stepFrames(0);
      const st1 = api.stepFrames(1);
      const p1 = getPlayer(st1, 'p1');
      clearInput('p1');
      const disp = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      return {
        finite: Number.isFinite(p1.x) && Number.isFinite(p1.z),
        disp,
        inBounds: p1.x >= 0 && p1.x <= 15 && p1.z >= 0 && p1.z <= 13,
      };
      """
  )
  assert res["finite"] is True and res["inBounds"] is True, res
  assert res["disp"] < 0.20, f"Extreme moveX=99999 must be clamped to character speed, got disp={res['disp']}"


@_t2("2B_stat_caps_and_guards")
def test_e15_webaudio_before_user_gesture_produces_zero_unhandled_rejections(
    h: QQTangTestHarness,
) -> None:
  h.clear_diagnostics()
  h.navigate("about:blank", wait_qqtang=False)
  h.navigate(wait_qqtang=True)
  # Without ANY click or key gesture, programmatically start match & trigger SFX/BGM!
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2118,
        botBehavior: 'active',
      });
      api.setDeterministicMode(true);
      pulseDropBubble('p1');
      api.stepFrames(190);
      return true;
      """
  )
  h.assert_zero_errors("e15-pre-gesture-webaudio")


# ==============================================================================
# Part 3: Static ES Module, Subpath Hosting, HUD Structure & Hygiene (12 tests)
# ==============================================================================


@_t2("2C_static_compat_and_hygiene")
def test_static_ac6_zero_importmap_tags_in_html(h: QQTangTestHarness) -> None:
  html_files = list(h.root_dir.glob("*.html")) + list((h.root_dir / "src").rglob("*.html") if (h.root_dir / "src").exists() else [])
  assert html_files, f"Expected index.html in {h.root_dir}"
  importmap_re = re.compile(r"""<script[^>]*type\s*=\s*['"]?importmap['"]?""", re.IGNORECASE)
  for hf in html_files:
    txt = hf.read_text(encoding="utf-8")
    assert not importmap_re.search(txt), f'Forbidden <script type="importmap"> found in {hf}'


@_t2("2C_static_compat_and_hygiene")
def test_static_ac6_zero_bare_es_module_specifiers_in_all_js(h: QQTangTestHarness) -> None:
  js_files: list = []
  for sub in ("src", "vendor"):
    d = h.root_dir / sub
    if d.exists():
      js_files.extend(sorted(d.rglob("*.js")))
  assert js_files, "Expected JS modules under src/ and vendor/"
  violations: list[str] = []
  for jf in js_files:
    specs = extract_es_module_specifiers(jf.read_text(encoding="utf-8"))
    for sp in specs:
      if not (sp.startswith("./") or sp.startswith("../")):
        violations.append(f"{jf.relative_to(h.root_dir)} -> {sp!r}")
  assert not violations, f"Forbidden bare/non-relative ES module specifiers found: {violations}"


@_t2("2C_static_compat_and_hygiene")
def test_static_vendor_three_module_is_self_contained_zero_internal_imports(
    h: QQTangTestHarness,
) -> None:
  three_path = h.root_dir / "vendor" / "three.module.min.js"
  assert three_path.is_file(), f"Missing {three_path}"
  size = three_path.stat().st_size
  assert size > 400_000, f"Unexpectedly small three.module.min.js: {size} B"
  specs = extract_es_module_specifiers(three_path.read_text(encoding="utf-8"))
  assert specs == [], f"Expected 0 external imports in three.module.min.js, found {specs}"


@_t2("2C_static_compat_and_hygiene")
def test_static_sim_and_ai_modules_have_zero_dom_three_or_audio_imports(
    h: QQTangTestHarness,
) -> None:
  forbidden_patterns = ("three", "/render/", "/ui/", "/audio/", "document.", "window.")
  checked = 0
  for sub in ("src/sim", "src/ai", "src/contracts"):
    d = h.root_dir / sub
    if not d.exists():
      continue
    for jf in sorted(d.glob("*.js")):
      checked += 1
      raw = jf.read_text(encoding="utf-8")
      # Strip comments before checking for DOM/Three imports
      no_comments = re.sub(r"//[^\n]*|/\*[\s\S]*?\*/", "", raw)
      specs = extract_es_module_specifiers(raw)
      for sp in specs:
        for pat in ("three", "render", "ui", "audio"):
          assert pat not in sp, f"Pure sim module {jf.name} imports {sp!r}"
      for dom_tok in ("document.", "window.", "AudioContext"):
        assert dom_tok not in no_comments, f"Pure sim module {jf.name} references {dom_tok}"
  assert checked >= 8, f"Expected >=8 pure sim/ai/contract modules, checked {checked}"


@_t2("2C_static_compat_and_hygiene")
def test_static_zero_root_absolute_asset_paths_in_html_and_css(
    h: QQTangTestHarness,
) -> None:
  index_html = h.root_dir / "index.html"
  assert index_html.is_file(), "Missing index.html"
  html_txt = index_html.read_text(encoding="utf-8")
  # Forbid src="/...", href="/..." (allow data: or relative ./...)
  bad_html = re.findall(r"""\b(?:src|href)\s*=\s*['"](/[^/'"]+)['"]""", html_txt)
  assert not bad_html, f"Root-absolute paths in index.html break /qq-tang-3d/ subpath: {bad_html}"

  styles_dir = h.root_dir / "styles"
  if styles_dir.exists():
    for cf in styles_dir.rglob("*.css"):
      css_txt = cf.read_text(encoding="utf-8")
      bad_css = re.findall(r"""url\(\s*['"]?(/[^)'"\s]+)['"]?\s*\)""", css_txt)
      assert not bad_css, f"Root-absolute url() in {cf.name}: {bad_css}"


@_t2("2C_static_compat_and_hygiene")
def test_subpath_hosting_github_pages_simulation_zero_404s(h: QQTangTestHarness) -> None:
  sub_srv = RecordedStaticHTTPServer(h.root_dir, strict_subpath="/qq-tang-3d").start()
  try:
    h.clear_diagnostics()
    h.set_viewport(1280, 800, mobile=False, touch=False)
    h.navigate(sub_srv.base_url, wait_qqtang=True)
    h.click_testid("btn-play")
    h.click_testid("btn-start-match")
    st = h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(30)")
    assert st["uiScreen"] == "playing" and st["render"]["webgl2"] is True, st
    sub_errs = sub_srv.get_error_records(ignore_favicon=True)
    assert sub_errs == [], f"Subpath /qq-tang-3d/ produced HTTP errors: {sub_errs}"
    h.assert_zero_errors("subpath-github-pages")
  finally:
    sub_srv.close()
    h.navigate(h.http_server.base_url, wait_qqtang=True)


@_t2("2C_static_compat_and_hygiene")
def test_static_no_cheat_backdoor_methods_on_window_qqtang(h: QQTangTestHarness) -> None:
  _ensure_loaded(h)
  keys = h.eval_js("Object.keys(window.__QQTANG__ || window.__QQ_TANG__)")
  banned = {"forceTrap", "forceKill", "forceWin", "teleport", "setBossHp", "instantWin"}
  found = banned.intersection(set(keys))
  assert not found, f"Banned cheat backdoors exposed on window.__QQTANG__: {found}"


@_t2("2C_static_compat_and_hygiene")
def test_e13_virtual_joystick_is_single_unified_control_zero_child_buttons(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1024, 768, mobile=True, touch=True)
  h.navigate(wait_qqtang=True)
  h.click_testid("btn-play")
  h.click_testid("btn-start-match")
  info = h.eval_js(
      """(() => {
        const el = document.querySelector('[data-testid="hud-joystick"]');
        if (!el) return null;
        return {
          role: el.getAttribute('role'),
          childButtons: el.querySelectorAll('button, a, [role="button"]').length,
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
        };
      })()"""
  )
  assert info is not None, "Missing [data-testid='hud-joystick']"
  assert info["role"] == "slider", info
  assert info["childButtons"] == 0, f"Joystick MUST have 0 child buttons (E13): {info}"
  assert info["width"] >= 64 and info["height"] >= 64, info
  h.set_viewport(1280, 800, mobile=False, touch=False)


@_t2("2C_static_compat_and_hygiene")
def test_e13_non_playing_overlays_strictly_hidden_during_active_match(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2209,
        botBehavior: 'idle',
      });
      return true;
      """
  )
  non_playing_testids = [
      "btn-play",
      "char-card-miduo",
      "arena-card-candy_town",
      "mode-card-classic_2v2",
      "btn-start-match",
      "btn-resume",
      "btn-restart",
      "podium-overlay",
      "btn-play-again",
  ]
  for tid in non_playing_testids:
    rect = h.get_testid_rect(tid)
    assert rect is None or rect["visible"] is False, (
        f"Non-playing control {tid!r} leaked visibly during active match: {rect}"
    )


@_t2("2C_static_compat_and_hygiene")
def test_e14_camera_distance_and_fov_adapt_between_landscape_and_portrait(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.set_viewport(1280, 800, mobile=False, touch=False)
  land = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 2210,
        botBehavior: 'idle',
      });
      api.setDeterministicMode(true);
      return api.stepFrames(2).render;
      """
  )
  h.set_viewport(390, 844, mobile=True, touch=True)
  port = h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(2).render")
  assert (
      port["cameraDistance"] > land["cameraDistance"] + 1.0
      or port["cameraFov"] > land["cameraFov"] + 2.0
  ), f"Camera must adapt for narrow 390x844 portrait: land={land}, port={port}"
  assert port["viewportWidth"] == 390 and port["viewportHeight"] == 844, port
  h.set_viewport(1280, 800, mobile=False, touch=False)


@_t2("2C_static_compat_and_hygiene")
def test_gitignore_excludes_internal_agents_and_test_metadata(
    h: QQTangTestHarness,
) -> None:
  gi = h.root_dir / ".gitignore"
  assert gi.is_file(), "Missing .gitignore at project root"
  txt = gi.read_text(encoding="utf-8")
  assert ".agents/" in txt or ".agents" in txt, f".gitignore must exclude .agents/: {txt}"


@_t2("2C_static_compat_and_hygiene")
def test_zero_secrets_or_tokens_in_project_files(h: QQTangTestHarness) -> None:
  secret_re = re.compile(r"\b(?:gho_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")
  hits: list[str] = []
  for p in h.root_dir.rglob("*"):
    rel_parts = p.relative_to(h.root_dir).parts
    if not p.is_file() or rel_parts[0] in (".git", ".agents", "__pycache__"):
      continue
    if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".pyc"):
      continue
    txt = p.read_text(encoding="utf-8", errors="ignore")
    if secret_re.search(txt):
      hits.append(str(p.relative_to(h.root_dir)))
  assert not hits, f"Leaked GitHub token pattern detected in files: {hits}"
