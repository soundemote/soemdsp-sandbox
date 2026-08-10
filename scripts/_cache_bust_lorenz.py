from pathlib import Path
import re

INDEX = Path(__file__).resolve().parents[1] / "public" / "index.html"
raw = INDEX.read_bytes()
text = raw.decode("utf-8")
text, n = re.subn(
    r"node-graph-module-definitions\.js\?v=[^\"']+",
    "node-graph-module-definitions.js?v=lorenz-speed-1000-1",
    text,
)
print("defs", n)
if b"\r\n" in raw:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
INDEX.write_bytes(text.encode("utf-8"))
