# Wave 8: OMS/Jerobeam + phosphillator audio cores (91–102).
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "native_modules" / "graph_engine" / "graph_engine.cpp"
text = p.read_text(encoding="utf-8")

EXTERN = r"""
extern "C" int soemdsp_jerobeam_spiral_create();
extern "C" void soemdsp_jerobeam_spiral_destroy(int handle);
extern "C" void soemdsp_jerobeam_spiral_sample(
  int handle, double frequency, double density, double size, double sharp,
  double sharpCurve, double sharpCurveMult, double morph, double morphSpeed,
  double position, double positionSpeed, double rotX, double rotXSpeed,
  double rotY, double rotYSpeed, double zAmount, double zDepth, double sampleRate
);
extern "C" double soemdsp_jerobeam_spiral_x(int handle);
extern "C" double soemdsp_jerobeam_spiral_y(int handle);
extern "C" double soemdsp_jerobeam_spiral_z(int handle);

extern "C" int soemdsp_fractal_spiral_create();
extern "C" void soemdsp_fractal_spiral_destroy(int handle);
extern "C" void soemdsp_fractal_spiral_sample(
  int handle, double frequency, double spin, double size, double growth,
  double gain, double lacunarity, double octaves, double twist, double sampleRate
);
extern "C" double soemdsp_fractal_spiral_x(int handle);
extern "C" double soemdsp_fractal_spiral_y(int handle);
extern "C" double soemdsp_fractal_spiral_z(int handle);

extern "C" int soemdsp_log_spiral_create();
extern "C" void soemdsp_log_spiral_destroy(int handle);
extern "C" void soemdsp_log_spiral_sample(
  int handle, double frequency, double spin, double size, double growth,
  double turns, double sampleRate
);
extern "C" double soemdsp_log_spiral_x(int handle);
extern "C" double soemdsp_log_spiral_y(int handle);
extern "C" double soemdsp_log_spiral_z(int handle);

extern "C" int soemdsp_jbblubb_create();
extern "C" void soemdsp_jbblubb_destroy(int handle);
extern "C" void soemdsp_jbblubb_reset(int handle);
extern "C" void soemdsp_jbblubb_sample(
  int handle, double frequency, double shape, double rotX, double rotY,
  double zDepth, double sampleRate
);
extern "C" double soemdsp_jbblubb_x(int handle);
extern "C" double soemdsp_jbblubb_y(int handle);

extern "C" int soemdsp_jbboing_create();
extern "C" void soemdsp_jbboing_destroy(int handle);
extern "C" void soemdsp_jbboing_reset(int handle);
extern "C" void soemdsp_jbboing_sample(
  int handle, double frequency, double density, double sharpness, double rotX,
  double rotY, double zDepth, double zAmount, double ends, double boing,
  double boingStrength, double dir, double shape, double volume,
  double volumePreJump, double sampleRate
);
extern "C" double soemdsp_jbboing_x(int handle);
extern "C" double soemdsp_jbboing_y(int handle);

extern "C" int soemdsp_jbkepler_create();
extern "C" void soemdsp_jbkepler_destroy(int handle);
extern "C" void soemdsp_jbkepler_reset(int handle);
extern "C" void soemdsp_jbkepler_sample(
  int handle, double frequency, double start, double length, double circles,
  double zoom, double rotation, double tri, double sampleRate
);
extern "C" double soemdsp_jbkepler_x(int handle);
extern "C" double soemdsp_jbkepler_y(int handle);

extern "C" int soemdsp_jbmushroom_create();
extern "C" void soemdsp_jbmushroom_destroy(int handle);
extern "C" void soemdsp_jbmushroom_reset(int handle);
extern "C" void soemdsp_jbmushroom_sample(
  int handle, double frequency, double phaseOffset, double numMushrooms,
  double grow, double density, double capRotation, double stemRotationSpeed,
  double head, double spread, double wobble, double clusterRotation,
  double clusterRotationSpeed, double sharp, double width, double stem,
  double apart, double capStemTransition, double sampleRate
);
extern "C" double soemdsp_jbmushroom_x(int handle);
extern "C" double soemdsp_jbmushroom_y(int handle);

extern "C" int soemdsp_jbnyquist_create();
extern "C" void soemdsp_jbnyquist_destroy(int handle);
extern "C" void soemdsp_jbnyquist_reset(int handle);
extern "C" void soemdsp_jbnyquist_sample(
  int handle, double frequencyA, double midiNoteRaw, double rate, double sampleDots,
  double phaseOffset, double frequencyB, double subPhase, double subPhaseRotationSpeed,
  double tone, double toneSmoothTime, double artifact, double enableToneModPitch,
  double enableToneModFreq, double enableToneModNote, double sampleRate
);
extern "C" double soemdsp_jbnyquist_x(int handle);
extern "C" double soemdsp_jbnyquist_y(int handle);

extern "C" int soemdsp_jbradar_create();
extern "C" void soemdsp_jbradar_destroy(int handle);
extern "C" void soemdsp_jbradar_reset(int handle);
extern "C" void soemdsp_jbradar_sample(
  int handle, double frequency, double phaseOffset, double density, double sharp,
  double fade, double rotation, double direction, double shade, double lap,
  double ringcut, double pow1Up, double pow1Down, double pow2Bend, double phaseInv,
  double tunnelInv, double spiralReturn, double length, double ratio, double frontring,
  double zoom, double zDepth, double inner, double x, double y, double sampleRate
);
extern "C" double soemdsp_jbradar_x(int handle);
extern "C" double soemdsp_jbradar_y(int handle);

extern "C" int soemdsp_jbtorus_create();
extern "C" void soemdsp_jbtorus_destroy(int handle);
extern "C" void soemdsp_jbtorus_reset(int handle);
extern "C" void soemdsp_jbtorus_sample(
  int handle, double frequency, double density, double quantizeDensity,
  double subdensity, double quantizeSubDensity, double sharp, double size,
  double length, double balance, double wander, double darkAngle, double darkIntensity,
  double rotX, double rotY, double rotZ, double zAngleX, double zAngleY,
  double zDepth, double sampleRate
);
extern "C" double soemdsp_jbtorus_x(int handle);
extern "C" double soemdsp_jbtorus_y(int handle);

extern "C" int soemdsp_jbwirdo_create();
extern "C" void soemdsp_jbwirdo_destroy(int handle);
extern "C" void soemdsp_jbwirdo_reset(int handle);
extern "C" void soemdsp_jbwirdo_sample(
  int handle, double frequency, double sharp, double cross, double density,
  double length, double rotate, double splashDepth, double splashDensity,
  double cut, double scrap, double ringCut, double splashSpeed, double syncCut,
  double sampleRate
);
extern "C" double soemdsp_jbwirdo_x(int handle);
extern "C" double soemdsp_jbwirdo_y(int handle);

extern "C" int soemdsp_phosphillator_create();
extern "C" void soemdsp_phosphillator_destroy(int handle);
extern "C" int soemdsp_phosphillator_path_x_ptr(int handle);
extern "C" int soemdsp_phosphillator_path_y_ptr(int handle);
extern "C" int soemdsp_phosphillator_set_path(int handle, int count);
extern "C" double soemdsp_phosphillator_sample(
  int handle, double cvInput, double frequency, double phaseOffset, double reset,
  double rate, double sharpness
);
extern "C" double soemdsp_phosphillator_y(int handle);

"""

