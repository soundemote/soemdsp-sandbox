// Realtime worklet evaluator methods for moduleGroup, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry already calls these via this.evaluateModuleGroup(...).
NodeLiveAudioProcessor.prototype.createNestedRuntime = function createNestedRuntime(plan) {
  const runtime = Object.create(NodeLiveAudioProcessor.prototype);
  runtime.inputConnections = new Map();
  runtime.autoSmoothingSeconds = this.autoSmoothingSeconds;
  runtime.badNumberCount = 0;
  runtime.lastBadValueReason = "";
  runtime.lastBadValueNodeId = "";
  runtime.lastBadValueSource = "";
  runtime.inputMeterPeak = 0;
  runtime.inputMeterSamples = 0;
  runtime.inputMeterSquareSum = 0;
  runtime.meterClipCount = 0;
  runtime.meterCounter = 0;
  runtime.meterPeak = 0;
  runtime.meterProtectionMuteCount = 0;
  runtime.meterSamples = 0;
  runtime.meterSquareSum = 0;
  runtime.macroControls = this.macroControls;
  runtime.pitchModWheelSignal = this.pitchModWheelSignal;
  runtime.externalButtonEvents = this.externalButtonEvents;
  runtime.wireBreakEvent = this.wireBreakEvent;
  runtime.wireConnectEvent = this.wireConnectEvent;
  runtime.wireDisconnectEvent = this.wireDisconnectEvent;
  runtime.windowReopenEvent = this.windowReopenEvent;
  runtime.shootingStarExplosionEvent = this.shootingStarExplosionEvent;
  runtime.inputWireBreakTriggers = new Map();
  runtime.midiKeyboardGatePulseSamples = 0;
  runtime.midiKeyboardSignal = null;
  runtime.moduleGroupRuntimes = new Map();
  runtime.modulationConnections = new Map();
  runtime.nodeOutputs = new Map();
  runtime.nodes = new Map();
  runtime.nativeEllipsoid = this.nativeEllipsoid;
  runtime.nativeEllipsoidReady = this.nativeEllipsoidReady;
  runtime.nativeSabrinaReverb = this.nativeSabrinaReverb;
  runtime.nativeSabrinaReverbReady = this.nativeSabrinaReverbReady;
  runtime.nativePll = this.nativePll;
  runtime.nativePllReady = this.nativePllReady;
  runtime.nativeHelmholtz = this.nativeHelmholtz;
  runtime.nativeHelmholtzReady = this.nativeHelmholtzReady;
  runtime.noiseSeedKeys = new Map();
  runtime.noiseSeeds = new Map();
  runtime.order = [];
  runtime.engineSampleRate = this.engineSampleRate;
  runtime.hostSampleRate = this.hostSampleRate;
  runtime.oversamplingRatio = this.oversamplingRatio;
  runtime.passiveFilterStates = new Map();
  runtime.papoulisFilterStates = new Map();
  runtime.xyPadFilterStates = new Map();
  runtime.phosphillatorPlaybackStates = new Map();
  runtime.clockDividerStates = new Map();
  runtime.clockStates = new Map();
  runtime.codeblockFunctions = new Map();
  runtime.cookbookFilterStates = new Map();
  runtime.delayedTriggerStates = new Map();
  runtime.delayEffectStates = new Map();
  runtime.pingPongDelayStates = new Map();
  runtime.expAdsrStates = new Map();
  runtime.attackDecayStates = new Map();
  runtime.fractalBrownianNoiseStates = new Map();
  runtime.fbmFieldStates = new Map();
  runtime.flowerChildEnvelopeFollowerStates = new Map();
  runtime.graphInputConnections = new Map();
  runtime.ladderFilterStates = new Map();
  runtime.flowerChildFilterStates = new Map();
  runtime.activeFilterStates = new Map();
  runtime.butterworthStates = new Map();
  runtime.linkwitzRileyStates = new Map();
  runtime.besselStates = new Map();
  runtime.chebyshevStates = new Map();
  runtime.ellipticStates = new Map();
  runtime.bandpassStates = new Map();
  runtime.allpassStates = new Map();
  runtime.crossover2States = new Map();
  runtime.crossover3States = new Map();
  runtime.crossover4States = new Map();
  runtime.crossover5States = new Map();
  runtime.crossover6States = new Map();
  runtime.softpopOscillatorStates = new Map();
  runtime.yellowjacketFilterStates = new Map();
  runtime.superloveFilterStates = new Map();
  runtime.chaoticPhaseLockingFilterStates = new Map();
  runtime.resonatorFilterStates = new Map();
  runtime.humanFilterStates = new Map();
  runtime.pulseExplosionStates = new Map();
  runtime.linearEnvelopeStates = new Map();
  runtime.sineWavetableStates = new Map();
  runtime.noiseGeneratorStates = new Map();
  runtime.oscResetStates = new Map();
  runtime.graphLfoStates = new Map();
  runtime.outputNode = plan?.outputNode || "output";
  runtime.patchFingerprint = plan?.patchFingerprint || "";
  runtime.patchCommandStates = new Map();
  runtime.phases = new Map();
  runtime.pluckEnvelopeStates = new Map();
  runtime.planSerial = 0;
  runtime.randomClockStates = new Map();
  runtime.reverbEffectStates = new Map();
  runtime.sampleHoldStates = new Map();
  runtime.samplePlaybackStates = new Map();
  runtime.samples = this.samples;
  runtime.randomWalkStates = new Map();
  runtime.piSpigotNoiseStates = new Map();
  runtime.bradley2AStates = new Map();
  runtime.antisawStates = new Map();
  runtime.sessionId = this.sessionId;
  runtime.scopeBuffers = new Map();
  runtime.scopeCounter = 0;
  runtime.slewLimiterStates = new Map();
  runtime.airClipperStates = new Map();
  runtime.smoothers = new Map();
  runtime.activeSmoothers = [];
  runtime.activeSmootherKeys = new Set();
  runtime.spiralStates = new Map();
  runtime.lorenzAttractorStates = new Map();
  runtime.logisticMapStates = new Map();
  runtime.henonMapStates = new Map();
  runtime.rayBouncerStates = new Map();
  runtime.chuaAttractorStates = new Map();
  runtime.wirdoSpiralStates = new Map();
  runtime.blubbStates = new Map();
  runtime.mushroomStates = new Map();
  runtime.boingStates = new Map();
  runtime.torusStates = new Map();
  runtime.keplerBouwkampStates = new Map();
  runtime.nyquistShannonStates = new Map();
  runtime.radarStates = new Map();
  runtime.chordMemoryStates = new Map();
  runtime.turingMachineStates = new Map();
  runtime.pitchQuantizerStates = new Map();
  runtime.chordSequencerStates = new Map();
  runtime.lutCellStates = new Map();
  runtime.surgeOscillatorStates = new Map();
  runtime.dsfOscillatorStates = new Map();
  runtime.robinSupersawStates = new Map();
  runtime.hypersawStates = new Map();
  runtime.stepSequencerStates = new Map();
  runtime.triggerCounterStates = new Map();
  runtime.triggerDividerStates = new Map();
  runtime.triangleStates = new Map();
  runtime.vactrolEnvelopeStates = new Map();
  runtime.impulseButtonStates = new Map();
  runtime.polyBlepStates = new Map();
  runtime.resetVisualControls();
  runtime.setNestedPlan(plan);
  return runtime;
};

