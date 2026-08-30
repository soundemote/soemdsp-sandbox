function nodeGraphBuildLivePlan() {
  const compiled = compileNodeGraphExecutionPlan();
  if (!compiled.valid) {
    const error = new Error(compiled.issues.join(", "));
    error.issues = [...compiled.issues];
    throw error;
  }

  // Efficient product: do not hard-block Live when a foreign module (e.g. audioPlayer)
  // sits in the patch. Strip those types from the live schedule so allowlisted
  // DSP still runs; surface the skip on the plan status pill.
  let efficientForeignStripped = [];
  if (typeof nodeGraphEfficientProductEnabled === "function"
    && nodeGraphEfficientProductEnabled()
    && typeof nodeGraphEfficientProductForeignTypesFromNodes === "function") {
    const planNodes = (compiled.order || [])
      .map((nodeId) => nodeGraphMvp.patch?.nodes?.find((node) => node.id === nodeId))
      .filter(Boolean);
    const fallbackNodes = planNodes.length
      ? planNodes
      : (Array.isArray(nodeGraphMvp.patch?.nodes) ? nodeGraphMvp.patch.nodes : []);
    efficientForeignStripped = nodeGraphEfficientProductForeignTypesFromNodes(fallbackNodes);
  }

  const activeNodeIds = nodeGraphActiveNodeIds(compiled);
  const activeSignalConnections = nodeGraphActiveSignalConnections(compiled)
    .map((connection) => ({ ...connection }));
  const activeGraphConnections = nodeGraphActiveGraphConnections(compiled)
    .map((connection) => ({ ...connection }));
  const activeModulations = nodeGraphActiveModulations(compiled)
    .map((modulation) => ({ ...modulation }));

  const plan = {
    bypassedNodes: [...(compiled.bypassedNodes || [])],
    connections: activeSignalConnections,
    feedbackConnections: compiled.feedbackConnections.map((connection) => ({ ...connection })),
    feedbackGraphConnections: (compiled.feedbackGraphConnections || []).map((connection) => ({ ...connection })),
    feedbackModulations: compiled.feedbackModulations.map((modulation) => ({ ...modulation })),
    graphConnections: activeGraphConnections,
    modulations: activeModulations,
    nodes: nodeGraphBuildLiveParameterNodes(activeNodeIds, compiled.bypassedNodes),
    order: [...compiled.order],
    outputNode: compiled.outputNode,
    patchFingerprint: nodeGraphPatchFingerprint(),
    scopeCaptureNodeIds: [...(compiled.scopeCaptureNodeIds || [])],
    scopeCaptureRates: compiled.scopeCaptureRates && typeof compiled.scopeCaptureRates === "object"
      ? { ...compiled.scopeCaptureRates }
      : {},
    speakerOutputActive: Boolean(compiled.speakerOutputActive),
    sourceNodes: [...compiled.sourceNodes],
    timing: typeof normalizeNodeGraphPatchTiming === "function"
      ? normalizeNodeGraphPatchTiming(compiled.timing)
      : compiled.timing || null,
    visualSinks: (compiled.visualSinks || []).map((sink) => ({
      ...sink,
      bufferedInputs: [...(sink.bufferedInputs || [])],
      inputs: (sink.inputs || []).map((input) => ({ ...input })),
    })),
  };
  plan.samples = typeof nodeGraphLiveSamplesForPlan === "function"
    ? nodeGraphLiveSamplesForPlan(plan, nodeGraphMvp.patch)
    : [];
  if (efficientForeignStripped.length
    && typeof nodeGraphEfficientProductStripForeignFromLivePlan === "function") {
    const stripped = nodeGraphEfficientProductStripForeignFromLivePlan(plan);
    if (stripped.foreignTypes.length && typeof setNodeGraphLivePlanStatus === "function") {
      const msg = typeof nodeGraphEfficientProductRefuseMessage === "function"
        ? nodeGraphEfficientProductRefuseMessage(stripped.foreignTypes)
        : `skipped: ${stripped.foreignTypes.join(", ")}`;
      setNodeGraphLivePlanStatus(`live skips ${stripped.foreignTypes.join(", ")}`, "warn");
      if (typeof setNodeGraphLivePlanTitle === "function") {
        setNodeGraphLivePlanTitle(msg);
      }
    }
    return stripped.plan;
  }
  return plan;
}

function nodeGraphBuildLivePlanForPatch(patch) {
  const normalizedPatch = validateNodeGraphPatch(patch);
  const compiled = compileNodeGraphExecutionPlan(normalizedPatch);
  if (!compiled.valid) {
    const error = new Error(compiled.issues.join(", "));
    error.issues = [...compiled.issues];
    throw error;
  }
  const activeNodeIds = nodeGraphActiveNodeIds(compiled);
  const plan = {
    bypassedNodes: [...(compiled.bypassedNodes || [])],
    connections: nodeGraphActiveSignalConnections(compiled).map((connection) => ({ ...connection })),
    feedbackConnections: compiled.feedbackConnections.map((connection) => ({ ...connection })),
    feedbackGraphConnections: (compiled.feedbackGraphConnections || []).map((connection) => ({ ...connection })),
    feedbackModulations: compiled.feedbackModulations.map((modulation) => ({ ...modulation })),
    graphConnections: nodeGraphActiveGraphConnections(compiled).map((connection) => ({ ...connection })),
    modulations: nodeGraphActiveModulations(compiled).map((modulation) => ({ ...modulation })),
    nodes: nodeGraphBuildLiveParameterNodesForPatch(normalizedPatch, activeNodeIds, compiled.bypassedNodes),
    order: [...compiled.order],
    outputNode: compiled.outputNode,
    patchFingerprint: nodeGraphPatchFingerprint(normalizedPatch),
    scopeCaptureNodeIds: [...(compiled.scopeCaptureNodeIds || [])],
    scopeCaptureRates: compiled.scopeCaptureRates && typeof compiled.scopeCaptureRates === "object"
      ? { ...compiled.scopeCaptureRates }
      : {},
    speakerOutputActive: Boolean(compiled.speakerOutputActive),
    sourceNodes: [...compiled.sourceNodes],
    timing: normalizeNodeGraphPatchTiming(compiled.timing),
    visualSinks: [],
  };
  plan.samples = typeof nodeGraphLiveSamplesForPlan === "function"
    ? nodeGraphLiveSamplesForPlan(plan, normalizedPatch)
    : [];
  if (typeof nodeGraphEfficientProductStripForeignFromLivePlan === "function") {
    return nodeGraphEfficientProductStripForeignFromLivePlan(plan).plan;
  }
  return plan;
}

/**
 * Spectrogram: analysis knobs from display settings; view knobs from module params.
 * Inject into worklet (fftSize, window, overlap, freqOverlap, freqScale) +
 * historySeconds / minFreq / maxFreq for any main-thread consumers.
 */
function nodeGraphInjectSpectrogramWorkletParams(node, params) {
  if (!node || node.type !== "spectrogram" || !params || typeof params !== "object") {
    return;
  }
  const p = node.params && typeof node.params === "object" ? node.params : {};
  if (typeof normalizeNodeGraphSpectrogramSettings === "function") {
    const safe = normalizeNodeGraphSpectrogramSettings(node.traceDisplaySettings || {}, node);
    params.fftSize = safe.fftSize;
    params.window = safe.window;
    params.overlap = safe.overlap;
    params.freqOverlap = safe.freqOverlap;
    params.freqScale = safe.freqScale;
    // Face view: module sliders win; fall back to legacy display settings.
    const hist = Number(p.historySeconds ?? safe.historySeconds);
    params.historySeconds = Number.isFinite(hist) && hist > 0 ? hist : 2;
    const minF = Number(p.minFreq ?? safe.minFreq);
    const maxF = Number(p.maxFreq ?? safe.maxFreq);
    params.minFreq = Number.isFinite(minF) ? minF : 20;
    params.maxFreq = Number.isFinite(maxF) ? maxF : 20000;
    return;
  }
  const rawFft = node.traceDisplaySettings?.fftSize ?? p.fftSize ?? 1024;
  params.fftSize = Number.isFinite(Number(rawFft)) ? Number(rawFft) : 1024;
  params.window = Number(node.traceDisplaySettings?.window ?? p.window ?? 1) || 1;
  params.overlap = Number(node.traceDisplaySettings?.overlap ?? p.overlap ?? 2) || 2;
  params.freqOverlap = Number(node.traceDisplaySettings?.freqOverlap ?? p.freqOverlap ?? 0) || 0;
  params.freqScale = Number(node.traceDisplaySettings?.freqScale ?? p.freqScale ?? 1) || 1;
  params.historySeconds = Number(p.historySeconds ?? node.traceDisplaySettings?.historySeconds ?? 2) || 2;
  params.minFreq = Number(p.minFreq ?? 20) || 20;
  params.maxFreq = Number(p.maxFreq ?? 20000) || 20000;
}

function nodeGraphBuildLiveParameterNodes(activeNodeIds = null, bypassedNodes = null) {
  const activeIds = activeNodeIds instanceof Set ? activeNodeIds : null;
  const bypassed = bypassedNodes instanceof Set
    ? bypassedNodes
    : new Set(Array.isArray(bypassedNodes) ? bypassedNodes : (nodeGraphMvp.patch.bypassedNodes || []));
  return nodeGraphMvp.patch.nodes
    .filter((node) => !activeIds || activeIds.has(node.id))
    .map((node) => {
      const definition = nodeGraphModuleDefinitions[node.type];
      const params = {};
      const paramMeta = {};
      for (const parameter of definition.parameters || []) {
        const value = nodeGraphReadPatchParameterValue(node, parameter.key);
        params[parameter.key] = Number.isFinite(value)
          ? value
          : nodeGraphParameterFallback(node.type, parameter.key);
        paramMeta[parameter.key] = nodeGraphReadPatchParameterMetadata(node, parameter.key);
      }
      nodeGraphInjectSpectrogramWorkletParams(node, params);
      const runtimeNode = {
        id: node.id,
        paramMeta,
        params,
        type: node.type,
      };
      if (typeof nodeGraphDspApplyControllerLiveSmoothing === "function") {
        nodeGraphDspApplyControllerLiveSmoothing(runtimeNode);
      }
      if (bypassed.has(node.id) && typeof nodeGraphModuleBypassSpec === "function") {
        runtimeNode.bypassed = true;
        runtimeNode.bypassSpec = nodeGraphModuleBypassSpec(node.type);
      }
      if (node.type === "codeblock") {
        runtimeNode.codeblock = normalizeNodeGraphCodeblock(node.codeblock);
      }
      if (node.type === "moduleGroup") {
        runtimeNode.moduleGroup = normalizeNodeGraphModuleGroup(node.moduleGroup);
        if (runtimeNode.moduleGroup.sourcePatch) {
          try {
            runtimeNode.moduleGroupPlan = nodeGraphBuildLivePlanForPatch(runtimeNode.moduleGroup.sourcePatch);
          } catch (_error) {
            runtimeNode.moduleGroupPlan = null;
          }
        }
      }
      if (node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") {
        runtimeNode.sample = typeof normalizeNodeGraphNodeSamplePointer === "function"
          ? normalizeNodeGraphNodeSamplePointer(node.sample)
          : { id: normalizeNodeGraphSampleId(node.sample?.id) };
      }
      if (node.type === "audioPlayer" && Number.isFinite(Number(node.samplePhase))) {
        runtimeNode.samplePhase = Math.max(0, Math.min(1, Number(node.samplePhase)));
      }
      if (node.type === "audioPlayer" && Number.isFinite(Number(node.samplePhaseSeek))) {
        runtimeNode.samplePhaseSeek = Math.max(0, Math.round(Number(node.samplePhaseSeek)) || 0);
      }
      if (node.type === "phosphillator" && Array.isArray(node.drawnPath?.points)) {
        runtimeNode.drawnPath = { points: node.drawnPath.points };
      }
      if (nodeGraphModuleIsGraphType(node.type) && node.graph) {
        runtimeNode.graph = node.graph;
      }
      return runtimeNode;
    });
}