PROCESS = r"""
static void xy_amp(Node& node, int f, double x, double y, double z = 0.0, bool hasZ = false) {
  const double amp = node.amplitude.out;
  node.buf[kPortMono][f] = x * amp;
  node.buf[kPortLeft][f] = y * amp;
  node.buf[kPortRight][f] = hasZ ? (z * amp) : (y * amp);
}

static bool rising_reset(Circuit& g, Node& node, int frames, bool hasReset, int f, bool& wasHigh) {
  const bool high = hasReset && g.mixReset[f] > 0.0;
  const bool rise = high && !wasHigh;
  wasHigh = high;
  return rise;
}

static void process_jerobeam_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_jerobeam_spiral_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.width.out, node.resonance.out,
      node.mix.out, node.center.out, node.phaseParam.out, 0.0,
      node.offset.out, 0.0, node.inLow.out, 0.0, node.inHigh.out, 0.0,
      node.feedback.out, node.level.out, sr
    );
    xy_amp(node, f,
      soemdsp_jerobeam_spiral_x(node.nativeHandle),
      soemdsp_jerobeam_spiral_y(node.nativeHandle),
      soemdsp_jerobeam_spiral_z(node.nativeHandle), true);
  }
}

static void process_fractal_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_fractal_spiral_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.width.out, node.shape.out,
      node.resonance.out, node.center.out, node.stages.out, node.mix.out, sr
    );
    xy_amp(node, f,
      soemdsp_fractal_spiral_x(node.nativeHandle),
      soemdsp_fractal_spiral_y(node.nativeHandle),
      soemdsp_fractal_spiral_z(node.nativeHandle), true);
  }
}

static void process_log_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_log_spiral_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.width.out, node.shape.out,
      node.stages.out, sr
    );
    xy_amp(node, f,
      soemdsp_log_spiral_x(node.nativeHandle),
      soemdsp_log_spiral_y(node.nativeHandle),
      soemdsp_log_spiral_z(node.nativeHandle), true);
  }
}

static void process_blubb(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbblubb_reset(node.nativeHandle);
    }
    soemdsp_jbblubb_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.inLow.out, node.inHigh.out,
      node.level.out, sr
    );
    xy_amp(node, f, soemdsp_jbblubb_x(node.nativeHandle), soemdsp_jbblubb_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_boing(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbboing_reset(node.nativeHandle);
    }
    soemdsp_jbboing_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.resonance.out,
      node.inLow.out, node.inHigh.out, node.level.out, node.feedback.out,
      node.mix.out, node.center.out, node.width.out, node.mode.out,
      node.phaseParam.out, node.offset.out, node.stages.out, sr
    );
    xy_amp(node, f, soemdsp_jbboing_x(node.nativeHandle), soemdsp_jbboing_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_kepler_bouwkamp(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbkepler_reset(node.nativeHandle);
    }
    soemdsp_jbkepler_sample(
      node.nativeHandle,
      node.frequency.out, node.center.out, node.stages.out, node.shape.out,
      node.mix.out, node.phaseParam.out, node.resonance.out, sr
    );
    xy_amp(node, f, soemdsp_jbkepler_x(node.nativeHandle), soemdsp_jbkepler_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_mushroom(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbmushroom_reset(node.nativeHandle);
    }
    // Face defaults for lesser-used visual knobs when not chased separately.
    soemdsp_jbmushroom_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.stages.out, node.mix.out,
      node.shape.out, node.inLow.out, node.lfoRate.out, node.center.out,
      node.width.out, node.resonance.out, node.inHigh.out, node.offsetMs.out,
      node.feedback.out, node.level.out, node.mode.out, node.oversample.out,
      node.recycle.out, sr
    );
    xy_amp(node, f, soemdsp_jbmushroom_x(node.nativeHandle), soemdsp_jbmushroom_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_nyquist_shannon(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbnyquist_reset(node.nativeHandle);
    }
    soemdsp_jbnyquist_sample(
      node.nativeHandle,
      node.frequency.out, node.seed.out, node.center.out, node.mix.out,
      node.phaseParam.out, node.width.out, node.inLow.out, node.lfoRate.out,
      node.shape.out, node.timeNumerator.out, node.resonance.out,
      node.mode.out, node.stages.out, node.oversample.out, sr
    );
    xy_amp(node, f, soemdsp_jbnyquist_x(node.nativeHandle), soemdsp_jbnyquist_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_radar(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbradar_reset(node.nativeHandle);
    }
    // Discrete visual flags default off (0); core shape/audio Controls mapped.
    soemdsp_jbradar_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.shape.out, node.resonance.out,
      node.center.out, node.mix.out, node.mode.out, node.width.out, node.level.out,
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      node.stages.out, node.feedback.out, node.offset.out, node.diffusionSize.out,
      node.inHigh.out, node.inLow.out, node.outLow.out, node.outHigh.out, sr
    );
    xy_amp(node, f, soemdsp_jbradar_x(node.nativeHandle), soemdsp_jbradar_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_torus(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbtorus_reset(node.nativeHandle);
    }
    soemdsp_jbtorus_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.mode.out, node.center.out,
      node.stages.out, node.resonance.out, node.width.out, node.mix.out,
      node.phaseParam.out, node.level.out, node.offset.out, node.seed.out,
      node.inLow.out, node.inHigh.out, node.outLow.out, node.outHigh.out,
      node.feedback.out, node.diffusionSize.out, sr
    );
    xy_amp(node, f, soemdsp_jbtorus_x(node.nativeHandle), soemdsp_jbtorus_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_wirdo_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbwirdo_reset(node.nativeHandle);
    }
    soemdsp_jbwirdo_sample(
      node.nativeHandle,
      node.frequency.out, node.resonance.out, node.mix.out, node.shape.out,
      node.width.out, node.phaseParam.out, node.center.out, node.level.out,
      node.stages.out, node.feedback.out, node.offset.out, node.lfoRate.out,
      node.mode.out, sr
    );
    xy_amp(node, f, soemdsp_jbwirdo_x(node.nativeHandle), soemdsp_jbwirdo_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void phosphillator_ensure_circle(int handle) {
  float* px = (float*)(void*)(long long)soemdsp_phosphillator_path_x_ptr(handle);
  float* py = (float*)(void*)(long long)soemdsp_phosphillator_path_y_ptr(handle);
  if (!px || !py) return;
  const int n = 64;
  for (int i = 0; i < n; i++) {
    const double t = (double)i / (double)(n - 1);
    double s = 0.0, c = 0.0;
    dsp_sin_cos_turns(t, &s, &c);
    px[i] = (float)c;
    py[i] = (float)s;
  }
  soemdsp_phosphillator_set_path(handle, n);
}

static void process_phosphillator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  if (node.lastReset < 0.0) {
    phosphillator_ensure_circle(node.nativeHandle);
    node.lastReset = 0.0;
  }
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double x = soemdsp_phosphillator_sample(
      node.nativeHandle,
      hasPitch ? g.mixPitch[f] : 0.0,
      node.frequency.out,
      node.phaseParam.out,
      hasReset ? g.mixReset[f] : 0.0,
      sr,
      node.shape.out
    );
    const double y = soemdsp_phosphillator_y(node.nativeHandle);
    xy_amp(node, f, x, y);
  }
}

"""

