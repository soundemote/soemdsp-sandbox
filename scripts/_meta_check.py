import re
from pathlib import Path
html = Path("public/index.html").read_text(encoding="utf-8")
clean = [s.split("?")[0] for s in re.findall(r'src="(\./public/[^"]+)"', html)]
need = [
  "./public/modules/metamodule/metamodule-register.js",
  "./public/modules/metamodule/metamodule-core.js",
  "./public/modules/metamodule/metamodule-ui.js",
  "./public/modules/metamodule/metamodule-live-evaluator.js",
]
text = Path("scripts/smoke_test.py").read_text(encoding="utf-8")
m = re.search(r"PUBLIC_SCRIPT_PATHS = \((.*?)\)\n", text, re.S)
paths = re.findall(r'"(\./public/[^"]+)"', m.group(1))
for n in need:
    print(n, "html", n in clean, "smoke", n in paths)
print("missing", [p for p in clean if "metamodule" in p and p not in paths])
