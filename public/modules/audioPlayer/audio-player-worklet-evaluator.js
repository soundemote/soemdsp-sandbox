NodeLiveAudioProcessor.prototype.audioPlayerSample = function audioPlayerSample(node, nodeId, readInput, readParam, rate = sampleRate) {
    const state = this.samplePlaybackStates.get(nodeId) || this.createSamplePlaybackState();
    this.samplePlaybackStates.set(nodeId, state);
    const sampleId = String(node?.sample?.id || "");
    const sample = this.samples.get(sampleId);
    const frames = Math.max(0, Number(sample?.frames) || sample?.samples?.length || sample?.channelData?.[0]?.length || 0);
    this.audioPlayerMeterNodeId = nodeId;
    if (!sample || frames <= 1) {
      this.audioPlayerMeterReason = sampleId ? "engine waiting for sample" : "engine no sample id";
      return { Left: 0, Mono: 0, Out: 0, Phase: 0, Right: 0, Trigger: 0 };
    }
    const start = this.clampValue(readParam("start", 0), 0, 1);
    const end = this.clampValue(readParam("end", 1), 0, 1);
    const collapsedRange = Math.abs(end - start) <= 0.000001;
    const startPhase = collapsedRange ? 0 : Math.min(start, end);
    const endPhase = collapsedRange ? 1 : Math.max(start, end);
    const span = Math.max(0.000001, endPhase - startPhase);
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
    const transportMode = Math.max(0, Math.min(4, Math.round(readParam("transport", transportFallback))));
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
    // Relative offset (−1…+1 wrap; ±1 ≡ 0). Same path as Phase Offset param / playlist scrubber.
    const phaseOffsetCycles = ((Number(readParam("phaseOffset", 0)) % 1) + 1) % 1;
    const phaseWithOffset = basePhase + phaseOffsetCycles;
    const boundedPhase = startPhase + this.wrapValue((phaseWithOffset - startPhase) / span, 0, 1) * span;
    const stereo = this.sampleStereoAt(sample, boundedPhase * (frames - 1));
    const level = readParam("level", 1);
    const outputActive = state.playing;
    const left = outputActive ? stereo.Left * level : 0;
    const mono = outputActive ? stereo.Mono * level : 0;
    const right = outputActive ? stereo.Right * level : 0;
    this.audioPlayerMeterPhase = boundedPhase;
    this.audioPlayerMeterPeak = Math.max(
      this.audioPlayerMeterPeak,
      Math.abs(left),
      Math.abs(mono),
      Math.abs(right),
    );
    this.audioPlayerMeterReason = state.playing
      ? (transportLooping ? "engine looping" : "engine playing")
      : transportPaused
        ? "engine paused"
        : transportStopped
          ? "engine stopped"
          : state.completed
            ? "engine complete"
            : "engine off reset";
    this.audioPlayerMeterSamples += 1;
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
