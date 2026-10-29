#!/usr/bin/env python3
"""Master CLI E2E Test Runner for QQ Tang: Candy Bubble Arena 3D (QQ堂 3D).

Usage:
  python3 -B tests/run_e2e.py --tier all
  python3 -B tests/run_e2e.py --tier 1
  python3 -B tests/run_e2e.py --tier 4 --filter viewport
  python3 -B tests/run_e2e.py --list
"""

from __future__ import annotations

import argparse
import importlib
import json
from pathlib import Path
import sys
import time
import traceback
import unittest

# Ensure tests/ directory is importable regardless of caller's working directory
TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
  sys.path.insert(0, str(TESTS_DIR))

from harness import DEFAULT_PROJECT_ROOT, QQTangTestHarness, TestCaseSpec, TestResult  # pylint: disable=wrong-import-position
from tier1_features import TIER1_TESTS  # pylint: disable=wrong-import-position
from tier2_boundaries import TIER2_TESTS  # pylint: disable=wrong-import-position
from tier3_combinations import TIER3_TESTS  # pylint: disable=wrong-import-position
from tier4_scenarios import TIER4_TESTS  # pylint: disable=wrong-import-position


def load_optional_tier5_tests() -> list[TestCaseSpec]:
  """Loads optional Tier 5 adversarial tests added during Milestone M4 Phase 2."""
  for mod_name in ("tier5_adversarial", "tier5_hardening", "tier5"):
    candidate = TESTS_DIR / f"{mod_name}.py"
    if candidate.is_file():
      mod = importlib.import_module(mod_name)
      specs = getattr(mod, "TIER5_TESTS", None)
      if isinstance(specs, list):
        return list(specs)
  return []


def collect_tests(tier_arg: str, substr_filter: str = "") -> list[TestCaseSpec]:
  tier5 = load_optional_tier5_tests()
  by_tier: dict[str, list[TestCaseSpec]] = {
      "1": list(TIER1_TESTS),
      "2": list(TIER2_TESTS),
      "3": list(TIER3_TESTS),
      "4": list(TIER4_TESTS),
  }
  if tier5:
    by_tier["5"] = tier5

  if tier_arg == "all":
    selected: list[TestCaseSpec] = []
    for k in sorted(by_tier.keys()):
      selected.extend(by_tier[k])
  elif tier_arg in by_tier:
    selected = list(by_tier[tier_arg])
  else:
    raise ValueError(
        f"Unknown --tier={tier_arg!r}; available tiers: {sorted(by_tier.keys()) + ['all']}"
    )

  if substr_filter:
    needle = substr_filter.lower()
    selected = [
        t
        for t in selected
        if needle in t.name.lower() or needle in t.group.lower()
    ]
  return selected


