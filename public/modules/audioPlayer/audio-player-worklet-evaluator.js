NodeLiveAudioProcessor.prototype.audioPlayerSample = function audioPlayerSample(node, nodeId, readInput, readParam, rate = sampleRate) {
    const state = this.samplePlaybackStates.get(nodeId) || this.createSamplePlaybackState();
    this.samplePlaybackStates.set(nodeId, state);
    const sampleId = String(node?.sample?.id || "");
    const sample = this.samples.get(sampleId);
    const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
    this.audioPlayerMeterNodeId = nodeId;
    if (!this.audioPlayerMeterSpeeds) {
      this.audioPlayerMeterSpeeds = Object.create(null);
    }
    if (!sample || frames <= 1) {
      this.audioPlayerMeterReason = sampleId ? "engine waiting for sample" : "engine no sample id";
      // No file is silence, not 0× speed — HUD should still show param + Speed jack.
      const idleSpeed = readParam("speed", 1) + readInput("Speed");
      this.audioPlayerMeterSpeed = idleSpeed;
      this.audioPlayerMeterSpeeds[nodeId] = idleSpeed;
      return { Left: 0, Mono: 0, Out: 0, Phase: 0, Right: 0, Trigger: 0 };
    }
    const range = typeof nodeGraphAudioPlayerResolvedPhaseRange === "function"
      ? nodeGraphAudioPlayerResolvedPhaseRange({
        frames,
        sampleRate: rate,
        hasInput: (port) => this.inputConnections?.has?.(this.inputKey(nodeId, port)),
        readInput,
        readParam,
        clamp: (value, lo, hi) => this.clampValue(value, lo, hi),
      })
      : null;
    const startPhase = range ? range.startPhase : this.clampValue(readParam("start", 0), 0, 1);
    const endPhase = range ? range.endPhase : this.clampValue(readParam("end", 1), 0, 1);
    const span = range ? range.span : Math.max(0.000001, Math.abs(endPhase - startPhase));
    const rangeKey = `${startPhase}:${endPhase}`;
    if (state.sampleId !== sampleId) {
      // Cold start / first bind: restore patch-remembered phase. Sample swap: start.
      const restored = Number(node?.samplePhase);
      if (!state.sampleId && Number.isFinite(restored)) {
        state.phase = this.clampValue(restored, startPhase, endPhase);
      } else {
        state.phase = startPhase;
      }
      state.completed = false;
      state.sampleId = sampleId;
      state.seekToken = Number(node?.samplePhaseSeek) || 0;
    } else if (state.rangeKey !== rangeKey) {
      const currentPhase = Number(state.phase);
      if (!Number.isFinite(currentPhase) || currentPhase < startPhase || currentPhase > endPhase) {
        state.phase = startPhase;
      }
      state.completed = false;
    }
    // Absolute seek from main thread (playlist scrub / track change) without full plan rebuild.
    const seekToken = Number(node?.samplePhaseSeek) || 0;
    if (seekToken && seekToken !== state.seekToken) {
      const seekPhase = Number(node?.samplePhase);
      if (Number.isFinite(seekPhase)) {
        state.phase = this.clampValue(seekPhase, startPhase, endPhase);
        state.completed = false;
      }
      state.seekToken = seekToken;
    }
    if (state.rangeKey !== rangeKey) {
      state.rangeKey = rangeKey;
    }
    const transportFallback = Object.hasOwn(node?.params || {}, "transport")
      ? 4
      : ((Number(node?.params?.loop) || 0) >= 0.5 ? 4 : 0);
    const transportMode = Math.max(0, Math.min(5, Math.round(readParam("transport", transportFallback))));
    const transportReset = transportMode <= 0;
    const transportStopped = transportMode === 1;
    const transportPaused = transportMode === 2;
    // Match module labels: Loop=3, Play (once)=4
    const transportLooping = transportMode === 3;
    const transportPlayOnce = transportMode >= 4;
    if (state.transportMode !== transportMode) {
      state.completed = false;
      state.transportMode = transportMode;
    }
    const reset = readInput("Reset");
    const resetEdge = state.lastReset <= 0 && reset > 0;
    if (resetEdge || transportReset || transportStopped) {
      state.phase = startPhase;
      state.completed = false;
    }
    state.playing = (transportPlayOnce || transportLooping) && !state.completed;
    state.lastReset = reset;

    const phaseConnected = this.inputConnections?.has?.(this.inputKey(nodeId, "Phase"));
    const speed = readParam("speed", 1) + readInput("Speed");
    const sampleRateRatio = (Number(sample.sampleRate) || rate || 44100) / Math.max(1, rate || 44100);
    const increment = (speed * sampleRateRatio) / frames;
    const basePhase = phaseConnected
      ? this.clampValue(readInput("Phase"), 0, 1)
      : this.clampValue(state.phase, 0, 1);
    const phaseOffset = Number(readParam("phaseOffset", 0)) || 0;
    const phaseSkip = Number(readParam("phase", 0)) || 0;
    const playlistScrub = Number(readParam("playlistScrub", 0)) || 0;
    const phaseWithOffset = basePhase + phaseOffset + phaseSkip + playlistScrub;
    const boundedPhase = startPhase + this.wrapValue((phaseWithOffset - startPhase) / span, 0, 1) * span;
    const stereo = this.sampleStereoAt(sample, boundedPhase * (frames - 1));
    const level = readParam("level", 1);
    const outputActive = state.playing;
    const left = outputActive ? stereo.Left * level : 0;
    const mono = outputActive ? stereo.Mono * level : 0;
    const right = outputActive ? stereo.Right * level : 0;
    this.audioPlayerMeterPhase = boundedPhase;
    this.audioPlayerMeterSpeed = speed;
    this.audioPlayerMeterSpeeds[nodeId] = speed;
    this.audioPlayerMeterReason = state.playing
      ? (transportLooping ? "engine looping" : "engine playing")
      : transportPaused
        ? "engine paused"
        : transportStopped
          ? "engine stopped"
          : state.completed
            ? "engine complete"
            : "engine off reset";
    let done = 0;
    if (!phaseConnected && state.playing) {
      const nextPhase = basePhase + increment;
      if (transportLooping) {
        const normalizedNext = (nextPhase - startPhase) / span;
        done = normalizedNext < 0 || normalizedNext >= 1 ? 1 : 0;
        state.phase = startPhase + this.wrapValue((nextPhase - startPhase) / span, 0, 1) * span;
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
        state.phase = this.clampValue(nextPhase, startPhase, endPhase);
      }
    } else if (!phaseConnected && (transportReset || transportStopped)) {
      state.phase = startPhase;
    } else if (phaseConnected) {
      state.phase = this.clampValue(readInput("Phase"), 0, 1);
    }
    return {
      Left: left,
      Mono: mono,
      Out: mono,
      Phase: boundedPhase,
      Right: right,
      Trigger: done,
    };
  };

