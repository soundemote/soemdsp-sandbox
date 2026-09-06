from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "value-line-zero-ok-1"
index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
files = [
  "node-graph-module-scope-draw-basic.js",
  "node-graph-module-scope-settings-controls.js",
  "node-graph-module-scope-settings-field-edit.js",
  "node-graph-module-scope-normalize.js",
]
for name in files:
  t, n = re.subn(rf"{re.escape(name)}\?v=[^\"]*", f"{name}?v={tag}", t)
  print(f"{name}: {n}")
index.write_text(t, encoding="utf-8")

draw = (root / "public" / "node-graph-module-scope-draw-basic.js").read_text(encoding="utf-8")
start = draw.find("function drawNodeGraphValueOscilloscopeItem")
end = draw.find("\nfunction ", start + 1)
block = draw[start:end]
bad = [
  "lineLength) ||",
  "|| 0.72",
  "|| 0.16",
  "capLength) ||",
]
print("finiteUnit", "finiteUnit" in block)
for p in bad:
  print("bad", p, p in block)
print("done", tag)
