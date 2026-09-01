# Wave 7: fractalBrownianNoise, piSpigotNoise, randomWalk, pulseExplosion (87–90).
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "native_modules" / "graph_engine" / "graph_engine.cpp"
text = p.read_text(encoding="utf-8")

EXTERN = r"""
extern "C" int soemdsp_fbm_create();
extern "C" void soemdsp_fbm_destroy(int handle);
extern "C" void soemdsp_fbm_reset(int handle);
extern "C" void soemdsp_fbm_sample(
  int handle, int seedInt, int octaves, double persistence, double scale,
  double frequency, double level, double sampleRate
);
extern "C" double soemdsp_fbm_x(int handle);
extern "C" double soemdsp_fbm_y(int handle);
extern "C" double soemdsp_fbm_z(int handle);

extern "C" int soemdsp_pi_spigot_noise_create();
extern "C" void soemdsp_pi_spigot_noise_destroy(int handle);
extern "C" void soemdsp_pi_spigot_noise_reset_seed(int handle, double start, double stride);
extern "C" void soemdsp_pi_spigot_noise_sample(int handle, double color, double smoothing, double level);
extern "C" double soemdsp_pi_spigot_noise_left(int handle);
extern "C" double soemdsp_pi_spigot_noise_right(int handle);
extern "C" double soemdsp_pi_spigot_noise_hex(int handle);
extern "C" double soemdsp_pi_spigot_noise_n(int handle);
extern "C" double soemdsp_pi_spigot_noise_t(int handle);
extern "C" double soemdsp_pi_spigot_noise_b3(int handle);
extern "C" double soemdsp_pi_spigot_noise_b2(int handle);
extern "C" double soemdsp_pi_spigot_noise_b1(int handle);
extern "C" double soemdsp_pi_spigot_noise_b0(int handle);

extern "C" int soemdsp_random_walk_create();
extern "C" void soemdsp_random_walk_destroy(int handle);
extern "C" void soemdsp_random_walk_reset_seed(int handle, double seed);
extern "C" double soemdsp_random_walk_sample(
  int handle, double method, double frequency, double jitter, double level, double sampleRate
);

extern "C" int soemdsp_pulse_explosion_create();
extern "C" void soemdsp_pulse_explosion_destroy(int handle);
extern "C" double soemdsp_pulse_explosion_sample(
  int handle, double trigger, double startTime, double centerTime, double endTime,
  double timeSpread, int numberOfPulses, double lowAmplitude, double highAmplitude,
  double seed, double sampleRate
);
extern "C" double soemdsp_pulse_explosion_curve(int handle);

"""

PROCESS = r"""
// fBm noise: Reset live. frequency/stages=octaves/shape=persistence/center=scale/
// seed/amplitude. X→Mono Y→Left Z→Right.
static void process_fractal_brownian_noise(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const bool high = hasReset && g.mixReset[f] > 0.0;
    if (high && !wasHigh) soemdsp_fbm_reset(node.nativeHandle);
    wasHigh = high;
    soemdsp_fbm_sample(
      node.nativeHandle,
      (int)(node.seed.out + 0.5),
      (int)(node.stages.out + 0.5),
      node.shape.out,
      node.center.out,
      node.frequency.out,
      node.amplitude.out,
      sr
    );
    node.buf[kPortMono][f] = soemdsp_fbm_x(node.nativeHandle);
    node.buf[kPortLeft][f] = soemdsp_fbm_y(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_fbm_z(node.nativeHandle);
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

// Pi spigot: center=start, stages=stride, mode=color, shape=smoothing, amplitude.
// Sum→Mono Term→Left Hex→Right N→Saw T→Ramp B3..B0→Square/Tri/Sine/DryR(Ramp+1?).
// Buses: Square=B3 Tri=B2 Sine=B1 — B0 folds onto Saw alongside N? Prefer:
// Hex→Right N→Saw T→Ramp B3→Square B2→Tri B1→Sine; B0 unused on 8th → overwrite
// DryR share of Ramp is taken; put B0 on leftover — actually 8 buses 0..7:
// Mono Sum, Left Term, Right Hex, Saw N, Ramp T, Square B3, Tri B2, Sine B1.
// B0 omitted from graph taps (still computed in native).
static void process_pi_spigot_noise(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool controlSmoothing = node_control_smoothing(node);
  const double start = node.center.out;
  const double stride = node.stages.out;
  const double key = start * 1000.0 + stride;
  if (key != node.lastReset) {
    soemdsp_pi_spigot_noise_reset_seed(node.nativeHandle, start, stride);
    node.lastReset = key;
  }
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_pi_spigot_noise_sample(
      node.nativeHandle, node.mode.out, node.shape.out, node.amplitude.out
    );
    node.buf[kPortMono][f] = soemdsp_pi_spigot_noise_left(node.nativeHandle);
    node.buf[kPortLeft][f] = soemdsp_pi_spigot_noise_right(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_pi_spigot_noise_hex(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_pi_spigot_noise_n(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_pi_spigot_noise_t(node.nativeHandle);
    node.buf[kPortSquare][f] = soemdsp_pi_spigot_noise_b3(node.nativeHandle);
    node.buf[kPortTri][f] = soemdsp_pi_spigot_noise_b2(node.nativeHandle);
    node.buf[kPortSine][f] = soemdsp_pi_spigot_noise_b1(node.nativeHandle);
  }
}

// Random walk: mode=method, frequency, width=jitter, seed, amplitude.
static void process_random_walk(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  const double seed = node.seed.out;
  if (seed != node.lastReset) {
    soemdsp_random_walk_reset_seed(node.nativeHandle, seed);
    node.lastReset = seed;
  }
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double out = soemdsp_random_walk_sample(
      node.nativeHandle,
      node.mode.out,
      node.frequency.out,
      node.width.out,
      node.amplitude.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Pulse explosion: Trigger live. Crowded timing/amp params. Out→Mono Curve→Left.
static void process_pulse_explosion(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double out = soemdsp_pulse_explosion_sample(
      node.nativeHandle,
      hasTrig ? g.mixTrigger[f] : 0.0,
      node.timeNumerator.out,   // startTime
      node.center.out,          // centerTime
      node.timeDenominator.out, // endTime
      node.mix.out,             // timeSpread
      (int)(node.stages.out + 0.5),
      node.inLow.out,           // lowAmplitude
      node.inHigh.out,          // highAmplitude
      node.seed.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = soemdsp_pulse_explosion_curve(node.nativeHandle);
    node.buf[kPortRight][f] = out;
  }
}

"""

