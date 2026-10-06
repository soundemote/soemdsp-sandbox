// Headless: Vactrol Model (ModelA / ModelB), native vactrol_envelope + graph type 156.
// 1) ModelA is bit-identical to the original formula (one-pole + fast dsp_pow),
//    checked against an exact reference of the pre-Model code.
// 2) ModelB: release slows as it darkens, longer light lengthens the release,
//    and it reaches exactly 0 within a few seconds at default knobs.
// 3) Graph: waveform Control (param 11) selects the model; default = ModelA.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;

function must(name) {
  const fn = e[name];
  if (typeof fn !== "function") throw new Error(`missing export ${name}`);
  return fn;
}
const vCreate = must("soemdsp_vactrol_envelope_create");
const vDestroy = must("soemdsp_vactrol_envelope_destroy");
const vSample = must("soemdsp_vactrol_envelope_sample");
const vVersion = must("soemdsp_vactrol_envelope_version");
if ((vVersion() | 0) < 3) throw new Error(`vactrol version ${vVersion()} < 3`);

// ---- exact reference of the original (ModelA) code ----
const dv = new DataView(new ArrayBuffer(8));
function fastPow(base, exponent) {
  if (base <= 0) return 0;
  dv.setFloat64(0, base, true);
  const hi = dv.getInt32(4, true);
  let t = Math.trunc(exponent * (hi - 1072632447) + 1072632447.0);
  if (t > 2147483647) t = 2147483647;
  if (t < -2147483648) t = -2147483648;
  dv.setInt32(4, t, true);
  dv.setInt32(0, 0, true);
  return dv.getFloat64(0, true);
}
function expSquaring(x) {
  const y = x * 0.25;
  let t = 1.0 + y * (1.0 + y * (0.5 + y * (1.0 / 6.0 + y * (1.0 / 24.0 + y * (1.0 / 120.0 + y * (1.0 / 720.0 + y / 5040.0))))));
  t *= t; t *= t;
  return t;
}
function coef(seconds, sr) {
  if (!(seconds > 0)) return 1;
  let samples = seconds * (sr < 1 ? 1 : sr);
  if (samples < 1) samples = 1;
  return 1 - expSquaring(-1 / samples);
}
const safe = (x) => (Number.isFinite(x) ? x : 0);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
function modelARef(st, light, attack, release, curve, sens, sr) {
  const a = attack > 0 ? attack : 0;
  const r = release > 0 ? release : 0;
  const c = curve > 0.001 ? curve : 0.001;
  const g = sens > 0 ? sens : 0;
  const rate = sr < 1 ? 1 : sr;
  const target = clamp(safe(light) * g, 0, 1);
  const k = target > st.raw ? coef(a, rate) : coef(r, rate);
  st.raw = safe(st.raw + (target - st.raw) * k);
  return safe(clamp(fastPow(clamp(st.raw, 0, 1), c), 0, 1));
}

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const SR = 48000;
const sequences = [
  { name: "gate", attack: 0.01, release: 0.1, curve: 1, sens: 1, light: (n) => (n < 0.2 * SR ? 1 : 0), len: 0.7 * SR },
  { name: "noise", attack: 0.005, release: 0.05, curve: 2, sens: 0.8, light: () => rnd() * 1.5, len: 0.5 * SR },
  { name: "ramp", attack: 0, release: 0.3, curve: 0.5, sens: 1.3, light: (n) => (n % 9600) / 9600, len: 0.6 * SR },
];
for (const sq of sequences) {
  const h = vCreate() | 0;
  const st = { raw: 0 };
  for (let n = 0; n < sq.len; n++) {
    const L = sq.light(n);
    const want = modelARef(st, L, sq.attack, sq.release, sq.curve, sq.sens, SR);
    const got = vSample(h, L, sq.attack, sq.release, sq.curve, sq.sens, 0, SR);
    if (!Object.is(got, want)) throw new Error(`ModelA ${sq.name} n=${n} got=${got} want=${want}`);
  }
  vDestroy(h);
  console.log(`ok ModelA ${sq.name}: ${sq.len} samples bit-identical`);
}

