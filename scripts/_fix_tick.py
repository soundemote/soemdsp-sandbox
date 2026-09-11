from pathlib import Path
p = Path("public/modules/transport/transport-display.js")
t = p.read_text(encoding="utf-8")
# Broken: template ends with backslash-backtick instead of backtick
old = "monospace\\`"
print("occurrences", t.count(old))
t2 = t.replace(old, "monospace`")
p.write_text(t2, encoding="utf-8", newline="\n")
lines = t2.splitlines()
print(155, repr(lines[154]))