def must_replace(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"MISSING {label}")
    if text.count(old) != 1:
        raise SystemExit(f"NON-UNIQUE {label}: {text.count(old)}")
    text = text.replace(old, new, 1)
    print("ok", label)

must_replace(
    'extern "C" double soemdsp_turing_machine_gate(int handle);\n\n// Param-chase Papoulis',
    'extern "C" double soemdsp_turing_machine_gate(int handle);\n'
    + EXTERN
    + "// Param-chase Papoulis",
    "externs",
)

must_replace(
    "static const int kTypeTuringMachine = 86;\n\nstatic const int kPortMono",
    "static const int kTypeTuringMachine = 86;\n"
    "static const int kTypeFractalBrownianNoise = 87;\n"
    "static const int kTypePiSpigotNoise = 88;\n"
    "static const int kTypeRandomWalk = 89;\n"
    "static const int kTypePulseExplosion = 90;\n\n"
    "static const int kPortMono",
    "type ids",
)

must_replace(
    "  } else if (kind == kTypeTuringMachine) {\n"
    "    soemdsp_turing_machine_destroy(n.nativeHandle);\n"
    "  }\n"
    "  n.nativeHandle = 0;",
    "  } else if (kind == kTypeTuringMachine) {\n"
    "    soemdsp_turing_machine_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypeFractalBrownianNoise) {\n"
    "    soemdsp_fbm_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypePiSpigotNoise) {\n"
    "    soemdsp_pi_spigot_noise_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypeRandomWalk) {\n"
    "    soemdsp_random_walk_destroy(n.nativeHandle);\n"
    "  } else if (kind == kTypePulseExplosion) {\n"
    "    soemdsp_pulse_explosion_destroy(n.nativeHandle);\n"
    "  }\n"
    "  n.nativeHandle = 0;",
    "destroy",
)

# frequency defaults for fbm 0.5, randomWalk 2
must_replace(
    "      : (typeId == kTypeLogisticMap || typeId == kTypeHenonMap\n"
    "          || typeId == kTypeRayBouncer) ? 8.0 // rate/frequency\n"
    "      : 220.0,",
    "      : (typeId == kTypeLogisticMap || typeId == kTypeHenonMap\n"
    "          || typeId == kTypeRayBouncer) ? 8.0 // rate/frequency\n"
    "      : (typeId == kTypeFractalBrownianNoise) ? 0.5\n"
    "      : (typeId == kTypeRandomWalk) ? 2.0\n"
    "      : 220.0,",
    "freq defaults",
)

must_replace(
    "      : (typeId == kTypeTuringMachine) ? 0.25 // probability\n"
    "      : 0.5,",
    "      : (typeId == kTypeTuringMachine) ? 0.25 // probability\n"
    "      : (typeId == kTypeFractalBrownianNoise) ? 0.5 // persistence\n"
    "      : (typeId == kTypePiSpigotNoise) ? 0.0 // smoothing\n"
    "      : 0.5,",
    "shape defaults",
)

