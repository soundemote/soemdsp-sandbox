// Softpop Oscillator native tests (docs/SOFTPOP_PLAN.md §9, tests 1-11).
// Builds native_modules/softpop_oscillator/softpop_oscillator.cpp with
// scripts/softpop_oscillator_test_probe.cpp (production flags: wasm32 -O3
// -msimd128), then runs offline at 48 kHz. Long level loops run in wasm on a
// worker pool (Filter level is a noise power estimate; each case runs long
// enough for ~0.15 dB standard error, see levelSeconds()).
// polyBlep graph parity (Reset / f / Out-Left-Right) and choice persistence:
// scripts/smoke_graph_softpop_oscillator.mjs.
//
// Usage:
//   node scripts/test_softpop_oscillator.mjs              (all tests)
//   node scripts/test_softpop_oscillator.mjs --calibrate  (k_color: 1 kHz, W 0.3, 3000 s per Color)
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

const SR = 48000;
const P = { FILTER: 0, SINE: 1, WHITE: 0, PINK: 1, BROWN: 2, STEREO: 0, MONO: 1 };
const COLORS = ["white", "pink", "brown"];
const CH = { MONO: 0, L: 1, R: 2, NP_L: 3, NP_R: 4, NA_L: 5, NA_R: 6, NAUD_L: 7, NAUD_R: 8, FI_L: 9, FI_R: 10 };

function instantiate(module) {
  const inst = new WebAssembly.Instance(module, {});
  return inst.exports;
}

// params: [freq, model, width, pitchCents, ampMod, amplitude, color, stereo, seed, sr]
function levelJob(x, job) {
  const h = x.tp_create() | 0;
  if (!(h > 0)) throw new Error("create failed");
  x.tp_set(...job.params);
  x.tp_level(h, job.warm, job.n);
  const s = Array.from(new Float64Array(x.memory.buffer, x.tp_stats(), 8));
  x.tp_destroy(h);
  return s;
}

