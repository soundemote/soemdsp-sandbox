#!/usr/bin/env python3
"""Delete orphan JS DSP evaluator twins (APP_POLICY §2 / §5). Product is native-only."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
LIST = ROOT / "scripts" / "_orphan_js_dsp_delete_list.txt"

# Shell-loaded files that are still interface/thru (not osc DSP kernels).
# JS audio twins that were only for ScriptProcessor/offline must go even if shelled.
KEEP_LIVE = {
    "./public/modules/metamodule/metamodule-live-evaluator.js",
    "./public/modules/_shared/display-thru-live-evaluators.js",
    "./public/modules/imageBurn/image-burn-live-evaluator.js",
    "./public/modules/keyboardController/keyboard-controller-live-evaluator.js",
    "./public/modules/bugButton/bug-button-live-evaluator.js",
    "./public/modules/codeblock/codeblock-live-evaluator.js",
    "./public/modules/keypad/keypad-live-evaluator.js",
    "./public/modules/noiseDetector/noise-detector-live-evaluator.js",
    "./public/modules/phoneTone/phone-tone-live-evaluator.js",
    "./public/modules/rms/rms-live-evaluator.js",
    "./public/modules/tSeries/t-series-live-evaluator.js",
}

# Explicitly remove these even if shelled — they are JS audio kernels.
FORCE_DELETE_LIVE = {
    "./public/modules/hypersaw/hypersaw-live-evaluator.js",
    "./public/modules/hypersaw2/hypersaw2-live-evaluator.js",
    "./public/modules/vibratoGenerator/vibrato-generator-live-evaluator.js",
    "./public/modules/wowAndFlutter/wow-and-flutter-live-evaluator.js",
    "./public/modules/basicShape/basic-shape-live-evaluator.js",
}

CORE_DELETE = [
    "public/node-live-audio-worklet-evaluate-frame.js",
    "public/node-live-audio-worklet-evaluators.js",
    "public/node-live-audio-worklet-evaluators-processors.js",
    "public/node-live-audio-worklet-evaluators-sources.js",
    "public/node-live-audio-worklet-evaluators-utility.js",
]

deleted = []
missing = []

# All worklet-evaluators
for p in sorted(PUBLIC.rglob("*-worklet-evaluator.js")):
    p.unlink()
    deleted.append(str(p.relative_to(ROOT)))

# Live evaluators from inventory list + force deletes
lines = LIST.read_text(encoding="utf-8").splitlines() if LIST.is_file() else []
live_from_list = [ln.strip() for ln in lines if ln.startswith("./public/") and "live-evaluator" in ln]
for rel in sorted(set(live_from_list) | FORCE_DELETE_LIVE):
    if rel in KEEP_LIVE:
        continue
    p = ROOT / rel[2:] if rel.startswith("./") else ROOT / rel
    if p.is_file():
        p.unlink()
        deleted.append(rel)
    else:
        missing.append(rel)

for rel in CORE_DELETE:
    p = ROOT / rel
    if p.is_file():
        p.unlink()
        deleted.append(rel)

print(f"deleted {len(deleted)} files")
print(f"missing {len(missing)}")
(ROOT / "scripts" / "_orphan_js_dsp_deleted_log.txt").write_text(
    "\n".join(deleted) + "\n", encoding="utf-8"
)
