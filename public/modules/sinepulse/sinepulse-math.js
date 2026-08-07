// Sinepulse — period-reset chirp oscillator.
// Each tooth (period 1/f0): a sine whose instantaneous frequency sweeps,
// then the schedule resets. Low rate → zap/kick sweeps; high rate →
// saw-ish buzz. Cheap single-sin path (no allpass stack).

function createNodeGraphSinepulseState() {
  return {
    tooth: 0, // 0..1 progress through period
    phase: 0, // sine phase in cycles
    lastReset: 0,
  };
}

/**
 * Instantaneous Hz within tooth progress u∈[0,1).
 * @param {number} f0 base / period rate
 * @param {number} sweep 0..1 smear depth (0 = pure sine at f0)
 * @param {number} direction 0 = down (high→low), 1 = up
 * @param {number} curve 0 = linear freq, 1 = exponential
 */
function nodeGraphSinepulseInstantHz(f0, u, sweep, direction, curve) {
  const base = Math.max(0, Number(f0) || 0);
  if (!(base > 0) || !Number.isFinite(base)) return 0;

  const s = Math.max(0, Math.min(1, Number(sweep) || 0));
  // At full sweep: ±4 octaves around base (16× span) — dramatic but usable.
  const oct = s * 4;
  const ratio = Math.pow(2, oct); // ≥1
  let fStart;
  let fEnd;
  if (Math.round(Number(direction) || 0) !== 0) {
    // Up: low → high
    fStart = base / Math.sqrt(ratio);
    fEnd = base * Math.sqrt(ratio);
  } else {
    // Down: high → low (classic zap / kick)
    fStart = base * Math.sqrt(ratio);
    fEnd = base / Math.sqrt(ratio);
  }
  // Guard tiny end freqs
  fStart = Math.max(1e-6, fStart);
  fEnd = Math.max(1e-6, fEnd);

  const t = Math.max(0, Math.min(1, Number(u) || 0));
  const useLog = Math.round(Number(curve) || 0) !== 0;
  if (!useLog) {
    return fStart + (fEnd - fStart) * t;
  }
  // Exponential: f = fStart * (fEnd/fStart)^t
  const r = fEnd / fStart;
  if (!(r > 0) || !Number.isFinite(r)) return fStart;
  return fStart * Math.pow(r, t);
}

/**
 * One sample.
 * @param {number} frequencyHz period rate / center pitch
 * @param {number} sweep 0..1
 * @param {number} direction 0 down / 1 up
 * @param {number} curve 0 linear / 1 exp
 * @param {number} hardReset 0 continuous phase / 1 zero sine phase each tooth
 * @param {number} phaseOffset cycles added to sine
 * @param {number} amplitude
 * @param {number} increment extra tooth progress per sample (phase-mod style)
 * @param {number} resetGate rising edge restarts tooth + optional phase
 */
function nodeGraphSinepulseSample(
  state,
  frequencyHz,
  sweep,
  direction,
  curve,
  hardReset,
  phaseOffset,
  amplitude,
  increment,
  resetGate,
  sampleRate,
) {
  if (!state || typeof state !== "object") return 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const f0 = Number(frequencyHz);
  const safeF0 = Number.isFinite(f0) ? f0 : 0;

  // Rising-edge reset
  const g = Number(resetGate) || 0;
  const on = g > 0.5;
  if (on && !state.lastReset) {
    state.tooth = 0;
    if (Math.round(Number(hardReset) || 0) !== 0) state.phase = 0;
  }
  state.lastReset = on ? 1 : 0;

  // Tooth advance (allow through-zero / reverse via signed f0)
  const toothInc = safeF0 / rate + (Number(increment) || 0);
  let tooth = (Number(state.tooth) || 0) + toothInc;

  // Wrap tooth into [0,1) or handle reverse
  if (tooth >= 1 || tooth < 0) {
    const wrapped = tooth - Math.floor(tooth);
    if (Math.round(Number(hardReset) || 0) !== 0) {
      state.phase = 0;
    }
    tooth = wrapped;
  }
  state.tooth = tooth;

  const u = tooth;
  // Instantaneous freq uses |schedule| center from |f0| so reverse period still chirps
  const fInst = nodeGraphSinepulseInstantHz(Math.abs(safeF0), u, sweep, direction, curve);
  // Signed f0 reverses sine phase walk
  const signedInst = safeF0 < 0 ? -fInst : fInst;

  state.phase += signedInst / rate;
  // Keep phase bounded
  if (state.phase > 1e6 || state.phase < -1e6) {
    state.phase -= Math.floor(state.phase);
  }

  const ph = (Number(state.phase) || 0) + (Number(phaseOffset) || 0);
  const amp = Number.isFinite(Number(amplitude)) ? Number(amplitude) : 1;
  let y = Math.sin(ph * Math.PI * 2) * amp;
  if (!Number.isFinite(y)) y = 0;
  if (y > -1e-30 && y < 1e-30) y = 0;
  return y;
}
