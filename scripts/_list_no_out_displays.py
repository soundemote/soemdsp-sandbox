import re
from pathlib import Path

src = Path("public/node-graph-module-definitions.js").read_text(encoding="utf-8")
m = re.search(r"const nodeGraphModuleDefinitions\s*=\s*\{", src)
start = m.end() - 1
depth = 0
end = None
for j, ch in enumerate(src[start:], start):
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0:
            end = j + 1
            break
body = src[start:end]
parts = re.split(r"\n  ([a-zA-Z0-9_]+):\s*\{", body)
for k in range(1, len(parts), 2):
    key = parts[k]
    chunk = parts[k + 1][:3000] if k + 1 < len(parts) else ""
    outs_m = re.search(r"outputs:\s*\[([^\]]*)\]", chunk)
    outlist = []
    if outs_m:
        outlist = [x.strip().strip("\"'") for x in outs_m.group(1).split(",") if x.strip()]
    ins_m = re.search(r"inputs:\s*\[([^\]]*)\]", chunk)
    inlist = []
    if ins_m:
        inlist = [x.strip().strip("\"'") for x in ins_m.group(1).split(",") if x.strip()]
    role_m = re.search(r'planRole:\s*"([^"]+)"', chunk)
    role = role_m.group(1) if role_m else ""
    mon = "monitorSink" in chunk or role == "monitor"
    disp = "displayType" in chunk or "displayModes" in chunk
    if (mon or disp or role == "monitor") and len(outlist) == 0:
        print(f"{key:30} role={role:12} mon={mon} ins={inlist}")
