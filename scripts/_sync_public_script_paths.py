"""Rewrite PUBLIC_SCRIPT_PATHS in smoke_test.py to match public/index.html <script src> tags."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "public" / "index.html"
SMOKE = ROOT / "scripts" / "smoke_test.py"

html = INDEX.read_text(encoding="utf-8")
scripts = []
for match in re.finditer(r'<script\b[^>]*\bsrc="(\./public/[^"]+)"', html):
    path = match.group(1).split("?", 1)[0]
    if path not in scripts:
        scripts.append(path)

print(f"index.html unique script paths: {len(scripts)}")

src = SMOKE.read_text(encoding="utf-8")
pattern = re.compile(r"PUBLIC_SCRIPT_PATHS = \((.*?)\)\n", re.S)
match = pattern.search(src)
if not match:
    raise SystemExit("PUBLIC_SCRIPT_PATHS not found")

old_listed = re.findall(r'"(./public/[^"]+)"', match.group(1))
old_set = set(old_listed)
# Keep intentionally non-shell paths that smoke still treats as source contracts.
# (Efficient product: JS live-evaluators are not <script>-loaded; contracts still read them.)
shell_optional = [
    "./public/node-graph-code-screen.js",
    "./public/node-graph-shader-script.js",
    "./public/node-graph-live-frame-evaluator.js",
    "./public/modules/bugButton/bug-button-live-evaluator.js",
    "./public/modules/codeblock/codeblock-live-evaluator.js",
    "./public/modules/keypad/keypad-live-evaluator.js",
    "./public/modules/noiseDetector/noise-detector-live-evaluator.js",
    "./public/modules/phoneTone/phone-tone-live-evaluator.js",
    "./public/modules/rms/rms-live-evaluator.js",
    "./public/modules/tSeries/t-series-live-evaluator.js",
]
final = list(scripts)
for path in shell_optional:
    if path not in final:
        # Prefer keeping previously listed; otherwise add if the file exists.
        rel = path[len("./") :] if path.startswith("./") else path
        if path in old_set or (ROOT / rel).is_file():
            final.append(path)

new_set = set(final)
print(f"old PUBLIC_SCRIPT_PATHS: {len(old_listed)}")
print(f"add: {len(new_set - old_set)}")
print(f"remove: {len(old_set - new_set)}")

body = ",\n".join(f'    "{path}"' for path in final)
replacement = f"PUBLIC_SCRIPT_PATHS = (\n{body},\n)\n"
new_src = pattern.sub(replacement, src, count=1)
SMOKE.write_text(new_src, encoding="utf-8")
print("updated scripts/smoke_test.py")