def print_test_catalog(specs: list[TestCaseSpec]) -> None:
  counts: dict[int, int] = {}
  for s in specs:
    counts[s.tier] = counts.get(s.tier, 0) + 1
    print(f"[Tier {s.tier}] {s.group} :: {s.name}")
  print("-" * 76)
  for tier_num in sorted(counts.keys()):
    print(f"Tier {tier_num}: {counts[tier_num]} test cases")
  print(f"Total registered tests: {len(specs)}")


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(
      description="Run QQ Tang 3D Headless WebGL2 E2E Test Suite"
  )
  parser.add_argument(
      "--tier",
      default="all",
      choices=["1", "2", "3", "4", "5", "all"],
      help="Which test tier to execute (default: all).",
  )
  parser.add_argument(
      "--root-dir",
      default=str(DEFAULT_PROJECT_ROOT),
      help="Static web root directory containing index.html.",
  )
  parser.add_argument(
      "--filter",
      default="",
      help="Case-insensitive substring filter on test name or group.",
  )
  parser.add_argument(
      "--list",
      action="store_true",
      help="List matching test cases and counts without launching Chrome.",
  )
  parser.add_argument(
      "--fail-fast",
      action="store_true",
      help="Abort immediately on first failing test case.",
  )
  parser.add_argument(
      "--json-report",
      default="",
      help="Optional output path (e.g. in /tmp) for structured JSON results.",
  )
  args = parser.parse_args(argv)

  selected = collect_tests(args.tier, args.filter)
  if args.list:
    print_test_catalog(selected)
    return 0

  if not selected:
    print("ERROR: 0 test cases matched selection.", file=sys.stderr)
    return 2

  root_dir = Path(args.root_dir).resolve()
  if not (root_dir / "index.html").is_file():
    print(
        f"ERROR: index.html not found under --root-dir={root_dir}",
        file=sys.stderr,
    )
    return 2

  results: list[TestResult] = []
  suite_t0 = time.perf_counter()

  print(
      f"=== QQ Tang 3D E2E Runner | root={root_dir} | tier={args.tier} | "
      f"tests={len(selected)} ==="
  )

  with QQTangTestHarness(root_dir=root_dir) as harness:
    harness.set_viewport(1280, 800, mobile=False, touch=False)
    harness.navigate(wait_qqtang=True)
    harness.assert_zero_errors("initial_boot_load")

    skipped_names: set[str] = set()
    for idx, spec in enumerate(selected, start=1):
      t0 = time.perf_counter()
      passed = False
      skipped = False
      err_msg = ""
      try:
        harness.clear_diagnostics()
        spec.fn(harness)
        harness.assert_zero_errors(spec.name)
        passed = True
      except unittest.SkipTest as skip_exc:
        passed = True
        skipped = True
        skipped_names.add(spec.name)
        err_msg = str(skip_exc)
      except Exception as exc:  # pylint: disable=broad-except
        tb_lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
        err_msg = "".join(tb_lines[-6:]).strip()
        # Restore baseline viewport and page ready state so subsequent tests stay isolated
        try:
          harness.set_viewport(1280, 800, mobile=False, touch=False)
          harness.navigate(wait_qqtang=True)
        except Exception:  # pylint: disable=broad-except
          pass

      dt_ms = (time.perf_counter() - t0) * 1000.0
      results.append(
          TestResult(
              tier=spec.tier,
              name=spec.name,
              group=spec.group,
              passed=passed,
              duration_ms=round(dt_ms, 1),
              error=err_msg,
          )
      )
      status = "SKIP" if skipped else ("PASS" if passed else "FAIL")
      print(
          f"[{idx:03d}/{len(selected):03d}] [{status}] "
          f"(T{spec.tier}:{spec.group}) {spec.name} ({dt_ms:.1f} ms)"
      )
      if skipped and err_msg:
        print(f"    -> skipped: {err_msg}")
      elif not passed:
        print(f"    -> {err_msg}")
        if args.fail_fast:
          break

  suite_sec = time.perf_counter() - suite_t0
  skipped_count = len(skipped_names)
  passed_count = sum(1 for r in results if r.passed and r.name not in skipped_names)
  failed_count = sum(1 for r in results if not r.passed)

  print("\n" + "=" * 76)
  tier_ids = sorted({r.tier for r in results})
  for tid in tier_ids:
    t_res = [r for r in results if r.tier == tid]
    t_pass = sum(1 for r in t_res if r.passed and r.name not in skipped_names)
    t_skip = sum(1 for r in t_res if r.name in skipped_names)
    skip_suffix = f" ({t_skip} skipped)" if t_skip else ""
    print(f"  Tier {tid}: {t_pass}/{len(t_res)} passed{skip_suffix}")
  print("-" * 76)
  skip_summary = f" | {skipped_count} skipped" if skipped_count else ""
  print(
      f"  TOTAL : {passed_count}/{len(results)} passed{skip_summary} | "
      f"{failed_count} failed | {suite_sec:.2f}s"
  )
  print("=" * 76)

  if args.json_report:
    out_path = Path(args.json_report)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "tier": args.tier,
        "root_dir": str(root_dir),
        "total": len(results),
        "passed": passed_count,
        "failed": failed_count,
        "duration_sec": round(suite_sec, 3),
        "results": [
            {
                "tier": r.tier,
                "group": r.group,
                "name": r.name,
                "passed": r.passed,
                "duration_ms": r.duration_ms,
                "error": r.error,
            }
            for r in results
        ],
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

  return 0 if failed_count == 0 else 1


if __name__ == "__main__":
  sys.exit(main())
