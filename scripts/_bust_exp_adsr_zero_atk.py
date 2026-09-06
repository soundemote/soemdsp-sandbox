from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "exp-adsr-trig-ad-1"

index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
for pat, rep in [
  (r"exp-adsr-math\.js\?v=[^\"]*", f"exp-adsr-math.js?v={tag}"),
  (r"attack-decay-display\.js\?v=[^\"]*", f"attack-decay-display.js?v={tag}"),
  (r"node-graph-live-runtime\.js\?v=[^\"]*", f"node-graph-live-runtime.js?v={tag}"),
]:
  t = re.sub(pat, rep, t)
index.write_text(t, encoding="utf-8")

runtime = root / "public" / "node-graph-live-runtime.js"
rt = runtime.read_text(encoding="utf-8")
rt = re.sub(r"soemdsp_combined\.wasm\?v=[^\"]*", f"soemdsp_combined.wasm?v={tag}", rt)
runtime.write_text(rt, encoding="utf-8")
print("busted", tag)