function nodeGraphBuildLiveParameterNodesForPatch(patch, activeNodeIds = null, bypassedNodes = null) {
  const activeIds = activeNodeIds instanceof Set ? activeNodeIds : null;
  const bypassed = bypassedNodes instanceof Set
    ? bypassedNodes
    : new Set(Array.isArray(bypassedNodes) ? bypassedNodes : (patch.bypassedNodes || []));
  return (patch.nodes || [])
    .filter((node) => !activeIds || activeIds.has(node.id))
    .map((node) => {
      const definition = nodeGraphModuleDefinitions[node.type];
      const params = {};
      const paramMeta = {};
      for (const parameter of definition.parameters || []) {
        const value = Number(node.params?.[parameter.key]);
        params[parameter.key] = Number.isFinite(value)
          ? value
          : nodeGraphParameterFallback(node.type, parameter.key);
        paramMeta[parameter.key] = normalizeNodeGraphPatchParameterMetadata(
          node.type,
          parameter.key,
          node.paramMeta?.[parameter.key],
        ) || nodeGraphParameterDefinitionMetadata(parameter);
      }
      nodeGraphInjectSpectrogramWorkletParams(node, params);
      const runtimeNode = {
        id: node.id,
        paramMeta,
        params,
        type: node.type,
      };
      if (typeof nodeGraphDspApplyControllerLiveSmoothing === "function") {
        nodeGraphDspApplyControllerLiveSmoothing(runtimeNode);
      }
      if (bypassed.has(node.id) && typeof nodeGraphModuleBypassSpec === "function") {
        runtimeNode.bypassed = true;
        runtimeNode.bypassSpec = nodeGraphModuleBypassSpec(node.type);
      }
      if (node.type === "codeblock") {
        runtimeNode.codeblock = normalizeNodeGraphCodeblock(node.codeblock);
      }
      if (node.type === "moduleGroup") {
        runtimeNode.moduleGroup = normalizeNodeGraphModuleGroup(node.moduleGroup);
        if (runtimeNode.moduleGroup.sourcePatch) {
          try {
            runtimeNode.moduleGroupPlan = nodeGraphBuildLivePlanForPatch(runtimeNode.moduleGroup.sourcePatch);
          } catch (_error) {
            runtimeNode.moduleGroupPlan = null;
          }
        }
      }
      if (node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") {
        runtimeNode.sample = typeof normalizeNodeGraphNodeSamplePointer === "function"
          ? normalizeNodeGraphNodeSamplePointer(node.sample)
          : { id: normalizeNodeGraphSampleId(node.sample?.id) };
      }
      if (node.type === "audioPlayer" && Number.isFinite(Number(node.samplePhase))) {
        runtimeNode.samplePhase = Math.max(0, Math.min(1, Number(node.samplePhase)));
      }
      if (node.type === "audioPlayer" && Number.isFinite(Number(node.samplePhaseSeek))) {
        runtimeNode.samplePhaseSeek = Math.max(0, Math.round(Number(node.samplePhaseSeek)) || 0);
      }
      if (node.type === "phosphillator" && Array.isArray(node.drawnPath?.points)) {
        runtimeNode.drawnPath = { points: node.drawnPath.points };
      }
      if (nodeGraphModuleIsGraphType(node.type) && node.graph) {
        runtimeNode.graph = node.graph;
      }
      return runtimeNode;
    });
}

function nodeGraphConnectionMapFromList(items = [], keyForItem) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyForItem(item);
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function nodeGraphLiveInputConnectionMap(plan) {
  return nodeGraphConnectionMapFromList(
    plan?.connections || [],
    (connection) => nodeGraphInputKey(connection.destinationNode, connection.destinationPort),
  );
}

function nodeGraphLiveGraphInputConnectionMap(plan) {
  return nodeGraphConnectionMapFromList(
    plan?.graphConnections || [],
    (connection) => nodeGraphGraphInputKey(connection.destinationNode, connection.destinationGraphInput),
  );
}

function nodeGraphLiveModulationConnectionMap(plan) {
  return nodeGraphConnectionMapFromList(
    plan?.modulations || [],
    (modulation) => nodeGraphParameterKey(modulation.destinationNode, modulation.destinationParam),
  );
}

