from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "transport-click-delegate-1"
index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
t = re.sub(
  r"node-graph-live-control-rendering\.js\?v=[^\"]*",
  f"node-graph-live-control-rendering.js?v={tag}",
  t,
)
t = re.sub(
  r"node-graph-render-live-event-bindings\.js\?v=[^\"]*",
  f"node-graph-render-live-event-bindings.js?v={tag}",
  t,
)
index.write_text(t, encoding="utf-8")
print("busted", tag)
