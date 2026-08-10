from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")
pairs = [
    (r"node-graph-module-definitions\.js\?v=[^\"']+", "node-graph-module-definitions.js?v=startup-syntax-1"),
    (r"node-graph-module-scope-settings-controls\.js\?v=[^\"']+", "node-graph-module-scope-settings-controls.js?v=startup-syntax-1"),
]
for pat, rep in pairs:
    t, n = re.subn(pat, rep, t, count=1)
    print(rep, n)
p.write_text(t, encoding="utf-8", newline="\n")
print("rocket", "\U0001F680" in t)
