// STFT Blur — real-time spectral smear via overlap-add STFT.
// Blur Time: exponential magnitude memory across frames (temporal wash).
// Blur Freq: box-blur magnitudes across bins (frequency wash).
// Phase from current frame; Hann window; hop = N/4.

const NODE_GRAPH_STFT_BLUR_MIN_N = 256;
const NODE_GRAPH_STFT_BLUR_MAX_N = 4096;

function nodeGraphStftBlurSnapFftSize(raw) {
  let n = Math.round(Number(raw) || 2048);
  if (n < NODE_GRAPH_STFT_BLUR_MIN_N) n = NODE_GRAPH_STFT_BLUR_MIN_N;
  if (n > NODE_GRAPH_STFT_BLUR_MAX_N) n = NODE_GRAPH_STFT_BLUR_MAX_N;
  let p = 256;
  while (p < n && p < NODE_GRAPH_STFT_BLUR_MAX_N) p <<= 1;
  if (p > NODE_GRAPH_STFT_BLUR_MIN_N) {
    const lo = p >> 1;
    if (Math.abs(n - lo) < Math.abs(n - p)) p = lo;
  }
  return p;
}

function nodeGraphStftBlurMakeHann(n) {
  const w = new Float32Array(n);
  if (n <= 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/** In-place radix-2 Cooley–Tukey FFT. */
function nodeGraphStftBlurFft(re, im, inverse) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * wr - im[i + k + half] * wi;
        const vIm = re[i + k + half] * wi + im[i + k + half] * wr;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nwr = wr * wlenRe - wi * wlenIm;
        wi = wr * wlenIm + wi * wlenRe;
        wr = nwr;
      }
    }
  }
  if (inverse) {
    const invN = 1 / n;
    for (let i = 0; i < n; i += 1) {
      re[i] *= invN;
      im[i] *= invN;
    }
  }
}

function createNodeGraphStftBlurState(fftSize) {
  const n = nodeGraphStftBlurSnapFftSize(fftSize);
  const hop = Math.max(1, n >> 2);
  const bins = (n >> 1) + 1;
  return {
    n,
    hop,
    bins,
    inBuf: new Float32Array(n),
    inWrite: 0,
    inCount: 0,
    samplesSinceHop: 0,
    primed: false,
    ola: new Float32Array(n * 2),
    olaWrite: 0,
    olaRead: 0,
    dryBuf: new Float32Array(n),
    dryWrite: 0,
    re: new Float32Array(n),
    im: new Float32Array(n),
    window: nodeGraphStftBlurMakeHann(n),
    magMem: new Float32Array(bins),
    magCur: new Float32Array(bins),
    magBlur: new Float32Array(bins),
    // Hann + hop N/4 COLA ≈ 1.5 → scale ~0.67
    olaGain: 2 / 3,
  };
}

function nodeGraphStftBlurFreqBlur(magIn, magOut, bins, blurFreq) {
  const b = Math.max(0, Math.min(1, Number(blurFreq) || 0));
  if (b < 1e-6) {
    for (let k = 0; k < bins; k += 1) magOut[k] = magIn[k];
    return;
  }
  const maxR = Math.max(1, (bins / 8) | 0);
  const radius = Math.max(1, Math.min(maxR, Math.round(b * b * maxR)));
  for (let k = 0; k < bins; k += 1) {
    let sum = 0;
    let count = 0;
    const lo = k - radius;
    const hi = k + radius;
    for (let j = lo; j <= hi; j += 1) {
      if (j >= 0 && j < bins) {
        sum += magIn[j];
        count += 1;
      }
    }
    magOut[k] = sum / Math.max(1, count);
  }
}

