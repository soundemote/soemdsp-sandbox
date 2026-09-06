from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "rename-value-led-1"
index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
for pat, rep in [
  (r"node-graph-module-definitions\.js\?v=[^\"]*", f"node-graph-module-definitions.js?v={tag}"),
  (r"node-graph-module-store\.js\?v=[^\"]*", f"node-graph-module-store.js?v={tag}"),
  (r"node-graph-module-scope-trace-controls\.js\?v=[^\"]*", f"node-graph-module-scope-trace-controls.js?v={tag}"),
]:
  t = re.sub(pat, rep, t)
# led-register if present
t = re.sub(
  r"modules/led/led-register\.js\?v=[^\"]*",
  f"modules/led/led-register.js?v={tag}",
  t,
)
index.write_text(t, encoding="utf-8")
print("busted", tag)