function createNodeGraphLiveRuntime(plan, previousRuntime = null) {
  const nodes = new Map((plan.nodes || []).map((node) => [node.id, node]));
  const inputConnections = nodeGraphLiveInputConnectionMap(plan);
  const graphInputConnections = nodeGraphLiveGraphInputConnectionMap(plan);
  const modulationConnections = nodeGraphLiveModulationConnectionMap(plan);
  // Preserve Soft Fractal map orbit across plan rebuilds (module resize →
  // scheduleLivePlanSync must not reseed zx/zy / orbitPhasor).
  const previousRgbFractalStates = previousRuntime?.rgbFractalStates instanceof Map
    ? previousRuntime.rgbFractalStates
    : null;
  const phases = new Map();
  const noiseSeedKeys = new Map();
  const noiseSeeds = new Map();
  const oscResetStates = new Map();
  const graphLfoStates = new Map();
  const passiveFilterStates = new Map();
  const papoulisFilterStates = new Map();
  const xyPadFilterStates = new Map();
  const phosphillatorPlaybackStates = new Map();
  const clockStates = new Map();
  const codeblockFunctions = new Map();
  const cookbookFilterStates = new Map();
  const clockDividerStates = new Map();
  const delayedTriggerStates = new Map();
  const delayEffectStates = new Map();
  const pingPongDelayStates = new Map();
  const wallDelayStates = new Map();
  const expAdsrStates = new Map();
  const attackDecayStates = new Map();
  const fractalBrownianNoiseStates = new Map();
  const fbmFieldStates = new Map();
  const rgbFractalStates = new Map();
  const flowerChildEnvelopeFollowerStates = new Map();
  const flowerChildFilterStates = new Map();
  const activeFilterStates = new Map();
  const butterworthStates = new Map();
  const linkwitzRileyStates = new Map();
  const besselStates = new Map();
  const chebyshevStates = new Map();
  const ellipticStates = new Map();
  const bandpassStates = new Map();
  const allpassStates = new Map();
  const crossover2States = new Map();
  const crossover3States = new Map();
  const crossover4States = new Map();
  const crossover5States = new Map();
  const crossover6States = new Map();
  const modeResonatorStates = new Map();
  const combResonatorStates = new Map();
  const waveguideStates = new Map();
  const phaseDisperseStates = new Map();
  const bodeStates = new Map();
  const stftBlurStates = new Map();
  const softpopOscillatorStates = new Map();
  const sinepulseStates = new Map();
  const yellowjacketFilterStates = new Map();
  const superloveFilterStates = new Map();
  const chaoticPhaseLockingFilterStates = new Map();
  const resonatorFilterStates = new Map();
  const humanFilterStates = new Map();
  const pulseExplosionStates = new Map();
  const comparatorStates = new Map();
  const noiseDetectorStates = new Map();
  const rmsStates = new Map();
  const speedColorInertiaStates = new Map();
  const inertialFilterStates = new Map();
  const softClipperStates = new Map();
  const clipperLimiterStates = new Map();
  const speakerProtector2States = new Map();
  const tiltFilterStates = new Map();
  const eqFilterStates = new Map();
  const aliasSineStates = new Map();
  const robinSinusoidStates = new Map();
  const phoneToneStates = new Map();
  const ladderFilterStates = new Map();
  const tb303FilterStates = new Map();
  const linearEnvelopeStates = new Map();
  const logisticMapStates = new Map();
  const henonMapStates = new Map();
  const rayBouncerStates = new Map();
  const chuaAttractorStates = new Map();
  const wirdoSpiralStates = new Map();
  const blubbStates = new Map();
  const mushroomStates = new Map();
  const boingStates = new Map();
  const torusStates = new Map();
  const keplerBouwkampStates = new Map();
  const nyquistShannonStates = new Map();
  const radarStates = new Map();
  const chordMemoryStates = new Map();
  const turingMachineStates = new Map();
  const pitchQuantizerStates = new Map();
  const surgeOscillatorStates = new Map();
  const softwaveOscStates = new Map();
  const curveOscStates = new Map();
  const snowflakeStates = new Map();
  const textStreamStates = new Map();
  const degreeTuringStates = new Map();
  const gravityWalkerStates = new Map();
  const degreePhraseStates = new Map();
  const noteGlideStates = new Map();
  const dsfOscillatorStates = new Map();
  const robinSupersawStates = new Map();
  const hypersawStates = new Map();
  const chordSequencerStates = new Map();
  const lutCellStates = new Map();
  const lorenzAttractorStates = new Map();
  const moduleGroupRuntimes = new Map();
  const noiseGeneratorStates = new Map();
  const oscillatorLastPhaseIncrements = new Map();
  const oscillatorStoppedSamples = new Map();
  const patchCommandStates = new Map();
  const pluckEnvelopeStates = new Map();
  const randomClockStates = new Map();
  const randomWalkStates = new Map();
  const piSpigotNoiseStates = new Map();
  const bradley2AStates = new Map();
  const antisawStates = new Map();
  const reverbEffectStates = new Map();
  const soemReverbStates = new Map();
  const pllStates = new Map();
  const helmholtzStates = new Map();
  const sampleHoldStates = new Map();
  const sampleDelayStates = new Map();
  const samplePlaybackStates = new Map();
  const samples = new Map((plan.samples || []).map((sample) => [sample.id, sample]));
  const slewLimiterStates = new Map();
  const stepSequencerStates = new Map();
  const spiralStates = new Map();
  const fractalSpiralStates = new Map();
  const logSpiralStates = new Map();
  const smoothers = new Map();
  const activeSmoothers = [];
  const activeSmootherKeys = new Set();
  const triggerCounterStates = new Map();
  const triggerDividerStates = new Map();
  const triangleStates = new Map();
  const impulseButtonStates = new Map();
  const bugButtonStates = new Map();
  const keypadStates = new Map();
  const visualControlState = createNodeGraphVisualControlState();
  for (const node of plan.nodes || []) {
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type)) {
      phases.set(node.id, 0);
      oscResetStates.set(node.id, createNodeGraphOscResetState());
      triangleStates.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type)) {
      noiseSeeds.set(node.id, nodeGraphStableSeed(node.id));
    }
    if (node.type === "spiral") {
      spiralStates.set(node.id, createJerobeamSpiralState());
    }
    if (node.type === "fractalSpiral") {
      fractalSpiralStates.set(node.id, createFractalSpiralState());
    }
    if (node.type === "logSpiral") {
      logSpiralStates.set(node.id, createLogSpiralState());
    }
    if (node.type === "lorenzAttractor") {
      lorenzAttractorStates.set(node.id, createNodeGraphLorenzAttractorState());
    }
    if (node.type === "logisticMap") {
      logisticMapStates.set(node.id, createNodeGraphLogisticMapState());
    }
    if (node.type === "henonMap") {
      henonMapStates.set(node.id, createNodeGraphHenonMapState());
    }
    if (node.type === "rayBouncer") {
      rayBouncerStates.set(node.id, createNodeGraphRayBouncerState());
    }
    if (node.type === "chuaAttractor") {
      chuaAttractorStates.set(node.id, createNodeGraphChuaAttractorState());
    }
    if (node.type === "wirdoSpiral") {
      wirdoSpiralStates.set(node.id, createNodeGraphWirdoSpiralState());
    }
    if (node.type === "blubb") {
      blubbStates.set(node.id, createNodeGraphBlubbState());
    }
    if (node.type === "mushroom") {
      mushroomStates.set(node.id, createNodeGraphMushroomState());
    }
    if (node.type === "boing") {
      boingStates.set(node.id, createNodeGraphBoingState());
    }
    if (node.type === "torus") {
      torusStates.set(node.id, createNodeGraphTorusState());
    }
    if (node.type === "keplerBouwkamp") {
      keplerBouwkampStates.set(node.id, createNodeGraphKeplerBouwkampState());
    }
    if (node.type === "nyquistShannon") {
      nyquistShannonStates.set(node.id, createNodeGraphNyquistShannonState());
    }
    if (node.type === "radar") {
      radarStates.set(node.id, createNodeGraphRadarState());
    }
    if (node.type === "chordMemory") {
      chordMemoryStates.set(node.id, createNodeGraphChordMemoryState());
    }
    if (node.type === "turingMachine") {
      turingMachineStates.set(node.id, createNodeGraphTuringMachineState());
    }
    if (node.type === "pitchQuantizer") {
      pitchQuantizerStates.set(node.id, createNodeGraphPitchQuantizerState());
    }
    if (node.type === "surgeOscillator") {
      surgeOscillatorStates.set(node.id, createNodeGraphSurgeOscillatorState());
    }
    if (node.type === "softwaveOsc") {
      softwaveOscStates.set(node.id, createNodeGraphSoftwaveOscillatorState());
    }
    if (node.type === "curveOsc" && typeof createNodeGraphCurveOscState === "function") {
      curveOscStates.set(node.id, createNodeGraphCurveOscState());
    }
    if (node.type === "snowflake" && typeof createNodeGraphSnowflakeState === "function") {
      snowflakeStates.set(node.id, createNodeGraphSnowflakeState());
    }
    if (node.type === "textStream" && typeof createNodeGraphTextStreamState === "function") {
      textStreamStates.set(node.id, createNodeGraphTextStreamState());
    }
    if (node.type === "degreeTuring" && typeof createNodeGraphDegreeTuringState === "function") {
      degreeTuringStates.set(node.id, createNodeGraphDegreeTuringState());
    }
    if (node.type === "gravityWalker" && typeof createNodeGraphGravityWalkerState === "function") {
      gravityWalkerStates.set(node.id, createNodeGraphGravityWalkerState());
    }
    if (node.type === "degreePhrase" && typeof createNodeGraphDegreePhraseState === "function") {
      degreePhraseStates.set(node.id, createNodeGraphDegreePhraseState());
    }
    if (node.type === "noteGlide" && typeof createNodeGraphNoteGlideState === "function") {
      noteGlideStates.set(node.id, createNodeGraphNoteGlideState());
    }
    if (node.type === "dsfOscillator") {
      dsfOscillatorStates.set(node.id, createNodeGraphDsfOscillatorState());
    }
    if (node.type === "robinSupersaw") {
      robinSupersawStates.set(node.id, createNodeGraphRobinSupersawState());
    }
    if (node.type === "hypersaw") {
      hypersawStates.set(node.id, createNodeGraphHypersawState());
    }
    if (node.type === "chordSequencer") {
      chordSequencerStates.set(node.id, createNodeGraphChordSequencerState());
    }
    if (node.type === "lutCell") {
      lutCellStates.set(node.id, createNodeGraphLutCellState());
    }
    if (node.type === "passiveFilter") {
      passiveFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphPassiveFilterState));
    }
    if (node.type === "papoulisFilter") {
      papoulisFilterStates.set(node.id, createNodeGraphPapoulisFilterState());
    }
    if (node.type === "phosphillator") {
      phosphillatorPlaybackStates.set(node.id, createNodeGraphPhosphillatorPlaybackState());
    }
    if (node.type === "cookbookFilter") {
      cookbookFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphCookbookFilterState));
    }
    if (node.type === "ladderFilter") {
      ladderFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphLadderFilterState));
    }
    if (node.type === "flowerChildFilter") {
      flowerChildFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphFlowerChildFilterState));
    }
    if (node.type === "activeFilter") {
      activeFilterStates.set(
        node.id,
        typeof createNodeGraphStereoActiveFilterState === "function"
          ? createNodeGraphStereoActiveFilterState()
          : createNodeGraphStereoFilterState(createNodeGraphActiveFilterState),
      );
    }
    if (node.type === "butterworth" || node.type === "linkwitzRiley" || node.type === "bessel" || node.type === "chebyshev" || node.type === "elliptic") {
      const map = ({ butterworth: butterworthStates, linkwitzRiley: linkwitzRileyStates, bessel: besselStates, chebyshev: chebyshevStates, elliptic: ellipticStates })[node.type];
      map.set(node.id, createNodeGraphStereoScientificIirState());
    }
    if (node.type === "bandpass") {
      bandpassStates.set(
        node.id,
        typeof createNodeGraphStereoEqFilterState === "function"
          ? createNodeGraphStereoEqFilterState()
          : createNodeGraphStereoFilterState(createNodeGraphEqFilterState),
      );
    }
    if (node.type === "allpass") {
      allpassStates.set(
        node.id,
        typeof createNodeGraphStereoEqFilterState === "function"
          ? createNodeGraphStereoEqFilterState()
          : createNodeGraphStereoFilterState(createNodeGraphEqFilterState),
      );
    }
    if (node.type === "softpopOscillator") {
      softpopOscillatorStates.set(
        node.id,
        typeof createNodeGraphSoftpopOscillatorState === "function"
          ? createNodeGraphSoftpopOscillatorState()
          : { left: {}, right: {}, lastReset: false, generation: 0, lastSeed: NaN },
      );
    }
    if (node.type === "sinepulse") {
      sinepulseStates.set(
        node.id,
        typeof createNodeGraphSinepulseState === "function"
          ? createNodeGraphSinepulseState()
          : { tooth: 0, phase: 0, lastReset: 0 },
      );
    }
    if (node.type === "yellowjacketFilter") {
      yellowjacketFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphYellowjacketFilterState));
    }
    if (node.type === "superloveFilter") {
      superloveFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphSuperloveFilterState));
    }
    if (node.type === "chaoticPhaseLockingFilter") {
      chaoticPhaseLockingFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphChaoticPhaseLockingFilterState));
    }
    if (node.type === "resonatorFilter") {
      resonatorFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphResonatorFilterState));
    }
    if (node.type === "humanFilter") {
      humanFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphHumanFilterState));
    }
    if (node.type === "pulseExplosion") {
      pulseExplosionStates.set(node.id, createNodeGraphPulseExplosionState());
    }
    if (node.type === "comparator") {
      comparatorStates.set(node.id, createNodeGraphComparatorState());
    }
    if (node.type === "noiseDetector" && typeof createNodeGraphNoiseDetectorState === "function") {
      noiseDetectorStates.set(node.id, createNodeGraphNoiseDetectorState());
    }
    if (
      (node.type === "rms" || node.type === "rmsStereo")
      && typeof createNodeGraphRmsState === "function"
    ) {
      rmsStates.set(node.id, createNodeGraphRmsState());
    }
    if (node.type === "speedColorInertia") {
      speedColorInertiaStates.set(node.id, createNodeGraphSpeedColorInertiaState());
    }
    if (node.type === "inertialFilter") {
      inertialFilterStates.set(node.id, createNodeGraphStereoInertialFilterState());
    }
    if (node.type === "softClipper" && typeof createNodeGraphSoftClipperState === "function") {
      softClipperStates.set(node.id, createNodeGraphSoftClipperState());
    }
    if (node.type === "clipperLimiter" && typeof createNodeGraphSoftClipperState === "function") {
      clipperLimiterStates.set(node.id, createNodeGraphSoftClipperState());
    }
    if (node.type === "speakerProtector2" && typeof createNodeGraphSpeakerProtector2State === "function") {
      speakerProtector2States.set(node.id, createNodeGraphSpeakerProtector2State());
    }
    if (node.type === "tiltFilter") {
      tiltFilterStates.set(node.id, createNodeGraphStereoTiltFilterState());
    }
    if (node.type === "eqFilter") {
      eqFilterStates.set(node.id, createNodeGraphStereoEqFilterState());
    }
    if (node.type === "sampleDelay") {
      sampleDelayStates.set(node.id, createNodeGraphSampleDelayState());
    }
    if (node.type === "aliasSine") {
      aliasSineStates.set(node.id, createNodeGraphAliasSineState());
    }
    if (node.type === "robinSinusoid" && typeof createNodeGraphRobinSinusoidState === "function") {
      robinSinusoidStates.set(node.id, createNodeGraphRobinSinusoidState());
    }
    if (node.type === "phoneTone" && typeof createNodeGraphPhoneToneState === "function") {
      phoneToneStates.set(node.id, createNodeGraphPhoneToneState());
    }
    if (node.type === "tb303Filter") {
      tb303FilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphTb303FilterState));
    }
    if (node.type === "clock") {
      clockStates.set(node.id, createNodeGraphClockState());
    }
    if (nodeGraphModuleIsGraphType(node.type)) {
      graphLfoStates.set(node.id, createNodeGraphGraphLfoState());
    }
    if (node.type === "clockDivider") {
      clockDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "delayedTrigger") {
      delayedTriggerStates.set(node.id, createNodeGraphDelayedTriggerState());
    }
    if (node.type === "delayEffect") {
      delayEffectStates.set(
        node.id,
        typeof createNodeGraphStereoDelayEffectState === "function"
          ? createNodeGraphStereoDelayEffectState()
          : createNodeGraphDelayEffectState(),
      );
    }
    if (node.type === "pingPongDelay") {
      pingPongDelayStates.set(node.id, createNodeGraphPingPongDelayState());
    }
    if (node.type === "wallDelay") {
      wallDelayStates.set(node.id, createNodeGraphWallDelayState());
    }
    if (node.type === "reverbEffect") {
      reverbEffectStates.set(node.id, createNodeGraphSabrinaReverbState());
    }
    if (node.type === "pll") {
      pllStates.set(node.id, createNodeGraphPllState());
    }
    if (node.type === "helmholtzPitch") {
      helmholtzStates.set(node.id, createNodeGraphHelmholtzState());
    }
    if (node.type === "randomClock") {
      randomClockStates.set(node.id, createNodeGraphRandomClockState());
    }
    if (node.type === "sampleHold") {
      sampleHoldStates.set(node.id, createNodeGraphSampleHoldState());
    }
    if (node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") {
      samplePlaybackStates.set(node.id, createNodeGraphSamplePlaybackState());
    }
    if (node.type === "nextPatch" || node.type === "previousPatch") {
      patchCommandStates.set(node.id, createNodeGraphPatchCommandState());
    }
    if (node.type === "slewLimiter") {
      slewLimiterStates.set(node.id, createNodeGraphSlewLimiterState());
    }
    if (node.type === "expAdsr") {
      expAdsrStates.set(node.id, createNodeGraphExpAdsrState());
    }
    if (node.type === "attackDecay") {
      attackDecayStates.set(
        node.id,
        typeof createNodeGraphAttackDecayState === "function"
          ? createNodeGraphAttackDecayState()
          : { raw: 0 },
      );
    }
    if (node.type === "linearEnvelope") {
      linearEnvelopeStates.set(node.id, createNodeGraphLinearEnvelopeState());
    }
    if (node.type === "noiseGenerator") {
      noiseGeneratorStates.set(node.id, createNodeGraphNoiseGeneratorState());
    }
    if (node.type === "randomWalk") {
      randomWalkStates.set(node.id, createNodeGraphRandomWalkState());
    }
    if (node.type === "piSpigotNoise") {
      piSpigotNoiseStates.set(node.id, createNodeGraphPiSpigotNoiseState());
    }
    if (node.type === "bradley2a") {
      bradley2AStates.set(node.id, createNodeGraphBradley2AState());
    }
    if (node.type === "antisaw") {
      antisawStates.set(node.id, createNodeGraphAntisawState());
    }
    if (node.type === "fractalBrownianNoise") {
      fractalBrownianNoiseStates.set(node.id, createNodeGraphFractalBrownianNoiseState());
    }
    if (node.type === "fbmField") {
      fbmFieldStates.set(node.id, createNodeGraphFbmFieldState());
    }
    if (node.type === "rgbFractal") {
      const kept = previousRgbFractalStates?.get(node.id);
      rgbFractalStates.set(
        node.id,
        kept
          || (typeof createNodeGraphRgbFractalState === "function"
            ? createNodeGraphRgbFractalState()
            : (typeof createNodeGraphRgbFractalAudioState === "function"
              ? createNodeGraphRgbFractalAudioState()
              : {})),
      );
    }
    if (node.type === "flowerChildEnvelopeFollower") {
      flowerChildEnvelopeFollowerStates.set(node.id, createNodeGraphFlowerChildEnvelopeFollowerState());
    }
    if (node.type === "pluckEnvelope") {
      pluckEnvelopeStates.set(node.id, createNodeGraphPluckEnvelopeState());
    }
    if (node.type === "stepSequencer") {
      stepSequencerStates.set(node.id, createNodeGraphStepSequencerState());
    }
    if (node.type === "triggerCounter") {
      triggerCounterStates.set(node.id, createNodeGraphTriggerCounterState());
    }
    if (node.type === "triggerDivider") {
      triggerDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "moduleGroup" && node.moduleGroup?.sourcePatch) {
      try {
        moduleGroupRuntimes.set(node.id, createNodeGraphLiveRuntime(nodeGraphBuildLivePlanForPatch(node.moduleGroup.sourcePatch)));
      } catch (_error) {
        moduleGroupRuntimes.delete(node.id);
      }
    }
    for (const [key, value] of Object.entries(node.params || {})) {
      smoothers.set(
        nodeGraphParameterKey(node.id, key),
        createNodeGraphParameterSmoother(value, node.paramMeta?.[key]),
      );
    }
  }
  const runtime = {
    autoSmoothingSeconds: clampNodeGraphAutoSmoothingSeconds(
      nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
    ),
    inputConnections,
    badNumberCount: 0,
    passiveFilterStates,
    papoulisFilterStates,
    xyPadFilterStates,
    phosphillatorPlaybackStates,
    clockDividerStates,
    clockStates,
    codeblockFunctions,
    cookbookFilterStates,
    delayedTriggerStates,
    delayEffectStates,
    pingPongDelayStates,
    wallDelayStates,
    expAdsrStates,
    attackDecayStates,
    fractalBrownianNoiseStates,
    fbmFieldStates,
    rgbFractalStates,
    flowerChildEnvelopeFollowerStates,
    flowerChildFilterStates,
    activeFilterStates,
    butterworthStates,
    linkwitzRileyStates,
    besselStates,
    chebyshevStates,
    ellipticStates,
    bandpassStates,
    allpassStates,
    crossover2States,
    crossover3States,
    crossover4States,
    crossover5States,
    crossover6States,
    modeResonatorStates,
    combResonatorStates,
    waveguideStates,
    phaseDisperseStates,
    bodeStates,
    stftBlurStates,
    softpopOscillatorStates,
    sinepulseStates,
    yellowjacketFilterStates,
    superloveFilterStates,
    chaoticPhaseLockingFilterStates,
    resonatorFilterStates,
    humanFilterStates,
    pulseExplosionStates,
    comparatorStates,
    noiseDetectorStates,
    rmsStates,
    speedColorInertiaStates,
    inertialFilterStates,
    softClipperStates,
    clipperLimiterStates,
    speakerProtector2States,
    tiltFilterStates,
    eqFilterStates,
    aliasSineStates,
    robinSinusoidStates,
    phoneToneStates,
    graphInputConnections,
    graphLfoStates,
    ladderFilterStates,
    tb303FilterStates,
    linearEnvelopeStates,
    logisticMapStates,
    henonMapStates,
    rayBouncerStates,
    chuaAttractorStates,
    wirdoSpiralStates,
    blubbStates,
    mushroomStates,
    boingStates,
    torusStates,
    keplerBouwkampStates,
    nyquistShannonStates,
    radarStates,
    chordMemoryStates,
    turingMachineStates,
    pitchQuantizerStates,
    surgeOscillatorStates,
    softwaveOscStates,
    curveOscStates,
    snowflakeStates,
    textStreamStates,
    degreeTuringStates,
    gravityWalkerStates,
    degreePhraseStates,
    noteGlideStates,
    dsfOscillatorStates,
    robinSupersawStates,
    hypersawStates,
    chordSequencerStates,
    lutCellStates,
    lorenzAttractorStates,
    meterCounter: 0,
    meterClipCount: 0,
    meterPeak: 0,
    meterSamples: 0,
    meterSquareSum: 0,
    modulationConnections,
    macroControls: Array.isArray(nodeGraphMvp?.macroControls) ? [...nodeGraphMvp.macroControls] : new Array(10).fill(0),
    externalButtonEvents: new Map(),
    wireBreakEvent: { pulseSamples: 0, gateSamples: 0 },
    wireConnectEvent: { pulseSamples: 0 },
    wireDisconnectEvent: { pulseSamples: 0 },
    windowReopenEvent: { pulseSamples: 0, gateSamples: 0, totalSamples: 0 },
    shootingStarExplosionEvent: { pulseSamples: 0 },
    // Any input-port wire disconnect (any kind/UI trigger -- see
    // disconnectNodeGraphConnection) feeds a single-sample trigger into that
    // port so downstream modules (envelopes, sample+hold, etc.) feel a poke
    // when their signal supply is cut, instead of just dropping to silence.
    inputWireBreakTriggers: new Map(),
    moduleGroupRuntimes,
    pitchModWheelSignal: {
      mod: Math.max(0, Math.min(1, Number(nodeGraphMvp?.modWheelSignal) || 0)),
      pitch: Math.max(-1, Math.min(1, Number(nodeGraphMvp?.pitchWheelSignal) || 0)),
    },
    midiKeyboardSignal: null,
    nodeOutputs: new Map((plan.nodes || []).map((node) => [node.id, 0])),
    nodes,
    oscResetStates,
    oscillatorLastPhaseIncrements,
    oscillatorStoppedSamples,
    noiseSeedKeys,
    noiseSeeds,
    noiseGeneratorStates,
    pluckEnvelopeStates,
    randomClockStates,
    reverbEffectStates,
    soemReverbStates,
    pllStates,
    helmholtzStates,
    order: [...(plan.order || [])],
    outputNode: plan.outputNode || "output",
    patchCommandStates,
    phases,
    randomWalkStates,
    piSpigotNoiseStates,
    bradley2AStates,
    antisawStates,
    sampleHoldStates,
    sampleDelayStates,
    samplePlaybackStates,
    samples,
    scopeCaptureNodeIds: [...(plan.scopeCaptureNodeIds || [])],
    scopeCaptureRates: plan.scopeCaptureRates && typeof plan.scopeCaptureRates === "object"
      ? { ...plan.scopeCaptureRates }
      : {},
    slewLimiterStates,
    smoothers,
    activeSmoothers,
    activeSmootherKeys,
    spiralStates,
    fractalSpiralStates,
    logSpiralStates,
    stepSequencerStates,
    timing: normalizeNodeGraphPatchTiming(plan.timing),
    triggerCounterStates,
    triggerDividerStates,
    triangleStates,
    impulseButtonStates,
    bugButtonStates,
    keypadStates,
    visualSinks: (plan.visualSinks || []).map((sink) => ({
      ...sink,
      bufferedInputs: [...(sink.bufferedInputs || [])],
      inputs: (sink.inputs || []).map((input) => ({ ...input })),
    })),
    visualControls: visualControlState.controls,
    visualControlStates: visualControlState.states,
  };
  if (typeof syncNodeGraphVisualInputBuffers === "function") {
    syncNodeGraphVisualInputBuffers(runtime);
  }
  return runtime;
}

