from pathlib import Path
import re

p = Path("native_modules/graph_engine/graph_engine.cpp")
t = p.read_text(encoding="utf-8")

# add_node hist init
m = re.search(
    r"for \(int c = 0; c < kChannels; c\+\+\) \{\s*zero_buf\(n\.buf\[c\], kMaxBlockFrames\);\s*\}",
    t,
)
if m and "n.hist[c]" not in t[m.start() : m.end() + 80]:
    rep = (
        m.group(0)
        + "\n    for (int c = 0; c < kChannels; c++) n.hist[c] = 0.0;\n"
        + "    n.processedThisBlock = 0;"
    )
    t = t[: m.start()] + rep + t[m.end() :]
    print("add_node hist init")

old_connect = """  Conn& c = g->conns[g->connCount];
  c.used = true;
  c.srcHash = srcHash;
  c.srcPort = clamp_src_port(srcPort);
  c.dstHash = dstHash;
  c.dstPort = clamp_dst_port(dstPort);
  g->connCount += 1;
  return 0;
}"""
new_connect = """  Conn& c = g->conns[g->connCount];
  c.used = true;
  c.srcHash = srcHash;
  c.srcPort = clamp_src_port(srcPort);
  c.dstHash = dstHash;
  c.dstPort = clamp_dst_port(dstPort);
  g->connCount += 1;
  if (g->edgeCount < kMaxEdges) {
    Edge& e = g->edges[g->edgeCount++];
    e.used = true;
    e.srcHash = c.srcHash;
    e.srcPort = c.srcPort;
    e.dstHash = c.dstHash;
    e.sinkId = c.dstPort;
    e.sinkKind = kSinkPort;
  }
  return 0;
}"""
if old_connect not in t:
    raise SystemExit("connect body missing")
t = t.replace(old_connect, new_connect, 1)

old_mod = """  ParamModEdge& e = g->paramModEdges[g->paramModEdgeCount++];
  e.srcHash = srcHash;
  e.srcPort = srcPort;
  e.dstHash = dstHash;
  e.paramId = paramId;
  e.used = true;
  return 0;
}"""
new_mod = """  ParamModEdge& e = g->paramModEdges[g->paramModEdgeCount++];
  e.srcHash = srcHash;
  e.srcPort = srcPort;
  e.dstHash = dstHash;
  e.paramId = paramId;
  e.used = true;
  if (g->edgeCount < kMaxEdges) {
    Edge& ue = g->edges[g->edgeCount++];
    ue.used = true;
    ue.srcHash = srcHash;
    ue.srcPort = clamp_src_port(srcPort);
    ue.dstHash = dstHash;
    ue.sinkId = paramId;
    ue.sinkKind = kSinkControl;
  }
  return 0;
}"""
if old_mod not in t:
    raise SystemExit("add_param_mod_edge body missing")
t = t.replace(old_mod, new_mod, 1)

old_clear = """extern "C" int soemdsp_graph_clear_param_mod_edges(int handle) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->paramModEdgeCount = 0;
  for (int i = 0; i < kMaxParamModEdges; i++) {
    g->paramModEdges[i].used = false;
  }
  return 0;
}"""
new_clear = """extern "C" int soemdsp_graph_clear_param_mod_edges(int handle) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->paramModEdgeCount = 0;
  for (int i = 0; i < kMaxParamModEdges; i++) {
    g->paramModEdges[i].used = false;
  }
  int w = 0;
  for (int i = 0; i < g->edgeCount; i++) {
    if (!g->edges[i].used) continue;
    if (g->edges[i].sinkKind == kSinkControl) continue;
    g->edges[w++] = g->edges[i];
  }
  g->edgeCount = w;
  return 0;
}"""
if old_clear not in t:
    raise SystemExit("clear_param_mod_edges missing")
t = t.replace(old_clear, new_clear, 1)

if "g.edgeCount = 0" not in t and "g->edgeCount = 0" not in t:
    t = t.replace("g.connCount = 0;", "g.connCount = 0;\n  g.edgeCount = 0;", 1)
    print("create edgeCount")

# process_block: clear processedThisBlock; after each node update hist + mark processed
old_loop = """  for (int oi = 0; oi < g->orderCount; oi++) {
    const int ni = g->order[oi];
    if (ni < 0 || ni >= g->nodeCount || !g->nodes[ni].used) continue;
    Node& node = g->nodes[ni];
    for (int c = 0; c < kChannels; c++) zero_buf(node.buf[c], frames);
"""
if old_loop not in t:
    raise SystemExit("process_block node loop missing")