if (!isMainThread) {
  const x = instantiate(workerData.module);
  parentPort.on("message", (job) => {
    parentPort.postMessage({ id: job.id, stats: levelJob(x, job) });
  });
} else {
  await main();
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const clangCandidates = [process.env.SOEMDSP_CLANG, "C:\\Program Files\\LLVM\\bin\\clang++.exe", "/usr/bin/clang++"].filter(Boolean);
  const clang = clangCandidates.find((p) => fs.existsSync(p));
  if (!clang) throw new Error(`clang++ not found (tried ${clangCandidates.join(", ")})`);
  const wasmPath = path.join(os.tmpdir(), `softpop_oscillator_test_${process.pid}.wasm`);
  const exportsList = ["tp_buf", "tp_cap", "tp_in", "tp_in_cap", "tp_stats", "tp_create", "tp_destroy", "tp_reset", "tp_set", "tp_render", "tp_level"];
  execFileSync(clang, [
    "--target=wasm32", "-O3", "-msimd128", "-nostdlib", "-fno-exceptions", "-fno-rtti",
    `-I${path.join(root, "library", "include")}`,
    "-Wl,--no-entry", ...exportsList.map((e) => `-Wl,--export=${e}`), "-Wl,--export-memory",
    "-o", wasmPath,
    path.join(root, "scripts", "softpop_oscillator_test_probe.cpp"),
    path.join(root, "native_modules", "softpop_oscillator", "softpop_oscillator.cpp"),
    path.join(root, "native_modules", "combined", "shim.cpp"),
  ], { stdio: "inherit" });
  const module = new WebAssembly.Module(fs.readFileSync(wasmPath));
  fs.rmSync(wasmPath, { force: true });
  const x = instantiate(module);

  // ---------- worker pool ----------
  const nWorkers = Math.max(1, Math.min(os.cpus().length - 2, 22));
  const workers = [];
  const pending = new Map();
  const queue = [];
  let nextId = 1;
  const idle = [];
  function pump() {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const job = queue.shift();
      w.busy = job.id;
      w.postMessage(job);
    }
  }
  for (let i = 0; i < nWorkers; i++) {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { module } });
    w.on("message", (m) => {
      const p = pending.get(m.id);
      pending.delete(m.id);
      idle.push(w);
      p(m.stats);
      pump();
    });
    w.on("error", (e) => { console.error(e); process.exit(2); });
    workers.push(w);
    idle.push(w);
  }
  function runJob(job) {
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      queue.push({ ...job, id });
      pump();
    });
  }

  // ---------- helpers ----------
  const failures = [];
  function gate(ok, msg) {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failures.push(msg);
  }
  const dB = (p) => 10 * Math.log10(p);
  const params = (o) => [o.freq ?? 1000, o.model ?? P.FILTER, o.width ?? 0.3, o.pitch ?? 0, o.ampMod ?? 0, o.amp ?? 1, o.color ?? P.WHITE, o.stereo ?? P.STEREO, o.seed ?? 1, o.sr ?? SR];

  // Render n frames of the selected channels; calls onChunk(arrays, offset) per chunk.
  function render(h, n, chans, onChunk, inFn = null) {
    let mask = 0;
    for (const c of chans) mask |= 1 << c;
    const order = [...chans].sort((a, b) => a - b);
    const cap = x.tp_cap() | 0;
    const chunk = Math.min(Math.floor(cap / chans.length), inFn ? (x.tp_in_cap() | 0) : 1 << 20);
    for (let off = 0; off < n; off += chunk) {
      const m = Math.min(chunk, n - off);
      if (inFn) {
        const inp = new Float64Array(x.memory.buffer, x.tp_in(), m);
        for (let i = 0; i < m; i++) inp[i] = inFn(off + i);
      }
      if ((x.tp_render(h, m, mask, inFn ? 1 : 0) | 0) !== chans.length) throw new Error("tp_render failed");
      const buf = new Float64Array(x.memory.buffer, x.tp_buf(), m * chans.length);
      const arrays = {};
      order.forEach((c, k) => { arrays[c] = buf.subarray(k * m, (k + 1) * m); });
      onChunk(chans.map((c) => arrays[c]), off);
    }
  }
  function renderAll(h, n, chans, inFn = null) {
    const out = chans.map(() => new Float64Array(n));
    render(h, n, chans, (arrs, off) => arrs.forEach((a, k) => out[k].set(a, off)), inFn);
    return out;
  }
  function withInstance(o, fn) {
    const h = x.tp_create() | 0;
    if (!(h > 0)) throw new Error("create failed");
    x.tp_set(...params(o));
    try { return fn(h); } finally { x.tp_destroy(h); }
  }
  function bitEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }

  // FFT (in place, radix 2) and Welch PSD (Hann, 50 % overlap).
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  function welch(sig, L) {
    const win = new Float64Array(L);
    for (let i = 0; i < L; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / L);
    const psd = new Float64Array(L / 2 + 1);
    const re = new Float64Array(L), im = new Float64Array(L);
    let segs = 0;
    for (let s = 0; s + L <= sig.length; s += L / 2) {
      for (let i = 0; i < L; i++) { re[i] = sig[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k <= L / 2; k++) psd[k] += re[k] * re[k] + im[k] * im[k];
      segs++;
    }
    for (let k = 0; k <= L / 2; k++) psd[k] /= segs;
    return { psd, df: SR / L, segs };
  }
  function smooth(a, r) {
    const out = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) { s += a[j]; c++; }
      out[i] = s / c;
    }
    return out;
  }
  // Narrow bands: weighted least squares of 1/P = a + b u + c u^2 (u = f - f_peak,
  // the Lorentzian near the centre) over bins above 0.3 x peak; unbiased by the
  // noise on the maximum. Returns the centre and the -3 dB width.
  function lorentzFit(p, df) {
    const ps = smooth(p, 2);
    let k0 = 0;
    for (let k = 1; k < ps.length; k++) if (ps[k] > ps[k0]) k0 = k;
    let a = k0; while (a > 0 && ps[a - 1] > 0.3 * ps[k0]) a--;
    let b = k0; while (b < ps.length - 1 && ps[b + 1] > 0.3 * ps[k0]) b++;
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (let k = a; k <= b; k++) {
      const u = (k - k0) * df, w2 = p[k] * p[k], basis = [1, u, u * u], y = 1 / p[k];
      for (let i = 0; i < 3; i++) { v[i] += w2 * basis[i] * y; for (let j = 0; j < 3; j++) M[i][j] += w2 * basis[i] * basis[j]; }
    }
    const c = solve3(M, v);
    const uc = -c[1] / (2 * c[2]);
    const invPeak = c[0] - c[1] * c[1] / (4 * c[2]);
    return { fc: k0 * df + uc, bw: 2 * Math.sqrt(invPeak / c[2]) };
  }
  function solve3(m, v) {
    const det3 = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    const D = det3(m);
    return [0, 1, 2].map((k) => det3(m.map((row, i) => row.map((val, j) => (j === k ? v[i] : val)))) / D);
  }
  // Broad bands: half-power crossings around the maximum of p (linear interpolation).
  function halfPower(p, df) {
    let k0 = 0;
    for (let k = 1; k < p.length; k++) if (p[k] > p[k0]) k0 = k;
    const half = p[k0] / 2;
    let a = k0; while (a > 0 && p[a] > half) a--;
    let b = k0; while (b < p.length - 1 && p[b] > half) b++;
    const fa = (a + (half - p[a]) / (p[a + 1] - p[a])) * df;
    const fb = (b - 1 + (p[b - 1] - half) / (p[b - 1] - p[b])) * df;
    return { peak: k0 * df, f1: fa, f2: fb };
  }

  const Qof = (w) => 2000 * Math.pow(0.5 / 2000, w);
  const Bmodof = (w) => 0.1 * Math.pow(2000 / 0.1, w);

  // ---------- level cases (Filter RMS vs the Sine RMS 1/sqrt 2) ----------
  // Noise bandwidth B = pi fc / (2Q); stereo L+R doubles the samples.
  // T chosen so 2 T B >= 1000  ->  ~0.14 dB standard error.
  function levelSeconds(fc, w) {
    const B = Math.PI * Math.min(fc, 0.45 * SR) / (2 * Qof(w));
    return Math.max(20, 500 / B);
  }
  async function filterLevel(o, totalSeconds) {
    const fc = o.freq;
    const tau = Qof(o.width) / (Math.PI * Math.max(fc, 20)); // BP envelope time constant
    const warmS = Math.max(0.5, 8 * tau);
    const chunkS = Math.max(60, 4 * warmS);
    const nJobs = Math.max(1, Math.ceil(totalSeconds / chunkS));
    const per = Math.ceil((totalSeconds / nJobs) * SR);
    const jobs = [];
    for (let j = 0; j < nJobs; j++) {
      jobs.push(runJob({ params: params({ ...o, seed: (o.seed ?? 1) + 7919 * j }), warm: Math.ceil(warmS * SR), n: per }));
    }
    const res = await Promise.all(jobs);
    let pl = 0, pr = 0, bad = 0, mx = 0;
    for (const s of res) { pl += s[0]; pr += s[1]; bad += s[4]; mx = Math.max(mx, s[5]); }
    const p = (pl + pr) / (2 * res.length);
    return { p, rmsDb: dB(p / 0.5), bad, mx, seconds: nJobs * per / SR };
  }

  if (process.argv.includes("--calibrate")) {
    for (const color of [0, 1, 2]) {
      const r = await filterLevel({ freq: 1000, width: 0.3, color }, 3000);
      console.log(`calibrate ${COLORS[color]}: 1 kHz W=0.3 Filter level ${r.rmsDb.toFixed(4)} dB re 1/sqrt2 (${r.seconds.toFixed(0)} s) -> k *= ${Math.pow(10, -r.rmsDb / 20).toFixed(6)}`);
    }
    for (const w of workers) w.terminate();
    return;
  }

  const t0 = Date.now();
  // Launch the long level work first so it overlaps with the main-thread tests.
  const fcs = [50, 100, 200, 400, 800, 1600, 3200, 6400, 10000];
  const levelPromises = [];
  for (const color of [0, 1, 2]) {
    for (const w of [0, 0.2, 0.3, 0.4, 0.6, 0.8, 1]) {
      levelPromises.push(filterLevel({ freq: 1000, width: w, color }, levelSeconds(1000, w)).then((r) => ({ kind: "width", color, w, fc: 1000, ...r })));
    }
    for (const w of [0.3, 0, 0.9, 1]) {
      for (const fc of fcs) {
        levelPromises.push(filterLevel({ freq: fc, width: w, color }, levelSeconds(fc, w)).then((r) => ({ kind: "keys", color, w, fc, ...r })));
      }
    }
    // Test 6: Amp Mod level-preserving (both models), W 0.6.
    for (const model of [P.FILTER, P.SINE]) {
      for (const a of [0, 0.25, 0.5, 0.75, 1]) {
        levelPromises.push(filterLevel({ freq: 1000, width: 0.6, color, model, ampMod: a }, 240).then((r) => ({ kind: "am", color, model, a, ...r })));
      }
    }
  }

  // ---------- 1. Decorrelation ----------
  {
    const names = ["npL", "npR", "naL", "naR", "NaudL", "NaudR", "outL", "outR"];
    const chans = [CH.NP_L, CH.NP_R, CH.NA_L, CH.NA_R, CH.NAUD_L, CH.NAUD_R, CH.L, CH.R];
    const pairs = [[0, 2], [0, 4], [2, 4], [1, 3], [1, 5], [3, 5], [0, 1], [2, 3], [4, 5], [6, 7]];
    let worst = 0;
    let worstName = "";
    for (const seed of [1, 2, 777, 16777215]) {
      const n = 60 * SR;
      const S = new Float64Array(8), SS = new Float64Array(8), SX = new Float64Array(pairs.length);
      withInstance({ freq: 1000, width: 1, color: P.WHITE, seed }, (h) => {
        render(h, n, chans, (a) => {
          const m = a[0].length;
          for (let i = 0; i < m; i++) {
            for (let c = 0; c < 8; c++) { const v = a[c][i]; S[c] += v; SS[c] += v * v; }
            for (let k = 0; k < pairs.length; k++) SX[k] += a[pairs[k][0]][i] * a[pairs[k][1]][i];
          }
        });
      });
      const parts = [];
      for (let k = 0; k < pairs.length; k++) {
        const [i, j] = pairs[k];
        const cov = SX[k] / n - (S[i] / n) * (S[j] / n);
        const r = cov / Math.sqrt((SS[i] / n - (S[i] / n) ** 2) * (SS[j] / n - (S[j] / n) ** 2));
        parts.push(`${names[i]}~${names[j]} ${r.toFixed(4)}`);
        if (Math.abs(r) > worst) { worst = Math.abs(r); worstName = `${names[i]}~${names[j]} seed ${seed}`; }
      }
      console.log(`     decorrelation seed=${seed} (60 s, W=1, white): ${parts.join(", ")}`);
    }
    gate(worst < 0.01, `1 decorrelation: max |r| = ${worst.toFixed(4)} (${worstName}) < 0.01 over 4 seeds x 10 pairs`);
  }

  // ---------- 2. Mono / Seed / Reset / Model switch ----------
  {
    const base = { freq: 700, width: 0.5, pitch: 600, ampMod: 0.5 };
    let monoOk = true, monoIsStereoL = true;
    for (const model of [P.FILTER, P.SINE]) for (const color of [0, 1, 2]) {
      const [l, r] = withInstance({ ...base, model, color, stereo: P.MONO }, (h) => renderAll(h, SR, [CH.L, CH.R]));
      const [ls] = withInstance({ ...base, model, color, stereo: P.STEREO }, (h) => renderAll(h, SR, [CH.L]));
      if (!bitEqual(l, r)) monoOk = false;
      if (!bitEqual(l, ls)) monoIsStereoL = false;
    }
    gate(monoOk, "2 Mono: L == R bit-identical (2 models x 3 colors, 1 s)");
    gate(monoIsStereoL, "2 Mono: L is bit-identical to Stereo L (Mono runs the L generators only)");
    const o = { ...base, model: P.FILTER, color: P.PINK, seed: 4242 };
    const [a] = withInstance(o, (h) => renderAll(h, SR, [CH.MONO]));
    const [b] = withInstance(o, (h) => renderAll(h, SR, [CH.MONO]));
    gate(bitEqual(a, b), "2 Seed: same Seed -> bit-identical output");
    const resetOk = withInstance(o, (h) => {
      const [first] = renderAll(h, SR, [CH.MONO]);
      x.tp_reset(h);
      const [again] = renderAll(h, SR, [CH.MONO]);
      return bitEqual(first, a) && bitEqual(again, a);
    });
    gate(resetOk, "2 Reset: a Reset edge reproduces the output from the start");
    const seedChangeOk = withInstance(o, (h) => {
      renderAll(h, SR / 2, [CH.MONO]);
      x.tp_set(...params({ ...o, seed: 99 }));
      const [after] = renderAll(h, SR, [CH.MONO]);
      const [fresh] = withInstance({ ...o, seed: 99 }, (h2) => renderAll(h2, SR, [CH.MONO]));
      return bitEqual(after, fresh) && !bitEqual(after, a);
    });
    gate(seedChangeOk, "2 Seed change restarts (== fresh instance with the new Seed)");
    const streams = [CH.L, CH.R, CH.NP_L, CH.NP_R, CH.NA_L, CH.NA_R, CH.NAUD_L, CH.NAUD_R];
    const sw = { ...base, color: P.WHITE, seed: 5 };
    const [sineAll] = withInstance({ ...sw, model: P.SINE }, (h) => [renderAll(h, SR, streams)]);
    const [switched] = withInstance({ ...sw, model: P.FILTER }, (h) => {
      const first = renderAll(h, SR / 2, streams);
      x.tp_set(...params({ ...sw, model: P.SINE }));
      const second = renderAll(h, SR / 2, streams);
      return [streams.map((_, k) => { const z = new Float64Array(SR); z.set(first[k], 0); z.set(second[k], SR / 2); return z; })];
    });
    let streamsOk = true, outOk = true;
    for (let k = 2; k < streams.length; k++) if (!bitEqual(sineAll[k], switched[k])) streamsOk = false;
    for (let k = 0; k < 2; k++) if (!bitEqual(sineAll[k].subarray(SR / 2), switched[k].subarray(SR / 2))) outOk = false;
    gate(streamsOk, "2 Model switch: n_pitch / n_amp / N_audio streams (L and R) unchanged by Filter->Sine");
    gate(outOk, "2 Model switch: Sine after Filter->Sine is bit-identical to Sine all along (phase runs in both models)");
  }

  // ---------- 3. Baselines ----------
  {
    let worst = -Infinity;
    const rows = [];
    for (const w of [0, 0.3, 0.6, 1]) for (const f of [1000, 997.3]) {
      const [y] = withInstance({ freq: f, width: w, model: P.SINE }, (h) => renderAll(h, SR, [CH.MONO]));
      // Least-squares fit of a sin + b cos + c at f; THD+N = residual / fit power.
      const om = 2 * Math.PI * f / SR;
      let m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
      for (let n = 0; n < y.length; n++) {
        const s = Math.sin(om * n), c = Math.cos(om * n), b = [s, c, 1];
        for (let i = 0; i < 3; i++) { v[i] += b[i] * y[n]; for (let j = 0; j < 3; j++) m[i][j] += b[i] * b[j]; }
      }
      const coef = solve3(m, v);
      let pr = 0, pf = 0;
      for (let n = 0; n < y.length; n++) {
        const fit = coef[0] * Math.sin(om * n) + coef[1] * Math.cos(om * n) + coef[2];
        pr += (y[n] - fit) ** 2; pf += fit * fit;
      }
      const thd = dB(pr / pf);
      worst = Math.max(worst, thd);
      rows.push(`W=${w} f=${f}: ${thd.toFixed(1)} dB`);
    }
    console.log(`     sine THD+N: ${rows.join(", ")}`);
    gate(worst < -100, `3 Sine, mods 0: THD+N worst ${worst.toFixed(1)} dB < -100 dB at every Width`);
    // White source (flat), mods 0: the output PSD is |H|^2 of the constant-peak BP.
    for (const [w, L, secs] of [[0.3, 131072, 600], [0.6, 16384, 120], [0.8, 16384, 60]]) {
      let fcEst = 0, bw = 0, how = "";
      withInstance({ freq: 1000, width: w, color: P.WHITE }, (h) => {
        const [y] = renderAll(h, secs * SR, [CH.L]);
        const { psd, df } = welch(y, L);
        if (w < 0.7) {
          ({ fc: fcEst, bw } = lorentzFit(psd, df));
          how = "Lorentz fit";
        } else {
          const hp = halfPower(smooth(psd, 2), df);
          fcEst = Math.sqrt(hp.f1 * hp.f2);
          bw = hp.f2 - hp.f1;
          how = "crossings";
        }
      });
      const bwExp = 1000 / Qof(w);
      gate(Math.abs(fcEst / 1000 - 1) < 0.005 && Math.abs(bw / bwExp - 1) < 0.1,
        `3 Filter W=${w} (${secs} s, ${how}): centre ${fcEst.toFixed(2)} Hz (fEff 1000), -3 dB width ${bw.toFixed(2)} Hz vs fEff/Q ${bwExp.toFixed(2)} (${((bw / bwExp - 1) * 100).toFixed(1)} %)`);
    }
  }

  // ---------- 4. f / Hz parity with polyBlep (direct) ----------
  {
    const n = 4 * SR;
    const inFn = (i) => (i % SR < 4000 ? -30000 + 60000 * ((i % 4000) / 4000) : 26000 * Math.sin(2 * Math.PI * i / SR * 1.5) + (i % 997 === 0 ? 1e6 : 0));
    const fIn = new Float64Array(n);
    for (let i = 0; i < n; i++) fIn[i] = inFn(i);
    const [y, fi] = withInstance({ freq: 1234, model: P.SINE, width: 0.3 }, (h) => renderAll(h, n, [CH.L, CH.FI_L], inFn));
    let incOk = true, maxErr = 0, phase = 0, sawNeg = false, sawClamp = false;
    for (let i = 0; i < n; i++) {
      const fc = Math.min(Math.max(fIn[i], -SR / 2), SR / 2); // polyBlep: clamp_hz_nyquist, phaseInc = f/fs in [-0.5, 0.5]
      if (fi[i] !== fc) incOk = false;
      if (fc < 0) sawNeg = true;
      if (Math.abs(fc) === SR / 2) sawClamp = true;
      maxErr = Math.max(maxErr, Math.abs(y[i] - Math.sin(2 * Math.PI * phase)));
      phase += fc / SR;
      phase -= Math.floor(phase);
    }
    gate(incOk && sawNeg && sawClamp, `4 per-sample Hz: fInst == clamp(f, +-Nyquist) exactly (negative Hz and >Nyquist covered), knob 1234 ignored`);
    gate(maxErr < 1e-9, `4 phase: Sine == sin(2 pi phi), phi += clamp(f)/fs (polyBlep increment), max err ${maxErr.toExponential(2)}`);
  }

  // ---------- 5. Pitch Mod symmetric in cents ----------
  {
    let worst = { mean: 0, skew: 0, sd: 1 };
    const rows = [];
    for (const color of [0, 1, 2]) for (const model of [P.FILTER, P.SINE]) for (const cents of [100, 1200]) {
      let n = 0, s1 = 0, s2 = 0, s3 = 0;
      for (const seed of [1, 2, 3, 4]) {
        withInstance({ freq: 1000, width: 0.6, pitch: cents, color, model, seed }, (h) => {
          render(h, 30 * SR, [CH.FI_L, CH.FI_R], (a) => {
            for (const arr of a) for (let i = 0; i < arr.length; i++) {
              const c = 1200 * Math.log2(arr[i] / 1000) / cents;
              n++; s1 += c; s2 += c * c; s3 += c * c * c;
            }
          });
        });
      }
      const mean = s1 / n, varc = s2 / n - mean * mean, sd = Math.sqrt(varc);
      const skew = (s3 / n - 3 * mean * varc - mean ** 3) / (sd ** 3);
      if (Math.abs(mean) > Math.abs(worst.mean)) worst.mean = mean;
      if (Math.abs(skew) > Math.abs(worst.skew)) worst.skew = skew;
      if (Math.abs(sd - 1) > Math.abs(worst.sd - 1)) worst.sd = sd;
      rows.push(`${COLORS[color]}/${model ? "sine" : "filter"}/${cents}c: mean ${mean.toFixed(3)} sd ${sd.toFixed(3)} skew ${skew.toFixed(3)}`);
    }
    for (const r of rows) console.log(`     cents (σ units, W=0.6, 4 seeds x 30 s, L+R): ${r}`);
    gate(Math.abs(worst.mean) < 0.1 && Math.abs(worst.skew) < 0.15 && Math.abs(worst.sd - 1) < 0.05,
      `5 Pitch Mod: worst mean ${worst.mean.toFixed(3)}σ (<0.1), skew ${worst.skew.toFixed(3)} (<0.15), sd ${worst.sd.toFixed(3)} (1 ± 5 %)`);
    let finite = true, maxHz = 0;
    for (const color of [0, 1, 2]) for (const model of [P.FILTER, P.SINE]) {
      withInstance({ freq: 23000, width: 1, pitch: 2400, ampMod: 1, color, model }, (h) => {
        render(h, 4 * SR, [CH.L, CH.R, CH.FI_L], (a) => {
          for (let i = 0; i < a[0].length; i++) {
            if (!Number.isFinite(a[0][i]) || !Number.isFinite(a[1][i]) || !Number.isFinite(a[2][i])) finite = false;
            maxHz = Math.max(maxHz, Math.abs(a[2][i]));
          }
        });
      });
    }
    gate(finite && maxHz <= SR / 2, `5 near Nyquist (fEff 23 kHz, 2400 c, W 1): finite, max |fInst| ${maxHz.toFixed(1)} Hz <= fs/2`);
  }

  // ---------- 6. Amp Mod spectrum (Sine, AmpMod 1) ----------
  {
    const w = 0.6, fc = 4000, bm = Bmodof(w);
    const spec = (ampMod) => {
      const [y] = withInstance({ freq: fc, width: w, model: P.SINE, ampMod, color: P.WHITE }, (h) => renderAll(h, 120 * SR, [CH.L]));
      return welch(y, 65536);
    };
    const { psd, df } = spec(1);
    const kc = Math.round(fc / df);
    let side = 0;
    for (let d = 3; d <= 10; d++) side += psd[kc - d] + psd[kc + d];
    side /= 16;
    const line = dB(psd[kc] / side);
    const ref = spec(0.5);
    let sideRef = 0;
    for (let d = 3; d <= 10; d++) sideRef += ref.psd[kc - d] + ref.psd[kc + d];
    const lineRef = dB(ref.psd[kc] / (sideRef / 16));
    gate(line < 2 && lineRef > 10, `6 Sine AmpMod 1: no carrier line (bin/sides ${line.toFixed(2)} dB; AmpMod 0.5 shows ${lineRef.toFixed(1)} dB)`);
    let worstSym = 0;
    const bands = [[1, bm], [bm, 2 * bm], [2 * bm, 4 * bm], [4 * bm, 8 * bm]];
    const symRows = [];
    for (const [a, b] of bands) {
      let up = 0, dn = 0;
      for (let k = Math.round(a / df); k <= Math.round(b / df); k++) { up += psd[kc + k]; dn += psd[kc - k]; }
      const d = dB(up / dn);
      symRows.push(`${a.toFixed(0)}-${b.toFixed(0)} Hz ${d.toFixed(2)} dB`);
      worstSym = Math.max(worstSym, Math.abs(d));
    }
    gate(worstSym < 0.5, `6 Sine AmpMod 1: spectrum symmetric about fEff (${symRows.join(", ")})`);
    const sp = smooth(psd, 3);
    const peak = sp[kc];
    let ku = kc; while (sp[ku] > peak / 2) ku++;
    let kd = kc; while (sp[kd] > peak / 2) kd--;
    const hw = 0.5 * ((ku - kc) + (kc - kd)) * df;
    gate(Math.abs(hw / bm - 1) < 0.2, `6 Sine AmpMod 1: half-width ${hw.toFixed(2)} Hz vs Bmod ${bm.toFixed(2)} Hz (${((hw / bm - 1) * 100).toFixed(1)} %)`);
  }

  // ---------- 10. Modulation stress ----------
  {
    let finite = true, mx = 0;
    const sweep = (i) => { const t = (i / SR) % 2; const u = t < 1 ? t : 2 - t; return 20 * Math.pow(18000 / 20, u); };
    for (const color of [0, 1, 2]) for (const model of [P.FILTER, P.SINE]) for (const w of [1, 0]) {
      withInstance({ width: w, pitch: 2400, ampMod: 1, color, model }, (h) => {
        render(h, 10 * SR, [CH.L, CH.R], (a) => {
          for (let i = 0; i < a[0].length; i++) {
            if (!Number.isFinite(a[0][i]) || !Number.isFinite(a[1][i])) finite = false;
            mx = Math.max(mx, Math.abs(a[0][i]), Math.abs(a[1][i]));
          }
        }, sweep);
      });
    }
    gate(finite && mx <= 8, `10 stress (Pitch Mod 2400, W 1 and 0, Amp Mod 1, f 20 Hz<->18 kHz sweep, 10 s): finite, max |y| ${mx.toFixed(3)} (limit 8)`);
  }

  // ---------- 11. Edges ----------
  {
    let finite = true, zeroOk = true, cases = 0;
    for (const freq of [0, 20000]) for (const width of [0, 1]) for (const color of [0, 1, 2]) for (const model of [P.FILTER, P.SINE]) for (const amp of [1, 0]) {
      withInstance({ freq, width, color, model, amp, pitch: 300, ampMod: 0.5 }, (h) => {
        render(h, 2 * SR, [CH.MONO, CH.L, CH.R], (a) => {
          for (const arr of a) for (let i = 0; i < arr.length; i++) {
            if (!Number.isFinite(arr[i])) finite = false;
            if (amp === 0 && arr[i] !== 0) zeroOk = false;
          }
        });
      });
      cases++;
    }
    gate(finite && zeroOk, `11 edges: Frequency 0 / 20 kHz x Width 0 / 1 x 3 colors x 2 models x Amplitude 1 / 0 (${cases} cases): finite, Amplitude 0 is exact silence`);
  }

  // ---------- 6 / 7 / 8 / 9 level results ----------
  const levels = await Promise.all(levelPromises);
  for (const w of workers) w.terminate();
  let badSamples = 0;
  for (const r of levels) badSamples += r.bad;
  gate(badSamples === 0, `level runs: no non-finite samples (${levels.reduce((s, r) => s + r.seconds, 0).toFixed(0)} s rendered)`);
  for (const color of [0, 1, 2]) {
    const width = levels.filter((r) => r.kind === "width" && r.color === color);
    const ws = width.map((r) => `W${r.w}:${r.rmsDb >= 0 ? "+" : ""}${r.rmsDb.toFixed(2)}`).join(" ");
    const maxAbs = Math.max(...width.map((r) => Math.abs(r.rmsDb)));
    gate(maxAbs < 1, `7 ${COLORS[color]} Filter level vs Width @1 kHz (dB re Sine RMS): ${ws}`);
    const at1k = width.find((r) => r.w === 0.3);
    gate(Math.abs(at1k.rmsDb) < 1, `9 ${COLORS[color]} Sine vs Filter @1 kHz (W 0.3): ${at1k.rmsDb.toFixed(2)} dB (±1)`);
    for (const w of [0.3, 0, 0.9, 1]) {
      const keys = levels.filter((r) => r.kind === "keys" && r.color === color && r.w === w);
      const row = keys.map((r) => `${r.fc}:${r.rmsDb >= 0 ? "+" : ""}${r.rmsDb.toFixed(2)}`).join(" ");
      const lo = Math.min(...keys.map((r) => r.rmsDb)), hi = Math.max(...keys.map((r) => r.rmsDb));
      if (w === 0.3 || w === 0) {
        gate(Math.max(Math.abs(lo), Math.abs(hi)) < 1, `8 ${COLORS[color]} keyboard W=${w} (dB re Sine RMS, 50 Hz..10 kHz): ${row}`);
        if (w === 0.3) gate(Math.max(Math.abs(lo), Math.abs(hi)) < 1.5, `9 ${COLORS[color]} Sine vs Filter 50 Hz..10 kHz (W 0.3): ${lo.toFixed(2)}..${hi.toFixed(2)} dB (±1.5)`);
      } else {
        console.log(`info 8 ${COLORS[color]} keyboard W=${w} (reported, not gated): ${row}`);
      }
    }
    for (const model of [P.FILTER, P.SINE]) {
      const am = levels.filter((r) => r.kind === "am" && r.color === color && r.model === model).sort((p, q) => p.a - q.a);
      const base = am[0].rmsDb;
      const row = am.map((r) => `A${r.a}:${(r.rmsDb - base) >= 0 ? "+" : ""}${(r.rmsDb - base).toFixed(2)}`).join(" ");
      const worst = Math.max(...am.map((r) => Math.abs(r.rmsDb - base)));
      gate(worst < 0.5, `6 ${COLORS[color]} ${model ? "Sine" : "Filter"} Amp Mod 0->1 RMS (dB re A0, W 0.6): ${row}`);
    }
  }
  console.log(`\n${failures.length ? `FAILED ${failures.length}` : "ALL PASSED"} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (failures.length) process.exit(1);
}
