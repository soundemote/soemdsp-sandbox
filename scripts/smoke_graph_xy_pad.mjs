// Headless: xyPad (type 190) — live Control x/y must move Out; Smooth glides; amount 0 snaps.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wasmPath = path.join(root, "native_modules", "combined", "soemdsp_combined.wasm");

const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
const e = instance.exports;
const mem = e.memory;
if (!mem) throw new Error("wasm memory export missing");

function must(name) {
  const fn = e[name];
  if (typeof fn !== "function") throw new Error(`missing export ${name}`);
  return fn;
}

const create = must("soemdsp_graph_create");
const destroy = must("soemdsp_graph_destroy");
const add = must("soemdsp_graph_add_node");
const connect = must("soemdsp_graph_connect");
const setParam = must("soemdsp_graph_set_param");
const setMode = must("soemdsp_graph_set_smooth_mode");
const setType = must("soemdsp_graph_set_smooth_type");
const setTime = must("soemdsp_graph_set_smooth_time");
const compile = must("soemdsp_graph_compile");
const process = must("soemdsp_graph_process_block");
const setSr = must("soemdsp_graph_set_sample_rate");
const snap = must("soemdsp_graph_snap_controls");
const portPtr = must("soemdsp_graph_node_port_ptr");
const nativeHandle = must("soemdsp_graph_node_native_handle");

const TYPE_XY = 190;
const TYPE_OUT = 6;
const PORT_MONO = 0; // Out X
const PORT_LEFT = 1; // Out Y
const ATT_OFFSET = 71; // x
const MIX = 40; // y
const MODE = 21; // gate
const SHAPE = 13; // papoulis / Smooth amount
const AMP = 12; // xAmplitude
const LEVEL = 51; // yAmplitude
const OVERSAMPLE = 32; // pauseOnLift
const SR = 48000;
const FRAMES = 128;
const HASH = 0xa11ce001 >>> 0;
const OUT_HASH = 0xa11ce0ff >>> 0;

function view(ptr, n) {
  return new Float64Array(mem.buffer, ptr, n);
}

function lastPort(g, port) {
  const ptr = portPtr(g, HASH, port) | 0;
  if (ptr <= 0) throw new Error(`port ptr missing for ${port}`);
  const x = view(ptr, FRAMES);
  return x[FRAMES - 1];
}

const g = create() | 0;
if (g <= 0) throw new Error("graph create");
setSr(g, SR);
const arc = add(g, HASH, TYPE_XY) | 0;
if (arc !== 0 && arc !== -3) throw new Error(`add_node ${arc}`);
const aout = add(g, OUT_HASH, TYPE_OUT) | 0;
if (aout !== 0 && aout !== -3) throw new Error(`add_out ${aout}`);
if ((connect(g, HASH, PORT_MONO, OUT_HASH, PORT_MONO) | 0) !== 0) throw new Error("connect");

const nh = nativeHandle(g, HASH) | 0;
console.log({ nativeHandle: nh, arc, aout });
if (!(nh > 0)) throw new Error("xyPad nativeHandle missing (Papoulis create failed)");

for (const p of [ATT_OFFSET, MIX, SHAPE, MODE, OVERSAMPLE, AMP, LEVEL]) {
  setMode(g, HASH, p, 3);
  setType(g, HASH, p, 3);
  setTime(g, HASH, p, 0);
}

setParam(g, HASH, ATT_OFFSET, 0.5);
setParam(g, HASH, MIX, 0.5);
setParam(g, HASH, MODE, 0);
setParam(g, HASH, SHAPE, 0.55);
setParam(g, HASH, AMP, 1);
setParam(g, HASH, LEVEL, 1);
setParam(g, HASH, OVERSAMPLE, 0);
snap(g, HASH);
const crc = compile(g) | 0;
if (crc !== 0) throw new Error(`compile ${crc}`);

for (let i = 0; i < 8; i++) process(g, FRAMES);
const warmX = lastPort(g, PORT_MONO);
const warmY = lastPort(g, PORT_LEFT);
console.log({ warmX, warmY });
if (Math.abs(warmX) > 0.05 || Math.abs(warmY) > 0.05) {
  throw new Error(`warm should sit near bipolar 0, got X=${warmX} Y=${warmY}`);
}

