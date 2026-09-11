from pathlib import Path
import re

p = Path("public/index.html")
t = p.read_text(encoding="utf-8")
remove = [
    "hypersaw/hypersaw-live-evaluator.js",
    "hypersaw2/hypersaw2-live-evaluator.js",
    "vibratoGenerator/vibrato-generator-live-evaluator.js",
    "wowAndFlutter/wow-and-flutter-live-evaluator.js",
    "basicShape/basic-shape-live-evaluator.js",
]
n = 0
for frag in remove:
    newt, k = re.subn(
        rf'[ \t]*<script[^>]*src="\./public/modules/{re.escape(frag)}[^"]*"[^>]*>\s*</script>\s*\n',
        "",
        t,
    )
    t = newt
    n += k
p.write_text(t, encoding="utf-8", newline="\n")
print("removed script tags", n)
