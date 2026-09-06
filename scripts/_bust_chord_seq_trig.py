from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "chord-seq-trig-1"
index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
for pat, rep in [
  (r"node-graph-module-definitions\.js\?v=[^\"]*", f"node-graph-module-definitions.js?v={tag}"),
  (r"chord-sequencer-live-evaluator\.js\?v=[^\"]*", f"chord-sequencer-live-evaluator.js?v={tag}"),
]:
  t = re.sub(pat, rep, t)
index.write_text(t, encoding="utf-8")
print("busted", tag)
