#!/usr/bin/env python3
"""Static contracts for graph_engine.cpp (APP_POLICY continuous-control rules).

1. Sample DSP loop that touches Controls ⇒ control_frame(g, node, f)
2. True dual-path (block process_block early-return AND later *_sample loop)
   ⇒ sample-accurate gate (node_needs_sample_accurate_controls / liveParamMods)
3. No stamp_live_param_mods(..., 0) beside a control_frame sample loop
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "native_modules" / "graph_engine" / "graph_engine.cpp"

SAMPLE_LOOP_ALLOWLIST: set[str] = set()
DUAL_PATH_ALLOWLIST: set[str] = set()


def process_functions(text: str) -> list[tuple[str, str]]:
    out = []
    matches = list(re.finditer(r"static void (process_\w+)\(Circuit&", text))
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        out.append((m.group(1), text[start:end]))
    return out


def main() -> int:
    if not SRC.is_file():
        print(f"MISSING {SRC}", file=sys.stderr)
        return 1
    text = SRC.read_text(encoding="utf-8", errors="replace")
    errors: list[str] = []

    if "node_needs_sample_accurate_controls" not in text:
        errors.append("missing node_needs_sample_accurate_controls helper")

    for name, body in process_functions(text):
        has_loop = "for (int f = 0; f < frames" in body
        has_frame = "control_frame(g, node, f)" in body
        touches_controls = (
            "control_effective" in body
            or "control_audio" in body
            or "phase_offset_cycles" in body
            or "shape_param_01" in body
            or "morph_zoh_hold" in body
        )
        if (
            has_loop
            and touches_controls
            and not has_frame
            and name not in SAMPLE_LOOP_ALLOWLIST
        ):
            errors.append(
                f"{name}: sample loop touches Controls but missing control_frame(g, node, f)"
            )

        # True dual-path: early process_block + return, and a later soemdsp_*_sample loop
        block_early = bool(
            re.search(
                r"soemdsp_\w+_process_block\s*\([\s\S]{0,800}?return;",
                body,
            )
        )
        has_sample_api = bool(re.search(r"soemdsp_\w+_sample\s*\(", body)) and has_loop
        if block_early and has_sample_api and name not in DUAL_PATH_ALLOWLIST:
            gated = (
                "node_needs_sample_accurate_controls" in body
                or "liveParamMods" in body
                or "node_has_live_param_mods" in body
            )
            if not gated:
                errors.append(
                    f"{name}: dual-path without sample-accurate gate "
                    "(need node_needs_sample_accurate_controls)"
                )

        if has_frame and "stamp_live_param_mods(g, node, 0)" in body:
            errors.append(
                f"{name}: stamp_live_param_mods(..., 0) with control_frame sample loop"
            )

    if errors:
        print("graph_engine contracts FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("graph_engine contracts OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
