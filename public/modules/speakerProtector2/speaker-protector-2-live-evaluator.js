// Offline/render-time dispatch for Speaker Protector 2.0.

nodeGraphLiveModuleEvaluators.speakerProtector2 = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  if (!runtime.speakerProtector2States) {
    runtime.speakerProtector2States = new Map();
  }
  const rate = Number(sampleRate) || Number(runtime.sampleRate) || 44100;
  const state = runtime.speakerProtector2States.get(nodeId)
    || createNodeGraphSpeakerProtector2State(rate);
  runtime.speakerProtector2States.set(nodeId, state);
  const dropSeconds = readNodeGraphLiveEffectiveParam(
    runtime, node, "dropSeconds", NODE_GRAPH_SPEAKER_PROTECTOR2_DROP_SECONDS, frame, frames, frameValues,
  );
  const holdSeconds = readNodeGraphLiveEffectiveParam(
    runtime, node, "holdSeconds", NODE_GRAPH_SPEAKER_PROTECTOR2_HOLD_SECONDS, frame, frames, frameValues,
  );
  const riseSeconds = readNodeGraphLiveEffectiveParam(
    runtime, node, "riseSeconds", NODE_GRAPH_SPEAKER_PROTECTOR2_RISE_SECONDS, frame, frames, frameValues,
  );
  return nodeGraphSpeakerProtector2Frame(
    state,
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    rate,
    { dropSeconds, holdSeconds, riseSeconds },
  );
};
