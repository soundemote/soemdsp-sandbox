// Byte-for-byte regression for the APP_POLICY §19 library extraction
// (docs/SOFTPOP_PLAN.md §2): EQ Filter's TPT SVF -> soemdsp/filter/tpt_svf.h,
// Noise Generator's white/pink/brown -> soemdsp/math/noise_colors.h.
//
// Builds scripts/golden_eq_filter_noise_probe.cpp together with the module
// sources (production flags: wasm32 -O3 -msimd128), renders the fixed grid
// (EQ modes 0-9 x stages 1-4 x freq/Q/gain + per-sample sweeps + stage change;
// Noise modes 0-4 x shape x seed x deviation via scalar block, SIMD block and
// per-sample paths), and memcmp's the doubles against fixtures/golden/*.bin.
//
// Usage:
//   node scripts/test_tpt_svf_noise_colors_regression.mjs            (verify)
//   node scripts/test_tpt_svf_noise_colors_regression.mjs --capture  (write goldens;
//        refuses to overwrite existing ones unless --force is also given)
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capture = process.argv.includes("--capture");
const force = process.argv.includes("--force");
const clangCandidates = [
  process.env.SOEMDSP_CLANG,
  "C:\\Program Files\\LLVM\\bin\\clang++.exe",
  "/usr/bin/clang++",
].filter(Boolean);
const clang = clangCandidates.find((p) => fs.existsSync(p));
if (!clang) throw new Error(`clang++ not found (tried ${clangCandidates.join(", ")})`);

const wasmPath = path.join(os.tmpdir(), `golden_eq_filter_noise_probe_${process.pid}.wasm`);
const exportsList = ["probe_buffer_ptr", "probe_capacity", "probe_render_eq", "probe_render_noise"];
execFileSync(clang, [
  "--target=wasm32", "-O3", "-msimd128", "-nostdlib", "-fno-exceptions", "-fno-rtti",
  `-I${path.join(root, "library", "include")}`,
  "-Wl,--no-entry",
  ...exportsList.map((e) => `-Wl,--export=${e}`),
  "-Wl,--export-memory",
  "-o", wasmPath,
  path.join(root, "scripts", "golden_eq_filter_noise_probe.cpp"),
  path.join(root, "native_modules", "eq_filter", "eq_filter.cpp"),
  path.join(root, "native_modules", "noise_generator", "noise_generator.cpp"),
  path.join(root, "native_modules", "combined", "shim.cpp"),
], { stdio: "inherit" });
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
fs.rmSync(wasmPath, { force: true });
const x = instance.exports;

function render(fn) {
  const n = fn() | 0;
  const cap = x.probe_capacity() | 0;
  if (n > cap) throw new Error(`probe overflow ${n} > ${cap}`);
  const ptr = x.probe_buffer_ptr() >>> 0;
  return Buffer.from(new Uint8Array(x.memory.buffer, ptr, n * 8).slice());
}

const goldenDir = path.join(root, "fixtures", "golden");
const cases = [
  { name: "eq_filter_v2", fn: x.probe_render_eq },
  { name: "noise_generator", fn: x.probe_render_noise },
];
let failed = 0;
for (const c of cases) {
  const bytes = render(c.fn);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const binPath = path.join(goldenDir, `${c.name}.bin`);
  const shaPath = `${binPath}.sha256`;
  const doubles = new Float64Array(bytes.buffer, bytes.byteOffset, bytes.length / 8);
  let finite = 0;
  for (const v of doubles) if (Number.isFinite(v)) finite += 1;
  if (capture) {
    if (fs.existsSync(binPath) && !force) {
      throw new Error(`${binPath} exists; refusing to overwrite (use --capture --force)`);
    }
    fs.mkdirSync(goldenDir, { recursive: true });
    fs.writeFileSync(binPath, bytes);
    fs.writeFileSync(shaPath, `${sha}  ${c.name}.bin\n`);
    console.log(`captured ${c.name}: ${doubles.length} doubles (${finite} finite) sha256=${sha}`);
    continue;
  }
  if (!fs.existsSync(binPath)) throw new Error(`missing golden ${binPath} (run with --capture first)`);
  const golden = fs.readFileSync(binPath);
  const goldenSha = fs.readFileSync(shaPath, "utf8").trim().split(/\s+/)[0];
  const fileSha = crypto.createHash("sha256").update(golden).digest("hex");
  if (fileSha !== goldenSha) throw new Error(`${c.name}.bin does not match its .sha256 (corrupt fixture)`);
  if (golden.length !== bytes.length || Buffer.compare(golden, bytes) !== 0) {
    failed += 1;
    const g = new Float64Array(golden.buffer, golden.byteOffset, golden.length / 8);
    let first = -1;
    let diffs = 0;
    const n = Math.min(g.length, doubles.length);
    for (let i = 0; i < n; i += 1) {
      if (!Object.is(g[i], doubles[i]) && !(Number.isNaN(g[i]) && Number.isNaN(doubles[i]))) {
        diffs += 1;
        if (first < 0) first = i;
      }
    }
    console.error(`FAIL ${c.name}: len golden=${g.length} now=${doubles.length}, ${diffs} differing doubles, first at ${first} (golden ${g[first]} now ${doubles[first]})`);
    continue;
  }
  console.log(`ok ${c.name}: ${doubles.length} doubles byte-identical, sha256=${sha}`);
}
if (failed) process.exit(1);