TYPES = """static const int kTypePulseExplosion = 90;
static const int kTypeSpiral = 91;
static const int kTypeFractalSpiral = 92;
static const int kTypeLogSpiral = 93;
static const int kTypeBlubb = 94;
static const int kTypeBoing = 95;
static const int kTypeKeplerBouwkamp = 96;
static const int kTypeMushroom = 97;
static const int kTypeNyquistShannon = 98;
static const int kTypeRadar = 99;
static const int kTypeTorus = 100;
static const int kTypeWirdoSpiral = 101;
static const int kTypePhosphillator = 102;

static const int kPortMono"""

def must_replace(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"MISSING {label}")
    if text.count(old) != 1:
        raise SystemExit(f"NON-UNIQUE {label}: {text.count(old)}")
    text = text.replace(old, new, 1)
    print("ok", label)

must_replace(
    'extern "C" double soemdsp_pulse_explosion_curve(int handle);\n\n// Param-chase Papoulis',
    'extern "C" double soemdsp_pulse_explosion_curve(int handle);\n'
    + EXTERN
    + "// Param-chase Papoulis",
    "externs",
)

must_replace(
    "static const int kTypePulseExplosion = 90;\n\nstatic const int kPortMono",
    TYPES,
    "type ids",
)

DESTROY = """  } else if (kind == kTypePulseExplosion) {
    soemdsp_pulse_explosion_destroy(n.nativeHandle);
  } else if (kind == kTypeSpiral) {
    soemdsp_jerobeam_spiral_destroy(n.nativeHandle);
  } else if (kind == kTypeFractalSpiral) {
    soemdsp_fractal_spiral_destroy(n.nativeHandle);
  } else if (kind == kTypeLogSpiral) {
    soemdsp_log_spiral_destroy(n.nativeHandle);
  } else if (kind == kTypeBlubb) {
    soemdsp_jbblubb_destroy(n.nativeHandle);
  } else if (kind == kTypeBoing) {
    soemdsp_jbboing_destroy(n.nativeHandle);
  } else if (kind == kTypeKeplerBouwkamp) {
    soemdsp_jbkepler_destroy(n.nativeHandle);
  } else if (kind == kTypeMushroom) {
    soemdsp_jbmushroom_destroy(n.nativeHandle);
  } else if (kind == kTypeNyquistShannon) {
    soemdsp_jbnyquist_destroy(n.nativeHandle);
  } else if (kind == kTypeRadar) {
    soemdsp_jbradar_destroy(n.nativeHandle);
  } else if (kind == kTypeTorus) {
    soemdsp_jbtorus_destroy(n.nativeHandle);
  } else if (kind == kTypeWirdoSpiral) {
    soemdsp_jbwirdo_destroy(n.nativeHandle);
  } else if (kind == kTypePhosphillator) {
    soemdsp_phosphillator_destroy(n.nativeHandle);
  }
  n.nativeHandle = 0;"""

