from pathlib import Path
import re

t = Path("public/node-graph-module-definitions.js").read_text(encoding="utf-8")
for n in range(2, 7):
    start = t.find(f"crossover{n}: {{")
    end = t.find(f"crossover{n + 1}: {{", start + 1) if n < 6 else -1
    if end < 0:
        end = start + 9000
    chunk = t[start:end]
    outs = re.search(r"outputs:\s*(\[[^\]]+\])", chunk)
    labs = re.findall(
        r'key:\s*"(frequency\d*)"[\s\S]*?label:\s*"([^"]+)"',
        chunk,
    )
    print(n, "outs", outs.group(1) if outs else None)
    print("  freq", labs)
