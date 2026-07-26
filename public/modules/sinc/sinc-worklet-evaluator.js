// Sinc: a repeating sinc kernel, band-limited by default so it does not alias.
//
// Band Limit on  -> Dirichlet kernel (periodic sinc). Its harmonic count is
//                   clamped so the top partial stays under Nyquist, which
//                   makes aliasing impossible rather than merely quiet. Lobes
//                   are shed as the frequency rises; nothing folds back.
// Band Limit off -> the literal sin(x)/x window. The textbook picture, and
//                   the one worth looking at on a display, but as an
//                   oscillator it aliases hard above a few kHz.
//
// The maths and the measurements behind that claim are in
// node-graph-stdlib/node-graph-sinc-kernel.js. Keep this body in step with
// sinc-live-evaluator.js.

NodeLiveAudioProcessor.prototype.createSincState = function createSincState() {
  return {};
};

NodeLiveAudioProcessor.prototype.sincSample = function sincSample(state, params, nodeId) {
  const freq = Math.max(0, this.safeFilterNumber(params.freq, 100) ?? 100);
  const phaseShift = this.safeFilterNumber(params.phase, 0) ?? 0;
  const lobes = Math.max(1, Math.round(this.safeFilterNumber(params.lobes, 4) ?? 4));
  const bandLimited = Math.round(this.safeFilterNumber(params.bandLimit, 1) ?? 1) !== 0;
  const rate = this.effectiveSampleRate();
  const step = freq / rate;

  let phase = (state._phase ?? 0) + step;
  if (phase >= 1 || phase < 0) phase -= Math.floor(phase);
  state._phase = phase;

  let shifted = (phase + phaseShift) % 1;
  if (shifted < 0) shifted += 1;

  let value;
  if (bandLimited) {
    // Dirichlet kernel: sin((2M+1)*pi*t) / ((2M+1)*sin(pi*t)), M clamped to
    // Nyquist. Inlined rather than shared because the worklet runs in an
    // isolated global scope and cannot see the stdlib file.
    const harmonics = Math.max(1, Math.min(lobes, Math.floor((rate * 0.5) / Math.max(1e-9, freq)) - 1));
    const order = 2 * harmonics + 1;
    const theta = Math.PI * (shifted - 0.5);
    const denominator = order * Math.sin(theta);
    value = Math.abs(denominator) < 1e-9 ? 1 : Math.sin(order * theta) / denominator;
  } else {
    const x = (shifted - 0.5) * 2 * Math.PI * lobes;
    value = Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x;
  }

  return { Out: this.clampValue(value, -1, 1) };
};
