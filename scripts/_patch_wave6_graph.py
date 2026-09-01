# One-shot Wave 6 graph_engine patcher (chordMemory…turingMachine).
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "native_modules" / "graph_engine" / "graph_engine.cpp"
text = p.read_text(encoding="utf-8")

EXTERN = r"""
extern "C" int soemdsp_chord_memory_create();
extern "C" void soemdsp_chord_memory_destroy(int handle);
extern "C" double soemdsp_chord_memory_sample(
  int handle, double latch, double clear, double advance, double pitch
);
extern "C" double soemdsp_chord_memory_note2(int handle);
extern "C" double soemdsp_chord_memory_note3(int handle);
extern "C" double soemdsp_chord_memory_note4(int handle);
extern "C" double soemdsp_chord_memory_arp(int handle);
extern "C" double soemdsp_chord_memory_gate(int handle);

extern "C" int soemdsp_chord_sequencer_create();
extern "C" void soemdsp_chord_sequencer_destroy(int handle);
extern "C" void soemdsp_chord_sequencer_sample(
  int handle, double clock, double reset, double progression
);
extern "C" int soemdsp_chord_sequencer_scale(int handle, double progression);
extern "C" double soemdsp_chord_sequencer_root(int handle, double progression);
extern "C" int soemdsp_chord_sequencer_step(int handle);

extern "C" int soemdsp_pitch_quantizer_create();
extern "C" void soemdsp_pitch_quantizer_destroy(int handle);
extern "C" double soemdsp_pitch_quantizer_sample(int handle, double pitch, int scaleMask);

extern "C" int soemdsp_turing_machine_create(unsigned int entropySeed);
extern "C" void soemdsp_turing_machine_destroy(int handle);
extern "C" double soemdsp_turing_machine_sample(
  int handle, double clock, double reset, double length, double probability, double level
);
extern "C" double soemdsp_turing_machine_scale(int handle);
extern "C" double soemdsp_turing_machine_gate(int handle);

"""

PROCESS = r"""
// Chord memory: Latch→Trigger, Clear→Reset, Advance→Increment, Pitch→PitchCV.
// Note1→Mono … Note4→Saw, Arp→Ramp, Gate→Square.
static void process_chord_memory(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasLatch = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasClear = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasAdvance = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  for (int f = 0; f < frames; f++) {
    const double note1 = soemdsp_chord_memory_sample(
      node.nativeHandle,
      hasLatch ? g.mixTrigger[f] : 0.0,
      hasClear ? g.mixReset[f] : 0.0,
      hasAdvance ? g.mixIncrement[f] : 0.0,
      hasPitch ? g.mixPitch[f] : 0.0
    );
    node.buf[kPortMono][f] = note1;
    node.buf[kPortLeft][f] = soemdsp_chord_memory_note2(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_chord_memory_note3(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_chord_memory_note4(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_chord_memory_arp(node.nativeHandle);
    node.buf[kPortSquare][f] = soemdsp_chord_memory_gate(node.nativeHandle);
  }
}

// Chord sequencer: Clock→Trigger, Reset→Reset. mode=progression, amplitude=level.
// Scale→Mono, Root→Left, Gate→Right, Step→Saw.
static void process_chord_sequencer(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasClock = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double progression = node.mode.out;
    const double clock = hasClock ? g.mixTrigger[f] : 0.0;
    soemdsp_chord_sequencer_sample(
      node.nativeHandle,
      clock,
      hasReset ? g.mixReset[f] : 0.0,
      progression
    );
    const double scale = (double)soemdsp_chord_sequencer_scale(node.nativeHandle, progression);
    const double root = soemdsp_chord_sequencer_root(node.nativeHandle, progression);
    const double gate = (clock > 0.0 ? 1.0 : 0.0) * node.amplitude.out;
    const double step = (double)soemdsp_chord_sequencer_step(node.nativeHandle);
    node.buf[kPortMono][f] = scale;
    node.buf[kPortLeft][f] = root;
    node.buf[kPortRight][f] = gate;
    node.buf[kPortSaw][f] = step;
  }
}

// Pitch quantizer: PitchCV + optional Scale on Mono. seed=scaleMask (12-bit).
static void process_pitch_quantizer(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool hasScale = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double pitch = hasPitch ? g.mixPitch[f] : 0.0;
    int mask;
    if (hasScale) {
      mask = (int)(g.mixMono[f] + (g.mixMono[f] >= 0.0 ? 0.5 : -0.5)) & 0xFFF;
    } else {
      mask = (int)(node.seed.out + 0.5) & 0xFFF;
    }
    const double out = soemdsp_pitch_quantizer_sample(node.nativeHandle, pitch, mask);
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Turing machine: Clock→Trigger, Reset→Reset.
// stages=length, shape=probability, level=amplitude. CV→Mono, Scale→Left, Gate→Right.
static void process_turing_machine(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasClock = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double cv = soemdsp_turing_machine_sample(
      node.nativeHandle,
      hasClock ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      node.stages.out,
      node.shape.out,
      node.amplitude.out
    );
    node.buf[kPortMono][f] = cv;
    node.buf[kPortLeft][f] = soemdsp_turing_machine_scale(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_turing_machine_gate(node.nativeHandle);
  }
}

"""

