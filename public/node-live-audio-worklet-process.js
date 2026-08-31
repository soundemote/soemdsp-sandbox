// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: process — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.process = function process(inputs, outputs) {
    const blockStartedAt = globalThis.performance?.now?.() || 0;
    const output = outputs[0] || [];
    const frames = output[0]?.length || 128;
    const input = inputs[0] || [];
    // Missed quanta (browser skipped process) never show in wall-time Audio%.
    // currentFrame jumps by more than `frames` when callbacks were dropped.
    const frameCursor = typeof currentFrame === "number" ? currentFrame : -1;
    if (frameCursor >= 0 && Number.isFinite(this._lastProcessFrame)) {
      const delta = frameCursor - this._lastProcessFrame;
      if (delta > frames) {
        const missed = Math.floor(delta / frames) - 1;
        if (missed > 0) {
          this.meterOverrunCount = (Number(this.meterOverrunCount) || 0) + missed;
          this.meterMissedQuantumCount = (Number(this.meterMissedQuantumCount) || 0) + missed;
          this.audioThreadStressed = true;
        }
      }
    }
    if (frameCursor >= 0) {
      this._lastProcessFrame = frameCursor;
    }
    // Wall clock between process() entries advances even when now() is frozen
    // *inside* the callback — use gaps as a drop/pressure signal.
    const callbackWall = globalThis.performance?.now?.() || 0;
    const blockBudgetMsEarly = (frames / Math.max(1, sampleRate || this.hostSampleRate || 44100)) * 1000;
    if (callbackWall > 0 && Number(this._prevProcessWall) > 0) {
      const gap = callbackWall - this._prevProcessWall;
      if (gap > blockBudgetMsEarly * 1.6) {
        const lateUnits = Math.max(1, Math.round(gap / Math.max(1e-6, blockBudgetMsEarly)) - 1);
        this.meterOverrunCount = (Number(this.meterOverrunCount) || 0) + lateUnits;
        this.meterMissedQuantumCount = (Number(this.meterMissedQuantumCount) || 0) + lateUnits;
        this.audioThreadStressed = true;
      }
    }
    if (callbackWall > 0) {
      this._prevProcessWall = callbackWall;
    }
    // Same buffer the Input / Plugin Input evaluators scale by Amplitude.
    this.externalInput = {
      left: input[0] || input[1] || null,
      right: input[1] || input[0] || null,
    };
    // App-wide: oversampling under construction — never multi-rate in process.
    const oversamplingRatio = 1;
    const rawEngineSampleRate = Math.max(1, this.hostSampleRate || this.engineSampleRate || sampleRate || 44100);
    const speedMul = Math.max(0, this.speedMultiplier ?? 1);
    const effectiveRate = speedMul > 0
      ? Math.max(1, rawEngineSampleRate / speedMul)
      : 1;
    const engineFrames = frames;
    // Speed 0 = pause: silence and return. Native process_block (and therefore
    // Control smoothers) must not advance — freeze mid-ramps until unpause.
    // Do not snap here; pause→play continues chasing from frozen outs.
    if (!(Number(this.speedMultiplier) > 0)) {
      for (const channel of output) {
        if (channel) {
          channel.fill(0);
        }
      }
      return true;
    }
    // Efficient path owns scheduling in C++ (graph_engine order[]). Do not
    // require JS this.order — an empty plan.order used to hard-silence Live
    // even when natives were compiled and ready.
    if (!this.nodes.size || (!(this.efficientProduct) && !this.order.length)) {
      for (const channel of output) {
        channel.fill(0);
      }
      return true;
    }

    // MVEP efficient product: one native graph_process_block per quantum.
    // No evaluateFrame / JS DSP fallback when efficientProduct is on.
    const usedNativeGraph = Boolean(this.efficientProduct)
      && typeof this.processNativeGraphQuantum === "function"
      && this.processNativeGraphQuantum(output, frames);
    if (this.efficientProduct && !usedNativeGraph) {
      for (const channel of output) {
        if (channel) channel.fill(0);
      }
    }
    // Interim: Music Player JS peel mixes into hardware outs (native graph has no audioPlayer).
    if (this.efficientProduct && typeof this.processAudioPlayerEfficientSidecar === "function") {
      this.processAudioPlayerEfficientSidecar(output, frames);
    }

    // Previous quantum was late → shed non-audio work this quantum (scopes/UI posts).
    const audioStressed = Boolean(this.audioThreadStressed);

    // Efficient path: rings already filled from native taps in processNativeGraphQuantum.
    // Throttled snapshot/visual posts only (never evaluateFrame).
    if (usedNativeGraph) {
      this.scopeCounter = (Number(this.scopeCounter) || 0) + frames;
      const displayFps = Number(this.displayFps);
      if (displayFps > 0) {
        this.scopeSnapshotCounter = (Number(this.scopeSnapshotCounter) || 0) + frames;
        // Never fully starve scope posts when stressed — that freezes every face
        // until the budget recovers (often never, with stereo supersaw + sinks).
        // Stressed: post at ~1/4 display rate instead of skipping entirely.
        const snapshotEvery = Math.max(
          1,
          Math.floor(effectiveRate / displayFps) * (audioStressed ? 4 : 1),
        );
        if (this.scopeSnapshotCounter >= snapshotEvery) {
          this.scopeSnapshotCounter = 0;
          this.postModuleScopeSnapshot?.();
        }
      }
      this.visualControlCounter = (Number(this.visualControlCounter) || 0) + frames;
      const visualEvery = Math.max(1, Math.floor(effectiveRate / 30) * (audioStressed ? 4 : 1));
      if (this.visualControlCounter >= visualEvery) {
        this.visualControlCounter = 0;
        this.postVisualControls?.();
      }
    }

    // Hard cutover: efficient never enters the sample loop / evaluateFrame.
    // Timing + meter posts still run below (native-graph contract).
    if (this.efficientProduct) {
      this.finishSmoothing();
      if (!(Number(this._timerResMs) > 0) && globalThis.performance?.now) {
        const t0 = performance.now();
        let t1 = t0;
        let guard = 0;
        while (t1 === t0 && guard < 5e6) {
          t1 = performance.now();
          guard += 1;
        }
        this._timerResMs = Math.max(1e-3, t1 - t0);
      }
      if (blockStartedAt > 0) {
        const elapsedMs = Math.max(0, (globalThis.performance?.now?.() || blockStartedAt) - blockStartedAt);
        const blockBudgetMs = (frames / Math.max(1, sampleRate || this.hostSampleRate || 44100)) * 1000;
        const budgetRatio = blockBudgetMs > 0 ? elapsedMs / blockBudgetMs : 0;
        this.maxBlockProcessMs = Math.max(Number(this.maxBlockProcessMs) || 0, elapsedMs);
        this.maxBlockBudgetRatio = Math.max(Number(this.maxBlockBudgetRatio) || 0, budgetRatio);
        this.sumBlockProcessMs = (Number(this.sumBlockProcessMs) || 0) + elapsedMs;
        this.blockProcessCount = (Number(this.blockProcessCount) || 0) + 1;
        if (!(elapsedMs > 0)) {
          this.zeroElapsedQuanta = (Number(this.zeroElapsedQuanta) || 0) + 1;
        }
        this.meterBlockBudgetMs = blockBudgetMs;
        this.audioThreadStressed = budgetRatio >= 0.85;
        if (budgetRatio >= 0.85) {
          this.meterOverrunCount += 1;
        }
      }
      this.meterCounter += frames;
      if (this.meterCounter >= sampleRate / 60) {
        const realCount = Number(this.blockProcessCount) || 0;
        const count = Math.max(1, realCount);
        const budgetMs = Math.max(1e-6, Number(this.meterBlockBudgetMs) || ((frames / Math.max(1, sampleRate || 44100)) * 1000));
        const sumMs = Number(this.sumBlockProcessMs) || 0;
        const avgMs = sumMs / count;
        const avgRatio = avgMs / budgetMs;
        const timerResMs = Number(this._timerResMs) || 0;
        const timedOut = realCount > 0 && !(sumMs > 0);
        const moduleCount = Number.isFinite(this.dspLiveModuleCount)
          ? this.dspLiveModuleCount
          : (Array.isArray(this.order) ? this.order.length : (this.nodes?.size || 0));
        const costUnits = Number(this.dspCostUnits) || 0;
        const estimatedBudgetRatio = Math.max(0, Math.min(4, costUnits * 0.004));
        this.port.postMessage({
          audioPlayerNodeId: this.audioPlayerMeterNodeId || this.audioPlayerNodeIds[0] || "",
          audioPlayerNodeIds: [...this.audioPlayerNodeIds],
          audioPlayerPhase: this.audioPlayerMeterPhase,
          audioPlayerSpeed: this.audioPlayerMeterSpeed,
          audioPlayerSpeeds: this.audioPlayerMeterSpeeds || {},
          audioPlayerReason: this.audioPlayerMeterReason,
          audioPlayerSampleId: this.audioPlayerMeterSampleId || "",
          clipCount: this.meterClipCount,
          badNumberCount: this.badNumberCount,
          lastBadValueReason: this.lastBadValueReason,
          lastBadValueNodeId: this.lastBadValueNodeId,
          lastBadValueSource: this.lastBadValueSource,
          inputPeak: this.inputMeterPeak,
          inputRms: Math.sqrt(this.inputMeterSquareSum / Math.max(1, this.inputMeterSamples)),
          avgBlockBudgetRatio: avgRatio,
          avgBlockProcessMs: avgMs,
          maxBlockBudgetRatio: this.maxBlockBudgetRatio,
          maxBlockProcessMs: this.maxBlockProcessMs,
          meterTimedOut: timedOut,
          moduleCount,
          timerResMs,
          estimatedBudgetRatio: timedOut ? estimatedBudgetRatio : 0,
          dspCostUnits: costUnits,
          upperBoundBudgetRatio: timedOut && budgetMs > 0 ? (timerResMs / budgetMs) : 0,
          missedQuantumCount: this.meterMissedQuantumCount,
          overrunCount: this.meterOverrunCount,
          peak: this.meterPeak,
          protectionNodeId: this.speakerProtectionNodeId || "",
          protectionPeak: Number(this.speakerProtectionPeak) || 0,
          protectionMuteCount: this.meterProtectionMuteCount,
          protectionEngaged: Boolean(this.protectionEngaged),
          protectionGain: Number.isFinite(Number(this.protectionGain)) ? Number(this.protectionGain) : 1,
          sessionId: this.sessionId,
          rms: Math.sqrt(this.meterSquareSum / Math.max(1, this.meterSamples)),
          type: "meter",
        });
        this.meterCounter = 0;
        this.inputMeterPeak = 0;
        this.audioPlayerMeterNodeId = "";
        this.audioPlayerMeterPhase = 0;
        this.audioPlayerMeterSpeed = 0;
        this.audioPlayerMeterSpeeds = Object.create(null);
        this.audioPlayerMeterReason = "";
        this.inputMeterSamples = 0;
        this.inputMeterSquareSum = 0;
        this.meterClipCount = 0;
        this.badNumberCount = 0;
        this.meterOverrunCount = 0;
        this.meterMissedQuantumCount = 0;
        this.lastBadValueReason = "";
        this.lastBadValueNodeId = "";
        this.lastBadValueSource = "";
        this.meterPeak = 0;
        this.meterProtectionMuteCount = 0;
        this.speakerProtectionNodeId = "";
        this.speakerProtectionPeak = 0;
        this.meterSamples = 0;
        this.meterSquareSum = 0;
        this.dspMeterFrames = (Number(this.dspMeterFrames) || 0) + (sampleRate / 60);
        if (this.dspMeterFrames >= sampleRate) {
          this.dspMeterFrames = 0;
          this.maxBlockProcessMs = 0;
          this.maxBlockBudgetRatio = 0;
          this.sumBlockProcessMs = 0;
          this.blockProcessCount = 0;
          this.zeroElapsedQuanta = 0;
        }
      }
      if (this.gpuAdditiveStatusCounter >= sampleRate / 20) {
        this.gpuAdditiveStatusCounter = 0;
        this.postGpuAdditiveStatus?.();
      }
      return true;
    }

    // Legacy ?product=full sample loop (evaluateFrame). Unreachable when efficientProduct.
    {
      for (let frame = 0; frame < frames; frame += 1) {
        const rawLeft = Number(input[0]?.[frame]);
        const rawRight = Number(input[1]?.[frame]);
        const inputLeft = Number.isFinite(rawLeft) ? rawLeft : 0;
        const inputRight = Number.isFinite(rawRight) ? rawRight : inputLeft;
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
          // Scope capture every sample is expensive; when audio is late, keep DSP
          // and only refresh rings every 8th sample so the quantum can recover.
          if (!audioStressed || (engineFrame & 7) === 0) {
            this.captureModuleScopeFrame(this.currentFrameValues, engineFrame, engineFrames);
          }
          this.scopeCounter += 1;
          const displayFps = Number(this.displayFps);
          if (displayFps > 0) {
            this.scopeSnapshotCounter = (Number(this.scopeSnapshotCounter) || 0) + 1;
            if (this.scopeSnapshotCounter >= Math.max(1, Math.floor(effectiveRate / displayFps))) {
              this.scopeSnapshotCounter = 0;
              if (!audioStressed) {
                this.postModuleScopeSnapshot();
              }
            }
          }
          this.visualControlCounter += 1;
          if (this.visualControlCounter >= Math.max(1, Math.floor(effectiveRate / 30))) {
            this.visualControlCounter = 0;
            if (!audioStressed) {
              this.postVisualControls();
            }
          }
        }
        const frameOutput = this._frameOutput || (this._frameOutput = { left: 0, right: 0 });
        frameOutput.left = useRaptEllipticDecimator ? decimatedLeft : leftSum / oversamplingRatio;
        frameOutput.right = useRaptEllipticDecimator ? decimatedRight : rightSum / oversamplingRatio;
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
          this.speakerProtectionPeak = Math.max(
            Number(this.speakerProtectionPeak) || 0,
            Number.isFinite(Number(frameOutput.left)) ? Math.abs(Number(frameOutput.left)) : Infinity,
            Number.isFinite(Number(frameOutput.right)) ? Math.abs(Number(frameOutput.right)) : Infinity,
          );
          this.speakerProtectionNodeId = "output";
        }
        const protectedFrame = this.earProtector.protect(frameOutput.left, frameOutput.right);
        if (protectedFrame.engaged || protectedFrame.muted) {
          this.meterProtectionMuteCount += 1;
        }
        this.protectionEngaged = Boolean(protectedFrame.engaged);
        this.protectionGain = Number(protectedFrame.gain);
        const left = Number.isFinite(Number(protectedFrame.left)) ? Number(protectedFrame.left) : 0;
        const right = Number.isFinite(Number(protectedFrame.right)) ? Number(protectedFrame.right) : 0;
        this.meterPeak = Math.max(this.meterPeak, Math.abs(left), Math.abs(right));
        this.meterSquareSum += (left * left + right * right) * 0.5;
        this.meterSamples += 1;
        this.gpuAdditiveStatusCounter += 1;
        for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
          output[channelIndex][frame] = channelIndex === 0 ? left : right;
        }
      }
    }

    this.finishSmoothing();
    // Probe timer tick size once. If every quantum finishes inside one tick,
    // performance.now() deltas are 0 and a "0%" reading is NOT proof of headroom.
    if (!(Number(this._timerResMs) > 0) && globalThis.performance?.now) {
      const t0 = performance.now();
      let t1 = t0;
      let guard = 0;
      while (t1 === t0 && guard < 5e6) {
        t1 = performance.now();
        guard += 1;
      }
      this._timerResMs = Math.max(1e-3, t1 - t0);
    }
    if (blockStartedAt > 0) {
      const elapsedMs = Math.max(0, (globalThis.performance?.now?.() || blockStartedAt) - blockStartedAt);
      const blockBudgetMs = (frames / Math.max(1, sampleRate || this.hostSampleRate || 44100)) * 1000;
      const budgetRatio = blockBudgetMs > 0 ? elapsedMs / blockBudgetMs : 0;
      this.maxBlockProcessMs = Math.max(Number(this.maxBlockProcessMs) || 0, elapsedMs);
      this.maxBlockBudgetRatio = Math.max(Number(this.maxBlockBudgetRatio) || 0, budgetRatio);
      this.sumBlockProcessMs = (Number(this.sumBlockProcessMs) || 0) + elapsedMs;
      this.blockProcessCount = (Number(this.blockProcessCount) || 0) + 1;
      if (!(elapsedMs > 0)) {
        this.zeroElapsedQuanta = (Number(this.zeroElapsedQuanta) || 0) + 1;
      }
      this.meterBlockBudgetMs = blockBudgetMs;
      // Latch stress for the *next* quantum's shedding policy.
      this.audioThreadStressed = budgetRatio >= 0.85;
      if (budgetRatio >= 0.85) {
        this.meterOverrunCount += 1;
      }
    }
    this.meterCounter += frames;
    // Level meters ~60Hz; DSP load averages over ~1s so sub-tick work can show.
    if (this.meterCounter >= sampleRate / 60) {
      const realCount = Number(this.blockProcessCount) || 0;
      const count = Math.max(1, realCount);
      const budgetMs = Math.max(1e-6, Number(this.meterBlockBudgetMs) || ((frames / Math.max(1, sampleRate || 44100)) * 1000));
      const sumMs = Number(this.sumBlockProcessMs) || 0;
      const avgMs = sumMs / count;
      const avgRatio = avgMs / budgetMs;
      const timerResMs = Number(this._timerResMs) || 0;
      // Any completed quanta with a 0ms sum ⇒ timer did not resolve the callback.
      // That is NOT "0% load" / free headroom.
      const timedOut = realCount > 0 && !(sumMs > 0);
      const moduleCount = Number.isFinite(this.dspLiveModuleCount)
        ? this.dspLiveModuleCount
        : (Array.isArray(this.order) ? this.order.length : (this.nodes?.size || 0));
      // Relative cost when the timer is blind (weights from compileGraphLiveness).
      const costUnits = Number(this.dspCostUnits) || 0;
      const estimatedBudgetRatio = Math.max(0, Math.min(4, costUnits * 0.004));
      this.port.postMessage({
        audioPlayerNodeId: this.audioPlayerMeterNodeId || this.audioPlayerNodeIds[0] || "",
        audioPlayerNodeIds: [...this.audioPlayerNodeIds],
        audioPlayerPhase: this.audioPlayerMeterPhase,
        audioPlayerSpeed: this.audioPlayerMeterSpeed,
        audioPlayerSpeeds: this.audioPlayerMeterSpeeds || {},
        audioPlayerReason: this.audioPlayerMeterReason,
        audioPlayerSampleId: this.audioPlayerMeterSampleId || "",
        clipCount: this.meterClipCount,
        badNumberCount: this.badNumberCount,
        lastBadValueReason: this.lastBadValueReason,
        lastBadValueNodeId: this.lastBadValueNodeId,
        lastBadValueSource: this.lastBadValueSource,
        inputPeak: this.inputMeterPeak,
        inputRms: Math.sqrt(this.inputMeterSquareSum / Math.max(1, this.inputMeterSamples)),
        avgBlockBudgetRatio: avgRatio,
        avgBlockProcessMs: avgMs,
        maxBlockBudgetRatio: this.maxBlockBudgetRatio,
        maxBlockProcessMs: this.maxBlockProcessMs,
        meterTimedOut: timedOut,
        moduleCount,
        timerResMs,
        estimatedBudgetRatio: timedOut ? estimatedBudgetRatio : 0,
        dspCostUnits: costUnits,
        upperBoundBudgetRatio: timedOut && budgetMs > 0 ? (timerResMs / budgetMs) : 0,
        missedQuantumCount: this.meterMissedQuantumCount,
        overrunCount: this.meterOverrunCount,
        peak: this.meterPeak,
        protectionNodeId: this.speakerProtectionNodeId || "",
        protectionPeak: Number(this.speakerProtectionPeak) || 0,
        protectionMuteCount: this.meterProtectionMuteCount,
        protectionEngaged: Boolean(this.protectionEngaged),
        protectionGain: Number.isFinite(Number(this.protectionGain)) ? Number(this.protectionGain) : 1,
        sessionId: this.sessionId,
        rms: Math.sqrt(this.meterSquareSum / Math.max(1, this.meterSamples)),
        type: "meter",
      });
      this.meterCounter = 0;
      this.inputMeterPeak = 0;
      this.audioPlayerMeterNodeId = "";
      this.audioPlayerMeterPhase = 0;
      this.audioPlayerMeterSpeed = 0;
      this.audioPlayerMeterSpeeds = Object.create(null);
      this.audioPlayerMeterReason = "";
      this.inputMeterSamples = 0;
      this.inputMeterSquareSum = 0;
      this.meterClipCount = 0;
      this.badNumberCount = 0;
      this.meterOverrunCount = 0;
      this.meterMissedQuantumCount = 0;
      this.lastBadValueReason = "";
      this.lastBadValueNodeId = "";
      this.lastBadValueSource = "";
      this.meterPeak = 0;
      this.meterProtectionMuteCount = 0;
      this.speakerProtectionNodeId = "";
      this.speakerProtectionPeak = 0;
      this.meterSamples = 0;
      this.meterSquareSum = 0;
      // Hold DSP timing averages ~1s (don't reset every level-meter tick).
      this.dspMeterFrames = (Number(this.dspMeterFrames) || 0) + (sampleRate / 60);
      if (this.dspMeterFrames >= sampleRate) {
        this.dspMeterFrames = 0;
        this.maxBlockProcessMs = 0;
        this.maxBlockBudgetRatio = 0;
        this.sumBlockProcessMs = 0;
        this.blockProcessCount = 0;
        this.zeroElapsedQuanta = 0;
      }
    }
    if (this.gpuAdditiveStatusCounter >= sampleRate / 20) {
      this.gpuAdditiveStatusCounter = 0;
      this.postGpuAdditiveStatus();
    }
    return true;
};
