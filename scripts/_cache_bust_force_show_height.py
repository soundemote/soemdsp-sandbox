from pathlib import Path
import re
INDEX = Path("public/index.html")
raw = INDEX.read_bytes()
text = raw.decode("utf-8")
text, n = re.subn(r"node-graph-module-sizing\.js\?v=[^\"']+", "node-graph-module-sizing.js?v=force-show-height-1", text)
print("replacements", n)
if b"\r\n" in raw:
    text = text.replace("\r\n", "\n").replace("\n", "\r\n")
INDEX.write_bytes(text.encode("utf-8"))
out = INDEX.read_bytes()
print("rocket", "\U0001F680".encode() in out)
print("match", re.search(rb"module-sizing\.js\?v=[^\"]+", out).group(0))
