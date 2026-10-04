// Fail if an efficient-product module has a definition param that push() never binds.
// That hole is how Sweep MOD painted in JS and never reached native DSP.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeSrc = fs.readFileSync(
  path.join(root, "public", "node-live-audio-worklet-native-graph.js"),
  "utf8",
);
const defsSrc = fs.readFileSync(
  path.join(root, "public", "node-graph-module-definitions.js"),
  "utf8",
);
const effSrc = fs.readFileSync(
  path.join(root, "public", "node-graph-efficient-product.js"),
  "utf8",
);

function discreteKeys(src) {
  const m = src.match(/NATIVE_GRAPH_DISCRETE_PARAMS = Object\.freeze\(\{([\s\S]*?)\}\)/);
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((x) => x[1]));
}

function efficientTypes() {
  const m = effSrc.match(/NODE_GRAPH_EFFICIENT_PRODUCT_AUDIO_TYPES = Object\.freeze\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("efficient product list not found");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function pushKeysByType(src) {
  const start = src.indexOf("const push = (key, paramId, value) => {");
  if (start < 0) throw new Error("push() bind loop not found");
  const slice = src.slice(start);
  const byType = new Map();
  const re = /if \(type === "([^"]+)"(?:\s*\|\|\s*type === "([^"]+)")*/g;
  let m;
  while ((m = re.exec(slice))) {
    const types = [m[1], m[2]].filter(Boolean);
    // Extend || type === "..." on the same if
    let head = slice.slice(m.index, m.index + 400);
    const extra = [...head.matchAll(/type === "([^"]+)"/g)].map((x) => x[1]);
    for (const t of extra) {
      if (!types.includes(t)) types.push(t);
    }
    const rest = slice.slice(m.index);
    const cont = rest.indexOf("\n    continue;");
    const block = cont >= 0 ? rest.slice(0, cont) : rest.slice(0, 4000);
    const keys = [...block.matchAll(/push\(\s*"([^"]+)"/g)].map((x) => x[1]);
    for (const t of types) {
      const set = byType.get(t) || new Set();
      for (const k of keys) set.add(k);
      byType.set(t, set);
    }
  }
  return byType;
}

function defParamKeys(src, type) {
  const needle = `\n  ${type}: {`;
  const i = src.indexOf(needle);
  if (i < 0) return null;
  let depth = 0;
  let start = -1;
  for (let p = i + 1; p < src.length; p++) {
    const c = src[p];
    if (c === "{") {
      if (depth === 0) start = p;
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const body = src.slice(start, p + 1);
        const paramsAt = body.indexOf("parameters:");
        if (paramsAt < 0) return [];
        const after = body.slice(paramsAt);
        return [...after.matchAll(/\bkey:\s*"([^"]+)"/g)].map((x) => x[1]);
      }
    }
  }
  return [];
}

const types = efficientTypes();
const pushed = pushKeysByType(nativeSrc);
const discrete = discreteKeys(nativeSrc);
const missing = [];
for (const type of types) {
  const have = pushed.get(type);
  if (!have || !have.size) continue;
  const keys = defParamKeys(defsSrc, type);
  if (keys == null) continue;
  for (const key of keys) {
    if (discrete.has(key)) continue;
    if (!have.has(key)) missing.push(`${type}.${key}`);
  }
}

const ALLOW_UNBOUND = new Set([
  "pingPongDelay.interpolation",
  "rasterRgb.width",
  "rasterRgb.height",
  "rasterRgb.scanSpeed",
  "rasterRgb.blur",
  "rasterRgb.glow",
  "rasterRgb.rasterRgbR",
  "rasterRgb.rasterRgbG",
  "rasterRgb.rasterRgbB",
  "curveEnvelopeMod.delayTrigger",
  "smoothGraph.lockEndpointY",
  "smoothGraph.steps",
  "stepGraph.lockEndpointY",
  "stepGraph.steps",
  "chebyshev.bandwidth",
  "elliptic.bandwidth",
  "delayEffect.modStyle",
  "delayEffect.interpolation",
  "soemReverb.timeNumerator",
  "soemReverb.timeDenominator",
  "soemReverb.offsetMs",
  "radar.ringcut",
  "radar.pow1Up",
  "radar.pow1Down",
  "radar.pow2Bend",
  "radar.phaseInv",
  "radar.tunnelInv",
  "radar.spiralReturn",
  "phosphillator.smoothing",
]);

const novel = missing.filter((row) => !ALLOW_UNBOUND.has(row));
const staleAllow = [...ALLOW_UNBOUND].filter((row) => !missing.includes(row));
if (novel.length) {
  console.error("New unbound native params (would silent-drop ParamModEdge):");
  for (const row of novel) console.error("  " + row);
  process.exit(1);
}
if (staleAllow.length) {
  console.error("ALLOW_UNBOUND entries are now bound; remove them from the smoke:");
  for (const row of staleAllow) console.error("  " + row);
  process.exit(1);
}
console.log("native param id smoke OK", {
  types: types.length,
  allowedUnbound: ALLOW_UNBOUND.size,
});
