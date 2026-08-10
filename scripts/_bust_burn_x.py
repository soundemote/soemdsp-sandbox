from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")
pairs = [
    (r"node-graph-module-scope-settings-form\.js\?v=[^\"']+", "node-graph-module-scope-settings-form.js?v=burn-x-1"),
    (r"node-graph-module-scope-trace-controls\.js\?v=[^\"']+", "node-graph-module-scope-trace-controls.js?v=burn-x-1"),
    (r"node-graph-module-scope-spectrum\.js\?v=[^\"']+", "node-graph-module-scope-spectrum.js?v=burn-x-1"),
]
for pat, rep in pairs:
    t, n = re.subn(pat, rep, t, count=1)
    print(rep, n)
p.write_text(t, encoding="utf-8", newline="\n")
print("rocket", "\U0001F680" in t)
