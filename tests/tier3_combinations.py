#!/usr/bin/env python3
"""Tier 3 Pairwise & Multi-Feature Interaction E2E Tests (32 test cases, >=30 req).

Exercises cross-feature interactions across damage mitigation stacks (Shield +
Turtle/UFO + Needle), Kick + BFS chain detonations + Soft-Block drops + Skated
KO pursuit, Bun Grab carry/mount/trap/rescue/respawn mechanics, Mechanical Golem
2-phase transitions/loot/telegraphs/shared-lives/victory, BotAI autonomous
rescue/pop/needle tactics, Desktop 2P shared-keyboard co-op, Pause/Podium UI
flows, and WebAudio mute persistence across modes.
"""

from __future__ import annotations

from typing import Callable

from harness import QQTangTestHarness, TestCaseSpec


TIER3_TESTS: list[TestCaseSpec] = []


def _t3(
    group: str,
) -> Callable[
    [Callable[[QQTangTestHarness], None]], Callable[[QQTangTestHarness], None]
]:
  def decorator(
      fn: Callable[[QQTangTestHarness], None],
  ) -> Callable[[QQTangTestHarness], None]:
    TIER3_TESTS.append(
        TestCaseSpec(tier=3, name=fn.__name__, group=group, fn=fn)
    )
    return fn

  return decorator


def _ensure_loaded(h: QQTangTestHarness) -> None:
  has_api = h.eval_js("Boolean(window.__QQTANG__ || window.__QQ_TANG__)")
  if not has_api:
    h.set_viewport(1280, 800, mobile=False, touch=False)
    h.navigate(wait_qqtang=True)


# ==============================================================================
# Group 3A: Damage Mitigation Stacks, Mounts & Stat Combos (6 tests)
# ==============================================================================


@_t3("3A_mitigation_and_kit_combos")
def test_t3_01_shield_plus_ufo_mount_absorbs_two_separate_blasts(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3001,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { hasShield: true, mount: 'ufo', maxBubbles: 2, blastRange: 2 },
        },
      });
      api.setDeterministicMode(true);
      const before = getPlayer(api.getState(), 'p1');

      // Blast #1 at (5, 6): Shield absorbs hit #1, UFO mount MUST stay intact!
      pulseDropBubble('p1');
      const afterHit1 = getPlayer(api.stepFrames(182), 'p1');

      // Wait out 1.1s shield-break invulnerability + lingering blast (90 frames = 1.5s)
      api.stepFrames(90);

      // Blast #2 at (5, 6): UFO mount absorbs hit #2, rider stays 'alive' & untrapped!
      pulseDropBubble('p1');
      const afterHit2 = getPlayer(api.stepFrames(182), 'p1');

      return {
        speedBefore: before.effectiveSpeed,
        afterHit1: {
          state: afterHit1.state,
          hasShield: afterHit1.hasShield,
          mount: afterHit1.mount,
          invuln: afterHit1.invulnTimer,
          speed: afterHit1.effectiveSpeed,
        },
        afterHit2: {
          state: afterHit2.state,
          hasShield: afterHit2.hasShield,
          mount: afterHit2.mount,
          invuln: afterHit2.invulnTimer,
          speed: afterHit2.effectiveSpeed,
        },
        baseSpeed: before.baseSpeed,
      };
      """
  )
  assert abs(res["speedBefore"] - 6.6) < 0.05, res
  assert res["afterHit1"]["state"] == "alive", res
  assert res["afterHit1"]["hasShield"] is False, res
  assert res["afterHit1"]["mount"] == "ufo", res
  assert res["afterHit1"]["invuln"] > 0.5, res
  assert abs(res["afterHit1"]["speed"] - 6.6) < 0.05, res

  assert res["afterHit2"]["state"] == "alive", res
  assert res["afterHit2"]["hasShield"] is False, res
  assert res["afterHit2"]["mount"] is None, res
  assert res["afterHit2"]["invuln"] > 0.5, res
  assert abs(res["afterHit2"]["speed"] - res["baseSpeed"]) < 0.05, res


@_t3("3A_mitigation_and_kit_combos")
def test_t3_02_shield_plus_turtle_plus_needle_survives_three_consecutive_blasts(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'pirate_bay',
        p1CharacterId: 'xiaoqiang',
        seed: 3002,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { hasShield: true, mount: 'turtle', needles: 2, blastRange: 2 },
        },
      });
      api.setDeterministicMode(true);

      // Blast 1 -> breaks Shield
      pulseDropBubble('p1');
      const s1 = getPlayer(api.stepFrames(182), 'p1');
      api.stepFrames(90);

      // Blast 2 -> breaks Turtle
      pulseDropBubble('p1');
      const s2 = getPlayer(api.stepFrames(182), 'p1');
      api.stepFrames(90);

      // Blast 3 -> traps P1 inside giant water bubble
      pulseDropBubble('p1');
      const s3 = getPlayer(api.stepFrames(182), 'p1');

      // Use Needle -> P1 pops out alive with 1 needle left and mercy invuln!
      const s4 = getPlayer(pulseUseItem('p1'), 'p1');
      return {
        s1: { state: s1.state, shield: s1.hasShield, mount: s1.mount },
        s2: { state: s2.state, shield: s2.hasShield, mount: s2.mount },
        s3: { state: s3.state, needles: s3.needles },
        s4: { state: s4.state, needles: s4.needles, invuln: s4.invulnTimer },
      };
      """
  )
  assert res["s1"] == {"state": "alive", "shield": False, "mount": "turtle"}, res
  assert res["s2"] == {"state": "alive", "shield": False, "mount": None}, res
  assert res["s3"]["state"] == "trapped" and res["s3"]["needles"] == 2, res
  assert res["s4"]["state"] == "alive" and res["s4"]["needles"] == 1, res
  assert res["s4"]["invuln"] >= 1.2, res


