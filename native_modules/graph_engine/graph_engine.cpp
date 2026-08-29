// soemdsp-native-module: graph_engine
// soemdsp-native-label: Graph Engine
// soemdsp-native-target: graphEngine
// soemdsp-native-kind: engine
//
// MVEP GraphEngine (PR-E2): orchestrates polyBlep → ladderFilter → softClipper
// (+ output) inside soemdsp_graph_process_block. DSP lives in existing natives;
// this module only creates instances, wires buffers, and walks topo order.

#include "../sandbox_native_maths/exp_log.h"
#include "../sandbox_native_maths/analog_filter_trig.h"

// Combined wasm resolves these; standalone graph_engine.wasm links with
// --allow-undefined (stubs unused — product loads soemdsp_combined.wasm).
extern "C" int soemdsp_polyblep_create();
extern "C" void soemdsp_polyblep_destroy(int handle);
extern "C" void soemdsp_polyblep_reset(int handle);
extern "C" void soemdsp_polyblep_process_block(
  int handle, int frameCount, double phase0, double phaseIncrement,
  int waveform, double level, double morph, int tapMask
);
extern "C" int soemdsp_polyblep_block_out_ptr(int handle, int tapIndex);

extern "C" int soemdsp_ladder_filter_create();
extern "C" void soemdsp_ladder_filter_destroy(int handle);
extern "C" void soemdsp_ladder_filter_set_params(
  int handle, double frequency, double resonance, int mode, int stages, double sampleRate
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

namespace {

using soemdsp_maths::dsp_exp;
using soemdsp_maths::dsp_cos;

static const int kMaxInstances = 4;
static const int kMaxNodes = 64;
static const int kMaxConnections = 256;
static const int kMaxBlockFrames = 128;
// 0=Mono/Out, 1=Left, 2=Right, 3=Saw, 4=Ramp, 5=Square, 6=Tri, 7=Sine
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

static const int kTapOut = 1;
static const int kTapSaw = 2;
static const int kTapRamp = 4;
static const int kTapSquare = 8;
static const int kTapTri = 16;
static const int kTapSine = 32;

static const double kTwoPi = 6.28318530717958647692;
static const double kPi = 3.14159265358979323846;

struct Node {
  unsigned int idHash;
  int typeId;
  bool used;
  int nativeHandle;
  float volumeDb;
  float pan;
  float frequency;
  float waveform;
  float amplitude;
  float shape;
  float phaseParam;
  float resonance;
  float mode;
  float stages;
  float center;
  float width;
  float oversample;
  double phase; // polyBlep running phase (radians)
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
  int nodeCount;
  int connCount;
  int orderCount;
  int order[kMaxNodes];
  int outputNodeIndex;
  Node nodes[kMaxNodes];
  Conn conns[kMaxConnections];
  double outL[kMaxBlockFrames];
  double outR[kMaxBlockFrames];
  double mixMono[kMaxBlockFrames];
  double mixLeft[kMaxBlockFrames];
  double mixRight[kMaxBlockFrames];
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
    return;
  }
  if (n.typeId == kTypePolyBlep) {
    soemdsp_polyblep_destroy(n.nativeHandle);
  } else if (n.typeId == kTypeLadderFilter) {
    soemdsp_ladder_filter_destroy(n.nativeHandle);
  } else if (n.typeId == kTypeSoftClipper) {
    soemdsp_soft_clipper_destroy(n.nativeHandle);
  }
  n.nativeHandle = 0;
}

static void init_node_defaults(Node& n, int typeId) {
  n.typeId = typeId;
  n.nativeHandle = 0;
  n.volumeDb = -3.0f;
  n.pan = 0.0f;
  n.frequency = (typeId == kTypeLadderFilter) ? 1000.0f : 220.0f;
  n.waveform = 0.0f;
  n.amplitude = 1.0f;
  n.shape = 0.5f;
  n.phaseParam = 0.0f;
  n.resonance = 0.2f;
  n.mode = 1.0f;
  n.stages = 4.0f;
  n.center = 0.0f;
  n.width = 2.0f;
  n.oversample = 2.0f;
  n.phase = 0.0;
}

static int create_native_for_type(int typeId) {
  if (typeId == kTypePolyBlep) return soemdsp_polyblep_create();
  if (typeId == kTypeLadderFilter) return soemdsp_ladder_filter_create();
  if (typeId == kTypeSoftClipper) return soemdsp_soft_clipper_create();
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

static int clamp_port(int port) {
  if (port < 0) return kPortMono;
  if (port >= kChannels) return kPortMono;
  return port;
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
    const int si = find_node(g, c.srcHash);
    if (si < 0) continue;
    Node& src = g.nodes[si];
    const int sp = clamp_port(c.srcPort);
    const int dp = clamp_port(c.dstPort);
    double* dstAcc = g.mixMono;
    if (dp == kPortLeft) dstAcc = g.mixLeft;
    else if (dp == kPortRight) dstAcc = g.mixRight;
    for (int f = 0; f < frames; f++) {
      dstAcc[f] += src.buf[sp][f];
    }
  }
}

static int polyblep_tap_mask(Circuit& g, const Node& node) {
  int mask = 0;
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.srcHash != node.idHash) continue;
    const int sp = clamp_port(c.srcPort);
    if (sp == kPortMono || sp == kPortLeft || sp == kPortRight) mask |= kTapOut;
    else if (sp == kPortSaw) mask |= kTapSaw;
    else if (sp == kPortRamp) mask |= kTapRamp;
    else if (sp == kPortSquare) mask |= kTapSquare;
    else if (sp == kPortTri) mask |= kTapTri;
    else if (sp == kPortSine) mask |= kTapSine;
  }
  return mask == 0 ? kTapOut : mask;
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
  double freq = (double)node.frequency;
  if (!(freq == freq) || freq < 0.0) freq = 0.0;
  const double phaseInc = freq / (double)sr;
  int waveform = (int)(node.waveform + (node.waveform >= 0.0f ? 0.5f : -0.5f));
  if (waveform < 0) waveform = 0;
  if (waveform > 8) waveform = 8;
  double level = (double)node.amplitude;
  if (!(level == level)) level = 0.0;
  double morph = (double)node.shape;
  if (!(morph == morph)) morph = 0.5;
  const int mask = polyblep_tap_mask(g, node);
  // phaseParam is cycles 0..1 (JS phase knob); running node.phase is radians.
  const double phase0 = node.phase + (double)node.phaseParam * kTwoPi;
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
    // Stereo mirrors of Out when cabled as Left/Right sources.
    copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
    copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
  }
  if (mask & kTapSaw) copy_tap_to_buf(node.buf[kPortSaw], sawPtr, frames);
  if (mask & kTapRamp) copy_tap_to_buf(node.buf[kPortRamp], rampPtr, frames);
  if (mask & kTapSquare) copy_tap_to_buf(node.buf[kPortSquare], sqPtr, frames);
  if (mask & kTapTri) copy_tap_to_buf(node.buf[kPortTri], triPtr, frames);
  if (mask & kTapSine) copy_tap_to_buf(node.buf[kPortSine], sinePtr, frames);

  node.phase += kTwoPi * phaseInc * (double)frames;
  while (node.phase > kPi) node.phase -= kTwoPi;
  while (node.phase < -kPi) node.phase += kTwoPi;
}

