from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "robin-phase-uncapped-1"

index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
for pat, rep in [
  (r"node-graph-robin-supersaw\.js\?v=[^\"]*", f"node-graph-robin-supersaw.js?v={tag}"),
  (r"node-graph-module-definitions\.js\?v=[^\"]*", f"node-graph-module-definitions.js?v={tag}"),
  (r"node-graph-live-runtime\.js\?v=[^\"]*", f"node-graph-live-runtime.js?v={tag}"),
]:
  t = re.sub(pat, rep, t)
index.write_text(t, encoding="utf-8")

runtime = root / "public" / "node-graph-live-runtime.js"
rt = runtime.read_text(encoding="utf-8")
rt = re.sub(
  r"soemdsp_combined\.wasm\?v=[^\"]*",
  f"soemdsp_combined.wasm?v={tag}",
  rt,
)
runtime.write_text(rt, encoding="utf-8")
print("busted", tag)
