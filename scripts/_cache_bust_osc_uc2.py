from pathlib import Path
import re
# Bust worklet-loaded scripts in live-runtime.js
rt = Path("public/node-graph-live-runtime.js")
raw = rt.read_bytes()
text = raw.decode("utf-8")
for name, ver in {
    "node-live-audio-worklet-evaluators-processors.js": "osc-uc-1",
    "modules/scientificIir/scientific-iir-worklet-evaluator.js": "osc-uc-1",
}.items():
    text, n = re.subn(re.escape(name) + r"\?v=[^\"']+", f"{name}?v={ver}", text)
    print("rt", name, n, "->", ver)
if b"\r\n" in raw:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
rt.write_bytes(text.encode("utf-8"))
# Bust live-runtime itself in index
INDEX = Path("public/index.html")
raw = INDEX.read_bytes()
text = raw.decode("utf-8")
text, n = re.subn(r"node-graph-live-runtime\.js\?v=[^\"']+", "node-graph-live-runtime.js?v=osc-uc-1", text)
print("index live-runtime", n)
if b"\r\n" in raw:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
INDEX.write_bytes(text.encode("utf-8"))
print("rocket", "\U0001F680".encode() in INDEX.read_bytes())
