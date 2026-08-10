from pathlib import Path
import re

INDEX = Path(__file__).resolve().parents[1] / "public" / "index.html"
raw = INDEX.read_bytes()
text = raw.decode("utf-8")
text, n = re.subn(
    r"node-graph-module-scope-defaults\.js\?v=[^\"']+",
    "node-graph-module-scope-defaults.js?v=init-display-presets-1",
    text,
)
print("defaults", n)
if b"\r\n" in raw:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
INDEX.write_bytes(text.encode("utf-8"))
