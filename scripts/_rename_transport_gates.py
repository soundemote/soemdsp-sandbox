from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]

# Patches
for p in (root / "patches").glob("*.json"):
  t = p.read_text(encoding="utf-8")
  n = t
  n = n.replace('"sourcePort": "Gate Uni"', '"sourcePort": "Gate 0-1"')
  n = n.replace('"targetPort": "Gate Uni"', '"targetPort": "Gate 0-1"')
  n = n.replace('"sourcePort": "Gate Bi"', '"sourcePort": "Gate -1+1"')
  n = n.replace('"targetPort": "Gate Bi"', '"targetPort": "Gate -1+1"')
  if n != t:
    p.write_text(n, encoding="utf-8")
    print("patch", p.name)

# Cache bust
tag = "transport-gate-01-1"
index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
for pat, rep in [
  (r"node-graph-module-definitions\.js\?v=[^\"]*", f"node-graph-module-definitions.js?v={tag}"),
  (r"node-graph-live-runtime\.js\?v=[^\"]*", f"node-graph-live-runtime.js?v={tag}"),
]:
  t = re.sub(pat, rep, t)
index.write_text(t, encoding="utf-8")

runtime = root / "public" / "node-graph-live-runtime.js"
rt = runtime.read_text(encoding="utf-8")
rt = re.sub(
  r"node-live-audio-worklet-native-graph\.js\?v=[^\"]*",
  f"node-live-audio-worklet-native-graph.js?v={tag}",
  rt,
)
runtime.write_text(rt, encoding="utf-8")

t = index.read_text(encoding="utf-8")
t = re.sub(r"transport-math\.js\?v=[^\"]*", f"transport-math.js?v={tag}", t)
index.write_text(t, encoding="utf-8")
print("busted", tag)
