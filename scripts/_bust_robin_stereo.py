from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / "public" / "index.html"
t = p.read_text(encoding="utf-8")
for pat, rep in [
  (r"node-graph-robin-supersaw\.js\?v=[^\"]*", "node-graph-robin-supersaw.js?v=robin-stereo-1"),
  (r"node-graph-module-definitions\.js\?v=[^\"]*", "node-graph-module-definitions.js?v=robin-stereo-1"),
]:
  t = re.sub(pat, rep, t)
p.write_text(t, encoding="utf-8")
print("busted")