@_t3("3A_mitigation_and_kit_combos")
def test_t3_03_turtle_mount_with_three_skates_boosts_then_dismount_restores_skated_speed(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'ice_village',
        p1CharacterId: 'miduo',
        seed: 3003,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'turtle', col: 3, row: 6, spawnGraceSec: 0 },
          { type: 'speed', col: 4, row: 6, spawnGraceSec: 0 },
          { type: 'speed', col: 5, row: 6, spawnGraceSec: 0 },
          { type: 'speed', col: 6, row: 6, spawnGraceSec: 0 },
        ],
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Walk onto (3, 6) to mount slow turtle (3.6 tiles/s)
      let st = steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(6), 90);
      const slowTurtle = getPlayer(st, 'p1');

      // Walk across (4, 6), (5, 6), (6, 6) collecting 3 Roller Skates -> boosted turtle (6.2 tiles/s)!
      st = steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 180);
      const boostedTurtle = getPlayer(st, 'p1');

      // Drop bubble and let blast dismount turtle -> foot speed must include the 3 skates (5.0 + 3*0.45 = 6.35)!
      pulseDropBubble('p1');
      const dismounted = getPlayer(api.stepFrames(182), 'p1');

      return {
        slowTurtleSpeed: slowTurtle.effectiveSpeed,
        boostedTurtleSpeed: boostedTurtle.effectiveSpeed,
        boostedSpeedUps: boostedTurtle.speedUps,
        dismountedMount: dismounted.mount,
        dismountedState: dismounted.state,
        dismountedSpeed: dismounted.effectiveSpeed,
      };
      """
  )
  assert abs(res["slowTurtleSpeed"] - 3.6) < 0.05, res
  assert res["boostedSpeedUps"] == 3, res
  assert abs(res["boostedTurtleSpeed"] - 6.2) < 0.05, res
  assert res["dismountedState"] == "alive" and res["dismountedMount"] is None, res
  assert abs(res["dismountedSpeed"] - 6.35) < 0.05, res


@_t3("3A_mitigation_and_kit_combos")
def test_t3_04_kick_into_ticking_bubble_triggers_remote_chain_and_soft_block_break(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'haiwangzi',
        seed: 3004,
        botBehavior: 'idle',
        customGrid: makeGrid({ softBlocks: [[10, 6], [8, 8]] }),
        customSpawns: [
          { id: 'p1', col: 8, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 3, blastRange: 3, canKick: true, baseSpeed: 6.5 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // 1. Place Bubble A at (8, 6) first (shorter remaining fuse)
      pulseDropBubble('p1');
      // 2. Move West to (4, 6), place Bubble B, walk West to (3, 6) to solidify B, then kick B East toward A!
      steerToWorld('p1', 'p1', tc.toX(4), tc.toZ(6), 90);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(6), 60);
      // Walk East into solidified Bubble B at (4, 6) to launch slide toward (7, 6) adjacent to A at (8, 6)
      moveHold('p1', 1, 0, 14);
      // Move safely North to (3, 4)
      steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(4), 80);

      let sawSlide = false;
      let sawChain = false;
      let finalState = api.getState();
      for (let i = 0; i < 160; i++) {
        finalState = api.stepFrames(1);
        if (finalState.sim.bubbles.some((b) => b.sliding)) sawSlide = true;
        if (finalState.sim.events.some((e) => e.type === 'chain_explode')) sawChain = true;
      }
      const p1 = getPlayer(finalState, 'p1');
      return {
        sawSlide,
        sawChain,
        p1State: p1.state,
        blocksBroken: p1.stats.blocksBroken,
        cell10_6: finalState.sim.grid[6][10],
        cell8_8: finalState.sim.grid[8][8],
      };
      """
  )
  assert res["sawChain"] is True, res
  assert res["p1State"] == "alive", res
  assert res["blocksBroken"] >= 2, res
  assert res["cell10_6"] == 0 and res["cell8_8"] == 0, res


@_t3("3A_mitigation_and_kit_combos")
def test_t3_05_kick_slide_traps_remote_rival_then_skated_sprint_pops_for_ko(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'toy_kingdom',
        p1CharacterId: 'wanzi',
        seed: 3005,
        botBehavior: 'idle',
        customGrid: makeGrid({ walls: [[11, 6]] }),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 10, row: 7, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { canKick: true, blastRange: 3, baseSpeed: 7.5, speedUps: 4 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Drop bubble at (4, 6), step West to (3, 6) to solidify, then kick East!
      // Bubble slides East at 10 tiles/s and stops at (10, 6) right before wall (11, 6), above bot2 at (10, 7)!
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(6), 45);
      moveHold('p1', 1, 0, 14);

      // Wait until bubble detonates at (10, 6) and traps bot2 at (10, 7)
      let st = api.getState();
      for (let i = 0; i < 190; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'bot2').state === 'trapped') break;
      }
      const rivalMidState = getPlayer(st, 'bot2').state;

      // Wait for lingering blast to clear (~26 frames), then sprint East + South to pop trapped bot2!
      api.stepFrames(28);
      st = steerToWorld('p1', 'p1', tc.toX(10), tc.toZ(6), 120);
      st = steerToWorld('p1', 'p1', tc.toX(10), tc.toZ(7), 60);

      const p1End = getPlayer(st, 'p1');
      const rivalEnd = getPlayer(st, 'bot2');
      return {
        rivalMidState,
        rivalEndState: rivalEnd.state,
        p1Kos: p1End.stats.kos,
      };
      """
  )
  assert res["rivalMidState"] == "trapped", res
  assert res["rivalEndState"] == "eliminated", res
  assert res["p1Kos"] == 1, res


@_t3("3A_mitigation_and_kit_combos")
def test_t3_06_kick_blocked_by_two_adjacent_bubbles_in_line(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'xiaoqiang',
        seed: 3006,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 4, canKick: true, baseSpeed: 6.0 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Drop bubble at (6, 6), move West to (5, 6), drop second bubble at (5, 6), move West to (4, 6)
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(5), tc.toZ(6), 45);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(4), tc.toZ(6), 45);

      // Push East against (5, 6): because (6, 6) immediately behind (5, 6) has a bubble, (5, 6) CANNOT slide!
      const st = moveHold('p1', 1, 0, 20);
      const cols = st.sim.bubbles.map((b) => b.col).sort((a, b) => a - b);
      const anySliding = st.sim.bubbles.some((b) => b.sliding);
      return { cols, anySliding };
      """
  )
  assert res["cols"] == [5, 6], res
  assert res["anySliding"] is False, res


@_t3("3A_mitigation_and_kit_combos")
def test_t3_07_full_kit_multi_bubble_power_syrup_crossfire_traps_two_enemies(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3007,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 9, row: 6, team: 1 },
          { id: 'bot3', col: 6, row: 9, team: 1 },
        ],
        customPickups: [
          { type: 'bubble', col: 3, row: 6, spawnGraceSec: 0 },
          { type: 'power', col: 4, row: 6, spawnGraceSec: 0 },
          { type: 'power', col: 5, row: 6, spawnGraceSec: 0 },
          { type: 'speed', col: 5, row: 5, spawnGraceSec: 0 },
        ],
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Collect bubble + 2x power along row 6 -> maxBubbles=2, blastRange=4
      steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 120);
      // Drop Bubble 1 at (6, 6) (reaches bot2 at (9, 6) AND bot3 at (6, 9)!)
      pulseDropBubble('p1');
      // Escape North through (5, 5) collecting speed, drop Bubble 2 at (5, 6) or retreat to safe (4, 4)
      steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(4), 60);
      steerToWorld('p1', 'p1', tc.toX(4), tc.toZ(4), 60);

      let st = api.getState();
      for (let i = 0; i < 185; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'bot2').state === 'trapped' && getPlayer(st, 'bot3').state === 'trapped') {
          break;
        }
      }
      const p1 = getPlayer(st, 'p1');
      return {
        p1State: p1.state,
        maxBubbles: p1.maxBubbles,
        blastRange: p1.blastRange,
        bot2State: getPlayer(st, 'bot2').state,
        bot3State: getPlayer(st, 'bot3').state,
      };
      """
  )
  assert res["p1State"] == "alive", res
  assert res["maxBubbles"] == 2 and res["blastRange"] == 4, res
  assert res["bot2State"] == "trapped" and res["bot3State"] == "trapped", res


# ==============================================================================
# Group 3B: Mode 2 (Bun Mountain / Candy Grab) Interactions (5 tests)
# ==============================================================================


@_t3("3B_bun_grab_interactions")
def test_t3_08_bun_grab_foot_carry_slow_vs_ufo_hover_ignores_carry_penalty(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3008,
        botBehavior: 'idle',
        customGrid: makeGrid({
          tiles: [
            [2, 6, 4], // Blue base
            [12, 6, 5], // Red base
            [5, 6, 3], // Bun shrine
          ],
        }),
        customSpawns: [
          { id: 'p1', col: 4, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'ufo', col: 6, row: 6, spawnGraceSec: 0 },
        ],
      });
      api.setDeterministicMode(true);
      const p0 = getPlayer(api.getState(), 'p1');
      const tc = inferTileCenterCoord(p0);

      // Step onto shrine (5, 6) to pick up bun on foot -> 0.75x slow!
      let st = steerToWorld('p1', 'p1', tc.toX(5), tc.toZ(6), 60);
      const footCarrier = getPlayer(st, 'p1');

      // Step onto UFO pickup (6, 6) while still carrying bun -> speed jumps to 6.6!
      st = steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 60);
      const ufoCarrier = getPlayer(st, 'p1');

      return {
        baseSpeed: p0.baseSpeed,
        footCarrying: footCarrier.carryingBun,
        footSpeed: footCarrier.effectiveSpeed,
        ufoCarrying: ufoCarrier.carryingBun,
        ufoMount: ufoCarrier.mount,
        ufoSpeed: ufoCarrier.effectiveSpeed,
      };
      """
  )
  assert res["footCarrying"] is True, res
  assert abs(res["footSpeed"] - res["baseSpeed"] * 0.75) < 0.05, res
  assert res["ufoCarrying"] is True and res["ufoMount"] == "ufo", res
  assert abs(res["ufoSpeed"] - 6.6) < 0.05, res


