function nodeGraphBaseSampleRate() {
  const sampleRate = Math.round(Number(nodeGraphMvp?.sampleRate));
  return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
}

function nodeGraphTargetSampleRate(patch = nodeGraphMvp.patch) {
  return normalizeNodeGraphPatchAudio(patch?.audio).targetSampleRate;
}

/**
 * App-wide policy: oversampling is UNDER CONSTRUCTION — always ×1.
 * Kept so patches/UI can still store targetSampleRate without changing live cost.
 */
const nodeGraphOversamplingEnabled = false;

const nodeGraphOversamplingPresets = Object.freeze([1, 2, 4]);

function nodeGraphOversamplingMultiplier(_baseRate, _targetRate) {
  // Under construction: never run multi-rate live/render engine.
  if (!nodeGraphOversamplingEnabled) {
    return 1;
  }
  const base = Number(_baseRate);
  const target = Number(_targetRate);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(target) || target <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(4, target / base));
}

function nodeGraphOversamplingPresetForRatio(ratio) {
  if (!nodeGraphOversamplingEnabled) {
    return "1";
  }
  const value = Number(ratio);
  if (!Number.isFinite(value) || value <= 0) {
    return "1";
  }
  for (const preset of nodeGraphOversamplingPresets) {
    if (Math.abs(value - preset) < 0.001) {
      return String(preset);
    }
  }
  return "custom";
}

function nodeGraphTargetSampleRateForOversampling(multiplier, baseRate = nodeGraphBaseSampleRate()) {
  const base = Number(baseRate);
  const safeBase = Number.isFinite(base) && base > 0 ? base : 44100;
  if (!nodeGraphOversamplingEnabled) {
    return Math.round(safeBase);
  }
  const preset = nodeGraphOversamplingPresets.includes(Number(multiplier))
    ? Number(multiplier)
    : 1;
  return Math.round(safeBase * preset);
}

function nodeGraphEffectiveSampleRate(baseRate, multiplier) {
  const base = Number(baseRate);
  if (!Number.isFinite(base) || base <= 0) {
    return base;
  }
  if (!nodeGraphOversamplingEnabled) {
    return base;
  }
  const factor = Number(multiplier);
  if (!Number.isFinite(factor) || factor <= 0) {
    return base;
  }
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
  const value = Number(ratio);
  if (!Number.isFinite(value) || value <= 0) {
    return "x1";
  }
  return `x${Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function nodeGraphAudioDerivation(patch = nodeGraphMvp.patch) {
  const currentSampleRate = nodeGraphBaseSampleRate();
  // Keep patch target for future OS work; live/render engine always 1× while disabled.
  const targetSampleRate = nodeGraphTargetSampleRate(patch);
  const oversamplingRatio = nodeGraphOversamplingMultiplier(currentSampleRate, targetSampleRate);
  const clampedEngineSampleRate = nodeGraphEffectiveSampleRate(currentSampleRate, oversamplingRatio);
  return {
    clampedEngineSampleRate,
    currentSampleRate,
    outputSampleRate: currentSampleRate,
    oversampling: oversamplingRatio,
    oversamplingRatio,
    resultingSampleRate: clampedEngineSampleRate,
    targetSampleRate,
  };
}

function nodeGraphSampleRateDebugText(reason = "") {
  const audio = nodeGraphAudioDerivation();
  const host = Number(nodeGraphMvp?.live?.context?.sampleRate) || 0;
  const decode = Number(
    typeof nodeGraphSampleDecodeTargetRate !== "undefined"
      ? nodeGraphSampleDecodeTargetRate
      : 44100,
  ) || 44100;
  const live = nodeGraphMvp?.live?.context ? "on" : "off";
  const prefix = reason ? `sample rates (${reason})` : "sample rates";
  return `${prefix} — live ${live}, host ${host || "n/a"} Hz, engine ${audio.clampedEngineSampleRate} Hz, decode ${decode} Hz, patch target ${audio.targetSampleRate} Hz`;
}

function logNodeGraphSampleRateInfo(reason = "") {
  const line = nodeGraphSampleRateDebugText(reason);
  if (typeof window !== "undefined" && typeof window.SE?.INFO === "function") {
    window.SE.INFO(line);
  }
  return line;
}
