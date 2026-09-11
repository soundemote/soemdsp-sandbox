#!/usr/bin/env python3
"""B-043 clean apply: control_audio SSOT in graph_engine.cpp (from pristine HEAD)."""
from __future__ import annotations

import re
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "native_modules" / "graph_engine" / "graph_engine.cpp"
src = PATH.read_text(encoding="utf-8")

src = src.replace(
    "  unsigned char blockStepped; // sample path already advanced this quantum",
    "  int steppedCount; // samples advanced this quantum (control_audio catch-up)",
)
src = src.replace("  c.blockStepped = 0;", "  c.steppedCount = 0;")

old_run = """static void smoother_run(Circuit& g, int n) {
  if (g.toSmoothCount <= 0 || n < 1) return;
  for (int f = 0; f < n; f++) {
    for (int i = 0; i < g.toSmoothCount; i++) {
      Control* c = g.toSmooth[i];
      // Skip Controls already advanced sample-accurately this quantum.
      if (c && !c->blockStepped) control_step(*c, g);
    }
  }
}
"""
new_helpers = """// Ensure Control chase has advanced through audio frame `f` (0-based).
// Idempotent for repeated reads of the same Control at the same f.
static inline void control_ensure_stepped(Circuit& g, Control& c, int f) {
  if (f < 0 || c.snap || !c.active) return;
  while (c.steppedCount <= f) {
    control_step(c, g);
    c.steppedCount += 1;
  }
}

// Sample-accurate heard param: chase then effective (MOD after smooth).
static inline double control_audio(Circuit& g, Control& c, int f) {
  control_ensure_stepped(g, c, f);
  return control_effective(c);
}

// Fast-path predicate: any continuous Control on this node is chasing.
static bool node_has_active_chase(const Node& node) {
  const Control* slots[] = {
    &node.volumeDb, &node.pan, &node.frequency, &node.amplitude, &node.shape,
    &node.phaseParam, &node.resonance, &node.center, &node.width, &node.mix,
    &node.gainDb, &node.gainLeftDb, &node.gainRightDb, &node.gainMonoSum, &node.offset,
    &node.lpfFrequency, &node.hpfFrequency, &node.feedback, &node.level,
    &node.timeNumerator, &node.timeDenominator,
    &node.laneVol[0], &node.laneVol[1], &node.laneVol[2], &node.laneVol[3],
    &node.laneBias[0], &node.laneBias[1], &node.laneBias[2], &node.laneBias[3],
    &node.bleed2, &node.bleed3, &node.bleed4
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    if (slots[i]->active && !slots[i]->snap) return true;
  }
  return false;
}

static void smoother_run(Circuit& g, int n) {
  // Catch-up only: Controls read via control_audio already have steppedCount>=n.
  // Unread chasing Controls (intentional block-ZOH natives) advance here.
  if (g.toSmoothCount <= 0 || n < 1) return;
  for (int i = 0; i < g.toSmoothCount; i++) {
    Control* c = g.toSmooth[i];
    if (!c || c->snap || !c->active) continue;
    while (c->steppedCount < n) {
      control_step(*c, g);
      c->steppedCount += 1;
    }
  }
}
"""
if old_run not in src:
    raise SystemExit("smoother_run not found")
src = src.replace(old_run, new_helpers, 1)

src = src.replace(
    "  c.active = false;\n  c.blockStepped = 0;\n  c.dirty = true;",
    "  c.active = false;\n  c.steppedCount = 0;\n  c.dirty = true;",
)

