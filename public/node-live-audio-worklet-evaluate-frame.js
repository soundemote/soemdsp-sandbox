// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: evaluateFrame — load after core class, before registerProcessor.

// Hot-path helpers: bound once on the processor; read per-sample ctx from `this`.
NodeLiveAudioProcessor.prototype.mixInputPort = function mixInputPort(nodeId, port = "In") {
  const frameValues = this._evalFrameValues;
  const frame = this._evalFrame;
  const frames = this._evalFrames;
  const key = this.inputKey(nodeId, port);
  const connections = this.inputConnections.get(key);
  let base = 0;
  if (connections && connections.length) {
    for (let i = 0; i < connections.length; i += 1) {
      const connection = connections[i];
      base += this.readRuntimePortOutput(
        frameValues,
        connection.sourceNode,
        connection.sourcePort,
        frame,
        frames,
      );
    }
  }
  if (this.inputWireBreakTriggers.has(key)) {
    this.inputWireBreakTriggers.delete(key);
    return base + 1;
  }
  return base;
};

NodeLiveAudioProcessor.prototype.hasInputPort = function hasInputPort(nodeId, port) {
  return this.inputConnections.has(this.inputKey(nodeId, port));
};

NodeLiveAudioProcessor.prototype.graphMapInputToUnit = function graphMapInputToUnit(raw, inputMin, inputMax) {
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

NodeLiveAudioProcessor.prototype.graphInputPhaseOffset = function graphInputPhaseOffset(node, nodeId) {
  if (!this.hasInputPort(nodeId, "In")) {
    return 0;
  }
  const frame = this._evalFrame;
  const frames = this._evalFrames;
  const frameValues = this._evalFrameValues;
  const inputMin = this.readEffectiveParameter(node, "inputMin", 0, frame, frames, frameValues);
  const inputMax = this.readEffectiveParameter(node, "inputMax", 1, frame, frames, frameValues);
  return this.graphMapInputToUnit(this.mixInputPort(nodeId), inputMin, inputMax);
};

NodeLiveAudioProcessor.prototype.graphSampleXAt = function graphSampleXAt(node, nodeId) {
  const frame = this._evalFrame;
  const frames = this._evalFrames;
  const frameValues = this._evalFrameValues;
  const safeRate = this._evalSafeRate;
  // mode: 0 Input | 1 LFO (wall-clock t*rate) | 2 Phasor (accumulate rate/sr)
  const mode = Math.round(this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues));
  const phaseValue = this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues);
  if (mode <= 0) {
    const inputMin = this.readEffectiveParameter(node, "inputMin", 0, frame, frames, frameValues);
    const inputMax = this.readEffectiveParameter(node, "inputMax", 1, frame, frames, frameValues);
    return this.wrapValue(
      this.graphMapInputToUnit(this.mixInputPort(nodeId), inputMin, inputMax) + phaseValue,
      0,
      1,
    );
  }
  const rateValue = Math.max(0, this.readEffectiveParameter(node, "rate", 1, frame, frames, frameValues));
  const state = this.graphLfoStates.get(nodeId) || this.createGraphLfoState();
  this.graphLfoStates.set(nodeId, state);
  const inputOffset = this.graphInputPhaseOffset(node, nodeId);
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

NodeLiveAudioProcessor.prototype.graphOutputValueAt = function graphOutputValueAt(node, nodeId) {
  const frame = this._evalFrame;
  const frames = this._evalFrames;
  const frameValues = this._evalFrameValues;
  const sampleX = this.graphSampleXAt(node, nodeId);
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
    __GraphPhase: sampleX,
  };
};

