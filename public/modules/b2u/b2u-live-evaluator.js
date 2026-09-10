nodeGraphLiveModuleEvaluators.b2u = ({ runtime, nodeId, mixInput }) => {
  const x = nodeGraphFiniteNumber(mixInput(nodeId));
  const native = runtime?.nativeB2uReady ? runtime?.nativeB2u : null;
  if (native?.soemdsp_b2u_sample) {
    try {
      return { Out: nodeGraphFiniteNumber(native.soemdsp_b2u_sample(x)) };
    } catch (_error) {
      if (runtime) {
        runtime.nativeB2uReady = false;
      }
    }
  }
  return { Out: (x + 1) * 0.5 };
};
