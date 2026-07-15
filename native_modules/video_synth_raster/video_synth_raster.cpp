// soemdsp-native-module: video_synth_raster
// soemdsp-native-label: Video Synth Raster (proof of concept)
// soemdsp-native-target: videoSynthRaster
// soemdsp-native-kind: video-poc
//
// Proof of concept: a chaotic attractor's continuous state, walked one
// step per output pixel (row-major raster order), producing a grayscale
// video frame -- literally the "video is just a signal, run DSP on it"
// idea from analog video synthesizers (Rutt-Etra, Sandin Image Processor)
// applied through this sandbox's existing process_block boundary shape,
// just pointed at a canvas instead of a speaker.
//
// This is a standalone proof, not wired into the node graph or the live
// AudioWorklet -- see the demo HTML page for how it's actually driven.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxWidth = 512;
constexpr int kMaxHeight = 512;
constexpr int kMaxPixels = kMaxWidth * kMaxHeight;
constexpr int kMaxInstances = 4;

// Lorenz attractor step (classic parameters). Chosen over Henon/Logistic
// because its continuous, unbounded-but-attracted trajectory gives a
// smoothly evolving image rather than a fixed discrete orbit -- it never
// exactly repeats, which is what makes it look alive frame to frame.
struct LorenzState {
  double x;
  double y;
  double z;
};

void lorenzStep(LorenzState& s, double dt, double sigma, double rho, double beta) {
  const double dx = sigma * (s.y - s.x);
  const double dy = s.x * (rho - s.z) - s.y;
  const double dz = s.x * s.y - beta * s.z;
  s.x += dx * dt;
  s.y += dy * dt;
  s.z += dz * dt;
  // Lorenz can occasionally diverge under a bad dt/param combination;
  // clamp back onto the attractor's basin rather than letting a NaN/Inf
  // poison every subsequent frame's brightness buffer.
  if (!(s.x > -1e6 && s.x < 1e6)) s.x = 1.0;
  if (!(s.y > -1e6 && s.y < 1e6)) s.y = 1.0;
  if (!(s.z > -1e6 && s.z < 1e6)) s.z = 1.0;
}

struct VideoSynthState {
  bool active;
  LorenzState chaos;
  // Persistent per-pixel brightness from the previous frame -- this is
  // the phosphor decay buffer, same math as the soemdsp-sandbox-phosphor
  // fork documents: brightness = brightness * decay + newHit * (1 - decay).
  double previousFrame[kMaxPixels];
  double outFrame[kMaxPixels];
};

VideoSynthState gPool[kMaxInstances];

VideoSynthState* stateForHandle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  VideoSynthState& s = gPool[handle - 1];
  return s.active ? &s : nullptr;
}

}  // namespace

extern "C" int soemdsp_video_synth_raster_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      VideoSynthState& s = gPool[i];
      s.active = true;
      s.chaos = LorenzState{0.1, 0.0, 0.0};
      for (int p = 0; p < kMaxPixels; p += 1) {
        s.previousFrame[p] = 0.0;
        s.outFrame[p] = 0.0;
      }
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_video_synth_raster_destroy(int handle) {
  VideoSynthState* s = stateForHandle(handle);
  if (s) s->active = false;
}

extern "C" void soemdsp_video_synth_raster_reset(int handle) {
  VideoSynthState* s = stateForHandle(handle);
  if (!s) return;
  s->chaos = LorenzState{0.1, 0.0, 0.0};
  for (int p = 0; p < kMaxPixels; p += 1) {
    s->previousFrame[p] = 0.0;
    s->outFrame[p] = 0.0;
  }
}

// Block-processing boundary: same (state, output, frameCount) shape as
// this branch's audio process_block APIs, with frameCount = width*height
// and "frameCount" walked in raster order instead of time order. Called
// once per animation frame (an independent clock from audio), not once
// per audio render quantum -- there is no reason for this to run at
// 44.1kHz, so it deliberately doesn't.
extern "C" void soemdsp_video_synth_raster_process_block(
  int handle,
  int width,
  int height,
  double speed,
  double decay,
  double sigma,
  double rho,
  double beta
) {
  VideoSynthState* state = stateForHandle(handle);
  if (!state) return;
  const int safeWidth = width < 1 ? 1 : (width > kMaxWidth ? kMaxWidth : width);
  const int safeHeight = height < 1 ? 1 : (height > kMaxHeight ? kMaxHeight : height);
  const int frameCount = safeWidth * safeHeight;
  const double dt = clamp(speed, 0.0001, 0.05);
  const double safeDecay = clamp(decay, 0.0, 0.99);
  const double safeSigma = sigma <= 0.0 ? 10.0 : sigma;
  const double safeRho = rho <= 0.0 ? 28.0 : rho;
  const double safeBeta = beta <= 0.0 ? (8.0 / 3.0) : beta;

  for (int i = 0; i < frameCount; i += 1) {
    lorenzStep(state->chaos, dt, safeSigma, safeRho, safeBeta);
    // Lorenz x/y roam roughly [-20, 20], z roughly [0, 50] for the
    // classic parameters -- normalize z (always positive, wide range)
    // into a 0..1 brightness "hit" for this pixel.
    const double hit = clamp(state->chaos.z / 50.0, 0.0, 1.0);
    const double blended = state->previousFrame[i] * safeDecay + hit * (1.0 - safeDecay);
    state->outFrame[i] = blended;
    state->previousFrame[i] = blended;
  }
}

extern "C" int soemdsp_video_synth_raster_output_ptr(int handle) {
  VideoSynthState* s = stateForHandle(handle);
  return s ? reinterpret_cast<int>(s->outFrame) : 0;
}

extern "C" int soemdsp_video_synth_raster_max_width() { return kMaxWidth; }
extern "C" int soemdsp_video_synth_raster_max_height() { return kMaxHeight; }
extern "C" int soemdsp_video_synth_raster_version() { return 1; }
