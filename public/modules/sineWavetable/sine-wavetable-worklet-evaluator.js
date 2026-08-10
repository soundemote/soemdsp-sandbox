// Realtime worklet evaluator for sineWavetable, split out of
// node-live-audio-worklet-core.js. Loaded as part of the Blob-assembled
// AudioWorklet module (see nodeGraphLiveWorkletSourceFiles in
// node-graph-live-runtime.js) after core.js defines the class and before
// register.js calls registerProcessor -- no call-site changes needed
// since the dispatch registry calls this.sineWavetableWorkletEvaluate(...)
// via a thin arrow function still declared in core.js's
// buildLiveModuleEvaluators().
const nodeLiveSineWavetableSize = 2048;
const nodeLiveSineWavetable = new Float32Array(nodeLiveSineWavetableSize + 1);
for (let index = 0; index <= nodeLiveSineWavetableSize; index += 1) {
  nodeLiveSineWavetable[index] = Math.sin((index / nodeLiveSineWavetableSize) * Math.PI * 2);
}

function nodeLiveClamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function nodeLiveSmoothStep01(value) {
  const t = nodeLiveClamp01(value);
  return t * t * (3 - 2 * t);
}

function nodeLiveNyquistFadeAmplitude(frequency, sampleRate) {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = safeRate * 0.5;
  const safeFrequency = Math.max(0, Number(frequency) || 0);
  const fadeStart = Math.min(20000, nyquist * 0.9);
  if (safeFrequency <= fadeStart) {
    return 1;
  }
  if (safeFrequency >= nyquist) {
    return 0;
  }
  const fadeProgress = (safeFrequency - fadeStart) / Math.max(1, nyquist - fadeStart);
  return 1 - nodeLiveSmoothStep01(fadeProgress);
}

function nodeLiveWrap01(value) {
  return ((Number(value) || 0) % 1 + 1) % 1;
}

function nodeLiveSineWavetableLookup(phaseRadians) {
  const cycle = nodeLiveWrap01((Number(phaseRadians) || 0) / (Math.PI * 2));
  const position = cycle * nodeLiveSineWavetableSize;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = nodeLiveSineWavetable[index] || 0;
  const b = nodeLiveSineWavetable[index + 1] || nodeLiveSineWavetable[0] || 0;
  return a + (b - a) * fraction;
}

function nodeLiveSineCosWavetableSample(phaseRadians, frequency, amplitude, sampleRate) {
  const level = Math.max(0, Number(amplitude) || 0) * nodeLiveNyquistFadeAmplitude(frequency, sampleRate);
  return {
    cos: nodeLiveSineWavetableLookup((Number(phaseRadians) || 0) + Math.PI * 0.5) * level,
    sin: nodeLiveSineWavetableLookup(phaseRadians) * level,
  };
}

NodeLiveAudioProcessor.prototype.createSineWavetableState = function createSineWavetableState() {
  return {
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.sineWavetableWorkletEvaluate = function sineWavetableWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate) {
  const phaseOffset = this.phaseRadians(
    this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
  );
  const baseFrequency = this.readEffectiveParameter(
    node,
    "freq",
    440,
    frame,
    frames,
    frameValues,
  );
  const freqInput = this.safeFilterNumber(mixInput(nodeId, "Freq"), null);
  // Amp parameter only (Amplitude CV jack removed).
  const amplitude = Math.max(
    0,
    this.readEffectiveParameter(node, "amp", 1, frame, frames, frameValues),
  );
  const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
  const referenceVoltage = referenceMidiNote / 120;
  const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitchInput
    ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
    : referenceVoltage;
  const fHz = this.readFInputHz(mixInput, nodeId);
  const baseWithFreqJack = baseFrequency + freqInput;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: baseWithFreqJack,
      hasPitchCv: hasPitchInput,
      pitchCv,
      referenceVoltage,
      fHz,
    })
    : this.resolveFrequencyHz(
      (typeof nodeGraphPitchedFrequency === "function"
        ? nodeGraphPitchedFrequency(baseWithFreqJack, pitchCv, referenceVoltage)
        : Math.max(0, baseWithFreqJack * (2 ** ((pitchCv - referenceVoltage) / 0.1)))),
      fHz,
    );
  let value;
  if (
    this.nativeSineWavetableReady &&
    this.nativeSineWavetable?.soemdsp_sine_wavetable_create &&
    this.nativeSineWavetable?.soemdsp_sine_wavetable_sample
  ) {
    try {
      const nativeState = this.sineWavetableStates.get(nodeId) || this.createSineWavetableState();
      this.sineWavetableStates.set(nodeId, nativeState);
      if (!nativeState.nativeHandle) {
        nativeState.nativeHandle = this.nativeSineWavetable.soemdsp_sine_wavetable_create();
      }
      if (nativeState.nativeHandle) {
        this.nativeSineWavetable.soemdsp_sine_wavetable_sample(
          nativeState.nativeHandle,
          phaseOffset,
          effectiveFrequency,
          amplitude,
          safeRate,
        );
        value = {
          sin: this.nativeSineWavetable.soemdsp_sine_wavetable_sin(nativeState.nativeHandle),
          cos: this.nativeSineWavetable.soemdsp_sine_wavetable_cos(nativeState.nativeHandle),
        };
      } else {
        throw new Error("native SinCos handle pool exhausted");
      }
    } catch (error) {
      this.nativeSineWavetableReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "sine_wavetable",
        status: "disabled",
        message: String(error?.message || error || "native SinCos failed"),
      });
    }
  }
  if (!this.nativeSineWavetableReady) {
    const phase = this.phases.get(nodeId) || 0;
    const phaseIncrement = effectiveFrequency / safeRate;
    value = nodeLiveSineCosWavetableSample(phase + phaseOffset, effectiveFrequency, amplitude, safeRate);
    this.phases.set(
      nodeId,
      this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
    );
  }
  return value;
};
