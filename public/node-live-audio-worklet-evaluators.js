// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Loaded immediately after the core class in the worklet Blob and any main-thread
// worklet-core include order. Behavior must match the in-class method bit-for-bit.

NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators = function buildLiveModuleEvaluators() {
    return {
      logisticMap: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.logisticMapStates.get(nodeId) || this.createLogisticMapState();
        this.logisticMapStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return {
          Out: this.logisticMapSample(state, {
            level: read("level", 1),
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
          level: read("level", 1),
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
        const henonLevel = read("level", 1);
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
        const level = read("level", 1);
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
        const chuaLevel = read("level", 1);
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
          level: read("level", 1),
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
          level: read("level", 1),
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
          level: read("level", 1),
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
        const wirdoLevel = read("level", 1);
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
        const blubbLevel = read("level", 1);
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
        const mushroomLevel = read("level", 1);
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
        const boingLevel = read("level", 1);
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
        const torusLevel = read("level", 1);
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
        const keplerLevel = read("level", 1);
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
        const nyquistLevel = read("level", 1);
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
        const pitchInput = this.clampValue(
          this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null),
          -10,
          10,
        );
        const frequencyHz = typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, 0)
          : Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
        const effectiveFrequency = this.resolveFrequencyHz(frequencyHz, this.readFInputHz(mixInput, nodeId));
        return this.surgeOscillatorSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          syncIn: mixInput(nodeId, "Sync"),
          hasExternalSync: hasInput(nodeId, "Sync"),
          syncFrequencyHz: read("syncFrequency", 50),
          waveform: read("waveform", 0),
          level: read("level", 1),
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
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = (typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, referenceVoltage)
          : Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1))));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        const morphKnob = read("morph", 0.5);
        const morphCv = this.inputConnections.has(this.inputKey(nodeId, "Morph"))
          ? this.safeFilterNumber(mixInput(nodeId, "Morph"), 0)
          : 0;
        const morph = this.clampValue(morphKnob + morphCv, 0, 1);
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), 0)
          : 0;
        const phase = this.wrapValue(phaseKnob + phaseCv, 0, 1);
        const levelKnob = read("level", 1);
        const level = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"))
          ? levelKnob * this.safeFilterNumber(mixInput(nodeId, "Amplitude"), 1)
          : levelKnob;
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
      // 2D parametric math curve → 1D Out via Project mode; also emits X/Y.
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
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = (typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, referenceVoltage)
          : Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1))));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), 0)
          : 0;
        const phase = this.wrapValue(phaseKnob + phaseCv, 0, 1);
        const levelKnob = read("level", 1);
        const level = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"))
          ? levelKnob * this.safeFilterNumber(mixInput(nodeId, "Amplitude"), 1)
          : levelKnob;
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
      // RS-MET-style L-system + turtle → stereo X/Y (Out = Y). Native WASM preferred.
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
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = (typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, referenceVoltage)
          : Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1))));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        const levelKnob = read("level", 1);
        const level = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"))
          ? levelKnob * this.safeFilterNumber(mixInput(nodeId, "Amplitude"), 1)
          : levelKnob;
        return this.snowflakeSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          pattern: read("pattern", 1),
          iterations: read("iterations", 3),
          angle: read("angle", 60),
          size: read("size", 1),
          reverse: read("reverse", 0),
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
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = (typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, referenceVoltage)
          : Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1))));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        // Phase / Amplitude jacks: Phase adds to the Phase knob (cycles);
        // Amplitude multiplies the Amplitude knob when wired.
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), null)
          : 0;
        const phase = this.wrapValue(phaseKnob + phaseCv, 0, 1);
        const levelKnob = read("level", 1);
        const level = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"))
          ? levelKnob * this.safeFilterNumber(mixInput(nodeId, "Amplitude"), null)
          : levelKnob;
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
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = (typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, referenceVoltage)
          : Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1))));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        return this.robinSupersawSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          detuneCents: read("detuneCents", 30),
          voices: read("voices", 7),
          level: read("level", 1),
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
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = (typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, referenceVoltage)
          : Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1))));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        return this.hypersawSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          phaseOffset: read("phase", 0),
          numVoices: read("voices", 8),
          spread: read("spread", 1),
          randomAmount: read("random", 0.15),
          driftAmount: read("drift", 0.1),
          level: read("level", 0.35),
        });
      },
      chordSequencer: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.chordSequencerStates.get(nodeId) || this.createChordSequencerState();
        this.chordSequencerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.chordSequencerSample(state, {
          clock: mixInput(nodeId, "Clock"),
          level: read("level", 1),
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
          level: read("level", 1),
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
      passiveFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.passiveFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createPassiveFilterState());
        this.passiveFilterStates.set(nodeId, state);
        const passiveMode = this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues);
        const passiveLowFrequency = this.readEffectiveParameter(node, "lowFrequency", 200, frame, frames, frameValues);
        const passiveHighFrequency = this.readEffectiveParameter(node, "highFrequency", 1000, frame, frames, frameValues);
        const passiveMono = mixInput(nodeId);
        return {
          Out: this.passiveFilterSample(state.mono, passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate),
          Left: this.passiveFilterSample(state.left, mixInput(nodeId, "Left") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate),
          Right: this.passiveFilterSample(state.right, mixInput(nodeId, "Right") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate),
        };
      },
      papoulisFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.papoulisFilterStates.get(nodeId) || this.createPapoulisFilterState();
        this.papoulisFilterStates.set(nodeId, state);
        return this.papoulisFilterSample(
          state,
          mixInput(nodeId),
          this.readEffectiveParameter(node, "cutoff", 1000, frame, frames, frameValues),
          safeRate,
        );
      },
      phosphillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.phosphillatorPlaybackStates.get(nodeId) || this.createPhosphillatorPlaybackState();
        this.phosphillatorPlaybackStates.set(nodeId, state);
        return this.phosphillatorPlaybackSample(
          state,
          node,
          nodeId,
          mixInput(nodeId, "0.1V/Oct"),
          this.readEffectiveParameter(node, "frequency", 2, frame, frames, frameValues),
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          mixInput(nodeId, "Reset"),
          safeRate,
          this.readEffectiveParameter(node, "sharpness", 0.5, frame, frames, frameValues),
        );
      },
      cookbookFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.cookbookFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createCookbookFilterState());
        this.cookbookFilterStates.set(nodeId, state);
        const cookbookMode = this.readEffectiveParameter(node, "mode", 1, frame, frames, frameValues);
        const cookbookFrequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const cookbookQ = this.readEffectiveParameter(node, "q", 1, frame, frames, frameValues);
        const cookbookGain = this.readEffectiveParameter(node, "gain", 0, frame, frames, frameValues);
        const cookbookStages = this.readEffectiveParameter(node, "stages", 2, frame, frames, frameValues);
        const cookbookMono = mixInput(nodeId);
        return {
          Out: this.cookbookFilterSample(state.mono, cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate),
          Left: this.cookbookFilterSample(state.left, mixInput(nodeId, "Left") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate),
          Right: this.cookbookFilterSample(state.right, mixInput(nodeId, "Right") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate),
        };
      },
      ladderFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.ladderFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createLadderFilterState());
        this.ladderFilterStates.set(nodeId, state);
        const ladderParams = {
          frequency: this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 1, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
          stages: this.readEffectiveParameter(node, "stages", 4, frame, frames, frameValues),
        };
        const ladderMono = mixInput(nodeId);
        return {
          Out: this.ladderFilterSample(state.mono, ladderMono, ladderParams, safeRate),
          Left: this.ladderFilterSample(state.left, mixInput(nodeId, "Left") + ladderMono, ladderParams, safeRate),
          Right: this.ladderFilterSample(state.right, mixInput(nodeId, "Right") + ladderMono, ladderParams, safeRate),
        };
      },
      flowerChildFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.flowerChildFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createFlowerChildFilterState());
        this.flowerChildFilterStates.set(nodeId, state);
        const flowerChildParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const flowerChildMono = mixInput(nodeId);
        return {
          Out: this.flowerChildFilterSample(state.mono, flowerChildMono, flowerChildParams, safeRate),
          Left: this.flowerChildFilterSample(state.left, mixInput(nodeId, "Left") + flowerChildMono, flowerChildParams, safeRate),
          Right: this.flowerChildFilterSample(state.right, mixInput(nodeId, "Right") + flowerChildMono, flowerChildParams, safeRate),
        };
      },
      rsmetFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.rsmetFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createRsmetFilterState());
        this.rsmetFilterStates.set(nodeId, state);
        const rsmetParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const rsmetMono = mixInput(nodeId);
        return {
          Out: this.rsmetFilterSample(state.mono, rsmetMono, rsmetParams, safeRate),
          Left: this.rsmetFilterSample(state.left, mixInput(nodeId, "Left") + rsmetMono, rsmetParams, safeRate),
          Right: this.rsmetFilterSample(state.right, mixInput(nodeId, "Right") + rsmetMono, rsmetParams, safeRate),
        };
      },
      yellowjacketFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.yellowjacketFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createYellowjacketFilterState());
        this.yellowjacketFilterStates.set(nodeId, state);
        const yellowjacketParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const yellowjacketMono = mixInput(nodeId);
        return {
          Out: this.yellowjacketFilterSample(state.mono, yellowjacketMono, yellowjacketParams, safeRate),
          Left: this.yellowjacketFilterSample(state.left, mixInput(nodeId, "Left") + yellowjacketMono, yellowjacketParams, safeRate),
          Right: this.yellowjacketFilterSample(state.right, mixInput(nodeId, "Right") + yellowjacketMono, yellowjacketParams, safeRate),
        };
      },
      superloveFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.superloveFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createSuperloveFilterState());
        this.superloveFilterStates.set(nodeId, state);
        const superloveParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0.5, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const superloveMono = mixInput(nodeId);
        return {
          Out: this.superloveFilterSample(state.mono, superloveMono, superloveParams, safeRate),
          Left: this.superloveFilterSample(state.left, mixInput(nodeId, "Left") + superloveMono, superloveParams, safeRate),
          Right: this.superloveFilterSample(state.right, mixInput(nodeId, "Right") + superloveMono, superloveParams, safeRate),
        };
      },
      chaoticPhaseLockingFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.chaoticPhaseLockingFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createChaoticPhaseLockingFilterState());
        this.chaoticPhaseLockingFilterStates.set(nodeId, state);
        const chaoticPhaseLockingParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 1, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const chaoticPhaseLockingMono = mixInput(nodeId);
        return {
          Out: this.chaoticPhaseLockingFilterSample(state.mono, chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate),
          Left: this.chaoticPhaseLockingFilterSample(state.left, mixInput(nodeId, "Left") + chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate),
          Right: this.chaoticPhaseLockingFilterSample(state.right, mixInput(nodeId, "Right") + chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate),
        };
      },
      resonatorFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.resonatorFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createResonatorFilterState());
        this.resonatorFilterStates.set(nodeId, state);
        const resonatorParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const resonatorMono = mixInput(nodeId);
        return {
          Out: this.resonatorFilterSample(state.mono, resonatorMono, resonatorParams, safeRate),
          Left: this.resonatorFilterSample(state.left, mixInput(nodeId, "Left") + resonatorMono, resonatorParams, safeRate),
          Right: this.resonatorFilterSample(state.right, mixInput(nodeId, "Right") + resonatorMono, resonatorParams, safeRate),
        };
      },
      humanFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.humanFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createHumanFilterState());
        this.humanFilterStates.set(nodeId, state);
        const humanFilterParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const humanFilterMono = mixInput(nodeId);
        return {
          Out: this.humanFilterSample(state.mono, humanFilterMono, humanFilterParams, safeRate),
          Left: this.humanFilterSample(state.left, mixInput(nodeId, "Left") + humanFilterMono, humanFilterParams, safeRate),
          Right: this.humanFilterSample(state.right, mixInput(nodeId, "Right") + humanFilterMono, humanFilterParams, safeRate),
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
      comparator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.comparatorStates.get(nodeId) || this.createComparatorState();
        this.comparatorStates.set(nodeId, state);
        return this.comparatorSample(state, mixInput(nodeId, "In"));
      },
      sampleDelay: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.sampleDelayStates.get(nodeId) || this.createSampleDelayState();
        this.sampleDelayStates.set(nodeId, state);
        return this.sampleDelaySample(
          state,
          mixInput(nodeId, "In"),
          this.readEffectiveParameter(node, "time", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "samples", 0, frame, frames, frameValues),
          safeRate,
        );
      },
      minMax: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.minMaxStates.get(nodeId) || this.createMinMaxState();
        this.minMaxStates.set(nodeId, state);
        const ports = ["In 1", "In 2", "In 3", "In 4"];
        const values = ports.map((port) => mixInput(nodeId, port));
        let connectedMask = 0;
        ports.forEach((port, i) => {
          if (hasInput(nodeId, port)) connectedMask |= (1 << i);
        });
        return this.minMaxSample(state, values, connectedMask);
      },
      aliasSine: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.aliasSineStates.get(nodeId) || this.createAliasSineState();
        this.aliasSineStates.set(nodeId, state);
        // When universal `f` is wired (absolute Hz), convert to cycles/sample.
        const fHz = this.readFInputHz(mixInput, nodeId);
        const normFromKnob = this.readEffectiveParameter(node, "normFreq", 0.1, frame, frames, frameValues);
        const normFreq = fHz != null ? fHz / Math.max(1, safeRate) : normFromKnob;
        return this.aliasSineSample(
          state,
          normFreq,
          this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
          safeRate,
        );
      },
      tb303Filter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.tb303FilterStates.get(nodeId) || this.createStereoFilterState(() => this.createTb303FilterState());
        this.tb303FilterStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const tb303Params = {
          cutoff: read("cutoff", 1000),
          drive: read("drive", 0),
          mode: read("mode", 4),
          resonance: read("resonance", 0),
        };
        const tb303Mono = mixInput(nodeId);
        return {
          Out: this.tb303FilterSample(state.mono, tb303Mono, tb303Params, safeRate),
          Left: this.tb303FilterSample(state.left, mixInput(nodeId, "Left") + tb303Mono, tb303Params, safeRate),
          Right: this.tb303FilterSample(state.right, mixInput(nodeId, "Right") + tb303Mono, tb303Params, safeRate),
        };
      },
      delayEffect: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.delayEffectStates.get(nodeId) || this.createStereoDelayEffectState();
        this.delayEffectStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const delayParams = {
          feedback: read("feedback", 0.25),
          level: read("level", 1),
          mix: read("mix", 0.35),
          mode: read("mode", 0),
          modAmount: read("modAmount", 0.02),
          modRate: read("modRate", 0.1),
          modVariation: read("modVariation", 0),
          time: read("time", 0.18),
        };
        const delayMono = mixInput(nodeId);
        const monoResult = this.delayEffectSample(state.mono, delayMono, delayParams, safeRate, `${nodeId}:mono`);
        const leftResult = this.delayEffectSample(state.left, mixInput(nodeId, "Left") + delayMono, delayParams, safeRate, `${nodeId}:left`);
        const rightResult = this.delayEffectSample(state.right, mixInput(nodeId, "Right") + delayMono, delayParams, safeRate, `${nodeId}:right`);
        return {
          Out: monoResult.Out,
          Left: leftResult.Out,
          Right: rightResult.Out,
          Wet: monoResult.Wet,
        };
      },
      pingPongDelay: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pingPongDelayStates.get(nodeId) || this.createPingPongDelayState();
        this.pingPongDelayStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.pingPongDelaySample(
          state,
          mixInput(nodeId) + mixInput(nodeId, "Left") + mixInput(nodeId, "Right"),
          {
            feedback: read("feedback", 0.35),
            level: read("level", 1),
            mix: read("mix", 0.35),
            offsetMs: read("offsetMs", 0),
            timeDenominator: read("timeDenominator", 4),
            timeNumerator: read("timeNumerator", 1),
            timingMode: read("timingMode", 0),
          },
          safeRate,
        );
      },
      wallDelay: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.wallDelayStates.get(nodeId) || this.createWallDelayState();
        this.wallDelayStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.wallDelaySample(
          state,
          mixInput(nodeId),
          {
            bounceCount: read("bounceCount", 3),
            earDistance: read("earDistance", 17),
            level: read("level", 1),
            mix: read("mix", 0.5),
            rayCount: read("rayCount", 6),
            reflectivity: read("reflectivity", 0.6),
            roomHeight: read("roomHeight", 1),
            roomPreset: read("roomPreset", 0),
            roomRoundness: read("roomRoundness", 0.3),
            roomScale: read("roomScale", 4),
            roomSeed: read("roomSeed", 0),
            roomWidth: read("roomWidth", 1),
          },
          safeRate,
        );
      },
      reverbEffect: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.reverbEffectStates.get(nodeId) || this.createSabrinaReverbState();
        this.reverbEffectStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const monoInput = mixInput(nodeId, "In");
        const leftInput = mixInput(nodeId, "Left") + monoInput;
        const rightInput = mixInput(nodeId, "Right") + monoInput;
        return this.sabrinaReverbSample(
          state,
          leftInput,
          rightInput,
          {
            delaySize: read("delaySize", 0.02),
            diffusionAmount: read("diffusionAmount", 0.70),
            diffusionSize: read("diffusionSize", 0.35),
            lfoAmplitude: read("lfoAmplitude", 0.07),
            lfoBaseSpeed: read("lfoBaseSpeed", 0.83),
            lfoVariation: read("lfoVariation", 0.001),
            mix: read("mix", 0.43),
            recycle: read("recycle", 0.70),
            seed: read("seed", 0),
          },
          safeRate,
          frame,
        );
      },
      pll: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pllStates.get(nodeId) || this.createPllState();
        this.pllStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const cvConnected = this.inputConnections?.has?.(this.inputKey(nodeId, "VCO CV In")) ? 1 : 0;
        return this.pllSample(
          state,
          mixInput(nodeId, "Signal In"),
          mixInput(nodeId, "VCO CV In"),
          cvConnected,
          {
            range: read("range", 1),
            offset: read("offset", 5),
            type: read("type", 1),
            frequ: read("frequ", 10),
          },
          safeRate,
        );
      },
      helmholtzPitch: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.helmholtzStates.get(nodeId) || this.createHelmholtzState();
        this.helmholtzStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.helmholtzSample(
          state,
          mixInput(nodeId, "In"),
          {
            windowSize: read("windowSize", 512),
            threshold: read("threshold", 0.93),
          },
          hasInput(nodeId, "In"),
          safeRate,
        );
      },
      slewLimiter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.slewLimiterStates.get(nodeId) || this.createStereoSlewLimiterState();
        this.slewLimiterStates.set(nodeId, state);
        const slewUpTime = this.readEffectiveParameter(node, "upTime", 0.05, frame, frames, frameValues);
        const slewDownTime = this.readEffectiveParameter(node, "downTime", 0.20, frame, frames, frameValues);
        const slewMono = mixInput(nodeId);
        return {
          Out: this.slewLimiterSample(state.mono, slewMono, slewUpTime, slewDownTime, safeRate),
          Left: this.slewLimiterSample(state.left, mixInput(nodeId, "Left") + slewMono, slewUpTime, slewDownTime, safeRate),
          Right: this.slewLimiterSample(state.right, mixInput(nodeId, "Right") + slewMono, slewUpTime, slewDownTime, safeRate),
        };
      },
      sampleHold: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.sampleHoldStates.get(nodeId) || this.createStereoSampleHoldState();
        this.sampleHoldStates.set(nodeId, state);
        const sampleHoldTrigger = mixInput(nodeId, "Trigger");
        const sampleHoldThreshold = this.readEffectiveParameter(node, "threshold", 0, frame, frames, frameValues);
        const sampleHoldFrequency = this.readEffectiveParameter(node, "sampleFrequency", 0, frame, frames, frameValues);
        const sampleHoldMonoHasIn = hasInput(nodeId, "In");
        const sampleHoldMono = mixInput(nodeId, "In");
        return {
          Out: this.sampleHoldSample(state.mono, sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn, `${nodeId}:mono`),
          Left: this.sampleHoldSample(state.left, mixInput(nodeId, "Left") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn || hasInput(nodeId, "Left"), `${nodeId}:left`),
          Right: this.sampleHoldSample(state.right, mixInput(nodeId, "Right") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn || hasInput(nodeId, "Right"), `${nodeId}:right`),
        };
      },
      expAdsr: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.expAdsrStates.get(nodeId) || this.createExpAdsrState();
        this.expAdsrStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.expAdsrSample(
          state,
          mixInput(nodeId, "Gate"),
          {
            attack: read("attack", 0.08),
            attackShape: read("attackShape", 0.3),
            decay: read("decay", 0.22),
            delay: read("delay", 0),
            level: read("level", 1),
            loop: read("loop", 0),
            release: read("release", 0.45),
            releaseShape: read("releaseShape", 0.0001),
            sustain: read("sustain", 0.55),
          },
          safeRate,
        );
      },
      linearEnvelope: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.linearEnvelopeStates.get(nodeId) || this.createLinearEnvelopeState();
        this.linearEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.linearEnvelopeSample(
          state,
          mixInput(nodeId, "Gate"),
          {
            attack: read("attack", 0.08),
            decay: read("decay", 0.22),
            delay: read("delay", 0),
            level: read("level", 1),
            loop: read("loop", 0),
            release: read("release", 0.45),
            sustain: read("sustain", 0.55),
          },
          safeRate,
        );
      },
      pluckEnvelope: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pluckEnvelopeStates.get(nodeId) || this.createPluckEnvelopeState();
        this.pluckEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.pluckEnvelopeSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Release"),
          {
            attackFeedback: read("attackFeedback", 0.002),
            autoReleaseTime: read("autoReleaseTime", 0.08),
            decay: read("decay", 0.35),
            decayModCurve: read("decayModCurve", 0),
            decayModEnd: read("decayModEnd", 0.55),
            decayModFrequency: read("decayModFrequency", 1.5),
            decayModStart: read("decayModStart", 0.08),
            delayTime: read("delayTime", 0),
            endingDecay: read("endingDecay", 0.8),
            level: read("level", 1),
            releaseFeedback: read("releaseFeedback", 0.35),
            velocity: read("velocity", 1),
            velocitySensitivity: read("velocitySensitivity", 0),
          },
          safeRate,
        );
      },
      vactrolEnvelopeSeries: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.vactrolEnvelopeStates.get(nodeId) || this.createVactrolEnvelopeState();
        this.vactrolEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const isSeries = node?.type === "vactrolEnvelopeSeries";
        const seriesSpec = isSeries ? nodeGraphVactrolSeriesSpec(read("part", 2)) : null;
        return this.vactrolEnvelopeSample(
          state,
          mixInput(nodeId, "Light"),
          {
            attack: isSeries ? seriesSpec.attack : read("attack", 0.01),
            curve: read("curve", 1),
            darkCurrent: read("darkCurrent", 0),
            lightOffset: read("lightOffset", 0),
            release: isSeries ? seriesSpec.release : read("release", 0.1),
            sensitivity: read("sensitivity", 1),
          },
          safeRate,
        );
      },
      flowerChildEnvelopeFollower: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.flowerChildEnvelopeFollowerStates.get(nodeId) ||
          this.createFlowerChildEnvelopeFollowerState();
        this.flowerChildEnvelopeFollowerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.flowerChildEnvelopeFollowerSample(
          state,
          mixInput(nodeId, "In"),
          {
            attack: read("attack", 0.001),
            decay: read("decay", 0.001),
            hold: read("hold", 0.001),
          },
          safeRate,
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
        const level = read("level", 1);
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
        const fractalLevel = read("level", 1);
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
        const logSpiralLevel = read("level", 1);
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
        const level = read("level", 1);
        return {
          X: lorenz.x * level,
          Y: lorenz.y * level,
          Z: lorenz.z * level,
        };
      },
      noiseGenerator: (node, nodeId, frame, frames, frameValues) => {
        const state = this.noiseGeneratorStates.get(nodeId) || this.createNoiseGeneratorState();
        this.noiseGeneratorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.noiseGeneratorSample(
          state,
          {
            deviation: read("deviation", 0.5),
            level: read("level", 1),
            mean: read("mean", 0),
            mode: read("mode", 0),
            seed: read("seed", 1),
          },
          nodeId,
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
            level: read("level", 1),
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
          level: read("level", 1),
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
            level: read("level", 1),
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
            level: read("level", 1),
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
            level: read("level", 1),
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
      clock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.clockStates.get(nodeId) || this.createClockState();
        this.clockStates.set(nodeId, state);
        return this.clockSample(
          state,
          mixInput(nodeId, "Reset"),
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "rate", 2, frame, frames, frameValues),
          this.readEffectiveParameter(node, "duty", 0.5, frame, frames, frameValues),
          this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
          safeRate,
        );
      },
      transport: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.transportStates.get(nodeId) || this.createTransportState();
        this.transportStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.transportSample(
          state,
          {
            amplitude: read("amplitude", 1),
            divisions: read("divisions", 0),
          },
          safeRate,
        );
      },
      randomClock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.randomClockStates.get(nodeId) || this.createRandomClockState();
        this.randomClockStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.randomClockSample(
          state,
          mixInput(nodeId, "Reset"),
          {
            duty: read("duty", 0.5),
            level: read("level", 1),
            maxSeconds: read("maxSeconds", 1),
            minSeconds: read("minSeconds", 0.25),
            seed: read("seed", 1),
            threshold: read("threshold", 0),
            triggerTime: read("triggerTime", 0.01),
          },
          safeRate,
          nodeId,
        );
      },
      clockDivider: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.clockDividerStates.get(nodeId) || this.createTriggerDividerState();
        this.clockDividerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const division = Math.max(1, Math.min(64, Math.round(read("division", 2))));
        const clockConnection = (this.inputConnections.get(this.inputKey(nodeId, "Clock")) || [])[0];
        const clockSourceNode = this.nodes.get(clockConnection?.sourceNode);
        const sourceRate = clockSourceNode?.type === "clock"
          ? Math.max(0, Number(clockSourceNode.params?.rate) || 0)
          : 0;
        const pulseTime = sourceRate > 0
          ? this.clampValue(read("duty", 0.5), 0.01, 1) * division / sourceRate
          : 0.01;
        return this.triggerDividerSample(
          state,
          mixInput(nodeId, "Clock"),
          mixInput(nodeId, "Reset"),
          {
            division,
            level: read("level", 1),
            pulseTime,
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      delayedTrigger: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.delayedTriggerStates.get(nodeId) || this.createDelayedTriggerState();
        this.delayedTriggerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.delayedTriggerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            delay: read("delay", 0.1),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      triggerCounter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.triggerCounterStates.get(nodeId) || this.createTriggerCounterState();
        this.triggerCounterStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.triggerCounterSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            countMax: read("countMax", 8),
            increment: read("increment", 1),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      triggerDivider: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.triggerDividerStates.get(nodeId) || this.createTriggerDividerState();
        this.triggerDividerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.triggerDividerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            division: read("division", 2),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      stepSequencer: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.stepSequencerStates.get(nodeId) || this.createStepSequencerState();
        this.stepSequencerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.stepSequencerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            level: read("level", 1),
            steps: read("steps", 8),
            threshold: read("threshold", 0),
            values: [
              read("step1", 0),
              read("step2", 0.25),
              read("step3", 0.5),
              read("step4", 0.75),
              read("step5", 1),
              read("step6", 0.75),
              read("step7", 0.5),
              read("step8", 0.25),
            ],
          },
        );
      },
      stepGrid: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.stepGridStates.get(nodeId) || this.createStepGridState();
        this.stepGridStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // 16 duplicated from STEP_GRID_MAX_STEPS (public/modules/stepGrid/
        // step-grid-register.js) rather than shared -- that file is
        // main-thread-only (it also calls registerNodeGraphChromelessModule,
        // which doesn't exist in this worklet blob's execution context), so
        // it can't be added to nodeGraphLiveWorkletSourceFiles.
        const stepCount = Math.max(1, Math.min(16, Math.round(read("steps", 8))));
        const steps = [];
        for (let index = 1; index <= stepCount; index += 1) {
          steps.push(read(`step${index}`, 0));
        }
        return this.stepGridSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          { threshold: read("threshold", 0), steps },
        );
      },
      midiOut: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const hasMidiInput = this.inputConnections.has(this.inputKey(nodeId, "MIDI Number"));
        const midiNumber = this.readEffectiveParameter(node, "midiNumber", 60, frame, frames, frameValues);
        const resolved = typeof nodeGraphDspResolveMidiNumber === "function"
          ? nodeGraphDspResolveMidiNumber(midiNumber, mixInput(nodeId, "MIDI Number"), hasMidiInput)
          : (hasMidiInput
            ? this.clampValue(Math.round(Number(mixInput(nodeId, "MIDI Number")) || 0), 0, 127)
            : this.clampValue(Math.round(midiNumber), 0, 127));
        return typeof nodeGraphDspMidiNumberPorts === "function"
          ? nodeGraphDspMidiNumberPorts(resolved)
          : { "Full Value": resolved, Normalized: resolved / 127 };
      },
      midiNotePitch: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const pitch = this.clampValue((
          Number(mixInput(nodeId, "MIDI Note")) +
          Number(mixInput(nodeId, "Octave Offset")) * 12 +
          Number(mixInput(nodeId, "Pitch Offset"))
        ) || 0, 0, 127);
        const hz = typeof nodeGraphDspMidiNoteToHz === "function"
          ? nodeGraphDspMidiNoteToHz(pitch)
          : 440 * (2 ** ((pitch - 69) / 12));
        return {
          Frequency: hz,
          "Pitch 0-1": pitch / 127,
          "Pitch 0-127": pitch,
        };
      },
      keyboardController: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const signal = this.midiKeyboardSignal || {};
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const manualRawMidi = Number.isFinite(Number(signal.rawMidi))
          ? Number(signal.rawMidi)
          : Number(signal.midi) || 60;
        const manualOctave = Number(signal.octave) || 0;
        const octave = hasInput(nodeId, "Octave")
          ? this.clampValue(Math.round(Number(mixInput(nodeId, "Octave")) || 0), -6, 6)
          : manualOctave;
        const rawMidi = resetActive
          ? 60
          : (hasInput(nodeId, "MIDI Note") ? Number(mixInput(nodeId, "MIDI Note")) || 0 : manualRawMidi);
        const midi = this.clampValue(Math.round(rawMidi + octave * 12), 0, 127);
        const automatedPitch = resetActive || hasInput(nodeId, "MIDI Note") || hasInput(nodeId, "Octave");
        const key = automatedPitch
          ? this.clampValue(Math.round(rawMidi) - 48, 0, 24)
          : this.clampValue(Number(signal.keyIndex) || 12, 0, 24);
        const frequency = 440 * (2 ** ((midi - 69) / 12));
        const outputFrequency = Math.max(0, frequency);
        const increment = Math.max(0, outputFrequency / safeRate);
        const q = automatedPitch
          ? key / 24
          : this.clampValue(Number(signal.keyQuantized) || key / 24, 0, 1);
        const x = resetActive ? 0.5 : (hasInput(nodeId, "X")
          ? this.clampValue(Number(mixInput(nodeId, "X")) || 0, 0, 1)
          : this.clampValue(Number(signal.x) || q, 0, 1));
        const y = resetActive ? 0 : (hasInput(nodeId, "Y")
          ? this.clampValue(Number(mixInput(nodeId, "Y")) || 0, 0, 1)
          : this.clampValue(Number(signal.y) || 0, 0, 1));
        const gate = resetActive ? 0 : (hasInput(nodeId, "Gate")
          ? (Number(mixInput(nodeId, "Gate")) > 0 ? 1 : 0)
          : (Number(signal.gate) > 0 ? 1 : 0));
        const hold = hasInput(nodeId, "Hold") && Number(mixInput(nodeId, "Hold")) > 0 ? 1 : 0;
        const velocity = hasInput(nodeId, "Velocity")
          ? this.clampValue(Number(mixInput(nodeId, "Velocity")) || 0, 0, 1)
          : y;
        const gatePulse = this.midiKeyboardGatePulseSamples > 0 ? 1 : 0;
        this.midiKeyboardGatePulseSamples = Math.max(0, this.midiKeyboardGatePulseSamples - 1);
        // Held Keys phase-bit multiplexing -- see the design note on
        // nodeGraphMidiKeyboardHeldKeysTransmitValue in
        // node-graph-view-controls.js (duplicated here since this worklet
        // runs in a separate global scope and can't call that function).
        // Bit 49 of the transmitted value is a self-describing phase flag:
        // low half every sample (0-delay) unless the high half is
        // actually in use, in which case this instance alternates one
        // half per sample via a persistent phase counter.
        let heldKeysTransmitValue = this.midiKeyboardHeldKeysLowBitmask || 0;
        if (this.midiKeyboardHeldKeysHighBitmask) {
          this.midiKeyboardHeldKeysPhase = this.midiKeyboardHeldKeysPhase ? 0 : 1;
          if (this.midiKeyboardHeldKeysPhase) {
            heldKeysTransmitValue = (2 ** 49) + this.midiKeyboardHeldKeysHighBitmask;
          }
        }
        return {
          "1 Sample Gate": hasInput(nodeId, "Gate") ? gate : gatePulse,
          "0.1V/Oct": this.clampValue(midi / 120, 0, 1),
          Double: this.clampValue(midi / 127, 0, 1),
          Frequency: outputFrequency,
          Gate: Math.max(gate, hold),
          Increment: increment,
          Key: key,
          MIDI: midi,
          Pitch: midi,
          Q: q,
          X: x,
          Y: velocity,
          "Held Keys": heldKeysTransmitValue,
        };
      },
      buttonEvents: () => ({
        Click: this.externalButtonEventPulse("click"),
        Hover: this.externalButtonEventPulse("hover"),
        Down: this.externalButtonEventPulse("down"),
        Up: this.externalButtonEventPulse("up"),
        Enter: this.externalButtonEventPulse("enter"),
        Leave: this.externalButtonEventPulse("leave"),
      }),
      wireBreak: () => this.wireBreakEventSample(),
      wireConnect: () => this.wireConnectEventSample(),
      wireDisconnect: () => this.wireDisconnectEventSample(),
      windowReopen: () => this.windowReopenEventSample(),
      shootingStarExplosion: (node, nodeId, frame, frames, frameValues) => this.shootingStarExplosionEventSample(
        this.readEffectiveParameter(node, "lowRange", 0, frame, frames, frameValues),
        this.readEffectiveParameter(node, "highRange", 1, frame, frames, frameValues),
      ),
      nextPatch: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.patchCommandStates.get(nodeId) || this.createPatchCommandState();
        this.patchCommandStates.set(nodeId, state);
        return this.patchCommandTriggerSample(
          state,
          mixInput(nodeId, "Trigger"),
          this.readEffectiveParameter(node, "threshold", 0, frame, frames, frameValues),
          node?.type === "previousPatch" ? "previousPatch" : "nextPatch",
          nodeId,
        );
      },
      macroControls: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const value = {};
        for (let index = 0; index < 8; index += 1) {
          const port = `M${index + 1} In`;
          value[`M${index + 1}`] = resetActive
            ? 0
            : this.clampValue(hasInput(nodeId, port)
              ? Number(mixInput(nodeId, port)) || 0
              : Number(this.macroControls?.[index]) || 0, 0, 1);
        }
        return value;
      },
      pitchModWheel: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const pitchWheel = resetActive ? 0 : (hasInput(nodeId, "Pitch")
          ? Number(mixInput(nodeId, "Pitch")) || 0
          : Number(this.pitchModWheelSignal?.pitch));
        const modWheel = resetActive ? 0 : (hasInput(nodeId, "Mod")
          ? Number(mixInput(nodeId, "Mod")) || 0
          : Number(this.pitchModWheelSignal?.mod) || 0);
        return {
          "Mod Wheel": this.clampValue(modWheel, 0, 1),
          "Pitch Wheel": this.clampValue(Number.isFinite(pitchWheel) ? pitchWheel : 0, -1, 1),
        };
      },
      gain: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const gainAmount = this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues);
        const gainMono = mixInput(nodeId);
        return {
          Out: gainMono * gainAmount,
          Left: (mixInput(nodeId, "Left") + gainMono) * gainAmount,
          Right: (mixInput(nodeId, "Right") + gainMono) * gainAmount,
        };
      },
      led: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      rgbShape: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      rgbPicture: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      rgbFractal: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      bitConverter: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const bits = Math.max(1, Math.min(53, Math.round(
          this.readEffectiveParameter(node, "bits", 53, frame, frames, frameValues),
        )));
        const maxValue = 2 ** bits - 1;
        const fullScale = Math.max(0, Math.min(maxValue, Number(mixInput(nodeId, "Full Scale")) || 0));
        const unipolar = Math.max(0, Math.min(1, Number(mixInput(nodeId, "Unipolar")) || 0));
        const bipolar = Math.max(-1, Math.min(1, Number(mixInput(nodeId, "Bipolar")) || 0));
        return {
          "Full Scale to Unipolar": maxValue > 0 ? fullScale / maxValue : 0,
          "Full Scale to Bipolar": maxValue > 0 ? (fullScale / maxValue) * 2 - 1 : -1,
          "Unipolar to Full Scale": Math.round(unipolar * maxValue),
          "Bipolar to Full Scale": Math.round(((bipolar + 1) / 2) * maxValue),
        };
      },
      // Gain and Bias in one: scale, then offset. Mirror of the gainBias
      // branch in modules/gainBias/gain-bias-live-evaluator.js -- sibling
      // execution lanes, identical output for identical input.
      gainBias: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const gainBiasAmount = this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues);
        const gainBiasOffset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        const gainBiasMono = mixInput(nodeId);
        return {
          Out: gainBiasMono * gainBiasAmount + gainBiasOffset,
          Left: (mixInput(nodeId, "Left") + gainBiasMono) * gainBiasAmount + gainBiasOffset,
          Right: (mixInput(nodeId, "Right") + gainBiasMono) * gainBiasAmount + gainBiasOffset,
        };
      },
      bias: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const biasOffset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        const biasMono = mixInput(nodeId);
        return {
          Out: biasMono + biasOffset,
          Left: mixInput(nodeId, "Left") + biasMono + biasOffset,
          Right: mixInput(nodeId, "Right") + biasMono + biasOffset,
        };
      },
      softClipper: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const softClipperCenter = this.readEffectiveParameter(node, "center", 0, frame, frames, frameValues);
        const softClipperWidth = this.readEffectiveParameter(node, "width", 2, frame, frames, frameValues);
        const softClipperMono = mixInput(nodeId);
        return {
          Out: this.nativeSoftClipperSample(softClipperMono, softClipperCenter, softClipperWidth),
          Left: this.nativeSoftClipperSample(mixInput(nodeId, "Left") + softClipperMono, softClipperCenter, softClipperWidth),
          Right: this.nativeSoftClipperSample(mixInput(nodeId, "Right") + softClipperMono, softClipperCenter, softClipperWidth),
        };
      },
      rotate3dTo2d: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const angleX = this.readEffectiveParameter(node, "rotateX", 0, frame, frames, frameValues) * Math.PI * 2;
        const angleY = this.readEffectiveParameter(node, "rotateY", 0, frame, frames, frameValues) * Math.PI * 2;
        const angleZ = this.readEffectiveParameter(node, "rotateZ", 0, frame, frames, frameValues) * Math.PI * 2;
        let x = this.safeFilterNumber(mixInput(nodeId, "X"), null);
        let y = this.safeFilterNumber(mixInput(nodeId, "Y"), null);
        let z = this.safeFilterNumber(mixInput(nodeId, "Z"), null);
        const sinX = Math.sin(angleX);
        const cosX = Math.cos(angleX);
        const nextY = y * cosX - z * sinX;
        const nextZ = y * sinX + z * cosX;
        y = nextY;
        z = nextZ;
        const sinY = Math.sin(angleY);
        const cosY = Math.cos(angleY);
        const nextX = x * cosY + z * sinY;
        z = -x * sinY + z * cosY;
        x = nextX;
        const sinZ = Math.sin(angleZ);
        const cosZ = Math.cos(angleZ);
        return {
          X: this.safeFilterNumber(x * cosZ - y * sinZ, null),
          Y: this.safeFilterNumber(x * sinZ + y * cosZ, null),
        };
      },
      knob: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const offset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        return nodeGraphDspBiasFromIn(offset, mixInput?.(nodeId, "In"));
      },
      pluginSlider: (node, nodeId, frame, frames, frameValues, mixInput) =>
        nodeGraphDspBiasFromIn(
          this.readEffectiveParameter(node, "value", 0, frame, frames, frameValues),
          mixInput?.(nodeId, "In"),
        ),
      toggleButton: (node, nodeId, frame, frames, frameValues) =>
        nodeGraphDspBinaryOut(this.readEffectiveParameter(node, "value", 0, frame, frames, frameValues)),
      momentaryButton: (node, nodeId, frame, frames, frameValues) =>
        nodeGraphDspBinaryOut(this.readEffectiveParameter(node, "value", 0, frame, frames, frameValues)),
      pluginInput: (node, nodeId, frame, frames, frameValues) =>
        nodeGraphDspExternalStereoFrame(
          this.externalInput,
          frame,
          this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
        ),
      pluginOutput: (node, nodeId, frame, frames, frameValues, mixInput) =>
        nodeGraphDspStereoMix(
          mixInput(nodeId, "Mono"),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
        ),
      pluginMidiIn: (node, nodeId, frame, frames, frameValues) =>
        nodeGraphDspMidiKeyboardPorts(
          this.midiKeyboardSignal || {},
          this.readEffectiveParameter(node, "defaultNote", 60, frame, frames, frameValues),
        ),
      pluginMidiOut: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const hasMidiInput = this.inputConnections.has(this.inputKey(nodeId, "MIDI Number"));
        const midiNumber = this.readEffectiveParameter(node, "midiNumber", 60, frame, frames, frameValues);
        const midi = nodeGraphDspResolveMidiNumber(
          midiNumber,
          mixInput(nodeId, "MIDI Number"),
          hasMidiInput,
        );
        const hasGate = this.inputConnections.has(this.inputKey(nodeId, "Gate"));
        return nodeGraphDspMidiNumberPorts(midi, {
          includeGate: true,
          hasGate,
          gate: mixInput(nodeId, "Gate"),
        });
      },
      sandboxVisuals: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const screenShake = this.smoothVisualControl(
          "screenShake",
          this.visualControlIntensity(mixInput(nodeId, "Shake"), nodeId, "screen visuals shake"),
          safeRate,
        );
        const x = this.smoothVisualControl(
          "x",
          this.visualControlSigned(mixInput(nodeId, "X"), nodeId, "sandbox visuals x"),
          safeRate,
          0.045,
          -1,
          1,
        );
        const y = this.smoothVisualControl(
          "y",
          this.visualControlSigned(mixInput(nodeId, "Y"), nodeId, "sandbox visuals y"),
          safeRate,
          0.045,
          -1,
          1,
        );
        const screenDim = this.smoothVisualControl(
          "screenDim",
          this.visualControlIntensity(mixInput(nodeId, "Dim"), nodeId, "screen visuals dim"),
          safeRate,
        );
        const red = this.smoothVisualControl(
          "red",
          this.visualControlIntensity(mixInput(nodeId, "Red"), nodeId, "sandbox visuals red"),
          safeRate,
        );
        const green = this.smoothVisualControl(
          "green",
          this.visualControlIntensity(mixInput(nodeId, "Green"), nodeId, "sandbox visuals green"),
          safeRate,
        );
        const blue = this.smoothVisualControl(
          "blue",
          this.visualControlIntensity(mixInput(nodeId, "Blue"), nodeId, "sandbox visuals blue"),
          safeRate,
        );
        const scopeTracesOff = this.smoothVisualControl(
          "scopeTracesOff",
          this.visualControlIntensity(mixInput(nodeId, "Scope Off"), nodeId, "screen visuals scope off"),
          safeRate,
          0,
        );
        const scopePaused = this.smoothVisualControl(
          "scopePaused",
          this.visualControlIntensity(mixInput(nodeId, "Pause"), nodeId, "screen visuals pause"),
          safeRate,
          0,
        );
        return {
          Blue: blue,
          Green: green,
          Pause: scopePaused,
          Red: red,
          ScopeOff: scopeTracesOff,
          ScreenDim: screenDim,
          ScreenShake: screenShake,
          X: x,
          Y: y,
        };
      },
      screenSpaceShader: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => this.screenSpaceShaderSample(
        node,
        (port) => mixInput(nodeId, port),
        safeRate,
        nodeId,
      ),
      bloomGlow: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const screenDim = this.smoothVisualControl(
          "screenDim",
          read("screenDim", 0),
          safeRate,
        );
        const visualBrightness = this.smoothVisualControl(
          "visualBrightness",
          read("visualBrightness", 0.55),
          safeRate,
        );
        const visualBloom = this.smoothVisualControl(
          "visualBloom",
          read("visualBloom", 0.45),
          safeRate,
        );
        const visualGlow = this.smoothVisualControl(
          "visualGlow",
          read("visualGlow", 0.6),
          safeRate,
        );
        return {
          Bloom: visualBloom,
          Brightness: visualBrightness,
          Dim: screenDim,
          Glow: visualGlow,
        };
      },
      rgbaHsla: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const rgbRed = this.visualControlIntensity(mixInput(nodeId, "Red"), nodeId, "rgba hsla red");
        const rgbGreen = this.visualControlIntensity(mixInput(nodeId, "Green"), nodeId, "rgba hsla green");
        const rgbBlue = this.visualControlIntensity(mixInput(nodeId, "Blue"), nodeId, "rgba hsla blue");
        const hue = this.visualControlIntensity(mixInput(nodeId, "Hue"), nodeId, "rgba hsla hue");
        const saturation = this.visualControlIntensity(mixInput(nodeId, "Saturation"), nodeId, "rgba hsla saturation");
        const lightness = this.visualControlIntensity(mixInput(nodeId, "Lightness"), nodeId, "rgba hsla lightness");
        const hslMix = this.visualControlIntensity(mixInput(nodeId, "HSL Mix"), nodeId, "rgba hsla hsl mix");
        const hslRgb = this.visualHslToRgb(hue, saturation, lightness);
        const red = this.smoothVisualControl("red", rgbRed * (1 - hslMix) + hslRgb[0] * hslMix, safeRate);
        const green = this.smoothVisualControl("green", rgbGreen * (1 - hslMix) + hslRgb[1] * hslMix, safeRate);
        const blue = this.smoothVisualControl("blue", rgbBlue * (1 - hslMix) + hslRgb[2] * hslMix, safeRate);
        const alpha = this.smoothVisualControl(
          "screenDim",
          this.visualControlIntensity(mixInput(nodeId, "Alpha"), nodeId, "rgba hsla alpha"),
          safeRate,
        );
        return { Alpha: alpha, Blue: blue, Green: green, Red: red };
      },
      chromaColor: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const chromaHue = this.smoothVisualControl(
          "chromaHue",
          read("chromaHue", 0.58),
          safeRate,
        );
        const chromaSaturation = this.smoothVisualControl(
          "chromaSaturation",
          read("chromaSaturation", 0.82),
          safeRate,
        );
        const chromaLightness = this.smoothVisualControl(
          "chromaLightness",
          read("chromaLightness", 0.52),
          safeRate,
        );
        const chromaAlpha = this.smoothVisualControl(
          "chromaAlpha",
          read("chromaAlpha", 0.35),
          safeRate,
        );
        const chromaDrift = this.smoothVisualControl(
          "chromaDrift",
          read("chromaDrift", 0.25),
          safeRate,
        );
        const chromaSpread = this.smoothVisualControl(
          "chromaSpread",
          read("chromaSpread", 0.4),
          safeRate,
        );
        const visualBrightness = this.smoothVisualControl(
          "visualBrightness",
          read("visualBrightness", 0.55),
          safeRate,
        );
        const visualBloom = this.smoothVisualControl(
          "visualBloom",
          read("visualBloom", 0.45),
          safeRate,
        );
        const visualGlow = this.smoothVisualControl(
          "visualGlow",
          read("visualGlow", 0.6),
          safeRate,
        );
        return {
          Alpha: chromaAlpha,
          Bloom: visualBloom,
          Chroma: chromaSaturation,
          Drift: chromaDrift,
          Glow: visualGlow,
          Hue: chromaHue,
          Light: chromaLightness,
          Spread: chromaSpread,
          TraceBrightness: visualBrightness,
        };
      },
      badvalMonitor: (node, nodeId, frame, frames, frameValues, mixInput) => this.monitorBadValueSample(mixInput(nodeId), nodeId),
      speakerProtection: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const speakerProtectionMono = mixInput(nodeId);
        return {
          Out: this.speakerProtectionSample(speakerProtectionMono, nodeId),
          Left: this.speakerProtectionSample(mixInput(nodeId, "Left") + speakerProtectionMono, nodeId),
          Right: this.speakerProtectionSample(mixInput(nodeId, "Right") + speakerProtectionMono, nodeId),
        };
      },
      groupOutput: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: mixInput(nodeId, "In"),
      }),
      output: (node, nodeId, frame, frames, frameValues, mixInput) =>
        nodeGraphDspStereoMix(
          mixInput(nodeId, "Mono"),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
        ),
      groupInput: (node, nodeId) => ({
        Out: Number(this.externalGroupInputs?.get(nodeId)) || 0,
      }),
      audioPlayer: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const readParam = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.audioPlayerSample(
          node,
          nodeId,
          (port) => mixInput(nodeId, port),
          readParam,
          safeRate,
        );
      },
      moduleGroup: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) => this.evaluateModuleGroup(node, mixInput, frame, frames, safeRate, inputFrame),
      codeblock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) => this.evaluateCodeblock(node, mixInput, frame, frames, safeRate, inputFrame),
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
        const radarLevel = read("level", 1);
        return {
          X: radar.x * radarLevel,
          Y: radar.y * radarLevel,
        };
      },
      gainBiasMix: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.gainBiasMixStates.get(nodeId) || this.createGainBiasMixState();
        this.gainBiasMixStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.gainBiasMixSample(state, {
          bias1: read("bias1", 0),
          bias2: read("bias2", 0),
          bias3: read("bias3", 0),
          bias4: read("bias4", 0),
          bleed2to1: read("bleed2to1", 0),
          bleed3to1: read("bleed3to1", 0),
          bleed4to1: read("bleed4to1", 0),
          in1: mixInput(nodeId, "In1"),
          in2: mixInput(nodeId, "In2"),
          in3: mixInput(nodeId, "In3"),
          in4: mixInput(nodeId, "In4"),
          volume1: read("volume1", 1),
          volume2: read("volume2", 1),
          volume3: read("volume3", 1),
          volume4: read("volume4", 1),
        }, nodeId);
      },
      sinc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.sincStates.get(nodeId) || this.createSincState();
        this.sincStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const baseFreq = Math.max(0, read("freq", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const pitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"))
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitched = (typeof nodeGraphPitchedFrequency === "function"
          ? nodeGraphPitchedFrequency(baseFreq, pitchInput, referenceVoltage)
          : Math.max(0, baseFreq * (2 ** ((pitchInput - referenceVoltage) / 0.1))));
        return this.sincSample(state, {
          freq: this.resolveFrequencyHz(pitched, this.readFInputHz(mixInput, nodeId)),
          phase: read("phase", 0),
          lobes: read("lobes", 4),
          bandLimit: read("bandLimit", 1),
        }, nodeId);
      },
    };
};
