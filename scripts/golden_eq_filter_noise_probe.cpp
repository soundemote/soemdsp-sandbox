// Golden probe for scripts/test_tpt_svf_noise_colors_regression.mjs.
// Renders a fixed grid through the EQ Filter and Noise Generator extern "C"
// APIs (the same entry points graph_engine and the standalone wasm use) into
// one static double buffer. The test links this TU with the module sources
// (native_modules/eq_filter/eq_filter.cpp, noise_generator/noise_generator.cpp)
// using the production flags, captured the goldens BEFORE the tpt_svf.h /
// noise_colors.h extraction, and now requires byte-for-byte equality.
// Built on demand by the test (clang++ --target=wasm32); not a module.

extern "C" int soemdsp_eq_filter_create();
extern "C" void soemdsp_eq_filter_destroy(int handle);
extern "C" double soemdsp_eq_filter_sample(
  int handle, double input, double mode, double frequency, double q,
  double gainDb, double sampleRate, double stages);

extern "C" int soemdsp_noise_generator_create();
extern "C" void soemdsp_noise_generator_destroy(int handle);
extern "C" void soemdsp_noise_generator_sample(
  int handle, double seedValue, int mode, double mean, double deviation,
  double shape, double level);
extern "C" double soemdsp_noise_generator_left(int handle);
extern "C" double soemdsp_noise_generator_right(int handle);
extern "C" void soemdsp_noise_generator_process_block(
  int handle, double seedValue, int mode, double mean, double deviation,
  double shape, double level, int frameCount, int useSimd);
extern "C" int soemdsp_noise_generator_block_output_left_ptr(int handle);
extern "C" int soemdsp_noise_generator_block_output_right_ptr(int handle);

namespace {

static const int kCap = 262144;
static double gOut[kCap];
static int gCount = 0;

static void put(double v) {
  if (gCount < kCap) gOut[gCount] = v;
  gCount += 1;
}

// Deterministic excitation: bipolar LCG, an impulse at 0, plus one NaN and
// one Inf so the safe() input guard is part of the golden.
static unsigned int gLcg = 1u;
static double excite(int n) {
  gLcg = 1664525u * gLcg + 1013904223u;
  double x = (double)gLcg / 4294967295.0 * 2.0 - 1.0;
  if (n == 0) x = 1.0;
  if (n == 7) x = 0.0 / 0.0;
  if (n == 13) x = 1.0 / 0.0;
  return x;
}

// Cubic-in-t sweep a -> b (no libm needed).
static double sweep(double a, double b, double t) {
  return a + (b - a) * t * t * t;
}

}  // namespace

extern "C" int probe_buffer_ptr() { return (int)(long)gOut; }
extern "C" int probe_capacity() { return kCap; }

