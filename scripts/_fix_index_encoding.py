#!/usr/bin/env python3
"""Restore public/index.html UTF-8 (no BOM) after PowerShell Set-Content mojibake."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOOD_COMMIT = "03642f3"

# Cache-bust query strings applied after GOOD_COMMIT in the Burn/LCD session.
REPLACEMENTS: list[tuple[str, str]] = [
    (r"styles\.css\?v=[^\"]+", "styles.css?v=hue-thumb-pad-px-1"),
    (r"phosphor-residual\.js\?v=[^\"]+", "phosphor-residual.js?v=burn-sticky-1"),
    (r"phosphor-energy-gl\.js\?v=[^\"]+", "phosphor-energy-gl.js?v=burn-sticky-1"),
    (r"phosphor-drawer\.js\?v=[^\"]+", "phosphor-drawer.js?v=burn-sticky-1"),
    (r"node-graph-phosphor-energy-gl\.js\?v=[^\"]+", "node-graph-phosphor-energy-gl.js?v=burn-sticky-1"),
    (r"node-graph-module-definitions\.js\?v=[^\"]+", "node-graph-module-definitions.js?v=burn-sticky-1"),
    (r"node-graph-module-store\.js\?v=[^\"]+", "node-graph-module-store.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-defaults\.js\?v=[^\"]+", "node-graph-module-scope-defaults.js?v=lcd-shadow-defaults-1"),
    (r"node-graph-module-scope-normalize\.js\?v=[^\"]+", "node-graph-module-scope-normalize.js?v=lcd-shadow-defaults-1"),
    (r"node-graph-module-scope-settings-form\.js\?v=[^\"]+", "node-graph-module-scope-settings-form.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-settings-controls\.js\?v=[^\"]+", "node-graph-module-scope-settings-controls.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-settings-form-io\.js\?v=[^\"]+", "node-graph-module-scope-settings-form-io.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-number-readout\.js\?v=[^\"]+", "node-graph-module-scope-number-readout.js?v=lcd-guard-round-1"),
    (r"node-graph-module-scope-draw-basic\.js\?v=[^\"]+", "node-graph-module-scope-draw-basic.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-draw-burn\.js\?v=[^\"]+", "node-graph-module-scope-draw-burn.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-spectrum\.js\?v=[^\"]+", "node-graph-module-scope-spectrum.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-trace-controls\.js\?v=[^\"]+", "node-graph-module-scope-trace-controls.js?v=burn-sticky-1"),
    (r"node-graph-module-scope-paint-helpers\.js\?v=[^\"]+", "node-graph-module-scope-paint-helpers.js?v=burn-sticky-1"),
    (r"oscilloscope-bank-display\.js\?v=[^\"]+", "oscilloscope-bank-display.js?v=burn-sticky-1"),
    (r"videoscope-display\.js\?v=[^\"]+", "videoscope-display.js?v=burn-sticky-1"),
    (r"xy-pad-ui\.js\?v=[^\"]+", "xy-pad-ui.js?v=burn-sticky-1"),
    (r"asciiscope-core\.js\?v=[^\"]+", "asciiscope-core.js?v=burn-sticky-1"),
    (r"asciiscope-display\.js\?v=[^\"]+", "asciiscope-display.js?v=burn-sticky-1"),
    (r"matrix-display-core\.js\?v=[^\"]+", "matrix-display-core.js?v=burn-sticky-1"),
    (r"matrix-display-display\.js\?v=[^\"]+", "matrix-display-display.js?v=burn-sticky-1"),
    (r"spectrogram-gradient-editor\.js\?v=[^\"]+", "spectrogram-gradient-editor.js?v=hue-thumb-pad-px-1"),
    (r"color-widget-boot\.js\?v=[^\"]+", "color-widget-boot.js?v=hue-thumb-pad-px-1"),
]


def main() -> None:
    raw = subprocess.check_output(["git", "show", f"{GOOD_COMMIT}:public/index.html"], cwd=ROOT)
    text = raw.decode("utf-8")
    if "🚀" not in text:
        raise SystemExit("source commit missing rocket emoji — abort")

    for pat, rep in REPLACEMENTS:
        text, n = re.subn(pat, rep, text)
        print(f"{n:3d}  {pat[:48]} -> {rep}")

    out = ROOT / "public" / "index.html"
    out.write_bytes(text.encode("utf-8"))  # UTF-8, no BOM
    head = out.read_bytes()[:3]
    print("wrote", out)
    print("bom", head == b"\xef\xbb\xbf", "rocket", "🚀" in text, "mojibake", "ðŸ" in text)

    boot = ROOT / "public" / "color-widget-boot.js"
    b = boot.read_bytes()
    if b.startswith(b"\xef\xbb\xbf"):
        b = b[3:]
    boot_text = b.decode("utf-8")
    boot_text, n = re.subn(
        r"color-widget\.js\?v=[^\"]+",
        "color-widget.js?v=hue-thumb-pad-px-1",
        boot_text,
    )
    boot.write_bytes(boot_text.encode("utf-8"))
    print("boot bom cleared, import rewrites", n)


if __name__ == "__main__":
    main()