static void process_ladder(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  double freq = (double)node.frequency;
  if (!(freq == freq) || freq < 0.0) freq = 0.0;
  double reso = (double)node.resonance;
  if (!(reso == reso)) reso = 0.0;
  if (reso < 0.0) reso = 0.0;
  if (reso > 0.999) reso = 0.999;
  int mode = (int)(node.mode + (node.mode >= 0.0f ? 0.5f : -0.5f));
  if (mode < 0) mode = 0;
  if (mode > 3) mode = 3;
  int stages = (int)(node.stages + (node.stages >= 0.0f ? 0.5f : -0.5f));
  if (stages < 1) stages = 1;
  if (stages > 4) stages = 4;
  soemdsp_ladder_filter_set_params(node.nativeHandle, freq, reso, mode, stages, (double)sr);

  double* inPtr = ptr_from_export(soemdsp_ladder_filter_block_input_ptr(node.nativeHandle));
  double* outPtr = ptr_from_export(soemdsp_ladder_filter_block_output_ptr(node.nativeHandle));
  if (!inPtr || !outPtr) return;
  // Mono bus + Left/Right summed into the mono ladder (matches mixInput default).
  for (int f = 0; f < frames; f++) {
    inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
  }
  soemdsp_ladder_filter_process_block(node.nativeHandle, frames);
  copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
}