NodeLiveAudioProcessor.prototype.setNestedPlan = function setNestedPlan(plan) {
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const ids = new Set(nodes.map((node) => node.id));
  this.nodes = new Map(nodes.map((node) => [node.id, {
    id: node.id,
    codeblock: this.normalizeCodeblock(node.codeblock),
    moduleGroup: node.moduleGroup || null,
    moduleGroupPlan: node.moduleGroupPlan || null,
    paramMeta: node.paramMeta || {},
    params: node.params || {},
    sample: node.sample || null,
    type: node.type,
  }]));
  this.order = Array.isArray(plan?.order) ? [...plan.order] : [...ids];
  this.outputNode = plan?.outputNode || "output";
  this.inputConnections = this.buildInputConnectionMap(plan?.connections, ids);
  this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
  this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
  for (const id of ids) {
    const node = this.nodes.get(id);
    this.nodeOutputs.set(id, 0);
    if (nodeLiveIsPolyBlepOscillatorType(node?.type)) {
      this.phases.set(id, 0);
      this.oscResetStates.set(id, this.createOscResetState());
      this.triangleStates.set(id, 0);
    }
    if (nodeLiveIsPolyBlepOscillatorType(node?.type)) {
      this.noiseSeeds.set(id, this.stableSeed(id));
    }
    if (node?.type === "spiral") this.spiralStates.set(id, this.createSpiralState());
    if (node?.type === "fractalSpiral") this.fractalSpiralStates.set(id, this.createFractalSpiralState());
    if (node?.type === "logSpiral") this.logSpiralStates.set(id, this.createLogSpiralState());
    if (node?.type === "lorenzAttractor") this.lorenzAttractorStates.set(id, this.createLorenzAttractorState());
    if (node?.type === "logisticMap") this.logisticMapStates.set(id, this.createLogisticMapState());
    if (node?.type === "henonMap") this.henonMapStates.set(id, this.createHenonMapState());
    if (node?.type === "rayBouncer") this.rayBouncerStates.set(id, this.createRayBouncerState());
    if (node?.type === "chuaAttractor") this.chuaAttractorStates.set(id, this.createChuaAttractorState());
    if (node?.type === "wirdoSpiral") this.wirdoSpiralStates.set(id, this.createWirdoSpiralState());
    if (node?.type === "blubb") this.blubbStates.set(id, this.createBlubbState());
    if (node?.type === "mushroom") this.mushroomStates.set(id, this.createMushroomState());
    if (node?.type === "boing") this.boingStates.set(id, this.createBoingState());
    if (node?.type === "torus") this.torusStates.set(id, this.createTorusState());
    if (node?.type === "keplerBouwkamp") this.keplerBouwkampStates.set(id, this.createKeplerBouwkampState());
    if (node?.type === "nyquistShannon") this.nyquistShannonStates.set(id, this.createNyquistShannonState());
    if (node?.type === "radar") this.radarStates.set(id, this.createRadarState());
    if (node?.type === "chordMemory") this.chordMemoryStates.set(id, this.createChordMemoryState());
    if (node?.type === "turingMachine") this.turingMachineStates.set(id, this.createTuringMachineState());
    if (node?.type === "pitchQuantizer") this.pitchQuantizerStates.set(id, this.createPitchQuantizerState());
    if (node?.type === "chordSequencer") this.chordSequencerStates.set(id, this.createChordSequencerState());
    if (node?.type === "lutCell") this.lutCellStates.set(id, this.createLutCellState());
    if (node?.type === "surgeOscillator") this.surgeOscillatorStates.set(id, this.createSurgeOscillatorState());
    if (node?.type === "dsfOscillator") this.dsfOscillatorStates.set(id, this.createDsfOscillatorState());
    if (node?.type === "robinSupersaw") this.robinSupersawStates.set(id, this.createRobinSupersawState());
    if (node?.type === "hypersaw") this.hypersawStates.set(id, this.createHypersawState());
    if (node?.type === "papoulisFilter") this.papoulisFilterStates.set(id, this.createPapoulisFilterState());
    if (node?.type === "phosphillator") this.phosphillatorPlaybackStates.set(id, this.createPhosphillatorPlaybackState());
    if (node?.type === "pulseExplosion") this.pulseExplosionStates.set(id, this.createPulseExplosionState());
    if (node?.type === "passiveFilter") this.passiveFilterStates.set(id, this.createStereoFilterState(() => this.createPassiveFilterState()));
    if (node?.type === "cookbookFilter") this.cookbookFilterStates.set(id, this.createStereoFilterState(() => this.createCookbookFilterState()));
    if (node?.type === "ladderFilter") this.ladderFilterStates.set(id, this.createStereoFilterState(() => this.createLadderFilterState()));
    if (node?.type === "flowerChildFilter") this.flowerChildFilterStates.set(id, this.createStereoFilterState(() => this.createFlowerChildFilterState()));
    if (node?.type === "activeFilter") {
      this.activeFilterStates.set(id, this.createStereoActiveFilterState());
    }
    if (node?.type === "butterworth") this.butterworthStates.set(id, this.createStereoScientificIirState());
    if (node?.type === "linkwitzRiley") this.linkwitzRileyStates.set(id, this.createStereoScientificIirState());
    if (node?.type === "bessel") this.besselStates.set(id, this.createStereoScientificIirState());
    if (node?.type === "chebyshev") this.chebyshevStates.set(id, this.createStereoScientificIirState());
    if (node?.type === "elliptic") this.ellipticStates.set(id, this.createStereoScientificIirState());
    if (node?.type === "bandpass") this.bandpassStates.set(id, this.createStereoBandpassState());
    if (node?.type === "allpass") this.allpassStates.set(id, this.createStereoAllpassState());
    for (let n = 2; n <= 6; n += 1) {
      if (node?.type === `crossover${n}`) {
        this[`crossover${n}States`].set(id, this.createCrossoverStereoState(n));
      }
    }
    if (node?.type === "softpopOscillator") this.softpopOscillatorStates.set(id, this.createSoftpopOscillatorState());
    if (node?.type === "yellowjacketFilter") this.yellowjacketFilterStates.set(id, this.createStereoFilterState(() => this.createYellowjacketFilterState()));
    if (node?.type === "superloveFilter") this.superloveFilterStates.set(id, this.createStereoFilterState(() => this.createSuperloveFilterState()));
    if (node?.type === "chaoticPhaseLockingFilter") this.chaoticPhaseLockingFilterStates.set(id, this.createStereoFilterState(() => this.createChaoticPhaseLockingFilterState()));
    if (node?.type === "resonatorFilter") this.resonatorFilterStates.set(id, this.createStereoFilterState(() => this.createResonatorFilterState()));
    if (node?.type === "humanFilter") this.humanFilterStates.set(id, this.createStereoFilterState(() => this.createHumanFilterState()));
    if (node?.type === "tb303Filter") this.tb303FilterStates.set(id, this.createStereoFilterState(() => this.createTb303FilterState()));
    if (node?.type === "clock") this.clockStates.set(id, this.createClockState());
    if (node?.type === "graph" || node?.type === "graph2" || node?.type === "graphCopy") this.graphLfoStates.set(id, this.createGraphLfoState());
    if (node?.type === "clockDivider") this.clockDividerStates.set(id, this.createTriggerDividerState());
    if (node?.type === "delayedTrigger") this.delayedTriggerStates.set(id, this.createDelayedTriggerState());
    if (node?.type === "delayEffect") this.delayEffectStates.set(id, this.createStereoDelayEffectState());
    if (node?.type === "pingPongDelay") this.pingPongDelayStates.set(id, this.createPingPongDelayState());
    if (node?.type === "reverbEffect") this.reverbEffectStates.set(id, this.createSabrinaReverbState());
    if (node?.type === "pll") this.pllStates.set(id, this.createPllState());
    if (node?.type === "helmholtzPitch") this.helmholtzStates.set(id, this.createHelmholtzState());
    if (node?.type === "randomClock") this.randomClockStates.set(id, this.createRandomClockState());
    if (node?.type === "sampleHold") this.sampleHoldStates.set(id, this.createStereoSampleHoldState());
    if (node?.type === "samplePlayer" || node?.type === "sampleLooper" || node?.type === "audioPlayer") {
      this.samplePlaybackStates.set(id, this.createSamplePlaybackState());
    }
    if (node?.type === "nextPatch" || node?.type === "previousPatch") this.patchCommandStates.set(id, this.createPatchCommandState());
    if (node?.type === "slewLimiter") this.slewLimiterStates.set(id, this.createStereoSlewLimiterState());
    if (node?.type === "airClipper" && typeof this.createAirClipperState === "function") {
      this.airClipperStates.set(id, this.createAirClipperState());
    }
    if (node?.type === "expAdsr") this.expAdsrStates.set(id, this.createExpAdsrState());
    if (node?.type === "attackDecay") this.attackDecayStates.set(id, this.createAttackDecayState());
    if (node?.type === "linearEnvelope") this.linearEnvelopeStates.set(id, this.createLinearEnvelopeState());
    if (node?.type === "noiseGenerator") this.noiseGeneratorStates.set(id, this.createNoiseGeneratorState());
    if (node?.type === "randomWalk") this.randomWalkStates.set(id, this.createRandomWalkState());
    if (node?.type === "piSpigotNoise") this.piSpigotNoiseStates.set(id, this.createPiSpigotNoiseState());
    if (node?.type === "bradley2a") this.bradley2AStates.set(id, this.createBradley2AState());
    if (node?.type === "antisaw") this.antisawStates.set(id, this.createAntisawState());
    if (node?.type === "fractalBrownianNoise") this.fractalBrownianNoiseStates.set(id, this.createFractalBrownianNoiseState());
    if (node?.type === "fbmField") this.fbmFieldStates.set(id, this.createFbmFieldState());
    if (node?.type === "flowerChildEnvelopeFollower") this.flowerChildEnvelopeFollowerStates.set(id, this.createFlowerChildEnvelopeFollowerState());
    if (node?.type === "pluckEnvelope") this.pluckEnvelopeStates.set(id, this.createPluckEnvelopeState());
    if (node?.type === "stepSequencer") this.stepSequencerStates.set(id, this.createStepSequencerState());
    if (node?.type === "triggerCounter") this.triggerCounterStates.set(id, this.createTriggerCounterState());
    if (node?.type === "triggerDivider") this.triggerDividerStates.set(id, this.createTriggerDividerState());
    if (node?.type === "vactrolEnvelopeSeries" || node?.type === "vactrolEnvelopeCustom") this.vactrolEnvelopeStates.set(id, this.createVactrolEnvelopeState());
    if (node?.type === "polyBlep") this.polyBlepStates.set(id, this.createPolyBlepState());
    if (node?.type === "blit") this.blitStates.set(id, this.createBlitState());
    if (node?.type === "archimedes") this.archimedesStates.set(id, this.createArchimedesState());
    if (node?.type === "moduleGroup" && node.moduleGroupPlan) {
      this.moduleGroupRuntimes.set(id, this.createNestedRuntime(node.moduleGroupPlan));
    }
    for (const [key, value] of Object.entries(node?.params || {})) {
      const smootherKey = this.parameterKey(id, key);
      const metadata = node.paramMeta?.[key];
      if (!this.smoothers.has(smootherKey)) {
        this.smoothers.set(smootherKey, this.createSmoother(value, metadata));
      }
      this.updateSmoother(this.smoothers.get(smootherKey), value, metadata, smootherKey);
    }
  }
};

