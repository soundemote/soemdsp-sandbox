#!/usr/bin/env python3
"""Classify *-worklet-evaluator / *-live-evaluator orphans vs still-referenced."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

index = (PUBLIC / "index.html").read_text(encoding="utf-8")
runtime = (PUBLIC / "node-graph-live-runtime.js").read_text(encoding="utf-8")
smoke = (ROOT / "scripts" / "smoke_test.py").read_text(encoding="utf-8")

eff_m = re.search(r"nodeGraphLiveWorkletSourceFilesEfficient = \[([\s\S]*?)\];", runtime)
eff_files = set(re.findall(r'"(./public/[^"]+)"', eff_m.group(1))) if eff_m else set()
eff_base = {f.split("?")[0] for f in eff_files}

shell = set(re.findall(r'src="(./public/[^"]+)"', index))
shell_base = {f.split("?")[0] for f in shell}

# PUBLIC_SCRIPT_PATHS in smoke
smoke_paths = set(re.findall(r'"(./public/[^"]+)"', smoke))
smoke_base = {f.split("?")[0] for f in smoke_paths}

parts: list[str] = []
for p in list(PUBLIC.rglob("*.js")) + [PUBLIC / "index.html"]:
    try:
        parts.append(p.read_text(encoding="utf-8", errors="ignore"))
    except OSError:
        pass
# include smoke + runtime already
parts.append(smoke)
blob = "\n".join(parts)


def ref_count(path: Path) -> int:
    rel = "./" + path.relative_to(ROOT).as_posix()
    name = path.name
    # exclude self-file content roughly by subtracting one if present
    return blob.count(rel) + blob.count(path.as_posix()) + blob.count(name)


worklets = sorted(PUBLIC.rglob("*-worklet-evaluator.js"))
lives = sorted(PUBLIC.rglob("*-live-evaluator.js"))

print("=== worklet-evaluator ===")
print("total", len(worklets))
print("in efficient blob", sum(1 for p in worklets if ("./" + p.relative_to(ROOT).as_posix()) in eff_base))

w_delete = []
w_keep = []
for p in worklets:
    rel = "./" + p.relative_to(ROOT).as_posix()
    n = ref_count(p)
    in_eff = rel in eff_base
    in_smoke = rel in smoke_base or p.name in smoke
    # Catalog/module-store often mentions path once; treat low ref as orphan
    if in_eff:
        w_keep.append((rel, "efficient-blob", n))
    elif n <= 4 and not in_smoke:
        w_delete.append(rel)
    elif in_smoke and n <= 6:
        # smoke-only / store-only — still delete; update smoke
        w_delete.append(rel)
    else:
        w_keep.append((rel, f"refs={n}", n))

print("delete candidates", len(w_delete))
print("keep", len(w_keep))
for item in w_keep[:20]:
    print(" KEEP", item)

print("\n=== live-evaluator ===")
print("total", len(lives))
live_shell = []
live_delete = []
live_keep = []
for p in lives:
    rel = "./" + p.relative_to(ROOT).as_posix()
    n = ref_count(p)
    in_shell = rel in shell_base
    in_smoke = rel in smoke_base
    if in_shell:
        live_shell.append(rel)
        live_keep.append((rel, "shell", n))
    elif n <= 5:
        live_delete.append(rel)
    else:
        live_keep.append((rel, f"refs={n} smoke={in_smoke}", n))

print("shell-loaded", len(live_shell))
for r in live_shell:
    print(" SHELL", r)
print("delete candidates", len(live_delete))
print("keep other", len(live_keep) - len(live_shell))

# core retired files
core = [
    "public/node-live-audio-worklet-evaluate-frame.js",
    "public/node-live-audio-worklet-evaluators.js",
    "public/node-live-audio-worklet-evaluators-processors.js",
    "public/node-live-audio-worklet-evaluators-sources.js",
    "public/node-live-audio-worklet-evaluators-utility.js",
]
print("\n=== core evaluate/evaluators ===")
for rel in core:
    p = ROOT / rel
    print(rel, "exists" if p.is_file() else "MISSING", "refs~", ref_count(p) if p.is_file() else 0)

out = ROOT / "scripts" / "_orphan_js_dsp_delete_list.txt"
lines = ["# worklet-evaluator"] + w_delete + ["# live-evaluator"] + live_delete
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("\nWrote", out)
print("worklet delete", len(w_delete), "live delete", len(live_delete))
