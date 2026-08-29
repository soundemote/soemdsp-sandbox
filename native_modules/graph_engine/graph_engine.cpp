// soemdsp-native-module: graph_engine
// soemdsp-native-label: Graph Engine
// soemdsp-native-target: graphEngine
// soemdsp-native-kind: engine
//
// MVEP GraphEngine: orchestrates
// polyBlep → ladderFilter → softClipper → reverbEffect → pingPongDelay → output
// inside soemdsp_graph_process_block. Live ƒ jacks mix from wired buffers;
// Control knobs: set_param writes targets; native SmootherManager chases out.
// Scope taps via node_port_ptr. DSP lives in existing natives; this is glue.

#include "../sandbox_native_maths/exp_log.h"
#include "../sandbox_native_maths/analog_filter_trig.h"
#include "../sandbox_native_maths/scalar_helpers.h"

// Combined wasm resolves these; standalone graph_engine.wasm links with
// --allow-undefined (stubs unused — product loads soemdsp_combined.wasm).
extern "C" int soemdsp_polyblep_create();
extern "C" void soemdsp_polyblep_destroy(int handle);
extern "C" void soemdsp_polyblep_reset(int handle);
extern "C" void soemdsp_polyblep_process_block(
  int handle, int frameCount, double phase0, double phaseIncrement,
  int waveform, double level, double morph, int tapMask
);
extern "C" void soemdsp_polyblep_sample_masked(
  int handle, double phase, double phaseIncrement,
  int waveform, double level, double morph, int tapMask
);
extern "C" int soemdsp_polyblep_block_out_ptr(int handle, int tapIndex);
extern "C" double soemdsp_polyblep_out(int handle);
extern "C" double soemdsp_polyblep_saw(int handle);
extern "C" double soemdsp_polyblep_ramp(int handle);
extern "C" double soemdsp_polyblep_square(int handle);
extern "C" double soemdsp_polyblep_tri(int handle);
extern "C" double soemdsp_polyblep_sine(int handle);

extern "C" int soemdsp_ladder_filter_create();
extern "C" void soemdsp_ladder_filter_destroy(int handle);
extern "C" void soemdsp_ladder_filter_set_params(
  int handle, double frequency, double resonance, int mode, int stages, double sampleRate
);
extern "C" double soemdsp_ladder_filter_sample(
  int handle, double input, double frequency, double resonance,
  int mode, int stages, double sampleRate
);
extern "C" void soemdsp_ladder_filter_process_block(int handle, int frameCount);
extern "C" int soemdsp_ladder_filter_block_input_ptr(int handle);
extern "C" int soemdsp_ladder_filter_block_output_ptr(int handle);

extern "C" int soemdsp_soft_clipper_create();
extern "C" void soemdsp_soft_clipper_destroy(int handle);
extern "C" void soemdsp_soft_clipper_set_params(
  int handle, double center, double width, double antialias, int oversampleMode
);
extern "C" void soemdsp_soft_clipper_process_block(int handle, int channel, int frameCount);
extern "C" int soemdsp_soft_clipper_block_input_ptr(int handle, int channel);
extern "C" int soemdsp_soft_clipper_block_output_ptr(int handle, int channel);

extern "C" int soemdsp_sabrina_reverb_create(double sampleRate);
extern "C" void soemdsp_sabrina_reverb_destroy(int handle);
extern "C" void soemdsp_sabrina_reverb_reset(int handle, double sampleRate);
extern "C" void soemdsp_sabrina_reverb_set_params(
  int handle,
  double mix, double diffusionSize, double diffusionAmount, double delaySize,
  double recycle, double lfoAmplitude, double lfoBaseSpeed, double lfoVariation,
  double seed
);
extern "C" void soemdsp_sabrina_reverb_process_block(int handle, int frameCount, int useSimd);
extern "C" int soemdsp_sabrina_reverb_block_input_left_ptr(int handle);
extern "C" int soemdsp_sabrina_reverb_block_input_right_ptr(int handle);
extern "C" int soemdsp_sabrina_reverb_block_output_left_ptr(int handle);
extern "C" int soemdsp_sabrina_reverb_block_output_right_ptr(int handle);

extern "C" int soemdsp_ping_pong_delay_create();
extern "C" void soemdsp_ping_pong_delay_destroy(int handle);
extern "C" void soemdsp_ping_pong_delay_reset(int handle);
extern "C" void soemdsp_ping_pong_delay_set_params(
  int handle,
  double feedback, double mix, double level,
  double timeNumerator, double timeDenominator, double timingMode,
  double offsetMs, double lfoStyle, double lfoRate, double lfoVariation,
  double saturate, double lpfFrequency, double hpfFrequency,
  double tempoBpm, double sampleRate
);
extern "C" void soemdsp_ping_pong_delay_process_block(int handle, int frameCount);
extern "C" int soemdsp_ping_pong_delay_block_input_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_left_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_right_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_mod_left_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_mod_right_ptr(int handle);

