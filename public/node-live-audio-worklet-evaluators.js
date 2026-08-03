// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Cluster files (sources / processors / utility) supply the map entries.
// Loaded immediately after the core class in the worklet Blob and any main-thread
// worklet-core include order. Behavior must match the prior monolith bit-for-bit.

NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators = function buildLiveModuleEvaluators() {
  const out = {};
  const parts = [
    this.buildLiveModuleEvaluators_sources,
    this.buildLiveModuleEvaluators_processors,
    this.buildLiveModuleEvaluators_utility,
  ];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (typeof part === "function") {
      Object.assign(out, part.call(this));
    }
  }
  return out;
};