def must_replace(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"MISSING marker for {label}")
    if text.count(old) != 1:
        raise SystemExit(f"NON-UNIQUE marker for {label}: {text.count(old)}")
    text = text.replace(old, new, 1)
    print(f"ok {label}")

must_replace(
    'extern "C" double soemdsp_ray_bouncer_y(int handle);\n\n// Param-chase Papoulis',
    'extern "C" double soemdsp_ray_bouncer_y(int handle);\n'
    + EXTERN
    + "// Param-chase Papoulis",
    "externs",
)

must_replace(
    "static const int kTypeRayBouncer = 82;\n\nstatic const int kPortMono",
    "static const int kTypeRayBouncer = 82;\n"
    "static const int kTypeChordMemory = 83;\n"
    "static const int kTypeChordSequencer = 84;\n"
    "static const int kTypePitchQuantizer = 85;\n"
    "static const int kTypeTuringMachine = 86;\n\n"
    "static const int kPortMono",
    "type ids",
)

must_replace(
    "  } else if (kind == kTypeRayBouncer) {\n"
    "    soemdsp_ray_bouncer_destroy(n.nativeHandle);\n"
    "  }\n"
    "  n.nativeHandle = 0;",
    "  } else if (kind == kTypeRayBouncer) {\n"
    "    soemdsp_ray_bouncer_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypeChordMemory) {\n"
    "    soemdsp_chord_memory_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypeChordSequencer) {\n"
    "    soemdsp_chord_sequencer_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypePitchQuantizer) {\n"
    "    soemdsp_pitch_quantizer_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypeTuringMachine) {\n"
    "    soemdsp_turing_machine_destroy(n.nativeHandle);\n"
    "  }\n"
    "  n.nativeHandle = 0;",
    "destroy",
)

must_replace(
    "      : (typeId == kTypeLorenzAttractor) ? 10.0 // sigma\n"
    "      : (typeId == kTypeLogisticMap) ? 3.9 // r\n"
    "      : (typeId == kTypeHenonMap) ? 1.4 // a\n"
    "      : (typeId == kTypeChuaAttractor) ? 15.6 // alpha\n"
    "      : 0.5,",
    "      : (typeId == kTypeLorenzAttractor) ? 10.0 // sigma\n"
    "      : (typeId == kTypeLogisticMap) ? 3.9 // r\n"
    "      : (typeId == kTypeHenonMap) ? 1.4 // a\n"
    "      : (typeId == kTypeChuaAttractor) ? 15.6 // alpha\n"
    "      : (typeId == kTypeTuringMachine) ? 0.25 // probability\n"
    "      : 0.5,",
    "shape turing",
)

must_replace(
    "      : (typeId == kTypeSnowflake) ? 1.0 // Koch Snowflake pattern\n"
    "      : 1.0,\n"
    "    true\n"
    "  );",
    "      : (typeId == kTypeSnowflake) ? 1.0 // Koch Snowflake pattern\n"
    "      : (typeId == kTypeChordSequencer) ? 0.0 // progression\n"
    "      : 1.0,\n"
    "    true\n"
    "  );",
    "mode chordSequencer",
)

