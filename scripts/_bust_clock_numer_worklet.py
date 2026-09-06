from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "value-line-face-clock-numer-1"

runtime = root / "public" / "node-graph-live-runtime.js"
rt = runtime.read_text(encoding="utf-8")
rt, n = re.subn(
  r"node-live-audio-worklet-native-graph\.js\?v=[^\"]*",
  f"node-live-audio-worklet-native-graph.js?v={tag}",
  rt,
)
runtime.write_text(rt, encoding="utf-8")
print("native-graph in live-runtime:", n)

index = root / "public" / "index.html"
it = index.read_text(encoding="utf-8")
for name in (
  "node-graph-live-runtime.js",
  "modules/transport/transport-live-evaluator.js",
  "modules/transport/transport-worklet-evaluator.js",
):
  it, n = re.subn(rf"{re.escape(name)}\?v=[^\"]*", f"{name}?v={tag}", it)
  print(f"{name}: {n}")
index.write_text(it, encoding="utf-8")
print("done", tag)
