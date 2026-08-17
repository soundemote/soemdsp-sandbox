nodeGraphLiveModuleEvaluators.u2b = ({ runtime, nodeId, mixInput }) => {
  const x = Number(mixInput(nodeId)) || 0;
  const native = runtime?.nativeU2bReady ? runtime?.nativeU2b : null;
  if (native?.soemdsp_u2b_sample) {
    try {
      return { Out: Number(native.soemdsp_u2b_sample(x)) || 0 };
    } catch (_error) {
      if (runtime) {
        runtime.nativeU2bReady = false;
      }
    }
  }
  return { Out: x * 2 - 1 };
};
