// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphSampleChannelAt(sample, channelIndex, frameIndex) {
  const channel = sample?.channelData?.[channelIndex] || sample?.samples;
  if (typeof nodeGraphSampleReadHermite === "function") {
    return nodeGraphSampleReadHermite(channel, frameIndex);
  }
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
    lastGate: 0,
    lastReset: 0,
    lastTrigger: 0,
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
  const phaseOffset = Number(readParam("phaseOffset", 0)) || 0;
  const phaseSkip = Number(readParam("phase", 0)) || 0;
  const playlistScrub = Number(readParam("playlistScrub", 0)) || 0;
  const phaseWithOffset = basePhase + phaseOffset + phaseSkip + playlistScrub;
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
function nodeGraphSampleLibrarySample(runtime, node, nodeId, readInput, readParam, sampleRate) {
  const state = runtime.samplePlaybackStates.get(nodeId) || createNodeGraphSamplePlaybackState();
  runtime.samplePlaybackStates.set(nodeId, state);
  const sampleId = normalizeNodeGraphSampleId(node.sample?.id);
  const sample = runtime.samples?.get?.(sampleId);
  const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
  if (!sample || frames <= 1) {
    return { Left: 0, Out: 0, Right: 0 };
  }
  const start = clampNodeSliderValue(readParam("start", 0), 0, 1);
  const end = clampNodeSliderValue(readParam("end", 1), 0, 1);
  const startPhase = Math.min(start, end);
  const endPhase = Math.max(start, end);
  const span = Math.max(0.000001, endPhase - startPhase);
  const trigger = readInput("Trigger");
  const reset = readInput("Reset");
  const triggerEdge = (state.lastTrigger || 0) <= 0 && trigger > 0;
  const resetEdge = (state.lastReset || 0) <= 0 && reset > 0;
  if (resetEdge) {
    state.phase = startPhase;
    state.playing = false;
    state.completed = false;
  }
  if (triggerEdge) {
    state.phase = startPhase;
    state.playing = true;
    state.completed = false;
  }
  state.lastTrigger = trigger;
  state.lastReset = reset;
  const oneShot = readParam("oneShot", 1) >= 0.5;
  const pitch = readParam("pitch", 0);
  const level = readParam("level", 1);
  const ratio = (Number(sample.sampleRate) || sampleRate || 44100) / Math.max(1, sampleRate || 44100);
  const increment = (Math.pow(2, pitch) * ratio) / frames;
  if (state.playing) {
    state.phase = Number(state.phase) || startPhase;
    state.phase += increment;
    if (state.phase >= endPhase) {
      if (oneShot) {
        state.phase = endPhase;
        state.playing = false;
        state.completed = true;
      } else {
        state.phase = startPhase + ((state.phase - startPhase) % span);
      }
    }
  }
  const phase = clampNodeSliderValue(Number(state.phase) || startPhase, startPhase, endPhase);
  const stereo = nodeGraphSampleStereoAt(sample, phase * (frames - 1));
  const active = state.playing || (!oneShot && !state.completed);
  const gain = active ? level : 0;
  return {
    Left: stereo.Left * gain,
    Out: stereo.Out * gain,
    Right: stereo.Right * gain,
  };
}

function nodeGraphSampleLooperMixStereo(a, b, fadeIn) {
  const t = fadeIn <= 0 ? 0 : fadeIn >= 1 ? 1 : fadeIn;
  const w = t * t * (3 - 2 * t);
  const ow = 1 - w;
  return {
    Left: (Number(a?.Left) || 0) * ow + (Number(b?.Left) || 0) * w,
    Out: (Number(a?.Out) || 0) * ow + (Number(b?.Out) || 0) * w,
    Right: (Number(a?.Right) || 0) * ow + (Number(b?.Right) || 0) * w,
  };
}

