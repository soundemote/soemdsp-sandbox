// Spectrogram: worklet-side FFT for real-time waterfall + Thru passthrough
// (audio path registered in node-live-audio-worklet-evaluators-processors.js).
//
// Data: dataPorts → main thread → nodeGraphDataBus → spectrogram-display.js
//
// Display protocol (spectrogramHopMeta / drawNodeGraphSpectrogramItem):
//   Spectrum     — Float32 linear mag bins (half FFT, DC..Nyquist) — last hop
//   SpectrumBatch— concatenated hop columns this quantum (smooth scroll)
//   FftSize      — [fftSize, halfN, spectrumBins, hopSize, sampleRate,
//                   hopSerial, batchColumns, historyFlag]
//   hopSerial > 0 and changing is required or the face never paints.
//
// Analysis knobs (from display settings, injected as node.params):
//   fftSize      analysis window samples (128…16384 pot)
//   window       0 Rect … 4 Blackman–Harris
//   overlap      time hop factor index → hop = window / factor
//   freqOverlap  zero-pad factor index → FFT len = min(window×{1,2,4}, 32768)
//
// IMPORTANT — visual buffer frame tracking:
//   postModuleScopeSnapshot already reads ALL visual input buffers and
//   updates buf.postedFrame BEFORE calling per-module collectors.
//   DO NOT use buf.postedFrame to detect new samples — track your own
//   frame position in state.lastAbsoluteFrame instead.

// Hop factor index from display settings (overlap): hop = N / factor.
// 0=none (N), 1=2×, 2=4× (default), 3=8×, 4=16×, 5=32×.
const SPECTROGRAM_HOP_FACTORS = [1, 2, 4, 8, 16, 32];
// Freq zero-pad: denser Hz grid without lengthening the analysis window.
const SPECTROGRAM_FREQ_PAD_FACTORS = [1, 2, 4];

