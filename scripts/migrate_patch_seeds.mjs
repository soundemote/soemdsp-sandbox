// One-time migration: write module Seeds + patch masterSeed into the repo's
// shipped patch files, so they no longer depend on the load-time fill-in.
//
//   node scripts/migrate_patch_seeds.mjs          # write changes
//   node scripts/migrate_patch_seeds.mjs --check  # dry run; exit 1 if any file would change
//
// Uses the app's real seeding code (loaded from public/ in a vm, in
// public/index.html script order): SoemMath.seedMix, nodeGraphSeedTextHash,
// nodeGraphSeedParamKeysForType (kind:"seed" params in
// node-graph-module-definitions.js), nodeGraphLegacyModuleSeed and
// validateNodeGraphPatch. Values written are exactly what the load-time
// fill-in computes (cross-checked against validateNodeGraphPatch per file).
//
// Rules: only INSERTS keys. Never touches an existing Seed (explicit 0 kept)
// or an existing masterSeed. Keeps indentation, key order, line endings and
// the trailing newline; each file is re-parsed after editing and must equal
// the original plus exactly the inserted keys. Re-running changes nothing.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
// masterSeed for a shipped patch = seedMix(fnv1a(relpath), MIGRATION_COMPONENT, 0).
const MIGRATION_COMPONENT = 0x4d53; // "MS"
// New-patch templates: they must keep NO masterSeed, so every new patch built
// from them still gets a fresh random master seed at load (Seeds are written).
const NEW_PATCH_TEMPLATES = new Set([
  "patches/init.json",            // factory Init / no-working-patch boot
  "public/presets/default.json",  // "set as init" target (/api/presets/default)
]);

// ---------------------------------------------------------------------------
// Load the app's JS (index.html order) up to and including patch-core.
function loadApp() {
  const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)(?:\?[^"]*)?"/g)].map((m) => m[1]);
  const stop = srcs.findIndex((s) => s.endsWith("/node-graph-patch-core.js"));
  if (stop < 0) throw new Error("node-graph-patch-core.js not found in public/index.html");
  const stub = () => new Proxy(function stubFn() {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "length" ? 0 : stub()),
    apply: () => stub(),
    construct: () => stub(),
  });
  const quiet = { log() {}, info() {}, warn() {}, error() {}, debug() {}, trace() {}, group() {}, groupEnd() {}, groupCollapsed() {}, table() {}, time() {}, timeEnd() {} };
  const ctx = {
    console: quiet, crypto: globalThis.crypto, Math, Date, JSON, setTimeout() { return 0; }, clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {}, requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    document: stub(), navigator: { userAgent: "node" }, screen: { width: 1, height: 1 }, CSS: { escape: (s) => String(s) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: "", href: "", pathname: "/", hostname: "localhost" },
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.reject(new Error("no fetch in migration")),
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  let loadErrors = 0;
  for (const src of srcs.slice(0, stop + 1)) {
    const file = path.join(root, src.replace(/^\.\//, ""));
    if (!fs.existsSync(file)) continue;
    try {
      vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
    } catch {
      loadErrors += 1; // DOM-only boot code; seeding/validation scripts must load (checked below)
    }
  }
  const need = ["SoemMath", "nodeGraphModuleDefinitions", "nodeGraphSeedTextHash", "nodeGraphSeedParamKeysForType",
    "nodeGraphLegacyModuleSeed", "nodeGraphResolveModuleTypeAlias", "validateNodeGraphPatch"];
  const api = vm.runInContext(`({ ${need.map((n) => `${n}: typeof ${n} === "undefined" ? undefined : ${n}`).join(", ")} })`, ctx);
  for (const n of need) if (api[n] === undefined) throw new Error(`app global ${n} missing after load`);
  if (typeof api.SoemMath.seedMix !== "function") throw new Error("SoemMath.seedMix missing");
  return { api, loadErrors };
}

// ---------------------------------------------------------------------------
// Minimal JSON parser that records source offsets, for in-place insertion.
function locate(text) {
  let i = 0;
  const ws = () => { while (i < text.length && " \t\r\n".includes(text[i])) i += 1; };
  const str = () => {
    const s = i; i += 1;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i += 1;
    return JSON.parse(text.slice(s, i));
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === "{") {
      const node = { kind: "object", start: i, members: [] };
      i += 1; ws();
      if (text[i] === "}") { node.end = i; i += 1; return node; }
      for (;;) {
        ws();
        const keyStart = i;
        const key = str();
        ws(); i += 1; // :
        const v = value();
        node.members.push({ key, keyStart, valueEnd: i, value: v });
        ws();
        if (text[i] === ",") { i += 1; continue; }
        node.end = i; i += 1; return node; // }
      }
    }
    if (c === "[") {
      const node = { kind: "array", start: i, items: [] };
      i += 1; ws();
      if (text[i] === "]") { node.end = i; i += 1; return node; }
      for (;;) {
        node.items.push(value());
        ws();
        if (text[i] === ",") { i += 1; continue; }
        node.end = i; i += 1; return node;
      }
    }
    const s = i;
    if (c === '"') { str(); return { kind: "scalar", start: s }; }
    while (i < text.length && !",}] \t\r\n".includes(text[i])) i += 1;
    return { kind: "scalar", start: s };
  };
  const top = value();
  return top;
}

const lineIndentAt = (text, pos) => {
  const ls = text.lastIndexOf("\n", pos - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(ls));
  return m ? m[0] : "";
};

// Insert `"key": json` into object `obj` (located) after member index `afterIdx`
// (-1 = first). Matches the object's own layout (multi-line vs inline).
function planInsert(text, obj, afterIdx, key, json, eol) {
  const kv = `${JSON.stringify(key)}: ${json}`;
  const m = obj.members;
  if (!m.length) {
    throw new Error(`refusing to insert ${key} into an empty object at ${obj.start}`);
  }
  const multiline = /\n/.test(text.slice(obj.start, m[0].keyStart));
  if (multiline) {
    const indent = lineIndentAt(text, m[0].keyStart);
    if (afterIdx < 0) return { pos: m[0].keyStart, insert: `${kv},${eol}${indent}` };
    return { pos: m[afterIdx].valueEnd, insert: `,${eol}${indent}${kv}` };
  }
  const sep = /,\s/.test(text.slice(m[0].valueEnd, (m[1] || obj).keyStart ?? obj.end)) ? ", " : ",";
  const inlineKv = sep === "," ? `${JSON.stringify(key)}:${json}` : kv;
  if (afterIdx < 0) return { pos: m[0].keyStart, insert: `${inlineKv}${sep}` };
  return { pos: m[afterIdx].valueEnd, insert: `${sep}${inlineKv}` };
}

// ---------------------------------------------------------------------------
function shippedPatchFiles() {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.toLowerCase().endsWith(".json") && ent.name.toLowerCase() !== "index.json") out.push(p);
    }
  };
  walk(path.join(root, "patches"));                       // page patches (patches/index.json is the picker catalog)
  const saved = path.join(root, "saved-patches");         // bank/program demo patches (server /api/patches)
  if (fs.existsSync(saved)) for (const f of fs.readdirSync(saved)) if (f.toLowerCase().endsWith(".json")) out.push(path.join(saved, f));
  const preset = path.join(root, "public", "presets", "default.json"); // /api/presets/default
  if (fs.existsSync(preset)) out.push(preset);
  return out.map((p) => path.relative(root, p).split(path.sep).join("/")).sort();
}

