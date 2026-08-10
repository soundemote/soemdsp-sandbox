# One-shot cache-bust helper (UTF-8 safe). Not part of the app runtime.
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "public" / "index.html"

# path fragment -> version. Only replaces existing ?v= tags (UTF-8 safe).
BUSTS = {
    "styles.css": "module-edge-stroke-2",
    "node-graph-module-frame.js": "module-edge-stroke-2",
    "lib/phosphor/phosphor-residual.js": "clear-pause-bright-1",
    "lib/phosphor/phosphor-energy-gl.js": "clear-pause-bright-1",
    "node-graph-phosphor-energy-gl.js": "clear-pause-bright-1",
    "node-graph-module-scope-draw-burn.js": "clear-pause-bright-1",
    "node-graph-module-scopes.js": "clear-pause-bright-1",
    "node-graph-module-scope-spectrum.js": "clear-pause-bright-1",
    "node-graph-module-scope-trace-controls.js": "clear-pause-bright-1",
    "node-graph-module-scope-wipe.js": "clear-pause-bright-1",
    "node-graph-module-scope-paint-helpers.js": "clear-pause-bright-1",
    "node-graph-module-scope-draw-orchestrator.js": "clear-pause-bright-1",
}


def main() -> None:
    # Patch in place — never rewrite the whole file from a non-UTF8 shell.
    raw = INDEX.read_bytes()
    text = raw.decode("utf-8")
    for name, ver in BUSTS.items():
        pattern = re.compile(re.escape(name) + r"\?v=[^\"']+")
        text, n = pattern.subn(f"{name}?v={ver}", text)
        print(f"{name}: {n} -> {ver}")
    if b"\r\n" in raw:
        text = text.replace("\r\n", "\n").replace("\n", "\r\n")
    INDEX.write_bytes(text.encode("utf-8"))
    out = INDEX.read_bytes()
    checks = {
        "rocket": "\U0001F680".encode("utf-8") in out,
        "play": "\u25B6".encode("utf-8") in out,
        "no_mojibake_prefix": b"\xc3\xb0\xc5\xb8" not in out,
    }
    for k, v in checks.items():
        print(f"{k}: {'OK' if v else 'FAIL'}")


if __name__ == "__main__":
    main()
