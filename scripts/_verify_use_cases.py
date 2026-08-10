#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import sys

p = Path("public/node-graph-module-store.js")
t = p.read_text(encoding="utf-8")
r = subprocess.run([sys.executable, "-c", "import pathlib; pathlib.Path('public/node-graph-module-store.js').read_text()"], cwd=".")
# node --check
r2 = subprocess.run(["node", "--check", "public/node-graph-module-store.js"], capture_output=True, text=True)
print("node check", r2.returncode, r2.stderr[:200] if r2.stderr else "ok")
for k in ["polyBlep", "helmholtzPitch", "butterworth", "numberReadout", "lorenzAttractor", "output", "minMax"]:
    m = re.search(rf"{k}:\s*\{{[\s\S]*?description:\s*\"([^\"]+)\"", t)
    print(k, "->", (m.group(1)[:100] if m else "MISSING"))
print("description count", len(re.findall(r'description:\s*"', t)))
# leftover multi-line concat descriptions?
bad = re.findall(r'description:\s*\n\s*"', t)
print("multiline starts", len(bad))
