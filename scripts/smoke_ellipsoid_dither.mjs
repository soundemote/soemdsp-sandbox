// Headless: Ellipsoid osc (type 186) AA = Dither (Robin cycle-length dither).
// 1) Off / Limit graph output is bit-identical to the host loop driven
//    through the stateless export (and, with an optional pre-change combined
//    wasm path as argv[2], bit-identical to that build too).
// 2) Robin phasor: whole-sample cycles, mean = sr / f, variance ~0.25.
// 3) Dither: finite, same pitch / level as Off at low f, and lower tonal
//    alias spurs than Off on a near-square high tone.
// Usage: node scripts/smoke_ellipsoid_dither.mjs [pre-change soemdsp_combined.wasm]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const combinedPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");
const ellipsoidPath = path.join(root, "native_modules", "ellipsoid", "ellipsoid.wasm");
const refPath = process.argv[2] || "";

async function load(p) {
  const { instance } = await WebAssembly.instantiate(fs.readFileSync(p), {});
  return instance.exports;
}
function must(e, name) {
  if (typeof e[name] !== "function") throw new Error(`missing export ${name}`);
  return e[name];
}

const TYPE_ELLIPSOID_OSC = 186;
const TYPE_OUT = 6;
const PORT_MONO = 0;
const PORT_LEFT = 1;
const PORT_RIGHT = 2;
const P_FREQUENCY = 10;
const P_AMPLITUDE = 12;
const P_SHAPE = 13;
const P_CENTER = 30; // AA: 0 Off, 1 Limit, 2 Dither
const P_WIDTH = 31; // scale C
const P_ATT_OFFSET = 71; // offset A
const SR = 48000;
const BLOCK = 128;

