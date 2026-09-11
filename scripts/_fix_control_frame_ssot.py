#!/usr/bin/env python3
"""Framework SSOT: sample-accurate Control chase in graph_engine.cpp.

1. Unify Control slot list; add control_frame(); simplify smoother_step_node.
2. Replace stamp+smoother_step boilerplate with control_frame.
3. Rewrite freeze-outside process_* (output/gain/mix/bias/...) to per-sample reads.
"""
from __future__ import annotations

from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "native_modules" / "graph_engine" / "graph_engine.cpp"
src = PATH.read_text(encoding="utf-8")

SLOTS_HELPER = r'''
// All continuous Control slots on a Node (SSOT for chase + dirty).
// Discrete snap slots (waveform/mode/seed/…) may appear; snap skips step.
static inline void node_for_each_control(Node& node, void (*fn)(Control&, void*), void* ctx) {
  Control* slots[] = {
    &node.volumeDb, &node.pan, &node.frequency, &node.waveform, &node.amplitude,
    &node.shape, &node.phaseParam, &node.resonance, &node.mode, &node.stages,
    &node.center, &node.width, &node.oversample, &node.mix, &node.diffusionSize,
    &node.diffusionAmount, &node.delaySize, &node.recycle, &node.lfoAmplitude,
    &node.lfoBaseSpeed, &node.lfoVariation, &node.seed, &node.feedback, &node.level,
    &node.timeNumerator, &node.timeDenominator, &node.timingMode, &node.offsetMs,
    &node.tapOffsetMs, &node.lfoStyle, &node.lfoRate, &node.saturate, &node.lpfFrequency,
    &node.hpfFrequency, &node.tempoBpm, &node.offset, &node.inLow, &node.inHigh,
    &node.outLow, &node.outHigh, &node.gainDb, &node.gainLeftDb, &node.gainRightDb,
    &node.gainMonoSum,
    &node.laneVol[0], &node.laneVol[1], &node.laneVol[2], &node.laneVol[3],
    &node.laneBias[0], &node.laneBias[1], &node.laneBias[2], &node.laneBias[3],
    &node.bleed2, &node.bleed3, &node.bleed4
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    if (slots[i]) fn(*slots[i], ctx);
  }
}

static void smoother_step_one(Control& c, void* ctx) {
  Circuit* g = (Circuit*)ctx;
  if (!c.active || c.snap) return;
  control_step(c, *g);
  c.blockStepped = 1;
}

// One sample of this node's active Controls. Cheap no-op when none chasing.
static void smoother_step_node(Circuit& g, Node& node) {
  node_for_each_control(node, smoother_step_one, &g);
}

static void node_any_active_control(Control& c, void* ctx) {
  bool* any = (bool*)ctx;
  if (c.active && !c.snap) *any = true;
}

static bool node_control_smoothing(const Node& node) {
  bool any = false;
  // const_cast: walker needs Control&; does not mutate when only reading flags.
  node_for_each_control(const_cast<Node&>(node), node_any_active_control, &any);
  return any;
}

// SSOT per audio sample on the owning node: live MOD stamp + Control chase.
static inline void control_frame(Circuit& g, Node& node, int f) {
  stamp_live_param_mods(g, node, f);
  smoother_step_node(g, node);
}
'''

