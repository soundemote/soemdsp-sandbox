from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / "public" / "index.html"
t = p.read_text(encoding="utf-8")
replacements = [
  (r"node-graph-wires\.js\?v=[^\"]*", "node-graph-wires.js?v=port-impulse-1"),
  (r"node-graph-module-rendering\.js\?v=[^\"]*", "node-graph-module-rendering.js?v=port-impulse-1"),
  (r"node-live-audio-worklet-events\.js\?v=[^\"]*", "node-live-audio-worklet-events.js?v=port-impulse-1"),
]
for pat, rep in replacements:
  t = re.sub(pat, rep, t)
p.write_text(t, encoding="utf-8")
print("busted")