namespace {

using soemdsp_maths::dsp_exp;
using soemdsp_maths::dsp_cos;
using soemdsp_maths::dsp_floor;
using soemdsp_maths::dsp_fabs;
using soemdsp_maths::kPlanck;

static const int kMaxInstances = 4;
static const int kMaxNodes = 64;
static const int kMaxConnections = 256;
static const int kMaxToSmooth = 256;
// Hard product invariant: AudioWorklet quantum and all orchestrated natives
// use 128. Host must chunk if frames ever exceed this (see processNativeGraphQuantum).
static const int kMaxBlockFrames = 128;
// Default Control chase (~JS nodeGraphModuleSmoothingDefaultSeconds).
static const double kDefaultSmoothSeconds = 0.0333;
// 0=Mono/Out, 1=Left/Mix L, 2=Right/Mix R, 3=Saw/Dry L, 4=Ramp/Dry R,
// 5=Square, 6=Tri, 7=Sine (polyBlep taps; Dry L/R share 3/4 on reverb).
static const int kChannels = 8;

static const int kTypeUnknown = 0;
static const int kTypePolyBlep = 1;
static const int kTypeLadderFilter = 2;
static const int kTypeSoftClipper = 3;
static const int kTypeReverbEffect = 4;
static const int kTypePingPongDelay = 5;
static const int kTypeOutput = 6;

static const int kPortMono = 0;
static const int kPortLeft = 1;
static const int kPortRight = 2;
static const int kPortSaw = 3;
static const int kPortRamp = 4;
static const int kPortSquare = 5;
static const int kPortTri = 6;
static const int kPortSine = 7;
static const int kPortDryL = 3; // reverb Dry L (shares Saw index)
static const int kPortDryR = 4; // reverb Dry R (shares Ramp index)
// Live SIGNAL IN ports — not audio output channels (not stored in Node.buf).
static const int kPortF = 16;          // absolute Hz (ƒ)
static const int kPortPitchCv = 17;    // 0.1V/Oct
static const int kPortIncrement = 18;  // phase increment add (cycles/sample)
static const int kPortReset = 19;      // reset gate

// Param IDs (keep in sync with JS NATIVE_GRAPH_PARAM_*).
static const int kParamVolumeDb = 0;
static const int kParamPan = 1;
static const int kParamFrequency = 10;   // polyBlep Hz / ladder cutoff
static const int kParamWaveform = 11;    // polyBlep
static const int kParamAmplitude = 12;   // polyBlep level
static const int kParamShape = 13;       // polyBlep morph
static const int kParamPhase = 14;       // polyBlep phase offset (radians fraction→applied as 2π*)
static const int kParamResonance = 20;   // ladder
static const int kParamMode = 21;        // ladder
static const int kParamStages = 22;      // ladder
static const int kParamCenter = 30;      // softClipper
static const int kParamWidth = 31;       // softClipper
static const int kParamOversample = 32;  // softClipper
static const int kParamMix = 40;               // reverb / pingPong
static const int kParamDiffusionSize = 41;     // reverb
static const int kParamDiffusionAmount = 42;   // reverb
static const int kParamDelaySize = 43;         // reverb
static const int kParamRecycle = 44;           // reverb
static const int kParamLfoAmplitude = 45;      // reverb
static const int kParamLfoBaseSpeed = 46;      // reverb
static const int kParamLfoVariation = 47;      // reverb / pingPong
static const int kParamSeed = 48;              // reverb
static const int kParamFeedback = 50;          // pingPong
static const int kParamLevel = 51;             // pingPong
static const int kParamTimeNumerator = 52;     // pingPong
static const int kParamTimeDenominator = 53;   // pingPong
static const int kParamTimingMode = 54;        // pingPong
static const int kParamOffsetMs = 55;          // pingPong LFO amp
static const int kParamLfoStyle = 56;          // pingPong
static const int kParamLfoRate = 57;           // pingPong
static const int kParamSaturate = 58;          // pingPong
static const int kParamLpfFrequency = 59;      // pingPong
static const int kParamHpfFrequency = 60;      // pingPong
static const int kParamTempoBpm = 61;          // pingPong

static const int kTapOut = 1;
static const int kTapSaw = 2;
static const int kTapRamp = 4;
static const int kTapSquare = 8;
static const int kTapTri = 16;
static const int kTapSine = 32;

static const double kTwoPi = 6.28318530717958647692;
static const double kPi = 3.14159265358979323846;

static const unsigned char kSmoothModeInternal = 0;
static const unsigned char kSmoothModeGlobal = 1;
static const unsigned char kSmoothModeInternalGlobal = 2;
static const unsigned char kSmoothModeOff = 3;

// Freestanding Control slot: host writes target/time; DSP reads out.
struct Control {
  double target;
  double timeSamples; // internal cell; <=0 → default seconds*sr when resolving
  double out;
  double coeff; // one-pole b0 (cached); dirty recomputes from time/SR/mode
  bool dirty;
  bool active;
  unsigned char mode;
  unsigned char snap; // discrete: out=target immediately, never on toSmooth_
  unsigned char blockStepped; // sample path already advanced this quantum
};

struct Node {
  unsigned int idHash;
  int typeId;
  bool used;
  bool bypassed; // dry/silence passthrough; DSP state kept (no recreate)
  int nativeHandle;
  int nativeKind; // type at create time — destroy keys off this, not typeId
  Control volumeDb;
  Control pan;
  Control frequency;
  Control waveform;
  Control amplitude;
  Control shape;
  Control phaseParam;
  Control resonance;
  Control mode;
  Control stages;
  Control center;
  Control width;
  Control oversample;
  Control mix;
  Control diffusionSize;
  Control diffusionAmount;
  Control delaySize;
  Control recycle;
  Control lfoAmplitude;
  Control lfoBaseSpeed;
  Control lfoVariation;
  Control seed;
  Control feedback;
  Control level;
  Control timeNumerator;
  Control timeDenominator;
  Control timingMode;
  Control offsetMs;
  Control lfoStyle;
  Control lfoRate;
  Control saturate;
  Control lpfFrequency;
  Control hpfFrequency;
  Control tempoBpm;
  double phase; // polyBlep running phase (radians)
  double lastReset; // Live Reset rising-edge latch (persists across blocks)
  double buf[kChannels][kMaxBlockFrames];
};

struct Conn {
  unsigned int srcHash;
  int srcPort;
  unsigned int dstHash;
  int dstPort;
  bool used;
};

struct Circuit {
  bool active;
  bool compiled;
  float sampleRate;
  double globalTimeSamples;
  int nodeCount;
  int connCount;
  int orderCount;
  int toSmoothCount;
  int order[kMaxNodes];
  int outputNodeIndex;
  Control* toSmooth[kMaxToSmooth];
  Node nodes[kMaxNodes];
  Conn conns[kMaxConnections];
  double outL[kMaxBlockFrames];
  double outR[kMaxBlockFrames];
  double mixMono[kMaxBlockFrames];
  double mixLeft[kMaxBlockFrames];
  double mixRight[kMaxBlockFrames];
  double mixF[kMaxBlockFrames];
  double mixPitch[kMaxBlockFrames];
  double mixIncrement[kMaxBlockFrames];
  double mixReset[kMaxBlockFrames];
};

static Circuit gPool[kMaxInstances];

static void zero_buf(double* p, int n) {
  for (int i = 0; i < n; i++) p[i] = 0.0;
}

static double* ptr_from_export(int addr) {
  if (addr == 0) return nullptr;
  return (double*)(unsigned)addr;
}

static void destroy_node_native(Node& n) {
  if (n.nativeHandle <= 0) {
    n.nativeHandle = 0;
    n.nativeKind = 0;
    return;
  }
  // Key destroy off create-time kind so a later typeId retarget cannot leak.
  const int kind = n.nativeKind != 0 ? n.nativeKind : n.typeId;
  if (kind == kTypePolyBlep) {
    soemdsp_polyblep_destroy(n.nativeHandle);
  } else if (kind == kTypeLadderFilter) {
    soemdsp_ladder_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeSoftClipper) {
    soemdsp_soft_clipper_destroy(n.nativeHandle);
  } else if (kind == kTypeReverbEffect) {
    soemdsp_sabrina_reverb_destroy(n.nativeHandle);
  } else if (kind == kTypePingPongDelay) {
    soemdsp_ping_pong_delay_destroy(n.nativeHandle);
  }
  n.nativeHandle = 0;
  n.nativeKind = 0;
}

static void init_control(Control& c, double value, bool snap) {
  c.target = value;
  c.out = value;
  c.timeSamples = 0.0; // resolve → default seconds * sr
  c.coeff = 1.0;
  c.dirty = true;
  c.active = false;
  c.mode = kSmoothModeInternal;
  c.snap = snap ? 1 : 0;
  c.blockStepped = 0;
}

static void init_node_defaults(Node& n, int typeId) {
  n.typeId = typeId;
  n.bypassed = false;
  n.nativeHandle = 0;
  n.nativeKind = 0;
  init_control(n.volumeDb, -3.0, false);
  init_control(n.pan, 0.0, false);
  init_control(n.frequency, (typeId == kTypeLadderFilter) ? 1000.0 : 220.0, false);
  init_control(n.waveform, 0.0, true);
  init_control(n.amplitude, 1.0, false);
  init_control(n.shape, 0.5, false);
  init_control(n.phaseParam, 0.0, false);
  init_control(n.resonance, 0.2, false);
  init_control(n.mode, 1.0, true);
  init_control(n.stages, 4.0, true);
  init_control(n.center, 0.0, false);
  init_control(n.width, 2.0, false);
  init_control(n.oversample, 2.0, true);
  init_control(n.mix, (typeId == kTypePingPongDelay) ? 0.35 : 0.43, false);
  init_control(n.diffusionSize, 0.35, false);
  init_control(n.diffusionAmount, 0.70, false);
  init_control(n.delaySize, 0.02, false);
  init_control(n.recycle, 0.70, false);
  init_control(n.lfoAmplitude, 0.07, false);
  init_control(n.lfoBaseSpeed, 0.83, false);
  init_control(n.lfoVariation, (typeId == kTypePingPongDelay) ? 0.25 : 0.001, false);
  init_control(n.seed, 0.0, true);
  init_control(n.feedback, 0.35, false);
  init_control(n.level, 1.0, false);
  init_control(n.timeNumerator, 1.0, false);
  init_control(n.timeDenominator, 4.0, false);
  init_control(n.timingMode, 0.0, true);
  init_control(n.offsetMs, 0.0, false);
  init_control(n.lfoStyle, 0.0, true);
  init_control(n.lfoRate, 0.35, false);
  init_control(n.saturate, 1.0, false);
  init_control(n.lpfFrequency, 8000.0, false);
  init_control(n.hpfFrequency, 20.0, false);
  init_control(n.tempoBpm, 120.0, false);
  n.phase = 0.0;
  n.lastReset = 0.0;
}

static Control* control_for_param(Node& n, int paramId) {
  if (paramId == kParamVolumeDb) return &n.volumeDb;
  if (paramId == kParamPan) return &n.pan;
  if (paramId == kParamFrequency) return &n.frequency;
  if (paramId == kParamWaveform) return &n.waveform;
  if (paramId == kParamAmplitude) return &n.amplitude;
  if (paramId == kParamShape) return &n.shape;
  if (paramId == kParamPhase) return &n.phaseParam;
  if (paramId == kParamResonance) return &n.resonance;
  if (paramId == kParamMode) return &n.mode;
  if (paramId == kParamStages) return &n.stages;
  if (paramId == kParamCenter) return &n.center;
  if (paramId == kParamWidth) return &n.width;
  if (paramId == kParamOversample) return &n.oversample;
  if (paramId == kParamMix) return &n.mix;
  if (paramId == kParamDiffusionSize) return &n.diffusionSize;
  if (paramId == kParamDiffusionAmount) return &n.diffusionAmount;
  if (paramId == kParamDelaySize) return &n.delaySize;
  if (paramId == kParamRecycle) return &n.recycle;
  if (paramId == kParamLfoAmplitude) return &n.lfoAmplitude;
  if (paramId == kParamLfoBaseSpeed) return &n.lfoBaseSpeed;
  if (paramId == kParamLfoVariation) return &n.lfoVariation;
  if (paramId == kParamSeed) return &n.seed;
  if (paramId == kParamFeedback) return &n.feedback;
  if (paramId == kParamLevel) return &n.level;
  if (paramId == kParamTimeNumerator) return &n.timeNumerator;
  if (paramId == kParamTimeDenominator) return &n.timeDenominator;
  if (paramId == kParamTimingMode) return &n.timingMode;
  if (paramId == kParamOffsetMs) return &n.offsetMs;
  if (paramId == kParamLfoStyle) return &n.lfoStyle;
  if (paramId == kParamLfoRate) return &n.lfoRate;
  if (paramId == kParamSaturate) return &n.saturate;
  if (paramId == kParamLpfFrequency) return &n.lpfFrequency;
  if (paramId == kParamHpfFrequency) return &n.hpfFrequency;
  if (paramId == kParamTempoBpm) return &n.tempoBpm;
  return nullptr;
}

static void dirty_node_control_coeffs(Node& n) {
  n.volumeDb.dirty = true;
  n.pan.dirty = true;
  n.frequency.dirty = true;
  n.waveform.dirty = true;
  n.amplitude.dirty = true;
  n.shape.dirty = true;
  n.phaseParam.dirty = true;
  n.resonance.dirty = true;
  n.mode.dirty = true;
  n.stages.dirty = true;
  n.center.dirty = true;
  n.width.dirty = true;
  n.oversample.dirty = true;
  n.mix.dirty = true;
  n.diffusionSize.dirty = true;
  n.diffusionAmount.dirty = true;
  n.delaySize.dirty = true;
  n.recycle.dirty = true;
  n.lfoAmplitude.dirty = true;
  n.lfoBaseSpeed.dirty = true;
  n.lfoVariation.dirty = true;
  n.seed.dirty = true;
  n.feedback.dirty = true;
  n.level.dirty = true;
  n.timeNumerator.dirty = true;
  n.timeDenominator.dirty = true;
  n.timingMode.dirty = true;
  n.offsetMs.dirty = true;
  n.lfoStyle.dirty = true;
  n.lfoRate.dirty = true;
  n.saturate.dirty = true;
  n.lpfFrequency.dirty = true;
  n.hpfFrequency.dirty = true;
  n.tempoBpm.dirty = true;
}

static void dirty_all_control_coeffs(Circuit& g) {
  for (int i = 0; i < g.nodeCount; i++) {
    if (g.nodes[i].used) dirty_node_control_coeffs(g.nodes[i]);
  }
}

static double resolve_control_time_samples(const Control& c, const Circuit& g) {
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double defSamples = kDefaultSmoothSeconds * sr;
  const double internal = c.timeSamples > 0.0 ? c.timeSamples : defSamples;
  const double global = g.globalTimeSamples > 0.0 ? g.globalTimeSamples : defSamples;
  if (c.mode == kSmoothModeOff) return 0.0;
  if (c.mode == kSmoothModeGlobal) return global;
  if (c.mode == kSmoothModeInternalGlobal) return internal + global;
  // internal (default)
  return internal;
}

static void control_ensure_coeff(Control& c, Circuit& g) {
  if (!c.dirty) return;
  c.dirty = false;
  if (c.snap) {
    c.coeff = 1.0;
    return;
  }
  const double t = resolve_control_time_samples(c, g);
  if (!(t > 0.0)) {
    c.coeff = 1.0;
    return;
  }
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  // Match JS onePole: frequencyHz = 1/seconds = sr/tSamples; w = min(2π/sr, k)*f
  const double frequencyValue = sr / t;
  double wUnit = kTwoPi / sr;
  if (wUnit > 0.000142475857) wUnit = 0.000142475857;
  const double w = wUnit * frequencyValue;
  const double a1 = dsp_exp(-w);
  c.coeff = 1.0 - a1;
  if (!(c.coeff == c.coeff) || c.coeff < 0.0) c.coeff = 1.0;
  if (c.coeff > 1.0) c.coeff = 1.0;
}

static void smoother_add(Circuit& g, Control& c) {
  if (c.snap || c.active) return;
  if (g.toSmoothCount >= kMaxToSmooth) return;
  c.active = true;
  g.toSmooth[g.toSmoothCount++] = &c;
}

static void control_set_target(Circuit& g, Control& c, double value) {
  c.target = value;
  if (c.snap) {
    c.out = value;
    return;
  }
  control_ensure_coeff(c, g);
  if (c.coeff >= 1.0 - 1e-15 || resolve_control_time_samples(c, g) <= 0.0) {
    c.out = value;
    return;
  }
  if (dsp_fabs(c.out - c.target) <= kPlanck) {
    c.out = value;
    return;
  }
  smoother_add(g, c);
}

static void control_set_time(Circuit& g, Control& c, double timeSamples) {
  if (!(timeSamples == timeSamples) || timeSamples < 0.0) timeSamples = 0.0;
  c.timeSamples = timeSamples;
  c.dirty = true;
  if (c.snap) return;
  if (dsp_fabs(c.out - c.target) > kPlanck) smoother_add(g, c);
}

static void control_step(Control& c, Circuit& g) {
  control_ensure_coeff(c, g);
  if (c.snap || c.coeff >= 1.0 - 1e-15) {
    c.out = c.target;
    return;
  }
  // out += coeff * (target - out)
  c.out += c.coeff * (c.target - c.out);
}

static void smoother_run(Circuit& g, int n) {
  if (g.toSmoothCount <= 0 || n < 1) return;
  for (int f = 0; f < n; f++) {
    for (int i = 0; i < g.toSmoothCount; i++) {
      Control* c = g.toSmooth[i];
      // Skip Controls already advanced sample-accurately this quantum.
      if (c && !c->blockStepped) control_step(*c, g);
    }
  }
}

// One sample of a node's continuous Controls (sample-accurate osc/filter path).
static void smoother_step_node(Circuit& g, Node& node) {
  Control* slots[] = {
    &node.volumeDb, &node.pan, &node.frequency, &node.amplitude, &node.shape,
    &node.phaseParam, &node.resonance, &node.center, &node.width, &node.mix,
    &node.diffusionSize, &node.diffusionAmount, &node.delaySize, &node.recycle,
    &node.lfoAmplitude, &node.lfoBaseSpeed, &node.lfoVariation, &node.feedback,
    &node.level, &node.timeNumerator, &node.timeDenominator, &node.offsetMs,
    &node.lfoRate, &node.saturate, &node.lpfFrequency, &node.hpfFrequency,
    &node.tempoBpm
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

static void smoother_clean(Circuit& g) {
  int w = 0;
  for (int i = 0; i < g.toSmoothCount; i++) {
    Control* c = g.toSmooth[i];
    if (!c) continue;
    c->blockStepped = 0;
    if (dsp_fabs(c->out - c->target) <= kPlanck) {
      c->out = c->target;
      c->active = false;
      continue;
    }
    g.toSmooth[w++] = c;
  }
  g.toSmoothCount = w;
}

// Reduce radians to (-π, π] with one floor — no open while spin.
static double wrap_phase_pi(double x) {
  if (!(x * 0.0 == 0.0)) return 0.0;
  return x - kTwoPi * dsp_floor(x / kTwoPi + 0.5);
}

static int create_native_for_type(int typeId, float sampleRate) {
  if (typeId == kTypePolyBlep) return soemdsp_polyblep_create();
  if (typeId == kTypeLadderFilter) return soemdsp_ladder_filter_create();
  if (typeId == kTypeSoftClipper) return soemdsp_soft_clipper_create();
  if (typeId == kTypeReverbEffect) {
    const double sr = sampleRate < 1.0f ? 44100.0 : (double)sampleRate;
    return soemdsp_sabrina_reverb_create(sr);
  }
  if (typeId == kTypePingPongDelay) return soemdsp_ping_pong_delay_create();
  return 0;
}

static void clear_graph_contents(Circuit& g) {
  g.compiled = false;
  for (int i = 0; i < g.nodeCount; i++) {
    if (g.nodes[i].used) destroy_node_native(g.nodes[i]);
  }
  g.nodeCount = 0;
  g.connCount = 0;
  g.orderCount = 0;
  g.toSmoothCount = 0;
  g.outputNodeIndex = -1;
  for (int i = 0; i < kMaxNodes; i++) {
    g.nodes[i].used = false;
    g.nodes[i].idHash = 0;
    init_node_defaults(g.nodes[i], kTypeUnknown);
    g.order[i] = -1;
  }
  for (int i = 0; i < kMaxConnections; i++) {
    g.conns[i].used = false;
  }
  zero_buf(g.outL, kMaxBlockFrames);
  zero_buf(g.outR, kMaxBlockFrames);
}

static Circuit* get(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  Circuit& g = gPool[handle - 1];
  return g.active ? &g : nullptr;
}

static int find_node(Circuit& g, unsigned int idHash) {
  for (int i = 0; i < g.nodeCount; i++) {
    if (g.nodes[i].used && g.nodes[i].idHash == idHash) return i;
  }
  return -1;
}

static bool is_live_dst_port(int port) {
  return port == kPortF
    || port == kPortPitchCv
    || port == kPortIncrement
    || port == kPortReset;
}

static int clamp_src_port(int port) {
  if (port < 0) return kPortMono;
  if (port >= kChannels) return kPortMono;
  return port;
}

// Destination may be audio bus (0..7) or Live SIGNAL IN (16+).
static int clamp_dst_port(int port) {
  if (port < 0) return kPortMono;
  if (port < kChannels) return port;
  if (is_live_dst_port(port)) return port;
  return kPortMono;
}

static float db_to_lin(float db) {
  if (!(db == db) || db <= -140.0f) return 0.0f;
  return (float)dsp_exp((double)db * 0.11512925464970229); // ln(10)/20
}

static void pan_gains(float pan, float* left, float* right) {
  float p = pan;
  if (!(p == p)) p = 0.0f;
  if (p < -1.0f) p = -1.0f;
  if (p > 1.0f) p = 1.0f;
  const double halfPi = 1.5707963267948966;
  if (p <= 0.0f) {
    *left = 1.0f;
    *right = (float)dsp_cos((double)(-p) * halfPi);
  } else {
    *left = (float)dsp_cos((double)p * halfPi);
    *right = 1.0f;
  }
}

static void mix_node_inputs(Circuit& g, const Node& node, int frames) {
  zero_buf(g.mixMono, frames);
  zero_buf(g.mixLeft, frames);
  zero_buf(g.mixRight, frames);
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.dstHash != node.idHash) continue;
    const int dp = clamp_dst_port(c.dstPort);
    if (is_live_dst_port(dp)) continue; // Live ƒ / CV — not audio bus
    const int si = find_node(g, c.srcHash);
    if (si < 0) continue;
    Node& src = g.nodes[si];
    const int sp = clamp_src_port(c.srcPort);
    double* dstAcc = g.mixMono;
    if (dp == kPortLeft) dstAcc = g.mixLeft;
    else if (dp == kPortRight) dstAcc = g.mixRight;
    for (int f = 0; f < frames; f++) {
      dstAcc[f] += src.buf[sp][f];
    }
  }
}

// Mix Live destination port into dest[]; returns true if any cable present.
static bool mix_live_port(Circuit& g, const Node& node, int livePort, int frames, double* dest) {
  zero_buf(dest, frames);
  bool any = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.dstHash != node.idHash) continue;
    if (clamp_dst_port(c.dstPort) != livePort) continue;
    const int si = find_node(g, c.srcHash);
    if (si < 0) continue;
    Node& src = g.nodes[si];
    const int sp = clamp_src_port(c.srcPort);
    for (int f = 0; f < frames; f++) {
      dest[f] += src.buf[sp][f];
    }
    any = true;
  }
  return any;
}

