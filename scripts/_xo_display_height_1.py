from pathlib import Path

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
    if "displayHeightGu" in block:
        # force to 1
        new_block = block
        import re

        new_block = re.sub(
            r"displayHeightGu:\s*\d+",
            "displayHeightGu: 1",
            new_block,
            count=1,
        )
        t = t[:start] + new_block + t[end:]
        print(n, "updated displayHeightGu to 1")
        continue
    new_block = block.replace(
        'chrome: "LayoutB",',
        'chrome: "LayoutB",\n    displayHeightGu: 1,',
        1,
    )
    if new_block == block:
        print(n, "no chrome replace")
        continue
    t = t[:start] + new_block + t[end:]
    print(n, "set displayHeightGu 1")
path.write_text(t, encoding="utf-8")
print("done")
