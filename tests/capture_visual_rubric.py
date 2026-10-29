#!/usr/bin/env python3
"""Deterministic Visual Rubric Screenshot Capturer for QQ Tang 3D (AC7 & AC8).

Captures all 6 required Multimodal Visual Judge scene categories plus mobile
portrait (390x844) and iPad landscape (1024x768) HUD layouts into
/tmp/qqtang_visual_rubric/ (never polluting / or CitC), verifying both simulation
state predicates AND ImageMagick pixel statistics on every single image.

When passed --export-root-screenshot, converts the flagship 1280x800 gameplay
frame into <root-dir>/screenshot.jpg via ImageMagick (-quality 88).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
  sys.path.insert(0, str(TESTS_DIR))

from harness import DEFAULT_PROJECT_ROOT, MAGICK_BIN, QQTangTestHarness  # pylint: disable=wrong-import-position


DEFAULT_OUT_DIR = Path("/tmp/qqtang_visual_rubric")


def _save_and_verify(
    h: QQTangTestHarness,
    out_path: Path,
    expected_w: int,
    expected_h: int,
    meta: dict[str, Any],
    manifest: list[dict[str, Any]],
) -> dict[str, Any]:
  h.capture_screenshot(out_path)
  stats = h.inspect_image(out_path)
  if stats["width"] != expected_w or stats["height"] != expected_h:
    raise AssertionError(
        f"{out_path.name}: expected {expected_w}x{expected_h}, got {stats}"
    )
  if stats["std_dev"] <= 0.03:
    raise AssertionError(
        f"{out_path.name}: blank/low-variance screenshot detected: {stats}"
    )
  h.assert_zero_errors(out_path.name)
  entry = {
      "file": out_path.name,
      "path": str(out_path),
      "imageStats": stats,
      "sceneMeta": meta,
  }
  manifest.append(entry)
  print(
      f"[CAPTURED] {out_path.name} ({stats['width']}x{stats['height']}, "
      f"std_dev={stats['std_dev']:.4f}, {stats['bytes']} bytes)"
  )
  return entry


def capture_all_scenes(
    root_dir: Path,
    out_dir: Path,
    export_root_screenshot: bool = False,
) -> list[dict[str, Any]]:
  out_dir.mkdir(parents=True, exist_ok=True)
  manifest: list[dict[str, Any]] = []

  with QQTangTestHarness(root_dir=root_dir) as h:
    # ------------------------------------------------------------------
    # Scene 1: Title Splash & Character/Arena/Mode Select (1280x800)
    # ------------------------------------------------------------------
    h.set_viewport(1280, 800, mobile=False, touch=False)
    h.clear_diagnostics()
    h.navigate(wait_qqtang=True)
    h.eval_js(
        "(window.__QQTANG__ || window.__QQ_TANG__).setDeterministicMode(true);"
        "(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(20);"
    )
    st_title = h.get_state()
    assert st_title["uiScreen"] == "title", st_title
    _save_and_verify(
        h,
        out_dir / "01b_title_splash.png",
        1280,
        800,
        {"uiScreen": st_title["uiScreen"]},
        manifest,
    )

    h.click_testid("btn-play")
    h.eval_js("(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(15)")
    st_sel = h.get_state()
    assert st_sel["uiScreen"] == "select", st_sel
    _save_and_verify(
        h,
        out_dir / "01_title_and_select.png",
        1280,
        800,
        {"uiScreen": st_sel["uiScreen"], "selectedConfig": st_sel.get("selectedConfig")},
        manifest,
    )

    # ------------------------------------------------------------------
    # Scene 2: All 4 Iconic Themed 3D Arenas (1280x800)
    # ------------------------------------------------------------------
    arena_configs = [
        ("02a_arena_candy_town.png", "candy_town", "classic_2v2", "miduo", 7101),
        ("02b_arena_pirate_bay.png", "pirate_bay", "bun_grab", "haiwangzi", 7102),
        ("02c_arena_ice_village.png", "ice_village", "classic_2v2", "wanzi", 7103),
        ("02d_arena_toy_kingdom.png", "toy_kingdom", "classic_2v2", "xiaoqiang", 7104),
    ]
    for fname, arena_id, mode_id, char_id, seed in arena_configs:
      meta = h.run_sim_js(
          f"""
          api.startMatch({{
            modeId: {json.dumps(mode_id)},
            arenaId: {json.dumps(arena_id)},
            p1CharacterId: {json.dumps(char_id)},
            seed: {seed},
            botBehavior: 'active',
            customPickups: [
              {{ type: 'bubble', col: 5, row: 5, spawnGraceSec: 0 }},
              {{ type: 'power', col: 9, row: 5, spawnGraceSec: 0 }},
              {{ type: 'speed', col: 7, row: 8, spawnGraceSec: 0 }},
            ],
          }});
          api.setDeterministicMode(true);
          api.setAutoPlayP1(true);
          const st = api.stepFrames(75);
          return {{
            arenaId: st.sim.arenaId,
            modeId: st.sim.modeId,
            tick: st.sim.tick,
            bubbles: st.sim.bubbles.length,
            pickups: st.sim.pickups.length,
            looseBuns: st.sim.looseBuns.length,
          }};
          """
      )
      _save_and_verify(h, out_dir / fname, 1280, 800, meta, manifest)

    # ------------------------------------------------------------------
    # Scene 3: Active 4-Way Chain Blast + Ticking Sugar Bubble + Giant Water Trap
    # ------------------------------------------------------------------
    blast_meta = h.run_sim_js(
        """
        const arenaState = api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: 'miduo',
          seed: 7203,
          botBehavior: 'idle',
          deterministic: true,
        });
        // Preserve authentic Candy Town cupcakes/peppermints & outer soft blocks while opening the central showcase stage
        const grid = arenaState.sim.grid.map((r) => r.slice());
        for (let r = 4; r <= 8; r++) {
          for (let c = 4; c <= 10; c++) {
            if (grid[r][c] === 2) grid[r][c] = 0;
          }
        }

        api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: 'miduo',
          p2CharacterId: 'wanzi',
          p2Enabled: true,
          seed: 7203,
          botBehavior: 'idle',
          deterministic: true,
          disableRandomDrops: true,
          customGrid: grid,
          customSpawns: [
            { id: 'p1', col: 7, row: 6, team: 0, characterId: 'miduo', isHuman: true },
            { id: 'p2', col: 4, row: 7, team: 0, characterId: 'wanzi', isHuman: true },
            { id: 'bot2', col: 7, row: 8, team: 1, characterId: 'xiaoqiang', isHuman: false },
            { id: 'bot3', col: 5, row: 7, team: 1, characterId: 'haiwangzi', isHuman: false },
          ],
          startingLoadout: {
            p1: { maxBubbles: 4, blastRange: 2, baseSpeed: 7.0, mount: 'turtle' },
            p2: { maxBubbles: 3, blastRange: 1, baseSpeed: 7.0, mount: 'ufo' },
          },
          customPickups: [
            { type: 'power', col: 10, row: 7, spawnGraceSec: 0 },
            { type: 'kick', col: 10, row: 5, spawnGraceSec: 0 },
          ],
        });
        const tc = inferTileCenterCoord(getPlayer(api.getState(), 'p1'));

        // Step A: P2 drops a range-1 bubble at (4, 7) on tick 1 to trap bot3 at (5, 7) cleanly
        // ~40 ticks BEFORE the central chain blast fires, so bot3 sits inside a crystal-clear,
        // 100% unobstructed giant wobbling 3D water-trap bubble facing South (> _ <)!
        pulseDropBubble('p2');
        steerToWorld('p2', 'p2', tc.toX(4), tc.toZ(5), 36);

        // Step B: At tick ~38, P1 (on Turtle) drops linked range-2 bubbles at (7, 6) and (8, 6),
        // then retreats safely via (8, 5) -> (9, 5) and faces South (+Z).
        pulseDropBubble('p1');
        steerToWorld('p1', 'p1', tc.toX(8), tc.toZ(6), 20);
        pulseDropBubble('p1');
        steerToWorld('p1', 'p1', tc.toX(8), tc.toZ(5), 20);
        steerToWorld('p1', 'p1', tc.toX(9), tc.toZ(5), 20);
        moveHold('p1', 0, 1, 2);

        // Step C: P2 drops a fresh ticking glossy sugar bubble at (4, 5), glides to (5, 5), and faces South (+Z).
        api.stepFrames(50);
        pulseDropBubble('p2');
        steerToWorld('p2', 'p2', tc.toX(5), tc.toZ(5), 20);
        moveHold('p2', 0, 1, 2);

        let st = api.getState();
        for (let i = 0; i < 120; i++) {
          st = api.stepFrames(1);
          const activeChain = st.sim.blasts.length >= 2 && st.sim.blasts[0].remainingSec > 0.20;
          const trappedIds = st.sim.players.filter((p) => p.state === 'trapped').map((p) => p.id);
          if (activeChain && trappedIds.includes('bot3') && trappedIds.includes('bot2') && st.sim.bubbles.length >= 1) {
            st = api.stepFrames(3);
            break;
          }
        }
        return {
          blasts: st.sim.blasts.length,
          trappedPlayers: st.sim.players.filter((p) => p.state === 'trapped').map((p) => p.id),
          tickingBubbles: st.sim.bubbles.length,
        };
        """
    )
    assert blast_meta["blasts"] >= 1, blast_meta
    assert len(blast_meta["trappedPlayers"]) >= 2, blast_meta
    assert blast_meta["tickingBubbles"] >= 1, blast_meta
    _save_and_verify(
        h,
        out_dir / "03_chain_blast_and_trapped.png",
        1280,
        800,
        blast_meta,
        manifest,
    )

    # ------------------------------------------------------------------
    # Scene 4a & 4b: Rideable 3D Turtle Mount & Rideable 3D UFO Mount
    # ------------------------------------------------------------------
    turtle_meta = h.run_sim_js(
        """
        const base = api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: 'miduo',
          seed: 7301,
          botBehavior: 'idle',
          deterministic: true,
        });
        const grid = base.sim.grid.map((r) => r.slice());
        for (let r = 5; r <= 7; r++) {
          for (let c = 5; c <= 9; c++) {
            if (grid[r][c] === 2) grid[r][c] = 0;
          }
        }
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: 'miduo',
          p2CharacterId: 'wanzi',
          p2Enabled: true,
          seed: 7301,
          botBehavior: 'idle',
          deterministic: true,
          customGrid: grid,
          customSpawns: [
            { id: 'p1', col: 6, row: 6, team: 0, characterId: 'miduo', isHuman: true },
            { id: 'p2', col: 8, row: 6, team: 0, characterId: 'wanzi', isHuman: true },
            { id: 'bot2', col: 13, row: 1, team: 1, characterId: 'xiaoqiang', isHuman: false },
            { id: 'bot3', col: 13, row: 11, team: 1, characterId: 'haiwangzi', isHuman: false },
          ],
          startingLoadout: {
            p1: { mount: 'turtle' },
            p2: { mount: 'turtle' },
          },
          customPickups: [
            { type: 'turtle', col: 7, row: 5, spawnGraceSec: 0 },
            { type: 'needle', col: 5, row: 7, spawnGraceSec: 0 },
            { type: 'speed', col: 9, row: 7, spawnGraceSec: 0 },
          ],
        });
        moveHold('p1', 0, 1, 6);
        const st = moveHold('p2', 0, 1, 6);
        return {
          p1Mount: getPlayer(st, 'p1').mount,
          p2Mount: getPlayer(st, 'p2').mount,
          pickups: st.sim.pickups.length,
        };
        """
    )
    assert turtle_meta["p1Mount"] == "turtle", turtle_meta
    _save_and_verify(
        h, out_dir / "04a_mount_turtle.png", 1280, 800, turtle_meta, manifest
    )

    ufo_meta = h.run_sim_js(
        """
        const base = api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'toy_kingdom',
          p1CharacterId: 'wanzi',
          seed: 7302,
          botBehavior: 'idle',
          deterministic: true,
        });
        const grid = base.sim.grid.map((r) => r.slice());
        for (let r = 5; r <= 7; r++) {
          for (let c = 6; c <= 8; c++) {
            if (grid[r][c] === 2) grid[r][c] = 0;
          }
        }
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'toy_kingdom',
          p1CharacterId: 'wanzi',
          p2CharacterId: 'haiwangzi',
          p2Enabled: true,
          seed: 7302,
          botBehavior: 'idle',
          deterministic: true,
          customGrid: grid,
          customSpawns: [
            { id: 'p1', col: 6, row: 6, team: 0, characterId: 'wanzi', isHuman: true },
            { id: 'p2', col: 8, row: 6, team: 0, characterId: 'haiwangzi', isHuman: true },
            { id: 'bot2', col: 13, row: 1, team: 1, characterId: 'miduo', isHuman: false },
            { id: 'bot3', col: 13, row: 11, team: 1, characterId: 'xiaoqiang', isHuman: false },
          ],
          startingLoadout: {
            p1: { mount: 'ufo' },
            p2: { mount: 'ufo' },
          },
          customPickups: [
            { type: 'ufo', col: 7, row: 5, spawnGraceSec: 0 },
            { type: 'shield', col: 7, row: 7, spawnGraceSec: 0 },
          ],
        });
        moveHold('p1', 0, 1, 6);
        const st = moveHold('p2', 0, 1, 6);
        return {
          p1Mount: getPlayer(st, 'p1').mount,
          p1Col: getPlayer(st, 'p1').col,
          p1Row: getPlayer(st, 'p1').row,
        };
        """
    )
    assert ufo_meta["p1Mount"] == "ufo", ufo_meta
    _save_and_verify(
        h, out_dir / "04b_mount_ufo.png", 1280, 800, ufo_meta, manifest
    )

    # ------------------------------------------------------------------
    # Scene 5: Mechanical Golem Boss Battle + Floor Hazard Telegraph + HP Bar
    # ------------------------------------------------------------------
    boss_meta = h.run_sim_js(
        """
        api.startMatch({
          modeId: 'boss_golem',
          arenaId: 'pirate_bay',
          p1CharacterId: 'haiwangzi',
          seed: 7405,
          botBehavior: 'active',
          deterministic: true,
          startingLoadout: {
            p1: { maxBubbles: 3, blastRange: 3, mount: 'ufo' },
          },
        });
        api.setAutoPlayP1(true);
        let st = api.getState();
        // Step until Boss is actively projecting floor warning telegraphTiles!
        for (let i = 0; i < 600; i++) {
          st = api.stepFrames(1);
          if (
            st.sim.boss &&
            st.sim.boss.state === 'telegraph' &&
            st.sim.boss.telegraphTiles.length >= 4 &&
            st.sim.boss.telegraphRemainingSec > 0.45 &&
            i > 30
          ) {
            break;
          }
        }
        return {
          bossState: st.sim.boss.state,
          bossHp: st.sim.boss.hp,
          bossMaxHp: st.sim.boss.maxHp,
          attackType: st.sim.boss.attackType,
          telegraphCount: st.sim.boss.telegraphTiles.length,
        };
        """
    )
    assert boss_meta["bossState"] == "telegraph", boss_meta
    assert boss_meta["telegraphCount"] > 0, boss_meta
    _save_and_verify(
        h,
        out_dir / "05_boss_mechanical_golem.png",
        1280,
        800,
        boss_meta,
        manifest,
    )

    # ------------------------------------------------------------------
    # Scene 6: 3D Stepped 1st/2nd/3rd Victory Podium + Candy Confetti
    # ------------------------------------------------------------------
    podium_meta = h.run_sim_js(
        """
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: 'miduo',
          seed: 7506,
          botBehavior: 'active',
          deterministic: true,
        });
        api.setAutoPlayP1(true);
        let st = api.getState();
        let steps = 0;
        while (steps < 10000 && st.sim && st.sim.phase === 'playing') {
          st = api.stepFrames(60);
          steps += 60;
        }
        // Step 30 frames into Podium celebration so confetti & character bounce animations shine
        st = api.stepFrames(30);
        return {
          uiScreen: st.uiScreen,
          phase: st.sim.phase,
          rankings: st.sim.rankings,
        };
        """
    )
    assert podium_meta["uiScreen"] == "podium", podium_meta
    _save_and_verify(
        h, out_dir / "06_victory_podium.png", 1280, 800, podium_meta, manifest
    )

    # Also capture 390x844 Portrait Podium to verify unclipped 1st-4th pedestals (P5)
    h.set_viewport(390, 844, mobile=True, touch=True)
    podium_390_st = h.eval_js(
        "(window.__QQTANG__ || window.__QQ_TANG__).stepFrames(2)"
    )
    assert podium_390_st["uiScreen"] == "podium", podium_390_st
    _save_and_verify(
        h,
        out_dir / "podium_390x844.png",
        390,
        844,
        {"uiScreen": podium_390_st["uiScreen"], "viewport": "390x844"},
        manifest,
    )

    # ------------------------------------------------------------------
    # Scene 7, 8 & 9: Mobile Portrait (390x844), iPad (1024x768) & Mobile Landscape (844x390)
    # ------------------------------------------------------------------
    h.set_viewport(390, 844, mobile=True, touch=True)
    portrait_meta = h.run_sim_js(
        """
        api.startMatch({
          modeId: 'classic_2v2',
          arenaId: 'candy_town',
          p1CharacterId: 'miduo',
          seed: 7607,
          botBehavior: 'active',
          deterministic: true,
        });
        api.setAutoPlayP1(true);
        const st = api.stepFrames(65);
        return {
          viewportWidth: st.render.viewportWidth,
          viewportHeight: st.render.viewportHeight,
          cameraDistance: st.render.cameraDistance,
        };
        """
    )
    audit_390 = h.audit_viewport_and_hud()
    assert audit_390["scrollWidth"] <= 390 and audit_390["scrollHeight"] <= 844, audit_390
    assert audit_390["controlCount"] <= 6 and audit_390["overlaps"] == [], audit_390
    _save_and_verify(
        h,
        out_dir / "07_mobile_portrait_390x844.png",
        390,
        844,
        {**portrait_meta, "hudControlCount": audit_390["controlCount"]},
        manifest,
    )

    h.set_viewport(1024, 768, mobile=True, touch=True)
    ipad_meta = h.run_sim_js(
        """
        api.startMatch({
          modeId: 'bun_grab',
          arenaId: 'ice_village',
          p1CharacterId: 'wanzi',
          seed: 7608,
          botBehavior: 'active',
          deterministic: true,
        });
        api.setAutoPlayP1(true);
        const st = api.stepFrames(85);
        return {
          viewportWidth: st.render.viewportWidth,
          viewportHeight: st.render.viewportHeight,
          looseBuns: st.sim.looseBuns.length,
        };
        """
    )
    audit_1024 = h.audit_viewport_and_hud()
    assert audit_1024["scrollWidth"] <= 1024 and audit_1024["scrollHeight"] <= 768, audit_1024
    assert audit_1024["controlCount"] <= 6 and audit_1024["overlaps"] == [], audit_1024
    _save_and_verify(
        h,
        out_dir / "08_ipad_1024x768.png",
        1024,
        768,
        {**ipad_meta, "hudControlCount": audit_1024["controlCount"]},
        manifest,
    )

    h.set_viewport(844, 390, mobile=True, touch=True)
    landscape_meta = h.run_sim_js(
        """
        api.startMatch({
          modeId: 'bun_grab',
          arenaId: 'pirate_bay',
          p1CharacterId: 'haiwangzi',
          seed: 7609,
          botBehavior: 'active',
          deterministic: true,
        });
        api.setAutoPlayP1(true);
        const st = api.stepFrames(75);
        return {
          viewportWidth: st.render.viewportWidth,
          viewportHeight: st.render.viewportHeight,
          cameraDistance: st.render.cameraDistance,
        };
        """
    )
    audit_844 = h.audit_viewport_and_hud()
    assert audit_844["scrollWidth"] <= 844 and audit_844["scrollHeight"] <= 390, audit_844
    assert audit_844["controlCount"] <= 6 and audit_844["overlaps"] == [], audit_844
    _save_and_verify(
        h,
        out_dir / "09_mobile_landscape_844x390.png",
        844,
        390,
        {**landscape_meta, "hudControlCount": audit_844["controlCount"]},
        manifest,
    )

    if export_root_screenshot:
      src_png = out_dir / "03_chain_blast_and_trapped.png"
      dest_jpg = root_dir / "screenshot.jpg"
      subprocess.run(
          [MAGICK_BIN, str(src_png), "-quality", "88", str(dest_jpg)],
          cwd="/tmp",
          check=True,
          timeout=20,
      )
      jpg_stats = h.inspect_image(dest_jpg)
      assert jpg_stats["width"] == 1280 and jpg_stats["height"] == 800, jpg_stats
      assert jpg_stats["std_dev"] > 0.04, jpg_stats
      print(
          f"[EXPORTED] {dest_jpg} ({jpg_stats['width']}x{jpg_stats['height']}, "
          f"{jpg_stats['bytes']} bytes)"
      )

  manifest_path = out_dir / "manifest.json"
  manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
  print(f"Saved {len(manifest)}-scene visual rubric manifest -> {manifest_path}")
  return manifest


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(
      description="Capture QQ Tang 3D Multimodal Visual Rubric Screenshots"
  )
  parser.add_argument(
      "--root-dir",
      default=str(DEFAULT_PROJECT_ROOT),
      help="Static web root directory containing index.html.",
  )
  parser.add_argument(
      "--out-dir",
      default=str(DEFAULT_OUT_DIR),
      help="Output directory in /tmp for captured rubric PNGs.",
  )
  parser.add_argument(
      "--export-root-screenshot",
      action="store_true",
      help="Also export flagship 1280x800 gameplay capture to <root-dir>/screenshot.jpg.",
  )
  args = parser.parse_args(argv)

  root_dir = Path(args.root_dir).resolve()
  out_dir = Path(args.out_dir).resolve()
  if not str(out_dir).startswith("/tmp"):
    raise RuntimeError(
        f"--out-dir must reside under /tmp to protect / disk quota, got: {out_dir}"
    )

  capture_all_scenes(
      root_dir=root_dir,
      out_dir=out_dir,
      export_root_screenshot=bool(args.export_root_screenshot),
  )
  return 0


if __name__ == "__main__":
  sys.exit(main())
