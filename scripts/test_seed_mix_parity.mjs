// seed_mix / seed_to_rng_state parity: C++ (library/include/soemdsp/math/seed.h,
// compiled to wasm with the repo's clang) vs JS twin (public/lib/math/soem-math.js).
// Usage: node scripts/test_seed_mix_parity.mjs
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clangCandidates = [
  process.env.SOEMDSP_CLANG,
  "C:\\Program Files\\LLVM\\bin\\clang++.exe",
  "/usr/bin/clang++",
].filter(Boolean);
const clang = clangCandidates.find((p) => fs.existsSync(p));
if (!clang) throw new Error(`clang++ not found (tried ${clangCandidates.join(", ")})`);

const wasmPath = path.join(os.tmpdir(), "seed_mix_parity_probe.wasm");
const exportsList = ["probe_seed_mix", "probe_seed_mix2", "probe_seed_to_rng_state", "probe_seed_param_u32"];
execFileSync(clang, [
  "--target=wasm32", "-O2", "-nostdlib", "-fno-exceptions", "-fno-rtti",
  `-I${path.join(root, "library", "include")}`,
  "-Wl,--no-entry",
  ...exportsList.map((e) => `-Wl,--export=${e}`),
  "-o", wasmPath,
  path.join(root, "scripts", "seed_mix_parity_probe.cpp"),
], { stdio: "inherit" });
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const c = instance.exports;

const sandbox = { globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "public", "lib", "math", "soem-math.js"), "utf8"), sandbox);
const SM = sandbox.globalThis.SoemMath;
if (!SM?.seedMix || !SM?.seedToRngState) throw new Error("SoemMath.seedMix / seedToRngState missing");

const u = (x) => x >>> 0;
const seeds = [0, 1, 2, 3, 7, 42, 255, 256, 1000, 65535, 65536, 99999, 123456, 16777215, 0x7FFFFFFF, 0x80000000, 0xDEADBEEF, 0xFFFFFFFE, 0xFFFFFFFF];
const comps = [0, 1, 2, 3, 4, 5, 15, 0x5EED, 0xFFFFFFFF];
const idx = [0, 1, 2, 3, 31, 63, 64, 1000, 0xFFFFFFFF];
let checked = 0;
let rngZero = 0;
for (const s of seeds) {
  for (const k of comps) {
    const a2 = u(c.probe_seed_mix2(s | 0, k | 0));
    const b2 = SM.seedMix(s, k);
    if (a2 !== b2) throw new Error(`seed_mix(${s},${k}) C++=${a2} JS=${b2}`);
    if (a2 !== u(c.probe_seed_mix(s | 0, k | 0, 0))) throw new Error("2-arg overload != index 0");
    for (const n of idx) {
      const a = u(c.probe_seed_mix(s | 0, k | 0, n | 0));
      const b = SM.seedMix(s, k, n);
      if (a !== b) throw new Error(`seed_mix(${s},${k},${n}) C++=${a} JS=${b}`);
      checked += 1;
    }
  }
  const ra = u(c.probe_seed_to_rng_state(s | 0));
  const rb = SM.seedToRngState(s);
  if (ra !== rb) throw new Error(`seed_to_rng_state(${s}) C++=${ra} JS=${rb}`);
  if (ra === 0) rngZero += 1;
  checked += 1;
}
// Pseudo-random sweep.
let x = 0x12345678;
for (let i = 0; i < 20000; i += 1) {
  x = u(Math.imul(x, 1664525) + 1013904223);
  const s = x; const k = u(x * 7 + i); const n = u(x ^ (i * 0x9E3779B9));
  const a = u(c.probe_seed_mix(s | 0, k | 0, n | 0));
  const b = SM.seedMix(s, k, n);
  if (a !== b) throw new Error(`sweep seed_mix(${s},${k},${n}) C++=${a} JS=${b}`);
  const ra = u(c.probe_seed_to_rng_state(a | 0));
  if (ra !== SM.seedToRngState(a)) throw new Error(`sweep seed_to_rng_state(${a})`);
  if (ra === 0) rngZero += 1;
  checked += 2;
}
if (rngZero) throw new Error(`seed_to_rng_state returned 0 ${rngZero} times`);
// The one preimage of 0 must map to the fixed constant on both sides.
// fmix32 is bijective; invert to find the input whose hash is 0: fmix32(0) = 0,
// so s ^ 0x5EED5EED == 0 -> s = 0x5EED5EED.
if (u(c.probe_seed_to_rng_state(0x5EED5EED | 0)) !== 0x6D2B79F5 || SM.seedToRngState(0x5EED5EED) !== 0x6D2B79F5) {
  throw new Error("zero-preimage substitution mismatch");
}
// Avalanche sanity: flipping one bit of each input changes ~16 output bits on average.
const pop = (v) => { let n = 0; v = u(v); while (v) { n += v & 1; v >>>= 1; } return n; };
for (const which of [0, 1, 2]) {
  let total = 0; const trials = 2000;
  for (let i = 0; i < trials; i += 1) {
    const s = u(i * 2654435761), k = u(i * 40503 + 3), n = u(i * 97 + 1);
    const bit = 1 << (i % 32);
    const base = SM.seedMix(s, k, n);
    const flip = which === 0 ? SM.seedMix(u(s ^ bit), k, n) : which === 1 ? SM.seedMix(s, u(k ^ bit), n) : SM.seedMix(s, k, u(n ^ bit));
    total += pop(base ^ flip);
  }
  const avg = total / trials;
  if (avg < 14 || avg > 18) throw new Error(`avalanche input ${which}: avg ${avg.toFixed(2)} bits`);
}
// seed_param_u32: explicit 0 stays 0; rounding; clamp.
const pcases = [[0, 0], [-1, 0], [NaN, 0], [0.4, 0], [0.5, 1], [1, 1], [41.6, 42], [16777215, 16777215], [3e9, 16777215]];
for (const [v, want] of pcases) {
  const got = u(c.probe_seed_param_u32(v));
  if (got !== want) throw new Error(`seed_param_u32(${v}) = ${got}, want ${want}`);
}
if (SM.SEED_MAX !== 16777215) throw new Error("SEED_MAX mismatch");
console.log(`seed_mix parity OK (${checked} C++/JS comparisons; seed_mix(0,1)=${SM.seedMix(0, 1)}, seed_to_rng_state(0)=${SM.seedToRngState(0)})`);