NodeLiveAudioProcessor.prototype.sampleLibrarySample = function sampleLibrarySample(node, nodeId, readInput, readParam, rate = sampleRate) {
  const state = this.samplePlaybackStates.get(nodeId) || this.createSamplePlaybackState();
  this.samplePlaybackStates.set(nodeId, state);
  const sampleId = String(node?.sample?.id || "");
  const sample = this.samples.get(sampleId);
  const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
  if (!sample || frames <= 1) {
    return { Left: 0, Out: 0, Right: 0 };
  }
  const start = this.clampValue(readParam("start", 0), 0, 1);
  const end = this.clampValue(readParam("end", 1), 0, 1);
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
  const ratio = (Number(sample.sampleRate) || rate || 44100) / Math.max(1, rate || 44100);
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
  const phase = this.clampValue(Number(state.phase) || startPhase, startPhase, endPhase);
  const stereo = this.sampleStereoAt(sample, phase * (frames - 1));
  const gain = state.playing || (!oneShot && !state.completed) ? level : 0;
  return {
    Left: stereo.Left * gain,
    Out: stereo.Out * gain,
    Right: stereo.Right * gain,
  };
};

NodeLiveAudioProcessor.prototype.sampleLooperSample = function sampleLooperSample(node, nodeId, readInput, readParam, rate = sampleRate) {
  const state = this.samplePlaybackStates.get(nodeId) || this.createSamplePlaybackState();
  this.samplePlaybackStates.set(nodeId, state);
  const sampleId = String(node?.sample?.id || "");
  const sample = this.samples.get(sampleId);
  const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
  if (!sample || frames <= 1) {
    return { Left: 0, Out: 0, Phase: 0, Right: 0 };
  }
  const start = this.clampValue((readParam("start", 0) || 0) + (readInput("Start") || 0), 0, 1);
  const end = this.clampValue((readParam("end", 1) || 0) + (readInput("End") || 0), 0, 1);
  const startPhase = Math.min(start, end);
  const endPhase = Math.max(start, end);
  const regionSpan = Math.max(0.000001, endPhase - startPhase);
  let loopA = this.clampValue((readParam("loopStart", 0) || 0) + (readInput("Loop Start") || 0), startPhase, endPhase);
  let loopB = this.clampValue((readParam("loopEnd", 1) || 0) + (readInput("Loop End") || 0), startPhase, endPhase);
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
  const ratio = (Number(sample.sampleRate) || rate || 44100) / Math.max(1, rate || 44100);
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
  const phase = this.clampValue(Number(state.phase) || startPhase, startPhase, endPhase);
  let stereo = this.sampleStereoAt(sample, phase * (frames - 1));
  const xfSeconds = Math.max(0, Number(readParam("crossfade", 0.005)) || 0);
  const xfPhase = Math.min(loopSpan * 0.45, (xfSeconds * (Number(sample.sampleRate) || rate || 44100)) / frames);
  if (!oneShot && state.playing && xfPhase > 1e-9) {
    const intoLoop = phase - loopA;
    if (intoLoop >= 0 && intoLoop < xfPhase) {
      const tail = this.sampleStereoAt(sample, (loopB - xfPhase + intoLoop) * (frames - 1));
      const t = intoLoop / xfPhase;
      const w = t * t * (3 - 2 * t);
      const ow = 1 - w;
      stereo = {
        Left: tail.Left * ow + stereo.Left * w,
        Out: tail.Out * ow + stereo.Out * w,
        Right: tail.Right * ow + stereo.Right * w,
      };
    }
  }
  const gain = state.playing ? level : 0;
  return {
    Left: stereo.Left * gain,
    Out: stereo.Out * gain,
    Phase: (phase - startPhase) / regionSpan,
    Right: stereo.Right * gain,
  };
};