must_replace(
    "      : (typeId == kTypeChordSequencer) ? 0.0 // progression\n"
    "      : 1.0,\n"
    "    true\n"
    "  );",
    "      : (typeId == kTypeChordSequencer) ? 0.0 // progression\n"
    "      : (typeId == kTypeRandomWalk) ? 3.0 // Fixed Steps\n"
    "      : (typeId == kTypePiSpigotNoise) ? 0.0 // color White\n"
    "      : 1.0,\n"
    "    true\n"
    "  );",
    "mode defaults",
)

must_replace(
    "      : (typeId == kTypeTriggerCounter || typeId == kTypeStepSequencer\n"
    "          || typeId == kTypeTuringMachine) ? 8.0",
    "      : (typeId == kTypeTriggerCounter || typeId == kTypeStepSequencer\n"
    "          || typeId == kTypeTuringMachine) ? 8.0\n"
    "      : (typeId == kTypeFractalBrownianNoise) ? 4.0 // octaves\n"
    "      : (typeId == kTypePiSpigotNoise) ? 1.0 // stride\n"
    "      : (typeId == kTypePulseExplosion) ? 20.0 // numberOfPulses",
    "stages defaults",
)

must_replace(
    "      : (typeId == kTypeRayBouncer) ? 1.5 // aspect\n"
    "      : 0.0,",
    "      : (typeId == kTypeRayBouncer) ? 1.5 // aspect\n"
    "      : (typeId == kTypeFractalBrownianNoise) ? 1.0 // scale\n"
    "      : (typeId == kTypePiSpigotNoise) ? 0.0 // start\n"
    "      : (typeId == kTypePulseExplosion) ? 0.5 // centerTime\n"
    "      : 0.0,",
    "center defaults",
)

must_replace(
    "      : (typeId == kTypeRayBouncer) ? 1.0 // size\n"
    "      : 2.0,",
    "      : (typeId == kTypeRayBouncer) ? 1.0 // size\n"
    "      : (typeId == kTypeRandomWalk) ? 0.25 // jitter\n"
    "      : 2.0,",
    "width defaults",
)

# mix default for pulseExplosion timeSpread 0.3 — find mix init
# seed defaults
must_replace(
    "      : (typeId == kTypePitchQuantizer) ? 2741.0 // major scale mask\n"
    "      : 0.0,",
    "      : (typeId == kTypePitchQuantizer) ? 2741.0 // major scale mask\n"
    "      : (typeId == kTypeFractalBrownianNoise || typeId == kTypeRandomWalk) ? 1.0\n"
    "      : 0.0,",
    "seed defaults",
)

# timeNumerator/Denominator for pulse start/end — find their inits
# mix for timeSpread
idx = text.find("init_control(\n    n.mix,")
print("mix at", idx, repr(text[idx:idx+180]) if idx>=0 else None)

must_replace(
    "  if (typeId == kTypeTuringMachine) {\n"
    "    static unsigned int turingEntropy = 0xC0FFEEu;\n"
    "    turingEntropy = turingEntropy * 1664525u + 1013904223u;\n"
    "    return soemdsp_turing_machine_create(turingEntropy ? turingEntropy : 1u);\n"
    "  }\n"
    "  return 0;\n"
    "}",
    "  if (typeId == kTypeTuringMachine) {\n"
    "    static unsigned int turingEntropy = 0xC0FFEEu;\n"
    "    turingEntropy = turingEntropy * 1664525u + 1013904223u;\n"
    "    return soemdsp_turing_machine_create(turingEntropy ? turingEntropy : 1u);\n"
    "  }\n"
    "  if (typeId == kTypeFractalBrownianNoise) return soemdsp_fbm_create();\n"
    "  if (typeId == kTypePiSpigotNoise) return soemdsp_pi_spigot_noise_create();\n"
    "  if (typeId == kTypeRandomWalk) return soemdsp_random_walk_create();\n"
    "  if (typeId == kTypePulseExplosion) return soemdsp_pulse_explosion_create();\n"
    "  return 0;\n"
    "}",
    "create",
)

must_replace(
    "    || typeId == kTypeTuringMachine;\n"
    "  // additiveOsc / ellipsoid are free-fn (no native handle).",
    "    || typeId == kTypeTuringMachine\n"
    "    || typeId == kTypeFractalBrownianNoise\n"
    "    || typeId == kTypePiSpigotNoise\n"
    "    || typeId == kTypeRandomWalk\n"
    "    || typeId == kTypePulseExplosion;\n"
    "  // additiveOsc / ellipsoid are free-fn (no native handle).",
    "needsNative",
)