@_t3("3B_bun_grab_interactions")
def test_t3_09_bun_grab_trap_drops_bun_ally_rescues_repickup_and_bank_scores(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 3009,
        botBehavior: 'idle',
        customGrid: makeGrid({
          tiles: [
            [2, 6, 4], // Blue base
            [12, 6, 5], // Red base
            [6, 6, 3], // Single bun shrine
          ],
        }),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'p2', col: 4, row: 4, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // 1. P1 grabs bun at (6, 6)
      let st = steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 60);
      const grabbed = getPlayer(st, 'p1').carryingBun;

      // 2. P1 drops bubble on self and gets trapped -> bun detaches onto floor!
      pulseDropBubble('p1');
      st = api.stepFrames(182);
      const trappedP1 = getPlayer(st, 'p1');
      const looseAfterTrap = st.sim.looseBuns.length;

      // 3. Wait for blast linger to end, then P2 touches P1 to rescue without snatching the dropped bun!
      api.stepFrames(28);
      st = steerToWorld('p2', 'p2', tc.toX(4), tc.toZ(6), 70);
      st = steerToWorld('p2', 'p2', trappedP1.x, trappedP1.z, 90, 0.72);
      const rescuedP1 = getPlayer(st, 'p1');
      const p2Rescues = getPlayer(st, 'p2').stats.rescues;

      // 4. Wait out 0.60s bun drop lock, re-collect dropped bun (if not already auto-collected on rescue), and bank at Blue Base (2, 6)!
      st = api.stepFrames(40);
      if (!getPlayer(st, 'p1').carryingBun && st.sim.looseBuns.length > 0) {
        const targetBun = st.sim.looseBuns[0];
        st = steerToWorld('p1', 'p1', targetBun.x, targetBun.z, 80);
      }
      const reGrabbed = getPlayer(st, 'p1').carryingBun;
      st = steerToWorld('p1', 'p1', tc.toX(2), tc.toZ(6), 140);

      return {
        grabbed,
        trappedState: trappedP1.state,
        carryingWhileTrapped: trappedP1.carryingBun,
        looseAfterTrap,
        rescuedState: rescuedP1.state,
        p2Rescues,
        reGrabbed,
        blueScore: st.sim.teamScores.blue,
        p1BunsBanked: getPlayer(st, 'p1').stats.bunsBanked,
      };
      """
  )
  assert res["grabbed"] is True, res
  assert res["trappedState"] == "trapped", res
  assert res["carryingWhileTrapped"] is False and res["looseAfterTrap"] >= 1, res
  assert res["rescuedState"] == "alive" and res["p2Rescues"] == 1, res
  assert res["reGrabbed"] is True, res
  assert res["blueScore"] == 1 and res["p1BunsBanked"] == 1, res


@_t3("3B_bun_grab_interactions")
def test_t3_10_bun_grab_shield_and_mount_preserve_carried_bun_under_blast(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'pirate_bay',
        p1CharacterId: 'miduo',
        seed: 3010,
        botBehavior: 'idle',
        customGrid: makeGrid({
          tiles: [
            [2, 6, 4],
            [12, 6, 5],
            [6, 6, 3],
          ],
        }),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { hasShield: true, mount: 'turtle' },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Pick up bun at (6, 6)
      let st = steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 80);
      // Hit #1 breaks shield -> bun MUST stay carried!
      pulseDropBubble('p1');
      const afterShieldHit = getPlayer(api.stepFrames(182), 'p1');
      api.stepFrames(90);

      // Hit #2 breaks turtle -> bun MUST STILL stay carried!
      pulseDropBubble('p1');
      const afterMountHit = getPlayer(api.stepFrames(182), 'p1');

      return {
        afterShield: {
          state: afterShieldHit.state,
          shield: afterShieldHit.hasShield,
          mount: afterShieldHit.mount,
          carryingBun: afterShieldHit.carryingBun,
        },
        afterMount: {
          state: afterMountHit.state,
          shield: afterMountHit.hasShield,
          mount: afterMountHit.mount,
          carryingBun: afterMountHit.carryingBun,
        },
      };
      """
  )
  assert res["afterShield"] == {
      "state": "alive",
      "shield": False,
      "mount": "turtle",
      "carryingBun": True,
  }, res
  assert res["afterMount"] == {
      "state": "alive",
      "shield": False,
      "mount": None,
      "carryingBun": True,
  }, res


@_t3("3B_bun_grab_interactions")
def test_t3_11_bun_grab_eliminated_player_respawns_after_delay_with_invulnerability(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'ice_village',
        p1CharacterId: 'miduo',
        seed: 3011,
        botBehavior: 'idle',
        customGrid: makeGrid({
          tiles: [
            [2, 6, 4],
            [12, 6, 5],
            [7, 6, 3],
          ],
        }),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 6, row: 6, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Trap bot2 at (6, 6), dodge diagonally off-ray to (4, 5), then walk to (6, 6) to pop bot2!
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(5), tc.toZ(5), 35);
      steerToWorld('p1', 'p1', tc.toX(4), tc.toZ(5), 35);
      let st = api.getState();
      while (st.sim.bubbles.length > 0 || st.sim.blasts.length > 0) {
        st = api.stepFrames(1);
      }
      steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(5), 50);
      st = steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 50);
      const popped = getPlayer(st, 'bot2');

      // At +2.0s (120 frames), bot2 is still eliminated; by +3.6s (220 total frames), bot2 respawns!
      const mid = getPlayer(api.stepFrames(120), 'bot2');
      const respawned = getPlayer(api.stepFrames(100), 'bot2');
      return {
        poppedState: popped.state,
        initialRespawnTimer: popped.respawnTimer,
        midState: mid.state,
        respawnedState: respawned.state,
        respawnedInvuln: respawned.invulnTimer,
      };
      """
  )
  assert res["poppedState"] == "eliminated", res
  assert 3.0 <= res["initialRespawnTimer"] <= 4.0, res
  assert res["midState"] == "eliminated", res
  assert res["respawnedState"] == "alive", res
  assert res["respawnedInvuln"] > 0.5, res


@_t3("3B_bun_grab_interactions")
def test_t3_12_bun_grab_wrong_team_base_does_not_score_only_own_base_scores(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'toy_kingdom',
        p1CharacterId: 'wanzi',
        seed: 3012,
        botBehavior: 'idle',
        customGrid: makeGrid({
          tiles: [
            [3, 6, 4], // Blue base
            [9, 6, 5], // Red base
            [6, 6, 3], // Bun shrine
          ],
        }),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Grab bun at (6, 6), walk onto enemy RED base (9, 6) -> must NOT bank!
      steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 60);
      let st = steerToWorld('p1', 'p1', tc.toX(9), tc.toZ(6), 90);
      const onEnemyBase = {
        carrying: getPlayer(st, 'p1').carryingBun,
        blue: st.sim.teamScores.blue,
        red: st.sim.teamScores.red,
      };

      // Walk back onto own BLUE base (3, 6) -> banks +1 for Blue!
      st = steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(6), 150);
      return {
        onEnemyBase,
        afterOwnBase: {
          carrying: getPlayer(st, 'p1').carryingBun,
          blue: st.sim.teamScores.blue,
          red: st.sim.teamScores.red,
        },
      };
      """
  )
  assert res["onEnemyBase"] == {"carrying": True, "blue": 0, "red": 0}, res
  assert res["afterOwnBase"] == {"carrying": False, "blue": 1, "red": 0}, res


