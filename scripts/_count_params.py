from pathlib import Path
import re
text = Path("public/node-graph-module-definitions.js").read_text(encoding="utf-8")
names = ["nyquistShannon","blubb","lorenzAttractor","basicOscillator","hypersaw","additiveOsc","keplerBouwkamp","mushroom","sabrinaReverb"]
for name in names:
    m = re.search(re.escape(name) + r":\s*\{(.*?)\n  \},", text, re.S)
    if not m:
        print(name, "MISSING")
        continue
    params = re.findall(r'key:\s*"([^"]+)"', m.group(1))
    print(f"{name:20s} params={len(params)}")
