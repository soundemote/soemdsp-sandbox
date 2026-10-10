// Headless: Additive Generator Slope (Slope / Slope Start / Slope End / Skew / Curve).
// - Per-partial gains match the reference model
//     x = clamp((n - start) / max(end - start, 1e-9), 0, 1), amp *= 1 - slope * shape(x)
//   (Rational / Bipolar Rational). Start/End are harmonic numbers (cap 1024), not clamped to H.
// - The JS mirror (additiveGraphSlopeGain) matches the reference formula.
// - Partials the slope takes to 0 are dropped from the Graph tail.
// - Even / Odd waveforms; 0.75·Nyquist linear amp slope then silent at Nyquist; inaudible skip.
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
function must(name) {
  if (typeof e[name] !== "function") throw new Error(`missing export ${name}`);
  return e[name];
}
const create = must("soemdsp_graph_create");
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const compile = must("soemdsp_graph_compile");
const processBlock = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const version = must("soemdsp_graph_version");
const destroy = must("soemdsp_graph_destroy");
const yellowH = must("soemdsp_graph_yellow_harmonics");
const yellowAmp = must("soemdsp_graph_yellow_amplitude_ptr");
const yellowRatio = must("soemdsp_graph_yellow_ratio_ptr");

const ctx = { Math, Number, console };
ctx.nodeGraphFiniteNumber = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "public", "modules", "additiveGraph", "additive-graph-math.js"), "utf8"), ctx);
const jsSlopeGain = ctx.additiveGraphSlopeGain;
const jsRange = ctx.additiveGraphResolveSlopeRange;
const jsPartial = ctx.additiveGraphWaveformPartial;
const jsNyquistGain = ctx.additiveGraphNyquistAmpGain;
for (const [k, f] of Object.entries({ jsSlopeGain, jsRange, jsPartial, jsNyquistGain })) {
  if (typeof f !== "function") throw new Error(`${k} missing`);
}

const TYPE_GEN = 111, TYPE_OUT = 113;
const PORT_GRAPH = 23, PORT_MONO = 0;
const P = { FREQ: 10, WAVE: 11, AMP: 12, SHAPE: 13, PHASE: 14, RES: 20, MODE: 21, STAGES: 22, CENTER: 30, LFOSTYLE: 56, IN_LOW: 80, IN_HIGH: 81 };
const SR = 44100, F0 = 147.73642432161057, AMP = 0.8194501851112951;
const FLOOR = Math.pow(10, -96 / 20);
const hG = 0xb001, hO = 0xb002;

// Rational
function rationalMap(x, c) {
  const den = 2 * c * x - c + 1;
  if (Math.abs(den) < 1e-12) return x;
  return (c * x + x) / den;
}
function rational(x, skew) {
  return rationalMap(x, -skew);
}
function bipolarRational(x, skew) {
  const u = 2 * x - 1;
  const a = Math.abs(u);
  const r = rationalMap(a, skew);
  return (Math.sign(u) * r + 1) * 0.5;
}
// Slope
function refGain(n, c, start, end) {
  const x = Math.min(Math.max((n - start) / Math.max(end - start, 1e-9), 0), 1);
  const shape = c.curve === 1 ? bipolarRational(x, c.skew) : rational(x, c.skew);
  return 1 - c.slope * shape;
}
function refRange(c) {
  const n = Math.max(1, Math.round(c.harmonics));
  const cap = 1024;
  const start = Math.min(Math.max(c.start, 1), cap);
  const end = Math.max(Math.min(c.end, cap), start + 1e-6);
  return { start, end, n };
}

