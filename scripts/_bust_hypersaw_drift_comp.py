from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "hypersaw-drift-comp-factor-1"
index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
t, n = re.subn(
  r"node-graph-module-definitions\.js\?v=[^\"]*",
  f"node-graph-module-definitions.js?v={tag}",
  t,
)
index.write_text(t, encoding="utf-8")
print("bust defs", n, tag)
