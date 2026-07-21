// Spectrogram SG-1 style spectrogram: worklet-side FFT + exponential smoothing.
// Computes overlapping FFT windows on the buffered audio input, applies
// per-bin exponential moving average (EMA), then posts smoothed spectrum
// data to the main thread for rendering.
//
// Pipeline: visual input buffer → overlapping FFT windows → EMA smoothing →
// logarithmic bin remapping → dataPorts → nodeGraphDataBus → display renderer.

NodeLiveAudioProcessor.prototype.createSpectrogramState = function createSpectrogramState() {
  return {
    // FFT scratch buffers (reused across snapshots)
    fftReal: null,
    fftImag: null,
    // EMA state: one smoothed magnitude per bin, persists across snapshots
    emaBins: null,
    // Cached FFT size for buffer reallocation
    fftSize: 0,
    // Own frame tracking — do NOT use buf.postedFrame (already consumed by generic code)
    lastAbsoluteFrame: 0,
  };
};

// Radix-2 Cooley-Tukey FFT (in-place on real/imag arrays).
NodeLiveAudioProcessor.prototype.spectrogramFft = function spectrogramFft(real, imag) {
  const n = real.length;
  if (n <= 1 || (n & (n - 1)) !== 0) return; // power of 2 only

  // Bit-reversal permutation
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

  // Butterfly
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

// Collect spectrum data for all spectrogram nodes and push to dataPorts.
NodeLiveAudioProcessor.prototype.spectrogramCollectDisplayData = function spectrogramCollectDisplayData(nodeId, state, dataPorts) {
  const bufKey = `${nodeId}:In`;
  const buf = this.visualInputBuffers.get(bufKey);
  if (!buf?.buffer?.length) return;

  const node = this.nodes.get(nodeId);
  const params = node?.params || {};

  const rawFftSize = Math.round(this.clampValue(this.safeFilterNumber(params.fftSize, 1024) ?? 1024, 64, 8192));
  // Round up to next power of 2
  let fftSize = 64;
  while (fftSize < rawFftSize) fftSize *= 2;
  fftSize = Math.min(fftSize, 8192);

  const rawOverlap = this.clampValue(this.safeFilterNumber(params.overlap, 0.75) ?? 0.75, 0, 0.9375);
  const hopSize = Math.max(1, Math.round(fftSize * (1 - rawOverlap)));

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

  // Allocate/reallocate EMA bins
  if (!state.emaBins || state.emaBins.length !== fftSize / 2) {
    state.emaBins = new Float32Array(fftSize / 2);
  }

  // Extract fresh samples using own frame tracking (not buf.postedFrame —
  // the generic postModuleScopeSnapshot loop already consumed that).
  const absFrame = Math.max(0, Math.floor(Number(buf.absoluteFrame) || 0));
  const lastFrame = Math.max(0, Number(state.lastAbsoluteFrame) || 0);
  const capacity = buf.capacity || buf.buffer.length;
  let freshCount = lastFrame > 0
    ? Math.max(0, absFrame - lastFrame)
    : Math.min(capacity, Math.ceil((Number(this.engineSampleRate) || sampleRate || 44100) / 30));
  freshCount = Math.min(capacity, freshCount);

  if (freshCount <= 0) return;
  state.lastAbsoluteFrame = absFrame;

  // Feed samples directly from the ring buffer into the accumulator for overlapping FFT
  const writeIdx = Number(buf.writeIndex) || 0;
  const start = (writeIdx - freshCount + capacity) % capacity;
  let accIdx = state.accumCount;
  for (let i = 0; i < freshCount; i++) {
    const sample = buf.buffer[(start + i) % capacity] || 0;
    if (accIdx < fftSize) {
      state.accumulator[accIdx] = sample;
      accIdx++;
    }
    // When accumulator is full, process an FFT window
    if (accIdx >= fftSize) {
      // Apply Hann window
      for (let j = 0; j < fftSize; j++) {
        state.fftReal[j] = state.accumulator[j] * state.hannWindow[j];
        state.fftImag[j] = 0;
      }
      // FFT
      this.spectrogramFft(state.fftReal, state.fftImag);

      // Compute magnitudes and apply EMA smoothing
      const halfN = fftSize / 2;
      for (let j = 0; j < halfN; j++) {
        const mag = Math.sqrt(state.fftReal[j] * state.fftReal[j] + state.fftImag[j] * state.fftImag[j]);
        state.emaBins[j] = alpha * state.emaBins[j] + (1 - alpha) * mag;
      }

      // Shift accumulator by hop size for overlap
      const shift = hopSize;
      for (let j = 0; j < fftSize - shift; j++) {
        state.accumulator[j] = state.accumulator[j + shift];
      }
      accIdx = fftSize - shift;
    }
  }
  state.accumCount = accIdx;

  // Remap linear bins → logarithmic output bins and post
  const halfN = fftSize / 2;
  const remapped = new Float32Array(outputBins);
  for (let i = 0; i < outputBins; i++) {
    // Log-spaced index mapping: maps output bin [0, outputBins) → linear bin [0, halfN)
    const t = i / (outputBins - 1 || 1);
    const logIdx = t === 0 ? 0 : Math.pow(halfN, t);
    const idx0 = Math.max(0, Math.min(halfN - 1, Math.floor(logIdx)));
    const idx1 = Math.min(halfN - 1, idx0 + 1);
    const frac = logIdx - idx0;
    remapped[i] = state.emaBins[idx0] * (1 - frac) + state.emaBins[idx1] * frac;
    // dB-like scaling: compress dynamic range
    remapped[i] = Math.max(0, Math.log10(1 + remapped[i] * 100));
  }

  dataPorts.push([nodeId, "Spectrum", remapped]);
  dataPorts.push([nodeId, "FftSize", new Float32Array([fftSize, halfN, outputBins])]);
};
