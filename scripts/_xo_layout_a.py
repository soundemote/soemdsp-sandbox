from pathlib import Path
import re

path = Path("public/node-graph-module-definitions.js")
t = path.read_text(encoding="utf-8")
for n in range(2, 7):
    start = t.find(f"crossover{n}: {{")
    if start < 0:
        print("miss", n)
        continue
    end = (
        t.find(f"crossover{n + 1}: {{", start + 1)
        if n < 6
        else t.find("softpopOscillator: {", start + 1)
    )
    if end < 0:
        end = start + 5000
    block = t[start:end]
    new_block = re.sub(r'chrome:\s*"LayoutB"', 'chrome: "LayoutA"', block, count=1)
    if new_block == block and 'chrome: "LayoutA"' not in block:
        new_block = block.replace(
            'layout: "filterCurve",',
            'layout: "filterCurve",\n    chrome: "LayoutA",',
            1,
        )
    t = t[:start] + new_block + t[end:]
    print(n, "ok" if 'chrome: "LayoutA"' in new_block else "fail")
path.write_text(t, encoding="utf-8")
print("done")