# ==============================================================================
# Group 3C: Mode 3 (Co-op Mechanical Golem Boss) Interactions (6 tests)
# ==============================================================================


@_t3("3C_boss_golem_interactions")
def test_t3_13_boss_golem_phase1_to_phase2_transition_at_half_hp(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const s0 = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'haiwangzi',
        seed: 3013,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 13, row: 11, team: 0 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 4, blastRange: 5, baseSpeed: 7.0 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(s0, 'p1'));
      const bossCol = s0.sim.boss.col;
      const bossRow = s0.sim.boss.row;
      const startHp = s0.sim.boss.hp;
      const startPhase = s0.sim.boss.phase;

      // Strike boss 6 times cleanly from (bossCol - 2, bossRow), dodging diagonally off-ray to (bossCol - 3, bossRow - 1)
      let st = s0;
      for (let hit = 0; hit < 6; hit++) {
        steerToWorld('p1', 'p1', tc.toX(bossCol - 3), tc.toZ(bossRow), 50);
        steerToWorld('p1', 'p1', tc.toX(bossCol - 2), tc.toZ(bossRow), 50);
        pulseDropBubble('p1');
        steerToWorld('p1', 'p1', tc.toX(bossCol - 3), tc.toZ(bossRow), 40);
        st = steerToWorld('p1', 'p1', tc.toX(bossCol - 3), tc.toZ(bossRow - 1), 40);
        while (st.sim.bubbles.length > 0 || st.sim.blasts.length > 0) {
          st = api.stepFrames(15);
        }
        st = api.stepFrames(10);
      }
      // Step 1 more frame so stepBossAI updates boss.phase = 2
      st = api.stepFrames(2);
      return {
        startHp,
        startPhase,
        midHp: st.sim.boss.hp,
        midPhase: st.sim.boss.phase,
        p1State: getPlayer(st, 'p1').state,
      };
      """
  )
  assert res["startHp"] == 12 and res["startPhase"] == 1, res
  assert res["midHp"] <= 6 and res["midPhase"] == 2, res
  assert res["p1State"] == "alive", res


@_t3("3C_boss_golem_interactions")
def test_t3_14_boss_golem_periodic_powerup_drops_every_three_hp_lost(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const s0 = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'pirate_bay',
        p1CharacterId: 'haiwangzi',
        seed: 3014,
        botBehavior: 'idle',
        disableRandomDrops: true,
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 13, row: 11, team: 0 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 4, blastRange: 5, baseSpeed: 7.0 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(s0, 'p1'));
      const bossCol = s0.sim.boss.col;
      const bossRow = s0.sim.boss.row;

      let st = s0;
      for (let hit = 0; hit < 3; hit++) {
        steerToWorld('p1', 'p1', tc.toX(bossCol - 3), tc.toZ(bossRow), 50);
        steerToWorld('p1', 'p1', tc.toX(bossCol - 2), tc.toZ(bossRow), 50);
        pulseDropBubble('p1');
        steerToWorld('p1', 'p1', tc.toX(bossCol - 3), tc.toZ(bossRow), 40);
        st = steerToWorld('p1', 'p1', tc.toX(bossCol - 3), tc.toZ(bossRow - 1), 40);
        while (st.sim.bubbles.length > 0 || st.sim.blasts.length > 0) {
          st = api.stepFrames(15);
        }
        st = api.stepFrames(10);
      }
      return {
        bossHp: st.sim.boss.hp,
        pickupCount: st.sim.pickups.length,
        pickupTypes: st.sim.pickups.map((p) => p.type),
      };
      """
  )
  assert res["bossHp"] == 9, res
  assert res["pickupCount"] >= 2, res


@_t3("3C_boss_golem_interactions")
def test_t3_15_boss_golem_telegraph_warning_and_turtle_mount_absorbs_boss_attack(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Use a single human hero in boss_golem with botBehavior: 'active' so BossAI patrols & telegraphs
      // while p1 remains 100% under our deterministic control!
      api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'ice_village',
        p1CharacterId: 'miduo',
        seed: 3015,
        botBehavior: 'active',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 2, team: 0, isHuman: true },
        ],
        startingLoadout: {
          p1: { mount: 'turtle', baseSpeed: 6.5, speedUps: 3 },
        },
      });
      api.setDeterministicMode(true);
      api.setAutoPlayP1(false);

      // Step until Boss enters 'telegraph' state with floor warning tiles
      let st = api.getState();
      for (let i = 0; i < 240; i++) {
        st = api.stepFrames(1);
        if (st.sim.boss.state === 'telegraph' && st.sim.boss.telegraphTiles.length > 0) {
          break;
        }
      }
      const telegraphSnap = {
        state: st.sim.boss.state,
        attackType: st.sim.boss.attackType,
        tileCount: st.sim.boss.telegraphTiles.length,
        remSec: st.sim.boss.telegraphRemainingSec,
      };

      // Pick the closest warning tile to p1 and steer onto it BEFORE the 1.2s telegraph expires!
      const p1Now = getPlayer(st, 'p1');
      const tc = inferTileCenterCoord(p1Now);
      let bestTile = st.sim.boss.telegraphTiles[0];
      let bestDist = Infinity;
      for (const t of st.sim.boss.telegraphTiles) {
        const d = Math.hypot(tc.toX(t.col) - p1Now.x, tc.toZ(t.row) - p1Now.z);
        if (d < bestDist) {
          bestDist = d;
          bestTile = t;
        }
      }

      st = steerToWorld('p1', 'p1', tc.toX(bestTile.col), tc.toZ(bestTile.row), 60);
      // Step until Boss executes the telegraphed blast
      for (let i = 0; i < 90; i++) {
        st = api.stepFrames(1);
        if (st.sim.boss.state === 'attack') break;
      }
      const p1After = getPlayer(st, 'p1');
      return {
        telegraphSnap,
        bestDist,
        p1StateAfter: p1After.state,
        p1MountAfter: p1After.mount,
        p1InvulnAfter: p1After.invulnTimer,
      };
      """
  )
  assert res["telegraphSnap"]["state"] == "telegraph", res
  assert res["telegraphSnap"]["tileCount"] > 0, res
  assert 0.8 <= res["telegraphSnap"]["remSec"] <= 1.3, res
  assert res["p1StateAfter"] == "alive", res
  assert res["p1MountAfter"] is None, res
  assert res["p1InvulnAfter"] > 0.4, res


@_t3("3C_boss_golem_interactions")
def test_t3_16_boss_golem_phase2_unlocks_gear_crate_drop_attack(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const s0 = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'toy_kingdom',
        p1CharacterId: 'haiwangzi',
        seed: 3016,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 2, team: 0, isHuman: true },
        ],
        startingLoadout: {
          p1: { maxBubbles: 4, blastRange: 5, baseSpeed: 7.5 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(s0, 'p1'));
      const bc = s0.sim.boss.col;
      const br = s0.sim.boss.row;

      // Reduce Boss to <= 6 HP (Phase 2) cleanly while idle
      let st = s0;
      for (let hit = 0; hit < 6; hit++) {
        steerToWorld('p1', 'p1', tc.toX(bc - 2), tc.toZ(br), 80);
        pulseDropBubble('p1');
        st = steerToWorld('p1', 'p1', tc.toX(1), tc.toZ(1), 80);
        while (st.sim.bubbles.length > 0 || st.sim.blasts.length > 0) {
          st = api.stepFrames(1);
        }
        st = api.stepFrames(10);
      }

      // Now enable Autopilot + active BossAI so Phase 2 Boss cycles through attacks including 'gear_crate_drop'!
      // Re-run with active bots/boss or call setAutoPlayP1; note botBehavior was 'idle', so let's verify via
      // a fresh active match where 4 strong co-op bots push Boss into Phase 2 and observe 'gear_crate_drop'.
      api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'toy_kingdom',
        p1CharacterId: 'haiwangzi',
        seed: 3016,
        botBehavior: 'active',
        customGrid: makeGrid(),
        startingLoadout: {
          p1: { maxBubbles: 3, blastRange: 4, baseSpeed: 6.8 },
          bot1: { maxBubbles: 3, blastRange: 4, baseSpeed: 6.8 },
        },
      });
      api.setDeterministicMode(true);
      api.setAutoPlayP1(true);

      let sawPhase2 = false;
      let sawGearCrate = false;
      for (let i = 0; i < 2400; i++) {
        const cur = api.stepFrames(1);
        if (cur.sim.boss && cur.sim.boss.phase === 2) sawPhase2 = true;
        if (cur.sim.boss && cur.sim.boss.attackType === 'gear_crate_drop') {
          sawGearCrate = true;
          break;
        }
        if (cur.sim.phase !== 'playing') break;
      }
      return { idleReducedHp: st.sim.boss.hp, sawPhase2, sawGearCrate };
      """
  )
  assert res["idleReducedHp"] <= 6, res
  assert res["sawPhase2"] is True, res
  assert res["sawGearCrate"] is True, res