# Replace old smoother_step_node + node_control_smoothing block
old_step = """// One sample of a node's continuous Controls (sample-accurate osc/filter path).
static void smoother_step_node(Circuit& g, Node& node) {
  Control* slots[] = {
    &node.volumeDb, &node.pan, &node.frequency, &node.amplitude, &node.shape,
    &node.phaseParam, &node.resonance, &node.center, &node.width, &node.mix,
    &node.diffusionSize, &node.diffusionAmount, &node.delaySize, &node.recycle,
    &node.lfoAmplitude, &node.lfoBaseSpeed, &node.lfoVariation, &node.feedback,
    &node.level, &node.timeNumerator, &node.timeDenominator, &node.offsetMs,
    &node.tapOffsetMs, &node.lfoRate, &node.saturate, &node.lpfFrequency, &node.hpfFrequency,
    &node.tempoBpm, &node.offset, &node.inLow, &node.inHigh, &node.outLow,
    &node.outHigh, &node.gainDb, &node.gainLeftDb, &node.gainRightDb
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    Control* c = slots[i];
    if (c && c->active && !c->snap) {
      control_step(*c, g);
      c->blockStepped = 1;
    }
  }
}

static bool node_control_smoothing(const Node& node) {
  const Control* slots[] = {
    &node.frequency, &node.amplitude, &node.shape, &node.phaseParam,
    &node.resonance, &node.center, &node.width, &node.mix, &node.volumeDb, &node.pan
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    if (slots[i]->active && !slots[i]->snap) return true;
  }
  return false;
}
"""

if old_step not in src:
    raise SystemExit("old smoother_step_node block not found — edit script")
src = src.replace(old_step, SLOTS_HELPER, 1)

# Collapse common per-sample boilerplate to control_frame.
# Pattern A: stamp then conditional step (f>0)
import re

def sub_count(pattern, repl, text):
    new, n = re.subn(pattern, repl, text, flags=re.M)
    return new, n

total = 0
# stamp + if (f > 0 && controlSmoothing) smoother_step
src, n = sub_count(
    r"[ \t]*stamp_live_param_mods\(g, node, f\);\n"
    r"[ \t]*if \(f > 0 && controlSmoothing\) smoother_step_node\(g, node\);",
    "    control_frame(g, node, f);",
    src,
)
total += n
# if (controlSmoothing) smoother_step then stamp (frame 0 style inside loop)
src, n = sub_count(
    r"[ \t]*if \(controlSmoothing\) smoother_step_node\(g, node\);\n"
    r"[ \t]*stamp_live_param_mods\(g, node, f\);",
    "    control_frame(g, node, f);",
    src,
)
total += n
# stamp only that should become control_frame when followed by control reads in loop
# — only replace stamp_live_param_mods(g, node, f); alone inside loops carefully later.

# Fix process_output
old_out = """static void process_output(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  float gL = 1.0f, gR = 1.0f;
  pan_gains((float)control_effective(node.pan), &gL, &gR);
  const float vol = db_to_lin((float)control_effective(node.volumeDb));
  for (int f = 0; f < frames; f++) {
        stamp_live_param_mods(g, node, f);
    const double m = g.mixMono[f];
    const double l = (m + g.mixLeft[f]) * (double)vol * (double)gL;
    const double r = (m + g.mixRight[f]) * (double)vol * (double)gR;
    node.buf[kPortMono][f] = m * (double)vol;
    node.buf[kPortLeft][f] = l;
    node.buf[kPortRight][f] = r;
    g.outL[f] += l;
    g.outR[f] += r;
  }
}
"""
new_out = """static void process_output(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    control_frame(g, node, f);
    float gL = 1.0f, gR = 1.0f;
    pan_gains((float)control_effective(node.pan), &gL, &gR);
    const float vol = db_to_lin((float)control_effective(node.volumeDb));
    const double m = g.mixMono[f];
    const double l = (m + g.mixLeft[f]) * (double)vol * (double)gL;
    const double r = (m + g.mixRight[f]) * (double)vol * (double)gR;
    node.buf[kPortMono][f] = m * (double)vol;
    node.buf[kPortLeft][f] = l;
    node.buf[kPortRight][f] = r;
    g.outL[f] += l;
    g.outR[f] += r;
  }
}
"""
if old_out not in src:
    raise SystemExit("process_output block not found")
src = src.replace(old_out, new_out, 1)