static int polyblep_tap_mask(Circuit& g, const Node& node) {
  int mask = 0;
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.srcHash != node.idHash) continue;
    const int sp = clamp_src_port(c.srcPort);
    if (sp == kPortMono || sp == kPortLeft || sp == kPortRight) mask |= kTapOut;
    else if (sp == kPortSaw) mask |= kTapSaw;
    else if (sp == kPortRamp) mask |= kTapRamp;
    else if (sp == kPortSquare) mask |= kTapSquare;
    else if (sp == kPortTri) mask |= kTapTri;
    else if (sp == kPortSine) mask |= kTapSine;
  }
  return mask == 0 ? kTapOut : mask;
}

static double clamp_hz_nyquist(double freq, double sr) {
  if (!(freq == freq)) return 0.0;
  const double nyquist = 0.5 * sr;
  if (freq > nyquist) return nyquist;
  if (freq < -nyquist) return -nyquist;
  return freq;
}

static double pitched_hz(double baseHz, double pitchCv, double referenceVoltage) {
  // Same scale as JS nodeGraphPitchedFrequency: +0.1 CV → +1 octave.
  const double out = baseHz * dsp_exp(((pitchCv - referenceVoltage) / 0.1) * 0.6931471805599453);
  if (!(out == out)) return 0.0;
  return out;
}

