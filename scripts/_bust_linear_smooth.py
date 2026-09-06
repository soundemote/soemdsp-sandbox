from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
tag = "linear-smooth-up-1"

runtime = root / "public" / "node-graph-live-runtime.js"
rt = runtime.read_text(encoding="utf-8")
rt = re.sub(r"soemdsp_combined\.wasm\?v=[^\"]*", f"soemdsp_combined.wasm?v={tag}", rt)
runtime.write_text(rt, encoding="utf-8")

index = root / "public" / "index.html"
t = index.read_text(encoding="utf-8")
t = re.sub(r"node-graph-live-runtime\.js\?v=[^\"]*", f"node-graph-live-runtime.js?v={tag}", t)
index.write_text(t, encoding="utf-8")
print("busted", tag)