// EQ Filter: modes 0-9 x stages 1-4 x frequency x Q x gain (64 samples each,
// fresh handle per cell), then per-sample frequency/Q sweeps per mode at two
// sample rates, then a stage-count change mid-run.
extern "C" int probe_render_eq() {
  gCount = 0;
  const double freqs[] = {30.0, 440.0, 3000.0, 12000.0, 30000.0};
  const double qs[] = {0.3, 0.70710678118654752, 5.0, 40.0};
  const double gains[] = {-15.0, 0.0, 9.0};
  for (int mode = 0; mode <= 9; mode += 1) {
    for (int stages = 1; stages <= 4; stages += 1) {
      for (int fi = 0; fi < 5; fi += 1) {
        for (int qi = 0; qi < 4; qi += 1) {
          for (int gi = 0; gi < 3; gi += 1) {
            const int h = soemdsp_eq_filter_create();
            gLcg = (unsigned int)(1 + mode * 977 + stages * 131 + fi * 17 + qi * 5 + gi);
            for (int n = 0; n < 64; n += 1) {
              put(soemdsp_eq_filter_sample(h, excite(n), (double)mode, freqs[fi], qs[qi], gains[gi], 48000.0, (double)stages));
            }
            soemdsp_eq_filter_destroy(h);
          }
        }
      }
    }
  }
  const double rates[] = {44100.0, 96000.0};
  for (int ri = 0; ri < 2; ri += 1) {
    for (int mode = 1; mode <= 9; mode += 1) {
      const int h = soemdsp_eq_filter_create();
      gLcg = (unsigned int)(7 + mode + ri * 100);
      const int N = 2048;
      for (int n = 0; n < N; n += 1) {
        const double t = (double)n / (double)(N - 1);
        const double f = sweep(20.0, 20000.0, t);
        const double q = 0.5 + 19.5 * t * t;
        const double g = -18.0 + 36.0 * t;
        put(soemdsp_eq_filter_sample(h, excite(n), (double)mode, f, q, g, rates[ri], 2.0));
      }
      soemdsp_eq_filter_destroy(h);
    }
  }
  {
    const int h = soemdsp_eq_filter_create();
    gLcg = 4242u;
    const double stageSeq[] = {1.0, 3.0, 2.0, 4.0, 4.0, 1.0};
    for (int n = 0; n < 1536; n += 1) {
      put(soemdsp_eq_filter_sample(h, excite(n), 7.0, 800.0, 2.0, 6.0, 48000.0, stageSeq[n / 256]));
    }
    // Fractional / out-of-range mode and stage values (rounding + clamps).
    const double modes[] = {-1.0, 3.49, 3.5, 9.6, 12.0};
    for (int m = 0; m < 5; m += 1) {
      for (int n = 0; n < 32; n += 1) {
        put(soemdsp_eq_filter_sample(h, excite(n + 1), modes[m], 1500.0, 1.5, -3.0, 48000.0, 2.6 + m));
      }
    }
    soemdsp_eq_filter_destroy(h);
  }
  return gCount;
}

// Noise Generator: modes 0-4 x shape {0, 0.5, 1} x seeds x deviation, through
// process_block scalar (useSimd 0) and SIMD (useSimd 1), two blocks each, then
// the per-sample soemdsp_noise_generator_sample path, then a mid-run seed change.
extern "C" int probe_render_noise() {
  gCount = 0;
  const double shapes[] = {0.0, 0.5, 1.0};
  const double seeds[] = {0.0, 1.0, 12345.0, 16777215.0};
  const double devs[] = {0.0, 0.3, 1.0};
  for (int path = 0; path < 3; path += 1) {
    for (int mode = 0; mode <= 4; mode += 1) {
      for (int si = 0; si < 3; si += 1) {
        for (int ki = 0; ki < 4; ki += 1) {
          for (int di = 0; di < 3; di += 1) {
            const int h = soemdsp_noise_generator_create();
            if (path < 2) {
              for (int block = 0; block < 2; block += 1) {
                const int frames = block == 0 ? 64 : 37;
                soemdsp_noise_generator_process_block(h, seeds[ki], mode, 0.1, devs[di], shapes[si], 0.8, frames, path);
                const double* l = (const double*)(long)soemdsp_noise_generator_block_output_left_ptr(h);
                const double* r = (const double*)(long)soemdsp_noise_generator_block_output_right_ptr(h);
                for (int n = 0; n < frames; n += 1) { put(l[n]); put(r[n]); }
              }
            } else {
              for (int n = 0; n < 101; n += 1) {
                soemdsp_noise_generator_sample(h, seeds[ki], mode, 0.1, devs[di], shapes[si], 0.8);
                put(soemdsp_noise_generator_left(h));
                put(soemdsp_noise_generator_right(h));
              }
            }
            soemdsp_noise_generator_destroy(h);
          }
        }
      }
    }
  }
  for (int path = 0; path < 2; path += 1) {
    const int h = soemdsp_noise_generator_create();
    const double seq[] = {5.0, 5.0, 77.0, -3.0, 2.0e7, 5.0};
    for (int b = 0; b < 6; b += 1) {
      soemdsp_noise_generator_process_block(h, seq[b], 3, 0.0, 0.7, 0.25, 1.0, 48, path);
      const double* l = (const double*)(long)soemdsp_noise_generator_block_output_left_ptr(h);
      const double* r = (const double*)(long)soemdsp_noise_generator_block_output_right_ptr(h);
      for (int n = 0; n < 48; n += 1) { put(l[n]); put(r[n]); }
    }
    soemdsp_noise_generator_destroy(h);
  }
  return gCount;
}
