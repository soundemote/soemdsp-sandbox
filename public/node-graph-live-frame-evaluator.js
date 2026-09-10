// APP_POLICY §0b / §2 / §5: JS per-sample audio evaluation is retired.
// Product Live/Render use the native graph worklet only.
// This file remains a tiny registry stub for any remaining main-thread
// thru/controller self-registers (not audio kernels).

var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators
  || (globalThis.nodeGraphLiveModuleEvaluators = {});

function nodeGraphSafeFilterNumber(value, runtime, nodeId, state, source) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return number;
  }
  if (typeof nodeGraphMarkRuntimeBadNumber === "function") {
    nodeGraphMarkRuntimeBadNumber(runtime, nodeId, `${source} nonfinite`);
  }
  return 0;
}

/** Retired: always silence. Do not reintroduce JS DSP here. */
function evaluateNodeGraphPlanFrame(_runtime, _sampleRate, _frame, _frames) {
  return { left: 0, right: 0 };
}
