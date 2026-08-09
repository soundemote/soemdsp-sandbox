// Extracted cluster of buildLiveModuleEvaluators map entries (Phase D navigation split).
// Behavior must match the prior monolith bit-for-bit.

NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators_sources = function buildLiveModuleEvaluators_sources() {
  return {
      logisticMap: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.logisticMapStates.get(nodeId) || this.createLogisticMapState();
        this.logisticMapStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return {
          Out: this.logisticMapSample(state, {
            level: read("amplitude", 1),
            r: read("r", 3.9),
            rate: read("rate", 8),
            reset: mixInput(nodeId, "Reset"),
            sampleRate: safeRate,
            seed: read("seed", 0.5),
          }),
        };
      },
      turingMachine: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.turingMachineStates.get(nodeId) || this.createTuringMachineState();
        this.turingMachineStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const hasScale = typeof hasInput === "function" ? hasInput(nodeId, "Scale") : this.inputConnections.has(this.inputKey(nodeId, "Scale"));
        const hasRoot = typeof hasInput === "function" ? hasInput(nodeId, "Root") : this.inputConnections.has(this.inputKey(nodeId, "Root"));
        return this.turingMachineSample(state, {
          clock: mixInput(nodeId, "Clock"),
          length: read("length", 8),
          level: read("amplitude", 1),
          probability: read("probability", 0.25),
          octaves: read("octaves", 1),
          reset: mixInput(nodeId, "Reset"),
          hasScaleInput: hasScale,
          scaleInput: hasScale ? mixInput(nodeId, "Scale") : 0,
          root: hasRoot ? mixInput(nodeId, "Root") : (60 / 120),
        });
      },
      henonMap: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.henonMapStates.get(nodeId) || this.createHenonMapState();
        this.henonMapStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const henon = this.henonMapSample(state, {
          a: read("a", 1.4),
          b: read("b", 0.3),
          rate: read("rate", 8),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          seedX: read("seedX", 0.1),
          seedY: read("seedY", 0.1),
        });
        const henonLevel = read("amplitude", 1);
        return {
          X: henon.x * henonLevel,
          Y: henon.y * henonLevel,
        };
      },
      rayBouncer: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.rayBouncerStates.get(nodeId) || this.createRayBouncerState();
        this.rayBouncerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const bounce = this.rayBouncerSample(state, {
          aspect: read("aspect", 1.5),
          bend: read("bend", 0),
          centerX: read("centerX", 0),
          centerY: read("centerY", 0),
          frequency: read("frequency", 8),
          launchAngle: read("launchAngle", 30),
          maxDistance: read("maxDistance", 0),
          reset: mixInput(nodeId, "Reset"),
          rotate: read("rotate", 0),
          sampleRate: safeRate,
          size: read("size", 1),
          startX: read("startX", 0),
          startY: read("startY", 0),
          xToY: read("xToY", 0),
          yToX: read("yToX", 0),
        });
        const level = read("amplitude", 1);
        return {
          X: bounce.x * level,
          Y: bounce.y * level,
        };
      },
      chuaAttractor: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.chuaAttractorStates.get(nodeId) || this.createChuaAttractorState();
        this.chuaAttractorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const chua = this.chuaAttractorSample(state, {
          alpha: read("alpha", 15.6),
          beta: read("beta", 28),
          m0: read("m0", -1.143),
          m1: read("m1", -0.714),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          speed: read("speed", 1),
        });
        const chuaLevel = read("amplitude", 1);
        return {
          X: chua.x * chuaLevel,
          Y: chua.y * chuaLevel,
          Z: chua.z * chuaLevel,
        };
      },
      chordMemory: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.chordMemoryStates.get(nodeId) || this.createChordMemoryState();
        this.chordMemoryStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.chordMemorySample(state, {
          advance: mixInput(nodeId, "Advance"),
          clear: mixInput(nodeId, "Clear"),
          latch: mixInput(nodeId, "Latch"),
          pitch: mixInput(nodeId, "Pitch"),
          walk: read("walk", 1),
          leap: read("leap", 0.15),
          mutate: read("mutate", 0.2),
          octaves: read("octaves", 0),
        });
      },
      degreeTuring: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.degreeTuringStates) this.degreeTuringStates = new Map();
        const state = this.degreeTuringStates.get(nodeId) || this.createDegreeTuringState();
        this.degreeTuringStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const hasScale = typeof hasInput === "function" ? hasInput(nodeId, "Scale") : this.inputConnections.has(this.inputKey(nodeId, "Scale"));
        const hasRoot = typeof hasInput === "function" ? hasInput(nodeId, "Root") : this.inputConnections.has(this.inputKey(nodeId, "Root"));
        return this.degreeTuringSample(state, {
          clock: mixInput(nodeId, "Clock"),
          reset: mixInput(nodeId, "Reset"),
          length: read("length", 8),
          probability: read("probability", 0.18),
          octaves: read("octaves", 1),
          level: read("amplitude", 1),
          scaleChoice: read("scale", 1),
          hasScaleInput: hasScale,
          scaleInput: hasScale ? mixInput(nodeId, "Scale") : 0,
          root: hasRoot ? mixInput(nodeId, "Root") : (60 / 120),
        });
      },
      gravityWalker: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.gravityWalkerStates) this.gravityWalkerStates = new Map();
        const state = this.gravityWalkerStates.get(nodeId) || this.createGravityWalkerState();
        this.gravityWalkerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const hasScale = typeof hasInput === "function" ? hasInput(nodeId, "Scale") : this.inputConnections.has(this.inputKey(nodeId, "Scale"));
        const hasRoot = typeof hasInput === "function" ? hasInput(nodeId, "Root") : this.inputConnections.has(this.inputKey(nodeId, "Root"));
        return this.gravityWalkerSample(state, {
          clock: mixInput(nodeId, "Clock"),
          reset: mixInput(nodeId, "Reset"),
          leap: read("leap", 0.15),
          leapCv: mixInput(nodeId, "Leap"),
          gravity: read("gravity", 0.65),
          octaves: read("octaves", 1),
          level: read("amplitude", 1),
          scaleChoice: read("scale", 1),
          hasScaleInput: hasScale,
          scaleInput: hasScale ? mixInput(nodeId, "Scale") : 0,
          root: hasRoot ? mixInput(nodeId, "Root") : (60 / 120),
        });
      },
      degreePhrase: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.degreePhraseStates) this.degreePhraseStates = new Map();
        const state = this.degreePhraseStates.get(nodeId) || this.createDegreePhraseState();
        this.degreePhraseStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const hasScale = typeof hasInput === "function" ? hasInput(nodeId, "Scale") : this.inputConnections.has(this.inputKey(nodeId, "Scale"));
        const hasRoot = typeof hasInput === "function" ? hasInput(nodeId, "Root") : this.inputConnections.has(this.inputKey(nodeId, "Root"));
        return this.degreePhraseSample(state, {
          clock: mixInput(nodeId, "Clock"),
          reset: mixInput(nodeId, "Reset"),
          steps: read("steps", 8),
          mutate: read("mutate", 0.08),
          octaves: read("octaves", 1),
          level: read("amplitude", 1),
          scaleChoice: read("scale", 1),
          hasScaleInput: hasScale,
          scaleInput: hasScale ? mixInput(nodeId, "Scale") : 0,
          root: hasRoot ? mixInput(nodeId, "Root") : (60 / 120),
          step1: read("step1", 0),
          step2: read("step2", 0.25),
          step3: read("step3", 0.5),
          step4: read("step4", 0.15),
          step5: read("step5", 0.75),
          step6: read("step6", 0.4),
          step7: read("step7", 0.6),
          step8: read("step8", 0),
          rest1: read("rest1", 0),
          rest2: read("rest2", 0),
          rest3: read("rest3", 0),
          rest4: read("rest4", 1),
          rest5: read("rest5", 0),
          rest6: read("rest6", 0),
          rest7: read("rest7", 1),
          rest8: read("rest8", 0),
        });
      },
      noteGlide: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.noteGlideStates) this.noteGlideStates = new Map();
        const state = this.noteGlideStates.get(nodeId) || this.createNoteGlideState();
        this.noteGlideStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.noteGlideSample(state, {
          pitch: mixInput(nodeId, "0.1V/Oct"),
          time: read("time", 0.05),
        }, safeRate);
      },
      noteTranspose: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.noteTransposeSample({
          pitch: mixInput(nodeId, "0.1V/Oct"),
          semitones: read("semitones", 0),
          octaves: read("octaves", 0),
        });
      },
      pitchQuantizer: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.pitchQuantizerStates.get(nodeId) || this.createPitchQuantizerState();
        this.pitchQuantizerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const hasScale = hasInput(nodeId, "Scale");
        return {
          "0.1V/Oct": this.pitchQuantizerSample(state, {
            hasScaleInput: hasScale,
            pitch: mixInput(nodeId, "0.1V/Oct"),
            scaleChoice: read("scale", 1),
            scaleInput: mixInput(nodeId, "Scale"),
            scaleMask: hasScale ? undefined : read("scaleMask", 2741),
          }),
        };
      },
      wirdoSpiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.wirdoSpiralStates.get(nodeId) || this.createWirdoSpiralState();
        this.wirdoSpiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const wirdo = this.wirdoSpiralSample(state, {
          cross: read("cross", 0),
          cut: read("cut", 1000),
          density: read("density", 0.8),
          frequency: read("frequency", 8),
          length: read("length", 1),
          reset: mixInput(nodeId, "Reset"),
          ringCut: read("ringCut", 10),
          rotate: read("rotate", 0),
          sampleRate: safeRate,
          scrap: read("scrap", 1),
          sharp: read("sharp", 0),
          splashDensity: read("splashDensity", 0),
          splashDepth: read("splashDepth", 0),
          splashSpeed: read("splashSpeed", 0),
          syncCut: read("syncCut", 1),
        });
        const wirdoLevel = read("amplitude", 1);
        return {
          X: wirdo.x * wirdoLevel,
          Y: wirdo.y * wirdoLevel,
        };
      },
      blubb: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.blubbStates.get(nodeId) || this.createBlubbState();
        this.blubbStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const blubb = this.blubbSample(state, {
          frequency: read("frequency", 8),
          reset: mixInput(nodeId, "Reset"),
          rotX: read("rotX", 0),
          rotY: read("rotY", 0),
          sampleRate: safeRate,
          shape: read("shape", 0),
          zDepth: read("zDepth", 0),
        });
        const blubbLevel = read("amplitude", 1);
        return {
          X: blubb.x * blubbLevel,
          Y: blubb.y * blubbLevel,
        };
      },
      mushroom: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.mushroomStates.get(nodeId) || this.createMushroomState();
        this.mushroomStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const mushroom = this.mushroomSample(state, {
          apart: read("apart", 0),
          capRotation: read("capRotation", 0),
          capStemTransition: read("capStemTransition", 0.1),
          clusterRotation: read("clusterRotation", 0),
          clusterRotationSpeed: read("clusterRotationSpeed", 0),
          density: read("density", 3),
          frequency: read("frequency", 8),
          grow: read("grow", 1),
          head: read("head", 0.6667),
          numMushrooms: read("numMushrooms", 1),
          phaseOffset: read("phaseOffset", 0),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          sharp: read("sharp", 0),
          spread: read("spread", 0.5),
          stem: read("stem", 0),
          stemRotationSpeed: read("stemRotationSpeed", 0),
          width: read("width", 1),
          wobble: read("wobble", 0.0625),
        });
        const mushroomLevel = read("amplitude", 1);
        return {
          X: mushroom.x * mushroomLevel,
          Y: mushroom.y * mushroomLevel,
        };
      },
      boing: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.boingStates.get(nodeId) || this.createBoingState();
        this.boingStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const boing = this.boingSample(state, {
          boing: read("boing", 0),
          boingStrength: read("boingStrength", 0),
          density: read("density", 1),
          dir: read("dir", 0),
          ends: read("ends", 0),
          frequency: read("frequency", 8),
          reset: mixInput(nodeId, "Reset"),
          rotX: read("rotX", 0),
          rotY: read("rotY", 0),
          sampleRate: safeRate,
          shape: read("shape", 0),
          sharpness: read("sharpness", 0),
          volume: read("volume", 1),
          volumePreJump: read("volumePreJump", 0),
          zAmount: read("zAmount", 0),
          zDepth: read("zDepth", 0),
        });
        const boingLevel = read("amplitude", 1);
        return {
          X: boing.x * boingLevel,
          Y: boing.y * boingLevel,
        };
      },
      torus: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.torusStates.get(nodeId) || this.createTorusState();
        this.torusStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const torus = this.torusSample(state, {
          balance: read("balance", 0),
          darkAngle: read("darkAngle", 0),
          darkIntensity: read("darkIntensity", 0),
          density: read("density", 1),
          frequency: read("frequency", 8),
          length: read("length", 0),
          quantizeDensity: read("quantizeDensity", 1),
          quantizeSubDensity: read("quantizeSubDensity", 1),
          reset: mixInput(nodeId, "Reset"),
          rotX: read("rotX", 0),
          rotY: read("rotY", 0),
          rotZ: read("rotZ", 0),
          sampleRate: safeRate,
          sharp: read("sharp", 0.5),
          size: read("size", 1),
          subdensity: read("subdensity", 0),
          wander: read("wander", 0),
          zAngleX: read("zAngleX", 0),
          zAngleY: read("zAngleY", 0),
          zDepth: read("zDepth", 0),
        });
        const torusLevel = read("amplitude", 1);
        return {
          X: torus.x * torusLevel,
          Y: torus.y * torusLevel,
        };
      },
      keplerBouwkamp: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.keplerBouwkampStates.get(nodeId) || this.createKeplerBouwkampState();
        this.keplerBouwkampStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const kepler = this.keplerBouwkampSample(state, {
          circles: read("circles", 0.5),
          frequency: read("frequency", 8),
          length: read("length", 1),
          reset: mixInput(nodeId, "Reset"),
          rotation: read("rotation", 0),
          sampleRate: safeRate,
          start: read("start", 3),
          tri: read("tri", 0),
          zoom: read("zoom", 0),
        });
        const keplerLevel = read("amplitude", 1);
        return {
          X: kepler.x * keplerLevel,
          Y: kepler.y * keplerLevel,
        };
      },
      nyquistShannon: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.nyquistShannonStates.get(nodeId) || this.createNyquistShannonState();
        this.nyquistShannonStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const nyquist = this.nyquistShannonSample(state, {
          artifact: read("artifact", 0),
          enableToneModFreq: read("enableToneModFreq", 0),
          enableToneModNote: read("enableToneModNote", 0),
          enableToneModPitch: read("enableToneModPitch", 1),
          frequencyA: read("frequencyA", 440),
          frequencyB: read("frequencyB", 5),
          midiNoteRaw: read("midiNoteRaw", 48),
          phaseOffset: read("phaseOffset", 0),
          rate: read("rate", 20),
          reset: mixInput(nodeId, "Reset"),
          sampleDots: read("sampleDots", 0),
          sampleRate: safeRate,
          subPhase: read("subPhase", 0),
          subPhaseRotationSpeed: read("subPhaseRotationSpeed", 0),
          tone: read("tone", 0),
          toneSmoothTime: read("toneSmoothTime", 0.01),
        });
        const nyquistLevel = read("amplitude", 1);
        return {
          X: nyquist.x * nyquistLevel,
          Y: nyquist.y * nyquistLevel,
        };
      },
      surgeOscillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.surgeOscillatorStates.get(nodeId) || this.createSurgeOscillatorState();
        this.surgeOscillatorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitch = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitch
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFrequency,
            hasPitchCv: hasPitch,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
              : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        return this.surgeOscillatorSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          syncIn: mixInput(nodeId, "Sync"),
          hasExternalSync: hasInput(nodeId, "Sync"),
          syncFrequencyHz: read("syncFrequency", 50),
          waveform: read("waveform", 0),
          level: read("amplitude", 1),
        });
      },
      textStream: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.textStreamStates) {
          this.textStreamStates = new Map();
        }
        const state = this.textStreamStates.get(nodeId) || this.createTextStreamState();
        this.textStreamStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const message = node?.textStream?.message != null
          ? String(node.textStream.message)
          : "HELLO MATRIX";
        const clockConnected = typeof hasInput === "function"
          ? hasInput(nodeId, "Clock")
          : this.inputConnections.has(this.inputKey(nodeId, "Clock"));
        return this.textStreamSample(state, {
          message,
          rate: read("rate", 8),
          loop: Math.round(read("loop", 1)) >= 1,
          clock: mixInput(nodeId, "Clock"),
          reset: mixInput(nodeId, "Reset"),
          clockConnected,
          sampleRate: safeRate,
        });
      },
      softwaveOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.softwaveOscStates) {
          this.softwaveOscStates = new Map();
        }
        const state = this.softwaveOscStates.get(nodeId) || this.createSoftwaveOscillatorState();
        this.softwaveOscStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFrequency,
            hasPitchCv: hasPitchInput,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
              : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        const morphKnob = read("morph", 0.5);
        const morphCv = this.inputConnections.has(this.inputKey(nodeId, "Morph"))
          ? this.safeFilterNumber(mixInput(nodeId, "Morph"), 0)
          : 0;
        const morphRaw = typeof nodeGraphParamSignalInAdditive === "function"
          ? nodeGraphParamSignalInAdditive(morphKnob, morphCv)
          : morphKnob + morphCv;
        const morph = this.clampValue(morphRaw, 0, 1);
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), 0)
          : 0;
        const phase = typeof nodeGraphParamSignalInPhaseAdd === "function"
          ? nodeGraphParamSignalInPhaseAdd(phaseKnob, phaseCv)
          : this.wrapValue(phaseKnob + phaseCv, 0, 1);
        const levelKnob = read("amplitude", 1);
        const hasAmp = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"));
        const ampCv = hasAmp ? this.safeFilterNumber(mixInput(nodeId, "Amplitude"), 1) : 1;
        const level = typeof nodeGraphParamSignalInAmplitude === "function"
          ? nodeGraphParamSignalInAmplitude(levelKnob, ampCv, hasAmp)
          : (hasAmp ? levelKnob * ampCv : levelKnob);
        return this.softwaveOscillatorSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          waveform: read("waveform", 0),
          morph,
          phase,
          level,
          antialias: read("antialias", 0),
        });
      },
      // 2D parametric math curve → 1D Out via Project mode; also emits X/Y.,
      curveOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.curveOscStates) {
          this.curveOscStates = new Map();
        }
        const state = this.curveOscStates.get(nodeId) || this.createCurveOscState();
        this.curveOscStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        if (this.inputConnections.has(this.inputKey(nodeId, "Reset"))
          && this.safeFilterNumber(mixInput(nodeId, "Reset"), null) > 0.5) {
          state.phase = 0;
        }
        const baseFrequency = Math.max(0, read("frequency", 110));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFrequency,
            hasPitchCv: hasPitchInput,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
              : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), 0)
          : 0;
        const phase = typeof nodeGraphParamSignalInPhaseAdd === "function"
          ? nodeGraphParamSignalInPhaseAdd(phaseKnob, phaseCv)
          : this.wrapValue(phaseKnob + phaseCv, 0, 1);
        const levelKnob = read("amplitude", 1);
        const hasAmp = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"));
        const ampCv = hasAmp ? this.safeFilterNumber(mixInput(nodeId, "Amplitude"), 1) : 1;
        const level = typeof nodeGraphParamSignalInAmplitude === "function"
          ? nodeGraphParamSignalInAmplitude(levelKnob, ampCv, hasAmp)
          : (hasAmp ? levelKnob * ampCv : levelKnob);
        return this.curveOscillatorSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          curve: read("curve", 0),
          a: read("a", 0.5),
          b: read("b", 0.5),
          morph: read("morph", 0.35),
          project: read("project", 0),
          projectAngle: read("projectAngle", 0),
          phase,
          level,
        });
      },
      // RS-MET-style L-system + turtle → stereo X/Y. Native WASM preferred.
      snowflake: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.snowflakeStates) {
          this.snowflakeStates = new Map();
        }
        const state = this.snowflakeStates.get(nodeId) || this.createSnowflakeState();
        this.snowflakeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        let reset = 0;
        if (this.inputConnections.has(this.inputKey(nodeId, "Reset"))) {
          reset = this.safeFilterNumber(mixInput(nodeId, "Reset"), 0);
        }
        const baseFrequency = Math.max(0, read("frequency", 55));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFrequency,
            hasPitchCv: hasPitchInput,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
              : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        const levelKnob = read("amplitude", 1);
        const hasAmp = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"));
        const ampCv = hasAmp ? this.safeFilterNumber(mixInput(nodeId, "Amplitude"), 1) : 1;
        const level = typeof nodeGraphParamSignalInAmplitude === "function"
          ? nodeGraphParamSignalInAmplitude(levelKnob, ampCv, hasAmp)
          : (hasAmp ? levelKnob * ampCv : levelKnob);
        let direction = read("direction", null);
        if (direction == null || !Number.isFinite(Number(direction))) {
          const legacyReverse = read("reverse", 0);
          direction = Number(legacyReverse) > 0.5 ? 0 : 1;
        }
        return this.snowflakeSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          pattern: read("pattern", 1),
          iterations: read("iterations", 3),
          angle: read("angle", 60),
          direction,
          spin: read("spin", 0),
          level,
          reset,
        });
      },
      dsfOscillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.dsfOscillatorStates.get(nodeId) || this.createDsfOscillatorState();
        this.dsfOscillatorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // Same 0.1V/Oct + pitch-reference convention as PolyBLEP / RobinSupersaw.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFrequency,
            hasPitchCv: hasPitchInput,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
              : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        // Phase / Amplitude jacks: Phase adds to the Phase knob (cycles);
        // Amplitude multiplies the Amplitude knob when wired.
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), null)
          : 0;
        const phase = typeof nodeGraphParamSignalInPhaseAdd === "function"
          ? nodeGraphParamSignalInPhaseAdd(phaseKnob, phaseCv)
          : this.wrapValue(phaseKnob + phaseCv, 0, 1);
        const levelKnob = read("amplitude", 1);
        const hasAmp = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"));
        const ampCv = hasAmp ? this.safeFilterNumber(mixInput(nodeId, "Amplitude"), 1) : 1;
        const level = typeof nodeGraphParamSignalInAmplitude === "function"
          ? nodeGraphParamSignalInAmplitude(levelKnob, ampCv, hasAmp)
          : (hasAmp ? levelKnob * ampCv : levelKnob);
        return this.dsfOscillatorSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          waveform: read("waveform", 1),
          morph: read("morph", 1),
          pulseWidth: read("pulseWidth", 0.5),
          blend: read("blend", 0.5),
          phase,
          level,
        });
      },
      robinSupersaw: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.robinSupersawStates.get(nodeId) || this.createRobinSupersawState();
        this.robinSupersawStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // baseFrequency is the pitch heard at the global pitch reference
        // note (see node-graph-patch-normalizers.js) -- set it equal to
        // the master "Pitch Reference Frequency" setting and a MIDI
        // keyboard is automatically in tune; double it to transpose the
        // whole instrument up an octave.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFrequency,
            hasPitchCv: hasPitchInput,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
              : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        return this.robinSupersawSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          detuneCents: read("detuneCents", 30),
          voices: read("voices", 7),
          level: read("amplitude", 1),
        });
      },
      hypersaw: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.hypersawStates.get(nodeId) || this.createHypersawState();
        this.hypersawStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // baseFrequency is the pitch heard at the global pitch reference
        // note (see node-graph-patch-normalizers.js), same convention as
        // robinSupersaw above -- set it equal to the master "Pitch
        // Reference Frequency" setting and a MIDI keyboard is
        // automatically in tune.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFrequency,
            hasPitchCv: hasPitchInput,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
              : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        return this.hypersawSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          phaseOffset: read("phase", 0),
          numVoices: read("voices", 8),
          spread: read("spread", 1),
          randomAmount: read("random", 0.15),
          driftAmount: read("drift", 0.1),
          level: read("amplitude", 0.35),
        });
      },
      chordSequencer: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.chordSequencerStates.get(nodeId) || this.createChordSequencerState();
        this.chordSequencerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.chordSequencerSample(state, {
          clock: mixInput(nodeId, "Clock"),
          level: read("amplitude", 1),
          progression: read("progression", 0),
          direction: read("direction", 0),
          key: read("key", 0),
          reset: mixInput(nodeId, "Reset"),
        });
      },
      chordPad: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.chordPadStates) {
          this.chordPadStates = new Map();
        }
        const state = this.chordPadStates.get(nodeId) || this.createChordPadState();
        this.chordPadStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.chordPadSample(state, {
          key: read("key", 0),
          mode: read("mode", 0),
          degree: read("degree", 0),
          level: read("amplitude", 1),
          hasSelectInput: hasInput(nodeId, "Select"),
          select: mixInput(nodeId, "Select"),
        });
      },
      lutCell: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.lutCellStates.get(nodeId) || this.createLutCellState();
        this.lutCellStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.lutCellSample(state, {
          a: mixInput(nodeId, "A"),
          b: mixInput(nodeId, "B"),
          c: mixInput(nodeId, "C"),
          d: mixInput(nodeId, "D"),
          clock: mixInput(nodeId, "Clock"),
          truthTable: read("truthTable", 27030),
          hasAInput: hasInput(nodeId, "A"),
          hasClockInput: hasInput(nodeId, "Clock"),
        });
      },
      osc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.polyBlepOscillatorWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      polyBlep: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.polyBlepOscillatorWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      blit: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.polyBlepOscillatorWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      graph2: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue, graphOutputValue) =>
        graphOutputValue(node, nodeId),
      graphCopy: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue, graphOutputValue) =>
        graphOutputValue(node, nodeId),
      additiveOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue) =>
        this.additiveOscWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate, graphInputValue),
      gpuAdditiveOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue) =>
        this.additiveOscWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate, graphInputValue),
      ellipsoid: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.ellipsoidWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      ellipsoidOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.ellipsoidWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      sineWavetable: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.sineWavetableWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      metallicRatio: (node, nodeId, frame, frames, frameValues) => ({
        Ratio: this.metallicRatioSample(
          this.readEffectiveParameter(node, "index", 1, frame, frames, frameValues),
        ),
      }),
      radar: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.radarStates.get(nodeId) || this.createRadarState();
        this.radarStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const radar = this.radarSample(state, {
          density: read("density", 1),
          direction: read("direction", 0),
          fade: read("fade", 1),
          frequency: read("frequency", 1),
          frontring: read("frontring", 0),
          inner: read("inner", 0),
          lap: read("lap", 0),
          length: read("length", 1),
          phaseInv: read("phaseInv", 0),
          phaseOffset: read("phaseOffset", 0),
          pow1Down: read("pow1Down", 0),
          pow1Up: read("pow1Up", 0),
          pow2Bend: read("pow2Bend", 0),
          ratio: read("ratio", 0),
          reset: mixInput(nodeId, "Reset"),
          ringcut: read("ringcut", 0),
          rotation: read("rotation", 0),
          sampleRate: safeRate,
          shade: read("shade", 1),
          sharp: read("sharp", 0),
          spiralReturn: read("spiralReturn", 0),
          tunnelInv: read("tunnelInv", 0),
          x: read("x", 0),
          y: read("y", 0),
          zDepth: read("zDepth", 0),
          zoom: read("zoom", 0),
        });
        const radarLevel = read("amplitude", 1);
        return {
          X: radar.x * radarLevel,
          Y: radar.y * radarLevel,
        };
      },
      sinc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.sincStates.get(nodeId) || this.createSincState();
        this.sincStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const baseFreq = Math.max(0, read("freq", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const fHz = this.readFInputHz(mixInput, nodeId);
        const pitched = typeof nodeGraphParamResolveOscPitchHz === "function"
          ? nodeGraphParamResolveOscPitchHz({
            baseHz: baseFreq,
            hasPitchCv: hasPitchInput,
            pitchCv,
            referenceVoltage,
            fHz,
          })
          : this.resolveFrequencyHz(
            (typeof nodeGraphPitchedFrequency === "function"
              ? nodeGraphPitchedFrequency(baseFreq, pitchCv, referenceVoltage)
              : baseFreq * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
            fHz,
          );
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), 0)
          : 0;
        const phase = typeof nodeGraphParamSignalInPhaseAdd === "function"
          ? nodeGraphParamSignalInPhaseAdd(phaseKnob, phaseCv)
          : this.wrapValue(phaseKnob + phaseCv, 0, 1);
        return this.sincSample(state, {
          freq: pitched,
          phase,
          lobes: read("lobes", 4),
          bandLimit: read("bandLimit", 1),
        }, nodeId);
      },
      noiseGenerator: (node, nodeId, frame, frames, frameValues) => {
        const state = this.noiseGeneratorStates.get(nodeId) || this.createNoiseGeneratorState();
        this.noiseGeneratorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.noiseGeneratorSample(
          state,
          {
            deviation: read("deviation", 0.5),
            level: read("amplitude", 1),
            mean: read("mean", 0),
            mode: read("mode", 0),
            seed: read("seed", 1),
            shape: read("shape", 0),
          },
          nodeId,
        );
      },
      softpopOscillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.softpopOscillatorStates) this.softpopOscillatorStates = new Map();
        const state = this.softpopOscillatorStates.get(nodeId) || this.createSoftpopOscillatorState();
        this.softpopOscillatorStates.set(nodeId, state);
        const baseFreq = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const frequency = this.resolveSoftpopOrBandpassHz(node, nodeId, baseFreq, frame, frames, frameValues, mixInput);
        return this.softpopOscillatorSample(
          state,
          {
            amplitude: this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues),
            color: this.readEffectiveParameter(node, "color", 0, frame, frames, frameValues),
            frequency,
            q: this.readEffectiveParameter(node, "q", 4, frame, frames, frameValues),
            reset: mixInput(nodeId, "Reset"),
            seed: this.readEffectiveParameter(node, "seed", 1, frame, frames, frameValues),
            stereoMode: this.readEffectiveParameter(node, "stereoMode", 0, frame, frames, frameValues),
          },
          safeRate,
          nodeId,
        );
      },
      sinepulse: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.sinepulseStates) this.sinepulseStates = new Map();
        let state = this.sinepulseStates.get(nodeId);
        if (!state) {
          state = this.createSinepulseState();
          this.sinepulseStates.set(nodeId, state);
        }
        // Rate = master sweep rate. HighFreq/LowFreq = endpoints. Shift collapses span.
        let baseRate = this.readEffectiveParameter(node, "rate", NaN, frame, frames, frameValues);
        if (!Number.isFinite(Number(baseRate))) {
          baseRate = this.readEffectiveParameter(node, "frequency", 1, frame, frames, frameValues);
        }
        const rateHz = this.resolveSoftpopOrBandpassHz
          ? this.resolveSoftpopOrBandpassHz(node, nodeId, baseRate, frame, frames, frameValues, mixInput)
          : baseRate;
        let freqCurve = this.readEffectiveParameter(node, "freqCurve", NaN, frame, frames, frameValues);
        if (!Number.isFinite(Number(freqCurve))) {
          freqCurve = this.readEffectiveParameter(node, "curve", 0.5, frame, frames, frameValues);
        }
        let shift = this.readEffectiveParameter(node, "shift", NaN, frame, frames, frameValues);
        if (!Number.isFinite(Number(shift))) {
          const legacy = Number(this.readEffectiveParameter(node, "together", 0, frame, frames, frameValues));
          shift = Number.isFinite(legacy) ? Math.max(0, Math.min(1, Math.abs(legacy) / 4)) : 0;
        }
        let highFreq = this.readEffectiveParameter(node, "highFreq", NaN, frame, frames, frameValues);
        if (!Number.isFinite(Number(highFreq))) {
          highFreq = this.readEffectiveParameter(node, "frequencyHigh", 20000, frame, frames, frameValues);
        }
        let lowFreq = this.readEffectiveParameter(node, "lowFreq", NaN, frame, frames, frameValues);
        if (!Number.isFinite(Number(lowFreq))) {
          lowFreq = this.readEffectiveParameter(node, "frequencyLow", 0, frame, frames, frameValues);
        }
        return this.sinepulseSample(
          state,
          rateHz,
          highFreq,
          lowFreq,
          shift,
          this.readEffectiveParameter(node, "sweep", 1, frame, frames, frameValues),
          Math.round(this.readEffectiveParameter(node, "direction", 0, frame, frames, frameValues)),
          freqCurve,
          this.readEffectiveParameter(node, "ampCurve", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues),
          this.safeFilterNumber(mixInput(nodeId, "Increment"), null) ?? 0,
          mixInput(nodeId, "Reset"),
          safeRate,
          Math.round(this.readEffectiveParameter(node, "antialias", 1, frame, frames, frameValues)),
          Math.round(this.readEffectiveParameter(node, "hardReset", 1, frame, frames, frameValues)),
        );
      },
      randomWalk: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.randomWalkStates.get(nodeId) || this.createRandomWalkState();
        this.randomWalkStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.randomWalkSample(
          state,
          {
            frequency: read("frequency", 2),
            jitter: read("jitter", 0.25),
            level: read("amplitude", 1),
            method: read("method", 3),
            seed: read("seed", 1),
          },
          safeRate,
          nodeId,
        );
      },
      piSpigotNoise: (node, nodeId, frame, frames, frameValues) => {
        const state = this.piSpigotNoiseStates.get(nodeId) || this.createPiSpigotNoiseState();
        this.piSpigotNoiseStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.piSpigotNoiseSample(state, {
          seedLeft: read("seedLeft", 0),
          seedRight: read("seedRight", 0.5),
          color: read("color", 0),
          smoothing: read("smoothing", 0),
          level: read("amplitude", 1),
        });
      },
      bradley2a: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.bradley2AStates.get(nodeId) || this.createBradley2AState();
        this.bradley2AStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.bradley2ASample(
          state,
          {
            carrierFreq: read("carrierFreq", 1004),
            freqOffset: read("freqOffset", 0),
            jitterDepth: read("jitterDepth", 0),
            jitterRate: read("jitterRate", 60),
            ampDepth: read("ampDepth", 0),
            ampRate: read("ampRate", 40),
            interfLevel: read("interfLevel", 0),
            interfFreq: read("interfFreq", 2600),
            harm2: read("harm2", 0),
            harm3: read("harm3", 0),
            hitRate: read("hitRate", 1),
            hitDuration: read("hitDuration", 0.005),
            hitGain: read("hitGain", 1),
            hitPhase: read("hitPhase", 0),
            impulseLevel: read("impulseLevel", 0),
            level: read("amplitude", 1),
          },
          safeRate,
        );
      },
      antisaw: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.antisawStates.get(nodeId) || this.createAntisawState();
        this.antisawStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.antisawSample(
          state,
          {
            fundamental: read("fundamental", 110),
            reflections: read("reflections", 64),
            tilt: read("tilt", 0),
            level: read("amplitude", 1),
          },
          safeRate,
        );
      },
      fractalBrownianNoise: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.fractalBrownianNoiseStates.get(nodeId) || this.createFractalBrownianNoiseState();
        this.fractalBrownianNoiseStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.fractalBrownianNoiseVector(
          state,
          {
            frequency: read("frequency", 0.5),
            level: read("amplitude", 1),
            octaves: read("octaves", 4),
            persistence: read("persistence", 0.5),
            scale: read("scale", 1),
            seed: read("seed", 1),
          },
          safeRate,
          nodeId,
          mixInput(nodeId, "Reset"),
        );
      },
      fbmField: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.fbmFieldStates.get(nodeId) || this.createFbmFieldState();
        this.fbmFieldStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.fbmFieldVector(
          state,
          {
            brightness: read("brightness", 1),
            contrast: read("contrast", 1),
            frequency: read("frequency", 20),
            lacunarity: read("lacunarity", 2),
            motion: read("motion", 1),
            octaves: read("octaves", 4),
            panX: read("panX", 0),
            panY: read("panY", 0),
            persistence: read("persistence", 0.5),
            rotate: read("rotate", 0),
            scale: read("scale", 1),
            seed: read("seed", 1),
            smoothness: read("smoothness", 0.55),
            zoom: read("zoom", 1),
          },
          safeRate,
          mixInput(nodeId, "Reset"),
        );
      },
      spiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.spiralStates.get(nodeId) || this.createSpiralState();
        this.spiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const spiral = this.jerobeamSpiralSample({
          density: read("density", 1),
          frequency: read("frequency", 440),
          morph: read("morph", 0),
          morphSpeed: read("morphSpeed", 0),
          position: read("position", 0),
          positionSpeed: read("positionSpeed", 0),
          rotX: read("rotX", 0),
          rotXSpeed: read("rotXSpeed", 0),
          rotY: read("rotY", 0),
          rotYSpeed: read("rotYSpeed", 0),
          sampleRate: safeRate,
          sharp: read("sharp", 0.5),
          sharpCurve: read("sharpCurve", 0),
          sharpCurveMult: read("sharpCurveMult", 1),
          size: read("size", 0.5),
          state,
          zAmount: read("zAmount", 0),
          zDepth: read("zDepth", 0),
        });
        const level = read("amplitude", 1);
        return {
          X: spiral.x * level,
          Y: spiral.y * level,
          Z: spiral.z * level,
        };
      },
      fractalSpiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.fractalSpiralStates.get(nodeId) || this.createFractalSpiralState();
        this.fractalSpiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const fractal = this.fractalSpiralSample(state, {
          frequency: read("frequency", 1),
          gain: read("gain", 0.5),
          growth: read("growth", 1.5),
          lacunarity: read("lacunarity", 2),
          octaves: read("octaves", 5),
          sampleRate: safeRate,
          size: read("size", 0.5),
          spin: read("spin", 0.05),
          twist: read("twist", 0.381966),
        });
        const fractalLevel = read("amplitude", 1);
        return {
          X: fractal.x * fractalLevel,
          Y: fractal.y * fractalLevel,
          Z: fractal.z * fractalLevel,
        };
      },
      logSpiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.logSpiralStates.get(nodeId) || this.createLogSpiralState();
        this.logSpiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const logSpiral = this.logSpiralSample(state, {
          frequency: read("frequency", 1),
          growth: read("growth", 3),
          sampleRate: safeRate,
          size: read("size", 0.5),
          spin: read("spin", 0.05),
          turns: read("turns", 4),
        });
        const logSpiralLevel = read("amplitude", 1);
        return {
          X: logSpiral.x * logSpiralLevel,
          Y: logSpiral.y * logSpiralLevel,
          Z: logSpiral.z * logSpiralLevel,
        };
      },
      lorenzAttractor: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.lorenzAttractorStates.get(nodeId) || this.createLorenzAttractorState();
        this.lorenzAttractorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const lorenz = this.lorenzAttractorSample({
          beta: read("beta", 8 / 3),
          reset: mixInput(nodeId, "Reset"),
          rho: read("rho", 28),
          rotate: read("rotate", 0),
          sampleRate: safeRate,
          scale: read("scale", 1),
          sigma: read("sigma", 10),
          speed: read("speed", 1),
          state,
          zDepth: read("zDepth", 0.4),
        });
        const level = read("amplitude", 1);
        return {
          X: lorenz.x * level,
          Y: lorenz.y * level,
          Z: lorenz.z * level,
        };
      },
      pulseExplosion: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pulseExplosionStates.get(nodeId) || this.createPulseExplosionState();
        this.pulseExplosionStates.set(nodeId, state);
        return this.pulseExplosionSample(
          state,
          mixInput(nodeId, "Trigger"),
          {
            startTime: this.readEffectiveParameter(node, "startTime", 0, frame, frames, frameValues),
            centerTime: this.readEffectiveParameter(node, "centerTime", 0.5, frame, frames, frameValues),
            endTime: this.readEffectiveParameter(node, "endTime", 1, frame, frames, frameValues),
            timeSpread: this.readEffectiveParameter(node, "timeSpread", 0.3, frame, frames, frameValues),
            numberOfPulses: this.readEffectiveParameter(node, "numberOfPulses", 20, frame, frames, frameValues),
            lowAmplitude: this.readEffectiveParameter(node, "lowAmplitude", 0.3, frame, frames, frameValues),
            highAmplitude: this.readEffectiveParameter(node, "highAmplitude", 1, frame, frames, frameValues),
            seed: this.readEffectiveParameter(node, "seed", 0, frame, frames, frameValues),
          },
          safeRate,
        );
      },
      shootingStarExplosion: (node, nodeId, frame, frames, frameValues) => this.shootingStarExplosionEventSample(
        this.readEffectiveParameter(node, "lowRange", 0, frame, frames, frameValues),
        this.readEffectiveParameter(node, "highRange", 1, frame, frames, frameValues),
      ),
  };
};