@_t3("3C_boss_golem_interactions")
def test_t3_17_boss_golem_shared_team_lives_and_hero_respawn(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const s0 = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3017,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 2, row: 2, team: 0 },
          { id: 'bot1', col: 1, row: 11, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 13, row: 11, team: 0 },
        ],
      });
      api.setDeterministicMode(true);
      const startLives = s0.sim.teamLives;

      // P1 traps self and waits out 5.5s trap timeout -> eliminated -> consumes 1 shared life & schedules 4.0s respawn!
      pulseDropBubble('p1');
      const sTrapped = api.stepFrames(182);
      const sElim = api.stepFrames(335); // > 5.5s trap timeout
      const elimP1 = getPlayer(sElim, 'p1');
      const livesAfterElim = sElim.sim.teamLives;

      // Advance 250 frames (~4.16s) -> P1 respawns alive with mercy invuln!
      const sRespawn = api.stepFrames(250);
      const respP1 = getPlayer(sRespawn, 'p1');

      return {
        startLives,
        trappedState: getPlayer(sTrapped, 'p1').state,
        elimState: elimP1.state,
        livesAfterElim,
        respawnState: respP1.state,
        respawnInvuln: respP1.invulnTimer,
      };
      """
  )
  assert res["startLives"] == 3, res
  assert res["trappedState"] == "trapped", res
  assert res["elimState"] == "eliminated", res
  assert res["livesAfterElim"] == 2, res
  assert res["respawnState"] == "alive" and res["respawnInvuln"] > 0.5, res


@_t3("3C_boss_golem_interactions")
def test_t3_18_boss_golem_zero_hp_triggers_coop_victory_and_rankings(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const s0 = api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'haiwangzi',
        seed: 3018,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 4, row: 5, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 0 },
          { id: 'bot3', col: 13, row: 11, team: 0 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 5, blastRange: 6, baseSpeed: 7.5 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(s0, 'p1'));
      const bc = s0.sim.boss.col;
      const br = s0.sim.boss.row;

      let st = s0;
      for (let hit = 0; hit < 12; hit++) {
        if (st.sim.phase !== 'playing') break;
        steerToWorld('p1', 'p1', tc.toX(bc - 3), tc.toZ(br), 50);
        steerToWorld('p1', 'p1', tc.toX(bc - 2), tc.toZ(br), 50);
        pulseDropBubble('p1');
        steerToWorld('p1', 'p1', tc.toX(bc - 3), tc.toZ(br), 40);
        st = steerToWorld('p1', 'p1', tc.toX(bc - 3), tc.toZ(br - 1), 40);
        while (
          st.sim.phase === 'playing' &&
          (st.sim.bubbles.length > 0 || st.sim.blasts.length > 0)
        ) {
          st = api.stepFrames(15);
        }
        if (st.sim.phase === 'playing') {
          st = api.stepFrames(10);
        }
      }
      return {
        phase: st.sim.phase,
        winningTeam: st.sim.winningTeam,
        bossHp: st.sim.boss.hp,
        bossState: st.sim.boss.state,
        rankingsLen: st.sim.rankings.length,
        allCoopWinners: st.sim.rankings.every((r) => r.isWinner === true),
        uiScreen: st.uiScreen,
      };
      """
  )
  assert res["phase"] == "victory" and res["winningTeam"] == 0, res
  assert res["bossHp"] == 0 and res["bossState"] == "defeated", res
  assert res["rankingsLen"] == 4 and res["allCoopWinners"] is True, res


# ==============================================================================
# Group 3D: Physics, Arenas, Invulnerability & Loot Grace Combos (5 tests)
# ==============================================================================


