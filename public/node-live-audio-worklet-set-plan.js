// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: setPlan — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.setPlan = function setPlan(plan, message = {}) {
    const patchFingerprint = message.patchFingerprint || plan?.patchFingerprint || "";
    this.patchFingerprint = patchFingerprint;
    this.planSerial = message.planSerial || 0;
    this.sessionId = message.sessionId || 0;
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveUnderruns = 0;
    if (Number.isFinite(Number(message.autoSmoothingSeconds)) && typeof this.clampAutoSmoothingSeconds === "function") {
      this.autoSmoothingSeconds = this.clampAutoSmoothingSeconds(message.autoSmoothingSeconds);
    }
    if (Number.isFinite(Number(message.pitchReferenceMidiNote))) {
      this.pitchReferenceMidiNote = Number(message.pitchReferenceMidiNote);
    }
    if (Number.isFinite(Number(message.pitchReferenceHz))) {
      this.pitchReferenceHz = Number(message.pitchReferenceHz);
    }
    this.hostSampleRate = Math.max(1, Number(message.sampleRate) || sampleRate || 44100);
    // App-wide: oversampling under construction — always ×1 (ignore plan/message).
    this.oversamplingRatio = 1;
    this.engineSampleRate = this.hostSampleRate;
    this.timing = this.normalizePatchTiming(plan?.timing);
    if (this.raptEllipticDecimatorRatio !== this.oversamplingRatio) {
      this.resetRaptEllipticDecimator();
    }
    const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
    this.audioPlayerNodeIds = nodes
      .filter((node) => node?.type === "audioPlayer")
      .map((node) => String(node.id || ""))
      .filter(Boolean);
    const ids = new Set(nodes.map((node) => node.id));
    this.nodes = new Map(nodes.map((node) => [node.id, {
      id: node.id,
      // Bypassed modules keep wiring but evaluate via bypassSpec (pass / avg / silence).
      bypassSpec: node.bypassSpec && typeof node.bypassSpec === "object" ? node.bypassSpec : null,
      bypassed: Boolean(node.bypassed),
      codeblock: this.normalizeCodeblock(node.codeblock),
      // Phosphillator open-path samples (packed float64 XY). Plan builder puts
      // drawnPath on runtime nodes; without this copy the worklet always saw
      // an empty path and output silence (engine still ran).
      drawnPath: node.drawnPath || null,
      graph: node.graph || null,
      moduleGroup: node.moduleGroup || null,
      moduleGroupPlan: node.moduleGroupPlan || null,
      paramMeta: node.paramMeta || {},
      params: node.params || {},
      sample: node.sample || null,
      samplePhase: Number.isFinite(Number(node.samplePhase)) ? Number(node.samplePhase) : null,
      samplePhaseSeek: Number.isFinite(Number(node.samplePhaseSeek))
        ? Math.max(0, Math.round(Number(node.samplePhaseSeek)) || 0)
        : 0,
      type: node.type,
    }]));
    this.samples = new Map((Array.isArray(plan?.samples) ? plan.samples : []).map((sample) => [
      String(sample?.id || ""),
      {
        ...sample,
        channelData: (Array.isArray(sample?.channelData) ? sample.channelData : []).map((channel) =>
          channel instanceof Float32Array ? channel : new Float32Array(channel || [])),
        samples: sample?.samples instanceof Float32Array ? sample.samples : new Float32Array(sample?.samples || []),
      },
    ]).filter(([id]) => id));
    this.order = Array.isArray(plan?.order) ? [...plan.order] : [...ids];
    this.outputNode = plan?.outputNode || "output";
    this.scopeCaptureNodeIds = Array.isArray(plan?.scopeCaptureNodeIds)
      ? plan.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean)
      : [];
    this.scopeCaptureRates = plan?.scopeCaptureRates && typeof plan.scopeCaptureRates === "object"
      ? { ...plan.scopeCaptureRates }
      : Object.create(null);
    this.visualSinks = (Array.isArray(plan?.visualSinks) ? plan.visualSinks : []).map((sink) => ({
      ...sink,
      bufferedInputs: Array.isArray(sink?.bufferedInputs) ? [...sink.bufferedInputs] : [],
      inputs: (Array.isArray(sink?.inputs) ? sink.inputs : []).map((input) => ({ ...input })),
    }));
    this.syncVisualInputBuffers();
    const newInputConnections = this.buildInputConnectionMap(plan?.connections, ids);
    this.inputConnections = newInputConnections;
    this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
    this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
    this.resetVisualControls();

    for (const id of ids) {
      if (!this.nodeOutputs.has(id)) {
        this.nodeOutputs.set(id, 0);
      }
      const node = this.nodes.get(id);
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.phases.has(id)) {
        this.phases.set(id, 0);
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.oscResetStates.has(id)) {
        this.oscResetStates.set(id, this.createOscResetState());
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.triangleStates.has(id)) {
        this.triangleStates.set(id, 0);
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.noiseSeeds.has(id)) {
        this.noiseSeeds.set(id, this.stableSeed(id));
      }
      if (node?.type === "spiral" && !this.spiralStates.has(id)) {
        this.spiralStates.set(id, this.createSpiralState());
      }
      if (node?.type === "fractalSpiral" && !this.fractalSpiralStates.has(id)) {
        this.fractalSpiralStates.set(id, this.createFractalSpiralState());
      }
      if (node?.type === "logSpiral" && !this.logSpiralStates.has(id)) {
        this.logSpiralStates.set(id, this.createLogSpiralState());
      }
      if (node?.type === "lorenzAttractor" && !this.lorenzAttractorStates.has(id)) {
        this.lorenzAttractorStates.set(id, this.createLorenzAttractorState());
      }
      if (node?.type === "logisticMap" && !this.logisticMapStates.has(id)) {
        this.logisticMapStates.set(id, this.createLogisticMapState());
      }
      if (node?.type === "robinSinusoid" && !this.robinSinusoidStates.has(id)) {
        this.robinSinusoidStates.set(id, this.createRobinSinusoidState());
      }
      if (node?.type === "henonMap" && !this.henonMapStates.has(id)) {
        this.henonMapStates.set(id, this.createHenonMapState());
      }
      if (node?.type === "rayBouncer" && !this.rayBouncerStates.has(id)) {
        this.rayBouncerStates.set(id, this.createRayBouncerState());
      }
      if (node?.type === "chuaAttractor" && !this.chuaAttractorStates.has(id)) {
        this.chuaAttractorStates.set(id, this.createChuaAttractorState());
      }
      if (node?.type === "wirdoSpiral" && !this.wirdoSpiralStates.has(id)) {
        this.wirdoSpiralStates.set(id, this.createWirdoSpiralState());
      }
      if (node?.type === "blubb" && !this.blubbStates.has(id)) {
        this.blubbStates.set(id, this.createBlubbState());
      }
      if (node?.type === "mushroom" && !this.mushroomStates.has(id)) {
        this.mushroomStates.set(id, this.createMushroomState());
      }
      if (node?.type === "boing" && !this.boingStates.has(id)) {
        this.boingStates.set(id, this.createBoingState());
      }
      if (node?.type === "torus" && !this.torusStates.has(id)) {
        this.torusStates.set(id, this.createTorusState());
      }
      if (node?.type === "keplerBouwkamp" && !this.keplerBouwkampStates.has(id)) {
        this.keplerBouwkampStates.set(id, this.createKeplerBouwkampState());
      }
      if (node?.type === "nyquistShannon" && !this.nyquistShannonStates.has(id)) {
        this.nyquistShannonStates.set(id, this.createNyquistShannonState());
      }
      if (node?.type === "radar" && !this.radarStates.has(id)) {
        this.radarStates.set(id, this.createRadarState());
      }
      if (node?.type === "chordMemory" && !this.chordMemoryStates.has(id)) {
        this.chordMemoryStates.set(id, this.createChordMemoryState());
      }
      if (node?.type === "turingMachine" && !this.turingMachineStates.has(id)) {
        this.turingMachineStates.set(id, this.createTuringMachineState());
      }
      if (node?.type === "pitchQuantizer" && !this.pitchQuantizerStates.has(id)) {
        this.pitchQuantizerStates.set(id, this.createPitchQuantizerState());
      }
      if (node?.type === "chordSequencer" && !this.chordSequencerStates.has(id)) {
        this.chordSequencerStates.set(id, this.createChordSequencerState());
      }
      if (node?.type === "chordPad" && !this.chordPadStates.has(id)) {
        this.chordPadStates.set(id, this.createChordPadState());
      }
      if (node?.type === "lutCell" && !this.lutCellStates.has(id)) {
        this.lutCellStates.set(id, this.createLutCellState());
      }
      if (node?.type === "surgeOscillator" && !this.surgeOscillatorStates.has(id)) {
        this.surgeOscillatorStates.set(id, this.createSurgeOscillatorState());
      }
      if (node?.type === "softwaveOsc" && !this.softwaveOscStates.has(id)) {
        this.softwaveOscStates.set(id, this.createSoftwaveOscillatorState());
      }
      if (node?.type === "curveOsc" && !this.curveOscStates?.has(id)) {
        if (!this.curveOscStates) this.curveOscStates = new Map();
        this.curveOscStates.set(id, this.createCurveOscState());
      }
      if (node?.type === "snowflake" && !this.snowflakeStates?.has(id)) {
        if (!this.snowflakeStates) this.snowflakeStates = new Map();
        this.snowflakeStates.set(id, this.createSnowflakeState());
      }
      if (node?.type === "dsfOscillator" && !this.dsfOscillatorStates.has(id)) {
        this.dsfOscillatorStates.set(id, this.createDsfOscillatorState());
      }
      if (node?.type === "robinSupersaw" && !this.robinSupersawStates.has(id)) {
        this.robinSupersawStates.set(id, this.createRobinSupersawState());
      }
      if (node?.type === "hypersaw" && !this.hypersawStates.has(id)) {
        this.hypersawStates.set(id, this.createHypersawState());
      }
      if (node?.type === "videoscope" && !this.videoscopeStates.has(id)) {
        this.videoscopeStates.set(id, this.createVideoscopeState());
      }
      if (node?.type === "spectrogram" && !this.spectrogramStates.has(id)) {
        this.spectrogramStates.set(id, this.createSpectrogramState());
      }
      if (node?.type === "passiveFilter" && !this.passiveFilterStates.has(id)) {
        this.passiveFilterStates.set(id, this.createStereoFilterState(() => this.createPassiveFilterState()));
      }
      if (node?.type === "papoulisFilter" && !this.papoulisFilterStates.has(id)) {
        this.papoulisFilterStates.set(id, this.createPapoulisFilterState());
      }
      if (node?.type === "phosphillator" && !this.phosphillatorPlaybackStates.has(id)) {
        this.phosphillatorPlaybackStates.set(id, this.createPhosphillatorPlaybackState());
      }
      if (node?.type === "cookbookFilter" && !this.cookbookFilterStates.has(id)) {
        this.cookbookFilterStates.set(id, this.createStereoFilterState(() => this.createCookbookFilterState()));
      }
      if (node?.type === "ladderFilter" && !this.ladderFilterStates.has(id)) {
        this.ladderFilterStates.set(id, this.createStereoFilterState(() => this.createLadderFilterState()));
      }
      if (node?.type === "flowerChildFilter" && !this.flowerChildFilterStates.has(id)) {
        this.flowerChildFilterStates.set(id, this.createStereoFilterState(() => this.createFlowerChildFilterState()));
      }
      if (node?.type === "activeFilter" && !this.activeFilterStates.has(id)) {
        this.activeFilterStates.set(id, this.createStereoActiveFilterState());
      }
      for (const sci of ["butterworth", "linkwitzRiley", "bessel", "chebyshev", "elliptic"]) {
        const mapName = `${sci}States`;
        if (!this[mapName]) this[mapName] = new Map();
        if (node?.type === sci && !this[mapName].has(id)) {
          this[mapName].set(id, this.createStereoScientificIirState());
        }
      }
      if (!this.bandpassStates) this.bandpassStates = new Map();
      if (node?.type === "bandpass" && !this.bandpassStates.has(id)) {
        this.bandpassStates.set(id, this.createStereoBandpassState());
      }
      if (!this.allpassStates) this.allpassStates = new Map();
      if (node?.type === "allpass" && !this.allpassStates.has(id)) {
        this.allpassStates.set(id, this.createStereoAllpassState());
      }
      for (let n = 2; n <= 6; n += 1) {
        const ctype = `crossover${n}`;
        const mapName = `${ctype}States`;
        if (!this[mapName]) this[mapName] = new Map();
        if (node?.type === ctype && !this[mapName].has(id)) {
          this[mapName].set(id, this.createCrossoverStereoState(n));
        }
      }
      if (!this.modeResonatorStates) this.modeResonatorStates = new Map();
      if (node?.type === "modeResonator" && !this.modeResonatorStates.has(id)) {
        this.modeResonatorStates.set(id, this.createModeResonatorState());
      }
      if (!this.combResonatorStates) this.combResonatorStates = new Map();
      if (node?.type === "combResonator" && !this.combResonatorStates.has(id)) {
        this.combResonatorStates.set(id, this.createCombResonatorState());
      }
      if (!this.waveguideStates) this.waveguideStates = new Map();
      if (node?.type === "waveguide" && !this.waveguideStates.has(id)) {
        this.waveguideStates.set(id, this.createWaveguideState());
      }
      if (!this.phaseDisperseStates) this.phaseDisperseStates = new Map();
      if (node?.type === "phaseDisperse" && !this.phaseDisperseStates.has(id)) {
        this.phaseDisperseStates.set(id, this.createPhaseDisperseState());
      }
      if (!this.bodeStates) this.bodeStates = new Map();
      if (node?.type === "bode" && !this.bodeStates.has(id)) {
        this.bodeStates.set(id, this.createBodeState());
      }
      if (!this.stftBlurStates) this.stftBlurStates = new Map();
      if (node?.type === "stftBlur" && !this.stftBlurStates.has(id)) {
        this.stftBlurStates.set(id, this.createStftBlurState(2048));
      }
      if (!this.softpopOscillatorStates) this.softpopOscillatorStates = new Map();
      if (node?.type === "softpopOscillator" && !this.softpopOscillatorStates.has(id)) {
        this.softpopOscillatorStates.set(id, this.createSoftpopOscillatorState());
      }
      if (!this.sinepulseStates) this.sinepulseStates = new Map();
      if (node?.type === "sinepulse" && !this.sinepulseStates.has(id)) {
        this.sinepulseStates.set(id, this.createSinepulseState());
      }
      if (!this.kickEnvelopeStates) this.kickEnvelopeStates = new Map();
      if (node?.type === "kickEnvelope" && !this.kickEnvelopeStates.has(id)) {
        this.kickEnvelopeStates.set(id, this.createKickEnvelopeState());
      }
      if (!this.sineKickStates) this.sineKickStates = new Map();
      if (node?.type === "sineKick" && !this.sineKickStates.has(id)) {
        this.sineKickStates.set(id, this.createSineKickState());
      }
      if (node?.type === "yellowjacketFilter" && !this.yellowjacketFilterStates.has(id)) {
        this.yellowjacketFilterStates.set(id, this.createStereoFilterState(() => this.createYellowjacketFilterState()));
      }
      if (node?.type === "superloveFilter" && !this.superloveFilterStates.has(id)) {
        this.superloveFilterStates.set(id, this.createStereoFilterState(() => this.createSuperloveFilterState()));
      }
      if (node?.type === "chaoticPhaseLockingFilter" && !this.chaoticPhaseLockingFilterStates.has(id)) {
        this.chaoticPhaseLockingFilterStates.set(id, this.createStereoFilterState(() => this.createChaoticPhaseLockingFilterState()));
      }
      if (node?.type === "resonatorFilter" && !this.resonatorFilterStates.has(id)) {
        this.resonatorFilterStates.set(id, this.createStereoFilterState(() => this.createResonatorFilterState()));
      }
      if (node?.type === "humanFilter" && !this.humanFilterStates.has(id)) {
        this.humanFilterStates.set(id, this.createStereoFilterState(() => this.createHumanFilterState()));
      }
      if (node?.type === "pulseExplosion" && !this.pulseExplosionStates.has(id)) {
        this.pulseExplosionStates.set(id, this.createPulseExplosionState());
      }
      if (node?.type === "comparator" && !this.comparatorStates.has(id)) {
        this.comparatorStates.set(id, this.createComparatorState());
      }
      if (node?.type === "noiseDetector" && !this.noiseDetectorStates.has(id)) {
        this.noiseDetectorStates.set(id, this.createNoiseDetectorState());
      }
      if (node?.type === "speedColorInertia" && !this.speedColorInertiaStates.has(id)) {
        this.speedColorInertiaStates.set(id, this.createSpeedColorInertiaState());
      }
      if (node?.type === "inertialFilter" && !this.inertialFilterStates.has(id)) {
        this.inertialFilterStates.set(id, this.createStereoInertialFilterState());
      }
      if (node?.type === "tiltFilter" && !this.tiltFilterStates.has(id)) {
        this.tiltFilterStates.set(id, this.createStereoTiltFilterState());
      }
      if (node?.type === "eqFilter" && !this.eqFilterStates.has(id)) {
        this.eqFilterStates.set(id, this.createStereoEqFilterState());
      }
      if (node?.type === "sampleDelay" && !this.sampleDelayStates.has(id)) {
        this.sampleDelayStates.set(id, this.createSampleDelayState());
      }
      if (node?.type === "aliasSine" && !this.aliasSineStates.has(id)) {
        this.aliasSineStates.set(id, this.createAliasSineState());
      }
      if (node?.type === "tb303Filter" && !this.tb303FilterStates.has(id)) {
        this.tb303FilterStates.set(id, this.createStereoFilterState(() => this.createTb303FilterState()));
      }
      if (node?.type === "clock" && !this.clockStates.has(id)) {
        this.clockStates.set(id, this.createClockState());
      }
      if ((node?.type === "graph2" || node?.type === "graphCopy") && !this.graphLfoStates.has(id)) {
        this.graphLfoStates.set(id, this.createGraphLfoState());
      }
      if (node?.type === "clockDivider" && !this.clockDividerStates.has(id)) {
        this.clockDividerStates.set(id, this.createTriggerDividerState());
      }
      if (node?.type === "delayedTrigger" && !this.delayedTriggerStates.has(id)) {
        this.delayedTriggerStates.set(id, this.createDelayedTriggerState());
      }
      if (node?.type === "delayEffect" && !this.delayEffectStates.has(id)) {
        this.delayEffectStates.set(id, this.createStereoDelayEffectState());
      }
      if (node?.type === "pingPongDelay" && !this.pingPongDelayStates.has(id)) {
        this.pingPongDelayStates.set(id, this.createPingPongDelayState());
      }
      if (node?.type === "wallDelay" && !this.wallDelayStates.has(id)) {
        this.wallDelayStates.set(id, this.createWallDelayState());
      }
      if (node?.type === "reverbEffect" && !this.reverbEffectStates.has(id)) {
        this.reverbEffectStates.set(id, this.createSabrinaReverbState());
      }
      if (node?.type === "soemReverb" && !this.soemReverbStates.has(id)) {
        this.soemReverbStates.set(id, this.createSoemReverbState());
      }
      if (node?.type === "pll" && !this.pllStates.has(id)) {
        this.pllStates.set(id, this.createPllState());
      }
      if (node?.type === "helmholtzPitch" && !this.helmholtzStates.has(id)) {
        this.helmholtzStates.set(id, this.createHelmholtzState());
      }
      if (node?.type === "randomClock" && !this.randomClockStates.has(id)) {
        this.randomClockStates.set(id, this.createRandomClockState());
      }
      if (node?.type === "sampleHold" && !this.sampleHoldStates.has(id)) {
        this.sampleHoldStates.set(id, this.createStereoSampleHoldState());
      }
      if ((node?.type === "samplePlayer" || node?.type === "sampleLooper" || node?.type === "audioPlayer") && !this.samplePlaybackStates.has(id)) {
        this.samplePlaybackStates.set(id, this.createSamplePlaybackState());
      }
      if ((node?.type === "nextPatch" || node?.type === "previousPatch") && !this.patchCommandStates.has(id)) {
        this.patchCommandStates.set(id, this.createPatchCommandState());
      }
      if (node?.type === "slewLimiter" && !this.slewLimiterStates.has(id)) {
        this.slewLimiterStates.set(id, this.createStereoSlewLimiterState());
      }
      if (node?.type === "speakerProtector2" && !this.speakerProtector2States.has(id)) {
        if (!this.speakerProtector2States) this.speakerProtector2States = new Map();
        this.speakerProtector2States.set(id, this.createSpeakerProtector2State());
      }
      if (node?.type === "expAdsr" && !this.expAdsrStates.has(id)) {
        this.expAdsrStates.set(id, this.createExpAdsrState());
      }
      if (!this.attackDecayStates) this.attackDecayStates = new Map();
      if (node?.type === "attackDecay" && !this.attackDecayStates.has(id)) {
        this.attackDecayStates.set(id, this.createAttackDecayState());
      }
      if (node?.type === "linearEnvelope" && !this.linearEnvelopeStates.has(id)) {
        this.linearEnvelopeStates.set(id, this.createLinearEnvelopeState());
      }
      if (node?.type === "noiseGenerator" && !this.noiseGeneratorStates.has(id)) {
        this.noiseGeneratorStates.set(id, this.createNoiseGeneratorState());
      }
      if (node?.type === "randomWalk" && !this.randomWalkStates.has(id)) {
        this.randomWalkStates.set(id, this.createRandomWalkState());
      }
      if (node?.type === "piSpigotNoise" && !this.piSpigotNoiseStates.has(id)) {
        this.piSpigotNoiseStates.set(id, this.createPiSpigotNoiseState());
      }
      if (node?.type === "bradley2a" && !this.bradley2AStates.has(id)) {
        this.bradley2AStates.set(id, this.createBradley2AState());
      }
      if (node?.type === "antisaw" && !this.antisawStates.has(id)) {
        this.antisawStates.set(id, this.createAntisawState());
      }
      if (node?.type === "fractalBrownianNoise" && !this.fractalBrownianNoiseStates.has(id)) {
        this.fractalBrownianNoiseStates.set(id, this.createFractalBrownianNoiseState());
      }
      if (node?.type === "fbmField" && !this.fbmFieldStates.has(id)) {
        this.fbmFieldStates.set(id, this.createFbmFieldState());
      }
      if (node?.type === "rgbFractal" && !this.rgbFractalStates.has(id)) {
        this.rgbFractalStates.set(id, this.createRgbFractalState());
      }
      if (
        node?.type === "flowerChildEnvelopeFollower" &&
        !this.flowerChildEnvelopeFollowerStates.has(id)
      ) {
        this.flowerChildEnvelopeFollowerStates.set(id, this.createFlowerChildEnvelopeFollowerState());
      }
      if (node?.type === "pluckEnvelope" && !this.pluckEnvelopeStates.has(id)) {
        this.pluckEnvelopeStates.set(id, this.createPluckEnvelopeState());
      }
      if (node?.type === "stepSequencer" && !this.stepSequencerStates.has(id)) {
        this.stepSequencerStates.set(id, this.createStepSequencerState());
      }
      if (node?.type === "stepGrid" && !this.stepGridStates.has(id)) {
        this.stepGridStates.set(id, this.createStepGridState());
      }
      if (node?.type === "triggerCounter" && !this.triggerCounterStates.has(id)) {
        this.triggerCounterStates.set(id, this.createTriggerCounterState());
      }
      if (node?.type === "triggerDivider" && !this.triggerDividerStates.has(id)) {
        this.triggerDividerStates.set(id, this.createTriggerDividerState());
      }
      if ((node?.type === "vactrolEnvelopeSeries" || node?.type === "vactrolEnvelopeCustom") && !this.vactrolEnvelopeStates.has(id)) {
        this.vactrolEnvelopeStates.set(id, this.createVactrolEnvelopeState());
      }
      if (node?.type === "bugButton" && !this.bugButtonStates.has(id)) {
        this.bugButtonStates.set(id, this.createBugButtonState());
      }
      if (node?.type === "keypad" && !this.keypadStates.has(id)) {
        this.keypadStates.set(id, this.createKeypadState());
      }
      if (node?.type === "phoneTone" && !this.phoneToneStates.has(id)) {
        this.phoneToneStates.set(id, this.createPhoneToneState());
      }
      if (node?.type === "polyBlep" && !this.polyBlepStates.has(id)) {
        this.polyBlepStates.set(id, this.createPolyBlepState());
      }
      if (node?.type === "blit" && !this.blitStates.has(id)) {
        this.blitStates.set(id, this.createBlitState());
      }
      if (node?.type === "archimedes" && !this.archimedesStates.has(id)) {
        this.archimedesStates.set(id, this.createArchimedesState());
      }
      if (node?.type === "moduleGroup" && node.moduleGroupPlan && !this.moduleGroupRuntimes.has(id)) {
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

    for (const id of [...this.phases.keys()]) {
      if (!ids.has(id)) {
        this.phases.delete(id);
      }
    }
    for (const id of [...this.oscResetStates.keys()]) {
      if (!ids.has(id)) {
        this.oscResetStates.delete(id);
      }
    }
    for (const id of [...this.graphLfoStates.keys()]) {
      if (!ids.has(id)) {
        this.graphLfoStates.delete(id);
      }
    }
    for (const id of [...this.triangleStates.keys()]) {
      if (!ids.has(id)) {
        this.triangleStates.delete(id);
      }
    }
    for (const id of [...this.oscillatorLastPhaseIncrements.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.oscillatorLastPhaseIncrements.delete(id);
      }
    }
    for (const id of [...this.oscillatorStoppedSamples.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.oscillatorStoppedSamples.delete(id);
      }
    }
    for (const id of [...this.noiseSeeds.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.noiseSeeds.delete(id);
      }
    }
    for (const id of [...this.basicOscillatorNativeHandles.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        const handle = this.basicOscillatorNativeHandles.get(id);
        if (handle && this.nativeBasicOscillator?.soemdsp_basic_oscillator_destroy) {
          this.nativeBasicOscillator.soemdsp_basic_oscillator_destroy(handle);
        }
        this.basicOscillatorNativeHandles.delete(id);
      }
    }
    for (const id of [...this.noiseSeedKeys.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.noiseSeedKeys.delete(id);
      }
    }
    for (const id of [...this.nodeOutputs.keys()]) {
      if (!ids.has(id)) {
        this.nodeOutputs.delete(id);
      }
    }
    for (const id of [...this.fractalSpiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFractalSpiralNativeState(this.fractalSpiralStates.get(id));
        this.fractalSpiralStates.delete(id);
      }
    }
    for (const id of [...this.logSpiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLogSpiralNativeState(this.logSpiralStates.get(id));
        this.logSpiralStates.delete(id);
      }
    }
    for (const id of [...this.spiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyJerobeamSpiralNativeState(this.spiralStates.get(id));
        this.spiralStates.delete(id);
      }
    }
    for (const id of [...this.lorenzAttractorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLorenzAttractorNativeState(this.lorenzAttractorStates.get(id));
        this.lorenzAttractorStates.delete(id);
      }
    }
    for (const id of [...this.logisticMapStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLogisticMapNativeState(this.logisticMapStates.get(id));
        this.logisticMapStates.delete(id);
      }
    }
    for (const id of [...this.henonMapStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHenonMapNativeState(this.henonMapStates.get(id));
        this.henonMapStates.delete(id);
      }
    }
    for (const id of [...this.rayBouncerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRayBouncerNativeState(this.rayBouncerStates.get(id));
        this.rayBouncerStates.delete(id);
      }
    }
    for (const id of [...this.chuaAttractorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyChuaAttractorNativeState(this.chuaAttractorStates.get(id));
        this.chuaAttractorStates.delete(id);
      }
    }
    for (const id of [...this.wirdoSpiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyWirdoSpiralNativeState(this.wirdoSpiralStates.get(id));
        this.wirdoSpiralStates.delete(id);
      }
    }
    for (const id of [...this.blubbStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBlubbNativeState(this.blubbStates.get(id));
        this.blubbStates.delete(id);
      }
    }
    for (const id of [...this.mushroomStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyMushroomNativeState(this.mushroomStates.get(id));
        this.mushroomStates.delete(id);
      }
    }
    for (const id of [...this.boingStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBoingNativeState(this.boingStates.get(id));
        this.boingStates.delete(id);
      }
    }
    for (const id of [...this.torusStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTorusNativeState(this.torusStates.get(id));
        this.torusStates.delete(id);
      }
    }
    for (const id of [...this.keplerBouwkampStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyKeplerBouwkampNativeState(this.keplerBouwkampStates.get(id));
        this.keplerBouwkampStates.delete(id);
      }
    }
    for (const id of [...this.nyquistShannonStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyNyquistShannonNativeState(this.nyquistShannonStates.get(id));
        this.nyquistShannonStates.delete(id);
      }
    }
    for (const id of [...this.radarStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRadarNativeState(this.radarStates.get(id));
        this.radarStates.delete(id);
      }
    }
    for (const id of [...this.chordMemoryStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyChordMemoryNativeState(this.chordMemoryStates.get(id));
        this.chordMemoryStates.delete(id);
      }
    }
    for (const id of [...this.turingMachineStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTuringMachineNativeState(this.turingMachineStates.get(id));
        this.turingMachineStates.delete(id);
      }
    }
    for (const id of [...this.pitchQuantizerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPitchQuantizerNativeState(this.pitchQuantizerStates.get(id));
        this.pitchQuantizerStates.delete(id);
      }
    }
    for (const id of [...this.chordSequencerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyChordSequencerNativeState(this.chordSequencerStates.get(id));
        this.chordSequencerStates.delete(id);
      }
    }
    if (this.chordPadStates) {
      for (const id of [...this.chordPadStates.keys()]) {
        if (!ids.has(id)) {
          this.chordPadStates.delete(id);
        }
      }
    }
    for (const id of [...this.lutCellStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLutCellNativeState(this.lutCellStates.get(id));
        this.lutCellStates.delete(id);
      }
    }
    for (const id of [...this.surgeOscillatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySurgeOscillatorNativeState(this.surgeOscillatorStates.get(id));
        this.surgeOscillatorStates.delete(id);
      }
    }
    if (this.softwaveOscStates) {
      for (const id of [...this.softwaveOscStates.keys()]) {
        if (!ids.has(id)) {
          this.softwaveOscStates.delete(id);
        }
      }
    }
    if (this.curveOscStates) {
      for (const id of [...this.curveOscStates.keys()]) {
        if (!ids.has(id)) {
          this.curveOscStates.delete(id);
        }
      }
    }
    if (this.snowflakeStates) {
      for (const id of [...this.snowflakeStates.keys()]) {
        if (!ids.has(id)) {
          this.destroySnowflakeNativeState?.(this.snowflakeStates.get(id));
          this.snowflakeStates.delete(id);
        }
      }
    }
    for (const id of [...this.dsfOscillatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyDsfOscillatorNativeState(this.dsfOscillatorStates.get(id));
        this.dsfOscillatorStates.delete(id);
      }
    }
    for (const id of [...this.robinSupersawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRobinSupersawNativeState(this.robinSupersawStates.get(id));
        this.robinSupersawStates.delete(id);
      }
    }
    for (const id of [...this.hypersawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHypersawNativeState(this.hypersawStates.get(id));
        this.hypersawStates.delete(id);
      }
    }
    for (const id of [...this.videoscopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyVideoscopeNativeState(this.videoscopeStates.get(id));
        this.videoscopeStates.delete(id);
      }
    }
    for (const id of [...this.passiveFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.passiveFilterStates.get(id), (s) => this.destroyPassiveFilterNativeState(s));
        this.passiveFilterStates.delete(id);
      }
    }
    for (const id of [...this.papoulisFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPapoulisFilterNativeState(this.papoulisFilterStates.get(id));
        this.papoulisFilterStates.delete(id);
      }
    }
    if (this.xyPadFilterStates instanceof Map) {
      for (const id of [...this.xyPadFilterStates.keys()]) {
        if (!ids.has(id)) {
          const pair = this.xyPadFilterStates.get(id);
          this.destroyPapoulisFilterNativeState?.(pair?.x);
          this.destroyPapoulisFilterNativeState?.(pair?.y);
          this.xyPadFilterStates.delete(id);
        }
      }
    }
    for (const id of [...this.phosphillatorPlaybackStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPhosphillatorNativeState(this.phosphillatorPlaybackStates.get(id));
        this.phosphillatorPlaybackStates.delete(id);
        this.phosphillatorDecodedPathCache.delete(id);
      }
    }
    for (const id of [...this.linearEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLinearEnvelopeNativeState(this.linearEnvelopeStates.get(id));
        this.linearEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.sineWavetableStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySineWavetableNativeState(this.sineWavetableStates.get(id));
        this.sineWavetableStates.delete(id);
      }
    }
    for (const id of [...this.clockStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyClockNativeState(this.clockStates.get(id));
        this.clockStates.delete(id);
      }
    }
    for (const id of [...this.codeblockFunctions.keys()]) {
      if (!ids.has(id)) {
        this.codeblockFunctions.delete(id);
      }
    }
    for (const id of [...this.cookbookFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.cookbookFilterStates.delete(id);
      }
    }
    for (const id of [...this.ladderFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.ladderFilterStates.get(id), (s) => this.destroyLadderFilterNativeState(s));
        this.ladderFilterStates.delete(id);
      }
    }
    for (const id of [...this.flowerChildFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.flowerChildFilterStates.get(id), (s) => this.destroyFlowerChildFilterNativeState(s));
        this.flowerChildFilterStates.delete(id);
      }
    }
    if (this.activeFilterStates) {
      for (const id of [...this.activeFilterStates.keys()]) {
        if (!ids.has(id)) {
          this.destroyStereoFilterNativeState(this.activeFilterStates.get(id), (s) => this.destroyActiveFilterNativeState(s));
          this.activeFilterStates.delete(id);
        }
      }
    }
    for (const sci of ["butterworth", "linkwitzRiley", "bessel", "chebyshev", "elliptic"]) {
      const map = this[`${sci}States`];
      if (!map) continue;
      for (const id of [...map.keys()]) {
        if (!ids.has(id)) {
          this.destroyStereoFilterNativeState(map.get(id), (s) => this.destroyScientificIirNativeState?.(sci, s));
          map.delete(id);
        }
      }
    }
    if (this.bandpassStates) {
      for (const id of [...this.bandpassStates.keys()]) {
        if (!ids.has(id)) this.bandpassStates.delete(id);
      }
    }
    if (this.allpassStates) {
      for (const id of [...this.allpassStates.keys()]) {
        if (!ids.has(id)) this.allpassStates.delete(id);
      }
    }
    for (let n = 2; n <= 6; n += 1) {
      const map = this[`crossover${n}States`];
      if (!map) continue;
      for (const id of [...map.keys()]) {
        if (!ids.has(id)) map.delete(id);
      }
    }
    if (this.modeResonatorStates) {
      for (const id of [...this.modeResonatorStates.keys()]) {
        if (!ids.has(id)) this.modeResonatorStates.delete(id);
      }
    }
    if (this.combResonatorStates) {
      for (const id of [...this.combResonatorStates.keys()]) {
        if (!ids.has(id)) this.combResonatorStates.delete(id);
      }
    }
    if (this.waveguideStates) {
      for (const id of [...this.waveguideStates.keys()]) {
        if (!ids.has(id)) this.waveguideStates.delete(id);
      }
    }
    if (this.phaseDisperseStates) {
      for (const id of [...this.phaseDisperseStates.keys()]) {
        if (!ids.has(id)) this.phaseDisperseStates.delete(id);
      }
    }
    if (this.bodeStates) {
      for (const id of [...this.bodeStates.keys()]) {
        if (!ids.has(id)) this.bodeStates.delete(id);
      }
    }
    if (this.stftBlurStates) {
      for (const id of [...this.stftBlurStates.keys()]) {
        if (!ids.has(id)) this.stftBlurStates.delete(id);
      }
    }
    if (this.softpopOscillatorStates) {
      for (const id of [...this.softpopOscillatorStates.keys()]) {
        if (!ids.has(id)) this.softpopOscillatorStates.delete(id);
      }
    }
    if (this.sinepulseStates) {
      for (const id of [...this.sinepulseStates.keys()]) {
        if (!ids.has(id)) this.sinepulseStates.delete(id);
      }
    }
    if (this.kickEnvelopeStates) {
      for (const id of [...this.kickEnvelopeStates.keys()]) {
        if (!ids.has(id)) this.kickEnvelopeStates.delete(id);
      }
    }
    if (this.sineKickStates) {
      for (const id of [...this.sineKickStates.keys()]) {
        if (!ids.has(id)) this.sineKickStates.delete(id);
      }
    }
    for (const id of [...this.yellowjacketFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.yellowjacketFilterStates.get(id), (s) => this.destroyYellowjacketFilterNativeState(s));
        this.yellowjacketFilterStates.delete(id);
      }
    }
    for (const id of [...this.superloveFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.superloveFilterStates.get(id), (s) => this.destroySuperloveFilterNativeState(s));
        this.superloveFilterStates.delete(id);
      }
    }
    for (const id of [...this.chaoticPhaseLockingFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.chaoticPhaseLockingFilterStates.get(id), (s) => this.destroyChaoticPhaseLockingFilterNativeState(s));
        this.chaoticPhaseLockingFilterStates.delete(id);
      }
    }
    for (const id of [...this.resonatorFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.resonatorFilterStates.get(id), (s) => this.destroyResonatorFilterNativeState(s));
        this.resonatorFilterStates.delete(id);
      }
    }
    for (const id of [...this.humanFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.humanFilterStates.get(id), (s) => this.destroyHumanFilterNativeState(s));
        this.humanFilterStates.delete(id);
      }
    }
    for (const id of [...this.pulseExplosionStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPulseExplosionNativeState(this.pulseExplosionStates.get(id));
        this.pulseExplosionStates.delete(id);
      }
    }
    for (const id of [...this.comparatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyComparatorNativeState(this.comparatorStates.get(id));
        this.comparatorStates.delete(id);
      }
    }
    if (this.noiseDetectorStates) {
      for (const id of [...this.noiseDetectorStates.keys()]) {
        if (!ids.has(id)) {
          this.noiseDetectorStates.delete(id);
        }
      }
    }
    if (this.speedColorInertiaStates) {
      for (const id of [...this.speedColorInertiaStates.keys()]) {
        if (!ids.has(id)) {
          this.speedColorInertiaStates.delete(id);
        }
      }
    }
    if (this.inertialFilterStates) {
      for (const id of [...this.inertialFilterStates.keys()]) {
        if (!ids.has(id)) {
          this.inertialFilterStates.delete(id);
        }
      }
    }
    if (this.tiltFilterStates) {
      for (const id of [...this.tiltFilterStates.keys()]) {
        if (!ids.has(id)) {
          this.tiltFilterStates.delete(id);
        }
      }
    }
    if (this.eqFilterStates) {
      for (const id of [...this.eqFilterStates.keys()]) {
        if (!ids.has(id)) {
          this.eqFilterStates.delete(id);
        }
      }
    }
    for (const id of [...this.sampleDelayStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySampleDelayNativeState(this.sampleDelayStates.get(id));
        this.sampleDelayStates.delete(id);
      }
    }
    for (const id of [...this.minMaxStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyMinMaxNativeState(this.minMaxStates.get(id));
        this.minMaxStates.delete(id);
      }
    }
    for (const id of [...this.transportStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTransportNativeState(this.transportStates.get(id));
        this.transportStates.delete(id);
      }
    }
    for (const id of [...this.aliasSineStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyAliasSineNativeState(this.aliasSineStates.get(id));
        this.aliasSineStates.delete(id);
      }
    }
    for (const id of [...this.tb303FilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.tb303FilterStates.get(id), (s) => this.destroyTb303FilterNativeState(s));
        this.tb303FilterStates.delete(id);
      }
    }
    for (const id of [...this.clockDividerStates.keys()]) {
      if (!ids.has(id)) {
        this.clockDividerStates.delete(id);
      }
    }
    for (const id of [...this.delayedTriggerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyDelayedTriggerNativeState(this.delayedTriggerStates.get(id));
        this.delayedTriggerStates.delete(id);
      }
    }
    for (const id of [...this.delayEffectStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyDelayEffectNativeState(this.delayEffectStates.get(id));
        this.delayEffectStates.delete(id);
      }
    }
    for (const id of [...this.pingPongDelayStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPingPongDelayNativeState(this.pingPongDelayStates.get(id));
        this.pingPongDelayStates.delete(id);
      }
    }
    for (const id of [...this.wallDelayStates.keys()]) {
      if (!ids.has(id)) {
        this.wallDelayStates.delete(id);
      }
    }
    for (const id of [...this.reverbEffectStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySabrinaReverbState(this.reverbEffectStates.get(id));
        this.reverbEffectStates.delete(id);
      }
    }
    if (this.soemReverbStates) {
      for (const id of [...this.soemReverbStates.keys()]) {
        if (!ids.has(id)) {
          const st = this.soemReverbStates.get(id);
          if (st?.nativeHandle && this.nativeSoemReverb?.soemdsp_soem_reverb_destroy) {
            this.nativeSoemReverb.soemdsp_soem_reverb_destroy(st.nativeHandle);
          }
          this.soemReverbStates.delete(id);
        }
      }
    }
    for (const id of [...this.pllStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPllState(this.pllStates.get(id));
        this.pllStates.delete(id);
      }
    }
    for (const id of [...this.helmholtzStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHelmholtzState(this.helmholtzStates.get(id));
        this.helmholtzStates.delete(id);
      }
    }
    for (const id of [...this.sampleHoldStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.sampleHoldStates.get(id), (s) => this.destroySampleHoldNativeState(s));
        this.sampleHoldStates.delete(id);
      }
    }
    for (const id of [...this.samplePlaybackStates.keys()]) {
      if (!ids.has(id)) {
        this.samplePlaybackStates.delete(id);
      }
    }
    for (const id of [...this.patchCommandStates.keys()]) {
      if (!ids.has(id)) {
        this.patchCommandStates.delete(id);
      }
    }
    for (const id of [...this.slewLimiterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.slewLimiterStates.get(id), (s) => this.destroySlewLimiterNativeState(s));
        this.slewLimiterStates.delete(id);
      }
    }
    if (this.speakerProtector2States) {
      for (const id of [...this.speakerProtector2States.keys()]) {
        if (!ids.has(id)) {
          this.speakerProtector2States.delete(id);
        }
      }
    }
    for (const id of [...this.expAdsrStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyExpAdsrNativeState(this.expAdsrStates.get(id));
        this.expAdsrStates.delete(id);
      }
    }
    if (this.attackDecayStates) {
      for (const id of [...this.attackDecayStates.keys()]) {
        if (!ids.has(id)) this.attackDecayStates.delete(id);
      }
    }
    for (const id of [...this.noiseGeneratorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyNoiseGeneratorNativeState(this.noiseGeneratorStates.get(id));
        this.noiseGeneratorStates.delete(id);
      }
    }
    for (const id of [...this.randomWalkStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRandomWalkNativeState(this.randomWalkStates.get(id));
        this.randomWalkStates.delete(id);
      }
    }
    for (const id of [...this.piSpigotNoiseStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPiSpigotNoiseNativeState(this.piSpigotNoiseStates.get(id));
        this.piSpigotNoiseStates.delete(id);
      }
    }
    for (const id of [...this.bradley2AStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBradley2ANativeState(this.bradley2AStates.get(id));
        this.bradley2AStates.delete(id);
      }
    }
    for (const id of [...this.antisawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyAntisawNativeState(this.antisawStates.get(id));
        this.antisawStates.delete(id);
      }
    }
    for (const id of [...this.randomClockStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRandomClockNativeState(this.randomClockStates.get(id));
        this.randomClockStates.delete(id);
      }
    }
    for (const id of [...this.fractalBrownianNoiseStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFbmNativeState(this.fractalBrownianNoiseStates.get(id));
        this.fractalBrownianNoiseStates.delete(id);
      }
    }
    for (const id of [...this.fbmFieldStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFbmFieldNativeState?.(this.fbmFieldStates.get(id));
        this.fbmFieldStates.delete(id);
      }
    }
    if (this.rgbFractalStates) {
      for (const id of [...this.rgbFractalStates.keys()]) {
        if (!ids.has(id)) {
          this.rgbFractalStates.delete(id);
        }
      }
    }
    for (const id of [...this.flowerChildEnvelopeFollowerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFlowerChildEnvelopeFollowerNativeState(this.flowerChildEnvelopeFollowerStates.get(id));
        this.flowerChildEnvelopeFollowerStates.delete(id);
      }
    }
    for (const id of [...this.pluckEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPluckEnvelopeNativeState(this.pluckEnvelopeStates.get(id));
        this.pluckEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.stepSequencerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStepSequencerNativeState(this.stepSequencerStates.get(id));
        this.stepSequencerStates.delete(id);
      }
    }
    for (const id of [...this.stepGridStates.keys()]) {
      if (!ids.has(id)) {
        this.stepGridStates.delete(id);
      }
    }
    for (const id of [...this.triggerCounterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTriggerCounterNativeState(this.triggerCounterStates.get(id));
        this.triggerCounterStates.delete(id);
      }
    }
    for (const id of [...this.triggerDividerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTriggerDividerNativeState(this.triggerDividerStates.get(id));
        this.triggerDividerStates.delete(id);
      }
    }
    for (const id of [...this.vactrolEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyVactrolEnvelopeNativeState(this.vactrolEnvelopeStates.get(id));
        this.vactrolEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.impulseButtonStates.keys()]) {
      if (!ids.has(id)) {
        this.impulseButtonStates.delete(id);
      }
    }
    for (const id of [...this.bugButtonStates.keys()]) {
      if (!ids.has(id)) {
        this.bugButtonStates.delete(id);
      }
    }
    if (this.keypadStates) {
      for (const id of [...this.keypadStates.keys()]) {
        if (!ids.has(id)) {
          this.keypadStates.delete(id);
        }
      }
    }
    if (this.phoneToneStates) {
      for (const id of [...this.phoneToneStates.keys()]) {
        if (!ids.has(id)) {
          this.phoneToneStates.delete(id);
        }
      }
    }
    if (this.robinSinusoidStates) {
      for (const id of [...this.robinSinusoidStates.keys()]) {
        if (!ids.has(id)) {
          this.destroyRobinSinusoidNativeState(this.robinSinusoidStates.get(id));
          this.robinSinusoidStates.delete(id);
        }
      }
    }
    for (const id of [...this.polyBlepStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPolyBlepNativeState(this.polyBlepStates.get(id));
        this.polyBlepStates.delete(id);
      }
    }
    for (const id of [...this.blitStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBlitNativeState(this.blitStates.get(id));
        this.blitStates.delete(id);
      }
    }
    for (const id of [...this.archimedesStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyArchimedesNativeState(this.archimedesStates.get(id));
        this.archimedesStates.delete(id);
      }
    }
    for (const id of [...this.moduleGroupRuntimes.keys()]) {
      if (!ids.has(id)) {
        this.moduleGroupRuntimes.delete(id);
      }
    }
    for (const key of [...this.smoothers.keys()]) {
      const [nodeId, parameter] = key.split(".");
      if (!ids.has(nodeId) || !(parameter in (this.nodes.get(nodeId)?.params || {}))) {
        const dead = this.smoothers.get(key);
        this.deactivateSmoother(key, dead);
        this.destroyPapoulisParameterSmootherNativeState(dead);
        this.smoothers.delete(key);
      }
    }
    this.port.postMessage({
      connectionCount: Array.isArray(plan?.connections) ? plan.connections.length : 0,
      feedbackConnectionCount: Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections.length : 0,
      feedbackModulationCount: Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations.length : 0,
      feedbackModulations: (Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations : []).map(
        (modulation) =>
          `${modulation.sourceNode}.${modulation.sourcePort} -> ${modulation.destinationNode}.${modulation.destinationParam}`,
      ),
      feedbackSignals: (Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections : []).map(
        (connection) =>
          `${connection.sourceNode}.${connection.sourcePort} -> ${connection.destinationNode}.${connection.destinationPort}`,
      ),
      modulationCount: Array.isArray(plan?.modulations) ? plan.modulations.length : 0,
      engineSampleRate: this.engineSampleRate,
      nodeCount: this.nodes.size,
      order: [...this.order],
      oversamplingRatio: this.oversamplingRatio,
      patchFingerprint,
      planSerial: this.planSerial,
      sampleRate: this.hostSampleRate,
      sessionId: this.sessionId,
      speakerOutputActive: Boolean(plan?.speakerOutputActive),
      stateReadCount: (
        (Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections.length : 0) +
        (Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations.length : 0)
      ),
      type: "planApplied",
      visualSinkCount: Array.isArray(plan?.visualSinks) ? plan.visualSinks.length : 0,
      visualSinks: Array.isArray(plan?.visualSinks) ? plan.visualSinks : [],
    });
};