// ---- release timing (defaults: attack 0, release 0.1, curve 1, sensitivity 1) ----
function release(model, holdSeconds) {
  const h = vCreate() | 0;
  const hold = Math.round(holdSeconds * SR);
  for (let n = 0; n < hold; n++) vSample(h, 1, 0, 0.1, 1, 1, model, SR);
  let tHalf = null, t1e3 = null, tZero = null;
  for (let n = 0; n < 30 * SR; n++) {
    const y = vSample(h, 0, 0, 0.1, 1, 1, model, SR);
    const t = (n + 1) / SR;
    if (tHalf === null && y <= 0.5) tHalf = t;
    if (t1e3 === null && y < 0.001) t1e3 = t;
    if (y === 0) { tZero = t; break; }
  }
  vDestroy(h);
  return { tHalf, t1e3, tZero };
}
const fmt = (r) => `half=${r.tHalf?.toFixed(4)}s to0.001=${r.t1e3?.toFixed(3)}s exact0=${r.tZero === null ? "never(30s)" : r.tZero.toFixed(3) + "s"}`;
const aBlip = release(0, 0.01), aHeld = release(0, 2);
const bBlip = release(1, 0.01), bHeld = release(1, 2);
console.log(`ModelA blip ${fmt(aBlip)} | held ${fmt(aHeld)}`);
console.log(`ModelB blip ${fmt(bBlip)} | held ${fmt(bHeld)}`);

const plainRatio = Math.log(500) / Math.log(2); // plain exponential: t(0.5->0.001) / t(1->0.5)
const bRatio = (bBlip.t1e3 - bBlip.tHalf) / bBlip.tHalf;
console.log(`tail ratio t(0.5->0.001)/t(1->0.5): plain exp=${plainRatio.toFixed(2)} ModelB=${bRatio.toFixed(1)}`);
if (!(bRatio > 3 * plainRatio)) throw new Error(`ModelB release not level-dependent enough (${bRatio})`);
if (!(bHeld.t1e3 > 1.3 * bBlip.t1e3)) throw new Error(`ModelB memory effect missing (held ${bHeld.t1e3} vs blip ${bBlip.t1e3})`);
if (!(bHeld.tHalf > 1.5 * bBlip.tHalf)) throw new Error(`ModelB memory effect missing at half (held ${bHeld.tHalf} vs blip ${bBlip.tHalf})`);
if (!(bBlip.t1e3 < 3)) throw new Error(`ModelB blip too slow to 0.001 (${bBlip.t1e3})`);
if (!(bHeld.t1e3 < 5)) throw new Error(`ModelB held too slow to 0.001 (${bHeld.t1e3})`);
if (bBlip.tZero === null || !(bBlip.tZero < 6)) throw new Error(`ModelB blip never reached exact 0 (${bBlip.tZero})`);
if (bHeld.tZero === null || !(bHeld.tZero < 8)) throw new Error(`ModelB held never reached exact 0 (${bHeld.tZero})`);
// ModelB attack: attack 0 snaps to full light.
{
  const h = vCreate() | 0;
  const y = vSample(h, 1, 0, 0.1, 1, 1, 1, SR);
  vDestroy(h);
  if (y !== 1) throw new Error(`ModelB attack 0 should snap to 1, got ${y}`);
}

// ---- graph: waveform Control selects the model ----
const create = must("soemdsp_graph_create");
const destroy = must("soemdsp_graph_destroy");
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const compile = must("soemdsp_graph_compile");
const processBlock = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const version = must("soemdsp_graph_version");
if ((version() | 0) < 158) throw new Error(`graph version ${version()} < 158 (Vactrol Model missing)`);

function graphRun(model) {
  const g = create() | 0;
  setSr(g, 48000);
  const hClk = 0x7a01 >>> 0, hV = 0x7a02 >>> 0, hOut = 0x7a03 >>> 0;
  if ((add(g, hClk, 28) | 0) !== 0) throw new Error("clock add");
  if ((add(g, hV, 156) | 0) !== 0) throw new Error("vactrol add");
  if ((add(g, hOut, 6) | 0) !== 0) throw new Error("out add");
  connect(g, hClk, 0, hV, 0);
  connect(g, hV, 0, hOut, 0);
  setParam(g, hClk, 10, 4); // 4 Hz gate
  if (model !== null) setParam(g, hV, 11, model);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  const out = [];
  for (let q = 0; q < 300; q++) {
    processBlock(g, 128);
    const buf = new Float64Array(e.memory.buffer, portPtr(g, hV, 0) | 0, 128);
    for (let i = 0; i < 128; i++) out.push(buf[i]);
  }
  destroy(g);
  return out;
}
const gDefault = graphRun(null), gA = graphRun(0), gB = graphRun(1);
const same = (x, y) => x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
if (!same(gDefault, gA)) throw new Error("graph default should equal ModelA");
if (same(gA, gB)) throw new Error("graph ModelB should differ from ModelA");
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
if (!(peak(gB) > 0.5 && peak(gB) <= 1)) throw new Error(`graph ModelB peak ${peak(gB)}`);
console.log(`ok graph: default == ModelA, ModelB differs (peakA=${peak(gA).toFixed(3)} peakB=${peak(gB).toFixed(3)})`);
console.log("vactrol model smoke ok");
