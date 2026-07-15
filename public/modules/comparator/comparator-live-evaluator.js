// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphComparatorState() {
  return {
    wasHigh: false,
    hasPrev: false,
    prevRaw: 0,
    upPulseSamples: 0,
    downPulseSamples: 0,
  };
}

function nodeGraphComparatorSample(state, signalIn, params, sampleRate, runtime = null, nodeId = "") {
  const raw = nodeGraphSafeFilterNumber(signalIn, runtime, nodeId, null, "comparator signal in");
  const changeAmount = nodeGraphSafeFilterNumber(params.changeAmount, runtime, nodeId, null, "comparator change amount");
  const pulseTime = Math.max(0, nodeGraphSafeFilterNumber(params.pulseTime, runtime, nodeId, null, "comparator pulse time"));
  const triggerLevel = nodeGraphSafeFilterNumber(params.triggerLevel, runtime, nodeId, null, "comparator trigger level");
  const pulseLevel = nodeGraphSafeFilterNumber(params.pulseLevel, runtime, nodeId, null, "comparator pulse level");
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);

  const high = raw > changeAmount;
  const risingEdge = high && !state.wasHigh;
  const fallingEdge = !high && state.wasHigh;
  state.wasHigh = high;

  const unchanged = state.hasPrev && raw === state.prevRaw;
  state.prevRaw = raw;
  state.hasPrev = true;

  let upSpike = 0;
  if (risingEdge) {
    upSpike = triggerLevel;
    state.upPulseSamples = Math.max(1, Math.round(pulseTime * rate));
  }
  let downSpike = 0;
  if (fallingEdge) {
    downSpike = triggerLevel;
    state.downPulseSamples = Math.max(1, Math.round(pulseTime * rate));
  }

  const upPlateau = state.upPulseSamples > 0 ? pulseLevel : 0;
  const downPlateau = state.downPulseSamples > 0 ? pulseLevel : 0;
  state.upPulseSamples = Math.max(0, state.upPulseSamples - 1);
  state.downPulseSamples = Math.max(0, state.downPulseSamples - 1);

  const gate = high ? triggerLevel : 0;
  const invGate = high ? 0 : triggerLevel;
  const hold = unchanged ? triggerLevel : 0;
  const up = upSpike + upPlateau;
  const down = downSpike + downPlateau;

  return {
    Gate: nodeGraphSafeFilterNumber(gate, runtime, nodeId, null, "comparator gate"),
    "Inv Gate": nodeGraphSafeFilterNumber(invGate, runtime, nodeId, null, "comparator inv gate"),
    Hold: nodeGraphSafeFilterNumber(hold, runtime, nodeId, null, "comparator hold"),
    Up: nodeGraphSafeFilterNumber(up, runtime, nodeId, null, "comparator up"),
    Down: nodeGraphSafeFilterNumber(down, runtime, nodeId, null, "comparator down"),
    "Up/Dn": nodeGraphSafeFilterNumber(up + down, runtime, nodeId, null, "comparator up/dn"),
  };
}


// Registers the offline/render-time dispatch handler for comparator into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Follows the same extraction pattern as pulseExplosion's live evaluator.
nodeGraphLiveModuleEvaluators.comparator = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.comparatorStates.get(nodeId) || createNodeGraphComparatorState();
  runtime.comparatorStates.set(nodeId, state);
  return nodeGraphComparatorSample(
    state,
    mixInput(nodeId, "Signal In"),
    {
      changeAmount: readNodeGraphLiveEffectiveParam(runtime, node, "changeAmount", 0.5, frame, frames, frameValues),
      pulseTime: readNodeGraphLiveEffectiveParam(runtime, node, "pulseTime", 0.01, frame, frames, frameValues),
      triggerLevel: readNodeGraphLiveEffectiveParam(runtime, node, "triggerLevel", 0.5, frame, frames, frameValues),
      pulseLevel: readNodeGraphLiveEffectiveParam(runtime, node, "pulseLevel", 1, frame, frames, frameValues),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
