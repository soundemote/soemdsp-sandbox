// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphSampleChannelAt(sample, channelIndex, frameIndex) {
  const channel = sample?.channelData?.[channelIndex] || sample?.samples;
  if (!channel?.length) {
    return 0;
  }
  const maxIndex = channel.length - 1;
  const index = clampNodeSliderValue(Number(frameIndex) || 0, 0, maxIndex);
  const low = Math.floor(index);
  const high = Math.min(maxIndex, low + 1);
  const frac = index - low;
  return (Number(channel[low]) || 0) + ((Number(channel[high]) || 0) - (Number(channel[low]) || 0)) * frac;
}


function createNodeGraphSamplePlaybackState() {
  return {
    lastReset: 0,
    phase: 0,
    playing: false,
    rangeKey: "",
    sampleId: "",
  };
}

function nodeGraphSampleStereoAt(sample, frameIndex) {
  const left = nodeGraphSampleChannelAt(sample, 0, frameIndex);
  const right = sample?.channelData?.length > 1
    ? nodeGraphSampleChannelAt(sample, 1, frameIndex)
    : left;
  return {
    Left: left,
    Mono: (left + right) * 0.5,
    Out: (left + right) * 0.5,
    Right: right,
  };
}


function nodeGraphAudioPlayerSample(runtime, node, nodeId, readInput, readParam, sampleRate) {
  const state = runtime.samplePlaybackStates.get(nodeId) || createNodeGraphSamplePlaybackState();
  runtime.samplePlaybackStates.set(nodeId, state);
  const sampleId = normalizeNodeGraphSampleId(node.sample?.id);
  const sample = runtime.samples?.get?.(sampleId);
  const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
  if (!sample || frames <= 1) {
    return { Left: 0, Mono: 0, Out: 0, Phase: 0, Right: 0 };
  }
  const start = clampNodeSliderValue(readParam("start", 0), 0, 1);
  const end = clampNodeSliderValue(readParam("end", 1), 0, 1);
  const collapsedRange = Math.abs(end - start) <= 0.000001;
  const startPhase = collapsedRange ? 0 : Math.min(start, end);
  const endPhase = collapsedRange ? 1 : Math.max(start, end);
  const span = Math.max(0.000001, endPhase - startPhase);
  const rangeKey = `${startPhase}:${endPhase}`;
  if (state.sampleId !== sampleId) {
    // Cold start / first bind: restore patch-remembered phase. Sample swap: reset.
    const restored = Number(node?.samplePhase);
    if (!state.sampleId && Number.isFinite(restored)) {
      state.phase = clampNodeSliderValue(restored, startPhase, endPhase);
    } else {
      state.phase = startPhase;
    }
    state.completed = false;
    state.sampleId = sampleId;
  } else if (state.rangeKey !== rangeKey) {
    const currentPhase = Number(state.phase);
    if (!Number.isFinite(currentPhase) || currentPhase < startPhase || currentPhase > endPhase) {
      state.phase = startPhase;
    }
    state.completed = false;
  }
  if (state.rangeKey !== rangeKey) {
    state.rangeKey = rangeKey;
  }
  const transportFallback = Object.hasOwn(node?.params || {}, "transport")
    ? 4
    : ((Number(node?.params?.loop) || 0) >= 0.5 ? 4 : 0);
  const transportMode = Math.max(0, Math.min(4, Math.round(readParam("transport", transportFallback))));
  const transportReset = transportMode <= 0;
  const transportStopped = transportMode === 1;
  // Match module labels + worklet: Loop=3, Play (once)=4
  const transportLooping = transportMode === 3;
  const transportPlayOnce = transportMode >= 4;
  if (state.transportMode !== transportMode) {
    state.completed = false;
    state.transportMode = transportMode;
  }
  // Absolute seek token from playlist scrub / track change.
  const seekToken = Number(node?.samplePhaseSeek) || 0;
  if (seekToken && seekToken !== state.seekToken) {
    const seekPhase = Number(node?.samplePhase);
    if (Number.isFinite(seekPhase)) {
      state.phase = clampNodeSliderValue(seekPhase, startPhase, endPhase);
      state.completed = false;
    }
    state.seekToken = seekToken;
  }
  const reset = readInput("Reset");
  const resetEdge = state.lastReset <= 0 && reset > 0;
  if (resetEdge || transportReset || transportStopped) {
    state.phase = startPhase;
    state.completed = false;
  }
  state.playing = (transportPlayOnce || transportLooping) && !state.completed;
  state.lastReset = reset;

  const phaseConnected = runtime.inputConnections?.has?.(nodeGraphInputKey(nodeId, "Phase"));
  const speedInput = readInput("Speed");
  const speed = readParam("speed", 1) + speedInput;
  const sampleRateRatio = (Number(sample.sampleRate) || sampleRate || 44100) / Math.max(1, sampleRate || 44100);
  const increment = (speed * sampleRateRatio) / frames;
  const basePhase = phaseConnected
    ? clampNodeSliderValue(readInput("Phase"), 0, 1)
    : clampNodeSliderValue(state.phase, 0, 1);
  // Relative offset (−1…+1 wrap; ±1 ≡ 0). Scrub without jumping transport phase.
  const phaseOffsetCycles = ((Number(readParam("phaseOffset", 0)) % 1) + 1) % 1;
  const phaseWithOffset = basePhase + phaseOffsetCycles;
  const boundedPhase = startPhase + wrapNodeSliderValue((phaseWithOffset - startPhase) / span, 0, 1) * span;
  const frameIndex = boundedPhase * (frames - 1);
  const stereo = nodeGraphSampleStereoAt(sample, frameIndex);
  const level = readParam("level", 1);
  let done = 0;
  if (!phaseConnected && state.playing) {
    const nextPhase = basePhase + increment;
    if (transportLooping) {
      const normalizedNext = (nextPhase - startPhase) / span;
      done = normalizedNext < 0 || normalizedNext >= 1 ? 1 : 0;
      state.phase = startPhase + wrapNodeSliderValue((nextPhase - startPhase) / span, 0, 1) * span;
    } else if (speed >= 0 && nextPhase >= endPhase) {
      state.phase = endPhase;
      state.completed = true;
      state.playing = false;
      done = 1;
    } else if (speed < 0 && nextPhase <= startPhase) {
      state.phase = startPhase;
      state.completed = true;
      state.playing = false;
      done = 1;
    } else {
      state.phase = clampNodeSliderValue(nextPhase, startPhase, endPhase);
    }
  } else if (!phaseConnected && (transportReset || transportStopped)) {
    state.phase = startPhase;
  } else if (phaseConnected) {
    state.phase = clampNodeSliderValue(readInput("Phase"), 0, 1);
  }
  const outputActive = state.playing;
  return {
    Left: outputActive ? stereo.Left * level : 0,
    Mono: outputActive ? stereo.Mono * level : 0,
    Out: outputActive ? stereo.Mono * level : 0,
    Phase: boundedPhase,
    Right: outputActive ? stereo.Right * level : 0,
    Trigger: done,
  };
}


// Registers the offline/render-time dispatch handler for audioPlayer into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.audioPlayer = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const readParam = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  return nodeGraphAudioPlayerSample(
    runtime,
    node,
    nodeId,
    (port) => mixInput(nodeId, port),
    readParam,
    sampleRate,
  );
};
