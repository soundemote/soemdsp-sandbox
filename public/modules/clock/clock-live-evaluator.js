// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphClockAnalogWhipSample(phase, level) {
  const p = clampNodeSliderValue(Number(phase) || 0, 0, 1);
  const attack = 1 - Math.pow(1 - Math.min(1, p / 0.035), 4);
  const release = Math.pow(Math.max(0, 1 - p), 1.85);
  const snapEnvelope = attack * release;
  const sweepTurns = (3.15 * (1 - Math.exp(-4.2 * p)) / (1 - Math.exp(-4.2))) + (0.18 * Math.sin(Math.PI * p));
  const liquidBend = 0.075 * Math.sin(Math.PI * 2 * p) * Math.pow(Math.max(0, 1 - p), 1.2);
  const body = Math.sin((sweepTurns + liquidBend) * Math.PI * 2);
  const sheen = Math.sin((sweepTurns * 2.02 + 0.17) * Math.PI * 2) * 0.16 * Math.pow(Math.max(0, 1 - p), 2.8);
  return (body + sheen) * snapEnvelope * level;
}


function createNodeGraphClockState() {
  return {
    hasStarted: false,
    phase: 0,
  };
}

function nodeGraphClockSample(state, reset, phaseOffset, rate, duty, level, sampleRate, runtime = null, nodeId = "") {
  const safeReset = nodeGraphSafeFilterNumber(reset, runtime, nodeId, null, "clock reset");
  const safePhaseOffset = wrapNodeSliderValue(
    nodeGraphSafeFilterNumber(phaseOffset, runtime, nodeId, null, "clock phase"),
    0,
    1,
  );
  const safeRate = Math.max(0, nodeGraphSafeFilterNumber(rate, runtime, nodeId, null, "clock rate"));
  const safeDuty = clampNodeSliderValue(
    nodeGraphSafeFilterNumber(duty, runtime, nodeId, null, "clock duty"),
    0,
    1,
  );
  const safeLevel = nodeGraphSafeFilterNumber(level, runtime, nodeId, null, "clock level");
  const resetActive = safeReset > 0;
  const rawPhase = resetActive ? 0 : wrapNodeSliderValue(Number(state.phase) || 0, 0, 1);
  const phase = wrapNodeSliderValue(rawPhase + safePhaseOffset, 0, 1);
  const digital = phase < safeDuty ? safeLevel : 0;
  const analog = nodeGraphClockAnalogWhipSample(phase, safeLevel);
  const nextRawPhase = wrapNodeSliderValue(rawPhase + safeRate / Math.max(1, sampleRate), 0, 1);
  const pulse = safeRate > 0 && !resetActive && (!state.hasStarted || nextRawPhase < rawPhase) ? safeLevel : 0;
  state.hasStarted = !resetActive;
  state.phase = resetActive ? 0 : nextRawPhase;
  return {
    "Analog Out": analog,
    "Digital Out": digital,
    Out: digital,
    Pulse: pulse,
  };
}


// Registers the offline/render-time dispatch handler for clock into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.clock = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.clockStates.get(nodeId) || createNodeGraphClockState();
  runtime.clockStates.set(nodeId, state);
  return nodeGraphClockSample(
    state,
    mixInput(nodeId, "Reset"),
    readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues),
    readNodeGraphLiveEffectiveParam(runtime, node, "rate", 2, frame, frames, frameValues),
    readNodeGraphLiveEffectiveParam(runtime, node, "duty", 0.5, frame, frames, frameValues),
    readNodeGraphLiveEffectiveParam(runtime, node, "level", 1, frame, frames, frameValues),
    sampleRate,
    runtime,
    nodeId,
  );
};
