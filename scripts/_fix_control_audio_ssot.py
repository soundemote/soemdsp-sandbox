#!/usr/bin/env python3
"""B-043: Sample-accurate Control chase SSOT in graph_engine.cpp.

control_audio(g, c, f) catch-up steps the Control to frame f (idempotent).
Deletes smoother_step_node / node_control_smoothing / blockStepped.
"""
from __future__ import annotations

import re
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "native_modules" / "graph_engine" / "graph_engine.cpp"
src = PATH.read_text(encoding="utf-8")

# --- 1. Control field ---
src = src.replace(
    "  unsigned char blockStepped; // sample path already advanced this quantum",
    "  int steppedCount; // samples advanced this quantum (control_audio catch-up)",
)

# --- 2. After control_effective definition, add control_audio ---
# Find control_effective function end is hard; insert after the declaration
# `static inline double control_effective(const Control& c);` forward decl stays.
# Insert implementations after the full control_effective function body.

m = re.search(
    r"static inline double control_effective\(const Control& c\) \{.*?\n\}\n",
    src,
    re.S,
)
if not m:
    raise SystemExit("control_effective body not found")

CONTROL_AUDIO = r'''static inline double control_effective(const Control& c) {
''' + m.group(0)[len("static inline double control_effective(const Control& c) {\n"):]

# Actually replace by appending after the matched function
insert = '''
// Ensure Control chase has advanced through audio frame `f` (0-based).
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

'''

# control_step is defined AFTER control_effective currently? Check order.
# control_effective is at 2373; control_step at 3509. control_audio calls control_step
# so control_audio must be AFTER control_step definition!

# Insert after control_step function instead
m_step = re.search(
    r"static void control_step\(Control& c, Circuit& g\) \{.*?\n\}\n\nstatic void smoother_run",
    src,
    re.S,
)
if not m_step:
    raise SystemExit("control_step → smoother_run not found")

control_step_and_after = m_step.group(0)
# Insert between control_step closing and smoother_run
src = src.replace(
    control_step_and_after,
    control_step_and_after.replace(
        "\n\nstatic void smoother_run",
        "\n\n" + insert + "static void smoother_run",
        1,
    ),
    1,
)

# --- 3. init_control: blockStepped → steppedCount ---
src = src.replace("  c.blockStepped = 0;", "  c.steppedCount = 0;")
src = src.replace("  c.blockStepped = 0;", "  c.steppedCount = 0;")  # snap too

# --- 4. smoother_run catch-up ---
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
new_run = """static void smoother_run(Circuit& g, int n) {
  // Catch-up only: Controls read via control_audio already have steppedCount==n.
  // Unread chasing Controls (block-ZOH natives, etc.) advance here once per sample.
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
    # try with blockStepped already partially renamed
    if "static void smoother_run" in src and "blockStepped" in src[src.find("smoother_run"):src.find("smoother_run")+400]:
        raise SystemExit("smoother_run block mismatch:\n" + src[src.find("static void smoother_run"):src.find("static void smoother_run")+500])
    raise SystemExit("smoother_run not found")
src = src.replace(old_run, new_run, 1)

# --- 5. control_snap_to_target ---
src = src.replace(
    "  c.active = false;\n  c.blockStepped = 0;\n  c.dirty = true;",
    "  c.active = false;\n  c.steppedCount = 0;\n  c.dirty = true;",
)

# --- 6. Delete smoother_step_node + node_control_smoothing ---
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

# --- 7. smoother_clean ---
src = src.replace("    c->blockStepped = 0;", "    c->steppedCount = 0;")

# --- 8. Class B: process_output / gain / bias ---
src = src.replace(
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
""",
1)

src = src.replace(
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
""",
1)

src = src.replace(
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
""",
1)

