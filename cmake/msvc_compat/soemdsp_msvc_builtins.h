// MSVC / Visual Studio IDE compatibility for soemdsp native_modules.
// Force-included when SOEMDSP_MSVC_COMPAT is on (see root CMakeLists.txt).
//
// Production audio builds remain: scripts/build_native_modules.ps1
// (clang++ --target=wasm32). These macros only exist so MSVC can parse and
// compile most modules for IntelliSense / host-side smoke builds.
#pragma once

#if defined(_MSC_VER)

#include <cmath>
#include <cstdint>
#include <cstdlib>

#ifndef __builtin_floor
#define __builtin_floor(x) std::floor(static_cast<double>(x))
#endif
#ifndef __builtin_trunc
#define __builtin_trunc(x) std::trunc(static_cast<double>(x))
#endif
#ifndef __builtin_sqrt
#define __builtin_sqrt(x) std::sqrt(static_cast<double>(x))
#endif
#ifndef __builtin_fabs
#define __builtin_fabs(x) std::fabs(static_cast<double>(x))
#endif
#ifndef __builtin_sin
#define __builtin_sin(x) std::sin(static_cast<double>(x))
#endif

// WASM linear-memory builtins — stubbed for host IDE builds only.
// Modules that grow memory (audio_player, sample_player, ping_pong_delay)
// will not behave like the real wasm32 binary under MSVC.
inline std::size_t __builtin_wasm_memory_size(int /*memidx*/) { return 0; }
inline std::size_t __builtin_wasm_memory_grow(int /*memidx*/, std::size_t /*delta*/) {
  return static_cast<std::size_t>(-1);
}

#endif // _MSC_VER