NodeLiveAudioProcessor.prototype.graphInputValueAt = function graphInputValueAt(nodeId, graphInput, x, fallback) {
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

NodeLiveAudioProcessor.prototype.compileExecutionOrder = function compileExecutionOrder() {
  const order = this.order || [];
  const compiled = new Array(order.length);
  const evaluators = this.liveModuleEvaluators;
  for (let i = 0; i < order.length; i += 1) {
    const nodeId = order[i];
    const node = this.nodes.get(nodeId);
    const type = node?.type || "";
    compiled[i] = {
      nodeId,
      type,
      evaluator: type && evaluators ? (evaluators[type] || null) : null,
    };
  }
  this.compiledOrder = compiled;
};

// Which output ports are actually wired, and which nodes anyone listens to.
// Unwired oscillators were still paying full WASM; polyBlep was fetching every wave tap.
NodeLiveAudioProcessor.prototype.compileGraphLiveness = function compileGraphLiveness() {
  const usedPorts = new Map(); // nodeId -> Set(port)
  const audioConsumers = new Set();
  const connections = this.inputConnections;
  if (connections && typeof connections.forEach === "function") {
    connections.forEach((list) => {
      if (!list || !list.length) {
        return;
      }
      for (let i = 0; i < list.length; i += 1) {
        const connection = list[i];
        const sourceNode = connection?.sourceNode;
        if (!sourceNode) {
          continue;
        }
        audioConsumers.add(sourceNode);
        let ports = usedPorts.get(sourceNode);
        if (!ports) {
          ports = new Set();
          usedPorts.set(sourceNode, ports);
        }
        ports.add(connection.sourcePort || "Out");
      }
    });
  }
  const modulations = this.modulationConnections;
  if (modulations && typeof modulations.forEach === "function") {
    modulations.forEach((list) => {
      if (!list || !list.length) {
        return;
      }
      for (let i = 0; i < list.length; i += 1) {
        const sourceNode = list[i]?.sourceNode;
        if (sourceNode) {
          audioConsumers.add(sourceNode);
        }
      }
    });
  }
  const scopeKeep = new Set(this.scopeCaptureNodeIds || []);
  for (const sink of this.compiledVisualSinks || this.visualSinks || []) {
    const sinkId = String(sink?.nodeId || "");
    if (sinkId) {
      scopeKeep.add(sinkId);
    }
  }
  const mustRun = new Set(audioConsumers);
  for (const nodeId of scopeKeep) {
    mustRun.add(nodeId);
  }
  if (this.outputNode) {
    mustRun.add(this.outputNode);
  }
  // Cost weights for meter when performance.now is blind inside process().
  const weightFor = (type) => {
    switch (type) {
      case "polyBlep":
      case "blit":
        return 12;
      case "reverbEffect":
      case "sabrinaReverb":
      case "soemReverb":
        return 45;
      case "pingPongDelay":
        return 22;
      case "softClipper":
        return 7;
      case "ladderFilter":
        return 8;
      case "output":
      case "pluginOutput":
        return 1;
      default:
        return 4;
    }
  };
  let costUnits = 0;
  let liveModules = 0;
  const order = this.order || [];
  for (let i = 0; i < order.length; i += 1) {
    const nodeId = order[i];
    const node = this.nodes.get(nodeId);
    const type = node?.type || "";
    if (!mustRun.has(nodeId) && type !== "audioInput" && type !== "output" && type !== "pluginOutput") {
      continue;
    }
    liveModules += 1;
    costUnits += weightFor(type);
  }
  this.nodeUsedOutputPorts = usedPorts;
  this.nodeAudioConsumers = audioConsumers;
  this.nodeMustEvaluate = mustRun;
  this.dspCostUnits = costUnits;
  this.dspLiveModuleCount = liveModules;
};

NodeLiveAudioProcessor.prototype.nodeNeedsEvaluate = function nodeNeedsEvaluate(nodeId, type) {
  if (!nodeId) {
    return true;
  }
  if (type === "audioInput" || type === "output" || type === "pluginOutput") {
    return true;
  }
  const must = this.nodeMustEvaluate;
  if (!must || !(must instanceof Set)) {
    return true;
  }
  return must.has(nodeId);
};

NodeLiveAudioProcessor.prototype.evaluateFrame = function evaluateFrame(frame, frames, inputs = [], rate = this.engineSampleRate || sampleRate, inputFrame = frame) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    // Advance free-running sample clock used by graph LFO Rate mode.
    this.absoluteFrame = (Number(this.absoluteFrame) || 0) + 1;
    // soemdsp SmootherManager::run — one step for dirty chases only, before DSP.
    this.runActiveSmoothers(frames);

    // Reuse one Map per processor lifetime — was `new Map()` every sample.
    const frameValues = this.frameValues || (this.frameValues = new Map());
    frameValues.clear();
    this._evalFrameValues = frameValues;
    this._evalFrame = frame;
    this._evalFrames = frames;
    this._evalSafeRate = safeRate;

    const mixInput = this.boundMixInput;
    const hasInput = this.boundHasInput;
    const graphInputValue = this.boundGraphInputValue;
    const graphOutputValue = this.boundGraphOutputValue;

    const compiled = this.compiledOrder;
    const useCompiled = Array.isArray(compiled) && compiled.length === (this.order?.length || 0);
    const count = useCompiled ? compiled.length : (this.order?.length || 0);

    for (let i = 0; i < count; i += 1) {
      const nodeId = useCompiled ? compiled[i].nodeId : this.order[i];
      const node = this.nodes.get(nodeId);
      let value = 0;
      if (node?.bypassed) {
        // Soft bypass: pass / average / silence — no DSP while disabled.
        value = typeof nodeGraphEvaluateBypassFrame === "function"
          ? nodeGraphEvaluateBypassFrame(node.bypassSpec || { mode: "silence" }, nodeId, mixInput)
          : 0;
      } else if (!this.nodeNeedsEvaluate(nodeId, node?.type)) {
        // No cable/mod/scope listener — do not run DSP (orphan polyBleps etc.).
        value = 0;
      } else {
        const liveModuleEvaluator = useCompiled
          ? compiled[i].evaluator
          : (node?.type ? this.liveModuleEvaluators[node.type] : null);
        if (liveModuleEvaluator) {
          value = liveModuleEvaluator(node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue, graphOutputValue);
          if (typeof nodeGraphApplyPostAmplitude === "function") {
            value = nodeGraphApplyPostAmplitude(
              node.type,
              value,
              this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues),
            );
          }
        } else if (node?.type === "audioInput") {
          // Hardware process() buffers (not externalInput map) — same stereo math as helpers.
          const input = inputs[0] || [];
          const leftChannel = input[0] || input[1] || null;
          const rightChannel = input[1] || input[0] || null;
          const amplitude = this.readEffectiveParameter(node, "amplitude", NaN, frame, frames, frameValues);
          const level = Number.isFinite(amplitude)
            ? amplitude
            : this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);
          const live = nodeGraphDspExternalStereoFrame(
            { left: leftChannel, right: rightChannel },
            inputFrame,
            level,
          );
          value = typeof nodeGraphDspSandboxIoFrame === "function"
            ? nodeGraphDspSandboxIoFrame(
              live,
              mixInput(nodeId, "Mono"),
              mixInput(nodeId, "Left"),
              mixInput(nodeId, "Right"),
            )
            : live;
        }
      }
      frameValues.set(nodeId, value);
      this.nodeOutputs.set(nodeId, value);
    }

    const outputNodeId = this.outputNode || "output";
    const outputNode = this.nodes.get(outputNodeId);
    const outputDb = outputNode
      ? this.readEffectiveParameter(outputNode, "volume", -3, frame, frames, frameValues)
      : 0;
    const outputVolume = typeof nodeGraphOutputVolumeDbToLin === "function"
      ? nodeGraphOutputVolumeDbToLin(outputDb)
      : (!Number.isFinite(outputDb) || outputDb <= -140 ? 0 : 10 ** (outputDb / 20));
    const outputPan = outputNode
      ? this.readEffectiveParameter(outputNode, "pan", 0, frame, frames, frameValues)
      : 0;
    const outputPanGains = typeof nodeGraphOutputPanGains === "function"
      ? nodeGraphOutputPanGains(outputPan)
      : { left: 1, right: 1 };

    const outputMono = mixInput(outputNodeId, "Mono");
    let left = (outputMono + mixInput(outputNodeId, "Left")) * outputVolume * outputPanGains.left;
    let right = (outputMono + mixInput(outputNodeId, "Right")) * outputVolume * outputPanGains.right;
    if (typeof nodeGraphPortalMixOutlets === "function") {
      const mixed = nodeGraphPortalMixOutlets(this.nodes, mixInput, left, right);
      left = mixed.left;
      right = mixed.right;
    }
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
