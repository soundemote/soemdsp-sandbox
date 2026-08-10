from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")
t, n = re.subn(
    r"node-graph-floating-windows\.js\?v=[^\"']+",
    "node-graph-floating-windows.js?v=mvp-guard-1",
    t,
    count=1,
)
p.write_text(t, encoding="utf-8", newline="\n")
print("bust", n, "rocket", "\U0001F680" in t)
