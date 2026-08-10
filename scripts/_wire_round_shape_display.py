from pathlib import Path
import re

p = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public/index.html")
t = p.read_text(encoding="utf-8")

if "ellipsoid-display.js" not in t:
    m = re.search(
        r'<script src="./public/modules/ellipsoid/ellipsoid-live-evaluator\.js\?v=[^"]+"></script>',
        t,
    )
    if m:
        insert = (
            m.group(0)
            + '\n  <script src="./public/modules/ellipsoid/ellipsoid-display.js?v=round-shape-face-1"></script>'
        )
        t = t[: m.start()] + insert + t[m.end() :]
        print("inserted after live eval")
    else:
        m2 = re.search(
            r'<script src="./public/node-graph-oscillator-runtime\.js\?v=[^"]+"></script>',
            t,
        )
        if not m2:
            raise SystemExit("no insert point for ellipsoid-display.js")
        insert = (
            m2.group(0)
            + '\n  <script src="./public/modules/ellipsoid/ellipsoid-display.js?v=round-shape-face-1"></script>'
        )
        t = t[: m2.start()] + insert + t[m2.end() :]
        print("inserted after osc runtime")
else:
    t = re.sub(
        r"ellipsoid-display\.js\?v=[^\"]+",
        "ellipsoid-display.js?v=round-shape-face-1",
        t,
        count=1,
    )
    print("display tag already present; busted")

pairs = [
    (r"node-graph-module-definitions\.js\?v=[^\"]+", "node-graph-module-definitions.js?v=round-shape-face-1"),
    (r"node-graph-module-rendering\.js\?v=[^\"]+", "node-graph-module-rendering.js?v=round-shape-face-1"),
    (r"node-graph-module-sizing\.js\?v=[^\"]+", "node-graph-module-sizing.js?v=round-shape-face-1"),
    (r"node-graph-cookbook-filter\.js\?v=[^\"]+", "node-graph-cookbook-filter.js?v=round-shape-face-1"),
]
for pat, rep in pairs:
    t, n = re.subn(pat, rep, t, count=1)
    print(rep, n)

p.write_text(t, encoding="utf-8", newline="\n")
print("has display", "ellipsoid-display.js" in t)
print("rocket", "\U0001F680" in t)
