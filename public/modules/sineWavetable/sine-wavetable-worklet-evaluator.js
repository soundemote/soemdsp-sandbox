// Worklet evaluator for SinCos4 (sineWavetable) and SinCos (sinCos).
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

/** Additive half-sine LUT (2^15) — same table Yellow Graph uses. */
const nodeLiveAdditiveSinLutHalf = 32768;
let nodeLiveAdditiveSinLut = null;
function nodeLiveEnsureAdditiveSinLut() {
  if (nodeLiveAdditiveSinLut && nodeLiveAdditiveSinLut.length === nodeLiveAdditiveSinLutHalf + 1) {
    return nodeLiveAdditiveSinLut;
  }
  const n = nodeLiveAdditiveSinLutHalf;
  const lut = new Float32Array(n + 1);
  for (let i = 0; i <= n; i += 1) {
    lut[i] = Math.sin(Math.PI * (i / n));
  }
  nodeLiveAdditiveSinLut = lut;
  return lut;
}
function nodeLiveAdditiveSinTurn(phase01) {
  const lut = nodeLiveEnsureAdditiveSinLut();
  const n = nodeLiveAdditiveSinLutHalf;
  let p = Number(phase01) || 0;
  p -= Math.floor(p);
  if (p < 0) p += 1;
  if (p < 0.5) {
    const x = p * 2 * n;
    const i = x | 0;
    const f = x - i;
    const a = lut[i];
    const b = lut[i + 1 < lut.length ? i + 1 : i];
    return a + (b - a) * f;
  }
  const x = (p - 0.5) * 2 * n;
  const i = x | 0;
  const f = x - i;
  const a = lut[i];
  const b = lut[i + 1 < lut.length ? i + 1 : i];
  return -(a + (b - a) * f);
}
function nodeLiveSineCosAdditiveLutSample(phaseRadians, frequency, amplitude, sampleRate) {
  const level = Math.max(0, Number(amplitude) || 0) * nodeLiveNyquistFadeAmplitude(frequency, sampleRate);
  const turns = (Number(phaseRadians) || 0) / (Math.PI * 2);
  return {
    sin: nodeLiveAdditiveSinTurn(turns) * level,
    cos: nodeLiveAdditiveSinTurn(turns + 0.25) * level,
  };
}

function nodeLiveSinCos4FromPair(sin, cos, mode) {
  const s = Number(sin) || 0;
  const c = Number(cos) || 0;
  const m = Math.max(0, Math.min(5, Math.round(Number(mode) || 0)));
  const z = 0;
  if (m === 0) {
    return { A: s, B: z, C: z, D: z };
  }
  if (m === 1) {
    return { A: c, B: z, C: z, D: z };
  }
  if (m === 2) {
    return { A: s, B: c, C: z, D: z };
  }
  if (m === 3) {
    return { A: s, B: -s, C: z, D: z };
  }
  if (m === 4) {
    const k = Math.sqrt(3) * 0.5;
    const b = s * -0.5 + c * k;
    const d = s * -0.5 - c * k;
    return { A: s, B: b, C: d, D: z };
  }
  return { A: s, B: c, C: -s, D: -c };
}

NodeLiveAudioProcessor.prototype.createSineWavetableState = function createSineWavetableState() {
  return {
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.sineWavetableAdvancePair = function sineWavetableAdvancePair(node, nodeId, frame, frames, frameValues, mixInput, safeRate) {
  const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
  this.oscResetStates.set(nodeId, resetState);
  const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const freePhase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
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
  const freqInput = this.safeFilterNumber(mixInput(nodeId, "f"), null);
  const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
  const amplitude = Math.max(
    0,
    this.readEffectiveParameter(node, "amp", 1, frame, frames, frameValues),
  );
  const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
  const referenceVoltage = referenceMidiNote / 120;
  const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitchInput
    ? this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null)
    : referenceVoltage;
  const baseWithFreqJack = baseFrequency + (Number(freqInput) || 0);
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: baseWithFreqJack,
      hasPitchCv: hasPitchInput,
      pitchCv,
      referenceVoltage,
      hasInput: (id, port) => this.inputConnections.has(this.inputKey(id, port)),
      mixInput,
      nodeId,
    })
    : this.resolveFrequencyHz(
      (typeof nodeGraphPitchedFrequency === "function"
        ? nodeGraphPitchedFrequency(baseWithFreqJack, pitchCv, referenceVoltage)
        : Math.max(0, baseWithFreqJack * (2 ** ((pitchCv - referenceVoltage) / 0.1)))),
    );
  const phaseIncrement = (effectiveFrequency / safeRate) + (Number(incrementInput) || 0);
  const method = Math.round(
    Number(this.readEffectiveParameter(node, "method", 1, frame, frames, frameValues)) || 0,
  );
  const useAdditiveLut = method >= 1;
  let pair;
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
        if (typeof this.nativeSineWavetable.soemdsp_sine_wavetable_set_method === "function") {
          this.nativeSineWavetable.soemdsp_sine_wavetable_set_method(
            nativeState.nativeHandle,
            useAdditiveLut ? 1 : 0,
          );
        }
        if (resetEdge && typeof this.nativeSineWavetable.soemdsp_sine_wavetable_reset === "function") {
          this.nativeSineWavetable.soemdsp_sine_wavetable_reset(nativeState.nativeHandle);
        }
        this.nativeSineWavetable.soemdsp_sine_wavetable_sample(
          nativeState.nativeHandle,
          phaseOffset,
          effectiveFrequency,
          amplitude,
          safeRate,
        );
        pair = {
          sin: this.nativeSineWavetable.soemdsp_sine_wavetable_sin(nativeState.nativeHandle),
          cos: this.nativeSineWavetable.soemdsp_sine_wavetable_cos(nativeState.nativeHandle),
        };
      } else {
        throw new Error("native sine wavetable handle pool exhausted");
      }
    } catch (error) {
      this.nativeSineWavetableReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "sine_wavetable",
        status: "disabled",
        message: String(error?.message || error || "native sine wavetable failed"),
      });
    }
  }
  if (!pair) {
    pair = useAdditiveLut
      ? nodeLiveSineCosAdditiveLutSample(freePhase + phaseOffset, effectiveFrequency, amplitude, safeRate)
      : nodeLiveSineCosWavetableSample(freePhase + phaseOffset, effectiveFrequency, amplitude, safeRate);
  }
  this.phases.set(
    nodeId,
    this.wrapValue(freePhase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return pair;
};

NodeLiveAudioProcessor.prototype.sineWavetableWorkletEvaluate = function sineWavetableWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate) {
  const pair = this.sineWavetableAdvancePair(node, nodeId, frame, frames, frameValues, mixInput, safeRate);
  const mode = this.readEffectiveParameter(node, "mode", 2, frame, frames, frameValues);
  return nodeLiveSinCos4FromPair(pair.sin, pair.cos, mode);
};

NodeLiveAudioProcessor.prototype.sinCosWorkletEvaluate = function sinCosWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate) {
  return this.sineWavetableAdvancePair(node, nodeId, frame, frames, frameValues, mixInput, safeRate);
};