function updateNodeGraphLiveRuntimePlan(runtime, plan) {
  if (typeof nodeGraphEfficientProductAssertPlanAllowed === "function") {
    nodeGraphEfficientProductAssertPlanAllowed(Array.isArray(plan?.nodes) ? plan.nodes : []);
  }
  runtime.nodes = new Map((plan.nodes || []).map((node) => [node.id, node]));
  runtime.samples = new Map((plan.samples || []).map((sample) => [sample.id, sample]));
  runtime.inputConnections = nodeGraphLiveInputConnectionMap(plan);
  runtime.graphInputConnections = nodeGraphLiveGraphInputConnectionMap(plan);
  runtime.modulationConnections = nodeGraphLiveModulationConnectionMap(plan);
  runtime.order = [...(plan.order || [])];
  runtime.outputNode = plan.outputNode || "output";
  runtime.scopeCaptureNodeIds = [...(plan.scopeCaptureNodeIds || [])];
  runtime.scopeCaptureRates = plan.scopeCaptureRates && typeof plan.scopeCaptureRates === "object"
    ? { ...plan.scopeCaptureRates }
    : {};
  runtime.timing = normalizeNodeGraphPatchTiming(plan.timing);
  runtime.visualSinks = (plan.visualSinks || []).map((sink) => ({
    ...sink,
    bufferedInputs: [...(sink.bufferedInputs || [])],
    inputs: (sink.inputs || []).map((input) => ({ ...input })),
  }));
  if (typeof syncNodeGraphVisualInputBuffers === "function") {
    syncNodeGraphVisualInputBuffers(runtime);
  }
  const nodeIds = new Set(runtime.nodes.keys());
  if (!runtime.nodeOutputs) {
    runtime.nodeOutputs = new Map();
  }
  if (!runtime.noiseSeedKeys) {
    runtime.noiseSeedKeys = new Map();
  }
  if (!runtime.noiseSeeds) {
    runtime.noiseSeeds = new Map();
  }
  if (!runtime.oscResetStates) {
    runtime.oscResetStates = new Map();
  }
  if (!runtime.graphLfoStates) {
    runtime.graphLfoStates = new Map();
  }
  if (!runtime.oscillatorLastPhaseIncrements) {
    runtime.oscillatorLastPhaseIncrements = new Map();
  }
  if (!runtime.oscillatorStoppedSamples) {
    runtime.oscillatorStoppedSamples = new Map();
  }
  if (!runtime.spiralStates) {
    runtime.spiralStates = new Map();
  }
  if (!runtime.fractalSpiralStates) {
    runtime.fractalSpiralStates = new Map();
  }
  if (!runtime.logSpiralStates) {
    runtime.logSpiralStates = new Map();
  }
  if (!runtime.passiveFilterStates) {
    runtime.passiveFilterStates = new Map();
  }
  if (!runtime.papoulisFilterStates) {
    runtime.papoulisFilterStates = new Map();
  }
  if (!runtime.phosphillatorPlaybackStates) {
    runtime.phosphillatorPlaybackStates = new Map();
  }
  if (!runtime.moduleGroupRuntimes) {
    runtime.moduleGroupRuntimes = new Map();
  }
  if (!runtime.ladderFilterStates) {
    runtime.ladderFilterStates = new Map();
  }
  if (!runtime.flowerChildFilterStates) {
    runtime.flowerChildFilterStates = new Map();
  }
  if (!runtime.activeFilterStates) {
    runtime.activeFilterStates = new Map();
  }
  for (const sci of ["butterworth", "linkwitzRiley", "bessel", "chebyshev", "elliptic", "bandpass", "allpass", "crossover2", "crossover3", "crossover4", "crossover5", "crossover6", "modeResonator", "combResonator", "waveguide", "phaseDisperse", "bode", "stftBlur", "softpopOscillator", "sinepulse"]) {
    const key = `${sci}States`;
    if (!runtime[key]) runtime[key] = new Map();
  }
  if (!runtime.yellowjacketFilterStates) {
    runtime.yellowjacketFilterStates = new Map();
  }
  if (!runtime.superloveFilterStates) {
    runtime.superloveFilterStates = new Map();
  }
  if (!runtime.chaoticPhaseLockingFilterStates) {
    runtime.chaoticPhaseLockingFilterStates = new Map();
  }
  if (!runtime.resonatorFilterStates) {
    runtime.resonatorFilterStates = new Map();
  }
  if (!runtime.humanFilterStates) {
    runtime.humanFilterStates = new Map();
  }
  if (!runtime.pulseExplosionStates) {
    runtime.pulseExplosionStates = new Map();
  }
  if (!runtime.comparatorStates) {
    runtime.comparatorStates = new Map();
  }
  if (!runtime.noiseDetectorStates) {
    runtime.noiseDetectorStates = new Map();
  }
  if (!runtime.rmsStates) {
    runtime.rmsStates = new Map();
  }
  if (!runtime.speedColorInertiaStates) {
    runtime.speedColorInertiaStates = new Map();
  }
  if (!runtime.inertialFilterStates) {
    runtime.inertialFilterStates = new Map();
  }
  if (!runtime.softClipperStates) {
    runtime.softClipperStates = new Map();
  }
  if (!runtime.clipperLimiterStates) {
    runtime.clipperLimiterStates = new Map();
  }
  if (!runtime.speakerProtector2States) {
    runtime.speakerProtector2States = new Map();
  }
  if (!runtime.tiltFilterStates) {
    runtime.tiltFilterStates = new Map();
  }
  if (!runtime.eqFilterStates) {
    runtime.eqFilterStates = new Map();
  }
  if (!runtime.sampleDelayStates) {
    runtime.sampleDelayStates = new Map();
  }
  if (!runtime.aliasSineStates) {
    runtime.aliasSineStates = new Map();
  }
  if (!runtime.robinSinusoidStates) {
    runtime.robinSinusoidStates = new Map();
  }
  if (!runtime.phoneToneStates) {
    runtime.phoneToneStates = new Map();
  }
  if (!runtime.tb303FilterStates) {
    runtime.tb303FilterStates = new Map();
  }
  if (!runtime.linearEnvelopeStates) {
    runtime.linearEnvelopeStates = new Map();
  }
  if (!runtime.lorenzAttractorStates) {
    runtime.lorenzAttractorStates = new Map();
  }
  if (!runtime.logisticMapStates) {
    runtime.logisticMapStates = new Map();
  }
  if (!runtime.henonMapStates) {
    runtime.henonMapStates = new Map();
  }
  if (!runtime.rayBouncerStates) {
    runtime.rayBouncerStates = new Map();
  }
  if (!runtime.chuaAttractorStates) {
    runtime.chuaAttractorStates = new Map();
  }
  if (!runtime.wirdoSpiralStates) {
    runtime.wirdoSpiralStates = new Map();
  }
  if (!runtime.blubbStates) {
    runtime.blubbStates = new Map();
  }
  if (!runtime.mushroomStates) {
    runtime.mushroomStates = new Map();
  }
  if (!runtime.boingStates) {
    runtime.boingStates = new Map();
  }
  if (!runtime.torusStates) {
    runtime.torusStates = new Map();
  }
  if (!runtime.keplerBouwkampStates) {
    runtime.keplerBouwkampStates = new Map();
  }
  if (!runtime.nyquistShannonStates) {
    runtime.nyquistShannonStates = new Map();
  }
  if (!runtime.radarStates) {
    runtime.radarStates = new Map();
  }
  if (!runtime.chordMemoryStates) {
    runtime.chordMemoryStates = new Map();
  }
  if (!runtime.turingMachineStates) {
    runtime.turingMachineStates = new Map();
  }
  if (!runtime.pitchQuantizerStates) {
    runtime.pitchQuantizerStates = new Map();
  }
  if (!runtime.surgeOscillatorStates) {
    runtime.surgeOscillatorStates = new Map();
  }
  if (!runtime.softwaveOscStates) {
    runtime.softwaveOscStates = new Map();
  }
  if (!runtime.curveOscStates) {
    runtime.curveOscStates = new Map();
  }
  if (!runtime.snowflakeStates) {
    runtime.snowflakeStates = new Map();
  }
  if (!runtime.textStreamStates) runtime.textStreamStates = new Map();
  if (!runtime.degreeTuringStates) runtime.degreeTuringStates = new Map();
  if (!runtime.gravityWalkerStates) runtime.gravityWalkerStates = new Map();
  if (!runtime.degreePhraseStates) runtime.degreePhraseStates = new Map();
  if (!runtime.noteGlideStates) runtime.noteGlideStates = new Map();
  if (!runtime.dsfOscillatorStates) {
    runtime.dsfOscillatorStates = new Map();
  }
  if (!runtime.robinSupersawStates) {
    runtime.robinSupersawStates = new Map();
  }
  if (!runtime.hypersawStates) {
    runtime.hypersawStates = new Map();
  }
  if (!runtime.chordSequencerStates) {
    runtime.chordSequencerStates = new Map();
  }
  if (!runtime.lutCellStates) {
    runtime.lutCellStates = new Map();
  }
  if (!runtime.clockStates) {
    runtime.clockStates = new Map();
  }
  if (!runtime.codeblockFunctions) {
    runtime.codeblockFunctions = new Map();
  }
  if (!runtime.cookbookFilterStates) {
    runtime.cookbookFilterStates = new Map();
  }
  if (!runtime.clockDividerStates) {
    runtime.clockDividerStates = new Map();
  }
  if (!runtime.delayedTriggerStates) {
    runtime.delayedTriggerStates = new Map();
  }
  if (!runtime.delayEffectStates) {
    runtime.delayEffectStates = new Map();
  }
  if (!runtime.pingPongDelayStates) {
    runtime.pingPongDelayStates = new Map();
  }
  if (!runtime.wallDelayStates) {
    runtime.wallDelayStates = new Map();
  }
  if (!runtime.reverbEffectStates) {
    runtime.reverbEffectStates = new Map();
  }
  if (!runtime.soemReverbStates) {
    runtime.soemReverbStates = new Map();
  }
  if (!runtime.pllStates) {
    runtime.pllStates = new Map();
  }
  if (!runtime.helmholtzStates) {
    runtime.helmholtzStates = new Map();
  }
  if (!runtime.sampleHoldStates) {
    runtime.sampleHoldStates = new Map();
  }
  if (!runtime.samplePlaybackStates) {
    runtime.samplePlaybackStates = new Map();
  }
  if (!runtime.slewLimiterStates) {
    runtime.slewLimiterStates = new Map();
  }
  if (!runtime.expAdsrStates) {
    runtime.expAdsrStates = new Map();
  }
  if (!runtime.attackDecayStates) {
    runtime.attackDecayStates = new Map();
  }
  if (!runtime.noiseGeneratorStates) {
    runtime.noiseGeneratorStates = new Map();
  }
  if (!runtime.randomWalkStates) {
    runtime.randomWalkStates = new Map();
  }
  if (!runtime.piSpigotNoiseStates) {
    runtime.piSpigotNoiseStates = new Map();
  }
  if (!runtime.bradley2AStates) {
    runtime.bradley2AStates = new Map();
  }
  if (!runtime.antisawStates) {
    runtime.antisawStates = new Map();
  }
  if (!runtime.randomClockStates) {
    runtime.randomClockStates = new Map();
  }
  if (!runtime.fractalBrownianNoiseStates) {
    runtime.fractalBrownianNoiseStates = new Map();
  }
  if (!runtime.fbmFieldStates) {
    runtime.fbmFieldStates = new Map();
  }
  if (!runtime.rgbFractalStates) {
    runtime.rgbFractalStates = new Map();
  }
  if (!runtime.flowerChildEnvelopeFollowerStates) {
    runtime.flowerChildEnvelopeFollowerStates = new Map();
  }
  if (!runtime.pluckEnvelopeStates) {
    runtime.pluckEnvelopeStates = new Map();
  }
  if (!runtime.patchCommandStates) {
    runtime.patchCommandStates = new Map();
  }
  if (!runtime.stepSequencerStates) {
    runtime.stepSequencerStates = new Map();
  }
  if (!runtime.triggerDividerStates) {
    runtime.triggerDividerStates = new Map();
  }
  if (!runtime.triggerCounterStates) {
    runtime.triggerCounterStates = new Map();
  }
  if (!runtime.triangleStates) {
    runtime.triangleStates = new Map();
  }
  if (!runtime.impulseButtonStates) {
    runtime.impulseButtonStates = new Map();
  }
  if (!runtime.bugButtonStates) {
    runtime.bugButtonStates = new Map();
  }
  if (!runtime.keypadStates) {
    runtime.keypadStates = new Map();
  }
  resetNodeGraphRuntimeVisualControls(runtime);
  for (const node of plan.nodes || []) {
    if (!runtime.nodeOutputs.has(node.id)) {
      runtime.nodeOutputs.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.phases.has(node.id)) {
      runtime.phases.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.oscResetStates.has(node.id)) {
      runtime.oscResetStates.set(node.id, createNodeGraphOscResetState());
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.triangleStates.has(node.id)) {
      runtime.triangleStates.set(node.id, 0);
    }
    if (nodeGraphModuleIsRealtimeOscillatorType(node.type) && !runtime.noiseSeeds.has(node.id)) {
      runtime.noiseSeeds.set(node.id, nodeGraphStableSeed(node.id));
    }
    if (node.type === "spiral" && !runtime.spiralStates.has(node.id)) {
      runtime.spiralStates.set(node.id, createJerobeamSpiralState());
    }
    if (node.type === "fractalSpiral" && !runtime.fractalSpiralStates.has(node.id)) {
      runtime.fractalSpiralStates.set(node.id, createFractalSpiralState());
    }
    if (node.type === "logSpiral" && !runtime.logSpiralStates.has(node.id)) {
      runtime.logSpiralStates.set(node.id, createLogSpiralState());
    }
    if (node.type === "lorenzAttractor" && !runtime.lorenzAttractorStates.has(node.id)) {
      runtime.lorenzAttractorStates.set(node.id, createNodeGraphLorenzAttractorState());
    }
    if (node.type === "logisticMap" && !runtime.logisticMapStates.has(node.id)) {
      runtime.logisticMapStates.set(node.id, createNodeGraphLogisticMapState());
    }
    if (node.type === "henonMap" && !runtime.henonMapStates.has(node.id)) {
      runtime.henonMapStates.set(node.id, createNodeGraphHenonMapState());
    }
    if (node.type === "rayBouncer" && !runtime.rayBouncerStates.has(node.id)) {
      runtime.rayBouncerStates.set(node.id, createNodeGraphRayBouncerState());
    }
    if (node.type === "chuaAttractor" && !runtime.chuaAttractorStates.has(node.id)) {
      runtime.chuaAttractorStates.set(node.id, createNodeGraphChuaAttractorState());
    }
    if (node.type === "wirdoSpiral" && !runtime.wirdoSpiralStates.has(node.id)) {
      runtime.wirdoSpiralStates.set(node.id, createNodeGraphWirdoSpiralState());
    }
    if (node.type === "blubb" && !runtime.blubbStates.has(node.id)) {
      runtime.blubbStates.set(node.id, createNodeGraphBlubbState());
    }
    if (node.type === "mushroom" && !runtime.mushroomStates.has(node.id)) {
      runtime.mushroomStates.set(node.id, createNodeGraphMushroomState());
    }
    if (node.type === "boing" && !runtime.boingStates.has(node.id)) {
      runtime.boingStates.set(node.id, createNodeGraphBoingState());
    }
    if (node.type === "torus" && !runtime.torusStates.has(node.id)) {
      runtime.torusStates.set(node.id, createNodeGraphTorusState());
    }
    if (node.type === "keplerBouwkamp" && !runtime.keplerBouwkampStates.has(node.id)) {
      runtime.keplerBouwkampStates.set(node.id, createNodeGraphKeplerBouwkampState());
    }
    if (node.type === "nyquistShannon" && !runtime.nyquistShannonStates.has(node.id)) {
      runtime.nyquistShannonStates.set(node.id, createNodeGraphNyquistShannonState());
    }
    if (node.type === "radar" && !runtime.radarStates.has(node.id)) {
      runtime.radarStates.set(node.id, createNodeGraphRadarState());
    }
    if (node.type === "chordMemory" && !runtime.chordMemoryStates.has(node.id)) {
      runtime.chordMemoryStates.set(node.id, createNodeGraphChordMemoryState());
    }
    if (node.type === "turingMachine" && !runtime.turingMachineStates.has(node.id)) {
      runtime.turingMachineStates.set(node.id, createNodeGraphTuringMachineState());
    }
    if (node.type === "pitchQuantizer" && !runtime.pitchQuantizerStates.has(node.id)) {
      runtime.pitchQuantizerStates.set(node.id, createNodeGraphPitchQuantizerState());
    }
    if (node.type === "surgeOscillator" && !runtime.surgeOscillatorStates.has(node.id)) {
      runtime.surgeOscillatorStates.set(node.id, createNodeGraphSurgeOscillatorState());
    }
    if (node.type === "softwaveOsc" && !runtime.softwaveOscStates.has(node.id)) {
      runtime.softwaveOscStates.set(node.id, createNodeGraphSoftwaveOscillatorState());
    }
    if (node.type === "curveOsc" && !runtime.curveOscStates.has(node.id) && typeof createNodeGraphCurveOscState === "function") {
      runtime.curveOscStates.set(node.id, createNodeGraphCurveOscState());
    }
    if (node.type === "snowflake" && !runtime.snowflakeStates.has(node.id) && typeof createNodeGraphSnowflakeState === "function") {
      runtime.snowflakeStates.set(node.id, createNodeGraphSnowflakeState());
    }
    if (node.type === "textStream" && !runtime.textStreamStates.has(node.id) && typeof createNodeGraphTextStreamState === "function") {
      runtime.textStreamStates.set(node.id, createNodeGraphTextStreamState());
    }
    if (node.type === "degreeTuring" && !runtime.degreeTuringStates.has(node.id) && typeof createNodeGraphDegreeTuringState === "function") {
      runtime.degreeTuringStates.set(node.id, createNodeGraphDegreeTuringState());
    }
    if (node.type === "gravityWalker" && !runtime.gravityWalkerStates.has(node.id) && typeof createNodeGraphGravityWalkerState === "function") {
      runtime.gravityWalkerStates.set(node.id, createNodeGraphGravityWalkerState());
    }
    if (node.type === "degreePhrase" && !runtime.degreePhraseStates.has(node.id) && typeof createNodeGraphDegreePhraseState === "function") {
      runtime.degreePhraseStates.set(node.id, createNodeGraphDegreePhraseState());
    }
    if (node.type === "noteGlide" && !runtime.noteGlideStates.has(node.id) && typeof createNodeGraphNoteGlideState === "function") {
      runtime.noteGlideStates.set(node.id, createNodeGraphNoteGlideState());
    }
    if (node.type === "dsfOscillator" && !runtime.dsfOscillatorStates.has(node.id)) {
      runtime.dsfOscillatorStates.set(node.id, createNodeGraphDsfOscillatorState());
    }
    if (node.type === "robinSupersaw" && !runtime.robinSupersawStates.has(node.id)) {
      runtime.robinSupersawStates.set(node.id, createNodeGraphRobinSupersawState());
    }
    if (node.type === "hypersaw" && !runtime.hypersawStates.has(node.id)) {
      runtime.hypersawStates.set(node.id, createNodeGraphHypersawState());
    }
    if (node.type === "chordSequencer" && !runtime.chordSequencerStates.has(node.id)) {
      runtime.chordSequencerStates.set(node.id, createNodeGraphChordSequencerState());
    }
    if (node.type === "lutCell" && !runtime.lutCellStates.has(node.id)) {
      runtime.lutCellStates.set(node.id, createNodeGraphLutCellState());
    }
    if (node.type === "passiveFilter" && !runtime.passiveFilterStates.has(node.id)) {
      runtime.passiveFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphPassiveFilterState));
    }
    if (node.type === "papoulisFilter" && !runtime.papoulisFilterStates.has(node.id)) {
      runtime.papoulisFilterStates.set(node.id, createNodeGraphPapoulisFilterState());
    }
    if (node.type === "phosphillator" && !runtime.phosphillatorPlaybackStates.has(node.id)) {
      runtime.phosphillatorPlaybackStates.set(node.id, createNodeGraphPhosphillatorPlaybackState());
    }
    if (node.type === "cookbookFilter" && !runtime.cookbookFilterStates.has(node.id)) {
      runtime.cookbookFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphCookbookFilterState));
    }
    if (node.type === "ladderFilter" && !runtime.ladderFilterStates.has(node.id)) {
      runtime.ladderFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphLadderFilterState));
    }
    if (node.type === "flowerChildFilter" && !runtime.flowerChildFilterStates.has(node.id)) {
      runtime.flowerChildFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphFlowerChildFilterState));
    }
    if (node.type === "activeFilter" && !runtime.activeFilterStates.has(node.id)) {
      runtime.activeFilterStates.set(
        node.id,
        typeof createNodeGraphStereoActiveFilterState === "function"
          ? createNodeGraphStereoActiveFilterState()
          : createNodeGraphStereoFilterState(createNodeGraphActiveFilterState),
      );
    }
    for (const sciType of ["butterworth", "linkwitzRiley", "bessel", "chebyshev", "elliptic"]) {
      const mapName = `${sciType}States`;
      if (!runtime[mapName]) runtime[mapName] = new Map();
      if (node.type === sciType && !runtime[mapName].has(node.id)) {
        runtime[mapName].set(node.id, createNodeGraphStereoScientificIirState());
      }
    }
    if (!runtime.bandpassStates) runtime.bandpassStates = new Map();
    if (node.type === "bandpass" && !runtime.bandpassStates.has(node.id)) {
      runtime.bandpassStates.set(
        node.id,
        typeof createNodeGraphStereoEqFilterState === "function"
          ? createNodeGraphStereoEqFilterState()
          : createNodeGraphStereoFilterState(createNodeGraphEqFilterState),
      );
    }
    if (!runtime.allpassStates) runtime.allpassStates = new Map();
    if (node.type === "allpass" && !runtime.allpassStates.has(node.id)) {
      runtime.allpassStates.set(
        node.id,
        typeof createNodeGraphStereoEqFilterState === "function"
          ? createNodeGraphStereoEqFilterState()
          : createNodeGraphStereoFilterState(createNodeGraphEqFilterState),
      );
    }
    if (!runtime.softpopOscillatorStates) runtime.softpopOscillatorStates = new Map();
    if (node.type === "softpopOscillator" && !runtime.softpopOscillatorStates.has(node.id)) {
      runtime.softpopOscillatorStates.set(
        node.id,
        typeof createNodeGraphSoftpopOscillatorState === "function"
          ? createNodeGraphSoftpopOscillatorState()
          : { left: {}, right: {}, lastReset: false, generation: 0, lastSeed: NaN },
      );
    }
    if (!runtime.sinepulseStates) runtime.sinepulseStates = new Map();
    if (node.type === "sinepulse" && !runtime.sinepulseStates.has(node.id)) {
      runtime.sinepulseStates.set(
        node.id,
        typeof createNodeGraphSinepulseState === "function"
          ? createNodeGraphSinepulseState()
          : { tooth: 0, phase: 0, lastReset: 0 },
      );
    }
    if (node.type === "yellowjacketFilter" && !runtime.yellowjacketFilterStates.has(node.id)) {
      runtime.yellowjacketFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphYellowjacketFilterState));
    }
    if (node.type === "superloveFilter" && !runtime.superloveFilterStates.has(node.id)) {
      runtime.superloveFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphSuperloveFilterState));
    }
    if (node.type === "chaoticPhaseLockingFilter" && !runtime.chaoticPhaseLockingFilterStates.has(node.id)) {
      runtime.chaoticPhaseLockingFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphChaoticPhaseLockingFilterState));
    }
    if (node.type === "resonatorFilter" && !runtime.resonatorFilterStates.has(node.id)) {
      runtime.resonatorFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphResonatorFilterState));
    }
    if (node.type === "humanFilter" && !runtime.humanFilterStates.has(node.id)) {
      runtime.humanFilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphHumanFilterState));
    }
    if (node.type === "tb303Filter" && !runtime.tb303FilterStates.has(node.id)) {
      runtime.tb303FilterStates.set(node.id, createNodeGraphStereoFilterState(createNodeGraphTb303FilterState));
    }
    if (node.type === "pulseExplosion" && !runtime.pulseExplosionStates.has(node.id)) {
      runtime.pulseExplosionStates.set(node.id, createNodeGraphPulseExplosionState());
    }
    if (node.type === "comparator" && !runtime.comparatorStates.has(node.id)) {
      runtime.comparatorStates.set(node.id, createNodeGraphComparatorState());
    }
    if (
      node.type === "noiseDetector"
      && typeof createNodeGraphNoiseDetectorState === "function"
      && !runtime.noiseDetectorStates.has(node.id)
    ) {
      runtime.noiseDetectorStates.set(node.id, createNodeGraphNoiseDetectorState());
    }
    if (
      (node.type === "rms" || node.type === "rmsStereo")
      && typeof createNodeGraphRmsState === "function"
      && !runtime.rmsStates.has(node.id)
    ) {
      runtime.rmsStates.set(node.id, createNodeGraphRmsState());
    }
    if (node.type === "speedColorInertia" && !runtime.speedColorInertiaStates.has(node.id)) {
      runtime.speedColorInertiaStates.set(node.id, createNodeGraphSpeedColorInertiaState());
    }
    if (node.type === "inertialFilter" && !runtime.inertialFilterStates.has(node.id)) {
      runtime.inertialFilterStates.set(node.id, createNodeGraphStereoInertialFilterState());
    }
    if (
      node.type === "softClipper"
      && typeof createNodeGraphSoftClipperState === "function"
      && !runtime.softClipperStates.has(node.id)
    ) {
      runtime.softClipperStates.set(node.id, createNodeGraphSoftClipperState());
    }
    if (
      node.type === "clipperLimiter"
      && typeof createNodeGraphSoftClipperState === "function"
      && !runtime.clipperLimiterStates.has(node.id)
    ) {
      runtime.clipperLimiterStates.set(node.id, createNodeGraphSoftClipperState());
    }
    if (
      node.type === "speakerProtector2"
      && typeof createNodeGraphSpeakerProtector2State === "function"
      && !runtime.speakerProtector2States.has(node.id)
    ) {
      runtime.speakerProtector2States.set(node.id, createNodeGraphSpeakerProtector2State());
    }
    if (node.type === "tiltFilter" && !runtime.tiltFilterStates.has(node.id)) {
      runtime.tiltFilterStates.set(node.id, createNodeGraphStereoTiltFilterState());
    }
    if (node.type === "eqFilter" && !runtime.eqFilterStates.has(node.id)) {
      runtime.eqFilterStates.set(node.id, createNodeGraphStereoEqFilterState());
    }
    if (node.type === "sampleDelay" && !runtime.sampleDelayStates.has(node.id)) {
      runtime.sampleDelayStates.set(node.id, createNodeGraphSampleDelayState());
    }
    if (node.type === "aliasSine" && !runtime.aliasSineStates.has(node.id)) {
      runtime.aliasSineStates.set(node.id, createNodeGraphAliasSineState());
    }
    if (
      node.type === "robinSinusoid"
      && typeof createNodeGraphRobinSinusoidState === "function"
      && !runtime.robinSinusoidStates.has(node.id)
    ) {
      runtime.robinSinusoidStates.set(node.id, createNodeGraphRobinSinusoidState());
    }
    if (
      node.type === "phoneTone"
      && typeof createNodeGraphPhoneToneState === "function"
      && !runtime.phoneToneStates.has(node.id)
    ) {
      runtime.phoneToneStates.set(node.id, createNodeGraphPhoneToneState());
    }
    if (node.type === "clock" && !runtime.clockStates.has(node.id)) {
      runtime.clockStates.set(node.id, createNodeGraphClockState());
    }
    if (nodeGraphModuleIsGraphType(node.type) && !runtime.graphLfoStates.has(node.id)) {
      runtime.graphLfoStates.set(node.id, createNodeGraphGraphLfoState());
    }
    if (node.type === "clockDivider" && !runtime.clockDividerStates.has(node.id)) {
      runtime.clockDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "delayedTrigger" && !runtime.delayedTriggerStates.has(node.id)) {
      runtime.delayedTriggerStates.set(node.id, createNodeGraphDelayedTriggerState());
    }
    if (node.type === "delayEffect" && !runtime.delayEffectStates.has(node.id)) {
      runtime.delayEffectStates.set(
        node.id,
        typeof createNodeGraphStereoDelayEffectState === "function"
          ? createNodeGraphStereoDelayEffectState()
          : createNodeGraphDelayEffectState(),
      );
    }
    if (node.type === "pingPongDelay" && !runtime.pingPongDelayStates.has(node.id)) {
      runtime.pingPongDelayStates.set(node.id, createNodeGraphPingPongDelayState());
    }
    if (node.type === "wallDelay" && !runtime.wallDelayStates.has(node.id)) {
      runtime.wallDelayStates.set(node.id, createNodeGraphWallDelayState());
    }
    if (node.type === "reverbEffect" && !runtime.reverbEffectStates.has(node.id)) {
      runtime.reverbEffectStates.set(node.id, createNodeGraphSabrinaReverbState());
    }
    if (node.type === "soemReverb" && !runtime.soemReverbStates.has(node.id)) {
      runtime.soemReverbStates.set(node.id, createNodeGraphSoemReverbState());
    }
    if (node.type === "pll" && !runtime.pllStates.has(node.id)) {
      runtime.pllStates.set(node.id, createNodeGraphPllState());
    }
    if (node.type === "helmholtzPitch" && !runtime.helmholtzStates.has(node.id)) {
      runtime.helmholtzStates.set(node.id, createNodeGraphHelmholtzState());
    }
    if (node.type === "randomClock" && !runtime.randomClockStates.has(node.id)) {
      runtime.randomClockStates.set(node.id, createNodeGraphRandomClockState());
    }
    if (node.type === "sampleHold" && !runtime.sampleHoldStates.has(node.id)) {
      runtime.sampleHoldStates.set(node.id, createNodeGraphSampleHoldState());
    }
    if ((node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") && !runtime.samplePlaybackStates.has(node.id)) {
      runtime.samplePlaybackStates.set(node.id, createNodeGraphSamplePlaybackState());
    }
    if ((node.type === "nextPatch" || node.type === "previousPatch") && !runtime.patchCommandStates.has(node.id)) {
      runtime.patchCommandStates.set(node.id, createNodeGraphPatchCommandState());
    }
    if (node.type === "slewLimiter" && !runtime.slewLimiterStates.has(node.id)) {
      runtime.slewLimiterStates.set(node.id, createNodeGraphSlewLimiterState());
    }
    if (node.type === "expAdsr" && !runtime.expAdsrStates.has(node.id)) {
      runtime.expAdsrStates.set(node.id, createNodeGraphExpAdsrState());
    }
    if (node.type === "attackDecay" && !runtime.attackDecayStates.has(node.id)) {
      runtime.attackDecayStates.set(
        node.id,
        typeof createNodeGraphAttackDecayState === "function"
          ? createNodeGraphAttackDecayState()
          : { raw: 0 },
      );
    }
    if (node.type === "linearEnvelope" && !runtime.linearEnvelopeStates.has(node.id)) {
      runtime.linearEnvelopeStates.set(node.id, createNodeGraphLinearEnvelopeState());
    }
    if (node.type === "noiseGenerator" && !runtime.noiseGeneratorStates.has(node.id)) {
      runtime.noiseGeneratorStates.set(node.id, createNodeGraphNoiseGeneratorState());
    }
    if (node.type === "randomWalk" && !runtime.randomWalkStates.has(node.id)) {
      runtime.randomWalkStates.set(node.id, createNodeGraphRandomWalkState());
    }
    if (node.type === "piSpigotNoise" && !runtime.piSpigotNoiseStates.has(node.id)) {
      runtime.piSpigotNoiseStates.set(node.id, createNodeGraphPiSpigotNoiseState());
    }
    if (node.type === "bradley2a" && !runtime.bradley2AStates.has(node.id)) {
      runtime.bradley2AStates.set(node.id, createNodeGraphBradley2AState());
    }
    if (node.type === "antisaw" && !runtime.antisawStates.has(node.id)) {
      runtime.antisawStates.set(node.id, createNodeGraphAntisawState());
    }
    if (node.type === "fractalBrownianNoise" && !runtime.fractalBrownianNoiseStates.has(node.id)) {
      runtime.fractalBrownianNoiseStates.set(node.id, createNodeGraphFractalBrownianNoiseState());
    }
    if (node.type === "fbmField" && !runtime.fbmFieldStates.has(node.id)) {
      runtime.fbmFieldStates.set(node.id, createNodeGraphFbmFieldState());
    }
    if (!runtime.rgbFractalStates) {
      runtime.rgbFractalStates = new Map();
    }
    if (node.type === "rgbFractal" && !runtime.rgbFractalStates.has(node.id)) {
      runtime.rgbFractalStates.set(
        node.id,
        typeof createNodeGraphRgbFractalState === "function"
          ? createNodeGraphRgbFractalState()
          : (typeof createNodeGraphRgbFractalAudioState === "function"
            ? createNodeGraphRgbFractalAudioState()
            : {}),
      );
    }
    if (
      node.type === "flowerChildEnvelopeFollower" &&
      !runtime.flowerChildEnvelopeFollowerStates.has(node.id)
    ) {
      runtime.flowerChildEnvelopeFollowerStates.set(node.id, createNodeGraphFlowerChildEnvelopeFollowerState());
    }
    if (node.type === "pluckEnvelope" && !runtime.pluckEnvelopeStates.has(node.id)) {
      runtime.pluckEnvelopeStates.set(node.id, createNodeGraphPluckEnvelopeState());
    }
    if (node.type === "triggerDivider" && !runtime.triggerDividerStates.has(node.id)) {
      runtime.triggerDividerStates.set(node.id, createNodeGraphTriggerDividerState());
    }
    if (node.type === "stepSequencer" && !runtime.stepSequencerStates.has(node.id)) {
      runtime.stepSequencerStates.set(node.id, createNodeGraphStepSequencerState());
    }
    if (node.type === "triggerCounter" && !runtime.triggerCounterStates.has(node.id)) {
      runtime.triggerCounterStates.set(node.id, createNodeGraphTriggerCounterState());
    }
    if (node.type === "moduleGroup" && node.moduleGroup?.sourcePatch && !runtime.moduleGroupRuntimes.has(node.id)) {
      try {
        runtime.moduleGroupRuntimes.set(node.id, createNodeGraphLiveRuntime(nodeGraphBuildLivePlanForPatch(node.moduleGroup.sourcePatch)));
      } catch (_error) {
        runtime.moduleGroupRuntimes.delete(node.id);
      }
    }
    for (const [key, value] of Object.entries(node.params || {})) {
      const smootherKey = nodeGraphParameterKey(node.id, key);
      const metadata = node.paramMeta?.[key];
      if (!runtime.smoothers.has(smootherKey)) {
        runtime.smoothers.set(
          smootherKey,
          createNodeGraphParameterSmoother(value, metadata),
        );
      }
      updateNodeGraphParameterSmoother(
        runtime.smoothers.get(smootherKey),
        value,
        metadata,
        runtime,
        smootherKey,
      );
    }
  }
  for (const id of [...runtime.phases.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.phases.delete(id);
    }
  }
  for (const id of [...runtime.oscResetStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.oscResetStates.delete(id);
    }
  }
  for (const id of [...runtime.graphLfoStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.graphLfoStates.delete(id);
    }
  }
  for (const id of [...runtime.triangleStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.triangleStates.delete(id);
    }
  }
  for (const id of [...runtime.oscillatorLastPhaseIncrements.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.oscillatorLastPhaseIncrements.delete(id);
    }
  }
  for (const id of [...runtime.oscillatorStoppedSamples.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.oscillatorStoppedSamples.delete(id);
    }
  }
  for (const id of [...runtime.noiseSeeds.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.noiseSeeds.delete(id);
    }
  }
  for (const id of [...runtime.noiseSeedKeys.keys()]) {
    const nodeId = String(id).split(":")[0];
    if (!nodeIds.has(nodeId)) {
      runtime.noiseSeedKeys.delete(id);
    }
  }
  for (const id of [...runtime.nodeOutputs.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.nodeOutputs.delete(id);
    }
  }
  for (const id of [...runtime.spiralStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.spiralStates.delete(id);
    }
  }
  for (const id of [...runtime.fractalSpiralStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.fractalSpiralStates.delete(id);
    }
  }
  for (const id of [...runtime.logSpiralStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.logSpiralStates.delete(id);
    }
  }
  for (const id of [...runtime.lorenzAttractorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.lorenzAttractorStates.delete(id);
    }
  }
  for (const id of [...runtime.logisticMapStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.logisticMapStates.delete(id);
    }
  }
  for (const id of [...runtime.henonMapStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.henonMapStates.delete(id);
    }
  }
  for (const id of [...runtime.rayBouncerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.rayBouncerStates.delete(id);
    }
  }
  for (const id of [...runtime.chuaAttractorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.chuaAttractorStates.delete(id);
    }
  }
  for (const id of [...runtime.wirdoSpiralStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.wirdoSpiralStates.delete(id);
    }
  }
  for (const id of [...runtime.blubbStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.blubbStates.delete(id);
    }
  }
  for (const id of [...runtime.mushroomStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.mushroomStates.delete(id);
    }
  }
  for (const id of [...runtime.boingStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.boingStates.delete(id);
    }
  }
  for (const id of [...runtime.torusStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.torusStates.delete(id);
    }
  }
  for (const id of [...runtime.keplerBouwkampStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.keplerBouwkampStates.delete(id);
    }
  }
  for (const id of [...runtime.nyquistShannonStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.nyquistShannonStates.delete(id);
    }
  }
  for (const id of [...runtime.radarStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.radarStates.delete(id);
    }
  }
  for (const id of [...runtime.chordMemoryStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.chordMemoryStates.delete(id);
    }
  }
  for (const id of [...runtime.turingMachineStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.turingMachineStates.delete(id);
    }
  }
  for (const id of [...runtime.pitchQuantizerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.pitchQuantizerStates.delete(id);
    }
  }
  for (const id of [...runtime.surgeOscillatorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.surgeOscillatorStates.delete(id);
    }
  }
  if (runtime.softwaveOscStates) {
    for (const id of [...runtime.softwaveOscStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.softwaveOscStates.delete(id);
      }
    }
  }
  if (runtime.curveOscStates) {
    for (const id of [...runtime.curveOscStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.curveOscStates.delete(id);
      }
    }
  }
  if (runtime.snowflakeStates) {
    for (const id of [...runtime.snowflakeStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.snowflakeStates.delete(id);
      }
    }
  }
  for (const mapName of ["textStreamStates", "degreeTuringStates", "gravityWalkerStates", "degreePhraseStates", "noteGlideStates"]) {
    const map = runtime[mapName];
    if (!map) continue;
    for (const id of [...map.keys()]) {
      if (!nodeIds.has(id)) map.delete(id);
    }
  }
  for (const id of [...runtime.dsfOscillatorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.dsfOscillatorStates.delete(id);
    }
  }
  for (const id of [...runtime.robinSupersawStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.robinSupersawStates.delete(id);
    }
  }
  for (const id of [...runtime.hypersawStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.hypersawStates.delete(id);
    }
  }
  for (const id of [...runtime.chordSequencerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.chordSequencerStates.delete(id);
    }
  }
  for (const id of [...runtime.lutCellStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.lutCellStates.delete(id);
    }
  }
  for (const id of [...runtime.passiveFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.passiveFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.papoulisFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.papoulisFilterStates.delete(id);
    }
  }
  if (runtime.xyPadFilterStates instanceof Map) {
    for (const id of [...runtime.xyPadFilterStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.xyPadFilterStates.delete(id);
      }
    }
  }
  for (const id of [...runtime.phosphillatorPlaybackStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.phosphillatorPlaybackStates.delete(id);
      nodeGraphPhosphillatorDecodedPathCache.delete(id);
    }
  }
  for (const id of [...runtime.moduleGroupRuntimes.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.moduleGroupRuntimes.delete(id);
    }
  }
  for (const id of [...runtime.linearEnvelopeStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.linearEnvelopeStates.delete(id);
    }
  }
  for (const id of [...runtime.clockStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.clockStates.delete(id);
    }
  }
  for (const id of [...runtime.codeblockFunctions.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.codeblockFunctions.delete(id);
    }
  }
  for (const id of [...runtime.cookbookFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.cookbookFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.ladderFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.ladderFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.flowerChildFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.flowerChildFilterStates.delete(id);
    }
  }
  if (runtime.activeFilterStates) {
    for (const id of [...runtime.activeFilterStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.activeFilterStates.delete(id);
      }
    }
  }
  for (const sciType of ["butterworth", "linkwitzRiley", "bessel", "chebyshev", "elliptic", "bandpass", "allpass", "crossover2", "crossover3", "crossover4", "crossover5", "crossover6", "modeResonator", "combResonator", "waveguide", "phaseDisperse", "bode", "stftBlur", "softpopOscillator", "sinepulse"]) {
    const map = runtime[`${sciType}States`];
    if (!map) continue;
    for (const id of [...map.keys()]) {
      if (!nodeIds.has(id)) map.delete(id);
    }
  }
  for (const id of [...runtime.yellowjacketFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.yellowjacketFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.superloveFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.superloveFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.chaoticPhaseLockingFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.chaoticPhaseLockingFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.resonatorFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.resonatorFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.humanFilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.humanFilterStates.delete(id);
    }
  }
  for (const id of [...runtime.pulseExplosionStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.pulseExplosionStates.delete(id);
    }
  }
  for (const id of [...runtime.comparatorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.comparatorStates.delete(id);
    }
  }
  if (runtime.noiseDetectorStates) {
    for (const id of [...runtime.noiseDetectorStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.noiseDetectorStates.delete(id);
      }
    }
  }
  if (runtime.rmsStates) {
    for (const id of [...runtime.rmsStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.rmsStates.delete(id);
      }
    }
  }
  if (runtime.speedColorInertiaStates) {
    for (const id of [...runtime.speedColorInertiaStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.speedColorInertiaStates.delete(id);
      }
    }
  }
  if (runtime.inertialFilterStates) {
    for (const id of [...runtime.inertialFilterStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.inertialFilterStates.delete(id);
      }
    }
  }
  if (runtime.softClipperStates) {
    for (const id of [...runtime.softClipperStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.softClipperStates.delete(id);
      }
    }
  }
  if (runtime.clipperLimiterStates) {
    for (const id of [...runtime.clipperLimiterStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.clipperLimiterStates.delete(id);
      }
    }
  }
  if (runtime.speakerProtector2States) {
    for (const id of [...runtime.speakerProtector2States.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.speakerProtector2States.delete(id);
      }
    }
  }
  if (runtime.tiltFilterStates) {
    for (const id of [...runtime.tiltFilterStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.tiltFilterStates.delete(id);
      }
    }
  }
  if (runtime.eqFilterStates) {
    for (const id of [...runtime.eqFilterStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.eqFilterStates.delete(id);
      }
    }
  }
  for (const id of [...runtime.sampleDelayStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.sampleDelayStates.delete(id);
    }
  }
  for (const id of [...runtime.aliasSineStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.aliasSineStates.delete(id);
    }
  }
  if (runtime.robinSinusoidStates) {
    for (const id of [...runtime.robinSinusoidStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.robinSinusoidStates.delete(id);
      }
    }
  }
  if (runtime.phoneToneStates) {
    for (const id of [...runtime.phoneToneStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.phoneToneStates.delete(id);
      }
    }
  }
  for (const id of [...runtime.tb303FilterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.tb303FilterStates.delete(id);
    }
  }
  for (const id of [...runtime.clockDividerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.clockDividerStates.delete(id);
    }
  }
  for (const id of [...runtime.delayedTriggerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.delayedTriggerStates.delete(id);
    }
  }
  for (const id of [...runtime.delayEffectStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.delayEffectStates.delete(id);
    }
  }
  for (const id of [...runtime.pingPongDelayStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.pingPongDelayStates.delete(id);
    }
  }
  for (const id of [...runtime.wallDelayStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.wallDelayStates.delete(id);
    }
  }
  for (const id of [...runtime.reverbEffectStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.reverbEffectStates.delete(id);
    }
  }
  for (const id of [...(runtime.soemReverbStates?.keys() || [])]) {
    if (!nodeIds.has(id)) {
      runtime.soemReverbStates.delete(id);
    }
  }
  for (const id of [...(runtime.pllStates?.keys() || [])]) {
    if (!nodeIds.has(id)) {
      runtime.pllStates.delete(id);
    }
  }
  for (const id of [...(runtime.helmholtzStates?.keys() || [])]) {
    if (!nodeIds.has(id)) {
      runtime.helmholtzStates.delete(id);
    }
  }
  for (const id of [...runtime.sampleHoldStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.sampleHoldStates.delete(id);
    }
  }
  for (const id of [...runtime.samplePlaybackStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.samplePlaybackStates.delete(id);
    }
  }
  for (const id of [...runtime.patchCommandStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.patchCommandStates.delete(id);
    }
  }
  for (const id of [...runtime.slewLimiterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.slewLimiterStates.delete(id);
    }
  }
  for (const id of [...runtime.expAdsrStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.expAdsrStates.delete(id);
    }
  }
  if (runtime.attackDecayStates) {
    for (const id of [...runtime.attackDecayStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.attackDecayStates.delete(id);
      }
    }
  }
  for (const id of [...runtime.noiseGeneratorStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.noiseGeneratorStates.delete(id);
    }
  }
  for (const id of [...runtime.randomWalkStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.randomWalkStates.delete(id);
    }
  }
  for (const id of [...runtime.piSpigotNoiseStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.piSpigotNoiseStates.delete(id);
    }
  }
  for (const id of [...runtime.bradley2AStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.bradley2AStates.delete(id);
    }
  }
  for (const id of [...runtime.antisawStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.antisawStates.delete(id);
    }
  }
  for (const id of [...runtime.randomClockStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.randomClockStates.delete(id);
    }
  }
  for (const id of [...runtime.fractalBrownianNoiseStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.fractalBrownianNoiseStates.delete(id);
    }
  }
  if (runtime.fbmFieldStates) {
    for (const id of [...runtime.fbmFieldStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.fbmFieldStates.delete(id);
      }
    }
  }
  if (runtime.rgbFractalStates) {
    for (const id of [...runtime.rgbFractalStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.rgbFractalStates.delete(id);
      }
    }
  }
  for (const id of [...runtime.flowerChildEnvelopeFollowerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.flowerChildEnvelopeFollowerStates.delete(id);
    }
  }
  for (const id of [...runtime.pluckEnvelopeStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.pluckEnvelopeStates.delete(id);
    }
  }
  for (const id of [...runtime.stepSequencerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.stepSequencerStates.delete(id);
    }
  }
  for (const id of [...runtime.triggerCounterStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.triggerCounterStates.delete(id);
    }
  }
  for (const id of [...runtime.triggerDividerStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.triggerDividerStates.delete(id);
    }
  }
  for (const id of [...runtime.impulseButtonStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.impulseButtonStates.delete(id);
    }
  }
  for (const id of [...runtime.bugButtonStates.keys()]) {
    if (!nodeIds.has(id)) {
      runtime.bugButtonStates.delete(id);
    }
  }
  if (runtime.keypadStates) {
    for (const id of [...runtime.keypadStates.keys()]) {
      if (!nodeIds.has(id)) {
        runtime.keypadStates.delete(id);
      }
    }
  }
  for (const key of [...runtime.smoothers.keys()]) {
    const [nodeId, parameter] = key.split(".");
    if (!nodeIds.has(nodeId) || !runtime.nodes.get(nodeId)?.params || !(parameter in runtime.nodes.get(nodeId).params)) {
      const dead = runtime.smoothers.get(key);
      if (typeof nodeGraphDeactivateParameterSmoother === "function") {
        nodeGraphDeactivateParameterSmoother(runtime, key, dead);
      }
      runtime.smoothers.delete(key);
    }
  }
}

