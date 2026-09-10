nodeGraphLiveModuleEvaluators.u2b = ({ runtime, nodeId, mixInput }) => {
  const x = nodeGraphFiniteNumber(mixInput(nodeId));
  const native = runtime?.nativeU2bReady ? runtime?.nativeU2b : null;
  if (native?.soemdsp_u2b_sample) {
    try {
      return { Out: nodeGraphFiniteNumber(native.soemdsp_u2b_sample(x)) };
    } catch (_error) {
      if (runtime) {
        runtime.nativeU2bReady = false;
      }
    }
  }
  return { Out: x * 2 - 1 };
};