must_replace(
    "    if (node.typeId == kTypeTuringMachine) {\n"
    "      process_turing_machine(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeReverbEffect) {",
    "    if (node.typeId == kTypeTuringMachine) {\n"
    "      process_turing_machine(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeFractalBrownianNoise) {\n"
    "      process_fractal_brownian_noise(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypePiSpigotNoise) {\n"
    "      process_pi_spigot_noise(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeRandomWalk) {\n"
    "      process_random_walk(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypePulseExplosion) {\n"
    "      process_pulse_explosion(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeReverbEffect) {",
    "dispatch",
)

must_replace(
    "  return 49; // + musical/sequencing CV 83–86\n"
    "}",
    "  return 50; // + noise/modulators 87–90\n"
    "}",
    "version",
)

# Insert process after turing machine process fn — find end of process_turing_machine
marker = (
    "    node.buf[kPortRight][f] = soemdsp_turing_machine_gate(node.nativeHandle);\n"
    "  }\n"
    "}\n\n"
    "// Master Clock / transport: tempo square."
)
# Actually process_turing was inserted BEFORE Master Clock, and chord stuff before that.
# Find after process_turing_machine
marker2 = (
    "    node.buf[kPortRight][f] = soemdsp_turing_machine_gate(node.nativeHandle);\n"
    "  }\n"
    "}\n\n"
    "// Master Clock / transport: tempo square."
)
if marker2 not in text:
    # maybe Master Clock comment moved — search turing gate line
    i = text.find("soemdsp_turing_machine_gate(node.nativeHandle);")
    print("turing gate at", i)
    print(repr(text[i:i+200]))
    raise SystemExit("process insert marker missing")
text = text.replace(marker2, 
    "    node.buf[kPortRight][f] = soemdsp_turing_machine_gate(node.nativeHandle);\n"
    "  }\n"
    "}\n"
    + PROCESS
    + "// Master Clock / transport: tempo square.",
    1)
print("ok process fns")

# Pulse explosion timing/amp defaults on shared Controls.
must_replace(
    "      : (typeId == kTypeRayBouncer) ? 0.0 // rotate deg\n"
    "      : 0.43,\n"
    "    false\n"
    "  );\n"
    "  init_control(\n"
    "    n.diffusionSize,",
    "      : (typeId == kTypeRayBouncer) ? 0.0 // rotate deg\n"
    "      : (typeId == kTypePulseExplosion) ? 0.3 // timeSpread\n"
    "      : 0.43,\n"
    "    false\n"
    "  );\n"
    "  init_control(\n"
    "    n.diffusionSize,",
    "mix pulse",
)

must_replace(
    "    n.timeNumerator,\n"
    "    (typeId == kTypeSlewLimiter) ? 0.05\n"
    "      : (typeId == kTypeSampleDelay) ? 0.0",
    "    n.timeNumerator,\n"
    "    (typeId == kTypePulseExplosion) ? 0.0 // startTime\n"
    "      : (typeId == kTypeSlewLimiter) ? 0.05\n"
    "      : (typeId == kTypeSampleDelay) ? 0.0",
    "timeNum pulse",
)

must_replace(
    "    n.timeDenominator,\n"
    "    (typeId == kTypeSlewLimiter) ? 0.20\n"
    "      : (typeId == kTypeSampleDelay) ? 0.0",
    "    n.timeDenominator,\n"
    "    (typeId == kTypePulseExplosion) ? 1.0 // endTime\n"
    "      : (typeId == kTypeSlewLimiter) ? 0.20\n"
    "      : (typeId == kTypeSampleDelay) ? 0.0",
    "timeDen pulse",
)

must_replace(
    "    n.inLow,\n"
    "    (typeId == kTypeRange) ? -1.0 : (typeId == kTypeClipperLimiter) ? -12.0 : 0.0,",
    "    n.inLow,\n"
    "    (typeId == kTypePulseExplosion) ? 0.3 // lowAmplitude\n"
    "      : (typeId == kTypeRange) ? -1.0 : (typeId == kTypeClipperLimiter) ? -12.0 : 0.0,",
    "inLow pulse",
)

must_replace(
    "    n.inHigh,\n"
    "    (typeId == kTypeRange) ? 1.0 : (typeId == kTypeClipperLimiter) ? 0.0 : 1.0,",
    "    n.inHigh,\n"
    "    (typeId == kTypePulseExplosion) ? 1.0 // highAmplitude\n"
    "      : (typeId == kTypeRange) ? 1.0 : (typeId == kTypeClipperLimiter) ? 0.0 : 1.0,",
    "inHigh pulse",
)

p.write_text(text, encoding="utf-8")
print("wrote", p)
