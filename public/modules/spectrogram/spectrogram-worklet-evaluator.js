// Spectrogram: worklet-side FFT + exponential smoothing for real-time
// scrolling waterfall display. Data flows through dataPorts → main thread
// → nodeGraphDataBus → persistent off-screen canvas → DOM composite.
//
// IMPORTANT — visual buffer frame tracking:
//   postModuleScopeSnapshot already reads ALL visual input buffers and
//   updates buf.postedFrame BEFORE calling per-module collectors.
//   DO NOT use buf.postedFrame to detect new samples — track your own
//   frame position in state.lastAbsoluteFrame instead.

// Choice-index → actual value tables (module definition uses choice params).
const SPECTROGRAM_FFT_SIZES     = [256, 512, 1024, 2048];
const SPECTROGRAM_OVERLAPS      = [0.5, 0.75, 0.875];

NodeLiveAudioProcessor.prototype.createSpectrogramState = function createSpectrogramState() {
  return {
    fftReal: null,
    fftImag: null,
    emaBins: null,
    fftSize: 0,
    // Own frame tracking (NOT buf.postedFrame — see note above)
    lastAbsoluteFrame: 0,
  };
};

// Radix-2 Cooley-Tukey FFT (in-place on real/imag arrays).
NodeLiveAudioProcessor.prototype.spectrogramFft = function spectrogramFft(real, imag) {
  const n = real.length;
  if (n <= 1 || (n & (n - 1)) !== 0) return;

  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let j = 0;
    for (let b = 0; b < bits; b++) {
      if (i & (1 << b)) j |= (1 << (bits - 1 - b));
    }
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len *= 2) {
    const half = len / 2;
    const phase = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < half; j++) {
        const ang = phase * j;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        const tr = real[i + j + half] * wr - imag[i + j + half] * wi;
        const ti = real[i + j + half] * wi + imag[i + j + half] * wr;
        real[i + j + half] = real[i + j] - tr;
        imag[i + j + half] = imag[i + j] - ti;
        real[i + j] += tr;
        imag[i + j] += ti;
      }
    }
  }
};

// Hann window
NodeLiveAudioProcessor.prototype.spectrogramHannWindow = function spectrogramHannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
};

NodeLiveAudioProcessor.prototype.spectrogramCollectDisplayData = function spectrogramCollectDisplayData(nodeId, state, dataPorts) {
  const bufKey = `${nodeId}:In`;
  const buf = this.visualInputBuffers.get(bufKey);
  if (!buf?.buffer?.length) return;

  const node = this.nodes.get(nodeId);
  const params = node?.params || {};

  // Map choice-index params to actual values
  const fftSizeIdx = Math.round(this.clampValue(this.safeFilterNumber(params.fftSize, 2) ?? 2, 0, SPECTROGRAM_FFT_SIZES.length - 1));
  const fftSize = SPECTROGRAM_FFT_SIZES[fftSizeIdx] || 1024;

  const overlapIdx = Math.round(this.clampValue(this.safeFilterNumber(params.overlap, 1) ?? 1, 0, SPECTROGRAM_OVERLAPS.length - 1));
  const overlap = SPECTROGRAM_OVERLAPS[overlapIdx] || 0.75;
  const hopSize = Math.max(1, Math.round(fftSize * (1 - overlap)));

  const alpha = this.clampValue(this.safeFilterNumber(params.smoothing, 0.85) ?? 0.85, 0, 0.999);
  const outputBins = Math.min(fftSize / 2, Math.round(this.clampValue(this.safeFilterNumber(params.outputBins, 256) ?? 256, 32, 1024)));

  // Allocate/reallocate FFT buffers if size changed
  if (!state.fftReal || state.fftSize !== fftSize) {
    state.fftReal = new Float32Array(fftSize);
    state.fftImag = new Float32Array(fftSize);
    state.fftSize = fftSize;
    state.hannWindow = this.spectrogramHannWindow(fftSize);
    state.accumulator = new Float32Array(fftSize);
    state.accumCount = 0;
  }

  if (!state.emaBins || state.emaBins.length !== fftSize / 2) {
    state.emaBins = new Float32Array(fftSize / 2);
  }

  // Extract fresh samples using own frame tracking
  const absFrame = Math.max(0, Math.floor(Number(buf.absoluteFrame) || 0));
  const lastFrame = Math.max(0, Number(state.lastAbsoluteFrame) || 0);
  const capacity = buf.capacity || buf.buffer.length;
  let freshCount = lastFrame > 0
    ? Math.max(0, absFrame - lastFrame)
    : Math.min(capacity, Math.ceil((Number(this.engineSampleRate) || sampleRate || 44100) / 30));
  freshCount = Math.min(capacity, freshCount);

  if (freshCount <= 0) return;
  state.lastAbsoluteFrame = absFrame;

  const writeIdx = Number(buf.writeIndex) || 0;
  const start = (writeIdx - freshCount + capacity) % capacity;
  let accIdx = state.accumCount;
  for (let i = 0; i < freshCount; i++) {
    const sample = buf.buffer[(start + i) % capacity] || 0;
    if (accIdx < fftSize) {
      state.accumulator[accIdx] = sample;
      accIdx++;
    }
    if (accIdx >= fftSize) {
      for (let j = 0; j < fftSize; j++) {
        state.fftReal[j] = state.accumulator[j] * state.hannWindow[j];
        state.fftImag[j] = 0;
      }
      this.spectrogramFft(state.fftReal, state.fftImag);
      const halfN = fftSize / 2;
      for (let j = 0; j < halfN; j++) {
        const mag = Math.sqrt(state.fftReal[j] * state.fftReal[j] + state.fftImag[j] * state.fftImag[j]);
        state.emaBins[j] = alpha * state.emaBins[j] + (1 - alpha) * mag;
      }
      const shift = hopSize;
      for (let j = 0; j < fftSize - shift; j++) {
        state.accumulator[j] = state.accumulator[j + shift];
      }
      accIdx = fftSize - shift;
    }
  }
  state.accumCount = accIdx;

  // Logarithmic bin remapping using actual frequencies (20 Hz → Nyquist).
  // Previously Math.pow(halfN, t) biased heavily toward low bins because
  // halfN is large (512-4096), causing 75%+ of output bins to land in
  // the first ~5 linear bins. Now we map log-spaced by real frequency.
  const halfN = fftSize / 2;
  const sampleRate = Math.max(1, this.engineSampleRate || 44100);
  const nyquist = sampleRate / 2;
  const minFreq = 20; // Hz — lowest frequency displayed
  const freqRatio = nyquist / minFreq;
  const remapped = new Float32Array(outputBins);
  for (let i = 0; i < outputBins; i++) {
    const t = i / (outputBins - 1 || 1);
    // Log-spaced frequency: minFreq * ratio^t
    const freq = minFreq * Math.pow(freqRatio, t);
    // Convert frequency → linear FFT bin index
    const linearBin = freq * fftSize / sampleRate;
    const idx0 = Math.max(0, Math.min(halfN - 1, Math.floor(linearBin)));
    const idx1 = Math.min(halfN - 1, idx0 + 1);
    const frac = linearBin - idx0;
    remapped[i] = state.emaBins[idx0] * (1 - frac) + state.emaBins[idx1] * frac;
    // dB-like scaling: compress dynamic range
    remapped[i] = Math.max(0, Math.log10(1 + remapped[i] * 100));
  }

  dataPorts.push([nodeId, "Spectrum", remapped]);
  dataPorts.push([nodeId, "FftSize", new Float32Array([fftSize, halfN, outputBins])]);
};
