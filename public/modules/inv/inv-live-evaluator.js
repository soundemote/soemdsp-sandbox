nodeGraphLiveModuleEvaluators.inv = ({ runtime, nodeId, mixInput }) => {
  const x = Number(mixInput(nodeId)) || 0;
  const native = runtime?.nativeInvReady ? runtime?.nativeInv : null;
  if (native?.soemdsp_inv_sample) {
    try {
      return { Out: Number(native.soemdsp_inv_sample(x)) || 0 };
    } catch (_error) {
      if (runtime) {
        runtime.nativeInvReady = false;
      }
    }
  }
  return { Out: -x };
};
