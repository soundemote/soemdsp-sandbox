// Bode Shifter — classic through-zero frequency shifter (SSB via Hilbert FIR).
// y = delay(x)·cos(φ) − hilbert(x)·sin(φ),  φ += 2π (shift+fine)/fs
// Optional feedback into the input; Mix = dry/wet.

const NODE_GRAPH_BODE_HILBERT_LEN = 63; // odd
const NODE_GRAPH_BODE_HILBERT_MID = (NODE_GRAPH_BODE_HILBERT_LEN - 1) >> 1;

/** Build windowed ideal Hilbert impulse response (odd length). */
function nodeGraphBodeMakeHilbertKernel(length) {
  const N = length | 0;
  const h = new Float32Array(N);
  const mid = (N - 1) >> 1;
  for (let i = 0; i < N; i += 1) {
    const n = i - mid;
    if (n === 0 || (n & 1) === 0) {
      h[i] = 0;
    } else {
      h[i] = 2 / (Math.PI * n);
    }
  }
  // Hamming window
  for (let i = 0; i < N; i += 1) {
    h[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
  }
  return h;
}

let nodeGraphBodeHilbertKernelCache = null;
function nodeGraphBodeHilbertKernel() {
  if (!nodeGraphBodeHilbertKernelCache) {
    nodeGraphBodeHilbertKernelCache = nodeGraphBodeMakeHilbertKernel(NODE_GRAPH_BODE_HILBERT_LEN);
  }
  return nodeGraphBodeHilbertKernelCache;
}

function createNodeGraphBodeState() {
  const len = NODE_GRAPH_BODE_HILBERT_LEN;
  return {
    // Ring for FIR + delay alignment
    buf: new Float32Array(len),
    write: 0,
    filled: 0,
    phase: 0,
    fbZ: 0,
  };
}

function nodeGraphBodeReadDelay(state, delaySamples) {
  const len = state.buf.length;
  let idx = state.write - delaySamples;
  idx %= len;
  if (idx < 0) idx += len;
  return state.buf[idx] || 0;
}

/** Convolution Hilbert at current write (kernel applied to history). */
function nodeGraphBodeHilbert(state) {
  const h = nodeGraphBodeHilbertKernel();
  const len = state.buf.length;
  let acc = 0;
  // h[0] multiplies oldest relative to mid-centered kernel:
  // sample at write-1 is newest in buffer after write of current sample.
  // We call Hilbert AFTER writing current x at write.
  for (let k = 0; k < len; k += 1) {
    // kernel index k corresponds to sample at write - (len-1-k)
    let idx = state.write - (len - 1 - k);
    idx %= len;
    if (idx < 0) idx += len;
    acc += (state.buf[idx] || 0) * h[k];
  }
  return acc;
}

/**
 * @param {number} shiftHz main shift
 * @param {number} fineHz fine offset
 * @param {number} feedback 0..0.95
 * @param {number} mix 0..1 dry/wet
 */
function nodeGraphBodeSample(state, input, shiftHz, fineHz, feedback, mix, sampleRate) {
  if (!state || !state.buf) return Number(input) || 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const dry = Number(input) || 0;
  const fb = Math.max(0, Math.min(0.95, Number(feedback) || 0));
  const wetMix = Math.max(0, Math.min(1, Number(mix) || 0));

  // Soft-saturate feedback path to avoid blowups
  let fbIn = state.fbZ * fb;
  if (fbIn > 4) fbIn = 4;
  else if (fbIn < -4) fbIn = -4;
  const x = dry + fbIn;

  // Write into ring
  state.buf[state.write] = x;
  if (state.filled < state.buf.length) state.filled += 1;

  // Aligned real path: delay by Hilbert mid-point (group delay of FIR)
  const delayed = state.filled > NODE_GRAPH_BODE_HILBERT_MID
    ? nodeGraphBodeReadDelay(state, NODE_GRAPH_BODE_HILBERT_MID)
    : 0;
  const quad = state.filled >= state.buf.length ? nodeGraphBodeHilbert(state) : 0;

  const delta = (Number(shiftHz) || 0) + (Number(fineHz) || 0);
  // Clamp extreme shifts for stability
  const df = Math.max(-rate * 0.49, Math.min(rate * 0.49, delta));
  const step = (2 * Math.PI * df) / rate;
  let ph = state.phase;
  const c = Math.cos(ph);
  const s = Math.sin(ph);
  ph += step;
  // wrap phase
  if (ph > Math.PI * 2 || ph < -Math.PI * 2) {
    ph = ph % (Math.PI * 2);
  }
  state.phase = ph;

  // Through-zero SSB: positive Δf shifts spectrum up (I·cos + Q·sin).
  let wet = delayed * c + quad * s;
  if (!Number.isFinite(wet)) wet = 0;
  if (wet > -1e-30 && wet < 1e-30) wet = 0;

  state.fbZ = wet;
  state.write = (state.write + 1) % state.buf.length;

  const y = dry * (1 - wetMix) + wet * wetMix;
  if (!Number.isFinite(y)) return 0;
  return y;
}