old_sns = """// One sample of a node's continuous Controls (sample-accurate osc/filter path).
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
if old_sns not in src:
    raise SystemExit("smoother_step_node block not found")
src = src.replace(old_sns, "", 1)
src = src.replace("    c->blockStepped = 0;", "    c->steppedCount = 0;")

# Class B rewrites
replacements = [
(
"""static void process_output(Circuit& g, Node& node, int frames) {
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
""",
"""static void process_output(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    stamp_live_param_mods(g, node, f);
    float gL = 1.0f, gR = 1.0f;
    pan_gains((float)control_audio(g, node.pan, f), &gL, &gR);
    const float vol = db_to_lin((float)control_audio(g, node.volumeDb, f));
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
"""),
(
"""static void process_gain(Circuit& g, Node& node, int frames) {
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
""",
"""static void process_gain(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    stamp_live_param_mods(g, node, f);
    const double masterDb = control_audio(g, node.gainDb, f);
    const double leftDb = control_audio(g, node.gainLeftDb, f);
    const double rightDb = control_audio(g, node.gainRightDb, f);
    const double monoSum = control_audio(g, node.gainMonoSum, f);
    const double off = control_audio(g, node.offset, f);
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
"""),
(
"""static void process_bias(Circuit& g, Node& node, int frames) {
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
""",
"""static void process_bias(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    stamp_live_param_mods(g, node, f);
    const double bias = control_audio(g, node.offset, f);
    const double out = (g.mixMono[f] + g.mixLeft[f] + g.mixRight[f]) + bias;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}
"""),
(
"""  const double v1 = control_effective(node.laneVol[0]);
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
""",
"""  for (int f = 0; f < frames; f++) {
    stamp_live_param_mods(g, node, f);
    const double v1 = control_audio(g, node.laneVol[0], f);
    const double v2 = control_audio(g, node.laneVol[1], f);
    const double v3 = control_audio(g, node.laneVol[2], f);
    const double v4 = control_audio(g, node.laneVol[3], f);
    const double b1 = control_audio(g, node.laneBias[0], f);
    const double b2 = control_audio(g, node.laneBias[1], f);
    const double b3 = control_audio(g, node.laneBias[2], f);
    const double b4 = control_audio(g, node.laneBias[3], f);
    const double bl2 = control_audio(g, node.bleed2, f);
    const double bl3 = control_audio(g, node.bleed3, f);
    const double bl4 = control_audio(g, node.bleed4, f);
    node.buf[kPortOut1][f] = soemdsp_mix_sample(
"""),
]
for old, new in replacements:
    if old not in src:
        raise SystemExit("missing replacement block")
    src = src.replace(old, new, 1)

m = re.search(
    r"  const double vol1 = control_effective\(node\.laneVol\[0\]\);.*?for \(int f = 0; f < frames; f\+\+\) \{\n[ \t]*stamp_live_param_mods\(g, node, f\);",
    src,
    re.S,
)
if not m:
    raise SystemExit("mix stereo missing")
src = src.replace(
    m.group(0),
    """  for (int f = 0; f < frames; f++) {
    stamp_live_param_mods(g, node, f);
    const double vol1 = control_audio(g, node.laneVol[0], f);
    const double vol2 = control_audio(g, node.laneVol[1], f);
    const double vol3 = control_audio(g, node.laneVol[2], f);
    const double vol4 = control_audio(g, node.laneVol[3], f);
    const double pan1 = control_audio(g, node.laneBias[0], f);
    const double pan2 = control_audio(g, node.laneBias[1], f);
    const double pan3 = control_audio(g, node.laneBias[2], f);
    const double pan4 = control_audio(g, node.laneBias[3], f);
    const double amp = control_audio(g, node.volumeDb, f); // Amplitude (All) in dB""",
    1,
)

# Class A: drop per-sample step_node calls; keep chase predicate as takeSamplePath.
for pat in [
    r"[ \t]*if \(f > 0 && controlSmoothing\) smoother_step_node\(g, node\);\n",
    r"[ \t]*if \(controlSmoothing\) smoother_step_node\(g, node\);\n",
    r"[ \t]*smoother_step_node\(g, node\);\n",
]:
    src, _ = re.subn(pat, "", src)

# controlSmoothing = node_control_smoothing(...) → takeSamplePath = node_has_active_chase(...)
src, n = re.subn(
    r"const bool controlSmoothing = node_control_smoothing\(node\)",
    "const bool takeSamplePath = node_has_active_chase(node)",
    src,
)
print("chase decls", n)
src, n = re.subn(r"\bcontrolSmoothing\b", "takeSamplePath", src)
print("controlSmoothing->takeSamplePath", n)
src, n = re.subn(r"node_control_smoothing\(node\)", "node_has_active_chase(node)", src)
print("leftover smoothing", n)

# resolve_osc_hz
src = src.replace(
"""static double resolve_osc_hz(
  Circuit& g, int frame, bool liveF, bool livePitch,
  const Control& frequency, double referenceVoltage, double sr
) {
  double freq;
  if (liveF) {
    freq = g.mixF[frame];
  } else if (livePitch) {
    freq = pitched_hz(control_effective(frequency), g.mixPitch[frame], referenceVoltage);
  } else {
    freq = control_effective(frequency);
  }
  freq = apply_global_pitch(g, freq);
  return clamp_hz_nyquist(freq, sr);
}
""",
"""static double resolve_osc_hz(
  Circuit& g, int frame, bool liveF, bool livePitch,
  Control& frequency, double referenceVoltage, double sr
) {
  double freq;
  if (liveF) {
    freq = g.mixF[frame];
  } else if (livePitch) {
    freq = pitched_hz(control_audio(g, frequency, frame), g.mixPitch[frame], referenceVoltage);
  } else {
    freq = control_audio(g, frequency, frame);
  }
  freq = apply_global_pitch(g, freq);
  return clamp_hz_nyquist(freq, sr);
}
""",
1)

CONTINUOUS = [
    "volumeDb", "pan", "frequency", "amplitude", "shape", "phaseParam", "resonance",
    "center", "width", "mix", "diffusionSize", "diffusionAmount", "delaySize", "recycle",
    "lfoAmplitude", "lfoBaseSpeed", "lfoVariation", "feedback", "level", "offsetMs",
    "tapOffsetMs", "lfoRate", "saturate", "lpfFrequency", "hpfFrequency", "tempoBpm",
    "offset", "inLow", "inHigh", "outLow", "outHigh", "gainDb", "gainLeftDb", "gainRightDb",
    "gainMonoSum", "timeNumerator", "timeDenominator", "bleed2", "bleed3", "bleed4",
]

def transform_loops(text: str) -> str:
    out = []
    i = 0
    reps = 0
    while True:
        m = re.search(r"for \(int f = 0; f < frames; f\+\+\) \{", text[i:])
        if not m:
            out.append(text[i:])
            break
        brace = i + m.end() - 1
        out.append(text[i : brace + 1])
        depth = 0
        j = brace
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    body = text[brace + 1 : j]
                    for name in CONTINUOUS:
                        a = f"control_effective(node.{name})"
                        b = f"control_audio(g, node.{name}, f)"
                        reps += body.count(a)
                        body = body.replace(a, b)
                    for idx in range(4):
                        for base in ("laneVol", "laneBias"):
                            a = f"control_effective(node.{base}[{idx}])"
                            b = f"control_audio(g, node.{base}[{idx}], f)"
                            reps += body.count(a)
                            body = body.replace(a, b)
                    out.append(body)
                    out.append("}")
                    i = j + 1
                    break
            j += 1
        else:
            raise SystemExit("unbalanced for-f")
    print("loop effective->audio", reps)
    return "".join(out)

src = transform_loops(src)

src, n = re.subn(
    r"if \(c && c->active && !c->snap\) \{\s*control_step\(\*c, g\);\s*c->blockStepped = 1;\s*\}",
    "if (c && c->active && !c->snap) { control_ensure_stepped(g, *c, f); }",
    src,
    flags=re.S,
)
print("yellow inline", n)
src = src.replace("blockStepped", "steppedCount")

src = src.replace(
    "  smoother_run(*g, frames);\n  smoother_clean(*g);",
    "  // Catch-up chase for Controls not heard via control_audio this quantum.\n"
    "  smoother_run(*g, frames);\n  smoother_clean(*g);",
    1,
)

# Normalize stamp indent
src = src.replace("                stamp_live_param_mods(g, node, f);", "    stamp_live_param_mods(g, node, f);")
src = src.replace("        stamp_live_param_mods(g, node, f);", "    stamp_live_param_mods(g, node, f);")

# Brace check
depth = 0
for ch in src:
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
if depth != 0:
    raise SystemExit(f"brace depth {depth}")

for s in ["node_control_smoothing", "blockStepped", "controlSmoothing"]:
    if s in src:
        raise SystemExit(f"leftover {s}: {src.count(s)}")
if "smoother_step_node(g" in src:
    raise SystemExit("smoother_step_node call remains")

PATH.write_text(src, encoding="utf-8", newline="\n")
print("OK", PATH)