must_replace(
    "  } else if (kind == kTypePulseExplosion) {\n"
    "    soemdsp_pulse_explosion_destroy(n.nativeHandle);\n"
    "  }\n"
    "  n.nativeHandle = 0;",
    DESTROY,
    "destroy",
)

# frequency defaults for OMS cores
must_replace(
    "      : (typeId == kTypeFractalBrownianNoise) ? 0.5\n"
    "      : (typeId == kTypeRandomWalk) ? 2.0\n"
    "      : 220.0,",
    "      : (typeId == kTypeFractalBrownianNoise) ? 0.5\n"
    "      : (typeId == kTypeRandomWalk) ? 2.0\n"
    "      : (typeId == kTypeSpiral || typeId == kTypeNyquistShannon) ? 440.0\n"
    "      : (typeId == kTypeFractalSpiral || typeId == kTypeLogSpiral\n"
    "          || typeId == kTypeRadar) ? 1.0\n"
    "      : (typeId == kTypePhosphillator) ? 2.0\n"
    "      : (typeId == kTypeBlubb || typeId == kTypeBoing || typeId == kTypeKeplerBouwkamp\n"
    "          || typeId == kTypeMushroom || typeId == kTypeTorus\n"
    "          || typeId == kTypeWirdoSpiral) ? 8.0\n"
    "      : 220.0,",
    "freq defaults",
)