old_gain = """static void process_gain(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  const double masterDb = control_effective(node.gainDb);
  const double leftDb = control_effective(node.gainLeftDb);
  const double rightDb = control_effective(node.gainRightDb);
  const double monoSum = control_effective(node.gainMonoSum);
  const double off = control_effective(node.offset);
  for (int f = 0; f < frames; f++) {
        stamp_live_param_mods(g, node, f);
    const double mono = g.mixMono[f];
    const double left = g.mixLeft[f];
    const double right = g.mixRight[f];
    node.buf[kPortMono][f] = soemdsp_gain_sample(
      0.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
    node.buf[kPortLeft][f] = soemdsp_gain_sample(
      1.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
    node.buf[kPortRight][f] = soemdsp_gain_sample(
      2.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
  }
}
"""
new_gain = """static void process_gain(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    control_frame(g, node, f);
    const double masterDb = control_effective(node.gainDb);
    const double leftDb = control_effective(node.gainLeftDb);
    const double rightDb = control_effective(node.gainRightDb);
    const double monoSum = control_effective(node.gainMonoSum);
    const double off = control_effective(node.offset);
    const double mono = g.mixMono[f];
    const double left = g.mixLeft[f];
    const double right = g.mixRight[f];
    node.buf[kPortMono][f] = soemdsp_gain_sample(
      0.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
    node.buf[kPortLeft][f] = soemdsp_gain_sample(
      1.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
    node.buf[kPortRight][f] = soemdsp_gain_sample(
      2.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
  }
}
"""
if old_gain not in src:
    raise SystemExit("process_gain block not found")
src = src.replace(old_gain, new_gain, 1)

old_bias = """static void process_bias(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  const double bias = control_effective(node.offset);
  for (int f = 0; f < frames; f++) {
        stamp_live_param_mods(g, node, f);
    const double out = (g.mixMono[f] + g.mixLeft[f] + g.mixRight[f]) + bias;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}
"""
new_bias = """static void process_bias(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    control_frame(g, node, f);
    const double bias = control_effective(node.offset);
    const double out = (g.mixMono[f] + g.mixLeft[f] + g.mixRight[f]) + bias;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}
"""
if old_bias not in src:
    raise SystemExit("process_bias block not found")
src = src.replace(old_bias, new_bias, 1)

# process_mix: move lane reads inside loop + control_frame
old_mix_head = """  const double v1 = control_effective(node.laneVol[0]);
  const double v2 = control_effective(node.laneVol[1]);
  const double v3 = control_effective(node.laneVol[2]);
  const double v4 = control_effective(node.laneVol[3]);
  const double b1 = control_effective(node.laneBias[0]);
  const double b2 = control_effective(node.laneBias[1]);
  const double b3 = control_effective(node.laneBias[2]);
  const double b4 = control_effective(node.laneBias[3]);
  const double bl2 = control_effective(node.bleed2);
  const double bl3 = control_effective(node.bleed3);
  const double bl4 = control_effective(node.bleed4);
  for (int f = 0; f < frames; f++) {
        stamp_live_param_mods(g, node, f);
    node.buf[kPortOut1][f] = soemdsp_mix_sample(
"""
new_mix_head = """  for (int f = 0; f < frames; f++) {
    control_frame(g, node, f);
    const double v1 = control_effective(node.laneVol[0]);
    const double v2 = control_effective(node.laneVol[1]);
    const double v3 = control_effective(node.laneVol[2]);
    const double v4 = control_effective(node.laneVol[3]);
    const double b1 = control_effective(node.laneBias[0]);
    const double b2 = control_effective(node.laneBias[1]);
    const double b3 = control_effective(node.laneBias[2]);
    const double b4 = control_effective(node.laneBias[3]);
    const double bl2 = control_effective(node.bleed2);
    const double bl3 = control_effective(node.bleed3);
    const double bl4 = control_effective(node.bleed4);
    node.buf[kPortOut1][f] = soemdsp_mix_sample(
"""
if old_mix_head not in src:
    raise SystemExit("process_mix head not found")
src = src.replace(old_mix_head, new_mix_head, 1)

