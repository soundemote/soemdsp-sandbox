from pathlib import Path
import re

INDEX = Path(__file__).resolve().parents[1] / "public" / "index.html"
BUSTS = {
    "node-graph-file-actions.js": "ctrl-s-native-save-1",
    "node-graph-keyboard-shortcuts.js": "ctrl-s-native-save-1",
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