function nodeGraphStftBlurProcessFrame(state, blurTime, blurFreq) {
  const n = state.n;
  const bins = state.bins;
  const re = state.re;
  const im = state.im;
  const win = state.window;

  for (let i = 0; i < n; i += 1) {
    let idx = state.inWrite - n + i;
    idx %= n;
    if (idx < 0) idx += n;
    re[i] = (state.inBuf[idx] || 0) * win[i];
    im[i] = 0;
  }

  nodeGraphStftBlurFft(re, im, false);

  const magCur = state.magCur;
  const magMem = state.magMem;
  const magBlur = state.magBlur;
  for (let k = 0; k < bins; k += 1) {
    const rr = re[k];
    const ii = im[k];
    magCur[k] = Math.sqrt(rr * rr + ii * ii);
  }

  const bt = Math.max(0, Math.min(1, Number(blurTime) || 0));
  const retain = bt * 0.985;
  for (let k = 0; k < bins; k += 1) {
    const m = retain * magMem[k] + (1 - retain) * magCur[k];
    magMem[k] = m;
    magCur[k] = m;
  }

  nodeGraphStftBlurFreqBlur(magCur, magBlur, bins, blurFreq);

  for (let k = 0; k < bins; k += 1) {
    const rr = re[k];
    const ii = im[k];
    const oldMag = Math.sqrt(rr * rr + ii * ii);
    const newMag = magBlur[k];
    if (oldMag > 1e-20) {
      const s = newMag / oldMag;
      re[k] = rr * s;
      im[k] = ii * s;
    } else {
      re[k] = newMag;
      im[k] = 0;
    }
  }
  for (let k = 1; k < bins - 1; k += 1) {
    re[n - k] = re[k];
    im[n - k] = -im[k];
  }

  nodeGraphStftBlurFft(re, im, true);

  const g = state.olaGain;
  const ola = state.ola;
  const olaLen = ola.length;
  let pos = state.olaWrite;
  for (let i = 0; i < n; i += 1) {
    const v = re[i] * win[i] * g;
    ola[pos] += Number.isFinite(v) ? v : 0;
    pos += 1;
    if (pos >= olaLen) pos = 0;
  }
  state.olaWrite = (state.olaWrite + state.hop) % olaLen;
}

/**
 * One sample in → one sample out.
 * Wet latency ≈ N samples; dry delayed by N for mix alignment.
 */
function nodeGraphStftBlurSample(state, input, blurTime, blurFreq, fftSize, mix) {
  if (!state || !state.inBuf) return Number(input) || 0;

  const x = Number(input) || 0;
  const wetMix = Math.max(0, Math.min(1, Number(mix) || 0));
  const n = state.n;
  const hop = state.hop;

  state.inBuf[state.inWrite] = x;
  state.inWrite = (state.inWrite + 1) % n;
  state.inCount += 1;

  // Dry delay N samples
  state.dryBuf[state.dryWrite] = x;
  let dryIdx = state.dryWrite - n + 1;
  dryIdx %= n;
  if (dryIdx < 0) dryIdx += n;
  const dry = state.inCount > n ? (state.dryBuf[dryIdx] || 0) : 0;
  state.dryWrite = (state.dryWrite + 1) % n;

  if (state.inCount >= n) {
    if (!state.primed) {
      nodeGraphStftBlurProcessFrame(state, blurTime, blurFreq);
      state.primed = true;
      state.samplesSinceHop = 0;
    } else {
      state.samplesSinceHop += 1;
      if (state.samplesSinceHop >= hop) {
        state.samplesSinceHop = 0;
        nodeGraphStftBlurProcessFrame(state, blurTime, blurFreq);
      }
    }
  }

  let wet = 0;
  if (state.primed) {
    wet = state.ola[state.olaRead] || 0;
    state.ola[state.olaRead] = 0;
    state.olaRead = (state.olaRead + 1) % state.ola.length;
  }
  if (!Number.isFinite(wet)) wet = 0;

  if (!state.primed) {
    return wetMix >= 1 ? 0 : x * (1 - wetMix);
  }

  const y = dry * (1 - wetMix) + wet * wetMix;
  if (!Number.isFinite(y)) return 0;
  if (y > -1e-30 && y < 1e-30) return 0;
  return y;
}
