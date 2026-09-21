function nodeGraphBaseSampleRate() {
  const sampleRate = Math.round(Number(nodeGraphMvp?.sampleRate));
  return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
}

/** Host rate Live actually runs at (AudioContext). Render must use this too. */
function nodeGraphLiveHostSampleRate() {
  const live = Number(nodeGraphMvp?.live?.context?.sampleRate);
  if (Number.isFinite(live) && live > 0) {
    return live;
  }
  return nodeGraphBaseSampleRate();
}

function nodeGraphTargetSampleRate(patch = nodeGraphMvp.patch) {
  return normalizeNodeGraphPatchAudio(patch?.audio).targetSampleRate;
}

/** Live + render oversampling factors (host rate unchanged). */
const nodeGraphOversamplingEnabled = true;

const nodeGraphOversamplingPresets = Object.freeze([1, 2, 4]);

function nodeGraphNormalizeOversamplingFactor(value) {
  const n = Math.round(Number(value));
  if (n === 2 || n === 4) {
    return n;
  }
  return 1;
}

function nodeGraphOversamplingFactorFromPatch(patch = nodeGraphMvp?.patch) {
  const audio = typeof normalizeNodeGraphPatchAudio === "function"
    ? normalizeNodeGraphPatchAudio(patch?.audio)
    : (patch?.audio || {});
  if (Object.hasOwn(audio, "oversamplingFactor") || audio.oversamplingFactor != null) {
    return nodeGraphNormalizeOversamplingFactor(audio.oversamplingFactor);
  }
  // Legacy: infer from targetSampleRate / host when possible.
  const base = nodeGraphBaseSampleRate();
  const target = Number(audio.targetSampleRate);
  if (Number.isFinite(target) && target > 0 && base > 0) {
    const ratio = target / base;
    for (const preset of nodeGraphOversamplingPresets) {
      if (Math.abs(ratio - preset) < 0.05) {
        return preset;
      }
    }
  }
  return 1;
}

function nodeGraphOversamplingMultiplier(_baseRate, _targetRate) {
  if (!nodeGraphOversamplingEnabled) {
    return 1;
  }
  // Prefer explicit factor; fall back to target/host snap.
  if (typeof nodeGraphMvp !== "undefined") {
    return nodeGraphOversamplingFactorFromPatch(nodeGraphMvp?.patch);
  }
  const base = Number(_baseRate);
  const target = Number(_targetRate);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(target) || target <= 0) {
    return 1;
  }
  const ratio = target / base;
  for (const preset of nodeGraphOversamplingPresets) {
    if (Math.abs(ratio - preset) < 0.05) {
      return preset;
    }
  }
  return 1;
}

function nodeGraphOversamplingPresetForRatio(ratio) {
  const value = nodeGraphNormalizeOversamplingFactor(ratio);
  return String(value);
}

function nodeGraphTargetSampleRateForOversampling(multiplier, baseRate = nodeGraphBaseSampleRate()) {
  const base = Number(baseRate);
  const safeBase = Number.isFinite(base) && base > 0 ? base : 44100;
  const preset = nodeGraphNormalizeOversamplingFactor(multiplier);
  return Math.round(safeBase * preset);
}

function nodeGraphEffectiveSampleRate(baseRate, multiplier) {
  const base = Number(baseRate);
  if (!Number.isFinite(base) || base <= 0) {
    return base;
  }
  const factor = nodeGraphNormalizeOversamplingFactor(multiplier);
  return base * factor;
}

function nodeGraphFormatSampleRate(sampleRate) {
  const value = Number(sampleRate);
  if (!Number.isFinite(value)) {
    return "0 Hz";
  }
  return `${Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} Hz`;
}

function nodeGraphFormatOversamplingRatio(ratio) {
  const value = nodeGraphNormalizeOversamplingFactor(ratio);
  return `x${value}`;
}

function nodeGraphAudioDerivation(patch = nodeGraphMvp?.patch, hostRate = null) {
  const currentSampleRate = Number.isFinite(Number(hostRate)) && Number(hostRate) > 0
    ? Number(hostRate)
    : nodeGraphLiveHostSampleRate();
  const factor = nodeGraphOversamplingFactorFromPatch(patch);
  const targetSampleRate = nodeGraphTargetSampleRateForOversampling(factor, currentSampleRate);
  const oversamplingRatio = factor;
  const clampedEngineSampleRate = nodeGraphEffectiveSampleRate(currentSampleRate, oversamplingRatio);
  return {
    clampedEngineSampleRate,
    currentSampleRate,
    outputSampleRate: currentSampleRate,
    oversampling: oversamplingRatio,
    oversamplingFactor: factor,
    oversamplingRatio,
    resultingSampleRate: clampedEngineSampleRate,
    targetSampleRate,
  };
}

function nodeGraphSampleRateDebugText(reason = "") {
  const audio = nodeGraphAudioDerivation();
  const host = nodeGraphFiniteNumber(nodeGraphMvp?.live?.context?.sampleRate);
  const decode = nodeGraphFiniteNumber(
    typeof nodeGraphSampleDecodeTargetRate !== "undefined"
      ? nodeGraphSampleDecodeTargetRate
      : 44100,
    44100,
  );
  const live = nodeGraphMvp?.live?.context ? "on" : "off";
  const prefix = reason ? `sample rates (${reason})` : "sample rates";
  return `${prefix} — live ${live}, host ${host || "n/a"} Hz, engine ${audio.clampedEngineSampleRate} Hz, OS x${audio.oversamplingFactor}, decode ${decode} Hz`;
}

function logNodeGraphSampleRateInfo(reason = "") {
  const line = nodeGraphSampleRateDebugText(reason);
  if (typeof window !== "undefined" && typeof window.SE?.INFO === "function") {
    window.SE.INFO(line);
  }
  return line;
}
