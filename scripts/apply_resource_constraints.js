/**
 * Tag module parameters whose higher values increase resource usage.
 * constraint: "cpu" | "gpu" | "ram"
 *
 * Rules of thumb:
 *   cpu — more arithmetic per sample / analysis work (voices, stages, order, fft, rays)
 *   ram — larger buffers / delay memory primarily (window/history sample counts)
 *   gpu — work that scales on GPU path (gpu additive harmonics already tagged)
 *
 * Skip pure tonal params (frequency, cutoff, q, mix, depth as modulation amount).
 */
const fs = require("fs");
const path = "public/node-graph-module-definitions.js";
let src = fs.readFileSync(path, "utf8");

// Explicit (moduleType, paramKey) → constraint. Prefer this list over heuristics.
const TAGS = [
  // Oscillators / banks
  ["additiveOsc", "harmonics", "cpu"],
  ["gpuAdditiveOsc", "harmonics", "gpu"],
  ["robinSupersaw", "voices", "cpu"],
  ["hypersaw", "voices", "cpu"],
  ["snowflake", "iterations", "cpu"],
  ["mushroom", "numMushrooms", "cpu"],
  ["pulseExplosion", "numberOfPulses", "cpu"],
  ["phaseDisperse", "filters", "cpu"],
  // Filters — cascade order / stages
  ["butterworth", "order", "cpu"],
  ["linkwitzRiley", "order", "cpu"],
  ["bessel", "order", "cpu"],
  ["chebyshev", "order", "cpu"],
  ["elliptic", "order", "cpu"],
  ["papoulis", "order", "cpu"],
  ["crossover2", "order", "cpu"],
  ["crossover3", "order", "cpu"],
  ["crossover4", "order", "cpu"],
  ["crossover5", "order", "cpu"],
  ["crossover6", "order", "cpu"],
  ["cookbookFilter", "stages", "cpu"],
  ["ladderFilter", "stages", "cpu"],
  ["phaser", "stages", "cpu"],
  ["chorus", "voices", "cpu"],
  // Analysis / spectral
  ["stftBlur", "fftSize", "cpu"],
  ["helmholtzPitch", "windowSize", "cpu"],
  // Spatial / multi-path
  ["wallDelay", "rayCount", "cpu"],
  ["wallDelay", "bounceCount", "cpu"],
  ["soemReverb", "numDelays", "cpu"],
  ["soemReverb", "lpfStages", "cpu"],
  ["soemReverb", "bandStages", "cpu"],
  // Display / capture buffers (sample history size)
  ["videoscope", "timeDivSamples", "ram"],
  // Visual density (more cells / stamps → GPU face cost)
  ["matrixWaterfall", "density", "gpu"],
  ["matrixDisplay", "density", "gpu"],
  ["asciiscope", "density", "gpu"],
  // Jerobeam-style XY path density (more points per cycle → more audio-rate work)
  ["spiral", "density", "cpu"],
  ["wirdoSpiral", "density", "cpu"],
  ["wirdoSpiral", "splashDensity", "cpu"],
  ["boing", "density", "cpu"],
  ["torus", "density", "cpu"],
  ["torus", "subdensity", "cpu"],
  ["radar", "density", "cpu"],
  ["mushroom", "density", "cpu"],
];

// Build module → key → constraint map
const byMod = new Map();
for (const [mod, key, constraint] of TAGS) {
  if (!byMod.has(mod)) byMod.set(mod, new Map());
  byMod.get(mod).set(key, constraint);
}

/**
 * Find module definition block and tag parameters.
 * Module form: `  name: {` at indent 2, parameters array inside.
 */
function findModuleRange(source, modName) {
  const re = new RegExp(`^  ${modName}: \\{\\s*$`, "m");
  const m = re.exec(source);
  if (!m) return null;
  const start = m.index;
  // Find matching close at indent 2 `  },` or `  }`
  let i = start + m[0].length;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }
  return { start, end: i };
}

function ensureConstraintOnParamObject(objText, constraint) {
  if (/\bconstraint\s*:\s*["'](cpu|gpu|ram)["']/.test(objText)) {
    // Replace existing if different
    return objText.replace(
      /\bconstraint\s*:\s*["'](cpu|gpu|ram)["']/,
      `constraint: "${constraint}"`,
    );
  }
  // Insert after opening `{` / first newline, prefer right after `{` on multi-line objects
  // Pattern A: multi-line `{` then properties
  if (/^\s*\{\s*\n/.test(objText)) {
    return objText.replace(/^\s*\{\s*\n/, (open) => `${open}        constraint: "${constraint}",\n`);
  }
  // Pattern B: single-line `{ key: ... }`
  if (/^\s*\{/.test(objText)) {
    return objText.replace(/^\s*\{/, `{ constraint: "${constraint}",`);
  }
  return objText;
}

/**
 * Within a module block, find parameter object containing key: "foo"
 * and inject constraint. Handles nested braces carefully.
 */
function tagKeyInModuleBlock(block, key, constraint) {
  const keyRe = new RegExp(`key:\\s*"${key}"`);
  const keyMatch = keyRe.exec(block);
  if (!keyMatch) {
    return { block, ok: false, reason: "key not found" };
  }
  // Walk back to the `{` that opens this parameter object
  let pos = keyMatch.index;
  let bracePos = -1;
  let depth = 0;
  for (let i = pos; i >= 0; i -= 1) {
    const ch = block[i];
    if (ch === "}") depth += 1;
    else if (ch === "{") {
      if (depth === 0) {
        bracePos = i;
        break;
      }
      depth -= 1;
    }
  }
  if (bracePos < 0) {
    return { block, ok: false, reason: "open brace not found" };
  }
  // Walk forward to matching close
  depth = 0;
  let endPos = -1;
  for (let i = bracePos; i < block.length; i += 1) {
    const ch = block[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        endPos = i + 1;
        break;
      }
    }
  }
  if (endPos < 0) {
    return { block, ok: false, reason: "close brace not found" };
  }
  const obj = block.slice(bracePos, endPos);
  const next = ensureConstraintOnParamObject(obj, constraint);
  if (next === obj && /\bconstraint\s*:/.test(obj)) {
    return { block, ok: true, reason: "already tagged" };
  }
  const newBlock = block.slice(0, bracePos) + next + block.slice(endPos);
  return { block: newBlock, ok: true, reason: next !== obj ? "tagged" : "unchanged" };
}

const report = [];
for (const [mod, keys] of byMod) {
  const range = findModuleRange(src, mod);
  if (!range) {
    report.push({ mod, status: "MODULE_NOT_FOUND" });
    continue;
  }
  let block = src.slice(range.start, range.end);
  for (const [key, constraint] of keys) {
    const result = tagKeyInModuleBlock(block, key, constraint);
    block = result.block;
    report.push({
      mod,
      key,
      constraint,
      status: result.ok ? result.reason : `FAIL: ${result.reason}`,
    });
  }
  src = src.slice(0, range.start) + block + src.slice(range.end);
}

fs.writeFileSync(path, src);
console.log(report.map((r) =>
  r.key
    ? `${String(r.status).padEnd(16)} ${r.constraint || "-"} ${r.mod}.${r.key}`
    : `${r.status} ${r.mod}`,
).join("\n"));
console.log("\nDone. Wrote", path);
