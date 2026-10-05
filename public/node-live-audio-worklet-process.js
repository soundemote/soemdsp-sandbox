// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: process — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.captureRecordingQuantum = function captureRecordingQuantum(left, right) {
  const count = left?.length || 0;
  if (!count) {
    return;
  }
  const fill = this._recFill || 0;
  if (!this._recL || fill + count > this._recL.length) {
    const cap = Math.max(4096, (fill + count) * 2);
    const nextL = new Float32Array(cap);
    const nextR = new Float32Array(cap);
    if (this._recL && fill) {
      nextL.set(this._recL.subarray(0, fill));
      nextR.set(this._recR.subarray(0, fill));
    }
    this._recL = nextL;
    this._recR = nextR;
  }
  this._recL.set(left, fill);
  this._recR.set(right || left, fill);
  this._recFill = fill + count;
  const posted = this._recPosted || 0;
  if (this._recFill - posted < 2048) {
    return;
  }
  const takeL = this._recL.slice(posted, this._recFill);
  const takeR = this._recR.slice(posted, this._recFill);
  this._recPosted = this._recFill;
  this.port.postMessage({ type: "recordChunk", left: takeL, right: takeR }, [takeL.buffer, takeR.buffer]);
};

NodeLiveAudioProcessor.prototype.flushRecordingQuantum = function flushRecordingQuantum() {
  const fill = this._recFill || 0;
  const posted = this._recPosted || 0;
  if (fill > posted && this._recL) {
    const takeL = this._recL.slice(posted, fill);
    const takeR = this._recR.slice(posted, fill);
    this.port.postMessage({ type: "recordChunk", left: takeL, right: takeR }, [takeL.buffer, takeR.buffer]);
  }
  this._recFill = 0;
  this._recPosted = 0;
  this.port.postMessage({ type: "recordEnded" });
};

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
          this.meterOverrunCount = (nodeGraphFiniteNumber(this.meterOverrunCount)) + missed;
          this.meterMissedQuantumCount = (nodeGraphFiniteNumber(this.meterMissedQuantumCount)) + missed;
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
        this.meterOverrunCount = (nodeGraphFiniteNumber(this.meterOverrunCount)) + lateUnits;
        this.meterMissedQuantumCount = (nodeGraphFiniteNumber(this.meterMissedQuantumCount)) + lateUnits;
      }
    }
    if (callbackWall > 0) {
      this._prevProcessWall = callbackWall;
    }
    // Same buffer the Input / Plugin Input evaluators scale by Amplitude.
    this.externalInput = {
      left: input[0] ?? input[1] ?? null,
      right: input[1] ?? input[0] ?? null,
    };
    // App-wide oversampling: process at host*N, Rapt-elliptic decimate to host.
    const rawFactor = Math.round(Number(this.oversamplingRatio || this.oversamplingFactor || 1));
    const oversamplingRatio = (rawFactor === 2 || rawFactor === 4) ? rawFactor : 1;
    const hostRate = Math.max(1, this.hostSampleRate || sampleRate || 44100);
    const rawEngineSampleRate = Math.max(1, this.engineSampleRate || (hostRate * oversamplingRatio));
    const speedMul = Math.max(0, this.speedMultiplier ?? 1);
    const effectiveRate = speedMul > 0
      ? Math.max(1, rawEngineSampleRate / speedMul)
      : 1;
    const engineFrames = frames * oversamplingRatio;
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
    // HARD RUNTIME FAILURE: audio must go through processNativeGraphQuantum only.
    let usedNativeGraph = false;
    if (Boolean(this.efficientProduct)) {
      if (typeof this.processNativeGraphQuantum !== "function") {
        throw new Error(
          "APP_POLICY: efficientProduct requires processNativeGraphQuantum (no JS DSP audio path)",
        );
      }
      if (oversamplingRatio <= 1) {
        usedNativeGraph = this.processNativeGraphQuantum(output, frames);
      } else {
        if (!this._oversampleScratchL || this._oversampleScratchL.length < engineFrames) {
          this._oversampleScratchL = new Float32Array(engineFrames);
          this._oversampleScratchR = new Float32Array(engineFrames);
        }
        const osOut = [this._oversampleScratchL, this._oversampleScratchR];
        usedNativeGraph = this.processNativeGraphQuantum(osOut, engineFrames);
        if (usedNativeGraph) {
          this.ensureNativeRaptDecimators();
          this.decimateNativeRaptEllipticChannel(
            this.nativeRaptDecimatorLeft,
            this._oversampleScratchL.subarray(0, engineFrames),
            output[0],
            oversamplingRatio,
          );
          const destR = output[1] || output[0];
          if (destR && destR !== output[0]) {
            this.decimateNativeRaptEllipticChannel(
              this.nativeRaptDecimatorRight,
              this._oversampleScratchR.subarray(0, engineFrames),
              destR,
              oversamplingRatio,
            );
          } else {
            this.decimateNativeRaptEllipticChannel(
              this.nativeRaptDecimatorRight,
              this._oversampleScratchR.subarray(0, engineFrames),
              this._oversampleScratchL.subarray(0, frames),
              oversamplingRatio,
            );
          }
        } else {
          for (const channel of output) {
            if (channel) channel.fill(0);
          }
        }
      }
    }
    if (this.efficientProduct && !usedNativeGraph) {
      for (const channel of output) {
        if (channel) channel.fill(0);
      }
    }
    // Music Player is native (PCM upload + audio_player opcode). JS peel retired.

    // Efficient path: rings already filled from native taps in processNativeGraphQuantum.
    // Throttled snapshot/visual posts only (never evaluateFrame).
    if (usedNativeGraph) {
      if (this.recordingTake && output[0]) {
        this.captureRecordingQuantum(output[0], output[1] || output[0]);
      }
      this.scopeCounter = (nodeGraphFiniteNumber(this.scopeCounter)) + frames;
      const displayFps = Number(this.displayFps);
      // Counters advance by host frames each quantum. Pace against the host
      // AudioContext rate (wall clock), not effectiveRate (engine =
      // host*oversampling). Do not also divide by the stress factor — that
      // quartered the display setting on top of any oversampling mistake.
      const hostRateForDisplay = Math.max(
        1,
        nodeGraphFiniteNumber(this.hostSampleRate, nodeGraphFiniteNumber(sampleRate, 44100)),
      );
      if (displayFps > 0) {
        this.scopeSnapshotCounter = (nodeGraphFiniteNumber(this.scopeSnapshotCounter)) + frames;
        const snapshotEvery = Math.max(1, Math.floor(hostRateForDisplay / displayFps));
        if (this.scopeSnapshotCounter >= snapshotEvery) {
          // One scope post at a time. If the page has not acked, skip.
          // postMessage onto a wedged main thread is what drops audio.
          if (this.scopePostInFlight) {
            this.scopeSnapshotCounter = snapshotEvery;
          } else {
            const posted = this.postModuleScopeSnapshot?.();
            this.scopeSnapshotCounter = 0;
            this.scopePostInFlight = posted === true;
          }
        }
      }
      this.visualControlCounter = (nodeGraphFiniteNumber(this.visualControlCounter)) + frames;
      const visualEvery = Math.max(1, Math.floor(hostRateForDisplay / 30));
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
        this.maxBlockProcessMs = Math.max(nodeGraphFiniteNumber(this.maxBlockProcessMs), elapsedMs);
        this.maxBlockBudgetRatio = Math.max(nodeGraphFiniteNumber(this.maxBlockBudgetRatio), budgetRatio);
        this.sumBlockProcessMs = (nodeGraphFiniteNumber(this.sumBlockProcessMs)) + elapsedMs;
        this.blockProcessCount = (nodeGraphFiniteNumber(this.blockProcessCount)) + 1;
        if (!(elapsedMs > 0)) {
          this.zeroElapsedQuanta = (nodeGraphFiniteNumber(this.zeroElapsedQuanta)) + 1;
        }
        this.meterBlockBudgetMs = blockBudgetMs;
      }
      this.meterCounter += frames;
      if (this.meterCounter >= sampleRate / 60) {
        const realCount = nodeGraphFiniteNumber(this.blockProcessCount);
        const count = Math.max(1, realCount);
        const budgetMs = Math.max(1e-6, Number(this.meterBlockBudgetMs) || ((frames / Math.max(1, sampleRate || 44100)) * 1000));
        const sumMs = nodeGraphFiniteNumber(this.sumBlockProcessMs);
        const avgMs = sumMs / count;
        const avgRatio = avgMs / budgetMs;
        const timerResMs = nodeGraphFiniteNumber(this._timerResMs);
        const timedOut = realCount > 0 && !(sumMs > 0);
        const moduleCount = Number.isFinite(this.dspLiveModuleCount)
          ? this.dspLiveModuleCount
          : (Array.isArray(this.order) ? this.order.length : (this.nodes?.size || 0));
        const costUnits = nodeGraphFiniteNumber(this.dspCostUnits);
        const estimatedBudgetRatio = Math.max(0, Math.min(4, costUnits * 0.004));
        this.port.postMessage({
          audioPlayerNodeId: this.audioPlayerMeterNodeId || this.audioPlayerNodeIds[0] || "",
          audioPlayerNodeIds: [...this.audioPlayerNodeIds],
          audioPlayerPhase: this.audioPlayerMeterPhase,
          audioPlayerSpeed: this.audioPlayerMeterSpeed,
          audioPlayerSpeeds: this.audioPlayerMeterSpeeds || {},
          audioPlayerPhases: this.audioPlayerMeterPhases || {},
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
          protectionPeak: nodeGraphFiniteNumber(this.speakerProtectionPeak),
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
        this.dspMeterFrames = (nodeGraphFiniteNumber(this.dspMeterFrames)) + (sampleRate / 60);
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

    // APP_POLICY HARD RUNTIME FAILURE: JS evaluateFrame audio path must never run.
    for (const channel of output) {
      if (channel) channel.fill(0);
    }
    throw new Error(
      "APP_POLICY: JS evaluateFrame audio path removed — native graph only (processNativeGraphQuantum)",
    );
};
