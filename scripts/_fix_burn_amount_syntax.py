from pathlib import Path
import re
import subprocess

root = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public")

# Fix object corruption: key: "burn",\n "burnAmount",
for p in root.rglob("*.js"):
    t = p.read_text(encoding="utf-8")
    nt = re.sub(
        r'(key:\s*"burn",)\s*\n\s*"burnAmount",',
        r"\1",
        t,
    )
    # Also fix accidental array duplicates of burnAmount right after burn
    nt = re.sub(
        r'("burn",)\s*\n\s*"burnAmount",\s*\n\s*"burnAmount",',
        r'\1\n      "burnAmount",',
        nt,
    )
    if nt != t:
        p.write_text(nt, encoding="utf-8")
        print("fixed pattern in", p.relative_to(root))

# Syntax-check files that were bulk-touched
candidates = [
    "node-graph-module-definitions.js",
    "node-graph-module-store.js",
    "node-graph-module-scope-settings-controls.js",
    "node-graph-module-scope-settings-form.js",
    "node-graph-module-scope-spectrum.js",
    "node-graph-module-scope-trace-controls.js",
    "modules/asciiscope/asciiscope-core.js",
    "modules/numberReadout/number-readout-register.js",
    "node-graph-state.js",
    "node-graph-default-patch.js",
]
for rel in candidates:
    p = root / rel
    if not p.exists():
        continue
    r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
    status = "OK" if r.returncode == 0 else "FAIL"
    print(status, rel)
    if r.returncode != 0:
        print(r.stderr[:300])