function nodeGraphSampleLooperSample(runtime, node, nodeId, readInput, readParam, sampleRate) {
  const state = runtime.samplePlaybackStates.get(nodeId) || createNodeGraphSamplePlaybackState();
  runtime.samplePlaybackStates.set(nodeId, state);
  const sampleId = normalizeNodeGraphSampleId(node.sample?.id);
  const sample = runtime.samples?.get?.(sampleId);
  const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
  if (!sample || frames <= 1) {
    return { Left: 0, Out: 0, Phase: 0, Right: 0 };
  }
  const start = clampNodeSliderValue((readParam("start", 0) || 0) + (readInput("Start") || 0), 0, 1);
  const end = clampNodeSliderValue((readParam("end", 1) || 0) + (readInput("End") || 0), 0, 1);
  const startPhase = Math.min(start, end);
  const endPhase = Math.max(start, end);
  const regionSpan = Math.max(0.000001, endPhase - startPhase);
  let loopA = clampNodeSliderValue((readParam("loopStart", 0) || 0) + (readInput("Loop Start") || 0), startPhase, endPhase);
  let loopB = clampNodeSliderValue((readParam("loopEnd", 1) || 0) + (readInput("Loop End") || 0), startPhase, endPhase);
  if (loopA > loopB) {
    const swap = loopA;
    loopA = loopB;
    loopB = swap;
  }
  const loopSpan = Math.max(0.000001, loopB - loopA);
  const gate = readInput("Gate");
  const reset = readInput("Reset");
  const gateOn = gate > 0;
  const gateEdge = (state.lastGate || 0) <= 0 && gateOn;
  const resetEdge = (state.lastReset || 0) <= 0 && reset > 0;
  const oneShot = readParam("mode", 0) >= 0.5;
  if (resetEdge) {
    state.phase = startPhase;
    state.playing = gateOn;
    state.completed = false;
  }
  if (gateEdge) {
    state.phase = startPhase;
    state.playing = true;
    state.completed = false;
  } else if (!gateOn) {
    state.playing = false;
  }
  state.lastGate = gate;
  state.lastReset = reset;
  if (state.sampleId !== sampleId) {
    state.sampleId = sampleId;
    state.phase = startPhase;
    state.playing = gateOn;
    state.completed = false;
  }
  const pitch = (readParam("pitch", 0) || 0) + (readInput("Pitch") || 0);
  const level = readParam("level", 1);
  const ratio = (Number(sample.sampleRate) || sampleRate || 44100) / Math.max(1, sampleRate || 44100);
  const increment = (Math.pow(2, pitch) * ratio) / frames;
  if (state.playing) {
    state.phase = Number(state.phase) || startPhase;
    state.phase += increment;
    if (oneShot) {
      if (state.phase >= endPhase) {
        state.phase = endPhase;
        state.playing = false;
        state.completed = true;
      }
    } else if (state.phase >= loopB) {
      state.phase = loopA + ((state.phase - loopB) % loopSpan);
    } else if (state.phase < loopA && state.phase > startPhase + increment) {
      state.phase = loopA;
    }
  }
  const phase = clampNodeSliderValue(Number(state.phase) || startPhase, startPhase, endPhase);
  let stereo = nodeGraphSampleStereoAt(sample, phase * (frames - 1));
  const xfSeconds = Math.max(0, Number(readParam("crossfade", 0.005)) || 0);
  const xfPhase = Math.min(loopSpan * 0.45, (xfSeconds * (Number(sample.sampleRate) || sampleRate || 44100)) / frames);
  if (!oneShot && state.playing && xfPhase > 1e-9) {
    const intoLoop = phase - loopA;
    if (intoLoop >= 0 && intoLoop < xfPhase) {
      const tail = nodeGraphSampleStereoAt(sample, (loopB - xfPhase + intoLoop) * (frames - 1));
      stereo = nodeGraphSampleLooperMixStereo(tail, stereo, intoLoop / xfPhase);
    }
  }
  const gain = state.playing ? level : 0;
  return {
    Left: stereo.Left * gain,
    Out: stereo.Out * gain,
    Phase: (phase - startPhase) / regionSpan,
    Right: stereo.Right * gain,
  };
}

nodeGraphLiveModuleEvaluators.samplePlayer = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const readParam = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  return nodeGraphSampleLibrarySample(
    runtime,
    node,
    nodeId,
    (port) => mixInput(nodeId, port),
    readParam,
    sampleRate,
  );
};

nodeGraphLiveModuleEvaluators.sampleLooper = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const readParam = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  return nodeGraphSampleLooperSample(
    runtime,
    node,
    nodeId,
    (port) => mixInput(nodeId, port),
    readParam,
    sampleRate,
  );
};

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
