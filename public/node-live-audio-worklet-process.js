// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: process — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.process = function process(inputs, outputs) {
    const blockStartedAt = globalThis.performance?.now?.() || 0;
    const output = outputs[0] || [];
    const frames = output[0]?.length || 128;
    const input = inputs[0] || [];
    const oversamplingRatio = Math.max(1, Math.min(4, Math.round(this.oversamplingRatio) || 1));
    const rawEngineSampleRate = Math.max(1, this.engineSampleRate || sampleRate || 44100);
    const effectiveRate = Math.max(1, rawEngineSampleRate * Math.max(0, this.speedMultiplier ?? 1));
    const engineFrames = frames * oversamplingRatio;
    // Speed 0 = pause: fill silence and return immediately.
    if (this.speedMultiplier === 0) {
      for (const channel of output) {
        channel.fill(0);
      }
      return true;
    }
    if (!this.nodes.size || !this.order.length) {
      for (const channel of output) {
        channel.fill(0);
      }
      return true;
    }

    for (let frame = 0; frame < frames; frame += 1) {
      const inputLeft = Number(input[0]?.[frame]) || 0;
      const inputRight = Number(input[1]?.[frame]) || inputLeft;
      this.inputMeterPeak = Math.max(this.inputMeterPeak, Math.abs(inputLeft), Math.abs(inputRight));
      this.inputMeterSquareSum += (inputLeft * inputLeft + inputRight * inputRight) * 0.5;
      this.inputMeterSamples += 1;
      let leftSum = 0;
      let rightSum = 0;
      let decimatedLeft = 0;
      let decimatedRight = 0;
      const useRaptEllipticDecimator = oversamplingRatio === 4;
      for (let subframe = 0; subframe < oversamplingRatio; subframe += 1) {
        const engineFrame = frame * oversamplingRatio + subframe;
        const subframeOutput = this.evaluateFrame(engineFrame, engineFrames, inputs, effectiveRate, frame);
        if (useRaptEllipticDecimator) {
          decimatedLeft = this.processRaptEllipticDecimatorSample(
            subframeOutput.left,
            this.raptEllipticDecimatorLeft,
          );
          decimatedRight = this.processRaptEllipticDecimatorSample(
            subframeOutput.right,
            this.raptEllipticDecimatorRight,
          );
        } else {
          leftSum += subframeOutput.left;
          rightSum += subframeOutput.right;
        }
        this.captureModuleScopeFrame(this.currentFrameValues, engineFrame, engineFrames);
        this.scopeCounter += 1;
        if (this.scopeCounter >= Math.max(1, Math.floor(effectiveRate / 30))) {
          this.scopeCounter = 0;
          this.postModuleScopeSnapshot();
        }
        this.visualControlCounter += 1;
        if (this.visualControlCounter >= Math.max(1, Math.floor(effectiveRate / 30))) {
          this.visualControlCounter = 0;
          this.postVisualControls();
        }
      }
      const frameOutput = {
        left: useRaptEllipticDecimator ? decimatedLeft : leftSum / oversamplingRatio,
        right: useRaptEllipticDecimator ? decimatedRight : rightSum / oversamplingRatio,
      };
      if (this.outputSampleClipped(frameOutput.left)) {
        this.meterClipCount += 1;
      }
      if (this.outputSampleClipped(frameOutput.right)) {
        this.meterClipCount += 1;
      }
      if (
        this.outputSampleTripsEarProtection(frameOutput.left) ||
        this.outputSampleTripsEarProtection(frameOutput.right)
      ) {
        this.meterProtectionMuteCount += 1;
        this.speakerProtectionPeak = Math.max(
          Number(this.speakerProtectionPeak) || 0,
          Number.isFinite(Number(frameOutput.left)) ? Math.abs(Number(frameOutput.left)) : Infinity,
          Number.isFinite(Number(frameOutput.right)) ? Math.abs(Number(frameOutput.right)) : Infinity,
        );
        this.speakerProtectionNodeId = "output";
        for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
          output[channelIndex][frame] = 0;
        }
        continue;
      }
      const protectedFrame = this.earProtector.protect(frameOutput.left, frameOutput.right);
      if (protectedFrame.muted) {
        this.meterProtectionMuteCount += 1;
      }
      const left = this.clampValue(protectedFrame.left, -0.95, 0.95);
      const right = this.clampValue(protectedFrame.right, -0.95, 0.95);
      this.meterPeak = Math.max(this.meterPeak, Math.abs(left), Math.abs(right));
      this.meterSquareSum += (left * left + right * right) * 0.5;
      this.meterSamples += 1;
      this.gpuAdditiveStatusCounter += 1;
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex][frame] = channelIndex === 0 ? left : right;
      }
    }
    this.finishSmoothing();
    if (blockStartedAt > 0) {
      const elapsedMs = Math.max(0, (globalThis.performance?.now?.() || blockStartedAt) - blockStartedAt);
      const blockBudgetMs = (frames / Math.max(1, sampleRate || this.hostSampleRate || 44100)) * 1000;
      const budgetRatio = blockBudgetMs > 0 ? elapsedMs / blockBudgetMs : 0;
      this.maxBlockProcessMs = Math.max(Number(this.maxBlockProcessMs) || 0, elapsedMs);
      this.maxBlockBudgetRatio = Math.max(Number(this.maxBlockBudgetRatio) || 0, budgetRatio);
      if (budgetRatio >= 0.85) {
        this.meterOverrunCount += 1;
      }
    }
    this.meterCounter += frames;
    if (this.meterCounter >= sampleRate / 60) {
      this.port.postMessage({
        audioPlayerNodeId: this.audioPlayerMeterNodeId || this.audioPlayerNodeIds[0] || "",
        audioPlayerNodeIds: [...this.audioPlayerNodeIds],
        audioPlayerPeak: this.audioPlayerMeterPeak,
        audioPlayerPhase: this.audioPlayerMeterPhase,
        audioPlayerReason: this.audioPlayerMeterReason,
        audioPlayerSamples: this.audioPlayerMeterSamples,
        clipCount: this.meterClipCount,
        badNumberCount: this.badNumberCount,
        lastBadValueReason: this.lastBadValueReason,
        lastBadValueNodeId: this.lastBadValueNodeId,
        lastBadValueSource: this.lastBadValueSource,
        inputPeak: this.inputMeterPeak,
        inputRms: Math.sqrt(this.inputMeterSquareSum / Math.max(1, this.inputMeterSamples)),
        maxBlockBudgetRatio: this.maxBlockBudgetRatio,
        maxBlockProcessMs: this.maxBlockProcessMs,
        overrunCount: this.meterOverrunCount,
        peak: this.meterPeak,
        protectionNodeId: this.speakerProtectionNodeId || "",
        protectionPeak: Number(this.speakerProtectionPeak) || 0,
        protectionMuteCount: this.meterProtectionMuteCount,
        sessionId: this.sessionId,
        rms: Math.sqrt(this.meterSquareSum / Math.max(1, this.meterSamples)),
        type: "meter",
      });
      this.meterCounter = 0;
      this.inputMeterPeak = 0;
      this.audioPlayerMeterNodeId = "";
      this.audioPlayerMeterPeak = 0;
      this.audioPlayerMeterPhase = 0;
      this.audioPlayerMeterReason = "";
      this.audioPlayerMeterSamples = 0;
      this.inputMeterSamples = 0;
      this.inputMeterSquareSum = 0;
      this.meterClipCount = 0;
      this.badNumberCount = 0;
      this.maxBlockProcessMs = 0;
      this.maxBlockBudgetRatio = 0;
      this.meterOverrunCount = 0;
      this.lastBadValueReason = "";
      this.lastBadValueNodeId = "";
      this.lastBadValueSource = "";
      this.meterPeak = 0;
      this.meterProtectionMuteCount = 0;
      this.speakerProtectionNodeId = "";
      this.speakerProtectionPeak = 0;
      this.meterSamples = 0;
      this.meterSquareSum = 0;
    }
    if (this.gpuAdditiveStatusCounter >= sampleRate / 20) {
      this.gpuAdditiveStatusCounter = 0;
      this.postGpuAdditiveStatus();
    }
    return true;
};