old_ms_head = """  const double vol1 = control_effective(node.laneVol[0]);
  const double vol2 = control_effective(node.laneVol[1]);
  const double vol3 = control_effective(node.laneVol[2]);
  const double vol4 = control_effective(node.laneVol[3]);
  const double pan1 = control_effective(node.laneBias[0]);
  const double pan2 = control_effective(node.laneBias[1]);
  const double pan3 = control_effective(node.laneBias[2]);
  const double pan4 = control_effective(node.laneBias[3]);
  const double amp = control_effective(node.volumeDb); // Amplitude (All) in dB
  for (int f = 0; f < frames; f++) {
"""
# mix_stereo may already have stamp inside — find exact
m = re.search(
    r"  const double vol1 = control_effective\(node\.laneVol\[0\]\);.*?for \(int f = 0; f < frames; f\+\+\) \{\n(?P<indent>[ \t]*)stamp_live_param_mods\(g, node, f\);",
    src,
    re.S,
)
if not m:
    # try without stamp (already control_frame)
    if "const double vol1 = control_effective(node.laneVol[0]);" in src:
        raise SystemExit("process_mix_stereo pattern mismatch")
else:
    old = m.group(0)
    new = """  for (int f = 0; f < frames; f++) {
    control_frame(g, node, f);
    const double vol1 = control_effective(node.laneVol[0]);
    const double vol2 = control_effective(node.laneVol[1]);
    const double vol3 = control_effective(node.laneVol[2]);
    const double vol4 = control_effective(node.laneVol[3]);
    const double pan1 = control_effective(node.laneBias[0]);
    const double pan2 = control_effective(node.laneBias[1]);
    const double pan3 = control_effective(node.laneBias[2]);
    const double pan4 = control_effective(node.laneBias[3]);
    const double amp = control_effective(node.volumeDb); // Amplitude (All) in dB
"""
    # Keep only one opening brace content — the old matched through stamp line
    src = src.replace(old, new, 1)

# Remaining lone stamp_live_param_mods in sample loops → control_frame
# (modules that already step separately may double-step if we also leave smoother_step)
# Replace "stamp_live_param_mods(g, node, f);" only when NOT already control_frame
# and when next lines don't have smoother_step (already collapsed).

src, n = sub_count(
    r"^([ \t]*)stamp_live_param_mods\(g, node, f\);$",
    r"\1control_frame(g, node, f);",
    src,
)
total += n

# Remove now-redundant: control_frame then smoother_step on next line
src, n = sub_count(
    r"control_frame\(g, node, f\);\n[ \t]*if \(f > 0 && controlSmoothing\) smoother_step_node\(g, node\);",
    "control_frame(g, node, f);",
    src,
)
total += n
src, n = sub_count(
    r"control_frame\(g, node, f\);\n[ \t]*if \(controlSmoothing\) smoother_step_node\(g, node\);",
    "control_frame(g, node, f);",
    src,
)
total += n
src, n = sub_count(
    r"[ \t]*if \(controlSmoothing\) smoother_step_node\(g, node\);\n[ \t]*control_frame\(g, node, f\);",
    "    control_frame(g, node, f);",
    src,
)
total += n
src, n = sub_count(
    r"control_frame\(g, node, f\);\n[ \t]*smoother_step_node\(g, node\);",
    "control_frame(g, node, f);",
    src,
)
total += n

# Dead controlSmoothing locals that are unused — leave for compile to catch; strip common pattern
src, n = sub_count(
    r"[ \t]*const bool controlSmoothing = node_control_smoothing\(node\);\n",
    "",
    src,
)
print(f"stripped controlSmoothing locals: {n}")

# Comment on process_block smoother_run
src = src.replace(
    "  smoother_run(*g, frames);\n  smoother_clean(*g);",
    "  // Mop-up only: Controls already chased via control_frame/smoother_step_node\n"
    "  // set blockStepped. Remaining actives (no sample loop) advance here.\n"
    "  smoother_run(*g, frames);\n  smoother_clean(*g);",
    1,
)

PATH.write_text(src, encoding="utf-8", newline="\n")
print(f"Wrote {PATH}")
print(f"boilerplate collapses ~{total}")
)
