nodeGraphLiveModuleEvaluators.inv = ({ runtime, nodeId, mixInput }) => {
  const x = nodeGraphFiniteNumber(mixInput(nodeId));
  const native = runtime?.nativeInvReady ? runtime?.nativeInv : null;
  if (native?.soemdsp_inv_sample) {
    try {
      return { Out: nodeGraphFiniteNumber(native.soemdsp_inv_sample(x)) };
    } catch (_error) {
      if (runtime) {
        runtime.nativeInvReady = false;
      }
    }
  }
  return { Out: -x };
};
