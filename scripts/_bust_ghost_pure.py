from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")
t, n1 = re.subn(r"phosphor-residual\.js\?v=[^\"']+", "phosphor-residual.js?v=ghost-pure-1", t, count=1)
t, n2 = re.subn(
    r"node-graph-module-scope-number-readout\.js\?v=[^\"']+",
    "node-graph-module-scope-number-readout.js?v=ghost-pure-1",
    t,
    count=1,
)
p.write_text(t, encoding="utf-8", newline="\n")
print("residual", n1, "readout", n2, "rocket", "\U0001F680" in t)