new_loop = """  for (int i = 0; i < g->nodeCount; i++) {
    if (g->nodes[i].used) g->nodes[i].processedThisBlock = 0;
  }
  for (int oi = 0; oi < g->orderCount; oi++) {
    const int ni = g->order[oi];
    if (ni < 0 || ni >= g->nodeCount || !g->nodes[ni].used) continue;
    Node& node = g->nodes[ni];
    for (int c = 0; c < kChannels; c++) zero_buf(node.buf[c], frames);
"""
t = t.replace(old_loop, new_loop, 1)

# After process_block's node processing - need to mark processed at end of each node.
# The loop is a big switch with continue; easiest: wrap with a macro or add before every continue - bad.
# Instead add at the TOP after zero: we can't.
# Add helper call by replacing `continue;` after process_* - too many.
# Better: change structure to call a finish at end of each iteration without continue skipping it.
# Pattern: each branch ends with continue. Insert before continues that follow process_ in the loop... fragile.
#
# Use: after zero_buf, don't process yet - actually insert at end of loop body by converting continues
# to fall through a label. Simplest approach for this codebase:
#   after the entire for oi loop is wrong.
#
# Insert `node_finish_block(node, frames);` before every `continue;` that appears inside the
# process_block order loop until we hit smoother_run. Count carefully.

# Find process_block order loop region
start = t.find(new_loop)
if start < 0:
    raise SystemExit("new_loop not found after replace")
end = t.find("smoother_run(*g, frames);", start)
if end < 0:
    end = t.find("smoother_run(*g, frames)", start)
region = t[start:end]
# Before each `    continue;\n` in region that is at process indent, insert finish.
# Only the continues that skip to next oi - they look like `      continue;` or `    continue;`

def inject_finish(region_text: str) -> str:
    # Insert before continue statements inside the order loop
    return region_text.replace(
        "\n      continue;",
        "\n      node.processedThisBlock = 1;\n      node_update_hist_last(node, frames);\n      continue;",
    ).replace(
        "\n    continue;",
        "\n    node.processedThisBlock = 1;\n    node_update_hist_last(node, frames);\n    continue;",
    )

region2 = inject_finish(region)
# Also need finish for fall-through end of last branch without continue - check if loop body ends with }
t = t[:start] + region2 + t[end:]
print("process_block hist finish injected", region.count("continue;") , "->" )

# polyblep_tap_mask: also include Control-edge src ports from this node
old_mask_end = """  return mask == 0 ? kTapOut : mask;
}"""
# only first occurrence after polyblep_tap_mask
idx = t.find("static int polyblep_tap_mask")
idx2 = t.find(old_mask_end, idx)
if idx < 0 or idx2 < 0:
    raise SystemExit("polyblep_tap_mask end missing")
insert = """  for (int ei = 0; ei < g.paramModEdgeCount; ei++) {
    const ParamModEdge& e = g.paramModEdges[ei];
    if (!e.used || e.srcHash != node.idHash) continue;
    const int sp = clamp_src_port(e.srcPort);
    if (sp == kPortMono || sp == kPortLeft || sp == kPortRight) mask |= kTapOut;
    else if (sp == kPortSaw) mask |= kTapSaw;
    else if (sp == kPortRamp) mask |= kTapRamp;
    else if (sp == kPortSquare) mask |= kTapSquare;
    else if (sp == kPortTri) mask |= kTapTri;
    else if (sp == kPortSine) mask |= kTapSine;
  }
  return mask == 0 ? kTapOut : mask;
}"""
t = t[:idx2] + insert + t[idx2 + len(old_mask_end) :]
print("polyblep_tap_mask includes param-mod sources")

# After sample writes in process_polyblep sample loop, update hist
old_pb = """    if (mask & kTapSine) node.buf[kPortSine][f] = soemdsp_polyblep_sine(node.nativeHandle);
    freePhase = wrap_phase_pi(freePhase + kTwoPi * phaseInc);
  }
  node.phase = freePhase;
}"""
new_pb = """    if (mask & kTapSine) node.buf[kPortSine][f] = soemdsp_polyblep_sine(node.nativeHandle);
    node_update_hist_from_frame(node, f);
    freePhase = wrap_phase_pi(freePhase + kTwoPi * phaseInc);
  }
  node.phase = freePhase;
}"""
if old_pb not in t:
    print("WARN process_polyblep sample hist update missing")
else:
    t = t.replace(old_pb, new_pb, 1)
    print("polyblep sample hist update")

p.write_text(t, encoding="utf-8", newline="\n")
print("done")
