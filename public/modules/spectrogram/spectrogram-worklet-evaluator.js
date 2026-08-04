// Spectrogram: worklet-side FFT for real-time waterfall + Thru passthrough
// (audio path registered in node-live-audio-worklet-evaluators-processors.js).
//
// Data: dataPorts → main thread → nodeGraphDataBus → spectrogram-display.js
//
// Display protocol (spectrogramHopMeta / drawNodeGraphSpectrogramItem):
//   Spectrum     — Float32 linear mag bins (half FFT, DC..Nyquist)
//   FftSize      — [fftSize, halfN, spectrumBins, hopSize, sampleRate,
//                   hopSerial, batchColumns, historyFlag]
//   hopSerial > 0 and changing is required or the face never paints.
//
// IMPORTANT — visual buffer frame tracking:
//   postModuleScopeSnapshot already reads ALL visual input buffers and
//   updates buf.postedFrame BEFORE calling per-module collectors.
//   DO NOT use buf.postedFrame to detect new samples — track your own
//   frame position in state.lastAbsoluteFrame instead.

// Hop factor index from display settings (overlap): hop = N / factor.
// 0=none (N), 1=2×, 2=4× (default), 3=8×, 4=16×, 5=32×.
const SPECTROGRAM_HOP_FACTORS = [1, 2, 4, 8, 16, 32];

NodeLiveAudioProcessor.prototype.createSpectrogramState = function createSpectrogramState() {
  return {
    fftReal: null,
    fftImag: null,
    emaBins: null,
    spectrumOut: null,
    fftSize: 0,
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

// Hann window
NodeLiveAudioProcessor.prototype.spectrogramHannWindow = function spectrogramHannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
  }
  return w;
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

  const fftSize = this.spectrogramResolveFftSize(params);
  const overlapIdx = Math.max(
    0,
    Math.min(SPECTROGRAM_HOP_FACTORS.length - 1, Math.round(Number(params.overlap) || 2)),
  );
  const hopFactor = SPECTROGRAM_HOP_FACTORS[overlapIdx] || 4;
  const hopSize = Math.max(1, Math.floor(fftSize / hopFactor));
  const halfN = fftSize >> 1;
  const engineRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);

  // Allocate/reallocate FFT buffers if size changed
  if (!state.fftReal || state.fftSize !== fftSize) {
    state.fftReal = new Float32Array(fftSize);
    state.fftImag = new Float32Array(fftSize);
    state.fftSize = fftSize;
    state.hannWindow = this.spectrogramHannWindow(fftSize);
    state.accumulator = new Float32Array(fftSize);
    state.accumCount = 0;
    state.emaBins = new Float32Array(halfN);
    state.spectrumOut = new Float32Array(halfN);
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
      for (let j = 0; j < halfN; j++) {
        const mag = Math.sqrt(
          state.fftReal[j] * state.fftReal[j] + state.fftImag[j] * state.fftImag[j],
        );
        // Light temporal EMA — display peak-normalizes + applies its own scale.
        state.emaBins[j] = 0.35 * state.emaBins[j] + 0.65 * mag;
      }
      hopsThisFrame += 1;
      const shift = hopSize;
      for (let j = 0; j < fftSize - shift; j++) {
        state.accumulator[j] = state.accumulator[j + shift];
      }
      accIdx = fftSize - shift;
    }
  }
  state.accumCount = accIdx;

  // Nothing new to paint until the first full FFT window is filled.
  if (hopsThisFrame <= 0 && !(state.hopSerial > 0)) return;
  if (hopsThisFrame <= 0) return;

  // dB-ish compress into a copy so the display has usable dynamic range.
  for (let j = 0; j < halfN; j++) {
    state.spectrumOut[j] = Math.max(0, Math.log10(1 + state.emaBins[j] * 100));
  }

  state.hopSerial = (Number(state.hopSerial) || 0) + 1;
  // One Spectrum column this frame; fold multi-hop time into hopSize so scroll
  // rate still tracks wall-clock audio (display: hopSec = hopSize / sampleRate).
  const effectiveHop = Math.max(1, hopSize * hopsThisFrame);

  dataPorts.push([nodeId, "Spectrum", state.spectrumOut]);
  // [0]=fftSize [1]=halfN [2]=spectrumBins [3]=hopSize [4]=sampleRate
  // [5]=hopSerial [6]=batchColumns [7]=historyFlag
  dataPorts.push([
    nodeId,
    "FftSize",
    new Float32Array([
      fftSize,
      halfN,
      halfN,
      effectiveHop,
      engineRate,
      state.hopSerial,
      0,
      0,
    ]),
  ]);
};
