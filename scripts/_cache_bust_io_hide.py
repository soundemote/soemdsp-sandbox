from pathlib import Path
import re

INDEX = Path(__file__).resolve().parents[1] / "public" / "index.html"
BUSTS = {
    "styles.css": "io-hide-real-1",
    "node-graph-port-geometry.js": "io-hide-real-1",
    "node-graph-wire-rendering.js": "io-hide-real-1",
    "node-graph-module-sizing.js": "io-hide-real-1",
}
raw = INDEX.read_bytes()
text = raw.decode("utf-8")
for name, ver in BUSTS.items():
    text, n = re.subn(re.escape(name) + r"\?v=[^\"']+", f"{name}?v={ver}", text)
    print(name, n, "->", ver)
if b"\r\n" in raw:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
INDEX.write_bytes(text.encode("utf-8"))
print("rocket", "\U0001F680".encode() in INDEX.read_bytes())
