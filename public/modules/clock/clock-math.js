// Clock — pure math (main thread + worklet JS path).

function createNodeGraphClockState() {
  return {
    hasStarted: false,
    phase: 0,
  };
}

function nodeGraphClockWrap01(p) {
  const x = Number(p) || 0;
  return x - Math.floor(x);
}

function nodeGraphClockClamp01(p) {
  const x = Number(p) || 0;
  return x < 0 ? 0 : (x > 1 ? 1 : x);
}

function nodeGraphClockAnalogWhipSample(phase, level) {
  const p = nodeGraphClockClamp01(phase);
  const attack = 1 - Math.pow(1 - Math.min(1, p / 0.035), 4);
  const release = Math.pow(Math.max(0, 1 - p), 1.85);
  const snapEnvelope = attack * release;
  const sweepTurns = (3.15 * (1 - Math.exp(-4.2 * p)) / (1 - Math.exp(-4.2))) + (0.18 * Math.sin(Math.PI * p));
  const liquidBend = 0.075 * Math.sin(Math.PI * 2 * p) * Math.pow(Math.max(0, 1 - p), 1.2);
  const body = Math.sin((sweepTurns + liquidBend) * Math.PI * 2);
  const sheen = Math.sin((sweepTurns * 2.02 + 0.17) * Math.PI * 2) * 0.16 * Math.pow(Math.max(0, 1 - p), 2.8);
  return (body + sheen) * snapEnvelope * (Number(level) || 0);
}

/**
 * @returns {{ "Analog Out": number, "Digital Out": number, Out: number, Pulse: number }}
 */
function nodeGraphClockCore(state, reset, phaseOffset, rate, duty, level, sampleRate) {
  const safeReset = Number(reset) || 0;
  const safePhaseOffset = nodeGraphClockWrap01(phaseOffset);
  const safeRate = Math.max(0, Number(rate) || 0);
  const safeDuty = nodeGraphClockClamp01(duty);
  const safeLevel = Number(level) || 0;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const resetActive = safeReset > 0;
  const rawPhase = resetActive ? 0 : nodeGraphClockWrap01(state.phase);
  const phase = nodeGraphClockWrap01(rawPhase + safePhaseOffset);
  const periodSamples = safeRate > 0 ? sr / safeRate : 0;
  let digital = 0;
  if (periodSamples > 0) {
    const dutySamples = Math.round(safeDuty * periodSamples);
    const phaseSamples = phase * periodSamples;
    digital = phaseSamples < dutySamples ? safeLevel : 0;
  }
  const analog = nodeGraphClockAnalogWhipSample(phase, safeLevel);
  const nextRawPhase = nodeGraphClockWrap01(rawPhase + safeRate / sr);
  const pulse = safeRate > 0 && !resetActive && (!state.hasStarted || nextRawPhase < rawPhase) ? safeLevel : 0;
  state.hasStarted = !resetActive;
  state.phase = resetActive ? 0 : nextRawPhase;
  return {
    "Analog Out": analog,
    "Digital Out": digital,
    Out: digital,
    Pulse: pulse,
    T: pulse,
  };
}
