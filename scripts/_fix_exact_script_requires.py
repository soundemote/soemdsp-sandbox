from pathlib import Path
import re
s = Path("scripts/smoke_test.py").read_text(encoding="utf-8")
# Matches: '<script src="./public/....js..."></script>'
pats = re.findall(r"'<script src=\"(\./public/[^\"]+)\"></script>'", s)
print("count", len(pats))
for p in pats:
    print(p)