static void copy_tap_to_buf(double* dst, const double* src, int frames) {
  if (!src) {
    zero_buf(dst, frames);
    return;
  }
  for (int i = 0; i < frames; i++) dst[i] = src[i];
}

static void process_polyblep(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const double waveV = node.waveform.out;
  int waveform = (int)(waveV + (waveV >= 0.0 ? 0.5 : -0.5));
  if (waveform < 0) waveform = 0;
  if (waveform > 8) waveform = 8;
  double level = node.amplitude.out;
  if (!(level == level)) level = 0.0;
  double morph = node.shape.out;
  if (!(morph == morph)) morph = 0.5;
  const double phaseParam = node.phaseParam.out;
  const int mask = polyblep_tap_mask(g, node);

  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  const bool audioRatePitch = liveF || livePitch || liveInc || liveReset || controlSmoothing;

  // Midi note 48 → 0.4 reference voltage (matches worklet default).
  const double referenceVoltage = 48.0 / 120.0;

  if (!audioRatePitch) {
    double freq = clamp_hz_nyquist(node.frequency.out, srD);
    double phaseInc = freq / srD;
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;
    const double phase0 = wrap_phase_pi(node.phase + phaseParam * kTwoPi);
    soemdsp_polyblep_process_block(
      node.nativeHandle, frames, phase0, phaseInc, waveform, level, morph, mask
    );
    double* outPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 0));
    double* sawPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 1));
    double* rampPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 2));
    double* sqPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 3));
    double* triPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 4));
    double* sinePtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 5));
    if (mask & kTapOut) {
      copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
      copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
      copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
    }
    if (mask & kTapSaw) copy_tap_to_buf(node.buf[kPortSaw], sawPtr, frames);
    if (mask & kTapRamp) copy_tap_to_buf(node.buf[kPortRamp], rampPtr, frames);
    if (mask & kTapSquare) copy_tap_to_buf(node.buf[kPortSquare], sqPtr, frames);
    if (mask & kTapTri) copy_tap_to_buf(node.buf[kPortTri], triPtr, frames);
    if (mask & kTapSine) copy_tap_to_buf(node.buf[kPortSine], sinePtr, frames);
    node.phase = wrap_phase_pi(node.phase + kTwoPi * phaseInc * (double)frames);
    return;
  }

  // Live ƒ / 0.1V / Inc / Reset: per-sample phaseInc (ƒ is absolute Hz when wired).
  double phase = wrap_phase_pi(node.phase + phaseParam * kTwoPi);
  if (!liveReset) {
    // Cable gone → clear latch so the next connect can rising-edge.
    node.lastReset = 0.0;
  }
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    // Re-read after step so Control ramps are sample-accurate.
    level = node.amplitude.out;
    if (!(level == level)) level = 0.0;
    morph = node.shape.out;
    if (!(morph == morph)) morph = 0.5;
    const double phaseParamNow = node.phaseParam.out;
    const double waveNow = node.waveform.out;
    waveform = (int)(waveNow + (waveNow >= 0.0 ? 0.5 : -0.5));
    if (waveform < 0) waveform = 0;
    if (waveform > 8) waveform = 8;

    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        // Match JS: hard phase jump + clear native integrator / noise state.
        soemdsp_polyblep_reset(node.nativeHandle);
        phase = phaseParamNow * kTwoPi;
        node.phase = 0.0;
      }
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, srD);
    double phaseInc = freq / srD;
    if (liveInc) phaseInc += g.mixIncrement[f];
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;
    soemdsp_polyblep_sample_masked(
      node.nativeHandle, phase, phaseInc, waveform, level, morph, mask
    );
    const double out = soemdsp_polyblep_out(node.nativeHandle);
    if (mask & kTapOut) {
      node.buf[kPortMono][f] = out;
      node.buf[kPortLeft][f] = out;
      node.buf[kPortRight][f] = out;
    }
    if (mask & kTapSaw) node.buf[kPortSaw][f] = soemdsp_polyblep_saw(node.nativeHandle);
    if (mask & kTapRamp) node.buf[kPortRamp][f] = soemdsp_polyblep_ramp(node.nativeHandle);
    if (mask & kTapSquare) node.buf[kPortSquare][f] = soemdsp_polyblep_square(node.nativeHandle);
    if (mask & kTapTri) node.buf[kPortTri][f] = soemdsp_polyblep_tri(node.nativeHandle);
    if (mask & kTapSine) node.buf[kPortSine][f] = soemdsp_polyblep_sine(node.nativeHandle);
    phase = wrap_phase_pi(phase + kTwoPi * phaseInc);
  }
  // Store free-running phase without the Control phase offset (matches block path).
  node.phase = wrap_phase_pi(phase - node.phaseParam.out * kTwoPi);
}