function build(c) {
  const g = create() | 0;
  setSr(g, SR);
  if ((add(g, hG, TYPE_GEN) | 0) !== 0) throw new Error("gen add");
  if ((add(g, hO, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((connect(g, hG, PORT_GRAPH, hO, PORT_GRAPH) | 0) !== 0) throw new Error("connect");
  setParam(g, hG, P.WAVE, c.waveform ?? 0); setParam(g, hG, P.SHAPE, 0); setParam(g, hG, P.STAGES, c.harmonics);
  setParam(g, hG, P.MODE, 1); setParam(g, hG, P.PHASE, 0);
  setParam(g, hG, P.CENTER, c.slope); setParam(g, hG, P.RES, c.skew); setParam(g, hG, P.LFOSTYLE, c.curve ?? 0);
  setParam(g, hG, P.IN_LOW, c.start ?? 1); setParam(g, hG, P.IN_HIGH, c.end ?? 1024);
  setParam(g, hO, P.FREQ, c.freq ?? F0); setParam(g, hO, P.AMP, c.amp ?? AMP);
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  return g;
}
function render(g, quanta) {
  const out = [];
  for (let q = 0; q < quanta; q++) {
    processBlock(g, 128);
    const v = new Float64Array(e.memory.buffer, portPtr(g, hO, PORT_MONO) | 0, 128);
    for (let i = 0; i < 128; i++) out.push(v[i]);
  }
  return out;
}
function graphOf(g, id) {
  const H = yellowH(g, id) | 0;
  const amp = Array.from(new Float32Array(e.memory.buffer, yellowAmp(g, id) | 0, Math.max(H, 1)).slice(0, H));
  const ratio = Array.from(new Float32Array(e.memory.buffer, yellowRatio(g, id) | 0, Math.max(H, 1)).slice(0, H));
  return { H, amp, ratio };
}
function rms(a, from) {
  let s = 0;
  for (let i = from; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / (a.length - from));
}

// Defaults
{
  const g = create() | 0;
  setSr(g, SR);
  add(g, hG, TYPE_GEN); add(g, hO, TYPE_OUT); connect(g, hG, PORT_GRAPH, hO, PORT_GRAPH);
  setParam(g, hG, P.STAGES, 32); setParam(g, hO, P.FREQ, F0);
  compile(g); snap(g); render(g, 4);
  const m = graphOf(g, hG);
  destroy(g);
  if (m.H !== 31) throw new Error(`defaults: Graph H=${m.H}, expected 31 (Skew 1 takes harmonic 32 to 0)`);
  console.log(`defaults (Slope 1, Skew 1, Start 1, End=Harmonics 32): Graph slots ${m.H}`);
}

const cases = [
  { name: "default slope h1024", slope: 1, skew: 1, start: 1, end: 1024, curve: 0, expectH: 1023 },
  { name: "linear half 1..32", slope: 0.5, skew: 0, start: 1, end: 32, curve: 0, expectH: 1024 },
  { name: "rational skew -0.6 3..40", slope: 1, skew: -0.6, start: 3, end: 40, curve: 0, expectH: 39 },
  { name: "bipolar 2.5..17.25", slope: 0.8, skew: 0.5, start: 2.5, end: 17.25, curve: 1, expectH: 1024 },
  { name: "bipolar skew -0.7 4..64", slope: 1, skew: -0.7, start: 4, end: 64, curve: 1, expectH: 63 },
  { name: "start above count", slope: 1, skew: 0, start: 2000, end: 10, curve: 0, expectH: 1024 },
  { name: "end below start", slope: 1, skew: 0, start: 20, end: 10, curve: 0, expectH: 20 },
];

const gOff = build({ harmonics: 1024, slope: 0, skew: 1 });
render(gOff, 4);
const full = graphOf(gOff, hG);
destroy(gOff);
if (full.H !== 1024) throw new Error(`unmasked H=${full.H}`);
for (let i = 0; i < 1024; i++) {
  if (Math.abs(full.amp[i] - 1 / (i + 1)) > 1e-6) throw new Error(`unmasked saw amp[${i}]=${full.amp[i]}`);
}

for (const c of cases) {
  const cc = { harmonics: 1024, ...c };
  const g = build(cc);
  render(g, 4);
  const m = graphOf(g, hG);
  const { start, end } = refRange(cc);
  const js = jsRange(cc.harmonics, cc.start, cc.end);
  if (Math.abs(js.start - start) > 1e-12 || Math.abs(js.end - end) > 1e-12) {
    throw new Error(`${c.name}: JS range ${js.start}..${js.end} != ${start}..${end}`);
  }
  let maxErr = 0, maxJsErr = 0, lastLive = 0;
  for (let i = 0; i < 1024; i++) {
    const r = full.ratio[i];
    let gain = refGain(r, c, start, end);
    const jsErr = Math.abs(jsSlopeGain(r, c.slope, start, end, c.skew, c.curve) - gain);
    if (jsErr > maxJsErr) maxJsErr = jsErr;
    if (!(gain >= FLOOR)) gain = 0;
    const want = full.amp[i] * gain;
    if (want > 0) lastLive = i + 1;
    const got = i < m.H ? m.amp[i] : 0;
    const err = Math.abs(got - want);
    if (err > maxErr) maxErr = err;
  }
  if (m.H !== lastLive) throw new Error(`${c.name}: Graph H=${m.H}, expected last survivor ${lastLive}`);
  if (m.H !== c.expectH) throw new Error(`${c.name}: Graph H=${m.H}, expected ${c.expectH}`);
  if (yellowH(g, hO) !== m.H) throw new Error(`${c.name}: Out H=${yellowH(g, hO)} != Generator H=${m.H}`);
  if (maxErr > 1e-5) throw new Error(`${c.name}: per-partial gain err ${maxErr}`);
  if (maxJsErr > 1e-12) throw new Error(`${c.name}: JS slope gain err ${maxJsErr}`);
  destroy(g);
  console.log(`${c.name}: Graph slots ${m.H}, native err ${maxErr.toExponential(2)}, JS err ${maxJsErr.toExponential(2)}`);
}

// Slope lands on Start / End
{
  const c = { harmonics: 64, slope: 0.5, skew: 0, start: 8, end: 24, curve: 0 };
  const g = build(c);
  render(g, 4);
  const m = graphOf(g, hG);
  destroy(g);
  const at = (n) => m.amp[n - 1] * n;
  if (Math.abs(at(8) - 1) > 1e-6) throw new Error(`gain at Start ${at(8)}`);
  if (Math.abs(at(16) - 0.75) > 1e-6) throw new Error(`gain at midpoint ${at(16)}`);
  if (Math.abs(at(24) - 0.5) > 1e-6) throw new Error(`gain at End ${at(24)}`);
  if (Math.abs(at(64) - 0.5) > 1e-6) throw new Error(`gain past End ${at(64)}`);
  console.log(`landing: Start ${at(8).toFixed(6)}, mid ${at(16).toFixed(6)}, End ${at(24).toFixed(6)}, past End ${at(64).toFixed(6)}`);
}

// Even / Odd
for (const [name, waveform] of [["Even", 7], ["Odd", 8]]) {
  const g = build({ harmonics: 9, slope: 0, skew: 1, waveform });
  render(g, 4);
  const m = graphOf(g, hG);
  destroy(g);
  for (let n = 1; n <= 9; n++) {
    const want = waveform === 7 ? (n === 1 || n % 2 === 0 ? 1 : 0) : (n % 2 === 1 ? 1 : 0);
    const got = n <= m.H ? m.amp[n - 1] : 0;
    if (Math.abs(got - want) > 1e-7) throw new Error(`${name}: amp[${n}]=${got}, expected ${want}`);
    if (Math.abs(jsPartial(waveform, n, 0).amplitude - want) > 1e-12) throw new Error(`${name}: JS amp[${n}] mismatch`);
  }
  console.log(`${name}: amps ${m.amp.map((v) => v.toFixed(0)).join(",")}`);
}

// Audio
{
  const gMask = build({ harmonics: 1024, slope: 1, skew: 0, start: 4, end: 4 });
  const gRef = build({ harmonics: 4, slope: 0, skew: 0 });
  const a = render(gMask, 40), b = render(gRef, 40);
  let maxErr = 0;
  for (let i = 128 * 4; i < a.length; i++) maxErr = Math.max(maxErr, Math.abs(a[i] - b[i]));
  const H = yellowH(gMask, hG) | 0;
  destroy(gMask); destroy(gRef);
  if (H !== 4) throw new Error(`brickwall slope Graph H=${H}`);
  if (maxErr > 1e-6) throw new Error(`slope render vs 4-partial render err ${maxErr}`);
  console.log(`audio: slope 1024→4 vs plain 4-partial render max err ${maxErr.toExponential(2)}`);
}

// Nyquist: full until 0.75·Nyquist, then linear 1→0 at Nyquist (nyquist_amp_gain).
{
  const hzIn = 0.8 * 0.5 * SR;
  const gainIn = jsNyquistGain(hzIn, SR);
  const want = (0.5 * gainIn) / Math.SQRT2;
  const gIn = build({ harmonics: 1, slope: 0, skew: 1, freq: hzIn, amp: 0.5 });
  const rIn = rms(render(gIn, 40), 128 * 5);
  destroy(gIn);
  if (!(gainIn > 0) || !(gainIn < 1)) throw new Error(`0.8·Nyquist gain ${gainIn}, expected in (0,1)`);
  if (Math.abs(rIn - want) > want * 0.01) throw new Error(`partial at 0.8·Nyquist rms ${rIn}, expected ${want}`);
  const hzFull = 0.7 * 0.5 * SR;
  const gFull = build({ harmonics: 1, slope: 0, skew: 1, freq: hzFull, amp: 0.5 });
  const rFull = rms(render(gFull, 40), 128 * 5);
  destroy(gFull);
  const wantFull = 0.5 / Math.SQRT2;
  if (Math.abs(rFull - wantFull) > wantFull * 0.01) {
    throw new Error(`partial at 0.7·Nyquist rms ${rFull}, expected full ${wantFull}`);
  }
  const gOut = build({ harmonics: 1, slope: 0, skew: 1, freq: 0.5 * SR + 10, amp: 0.5 });
  const rOut = rms(render(gOut, 40), 128 * 5);
  destroy(gOut);
  if (rOut > 1e-9) throw new Error(`partial above Nyquist rms ${rOut}`);
  console.log(`nyquist: 0.8·Nyquist rms ${rIn.toFixed(5)} (gain ${gainIn.toFixed(3)}), 0.7·Nyquist full, above Nyquist rms ${rOut.toExponential(2)}`);
}

// Inaudible
{
  const gQuiet = build({ harmonics: 1, slope: 0, skew: 1, freq: 441, amp: 5e-5 });
  const rQuiet = rms(render(gQuiet, 20), 128 * 5);
  destroy(gQuiet);
  if (rQuiet !== 0) throw new Error(`partial below -80 dBFS rms ${rQuiet}`);
  const gLoud = build({ harmonics: 1, slope: 0, skew: 1, freq: 441, amp: 2e-4 });
  const rLoud = rms(render(gLoud, 20), 128 * 5);
  destroy(gLoud);
  if (!(rLoud > 1e-4)) throw new Error(`partial above -80 dBFS rms ${rLoud}`);
  console.log(`inaudible: -86 dBFS skipped (rms ${rQuiet}), -74 dBFS kept (rms ${rLoud.toExponential(2)})`);
}

// Smoothing
{
  const g = build({ harmonics: 1024, slope: 1, skew: 0, start: 1, end: 8 });
  const pre = render(g, 8);
  setParam(g, hG, P.IN_HIGH, 2);
  const post = render(g, 2);
  const s = [...pre.slice(-4), ...post.slice(0, 4)];
  let jump = 0;
  for (let i = 1; i < s.length; i++) jump = Math.max(jump, Math.abs(s[i] - s[i - 1]));
  destroy(g);
  if (jump > 0.1) throw new Error(`slope change step ${jump}`);
  console.log(`smoothing: max sample step across Slope End change ${jump.toFixed(4)}`);
}

if ((version() | 0) < 164) throw new Error(`graph version ${version()} expected >= 164`);
console.log(`smoke_graph_additive_mask ok: version=${version() | 0}`);
