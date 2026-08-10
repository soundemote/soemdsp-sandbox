import json
from collections import Counter

g = json.load(open("graphify-out/graph.json", encoding="utf-8"))
nodes = g["nodes"]
links = g["links"]
id2 = {n["id"]: n for n in nodes}

def is_scope(n):
    sf = str(n.get("source_file") or "")
    return (
        "module-scope" in sf
        or "worklet-scope" in sf
        or sf.endswith("node-graph-module-scopes.js")
        or "phosphor-energy" in sf
        or sf.endswith("phosphor-drawer.js")
        or "trace-stroke" in sf
        or "phosphor-residual" in sf
    )

scope_nodes = [n for n in nodes if is_scope(n)]
scope_files = sorted({n.get("source_file") for n in scope_nodes})
print("scope-related files", len(scope_files))
print("scope-related nodes", len(scope_nodes))
deg = Counter()
for e in links:
    deg[e["source"]] += 1
    deg[e["target"]] += 1
top = sorted(
    ((deg[n["id"]], n["label"], n.get("source_file", ""), n.get("community_name", "")) for n in scope_nodes),
    reverse=True,
)[:30]
print("Top degree scope symbols:")
for d, label, f, c in top:
    leaf = (f or "").replace("\\", "/").split("/")[-1]
    print(f"  {d:3d}  {label[:55]:55s}  {leaf}")
comm = Counter(n.get("community_name") or str(n.get("community")) for n in scope_nodes)
print("Scope communities (top):")
for name, c in comm.most_common(18):
    print(f"  {c:3d}  {name}")
scope_ids = {n["id"] for n in scope_nodes}
bridge_pairs = Counter()
for e in links:
    s_in = e["source"] in scope_ids
    t_in = e["target"] in scope_ids
    if s_in ^ t_in:
        a = id2.get(e["source"], {}).get("label", "?")
        b = id2.get(e["target"], {}).get("label", "?")
        bridge_pairs[(a, b, e.get("relation"))] += 1
print("cross-boundary edges", sum(bridge_pairs.values()))
print("top bridges:")
for (a, b, r), c in bridge_pairs.most_common(15):
    print(f"  {c}x  {a} --{r}--> {b}")