must_replace(
    "  if (typeId == kTypePulseExplosion) return soemdsp_pulse_explosion_create();\n"
    "  return 0;\n"
    "}",
    "  if (typeId == kTypePulseExplosion) return soemdsp_pulse_explosion_create();\n"
    "  if (typeId == kTypeSpiral) return soemdsp_jerobeam_spiral_create();\n"
    "  if (typeId == kTypeFractalSpiral) return soemdsp_fractal_spiral_create();\n"
    "  if (typeId == kTypeLogSpiral) return soemdsp_log_spiral_create();\n"
    "  if (typeId == kTypeBlubb) return soemdsp_jbblubb_create();\n"
    "  if (typeId == kTypeBoing) return soemdsp_jbboing_create();\n"
    "  if (typeId == kTypeKeplerBouwkamp) return soemdsp_jbkepler_create();\n"
    "  if (typeId == kTypeMushroom) return soemdsp_jbmushroom_create();\n"
    "  if (typeId == kTypeNyquistShannon) return soemdsp_jbnyquist_create();\n"
    "  if (typeId == kTypeRadar) return soemdsp_jbradar_create();\n"
    "  if (typeId == kTypeTorus) return soemdsp_jbtorus_create();\n"
    "  if (typeId == kTypeWirdoSpiral) return soemdsp_jbwirdo_create();\n"
    "  if (typeId == kTypePhosphillator) {\n"
    "    const int h = soemdsp_phosphillator_create();\n"
    "    return h;\n"
    "  }\n"
    "  return 0;\n"
    "}",
    "create",
)

must_replace(
    "    || typeId == kTypePulseExplosion;\n"
    "  // additiveOsc / ellipsoid are free-fn (no native handle).",
    "    || typeId == kTypePulseExplosion\n"
    "    || typeId == kTypeSpiral\n"
    "    || typeId == kTypeFractalSpiral\n"
    "    || typeId == kTypeLogSpiral\n"
    "    || typeId == kTypeBlubb\n"
    "    || typeId == kTypeBoing\n"
    "    || typeId == kTypeKeplerBouwkamp\n"
    "    || typeId == kTypeMushroom\n"
    "    || typeId == kTypeNyquistShannon\n"
    "    || typeId == kTypeRadar\n"
    "    || typeId == kTypeTorus\n"
    "    || typeId == kTypeWirdoSpiral\n"
    "    || typeId == kTypePhosphillator;\n"
    "  // additiveOsc / ellipsoid are free-fn (no native handle).",
    "needsNative",
)

# After add_node creates phosphillator, mark lastReset=-1 to seed circle once.
must_replace(
    "    } else if (typeId == kTypeHypersaw) {\n"
    "      soemdsp_hypersaw_reset(n.nativeHandle);\n"
    "    }\n"
    "  }",
    "    } else if (typeId == kTypeHypersaw) {\n"
    "      soemdsp_hypersaw_reset(n.nativeHandle);\n"
    "    } else if (typeId == kTypePhosphillator) {\n"
    "      n.lastReset = -1.0; // seed default circle path on first process\n"
    "    }\n"
    "  }",
    "phosphillator seed flag",
)

