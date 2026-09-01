// Offline/render: crossover2 … crossover6 — same native core as worklet (APP_POLICY §5).
// Silence until crossover.wasm is ready on the main thread (APP_POLICY §2).

const nodeGraphCrossoverMainWasm = {
  promise: null,
  exports: null,
  failed: false,
};

function nodeGraphCrossoverLoadMainWasm() {
  if (nodeGraphCrossoverMainWasm.promise || nodeGraphCrossoverMainWasm.failed) return;
  if (typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    nodeGraphCrossoverMainWasm.failed = true;
    return;
  }
  nodeGraphCrossoverMainWasm.promise = fetch("/native_modules/crossover/crossover.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`crossover wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphCrossoverMainWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphCrossoverMainWasm.failed = true;
    });
}

function nodeGraphCrossoverSilentPorts(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  const out = {};
  if (typeof nodeGraphCrossoverOutputPorts === "function") {
    for (const p of nodeGraphCrossoverOutputPorts(n)) out[p] = 0;
    return out;
  }
  out.LFL = 0;
  out.LFR = 0;
  out.HFL = 0;
  out.HFR = 0;
  return out;
}

function nodeGraphCrossoverLiveReadFreqs(runtime, node, nodeId, bandCount, frame, frames, frameValues, mixInput, hasInput) {
  const splitCount = bandCount - 1;
  const defaults = typeof nodeGraphCrossoverDefaultFreqs === "function"
    ? nodeGraphCrossoverDefaultFreqs(bandCount)
    : [];
  const freqs = [];
  for (let i = 0; i < splitCount; i += 1) {
    const key = splitCount === 1 ? "frequency" : `frequency${i + 1}`;
    const fallback = defaults[i] ?? 1000;
    const knobHz = readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
    // 2-crossover has one split: wired ƒ is that split in Hz. Multi-way stays knob-only.
    freqs.push(
      splitCount === 1
        ? nodeGraphFrequencyHzFromKnobOrF(knobHz, hasInput, mixInput, nodeId)
        : knobHz,
    );
  }
  return freqs;
}

function nodeGraphCrossoverMainSample(runtime, nodeId, bandCount, mono, left, right, freqs, lrOrder, sampleRate) {
  nodeGraphCrossoverLoadMainWasm();
  const wasm = nodeGraphCrossoverMainWasm.exports;
  if (
    !wasm?.soemdsp_crossover_create
    || !wasm?.soemdsp_crossover_sample
    || !wasm?.soemdsp_crossover_band_l
    || !wasm?.soemdsp_crossover_band_r
  ) {
    return nodeGraphCrossoverSilentPorts(bandCount);
  }
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  if (!runtime.crossoverMainNativeHandles) runtime.crossoverMainNativeHandles = new Map();
  let handle = runtime.crossoverMainNativeHandles.get(nodeId) || 0;
  const bandKey = `${nodeId}:bands`;
  if (!runtime.crossoverMainNativeBandCounts) runtime.crossoverMainNativeBandCounts = new Map();
  const prevBands = runtime.crossoverMainNativeBandCounts.get(nodeId);
  if (handle && prevBands !== n) {
    try { wasm.soemdsp_crossover_destroy?.(handle); } catch (_) { /* ignore */ }
    handle = 0;
  }
  if (!handle) {
    handle = wasm.soemdsp_crossover_create(n);
    if (handle) {
      runtime.crossoverMainNativeHandles.set(nodeId, handle);
      runtime.crossoverMainNativeBandCounts.set(nodeId, n);
    }
  }
  if (!handle) return nodeGraphCrossoverSilentPorts(n);
  const f = Array.isArray(freqs) ? freqs : [];
  wasm.soemdsp_crossover_sample(
    handle,
    Number(mono) || 0,
    Number(left) || 0,
    Number(right) || 0,
    Number(f[0]) || 0,
    Number(f[1]) || 0,
    Number(f[2]) || 0,
    Number(f[3]) || 0,
    Number(f[4]) || 0,
    Math.round(Number(lrOrder) || 4),
    Math.max(1, Number(sampleRate) || 44100),
  );
  const out = {};
  for (let i = 0; i < n; i += 1) {
    const pair = typeof nodeGraphCrossoverBandPortPair === "function"
      ? nodeGraphCrossoverBandPortPair(n, i)
      : (i === 0 ? { L: "LFL", R: "LFR" } : i === n - 1 ? { L: "HFL", R: "HFR" } : { L: `L${i}`, R: `R${i}` });
    const lv = Number(wasm.soemdsp_crossover_band_l(handle, i));
    const rv = Number(wasm.soemdsp_crossover_band_r(handle, i));
    out[pair.L] = Number.isFinite(lv) ? lv : 0;
    out[pair.R] = Number.isFinite(rv) ? rv : 0;
  }
  return out;
}

function nodeGraphCrossoverRegisterLive(bandCount) {
  const type = `crossover${bandCount}`;
  nodeGraphLiveModuleEvaluators[type] = ({
    runtime,
    node,
    nodeId,
    frame,
    frames,
    frameValues,
    mixInput,
    hasInput,
    sampleRate,
  }) => {
    const lrOrder = readNodeGraphLiveEffectiveParam(runtime, node, "order", 4, frame, frames, frameValues);
    const freqs = nodeGraphCrossoverLiveReadFreqs(
      runtime, node, nodeId, bandCount, frame, frames, frameValues, mixInput, hasInput,
    );
    const out = nodeGraphCrossoverMainSample(
      runtime,
      nodeId,
      bandCount,
      mixInput(nodeId),
      mixInput(nodeId, "L") + mixInput(nodeId, "Left"),
      mixInput(nodeId, "R") + mixInput(nodeId, "Right"),
      freqs,
      lrOrder,
      sampleRate,
    );
    const safe = {};
    for (const [k, v] of Object.entries(out)) {
      safe[k] = typeof nodeGraphSafeFilterNumber === "function"
        ? nodeGraphSafeFilterNumber(v, runtime, nodeId, null, `crossover ${k}`)
        : v;
    }
    return safe;
  };
}

for (let n = 2; n <= 6; n += 1) {
  nodeGraphCrossoverRegisterLive(n);
}
