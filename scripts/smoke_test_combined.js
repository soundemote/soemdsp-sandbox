// Post-build smoke test for the combined native-module binary.
// Run by scripts/build_native_modules.ps1 right after wasm-ld links
// soemdsp_combined.wasm, so a missing export, a bad $modules entry, or a
// link regression fails the BUILD instead of surfacing as a runtime
// Module Diagnostics fault later (the keplerBouwkamp bug class, killed at
// the source).
//
// Usage: node smoke_test_combined.js <combined.wasm> <exports.rsp>
//   exports.rsp is the wasm-ld response file (--export=NAME per line) the
//   build already writes, so the expected-export list can never drift from
//   what the link was asked to do.
"use strict";
const fs = require("fs");

const [, , wasmPath, rspPath] = process.argv;
if (!wasmPath || !rspPath) {
  console.error("usage: node smoke_test_combined.js <combined.wasm> <exports.rsp>");
  process.exit(2);
}

const expected = fs
  .readFileSync(rspPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("--export="))
  .map((line) => line.slice("--export=".length));

(async () => {
  const bytes = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exportsObj = instance.exports;

  const missing = expected.filter((name) => !(name in exportsObj));
  if (missing.length) {
    console.error(`SMOKE FAIL: ${missing.length} expected export(s) missing:`);
    for (const name of missing.slice(0, 20)) console.error(`  ${name}`);
    process.exit(1);
  }

  // Every module ships a zero-argument _version() -- call each one. This
  // executes real code in every module's translation unit and proves the
  // shared-memory instance starts correctly for all of them.
  let versionCalls = 0;
  for (const name of expected) {
    if (!name.endsWith("_version")) continue;
    const fn = exportsObj[name];
    if (typeof fn !== "function") {
      console.error(`SMOKE FAIL: ${name} is exported but not callable`);
      process.exit(1);
    }
    const value = fn();
    if (!Number.isFinite(value)) {
      console.error(`SMOKE FAIL: ${name}() returned non-finite value: ${value}`);
      process.exit(1);
    }
    versionCalls += 1;
  }

  const memMb = (exportsObj.memory.buffer.byteLength / 1048576).toFixed(1);
  console.log(
    `smoke ok: ${expected.length} exports present, ${versionCalls} _version() calls finite, memory ${memMb}MB`,
  );
})().catch((error) => {
  console.error(`SMOKE FAIL: ${error && error.message ? error.message : error}`);
  process.exit(1);
});