setParam(g, HASH, ATT_OFFSET, 1.0);
setParam(g, HASH, MIX, 0.0);
const seriesX = [];
const seriesY = [];
for (let i = 0; i < 48; i++) {
  process(g, FRAMES);
  seriesX.push(lastPort(g, PORT_MONO));
  seriesY.push(lastPort(g, PORT_LEFT));
}
const firstX = seriesX[0];
const lastX = seriesX[seriesX.length - 1];
const firstY = seriesY[0];
const lastY = seriesY[seriesY.length - 1];
console.log({
  smoothGlide: {
    X: { first: firstX, last: lastX, delta: lastX - firstX },
    Y: { first: firstY, last: lastY, delta: lastY - firstY },
    seriesX0_5: seriesX.slice(0, 5),
    seriesY0_5: seriesY.slice(0, 5),
  },
});
if (!(lastX > firstX + 0.08)) {
  throw new Error(`Smooth>0 X glide missing: first=${firstX} last=${lastX}`);
}
if (!(lastY < firstY - 0.08)) {
  throw new Error(`Smooth>0 Y glide missing: first=${firstY} last=${lastY}`);
}
if (!(lastX > 0.55)) {
  throw new Error(`X should approach +1 under smoothing: last=${lastX}`);
}
if (!(lastY < -0.55)) {
  throw new Error(`Y should approach -1 under smoothing: last=${lastY}`);
}
const midX = seriesX[12];
if (!(midX > firstX + 0.02 && midX < lastX - 0.02)) {
  throw new Error(`X should be mid-glide at block 12: mid=${midX}`);
}

setParam(g, HASH, SHAPE, 0);
setParam(g, HASH, ATT_OFFSET, 0.0);
setParam(g, HASH, MIX, 1.0);
snap(g, HASH);
process(g, FRAMES);
process(g, FRAMES);
const dryX = lastPort(g, PORT_MONO);
const dryY = lastPort(g, PORT_LEFT);
console.log({ drySnap: { dryX, dryY } });
if (!(dryX < -0.9)) {
  throw new Error(`Smooth=0 X should snap near -1, got ${dryX}`);
}
if (!(dryY > 0.9)) {
  throw new Error(`Smooth=0 Y should snap near +1, got ${dryY}`);
}

setParam(g, HASH, AMP, 0.5);
setParam(g, HASH, LEVEL, 0.25);
snap(g, HASH);
process(g, FRAMES);
process(g, FRAMES);
const ampX = lastPort(g, PORT_MONO);
const ampY = lastPort(g, PORT_LEFT);
console.log({ ampScale: { ampX, ampY } });
if (!(ampX < -0.4 && ampX > -0.6)) {
  throw new Error(`xAmplitude 0.5 should ~ -0.5, got ${ampX}`);
}
if (!(ampY > 0.2 && ampY < 0.35)) {
  throw new Error(`yAmplitude 0.25 should ~ +0.25, got ${ampY}`);
}

destroy(g);
console.log("xyPad native outs+smoothing smoke OK (glide, snap, non-zero, amps)");

// --- Unwired XY Pad must still process (always-reachable controller) ---
{
  const g2 = create() | 0;
  if (g2 <= 0) throw new Error("graph2 create");
  setSr(g2, SR);
  const a2 = add(g2, HASH, TYPE_XY) | 0;
  if (a2 !== 0 && a2 !== -3) throw new Error(`add_node unwired ${a2}`);
  // No Output node, no cables — must still compile + move outs.
  for (const p of [ATT_OFFSET, MIX, SHAPE, MODE, OVERSAMPLE, AMP, LEVEL]) {
    setMode(g2, HASH, p, 3);
    setType(g2, HASH, p, 3);
    setTime(g2, HASH, p, 0);
  }
  setParam(g2, HASH, ATT_OFFSET, 0.5);
  setParam(g2, HASH, MIX, 0.5);
  setParam(g2, HASH, MODE, 0);
  setParam(g2, HASH, SHAPE, 0);
  setParam(g2, HASH, AMP, 1);
  setParam(g2, HASH, LEVEL, 1);
  setParam(g2, HASH, OVERSAMPLE, 0);
  snap(g2, HASH);
  const crc2 = compile(g2) | 0;
  if (crc2 !== 0) throw new Error(`compile unwired ${crc2}`);
  for (let i = 0; i < 4; i++) process(g2, FRAMES);
  const midX = lastPort(g2, PORT_MONO);
  const midY = lastPort(g2, PORT_LEFT);
  setParam(g2, HASH, ATT_OFFSET, 1.0);
  setParam(g2, HASH, MIX, 0.0);
  snap(g2, HASH);
  process(g2, FRAMES);
  process(g2, FRAMES);
  const hiX = lastPort(g2, PORT_MONO);
  const loY = lastPort(g2, PORT_LEFT);
  console.log({ unwiredReachable: { midX, midY, hiX, loY } });
  if (!(hiX > midX + 0.3)) {
    throw new Error(`unwired XY Pad X did not update (reachable cull?): mid=${midX} hi=${hiX}`);
  }
  if (!(loY < midY - 0.3)) {
    throw new Error(`unwired XY Pad Y did not update (reachable cull?): mid=${midY} lo=${loY}`);
  }
  destroy(g2);
  console.log("xyPad unwired always-reachable smoke OK");
}