function renderGraph(e, { aa, freq, offset, shape, scale, blocks }) {
  const g = must(e, "soemdsp_graph_create")() | 0;
  must(e, "soemdsp_graph_set_sample_rate")(g, SR);
  const hOsc = 0xe11a01 >>> 0;
  const hOut = 0xe11a02 >>> 0;
  if ((must(e, "soemdsp_graph_add_node")(g, hOsc, TYPE_ELLIPSOID_OSC) | 0) !== 0) throw new Error("osc add");
  if ((must(e, "soemdsp_graph_add_node")(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("out add");
  if ((must(e, "soemdsp_graph_connect")(g, hOsc, PORT_LEFT, hOut, PORT_MONO) | 0) !== 0) throw new Error("connect");
  const set = must(e, "soemdsp_graph_set_param");
  set(g, hOsc, P_CENTER, aa);
  set(g, hOsc, P_FREQUENCY, freq);
  set(g, hOsc, P_ATT_OFFSET, offset);
  set(g, hOsc, P_SHAPE, shape);
  set(g, hOsc, P_WIDTH, scale);
  set(g, hOsc, P_AMPLITUDE, 1);
  if ((must(e, "soemdsp_graph_compile")(g) | 0) !== 0) throw new Error("compile");
  must(e, "soemdsp_graph_snap_controls")(g);
  const proc = must(e, "soemdsp_graph_process_block");
  const portPtr = must(e, "soemdsp_graph_node_port_ptr");
  const left = new Float64Array(blocks * BLOCK);
  const right = new Float64Array(blocks * BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc(g, BLOCK);
    left.set(new Float64Array(e.memory.buffer, portPtr(g, hOsc, PORT_LEFT) | 0, BLOCK), b * BLOCK);
    right.set(new Float64Array(e.memory.buffer, portPtr(g, hOsc, PORT_RIGHT) | 0, BLOCK), b * BLOCK);
  }
  must(e, "soemdsp_graph_destroy")(g);
  return { left, right };
}

function sameBits(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

const e = await load(combinedPath);
const ver = must(e, "soemdsp_graph_version")() | 0;
const ellVer = must(e, "soemdsp_ellipsoid_version")() | 0;
if (ver < 159) throw new Error(`graph version ${ver} < 159 (Ellipsoid Dither missing)`);
if (ellVer < 14) throw new Error(`ellipsoid version ${ellVer} < 14`);

// --- 1) Off / Limit unchanged ---
const pair = must(e, "soemdsp_ellipsoid_sample_pair");
const ell = await load(ellipsoidPath);
const scratchPage = ell.memory.grow(1); // fresh page: no allocator, so unused by the module
const SCR = scratchPage * 65536;
const pairStandalone = must(ell, "soemdsp_ellipsoid_sample_pair");
function hostLoop(aa, freq, offset, shape, scale, n) {
  // Mirrors process_ellipsoid_osc for constant params (phase += f / sr).
  const left = new Float64Array(n);
  const right = new Float64Array(n);
  const view = new Float64Array(ell.memory.buffer, SCR, 2);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    let p = phase;
    p -= Math.floor(p);
    pairStandalone(p * (Math.PI * 2), offset, shape, scale, freq, SR, aa, SCR, SCR + 8);
    left[i] = view[0];
    right[i] = view[1];
    phase += freq / SR;
    phase -= Math.floor(phase);
  }
  return { left, right };
}

const cases = [
  { freq: 100, offset: 0, shape: 0, scale: 1 },
  { freq: 2950, offset: 0.3, shape: 0.2, scale: 0.02 },
  { freq: 9000, offset: -0.5, shape: -0.7, scale: 0.3 },
];
const ref = refPath ? await load(refPath) : null;
for (const aa of [0, 1]) {
  for (const c of cases) {
    const blocks = 64;
    const out = renderGraph(e, { aa, ...c, blocks });
    const host = hostLoop(aa, c.freq, c.offset, c.shape, c.scale, blocks * BLOCK);
    if (!sameBits(out.left, host.left) || !sameBits(out.right, host.right)) {
      throw new Error(`aa=${aa} f=${c.freq}: graph differs from host loop`);
    }
    if (ref) {
      const old = renderGraph(ref, { aa, ...c, blocks });
      if (!sameBits(out.left, old.left) || !sameBits(out.right, old.right)) {
        throw new Error(`aa=${aa} f=${c.freq}: differs from pre-change build`);
      }
    }
  }
  console.log(`ok aa=${aa} graph == host loop${ref ? " == pre-change build" : ""} (${cases.length} cases)`);
}
// Stateless export: legacy nonzero (except 2) is still Limit; 2 renders the shape as Off.
{
  const scr = e.memory.grow(1) * 65536;
  const read = (aa) => {
    pair(1.1, 0.2, 0.3, 0.001, 5000, SR, aa, scr, scr + 8);
    const w = new Float64Array(e.memory.buffer, scr, 2);
    return [w[0], w[1]];
  };
  const off = read(0);
  const lim = read(1);
  const dith = read(2);
  const legacy = read(5);
  if (!sameBits(dith, off)) throw new Error("antialias=2 should render the shape as Off");
  if (!sameBits(legacy, lim)) throw new Error("legacy antialias=5 should stay Limit");
  if (sameBits(off, lim)) throw new Error("test point does not separate Off / Limit");
  console.log("ok stateless antialias: 2 = Off shape, other nonzero = Limit");
}
// RoundShape cycle dither (refactored onto the shared picker) unchanged vs pre-change build.
if (ref) {
  const scrA = e.memory.grow(1) * 65536;
  const scrB = ref.memory.grow(1) * 65536;
  const fa = must(e, "soemdsp_ellipsoid_robin_dither_cycles");
  const fb = must(ref, "soemdsp_ellipsoid_robin_dither_cycles");
  new Uint32Array(e.memory.buffer, scrA, 1)[0] = 0x1234567;
  new Uint32Array(ref.memory.buffer, scrB, 1)[0] = 0x1234567;
  for (let i = 0; i < 20000; i++) {
    const c = 2 + (i % 997) * 0.731;
    const a = fa(scrA, c);
    const b = fb(scrB, c);
    if (!Object.is(a, b)) throw new Error(`robin_dither_cycles differs at ${i}`);
  }
  if (new Uint32Array(e.memory.buffer, scrA, 1)[0] !== new Uint32Array(ref.memory.buffer, scrB, 1)[0]) {
    throw new Error("robin_dither_cycles rng state differs");
  }
  console.log("ok RoundShape robin_dither_cycles == pre-change build (20000 calls)");
}

// --- 2) Robin phasor statistics ---
{
  const phasor = must(ell, "soemdsp_ellipsoid_robin_phasor");
  const rng = SCR + 16;
  const count = SCR + 24;
  const len = SCR + 32;
  for (const c of [16.27, 109.0909, 480.5]) {
    new Uint32Array(ell.memory.buffer, rng, 1)[0] = 0xe11d51aa;
    const f64 = () => new Float64Array(ell.memory.buffer);
    f64()[count / 8] = 0;
    f64()[len / 8] = 0;
    let prev = phasor(rng, count, len, c, 1, 0);
    if (prev !== 0) throw new Error("fresh cycle should start at phase 0");
    let run = 1;
    const lengths = [];
    for (let i = 0; i < 400000; i++) {
      const p = phasor(rng, count, len, c, 1, 0);
      if (!(p >= 0 && p < 1)) throw new Error(`phase ${p} out of range`);
      if (p < prev) {
        if (p !== 0) throw new Error(`wrap should land on phase 0, got ${p}`);
        lengths.push(run);
        run = 0;
      }
      run += 1;
      prev = p;
    }
    const mid = Math.round(c);
    let sum = 0;
    let sq = 0;
    for (const L of lengths) {
      if (Math.abs(L - mid) > 1) throw new Error(`cycle length ${L} not within +/-1 of ${mid}`);
      sum += L;
      sq += (L - c) * (L - c);
    }
    const mean = sum / lengths.length;
    const variance = sq / lengths.length;
    if (Math.abs(mean - c) > 0.01 * Math.max(1, c / 100) + 0.01) throw new Error(`c=${c} mean cycle ${mean}`);
    if (Math.abs(variance - 0.25) > 0.02) throw new Error(`c=${c} variance ${variance}`);
    console.log(`ok robin phasor c=${c} cycles=${lengths.length} mean=${mean.toFixed(4)} var=${variance.toFixed(4)}`);
  }
}

// --- 3) Dither in the graph ---
function upCrossings(x) {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return n;
}
function rms(x) {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}
{
  const blocks = Math.ceil(SR / BLOCK); // ~1 s
  const c = { freq: 50, offset: 0, shape: 0, scale: 1 };
  const off = renderGraph(e, { aa: 0, ...c, blocks });
  const dit = renderGraph(e, { aa: 2, ...c, blocks });
  for (const v of dit.left) if (!Number.isFinite(v) || Math.abs(v) > 1 + 1e-9) throw new Error(`dither sample ${v}`);
  for (const v of dit.right) if (!Number.isFinite(v) || Math.abs(v) > 1 + 1e-9) throw new Error(`dither sample ${v}`);
  const nOff = upCrossings(off.left);
  const nDit = upCrossings(dit.left);
  const rOff = rms(off.left);
  const rDit = rms(dit.left);
  // First cycle, sample by sample (phase walk is at most ~1 sample there).
  let firstCycleErr = 0;
  for (let i = 0; i < SR / c.freq; i++) firstCycleErr = Math.max(firstCycleErr, Math.abs(off.left[i] - dit.left[i]));
  if (Math.abs(nOff - nDit) > 1) throw new Error(`low-f pitch: off ${nOff} vs dither ${nDit} crossings`);
  if (Math.abs(rOff - rDit) > 0.01 * rOff) throw new Error(`low-f level: off ${rOff} vs dither ${rDit}`);
  if (!(firstCycleErr < 0.02)) throw new Error(`low-f first cycle max diff ${firstCycleErr}`);
  console.log(`ok dither low f=${c.freq}: crossings off=${nOff} dither=${nDit} rms off=${rOff.toFixed(5)} dither=${rDit.toFixed(5)} firstCycleMaxDiff=${firstCycleErr.toExponential(2)}`);
}

function fftMag(x) {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = (-2 * Math.PI) / size;
    for (let s = 0; s < n; s += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = s + k;
        const b = a + size / 2;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}
// Inharmonic region = bins more than 25% of the harmonic spacing away from
// every harmonic of f. spurDb: worst bin there re the fundamental. crestDb:
// worst bin re the mean there (tonal aliases = high crest, noise = low).
function aliasStats(x, freq) {
  const mag = fftMag(x);
  const sp = freq / (SR / x.length); // harmonic spacing in bins
  let fund = 0;
  for (let i = Math.round(sp) - 3; i <= Math.round(sp) + 3; i++) fund = Math.max(fund, mag[i]);
  let spur = 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 1; i < mag.length; i++) {
    const h = i / sp;
    if (Math.abs(h - Math.round(h)) <= 0.25) continue;
    sum += mag[i] * mag[i];
    cnt += 1;
    if (mag[i] > spur) spur = mag[i];
  }
  return {
    spurDb: 20 * Math.log10(spur / fund),
    crestDb: 10 * Math.log10((spur * spur) / (sum / cnt)),
    floorDb: 10 * Math.log10(sum / cnt / (fund * fund)),
  };
}
{
  const c = { freq: 2950, offset: 0, shape: 0, scale: 0.02 }; // near-square, sr / f = 16.27
  const blocks = 16384 / BLOCK;
  const off = renderGraph(e, { aa: 0, ...c, blocks });
  const dit = renderGraph(e, { aa: 2, ...c, blocks });
  for (const v of dit.left) if (!Number.isFinite(v)) throw new Error("dither high-f not finite");
  const so = aliasStats(off.left, c.freq);
  const sd = aliasStats(dit.left, c.freq);
  const fmt = (s) => `spur ${s.spurDb.toFixed(1)} dB, crest ${s.crestDb.toFixed(1)} dB, floor ${s.floorDb.toFixed(1)} dB`;
  console.log(`dither high f=${c.freq} C=${c.scale}: off ${fmt(so)} | dither ${fmt(sd)}`);
  if (!(sd.spurDb < so.spurDb - 6)) throw new Error("dither did not lower the worst alias spur by 6 dB");
  if (!(sd.crestDb < so.crestDb - 8)) throw new Error("dither did not turn tonal aliases into noise (crest)");
  console.log("ok dither lowers the worst alias spur and spreads aliases into noise");
}
console.log(`smoke_ellipsoid_dither ok (graph ${ver}, ellipsoid ${ellVer})`);
