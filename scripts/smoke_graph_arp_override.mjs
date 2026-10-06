// Headless: Arp + Gravity Walker face-override MIDI path.
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

const SR = 48000;
const CEG = 2 ** 24 + 2 ** 28 + 2 ** 31; // C0 E0 G0

// --- Arp kernel override ---
{
  const create = must("soemdsp_arp_create");
  const destroy = must("soemdsp_arp_destroy");
  const sample = must("soemdsp_arp_sample");
  const play = must("soemdsp_arp_play_midi");
  const setOver = must("soemdsp_arp_set_override_midi");
  const h = create() | 0;
  if (h <= 0) throw new Error("arp create");
  for (let i = 0; i < 200; i++) sample(h, CEG, 1, 0, 0, 0, 8, 0, 8, 1, 0, 0, SR);
  setOver(h, 31);
  sample(h, CEG, 1, 0, 0, 0, 8, 0, 8, 1, 0, 0, SR);
  if ((play(h) | 0) !== 31) throw new Error(`arp override play=${play(h)} want 31`);
  setOver(h, -1);
  sample(h, CEG, 1, 0, 0, 0, 8, 0, 8, 1, 0, 0, SR);
  destroy(h);
  console.log("arp override kernel OK");
}

// --- Gravity Walker kernel override ---
{
  const create = must("soemdsp_gravity_walker_create");
  const destroy = must("soemdsp_gravity_walker_destroy");
  const setChunks = must("soemdsp_gravity_walker_set_chunks");
  const sample = must("soemdsp_gravity_walker_sample");
  const setOver = must("soemdsp_gravity_walker_set_override_midi");
  const h = create(1) | 0;
  if (h <= 0) throw new Error("gw create");
  setChunks(h, CEG, 0, 0);
  // clock rise: sample(handle, clock, reset, gravity, leap, oct, steps, seed, patternOff, keys, hasKeys)
  sample(h, 0, 0, 0.65, 0.15, 0, 0, 1, 0, 0, 0);
  sample(h, 1, 0, 0.65, 0.15, 0, 0, 1, 0, 0, 0);
  setOver(h, 28);
  const pitch = sample(h, 0, 0, 0.65, 0.15, 0, 0, 1, 0, 0, 0);
  // musical_pitch_from_midi(28) — pitch CV; just assert it moved with override
  setOver(h, 31);
  const pitch2 = sample(h, 0, 0, 0.65, 0.15, 0, 0, 1, 0, 0, 0);
  if (!(Math.abs(pitch2 - pitch) > 1e-6)) {
    throw new Error(`gw override pitch unchanged (${pitch} -> ${pitch2})`);
  }
  setOver(h, -1);
  destroy(h);
  console.log("gravity walker override kernel OK");
}

// --- Graph path: node native handle + arp override ---
{
  const create = must("soemdsp_graph_create");
  const destroy = must("soemdsp_graph_destroy");
  const add = must("soemdsp_graph_add_node");
  const connect = must("soemdsp_graph_connect");
  const compile = must("soemdsp_graph_compile");
  const setSr = must("soemdsp_graph_set_sample_rate");
  const process = must("soemdsp_graph_process_block");
  const snap = must("soemdsp_graph_snap_controls");
  const setParam = must("soemdsp_graph_set_param");
  const nativeHandle = must("soemdsp_graph_node_native_handle");
  const setChunks = must("soemdsp_arp_set_chunks");
  const setOver = must("soemdsp_arp_set_override_midi");
  const play = must("soemdsp_arp_play_midi");
  const TYPE_ARP = 150;
  const TYPE_OUT = 6;
  const TYPE_BIAS = 12;
  const PORT_MONO = 0;
  const PARAM_FREQUENCY = 10;
  const PARAM_ATT_OFFSET = 71;
  const g = create() | 0;
  setSr(g, SR);
  const hBias = 0xaa01 >>> 0;
  const hArp = 0xaa03 >>> 0;
  const hOut = 0xaa04 >>> 0;
  if ((add(g, hBias, TYPE_BIAS) | 0) !== 0) throw new Error("add bias");
  if ((add(g, hArp, TYPE_ARP) | 0) !== 0) throw new Error("add arp");
  if ((add(g, hOut, TYPE_OUT) | 0) !== 0) throw new Error("add out");
  setParam(g, hBias, PARAM_ATT_OFFSET, CEG);
  setParam(g, hArp, PARAM_FREQUENCY, 32);
  if ((connect(g, hBias, PORT_MONO, hArp, PORT_MONO) | 0) !== 0) throw new Error("bias->arp");
  if ((connect(g, hArp, PORT_MONO, hOut, PORT_MONO) | 0) !== 0) throw new Error("arp->out");
  if ((compile(g) | 0) !== 0) throw new Error("compile");
  snap(g);
  const handle = nativeHandle(g, hArp) | 0;
  if (!(handle > 0)) throw new Error("native handle missing");
  // Host chunks (worklet path) + cable both feed notes.
  setChunks(handle, CEG, 0, 0);
  for (let i = 0; i < 40; i++) process(g, 128);
  const before = play(handle) | 0;
  if (before < 0) throw new Error(`arp not playing before override (play=${before})`);
  setOver(handle, 31);
  process(g, 128);
  const during = play(handle) | 0;
  if (during !== 31) throw new Error(`graph arp override play=${during} want 31 (before=${before})`);
  setOver(handle, -1);
  destroy(g);
  console.log(`graph arp override via native_handle OK before=${before} during=${during}`);
}

console.log("smoke_graph_arp_override OK");