static void process_ladder(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  double reso = node.resonance.out;
  if (!(reso == reso)) reso = 0.0;
  if (reso < 0.0) reso = 0.0;
  if (reso > 0.999) reso = 0.999;
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 3) mode = 3;
  const double stagesV = node.stages.out;
  int stages = (int)(stagesV + (stagesV >= 0.0 ? 0.5 : -0.5));
  if (stages < 1) stages = 1;
  if (stages > 4) stages = 4;

  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing = node.frequency.active || node.resonance.active;

  if (!liveF && !controlSmoothing) {
    double freq = clamp_hz_nyquist(node.frequency.out, srD);
    if (freq < 0.0) freq = 0.0;
    soemdsp_ladder_filter_set_params(node.nativeHandle, freq, reso, mode, stages, srD);
    double* inPtr = ptr_from_export(soemdsp_ladder_filter_block_input_ptr(node.nativeHandle));
    double* outPtr = ptr_from_export(soemdsp_ladder_filter_block_output_ptr(node.nativeHandle));
    if (!inPtr || !outPtr) return;
    for (int f = 0; f < frames; f++) {
      inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    }
    soemdsp_ladder_filter_process_block(node.nativeHandle, frames);
    copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
    copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
    copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
    return;
  }

  // Live ƒ and/or Control chase: per-sample cutoff / resonance.
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    reso = node.resonance.out;
    if (!(reso == reso)) reso = 0.0;
    if (reso < 0.0) reso = 0.0;
    if (reso > 0.999) reso = 0.999;
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, srD);
    if (freq < 0.0) freq = 0.0;
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_ladder_filter_sample(
      node.nativeHandle, in, freq, reso, mode, stages, srD
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

static void process_soft_clipper(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  double center = node.center.out;
  if (!(center == center)) center = 0.0;
  double width = node.width.out;
  if (!(width == width) || width == 0.0) width = 2.0;
  const double osV = node.oversample.out;
  int os = (int)(osV + (osV >= 0.0 ? 0.5 : -0.5));
  if (os < 0) os = 0;
  if (os > 2) os = 2;
  const double aa = os > 0 ? 1.0 : 0.0;
  soemdsp_soft_clipper_set_params(node.nativeHandle, center, width, aa, os);

  bool hasLeftIn = false;
  bool hasRightIn = false;
  bool hasMonoIn = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    if (!g.conns[ci].used || g.conns[ci].dstHash != node.idHash) continue;
    const int dp = clamp_dst_port(g.conns[ci].dstPort);
    if (is_live_dst_port(dp)) continue;
    if (dp == kPortLeft) hasLeftIn = true;
    else if (dp == kPortRight) hasRightIn = true;
    else hasMonoIn = true;
  }
  bool monoOutWired = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    if (!g.conns[ci].used || g.conns[ci].srcHash != node.idHash) continue;
    if (clamp_src_port(g.conns[ci].srcPort) == kPortMono) monoOutWired = true;
  }
  // Canonical chain is mono. Skip ch0 only when purely stereo-sided and Out unused.
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);

  double* out0 = nullptr;
  if (needMono) {
    double* in0 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 0));
    out0 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 0));
    if (!in0 || !out0) return;
    for (int f = 0; f < frames; f++) {
      in0[f] = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) {
        in0[f] += g.mixLeft[f] + g.mixRight[f];
      }
    }
    soemdsp_soft_clipper_process_block(node.nativeHandle, 0, frames);
    copy_tap_to_buf(node.buf[kPortMono], out0, frames);
  }

  if (hasLeftIn) {
    double* in1 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 1));
    double* out1 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 1));
    if (in1 && out1) {
      for (int f = 0; f < frames; f++) in1[f] = g.mixLeft[f] + g.mixMono[f];
      soemdsp_soft_clipper_process_block(node.nativeHandle, 1, frames);
      copy_tap_to_buf(node.buf[kPortLeft], out1, frames);
    }
  } else if (out0) {
    copy_tap_to_buf(node.buf[kPortLeft], out0, frames);
  }

  if (hasRightIn) {
    double* in2 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 2));
    double* out2 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 2));
    if (in2 && out2) {
      for (int f = 0; f < frames; f++) in2[f] = g.mixRight[f] + g.mixMono[f];
      soemdsp_soft_clipper_process_block(node.nativeHandle, 2, frames);
      copy_tap_to_buf(node.buf[kPortRight], out2, frames);
    }
  } else if (out0) {
    copy_tap_to_buf(node.buf[kPortRight], out0, frames);
  }
}

