// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphSpeakerProtectionSample(value, runtime, nodeId) {
  const number = Number(value);
  const unsafe = !Number.isFinite(number) || Math.abs(number) > 1;
  if (unsafe && runtime) {
    runtime.speakerProtectionMuteCount = (runtime.speakerProtectionMuteCount || 0) + 1;
    runtime.speakerProtectionPeak = Math.max(
      Number(runtime.speakerProtectionPeak) || 0,
      Number.isFinite(number) ? Math.abs(number) : Infinity,
    );
    runtime.lastSpeakerProtection = { nodeId, peak: runtime.speakerProtectionPeak };
  }
  return unsafe ? 0 : number;
}


// Registers the offline/render-time dispatch handler for speakerProtection into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.speakerProtection = ({ runtime, nodeId, mixInput }) => {
  const speakerProtectionMono = mixInput(nodeId);
  return {
    Out: nodeGraphSpeakerProtectionSample(speakerProtectionMono, runtime, nodeId),
    Left: nodeGraphSpeakerProtectionSample(mixInput(nodeId, "Left") + speakerProtectionMono, runtime, nodeId),
    Right: nodeGraphSpeakerProtectionSample(mixInput(nodeId, "Right") + speakerProtectionMono, runtime, nodeId),
  };
};