@_t3("3D_physics_and_arena_combos")
def test_t3_19_ufo_mount_glides_over_soft_blocks_in_all_four_arenas_and_dismount_clears_tile(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      const arenas = ['candy_town', 'pirate_bay', 'ice_village', 'toy_kingdom'];
      const results = [];
      for (const arenaId of arenas) {
        // First verify unmounted player is blocked by SOFT_BLOCK at (5, 6)
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId,
          p1CharacterId: 'miduo',
          seed: 3019,
          botBehavior: 'idle',
          customGrid: makeGrid({ softBlocks: [[5, 6]] }),
          customSpawns: [
            { id: 'p1', col: 4, row: 6, team: 0 },
            { id: 'bot1', col: 1, row: 1, team: 0 },
            { id: 'bot2', col: 13, row: 1, team: 1 },
            { id: 'bot3', col: 13, row: 11, team: 1 },
          ],
        });
        api.setDeterministicMode(true);
        const blocked = getPlayer(moveHold('p1', 1, 0, 35), 'p1');

        // Now verify UFO rider glides directly onto SOFT_BLOCK (5, 6) and blast-dismount clears (5, 6)!
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId,
          p1CharacterId: 'miduo',
          seed: 3019,
          botBehavior: 'idle',
          customGrid: makeGrid({ softBlocks: [[5, 6]] }),
          customSpawns: [
            { id: 'p1', col: 3, row: 6, team: 0 },
            { id: 'bot1', col: 1, row: 1, team: 0 },
            { id: 'bot2', col: 13, row: 1, team: 1 },
            { id: 'bot3', col: 13, row: 11, team: 1 },
          ],
          startingLoadout: {
            p1: { mount: 'ufo', blastRange: 3 },
          },
        });
        api.setDeterministicMode(true);
        const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));
        // Drop bubble at (3, 6) whose East ray reaches (5, 6), then hover directly onto SOFT_BLOCK (5, 6)!
        pulseDropBubble('p1');
        let st = steerToWorld('p1', 'p1', tc.toX(5), tc.toZ(6), 70);
        const hoveredCol = getPlayer(st, 'p1').col;
        const cellWhileHovering = st.sim.grid[6][5];

        st = api.stepFrames(182);
        const afterDismount = getPlayer(st, 'p1');
        // Verify rider can walk freely East off (5, 6) without being wedged
        st = moveHold('p1', 1, 0, 20);
        const walkedEastX = getPlayer(st, 'p1').x;

        results.push({
          arenaId,
          blockedCol: blocked.col,
          hoveredCol,
          cellWhileHovering,
          cellAfterDismount: st.sim.grid[6][5],
          afterMount: afterDismount.mount,
          afterState: afterDismount.state,
          walkedDeltaX: walkedEastX - afterDismount.x,
        });
      }
      return results;
      """
  )
  assert len(res) == 4, res
  for r in res:
    assert r["blockedCol"] == 4, r
    assert r["hoveredCol"] == 5 and r["cellWhileHovering"] == 2, r
    assert r["afterState"] == "alive" and r["afterMount"] is None, r
    assert r["cellAfterDismount"] == 0, r
    assert r["walkedDeltaX"] > 0.5, r


@_t3("3D_physics_and_arena_combos")
def test_t3_20_corner_assist_smooth_turn_while_riding_turtle_and_max_skates(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Wall at (6, 5) blocks East movement at z slightly above lane 6 center (row 6 is open!).
      // Offset player at (x = 5.5, z = 6.22) so circle overlaps row 5 by ~0.14 (< corner threshold),
      // pressing pure East must smoothly align z -> 6.5 and pass col 6 for BOTH slow Turtle and max Skates!
      function runCase(loadout, charId) {
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: charId,
          seed: 3020,
          botBehavior: 'idle',
          customGrid: makeGrid({ walls: [[6, 5]] }),
          customSpawns: [
            { id: 'p1', col: 5, row: 6, x: 5.5, z: 6.22, team: 0 },
            { id: 'bot1', col: 1, row: 1, team: 0 },
            { id: 'bot2', col: 13, row: 1, team: 1 },
            { id: 'bot3', col: 13, row: 11, team: 1 },
          ],
          startingLoadout: { p1: loadout },
        });
        api.setDeterministicMode(true);
        const st = moveHold('p1', 1, 0, 50);
        const p1 = getPlayer(st, 'p1');
        return { x: p1.x, z: p1.z, col: p1.col, speed: p1.effectiveSpeed };
      }

      return {
        turtle: runCase({ mount: 'turtle' }, 'miduo'),
        maxSkates: runCase({ baseSpeed: 8.0, speedUps: 6 }, 'wanzi'),
      };
      """
  )
  assert res["turtle"]["col"] >= 7 and abs(res["turtle"]["z"] - 6.5) < 0.2, res
  assert (
      res["maxSkates"]["col"] >= 8
      and abs(res["maxSkates"]["z"] - 6.5) < 0.2
  ), res


@_t3("3D_physics_and_arena_combos")
def test_t3_21_post_rescue_and_post_needle_mercy_invulnerability_blocks_second_blast(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Stagger two bubbles ~0.6s (36 frames) apart so Bubble 2 detonates while P1 is in 1.5s mercy invuln!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3021,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 3, blastRange: 2, needles: 1 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Drop Bubble 1 at (5, 6), wait 45 frames (0.75s), move to (8, 6) out of chain reach, drop Bubble 2 at (8, 6),
      // then stand at (6, 6) — wait: (6, 6) is hit by BOTH (5, 6) (range 2 -> hits 6,6 & 7,6) and (8, 6) (range 2 -> hits 7,6 & 6,6),
      // while (8, 6) itself is 3 tiles from (5, 6) so Bubble 1 does NOT chain Bubble 2!
      pulseDropBubble('p1');
      api.stepFrames(20);
      steerToWorld('p1', 'p1', tc.toX(8), tc.toZ(6), 45);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(6), tc.toZ(6), 40);

      // Step until Bubble 1 detonates and traps P1 at (6, 6)
      let st = api.getState();
      for (let i = 0; i < 120; i++) {
        st = api.stepFrames(1);
        if (getPlayer(st, 'p1').state === 'trapped') break;
      }
      const trappedTick = st.sim.tick;

      // Immediately pop out with Needle -> invulnTimer = 1.5s!
      st = pulseUseItem('p1');
      const afterNeedle = getPlayer(st, 'p1');

      // Step up to 80 more frames so Bubble 2 detonates right across (6, 6) while P1 stands in the ray!
      let sawSecondBlast = false;
      for (let i = 0; i < 80; i++) {
        st = api.stepFrames(1);
        if (st.sim.blasts.some((b) => b.originCol === 8)) sawSecondBlast = true;
      }
      const afterSecondBlast = getPlayer(st, 'p1');
      return {
        trappedTick,
        afterNeedleState: afterNeedle.state,
        afterNeedleInvuln: afterNeedle.invulnTimer,
        sawSecondBlast,
        afterSecondBlastState: afterSecondBlast.state,
      };
      """
  )
  assert res["afterNeedleState"] == "alive", res
  assert res["afterNeedleInvuln"] >= 1.3, res
  assert res["sawSecondBlast"] is True, res
  assert res["afterSecondBlastState"] == "alive", res


@_t3("3D_physics_and_arena_combos")
def test_t3_22_lingering_blast_ignites_kicked_bubble_mid_slide(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3022,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 7, row: 4, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { maxBubbles: 3, blastRange: 3, canKick: true, baseSpeed: 7.0 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // 1. Place Bubble A at (7, 4) (its South ray reaches (7, 6) in ~180 frames)
      pulseDropBubble('p1');
      // 2. Move to (4, 6), place Bubble B (~65 frames later -> still has >1.5s fuse when A explodes!), step West to (3, 6)
      steerToWorld('p1', 'p1', tc.toX(4), tc.toZ(4), 45);
      steerToWorld('p1', 'p1', tc.toX(4), tc.toZ(6), 40);
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(6), 30);

      // Wait until Bubble A detonates so (7, 6) has an active 0.40s lingering blast ray
      let st = api.getState();
      for (let i = 0; i < 160; i++) {
        st = api.stepFrames(1);
        if (st.sim.blasts.length > 0) break;
      }
      const hadLingeringRay = st.sim.blasts.length > 0;

      // Immediately kick Bubble B East at 10 tiles/s into the lingering ray at (7, 6)!
      let ignitedMidSlide = false;
      api.setPlayerInput('p1', { moveX: 1, moveZ: 0, dropBubble: false, useItem: false });
      for (let i = 0; i < 24; i++) {
        st = api.stepFrames(1);
        if (i === 8) clearInput('p1');
        if (st.sim.events.some((e) => e.type === 'chain_explode')) {
          ignitedMidSlide = true;
          break;
        }
      }
      return {
        hadLingeringRay,
        ignitedMidSlide,
        remainingBubbles: st.sim.bubbles.length,
      };
      """
  )
  assert res["hadLingeringRay"] is True, res
  assert res["ignitedMidSlide"] is True, res
  assert res["remainingBubbles"] == 0, res


