from pathlib import Path
import re

root = Path(r"C:/Users/argit/Documents/_PROGRAMMING/soemdsp-sandbox/public")
for p in root.rglob("*.js"):
    t = p.read_text(encoding="utf-8")
    if "burn" not in t:
        continue
    orig = t
    # After "burn", insert "burnAmount" if missing (string field lists)
    t = re.sub(
        r'("burn",)(\s*)(?!"burnAmount")',
        r'\1\2"burnAmount",\2',
        t,
    )
    t = re.sub(
        r"('burn',)(\s*)(?!'burnAmount')",
        r"\1\2'burnAmount',\2",
        t,
    )
    if t != orig:
        p.write_text(t, encoding="utf-8")
        print("updated", p.relative_to(root))