# Mix
src = src.replace(
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
""",
1)

# Mix stereo
m = re.search(
    r"  const double vol1 = control_effective\(node\.laneVol\[0\]\);.*?for \(int f = 0; f < frames; f\+\+\) \{\n[ \t]*stamp_live_param_mods\(g, node, f\);",
    src,
    re.S,
)
if m:
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

# --- 9. Strip Class A boilerplate ---
# Remove controlSmoothing locals and smoother_step_node calls
src, n1 = re.subn(
    r"[ \t]*const bool controlSmoothing = node_control_smoothing\(node\);\n",
    "",
    src,
)
src, n2 = re.subn(
    r"[ \t]*if \(f > 0 && controlSmoothing\) smoother_step_node\(g, node\);\n",
    "",
    src,
)
src, n3 = re.subn(
    r"[ \t]*if \(controlSmoothing\) smoother_step_node\(g, node\);\n",
    "",
    src,
)
src, n4 = re.subn(
    r"[ \t]*smoother_step_node\(g, node\);\n",
    "",
    src,
)

# Fix predicates that OR'd controlSmoothing into sample-path decisions
# e.g. `liveF || ... || controlSmoothing` → need replacement
# After removing the local, these become compile errors — fix common patterns:
src, n5 = re.subn(
    r" \|\| controlSmoothing",
    " || node_has_active_chase(node)",
    src,
)
src, n6 = re.subn(
    r"controlSmoothing \|\| ",
    "node_has_active_chase(node) || ",
    src,
)
src, n7 = re.subn(
    r"\bcontrolSmoothing\b",
    "node_has_active_chase(node)",
    src,
)

# Add node_has_active_chase helper near control_audio
HAS_CHASE = '''
static bool node_has_active_chase(const Node& node) {
  const Control* slots[] = {
    &node.volumeDb, &node.pan, &node.frequency, &node.amplitude, &node.shape,
    &node.phaseParam, &node.resonance, &node.center, &node.width, &node.mix,
    &node.gainDb, &node.gainLeftDb, &node.gainRightDb, &node.offset,
    &node.laneVol[0], &node.laneVol[1], &node.laneVol[2], &node.laneVol[3],
    &node.laneBias[0], &node.laneBias[1], &node.laneBias[2], &node.laneBias[3]
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    if (slots[i]->active && !slots[i]->snap) return true;
  }
  return false;
}

'''
if "node_has_active_chase" in src and HAS_CHASE.strip()[:40] not in src:
    src = src.replace(
        "static inline double control_audio(Circuit& g, Control& c, int f) {\n  control_ensure_stepped(g, c, f);\n  return control_effective(c);\n}\n",
        "static inline double control_audio(Circuit& g, Control& c, int f) {\n  control_ensure_stepped(g, c, f);\n  return control_effective(c);\n}\n" + HAS_CHASE,
        1,
    )
elif "static inline double control_audio" in src and "node_has_active_chase" not in src:
    src = src.replace(
        "static inline double control_audio(Circuit& g, Control& c, int f) {\n  control_ensure_stepped(g, c, f);\n  return control_effective(c);\n}\n",
        "static inline double control_audio(Circuit& g, Control& c, int f) {\n  control_ensure_stepped(g, c, f);\n  return control_effective(c);\n}\n" + HAS_CHASE,
        1,
    )

# --- 10. Inside sample loops: convert control_effective(node.X) → control_audio for continuous ---
# Too risky globally. Instead convert known patterns inside loops that stamp:
# After stamp_live_param_mods(g, node, f); the next control_effective(node.*) for continuous knobs.
#
# Broader safe replace inside functions that already call stamp per frame:
# control_effective(node.amplitude) → control_audio(g, node.amplitude, f) when `f` is in scope.
# Apply for common continuous Control names.

CONTINUOUS = [
    "volumeDb", "pan", "frequency", "amplitude", "shape", "phaseParam",
    "resonance", "center", "width", "mix", "diffusionSize", "diffusionAmount",
    "delaySize", "recycle", "lfoAmplitude", "lfoBaseSpeed", "lfoVariation",
    "feedback", "level", "offsetMs", "tapOffsetMs", "lfoRate", "saturate",
    "lpfFrequency", "hpfFrequency", "tempoBpm", "offset", "inLow", "inHigh",
    "outLow", "outHigh", "gainDb", "gainLeftDb", "gainRightDb",
    "timeNumerator", "timeDenominator",
]

# Only replace control_effective(node.FOO) with control_audio when on a line that
# appears to be inside a sample loop — heuristic: file-wide replace is OK if
# Class C set_params uses control_effective BEFORE the loop (still correct —
# steppedCount stays 0, catch-up smoother_run advances). BUT if Class C calls
# control_effective once then process_block, catch-up still advances chase
# correctly without claiming audio frames — GOOD.
#
# DANGER: control_effective(node.amplitude) at frame 0 only in polyblep block path
# before process_block — if we change to control_audio(..., 0), steppedCount=1,
# then catch-up does frames-1 more steps — chase rate OK for next quantum, but
# the scalar passed to WASM is start-of-ramp only (same as before). OK.
#
# If we file-wide replace control_effective(node.X) → control_audio(g, node.X, f)
# then Class C and block-path code that has no `f` will not compile.
# So only replace inside loops — detect `for (int f = 0; f < frames;` bodies.

def transform_loop_bodies(text: str) -> str:
    out = []
    i = 0
    while True:
        m = re.search(r"for \(int f = 0; f < frames; f\+\+\) \{", text[i:])
        if not m:
            out.append(text[i:])
            break
        start = i + m.start()
        brace = i + m.end() - 1  # '{'
        out.append(text[i:brace + 1])
        # find matching close
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
                        body = body.replace(
                            f"control_effective(node.{name})",
                            f"control_audio(g, node.{name}, f)",
                        )
                        body = body.replace(
                            f"control_effective(frequency)",
                            f"control_audio(g, const_cast<Control&>(frequency), f)",
                        )
                    # phaseParam passed by ref to phase_offset_cycles — update callers separately
                    out.append(body)
                    out.append("}")
                    i = j + 1
                    break
            j += 1
        else:
            raise SystemExit("unbalanced brace in for-f loop")
    return "".join(out)

src = transform_loop_bodies(src)

# shape_param_01 used in loops — add overload
if "static double shape_param_01(const Node& node)" in src:
    src = src.replace(
        """static double shape_param_01(const Node& node) {
  double m = control_effective(node.shape);
  if (!(m == m)) m = 0.5;
  if (m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;
  return m;
}
""",
        """static double shape_param_01(const Node& node) {
  double m = control_effective(node.shape);
  if (!(m == m)) m = 0.5;
  if (m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;
  return m;
}

static double shape_param_01(Circuit& g, Node& node, int f) {
  double m = control_audio(g, node.shape, f);
  if (!(m == m)) m = 0.5;
  if (m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;
  return m;
}
""",
        1,
    )

# In loop bodies, shape_param_01(node) → shape_param_01(g, node, f)
src = transform_loop_bodies(src)  # already done continuous; do shape manually
src = re.sub(
    r"shape_param_01\(node\)",
    "shape_param_01(g, node, f)",
    src,
)
# Revert block-path (outside loops) accidental replacements — shape_param_01(g, node, f)
# when f not in scope will fail compile. Find shape_param_01(g, node, f) not in a for-f loop — hard.
# Safer: only replace shape_param_01(node) inside loops via transform
# Re-read and fix: we did global replace. Revert ones that are wrong by checking compile later.
# Actually block path uses shape_param_01(node) before loop — we replaced ALL.
# Restore block-path: lines with shape_param_01(g, node, f) where there's no nearby for-f.

# resolve_osc_hz: use control_audio for frequency when not live
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

# Inline yellow step block that set blockStepped
src = re.sub(
    r"if \(c && c->active && !c->snap\) \{\n\s*control_step\(\*c, g\);\n\s*c->blockStepped = 1;\n\s*\}",
    "if (c && c->active && !c->snap) {\n          control_ensure_stepped(g, *c, f);\n        }",
    src,
)

# Remaining blockStepped refs
src = src.replace("blockStepped", "steppedCount")

# Fix comment about smoother_run
src = src.replace(
    "  smoother_run(*g, frames);\n  smoother_clean(*g);",
    "  // Catch-up chase for Controls not heard via control_audio this quantum.\n"
    "  smoother_run(*g, frames);\n  smoother_clean(*g);",
    1,
)

# shape_param_01(g, node, f) on block path — restore shape_param_01(node) where f undefined.
# Heuristic: in process_* before any `for (int f`, uses of shape_param_01(g, node, f) → (node)
# Do function by function... simpler compile-fix cycle.

PATH.write_text(src, encoding="utf-8", newline="\n")
print("Wrote", PATH)
print(f"stripped controlSmoothing locals~{n1} step_if_f>{n2} step_if{n3} step_bare{n4}")
print(f"predicate fixes {n5+n6+n7}")
)
