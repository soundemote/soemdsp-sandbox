from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")
pairs = [
    (r"helmholtz-pitch-ui\.js\?v=[^\"']+", "helmholtz-pitch-ui.js?v=pitch-dseg-dash-1"),
    (r"node-graph-module-scope-number-readout\.js\?v=[^\"']+", "node-graph-module-scope-number-readout.js?v=pitch-dseg-dash-1"),
]
for pat, rep in pairs:
    t, n = re.subn(pat, rep, t, count=1)
    print(rep, n)
p.write_text(t, encoding="utf-8", newline="\n")
print("rocket", "\U0001F680" in t)
