from pathlib import Path
import subprocess
text = Path("public/modules/transport/transport-display.js").read_text(encoding="utf-8")
print("backticks", text.count("`"))
print("dq", text.count('"'), "sq", text.count("'"))
lines = text.splitlines()
for i, l in enumerate(lines, 1):
    if "`" in l or "DSEG" in l:
        print(i, repr(l))
# Binary search which line addition breaks a complete-enough prefix starting from line 78
base = "".join(l + "\n" for l in lines[:77])  # through GateLevel01 - known OK
assert subprocess.run(["node", "--check"], input=base, text=True, capture_output=True).returncode != 0 or True
# write base
Path("scripts/_b.js").write_text(base, encoding="utf-8")
print("base77", subprocess.run(["node","--check","scripts/_b.js"], capture_output=True).returncode)
# add draw function lines one by one until fail that isn't just unclosed
for n in range(78, len(lines)+1):
    chunk = "".join(l + "\n" for l in lines[:n])
    # close open braces to make parseable if incomplete function
    d = 0
    for c in chunk:
        if c == "{": d += 1
        if c == "}": d -= 1
    closed = chunk + ("\n}" * max(0, d)) + "\n"
    Path("scripts/_b.js").write_text(closed, encoding="utf-8")
    r = subprocess.run(["node","--check","scripts/_b.js"], capture_output=True, text=True)
    if r.returncode != 0:
        print("first fail at n", n, "depth", d, "line", repr(lines[n-1][:100]))
        print(r.stderr.splitlines()[-1] if r.stderr else "")
        break
else:
    print("all OK when brace-closed")