NodeLiveAudioProcessor.prototype.evaluateModuleGroup = function evaluateModuleGroup(node, mixInput, frame, frames, rate, inputFrame) {
  if (!node.moduleGroupPlan) {
    return {};
  }
  let runtime = this.moduleGroupRuntimes.get(node.id);
  if (!runtime) {
    runtime = this.createNestedRuntime(node.moduleGroupPlan);
    this.moduleGroupRuntimes.set(node.id, runtime);
  }
  runtime.engineSampleRate = rate;
  runtime.hostSampleRate = this.hostSampleRate;
  runtime.oversamplingRatio = this.oversamplingRatio;
  runtime.macroControls = this.macroControls;
  runtime.pitchModWheelSignal = this.pitchModWheelSignal;
  runtime.externalButtonEvents = this.externalButtonEvents;
  runtime.wireBreakEvent = this.wireBreakEvent;
  runtime.wireConnectEvent = this.wireConnectEvent;
  runtime.wireDisconnectEvent = this.wireDisconnectEvent;
  runtime.windowReopenEvent = this.windowReopenEvent;
  runtime.shootingStarExplosionEvent = this.shootingStarExplosionEvent;
  runtime.externalGroupInputs = new Map(
    (node.moduleGroup?.inputs || []).map((input) => [input.nodeId, mixInput(node.id, input.name)]),
  );
  const frameOutput = runtime.evaluateFrame(frame, frames, [], rate, inputFrame);
  const output = {};
  for (const endpoint of node.moduleGroup?.outputs || []) {
    output[endpoint.name] = runtime.readRuntimePortOutput(
      frameOutput.frameValues,
      endpoint.nodeId,
      endpoint.port || "Out",
    );
  }
  return output;
};
