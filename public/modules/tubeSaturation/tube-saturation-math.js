// Tube Saturation — first-order Koren-style load-line tables (JS twin).
// Matches native_modules/tube_saturation/tube_saturation.cpp.
// Drive / Bias / Load / Mix / Amplitude are parameters (+ auto MOD) only.

(function initNodeGraphTubeSaturationMath(global) {
  const kMu = 100;
  const kEx = 1.4;
  const kKg1 = 1060;
  const kKp = 600;
  const kKvb = 300;
  const kVbb = 250;
  const kNumLoads = 8;
  const kNumVg = 257;
  const kVgMin = -5;
  const kVgMax = 1;
  const kRLoads = [12000, 22000, 33000, 47000, 68000, 100000, 150000, 220000];

  let tablesReady = false;
  /** @type {Float64Array[]} */
  let vpTable = [];
  /** @type {number[]} */
  let outScale = [];

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }

  function softplus(arg) {
    if (arg > 30) return arg;
    if (arg < -30) return Math.exp(arg);
    return Math.log(1 + Math.exp(arg));
  }

  function korenIp(vg, vp) {
    const vpSafe = vp < 1e-6 ? 1e-6 : vp;
    const denom = Math.sqrt(kKvb + vpSafe * vpSafe);
    const arg = kKp * (1 / kMu + vg / denom);
    const e1 = (vpSafe / kKp) * softplus(arg);
    if (!(e1 > 0)) return 0;
    return Math.pow(e1, kEx) / kKg1;
  }

  function solveVp(vg, rLoad) {
    let lo = 0.5;
    let hi = kVbb;
    for (let i = 0; i < 48; i += 1) {
      const mid = 0.5 * (lo + hi);
      const ip = korenIp(vg, mid);
      const vpTarget = kVbb - rLoad * ip;
      if (mid > vpTarget) hi = mid;
      else lo = mid;
    }
    return 0.5 * (lo + hi);
  }

  function ensureTables() {
    if (tablesReady) return;
    vpTable = [];
    outScale = [];
    for (let li = 0; li < kNumLoads; li += 1) {
      const r = kRLoads[li];
      const row = new Float64Array(kNumVg);
      let vpMin = Infinity;
      let vpMax = -Infinity;
      for (let vi = 0; vi < kNumVg; vi += 1) {
        const t = vi / (kNumVg - 1);
        const vg = kVgMin + t * (kVgMax - kVgMin);
        const vp = solveVp(vg, r);
        row[vi] = vp;
        if (vp < vpMin) vpMin = vp;
        if (vp > vpMax) vpMax = vp;
      }
      vpTable.push(row);
      const span = vpMax - vpMin;
      outScale.push(span > 1e-6 ? 0.5 * span : 1);
    }
    tablesReady = true;
  }

  function lookupVp(loadIdx, vg) {
    const vgC = clamp(vg, kVgMin, kVgMax);
    const t = (vgC - kVgMin) / (kVgMax - kVgMin);
    const idx = t * (kNumVg - 1);
    const i0 = Math.max(0, Math.min(kNumVg - 2, Math.floor(idx)));
    const frac = clamp(idx - i0, 0, 1);
    const row = vpTable[loadIdx];
    return row[i0] + frac * (row[i0 + 1] - row[i0]);
  }

  function tubeWet(input, drive, bias, load) {
    ensureTables();
    const fin =
      typeof nodeGraphFiniteNumber === "function"
        ? nodeGraphFiniteNumber
        : (v, fb = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
          };
    const x = fin(input);
    const d = clamp(fin(drive, 0.5), 0, 4);
    const b = clamp(fin(bias), -1, 1);
    const vgBias = -1.2 + b * 2;
    const vg = vgBias + x * d * 2;
    const load01 = clamp(fin(load, 0.5), 0, 1);
    const loadPos = load01 * (kNumLoads - 1);
    const li0 = Math.max(0, Math.min(kNumLoads - 2, Math.floor(loadPos)));
    const li1 = li0 + 1;
    const loadFrac = clamp(loadPos - li0, 0, 1);
    // AC relative to idle plate at this Bias (input=0).
    const vpIdle0 = lookupVp(li0, vgBias);
    const vpIdle1 = lookupVp(li1, vgBias);
    const vp0 = lookupVp(li0, vg);
    const vp1 = lookupVp(li1, vg);
    const ac0 = (vpIdle0 - vp0) / outScale[li0];
    const ac1 = (vpIdle1 - vp1) / outScale[li1];
    return ac0 + loadFrac * (ac1 - ac0);
  }

  /**
   * @param {number} input
   * @param {number} [drive]
   * @param {number} [bias]
   * @param {number} [load]
   * @param {number} [mix]
   * @param {number} [amplitude]
   */
  function nodeGraphTubeSaturationSample(
    input,
    drive = 0.5,
    bias = 0,
    load = 0.5,
    mix = 1,
    amplitude = 1,
  ) {
    const fin =
      typeof nodeGraphFiniteNumber === "function"
        ? nodeGraphFiniteNumber
        : (v, fb = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
          };
    const x = fin(input);
    const wet = tubeWet(x, drive, bias, load);
    const m = clamp(fin(mix, 1), 0, 1);
    const amp = clamp(fin(amplitude, 1), 0, 1);
    return (x * (1 - m) + wet * m) * amp;
  }

  /**
   * SoftClipper-style Mono/L/R frame. Mono folds into L/R when sides silent.
   * @returns {{ Out: number, Left: number, Right: number }}
   */
  function nodeGraphTubeSaturationFrame(
    mono,
    left,
    right,
    drive = 0.5,
    bias = 0,
    load = 0.5,
    mix = 1,
    amplitude = 1,
  ) {
    const fin =
      typeof nodeGraphFiniteNumber === "function"
        ? nodeGraphFiniteNumber
        : (v, fb = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fb;
          };
    const m = fin(mono);
    const outM = nodeGraphTubeSaturationSample(m, drive, bias, load, mix, amplitude);
    const outL = nodeGraphTubeSaturationSample(
      fin(left) + m,
      drive,
      bias,
      load,
      mix,
      amplitude,
    );
    const outR = nodeGraphTubeSaturationSample(
      fin(right) + m,
      drive,
      bias,
      load,
      mix,
      amplitude,
    );
    return { Out: outM, Left: outL, Right: outR };
  }

  global.nodeGraphTubeSaturationSample = nodeGraphTubeSaturationSample;
  global.nodeGraphTubeSaturationFrame = nodeGraphTubeSaturationFrame;
})(typeof globalThis !== "undefined" ? globalThis : self);