NodeLiveAudioProcessor.prototype.createSpectrogramState = function createSpectrogramState() {
  return {
    fftReal: null,
    fftImag: null,
    emaBins: null,
    spectrumOut: null,
    batchScratch: null,
    windowSize: 0,
    fftLen: 0,
    windowKind: -1,
    hopSerial: 0,
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

/**
 * Analysis window of length n.
 * kind: 0 Rectangular, 1 Hann, 2 Hamming, 3 Blackman, 4 Blackman–Harris
 */
NodeLiveAudioProcessor.prototype.spectrogramMakeWindow = function spectrogramMakeWindow(n, kind) {
  const w = new Float32Array(n);
  const k = Math.max(0, Math.min(4, Math.round(Number(kind) || 1)));
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = (2 * Math.PI * i) / denom;
    if (k === 0) {
      w[i] = 1;
    } else if (k === 1) {
      // Hann
      w[i] = 0.5 * (1 - Math.cos(x));
    } else if (k === 2) {
      // Hamming
      w[i] = 0.54 - 0.46 * Math.cos(x);
    } else if (k === 3) {
      // Blackman
      w[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
    } else {
      // Blackman–Harris (4-term)
      w[i] = 0.35875
        - 0.48829 * Math.cos(x)
        + 0.14128 * Math.cos(2 * x)
        - 0.01168 * Math.cos(3 * x);
    }
  }
  return w;
};

// Legacy alias
NodeLiveAudioProcessor.prototype.spectrogramHannWindow = function spectrogramHannWindow(n) {
  return this.spectrogramMakeWindow(n, 1);
};

/**
 * Resolve analysis window size from worklet params.
 * Inject path sends real sizes (128…16384). Legacy choice index 0…3 still works.
 */
NodeLiveAudioProcessor.prototype.spectrogramResolveFftSize = function spectrogramResolveFftSize(params) {
  const raw = Number(params?.fftSize);
  if (!Number.isFinite(raw)) return 1024;
  // Legacy module choice index (old UI).
  if (raw >= 0 && raw <= 3 && Math.abs(raw - Math.round(raw)) < 1e-6) {
    return [256, 512, 1024, 2048][Math.round(raw)] || 1024;
  }
  // Snap to power-of-two in [128, 16384].
  let n = Math.round(raw);
  n = Math.max(128, Math.min(16384, n));
  // Next lower power of two if not already.
  let p = 128;
  while (p * 2 <= n) p *= 2;
  return p;
};

NodeLiveAudioProcessor.prototype.spectrogramCollectDisplayData = function spectrogramCollectDisplayData(nodeId, state, dataPorts) {
  const bufKey = `${nodeId}:In`;
  const buf = this.visualInputBuffers.get(bufKey);
  if (!buf?.buffer?.length) return;

  const node = this.nodes.get(nodeId);
  const params = node?.params || {};

  const winSize = this.spectrogramResolveFftSize(params);
  const windowKind = Math.max(0, Math.min(4, Math.round(nodeGraphFiniteNumber(params.window, 1))));
  const overlapIdx = Math.max(
    0,
    Math.min(SPECTROGRAM_HOP_FACTORS.length - 1, Math.round(Number(params.overlap) || 2)),
  );
  const hopFactor = SPECTROGRAM_HOP_FACTORS[overlapIdx] || 4;
  const hopSize = Math.max(1, Math.floor(winSize / hopFactor));

  const padIdx = Math.max(
    0,
    Math.min(SPECTROGRAM_FREQ_PAD_FACTORS.length - 1, Math.round(Number(params.freqOverlap) || 0)),
  );
  const padFactor = SPECTROGRAM_FREQ_PAD_FACTORS[padIdx] || 1;
  // FFT length = window × pad (denser bins); cap 32768.
  let fftLen = winSize * padFactor;
  if (fftLen > 32768) fftLen = 32768;
  // Ensure power of two (winSize and padFactor already are).
  const halfN = fftLen >> 1;
  const engineRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);

  // Allocate/reallocate when window, pad, or window kind changes.
  if (
    !state.fftReal
    || state.windowSize !== winSize
    || state.fftLen !== fftLen
    || state.windowKind !== windowKind
  ) {
    state.fftReal = new Float32Array(fftLen);
    state.fftImag = new Float32Array(fftLen);
    state.windowSize = winSize;
    state.fftLen = fftLen;
    state.windowKind = windowKind;
    state.analysisWindow = this.spectrogramMakeWindow(winSize, windowKind);
    state.accumulator = new Float32Array(winSize);
    state.accumCount = 0;
    state.emaBins = new Float32Array(halfN);
    state.spectrumOut = new Float32Array(halfN);
    state.batchScratch = null;
  }

  if (!state.emaBins || state.emaBins.length !== halfN) {
    state.emaBins = new Float32Array(halfN);
  }
  if (!state.spectrumOut || state.spectrumOut.length !== halfN) {
    state.spectrumOut = new Float32Array(halfN);
  }

  // Extract fresh samples using own frame tracking
  const absFrame = Math.max(0, Math.floor(Number(buf.absoluteFrame) || 0));
  const lastFrame = Math.max(0, Number(state.lastAbsoluteFrame) || 0);
  const capacity = buf.capacity || buf.buffer.length;
  let freshCount = lastFrame > 0
    ? Math.max(0, absFrame - lastFrame)
    : Math.min(capacity, Math.ceil(engineRate / 30));
  freshCount = Math.min(capacity, freshCount);

  if (freshCount <= 0) return;
  state.lastAbsoluteFrame = absFrame;

  const writeIdx = Number(buf.writeIndex) || 0;
  const start = (writeIdx - freshCount + capacity) % capacity;
  let accIdx = state.accumCount;
  let hopsThisFrame = 0;
  // Cap batch columns so a huge quantum doesn't explode transfer (still hop-serial paints).
  const maxBatchCols = 64;
  const hopColumns = [];

  for (let i = 0; i < freshCount; i++) {
    const sample = buf.buffer[(start + i) % capacity] || 0;
    if (accIdx < winSize) {
      state.accumulator[accIdx] = sample;
      accIdx++;
    }
    if (accIdx >= winSize) {
      // Window + zero-pad into FFT buffer.
      state.fftReal.fill(0);
      state.fftImag.fill(0);
      const aw = state.analysisWindow;
      for (let j = 0; j < winSize; j++) {
        state.fftReal[j] = state.accumulator[j] * aw[j];
      }
      this.spectrogramFft(state.fftReal, state.fftImag);

      const col = new Float32Array(halfN);
      for (let j = 0; j < halfN; j++) {
        const mag = Math.sqrt(
          state.fftReal[j] * state.fftReal[j] + state.fftImag[j] * state.fftImag[j],
        );
        // Light temporal EMA for stability; still post per-hop columns.
        state.emaBins[j] = 0.35 * state.emaBins[j] + 0.65 * mag;
        col[j] = Math.max(0, Math.log10(1 + state.emaBins[j] * 100));
      }
      if (hopColumns.length < maxBatchCols) {
        hopColumns.push(col);
      } else {
        // Keep latest columns if over cap (overwrite from start of overflow).
        hopColumns.shift();
        hopColumns.push(col);
      }
      hopsThisFrame += 1;

      const shift = hopSize;
      for (let j = 0; j < winSize - shift; j++) {
        state.accumulator[j] = state.accumulator[j + shift];
      }
      accIdx = winSize - shift;
    }
  }
  state.accumCount = accIdx;

  // Nothing new to paint until the first full FFT window is filled.
  if (hopsThisFrame <= 0 && !(state.hopSerial > 0)) return;
  if (hopsThisFrame <= 0) return;

  const batchCols = hopColumns.length;
  // Last hop as Spectrum (compat) + full batch for smooth multi-pixel scroll.
  const lastCol = hopColumns[batchCols - 1];
  state.spectrumOut.set(lastCol);

  let batchFlat = state.batchScratch;
  if (!batchFlat || batchFlat.length !== batchCols * halfN) {
    batchFlat = new Float32Array(batchCols * halfN);
    state.batchScratch = batchFlat;
  }
  for (let c = 0; c < batchCols; c++) {
    batchFlat.set(hopColumns[c], c * halfN);
  }

  state.hopSerial = (Number(state.hopSerial) || 0) + 1;

  dataPorts.push([nodeId, "Spectrum", state.spectrumOut]);
  dataPorts.push([nodeId, "SpectrumBatch", batchFlat]);
  // [0]=fftLen (display bin count basis) [1]=halfN [2]=spectrumBins
  // [3]=hopSize (ONE hop — batch walks columns) [4]=sampleRate
  // [5]=hopSerial [6]=batchColumns [7]=historyFlag
  dataPorts.push([
    nodeId,
    "FftSize",
    new Float32Array([
      fftLen,
      halfN,
      halfN,
      hopSize,
      engineRate,
      state.hopSerial,
      batchCols,
      0,
    ]),
  ]);
};