static void process_reverb(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);

  soemdsp_sabrina_reverb_set_params(
    node.nativeHandle,
    node.mix.out,
    node.diffusionSize.out,
    node.diffusionAmount.out,
    node.delaySize.out,
    node.recycle.out,
    node.lfoAmplitude.out,
    node.lfoBaseSpeed.out,
    node.lfoVariation.out,
    node.seed.out
  );

  double* inL = ptr_from_export(soemdsp_sabrina_reverb_block_input_left_ptr(node.nativeHandle));
  double* inR = ptr_from_export(soemdsp_sabrina_reverb_block_input_right_ptr(node.nativeHandle));
  double* outL = ptr_from_export(soemdsp_sabrina_reverb_block_output_left_ptr(node.nativeHandle));
  double* outR = ptr_from_export(soemdsp_sabrina_reverb_block_output_right_ptr(node.nativeHandle));
  if (!inL || !inR || !outL || !outR) return;

  // Mono In folds into both sides; dedicated L/R add on top (JS mixInput).
  for (int f = 0; f < frames; f++) {
    const double mono = g.mixMono[f];
    inL[f] = mono + g.mixLeft[f];
    inR[f] = mono + g.mixRight[f];
  }
  soemdsp_sabrina_reverb_process_block(node.nativeHandle, frames, 1);

  // Mix L/R = dry/wet blend from native block outs; Dry L/R = pre-FX input.
  copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
  copy_tap_to_buf(node.buf[kPortRight], outR, frames);
  for (int f = 0; f < frames; f++) {
    node.buf[kPortDryL][f] = inL[f];
    node.buf[kPortDryR][f] = inR[f];
    node.buf[kPortMono][f] = 0.5 * (outL[f] + outR[f]);
  }
}