@_t3("3D_physics_and_arena_combos")
def test_t3_23_exposed_floor_pickup_destroyed_by_blast_after_spawn_grace_expires(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3023,
        botBehavior: 'idle',
        disableRandomDrops: true,
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        customPickups: [
          { type: 'power', col: 6, row: 6, spawnGraceSec: 0.55 },
        ],
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // Drop bubble at (5, 6) (3.0s fuse > 0.55s spawnGraceSec -> grace will be 0 when blast hits (6, 6)!), retreat to (3, 4)
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(6), 40);
      steerToWorld('p1', 'p1', tc.toX(3), tc.toZ(4), 40);
      let afterBlast = api.stepFrames(20);
      const graceMid = afterBlast.sim.pickups[0]?.spawnGraceSec ?? -1;
      while (afterBlast.sim.bubbles.length > 0 || afterBlast.sim.blasts.length > 0) {
        afterBlast = api.stepFrames(1);
      }
      return {
        graceMid,
        pickupsAfterBlast: afterBlast.sim.pickups.length,
      };
      """
  )
  assert res["graceMid"] == 0, res
  assert res["pickupsAfterBlast"] == 0, res


# ==============================================================================
# Group 3E: Autonomous BotAI Tactical Combos (3 tests)
# ==============================================================================


@_t3("3E_bot_ai_tactics")
def test_t3_24_bot_ai_prioritizes_trapped_teammate_rescue_in_2v2(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3024,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0 },
          { id: 'bot1', col: 6, row: 6, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);

      // P1 traps self while bots are idle
      pulseDropBubble('p1');
      let st = api.stepFrames(182);
      const p1Trapped = getPlayer(st, 'p1').state === 'trapped';

      // Wait for lingering blast to fade, then re-start or let active BotAI run:
      // Note: startMatch sets botBehavior; let's test directly with botBehavior: 'active' where p1 drops bubble at (2, 2)
      // while bot1 is nearby at (5, 2) and rivals are walled behind soft blocks at col 12!
      const g = makeGrid({
        softBlocks: Array.from({ length: 13 }, (_, r) => [11, r]),
      });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3024,
        botBehavior: 'active',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 2, row: 6, team: 0 },
          { id: 'bot1', col: 6, row: 6, team: 0 },
          { id: 'bot2', col: 13, row: 2, team: 1 },
          { id: 'bot3', col: 13, row: 10, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      api.setAutoPlayP1(false);

      // P1 drops bubble at (2, 6) and stays still to get trapped
      pulseDropBubble('p1');
      let sawTrapped = false;
      let sawRescued = false;
      for (let i = 0; i < 360; i++) {
        st = api.stepFrames(1);
        const p1 = getPlayer(st, 'p1');
        if (p1.state === 'trapped') sawTrapped = true;
        if (sawTrapped && p1.state === 'alive' && getPlayer(st, 'bot1').stats.rescues >= 1) {
          sawRescued = true;
          break;
        }
      }
      return {
        p1Trapped,
        sawTrapped,
        sawRescued,
        bot1Rescues: getPlayer(st, 'bot1').stats.rescues,
        p1FinalState: getPlayer(st, 'p1').state,
      };
      """
  )
  assert res["sawTrapped"] is True, res
  assert res["sawRescued"] is True, res
  assert res["bot1Rescues"] >= 1 and res["p1FinalState"] == "alive", res


@_t3("3E_bot_ai_tactics")
def test_t3_25_bot_ai_hunts_and_pops_trapped_enemy_for_ko(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Place human P2 (team 1, motionless) next to P1's bubble so P2 gets trapped, while ally bot1 (team 0, active) hunts & pops P2!
      const g = makeGrid({
        walls: Array.from({ length: 13 }, (_, r) => [11, r]),
      });
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3025,
        botBehavior: 'active',
        customGrid: g,
        customSpawns: [
          { id: 'p1', col: 2, row: 6, team: 0, isHuman: true },
          { id: 'bot1', col: 7, row: 6, team: 0, isHuman: false },
          { id: 'p2', col: 4, row: 6, team: 1, isHuman: true },
          { id: 'bot3', col: 13, row: 6, team: 1, isHuman: false },
        ],
        startingLoadout: {
          p1: { blastRange: 3 },
        },
      });
      api.setDeterministicMode(true);
      api.setAutoPlayP1(false);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      // P1 drops bubble at (2, 6) (reaches p2 at (4, 6)!) and retreats to (2, 3)
      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(2), tc.toZ(3), 55);

      let sawEnemyTrapped = false;
      let sawBotPop = false;
      let st = api.getState();
      for (let i = 0; i < 320; i++) {
        st = api.stepFrames(1);
        const enemy = getPlayer(st, 'p2');
        if (enemy.state === 'trapped') sawEnemyTrapped = true;
        if (sawEnemyTrapped && enemy.state === 'eliminated' && getPlayer(st, 'bot1').stats.kos >= 1) {
          sawBotPop = true;
          break;
        }
      }
      return {
        sawEnemyTrapped,
        sawBotPop,
        bot1Kos: getPlayer(st, 'bot1').stats.kos,
        enemyState: getPlayer(st, 'p2').state,
      };
      """
  )
  assert res["sawEnemyTrapped"] is True, res
  assert res["sawBotPop"] is True, res
  assert res["bot1Kos"] >= 1 and res["enemyState"] == "eliminated", res


@_t3("3E_bot_ai_tactics")
def test_t3_26_bot_ai_auto_uses_needle_immediately_when_trapped(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  res = h.run_sim_js(
      """
      // Box bot1 in a 1x1 pocket at (4, 6) with walls at (4,5), (4,7), (5,6) and P1's bubble sealing (3, 6),
      // and verify bot1 holding 1 Needle immediately self-rescues upon being trapped!
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3026,
        botBehavior: 'active',
        customGrid: makeGrid({ walls: [[4, 5], [4, 7], [5, 6], [11, 5], [11, 6], [11, 7]] }),
        customSpawns: [
          { id: 'p1', col: 3, row: 6, team: 0, isHuman: true },
          { id: 'bot1', col: 4, row: 6, team: 0, isHuman: false },
          { id: 'bot2', col: 13, row: 2, team: 1, isHuman: true },
          { id: 'bot3', col: 13, row: 10, team: 1, isHuman: true },
        ],
        startingLoadout: {
          p1: { blastRange: 2 },
          bot1: { needles: 1, maxBubbles: 0 },
        },
      });
      api.setDeterministicMode(true);
      const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

      pulseDropBubble('p1');
      steerToWorld('p1', 'p1', tc.toX(1), tc.toZ(6), 45);
      steerToWorld('p1', 'p1', tc.toX(1), tc.toZ(4), 45);

      let sawNeedleEvent = false;
      let st = api.getState();
      for (let i = 0; i < 200; i++) {
        st = api.stepFrames(1);
        if (st.sim.events.some((e) => e.type === 'needle_rescue' && e.playerId === 'bot1')) {
          sawNeedleEvent = true;
          break;
        }
      }
      const bot1 = getPlayer(st, 'bot1');
      return {
        sawNeedleEvent,
        bot1State: bot1.state,
        bot1Needles: bot1.needles,
        bot1Invuln: bot1.invulnTimer,
      };
      """
  )
  assert res["sawNeedleEvent"] is True, res
  assert res["bot1State"] == "alive" and res["bot1Needles"] == 0, res
  assert res["bot1Invuln"] > 1.0, res


# ==============================================================================
# Group 3F: UI Flows, Desktop 2P Keyboard & WebAudio Persistence (6 tests)
# ==============================================================================


@_t3("3F_ui_2p_and_audio_flows")
def test_t3_27_desktop_2p_ui_toggle_and_shared_keyboard_independent_controls(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.clear_diagnostics()

  h.click_testid("btn-play")
  st_sel = h.get_state()
  assert st_sel["uiScreen"] == "select", st_sel

  # Enable 2P toggle via real UI click if not already enabled
  p2_initially = bool((st_sel.get("selectedConfig") or {}).get("p2Enabled"))
  if not p2_initially:
    h.click_testid("btn-toggle-2p")
  h.click_testid("btn-start-match")

  # Re-launch on a clean open grid with p2Enabled: true to verify simultaneous shared-keyboard inputs cleanly
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 3027,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 3, row: 4, team: 0 },
          { id: 'p2', col: 11, row: 8, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      """
  )
  st0 = h.get_state()
  p1_0 = next(p for p in st0["sim"]["players"] if p["id"] == "p1")
  p2_0 = next(p for p in st0["sim"]["players"] if p["id"] == "p2")
  assert p1_0["isHuman"] is True and p2_0["isHuman"] is True

  # Simultaneously hold P1 KeyD (East) + P2 ArrowLeft (West) for 20 frames!
  h.key_down("KeyD")
  h.key_down("ArrowLeft")
  h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(20)")
  h.key_up("KeyD")
  h.key_up("ArrowLeft")

  # Tap Space (P1 drop bubble) and Enter (P2 drop bubble)
  h.tap_key("Space", hold_frames=2)
  st_after = h.tap_key("Enter", hold_frames=2)

  p1_1 = next(p for p in st_after["sim"]["players"] if p["id"] == "p1")
  p2_1 = next(p for p in st_after["sim"]["players"] if p["id"] == "p2")
  owners = {b["ownerId"] for b in st_after["sim"]["bubbles"]}

  assert p1_1["x"] > p1_0["x"] + 1.0, (p1_0, p1_1)
  assert p2_1["x"] < p2_0["x"] - 1.0, (p2_0, p2_1)
  assert "p1" in owners and "p2" in owners, st_after["sim"]["bubbles"]
  h.assert_zero_errors("t3_27_desktop_2p")


