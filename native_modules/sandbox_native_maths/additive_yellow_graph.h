// Yellow Graph (Additive) — shared C++ kernels for graph_engine.
// Ported conceptually from public/modules/additiveGraph/additive-graph-math.js.
// A0: payload layout + constants. A1 fills BuildFromWaveform / ApplyGrowl / SumSample.

#pragma once

#ifndef ADDITIVE_YELLOW_GRAPH_H
#define ADDITIVE_YELLOW_GRAPH_H

namespace soemdsp_yellow_graph {

// graph_engine type ids (keep in sync with JS NATIVE_GRAPH_TYPE_IDS).
static const int kTypeAdditiveGenerator = 111;
static const int kTypeAdditiveBubble = 112;
static const int kTypeAdditiveOut = 113;
// A2+ (reserved):
// 114 LinearFilter 115 AnalogFilter 116 LadderFilter
// 117 FrequencySkew 118 QuantizeFreq 119 QuantizePhase
// 120 Pan 121 NoisyFreq 122 NoisyPhase 123 NoisyPan 124 NoisyAmp

static const int kMaxHarmonics = 1024;
static const int kDefaultHarmonics = 32;

// Quantum Graph chunk (Yellow data-plane). Owned by graph_engine Node extension.
struct GraphPayload {
  int harmonics; // slot count
  float ratio[kMaxHarmonics];
  float phase[kMaxHarmonics];
  float amplitude[kMaxHarmonics];
  float pan[kMaxHarmonics]; // −1…+1
  unsigned char phaseReset; // Out should wipe phaseAcc when set
};

inline void graph_clear(GraphPayload& g) {
  g.harmonics = 0;
  g.phaseReset = 0;
  for (int i = 0; i < kMaxHarmonics; i += 1) {
    g.ratio[i] = 0.0f;
    g.phase[i] = 0.0f;
    g.amplitude[i] = 0.0f;
    g.pan[i] = 0.0f;
  }
}

inline void graph_copy(GraphPayload& dst, const GraphPayload& src) {
  dst.harmonics = src.harmonics;
  dst.phaseReset = src.phaseReset;
  const int h = src.harmonics < kMaxHarmonics ? src.harmonics : kMaxHarmonics;
  for (int i = 0; i < h; i += 1) {
    dst.ratio[i] = src.ratio[i];
    dst.phase[i] = src.phase[i];
    dst.amplitude[i] = src.amplitude[i];
    dst.pan[i] = src.pan[i];
  }
}

// A1 stubs — implemented when opcodes land.
void build_from_waveform(GraphPayload& out, int waveform, float pwm, float harmonics, float phaseRotation);
void apply_bubble(GraphPayload& g, float phaseSkew, float skewAmount, float cutoff, float unskew);
void sum_sample(
  const GraphPayload& g,
  double* phaseAcc,
  float frequencyHz,
  float masterAmp,
  float sampleRate,
  float* mono,
  float* left,
  float* right
);

}  // namespace soemdsp_yellow_graph

#endif