static void process_ping_pong(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;

  soemdsp_ping_pong_delay_set_params(
    node.nativeHandle,
    node.feedback.out,
    node.mix.out,
    node.level.out,
    node.timeNumerator.out,
    node.timeDenominator.out,
    node.timingMode.out,
    node.offsetMs.out,
    node.lfoStyle.out,
    node.lfoRate.out,
    node.lfoVariation.out,
    node.saturate.out,
    node.lpfFrequency.out,
    node.hpfFrequency.out,
    node.tempoBpm.out,
    (double)sr
  );

  double* inPtr = ptr_from_export(soemdsp_ping_pong_delay_block_input_ptr(node.nativeHandle));
  double* outL = ptr_from_export(soemdsp_ping_pong_delay_block_output_left_ptr(node.nativeHandle));
  double* outR = ptr_from_export(soemdsp_ping_pong_delay_block_output_right_ptr(node.nativeHandle));
  double* modL = ptr_from_export(soemdsp_ping_pong_delay_block_output_mod_left_ptr(node.nativeHandle));
  double* modR = ptr_from_export(soemdsp_ping_pong_delay_block_output_mod_right_ptr(node.nativeHandle));
  if (!inPtr || !outL || !outR) return;

  // Native ping-pong is mono-in; fold Mono+L+R like the worklet evaluator.
  for (int f = 0; f < frames; f++) {
    inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
  }
  soemdsp_ping_pong_delay_process_block(node.nativeHandle, frames);

  copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
  copy_tap_to_buf(node.buf[kPortRight], outR, frames);
  // Mod L/R = normalized delay tap times (module outputs / stereoTracePorts).
  if (modL) copy_tap_to_buf(node.buf[kPortSaw], modL, frames);
  if (modR) copy_tap_to_buf(node.buf[kPortRamp], modR, frames);
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = 0.5 * (outL[f] + outR[f]);
  }
}

static void process_output(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  float gL = 1.0f, gR = 1.0f;
  pan_gains((float)node.pan.out, &gL, &gR);
  const float vol = db_to_lin((float)node.volumeDb.out);
  for (int f = 0; f < frames; f++) {
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

// Bypass: route dry audio (or silence for sources). Do NOT call native
// process_block / reset — tails and filter state stay warm.
static void process_bypass(Circuit& g, Node& node, int frames) {
  if (node.typeId == kTypePolyBlep) {
    return; // sources: silence
  }
  if (node.typeId == kTypeOutput) {
    process_output(g, node, frames);
    return;
  }
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    const double mono = g.mixMono[f];
    const double left = mono + g.mixLeft[f];
    const double right = mono + g.mixRight[f];
    node.buf[kPortMono][f] = mono + g.mixLeft[f] + g.mixRight[f];
    node.buf[kPortLeft][f] = left;
    node.buf[kPortRight][f] = right;
    if (node.typeId == kTypeReverbEffect) {
      // Dry + Mix both carry dry while bypassed (JS reverb bypass policy).
      node.buf[kPortDryL][f] = left;
      node.buf[kPortDryR][f] = right;
    }
  }
}

}  // namespace

extern "C" int soemdsp_graph_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      gPool[i].sampleRate = 44100.0f;
      gPool[i].globalTimeSamples = kDefaultSmoothSeconds * 44100.0;
      gPool[i].nodeCount = 0;
      gPool[i].toSmoothCount = 0;
      clear_graph_contents(gPool[i]);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_graph_destroy(int handle) {
  Circuit* g = get(handle);
  if (!g) {
    if (handle >= 1 && handle <= kMaxInstances) {
      gPool[handle - 1].active = false;
    }
    return;
  }
  clear_graph_contents(*g);
  g->active = false;
}

extern "C" void soemdsp_graph_clear(int handle) {
  Circuit* g = get(handle);
  if (!g) return;
  clear_graph_contents(*g);
}

extern "C" void soemdsp_graph_set_sample_rate(int handle, float sampleRate) {
  Circuit* g = get(handle);
  if (!g) return;
  if (!(sampleRate == sampleRate) || sampleRate < 1.0f) sampleRate = 44100.0f;
  g->sampleRate = sampleRate;
  // Coeff depends on SR (and default time-in-samples resolution).
  dirty_all_control_coeffs(*g);
  for (int i = 0; i < g->nodeCount; i++) {
    Node& n = g->nodes[i];
    if (!n.used || n.nativeHandle <= 0) continue;
    if (n.nativeKind == kTypeReverbEffect) {
      soemdsp_sabrina_reverb_reset(n.nativeHandle, (double)sampleRate);
    } else if (n.nativeKind == kTypePingPongDelay) {
      soemdsp_ping_pong_delay_reset(n.nativeHandle);
    }
  }
}

extern "C" int soemdsp_graph_add_node(int handle, unsigned int nodeIdHash, int typeId) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->compiled = false;
  if (nodeIdHash == 0) return -2;
  if (find_node(*g, nodeIdHash) >= 0) return -3;
  if (g->nodeCount >= kMaxNodes) return -4;
  if (typeId < 0) typeId = kTypeUnknown;

  Node& n = g->nodes[g->nodeCount];
  n.used = true;
  n.idHash = nodeIdHash;
  init_node_defaults(n, typeId);
  for (int c = 0; c < kChannels; c++) zero_buf(n.buf[c], kMaxBlockFrames);

  const bool needsNative =
    typeId == kTypePolyBlep
    || typeId == kTypeLadderFilter
    || typeId == kTypeSoftClipper
    || typeId == kTypeReverbEffect
    || typeId == kTypePingPongDelay;
  if (needsNative) {
    n.nativeHandle = create_native_for_type(typeId, g->sampleRate);
    if (n.nativeHandle <= 0) {
      n.used = false;
      n.nativeKind = 0;
      return -5; // native instance pool exhausted
    }
    n.nativeKind = typeId;
    if (typeId == kTypePolyBlep) {
      soemdsp_polyblep_reset(n.nativeHandle);
    }
  }

  g->nodeCount += 1;
  return 0;
}

extern "C" int soemdsp_graph_connect(
  int handle,
  unsigned int srcHash,
  int srcPort,
  unsigned int dstHash,
  int dstPort
) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->compiled = false;
  if (find_node(*g, srcHash) < 0 || find_node(*g, dstHash) < 0) return -2;
  if (g->connCount >= kMaxConnections) return -3;
  Conn& c = g->conns[g->connCount];
  c.used = true;
  c.srcHash = srcHash;
  c.srcPort = clamp_src_port(srcPort);
  c.dstHash = dstHash;
  c.dstPort = clamp_dst_port(dstPort);
  g->connCount += 1;
  return 0;
}

extern "C" int soemdsp_graph_set_bypassed(int handle, unsigned int nodeHash, int bypassed) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  g->nodes[idx].bypassed = bypassed != 0;
  return 0;
}

extern "C" int soemdsp_graph_set_param(int handle, unsigned int nodeHash, int paramId, float value) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  if (!(value == value)) return 0;
  Control* c = control_for_param(g->nodes[idx], paramId);
  if (!c) return 0;
  control_set_target(*g, *c, (double)value);
  return 0;
}

extern "C" int soemdsp_graph_set_smooth_time(
  int handle, unsigned int nodeHash, int paramId, float timeSamples
) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  Control* c = control_for_param(g->nodes[idx], paramId);
  if (!c) return 0;
  control_set_time(*g, *c, (double)timeSamples);
  return 0;
}