@_t3("3F_ui_2p_and_audio_flows")
def test_t3_28_desktop_2p_keyboard_ally_rescue_combo(
    h: QQTangTestHarness,
) -> None:
  _ensure_loaded(h)
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        p2CharacterId: 'wanzi',
        p2Enabled: true,
        seed: 3028,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 6, row: 6, team: 0 },
          { id: 'p2', col: 2, row: 6, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
      });
      api.setDeterministicMode(true);
      """
  )
  # P1 drops bubble with Space and gets trapped after 182 frames
  h.tap_key("Space", hold_frames=2)
  st_trap = h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(205)")
  p1_mid = next(p for p in st_trap["sim"]["players"] if p["id"] == "p1")
  assert p1_mid["state"] == "trapped", p1_mid

  # P2 holds ArrowRight for 55 frames to run East across row 6 and rescue P1!
  h.key_down("ArrowRight")
  st_rescued = h.eval_js(
      "(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(55)"
  )
  h.key_up("ArrowRight")

  p1_end = next(p for p in st_rescued["sim"]["players"] if p["id"] == "p1")
  p2_end = next(p for p in st_rescued["sim"]["players"] if p["id"] == "p2")
  assert p1_end["state"] == "alive", p1_end
  assert p2_end["stats"]["rescues"] == 1, p2_end


@_t3("3F_ui_2p_and_audio_flows")
def test_t3_29_pause_overlay_freezes_simulation_and_resume_restores_exact_tick(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 3029,
        botBehavior: 'active',
      });
      api.setDeterministicMode(true);
      api.stepFrames(45);
      """
  )
  before_pause = h.get_state()
  tick_before = before_pause["sim"]["tick"]
  p1_before = before_pause["sim"]["players"][0]

  # Click HUD pause/home button
  h.click_testid("hud-btn-home")
  paused_state = h.get_state()
  assert paused_state["uiScreen"] == "paused", paused_state

  # Even if wall-clock passes or stepFrames is called while paused, simulation should remain frozen until resumed
  # (or resume restores exact paused state)
  h.click_testid("btn-resume")
  resumed_state = h.get_state()
  assert resumed_state["uiScreen"] == "playing", resumed_state
  assert resumed_state["sim"]["tick"] == tick_before, (
      tick_before,
      resumed_state["sim"]["tick"],
  )
  assert resumed_state["sim"]["players"][0]["x"] == p1_before["x"]

  # Stepping after resume advances normally again
  after_step = h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(10)")
  assert after_step["sim"]["tick"] == tick_before + 10


@_t3("3F_ui_2p_and_audio_flows")
def test_t3_30_pause_restart_resets_match_and_quit_returns_to_select(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'bun_grab',
        arenaId: 'pirate_bay',
        p1CharacterId: 'xiaoqiang',
        seed: 3030,
        botBehavior: 'active',
      });
      api.setDeterministicMode(true);
      api.stepFrames(120);
      """
  )
  assert h.get_state()["sim"]["tick"] >= 120

  # Open Pause -> Restart
  h.click_testid("hud-btn-home")
  assert h.get_state()["uiScreen"] == "paused"
  h.click_testid("btn-restart")
  restarted = h.get_state()
  assert restarted["uiScreen"] == "playing", restarted
  assert restarted["sim"]["tick"] < 15, restarted["sim"]["tick"]
  assert restarted["sim"]["modeId"] == "bun_grab"
  assert restarted["sim"]["arenaId"] == "pirate_bay"

  # Open Pause -> Quit to Select
  h.click_testid("hud-btn-home")
  h.click_testid("btn-quit-select")
  quit_state = h.get_state()
  assert quit_state["uiScreen"] == "select", quit_state
  rect = h.get_testid_rect("btn-start-match")
  assert rect is not None and rect["visible"] is True, rect


@_t3("3F_ui_2p_and_audio_flows")
def test_t3_31_podium_play_again_and_back_to_select_flows(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)

  # Conclude a quick match legitimately (short matchDurationSec = 1.0s = 60 ticks)
  st = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'ice_village',
        p1CharacterId: 'haiwangzi',
        seed: 3031,
        botBehavior: 'active',
        matchDurationSec: 1.0,
      });
      api.setDeterministicMode(true);
      return api.stepFrames(75);
      """
  )
  assert st["uiScreen"] == "podium", st
  overlay = h.get_testid_rect("podium-overlay")
  assert overlay is not None and overlay["visible"] is True, overlay

  # Click Play Again -> fresh match in playing screen!
  h.click_testid("btn-play-again")
  again_st = h.get_state()
  assert again_st["uiScreen"] == "playing", again_st
  assert again_st["sim"]["arenaId"] == "ice_village", again_st
  assert again_st["sim"]["tick"] < 15, again_st

  # Conclude again via short match and test Back to Select
  st2 = h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'ice_village',
        p1CharacterId: 'haiwangzi',
        seed: 3031,
        botBehavior: 'active',
        matchDurationSec: 0.5,
      });
      api.setDeterministicMode(true);
      return api.stepFrames(40);
      """
  )
  assert st2["uiScreen"] == "podium", st2
  h.click_testid("btn-back-select")
  back_st = h.get_state()
  assert back_st["uiScreen"] == "select", back_st


@_t3("3F_ui_2p_and_audio_flows")
def test_t3_32_audio_mute_toggle_persists_across_arena_and_mode_transitions(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.clear_diagnostics()

  h.click_testid("btn-play")
  h.click_testid("btn-start-match")
  st0 = h.get_state()
  initial_muted = bool(st0["audio"]["muted"])

  # Toggle mute ON via real HUD button click
  h.click_testid("hud-btn-audio")
  st1 = h.get_state()
  assert bool(st1["audio"]["muted"]) is (not initial_muted), (st0["audio"], st1["audio"])

  if not st1["audio"]["muted"]:
    h.click_testid("hud-btn-audio")
  assert h.get_state()["audio"]["muted"] is True

  # Transition into boss_golem on pirate_bay: muted state MUST persist while track updates!
  st_boss = h.run_sim_js(
      """
      return api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'pirate_bay',
        p1CharacterId: 'wanzi',
        seed: 3032,
        botBehavior: 'idle',
      });
      """
  )
  assert st_boss["audio"]["muted"] is True, st_boss["audio"]
  assert st_boss["audio"]["currentTrack"] == "boss_golem", st_boss["audio"]

  # Unmute cleanly via HUD button
  h.click_testid("hud-btn-audio")
  assert h.get_state()["audio"]["muted"] is False
  h.assert_zero_errors("t3_32_audio_persistence")
