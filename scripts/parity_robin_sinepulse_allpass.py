#!/usr/bin/env python3
"""Build and run the Robin Sinepulse Allpass parity harness (vs Robin Schmidt's rsFlatZapper).

Compiles scripts/parity_robin_sinepulse_allpass.cpp + scripts/parity_robin_sinepulse_allpass_port_probe.cpp
(which includes native_modules/robin_sinepulse_allpass/robin_sinepulse_allpass.cpp unchanged) with clang++ natively and
runs it. Exit code is the harness's: 0 = all parity and behaviour checks pass.

Needs a hosted C++ standard library (Robin's code uses <cfloat>, <vector>, ...).
The wasm-only LLVM install used by build_native_modules.ps1 has none, so on such a
machine this fails with "'cfloat' file not found"; run it on Linux/macOS (or with
a full MSVC/MinGW toolchain on Windows).
See docs/KICK_PLAN.md (Flat Zapper module (seed)).
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def find_clang():
    for name in ("clang++", "clang++.exe"):
        path = shutil.which(name)
        if path:
            return path
    win = r"C:\Program Files\LLVM\bin\clang++.exe"
    return win if os.path.exists(win) else None


def main():
    clang = find_clang()
    if not clang:
        print("clang++ not found")
        return 2
    out_dir = tempfile.mkdtemp(prefix="parity_robin_sinepulse_allpass_")
    exe = os.path.join(out_dir, "parity_robin_sinepulse_allpass" + (".exe" if os.name == "nt" else ""))
    cmd = [
        clang, "-std=c++17", "-O2",
        "-I", os.path.join(ROOT, "library", "include"),
        os.path.join(ROOT, "scripts", "parity_robin_sinepulse_allpass.cpp"),
        os.path.join(ROOT, "scripts", "parity_robin_sinepulse_allpass_port_probe.cpp"),
        "-o", exe,
    ]
    if os.name == "nt":
        cmd.insert(1, "-D_CRT_SECURE_NO_WARNINGS")
    build = subprocess.run(cmd)
    if build.returncode != 0:
        print("build failed")
        return build.returncode
    return subprocess.run([exe]).returncode


if __name__ == "__main__":
    sys.exit(main())
