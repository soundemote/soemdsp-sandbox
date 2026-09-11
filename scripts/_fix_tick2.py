from pathlib import Path
lines = Path("public/modules/transport/transport-display.js").read_text(encoding="utf-8").splitlines()
line = lines[154]
print(repr(line))
for i, ch in enumerate(line):
    if ch in ("`", "\\") or ord(ch) > 127:
        print(i, repr(ch), ord(ch))
# Fix by rewriting line 155
lines[154] = '  ctx.font = `${labelFontSize}px "Consolas", "Courier New", monospace`;'
Path("public/modules/transport/transport-display.js").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("rewrote")
print(repr(lines[154]))