function updateNodeGraphLiveRuntimeConnections(runtime, plan) {
  runtime.inputConnections = nodeGraphLiveInputConnectionMap(plan);
  runtime.graphInputConnections = nodeGraphLiveGraphInputConnectionMap(plan);
  runtime.modulationConnections = nodeGraphLiveModulationConnectionMap(plan);
  runtime.outputNode = plan.outputNode || runtime.outputNode || "output";
  runtime.scopeCaptureNodeIds = [...(plan.scopeCaptureNodeIds || [])];
  runtime.scopeCaptureRates = plan.scopeCaptureRates && typeof plan.scopeCaptureRates === "object"
    ? { ...plan.scopeCaptureRates }
    : {};
  runtime.visualSinks = (plan.visualSinks || []).map((sink) => ({
    ...sink,
    bufferedInputs: [...(sink.bufferedInputs || [])],
    inputs: (sink.inputs || []).map((input) => ({ ...input })),
  }));
  if (typeof syncNodeGraphVisualInputBuffers === "function") {
    syncNodeGraphVisualInputBuffers(runtime);
  }
}

function updateNodeGraphLiveRuntimeParameters(runtime, nodes) {
  if (!runtime) {
    return;
  }
  for (const node of nodes || []) {
    const current = runtime.nodes.get(node.id);
    if (!current) {
      continue;
    }
    current.params = { ...(node.params || {}) };
    current.paramMeta = cloneNodeGraphParamMeta(node.paramMeta);
    for (const [key, value] of Object.entries(current.params || {})) {
      const smootherKey = nodeGraphParameterKey(node.id, key);
      const metadata = current.paramMeta?.[key];
      if (!runtime.smoothers.has(smootherKey)) {
        runtime.smoothers.set(
          smootherKey,
          createNodeGraphParameterSmoother(value, metadata),
        );
      }
      updateNodeGraphParameterSmoother(
        runtime.smoothers.get(smootherKey),
        value,
        metadata,
        runtime,
        smootherKey,
      );
    }
  }
}