const { api, loadErrors } = loadApp();
const SEED_MAX = api.SoemMath.SEED_MAX;
const files = shippedPatchFiles();
let changedFiles = 0;
let totalSeeds = 0;
let totalMasters = 0;
const report = [];
const problems = [];

for (const rel of files) {
  const full = path.join(root, rel);
  const text = fs.readFileSync(full, "utf8");
  let data;
  try { data = JSON.parse(text); } catch (err) { problems.push(`${rel}: not JSON (${err.message})`); continue; }
  if (!data || typeof data !== "object" || !Array.isArray(data.nodes)) { report.push(`skip ${rel} (not a node patch)`); continue; }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const top = locate(text);
  const nodesMember = top.members.find((m) => m.key === "nodes");
  const inserts = [];
  const expected = JSON.parse(text);
  const added = [];

  // Fill-in reference: what load-time validation assigns for missing Seeds.
  let validated = null;
  try {
    validated = api.validateNodeGraphPatch(JSON.parse(text));
  } catch (err) {
    problems.push(`${rel}: validateNodeGraphPatch threw (${err.message}); seeds computed directly`);
  }
  const validatedById = new Map((validated?.nodes || []).map((n) => [String(n.id), n]));

  nodesMember.value.items.forEach((nodeLoc, idx) => {
    const node = data.nodes[idx];
    if (!node || typeof node !== "object" || nodeLoc.kind !== "object") return;
    const type = api.nodeGraphResolveModuleTypeAlias(node.type);
    const keys = api.nodeGraphSeedParamKeysForType(type);
    if (!keys.length) return;
    const id = String(node.id || "").trim();
    const paramsMember = nodeLoc.members.find((m) => m.key === "params");
    if (!paramsMember || paramsMember.value.kind !== "object" || !node.params || typeof node.params !== "object") {
      problems.push(`${rel}: node ${id} (${type}) has no params object; left for the load-time fill-in`);
      return;
    }
    const params = node.params;
    const defKeys = (api.nodeGraphModuleDefinitions[type]?.parameters || []).map((p) => p.key);
    for (const key of keys) {
      if (Object.hasOwn(params, key)) continue; // never overwrite (explicit 0 included)
      const value = api.nodeGraphLegacyModuleSeed(id, key);
      if (!(Number.isInteger(value) && value >= 0 && value <= SEED_MAX)) throw new Error(`bad seed ${value}`);
      const vNode = validatedById.get(id);
      if (validated && vNode && Number(vNode.params?.[key]) !== value) {
        problems.push(`${rel}: node ${id}.${key} fill-in gave ${vNode.params?.[key]} but legacy seed is ${value}; not written`);
        continue;
      }
      // Position: after the nearest preceding definition-order key present, else first.
      const present = paramsMember.value.members.map((m) => m.key);
      const defIdx = defKeys.indexOf(key);
      let afterIdx = -1;
      for (let d = defIdx - 1; d >= 0 && afterIdx < 0; d -= 1) afterIdx = present.lastIndexOf(defKeys[d]);
      if (afterIdx < 0 && defIdx < 0) afterIdx = present.length - 1;
      inserts.push(planInsert(text, paramsMember.value, afterIdx, key, String(value), eol));
      expected.nodes[idx].params[key] = value;
      added.push(`${id}.${key}=${value}`);
    }
  });

  if (!Object.hasOwn(data, "masterSeed") && !NEW_PATCH_TEMPLATES.has(rel)) {
    const master = api.SoemMath.seedMix(api.nodeGraphSeedTextHash(rel), MIGRATION_COMPONENT, 0) >>> 0;
    const present = top.members.map((m) => m.key);
    // Saved-patch key order puts masterSeed right after info (else before nodes).
    let afterIdx = present.indexOf("info");
    if (afterIdx < 0) afterIdx = Math.max(-1, present.indexOf("nodes") - 1);
    inserts.push(planInsert(text, top, afterIdx, "masterSeed", String(master), eol));
    expected.masterSeed = master;
    added.push(`masterSeed=${master}`);
    totalMasters += 1;
  }

  if (!inserts.length) continue;
  inserts.sort((a, b) => b.pos - a.pos);
  let out = text;
  for (const ins of inserts) out = out.slice(0, ins.pos) + ins.insert + out.slice(ins.pos);
  // Safety: result must parse and equal original + inserted keys (no other change).
  const reparsed = JSON.parse(out);
  if (JSON.stringify(reparsed) !== JSON.stringify(sortDeep(expected)) && JSON.stringify(sortDeep(reparsed)) !== JSON.stringify(sortDeep(expected))) {
    problems.push(`${rel}: edited text does not match expected structure; not written`);
    continue;
  }
  if (out.length - text.length !== inserts.reduce((n, x) => n + x.insert.length, 0)) throw new Error(`${rel}: length check failed`);
  // Validation of the migrated file must keep every written value.
  try {
    const v2 = api.validateNodeGraphPatch(JSON.parse(out));
    if (Object.hasOwn(reparsed, "masterSeed") && v2.masterSeed !== reparsed.masterSeed) problems.push(`${rel}: validate did not preserve masterSeed`);
    for (const n of reparsed.nodes) {
      const vn = (v2.nodes || []).find((x) => String(x.id) === String(n.id));
      if (!vn) continue;
      for (const key of api.nodeGraphSeedParamKeysForType(api.nodeGraphResolveModuleTypeAlias(n.type))) {
        if (Object.hasOwn(n.params || {}, key) && Number(vn.params[key]) !== Number(n.params[key])) {
          problems.push(`${rel}: validate changed ${n.id}.${key} ${n.params[key]} -> ${vn.params[key]}`);
        }
      }
    }
  } catch (err) {
    problems.push(`${rel}: validate of migrated file threw (${err.message})`);
  }
  totalSeeds += added.filter((a) => !a.startsWith("masterSeed=")).length;
  changedFiles += 1;
  report.push(`${checkOnly ? "would change" : "changed"} ${rel}: ${added.join(", ")}`);
  if (!checkOnly) fs.writeFileSync(full, out, "utf8");
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}

for (const line of report) console.log(line);
for (const p of problems) console.log(`WARN ${p}`);
console.log(`migrate_patch_seeds: ${files.length} patch files scanned, ${changedFiles} ${checkOnly ? "would change" : "changed"}, `
  + `${totalSeeds} Seeds + ${totalMasters} masterSeeds ${checkOnly ? "pending" : "written"} (app scripts loaded with ${loadErrors} DOM-only load errors)`);
if (checkOnly && changedFiles) process.exit(1);
