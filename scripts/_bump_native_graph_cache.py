from pathlib import Path
import re

for rel in ["public/index.html", "public/node-graph-live-runtime.js"]:
    p = Path(rel)
    if not p.exists():
        continue
    t = p.read_text(encoding="utf-8")
    t2, c = re.subn(
        r"node-live-audio-worklet-native-graph\.js\?v=[^\s\"']+",
        "node-live-audio-worklet-native-graph.js?v=surgical-delete-1",
        t,
    )
    p.write_text(t2, encoding="utf-8", newline="\n")
    print(rel, "bumps", c)
