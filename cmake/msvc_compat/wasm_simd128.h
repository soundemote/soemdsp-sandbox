// Scalar stub of <wasm_simd128.h> for MSVC / Visual Studio IntelliSense.
// NOT bit-identical to real wasm SIMD128 — enough for the three sandbox
// modules that include this header (sabrina_reverb, noise_generator,
// fractal_brownian_noise) to compile under MSVC for editing.
#pragma once

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>

struct v128_t {
  union {
    double f64[2];
    float f32[4];
    std::int32_t i32[4];
    std::uint32_t u32[4];
    std::int64_t i64[2];
    std::uint8_t u8[16];
  };
};

inline v128_t wasm_f64x2_make(double a, double b) {
  v128_t v{};
  v.f64[0] = a;
  v.f64[1] = b;
  return v;
}
inline v128_t wasm_f64x2_splat(double x) { return wasm_f64x2_make(x, x); }
inline v128_t wasm_f64x2_add(v128_t a, v128_t b) {
  return wasm_f64x2_make(a.f64[0] + b.f64[0], a.f64[1] + b.f64[1]);
}
inline v128_t wasm_f64x2_sub(v128_t a, v128_t b) {
  return wasm_f64x2_make(a.f64[0] - b.f64[0], a.f64[1] - b.f64[1]);
}
inline v128_t wasm_f64x2_mul(v128_t a, v128_t b) {
  return wasm_f64x2_make(a.f64[0] * b.f64[0], a.f64[1] * b.f64[1]);
}
inline v128_t wasm_f64x2_div(v128_t a, v128_t b) {
  return wasm_f64x2_make(a.f64[0] / b.f64[0], a.f64[1] / b.f64[1]);
}
inline v128_t wasm_f64x2_abs(v128_t a) {
  return wasm_f64x2_make(std::fabs(a.f64[0]), std::fabs(a.f64[1]));
}
inline v128_t wasm_f64x2_floor(v128_t a) {
  return wasm_f64x2_make(std::floor(a.f64[0]), std::floor(a.f64[1]));
}
inline v128_t wasm_f64x2_pmin(v128_t a, v128_t b) {
  return wasm_f64x2_make(std::min(a.f64[0], b.f64[0]), std::min(a.f64[1], b.f64[1]));
}
inline v128_t wasm_f64x2_pmax(v128_t a, v128_t b) {
  return wasm_f64x2_make(std::max(a.f64[0], b.f64[0]), std::max(a.f64[1], b.f64[1]));
}

inline v128_t wasm_i32x4_make(std::int32_t a, std::int32_t b, std::int32_t c, std::int32_t d) {
  v128_t v{};
  v.i32[0] = a;
  v.i32[1] = b;
  v.i32[2] = c;
  v.i32[3] = d;
  return v;
}
inline v128_t wasm_i32x4_splat(std::int32_t x) { return wasm_i32x4_make(x, x, x, x); }
inline v128_t wasm_i32x4_add(v128_t a, v128_t b) {
  return wasm_i32x4_make(a.i32[0] + b.i32[0], a.i32[1] + b.i32[1], a.i32[2] + b.i32[2], a.i32[3] + b.i32[3]);
}
inline v128_t wasm_i32x4_mul(v128_t a, v128_t b) {
  return wasm_i32x4_make(a.i32[0] * b.i32[0], a.i32[1] * b.i32[1], a.i32[2] * b.i32[2], a.i32[3] * b.i32[3]);
}
inline v128_t wasm_u32x4_shr(v128_t a, int shift) {
  const unsigned s = static_cast<unsigned>(shift) & 31u;
  v128_t v{};
  v.u32[0] = a.u32[0] >> s;
  v.u32[1] = a.u32[1] >> s;
  v.u32[2] = a.u32[2] >> s;
  v.u32[3] = a.u32[3] >> s;
  return v;
}

inline v128_t wasm_v128_xor(v128_t a, v128_t b) {
  v128_t v{};
  for (int i = 0; i < 16; ++i) v.u8[i] = static_cast<std::uint8_t>(a.u8[i] ^ b.u8[i]);
  return v;
}
inline void wasm_v128_store(void* ptr, v128_t v) {
  std::memcpy(ptr, &v, sizeof(v128_t));
}
inline v128_t wasm_v128_load(const void* ptr) {
  v128_t v{};
  std::memcpy(&v, ptr, sizeof(v128_t));
  return v;
}