must_replace(
    "      : (typeId == kTypeTriggerCounter || typeId == kTypeStepSequencer) ? 8.0",
    "      : (typeId == kTypeTriggerCounter || typeId == kTypeStepSequencer\n"
    "          || typeId == kTypeTuringMachine) ? 8.0",
    "stages turing",
)

must_replace(
    "    n.seed,\n"
    "    (typeId == kTypeNoiseGenerator || typeId == kTypeRandomClock) ? 1.0\n"
    "      : (typeId == kTypeLutCell) ? 27030.0 // default truth table\n"
    "      : (typeId == kTypeSoemReverb) ? 500.0\n"
    "      : 0.0,",
    "    n.seed,\n"
    "    (typeId == kTypeNoiseGenerator || typeId == kTypeRandomClock) ? 1.0\n"
    "      : (typeId == kTypeLutCell) ? 27030.0 // default truth table\n"
    "      : (typeId == kTypeSoemReverb) ? 500.0\n"
    "      : (typeId == kTypePitchQuantizer) ? 2741.0 // major scale mask\n"
    "      : 0.0,",
    "seed pitchQuantizer",
)

must_replace(
    "  if (typeId == kTypeRayBouncer) return soemdsp_ray_bouncer_create();\n"
    "  return 0;\n"
    "}",
    "  if (typeId == kTypeRayBouncer) return soemdsp_ray_bouncer_create();\n"
    "  if (typeId == kTypeChordMemory) return soemdsp_chord_memory_create();\n"
    "  if (typeId == kTypeChordSequencer) return soemdsp_chord_sequencer_create();\n"
    "  if (typeId == kTypePitchQuantizer) return soemdsp_pitch_quantizer_create();\n"
    "  if (typeId == kTypeTuringMachine) {\n"
    "    static unsigned int turingEntropy = 0xC0FFEEu;\n"
    "    turingEntropy = turingEntropy * 1664525u + 1013904223u;\n"
    "    return soemdsp_turing_machine_create(turingEntropy ? turingEntropy : 1u);\n"
    "  }\n"
    "  return 0;\n"
    "}",
    "create",
)

must_replace(
    "    || typeId == kTypeRayBouncer;\n"
    "  // additiveOsc / ellipsoid are free-fn (no native handle).",
    "    || typeId == kTypeRayBouncer\n"
    "    || typeId == kTypeChordMemory\n"
    "    || typeId == kTypeChordSequencer\n"
    "    || typeId == kTypePitchQuantizer\n"
    "    || typeId == kTypeTuringMachine;\n"
    "  // additiveOsc / ellipsoid are free-fn (no native handle).",
    "needsNative",
)

must_replace(
    "    if (node.typeId == kTypeRayBouncer) {\n"
    "      process_ray_bouncer(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeReverbEffect) {",
    "    if (node.typeId == kTypeRayBouncer) {\n"
    "      process_ray_bouncer(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeChordMemory) {\n"
    "      process_chord_memory(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeChordSequencer) {\n"
    "      process_chord_sequencer(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypePitchQuantizer) {\n"
    "      process_pitch_quantizer(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeTuringMachine) {\n"
    "      process_turing_machine(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeReverbEffect) {",
    "dispatch",
)

must_replace(
    "  return 48; // + chaos CV 78–82 (lorenz/logistic/henon/chua/rayBouncer)\n"
    "}",
    "  return 49; // + musical/sequencing CV 83–86\n"
    "}",
    "version",
)

# Insert process fns after process_ray_bouncer
marker = (
    "    node.buf[kPortRight][f] = y;\n"
    "  }\n"
    "}\n\n"
    "// Master Clock / transport: tempo square."
)
if marker not in text:
    raise SystemExit("process insert marker missing")
text = text.replace(
    marker,
    "    node.buf[kPortRight][f] = y;\n"
    "  }\n"
    "}\n"
    + PROCESS
    + "// Master Clock / transport: tempo square.",
    1,
)
print("ok process fns")

# seed default for pitch quantizer — find existing seed init_control
old_seed = None
for line_block in [
    "init_control(n.seed, 0.0, false);",
    "init_control(n.seed, 500.0, false);",
    "init_control(\n    n.seed,",
]:
    if line_block in text:
        old_seed = line_block
        break
print("seed pattern", old_seed)

p.write_text(text, encoding="utf-8")
print("wrote", p)
