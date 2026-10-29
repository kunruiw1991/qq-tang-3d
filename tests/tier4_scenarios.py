#!/usr/bin/env python3
"""Tier 4 End-to-End Real-World Scenarios & 4-Viewport UX Audits (20 tests, >=18 req).

Covers:
1. All 12 (4 Arenas x 3 Modes) full UI-driven playthroughs rotated across all 4
   playable classic characters (MiDuo, XiaoQiang, HaiWangZi, WanZi):
   Title -> Select cards -> Start Match -> Autonomous BotAI full match -> Podium.
2. Multi-viewport layout, zero-scrollbar, <=6 clickable HUD cap, >=64x64px touch
   target, zero-overlap, live dynamic resize, iPad touch-only gameplay,
   5-year-old icon-first UX, and gbrowser CLI (--debug-port) interoperability
   across 1280x800, 1024x768, 844x390, and 390x844 (AC1, AC5, AC6).
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
from typing import Any, Callable
import unittest

from harness import GBROWSER_BIN, QQTangTestHarness, TestCaseSpec


TIER4_TESTS: list[TestCaseSpec] = []


def _t4(
    group: str,
) -> Callable[
    [Callable[[QQTangTestHarness], None]], Callable[[QQTangTestHarness], None]
]:
  def decorator(
      fn: Callable[[QQTangTestHarness], None],
  ) -> Callable[[QQTangTestHarness], None]:
    TIER4_TESTS.append(
        TestCaseSpec(tier=4, name=fn.__name__, group=group, fn=fn)
    )
    return fn

  return decorator


def _run_full_ui_playthrough(
    h: QQTangTestHarness,
    *,
    char_id: str,
    arena_id: str,
    mode_id: str,
) -> dict[str, Any]:
  """Drives a 100% genuine UI-to-Podium playthrough via real clicks & stepping."""
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.clear_diagnostics()
  h.navigate(wait_qqtang=True)

  # 1. Title screen -> click Play
  st_title = h.get_state()
  assert st_title["uiScreen"] == "title", st_title
  h.click_testid("btn-play")

  # 2. Select screen -> choose Character, Arena, Mode, ensure 1P, and Start Match
  st_sel = h.get_state()
  assert st_sel["uiScreen"] == "select", st_sel

  if (st_sel.get("selectedConfig") or {}).get("p2Enabled"):
    h.click_testid("btn-toggle-2p")

  h.click_testid(f"char-card-{char_id}")
  h.click_testid(f"arena-card-{arena_id}")
  h.click_testid(f"mode-card-{mode_id}")
  h.click_testid("btn-start-match")

  # 3. Verify active 3D match initialized with exact selected config
  st_start = h.get_state()
  assert st_start["uiScreen"] == "playing", st_start
  assert st_start["sim"] is not None, st_start
  assert st_start["sim"]["arenaId"] == arena_id, st_start["sim"]
  assert st_start["sim"]["modeId"] == mode_id, st_start["sim"]
  p1_start = next(p for p in st_start["sim"]["players"] if p["id"] == "p1")
  assert p1_start["characterId"] == char_id, p1_start
  assert st_start["render"]["webgl2"] is True, st_start["render"]
  assert st_start["render"]["triangles"] > 0, st_start["render"]

  # 4. Run full autonomous match to natural completion (up to 12,000 fixed frames)
  summary = h.run_sim_js(
      """
      api.setDeterministicMode(true);
      api.setAutoPlayP1(true);
      let st = api.getState();
      let stepsRun = 0;
      const maxFrames = 12000;
      const batch = 60;
      while (stepsRun < maxFrames && st.sim && st.sim.phase === 'playing') {
        st = api.stepFrames(batch);
        stepsRun += batch;
      }
      // Step a few extra frames on podium so confetti & podium meshes render
      st = api.stepFrames(15);
      const p1 = getPlayer(st, 'p1');
      const totalBubblesPlaced = st.sim.players.reduce(
        (acc, p) => acc + (p.stats?.bubblesPlaced || 0),
        0
      );
      return {
        stepsRun,
        uiScreen: st.uiScreen,
        phase: st.sim.phase,
        winningTeam: st.sim.winningTeam,
        p1Distance: p1.stats.distanceMoved,
        p1Bubbles: p1.stats.bubblesPlaced,
        totalBubblesPlaced,
        teamScores: st.sim.teamScores,
        boss: st.sim.boss
          ? { hp: st.sim.boss.hp, maxHp: st.sim.boss.maxHp, state: st.sim.boss.state }
          : null,
        rankings: st.sim.rankings,
        render: st.render,
      };
      """
  )

  # 5. Assert genuine gameplay, natural conclusion, Podium transition & 0 errors
  assert summary["phase"] in ("victory", "defeat"), summary
  assert summary["uiScreen"] == "podium", summary
  assert summary["p1Distance"] > 5.0, summary
  assert summary["totalBubblesPlaced"] > 0, summary
  assert len(summary["rankings"]) == 4, summary
  ranks = [r["rank"] for r in summary["rankings"]]
  assert ranks == [1, 2, 3, 4], summary["rankings"]

  if mode_id == "bun_grab":
    best_buns = max(
        summary["teamScores"]["blue"], summary["teamScores"]["red"]
    )
    assert best_buns >= 1, summary
  elif mode_id == "boss_golem":
    assert summary["boss"] is not None, summary
    assert summary["boss"]["hp"] < summary["boss"]["maxHp"], summary
    if summary["phase"] == "victory":
      assert summary["boss"]["hp"] == 0, summary

  podium_rect = h.get_testid_rect("podium-overlay")
  assert podium_rect is not None and podium_rect["visible"] is True, podium_rect
  assert summary["render"]["drawCalls"] > 0, summary["render"]
  h.assert_zero_errors(f"playthrough_{arena_id}_{mode_id}_{char_id}")
  return summary


# ==============================================================================
# Group 4A: 12 Full UI-to-Podium Playthroughs (4 Arenas x 3 Modes x 4 Cast)
# ==============================================================================


@_t4("4A_full_ui_playthroughs")
def test_t4_01_playthrough_candy_town_classic_2v2_miduo(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="miduo", arena_id="candy_town", mode_id="classic_2v2"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_02_playthrough_candy_town_bun_grab_xiaoqiang(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="xiaoqiang", arena_id="candy_town", mode_id="bun_grab"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_03_playthrough_candy_town_boss_golem_haiwangzi(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="haiwangzi", arena_id="candy_town", mode_id="boss_golem"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_04_playthrough_pirate_bay_classic_2v2_wanzi(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="wanzi", arena_id="pirate_bay", mode_id="classic_2v2"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_05_playthrough_pirate_bay_bun_grab_miduo(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="miduo", arena_id="pirate_bay", mode_id="bun_grab"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_06_playthrough_pirate_bay_boss_golem_xiaoqiang(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="xiaoqiang", arena_id="pirate_bay", mode_id="boss_golem"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_07_playthrough_ice_village_classic_2v2_haiwangzi(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="haiwangzi", arena_id="ice_village", mode_id="classic_2v2"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_08_playthrough_ice_village_bun_grab_wanzi(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="wanzi", arena_id="ice_village", mode_id="bun_grab"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_09_playthrough_ice_village_boss_golem_miduo(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="miduo", arena_id="ice_village", mode_id="boss_golem"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_10_playthrough_toy_kingdom_classic_2v2_xiaoqiang(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="xiaoqiang", arena_id="toy_kingdom", mode_id="classic_2v2"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_11_playthrough_toy_kingdom_bun_grab_haiwangzi(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="haiwangzi", arena_id="toy_kingdom", mode_id="bun_grab"
  )


@_t4("4A_full_ui_playthroughs")
def test_t4_12_playthrough_toy_kingdom_boss_golem_wanzi(
    h: QQTangTestHarness,
) -> None:
  _run_full_ui_playthrough(
      h, char_id="wanzi", arena_id="toy_kingdom", mode_id="boss_golem"
  )


# ==============================================================================
# Group 4B: Multi-Viewport, Kid UX, Touch Controls & gbrowser CLI Audits (8 tests)
# ==============================================================================


def _assert_viewport_all_screens(
    h: QQTangTestHarness,
    *,
    width: int,
    height: int,
    mobile: bool,
    touch: bool,
    require_touch_64px: bool,
) -> None:
  dims = h.set_viewport(width, height, mobile=mobile, touch=touch)
  assert dims["innerWidth"] == width and dims["innerHeight"] == height, dims
  h.clear_diagnostics()
  h.navigate(wait_qqtang=True)

  # 1. Title screen zero-scroll audit
  audit_title = h.audit_viewport_and_hud()
  assert audit_title["innerWidth"] == width and audit_title["innerHeight"] == height, audit_title
  assert audit_title["scrollWidth"] <= width and audit_title["scrollHeight"] <= height, audit_title
  assert audit_title["overlaps"] == [], audit_title

  # 2. Select screen zero-scroll audit
  h.click_testid("btn-play")
  audit_sel = h.audit_viewport_and_hud()
  assert audit_sel["scrollWidth"] <= width and audit_sel["scrollHeight"] <= height, audit_sel

  # 3. Active Gameplay HUD strict audit (<= 6 clickable controls, 0 overlaps, >=64x64px on touch)
  h.click_testid("btn-start-match")
  h.eval_js(
      "(window.__QQTANG__ || window.__QQ_TANG__).setDeterministicMode(true);"
      "(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(15);"
  )
  audit_hud = h.audit_viewport_and_hud()
  assert audit_hud["scrollWidth"] <= width and audit_hud["scrollHeight"] <= height, audit_hud
  assert 1 <= audit_hud["controlCount"] <= 6, audit_hud
  assert audit_hud["joystickChildButtons"] == 0, audit_hud
  assert audit_hud["overlaps"] == [], audit_hud

  for ctrl in audit_hud["controls"]:
    assert ctrl["left"] >= -0.5 and ctrl["top"] >= -0.5, (ctrl, width, height)
    assert ctrl["right"] <= width + 0.5 and ctrl["bottom"] <= height + 0.5, (
        ctrl,
        width,
        height,
    )
    if require_touch_64px:
      assert ctrl["width"] >= 63.5 and ctrl["height"] >= 63.5, (
          f"Touch target < 64px on {width}x{height}: {ctrl}"
      )

  # Verify real WebGL2 screenshot has exact pixel dimensions and non-blank content
  shot = h.capture_screenshot()
  img = h.inspect_image(shot)
  assert img["width"] == width and img["height"] == height, img
  assert img["std_dev"] > 0.03, f"Blank/flat render on {width}x{height}: {img}"

  # 4. Podium screen zero-scroll audit
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 4099,
        botBehavior: 'active',
        matchDurationSec: 0.5,
      });
      api.setDeterministicMode(true);
      api.stepFrames(40);
      """
  )
  audit_podium = h.audit_viewport_and_hud()
  assert audit_podium["scrollWidth"] <= width and audit_podium["scrollHeight"] <= height, audit_podium
  h.assert_zero_errors(f"viewport_{width}x{height}")


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_13_viewport_desktop_1280x800_zero_scroll_hud_and_canvas_audit(
    h: QQTangTestHarness,
) -> None:
  _assert_viewport_all_screens(
      h,
      width=1280,
      height=800,
      mobile=False,
      touch=False,
      require_touch_64px=False,
  )


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_14_viewport_ipad_landscape_1024x768_touch_targets_and_hud_audit(
    h: QQTangTestHarness,
) -> None:
  _assert_viewport_all_screens(
      h,
      width=1024,
      height=768,
      mobile=True,
      touch=True,
      require_touch_64px=True,
  )


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_15_viewport_mobile_landscape_844x390_short_height_fit_and_touch_audit(
    h: QQTangTestHarness,
) -> None:
  _assert_viewport_all_screens(
      h,
      width=844,
      height=390,
      mobile=True,
      touch=True,
      require_touch_64px=True,
  )


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_16_viewport_mobile_portrait_390x844_narrow_width_fit_and_touch_audit(
    h: QQTangTestHarness,
) -> None:
  _assert_viewport_all_screens(
      h,
      width=390,
      height=844,
      mobile=True,
      touch=True,
      require_touch_64px=True,
  )


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_17_live_mid_match_resize_across_all_four_viewports_adapts_camera(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'boss_golem',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 4017,
        botBehavior: 'active',
      });
      api.setDeterministicMode(true);
      api.stepFrames(20);
      """
  )

  sequence = [
      (1280, 800, False, False),
      (1024, 768, True, True),
      (844, 390, True, True),
      (390, 844, True, True),
      (1280, 800, False, False),
  ]
  cam_distances: dict[str, float] = {}
  for w, ht, mob, tch in sequence:
    h.set_viewport(w, ht, mobile=mob, touch=tch)
    st = h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(5)")
    audit = h.audit_viewport_and_hud()
    assert audit["innerWidth"] == w and audit["innerHeight"] == ht, audit
    assert audit["scrollWidth"] <= w and audit["scrollHeight"] <= ht, audit
    assert st["render"]["viewportWidth"] == w and st["render"]["viewportHeight"] == ht, st["render"]
    cam_distances[f"{w}x{ht}"] = float(st["render"]["cameraDistance"])

  # Narrow 390x844 portrait requires camera pull-back relative to wide 1280x800
  # so all 15 arena columns remain visible without horizontal clipping!
  assert cam_distances["390x844"] > cam_distances["1280x800"], cam_distances
  h.assert_zero_errors("t4_17_live_resize")
  h.set_viewport(1280, 800, mobile=False, touch=False)


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_18_ipad_touch_only_gameplay_virtual_joystick_bubble_and_needle(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1024, 768, mobile=True, touch=True)
  h.clear_diagnostics()
  h.navigate(wait_qqtang=True)

  h.click_testid("btn-play")
  h.click_testid("btn-start-match")

  # Re-start on an open grid with 1 Needle so we can verify touch joystick + touch bubble + touch needle cleanly
  h.run_sim_js(
      """
      api.startMatch({
        modeId: 'classic_2v2',
        arenaId: 'candy_town',
        p1CharacterId: 'miduo',
        seed: 4018,
        botBehavior: 'idle',
        customGrid: makeGrid(),
        customSpawns: [
          { id: 'p1', col: 5, row: 6, team: 0 },
          { id: 'bot1', col: 1, row: 1, team: 0 },
          { id: 'bot2', col: 13, row: 1, team: 1 },
          { id: 'bot3', col: 13, row: 11, team: 1 },
        ],
        startingLoadout: {
          p1: { needles: 1, maxBubbles: 2 },
        },
      });
      api.setDeterministicMode(true);
      """
  )
  p0 = next(p for p in h.get_state()["sim"]["players"] if p["id"] == "p1")

  # 1. Drag virtual joystick East (+42px, 0) for 22 frames
  st_east = h.drag_testid("hud-joystick", dx=42, dy=0, hold_frames=22)
  p_east = next(p for p in st_east["sim"]["players"] if p["id"] == "p1")
  assert p_east["x"] > p0["x"] + 0.9, (p0, p_east)

  # 2. Drag virtual joystick South (0, +42px) for 22 frames
  st_south = h.drag_testid("hud-joystick", dx=0, dy=42, hold_frames=22)
  p_south = next(p for p in st_south["sim"]["players"] if p["id"] == "p1")
  assert p_south["z"] > p_east["z"] + 0.9, (p_east, p_south)

  # 3. Tap HUD Bubble button via touch/click -> drops Sugar Bubble on current tile!
  bubble_btn = h.get_testid_rect("hud-btn-bubble")
  assert bubble_btn is not None and bubble_btn["visible"] is True, bubble_btn
  assert bubble_btn["width"] >= 64 and bubble_btn["height"] >= 64, bubble_btn
  h.click_testid("hud-btn-bubble")
  st_drop = h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(2)")
  assert len(st_drop["sim"]["bubbles"]) == 1, st_drop["sim"]["bubbles"]

  # 4. Let bubble detonate to trap P1, then tap HUD Needle button to self-rescue!
  st_trapped = h.eval_js(
      "(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(182)"
  )
  p_trapped = next(p for p in st_trapped["sim"]["players"] if p["id"] == "p1")
  assert p_trapped["state"] == "trapped", p_trapped

  item_btn = h.get_testid_rect("hud-btn-item")
  assert item_btn is not None and item_btn["visible"] is True, item_btn
  assert item_btn["width"] >= 64 and item_btn["height"] >= 64, item_btn
  h.click_testid("hud-btn-item")
  st_rescued = h.eval_js(
      "(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(2)"
  )
  p_rescued = next(p for p in st_rescued["sim"]["players"] if p["id"] == "p1")
  assert p_rescued["state"] == "alive" and p_rescued["needles"] == 0, p_rescued

  h.assert_zero_errors("t4_18_ipad_touch_only")
  h.set_viewport(1280, 800, mobile=False, touch=False)


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_19_kid_friendly_icon_first_ux_zero_walls_of_text_audit(
    h: QQTangTestHarness,
) -> None:
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)

  def inspect_screen_ux() -> dict[str, Any]:
    return h.eval_js(
        """(() => {
          const isVisible = (el) => {
            let cur = el;
            while (cur && cur.nodeType === 1) {
              if (cur.hidden || cur.getAttribute('aria-hidden') === 'true') return false;
              const cs = window.getComputedStyle(cur);
              if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
              cur = cur.parentElement;
            }
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          const svgCount = Array.from(document.querySelectorAll('svg')).filter(isVisible).length;
          const longTextBlocks = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue;
            if (!isVisible(parent)) continue;
            const txt = (node.nodeValue || '').replace(/\\s+/g, ' ').trim();
            if (txt.length > 90) {
              longTextBlocks.push(txt);
            }
          }
          return { svgCount, longTextBlocks };
        })()"""
    )

  # Title screen
  ux_title = inspect_screen_ux()
  assert ux_title["svgCount"] >= 1, ux_title
  assert ux_title["longTextBlocks"] == [], ux_title

  # Select screen
  h.click_testid("btn-play")
  ux_select = inspect_screen_ux()
  assert ux_select["svgCount"] >= 4, ux_select
  assert ux_select["longTextBlocks"] == [], ux_select

  # Active Match HUD
  h.click_testid("btn-start-match")
  ux_playing = inspect_screen_ux()
  assert ux_playing["svgCount"] >= 3, ux_playing
  assert ux_playing["longTextBlocks"] == [], ux_playing


@_t4("4B_multi_viewport_and_touch_ux")
def test_t4_20_gbrowser_cli_debug_port_interoperability_and_clean_session(
    h: QQTangTestHarness,
) -> None:
  if not (Path(GBROWSER_BIN).is_file() or shutil.which(GBROWSER_BIN)):
    raise unittest.SkipTest("GBROWSER_BIN binary not installed in environment")
  h.set_viewport(1280, 800, mobile=False, touch=False)
  h.navigate(wait_qqtang=True)
  h.clear_diagnostics()

  proc = h.run_gbrowser_cli([
      "eval",
      h.http_server.base_url,
      (
          "JSON.stringify({"
          "hasApi: Boolean(window.__QQTANG__ || window.__QQ_TANG__),"
          "screen: (window.__QQTANG__ || window.__QQ_TANG__).getState().uiScreen,"
          "webgl2: (window.__QQTANG__ || window.__QQ_TANG__).getState().render.webgl2"
          "})"
      ),
  ])
  assert proc.returncode == 0, (proc.returncode, proc.stdout, proc.stderr)
  out_lines = [
      ln.strip() for ln in proc.stdout.strip().splitlines() if ln.strip()
  ]
  assert out_lines, (proc.stdout, proc.stderr)
  raw_out = out_lines[-1]
  for ln in reversed(out_lines):
    if ln.startswith("JS Result:"):
      raw_out = ln[len("JS Result:") :].strip()
      break
    if ln.startswith("{") or ln.startswith('"'):
      raw_out = ln
      break
  # gbrowser eval may print a JSON-encoded string or raw JSON object
  parsed = json.loads(raw_out)
  if isinstance(parsed, str):
    parsed = json.loads(parsed)
  assert parsed["hasApi"] is True, parsed
  assert parsed["webgl2"] is True, parsed
  h.assert_zero_errors("t4_20_gbrowser_cli")
