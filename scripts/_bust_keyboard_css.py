from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / "public" / "index.html"
t = p.read_text(encoding="utf-8")
t = re.sub(r"styles\.css\?v=[^\"]+", "styles.css?v=keyboard-face-fill-2", t)
t = re.sub(
  r"keyboard-layout-settings\.js\?v=[^\"]*",
  "keyboard-layout-settings.js?v=keyboard-face-fill-2",
  t,
)
t = re.sub(
  r"node-graph-module-factories\.js\?v=[^\"]*",
  "node-graph-module-factories.js?v=keyboard-face-fill-1",
  t,
)
t = re.sub(
  r"node-graph-module-sizing\.js\?v=[^\"]*",
  "node-graph-module-sizing.js?v=keyboard-face-fill-1",
  t,
)
p.write_text(t, encoding="utf-8")
print("busted")
