from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "value-line-face-clock-numer-1"
index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
files = [
  "node-graph-module-scope-draw-basic.js",
  "node-graph-module-definitions.js",
  "node-graph-module-store.js",
  "modules/transport/transport-display.js",
  "modules/transport/transport-math.js",
  "modules/transport/transport-live-evaluator.js",
  "modules/transport/transport-worklet-evaluator.js",
  "node-live-audio-worklet-evaluators-processors.js",
  "node-live-audio-worklet-native-graph.js",
]
for name in files:
  escaped = re.escape(name)
  t, n = re.subn(
    rf"{escaped}\?v=[^\"]*",
    f"{name}?v={tag}",
    t,
  )
  print(f"{name}: {n}")
index.write_text(t, encoding="utf-8")
print("busted", tag)
