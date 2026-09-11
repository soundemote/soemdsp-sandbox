from pathlib import Path
import re
smoke = Path("scripts/smoke_test.py").read_text(encoding="utf-8")
m = re.search(r"PUBLIC_SCRIPT_PATHS = \(([\s\S]*?)\)\n\n", smoke)
block = m.group(1) if m else ""
lives = re.findall(r'"(./public/modules/[^"]*live-evaluator[^"]*)"', block)
works = re.findall(r'"(./public/modules/[^"]*worklet-evaluator[^"]*)"', block)
cores = re.findall(r'"(./public/node-live-audio-worklet-evaluat[^"]*)"', block)
print("smoke PUBLIC live-evaluator", len(lives))
for x in lives:
    print(x)
print("smoke PUBLIC worklet-evaluator", len(works))
for x in works:
    print(x)
print("smoke PUBLIC core", cores)
print("worklet-evaluator mentions", smoke.count("worklet-evaluator"))
print("evaluate-frame mentions", smoke.count("evaluate-frame"))
