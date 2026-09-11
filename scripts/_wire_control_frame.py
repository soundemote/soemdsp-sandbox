from pathlib import Path
import re

p = Path("native_modules/graph_engine/graph_engine.cpp")
t = p.read_text(encoding="utf-8")
t2, n = re.subn(r"stamp_live_param_mods\(g, node, f\);", "control_frame(g, node, f);", t)
print("replaced stamps", n)

m2 = re.search(
    r"(extern \"C\" int soemdsp_graph_process_block\(int handle, int n\) \{[\s\S]{0,500}?Circuit\* g =[^\n]+\n)",
    t2,
)
if m2 and "audioFrame" not in m2.group(1):
    t2 = t2.replace(m2.group(1), m2.group(1) + "  g->audioFrame = -1;\n", 1)
    print("process_block audioFrame init")
elif m2:
    print("process_block already has audioFrame nearby")
else:
    print("WARN: process_block pattern missing")

p.write_text(t2, encoding="utf-8", newline="\n")
print("stamp(f) left", len(re.findall(r"stamp_live_param_mods\(g, node, f\)", t2)))
print("control_frame(f)", t2.count("control_frame(g, node, f)"))
