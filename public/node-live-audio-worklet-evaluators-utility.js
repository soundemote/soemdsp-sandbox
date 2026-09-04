// Extracted cluster of buildLiveModuleEvaluators map entries (Phase D navigation split).
// Behavior must match the prior monolith bit-for-bit.

NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators_utility = function buildLiveModuleEvaluators_utility() {
  const map = {
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
        // Y is mouse/pointer vertical position only — not MIDI velocity.
        const y = resetActive ? 0 : (hasInput(nodeId, "Y")
          ? this.clampValue(Number(mixInput(nodeId, "Y")) || 0, 0, 1)
          : this.clampValue(Number(signal.y) || 0, 0, 1));
        const gate = resetActive ? 0 : (hasInput(nodeId, "Gate")
          ? (Number(mixInput(nodeId, "Gate")) > 0 ? 1 : 0)
          : (Number(signal.gate) > 0 ? 1 : 0));
        const hold = hasInput(nodeId, "Hold") && Number(mixInput(nodeId, "Hold")) > 0 ? 1 : 0;
        const velocity01 = hasInput(nodeId, "Velocity")
          ? this.clampValue(Number(mixInput(nodeId, "Velocity")) || 0, 0, 1)
          : this.clampValue(Number(signal.velocity) || 0, 0, 1);
        const velocityNumber = Math.round(velocity01 * 127);
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
          Trigger: hasInput(nodeId, "Gate") ? gate : gatePulse,
          "0.1V/Oct": this.clampValue(midi / 120, 0, 1),
          "0.1v/Oct": this.clampValue(midi / 120, 0, 1),
          "Note#/127": this.clampValue(midi / 127, 0, 1),
          Frequency: outputFrequency,
          Gate: Math.max(gate, hold),
          "Inc.": increment,
          Increment: increment,
          KeyboardKey: key,
          "Note#": midi,
          KeyboardNorm: q,
          "Velocity#": velocityNumber,
          "Velocity#/127": velocity01,
          X: x,
          Y: y,
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
        const value = {};
        for (let index = 0; index < 8; index += 1) {
          const port = `M${index + 1} In`;
          value[`M${index + 1}`] = this.clampValue(hasInput(nodeId, port)
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
        const pitch = this.clampValue(Number.isFinite(pitchWheel) ? pitchWheel : 0, -1, 1);
        const mod = this.clampValue(modWheel, 0, 1);
        return {
          Pitch: pitch,
          Mod: mod,
          // Legacy jack names (pre Pitch/Mod rename).
          "Pitch Wheel": pitch,
          "Mod Wheel": mod,
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
      rgbFractal: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.rgbFractalStates) {
          this.rgbFractalStates = new Map();
        }
        const state = this.rgbFractalStates.get(nodeId) || this.createRgbFractalState();
        this.rgbFractalStates.set(nodeId, state);
        const read = (key, fallback) =>
          this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const params = {
          speed: read("speed", 1),
          seed: read("seed", 0),
          orbitSize: read("orbitSize", 1),
          orbitSpeed: read("orbitSpeed", 1),
          detune: read("detune", 0.45),
        };
        const sr = Math.max(1, Number(safeRate) || sampleRate || 44100);
        const result = this.rgbFractalSample(state, params, 0, sr) || {};
        return {
          Hx: this.safeFilterNumber(result.Hx, null),
          Hy: this.safeFilterNumber(result.Hy, null),
        };
      },
      knob: (node, nodeId, frame, frames, frameValues, mixInput) => {
        if (typeof nodeGraphDspApplyControllerLiveSmoothing === "function") {
          nodeGraphDspApplyControllerLiveSmoothing(node);
        }
        const offset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        const rangeMin = this.readEffectiveParameter(node, "rangeMin", 0, frame, frames, frameValues);
        const rangeMax = this.readEffectiveParameter(node, "rangeMax", 1, frame, frames, frameValues);
        const polarity = this.readEffectiveParameter(node, "polarity", 0, frame, frames, frameValues);
        const range = typeof nodeGraphDspControllerRange === "function"
          ? nodeGraphDspControllerRange(rangeMin, rangeMax, polarity)
          : (typeof nodeGraphDspKnobBiasRange === "function"
            ? nodeGraphDspKnobBiasRange(rangeMax, polarity)
            : { min: 0, max: 1 });
        return nodeGraphDspBiasFromIn(offset, mixInput?.(nodeId, "In"), range.min, range.max);
      },
      pluginSlider: (node, nodeId, frame, frames, frameValues, mixInput) =>
        nodeGraphDspBiasFromIn(
          this.readEffectiveParameter(node, "value", 0, frame, frames, frameValues),
          mixInput?.(nodeId, "In"),
        ),
      toggleButton: (node, nodeId, frame, frames, frameValues) => {
        if (typeof nodeGraphDspApplyControllerLiveSmoothing === "function") {
          nodeGraphDspApplyControllerLiveSmoothing(node);
        }
        const unit = this.readEffectiveParameter(node, "value", 0, frame, frames, frameValues);
        const rangeMin = this.readEffectiveParameter(node, "rangeMin", 0, frame, frames, frameValues);
        const rangeMax = this.readEffectiveParameter(node, "rangeMax", 1, frame, frames, frameValues);
        const out = typeof nodeGraphDspControllerUnitToRange === "function"
          ? nodeGraphDspControllerUnitToRange(unit, rangeMin, rangeMax)
          : unit;
        return { Out: out, value: out };
      },
      momentaryButton: (node, nodeId, frame, frames, frameValues) => {
        if (typeof nodeGraphDspApplyControllerLiveSmoothing === "function") {
          nodeGraphDspApplyControllerLiveSmoothing(node);
        }
        const unit = this.readEffectiveParameter(node, "value", 0, frame, frames, frameValues);
        const rangeMin = this.readEffectiveParameter(node, "rangeMin", 0, frame, frames, frameValues);
        const rangeMax = this.readEffectiveParameter(node, "rangeMax", 1, frame, frames, frameValues);
        const out = typeof nodeGraphDspControllerUnitToRange === "function"
          ? nodeGraphDspControllerUnitToRange(unit, rangeMin, rangeMax)
          : unit;
        return { Out: out, value: out };
      },
      audioInput: (node, nodeId, frame, frames, frameValues, mixInput, _safeRate, _hasInput, inputFrame) => {
        const amplitude = this.readEffectiveParameter(node, "amplitude", NaN, frame, frames, frameValues);
        const level = Number.isFinite(amplitude)
          ? amplitude
          : this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);
        const live = nodeGraphDspExternalStereoFrame(
          this.externalInput,
          inputFrame ?? frame,
          level,
        );
        return typeof nodeGraphDspSandboxIoFrame === "function"
          ? nodeGraphDspSandboxIoFrame(
            live,
            mixInput(nodeId, "Mono"),
            mixInput(nodeId, "Left"),
            mixInput(nodeId, "Right"),
          )
          : live;
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
      portalInlet: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) =>
        this.evaluatePortalInlet(node, nodeId, mixInput, inputFrame ?? frame),
      portalOutlet: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.evaluatePortalOutlet(node, nodeId, mixInput),
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
      samplePlayer: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const readParam = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.sampleLibrarySample(
          node,
          nodeId,
          (port) => mixInput(nodeId, port),
          readParam,
          safeRate,
        );
      },
      sampleLooper: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const readParam = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.sampleLooperSample(
          node,
          nodeId,
          (port) => mixInput(nodeId, port),
          readParam,
          safeRate,
        );
      },
      codeblock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) => this.evaluateCodeblock(node, mixInput, frame, frames, safeRate, inputFrame),
  };
  const inletEval = (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) =>
    this.evaluatePortalInlet(node, nodeId, mixInput, inputFrame ?? frame);
  const outletEval = (node, nodeId, frame, frames, frameValues, mixInput) =>
    this.evaluatePortalOutlet(node, nodeId, mixInput);
  const inletTypes = typeof nodeGraphPortalInletTypes === "function"
    ? nodeGraphPortalInletTypes()
    : ["portalInlet"];
  const outletTypes = typeof nodeGraphPortalOutletTypes === "function"
    ? nodeGraphPortalOutletTypes()
    : ["portalOutlet"];
  for (const type of inletTypes) {
    map[type] = inletEval;
  }
  for (const type of outletTypes) {
    map[type] = outletEval;
  }
  // Keyboard controller-face module — same global piano SSOT as MIDI outs.
  map.keyboard = map.keyboardController;
  return map;
};

NodeLiveAudioProcessor.prototype.evaluatePortalInlet = function evaluatePortalInlet(node, nodeId, mixInput, frame) {
  if (typeof nodeGraphEvaluatePortalInlet === "function") {
    return nodeGraphEvaluatePortalInlet(this.externalInput, node?.type, nodeId, mixInput, frame);
  }
  return { Left: 0, Mono: 0, Out: 0, Right: 0 };
};

NodeLiveAudioProcessor.prototype.evaluatePortalOutlet = function evaluatePortalOutlet(node, nodeId, mixInput) {
  if (typeof nodeGraphEvaluatePortalOutlet === "function") {
    return nodeGraphEvaluatePortalOutlet(node?.type, nodeId, mixInput);
  }
  return { Left: 0, Mono: 0, Out: 0, Right: 0 };
};
