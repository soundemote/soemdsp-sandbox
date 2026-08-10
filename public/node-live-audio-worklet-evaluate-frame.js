// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: evaluateFrame — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.evaluateFrame = function evaluateFrame(frame, frames, inputs = [], rate = this.engineSampleRate || sampleRate, inputFrame = frame) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    // Advance free-running sample clock used by graph LFO Rate mode.
    this.absoluteFrame = (Number(this.absoluteFrame) || 0) + 1;
    // soemdsp SmootherManager::run — one step for dirty chases only, before DSP.
    this.runActiveSmoothers(frames);
    const frameValues = new Map();
    const mixInput = (nodeId, port = "In") => {
      const base = (
        this.inputConnections.get(this.inputKey(nodeId, port)) || []
      ).reduce((sum, connection) => sum + this.readRuntimePortOutput(
        frameValues,
        connection.sourceNode,
        connection.sourcePort,
        frame,
        frames,
      ), 0);
      const triggerKey = this.inputKey(nodeId, port);
      if (this.inputWireBreakTriggers.has(triggerKey)) {
        this.inputWireBreakTriggers.delete(triggerKey);
        return base + 1;
      }
      return base;
    };
    const hasInput = (nodeId, port) => this.inputConnections.has(this.inputKey(nodeId, port));
    const incomingClockRate = (nodeId) => {
      const connection = (this.inputConnections.get(this.inputKey(nodeId, "Clock")) || [])[0];
      const sourceNode = this.nodes.get(connection?.sourceNode);
      return sourceNode?.type === "clock"
        ? Math.max(0, Number(sourceNode.params?.rate) || 0)
        : 0;
    };
    // Map a raw control input from [inputMin, inputMax] into the graph's unit
    // domain [0, 1]. Equal endpoints fall back to 0 so a zero-width range does
    // not produce NaN; result is not clamped so wrap/phase can still loop.
    const graphMapInputToUnit = (raw, inputMin, inputMax) => {
      const min = Number(inputMin);
      const max = Number(inputMax);
      const lo = Number.isFinite(min) ? min : 0;
      const hi = Number.isFinite(max) ? max : 1;
      const span = hi - lo;
      if (Math.abs(span) < 1e-12) {
        return 0;
      }
      return ((Number(raw) || 0) - lo) / span;
    };
    // In LFO / Phasor modes, a connected In acts as an extra phase offset
    // (mapped through In Min/Max). Unconnected In contributes 0.
    const graphInputPhaseOffset = (node, nodeId) => {
      if (!hasInput(nodeId, "In")) {
        return 0;
      }
      const inputMin = this.readEffectiveParameter(node, "inputMin", 0, frame, frames, frameValues);
      const inputMax = this.readEffectiveParameter(node, "inputMax", 1, frame, frames, frameValues);
      return graphMapInputToUnit(mixInput(nodeId), inputMin, inputMax);
    };
    const graphSampleX = (node, nodeId) => {
      // mode: 0 Input | 1 LFO (wall-clock t*rate) | 2 Phasor (accumulate rate/sr)
      const mode = Math.round(this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues));
      const phaseValue = this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues);
      // Phase is always a pure time/position offset: same loop, just starts
      // reading at phase instead of 0.
      if (mode <= 0) {
        const inputMin = this.readEffectiveParameter(node, "inputMin", 0, frame, frames, frameValues);
        const inputMax = this.readEffectiveParameter(node, "inputMax", 1, frame, frames, frameValues);
        return this.wrapValue(
          graphMapInputToUnit(mixInput(nodeId), inputMin, inputMax) + phaseValue,
          0,
          1,
        );
      }
      const rateValue = Math.max(0, this.readEffectiveParameter(node, "rate", 1, frame, frames, frameValues));
      const state = this.graphLfoStates.get(nodeId) || this.createGraphLfoState();
      this.graphLfoStates.set(nodeId, state);
      const inputOffset = graphInputPhaseOffset(node, nodeId);
      // Phasor: free-running accumulator. Rate changes only affect how fast we
      // advance from the current position — no wall-clock recompute jump.
      if (mode >= 2) {
        let phasor = Number(state.phase);
        if (!Number.isFinite(phasor)) {
          phasor = 0;
        }
        phasor += rateValue / safeRate;
        phasor -= Math.floor(phasor);
        state.phase = phasor;
        return this.wrapValue(phasor + phaseValue + inputOffset, 0, 1);
      }
      // LFO: wall-clock phase from absolute frame (rate change can jump).
      // Connected In adds the same kind of phase offset as the Phase param.
      const resetValue = 0;
      const currentFrame = Number(this.absoluteFrame) || 0;
      if (state.lastReset <= 0 && resetValue > 0) {
        state.resetFrame = currentFrame;
      }
      state.lastReset = resetValue;
      const resetFrame = Number.isFinite(state.resetFrame) ? state.resetFrame : 0;
      return this.wrapValue(
        ((currentFrame - resetFrame) / safeRate) * rateValue + phaseValue + inputOffset,
        0,
        1,
      );
    };
    const graphOutputValue = (node, nodeId) => {
      const sampleX = graphSampleX(node, nodeId);
      const nodeTension = Number(node?.params?.tension) ?? 1;
      const normalizedValue = this.graphValueAt(
        this.graphForNode(node),
        sampleX,
        this.graphSmoothingModeForNode(node),
        nodeTension,
        this.graphSegmentOptionsForNode(node),
      );
      const outputMin = this.readEffectiveParameter(node, "outputMin", 0, frame, frames, frameValues);
      const outputMax = this.readEffectiveParameter(node, "outputMax", 1, frame, frames, frameValues);
      return {
        Out: outputMin + normalizedValue * (outputMax - outputMin),
        // Live playhead on the graph editor reads this port.
        __GraphPhase: sampleX,
      };
    };
    const graphInputValue = (nodeId, graphInput, x, fallback) => {
      const connection = (this.graphInputConnections.get(this.graphInputKey(nodeId, graphInput)) || [])[0];
      const source = connection ? this.nodes.get(connection.sourceNode) : null;
      if (!source || (source.type !== "graph2" && source.type !== "graphCopy")) {
        return fallback;
      }
      return this.graphValueAt(
        this.graphForNode(source),
        this.clampValue(Number(x) || 0, 0, 1),
        this.graphSmoothingModeForNode(source),
        Number(source?.params?.tension) ?? 1,
        this.graphSegmentOptionsForNode(source),
      );
    };

    for (const nodeId of this.order) {
      const node = this.nodes.get(nodeId);
      let value = 0;
      if (node?.bypassed) {
        // Soft bypass: pass / average / silence — no DSP while disabled.
        value = typeof nodeGraphEvaluateBypassFrame === "function"
          ? nodeGraphEvaluateBypassFrame(node.bypassSpec || { mode: "silence" }, nodeId, mixInput)
          : 0;
      } else {
        const liveModuleEvaluator = node?.type ? this.liveModuleEvaluators[node.type] : null;
        if (liveModuleEvaluator) {
          value = liveModuleEvaluator(node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue, graphOutputValue);
        } else if (node?.type === "audioInput") {
          // Hardware process() buffers (not externalInput map) — same stereo math as helpers.
          const input = inputs[0] || [];
          const leftChannel = input[0] || input[1] || null;
          const rightChannel = input[1] || input[0] || null;
          const level = this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);
          value = nodeGraphDspExternalStereoFrame(
            { left: leftChannel, right: rightChannel },
            inputFrame,
            level,
          );
        }
      }
      frameValues.set(nodeId, value);
      this.nodeOutputs.set(nodeId, value);
    }

    const outputNodeId = this.outputNode || "output";
    const outputNode = this.nodes.get(outputNodeId);
    const outputVolume = outputNode
      ? this.readEffectiveParameter(outputNode, "volume", 0.1, frame, frames, frameValues)
      : 1;

    const outputMono = mixInput(outputNodeId, "Mono");
    const left = (outputMono + mixInput(outputNodeId, "Left")) * outputVolume;
    const right = (outputMono + mixInput(outputNodeId, "Right")) * outputVolume;
    // Output is a speaker sink with no DSP evaluator — the order loop above
    // only stored scalar 0. Scope capture reads nodeOutputs for stereo Trace
    // (output:Left / output:Right); publish the real bus so the face is not
    // stuck as a blank / flat-zero plate.
    this.nodeOutputs.set(outputNodeId, {
      Left: left,
      Mono: outputMono * outputVolume,
      Out: (left + right) * 0.5,
      Right: right,
    });
    this.currentFrameValues = frameValues;
    return {
      left,
      right,
    };
};
