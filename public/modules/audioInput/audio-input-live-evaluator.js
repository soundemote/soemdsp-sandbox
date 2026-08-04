// Input + Plugin Input share external stereo frame helper.
nodeGraphLiveModuleEvaluators.audioInput = ({ runtime, node, frame, frames, frameValues }) =>
  nodeGraphDspExternalStereoFrame(
    runtime.externalInput,
    frame,
    readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues),
  );