extern "C" int soemdsp_graph_set_smooth_mode(
  int handle, unsigned int nodeHash, int paramId, int mode
) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  Control* c = control_for_param(g->nodes[idx], paramId);
  if (!c) return 0;
  unsigned char m = kSmoothModeInternal;
  if (mode == (int)kSmoothModeGlobal) m = kSmoothModeGlobal;
  else if (mode == (int)kSmoothModeInternalGlobal) m = kSmoothModeInternalGlobal;
  else if (mode == (int)kSmoothModeOff) m = kSmoothModeOff;
  c->mode = m;
  c->dirty = true;
  if (!c->snap && dsp_fabs(c->out - c->target) > kPlanck) smoother_add(*g, *c);
  return 0;
}

extern "C" int soemdsp_graph_set_global_smooth_time(int handle, float timeSamples) {
  Circuit* g = get(handle);
  if (!g) return -1;
  double t = (double)timeSamples;
  if (!(t == t) || t < 0.0) t = 0.0;
  g->globalTimeSamples = t;
  dirty_all_control_coeffs(*g);
  for (int i = 0; i < g->toSmoothCount; i++) {
    Control* c = g->toSmooth[i];
    if (c) c->dirty = true;
  }
  // Wake controls that use global time and are not yet converged.
  for (int i = 0; i < g->nodeCount; i++) {
    if (!g->nodes[i].used) continue;
    Node& n = g->nodes[i];
    Control* slots[] = {
      &n.volumeDb, &n.pan, &n.frequency, &n.waveform, &n.amplitude, &n.shape,
      &n.phaseParam, &n.resonance, &n.mode, &n.stages, &n.center, &n.width,
      &n.oversample, &n.mix, &n.diffusionSize, &n.diffusionAmount, &n.delaySize,
      &n.recycle, &n.lfoAmplitude, &n.lfoBaseSpeed, &n.lfoVariation, &n.seed,
      &n.feedback, &n.level, &n.timeNumerator, &n.timeDenominator, &n.timingMode,
      &n.offsetMs, &n.lfoStyle, &n.lfoRate, &n.saturate, &n.lpfFrequency,
      &n.hpfFrequency, &n.tempoBpm
    };
    for (unsigned si = 0; si < sizeof(slots) / sizeof(slots[0]); si++) {
      Control* c = slots[si];
      if (!c || c->snap) continue;
      if (c->mode != kSmoothModeGlobal && c->mode != kSmoothModeInternalGlobal) continue;
      if (dsp_fabs(c->out - c->target) > kPlanck) smoother_add(*g, *c);
    }
  }
  return 0;
}

extern "C" int soemdsp_graph_compile(int handle) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->compiled = false;
  g->orderCount = 0;
  g->outputNodeIndex = -1;

  int indeg[kMaxNodes];
  unsigned char removed[kMaxNodes];
  for (int i = 0; i < g->nodeCount; i++) {
    indeg[i] = 0;
    removed[i] = 0;
  }
  for (int i = 0; i < g->connCount; i++) {
    if (!g->conns[i].used) continue;
    const int d = find_node(*g, g->conns[i].dstHash);
    const int s = find_node(*g, g->conns[i].srcHash);
    if (d < 0 || s < 0 || s == d) continue;
    indeg[d] += 1;
  }

  while (g->orderCount < g->nodeCount) {
    int pick = -1;
    int pickOut = -1;
    for (int i = 0; i < g->nodeCount; i++) {
      if (removed[i] || indeg[i] > 0) continue;
      if (g->nodes[i].typeId == kTypeOutput) {
        if (pickOut < 0) pickOut = i;
      } else if (pick < 0) {
        pick = i;
      }
    }
    if (pick < 0) pick = pickOut;
    if (pick < 0) {
      for (int pass = 0; pass < 2; pass++) {
        for (int i = 0; i < g->nodeCount; i++) {
          if (removed[i]) continue;
          const bool isOut = g->nodes[i].typeId == kTypeOutput;
          if (pass == 0 && isOut) continue;
          if (pass == 1 && !isOut) continue;
          removed[i] = 1;
          g->order[g->orderCount++] = i;
        }
      }
      break;
    }
    removed[pick] = 1;
    g->order[g->orderCount++] = pick;
    for (int i = 0; i < g->connCount; i++) {
      if (!g->conns[i].used) continue;
      if (g->conns[i].srcHash != g->nodes[pick].idHash) continue;
      const int d = find_node(*g, g->conns[i].dstHash);
      if (d >= 0 && indeg[d] > 0) indeg[d] -= 1;
    }
  }

  for (int i = 0; i < g->nodeCount; i++) {
    if (g->nodes[i].typeId == kTypeOutput) {
      g->outputNodeIndex = i;
      break;
    }
  }

  g->compiled = true;
  return 0;
}

extern "C" int soemdsp_graph_process_block(int handle, int n) {
  Circuit* g = get(handle);
  if (!g || !g->compiled) return -1;
  int frames = n;
  if (frames < 1) return -2;
  if (frames > kMaxBlockFrames) frames = kMaxBlockFrames;

  zero_buf(g->outL, frames);
  zero_buf(g->outR, frames);

  // Block-rate Control: DSP reads current outs (start of quantum), then the
  // chase advances for the next quantum. Matches "JS is interface / per block."
  // Osc/filter sample paths may step their own Controls per sample instead.
  for (int oi = 0; oi < g->orderCount; oi++) {
    const int ni = g->order[oi];
    if (ni < 0 || ni >= g->nodeCount || !g->nodes[ni].used) continue;
    Node& node = g->nodes[ni];
    for (int c = 0; c < kChannels; c++) zero_buf(node.buf[c], frames);

    if (node.bypassed) {
      process_bypass(*g, node, frames);
      continue;
    }

    if (node.typeId == kTypePolyBlep) {
      process_polyblep(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLadderFilter) {
      process_ladder(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSoftClipper) {
      process_soft_clipper(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeReverbEffect) {
      process_reverb(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePingPongDelay) {
      process_ping_pong(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeOutput) {
      process_output(*g, node, frames);
      continue;
    }
    // unknown: silence
  }

  smoother_run(*g, frames);
  smoother_clean(*g);
  return frames;
}

extern "C" double* soemdsp_graph_block_output_left_ptr(int handle) {
  Circuit* g = get(handle);
  return g ? g->outL : nullptr;
}

extern "C" double* soemdsp_graph_block_output_right_ptr(int handle) {
  Circuit* g = get(handle);
  return g ? g->outR : nullptr;
}

// Observe-only: pointer to last process_block's node.buf[port] (audio ports 0..7).
extern "C" double* soemdsp_graph_node_port_ptr(int handle, unsigned int nodeHash, int port) {
  Circuit* g = get(handle);
  if (!g) return nullptr;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return nullptr;
  const int p = clamp_src_port(port);
  return g->nodes[idx].buf[p];
}

extern "C" int soemdsp_graph_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_graph_version() {
  return 10; // Control chase after DSP (block-rate); sample paths step locally
}
