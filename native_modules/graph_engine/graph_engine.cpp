// soemdsp-native-module: graph_engine
// soemdsp-native-label: Graph Engine
// soemdsp-native-target: graphEngine
// soemdsp-native-kind: engine
//
// MVEP GraphEngine skeleton (PR-E1): compile a plan of allowlisted nodes and
// process one quantum via soemdsp_graph_process_block. This stub implements
// output (+ silence for unimplemented types). PR-E2+ fills DSP nodes.

#include "../sandbox_native_maths/exp_log.h"
#include "../sandbox_native_maths/analog_filter_trig.h"

namespace {

using soemdsp_maths::dsp_exp;
using soemdsp_maths::dsp_cos;

static const int kMaxInstances = 4;
static const int kMaxNodes = 64;
static const int kMaxConnections = 256;
static const int kMaxBlockFrames = 128;
static const int kChannels = 3; // 0=Mono, 1=Left, 2=Right

// Allowlist type IDs (fixed; keep in sync with JS mapNativeGraphTypeId).
static const int kTypeUnknown = 0;
static const int kTypePolyBlep = 1;
static const int kTypeLadderFilter = 2;
static const int kTypeSoftClipper = 3;
static const int kTypeReverbEffect = 4;
static const int kTypePingPongDelay = 5;
static const int kTypeOutput = 6;

// Port IDs (fixed; keep in sync with JS mapNativeGraphPortId).
static const int kPortMono = 0;
static const int kPortLeft = 1;
static const int kPortRight = 2;

static const int kParamVolumeDb = 0;
static const int kParamPan = 1;

struct Node {
  unsigned int idHash;
  int typeId;
  bool used;
  float volumeDb; // output only (default -3)
  float pan;      // output only
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
};

static Circuit gPool[kMaxInstances];

static void zero_buf(double* p, int n) {
  for (int i = 0; i < n; i++) p[i] = 0.0;
}

static void clear_graph_contents(Circuit& g) {
  g.compiled = false;
  g.nodeCount = 0;
  g.connCount = 0;
  g.orderCount = 0;
  g.outputNodeIndex = -1;
  for (int i = 0; i < kMaxNodes; i++) {
    g.nodes[i].used = false;
    g.nodes[i].idHash = 0;
    g.nodes[i].typeId = kTypeUnknown;
    g.nodes[i].volumeDb = -3.0f;
    g.nodes[i].pan = 0.0f;
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
  if (port > kPortRight) return kPortMono;
  return port;
}

// Match JS nodeGraphOutputVolumeDbToLin / 10^(db/20) via freestanding dsp_exp.
static float db_to_lin(float db) {
  if (!(db == db) || db <= -140.0f) return 0.0f;
  return (float)dsp_exp((double)db * 0.11512925464970229); // ln(10)/20
}

// Match JS nodeGraphOutputPanGains equal-power law (cos(p * π/2)).
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

}  // namespace

extern "C" int soemdsp_graph_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      gPool[i].sampleRate = 44100.0f;
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
  // Accept allowlisted types (and unknown); unimplemented DSP → silence in process.
  if (typeId < 0) typeId = kTypeUnknown;
  Node& n = g->nodes[g->nodeCount];
  n.used = true;
  n.idHash = nodeIdHash;
  n.typeId = typeId;
  n.volumeDb = -3.0f;
  n.pan = 0.0f;
  for (int c = 0; c < kChannels; c++) zero_buf(n.buf[c], kMaxBlockFrames);
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
  if (paramId == kParamVolumeDb) {
    n.volumeDb = value;
    return 0;
  }
  if (paramId == kParamPan) {
    n.pan = value;
    return 0;
  }
  // Unknown param: accept for API stability.
  (void)value;
  return 0;
}

extern "C" int soemdsp_graph_compile(int handle) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->compiled = false;
  g->orderCount = 0;
  g->outputNodeIndex = -1;

  // Kahn topo: indegree from connections among known nodes.
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

  // Prefer non-output first; output last among zero-indegree picks.
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
      // Cycle — append remaining in declaration order (output last).
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

    if (node.typeId == kTypeOutput) {
      // Sum wired inputs into Mono/Left/Right scratch, then to speaker outs.
      double monoAcc[kMaxBlockFrames];
      double leftAcc[kMaxBlockFrames];
      double rightAcc[kMaxBlockFrames];
      zero_buf(monoAcc, frames);
      zero_buf(leftAcc, frames);
      zero_buf(rightAcc, frames);

      for (int ci = 0; ci < g->connCount; ci++) {
        const Conn& c = g->conns[ci];
        if (!c.used || c.dstHash != node.idHash) continue;
        const int si = find_node(*g, c.srcHash);
        if (si < 0) continue;
        Node& src = g->nodes[si];
        const int sp = clamp_port(c.srcPort);
        const int dp = clamp_port(c.dstPort);
        double* dstAcc = monoAcc;
        if (dp == kPortLeft) dstAcc = leftAcc;
        else if (dp == kPortRight) dstAcc = rightAcc;
        for (int f = 0; f < frames; f++) {
          dstAcc[f] += src.buf[sp][f];
        }
      }

      float gL = 1.0f, gR = 1.0f;
      pan_gains(node.pan, &gL, &gR);
      const float vol = db_to_lin(node.volumeDb);
      for (int f = 0; f < frames; f++) {
        const double m = monoAcc[f];
        const double l = (m + leftAcc[f]) * (double)vol * (double)gL;
        const double r = (m + rightAcc[f]) * (double)vol * (double)gR;
        node.buf[kPortMono][f] = m * (double)vol;
        node.buf[kPortLeft][f] = l;
        node.buf[kPortRight][f] = r;
        g->outL[f] += l;
        g->outR[f] += r;
      }
      continue;
    }

    // Unimplemented allowlist DSP (and unknown): leave silence in node buffers.
    // PR-E2+ will write real process_block results here.
    (void)kTypePolyBlep;
    (void)kTypeLadderFilter;
    (void)kTypeSoftClipper;
    (void)kTypeReverbEffect;
    (void)kTypePingPongDelay;
    (void)kTypeUnknown;
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
  return 1;
}