DISPATCH = """    if (node.typeId == kTypePulseExplosion) {
      process_pulse_explosion(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSpiral) {
      process_jerobeam_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeFractalSpiral) {
      process_fractal_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLogSpiral) {
      process_log_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBlubb) {
      process_blubb(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBoing) {
      process_boing(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeKeplerBouwkamp) {
      process_kepler_bouwkamp(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeMushroom) {
      process_mushroom(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeNyquistShannon) {
      process_nyquist_shannon(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRadar) {
      process_radar(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeTorus) {
      process_torus(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeWirdoSpiral) {
      process_wirdo_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePhosphillator) {
      process_phosphillator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeReverbEffect) {"""

must_replace(
    "    if (node.typeId == kTypePulseExplosion) {\n"
    "      process_pulse_explosion(*g, node, frames);\n"
    "      continue;\n"
    "    }\n"
    "    if (node.typeId == kTypeReverbEffect) {",
    DISPATCH,
    "dispatch",
)

must_replace(
    "  return 50; // + noise/modulators 87–90\n"
    "}",
    "  return 51; // + OMS/Jerobeam + phosphillator 91–102\n"
    "}",
    "version",
)

marker = (
    "    node.buf[kPortRight][f] = out;\n"
    "  }\n"
    "}\n\n"
    "// Master Clock / transport: tempo square."
)
# pulse explosion ends with Right=out then Master Clock
if marker not in text:
    i = text.find("process_pulse_explosion")
    print("pulse at", i)
    # find end of pulse process
    j = text.find("// Master Clock / transport: tempo square.")
    print("master at", j, repr(text[j-80:j]))
    raise SystemExit("process insert marker missing")
text = text.replace(
    marker,
    "    node.buf[kPortRight][f] = out;\n"
    "  }\n"
    "}\n"
    + PROCESS
    + "// Master Clock / transport: tempo square.",
    1,
)
print("ok process fns")

# A few useful defaults for OMS shape/size
must_replace(
    "      : (typeId == kTypeTuringMachine) ? 0.25 // probability\n"
    "      : (typeId == kTypeFractalBrownianNoise) ? 0.5 // persistence\n"
    "      : (typeId == kTypePiSpigotNoise) ? 0.0 // smoothing\n"
    "      : 0.5,",
    "      : (typeId == kTypeTuringMachine) ? 0.25 // probability\n"
    "      : (typeId == kTypeFractalBrownianNoise) ? 0.5 // persistence\n"
    "      : (typeId == kTypePiSpigotNoise) ? 0.0 // smoothing\n"
    "      : (typeId == kTypeSpiral || typeId == kTypeTorus) ? 1.0 // density\n"
    "      : (typeId == kTypeFractalSpiral) ? 1.5 // growth\n"
    "      : (typeId == kTypeLogSpiral) ? 3.0 // growth\n"
    "      : (typeId == kTypeMushroom) ? 3.0 // density\n"
    "      : (typeId == kTypeWirdoSpiral) ? 0.8 // density\n"
    "      : (typeId == kTypeRadar) ? 1.0 // density\n"
    "      : (typeId == kTypeKeplerBouwkamp) ? 0.5 // circles\n"
    "      : (typeId == kTypePhosphillator) ? 0.5 // sharpness\n"
    "      : 0.5,",
    "shape OMS",
)

must_replace(
    "      : (typeId == kTypeRandomWalk) ? 0.25 // jitter\n"
    "      : 2.0,",
    "      : (typeId == kTypeRandomWalk) ? 0.25 // jitter\n"
    "      : (typeId == kTypeSpiral || typeId == kTypeFractalSpiral\n"
    "          || typeId == kTypeLogSpiral) ? 0.5 // size\n"
    "      : (typeId == kTypeTorus || typeId == kTypeMushroom) ? 1.0 // size/width\n"
    "      : (typeId == kTypeWirdoSpiral) ? 1.0 // length\n"
    "      : 2.0,",
    "width OMS",
)

must_replace(
    "      : (typeId == kTypePulseExplosion) ? 20.0 // numberOfPulses\n"
    "      : (typeId == kTypeTransport) ? 0.0",
    "      : (typeId == kTypePulseExplosion) ? 20.0 // numberOfPulses\n"
    "      : (typeId == kTypeFractalSpiral) ? 5.0 // octaves\n"
    "      : (typeId == kTypeLogSpiral) ? 4.0 // turns\n"
    "      : (typeId == kTypeMushroom || typeId == kTypeKeplerBouwkamp\n"
    "          || typeId == kTypeRadar || typeId == kTypeWirdoSpiral) ? 1.0\n"
    "      : (typeId == kTypeTransport) ? 0.0",
    "stages OMS",
)

p.write_text(text, encoding="utf-8")
print("wrote", p)
