# soemdsp-sandbox — Visual Studio / MSVC IDE project for native_modules
#
# Production WASM audio builds:  scripts/build_native_modules.ps1
#   (clang++ --target=wasm32 -nostdlib → per-module .wasm + combined)
#
# This CMake tree exists so you can open a .sln in Visual Studio for
# browsing, IntelliSense, and compiling what is practical under MSVC.
# Generate with:  generate_vs_project.bat  (repo root)

cmake_minimum_required(VERSION 3.20)
project(soemdsp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Keep MSBuild solution tidy
set_property(GLOBAL PROPERTY USE_FOLDERS ON)

option(SOEMDSP_MSVC_COMPAT
  "Force-include MSVC stubs for clang/wasm builtins and <wasm_simd128.h>"
  ON)

set(SOEMDSP_NATIVE_ROOT "${CMAKE_SOURCE_DIR}/native_modules")
set(SOEMDSP_LIBRARY_INCLUDE "${CMAKE_SOURCE_DIR}/library/include")
set(SOEMDSP_MATHS_DIR "${SOEMDSP_LIBRARY_INCLUDE}/soemdsp")
set(SOEMDSP_MSVC_COMPAT_DIR "${CMAKE_SOURCE_DIR}/cmake/msvc_compat")

# ---------------------------------------------------------------------------
# Header-only shared maths (browsing + include path for every module)
# ---------------------------------------------------------------------------
file(GLOB_RECURSE SOEMDSP_MATHS_HEADERS CONFIGURE_DEPENDS
  "${SOEMDSP_MATHS_DIR}/*.h"
  "${SOEMDSP_MATHS_DIR}/*.hpp"
)
add_library(sandbox_native_maths INTERFACE)
target_include_directories(sandbox_native_maths INTERFACE
  "${SOEMDSP_LIBRARY_INCLUDE}"
)

# Header-only INTERFACE libs do not always get a .vcxproj in the VS generator.
# Add an explicit browse target so maths headers appear in Solution Explorer.
set(_maths_browse_sources ${SOEMDSP_MATHS_HEADERS})
if(EXISTS "${SOEMDSP_NATIVE_ROOT}/flower_child_filter/originalcode/FlowerChildFilterCore.h")
  list(APPEND _maths_browse_sources
    "${SOEMDSP_NATIVE_ROOT}/flower_child_filter/originalcode/FlowerChildFilterCore.h"
  )
endif()
add_custom_target(sandbox_native_maths_headers
  SOURCES ${_maths_browse_sources}
  COMMENT "Browse library/include/soemdsp headers (header-only library)"
)
set_target_properties(sandbox_native_maths_headers PROPERTIES FOLDER "native_modules")
source_group(TREE "${SOEMDSP_MATHS_DIR}" PREFIX "soemdsp" FILES ${SOEMDSP_MATHS_HEADERS})

# ---------------------------------------------------------------------------
# MSVC / IDE compatibility (stubs only — not for shipping WASM)
# ---------------------------------------------------------------------------
add_library(soemdsp_msvc_compat INTERFACE)
if(SOEMDSP_MSVC_COMPAT AND (MSVC OR WIN32))
  target_include_directories(soemdsp_msvc_compat INTERFACE
    "${SOEMDSP_MSVC_COMPAT_DIR}"
  )
  target_compile_definitions(soemdsp_msvc_compat INTERFACE
    SOEMDSP_MSVC_COMPAT=1
  )
  if(MSVC)
    # Force-include builtins macros before any TU content.
    target_compile_options(soemdsp_msvc_compat INTERFACE
      "/FI${SOEMDSP_MSVC_COMPAT_DIR}/soemdsp_msvc_builtins.h"
    )
  endif()
endif()

# ---------------------------------------------------------------------------
# One STATIC lib per native module (Name/Name.cpp)
# Skips: combined (link artifacts), dirs
# without a matching .cpp.
# ---------------------------------------------------------------------------
set(SOEMDSP_MODULE_TARGETS "")
file(GLOB SOEMDSP_MODULE_DIRS LIST_DIRECTORIES true
  "${SOEMDSP_NATIVE_ROOT}/*"
)

foreach(_dir IN LISTS SOEMDSP_MODULE_DIRS)
  if(NOT IS_DIRECTORY "${_dir}")
    continue()
  endif()
  get_filename_component(_name "${_dir}" NAME)

  if(_name STREQUAL "combined")
    continue()
  endif()

  set(_cpp "${_dir}/${_name}.cpp")
  if(NOT EXISTS "${_cpp}")
    continue()
  endif()

  # CMake target names must be unique; module folder names already are.
  add_library(${_name} STATIC "${_cpp}")
  target_link_libraries(${_name} PUBLIC sandbox_native_maths)
  target_link_libraries(${_name} PRIVATE soemdsp_msvc_compat)
  set_target_properties(${_name} PROPERTIES
    FOLDER "native_modules"
    OUTPUT_NAME "soemdsp_${_name}"
  )

  # WASM sources treat linear-memory pointers as 32-bit ints; silence x64
  # pointer-truncation noise (C4311/C4312) under MSVC host builds.
  if(MSVC)
    target_compile_options(${_name} PRIVATE /wd4311 /wd4312)
  endif()

  # graph_engine.cpp nests blocks past MSVC's C1061 limit — keep the
  # .vcxproj for browsing/IntelliSense but exclude from default builds.
  if(_name STREQUAL "graph_engine")
    set_target_properties(${_name} PROPERTIES EXCLUDE_FROM_ALL TRUE)
    message(STATUS "soemdsp: graph_engine is browse-only under MSVC (C1061 nest limit)")
  else()
    list(APPEND SOEMDSP_MODULE_TARGETS ${_name})
  endif()
endforeach()

list(LENGTH SOEMDSP_MODULE_TARGETS _soemdsp_count)
message(STATUS "soemdsp: registered ${_soemdsp_count} native module target(s)")

# combined/shim.cpp — freestanding memset/memcpy for the wasm-ld combined link.
# Useful to browse; may not compile under MSVC without extras (kept optional).
if(EXISTS "${SOEMDSP_NATIVE_ROOT}/combined/shim.cpp")
  add_library(combined_shim STATIC
    "${SOEMDSP_NATIVE_ROOT}/combined/shim.cpp"
  )
  target_link_libraries(combined_shim PRIVATE soemdsp_msvc_compat)
  set_target_properties(combined_shim PROPERTIES FOLDER "native_modules/combined")
endif()

# Convenience meta-target: build every module lib (MSVC compile smoke).
if(SOEMDSP_MODULE_TARGETS)
  add_custom_target(soemdsp_all_modules
    DEPENDS ${SOEMDSP_MODULE_TARGETS}
    COMMENT "Build all soemdsp native module static libraries"
  )
  set_target_properties(soemdsp_all_modules PROPERTIES FOLDER "CMake")
endif()

# ---------------------------------------------------------------------------
# README target (docs only — shows caveats in Solution Explorer)
# ---------------------------------------------------------------------------
set(_vs_readme "${CMAKE_BINARY_DIR}/SOEMDSP_VS_README.txt")
file(WRITE "${_vs_readme}"
"soemdsp Visual Studio solution (generated)

What this is
  CMake → Visual Studio project covering native_modules/*.cpp plus
  library/include/soemdsp headers for browsing / IntelliSense / MSVC compile.

What this is NOT
  The production audio toolchain. Live WASM is built by:
    scripts\\build_native_modules.ps1
  (clang++ --target=wasm32 -nostdlib, then wasm-ld combined).

Caveats under MSVC
  - Three modules use <wasm_simd128.h>; cmake/msvc_compat provides scalar stubs
    (sabrina_reverb, noise_generator, fractal_brownian_noise). Not bit-identical
    to WASM SIMD.
  - __builtin_* and wasm memory grow/size are stubbed via force-include.
    audio_player / sample_player / ping_pong_delay memory.grow paths will not
    match the real wasm32 binary.
  - graph_engine is a static lib with many extern \"C\" refs to other natives;
    linking a host EXE would need those modules (or soemdsp_combined.wasm).
  - Sources were written freestanding (-nostdlib). Most still compile as
    ordinary C++17 static libs with the compat layer.
  - graph_engine: MSVC C1061 (blocks nested too deeply) — project is in the
    solution for browsing but excluded from soemdsp_all_modules / ALL_BUILD.

Regenerate
  Double-click generate_vs_project.bat at the repo root.
")
add_custom_target(soemdsp_vs_readme SOURCES "${_vs_readme}")
set_target_properties(soemdsp_vs_readme PROPERTIES FOLDER "CMake")