static void process_soft_clipper(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  double center = (double)node.center;
  if (!(center == center)) center = 0.0;
  double width = (double)node.width;
  if (!(width == width) || width == 0.0) width = 2.0;
  int os = (int)(node.oversample + (node.oversample >= 0.0f ? 0.5f : -0.5f));
  if (os < 0) os = 0;
  if (os > 2) os = 2;
  const double aa = os > 0 ? 1.0 : 0.0;
  soemdsp_soft_clipper_set_params(node.nativeHandle, center, width, aa, os);

  bool hasLeft = false;
  bool hasRight = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    if (!g.conns[ci].used || g.conns[ci].dstHash != node.idHash) continue;
    const int dp = clamp_port(g.conns[ci].dstPort);
    if (dp == kPortLeft) hasLeft = true;
    if (dp == kPortRight) hasRight = true;
  }

  double* in0 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 0));
  double* out0 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 0));
  if (!in0 || !out0) return;
  for (int f = 0; f < frames; f++) {
    in0[f] = g.mixMono[f];
    if (!hasLeft && !hasRight) {
      // Feed-forward mono: fold L/R mixes into mono channel.
      in0[f] += g.mixLeft[f] + g.mixRight[f];
    }
  }
  soemdsp_soft_clipper_process_block(node.nativeHandle, 0, frames);
  copy_tap_to_buf(node.buf[kPortMono], out0, frames);

  if (hasLeft) {
    double* in1 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 1));
    double* out1 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 1));
    if (in1 && out1) {
      for (int f = 0; f < frames; f++) in1[f] = g.mixLeft[f] + g.mixMono[f];
      soemdsp_soft_clipper_process_block(node.nativeHandle, 1, frames);
      copy_tap_to_buf(node.buf[kPortLeft], out1, frames);
    }
  } else {
    copy_tap_to_buf(node.buf[kPortLeft], out0, frames);
  }
  if (hasRight) {
    double* in2 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 2));
    double* out2 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 2));
    if (in2 && out2) {
      for (int f = 0; f < frames; f++) in2[f] = g.mixRight[f] + g.mixMono[f];
      soemdsp_soft_clipper_process_block(node.nativeHandle, 2, frames);
      copy_tap_to_buf(node.buf[kPortRight], out2, frames);
    }
  } else {
    copy_tap_to_buf(node.buf[kPortRight], out0, frames);
  }
}

static void process_output(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  float gL = 1.0f, gR = 1.0f;
  pan_gains(node.pan, &gL, &gR);
  const float vol = db_to_lin(node.volumeDb);
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

}  // namespace

extern "C" int soemdsp_graph_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      gPool[i].sampleRate = 44100.0f;
      gPool[i].nodeCount = 0;
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

  if (typeId == kTypePolyBlep || typeId == kTypeLadderFilter || typeId == kTypeSoftClipper) {
    n.nativeHandle = create_native_for_type(typeId);
    if (n.nativeHandle <= 0) {
      n.used = false;
      return -5;
    }
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
  c.srcPort = clamp_port(srcPort);
  c.dstHash = dstHash;
  c.dstPort = clamp_port(dstPort);
  g->connCount += 1;
  return 0;
}

extern "C" int soemdsp_graph_set_param(int handle, unsigned int nodeHash, int paramId, float value) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  Node& n = g->nodes[idx];
  if (!(value == value)) return 0;

  if (paramId == kParamVolumeDb) { n.volumeDb = value; return 0; }
  if (paramId == kParamPan) { n.pan = value; return 0; }
  if (paramId == kParamFrequency) { n.frequency = value; return 0; }
  if (paramId == kParamWaveform) { n.waveform = value; return 0; }
  if (paramId == kParamAmplitude) { n.amplitude = value; return 0; }
  if (paramId == kParamShape) { n.shape = value; return 0; }
  if (paramId == kParamPhase) { n.phaseParam = value; return 0; }
  if (paramId == kParamResonance) { n.resonance = value; return 0; }
  if (paramId == kParamMode) { n.mode = value; return 0; }
  if (paramId == kParamStages) { n.stages = value; return 0; }
  if (paramId == kParamCenter) { n.center = value; return 0; }
  if (paramId == kParamWidth) { n.width = value; return 0; }
  if (paramId == kParamOversample) { n.oversample = value; return 0; }
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

  for (int oi = 0; oi < g->orderCount; oi++) {
    const int ni = g->order[oi];
    if (ni < 0 || ni >= g->nodeCount || !g->nodes[ni].used) continue;
    Node& node = g->nodes[ni];
    for (int c = 0; c < kChannels; c++) zero_buf(node.buf[c], frames);

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
    if (node.typeId == kTypeOutput) {
      process_output(*g, node, frames);
      continue;
    }
    // reverb / pingPong / unknown: silence until PR-E3+
  }

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

extern "C" int soemdsp_graph_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_graph_version() {
  return 2; // PR-E2: polyBlep + ladder + softClipper orchestration
}
